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
  format: AudioOutputFormat
  quality: AudioQualityPreset
  qualityMode: AudioQualityMode
  customBitrateKbps: number
  sampleRate: AudioSampleRate
  channels: AudioChannels
  preserveMetadata: boolean
}

export interface AudioConversionRequest {
  file: File
  options: AudioConversionOptions
  metadata: AudioMetadata
  coverFile: File | null
}

export interface AudioConversionResult {
  blob: Blob
  fileName: string
  format: AudioOutputFormat
  durationMs: number
  warnings: string[]
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
  format: 'mp3',
  quality: 'standard',
  qualityMode: 'preset',
  customBitrateKbps: 192,
  sampleRate: 'original',
  channels: 'original',
  preserveMetadata: true,
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

export const MAX_AUDIO_FILES = 20
export const MAX_AUDIO_FILE_SIZE = 100 * 1024 * 1024
export const MAX_AUDIO_BATCH_SIZE = 500 * 1024 * 1024
