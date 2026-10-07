import { ImageConversionError, MAX_FOLDER_IMAGES, MAX_FOLDER_INPUT_BYTES } from './types'
import type { ImageQueueItem } from './types'

export interface ImageExportEntry { path: string; blob: Blob }
export interface OutputDirectory {
  name: string
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OutputDirectory>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>
  }>
}
export type DirectoryPicker = (options: { mode: 'readwrite'; id: string }) => Promise<OutputDirectory>

export function safeRelativePath(value: string) {
  const parts = value.replace(/\\/g, '/').split('/')
  if (!value || parts.some((part) => !part || part === '.' || part === '..' || part.includes(':') || Array.from(part).some((char) => char.charCodeAt(0) < 32))) {
    throw new ImageConversionError('INVALID_PATH', '文件相对路径不安全，已跳过。')
  }
  return parts.join('/')
}

export function selectFolderImages(files: File[], existingCount = 0, existingBytes = 0) {
  const selected: { file: File; relativePath: string }[] = []
  let ignored = 0
  let limited = 0
  let invalidPaths = 0
  let bytes = existingBytes
  for (const file of files) {
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) { ignored += 1; continue }
    let relativePath: string
    try { relativePath = safeRelativePath(file.webkitRelativePath || file.name) } catch { invalidPaths += 1; continue }
    if (existingCount + selected.length >= MAX_FOLDER_IMAGES || bytes + file.size > MAX_FOLDER_INPUT_BYTES) {
      limited += 1
      continue
    }
    selected.push({ file, relativePath })
    bytes += file.size
  }
  return { selected, ignored, limited, invalidPaths }
}

export function folderOutputName(items: Pick<ImageQueueItem, 'relativePath'>[], suffix = 'lossless') {
  const roots = new Set(items.flatMap((item) => item.relativePath?.includes('/') ? [item.relativePath.split('/')[0]] : []))
  return `${roots.size === 1 ? [...roots][0] : 'YL-Images'}-${suffix}`
}

export function buildImageExportEntries(items: Pick<ImageQueueItem, 'result' | 'relativePath'>[], folderOutput = false): ImageExportEntry[] {
  const ready = items.filter((item) => item.result)
  const root = folderOutputName(items, ready.every((item) => item.result && 'lossless' in item.result && item.result.lossless) ? 'lossless' : 'processed')
  const roots = new Set(ready.flatMap((item) => item.relativePath?.includes('/') ? [item.relativePath.split('/')[0]] : []))
  const requested = ready.map((item) => {
    const result = item.result!
    const directory = item.relativePath?.includes('/') ? item.relativePath.slice(0, item.relativePath.lastIndexOf('/') + 1) : ''
    let path = safeRelativePath(`${directory}${result.fileName}`)
    if (folderOutput) {
      if (roots.size === 1 && directory) path = path.slice(path.indexOf('/') + 1)
      path = `${root}/${path}`
    }
    return { item, path }
  })
  const reserved = new Set(requested.map((entry) => entry.path))
  const used = new Set<string>()
  return requested.map(({ item, path }) => {
    const result = item.result!
    let unique = path
    let sequence = 2
    while (used.has(unique)) {
      const split = path.lastIndexOf('/')
      const directory = path.slice(0, split + 1)
      const name = path.slice(split + 1)
      unique = 'lossless' in result && result.lossless
        ? `${directory}${sequence}/${name}`
        : `${directory}${name.replace(/(\.[^.]+)$/, `-${sequence}$1`)}`
      sequence += 1
      if (reserved.has(unique)) unique = path
    }
    used.add(unique)
    return { path: unique, blob: result.blob }
  })
}

async function freshDirectory(parent: OutputDirectory, preferredName: string) {
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const name = suffix ? `${preferredName}-${suffix + 1}` : preferredName
    try { await parent.getDirectoryHandle(name) } catch (error) {
      const errorName = error && typeof error === 'object' && 'name' in error ? error.name : ''
      if (errorName === 'NotFoundError') {
        return parent.getDirectoryHandle(name, { create: true })
      }
      if (errorName !== 'TypeMismatchError') throw error
    }
  }
  throw new ImageConversionError('DIRECTORY_CONFLICT', '目标文件夹名称冲突过多，请选择其他目录。')
}

export async function writeImageFolder(parent: OutputDirectory, entries: ImageExportEntry[],
  signal?: AbortSignal, onProgress?: (written: number, total: number, path: string) => void) {
  if (!entries.length) throw new ImageConversionError('EMPTY_EXPORT', '没有可导出的处理结果。')
  const paths = entries.map((entry) => safeRelativePath(entry.path).split('/'))
  const rootName = paths[0][0]
  if (paths.some((parts) => parts[0] !== rootName || parts.length < 2)) {
    throw new ImageConversionError('INVALID_PATH', '导出目录结构无效。')
  }
  if (signal?.aborted) throw new ImageConversionError('CANCELLED', '已停止导出。')
  const root = await freshDirectory(parent, rootName)
  const cache = new Map<string, OutputDirectory>([['', root]])
  const failures: string[] = []
  let written = 0
  for (const [index, entry] of entries.entries()) {
    if (signal?.aborted) break
    onProgress?.(index, entries.length, entry.path)
    if (signal?.aborted) break
    let writable: Awaited<ReturnType<Awaited<ReturnType<OutputDirectory['getFileHandle']>>['createWritable']>> | undefined
    try {
      const parts = paths[index].slice(1)
      let directory = root
      let path = ''
      for (const part of parts.slice(0, -1)) {
        path = path ? `${path}/${part}` : part
        let next = cache.get(path)
        if (!next) { next = await directory.getDirectoryHandle(part, { create: true }); cache.set(path, next) }
        directory = next
      }
      const handle = await directory.getFileHandle(parts.at(-1)!, { create: true })
      writable = await handle.createWritable()
      await writable.write(entry.blob)
      if (signal?.aborted) { await writable.abort(); break }
      await writable.close()
      written += 1
    } catch {
      await writable?.abort().catch(() => undefined)
      failures.push(entry.path)
    }
  }
  return { folderName: root.name, written, failures, stopped: signal?.aborted ?? false }
}
