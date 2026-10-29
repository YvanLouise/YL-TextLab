import { afterEach, describe, expect, it, vi } from 'vitest'
import { FfmpegAudioEngine } from './runtime'
import { FfmpegAudioSplitEngine } from '../audio-splitting/runtime'

const transport = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: function () { return transport.create() } }))

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

describe.each([['conversion', FfmpegAudioEngine], ['splitting', FfmpegAudioSplitEngine]] as const)('%s loading lifecycle', (_name, Engine) => {
  it('terminates an in-flight load and does not overwrite a newer engine', async () => {
    vi.stubGlobal('Worker', class {})
    let finish = () => {}
    const old = { loaded: false, load: vi.fn(() => new Promise<void>((resolve) => { finish = resolve })), terminate: vi.fn() }
    const current = { loaded: false, load: vi.fn(async () => { current.loaded = true }), terminate: vi.fn() }
    transport.create.mockReturnValueOnce(old).mockReturnValueOnce(current)
    const engine = new Engine()
    const pending = engine.load().then(() => null, (error: unknown) => error)
    engine.cancel()
    const terminatedDuringLoad = old.terminate.mock.calls.length
    await engine.load()
    finish()
    expect(await pending).toMatchObject({ name: 'AbortError' })
    expect(terminatedDuringLoad).toBe(1)
    await engine.load()
    expect(current.load).toHaveBeenCalledOnce()
    engine.dispose()
    expect(current.terminate).toHaveBeenCalledOnce()
  })
})
