import type { PDFDocumentProxy, TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'

export interface PdfTextRun { start: number; end: number; value: string }
export interface PdfPageText { text: string; runs: PdfTextRun[] }
export interface PdfTextMatch { page: number; start: number; end: number; preview: string }
export const MAX_SEARCH_MATCHES = 1000
export const MAX_EXTRACTED_CHARACTERS = 20_000_000

export function extractPageText(content: Pick<TextContent, 'items'>): PdfPageText {
  let text = ''
  const runs: PdfTextRun[] = []
  const items = content.items.filter((item): item is TextItem => 'str' in item)
  items.forEach((item, index) => {
    runs.push({ start: text.length, end: text.length + item.str.length, value: item.str })
    text += item.str
    const next = items[index + 1]
    if (item.hasEOL) text += '\n'
    else if (next && !/\s$/.test(item.str) && !/^\s/.test(next.str)
      && item.dir !== 'rtl' && item.transform && next.transform
      && Math.abs(item.transform[5] - next.transform[5]) < 2
      && next.transform[4] - item.transform[4] - item.width > Math.abs(item.transform[0]) * 0.2) text += ' '
  })
  return { text, runs }
}

export function findPdfMatches(text: string, query: string, caseSensitive = false, limit = MAX_SEARCH_MATCHES): { start: number; end: number }[] {
  const trimmed = query.trim()
  if (!trimmed || limit <= 0) return []
  const pattern = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const expression = new RegExp(pattern, caseSensitive ? 'gu' : 'giu')
  const matches: { start: number; end: number }[] = []
  let match: RegExpExecArray | null
  while (matches.length < limit && (match = expression.exec(text))) matches.push({ start: match.index, end: match.index + match[0].length })
  return matches
}

export function createPdfTextReader(document: PDFDocumentProxy) {
  const cache = new Map<number, PdfPageText>()
  let cachedCharacters = 0
  return async (pageNumber: number, signal?: AbortSignal) => {
    signal?.throwIfAborted()
    const cached = cache.get(pageNumber)
    if (cached) return cached
    const page = await document.getPage(pageNumber)
    signal?.throwIfAborted()
    const result = extractPageText(await page.getTextContent())
    signal?.throwIfAborted()
    // Bound the cache independently from the full-document extraction limit.
    while (cache.size && (cachedCharacters + result.text.length > 2_000_000 || cache.size >= 100)) {
      const oldest = cache.keys().next().value!
      cachedCharacters -= cache.get(oldest)!.text.length
      cache.delete(oldest)
    }
    if (result.text.length <= 2_000_000) {
      cachedCharacters -= cache.get(pageNumber)?.text.length ?? 0
      cache.set(pageNumber, result)
      cachedCharacters += result.text.length
    }
    return result
  }
}

export type PdfTextReader = ReturnType<typeof createPdfTextReader>

export async function searchPdfText(read: PdfTextReader, pageCount: number, query: string, caseSensitive: boolean, signal: AbortSignal, onProgress: (page: number) => void) {
  const matches: PdfTextMatch[] = []
  let textPages = 0
  let failedPages = 0
  for (let page = 1; page <= pageCount; page += 1) {
    signal.throwIfAborted()
    try {
      const { text } = await read(page, signal)
      if (text.trim()) textPages += 1
      const found = findPdfMatches(text, query, caseSensitive, MAX_SEARCH_MATCHES + 1 - matches.length)
      for (const match of found) matches.push({ ...match, page, preview: text.slice(Math.max(0, match.start - 28), match.end + 40).replace(/\s+/g, ' ') })
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof RangeError) throw error
      failedPages += 1
    }
    onProgress(page)
    if (matches.length > MAX_SEARCH_MATCHES) return { matches: matches.slice(0, MAX_SEARCH_MATCHES), limited: true, textPages, failedPages }
    if (page % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { matches, limited: false, textPages, failedPages }
}

export async function extractPdfText(read: PdfTextReader, pageCount: number, signal: AbortSignal, onProgress: (page: number) => void): Promise<string> {
  const pages: string[] = []
  let length = 0
  let hasText = false
  for (let page = 1; page <= pageCount; page += 1) {
    signal.throwIfAborted()
    const { text } = await read(page, signal)
    hasText ||= !!text.trim()
    length += text.length
    if (length > MAX_EXTRACTED_CHARACTERS) throw new Error('可提取文字超过 2,000 万字符，请分文档处理。')
    pages.push(`--- 第 ${page} 页 ---\n${text}`)
    onProgress(page)
    if (page % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  if (!hasText) throw new Error('未发现可提取文字，此 PDF 可能是扫描件；当前不包含 OCR。')
  return pages.join('\n\n')
}
