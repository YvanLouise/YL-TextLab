import { ANALYSIS_RATE, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, type Spectrum, type SpectrumAnalyzer } from './types'

async function checkDuration(file: File, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(), url = URL.createObjectURL(file)
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort)
      audio.onloadedmetadata = null; audio.onerror = null; audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url)
      if (error) reject(error); else resolve()
    }
    const abort = () => finish(new DOMException('Aborted', 'AbortError'))
    const timer = window.setTimeout(() => finish(), 8000)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > MAX_AUDIO_SECONDS ? new Error('当前支持最长 10 分钟的音频，请先截取需要转写的片段。') : undefined)
    audio.onerror = () => finish()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort(); else audio.src = url
  })
}

export const analyzeMidiSource: SpectrumAnalyzer = async (file, fftSize, signal, onProgress) => {
  if (!file.size || file.size > MAX_AUDIO_BYTES) throw new Error('请选择非空且不超过 100 MB 的音频文件。')
  if (!globalThis.OfflineAudioContext || !globalThis.Worker) throw new Error('当前浏览器不支持本地频谱分析，请使用新版 Chrome、Edge 或 Safari。')
  signal.throwIfAborted()
  await checkDuration(file, signal)
  signal.throwIfAborted()
  let buffer: AudioBuffer
  try {
    const context = new OfflineAudioContext(1, 1, ANALYSIS_RATE)
    buffer = await context.decodeAudioData(await file.arrayBuffer())
  } catch { throw new Error('无法解码此音频，请先用音频转换工具转成 WAV 再导入。') }
  signal.throwIfAborted()
  if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > MAX_AUDIO_SECONDS) throw new Error('当前支持最长 10 分钟的音频，请先截取需要转写的片段。')
  if (buffer.numberOfChannels > 2) throw new Error('请先将多声道音频转换成单声道或立体声。')
  const spectrum = await analyzeMidiBuffer(buffer, fftSize, signal, onProgress)
  return { name: file.name, buffer, spectrum }
}

export async function analyzeMidiBuffer(buffer: AudioBuffer, fftSize: number, signal: AbortSignal, onProgress: (percent: number) => void): Promise<Spectrum> {
  signal.throwIfAborted()
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice())
  return new Promise<Spectrum>((resolve, reject) => {
    const worker = new Worker(new URL('./spectrum.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { signal.removeEventListener('abort', abort); worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate() }
    const abort = () => { finish(); reject(new DOMException('Aborted', 'AbortError')) }
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = () => { finish(); reject(new Error('频谱分析线程异常，请尝试更短的音频。')) }
    worker.onmessageerror = () => { finish(); reject(new Error('频谱数据传输失败，请减少音频长度后重试。')) }
    worker.onmessage = event => {
      if (event.data.type === 'progress') onProgress(event.data.percent)
      else { finish(); if (event.data.type === 'result') resolve(event.data.result); else reject(new Error(event.data.message)) }
    }
    if (signal.aborted) { abort(); return }
    try { worker.postMessage({ channels, sampleRate: buffer.sampleRate, fftSize }, channels.map(channel => channel.buffer)) }
    catch { finish(); reject(new Error('无法传递频谱采样，请减少音频长度后重试。')) }
  })
}
