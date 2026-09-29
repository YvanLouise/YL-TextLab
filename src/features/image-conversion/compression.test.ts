import { describe, expect, it, vi } from 'vitest'
import { compressedFileName, nextCompressionDimensions, resolveCompressionFormat, searchCompression } from './compression'

const blobOf = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/webp' })

describe('image compression', () => {
  it('keeps PNG/JPG/WebP formats and guides unsupported originals', () => {
    expect(resolveCompressionFormat('png', 'original')).toBe('png')
    expect(resolveCompressionFormat('jpeg', 'original')).toBe('jpeg')
    expect(resolveCompressionFormat('gif', 'webp')).toBe('webp')
    expect(() => resolveCompressionFormat('dds', 'original')).toThrow(/WebP 或 JPG/)
    expect(compressedFileName('photo.jpeg', 'jpeg')).toBe('photo-compressed.jpg')
  })

  it('keeps the aspect ratio when downsizing to the minimum edge', () => {
    expect(nextCompressionDimensions(256, 128, 0.5)).toEqual({ width: 128, height: 64 })
    expect(nextCompressionDimensions(128, 64, 0.5)).toBeNull()
  })

  it('tries highest quality first and lowers it only to meet the target', async () => {
    const encode = vi.fn(async (_width: number, _height: number, quality?: number) => blobOf(Math.round((quality ?? 1) * 1000)))
    const result = await searchCompression(640, 360, 'webp', { quality: 0.8, targetBytes: 700, autoResize: false }, encode)
    expect(result.blob.size).toBeLessThanOrEqual(700)
    expect(encode.mock.calls[0][2]).toBe(0.8)
    expect(result.width).toBe(640)
  })

  it('does not apply quality to lossless PNG and reduces dimensions if needed', async () => {
    const encode = vi.fn(async (width: number, height: number, quality?: number) => {
      expect(quality).toBeUndefined()
      return blobOf(width * height)
    })
    const result = await searchCompression(256, 128, 'png', { quality: 0.8, targetBytes: 10000, autoResize: true }, encode)
    expect(result.blob.size).toBeLessThanOrEqual(10000)
    expect(result.width).toBeLessThan(256)
    expect(encode.mock.calls.every((call) => call[2] === undefined)).toBe(true)
  })

  it('returns the smallest valid output when the target is unreachable', async () => {
    const result = await searchCompression(128, 128, 'png', { quality: 0.8, targetBytes: 1, autoResize: true }, async () => blobOf(200))
    expect(result.blob.size).toBe(200)
  })

  it('keeps actual output even if it exceeds the source size', async () => {
    const result = await searchCompression(128, 128, 'png', { quality: 0.8, targetBytes: null, autoResize: true }, async () => blobOf(200))
    expect(result.blob.size).toBe(200)
  })
})
