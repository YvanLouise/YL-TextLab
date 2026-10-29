import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import type { TextLayerParameters } from 'pdfjs-dist/types/src/display/text_layer'

export interface LoadedPdfDocument {
  document: PDFDocumentProxy
  loadingTask: PDFDocumentLoadingTask
}

let modulePromise: Promise<typeof import('pdfjs-dist')> | null = null

async function getPdfModule() {
  modulePromise ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    return pdfjs
  }).catch((error) => { modulePromise = null; throw error })
  return modulePromise
}

export interface PdfLoadCallbacks {
  onPassword?: (submit: (password: string) => void, incorrect: boolean) => void
  onProgress?: (loaded: number, total: number) => void
}

export async function createPdfTextLayer(options: TextLayerParameters) {
  const pdfjs = await getPdfModule()
  return new pdfjs.TextLayer(options)
}

export async function loadPdfDocument(data: ArrayBuffer, signal?: AbortSignal, callbacks: PdfLoadCallbacks = {}): Promise<LoadedPdfDocument> {
  const pdfjs = await getPdfModule()
  signal?.throwIfAborted()
  const base = `${import.meta.env.BASE_URL}pdf-assets/`
  const loadingTask = pdfjs.getDocument({
    data, cMapUrl: `${base}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`, iccUrl: `${base}iccs/`,
    enableXfa: false, canvasMaxAreaInBytes: 32 * 1024 * 1024,
  })
  if (callbacks.onPassword) {
    loadingTask.onPassword = (submit: (password: string) => void, reason: number) => {
      if (!signal?.aborted) callbacks.onPassword?.(submit, reason === 2)
    }
  }
  loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
    if (!signal?.aborted) callbacks.onProgress?.(loaded, total)
  }
  const abort = () => { void loadingTask.destroy().catch(() => undefined) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const document = await loadingTask.promise
    signal?.throwIfAborted()
    return { document, loadingTask }
  } catch (error) {
    if (!signal?.aborted) await loadingTask.destroy().catch(() => undefined)
    throw error
  } finally { signal?.removeEventListener('abort', abort) }
}
