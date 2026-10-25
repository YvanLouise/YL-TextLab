import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'

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

export async function loadPdfDocument(data: ArrayBuffer, signal?: AbortSignal): Promise<LoadedPdfDocument> {
  const pdfjs = await getPdfModule()
  signal?.throwIfAborted()
  const loadingTask = pdfjs.getDocument({ data })
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
