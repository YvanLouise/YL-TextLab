import { useCallback, useEffect, useRef, useState } from 'react'
import { mergeOverlappingNotes } from './midi'
import { pitchHz, type MidiNote } from './types'

export type PlaybackMode = 'both' | 'audio' | 'midi'

export function useMidiPlayback() {
  const state = useRef({ context: null as AudioContext | null, nodes: new Set<AudioScheduledSourceNode>(), frame: 0, generation: 0, cleanup: () => {}, master: null as GainNode | null })
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [volume, setVolume] = useState(.7)
  useEffect(() => { if (state.current.master) state.current.master.gain.value = volume }, [volume])
  const stop = useCallback(() => {
    const current = state.current
    current.generation++; cancelAnimationFrame(current.frame)
    current.nodes.forEach(node => { try { node.stop() } catch { /* An ended source needs no stop. */ } node.disconnect() })
    current.nodes.clear(); current.cleanup(); current.master = null; setPlaying(false)
  }, [])
  useEffect(() => {
    const current = state.current
    return () => {
      current.generation++; cancelAnimationFrame(current.frame)
      current.nodes.forEach(node => { try { node.stop() } catch { /* Already ended. */ } node.disconnect() })
      current.nodes.clear(); current.cleanup(); void current.context?.close()
    }
  }, [])
  const seek = useCallback((time: number) => { stop(); setPosition(time) }, [stop])

  async function play(buffer: AudioBuffer, notes: MidiNote[], mode: PlaybackMode, from: number) {
    stop()
    const current = state.current, token = current.generation
    const context = current.context ?? new AudioContext()
    current.context = context
    await context.resume()
    if (token !== current.generation) return
    const start = from >= buffer.duration - .01 ? 0 : from
    const origin = context.currentTime + .05
    const master = context.createGain(); master.gain.value = volume; current.master = master
    const limiter = context.createDynamicsCompressor(); limiter.threshold.value = -6; limiter.ratio.value = 12
    master.connect(limiter); limiter.connect(context.destination)
    current.cleanup = () => { master.disconnect(); limiter.disconnect() }
    const attach = (node: AudioScheduledSourceNode) => {
      current.nodes.add(node)
      node.onended = () => { current.nodes.delete(node); node.disconnect() }
    }
    if (mode !== 'midi') {
      const audio = context.createBufferSource(); audio.buffer = buffer
      audio.connect(master); attach(audio); audio.start(origin, start)
    }
    const pending = mode === 'audio' ? [] : mergeOverlappingNotes(notes).filter(note => note.end > start).sort((a, b) => a.start - b.start)
    let index = 0
    let lastUpdate = -Infinity
    const schedule = () => {
      if (token !== current.generation) { master.disconnect(); limiter.disconnect(); return }
      const time = Math.max(start, start + context.currentTime - origin)
      while (index < pending.length && pending[index].start < time + .3) {
        const note = pending[index++]
        const at = Math.max(origin, origin + note.start - start)
        const end = origin + note.end - start
        if (end <= context.currentTime) continue
        const oscillator = context.createOscillator(), gain = context.createGain()
        oscillator.type = 'triangle'; oscillator.frequency.value = pitchHz(note.pitch)
        const begin = Math.max(at, context.currentTime)
        gain.gain.setValueAtTime(0, begin)
        gain.gain.linearRampToValueAtTime(note.velocity / 127 * .15, Math.min(end, begin + .008))
        gain.gain.setValueAtTime(note.velocity / 127 * .15, Math.max(begin + .008, end - .015))
        gain.gain.linearRampToValueAtTime(0, Math.max(end, begin + .009))
        oscillator.connect(gain); gain.connect(master); attach(oscillator)
        oscillator.onended = () => { current.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect() }
        oscillator.start(begin); oscillator.stop(Math.max(end, begin + .01))
      }
      if (context.currentTime - lastUpdate >= .05 || time >= buffer.duration) {
        setPosition(Math.min(buffer.duration, time)); lastUpdate = context.currentTime
      }
      if (time >= buffer.duration) { stop(); master.disconnect(); limiter.disconnect() }
      else current.frame = requestAnimationFrame(schedule)
    }
    setPlaying(true); schedule()
  }
  return { playing, position, play, stop, seek, volume, setVolume }
}
