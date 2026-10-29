import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdfDocument } from './runtime'
import { describePdfError, hasPdfHeader, validatePdfFile } from './viewer'

export interface OpenPdf { document: PDFDocumentProxy; file: File; url: string; id: number }
export interface PdfPasswordChallenge { submit: (password: string) => void; incorrect: boolean; id: number }

export function usePdfDocument() {
  const [opened, setOpened] = useState<OpenPdf | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingName, setLoadingName] = useState('')
  const [password, setPassword] = useState<PdfPasswordChallenge | null>(null)
  const [error, setError] = useState('')
  const task = useRef<PDFDocumentLoadingTask | null>(null)
  const controller = useRef<AbortController | null>(null)
  const url = useRef('')
  const request = useRef(0)
  const validationRequest = useRef(0)
  const passwordAttempt = useRef(0)

  const release = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    if (task.current) void task.current.destroy().catch(() => undefined)
    task.current = null
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = ''
  }, [])

  const close = useCallback(() => {
    validationRequest.current += 1
    request.current += 1
    release()
    setOpened(null)
    setPassword(null)
    setLoading(false)
    setLoadingName('')
    setError('')
  }, [release])

  useEffect(() => () => { validationRequest.current += 1; request.current += 1; release() }, [release])

  const open = async (file: File) => {
    const validationId = ++validationRequest.current
    const validationError = validatePdfFile(file)
    if (validationError) { setError(validationError); return }
    setError('')
    try {
      if (!hasPdfHeader(await file.slice(0, 1024).arrayBuffer())) throw new Error('文件头不是有效 PDF，不能仅通过修改扩展名打开。')
      if (validationId !== validationRequest.current) return
    } catch (error) {
      if (validationId === validationRequest.current) setError(error instanceof Error ? error.message : '无法读取文件，请重新选择。')
      return
    }
    const id = ++request.current
    release()
    setOpened(null)
    setPassword(null)
    setLoading(true)
    setLoadingName(file.name)
    const abortController = new AbortController()
    controller.current = abortController
    try {
      const data = await file.arrayBuffer()
      abortController.signal.throwIfAborted()
      const loaded = await loadPdfDocument(data, abortController.signal, {
        onPassword: (submit, incorrect) => { if (id === request.current) setPassword({ submit, incorrect, id: ++passwordAttempt.current }) },
      })
      if (id !== request.current) { void loaded.loadingTask.destroy().catch(() => undefined); return }
      task.current = loaded.loadingTask
      url.current = URL.createObjectURL(file)
      setOpened({ document: loaded.document, file, url: url.current, id })
      setPassword(null)
    } catch (error) {
      if (id === request.current && !abortController.signal.aborted) { setError(describePdfError(error)); setPassword(null) }
    } finally {
      if (id === request.current) setLoading(false)
    }
  }
  return { opened, loading, loadingName, password, error, open, close, setError }
}
