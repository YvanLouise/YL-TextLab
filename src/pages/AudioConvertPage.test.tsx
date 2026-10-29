import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { unzipSync } from 'fflate'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioConversionEngine, AudioConversionResult } from '../features/audio-conversion/types'
import { AudioConversionError } from '../features/audio-conversion/types'
import { ThemeProvider } from '../theme/ThemeProvider'
import { AudioConvertPage } from './AudioConvertPage'

function audioFile(name: string) {
  return new File([new Uint8Array([0x49, 0x44, 0x33, 0x04])], name, { type: 'audio/mpeg' })
}

function pcmFile(name = 'recording.wav') {
  const bytes = new Uint8Array(1024)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WAVE'), 8)
  return new File([bytes], name, { type: 'audio/wav' })
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
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AudioConvertPage', () => {
  it('filters queue presentation without changing the batch and releases the engine on clear', async () => {
    const user = userEvent.setup()
    const engine = createEngine({ convert: vi.fn().mockResolvedValueOnce(result('one.mp3')).mockRejectedValueOnce(new Error('bad source')) })
    renderPage(engine)
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: [audioFile('one.mp3'), audioFile('two.mp3')] } })
    await waitFor(() => expect(screen.getAllByText('等待转换')).toHaveLength(2))
    await user.type(screen.getByLabelText('搜索音频文件'), 'ONE')
    expect(screen.getByText('one.mp3')).toBeVisible()
    expect(screen.queryByText('two.mp3')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /开始转换/ }))
    await screen.findByText('1 个音频转换完成')
    expect(engine.convert).toHaveBeenCalledTimes(2)
    await user.clear(screen.getByLabelText('搜索音频文件'))
    await user.selectOptions(screen.getByLabelText('筛选音频状态'), 'error')
    expect(screen.getByText('two.mp3')).toBeVisible()
    expect(screen.queryByText('one.mp3')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('筛选音频状态'), 'done')
    expect(screen.getByRole('link', { name: '下载 one.mp3' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '清空' }))
    expect(engine.dispose).toHaveBeenCalledOnce()
    expect(screen.queryByLabelText('搜索音频文件')).not.toBeInTheDocument()
  })

  it('lets users replace a bitrate number and locks settings during conversion', async () => {
    const user = userEvent.setup()
    const engine = createEngine({ convert: vi.fn(() => new Promise<AudioConversionResult>(() => {})) })
    renderPage(engine)
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: [audioFile('track.mp3')] } })
    await screen.findByText('等待转换')
    await user.click(screen.getByRole('button', { name: '自定义码率' }))
    await user.clear(screen.getByLabelText('码率数值'))
    await user.type(screen.getByLabelText('码率数值'), '224')
    await user.tab()
    expect(screen.getByLabelText('码率数值')).toHaveValue(224)
    await user.click(screen.getByRole('button', { name: /开始转换/ }))
    await waitFor(() => expect(engine.convert).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ customBitrateKbps: 224 }) }), expect.any(Function)))
    expect(screen.getByLabelText('码率数值')).toBeDisabled()
    expect(screen.getByLabelText('采样率')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '停止转换' }))
    expect(screen.getByLabelText('码率数值')).toBeEnabled()
  })

  it('automatically pauses another file when starting a preview', async () => {
    renderPage(createEngine())
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: [audioFile('one.mp3'), audioFile('two.mp3')] } })
    await waitFor(() => expect(screen.getAllByText('等待转换')).toHaveLength(2))
    const first = screen.getByLabelText('one.mp3 原音频试听')
    const second = screen.getByLabelText('two.mp3 原音频试听')
    Object.defineProperty(first, 'paused', { value: false })
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    fireEvent.play(second)
    expect(pause.mock.instances).toContain(first)
  })

  it('can stop folder scanning and subsequently drag a folder into lossless mode', async () => {
    const user = userEvent.setup()
    renderPage(createEngine())
    const zone = screen.getByRole('heading', { name: '拖入多个音频或文件夹，或点击选择' }).parentElement!.parentElement!
    const children = [pcmFile('song.wav'), new File(['notes'], 'notes.txt')].map(file => ({
      name: file.name, isFile: true, isDirectory: false, file: (accept: (value: File) => void) => accept(file),
    }))
    let finish: (value: typeof children) => void = () => {}
    const folder = { name: 'Album', isDirectory: true, isFile: false,
      createReader: () => ({ readEntries: (resolve: typeof finish) => { finish = resolve } }) }
    const dataTransfer = { items: [{ kind: 'file', webkitGetAsEntry: () => folder, getAsFile: () => null }], files: [] }
    fireEvent.drop(zone, { dataTransfer })
    await user.click(await screen.findByRole('button', { name: '停止读取' }))
    await act(async () => finish(children))
    expect(screen.queryByText('Album/song.wav')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择音频' })).toBeEnabled()
    let read = false
    folder.createReader = () => ({ readEntries: resolve => { const page = read ? [] : children; read = true; resolve(page) } })
    fireEvent.drop(zone, { dataTransfer })
    await screen.findByText('Album/song.wav')
    expect(screen.getByRole('button', { name: '无损压缩' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('导入摘要')).toHaveTextContent('已添加 1 个音频。已忽略 1 个')
  })

  it('imports a folder into lossless mode and exports a single result with its original subdirectory', async () => {
    const user = userEvent.setup()
    const engine = createEngine({ convert: vi.fn().mockResolvedValue(result('song-无损.flac')) })
    renderPage(engine)
    const input = screen.getByLabelText('选择音频无损压缩文件夹')
    expect(input).toHaveAttribute('webkitdirectory')
    const track = Object.defineProperty(pcmFile('song.wav'), 'webkitRelativePath', { value: 'Album/Side A/song.wav' })
    fireEvent.change(input, { target: { files: [track, new File(['notes'], 'notes.txt'), audioFile('song.mp3')] } })
    await screen.findByText('等待转换')
    expect(screen.getByRole('button', { name: '无损压缩' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('导入摘要')).toHaveTextContent('已添加 1 个音频。已忽略 2 个')
    expect(screen.getByText('Album/Side A/song.wav')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /开始无损压缩/ }))
    await screen.findByText('1 个音频无损压缩完成')
    await user.click(screen.getByRole('button', { name: '下载文件夹 ZIP' }))
    let archive: Blob | undefined
    await waitFor(() => {
      archive = vi.mocked(URL.createObjectURL).mock.calls.map(([blob]) => blob as Blob).find(blob => blob.type === 'application/zip')
      expect(archive).toBeDefined()
    })
    expect(Object.keys(unzipSync(new Uint8Array(await archive!.arrayBuffer())))).toEqual(['Album/Side A/song-无损.flac'])
  })

  it('continues past a failed file and retries only failed files without replacing completed results', async () => {
    const user = userEvent.setup()
    const engine = createEngine({ convert: vi.fn()
      .mockResolvedValueOnce(result('one.flac'))
      .mockRejectedValueOnce(new Error('Broken source'))
      .mockResolvedValueOnce(result('three.flac'))
      .mockResolvedValueOnce(result('two.flac')) })
    renderPage(engine)
    await user.click(screen.getByRole('button', { name: '无损压缩' }))
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: ['one', 'two', 'three'].map(name => pcmFile(`${name}.wav`)) } })
    await waitFor(() => expect(screen.getAllByText('等待转换')).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: /开始无损压缩/ }))
    await screen.findByText('2 个音频无损压缩完成')
    const firstUrl = screen.getByRole('link', { name: '下载 one.flac' }).getAttribute('href')
    expect(screen.getByLabelText('批量结果汇总')).toHaveTextContent('已完成 2/3 个文件，1 个失败')
    expect(screen.getByRole('button', { name: /开始无损压缩/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '重试失败项（1）' }))
    await screen.findByText('3 个音频无损压缩完成')
    expect(vi.mocked(engine.convert).mock.calls.map(([request]) => request.file.name)).toEqual(['one.wav', 'two.wav', 'three.wav', 'two.wav'])
    expect(screen.getByRole('link', { name: '下载 one.flac' })).toHaveAttribute('href', firstUrl)
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(firstUrl)
  })

  it('resumes an interrupted batch without recompressing completed files or accepting stale results', async () => {
    let finish: (result: AudioConversionResult) => void = () => {}
    const user = userEvent.setup()
    const engine = createEngine({ convert: vi.fn()
      .mockResolvedValueOnce(result('one.flac'))
      .mockImplementationOnce(() => new Promise<AudioConversionResult>(resolve => { finish = resolve }))
      .mockResolvedValueOnce(result('two.flac'))
      .mockResolvedValueOnce(result('three.flac')) })
    renderPage(engine)
    await user.click(screen.getByRole('button', { name: '无损压缩' }))
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: ['one', 'two', 'three'].map(name => pcmFile(`${name}.wav`)) } })
    await waitFor(() => expect(screen.getAllByText('等待转换')).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: /开始无损压缩/ }))
    await waitFor(() => expect(engine.convert).toHaveBeenCalledTimes(2))
    const firstUrl = screen.getByRole('link', { name: '下载 one.flac' }).getAttribute('href')
    await user.click(screen.getByRole('button', { name: '停止压缩' }))
    await user.click(screen.getByRole('button', { name: '开始无损压缩（2）' }))
    await screen.findByText('3 个音频无损压缩完成')
    await act(async () => finish(result('stale.flac')))
    expect(screen.queryByRole('link', { name: '下载 stale.flac' })).not.toBeInTheDocument()
    expect(vi.mocked(engine.convert).mock.calls.map(([request]) => request.file.name)).toEqual(['one.wav', 'two.wav', 'two.wav', 'three.wav'])
    expect(screen.getByRole('link', { name: '下载 one.flac' })).toHaveAttribute('href', firstUrl)
    expect(screen.getByRole('button', { name: /开始无损压缩/ })).toBeDisabled()
  })

  it('locks lossless parameters, shows actual savings and invalidates results when switching modes', async () => {
    const user = userEvent.setup()
    const output = { ...result('recording-无损.flac'), blob: new Blob([new Uint8Array(512)]),
      lossless: { sampleRate: 48000, bitDepth: 24, channels: 2, sampleFrames: 48000, verified: true as const } }
    const engine = createEngine({ convert: vi.fn().mockResolvedValue(output) })
    renderPage(engine)
    await user.selectOptions(screen.getByLabelText('采样率'), '44100')
    await user.selectOptions(screen.getByLabelText('声道'), 'mono')
    await user.click(screen.getByRole('button', { name: '无损压缩' }))
    expect(screen.queryByLabelText('采样率')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('声道')).not.toBeInTheDocument()
    expect(screen.queryByText('目标格式')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: [pcmFile()] } })
    await screen.findByText('等待转换')
    await user.click(screen.getByRole('button', { name: /开始无损压缩/ }))
    await screen.findByText('1 个音频无损压缩完成')
    expect(engine.convert).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ mode: 'lossless', format: 'flac', sampleRate: 'original', channels: 'original' }),
    }), expect.any(Function))
    expect(screen.getByLabelText('recording.wav 的无损压缩结果')).toHaveTextContent('节省 512 B（50.0%）')
    expect(screen.getByText(/采样校验通过 · 48 kHz · 24 位 · 2 声道/)).toBeVisible()
    const url = screen.getByRole('link', { name: '下载 recording-无损.flac' }).getAttribute('href')
    await user.click(screen.getByRole('button', { name: /^格式转换/ }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
    expect(screen.queryByRole('link', { name: '下载 recording-无损.flac' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('采样率')).toHaveValue('44100')
    expect(screen.getByLabelText('声道')).toHaveValue('mono')
  })

  it('skips lossy files in mixed lossless batches and explains the limitation', async () => {
    const engine = createEngine()
    const user = userEvent.setup()
    renderPage(engine)
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: [audioFile('lossy.mp3')] } })
    await screen.findByText('等待转换')
    await user.click(screen.getByRole('button', { name: '无损压缩' }))
    expect(screen.getByText('不适用')).toBeVisible()
    expect(screen.getByText(/不能恢复音质/)).toBeVisible()
    expect(screen.getByRole('button', { name: /开始无损压缩/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: [pcmFile()] } })
    await screen.findByText('等待转换')
    await user.click(screen.getByRole('button', { name: '开始无损压缩（1）' }))
    await screen.findByText('1 个音频无损压缩完成')
    expect(engine.convert).toHaveBeenCalledOnce()
    expect(engine.convert).toHaveBeenCalledWith(expect.objectContaining({ file: expect.objectContaining({ name: 'recording.wav' }) }), expect.any(Function))
  })

  it('reports larger outputs accurately and can cancel without accepting a stale lossless result', async () => {
    let finish: (result: AudioConversionResult) => void = () => {}
    const user = userEvent.setup()
    const engine = createEngine({ convert: vi.fn(() => new Promise<AudioConversionResult>(resolve => { finish = resolve })) })
    renderPage(engine)
    await user.click(screen.getByRole('button', { name: '无损压缩' }))
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: [pcmFile()] } })
    await screen.findByText('等待转换')
    await user.click(screen.getByRole('button', { name: /开始无损压缩/ }))
    await waitFor(() => expect(engine.convert).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: '无损压缩' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '停止压缩' }))
    const output = { ...result('recording-无损.flac'), blob: new Blob([new Uint8Array(2048)]),
      lossless: { sampleRate: 48000, bitDepth: 16, channels: 1, sampleFrames: 48000, verified: true as const } }
    await act(async () => finish(output))
    expect(screen.queryByRole('link', { name: '下载 recording-无损.flac' })).not.toBeInTheDocument()
    vi.mocked(engine.convert).mockResolvedValue(output)
    await user.click(screen.getByRole('button', { name: /开始无损压缩/ }))
    await screen.findByText('1 个音频无损压缩完成')
    expect(screen.getByLabelText('recording.wav 的无损压缩结果')).toHaveTextContent('体积增加 1.0 KB（100.0%）')
  })

  it('cancels a pending engine load, unlocks controls and ignores late completion', async () => {
    let finishLoading = () => {}
    const engine = createEngine({ load: vi.fn(() => new Promise<void>((resolve) => { finishLoading = resolve })) })
    const user = userEvent.setup()
    renderPage(engine)
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: [audioFile('track.mp3')] } })
    await screen.findByText('等待转换')
    await user.click(screen.getByRole('button', { name: /开始转换/ }))
    await waitFor(() => expect(engine.load).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: '停止转换' }))
    expect(engine.cancel).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '清空' })).toBeEnabled()
    await act(async () => finishLoading())
    expect(engine.convert).not.toHaveBeenCalled()
    expect(screen.queryByText(/正在按顺序转换/)).not.toBeInTheDocument()
  })

  it('disposes a loading engine on unmount without creating a late result', async () => {
    let finishLoading = () => {}
    const engine = createEngine({ load: vi.fn(() => new Promise<void>((resolve) => { finishLoading = resolve })) })
    const user = userEvent.setup()
    const view = renderPage(engine)
    fireEvent.change(screen.getByLabelText('选择音频文件'), { target: { files: [audioFile('track.mp3')] } })
    await screen.findByText('等待转换')
    await user.click(screen.getByRole('button', { name: /开始转换/ }))
    await waitFor(() => expect(engine.load).toHaveBeenCalledOnce())
    view.unmount()
    expect(engine.dispose).toHaveBeenCalledOnce()
    await act(async () => finishLoading())
    expect(engine.convert).not.toHaveBeenCalled()
  })

  it('preserves every ZIP result when filenames collide with numbered originals', async () => {
    const user = userEvent.setup()
    const engine = createEngine({ convert: vi.fn()
      .mockResolvedValueOnce({ ...result('song.mp3'), blob: new Blob(['first']) })
      .mockResolvedValueOnce({ ...result('song.mp3'), blob: new Blob(['second']) })
      .mockResolvedValueOnce({ ...result('song-2.mp3'), blob: new Blob(['third']) }) })
    renderPage(engine)
    fireEvent.change(screen.getByLabelText('选择音频文件'), {
      target: { files: [audioFile('one.mp3'), audioFile('two.mp3'), audioFile('three.mp3')] },
    })
    await waitFor(() => expect(screen.getAllByText('等待转换')).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: /开始转换/ }))
    await screen.findByText('3 个音频转换完成')
    await user.click(screen.getByRole('button', { name: '下载全部' }))
    let archive: Blob | undefined
    await waitFor(() => {
      archive = vi.mocked(URL.createObjectURL).mock.calls.map(([blob]) => blob as Blob)
        .find((blob) => blob.type === 'application/zip')
      expect(archive).toBeDefined()
    })
    const entries = unzipSync(new Uint8Array(await archive!.arrayBuffer()))
    expect(Object.keys(entries).sort()).toEqual(['song-2.mp3', 'song-3.mp3', 'song.mp3'])
    expect(new TextDecoder().decode(entries['song-3.mp3'])).toBe('second')
  })

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

  it('edits song information without changing format or quality', async () => {
    const user = userEvent.setup()
    const engine = createEngine({
      convert: vi.fn().mockResolvedValue(result('track-已编辑.mp3')),
    })
    renderPage(engine)

    await user.click(screen.getByRole('button', { name: /仅修改信息/ }))
    fireEvent.change(screen.getByLabelText('选择音频文件'), {
      target: { files: [audioFile('track.mp3')] },
    })
    await screen.findByText('等待转换')
    expect(screen.getByText('音频流原样复制')).toBeVisible()
    await user.type(screen.getByLabelText('歌曲标题'), '保留原音质')
    await user.click(screen.getByRole('button', { name: /写入歌曲信息/ }))

    expect(await screen.findByText('1 个音频信息修改完成')).toBeVisible()
    expect(screen.getByRole('link', { name: '下载 track-已编辑.mp3' }))
      .toHaveAttribute('download', 'track-已编辑.mp3')
    expect(engine.convert).toHaveBeenCalledWith(
      expect.objectContaining({
        inputFormat: 'mp3',
        options: expect.objectContaining({ mode: 'metadata-only' }),
        metadata: expect.objectContaining({ title: '保留原音质' }),
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
    await waitFor(() => expect(screen.getByText('2 / 100 个文件')).toBeVisible())
    await user.click(screen.getByRole('button', { name: /开始转换/ }))

    expect(await screen.findByText('1 个音频转换完成')).toBeVisible()
    expect(screen.getByText('处理失败')).toBeVisible()
    const downloadLink = screen.getByRole('link', { name: '下载文件' })
    expect(downloadLink).toHaveAttribute('download', 'second.mp3')
    expect(downloadLink.getAttribute('href')).toMatch(/^blob:audio-/)
  })

  it('passes the WAV compatibility encoding and withholds downloads when verification fails', async () => {
    const user = userEvent.setup()
    const engine = createEngine({ convert: vi.fn().mockRejectedValue(new AudioConversionError('METADATA_VERIFY_FAILED', '歌曲信息写入校验失败：歌曲标题。')) })
    renderPage(engine)
    await user.click(screen.getByRole('button', { name: /仅修改信息/ }))
    fireEvent.change(screen.getByLabelText('选择音频文件'), {
      target: { files: [new File([new TextEncoder().encode('RIFF1234WAVE')], 'track.wav', { type: 'audio/wav' })] },
    })
    await screen.findByText('等待转换')
    expect(screen.getByLabelText('WAV 标签编码')).toHaveValue('gbk')
    await user.selectOptions(screen.getByLabelText('WAV 标签编码'), 'utf-8')
    await user.type(screen.getByLabelText('歌曲标题'), '中文标题')
    await user.click(screen.getByRole('button', { name: /写入歌曲信息/ }))
    expect(await screen.findByText('歌曲信息写入校验失败：歌曲标题。')).toBeVisible()
    expect(screen.queryByRole('link', { name: /下载/ })).not.toBeInTheDocument()
    expect(engine.convert).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ mode: 'metadata-only', wavMetadataEncoding: 'utf-8' }),
    }), expect.any(Function))
  })

  it('uses a ZIP archive only when multiple results are downloaded together', async () => {
    const user = userEvent.setup()
    const engine = createEngine({
      convert: vi.fn()
        .mockResolvedValueOnce(result('first.mp3'))
        .mockResolvedValueOnce(result('second.mp3')),
    })
    renderPage(engine)
    fireEvent.change(screen.getByLabelText('选择音频文件'), {
      target: { files: [audioFile('first.mp3'), audioFile('second.mp3')] },
    })
    await waitFor(() => expect(screen.getByText('2 / 100 个文件')).toBeVisible())
    await user.click(screen.getByRole('button', { name: /开始转换/ }))

    expect(await screen.findByText('2 个音频转换完成')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '下载全部' }))
    await waitFor(() => {
      const createdValues = vi.mocked(URL.createObjectURL).mock.calls.map(([value]) => value)
      expect(createdValues.some((value) => value instanceof Blob && value.type === 'application/zip')).toBe(true)
    })
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
    expect(screen.getByText('0 / 100 个文件')).toBeVisible()
  })
})
