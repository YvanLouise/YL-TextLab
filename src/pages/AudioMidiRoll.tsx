import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { constrainNote, snapTime } from '../features/audio-midi/midi'
import { MAX_PITCH, MIN_PITCH, pitchHz, pitchName, type EditTool, type MidiNote, type Spectrum } from '../features/audio-midi/types'
import type { SpectralRegion } from '../features/spectral-edit/types'
import styles from './AudioMidiPage.module.css'

const KEY = 54, HEADER = 28, ROW = 19
const HEIGHT = (MAX_PITCH - MIN_PITCH + 1) * ROW + HEADER
const black = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12)
const emptyRegions: SpectralRegion[] = []

function heatmap(spectrum: Spectrum, brightness: number) {
  const canvas = document.createElement('canvas')
  canvas.width = spectrum.columns; canvas.height = spectrum.rows
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const pixels = context.createImageData(canvas.width, canvas.height)
  for (let x = 0; x < canvas.width; x++) for (let y = 0; y < canvas.height; y++) {
    const level = Math.min(1, spectrum.values[x * canvas.height + y] / 255 * brightness)
    const index = (y * canvas.width + x) * 4
    pixels.data[index] = level < .65 ? 12 + level * 35 : 35 + (level - .65) / .35 * 220
    pixels.data[index + 1] = level < .4 ? 18 + level * 100 : 58 + (level - .4) / .6 * 175
    pixels.data[index + 2] = level < .7 ? 32 + level * 190 : 165 - (level - .7) / .3 * 110
    pixels.data[index + 3] = 255
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}

interface Props {
  spectrum: Spectrum; notes: MidiNote[]; selected: string | null; tool: EditTool; zoom: number
  bpm: number; snap: number; brightness: number; currentTime: number; disabled: boolean
  followPlayback?: boolean
  onSelect: (id: string | null) => void; onCommit: (note: MidiNote) => void; onDelete: () => void
  onSeek: (time: number) => void; onUndo: () => void; onRedo: () => void
  regions?: SpectralRegion[]; selectedRegion?: string | null
  onRegionCommit?: (region: SpectralRegion) => void; onRegionSelect?: (id: string | null) => void; onRegionDelete?: () => void
}
interface Gesture { mode: 'draw' | 'move' | 'start' | 'end' | 'pan' | 'erase'; note?: MidiNote; region?: SpectralRegion; x: number; y: number; scrollX: number; scrollY: number }

export function AudioMidiRoll(props: Props) {
  const { spectrum, notes, selected, tool, zoom, bpm, snap, brightness, currentTime, disabled, onSelect, onCommit, onDelete, onSeek, onUndo, onRedo } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [preview, setPreview] = useState<MidiNote | null>(null)
  const previewRef = useRef<MidiNote | null>(null)
  const [regionPreview, setRegionPreview] = useState<SpectralRegion | null>(null)
  const regionRef = useRef<SpectralRegion | null>(null)
  const regions = props.regions ?? emptyRegions
  const [view, setView] = useState({ x: 0, y: 0, width: 800, height: 480 })
  const image = useMemo(() => heatmap(spectrum, brightness), [spectrum, brightness])
  const width = Math.max(view.width, KEY + spectrum.duration * zoom)
  const step = snap ? 60 / bpm / snap : .05

  useEffect(() => {
    const host = hostRef.current!
    const read = () => setView({ x: host.scrollLeft, y: host.scrollTop, width: host.clientWidth, height: host.clientHeight })
    host.scrollTop = (MAX_PITCH - 78) * ROW
    read()
    const observer = new ResizeObserver(read)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(view.width * dpr); canvas.height = Math.round(view.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#0c1424'; ctx.fillRect(0, 0, view.width, view.height)
    ctx.save(); ctx.beginPath(); ctx.rect(KEY, HEADER, view.width - KEY, view.height - HEADER); ctx.clip()
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(image, KEY - view.x, HEADER - view.y, spectrum.duration * zoom, HEIGHT - HEADER)
    for (let pitch = MIN_PITCH; pitch <= MAX_PITCH; pitch++) {
      const y = HEADER + (MAX_PITCH - pitch) * ROW - view.y
      if (y < HEADER - ROW || y > view.height) continue
      ctx.fillStyle = black(pitch) ? '#02091835' : '#ffffff06'; ctx.fillRect(KEY, y, view.width, ROW)
      ctx.strokeStyle = pitch % 12 === 0 ? '#b5c7e459' : '#9db4dc18'
      ctx.beginPath(); ctx.moveTo(KEY, y + ROW); ctx.lineTo(view.width, y + ROW); ctx.stroke()
    }
    const grid = Math.max(60 / bpm / (snap || 4), 60 / bpm / 4)
    const stride = Math.max(1, Math.ceil(8 / (grid * zoom)))
    for (let i = Math.floor(view.x / zoom / grid / stride) * stride; i * grid * zoom <= view.x + view.width; i += stride) {
      const x = KEY + i * grid * zoom - view.x
      ctx.strokeStyle = Math.abs((i * grid) % (240 / bpm)) < .0001 ? '#bed1f650' : '#93afe025'
      ctx.beginPath(); ctx.moveTo(x, HEADER); ctx.lineTo(x, view.height); ctx.stroke()
    }
    for (const note of [...notes.filter(note => note.id !== preview?.id), ...(preview ? [preview] : [])]) {
      const x = KEY + note.start * zoom - view.x, y = HEADER + (MAX_PITCH - note.pitch) * ROW - view.y + 1
      const length = Math.max(3, (note.end - note.start) * zoom)
      if (x + length < KEY || x > view.width || y + ROW < HEADER || y > view.height) continue
      ctx.fillStyle = note.id === selected || note.id === preview?.id ? '#faad37b8' : '#6b8dffb8'
      ctx.fillRect(x, y, length, ROW - 2)
      ctx.strokeStyle = note.id === selected || note.id === preview?.id ? '#ffe5a7' : '#b4c6ff'
      ctx.strokeRect(x + .5, y + .5, length - 1, ROW - 3)
      if (length > 30) { ctx.fillStyle = '#ffffff'; ctx.font = '11px system-ui'; ctx.fillText(pitchName(note.pitch), x + 4, y + 13, length - 6) }
      if (note.id === selected && length > 12) { ctx.fillStyle = '#fff'; ctx.fillRect(x + length - 4, y + 4, 2, 9) }
    }
    const yHz = (hz: number) => HEADER + (MAX_PITCH + .5 - (69 + 12 * Math.log2(Math.max(.001, hz) / 440))) * ROW - view.y
    for (const [index, region] of [...regions, ...(regionPreview ? [regionPreview] : [])].entries()) {
      const x = KEY + region.start * zoom - view.x, y = Math.max(HEADER, yHz(region.highHz))
      const bottom = Math.min(view.height, yHz(region.lowHz)), length = Math.max(2, (region.end - region.start) * zoom)
      if (bottom <= y || x + length < KEY || x > view.width) continue
      ctx.fillStyle = '#fa456739'; ctx.fillRect(x, y, length, bottom - y)
      ctx.strokeStyle = region.id === props.selectedRegion || region.id === regionPreview?.id ? '#ffe09c' : '#ff728b'
      ctx.lineWidth = 1.5; ctx.setLineDash(region.id === regionPreview?.id ? [4, 3] : [])
      ctx.strokeRect(x + .5, y + .5, length - 1, bottom - y - 1); ctx.setLineDash([])
      if (length > 40 && bottom - y > 16) { ctx.fillStyle = '#fff0f3'; ctx.font = '11px system-ui'; ctx.fillText(`去除 ${index + 1}`, Math.max(KEY + 3, x + 4), y + 13, length - 6) }
    }
    ctx.restore()
    ctx.fillStyle = '#142139'; ctx.fillRect(0, 0, KEY, view.height); ctx.fillRect(0, 0, view.width, HEADER)
    ctx.font = '11px system-ui'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1
    for (let pitch = MIN_PITCH; pitch <= MAX_PITCH; pitch++) {
      const y = HEADER + (MAX_PITCH - pitch) * ROW - view.y
      if (y < HEADER || y > view.height) continue
      ctx.fillStyle = black(pitch) ? '#1a2942' : '#e5eaf5'; ctx.fillRect(0, y, KEY - 1, ROW - 1)
      ctx.fillStyle = black(pitch) ? '#b1bed5' : '#263854'; ctx.fillText(pitchName(pitch), 8, y + ROW / 2)
    }
    ctx.fillStyle = '#a6badb'; ctx.fillText('音高', 10, HEADER / 2)
    const interval = zoom < 60 ? 2 : zoom < 160 ? 1 : .5
    for (let t = Math.floor(view.x / zoom / interval) * interval; t <= (view.x + view.width) / zoom; t += interval) {
      const x = KEY + t * zoom - view.x
      if (x >= KEY && t <= spectrum.duration) ctx.fillText(`${t.toFixed(interval < 1 ? 1 : 0)}s`, x + 3, HEADER / 2)
    }
  }, [spectrum, image, notes, preview, selected, zoom, view, bpm, snap, regions, props.selectedRegion, regionPreview])

  useEffect(() => {
    if (!props.followPlayback) return
    const x = KEY + currentTime * zoom - view.x
    if (x < KEY || x > view.width - 25) hostRef.current!.scrollLeft = Math.max(0, currentTime * zoom - (view.width - KEY) / 4)
  }, [currentTime, props.followPlayback, zoom, view.x, view.width])

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }
  const timeAt = (x: number) => Math.max(0, Math.min(spectrum.duration, (x - KEY + view.x) / zoom))
  const pitchAt = (y: number) => Math.max(MIN_PITCH, Math.min(MAX_PITCH, MAX_PITCH - Math.floor((y - HEADER + view.y) / ROW)))
  const hzAt = (y: number) => pitchHz(Math.max(MIN_PITCH - .5, Math.min(MAX_PITCH + .5, MAX_PITCH + .5 - (y - HEADER + view.y) / ROW)))
  function updatePreview(note: MidiNote | null) { previewRef.current = note; setPreview(note) }
  function updateRegion(region: SpectralRegion | null) { regionRef.current = region; setRegionPreview(region) }
  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled || event.button !== 0) return
    event.currentTarget.focus(); const { x, y } = point(event)
    if (y < HEADER && x >= KEY) { onSeek(timeAt(x)); return }
    if (x < KEY) return
    if (tool !== 'pan' && (x - KEY + view.x) / zoom >= spectrum.duration) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const time = timeAt(x), pitch = pitchAt(y)
    if (tool === 'pan') { gesture.current = { mode: 'pan', x, y, scrollX: view.x, scrollY: view.y }; return }
    if (tool === 'erase') {
      const hz = hzAt(y)
      const hit = [...regions].reverse().find(region => time >= region.start && time <= region.end && hz >= region.lowHz && hz <= region.highHz)
      props.onRegionSelect?.(hit?.id ?? null)
      gesture.current = { mode: 'erase', region: { id: crypto.randomUUID(), start: time, end: time, lowHz: hz, highHz: hz }, x, y, scrollX: view.x, scrollY: view.y }
      return
    }
    const hit = [...notes].reverse().find(note => note.pitch === pitch && time >= note.start && time <= note.end)
    if (hit) {
      onSelect(hit.id)
      const mode = Math.abs((time - hit.end) * zoom) < 7 ? 'end' : Math.abs((time - hit.start) * zoom) < 7 ? 'start' : 'move'
      gesture.current = { mode, note: hit, x, y, scrollX: view.x, scrollY: view.y }; updatePreview(hit)
    } else if (tool === 'draw') {
      const start = snapTime(time, bpm, snap)
      const note = constrainNote({ id: crypto.randomUUID(), pitch, start, end: start + (snap ? step : .25), velocity: 96 }, spectrum.duration)
      gesture.current = { mode: 'draw', note, x, y, scrollX: view.x, scrollY: view.y }; updatePreview(note)
    } else { onSelect(null); onSeek(time) }
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const active = gesture.current
    if (!active) return
    const { x, y } = point(event)
    if (active.mode === 'pan') {
      hostRef.current!.scrollLeft = active.scrollX + active.x - x
      hostRef.current!.scrollTop = active.scrollY + active.y - y
      return
    }
    if (active.mode === 'erase') {
      if (Math.abs(x - active.x) < 3 || Math.abs(y - active.y) < 3) return
      const region = active.region!, time = timeAt(x), hz = hzAt(y)
      updateRegion({ ...region, start: Math.min(region.start, time), end: Math.max(region.start, time), lowHz: Math.min(region.lowHz, hz), highHz: Math.max(region.lowHz, hz) })
      return
    }
    const note = active.note!
    const delta = snapTime((x - active.x) / zoom, bpm, snap)
    let next = { ...note }
    if (active.mode === 'move') {
      const start = Math.max(0, Math.min(spectrum.duration - (note.end - note.start), note.start + delta))
      next = { ...note, start, end: start + note.end - note.start, pitch: note.pitch - Math.round((y - active.y) / ROW) }
    } else if (active.mode === 'start') next.start = Math.min(note.end - .02, snapTime(timeAt(x), bpm, snap))
    else if (active.mode === 'end') next.end = Math.max(note.start + .02, snapTime(timeAt(x), bpm, snap))
    else if (Math.abs(x - active.x) > 3) {
      const end = snapTime(timeAt(x), bpm, snap)
      next.start = Math.min(note.start, end); next.end = Math.max(note.start + .02, end)
    }
    updatePreview(constrainNote(next, spectrum.duration))
  }
  function finish(event: PointerEvent<HTMLCanvasElement>, cancel = false) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const next = previewRef.current, original = gesture.current?.note
    if (!cancel && gesture.current?.mode === 'erase' && regionRef.current && regionRef.current.end - regionRef.current.start >= .01) props.onRegionCommit?.(regionRef.current)
    if (!cancel && next && (gesture.current?.mode === 'draw' || !original
      || next.pitch !== original.pitch || next.start !== original.start || next.end !== original.end)) onCommit(next)
    gesture.current = null; updatePreview(null); updateRegion(null)
  }

  return <div ref={hostRef} className={styles.rollViewport} onScroll={event => {
    const host = event.currentTarget; setView(previous => ({ ...previous, x: host.scrollLeft, y: host.scrollTop }))
  }}>
    <div className={styles.rollSpace} style={{ width, height: HEIGHT }}>
      <canvas ref={canvasRef} className={styles.rollCanvas} style={{ width: view.width, height: view.height }}
        role="application" aria-label="频谱 MIDI 编辑区" aria-describedby="midi-roll-help" tabIndex={0}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
        onKeyDown={event => {
          if (disabled) return
          if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
            event.preventDefault(); if (event.shiftKey || event.key.toLowerCase() === 'y') onRedo(); else onUndo(); return
          }
          if (event.key === 'Escape') { gesture.current = null; updatePreview(null); updateRegion(null); onSelect(null); props.onRegionSelect?.(null) }
          if (tool === 'erase') {
            if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); props.onRegionDelete?.() }
            return
          }
          const note = notes.find(note => note.id === selected)
          if (!note) return
          if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); onDelete() }
          if (event.key.startsWith('Arrow')) {
            event.preventDefault()
            const direction = ['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1
            if (['ArrowUp', 'ArrowDown'].includes(event.key)) onCommit(constrainNote({ ...note, pitch: note.pitch + direction }, spectrum.duration))
            else if (event.shiftKey) onCommit(constrainNote({ ...note, end: note.end + direction * step }, spectrum.duration))
            else {
              const start = Math.max(0, Math.min(spectrum.duration - (note.end - note.start), note.start + direction * step))
              onCommit({ ...note, start, end: start + note.end - note.start })
            }
          }
        }} />
      {KEY + currentTime * zoom - view.x >= KEY && KEY + currentTime * zoom - view.x <= view.width ? <div aria-hidden="true" className={styles.playhead}
        style={{ left: KEY + currentTime * zoom, top: view.y + HEADER, height: view.height - HEADER }} /> : null}
    </div>
  </div>
}
