import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioChannelSplitResult, AudioSplitEngine, AudioSplitResult } from '../features/audio-splitting/types'
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

function renderPage(engine: AudioSplitEngine, useProbeFallback = false, channels = 2) {
  return render(
    <BrowserRouter>
      <ThemeProvider>
        <AudioSplitPage
          engineFactory={vi.fn().mockResolvedValue(engine)}
          analyzeAudio={useProbeFallback
            ? vi.fn().mockRejectedValue(new Error('浏览器无法读取视频时长'))
            : vi.fn().mockResolvedValue({ duration: 10, peaks: [0.2, 0.8, 0.5], channels })}
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
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true })
    this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false })
    this.dispatchEvent(new Event('play'))
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AudioSplitPage', () => {
  function testEngine() : AudioSplitEngine {
    return { load: vi.fn().mockResolvedValue(undefined), probe: vi.fn().mockResolvedValue(10),
      split: vi.fn().mockResolvedValue({ blob: new Blob(['audio']), fileName: 'segment.wav', durationMs: 1 }),
      separateChannels: vi.fn().mockResolvedValue([
        { channel: 'left', blob: new Blob(['left']), fileName: 'tone_L.wav', durationMs: 1 },
        { channel: 'right', blob: new Blob(['right']), fileName: 'tone_R.wav', durationMs: 1 },
      ]),
      cancel: vi.fn(), dispose: vi.fn() }
  }

  async function upload() {
    fireEvent.change(screen.getByLabelText('选择要处理的音频或视频文件'), { target: { files: [wavFile()] } })
    await screen.findByText('tone.wav')
  }

  it('exports two independent channel files and releases their URLs when settings change', async () => {
    const user = userEvent.setup()
    const engine = testEngine()
    renderPage(engine)
    await user.click(screen.getByRole('button', { name: '左右声道分离' }))
    await upload()
    expect(screen.getByLabelText('输出格式')).toHaveValue('wav')
    expect(screen.getByLabelText('输出文件名')).toHaveValue('tone.wav')
    await user.click(screen.getByRole('button', { name: '分离并导出左右声道' }))
    const left = await screen.findByRole('link', { name: '下载左声道' })
    const right = screen.getByRole('link', { name: '下载右声道' })
    expect(left).toHaveAttribute('download', 'tone_L.wav')
    expect(right).toHaveAttribute('download', 'tone_R.wav')
    expect(engine.separateChannels).toHaveBeenCalledWith(expect.objectContaining({ startSeconds: 0, endSeconds: 10, outputFormat: 'wav' }), expect.any(Function))
    expect(engine.split).not.toHaveBeenCalled()
    const urls = [left.getAttribute('href'), right.getAttribute('href')]
    await user.click(screen.getByRole('button', { name: '片段导出' }))
    expect(screen.queryByLabelText('左右声道分离结果')).not.toBeInTheDocument()
    urls.forEach(url => expect(URL.revokeObjectURL).toHaveBeenCalledWith(url))
  })

  it('rejects mono input without starting a channel export', async () => {
    const user = userEvent.setup()
    const engine = testEngine()
    renderPage(engine, false, 1)
    await upload()
    await user.click(screen.getByRole('button', { name: '左右声道分离' }))
    expect(screen.getByRole('alert')).toHaveTextContent('此文件是单声道')
    expect(screen.getByRole('button', { name: '分离并导出左右声道' })).toBeDisabled()
    expect(engine.separateChannels).not.toHaveBeenCalled()
  })

  it('ignores a cancelled channel export and allows retry', async () => {
    const user = userEvent.setup()
    const engine = testEngine()
    let finish!: (results: AudioChannelSplitResult[]) => void
    vi.mocked(engine.separateChannels).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    renderPage(engine)
    await upload()
    await user.click(screen.getByRole('button', { name: '左右声道分离' }))
    await user.click(screen.getByRole('button', { name: '分离并导出左右声道' }))
    await waitFor(() => expect(engine.separateChannels).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: '取消导出' }))
    await act(async () => finish([{ channel: 'left', blob: new Blob(['late']), fileName: 'late.wav', durationMs: 1 }]))
    expect(screen.queryByLabelText('左右声道分离结果')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '分离并导出左右声道' }))
    expect(await screen.findByRole('link', { name: '下载右声道' })).toBeVisible()
  })

  it('zooms, seeks with the keyboard, marks boundaries and preserves a custom name', async () => {
    const user = userEvent.setup()
    renderPage(testEngine())
    await upload()
    fireEvent.change(screen.getByLabelText('输出文件名'), { target: { value: '我的片段.wav' } })
    fireEvent.keyDown(screen.getByRole('slider', { name: '播放位置' }), { key: 'ArrowRight', shiftKey: true })
    await user.click(screen.getByRole('button', { name: '设为起点' }))
    expect(screen.getByLabelText('开始时间')).toHaveValue('00:01.000')
    expect(screen.getByLabelText('输出文件名')).toHaveValue('我的片段.wav')
    await user.click(screen.getByRole('button', { name: '放大波形' }))
    expect(screen.getByLabelText('波形视窗位置')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '显示全部' }))
    expect(screen.queryByLabelText('波形视窗位置')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('输出格式'), 'mp3')
    expect(screen.getByLabelText('输出文件名')).toHaveValue('我的片段.mp3')
  })

  it('loops the selected range, controls volume and stops at the exact end', async () => {
    const user = userEvent.setup()
    renderPage(testEngine())
    await upload()
    fireEvent.change(screen.getByLabelText('开始位置'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('结束位置'), { target: { value: '4' } })
    const audio = screen.getByLabelText('原音频试听') as HTMLAudioElement
    fireEvent.change(screen.getByLabelText('试听音量'), { target: { value: '0.25' } })
    expect(audio.volume).toBe(0.25)
    await user.click(screen.getByRole('button', { name: '静音' }))
    expect(audio.muted).toBe(true)
    await user.click(screen.getByRole('button', { name: '循环试听' }))
    await user.click(screen.getByRole('button', { name: '播放所选片段' }))
    expect(audio.currentTime).toBe(2)
    audio.currentTime = 4.05
    fireEvent.timeUpdate(audio)
    expect(audio.currentTime).toBe(2)
    expect(audio.paused).toBe(false)
    await user.click(screen.getByRole('button', { name: '循环试听' }))
    audio.currentTime = 4.1
    fireEvent.timeUpdate(audio)
    expect(audio.paused).toBe(true)
    expect(audio.currentTime).toBe(4)
  })

  it('keeps the source URL alive after results change and releases it on removal', async () => {
    const user = userEvent.setup()
    renderPage(testEngine())
    await upload()
    const source = (screen.getByLabelText('原音频试听') as HTMLAudioElement).src
    await user.click(screen.getByRole('button', { name: '导出所选片段' }))
    await screen.findByRole('link', { name: '下载片段' })
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(source)
    fireEvent.change(screen.getByLabelText('开始位置'), { target: { value: '1' } })
    expect(screen.queryByRole('link', { name: '下载片段' })).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(source)
    await user.click(screen.getByRole('button', { name: '移除文件' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(source)
  })

  it('cancels an export, unlocks controls and ignores stale completion', async () => {
    const user = userEvent.setup()
    let finish!: (value: AudioSplitResult) => void
    const engine = testEngine()
    engine.split = vi.fn(() => new Promise<AudioSplitResult>(resolve => { finish = resolve }))
    renderPage(engine)
    await upload()
    await user.click(screen.getByRole('button', { name: '导出所选片段' }))
    await waitFor(() => expect(engine.split).toHaveBeenCalled())
    expect(screen.getByLabelText('开始时间')).toBeDisabled()
    expect(screen.getByRole('button', { name: '移除文件' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '取消导出' }))
    expect(engine.cancel).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('开始时间')).toBeEnabled()
    await act(async () => finish({ blob: new Blob(['late']), fileName: 'late.wav', durationMs: 1 }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已取消导出'))
    expect(screen.queryByRole('link', { name: '下载片段' })).not.toBeInTheDocument()
  })

  it('disposes an engine that arrives after its loading operation was cancelled', async () => {
    const user = userEvent.setup()
    let finish!: () => void
    const engine = testEngine()
    engine.load = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    renderPage(engine)
    await upload()
    await user.click(screen.getByRole('button', { name: '导出所选片段' }))
    await waitFor(() => expect(engine.load).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: '取消导出' }))
    await act(async () => finish())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已取消导出'))
    expect(engine.split).not.toHaveBeenCalled()
  })

  it('loads audio, selects a range and exports the segment', async () => {
    const user = userEvent.setup()
    const engine: AudioSplitEngine = {
      separateChannels: vi.fn(),
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
      separateChannels: vi.fn(),
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
