import type { FFFSType } from '@ffmpeg/ffmpeg'
import { LocalAudioEngine } from '../audio-shared/engine'
import { inspectAudioFile } from '../audio-conversion/audio'
import { analyzeMidiBuffer } from '../audio-midi/analyzer'
import { ANALYSIS_RATE, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from '../audio-midi/types'
import { parseSubtractProbe } from '../audio-subtraction/audio'
import { MAX_SPECTRAL_PCM_BYTES, validateRegions, type SpectralRenderer, type SpectralRegion } from './types'

export function runSpectralWorker(samples: Float32Array, sampleRate: number, channels: number, regions: SpectralRegion[],
  signal: AbortSignal, progress: (percent: number) => void): Promise<{ bytes: Uint8Array<ArrayBuffer>; peak: number; fftSize: number }> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./spectral.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; signal.removeEventListener('abort', abort); worker.terminate() }
    const abort = () => { finish(); reject(new DOMException('Aborted', 'AbortError')) }
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = () => { finish(); reject(new Error('频谱处理线程异常，请尝试较短片段。')) }
    worker.onmessageerror = () => { finish(); reject(new Error('频谱处理结果无法传回，请使用较短片段重试。')) }
    worker.onmessage = event => {
      if (event.data.type === 'progress') progress(event.data.percent)
      else { finish(); if (event.data.type === 'result') resolve(event.data); else reject(new Error(event.data.message)) }
    }
    try { worker.postMessage({ samples, sampleRate, channels, regions }, [samples.buffer]) } catch (error) { finish(); reject(error) }
  })
}

export const renderSpectralEdits: SpectralRenderer = async (file, regions, fftSize, signal, progress) => {
  if (!file.size || file.size > MAX_AUDIO_BYTES) throw new Error('频谱编辑支持不超过 100 MB 的音频。')
  if (!globalThis.Worker || !globalThis.WebAssembly) throw new Error('浏览器不支持本地音频处理。')
  signal.throwIfAborted()
  const engine = new LocalAudioEngine(), mount = '/spectral-input', output = 'spectral.pcm', probe = 'spectral.json'
  const abort = () => engine.dispose()
  signal.addEventListener('abort', abort, { once: true })
  let samples: Float32Array, sampleRate: number, channels: number
  try {
    progress('正在初始化本地音频引擎，首次需加载约 31 MB…')
    const ffmpeg = await engine.ready()
    signal.throwIfAborted()
    const format = await inspectAudioFile(file), name = `source.${format}`, path = `${mount}/${name}`
    signal.throwIfAborted()
    await ffmpeg.createDir(mount)
    if (!await ffmpeg.mount('WORKERFS' as FFFSType, { blobs: [{ name, data: file }] }, mount)) throw new Error('无法读取本机音频。')
    const code = await ffmpeg.ffprobe(['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels,duration:format=duration', '-of', 'json', '-o', probe, path])
    const json = await ffmpeg.readFile(probe, 'utf8')
    if (![0, -1].includes(code) || typeof json !== 'string') throw new Error('无法读取音频规格。')
    const info = parseSubtractProbe(json)
    sampleRate = info.sampleRate; channels = info.channels
    if (!info.duration || info.duration > MAX_AUDIO_SECONDS || sampleRate < 8000) throw new Error('频谱去除需要时长可读、最长 10 分钟且采样率至少 8 kHz 的音频。')
    if (info.duration * sampleRate * channels * 4 > MAX_SPECTRAL_PCM_BYTES) throw new Error('解码后超过 128 MB，请先截取较短的片段再处理。')
    validateRegions(regions, info.duration, sampleRate / 2)
    progress('正在按原采样率解码音频…')
    const decoded = await ffmpeg.exec(['-y', '-i', path, '-map', '0:a:0', '-vn', '-c:a', 'pcm_f32le', '-f', 'f32le', '-fs', String(MAX_SPECTRAL_PCM_BYTES + 8192), output])
    signal.throwIfAborted()
    if (decoded !== 0) throw new Error('无法解码音频，请先转为 WAV 后重试。')
    const data = await ffmpeg.readFile(output)
    if (typeof data === 'string' || !data.length || data.length % (4 * channels) || data.length > MAX_SPECTRAL_PCM_BYTES) throw new Error('解码数据无效或超过 128 MB，请使用较短的音频。')
    samples = new Float32Array(new Uint8Array(data).buffer)
  } finally {
    signal.removeEventListener('abort', abort)
    // Termination releases the entire isolated file system, including mounted input and partial output.
    engine.dispose()
  }
  signal.throwIfAborted()
  const frames = samples.length / channels
  const result = await runSpectralWorker(samples, sampleRate, channels, regions, signal, percent => progress(`正在去除指定频谱 ${percent}%…`, percent))
  signal.throwIfAborted()
  const blob = new Blob([result.bytes], { type: 'audio/wav' })
  progress('正在生成处理后的频谱与试听…')
  const buffer = await new OfflineAudioContext(1, 1, ANALYSIS_RATE).decodeAudioData(result.bytes.buffer)
  const spectrum = await analyzeMidiBuffer(buffer, fftSize, signal, percent => progress(`正在生成处理后频谱 ${percent}%…`, percent))
  const preview = { name: 'processed.wav', buffer, spectrum }
  signal.throwIfAborted()
  const warnings = ['频率与时间边界有平滑过渡；很短或很窄的选区可能仍有残留。输出不保留封面或歌曲标签。']
  if (result.peak > 1) warnings.push('处理后的峰值超过 0 dBFS；浮点 WAV 保留原幅度，播放时可能削波，请降低播放音量。')
  return { blob, preview, sampleRate, channels, frames, peak: result.peak, warnings }
}
