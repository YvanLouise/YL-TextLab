export type ImageOutputFormat = 'png' | 'jpeg' | 'webp' | 'bmp' | 'ico' | 'tga' | 'dds'

export type ImageInputFormat = ImageOutputFormat | 'gif' | 'avif'

export type IcoMode = 'multi' | 'single'

export type IcoSize = 16 | 32 | 48 | 64 | 128 | 256

export interface ImageConversionOptions {
  format: ImageOutputFormat
  quality: number
  background: string
  icoMode: IcoMode
  icoSize: IcoSize
}

export type ImageCompressionFormat = 'original' | 'jpeg' | 'webp'

export interface ImageCompressionOptions {
  format: ImageCompressionFormat
  quality: number
  targetBytes: number | null
  autoResize: boolean
  background: string
}

export interface DecodedImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type ImageQueueStatus = 'queued' | 'converting' | 'done' | 'error'

export interface ImageConversionResult {
  blob: Blob
  fileName: string
  format: ImageOutputFormat
  width: number
  height: number
  durationMs: number
}

export interface ImageCompressionResult extends ImageConversionResult {
  originalBytes: number
  targetBytes: number | null
  targetMet: boolean | null
}

export interface ImageQueueItem {
  id: string
  file: File
  inputFormat: ImageInputFormat | null
  previewUrl: string
  width: number | null
  height: number | null
  status: ImageQueueStatus
  error: string | null
  result: ImageConversionResult | ImageCompressionResult | null
  resultUrl: string | null
}

export interface ImageConversionRequest {
  file: File
  options: ImageConversionOptions
}

export class ImageConversionError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ImageConversionError'
    this.code = code
  }
}

export const DEFAULT_IMAGE_OPTIONS: ImageConversionOptions = {
  format: 'png',
  quality: 0.9,
  background: '#ffffff',
  icoMode: 'multi',
  icoSize: 256,
}

export const DEFAULT_COMPRESSION_OPTIONS: ImageCompressionOptions = {
  format: 'original',
  quality: 0.8,
  targetBytes: null,
  autoResize: true,
  background: '#ffffff',
}

export const ICO_SIZES: IcoSize[] = [16, 32, 48, 64, 128, 256]

export const MAX_IMAGE_FILES = 20
export const MAX_IMAGE_FILE_SIZE = 50 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 8192
