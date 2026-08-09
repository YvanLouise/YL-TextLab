import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { AudioConversionError } from '../audio-conversion/types'
import { buildSplitCommand, splitExtension, splitMime } from './audio'
import type { AudioSplitEngine, AudioSplitRequest, AudioSplitResult } from './types'

function virtualName(prefix: string, extension: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? Date.now()}.${extension}`
}

async function safeDelete(ffmpeg: FFmpeg, path: string) {
  try {
    await ffmpeg.deleteFile(path)
  } catch {
    // The worker may already be terminated during cleanup.
  }
}

export class FfmpegAudioSplitEngine implements AudioSplitEngine {
  private ffmpeg: FFmpeg | null = null
  private loadingPromise: Promise<void> | null = null

  async load() {
    if (this.ffmpeg?.loaded) return
    if (this.loadingPromise) return this.loadingPromise
    this.loadingPromise = (async () => {
      if (!('WebAssembly' in globalThis) || !('Worker' in globalThis)) {
        throw new AudioConversionError('ENGINE_UNAVAILABLE', '当前浏览器不支持本地音频分割所需的 WebAssembly 或 Worker。')
      }
      const ffmpeg = new FFmpeg()
      await ffmpeg.load({ coreURL, wasmURL })
      this.ffmpeg = ffmpeg
    })()
    try {
      await this.loadingPromise
    } finally {
      this.loadingPromise = null
    }
  }

  async probe(file: File) {
    await this.load()
    const ffmpeg = this.ffmpeg
    if (!ffmpeg) throw new AudioConversionError('ENGINE_UNAVAILABLE', '本地音轨分析引擎尚未就绪。')

    const inputExtension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'media'
    const inputPath = virtualName('probe-input', inputExtension)
    let maxTimeMicroseconds = 0
    const progressHandler = ({ time }: { time: number }) => {
      if (Number.isFinite(time)) maxTimeMicroseconds = Math.max(maxTimeMicroseconds, time)
    }
    ffmpeg.on('progress', progressHandler)
    try {
      await ffmpeg.writeFile(inputPath, await fetchFile(file))
      const exitCode = await ffmpeg.exec([
        '-i', inputPath,
        '-map', '0:a:0',
        '-vn',
        '-f', 'null',
        '-',
      ])
      if (exitCode !== 0) {
        throw new AudioConversionError('NO_AUDIO_TRACK', '此视频不包含可提取的音轨，或音轨编码暂不受支持。')
      }
      const duration = maxTimeMicroseconds / 1_000_000
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new AudioConversionError('INVALID_DURATION', '无法读取此视频的有效音轨时长。')
      }
      return duration
    } catch (error) {
      if (error instanceof AudioConversionError) throw error
      throw new AudioConversionError('PROBE_FAILED', '无法分析此视频，文件可能损坏或编码暂不受支持。')
    } finally {
      ffmpeg.off('progress', progressHandler)
      await safeDelete(ffmpeg, inputPath)
    }
  }

  async split(request: AudioSplitRequest, onProgress?: (progress: number) => void): Promise<AudioSplitResult> {
    await this.load()
    const ffmpeg = this.ffmpeg
    if (!ffmpeg) throw new AudioConversionError('ENGINE_UNAVAILABLE', '本地分割引擎尚未就绪。')

    const startedAt = performance.now()
    const inputExtension = request.file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || request.inputFormat
    const outputExtension = splitExtension(request.inputFormat, request.outputFormat)
    const inputPath = virtualName('input', inputExtension)
    const outputPath = virtualName('output', outputExtension)
    let lastProgress = -1
    const progressHandler = ({ progress }: { progress: number }) => {
      const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100)
      if (percent !== lastProgress) {
        lastProgress = percent
        onProgress?.(percent)
      }
    }
    ffmpeg.on('progress', progressHandler)

    try {
      await ffmpeg.writeFile(inputPath, await fetchFile(request.file))
      const exitCode = await ffmpeg.exec(buildSplitCommand(
        inputPath,
        outputPath,
        request.inputFormat,
        request.outputFormat,
        request.startSeconds,
        request.endSeconds,
      ))
      if (exitCode !== 0) {
        throw new AudioConversionError(
          'SPLIT_FAILED',
          request.sourceKind === 'video' ? '无法从此视频中提取音轨，请确认视频包含音频。' : '无法提取所选音频区域。',
        )
      }
      const data = await ffmpeg.readFile(outputPath)
      if (typeof data === 'string') throw new AudioConversionError('INVALID_OUTPUT', '分割引擎未生成有效音频。')
      onProgress?.(100)
      return {
        blob: new Blob([new Uint8Array(data).buffer], { type: splitMime(request.inputFormat, request.outputFormat) }),
        fileName: request.fileName,
        durationMs: performance.now() - startedAt,
      }
    } finally {
      ffmpeg.off('progress', progressHandler)
      await Promise.all([safeDelete(ffmpeg, inputPath), safeDelete(ffmpeg, outputPath)])
    }
  }

  cancel() {
    this.ffmpeg?.terminate()
    this.ffmpeg = null
    this.loadingPromise = null
  }

  dispose() {
    this.cancel()
  }
}

export function createFfmpegAudioSplitEngine() {
  return new FfmpegAudioSplitEngine()
}
