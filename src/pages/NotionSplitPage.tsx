import {
  Check,
  CheckCircle2,
  ClipboardCopy,
  Copy,
  Files,
  LockKeyhole,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ToolHeader } from '../components/SiteHeader'
import { copyPlainText } from '../features/clipboard'
import { countVisibleCharacters } from '../features/replacement/engine'
import { splitForNotion, utf8ByteLength } from '../features/notion-splitting/engine'
import {
  clearNotionSplitDraft,
  loadNotionSplitDraft,
  saveNotionSplitDraft,
} from '../features/notion-splitting/storage'
import type { NotionSplitResult } from '../features/notion-splitting/types'
import styles from './NotionSplitPage.module.css'

const DEFAULT_MAX_KILOBYTES = 400
const MIN_MAX_KILOBYTES = 100
const MAX_MAX_KILOBYTES = 450
const EMPTY_RESULT: NotionSplitResult = {
  chunks: [],
  totalByteLength: 0,
  totalCharacterCount: 0,
  maxChunkByteLength: 0,
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 KB'
  if (bytes < 1000) return `${bytes} B`
  return `${(bytes / 1000).toFixed(1)} KB`
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay)
    return () => window.clearTimeout(timeout)
  }, [delay, value])

  return debouncedValue
}

export function NotionSplitPage() {
  const [source, setSource] = useState('')
  const [maxKilobytesInput, setMaxKilobytesInput] = useState(String(DEFAULT_MAX_KILOBYTES))
  const [preferSemanticBoundaries, setPreferSemanticBoundaries] = useState(true)
  const [copiedChunks, setCopiedChunks] = useState<Set<number>>(() => new Set())
  const [notice, setNotice] = useState('粘贴文本后将自动切分')
  const [hydrated, setHydrated] = useState(false)
  const [storageWarning, setStorageWarning] = useState(false)

  const parsedMaxKilobytes = Number(maxKilobytesInput)
  const maxKilobytesValid = /^\d+$/.test(maxKilobytesInput)
    && Number.isInteger(parsedMaxKilobytes)
    && parsedMaxKilobytes >= MIN_MAX_KILOBYTES
    && parsedMaxKilobytes <= MAX_MAX_KILOBYTES
  const maxBytes = maxKilobytesValid ? parsedMaxKilobytes * 1000 : 0
  const debouncedSource = useDebouncedValue(source, 150)

  const result = useMemo(
    () => maxKilobytesValid && debouncedSource
      ? splitForNotion(debouncedSource, { maxBytes, preferSemanticBoundaries })
      : EMPTY_RESULT,
    [debouncedSource, maxBytes, maxKilobytesValid, preferSemanticBoundaries],
  )
  const liveCharacterCount = useMemo(() => countVisibleCharacters(source), [source])
  const liveByteLength = useMemo(() => utf8ByteLength(source), [source])
  const processing = source !== debouncedSource && maxKilobytesValid
  const copiedCount = result.chunks.reduce(
    (count, chunk) => count + (copiedChunks.has(chunk.index) ? 1 : 0),
    0,
  )
  const nextChunk = result.chunks.find((chunk) => !copiedChunks.has(chunk.index))

  useEffect(() => {
    let cancelled = false
    loadNotionSplitDraft().then((draft) => {
      if (cancelled) return
      if (draft) {
        setSource(draft.source)
        setMaxKilobytesInput(String(draft.options.maxBytes / 1000))
        setPreferSemanticBoundaries(draft.options.preferSemanticBoundaries)
        setNotice('已恢复本机草稿并重新切分')
      }
      setHydrated(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!hydrated || !maxKilobytesValid) return
    const timeout = window.setTimeout(() => {
      saveNotionSplitDraft({
        version: 1,
        source,
        options: { maxBytes, preferSemanticBoundaries },
      }).then((saved) => setStorageWarning(!saved))
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [hydrated, maxBytes, maxKilobytesValid, preferSemanticBoundaries, source])

  const copyChunk = async (chunkIndex: number) => {
    const chunk = result.chunks.find((item) => item.index === chunkIndex)
    if (!chunk) return
    try {
      await copyPlainText(chunk.text)
      setCopiedChunks((current) => new Set(current).add(chunkIndex))
      setNotice(`第 ${chunk.index + 1} 段已复制，可粘贴到 Notion`)
    } catch {
      setNotice(`第 ${chunk.index + 1} 段复制失败，请手动选择文本复制`)
    }
  }

  const clearAll = async () => {
    setSource('')
    setMaxKilobytesInput(String(DEFAULT_MAX_KILOBYTES))
    setPreferSemanticBoundaries(true)
    setCopiedChunks(new Set())
    setNotice('文本、切分结果和本机草稿已清空')
    setStorageWarning(false)
    await clearNotionSplitDraft()
  }

  const statusText = !maxKilobytesValid
    ? `每段上限必须是 ${MIN_MAX_KILOBYTES}–${MAX_MAX_KILOBYTES} 之间的整数`
    : processing
      ? '正在重新计算安全片段…'
      : result.chunks.length
        ? preferSemanticBoundaries ? '已按段落边界安全切分' : '已按 UTF-8 大小安全切分'
        : '粘贴文本后将自动安全切分'

  return (
    <div className={styles.page}>
      <ToolHeader toolName="Notion 文本切分工具" showMobileTheme wide />
      <main className={`page-shell ${styles.workspace}`}>
        <header className={styles.intro}>
          <h1>Notion 文本切分</h1>
          <div className={styles.introMeta}>
            <p>把超长文本安全切成可逐段粘贴到 Notion 的片段。</p>
            <span><CheckCircle2 aria-hidden="true" /> 全程本地处理</span>
          </div>
        </header>

        <div className={styles.workbench}>
          <section className={`${styles.panel} ${styles.sourcePanel}`} aria-labelledby="notion-source-title">
            <header className={styles.panelHeader}>
              <h2 id="notion-source-title">原始文本</h2>
              <span>{liveCharacterCount.toLocaleString('zh-CN')} 字符 · {formatBytes(liveByteLength)}</span>
            </header>
            <textarea
              className={styles.sourceTextarea}
              aria-label="原始文本"
              value={source}
              placeholder="在此粘贴需要分段复制到 Notion 的长文本…"
              spellCheck={false}
              onChange={(event) => {
                setSource(event.target.value)
                setCopiedChunks(new Set())
              }}
            />
            <div className={styles.sourceSettings}>
              <div className={styles.limitSetting}>
                <label htmlFor="notion-max-kb">每段安全上限</label>
                <div className={styles.limitRow}>
                  <span className={styles.numberField}>
                    <input
                      id="notion-max-kb"
                      type="number"
                      min={MIN_MAX_KILOBYTES}
                      max={MAX_MAX_KILOBYTES}
                      step="10"
                      value={maxKilobytesInput}
                      aria-invalid={!maxKilobytesValid}
                      aria-describedby="notion-limit-help"
                      onChange={(event) => {
                        setMaxKilobytesInput(event.target.value)
                        setCopiedChunks(new Set())
                      }}
                    />
                    <span>KB</span>
                  </span>
                  <small id="notion-limit-help">
                    {maxKilobytesValid
                      ? 'Notion 手动粘贴超过约 500 KB 可能失败，建议保留余量。'
                      : `请输入 ${MIN_MAX_KILOBYTES}–${MAX_MAX_KILOBYTES} 之间的整数。`}
                  </small>
                </div>
              </div>
              <div className={styles.settingActions}>
                <label className={styles.boundaryToggle}>
                  <input
                    type="checkbox"
                    checked={preferSemanticBoundaries}
                    onChange={(event) => {
                      setPreferSemanticBoundaries(event.target.checked)
                      setCopiedChunks(new Set())
                    }}
                  />
                  <span>优先按段落边界切分</span>
                </label>
                <button className="button" type="button" onClick={() => void clearAll()} disabled={!source}>
                  <Trash2 aria-hidden="true" /> 清空
                </button>
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.resultPanel}`} aria-labelledby="notion-result-title">
            <header className={styles.panelHeader}>
              <h2 id="notion-result-title">切分结果</h2>
              <div className={styles.resultActions}>
                <span className={styles.splitBadge}>已切分 {result.chunks.length} 段</span>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!nextChunk || processing || !maxKilobytesValid}
                  onClick={() => nextChunk && void copyChunk(nextChunk.index)}
                >
                  {nextChunk ? <ClipboardCopy aria-hidden="true" /> : <Check aria-hidden="true" />}
                  {nextChunk ? '复制下一段' : result.chunks.length ? '全部已复制' : '复制下一段'}
                </button>
              </div>
            </header>

            {result.chunks.length ? (
              <div className={styles.resultList} aria-label="切分片段">
                {result.chunks.map((chunk) => {
                  const copied = copiedChunks.has(chunk.index)
                  return (
                    <article className={`${styles.chunk} ${copied ? styles.copiedChunk : ''}`} key={`${chunk.start}-${chunk.end}`}>
                      <header>
                        <strong>第 {chunk.index + 1} 段</strong>
                        <span>{chunk.characterCount.toLocaleString('zh-CN')} 字符 · {formatBytes(chunk.byteLength)}</span>
                        <small className={copied ? styles.copiedStatus : ''}>
                          {copied ? <CheckCircle2 aria-hidden="true" /> : <i aria-hidden="true" />}
                          {copied ? '已复制' : '未复制'}
                        </small>
                        <button
                          type="button"
                          className={copied ? styles.copiedButton : ''}
                          aria-label={`复制第 ${chunk.index + 1} 段`}
                          onClick={() => void copyChunk(chunk.index)}
                        >
                          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                          {copied ? '再次复制' : '复制本段'}
                        </button>
                      </header>
                      <textarea
                        readOnly
                        aria-label={`第 ${chunk.index + 1} 段文本`}
                        value={chunk.text}
                        spellCheck={false}
                      />
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span><Files aria-hidden="true" /></span>
                <h3>{maxKilobytesValid ? '等待粘贴长文本' : '请先修正安全上限'}</h3>
                <p>{maxKilobytesValid ? '切分结果会自动出现在这里，并可按顺序逐段复制。' : '有效范围为 100–450 KB。'}</p>
              </div>
            )}

            <footer className={styles.progressArea}>
              <div>
                <strong>复制进度&nbsp; {copiedCount} / {result.chunks.length}</strong>
                <span>按顺序复制后粘贴到 Notion 即可</span>
              </div>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label="片段复制进度"
                aria-valuemin={0}
                aria-valuemax={Math.max(result.chunks.length, 1)}
                aria-valuenow={copiedCount}
              >
                <span style={{ width: `${result.chunks.length ? copiedCount / result.chunks.length * 100 : 0}%` }} />
              </div>
            </footer>
          </section>
        </div>

        <section className={styles.statusBar} aria-label="切分状态">
          <div className={styles.statusMessage}>
            {maxKilobytesValid ? <CheckCircle2 aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
            <strong>{statusText}</strong>
            {storageWarning ? <small>IndexedDB 暂不可用，本次仅在当前会话中保留草稿。</small> : null}
          </div>
          <dl>
            <div><dt>原文</dt><dd>{formatBytes(liveByteLength)}</dd></div>
            <div><dt>分段</dt><dd>{result.chunks.length}</dd></div>
            <div><dt>最大段</dt><dd>{formatBytes(result.maxChunkByteLength)}</dd></div>
          </dl>
        </section>
        <p className="sr-only" aria-live="polite">{notice}</p>
      </main>
    </div>
  )
}
