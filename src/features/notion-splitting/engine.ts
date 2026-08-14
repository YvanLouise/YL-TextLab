import {
  DEFAULT_NOTION_SPLIT_OPTIONS,
  type NotionSplitBoundary,
  type NotionSplitOptions,
  type NotionSplitResult,
} from './types'

interface GraphemeSpan {
  start: number
  end: number
  cumulativeBytes: number
}

const textEncoder = new TextEncoder()
const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
    : null

const SEMANTIC_BOUNDARIES: ReadonlyArray<{
  type: Exclude<NotionSplitBoundary, 'grapheme' | 'end'>
  pattern: RegExp
}> = [
  {
    type: 'paragraph',
    pattern: /(?:\r\n|\r|\n)[\t ]*(?:(?:\r\n|\r|\n)[\t ]*)+/g,
  },
  { type: 'line', pattern: /\r\n|\r|\n/g },
  {
    type: 'sentence',
    pattern: /(?:[。！？!?；;…]+|\.{1,3})["'”’」』）》】）\]]*/gu,
  },
  { type: 'space', pattern: /[^\S\r\n]+/gu },
]

export function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).byteLength
}

function collectGraphemeSpans(source: string): GraphemeSpan[] {
  const spans: GraphemeSpan[] = []
  let cumulativeBytes = 0

  if (graphemeSegmenter) {
    for (const item of graphemeSegmenter.segment(source)) {
      const start = item.index
      const end = start + item.segment.length
      cumulativeBytes += utf8ByteLength(item.segment)
      spans.push({ start, end, cumulativeBytes })
    }
    return spans
  }

  let start = 0
  for (const grapheme of Array.from(source)) {
    const end = start + grapheme.length
    cumulativeBytes += utf8ByteLength(grapheme)
    spans.push({ start, end, cumulativeBytes })
    start = end
  }
  return spans
}

function findMaximumEndIndex(
  spans: GraphemeSpan[],
  startIndex: number,
  maxBytes: number,
): number {
  const bytesBeforeStart = startIndex === 0 ? 0 : spans[startIndex - 1].cumulativeBytes
  let low = startIndex
  let high = spans.length - 1
  let best = startIndex - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const byteLength = spans[middle].cumulativeBytes - bytesBeforeStart
    if (byteLength <= maxBytes) {
      best = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return best
}

function findLastBoundary(
  source: string,
  start: number,
  maximumEnd: number,
  validEnds: ReadonlySet<number>,
): { end: number; type: NotionSplitBoundary } | null {
  const candidate = source.slice(start, maximumEnd)

  for (const boundary of SEMANTIC_BOUNDARIES) {
    boundary.pattern.lastIndex = 0
    let lastEnd = -1
    let match: RegExpExecArray | null
    while ((match = boundary.pattern.exec(candidate)) !== null) {
      const absoluteEnd = start + match.index + match[0].length
      if (validEnds.has(absoluteEnd)) {
        lastEnd = absoluteEnd
      }
    }
    if (lastEnd > start) {
      return { end: lastEnd, type: boundary.type }
    }
  }

  return null
}

function normalizeOptions(options: NotionSplitOptions): NotionSplitOptions {
  if (!Number.isFinite(options.maxBytes) || options.maxBytes < 1) {
    throw new RangeError('maxBytes must be a positive finite number')
  }
  return {
    maxBytes: Math.floor(options.maxBytes),
    preferSemanticBoundaries: options.preferSemanticBoundaries,
  }
}

export function splitForNotion(
  source: string,
  options: NotionSplitOptions = DEFAULT_NOTION_SPLIT_OPTIONS,
): NotionSplitResult {
  const normalizedOptions = normalizeOptions(options)
  const spans = collectGraphemeSpans(source)
  const totalByteLength = spans.at(-1)?.cumulativeBytes ?? 0
  const totalCharacterCount = spans.length

  if (spans.length === 0) {
    return {
      chunks: [],
      totalByteLength,
      totalCharacterCount,
      maxChunkByteLength: 0,
    }
  }

  const spanIndexByEnd = new Map<number, number>()
  for (let index = 0; index < spans.length; index += 1) {
    spanIndexByEnd.set(spans[index].end, index + 1)
  }
  const validEnds = new Set(spanIndexByEnd.keys())

  const chunks: NotionSplitResult['chunks'] = []
  let startIndex = 0

  while (startIndex < spans.length) {
    const maximumEndIndex = findMaximumEndIndex(
      spans,
      startIndex,
      normalizedOptions.maxBytes,
    )
    if (maximumEndIndex < startIndex) {
      throw new RangeError(
        'maxBytes is smaller than a single Unicode grapheme in the source text',
      )
    }

    const start = spans[startIndex].start
    const maximumEnd = spans[maximumEndIndex].end
    let end = maximumEnd
    let boundary: NotionSplitBoundary =
      maximumEnd === source.length ? 'end' : 'grapheme'

    if (
      normalizedOptions.preferSemanticBoundaries &&
      maximumEnd < source.length
    ) {
      const semanticBoundary = findLastBoundary(
        source,
        start,
        maximumEnd,
        validEnds,
      )
      if (semanticBoundary) {
        end = semanticBoundary.end
        boundary = semanticBoundary.type
      }
    }

    const endIndex = spanIndexByEnd.get(end)
    if (endIndex === undefined) {
      throw new Error('Unable to align split boundary with source text')
    }
    const bytesBeforeStart =
      startIndex === 0 ? 0 : spans[startIndex - 1].cumulativeBytes
    const byteLength = spans[endIndex - 1].cumulativeBytes - bytesBeforeStart

    chunks.push({
      index: chunks.length,
      text: source.slice(start, end),
      start,
      end,
      byteLength,
      characterCount: endIndex - startIndex,
      boundary,
    })
    startIndex = endIndex
  }

  return {
    chunks,
    totalByteLength,
    totalCharacterCount,
    maxChunkByteLength: chunks.reduce(
      (largest, chunk) => Math.max(largest, chunk.byteLength),
      0,
    ),
  }
}
