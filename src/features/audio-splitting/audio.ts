import { inspectAudioFile } from '../audio-conversion/audio'
import { AudioConversionError, MAX_AUDIO_FILE_SIZE, type AudioInputFormat } from '../audio-conversion/types'
import type {
  AudioSplitInputFormat,
  AudioSplitOutputFormat,
  AudioSplitSource,
  VideoInputFormat,
} from './types'

export const VIDEO_ACCEPT = ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'].join(',')

const videoExtensionFormats: Record<string, VideoInputFormat> = {
  mp4: 'mp4',
  mov: 'mov',
  m4v: 'm4v',
  webm: 'webm',
  mkv: 'mkv',
  avi: 'avi',
}

const extensionByFormat: Record<AudioInputFormat, string> = {
  mp3: 'mp3',
  wav: 'wav',
  flac: 'flac',
  m4a: 'm4a',
  aac: 'aac',
  ogg: 'ogg',
  opus: 'opus',
  wma: 'wma',
  aiff: 'aiff',
}

const mimeByFormat: Record<AudioInputFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  wma: 'audio/x-ms-wma',
  aiff: 'audio/aiff',
}

const codecByFormat: Record<AudioInputFormat, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-b:a', '192k', '-id3v2_version', '3'],
  wav: ['-c:a', 'pcm_s16le'],
  flac: ['-c:a', 'flac', '-compression_level', '5'],
  m4a: ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
  aac: ['-c:a', 'aac', '-b:a', '192k', '-f', 'adts'],
  ogg: ['-c:a', 'libvorbis', '-q:a', '5'],
  opus: ['-c:a', 'libopus', '-b:a', '160k', '-vbr', 'on'],
  wma: ['-c:a', 'wmav2', '-b:a', '192k'],
  aiff: ['-c:a', 'pcm_s16be'],
}

export function isLikelyVideoFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return file.type.startsWith('video/') || extension in videoExtensionFormats
}

export async function inspectSplitSource(file: File): Promise<AudioSplitSource> {
  if (file.size > MAX_AUDIO_FILE_SIZE) {
    throw new AudioConversionError('FILE_TOO_LARGE', '单个音频或视频文件不能超过 100 MB。')
  }
  if (isLikelyVideoFile(file)) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    const format = videoExtensionFormats[extension]
    if (!format) throw new AudioConversionError('UNSUPPORTED_FORMAT', '暂不支持此视频格式。')
    return { kind: 'video', format }
  }
  return { kind: 'audio', format: await inspectAudioFile(file) }
}

export function clampSplitRange(startSeconds: number, endSeconds: number, duration: number) {
  const safeDuration = Math.max(0, duration)
  const start = Math.max(0, Math.min(safeDuration, startSeconds))
  const end = Math.max(start, Math.min(safeDuration, endSeconds))
  return { start, end }
}

export function formatPreciseTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000)
  const secs = Math.floor((milliseconds % 60_000) / 1000)
  const millis = milliseconds % 1000
  return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function parsePreciseTime(value: string) {
  const parts = value.trim().split(':')
  if (parts.length < 2 || parts.length > 3) return null
  const seconds = Number(parts.pop())
  const minutes = Number(parts.pop())
  const hours = parts.length ? Number(parts.pop()) : 0
  if (![hours, minutes, seconds].every(Number.isFinite) || hours < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return null
  return hours * 3600 + minutes * 60 + seconds
}

export function splitExtension(inputFormat: AudioSplitInputFormat, outputFormat: AudioSplitOutputFormat) {
  if (outputFormat === 'wav') return 'wav'
  if (outputFormat === 'mp3') return 'mp3'
  return inputFormat in extensionByFormat ? extensionByFormat[inputFormat as AudioInputFormat] : 'mp3'
}

export function splitMime(inputFormat: AudioSplitInputFormat, outputFormat: AudioSplitOutputFormat) {
  if (outputFormat === 'wav') return 'audio/wav'
  if (outputFormat === 'mp3') return 'audio/mpeg'
  return inputFormat in mimeByFormat ? mimeByFormat[inputFormat as AudioInputFormat] : 'audio/mpeg'
}

export function createSplitFileName(
  sourceName: string,
  inputFormat: AudioSplitInputFormat,
  outputFormat: AudioSplitOutputFormat,
  startSeconds: number,
  endSeconds: number,
) {
  const base = sourceName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'audio'
  const start = formatPreciseTime(startSeconds).replace(/[:.]/g, '-')
  const end = formatPreciseTime(endSeconds).replace(/[:.]/g, '-')
  return `${base}_片段_${start}_${end}.${splitExtension(inputFormat, outputFormat)}`
}

export function buildSplitCommand(
  inputPath: string,
  outputPath: string,
  inputFormat: AudioSplitInputFormat,
  outputFormat: AudioSplitOutputFormat,
  startSeconds: number,
  endSeconds: number,
) {
  const duration = Math.max(0, endSeconds - startSeconds)
  const codec = outputFormat === 'wav'
    ? codecByFormat.wav
    : outputFormat === 'mp3'
      ? codecByFormat.mp3
      : codecByFormat[inputFormat as AudioInputFormat] ?? codecByFormat.mp3
  return [
    '-i', inputPath,
    '-ss', startSeconds.toFixed(3),
    '-t', duration.toFixed(3),
    '-map', '0:a:0',
    '-vn',
    '-map_metadata', '0',
    ...codec,
    outputPath,
  ]
}

export function createWaveformPeaks(channelData: Float32Array, count = 240) {
  if (!channelData.length || count <= 0) return []
  const peaks = new Array<number>(count)
  const blockSize = Math.max(1, Math.floor(channelData.length / count))
  for (let index = 0; index < count; index += 1) {
    const start = index * blockSize
    const end = Math.min(channelData.length, start + blockSize)
    let peak = 0
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(channelData[sampleIndex]))
    }
    peaks[index] = peak
  }
  return peaks
}
