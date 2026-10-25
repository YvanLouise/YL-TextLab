const DB_NAME = 'yl-text-tool'
const STORE_NAME = 'drafts'
let operations: Promise<unknown> = Promise.resolve()

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const pending = operations.then(operation, operation)
  operations = pending.catch(() => undefined)
  return pending
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('IndexedDB is unavailable')); return }
    const request = indexedDB.open(DB_NAME, 1)
    let settled = false
    const fail = () => {
      settled = true
      clearTimeout(timeout)
      reject(new Error('Draft storage is unavailable'))
    }
    const timeout = setTimeout(fail, 2500)
    request.onerror = fail
    request.onblocked = fail
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => {
      clearTimeout(timeout)
      if (settled) { request.result.close(); return }
      settled = true
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = operation(transaction.objectStore(STORE_NAME))
      // A successful request can still be rolled back before the transaction commits.
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? new Error('Draft transaction aborted'))
      transaction.onerror = () => reject(transaction.error ?? request.error)
    })
  } finally { database.close() }
}

export function createDraftStore<T>(key: string, normalize: (value: unknown) => T | null, isEmpty: (draft: T) => boolean) {
  let memory: T | null = null
  let unsaved = false
  const write = (draft: T | null) => enqueue(async () => {
    memory = draft
    unsaved = true
    try {
      if (draft === null) await transact('readwrite', (store) => store.delete(key))
      else await transact('readwrite', (store) => store.put(draft, key))
      unsaved = false
      return true
    } catch { return false }
  })
  return {
    load: () => enqueue(async () => {
      if (unsaved) return memory
      try {
        memory = normalize(await transact('readonly', (store) => store.get(key)))
      } catch { /* Keep the current in-memory draft when storage is unavailable. */ }
      return memory
    }),
    save: (draft: T) => write(isEmpty(draft) ? null : draft),
    clear: async () => { await write(null) },
  }
}
