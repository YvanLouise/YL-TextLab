import { FileText, KeyRound, Search, ShieldCheck, Upload } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ToolHeader } from '../components/SiteHeader'
import { PdfReader } from '../features/pdf/PdfReader'
import { usePdfDocument } from '../features/pdf/usePdfDocument'
import type { PdfPasswordChallenge } from '../features/pdf/usePdfDocument'
import styles from './PdfViewerPage.module.css'
const PdfEditor = lazy(() => import('../features/pdf-edit/PdfEditor'))

function PasswordForm({ challenge, onCancel }: { challenge: PdfPasswordChallenge; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  return <form className={styles.passwordForm} onSubmit={(event) => { event.preventDefault(); if (value && !submitted) { challenge.submit(value); setValue(''); setSubmitted(true) } }}>
    <KeyRound aria-hidden="true" /><h2 id="upload-title">此 PDF 需要打开密码</h2>
    <p>密码只用于本次本地解密，不会上传或保存。</p>
    <label>PDF 密码<input ref={input} type="password" autoComplete="off" aria-invalid={challenge.incorrect} aria-describedby={challenge.incorrect ? 'pdf-password-error' : undefined} value={value} onChange={(event) => setValue(event.target.value)} disabled={submitted} /></label>
    {challenge.incorrect ? <p id="pdf-password-error" role="alert">密码不正确，请重新输入。</p> : null}
    <div><button type="button" className="button" onClick={onCancel}>取消打开</button><button type="submit" className="button button-primary" disabled={!value || submitted}>{submitted ? '正在验证…' : '解锁并打开'}</button></div>
  </form>
}

export function PdfViewerPage() {
  const viewer = usePdfDocument()
  const input = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [editPage, setEditPage] = useState<number | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const selectButton = useRef<HTMLButtonElement>(null)
  const dragDepth = useRef(0)
  const select = () => input.current?.click()
  const close = () => { viewer.close(); if (input.current) input.current.value = ''; requestAnimationFrame(() => selectButton.current?.focus()) }

  return <div className={styles.page}>
    <ToolHeader toolName="本地 PDF 阅读与编辑" />
    <main className={`page-shell ${styles.workspace}`} onDragEnter={(event) => {
      if (editPage !== null) return
      if (!Array.from(event.dataTransfer.types).includes('Files')) return
      event.preventDefault(); dragDepth.current += 1; setDragActive(true)
    }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => {
      event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragActive(false)
    }} onDrop={(event) => {
      event.preventDefault(); dragDepth.current = 0; setDragActive(false)
      if (editPage !== null) { viewer.setError('请先另存为并退出内容编辑，再打开其他文件。'); return }
      const files = event.dataTransfer.files
      if (files.length > 1) { viewer.setError('每次阅读一个 PDF，请只选择一个文件。'); return }
      if (files[0]) void viewer.open(files[0])
    }}>
      <header className={styles.intro}><div><h1>PDF 查看</h1><p>阅读、查找、编辑与提取内容，文件仅在当前浏览器处理。</p></div><span className={styles.localBadge}><ShieldCheck aria-hidden="true" />本机处理 · 不保存文件{editDirty ? ' · 编辑未保存' : ''}</span></header>
      {dragActive ? <div className={styles.dragOverlay} aria-hidden="true"><Upload />松开以打开 PDF</div> : null}
      {viewer.opened ? editPage !== null ? <Suspense fallback={<p role="status">正在加载内容编辑器…</p>}><PdfEditor key={viewer.opened.id} file={viewer.opened.file} initialPage={editPage} onDirty={setEditDirty} onExit={() => { setEditPage(null); setEditDirty(false) }} /></Suspense> : <PdfReader key={viewer.opened.id} opened={viewer.opened} onClose={close} onReplace={select} onEdit={setEditPage} /> : <section className={styles.dropZone} aria-labelledby="upload-title">
        {viewer.password ? <PasswordForm key={viewer.password.id} challenge={viewer.password} onCancel={close} /> : <>
          <span className={styles.uploadIcon}><FileText aria-hidden="true" /></span>
          <h2 id="upload-title">{viewer.loading ? '正在打开 PDF…' : '选择一个 PDF 文件'}</h2>
          <p>{viewer.loading ? `正在本机解析 ${viewer.loadingName}` : '拖拽 PDF 到此处，或从本机选择文件'}</p>
          <button ref={selectButton} className="button button-primary" type="button" disabled={viewer.loading} onClick={select}><Upload aria-hidden="true" />选择 PDF</button>
          {viewer.loading ? <button className="button" type="button" onClick={close}>取消加载</button> : <div className={styles.capabilities}><span><Search />全文搜索</span><span><FileText />文字选择与导出</span><span><KeyRound />密码文件</span></div>}
          <span className={styles.privacyNote}>单文件最大 100 MB · 关闭或离开页面后释放文件 · 扫描件暂不支持 OCR</span>
        </>}
      </section>}
      <input ref={input} className="sr-only" type="file" accept="application/pdf,.pdf" aria-label="选择 PDF 文件" disabled={editPage !== null} onChange={(event) => { const file = event.target.files?.[0]; if (file) void viewer.open(file); event.target.value = '' }} />
      {viewer.error ? <p className={styles.error} role="alert">{viewer.error}</p> : null}
    </main>
  </div>
}
