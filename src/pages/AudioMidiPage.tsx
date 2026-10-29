import { Download, Eraser, FileAudio, FolderOpen, Hand, Info, Music2, Pause, Pencil, Play, Redo2, Save, ShieldCheck, SkipBack, Trash2, Undo2, UploadCloud, MousePointer2, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ToolHeader } from '../components/SiteHeader'
import { AudioToolNav } from '../components/AudioToolNav'
import { useAudioLeaveWarning } from '../features/audio-shared/useAudioLeaveWarning'
import { constrainNote, encodeMidi, mergeOverlappingNotes, parseMidiProject } from '../features/audio-midi/midi'
import { MAX_NOTES, MAX_PITCH, MIN_PITCH, pitchName, type EditTool, type MidiNote, type MidiProject, type MidiSource, type SpectrumAnalyzer } from '../features/audio-midi/types'
import { useMidiPlayback, type PlaybackMode } from '../features/audio-midi/useMidiPlayback'
import { formatPreciseTime } from '../features/audio-splitting/audio'
import { AudioMidiRoll } from './AudioMidiRoll'
import { defaultSpectralRenderer, useSpectralEdits } from '../features/spectral-edit/useSpectralEdits'
import type { SpectralRenderer } from '../features/spectral-edit/types'
import { SpectralEditPanel } from './SpectralEditPanel'
import styles from './AudioMidiPage.module.css'

const defaultAnalyzer: SpectrumAnalyzer = async (...args) => (await import('../features/audio-midi/analyzer')).analyzeMidiSource(...args)
const pitches = Array.from({ length: MAX_PITCH - MIN_PITCH + 1 }, (_, i) => MAX_PITCH - i)
interface History { past: MidiNote[][]; present: MidiNote[]; future: MidiNote[][] }

function NoteInspector({ note, duration, onCommit, onDelete }: { note: MidiNote; duration: number; onCommit: (note: MidiNote) => void; onDelete: () => void }) {
  const [start, setStart] = useState(String(Number(note.start.toFixed(3))))
  const [end, setEnd] = useState(String(Number(note.end.toFixed(3))))
  const [pitch, setPitch] = useState(note.pitch)
  const [velocity, setVelocity] = useState(String(note.velocity))
  const [error, setError] = useState('')
  return <form onSubmit={event => {
    event.preventDefault()
    if (![start, end, velocity].every(value => value.trim() && Number.isFinite(Number(value))) || Number(start) < 0 || Number(end) <= Number(start)
      || Number(end) > duration + .001 || !Number.isInteger(Number(velocity)) || Number(velocity) < 1 || Number(velocity) > 127) {
      setError('起点须小于终点且位于音频范围内，力度须为 1–127 的整数。'); return
    }
    setError(''); onCommit({ ...note, start: Number(start), end: Math.min(Number(end), duration), pitch, velocity: Number(velocity) })
  }}>
    <div className={styles.noteFields}>
      <label>音高<select aria-label="选中音符音高" value={pitch} onChange={event => setPitch(Number(event.target.value))}>{pitches.map(pitch => <option key={pitch} value={pitch}>{pitchName(pitch)} · {pitch}</option>)}</select></label>
      <label>起点（秒）<input aria-label="音符起点" type="number" min="0" max={duration} step="0.001" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>终点（秒）<input aria-label="音符终点" type="number" min="0" max={duration} step="0.001" value={end} onChange={event => setEnd(event.target.value)} /></label>
      <label>力度<input aria-label="音符力度" type="number" min="1" max="127" step="1" value={velocity} onChange={event => setVelocity(event.target.value)} /></label>
    </div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.inlineActions}><button className="button button-small button-primary" type="submit">应用音符修改</button><button className="button button-small" type="button" onClick={onDelete}><Trash2 size={15} />删除音符</button></div>
  </form>
}

