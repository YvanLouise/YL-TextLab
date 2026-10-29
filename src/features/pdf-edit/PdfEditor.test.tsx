import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PdfEditor from './PdfEditor'
import { createPdfEditClient } from './client'
import type { EditPage, PdfEdit } from './model'

vi.mock('./client', () => ({ createPdfEditClient: vi.fn() }))
const original = { id: '1', kind: 'text' as const, text: 'Original title', fontSize: 18, color: '#182235', matrix: [1, 0, 0, 1, 10, 40], bounds: [10, 40, 90, 60], screen: { x: .1, y: .2, width: .8, height: .2 } }
const makePage = (edits: PdfEdit[], page: number): EditPage => ({
  page, pageCount: 2, width: 100, height: 100, pixels: new Uint8ClampedArray(40000), complexObjects: 0,
  origin: [0, 100], axisX: [100, 0], axisY: [0, -100],
  objects: edits.some((item) => item.id === '1' && item.kind === 'delete') ? [] : [{ ...original, text: edits.find((item) => item.id === '1')?.text ?? original.text }],
})
const request = vi.fn(async (edits: PdfEdit[], page: number, save?: boolean): Promise<EditPage | Uint8Array> => save ? new TextEncoder().encode('%PDF-1.7') : makePage(edits, page))
const close = vi.fn()
let exit = vi.fn<() => void>()
beforeEach(() => {
  vi.mocked(createPdfEditClient).mockReturnValue({ request, close })
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ putImageData: vi.fn() } as never)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:pdf-edited') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  exit = vi.fn()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })
async function open() {
  const file = new File(['%PDF'], 'manual.pdf', { type: 'application/pdf' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1, 2]).buffer })
  render(<PdfEditor file={file} initialPage={1} onExit={exit} onDirty={vi.fn()} />)
  await screen.findByRole('button', { name: '编辑文字：Original title' })
  return userEvent.setup()
}

it('edits actual object parameters, supports undo/redo, downloads and releases resources', async () => {
  const user = await open()
  await user.click(screen.getByRole('button', { name: '编辑文字：Original title' }))
  await user.clear(screen.getByLabelText('文字内容'))
  await user.type(screen.getByLabelText('文字内容'), 'Changed title')
  expect(screen.getByRole('button', { name: '另存为 PDF' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '应用文字修改' }))
  await screen.findByRole('button', { name: '编辑文字：Changed title' })
  await user.click(screen.getByRole('button', { name: '撤销编辑' }))
  await screen.findByRole('button', { name: '编辑文字：Original title' })
  await user.click(screen.getByRole('button', { name: '重做编辑' }))
  await screen.findByRole('button', { name: '编辑文字：Changed title' })
  await user.click(screen.getByRole('button', { name: '另存为 PDF' }))
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
  expect(request).toHaveBeenLastCalledWith([expect.objectContaining({ id: '1', kind: 'text', text: 'Changed title' })], 1, true)
  cleanup()
  expect(close).toHaveBeenCalled()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf-edited')
})

it('validates text and confirms leaving unapplied changes', async () => {
  const user = await open()
  await user.click(screen.getByRole('button', { name: '新增文字' }))
  await user.click(screen.getByRole('button', { name: '添加到页面' }))
  expect(screen.getByRole('alert')).toHaveTextContent('请输入文字')
  await user.type(screen.getByLabelText('文字内容'), 'Unsaved')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await user.click(screen.getByRole('button', { name: '返回阅读' }))
  expect(exit).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: '返回阅读' }))
  expect(exit).toHaveBeenCalled()
})

it('deletes selected content, recovers after failure and allows navigation', async () => {
  const user = await open()
  await user.click(screen.getByRole('button', { name: '编辑文字：Original title' }))
  request.mockRejectedValueOnce(new Error('模拟编辑失败'))
  await user.click(screen.getByRole('button', { name: '删除对象' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('模拟编辑失败')
  expect(screen.getByRole('button', { name: '编辑文字：Original title' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '删除对象' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '编辑文字：Original title' })).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: '编辑下一页' }))
  expect(await screen.findByText('第 2 / 2 页')).toBeInTheDocument()
})
