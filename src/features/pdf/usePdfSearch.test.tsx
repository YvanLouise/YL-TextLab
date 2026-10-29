import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePdfSearch } from './usePdfSearch'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('PDF debounced search', () => {
  it('cancels before the debounce starts and can search a new query afterwards', async () => {
    const read = vi.fn().mockResolvedValue({ text: 'Local PDF document', runs: [] })
    const navigate = vi.fn()
    const { result } = renderHook(() => usePdfSearch(read, 1, true, navigate))
    act(() => result.current.setQuery('Local'))
    expect(result.current.busy).toBe(true)
    act(() => result.current.cancel())
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(read).not.toHaveBeenCalled()
    expect(result.current.busy).toBe(false)
    expect(result.current.message).toContain('搜索已停止')
    act(() => result.current.setQuery('PDF'))
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(result.current.matches).toHaveLength(1)
    expect(navigate).toHaveBeenCalledWith(1)
    expect(result.current.busy).toBe(false)
  })

  it('discards stale in-flight matches after clearing the query', async () => {
    let resolve: (value: { text: string; runs: [] }) => void = () => {}
    const read = vi.fn(() => new Promise<{ text: string; runs: [] }>((next) => { resolve = next }))
    const navigate = vi.fn()
    const { result } = renderHook(() => usePdfSearch(read, 1, true, navigate))
    act(() => result.current.setQuery('PDF'))
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    act(() => result.current.setQuery(''))
    await act(async () => resolve({ text: 'PDF document', runs: [] }))
    expect(result.current.matches).toHaveLength(0)
    expect(result.current.busy).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not read text when document permissions disallow it', async () => {
    const read = vi.fn()
    const navigate = vi.fn()
    const { result } = renderHook(() => usePdfSearch(read, 1, false, navigate))
    act(() => result.current.setQuery('PDF'))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(read).not.toHaveBeenCalled()
    expect(result.current.busy).toBe(false)
  })
})
