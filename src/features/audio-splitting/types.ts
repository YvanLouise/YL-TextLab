import type { AudioInputFormat } from '../audio-conversion/types'

export type VideoInputFormat = 'mp4' | 'mov' | 'm4v' | 'webm' | 'mkv' | 'avi'
export type AudioSplitInputFormat = AudioInputFormat | VideoInputFormat
export type AudioSplitSourceKind = 'audio' | 'video'
export type AudioSplitOutputFormat = 'original' | 'mp3' | 'wav'

export interface AudioSplitSource {
  kind: AudioSplitSourceKind
  format: AudioSplitInputFormat
}

export interface AudioSplitRequest {
  file: File
  inputFormat: AudioSplitInputFormat
  sourceKind: AudioSplitSourceKind
  startSeconds: number
  endSeconds: number
  outputFormat: AudioSplitOutputFormat
  fileName: string
}

export interface AudioSplitResult {
  blob: Blob
  fileName: string
  durationMs: number
}

export interface AudioSplitEngine {
  load(): Promise<void>
  probe(file: File): Promise<number>
  split(request: AudioSplitRequest, onProgress?: (progress: number) => void): Promise<AudioSplitResult>
  cancel(): void
  dispose(): void
}

export type AudioSplitEngineFactory = () => Promise<AudioSplitEngine>
