import { correlateWindow, type AlignmentWindow } from './alignment'

const worker = self as unknown as { onmessage: ((event: MessageEvent<AlignmentWindow>) => void) | null; postMessage(data: unknown): void }
worker.onmessage = event => {
  try { worker.postMessage({ result: correlateWindow(event.data) }) }
  catch (error) { worker.postMessage({ error: error instanceof Error ? error.message : '自动匹配失败。' }) }
}
