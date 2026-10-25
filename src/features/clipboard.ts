export async function copyPlainText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return } catch {
      // Some browsers deny the async API but still allow copying in a user gesture.
    }
  }

  const fallback = document.createElement('textarea')
  fallback.value = value
  fallback.setAttribute('readonly', '')
  fallback.style.position = 'fixed'
  fallback.style.opacity = '0'
  fallback.style.pointerEvents = 'none'
  const focused = document.activeElement
  try {
    document.body.appendChild(fallback)
    fallback.select()
    if (!document.execCommand('copy')) throw new Error('copy failed')
  } finally {
    fallback.remove()
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })
  }
}
