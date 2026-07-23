import type { ReplacementDraftV1 } from './types'

const DB_NAME = 'yl-text-tool'
const DB_VERSION = 1
const STORE_NAME = 'drafts'
const DRAFT_KEY = 'keyword-replace'

let memoryDraft: ReplacementDraftV1 | null = null

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
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

export async function loadReplacementDraft(): Promise<ReplacementDraftV1 | null> {
  try {
    const draft = await transact<ReplacementDraftV1 | undefined>('readonly', (store) =>
      store.get(DRAFT_KEY),
    )
    if (draft?.version === 1) {
      memoryDraft = draft
      return draft
    }
    return null
  } catch {
    return memoryDraft
  }
}

function isEmptyDraft(draft: ReplacementDraftV1): boolean {
  return !draft.source && !draft.search && !draft.replacement && !draft.result
}

export async function saveReplacementDraft(draft: ReplacementDraftV1): Promise<boolean> {
  memoryDraft = isEmptyDraft(draft) ? null : draft
  try {
    if (isEmptyDraft(draft)) {
      await transact<undefined>('readwrite', (store) => store.delete(DRAFT_KEY))
    } else {
      await transact<IDBValidKey>('readwrite', (store) => store.put(draft, DRAFT_KEY))
    }
    return true
  } catch {
    return false
  }
}

export async function clearReplacementDraft(): Promise<void> {
  memoryDraft = null
  try {
    await transact<undefined>('readwrite', (store) => store.delete(DRAFT_KEY))
  } catch {
    // The in-memory fallback is already cleared.
  }
}
