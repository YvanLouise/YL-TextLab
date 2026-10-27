import { AudioConversionError } from './types'

export interface AudioChunk { id: string; offset: number; size: number }

export async function readAudioChunks(file: Blob, format: 'wav' | 'aiff') {
  const invalid = (): never => { throw new AudioConversionError('INVALID_LOSSLESS_INPUT', '无法完整读取音频参数，文件可能已损坏；未生成无损压缩结果。') }
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const tag = (bytes: Uint8Array, offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  const littleEndian = format === 'wav'
  const kind = tag(header, 8)
  if (header.length !== 12 || tag(header, 0) !== (littleEndian ? 'RIFF' : 'FORM')
    || !(littleEndian ? kind === 'WAVE' : ['AIFF', 'AIFC'].includes(kind))) invalid()
  const end = new DataView(header.buffer).getUint32(4, littleEndian) + 8
  if (end < 12 || end > file.size) invalid()
  const chunks: AudioChunk[] = []
  const unique = new Set<string>()
  let at = 12
  while (at < end) {
    if (at + 8 > end || chunks.length >= 4096) invalid()
    const bytes = new Uint8Array(await file.slice(at, at + 8).arrayBuffer())
    if (bytes.length !== 8) invalid()
    const size = new DataView(bytes.buffer).getUint32(4, littleEndian)
    const id = tag(bytes, 0)
    if (at + 8 + size + size % 2 > end) invalid()
    if (['fmt ', 'data', 'COMM', 'SSND'].includes(id)) {
      if (unique.has(id)) invalid()
      unique.add(id)
    }
    chunks.push({ id, offset: at + 8, size })
    // Seek over audio payloads instead of allocating the complete recording.
    at += 8 + size + size % 2
  }
  return { kind, chunks }
}
