import { analyzeSpectrum } from './spectrum'

const worker = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage: (data: unknown, transfer?: Transferable[]) => void }
worker.onmessage = event => {
  try {
    const { channels, sampleRate, fftSize } = event.data as { channels: Float32Array[]; sampleRate: number; fftSize: number }
    const result = analyzeSpectrum(channels, sampleRate, fftSize, percent => worker.postMessage({ type: 'progress', percent }))
    worker.postMessage({ type: 'result', result }, [result.values.buffer])
  } catch (error) { worker.postMessage({ type: 'error', message: error instanceof Error ? error.message : '频谱分析失败。' }) }
}
