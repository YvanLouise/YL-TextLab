import {
  AudioLines,
  Download,
  FileAudio,
  FileVideo,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  RefreshCcw,
  Scissors,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Volume2,
  VolumeX,
  Repeat2,
  SkipBack,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ToolHeader } from '../components/SiteHeader'
import { AUDIO_ACCEPT, describeAudioError } from '../features/audio-conversion/audio'
import {
  clampSplitRange,
  createSplitFileName,
  createWaveformPeaks,
  formatPreciseTime,
  inspectSplitSource,
  isLikelyVideoFile,
  parsePreciseTime,
  normalizeSplitFileName,
  splitExtension,
  MIN_SPLIT_SECONDS,
  VIDEO_ACCEPT,
} from '../features/audio-splitting/audio'
import type {
  AudioSplitEngine,
  AudioSplitEngineFactory,
  AudioSplitInputFormat,
  AudioSplitOutputFormat,
  AudioSplitResult,
  AudioSplitSourceKind,
} from '../features/audio-splitting/types'
import styles from './AudioSplitPage.module.css'
import { AudioSplitWaveform } from './AudioSplitWaveform'
import { useSelectionPlayback } from '../features/audio-splitting/useSelectionPlayback'

interface AudioAnalysis {
  duration: number
  peaks: number[]
}

type AudioAnalyzer = (file: File, sourceUrl: string, sourceKind: AudioSplitSourceKind) => Promise<AudioAnalysis>

const defaultEngineFactory: AudioSplitEngineFactory = async () => {
  const { createFfmpegAudioSplitEngine } = await import('../features/audio-splitting/runtime')
  return createFfmpegAudioSplitEngine()
}

function readNativeDuration(sourceUrl: string, sourceKind: AudioSplitSourceKind) {
  return new Promise<number | null>((resolve) => {
    const media = sourceKind === 'video' ? document.createElement('video') : new Audio()
    let settled = false
    const timeout = window.setTimeout(() => finish(null), 12000)
    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      media.onloadedmetadata = null
      media.ontimeupdate = null
      media.onerror = null
      media.removeAttribute('src')
      media.load()
      resolve(value)
    }
    media.preload = 'metadata'
    media.onloadedmetadata = () => {
      if (Number.isFinite(media.duration)) {
        finish(media.duration)
        return
      }
      media.ontimeupdate = () => finish(Number.isFinite(media.duration) ? media.duration : null)
      media.currentTime = Number.MAX_SAFE_INTEGER
    }
    media.onerror = () => finish(null)
    media.src = sourceUrl
  })
}

