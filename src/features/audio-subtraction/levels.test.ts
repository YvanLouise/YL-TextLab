import { describe, expect, it } from 'vitest'
import { compactLevels, formatLevel, levelWindowFrames, parseLevelMetadata, summarizeLevels } from './levels'
import { createProtectionEnvelope, planProtectedSubtraction, protectionWindowFrames } from './protection'
import type { AudioLevelComparison } from './types'

const metadata = (frames: number, peak: string, rms: string) => `frame:0 pts:0 pts_time:0\nlavfi.astats.Overall.Peak_level=${peak}\nlavfi.astats.Overall.RMS_level=${rms}\nlavfi.astats.Overall.Number_of_samples=${frames}\n`
function readBlob(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

describe('whole-track level measurement', () => {
  it('weights a partial final window by its actual frame count, not by dB or window count', () => {
    const series = parseLevelMetadata(metadata(4, '0', '0') + metadata(1, '-inf', '-inf'), 5, 4)
    expect(series).toMatchObject({ peak: 1, rms: Math.sqrt(4 / 5) })
    expect(series.points).toEqual([{ peak: 1, rms: 1 }, { peak: 0, rms: 0 }])
    expect(formatLevel(0)).toBe('−∞ dBFS（静音）')
    expect(formatLevel(.5)).toBe('-6.02 dBFS')
    expect(formatLevel(.000001)).toBe('-120.00 dBFS')
  })

  it('rejects missing, partial, nonfinite or extra metadata instead of drawing false silence', () => {
    for (const text of ['', metadata(4, '0', '0'), metadata(5, 'NaN', '0'), metadata(5, 'inf', '0'), metadata(5, '0', '0') + metadata(1, '0', '0')]) {
      expect(() => parseLevelMetadata(text, 5, 5)).toThrow()
    }
  })

  it('keeps the complete timeline and peak while bounding chart size', () => {
    expect(levelWindowFrames(8000001)).toBe(10001)
    const series = summarizeLevels([{ peak: .5, rms: .5 }, { peak: 1, rms: 1 }, { peak: 0, rms: 0 }], 9, 4)
    const compact = compactLevels(series, 9, 4, 2)
    expect(compact.points).toHaveLength(2)
    expect(compact.points[0]).toEqual({ peak: 1, rms: Math.sqrt(.625) })
    expect(compact.points[1]).toEqual({ peak: 0, rms: 0 })
    expect(compact.rms).toBe(series.rms)
    expect(compact.peak).toBe(series.peak)
  })
})

describe('matched-region protection', () => {
  it('requires strong positive correlation, energy reduction and no new overload', () => {
    const series = (values: number[]) => summarizeLevels(values.map(v => ({ peak: v, rms: v })), values.length, 1)
    const levels: AudioLevelComparison = { sampleRate: 1000, sampleFrames: 6, framesPerPoint: 1,
      a: series([.5, 0, .5, .5, .5, 1]), b: series([.5, .5, 0, .5, .5, .5]),
      beforeProtection: series([0, .5, .5, Math.sqrt(.5), 1, .5]), c: series([0, .5, .5, Math.sqrt(.5), 1, .5]) }
    levels.beforeProtection.points[5].peak = 1.1
    const plan = planProtectedSubtraction(levels)
    expect(plan.ranges).toEqual([{ start: 0, end: 1 }])
    expect(plan.summary).toMatchObject({ matchedWindows: 1, totalWindows: 6, matchedSeconds: .001, preservedSeconds: .005 })
    expect(protectionWindowFrames(48000, 48000)).toBe(2400)
    expect(Math.ceil(67000000 / protectionWindowFrames(67000000, 1000))).toBeLessThanOrEqual(16000)
  })

  it('fades strictly inside matched ranges and never introduces gain in protected positions', async () => {
    const envelope = createProtectionEnvelope([{ start: 20, end: 50 }, { start: 80, end: 100 }], 100, 1000)
    const samples = new Float32Array(await readBlob(envelope))
    expect(samples).toHaveLength(100)
    expect([...samples.slice(0, 20), ...samples.slice(50, 80)].every(v => v === 0)).toBe(true)
    expect(samples[20]).toBe(0); expect(samples[49]).toBe(0)
    expect(samples[24]).toBe(1); expect(samples[45]).toBe(1)
    expect(samples[99]).toBe(1)
    expect([...samples].every(v => v >= 0 && v <= 1)).toBe(true)
    const full = new Float32Array(await readBlob(createProtectionEnvelope([{ start: 0, end: 100000 }], 100000, 44100)))
    expect(full).toHaveLength(100000)
    expect(full.every(v => v === 1)).toBe(true)
    const none = new Float32Array(await readBlob(createProtectionEnvelope([], 100, 1000)))
    expect(none.every(v => v === 0)).toBe(true)
  })
})
