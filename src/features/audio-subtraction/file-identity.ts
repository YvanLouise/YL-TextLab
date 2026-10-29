export const AUDIO_IDENTITY_CHUNK_BYTES = 1024 * 1024

export async function areAudioFilesIdentical(a: Blob, b: Blob, signal?: AbortSignal): Promise<boolean> {
  const check = () => { if (signal?.aborted) throw new DOMException('Comparison cancelled', 'AbortError') }
  check()
  if (a.size !== b.size) return false
  if (a === b) return true
  for (let start = 0; start < a.size; start += AUDIO_IDENTITY_CHUNK_BYTES) {
    check()
    const end = Math.min(a.size, start + AUDIO_IDENTITY_CHUNK_BYTES)
    const [left, right] = await Promise.all([a.slice(start, end).arrayBuffer(), b.slice(start, end).arrayBuffer()])
    check()
    if (left.byteLength !== end - start || right.byteLength !== end - start) throw new Error('Incomplete file comparison')
    const words = Math.floor(left.byteLength / 4)
    const x = new Uint32Array(left, 0, words), y = new Uint32Array(right, 0, words)
    for (let i = 0; i < words; i++) if (x[i] !== y[i]) return false
    const tailA = new Uint8Array(left, words * 4), tailB = new Uint8Array(right, words * 4)
    for (let i = 0; i < tailA.length; i++) if (tailA[i] !== tailB[i]) return false
  }
  return true
}
