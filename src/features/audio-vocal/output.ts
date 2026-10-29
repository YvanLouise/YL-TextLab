import { cleanVocalPcm, validateVocalPcm } from './process'
import { validateVocalOptions, type VocalOptions } from './types'

export interface VocalWaveResult { clean: Uint8Array<ArrayBuffer>; removed: Uint8Array<ArrayBuffer>; trackedPercent: number; outputGain: number }
const HEADER_BYTES = 56
const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1

function createWave(length: number, sampleRate: number, channels: number) {
  const bytes = new Uint8Array(HEADER_BYTES + length * 4), view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i) }
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * 4, true)
  view.setUint16(32, channels * 4, true); view.setUint16(34, 32, true)
  text(36, 'fact'); view.setUint32(40, 4, true); view.setUint32(44, length / channels, true)
  text(48, 'data'); view.setUint32(52, length * 4, true)
  const samples = new Float32Array(bytes.buffer, HEADER_BYTES, length)
  return { bytes, samples, finalize: () => {
    if (!littleEndian) for (let i = 0; i < length; i++) view.setFloat32(HEADER_BYTES + i * 4, samples[i], true)
  } }
}

export function cleanVocalWave(input: Float32Array, sampleRate: number, channels: number, options: VocalOptions,
  progress: (percent: number) => void = () => {}): VocalWaveResult {
  validateVocalOptions(options); validateVocalPcm(input, sampleRate, channels)
  // DSP writes directly into WAV payloads, avoiding two full-size encoding copies.
  const clean = createWave(input.length, sampleRate, channels), removed = createWave(input.length, sampleRate, channels)
  const result = cleanVocalPcm(input, sampleRate, channels, options, progress, { samples: clean.samples, removed: removed.samples })
  clean.finalize(); removed.finalize()
  return { clean: clean.bytes, removed: removed.bytes, trackedPercent: result.trackedPercent, outputGain: result.outputGain }
}