export function AudioMidiPage({ analyzer = defaultAnalyzer, spectralRenderer = defaultSpectralRenderer }: { analyzer?: SpectrumAnalyzer; spectralRenderer?: SpectralRenderer }) {
  const [source, setSource] = useState<MidiSource | null>(null)
  const [history, setHistory] = useState<History>({ past: [], present: [], future: [] })
  const [selected, setSelected] = useState<string | null>(null)
  const [tool, setTool] = useState<EditTool>('draw')
  const [zoom, setZoom] = useState(100)
  const [followPlayback, setFollowPlayback] = useState(true)
  const [bpmText, setBpmText] = useState('120')
  const [snap, setSnap] = useState(4)
  const [brightness, setBrightness] = useState(1)
  const [fftSize, setFftSize] = useState(4096)
  const [mode, setMode] = useState<PlaybackMode>('both')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [notice, setNotice] = useState('导入音频，生成频谱后即可手动画 MIDI。')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const active = useRef({ controller: null as AbortController | null, file: null as File | null, urls: new Set<string>(), importVersion: 0 })
  const playback = useMidiPlayback()
  const spectral = useSpectralEdits(spectralRenderer, playback.stop)
  const blocked = loading || spectral.busy
  const displayedSource = spectral.processed && spectral.result ? spectral.result.preview : source
  const notes = history.present
  useAudioLeaveWarning(!!source || notes.length > 0 || spectral.regions.length > 0)
  const selectedNote = notes.find(note => note.id === selected)
  const bpm = Number(bpmText)
  const bpmValid = bpmText.trim() !== '' && Number.isFinite(bpm) && bpm >= 20 && bpm <= 300

  useEffect(() => {
    const resources = active.current
    return () => { resources.importVersion++; resources.controller?.abort(); resources.urls.forEach(url => URL.revokeObjectURL(url)); resources.urls.clear() }
  }, [])
  function changeNotes(next: MidiNote[]) {
    playback.stop()
    setHistory(previous => ({ past: [...previous.past.slice(-59), previous.present], present: next, future: [] }))
  }
  function commit(note: MidiNote) {
    if (!source || blocked) return
    if (notes.length >= MAX_NOTES && !notes.some(item => item.id === note.id)) { setError(`当前最多 ${MAX_NOTES} 个音符。`); return }
    const next = constrainNote(note, source.buffer.duration)
    changeNotes(notes.some(item => item.id === note.id) ? notes.map(item => item.id === note.id ? next : item) : [...notes, next])
    setSelected(next.id); setError(''); setNotice(`已更新 ${pitchName(next.pitch)}，起点 ${next.start.toFixed(3)} 秒。`)
  }
  function removeNote() { if (selected) { changeNotes(notes.filter(note => note.id !== selected)); setSelected(null) } }
  function undo() {
    playback.stop(); setSelected(null)
    setHistory(previous => previous.past.length ? { past: previous.past.slice(0, -1), present: previous.past[previous.past.length - 1], future: [previous.present, ...previous.future] } : previous)
  }
  function redo() {
    playback.stop(); setSelected(null)
    setHistory(previous => previous.future.length ? { past: [...previous.past, previous.present], present: previous.future[0], future: previous.future.slice(1) } : previous)
  }
  async function load(file: File, size = fftSize, reanalyze = false) {
    if (spectral.busy) return
    if (!reanalyze && (notes.length || spectral.regions.length) && !window.confirm('选择新音频会清空当前音符和去除区域。请确认已下载 MIDI、处理音频或保存工程，是否继续？')) return
    active.current.importVersion++; active.current.controller?.abort(); playback.stop()
    const controller = new AbortController(); active.current.controller = controller
    setLoading(true); setProgress(null); setError(''); setNotice('正在本机解码音频…')
    try {
      const result = await analyzer(file, size, controller.signal, value => {
        if (!controller.signal.aborted) { setProgress(value); setNotice(`正在生成音高频谱 ${value}%…`) }
      })
      if (controller.signal.aborted) return
      setSource(result); active.current.file = file; setFftSize(size)
      if (reanalyze) spectral.invalidate(); else spectral.reset()
      if (!reanalyze) {
        setHistory({ past: [], present: [], future: [] }); setSelected(null); playback.seek(0)
        setZoom(result.buffer.duration <= 10 ? 100 : 60)
      }
      setNotice('频谱已就绪。亮色横线表示较强的频率成分，沿基频画出音符即可。')
    } catch (failure) {
      if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : '分析失败，请尝试 WAV 文件。'); setNotice('未完成分析，原有工程未改变。') }
    } finally { if (active.current.controller === controller) { setLoading(false); setProgress(null) } }
  }
  function cancel() { active.current.controller?.abort(); active.current.controller = null; setLoading(false); setProgress(null); setNotice('已停止分析，原有工程未改变。') }
  function clearSource() {
    if (blocked) return
    if ((notes.length || spectral.regions.length) && !window.confirm('清空音频会移除当前音符和去除区域。请确认已保存需要的结果，是否继续？')) return
    active.current.importVersion++; active.current.controller?.abort(); active.current.controller = null; active.current.file = null
    playback.seek(0); spectral.reset(); setSource(null); setHistory({ past: [], present: [], future: [] }); setSelected(null)
    active.current.urls.forEach(url => URL.revokeObjectURL(url)); active.current.urls.clear()
    setError(''); setNotice('音频与编辑内容已清空，已释放本机处理资源。')
  }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob); active.current.urls.add(url)
    const link = document.createElement('a'); link.href = url; link.download = name; link.click()
    window.setTimeout(() => { if (active.current.urls.delete(url)) URL.revokeObjectURL(url) }, 2000)
  }
  const stem = source?.name.replace(/\.[^.]+$/, '') || 'transcription'
  function exportMidi() {
    if (!source) return
    try {
      download(new Blob([encodeMidi(notes, bpm, source.buffer.duration)], { type: 'audio/midi' }), `${stem}.mid`)
      setError(''); setNotice(`已导出 ${mergeOverlappingNotes(notes).length} 个 MIDI 音符；同音高重叠部分会合并。`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'MIDI 导出失败。') }
  }
  async function importProject(file: File) {
    if (!source) return
    const version = ++active.current.importVersion
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('工程文件不能超过 2 MB。')
      const project = parseMidiProject(await file.text(), source.buffer.duration)
      if (version !== active.current.importVersion) return
      changeNotes(project.notes); setBpmText(String(project.bpm)); setSelected(null); setError(''); setNotice(`已载入工程中的 ${project.notes.length} 个音符，可撤销此次载入。`)
    } catch (failure) { if (version === active.current.importVersion) setError(failure instanceof Error ? failure.message : '工程载入失败。') }
  }

  return <div className={styles.page}>
    <ToolHeader toolName="音频频谱画 MIDI" showMobileTheme wide />
    <main className={`page-shell ${styles.main}`}>
      <header className={styles.heading}><span className={styles.headingIcon}><Music2 /></span><div><h1>音频频谱画 MIDI</h1><p>沿频谱画音符，也可框选频谱区域，去除对应声音。</p></div><span className={styles.local}><ShieldCheck size={16} />本地处理</span></header>
      <AudioToolNav />
      <input ref={inputRef} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg,.opus,.aac" hidden aria-label="选择频谱音频文件" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void load(file) }} />
      <input ref={projectInputRef} type="file" accept=".json,application/json" hidden aria-label="载入 MIDI 工程文件" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importProject(file) }} />
      <section className={styles.sourceBar} onDragOver={event => event.preventDefault()} onDrop={event => {
        event.preventDefault(); if (blocked) return
        if (event.dataTransfer.files.length !== 1) { setError('请一次选择一段音频。'); return }
        void load(event.dataTransfer.files[0])
      }} aria-label="频谱音频上传区">
        <FileAudio className={styles.sourceIcon} /><div className={styles.sourceInfo}><strong>{source ? source.name : '选择或拖入一段音频'}</strong><span>{source ? `${formatPreciseTime(source.buffer.duration)} · ${source.buffer.numberOfChannels === 2 ? '立体声能量谱' : '单声道'} · ${notes.length} 个音符` : 'WAV / MP3 / FLAC / M4A 等 · 最大 100 MB / 10 分钟'}</span></div>
        <button className="button button-primary button-small" disabled={blocked} onClick={() => inputRef.current?.click()}><UploadCloud size={16} />{source ? '更换音频' : '选择音频'}</button>
        {source ? <button className="button button-small" disabled={blocked} onClick={clearSource}><Trash2 size={16} />清空音频</button> : null}
        {loading ? <button className="button button-small" onClick={cancel}>停止分析</button> : null}
      </section>
      <div className={styles.feedback}><p role="status" aria-live="polite">{notice}</p>{loading ? <progress max="100" value={progress ?? undefined} aria-label="频谱分析进度" /> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}</div>
      {source ? <>
        <section className={styles.editor} aria-label="频谱钢琴卷帘编辑器">
          <div className={styles.toolbar}>
            <div className={styles.tools} role="group" aria-label="编辑模式">{([
              ['draw', '画音符', Pencil], ['erase', '去除频谱', Eraser], ['select', '选择', MousePointer2], ['pan', '拖动视图', Hand],
            ] as const).map(([value, label, Icon]) => <button key={value} type="button" disabled={blocked} aria-pressed={tool === value} onClick={() => { playback.stop(); setTool(value) }}><Icon size={16} />{label}</button>)}</div>
            <div className={styles.tools}><button aria-label="撤销" disabled={blocked || (tool === 'erase' ? !spectral.canUndo : !history.past.length)} onClick={tool === 'erase' ? spectral.undo : undo}><Undo2 size={17} /></button><button aria-label="重做" disabled={blocked || (tool === 'erase' ? !spectral.canRedo : !history.future.length)} onClick={tool === 'erase' ? spectral.redo : redo}><Redo2 size={17} /></button></div>
            <label>速度<input aria-label="MIDI 速度 BPM" type="number" min="20" max="300" value={bpmText} aria-invalid={!bpmValid} onChange={event => { playback.stop(); setBpmText(event.target.value) }} /><span>BPM</span></label>
            <label>吸附<select aria-label="节拍吸附" value={snap} onChange={event => setSnap(Number(event.target.value))}><option value="0">自由</option><option value="1">1/4 音符</option><option value="2">1/8 音符</option><option value="4">1/16 音符</option><option value="8">1/32 音符</option></select></label>
            <label>缩放<select aria-label="时间轴缩放" value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[30, 60, 100, 200, 400].map(value => <option key={value} value={value}>{value} px/s</option>)}</select></label>
          </div>
          {!bpmValid ? <p className={styles.error} role="alert">请输入 20–300 之间的有效 BPM；修正后即可绘制和导出。</p> : null}
          <AudioMidiRoll key={source.name + source.buffer.duration} spectrum={displayedSource!.spectrum} notes={notes} selected={selected} tool={tool} zoom={zoom} bpm={bpmValid ? bpm : 120}
            followPlayback={playback.playing && followPlayback}
            snap={snap} brightness={brightness} currentTime={playback.position} disabled={blocked || (!bpmValid && tool !== 'erase') || playback.playing} onSelect={setSelected} onCommit={commit}
            onDelete={removeNote} onSeek={playback.seek} onUndo={tool === 'erase' ? spectral.undo : undo} onRedo={tool === 'erase' ? spectral.redo : redo}
            regions={spectral.regions} selectedRegion={spectral.selected} onRegionCommit={spectral.commit} onRegionSelect={spectral.setSelected} onRegionDelete={() => spectral.remove()} />
          <div className={styles.transport}>
            <button className="button button-small" aria-label="回到开头" onClick={() => playback.seek(0)}><SkipBack size={17} /></button>
            <button className="button button-primary button-small" disabled={blocked || (mode === 'midi' && !notes.length)} onClick={() => {
              if (playback.playing) playback.stop()
              else void playback.play(displayedSource!.buffer, notes, mode, playback.position).catch(() => setError('无法开始试听，请检查浏览器音频权限后重试。'))
            }}>{playback.playing ? <Pause size={17} /> : <Play size={17} />}{playback.playing ? '暂停试听' : '开始试听'}</button>
            <select aria-label="试听内容" value={mode} onChange={event => { playback.stop(); setMode(event.target.value as PlaybackMode) }}><option value="both">{spectral.processed ? '处理后音频 + MIDI' : '原音频 + MIDI'}</option><option value="audio">{spectral.processed ? '仅处理后音频' : '仅原音频'}</option><option value="midi">仅 MIDI</option></select>
            {spectral.result ? <select aria-label="频谱音频版本" value={spectral.processed ? 'processed' : 'original'} onChange={event => { playback.stop(); spectral.setProcessed(event.target.value === 'processed') }}><option value="original">原音频频谱 / 试听</option><option value="processed">处理后频谱 / 试听</option></select> : null}
            <span className={styles.time}>{formatPreciseTime(playback.position)} / {formatPreciseTime(source.buffer.duration)}</span>
            <label className={styles.volume}><Volume2 size={16} aria-hidden="true" /><input type="range" aria-label="频谱试听音量" min="0" max="100" step="1" value={Math.round(playback.volume * 100)}
              onChange={event => playback.setVolume(Number(event.target.value) / 100)} /><span>{Math.round(playback.volume * 100)}%</span></label>
            <label className={styles.follow}><input type="checkbox" checked={followPlayback} onChange={event => setFollowPlayback(event.target.checked)} />跟随播放</label>
            <label className={styles.seek}>播放位置<input aria-label="频谱播放位置" type="range" min="0" max={source.buffer.duration} step="0.01" value={playback.position} onChange={event => playback.seek(Number(event.target.value))} /></label>
          </div>
          <p id="midi-roll-help" className={styles.rollHelp}>{tool === 'erase' ? '拖动框选时间和频率区域，红框表示去除范围；点击红框选中，Delete 删除区域，Ctrl/Cmd＋Z 撤销区域，Esc 取消框选。框选不受 MIDI 节拍吸附影响。下方可数值微调并生成音频。' : '拖动画音符，拖动音符移动，拖动两端调整长度。滚轮上下浏览，切换“拖动视图”可横向平移。选中后 ↑↓ 调音高、←→ 调位置、Shift＋←→ 调长度、Delete 删除、Ctrl/Cmd＋Z 撤销。'}</p>
        </section>
        {tool === 'erase' || spectral.regions.length ? <SpectralEditPanel editor={spectral} duration={source.buffer.duration} disabled={loading}
          fileName={`${stem}-spectral-edited.wav`} onRun={() => { if (active.current.file) void spectral.run(active.current.file, fftSize) }} /> : null}
        <div className={styles.details}>
          <section className={styles.panel}><header><h2>{selectedNote ? `编辑 ${pitchName(selectedNote.pitch)}` : '音符编辑'}</h2><button className="button button-small" disabled={blocked || !bpmValid || notes.length >= MAX_NOTES} onClick={() => commit(constrainNote({ id: crypto.randomUUID(), pitch: 60, start: playback.position, end: playback.position + .5, velocity: 96 }, source.buffer.duration))}>添加音符</button></header>
            <label className={styles.noteChoice}>选择已有音符<select aria-label="选择已有音符" value={selectedNote?.id ?? ''} onChange={event => { playback.stop(); setSelected(event.target.value || null) }}><option value="">{notes.length ? '请选择音符' : '尚未添加音符'}</option>{[...notes].sort((a, b) => a.start - b.start).map((note, i) => <option key={note.id} value={note.id}>{i + 1}. {pitchName(note.pitch)} · {note.start.toFixed(3)}–{note.end.toFixed(3)}s</option>)}</select></label>
            {selectedNote ? <NoteInspector key={`${selectedNote.id}-${selectedNote.start}-${selectedNote.end}-${selectedNote.pitch}-${selectedNote.velocity}`} note={selectedNote} duration={source.buffer.duration} onCommit={commit} onDelete={removeNote} /> : <p className={styles.muted}>可直接在频谱上绘制，也可使用“添加音符”和数值输入，全程支持键盘操作。</p>}
          </section>
          <section className={styles.panel}><header><h2>频谱与导出</h2><span className={styles.count}>{notes.length} / {MAX_NOTES} 音符</span></header>
            <div className={styles.spectrumSettings}><label>频谱精度<select aria-label="频谱精度" disabled={blocked} value={fftSize} onChange={event => { if (active.current.file) void load(active.current.file, Number(event.target.value), true) }}><option value="2048">瞬态优先（2048）</option><option value="4096">平衡（4096）</option><option value="8192">音高优先（8192）</option></select></label><label>频谱亮度<input aria-label="频谱亮度" type="range" min="0.5" max="2" step="0.05" value={brightness} onChange={event => setBrightness(Number(event.target.value))} /></label></div>
            <p className={styles.muted}>分析采样率 {source.buffer.sampleRate / 1000} kHz · 每帧约 {(source.spectrum.duration / source.spectrum.columns * 1000).toFixed(1)} ms。音高优先更容易看清低音，瞬态优先更容易判断起音；亮线也可能是泛音，不等于独立音符。</p>
            <div className={styles.exports}><button className="button button-primary" disabled={!notes.length || !bpmValid || loading} onClick={exportMidi}><Download size={17} />导出 MIDI</button><button className="button" disabled={loading || !bpmValid} onClick={() => {
              const project: MidiProject = { version: 1, sourceName: source.name, duration: source.buffer.duration, bpm, notes }
              download(new Blob([JSON.stringify(project)], { type: 'application/json' }), `${stem}.yl-midi.json`); setNotice('工程已保存；下次导入同一音频，再载入此工程即可继续编辑。')
            }}><Save size={17} />保存工程</button><button className="button" disabled={loading} onClick={() => projectInputRef.current?.click()}><FolderOpen size={17} />载入工程</button></div>
            <button className={styles.clear} disabled={!notes.length || loading} onClick={() => { if (window.confirm('清空全部音符？可通过撤销恢复。')) { changeNotes([]); setSelected(null) } }}><Trash2 size={14} />清空音符</button>
          </section>
        </div>
      </> : <section className={styles.empty}><div className={styles.emptyIcon}><Music2 size={36} /></div><h2>把频谱变成你的转写参考</h2><p>导入音频 → 沿频谱画音符 → 对照试听 → 导出 MIDI</p><p>支持 A0–C8 音高范围，音符时刻与原音频对齐。</p></section>}
      <div className={styles.notice}><Info size={18} /><p>这是<strong>频谱辅助人工转写与手动频谱编辑</strong>，不会自动把录音变成乐谱。BPM 只影响 MIDI 网格，不移动音符或去除区域。MIDI 不包含原音频，工程只保存音符。音频和编辑内容不上传、不自动保存，离开页面前请下载所需文件。<Link to="/help#audio-midi">使用说明</Link></p></div>
    </main>
  </div>
}
