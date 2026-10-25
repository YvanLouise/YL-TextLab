import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyPlainText } from './clipboard'

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('clipboard fallback', () => {
  it('falls back after permission denial and restores focus', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => true) })
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    await copyPlainText('text')
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(document.activeElement).toBe(input)
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('removes its temporary element even when copying throws', async () => {
    vi.stubGlobal('navigator', {})
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => { throw new Error('denied') }) })
    await expect(copyPlainText('text')).rejects.toThrow('denied')
    expect(document.querySelector('textarea')).toBeNull()
  })
})
