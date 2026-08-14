export type NotionSplitBoundary =
  | 'paragraph'
  | 'line'
  | 'sentence'
  | 'space'
  | 'grapheme'
  | 'end'

export interface NotionSplitOptions {
  maxBytes: number
  preferSemanticBoundaries: boolean
}

export interface NotionSplitChunk {
  index: number
  text: string
  start: number
  end: number
  byteLength: number
  characterCount: number
  boundary: NotionSplitBoundary
}

export interface NotionSplitResult {
  chunks: NotionSplitChunk[]
  totalByteLength: number
  totalCharacterCount: number
  maxChunkByteLength: number
}

export interface NotionSplitDraftV1 {
  version: 1
  source: string
  options: NotionSplitOptions
}

export const DEFAULT_NOTION_SPLIT_OPTIONS: NotionSplitOptions = {
  maxBytes: 400_000,
  preferSemanticBoundaries: true,
}
