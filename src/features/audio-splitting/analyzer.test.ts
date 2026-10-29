import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readMediaDuration } from '../audio-shared/media'
import { analyzeSplitAudio, MAX_WAVEFORM_BYTES, shouldDecodeWaveform, WAVEFORM_RATE } from './analyzer'

vi.mock('../audio-shared/media', () => ({ readMediaDuration: vi.fn() }))
const decode = vi.fn()
const context = vi.fn(function () { return { decodeAudioData: decode } })
const file = () => new File(['wave'], 'recording.wav')
const signal = () => new AbortController().signal

beforeEach(() => {
  vi.stubGlobal('OfflineAudioContext', context)
  vi.mocked(readMediaDuration).mockResolvedValue(2)
  decode.mockResolvedValue({ duration: 2, length: 4, numberOfChannels: 2,
    getChannelData: (channel: number) => Float32Array.from(channel ? [0, .8, -.6, 0] : [0, 0, 0, 0]) })
})
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('bounded waveform analysis', () => {
  it('skips full decoding of large, long or unknown-duration sources', async () => {
    expect(shouldDecodeWaveform(20, null)).toBe(false)
    expect(shouldDecodeWaveform(20, 601)).toBe(false)
    expect(shouldDecodeWaveform(MAX_WAVEFORM_BYTES + 1, 2)).toBe(false)
    const source = Object.defineProperty(file(), 'size', { value: MAX_WAVEFORM_BYTES + 1 })
    const read = vi.spyOn(source, 'arrayBuffer')
    const result = await analyzeSplitAudio(source, 'blob:large', 'audio', signal())
    expect(result).toMatchObject({ duration: 2, peaks: [], notice: expect.stringContaining('跳过完整波形') })
    expect(read).not.toHaveBeenCalled()
    expect(context).not.toHaveBeenCalled()
  })
  it('combines channel peaks without phase cancellation at a bounded display rate', async () => {
    const result = await analyzeSplitAudio(file(), 'blob:stereo', 'audio', signal())
    expect(context).toHaveBeenCalledWith(1, 1, WAVEFORM_RATE)
    expect(result.channels).toBe(2)
    expect(Math.max(...result.peaks)).toBeGreaterThan(.7)
  })
  it('ignores late decoding after cancellation', async () => {
    let finish!: (value: unknown) => void
    decode.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const controller = new AbortController()
    const pending = analyzeSplitAudio(file(), 'blob:pending', 'audio', controller.signal)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce())
    controller.abort(); finish({ duration: 2, length: 4, numberOfChannels: 1 })
    await assertion
  })
  it('keeps exact timing available when decoding fails, and signals unknown duration for probing', async () => {
    decode.mockRejectedValueOnce(new Error('Unsupported codec'))
    await expect(analyzeSplitAudio(file(), 'blob:fallback', 'video', signal())).resolves.toMatchObject({ duration: 2, peaks: [], notice: expect.any(String) })
    vi.mocked(readMediaDuration).mockResolvedValueOnce(null)
    await expect(analyzeSplitAudio(file(), 'blob:unknown', 'audio', signal())).rejects.toThrow('duration')
  })
})
