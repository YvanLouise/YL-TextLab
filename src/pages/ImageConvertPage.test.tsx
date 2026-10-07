import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { convertImage, createPreviewBlob, decodeImageFile } from '../features/image-conversion/engine'
import { compressImage } from '../features/image-conversion/compression'
import { inspectLosslessFile } from '../features/image-conversion/lossless-info'
import { ThemeProvider } from '../theme/ThemeProvider'
import { ImageConvertPage } from './ImageConvertPage'

vi.mock('../features/image-conversion/engine', () => ({
  decodeImageFile: vi.fn(),
  createPreviewBlob: vi.fn(),
  convertImage: vi.fn(),
}))

vi.mock('../features/image-conversion/compression', () => ({ compressImage: vi.fn() }))
vi.mock('../features/image-conversion/lossless-info', () => ({ inspectLosslessFile: vi.fn() }))

function renderPage() {
  return render(
    <BrowserRouter>
      <ThemeProvider><ImageConvertPage /></ThemeProvider>
    </BrowserRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  let index = 0
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:image-${index++}`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  vi.mocked(decodeImageFile).mockResolvedValue({
    format: 'png',
    image: { width: 640, height: 360, data: new Uint8ClampedArray(640 * 360 * 4) },
  })
  vi.mocked(createPreviewBlob).mockResolvedValue(new Blob(['preview'], { type: 'image/png' }))
  vi.mocked(inspectLosslessFile).mockResolvedValue({ format: 'png', width: 640, height: 360 })
  vi.mocked(convertImage).mockResolvedValue({
    blob: new Blob(['converted'], { type: 'image/x-icon' }),
    fileName: 'hero.ico',
    format: 'ico',
    width: 640,
    height: 360,
    durationMs: 2,
  })
  vi.mocked(compressImage).mockImplementation(async (file, options) => ({
    blob: new Blob(['compressed'], { type: 'image/webp' }),
    fileName: options.method === 'lossless' ? file.name : `${file.name.replace(/\.[^.]+$/, '')}-compressed.webp`,
    format: 'webp', width: 640, height: 360, durationMs: 3,
    originalBytes: file.size, targetBytes: options.method === 'lossless' ? null : options.targetBytes,
    targetMet: options.method === 'lossless' || options.targetBytes === null ? null : true,
    lossless: options.method === 'lossless',
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ImageConvertPage', () => {
  it('imports a whole folder beyond 20 files, preserves paths and defaults to lossless', async () => {
    const user = userEvent.setup()
    renderPage()
    const files = Array.from({ length: 24 }, (_, index) => {
      const file = new File(['png'], `${index}.PNG`)
      Object.defineProperty(file, 'webkitRelativePath', { value: `素材/sub/${index}.PNG` })
      return file
    })
    files.push(new File(['text'], 'note.txt'))
    expect(screen.getByLabelText('选择无损压缩文件夹')).toHaveAttribute('webkitdirectory')
    fireEvent.change(screen.getByLabelText('选择无损压缩文件夹'), { target: { files } })
    await waitFor(() => expect(screen.getAllByText('640 × 360')).toHaveLength(24))
    expect(screen.getByText('24 / 500 个文件')).toBeVisible()
    expect(screen.getByRole('button', { name: '无损压缩' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('素材/sub/0.PNG')).toBeVisible()
    expect(screen.getByText(/跳过 1 个其他文件/)).toBeVisible()
    expect(decodeImageFile).not.toHaveBeenCalled()
    expect(createPreviewBlob).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /开始压缩/ }))
    await screen.findByText('24 个文件处理完成')
    expect(screen.getByRole('button', { name: '下载目录 ZIP' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByText('0 / 20 个文件')).toBeVisible()
  })

  it('keeps results after cancelling the native output directory picker', async () => {
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: vi.fn().mockRejectedValue(new DOMException('', 'AbortError')) })
    try {
      const user = userEvent.setup()
      renderPage()
      const file = new File(['png'], 'a.png')
      Object.defineProperty(file, 'webkitRelativePath', { value: 'folder/a.png' })
      fireEvent.change(screen.getByLabelText('选择无损压缩文件夹'), { target: { files: [file] } })
      await screen.findByText('640 × 360')
      await user.click(screen.getByRole('button', { name: /开始压缩/ }))
      await screen.findByText('1 个文件处理完成')
      await user.click(screen.getByRole('button', { name: '导出到文件夹' }))
      expect(await screen.findByText(/已取消选择目标文件夹/)).toBeVisible()
      expect(screen.getByRole('link', { name: '下载 a.png' })).toBeVisible()
    } finally { Reflect.deleteProperty(window, 'showDirectoryPicker') }
  })
  it('switches to lossless without losing files, hides destructive settings and invalidates old results', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '图片压缩' }))
    fireEvent.change(screen.getByLabelText('选择图片文件'), { target: { files: [new File(['img'], 'sample.png', { type: 'image/png' })] } })
    await screen.findByText('640 × 360')
    await user.click(screen.getByRole('button', { name: /转为 WebP/ }))
    await user.type(screen.getByLabelText('目标大小（可选）'), '2')
    await user.click(screen.getByRole('button', { name: /开始压缩/ }))
    await screen.findByText('1 个文件处理完成')
    await user.click(screen.getByRole('button', { name: '无损压缩' }))
    expect(screen.queryByRole('link', { name: '下载图片' })).not.toBeInTheDocument()
    expect(screen.getByText('sample.png')).toBeVisible()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('目标大小（可选）')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText(/保留透明度、色彩配置和 EXIF/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: /开始压缩/ }))
    await screen.findByText('无损优化 · 原始尺寸与图像数据保留')
    expect(screen.getByRole('link', { name: '下载图片' })).toHaveAttribute('download', 'sample.png')
    expect(screen.getByRole('link', { name: '下载 sample.png' })).toHaveAttribute('download', 'sample.png')
    expect(compressImage).toHaveBeenLastCalledWith(expect.any(File), expect.objectContaining({ method: 'lossless' }), expect.any(Object))
    await user.click(screen.getByRole('button', { name: '常规压缩' }))
    expect(screen.getByLabelText('目标大小（可选）')).toHaveValue(2)
    expect(screen.queryByRole('link', { name: '下载图片' })).not.toBeInTheDocument()
  })

  it('does not block lossless mode with an invalid hidden target', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '图片压缩' }))
    fireEvent.change(screen.getByLabelText('选择图片文件'), { target: { files: [new File(['img'], 'sample.png', { type: 'image/png' })] } })
    await screen.findByText('640 × 360')
    await user.type(screen.getByLabelText('目标大小（可选）'), '0')
    expect(screen.getByRole('button', { name: /开始压缩/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '无损压缩' }))
    expect(screen.getByRole('button', { name: /开始压缩/ })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /开始压缩/ }))
    await screen.findByText('1 个文件处理完成')
    await user.click(screen.getByRole('button', { name: '常规压缩' }))
    expect(screen.getByRole('button', { name: /开始压缩/ })).toBeDisabled()
  })
  it('loads one image, configures ICO, converts and downloads the result', async () => {
    const user = userEvent.setup()
    renderPage()
    fireEvent.change(screen.getByLabelText('选择图片文件'), {
      target: { files: [new File(['png'], 'hero.png', { type: 'image/png' })] },
    })
    expect(await screen.findByText('640 × 360')).toBeVisible()

    await user.click(screen.getByRole('button', { name: /ICO/ }))
    expect(screen.getByText('ICO 尺寸模式')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '单尺寸' }))
    await user.selectOptions(screen.getByRole('combobox'), '128')
    await user.click(screen.getByRole('button', { name: /开始转换/ }))

    expect(await screen.findByText('已完成')).toBeVisible()
    expect(screen.getByRole('link', { name: '下载 hero.ico' })).toHaveAttribute('download', 'hero.ico')
    expect(convertImage).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ format: 'ico', icoMode: 'single', icoSize: 128 }),
    }))
  })

  it('handles a batch, creates a ZIP, and clears all files', async () => {
    const user = userEvent.setup()
    renderPage()
    fireEvent.change(screen.getByLabelText('选择图片文件'), { target: { files: [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ] } })
    await waitFor(() => expect(screen.getByText('2 / 20 个文件')).toBeVisible())
    await user.click(screen.getByRole('button', { name: /开始转换/ }))
    expect(await screen.findByText('2 个文件转换完成')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '下载全部 ZIP' }))
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByText('0 / 20 个文件')).toBeVisible()
  })

  it('compresses one image, shows actual size, and downloads it directly', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '图片压缩' }))
    fireEvent.change(screen.getByLabelText('选择图片文件'), { target: { files: [new File(['png-data'], 'hero.png', { type: 'image/png' })] } })
    await screen.findByText('640 × 360')
    await user.click(screen.getByRole('button', { name: /转为 WebP/ }))
    await user.type(screen.getByLabelText('目标大小（可选）'), '10')
    await user.click(screen.getByRole('button', { name: /开始压缩/ }))
    expect(await screen.findByText('1 个文件处理完成')).toBeVisible()
    expect(screen.getByRole('link', { name: /下载图片/ })).toHaveAttribute('download', 'hero-compressed.webp')
    expect(compressImage).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ format: 'webp', targetBytes: 10 * 1024 }), expect.any(Object))
  })

  it('keeps uploads but invalidates previous results when mode or settings change', async () => {
    const user = userEvent.setup()
    renderPage()
    fireEvent.change(screen.getByLabelText('选择图片文件'), { target: { files: [new File(['png'], 'hero.png', { type: 'image/png' })] } })
    await screen.findByText('640 × 360')
    await user.click(screen.getByRole('button', { name: /开始转换/ }))
    await screen.findByText('已完成')
    await user.click(screen.getByRole('button', { name: '图片压缩' }))
    expect(screen.getByText('1 / 20 个文件')).toBeVisible()
    expect(screen.queryByRole('link', { name: '下载 hero.ico' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('目标大小（可选）'), '50001')
    expect(screen.getByRole('button', { name: /开始压缩/ })).toBeDisabled()
  })

  it('continues a batch when one image cannot be compressed', async () => {
    const user = userEvent.setup()
    vi.mocked(compressImage).mockImplementation(async (file, options) => {
      if (file.name === 'bad.png') throw new Error('无法压缩此图片')
      return {
        blob: new Blob(['ok'], { type: 'image/webp' }), fileName: 'good-compressed.webp', format: 'webp',
        width: 640, height: 360, durationMs: 2, originalBytes: file.size,
        targetBytes: options.targetBytes, targetMet: null,
      }
    })
    renderPage()
    await user.click(screen.getByRole('button', { name: '图片压缩' }))
    fireEvent.change(screen.getByLabelText('选择图片文件'), { target: { files: [
      new File(['bad'], 'bad.png', { type: 'image/png' }),
      new File(['good'], 'good.png', { type: 'image/png' }),
    ] } })
    await waitFor(() => expect(screen.getAllByText('640 × 360')).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: /开始压缩/ }))
    expect(await screen.findByText('无法压缩此图片')).toBeVisible()
    expect(screen.getByRole('link', { name: '下载 good-compressed.webp' })).toBeVisible()
    expect(compressImage).toHaveBeenCalledTimes(2)
  })

  it('offers presets, invalidates stale output, and compares original with result', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '图片压缩' }))
    fireEvent.change(screen.getByLabelText('选择图片文件'), { target: { files: [new File(['img'], 'sample.png', { type: 'image/png' })] } })
    await screen.findByText('640 × 360')
    await user.click(screen.getByRole('button', { name: /转为 WebP/ }))
    await user.click(screen.getByRole('button', { name: /开始压缩/ }))
    await screen.findByText('1 个文件处理完成')
    await user.click(screen.getByRole('button', { name: '对比预览' }))
    expect(screen.getByRole('region', { name: '原图与结果对比' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /画质优先/ }))
    expect(screen.queryByRole('region', { name: '原图与结果对比' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '下载图片' })).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-2')
    await user.click(screen.getByRole('button', { name: /开始压缩/ }))
    await waitFor(() => expect(compressImage).toHaveBeenLastCalledWith(expect.any(File),
      expect.objectContaining({ quality: 0.9 }), expect.any(Object)))
  })

  it('stops the current compression without losing the queued image', async () => {
    const user = userEvent.setup()
    vi.mocked(compressImage).mockImplementation((_file, _options, hooks) => new Promise((_resolve, reject) => {
      hooks?.signal?.addEventListener('abort', () => reject(new Error('stopped')), { once: true })
    }))
    renderPage()
    await user.click(screen.getByRole('button', { name: '图片压缩' }))
    fireEvent.change(screen.getByLabelText('选择图片文件'), { target: { files: [new File(['img'], 'sample.png', { type: 'image/png' })] } })
    await screen.findByText('640 × 360')
    await user.click(screen.getByRole('button', { name: /开始压缩/ }))
    await user.click(await screen.findByRole('button', { name: '停止处理' }))
    expect(await screen.findByText(/已停止处理，保留已完成的 0 个结果/)).toBeInTheDocument()
    expect(screen.getByText('等待压缩')).toBeVisible()
  })

  it('prepares previews sequentially and waits for all images before processing', async () => {
    let active = 0
    let peak = 0
    vi.mocked(decodeImageFile).mockImplementation(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 15))
      active -= 1
      return { format: 'png', image: { width: 640, height: 360, data: new Uint8ClampedArray(640 * 360 * 4) } }
    })
    renderPage()
    fireEvent.change(screen.getByLabelText('选择图片文件'), { target: { files: [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
      new File(['three'], 'three.png', { type: 'image/png' }),
    ] } })
    expect(screen.getByRole('button', { name: /开始转换/ })).toBeDisabled()
    await waitFor(() => expect(screen.getAllByText('640 × 360')).toHaveLength(3))
    expect(peak).toBe(1)
    expect(screen.getByRole('button', { name: /开始转换/ })).toBeEnabled()
  })
})
