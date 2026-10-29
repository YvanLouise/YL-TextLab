import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { FFmpeg, type FFFSType } from '@ffmpeg/ffmpeg'
import { AudioConversionError } from '../audio-conversion/types'

export const MAX_AUDIO_OUTPUT_BYTES = 256 * 1024 * 1024
export const abortAudio = () => new DOMException('音频处理已停止。', 'AbortError')

/** One worker per active tool, one operation per worker; old jobs cannot unlock a newer one. */
export class LocalAudioEngine {
  protected ffmpeg: FFmpeg | null = null
  private loading: { promise: Promise<void>; cancel: () => void } | null = null
  private operation: symbol | null = null

  async load() {
    if (this.ffmpeg?.loaded) return
    if (this.loading) return this.loading.promise
    if (!globalThis.WebAssembly || !globalThis.Worker) throw new AudioConversionError('ENGINE_UNAVAILABLE', '当前浏览器不支持本地音频引擎，请使用支持 WebAssembly 和 Worker 的浏览器。')
    const ffmpeg = new FFmpeg()
    this.ffmpeg = ffmpeg
    let cancel = () => {}, timer: ReturnType<typeof setTimeout> | undefined
    const interrupted = new Promise<never>((_, reject) => {
      cancel = () => reject(abortAudio())
      timer = setTimeout(() => reject(new AudioConversionError('ENGINE_TIMEOUT', '本地音频引擎加载超时，请检查网络后重试。音频不会上传。')), 90000)
    })
    const attempt = { promise: Promise.resolve(), cancel }
    attempt.promise = Promise.race([Promise.resolve().then(() => {
      if (this.ffmpeg !== ffmpeg) throw abortAudio()
      return ffmpeg.load({ coreURL, wasmURL })
    }), interrupted]).then(() => {
      if (this.ffmpeg !== ffmpeg) throw abortAudio()
    }).catch(error => {
      if (this.ffmpeg === ffmpeg) { this.ffmpeg = null; ffmpeg.terminate() }
      throw error
    }).finally(() => {
      clearTimeout(timer)
      if (this.loading === attempt) this.loading = null
    })
    this.loading = attempt
    return attempt.promise
  }

  protected beginOperation() {
    if (this.operation) throw new AudioConversionError('ENGINE_BUSY', '请等待当前音频任务完成，或先停止处理。')
    const token = Symbol('audio-operation')
    this.operation = token
    return {
      check: () => { if (this.operation !== token) throw abortAudio() },
      finish: () => { if (this.operation === token) this.operation = null },
    }
  }

  async ready() {
    await this.load()
    if (!this.ffmpeg) throw abortAudio()
    return this.ffmpeg
  }

  cancel() {
    this.operation = null
    this.loading?.cancel(); this.loading = null
    this.ffmpeg?.terminate(); this.ffmpeg = null
  }
  dispose() { this.cancel() }
}

export async function safeDelete(ffmpeg: FFmpeg, path: string) {
  try { await ffmpeg.deleteFile(path) } catch { /* Cancellation releases the entire virtual file system. */ }
}

export async function mountAudioFile(ffmpeg: FFmpeg, file: File, check: () => void = () => {}) {
  const directory = `/source-${crypto.randomUUID()}`
  const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'media'
  const name = `input.${extension}`
  check()
  await ffmpeg.createDir(directory)
  try {
    check()
    if (!await ffmpeg.mount('WORKERFS' as FFFSType, { blobs: [{ name, data: file }] }, directory)) {
      throw new AudioConversionError('ENGINE_UNAVAILABLE', '无法按需读取本机文件，请刷新后重试。')
    }
    check()
    return { path: `${directory}/${name}`, release: async () => {
      await ffmpeg.unmount(directory).catch(() => undefined)
      await ffmpeg.deleteDir(directory).catch(() => undefined)
    } }
  } catch (error) {
    await ffmpeg.unmount(directory).catch(() => undefined)
    await ffmpeg.deleteDir(directory).catch(() => undefined)
    throw error
  }
}

export function boundedAudioCommand(args: string[], outputs: string[]) {
  return args.flatMap(argument => outputs.includes(argument) ? ['-fs', String(MAX_AUDIO_OUTPUT_BYTES), argument] : [argument])
}

export async function readAudioOutput(ffmpeg: FFmpeg, path: string) {
  const data = await ffmpeg.readFile(path)
  if (typeof data === 'string' || !data.length) throw new AudioConversionError('INVALID_OUTPUT', '未生成有效的音频文件。')
  if (data.length >= MAX_AUDIO_OUTPUT_BYTES) throw new AudioConversionError('OUTPUT_TOO_LARGE', '单个输出达到 256 MB 安全上限，已阻止下载可能被截断的文件。请缩短片段或选择更小的输出格式。')
  return data as Uint8Array<ArrayBuffer>
}
