import { AudioConversionError } from '../audio-conversion/types'
import { normalizeSplitFileName } from '../audio-splitting/audio'
import { MAX_SUBTRACT_OUTPUT_BYTES, type AudioSubtractInfo, type AudioSubtractOptions } from './types'
import { levelWindowFrames, summarizeLevels } from './levels'

export function validateSubtractOptions(options: AudioSubtractOptions) {
  if (!Number.isFinite(options.gainB) || options.gainB < 0 || options.gainB > 2) {
    throw new AudioConversionError('INVALID_GAIN', 'B 的音量比例须为 0–200%。')
  }
  if (!Number.isFinite(options.offsetMs) || Math.abs(options.offsetMs) > 60000) {
    throw new AudioConversionError('INVALID_OFFSET', 'B 的时间偏移须在 -60,000 至 60,000 毫秒之间。')
  }
  if (options.autoAlign && (![250, 1000, 3000, 10000].includes(options.searchRadiusMs ?? 3000)
    || !Number.isFinite(options.reductionStrength ?? 1) || (options.reductionStrength ?? 1) < 0.1 || (options.reductionStrength ?? 1) > 1)) {
    throw new AudioConversionError('INVALID_ALIGNMENT_OPTIONS', '请使用有效的搜索范围和 10–100% 的消减强度。')
  }
}

export function parseSubtractProbe(json: string): AudioSubtractInfo {
  const data = JSON.parse(json) as { streams?: { sample_rate?: string; channels?: number; duration?: string }[]; format?: { duration?: string } }
  const stream = data.streams?.[0]
  const sampleRate = Number(stream?.sample_rate)
  const channels = Number(stream?.channels)
  const duration = [stream?.duration, data.format?.duration].map(Number).find(value => Number.isFinite(value) && value > 0) ?? null
  if (!Number.isInteger(sampleRate) || sampleRate < 1000 || sampleRate > 384000) {
    throw new AudioConversionError('INVALID_AUDIO', '无法读取有效音轨，或采样率超出支持范围。')
  }
  if (channels !== 1 && channels !== 2) {
    throw new AudioConversionError('INVALID_CHANNELS', '音频相减支持单声道或双声道文件，请先将多声道音频转换为立体声。')
  }
  return { sampleRate, channels, duration }
}

export function validateSubtractPair(a: AudioSubtractInfo, b: AudioSubtractInfo) {
  if (a.channels !== b.channels) {
    throw new AudioConversionError('CHANNEL_MISMATCH', 'A、B 的声道数不同，请先在音频转换工具中统一为单声道或立体声。')
  }
  if (a.duration && a.duration * a.sampleRate * a.channels * 4 > MAX_SUBTRACT_OUTPUT_BYTES - 65536) {
    throw new AudioConversionError('OUTPUT_TOO_LARGE', '此音频解码后的结果超过 256 MB，请先截取较短片段后再相减。')
  }
}

export function subtractFileName(a: string, b: string) {
  const stem = (name: string) => name.replace(/\.[^.]+$/, '').slice(0, 70)
  return normalizeSplitFileName(`${stem(a)}_minus_${stem(b)}`, 'wav')
}

export function offsetInSamples(offsetMs: number, sampleRate: number) {
  return Math.round(offsetMs * sampleRate / 1000)
}

export function buildSubtractCommand(a: string, b: string, output: string, info: AudioSubtractInfo, options: AudioSubtractOptions, envelope?: string) {
  validateSubtractOptions(options)
  const offset = offsetInSamples(options.offsetMs, info.sampleRate)
  const layout = info.channels === 1 ? 'mono' : 'stereo'
  const format = `aformat=sample_fmts=flt:sample_rates=${info.sampleRate}:channel_layouts=${layout}`
  const shift = offset < 0 ? `atrim=start_sample=${-offset},asetpts=N/SR/TB`
    : offset > 0 ? `adelay=${offset}S:all=1` : 'anull'
  // Pad B before trimming so an offset beyond its end still leaves A intact.
  const graph = `[0:a:0]${format},asetpts=N/SR/TB[a];`
    + `[1:a:0]aresample=${info.sampleRate}:async=0,${format},asetpts=N/SR/TB,apad,${shift},volume=${options.invertB ? options.gainB : -options.gainB}:precision=float[b];`
    + (envelope ? `[2:a:0]${info.channels === 2 ? 'pan=stereo|c0=c0|c1=c0,' : ''}${format}[gate];[b][gate]amultiply[masked];` : '')
    // FFmpeg 5.1 takes absolute amix weights, so invert B before summing.
    + `[a][${envelope ? 'masked' : 'b'}]amix=inputs=2:duration=first:weights='1 1':normalize=0:dropout_transition=0[out]`
  return ['-y', '-i', a, '-i', b, ...(envelope ? ['-f', 'f32le', '-ar', String(info.sampleRate), '-ac', '1', '-i', envelope] : []),
    '-filter_complex', graph, '-map', '[out]', '-map_metadata', '-1',
    '-c:a', 'pcm_f32le', '-fs', String(MAX_SUBTRACT_OUTPUT_BYTES), output]
}

