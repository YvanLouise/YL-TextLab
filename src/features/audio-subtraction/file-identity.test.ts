import { describe, expect, it, vi } from 'vitest'
import { AUDIO_IDENTITY_CHUNK_BYTES, areAudioFilesIdentical } from './file-identity'

describe('same audio file detection', () => {
  it('recognizes identical contents despite different filenames and last-modified dates', async () => {
    const a = new File(['RIFF-test-WAVE-data'], 'first.wav', { lastModified: 1 })
    const b = new File(['RIFF-test-WAVE-data'], 'renamed.wav', { lastModified: 2 })
    expect(await areAudioFilesIdentical(a, b)).toBe(true)
    expect(await areAudioFilesIdentical(a, a)).toBe(true)
  })

  it('does not equate same-size, same-name files when their bytes differ', async () => {
    const a = new File(['RIFF-test-WAVE-A'], 'same.wav')
    const b = new File(['RIFF-test-WAVE-B'], 'same.wav')
    expect(a.size).toBe(b.size)
    expect(await areAudioFilesIdentical(a, b)).toBe(false)
    expect(await areAudioFilesIdentical(a, new File(['short'], 'same.wav'))).toBe(false)
  })

  it('compares the complete contents including the tail, reading only bounded chunks', async () => {
    const content = new Uint8Array(AUDIO_IDENTITY_CHUNK_BYTES * 2 + 3).fill(17)
    const a = new File([content], 'large.wav')
    const b = new File([content], 'copy.wav')
    const slices = vi.spyOn(a, 'slice')
    const fullRead = vi.spyOn(a, 'arrayBuffer').mockRejectedValue(new Error('No full-file reads'))
    expect(await areAudioFilesIdentical(a, b)).toBe(true)
    expect(slices).toHaveBeenCalledTimes(3)
    expect(slices.mock.calls.every(([start = 0, end = 0]) => end - start <= AUDIO_IDENTITY_CHUNK_BYTES)).toBe(true)
    expect(fullRead).not.toHaveBeenCalled()
    content[content.length - 1] = 18
    expect(await areAudioFilesIdentical(a, new File([content], 'large.wav'))).toBe(false)
  })

  it('stops a stale comparison when either input is replaced or removed', async () => {
    const controller = new AbortController()
    const a = new Blob(['abcd']), b = new Blob(['abcd'])
    vi.spyOn(a, 'slice').mockImplementation(() => {
      controller.abort()
      return new Blob(['abcd'])
    })
    await expect(areAudioFilesIdentical(a, b, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
