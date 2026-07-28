import { ImageConversionError, type DecodedImage, type ImageInputFormat } from './types'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

export function detectImageFormat(bytes: Uint8Array, fileName = ''): ImageInputFormat | null {
  if (hasBytes(bytes, 0, PNG_SIGNATURE)) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'
  if (ascii(bytes, 0, 2) === 'BM') return 'bmp'
  if (ascii(bytes, 0, 4) === 'GIF8') return 'gif'
  if (ascii(bytes, 0, 4) === 'DDS ') return 'dds'
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'ico'
  if (ascii(bytes, 4, 4) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 4))) return 'avif'

  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (extension === 'tga') return 'tga'
  if (extension && ['png', 'webp', 'bmp', 'gif', 'avif', 'ico', 'dds'].includes(extension)) {
    return extension as ImageInputFormat
  }
  return null
}

export function outputExtension(format: string) {
  return format === 'jpeg' ? 'jpg' : format
}

export function outputMime(format: string) {
  const mime: Record<string, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    tga: 'image/x-tga',
    dds: 'image/vnd-ms.dds',
  }
  return mime[format] ?? 'application/octet-stream'
}

export function outputFileName(inputName: string, format: string) {
  const base = inputName.replace(/\.[^.]+$/, '') || 'image'
  return `${base}.${outputExtension(format)}`
}

export function encodeBmp(image: DecodedImage) {
  const { width, height, data } = image
  const rowStride = Math.ceil((width * 3) / 4) * 4
  const pixelSize = rowStride * height
  const bytes = new Uint8Array(54 + pixelSize)
  const view = new DataView(bytes.buffer)
  bytes[0] = 0x42
  bytes[1] = 0x4d
  view.setUint32(2, bytes.length, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true)
  view.setUint32(34, pixelSize, true)
  view.setInt32(38, 2835, true)
  view.setInt32(42, 2835, true)

  for (let y = 0; y < height; y += 1) {
    const targetRow = 54 + (height - 1 - y) * rowStride
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4
      const target = targetRow + x * 3
      bytes[target] = data[source + 2]
      bytes[target + 1] = data[source + 1]
      bytes[target + 2] = data[source]
    }
  }
  return bytes
}

export function decodeBmp(bytes: Uint8Array): DecodedImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (ascii(bytes, 0, 2) !== 'BM' || bytes.length < 54) {
    throw new ImageConversionError('INVALID_BMP', 'BMP 文件头无效。')
  }
  const pixelOffset = view.getUint32(10, true)
  const width = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const height = Math.abs(rawHeight)
  const bpp = view.getUint16(28, true)
  const compression = view.getUint32(30, true)
  if (width <= 0 || height <= 0 || ![24, 32].includes(bpp) || compression !== 0) {
    throw new ImageConversionError('UNSUPPORTED_BMP', '仅支持未压缩的 24/32 位 BMP。')
  }
  const rowStride = Math.ceil((width * (bpp / 8)) / 4) * 4
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceY = rawHeight > 0 ? height - 1 - y : y
    const row = pixelOffset + sourceY * rowStride
    for (let x = 0; x < width; x += 1) {
      const source = row + x * (bpp / 8)
      const target = (y * width + x) * 4
      data[target] = bytes[source + 2]
      data[target + 1] = bytes[source + 1]
      data[target + 2] = bytes[source]
      data[target + 3] = bpp === 32 ? bytes[source + 3] || 255 : 255
    }
  }
  return { width, height, data }
}

function pixelsEqual(data: Uint8ClampedArray, a: number, b: number) {
  const first = a * 4
  const second = b * 4
  return (
    data[first] === data[second] &&
    data[first + 1] === data[second + 1] &&
    data[first + 2] === data[second + 2] &&
    data[first + 3] === data[second + 3]
  )
}

