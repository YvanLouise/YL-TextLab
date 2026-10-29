import { describe, expect, it } from 'vitest'
import { consistentMatches, correlateWindow, type AlignmentWindow } from './alignment'

function noise(length: number, seed = 7) {
  return Float32Array.from({ length }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 4294967296 - .5) * .6 })
}
function window(channels = 1, gain = 1.25): AlignmentWindow {
  const b = noise(4096 * channels)
  const a = b.slice(512 * channels, (512 + 1024) * channels).map(value => value * gain)
  return { a, b, channels, sampleRate: 4000, baseOffset: 542, minLag: 0, maxLag: 3072 }
}

describe('normalized multi-channel correlation', () => {
  it.each([1, 2])('finds an exact lag and gain with %i channels', channels => {
    const match = correlateWindow(window(channels))
    expect(match.offsetSamples).toBe(30)
    expect(match.correlation).toBeCloseTo(1, 8)
    expect(match.signedGain).toBeCloseTo(1.25, 6)
    expect(match.prominence).toBeGreaterThan(.8)
  })
  it('detects inverted polarity and ignores constant DC offsets', () => {
    const input = window(1, -.7)
    input.a = input.a.map(value => value + .2); input.b = input.b.map(value => value - .1)
    const match = correlateWindow(input)
    expect(match.offsetSamples).toBe(30); expect(match.signedGain).toBeCloseTo(-.7, 6)
    expect(match.correlation).toBeCloseTo(1, 6)
  })
  it('retains stereo correlation even if the channels are antiphase', () => {
    const mono = window()
    const stereo = (data: Float32Array) => Float32Array.from({ length: data.length * 2 }, (_, i) => data[Math.floor(i / 2)] * (i % 2 ? -1 : 1))
    const match = correlateWindow({ ...mono, a: stereo(mono.a), b: stereo(mono.b), channels: 2 })
    expect(match.offsetSamples).toBe(30); expect(match.correlation).toBeCloseTo(1, 8)
  })
  it('finds shared content despite an independent signal in A', () => {
    const input = window(), independent = noise(input.a.length, 99)
    input.a = input.a.map((value, index) => value + .4 * independent[index])
    const match = correlateWindow(input)
    expect(match.offsetSamples).toBe(30); expect(match.correlation).toBeGreaterThan(.9)
    expect(match.signedGain).toBeCloseTo(1.25, 1)
  })
  it('does not report silence or unrelated audio as a strong match', () => {
    expect(correlateWindow({ ...window(), a: new Float32Array(1024) }).correlation).toBe(0)
    expect(correlateWindow({ ...window(), a: noise(1024, 23) }).correlation).toBeLessThan(.2)
    expect(correlateWindow({ ...window(), minLag: 700 }).correlation).toBeLessThan(.2)
  })
  it('flags a periodic signal with many equally strong alignments', () => {
    const b = Float32Array.from({ length: 4096 }, (_, i) => Math.sin(i * Math.PI / 10))
    const match = correlateWindow({ ...window(), a: b.slice(512, 1536), b })
    expect(match.correlation).toBeGreaterThan(.999); expect(match.prominence).toBeLessThan(.001)
  })
  it('rejects malformed samples and separates inconsistent delays or polarities', () => {
    const input = window(); input.a[3] = NaN
    expect(() => correlateWindow(input)).toThrow('无效采样')
    const base = correlateWindow(window())
    const matches = [base, { ...base, offsetSamples: 31 }, { ...base, offsetSamples: 100 }, { ...base, signedGain: -1.25 }]
    expect(consistentMatches(matches, 2)).toHaveLength(2)
    expect(() => correlateWindow({ ...window(), b: new Float32Array(8) })).toThrow('太短')
  })
})
