import { describe, expect, it } from 'vitest'
import { constrainNote, encodeMidi, mergeOverlappingNotes, parseMidiProject, snapTime } from './midi'
import { pitchHz, pitchName, type MidiNote } from './types'

const note: MidiNote = { id: 'one', pitch: 60, start: .5, end: 1, velocity: 96 }

function events(bytes: Uint8Array) {
  const result: { tick: number; status: number; bytes: number[] }[] = []
  let at = 22, tick = 0
  const variable = () => { let value = 0, byte: number; do { byte = bytes[at++]; value = value * 128 + (byte & 127) } while (byte & 128); return value }
  while (at < bytes.length) {
    tick += variable()
    const status = bytes[at++]
    let data: number[]
    if (status === 255) { const type = bytes[at++], length = variable(); data = [type, ...bytes.slice(at, at + length)]; at += length }
    else { const count = status === 192 ? 1 : 2; data = [...bytes.slice(at, at + count)]; at += count }
    result.push({ tick, status, bytes: data })
  }
  return result
}

describe('MIDI notes and standard file export', () => {
  it('maps piano note names and frequencies and snaps seconds to a beat grid', () => {
    expect(pitchName(21)).toBe('A0'); expect(pitchName(60)).toBe('C4'); expect(pitchName(108)).toBe('C8')
    expect(pitchHz(69)).toBe(440)
    expect(snapTime(.18, 120, 4)).toBe(.125)
    expect(snapTime(.1834, 120, 0)).toBeCloseTo(.183)
  })
  it('keeps notes inside the audio and pitch range with nonzero length and velocity', () => {
    expect(constrainNote({ ...note, start: -2, end: 30, pitch: 140, velocity: 0 }, 2)).toMatchObject({ start: 0, end: 2, pitch: 108, velocity: 1 })
    const end = constrainNote({ ...note, start: 10, end: 10 }, 2)
    expect(end.start).toBeCloseTo(1.98); expect(end.end).toBe(2)
  })
  it('exports format 0, 960 PPQ, tempo, velocity, note offs and complete source duration', () => {
    const bytes = encodeMidi([note], 120, 2)
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('MThd')
    const header = new DataView(bytes.buffer)
    expect(header.getUint16(8)).toBe(0); expect(header.getUint16(10)).toBe(1); expect(header.getUint16(12)).toBe(960)
    expect(header.getUint32(18)).toBe(bytes.length - 22)
    const list = events(bytes)
    expect(list[0]).toEqual({ tick: 0, status: 255, bytes: [81, 7, 161, 32] })
    expect(list.find(event => event.status === 144)).toEqual({ tick: 960, status: 144, bytes: [60, 96] })
    expect(list.find(event => event.status === 128)?.tick).toBe(1920)
    expect(list.at(-1)).toEqual({ tick: 3840, status: 255, bytes: [47] })
  })
  it('keeps real timing when BPM changes and emits note off before a same-time note on', () => {
    const list = events(encodeMidi([note, { ...note, id: 'two', start: 1, end: 1.5 }], 60, 2))
    expect(list.filter(event => event.status === 144).map(event => event.tick)).toEqual([480, 960])
    expect(list.filter(event => event.tick === 960).map(event => event.status)).toEqual([128, 144])
  })
  it('merges same-pitch overlaps without merging chords or mutating the editor', () => {
    const notes = [note, { ...note, id: 'two', start: .75, end: 1.5, velocity: 110 }, { ...note, pitch: 64 }]
    expect(mergeOverlappingNotes(notes)).toHaveLength(2)
    expect(mergeOverlappingNotes(notes)[0]).toMatchObject({ start: .5, end: 1.5, velocity: 110 })
    expect(notes[0].end).toBe(1)
    expect(events(encodeMidi(notes, 120, 2)).filter(event => event.status === 144)).toHaveLength(2)
  })
  it('rejects invalid timing, pitch, velocity, duration and tempo', () => {
    for (const invalid of [{ ...note, start: NaN }, { ...note, end: .4 }, { ...note, pitch: 128 }, { ...note, velocity: 0 }]) expect(() => encodeMidi([invalid], 120, 2)).toThrow()
    expect(() => encodeMidi([], 120, 2)).toThrow()
    expect(() => encodeMidi([note], 0, 2)).toThrow()
    expect(() => encodeMidi([note], 120, Infinity)).toThrow()
  })
  it('round trips a project, regenerates safe unique IDs and rejects mismatched or malformed data', () => {
    const project = { version: 1, sourceName: 'test.wav', duration: 2, bpm: 120, notes: [note, { ...note, pitch: 64 }] }
    const parsed = parseMidiProject(JSON.stringify(project), 2)
    expect(parsed.notes.map(note => note.id)).toEqual(['import-0', 'import-1'])
    expect(parsed.notes[0]).toMatchObject({ pitch: 60, start: .5, end: 1 })
    expect(() => parseMidiProject(JSON.stringify(project), 3)).toThrow('时长')
    expect(() => parseMidiProject(JSON.stringify({ ...project, notes: [null] }), 2)).toThrow()
    expect(() => parseMidiProject(JSON.stringify({ ...project, notes: [{ ...note, pitch: 64.5 }] }), 2)).toThrow()
  })
})