function pushTgaPixel(target: number[], data: Uint8ClampedArray, pixel: number) {
  const offset = pixel * 4
  target.push(data[offset + 2], data[offset + 1], data[offset], data[offset + 3])
}

export function encodeTga(image: DecodedImage) {
  const body: number[] = []
  const pixelCount = image.width * image.height
  let pixel = 0
  while (pixel < pixelCount) {
    let run = 1
    while (run < 128 && pixel + run < pixelCount && pixelsEqual(image.data, pixel, pixel + run)) run += 1
    if (run >= 2) {
      body.push(0x80 | (run - 1))
      pushTgaPixel(body, image.data, pixel)
      pixel += run
      continue
    }

    const rawStart = pixel
    pixel += 1
    while (pixel - rawStart < 128 && pixel < pixelCount) {
      let nextRun = 1
      while (nextRun < 2 && pixel + nextRun < pixelCount && pixelsEqual(image.data, pixel, pixel + nextRun)) nextRun += 1
      if (nextRun >= 2) break
      pixel += 1
    }
    body.push(pixel - rawStart - 1)
    for (let index = rawStart; index < pixel; index += 1) pushTgaPixel(body, image.data, index)
  }

  const bytes = new Uint8Array(18 + body.length)
  const view = new DataView(bytes.buffer)
  bytes[2] = 10
  view.setUint16(12, image.width, true)
  view.setUint16(14, image.height, true)
  bytes[16] = 32
  bytes[17] = 0x28
  bytes.set(body, 18)
  return bytes
}

export function decodeTga(bytes: Uint8Array): DecodedImage {
  if (bytes.length < 18) throw new ImageConversionError('INVALID_TGA', 'TGA 文件头无效。')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const idLength = bytes[0]
  const colorMapType = bytes[1]
  const imageType = bytes[2]
  const width = view.getUint16(12, true)
  const height = view.getUint16(14, true)
  const bpp = bytes[16]
  const descriptor = bytes[17]
  if (colorMapType !== 0 || ![2, 10].includes(imageType) || ![24, 32].includes(bpp) || !width || !height) {
    throw new ImageConversionError('UNSUPPORTED_TGA', '仅支持 24/32 位未压缩或 RLE 真彩 TGA。')
  }

  const pixelBytes = bpp / 8
  const raw = new Uint8Array(width * height * pixelBytes)
  let source = 18 + idLength
  let target = 0
  if (imageType === 2) {
    raw.set(bytes.subarray(source, source + raw.length))
  } else {
    while (target < raw.length && source < bytes.length) {
      const packet = bytes[source++]
      const count = (packet & 0x7f) + 1
      if (packet & 0x80) {
        const pixelData = bytes.slice(source, source + pixelBytes)
        source += pixelBytes
        for (let index = 0; index < count; index += 1) {
          raw.set(pixelData, target)
          target += pixelBytes
        }
      } else {
        const length = count * pixelBytes
        raw.set(bytes.subarray(source, source + length), target)
        source += length
        target += length
      }
    }
  }

  const topOrigin = Boolean(descriptor & 0x20)
  const rightOrigin = Boolean(descriptor & 0x10)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const fileX = index % width
    const fileY = Math.floor(index / width)
    const x = rightOrigin ? width - 1 - fileX : fileX
    const y = topOrigin ? fileY : height - 1 - fileY
    const sourceOffset = index * pixelBytes
    const targetOffset = (y * width + x) * 4
    data[targetOffset] = raw[sourceOffset + 2]
    data[targetOffset + 1] = raw[sourceOffset + 1]
    data[targetOffset + 2] = raw[sourceOffset]
    data[targetOffset + 3] = pixelBytes === 4 ? raw[sourceOffset + 3] : 255
  }
  return { width, height, data }
}

function rgb565(value: number) {
  return [
    Math.round(((value >> 11) & 31) * 255 / 31),
    Math.round(((value >> 5) & 63) * 255 / 63),
    Math.round((value & 31) * 255 / 31),
    255,
  ]
}

