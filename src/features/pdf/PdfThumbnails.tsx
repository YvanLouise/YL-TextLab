import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { normalizeRotation } from './viewer'
import styles from './PdfReader.module.css'

function Thumbnail({ pdf, pageNumber, rotation }: { pdf: PDFDocumentProxy; pageNumber: number; rotation: number }) {
  const host = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let disposed = false
    let task: RenderTask | undefined
    const canvas = document.createElement('canvas')
    const render = async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (disposed) return
        const rotated = normalizeRotation(page.rotate + rotation)
        const base = page.getViewport({ scale: 1, rotation: rotated })
        const viewport = page.getViewport({ scale: Math.min(116 / base.width, 132 / base.height), rotation: rotated })
        canvas.width = Math.max(1, Math.ceil(viewport.width))
        canvas.height = Math.max(1, Math.ceil(viewport.height))
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) return
        task = page.render({ canvas, canvasContext: context, viewport })
        await task.promise
        if (!disposed) host.current?.replaceChildren(canvas)
      } catch { /* Page numbers remain usable when a thumbnail cannot render. */ }
    }
    void render()
    return () => { disposed = true; task?.cancel(); void task?.promise.catch(() => undefined).then(() => { canvas.width = 0; canvas.height = 0 }) }
  }, [pdf, pageNumber, rotation])
  return <span ref={host} className={styles.thumbnailImage} aria-hidden="true" />
}

const ROW_HEIGHT = 172
export function PdfThumbnails({ pdf, currentPage, rotation, labels, onPage }: {
  pdf: PDFDocumentProxy; currentPage: number; rotation: number; labels: string[] | null; onPage: (page: number) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  useEffect(() => {
    const element = list.current!
    const update = () => setHeight(element.clientHeight || 600)
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [])
  useEffect(() => {
    const element = list.current!
    const top = (currentPage - 1) * ROW_HEIGHT
    if (top < element.scrollTop || top + ROW_HEIGHT > element.scrollTop + (element.clientHeight || 600)) {
      element.scrollTop = top
      setScrollTop(top)
    }
  }, [currentPage])
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 1)
  const end = Math.min(pdf.numPages, start + Math.ceil(height / ROW_HEIGHT) + 3)
  return <div className={styles.thumbnailList} ref={list} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} aria-label="页面缩略图">
    <div style={{ height: pdf.numPages * ROW_HEIGHT, position: 'relative' }}>
      {Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index + 1).map((page) => <button
        key={page} className={`${styles.thumbnail} ${currentPage === page ? styles.selectedThumbnail : ''}`}
        style={{ top: (page - 1) * ROW_HEIGHT }} aria-label={`跳转第 ${page} 页`} aria-current={currentPage === page ? 'page' : undefined} onClick={() => onPage(page)}>
        <Thumbnail pdf={pdf} pageNumber={page} rotation={rotation} /><span>第 {page} 页{labels?.[page - 1] && labels[page - 1] !== String(page) ? ` · ${labels[page - 1]}` : ''}</span>
      </button>)}
    </div>
  </div>
}
