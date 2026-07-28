import {
  ArrowLeftRight,
  BarChart3,
  CheckCircle2,
  ClipboardCopy,
  HelpCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ToolHeader } from '../components/SiteHeader'
import { HighlightedTextarea } from '../features/replacement/HighlightedTextarea'
import {
  countVisibleCharacters,
  executeReplacement,
  formatDuration,
} from '../features/replacement/engine'
import {
  clearReplacementDraft,
  loadReplacementDraft,
  saveReplacementDraft,
} from '../features/replacement/storage'
import {
  DEFAULT_OPTIONS,
  type ReplacementDraftV1,
  type ReplacementExecution,
  type ReplacementOptions,
} from '../features/replacement/types'
import styles from './ReplacePage.module.css'

interface Fields {
  source: string
  search: string
  replacement: string
  result: string
}

const EMPTY_FIELDS: Fields = { source: '', search: '', replacement: '', result: '' }

const optionDetails: Array<{
  key: keyof ReplacementOptions
  label: string
  help: string
}> = [
  {
    key: 'caseSensitive',
    label: '区分大小写',
    help: '开启后，Hello 与 hello 会被视为不同内容。',
  },
  {
    key: 'wholeWord',
    label: '全字匹配',
    help: '英文和数字按单词边界匹配；中文按连续的完整关键词匹配。',
  },
  {
    key: 'firstOnly',
    label: '仅替换第一个',
    help: '仅处理原文中第一个符合当前规则的匹配项。',
  },
]

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const fallback = document.createElement('textarea')
  fallback.value = value
  fallback.style.position = 'fixed'
  fallback.style.opacity = '0'
  document.body.appendChild(fallback)
  fallback.select()
  const copied = document.execCommand('copy')
  fallback.remove()
  if (!copied) throw new Error('copy failed')
}

