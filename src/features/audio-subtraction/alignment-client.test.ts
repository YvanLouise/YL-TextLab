import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AlignmentMatch, AlignmentWindow } from './alignment'
import { AlignmentClient } from './alignment-client'

class WorkerMock {
  static instances: WorkerMock[] = []
  onmessage: ((event: { data: { result?: AlignmentMatch; error?: string } }) => void) | null = null
  onerror: (() => void) | null = null
  terminate = vi.fn()
  postMessage = vi.fn()
  constructor() { WorkerMock.instances.push(this) }
}
const window = (): AlignmentWindow => ({ a: new Float32Array(32), b: new Float32Array(64), channels: 1,
  sampleRate: 4000, baseOffset: 0, minLag: 0, maxLag: 32 })
const result: AlignmentMatch = { offsetSamples: -5, correlation: .9, signedGain: 1, energyA: 1, energyB: 1, prominence: .4 }
beforeEach(() => { WorkerMock.instances = []; vi.stubGlobal('Worker', WorkerMock) })
afterEach(() => vi.unstubAllGlobals())

describe('alignment worker client', () => {
  it('loads on demand, transfers sample buffers and reuses one worker sequentially', async () => {
    const client = new AlignmentClient()
    expect(WorkerMock.instances).toHaveLength(0)
    const input = window()
    const pending = client.compare(input)
    const worker = WorkerMock.instances[0]
    expect(worker.postMessage).toHaveBeenCalledWith(input, [input.a.buffer, input.b.buffer])
    await expect(client.compare(window())).rejects.toThrow('busy')
    worker.onmessage!({ data: { result } })
    await expect(pending).resolves.toEqual(result)
    const second = client.compare(window())
    worker.onmessage!({ data: { result } })
    await second
    expect(WorkerMock.instances).toHaveLength(1)
    client.dispose()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onmessage).toBeNull()
  })

  it('rejects pending work on cancel and creates a fresh worker for retry', async () => {
    const client = new AlignmentClient()
    const pending = client.compare(window())
    const rejected = expect(pending).rejects.toThrow('Cancelled')
    client.dispose()
    await rejected
    const retry = client.compare(window())
    expect(WorkerMock.instances).toHaveLength(2)
    WorkerMock.instances[1].onmessage!({ data: { result } })
    await expect(retry).resolves.toEqual(result)
    client.dispose()
  })

  it('reports calculation and worker errors without returning an alignment', async () => {
    const client = new AlignmentClient()
    const pending = client.compare(window())
    WorkerMock.instances[0].onmessage!({ data: { error: 'Invalid input' } })
    await expect(pending).rejects.toMatchObject({ code: 'ALIGNMENT_FAILED' })
    const second = client.compare(window())
    WorkerMock.instances[0].onerror!()
    await expect(second).rejects.toMatchObject({ code: 'ALIGNMENT_FAILED' })
    expect(WorkerMock.instances[0].terminate).toHaveBeenCalledOnce()
    client.dispose()
  })

  it('handles blocked workers and failed sample transfers with an actionable error', async () => {
    const client = new AlignmentClient()
    vi.stubGlobal('Worker', class { constructor() { throw new Error('Blocked') } })
    await expect(client.compare(window())).rejects.toMatchObject({ code: 'ALIGNMENT_FAILED' })
    vi.stubGlobal('Worker', WorkerMock)
    const first = client.compare(window())
    const worker = WorkerMock.instances[0]
    worker.onmessage!({ data: { result } })
    await first
    worker.postMessage.mockImplementationOnce(() => { throw new Error('Transfer failed') })
    await expect(client.compare(window())).rejects.toMatchObject({ code: 'ALIGNMENT_FAILED' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    const retry = client.compare(window())
    WorkerMock.instances[1].onmessage!({ data: { result } })
    await expect(retry).resolves.toEqual(result)
    client.dispose()
  })
})
