import {
  Archive,
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileAudio,
  FilePenLine,
  Gauge,
  Info,
  LoaderCircle,
  Music2,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ToolHeader } from '../components/SiteHeader'
import {
  AUDIO_ACCEPT,
  OUTPUT_FORMATS,
  bitrateRange,
  describeAudioError,
  estimateAudioOutputSize,
  formatAudioDuration,
  inspectAudioFile,
  qualityLabel,
  validateAudioBatch,
} from '../features/audio-conversion/audio'
import {
  DEFAULT_AUDIO_OPTIONS,
  EMPTY_AUDIO_METADATA,
  MAX_AUDIO_FILES,
  type AudioConversionEngine,
  type AudioConversionOptions,
  type AudioEngineFactory,
  type AudioMetadata,
  type AudioQualityPreset,
  type AudioQueueItem,
} from '../features/audio-conversion/types'
import { AudioMetadataEditor } from './AudioMetadataEditor'
import audioStyles from './AudioConvertPage.module.css'
import styles from './ImageConvertPage.module.css'

const qualityPresets: Array<{ value: AudioQualityPreset; label: string }> = [
  { value: 'compact', label: '节省空间' },
  { value: 'standard', label: '标准' },
  { value: 'high', label: '高质量' },
]

const defaultEngineFactory: AudioEngineFactory = async () => {
  const { createFfmpegAudioEngine } = await import('../features/audio-conversion/runtime')
  return createFfmpegAudioEngine()
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function statusText(item: AudioQueueItem) {
  if (item.status === 'converting') return `${item.progress}%`
  if (item.status === 'done') return '已完成'
  if (item.status === 'error') return '处理失败'
  if (item.status === 'cancelled') return '已停止'
  return item.inputFormat ? '等待转换' : '读取中'
}

function readAudioDuration(url: string) {
  return new Promise<number | null>((resolve) => {
    const audio = new Audio()
    const finish = (value: number | null) => {
      audio.removeAttribute('src')
      audio.load()
      resolve(value)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : null)
    audio.onerror = () => finish(null)
    audio.src = url
  })
}

interface AudioConvertPageProps {
  engineFactory?: AudioEngineFactory
}

export function AudioConvertPage({ engineFactory = defaultEngineFactory }: AudioConvertPageProps) {
  const [items, setItems] = useState<AudioQueueItem[]>([])
  const [options, setOptions] = useState<AudioConversionOptions>(DEFAULT_AUDIO_OPTIONS)
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [engineLoading, setEngineLoading] = useState(false)
  const [notice, setNotice] = useState('请选择需要转换的音频文件。')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const engineRef = useRef<AudioConversionEngine | null>(null)
  const itemsRef = useRef(items)
  const cancelledRef = useRef(false)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => () => {
    engineRef.current?.dispose()
    itemsRef.current.forEach((item) => {
      URL.revokeObjectURL(item.sourceUrl)
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      if (item.coverUrl) URL.revokeObjectURL(item.coverUrl)
    })
  }, [])

  const updateOptions = (next: Partial<AudioConversionOptions>) => {
    setOptions((current) => ({ ...current, ...next }))
    setItems((current) => current.map((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      return item.inputFormat
        ? { ...item, status: 'queued', progress: 0, error: null, result: null, resultUrl: null }
        : item
    }))
    setNotice('输出设置已更新，请重新执行转换。')
  }

  const prepareItem = async (item: AudioQueueItem) => {
    try {
      const format = await inspectAudioFile(item.file)
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, inputFormat: format }
        : entry))
      void readAudioDuration(item.sourceUrl).then((duration) => {
        setItems((current) => current.map((entry) => entry.id === item.id
          ? { ...entry, duration }
          : entry))
      })
    } catch (error) {
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, status: 'error', error: describeAudioError(error) }
        : entry))
    }
  }

  const addFiles = (files: File[]) => {
    if (!files.length || converting) return
    try {
      const { accepted, ignored } = validateAudioBatch(items.map((item) => item.file), files)
      const additions = accepted.map<AudioQueueItem>((file) => ({
        id: createId(),
        file,
        inputFormat: null,
        sourceUrl: URL.createObjectURL(file),
        duration: null,
        status: 'queued',
        progress: 0,
        error: null,
        result: null,
        resultUrl: null,
        metadata: { ...EMPTY_AUDIO_METADATA },
        metadataExpanded: false,
        coverFile: null,
        coverUrl: null,
      }))
      setItems((current) => [...current, ...additions])
      setNotice(ignored
        ? `已添加 ${accepted.length} 个文件，另有 ${ignored} 个文件因数量或大小限制被忽略。`
        : `已添加 ${accepted.length} 个文件，正在读取音频信息。`)
      additions.forEach((item) => void prepareItem(item))
    } catch (error) {
      setNotice(describeAudioError(error))
    }
  }

  const removeItem = (id: string) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.sourceUrl)
      if (target?.resultUrl) URL.revokeObjectURL(target.resultUrl)
      if (target?.coverUrl) URL.revokeObjectURL(target.coverUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  const clearAll = () => {
    items.forEach((item) => {
      URL.revokeObjectURL(item.sourceUrl)
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      if (item.coverUrl) URL.revokeObjectURL(item.coverUrl)
    })
    setItems([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    setNotice('列表已清空，音频文件不会保留。')
  }

  const resetItemResult = (item: AudioQueueItem) => {
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
    return item.inputFormat
      ? { ...item, status: 'queued' as const, progress: 0, error: null, result: null, resultUrl: null }
      : item
  }

  const updateItemMetadata = (id: string, field: keyof AudioMetadata, value: string) => {
    setItems((current) => current.map((item) => item.id === id
      ? { ...resetItemResult(item), metadata: { ...item.metadata, [field]: value } }
      : item))
    setNotice('歌曲信息已更新，转换时会写入新标签。')
  }

  const updateItemCover = (id: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setNotice('封面图片不能超过 10 MB。')
      return
    }
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item
      if (item.coverUrl) URL.revokeObjectURL(item.coverUrl)
      return {
        ...resetItemResult(item),
        coverFile: file,
        coverUrl: URL.createObjectURL(file),
      }
    }))
    setNotice('新封面已添加，支持封面的目标格式会优先写入。')
  }

  const removeItemCover = (id: string) => {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item
      if (item.coverUrl) URL.revokeObjectURL(item.coverUrl)
      return { ...resetItemResult(item), coverFile: null, coverUrl: null }
    }))
    setNotice('自定义封面已移除。')
  }

  const toggleMetadataEditor = (id: string) => {
    setItems((current) => current.map((item) => item.id === id
      ? { ...item, metadataExpanded: !item.metadataExpanded }
      : item))
  }

  const getEngine = async () => {
    if (engineRef.current) return engineRef.current
    setEngineLoading(true)
    setNotice('正在初始化本地转换引擎，首次加载约 31 MB。')
    try {
      const engine = await engineFactory()
      await engine.load()
      engineRef.current = engine
      return engine
    } finally {
      setEngineLoading(false)
    }
  }

  const runConversion = async () => {
    const ready = itemsRef.current.filter((item) =>
      item.inputFormat && ['queued', 'cancelled', 'done'].includes(item.status),
    )
    if (!ready.length || converting) {
      setNotice('请先添加可读取的音频文件。')
      return
    }
    setConverting(true)
    cancelledRef.current = false
    let completed = 0
    try {
      const engine = await getEngine()
      setNotice(`正在按顺序转换 ${ready.length} 个文件。`)
      for (const item of ready) {
        if (cancelledRef.current) break
        setItems((current) => current.map((entry) => entry.id === item.id
          ? { ...entry, status: 'converting', progress: 0, error: null }
          : entry))
        try {
          const result = await engine.convert(
            { file: item.file, options, metadata: item.metadata, coverFile: item.coverFile },
            (progress) => setItems((current) => current.map((entry) => entry.id === item.id
              ? { ...entry, progress }
              : entry)),
          )
          if (cancelledRef.current) break
          const resultUrl = URL.createObjectURL(result.blob)
          setItems((current) => current.map((entry) => {
            if (entry.id !== item.id) return entry
            if (entry.resultUrl) URL.revokeObjectURL(entry.resultUrl)
            return { ...entry, status: 'done', progress: 100, result, resultUrl, error: null }
          }))
          completed += 1
        } catch (error) {
          if (cancelledRef.current) {
            setItems((current) => current.map((entry) => entry.id === item.id
              ? { ...entry, status: 'cancelled', progress: 0 }
              : entry))
            break
          }
          setItems((current) => current.map((entry) => entry.id === item.id
            ? { ...entry, status: 'error', error: describeAudioError(error), progress: 0 }
            : entry))
        }
      }
      if (!cancelledRef.current) {
        setNotice(completed === ready.length
          ? `转换完成，共生成 ${completed} 个音频文件。`
          : `已完成 ${completed} 个文件，失败项可查看具体原因。`)
      }
    } catch (error) {
      setNotice(describeAudioError(error))
    } finally {
      setConverting(false)
    }
  }

  const cancelConversion = () => {
    cancelledRef.current = true
    engineRef.current?.cancel()
    engineRef.current = null
    setNotice('已停止当前转换，等待项目可重新开始。')
  }

  const retryItem = (id: string) => {
    setItems((current) => current.map((item) => {
      if (item.id !== id || !item.inputFormat) return item
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      return { ...item, status: 'queued', progress: 0, error: null, result: null, resultUrl: null }
    }))
    setNotice('已将文件放回等待队列。')
  }

  const downloadAll = async () => {
    const finished = items.filter((item) => item.result)
    if (!finished.length) return
    setNotice('正在生成 ZIP 压缩包。')
    const { zipSync } = await import('fflate')
    const entries: Record<string, Uint8Array> = {}
    const duplicateCount = new Map<string, number>()
    for (const item of finished) {
      const result = item.result!
      const seen = duplicateCount.get(result.fileName) ?? 0
      duplicateCount.set(result.fileName, seen + 1)
      const name = seen ? result.fileName.replace(/(\.[^.]+)$/, `-${seen + 1}$1`) : result.fileName
      entries[name] = new Uint8Array(await result.blob.arrayBuffer())
    }
    const archive = zipSync(entries, { level: 0 })
    const url = URL.createObjectURL(new Blob([new Uint8Array(archive).buffer], { type: 'application/zip' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'YL-AudioLab-converted.zip'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice(`已打包 ${finished.length} 个转换结果。`)
  }

  const completedCount = items.filter((item) => item.status === 'done').length
  const selectedFormat = OUTPUT_FORMATS.find((format) => format.value === options.format)!
  const selectedBitrateRange = bitrateRange(options.format)
  const estimatedBytes = items.reduce((total, item) => {
    const estimate = estimateAudioOutputSize(item.duration, options)
    return estimate === null ? total : total + estimate
  }, 0)
  const busy = converting || engineLoading

  return (
    <div className={styles.page}>
      <ToolHeader toolName="本地音频格式转换工具" />
      <main className={`page-shell ${styles.workspace}`}>
        <section className={styles.intro}>
          <div>
            <span className={`${styles.introIcon} ${audioStyles.audioIcon}`}><AudioLines aria-hidden="true" /></span>
            <div>
              <h1>音频格式转换</h1>
              <p>单首或批量转换常用音乐与音频格式。</p>
            </div>
          </div>
          <span className={styles.localBadge}><ShieldCheck aria-hidden="true" /> 全程本地处理</span>
        </section>

        <aside className={styles.settings} aria-label="音频转换设置">
          <header>
            <div><Gauge aria-hidden="true" /><h2>输出设置</h2></div>
            <span>{selectedFormat.label}</span>
          </header>

          <fieldset className={styles.formatFieldset}>
            <legend>目标格式</legend>
            <div className={styles.formatGrid}>
              {OUTPUT_FORMATS.map((format) => (
                <button
                  type="button"
                  className={options.format === format.value ? styles.selectedFormat : ''}
                  aria-pressed={options.format === format.value}
                  onClick={() => updateOptions({ format: format.value })}
                  key={format.value}
                >
                  <strong>{format.label}</strong>
                  <small>{format.detail}</small>
                  {options.format === format.value ? <Check aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          </fieldset>

          <div className={audioStyles.settingGroup}>
            <span>
              质量与大小
              <small className={audioStyles.presetValue}>
                {qualityLabel(
                  options.format,
                  options.quality,
                  options.qualityMode === 'custom' && selectedBitrateRange ? options.customBitrateKbps : undefined,
                )}
              </small>
            </span>
            {selectedBitrateRange ? (
              <>
                <div className={audioStyles.qualityMode} aria-label="质量控制方式">
                  <button
                    type="button"
                    aria-pressed={options.qualityMode === 'preset'}
                    onClick={() => updateOptions({ qualityMode: 'preset' })}
                  >推荐档位</button>
                  <button
                    type="button"
                    aria-pressed={options.qualityMode === 'custom'}
                    onClick={() => updateOptions({ qualityMode: 'custom' })}
                  >自定义码率</button>
                </div>
                {options.qualityMode === 'preset' ? (
                  <div className={audioStyles.presetGrid}>
                    {qualityPresets.map((preset) => (
                      <button
                        type="button"
                        aria-pressed={options.quality === preset.value}
                        onClick={() => updateOptions({ quality: preset.value })}
                        key={preset.value}
                      >{preset.label}</button>
                    ))}
                  </div>
                ) : (
                  <div className={audioStyles.bitrateControl}>
                    <input
                      type="range"
                      aria-label="自定义码率"
                      min={selectedBitrateRange.min}
                      max={selectedBitrateRange.max}
                      step={selectedBitrateRange.step}
                      value={options.customBitrateKbps}
                      onChange={(event) => updateOptions({ customBitrateKbps: Number(event.target.value) })}
                    />
                    <label>
                      <input
                        type="number"
                        aria-label="码率数值"
                        min={selectedBitrateRange.min}
                        max={selectedBitrateRange.max}
                        step={selectedBitrateRange.step}
                        value={options.customBitrateKbps}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          updateOptions({ customBitrateKbps: Math.max(selectedBitrateRange.min, Math.min(selectedBitrateRange.max, value)) })
                        }}
                      />
                      <span>kbps</span>
                    </label>
                  </div>
                )}
                <p className={audioStyles.sizeEstimate}>
                  {items.length && estimatedBytes
                    ? `当前队列预计约 ${formatBytes(estimatedBytes)}，实际大小会因编码器和标签略有差异。`
                    : '添加音频后，将根据歌曲时长估算输出大小。'}
                </p>
              </>
            ) : (
              <p className={audioStyles.sizeEstimate}>
                {options.format === 'wav'
                  ? `WAV 固定输出 PCM 16-bit${items.length && estimatedBytes ? `，当前队列预计约 ${formatBytes(estimatedBytes)}` : ''}。`
                  : 'FLAC 固定无损输出，文件大小由原始音频内容决定。'}
              </p>
            )}
          </div>

          <div className={`${audioStyles.settingGroup} ${audioStyles.selectGrid}`}>
            <label>
              <span>采样率</span>
              <select
                value={options.sampleRate}
                onChange={(event) => updateOptions({ sampleRate: event.target.value === 'original' ? 'original' : Number(event.target.value) as 44100 | 48000 })}
              >
                <option value="original">保持原始</option>
                <option value="44100">44.1 kHz</option>
                <option value="48000">48 kHz</option>
              </select>
            </label>
            <label>
              <span>声道</span>
              <select
                value={options.channels}
                onChange={(event) => updateOptions({ channels: event.target.value as AudioConversionOptions['channels'] })}
              >
                <option value="original">保持原始</option>
                <option value="mono">单声道</option>
                <option value="stereo">立体声</option>
              </select>
            </label>
          </div>

          <div className={audioStyles.settingGroup}>
            <label className={audioStyles.metadataToggle}>
              <input
                type="checkbox"
                checked={options.preserveMetadata}
                onChange={(event) => updateOptions({ preserveMetadata: event.target.checked })}
              />
              <span>保留歌曲标签<small>尽力保留歌名、艺术家、专辑与兼容的封面。</small></span>
            </label>
          </div>

          <div className={audioStyles.engineNote}>
            <Info aria-hidden="true" />
            <p>首次转换会从本站加载约 31 MB 的本地转码核心，之后按队列逐个处理。</p>
          </div>

          <div className={audioStyles.buttonStack}>
            <button
              className="button button-primary"
              type="button"
              disabled={busy || !items.some((item) => item.inputFormat && item.status !== 'error')}
              onClick={() => void runConversion()}
            >
              {busy ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Play aria-hidden="true" />}
              {engineLoading ? '正在加载引擎' : converting ? '正在转换' : `开始转换${items.length ? `（${items.length}）` : ''}`}
            </button>
            {converting ? (
              <button className={`button ${audioStyles.cancelButton}`} type="button" onClick={cancelConversion}>
                <Square aria-hidden="true" /> 停止转换
              </button>
            ) : null}
          </div>
        </aside>

        <section className={styles.filesPanel} aria-labelledby="audio-files-title">
          <header className={styles.filesHeader}>
            <div>
              <h2 id="audio-files-title">音频列表</h2>
              <span>{items.length} / {MAX_AUDIO_FILES} 个文件</span>
            </div>
            {items.length ? (
              <div className={styles.headerActions}>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}><Plus /> 添加音频</button>
                <button type="button" onClick={clearAll} disabled={busy}><Trash2 /> 清空</button>
              </div>
            ) : null}
          </header>

          <p className={audioStyles.noticeBar} aria-live="polite">{notice}</p>

          <div
            className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''} ${items.length ? styles.compactDropZone : ''}`}
            onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              addFiles(Array.from(event.dataTransfer.files))
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={AUDIO_ACCEPT}
              multiple
              aria-label="选择音频文件"
              onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
            />
            <span className={styles.uploadIcon}><UploadCloud aria-hidden="true" /></span>
            <div>
              <h3>{dragging ? '松开即可添加音频' : '拖拽音频到这里，或点击选择'}</h3>
              <p>输入支持 MP3、WAV、FLAC、M4A、AAC、OGG、Opus，以及 WMA、AIFF</p>
            </div>
            <button type="button" className="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <Music2 aria-hidden="true" /> 选择音频
            </button>
          </div>

          {items.length ? (
            <div className={styles.fileList} aria-label="待转换音频">
              {items.map((item) => (
                <article className={`${styles.fileItem} ${item.status === 'error' ? styles.fileError : ''}`} key={item.id}>
                  <div className={`${styles.thumbnail} ${audioStyles.artwork}`}><FileAudio aria-hidden="true" /></div>
                  <div className={styles.fileInfo}>
                    <strong title={item.file.name}>{item.file.name}</strong>
                    <p>
                      <span>{item.inputFormat?.toUpperCase() ?? '读取中'}</span>
                      <span>{formatAudioDuration(item.duration)}</span>
                      <span>{formatBytes(item.file.size)}</span>
                    </p>
                    {item.status === 'converting' ? (
                      <div className={audioStyles.progressTrack} aria-label={`转换进度 ${item.progress}%`}>
                        <span style={{ width: `${item.progress}%` }} />
                      </div>
                    ) : null}
                    {item.error ? <small className={styles.errorText}>{item.error}</small> : null}
                    {item.result?.warnings.map((warning) => <small className={audioStyles.warningText} key={warning}>{warning}</small>)}
                  </div>
                  <span className={`${styles.status} ${styles[item.status]}`}>
                    {item.status === 'done' ? <Check aria-hidden="true" /> : null}
                    {item.status === 'converting' ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : null}
                    {statusText(item)}
                  </span>
                  <div className={styles.resultInfo}>
                    {item.result && item.resultUrl ? (
                      <>
                        <span><strong>{item.result.format.toUpperCase()}</strong> · {formatBytes(item.result.blob.size)}</span>
                        <small>{item.result.durationMs < 1 ? '<1 ms' : `${Math.round(item.result.durationMs)} ms`}</small>
                      </>
                    ) : null}
                    {item.inputFormat && item.status !== 'converting' ? (
                      <div className={audioStyles.resultActions}>
                        <button
                          className={audioStyles.retryButton}
                          type="button"
                          aria-expanded={item.metadataExpanded}
                          aria-label={`编辑 ${item.file.name} 的歌曲信息`}
                          onClick={() => toggleMetadataEditor(item.id)}
                        >
                          <FilePenLine aria-hidden="true" /> 歌曲信息
                          {item.metadataExpanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                        </button>
                        {item.result && item.resultUrl ? (
                          <a href={item.resultUrl} download={item.result.fileName} aria-label={`下载 ${item.result.fileName}`}>
                            <Download aria-hidden="true" /> 下载
                          </a>
                        ) : null}
                        <button className={audioStyles.retryButton} type="button" onClick={() => retryItem(item.id)}>
                          <RefreshCcw aria-hidden="true" /> 重新转换
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    className={styles.removeButton}
                    type="button"
                    aria-label={`移除 ${item.file.name}`}
                    disabled={busy}
                    onClick={() => removeItem(item.id)}
                  ><X aria-hidden="true" /></button>
                  <div className={audioStyles.audioPlayers}>
                    <label>原音频<audio controls preload="metadata" src={item.sourceUrl} /></label>
                    {item.resultUrl ? <label>转换结果<audio controls preload="metadata" src={item.resultUrl} /></label> : null}
                  </div>
                  {item.metadataExpanded ? (
                    <AudioMetadataEditor
                      itemName={item.file.name}
                      metadata={item.metadata}
                      coverUrl={item.coverUrl}
                      disabled={busy}
                      onChange={(field, value) => updateItemMetadata(item.id, field, value)}
                      onCoverChange={(file) => updateItemCover(item.id, file)}
                      onCoverRemove={() => removeItemCover(item.id)}
                    />
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          {completedCount ? (
            <div className={styles.resultBar}>
              <div><Check aria-hidden="true" /><span><strong>{completedCount} 个音频转换完成</strong><small>可单独试听、下载或打包为 ZIP</small></span></div>
              <button className="button button-primary" type="button" onClick={() => void downloadAll()}>
                <Archive aria-hidden="true" /> 下载全部
              </button>
            </div>
          ) : null}
        </section>

        <section className={styles.privacyBar} aria-label="音频隐私说明">
          <ShieldCheck aria-hidden="true" />
          <div><strong>音频仅在本机浏览器中处理，不上传服务器</strong><span>离开页面或清空列表后不会保留文件。</span></div>
          <button type="button" onClick={() => updateOptions(DEFAULT_AUDIO_OPTIONS)} disabled={busy}><RotateCcw aria-hidden="true" /> 恢复默认设置</button>
        </section>
      </main>
    </div>
  )
}
