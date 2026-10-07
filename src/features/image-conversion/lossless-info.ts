import { ImageConversionError, MAX_IMAGE_DIMENSION, MAX_IMAGE_FILE_SIZE } from './types'

export type LosslessFormat = 'png' | 'jpeg' | 'webp'
export interface LosslessImageInfo { format: LosslessFormat; width: number; height: number }
const ascii = (data: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...data.subarray(offset, offset + length))
const invalid = () => new ImageConversionError('INVALID_IMAGE', '图片头部损坏，无法读取尺寸。')

function dimensions(format: LosslessFormat, width: number, height: number): LosslessImageInfo {
  if (!width || !height) throw invalid()
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new ImageConversionError('DIMENSION_LIMIT', '图片宽高必须在 1–8192 像素之间。')
  }
  return { format, width, height }
}

export function readLosslessInfo(bytes: Uint8Array): LosslessImageInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) {
    if (bytes.length < 33 || view.getUint32(8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') throw invalid()
    return dimensions('png', view.getUint32(16), view.getUint32(20))
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) throw invalid()
      while (bytes[offset] === 255) offset += 1
      const marker = bytes[offset++]
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) throw invalid()
      const length = view.getUint16(offset)
      if (length < 2 || offset + length > bytes.length) throw invalid()
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) throw invalid()
        return dimensions('jpeg', view.getUint16(offset + 5), view.getUint16(offset + 3))
      }
      offset += length
    }
    throw invalid()
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    let offset = 12
    while (offset + 8 <= bytes.length) {
      const type = ascii(bytes, offset, 4)
      const length = view.getUint32(offset + 4, true)
      const payload = offset + 8
      if (payload + length > bytes.length) throw invalid()
      if (type === 'VP8X' && length === 10) {
        const uint24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)
        return dimensions('webp', uint24(payload + 4) + 1, uint24(payload + 7) + 1)
      }
      if (type === 'VP8L' && length >= 5 && bytes[payload] === 0x2f) {
        const bits = view.getUint32(payload + 1, true)
        return dimensions('webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
      }
      if (type === 'VP8 ' && length >= 10 && ascii(bytes, payload + 3, 3) === '\x9d\x01\x2a') {
        return dimensions('webp', view.getUint16(payload + 6, true) & 0x3fff, view.getUint16(payload + 8, true) & 0x3fff)
      }
      offset = payload + length + (length & 1)
    }
    throw invalid()
  }
  throw new ImageConversionError('LOSSLESS_FORMAT_UNSUPPORTED', '无损压缩支持 PNG、JPG、WebP；此格式请使用常规压缩或格式转换。')
}

export function validateLosslessFileSize(file: File) {
  if (file.size > MAX_IMAGE_FILE_SIZE) throw new ImageConversionError('FILE_SIZE_LIMIT', '单张图片不能超过 50 MB。')
  if (!file.size) throw new ImageConversionError('EMPTY_FILE', '图片文件为空。')
}

export async function inspectLosslessFile(file: File) {
  validateLosslessFileSize(file)
  // Most headers fit in 64 KB; unusually large JPEG metadata uses a full-file fallback.
  const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer())
  try { return readLosslessInfo(head) } catch (error) {
    if (file.size > head.length && (head[0] === 255 && head[1] === 216 || ascii(head, 0, 4) === 'RIFF')) {
      return readLosslessInfo(new Uint8Array(await file.arrayBuffer()))
    }
    throw error
  }
}