function colorPalette(c0: number, c1: number, forceFourColor: boolean) {
  const first = rgb565(c0)
  const second = rgb565(c1)
  if (c0 > c1 || forceFourColor) {
    return [
      first,
      second,
      first.map((value, i) => i === 3 ? 255 : Math.round((2 * value + second[i]) / 3)),
      first.map((value, i) => i === 3 ? 255 : Math.round((value + 2 * second[i]) / 3)),
    ]
  }
  return [
    first,
    second,
    first.map((value, i) => i === 3 ? 255 : Math.round((value + second[i]) / 2)),
    [0, 0, 0, 0],
  ]
}

function writeBlockPixel(
  output: Uint8ClampedArray,
  width: number,
  height: number,
  blockX: number,
  blockY: number,
  pixel: number,
  color: number[],
  alpha = color[3],
) {
  const x = blockX * 4 + (pixel % 4)
  const y = blockY * 4 + Math.floor(pixel / 4)
  if (x >= width || y >= height) return
  const target = (y * width + x) * 4
  output[target] = color[0]
  output[target + 1] = color[1]
  output[target + 2] = color[2]
  output[target + 3] = alpha
}

function decodeBcColorBlock(
  bytes: Uint8Array,
  offset: number,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  blockX: number,
  blockY: number,
  forceFourColor: boolean,
  alphaValues?: number[],
) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const colors = colorPalette(view.getUint16(offset, true), view.getUint16(offset + 2, true), forceFourColor)
  const indices = view.getUint32(offset + 4, true)
  for (let pixel = 0; pixel < 16; pixel += 1) {
    const color = colors[(indices >>> (pixel * 2)) & 3]
    writeBlockPixel(output, width, height, blockX, blockY, pixel, color, alphaValues?.[pixel])
  }
}

function decodeBc3Alpha(bytes: Uint8Array, offset: number) {
  const a0 = bytes[offset]
  const a1 = bytes[offset + 1]
  const palette = [a0, a1]
  if (a0 > a1) {
    for (let index = 1; index <= 6; index += 1) palette.push(Math.round(((7 - index) * a0 + index * a1) / 7))
  } else {
    for (let index = 1; index <= 4; index += 1) palette.push(Math.round(((5 - index) * a0 + index * a1) / 5))
    palette.push(0, 255)
  }
  let packed = 0n
  for (let index = 0; index < 6; index += 1) packed |= BigInt(bytes[offset + 2 + index]) << BigInt(index * 8)
  return Array.from({ length: 16 }, (_, index) => palette[Number((packed >> BigInt(index * 3)) & 7n)])
}

function extractMasked(value: number, mask: number, fallback: number) {
  if (!mask) return fallback
  let shift = 0
  while (((mask >>> shift) & 1) === 0) shift += 1
  const maximum = mask >>> shift
  return Math.round((((value & mask) >>> shift) * 255) / maximum)
}

