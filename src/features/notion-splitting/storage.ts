import { createDraftStore } from '../draft-store'
import { DEFAULT_NOTION_SPLIT_OPTIONS, type NotionSplitDraftV1 } from './types'

function normalizeDraft(value: unknown): NotionSplitDraftV1 | null {
  if (!value || typeof value !== 'object') return null
  const draft = value as Partial<NotionSplitDraftV1>
  if (draft.version !== 1 || typeof draft.source !== 'string' || !draft.options ||
    typeof draft.options.preferSemanticBoundaries !== 'boolean') return null
  const { maxCharacters, maxBytes, preferSemanticBoundaries } = draft.options
  return {
    version: 1,
    source: draft.source,
    options: {
      maxCharacters: Number.isInteger(maxCharacters) && maxCharacters >= 100 && maxCharacters <= 2000
        ? maxCharacters : DEFAULT_NOTION_SPLIT_OPTIONS.maxCharacters,
      maxBytes: Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_NOTION_SPLIT_OPTIONS.maxBytes,
      preferSemanticBoundaries,
    },
  }
}

const store = createDraftStore<NotionSplitDraftV1>('notion-split', normalizeDraft, (draft) =>
  !draft.source && draft.options.maxCharacters === DEFAULT_NOTION_SPLIT_OPTIONS.maxCharacters &&
  draft.options.maxBytes === DEFAULT_NOTION_SPLIT_OPTIONS.maxBytes &&
  draft.options.preferSemanticBoundaries === DEFAULT_NOTION_SPLIT_OPTIONS.preferSemanticBoundaries)

export const loadNotionSplitDraft = store.load
export const saveNotionSplitDraft = store.save
export const clearNotionSplitDraft = store.clear
