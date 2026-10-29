import { inspectAudioFile } from '../audio-conversion/audio'
import { LocalAudioEngine, mountAudioFile } from '../audio-shared/engine'
import { probeAudio } from '../audio-shared/probe'
import type { VocalWaveResult } from './output'
import { MAX_VOCAL_PCM_BYTES, MAX_VOCAL_SECONDS, VOCAL_PREVIEW_SECONDS, validateVocalOptions, type VocalOptions, type VocalRenderer } from './types'

export function runVocalWorker(samples: Float32Array, sampleRate: number, channels: number, options: VocalOptions,
  signal: AbortSignal, progress: (percent: number) => void): Promise<VocalWaveResult> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./vocal.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; signal.removeEventListener('abort', abort); worker.terminate() }
    const abort = () => { finish(); reject(new DOMException('净化已停止。', 'AbortError')) }
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = worker.onmessageerror = () => { finish(); reject(new Error('主唱净化线程异常，请尝试较短片段。')) }
    worker.onmessage = event => {
      if (event.data.type === 'progress') progress(event.data.percent)
      else { finish(); if (event.data.type === 'result') resolve(event.data); else reject(new Error(event.data.message)) }
    }
    if (signal.aborted) { abort(); return }
    try { worker.postMessage({ samples, sampleRate, channels, options }, [samples.buffer]) }
    catch (error) { finish(); reject(error) }
  })
}
export const renderVocal: VocalRenderer = async ({ file, options, previewStart }, signal, progress) => {
  validateVocalOptions(options)
  if (previewStart !== null && (!Number.isFinite(previewStart) || previewStart < 0)) throw new Error('试听开始时间无效。')
  signal.throwIfAborted()
  await inspectAudioFile(file)
  signal.throwIfAborted()
  const engine = new LocalAudioEngine()
  const abort = () => engine.dispose()
  signal.addEventListener('abort', abort, { once: true })
  let samples: Float32Array, sampleRate: number, channels: number, duration: number
  try {
    progress('正在加载本地音频引擎…', 0)
    const ffmpeg = await engine.ready()
    const check = () => signal.throwIfAborted()
    check()
    const mounted = await mountAudioFile(ffmpeg, file, check)
    const info = await probeAudio(ffmpeg, mounted.path, check)
    if (![1, 2].includes(info.channels) || info.sampleRate < 8000 || info.sampleRate > 192000) throw new Error('请使用采样率 8–192 kHz 的单声道或立体声音频；可先使用音频转换工具。')
    if (!info.duration) throw new Error('无法确定音频时长，请先转换为 WAV 再导入。')
    if (previewStart !== null && previewStart >= info.duration) throw new Error('试听开始时间须小于音频总时长。')
    duration = previewStart === null ? info.duration : Math.min(VOCAL_PREVIEW_SECONDS, info.duration - previewStart)
    channels = options.channel === 'original' ? info.channels : 1
    sampleRate = info.sampleRate
    if (options.channel === 'right' && info.channels < 2) throw new Error('该文件是单声道，没有独立的右声道。请选择原声道。')
    if (duration > MAX_VOCAL_SECONDS || duration * sampleRate * channels * 4 > MAX_VOCAL_PCM_BYTES) throw new Error('整段净化最多 10 分钟且解码后不超过 128 MB。请先试听 20 秒或用音频分割工具截取较短片段。')
    // Mix in floating point so integer sources do not get rounded back to their input bit depth.
    const filter = options.channel === 'original' ? [] : ['-af', `aformat=sample_fmts=flt,pan=mono|c0=${options.channel === 'right' ? 'c1' : options.channel === 'center' && info.channels === 2 ? '0.5*c0+0.5*c1' : 'c0'}`]
    progress('正在按原采样率读取人声音轨…', 5)
    const code = await ffmpeg.exec(['-y', ...(previewStart === null ? [] : ['-ss', String(previewStart)]), '-i', mounted.path,
      ...(previewStart === null ? [] : ['-t', String(duration)]), '-map', '0:a:0', '-vn', ...filter,
      '-c:a', 'pcm_f32le', '-f', 'f32le', '-fs', String(MAX_VOCAL_PCM_BYTES + 8192), 'vocal.pcm'])
    check()
    if (code !== 0) throw new Error('无法完整解码音频，请先转为 WAV 后重试。')
    const data = await ffmpeg.readFile('vocal.pcm')
    check()
    if (typeof data === 'string' || !data.length || data.length > MAX_VOCAL_PCM_BYTES || data.length % (channels * 4)) throw new Error('音频解码数据无效或超过 128 MB，未生成截断结果。')
    const actualDuration = data.length / (sampleRate * channels * 4)
    if (Math.abs(actualDuration - duration) > Math.max(.15, duration * .005)) throw new Error('解码时长与原片段不符，未提供可能不完整的结果。')
    const aligned = data.byteOffset % 4 ? data.slice() : data
    samples = new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4)
  } finally { signal.removeEventListener('abort', abort); engine.dispose() }
  signal.throwIfAborted()
  const frames = samples.length / channels
  const output = await runVocalWorker(samples, sampleRate, channels, options, signal, percent => progress('正在跟随主旋律并温和抑制次要声音…', 12 + Math.round(percent * .86)))
  signal.throwIfAborted()
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'vocal'
  const warnings = options.strength === 0
    ? ['当前强度为 0%，原声对照保留所选声道的解码采样，被削弱部分为静音。', '输出为 32 位浮点 WAV，不保留歌曲标签或封面。']
    : ['同音高重叠的和声、混响及强干扰仍可能保留；请结合“被削弱的声音”试听判断是否误伤主唱。', '输出为 32 位浮点 WAV，不保留歌曲标签或封面；净化会改变采样，属于声音编辑。']
  if (output.trackedPercent < 30 && options.strength > 0) warnings.unshift('可稳定跟随旋律的片段较少，已对其余部分采用温和降噪。可调整主唱音域或输入声道再试。')
  if (output.outputGain < 1) warnings.push('为避免播放削波，结果已适度降低整体音量。')
  progress('主唱净化完成，可对照试听。', 100)
  return { blob: new Blob([output.clean], { type: 'audio/wav' }), removed: new Blob([output.removed], { type: 'audio/wav' }),
    fileName: `${base}-${options.strength === 0 ? '原声对照' : '主唱净化'}${previewStart === null ? '' : '-试听'}.wav`, sampleRate, channels, frames,
    start: previewStart ?? 0, preview: previewStart !== null, trackedPercent: output.trackedPercent, outputGain: output.outputGain, warnings }
}
