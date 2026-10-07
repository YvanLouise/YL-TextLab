import { describe, expect, it } from 'vitest'
import { unzlibSync, zlibSync } from 'fflate'
import { joinBytes, optimizeLossless, pngChunk } from './lossless'

const text = (value: string) => new TextEncoder().encode(value)
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

function makePng(raw: Uint8Array, options: { depth?: number; color?: number; interlace?: number; width?: number; height?: number } = {}) {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, options.width ?? 64)
  view.setUint32(4, options.height ?? 32)
  header.set([options.depth ?? 8, options.color ?? 6, 0, 0, options.interlace ?? 0], 8)
  const compressed = zlibSync(raw, { level: 0 })
  return joinBytes([signature, pngChunk('IHDR', header), pngChunk('tEXt', text('Comment\0testing')),
    pngChunk('gAMA', new Uint8Array([0, 0, 177, 143])), pngChunk('eXIf', text('preserved-exif')),
    pngChunk('IDAT', compressed.subarray(0, 10)), pngChunk('IDAT', compressed.subarray(10)), pngChunk('IEND', new Uint8Array())])
}

function readChunks(bytes: Uint8Array) {
  const chunks = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let offset = 8; offset < bytes.length;) {
    const length = view.getUint32(offset)
    chunks.push({ type: String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)), data: bytes.slice(offset + 8, offset + 8 + length) })
    offset += length + 12
  }
  return chunks
}

function jpegSegment(marker: number, payload: Uint8Array) {
  const size = payload.length + 2
  return joinBytes([new Uint8Array([255, marker, size >> 8, size & 255]), payload])
}

function webpChunk(type: string, payload: Uint8Array) {
  const result = new Uint8Array(8 + payload.length + (payload.length & 1))
  result.set(text(type))
  new DataView(result.buffer).setUint32(4, payload.length, true)
  result.set(payload, 8)
  return result
}

function makeWebp(parts: Uint8Array[]) {
  const header = joinBytes([text('RIFF'), new Uint8Array(4), text('WEBP')])
  const result = joinBytes([header, ...parts])
  new DataView(result.buffer).setUint32(4, result.length - 8, true)
  return result
}

