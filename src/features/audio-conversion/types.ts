export type AudioInputFormat =
  | 'mp3'
  | 'wav'
  | 'flac'
  | 'm4a'
  | 'aac'
  | 'ogg'
  | 'opus'
  | 'wma'
  | 'aiff'

export type AudioOutputFormat = Exclude<AudioInputFormat, 'wma' | 'aiff'>

export type AudioQualityPreset = 'compact' | 'standard' | 'high'
export type AudioQualityMode = 'preset' | 'custom'
export type AudioProcessingMode = 'transcode' | 'metadata-only' | 'lossless'
export type WavMetadataEncoding = 'gbk' | 'utf-8'
export type AudioSampleRate = 'original' | 44100 | 48000
export type AudioChannels = 'original' | 'mono' | 'stereo'

export interface AudioMetadata {
  title: string
  artist: string
  album: string
  year: string
  track: string
  genre: string
  comment: string
}

export interface AudioConversionOptions {
  mode: AudioProcessingMode
  format: AudioOutputFormat
  quality: AudioQualityPreset
  qualityMode: AudioQualityMode
  customBitrateKbps: number
  sampleRate: AudioSampleRate
  channels: AudioChannels
  preserveMetadata: boolean
  wavMetadataEncoding: WavMetadataEncoding
}

export interface AudioConversionRequest {
  file: File
  inputFormat: AudioInputFormat
  options: AudioConversionOptions
  metadata: AudioMetadata
  coverFile: File | null
}

export interface AudioConversionResult {
  blob: Blob
  fileName: string
  format: AudioInputFormat
  durationMs: number
  warnings: string[]
  lossless?: LosslessAudioInfo & { verified: true; keptOriginal?: boolean }
}

export interface LosslessAudioInfo {
  sampleRate: number
  bitDepth: number
  channels: number
  sampleFrames: number
}

export type AudioQueueStatus =
  | 'queued'
  | 'converting'
  | 'done'
  | 'error'
  | 'cancelled'

export interface AudioQueueItem {
  id: string
  file: File
  inputFormat: AudioInputFormat | null
  relativePath?: string
  sourceUrl: string
  duration: number | null
  status: AudioQueueStatus
  progress: number
  error: string | null
  result: AudioConversionResult | null
  resultUrl: string | null
  metadata: AudioMetadata
  metadataExpanded: boolean
  coverFile: File | null
  coverUrl: string | null
}

export interface AudioConversionEngine {
  load(): Promise<void>
  convert(
    request: AudioConversionRequest,
    onProgress?: (progress: number) => void,
  ): Promise<AudioConversionResult>
  cancel(): void
  dispose(): void
}

export type AudioEngineFactory = () => Promise<AudioConversionEngine>

export class AudioConversionError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AudioConversionError'
    this.code = code
  }
}

export const DEFAULT_AUDIO_OPTIONS: AudioConversionOptions = {
  mode: 'transcode',
  format: 'mp3',
  quality: 'standard',
  qualityMode: 'preset',
  customBitrateKbps: 192,
  sampleRate: 'original',
  channels: 'original',
  preserveMetadata: true,
  wavMetadataEncoding: 'gbk',
}

export const EMPTY_AUDIO_METADATA: AudioMetadata = {
  title: '',
  artist: '',
  album: '',
  year: '',
  track: '',
  genre: '',
  comment: '',
}

export const MAX_AUDIO_FILES = 100
export const MAX_AUDIO_FILE_SIZE = 500 * 1024 * 1024
export const MAX_AUDIO_BATCH_SIZE = 2 * 1024 ** 3
export const AUDIO_FILE_SIZE_LIMIT_LABEL = `${MAX_AUDIO_FILE_SIZE / 1024 ** 2} MB`
export const AUDIO_BATCH_SIZE_LIMIT_LABEL = `${MAX_AUDIO_BATCH_SIZE / 1024 ** 3} GB`
