import { AudioConversionError, type AudioMetadata } from './types'

const names: Record<keyof AudioMetadata, string> = {
  title: '歌曲标题', artist: '艺术家', album: '专辑', year: '年份',
  track: '音轨', genre: '流派', comment: '备注',
}

export function hasMetadataEdits(metadata: AudioMetadata) {
  return Object.values(metadata).some(value => value.trim())
}

export function verifyMetadata(expected: AudioMetadata, actual: Partial<AudioMetadata>) {
  const missing = (Object.keys(names) as Array<keyof AudioMetadata>).filter(field => {
    const value = expected[field].trim()
    return value && actual[field] !== value
  })
  if (missing.length) {
    throw new AudioConversionError('METADATA_VERIFY_FAILED', `歌曲信息写入校验失败：${missing.map(field => names[field]).join('、')}。未生成下载结果，请换用支持这些标签的输出格式。`)
  }
}

export function readFfmetadata(text: string): Partial<AudioMetadata> {
  if (!text.startsWith(';FFMETADATA1\n')) {
    throw new AudioConversionError('METADATA_VERIFY_FAILED', '歌曲标签校验数据不完整，请重试。')
  }
  const tags: Record<string, string> = {}
  let key = ''
  let value = ''
  let inValue = false
  let lineStart = true
  let comment = false
  for (let index = text.indexOf('\n') + 1; index <= text.length; index += 1) {
    let char = text[index] ?? '\n'
    if (lineStart && char === '[') break
    if (lineStart && (char === ';' || char === '#')) comment = true
    lineStart = false
    if (char === '\n') {
      if (!comment && inValue) tags[key.toLowerCase()] = value
      key = ''; value = ''; inValue = false; comment = false; lineStart = true
      continue
    }
    if (comment) continue
    if (char === '\\') {
      char = text[++index] ?? ''
    } else if (char === '=' && !inValue) {
      inValue = true
      continue
    }
    if (inValue) value += char
    else key += char
  }
  return { title: tags.title, artist: tags.artist, album: tags.album, year: tags.date ?? tags.year,
    track: tags.track ?? tags.tracknumber, genre: tags.genre, comment: tags.comment ?? tags.description }
}