describe('lossless optimization', () => {
  it('reduces PNG IDAT without changing a single filtered pixel byte or render metadata', async () => {
    const raw = new Uint8Array(32 * (1 + 64 * 4))
    for (let offset = 0; offset < raw.length; offset += 257) {
      for (let pixel = offset + 1; pixel < offset + 257; pixel += 4) raw.set([20, 100, 180, 128], pixel)
    }
    const input = makePng(raw)
    const output = await optimizeLossless(input, 'png')
    expect(output.length).toBeLessThan(input.length)
    const before = readChunks(input)
    const after = readChunks(output)
    expect(unzlibSync(joinBytes(after.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)))).toEqual(raw)
    for (const type of ['IHDR', 'gAMA', 'eXIf']) expect(after.find((chunk) => chunk.type === type)).toEqual(before.find((chunk) => chunk.type === type))
    expect(after.some((chunk) => chunk.type === 'tEXt')).toBe(false)
  })

  it.each([
    { depth: 16, color: 6, width: 1, height: 1, bytes: 9 },
    { depth: 1, color: 3, width: 1, height: 1, bytes: 2 },
    { depth: 8, color: 6, width: 1, height: 1, interlace: 1, bytes: 5 },
  ])('preserves filtered bytes for depth/color/interlace variants: %j', async ({ bytes, ...options }) => {
    const raw = new Uint8Array(bytes)
    const output = await optimizeLossless(makePng(raw, options), 'png')
    expect(unzlibSync(readChunks(output).find((chunk) => chunk.type === 'IDAT')!.data)).toEqual(raw)
  })

  it('rejects corrupt PNG CRCs, truncated chunks and mismatched expansion sizes', async () => {
    const input = makePng(new Uint8Array(5), { width: 1, height: 1 })
    const corrupt = input.slice()
    corrupt[30] ^= 1
    await expect(optimizeLossless(corrupt, 'png')).rejects.toThrow(/结构损坏/)
    await expect(optimizeLossless(input.subarray(0, input.length - 3), 'png')).rejects.toThrow(/结构损坏/)
    await expect(optimizeLossless(makePng(new Uint8Array(20), { width: 1, height: 1 }), 'png')).rejects.toThrow(/结构损坏/)
  })

  it('rejects invalid zlib checksums even when PNG chunk CRC is valid', async () => {
    const input = makePng(new Uint8Array(5), { width: 1, height: 1 })
    const chunks = readChunks(input)
    const data = joinBytes(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data))
    data[data.length - 1] ^= 1
    const invalidChecksum = joinBytes([signature, ...chunks.filter((chunk) => chunk.type !== 'IDAT' && chunk.type !== 'IEND').map((chunk) => pngChunk(chunk.type, chunk.data)),
      pngChunk('IDAT', data), pngChunk('IEND', new Uint8Array())])
    await expect(optimizeLossless(invalidChecksum, 'png')).rejects.toThrow(/结构损坏/)
  })

  it('rejects disallowed PNG depth/color combinations and guards oversized expansion', async () => {
    await expect(optimizeLossless(makePng(new Uint8Array(5), { width: 1, height: 1, depth: 1, color: 6 }), 'png')).rejects.toThrow(/结构损坏/)
    await expect(optimizeLossless(makePng(new Uint8Array(5), { width: 8192, height: 8192 }), 'png')).rejects.toThrow(/128 MB/)
  })

  it('does not enlarge an already optimized PNG', async () => {
    const input = await optimizeLossless(makePng(new Uint8Array(5), { width: 1, height: 1 }), 'png')
    expect(await optimizeLossless(input, 'png')).toEqual(input)
  })

  it('handles multiple worker input chunks without changing noisy PNG scanlines', async () => {
    const raw = new Uint8Array(256 * (1 + 256 * 4))
    let seed = 17
    for (let index = 0; index < raw.length; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      raw[index] = seed >>> 24
    }
    for (let row = 0; row < 256; row += 1) raw[row * 1025] = 0
    const input = makePng(raw, { width: 256, height: 256 })
    const output = await optimizeLossless(input, 'png')
    expect(output.length).toBeLessThanOrEqual(input.length)
    expect(unzlibSync(readChunks(output).find((chunk) => chunk.type === 'IDAT')!.data)).toEqual(raw)
  })

  it('terminates a PNG worker when processing is cancelled', async () => {
    const controller = new AbortController()
    const processing = optimizeLossless(makePng(new Uint8Array(32 * 257)), 'png', controller.signal)
    setTimeout(() => controller.abort(), 1)
    await expect(processing).rejects.toThrow(/停止/)
  })

  it('preserves JPEG EXIF, ICC and scan data while stripping comments and XMP', async () => {
    const exif = jpegSegment(0xe1, text('Exif\0\0orientation-and-camera'))
    const icc = jpegSegment(0xe2, text('ICC_PROFILE\0colors'))
    const scan = new Uint8Array([255, 218, 0, 2, 11, 255, 0, 33, 255, 208, 44, 255, 217])
    const input = joinBytes([new Uint8Array([255, 216]), exif, icc, jpegSegment(0xfe, text('comment')),
      jpegSegment(0xe1, text('http://ns.adobe.com/xap/1.0/\0metadata')),
      jpegSegment(0xe1, text('http://ns.adobe.com/xmp/extension/\0metadata')), scan])
    expect(await optimizeLossless(input, 'jpeg')).toEqual(joinBytes([new Uint8Array([255, 216]), exif, icc, scan]))
  })

  it('preserves a JPEG byte-for-byte when it has no removable metadata', async () => {
    const input = new Uint8Array([255, 216, 255, 218, 0, 2, 45, 255, 217])
    expect(await optimizeLossless(input, 'jpeg')).toEqual(input)
    await expect(optimizeLossless(new Uint8Array([255, 216, 255, 225, 0, 20]), 'jpeg')).rejects.toThrow(/结构损坏/)
    await expect(optimizeLossless(new Uint8Array([255, 216, 255, 218, 0, 2, 45]), 'jpeg')).rejects.toThrow(/结构损坏/)
  })

  it.each(['VP8 ', 'VP8L'])('preserves WebP %s image/alpha/EXIF/ICC data and updates XMP flags and RIFF length', async (encoding) => {
    const vp8x = new Uint8Array(10)
    vp8x[0] = 0x1c
    const retained = [webpChunk('ICCP', text('profile')), webpChunk('ALPH', new Uint8Array([0, 128])),
      webpChunk(encoding, new Uint8Array([3, 9, 18])), webpChunk('EXIF', text('orientation'))]
    const input = makeWebp([webpChunk('VP8X', vp8x), ...retained, webpChunk('XMP ', text('metadata'))])
    const output = await optimizeLossless(input, 'webp')
    vp8x[0] &= ~4
    expect(output).toEqual(makeWebp([webpChunk('VP8X', vp8x), ...retained]))
  })

  it('rejects WebP length errors and honours cancellation', async () => {
    const input = makeWebp([webpChunk('VP8 ', new Uint8Array([1, 2, 3]))])
    await expect(optimizeLossless(input.subarray(0, input.length - 1), 'webp')).rejects.toThrow(/结构损坏/)
    const controller = new AbortController()
    controller.abort()
    await expect(optimizeLossless(input, 'webp', controller.signal)).rejects.toThrow(/停止/)
  })
})
