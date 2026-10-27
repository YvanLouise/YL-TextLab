import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { FFmpeg, type FFFSType } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { hasMetadataEdits, readFfmetadata, verifyMetadata } from './metadata'
import { readWavFileMetadata, readWavMetadata, rewriteWavMetadata } from './wav-metadata'
import { buildPcmHashCommand, inspectLosslessAudio, inspectLosslessFile, LOSSLESS_INPUT_NOTICE, supportsLosslessInput, verifyLosslessAudio } from './lossless'
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
  type LosslessAudioInfo,
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
    const lossless = request.options.mode === 'lossless'
    if (lossless && !supportsLosslessInput(request.inputFormat)) {
      throw new AudioConversionError('LOSSLESS_SOURCE_REQUIRED', LOSSLESS_INPUT_NOTICE)
    }
    const outputFormat = request.options.mode === 'metadata-only'
      ? request.inputFormat
      : lossless ? 'flac' : request.options.format
    if (outputFormat === 'aac' && (hasMetadataEdits(request.metadata) || request.coverFile)) {
      throw new AudioConversionError('METADATA_UNSUPPORTED', 'AAC 原始音频流不支持可靠的歌曲标签，请选择 M4A、MP3、FLAC 或 WAV 输出。')
    }
    await this.load()
    const ffmpeg = this.ffmpeg
    if (!ffmpeg) throw new AudioConversionError('ENGINE_UNAVAILABLE', '本地转换引擎尚未就绪。')

    const startedAt = performance.now()
    let inputPath = virtualName('input', request.file.name)
    let mountPoint: string | null = null
    let mounted = false
    const outputName = request.options.mode === 'metadata-only'
      ? metadataOutputFileName(request.file.name, outputFormat)
      : lossless
        ? outputFileName(request.file.name, 'flac').replace(/\.flac$/, '-无损.flac')
        : outputFileName(request.file.name, request.options.format)
    const outputPath = virtualName('output', outputName)
    const probePath = `${outputPath}.tags.txt`
    const sourceHashPath = `${outputPath}.source.sha256`
    const outputHashPath = `${outputPath}.output.sha256`
    const coverPath = request.coverFile ? virtualName('cover', request.coverFile.name) : null
    const warnings: string[] = []
    let losslessInfo: LosslessAudioInfo | undefined
    let progressStart = 0
    let progressSpan = lossless ? 70 : 95
    let lastProgress = -1
    const progressHandler = ({ progress }: { progress: number }) => {
      if (!Number.isFinite(progress)) return
      const normalized = Math.max(0, Math.min(1, progress))
      const percent = Math.max(lastProgress, Math.min(99, Math.round(progressStart + normalized * progressSpan)))
      if (percent !== lastProgress) {
        lastProgress = percent
        onProgress?.(percent)
      }
    }
    ffmpeg.on('progress', progressHandler)

    try {
      let metadata = request.metadata
      if (lossless) {
        losslessInfo = await inspectLosslessFile(request.file, request.inputFormat)
        if (request.inputFormat === 'wav' && request.options.preserveMetadata) {
          const original = await readWavFileMetadata(request.file)
          metadata = { ...original, ...Object.fromEntries(Object.entries(metadata).filter(([, value]) => value.trim())) }
        }
        if (this.ffmpeg !== ffmpeg) throw new Error('Cancelled')
        mountPoint = `/${virtualName('source', 'mount')}`
        await ffmpeg.createDir(mountPoint)
        mounted = await ffmpeg.mount('WORKERFS' as FFFSType, { blobs: [{ name: `audio.${request.inputFormat}`, data: request.file }] }, mountPoint)
        if (!mounted) throw new AudioConversionError('ENGINE_UNAVAILABLE', '当前音频引擎无法按需读取源文件，请刷新页面后重试。')
        inputPath = `${mountPoint}/audio.${request.inputFormat}`
      } else {
        let input = await fetchFile(request.file)
        if (request.inputFormat === 'wav' && request.options.preserveMetadata
          && String.fromCharCode(...input.subarray(0, 4)) === 'RIFF') {
          // Normalize legacy INFO text before FFmpeg, which assumes UTF-8 metadata.
          input = rewriteWavMetadata(input, {}, 'utf-8', true)
        }
        await ffmpeg.writeFile(inputPath, input)
      }
      const hashAudio = async (path: string, hashPath: string) => {
        const code = await ffmpeg.exec(buildPcmHashCommand(path, hashPath))
        if (code !== 0) throw new AudioConversionError('LOSSLESS_VERIFY_FAILED', '无法完整解码音频进行无损校验，请检查原文件是否损坏。')
        const hash = await ffmpeg.readFile(hashPath, 'utf8')
        if (typeof hash !== 'string') throw new AudioConversionError('LOSSLESS_VERIFY_FAILED', '无法读取无损校验结果，请重试。')
        return hash
      }
      const canEmbedCover = supportsCoverArt(outputFormat)
      if (coverPath && request.coverFile && canEmbedCover) {
        await ffmpeg.writeFile(coverPath, await fetchFile(request.coverFile))
      } else if (request.coverFile) {
        warnings.push(`${outputFormat.toUpperCase()} 暂不支持内嵌封面，本次未写入封面。`)
      }
      const encode = (includeCover: boolean) => ffmpeg.exec([
        ...buildAudioCommand(inputPath, outputPath, request.options, {
          metadata,
          coverPath: canEmbedCover ? coverPath : null,
          includeCover,
          outputFormat,
          losslessBitDepth: losslessInfo?.bitDepth,
        }),
        // Two output streams share the source decoder, including its full-precision PCM.
        ...(lossless ? buildPcmHashCommand(inputPath, sourceHashPath).slice(3) : []),
      ])
      let exitCode = await encode(canEmbedCover)
      if (exitCode !== 0 && supportsCoverArt(outputFormat)) {
        await safeDelete(ffmpeg, outputPath)
        if (lossless) await safeDelete(ffmpeg, sourceHashPath)
        exitCode = await encode(false)
        if (exitCode === 0) warnings.push('封面与目标格式不兼容，本次未写入封面。')
      }
      if (exitCode !== 0) {
        throw new AudioConversionError('TRANSCODE_FAILED', '转码器无法处理此文件或当前参数组合。')
      }
      let data = await ffmpeg.readFile(outputPath)
      if (typeof data === 'string' || !data.length) {
        throw new AudioConversionError('INVALID_OUTPUT', '转码器未生成有效的音频文件。')
      }
      if (losslessInfo) {
        const outputInfo = inspectLosslessAudio(data, 'flac')
        progressStart = 70
        progressSpan = 27
        const outputHash = await hashAudio(outputPath, outputHashPath)
        const sourceHash = await ffmpeg.readFile(sourceHashPath, 'utf8')
        if (typeof sourceHash !== 'string') throw new AudioConversionError('LOSSLESS_VERIFY_FAILED', '无法读取源音频校验结果，请重试。')
        verifyLosslessAudio(losslessInfo, outputInfo, sourceHash, outputHash)
        losslessInfo = outputInfo
        progressStart = 97
        progressSpan = 2
        if (data.length >= request.file.size) {
          warnings.push('输出体积未减小，建议保留原文件。无损压缩效果取决于音频内容，已有 FLAC 通常压缩空间有限。')
        }
      }
      const keptOriginal = lossless && request.inputFormat === 'flac' && request.options.preserveMetadata
        && !hasMetadataEdits(request.metadata) && !request.coverFile && data.length >= request.file.size
      if (keptOriginal) {
        warnings.length = 0
        warnings.push('输出体积未减小，已保留原 FLAC 内容，不增加文件大小。')
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
        blob: keptOriginal ? request.file : new Blob([data as Uint8Array<ArrayBuffer>], { type: outputMime(outputFormat) }),
        fileName: outputName,
        format: outputFormat,
        durationMs: performance.now() - startedAt,
        warnings,
        ...(losslessInfo ? { lossless: { ...losslessInfo, verified: true as const, keptOriginal } } : {}),
      }
    } catch (error) {
      if (!(error instanceof AudioConversionError) && this.ffmpeg === ffmpeg) this.cancel()
      throw error
    } finally {
      ffmpeg.off('progress', progressHandler)
      await Promise.all([
        ...(!mountPoint ? [safeDelete(ffmpeg, inputPath)] : []),
        safeDelete(ffmpeg, outputPath),
        safeDelete(ffmpeg, probePath),
        ...(lossless ? [safeDelete(ffmpeg, sourceHashPath), safeDelete(ffmpeg, outputHashPath)] : []),
        ...(coverPath ? [safeDelete(ffmpeg, coverPath)] : []),
      ])
      if (mounted && mountPoint) await ffmpeg.unmount(mountPoint).catch(() => undefined)
      if (mountPoint) await ffmpeg.deleteDir(mountPoint).catch(() => undefined)
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
