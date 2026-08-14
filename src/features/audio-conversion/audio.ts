import {
  AudioConversionError,
  MAX_AUDIO_BATCH_SIZE,
  MAX_AUDIO_FILE_SIZE,
  MAX_AUDIO_FILES,
  type AudioChannels,
  type AudioConversionOptions,
  type AudioInputFormat,
  type AudioMetadata,
  type AudioOutputFormat,
  type AudioQualityPreset,
  type AudioSampleRate,
} from './types'

export const AUDIO_ACCEPT = [
  '.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wma', '.aif', '.aiff', '.aifc',
].join(',')

export const OUTPUT_FORMATS: Array<{
  value: AudioOutputFormat
  label: string
  detail: string
}> = [
  { value: 'mp3', label: 'MP3', detail: '通用高兼容' },
  { value: 'wav', label: 'WAV', detail: 'PCM 无损' },
  { value: 'flac', label: 'FLAC', detail: '无损压缩' },
  { value: 'm4a', label: 'M4A', detail: 'AAC 容器' },
  { value: 'aac', label: 'AAC', detail: '原始音频流' },
  { value: 'ogg', label: 'OGG', detail: 'Vorbis 开放格式' },
  { value: 'opus', label: 'Opus', detail: '高效语音音乐' },
]

const extensionFormats: Record<string, AudioInputFormat> = {
  mp3: 'mp3',
  wav: 'wav',
  wave: 'wav',
  flac: 'flac',
  m4a: 'm4a',
  mp4: 'm4a',
  aac: 'aac',
  ogg: 'ogg',
  oga: 'ogg',
  opus: 'opus',
  wma: 'wma',
  aif: 'aiff',
  aiff: 'aiff',
  aifc: 'aiff',
}

const outputMimeTypes: Record<AudioInputFormat, string> = {
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

const outputExtensions: Record<AudioInputFormat, string> = {
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

const bitrateByFormat: Partial<Record<AudioOutputFormat, Record<AudioQualityPreset, string>>> = {
  mp3: { compact: '128k', standard: '192k', high: '320k' },
  m4a: { compact: '128k', standard: '192k', high: '256k' },
  aac: { compact: '128k', standard: '192k', high: '256k' },
  opus: { compact: '96k', standard: '160k', high: '256k' },
}

const oggQuality: Record<AudioQualityPreset, string> = {
  compact: '3',
  standard: '5',
  high: '7',
}

const customBitrateRanges: Partial<Record<AudioOutputFormat, { min: number; max: number; step: number }>> = {
  mp3: { min: 64, max: 320, step: 16 },
  m4a: { min: 64, max: 320, step: 16 },
  aac: { min: 64, max: 320, step: 16 },
  ogg: { min: 64, max: 320, step: 16 },
  opus: { min: 32, max: 320, step: 16 },
}

function matches(bytes: Uint8Array, offset: number, values: number[]) {
  return values.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

export function detectAudioFormat(bytes: Uint8Array, fileName = ''): AudioInputFormat | null {
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'wav'
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'fLaC') return 'flac'
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS') {
    const header = ascii(bytes, 0, Math.min(bytes.length, 256))
    return header.includes('OpusHead') ? 'opus' : 'ogg'
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') return 'm4a'
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') return 'mp3'
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe6) === 0xe2) return 'mp3'
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return 'aac'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'FORM' && ['AIFF', 'AIFC'].includes(ascii(bytes, 8, 4))) return 'aiff'
  if (bytes.length >= 16 && matches(bytes, 0, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) return 'wma'

  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return extensionFormats[extension] ?? null
}

export async function inspectAudioFile(file: File) {
  if (file.size > MAX_AUDIO_FILE_SIZE) {
    throw new AudioConversionError('FILE_TOO_LARGE', '单个音频文件不能超过 100 MB。')
  }
  const header = new Uint8Array(await file.slice(0, 512).arrayBuffer())
  const format = detectAudioFormat(header, file.name)
  if (!format) {
    throw new AudioConversionError('UNSUPPORTED_FORMAT', '无法识别此音频格式。')
  }
  return format
}

export function validateAudioBatch(currentFiles: File[], additions: File[]) {
  const room = MAX_AUDIO_FILES - currentFiles.length
  if (room <= 0) {
    throw new AudioConversionError('FILE_COUNT_LIMIT', `每批最多添加 ${MAX_AUDIO_FILES} 个音频文件。`)
  }
  const accepted: File[] = []
  let total = currentFiles.reduce((sum, file) => sum + file.size, 0)
  for (const file of additions.slice(0, room)) {
    if (file.size > MAX_AUDIO_FILE_SIZE) continue
    if (total + file.size > MAX_AUDIO_BATCH_SIZE) break
    accepted.push(file)
    total += file.size
  }
  if (!accepted.length && additions.length) {
    throw new AudioConversionError('BATCH_SIZE_LIMIT', '单批音频总大小不能超过 500 MB，单个文件不能超过 100 MB。')
  }
  return {
    accepted,
    ignored: additions.length - accepted.length,
  }
}

export function outputMime(format: AudioInputFormat) {
  return outputMimeTypes[format]
}

export function outputExtension(format: AudioInputFormat) {
  return outputExtensions[format]
}

export function outputFileName(fileName: string, format: AudioOutputFormat) {
  const cleanBase = fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'audio'
  return `${cleanBase}.${outputExtension(format)}`
}

export function metadataOutputFileName(fileName: string, format: AudioInputFormat) {
  const cleanBase = fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'audio'
  return `${cleanBase}-已编辑.${outputExtension(format)}`
}

export function bitrateRange(format: AudioOutputFormat) {
  return customBitrateRanges[format] ?? null
}

