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
import { createPreviewBlob, convertImage, decodeImageFile } from '../features/image-conversion/engine'
import {
  DEFAULT_IMAGE_OPTIONS,
  ICO_SIZES,
  ImageConversionError,
  MAX_IMAGE_FILES,
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

function statusText(item: ImageQueueItem) {
  if (item.status === 'converting') return '转换中'
  if (item.status === 'done') return '已完成'
  if (item.status === 'error') return '处理失败'
  return item.width ? '等待转换' : '读取中'
}

export function ImageConvertPage() {
  const [items, setItems] = useState<ImageQueueItem[]>([])
  const [options, setOptions] = useState<ImageConversionOptions>(DEFAULT_IMAGE_OPTIONS)
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

  const updateOptions = (next: Partial<ImageConversionOptions>) => {
    setOptions((current) => ({ ...current, ...next }))
    setItems((current) => current.map((item) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      return item.status === 'error'
        ? item
        : { ...item, status: 'queued', result: null, resultUrl: null }
    }))
    setNotice('输出设置已更新，请重新执行转换。')
  }

  const prepareItem = async (item: ImageQueueItem) => {
    try {
      const { format, image } = await decodeImageFile(item.file)
      const previewBlob = await createPreviewBlob(image)
      const previewUrl = URL.createObjectURL(previewBlob)
      URL.revokeObjectURL(item.previewUrl)
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, inputFormat: format, width: image.width, height: image.height, previewUrl }
        : entry))
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法读取此图片。'
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, status: 'error', error: message }
        : entry))
    }
  }

  const addFiles = (files: File[]) => {
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

  const runConversion = async () => {
    const ready = items.filter((item) => item.width && item.height && !item.error)
    if (!ready.length || converting) {
      setNotice('请先添加可读取的图片。')
      return
    }
    setConverting(true)
    setNotice(`正在按顺序转换 ${ready.length} 个文件。`)
    let completed = 0
    for (const item of ready) {
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, status: 'converting', error: null }
        : entry))
      try {
        const result = await convertImage({ file: item.file, options })
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
          : '图片转换失败。'
        setItems((current) => current.map((entry) => entry.id === item.id
          ? { ...entry, status: 'error', error: message, result: null, resultUrl: null }
          : entry))
      }
    }
    setConverting(false)
    setNotice(completed === ready.length
      ? `转换完成，共生成 ${completed} 个文件。`
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
    anchor.download = 'YL-ImageLab-converted.zip'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice(`已打包 ${finished.length} 个转换结果。`)
  }

  const completedCount = items.filter((item) => item.status === 'done').length
  const selectedFormat = formats.find((format) => format.value === options.format)!

  return (
    <div className={styles.page}>
      <ToolHeader toolName="本地图片格式转换工具" />
      <main className={`page-shell ${styles.workspace}`}>
        <section className={styles.intro}>
          <div>
            <span className={styles.introIcon}><Layers3 aria-hidden="true" /></span>
            <div>
              <h1>图片格式转换</h1>
              <p>单张或批量转换常用图片、图标与游戏纹理格式。</p>
            </div>
          </div>
          <span className={styles.localBadge}><ShieldCheck aria-hidden="true" /> 全程本地处理</span>
        </section>

        <aside className={styles.settings} aria-label="转换设置">
          <header>
            <div><Palette aria-hidden="true" /><h2>输出设置</h2></div>
            <span>{selectedFormat.label}</span>
          </header>

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

          <button
            className={`button button-primary ${styles.convertButton}`}
            type="button"
            disabled={converting || !items.some((item) => item.width && !item.error)}
            onClick={() => void runConversion()}
          >
            {converting ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Play aria-hidden="true" />}
            {converting ? '正在转换' : `开始转换${items.length ? `（${items.length}）` : ''}`}
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
                <button type="button" onClick={() => fileInputRef.current?.click()}><Plus /> 添加图片</button>
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
              aria-label="选择图片文件"
              onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
            />
            <span className={styles.uploadIcon}><UploadCloud aria-hidden="true" /></span>
            <div>
              <h3>{dragging ? '松开即可添加图片' : '拖拽图片到这里，或点击选择'}</h3>
              <p>PNG、JPG、WebP、BMP、ICO、TGA、DDS，另支持 GIF 首帧与浏览器可解码的 AVIF</p>
            </div>
            <button type="button" className="button" onClick={() => fileInputRef.current?.click()}>
              <ImageIcon aria-hidden="true" /> 选择图片
            </button>
          </div>

          {items.length ? (
            <div className={styles.fileList} aria-label="待转换图片">
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
                  </div>
                  <span className={`${styles.status} ${styles[item.status]}`}>
                    {item.status === 'done' ? <Check aria-hidden="true" /> : null}
                    {item.status === 'converting' ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : null}
                    {statusText(item)}
                  </span>
                  {item.result && item.resultUrl ? (
                    <div className={styles.resultInfo}>
                      <span><strong>{item.result.format.toUpperCase()}</strong> · {formatBytes(item.result.blob.size)}</span>
                      <small>{item.result.durationMs < 1 ? '<1 ms' : `${Math.round(item.result.durationMs)} ms`}</small>
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
              <div><Check aria-hidden="true" /><span><strong>{completedCount} 个文件转换完成</strong><small>可单独下载或打包为 ZIP</small></span></div>
              <button className="button button-primary" type="button" onClick={() => void downloadAll()}>
                <Archive aria-hidden="true" /> 下载全部
              </button>
            </div>
          ) : null}
        </section>

        <section className={styles.privacyBar} aria-label="隐私说明">
          <ShieldCheck aria-hidden="true" />
          <div><strong>图片只在当前浏览器中处理</strong><span>不上传服务器，不保存文件草稿，关闭页面后自动释放。</span></div>
          <button type="button" onClick={() => updateOptions(DEFAULT_IMAGE_OPTIONS)}><RotateCcw aria-hidden="true" /> 恢复默认设置</button>
        </section>
        <p className="sr-only" aria-live="polite">{notice}</p>
      </main>
    </div>
  )
}
