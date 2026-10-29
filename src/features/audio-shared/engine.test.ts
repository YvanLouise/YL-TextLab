import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalAudioEngine, MAX_AUDIO_OUTPUT_BYTES, boundedAudioCommand, mountAudioFile, readAudioOutput } from './engine'
import type { FFmpeg } from '@ffmpeg/ffmpeg'

const state = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: function () { return state.create() } }))
const deferred = () => { let resolve = () => {}; const promise = new Promise<void>(accept => { resolve = accept }); return { promise, resolve } }
function transport(load = async () => {}) {
  const api = { loaded: false, load: vi.fn(async () => { await load(); api.loaded = true }), terminate: vi.fn(),
    createDir: vi.fn(async () => {}), deleteDir: vi.fn(async () => {}), mount: vi.fn(async () => true), unmount: vi.fn(async () => {}), readFile: vi.fn() }
  return api
}
class TestEngine extends LocalAudioEngine {
  async run(wait: Promise<void>) {
    const operation = this.beginOperation()
    try { await this.ready(); operation.check(); await wait; operation.check() } finally { operation.finish() }
  }
}
beforeEach(() => { vi.stubGlobal('Worker', class {}); vi.resetAllMocks() })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('shared audio engine', () => {
  it('deduplicates loading and immediately cancels a stalled load before retrying', async () => {
    const old = deferred(), first = transport(() => old.promise), second = transport()
    state.create.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const engine = new LocalAudioEngine(), pending = engine.load().catch(error => error)
    const duplicate = engine.load().catch(error => error)
    await Promise.resolve()
    expect(first.load).toHaveBeenCalledOnce()
    engine.cancel()
    expect(await pending).toMatchObject({ name: 'AbortError' })
    expect(await duplicate).toMatchObject({ name: 'AbortError' })
    await engine.load(); old.resolve(); await Promise.resolve()
    expect(await engine.ready()).toBe(second)
    engine.dispose(); expect(first.terminate).toHaveBeenCalledOnce(); expect(second.terminate).toHaveBeenCalledOnce()
  })

  it('times out stalled initialization, releases the worker and can load again', async () => {
    vi.useFakeTimers()
    const first = transport(() => new Promise(() => {})), second = transport()
    state.create.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const engine = new LocalAudioEngine(), pending = engine.load().catch(error => error)
    await vi.advanceTimersByTimeAsync(90001)
    expect(await pending).toMatchObject({ code: 'ENGINE_TIMEOUT' })
    expect(first.terminate).toHaveBeenCalledOnce()
    await engine.load(); engine.dispose()
  })

  it('rejects overlapping jobs and late cancellation cleanup cannot unlock a newer job', async () => {
    state.create.mockImplementation(() => transport())
    const engine = new TestEngine(), first = deferred(), second = deferred()
    const oldJob = engine.run(first.promise).catch(error => error)
    await Promise.resolve(); await Promise.resolve()
    await expect(engine.run(Promise.resolve())).rejects.toMatchObject({ code: 'ENGINE_BUSY' })
    engine.cancel()
    const newJob = engine.run(second.promise)
    first.resolve()
    expect(await oldJob).toMatchObject({ name: 'AbortError' })
    await expect(engine.run(Promise.resolve())).rejects.toMatchObject({ code: 'ENGINE_BUSY' })
    second.resolve(); await newJob; await engine.run(Promise.resolve()); engine.dispose()
  })

  it('mounts the original File by reference and releases all mount resources', async () => {
    const api = transport(), file = new File(['audio'], 'song.wav')
    const wholeRead = vi.fn(); Object.defineProperty(file, 'arrayBuffer', { value: wholeRead })
    const input = await mountAudioFile(api as unknown as FFmpeg, file)
    expect(wholeRead).not.toHaveBeenCalled()
    expect(api.mount).toHaveBeenCalledWith('WORKERFS', { blobs: [{ name: 'input.wav', data: file }] }, expect.stringMatching(/^\/source-/))
    await input.release(); expect(api.unmount).toHaveBeenCalledOnce(); expect(api.deleteDir).toHaveBeenCalledOnce()
    api.mount.mockResolvedValueOnce(false)
    await expect(mountAudioFile(api as unknown as FFmpeg, file)).rejects.toMatchObject({ code: 'ENGINE_UNAVAILABLE' })
    expect(api.deleteDir).toHaveBeenCalledTimes(2)
  })

  it('caps every audio output and refuses empty or capped files instead of publishing truncated downloads', async () => {
    expect(boundedAudioCommand(['-i', 'in.wav', '-c:a', 'pcm_s16le', 'left.wav', '-c:a', 'pcm_s16le', 'right.wav'], ['left.wav', 'right.wav']))
      .toEqual(['-i', 'in.wav', '-c:a', 'pcm_s16le', '-fs', String(MAX_AUDIO_OUTPUT_BYTES), 'left.wav', '-c:a', 'pcm_s16le', '-fs', String(MAX_AUDIO_OUTPUT_BYTES), 'right.wav'])
    const api = transport(); api.readFile.mockResolvedValueOnce(new Uint8Array()).mockResolvedValueOnce({ length: MAX_AUDIO_OUTPUT_BYTES }).mockResolvedValueOnce(new Uint8Array([1, 2]))
    await expect(readAudioOutput(api as unknown as FFmpeg, 'out')).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    await expect(readAudioOutput(api as unknown as FFmpeg, 'out')).rejects.toMatchObject({ code: 'OUTPUT_TOO_LARGE' })
    expect(await readAudioOutput(api as unknown as FFmpeg, 'out')).toEqual(new Uint8Array([1, 2]))
  })
})
