import {
  Archive,
  Check,
  ChevronDown,
  Download,
  FileImage,
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
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ToolHeader } from '../components/SiteHeader'
import { compressImage } from '../features/image-conversion/compression'
import { createPreviewBlob, convertImage, decodeImageFile } from '../features/image-conversion/engine'
import {
  DEFAULT_COMPRESSION_OPTIONS,
  DEFAULT_IMAGE_OPTIONS,
  ICO_SIZES,
  ImageConversionError,
  MAX_IMAGE_FILES,
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
  const change = Math.round(Math.abs(1 - after / before) * 100)
  if (after < before) return `节省 ${change}%`
  if (after > before) return `体积增加 ${change}%`
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
  const [notice, setNotice] = useState('请选择需要转换的图片。')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef(items)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => () => {
    itemsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
    })
  }, [])

  const invalidateResults = () => {
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
    if (converting) return
    setOptions((current) => ({ ...current, ...next }))
    invalidateResults()
    setNotice('输出设置已更新，请重新执行转换。')
  }

  const updateCompressionOptions = (next: Partial<ImageCompressionOptions>) => {
    if (converting) return
    setCompressionOptions((current) => ({ ...current, ...next }))
    invalidateResults()
    setNotice('压缩设置已更新，请重新执行压缩。')
  }

  const changeMode = (next: 'convert' | 'compress') => {
    if (converting || next === mode) return
    setMode(next)
    invalidateResults()
    setNotice(next === 'convert' ? '已切换到格式转换。' : '已切换到图片压缩。')
  }

  const prepareItem = async (item: ImageQueueItem) => {
    try {
      const { format, image } = await decodeImageFile(item.file)
      const previewBlob = await createPreviewBlob(image)
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
    if (converting) return
    if (!files.length) return
    const room = Math.max(0, MAX_IMAGE_FILES - items.length)
    const accepted = files.slice(0, room)
    if (accepted.length < files.length) setNotice(`每批最多添加 ${MAX_IMAGE_FILES} 张图片，超出文件已忽略。`)
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
    setItems((current) => [...current, ...additions])
    additions.forEach((item) => void prepareItem(item))
  }

  const removeItem = (id: string) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      if (target?.resultUrl) URL.revokeObjectURL(target.resultUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  const clearAll = () => {
    items.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
    })
    setItems([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    setNotice('列表已清空，图片没有上传或保存在服务器。')
  }

  const targetValid = targetInput === '' || (/^\d+$/.test(targetInput) &&
    Number(targetInput) >= 1 && Number(targetInput) <= 50_000)

  const runProcessing = async () => {
    if (mode === 'compress' && !targetValid) {
      setNotice('目标大小必须是 1–50,000 KB 的整数。')
      return
    }
    const ready = items.filter((item) => item.width && item.height && !item.error)
    if (!ready.length || converting) {
      setNotice('请先添加可读取的图片。')
      return
    }
    setConverting(true)
    const activeMode = mode
    const activeOptions = { ...options }
    const activeCompressionOptions = { ...compressionOptions }
    const verb = activeMode === 'convert' ? '转换' : '压缩'
    setNotice(`正在按顺序${verb} ${ready.length} 个文件。`)
    let completed = 0
    for (const item of ready) {
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, status: 'converting', error: null }
        : entry))
      try {
        const result = activeMode === 'convert'
          ? await convertImage({ file: item.file, options: activeOptions })
          : await compressImage(item.file, activeCompressionOptions)
        const resultUrl = URL.createObjectURL(result.blob)
        setItems((current) => current.map((entry) => {
          if (entry.id !== item.id) return entry
          if (entry.resultUrl) URL.revokeObjectURL(entry.resultUrl)
          return { ...entry, status: 'done', result, resultUrl, error: null }
        }))
        completed += 1
      } catch (error) {
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
    setConverting(false)
    setNotice(completed === ready.length
      ? `${activeMode === 'convert' ? '转换' : '处理'}完成，共生成 ${completed} 个文件。`
      : `已完成 ${completed} 个文件，失败项可查看具体原因。`)
  }

  const downloadAll = async () => {
    const finished = items.filter((item) => item.result)
    if (!finished.length) return
    setNotice('正在生成 ZIP 压缩包。')
    const { zipSync } = await import('fflate')
    const entries: Record<string, Uint8Array> = {}
    const duplicateCount = new Map<string, number>()
    await Promise.all(finished.map(async (item) => {
      const result = item.result!
      const seen = duplicateCount.get(result.fileName) ?? 0
      duplicateCount.set(result.fileName, seen + 1)
      const name = seen ? result.fileName.replace(/(\.[^.]+)$/, `-${seen + 1}$1`) : result.fileName
      entries[name] = new Uint8Array(await result.blob.arrayBuffer())
    }))
    const archive = zipSync(entries, { level: 0 })
    const url = URL.createObjectURL(new Blob([new Uint8Array(archive).buffer], { type: 'application/zip' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = mode === 'convert' ? 'YL-ImageLab-converted.zip' : 'YL-ImageLab-compressed.zip'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice(`已打包 ${finished.length} 个图片处理结果。`)
  }

  const completedCount = items.filter((item) => item.status === 'done').length
  const completedItems = items.filter((item) => item.result && item.resultUrl)
  const selectedFormat = formats.find((format) => format.value === options.format)!
  const showCompressionQuality = compressionOptions.format !== 'original' ||
    items.some((item) => item.inputFormat === 'jpeg' || item.inputFormat === 'webp')
  const showCompressionBackground = compressionOptions.format === 'jpeg' ||
    (compressionOptions.format === 'original' && items.some((item) => item.inputFormat === 'jpeg'))

  return (
    <div className={styles.page}>
      <ToolHeader toolName="本地图片转换与压缩工具" />
      <main className={`page-shell ${styles.workspace}`}>
        <section className={styles.intro}>
          <div>
            <span className={styles.introIcon}><Layers3 aria-hidden="true" /></span>
            <div>
              <h1>图片格式转换</h1>
              <p>单张或批量转换格式、压缩体积，图片只在本机处理。</p>
            </div>
          </div>
          <span className={styles.localBadge}><ShieldCheck aria-hidden="true" /> 全程本地处理</span>
        </section>

        <div className={styles.modeSwitch} role="group" aria-label="图片处理模式">
          <button type="button" aria-pressed={mode === 'convert'} className={mode === 'convert' ? styles.modeActive : ''} disabled={converting} onClick={() => changeMode('convert')}><Layers3 aria-hidden="true" /> 格式转换</button>
          <button type="button" aria-pressed={mode === 'compress'} className={mode === 'compress' ? styles.modeActive : ''} disabled={converting} onClick={() => changeMode('compress')}><Minimize2 aria-hidden="true" /> 图片压缩</button>
        </div>

        <aside className={styles.settings} aria-label="图片处理设置">
          <header>
            <div><Palette aria-hidden="true" /><h2>输出设置</h2></div>
            <span>{mode === 'convert' ? selectedFormat.label : compressionOptions.format === 'original' ? '保留原格式' : compressionOptions.format.toUpperCase()}</span>
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
                  aria-pressed={options.icoMode === 'multi'}
                  className={options.icoMode === 'multi' ? styles.segmentedActive : ''}
                  onClick={() => updateOptions({ icoMode: 'multi' })}
                >多尺寸</button>
                <button
                  type="button"
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
            <legend>输出策略</legend>
            <div className={styles.compressionFormatGrid}>
              {([
                { value: 'original', label: '保留原格式', detail: 'PNG / JPG / WebP' },
                { value: 'webp', label: '转为 WebP', detail: '高效且保留透明' },
                { value: 'jpeg', label: '转为 JPG', detail: '适合照片' },
              ] as const).map((format) => (
                <button type="button" key={format.value} disabled={converting}
                  className={compressionOptions.format === format.value ? styles.selectedFormat : ''}
                  aria-pressed={compressionOptions.format === format.value}
                  onClick={() => updateCompressionOptions({ format: format.value })}>
                  <strong>{format.label}</strong><small>{format.detail}</small>
                </button>
              ))}
            </div>
          </fieldset>

          {showCompressionQuality ? <label className={styles.rangeControl}>
            <span><strong>输出质量</strong><output>{Math.round(compressionOptions.quality * 100)}%</output></span>
            <input type="range" min="40" max="95" step="5" disabled={converting}
              value={Math.round(compressionOptions.quality * 100)}
              onChange={(event) => updateCompressionOptions({ quality: Number(event.target.value) / 100 })} />
            {compressionOptions.format === 'original' ? <small>仅作用于 JPG / WebP 图片。</small> : null}
          </label> : <div className={styles.formatNote}><Info aria-hidden="true" /><p>保留 PNG 时采用无损重新编码，质量滑块不适用。设置目标大小后可缩小尺寸。</p></div>}

          <div className={styles.targetControl}>
            <label htmlFor="image-target-kb">目标大小（可选）</label>
            <div><input id="image-target-kb" type="number" min="1" max="50000" step="1" inputMode="numeric"
              placeholder="不限制" value={targetInput} aria-invalid={!targetValid} aria-describedby="image-target-help"
              disabled={converting} onChange={(event) => {
                const value = event.target.value
                setTargetInput(value)
                if (value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 50_000)) {
                  updateCompressionOptions({ targetBytes: value ? Number(value) * 1024 : null })
                } else invalidateResults()
              }} /><span>KB</span></div>
            <small id="image-target-help">{targetValid ? '输入 1–50,000 KB；无法达标时仍可下载最小有效结果。' : '请输入 1–50,000 的整数 KB。'}</small>
          </div>

          <label className={styles.checkboxControl}>
            <input type="checkbox" checked={compressionOptions.autoResize} disabled={converting || !targetInput}
              onChange={(event) => updateCompressionOptions({ autoResize: event.target.checked })} />
            <span><strong>必要时自动缩小尺寸</strong><small>保持宽高比例，最长边最低 128 px</small></span>
          </label>

          {showCompressionBackground ? <label className={styles.colorControl}>
            <span><strong>透明区域背景</strong><small>JPG 不支持透明度</small></span>
            <span className={styles.colorInput}><input type="color" value={compressionOptions.background}
              aria-label="压缩后 JPG 背景色" disabled={converting}
              onChange={(event) => updateCompressionOptions({ background: event.target.value })} />
              {compressionOptions.background.toUpperCase()}</span>
          </label> : null}

          <div className={styles.formatNote}><Info aria-hidden="true" /><p>重新编码默认移除 EXIF 等拍摄元数据；GIF 只处理首帧。</p></div>
          </>}

          <button
            className={`button button-primary ${styles.convertButton}`}
            type="button"
            disabled={converting || (mode === 'compress' && !targetValid) || !items.some((item) => item.width && !item.error)}
            onClick={() => void runProcessing()}
          >
            {converting ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Play aria-hidden="true" />}
            {converting ? (mode === 'convert' ? '正在转换' : '正在压缩') : `${mode === 'convert' ? '开始转换' : '开始压缩'}${items.length ? `（${items.length}）` : ''}`}
          </button>
        </aside>

        <section className={styles.filesPanel} aria-labelledby="files-title">
          <header className={styles.filesHeader}>
            <div>
              <h2 id="files-title">图片列表</h2>
              <span>{items.length} / {MAX_IMAGE_FILES} 个文件</span>
            </div>
            {items.length ? (
              <div className={styles.headerActions}>
                <button type="button" disabled={converting} onClick={() => fileInputRef.current?.click()}><Plus /> 添加图片</button>
                <button type="button" onClick={clearAll} disabled={converting}><Trash2 /> 清空</button>
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
              disabled={converting}
              aria-label="选择图片文件"
              onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
            />
            <span className={styles.uploadIcon}><UploadCloud aria-hidden="true" /></span>
            <div>
              <h3>{dragging ? '松开即可添加图片' : '拖拽图片到这里，或点击选择'}</h3>
              <p>PNG、JPG、WebP、BMP、ICO、TGA、DDS，另支持 GIF 首帧与浏览器可解码的 AVIF</p>
            </div>
            <button type="button" className="button" disabled={converting} onClick={() => fileInputRef.current?.click()}>
              <ImageIcon aria-hidden="true" /> 选择图片
            </button>
          </div>

          {items.length ? (
            <div className={styles.fileList} aria-label={mode === 'convert' ? '待转换图片' : '待压缩图片'}>
              {items.map((item) => (
                <article className={`${styles.fileItem} ${item.status === 'error' ? styles.fileError : ''}`} key={item.id}>
                  <div className={styles.thumbnail}>
                    {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <FileImage aria-hidden="true" />}
                  </div>
                  <div className={styles.fileInfo}>
                    <strong title={item.file.name}>{item.file.name}</strong>
                    <p>
                      <span>{item.inputFormat?.toUpperCase() ?? '读取中'}</span>
                      {item.width ? <span>{item.width} × {item.height}</span> : null}
                      <span>{formatBytes(item.file.size)}</span>
                    </p>
                    {item.error ? <small className={styles.errorText}>{item.error}</small> : null}
                    {mode === 'compress' && compressionOptions.format === 'original' && item.inputFormat && !['png', 'jpeg', 'webp'].includes(item.inputFormat) && !item.error
                      ? <small className={styles.errorText}>此格式不能保留原格式压缩，请选择 JPG 或 WebP。</small> : null}
                  </div>
                  <span className={`${styles.status} ${styles[item.status]}`}>
                    {item.status === 'done' ? <Check aria-hidden="true" /> : null}
                    {item.status === 'converting' ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : null}
                    {statusText(item, mode)}
                  </span>
                  {item.result && item.resultUrl ? (
                    <div className={styles.resultInfo}>
                      <span><strong>{item.result.format.toUpperCase()}</strong> · {formatBytes(item.result.blob.size)}</span>
                      {'originalBytes' in item.result ? <>
                        <small>{formatBytes(item.result.originalBytes)} → {formatBytes(item.result.blob.size)} · {sizeChangeText(item.result.originalBytes, item.result.blob.size)}</small>
                        <small>{item.result.width} × {item.result.height} px{item.result.targetMet === false ? ' · 未达到目标' : item.result.targetMet ? ' · 已达到目标' : ''}</small>
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
                    disabled={converting}
                    onClick={() => removeItem(item.id)}
                  ><X aria-hidden="true" /></button>
                </article>
              ))}
            </div>
          ) : null}

          {completedCount ? (
            <div className={styles.resultBar}>
              <div><Check aria-hidden="true" /><span><strong>{completedCount} 个文件{mode === 'convert' ? '转换' : '处理'}完成</strong><small>{completedItems.length === 1 ? '单个文件直接下载图片' : '可单独下载或打包为 ZIP'}</small></span></div>
              {completedItems.length === 1 ? <a className="button button-primary" href={completedItems[0].resultUrl!} download={completedItems[0].result!.fileName}><Download aria-hidden="true" /> 下载图片</a> :
                <button className="button button-primary" type="button" onClick={() => void downloadAll()}><Archive aria-hidden="true" /> 下载全部 ZIP</button>}
            </div>
          ) : null}
        </section>

        <section className={styles.privacyBar} aria-label="隐私说明">
          <ShieldCheck aria-hidden="true" />
          <div><strong>图片只在当前浏览器中处理</strong><span>不上传服务器，不保存文件草稿，关闭页面后自动释放。</span></div>
          <button type="button" disabled={converting} onClick={() => {
            if (mode === 'convert') updateOptions(DEFAULT_IMAGE_OPTIONS)
            else { setTargetInput(''); updateCompressionOptions(DEFAULT_COMPRESSION_OPTIONS) }
          }}><RotateCcw aria-hidden="true" /> 恢复默认设置</button>
        </section>
        <p className="sr-only" aria-live="polite">{notice}</p>
      </main>
    </div>
  )
}
