import { useRef, type ReactNode, type UIEvent } from 'react'
import type { TextRange } from './types'
import styles from './HighlightedTextarea.module.css'

interface HighlightedTextareaProps {
  id: string
  value: string
  onChange: (value: string) => void
  ranges: TextRange[]
  tone: 'source' | 'result'
  labelledBy: string
  placeholder: string
}

function renderText(value: string, ranges: TextRange[], tone: 'source' | 'result'): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  ranges.forEach((range, index) => {
    if (range.start > cursor) nodes.push(value.slice(cursor, range.start))
    nodes.push(
      <mark className={tone === 'source' ? styles.sourceMark : styles.resultMark} key={index}>
        {value.slice(range.start, range.end)}
      </mark>,
    )
    cursor = range.end
  })
  nodes.push(value.slice(cursor))
  return nodes
}

export function HighlightedTextarea({
  id,
  value,
  onChange,
  ranges,
  tone,
  labelledBy,
  placeholder,
}: HighlightedTextareaProps) {
  const backdropRef = useRef<HTMLPreElement>(null)

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!backdropRef.current) return
    backdropRef.current.scrollTop = event.currentTarget.scrollTop
    backdropRef.current.scrollLeft = event.currentTarget.scrollLeft
  }

  return (
    <div className={styles.editor}>
      <pre ref={backdropRef} className={styles.backdrop} aria-hidden="true">
        {renderText(value, ranges, tone)}
        {'\n'}
      </pre>
      <textarea
        id={id}
        className={styles.textarea}
        value={value}
        aria-labelledby={labelledBy}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
      />
    </div>
  )
}
