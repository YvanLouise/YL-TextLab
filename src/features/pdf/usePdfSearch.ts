import { useEffect, useRef, useState } from 'react'
import { searchPdfText } from './text'
import type { PdfTextMatch, PdfTextReader } from './text'

const EMPTY_MATCHES: PdfTextMatch[] = []
export function usePdfSearch(read: PdfTextReader, pageCount: number, enabled: boolean, onFirstPage: (page: number) => void) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [selected, setSelected] = useState(0)
  const [state, setState] = useState({ key: '', matches: EMPTY_MATCHES, busy: false, progress: 0, message: '' })
  const controller = useRef<AbortController | null>(null)
  const key = `${query.trim()}\0${caseSensitive}`
  useEffect(() => {
    if (!query.trim() || !enabled) return
    const abort = new AbortController()
    controller.current = abort
    const timer = setTimeout(() => {
      if (abort.signal.aborted) return
      setSelected(0)
      setState({ key, matches: [], busy: true, progress: 0, message: '' })
      void searchPdfText(read, pageCount, query, caseSensitive, abort.signal, (page) => {
        if (!abort.signal.aborted && (page % 5 === 0 || page === pageCount)) setState((previous) => ({ ...previous, progress: page }))
      }).then((result) => {
        if (abort.signal.aborted) return
        const notes = [result.limited ? '已达到 1,000 条结果上限，请缩小查找范围。' : '', result.failedPages ? `${result.failedPages} 页无法提取文字，结果可能不完整。` : '', !result.textPages && !result.failedPages ? '未发现可提取文字，扫描件需先进行 OCR。' : ''].filter(Boolean)
        setState({ key, matches: result.matches, busy: false, progress: pageCount, message: notes.join(' ') })
        if (result.matches[0]) onFirstPage(result.matches[0].page)
      }).catch((error) => {
        if (!abort.signal.aborted) setState({ key, matches: [], busy: false, progress: 0, message: error instanceof RangeError ? '内存不足，请缩小文档后重试。' : '搜索失败，请重试或更换文件。' })
      })
    }, 250)
    return () => { clearTimeout(timer); abort.abort() }
  }, [read, pageCount, query, caseSensitive, key, enabled, onFirstPage])
  const valid = enabled && !!query.trim() && state.key === key
  const matches = valid ? state.matches : EMPTY_MATCHES
  const selectedIndex = Math.min(selected, Math.max(0, matches.length - 1))
  return {
    query, setQuery, caseSensitive, setCaseSensitive, matches, selectedIndex, setSelected,
    busy: enabled && !!query.trim() && (!valid || state.busy), progress: valid ? state.progress : 0, message: valid ? state.message : '',
    cancel: () => { controller.current?.abort(); setState((previous) => ({ ...previous, key, busy: false, matches: valid ? previous.matches : [], message: '搜索已停止。修改关键词可重新搜索。' })) },
  }
}
