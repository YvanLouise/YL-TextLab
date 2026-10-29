import { memo, useState } from 'react'
import { AudioLines, LocateFixed } from 'lucide-react'
import { formatPreciseTime } from '../audio-splitting/audio'
import { formatLevel } from './levels'
import type { AudioLevelComparison as Comparison, AudioLevelSeries } from './types'
import styles from './AudioLevelComparison.module.css'

type Metric = 'rms' | 'peak'
const floorDb = -72

const LevelTrace = memo(function LevelTrace({ series, metric, ceiling, framesPerPoint, sampleFrames }: {
  series: AudioLevelSeries; metric: Metric; ceiling: number; framesPerPoint: number; sampleFrames: number
}) {
  const points = series.points
  const y = (value: number) => 100 * (ceiling - Math.max(floorDb, value > 0 ? 20 * Math.log10(value) : floorDb)) / (ceiling - floorDb)
  const trace = points.map((p, i) => `${i ? 'L' : 'M'}${i * framesPerPoint / sampleFrames * 1000},${y(p[metric]).toFixed(3)} L${Math.min(sampleFrames, (i + 1) * framesPerPoint) / sampleFrames * 1000},${y(p[metric]).toFixed(3)}`).join(' ')
  return <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
    {[ceiling, -36, floorDb].map(db => <line key={db} x1="0" x2="1000" y1={100 * (ceiling - db) / (ceiling - floorDb)} y2={100 * (ceiling - db) / (ceiling - floorDb)} className={styles.grid} />)}
    <path d={`${trace} L1000,100 L0,100 Z`} fill="currentColor" fillOpacity=".09" />
    <path d={trace} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
  </svg>
})

export function AudioLevelComparison({ levels, outputGain, protectedMode, onSeek }: {
  levels: Comparison; outputGain: number; protectedMode: boolean; onSeek: (seconds: number) => void
}) {
  const [metric, setMetric] = useState<Metric>('rms')
  const [index, setIndex] = useState(0)
  const count = levels.a.points.length
  const selected = Math.min(index, count - 1)
  const duration = levels.sampleFrames / levels.sampleRate
  const start = selected * levels.framesPerPoint / levels.sampleRate
  const end = Math.min(duration, (selected + 1) * levels.framesPerPoint / levels.sampleRate)
  const series = [
    { key: 'a', name: 'A · 相减前', values: levels.a, style: styles.sourceA },
    { key: 'b', name: 'B · 抵消参考', values: levels.b, style: styles.sourceB },
    ...(outputGain < 1 ? [{ key: 'raw', name: 'C · 防削波前', values: levels.beforeProtection, style: styles.raw }] : []),
    { key: 'c', name: 'C · 最终输出', values: levels.c, style: styles.outputC },
  ]
  const maximum = Math.max(...series.map(s => s.values.peak), 1)
  const ceiling = Math.ceil(20 * Math.log10(maximum) / 6) * 6
  const a = levels.a.points[selected], b = levels.b.points[selected], c = levels.c.points[selected]
  const raw = levels.beforeProtection.points[selected]
  const detail = !protectedMode && a.peak === 0 && b.peak > 0
    ? '此窗口 A 静音、B 有声：严格相减会留下反相的 B，仍然听得见。'
    : !protectedMode && b.peak === 0 && a.peak > 0 && outputGain < 1
      ? '此窗口 B 静音：变化来自防削波的整体降音量，不是相减抵消。'
      : raw.peak === 0 && a.peak > 0 ? '此窗口的运算结果已完全抵消为静音。'
        : '对照同一时间窗的实际电平；RMS 表示平均能量，峰值表示最大采样幅度，不等同于感知响度 LUFS。'
  return <section className={styles.panel} aria-labelledby="subtract-levels-title">
    <header className={styles.header}><div><h3 id="subtract-levels-title"><AudioLines size={18} aria-hidden="true" />全段音量对照</h3>
      <p>共用时间轴和绝对 dBFS 刻度，不对各条曲线单独放大。</p></div>
      <label className={styles.metric}>显示指标<select aria-label="音量显示指标" value={metric} onChange={event => setMetric(event.target.value as Metric)}>
        <option value="rms">平均音量 RMS</option><option value="peak">采样峰值</option>
      </select></label>
    </header>
    {outputGain < 1 ? <p className={styles.gainNotice}>防削波使整段降低 <strong>{(-20 * Math.log10(outputGain)).toFixed(2)} dB</strong>，包括 B 静音的位置。橙色为降音量前，绿色为实际导出结果。</p> : null}
    <div className={styles.tracks}>
      {series.map(s => <div className={`${styles.track} ${s.style}`} key={s.key} data-level-track={s.key}>
        <div className={styles.trackHeading}><strong>{s.name}</strong><span>全段 RMS {formatLevel(s.values.rms)} · 峰值 {formatLevel(s.values.peak)}</span></div>
        <div className={styles.chart} role="img" aria-label={`${s.name}全段${metric === 'rms' ? 'RMS' : '峰值'}曲线，${formatLevel(s.values[metric])}`}>
          <div className={styles.axis} aria-hidden="true"><span>{ceiling}</span><span style={{ top: `${(ceiling + 36) / (ceiling - floorDb) * 100}%` }}>−36</span><span>≤ −72</span></div>
          <div className={styles.plot} onPointerDown={event => {
            const rect = event.currentTarget.getBoundingClientRect()
            setIndex(Math.max(0, Math.min(count - 1, Math.floor((event.clientX - rect.left) / rect.width * levels.sampleFrames / levels.framesPerPoint))))
          }}>
            <LevelTrace series={s.values} metric={metric} ceiling={ceiling} framesPerPoint={levels.framesPerPoint} sampleFrames={levels.sampleFrames} />
            <div className={styles.cursor} style={{ left: `${(start + end) / 2 / duration * 100}%` }} />
          </div>
        </div>
      </div>)}
    </div>
    <div className={styles.timeline} aria-hidden="true"><span>00:00</span><span>{formatPreciseTime(duration / 2)}</span><span>{formatPreciseTime(duration)}</span></div>
    <div className={styles.inspector}>
      <label htmlFor="subtract-level-position">查看位置 <span>{formatPreciseTime(start)} – {formatPreciseTime(end)}</span></label>
      <input id="subtract-level-position" aria-label="音量对照位置" type="range" min="0" max={count - 1} step="1" value={selected}
        aria-valuetext={`${formatPreciseTime(start)} 至 ${formatPreciseTime(end)}`} onChange={event => setIndex(Number(event.target.value))} />
      <div className={styles.readings} aria-live="polite">
        {[{ name: 'A', point: a }, { name: 'B', point: b }, { name: 'C', point: c }].map(s => <span key={s.name}><strong>{s.name}</strong> {formatLevel(s.point[metric])}</span>)}
      </div>
      <p>{detail}</p>
      <button type="button" className="button button-small" onClick={() => onSeek(start)}><LocateFixed size={15} aria-hidden="true" />将 A / C 试听定位到此处</button>
    </div>
    <p className={styles.note}>B 显示应用偏移与音量后的参考电平，仅展示 A 的时间范围；保护模式不会在每处都消减 B。图底代表 ≤ −72 dBFS，精确数值仍显示在读数中，−∞ 才表示完全静音。每窗约 {(levels.framesPerPoint / levels.sampleRate * 1000).toFixed(1)} ms。</p>
  </section>
}
