/// <reference types="node" />
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { FfmpegAudioEngine } from './runtime'
import { DEFAULT_AUDIO_OPTIONS, EMPTY_AUDIO_METADATA, type AudioConversionRequest, type AudioOutputFormat } from './types'
import { readWavMetadata, rewriteWavMetadata } from './wav-metadata'
import { readFfmetadata } from './metadata'
import { inspectLosslessAudio } from './lossless'

interface Core {
  exec(...args: string[]): number
  reset(): void
  FS: { readFile(path: string): Uint8Array; writeFile(path: string, data: Uint8Array): void; unlink(path: string): void; readdir(path: string): string[]; mkdir(path: string): void; rmdir(path: string): void }
}

const state = vi.hoisted(() => ({ core: null as Core | null, emptyProbe: false, corruptHash: false, commands: [] as string[][] }))

// Exercise the real engine with the bundled WASM; only adapt its Worker transport.
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {
  loaded = false
  async load() { this.loaded = true }
  on() { /* Progress events are not needed by these transport tests. */ }
  off() { /* No listeners in this adapter. */ }
  async writeFile(path: string, data: Uint8Array) { state.core!.FS.writeFile(path, data) }
  async readFile(path: string, encoding?: string) {
    if (state.corruptHash && path.endsWith('.output.sha256')) return `SHA256=${'0'.repeat(64)}\n`
    const data = state.core!.FS.readFile(path)
    return encoding === 'utf8' ? new TextDecoder().decode(data) : data
  }
  async deleteFile(path: string) { state.core!.FS.unlink(path) }
  async createDir(path: string) { state.core!.FS.mkdir(path) }
  async deleteDir(path: string) { state.core!.FS.rmdir(path) }
  async mount(_type: string, options: { blobs: { name: string; data: Blob }[] }, path: string) {
    for (const blob of options.blobs) state.core!.FS.writeFile(`${path}/${blob.name}`, await blobBytes(blob.data))
    return true
  }
  async unmount(path: string) {
    for (const name of state.core!.FS.readdir(path).filter(name => !['.', '..'].includes(name))) state.core!.FS.unlink(`${path}/${name}`)
  }
  async exec(args: string[]) {
    state.commands.push(args)
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
const temporaryDirectories: string[] = []

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
  state.commands = []
  expect(state.core.exec('-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.1', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', 'fixture.wav')).toBe(0)
  state.core.reset()
  fixture = state.core.FS.readFile('fixture.wav')
  engine = new FfmpegAudioEngine()
})

afterEach(() => {
  engine?.dispose()
  vi.unstubAllGlobals()
  state.corruptHash = false
  for (const directory of temporaryDirectories.splice(0)) {
    if (dirname(resolve(directory)) !== resolve(tmpdir())) throw new Error('Unexpected test temporary directory')
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('real lossless compression', () => {
  function losslessRequest(bytes = fixture, name = 'source.wav', inputFormat: AudioConversionRequest['inputFormat'] = 'wav'): AudioConversionRequest {
    return { ...request('flac'), file: file(bytes, name), inputFormat,
      // Stale settings from the normal conversion mode must have no effect.
      options: { ...DEFAULT_AUDIO_OPTIONS, mode: 'lossless', format: 'mp3', sampleRate: 44100, channels: 'mono' } }
  }

  it.each([
    { codec: 'pcm_s16le', format: 'wav', channels: 1, bitDepth: 16 },
    { codec: 'pcm_s24le', format: 'wav', channels: 2, bitDepth: 24 },
    { codec: 'pcm_s24le', format: 'wav', channels: 6, bitDepth: 24 },
    { codec: 'pcm_s24be', format: 'aiff', channels: 2, bitDepth: 24 },
  ] as const)('preserves every $bitDepth-bit $format sample in $channels channels', async ({ codec, format, channels, bitDepth }) => {
    const inputPath = `lossless-source.${format}`
    // Include low bits that a 16-bit intermediate would silently lose.
    expect(state.core!.exec('-f', 'lavfi', '-i', 'aevalsrc=0.31*sin(437*2*PI*t)+0.000001:duration=0.2',
      '-ar', '48000', '-ac', String(channels), '-c:a', codec, inputPath)).toBe(0)
    state.core!.reset()
    const source = state.core!.FS.readFile(inputPath)
    const output = await engine.convert(losslessRequest(source, inputPath, format))
    const bytes = await blobBytes(output.blob)
    expect(output.fileName).toBe('lossless-source-无损.flac')
    expect(output.lossless).toEqual({ sampleRate: 48000, channels, bitDepth, sampleFrames: 9600, verified: true, keptOriginal: false })
    const encode = state.commands.find(args => args.includes('flac') && args.includes('-compression_level'))!
    expect(encode).toContain('sha256')
    expect(encode.filter(arg => arg === '-i')).toHaveLength(1)
    expect(inspectLosslessAudio(bytes, 'flac')).toEqual(inspectLosslessAudio(source, format))
    state.core!.FS.writeFile('result.flac', bytes)
    for (const [path, destination] of [[inputPath, 'before.pcm'], ['result.flac', 'after.pcm']]) {
      expect(state.core!.exec('-i', path, '-map', '0:a:0', '-c:a', 'pcm_s32le', '-f', 's32le', destination)).toBe(0)
      state.core!.reset()
    }
    expect(state.core!.FS.readFile('after.pcm')).toEqual(state.core!.FS.readFile('before.pcm'))
    expect(state.core!.FS.readdir('/').filter(path => /^(input|output|cover|source)-.*\./.test(path))).toEqual([])
  })

  it('recompresses existing FLAC and reports when it does not save space', async () => {
    const first = await engine.convert(losslessRequest())
    const second = await engine.convert(losslessRequest(await blobBytes(first.blob), 'existing.flac', 'flac'))
    expect(second.lossless?.verified).toBe(true)
    expect(second.blob.size).toBe(first.blob.size)
    expect(second.warnings).toContainEqual(expect.stringContaining('输出体积未减小'))
  })

  it('keeps the original FLAC bytes when recompression cannot reduce size and no edits are requested', async () => {
    const original = await engine.convert({ ...losslessRequest(), metadata: EMPTY_AUDIO_METADATA })
    const source = file(await blobBytes(original.blob), 'existing.flac')
    const output = await engine.convert({ ...losslessRequest(), file: source, inputFormat: 'flac', metadata: EMPTY_AUDIO_METADATA })
    expect(output.blob).toBe(source)
    expect(output.lossless?.keptOriginal).toBe(true)
    expect(output.warnings).toContainEqual(expect.stringContaining('已保留原 FLAC 内容'))
  })

  it('preserves legacy Chinese WAV tags through sparse inspection without rewriting the source', async () => {
    const bytes = rewriteWavMetadata(fixture, metadata, 'gbk')
    const source = file(bytes)
    const output = await engine.convert({ ...losslessRequest(), file: source, metadata: { ...EMPTY_AUDIO_METADATA, title: '更新标题' } })
    state.core!.FS.writeFile('tagged.flac', await blobBytes(output.blob))
    expect(state.core!.exec('-i', 'tagged.flac', '-f', 'ffmetadata', 'tags.txt')).toBe(0)
    state.core!.reset()
    expect(readFfmetadata(new TextDecoder().decode(state.core!.FS.readFile('tags.txt')))).toMatchObject({ ...metadata, title: '更新标题' })
    expect(await blobBytes(source)).toEqual(bytes)
    expect(output.lossless?.verified).toBe(true)
  })

  it.each(['pcm_f32le', 'pcm_s32le'])('rejects %s instead of silently reducing precision', async codec => {
    expect(state.core!.exec('-i', 'fixture.wav', '-c:a', codec, 'unsupported.wav')).toBe(0)
    state.core!.reset()
    await expect(engine.convert(losslessRequest(state.core!.FS.readFile('unsupported.wav')))).rejects.toThrow(/整数 PCM|16\/24 位/)
  })

  it('rejects lossy sources and disguised files', async () => {
    expect(state.core!.exec('-i', 'fixture.wav', '-c:a', 'libmp3lame', 'source.mp3')).toBe(0)
    state.core!.reset()
    const bytes = state.core!.FS.readFile('source.mp3')
    await expect(engine.convert(losslessRequest(bytes, 'source.mp3', 'mp3'))).rejects.toThrow('不能恢复音质')
    await expect(engine.convert(losslessRequest(bytes, 'disguised.wav'))).rejects.toThrow('无法完整读取音频参数')
  })

  it('withholds downloads on a failed sample hash and cleans its temporary files', async () => {
    state.corruptHash = true
    await expect(engine.convert(losslessRequest())).rejects.toThrow('无损校验未通过')
    expect(state.core!.FS.readdir('/').filter(path => /^(input|output|cover)-/.test(path))).toEqual([])
  })
})

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

  it.each(['mono', 'stereo', 'original'] as const)('verifies Opus %s stream tags', async (channels) => {
    const input = request('opus')
    input.options.channels = channels
    const output = await engine.convert(input)
    expect(output.blob.size).toBeGreaterThan(100)
    state.core!.FS.writeFile('verified.opus', await blobBytes(output.blob))
    expect(state.core!.exec('-i', 'verified.opus', '-c:a', 'pcm_s16le', 'verified.wav')).toBe(0)
    state.core!.reset()
    expect(Buffer.from(state.core!.FS.readFile('verified.wav')).readUInt16LE(22)).toBe(channels === 'mono' ? 1 : 2)
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
    temporaryDirectories.push(directory)
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
