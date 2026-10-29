import { fft } from '../../utils/fft'

export interface AlignmentWindow {
  a: Float32Array
  b: Float32Array
  channels: number
  sampleRate: number
  baseOffset: number
  minLag: number
  maxLag: number
}
export interface AlignmentMatch {
  offsetSamples: number
  correlation: number
  signedGain: number
  prominence: number
  energyA: number
  energyB: number
}
export interface AlignmentProcessor {
  compare(window: AlignmentWindow): Promise<AlignmentMatch>
  dispose(): void
}

export function correlateWindow(window: AlignmentWindow): AlignmentMatch {
  const { a, b, channels, sampleRate, baseOffset } = window
  const length = a.length / channels, bLength = b.length / channels
  const minLag = Math.max(0, Math.ceil(window.minLag)), maxLag = Math.min(Math.floor(window.maxLag), bLength - length)
  if (![1, 2].includes(channels) || !Number.isInteger(length) || !Number.isInteger(bLength)
    || length < 32 || maxLag < minLag || ![sampleRate, baseOffset, minLag, maxLag].every(Number.isFinite)) throw new Error('可重叠的分析片段太短，无法自动对齐。')
  let size = 1
  while (size < length + bLength - 1) size *= 2
  if (size > 1048576) throw new Error('分析片段超出内存限制。')
  const ar = new Float64Array(size), ai = new Float64Array(size), br = new Float64Array(size), bi = new Float64Array(size)
  const count = maxLag - minLag + 1
  const dots = new Float64Array(count), energyB = new Float64Array(count)
  let energyA = 0
  for (let channel = 0; channel < channels; channel++) {
    ar.fill(0); ai.fill(0); br.fill(0); bi.fill(0)
    let mean = 0
    for (let i = 0; i < length; i++) mean += a[i * channels + channel]
    mean /= length
    for (let i = 0; i < length; i++) {
      const value = a[i * channels + channel] - mean
      ar[length - 1 - i] = value; energyA += value * value
    }
    const sums = new Float64Array(bLength + 1), squares = new Float64Array(bLength + 1)
    for (let i = 0; i < bLength; i++) {
      const value = b[i * channels + channel]
      if (!Number.isFinite(value)) throw new Error('音频包含无效采样，无法自动匹配。')
      br[i] = value; sums[i + 1] = sums[i] + value; squares[i + 1] = squares[i] + value * value
    }
    fft(ar, ai); fft(br, bi)
    for (let i = 0; i < size; i++) {
      const real = ar[i] * br[i] - ai[i] * bi[i]
      ai[i] = -(ar[i] * bi[i] + ai[i] * br[i]); ar[i] = real
    }
    fft(ar, ai)
    for (let lag = minLag; lag <= maxLag; lag++) {
      const sum = sums[lag + length] - sums[lag]
      dots[lag - minLag] += ar[lag + length - 1] / size
      energyB[lag - minLag] += Math.max(0, squares[lag + length] - squares[lag] - sum * sum / length)
    }
  }
  if (!Number.isFinite(energyA)) throw new Error('音频包含无效采样，无法自动匹配。')
  const scores = new Float64Array(count)
  let best = 0
  for (let i = 0; i < count; i++) {
    scores[i] = energyA > length * channels * 1e-10 && energyB[i] > length * channels * 1e-10
      ? Math.min(1, Math.abs(dots[i]) / Math.sqrt(energyA * energyB[i])) : 0
    if (scores[i] > scores[best] + 1e-12) best = i
  }
  let alternative = 0
  const exclusion = Math.max(2, Math.round(sampleRate * .03))
  for (let i = 0; i < count; i++) if (Math.abs(i - best) > exclusion) alternative = Math.max(alternative, scores[i])
  return { offsetSamples: baseOffset - (best + minLag), correlation: scores[best],
    signedGain: energyB[best] > 0 ? dots[best] / energyB[best] : 0,
    prominence: scores[best] - alternative, energyA, energyB: energyB[best] }
}

export function consistentMatches<T extends AlignmentMatch>(matches: T[], tolerance: number): T[] {
  let best: T[] = []
  for (const match of matches) {
    const cluster = matches.filter(other => Math.abs(other.offsetSamples - match.offsetSamples) <= tolerance
      && Math.sign(other.signedGain) === Math.sign(match.signedGain))
    if (cluster.length > best.length || (cluster.length === best.length && cluster.reduce((sum, item) => sum + item.correlation, 0) > best.reduce((sum, item) => sum + item.correlation, 0))) best = cluster
  }
  return best
}
