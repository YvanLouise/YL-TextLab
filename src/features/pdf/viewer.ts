export const MIN_SCALE = 0.25
export const MAX_SCALE = 3
export const SCALE_STEP = 0.25
export const MAX_PDF_BYTES = 100 * 1024 * 1024
export const MAX_CANVAS_PIXELS = 8_000_000
export type PdfScaleMode = 'fit' | 'page' | 'custom'

export function isPdfFile(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type === 'application/pdf' || (['', 'application/octet-stream'].includes(file.type) && /\.pdf$/i.test(file.name))
}

export function clampPage(value: number, pageCount: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(Math.round(value), 1), Math.max(pageCount, 1))
}

export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(value, MIN_SCALE), MAX_SCALE)
}

export function nextRotation(rotation: number): number {
  return normalizeRotation(rotation + 90)
}

export function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360
}

export function validatePdfFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!isPdfFile(file)) return '请选择有效的 PDF 文件。'
  if (file.size === 0) return '此文件为空，请重新选择 PDF。'
  if (file.size > MAX_PDF_BYTES) return '文件超过 100 MB，请使用体积更小的 PDF 或本机桌面阅读器。'
  return null
}

export function hasPdfHeader(data: ArrayBuffer): boolean {
  return new TextDecoder('latin1').decode(data.slice(0, 1024)).includes('%PDF-')
}

export function getViewScale(width: number, height: number, availableWidth: number, availableHeight: number, mode: PdfScaleMode, custom: number): number {
  if (mode === 'custom') return clampScale(custom)
  const fitWidth = Math.max(80, availableWidth - 32) / width
  // Fit modes may need to go below the manual zoom minimum for oversized pages.
  return Math.max(0.001, Math.min(MAX_SCALE, mode === 'page'
    ? Math.min(fitWidth, Math.max(80, availableHeight - 32) / height)
    : fitWidth))
}

export function getRasterSize(width: number, height: number, pixelRatio = 1) {
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0) throw new Error('Invalid page dimensions')
  const ratio = Math.min(Math.max(1, pixelRatio), 2, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)), 8192 / Math.max(width, height))
  return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)), ratio }
}

export function safePdfUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

export function pdfOutputName(name: string, suffix: string): string {
  const safeName = Array.from(name.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*]/g, '_'), (letter) => letter.charCodeAt(0) < 32 ? '_' : letter).join('')
  return `${safeName || 'document'}${suffix}`
}

export function formatPdfSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function describePdfError(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'PasswordException') return '此 PDF 受密码保护，请输入正确的打开密码。'
  if (name === 'AbortError') return '已取消打开 PDF。'
  if (name === 'RangeError') return '浏览器可用内存不足，请关闭其他大文件后重试。'
  if (name === 'InvalidPDFException' || name === 'FormatError') {
    return '无法读取此 PDF，文件可能已损坏或格式不正确。'
  }
  if (name === 'MissingPDFException') return '无法读取所选文件，请重新选择。'
  return 'PDF 加载失败，请确认文件有效后重试。'
}
