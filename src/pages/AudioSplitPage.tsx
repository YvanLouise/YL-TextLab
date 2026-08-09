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
    const finish = (value: number | null) => {
      if (settled) return
      settled = true
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
      return { duration: buffer.duration, peaks: createWaveformPeaks(buffer.getChannelData(0)) }
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

function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  selectionStart: number,
  selectionEnd: number,
) {
  const width = Math.max(1, Math.round(canvas.clientWidth))
  const height = Math.max(1, Math.round(canvas.clientHeight))
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const context = canvas.getContext('2d')
  if (!context) return
  context.scale(ratio, ratio)
  context.clearRect(0, 0, width, height)
  const center = height / 2
  const values = peaks.length ? peaks : Array.from({ length: 160 }, (_, index) => 0.1 + Math.abs(Math.sin(index * 0.47)) * 0.18)
  const barWidth = Math.max(1, width / values.length - 1)
  values.forEach((peak, index) => {
    const position = index / Math.max(1, values.length - 1)
    const amplitude = Math.max(2, peak * height * 0.82)
    context.fillStyle = position >= selectionStart && position <= selectionEnd ? '#286cf4' : '#aeb8c8'
    context.fillRect(index * width / values.length, center - amplitude / 2, barWidth, amplitude)
  })
}

interface WaveformProps {
  peaks: number[]
  duration: number
  start: number
  end: number
  currentTime: number
  onStartChange: (value: number) => void
  onEndChange: (value: number) => void
}

