import {
  Archive,
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileAudio,
  FilePenLine,
  FolderOpen,
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
import { AudioToolNav } from '../components/AudioToolNav'
import { pauseAudioPreviews, readMediaDuration } from '../features/audio-shared/media'
import { useAudioLeaveWarning } from '../features/audio-shared/useAudioLeaveWarning'
import { buildAudioExportEntries, collectAudioDrop, selectAudioImports, type AudioImportEntry } from '../features/audio-conversion/batch'
import { inspectLosslessFile, LOSSLESS_ACCEPT, LOSSLESS_INPUT_NOTICE, supportsLosslessInput } from '../features/audio-conversion/lossless'
import {
  AUDIO_ACCEPT,
  OUTPUT_FORMATS,
  bitrateRange,
  describeAudioError,
  estimateAudioOutputSize,
  formatAudioDuration,
  inspectAudioFile,
  qualityLabel,
} from '../features/audio-conversion/audio'
import {
  DEFAULT_AUDIO_OPTIONS,
  AUDIO_FILE_SIZE_LIMIT_LABEL,
  AUDIO_BATCH_SIZE_LIMIT_LABEL,
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

function BitrateInput({ value, range, onCommit }: { value: number; range: { min: number; max: number }; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    const parsed = Number(draft)
    const next = draft.trim() && Number.isFinite(parsed) ? Math.max(range.min, Math.min(range.max, Math.round(parsed))) : value
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }
  return <input type="number" aria-label="码率数值" min={range.min} max={range.max} step="1" value={draft}
    title={`输入 ${range.min}–${range.max} kbps，离开输入框后应用`} onChange={event => setDraft(event.target.value)}
    onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} />
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function compressionSummary(originalBytes: number, outputBytes: number) {
  const saved = originalBytes - outputBytes
  if (!saved) return '体积未变化'
  const percent = (Math.abs(saved) / originalBytes * 100).toFixed(1)
  return `${saved > 0 ? '节省' : '体积增加'} ${formatBytes(Math.abs(saved))}（${percent}%）`
}

function statusText(item: AudioQueueItem) {
  if (item.status === 'converting') return `${item.progress}%`
  if (item.status === 'done') return '已完成'
  if (item.status === 'error') return '处理失败'
  if (item.status === 'cancelled') return '已停止'
  return item.inputFormat ? '等待转换' : '读取中'
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
  const [packaging, setPackaging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState('')
  const [queueFilter, setQueueFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [batchProgress, setBatchProgress] = useState({ total: 0, processed: 0, name: '' })
  const [notice, setNotice] = useState('请选择需要转换的音频文件。')
  useAudioLeaveWarning(items.length > 0)
  const losslessMode = options.mode === 'lossless'
  const canProcess = (item: AudioQueueItem) => item.inputFormat
    && (!losslessMode || supportsLosslessInput(item.inputFormat))
    && ['queued', 'cancelled'].includes(item.status)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const importControllerRef = useRef<AbortController | null>(null)
  const engineRef = useRef<AudioConversionEngine | null>(null)
  const itemsRef = useRef(items)
  const operationRef = useRef(0)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  const archiveControllerRef = useRef<AbortController | null>(null)
  const preparationRef = useRef(new Map<string, AbortController>())

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    mountedRef.current = true
    folderInputRef.current?.setAttribute('webkitdirectory', '')
    const preparations = preparationRef.current
    return () => {
      mountedRef.current = false
      operationRef.current += 1
      engineRef.current?.dispose()
      engineRef.current = null
      archiveControllerRef.current?.abort()
      importControllerRef.current?.abort()
      preparations.forEach((controller) => controller.abort())
      preparations.clear()
      itemsRef.current.forEach((item) => {
        URL.revokeObjectURL(item.sourceUrl)
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
        if (item.coverUrl) URL.revokeObjectURL(item.coverUrl)
      })
    }
  }, [])

  const updateOptions = (next: Partial<AudioConversionOptions>) => {
    if (busyRef.current) return
    setOptions((current) => ({ ...current, ...next }))
    setItems((current) => current.map((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      return item.inputFormat
        ? { ...item, status: 'queued', progress: 0, error: null, result: null, resultUrl: null }
        : item
    }))
    setNotice('输出设置已更新，请重新执行转换。')
  }

  const updateProcessingMode = (mode: AudioConversionOptions['mode']) => {
    if (busyRef.current || mode === options.mode) return
    setOptions((current) => ({ ...current, mode, preserveMetadata: true }))
    itemsRef.current = itemsRef.current.map((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      return {
        ...item,
        status: item.inputFormat ? 'queued' as const : item.status,
        progress: 0,
        error: item.inputFormat ? null : item.error,
        result: null,
        resultUrl: null,
        metadataExpanded: mode === 'metadata-only' ? true : item.metadataExpanded,
      }
    })
    setItems(itemsRef.current)
    setNotice(mode === 'metadata-only'
      ? '已切换为仅修改信息：保持原格式和音质，只写入歌曲标签与兼容封面。'
      : mode === 'lossless'
        ? '已切换为无损压缩：输出 FLAC，保留原采样率、位深和声道，压缩后校验采样数据。'
        : '已切换为格式转换，可重新设置格式与输出质量。')
  }

  const prepareItems = async (additions: AudioQueueItem[]) => {
    const prepared = await Promise.all(additions.map(async item => {
      const controller = new AbortController()
      preparationRef.current.set(item.id, controller)
      try {
        const format = await inspectAudioFile(item.file)
        if (controller.signal.aborted) { preparationRef.current.delete(item.id); return null }
        setItems(current => current.map(entry => entry.id === item.id ? { ...entry, inputFormat: format } : entry))
        return { item, format, controller }
      } catch (error) {
        if (!controller.signal.aborted) setItems(current => current.map(entry => entry.id === item.id
          ? { ...entry, status: 'error', error: describeAudioError(error) } : entry))
        preparationRef.current.delete(item.id)
        return null
      }
    }))
    let next = 0
    const readDurations = async () => {
      while (next < prepared.length) {
        const entry = prepared[next++]
        if (!entry) continue
        const { item, format, controller } = entry
        try {
          if (controller.signal.aborted) continue
          let duration: number | null = null
          if (supportsLosslessInput(format)) {
            const info = await inspectLosslessFile(item.file, format).catch(() => null)
            if (info?.sampleFrames) duration = info.sampleFrames / info.sampleRate
          }
          if (duration === null && !controller.signal.aborted) duration = await readMediaDuration(item.sourceUrl, controller.signal)
          if (!controller.signal.aborted) setItems(current => current.map(row => row.id === item.id ? { ...row, duration } : row))
        } finally { preparationRef.current.delete(item.id) }
      }
    }
    await Promise.all([readDurations(), readDurations()])
  }

  const addFiles = (files: AudioImportEntry[], folder = false, extraNote = '') => {
    if (busyRef.current) return
    try {
      const { selected, unsupported, limited, invalid } = selectAudioImports(files, itemsRef.current.map(item => item.file), folder)
      const summary = `已添加 ${selected.length} 个音频。` + (unsupported ? `已忽略 ${unsupported} 个非 WAV/AIFF/FLAC 文件。` : '')
        + (limited ? `${limited} 个文件因数量或大小限制未添加。` : '') + (invalid ? `${invalid} 个路径无效的文件未添加。` : '') + extraNote
      setImportSummary(summary)
      if (!selected.length) { setNotice(`没有可添加的文件。${summary}`); return }
      if (folder) updateProcessingMode('lossless')
      const additions = selected.map<AudioQueueItem>(({ file, relativePath }) => ({
        id: createId(),
        file,
        relativePath,
        inputFormat: null,
        sourceUrl: URL.createObjectURL(file),
        duration: null,
        status: 'queued',
        progress: 0,
        error: null,
        result: null,
        resultUrl: null,
        metadata: { ...EMPTY_AUDIO_METADATA },
        metadataExpanded: !folder && options.mode === 'metadata-only',
        coverFile: null,
        coverUrl: null,
      }))
      itemsRef.current = [...itemsRef.current, ...additions]
      setItems(itemsRef.current)
      setQueueFilter('all'); setQuery('')
      setNotice(folder ? '已进入无损压缩模式，文件夹及子目录中的音频将按顺序处理。' : '正在读取音频信息，可一次添加多个文件。')
      void prepareItems(additions)
    } catch (error) {
      setNotice(describeAudioError(error))
    }
  }

  const importDrop = async (transfer: DataTransfer) => {
    if (busyRef.current) return
    const controller = new AbortController()
    importControllerRef.current = controller
    busyRef.current = true
    setImporting(true)
    setNotice('正在读取拖入的文件与文件夹…')
    try {
      const selection = await collectAudioDrop(transfer, controller.signal)
      if (controller.signal.aborted || !mountedRef.current) return
      busyRef.current = false
      addFiles(selection.files, selection.folder,
        (selection.unreadable ? `${selection.unreadable} 项无法读取。` : '') + (selection.truncated ? '目录过大，仅扫描前 10,000 项或 64 层目录。' : ''))
    } catch (error) {
      if (mountedRef.current && !controller.signal.aborted) setNotice(describeAudioError(error))
    } finally {
      if (importControllerRef.current === controller) {
        importControllerRef.current = null
        busyRef.current = false
        if (mountedRef.current) setImporting(false)
      }
    }
  }

  const removeItem = (id: string) => {
    if (busyRef.current) return
    preparationRef.current.get(id)?.abort()
    itemsRef.current = itemsRef.current.filter((item) => item.id !== id)
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.sourceUrl)
      if (target?.resultUrl) URL.revokeObjectURL(target.resultUrl)
      if (target?.coverUrl) URL.revokeObjectURL(target.coverUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  const clearAll = () => {
    if (busyRef.current) return
    pauseAudioPreviews()
    engineRef.current?.dispose(); engineRef.current = null
    preparationRef.current.forEach((controller) => controller.abort())
    items.forEach((item) => {
      URL.revokeObjectURL(item.sourceUrl)
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      if (item.coverUrl) URL.revokeObjectURL(item.coverUrl)
    })
    setItems([])
    itemsRef.current = []
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
    setImportSummary('')
    setQueueFilter('all'); setQuery('')
    setNotice('列表已清空，音频文件不会保留。')
  }

  const resetItemResult = (item: AudioQueueItem) => {
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
    return item.inputFormat
      ? { ...item, status: 'queued' as const, progress: 0, error: null, result: null, resultUrl: null }
      : item
  }

  const updateItemMetadata = (id: string, field: keyof AudioMetadata, value: string) => {
    if (busyRef.current) return
    setItems((current) => current.map((item) => item.id === id
      ? { ...resetItemResult(item), metadata: { ...item.metadata, [field]: value } }
      : item))
    setNotice('歌曲信息已更新，转换时会写入新标签。')
  }

  const updateItemCover = (id: string, file: File) => {
    if (busyRef.current) return
    if (file.size > 10 * 1024 * 1024) {
      setNotice('封面图片不能超过 10 MB。')
      return
    }
    if (!itemsRef.current.some(item => item.id === id)) return
    const coverUrl = URL.createObjectURL(file)
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item
      if (item.coverUrl) URL.revokeObjectURL(item.coverUrl)
      return {
        ...resetItemResult(item),
        coverFile: file,
        coverUrl,
      }
    }))
    setNotice('新封面已添加，支持封面的目标格式会优先写入。')
  }

  const removeItemCover = (id: string) => {
    if (busyRef.current) return
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

  const getEngine = async (operation: number) => {
    if (engineRef.current) return engineRef.current
    setEngineLoading(true)
    setNotice('正在初始化本地转换引擎，首次加载约 31 MB。')
    try {
      const engine = await engineFactory()
      if (operation !== operationRef.current) { engine.dispose(); throw new Error('Cancelled') }
      engineRef.current = engine
      try { await engine.load() } catch (error) {
        if (engineRef.current === engine) { engine.dispose(); engineRef.current = null }
        throw error
      }
      if (operation !== operationRef.current) throw new Error('Cancelled')
      return engine
    } finally {
      if (operation === operationRef.current) setEngineLoading(false)
    }
  }

  const runConversion = async (retryFailed = false) => {
    const ready = itemsRef.current.filter(item => retryFailed
      ? item.inputFormat && item.status === 'error' && (!losslessMode || supportsLosslessInput(item.inputFormat)) : canProcess(item))
    if (!ready.length || busyRef.current) {
      setNotice('请先添加可读取的音频文件。')
      return
    }
    setConverting(true)
    pauseAudioPreviews()
    busyRef.current = true
    const operation = ++operationRef.current
    setBatchProgress({ total: ready.length, processed: 0, name: '' })
    let completed = 0
    try {
      await getEngine(operation)
      if (operation !== operationRef.current) return
      setNotice(options.mode === 'metadata-only'
        ? `正在按顺序写入 ${ready.length} 个文件的歌曲信息。`
        : losslessMode ? `正在无损压缩并校验 ${ready.length} 个文件。` : `正在按顺序转换 ${ready.length} 个文件。`)
      for (const [index, item] of ready.entries()) {
        if (operation !== operationRef.current) return
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
        setBatchProgress({ total: ready.length, processed: index, name: item.relativePath || item.file.name })
        setItems((current) => current.map((entry) => entry.id === item.id
          ? { ...entry, status: 'converting', progress: 0, error: null, result: null, resultUrl: null }
          : entry))
        try {
          const engine = await getEngine(operation)
          const result = await engine.convert(
            {
              file: item.file,
              inputFormat: item.inputFormat!,
              options: losslessMode ? { ...options, format: 'flac', sampleRate: 'original', channels: 'original' } : options,
              metadata: item.metadata,
              coverFile: item.coverFile,
            },
            (progress) => {
              if (operation === operationRef.current) setItems((current) => current.map((entry) => entry.id === item.id
                ? { ...entry, progress }
                : entry))
            },
          )
          if (operation !== operationRef.current) return
          const resultUrl = URL.createObjectURL(result.blob)
          setItems((current) => current.map((entry) => {
            if (entry.id !== item.id) return entry
            if (entry.resultUrl) URL.revokeObjectURL(entry.resultUrl)
            return { ...entry, status: 'done', progress: 100, result, resultUrl, error: null }
          }))
          completed += 1
        } catch (error) {
          if (operation !== operationRef.current) return
          setItems((current) => current.map((entry) => entry.id === item.id
            ? { ...entry, status: 'error', error: describeAudioError(error), progress: 0 }
            : entry))
        }
        if (operation === operationRef.current) setBatchProgress({ total: ready.length, processed: index + 1, name: '' })
      }
      if (operation === operationRef.current) {
        setNotice(completed === ready.length
          ? options.mode === 'metadata-only'
            ? `信息处理完成，共生成 ${completed} 个保持原音质的音频文件，填写的文本标签已回读校验。`
            : losslessMode ? `无损压缩完成，${completed} 个文件的音频参数和采样数据均已校验。` : `转换完成，共生成 ${completed} 个音频文件。`
          : `已完成 ${completed} 个文件，失败项可查看具体原因。`)
      }
    } catch (error) {
      if (operation === operationRef.current) setNotice(describeAudioError(error))
    } finally {
      if (operation === operationRef.current) { busyRef.current = false; setConverting(false) }
    }
  }

  const cancelConversion = () => {
    operationRef.current += 1
    engineRef.current?.cancel()
    engineRef.current = null
    busyRef.current = false
    setConverting(false)
    setEngineLoading(false)
    setItems((current) => current.map((item) => item.status === 'converting'
      ? { ...item, status: 'cancelled', progress: 0 }
      : item))
    setNotice(losslessMode ? '已停止无损压缩，等待项目可重新开始。' : '已停止当前转换，等待项目可重新开始。')
  }

  const retryItem = (id: string) => {
    if (busyRef.current) return
    setItems((current) => current.map((item) => {
      if (item.id !== id || !item.inputFormat) return item
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      return { ...item, status: 'queued', progress: 0, error: null, result: null, resultUrl: null }
    }))
    setNotice('已将文件放回等待队列。')
  }

  const downloadResults = async () => {
    const finished = items.filter((item) => item.result)
    if (!finished.length || busyRef.current) return
    busyRef.current = true
    setPackaging(true)
    const controller = new AbortController()
    archiveControllerRef.current = controller
    setNotice('正在生成 ZIP 压缩包。')
    try {
      const { createZip } = await import('../features/files/zip')
      const archive = await createZip(buildAudioExportEntries(finished), controller.signal, (index, total) => {
        if (mountedRef.current) setNotice(`正在打包 ${index + 1}/${total}，保留子目录与全部同名结果。`)
      })
      if (!mountedRef.current || controller.signal.aborted) return
      const url = URL.createObjectURL(archive)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = losslessMode ? 'YL-AudioLab-lossless.zip' : 'YL-AudioLab-converted.zip'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setNotice(`已打包 ${finished.length} 个转换结果。`)
    } catch {
      if (mountedRef.current) setNotice(controller.signal.aborted
        ? '已停止 ZIP 打包，处理结果仍保留。'
        : 'ZIP 打包失败，请重试或单独下载。')
    } finally {
      archiveControllerRef.current = null
      busyRef.current = false
      if (mountedRef.current) setPackaging(false)
    }
  }

  const completedCount = items.filter((item) => item.status === 'done').length
  const folderBatch = items.some(item => item.relativePath?.includes('/'))
  const failedCount = items.filter(item => item.status === 'error').length
  const retryableCount = items.filter(item => item.status === 'error' && item.inputFormat && (!losslessMode || supportsLosslessInput(item.inputFormat))).length
  const completedSourceBytes = items.reduce((sum, item) => sum + (item.result ? item.file.size : 0), 0)
  const completedOutputBytes = items.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0)
  const activeProgress = items.find(item => item.status === 'converting')?.progress ?? 0
  const singleFinishedItem = completedCount === 1
    ? items.find((item) => item.status === 'done' && item.result && item.resultUrl)
    : undefined
  const metadataOnly = options.mode === 'metadata-only'
  const selectedFormat = OUTPUT_FORMATS.find((format) => format.value === options.format)!
  const selectedBitrateRange = bitrateRange(options.format)
  const estimatedBytes = items.reduce((total, item) => {
    const estimate = estimateAudioOutputSize(item.duration, options)
    return estimate === null ? total : total + estimate
  }, 0)
  const busy = converting || engineLoading || packaging || importing
  const readingFormats = items.some(item => !item.inputFormat && item.status === 'queued')
  const readyCount = items.filter(canProcess).length
  const visibleItems = items.filter(item => (queueFilter === 'all' || (queueFilter === 'queued'
    ? ['queued', 'cancelled', 'converting'].includes(item.status) : item.status === queueFilter))
    && (item.relativePath || item.file.name).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return (
    <div className={styles.page}>
      <ToolHeader toolName="本地音频格式转换工具" />
      <main className={`page-shell ${styles.workspace} ${audioStyles.audioWorkspace}`} onPlayCapture={event => { if (event.target instanceof HTMLMediaElement) pauseAudioPreviews(event.target) }}>
        <section className={styles.intro}>
          <div>
            <span className={`${styles.introIcon} ${audioStyles.audioIcon}`}><AudioLines aria-hidden="true" /></span>
            <div>
              <h1>音频格式转换</h1>
              <p>单首或批量转换格式、无损压缩与编辑歌曲信息。</p>
            </div>
          </div>
          <span className={styles.localBadge}><ShieldCheck aria-hidden="true" /> 全程本地处理</span>
        </section>

        <AudioToolNav />

        <aside className={styles.settings} aria-label="音频转换设置">
          <header>
            <div><Gauge aria-hidden="true" /><h2>处理设置</h2></div>
            <span>{metadataOnly ? '原格式' : losslessMode ? 'FLAC 无损' : selectedFormat.label}</span>
          </header>

          <fieldset className={audioStyles.modeFieldset}>
            <legend>处理方式</legend>
            <div className={audioStyles.modeGrid}>
              <button
                type="button"
                aria-pressed={options.mode === 'transcode'}
                disabled={busy}
                onClick={() => updateProcessingMode('transcode')}
              >
                <strong>格式转换</strong>
                <small>调整格式、音质与大小</small>
              </button>
              <button
                type="button"
                aria-pressed={metadataOnly}
                disabled={busy}
                onClick={() => updateProcessingMode('metadata-only')}
              >
                <strong>仅修改信息</strong>
                <small>保持原格式和原音质</small>
              </button>
              <button
                type="button"
                className={audioStyles.losslessMode}
                aria-label="无损压缩"
                aria-pressed={losslessMode}
                disabled={busy}
                onClick={() => updateProcessingMode('lossless')}
              >
                <strong>无损压缩</strong>
                <small>FLAC · 保留精度并校验</small>
              </button>
            </div>
          </fieldset>

          {options.mode === 'transcode' ? <><fieldset className={styles.formatFieldset} disabled={busy}>
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

          <fieldset className={audioStyles.liveSettings} disabled={busy} aria-label="质量采样率与声道设置">
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
                      <BitrateInput key={`${options.format}-${options.customBitrateKbps}`} value={options.customBitrateKbps} range={selectedBitrateRange}
                        onCommit={value => updateOptions({ customBitrateKbps: value })} />
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
                  : 'FLAC 文件大小由内容决定；需要保留原始参数并校验采样数据，请选择“无损压缩”。'}
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
          </fieldset>
          </> : losslessMode ? (
            <div className={audioStyles.metadataOnlyNote}>
              <ShieldCheck aria-hidden="true" />
              <div>
                <strong>保留原采样率、位深与声道</strong>
                <p>支持 16/24 位整数 PCM WAV、AIFF 和 FLAC，统一压缩为 FLAC。完成后校验全部音频采样，校验通过才提供下载。</p>
                <p>已有 FLAC 通常压缩空间有限；若输出更大，会明确提示。浮点音频和其他位深暂不支持。</p>
              </div>
            </div>
          ) : (
            <div className={audioStyles.metadataOnlyNote}>
              <FilePenLine aria-hidden="true" />
              <div>
                <strong>音频流原样复制</strong>
                <p>每个文件保持原格式、码率、采样率和声道，仅更新下方填写的歌曲信息及兼容封面。</p>
              </div>
            </div>
          )}

          {!losslessMode && (metadataOnly ? items.some(item => item.inputFormat === 'wav') : options.format === 'wav') ? (
            <div className={audioStyles.settingGroup}>
              <label className={audioStyles.wavEncoding}>
                <span>WAV 标签编码</span>
                <select
                  value={options.wavMetadataEncoding}
                  disabled={busy}
                  onChange={(event) => updateOptions({ wavMetadataEncoding: event.target.value as AudioConversionOptions['wavMetadataEncoding'] })}
                >
                  <option value="gbk">Windows 简体中文兼容（GBK）</option>
                  <option value="utf-8">Unicode 通用（UTF-8）</option>
                </select>
              </label>
              <small>GBK 适用于简体中文 Windows 属性页；其他系统或特殊字符可选 UTF-8，但 Windows 可能显示乱码。仅修改标签，不改变音质。</small>
            </div>
          ) : null}

          <div className={audioStyles.settingGroup}>
            <label className={audioStyles.metadataToggle}>
              <input
                type="checkbox"
                disabled={busy}
                checked={options.preserveMetadata}
                onChange={(event) => updateOptions({ preserveMetadata: event.target.checked })}
              />
              <span>{metadataOnly ? '保留未修改的原始标签' : '保留歌曲标签'}<small>尽力保留歌名、艺术家、专辑与兼容的封面。</small></span>
            </label>
          </div>

          <div className={audioStyles.engineNote}>
            <Info aria-hidden="true" />
            <p>单个输入最多 {AUDIO_FILE_SIZE_LIMIT_LABEL}，每批共 {AUDIO_BATCH_SIZE_LIMIT_LABEL}；单个输出上限 256 MB，超限不提供截断结果。引擎按需加载约 31 MB，原文件按需读取、逐个处理。</p>
          </div>

          <div className={audioStyles.buttonStack}>
            <button
              className="button button-primary"
              type="button"
              disabled={busy || readingFormats || !readyCount}
              onClick={() => void runConversion()}
            >
              {busy ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Play aria-hidden="true" />}
              {engineLoading
                ? '正在加载引擎'
                : converting
                  ? metadataOnly ? '正在写入信息' : losslessMode ? '正在压缩与校验' : '正在转换'
                  : `${metadataOnly ? '写入歌曲信息' : losslessMode ? '开始无损压缩' : '开始转换'}${items.length ? `（${readyCount}）` : ''}`}
            </button>
            {converting ? (
              <button className={`button ${audioStyles.cancelButton}`} type="button" onClick={cancelConversion}>
                <Square aria-hidden="true" /> {losslessMode ? '停止压缩' : '停止转换'}
              </button>
            ) : null}
            {retryableCount ? <button className="button" type="button" disabled={busy || readingFormats} onClick={() => void runConversion(true)}>
              <RefreshCcw aria-hidden="true" /> 重试失败项（{retryableCount}）
            </button> : null}
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
          {importSummary ? <p className={audioStyles.importSummary} aria-label="导入摘要">{importSummary}</p> : null}
          {importing ? <button className={`button ${audioStyles.importStop}`} type="button" onClick={() => { importControllerRef.current?.abort(); setNotice('已停止读取文件夹。') }}>停止读取</button> : null}
          {converting ? <div className={audioStyles.batchProgress}>
            <span>已处理 {batchProgress.processed}/{batchProgress.total}{batchProgress.name ? ` · ${batchProgress.name}` : ''}</span>
            <progress aria-label="批量处理进度" max={Math.max(1, batchProgress.total * 100)} value={batchProgress.processed * 100 + activeProgress} />
          </div> : null}
          {folderBatch ? <p className={audioStyles.importSummary}><FolderOpen aria-hidden="true" /> 已保留文件夹路径；下载 ZIP 时保留子目录，同名结果自动编号。</p> : null}

          <div
            className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''} ${items.length ? styles.compactDropZone : ''}`}
            onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void importDrop(event.dataTransfer)
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={losslessMode ? LOSSLESS_ACCEPT : AUDIO_ACCEPT}
              disabled={busy}
              multiple
              aria-label="选择音频文件"
              onChange={(event) => { addFiles(Array.from(event.target.files ?? [], file => ({ file }))); event.target.value = '' }}
            />
            <input ref={folderInputRef} type="file" multiple disabled={busy} aria-label="选择音频无损压缩文件夹"
              onChange={event => { addFiles(Array.from(event.target.files ?? [], file => ({ file, relativePath: file.webkitRelativePath || file.name })), true); event.target.value = '' }} />
            <span className={styles.uploadIcon}><UploadCloud aria-hidden="true" /></span>
            <div>
              <h3>{dragging ? '松开即可添加音频或文件夹' : '拖入多个音频或文件夹，或点击选择'}</h3>
              <p>{losslessMode ? '支持 16/24 位整数 PCM WAV、AIFF 和 FLAC；压缩效果以实际结果为准' : '输入支持 MP3、WAV、FLAC、M4A、AAC、OGG、Opus，以及 WMA、AIFF'}</p>
            </div>
            <div className={audioStyles.importActions}>
              <button type="button" className="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                <Music2 aria-hidden="true" /> 选择音频
              </button>
              <button type="button" className="button" onClick={() => folderInputRef.current?.click()} disabled={busy}>
                <FolderOpen aria-hidden="true" /> 文件夹无损压缩
              </button>
            </div>
          </div>

          {items.length ? <div className={audioStyles.queueControls}>
            <input type="search" aria-label="搜索音频文件" placeholder="搜索文件名或文件夹…" value={query} onChange={event => setQuery(event.target.value)} />
            <select aria-label="筛选音频状态" value={queueFilter} onChange={event => setQueueFilter(event.target.value)}>
              <option value="all">全部（{items.length}）</option><option value="queued">等待 / 处理中</option>
              <option value="done">已完成（{completedCount}）</option><option value="error">失败（{failedCount}）</option>
            </select><span>显示 {visibleItems.length} / {items.length}</span>
          </div> : null}
          {items.length ? (
            <div className={`${styles.fileList} ${items.length > 20 ? audioStyles.batchList : ''}`} aria-label="待转换音频" tabIndex={items.length > 20 ? 0 : undefined}>
              {!visibleItems.length ? <p className={audioStyles.importSummary}>没有匹配的音频。筛选不会改变处理队列或下载结果。</p> : null}
              {visibleItems.map((item) => (
                <article className={`${styles.fileItem} ${item.status === 'error' ? styles.fileError : ''}`} key={item.id}>
                  <div className={`${styles.thumbnail} ${audioStyles.artwork}`}><FileAudio aria-hidden="true" /></div>
                  <div className={styles.fileInfo}>
                    <strong title={item.relativePath || item.file.name}>{item.relativePath || item.file.name}</strong>
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
                    {losslessMode && item.inputFormat && !supportsLosslessInput(item.inputFormat)
                      ? <small className={audioStyles.warningText}>{LOSSLESS_INPUT_NOTICE}</small> : null}
                    {item.result?.warnings.map((warning) => <small className={audioStyles.warningText} key={warning}>{warning}</small>)}
                  </div>
                  <span className={`${styles.status} ${styles[item.status]}`}>
                    {item.status === 'done' ? <Check aria-hidden="true" /> : null}
                    {item.status === 'converting' ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : null}
                    {losslessMode && item.inputFormat && !supportsLosslessInput(item.inputFormat)
                      ? '不适用' : statusText(item)}
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
                          disabled={busy}
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
                        <button className={audioStyles.retryButton} type="button" disabled={busy} onClick={() => retryItem(item.id)}>
                          <RefreshCcw aria-hidden="true" /> {metadataOnly ? '重新处理' : losslessMode ? '重新压缩' : '重新转换'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    className={styles.removeButton}
                    type="button"
                    aria-label={`移除 ${item.relativePath || item.file.name}`}
                    disabled={busy}
                    onClick={() => removeItem(item.id)}
                  ><X aria-hidden="true" /></button>
                  {item.result?.lossless ? (
                    <div className={audioStyles.losslessDetails} aria-label={`${item.file.name} 的无损压缩结果`}>
                      <strong>{formatBytes(item.file.size)} → {formatBytes(item.result.blob.size)} · {compressionSummary(item.file.size, item.result.blob.size)}</strong>
                      <span><ShieldCheck aria-hidden="true" /> 采样校验通过 · {item.result.lossless.sampleRate / 1000} kHz · {item.result.lossless.bitDepth} 位 · {item.result.lossless.channels} 声道</span>
                    </div>
                  ) : null}
                  <div className={audioStyles.audioPlayers}>
                    <label>原音频<audio controls preload="none" aria-label={`${item.file.name} 原音频试听`} src={item.sourceUrl} /></label>
                    {item.resultUrl ? <label>{losslessMode ? '压缩结果' : '转换结果'}<audio controls preload="none" aria-label={`${item.file.name} 结果试听`} src={item.resultUrl} /></label> : null}
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
            <p className={audioStyles.batchTotals} aria-label="批量结果汇总">已完成 {completedCount}/{items.length} 个文件{failedCount ? `，${failedCount} 个失败` : ''} · {formatBytes(completedSourceBytes)} → {formatBytes(completedOutputBytes)} · {compressionSummary(completedSourceBytes, completedOutputBytes)}</p>
          ) : null}
          {completedCount ? (
            <div className={styles.resultBar}>
              <div><Check aria-hidden="true" /><span><strong>{completedCount} 个音频{metadataOnly ? '信息修改' : losslessMode ? '无损压缩' : '转换'}完成</strong><small>{completedCount === 1 ? '可直接试听并下载文件' : '可单独试听、下载或打包为 ZIP'}</small></span></div>
              {!folderBatch && singleFinishedItem?.result && singleFinishedItem.resultUrl ? (
                <a
                  className="button button-primary"
                  href={singleFinishedItem.resultUrl}
                  download={singleFinishedItem.result.fileName}
                  onClick={() => setNotice(`已下载 ${singleFinishedItem.result!.fileName}。`)}
                >
                  <Download aria-hidden="true" /> 下载文件
                </a>
              ) : (
                <>
                  <button className="button button-primary" type="button" disabled={busy} onClick={() => void downloadResults()}>
                    <Archive aria-hidden="true" /> {packaging ? '正在打包…' : folderBatch ? '下载文件夹 ZIP' : '下载全部'}
                  </button>
                  {packaging ? <button className="button" type="button" onClick={() => archiveControllerRef.current?.abort()}>停止打包</button> : null}
                </>
              )}
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
