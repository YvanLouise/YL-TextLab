import { describe, expect, it } from 'vitest'
import { readFloatWave } from '../audio-subtraction/audio'
import { cleanVocalPcm } from './process'
import { cleanVocalWave } from './output'
import { DEFAULT_VOCAL_OPTIONS, validateVocalOptions } from './types'

function amplitude(samples: Float32Array, rate: number, hz: number, channels = 1, start = .25, end = .75) {
  let real = 0, imaginary = 0, count = 0
  for (let i = Math.round(start * rate); i < Math.round(end * rate); i++) {
    const value = samples[i * channels]
    real += value * Math.cos(2 * Math.PI * hz * i / rate); imaginary += value * Math.sin(2 * Math.PI * hz * i / rate); count++
  }
  return Math.hypot(real, imaginary) * 2 / count
}
const tone = (hz: number, t: number) => Math.sin(2 * Math.PI * hz * t)
const mixture = (rate: number) => Float32Array.from({ length: rate }, (_, i) =>
  .3 * tone(220, i / rate) + .12 * tone(440, i / rate) + .06 * tone(660, i / rate) + .04 * tone(330, i / rate))

describe('dominant vocal cleanup', () => {
  it.each([16000, 44100, 48000])('preserves the lead harmonics while reducing a weaker overlapping voice at %i Hz', rate => {
    const input = mixture(rate), copy = input.slice(), progress: number[] = []
    const result = cleanVocalPcm(input, rate, 1, DEFAULT_VOCAL_OPTIONS, value => progress.push(value))
    expect(amplitude(result.samples, rate, 220)).toBeGreaterThan(.285)
    expect(amplitude(result.samples, rate, 440)).toBeGreaterThan(.112)
    expect(amplitude(result.samples, rate, 330)).toBeLessThan(.023)
    expect(result.trackedPercent).toBeGreaterThan(90)
    expect(result.samples.length).toBe(input.length)
    expect(input).toEqual(copy)
    expect(result.samples.every((value, i) => Math.abs(value + result.removed[i] - input[i]) < 1e-7)).toBe(true)
    expect(progress.at(-1)).toBe(100)
    expect(progress.every((value, i) => !i || value >= progress[i - 1])).toBe(true)
  })

  it('preserves antiphase stereo instead of cancelling it while estimating the melody', () => {
    const mono = mixture(16000)
    const stereo = Float32Array.from({ length: mono.length * 2 }, (_, i) => mono[Math.floor(i / 2)] * (i % 2 ? -1 : 1))
    const result = cleanVocalPcm(stereo, 16000, 2, DEFAULT_VOCAL_OPTIONS)
    expect(amplitude(result.samples, 16000, 220, 2)).toBeGreaterThan(.285)
    expect(result.samples.every((value, i) => i % 2 || Math.abs(value + result.samples[i + 1]) < 1e-7)).toBe(true)
  })

  it('follows pitch changes and vibrato without replacing the vocal waveform with synthesized notes', () => {
    const rate = 16000
    let phase = 0
    const source = Float32Array.from({ length: rate * 2 }, (_, i) => {
      const t = i / rate, hz = (t < 1 ? 220 : 330) * (1 + .012 * Math.sin(t * 2 * Math.PI * 5))
      phase += 2 * Math.PI * hz / rate
      return .3 * Math.sin(phase) + .1 * Math.sin(phase * 2) + .05 * Math.sin(phase * 3)
    })
    const output = cleanVocalPcm(source, rate, 1, DEFAULT_VOCAL_OPTIONS).samples
    const error = Math.sqrt(output.reduce((sum, value, i) => sum + (value - source[i]) ** 2, 0) / output.length)
    expect(error).toBeLessThan(.025)
  })

  it('reduces quiet noise between phrases and leaves silence stable', () => {
    const rate = 16000
    let seed = 5
    const source = Float32Array.from({ length: rate * 2 }, (_, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return (seed / 4294967296 - .5) * .0004 + (i < rate ? .3 * tone(220, i / rate) : 0)
    })
    const output = cleanVocalPcm(source, rate, 1, DEFAULT_VOCAL_OPTIONS).samples
    const energy = (values: Float32Array) => values.subarray(rate * 1.5).reduce((sum, value) => sum + value ** 2, 0)
    expect(energy(output)).toBeLessThan(energy(source) * .4)
    const silent = cleanVocalPcm(new Float32Array(rate), rate, 1, DEFAULT_VOCAL_OPTIONS)
    expect(silent.samples.every(value => value === 0)).toBe(true)
    expect(silent.trackedPercent).toBe(0)
  })

  it('protects high-frequency articulation and permits stronger suppression when disabled', () => {
    const rate = 16000
    const source = mixture(rate).map((value, i) => value + .03 * tone(2750, i / rate))
    const natural = cleanVocalPcm(source, rate, 1, DEFAULT_VOCAL_OPTIONS)
    const strong = cleanVocalPcm(source, rate, 1, { ...DEFAULT_VOCAL_OPTIONS, strength: 85, protectConsonants: false })
    expect(amplitude(natural.samples, rate, 2750)).toBeGreaterThan(.024)
    expect(amplitude(strong.samples, rate, 2750)).toBeLessThan(.01)
    expect(amplitude(strong.samples, rate, 330)).toBeLessThan(amplitude(natural.samples, rate, 330))
  })

  it('bypasses exactly at zero intensity and exports full-length floating-point WAV', () => {
    const source = mixture(16000)
    const output = cleanVocalPcm(source, 16000, 1, { ...DEFAULT_VOCAL_OPTIONS, strength: 0 })
    expect(output.samples).toEqual(source)
    expect(output.removed.every(value => value === 0)).toBe(true)
    const bytes = cleanVocalWave(source, 16000, 1, { ...DEFAULT_VOCAL_OPTIONS, strength: 0 }).clean, wave = readFloatWave(bytes)
    expect(wave.sampleRate).toBe(16000)
    expect(wave.channels).toBe(1)
    expect(wave.samples).toBe(source.length)
    expect(source.every((value, i) => wave.view.getFloat32(wave.dataOffset + i * 4, true) === value)).toBe(true)
  })

  it('rejects invalid options and samples before producing audio', () => {
    expect(() => validateVocalOptions({ ...DEFAULT_VOCAL_OPTIONS, strength: NaN })).toThrow()
    expect(() => validateVocalOptions({ ...DEFAULT_VOCAL_OPTIONS, gateDb: 0 })).toThrow()
    expect(() => cleanVocalPcm(new Float32Array([NaN]), 16000, 1, DEFAULT_VOCAL_OPTIONS)).toThrow('无效采样')
    expect(() => cleanVocalPcm(new Float32Array(3), 16000, 2, DEFAULT_VOCAL_OPTIONS)).toThrow('音频规格无效')
  })

  it('writes into caller-owned buffers without retaining old values or mutating its source', () => {
    const input = mixture(16000), copy = input.slice()
    const expected = cleanVocalPcm(input, 16000, 1, DEFAULT_VOCAL_OPTIONS)
    const buffers = { samples: new Float32Array(input.length).fill(100), removed: new Float32Array(input.length).fill(100) }
    const actual = cleanVocalPcm(input, 16000, 1, DEFAULT_VOCAL_OPTIONS, undefined, buffers)
    expect(actual.samples).toBe(buffers.samples); expect(actual.removed).toBe(buffers.removed)
    expect(actual.samples).toEqual(expected.samples); expect(actual.removed).toEqual(expected.removed)
    expect(input).toEqual(copy)
    expect(() => cleanVocalPcm(input, 16000, 1, DEFAULT_VOCAL_OPTIONS, undefined, { samples: input, removed: buffers.removed })).toThrow('缓冲区无效')
    expect(() => cleanVocalPcm(input, 16000, 1, DEFAULT_VOCAL_OPTIONS, undefined, { samples: buffers.samples, removed: buffers.samples })).toThrow('缓冲区无效')
  })

  it('emits complete float WAVs whose sum reconstructs every input sample', () => {
    const input = mixture(48000), result = cleanVocalWave(input, 48000, 1, DEFAULT_VOCAL_OPTIONS)
    const clean = readFloatWave(result.clean), removed = readFloatWave(result.removed)
    expect(clean.sampleRate).toBe(48000); expect(clean.channels).toBe(1); expect(clean.samples).toBe(input.length)
    expect(removed.sampleRate).toBe(clean.sampleRate); expect(removed.samples).toBe(clean.samples)
    expect(input.every((value, i) => Math.abs(value - clean.view.getFloat32(clean.dataOffset + i * 4, true)
      - removed.view.getFloat32(removed.dataOffset + i * 4, true)) < 1e-7)).toBe(true)
    expect(result.clean.byteLength).toBe(input.byteLength + 56)
    expect(result.removed.byteLength).toBe(input.byteLength + 56)
  })

  it('clears supplied buffers on silent and zero-strength fast paths', () => {
    const input = new Float32Array(8000), buffers = { samples: new Float32Array(8000).fill(1), removed: new Float32Array(8000).fill(1) }
    const output = cleanVocalPcm(input, 8000, 1, DEFAULT_VOCAL_OPTIONS, undefined, buffers)
    expect(output.samples).toEqual(input); expect(output.removed).toEqual(input)
    const bypass = cleanVocalPcm(mixture(8000), 8000, 1, { ...DEFAULT_VOCAL_OPTIONS, strength: 0 }, undefined, buffers)
    expect(bypass.samples).toEqual(mixture(8000)); expect(bypass.removed).toEqual(input)
  })
})
