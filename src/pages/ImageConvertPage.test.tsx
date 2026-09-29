import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { convertImage, createPreviewBlob, decodeImageFile } from '../features/image-conversion/engine'
import { compressImage } from '../features/image-conversion/compression'
import { ThemeProvider } from '../theme/ThemeProvider'
import { ImageConvertPage } from './ImageConvertPage'

vi.mock('../features/image-conversion/engine', () => ({
  decodeImageFile: vi.fn(),
  createPreviewBlob: vi.fn(),
  convertImage: vi.fn(),
}))

vi.mock('../features/image-conversion/compression', () => ({ compressImage: vi.fn() }))

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
    fileName: `${file.name.replace(/\.[^.]+$/, '')}-compressed.webp`,
    format: 'webp', width: 640, height: 360, durationMs: 3,
    originalBytes: file.size, targetBytes: options.targetBytes, targetMet: options.targetBytes === null ? null : true,
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ImageConvertPage', () => {
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
    expect(compressImage).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ format: 'webp', targetBytes: 10 * 1024 }))
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
})
