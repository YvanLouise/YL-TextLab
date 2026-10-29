import type { AudioInputFormat } from '../audio-conversion/types'

export interface AudioSubtractOptions {
  gainB: number
  offsetMs: number
  preventClipping: boolean
  invertB?: boolean
  autoAlign?: boolean
  searchRadiusMs?: number
  reductionStrength?: number
  protectUnmatched?: boolean
}

export const DEFAULT_SUBTRACT_OPTIONS: AudioSubtractOptions = {
  gainB: 1,
  offsetMs: 0,
  preventClipping: true,
}

export const MAX_SUBTRACT_OUTPUT_BYTES = 256 * 1024 * 1024

export interface AudioSubtractSource {
  file: File
  format: AudioInputFormat
}

export interface AudioSubtractInfo {
  sampleRate: number
  channels: number
  duration: number | null
}

export interface AudioSubtractRequest {
  a: AudioSubtractSource
  b: AudioSubtractSource
  options: AudioSubtractOptions
  fileName: string
}

export interface AudioSubtractProgress {
  stage: 'analyzing' | 'matching' | 'subtracting' | 'finishing' | 'measuring'
  percent?: number
}

export interface AudioLevelPoint {
  peak: number
  rms: number
}

export interface AudioLevelSeries extends AudioLevelPoint {
  points: AudioLevelPoint[]
}

export interface AudioLevelComparison {
  sampleRate: number
  sampleFrames: number
  framesPerPoint: number
  a: AudioLevelSeries
  b: AudioLevelSeries
  beforeProtection: AudioLevelSeries
  c: AudioLevelSeries
}

export interface AudioSubtractResult {
  blob: Blob
  fileName: string
  sampleRate: number
  channels: number
  sampleFrames: number
  duration: number
  elapsedMs: number
  peak: number
  outputGain: number
  offsetSamples: number
  warnings: string[]
  alignment?: AudioAlignmentResult
  levels?: AudioLevelComparison
  protection?: AudioSubtractProtection
}

export interface AudioSubtractProtection {
  matchedWindows: number
  totalWindows: number
  matchedSeconds: number
  preservedSeconds: number
  windowSeconds: number
}

export interface AudioAlignmentResult {
  offsetSamples: number
  gainB: number
  appliedGainB: number
  invertB: boolean
  correlation: number
  confidence: 'high' | 'medium'
  matchedWindows: number
  analyzedWindows: number
  warnings: string[]
}

export interface AudioSubtractEngine {
  load(): Promise<void>
  subtract(request: AudioSubtractRequest, onProgress?: (value: AudioSubtractProgress) => void): Promise<AudioSubtractResult>
  cancel(): void
  dispose(): void
}

export type AudioSubtractEngineFactory = () => Promise<AudioSubtractEngine>
