/// <reference types="node" />
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { FfmpegAudioEngine } from './runtime'
import { DEFAULT_AUDIO_OPTIONS, EMPTY_AUDIO_METADATA, type AudioConversionRequest, type AudioOutputFormat } from './types'
import { readWavMetadata } from './wav-metadata'

interface Core {
  exec(...args: string[]): number
  reset(): void
  FS: { readFile(path: string): Uint8Array; writeFile(path: string, data: Uint8Array): void; unlink(path: string): void }
}

const state = vi.hoisted(() => ({ core: null as Core | null, emptyProbe: false }))

// Exercise the real engine with the bundled WASM; only adapt its Worker transport.
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {
  loaded = false
  async load() { this.loaded = true }
  on() { /* Progress events are not needed by these transport tests. */ }
  off() { /* No listeners in this adapter. */ }
  async writeFile(path: string, data: Uint8Array) { state.core!.FS.writeFile(path, data) }
  async readFile(path: string, encoding?: string) {
    const data = state.core!.FS.readFile(path)
    return encoding === 'utf8' ? new TextDecoder().decode(data) : data
  }
  async deleteFile(path: string) { state.core!.FS.unlink(path) }
  async exec(args: string[]) {
    if (state.emptyProbe && args.includes('ffmetadata')) {
      state.core!.FS.writeFile(args[args.length - 1], new TextEncoder().encode(';FFMETADATA1\n'))
      return 0
    }
    const code = state.core!.exec(...args)
    state.core!.reset()
    return code
  }
  terminate() { this.loaded = false }
} }))

const metadata = { title: '天上晴云', artist: 'YvanLouise', album: '测试专辑', year: '2026', track: '3/12', genre: '流行', comment: '中文备注' }
let fixture: Uint8Array
let engine: FfmpegAudioEngine

function file(bytes: Uint8Array, name = 'source.wav') {
  return new File([new Uint8Array(bytes).buffer], name, { type: 'audio/wav' })
}

function request(format: AudioOutputFormat = 'wav'): AudioConversionRequest {
  return { file: file(fixture), inputFormat: 'wav', metadata, coverFile: null,
    options: { ...DEFAULT_AUDIO_OPTIONS, mode: format === 'wav' ? 'metadata-only' : 'transcode', format } }
}

async function blobBytes(blob: Blob) {
  return new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  }))
}

function pcm(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes)
  for (let at = 12; at + 8 < buffer.length;) {
    const length = buffer.readUInt32LE(at + 4)
    if (buffer.toString('ascii', at, at + 4) === 'data') return buffer.subarray(at + 8, at + 8 + length)
    at += 8 + length + length % 2
  }
  throw new Error('Missing PCM')
}

beforeEach(async () => {
  vi.stubGlobal('Worker', class {})
  const require = createRequire(import.meta.url)
  const create = require('@ffmpeg/core') as (options: { wasmBinary: Uint8Array }) => Promise<Core>
  state.core = await create({ wasmBinary: readFileSync(require.resolve('@ffmpeg/core/wasm')) })
  expect(state.core.exec('-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.1', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', 'fixture.wav')).toBe(0)
  state.core.reset()
  fixture = state.core.FS.readFile('fixture.wav')
  engine = new FfmpegAudioEngine()
})

afterEach(() => { engine?.dispose(); vi.unstubAllGlobals() })

describe('real FFmpeg metadata pipeline', () => {
  it('round-trips Chinese WAV tags without changing any 24-bit PCM samples', async () => {
    const result = await engine.convert(request())
    const output = await blobBytes(result.blob)
    expect(readWavMetadata(output)).toEqual(metadata)
    expect(pcm(output)).toEqual(pcm(fixture))
    const second = await engine.convert({ ...request(), file: file(output), metadata: { ...EMPTY_AUDIO_METADATA, title: '第二次修改' } })
    expect(readWavMetadata(await blobBytes(second.blob))).toEqual({ ...metadata, title: '第二次修改' })
  })

  it.each(['mp3', 'm4a', 'flac', 'ogg'] as const)('verifies actual %s container/stream tags', async (format) => {
    const result = await engine.convert(request(format))
    expect(result.blob.size).toBeGreaterThan(100)
    expect(result.format).toBe(format)
  })

  it('verifies Opus mono stream tags', async () => {
    // The bundled 0.12.10 core has a separate stereo Opus encoder crash.
    const input = request('opus')
    input.options.channels = 'mono'
    expect((await engine.convert(input)).blob.size).toBeGreaterThan(100)
  })

  it('round-trips escaped punctuation and multiline comments through real metadata export', async () => {
    const input = request('mp3')
    input.metadata = { ...metadata, title: 'A=B;#C\\D', comment: '第一行\n第二行' }
    expect((await engine.convert(input)).blob.size).toBeGreaterThan(100)
  })

  it('rejects unsupported raw AAC metadata instead of reporting success', async () => {
    await expect(engine.convert(request('aac'))).rejects.toThrow('AAC 原始音频流')
  })

  it('rejects missing tags even after the conversion itself succeeded', async () => {
    state.emptyProbe = true
    try { await expect(engine.convert(request('mp3'))).rejects.toThrow('歌曲信息写入校验失败') }
    finally { state.emptyProbe = false }
  })

  it.runIf(process.platform === 'win32')('exposes all edited fields through the Simplified Chinese Windows property handler', async ({ skip }) => {
    const codePage = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.Text.Encoding]::Default.CodePage'], { encoding: 'utf8', windowsHide: true }).trim()
    if (codePage !== '936') skip()
    const directory = mkdtempSync(join(tmpdir(), 'yl-wav-tags-'))
    const result = await engine.convert(request())
    writeFileSync(join(directory, 'after.wav'), await blobBytes(result.blob))
    const script = `
      [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
      $wavShell = New-Object -ComObject Shell.Application
      $wavFolder = $wavShell.NameSpace($env:YL_WAV_TEST_DIR)
      $wavItem = $wavFolder.ParseName('after.wav')
      @{ Title=$wavItem.ExtendedProperty('System.Title'); Artist=$wavItem.ExtendedProperty('System.Music.Artist'); Album=$wavItem.ExtendedProperty('System.Music.AlbumTitle'); Year=$wavItem.ExtendedProperty('System.Media.Year'); Track=$wavItem.ExtendedProperty('System.Music.TrackNumber'); Genre=$wavItem.ExtendedProperty('System.Music.Genre'); Comment=$wavItem.ExtendedProperty('System.Comment') } | ConvertTo-Json -Compress
    `
    const actual = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, YL_WAV_TEST_DIR: directory }, encoding: 'utf8', windowsHide: true,
    }))
    expect(actual).toEqual({ Title: metadata.title, Artist: [metadata.artist], Album: metadata.album,
      Year: 2026, Track: 3, Genre: [metadata.genre], Comment: metadata.comment })
  })
})
