import { ArrowLeft, ChevronLeft, ChevronRight, Download, ImagePlus, MousePointer2, Redo2, Trash2, Type, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPdfEditClient } from './client'
import type { PdfEditClient } from './client'
import { editOutputName, insertionMatrix, MAX_EDIT_IMAGES_BYTES, MAX_EDIT_STEPS, retainedImageBytes, updateEdits, validateTextEdit } from './model'
import type { EditObject, EditPage, PdfEdit } from './model'
import { inspectLosslessFile } from '../image-conversion/lossless-info'
import styles from './PdfEditor.module.css'

type Tool = 'select' | 'text' | 'image'
const editTools = [{ id: 'select', label: '选择内容', icon: MousePointer2 }, { id: 'text', label: '新增文字', icon: Type }, { id: 'image', label: '插入图片', icon: ImagePlus }] as const
export default function PdfEditor({ file, initialPage, onExit, onDirty }: { file: File; initialPage: number; onExit: () => void; onDirty: (dirty: boolean) => void }) {
  const [page, setPage] = useState<EditPage | null>(null)
  const [history, setHistory] = useState<PdfEdit[][]>([[]])
  const [cursor, setCursor] = useState(0)
  const [saved, setSaved] = useState<PdfEdit[] | null>(null)
  const [selected, setSelected] = useState<EditObject | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [text, setText] = useState('')
  const [fontSize, setFontSize] = useState('16')
  const [color, setColor] = useState('#182235')
  const [position, setPosition] = useState({ x: '10', y: '20' })
  const [image, setImage] = useState<PdfEdit['image']>()
  const [imageWidth, setImageWidth] = useState('30')
  const [formDirty, setFormDirty] = useState(false)
  const [busy, setBusy] = useState('正在初始化本地 PDF 编辑引擎…')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const client = useRef<PdfEditClient | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const edits = history[cursor]
  const dirty = (edits.length > 0 && edits !== saved) || formDirty

  useEffect(() => {
    mounted.current = true
    title.current?.focus()
    const urls = downloads.current
    let service: PdfEditClient | null = null
    let cancelled = false
    void (async () => {
      try {
        service = createPdfEditClient(); client.current = service
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (cancelled) return
        const result = await service.request([], initialPage, false, bytes) as EditPage
        if (!cancelled) { setPage(result); setBusy('') }
      } catch (reason) { if (!cancelled) { setError(reason instanceof Error ? reason.message : '无法打开编辑器。'); setBusy('') } }
    })()
    return () => {
      cancelled = true; mounted.current = false; service?.close(); client.current = null
      for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url) }
      urls.clear()
    }
  }, [file, initialPage])

  useEffect(() => { onDirty(dirty); return () => onDirty(false) }, [dirty, onDirty])
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null
      if (!anchor || anchor.hasAttribute('download') || anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (!window.confirm('编辑尚未另存为，离开会丢失这些修改。确定离开？')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true) }
  }, [dirty])
  useEffect(() => {
    if (!page || !canvas.current) return
    const context = canvas.current.getContext('2d')
    context?.putImageData(new ImageData(new Uint8ClampedArray(page.pixels), page.width, page.height), 0, 0)
  }, [page])

  const discardForm = () => !formDirty || window.confirm('当前输入还未应用，放弃这次输入？')
  const resetSelection = () => { setSelected(null); setTool('select'); setFormDirty(false); setImage(undefined) }
  const selectObject = (object: EditObject) => {
    if (busy || !discardForm()) return
    setSelected(object); setTool('select'); setText(object.text); setFontSize(String(Math.round(object.fontSize * 100) / 100)); setColor(object.color)
    setFormDirty(false); setError('')
  }
  const changeTool = (next: Tool) => {
    if (!discardForm()) return
    resetSelection(); setTool(next); setText(''); setFontSize('16'); setColor('#182235'); setPosition({ x: '10', y: '20' }); setError('')
    setNotice(next === 'select' ? '点击页面文字或图片，或从对象列表选择。' : '设置内容和位置后点击“添加到页面”。也可点击预览定位。')
  }
  const showPage = async (nextEdits: PdfEdit[], number: number, done: (value: EditPage) => void) => {
    if (!client.current || busy) return
    setBusy(nextEdits.some((item) => item.kind === 'text') ? '正在应用编辑（首次文字编辑需加载本地字体）…' : '正在更新页面…'); setError('')
    try {
      const result = await client.current.request(nextEdits, number) as EditPage
      if (mounted.current) { setPage(result); done(result) }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '操作失败，原文件未更改。') }
    finally { if (mounted.current) setBusy('') }
  }
  const commit = (edit: PdfEdit) => {
    if (cursor >= MAX_EDIT_STEPS) { setError(`本次最多应用 ${MAX_EDIT_STEPS} 次编辑，请另存为后重新打开继续。`); return }
    const next = updateEdits(edits, edit)
    void showPage(next, page!.page, (result) => {
      setHistory([...history.slice(0, cursor + 1), next]); setCursor(cursor + 1); setFormDirty(false); setTool('select'); setImage(undefined)
      setSelected(result.objects.find((item) => item.id === edit.id) ?? null)
      setNotice('已应用到预览。点击“另存为 PDF”下载新文件，原文件保持不变。')
    })
  }
  const applyText = () => {
    if (!page) return
    const invalid = validateTextEdit(text, Number(fontSize), color)
    if (invalid) { setError(invalid); return }
    const x = Number(position.x), y = Number(position.y)
    if (tool === 'text' && (!Number.isFinite(x + y) || x < 0 || x > 100 || y < 0 || y > 100)) { setError('位置需在 0–100% 之间。'); return }
    commit({ id: tool === 'text' ? `new-${crypto.randomUUID()}` : selected!.id, page: page.page, kind: 'text', text, fontSize: Number(fontSize), color, matrix: tool === 'text' ? insertionMatrix(page, x / 100, y / 100) : selected!.matrix })
  }
  const loadImage = async (file?: File) => {
    if (!file) return
    setError('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('请选择不超过 10 MB 的 PNG、JPG 或 WebP 图片。'); return }
    setBusy('正在本地读取图片…')
    try {
      const info = await inspectLosslessFile(file)
      if (info.width * info.height > 8_000_000) throw new Error('图片超过 800 万像素，请先在图片工具中缩小尺寸。')
      if (!mounted.current) return
      const bitmap = await createImageBitmap(file)
      try {
        if (bitmap.width * bitmap.height > 8_000_000) throw new Error('图片超过 800 万像素，请先在图片工具中缩小尺寸。')
        if (retainedImageBytes(history) + bitmap.width * bitmap.height * 4 > MAX_EDIT_IMAGES_BYTES) throw new Error('图片及撤销历史的像素数据合计不能超过 32 MB；请另存为并重新打开后继续。')
        const surface = document.createElement('canvas'); surface.width = bitmap.width; surface.height = bitmap.height
        const context = surface.getContext('2d')
        if (!context) throw new Error('浏览器无法读取图片。')
        context.drawImage(bitmap, 0, 0)
        const pixels = new Uint8Array(context.getImageData(0, 0, bitmap.width, bitmap.height).data)
        if (mounted.current) { setImage({ pixels, width: bitmap.width, height: bitmap.height }); setFormDirty(true); setNotice(`已选择 ${file.name}，设置位置后添加。`) }
        surface.width = 0; surface.height = 0
      } finally { bitmap.close() }
    } catch (reason) { if (mounted.current) setError(reason instanceof DOMException ? '图片无法解码，文件可能损坏或浏览器不支持，请尝试另一张图片。' : reason instanceof Error ? reason.message : '图片读取失败。') }
    finally { if (mounted.current) setBusy('') }
  }
  const applyImage = () => {
    if (!page || !image) return
    const x = Number(position.x), y = Number(position.y), percent = Number(imageWidth)
    if (!Number.isFinite(x + y + percent) || x < 0 || y < 0 || percent < 1 || percent > 100 || x + percent > 100) { setError('图片宽度需为 1–100%，且不得超出页面右边界。'); return }
    const pageWidth = Math.hypot(...page.axisX), pageHeight = Math.hypot(...page.axisY)
    const width = pageWidth * percent / 100, height = width * image.height / image.width
    if (y / 100 + height / pageHeight > 1) { setError('图片超出页面下边界，请缩小宽度或上移。'); return }
    const matrix = insertionMatrix(page, x / 100, y / 100 + height / pageHeight)
    matrix[0] *= width; matrix[1] *= width; matrix[2] *= height; matrix[3] *= height
    commit({ id: `new-${crypto.randomUUID()}`, page: page.page, kind: 'image', image, matrix })
  }
  const save = async () => {
    if (!client.current || !page || busy || formDirty) return
    setBusy('正在生成新的 PDF…'); setError('')
    try {
      const bytes = await client.current.request(edits, page.page, true) as Uint8Array
      if (!mounted.current) return
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = editOutputName(file.name)
      document.body.append(anchor); anchor.click(); anchor.remove()
      downloads.current.set(url, setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url) }, 30_000))
      setSaved(edits); setNotice('已生成并开始下载新的 PDF。原文件未修改，请重新打开导出文件核对。')
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '导出失败。') }
    finally { if (mounted.current) setBusy('') }
  }
  const exit = () => { if (!dirty || window.confirm('编辑尚未另存为，返回阅读会丢失这些修改。确定返回？')) onExit() }
  const undo = (delta: number) => {
    if (!page || !discardForm()) return
    const next = cursor + delta
    void showPage(history[next], page.page, () => { setCursor(next); resetSelection(); setNotice(delta < 0 ? '已撤销。' : '已重做。') })
  }

  return <section className={styles.editor} aria-label="PDF 内容编辑器" onDragOver={(event) => event.stopPropagation()} onDrop={(event) => { event.preventDefault(); event.stopPropagation() }}>
    <header className={styles.header}><div><h2 ref={title} tabIndex={-1}>编辑 PDF 内容</h2><p title={file.name}>{file.name}</p></div><button className="button" onClick={exit}><ArrowLeft />返回阅读</button></header>
    <div className={styles.toolbar}>
      <div className={styles.tools} aria-label="编辑工具">{editTools.map(({ id, label, icon: Icon }) => <button key={id} className={tool === id ? styles.active : ''} aria-pressed={tool === id} disabled={!!busy || !page} onClick={() => changeTool(id)}><Icon />{label}</button>)}</div>
      <div className={styles.actions}><button aria-label="撤销编辑" title="撤销" disabled={!!busy || cursor === 0} onClick={() => undo(-1)}><Undo2 /></button><button aria-label="重做编辑" title="重做" disabled={!!busy || cursor === history.length - 1} onClick={() => undo(1)}><Redo2 /></button><button className={`button button-primary ${styles.save}`} disabled={!!busy || !edits.length || formDirty} onClick={() => void save()}><Download />另存为 PDF</button></div>
    </div>
    <p className={styles.explainer}>直接修改文字对象，不是覆盖标注。修改后的文字使用内置 Noto Sans SC 字体，逐行编辑，不自动重排段落；原文件始终保留。</p>
    <div className={styles.workspace}>
      <aside className={styles.settings} aria-label="内容编辑设置"><fieldset disabled={!!busy || !page}>
        <h3>{tool === 'text' ? '新增文字' : tool === 'image' ? '插入图片' : selected ? selected.kind === 'text' ? '编辑所选文字' : '所选图片' : '选择页面内容'}</h3>
        {tool === 'select' ? <label>页面对象<select aria-label="页面对象" value={selected?.id ?? ''} onChange={(event) => { const object = page?.objects.find((item) => item.id === event.target.value); if (object) selectObject(object) }}><option value="">请选择文字或图片</option>{page?.objects.map((object, index) => <option key={object.id} value={object.id}>{index + 1}. {object.kind === 'text' ? object.text.slice(0, 60) : '图片对象'}</option>)}</select></label> : null}
        {tool === 'text' || (tool === 'select' && selected?.kind === 'text') ? <>
          <label>文字内容<input aria-label="文字内容" value={text} maxLength={2000} onChange={(event) => { setText(event.target.value); setFormDirty(true) }} /></label>
          <div className={styles.row}><label>字号（pt）<input type="number" min="4" max="200" step="0.5" value={fontSize} onChange={(event) => { setFontSize(event.target.value); setFormDirty(true) }} /></label><label>文字颜色<input type="color" value={color} onChange={(event) => { setColor(event.target.value); setFormDirty(true) }} /></label></div>
          <small>替换会使用内置常规字体；原文字的起点与方向保留。文字变长可能与相邻内容重叠，请检查预览。</small>
        </> : null}
        {tool === 'image' ? <><button className="button" onClick={() => imageInput.current?.click()}><ImagePlus />选择图片</button><input ref={imageInput} className="sr-only" type="file" aria-label="插入图片文件" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void loadImage(event.target.files?.[0]); event.target.value = '' }} /><small>PNG / JPG / WebP · 最大 10 MB、800 万像素{image ? ` · ${image.width} × ${image.height} px` : ''}</small><label>图片宽度（页面 %）<input type="number" min="1" max="100" value={imageWidth} onChange={(event) => { setImageWidth(event.target.value); setFormDirty(true) }} /></label></> : null}
        {tool !== 'select' ? <><div className={styles.row}><label>距左（%）<input type="number" min="0" max="100" value={position.x} onChange={(event) => { setPosition({ ...position, x: event.target.value }); setFormDirty(true) }} /></label><label>距顶（%）<input type="number" min="0" max="100" value={position.y} onChange={(event) => { setPosition({ ...position, y: event.target.value }); setFormDirty(true) }} /></label></div><small>{tool === 'text' ? '位置对应文字基线；也可点击页面定位。' : '位置对应图片左上角，按原比例插入。'}</small></> : null}
        {tool === 'text' || selected?.kind === 'text' ? <button className="button button-primary" onClick={applyText}>{tool === 'text' ? '添加到页面' : '应用文字修改'}</button> : null}
        {tool === 'image' ? <button className="button button-primary" disabled={!image} onClick={applyImage}>添加到页面</button> : null}
        {selected && tool === 'select' ? <button className={`button ${styles.delete}`} onClick={() => commit({ page: page!.page, id: selected.id, kind: 'delete' })}><Trash2 />删除对象</button> : null}
        {tool === 'select' && !selected ? <p>点击预览中的文字或图片开始编辑。小文字也可通过上方对象列表选取。</p> : null}
      </fieldset>
      {page && !page.objects.some((object) => object.kind === 'text') ? <p className={styles.note}>本页没有可编辑的独立文字，可能为扫描件或嵌套内容。可新增文字 / 图片；不提供 OCR。</p> : null}
      {page?.complexObjects ? <p className={styles.note}>本页有 {page.complexObjects} 个嵌套或特殊对象，仅保持显示，暂不编辑。</p> : null}
      <details className={styles.limits}><summary>编辑范围与隐私</summary><p>所有操作仅在当前浏览器内进行，不上传、不保存草稿。支持页面上的独立文字、图片；不编辑表单、批注、复杂嵌套内容或数字签名。加密文件需提供未加密副本。</p><p>删除对象不等于安全脱敏，不能保证移除文件内的所有历史、元数据或隐藏副本。敏感信息请使用专门的 PDF 脱敏工具。</p><p>编辑引擎与中文字库按需从本站加载。为保证跨设备显示，修改文字后会嵌入字库，导出文件可能变大。每次最多应用 50 次编辑；离开页面会释放文件。浏览器返回前请先另存为。</p></details>
      </aside>
      <div className={styles.preview}>
        <div className={styles.pagination}><button aria-label="编辑上一页" disabled={!!busy || !page || page.page === 1} onClick={() => { if (page && discardForm()) void showPage(edits, page.page - 1, resetSelection) }}><ChevronLeft /></button><span>{page ? `第 ${page.page} / ${page.pageCount} 页` : '正在打开页面'}</span><button aria-label="编辑下一页" disabled={!!busy || !page || page.page === page.pageCount} onClick={() => { if (page && discardForm()) void showPage(edits, page.page + 1, resetSelection) }}><ChevronRight /></button><span>{edits.length} 项更改{dirty ? ' · 未保存' : saved ? ' · 已导出' : ''}</span></div>
        <div className={styles.scroll} aria-busy={!!busy}>
          {page ? <div className={`${styles.paper} ${tool !== 'select' ? styles.placing : ''}`} style={{ aspectRatio: `${page.width} / ${page.height}` }} onClick={(event) => {
            if (tool === 'select' || busy) return
            const rect = event.currentTarget.getBoundingClientRect()
            setPosition({ x: ((event.clientX - rect.left) / rect.width * 100).toFixed(1), y: ((event.clientY - rect.top) / rect.height * 100).toFixed(1) }); setFormDirty(true)
          }}>
            <canvas ref={canvas} width={page.width} height={page.height} aria-label={`第 ${page.page} 页内容编辑预览`} />
            {tool === 'select' && !busy ? page.objects.map((object) => <button key={object.id} className={`${styles.object} ${selected?.id === object.id ? styles.selected : ''}`} style={{ left: `${object.screen.x * 100}%`, top: `${object.screen.y * 100}%`, width: `${object.screen.width * 100}%`, height: `${object.screen.height * 100}%` }} aria-label={object.kind === 'text' ? `编辑文字：${object.text.slice(0, 80)}` : `选择图片对象 ${object.id}`} title={object.kind === 'text' ? object.text : '图片对象'} onClick={() => selectObject(object)} />) : null}
            {tool !== 'select' ? <span className={styles.position} style={{ left: `${Math.max(0, Math.min(100, Number(position.x) || 0))}%`, top: `${Math.max(0, Math.min(100, Number(position.y) || 0))}%` }} aria-hidden="true">+</span> : null}
          </div> : <div className={styles.empty}>选择内容 → 修改并预览 → 另存为 PDF</div>}
        </div>
      </div>
    </div>
    <div className={styles.feedback} aria-live="polite">{busy || notice || '请选择要修改的内容。'}</div>
    {formDirty ? <p className={styles.hint}>当前输入尚未应用。请先应用修改，再另存为。</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </section>
}
