import { describe, expect, it, vi } from 'vitest'
import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { parseAudioProbe, probeAudio } from './probe'

const json = JSON.stringify({ streams: [{ sample_rate: '48000', channels: 2, duration: 'N/A' }], format: { duration: '123.456' } })
describe('lightweight audio metadata probe', () => {
  it('uses stream specs and container duration without inventing defaults', () => {
    expect(parseAudioProbe(json)).toEqual({ sampleRate: 48000, channels: 2, duration: 123.456 })
    expect(parseAudioProbe('{"streams":[{"sample_rate":"96000","channels":6}]}')).toEqual({ sampleRate: 96000, channels: 6, duration: null })
  })
  it.each(['{}', '{"streams":[]}', '{"streams":[{"sample_rate":"NaN","channels":2}]}', '{"streams":[{"sample_rate":"44100","channels":0}]}', 'null', 'invalid'])('rejects malformed probe %s', value => {
    expect(() => parseAudioProbe(value)).toThrow()
  })
  it('accepts the pinned core -1 quirk only with valid metadata and always removes the probe file', async () => {
    const api = { ffprobe: vi.fn(async () => -1), readFile: vi.fn(async () => json), deleteFile: vi.fn(async () => {}) }
    expect((await probeAudio(api as unknown as FFmpeg, 'input.wav')).duration).toBe(123.456)
    expect(api.ffprobe).toHaveBeenCalledWith(expect.arrayContaining(['-select_streams', 'a:0']))
    api.readFile.mockResolvedValueOnce('{}')
    await expect(probeAudio(api as unknown as FFmpeg, 'input.wav')).rejects.toThrow()
    expect(api.deleteFile).toHaveBeenCalledTimes(2)
  })
})
