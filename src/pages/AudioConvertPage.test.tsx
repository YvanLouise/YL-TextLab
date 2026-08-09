import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioConversionEngine, AudioConversionResult } from '../features/audio-conversion/types'
import { ThemeProvider } from '../theme/ThemeProvider'
import { AudioConvertPage } from './AudioConvertPage'

function audioFile(name: string) {
  return new File([new Uint8Array([0x49, 0x44, 0x33, 0x04])], name, { type: 'audio/mpeg' })
}

function result(fileName = 'track.flac'): AudioConversionResult {
  return {
    blob: new Blob(['converted'], { type: 'audio/flac' }),
    fileName,
    format: fileName.endsWith('.flac') ? 'flac' : 'mp3',
    durationMs: 12,
    warnings: [],
  }
}

function createEngine(overrides: Partial<AudioConversionEngine> = {}) {
  const engine: AudioConversionEngine = {
    load: vi.fn().mockResolvedValue(undefined),
    convert: vi.fn().mockImplementation(async (_request, onProgress) => {
      onProgress?.(55)
      return result()
    }),
    cancel: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  }
  return engine
}

function renderPage(engine: AudioConversionEngine) {
  return render(
    <BrowserRouter>
      <ThemeProvider>
        <AudioConvertPage engineFactory={vi.fn().mockResolvedValue(engine)} />
      </ThemeProvider>
    </BrowserRouter>,
  )
}

beforeEach(() => {
  let index = 0
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:audio-${index++}`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AudioConvertPage', () => {
  it('loads audio, applies settings, converts and exposes the result', async () => {
    const user = userEvent.setup()
    const engine = createEngine()
    renderPage(engine)

    fireEvent.change(screen.getByLabelText('选择音频文件'), {
      target: { files: [audioFile('track.mp3')] },
    })
    expect(await screen.findByText('等待转换')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /FLAC/ }))
    await user.selectOptions(screen.getByLabelText('采样率'), '48000')
    await user.selectOptions(screen.getByLabelText('声道'), 'stereo')
    await user.click(screen.getByRole('button', { name: /开始转换/ }))

    expect(await screen.findByText('1 个音频转换完成')).toBeVisible()
    expect(screen.getByRole('link', { name: '下载 track.flac' })).toHaveAttribute('download', 'track.flac')
    expect(engine.load).toHaveBeenCalledOnce()
    expect(engine.convert).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ name: 'track.mp3' }),
        options: expect.objectContaining({ format: 'flac', sampleRate: 48000, channels: 'stereo' }),
      }),
      expect.any(Function),
    )
  })

  it('applies custom bitrate and per-track song information', async () => {
    const user = userEvent.setup()
    const engine = createEngine()
    renderPage(engine)

    fireEvent.change(screen.getByLabelText('选择音频文件'), {
      target: { files: [audioFile('track.mp3')] },
    })
    await screen.findByText('等待转换')
    await user.click(screen.getByRole('button', { name: '自定义码率' }))
    fireEvent.change(screen.getByLabelText('自定义码率'), { target: { value: '224' } })
    await user.click(screen.getByRole('button', { name: '编辑 track.mp3 的歌曲信息' }))
    await user.type(screen.getByLabelText('歌曲标题'), '新的标题')
    await user.type(screen.getByRole('textbox', { name: '艺术家' }), 'YvanLouise')
    fireEvent.change(screen.getByLabelText('选择封面图片'), {
      target: { files: [new File(['cover'], 'cover.png', { type: 'image/png' })] },
    })
    await user.click(screen.getByRole('button', { name: /开始转换/ }))

    await screen.findByText('1 个音频转换完成')
    expect(engine.convert).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ qualityMode: 'custom', customBitrateKbps: 224 }),
        metadata: expect.objectContaining({ title: '新的标题', artist: 'YvanLouise' }),
        coverFile: expect.objectContaining({ name: 'cover.png' }),
      }),
      expect.any(Function),
    )
  })

  it('continues a batch after one file fails and downloads successful results', async () => {
    const user = userEvent.setup()
    const convert = vi.fn()
      .mockRejectedValueOnce(new Error('bad codec'))
      .mockResolvedValueOnce(result('second.mp3'))
    const engine = createEngine({ convert })
    renderPage(engine)
    fireEvent.change(screen.getByLabelText('选择音频文件'), {
      target: { files: [audioFile('first.mp3'), audioFile('second.mp3')] },
    })
    await waitFor(() => expect(screen.getByText('2 / 20 个文件')).toBeVisible())
    await user.click(screen.getByRole('button', { name: /开始转换/ }))

    expect(await screen.findByText('1 个音频转换完成')).toBeVisible()
    expect(screen.getByText('处理失败')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '下载全部' }))
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled())
  })

  it('stops the active conversion and releases object URLs on clear', async () => {
    const user = userEvent.setup()
    let rejectConversion: (reason: Error) => void = () => undefined
    const engine = createEngine({
      convert: vi.fn(() => new Promise<AudioConversionResult>((_resolve, reject) => { rejectConversion = reject })),
      cancel: vi.fn(() => rejectConversion(new Error('cancelled'))),
    })
    renderPage(engine)
    fireEvent.change(screen.getByLabelText('选择音频文件'), {
      target: { files: [audioFile('track.mp3')] },
    })
    await screen.findByText('等待转换')
    await user.click(screen.getByRole('button', { name: /开始转换/ }))
    await user.click(await screen.findByRole('button', { name: '停止转换' }))
    expect(engine.cancel).toHaveBeenCalledOnce()
    expect(await screen.findByText('已停止')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '清空' }))
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    expect(screen.getByText('0 / 20 个文件')).toBeVisible()
  })
})
