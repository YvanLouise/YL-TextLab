import { describe, expect, it } from 'vitest'
import {
  buildSplitCommand,
  clampSplitRange,
  createSplitFileName,
  createWaveformPeaks,
  formatPreciseTime,
  inspectSplitSource,
  parsePreciseTime,
} from './audio'

describe('audio splitting helpers', () => {
  it('formats and parses precise timestamps', () => {
    expect(formatPreciseTime(86.25)).toBe('01:26.250')
    expect(formatPreciseTime(3661.005)).toBe('01:01:01.005')
    expect(parsePreciseTime('01:26.250')).toBe(86.25)
    expect(parsePreciseTime('01:01:01.005')).toBe(3661.005)
    expect(parsePreciseTime('01:75.000')).toBeNull()
  })

  it('clamps ranges and builds an accurate re-encoding command', () => {
    expect(clampSplitRange(-3, 20, 10)).toEqual({ start: 0, end: 10 })
    expect(buildSplitCommand('input.mp3', 'output.mp3', 'mp3', 'original', 2.5, 8.75)).toEqual([
      '-i', 'input.mp3', '-ss', '2.500', '-t', '6.250', '-map', '0:a:0', '-vn',
      '-map_metadata', '0', '-c:a', 'libmp3lame', '-b:a', '192k', '-id3v2_version', '3', 'output.mp3',
    ])
  })

  it('recognizes video sources and extracts their first audio track as MP3', async () => {
    const video = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], 'clip.webm', { type: 'video/webm' })
    await expect(inspectSplitSource(video)).resolves.toEqual({ kind: 'video', format: 'webm' })
    expect(buildSplitCommand('input.webm', 'output.mp3', 'webm', 'mp3', 1.25, 3.5)).toEqual([
      '-i', 'input.webm', '-ss', '1.250', '-t', '2.250', '-map', '0:a:0', '-vn',
      '-map_metadata', '0', '-c:a', 'libmp3lame', '-b:a', '192k', '-id3v2_version', '3', 'output.mp3',
    ])
    expect(createSplitFileName('clip.webm', 'webm', 'mp3', 1.25, 3.5)).toBe('clip_片段_00-01-250_00-03-500.mp3')
  })

  it('creates safe output names and waveform peaks', () => {
    expect(createSplitFileName('demo?.mp3', 'mp3', 'wav', 1, 2.5)).toBe('demo__片段_00-01-000_00-02-500.wav')
    expect(createWaveformPeaks(new Float32Array([0, -0.2, 0.5, -1]), 2)).toEqual([0.20000000298023224, 1])
  })
})
