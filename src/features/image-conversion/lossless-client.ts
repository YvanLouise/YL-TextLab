import { ImageConversionError } from './types'
import type { LosslessFormat } from './lossless-info'

export function optimizeLosslessInWorker(bytes: Uint8Array, format: LosslessFormat,
  signal?: AbortSignal, onStage?: (stage: string) => void) {
  return new Promise<Uint8Array>((resolve, reject) => {
    if (signal?.aborted) { reject(new ImageConversionError('CANCELLED', '已停止压缩。')); return }
    let worker: Worker
    try { worker = new Worker(new URL('./lossless.worker.ts', import.meta.url), { type: 'module' }) } catch {
      reject(new ImageConversionError('WORKER_UNAVAILABLE', '当前浏览器无法启动本地无损引擎，请使用支持 Worker 的浏览器。'))
      return
    }
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(new ImageConversionError('CANCELLED', '已停止压缩。')) }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }: MessageEvent<{ bytes?: Uint8Array; stage?: string; error?: string; code?: string }>) => {
      if (data.stage) { onStage?.(data.stage); return }
      cleanup()
      if (data.bytes) resolve(data.bytes)
      else reject(new ImageConversionError(data.code ?? 'ENCODE_FAILED', data.error ?? '无损优化失败。'))
    }
    worker.onerror = (event) => {
      event.preventDefault()
      cleanup()
      reject(new ImageConversionError('WORKER_FAILED', '本地无损引擎异常或内存不足，请减少本批文件后重试。'))
    }
    try { worker.postMessage({ bytes, format }, [bytes.buffer]) } catch {
      cleanup()
      reject(new ImageConversionError('WORKER_FAILED', '无法向本地引擎传递图片数据。'))
    }
  })
}
