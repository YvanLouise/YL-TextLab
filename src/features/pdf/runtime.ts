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
  })
  return modulePromise
}

export async function loadPdfDocument(data: ArrayBuffer): Promise<LoadedPdfDocument> {
  const pdfjs = await getPdfModule()
  const loadingTask = pdfjs.getDocument({ data })
  const document = await loadingTask.promise
  return { document, loadingTask }
}
