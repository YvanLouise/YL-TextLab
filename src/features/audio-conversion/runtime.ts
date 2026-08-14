import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import {
  buildAudioCommand,
  metadataOutputFileName,
  outputFileName,
  outputMime,
  supportsCoverArt,
} from './audio'
import {
  AudioConversionError,
  type AudioConversionEngine,
  type AudioConversionRequest,
  type AudioConversionResult,
} from './types'

function virtualName(prefix: string, fileName: string) {
  const extension = fileName.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  return `${prefix}-${crypto.randomUUID?.() ?? Date.now()}.${extension}`
}

async function safeDelete(ffmpeg: FFmpeg, path: string) {
  try {
    await ffmpeg.deleteFile(path)
  } catch {
    // The worker may have been terminated while cleaning up.
  }
}

export class FfmpegAudioEngine implements AudioConversionEngine {
  private ffmpeg: FFmpeg | null = null
  private loadingPromise: Promise<void> | null = null

  async load() {
    if (this.ffmpeg?.loaded) return
    if (this.loadingPromise) return this.loadingPromise
    this.loadingPromise = (async () => {
      if (!('WebAssembly' in globalThis) || !('Worker' in globalThis)) {
        throw new AudioConversionError('ENGINE_UNAVAILABLE', '当前浏览器不支持本地音频转换所需的 WebAssembly 或 Worker。')
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

  async convert(
    request: AudioConversionRequest,
    onProgress?: (progress: number) => void,
  ): Promise<AudioConversionResult> {
    await this.load()
    const ffmpeg = this.ffmpeg
    if (!ffmpeg) throw new AudioConversionError('ENGINE_UNAVAILABLE', '本地转换引擎尚未就绪。')

    const startedAt = performance.now()
    const inputPath = virtualName('input', request.file.name)
    const outputFormat = request.options.mode === 'metadata-only'
      ? request.inputFormat
      : request.options.format
    const outputName = request.options.mode === 'metadata-only'
      ? metadataOutputFileName(request.file.name, outputFormat)
      : outputFileName(request.file.name, request.options.format)
    const outputPath = virtualName('output', outputName)
    const coverPath = request.coverFile ? virtualName('cover', request.coverFile.name) : null
    const warnings: string[] = []
    let lastProgress = -1
    const progressHandler = ({ progress }: { progress: number }) => {
      const normalized = Math.max(0, Math.min(1, progress))
      const percent = Math.round(normalized * 100)
      if (percent !== lastProgress) {
        lastProgress = percent
        onProgress?.(percent)
      }
    }
    ffmpeg.on('progress', progressHandler)

    try {
      await ffmpeg.writeFile(inputPath, await fetchFile(request.file))
      const canEmbedCover = supportsCoverArt(outputFormat)
      if (coverPath && request.coverFile && canEmbedCover) {
        await ffmpeg.writeFile(coverPath, await fetchFile(request.coverFile))
      } else if (request.coverFile) {
        warnings.push(`${outputFormat.toUpperCase()} 不支持内嵌封面，已保留文本歌曲信息。`)
      }
      let exitCode = await ffmpeg.exec(buildAudioCommand(inputPath, outputPath, request.options, {
        metadata: request.metadata,
        coverPath: canEmbedCover ? coverPath : null,
        outputFormat,
      }))
      if (exitCode !== 0 && supportsCoverArt(outputFormat)) {
        await safeDelete(ffmpeg, outputPath)
        exitCode = await ffmpeg.exec(buildAudioCommand(inputPath, outputPath, request.options, {
          metadata: request.metadata,
          includeCover: false,
          outputFormat,
        }))
        if (exitCode === 0) warnings.push('封面与目标格式不兼容，已保留音频和文本歌曲信息。')
      }
      if (exitCode !== 0) {
        throw new AudioConversionError('TRANSCODE_FAILED', '转码器无法处理此文件或当前参数组合。')
      }
      const data = await ffmpeg.readFile(outputPath)
      if (typeof data === 'string') {
        throw new AudioConversionError('INVALID_OUTPUT', '转码器未生成有效的音频文件。')
      }
      onProgress?.(100)
      return {
        blob: new Blob([new Uint8Array(data).buffer], { type: outputMime(outputFormat) }),
        fileName: outputName,
        format: outputFormat,
        durationMs: performance.now() - startedAt,
        warnings,
      }
    } finally {
      ffmpeg.off('progress', progressHandler)
      await Promise.all([
        safeDelete(ffmpeg, inputPath),
        safeDelete(ffmpeg, outputPath),
        ...(coverPath ? [safeDelete(ffmpeg, coverPath)] : []),
      ])
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

export function createFfmpegAudioEngine() {
  return new FfmpegAudioEngine()
}
