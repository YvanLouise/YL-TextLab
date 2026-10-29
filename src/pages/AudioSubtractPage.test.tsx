import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeProvider'
import type { AudioSubtractEngine, AudioSubtractResult } from '../features/audio-subtraction/types'
import { AudioConversionError } from '../features/audio-conversion/types'
import { AudioSubtractPage } from './AudioSubtractPage'

function wav(name: string) {
  return new File(['RIFF----WAVEdata'], name, { type: 'audio/wav' })
}
function output(): AudioSubtractResult {
  const levels = (value: number) => ({ peak: value, rms: value, points: [{ peak: value, rms: value }, { peak: value, rms: value }] })
  return { blob: new Blob(['result'], { type: 'audio/wav' }), fileName: 'result.wav', sampleRate: 48000,
    channels: 2, sampleFrames: 48000, duration: 1, elapsedMs: 10, peak: .2, outputGain: 1, offsetSamples: 0, warnings: [],
    levels: { sampleRate: 48000, sampleFrames: 48000, framesPerPoint: 24000,
      a: levels(.8), b: levels(.6), beforeProtection: levels(.2), c: levels(.2) } }
}
function alignedOutput(): AudioSubtractResult {
  return { ...output(), offsetSamples: -60, alignment: { offsetSamples: -60, gainB: .8, appliedGainB: .4, invertB: true,
    correlation: .92, confidence: 'high', matchedWindows: 3, analyzedWindows: 3, warnings: [] } }
}
function engine(overrides: Partial<AudioSubtractEngine> = {}): AudioSubtractEngine {
  return { load: vi.fn().mockResolvedValue(undefined), subtract: vi.fn().mockResolvedValue(output()),
    cancel: vi.fn(), dispose: vi.fn(), ...overrides }
}
function mount(instance: AudioSubtractEngine) {
  return render(<BrowserRouter><ThemeProvider><AudioSubtractPage engineFactory={async () => instance} /></ThemeProvider></BrowserRouter>)
}
async function addBoth() {
  const user = userEvent.setup()
  await user.upload(screen.getByLabelText('选择音频 A 文件'), wav('A.wav'))
  await user.upload(screen.getByLabelText('选择音频 B 文件'), wav('B.wav'))
  await waitFor(() => expect(screen.getByRole('button', { name: '生成音频 C' })).toBeEnabled())
  return user
}
beforeEach(() => {
  let index = 0
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:subtract-${index++}`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('audio subtraction page', () => {
  it('warns about byte-identical renamed files without blocking and clears the notice on replacement', async () => {
    const processor = engine()
    mount(processor)
    const user = await addBoth()
    expect(await screen.findByText(/A、B 的文件内容完全相同/)).toBeVisible()
    expect(screen.getByRole('button', { name: '生成音频 C' })).toBeEnabled()
    await user.upload(screen.getByLabelText('选择音频 B 文件'), new File(['RIFF----WAVEelse'], 'A.wav', { type: 'audio/wav' }))
    await waitFor(() => expect(screen.queryByText(/A、B 的文件内容完全相同/)).not.toBeInTheDocument())
    await user.upload(screen.getByLabelText('选择音频 B 文件'), wav('renamed.wav'))
    expect(await screen.findByText(/A、B 的文件内容完全相同/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: '移除音频 A' }))
    expect(screen.queryByText(/A、B 的文件内容完全相同/)).not.toBeInTheDocument()
    expect(screen.queryByText(/正在本机核对/)).not.toBeInTheDocument()
  })

  it('exports a direct WAV download and invalidates it when controls or sources change', async () => {
    const processor = engine()
    const view = mount(processor)
    expect(processor.load).not.toHaveBeenCalled()
    const user = await addBoth()
    await user.clear(screen.getByLabelText('B 的音量比例', { exact: false }))
    await user.type(screen.getByLabelText('B 的音量比例', { exact: false }), '80')
    await user.clear(screen.getByLabelText('B 的时间偏移'))
    await user.type(screen.getByLabelText('B 的时间偏移'), '-1.25')
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    expect(await screen.findByRole('link', { name: '下载音频 C' })).toHaveAttribute('download', 'result.wav')
    expect(screen.getByRole('region', { name: '全段音量对照' })).toBeVisible()
    expect(processor.subtract).toHaveBeenCalledWith(expect.objectContaining({ options: { gainB: .8, offsetMs: -1.25, preventClipping: true } }), expect.any(Function))
    const url = screen.getByRole('link', { name: '下载音频 C' }).getAttribute('href')
    await user.click(screen.getByLabelText('输出防削波'))
    expect(screen.queryByRole('link', { name: '下载音频 C' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '全段音量对照' })).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
    expect(screen.getByText('A.wav')).toBeVisible()
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:subtract-0')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:subtract-1')
    expect(processor.dispose).toHaveBeenCalled()
  })

  it('switches to protected matching without global attenuation and explains preserved regions', async () => {
    const result = { ...output(), protection: { matchedWindows: 1, totalWindows: 2, matchedSeconds: .5, preservedSeconds: .5, windowSeconds: .5 } }
    const processor = engine({ subtract: vi.fn().mockResolvedValue(result) })
    mount(processor)
    const user = await addBoth()
    await user.selectOptions(screen.getByLabelText('处理模式'), 'protected')
    expect(screen.getByLabelText('输出防削波')).toBeDisabled()
    expect(screen.getByLabelText('输出防削波')).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    expect(await screen.findByRole('region', { name: '保护模式结果' })).toHaveTextContent('未匹配位置保留 A')
    expect(processor.subtract).toHaveBeenCalledWith(expect.objectContaining({ options: {
      gainB: 1, offsetMs: 0, preventClipping: false, protectUnmatched: true,
    } }), expect.any(Function))
    await user.selectOptions(screen.getByLabelText('处理模式'), 'strict')
    expect(screen.queryByRole('region', { name: '全段音量对照' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('输出防削波')).toBeEnabled()
    expect(screen.getByLabelText('输出防削波')).toBeChecked()
  })

  it('compares levels on one scale, distinguishes attenuation and supports position inspection and seeking', async () => {
    const result = output()
    result.outputGain = .5
    result.levels!.b.points[1] = { peak: 0, rms: 0 }
    result.levels!.a.points[0] = { peak: 0, rms: 0 }
    mount(engine({ subtract: vi.fn().mockResolvedValue(result) }))
    const user = await addBoth()
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    await screen.findByRole('region', { name: '全段音量对照' })
    expect(screen.getByText(/防削波使整段降低/)).toHaveTextContent('6.02 dB')
    expect(screen.getByRole('img', { name: /C · 防削波前全段RMS/ })).toBeVisible()
    expect(screen.getByText(/A 静音、B 有声/)).toBeVisible()
    const position = screen.getByRole('slider', { name: '音量对照位置' })
    fireEvent.change(position, { target: { value: '1' } })
    expect(position).toHaveValue('1')
    expect(screen.getByText(/变化来自防削波的整体降音量/)).toBeVisible()
    await user.selectOptions(screen.getByLabelText('音量显示指标'), 'peak')
    expect(screen.getByRole('img', { name: /A · 相减前全段峰值/ })).toBeVisible()
    for (const label of ['音频 A 试听', '音频 C 试听']) Object.defineProperty(screen.getByLabelText(label), 'duration', { configurable: true, value: 1 })
    await user.click(screen.getByRole('button', { name: '将 A / C 试听定位到此处' }))
    expect((screen.getByLabelText('音频 A 试听') as HTMLAudioElement).currentTime).toBe(.5)
    expect((screen.getByLabelText('音频 C 试听') as HTMLAudioElement).currentTime).toBe(.5)
  })

  it('cancels initial engine loading and ignores its late completion', async () => {
    let finish = () => {}
    const processor = engine({ load: vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve })).mockResolvedValue(undefined) })
    mount(processor)
    const user = await addBoth()
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    await user.click(await screen.findByRole('button', { name: '停止处理' }))
    await act(async () => finish())
    expect(processor.dispose).toHaveBeenCalled()
    expect(processor.subtract).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('处理已停止')
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    expect(await screen.findByRole('link', { name: '下载音频 C' })).toBeVisible()
  })

  it('supports drops and swaps and clears source URLs without saving files', async () => {
    const processor = engine()
    mount(processor)
    const user = userEvent.setup()
    fireEvent.drop(screen.getByRole('region', { name: '音频 A' }), { dataTransfer: { files: [wav('A.wav')] } })
    fireEvent.drop(screen.getByRole('region', { name: '音频 B' }), { dataTransfer: { files: [wav('B.wav')] } })
    await waitFor(() => expect(screen.getByRole('button', { name: '生成音频 C' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '交换 A / B' }))
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    await screen.findByRole('link', { name: '下载音频 C' })
    expect(vi.mocked(processor.subtract).mock.calls[0][0].a.file.name).toBe('B.wav')
    expect(vi.mocked(processor.subtract).mock.calls[0][0].b.file.name).toBe('A.wav')
    await user.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByRole('button', { name: '生成音频 C' })).toBeDisabled()
    expect(screen.queryByText('A.wav')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '下载音频 C' })).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)
  })

  it('validates settings and reports processing errors without a false success', async () => {
    const processor = engine({ subtract: vi.fn().mockRejectedValue(new Error('声道数不一致')) })
    mount(processor)
    const user = await addBoth()
    await user.clear(screen.getByLabelText('B 的时间偏移'))
    expect(screen.getByLabelText('B 的时间偏移')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: '生成音频 C' })).toBeDisabled()
    await user.type(screen.getByLabelText('B 的时间偏移'), '0')
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.queryByRole('link', { name: '下载音频 C' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生成音频 C' })).toBeEnabled()
  })

  it('configures automatic matching, explains the result and transfers exact parameters to manual mode', async () => {
    const processor = engine({ subtract: vi.fn().mockResolvedValue(alignedOutput()) })
    mount(processor)
    const user = await addBoth()
    await user.clear(screen.getByLabelText('B 的音量比例', { exact: false }))
    await user.click(screen.getByLabelText('自动匹配相似波形'))
    expect(screen.queryByLabelText('B 的音量比例', { exact: false })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('搜索范围'), '1000')
    fireEvent.change(screen.getByLabelText('消减强度', { exact: false }), { target: { value: '50' } })
    await user.clear(screen.getByLabelText('时间搜索中心'))
    await user.type(screen.getByLabelText('时间搜索中心'), '-100')
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    expect(await screen.findByRole('region', { name: '自动匹配结果' })).toBeVisible()
    expect(screen.getByText('-1.250 ms')).toBeVisible()
    expect(screen.getByText('80.0% / 40.0%')).toBeVisible()
    expect(screen.getByText(/相关系数不是消除成功率/)).toBeVisible()
    expect(processor.subtract).toHaveBeenCalledWith(expect.objectContaining({ options: {
      gainB: 1, offsetMs: -100, preventClipping: true, autoAlign: true, searchRadiusMs: 1000, reductionStrength: .5,
    } }), expect.any(Function))
    const url = screen.getByRole('link', { name: '下载音频 C' }).getAttribute('href')
    await user.click(screen.getByRole('button', { name: '转为手动微调' }))
    expect(screen.getByLabelText('自动匹配相似波形')).not.toBeChecked()
    expect(screen.getByLabelText('B 的时间偏移')).toHaveValue(-1.25)
    expect(screen.getByLabelText('B 的音量比例', { exact: false })).toHaveValue(40)
    expect(screen.getByLabelText('反转 B 的极性')).toBeChecked()
    expect(screen.queryByRole('region', { name: '自动匹配结果' })).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    await screen.findByRole('link', { name: '下载音频 C' })
    expect(processor.subtract).toHaveBeenLastCalledWith(expect.objectContaining({ options: {
      gainB: .4, offsetMs: -1.25, preventClipping: true, invertB: true,
    } }), expect.any(Function))
    await user.click(screen.getByRole('button', { name: '恢复默认设置' }))
    expect(screen.getByLabelText('反转 B 的极性')).not.toBeChecked()
    expect(screen.getByLabelText('B 的音量比例', { exact: false })).toHaveValue(100)
  })

  it('invalidates automatic statistics when radius, strength or mode changes', async () => {
    mount(engine({ subtract: vi.fn().mockResolvedValue(alignedOutput()) }))
    const user = await addBoth()
    await user.click(screen.getByLabelText('自动匹配相似波形'))
    for (const change of [
      () => user.selectOptions(screen.getByLabelText('搜索范围'), '250'),
      () => fireEvent.change(screen.getByLabelText('消减强度', { exact: false }), { target: { value: '75' } }),
      () => user.click(screen.getByLabelText('自动匹配相似波形')),
    ]) {
      await user.click(screen.getByRole('button', { name: '生成音频 C' }))
      await screen.findByRole('link', { name: '下载音频 C' })
      await change()
      expect(screen.queryByRole('region', { name: '自动匹配结果' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: '下载音频 C' })).not.toBeInTheDocument()
      expect(screen.getByText('A.wav')).toBeVisible()
    }
  })

  it('cancels active matching and ignores late progress and results', async () => {
    let finish!: (result: AudioSubtractResult) => void
    let lateProgress = () => {}
    const processor = engine({ subtract: vi.fn().mockImplementation((_request, progress) => {
      progress({ stage: 'matching', percent: 25 })
      lateProgress = () => progress({ stage: 'matching', percent: 70 })
      return new Promise<AudioSubtractResult>(resolve => { finish = resolve })
    }) })
    mount(processor)
    const user = await addBoth()
    await user.click(screen.getByLabelText('自动匹配相似波形'))
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    expect(await screen.findByRole('status')).toHaveTextContent('正在匹配相似波形')
    expect(screen.getByLabelText('搜索范围')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '停止处理' }))
    await act(async () => { lateProgress(); finish(alignedOutput()) })
    expect(processor.dispose).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('处理已停止')
    expect(screen.queryByRole('region', { name: '自动匹配结果' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '下载音频 C' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生成音频 C' })).toBeEnabled()
  })

  it('leaves sources intact on an uncertain match and allows manual retry', async () => {
    const processor = engine({ subtract: vi.fn().mockRejectedValueOnce(new AudioConversionError('ALIGNMENT_UNCERTAIN', '匹配不可靠，未自动消减。')).mockResolvedValue(output()) })
    mount(processor)
    const user = await addBoth()
    await user.click(screen.getByLabelText('自动匹配相似波形'))
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('匹配不可靠，未自动消减')
    expect(screen.queryByRole('link', { name: '下载音频 C' })).not.toBeInTheDocument()
    expect(screen.getByText('A.wav')).toBeVisible()
    await user.click(screen.getByLabelText('自动匹配相似波形'))
    await user.click(screen.getByRole('button', { name: '生成音频 C' }))
    expect(await screen.findByRole('link', { name: '下载音频 C' })).toBeVisible()
  })
})
