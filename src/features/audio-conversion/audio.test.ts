import { describe, expect, it } from 'vitest'
import {
  buildAudioCommand,
  detectAudioFormat,
  effectiveBitrateKbps,
  estimateAudioOutputSize,
  formatAudioDuration,
  inspectAudioFile,
  metadataOutputFileName,
  outputFileName,
  outputMime,
  qualityLabel,
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
    expect(outputMime('wma')).toBe('audio/x-ms-wma')
    expect(metadataOutputFileName('demo/song.WMA', 'wma')).toBe('demo_song-已编辑.wma')
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

    const fallback = buildAudioCommand('input.flac', 'output.mp3', DEFAULT_AUDIO_OPTIONS, { includeCover: false })
    expect(fallback).toContain('-vn')
    expect(fallback).not.toContain('0:v:0?')
  })

  it('supports custom bitrate and estimates output size from duration', () => {
    const options = { ...DEFAULT_AUDIO_OPTIONS, qualityMode: 'custom' as const, customBitrateKbps: 224 }
    expect(effectiveBitrateKbps(options)).toBe(224)
    expect(buildAudioCommand('in.wav', 'out.mp3', options)).toEqual(expect.arrayContaining(['-b:a', '224k']))
    expect(estimateAudioOutputSize(60, options)).toBeGreaterThan(1_700_000)
    expect(estimateAudioOutputSize(60, { ...options, format: 'flac' })).toBeNull()
  })

  it('writes edited song information and an optional replacement cover', () => {
    const command = buildAudioCommand('input.flac', 'output.mp3', DEFAULT_AUDIO_OPTIONS, {
      metadata: {
        title: '新标题',
        artist: 'YL',
        album: '本地专辑',
        year: '2026',
        track: '2/8',
        genre: 'Pop',
        comment: '仅在本机编辑',
      },
      coverPath: 'cover.png',
    })
    expect(command.slice(0, 4)).toEqual(['-i', 'input.flac', '-i', 'cover.png'])
    expect(command).toEqual(expect.arrayContaining([
      '-map', '1:v:0',
      '-metadata', 'title=新标题',
      '-metadata', 'artist=YL',
      '-metadata', 'date=2026',
      '-metadata', 'track=2/8',
    ]))
  })

  it('copies the original audio stream when only editing song information', () => {
    const options = { ...DEFAULT_AUDIO_OPTIONS, mode: 'metadata-only' as const }
    const command = buildAudioCommand('input.mp3', 'output.mp3', options, {
      outputFormat: 'mp3',
      metadata: {
        title: '仅修改标题',
        artist: '',
        album: '',
        year: '',
        track: '',
        genre: '',
        comment: '',
      },
    })
    expect(command).toEqual(expect.arrayContaining(['-c:a', 'copy', '-metadata', 'title=仅修改标题']))
    expect(command).not.toContain('libmp3lame')
    expect(command).not.toContain('-b:a')
    expect(command).not.toContain('-ar')
    expect(command).not.toContain('-ac')
    expect(estimateAudioOutputSize(60, options)).toBeNull()
  })

  it('uses lossless codecs and omits cover mapping for unsupported containers', () => {
    expect(buildAudioCommand('in.mp3', 'out.wav', { ...DEFAULT_AUDIO_OPTIONS, format: 'wav' }))
      .toEqual(expect.arrayContaining(['-vn', '-c:a', 'pcm_s16le']))
    expect(buildAudioCommand('in.mp3', 'out.flac', { ...DEFAULT_AUDIO_OPTIONS, format: 'flac' }))
      .toEqual(expect.arrayContaining(['-c:a', 'flac', '-compression_level', '5']))
  })

  it('accepts files above the previous limit up to exactly 500 MB', async () => {
    for (const size of [101 * 1024 * 1024, 500 * 1024 * 1024]) {
      const file = Object.defineProperty(new File([bytes('RIFF----WAVE')], 'large.wav'), 'size', { value: size })
      await expect(inspectAudioFile(file)).resolves.toBe('wav')
    }
  })

  it('rejects one byte above the single-file limit', async () => {
    const oversized = Object.defineProperty(new File(['RIFF----WAVE'], 'large.wav'), 'size', { value: MAX_AUDIO_FILE_SIZE + 1 })
    await expect(inspectAudioFile(oversized)).rejects.toThrow('单个音频文件不能超过 500 MB')
  })

  it('formats durations for tracks and long recordings', () => {
    expect(formatAudioDuration(65)).toBe('1:05')
    expect(formatAudioDuration(3661)).toBe('1:01:01')
    expect(formatAudioDuration(null)).toBe('--:--')
  })
})
