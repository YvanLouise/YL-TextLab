import type { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import { LocalAudioEngine } from '../audio-shared/engine'
import { inspectAudioFile } from '../audio-conversion/audio'
import { AudioConversionError } from '../audio-conversion/types'
import { normalizeSplitFileName } from '../audio-splitting/audio'
import { buildSubtractCommand, offsetInSamples, parseSubtractProbe, protectFloatWave, readFloatWave, validateSubtractOptions, validateSubtractPair } from './audio'
import { MAX_SUBTRACT_OUTPUT_BYTES, type AudioSubtractEngine, type AudioSubtractProgress, type AudioSubtractRequest, type AudioSubtractResult } from './types'
import { AlignmentClient } from './alignment-client'
import type { AlignmentProcessor } from './alignment'
import { autoAlignAudio } from './auto-alignment'
import { buildLevelCommand, compactLevels, MAX_LEVEL_POINTS, parseLevelMetadata } from './levels'
import { createProtectionEnvelope, planProtectedSubtraction, protectionWindowFrames } from './protection'

export class FfmpegAudioSubtractEngine extends LocalAudioEngine implements AudioSubtractEngine {
  private matcher: AlignmentProcessor | null = null

  constructor(private readonly createMatcher: () => AlignmentProcessor = () => new AlignmentClient()) { super() }

  async subtract(request: AudioSubtractRequest, onProgress?: (value: AudioSubtractProgress) => void): Promise<AudioSubtractResult> {
    validateSubtractOptions(request.options)
    const operation = this.beginOperation()
    let matcher: AlignmentProcessor | null = null
    let ffmpeg: FFmpeg | null = null
    const id = crypto.randomUUID()
    const mountPoint = `/subtract-${id}`
    const output = `subtract-${id}.wav`
    const probePaths = [`subtract-${id}-a.json`, `subtract-${id}-b.json`]
    const analysisOutput = `subtract-${id}-analysis.f32`
    const levelPaths = [`subtract-${id}-a.levels`, `subtract-${id}-b.levels`]
    const gateMount = `/subtract-${id}-gate`
    let mounted = false
    let gateMounted = false
    let duration: number | null = null
    let lastPercent = -1
    const started = performance.now()
    const progress = ({ time }: { time: number }) => {
      if (!duration || !Number.isFinite(time)) return
      const percent = Math.max(lastPercent, Math.min(99, Math.round(time / 1000000 / duration * 100)))
      if (percent > lastPercent) { lastPercent = percent; onProgress?.({ stage: 'subtracting', percent }) }
    }
    try {
      await this.load()
      operation.check()
      ffmpeg = this.ffmpeg
      if (!ffmpeg) throw new Error('Cancelled')
      const active = ffmpeg
      const checkCancelled = () => { if (this.ffmpeg !== active) throw new Error('Cancelled') }
      onProgress?.({ stage: 'analyzing' })
      const formats = await Promise.all([inspectAudioFile(request.a.file), inspectAudioFile(request.b.file)])
      checkCancelled()
      await ffmpeg.createDir(mountPoint)
      const names = [`a.${formats[0]}`, `b.${formats[1]}`]
      mounted = await ffmpeg.mount('WORKERFS' as FFFSType, { blobs: [
        { name: names[0], data: request.a.file }, { name: names[1], data: request.b.file },
      ] }, mountPoint)
      if (!mounted) throw new AudioConversionError('ENGINE_UNAVAILABLE', '无法读取本机文件，请刷新页面后重试。')
      const inputs = names.map(name => `${mountPoint}/${name}`)
      const infos = []
      for (const [index, input] of inputs.entries()) {
        const code = await ffmpeg.ffprobe(['-v', 'error', '-select_streams', 'a:0', '-show_entries',
          'stream=sample_rate,channels,duration:format=duration', '-of', 'json', '-o', probePaths[index], input])
        const json = await ffmpeg.readFile(probePaths[index], 'utf8').catch(() => null)
        // core 0.12.10 leaves ret at -1 after a successful ffprobe; require valid stream metadata too.
        if ((code !== 0 && code !== -1) || typeof json !== 'string') {
          throw new AudioConversionError('INVALID_AUDIO', `无法读取音频 ${index === 0 ? 'A' : 'B'}，请检查文件是否损坏。`)
        }
        try { infos.push(parseSubtractProbe(json)) } catch (error) {
          if (error instanceof AudioConversionError) throw error
          throw new AudioConversionError('INVALID_AUDIO', `无法读取音频 ${index === 0 ? 'A' : 'B'} 的有效音轨。`)
        }
      }
      const [a, b] = infos
      validateSubtractPair(a, b)
      duration = a.duration
      checkCancelled()
      let alignment: AudioSubtractResult['alignment']
      let effectiveOptions = request.options
      if (request.options.autoAlign) {
        matcher = this.createMatcher(); this.matcher = matcher
        alignment = await autoAlignAudio([a, b], request.options, async (input, start, seconds, rate) => {
          checkCancelled()
          const code = await active.exec(['-y', '-ss', start.toFixed(9), '-i', inputs[input], '-t', seconds.toFixed(9),
            '-map', '0:a:0', '-vn', '-ar', String(rate), '-ac', String(a.channels), '-c:a', 'pcm_f32le', '-f', 'f32le', analysisOutput])
          checkCancelled()
          if (code !== 0) throw new AudioConversionError('ALIGNMENT_FAILED', '无法读取自动匹配片段，请尝试 WAV 文件或手动相减。')
          const data = await active.readFile(analysisOutput)
          await active.deleteFile(analysisOutput)
          if (typeof data === 'string' || data.length % 4) throw new AudioConversionError('ALIGNMENT_FAILED', '分析片段数据异常。')
          return new Float32Array(new Uint8Array(data).buffer)
        }, this.matcher, checkCancelled, percent => onProgress?.({ stage: 'matching', percent }))
        matcher.dispose(); if (this.matcher === matcher) this.matcher = null
        effectiveOptions = { ...request.options, gainB: alignment.appliedGainB, invertB: alignment.invertB,
          offsetMs: alignment.offsetSamples / a.sampleRate * 1000 }
      }
      onProgress?.({ stage: 'subtracting', ...(duration ? { percent: 0 } : {}) })
      ffmpeg.on('progress', progress)
      const code = await ffmpeg.exec(buildSubtractCommand(inputs[0], inputs[1], output, a, effectiveOptions))
      ffmpeg.off('progress', progress)
      if (code !== 0) throw new AudioConversionError('SUBTRACT_FAILED', '音频相减失败，请检查文件或先将音频转换为 WAV 后重试。')
      onProgress?.({ stage: 'finishing' })
      const readOutput = async () => {
        const data = await active.readFile(output)
        checkCancelled()
        if (typeof data === 'string' || !data.length) throw new Error('Empty audio output')
        if (data.length >= MAX_SUBTRACT_OUTPUT_BYTES) {
          throw new AudioConversionError('OUTPUT_TOO_LARGE', '结果超过 256 MB，无法完整导出；请先截取较短片段。')
        }
        await active.deleteFile(output)
        return data
      }
      let bytes = await readOutput()
      const protectedMode = request.options.protectUnmatched === true
      const windowFrames = protectedMode ? protectionWindowFrames(readFloatWave(bytes).sampleFrames, a.sampleRate) : undefined
      let wave = await protectFloatWave(bytes, !protectedMode && request.options.preventClipping, checkCancelled, windowFrames)
      const warnings: string[] = alignment?.warnings ? [...alignment.warnings] : []
      let levels: AudioSubtractResult['levels']
      let protection: AudioSubtractResult['protection']
      onProgress?.({ stage: 'measuring' })
      try {
        const meterCode = await ffmpeg.exec(buildLevelCommand(inputs, levelPaths, a, effectiveOptions, wave.sampleFrames, wave.framesPerPoint))
        checkCancelled()
        if (meterCode !== 0) throw new Error('Audio metering failed')
        const measured = []
        for (const path of levelPaths) {
          const metadata = await ffmpeg.readFile(path, 'utf8')
          if (typeof metadata !== 'string') throw new Error('Missing audio levels')
          measured.push(parseLevelMetadata(metadata, wave.sampleFrames, wave.framesPerPoint))
        }
        levels = { sampleRate: wave.sampleRate, sampleFrames: wave.sampleFrames, framesPerPoint: wave.framesPerPoint,
          a: measured[0], b: measured[1], beforeProtection: wave.beforeProtection, c: wave.outputLevels }
      } catch {
        checkCancelled()
        if (protectedMode) throw new AudioConversionError('PROTECTION_ANALYSIS_FAILED', '无法完成整段匹配分析，保护模式未生成结果。可重试或截取较短片段；不会自动改用严格相减。')
        warnings.push('全段音量分析未完成，未显示不完整的对照数据；已生成的音频仍可下载。')
      }
      if (protectedMode && levels) {
        const plan = planProtectedSubtraction(levels)
        protection = plan.summary
        const envelope = createProtectionEnvelope(plan.ranges, wave.sampleFrames, a.sampleRate)
        await ffmpeg.createDir(gateMount)
        gateMounted = await ffmpeg.mount('WORKERFS' as FFFSType, { blobs: [{ name: 'gain.f32', data: envelope }] }, gateMount)
        if (!gateMounted) throw new AudioConversionError('PROTECTION_FAILED', '无法创建本机消减控制轨，未生成结果。')
        // Release the first-pass PCM; only compact statistics are needed for the protected pass.
        bytes = new Uint8Array(0)
        lastPercent = -1
        onProgress?.({ stage: 'subtracting', percent: 0 })
        ffmpeg.on('progress', progress)
        const protectedCode = await ffmpeg.exec(buildSubtractCommand(inputs[0], inputs[1], output, a, effectiveOptions, `${gateMount}/gain.f32`))
        ffmpeg.off('progress', progress)
        checkCancelled()
        if (protectedCode !== 0) throw new AudioConversionError('PROTECTION_FAILED', '保护模式处理失败，未生成结果；不会退回全段相减。')
        bytes = await readOutput()
        onProgress?.({ stage: 'finishing' })
        wave = await protectFloatWave(bytes, false, checkCancelled, windowFrames)
        levels.beforeProtection = wave.beforeProtection; levels.c = wave.outputLevels
        if (!protection.matchedWindows) warnings.push('未发现可可靠消减的片段，已原样保留 A 的解码采样；未将 B 独有声音混入结果。')
        else warnings.push(`仅在可靠匹配的片段消减，其余 ${protection.preservedSeconds.toFixed(2)} 秒保留 A；片段边界使用 5 ms 内侧淡化。保护模式不做整段降音量。`)
      }
      if (levels) {
        if (!protectedMode && levels.a.points.some((point, index) => point.peak <= 1e-6 && levels!.b.points[index].rms > 1e-5)) {
          warnings.push('检测到 A 接近静音而 B 有声的窗口：严格 A−B 会在这些位置留下反相 B，仍可听见。若不希望引入 B 独有声音，请选择“仅消减可靠匹配片段”。')
        }
        const group = Math.max(1, Math.ceil(levels.a.points.length / MAX_LEVEL_POINTS))
        for (const key of ['a', 'b', 'beforeProtection', 'c'] as const) {
          levels[key] = compactLevels(levels[key], levels.sampleFrames, levels.framesPerPoint, group)
        }
        levels.framesPerPoint *= group
      }
      if (a.sampleRate !== b.sampleRate) warnings.push(`B 已从 ${b.sampleRate} Hz 重采样到 A 的 ${a.sampleRate} Hz。重采样可能影响完全抵消效果。`)
      if (a.duration && b.duration && Math.abs(a.duration - b.duration) > 0.02) {
        warnings.push('A、B 时长不同，结果以 A 为准；B 覆盖不到的位置保留 A。')
      }
      if (wave.outputGain < 1) warnings.push(`为防止削波，输出整体降低 ${(-20 * Math.log10(wave.outputGain)).toFixed(2)} dB；包括 B 静音或未覆盖的位置，这些位置并非被相减消除。`)
      else if (wave.peak > 1) warnings.push(protectedMode
        ? '原音频 A 含有超出正常播放幅度的采样；保护模式保留原幅度，播放时仍可能失真。'
        : '结果超出正常播放幅度，浮点 WAV 保留了原始运算值；播放时可能失真，建议启用防削波。')
      if (wave.peak <= 0.000001) warnings.push(protectedMode
        ? '结果为静音或接近静音；请结合 A 的原始电平和保护模式统计判断是否发生抵消。'
        : '结果为静音或接近静音，说明两段音频在当前设置下已基本抵消。')
      return {
        blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }),
        fileName: normalizeSplitFileName(request.fileName, 'wav'),
        sampleRate: wave.sampleRate, channels: wave.channels, sampleFrames: wave.sampleFrames,
        duration: wave.sampleFrames / wave.sampleRate, elapsedMs: performance.now() - started,
        peak: wave.peak, outputGain: wave.outputGain, offsetSamples: offsetInSamples(effectiveOptions.offsetMs, a.sampleRate), warnings, alignment, levels, protection,
      }
    } catch (error) {
      if (!(error instanceof AudioConversionError) && ffmpeg && this.ffmpeg === ffmpeg) this.cancel()
      throw error
    } finally {
      matcher?.dispose(); if (this.matcher === matcher) this.matcher = null
      if (ffmpeg) {
        ffmpeg.off('progress', progress)
        for (const path of [output, analysisOutput, ...probePaths, ...levelPaths]) await ffmpeg.deleteFile(path).catch(() => undefined)
        if (mounted) await ffmpeg.unmount(mountPoint).catch(() => undefined)
        await ffmpeg.deleteDir(mountPoint).catch(() => undefined)
        if (gateMounted) await ffmpeg.unmount(gateMount).catch(() => undefined)
        await ffmpeg.deleteDir(gateMount).catch(() => undefined)
      }
      operation.finish()
    }
  }

  cancel() {
    this.matcher?.dispose(); this.matcher = null
    super.cancel()
  }

  dispose() { this.cancel() }
}

export function createFfmpegAudioSubtractEngine() { return new FfmpegAudioSubtractEngine() }
