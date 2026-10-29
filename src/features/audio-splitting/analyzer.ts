import { readMediaDuration } from '../audio-shared/media'
import { createWaveformPeaks } from './audio'
import type { AudioSplitSourceKind } from './types'

export interface AudioAnalysis { duration: number; peaks: number[]; channels?: number | null; notice?: string }
export type AudioAnalyzer = (file: File, url: string, kind: AudioSplitSourceKind, signal: AbortSignal) => Promise<AudioAnalysis>
export const WAVEFORM_RATE = 16000
export const MAX_WAVEFORM_BYTES = 64 * 1024 * 1024

export function shouldDecodeWaveform(bytes: number, duration: number | null) {
  return duration !== null && duration > 0 && duration <= 600 && bytes <= MAX_WAVEFORM_BYTES
    && duration * WAVEFORM_RATE * 2 * 4 <= MAX_WAVEFORM_BYTES
}

export const analyzeSplitAudio: AudioAnalyzer = async (file, url, kind, signal) => {
  signal.throwIfAborted()
  const duration = await readMediaDuration(url, signal, kind)
  signal.throwIfAborted()
  if (duration === null) throw new Error('Cannot read media duration')
  if (!shouldDecodeWaveform(file.size, duration)) return { duration, peaks: [], notice: '为控制内存，此文件跳过完整波形生成；仍可试听、输入精确时间并正常导出，原音质不受影响。' }
  try {
    const context = new OfflineAudioContext(1, 1, WAVEFORM_RATE)
    const data = await file.arrayBuffer()
    signal.throwIfAborted()
    const buffer = await context.decodeAudioData(data)
    signal.throwIfAborted()
    if (buffer.length * buffer.numberOfChannels * 4 > MAX_WAVEFORM_BYTES) return { duration, peaks: [], channels: buffer.numberOfChannels,
      notice: '多声道波形数据较大，已跳过绘图；仍可精确选择时间并导出。' }
    const peaks = new Array<number>(Math.min(8192, buffer.length)).fill(0)
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const next = createWaveformPeaks(buffer.getChannelData(channel), peaks.length)
      next.forEach((value, index) => { peaks[index] = Math.max(peaks[index], value) })
      await new Promise(resolve => setTimeout(resolve, 0))
      signal.throwIfAborted()
    }
    return { duration: buffer.duration, peaks, channels: buffer.numberOfChannels }
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof RangeError) return { duration, peaks: [], notice: '内存不足，已跳过波形绘制；可继续按时间导出。' }
    return { duration, peaks: [], notice: '浏览器无法绘制此格式的波形，可按时间选择并尝试导出。' }
  }
}