export function readFloatWave(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Invalid WAV output')
  let sampleRate = 0
  let channels = 0
  let floatFormat = false
  let dataOffset = 0
  let dataLength = 0
  for (let at = 12; at + 8 <= bytes.length;) {
    const length = view.getUint32(at + 4, true)
    if (at + 8 + length > bytes.length) throw new Error('Truncated WAV output')
    if (tag(at) === 'fmt ' && length >= 16) {
      const format = view.getUint16(at + 8, true)
      channels = view.getUint16(at + 10, true)
      sampleRate = view.getUint32(at + 12, true)
      floatFormat = view.getUint16(at + 22, true) === 32 && (format === 3
        || (format === 0xfffe && length >= 40 && view.getUint16(at + 32, true) === 3))
    }
    if (tag(at) === 'data') { dataOffset = at + 8; dataLength = length }
    at += 8 + length + length % 2
  }
  if (!floatFormat || !sampleRate || ![1, 2].includes(channels) || !dataLength || dataLength % (4 * channels)) {
    throw new Error('Invalid floating point WAV output')
  }
  return { view, dataOffset, samples: dataLength / 4, sampleRate, channels, sampleFrames: dataLength / 4 / channels }
}

export async function protectFloatWave(bytes: Uint8Array, preventClipping: boolean, checkCancelled: () => void, windowFrames?: number) {
  const wave = readFloatWave(bytes)
  const framesPerPoint = windowFrames ?? levelWindowFrames(wave.sampleFrames)
  const samplesPerPoint = framesPerPoint * wave.channels
  const points = []
  let sinceYield = 0
  let peak = 0
  for (let start = 0; start < wave.samples; start += samplesPerPoint) {
    checkCancelled()
    const end = Math.min(start + samplesPerPoint, wave.samples)
    let windowPeak = 0, energy = 0
    for (let i = start; i < end; i++) {
      const value = wave.view.getFloat32(wave.dataOffset + i * 4, true)
      if (!Number.isFinite(value)) throw new AudioConversionError('INVALID_OUTPUT', '音频结果包含无效采样，无法导出。')
      windowPeak = Math.max(windowPeak, Math.abs(value))
      energy += value * value
    }
    points.push({ peak: windowPeak, rms: Math.sqrt(energy / (end - start)) })
    peak = Math.max(peak, windowPeak)
    sinceYield += end - start
    if (sinceYield >= 262144 && end < wave.samples) { sinceYield = 0; await new Promise(resolve => setTimeout(resolve, 0)) }
  }
  const beforeProtection = summarizeLevels(points, wave.sampleFrames, framesPerPoint)
  const outputGain = preventClipping && peak > 1 ? 0.999 / peak : 1
  let outputLevels = beforeProtection
  if (outputGain < 1) {
    const protectedPoints = []
    for (let start = 0; start < wave.samples; start += samplesPerPoint) {
      checkCancelled()
      const end = Math.min(start + samplesPerPoint, wave.samples)
      let windowPeak = 0, energy = 0
      for (let i = start; i < end; i++) {
        const at = wave.dataOffset + i * 4
        const value = Math.fround(wave.view.getFloat32(at, true) * outputGain)
        wave.view.setFloat32(at, value, true)
        windowPeak = Math.max(windowPeak, Math.abs(value)); energy += value * value
      }
      protectedPoints.push({ peak: windowPeak, rms: Math.sqrt(energy / (end - start)) })
      sinceYield += end - start
      if (sinceYield >= 262144 && end < wave.samples) { sinceYield = 0; await new Promise(resolve => setTimeout(resolve, 0)) }
    }
    outputLevels = summarizeLevels(protectedPoints, wave.sampleFrames, framesPerPoint)
  }
  checkCancelled()
  return { sampleRate: wave.sampleRate, channels: wave.channels, sampleFrames: wave.sampleFrames,
    peak, outputGain, framesPerPoint, beforeProtection, outputLevels }
}
