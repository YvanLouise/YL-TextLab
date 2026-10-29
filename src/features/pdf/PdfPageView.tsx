import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist'
import { createPdfTextLayer } from './runtime'
import { extractPageText } from './text'
import type { PdfPageText, PdfTextMatch } from './text'
import { getRasterSize, getViewScale, normalizeRotation, safePdfUrl } from './viewer'
import type { PdfScaleMode } from './viewer'
import styles from './PdfReader.module.css'

export interface PdfPageReady { scale: number; width: number; height: number; text: string; limitedResolution: boolean }
interface Props {
  document: PDFDocumentProxy
  pageNumber: number
  rotation: number
  mode: PdfScaleMode
  scale: number
  width: number
  height: number
  canCopy: boolean
  matches: PdfTextMatch[]
  activeMatch?: PdfTextMatch
  onReady: (info: PdfPageReady) => void
  onDestination: (destination: unknown) => void
}

export function PdfPageView({ document: pdf, pageNumber, rotation, mode, scale, width, height, canCopy, matches, activeMatch, onReady, onDestination }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const textState = useRef<{ layer: TextLayer; text: PdfPageText } | null>(null)
  const [renderId, setRenderId] = useState(0)
  const [retry, setRetry] = useState(0)
  const [status, setStatus] = useState('正在渲染页面…')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let task: RenderTask | undefined
    let layer: TextLayer | undefined
    let canvas: HTMLCanvasElement | undefined
    const element = host.current!
    textState.current = null
    element.replaceChildren()
    const render = async () => {
      setStatus(`正在渲染第 ${pageNumber} 页…`)
      setFailed(false)
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return
        const pageRotation = normalizeRotation(page.rotate + rotation)
        const base = page.getViewport({ scale: 1, rotation: pageRotation })
        const actualScale = getViewScale(base.width, base.height, width, height, mode, scale)
        const viewport = page.getViewport({ scale: actualScale, rotation: pageRotation })
        const pixels = getRasterSize(viewport.width, viewport.height, window.devicePixelRatio || 1)
        canvas = window.document.createElement('canvas')
        canvas.width = pixels.width
        canvas.height = pixels.height
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        canvas.setAttribute('aria-label', `PDF 第 ${pageNumber} 页`)
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Canvas unavailable')
        const paper = window.document.createElement('div')
        paper.className = styles.paper
        paper.style.width = `${viewport.width}px`
        paper.style.height = `${viewport.height}px`
        paper.style.setProperty('--total-scale-factor', String(actualScale * (page.userUnit || 1)))
        paper.appendChild(canvas)
        task = page.render({ canvas, canvasContext: context, viewport, transform: [pixels.ratio, 0, 0, pixels.ratio, 0, 0] })
        await task.promise
        if (cancelled) return
        element.replaceChildren(paper)
        let extractedText = ''
        let textUnavailable = false
        try {
          const content = await page.getTextContent()
          if (cancelled) return
          const text = extractPageText(content)
          extractedText = text.text
          if (canCopy) {
            const container = window.document.createElement('div')
            container.className = styles.textLayer
            container.setAttribute('aria-label', `第 ${pageNumber} 页可选择文字`)
            paper.appendChild(container)
            layer = await createPdfTextLayer({ container, textContentSource: content, viewport })
            if (cancelled) { layer.cancel(); return }
            await layer.render()
            if (cancelled) return
            textState.current = { layer, text }
          }
        } catch { if (!cancelled) textUnavailable = true }
        if (cancelled) return
        try {
          const annotations = await page.getAnnotations()
          if (cancelled) return
          const links = window.document.createElement('div')
          links.className = styles.pageLinks
          for (const annotation of annotations) {
            if (annotation.subtype !== 'Link' || !Array.isArray(annotation.rect)) continue
            const safeUrl = safePdfUrl(annotation.url)
            if (!safeUrl && !annotation.dest) continue
            const link = window.document.createElement(safeUrl ? 'a' : 'button')
            if (link instanceof HTMLAnchorElement && safeUrl) {
              link.href = safeUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'
              link.setAttribute('aria-label', `打开链接（新标签页）：${safeUrl}`)
            } else {
              (link as HTMLButtonElement).type = 'button'
              link.setAttribute('aria-label', '跳转文档内链接')
              link.addEventListener('click', () => onDestination(annotation.dest))
            }
            const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1])
            const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3])
            Object.assign(link.style, { left: `${Math.min(x1, x2)}px`, top: `${Math.min(y1, y2)}px`, width: `${Math.abs(x2 - x1)}px`, height: `${Math.abs(y2 - y1)}px` })
            links.appendChild(link)
          }
          paper.appendChild(links)
        } catch { /* A malformed link must not prevent reading a page. */ }
        if (cancelled) return
        onReady({ scale: actualScale, width: base.width, height: base.height, text: extractedText, limitedResolution: pixels.ratio < 1 })
        setStatus(textUnavailable ? '本页文字层不可用，仍可阅读页面图片。' : '')
        setRenderId((value) => value + 1)
      } catch (error) {
        if (!cancelled && (error as Error).name !== 'RenderingCancelledException') {
          setFailed(true)
          setStatus('本页渲染失败。可重试或切换其他页，原文件仍可下载。')
        }
      }
    }
    void render()
    return () => {
      cancelled = true
      task?.cancel()
      layer?.cancel()
      textState.current = null
      element.replaceChildren()
      // Each render owns its canvas. Never reuse a canvas still held by PDF.js.
      if (task) void task.promise.catch(() => undefined).then(() => { if (canvas) { canvas.width = 0; canvas.height = 0 } })
    }
  }, [pdf, pageNumber, rotation, mode, scale, width, height, canCopy, retry, onReady, onDestination])

  useEffect(() => {
    const state = textState.current
    if (!state) return
    const pageMatches = matches.filter((match) => match.page === pageNumber)
    let selected: HTMLElement | undefined
    state.layer.textDivs.forEach((span, index) => {
      const run = state.text.runs[index]
      if (!run) return
      const fragment = window.document.createDocumentFragment()
      let cursor = 0
      for (const match of pageMatches) {
        const start = Math.max(match.start, run.start) - run.start
        const end = Math.min(match.end, run.end) - run.start
        if (start >= end) continue
        fragment.append(run.value.slice(cursor, start))
        const mark = window.document.createElement('mark')
        mark.textContent = run.value.slice(start, end)
        mark.className = styles.match
        if (activeMatch?.page === pageNumber && activeMatch.start === match.start) { mark.classList.add(styles.activeMatch); selected ??= mark }
        fragment.appendChild(mark)
        cursor = end
      }
      fragment.append(run.value.slice(cursor))
      span.replaceChildren(fragment)
    })
    selected?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [matches, activeMatch, pageNumber, renderId])

  return <div className={styles.pageView}>
    {status ? <div className={styles.renderStatus} role={failed ? 'alert' : 'status'}>{status}{failed ? <button className="button" onClick={() => setRetry((value) => value + 1)}>重试本页</button> : null}</div> : null}
    <div ref={host} className={styles.paperHost} />
  </div>
}
