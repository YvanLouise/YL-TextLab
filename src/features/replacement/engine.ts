import type {
  ReplacementExecution,
  ReplacementRequest,
  TextRange,
} from './types'

const ASCII_WORD = /^[A-Za-z0-9_]+$/
const GRAPHEME_SEGMENTER =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
    : null

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createSearchPattern(request: ReplacementRequest): RegExp {
  const escaped = escapeRegExp(request.search)
  const boundaryWrapped =
    request.options.wholeWord && ASCII_WORD.test(request.search)
      ? `(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`
      : escaped
  const flags = `${request.options.firstOnly ? '' : 'g'}${
    request.options.caseSensitive ? '' : 'i'
  }u`

  return new RegExp(boundaryWrapped, flags)
}

function findRanges(source: string, pattern: RegExp): TextRange[] {
  if (!pattern.global) {
    const match = pattern.exec(source)
    return match ? [{ start: match.index, end: match.index + match[0].length }] : []
  }

  const ranges: TextRange[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  return ranges
}

export function executeReplacement(request: ReplacementRequest): ReplacementExecution {
  const startedAt = performance.now()
  if (!request.search) {
    return {
      output: request.source,
      matchRanges: [],
      replacementRanges: [],
      matchCount: 0,
      durationMs: performance.now() - startedAt,
    }
  }

  const matchRanges = findRanges(request.source, createSearchPattern(request))
  const outputParts: string[] = []
  const replacementRanges: TextRange[] = []
  let sourceCursor = 0
  let outputLength = 0

  for (const range of matchRanges) {
    const untouched = request.source.slice(sourceCursor, range.start)
    outputParts.push(untouched, request.replacement)
    outputLength += untouched.length
    if (request.replacement.length > 0) {
      replacementRanges.push({
        start: outputLength,
        end: outputLength + request.replacement.length,
      })
    }
    outputLength += request.replacement.length
    sourceCursor = range.end
  }
  outputParts.push(request.source.slice(sourceCursor))

  return {
    output: outputParts.join(''),
    matchRanges,
    replacementRanges,
    matchCount: matchRanges.length,
    durationMs: performance.now() - startedAt,
  }
}

export function countVisibleCharacters(value: string): number {
  if (!value) return 0
  if (GRAPHEME_SEGMENTER) {
    let count = 0
    for (const segment of GRAPHEME_SEGMENTER.segment(value)) {
      if (segment.segment) count += 1
    }
    return count
  }
  return Array.from(value).length
}

export function formatDuration(durationMs: number): string {
  return durationMs < 1 ? '<1ms' : `${Math.round(durationMs)}ms`
}