export function effectiveBitrateKbps(options: AudioConversionOptions) {
  const range = bitrateRange(options.format)
  if (!range) return null
  if (options.qualityMode === 'custom') {
    return Math.max(range.min, Math.min(range.max, Math.round(options.customBitrateKbps)))
  }
  if (options.format === 'ogg') {
    return { compact: 112, standard: 160, high: 224 }[options.quality]
  }
  const value = bitrateByFormat[options.format]?.[options.quality]
  return value ? Number.parseInt(value, 10) : null
}

export function qualityLabel(
  format: AudioOutputFormat,
  preset: AudioQualityPreset,
  customBitrateKbps?: number,
) {
  if (format === 'wav') return 'PCM 16-bit'
  if (format === 'flac') return '无损'
  if (customBitrateKbps !== undefined) return `${customBitrateKbps}k`
  if (format === 'ogg') return `Vorbis Q${oggQuality[preset]}`
  return bitrateByFormat[format]?.[preset] ?? '标准'
}

export function estimateAudioOutputSize(durationSeconds: number | null, options: AudioConversionOptions) {
  if (options.mode === 'metadata-only') return null
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null
  if (options.format === 'flac') return null
  if (options.format === 'wav') {
    const sampleRate = options.sampleRate === 'original' ? 44100 : options.sampleRate
    const channels = options.channels === 'mono' ? 1 : 2
    return Math.ceil(durationSeconds * sampleRate * channels * 2 + 44)
  }
  const bitrate = effectiveBitrateKbps(options)
  return bitrate ? Math.ceil(durationSeconds * bitrate * 1000 / 8 * 1.02) : null
}

function commonAudioArgs(sampleRate: AudioSampleRate, channels: AudioChannels) {
  const args: string[] = []
  if (sampleRate !== 'original') args.push('-ar', String(sampleRate))
  if (channels !== 'original') args.push('-ac', channels === 'mono' ? '1' : '2')
  return args
}

function codecArgs(options: AudioConversionOptions, outputFormat: AudioInputFormat) {
  if (options.mode === 'metadata-only') {
    const args = ['-c:a', 'copy']
    if (outputFormat === 'mp3') args.push('-id3v2_version', '3')
    if (outputFormat === 'm4a') args.push('-movflags', '+faststart')
    if (outputFormat === 'aac') args.push('-f', 'adts')
    return args
  }
  const bitrate = `${effectiveBitrateKbps(options)}k`
  switch (options.format) {
    case 'mp3': return ['-c:a', 'libmp3lame', '-b:a', bitrate!, '-id3v2_version', '3']
    case 'wav': return ['-c:a', 'pcm_s16le']
    case 'flac': return ['-c:a', 'flac', '-compression_level', '5']
    case 'm4a': return ['-c:a', 'aac', '-b:a', bitrate!, '-movflags', '+faststart']
    case 'aac': return ['-c:a', 'aac', '-b:a', bitrate!, '-f', 'adts']
    case 'ogg': return options.qualityMode === 'custom'
      ? ['-c:a', 'libvorbis', '-b:a', bitrate]
      : ['-c:a', 'libvorbis', '-q:a', oggQuality[options.quality]]
    case 'opus': return ['-c:a', 'libopus', '-b:a', bitrate!, '-vbr', 'on']
  }
}

export function supportsCoverArt(format: AudioInputFormat) {
  return format === 'mp3' || format === 'm4a' || format === 'flac'
}

interface AudioCommandExtras {
  metadata?: AudioMetadata
  coverPath?: string | null
  includeCover?: boolean
  outputFormat?: AudioInputFormat
}

const metadataKeys: Array<[keyof AudioMetadata, string]> = [
  ['title', 'title'],
  ['artist', 'artist'],
  ['album', 'album'],
  ['year', 'date'],
  ['track', 'track'],
  ['genre', 'genre'],
  ['comment', 'comment'],
]

export function buildAudioCommand(
  inputPath: string,
  outputPath: string,
  options: AudioConversionOptions,
  extras: AudioCommandExtras = {},
) {
  const outputFormat = extras.outputFormat ?? options.format
  const includeCover = extras.includeCover ?? supportsCoverArt(outputFormat)
  const coverPath = includeCover ? extras.coverPath : null
  const args = ['-i', inputPath]
  if (coverPath) args.push('-i', coverPath)
  args.push('-map', '0:a:0')
  if (includeCover) {
    args.push('-map', coverPath ? '1:v:0' : '0:v:0?', '-c:v', 'copy', '-disposition:v:0', 'attached_pic')
  } else {
    args.push('-vn')
  }
  if (options.preserveMetadata) args.push('-map_metadata', '0')
  else args.push('-map_metadata', '-1')
  if (extras.metadata) {
    for (const [field, ffmpegKey] of metadataKeys) {
      const value = extras.metadata[field].trim()
      if (value) args.push('-metadata', `${ffmpegKey}=${value}`)
    }
  }
  args.push(...codecArgs(options, outputFormat))
  if (options.mode === 'transcode') {
    args.push(...commonAudioArgs(options.sampleRate, options.channels))
  }
  args.push(outputPath)
  return args
}

export function describeAudioError(error: unknown) {
  if (error instanceof AudioConversionError) return error.message
  const message = error instanceof Error ? error.message : String(error)
  if (/memory|abort|out of bounds|allocation/i.test(message)) {
    return '浏览器可用内存不足，请减少文件大小或关闭其他页面后重试。'
  }
  if (/worker|webassembly|wasm/i.test(message)) {
    return '本地转换引擎加载失败，请确认浏览器支持 WebAssembly 后刷新重试。'
  }
  return '音频转换失败，文件可能损坏或编码暂不受支持。'
}

export function formatAudioDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--'
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}
