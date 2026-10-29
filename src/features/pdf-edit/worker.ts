import { init } from '@embedpdf/pdfium'
import wasmUrl from '@embedpdf/pdfium/pdfium.wasm?url'
import { PdfContentEngine } from './engine'
import type { PdfEdit } from './model'

export type EditRequest = { id: number; bytes?: Uint8Array; edits: PdfEdit[]; page: number; save?: boolean }
let engine: Promise<PdfContentEngine> | undefined
let font: Promise<Uint8Array> | undefined
const fetchBytes = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('本地编辑资源加载失败，请刷新后重试。')
  return new Uint8Array(await response.arrayBuffer())
}
function getEngine() {
  return engine ??= fetchBytes(wasmUrl).then(async (wasmBinary) => {
    const options = { wasmBinary: new Uint8Array(wasmBinary).buffer, thisProgram: 'pdf-editor' }
    const module = await init(options)
    module.PDFiumExt_Init()
    return new PdfContentEngine(module, () => font ??= fetchBytes(`${import.meta.env.BASE_URL}pdf-editor/NotoSansSC-Regular.ttf`).catch((error) => { font = undefined; throw error }))
  }).catch((error) => { engine = undefined; throw error })
}
// Serial requests are essential: PDFium is not thread-safe, including across awaits.
let pending = Promise.resolve()
self.onmessage = ({ data }: MessageEvent<EditRequest>) => {
  pending = pending.then(async () => {
    try {
      const active = await getEngine()
      if (data.bytes) active.open(data.bytes)
      const result = await active.run(data.edits, data.page, data.save)
      self.postMessage({ id: data.id, result }, { transfer: [result instanceof Uint8Array ? result.buffer : result.pixels.buffer] })
    } catch (error) {
      const message = error instanceof WebAssembly.RuntimeError || error instanceof RangeError ? '编辑引擎遇到内存或文档解析错误，请退出编辑后重新打开。' : error instanceof Error ? error.message : 'PDF 编辑失败，请重新打开文件。'
      self.postMessage({ id: data.id, error: message })
    }
  })
}
