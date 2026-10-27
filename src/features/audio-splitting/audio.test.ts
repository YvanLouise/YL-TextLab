import { describe, expect, it } from 'vitest'
import { MAX_AUDIO_FILE_SIZE } from '../audio-conversion/types'
import {
  buildSplitCommand,
  clampSplitRange,
  createSplitFileName,
  createWaveformPeaks,
  formatPreciseTime,
  inspectSplitSource,
  parsePreciseTime,
  normalizeSplitFileName,
  clampWaveformView,
} from './audio'

describe('audio splitting helpers', () => {
  it.each(['wav', 'mp4'] as const)('accepts a 500 MB %s source and rejects one byte more', async format => {
    const file = (size: number) => Object.defineProperty(new File(['RIFF----WAVE'], `large.${format}`), 'size', { value: size })
    await expect(inspectSplitSource(file(500 * 1024 * 1024))).resolves.toEqual({ kind: format === 'wav' ? 'audio' : 'video', format })
    await expect(inspectSplitSource(file(MAX_AUDIO_FILE_SIZE + 1))).rejects.toThrow('单个音频或视频文件不能超过 500 MB')
  })

  it('formats and parses precise timestamps', () => {
    expect(formatPreciseTime(86.25)).toBe('01:26.250')
    expect(formatPreciseTime(3661.005)).toBe('01:01:01.005')
    expect(parsePreciseTime('01:26.250')).toBe(86.25)
    expect(parsePreciseTime('01:01:01.005')).toBe(3661.005)
    expect(parsePreciseTime('01:75.000')).toBeNull()
    for (const value of [':', '00:', '1.5:00', '01:1e1', '00:01.1234', '00: 20']) expect(parsePreciseTime(value)).toBeNull()
    expect(parsePreciseTime('90:00.010')).toBe(5400.01)
  })

  it('includes the tail of uneven sample blocks and bounds zoom windows', () => {
    expect(createWaveformPeaks(new Float32Array([0, 0, 0, 0, 1]), 2)).toEqual([0, 1])
    expect(createWaveformPeaks(new Float32Array([1]), 240)).toEqual([1])
    expect(clampWaveformView(8, 4, 10)).toEqual({ start: 6, end: 10 })
    expect(clampWaveformView(-2, 4, 10)).toEqual({ start: 0, end: 4 })
    expect(clampWaveformView(0, 20, 10)).toEqual({ start: 0, end: 10 })
  })

  it('normalizes custom output extensions and rejects invalid export ranges', () => {
    expect(normalizeSplitFileName('音乐?.ogg', 'wav')).toBe('音乐_.wav')
    expect(normalizeSplitFileName('CON.wav', 'wav')).toBe('_CON.wav')
    expect(normalizeSplitFileName('  ', 'mp3')).toBe('audio.mp3')
    expect(() => buildSplitCommand('in', 'out', 'wav', 'wav', 2, 1)).toThrow('10 毫秒')
    expect(() => buildSplitCommand('in', 'out', 'wav', 'wav', 0, 0.009)).toThrow('10 毫秒')
    expect(() => buildSplitCommand('in', 'out', 'wav', 'wav', 0.2, 0.21)).not.toThrow()
  })

  it('clamps ranges and builds an accurate re-encoding command', () => {
    expect(clampSplitRange(-3, 20, 10)).toEqual({ start: 0, end: 10 })
    expect(buildSplitCommand('input.mp3', 'output.mp3', 'mp3', 'original', 2.5, 8.75)).toEqual([
      '-i', 'input.mp3', '-map', '0:a:0', '-vn',
      '-af', 'asetpts=N/SR/TB,atrim=start=2.500:duration=6.250,asetpts=PTS-STARTPTS',
      '-map_metadata', '0', '-c:a', 'libmp3lame', '-b:a', '192k', '-id3v2_version', '3', 'output.mp3',
    ])
  })

  it('recognizes video sources and extracts their first audio track as MP3', async () => {
    const video = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], 'clip.webm', { type: 'video/webm' })
    await expect(inspectSplitSource(video)).resolves.toEqual({ kind: 'video', format: 'webm' })
    expect(buildSplitCommand('input.webm', 'output.mp3', 'webm', 'mp3', 1.25, 3.5)).toEqual([
      '-i', 'input.webm', '-map', '0:a:0', '-vn',
      '-af', 'asetpts=N/SR/TB,atrim=start=1.250:duration=2.250,asetpts=PTS-STARTPTS',
      '-map_metadata', '0', '-c:a', 'libmp3lame', '-b:a', '192k', '-id3v2_version', '3', 'output.mp3',
    ])
    expect(createSplitFileName('clip.webm', 'webm', 'mp3', 1.25, 3.5)).toBe('clip_片段_00-01-250_00-03-500.mp3')
  })

  it('creates safe output names and waveform peaks', () => {
    expect(createSplitFileName('demo?.mp3', 'mp3', 'wav', 1, 2.5)).toBe('demo__片段_00-01-000_00-02-500.wav')
    expect(createWaveformPeaks(new Float32Array([0, -0.2, 0.5, -1]), 2)).toEqual([0.20000000298023224, 1])
  })
})
