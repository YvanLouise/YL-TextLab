import { describe, expect, it } from 'vitest'
import { splitForNotion, utf8ByteLength } from './engine'
import { DEFAULT_NOTION_SPLIT_OPTIONS } from './types'

describe('Notion text splitting', () => {
  it('counts UTF-8 bytes instead of UTF-16 code units', () => {
    expect(utf8ByteLength('A中😀')).toBe(8)
    expect(DEFAULT_NOTION_SPLIT_OPTIONS).toEqual({
      maxBytes: 400_000,
      preferSemanticBoundaries: true,
    })
  })

  it('returns no chunks for an empty source', () => {
    expect(splitForNotion('')).toEqual({
      chunks: [],
      totalByteLength: 0,
      totalCharacterCount: 0,
      maxChunkByteLength: 0,
    })
  })

  it('keeps text below the limit in one final chunk', () => {
    const result = splitForNotion('你好，Notion 😀')

    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0]).toMatchObject({
      index: 0,
      text: '你好，Notion 😀',
      start: 0,
      end: 12,
      byteLength: utf8ByteLength('你好，Notion 😀'),
      characterCount: 11,
      boundary: 'end',
    })
  })

  it('uses paragraph, line, sentence, then space boundaries in priority order', () => {
    const paragraphSource = '短段\n\n第一句结束。第二句还在继续'
    const paragraph = splitForNotion(paragraphSource, {
      maxBytes: utf8ByteLength('短段\n\n第一句结束。第二句'),
      preferSemanticBoundaries: true,
    })
    expect(paragraph.chunks[0]).toMatchObject({
      text: '短段\n\n',
      boundary: 'paragraph',
    })

    const line = splitForNotion('第一句。\n第二句还在继续', {
      maxBytes: utf8ByteLength('第一句。\n第二句'),
      preferSemanticBoundaries: true,
    })
    expect(line.chunks[0]).toMatchObject({
      text: '第一句。\n',
      boundary: 'line',
    })

    const sentence = splitForNotion('第一句结束。第二句 still going', {
      maxBytes: utf8ByteLength('第一句结束。第二句 still'),
      preferSemanticBoundaries: true,
    })
    expect(sentence.chunks[0]).toMatchObject({
      text: '第一句结束。',
      boundary: 'sentence',
    })

    const space = splitForNotion('alpha beta-gamma-delta', {
      maxBytes: utf8ByteLength('alpha beta-gamma'),
      preferSemanticBoundaries: true,
    })
    expect(space.chunks[0]).toMatchObject({ text: 'alpha ', boundary: 'space' })
  })

  it('can split strictly at the largest grapheme boundary', () => {
    const source = '甲乙ab😀Z'
    const result = splitForNotion(source, {
      maxBytes: 4,
      preferSemanticBoundaries: false,
    })

    expect(result.chunks.map((chunk) => chunk.text)).toEqual([
      '甲',
      '乙a',
      'b',
      '😀',
      'Z',
    ])
    expect(result.chunks.slice(0, -1).every((chunk) => chunk.boundary === 'grapheme')).toBe(
      true,
    )
    expect(result.chunks.at(-1)?.boundary).toBe('end')
  })

  it('does not split a Unicode grapheme cluster', () => {
    const family = '👨‍👩‍👧‍👦'
    const source = `a${family}b`
    const result = splitForNotion(source, {
      maxBytes: utf8ByteLength(family),
      preferSemanticBoundaries: false,
    })

    expect(result.chunks.map((chunk) => chunk.text)).toEqual(['a', family, 'b'])
    expect(result.chunks.map((chunk) => chunk.characterCount)).toEqual([1, 1, 1])
    expect(result.chunks[1]).toMatchObject({ start: 1, end: 12 })
  })

  it('preserves every source code unit exactly and respects the byte limit', () => {
    const source = `${'段落一内容。'.repeat(15)}\r\n\r\n${'Second paragraph '.repeat(20)}😀尾声`
    const maxBytes = 72
    const result = splitForNotion(source, {
      maxBytes,
      preferSemanticBoundaries: true,
    })

    expect(result.chunks.map((chunk) => chunk.text).join('')).toBe(source)
    expect(result.chunks.every((chunk) => chunk.byteLength <= maxBytes)).toBe(true)
    expect(result.chunks[0].start).toBe(0)
    expect(result.chunks.at(-1)?.end).toBe(source.length)
    expect(result.totalByteLength).toBe(utf8ByteLength(source))
    expect(result.maxChunkByteLength).toBe(
      Math.max(...result.chunks.map((chunk) => chunk.byteLength)),
    )
    expect(
      result.chunks.reduce((total, chunk) => total + chunk.characterCount, 0),
    ).toBe(result.totalCharacterCount)
  })

  it('rejects impossible or invalid byte limits', () => {
    expect(() =>
      splitForNotion('text', { maxBytes: 0, preferSemanticBoundaries: true }),
    ).toThrow(RangeError)
    expect(() =>
      splitForNotion('😀', { maxBytes: 3, preferSemanticBoundaries: false }),
    ).toThrow('single Unicode grapheme')
  })
})
