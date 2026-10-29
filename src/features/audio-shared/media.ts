export function readMediaDuration(url: string, signal: AbortSignal, kind: 'audio' | 'video' = 'audio', timeoutMs = 12000) {
  return new Promise<number | null>((resolve) => {
    const media = kind === 'video' ? document.createElement('video') : new Audio()
    let settled = false
    const finish = (value: number | null) => {
      if (settled) return
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort)
      media.onloadedmetadata = null; media.ondurationchange = null; media.ontimeupdate = null; media.onerror = null
      media.removeAttribute('src'); media.load(); resolve(value)
    }
    const abort = () => finish(null)
    const timer = setTimeout(() => finish(null), timeoutMs)
    const read = () => { if (Number.isFinite(media.duration) && media.duration > 0) finish(media.duration) }
    media.preload = 'metadata'; media.ondurationchange = read; media.ontimeupdate = read
    media.onloadedmetadata = () => {
      read()
      if (!settled && media.duration === Infinity) { try { media.currentTime = Number.MAX_SAFE_INTEGER } catch { finish(null) } }
    }
    media.onerror = () => finish(null)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort(); else media.src = url
  })
}

export function pauseAudioPreviews(except?: HTMLMediaElement) {
  document.querySelectorAll<HTMLMediaElement>('main audio, main video').forEach(media => {
    if (media !== except && !media.paused) media.pause()
  })
}
