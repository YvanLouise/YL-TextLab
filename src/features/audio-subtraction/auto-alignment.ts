import { AudioConversionError } from '../audio-conversion/types'
import { consistentMatches, type AlignmentMatch, type AlignmentProcessor, type AlignmentWindow } from './alignment'
import type { AudioAlignmentResult, AudioSubtractInfo, AudioSubtractOptions } from './types'

export type ReadAlignmentAudio = (input: 0 | 1, start: number, duration: number, rate: number) => Promise<Float32Array>
interface Candidate extends AlignmentMatch { start: number; length: number }
const uncertain = (message: string) => new AudioConversionError('ALIGNMENT_UNCERTAIN', `${message}未自动消减，请缩小搜索范围、调整搜索中心，或切回手动相减。`)

export async function autoAlignAudio(infos: [AudioSubtractInfo, AudioSubtractInfo], options: AudioSubtractOptions,
  read: ReadAlignmentAudio, processor: AlignmentProcessor, checkCancelled: () => void, progress: (percent: number) => void): Promise<AudioAlignmentResult> {
  const [a, b] = infos
  if (!a.duration || !b.duration || Math.min(a.duration, b.duration) < .5) throw uncertain('自动匹配需要能读取时长且至少 0.5 秒的音频。')
  const coarseRate = 4000
  const radius = (options.searchRadiusMs ?? 3000) / 1000
  const center = options.offsetMs / 1000
  const minOffset = Math.max(-60, center - radius), maxOffset = Math.min(60, center + radius)
  const length = Math.min(3, Math.min(a.duration, b.duration) / 4)
  const starts = [.15, .5, .85].map(fraction => Math.round((a.duration! - length) * fraction * coarseRate) / coarseRate)
  const candidates: Candidate[] = []
  let analyzedWindows = 0

  async function compare(start: number, windowLength: number, bStart: number, bEnd: number, rate: number): Promise<AlignmentMatch | null> {
    if (bEnd - bStart < windowLength - 1 / rate) return null
    const audioA = await read(0, start, windowLength, rate)
    checkCancelled()
    const audioB = await read(1, bStart, bEnd - bStart, rate)
    checkCancelled()
    const baseOffset = Math.round((start - bStart) * rate)
    const window: AlignmentWindow = { a: audioA, b: audioB, channels: a.channels, sampleRate: rate, baseOffset,
      minLag: Math.max(0, Math.ceil(baseOffset - maxOffset * rate)),
      maxLag: Math.min(audioB.length / a.channels - audioA.length / a.channels, Math.floor(baseOffset - minOffset * rate)) }
    if (window.maxLag < window.minLag || audioA.length / a.channels < 32) return null
    const match = await processor.compare(window)
    checkCancelled()
    return match
  }

  for (const [index, start] of starts.entries()) {
    progress(Math.round(index / 3 * 45))
    const bStart = Math.max(0, Math.floor((start - maxOffset) * coarseRate) / coarseRate)
    const bEnd = Math.min(b.duration, Math.ceil((start + length - minOffset) * coarseRate) / coarseRate)
    const match = await compare(start, length, bStart, bEnd, coarseRate)
    if (match) {
      analyzedWindows++
      if (match.correlation >= .45 && match.prominence >= .015) candidates.push({ ...match, start, length })
    }
  }
  if (!candidates.length) throw uncertain('未找到可信的相似波形，可能是静音、内容不同、超出范围或周期性过强。')
  const consistent = consistentMatches(candidates, 8)
  if (consistent.length < Math.min(2, candidates.length) || (consistent.length === 1 && consistent[0].correlation < .8)) {
    throw uncertain('不同位置的最佳偏移不一致，可能存在变速、剪辑或时间漂移。')
  }
  const coarse = [...consistent].sort((left, right) => right.correlation - left.correlation)[0]
  const coarseOffset = Math.round(coarse.offsetSamples / coarseRate * a.sampleRate)
  const fineRadius = Math.ceil(a.sampleRate * .002)
  const refined: Candidate[] = []
  for (const [index, candidate] of consistent.entries()) {
    progress(45 + Math.round(index / consistent.length * 50))
    const fineLength = Math.floor(Math.min(.75, candidate.length) * a.sampleRate) / a.sampleRate
    const startSample = Math.round((candidate.start + (candidate.length - fineLength) / 2) * a.sampleRate)
    const start = startSample / a.sampleRate
    const bStart = Math.max(0, startSample - coarseOffset - fineRadius) / a.sampleRate
    const bEnd = Math.min(b.duration, (startSample - coarseOffset + fineRadius) / a.sampleRate + fineLength)
    const match = await compare(start, fineLength, bStart, bEnd, a.sampleRate)
    if (match && match.correlation >= .45) refined.push({ ...match, start, length: fineLength })
  }
  const stable = consistentMatches(refined, Math.max(2, Math.round(a.sampleRate * .0002)))
  if (!stable.length || stable.length < Math.min(2, consistent.length)) throw uncertain('采样级复核未通过，波形差异或时间漂移过大。')
  const best = [...stable].sort((left, right) => right.correlation - left.correlation)[0]
  const gains = stable.map(item => Math.abs(item.signedGain)).sort((left, right) => left - right)
  const gainB = gains[Math.floor(gains.length / 2)]
  if (!Number.isFinite(gainB) || gainB <= 0 || gainB > 2) throw uncertain('估计音量比例超出 0–200% 范围，无法安全应用。')
  const correlation = stable.reduce((sum, match) => sum + match.correlation, 0) / stable.length
  const warnings: string[] = []
  if (gains[gains.length - 1] / Math.max(.001, gains[0]) > 1.35) warnings.push('不同片段的音量比例差异较大，使用中位比例；部分位置可能仍有残留。')
  if (stable.length < 2) warnings.push('仅一个取样片段匹配可靠，请重点试听其他位置。')
  if (correlation < .8) warnings.push('波形相关性一般，自动匹配只能部分消减，建议降低消减强度并对照试听。')
  if (Math.abs(best.offsetSamples / a.sampleRate - minOffset) < .002 || Math.abs(best.offsetSamples / a.sampleRate - maxOffset) < .002) warnings.push('最佳偏移接近搜索边界，可扩大范围再比较。')
  progress(100)
  return { offsetSamples: best.offsetSamples, gainB, appliedGainB: gainB * (options.reductionStrength ?? 1),
    invertB: best.signedGain < 0, correlation,
    confidence: correlation >= .8 && stable.length >= 2 && warnings.length === 0 ? 'high' : 'medium',
    matchedWindows: stable.length, analyzedWindows, warnings }
}
