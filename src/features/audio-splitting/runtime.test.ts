/// <reference types="node" />
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FfmpegAudioSplitEngine } from './runtime'
import type { AudioSplitRequest } from './types'

interface Core {
  exec(...args: string[]): number
  ffprobe(...args: string[]): number
  reset(): void
  FS: { readFile(path: string): Uint8Array; writeFile(path: string, bytes: Uint8Array): void; unlink(path: string): void; readdir(path: string): string[]; mkdir(path: string): void; rmdir(path: string): void }
}
const state = vi.hoisted(() => ({ core: null as Core | null }))
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {
  loaded = false
  async load() { this.loaded = true }
  on() {}
  off() {}
  async writeFile(path: string, bytes: Uint8Array) { state.core!.FS.writeFile(path, bytes) }
  async createDir(path: string) { state.core!.FS.mkdir(path) }
  async deleteDir(path: string) { state.core!.FS.rmdir(path) }
  async mount(_type: string, options: { blobs: { name: string; data: Blob }[] }, path: string) {
    for (const blob of options.blobs) state.core!.FS.writeFile(`${path}/${blob.name}`, await readBlob(blob.data))
    return true
  }
  async unmount(path: string) {
    for (const name of state.core!.FS.readdir(path).filter(name => !['.', '..'].includes(name))) state.core!.FS.unlink(`${path}/${name}`)
  }
  async readFile(path: string, encoding?: string) {
    const bytes = state.core!.FS.readFile(path)
    return encoding === 'utf8' ? new TextDecoder().decode(bytes) : bytes
  }
  async deleteFile(path: string) { state.core!.FS.unlink(path) }
  async exec(args: string[]) { const code = state.core!.exec(...args); state.core!.reset(); return code }
  async ffprobe(args: string[]) { const code = state.core!.ffprobe(...args); state.core!.reset(); return code }
  terminate() { this.loaded = false }
} }))

function fixture(channels = 2) {
  const data = Buffer.alloc(44 + 4000 * channels * 2)
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVE', 8)
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20)
  data.writeUInt16LE(channels, 22); data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000 * channels, 28)
  data.writeUInt16LE(2 * channels, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(data.length - 44, 40)
  for (let i = 0; i < 4000; i++) for (let channel = 0; channel < channels; channel++) {
    data.writeInt16LE(Math.round(12000 * Math.sin(i * (channel + 1) * 0.13)), 44 + (i * channels + channel) * 2)
  }
  return data
}

function request(channels = 2): AudioSplitRequest {
  return { file: new File([new Uint8Array(fixture(channels)).buffer], 'stereo.wav'), inputFormat: 'wav', sourceKind: 'audio',
    startSeconds: 0.125, endSeconds: 0.375, outputFormat: 'wav', fileName: 'song.wav' }
}

async function readBlob(blob: Blob) {
  return Buffer.from(await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  }))
}

function samples(bytes: Buffer) {
  for (let at = 12; at + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(at + 4)
    if (bytes.toString('ascii', at, at + 4) === 'data') return bytes.subarray(at + 8, at + 8 + length)
    at += 8 + length + length % 2
  }
  throw new Error('Missing PCM samples')
}

let engine: FfmpegAudioSplitEngine
beforeEach(async () => {
  vi.stubGlobal('Worker', class {})
  const require = createRequire(import.meta.url)
  state.core = await require('@ffmpeg/core')({ wasmBinary: readFileSync(require.resolve('@ffmpeg/core/wasm')) })
  engine = new FfmpegAudioSplitEngine()
})
afterEach(() => { engine?.dispose(); vi.unstubAllGlobals() })

describe('real stereo channel separation', () => {
  it('reads duration with ffprobe and cleans the mounted input', async () => {
    expect(await engine.probe(request().file)).toBe(.5)
    expect(state.core!.FS.readdir('/').filter(name => /^(source-|probe-)/.test(name))).toEqual([])
  })
  it('preserves each channel sample and the exact selected range with no mixing', async () => {
    const results = await engine.separateChannels(request())
    expect(results.map(result => result.fileName)).toEqual(['song_L.wav', 'song_R.wav'])
    const input = fixture()
    for (const [channel, result] of results.entries()) {
      const bytes = await readBlob(result.blob)
      expect(bytes.readUInt16LE(22)).toBe(1)
      expect(bytes.readUInt32LE(24)).toBe(8000)
      const pcm = samples(bytes)
      expect(pcm.length).toBe(2000 * 2)
      for (let i = 0; i < 2000; i++) expect(pcm.readInt16LE(i * 2)).toBe(input.readInt16LE(44 + ((i + 1000) * 2 + channel) * 2))
    }
    expect(state.core!.FS.readdir('/').filter(name => /^(channel-|left-|right-)/.test(name))).toEqual([])
  })

  it.each([1, 6])('rejects %i channels and removes temporary files', async (channels) => {
    await expect(engine.separateChannels(request(channels))).rejects.toMatchObject({ code: 'INVALID_CHANNELS' })
    expect(state.core!.FS.readdir('/').filter(name => /^(channel-|left-|right-)/.test(name))).toEqual([])
  })
})
