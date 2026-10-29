import { useEffect, useRef, useState } from 'react'
import { MAX_SPECTRAL_REGIONS, type SpectralEditResult, type SpectralRegion, type SpectralRenderer } from './types'

export const defaultSpectralRenderer: SpectralRenderer = async (...args) => (await import('./runtime')).renderSpectralEdits(...args)
interface RegionHistory { past: SpectralRegion[][]; present: SpectralRegion[]; future: SpectralRegion[][] }

export function useSpectralEdits(renderer: SpectralRenderer, stopPlayback: () => void) {
  const [history, setHistory] = useState<RegionHistory>({ past: [], present: [], future: [] })
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<(SpectralEditResult & { url: string }) | null>(null)
  const [processed, setProcessed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [notice, setNotice] = useState('框选时间与频率范围，或用数值添加去除区域。')
  const [error, setError] = useState('')
  const resources = useRef({ controller: null as AbortController | null, url: null as string | null })
  useEffect(() => {
    const current = resources.current
    return () => { current.controller?.abort(); if (current.url) URL.revokeObjectURL(current.url) }
  }, [])
  function invalidate() {
    stopPlayback()
    if (resources.current.url) URL.revokeObjectURL(resources.current.url)
    resources.current.url = null; setResult(null); setProcessed(false); setError('')
    setNotice('去除区域已更新，请重新生成处理结果。')
  }
  function change(next: SpectralRegion[]) {
    if (resources.current.controller) return
    invalidate()
    setHistory(previous => ({ past: [...previous.past.slice(-59), previous.present], present: next, future: [] }))
  }
  function commit(region: SpectralRegion) {
    if (resources.current.controller) return
    if (history.present.length >= MAX_SPECTRAL_REGIONS && !history.present.some(item => item.id === region.id)) { setError(`最多 ${MAX_SPECTRAL_REGIONS} 个区域。`); return }
    change(history.present.some(item => item.id === region.id) ? history.present.map(item => item.id === region.id ? region : item) : [...history.present, region])
    setSelected(region.id)
  }
  function remove(id = selected) { if (id) { change(history.present.filter(item => item.id !== id)); setSelected(null) } }
  function undo() {
    if (resources.current.controller || !history.past.length) return
    invalidate(); setSelected(null)
    setHistory(previous => ({ past: previous.past.slice(0, -1), present: previous.past[previous.past.length - 1], future: [previous.present, ...previous.future] }))
  }
  function redo() {
    if (resources.current.controller || !history.future.length) return
    invalidate(); setSelected(null)
    setHistory(previous => ({ past: [...previous.past, previous.present], present: previous.future[0], future: previous.future.slice(1) }))
  }
  function reset() {
    resources.current.controller?.abort(); resources.current.controller = null
    invalidate(); setHistory({ past: [], present: [], future: [] }); setSelected(null); setBusy(false); setProgress(null)
    setNotice('框选时间与频率范围，或用数值添加去除区域。')
  }
  function cancel() {
    resources.current.controller?.abort(); resources.current.controller = null; setBusy(false); setProgress(null)
    setNotice('已停止频谱处理，原音频和去除区域已保留。')
  }
  async function run(file: File, fftSize: number) {
    if (resources.current.controller || !history.present.length) return
    invalidate(); setBusy(true); setProgress(null)
    const controller = new AbortController(); resources.current.controller = controller
    try {
      const output = await renderer(file, history.present, fftSize, controller.signal, (message, percent) => {
        if (!controller.signal.aborted) { setNotice(message); setProgress(percent ?? null) }
      })
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(output.blob); resources.current.url = url
      setResult({ ...output, url }); setProcessed(true); setNotice('频谱去除完成，已显示处理后频谱；可切换原音频对照试听。')
    } catch (failure) {
      if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : '频谱处理失败。'); setNotice('处理未完成，原音频未改变。') }
    } finally { if (resources.current.controller === controller) { resources.current.controller = null; setBusy(false); setProgress(null) } }
  }
  return { regions: history.present, selected, setSelected, result, processed, setProcessed, busy, notice, error, progress,
    canUndo: !!history.past.length, canRedo: !!history.future.length, commit, remove, undo, redo, change, reset, invalidate, run, cancel }
}