const defaultAnalyzer: AudioAnalyzer = async (file, sourceUrl, sourceKind) => {
  try {
    const AudioContextConstructor = window.AudioContext
    if (!AudioContextConstructor) throw new Error('AudioContext unavailable')
    const context = new AudioContextConstructor()
    try {
      const buffer = await context.decodeAudioData(await file.arrayBuffer())
      return { duration: buffer.duration, peaks: createWaveformPeaks(buffer.getChannelData(0), 8192) }
    } finally {
      await context.close()
    }
  } catch {
    const duration = await readNativeDuration(sourceUrl, sourceKind)
    if (duration === null) throw new Error('无法读取媒体时长或其中不含可用音轨')
    return { duration, peaks: [] }
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}


interface AudioSplitPageProps {
  engineFactory?: AudioSplitEngineFactory
  analyzeAudio?: AudioAnalyzer
}

export function AudioSplitPage({ engineFactory = defaultEngineFactory, analyzeAudio = defaultAnalyzer }: AudioSplitPageProps) {
  const [file, setFile] = useState<File | null>(null)
  const [inputFormat, setInputFormat] = useState<AudioSplitInputFormat | null>(null)
  const [sourceKind, setSourceKind] = useState<AudioSplitSourceKind>('audio')
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [peaks, setPeaks] = useState<number[]>([])
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [startText, setStartText] = useState('00:00.000')
  const [endText, setEndText] = useState('00:00.000')
  const [dragging, setDragging] = useState(false)
  const [outputFormat, setOutputFormat] = useState<AudioSplitOutputFormat>('original')
  const [customOutputName, setCustomOutputName] = useState('')
  const [notice, setNotice] = useState('请选择需要分割的音频，或需要提取音轨的视频。')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<AudioSplitResult | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const engineRef = useRef<AudioSplitEngine | null>(null)
  const operationRef = useRef(0)
  const busyRef = useRef(false)
  const playback = useSelectionPlayback(audioRef, sourceUrl, start, end, duration, setNotice)
  const { currentTime, isPlaying } = playback

  const releaseResult = useCallback(() => {
    setResultUrl(null)
    setResult(null)
  }, [])

  useEffect(() => () => {
    operationRef.current += 1
    engineRef.current?.dispose()
  }, [])

  const resetSource = () => {
    operationRef.current += 1
    playback.stop()
    releaseResult()
    setFile(null)
    setInputFormat(null)
    setSourceKind('audio')
    setSourceUrl(null)
    setDuration(0)
    setPeaks([])
    setStart(0)
    setEnd(0)
    playback.seek(0)
    playback.setLoop(false)
    setCustomOutputName('')
    setNotice('请选择需要分割的音频，或需要提取音轨的视频。')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
  }, [sourceUrl])
  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl)
  }, [resultUrl])

  const getEngine = async (operation: number) => {
    if (!engineRef.current) {
      const engine = await engineFactory()
      if (operation !== operationRef.current) { engine.dispose(); throw new Error('Cancelled') }
      engineRef.current = engine
    }
    const engine = engineRef.current
    await engine.load()
    if (operation !== operationRef.current) throw new Error('Cancelled')
    return engine
  }

  const loadFile = async (nextFile: File) => {
    if (busyRef.current) return
    busyRef.current = true
    const operation = ++operationRef.current
    setLoading(true)
    const likelyKind: AudioSplitSourceKind = isLikelyVideoFile(nextFile) ? 'video' : 'audio'
    setNotice(likelyKind === 'video' ? '正在读取视频音轨与时长。' : '正在读取音频与生成波形。')
    playback.stop()
    releaseResult()
    const nextUrl = URL.createObjectURL(nextFile)
    try {
      const source = await inspectSplitSource(nextFile)
      const analysis = await analyzeAudio(nextFile, nextUrl, likelyKind).catch(async (error) => {
          if (likelyKind !== 'video') throw error
          if (operation !== operationRef.current) throw error
          setNotice('浏览器正在使用本地引擎分析视频音轨，首次加载约 31 MB。')
          const engine = await getEngine(operation)
          return { duration: await engine.probe(nextFile), peaks: [] }
        })
      if (operation !== operationRef.current) { URL.revokeObjectURL(nextUrl); return }
      if (!Number.isFinite(analysis.duration) || analysis.duration < MIN_SPLIT_SECONDS) throw new Error('Invalid duration')
      const initialEnd = Math.floor(analysis.duration * 1000) / 1000
      setFile(nextFile)
      setInputFormat(source.format)
      setSourceKind(source.kind)
      setSourceUrl(nextUrl)
      setDuration(initialEnd)
      setPeaks(analysis.peaks)
      setStart(0)
      setEnd(initialEnd)
      setStartText(formatPreciseTime(0))
      setEndText(formatPreciseTime(initialEnd))
      playback.seek(0)
      setCustomOutputName('')
      setOutputFormat(source.kind === 'video' ? 'mp3' : 'original')
      setNotice(source.kind === 'video'
        ? '已读取视频音轨。请选择区域并导出为 MP3 或 WAV。'
        : '拖动波形上的边界，或输入时间来选择需要提取的区域。')
    } catch (error) {
      URL.revokeObjectURL(nextUrl)
      if (operation === operationRef.current) setNotice(describeAudioError(error))
    } finally {
      if (operation === operationRef.current) { busyRef.current = false; setLoading(false) }
    }
  }

  const updateStart = (value: number) => {
    if (exporting) return
    const next = clampSplitRange(value, end, duration).start
    const bounded = Math.min(next, Math.max(0, end - 0.01))
    setStart(bounded)
    setStartText(formatPreciseTime(bounded))
    playback.stop()
    releaseResult()
  }

  const updateEnd = (value: number) => {
    if (exporting) return
    const next = clampSplitRange(start, value, duration).end
    const bounded = Math.max(next, Math.min(duration, start + 0.01))
    setEnd(bounded)
    setEndText(formatPreciseTime(bounded))
    playback.stop()
    releaseResult()
  }

  const commitTime = (kind: 'start' | 'end') => {
    const parsed = parsePreciseTime(kind === 'start' ? startText : endText)
    if (parsed === null) {
      if (kind === 'start') setStartText(formatPreciseTime(start))
      else setEndText(formatPreciseTime(end))
      setNotice('时间格式应为 mm:ss.SSS 或 hh:mm:ss.SSS。')
      return
    }
    if (kind === 'start') updateStart(parsed)
    else updateEnd(parsed)
  }


  const exportSelection = async () => {
    if (!file || !inputFormat || Math.round((end - start) * 1000) < 10 || busyRef.current) return
    busyRef.current = true
    const operation = ++operationRef.current
    playback.stop()
    setExporting(true)
    setProgress(0)
    releaseResult()
    setNotice('正在初始化本地分割引擎，首次加载约 31 MB。')
    try {
      const engine = await getEngine(operation)
      setNotice('正在提取所选音频区域。')
      const nextResult = await engine.split({
        file,
        inputFormat,
        sourceKind,
        startSeconds: start,
        endSeconds: end,
        outputFormat,
        fileName: normalizeSplitFileName(outputName, splitExtension(inputFormat, outputFormat)),
      }, (value) => { if (operation === operationRef.current) setProgress(value) })
      if (operation !== operationRef.current) return
      const url = URL.createObjectURL(nextResult.blob)
      setResult(nextResult)
      setResultUrl(url)
      setNotice(sourceKind === 'video' ? '所选视频音轨已提取，可试听或下载。' : '所选片段已导出，可试听或下载。')
    } catch (error) {
      if (operation === operationRef.current) setNotice(describeAudioError(error))
    } finally {
      if (operation === operationRef.current) { busyRef.current = false; setExporting(false) }
    }
  }

  const cancelExport = () => {
    operationRef.current += 1
    engineRef.current?.cancel()
    engineRef.current = null
    busyRef.current = false
    setExporting(false)
    setProgress(0)
    setNotice('已取消导出，选区和文件名已保留，可以重新导出。')
  }

  const resetSelection = () => {
    playback.stop()
    playback.seek(0)
    setStart(0)
    setEnd(duration)
    setStartText(formatPreciseTime(0))
    setEndText(formatPreciseTime(duration))
    releaseResult()
    setNotice(sourceKind === 'video' ? '已重置为完整视频时长。' : '已重置为完整音频范围。')
  }

  const selectionDuration = Math.max(0, end - start)
  const outputName = customOutputName || (file && inputFormat
    ? createSplitFileName(file.name, inputFormat, outputFormat, start, end)
    : '')

  return (
    <div className={styles.page}>
      <ToolHeader toolName="本地音视频音轨工具" />
      <main className={`page-shell ${styles.workspace}`}>
        <section className={styles.intro}>
          <div>
            <span className={styles.introIcon}><Scissors aria-hidden="true" /></span>
            <div>
              <h1>音频分割与视频音轨提取</h1>
              <p>选择音频或视频中的指定区域，试听并导出为音频文件。</p>
            </div>
          </div>
          <span className={styles.localBadge}><ShieldCheck aria-hidden="true" /> 全程本地处理</span>
        </section>

        {!file ? (
          <section
            className={`${styles.dropZone} ${dragging ? styles.dragging : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const nextFile = event.dataTransfer.files[0]
              if (nextFile) void loadFile(nextFile)
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={`${AUDIO_ACCEPT},${VIDEO_ACCEPT}`}
              aria-label="选择要处理的音频或视频文件"
              onChange={(event) => {
                const nextFile = event.target.files?.[0]
                if (nextFile) void loadFile(nextFile)
              }}
            />
            <span><UploadCloud aria-hidden="true" /></span>
            <h2>{loading ? '正在读取媒体文件…' : '选择音频或视频文件'}</h2>
            <p>支持常用音频及 MP4、MOV、WebM、MKV、AVI，单个文件不超过 100 MB。</p>
            <button className="button button-primary" type="button" disabled={loading} onClick={() => fileInputRef.current?.click()}>
              {loading ? <LoaderCircle className={styles.spinning} aria-hidden="true" /> : <FileAudio aria-hidden="true" />}
              选择文件
            </button>
          </section>
        ) : (
          <>
            <section className={styles.sourceCard}>
              <span className={styles.fileIcon}>{sourceKind === 'video' ? <FileVideo aria-hidden="true" /> : <FileAudio aria-hidden="true" />}</span>
              <div>
                <h2>{file.name}</h2>
                <p>{sourceKind === 'video' ? '视频' : '音频'} · {inputFormat?.toUpperCase()} · {formatBytes(file.size)} · {formatPreciseTime(duration)}</p>
              </div>
              <button type="button" aria-label="移除文件" title="移除文件" disabled={exporting} onClick={resetSource}><Trash2 aria-hidden="true" /><span>移除文件</span></button>
            </section>

            <section className={styles.editor} aria-labelledby="waveform-title">
              <header>
                <div><AudioLines aria-hidden="true" /><h2 id="waveform-title">音频波形</h2></div>
                <button type="button" disabled={exporting} onClick={resetSelection}><RefreshCcw aria-hidden="true" /> 重置选择</button>
              </header>

              <AudioSplitWaveform
                key={sourceUrl}
                peaks={peaks}
                duration={duration}
                start={start}
                end={end}
                currentTime={currentTime}
                disabled={exporting}
                onSeek={playback.seek}
                onStartChange={updateStart}
                onEndChange={updateEnd}
              />

              <audio
                aria-label="原音频试听"
                ref={audioRef}
                src={sourceUrl ?? undefined}
                onTimeUpdate={playback.sync}
                onPlay={playback.onPlay}
                onPause={playback.onPause}
                onEnded={playback.sync}
              />

              <div className={styles.playbackRow}>
                <button className={styles.playButton} type="button" disabled={exporting} aria-label={isPlaying ? '暂停所选片段' : '播放所选片段'} onClick={() => void playback.toggle()}>
                  {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                </button>
                <div className={styles.playbackInfo}>
                  <strong><Headphones aria-hidden="true" /> 试听所选片段</strong>
                  <span>{formatPreciseTime(start)} – {formatPreciseTime(end)}（{formatPreciseTime(selectionDuration)}）</span>
                  <output role="timer" aria-live="off" aria-label="当前播放时间">{formatPreciseTime(currentTime)}</output>
                </div>
                <div className={styles.playbackActions}>
                  <button type="button" aria-label="回到选区起点" disabled={exporting} onClick={() => playback.seek(start)}><SkipBack /></button>
                  <button type="button" aria-label="循环试听" aria-pressed={playback.loop} disabled={exporting} onClick={() => playback.setLoop(!playback.loop)}><Repeat2 /><span>循环</span></button>
                  <button type="button" aria-label={playback.muted ? '取消静音' : '静音'} onClick={() => playback.setMuted(!playback.muted)}>{playback.muted || playback.volume === 0 ? <VolumeX /> : <Volume2 />}</button>
                  <input type="range" aria-label="试听音量" min={0} max={1} step={0.01} value={playback.volume}
                    onChange={(event) => { playback.setVolume(Number(event.target.value)); playback.setMuted(false) }} />
                </div>
              </div>

              <div className={styles.markControls}>
                <span>以当前播放位置标记</span>
                <button type="button" disabled={exporting || currentTime > end - MIN_SPLIT_SECONDS} onClick={() => updateStart(currentTime)}>设为起点</button>
                <button type="button" disabled={exporting || currentTime < start + MIN_SPLIT_SECONDS} onClick={() => updateEnd(currentTime)}>设为终点</button>
                <small>音量和循环仅用于试听，不影响导出。</small>
              </div>

              <div className={styles.timeControls}>
                <label>
                  <span>开始时间</span>
                  <input
                    value={startText}
                    disabled={exporting}
                    aria-label="开始时间"
                    onChange={(event) => setStartText(event.target.value)}
                    onBlur={() => commitTime('start')}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitTime('start') }}
                  />
                  <small>格式：mm:ss.SSS</small>
                </label>
                <label>
                  <span>结束时间</span>
                  <input
                    value={endText}
                    disabled={exporting}
                    aria-label="结束时间"
                    onChange={(event) => setEndText(event.target.value)}
                    onBlur={() => commitTime('end')}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitTime('end') }}
                  />
                  <small>格式：mm:ss.SSS</small>
                </label>
                <label>
                  <span>片段时长</span>
                  <input value={formatPreciseTime(selectionDuration)} aria-label="片段时长" readOnly />
                  <small>由开始和结束时间自动计算</small>
                </label>
              </div>

              <div className={styles.outputSettings}>
                <label>
                  <span>输出格式</span>
                  <select value={outputFormat} disabled={exporting} aria-label="输出格式" onChange={(event) => {
                    const format = event.target.value as AudioSplitOutputFormat
                    setOutputFormat(format)
                    if (customOutputName && inputFormat) setCustomOutputName(normalizeSplitFileName(customOutputName, splitExtension(inputFormat, format)))
                    releaseResult()
                  }}>
                    {sourceKind === 'audio' ? <option value="original">保持原格式</option> : null}
                    <option value="mp3">MP3（通用高兼容）</option>
                    <option value="wav">WAV（PCM 无损）</option>
                  </select>
                </label>
                <label className={styles.fileNameField}>
                  <span>输出文件名</span>
                  <input value={outputName} disabled={exporting} maxLength={200} aria-label="输出文件名" onChange={(event) => { setCustomOutputName(event.target.value); releaseResult() }} />
                </label>
                <button className="button button-primary" type="button" disabled={exporting || Math.round(selectionDuration * 1000) < 10} onClick={() => void exportSelection()}>
                  {exporting ? <LoaderCircle className={styles.spinning} aria-hidden="true" /> : <Download aria-hidden="true" />}
                  {exporting ? `正在导出 ${progress}%` : sourceKind === 'video' ? '提取所选音频' : '导出所选片段'}
                </button>
              </div>
              {exporting ? <div className={styles.exportProgress}>
                <progress aria-label="导出进度" max={100} value={progress} />
                <button type="button" onClick={cancelExport}><X />取消导出</button>
              </div> : null}
            </section>

            {result && resultUrl ? (
              <section className={styles.resultCard}>
                <div><span><Scissors aria-hidden="true" /></span><div><strong>{sourceKind === 'video' ? '视频音轨已提取' : '片段已生成'}</strong><p>{result.fileName}</p></div></div>
                <audio controls src={resultUrl} aria-label="导出片段试听" />
                <a className="button button-primary" href={resultUrl} download={result.fileName}><Download aria-hidden="true" /> 下载片段</a>
              </section>
            ) : null}
          </>
        )}

        <p className={styles.notice} role="status"><ShieldCheck aria-hidden="true" /> {notice}</p>
      </main>
    </div>
  )
}