export function decodeDds(bytes: Uint8Array): DecodedImage {
  if (bytes.length < 128 || ascii(bytes, 0, 4) !== 'DDS ') {
    throw new ImageConversionError('INVALID_DDS', 'DDS 文件头无效。')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(4, true) !== 124 || view.getUint32(76, true) !== 32) {
    throw new ImageConversionError('INVALID_DDS', 'DDS 文件头结构不受支持。')
  }
  const height = view.getUint32(12, true)
  const width = view.getUint32(16, true)
  const caps2 = view.getUint32(112, true)
  if (!width || !height || (caps2 & 0x00fe0200) !== 0) {
    throw new ImageConversionError('UNSUPPORTED_DDS', '仅支持普通二维 DDS 纹理。')
  }
  const pixelFlags = view.getUint32(80, true)
  const fourCC = ascii(bytes, 84, 4)
  const data = new Uint8ClampedArray(width * height * 4)
  let offset = 128

  if (pixelFlags & 0x4) {
    if (fourCC === 'DX10') throw new ImageConversionError('UNSUPPORTED_DDS', '暂不支持 DX10/BC7 DDS。')
    const blockBytes = fourCC === 'DXT1' ? 8 : 16
    if (!['DXT1', 'DXT3', 'DXT5'].includes(fourCC)) {
      throw new ImageConversionError('UNSUPPORTED_DDS', `暂不支持 ${fourCC || '未知'} DDS 压缩格式。`)
    }
    const blocksWide = Math.ceil(width / 4)
    const blocksHigh = Math.ceil(height / 4)
    for (let blockY = 0; blockY < blocksHigh; blockY += 1) {
      for (let blockX = 0; blockX < blocksWide; blockX += 1) {
        if (offset + blockBytes > bytes.length) throw new ImageConversionError('INVALID_DDS', 'DDS 像素数据不完整。')
        if (fourCC === 'DXT1') {
          decodeBcColorBlock(bytes, offset, data, width, height, blockX, blockY, false)
        } else if (fourCC === 'DXT3') {
          const alpha = Array.from({ length: 16 }, (_, pixel) => {
            const value = bytes[offset + Math.floor(pixel / 2)]
            const nibble = pixel % 2 === 0 ? value & 0xf : value >> 4
            return nibble * 17
          })
          decodeBcColorBlock(bytes, offset + 8, data, width, height, blockX, blockY, true, alpha)
        } else {
          decodeBcColorBlock(bytes, offset + 8, data, width, height, blockX, blockY, true, decodeBc3Alpha(bytes, offset))
        }
        offset += blockBytes
      }
    }
    return { width, height, data }
  }

  const bpp = view.getUint32(88, true)
  if (!(pixelFlags & 0x40) || ![24, 32].includes(bpp)) {
    throw new ImageConversionError('UNSUPPORTED_DDS', '仅支持 24/32 位 RGBA/BGRA DDS。')
  }
  const masks = [
    view.getUint32(92, true),
    view.getUint32(96, true),
    view.getUint32(100, true),
    view.getUint32(104, true),
  ]
  const pixelBytes = bpp / 8
  const pitch = view.getUint32(20, true)
  const rowStride = Math.max(width * pixelBytes, pitch || 0)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = offset + y * rowStride + x * pixelBytes
      if (source + pixelBytes > bytes.length) throw new ImageConversionError('INVALID_DDS', 'DDS 像素数据不完整。')
      const value = pixelBytes === 4
        ? view.getUint32(source, true)
        : bytes[source] | (bytes[source + 1] << 8) | (bytes[source + 2] << 16)
      const target = (y * width + x) * 4
      data[target] = extractMasked(value, masks[0], 0)
      data[target + 1] = extractMasked(value, masks[1], 0)
      data[target + 2] = extractMasked(value, masks[2], 0)
      data[target + 3] = extractMasked(value, masks[3], 255)
    }
  }
  return { width, height, data }
}

export function encodeDds(image: DecodedImage) {
  const bytes = new Uint8Array(128 + image.data.length)
  const view = new DataView(bytes.buffer)
  bytes.set([0x44, 0x44, 0x53, 0x20])
  view.setUint32(4, 124, true)
  view.setUint32(8, 0x100f, true)
  view.setUint32(12, image.height, true)
  view.setUint32(16, image.width, true)
  view.setUint32(20, image.width * 4, true)
  view.setUint32(76, 32, true)
  view.setUint32(80, 0x41, true)
  view.setUint32(88, 32, true)
  view.setUint32(92, 0x000000ff, true)
  view.setUint32(96, 0x0000ff00, true)
  view.setUint32(100, 0x00ff0000, true)
  view.setUint32(104, 0xff000000, true)
  view.setUint32(108, 0x1000, true)
  bytes.set(image.data, 128)
  return bytes
}

