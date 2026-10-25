import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { loadPdfDocument } from '../features/pdf/runtime'
import { ThemeProvider } from '../theme/ThemeProvider'
import { PdfViewerPage } from './PdfViewerPage'

vi.mock('../features/pdf/runtime', () => ({ loadPdfDocument: vi.fn() }))

const destroy = vi.fn().mockResolvedValue(undefined)
const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
const fakeDocument = {
  numPages: 2,
  getPage: vi.fn().mockResolvedValue({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: renderPage,
  }),
}

function renderPageComponent() {
  return render(
    <BrowserRouter>
      <ThemeProvider>
        <PdfViewerPage />
      </ThemeProvider>
    </BrowserRouter>,
  )
}

beforeEach(() => {
  vi.mocked(loadPdfDocument).mockResolvedValue({
    document: fakeDocument as never,
    loadingTask: { destroy } as never,
  })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test-pdf') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PdfViewerPage', () => {
  it('cancels an in-flight PDF load and unlocks file selection', async () => {
    let signal: AbortSignal | undefined
    vi.mocked(loadPdfDocument).mockImplementation((_data, nextSignal) => {
      signal = nextSignal
      return new Promise((_resolve, reject) => nextSignal?.addEventListener('abort', () => reject(new Error('Cancelled'))))
    })
    const user = userEvent.setup()
    renderPageComponent()
    await user.upload(screen.getByLabelText('选择 PDF 文件'), new File(['pdf'], 'large.pdf', { type: 'application/pdf' }))
    await waitFor(() => expect(signal).toBeDefined())
    await user.click(screen.getByRole('button', { name: '取消加载' }))
    expect(signal!.aborted).toBe(true)
    expect(screen.getByRole('button', { name: '选择 PDF' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('opens a selected PDF, controls pages, and releases it when closed', async () => {
    const user = userEvent.setup()
    renderPageComponent()
    const file = new File(['pdf bytes'], 'manual.pdf', { type: 'application/pdf' })

    await user.upload(screen.getByLabelText('选择 PDF 文件'), file)
    expect(await screen.findByText('manual.pdf')).toBeInTheDocument()
    expect(screen.getByTitle('manual.pdf')).toHaveTextContent('2 页')
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByLabelText('当前页码')).toHaveValue('2')
    await user.click(screen.getByRole('button', { name: '关闭 PDF' }))

    expect(destroy).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-pdf')
    expect(screen.getByRole('heading', { name: '选择一个 PDF 文件' })).toBeVisible()
  })

  it('accepts a dropped PDF and rejects a non-PDF file', async () => {
    renderPageComponent()
    const dropZone = screen.getByRole('region', { name: '选择一个 PDF 文件' })
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [new File(['pdf'], 'dropped.pdf', { type: 'application/pdf' })] },
    })
    expect(await screen.findByText('dropped.pdf')).toBeInTheDocument()

    cleanup()
    renderPageComponent()
    fireEvent.change(screen.getByLabelText('选择 PDF 文件'), {
      target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('请选择有效的 PDF 文件')
  })

  it('shows a specific message for password-protected PDFs', async () => {
    vi.mocked(loadPdfDocument).mockRejectedValue(Object.assign(new Error(), { name: 'PasswordException' }))
    const user = userEvent.setup()
    renderPageComponent()
    await user.upload(
      screen.getByLabelText('选择 PDF 文件'),
      new File(['encrypted'], 'private.pdf', { type: 'application/pdf' }),
    )
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('密码保护'))
  })
})
