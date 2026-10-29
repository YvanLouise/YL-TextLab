export type VocalChannel = 'original' | 'center' | 'left' | 'right'
export type VocalRange = 'auto' | 'low' | 'high'
export interface VocalOptions {
  strength: number
  gateDb: number
  range: VocalRange
  channel: VocalChannel
  protectConsonants: boolean
}
export const DEFAULT_VOCAL_OPTIONS: VocalOptions = { strength: 35, gateDb: -50, range: 'auto', channel: 'original', protectConsonants: true }
export const VOCAL_RANGES = { auto: [70, 1000], low: [65, 450], high: [160, 1200] } as const
export const MAX_VOCAL_PCM_BYTES = 128 * 1024 * 1024
export const MAX_VOCAL_SECONDS = 600
export const VOCAL_PREVIEW_SECONDS = 20
export interface VocalRequest { file: File; options: VocalOptions; previewStart: number | null }
export interface VocalResult {
  blob: Blob
  removed: Blob
  fileName: string
  sampleRate: number
  channels: number
  frames: number
  start: number
  preview: boolean
  trackedPercent: number
  outputGain: number
  warnings: string[]
}
export type VocalProgress = (message: string, percent: number) => void
export type VocalRenderer = (request: VocalRequest, signal: AbortSignal, progress: VocalProgress) => Promise<VocalResult>

export function validateVocalOptions(options: VocalOptions) {
  if (!Number.isFinite(options.strength) || options.strength < 0 || options.strength > 100
    || !Number.isFinite(options.gateDb) || options.gateDb < -80 || options.gateDb > -20
    || !Object.hasOwn(VOCAL_RANGES, options.range) || !['original', 'center', 'left', 'right'].includes(options.channel)
    || typeof options.protectConsonants !== 'boolean') throw new Error('净化参数无效，请恢复默认设置后重试。')
}
