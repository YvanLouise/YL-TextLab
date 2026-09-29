import { AudioConversionError, type AudioMetadata, type WavMetadataEncoding } from './types'

const utf8 = new TextEncoder()
const fields: Record<keyof AudioMetadata, string> = {
  title: 'INAM', artist: 'IART', album: 'IPRD', year: 'ICRD',
  track: 'IPRT', genre: 'IGNR', comment: 'ICMT',
}

interface Chunk { id: string; start: number; end: number; data: Uint8Array }

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function invalidWave(): never {
  throw new AudioConversionError('INVALID_WAV', 'WAV 文件结构不完整或不受支持，无法安全写入歌曲信息。')
}

function chunks(bytes: Uint8Array, start: number, end: number): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const result: Chunk[] = []
  while (start < end) {
    if (start + 8 > end) invalidWave()
    const size = view.getUint32(start + 4, true)
    const next = start + 8 + size + size % 2
    if (next > end) invalidWave()
    result.push({ id: ascii(bytes, start, 4), start, end: next, data: bytes.subarray(start + 8, start + 8 + size) })
    start = next
  }
  return result
}

function waveChunks(bytes: Uint8Array) {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') invalidWave()
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8
  if (size !== bytes.length) invalidWave()
  const result = chunks(bytes, 12, size)
  if (!result.some(chunk => chunk.id === 'fmt ') || !result.some(chunk => chunk.id === 'data')) invalidWave()
  return result
}

function isInfo(chunk: Chunk) {
  return chunk.id === 'LIST' && ascii(chunk.data, 0, 4) === 'INFO'
}

function decodeText(bytes: Uint8Array, encoding: WavMetadataEncoding | undefined) {
  const zero = bytes.indexOf(0)
  const text = zero < 0 ? bytes : bytes.subarray(0, zero)
  if (encoding) return new TextDecoder(encoding, { fatal: true }).decode(text)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(text)
  } catch {
    return new TextDecoder('gbk', { fatal: true }).decode(text)
  }
}

function infoTags(parts: Chunk[]) {
  const cset = parts.find(chunk => chunk.id === 'CSET')?.data
  const codePage = cset && cset.length >= 2 ? cset[0] + (cset[1] << 8) : null
  const encoding = codePage === 936 ? 'gbk' : codePage === 65001 ? 'utf-8' : undefined
  const tags = new Map<string, string>()
  for (const part of parts.filter(isInfo)) {
    for (const tag of chunks(part.data, 4, part.data.length)) {
      tags.set(tag.id, decodeText(tag.data, encoding))
    }
  }
  return tags
}

let gbkCodes: Map<string, number> | undefined

function encodeGbk(text: string) {
  // Browsers only expose a GBK decoder; build its inverse once, on demand.
  if (!gbkCodes) {
    gbkCodes = new Map()
    for (let code = 0; code < 128; code += 1) gbkCodes.set(String.fromCharCode(code), code)
    const decoder = new TextDecoder('gbk')
    gbkCodes.set(decoder.decode(new Uint8Array([0x80])), 0x80)
    const pair = new Uint8Array(2)
    for (let lead = 0x81; lead <= 0xfe; lead += 1) {
      pair[0] = lead
      for (let trail = 0x40; trail <= 0xfe; trail += 1) {
        if (trail === 0x7f) continue
        pair[1] = trail
        const char = decoder.decode(pair)
        if (char.length === 1 && char !== '\ufffd' && !gbkCodes.has(char)) gbkCodes.set(char, lead * 256 + trail)
      }
    }
  }
  const result: number[] = []
  for (const char of text) {
    const code = gbkCodes.get(char)
    if (code === undefined) {
      throw new AudioConversionError('WAV_ENCODING_UNSUPPORTED', `WAV 的 GBK 标签无法表示字符“${char}”，请切换为 UTF-8 标签编码或选择其他输出格式。`)
    }
    if (code > 255) result.push(code >> 8)
    result.push(code & 255)
  }
  return new Uint8Array(result)
}

function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function makeChunk(id: string, data: Uint8Array) {
  const result = new Uint8Array(8 + data.length + data.length % 2)
  result.set(utf8.encode(id))
  new DataView(result.buffer).setUint32(4, data.length, true)
  result.set(data, 8)
  return result
}

export function readWavMetadata(bytes: Uint8Array): AudioMetadata {
  const tags = infoTags(waveChunks(bytes))
  return Object.fromEntries(Object.entries(fields).map(([field, tag]) => [field,
    tags.get(tag) ?? (field === 'track' ? tags.get('ITRK') : '') ?? '',
  ])) as unknown as AudioMetadata
}

export function rewriteWavMetadata(bytes: Uint8Array, metadata: Partial<AudioMetadata>, encoding: WavMetadataEncoding, forFfmpeg = false) {
  const parts = waveChunks(bytes)
  const tags = infoTags(parts)
  for (const [field, tag] of Object.entries(fields)) {
    const value = metadata[field as keyof AudioMetadata]?.trim()
    if (value?.includes('\0')) throw new AudioConversionError('INVALID_METADATA', '歌曲信息不能包含空字符。')
    if (value) tags.set(tag, value)
  }
  // FFmpeg uses IPRT; Windows reads ITRK and expects only the track number.
  const track = tags.get('IPRT') ?? tags.get('ITRK')
  if (track) {
    tags.set('IPRT', track)
    if (forFfmpeg) tags.delete('ITRK')
    else tags.set('ITRK', track.split('/')[0])
  }
  const info = makeChunk('LIST', join([utf8.encode('INFO'), ...Array.from(tags, ([id, text]) =>
    makeChunk(id, join([encoding === 'gbk' ? encodeGbk(text) : utf8.encode(text), new Uint8Array(1)])),
  )]))
  const cset = new Uint8Array(8)
  new DataView(cset.buffer).setUint16(0, encoding === 'gbk' ? 936 : 65001, true)
  // Windows' property handler can skip INFO between fmt and data. Put it after data.
  const result = join([bytes.subarray(0, 12),
    ...parts.filter(part => !isInfo(part) && part.id !== 'CSET').map(part => bytes.subarray(part.start, part.end)),
    makeChunk('CSET', cset), info,
  ])
  new DataView(result.buffer).setUint32(4, result.length - 8, true)
  return result
}
