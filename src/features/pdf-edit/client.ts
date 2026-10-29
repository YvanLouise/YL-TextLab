import type { EditPage, PdfEdit } from './model'
import type { EditRequest } from './worker'

export interface PdfEditClient {
  request(edits: PdfEdit[], page: number, save?: boolean, bytes?: Uint8Array): Promise<EditPage | Uint8Array>
  close(): void
}
export function createPdfEditClient(): PdfEditClient {
  if (typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') throw new Error('当前浏览器不支持本地 PDF 编辑引擎，请使用新版浏览器。')
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  let sequence = 0, closed = false
  const jobs = new Map<number, { resolve: (value: EditPage | Uint8Array) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  const fail = (message: string) => {
    closed = true; worker.terminate()
    for (const job of jobs.values()) { clearTimeout(job.timer); job.reject(new Error(message)) }
    jobs.clear()
  }
  worker.onmessage = ({ data }) => {
    const job = jobs.get(data.id)
    if (!job) return
    clearTimeout(job.timer); jobs.delete(data.id)
    if (data.error) job.reject(new Error(data.error))
    else job.resolve(data.result)
  }
  worker.onerror = () => fail('编辑引擎运行失败或内存不足，请退出编辑后重新打开。')
  return {
    request(edits, page, save = false, bytes) {
      if (closed) return Promise.reject(new Error('编辑引擎已关闭，请退出编辑后重新打开。'))
      const id = ++sequence
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => fail('编辑处理超时，已停止引擎；原文件不受影响。'), 90_000)
        jobs.set(id, { resolve, reject, timer })
        const request: EditRequest = { id, edits, page, save, bytes }
        try { worker.postMessage(request, bytes ? [bytes.buffer] : []) }
        catch { clearTimeout(timer); jobs.delete(id); reject(new Error('无法将文件交给本地编辑线程，浏览器可能内存不足。')) }
      })
    },
    close() { fail('编辑已取消。') },
  }
}
