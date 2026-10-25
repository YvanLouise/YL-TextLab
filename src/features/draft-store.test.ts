import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDraftStore } from './draft-store'

afterEach(() => vi.unstubAllGlobals())

function databaseHarness() {
  const request = { result: 'draft' }
  const transaction = { objectStore: () => ({ put: () => request, delete: () => request, get: () => request }),
    oncomplete: null as (() => void) | null, onabort: null as (() => void) | null, error: new Error('quota') }
  const database = { transaction: vi.fn(() => transaction), close: vi.fn(), onversionchange: null }
  vi.stubGlobal('indexedDB', { open: () => {
    const open = { result: database, onsuccess: null as (() => void) | null }
    queueMicrotask(() => open.onsuccess?.())
    return open
  } })
  return { transaction, database }
}

describe('shared draft storage', () => {
  it('reports a save only after the transaction commits', async () => {
    const { transaction, database } = databaseHarness()
    const store = createDraftStore('test', (value) => String(value), (value: string) => !value)
    const complete = vi.fn()
    const save = store.save('draft').then(complete)
    await vi.waitFor(() => expect(transaction.oncomplete).not.toBeNull())
    expect(complete).not.toHaveBeenCalled()
    transaction.oncomplete!()
    await save
    expect(complete).toHaveBeenCalledWith(true)
    expect(database.close).toHaveBeenCalledOnce()
  })

  it('retains unsaved text and does not resurrect old data after a failed clear', async () => {
    const { transaction } = databaseHarness()
    const store = createDraftStore('test', (value) => String(value), (value: string) => !value)
    const save = store.save('latest text')
    await vi.waitFor(() => expect(transaction.onabort).not.toBeNull())
    transaction.onabort!()
    expect(await save).toBe(false)
    expect(await store.load()).toBe('latest text')
    vi.stubGlobal('indexedDB', undefined)
    await store.clear()
    expect(await store.load()).toBeNull()
  })

  it('serializes a clear after an earlier save has committed', async () => {
    const { transaction, database } = databaseHarness()
    const store = createDraftStore('test', (value) => String(value), (value: string) => !value)
    const save = store.save('draft')
    const clear = store.clear()
    await vi.waitFor(() => expect(database.transaction).toHaveBeenCalledTimes(1))
    transaction.oncomplete!()
    await save
    await vi.waitFor(() => expect(database.transaction).toHaveBeenCalledTimes(2))
    transaction.oncomplete!()
    await clear
  })
})
