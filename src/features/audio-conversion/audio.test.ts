import { describe, expect, it } from 'vitest'
import {
  buildAudioCommand,
  detectAudioFormat,
  formatAudioDuration,
  outputFileName,
  outputMime,
  qualityLabel,
  validateAudioBatch,
} from './audio'
import { DEFAULT_AUDIO_OPTIONS, MAX_AUDIO_FILE_SIZE } from './types'

function bytes(value: string) {
  return new Uint8Array([...value].map((character) => character.charCodeAt(0)))
}

describe('audio conversion helpers', () => {
  it('detects common containers by header and distinguishes Opus from OGG', () => {
    const wav = new Uint8Array(12)
    wav.set(bytes('RIFF'), 0)
    wav.set(bytes('WAVE'), 8)
    expect(detectAudioFormat(wav)).toBe('wav')
    expect(detectAudioFormat(bytes('fLaC'))).toBe('flac')
    expect(detectAudioFormat(bytes('OggS----OpusHead'))).toBe('opus')
    expect(detectAudioFormat(bytes('OggS----vorbis'))).toBe('ogg')
    expect(detectAudioFormat(bytes('ID3'))).toBe('mp3')
  })

  it('uses safe output names, extensions and MIME types', () => {
    expect(outputFileName('demo/song.WMA', 'm4a')).toBe('demo_song.m4a')
    expect(outputFileName('  .wav', 'flac')).toBe('audio.flac')
    expect(outputMime('mp3')).toBe('audio/mpeg')
    expect(outputMime('opus')).toContain('opus')
  })

  it('maps practical quality presets per codec', () => {
    expect(qualityLabel('mp3', 'standard')).toBe('192k')
    expect(qualityLabel('m4a', 'high')).toBe('256k')
    expect(qualityLabel('ogg', 'compact')).toBe('Vorbis Q3')
    expect(qualityLabel('flac', 'high')).toBe('无损')
    expect(qualityLabel('wav', 'compact')).toBe('PCM 16-bit')
  })

  it('builds metadata, cover, sample-rate and channel arguments', () => {
    const command = buildAudioCommand('input.flac', 'output.mp3', {
      ...DEFAULT_AUDIO_OPTIONS,
      quality: 'high',
      sampleRate: 48000,
      channels: 'stereo',
    })
    expect(command).toEqual(expect.arrayContaining([
      '-map_metadata', '0', '-c:a', 'libmp3lame', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    ]))
    expect(command).toContain('0:v:0?')

    const fallback = buildAudioCommand('input.flac', 'output.mp3', DEFAULT_AUDIO_OPTIONS, false)
    expect(fallback).toContain('-vn')
    expect(fallback).not.toContain('0:v:0?')
  })

  it('uses lossless codecs and omits cover mapping for unsupported containers', () => {
    expect(buildAudioCommand('in.mp3', 'out.wav', { ...DEFAULT_AUDIO_OPTIONS, format: 'wav' }))
      .toEqual(expect.arrayContaining(['-vn', '-c:a', 'pcm_s16le']))
    expect(buildAudioCommand('in.mp3', 'out.flac', { ...DEFAULT_AUDIO_OPTIONS, format: 'flac' }))
      .toEqual(expect.arrayContaining(['-c:a', 'flac', '-compression_level', '5']))
  })

  it('enforces file count and batch size limits', () => {
    const small = new File(['audio'], 'track.mp3')
    expect(validateAudioBatch([], [small, small])).toEqual({ accepted: [small, small], ignored: 0 })
    const tooLarge = new File([new Uint8Array(1)], 'large.wav')
    Object.defineProperty(tooLarge, 'size', { value: MAX_AUDIO_FILE_SIZE + 1 })
    expect(() => validateAudioBatch([], [tooLarge])).toThrow('500 MB')
  })

  it('formats durations for tracks and long recordings', () => {
    expect(formatAudioDuration(65)).toBe('1:05')
    expect(formatAudioDuration(3661)).toBe('1:01:01')
    expect(formatAudioDuration(null)).toBe('--:--')
  })
})
