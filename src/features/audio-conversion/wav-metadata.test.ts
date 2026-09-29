import { describe, expect, it } from 'vitest'
import { EMPTY_AUDIO_METADATA } from './types'
import { readWavMetadata, rewriteWavMetadata } from './wav-metadata'
import { readFfmetadata, verifyMetadata } from './metadata'

function tinyWave() {
  const bytes = new Uint8Array(50)
  const view = new DataView(bytes.buffer)
  const text = (at: number, value: string) => bytes.set(new TextEncoder().encode(value), at)
  text(0, 'RIFF'); view.setUint32(4, 42, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true)
  view.setUint16(20, 1, true); view.setUint16(22, 2, true)
  view.setUint32(24, 48000, true); view.setUint32(28, 288000, true)
  view.setUint16(32, 6, true); view.setUint16(34, 24, true)
  text(36, 'data'); view.setUint32(40, 6, true)
  bytes.set([0, 1, 2, 3, 4, 5], 44)
  return bytes
}

const metadata = { title: '天上晴云', artist: 'YvanLouise', album: '测试专辑', year: '2026', track: '3/12', genre: '流行', comment: '中文备注' }

describe('WAV metadata compatibility', () => {
  it('writes GBK INFO after audio with Windows track alias and exact PCM preservation', () => {
    const source = tinyWave()
    const output = rewriteWavMetadata(source, metadata, 'gbk')
    expect(readWavMetadata(output)).toEqual(metadata)
    expect(output.subarray(12, source.length)).toEqual(source.subarray(12))
    const text = new TextDecoder('gbk').decode(output)
    expect(text.indexOf('LIST')).toBeGreaterThan(text.indexOf('data'))
    expect(text).toContain('ITRK')
    expect(text).toContain('天上晴云')
    expect(new DataView(output.buffer).getUint32(4, true)).toBe(output.length - 8)
  })

  it('preserves unedited fields across GBK to UTF-8 normalization and repeated edits', () => {
    const first = rewriteWavMetadata(tinyWave(), metadata, 'gbk')
    const normalized = rewriteWavMetadata(first, {}, 'utf-8')
    const second = rewriteWavMetadata(normalized, { title: '新标题', artist: '' }, 'gbk')
    expect(readWavMetadata(second)).toEqual({ ...metadata, title: '新标题' })
    expect(new TextDecoder().decode(second).match(/LIST/g)).toHaveLength(1)
  })

  it('supports Unicode in UTF-8 but never silently replaces unencodable GBK characters', () => {
    expect(() => rewriteWavMetadata(tinyWave(), { title: '音乐🎵' }, 'gbk')).toThrow('UTF-8')
    expect(readWavMetadata(rewriteWavMetadata(tinyWave(), { title: '音乐🎵' }, 'utf-8')).title).toBe('音乐🎵')
  })

  it('rejects null characters, truncated chunks and invalid RIFF sizes', () => {
    expect(() => rewriteWavMetadata(tinyWave(), { title: 'a\0b' }, 'gbk')).toThrow('空字符')
    expect(() => readWavMetadata(tinyWave().subarray(0, 49))).toThrow('WAV')
    const broken = tinyWave()
    new DataView(broken.buffer).setUint32(40, 1000, true)
    expect(() => readWavMetadata(broken)).toThrow('WAV')
  })

  it('works with offset byte views and odd-length padded text', () => {
    const buffer = new Uint8Array(70)
    buffer.set(tinyWave(), 10)
    const output = rewriteWavMetadata(buffer.subarray(10, 60), { title: 'AB', artist: 'XYZ' }, 'gbk')
    expect(readWavMetadata(output)).toMatchObject({ title: 'AB', artist: 'XYZ' })
  })
})

describe('metadata verification', () => {
  it('rejects missing or altered requested tags, while ignoring unedited fields', () => {
    expect(() => verifyMetadata(metadata, { ...metadata, title: '' })).toThrow('歌曲标题')
    expect(() => verifyMetadata({ ...EMPTY_AUDIO_METADATA, artist: ' YvanLouise ' }, { artist: 'YvanLouise' })).not.toThrow()
  })

  it('reads both container tags and stream tags (Ogg/Opus)', () => {
    expect(readFfmetadata(';FFMETADATA1\nTITLE=歌曲\nARTIST=作者\nTRACKNUMBER=3\ndate=2026\n'))
      .toMatchObject({ title: '歌曲', artist: '作者', year: '2026', track: '3' })
  })

  it('handles escaped delimiters, backslashes, newlines and chapter boundaries', () => {
    expect(readFfmetadata(';FFMETADATA1\ntitle=A\\=B\\;C\\#D\\\\E\ncomment=第一行\\\n第二行\n[CHAPTER]\ntitle=Chapter\n'))
      .toMatchObject({ title: 'A=B;C#D\\E', comment: '第一行\n第二行' })
    expect(() => readFfmetadata('{}')).toThrow('校验数据不完整')
  })
})
