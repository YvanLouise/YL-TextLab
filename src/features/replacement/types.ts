export interface ReplacementOptions {
  caseSensitive: boolean
  wholeWord: boolean
  firstOnly: boolean
}

export interface TextRange {
  start: number
  end: number
}

export interface ReplacementRequest {
  source: string
  search: string
  replacement: string
  options: ReplacementOptions
}

export interface ReplacementExecution {
  output: string
  matchRanges: TextRange[]
  replacementRanges: TextRange[]
  matchCount: number
  durationMs: number
}

export interface ReplacementDraftV1 {
  version: 1
  source: string
  search: string
  replacement: string
  result: string
  options: ReplacementOptions
}

export const DEFAULT_OPTIONS: ReplacementOptions = {
  caseSensitive: false,
  wholeWord: false,
  firstOnly: false,
}
