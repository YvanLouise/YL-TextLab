import { fft } from '../../utils/fft'
import { MAX_SPECTRAL_PCM_BYTES, validateRegions, type SpectralRegion } from './types'

export interface SpectralPcmResult { samples: Float32Array; peak: number; fftSize: number }

export function removeSpectralRegions(samples: Float32Array, sampleRate: number, channels: number, regions: SpectralRegion[],
  onProgress: (percent: number) => void = () => {}): SpectralPcmResult {
  if (![1, 2].includes(channels) || samples.length % channels || !samples.length || samples.byteLength > MAX_SPECTRAL_PCM_BYTES
    || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 384000) throw new Error('音频规格无效或解码数据超过 128 MB，请先截取较短片段。')
  const length = samples.length / channels, duration = length / sampleRate
  validateRegions(regions, duration, sampleRate / 2)
  for (const value of samples) if (!Number.isFinite(value)) throw new Error('音频包含无效采样。')
  let size = 2048
  while (size < sampleRate * .09 && size < 32768) size *= 2
  const hop = size / 4, half = size / 2, binWidth = sampleRate / size
  const window = Float64Array.from({ length: size }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / size))
  const norm = Float64Array.from({ length: hop }, (_, i) => {
    let sum = 0
    for (let j = i; j < size; j += hop) sum += window[j] ** 2
    return sum
  })
  const real = new Float64Array(size), imaginary = new Float64Array(size), mask = new Float64Array(half + 1)
  const removed = new Float32Array(samples.length)
  const prepared = regions.map(region => ({ ...region,
    frequency: Float64Array.from({ length: half + 1 }, (_, bin) => {
      const hz = bin * binWidth, feather = Math.min(binWidth * 2, (region.highHz - region.lowHz) / 4)
      if (hz < region.lowHz || hz > region.highHz) return 0
      const edge = Math.min(region.lowHz === 0 ? 1 : (hz - region.lowHz) / feather,
        region.highHz === sampleRate / 2 ? 1 : (region.highHz - hz) / feather, 1)
      return .5 - .5 * Math.cos(Math.PI * edge)
    }),
  }))
  let previous = -1
  for (let center = -half + hop; center < length + half; center += hop) {
    const time = center / sampleRate, cell = hop / sampleRate
    const active = prepared.map(region => ({ region, weight: Math.max(0,
      Math.min(time + cell / 2, region.end >= duration ? Infinity : region.end)
      - Math.max(time - cell / 2, region.start === 0 ? -Infinity : region.start)) / cell })).filter(item => item.weight > 0)
    if (active.length) {
      mask.fill(0)
      for (let bin = 0; bin <= half; bin++) {
        for (const { region, weight } of active) mask[bin] = Math.max(mask[bin], region.frequency[bin] * weight)
      }
      for (let channel = 0; channel < channels; channel++) {
        imaginary.fill(0)
        for (let i = 0; i < size; i++) {
          const frame = center - half + i
          real[i] = (frame >= 0 && frame < length ? samples[frame * channels + channel] : 0) * window[i]
        }
        fft(real, imaginary)
        for (let bin = 0; bin < size; bin++) {
          const gain = mask[bin <= half ? bin : size - bin]
          real[bin] *= gain; imaginary[bin] *= -gain
        }
        fft(real, imaginary)
        for (let i = 0; i < size; i++) {
          const frame = center - half + i
          if (frame >= 0 && frame < length) removed[frame * channels + channel] += real[i] / size * window[i] / norm[frame % hop]
        }
      }
    }
    const percent = Math.max(0, Math.min(95, Math.round(center / length * 95)))
    if (percent !== previous) { previous = percent; onProgress(percent) }
  }
  // Only the selected times are changed. A short inward fade reduces edge clicks.
  let peak = 0
  for (let frame = 0; frame < length; frame++) {
    const time = frame / sampleRate
    let weight = 0
    for (const region of regions) {
      if (time < region.start || time >= region.end) continue
      const feather = Math.min(.01, (region.end - region.start) / 4)
      const edge = Math.min(region.start === 0 ? 1 : (time - region.start) / feather,
        region.end >= duration ? 1 : (region.end - time) / feather, 1)
      weight = Math.max(weight, .5 - .5 * Math.cos(Math.PI * edge))
    }
    for (let channel = 0; channel < channels; channel++) {
      const index = frame * channels + channel
      samples[index] -= removed[index] * weight
      peak = Math.max(peak, Math.abs(samples[index]))
    }
  }
  onProgress(100)
  return { samples, peak, fftSize: size }
}

export function encodeSpectralWave(samples: Float32Array, sampleRate: number, channels: number) {
  const bytes = new Uint8Array(56 + samples.byteLength), view = new DataView(bytes.buffer)
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i) }
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * 4, true)
  view.setUint16(32, channels * 4, true); view.setUint16(34, 32, true)
  text(36, 'fact'); view.setUint32(40, 4, true); view.setUint32(44, samples.length / channels, true)
  text(48, 'data'); view.setUint32(52, samples.byteLength, true)
  samples.forEach((value, i) => view.setFloat32(56 + i * 4, value, true))
  return bytes
}
