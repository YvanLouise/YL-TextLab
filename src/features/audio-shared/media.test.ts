import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pauseAudioPreviews, readMediaDuration } from './media'

let media: HTMLAudioElement
beforeEach(() => {
  media = document.createElement('audio')
  vi.stubGlobal('Audio', vi.fn(function () { return media }))
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('shared media lifecycle', () => {
  it('reads duration and unloads the temporary decoder immediately', async () => {
    const result = readMediaDuration('blob:track', new AbortController().signal)
    Object.defineProperty(media, 'duration', { value: 65.125 })
    media.dispatchEvent(new Event('loadedmetadata'))
    expect(await result).toBe(65.125)
    expect(media.getAttribute('src')).toBeNull()
    expect(media.onloadedmetadata).toBeNull()
    expect(media.ondurationchange).toBeNull()
    expect(media.load).toHaveBeenCalledOnce()
  })
  it('cancels immediately and bounds stalled metadata reads', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const pending = readMediaDuration('blob:track', controller.signal)
    controller.abort()
    expect(await pending).toBeNull()
    const timed = readMediaDuration('blob:slow', new AbortController().signal, 'audio', 100)
    await vi.advanceTimersByTimeAsync(100)
    expect(await timed).toBeNull()
    expect(media.getAttribute('src')).toBeNull()
    expect(media.load).toHaveBeenCalledTimes(2)
  })
  it('resolves an initially unbounded duration without downloading or playing the source', async () => {
    let duration = Infinity
    Object.defineProperty(media, 'duration', { get: () => duration })
    const pending = readMediaDuration('blob:stream', new AbortController().signal)
    media.dispatchEvent(new Event('loadedmetadata'))
    expect(media.currentTime).toBe(Number.MAX_SAFE_INTEGER)
    duration = 8.5; media.dispatchEvent(new Event('durationchange'))
    expect(await pending).toBe(8.5)
  })
  it('pauses other active previews but preserves the selected one and unrelated page media', () => {
    document.body.innerHTML = '<audio id="outside"></audio><main><audio id="first"></audio><video id="second"></video></main>'
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const first = document.querySelector<HTMLAudioElement>('#first')!
    const second = document.querySelector<HTMLVideoElement>('#second')!
    document.querySelectorAll('audio,video').forEach(item => Object.defineProperty(item, 'paused', { value: false }))
    pauseAudioPreviews(second)
    expect(pause).toHaveBeenCalledOnce()
    expect(pause.mock.instances[0]).toBe(first)
  })
})
