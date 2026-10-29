import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Download, FileImage, FileText, FolderOpen, Info, List, Maximize, Maximize2, Minimize, PanelLeftClose, PanelLeftOpen, Printer, RefreshCcw, RotateCcw, RotateCw, Search, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OpenPdf } from './usePdfDocument'
import { clampPage, clampScale, formatPdfSize, MAX_SCALE, MIN_SCALE, normalizeRotation, pdfOutputName, SCALE_STEP } from './viewer'
import type { PdfScaleMode } from './viewer'
import { PdfPageView } from './PdfPageView'
import type { PdfPageReady } from './PdfPageView'
import { PdfThumbnails } from './PdfThumbnails'
import { createPdfTextReader, extractPdfText } from './text'
import { usePdfSearch } from './usePdfSearch'
import { flattenPdfOutline, getPdfInfoRows, getPdfPermissions, resolvePdfDestination } from './document'
import type { PdfOutlineEntry } from './document'
import { copyPlainText } from '../clipboard'
import { exportPdfPageImage } from './export'
import styles from './PdfReader.module.css'
import { Pencil } from 'lucide-react'

type SidebarTab = 'pages' | 'outline' | 'search' | 'info'
const tabs = [{ id: 'pages', label: '缩略图', icon: FileImage }, { id: 'outline', label: '目录', icon: List }, { id: 'search', label: '搜索', icon: Search }, { id: 'info', label: '信息', icon: Info }] as const
const initialPage: PdfPageReady = { scale: 1, width: 0, height: 0, text: '', limitedResolution: false }

