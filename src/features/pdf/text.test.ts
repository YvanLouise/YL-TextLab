import { describe, expect, it, vi } from 'vitest'
import { createPdfTextReader, extractPageText, extractPdfText, findPdfMatches, MAX_SEARCH_MATCHES, searchPdfText } from './text'
import { flattenPdfOutline, getPdfPermissions, resolvePdfDestination } from './document'

describe('PDF text extraction and search', () => {
  it('preserves run offsets and line breaks across multilingual content', () => {
    const result = extractPageText({ items: [{ str: '本地', hasEOL: false }, { str: '阅读 😀', hasEOL: true }, { str: 'PDF', hasEOL: false }] } as never)
    expect(result.text).toBe('本地阅读 😀\nPDF')
    expect(result.runs.map((run) => result.text.slice(run.start, run.end))).toEqual(['本地', '阅读 😀', 'PDF'])
    expect(findPdfMatches(result.text, '本地阅读')).toEqual([{ start: 0, end: 4 }])
  })

  it('treats search as literal, supports Unicode, whitespace and case', () => {
    expect(findPdfMatches('Price $5.00 [PDF] (test) .*', '$5.00 [PDF]')).toEqual([{ start: 6, end: 17 }])
    expect(findPdfMatches('first\nsecond', 'first second')).toHaveLength(1)
    expect(findPdfMatches('Local local LOCAL', 'local')).toHaveLength(3)
    expect(findPdfMatches('Local local LOCAL', 'local', true)).toHaveLength(1)
    expect(findPdfMatches('😀中文😀', '😀')).toEqual([{ start: 0, end: 2 }, { start: 4, end: 6 }])
    expect(findPdfMatches('abc', '  ')).toEqual([])
    expect(findPdfMatches('aaa', 'aa')).toHaveLength(1)
  })

  it('searches all pages in order, reports page failures and caps results', async () => {
    const read = vi.fn(async (page: number) => {
      if (page === 2) throw new Error('Bad page')
      return { text: `local ${page}`, runs: [] }
    })
    const result = await searchPdfText(read, 3, 'local', false, new AbortController().signal, vi.fn())
    expect(result.matches.map((match) => match.page)).toEqual([1, 3])
    expect(result.failedPages).toBe(1)
    const capped = await searchPdfText(async () => ({ text: 'x '.repeat(MAX_SEARCH_MATCHES + 20), runs: [] }), 1, 'x', false, new AbortController().signal, vi.fn())
    expect(capped.limited).toBe(true)
    expect(capped.matches).toHaveLength(MAX_SEARCH_MATCHES)
  })

  it('stops cancelled work and rejects empty extraction or partial exports', async () => {
    const abort = new AbortController()
    abort.abort()
    const read = vi.fn(async () => ({ text: 'text', runs: [] }))
    await expect(searchPdfText(read, 5, 'text', false, abort.signal, vi.fn())).rejects.toThrow()
    expect(read).not.toHaveBeenCalled()
    await expect(extractPdfText(async () => ({ text: '', runs: [] }), 2, new AbortController().signal, vi.fn())).rejects.toThrow('OCR')
    await expect(extractPdfText(async (page) => { if (page === 2) throw new Error('Invalid page'); return { text: 'text', runs: [] } }, 2, new AbortController().signal, vi.fn())).rejects.toThrow('Invalid page')
  })

  it('exports page-delimited text and caches reads with bounded page count', async () => {
    const content = vi.fn().mockResolvedValue({ items: [{ str: 'PDF text', hasEOL: true }] })
    const getPage = vi.fn().mockResolvedValue({ getTextContent: content })
    const read = createPdfTextReader({ getPage } as never)
    const output = await extractPdfText(read, 2, new AbortController().signal, vi.fn())
    expect(output).toBe('--- 第 1 页 ---\nPDF text\n\n\n--- 第 2 页 ---\nPDF text\n')
    await read(1)
    expect(getPage).toHaveBeenCalledTimes(2)
    for (let page = 3; page <= 102; page += 1) await read(page)
    await read(1)
    expect(getPage).toHaveBeenCalledTimes(103)
  })
})

describe('PDF navigation and permissions', () => {
  it('flattens nested outlines and rejects unsafe links', () => {
    expect(flattenPdfOutline([{ title: 'Start', dest: [0], items: [{ title: 'Child', url: 'javascript:alert(1)' }] }])).toEqual([
      { title: 'Start', destination: [0], url: null, depth: 0 },
      { title: 'Child', destination: undefined, url: null, depth: 1 },
    ])
  })
  it('resolves named and indirect page destinations without guessing', async () => {
    const pdf = { numPages: 4, getDestination: vi.fn().mockResolvedValue([{ num: 7, gen: 0 }]), getPageIndex: vi.fn().mockResolvedValue(2) }
    expect(await resolvePdfDestination(pdf as never, 'chapter')).toBe(3)
    expect(await resolvePdfDestination(pdf as never, [1])).toBe(2)
    expect(await resolvePdfDestination(pdf as never, [999])).toBeNull()
    expect(await resolvePdfDestination(pdf as never, {})).toBeNull()
  })
  it('honors copy and printing flags', () => {
    expect(getPdfPermissions(null)).toEqual({ canCopy: true, canPrint: true })
    expect(getPdfPermissions([])).toEqual({ canCopy: false, canPrint: false })
    expect(getPdfPermissions([16])).toEqual({ canCopy: true, canPrint: false })
    expect(getPdfPermissions([2048])).toEqual({ canCopy: false, canPrint: false })
    expect(getPdfPermissions([4, 2048])).toEqual({ canCopy: false, canPrint: true })
    expect(getPdfPermissions(new Set([4, 16]))).toEqual({ canCopy: true, canPrint: true })
  })
})
