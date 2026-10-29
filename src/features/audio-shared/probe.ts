import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { AudioConversionError } from '../audio-conversion/types'

export interface AudioStreamInfo { sampleRate: number; channels: number; duration: number | null }

export function parseAudioProbe(json: string): AudioStreamInfo {
  let data: { streams?: { sample_rate?: unknown; channels?: unknown; duration?: unknown }[]; format?: { duration?: unknown } }
  try { data = JSON.parse(json) } catch { throw new AudioConversionError('INVALID_AUDIO', '无法读取音轨信息，文件可能损坏。') }
  const stream = data?.streams?.[0], sampleRate = Number(stream?.sample_rate), channels = Number(stream?.channels)
  if (!stream) throw new AudioConversionError('NO_AUDIO_TRACK', '文件中没有可处理的音轨。')
  if (!Number.isInteger(sampleRate) || sampleRate < 1000 || sampleRate > 384000 || !Number.isInteger(channels) || channels < 1 || channels > 32) {
    throw new AudioConversionError('INVALID_AUDIO', '音轨采样率或声道数无效，或超出支持范围。')
  }
  const duration = [stream.duration, data.format?.duration].map(Number).find(value => Number.isFinite(value) && value > 0) ?? null
  return { sampleRate, channels, duration }
}

export async function probeAudio(ffmpeg: FFmpeg, path: string, check: () => void = () => {}) {
  const output = `probe-${crypto.randomUUID()}.json`
  try {
    check()
    const code = await ffmpeg.ffprobe(['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels,duration:format=duration', '-of', 'json', '-o', output, path])
    check()
    const json = await ffmpeg.readFile(output, 'utf8').catch(() => null)
    // The pinned core can return -1 on successful ffprobe; metadata must also validate.
    if (![0, -1].includes(code) || typeof json !== 'string') throw new AudioConversionError('PROBE_FAILED', '无法读取音轨信息，请检查格式和文件完整性。')
    return parseAudioProbe(json)
  } finally { await ffmpeg.deleteFile(output).catch(() => undefined) }
}
