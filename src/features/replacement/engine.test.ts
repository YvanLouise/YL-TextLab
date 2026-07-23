import { describe, expect, it } from 'vitest'
import { countVisibleCharacters, escapeRegExp, executeReplacement } from './engine'
import type { ReplacementOptions } from './types'

const defaults: ReplacementOptions = {
  caseSensitive: false,
  wholeWord: false,
  firstOnly: false,
}

function replace(
  source: string,
  search: string,
  replacement: string,
  options: Partial<ReplacementOptions> = {},
) {
  return executeReplacement({
    source,
    search,
    replacement,
    options: { ...defaults, ...options },
  })
}

describe('executeReplacement', () => {
  it('escapes regex syntax and treats the replacement as literal text', () => {
    expect(escapeRegExp('a+b?')).toBe('a\\+b\\?')
    const result = replace('a+b? and a+b?', 'a+b?', '$&')
    expect(result.output).toBe('$& and $&')
    expect(result.matchCount).toBe(2)
  })

  it('replaces without case sensitivity by default', () => {
    expect(replace('Hello hello HELLO', 'hello', '你好').output).toBe('你好 你好 你好')
  })

  it('supports case-sensitive matching', () => {
    const result = replace('Hello hello HELLO', 'hello', 'Hi', { caseSensitive: true })
    expect(result.output).toBe('Hello Hi HELLO')
    expect(result.matchCount).toBe(1)
  })

  it('uses ASCII word boundaries for English whole-word matching', () => {
    const result = replace('cat scatter cat_ cat.', 'cat', 'dog', { wholeWord: true })
    expect(result.output).toBe('dog scatter cat_ dog.')
    expect(result.matchCount).toBe(2)
  })

  it('matches Chinese and mixed keywords as continuous literal strings', () => {
    expect(replace('易联科技致力于科技创新', '易联科技', '悦联智能', { wholeWord: true }).output).toBe(
      '悦联智能致力于科技创新',
    )
    expect(replace('产品A1版本和产品A1Plus', '产品A1', '产品B2', { wholeWord: true }).matchCount).toBe(
      2,
    )
  })

  it('replaces only the first non-overlapping occurrence when requested', () => {
    const result = replace('aaaa', 'aa', 'b', { firstOnly: true })
    expect(result.output).toBe('baa')
    expect(result.matchCount).toBe(1)
  })

  it('allows an empty replacement and leaves unmatched text unchanged', () => {
    expect(replace('删除这一段', '这一', '').output).toBe('删除段')
    const unmatched = replace('原始文本', '不存在', '新内容')
    expect(unmatched.output).toBe('原始文本')
    expect(unmatched.matchCount).toBe(0)
  })

  it('returns source and result highlight ranges', () => {
    const result = replace('foo foo', 'foo', 'bar')
    expect(result.matchRanges).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ])
    expect(result.replacementRanges).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ])
  })
})

describe('countVisibleCharacters', () => {
  it('counts Unicode grapheme clusters instead of UTF-16 code units', () => {
    expect(countVisibleCharacters('A😀中')).toBe(3)
    expect(countVisibleCharacters('👨‍👩‍👧‍👦')).toBe(1)
  })
})
