import {
  DEFAULT_NOTION_SPLIT_OPTIONS,
  type NotionSplitDraftV1,
} from './types'

const DB_NAME = 'yl-text-tool'
const DB_VERSION = 1
const STORE_NAME = 'drafts'
const DRAFT_KEY = 'notion-split'

let memoryDraft: NotionSplitDraftV1 | null = null

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = operation(transaction.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

function isValidDraft(value: unknown): value is NotionSplitDraftV1 {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<NotionSplitDraftV1>
  return (
    draft.version === 1 &&
    typeof draft.source === 'string' &&
    typeof draft.options?.maxBytes === 'number' &&
    Number.isFinite(draft.options.maxBytes) &&
    draft.options.maxBytes > 0 &&
    typeof draft.options.preferSemanticBoundaries === 'boolean'
  )
}

function isEmptyDraft(draft: NotionSplitDraftV1): boolean {
  return (
    !draft.source &&
    draft.options.maxBytes === DEFAULT_NOTION_SPLIT_OPTIONS.maxBytes &&
    draft.options.preferSemanticBoundaries ===
      DEFAULT_NOTION_SPLIT_OPTIONS.preferSemanticBoundaries
  )
}

export async function loadNotionSplitDraft(): Promise<NotionSplitDraftV1 | null> {
  try {
    const draft = await transact<unknown>('readonly', (store) => store.get(DRAFT_KEY))
    if (isValidDraft(draft)) {
      memoryDraft = draft
      return draft
    }
    return null
  } catch {
    return memoryDraft
  }
}

export async function saveNotionSplitDraft(
  draft: NotionSplitDraftV1,
): Promise<boolean> {
  memoryDraft = isEmptyDraft(draft) ? null : draft
  try {
    if (isEmptyDraft(draft)) {
      await transact<undefined>('readwrite', (store) => store.delete(DRAFT_KEY))
    } else {
      await transact<IDBValidKey>('readwrite', (store) =>
        store.put(draft, DRAFT_KEY),
      )
    }
    return true
  } catch {
    return false
  }
}

export async function clearNotionSplitDraft(): Promise<void> {
  memoryDraft = null
  try {
    await transact<undefined>('readwrite', (store) => store.delete(DRAFT_KEY))
  } catch {
    // The in-memory fallback is already cleared.
  }
}
