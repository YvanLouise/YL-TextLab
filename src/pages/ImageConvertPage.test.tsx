import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { convertImage, createPreviewBlob, decodeImageFile } from '../features/image-conversion/engine'
import { ThemeProvider } from '../theme/ThemeProvider'
import { ImageConvertPage } from './ImageConvertPage'

vi.mock('../features/image-conversion/engine', () => ({
  decodeImageFile: vi.fn(),
  createPreviewBlob: vi.fn(),
  convertImage: vi.fn(),
}))

function renderPage() {
  return render(
    <BrowserRouter>
      <ThemeProvider><ImageConvertPage /></ThemeProvider>
    </BrowserRouter>,
  )
}

beforeEach(() => {
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

    await user.click(screen.getByRole('button', { name: '下载全部' }))
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByText('0 / 20 个文件')).toBeVisible()
  })
})