export interface IcoEntryPayload {
  width: number
  height: number
  png: Uint8Array
}

export function encodeIco(entries: IcoEntryPayload[]) {
  const headerSize = 6 + entries.length * 16
  const totalSize = headerSize + entries.reduce((sum, entry) => sum + entry.png.length, 0)
  const bytes = new Uint8Array(totalSize)
  const view = new DataView(bytes.buffer)
  view.setUint16(2, 1, true)
  view.setUint16(4, entries.length, true)
  let dataOffset = headerSize
  entries.forEach((entry, index) => {
    const directory = 6 + index * 16
    bytes[directory] = entry.width >= 256 ? 0 : entry.width
    bytes[directory + 1] = entry.height >= 256 ? 0 : entry.height
    view.setUint16(directory + 4, 1, true)
    view.setUint16(directory + 6, 32, true)
    view.setUint32(directory + 8, entry.png.length, true)
    view.setUint32(directory + 12, dataOffset, true)
    bytes.set(entry.png, dataOffset)
    dataOffset += entry.png.length
  })
  return bytes
}

export type BestIcoEntry =
  | { kind: 'png'; bytes: Uint8Array; width: number; height: number }
  | { kind: 'rgba'; image: DecodedImage }

export function extractBestIcoEntry(bytes: Uint8Array): BestIcoEntry {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 22 || view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
    throw new ImageConversionError('INVALID_ICO', 'ICO 文件头无效。')
  }
  const count = view.getUint16(4, true)
  if (!count || bytes.length < 6 + count * 16) throw new ImageConversionError('INVALID_ICO', 'ICO 图层目录无效。')
  let best = 6
  let bestArea = 0
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16
    const width = bytes[entry] || 256
    const height = bytes[entry + 1] || 256
    if (width * height > bestArea) {
      bestArea = width * height
      best = entry
    }
  }
  const width = bytes[best] || 256
  const height = bytes[best + 1] || 256
  const size = view.getUint32(best + 8, true)
  const offset = view.getUint32(best + 12, true)
  if (offset + size > bytes.length) throw new ImageConversionError('INVALID_ICO', 'ICO 图层数据不完整。')
  const payload = bytes.slice(offset, offset + size)
  if (hasBytes(payload, 0, PNG_SIGNATURE)) return { kind: 'png', bytes: payload, width, height }

  const dib = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const headerSize = dib.getUint32(0, true)
  const bpp = dib.getUint16(14, true)
  if (headerSize < 40 || ![24, 32].includes(bpp)) {
    throw new ImageConversionError('UNSUPPORTED_ICO', '仅支持 PNG、24 位或 32 位 ICO 图层。')
  }
  const pixelBytes = bpp / 8
  const rowStride = Math.ceil((width * pixelBytes) / 4) * 4
  const pixelOffset = headerSize
  const maskStride = Math.ceil(width / 32) * 4
  const maskOffset = pixelOffset + rowStride * height
  const data = new Uint8ClampedArray(width * height * 4)
  let hasAlpha = false
  for (let y = 0; y < height; y += 1) {
    const row = pixelOffset + (height - 1 - y) * rowStride
    for (let x = 0; x < width; x += 1) {
      const source = row + x * pixelBytes
      const target = (y * width + x) * 4
      data[target] = payload[source + 2]
      data[target + 1] = payload[source + 1]
      data[target + 2] = payload[source]
      data[target + 3] = pixelBytes === 4 ? payload[source + 3] : 255
      if (data[target + 3]) hasAlpha = true
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4 + 3
      if (bpp === 32 && !hasAlpha) data[target] = 255
      const maskByte = payload[maskOffset + (height - 1 - y) * maskStride + Math.floor(x / 8)]
      if (maskByte & (0x80 >> (x % 8))) data[target] = 0
    }
  }
  return { kind: 'rgba', image: { width, height, data } }
}
