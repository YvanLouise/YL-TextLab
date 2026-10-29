import { useEffect, useState } from 'react'
import { areAudioFilesIdentical } from './file-identity'

export function AudioDuplicateNotice({ a, b, className }: { a: File; b: File; className: string }) {
  const [state, setState] = useState<'checking' | 'same' | 'different' | 'error'>('checking')
  useEffect(() => {
    const controller = new AbortController()
    void areAudioFilesIdentical(a, b, controller.signal).then(same => {
      if (!controller.signal.aborted) setState(same ? 'same' : 'different')
    }).catch(() => { if (!controller.signal.aborted) setState('error') })
    return () => controller.abort()
  }, [a, b])
  return <div aria-live="polite" aria-atomic="true">
    {state === 'different' ? null : <p className={className}>
      {state === 'checking' ? '正在本机核对 A、B 是否为同一份文件…'
        : state === 'error' ? '暂时无法核对文件内容，请手动确认 A、B 是否重复；仍可继续处理。'
          : <><strong>同文件提示：</strong>A、B 的文件内容完全相同，即使名称不同也会得到相同解码内容。按 100%、零偏移且不反转 B 相减会得到静音；如需保留其他声音，请更换其中一份素材。仍可继续生成。</>}
    </p>}
  </div>
}
