import { AudioConversionError } from '../audio-conversion/types'
import type { AlignmentMatch, AlignmentProcessor, AlignmentWindow } from './alignment'

export class AlignmentClient implements AlignmentProcessor {
  private worker: Worker | null = null
  private reject: ((error: Error) => void) | null = null
  compare(window: AlignmentWindow): Promise<AlignmentMatch> {
    if (this.reject) return Promise.reject(new Error('Alignment is busy'))
    let worker: Worker
    try { worker = this.worker ?? new Worker(new URL('./alignment.worker.ts', import.meta.url), { type: 'module' }) } catch {
      return Promise.reject(new AudioConversionError('ALIGNMENT_FAILED', '浏览器无法启动自动匹配线程，请重试或使用手动相减。'))
    }
    this.worker = worker
    return new Promise((resolve, reject) => {
      this.reject = reject
      worker.onmessage = event => {
        this.reject = null
        if (event.data.error) reject(new AudioConversionError('ALIGNMENT_FAILED', event.data.error))
        else resolve(event.data.result)
      }
      worker.onerror = () => { this.reject = null; worker.terminate(); this.worker = null; reject(new AudioConversionError('ALIGNMENT_FAILED', '自动匹配线程异常，请重试或使用手动相减。')) }
      try { worker.postMessage(window, [window.a.buffer, window.b.buffer]) } catch {
        this.reject = null; this.dispose()
        reject(new AudioConversionError('ALIGNMENT_FAILED', '无法传递分析片段，请重试或使用手动相减。'))
      }
    })
  }
  dispose() {
    if (this.worker) { this.worker.onmessage = null; this.worker.onerror = null; this.worker.terminate() }
    this.worker = null
    this.reject?.(new Error('Cancelled')); this.reject = null
  }
}
