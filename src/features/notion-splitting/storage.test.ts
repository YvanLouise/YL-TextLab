import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearNotionSplitDraft,
  loadNotionSplitDraft,
  saveNotionSplitDraft,
} from './storage'
import {
  DEFAULT_NOTION_SPLIT_OPTIONS,
  type NotionSplitDraftV1,
} from './types'

const draft: NotionSplitDraftV1 = {
  version: 1,
  source: '一段等待切分的 Notion 文本',
  options: {
    maxCharacters: 1_500,
    maxBytes: 350_000,
    preferSemanticBoundaries: false,
  },
}

describe('Notion split draft storage fallback', () => {
  beforeEach(async () => {
    await clearNotionSplitDraft()
  })

  it('keeps a draft in memory when IndexedDB is unavailable', async () => {
    expect(await saveNotionSplitDraft(draft)).toBe(false)
    expect(await loadNotionSplitDraft()).toEqual(draft)
  })

  it('clears both the persistent key and memory fallback', async () => {
    await saveNotionSplitDraft(draft)
    await clearNotionSplitDraft()

    expect(await loadNotionSplitDraft()).toBeNull()
  })

  it('treats an empty draft with default options as deleted', async () => {
    await saveNotionSplitDraft(draft)
    await saveNotionSplitDraft({
      version: 1,
      source: '',
      options: { ...DEFAULT_NOTION_SPLIT_OPTIONS },
    })

    expect(await loadNotionSplitDraft()).toBeNull()
  })

  it('retains changed options even when the source is empty', async () => {
    const optionsOnlyDraft: NotionSplitDraftV1 = {
      version: 1,
      source: '',
      options: {
        maxCharacters: 1_000,
        maxBytes: 300_000,
        preferSemanticBoundaries: true,
      },
    }

    await saveNotionSplitDraft(optionsOnlyDraft)
    expect(await loadNotionSplitDraft()).toEqual(optionsOnlyDraft)
  })
})
