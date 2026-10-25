import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { hasMetadataEdits, readFfmetadata, verifyMetadata } from './metadata'
import { readWavMetadata, rewriteWavMetadata } from './wav-metadata'
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
    const loading = (async () => {
      if (!('WebAssembly' in globalThis) || !('Worker' in globalThis)) {
        throw new AudioConversionError('ENGINE_UNAVAILABLE', '当前浏览器不支持本地音频转换所需的 WebAssembly 或 Worker。')
      }
      const ffmpeg = new FFmpeg()
      this.ffmpeg = ffmpeg
      try {
        await ffmpeg.load({ coreURL, wasmURL })
        if (this.ffmpeg !== ffmpeg) throw new Error('Cancelled')
      } catch (error) {
        if (this.ffmpeg === ffmpeg) this.ffmpeg = null
        ffmpeg.terminate()
        throw error
      }
    })()
    this.loadingPromise = loading
    try {
      await loading
    } finally {
      if (this.loadingPromise === loading) this.loadingPromise = null
    }
  }

  async convert(
    request: AudioConversionRequest,
    onProgress?: (progress: number) => void,
  ): Promise<AudioConversionResult> {
    const outputFormat = request.options.mode === 'metadata-only'
      ? request.inputFormat
      : request.options.format
    if (outputFormat === 'aac' && (hasMetadataEdits(request.metadata) || request.coverFile)) {
      throw new AudioConversionError('METADATA_UNSUPPORTED', 'AAC 原始音频流不支持可靠的歌曲标签，请选择 M4A、MP3、FLAC 或 WAV 输出。')
    }
    await this.load()
    const ffmpeg = this.ffmpeg
    if (!ffmpeg) throw new AudioConversionError('ENGINE_UNAVAILABLE', '本地转换引擎尚未就绪。')

    const startedAt = performance.now()
    const inputPath = virtualName('input', request.file.name)
    const outputName = request.options.mode === 'metadata-only'
      ? metadataOutputFileName(request.file.name, outputFormat)
      : outputFileName(request.file.name, request.options.format)
    const outputPath = virtualName('output', outputName)
    const probePath = `${outputPath}.tags.txt`
    const coverPath = request.coverFile ? virtualName('cover', request.coverFile.name) : null
    const warnings: string[] = []
    let lastProgress = -1
    const progressHandler = ({ progress }: { progress: number }) => {
      const normalized = Math.max(0, Math.min(1, progress))
      const percent = Math.min(95, Math.round(normalized * 95))
      if (percent !== lastProgress) {
        lastProgress = percent
        onProgress?.(percent)
      }
    }
    ffmpeg.on('progress', progressHandler)

    try {
      let input = await fetchFile(request.file)
      if (request.inputFormat === 'wav' && request.options.preserveMetadata
        && String.fromCharCode(...input.subarray(0, 4)) === 'RIFF') {
        // Normalize legacy INFO text before FFmpeg, which assumes UTF-8 metadata.
        input = rewriteWavMetadata(input, {}, 'utf-8', true)
      }
      await ffmpeg.writeFile(inputPath, input)
      const canEmbedCover = supportsCoverArt(outputFormat)
      if (coverPath && request.coverFile && canEmbedCover) {
        await ffmpeg.writeFile(coverPath, await fetchFile(request.coverFile))
      } else if (request.coverFile) {
        warnings.push(`${outputFormat.toUpperCase()} 暂不支持内嵌封面，本次未写入封面。`)
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
        if (exitCode === 0) warnings.push('封面与目标格式不兼容，本次未写入封面。')
      }
      if (exitCode !== 0) {
        throw new AudioConversionError('TRANSCODE_FAILED', '转码器无法处理此文件或当前参数组合。')
      }
      let data = await ffmpeg.readFile(outputPath)
      if (typeof data === 'string' || !data.length) {
        throw new AudioConversionError('INVALID_OUTPUT', '转码器未生成有效的音频文件。')
      }
      if (outputFormat === 'wav') {
        data = rewriteWavMetadata(data, request.metadata, request.options.wavMetadataEncoding ?? 'gbk')
        verifyMetadata(request.metadata, readWavMetadata(data))
        if (request.options.wavMetadataEncoding === 'utf-8') {
          warnings.push('WAV 标签已按 UTF-8 写入并校验；Windows 属性页可能显示乱码，简体中文 Windows 建议选择 GBK。')
        }
      } else if (hasMetadataEdits(request.metadata)) {
        const probeCode = await ffmpeg.exec([
          '-i', outputPath, '-map_metadata', '0', '-map_metadata', '0:s:a:0',
          '-f', 'ffmetadata', probePath,
        ])
        if (probeCode !== 0) throw new AudioConversionError('METADATA_VERIFY_FAILED', '无法回读导出的歌曲标签，请重试或更换输出格式。')
        const probe = await ffmpeg.readFile(probePath, 'utf8')
        if (typeof probe !== 'string') throw new AudioConversionError('METADATA_VERIFY_FAILED', '无法读取歌曲标签校验结果。')
        verifyMetadata(request.metadata, readFfmetadata(probe))
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
        safeDelete(ffmpeg, probePath),
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
