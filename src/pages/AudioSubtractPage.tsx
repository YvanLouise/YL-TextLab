import { ArrowRightLeft, AudioLines, Check, Download, Info, Minus, Play, RotateCcw, ScanLine, ShieldCheck, Square, Trash2, UploadCloud } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject, type SyntheticEvent } from 'react'
import { Link } from 'react-router-dom'
import { ToolHeader } from '../components/SiteHeader'
import { AudioToolNav } from '../components/AudioToolNav'
import { useAudioLeaveWarning } from '../features/audio-shared/useAudioLeaveWarning'
import { pauseAudioPreviews } from '../features/audio-shared/media'
import { AUDIO_ACCEPT, describeAudioError, inspectAudioFile } from '../features/audio-conversion/audio'
import { AUDIO_FILE_SIZE_LIMIT_LABEL } from '../features/audio-conversion/types'
import { formatPreciseTime } from '../features/audio-splitting/audio'
import { subtractFileName } from '../features/audio-subtraction/audio'
import { AudioLevelComparison } from '../features/audio-subtraction/AudioLevelComparison'
import { AudioDuplicateNotice } from '../features/audio-subtraction/AudioDuplicateNotice'
import { DEFAULT_SUBTRACT_OPTIONS, type AudioSubtractEngine, type AudioSubtractEngineFactory, type AudioSubtractProgress, type AudioSubtractResult, type AudioSubtractSource } from '../features/audio-subtraction/types'
import styles from './AudioSubtractPage.module.css'

interface Source extends AudioSubtractSource { url: string }
type Slot = 'a' | 'b'

const defaultEngineFactory: AudioSubtractEngineFactory = async () => {
  const { createFfmpegAudioSubtractEngine } = await import('../features/audio-subtraction/runtime')
  return createFfmpegAudioSubtractEngine()
}

