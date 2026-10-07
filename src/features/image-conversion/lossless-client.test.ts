import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { optimizeLosslessInWorker } from './lossless-client'

class FakeWorker {
  static current: FakeWorker
  constructor() { FakeWorker.current = this }
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
}

beforeEach(() => vi.stubGlobal('Worker', FakeWorker))
afterEach(() => vi.unstubAllGlobals())

describe('lossless worker lifecycle', () => {
  it('transfers the file buffer, forwards progress, and terminates after success', async () => {
    const input = new Uint8Array([1, 2, 3])
    const progress = vi.fn()
    const pending = optimizeLosslessInWorker(input, 'png', undefined, progress)
    const worker = FakeWorker.current
    expect(worker.postMessage).toHaveBeenCalledWith({ bytes: input, format: 'png' }, [input.buffer])
    worker.onmessage?.({ data: { stage: 'optimizing' } } as MessageEvent)
    expect(progress).toHaveBeenCalledWith('optimizing')
    const output = new Uint8Array([2, 3])
    worker.onmessage?.({ data: { bytes: output } } as MessageEvent)
    expect(await pending).toEqual(output)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('terminates immediately when the user cancels a current file', async () => {
    const controller = new AbortController()
    const pending = optimizeLosslessInWorker(new Uint8Array([1]), 'png', controller.signal)
    const worker = FakeWorker.current
    controller.abort()
    await expect(pending).rejects.toThrow(/停止压缩/)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('keeps codec errors readable and removes the abort listener on failure', async () => {
    const controller = new AbortController()
    const pending = optimizeLosslessInWorker(new Uint8Array([1]), 'png', controller.signal)
    const worker = FakeWorker.current
    worker.onmessage?.({ data: { error: 'bad CRC', code: 'INVALID_IMAGE' } } as MessageEvent)
    await expect(pending).rejects.toMatchObject({ message: 'bad CRC', code: 'INVALID_IMAGE' })
    controller.abort()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('reports worker runtime errors and missing worker support', async () => {
    const pending = optimizeLosslessInWorker(new Uint8Array([1]), 'png')
    FakeWorker.current.onerror?.({ preventDefault: vi.fn() } as unknown as ErrorEvent)
    await expect(pending).rejects.toThrow(/内存不足/)
    expect(FakeWorker.current.terminate).toHaveBeenCalledOnce()
    vi.stubGlobal('Worker', undefined)
    await expect(optimizeLosslessInWorker(new Uint8Array([1]), 'png')).rejects.toThrow(/支持 Worker/)
  })
})
