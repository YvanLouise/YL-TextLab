import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPdfDocument } from './runtime'

const pdf = vi.hoisted(() => ({ getDocument: vi.fn() }))
vi.mock('pdfjs-dist', () => ({ getDocument: pdf.getDocument, GlobalWorkerOptions: {} }))
afterEach(() => vi.clearAllMocks())

describe('PDF loading resources', () => {
  it('self-hosts auxiliary assets and exposes password retry callbacks', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    const task = { promise: Promise.resolve({ numPages: 1 }), destroy, onPassword: undefined as undefined | ((submit: (value: string) => void, reason: number) => void) }
    pdf.getDocument.mockReturnValue(task)
    const onPassword = vi.fn()
    await loadPdfDocument(new ArrayBuffer(0), undefined, { onPassword })
    expect(pdf.getDocument).toHaveBeenCalledWith(expect.objectContaining({ cMapUrl: '/pdf-assets/cmaps/', standardFontDataUrl: '/pdf-assets/standard_fonts/', wasmUrl: '/pdf-assets/wasm/', enableXfa: false }))
    const submit = vi.fn()
    task.onPassword!(submit, 2)
    expect(onPassword).toHaveBeenCalledWith(submit, true)
  })

  it('destroys a failed loading task', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    pdf.getDocument.mockImplementation(() => ({ promise: Promise.reject(new Error('Invalid PDF')), destroy }))
    await expect(loadPdfDocument(new ArrayBuffer(0))).rejects.toThrow('Invalid PDF')
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('terminates parsing immediately on cancellation', async () => {
    const controller = new AbortController()
    let fail: (error: Error) => void = () => {}
    const destroy = vi.fn(async () => { fail(new Error('Cancelled')) })
    pdf.getDocument.mockImplementation(() => ({ promise: new Promise((_resolve, reject) => { fail = reject }), destroy }))
    const pending = loadPdfDocument(new ArrayBuffer(0), controller.signal)
    const assertion = expect(pending).rejects.toThrow('Cancelled')
    await vi.waitFor(() => expect(pdf.getDocument).toHaveBeenCalledOnce())
    controller.abort()
    await assertion
    expect(destroy).toHaveBeenCalledOnce()
  })
})
