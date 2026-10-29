import { describe, expect, it } from 'vitest'
import { readFloatWave } from '../audio-subtraction/audio'
import { encodeSpectralWave, removeSpectralRegions } from './process'
import { validateRegions, type SpectralRegion } from './types'

const region = (overrides: Partial<SpectralRegion> = {}): SpectralRegion => ({ id: 'region', start: .5, end: 1.5, lowHz: 350, highHz: 550, ...overrides })
function tones(rate: number, seconds = 2, channels = 1) {
  return Float32Array.from({ length: rate * seconds * channels }, (_, i) => {
    const frame = Math.floor(i / channels), sign = i % channels === 1 ? -1 : 1
    return sign * (.3 * Math.sin(2 * Math.PI * 440 * frame / rate) + .2 * Math.sin(2 * Math.PI * 1760 * frame / rate))
  })
}
function amplitude(samples: Float32Array, rate: number, hz: number, channels = 1, channel = 0, start = .8, end = 1.2) {
  let real = 0, imaginary = 0, count = 0
  for (let i = Math.round(start * rate); i < Math.round(end * rate); i++) {
    const value = samples[i * channels + channel]
    real += value * Math.cos(2 * Math.PI * hz * i / rate); imaginary += value * Math.sin(2 * Math.PI * hz * i / rate); count++
  }
  return Math.hypot(real, imaginary) * 2 / count
}

describe('spectral region removal', () => {
  it.each([16000, 22050, 44100, 48000, 96000])('removes only the selected band and times at %i Hz', rate => {
    const input = tones(rate), original = input.slice(), progress: number[] = []
    const result = removeSpectralRegions(input, rate, 1, [region()], value => progress.push(value))
    expect(amplitude(result.samples, rate, 440)).toBeLessThan(.0003)
    expect(amplitude(result.samples, rate, 1760)).toBeCloseTo(.2, 4)
    expect(result.samples.every((value, i) => i >= rate * .5 && i < rate * 1.5 || value === original[i])).toBe(true)
    expect(result.samples.length).toBe(original.length)
    expect(progress.at(-1)).toBe(100)
    expect(progress.every((value, i) => i === 0 || value > progress[i - 1])).toBe(true)
  })

  it('preserves stereo channel order and antiphase instead of averaging channels', () => {
    const input = tones(22050, 2, 2)
    const result = removeSpectralRegions(input, 22050, 2, [region()])
    expect(amplitude(result.samples, 22050, 440, 2, 0)).toBeLessThan(.0003)
    expect(amplitude(result.samples, 22050, 1760, 2, 1)).toBeCloseTo(.2, 4)
    expect(result.samples.every((value, i) => i % 2 || Math.abs(value + result.samples[i + 1]) < 1e-6)).toBe(true)
  })

  it('reconstructs the beginning and end correctly, including full-band removal and DC', () => {
    const source = Float32Array.from({ length: 8000 }, (_, i) => .2 + .2 * Math.sin(i * .3))
    const result = removeSpectralRegions(source, 8000, 1, [region({ start: 0, end: 1, lowHz: 0, highHz: 4000 })])
    expect(result.peak).toBeLessThan(1e-6)
    expect(result.samples.every(value => Math.abs(value) < 1e-6)).toBe(true)
  })

  it('combines duplicate regions without double subtraction and keeps silence stable', () => {
    const input = tones(16000)
    const single = removeSpectralRegions(input.slice(), 16000, 1, [region()]).samples
    const duplicate = removeSpectralRegions(input.slice(), 16000, 1, [region(), region({ id: 'second' })]).samples
    expect(duplicate.every((value, i) => value === single[i])).toBe(true)
    expect(removeSpectralRegions(new Float32Array(16000), 8000, 1, [region()]).peak).toBe(0)
  })

  it('applies short selections without shifting or deleting time samples', () => {
    const input = tones(16000), original = input.slice()
    const result = removeSpectralRegions(input, 16000, 1, [region({ start: .501, end: .521 })])
    expect(result.samples.length).toBe(original.length)
    expect(result.samples.every((value, i) => i >= 8016 && i < 8336 || value === original[i])).toBe(true)
    expect(result.samples.some((value, i) => value !== original[i])).toBe(true)
  })

  it('supports high-frequency numeric regions outside the piano-roll display', () => {
    const rate = 48000
    const source = Float32Array.from({ length: rate * 2 }, (_, i) => .2 * Math.sin(2 * Math.PI * 12000 * i / rate))
    const result = removeSpectralRegions(source, rate, 1, [region({ lowHz: 11000, highHz: 13000 })])
    expect(amplitude(result.samples, rate, 12000)).toBeLessThan(.0001)
  })

  it('validates malformed and out-of-range regions, sample data and memory limits', () => {
    for (const invalid of [region({ start: -1 }), region({ end: .3 }), region({ highHz: 9000 }), region({ lowHz: NaN }), region({ end: 20 })]) {
      expect(() => removeSpectralRegions(tones(16000), 16000, 1, [invalid])).toThrow()
    }
    expect(() => removeSpectralRegions(tones(16000), 16000, 3, [region()])).toThrow()
    expect(() => removeSpectralRegions(Float32Array.of(NaN), 16000, 1, [region()])).toThrow()
    expect(() => validateRegions([], 2)).toThrow()
    expect(() => validateRegions(new Array(51).fill(region()), 2)).toThrow()
  })

  it('encodes a direct float WAV with exact samples, frame count and sample rate', () => {
    const samples = Float32Array.of(.25, -.25, 1.1, -1.1, 0, 0)
    const bytes = encodeSpectralWave(samples, 48000, 2), wave = readFloatWave(bytes)
    expect(wave.sampleRate).toBe(48000); expect(wave.channels).toBe(2); expect(wave.sampleFrames).toBe(3)
    expect(Array.from(samples).every((value, i) => wave.view.getFloat32(wave.dataOffset + i * 4, true) === value)).toBe(true)
  })
})
