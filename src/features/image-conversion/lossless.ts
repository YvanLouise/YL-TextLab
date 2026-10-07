import { ImageConversionError, MAX_IMAGE_DIMENSION } from './types'

type LosslessFormat = 'png' | 'jpeg' | 'webp'
const ascii = (data: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...data.subarray(offset, offset + length))
const invalid = () => new ImageConversionError('INVALID_IMAGE', '图片文件结构损坏，无法安全无损优化。')
const cancelled = () => new ImageConversionError('CANCELLED', '已停止压缩。')

export function joinBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  return value >>> 0
})

export function pngCrc(data: Uint8Array) {
  let value = 0xffffffff
  for (const byte of data) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

export function pngChunk(type: string, data: Uint8Array) {
  const chunk = new Uint8Array(data.length + 12)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(Array.from(type, (char) => char.charCodeAt(0)), 4)
  chunk.set(data, 8)
  view.setUint32(chunk.length - 4, pngCrc(chunk.subarray(4, chunk.length - 4)))
  return chunk
}

function expectedPngBytes(header: Uint8Array) {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  const width = view.getUint32(0)
  const height = view.getUint32(4)
  const depth = header[8]
  const color = header[9]
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color]
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION ||
    !channels || !depths[color].includes(depth) || header[10] || header[11] || header[12] > 1) throw invalid()
  const passes = header[12] ? [
    [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
    [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
  ] : [[0, 0, 1, 1]]
  return passes.reduce((sum, [x, y, dx, dy]) => {
    const columns = Math.max(0, Math.ceil((width - x) / dx))
    const rows = Math.max(0, Math.ceil((height - y) / dy))
    return sum + (columns && rows ? rows * (1 + Math.ceil(columns * channels * depth / 8)) : 0)
  }, 0)
}

async function recompressPng(data: Uint8Array, expected: number, signal?: AbortSignal) {
  const { AsyncUnzlib, zlib } = await import('fflate')
  if (signal?.aborted) throw cancelled()
  // Feed bounded chunks to a worker and reject expansion beyond the IHDR scanline size.
  const raw = await new Promise<Uint8Array>((resolve, reject) => {
    const output = new Uint8Array(expected)
    let written = 0
    let offset = 0
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      stream.terminate()
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(output)
    }
    const abort = () => finish(cancelled())
    const pushNext = () => {
      const end = Math.min(offset + 32 * 1024, data.length)
      stream.push(data.slice(offset, end), end === data.length)
      offset = end
    }
    const stream = new AsyncUnzlib((error, chunk, final) => {
      if (settled) return
      if (error || written + chunk.length > expected) { finish(invalid()); return }
      output.set(chunk, written)
      written += chunk.length
      if (final) finish(written === expected ? undefined : invalid())
      else pushNext()
    })
    signal?.addEventListener('abort', abort, { once: true })
    pushNext()
  })
  if (signal?.aborted) throw cancelled()
  let a = 1
  let b = 0
  for (let start = 0; start < raw.length; start += 5552) {
    const end = Math.min(start + 5552, raw.length)
    for (let offset = start; offset < end; offset += 1) { a += raw[offset]; b += a }
    a %= 65521
    b %= 65521
  }
  if (data.length < 6 || ((b << 16 | a) >>> 0) !== new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(data.length - 4)) throw invalid()
  return new Promise<Uint8Array>((resolve, reject) => {
    const abort = () => { terminate(); reject(cancelled()) }
    const terminate = zlib(raw, { level: 9, consume: true }, (error, output) => {
      signal?.removeEventListener('abort', abort)
      if (error) reject(new ImageConversionError('ENCODE_FAILED', 'PNG 无损压缩失败。'))
      else resolve(output)
    })
    signal?.addEventListener('abort', abort, { once: true })
  })
}

