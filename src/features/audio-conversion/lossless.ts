import { AudioConversionError, type AudioInputFormat, type LosslessAudioInfo } from './types'
import { readAudioChunks } from './container'

export const LOSSLESS_ACCEPT = '.wav,.wave,.aif,.aiff,.aifc,.flac'

export function supportsLosslessInput(format: AudioInputFormat | null) {
  return format === 'wav' || format === 'aiff' || format === 'flac'
}

export const LOSSLESS_INPUT_NOTICE = '无损压缩支持整数 PCM WAV、AIFF 和 FLAC。MP3、AAC 等有损音频不能恢复音质，转成 FLAC 通常会更大。'

function invalid(): never {
  throw new AudioConversionError('INVALID_LOSSLESS_INPUT', '无法完整读取音频参数，文件可能已损坏；未生成无损压缩结果。')
}

function unsupportedPcm(): never {
  throw new AudioConversionError('UNSUPPORTED_LOSSLESS_PCM', '此文件不是受支持的整数 PCM 音频。浮点或有损编码不能在此模式下无损转为 FLAC，请保留原文件。')
}

function ascii(bytes: Uint8Array, offset: number, count: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + count))
}

function chunks(bytes: Uint8Array, littleEndian: boolean) {
  if (bytes.length < 12) invalid()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = view.getUint32(4, littleEndian) + 8
  if (end > bytes.length || end < 12) invalid()
  const found = new Map<string, { offset: number; size: number }>()
  let at = 12
  while (at + 8 <= end) {
    const size = view.getUint32(at + 4, littleEndian)
    const id = ascii(bytes, at, 4)
    if (at + 8 + size > end) invalid()
    // Multiple audio/format chunks have ambiguous playback semantics.
    if (found.has(id) && ['fmt ', 'data', 'COMM', 'SSND'].includes(id)) invalid()
    found.set(id, { offset: at + 8, size })
    at += 8 + size + size % 2
  }
  if (at !== end) invalid()
  return { view, found }
}

function readWav(bytes: Uint8Array): LosslessAudioInfo {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') invalid()
  const { found } = chunks(bytes, true)
  const fmt = found.get('fmt ')
  const data = found.get('data')
  if (!fmt || fmt.size < 16 || !data) invalid()
  return wavInfo(bytes.subarray(fmt.offset, fmt.offset + fmt.size), data.size)
}

function wavInfo(bytes: Uint8Array, dataSize: number): LosslessAudioInfo {
  if (bytes.length < 16) invalid()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const at = 0
  const codec = view.getUint16(at, true)
  const storageBits = view.getUint16(at + 14, true)
  let bitDepth = storageBits
  if (codec === 0xfffe) {
    if (bytes.length < 40 || view.getUint16(at + 16, true) < 22) invalid()
    const pcmGuid = [1, 0, 0, 0, 0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113]
    if (!pcmGuid.every((value, index) => bytes[at + 24 + index] === value)) unsupportedPcm()
    bitDepth = view.getUint16(at + 18, true) || storageBits
  } else if (codec !== 1) unsupportedPcm()
  const channels = view.getUint16(at + 2, true)
  const sampleRate = view.getUint32(at + 4, true)
  const blockAlign = view.getUint16(at + 12, true)
  if (!blockAlign || blockAlign !== channels * storageBits / 8 || bitDepth > storageBits
    || dataSize % blockAlign || !dataSize) invalid()
  return { sampleRate, bitDepth, channels, sampleFrames: dataSize / blockAlign }
}

function readAiff(bytes: Uint8Array): LosslessAudioInfo {
  const kind = ascii(bytes, 8, 4)
  if (ascii(bytes, 0, 4) !== 'FORM' || !['AIFF', 'AIFC'].includes(kind)) invalid()
  const { view, found } = chunks(bytes, false)
  const comm = found.get('COMM')
  const sound = found.get('SSND')
  if (!comm || comm.size < (kind === 'AIFC' ? 22 : 18) || !sound || sound.size < 8) invalid()
  return aiffInfo(bytes.subarray(comm.offset, comm.offset + comm.size), kind, sound.size, view.getUint32(sound.offset))
}

function aiffInfo(bytes: Uint8Array, kind: string, soundSize: number, soundOffset: number): LosslessAudioInfo {
  if (bytes.length < (kind === 'AIFC' ? 22 : 18)) invalid()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const at = 0
  if (kind === 'AIFC' && !['NONE', 'twos', 'sowt'].includes(ascii(bytes, at + 18, 4))) unsupportedPcm()
  const channels = view.getUint16(at)
  const sampleFrames = view.getUint32(at + 2)
  const bitDepth = view.getUint16(at + 6)
  const exponent = view.getUint16(at + 8)
  // AIFF stores the sample rate as an IEEE 80-bit extended value.
  const sampleRate = (view.getUint32(at + 10) / 2 ** 31 + view.getUint32(at + 14) / 2 ** 63)
    * 2 ** (exponent - 16383)
  if (exponent >= 0x7fff || !sampleFrames || soundOffset > soundSize - 8
    || soundSize - 8 - soundOffset < sampleFrames * channels * Math.ceil(bitDepth / 8)) invalid()
  return { sampleRate, bitDepth, channels, sampleFrames }
}

