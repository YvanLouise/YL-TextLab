import { describe, expect, it } from 'vitest'
import { analyzeSpectrum, fft } from './spectrum'
import { MAX_PITCH, type Spectrum } from './types'

const rate = 22050
const sine = (frequency: number) => Float32Array.from({ length: rate }, (_, i) => .8 * Math.sin(2 * Math.PI * frequency * i / rate))
function strongestPitch(spectrum: Spectrum, column = Math.floor(spectrum.columns / 2)) {
  const rows = spectrum.values.slice(column * spectrum.rows, (column + 1) * spectrum.rows)
  const maximum = Math.max(...rows)
  const positions = [...rows].flatMap((value, index) => value === maximum ? [index] : [])
  return MAX_PITCH + .5 - (positions.reduce((sum, value) => sum + value, 0) / positions.length + .5) / 4
}

describe('real logarithmic frequency analysis', () => {
  it('computes FFT frequency bins', () => {
    const real = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0]), imaginary = new Float64Array(8)
    fft(real, imaginary)
    expect([...real]).toEqual(new Array(8).fill(1)); expect([...imaginary]).toEqual(new Array(8).fill(0))
  })
  it.each([[440, 69], [261.625565, 60], [110, 45]])('places %i Hz close to MIDI %i', (frequency, pitch) => {
    const spectrum = analyzeSpectrum([sine(frequency)], rate, 8192)
    expect(strongestPitch(spectrum)).toBeCloseTo(pitch, 0)
    expect(spectrum.duration).toBe(1)
  })
  it('preserves energy from antiphase stereo channels', () => {
    const mono = sine(440)
    const reference = analyzeSpectrum([mono], rate, 4096)
    const stereo = analyzeSpectrum([mono, mono.map(value => -value)], rate, 4096)
    expect(stereo.values).toEqual(reference.values)
    expect(strongestPitch(stereo)).toBeCloseTo(69, 0)
  })
  it('keeps silence black, reports completion and rejects invalid analysis settings', () => {
    const progress: number[] = []
    const spectrum = analyzeSpectrum([new Float32Array(4096)], rate, 2048, value => progress.push(value))
    expect(spectrum.values.every(value => value === 0)).toBe(true)
    expect(progress.at(-1)).toBe(100)
    expect(() => analyzeSpectrum([], rate, 4096)).toThrow()
    expect(() => analyzeSpectrum([sine(440)], rate, 1000)).toThrow()
  })
})
