import { fft } from '../../utils/fft'
import { MAX_VOCAL_PCM_BYTES, VOCAL_RANGES, validateVocalOptions, type VocalOptions } from './types'

export interface VocalPcmBuffers { samples: Float32Array; removed: Float32Array }
export interface VocalPcmResult extends VocalPcmBuffers { trackedPercent: number; outputGain: number }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export function validateVocalPcm(input: Float32Array, sampleRate: number, channels: number) {
  if (![1, 2].includes(channels) || !input.length || input.length % channels || input.byteLength > MAX_VOCAL_PCM_BYTES
    || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('音频规格无效，或解码后超过 128 MB。请先截取较短片段。')
}

function compilePitches(low: number, high: number, binHz: number, sampleRate: number) {
  const pitches = Array.from({ length: Math.ceil(48 * Math.log2(high / low)) + 1 }, (_, i) => {
    const hz = low * 2 ** (i / 48), bins: number[] = [], fractions: number[] = []
    for (let harmonic = 1; harmonic <= 10 && hz * harmonic < Math.min(6500, sampleRate / 2); harmonic++) {
      const bin = hz * harmonic / binHz
      bins.push(Math.floor(bin)); fractions.push(bin - Math.floor(bin))
    }
    return { hz, bins, fractions, nearLow: i, nearHigh: i }
  })
  // Candidates are a quarter semitone apart. Preserve the exact original continuity boundary.
  for (let i = 0; i < pitches.length; i++) {
    for (let j = Math.max(0, i - 8); j <= Math.min(pitches.length - 1, i + 8); j++) {
      if (Math.abs(12 * Math.log2(pitches[j].hz / pitches[i].hz)) < 2) {
        pitches[i].nearLow = Math.min(pitches[i].nearLow, j); pitches[i].nearHigh = Math.max(pitches[i].nearHigh, j)
      }
    }
  }
  return pitches
}

// A soft harmonic mask follows the dominant pitch; it cannot distinguish voices on the same harmonics.
export function cleanVocalPcm(input: Float32Array, sampleRate: number, channels: number, options: VocalOptions,
  progress: (percent: number) => void = () => {}, buffers?: VocalPcmBuffers): VocalPcmResult {
  validateVocalOptions(options)
  validateVocalPcm(input, sampleRate, channels)
  const frames = input.length / channels, strength = options.strength / 100
  let size = 1024
  while (size < sampleRate * .085) size *= 2
  const half = size / 2, hop = size / 4, binHz = sampleRate / size
  let maxRms = 0
  // Validate and measure in one pass; a single spike must not set the gate for the whole song.
  for (let at = 0; at < input.length; at += hop * channels) {
    const end = Math.min(input.length, at + hop * channels)
    let energy = 0
    for (let i = at; i < end; i++) {
      const value = input[i]
      if (!Number.isFinite(value)) throw new Error('音频包含无效采样。')
      energy += value ** 2
    }
    maxRms = Math.max(maxRms, Math.sqrt(energy / (end - at)))
  }
  const output = buffers?.samples ?? new Float32Array(input.length)
  const removed = buffers?.removed ?? new Float32Array(input.length)
  if (output.length !== input.length || removed.length !== input.length || output.buffer === input.buffer
    || removed.buffer === input.buffer || output.buffer === removed.buffer) throw new Error('净化输出缓冲区无效。')
  if (!strength || !maxRms) {
    output.set(input); removed.fill(0); progress(100)
    return { samples: output, removed, trackedPercent: 0, outputGain: 1 }
  }
  output.fill(0)
  const window = Float64Array.from({ length: size }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / size))
  const normalization = Float64Array.from({ length: hop }, (_, i) => {
    let sum = 0
    for (let j = i; j < size; j += hop) sum += window[j] ** 2
    return sum
  })
  const synthesisWindow = Float64Array.from(window, (value, i) => value / size / normalization[i % hop])
  const real = Array.from({ length: channels }, () => new Float64Array(size))
  const imaginary = Array.from({ length: channels }, () => new Float64Array(size))
  const power = new Float64Array(half + 1), magnitude = new Float64Array(half + 1)
  const mask = new Float64Array(half + 1).fill(1), harmonicMask = new Float64Array(half + 1)
  const [low, high] = VOCAL_RANGES[options.range]
  const pitches = compilePitches(low, high, binHz, sampleRate)
  const harmonicWeights = Float64Array.from({ length: 10 }, (_, i) => .78 ** i)
  const floor = 10 ** (-24 * strength / 20)
  const lowCut = Float64Array.from({ length: half + 1 }, (_, bin) => bin * binHz < 50 ? floor + (1 - floor) * (bin * binHz / 50) ** 2 : 1)
  const gateThreshold = Math.min(10 ** (options.gateDb / 20), maxRms * .1)
  let lastPitch = -1, cachedPitch = -1, gap = 0, tracked = 0, active = 0, gate = 1, lastProgress = -1
  for (let center = -half + hop; center < frames + half; center += hop) {
    power.fill(0)
    let energy = 0
    for (let channel = 0; channel < channels; channel++) {
      imaginary[channel].fill(0)
      for (let i = 0; i < size; i++) {
        const frame = center - half + i
        const value = frame >= 0 && frame < frames ? input[frame * channels + channel] : 0
        real[channel][i] = value * window[i]
        energy += value ** 2 * window[i] ** 2
      }
      fft(real[channel], imaginary[channel])
      for (let bin = 0; bin <= half; bin++) power[bin] += (real[channel][bin] ** 2 + imaginary[channel][bin] ** 2) / channels
    }
    let peak = 0, bandEnergy = 0, bins = 0
    for (let bin = 0; bin <= half; bin++) {
      magnitude[bin] = Math.sqrt(power[bin])
      if (bin * binHz >= low && bin * binHz < Math.min(6000, sampleRate / 2)) {
        peak = Math.max(peak, magnitude[bin]); bandEnergy += power[bin]; bins++
      }
    }
    const rms = Math.sqrt(energy / (size * .375 * channels))
    const isActive = rms > Math.max(1e-8, maxRms * .015)
    if (isActive && center >= 0 && center < frames) active++
    let pitch = -1, bestScore = 0
    const tonal = peak > Math.sqrt(bandEnergy / Math.max(1, bins)) * 4
    if (isActive && tonal) {
      for (let index = 0; index < pitches.length; index++) {
        const candidate = pitches[index]
        let score = 0
        for (let harmonic = 0; harmonic < candidate.bins.length; harmonic++) {
          const bin = candidate.bins[harmonic], fraction = candidate.fractions[harmonic]
          const amplitude = magnitude[bin] * (1 - fraction) + magnitude[bin + 1] * fraction
          score += amplitude * harmonicWeights[harmonic]
        }
        // A small continuity preference avoids chasing a weaker harmony between adjacent frames.
        if (lastPitch >= 0 && index >= pitches[lastPitch].nearLow && index <= pitches[lastPitch].nearHigh) score *= 1.08
        if (score > bestScore) { bestScore = score; pitch = index }
      }
    }
    if (pitch >= 0) { lastPitch = pitch; gap = 0; if (center >= 0 && center < frames) tracked++ }
    else if (++gap * hop / sampleRate > .12) lastPitch = -1
    if (pitch >= 0 && pitch !== cachedPitch) {
      const hz = pitches[pitch].hz
      for (let bin = 0; bin <= half; bin++) {
        const frequency = bin * binHz, harmonic = Math.max(1, Math.round(frequency / hz))
        const distance = Math.abs(frequency - harmonic * hz)
        const width = Math.min(hz * .4, Math.max(binHz * 2.2, harmonic * hz * .018))
        const harmonicGain = Math.exp(-.5 * (distance / width) ** 4)
        let gain = floor + (1 - floor) * harmonicGain
        if (options.protectConsonants && frequency > 2500) gain = Math.max(gain, 1 - .35 * strength)
        harmonicMask[bin] = gain
      }
      cachedPitch = pitch
    }
    const desiredGate = gateThreshold > 0 ? floor + (1 - floor) * clamp((rms / gateThreshold - .25) / .75, 0, 1) : 1
    gate += (desiredGate - gate) * (desiredGate > gate ? .8 : .15)
    for (let bin = 0; bin <= half; bin++) {
      let gain = pitch >= 0 ? harmonicMask[bin] : 1
      // Gentle spectral gating only attenuates bins far below the frame's strongest component.
      const noiseRatio = peak > 0 ? clamp(magnitude[bin] / (peak * .012), 0, 1) : 1
      gain *= 1 - strength * .35 * (1 - noiseRatio)
      gain *= gate
      gain *= lowCut[bin]
      // Slow attenuation, fast recovery, and Hann overlap-add protect onsets and release tails.
      const speed = gain > mask[bin] ? .85 : .35
      mask[bin] += (gain - mask[bin]) * speed
    }
    for (let channel = 0; channel < channels; channel++) {
      for (let bin = 0; bin < size; bin++) {
        const gain = mask[bin <= half ? bin : size - bin]
        real[channel][bin] *= gain; imaginary[channel][bin] *= -gain
      }
      fft(real[channel], imaginary[channel])
      for (let i = 0; i < size; i++) {
        const frame = center - half + i
        if (frame >= 0 && frame < frames) output[frame * channels + channel] += real[channel][i] * synthesisWindow[i]
      }
    }
    const percent = clamp(Math.floor(center / frames * 96), 0, 96)
    if (percent !== lastProgress) { lastProgress = percent; progress(percent) }
  }
  let peak = 0
  for (const sample of output) peak = Math.max(peak, Math.abs(sample))
  const outputGain = peak > .999 ? .999 / peak : 1
  for (let i = 0; i < output.length; i++) { output[i] *= outputGain; removed[i] = input[i] - output[i] }
  progress(100)
  return { samples: output, removed, trackedPercent: active ? Math.round(tracked / active * 100) : 0, outputGain }
}