async function optimizePng(bytes: Uint8Array, signal?: AbortSignal, onStage?: (stage: string) => void) {
  onStage?.('检查 PNG 结构与校验码')
  if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) throw invalid()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunks: { type: string; whole: Uint8Array; data: Uint8Array }[] = []
  let offset = 8
  let ended = false
  let idatEnded = false
  let idatStarted = false
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const end = offset + length + 12
    if (end > bytes.length) throw invalid()
    const type = ascii(bytes, offset + 4, 4)
    if (type === 'IDAT') {
      if (idatEnded) throw invalid()
      idatStarted = true
    } else if (idatStarted) idatEnded = true
    if (type === 'IHDR' && chunks.length || type === 'IEND' && length !== 0) throw invalid()
    const whole = bytes.subarray(offset, end)
    if (pngCrc(whole.subarray(4, whole.length - 4)) !== view.getUint32(end - 4)) throw invalid()
    chunks.push({ type, whole, data: bytes.subarray(offset + 8, end - 4) })
    offset = end
    if (type === 'IEND') { ended = true; break }
  }
  if (!ended || chunks[0]?.type !== 'IHDR' || chunks[0].data.length !== 13 ||
    !chunks.some((chunk) => chunk.type === 'IDAT')) throw invalid()
  const expected = expectedPngBytes(chunks[0].data)
  if (expected > 128 * 1024 * 1024) {
    throw new ImageConversionError('MEMORY_LIMIT', 'PNG 解压数据超过 128 MB 安全上限，已跳过以保护浏览器内存。')
  }
  const idat = joinBytes(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data))
  onStage?.('无损优化 PNG 压缩流')
  const compressed = await recompressPng(idat, expected, signal)
  // Keep the original stream when the optimizer cannot improve it.
  const replacement = pngChunk('IDAT', compressed.length < idat.length ? compressed : idat)
  const parts = [bytes.subarray(0, 8)]
  let inserted = false
  for (const chunk of chunks) {
    if (['tEXt', 'zTXt', 'iTXt', 'tIME'].includes(chunk.type)) continue
    if (chunk.type === 'IDAT') {
      if (!inserted) parts.push(replacement)
      inserted = true
    } else parts.push(chunk.whole)
  }
  return joinBytes(parts)
}

function optimizeJpeg(bytes: Uint8Array) {
  if (bytes[0] !== 255 || bytes[1] !== 216) throw invalid()
  const parts = [bytes.subarray(0, 2)]
  let offset = 2
  while (offset < bytes.length) {
    const start = offset
    if (bytes[offset++] !== 255) throw invalid()
    while (bytes[offset] === 255) offset += 1
    const marker = bytes[offset++]
    // Preserve entropy-coded scans verbatim, including progressive scans and restart markers.
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) throw invalid()
      const scanHeaderSize = bytes[offset] * 256 + bytes[offset + 1]
      if (scanHeaderSize < 2 || offset + scanHeaderSize > bytes.length) throw invalid()
      let hasEnd = false
      for (let scan = offset + scanHeaderSize; scan + 1 < bytes.length; scan += 1) {
        if (bytes[scan] === 255 && bytes[scan + 1] === 217) { hasEnd = true; break }
      }
      if (!hasEnd) throw invalid()
      parts.push(bytes.subarray(start))
      return joinBytes(parts)
    }
    if (marker === 0xd9) { parts.push(bytes.subarray(start)); return joinBytes(parts) }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.subarray(start, offset)); continue
    }
    if (offset + 2 > bytes.length) throw invalid()
    const length = bytes[offset] * 256 + bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) throw invalid()
    const prefix = marker === 0xe1 ? ascii(bytes, offset + 2, Math.min(length - 2, 40)) : ''
    const xmp = prefix.startsWith('http://ns.adobe.com/xap/1.0/\0')
    const extendedXmp = prefix.startsWith('http://ns.adobe.com/xmp/extension/\0')
    if (marker !== 0xfe && !xmp && !extendedXmp) parts.push(bytes.subarray(start, offset + length))
    offset += length
  }
  throw invalid()
}

function optimizeWebp(bytes: Uint8Array) {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') throw invalid()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = view.getUint32(4, true) + 8
  if (end > bytes.length || end < 12) throw invalid()
  const parts: Uint8Array[] = []
  let offset = 12
  let imageFound = false
  while (offset + 8 <= end) {
    const type = ascii(bytes, offset, 4)
    const length = view.getUint32(offset + 4, true)
    const next = offset + 8 + length + (length & 1)
    if (next > end) throw invalid()
    if (['VP8 ', 'VP8L', 'ANIM'].includes(type)) imageFound = true
    if (type !== 'XMP ') {
      const chunk = bytes.slice(offset, next)
      if (type === 'VP8X') {
        if (length !== 10) throw invalid()
        chunk[8] &= ~0x04
      }
      parts.push(chunk)
    }
    offset = next
  }
  if (offset !== end || !imageFound) throw invalid()
  const result = joinBytes([bytes.subarray(0, 12), ...parts])
  new DataView(result.buffer).setUint32(4, result.length - 8, true)
  return result
}

export async function optimizeLossless(bytes: Uint8Array, format: LosslessFormat, signal?: AbortSignal, onStage?: (stage: string) => void) {
  if (signal?.aborted) throw cancelled()
  onStage?.('检查与优化原始图像数据')
  const result = format === 'png' ? await optimizePng(bytes, signal, onStage)
    : format === 'jpeg' ? optimizeJpeg(bytes) : optimizeWebp(bytes)
  if (signal?.aborted) throw cancelled()
  return result.length <= bytes.length ? result : bytes
}
