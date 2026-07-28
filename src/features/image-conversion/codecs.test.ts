import { describe, expect, it } from 'vitest'
import {
  decodeDds,
  decodeTga,
  detectImageFormat,
  encodeBmp,
  encodeDds,
  encodeIco,
  encodeTga,
  extractBestIcoEntry,
  outputFileName,
} from './codecs'
import { flattenAlpha } from './engine'
import type { DecodedImage } from './types'

const image: DecodedImage = {
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 120, 255, 128,
  ]),
}

describe('image format helpers', () => {
  it('detects signatures and creates output names', () => {
    expect(detectImageFormat(new Uint8Array([0x44, 0x44, 0x53, 0x20]))).toBe('dds')
    expect(detectImageFormat(new Uint8Array([0, 0, 1, 0]))).toBe('ico')
    expect(detectImageFormat(new Uint8Array(), 'texture.tga')).toBe('tga')
    expect(outputFileName('hero.final.png', 'jpeg')).toBe('hero.final.jpg')
  })

  it('flattens transparency over the selected background', () => {
    const flattened = flattenAlpha(image, '#ffffff')
    expect(Array.from(flattened.data.slice(4))).toEqual([127, 187, 255, 255])
  })
})

describe('binary encoders', () => {
  it('writes a 24-bit BMP header and dimensions', () => {
    const bytes = encodeBmp(image)
    const view = new DataView(bytes.buffer)
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('BM')
    expect(view.getInt32(18, true)).toBe(2)
    expect(view.getInt32(22, true)).toBe(1)
    expect(view.getUint16(28, true)).toBe(24)
  })

  it('round-trips 32-bit RLE TGA pixels', () => {
    const decoded = decodeTga(encodeTga(image))
    expect(decoded.width).toBe(2)
    expect(decoded.height).toBe(1)
    expect(Array.from(decoded.data)).toEqual(Array.from(image.data))
  })

  it('round-trips uncompressed RGBA DDS pixels', () => {
    const bytes = encodeDds(image)
    const decoded = decodeDds(bytes)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('DDS ')
    expect(Array.from(decoded.data)).toEqual(Array.from(image.data))
  })

  it('decodes a DXT1 color block', () => {
    const bytes = new Uint8Array(136)
    const view = new DataView(bytes.buffer)
    bytes.set([0x44, 0x44, 0x53, 0x20])
    view.setUint32(4, 124, true)
    view.setUint32(12, 4, true)
    view.setUint32(16, 4, true)
    view.setUint32(76, 32, true)
    view.setUint32(80, 0x4, true)
    bytes.set([0x44, 0x58, 0x54, 0x31], 84)
    view.setUint16(128, 0xf800, true)
    view.setUint16(130, 0, true)
    const decoded = decodeDds(bytes)
    expect(Array.from(decoded.data.slice(0, 4))).toEqual([255, 0, 0, 255])
  })

  it.each(['DXT3', 'DXT5'])('decodes a %s block with alpha', (fourCC) => {
    const bytes = new Uint8Array(144)
    const view = new DataView(bytes.buffer)
    bytes.set([0x44, 0x44, 0x53, 0x20])
    view.setUint32(4, 124, true)
    view.setUint32(12, 4, true)
    view.setUint32(16, 4, true)
    view.setUint32(76, 32, true)
    view.setUint32(80, 0x4, true)
    bytes.set(Array.from(fourCC).map((letter) => letter.charCodeAt(0)), 84)
    if (fourCC === 'DXT3') bytes.fill(0xff, 128, 136)
    else bytes[128] = 255
    view.setUint16(136, 0xf800, true)
    view.setUint16(138, 0, true)
    expect(Array.from(decodeDds(bytes).data.slice(0, 4))).toEqual([255, 0, 0, 255])
  })

  it('packages and extracts the largest PNG ICO layer', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])
    const ico = encodeIco([
      { width: 16, height: 16, png },
      { width: 256, height: 256, png },
    ])
    const best = extractBestIcoEntry(ico)
    expect(best.kind).toBe('png')
    if (best.kind !== 'png') throw new Error('Expected a PNG ICO entry')
    expect(best.width).toBe(256)
    expect(ico[6 + 16]).toBe(0)
  })
})
