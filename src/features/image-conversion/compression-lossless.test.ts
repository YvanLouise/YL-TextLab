import { describe, expect, it, vi } from 'vitest'
import { compressImage, compressedFileName } from './compression'
import { DEFAULT_COMPRESSION_OPTIONS } from './types'

vi.mock('./engine', () => ({
  decodeImageFile: vi.fn(async (file: File) => ({
    format: file.type === 'image/jpeg' ? 'jpeg' : file.type === 'image/webp' ? 'webp' : 'png',
    image: { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) },
  })),
  flattenAlpha: vi.fn(),
}))
vi.mock('./lossless-info', () => ({
  validateLosslessFileSize: vi.fn(),
  readLosslessInfo: vi.fn(() => ({ format: 'png', width: 1, height: 1 })),
}))
vi.mock('./lossless-client', () => ({ optimizeLosslessInWorker: vi.fn(async (bytes: Uint8Array) => bytes) }))
import { readLosslessInfo } from './lossless-info'
import { decodeImageFile } from './engine'

describe('lossless export naming', () => {
  it.each([
    ['photo.png', 'image/png'],
    ['photo.jpeg', 'image/jpeg'],
    ['PHOTO.JPEG', 'image/jpeg'],
    ['photo.jpg', 'image/jpeg'],
    ['design.v2.webp', 'image/webp'],
    ['旅行 照片.最终版.PNG', 'image/png'],
  ])('preserves the exact input filename %s', async (name, type) => {
    const file = new File([new Uint8Array([1, 2, 3])], name, { type })
    vi.mocked(readLosslessInfo).mockReturnValue({ format: type === 'image/jpeg' ? 'jpeg' : type === 'image/webp' ? 'webp' : 'png', width: 1, height: 1 })
    const result = await compressImage(file, { ...DEFAULT_COMPRESSION_OPTIONS, method: 'lossless' })
    expect(result.fileName).toBe(file.name)
    expect(result.blob.type).toBe(type)
    expect(result.lossless).toBe(true)
    expect(decodeImageFile).not.toHaveBeenCalled()
  })

  it('still adds the suffix and output extension for standard compression', () => {
    expect(compressedFileName('photo.jpeg', 'jpeg')).toBe('photo-compressed.jpg')
    expect(compressedFileName('photo.png', 'webp')).toBe('photo-compressed.webp')
  })
})
