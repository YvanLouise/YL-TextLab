import { createDraftStore } from '../draft-store'
import { DEFAULT_OPTIONS, type ReplacementDraftV1 } from './types'

function normalizeDraft(value: unknown): ReplacementDraftV1 | null {
  if (!value || typeof value !== 'object') return null
  const draft = value as Partial<ReplacementDraftV1>
  if (draft.version !== 1 || typeof draft.source !== 'string' || typeof draft.search !== 'string' ||
    typeof draft.replacement !== 'string' || typeof draft.result !== 'string' ||
    !draft.options || Object.keys(DEFAULT_OPTIONS).some((key) =>
      typeof draft.options![key as keyof typeof DEFAULT_OPTIONS] !== 'boolean')) return null
  return draft as ReplacementDraftV1
}

const store = createDraftStore<ReplacementDraftV1>('keyword-replace', normalizeDraft,
  (draft) => !draft.source && !draft.search && !draft.replacement && !draft.result &&
    !draft.options.caseSensitive && !draft.options.wholeWord && !draft.options.firstOnly)

export const loadReplacementDraft = store.load
export const saveReplacementDraft = store.save
export const clearReplacementDraft = store.clear
