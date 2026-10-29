import { cleanVocalWave } from './output'
import type { VocalOptions } from './types'

self.onmessage = (event: MessageEvent<{ samples: Float32Array; sampleRate: number; channels: number; options: VocalOptions }>) => {
  try {
    const { samples, sampleRate, channels, options } = event.data
    const result = cleanVocalWave(samples, sampleRate, channels, options, percent => self.postMessage({ type: 'progress', percent }))
    self.postMessage({ type: 'result', ...result }, { transfer: [result.clean.buffer, result.removed.buffer] })
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '主唱净化失败。' }) }
}
