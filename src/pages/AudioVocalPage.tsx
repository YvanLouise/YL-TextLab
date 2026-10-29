import { Download, Info, Mic2, Play, RotateCcw, ShieldCheck, Square, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ToolHeader } from '../components/SiteHeader'
import { AudioToolNav } from '../components/AudioToolNav'
import { AUDIO_ACCEPT, formatAudioDuration, inspectAudioFile } from '../features/audio-conversion/audio'
import { pauseAudioPreviews } from '../features/audio-shared/media'
import { useAudioLeaveWarning } from '../features/audio-shared/useAudioLeaveWarning'
import { DEFAULT_VOCAL_OPTIONS, VOCAL_PREVIEW_SECONDS, type VocalOptions, type VocalRenderer, type VocalResult } from '../features/audio-vocal/types'
import styles from './AudioVocalPage.module.css'

const defaultRenderer: VocalRenderer = async (...args) => {
  const { renderVocal } = await import('../features/audio-vocal/runtime')
  return renderVocal(...args)
}
interface Source { file: File; url: string }
interface Result extends VocalResult { url: string; removedUrl: string }
function releaseResult(result: Result | null) {
  if (result) { URL.revokeObjectURL(result.url); URL.revokeObjectURL(result.removedUrl) }
}
function createResult(output: VocalResult): Result {
  const url = URL.createObjectURL(output.blob)
  try { return { ...output, url, removedUrl: URL.createObjectURL(output.removed) } }
  catch (error) { URL.revokeObjectURL(url); throw error }
}
const presets = [{ strength: 35, title: '自然保留', detail: '优先保留音色，推荐先用' },
  { strength: 60, title: '均衡净化', detail: '加强弱和声与残留抑制' }, { strength: 85, title: '更强抑制', detail: '更干净，也更容易伤音色' }]

