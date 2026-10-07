import { outputExtension, outputMime } from './codecs'
import { decodeImageFile, flattenAlpha } from './engine'
import { readLosslessInfo, validateLosslessFileSize } from './lossless-info'
import {
  ImageConversionError,
  type DecodedImage,
  type ImageCompressionOptions,
  type ImageCompressionResult,
  type ImageInputFormat,
} from './types'

export type CompressibleFormat = 'png' | 'jpeg' | 'webp'

interface CompressionCandidate {
  blob: Blob
  width: number
  height: number
}

export interface CompressionProgress {
  detail?: string
  attempts: number
  width: number
  height: number
  quality: number | null
}

export interface CompressionHooks {
  signal?: AbortSignal
  onProgress?: (progress: CompressionProgress) => void
}

export function resolveCompressionFormat(
  input: ImageInputFormat,
  requested: ImageCompressionOptions['format'],
): CompressibleFormat {
  if (requested !== 'original') return requested
  if (input === 'png' || input === 'jpeg' || input === 'webp') return input
  throw new ImageConversionError(
    'ORIGINAL_FORMAT_UNSUPPORTED',
    '此格式不能保留原格式压缩，请选择输出为 WebP 或 JPG。',
  )
}

export function compressedFileName(inputName: string, format: CompressibleFormat) {
  const base = inputName.replace(/\.[^.]+$/, '') || 'image'
  return `${base}-compressed.${outputExtension(format)}`
}

function qualityCandidates(maximum: number) {
  const values = [0.4]
  for (let quality = 0.45; quality < maximum; quality += 0.05) {
    values.push(Number(quality.toFixed(2)))
  }
  if (maximum > 0.4) values.push(maximum)
  return values
}

export function nextCompressionDimensions(width: number, height: number, ratio: number) {
  const longest = Math.max(width, height)
  if (longest <= 128) return null
  const nextLongest = Math.max(128, Math.floor(longest * Math.min(0.9, Math.max(0.5, ratio))))
  if (nextLongest >= longest) return null
  const scale = nextLongest / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export async function searchCompression(
  width: number,
  height: number,
  format: CompressibleFormat,
  options: Pick<ImageCompressionOptions, 'quality' | 'targetBytes' | 'autoResize'>,
  encode: (width: number, height: number, quality: number | undefined) => Promise<Blob>,
  hooks: CompressionHooks = {},
): Promise<CompressionCandidate> {
  const target = options.targetBytes
  const qualities = format === 'png' ? [undefined] : qualityCandidates(options.quality)
  let dimensions = { width, height }
  let smallest: CompressionCandidate | null = null
  let attempts = 0

  const evaluate = async (quality: number | undefined) => {
    if (hooks.signal?.aborted) throw new ImageConversionError('CANCELLED', '已停止压缩。')
    attempts += 1
    hooks.onProgress?.({ attempts, ...dimensions, quality: quality ?? null })
    const blob = await encode(dimensions.width, dimensions.height, quality)
    if (hooks.signal?.aborted) throw new ImageConversionError('CANCELLED', '已停止压缩。')
    const candidate = { blob, ...dimensions }
    if (!smallest || blob.size < smallest.blob.size) smallest = candidate
    return candidate
  }

  for (let round = 0; round < 20; round += 1) {
    const maximum = await evaluate(qualities.at(-1))
    if (target === null || maximum.blob.size <= target) return maximum
    let dimensionSmallest = maximum

    if (qualities.length > 1) {
      const minimum = await evaluate(qualities[0])
      if (minimum.blob.size < dimensionSmallest.blob.size) dimensionSmallest = minimum
      if (minimum.blob.size <= target) {
        let best = minimum
        let low = 1
        let high = qualities.length - 2
        while (low <= high) {
          const middle = Math.floor((low + high) / 2)
          const candidate = await evaluate(qualities[middle])
          if (candidate.blob.size <= target) {
            best = candidate
            low = middle + 1
          } else {
            high = middle - 1
          }
        }
        return best
      }
    }

    if (!options.autoResize || target === null) break
    const ratio = Math.sqrt(target / dimensionSmallest.blob.size) * 0.98
    const next = nextCompressionDimensions(dimensions.width, dimensions.height, ratio)
    if (!next || (next.width === dimensions.width && next.height === dimensions.height)) break
    dimensions = next
  }

  if (!smallest) throw new ImageConversionError('ENCODE_FAILED', '无法生成压缩后的图片。')
  return smallest
}

function imageCanvas(image: DecodedImage) {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) throw new ImageConversionError('CANVAS_UNAVAILABLE', '当前浏览器无法创建图片处理画布。')
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  return canvas
}

function encodeCanvas(canvas: HTMLCanvasElement, format: CompressibleFormat, quality?: number) {
  const mime = outputMime(format)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== mime) {
        reject(new ImageConversionError('ENCODE_UNSUPPORTED', `当前浏览器不支持输出 ${format.toUpperCase()}。`))
        return
      }
      resolve(blob)
    }, mime, quality)
  })
}

export async function compressImage(
  file: File,
  options: ImageCompressionOptions,
  hooks: CompressionHooks = {},
): Promise<ImageCompressionResult> {
  if (options.method !== 'lossless' && (
    !Number.isFinite(options.quality) || options.quality < 0.4 || options.quality > 0.95 ||
    (options.targetBytes !== null &&
      (!Number.isInteger(options.targetBytes) || options.targetBytes < 1024 || options.targetBytes > 50_000 * 1024))
  )) {
    throw new ImageConversionError('INVALID_COMPRESSION_OPTIONS', '压缩质量或目标大小无效。')
  }

  if (hooks.signal?.aborted) throw new ImageConversionError('CANCELLED', '已停止压缩。')
  const startedAt = performance.now()
  if (options.method === 'lossless') {
    validateLosslessFileSize(file)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { format, width, height } = readLosslessInfo(bytes)
    const { optimizeLosslessInWorker } = await import('./lossless-client')
    const data = await optimizeLosslessInWorker(bytes, format, hooks.signal, (detail) =>
      hooks.onProgress?.({ attempts: 1, width, height, quality: null, detail }))
    const blob = new Blob([data.buffer as ArrayBuffer], { type: outputMime(format) })
    return {
      blob, fileName: file.name, format,
      width, height, durationMs: performance.now() - startedAt,
      originalBytes: file.size, targetBytes: null, targetMet: null, lossless: true,
    }
  }
  const { format: inputFormat, image } = await decodeImageFile(file)
  const format = resolveCompressionFormat(inputFormat, options.format)
  const source = imageCanvas(format === 'jpeg' ? flattenAlpha(image, options.background) : image)
  const candidate = await searchCompression(image.width, image.height, format, options, (width, height, quality) => {
    if (width === source.width && height === source.height) return encodeCanvas(source, format, quality)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new ImageConversionError('CANVAS_UNAVAILABLE', '当前浏览器无法创建图片处理画布。')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, width, height)
    return encodeCanvas(canvas, format, quality)
  }, hooks)

  return {
    blob: candidate.blob,
    fileName: compressedFileName(file.name, format),
    format,
    width: candidate.width,
    height: candidate.height,
    durationMs: performance.now() - startedAt,
    originalBytes: file.size,
    targetBytes: options.targetBytes,
    targetMet: options.targetBytes === null ? null : candidate.blob.size <= options.targetBytes,
  }
}
