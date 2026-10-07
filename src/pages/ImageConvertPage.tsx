import {
  Archive,
  Check,
  ChevronDown,
  Download,
  FileImage,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Layers3,
  LoaderCircle,
  Minimize2,
  Palette,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ToolHeader } from '../components/SiteHeader'
import { compressImage, type CompressionProgress } from '../features/image-conversion/compression'
import { createPreviewBlob, convertImage, decodeImageFile } from '../features/image-conversion/engine'
import { buildImageExportEntries, selectFolderImages, writeImageFolder, type DirectoryPicker } from '../features/image-conversion/folders'
import { inspectLosslessFile } from '../features/image-conversion/lossless-info'
import {
  DEFAULT_COMPRESSION_OPTIONS,
  DEFAULT_IMAGE_OPTIONS,
  ICO_SIZES,
  ImageConversionError,
  MAX_IMAGE_FILES,
  MAX_FOLDER_IMAGES,
  MAX_FOLDER_INPUT_BYTES,
  type ImageCompressionOptions,
  type ImageConversionOptions,
  type ImageOutputFormat,
  type ImageQueueItem,
} from '../features/image-conversion/types'
import styles from './ImageConvertPage.module.css'

const formats: Array<{ value: ImageOutputFormat; label: string; detail: string }> = [
  { value: 'png', label: 'PNG', detail: '透明无损' },
  { value: 'jpeg', label: 'JPG', detail: '照片通用' },
  { value: 'webp', label: 'WebP', detail: '网页高效' },
  { value: 'bmp', label: 'BMP', detail: '标准位图' },
  { value: 'ico', label: 'ICO', detail: '应用图标' },
  { value: 'tga', label: 'TGA', detail: '游戏素材' },
  { value: 'dds', label: 'DDS', detail: '游戏纹理' },
]

