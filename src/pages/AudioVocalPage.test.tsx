import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeProvider'
import { DEFAULT_VOCAL_OPTIONS, type VocalRenderer, type VocalResult } from '../features/audio-vocal/types'
import { AudioVocalPage } from './AudioVocalPage'

const wav = (name = '人声.wav') => new File(['RIFF----WAVEdata'], name, { type: 'audio/wav' })
const output = (preview = false): VocalResult => ({ blob: new Blob(['clean']), removed: new Blob(['removed']),
  fileName: '人声-主唱净化.wav', sampleRate: 48000, channels: 2, frames: 48000 * 20,
  start: preview ? 30 : 0, preview, trackedPercent: 90, outputGain: 1, warnings: ['同音高和声可能残留。'] })
const mount = (renderer: VocalRenderer) => render(<MemoryRouter><ThemeProvider><AudioVocalPage renderer={renderer} /></ThemeProvider></MemoryRouter>)
async function addFile() {
  const user = userEvent.setup()
  fireEvent.change(screen.getByLabelText('选择已分离的人声音频'), { target: { files: [wav()] } })
  await waitFor(() => expect(screen.getByRole('button', { name: '净化 20 秒试听' })).toBeEnabled())
  return user
}

beforeEach(() => {
  let index = 0
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:vocal-${index++}`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('vocal cleanup page', () => {
  it('defaults to natural preservation and explicitly requests a preview before full export', async () => {
    const renderer = vi.fn<VocalRenderer>().mockResolvedValueOnce(output(true)).mockResolvedValueOnce(output())
    const view = mount(renderer)
    const user = await addFile()
    expect(renderer).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^自然保留/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('checkbox')).toBeChecked()
    await user.clear(screen.getByLabelText('试听开始位置（秒）'))
    await user.type(screen.getByLabelText('试听开始位置（秒）'), '30')
    await user.click(screen.getByRole('button', { name: '净化 20 秒试听' }))
    expect(await screen.findByRole('link', { name: '下载净化试听片段' })).toBeVisible()
    expect(renderer).toHaveBeenLastCalledWith({ file: expect.any(File), options: DEFAULT_VOCAL_OPTIONS, previewStart: 30 }, expect.any(AbortSignal), expect.any(Function))
    const original = screen.getByLabelText('原人声试听') as HTMLAudioElement
    const clean = screen.getByLabelText('净化结果试听') as HTMLAudioElement
    original.currentTime = 35
    await user.click(screen.getByRole('button', { name: '同位置听净化' }))
    expect(clean.currentTime).toBe(5)
    clean.currentTime = 8
    await user.click(screen.getByRole('button', { name: '同位置听原声' }))
    expect(original.currentTime).toBe(38)
    expect(screen.getByLabelText('被削弱的声音试听')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '净化整段并导出' }))
    expect(await screen.findByRole('link', { name: '下载净化人声 WAV' })).toHaveAttribute('download', output().fileName)
    expect(renderer).toHaveBeenLastCalledWith(expect.objectContaining({ previewStart: null }), expect.any(AbortSignal), expect.any(Function))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vocal-1')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vocal-2')
    view.unmount()
    for (const id of [0, 3, 4]) expect(URL.revokeObjectURL).toHaveBeenCalledWith(`blob:vocal-${id}`)
  })

  it('invalidates both outputs after settings change and restores natural defaults', async () => {
    const renderer = vi.fn<VocalRenderer>().mockResolvedValue(output())
    mount(renderer)
    const user = await addFile()
    await user.click(screen.getByRole('button', { name: '净化整段并导出' }))
    await screen.findByRole('link', { name: '下载净化人声 WAV' })
    await user.selectOptions(screen.getByLabelText('输入声道'), 'left')
    expect(screen.queryByRole('link', { name: '下载净化人声 WAV' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('被削弱的声音试听')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vocal-1')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vocal-2')
    await user.click(screen.getByRole('button', { name: /^更强抑制/ }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '恢复自然保留设置' }))
    expect(screen.getByLabelText('输入声道')).toHaveValue('original')
    expect(screen.getByRole('slider', { name: /次要声音抑制/ })).toHaveValue('35')
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('cancels and retries immediately without accepting stale progress or an old result', async () => {
    let finishOld!: (value: VocalResult) => void
    const renderer = vi.fn<VocalRenderer>().mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve })).mockResolvedValue(output())
    mount(renderer)
    const user = await addFile()
    await user.click(screen.getByRole('button', { name: '净化整段并导出' }))
    expect(screen.getByLabelText('输入声道')).toBeDisabled()
    expect(screen.getByRole('button', { name: '更换文件' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '停止净化' }))
    expect(renderer.mock.calls[0][1].aborted).toBe(true)
    await user.click(screen.getByRole('button', { name: '净化整段并导出' }))
    const link = await screen.findByRole('link', { name: '下载净化人声 WAV' })
    const href = link.getAttribute('href')
    await act(async () => { renderer.mock.calls[0][2]('stale progress', 99); finishOld({ ...output(), fileName: 'stale.wav' }) })
    expect(link).toHaveAttribute('href', href)
    expect(link).not.toHaveAttribute('download', 'stale.wav')
    expect(screen.getByRole('status')).not.toHaveTextContent('stale progress')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3)
  })

  it('does not create output URLs after unmounting an active job', async () => {
    let finish!: (value: VocalResult) => void
    const renderer = vi.fn<VocalRenderer>().mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const view = mount(renderer)
    const user = await addFile()
    await user.click(screen.getByRole('button', { name: '净化整段并导出' }))
    view.unmount()
    expect(renderer.mock.calls[0][1].aborted).toBe(true)
    await act(async () => finish(output()))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vocal-0')
  })

  it('rejects an empty preview time and multi-file drops without losing the existing source', async () => {
    const renderer = vi.fn<VocalRenderer>().mockResolvedValue(output())
    mount(renderer)
    const user = await addFile()
    await user.clear(screen.getByLabelText('试听开始位置（秒）'))
    await user.click(screen.getByRole('button', { name: '净化 20 秒试听' }))
    expect(screen.getByRole('alert')).toHaveTextContent('有效的试听开始秒数')
    expect(renderer).not.toHaveBeenCalled()
    fireEvent.drop(screen.getByRole('region', { name: '人声音轨' }), { dataTransfer: { files: [wav('a.wav'), wav('b.wav')] } })
    expect(screen.getByRole('alert')).toHaveTextContent('一次放入一个')
    expect(screen.getByRole('heading', { name: '人声.wav' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '移除人声音轨' }))
    expect(screen.getByRole('button', { name: '净化整段并导出' })).toBeDisabled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vocal-0')
  })

  it('keeps a valid result when reselecting its preset, but invalidates a preview when its start changes', async () => {
    mount(vi.fn<VocalRenderer>().mockResolvedValue(output(true)))
    const user = await addFile()
    await user.click(screen.getByRole('button', { name: '净化 20 秒试听' }))
    const link = await screen.findByRole('link', { name: '下载净化试听片段' })
    await user.click(screen.getByRole('button', { name: /^自然保留/ }))
    await user.click(screen.getByRole('button', { name: '恢复自然保留设置' }))
    expect(link).toBeInTheDocument(); expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('试听开始位置（秒）'))
    expect(link).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('试听起点已改变')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vocal-1')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vocal-2')
  })

  it('preserves processing settings when replacing the source and describes bypass honestly', async () => {
    const renderer = vi.fn<VocalRenderer>().mockResolvedValue(output())
    mount(renderer)
    const user = await addFile()
    fireEvent.change(screen.getByRole('slider', { name: /次要声音抑制/ }), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('选择已分离的人声音频'), { target: { files: [wav('new.wav')] } })
    await waitFor(() => expect(screen.getByRole('button', { name: '净化整段并导出' })).toBeEnabled())
    expect(screen.getByRole('status')).toHaveTextContent('保留当前净化设置')
    expect(screen.getByRole('slider', { name: /次要声音抑制/ })).toHaveValue('0')
    await user.click(screen.getByRole('button', { name: '净化整段并导出' }))
    expect(await screen.findByRole('link', { name: '下载原声对照 WAV' })).toBeVisible()
    expect(screen.getByText('未启用（0%）')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('未进行净化')
  })

  it('restarts comparison at the clip start when either player is outside the preview range', async () => {
    mount(vi.fn<VocalRenderer>().mockResolvedValue(output(true)))
    const user = await addFile()
    await user.click(screen.getByRole('button', { name: '净化 20 秒试听' }))
    await screen.findByRole('link', { name: '下载净化试听片段' })
    const original = screen.getByLabelText('原人声试听') as HTMLAudioElement
    const clean = screen.getByLabelText('净化结果试听') as HTMLAudioElement
    for (const time of [20, 50, 70]) {
      original.currentTime = time
      await user.click(screen.getByRole('button', { name: '同位置听净化' }))
      expect(clean.currentTime).toBe(0)
    }
    clean.currentTime = 20
    await user.click(screen.getByRole('button', { name: '同位置听原声' }))
    expect(original.currentTime).toBe(30)
  })

  it('ignores interrupted or stale playback failures while still reporting real playback errors', async () => {
    mount(vi.fn<VocalRenderer>().mockResolvedValue(output()))
    const user = await addFile()
    await user.click(screen.getByRole('button', { name: '净化整段并导出' }))
    await screen.findByRole('link', { name: '下载净化人声 WAV' })
    let rejectOld!: (error: Error) => void
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject }))
    await user.click(screen.getByRole('button', { name: '同位置听净化' }))
    await user.click(screen.getByRole('button', { name: '同位置听原声' }))
    await act(async () => rejectOld(new Error('stale playback')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Interrupted', 'AbortError'))
    await user.click(screen.getByRole('button', { name: '同位置听净化' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Unsupported', 'NotSupportedError'))
    await user.click(screen.getByRole('button', { name: '同位置听净化' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('浏览器无法试听')
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => { throw new Error('Synchronous playback failure') })
    await user.click(screen.getByRole('button', { name: '同位置听原声' }))
    expect(screen.getByRole('alert')).toHaveTextContent('浏览器无法试听')
  })

  it('releases a partially-created result URL on allocation failure and can retry', async () => {
    mount(vi.fn<VocalRenderer>().mockResolvedValue(output()))
    const user = await addFile()
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => 'blob:partial').mockImplementationOnce(() => { throw new Error('Allocation failed') })
    await user.click(screen.getByRole('button', { name: '净化整段并导出' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Allocation failed')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:partial')
    expect(screen.queryByRole('link', { name: '下载净化人声 WAV' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '净化整段并导出' }))
    expect(await screen.findByRole('link', { name: '下载净化人声 WAV' })).toBeVisible()
  })
})
