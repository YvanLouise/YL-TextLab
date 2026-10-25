import { describe, expect, it, vi } from 'vitest'
import { buildImageExportEntries, safeRelativePath, selectFolderImages, writeImageFolder, type OutputDirectory } from './folders'
import { createZip as createImageZip } from '../files/zip'
import { unzipSync } from 'fflate'

function fileAt(path: string, size = 1) {
  const file = new File([new Uint8Array(size)], path.split('/').at(-1)!)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}
const result = (fileName: string) => ({
  fileName, format: 'png' as const, width: 1, height: 1, durationMs: 1,
  blob: new Blob(['pixels']), originalBytes: 6, targetBytes: null, targetMet: null, lossless: true,
})

function memoryDirectory(name = 'target') {
  const directories = new Map<string, OutputDirectory>()
  const files = new Map<string, Blob>()
  const directory: OutputDirectory = {
    name,
    getDirectoryHandle: vi.fn(async (key, options) => {
      if (files.has(key)) throw new DOMException('file exists', 'TypeMismatchError')
      if (!directories.has(key)) {
        if (!options?.create) throw new DOMException('not found', 'NotFoundError')
        directories.set(key, memoryDirectory(key).directory)
      }
      return directories.get(key)!
    }),
    getFileHandle: vi.fn(async (key) => ({ createWritable: async () => {
      let pending: Blob | undefined
      return {
        write: async (data: Blob) => { pending = data },
        close: async () => { if (pending) files.set(key, pending) },
        abort: async () => { pending = undefined },
      }
    } })),
  }
  return { directory, directories, files }
}

describe('folder image processing', () => {
  it('imports supported images recursively beyond the single-file 20-item limit', () => {
    const files = [...Array.from({ length: 24 }, (_, i) => fileAt(`素材/sub/${i}.PNG`)), fileAt('素材/readme.txt'), fileAt('素材/animated.gif')]
    const selection = selectFolderImages(files)
    expect(selection.selected).toHaveLength(24)
    expect(selection.selected[0].relativePath).toBe('素材/sub/0.PNG')
    expect(selection.ignored).toBe(2)
    expect(selection.limited).toBe(0)
  })

  it('reports count/total-size limits and invalid paths without silently including them', () => {
    expect(selectFolderImages([fileAt('root/a.png'), fileAt('root/b.png')], 499).limited).toBe(1)
    expect(selectFolderImages([fileAt('root/a.png', 2)], 0, 500 * 1024 * 1024 - 1).limited).toBe(1)
    expect(selectFolderImages([fileAt('root/../unsafe.png')]).invalidPaths).toBe(1)
    for (const path of ['/absolute/a.png', '../a.png', 'a//b.png', 'C:/a.png', 'a\0b.png']) expect(() => safeRelativePath(path)).toThrow()
  })

  it('keeps filenames and directories, avoids duplicates and reserves existing numbered paths', () => {
    const entries = buildImageExportEntries([
      { result: result('PHOTO.JPEG'), relativePath: '素材/a/PHOTO.JPEG' },
      { result: result('PHOTO.JPEG'), relativePath: '素材/b/PHOTO.JPEG' },
      { result: result('PHOTO.JPEG'), relativePath: '素材/a/PHOTO.JPEG' },
      { result: result('PHOTO.JPEG'), relativePath: '素材/a/2/PHOTO.JPEG' },
    ], true)
    expect(entries.map((entry) => entry.path)).toEqual([
      '素材-lossless/a/PHOTO.JPEG', '素材-lossless/b/PHOTO.JPEG',
      '素材-lossless/a/3/PHOTO.JPEG', '素材-lossless/a/2/PHOTO.JPEG',
    ])
  })

  it('retains separate roots when several folders are combined', () => {
    expect(buildImageExportEntries([
      { result: result('a.png'), relativePath: 'one/sub/a.png' },
      { result: result('a.png'), relativePath: 'two/a.png' },
    ], true).map((entry) => entry.path)).toEqual(['YL-Images-lossless/one/sub/a.png', 'YL-Images-lossless/two/a.png'])
  })

  it('writes a new result directory and never touches an existing output folder', async () => {
    const parent = memoryDirectory()
    const existing = memoryDirectory('素材-lossless')
    parent.directories.set('素材-lossless', existing.directory)
    const progress = vi.fn()
    const entries = buildImageExportEntries([{ result: result('原图.PNG'), relativePath: '素材/sub/原图.PNG' }], true)
    const output = await writeImageFolder(parent.directory, entries, undefined, progress)
    expect(output).toMatchObject({ folderName: '素材-lossless-2', written: 1, failures: [], stopped: false })
    expect(existing.directory.getFileHandle).not.toHaveBeenCalled()
    expect(existing.directory.getDirectoryHandle).not.toHaveBeenCalled()
    const outputDir = parent.directories.get('素材-lossless-2')!
    expect(outputDir.getDirectoryHandle).toHaveBeenCalledWith('sub', { create: true })
    const sub = await outputDir.getDirectoryHandle('sub')
    expect(sub.getFileHandle).toHaveBeenCalledWith('原图.PNG', { create: true })
    expect(progress).toHaveBeenCalledWith(0, 1, '素材-lossless/sub/原图.PNG')
  })

  it('continues after a file write fails and stops without processing remaining entries', async () => {
    const parent = memoryDirectory()
    const output = memoryDirectory('out')
    parent.directory.getDirectoryHandle = vi.fn(async (_name, options) => {
      if (!options?.create) throw new DOMException('', 'NotFoundError')
      return output.directory
    })
    vi.mocked(output.directory.getFileHandle).mockRejectedValueOnce(new Error('write denied'))
    const entries = [{ path: 'out/a.png', blob: new Blob(['a']) }, { path: 'out/b.png', blob: new Blob(['b']) }]
    const complete = await writeImageFolder(parent.directory, entries)
    expect(complete).toMatchObject({ written: 1, failures: ['out/a.png'] })
    const controller = new AbortController()
    const stopped = await writeImageFolder(parent.directory, entries, controller.signal, () => controller.abort())
    expect(stopped).toMatchObject({ written: 0, stopped: true })
  })

  it('creates a ZIP with directory paths and exact file bytes', async () => {
    const zip = await createImageZip([{ path: 'root/sub/原图.PNG', blob: new Blob(['png']) }, { path: 'root/empty.webp', blob: new Blob() }])
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()))
    expect(Object.keys(entries)).toEqual(['root/sub/原图.PNG', 'root/empty.webp'])
    expect(new TextDecoder().decode(entries['root/sub/原图.PNG'])).toBe('png')
    expect(entries['root/empty.webp']).toHaveLength(0)
  })

  it('can cancel ZIP creation without processing more files', async () => {
    const controller = new AbortController()
    const entries = [{ path: 'root/a.png', blob: new Blob(['a']) }, { path: 'root/b.png', blob: new Blob(['b']) }]
    const progress = vi.fn(() => controller.abort())
    await expect(createImageZip(entries, controller.signal, progress)).rejects.toThrow(/停止 ZIP/)
    expect(progress).toHaveBeenCalledTimes(1)
  })
})
