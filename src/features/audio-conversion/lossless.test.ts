import { describe, expect, it, vi } from 'vitest'
import { inspectLosslessAudio, inspectLosslessFile, verifyLosslessAudio } from './lossless'

const info = { sampleRate: 48000, bitDepth: 24, channels: 2, sampleFrames: 100 }
const hash = `SHA256=${'a'.repeat(64)}\n`

describe('lossless validation', () => {
  it('seeks past a large PCM payload to trailing format metadata without reading the samples', async () => {
    const payload = 128 * 1024 * 1024
    const header = new Uint8Array(20)
    const fmt = new Uint8Array(24)
    const text = new TextEncoder()
    const headView = new DataView(header.buffer)
    const fmtView = new DataView(fmt.buffer)
    header.set(text.encode('RIFF')); headView.setUint32(4, payload + 36, true)
    header.set(text.encode('WAVEdata'), 8); headView.setUint32(16, payload, true)
    fmt.set(text.encode('fmt ')); fmtView.setUint32(4, 16, true); fmtView.setUint16(8, 1, true)
    fmtView.setUint16(10, 2, true); fmtView.setUint32(12, 48000, true); fmtView.setUint32(16, 192000, true)
    fmtView.setUint16(20, 4, true); fmtView.setUint16(22, 16, true)
    const slice = vi.fn((start: number, end: number) => {
      if (start < 20) return new Blob([header.slice(start, end)])
      if (start >= payload + 20) return new Blob([fmt.slice(start - payload - 20, end - payload - 20)])
      throw new Error('PCM payload must not be loaded')
    })
    const source = { size: payload + 44, slice } as unknown as Blob
    await expect(inspectLosslessFile(source, 'wav')).resolves.toEqual({ sampleRate: 48000, bitDepth: 16, channels: 2, sampleFrames: payload / 4 })
    expect(slice.mock.calls.reduce((total, [start, end]) => total + end - start, 0)).toBe(44)
    headView.setUint32(4, payload + 37, true)
    await expect(inspectLosslessFile(source, 'wav')).rejects.toThrow('无法完整读取音频参数')
  })

  it.each([
    { sampleRate: 44100 }, { bitDepth: 16 }, { channels: 1 }, { sampleFrames: 99 }, { sampleFrames: 0 },
  ])('rejects changed audio parameters %j', change => {
    expect(() => verifyLosslessAudio(info, { ...info, ...change }, hash, hash)).toThrow('无损校验未通过')
  })

  it('requires valid equal sample hashes and accepts unknown source frame counts', () => {
    expect(() => verifyLosslessAudio(info, info, '', '')).toThrow('无损校验未通过')
    expect(() => verifyLosslessAudio(info, info, hash, hash.replace('a', 'b'))).toThrow('无损校验未通过')
    expect(() => verifyLosslessAudio({ ...info, sampleFrames: 0 }, info, hash, hash)).not.toThrow()
  })

  it.each(['wav', 'aiff', 'flac'] as const)('rejects truncated %s before attempting to encode', format => {
    expect(() => inspectLosslessAudio(new Uint8Array(), format)).toThrow('无法完整读取音频参数')
  })
})
