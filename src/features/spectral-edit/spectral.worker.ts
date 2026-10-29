/// <reference lib="webworker" />
import { encodeSpectralWave, removeSpectralRegions } from './process'
import type { SpectralRegion } from './types'

self.onmessage = (event: MessageEvent<{ samples: Float32Array; sampleRate: number; channels: number; regions: SpectralRegion[] }>) => {
  try {
    const { samples, sampleRate, channels, regions } = event.data
    const result = removeSpectralRegions(samples, sampleRate, channels, regions, percent => self.postMessage({ type: 'progress', percent }))
    const bytes = encodeSpectralWave(result.samples, sampleRate, channels)
    self.postMessage({ type: 'result', bytes, peak: result.peak, fftSize: result.fftSize }, [bytes.buffer])
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '频谱处理失败。' }) }
}