export function PdfReader({ opened, onClose, onReplace, onEdit }: { opened: OpenPdf; onClose: () => void; onReplace: () => void; onEdit?: (page: number) => void }) {
  const { document: pdf, file, url } = opened
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [scale, setScale] = useState(1)
  const [mode, setMode] = useState<PdfScaleMode>('fit')
  const [rotation, setRotation] = useState(0)
  const [size, setSize] = useState({ width: 700, height: 650 })
  const [pageInfo, setPageInfo] = useState(initialPage)
  const [readyPage, setReadyPage] = useState(0)
  const [sidebar, setSidebar] = useState(() => !window.matchMedia('(max-width: 760px)').matches)
  const [tab, setTab] = useState<SidebarTab>('pages')
  const [outline, setOutline] = useState<PdfOutlineEntry[]>([])
  const [outlineStatus, setOutlineStatus] = useState('正在读取目录…')
  const [labels, setLabels] = useState<string[] | null>(null)
  const [details, setDetails] = useState<{ label: string; value: string }[]>([])
  const [permissions, setPermissions] = useState({ canCopy: false, canPrint: false })
  const [permissionsReady, setPermissionsReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [action, setAction] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const shell = useRef<HTMLElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const sidebarToggle = useRef<HTMLButtonElement>(null)
  const actionController = useRef<AbortController | null>(null)
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const alive = useRef(true)
  const readText = useMemo(() => createPdfTextReader(pdf), [pdf])

  useEffect(() => {
    alive.current = true
    const urls = downloads.current
    return () => {
      alive.current = false
      actionController.current?.abort()
      for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url) }
      urls.clear()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void pdf.getOutline().then((items) => {
      if (cancelled) return
      const entries = flattenPdfOutline(items ?? [])
      setOutline(entries)
      setOutlineStatus(entries.length ? '' : '此文档没有内嵌目录，可使用缩略图或搜索定位。')
    }).catch(() => { if (!cancelled) setOutlineStatus('目录读取失败，仍可使用页码导航。') })
    void pdf.getPageLabels().then((value) => { if (!cancelled) setLabels(value) }).catch(() => undefined)
    void pdf.getMetadata().then(({ info }) => { if (!cancelled) setDetails(getPdfInfoRows(info as Record<string, unknown>)) }).catch(() => undefined)
    void pdf.getPermissions().then((value) => { if (!cancelled) { setPermissions(getPdfPermissions(value)); setPermissionsReady(true) } }).catch(() => { if (!cancelled) { setPermissionsReady(true); setNotice('无法确认文档权限，文字导出和打印暂不可用。') } })
    return () => { cancelled = true }
  }, [pdf])

  useEffect(() => {
    const element = viewport.current!
    const update = () => setSize({ width: element.clientWidth || 700, height: element.clientHeight || 650 })
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [])

  const goToPage = useCallback((value: number) => {
    const page = clampPage(value, pdf.numPages)
    setCurrentPage(page)
    setPageInput(String(page))
    if (viewport.current) { viewport.current.scrollTop = 0; viewport.current.scrollLeft = 0 }
  }, [pdf.numPages])
  const search = usePdfSearch(readText, pdf.numPages, permissions.canCopy, goToPage)

  const onReady = useCallback((info: PdfPageReady) => { setPageInfo(info); setReadyPage(currentPage) }, [currentPage])
  const navigateDestination = useCallback((destination: unknown) => {
    void resolvePdfDestination(pdf, destination).then((page) => {
      if (!alive.current) return
      if (page !== null) {
        goToPage(page)
        if (window.matchMedia('(max-width: 760px)').matches) { setSidebar(false); requestAnimationFrame(() => viewport.current?.focus()) }
      }
      else setNotice('此目录或链接没有可用的页面目标。')
    }).catch(() => { if (alive.current) setNotice('无法跳转此文档链接。') })
  }, [pdf, goToPage])

  const activeMatch = search.matches[search.selectedIndex]

  const updateScale = (value: number) => { setMode('custom'); setScale(clampScale(value)) }
  const moveMatch = (delta: number) => {
    if (search.matches.length) {
      const index = (search.selectedIndex + delta + search.matches.length) % search.matches.length
      search.setSelected(index)
      goToPage(search.matches[index].page)
    }
  }
  const showSearch = () => { setSidebar(true); setTab('search'); requestAnimationFrame(() => searchInput.current?.focus()) }
  const closeSidebar = () => { setSidebar(false); sidebarToggle.current?.focus() }
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (shell.current?.requestFullscreen) await shell.current.requestFullscreen()
      else setNotice('当前浏览器不支持页面全屏，可使用“适应整页”阅读。')
    } catch { setNotice('无法进入全屏，请使用浏览器全屏或“适应整页”。') }
  }
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === shell.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  const downloadBlob = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl; anchor.download = filename
    document.body.append(anchor); anchor.click(); anchor.remove()
    const timer = setTimeout(() => { URL.revokeObjectURL(objectUrl); downloads.current.delete(objectUrl) }, 5000)
    downloads.current.set(objectUrl, timer)
  }
  const runAction = async (kind: 'text' | 'image' | 'copy') => {
    if (action || !permissions.canCopy) return
    const controller = new AbortController()
    actionController.current = controller
    setNotice('')
    setAction(kind === 'image' ? '正在导出当前页图片…' : kind === 'copy' ? '正在复制当前页文字…' : '正在提取全文…')
    try {
      if (kind === 'image') {
        const blob = await exportPdfPageImage(pdf, currentPage, rotation, controller.signal)
        controller.signal.throwIfAborted()
        downloadBlob(blob, pdfOutputName(file.name, `-page-${currentPage}.png`))
        setNotice('当前页已导出为 PNG。包含当前旋转，原 PDF 不变。')
      } else if (kind === 'copy') {
        const { text } = await readText(currentPage, controller.signal)
        if (!text.trim()) throw new Error('当前页没有可提取文字，可能为扫描件；当前不包含 OCR。')
        try { await copyPlainText(text) } catch { throw new Error('复制失败，请允许剪贴板访问后重试，或直接选择页面文字复制。') }
        controller.signal.throwIfAborted()
        setNotice('已复制当前页文字。')
      } else {
        const text = await extractPdfText(readText, pdf.numPages, controller.signal, (page) => {
          if (!controller.signal.aborted) setAction(`正在提取全文 ${page} / ${pdf.numPages} 页…`)
        })
        controller.signal.throwIfAborted()
        downloadBlob(new Blob(['\ufeff', text], { type: 'text/plain;charset=utf-8' }), pdfOutputName(file.name, '.txt'))
        setNotice('全文已导出为 TXT；按 PDF 文字层顺序提取，多栏文档的阅读顺序可能不同。')
      }
    } catch (error) {
      if (alive.current && !controller.signal.aborted) setNotice(error instanceof Error ? error.message : '操作失败，请重试。')
    } finally {
      if (alive.current && actionController.current === controller) setAction('')
    }
  }
  const cancelAction = () => { actionController.current?.abort(); setAction(''); setNotice('已取消导出。') }

  return <section ref={shell} className={styles.reader} aria-label="PDF 查看器" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); showSearch(); return }
    if (event.key === 'Escape' && sidebar && !fullscreen) { closeSidebar(); return }
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    const key = event.key
    if (['ArrowLeft', 'PageUp', 'ArrowRight', 'PageDown', 'Home', 'End', '+', '-', '0'].includes(key)) event.preventDefault()
    if (key === 'ArrowLeft' || key === 'PageUp') goToPage(currentPage - 1)
    if (key === 'ArrowRight' || key === 'PageDown') goToPage(currentPage + 1)
    if (key === 'Home') goToPage(1)
    if (key === 'End') goToPage(pdf.numPages)
    if (key === '+') updateScale(pageInfo.scale + SCALE_STEP)
    if (key === '-') updateScale(pageInfo.scale - SCALE_STEP)
    if (key === '0') setMode('fit')
  }}>
    <div className={styles.fileBar}>
      <div className={styles.fileInfo} title={file.name}><FileText aria-hidden="true" /><span><strong>{file.name}</strong><small>{formatPdfSize(file.size)} · {pdf.numPages} 页</small></span></div>
      <div className={styles.fileActions}>
        {onEdit ? <button type="button" onClick={() => onEdit(currentPage)} aria-label="编辑 PDF 内容"><Pencil /><span>编辑内容</span></button> : null}
        <button type="button" title="更换 PDF" aria-label="更换 PDF" onClick={onReplace}><FolderOpen /><span>更换</span></button>
        <a href={url} download={file.name} className={styles.actionLink} aria-label="下载原文件" title="下载原文件（不包含阅读旋转）"><Download /><span>原文件</span></a>
        <button type="button" title="关闭 PDF 并释放文件" aria-label="关闭 PDF" onClick={onClose}><X /></button>
      </div>
    </div>
    <div className={styles.toolbar}>
      <div className={styles.toolbarGroup}>
        <button ref={sidebarToggle} type="button" title="页面导航" aria-label="切换页面导航" aria-expanded={sidebar} aria-controls="pdf-sidebar" className={sidebar ? styles.activeTool : ''} onClick={() => setSidebar((value) => !value)}>{sidebar ? <PanelLeftClose /> : <PanelLeftOpen />}</button>
        <button type="button" title="搜索文档（Ctrl / ⌘ + F）" aria-label="搜索文档" onClick={showSearch}><Search /></button>
      </div>
      <div className={styles.toolbarGroup} aria-label="翻页控制">
        <button type="button" className={styles.edgePage} aria-label="首页" title="第一页" disabled={currentPage === 1} onClick={() => goToPage(1)}><ChevronsLeft /></button>
        <button type="button" aria-label="上一页" title="上一页" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}><ChevronLeft /></button>
        <label className={styles.pageControl}><span className="sr-only">当前页码</span><input aria-label="当前页码" inputMode="numeric" value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ''))} onBlur={() => goToPage(Number(pageInput))} onKeyDown={(event) => { if (event.key === 'Enter') goToPage(Number(pageInput)) }} /><span>/ {pdf.numPages}</span></label>
        <button type="button" aria-label="下一页" title="下一页" disabled={currentPage === pdf.numPages} onClick={() => goToPage(currentPage + 1)}><ChevronRight /></button>
        <button type="button" className={styles.edgePage} aria-label="末页" title="最后一页" disabled={currentPage === pdf.numPages} onClick={() => goToPage(pdf.numPages)}><ChevronsRight /></button>
      </div>
      <div className={`${styles.toolbarGroup} ${styles.zoomControls}`} aria-label="缩放控制">
        <button type="button" title="缩小" aria-label="缩小" disabled={pageInfo.scale <= MIN_SCALE} onClick={() => updateScale(pageInfo.scale - SCALE_STEP)}><ZoomOut /></button>
        <label><span className="sr-only">缩放模式</span><select aria-label="缩放模式" value={mode === 'custom' ? String(scale) : mode} onChange={(event) => { const value = event.target.value; if (value === 'fit' || value === 'page') setMode(value); else updateScale(Number(value)) }}>
          <option value="fit">适应宽度</option><option value="page">适应整页</option>
          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((value) => <option key={value} value={value}>{value * 100}%</option>)}
          {mode === 'custom' && ![0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3].includes(scale) ? <option value={scale}>{Math.round(scale * 100)}%</option> : null}
        </select></label>
        <button type="button" title="放大" aria-label="放大" disabled={pageInfo.scale >= MAX_SCALE} onClick={() => updateScale(pageInfo.scale + SCALE_STEP)}><ZoomIn /></button>
        <button type="button" className={styles.extraTool} title="适应宽度" aria-label="适应宽度" onClick={() => setMode('fit')}><Maximize2 /></button>
        <button type="button" className={styles.extraTool} title="恢复百分之百" aria-label="恢复百分之百" onClick={() => updateScale(1)}><RefreshCcw /></button>
      </div>
      <div className={styles.toolbarGroup}>
        <button type="button" className={styles.extraTool} aria-label="逆时针旋转" title="逆时针旋转" onClick={() => setRotation((value) => normalizeRotation(value - 90))}><RotateCcw /></button>
        <button type="button" aria-label="顺时针旋转" title="顺时针旋转（仅影响阅读）" onClick={() => setRotation((value) => normalizeRotation(value + 90))}><RotateCw /></button>
        <button type="button" aria-label={fullscreen ? '退出全屏' : '全屏阅读'} title={fullscreen ? '退出全屏' : '全屏阅读'} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize /> : <Maximize />}</button>
      </div>
    </div>
    <div className={`${styles.body} ${sidebar ? styles.withSidebar : ''}`}>
      {sidebar ? <aside id="pdf-sidebar" className={styles.sidebar} aria-label="文档导航">
        <div className={styles.sidebarTabs} role="tablist" aria-label="导航类型" onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault(); event.stopPropagation()
          const index = tabs.findIndex((item) => item.id === tab)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length
          setTab(tabs[next].id)
          event.currentTarget.querySelector<HTMLButtonElement>(`#pdf-tab-${tabs[next].id}`)?.focus()
        }}>
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} aria-controls={`pdf-panel-${id}`} id={`pdf-tab-${id}`} title={label} onClick={() => { setTab(id); if (id === 'search') requestAnimationFrame(() => searchInput.current?.focus()) }}><Icon /><span>{label}</span></button>)}
        </div>
        <div className={styles.sidebarPanel} role="tabpanel" id={`pdf-panel-${tab}`} aria-labelledby={`pdf-tab-${tab}`}>
          {tab === 'pages' ? <PdfThumbnails pdf={pdf} currentPage={currentPage} rotation={rotation} labels={labels} onPage={(page) => { goToPage(page); if (window.matchMedia('(max-width: 760px)').matches) closeSidebar() }} /> : null}
          {tab === 'outline' ? <div className={styles.outline}>{outlineStatus ? <p className={styles.empty}>{outlineStatus}</p> : outline.map((entry, index) => entry.url
            ? <a key={index} href={entry.url} rel="noopener noreferrer" target="_blank" style={{ paddingLeft: 12 + entry.depth * 12 }}>{entry.title} ↗</a>
            : <button key={index} type="button" disabled={!entry.destination} style={{ paddingLeft: 12 + entry.depth * 12 }} onClick={() => navigateDestination(entry.destination)}>{entry.title}</button>)}</div> : null}
          {tab === 'search' ? <div className={styles.searchPanel}>
            <label className={styles.searchBox}><Search aria-hidden="true" /><input ref={searchInput} aria-label="搜索 PDF 文字" type="search" placeholder="输入文字查找…" value={search.query} disabled={!permissions.canCopy} onChange={(event) => search.setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1) } }} /></label>
            <label className={styles.check}><input type="checkbox" checked={search.caseSensitive} onChange={(event) => search.setCaseSensitive(event.target.checked)} />区分大小写</label>
            <div className={styles.searchCount}><span role="status">{search.busy ? `正在搜索 ${search.progress} / ${pdf.numPages} 页` : search.matches.length ? `${search.selectedIndex + 1} / ${search.matches.length} 处` : search.query.trim() ? '未找到匹配文字' : '输入关键词搜索全文'}</span>
              {search.busy ? <button type="button" onClick={search.cancel}>停止</button> : <><button type="button" aria-label="上一个匹配" disabled={!search.matches.length} onClick={() => moveMatch(-1)}><ChevronLeft /></button><button type="button" aria-label="下一个匹配" disabled={!search.matches.length} onClick={() => moveMatch(1)}><ChevronRight /></button></>}
            </div>
            {!permissions.canCopy ? <p className={styles.empty}>文档未授权文字提取，或权限仍在读取中。</p> : null}
            {search.message ? <p className={styles.empty}>{search.message}</p> : null}
            <div className={styles.searchResults}>{search.matches.slice(Math.max(0, search.selectedIndex - 30), Math.max(60, search.selectedIndex + 31)).map((match) => {
              const index = search.matches.indexOf(match)
              return <button type="button" key={`${match.page}-${match.start}`} className={index === search.selectedIndex ? styles.selectedResult : ''} aria-label={`匹配 ${index + 1}，第 ${match.page} 页`} aria-current={index === search.selectedIndex ? 'true' : undefined} onClick={() => { search.setSelected(index); goToPage(match.page) }}><strong>第 {match.page} 页</strong><span>{match.preview}</span></button>
            })}</div>
          </div> : null}
          {tab === 'info' ? <div className={styles.infoPanel}><h2>文档信息</h2><dl><dt>文件名</dt><dd>{file.name}</dd><dt>大小 / 页数</dt><dd>{formatPdfSize(file.size)} / {pdf.numPages} 页</dd>{details.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}<dt>当前页面尺寸</dt><dd>{Math.round(pageInfo.width)} × {Math.round(pageInfo.height)} pt</dd></dl><p>阅读旋转不改变原文件。点击“编辑内容”可修改独立文字、添加文字或图片并另存为；暂不编辑加密文件、签名、表单及复杂嵌套内容。扫描件不提供 OCR。</p></div> : null}
        </div>
        <button type="button" className={styles.closeSidebar} onClick={closeSidebar}>收起导航，继续阅读 <ChevronRight /></button>
      </aside> : null}
      <div ref={viewport} className={styles.viewport} tabIndex={0} aria-label="PDF 页面阅读区">
        <PdfPageView document={pdf} pageNumber={currentPage} rotation={rotation} mode={mode} scale={scale} width={size.width} height={size.height} canCopy={permissions.canCopy} matches={search.matches} activeMatch={activeMatch} onReady={onReady} onDestination={navigateDestination} />
      </div>
    </div>
    <div className={styles.footer}>
      <span aria-live="polite">第 {currentPage} / {pdf.numPages} 页{labels?.[currentPage - 1] && labels[currentPage - 1] !== String(currentPage) ? ` · ${labels[currentPage - 1]}` : ''} · {Math.round(pageInfo.scale * 100)}%{rotation ? ` · 旋转 ${rotation}°` : ''}</span>
      <div className={styles.exportActions}>
        <button type="button" disabled={!!action || !permissions.canCopy || readyPage !== currentPage} onClick={() => void runAction('copy')}><Copy />复制本页文字</button>
        <button type="button" disabled={!!action || !permissions.canCopy} onClick={() => void runAction('text')}><FileText />导出全文 TXT</button>
        <button type="button" disabled={!!action || !permissions.canCopy || readyPage !== currentPage} onClick={() => void runAction('image')}><FileImage />导出本页 PNG</button>
        {permissions.canPrint ? <a href={`${url}#page=${currentPage}`} target="_blank" rel="noopener noreferrer" title="在浏览器 PDF 阅读器中打开原文件，使用其打印按钮"><Printer />系统查看与打印</a> : <span className={styles.permissionNote}>{permissionsReady ? '文档未授权打印' : '正在读取文档权限'}</span>}
      </div>
    </div>
    {action ? <div className={styles.feedback} role="status">{action}<button type="button" onClick={cancelAction}>取消操作</button></div> : notice ? <p className={styles.feedback} role="status">{notice}</p> : null}
    {pageInfo.limitedResolution ? <p className={styles.hint}>此页面尺寸较大，已限制画布像素以保护浏览器内存；原文件不受影响。</p> : null}
    <p className={styles.hint}>可选择文字复制 · 阅读区使用 ← → / PageUp / PageDown 翻页 · Ctrl / ⌘ + F 搜索 · 关闭或离开页面后不保留文件</p>
  </section>
}