function bytesLabel(size: number) { return size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(2)} MB` }

function playOne(event: SyntheticEvent<HTMLAudioElement>) {
  pauseAudioPreviews(event.currentTarget)
}

function SourceCard({ slot, source, disabled, loading, error, onSelect, onRemove, onError, audioRef }: {
  slot: Slot; source: Source | null; disabled: boolean; loading: boolean; error: string
  onSelect: (file: File) => void; onRemove: () => void; onError: (message: string) => void
  audioRef?: RefObject<HTMLAudioElement | null>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const letter = slot.toUpperCase()
  return (
    <section className={`${styles.source} ${dragging ? styles.dragging : ''}`} aria-labelledby={`source-${slot}-title`}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={event => {
        event.preventDefault(); setDragging(false)
        if (disabled) return
        if (event.dataTransfer.files.length !== 1) { onError(`请为音频 ${letter} 选择一个文件。`); return }
        setPreviewError(null); onSelect(event.dataTransfer.files[0])
      }}>
      <header><span className={`${styles.letter} ${slot === 'b' ? styles.letterB : ''}`}>{letter}</span>
        <div><h2 id={`source-${slot}-title`}>音频 {letter}</h2><p>{slot === 'a' ? '包含全部声音的原音频' : '希望从 A 中抵消的音频'}</p></div>
        {source ? <button className={styles.iconButton} disabled={disabled} aria-label={`移除音频 ${letter}`} onClick={onRemove}><Trash2 size={17} /></button> : null}
      </header>
      <input ref={input} type="file" accept={AUDIO_ACCEPT} hidden disabled={disabled} aria-label={`选择音频 ${letter} 文件`}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { setPreviewError(null); onSelect(file) } }} />
      {source ? <div className={styles.sourceFile}>
        <strong title={source.file.name}>{source.file.name}</strong>
        <span>{source.format.toUpperCase()} · {bytesLabel(source.file.size)}</span>
        <audio ref={audioRef} key={source.url} controls preload="metadata" src={source.url} aria-label={`音频 ${letter} 试听`} onPlay={playOne} onError={() => setPreviewError(source.url)} />
        {previewError === source.url ? <small>浏览器暂不能直接试听此格式，仍可尝试本地处理。</small> : null}
      </div> : <div className={styles.dropHint}><UploadCloud size={28} aria-hidden="true" /><p>拖入音频，或选择本机文件</p><small>支持 WAV、FLAC、MP3、M4A 等格式</small></div>}
      <button className="button" disabled={disabled || loading} onClick={() => input.current?.click()}>
        <UploadCloud size={17} aria-hidden="true" />{loading ? '正在读取…' : `${source ? '替换' : '选择'}音频 ${letter}`}
      </button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  )
}

export function AudioSubtractPage({ engineFactory = defaultEngineFactory }: { engineFactory?: AudioSubtractEngineFactory }) {
  const [sources, setSources] = useState<Record<Slot, Source | null>>({ a: null, b: null })
  useAudioLeaveWarning(!!sources.a || !!sources.b)
  const [loading, setLoading] = useState({ a: false, b: false })
  const [errors, setErrors] = useState({ a: '', b: '' })
  const [gain, setGain] = useState('100')
  const [offset, setOffset] = useState('0')
  const [autoAlign, setAutoAlign] = useState(false)
  const [searchRadius, setSearchRadius] = useState(3000)
  const [strength, setStrength] = useState(100)
  const [invertB, setInvertB] = useState(false)
  const [preventClipping, setPreventClipping] = useState(DEFAULT_SUBTRACT_OPTIONS.preventClipping)
  const [protectUnmatched, setProtectUnmatched] = useState(false)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<AudioSubtractProgress | null>(null)
  const [notice, setNotice] = useState('选择音频 A 和 B 后，即可生成相减结果。')
  const [error, setError] = useState('')
  const [result, setResult] = useState<(AudioSubtractResult & { url: string }) | null>(null)
  const engineRef = useRef<AudioSubtractEngine | null>(null)
  const sourceRef = useRef(sources)
  const urls = useRef(new Set<string>())
  const resultUrl = useRef<string | null>(null)
  const operation = useRef({ id: 0 })
  const imports = useRef({ a: 0, b: 0 })
  const busyRef = useRef(false)
  const sourceAudioRef = useRef<HTMLAudioElement>(null)
  const resultAudioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const allocatedUrls = urls.current
    const currentImports = imports.current
    const currentOperation = operation.current
    return () => {
      currentOperation.id++
      currentImports.a++; currentImports.b++
      engineRef.current?.dispose()
      allocatedUrls.forEach(url => URL.revokeObjectURL(url))
      allocatedUrls.clear()
    }
  }, [])

  function release(url: string | null) {
    if (url && urls.current.delete(url)) URL.revokeObjectURL(url)
  }
  function allocate(blob: Blob) {
    const url = URL.createObjectURL(blob)
    urls.current.add(url)
    return url
  }
  function invalidate() {
    release(resultUrl.current); resultUrl.current = null
    setResult(null); setError(''); setProgress(null)
    setNotice('输入或设置已更新，点击生成音频 C。')
  }
  function replaceSource(slot: Slot, source: Source | null) {
    release(sourceRef.current[slot]?.url ?? null)
    const next = { ...sourceRef.current, [slot]: source }
    sourceRef.current = next; setSources(next)
  }
  async function selectSource(slot: Slot, file: File) {
    if (busyRef.current) return
    const token = ++imports.current[slot]
    invalidate(); setErrors(previous => ({ ...previous, [slot]: '' }))
    setLoading(previous => ({ ...previous, [slot]: true }))
    try {
      const format = await inspectAudioFile(file)
      if (token !== imports.current[slot]) return
      replaceSource(slot, { file, format, url: allocate(file) })
      setNotice(`音频 ${slot.toUpperCase()} 已添加。${sourceRef.current.a && sourceRef.current.b ? '可以生成音频 C。' : '请继续选择另一段音频。'}`)
    } catch (failure) {
      if (token === imports.current[slot]) setErrors(previous => ({ ...previous, [slot]: describeAudioError(failure) }))
    } finally {
      if (token === imports.current[slot]) setLoading(previous => ({ ...previous, [slot]: false }))
    }
  }
  function removeSource(slot: Slot) {
    imports.current[slot]++
    invalidate(); replaceSource(slot, null)
    if (!sourceRef.current.a && !sourceRef.current.b) { engineRef.current?.dispose(); engineRef.current = null }
    setLoading(previous => ({ ...previous, [slot]: false }))
    setErrors(previous => ({ ...previous, [slot]: '' }))
  }
  function stop() {
    operation.current.id++
    engineRef.current?.dispose(); engineRef.current = null
    busyRef.current = false; setBusy(false); setProgress(null)
    setNotice('处理已停止，源文件已保留，可重新生成。')
  }

  const gainError = gain.trim() === '' || !Number.isFinite(Number(gain)) || Number(gain) < 0 || Number(gain) > 200
  const offsetError = offset.trim() === '' || !Number.isFinite(Number(offset)) || Math.abs(Number(offset)) > 60000
  const suggestedName = sources.a && sources.b ? subtractFileName(sources.a.file.name, sources.b.file.name) : 'audio_C.wav'
  const ready = !!sources.a && !!sources.b && !loading.a && !loading.b && (autoAlign || !gainError) && !offsetError

  async function run() {
    if (!ready || busyRef.current || !sources.a || !sources.b) return
    const token = ++operation.current.id
    invalidate(); busyRef.current = true; setBusy(true)
    setNotice('正在初始化本地音频引擎，首次使用需加载约 31 MB。')
    pauseAudioPreviews()
    try {
      if (!engineRef.current) {
        const engine = await engineFactory()
        if (operation.current.id !== token) { engine.dispose(); return }
        engineRef.current = engine
      }
      const engine = engineRef.current
      await engine.load()
      if (operation.current.id !== token) return
      const output = await engine.subtract({ a: sources.a, b: sources.b,
        options: { gainB: autoAlign ? 1 : Number(gain) / 100, offsetMs: Number(offset), preventClipping: !protectUnmatched && preventClipping,
          ...(protectUnmatched ? { protectUnmatched: true } : {}),
          ...(autoAlign ? { autoAlign: true, searchRadiusMs: searchRadius, reductionStrength: strength / 100 } : invertB ? { invertB: true } : {}) }, fileName: fileName.trim() || suggestedName }, value => {
        if (operation.current.id !== token) return
        setProgress(value)
        setNotice(value.stage === 'analyzing' ? '正在检查音轨、采样率和声道…'
          : value.stage === 'matching' ? '正在匹配相似波形，校准时间、音量与极性…'
          : value.stage === 'measuring' ? (protectUnmatched ? '正在分析全段局部波形，筛选可靠匹配片段…' : '正在测量 A、B、C 的全段音量…')
          : value.stage === 'subtracting' ? (protectUnmatched ? '正在计算相减并保护未匹配片段…' : '正在计算 A − B…') : '正在检查峰值并生成音频 C…')
      })
      if (operation.current.id !== token) return
      const url = allocate(output.blob)
      resultUrl.current = url; setResult({ ...output, url })
      setNotice('音频 C 已生成，可以试听和下载。')
    } catch (failure) {
      if (operation.current.id === token) { setError(describeAudioError(failure)); setNotice('处理未完成，请检查文件或设置后重试。') }
    } finally {
      if (operation.current.id === token) { busyRef.current = false; setBusy(false); setProgress(null) }
    }
  }

  return (
    <div className={styles.page}>
      <ToolHeader toolName="本地音频相减工具" showMobileTheme />
      <main className={`page-shell ${styles.main}`}>
        <header className={styles.heading}><span className={styles.headingIcon}><AudioLines aria-hidden="true" /></span>
          <div><h1>音频相减</h1><p>手动相减，或先自动对齐相似波形再消减。</p></div>
          <span className={styles.privateBadge}><ShieldCheck size={16} aria-hidden="true" /> 全程本地处理</span>
        </header>
        <AudioToolNav />
        <div className={styles.explanation}><Info size={19} aria-hidden="true" /><p><strong>相减不等于识别并删除某种声音。</strong> 严格 A−B 中，A 静音而 B 有声时会留下反相的 B，仍然听得见。请选择同源素材，或使用“仅消减可靠匹配片段”保护模式；它按波形判断，不识别人声、对白等语义。<Link to="/help#audio-subtract">了解使用条件</Link></p></div>
        <div className={styles.sourceGrid}>
          {(['a', 'b'] as const).map(slot => <SourceCard key={slot} slot={slot} source={sources[slot]} disabled={busy}
            loading={loading[slot]} error={errors[slot]} audioRef={slot === 'a' ? sourceAudioRef : undefined} onSelect={file => void selectSource(slot, file)}
            onRemove={() => removeSource(slot)} onError={message => setErrors(previous => ({ ...previous, [slot]: message }))} />)}
        </div>
        {sources.a && sources.b && sources.a.file.size === sources.b.file.size
          ? <AudioDuplicateNotice key={`${sources.a.url}:${sources.b.url}`} a={sources.a.file} b={sources.b.file} className={styles.selectionNotice} /> : null}
        <div className={styles.sourceActions}>
          <span className={styles.formula}>{protectUnmatched ? '仅匹配片段消减 · 其余保留 A' : autoAlign ? 'C = A − 自动匹配后的 B' : `C = A − ${invertB ? '(−B)' : 'B'} × ${gainError ? '…' : `${Number(gain)}%`}`}</span>
          <button className="button button-small" disabled={busy || loading.a || loading.b || (!sources.a && !sources.b)} onClick={() => {
            invalidate(); const next = { a: sourceRef.current.b, b: sourceRef.current.a }; sourceRef.current = next; setSources(next); setErrors({ a: '', b: '' })
          }}><ArrowRightLeft size={16} aria-hidden="true" />交换 A / B</button>
          <button className="button button-small" disabled={busy || (!sources.a && !sources.b && !loading.a && !loading.b)} onClick={() => {
            removeSource('a'); removeSource('b'); setNotice('已清空音频和结果。')
          }}><Trash2 size={16} aria-hidden="true" />清空</button>
        </div>
        <div className={styles.workspace}>
          <section className={styles.settings} aria-labelledby="subtract-settings-title">
            <h2 id="subtract-settings-title">相减设置</h2>
            <fieldset disabled={busy}>
              <label htmlFor="subtract-mode">处理模式</label>
              <select className={styles.select} id="subtract-mode" value={protectUnmatched ? 'protected' : 'strict'}
                aria-describedby="subtract-mode-help" onChange={event => { invalidate(); setProtectUnmatched(event.target.value === 'protected') }}>
                <option value="strict">严格 A−B · 逐采样相减</option>
                <option value="protected">仅消减可靠匹配片段</option>
              </select>
              <p id="subtract-mode-help" className={styles.help}>{protectUnmatched
                ? '仅消减局部高度相关且能量下降的片段；B 独有、低相关或可能新增过载的位置保留 A。保守匹配可能漏掉较弱的共同声音。'
                : '适合 A 确实包含 B 的同源素材。不会判断某种声音是否存在；B 独有部分也会进入结果。'}</p>
              <div className={`${styles.autoSettings} ${autoAlign ? styles.autoActive : ''}`}>
                <label className={styles.autoToggle}><input type="checkbox" checked={autoAlign} aria-describedby="subtract-auto-help"
                  onChange={event => { invalidate(); setAutoAlign(event.target.checked) }} /><ScanLine size={18} aria-hidden="true" />自动匹配相似波形</label>
                <p id="subtract-auto-help" className={styles.help}>搜索附近的共同波形，自动校准时间、音量与极性。匹配不可靠时不会自动生成结果。</p>
                {autoAlign ? <>
                  <label htmlFor="subtract-radius">搜索范围</label>
                  <select className={styles.select} id="subtract-radius" value={searchRadius} onChange={event => { invalidate(); setSearchRadius(Number(event.target.value)) }}>
                    <option value={250}>搜索中心 ± 250 ms</option><option value={1000}>搜索中心 ± 1 秒</option>
                    <option value={3000}>搜索中心 ± 3 秒</option><option value={10000}>搜索中心 ± 10 秒</option>
                  </select>
                  <label htmlFor="subtract-strength" className={styles.strengthLabel}>消减强度 <span aria-hidden="true">{strength}%</span></label>
                  <input className={styles.range} id="subtract-strength" type="range" min="10" max="100" step="5" value={strength}
                    aria-valuetext={`${strength}%`} onChange={event => { invalidate(); setStrength(Number(event.target.value)) }} />
                  <p className={styles.help}>100% 使用估计音量完整抵消；降低强度可保留一部分共同声音。</p>
                </> : null}
              </div>
              {!autoAlign ? <><label htmlFor="subtract-gain">B 的音量比例 <span>100% = 原始音量</span></label>
              <div className={styles.inputUnit}><input id="subtract-gain" type="number" min="0" max="200" step="0.1" value={gain}
                aria-invalid={gainError} aria-describedby="subtract-gain-help" onChange={event => { invalidate(); setGain(event.target.value) }} /><span>%</span></div>
              <p id="subtract-gain-help" className={gainError ? styles.error : styles.help}>{gainError ? '请输入 0–200 的有效数值。' : '调整需要抵消的 B 的音量，不改变 A 的音量。'}</p>
              <label className={styles.checkbox}><input type="checkbox" checked={invertB} onChange={event => { invalidate(); setInvertB(event.target.checked) }} />反转 B 的极性</label>
              <p className={styles.help}>仅在两份素材极性相反时使用；自动模式会自行检测。</p></> : null}
              <label htmlFor="subtract-offset">{autoAlign ? '时间搜索中心' : 'B 的时间偏移'}</label>
              <div className={styles.inputUnit}><input id="subtract-offset" type="number" min="-60000" max="60000" step="0.01" value={offset}
                aria-invalid={offsetError} aria-describedby="subtract-offset-help" onChange={event => { invalidate(); setOffset(event.target.value) }} /><span>ms</span></div>
              <p id="subtract-offset-help" className={offsetError ? styles.error : styles.help}>{offsetError ? '请输入 -60,000 至 60,000 之间的数值。' : autoAlign
                ? '通常保持 0。若已知 B 大约晚了 5 秒，填入 -5000，再搜索附近偏移；总范围限制在 ±60 秒。'
                : '正数让 B 晚一些，负数让 B 提前。按 A 的采样率对齐到最近采样点。'}</p>
              <label className={styles.checkbox}><input type="checkbox" checked={!protectUnmatched && preventClipping} disabled={protectUnmatched}
                aria-describedby="subtract-clipping-help" onChange={event => { invalidate(); setPreventClipping(event.target.checked) }} />输出防削波</label>
              <p id="subtract-clipping-help" className={styles.help}>{protectUnmatched
                ? '保护模式不做整段降音量，确保未匹配位置保留 A；可能新增过载的窗口会跳过。'
                : '峰值溢出时会降低整段音量，包括 B 静音或未覆盖的位置。关闭可保持原始运算幅度，但过载播放可能失真。'}</p>
              <label htmlFor="subtract-name">输出文件名</label>
              <input className={styles.nameInput} id="subtract-name" value={fileName} placeholder={suggestedName} onChange={event => { invalidate(); setFileName(event.target.value) }} />
              <p className={styles.help}>WAV · 32 位浮点 · 使用 A 的采样率和时长</p>
              <button className={styles.reset} type="button" onClick={() => {
                invalidate(); setGain('100'); setOffset('0'); setPreventClipping(true); setFileName('')
                setAutoAlign(false); setSearchRadius(3000); setStrength(100); setInvertB(false)
                setProtectUnmatched(false)
              }}><RotateCcw size={15} aria-hidden="true" />恢复默认设置</button>
            </fieldset>
            <button className={`button button-primary ${styles.run}`} disabled={!ready || busy} onClick={() => void run()}><Play size={18} aria-hidden="true" />生成音频 C</button>
            {busy ? <button className={`button ${styles.run}`} onClick={stop}><Square size={16} aria-hidden="true" />停止处理</button> : null}
            <p className={styles.limit}>每个源文件最多 {AUDIO_FILE_SIZE_LIMIT_LABEL}，结果最多 256 MB。长音频建议先截取片段；A、B 需具有相同声道数。</p>
          </section>
          <section className={styles.result} aria-labelledby="subtract-result-title" aria-busy={busy}>
            <header><span className={`${styles.letter} ${styles.letterC}`}>C</span><h2 id="subtract-result-title">相减结果</h2>{result ? <span className={styles.done}><Check size={15} aria-hidden="true" />已生成</span> : null}</header>
            <p className={styles.status} role="status" aria-live="polite">{notice}</p>
            {busy ? <progress aria-label="音频相减进度" max="100" value={progress?.percent} /> : null}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            {result ? <div className={styles.resultBody}>
              <strong className={styles.resultName}>{result.fileName}</strong>
              <div className={styles.stats}><div><span>时长</span><strong>{formatPreciseTime(result.duration)}</strong></div>
                <div><span>音频规格</span><strong>{result.sampleRate / 1000} kHz · {result.channels === 1 ? '单声道' : '立体声'}</strong></div>
                <div><span>文件大小</span><strong>{bytesLabel(result.blob.size)}</strong></div></div>
              {result.alignment ? <section className={styles.alignment} aria-label="自动匹配结果">
                <header><h3><ScanLine size={17} aria-hidden="true" />自动匹配结果</h3><span>{result.alignment.confidence === 'high' ? '取样匹配可靠' : '建议对照试听'}</span></header>
                <dl>
                  <div><dt>B 的实际偏移</dt><dd>{(result.offsetSamples / result.sampleRate * 1000).toFixed(3)} ms</dd></div>
                  <div><dt>估计音量 / 应用音量</dt><dd>{(result.alignment.gainB * 100).toFixed(1)}% / {(result.alignment.appliedGainB * 100).toFixed(1)}%</dd></div>
                  <div><dt>波形相关系数</dt><dd>{result.alignment.correlation.toFixed(3)}</dd></div>
                  <div><dt>B 的极性</dt><dd>{result.alignment.invertB ? '已反转' : '保持原样'}</dd></div>
                </dl>
                <p>已匹配 {result.alignment.matchedWindows} / {result.alignment.analyzedWindows} 个取样片段。相关系数不是消除成功率；使用整段统一偏移，不对音频逐段拉伸。</p>
                <button className="button button-small" onClick={() => {
                  setGain(String(result.alignment!.appliedGainB * 100)); setOffset(String(result.offsetSamples / result.sampleRate * 1000))
                  setInvertB(result.alignment!.invertB); setAutoAlign(false); invalidate(); setNotice('已带入自动匹配参数，可手动微调后重新生成。')
                }}>转为手动微调</button>
              </section> : null}
              {result.protection ? <section className={styles.alignment} aria-label="保护模式结果">
                <header><h3><ShieldCheck size={17} aria-hidden="true" />保护模式已应用</h3><span>未匹配位置保留 A</span></header>
                <dl><div><dt>符合消减条件</dt><dd>{result.protection.matchedSeconds.toFixed(2)} 秒</dd></div>
                  <div><dt>保留 A</dt><dd>{result.protection.preservedSeconds.toFixed(2)} 秒</dd></div></dl>
                <p>{result.protection.matchedWindows} / {result.protection.totalWindows} 个窗口符合条件，每窗约 {(result.protection.windowSeconds * 1000).toFixed(1)} ms。
                  波形相关阈值 0.85，能量至少下降 2%，跳过新增过载；不保证按语义去除特定声音。</p>
              </section> : null}
              <audio ref={resultAudioRef} controls src={result.url} preload="metadata" aria-label="音频 C 试听" onPlay={playOne} />
              <p className={styles.help}>实际偏移 {result.offsetSamples} 个采样点 · 运算峰值 {result.peak === 0 ? '静音' : `${(20 * Math.log10(result.peak)).toFixed(2)} dBFS`}</p>
              {result.warnings.length ? <ul className={styles.warnings}>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
              {result.peak === 0 && (result.levels?.a.peak ?? 0) > 0 ? <p className={styles.selectionNotice}>输出采样全部为 0：当前设置下已逐点抵消。这不是防削波将音频静音，请核对 A、B 是否选成了同一份素材。</p> : null}
              <a className={`button button-primary ${styles.download}`} href={result.url} download={result.fileName}><Download size={18} aria-hidden="true" />下载音频 C</a>
              <p className={styles.help}>直接下载 WAV 文件，可用于继续编辑。文件大小可能大于压缩格式的原音频。</p>
              {result.levels ? <AudioLevelComparison levels={result.levels} outputGain={result.outputGain} protectedMode={!!result.protection} onSeek={seconds => {
                pauseAudioPreviews()
                let positioned = 0
                for (const player of [sourceAudioRef.current, resultAudioRef.current]) {
                  if (player && Number.isFinite(player.duration)) { player.currentTime = Math.min(seconds, player.duration); positioned++ }
                }
                setNotice(positioned === 2 ? `A / C 试听已定位到 ${formatPreciseTime(seconds)}，点击各自播放键对照。` : '部分格式尚不能在浏览器中定位，可下载后使用音频编辑器对照。')
              }} /> : null}
            </div> : <div className={styles.empty}><span><AudioLines size={30} /><Minus size={22} /><AudioLines size={30} /></span>
              <h3>{busy ? '正在生成你的音频 C' : '两段音频，一个相减结果'}</h3><p>{autoAlign ? '先匹配附近波形，再按估计的偏移和音量消减。' : '选择 A 和 B，设置抵消比例后生成。'}<br />B 未覆盖到的位置会保留 A。</p></div>}
          </section>
        </div>
        <p className={styles.privacy}><ShieldCheck size={17} aria-hidden="true" />音频仅在本机浏览器中处理，不上传服务器；离开页面或清空后不会保留文件。</p>
      </main>
    </div>
  )
}
