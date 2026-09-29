import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export function useSelectionPlayback(
  audioRef: RefObject<HTMLAudioElement | null>, sourceUrl: string | null,
  start: number, end: number, duration: number, onError: (message: string) => void,
) {
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const playAttempt = useRef(0)

  const stop = useCallback(() => {
    playAttempt.current += 1
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [audioRef])

  const seek = useCallback((value: number) => {
    const audio = audioRef.current
    const position = Math.max(0, Math.min(duration, Math.round(value * 1000) / 1000))
    const bounded = audio && !audio.paused ? Math.max(start, Math.min(end, position)) : position
    if (audio) {
      try { audio.currentTime = bounded } catch { /* Native decoding may still be pending. */ }
    }
    setCurrentTime(bounded)
  }, [audioRef, duration, start, end])

  const toggle = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) { stop(); return }
    const attempt = ++playAttempt.current
    if (audio.currentTime < start || audio.currentTime >= end) audio.currentTime = start
    try {
      await audio.play()
      if (audioRef.current === audio && attempt === playAttempt.current) setIsPlaying(true)
    } catch {
      if (attempt !== playAttempt.current) return
      setIsPlaying(false)
      onError('浏览器暂时无法试听此格式，仍可尝试导出为 MP3 或 WAV 后试听。')
    }
  }, [audioRef, start, end, stop, onError])

  const sync = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.currentTime >= end && isPlaying) {
      if (loop) {
        audio.currentTime = start
        if (audio.paused) void audio.play().catch(() => { stop(); onError('循环试听已暂停，请重新点击播放。') })
      } else {
        stop()
        audio.currentTime = end
      }
    } else if (audio.currentTime < start && isPlaying) audio.currentTime = start
    setCurrentTime(audio.currentTime)
  }, [audioRef, end, start, loop, isPlaying, stop, onError])

  useEffect(() => {
    if (!isPlaying) return
    let frame = 0
    let lastUpdate = 0
    const tick = (now: number) => {
      // Check the boundary every frame, but render the time readout at most 20 Hz.
      if (now - lastUpdate >= 50 || (audioRef.current?.currentTime ?? 0) >= end) {
        sync()
        lastUpdate = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [audioRef, isPlaying, sync, end])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) { audio.volume = volume; audio.muted = muted }
  }, [audioRef, sourceUrl, volume, muted])

  useEffect(() => {
    const audio = audioRef.current
    return () => { playAttempt.current += 1; audio?.pause() }
  }, [audioRef, sourceUrl])

  return { currentTime, isPlaying, loop, setLoop, volume, setVolume, muted, setMuted,
    stop, seek, toggle, sync, onPause: () => { if (!audioRef.current?.ended) setIsPlaying(false) }, onPlay: () => setIsPlaying(true) }
}
