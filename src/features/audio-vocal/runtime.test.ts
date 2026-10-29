import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderVocal, runVocalWorker } from './runtime'
import { DEFAULT_VOCAL_OPTIONS, type VocalRequest } from './types'

const mocks = vi.hoisted(() => ({ exec: vi.fn(), readFile: vi.fn(), ready: vi.fn(), dispose: vi.fn(), probe: vi.fn(), mount: vi.fn() }))
vi.mock('../audio-shared/engine', () => ({ LocalAudioEngine: class { ready = mocks.ready; dispose = mocks.dispose }, mountAudioFile: mocks.mount }))
vi.mock('../audio-shared/probe', () => ({ probeAudio: mocks.probe }))

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { FakeWorker.instances.push(this) }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent) }
}
const request = (overrides: Partial<VocalRequest> = {}): VocalRequest => ({ file: new File(['RIFF----WAVEdata'], '声轨.wav'),
  options: { ...DEFAULT_VOCAL_OPTIONS }, previewStart: null, ...overrides })
const result = { type: 'result', clean: new Uint8Array([1, 2]), removed: new Uint8Array([3, 4]), trackedPercent: 90, outputGain: 1 }

beforeEach(() => {
  vi.clearAllMocks(); FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker)
  mocks.ready.mockResolvedValue({ exec: mocks.exec, readFile: mocks.readFile })
  mocks.exec.mockResolvedValue(0)
  mocks.readFile.mockResolvedValue(new Uint8Array(new Float32Array(16000).buffer))
  mocks.mount.mockResolvedValue({ path: '/source/input.wav' })
  mocks.probe.mockResolvedValue({ sampleRate: 16000, channels: 1, duration: 1 })
})
afterEach(() => vi.unstubAllGlobals())

describe('vocal worker lifecycle', () => {
  it('transfers PCM, forwards progress and terminates after receiving results', async () => {
    const controller = new AbortController(), progress = vi.fn(), samples = new Float32Array(8000)
    const promise = runVocalWorker(samples, 8000, 1, DEFAULT_VOCAL_OPTIONS, controller.signal, progress)
    const worker = FakeWorker.instances[0]
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ samples }), [samples.buffer])
    worker.emit({ type: 'progress', percent: 60 }); expect(progress).toHaveBeenCalledWith(60)
    worker.emit(result)
    expect(await promise).toEqual(result)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    controller.abort(); expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
  it('terminates on cancellation, detaches handlers and rejects with AbortError', async () => {
    const controller = new AbortController()
    const promise = runVocalWorker(new Float32Array(8000), 8000, 1, DEFAULT_VOCAL_OPTIONS, controller.signal, vi.fn())
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort(); await assertion
    const worker = FakeWorker.instances[0]
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.onmessage).toBeNull(); expect(worker.onerror).toBeNull()
  })
  it('releases the worker on runtime or deserialization errors', async () => {
    for (const kind of ['onerror', 'onmessageerror'] as const) {
      const promise = runVocalWorker(new Float32Array(8000), 8000, 1, DEFAULT_VOCAL_OPTIONS, new AbortController().signal, vi.fn())
      const worker = FakeWorker.instances.at(-1)!
      worker[kind]!()
      await expect(promise).rejects.toThrow('线程异常')
      expect(worker.terminate).toHaveBeenCalledOnce()
    }
  })
})

describe('vocal decoding and resource limits', () => {
  it.each([0, 4, 1])('uses precisely the decoded PCM view with byte offset %i, copying only unaligned data', async offset => {
    const raw = new ArrayBuffer(64000 + offset + 4), view = new DataView(raw)
    for (let i = 0; i < 16000; i++) view.setFloat32(offset + i * 4, .25, true)
    mocks.readFile.mockResolvedValue(new Uint8Array(raw, offset, 64000))
    const promise = renderVocal(request(), new AbortController().signal, vi.fn())
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1))
    const [message, transfers] = FakeWorker.instances[0].postMessage.mock.calls[0]
    expect(message.samples.length).toBe(16000)
    expect(message.samples[0]).toBe(.25); expect(message.samples[15999]).toBe(.25)
    if (offset % 4) expect(message.samples.buffer).not.toBe(raw)
    else expect(message.samples.buffer).toBe(raw)
    expect(transfers).toEqual([message.samples.buffer])
    FakeWorker.instances[0].emit(result); await promise
  })

  it('labels zero-strength output as an unchanged selected-channel reference', async () => {
    const promise = renderVocal(request({ options: { ...DEFAULT_VOCAL_OPTIONS, strength: 0 } }), new AbortController().signal, vi.fn())
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1))
    FakeWorker.instances[0].emit({ ...result, trackedPercent: 0 })
    const output = await promise
    expect(output.fileName).toBe('声轨-原声对照.wav')
    expect(output.warnings[0]).toContain('0%')
    expect(output.warnings.join('')).not.toContain('稳定跟随旋律的片段较少')
  })

  it('releases the decoder before processing and returns original-rate preview metadata', async () => {
    mocks.probe.mockResolvedValue({ sampleRate: 16000, channels: 2, duration: 1000 })
    mocks.readFile.mockResolvedValue(new Uint8Array(new Float32Array(16000 * 20).buffer))
    const promise = renderVocal(request({ previewStart: 100, options: { ...DEFAULT_VOCAL_OPTIONS, channel: 'right' } }), new AbortController().signal, vi.fn())
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1))
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(mocks.exec).toHaveBeenCalledWith(expect.arrayContaining(['-ss', '100', '-t', '20', 'aformat=sample_fmts=flt,pan=mono|c0=c1']))
    FakeWorker.instances[0].emit(result)
    expect(await promise).toMatchObject({ sampleRate: 16000, channels: 1, frames: 320000, start: 100, preview: true, fileName: '声轨-主唱净化-试听.wav' })
  })
  it.each([
    [{ duration: 601, sampleRate: 16000, channels: 1 }, null, 'original', '最多 10 分钟'],
    [{ duration: 100, sampleRate: 192000, channels: 2 }, null, 'original', '128 MB'],
    [{ duration: 1, sampleRate: 16000, channels: 1 }, 1, 'original', '须小于'],
    [{ duration: 1, sampleRate: 16000, channels: 1 }, null, 'right', '没有独立的右声道'],
    [{ duration: null, sampleRate: 16000, channels: 1 }, null, 'original', '无法确定'],
    [{ duration: 1, sampleRate: 4000, channels: 1 }, null, 'original', '8–192 kHz'],
    [{ duration: 1, sampleRate: 48000, channels: 6 }, null, 'original', '单声道或立体声'],
  ] as const)('rejects unsupported input %j without decoding or creating a worker', async (info, previewStart, channel, message) => {
    mocks.probe.mockResolvedValue(info)
    await expect(renderVocal(request({ previewStart, options: { ...DEFAULT_VOCAL_OPTIONS, channel } }), new AbortController().signal, vi.fn())).rejects.toThrow(message)
    expect(mocks.exec).not.toHaveBeenCalled(); expect(FakeWorker.instances).toHaveLength(0)
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })
  it('rejects truncated decoded PCM instead of exporting a shorter result', async () => {
    mocks.readFile.mockResolvedValue(new Uint8Array(16000 * 4 / 2))
    await expect(renderVocal(request(), new AbortController().signal, vi.fn())).rejects.toThrow('解码时长与原片段不符')
    expect(FakeWorker.instances).toHaveLength(0); expect(mocks.dispose).toHaveBeenCalledOnce()
  })
})