function readFlac(bytes: Uint8Array): LosslessAudioInfo {
  if (bytes.length < 42 || ascii(bytes, 0, 4) !== 'fLaC'
    || (bytes[4] & 0x7f) !== 0 || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 34) invalid()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    sampleRate: bytes[18] * 4096 + bytes[19] * 16 + (bytes[20] >> 4),
    channels: ((bytes[20] >> 1) & 7) + 1,
    bitDepth: (((bytes[20] & 1) << 4) | (bytes[21] >> 4)) + 1,
    sampleFrames: (bytes[21] & 15) * 2 ** 32 + view.getUint32(22),
  }
}

export function inspectLosslessAudio(bytes: Uint8Array, format: AudioInputFormat): LosslessAudioInfo {
  if (!supportsLosslessInput(format)) throw new AudioConversionError('LOSSLESS_SOURCE_REQUIRED', LOSSLESS_INPUT_NOTICE)
  return validateInfo(format === 'wav' ? readWav(bytes) : format === 'aiff' ? readAiff(bytes) : readFlac(bytes))
}

export async function inspectLosslessFile(file: Blob, format: AudioInputFormat): Promise<LosslessAudioInfo> {
  if (!supportsLosslessInput(format)) throw new AudioConversionError('LOSSLESS_SOURCE_REQUIRED', LOSSLESS_INPUT_NOTICE)
  if (format === 'flac') return inspectLosslessAudio(new Uint8Array(await file.slice(0, 42).arrayBuffer()), format)
  const { kind, chunks } = await readAudioChunks(file, format as 'wav' | 'aiff')
  const fmt = chunks.find(chunk => chunk.id === (format === 'wav' ? 'fmt ' : 'COMM'))
  const data = chunks.find(chunk => chunk.id === (format === 'wav' ? 'data' : 'SSND'))
  if (!fmt || !data) invalid()
  const bytes = new Uint8Array(await file.slice(fmt.offset, fmt.offset + Math.min(fmt.size, 40)).arrayBuffer())
  if (format === 'wav') return validateInfo(wavInfo(bytes, data.size))
  if (data.size < 8) invalid()
  const offset = new DataView(await file.slice(data.offset, data.offset + 4).arrayBuffer()).getUint32(0)
  return validateInfo(aiffInfo(bytes, kind, data.size, offset))
}

function validateInfo(info: LosslessAudioInfo) {
  if (![16, 24].includes(info.bitDepth)) {
    throw new AudioConversionError('UNSUPPORTED_LOSSLESS_DEPTH', `当前无损压缩支持 16/24 位整数音频，此文件为 ${info.bitDepth} 位；为避免改变精度，请保留原文件。`)
  }
  if (!Number.isInteger(info.sampleRate) || info.sampleRate < 1 || info.sampleRate > 655350
    || info.channels < 1 || info.channels > 8) {
    throw new AudioConversionError('UNSUPPORTED_LOSSLESS_PARAMETERS', '此文件的采样率或声道数超出当前 FLAC 编码器支持范围，无法保证无损压缩。')
  }
  return info
}

export function buildPcmHashCommand(inputPath: string, outputPath: string) {
  // Explicit 32-bit PCM avoids the hash muxer's default 16-bit truncation.
  return ['-xerror', '-i', inputPath, '-map', '0:a:0', '-vn', '-c:a', 'pcm_s32le', '-f', 'hash', '-hash', 'sha256', outputPath]
}

export function verifyLosslessAudio(source: LosslessAudioInfo, output: LosslessAudioInfo, sourceHash: string, outputHash: string) {
  if (source.sampleRate !== output.sampleRate || source.bitDepth !== output.bitDepth || source.channels !== output.channels
    || !output.sampleFrames || (source.sampleFrames > 0 && source.sampleFrames !== output.sampleFrames)
    || !/^SHA256=[a-f0-9]{64}$/i.test(sourceHash.trim()) || sourceHash.trim() !== outputHash.trim()) {
    throw new AudioConversionError('LOSSLESS_VERIFY_FAILED', '无损校验未通过：输出参数或采样数据与原音频不一致，未提供下载，请保留原文件。')
  }
}
