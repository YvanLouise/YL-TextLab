import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Maximize2, ScanLine, ZoomIn, ZoomOut } from 'lucide-react'
import { clampWaveformView, formatPreciseTime } from '../features/audio-splitting/audio'
import styles from './AudioSplitPage.module.css'

interface WaveformProps {
  peaks: number[]
  duration: number
  start: number
  end: number
  currentTime: number
  disabled: boolean
  onSeek: (value: number) => void
  onStartChange: (value: number) => void
  onEndChange: (value: number) => void
}

export function AudioSplitWaveform({ peaks, duration, start, end, currentTime, disabled, onSeek, onStartChange, onEndChange }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState({ start: 0, end: duration })
  const span = view.end - view.start
  const ratio = (value: number) => Math.max(0, Math.min(1, (value - view.start) / span))
  const visible = (value: number) => value >= view.start && value <= view.end
  const zoom = duration / span

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const width = Math.max(1, canvas.clientWidth)
      const height = Math.max(1, canvas.clientHeight)
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(dpr, dpr)
      context.clearRect(0, 0, width, height)
      const count = Math.max(1, Math.floor(width / 4))
      for (let index = 0; index < count; index += 1) {
        const time = view.start + index / count * span
        const first = Math.floor(time / duration * peaks.length)
        const last = Math.min(peaks.length, Math.max(first + 1, Math.ceil((time + span / count) / duration * peaks.length)))
        let peak = 0
        for (let sample = first; sample < last; sample += 1) peak = Math.max(peak, peaks[sample] ?? 0)
        const amplitude = Math.max(2, peak * height * 0.82)
        context.fillStyle = time >= start && time <= end ? '#286cf4' : '#aeb8c8'
        context.fillRect(index * width / count, (height - amplitude) / 2, Math.max(1, width / count - 1), amplitude)
      }
    }
    draw()
    if (!('ResizeObserver' in globalThis)) {
      window.addEventListener('resize', draw)
      return () => window.removeEventListener('resize', draw)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [peaks, duration, start, end, view, span])

  const changeZoom = (factor: number) => {
    const nextSpan = Math.min(duration, Math.max(duration / 64, span / factor))
    const anchor = visible(currentTime) ? currentTime : (view.start + view.end) / 2
    setView(clampWaveformView(anchor - nextSpan / 2, nextSpan, duration))
  }

  const seekPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width) onSeek(view.start + Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * span)
  }

  return (
    <div className={styles.waveform}>
      <div className={styles.waveformTools}>
        <span>波形视图 · {zoom.toFixed(1)}×</span>
        <div>
          <button type="button" aria-label="缩小波形" disabled={disabled || zoom <= 1.001} onClick={() => changeZoom(0.5)}><ZoomOut /></button>
          <button type="button" aria-label="放大波形" disabled={disabled || zoom >= 64} onClick={() => changeZoom(2)}><ZoomIn /></button>
          <button type="button" disabled={disabled} onClick={() => setView(clampWaveformView(start - (end - start) * 0.05, Math.max(duration / 64, (end - start) * 1.1), duration))}><ScanLine />缩放至选区</button>
          <button type="button" disabled={disabled} onClick={() => setView({ start: 0, end: duration })}><Maximize2 />显示全部</button>
        </div>
      </div>
      <div className={styles.timeScale} aria-hidden="true">
        <span>{formatPreciseTime(view.start)}</span><span>{formatPreciseTime((view.start + view.end) / 2)}</span><span>{formatPreciseTime(view.end)}</span>
      </div>
      <div className={styles.waveformCanvas}>
        <canvas ref={canvasRef} role="slider" tabIndex={disabled ? -1 : 0} aria-label="播放位置" aria-valuemin={0} aria-valuemax={duration}
          aria-valuenow={currentTime} aria-valuetext={formatPreciseTime(currentTime)} aria-disabled={disabled}
          onPointerDown={(event) => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); seekPointer(event) }}
          onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekPointer(event) }}
          onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
          onKeyDown={(event) => {
            if (disabled) return
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              onSeek(event.key === 'Home' ? view.start : event.key === 'End' ? view.end : currentTime + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 0.1))
            }
          }} />
        <span className={styles.selectionFill} style={{ left: `${ratio(start) * 100}%`, width: `${Math.max(0, ratio(end) - ratio(start)) * 100}%` }} />
        {visible(currentTime) ? <span className={styles.playhead} style={{ left: `${ratio(currentTime) * 100}%` }} /> : null}
        <input className={styles.range} style={{ visibility: visible(start) ? 'visible' : 'hidden' }}
          type="range" aria-label="开始位置" aria-valuetext={formatPreciseTime(start)} min={view.start} max={view.end} step={0.001} value={Math.max(view.start, Math.min(view.end, start))}
          disabled={disabled} onChange={(event) => onStartChange(Number(event.target.value))} />
        <input className={styles.range} style={{ visibility: visible(end) ? 'visible' : 'hidden' }}
          type="range" aria-label="结束位置" aria-valuetext={formatPreciseTime(end)} min={view.start} max={view.end} step={0.001} value={Math.max(view.start, Math.min(view.end, end))}
          disabled={disabled} onChange={(event) => onEndChange(Number(event.target.value))} />
      </div>
      <div className={styles.selectionLabels}><span>起点 {formatPreciseTime(start)}</span><span>终点 {formatPreciseTime(end)}</span></div>
      {zoom > 1.001 ? <label className={styles.panControl}>移动视窗
        <input type="range" aria-label="波形视窗位置" min={0} max={Math.max(0, duration - span)} step={0.001} value={view.start} disabled={disabled}
          onChange={(event) => setView(clampWaveformView(Number(event.target.value), span, duration))} />
      </label> : null}
      <p className={styles.waveformHint}>{peaks.length ? '点击或拖动波形定位；聚焦波形后用 ← → 微调 0.1 秒，Shift 加速至 1 秒。' : '当前格式未能生成波形，横线仅表示时间轴；可通过时间输入选择区域。'}</p>
    </div>
  )
}
