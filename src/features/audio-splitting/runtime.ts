import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { AudioConversionError } from '../audio-conversion/types'
import { LocalAudioEngine, boundedAudioCommand, mountAudioFile, readAudioOutput, safeDelete } from '../audio-shared/engine'
import { probeAudio } from '../audio-shared/probe'
import { buildChannelSplitCommand, buildSplitCommand, createChannelFileName, normalizeSplitFileName, splitExtension, splitMime } from './audio'
import type { AudioChannelSplitResult, AudioSplitEngine, AudioSplitRequest, AudioSplitResult } from './types'

const virtualName = (prefix: string, extension: string) => `${prefix}-${crypto.randomUUID()}.${extension}`

export class FfmpegAudioSplitEngine extends LocalAudioEngine implements AudioSplitEngine {
  private async withSource<T>(file: File, work: (ffmpeg: FFmpeg, path: string, check: () => void) => Promise<T>) {
    const operation = this.beginOperation()
    let ffmpeg: FFmpeg | null = null, mounted: Awaited<ReturnType<typeof mountAudioFile>> | null = null
    try {
      await this.load(); operation.check()
      ffmpeg = this.ffmpeg!
      mounted = await mountAudioFile(ffmpeg, file, operation.check)
      return await work(ffmpeg, mounted.path, operation.check)
    } catch (error) {
      if (!(error instanceof AudioConversionError) && ffmpeg && this.ffmpeg === ffmpeg) this.cancel()
      throw error
    } finally { await mounted?.release(); operation.finish() }
  }

  async probe(file: File) {
    return this.withSource(file, async (ffmpeg, path, check) => {
      const info = await probeAudio(ffmpeg, path, check)
      if (!info.duration) throw new AudioConversionError('INVALID_DURATION', '无法读取有效音轨时长，请先转换为 WAV 或 MP3。')
      return info.duration
    })
  }

  async split(request: AudioSplitRequest, onProgress?: (progress: number) => void): Promise<AudioSplitResult> {
    return this.withSource(request.file, async (ffmpeg, path, check) => {
      const started = performance.now(), extension = splitExtension(request.inputFormat, request.outputFormat)
      const output = virtualName('output', extension)
      let last = -1
      const progress = ({ time }: { time: number }) => {
        if (!Number.isFinite(time)) return
        const value = Math.max(last, Math.max(0, Math.min(99, Math.round(time / 10000 / (request.endSeconds - request.startSeconds)))))
        if (value !== last) { last = value; onProgress?.(value) }
      }
      ffmpeg.on('progress', progress)
      try {
        const args = buildSplitCommand(path, output, request.inputFormat, request.outputFormat, request.startSeconds, request.endSeconds)
        const code = await ffmpeg.exec(boundedAudioCommand(args, [output]))
        check()
        if (code !== 0) throw new AudioConversionError('SPLIT_FAILED', '无法提取所选区域，请确认音轨有效，或改用 WAV 输出。')
        const bytes = await readAudioOutput(ffmpeg, output)
        onProgress?.(100)
        return { blob: new Blob([bytes], { type: splitMime(request.inputFormat, request.outputFormat) }),
          fileName: normalizeSplitFileName(request.fileName, extension), durationMs: performance.now() - started }
      } finally { ffmpeg.off('progress', progress); await safeDelete(ffmpeg, output) }
    })
  }

  async separateChannels(request: AudioSplitRequest, onProgress?: (progress: number) => void): Promise<AudioChannelSplitResult[]> {
    return this.withSource(request.file, async (ffmpeg, path, check) => {
      const started = performance.now(), extension = splitExtension(request.inputFormat, request.outputFormat)
      const outputs = [virtualName('left', extension), virtualName('right', extension)]
      let last = -1
      const progress = ({ time }: { time: number }) => {
        if (!Number.isFinite(time)) return
        const value = Math.max(last, Math.max(0, Math.min(99, Math.round(time / 10000 / (request.endSeconds - request.startSeconds)))))
        if (value !== last) { last = value; onProgress?.(value) }
      }
      try {
        const info = await probeAudio(ffmpeg, path, check)
        if (info.channels !== 2) throw new AudioConversionError('INVALID_CHANNELS', info.channels === 1
          ? '此文件是单声道，没有独立的左、右声道可分离。' : '左右声道分离需要双声道立体声文件。')
        ffmpeg.on('progress', progress)
        const args = buildChannelSplitCommand(path, outputs[0], outputs[1], request.inputFormat, request.outputFormat, request.startSeconds, request.endSeconds)
        const code = await ffmpeg.exec(boundedAudioCommand(args, outputs))
        check()
        if (code !== 0) throw new AudioConversionError('CHANNEL_SPLIT_FAILED', '声道分离失败，请检查文件或改用 WAV 输出。')
        const results: AudioChannelSplitResult[] = []
        for (const [index, output] of outputs.entries()) {
          const bytes = await readAudioOutput(ffmpeg, output), channel = index === 0 ? 'left' : 'right'
          results.push({ channel, blob: new Blob([bytes], { type: splitMime(request.inputFormat, request.outputFormat) }),
            fileName: createChannelFileName(request.fileName, extension, channel), durationMs: performance.now() - started })
        }
        onProgress?.(100)
        return results
      } finally { ffmpeg.off('progress', progress); await Promise.all(outputs.map(path => safeDelete(ffmpeg, path))) }
    })
  }
}

export function createFfmpegAudioSplitEngine() { return new FfmpegAudioSplitEngine() }
