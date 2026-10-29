import type { MidiSource } from '../audio-midi/types'

export const MAX_SPECTRAL_REGIONS = 50
export const MAX_SPECTRAL_PCM_BYTES = 128 * 1024 * 1024
export interface SpectralRegion { id: string; start: number; end: number; lowHz: number; highHz: number }
export interface SpectralEditResult {
  blob: Blob
  preview: MidiSource
  sampleRate: number
  channels: number
  frames: number
  peak: number
  warnings: string[]
}
export type SpectralRenderer = (file: File, regions: SpectralRegion[], fftSize: number, signal: AbortSignal,
  onProgress: (message: string, percent?: number) => void) => Promise<SpectralEditResult>

export function validateRegions(regions: SpectralRegion[], duration: number, nyquist = 192000) {
  if (!regions.length || regions.length > MAX_SPECTRAL_REGIONS) throw new Error(`请选择 1–${MAX_SPECTRAL_REGIONS} 个去除区域。`)
  for (const region of regions) {
    if (![region.start, region.end, region.lowHz, region.highHz].every(Number.isFinite)
      || region.start < 0 || region.end <= region.start || region.end > duration + .02
      || region.lowHz < 0 || region.highHz <= region.lowHz || region.highHz > nyquist) {
      throw new Error(`区域参数无效：时间须在音频内，最低频率须小于最高频率，且不能超过 ${nyquist} Hz。`)
    }
  }
}