function Waveform({ peaks, duration, start, end, currentTime, onStartChange, onEndChange }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startRatio = duration ? start / duration : 0
  const endRatio = duration ? end / duration : 1
  const currentRatio = duration ? Math.min(1, currentTime / duration) : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const render = () => drawWaveform(canvas, peaks, startRatio, endRatio)
    render()
    if (!('ResizeObserver' in globalThis)) {
      window.addEventListener('resize', render)
      return () => window.removeEventListener('resize', render)
    }
    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [peaks, startRatio, endRatio])

  return (
    <div className={styles.waveform}>
      <div className={styles.timeScale} aria-hidden="true">
        <span>00:00</span>
        <span>{formatPreciseTime(duration / 2)}</span>
        <span>{formatPreciseTime(duration)}</span>
      </div>
      <div className={styles.waveformCanvas}>
        <canvas ref={canvasRef} aria-label="音频波形" />
        <span
          className={styles.selectionFill}
          style={{ left: `${startRatio * 100}%`, width: `${Math.max(0, endRatio - startRatio) * 100}%` }}
        />
        <span className={styles.playhead} style={{ left: `${currentRatio * 100}%` }} />
        <span className={`${styles.handleLabel} ${styles.startLabel}`} style={{ left: `${startRatio * 100}%` }}>
          {formatPreciseTime(start)}
        </span>
        <span className={`${styles.handleLabel} ${styles.endLabel}`} style={{ left: `${endRatio * 100}%` }}>
          {formatPreciseTime(end)}
        </span>
        <input
          className={`${styles.range} ${styles.startRange}`}
          type="range"
          aria-label="开始位置"
          min={0}
          max={duration}
          step={0.001}
          value={start}
          onChange={(event) => onStartChange(Number(event.target.value))}
        />
        <input
          className={`${styles.range} ${styles.endRange}`}
          type="range"
          aria-label="结束位置"
          min={0}
          max={duration}
          step={0.001}
          value={end}
          onChange={(event) => onEndChange(Number(event.target.value))}
        />
      </div>
    </div>
  )
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
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
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

  const releaseResult = useCallback(() => {
    setResultUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setResult(null)
  }, [])

  useEffect(() => () => {
    engineRef.current?.dispose()
  }, [])

  const resetSource = () => {
    audioRef.current?.pause()
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    releaseResult()
    setFile(null)
    setInputFormat(null)
    setSourceKind('audio')
    setSourceUrl(null)
    setDuration(0)
    setPeaks([])
    setStart(0)
    setEnd(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setCustomOutputName('')
    setNotice('请选择需要分割的音频，或需要提取音轨的视频。')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    if (resultUrl) URL.revokeObjectURL(resultUrl)
  }, [sourceUrl, resultUrl])

  const getEngine = async () => {
    if (!engineRef.current) {
      const engine = await engineFactory()
      await engine.load()
      engineRef.current = engine
    }
    return engineRef.current
  }

  const loadFile = async (nextFile: File) => {
    if (loading || exporting) return
    setLoading(true)
    const likelyKind: AudioSplitSourceKind = isLikelyVideoFile(nextFile) ? 'video' : 'audio'
    setNotice(likelyKind === 'video' ? '正在读取视频音轨与时长。' : '正在读取音频与生成波形。')
    audioRef.current?.pause()
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    releaseResult()
    const nextUrl = URL.createObjectURL(nextFile)
    try {
      const [source, analysis] = await Promise.all([
        inspectSplitSource(nextFile),
        analyzeAudio(nextFile, nextUrl, likelyKind).catch(async (error) => {
          if (likelyKind !== 'video') throw error
          setNotice('浏览器正在使用本地引擎分析视频音轨，首次加载约 31 MB。')
          const engine = await getEngine()
          return { duration: await engine.probe(nextFile), peaks: [] }
        }),
      ])
      const initialEnd = analysis.duration
      setFile(nextFile)
      setInputFormat(source.format)
      setSourceKind(source.kind)
      setSourceUrl(nextUrl)
      setDuration(analysis.duration)
      setPeaks(analysis.peaks)
      setStart(0)
      setEnd(initialEnd)
      setStartText(formatPreciseTime(0))
      setEndText(formatPreciseTime(initialEnd))
      setCurrentTime(0)
      setOutputFormat(source.kind === 'video' ? 'mp3' : 'original')
      setNotice(source.kind === 'video'
        ? '已读取视频音轨。请选择区域并导出为 MP3 或 WAV。'
        : '拖动波形上的边界，或输入时间来选择需要提取的区域。')
    } catch (error) {
      URL.revokeObjectURL(nextUrl)
      setNotice(describeAudioError(error))
    } finally {
      setLoading(false)
    }
  }

  const updateStart = (value: number) => {
    const next = clampSplitRange(value, end, duration).start
    const bounded = Math.min(next, Math.max(0, end - 0.01))
    setStart(bounded)
    setStartText(formatPreciseTime(bounded))
    setCustomOutputName('')
    releaseResult()
  }

  const updateEnd = (value: number) => {
    const next = clampSplitRange(start, value, duration).end
    const bounded = Math.max(next, Math.min(duration, start + 0.01))
    setEnd(bounded)
    setEndText(formatPreciseTime(bounded))
    setCustomOutputName('')
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

  const toggleSelectionPlayback = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      setIsPlaying(false)
      return
    }
    if (audio.currentTime < start || audio.currentTime >= end) audio.currentTime = start
    try {
      await audio.play()
      setIsPlaying(true)
    } catch {
      setNotice('浏览器暂时无法播放此音频格式，但仍可尝试导出所选片段。')
    }
  }

  const exportSelection = async () => {
    if (!file || !inputFormat || end - start < 0.01 || exporting) return
    setExporting(true)
    setProgress(0)
    releaseResult()
    setNotice('正在初始化本地分割引擎，首次加载约 31 MB。')
    try {
      const engine = await getEngine()
      setNotice('正在提取所选音频区域。')
      const nextResult = await engine.split({
        file,
        inputFormat,
        sourceKind,
        startSeconds: start,
        endSeconds: end,
        outputFormat,
        fileName: outputName,
      }, setProgress)
      const url = URL.createObjectURL(nextResult.blob)
      setResult(nextResult)
      setResultUrl(url)
      setNotice(sourceKind === 'video' ? '所选视频音轨已提取，可试听或下载。' : '所选片段已导出，可试听或下载。')
    } catch (error) {
      setNotice(describeAudioError(error))
    } finally {
      setExporting(false)
    }
  }

  const resetSelection = () => {
    setStart(0)
    setEnd(duration)
    setStartText(formatPreciseTime(0))
    setEndText(formatPreciseTime(duration))
    setCurrentTime(0)
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
              <button type="button" onClick={resetSource}><Trash2 aria-hidden="true" /> 移除文件</button>
            </section>

            <section className={styles.editor} aria-labelledby="waveform-title">
              <header>
                <div><AudioLines aria-hidden="true" /><h2 id="waveform-title">音频波形</h2></div>
                <button type="button" onClick={resetSelection}><RefreshCcw aria-hidden="true" /> 重置选择</button>
              </header>

              <Waveform
                peaks={peaks}
                duration={duration}
                start={start}
                end={end}
                currentTime={currentTime}
                onStartChange={updateStart}
                onEndChange={updateEnd}
              />

              <audio
                ref={audioRef}
                src={sourceUrl ?? undefined}
                onTimeUpdate={(event) => {
                  const audio = event.currentTarget
                  setCurrentTime(audio.currentTime)
                  if (audio.currentTime >= end) {
                    audio.pause()
                    setIsPlaying(false)
                  }
                }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />

              <div className={styles.playbackRow}>
                <button className={styles.playButton} type="button" aria-label={isPlaying ? '暂停所选片段' : '播放所选片段'} onClick={() => void toggleSelectionPlayback()}>
                  {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                </button>
                <div>
                  <strong><Headphones aria-hidden="true" /> 试听所选片段</strong>
                  <span>{formatPreciseTime(start)} – {formatPreciseTime(end)}（{formatPreciseTime(selectionDuration)}）</span>
                </div>
                <Volume2 aria-hidden="true" />
              </div>

              <div className={styles.timeControls}>
                <label>
                  <span>开始时间</span>
                  <input
                    value={startText}
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
                  <select value={outputFormat} aria-label="输出格式" onChange={(event) => { setOutputFormat(event.target.value as AudioSplitOutputFormat); setCustomOutputName(''); releaseResult() }}>
                    {sourceKind === 'audio' ? <option value="original">保持原格式</option> : null}
                    <option value="mp3">MP3（通用高兼容）</option>
                    <option value="wav">WAV（PCM 无损）</option>
                  </select>
                </label>
                <label className={styles.fileNameField}>
                  <span>输出文件名</span>
                  <input value={outputName} aria-label="输出文件名" onChange={(event) => setCustomOutputName(event.target.value)} />
                </label>
                <button className="button button-primary" type="button" disabled={exporting || selectionDuration < 0.01} onClick={() => void exportSelection()}>
                  {exporting ? <LoaderCircle className={styles.spinning} aria-hidden="true" /> : <Download aria-hidden="true" />}
                  {exporting ? `正在导出 ${progress}%` : sourceKind === 'video' ? '提取所选音频' : '导出所选片段'}
                </button>
              </div>
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
