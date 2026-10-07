import { Zip, ZipPassThrough } from 'fflate'
import type { ImageExportEntry } from './folders'
import { ImageConversionError } from './types'

export async function createImageZip(entries: ImageExportEntry[], signal?: AbortSignal,
  onProgress?: (index: number, total: number, path: string) => void) {
  const chunks: ArrayBuffer[] = []
  let error: Error | null = null
  const archive = new Zip((failure, data) => {
    if (failure) error = failure
    else chunks.push(new Uint8Array(data).buffer)
  })
  const checkAbort = () => { if (signal?.aborted) throw new ImageConversionError('CANCELLED', '已停止 ZIP 打包。') }
  try {
    for (const [index, entry] of entries.entries()) {
      checkAbort()
      onProgress?.(index, entries.length, entry.path)
      const file = new ZipPassThrough(entry.path)
      archive.add(file)
      if (!entry.blob.size) file.push(new Uint8Array(), true)
      for (let offset = 0; offset < entry.blob.size; offset += 1024 * 1024) {
        checkAbort()
        const end = Math.min(offset + 1024 * 1024, entry.blob.size)
        const bytes = new Uint8Array(await entry.blob.slice(offset, end).arrayBuffer())
        checkAbort()
        file.push(bytes, end === entry.blob.size)
        if (error) throw error
      }
    }
    checkAbort()
    archive.end()
    if (error) throw error
    return new Blob(chunks, { type: 'application/zip' })
  } catch (failure) {
    archive.terminate()
    throw failure
  }
}