export function ReplacePage() {
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS)
  const [options, setOptions] = useState<ReplacementOptions>(DEFAULT_OPTIONS)
  const [execution, setExecution] = useState<ReplacementExecution | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [errors, setErrors] = useState<{ source?: string; search?: string }>({})
  const [notice, setNotice] = useState('请输入原始文本并设置替换内容')
  const [storageWarning, setStorageWarning] = useState(false)
  const [resultEdited, setResultEdited] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadReplacementDraft().then((draft) => {
      if (cancelled) return
      if (draft) {
        setFields({
          source: draft.source,
          search: draft.search,
          replacement: draft.replacement,
          result: draft.result,
        })
        setOptions(draft.options)
        setNotice('已恢复本机草稿，执行替换后更新统计')
      }
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const draft: ReplacementDraftV1 = { version: 1, ...fields, options }
    const timeout = window.setTimeout(() => {
      saveReplacementDraft(draft).then((saved) => setStorageWarning(!saved))
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [fields, hydrated, options])

  const sourceCount = useMemo(() => countVisibleCharacters(fields.source), [fields.source])
  const resultCount = useMemo(() => countVisibleCharacters(fields.result), [fields.result])

  const markExecutionStale = () => {
    if (execution) {
      setExecution(null)
      setNotice('内容或规则已变化，请重新执行替换')
    }
  }

  const updateField = (key: keyof Fields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }))
    if (key === 'result') {
      if (execution) {
        setResultEdited(true)
        setNotice('替换结果已手工编辑')
      }
      return
    }
    markExecutionStale()
    if (key === 'source' || key === 'search') {
      setErrors((current) => ({ ...current, [key]: undefined }))
    }
  }

  const updateOption = (key: keyof ReplacementOptions) => {
    setOptions((current) => ({ ...current, [key]: !current[key] }))
    markExecutionStale()
  }

  const handleExecute = () => {
    const nextErrors = {
      source: fields.source ? undefined : '请输入需要处理的原始文本',
      search: fields.search ? undefined : '请输入要查找的关键词',
    }
    setErrors(nextErrors)
    if (nextErrors.source || nextErrors.search) {
      setNotice('请先完成必填内容')
      return
    }

    const nextExecution = executeReplacement({
      source: fields.source,
      search: fields.search,
      replacement: fields.replacement,
      options,
    })
    setExecution(nextExecution)
    setFields((current) => ({ ...current, result: nextExecution.output }))
    setResultEdited(false)
    setNotice(
      nextExecution.matchCount > 0
        ? `处理完成，已替换 ${nextExecution.matchCount} 处`
        : '未找到匹配内容，结果保持不变',
    )
  }

  const handleSwap = () => {
    setFields((current) => ({
      ...current,
      search: current.replacement,
      replacement: current.search,
    }))
    markExecutionStale()
    setErrors((current) => ({ ...current, search: undefined }))
  }

  const handleClear = async () => {
    setFields(EMPTY_FIELDS)
    setOptions(DEFAULT_OPTIONS)
    setExecution(null)
    setErrors({})
    setResultEdited(false)
    setNotice('内容和本机草稿已清空')
    await clearReplacementDraft()
  }

  const handleCopy = async () => {
    try {
      await copyText(fields.result)
      setNotice('替换结果已复制到剪贴板')
    } catch {
      setNotice('复制失败，请手动选择并复制结果')
    }
  }

  const hasSuccessfulExecution = execution && execution.matchCount > 0

  return (
    <div className={styles.page}>
      <ToolHeader toolName="文本关键词替换工具" />
      <main className={`page-shell ${styles.workspace}`}>
        <section className={`${styles.panel} ${styles.settings}`} aria-labelledby="settings-title">
          <h1 id="settings-title">替换设置</h1>
          <div className={styles.fieldGroup}>
            <label htmlFor="search-keyword">查找关键词</label>
            <input
              id="search-keyword"
              value={fields.search}
              aria-invalid={Boolean(errors.search)}
              aria-describedby={errors.search ? 'search-error' : undefined}
              placeholder="输入要查找的内容"
              onChange={(event) => updateField('search', event.target.value)}
            />
            {errors.search ? (
              <span id="search-error" className={styles.error}>
                {errors.search}
              </span>
            ) : null}
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="replacement-text">替换为</label>
            <input
              id="replacement-text"
              value={fields.replacement}
              placeholder="留空表示删除匹配内容"
              onChange={(event) => updateField('replacement', event.target.value)}
            />
          </div>

          <fieldset className={styles.options}>
            <legend className="sr-only">匹配选项</legend>
            {optionDetails.map((option) => (
              <div className={styles.optionRow} key={option.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={options[option.key]}
                    onChange={() => updateOption(option.key)}
                  />
                  <span className={styles.checkbox} aria-hidden="true" />
                  {option.label}
                </label>
                <button
                  className={styles.helpButton}
                  type="button"
                  aria-label={`${option.label}说明：${option.help}`}
                  title={option.help}
                >
                  <HelpCircle aria-hidden="true" />
                </button>
              </div>
            ))}
          </fieldset>

          <button className={`button button-primary ${styles.execute}`} type="button" onClick={handleExecute}>
            <RefreshCw aria-hidden="true" /> 执行替换
          </button>
          <div className={styles.secondaryActions}>
            <button className="button" type="button" onClick={handleClear}>
              <Trash2 aria-hidden="true" /> 清空
            </button>
            <button className="button" type="button" onClick={handleSwap}>
              <ArrowLeftRight aria-hidden="true" /> 交换内容
            </button>
          </div>

          <div className={styles.settingSummary} aria-live="polite">
            <span className={styles.summaryIcon}>
              <BarChart3 aria-hidden="true" />
            </span>
            <div>
              <p>
                匹配数量：<strong>{execution?.matchCount ?? 0}</strong>
              </p>
              <p>
                替换状态：
                <strong className={execution ? styles.ready : ''}>
                  {execution ? (resultEdited ? '结果已编辑' : '已完成') : '待执行'}
                </strong>
              </p>
            </div>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.editorPanel}`} aria-labelledby="source-title">
          <div className={styles.panelHeading}>
            <h2 id="source-title">原始文本</h2>
            <span>{sourceCount.toLocaleString('zh-CN')} 字符</span>
          </div>
          <HighlightedTextarea
            id="source-text"
            labelledBy="source-title"
            value={fields.source}
            ranges={execution?.matchRanges ?? []}
            tone="source"
            placeholder="在此粘贴或输入需要处理的原始文本…"
            onChange={(value) => updateField('source', value)}
          />
          {errors.source ? <span className={styles.editorError}>{errors.source}</span> : null}
        </section>

        <div className={styles.flowArrow} aria-hidden="true">
          <ArrowLeftRight />
        </div>

        <section className={`${styles.panel} ${styles.editorPanel}`} aria-labelledby="result-title">
          <div className={styles.panelHeading}>
            <div className={styles.resultTitle}>
              <h2 id="result-title">替换结果</h2>
              {hasSuccessfulExecution ? (
                <span className={styles.replacedBadge}>已替换 {execution.matchCount} 处</span>
              ) : null}
            </div>
            <button
              className={styles.copyButton}
              type="button"
              disabled={!fields.result}
              onClick={handleCopy}
            >
              <ClipboardCopy aria-hidden="true" /> 复制结果
            </button>
          </div>
          <HighlightedTextarea
            id="result-text"
            labelledBy="result-title"
            value={fields.result}
            ranges={resultEdited ? [] : (execution?.replacementRanges ?? [])}
            tone="result"
            placeholder="执行替换后，结果将在这里显示…"
            onChange={(value) => updateField('result', value)}
          />
        </section>

        <section className={styles.statusBar} aria-live="polite" aria-label="处理状态">
          <div className={styles.statusMessage}>
            <CheckCircle2 aria-hidden="true" />
            <span>{notice}</span>
          </div>
          <dl>
            <div>
              <dt>字符数</dt>
              <dd>{(sourceCount + resultCount).toLocaleString('zh-CN')}</dd>
            </div>
            <div>
              <dt>匹配</dt>
              <dd>{execution?.matchCount ?? 0} 处</dd>
            </div>
            <div>
              <dt>处理时间</dt>
              <dd>{execution ? formatDuration(execution.durationMs) : '—'}</dd>
            </div>
          </dl>
        </section>
        {storageWarning ? (
          <p className={styles.storageWarning} role="status">
            浏览器暂时无法持久保存草稿，本次内容仍可在当前页面正常使用。
          </p>
        ) : null}
      </main>
    </div>
  )
}
