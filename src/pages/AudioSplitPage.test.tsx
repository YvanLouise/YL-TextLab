import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioSplitEngine } from '../features/audio-splitting/types'
import { ThemeProvider } from '../theme/ThemeProvider'
import { AudioSplitPage } from './AudioSplitPage'

function wavFile() {
  const bytes = new Uint8Array(44)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8)
  return new File([bytes], 'tone.wav', { type: 'audio/wav' })
}

function videoFile() {
  return new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], 'clip.webm', { type: 'video/webm' })
}

function renderPage(engine: AudioSplitEngine, useProbeFallback = false) {
  return render(
    <BrowserRouter>
      <ThemeProvider>
        <AudioSplitPage
          engineFactory={vi.fn().mockResolvedValue(engine)}
          analyzeAudio={useProbeFallback
            ? vi.fn().mockRejectedValue(new Error('浏览器无法读取视频时长'))
            : vi.fn().mockResolvedValue({ duration: 10, peaks: [0.2, 0.8, 0.5] })}
        />
      </ThemeProvider>
    </BrowserRouter>,
  )
}

beforeEach(() => {
  let index = 0
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:split-${index++}`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '',
  }) as never
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AudioSplitPage', () => {
  it('loads audio, selects a range and exports the segment', async () => {
    const user = userEvent.setup()
    const engine: AudioSplitEngine = {
      load: vi.fn().mockResolvedValue(undefined),
      probe: vi.fn().mockResolvedValue(10),
      split: vi.fn().mockResolvedValue({
        blob: new Blob(['segment'], { type: 'audio/wav' }),
        fileName: 'tone_片段.wav',
        durationMs: 12,
      }),
      cancel: vi.fn(),
      dispose: vi.fn(),
    }
    renderPage(engine)

    fireEvent.change(screen.getByLabelText('选择要处理的音频或视频文件'), { target: { files: [wavFile()] } })
    expect(await screen.findByText('tone.wav')).toBeVisible()
    fireEvent.change(screen.getByLabelText('开始位置'), { target: { value: '2.5' } })
    fireEvent.change(screen.getByLabelText('结束位置'), { target: { value: '7.25' } })
    await user.selectOptions(screen.getByLabelText('输出格式'), 'wav')
    await user.click(screen.getByRole('button', { name: '导出所选片段' }))

    await waitFor(() => expect(engine.split).toHaveBeenCalledWith(
      expect.objectContaining({ startSeconds: 2.5, endSeconds: 7.25, outputFormat: 'wav' }),
      expect.any(Function),
    ))
    expect(await screen.findByRole('link', { name: '下载片段' })).toHaveAttribute('download')
  })

  it('loads a video and exports the selected audio track as MP3', async () => {
    const user = userEvent.setup()
    const engine: AudioSplitEngine = {
      load: vi.fn().mockResolvedValue(undefined),
      probe: vi.fn().mockResolvedValue(10),
      split: vi.fn().mockResolvedValue({
        blob: new Blob(['mp3'], { type: 'audio/mpeg' }),
        fileName: 'clip_片段.mp3',
        durationMs: 14,
      }),
      cancel: vi.fn(),
      dispose: vi.fn(),
    }
    renderPage(engine, true)

    fireEvent.change(screen.getByLabelText('选择要处理的音频或视频文件'), { target: { files: [videoFile()] } })
    expect(await screen.findByText('clip.webm')).toBeVisible()
    expect(engine.probe).toHaveBeenCalledWith(expect.objectContaining({ name: 'clip.webm' }))
    expect(screen.getByLabelText('输出格式')).toHaveValue('mp3')
    expect(screen.queryByRole('option', { name: '保持原格式' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '提取所选音频' }))

    await waitFor(() => expect(engine.split).toHaveBeenCalledWith(
      expect.objectContaining({ inputFormat: 'webm', sourceKind: 'video', outputFormat: 'mp3' }),
      expect.any(Function),
    ))
    expect(await screen.findByText('视频音轨已提取')).toBeVisible()
  })
})