export function AudioVocalPage({ renderer = defaultRenderer }: { renderer?: VocalRenderer }) {
  const [source, setSource] = useState<Source | null>(null)
  const [options, setOptions] = useState<VocalOptions>(DEFAULT_VOCAL_OPTIONS)
  const [result, setResult] = useState<Result | null>(null)
  const [previewStart, setPreviewStart] = useState('0')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState('导入已分离的人声音轨，建议先净化 20 秒试听。')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const sourceRef = useRef<Source | null>(null)
  const resultRef = useRef<Result | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const originalAudio = useRef<HTMLAudioElement>(null)
  const cleanedAudio = useRef<HTMLAudioElement>(null)
  const playbackGeneration = useRef(0)
  useAudioLeaveWarning(Boolean(source))

  const clearResult = () => {
    playbackGeneration.current++
    releaseResult(resultRef.current)
    resultRef.current = null; setResult(null)
  }
  useEffect(() => () => {
    playbackGeneration.current++
    controllerRef.current?.abort()
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url)
    releaseResult(resultRef.current)
  }, [])

  const updateOptions = (next: Partial<VocalOptions>) => {
    if (controllerRef.current || Object.entries(next).every(([key, value]) => options[key as keyof VocalOptions] === value)) return
    pauseAudioPreviews(); clearResult(); setOptions(current => ({ ...current, ...next })); setError('')
    setNotice('设置已改变，请重新生成试听或整段结果。')
  }
  const selectFile = async (file: File) => {
    if (controllerRef.current) return
    const controller = new AbortController()
    controllerRef.current = controller; setBusy(true); setError(''); setProgress(0)
    try {
      await inspectAudioFile(file)
      if (controller.signal.aborted) return
      const next = { file, url: URL.createObjectURL(file) }
      pauseAudioPreviews(); clearResult()
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url)
      sourceRef.current = next; setSource(next); setPreviewStart('0')
      setNotice('人声音轨已就绪。保留当前净化设置，建议先试听再决定是否加强抑制。')
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '无法读取文件。') }
    finally { if (controllerRef.current === controller) { controllerRef.current = null; setBusy(false) } }
  }
  const removeSource = () => {
    if (controllerRef.current) return
    pauseAudioPreviews(); clearResult()
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url)
    sourceRef.current = null; setSource(null); setError(''); setNotice('已移除文件，原文件未改变。')
  }
  const run = async (preview: boolean) => {
    if (!source || controllerRef.current) return
    const start = Number(previewStart)
    if (preview && (!previewStart.trim() || !Number.isFinite(start) || start < 0)) { setError('请输入有效的试听开始秒数。'); return }
    pauseAudioPreviews(); clearResult(); setError(''); setProgress(0); setBusy(true)
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const output = await renderer({ file: source.file, options: { ...options }, previewStart: preview ? start : null }, controller.signal,
        (message, percent) => { if (!controller.signal.aborted) { setNotice(message); setProgress(percent) } })
      if (controller.signal.aborted) return
      const ready = createResult(output)
      resultRef.current = ready; setResult(ready)
      setNotice(options.strength === 0 ? '原声对照已生成（0%），未进行净化，可试听并下载所选声道。'
        : preview ? '试听片段已生成。满意后点击“净化整段并导出”。' : '整段净化已完成，可试听并下载 WAV。')
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '净化失败，请使用较短片段重试。') }
    finally { if (controllerRef.current === controller) { controllerRef.current = null; setBusy(false) } }
  }
  const stop = () => { controllerRef.current?.abort(); controllerRef.current = null; setBusy(false); setNotice('已停止处理，原人声未改变，可重新开始。') }
  const compare = (target: 'source' | 'clean') => {
    if (!result || !originalAudio.current || !cleanedAudio.current) return
    const audio = target === 'source' ? originalAudio.current : cleanedAudio.current
    const duration = result.frames / result.sampleRate
    const time = target === 'source' ? cleanedAudio.current.currentTime : originalAudio.current.currentTime - result.start
    const relative = Number.isFinite(time) && time >= 0 && time < duration ? time : 0
    const generation = ++playbackGeneration.current
    const reportError = (failure: unknown) => {
      if (generation !== playbackGeneration.current || (failure instanceof DOMException && failure.name === 'AbortError')) return
      setError('浏览器无法试听该格式，可下载 WAV 或先将原音频转为 WAV。')
    }
    setError('')
    pauseAudioPreviews(audio)
    try {
      audio.currentTime = relative + (target === 'source' ? result.start : 0)
      void audio.play().catch(reportError)
    } catch (failure) { reportError(failure) }
  }

  return <div className={styles.page}>
    <ToolHeader toolName="主唱净化工具" />
    <main className={`page-shell ${styles.main}`}>
      <header className={styles.heading}><span><Mic2 aria-hidden="true" /></span><div><h1>主唱净化</h1><p>保留主唱音色，温和压低底噪、弱和声与残留声音。</p></div><small><ShieldCheck size={17} /> 本地处理</small></header>
      <AudioToolNav />
      <div className={styles.explanation}><Info size={20} aria-hidden="true" /><p>适合已经分离出的人声音轨。跟随较强、连续的主旋律，保留对应谐波与咬字；同音高重叠的和声无法保证完全去除。<Link to="/audio-midi">仍有局部杂音？可用频谱工具手动修整</Link></p></div>
      <section className={`${styles.source} ${dragging ? styles.dragging : ''}`} aria-label="人声音轨"
        onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true) }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
        onDrop={event => { event.preventDefault(); setDragging(false); if (busy) return
          if (event.dataTransfer.files.length !== 1) { setError('请一次放入一个已分离的人声文件。'); return }
          void selectFile(event.dataTransfer.files[0]) }}>
        <input ref={inputRef} type="file" tabIndex={-1} accept={AUDIO_ACCEPT} disabled={busy} aria-label="选择已分离的人声音频"
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void selectFile(file) }} />
        <div className={styles.sourceTitle}><UploadCloud aria-hidden="true" /><div><h2>{source ? source.file.name : '拖入人声音轨'}</h2><p>{source ? `${(source.file.size / 1048576).toFixed(2)} MB · 原文件不会被覆盖` : '支持 WAV、FLAC、MP3、M4A 等音频，单文件最多 500 MB'}</p></div>
          <button className="button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{source ? '更换文件' : '选择人声音频'}</button>
          {source ? <button className={styles.iconButton} aria-label="移除人声音轨" type="button" disabled={busy} onClick={removeSource}><X size={18} /></button> : null}
        </div>
        {source ? <label className={styles.player}>原人声（完整文件）<audio ref={originalAudio} aria-label="原人声试听" src={source.url} controls preload="none" onPlay={event => pauseAudioPreviews(event.currentTarget)} /></label> : null}
      </section>
      <div className={styles.workspace}>
        <section className={styles.settings} aria-labelledby="vocal-settings-title"><h2 id="vocal-settings-title">净化设置</h2>
          <fieldset disabled={busy}><legend>保留与抑制</legend>
            <div className={styles.presets}>{presets.map(preset => <button type="button" key={preset.strength} aria-pressed={options.strength === preset.strength} onClick={() => updateOptions({ strength: preset.strength })}><strong>{preset.title}</strong><small>{preset.detail}</small></button>)}</div>
            <label htmlFor="vocal-strength">次要声音抑制 <span>{options.strength}%</span></label>
            <input id="vocal-strength" type="range" min="0" max="100" value={options.strength} onChange={event => updateOptions({ strength: Number(event.target.value) })} />
            <p>强度越高越容易改变音色。0% 可作原声对照。</p>
            <label htmlFor="vocal-gate">弱声门限 <span>{options.gateDb} dB</span></label>
            <input id="vocal-gate" type="range" min="-80" max="-20" value={options.gateDb} onChange={event => updateOptions({ gateDb: Number(event.target.value) })} />
            <p>调高会更明显压低空隙噪声，也可能削弱轻声、气声与尾音。</p>
            <label htmlFor="vocal-range">主唱音域</label><select id="vocal-range" value={options.range} onChange={event => updateOptions({ range: event.target.value as VocalOptions['range'] })}>
              <option value="auto">宽音域（70–1000 Hz）</option><option value="low">偏低音域（65–450 Hz）</option><option value="high">偏高音域（160–1200 Hz）</option>
            </select><p>主唱与和声音域不同时，缩小音域有助于跟随主唱。</p>
            <label htmlFor="vocal-channel">输入声道</label><select id="vocal-channel" value={options.channel} onChange={event => updateOptions({ channel: event.target.value as VocalOptions['channel'] })}>
              <option value="original">原声道（推荐）</option><option value="center">居中人声（合并左右声道）</option><option value="left">只用左声道</option><option value="right">只用右声道</option>
            </select><p>主唱偏在一侧时可单选声道。居中合并可能削弱反相声音，会输出单声道。</p>
            <label className={styles.checkbox}><input type="checkbox" checked={options.protectConsonants} onChange={event => updateOptions({ protectConsonants: event.target.checked })} /> 保护齿音与气声</label>
            <label htmlFor="vocal-preview-start">试听开始位置（秒）</label><input id="vocal-preview-start" type="number" min="0" step="0.1" value={previewStart} onChange={event => {
              setPreviewStart(event.target.value); setError('')
              if (resultRef.current?.preview) { pauseAudioPreviews(); clearResult(); setNotice('试听起点已改变，请重新生成试听片段。') }
            }} />
          </fieldset>
          <div className={styles.actions}>
            <button className="button" type="button" disabled={!source || busy} onClick={() => void run(true)}><Play size={17} /> 净化 {VOCAL_PREVIEW_SECONDS} 秒试听</button>
            <button className="button button-primary" type="button" disabled={!source || busy} onClick={() => void run(false)}><Mic2 size={18} /> 净化整段并导出</button>
            {busy ? <button className="button" type="button" onClick={stop}><Square size={16} /> 停止净化</button> : null}
            <button className="button" type="button" disabled={busy} onClick={() => updateOptions(DEFAULT_VOCAL_OPTIONS)}><RotateCcw size={16} /> 恢复自然保留设置</button>
          </div><p className={styles.limit}>整段最多 10 分钟，解码后最多 128 MB。更长文件可先<Link to="/audio-split">截取片段</Link>。离开页面前请下载结果。</p>
        </section>
        <section className={styles.result} aria-labelledby="vocal-result-title"><h2 id="vocal-result-title">对照试听与导出</h2>
          <p role="status" className={styles.status}>{notice}</p>{error ? <p role="alert" className={styles.error}>{error}</p> : null}
          {busy ? <progress aria-label="主唱净化进度" value={progress} max="100" /> : null}
          {result ? <>
            <div className={styles.stats}><div><span>{result.preview ? '试听片段' : '完整结果'}</span><strong>{formatAudioDuration(result.start)}–{formatAudioDuration(result.start + result.frames / result.sampleRate)}</strong></div>
              <div><span>音频规格</span><strong>{result.sampleRate / 1000} kHz · {result.channels} 声道</strong></div>
              <div><span>旋律跟随覆盖</span><strong>{options.strength === 0 ? '未启用（0%）' : `${result.trackedPercent}%`}</strong></div></div>
            <p className={styles.help}>覆盖率表示活动片段中检测到稳定音高的比例，不代表去除成功率。</p>
            <label className={styles.player}>{options.strength === 0 ? '原声对照（所选声道）' : result.preview ? '净化试听片段' : '净化后的人声'}<audio ref={cleanedAudio} aria-label="净化结果试听" src={result.url} controls preload="metadata" onPlay={event => pauseAudioPreviews(event.currentTarget)} /></label>
            <div className={styles.compare}><button className="button" type="button" onClick={() => compare('source')}>同位置听原声</button><button className="button" type="button" onClick={() => compare('clean')}>同位置听净化</button></div>
            <label className={styles.player}>被削弱的声音（所选声道）<audio aria-label="被削弱的声音试听" src={result.removedUrl} controls preload="none" onPlay={event => pauseAudioPreviews(event.currentTarget)} /></label>
            <p className={styles.help}>如果这里能清楚听到主唱，说明抑制过强，可调低强度或换一个音域。</p>
            <ul className={styles.warnings}>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            <div className={styles.actions}><a className="button button-primary" href={result.url} download={result.fileName}><Download size={18} /> {options.strength === 0 ? '下载原声对照 WAV' : result.preview ? '下载净化试听片段' : '下载净化人声 WAV'}</a>
              <a className="button" href={result.removedUrl} download={result.fileName.replace('.wav', '-削弱部分.wav')}>下载被削弱部分</a></div>
          </> : <div className={styles.empty}><Mic2 size={42} /><h3>先听一段，再处理整首</h3><p>默认保留自然音色。结果提供净化人声和被削弱的声音，便于判断是否误伤咬字或尾音。</p></div>}
        </section>
      </div>
      <p className={styles.privacy}><ShieldCheck size={18} /> 音频仅在本机处理，不上传服务器。输出保留原采样率，原声道模式保留左右声道。</p>
    </main>
  </div>
}
