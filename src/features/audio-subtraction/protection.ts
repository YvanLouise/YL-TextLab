import type { AudioLevelComparison, AudioSubtractProtection } from './types'

export const MIN_PROTECTED_CORRELATION = 0.85

export function protectionWindowFrames(sampleFrames: number, sampleRate: number) {
  return Math.max(1, Math.round(sampleRate * .05), Math.ceil(sampleFrames / 16000))
}

export function planProtectedSubtraction(levels: AudioLevelComparison) {
  const matched = levels.a.points.map((a, index) => {
    const b = levels.b.points[index], c = levels.beforeProtection.points[index]
    const ea = a.rms ** 2, eb = b.rms ** 2, ec = c.rms ** 2
    // C = A - B gives the signed cross-energy without retaining decoded A/B buffers.
    const correlation = (ea + eb - ec) / (2 * Math.sqrt(ea * eb))
    return ea > 1e-12 && eb > 1e-12 && correlation >= MIN_PROTECTED_CORRELATION
      && ec <= ea * .98 && c.peak <= Math.max(1, a.peak) + 1e-6
  })
  let matchedFrames = 0, matchedWindows = 0
  const ranges: { start: number; end: number }[] = []
  for (let i = 0; i < matched.length; i++) {
    if (!matched[i]) continue
    const start = i * levels.framesPerPoint
    const end = Math.min(start + levels.framesPerPoint, levels.sampleFrames)
    matchedFrames += end - start; matchedWindows++
    const last = ranges.at(-1)
    if (last?.end === start) last.end = end
    else ranges.push({ start, end })
  }
  const summary: AudioSubtractProtection = {
    matchedWindows, totalWindows: matched.length, matchedSeconds: matchedFrames / levels.sampleRate,
    preservedSeconds: (levels.sampleFrames - matchedFrames) / levels.sampleRate,
    windowSeconds: levels.framesPerPoint / levels.sampleRate,
  }
  return { ranges, summary }
}

export function createProtectionEnvelope(ranges: { start: number; end: number }[], sampleFrames: number, sampleRate: number) {
  const blockFrames = 65536
  const zero = new Blob([new Float32Array(blockFrames).buffer])
  const one = new Blob([new Float32Array(blockFrames).fill(1).buffer])
  const parts: BlobPart[] = []
  const constant = (block: Blob, frames: number) => {
    // Reuse immutable Blob slices; do not allocate a full-track PCM control array.
    while (frames >= blockFrames) { parts.push(block); frames -= blockFrames }
    if (frames) parts.push(block.slice(0, frames * 4))
  }
  const ramp = (frames: number, rising: boolean) => {
    if (!frames) return
    const data = new Float32Array(frames)
    for (let i = 0; i < frames; i++) {
      const t = frames > 1 ? i / (frames - 1) : 0
      const gain = .5 - .5 * Math.cos(Math.PI * t)
      data[i] = rising ? gain : 1 - gain
    }
    parts.push(new Blob([data.buffer]))
  }
  let at = 0
  const fadeFrames = Math.max(1, Math.round(sampleRate * .005))
  for (const range of ranges) {
    constant(zero, range.start - at)
    const fade = Math.min(fadeFrames, Math.floor((range.end - range.start) / 2))
    const fadeIn = range.start > 0 ? fade : 0
    const fadeOut = range.end < sampleFrames ? fade : 0
    ramp(fadeIn, true)
    constant(one, range.end - range.start - fadeIn - fadeOut)
    ramp(fadeOut, false)
    at = range.end
  }
  constant(zero, sampleFrames - at)
  return new Blob(parts, { type: 'application/octet-stream' })
}
