import { describe, expect, it } from 'vitest'
import { inspectLosslessFile, readLosslessInfo } from './lossless-info'
import { pngChunk, joinBytes } from './lossless'

describe('lossless header inspection', () => {
  it('reads PNG dimensions without decoding a pixel canvas', async () => {
    const header = new Uint8Array(13)
    const view = new DataView(header.buffer)
    view.setUint32(0, 640)
    view.setUint32(4, 360)
    header.set([8, 6], 8)
    const bytes = joinBytes([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header)])
    expect(readLosslessInfo(bytes)).toEqual({ format: 'png', width: 640, height: 360 })
    expect(await inspectLosslessFile(new File([bytes], 'sample.png'))).toEqual({ format: 'png', width: 640, height: 360 })
    view.setUint32(0, 8193)
    await expect(inspectLosslessFile(new File([joinBytes([bytes.subarray(0, 8), pngChunk('IHDR', header)])], 'large.png'))).rejects.toThrow(/8192/)
  })

  it('reads baseline and progressive JPEG dimensions past optional metadata', () => {
    for (const marker of [0xc0, 0xc2]) {
      const bytes = new Uint8Array([255, 216, 255, 225, 0, 4, 1, 2, 255, marker, 0, 8, 8, 0, 32, 0, 64, 3])
      expect(readLosslessInfo(bytes)).toEqual({ format: 'jpeg', width: 64, height: 32 })
    }
  })

  it.each(['VP8X', 'VP8L', 'VP8 '])('reads WebP %s dimensions', (type) => {
    const data = new Uint8Array(30)
    const view = new DataView(data.buffer)
    data.set(new TextEncoder().encode('RIFF'), 0)
    view.setUint32(4, 22, true)
    data.set(new TextEncoder().encode('WEBP' + type), 8)
    view.setUint32(16, 10, true)
    if (type === 'VP8X') { data[24] = 63; data[27] = 31 }
    else if (type === 'VP8L') { data[20] = 47; view.setUint32(21, 63 | (31 << 14), true) }
    else { data.set([0x9d, 1, 0x2a], 23); view.setUint16(26, 64, true); view.setUint16(28, 32, true) }
    expect(readLosslessInfo(data)).toEqual({ format: 'webp', width: 64, height: 32 })
  })

  it('rejects unsupported, truncated, empty and oversized input', async () => {
    expect(() => readLosslessInfo(new Uint8Array([71, 73, 70]))).toThrow(/无损压缩支持/)
    expect(() => readLosslessInfo(new Uint8Array([255, 216, 255, 225, 0, 32]))).toThrow(/头部损坏/)
    await expect(inspectLosslessFile(new File([], 'empty.png'))).rejects.toThrow(/为空/)
    const oversized = new File([], 'large.png')
    Object.defineProperty(oversized, 'size', { value: 51 * 1024 * 1024 })
    await expect(inspectLosslessFile(oversized)).rejects.toThrow(/50 MB/)
  })
})
