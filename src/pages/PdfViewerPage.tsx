import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Maximize2,
  RefreshCcw,
  RotateCw,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { ToolHeader } from '../components/SiteHeader'
import { loadPdfDocument } from '../features/pdf/runtime'
import {
  clampPage,
  clampScale,
  describePdfError,
  isPdfFile,
  MAX_SCALE,
  MIN_SCALE,
  nextRotation,
  SCALE_STEP,
} from '../features/pdf/viewer'
import styles from './PdfViewerPage.module.css'

type ScaleMode = 'fit' | 'custom'

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PdfViewerPage() {
  const [file, setFile] = useState<File | null>(null)
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [objectUrl, setObjectUrl] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [scale, setScale] = useState(1)
  const [scaleMode, setScaleMode] = useState<ScaleMode>('fit')
  const [effectiveScale, setEffectiveScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const objectUrlRef = useRef('')
  const loadRequestRef = useRef(0)
  const dragDepthRef = useRef(0)

  const releaseDocument = useCallback(() => {
    if (loadingTaskRef.current) {
      void loadingTaskRef.current.destroy()
      loadingTaskRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = ''
    }
  }, [])

  const resetViewerState = useCallback(() => {
    setFile(null)
    setPdfDocument(null)
    setObjectUrl('')
    setCurrentPage(1)
    setPageInput('1')
    setScale(1)
    setScaleMode('fit')
    setEffectiveScale(1)
    setRotation(0)
    setRendering(false)
  }, [])

  const closeFile = useCallback(() => {
    loadRequestRef.current += 1
    releaseDocument()
    resetViewerState()
    setLoading(false)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }, [releaseDocument, resetViewerState])

  useEffect(() => () => {
    loadRequestRef.current += 1
    releaseDocument()
  }, [releaseDocument])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const updateWidth = () => setContainerWidth(viewer.clientWidth)
    updateWidth()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(viewer)
    return () => observer.disconnect()
  }, [pdfDocument])

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return
    let cancelled = false
    let renderTask: RenderTask | null = null

    const renderPage = async () => {
      setRendering(true)
      setError('')
      try {
        const page = await pdfDocument.getPage(currentPage)
        const baseViewport = page.getViewport({ scale: 1, rotation })
        const availableWidth = Math.max(containerWidth - 48, 120)
        const nextScale = scaleMode === 'fit'
          ? clampScale(availableWidth / baseViewport.width)
          : scale
        const viewport = page.getViewport({ scale: nextScale, rotation })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Canvas context unavailable')

        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        setEffectiveScale(nextScale)

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        })
        await renderTask.promise
      } catch (renderError) {
        if (!cancelled && (renderError as { name?: string }).name !== 'RenderingCancelledException') {
          setError('当前页面渲染失败，请尝试重新打开此 PDF。')
        }
      } finally {
        if (!cancelled) setRendering(false)
      }
    }

    void renderPage()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [containerWidth, currentPage, pdfDocument, rotation, scale, scaleMode])

  const openFile = async (nextFile: File) => {
    if (!isPdfFile(nextFile)) {
      setError('请选择有效的 PDF 文件。')
      return
    }

    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    releaseDocument()
    resetViewerState()
    setLoading(true)
    setError('')

    try {
      const data = await nextFile.arrayBuffer()
      const loadedPdf = await loadPdfDocument(data)
      if (loadRequestRef.current !== requestId) {
        void loadedPdf.loadingTask.destroy()
        return
      }
      const nextObjectUrl = URL.createObjectURL(nextFile)
      loadingTaskRef.current = loadedPdf.loadingTask
      objectUrlRef.current = nextObjectUrl
      setFile(nextFile)
      setPdfDocument(loadedPdf.document)
      setObjectUrl(nextObjectUrl)
      setCurrentPage(1)
      setPageInput('1')
    } catch (loadError) {
      if (loadRequestRef.current === requestId) setError(describePdfError(loadError))
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false)
    }
  }

  const goToPage = (value: number) => {
    if (!pdfDocument) return
    const nextPage = clampPage(value, pdfDocument.numPages)
    setCurrentPage(nextPage)
    setPageInput(String(nextPage))
  }

  const commitPageInput = () => goToPage(Number(pageInput))

  const updateScale = (value: number) => {
    setScaleMode('custom')
    setScale(clampScale(value))
  }

  const handleDownload = () => {
    if (!file || !objectUrl) return
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = file.name
    anchor.click()
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setDragActive(false)
    const droppedFile = event.dataTransfer.files[0]
    if (droppedFile) void openFile(droppedFile)
  }

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepthRef.current += 1
    setDragActive(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragActive(false)
  }

  return (
    <div className={styles.page}>
      <ToolHeader toolName="本地 PDF 查看工具" />
      <main className={`page-shell ${styles.workspace}`}>
        <header className={styles.intro}>
          <div>
            <h1>PDF 查看</h1>
            <p>文件仅在当前浏览器中读取，不会上传或保存。</p>
          </div>
          {file ? (
            <div className={styles.fileInfo} title={file.name}>
              <FileText aria-hidden="true" />
              <span><strong>{file.name}</strong><small>{formatFileSize(file.size)} · {pdfDocument?.numPages ?? 0} 页</small></span>
            </div>
          ) : null}
        </header>

        {!pdfDocument ? (
          <section
            className={`${styles.dropZone} ${dragActive ? styles.dragActive : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-labelledby="upload-title"
          >
            <span className={styles.uploadIcon}><Upload aria-hidden="true" /></span>
            <h2 id="upload-title">{loading ? '正在打开 PDF…' : '选择一个 PDF 文件'}</h2>
            <p>{loading ? '正在浏览器本地解析文件，请稍候。' : '将文件拖到这里，或点击下方按钮选择文件'}</p>
            <button className="button button-primary" type="button" disabled={loading} onClick={() => inputRef.current?.click()}>
              <FileText aria-hidden="true" /> 选择 PDF
            </button>
            <span className={styles.privacyNote}>仅支持本机 PDF · 文件不会上传</span>
          </section>
        ) : (
          <section className={styles.viewerShell} aria-label="PDF 查看器">
            <div className={styles.toolbar}>
              <div className={styles.toolbarGroup} aria-label="翻页控制">
                <button type="button" aria-label="上一页" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}><ChevronLeft /></button>
                <label className={styles.pageControl}>
                  <span className="sr-only">当前页码</span>
                  <input
                    aria-label="当前页码"
                    inputMode="numeric"
                    value={pageInput}
                    onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ''))}
                    onBlur={commitPageInput}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitPageInput() }}
                  />
                  <span>/ {pdfDocument.numPages}</span>
                </label>
                <button type="button" aria-label="下一页" disabled={currentPage >= pdfDocument.numPages} onClick={() => goToPage(currentPage + 1)}><ChevronRight /></button>
              </div>

              <div className={styles.toolbarGroup} aria-label="缩放控制">
                <button type="button" aria-label="缩小" disabled={scaleMode === 'custom' && scale <= MIN_SCALE} onClick={() => updateScale(effectiveScale - SCALE_STEP)}><ZoomOut /></button>
                <span className={styles.zoomValue}>{Math.round(effectiveScale * 100)}%</span>
                <button type="button" aria-label="放大" disabled={scaleMode === 'custom' && scale >= MAX_SCALE} onClick={() => updateScale(effectiveScale + SCALE_STEP)}><ZoomIn /></button>
                <button type="button" aria-label="适应宽度" className={scaleMode === 'fit' ? styles.activeTool : ''} onClick={() => setScaleMode('fit')}><Maximize2 /></button>
                <button type="button" aria-label="恢复百分之百" onClick={() => updateScale(1)}><RefreshCcw /></button>
              </div>

              <div className={`${styles.toolbarGroup} ${styles.toolbarActions}`} aria-label="文件操作">
                <button type="button" aria-label="顺时针旋转" onClick={() => setRotation((value) => nextRotation(value))}><RotateCw /></button>
                <button type="button" aria-label="下载原文件" onClick={handleDownload}><Download /></button>
                <button type="button" aria-label="关闭 PDF" onClick={closeFile}><X /></button>
              </div>
            </div>

            <div ref={viewerRef} className={styles.canvasViewport} aria-busy={rendering}>
              {rendering ? <span className={styles.renderingStatus}>正在渲染第 {currentPage} 页…</span> : null}
              <canvas ref={canvasRef} aria-label={`PDF 第 ${currentPage} 页`} />
            </div>
          </section>
        )}

        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          aria-label="选择 PDF 文件"
          onChange={(event) => {
            const selectedFile = event.target.files?.[0]
            if (selectedFile) void openFile(selectedFile)
            event.target.value = ''
          }}
        />
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </main>
    </div>
  )
}
