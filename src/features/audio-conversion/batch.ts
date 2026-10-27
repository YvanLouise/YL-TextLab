import { uniqueFileNames } from '../files/names'
import type { FileExportEntry } from '../files/zip'
import { MAX_AUDIO_BATCH_SIZE, MAX_AUDIO_FILE_SIZE, MAX_AUDIO_FILES, type AudioQueueItem } from './types'

export interface AudioImportEntry { file: File; relativePath?: string }

function safePath(value: string) {
  const parts = value.replace(/\\/g, '/').split('/')
  if (!value || parts.some(part => !part || part === '.' || part === '..' || part.includes(':')
    || Array.from(part).some(char => char.charCodeAt(0) < 32))) throw new Error('Invalid relative path')
  return parts.join('/')
}

export function selectAudioImports(entries: AudioImportEntry[], current: File[], folder: boolean) {
  const selected: AudioImportEntry[] = []
  let unsupported = 0
  let limited = 0
  let invalid = 0
  let bytes = current.reduce((sum, file) => sum + file.size, 0)
  for (const entry of entries) {
    if (folder && !/\.(wav|wave|aiff?|aifc|flac)$/i.test(entry.file.name)) { unsupported++; continue }
    let relativePath: string | undefined
    try { relativePath = entry.relativePath ? safePath(entry.relativePath) : undefined }
    catch { invalid++; continue }
    if (!entry.file.size || entry.file.size > MAX_AUDIO_FILE_SIZE || bytes + entry.file.size > MAX_AUDIO_BATCH_SIZE
      || current.length + selected.length >= MAX_AUDIO_FILES) { limited++; continue }
    selected.push({ file: entry.file, relativePath })
    bytes += entry.file.size
  }
  return { selected, unsupported, limited, invalid }
}

export function buildAudioExportEntries(items: Pick<AudioQueueItem, 'relativePath' | 'result'>[]): FileExportEntry[] {
  const ready = items.filter(item => item.result)
  const paths = ready.map(item => {
    const directory = item.relativePath?.includes('/') ? item.relativePath.slice(0, item.relativePath.lastIndexOf('/') + 1) : ''
    return safePath(`${directory}${item.result!.fileName}`)
  })
  const folders = new Set<string>()
  for (const path of paths) {
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
  }
  // Reserve directory names as well: a file must never replace a ZIP directory.
  const names = uniqueFileNames([...folders, ...paths]).slice(folders.size)
  return ready.map((item, index) => ({ path: names[index], blob: item.result!.blob }))
}

export async function collectAudioDrop(transfer: DataTransfer, signal: AbortSignal) {
  // Capture entries before the drop event's data store becomes inaccessible.
  const entries = Array.from(transfer.items ?? []).filter(item => item.kind === 'file')
    .map(item => ({ entry: item.webkitGetAsEntry?.(), file: item.getAsFile() }))
  const fallback = Array.from(transfer.files)
  const files: AudioImportEntry[] = []
  let scanned = 0
  let unreadable = 0
  let truncated = false
  const folder = entries.some(({ entry }) => entry?.isDirectory)
  const checkAbort = () => { if (signal.aborted) throw new DOMException('已停止读取文件夹。', 'AbortError') }
  const visit = async (entry: FileSystemEntry, parent: string, depth: number): Promise<void> => {
    checkAbort()
    if (++scanned > 10000 || depth > 64) { truncated = true; return }
    const path = parent ? `${parent}/${entry.name}` : entry.name
    if (entry.isFile) {
      try {
        const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
        checkAbort()
        files.push({ file, relativePath: parent ? path : undefined })
      } catch { checkAbort(); unreadable++ }
    } else if (entry.isDirectory) {
      let reader: FileSystemDirectoryReader
      try { reader = (entry as FileSystemDirectoryEntry).createReader() }
      catch { unreadable++; return }
      while (!truncated) {
        checkAbort()
        let children: FileSystemEntry[]
        try { children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject)) }
        catch { unreadable++; return }
        checkAbort()
        if (!children.length) break
        for (const child of children) { await visit(child, path, depth + 1); if (truncated) break }
      }
    }
  }
  if (!entries.length) {
    checkAbort()
    return { files: fallback.map(file => ({ file, relativePath: file.webkitRelativePath || undefined })), folder: fallback.some(file => file.webkitRelativePath), unreadable, truncated }
  }
  for (const { entry, file } of entries) {
    checkAbort()
    if (entry) await visit(entry, '', 0)
    else if (file) files.push({ file })
    if (truncated) break
  }
  return { files, folder, unreadable, truncated }
}
