/// <reference types="node" />
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FfmpegAudioSubtractEngine } from './runtime'
import { readFloatWave, validateSubtractPair } from './audio'
import { DEFAULT_SUBTRACT_OPTIONS, type AudioSubtractOptions, type AudioSubtractRequest } from './types'
import { correlateWindow } from './alignment'

interface Core {
  exec(...args: string[]): number
  ffprobe(...args: string[]): number
  reset(): void
  FS: {
    readFile(path: string): Uint8Array; writeFile(path: string, bytes: Uint8Array): void
    unlink(path: string): void; readdir(path: string): string[]; mkdir(path: string): void; rmdir(path: string): void
  }
}
const state = vi.hoisted(() => ({ core: null as Core | null, failMeter: false }))
async function bytes(blob: Blob) {
  return new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  }))
}
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {
  loaded = false
  async load() { this.loaded = true }
  on() {}
  off() {}
  async createDir(path: string) { state.core!.FS.mkdir(path) }
  async deleteDir(path: string) { state.core!.FS.rmdir(path) }
  async mount(_type: string, options: { blobs: { name: string; data: Blob }[] }, path: string) {
    for (const blob of options.blobs) state.core!.FS.writeFile(`${path}/${blob.name}`, await bytes(blob.data))
    return true
  }
  async unmount(path: string) {
    for (const name of state.core!.FS.readdir(path).filter(name => name !== '.' && name !== '..')) state.core!.FS.unlink(`${path}/${name}`)
  }
  async readFile(path: string, encoding?: string) {
    const data = state.core!.FS.readFile(path)
    return encoding === 'utf8' ? new TextDecoder().decode(data) : data
  }
  async deleteFile(path: string) { state.core!.FS.unlink(path) }
  async exec(args: string[]) {
    if (state.failMeter && args.some(arg => arg.includes('ametadata=mode=print'))) return 1
    const code = state.core!.exec(...args); state.core!.reset(); return code
  }
  async ffprobe(args: string[]) { const code = state.core!.ffprobe(...args); state.core!.reset(); return code }
  terminate() { this.loaded = false }
} }))

function wav(samples: number[], channels = 1, sampleRate = 8000) {
  const data = Buffer.alloc(44 + samples.length * 2)
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVE', 8)
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20)
  data.writeUInt16LE(channels, 22); data.writeUInt32LE(sampleRate, 24); data.writeUInt32LE(sampleRate * channels * 2, 28)
  data.writeUInt16LE(channels * 2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((value, index) => data.writeInt16LE(value, 44 + index * 2))
  return new File([new Uint8Array(data).buffer], 'source.wav', { type: 'audio/wav' })
}

function request(a: File, b: File, options: Partial<AudioSubtractOptions> = {}): AudioSubtractRequest {
  return { a: { file: a, format: 'wav' }, b: { file: b, format: 'wav' }, options: { ...DEFAULT_SUBTRACT_OPTIONS, ...options }, fileName: 'difference.wav' }
}

async function samples(blob: Blob) {
  const wave = readFloatWave(await bytes(blob))
  return Array.from({ length: wave.samples }, (_, index) => wave.view.getFloat32(wave.dataOffset + index * 4, true))
}

let engine: FfmpegAudioSubtractEngine
beforeEach(async () => {
  state.failMeter = false
  vi.stubGlobal('Worker', class {})
  const require = createRequire(import.meta.url)
  state.core = await require('@ffmpeg/core')({ wasmBinary: readFileSync(require.resolve('@ffmpeg/core/wasm')) })
  engine = new FfmpegAudioSubtractEngine(() => ({ compare: async window => correlateWindow(window), dispose: () => {} }))
})
afterEach(() => {
  expect(state.core!.FS.readdir('/').filter(name => name.startsWith('subtract-'))).toEqual([])
  engine.dispose(); state.core = null; vi.unstubAllGlobals()
})

