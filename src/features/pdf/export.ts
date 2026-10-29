import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { getRasterSize, normalizeRotation } from './viewer'

export async function exportPdfPageImage(pdf: PDFDocumentProxy, pageNumber: number, rotation: number, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted()
  const page = await pdf.getPage(pageNumber)
  signal.throwIfAborted()
  const viewport = page.getViewport({ scale: 2, rotation: normalizeRotation(page.rotate + rotation) })
  const pixels = getRasterSize(viewport.width, viewport.height)
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width
  canvas.height = pixels.height
  let task: RenderTask | undefined
  const abort = () => task?.cancel()
  signal.addEventListener('abort', abort, { once: true })
  try {
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('无法创建页面图片，请重试。')
    task = page.render({ canvas, canvasContext: context, viewport, transform: [pixels.ratio, 0, 0, pixels.ratio, 0, 0] })
    await task.promise
    signal.throwIfAborted()
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('页面图片导出失败。')), 'image/png'))
    signal.throwIfAborted()
    return blob
  } finally {
    signal.removeEventListener('abort', abort)
    canvas.width = 0
    canvas.height = 0
  }
}
