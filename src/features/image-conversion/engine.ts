import {
  decodeBmp,
  decodeDds,
  decodeTga,
  detectImageFormat,
  encodeBmp,
  encodeDds,
  encodeIco,
  encodeTga,
  extractBestIcoEntry,
  outputFileName,
  outputMime,
} from './codecs'
import { readLosslessInfo } from './lossless-info'
import {
  ICO_SIZES,
  ImageConversionError,
  MAX_IMAGE_FILE_SIZE,
  validateImageDimensions,
  type DecodedImage,
  type ImageConversionRequest,
  type ImageConversionResult,
  type ImageInputFormat,
} from './types'

function createCanvas(width: number, height: number) {
  validateImageDimensions(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new ImageConversionError('CANVAS_UNAVAILABLE', '当前浏览器无法创建图片处理画布。')
  return { canvas, context }
}

function putDecodedImage(image: DecodedImage) {
  const { canvas, context } = createCanvas(image.width, image.height)
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  return { canvas, context }
}

async function decodeBrowserImage(blob: Blob): Promise<DecodedImage> {
  try {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(blob)
      try {
        const { context } = createCanvas(bitmap.width, bitmap.height)
        context.drawImage(bitmap, 0, 0)
        return {
          width: context.canvas.width,
          height: context.canvas.height,
          data: context.getImageData(0, 0, context.canvas.width, context.canvas.height).data,
        }
      } finally {
        bitmap.close()
      }
    }
  } catch (error) {
    if (error instanceof ImageConversionError) throw error
    // The image element fallback covers browsers with partial createImageBitmap support.
  }

  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    const { context } = createCanvas(image.naturalWidth, image.naturalHeight)
    context.drawImage(image, 0, 0)
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      data: context.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data,
    }
  } catch (error) {
    if (error instanceof ImageConversionError) throw error
    throw new ImageConversionError('DECODE_FAILED', '当前浏览器无法解码此图片。')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function decodeImageFile(file: File): Promise<{ format: ImageInputFormat; image: DecodedImage }> {
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new ImageConversionError('FILE_TOO_LARGE', '单个文件不能超过 50 MB。')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const format = detectImageFormat(bytes, file.name)
  if (!format) throw new ImageConversionError('UNSUPPORTED_FORMAT', '无法识别此图片格式。')
  if (format === 'png' || format === 'jpeg' || format === 'webp') readLosslessInfo(bytes)
  if (format === 'gif' && bytes.length >= 10) {
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    validateImageDimensions(header.getUint16(6, true), header.getUint16(8, true))
  }

  let image: DecodedImage
  if (format === 'tga') image = decodeTga(bytes)
  else if (format === 'dds') image = decodeDds(bytes)
  else if (format === 'bmp') image = decodeBmp(bytes)
  else if (format === 'ico') {
    const entry = extractBestIcoEntry(bytes)
    image = entry.kind === 'rgba'
      ? entry.image
      : await decodeBrowserImage(new Blob([new Uint8Array(entry.bytes).buffer], { type: 'image/png' }))
  } else {
    try {
      image = await decodeBrowserImage(file)
    } catch (error) {
      if (format === 'avif') {
        throw new ImageConversionError('AVIF_UNSUPPORTED', '当前浏览器不支持解码此 AVIF 图片。')
      }
      throw error
    }
  }

  validateImageDimensions(image.width, image.height)
  return { format, image }
}

function hexToRgb(value: string) {
  const match = /^#([\da-f]{6})$/i.exec(value)
  const hex = match?.[1] ?? 'ffffff'
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

export function flattenAlpha(image: DecodedImage, background: string): DecodedImage {
  const color = hexToRgb(background)
  const data = new Uint8ClampedArray(image.data.length)
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3] / 255
    data[offset] = Math.round(image.data[offset] * alpha + color.r * (1 - alpha))
    data[offset + 1] = Math.round(image.data[offset + 1] * alpha + color.g * (1 - alpha))
    data[offset + 2] = Math.round(image.data[offset + 2] * alpha + color.b * (1 - alpha))
    data[offset + 3] = 255
  }
  return { ...image, data }
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  if (!blob || (type !== 'image/png' && blob.type !== type)) {
    throw new ImageConversionError('ENCODE_UNSUPPORTED', `当前浏览器不支持输出 ${type.replace('image/', '').toUpperCase()}。`)
  }
  return blob
}

export function createPreviewBlob(image: DecodedImage, maxEdge = 480) {
  const source = putDecodedImage(image).canvas
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
  if (scale === 1) return canvasToBlob(source, 'image/png')
  const { canvas, context } = createCanvas(
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale)),
  )
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvasToBlob(canvas, 'image/png')
}

async function resizedPng(image: DecodedImage, size: number) {
  const source = putDecodedImage(image).canvas
  const { canvas, context } = createCanvas(size, size)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  const scale = Math.min(size / image.width, size / image.height)
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  context.drawImage(source, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height)
  return new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer())
}

async function encodeImage(image: DecodedImage, request: ImageConversionRequest) {
  const { options } = request
  if (options.format === 'bmp') {
    return new Blob([new Uint8Array(encodeBmp(flattenAlpha(image, options.background))).buffer], { type: outputMime('bmp') })
  }
  if (options.format === 'tga') {
    return new Blob([new Uint8Array(encodeTga(image)).buffer], { type: outputMime('tga') })
  }
  if (options.format === 'dds') {
    return new Blob([new Uint8Array(encodeDds(image)).buffer], { type: outputMime('dds') })
  }
  if (options.format === 'ico') {
    const sizes = options.icoMode === 'multi' ? ICO_SIZES : [options.icoSize]
    const entries = await Promise.all(sizes.map(async (size) => ({
      width: size,
      height: size,
      png: await resizedPng(image, size),
    })))
    return new Blob([new Uint8Array(encodeIco(entries)).buffer], { type: outputMime('ico') })
  }

  const canvasImage = options.format === 'jpeg' ? flattenAlpha(image, options.background) : image
  const { canvas } = putDecodedImage(canvasImage)
  const type = outputMime(options.format)
  const quality = ['jpeg', 'webp'].includes(options.format) ? options.quality : undefined
  return canvasToBlob(canvas, type, quality)
}

export async function convertImage(request: ImageConversionRequest): Promise<ImageConversionResult> {
  const startedAt = performance.now()
  const { image } = await decodeImageFile(request.file)
  const blob = await encodeImage(image, request)
  return {
    blob,
    fileName: outputFileName(request.file.name, request.options.format),
    format: request.options.format,
    width: image.width,
    height: image.height,
    durationMs: performance.now() - startedAt,
  }
}
