import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { createPdfTextLayer, loadPdfDocument } from '../features/pdf/runtime'
import { ThemeProvider } from '../theme/ThemeProvider'
import { PdfViewerPage } from './PdfViewerPage'

vi.mock('../features/pdf/runtime', () => ({ loadPdfDocument: vi.fn(), createPdfTextLayer: vi.fn() }))
const destroy = vi.fn().mockResolvedValue(undefined)
const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
const viewport = vi.fn(({ scale, rotation }: { scale: number; rotation: number }) => ({
  width: (rotation % 180 ? 800 : 600) * scale, height: (rotation % 180 ? 600 : 800) * scale,
}))
const fakePage = {
  rotate: 0, userUnit: 1, getViewport: viewport, render: renderPage,
  getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Local PDF test. 本地阅读。', hasEOL: true }], styles: {} }),
  getAnnotations: vi.fn().mockResolvedValue([]),
}
const fakeDocument = {
  numPages: 2, getPage: vi.fn().mockResolvedValue(fakePage),
  getOutline: vi.fn().mockResolvedValue([{ title: '第二章', dest: [1], items: [] }]),
  getPageLabels: vi.fn().mockResolvedValue(['i', 'ii']),
  getMetadata: vi.fn().mockResolvedValue({ info: { Title: '文档标题', Author: 'YL' } }),
  getPermissions: vi.fn().mockResolvedValue(null), getDestination: vi.fn().mockResolvedValue([1]),
}
const pdfFile = (name = 'manual.pdf') => new File(['%PDF-1.7 test bytes'], name, { type: 'application/pdf' })
const loaded = () => ({ document: fakeDocument as never, loadingTask: { destroy } as never })
function renderPageComponent() {
  return render(<BrowserRouter><ThemeProvider><PdfViewerPage /></ThemeProvider></BrowserRouter>)
}
async function open(user: ReturnType<typeof userEvent.setup>, file = pdfFile()) {
  await user.upload(screen.getByLabelText('选择 PDF 文件'), file)
  await screen.findByText(file.name)
  await waitFor(() => expect(screen.getByRole('button', { name: '复制本页文字' })).toBeEnabled())
}
beforeEach(() => {
  vi.mocked(loadPdfDocument).mockResolvedValue(loaded())
  vi.mocked(createPdfTextLayer).mockImplementation(async ({ container, textContentSource }) => {
    const items = (textContentSource as { items: { str: string }[] }).items
    const divs = items.map((item) => { const span = document.createElement('span'); span.textContent = item.str; container.append(span); return span })
    return { textDivs: divs, render: vi.fn().mockResolvedValue(undefined), cancel: vi.fn() } as never
  })
  fakePage.rotate = 0
  fakePage.getTextContent.mockResolvedValue({ items: [{ str: 'Local PDF test. 本地阅读。', hasEOL: true }], styles: {} })
  fakeDocument.numPages = 2
  fakeDocument.getPage.mockResolvedValue(fakePage)
  fakeDocument.getPermissions.mockResolvedValue(null)
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test-pdf') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['png'], { type: 'image/png' })))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks() })

describe('PdfViewerPage', () => {
  it('cancels an in-flight load and unlocks file selection', async () => {
    let signal: AbortSignal | undefined
    vi.mocked(loadPdfDocument).mockImplementation((_data, nextSignal) => {
      signal = nextSignal
      return new Promise((_resolve, reject) => nextSignal?.addEventListener('abort', () => reject(new Error('Cancelled'))))
    })
    const user = userEvent.setup()
    renderPageComponent()
    await user.upload(screen.getByLabelText('选择 PDF 文件'), pdfFile())
    await waitFor(() => expect(signal).toBeDefined())
    await user.click(screen.getByRole('button', { name: '取消加载' }))
    expect(signal!.aborted).toBe(true)
    expect(screen.getByRole('button', { name: '选择 PDF' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('opens, jumps to pages, navigates outlines and releases on close', async () => {
    const user = userEvent.setup()
    renderPageComponent()
    await open(user)
    expect(screen.getByTitle('manual.pdf')).toHaveTextContent('2 页')
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByLabelText('当前页码')).toHaveValue('2')
    await user.clear(screen.getByLabelText('当前页码'))
    await user.type(screen.getByLabelText('当前页码'), '999{Enter}')
    expect(screen.getByLabelText('当前页码')).toHaveValue('2')
    await user.click(screen.getByRole('button', { name: '上一页' }))
    await user.click(screen.getByRole('tab', { name: '目录' }))
    await user.click(await screen.findByRole('button', { name: '第二章' }))
    expect(screen.getByLabelText('当前页码')).toHaveValue('2')
    await user.click(screen.getByRole('button', { name: '关闭 PDF' }))
    expect(destroy).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-pdf')
    expect(screen.getByRole('heading', { name: '选择一个 PDF 文件' })).toBeVisible()
  })

  it('accepts drops, rejects multiple and invalid files without closing the current PDF', async () => {
    renderPageComponent()
    fireEvent.drop(screen.getByRole('main'), { dataTransfer: { files: [pdfFile('dropped.pdf')] } })
    expect(await screen.findByText('dropped.pdf')).toBeInTheDocument()
    fireEvent.drop(screen.getByRole('main'), { dataTransfer: { files: [pdfFile(), pdfFile('two.pdf')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('每次阅读一个 PDF')
    fireEvent.change(screen.getByLabelText('选择 PDF 文件'), { target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('请选择有效的 PDF 文件')
    fireEvent.change(screen.getByLabelText('选择 PDF 文件'), { target: { files: [new File(['not a pdf'], 'fake.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('文件头不是有效 PDF'))
    expect(screen.getByText('dropped.pdf')).toBeInTheDocument()
  })

  it('supports password retry, cancellation and successful unlock without saving passwords', async () => {
    let challenge: ((submit: (password: string) => void, incorrect: boolean) => void) | undefined
    let resolve: (value: ReturnType<typeof loaded>) => void = () => {}
    const submit = vi.fn((value: string) => {
      if (value === 'correct') resolve(loaded())
      else challenge?.(submit, true)
    })
    vi.mocked(loadPdfDocument).mockImplementation((_data, _signal, callbacks) => {
      challenge = callbacks?.onPassword
      challenge?.(submit, false)
      return new Promise((next) => { resolve = next })
    })
    const user = userEvent.setup()
    renderPageComponent()
    await user.upload(screen.getByLabelText('选择 PDF 文件'), pdfFile('private.pdf'))
    const password = await screen.findByLabelText('PDF 密码')
    await user.type(password, 'wrong')
    await user.click(screen.getByRole('button', { name: '解锁并打开' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('密码不正确')
    await user.type(screen.getByLabelText('PDF 密码'), 'correct')
    await user.click(screen.getByRole('button', { name: '解锁并打开' }))
    expect(await screen.findByText('private.pdf')).toBeVisible()
    expect(screen.queryByLabelText('PDF 密码')).not.toBeInTheDocument()
    expect(localStorage.getItem('pdf-password')).toBeNull()
  })

  it('searches literal text, highlights, changes page and clears old highlights', async () => {
    const user = userEvent.setup()
    renderPageComponent()
    await open(user)
    await user.click(screen.getByRole('button', { name: '搜索文档' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索 PDF 文字' }), '本地')
    expect(await screen.findByText('1 / 2 处')).toBeVisible()
    await waitFor(() => expect(document.querySelectorAll('mark')).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: '下一个匹配' }))
    expect(screen.getByLabelText('当前页码')).toHaveValue('2')
    await user.clear(screen.getByRole('searchbox', { name: '搜索 PDF 文字' }))
    await waitFor(() => expect(document.querySelectorAll('mark')).toHaveLength(0))
  })

  it('copies current text and exports TXT and PNG while releasing result URLs', async () => {
    const user = userEvent.setup()
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    renderPageComponent()
    await open(user)
    await user.click(screen.getByRole('button', { name: '复制本页文字' }))
    await waitFor(() => expect(copy).toHaveBeenCalledWith('Local PDF test. 本地阅读。\n'))
    await user.click(screen.getByRole('button', { name: '导出全文 TXT' }))
    expect(await screen.findByText(/全文已导出为 TXT/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: '导出本页 PNG' }))
    expect(await screen.findByText(/当前页已导出为 PNG/)).toBeVisible()
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3)
    await user.click(screen.getByRole('button', { name: '关闭 PDF' }))
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('reports copy failure and scanned pages honestly', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'))
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) })
    renderPageComponent()
    await open(user)
    await user.click(screen.getByRole('button', { name: '复制本页文字' }))
    expect(await screen.findByText(/复制失败，请允许剪贴板访问/)).toBeVisible()
    fakePage.getTextContent.mockResolvedValue({ items: [], styles: {} })
    await user.click(screen.getByRole('button', { name: '关闭 PDF' }))
    await open(user, pdfFile('scan.pdf'))
    await user.click(screen.getByRole('button', { name: '导出全文 TXT' }))
    expect(await screen.findByText(/未发现可提取文字/)).toBeVisible()
  })

  it('honors copy and print permissions and keeps original download available', async () => {
    fakeDocument.getPermissions.mockResolvedValue([] as never)
    const user = userEvent.setup()
    renderPageComponent()
    await user.upload(screen.getByLabelText('选择 PDF 文件'), pdfFile())
    await screen.findByText('manual.pdf')
    expect(screen.getByRole('button', { name: '导出全文 TXT' })).toBeDisabled()
    expect(await screen.findByText('文档未授权打印')).toBeVisible()
    expect(screen.getByRole('link', { name: '下载原文件' })).toHaveAttribute('download', 'manual.pdf')
  })

  it('preserves intrinsic page rotation and supports keyboard controls and tab navigation', async () => {
    fakePage.rotate = 90
    const user = userEvent.setup()
    renderPageComponent()
    await open(user)
    expect(viewport).toHaveBeenCalledWith(expect.objectContaining({ rotation: 90 }))
    await user.click(screen.getByRole('button', { name: '顺时针旋转' }))
    await waitFor(() => expect(viewport).toHaveBeenCalledWith(expect.objectContaining({ rotation: 180 })))
    fireEvent.keyDown(screen.getByLabelText('PDF 页面阅读区'), { key: 'End' })
    expect(screen.getByLabelText('当前页码')).toHaveValue('2')
    await user.click(screen.getByRole('tab', { name: '缩略图' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '目录' })).toHaveFocus()
    expect(screen.getByLabelText('当前页码')).toHaveValue('2')
  })

  it('discards a late document resolution after closing', async () => {
    let resolve: (value: ReturnType<typeof loaded>) => void = () => {}
    vi.mocked(loadPdfDocument).mockImplementation(() => new Promise((next) => { resolve = next }))
    const user = userEvent.setup()
    renderPageComponent()
    await user.upload(screen.getByLabelText('选择 PDF 文件'), pdfFile())
    await waitFor(() => expect(loadPdfDocument).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: '取消加载' }))
    await act(async () => resolve(loaded()))
    expect(destroy).toHaveBeenCalled()
    expect(screen.queryByText('manual.pdf')).not.toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
