import { optimizeLossless } from './lossless'
import type { LosslessFormat } from './lossless-info'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ bytes: Uint8Array; format: LosslessFormat }>) => void) | null
  postMessage: (data: unknown, transfer?: Transferable[]) => void
}
scope.onmessage = async ({ data }) => {
  try {
    const bytes = await optimizeLossless(data.bytes, data.format, undefined,
      (stage) => scope.postMessage({ stage }))
    scope.postMessage({ bytes }, [bytes.buffer as ArrayBuffer])
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : '无损优化失败。',
      code: error && typeof error === 'object' && 'code' in error ? error.code : 'ENCODE_FAILED' })
  }
}
