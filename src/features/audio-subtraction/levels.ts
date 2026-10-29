import type { AudioLevelPoint, AudioLevelSeries, AudioSubtractInfo, AudioSubtractOptions } from './types'

export const MAX_LEVEL_POINTS = 800

export function levelWindowFrames(sampleFrames: number) {
  return Math.max(1, Math.ceil(sampleFrames / MAX_LEVEL_POINTS))
}

export function summarizeLevels(points: AudioLevelPoint[], sampleFrames: number, framesPerPoint: number): AudioLevelSeries {
  let peak = 0, energy = 0
  for (let i = 0; i < points.length; i++) {
    const frames = Math.min(framesPerPoint, sampleFrames - i * framesPerPoint)
    peak = Math.max(peak, points[i].peak)
    energy += points[i].rms ** 2 * frames
  }
  return { points, peak, rms: Math.sqrt(energy / sampleFrames) }
}

export function formatLevel(value: number) {
  return value === 0 ? '−∞ dBFS（静音）' : `${(20 * Math.log10(value)).toFixed(2)} dBFS`
}

export function compactLevels(series: AudioLevelSeries, sampleFrames: number, framesPerPoint: number, group: number): AudioLevelSeries {
  if (group === 1) return series
  const points: AudioLevelPoint[] = []
  for (let start = 0; start < series.points.length; start += group) {
    let peak = 0, energy = 0, count = 0
    for (let i = start; i < Math.min(start + group, series.points.length); i++) {
      const frames = Math.min(framesPerPoint, sampleFrames - i * framesPerPoint)
      peak = Math.max(peak, series.points[i].peak)
      energy += series.points[i].rms ** 2 * frames; count += frames
    }
    points.push({ peak, rms: Math.sqrt(energy / count) })
  }
  return { points, peak: series.peak, rms: series.rms }
}

export function parseLevelMetadata(text: string, sampleFrames: number, framesPerPoint: number): AudioLevelSeries {
  const points: AudioLevelPoint[] = []
  let peak: number | undefined, rms: number | undefined, frames = 0, totalFrames = 0
  const amplitude = (value: string) => value === '-inf' ? 0 : 10 ** (Number(value) / 20)
  const finish = () => {
    if (peak === undefined && rms === undefined && frames === 0) return
    const expected = Math.min(framesPerPoint, sampleFrames - totalFrames)
    if (peak === undefined || rms === undefined || !Number.isFinite(peak) || !Number.isFinite(rms)
      || expected <= 0 || frames !== expected) throw new Error('Incomplete audio level metadata')
    points.push({ peak, rms }); totalFrames += frames
    peak = undefined; rms = undefined; frames = 0
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('frame:')) finish()
    else if (line.startsWith('lavfi.astats.Overall.Peak_level=')) peak = amplitude(line.split('=')[1])
    else if (line.startsWith('lavfi.astats.Overall.RMS_level=')) rms = amplitude(line.split('=')[1])
    else if (line.startsWith('lavfi.astats.Overall.Number_of_samples=')) frames = Number(line.split('=')[1])
  }
  finish()
  if (totalFrames !== sampleFrames || points.length !== Math.ceil(sampleFrames / framesPerPoint)) {
    throw new Error('Incomplete audio level timeline')
  }
  return summarizeLevels(points, sampleFrames, framesPerPoint)
}

export function buildLevelCommand(inputs: string[], files: string[], info: AudioSubtractInfo,
  options: AudioSubtractOptions, sampleFrames: number, framesPerPoint: number) {
  const layout = info.channels === 1 ? 'mono' : 'stereo'
  const format = `aformat=sample_fmts=flt:sample_rates=${info.sampleRate}:channel_layouts=${layout}`
  const offset = Math.round(options.offsetMs * info.sampleRate / 1000)
  const shift = offset < 0 ? `atrim=start_sample=${-offset},asetpts=N/SR/TB`
    : offset > 0 ? `adelay=${offset}S:all=1` : 'anull'
  const meter = (file: string) => `atrim=end_sample=${sampleFrames},asetnsamples=n=${framesPerPoint}:p=0,`
    + 'astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=Peak_level+RMS_level+Number_of_samples,'
    + `ametadata=mode=print:file=${file}`
  // B's silence padding is bounded by the actual decoded length of A, not container duration.
  const graph = `[0:a:0]${format},asetpts=N/SR/TB,${meter(files[0])}[a];`
    + `[1:a:0]aresample=${info.sampleRate}:async=0,${format},asetpts=N/SR/TB,apad,${shift},`
    + `volume=${options.gainB}:precision=float,${meter(files[1])}[b]`
  return ['-y', '-i', inputs[0], '-i', inputs[1], '-filter_complex', graph,
    '-map', '[a]', '-map', '[b]', '-f', 'null', '-']
}