describe('real audio subtraction', () => {
  it('cancels identical stereo PCM exactly and preserves duration, rate and channel order', async () => {
    const input = wav(Array.from({ length: 4000 }, (_, index) => Math.round(10000 * Math.sin(index * .2))), 2)
    const result = await engine.subtract(request(input, input))
    const output = await samples(result.blob)
    expect(output).toHaveLength(4000)
    expect(output.every(value => value === 0)).toBe(true)
    expect(result).toMatchObject({ sampleRate: 8000, channels: 2, sampleFrames: 2000, duration: .25, peak: 0, outputGain: 1, fileName: 'difference.wav' })
    expect(result.blob.type).toBe('audio/wav')
    expect(result.warnings.join('')).toContain('静音')
    expect(result.levels?.a.peak).toBeCloseTo(10000 / 32768, 5)
    expect(result.levels?.a).toEqual(result.levels?.b)
    expect(result.levels?.c.peak).toBe(0)
    expect(result.levels?.c.rms).toBe(0)
    expect(result.levels?.c.points.length).toBeLessThanOrEqual(800)
  })

  it('recovers C from A = B + C without amix normalization', async () => {
    const target = [2000, -1000, 8000, -9000, 0, 100]
    const common = [6000, 5000, -12000, -4000, 50, 100]
    const result = await engine.subtract(request(wav(target.map((value, i) => value + common[i])), wav(common)))
    expect(await samples(result.blob)).toEqual(target.map(value => value / 32768))
    expect(result.outputGain).toBe(1)
    expect(result.levels?.c.rms).toBeCloseTo(Math.sqrt(target.reduce((sum, v) => sum + (v / 32768) ** 2, 0) / target.length), 7)
    expect(result.levels?.a.points).toHaveLength(target.length)
  })

  it.each([1, -1])('aligns B by exactly %i sample', async direction => {
    const early = wav([1000, -2000, 3000, 0, 0, 0])
    const late = wav([0, 1000, -2000, 3000, 0, 0])
    const result = await engine.subtract(request(direction > 0 ? late : early, direction > 0 ? early : late, { offsetMs: direction / 8 }))
    expect(await samples(result.blob)).toEqual(new Array(6).fill(0))
    expect(result.offsetSamples).toBe(direction)
    expect(result.levels?.a).toEqual(result.levels?.b)
  })

  it('subtracts rather than adds, including audible negative B when A is silent', async () => {
    const result = await engine.subtract(request(wav([0, 4000, 2000, -5000]), wav([6000, 0, 1000, -2000])))
    expect(await samples(result.blob)).toEqual([-6000, 4000, 1000, -3000].map(v => v / 32768))
    expect(result.levels?.a.points[0].peak).toBe(0)
    expect(result.levels?.b.points[0].peak).toBeCloseTo(6000 / 32768, 6)
    expect(result.levels?.c.points[0].peak).toBe(6000 / 32768)
  })

  it('shows global protection attenuation in B-silent regions without conflating it with cancellation', async () => {
    const a = wav([30000, 10000, 0]), b = wav([-30000, 0, 0])
    const raw = await engine.subtract(request(a, b, { preventClipping: false }))
    const protectedResult = await engine.subtract(request(a, b))
    expect(raw.levels?.c.points[1].peak).toBe(10000 / 32768)
    expect(protectedResult.levels?.beforeProtection.points[1].peak).toBe(10000 / 32768)
    expect(protectedResult.levels?.b.points[1].peak).toBe(0)
    expect(protectedResult.levels?.c.points[1].peak).toBeCloseTo(10000 / 32768 * protectedResult.outputGain, 7)
    expect(protectedResult.levels?.c.points[1].peak).toBeGreaterThan(0)
    expect(protectedResult.warnings.join('')).toContain('B 静音或未覆盖的位置')
  })

  it('protects A-only, B-only and unrelated regions while cancelling genuinely shared local waveforms', async () => {
    let seed = 79
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.round((seed / 4294967296 - .5) * 10000) }
    const b = Array.from({ length: 4000 }, (_, i) => i >= 800 && i < 1600 ? 0 : random())
    const target = Array.from({ length: 4000 }, () => Math.round(random() / 20))
    const a = b.map((v, i) => i < 800 ? 0 : i < 2400 ? random() : i < 3200 ? v + target[i] : -v)
    const result = await engine.subtract(request(wav(a), wav(b), { protectUnmatched: true }))
    const actual = await samples(result.blob)
    expect(result.outputGain).toBe(1)
    expect(result.protection).toMatchObject({ matchedWindows: 2, totalWindows: 10, matchedSeconds: .1, preservedSeconds: .4 })
    expect(actual.filter((_, i) => i < 2400 || i >= 3200)).toEqual(a.filter((_, i) => i < 2400 || i >= 3200).map(v => v / 32768))
    expect(actual.slice(2440, 3160).every((v, i) => v === target[i + 2440] / 32768)).toBe(true)
    expect(actual[2400]).toBe(a[2400] / 32768)
    expect(actual[3199]).toBe(a[3199] / 32768)
    expect(result.levels?.a.points).toHaveLength(10)
    expect(result.warnings.join('')).not.toContain('分析未完成')
  })

  it('cancels identical stereo sources in protected mode and safely preserves A when nothing matches', async () => {
    const source = Array.from({ length: 3200 }, (_, i) => Math.round(8000 * Math.sin(i * .17)))
    const file = wav(source, 2)
    const identical = await engine.subtract(request(file, file, { protectUnmatched: true }))
    expect((await samples(identical.blob)).every(v => v === 0)).toBe(true)
    expect(identical.protection?.preservedSeconds).toBe(0)
    const silent = await engine.subtract(request(wav(new Array(3200).fill(0), 2), file, { protectUnmatched: true }))
    expect((await samples(silent.blob)).every(v => v === 0)).toBe(true)
    expect(silent.protection?.matchedWindows).toBe(0)
    expect(silent.warnings.join('')).toContain('未将 B 独有声音混入结果')
    const noB = await engine.subtract(request(file, wav([0, 0], 2), { protectUnmatched: true }))
    expect(await samples(noB.blob)).toEqual(source.map(v => v / 32768))
    expect(noB.outputGain).toBe(1)
  })

  it('never falls back to strict subtraction when protected analysis fails', async () => {
    state.failMeter = true
    const a = wav([1000, 0]), b = wav([0, 2000])
    const strict = await engine.subtract(request(a, b))
    expect(await samples(strict.blob)).toEqual([1000, -2000].map(v => v / 32768))
    expect(strict.levels).toBeUndefined()
    expect(strict.warnings.join('')).toContain('分析未完成')
    await expect(engine.subtract(request(a, b, { protectUnmatched: true }))).rejects.toMatchObject({ code: 'PROTECTION_ANALYSIS_FAILED' })
  })

  it('supports B gain, including zero, without changing A', async () => {
    const a = wav([1000, -2000, 3000])
    const b = wav([2000, -4000, 6000])
    expect(await samples((await engine.subtract(request(a, b, { gainB: .5 }))).blob)).toEqual([0, 0, 0])
    expect(await samples((await engine.subtract(request(a, b, { gainB: 0 }))).blob)).toEqual([1000, -2000, 3000].map(value => value / 32768))
  })

  it('retains A outside B, including offsets beyond B and a longer B', async () => {
    const a = wav([1000, 2000, 3000, 4000])
    expect(await samples((await engine.subtract(request(a, wav([1000, 1000])))).blob)).toEqual([0, 1000, 3000, 4000].map(value => value / 32768))
    expect(await samples((await engine.subtract(request(a, wav([1000, 1000]), { offsetMs: -1000 }))).blob)).toEqual([1000, 2000, 3000, 4000].map(value => value / 32768))
    expect((await engine.subtract(request(a, wav(new Array(100).fill(1000))))).sampleFrames).toBe(4)
  })

  it('preserves over-range float samples or attenuates the whole result when requested', async () => {
    const input = request(wav([30000, 10000, 0]), wav([-30000, -10000, 0]), { preventClipping: false })
    const raw = await engine.subtract(input)
    expect(await samples(raw.blob)).toEqual([60000, 20000, 0].map(value => value / 32768))
    expect(raw.warnings.join('')).toContain('可能失真')
    const protectedResult = await engine.subtract({ ...input, options: { ...input.options, preventClipping: true } })
    const protectedSamples = await samples(protectedResult.blob)
    expect(protectedSamples[0]).toBeCloseTo(.999, 6)
    expect(protectedSamples[1] / protectedSamples[0]).toBeCloseTo(1 / 3, 6)
    expect(protectedResult.outputGain).toBeLessThan(1)
    expect(protectedResult.warnings.join('')).toContain('整体降低')
  })

  it('resamples B to A and keeps the full duration of A', async () => {
    const result = await engine.subtract(request(wav(new Array(800).fill(0), 1, 8000), wav(new Array(1600).fill(0), 1, 16000)))
    expect(result).toMatchObject({ sampleRate: 8000, sampleFrames: 800, peak: 0 })
    expect(result.warnings.join('')).toContain('重采样')
    expect(result.levels?.b.points).toHaveLength(800)
  })

  it('rejects incompatible channels and malformed audio with cleanup', async () => {
    await expect(engine.subtract(request(wav([1, 2]), wav([1, 2], 2)))).rejects.toMatchObject({ code: 'CHANNEL_MISMATCH' })
    await expect(engine.subtract(request(wav([1, 2]), new File(['RIFF----WAVE'], 'broken.wav')))).rejects.toMatchObject({ code: 'INVALID_AUDIO' })
  })

  it('rejects unsafe options and excessively large decoded results before encoding', async () => {
    await expect(engine.subtract(request(wav([1]), wav([1]), { gainB: NaN }))).rejects.toMatchObject({ code: 'INVALID_GAIN' })
    await expect(engine.subtract(request(wav([1]), wav([1]), { offsetMs: Infinity }))).rejects.toMatchObject({ code: 'INVALID_OFFSET' })
    for (const options of [{ searchRadiusMs: 1 }, { reductionStrength: 0 }, { reductionStrength: 2 }, { reductionStrength: NaN }]) {
      await expect(engine.subtract(request(wav([1]), wav([1]), { autoAlign: true, ...options }))).rejects.toMatchObject({ code: 'INVALID_ALIGNMENT_OPTIONS' })
    }
    expect(() => validateSubtractPair({ sampleRate: 48000, channels: 2, duration: 3600 }, { sampleRate: 48000, channels: 2, duration: 3600 })).toThrow('256 MB')
  })

  it.each([{ delay: 317, gain: .75 }, { delay: -317, gain: -.75 }])('automatically aligns $delay samples and estimates signed gain $gain with real decoding', async ({ delay, gain }) => {
    const rate = 44100, length = rate * 2
    let seed = 61
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 - .5 }
    const b = Array.from({ length }, () => Math.round(random() * 4000) * 4)
    const c = Array.from({ length }, () => Math.round(random() * 1200))
    const a = c.map((value, index) => value + gain * (b[index - delay] ?? 0))
    const result = await engine.subtract(request(wav(a, 1, rate), wav(b, 1, rate), { autoAlign: true, searchRadiusMs: 250 }))
    expect(result.offsetSamples).toBe(delay)
    expect(result.alignment?.gainB).toBeCloseTo(Math.abs(gain), 2)
    expect(result.alignment?.invertB).toBe(gain < 0)
    expect(result.alignment?.correlation).toBeGreaterThan(.95)
    expect(result.alignment?.matchedWindows).toBeGreaterThanOrEqual(2)
    const output = await samples(result.blob)
    expect(output.length).toBe(length)
    const rms = Math.sqrt(output.reduce((sum, sample, i) => sum + (sample - c[i] / 32768) ** 2, 0) / length)
    expect(rms).toBeLessThan(.001)
  })

  it('applies partial automatic reduction and supports manual polarity inversion', async () => {
    let seed = 93
    const source = Array.from({ length: 16000 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.round((seed / 4294967296 - .5) * 8000) })
    const file = wav(source)
    const result = await engine.subtract(request(file, file, { autoAlign: true, reductionStrength: .5, searchRadiusMs: 250 }))
    expect(result.alignment?.appliedGainB).toBeCloseTo(.5, 6)
    const output = await samples(result.blob)
    expect(output.every((value, i) => Math.abs(value - source[i] / 65536) < 1e-6)).toBe(true)
    const inverted = await engine.subtract(request(wav([1000, -2000]), wav([-1000, 2000]), { invertB: true }))
    expect(await samples(inverted.blob)).toEqual([0, 0])
  })

  it('rejects unreliable automatic matches without emitting misleading results', async () => {
    const silence = wav(new Array(8000).fill(0))
    await expect(engine.subtract(request(silence, silence, { autoAlign: true }))).rejects.toMatchObject({ code: 'ALIGNMENT_UNCERTAIN' })
    const periodic = wav(Array.from({ length: 16000 }, (_, i) => Math.round(10000 * Math.sin(i * Math.PI / 10))))
    await expect(engine.subtract(request(periodic, periodic, { autoAlign: true, searchRadiusMs: 250 }))).rejects.toMatchObject({ code: 'ALIGNMENT_UNCERTAIN' })
    await expect(engine.subtract(request(wav([1, 2]), wav([1, 2]), { autoAlign: true }))).rejects.toMatchObject({ code: 'ALIGNMENT_UNCERTAIN' })
    expect((await engine.subtract(request(silence, silence))).peak).toBe(0)
  })

  it('rejects inconsistent time shifts and searches around a supplied center', async () => {
    const rate = 8000, length = rate * 6
    let seed = 27
    const b = Array.from({ length }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.round((seed / 4294967296 - .5) * 8000) })
    const drifting = b.map((_, i) => b[i - (i < rate * 2 ? 120 : i < rate * 4 ? 240 : 360)] ?? 0)
    await expect(engine.subtract(request(wav(drifting), wav(b), { autoAlign: true, searchRadiusMs: 250 }))).rejects.toMatchObject({ code: 'ALIGNMENT_UNCERTAIN' })
    const shifted = b.map((_, i) => b[i - 4000] ?? 0)
    await expect(engine.subtract(request(wav(shifted), wav(b), { autoAlign: true, searchRadiusMs: 250 }))).rejects.toMatchObject({ code: 'ALIGNMENT_UNCERTAIN' })
    const centered = await engine.subtract(request(wav(shifted), wav(b), { autoAlign: true, searchRadiusMs: 250, offsetMs: 500 }))
    expect(centered.offsetSamples).toBe(4000)
    expect(centered.peak).toBeLessThan(.000001)
  })

  it('matches a real MP3 input consistently with the full-track decoder', async () => {
    const core = state.core!
    let seed = 87
    const raw = Array.from({ length: 44100 * 3 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.round((seed / 4294967296 - .5) * 12000) })
    const paths = ['fixture-source.wav', 'fixture-encoded.mp3', 'fixture-decoded.s16']
    try {
      core.FS.writeFile(paths[0], await bytes(wav(raw, 1, 44100)))
      expect(core.exec('-i', paths[0], '-c:a', 'libmp3lame', '-b:a', '192k', paths[1])).toBe(0)
      core.reset()
      expect(core.exec('-i', paths[1], '-f', 's16le', '-c:a', 'pcm_s16le', paths[2])).toBe(0)
      core.reset()
      const decoded = new Int16Array(new Uint8Array(core.FS.readFile(paths[2])).buffer)
      const a = Array.from({ length: decoded.length }, (_, i) => Math.round((decoded[i - 701] ?? 0) * .75))
      const b = new File([new Uint8Array(core.FS.readFile(paths[1])).buffer], 'B.mp3', { type: 'audio/mpeg' })
      const input = request(wav(a, 1, 44100), b, { autoAlign: true, searchRadiusMs: 250 })
      input.b.format = 'mp3'
      const result = await engine.subtract(input)
      expect(result.offsetSamples).toBe(701)
      expect(result.alignment?.gainB).toBeCloseTo(.75, 2)
      expect(result.peak).toBeLessThan(.0001)
    } finally { for (const path of paths) try { core.FS.unlink(path) } catch { /* A failed encoder may not create its output. */ } }
  })
})