const acceptedFiles = [
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.ico', '.tga', '.dds', '.gif', '.avif',
].join(',')

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatLabel(format: ImageOutputFormat) {
  return format === 'jpeg' ? 'JPG' : format.toUpperCase()
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function statusText(item: ImageQueueItem, mode: 'convert' | 'compress') {
  if (item.status === 'converting') return mode === 'convert' ? '转换中' : '压缩中'
  if (item.status === 'done') return '已完成'
  if (item.status === 'error') return '处理失败'
  return item.width ? mode === 'convert' ? '等待转换' : '等待压缩' : '读取中'
}

function sizeChangeText(before: number, after: number) {
  if (!before) return '原文件大小为 0 B'
  const change = Math.abs(1 - after / before) * 100
  const percent = change < 1 ? change.toFixed(1) : Math.round(change).toString()
  if (after < before) return `节省 ${formatBytes(before - after)}（${percent}%）`
  if (after > before) return `体积增加 ${formatBytes(after - before)}（${percent}%）`
  return '体积未减小'
}

export function ImageConvertPage() {
  const [items, setItems] = useState<ImageQueueItem[]>([])
  const [mode, setMode] = useState<'convert' | 'compress'>('convert')
  const [options, setOptions] = useState<ImageConversionOptions>(DEFAULT_IMAGE_OPTIONS)
  const [compressionOptions, setCompressionOptions] = useState<ImageCompressionOptions>(DEFAULT_COMPRESSION_OPTIONS)
  const [targetInput, setTargetInput] = useState('')
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [packaging, setPackaging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<{ index: number; total: number; file: string; detail: string } | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [notice, setNotice] = useState('请选择需要转换的图片。')
  const busy = converting || packaging || exporting
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef(items)
  const prepareQueueRef = useRef(Promise.resolve())
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const folderBatch = items.some((item) => item.relativePath)
  const directoryPicker = (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    mountedRef.current = true
    folderInputRef.current?.setAttribute('webkitdirectory', '')
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      itemsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      })
    }
  }, [])

  const invalidateResults = () => {
    setPreviewId(null)
    setItems((current) => current.map((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      return {
        ...item,
        status: item.width ? 'queued' : item.status === 'error' ? 'error' : 'queued',
        error: item.width ? null : item.error,
        result: null,
        resultUrl: null,
      }
    }))
  }

  const updateOptions = (next: Partial<ImageConversionOptions>) => {
    if (busy) return
    setOptions((current) => ({ ...current, ...next }))
    invalidateResults()
    setNotice('输出设置已更新，请重新执行转换。')
  }

  const updateCompressionOptions = (next: Partial<ImageCompressionOptions>) => {
    if (busy) return
    setCompressionOptions((current) => ({ ...current, ...next }))
    invalidateResults()
    setNotice('压缩设置已更新，请重新执行压缩。')
  }

  const changeMode = (next: 'convert' | 'compress') => {
    if (busy || next === mode) return
    setMode(next)
    invalidateResults()
    setNotice(next === 'convert' ? '已切换到格式转换。' : '已切换到图片压缩。')
  }

  const prepareItem = async (item: ImageQueueItem) => {
    if (!mountedRef.current || !itemsRef.current.some((entry) => entry.id === item.id)) return
    try {
      if (item.relativePath) {
        const info = await inspectLosslessFile(item.file)
        if (!mountedRef.current) return
        setItems((current) => current.map((entry) => entry.id === item.id
          ? { ...entry, inputFormat: info.format, width: info.width, height: info.height }
          : entry))
        return
      }
      const { format, image } = await decodeImageFile(item.file)
      const previewBlob = await createPreviewBlob(image)
      if (!mountedRef.current) return
      const previewUrl = URL.createObjectURL(previewBlob)
      setItems((current) => {
        if (!current.some((entry) => entry.id === item.id)) {
          URL.revokeObjectURL(previewUrl)
          return current
        }
        return current.map((entry) => {
          if (entry.id !== item.id) return entry
          URL.revokeObjectURL(entry.previewUrl)
          return { ...entry, inputFormat: format, width: image.width, height: image.height, previewUrl }
        })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法读取此图片。'
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, status: 'error', error: message }
        : entry))
    }
  }

  const addFiles = (files: File[]) => {
    if (busy) return
    if (!files.length) return
    const limit = folderBatch ? MAX_FOLDER_IMAGES : MAX_IMAGE_FILES
    const room = Math.max(0, limit - itemsRef.current.length)
    let addedBytes = itemsRef.current.reduce((sum, item) => sum + item.file.size, 0)
    const accepted = files.slice(0, room).filter((file) => {
      if (folderBatch && addedBytes + file.size > MAX_FOLDER_INPUT_BYTES) return false
      addedBytes += file.size
      return true
    })
    if (accepted.length < files.length) setNotice(`本批最多添加 ${limit} 张图片${folderBatch ? '、总输入 500 MB' : ''}，超出文件已忽略。`)
    else setNotice(`已添加 ${accepted.length} 个文件，正在读取图片信息。`)
    const additions = accepted.map<ImageQueueItem>((file) => ({
      id: createId(),
      file,
      inputFormat: null,
      previewUrl: URL.createObjectURL(file),
      width: null,
      height: null,
      status: 'queued',
      error: null,
      result: null,
      resultUrl: null,
    }))
    itemsRef.current = [...itemsRef.current, ...additions]
    setItems((current) => [...current, ...additions])
    additions.forEach((item) => {
      prepareQueueRef.current = prepareQueueRef.current.then(() => prepareItem(item))
    })
  }

  const addFolder = (files: File[]) => {
    if (busy || !files.length) return
    const selection = selectFolderImages(files, itemsRef.current.length,
      itemsRef.current.reduce((sum, item) => sum + item.file.size, 0))
    if (!selection.selected.length) {
      setNotice(`没有可添加的 PNG/JPG/WebP 图片。其他文件 ${selection.ignored} 个，超限 ${selection.limited} 个，不安全路径 ${selection.invalidPaths} 个。`)
      return
    }
    setMode('compress')
    setCompressionOptions((current) => ({ ...current, method: 'lossless' }))
    invalidateResults()
    const additions = selection.selected.map<ImageQueueItem>(({ file, relativePath }) => ({
      id: createId(), file, relativePath, inputFormat: null,
      previewUrl: URL.createObjectURL(file), width: null, height: null,
      status: 'queued', error: null, result: null, resultUrl: null,
    }))
    itemsRef.current = [...itemsRef.current, ...additions]
    setItems((current) => [...current, ...additions])
    for (const item of additions) prepareQueueRef.current = prepareQueueRef.current.then(() => prepareItem(item))
    setNotice(`已添加文件夹内 ${additions.length} 张图片，自动使用无损压缩。` +
      (selection.ignored ? `跳过 ${selection.ignored} 个其他文件。` : '') +
      (selection.limited ? `超出 500 张或总输入 500 MB 的 ${selection.limited} 个文件未添加。` : '') +
      (selection.invalidPaths ? `跳过 ${selection.invalidPaths} 个不安全路径。` : ''))
  }

  const removeItem = (id: string) => {
    if (busy) return
    if (previewId === id) setPreviewId(null)
    itemsRef.current = itemsRef.current.filter((item) => item.id !== id)
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      if (target?.resultUrl) URL.revokeObjectURL(target.resultUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  const clearAll = () => {
    if (busy) return
    setPreviewId(null)
    items.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
    })
    setItems([])
    itemsRef.current = []
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
    setNotice('列表已清空，图片没有上传或保存在服务器。')
  }

  const lossless = compressionOptions.method === 'lossless'
  const targetValid = lossless || targetInput === '' || (/^\d+$/.test(targetInput) &&
    Number(targetInput) >= 1 && Number(targetInput) <= 50_000)

  const runProcessing = async () => {
    if (mode === 'compress' && !targetValid) {
      setNotice('目标大小必须是 1–50,000 KB 的整数。')
      return
    }
    const ready = items.filter((item) => item.width && item.height && !item.error)
    if (!ready.length || busy) {
      setNotice('请先添加可读取的图片。')
      return
    }
    setConverting(true)
    setStopping(false)
    const controller = new AbortController()
    abortRef.current = controller
    const activeMode = mode
    const activeOptions = { ...options }
    const activeCompressionOptions = { ...compressionOptions }
    const verb = activeMode === 'convert' ? '转换' : '压缩'
    setNotice(`正在按顺序${verb} ${ready.length} 个文件。`)
    let completed = 0
    let stopped = false
    for (const [index, item] of ready.entries()) {
      if (controller.signal.aborted) { stopped = true; break }
      setProgress({ index: index + 1, total: ready.length, file: item.file.name, detail: '准备处理' })
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, status: 'converting', error: null }
        : entry))
      try {
        let lastProgressAt = 0
        const onProgress = ({ attempts, width, height, detail }: CompressionProgress) => {
          const now = performance.now()
          if (now - lastProgressAt < 150) return
          lastProgressAt = now
          setProgress({ index: index + 1, total: ready.length, file: item.relativePath || item.file.name, detail: detail ?? `优化第 ${attempts} 次 · ${width} × ${height} px` })
        }
        const result = activeMode === 'convert'
          ? await convertImage({ file: item.file, options: activeOptions })
          : await compressImage(item.file, activeCompressionOptions, { signal: controller.signal, onProgress })
        if (controller.signal.aborted || !mountedRef.current) {
          stopped = true
          setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'queued' } : entry))
          break
        }
        const resultUrl = URL.createObjectURL(result.blob)
        setItems((current) => current.map((entry) => {
          if (entry.id !== item.id) return entry
          if (entry.resultUrl) URL.revokeObjectURL(entry.resultUrl)
          return { ...entry, status: 'done', result, resultUrl, error: null }
        }))
        completed += 1
      } catch (error) {
        if (controller.signal.aborted) {
          stopped = true
          setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'queued' } : entry))
          break
        }
        const message = error instanceof ImageConversionError || error instanceof Error
          ? error.message
          : `图片${verb}失败。`
        setItems((current) => current.map((entry) => {
          if (entry.id !== item.id) return entry
          if (entry.resultUrl) URL.revokeObjectURL(entry.resultUrl)
          return { ...entry, status: 'error', error: message, result: null, resultUrl: null }
        }))
      }
    }
    abortRef.current = null
    setConverting(false)
    setStopping(false)
    setProgress(null)
    setNotice(stopped ? `已停止处理，保留已完成的 ${completed} 个结果。` : completed === ready.length
      ? `${activeMode === 'convert' ? '转换' : '处理'}完成，共生成 ${completed} 个文件。`
      : `已完成 ${completed} 个文件，失败项可查看具体原因。`)
  }

  const downloadAll = async () => {
    const finished = items.filter((item) => item.result)
    if (!finished.length || busy) return
    setPackaging(true)
    setStopping(false)
    const controller = new AbortController()
    abortRef.current = controller
    setNotice('正在生成 ZIP 压缩包。')
    try {
      const { createImageZip } = await import('../features/image-conversion/folder-zip')
      const archive = await createImageZip(buildImageExportEntries(finished, folderBatch), controller.signal, (index, total, path) => {
        setProgress({ index: index + 1, total, file: path, detail: '正在分块打包 ZIP' })
      })
      if (!mountedRef.current) return
      const url = URL.createObjectURL(archive)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = folderBatch ? 'YL-ImageLab-folder.zip' : mode === 'convert' ? 'YL-ImageLab-converted.zip' : 'YL-ImageLab-compressed.zip'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setNotice(`已打包 ${finished.length} 个图片处理结果。`)
    } catch {
      setNotice(controller.signal.aborted ? '已停止 ZIP 打包，处理结果仍保留。' : 'ZIP 打包失败，请尝试单独下载各个结果。')
    } finally {
      abortRef.current = null
      setProgress(null)
      setStopping(false)
      setPackaging(false)
    }
  }

  const downloadFolder = async () => {
    if (busy || !directoryPicker) return
    const ready = items.filter((item) => item.result)
    if (!ready.length) return
    setExporting(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const parent = await directoryPicker.call(window, { mode: 'readwrite', id: 'yl-image-output' })
      const entries = buildImageExportEntries(ready, true)
      setNotice('正在新建结果文件夹，不会覆盖原文件。')
      const result = await writeImageFolder(parent, entries, controller.signal, (index, total, path) => {
        setProgress({ index: index + 1, total, file: path, detail: '正在写入结果文件夹' })
      })
      setNotice(`${result.stopped ? '已停止导出' : '文件夹导出完成'}：${result.folderName}，已写入 ${result.written} 张图片。` +
        (result.failures.length ? `${result.failures.length} 张写入失败，可重试导出或单独下载。` : ''))
    } catch (error) {
      setNotice(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError' ? '已取消选择目标文件夹，处理结果仍保留。'
        : '文件夹写入失败或未授权；结果仍保留，可重试或下载目录 ZIP。')
    } finally {
      abortRef.current = null
      setProgress(null)
      setExporting(false)
      setStopping(false)
    }
  }

  const completedCount = items.filter((item) => item.status === 'done').length
  const failedCount = items.filter((item) => item.status === 'error').length
  const completedItems = items.filter((item) => item.result && item.resultUrl)
  const compressionResults = completedItems.filter((item) => item.result && 'originalBytes' in item.result)
  const totalOriginalBytes = compressionResults.reduce((sum, item) => sum + item.file.size, 0)
  const totalOutputBytes = compressionResults.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0)
  const previewItem = items.find((item) => item.id === previewId && item.result && item.resultUrl)
  const reading = items.some((item) => item.width === null && !item.error)
  const selectedFormat = formats.find((format) => format.value === options.format)!
  const showCompressionQuality = compressionOptions.format !== 'original' || !items.length ||
    items.some((item) => item.inputFormat === 'jpeg' || item.inputFormat === 'webp')
  const showCompressionBackground = compressionOptions.format === 'jpeg'

  return (
    <div className={styles.page}>
      <ToolHeader toolName="本地图片转换与压缩工具" showMobileTheme />
      <main className={`page-shell ${styles.workspace}`}>
        <section className={styles.intro}>
          <div>
            <span className={styles.introIcon}><Layers3 aria-hidden="true" /></span>
            <div>
              <h1>{mode === 'convert' ? '图片格式转换' : '图片压缩'}</h1>
              <p>{mode === 'convert' ? '单张或批量转换常用图片格式，全程本机处理。' : '支持无损优化、画质调整或目标大小压缩，全程本机处理。'}</p>
            </div>
          </div>
          <span className={styles.localBadge}><ShieldCheck aria-hidden="true" /> 全程本地处理</span>
        </section>

        <div className={styles.modeSwitch} role="group" aria-label="图片处理模式">
          <button type="button" aria-pressed={mode === 'convert'} className={mode === 'convert' ? styles.modeActive : ''} disabled={busy} onClick={() => changeMode('convert')}><Layers3 aria-hidden="true" /> 格式转换</button>
          <button type="button" aria-pressed={mode === 'compress'} className={mode === 'compress' ? styles.modeActive : ''} disabled={busy} onClick={() => changeMode('compress')}><Minimize2 aria-hidden="true" /> 图片压缩</button>
        </div>
        {notice !== '请选择需要转换的图片。' ? <p className={styles.feedback} role="status">{notice}</p> : null}

        <aside className={styles.settings} aria-label="图片处理设置">
          <header>
            <div><Palette aria-hidden="true" /><h2>输出设置</h2></div>
            <span>{mode === 'convert' ? selectedFormat.label : lossless ? '无损 · 原格式' : compressionOptions.format === 'original' ? '保留原格式' : formatLabel(compressionOptions.format)}</span>
          </header>

          {mode === 'convert' ? <>
          <fieldset className={styles.formatFieldset}>
            <legend>目标格式</legend>
            <div className={styles.formatGrid}>
              {formats.map((format) => (
                <button
                  type="button"
                  className={options.format === format.value ? styles.selectedFormat : ''}
                  aria-pressed={options.format === format.value}
                  disabled={busy}
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

          {['jpeg', 'webp'].includes(options.format) ? (
            <label className={styles.rangeControl}>
              <span><strong>输出质量</strong><output>{Math.round(options.quality * 100)}%</output></span>
              <input
                type="range"
                disabled={busy}
                min="0.4"
                max="1"
                step="0.05"
                value={options.quality}
                onChange={(event) => updateOptions({ quality: Number(event.target.value) })}
              />
            </label>
          ) : null}

          {['jpeg', 'bmp'].includes(options.format) ? (
            <label className={styles.colorControl}>
              <span><strong>透明区域背景</strong><small>JPG/BMP 不保留透明通道</small></span>
              <span className={styles.colorInput}>
                <input
                  type="color"
                  disabled={busy}
                  value={options.background}
                  aria-label="透明区域背景色"
                  onChange={(event) => updateOptions({ background: event.target.value })}
                />
                {options.background.toUpperCase()}
              </span>
            </label>
          ) : null}

          {options.format === 'ico' ? (
            <div className={styles.icoSettings}>
              <span className={styles.settingLabel}>ICO 尺寸模式</span>
              <div className={styles.segmented}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={options.icoMode === 'multi'}
                  className={options.icoMode === 'multi' ? styles.segmentedActive : ''}
                  onClick={() => updateOptions({ icoMode: 'multi' })}
                >多尺寸</button>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={options.icoMode === 'single'}
                  className={options.icoMode === 'single' ? styles.segmentedActive : ''}
                  onClick={() => updateOptions({ icoMode: 'single' })}
                >单尺寸</button>
              </div>
              {options.icoMode === 'single' ? (
                <label className={styles.sizeSelect}>
                  <span>图标边长</span>
                  <span>
                    <select
                      disabled={busy}
                      value={options.icoSize}
                      onChange={(event) => updateOptions({ icoSize: Number(event.target.value) as ImageConversionOptions['icoSize'] })}
                    >
                      {ICO_SIZES.map((size) => <option value={size} key={size}>{size} × {size}</option>)}
                    </select>
                    <ChevronDown aria-hidden="true" />
                  </span>
                </label>
              ) : <p>自动包含 16、32、48、64、128、256 px。</p>}
            </div>
          ) : null}

          {options.format === 'dds' ? (
            <div className={styles.formatNote}><Info aria-hidden="true" /><p>输出未压缩 RGBA8 DDS，不生成 mipmap。</p></div>
          ) : null}

          </> : <>
          <fieldset className={styles.formatFieldset}>
            <legend>压缩方式</legend>
            <div className={`${styles.segmented} ${styles.methodSwitch}`}>
              <button type="button" disabled={busy} aria-pressed={!lossless}
                className={!lossless ? styles.segmentedActive : ''}
                onClick={() => updateCompressionOptions({ method: 'standard' })}>常规压缩</button>
              <button type="button" disabled={busy} aria-pressed={lossless}
                className={lossless ? styles.segmentedActive : ''}
                onClick={() => updateCompressionOptions({ method: 'lossless' })}>无损压缩</button>
            </div>
          </fieldset>
          {lossless ? <div className={`${styles.formatNote} ${styles.losslessNote}`}>
            <ShieldCheck aria-hidden="true" /><div>
              <strong>原格式 · 原尺寸 · 不降低画质</strong>
              <p>PNG 优化压缩数据；JPG / WebP 不重新编码图像，仅清理注释和 XMP 等信息。</p>
              <p>保留透明度、色彩配置和 EXIF（包括方向及可能的拍摄信息）。不设目标大小、不缩放；已优化图片可能不会变小。</p>
              <p>支持整个文件夹（含子目录），导出保留原文件名和目录结构，不覆盖原文件。</p>
              <p>仅支持 PNG / JPG / WebP。需要指定大小或去除拍摄信息，请切回常规压缩。</p>
            </div>
          </div> : <>
          <fieldset className={styles.formatFieldset}>
            <legend>输出策略</legend>
            <div className={styles.compressionFormatGrid}>
              {([
                { value: 'original', label: '保留原格式', detail: 'PNG / JPG / WebP' },
                { value: 'webp', label: '转为 WebP', detail: '高效且保留透明' },
                { value: 'jpeg', label: '转为 JPG', detail: '适合照片' },
              ] as const).map((format) => (
                <button type="button" key={format.value} disabled={busy}
                  className={compressionOptions.format === format.value ? styles.selectedFormat : ''}
                  aria-pressed={compressionOptions.format === format.value}
                  onClick={() => updateCompressionOptions({ format: format.value })}>
                  <strong>{format.label}</strong><small>{format.detail}</small>
                </button>
              ))}
            </div>
          </fieldset>

          {showCompressionQuality ? <div className={styles.rangeControl}>
            <label className={styles.compressionQualityLabel}>
              <span><strong>输出质量</strong><output>{Math.round(compressionOptions.quality * 100)}%</output></span>
              <input type="range" min="40" max="95" step="5" disabled={busy}
                value={Math.round(compressionOptions.quality * 100)}
                onChange={(event) => updateCompressionOptions({ quality: Number(event.target.value) / 100 })} />
            </label>
            {compressionOptions.format === 'original' ? <small>仅作用于 JPG / WebP 图片。</small> : null}
            <div className={styles.qualityPresets} role="group" aria-label="压缩质量预设">
              {([
                { label: '更小文件', value: 0.6 },
                { label: '均衡推荐', value: 0.8 },
                { label: '画质优先', value: 0.9 },
              ] as const).map(({ label, value }) => (
                <button type="button" key={label} disabled={busy} aria-pressed={compressionOptions.quality === value}
                  onClick={() => updateCompressionOptions({ quality: value })}>
                  {label}<small>{Math.round(value * 100)}%</small>
                </button>
              ))}
            </div>
          </div> : <div className={styles.formatNote}><Info aria-hidden="true" /><p>保留 PNG 时采用无损重新编码，质量滑块不适用。设置目标大小后可缩小尺寸。</p></div>}

          <div className={styles.targetControl}>
            <label htmlFor="image-target-kb">目标大小（可选）</label>
            <div><input id="image-target-kb" type="number" min="1" max="50000" step="1" inputMode="numeric"
              placeholder="不限制" value={targetInput} aria-invalid={!targetValid} aria-describedby="image-target-help"
              disabled={busy} onChange={(event) => {
                const value = event.target.value
                setTargetInput(value)
                if (value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 50_000)) {
                  updateCompressionOptions({ targetBytes: value ? Number(value) * 1024 : null })
                } else invalidateResults()
              }} /><span>KB</span></div>
            <small id="image-target-help">{targetValid ? '输入 1–50,000 KB；无法达标时仍可下载最小有效结果。' : '请输入 1–50,000 的整数 KB。'}</small>
          </div>

          <label className={styles.checkboxControl}>
            <input type="checkbox" checked={compressionOptions.autoResize} disabled={busy || !targetInput || !targetValid}
              onChange={(event) => updateCompressionOptions({ autoResize: event.target.checked })} />
            <span><strong>必要时自动缩小尺寸</strong><small>保持宽高比例，最长边最低 128 px</small></span>
          </label>

          {showCompressionBackground ? <label className={styles.colorControl}>
            <span><strong>透明区域背景</strong><small>JPG 不支持透明度</small></span>
            <span className={styles.colorInput}><input type="color" value={compressionOptions.background}
              aria-label="压缩后 JPG 背景色" disabled={busy}
              onChange={(event) => updateCompressionOptions({ background: event.target.value })} />
              {compressionOptions.background.toUpperCase()}</span>
          </label> : null}

          <div className={styles.formatNote}><Info aria-hidden="true" /><p>重新编码默认移除 EXIF 等拍摄元数据；GIF 只处理首帧。</p></div>
          </>}
          </>}

          <button
            className={`button button-primary ${styles.convertButton}`}
            type="button"
            disabled={busy || reading || (mode === 'compress' && !targetValid) || !items.some((item) => item.width && !item.error)}
            onClick={() => void runProcessing()}
          >
            {converting ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Play aria-hidden="true" />}
            {converting ? (mode === 'convert' ? '正在转换' : '正在压缩') : `${mode === 'convert' ? '开始转换' : '开始压缩'}${items.length ? `（${items.length}）` : ''}`}
          </button>
          {reading ? <p className={styles.readingNote}>正在逐张读取图片，请稍候。</p> : null}
          {progress ? <div className={styles.processingProgress} role="status">
            <div><strong>第 {progress.index} / {progress.total} 张</strong><span title={progress.file}>{progress.file}</span></div>
            <progress value={progress.index - 1} max={progress.total} aria-label="图片处理进度" />
            <small>{progress.detail}</small>
            <button type="button" disabled={stopping} onClick={() => { setStopping(true); abortRef.current?.abort(); setNotice('正在停止当前处理…') }}><Square aria-hidden="true" /> {stopping ? '正在停止' : '停止处理'}</button>
          </div> : null}
        </aside>

        <section className={styles.filesPanel} aria-labelledby="files-title">
          <header className={styles.filesHeader}>
            <div>
              <h2 id="files-title">图片列表</h2>
              <span>{items.length} / {folderBatch ? MAX_FOLDER_IMAGES : MAX_IMAGE_FILES} 个文件</span>
            </div>
            {items.length ? (
              <div className={styles.headerActions}>
                <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}><Plus /> 添加图片</button>
                <button type="button" onClick={clearAll} disabled={busy}><Trash2 /> 清空</button>
              </div>
            ) : null}
          </header>

          <div
            className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''} ${items.length ? styles.compactDropZone : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
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
              accept={acceptedFiles}
              multiple
              disabled={busy}
              aria-label="选择图片文件"
              onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
            />
            <input ref={folderInputRef} type="file" multiple disabled={busy} aria-label="选择无损压缩文件夹"
              onChange={(event) => { addFolder(Array.from(event.target.files ?? [])); event.target.value = '' }} />
            <span className={styles.uploadIcon}><UploadCloud aria-hidden="true" /></span>
            <div>
              <h3>{dragging ? '松开即可添加图片' : '拖拽图片到这里，或点击选择'}</h3>
              <p>PNG、JPG、WebP、BMP、ICO、TGA、DDS，另支持 GIF 首帧与浏览器可解码的 AVIF</p>
            </div>
            <div className={styles.uploadActions}>
              <button type="button" className="button" disabled={busy} onClick={() => fileInputRef.current?.click()}><ImageIcon aria-hidden="true" /> 选择图片</button>
              <button type="button" className="button" disabled={busy} onClick={() => folderInputRef.current?.click()}><FolderOpen aria-hidden="true" /> 文件夹无损压缩</button>
            </div>
          </div>

          {folderBatch ? <div className={styles.folderSummary}><FolderOpen aria-hidden="true" />
            <div><strong>文件夹批次 · 保留子目录</strong><p>最多 500 张 / 总输入 500 MB；单张 50 MB / 单边 8192 px。只处理 PNG/JPG/WebP，空目录和其他文件不导出。</p></div>
          </div> : null}

          {items.length ? (
            <div className={`${styles.fileList} ${folderBatch ? styles.folderFileList : ''}`} tabIndex={folderBatch ? 0 : undefined}
              aria-label={mode === 'convert' ? '待转换图片' : '待压缩图片'}>
              {items.map((item) => (
                <article className={`${styles.fileItem} ${item.status === 'error' ? styles.fileError : ''}`} key={item.id}>
                  <div className={styles.thumbnail}>
                    {item.previewUrl ? <img src={item.previewUrl} alt="" loading="lazy" decoding="async" /> : <FileImage aria-hidden="true" />}
                  </div>
                  <div className={styles.fileInfo}>
                    <strong title={item.relativePath || item.file.name}>{item.file.name}</strong>
                    {item.relativePath ? <small className={styles.filePath} title={item.relativePath}>{item.relativePath}</small> : null}
                    <p>
                      <span>{item.inputFormat?.toUpperCase() ?? '读取中'}</span>
                      {item.width ? <span>{item.width} × {item.height}</span> : null}
                      <span>{formatBytes(item.file.size)}</span>
                    </p>
                    {item.error ? <small className={styles.errorText}>{item.error}</small> : null}
                    {mode === 'compress' && (lossless || compressionOptions.format === 'original') && item.inputFormat && !['png', 'jpeg', 'webp'].includes(item.inputFormat) && !item.error
                      ? <small className={styles.errorText}>{lossless ? '此格式不支持无损压缩，请切换常规压缩或格式转换。' : '此格式不能保留原格式压缩，请选择 JPG 或 WebP。'}</small> : null}
                  </div>
                  <span className={`${styles.status} ${styles[item.status]}`}>
                    {item.status === 'done' ? <Check aria-hidden="true" /> : null}
                    {item.status === 'converting' ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : null}
                    {statusText(item, mode)}
                  </span>
                  {item.result && item.resultUrl ? (
                    <div className={styles.resultInfo}>
                      <span><strong>{formatLabel(item.result.format)}</strong> · {formatBytes(item.result.blob.size)}</span>
                      {'originalBytes' in item.result ? <>
                        {item.result.lossless ? <small className={styles.resultSaved}>无损优化 · 原始尺寸与图像数据保留</small> : null}
                        <small className={item.result.blob.size >= item.result.originalBytes ? styles.resultWarning : styles.resultSaved}>
                          {formatBytes(item.result.originalBytes)} → {formatBytes(item.result.blob.size)} · {sizeChangeText(item.result.originalBytes, item.result.blob.size)}
                        </small>
                        <small className={item.result.targetMet === false ? styles.resultWarning : ''}>
                          {item.result.width} × {item.result.height} px{item.result.targetMet === false ? ' · 未达到目标' : item.result.targetMet ? ' · 已达到目标' : ''}
                        </small>
                        {item.result.targetMet === false ? <small className={styles.resultAdvice}>建议启用自动缩小、降低质量或改用 WebP。</small> : null}
                        {item.result.blob.size > item.result.originalBytes ? <small className={styles.resultAdvice}>结果比原图更大；可调低质量或换格式后重试。</small> : null}
                        {item.result.lossless && item.result.blob.size === item.result.originalBytes ? <small className={styles.resultAdvice}>未发现可安全缩减的数据；已保留原文件内容。</small> : null}
                        <button type="button" className={styles.compareButton} onClick={() => setPreviewId(item.id)}>对比预览</button>
                      </> : <small>{item.result.durationMs < 1 ? '<1 ms' : `${Math.round(item.result.durationMs)} ms`}</small>}
                      <a href={item.resultUrl} download={item.result.fileName} aria-label={`下载 ${item.result.fileName}`}>
                        <Download aria-hidden="true" /> 下载
                      </a>
                    </div>
                  ) : null}
                  <button
                    className={styles.removeButton}
                    type="button"
                    aria-label={`移除 ${item.file.name}`}
                    disabled={busy}
                    onClick={() => removeItem(item.id)}
                  ><X aria-hidden="true" /></button>
                </article>
              ))}
            </div>
          ) : null}

          {completedCount ? (
            <div className={styles.resultBar}>
              <div><Check aria-hidden="true" /><span><strong>{completedCount} 个文件{mode === 'convert' ? '转换' : '处理'}完成{failedCount ? `，${failedCount} 个失败` : ''}</strong><small>{folderBatch ? '导出新文件夹，保持原文件名与目录结构' : completedItems.length === 1 ? '单个文件直接下载图片' : '可单独下载或打包为 ZIP'}</small></span></div>
              {mode === 'compress' ? <p className={styles.batchTotals}>已完成项：{formatBytes(totalOriginalBytes)} → {formatBytes(totalOutputBytes)} · {sizeChangeText(totalOriginalBytes, totalOutputBytes)}</p> : null}
              {folderBatch ? <div className={styles.folderExportActions}>
                {directoryPicker ? <button className="button button-primary" type="button" disabled={busy} onClick={() => void downloadFolder()}><FolderOpen aria-hidden="true" /> {exporting ? '正在导出' : '导出到文件夹'}</button> : <small>当前浏览器不支持直接写入文件夹，可下载目录 ZIP 后解压。</small>}
                <button className="button" type="button" disabled={busy} onClick={() => void downloadAll()}><Archive aria-hidden="true" /> {packaging ? '正在打包' : '下载目录 ZIP'}</button>
              </div> : completedItems.length === 1 ? <a className="button button-primary" href={completedItems[0].resultUrl!} download={completedItems[0].result!.fileName}><Download aria-hidden="true" /> 下载图片</a> :
                <button className="button button-primary" type="button" disabled={busy} onClick={() => void downloadAll()}><Archive aria-hidden="true" /> {packaging ? '正在打包' : '下载全部 ZIP'}</button>}
            </div>
          ) : null}
          {mode === 'compress' && previewItem?.result && previewItem.resultUrl ? <section className={styles.comparisonPanel} aria-label="原图与结果对比">
            <header><div><h3>原图与结果对比</h3><p title={previewItem.file.name}>{previewItem.file.name}</p></div>
              <button type="button" aria-label="关闭对比预览" onClick={() => setPreviewId(null)}><X aria-hidden="true" /></button></header>
            <div className={styles.comparisonGrid}>
              <figure><div><img src={previewItem.previewUrl} alt="原图预览" /></div><figcaption>原图 · {formatBytes(previewItem.file.size)} · {previewItem.width} × {previewItem.height}</figcaption></figure>
              <figure><div><img src={previewItem.resultUrl} alt="压缩结果预览" /></div><figcaption>结果 · {formatBytes(previewItem.result.blob.size)} · {previewItem.result.width} × {previewItem.result.height}</figcaption></figure>
            </div>
            <p>预览按容器缩放显示；下载文件保留上方标注的实际尺寸。</p>
          </section> : null}
        </section>

        <section className={styles.privacyBar} aria-label="隐私说明">
          <ShieldCheck aria-hidden="true" />
          <div><strong>图片只在当前浏览器中处理</strong><span>不上传服务器，不保存文件草稿，关闭页面后自动释放。</span></div>
          <button type="button" disabled={busy} onClick={() => {
            if (mode === 'convert') updateOptions(DEFAULT_IMAGE_OPTIONS)
            else { setTargetInput(''); updateCompressionOptions(DEFAULT_COMPRESSION_OPTIONS) }
          }}><RotateCcw aria-hidden="true" /> 恢复默认设置</button>
        </section>
      </main>
    </div>
  )
}
