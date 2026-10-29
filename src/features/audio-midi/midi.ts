import { MAX_NOTES, MAX_PITCH, MIN_PITCH, type MidiNote, type MidiProject } from './types'

export function snapTime(time: number, bpm: number, division: number) {
  const step = division > 0 ? 60 / bpm / division : .001
  return Math.round(time / step) * step
}

export function constrainNote(note: MidiNote, duration: number): MidiNote {
  const minimum = Math.min(.02, duration)
  const start = Math.max(0, Math.min(duration - minimum, note.start))
  return { ...note, start, end: Math.max(start + minimum, Math.min(duration, note.end)),
    pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.round(note.pitch))),
    velocity: Math.max(1, Math.min(127, Math.round(note.velocity))) }
}

export function mergeOverlappingNotes(notes: MidiNote[]) {
  const result: MidiNote[] = []
  for (const note of [...notes].sort((a, b) => a.pitch - b.pitch || a.start - b.start)) {
    const last = result[result.length - 1]
    if (last && last.pitch === note.pitch && note.start < last.end) {
      last.end = Math.max(last.end, note.end); last.velocity = Math.max(last.velocity, note.velocity)
    } else result.push({ ...note })
  }
  return result
}

function vlq(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x0fffffff) throw new Error('MIDI 时间超出范围。')
  const bytes = [value & 127]
  while ((value = Math.floor(value / 128)) > 0) bytes.unshift((value & 127) | 128)
  return bytes
}

export function encodeMidi(notes: MidiNote[], bpm: number, duration: number): Uint8Array<ArrayBuffer> {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) throw new Error('速度须为 20–300 BPM。')
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) throw new Error('音频时长无效。')
  if (!notes.length || notes.length > MAX_NOTES) throw new Error(`请添加 1–${MAX_NOTES} 个音符。`)
  for (const note of notes) {
    if (![note.start, note.end, note.pitch, note.velocity].every(Number.isFinite)
      || note.start < 0 || note.end <= note.start || note.end > duration + .001
      || !Number.isInteger(note.pitch) || note.pitch < MIN_PITCH || note.pitch > MAX_PITCH
      || !Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127) throw new Error('音符参数无效。')
  }
  const ppq = 960
  const tempo = Math.round(60000000 / bpm)
  const tick = (seconds: number) => Math.round(seconds * 1000000 / tempo * ppq)
  const events: { tick: number; order: number; bytes: number[] }[] = [
    { tick: 0, order: -3, bytes: [0xff, 0x51, 3, tempo >> 16, tempo >> 8 & 255, tempo & 255] },
    { tick: 0, order: -2, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] },
    { tick: 0, order: -1, bytes: [0xc0, 0] },
  ]
  for (const note of mergeOverlappingNotes(notes)) {
    const start = tick(note.start)
    events.push({ tick: start, order: 1, bytes: [0x90, note.pitch, note.velocity] })
    events.push({ tick: Math.max(start + 1, tick(note.end)), order: 0, bytes: [0x80, note.pitch, 0] })
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order)
  let previous = 0
  const track: number[] = []
  for (const event of events) { track.push(...vlq(event.tick - previous), ...event.bytes); previous = event.tick }
  track.push(...vlq(Math.max(previous, tick(duration)) - previous), 0xff, 0x2f, 0)
  const result = new Uint8Array(22 + track.length)
  result.set([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, ppq >> 8, ppq & 255, 77, 84, 114, 107])
  new DataView(result.buffer).setUint32(18, track.length)
  result.set(track, 22)
  return result
}

export function parseMidiProject(text: string, duration: number): MidiProject {
  if (text.length > 2 * 1024 * 1024) throw new Error('工程文件过大。')
  const data = JSON.parse(text) as MidiProject
  if (data.version !== 1 || !Number.isFinite(data.duration) || Math.abs(data.duration - duration) > .1
    || !Array.isArray(data.notes) || data.notes.length > MAX_NOTES || typeof data.sourceName !== 'string') {
    throw new Error('工程格式无效或与当前音频时长不一致，请选择原音频后再载入。')
  }
  if (!Number.isFinite(data.bpm) || data.bpm < 20 || data.bpm > 300) throw new Error('工程速度无效。')
  const notes = data.notes.map((note, index) => {
    if (!note || ![note.start, note.end, note.pitch, note.velocity].every(Number.isFinite)
      || note.start < 0 || note.end > duration + .001 || note.end <= note.start
      || !Number.isInteger(note.pitch) || note.pitch < MIN_PITCH || note.pitch > MAX_PITCH
      || !Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127) throw new Error('工程中包含无效音符。')
    return { id: `import-${index}`, start: note.start, end: Math.min(note.end, duration), pitch: note.pitch, velocity: note.velocity }
  })
  return { version: 1, sourceName: data.sourceName, duration, bpm: data.bpm, notes }
}
