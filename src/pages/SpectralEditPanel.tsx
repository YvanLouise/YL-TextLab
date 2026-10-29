import { Download, Eraser, Play, Redo2, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { MAX_SPECTRAL_REGIONS, validateRegions, type SpectralRegion } from '../features/spectral-edit/types'
import type { useSpectralEdits } from '../features/spectral-edit/useSpectralEdits'
import styles from './AudioMidiPage.module.css'

function RegionForm({ region, duration, onCommit }: { region?: SpectralRegion; duration: number; onCommit: (region: SpectralRegion) => void }) {
  const [start, setStart] = useState(String(Number((region?.start ?? 0).toFixed(3))))
  const [end, setEnd] = useState(String(Number((region?.end ?? Math.min(duration, 1)).toFixed(3))))
  const [low, setLow] = useState(String(Number((region?.lowHz ?? 350).toFixed(1))))
  const [high, setHigh] = useState(String(Number((region?.highHz ?? 550).toFixed(1))))
  const [error, setError] = useState('')
  return <form onSubmit={event => {
    event.preventDefault()
    try {
      if (![start, end, low, high].every(value => value.trim())) throw new Error('请填写完整的时间和频率范围。')
      const next = { id: region?.id ?? crypto.randomUUID(), start: Number(start), end: Number(end), lowHz: Number(low), highHz: Number(high) }
      validateRegions([next], duration)
      setError(''); onCommit(next)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '区域参数无效。') }
  }}>
    <div className={styles.noteFields}>
      <label>起点（秒）<input aria-label="去除起点" type="number" min="0" max={duration} step="0.001" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>终点（秒）<input aria-label="去除终点" type="number" min="0" max={duration} step="0.001" value={end} onChange={event => setEnd(event.target.value)} /></label>
      <label>最低频率（Hz）<input aria-label="去除最低频率" type="number" min="0" max="192000" step="0.1" value={low} onChange={event => setLow(event.target.value)} /></label>
      <label>最高频率（Hz）<input aria-label="去除最高频率" type="number" min="0" max="192000" step="0.1" value={high} onChange={event => setHigh(event.target.value)} /></label>
    </div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <button className="button button-small" type="submit">{region ? '应用区域修改' : '添加去除区域'}</button>
  </form>
}

export function SpectralEditPanel({ editor, duration, disabled, fileName, onRun }: {
  editor: ReturnType<typeof useSpectralEdits>; duration: number; disabled: boolean; fileName: string; onRun: () => void
}) {
  const selected = editor.regions.find(region => region.id === editor.selected)
  return <section className={`${styles.panel} ${styles.spectralPanel}`} aria-labelledby="spectral-edit-title">
    <header><h2 id="spectral-edit-title"><Eraser size={18} />手动频谱去除</h2><span className={styles.count}>{editor.regions.length} / {MAX_SPECTRAL_REGIONS} 区域</span></header>
    <p className={styles.muted}>在画布中拖出红框，选中要去除的时间与频率；或在下方输入数值。画布显示 A0–C8（约 27–4307 Hz），其他频段可用数值指定；实际频率上限由原音频采样率决定。</p>
    <fieldset disabled={disabled || editor.busy} className={styles.spectralFields}>
      <label className={styles.noteChoice}>当前区域<select aria-label="选择去除区域" value={selected?.id ?? ''} onChange={event => editor.setSelected(event.target.value || null)}>
        <option value="">新增区域</option>{editor.regions.map((region, index) => <option key={region.id} value={region.id}>{index + 1}. {region.start.toFixed(2)}–{region.end.toFixed(2)}s · {Math.round(region.lowHz)}–{Math.round(region.highHz)} Hz</option>)}
      </select></label>
      <RegionForm key={selected ? JSON.stringify(selected) : `new-${editor.regions.length}`} region={selected} duration={duration} onCommit={editor.commit} />
      <div className={styles.inlineActions}>
        <button className="button button-small" disabled={!editor.canUndo} onClick={editor.undo}><Undo2 size={15} />撤销去除区域</button>
        <button className="button button-small" disabled={!editor.canRedo} onClick={editor.redo}><Redo2 size={15} />重做去除区域</button>
        <button className="button button-small" disabled={!selected} onClick={() => editor.remove()}><Trash2 size={15} />删除选中区域</button>
        <button className="button button-small" disabled={!editor.regions.length} onClick={() => { editor.change([]); editor.setSelected(null) }}>清空去除区域</button>
      </div>
    </fieldset>
    <div className={styles.spectralActions}>
      <button className="button button-primary" disabled={disabled || editor.busy || !editor.regions.length} onClick={onRun}><Play size={16} />{editor.result ? '重新生成处理音频' : '生成处理音频'}</button>
      {editor.busy ? <button className="button" onClick={editor.cancel}>停止频谱处理</button> : null}
      {editor.result ? <a className="button" href={editor.result.url} download={fileName}><Download size={16} />下载去除后 WAV</a> : null}
    </div>
    <p className={styles.muted} role="status" aria-label="频谱去除状态" aria-live="polite">{editor.notice}</p>
    {editor.busy ? <progress max="100" value={editor.progress ?? undefined} aria-label="频谱去除进度" /> : null}
    {editor.error ? <p role="alert" className={styles.error}>{editor.error}</p> : null}
    {editor.result ? <><p className={styles.muted}>已输出 {editor.result.sampleRate / 1000} kHz · {editor.result.channels === 1 ? '单声道' : '立体声'} · 32 位浮点 WAV · {(editor.result.blob.size / 1048576).toFixed(2)} MB。去除区域外的时间保持原解码采样，不改变时长。</p>
      <ul className={styles.muted}>{editor.result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></> : null}
    <p className={styles.muted}>去除会影响选区内所有叠加的声音，不会只识别某种乐器；边界有平滑过渡。始终从原文件重新计算，不覆盖原文件。MIDI 工程只保存音符，不包含去除区域；离开前请下载处理后的 WAV。</p>
  </section>
}
