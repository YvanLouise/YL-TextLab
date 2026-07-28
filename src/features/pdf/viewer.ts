export const MIN_SCALE = 0.25
export const MAX_SCALE = 3
export const SCALE_STEP = 0.25

export function isPdfFile(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type === 'application/pdf' || (file.type === '' && /\.pdf$/i.test(file.name))
}

export function clampPage(value: number, pageCount: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(Math.round(value), 1), Math.max(pageCount, 1))
}

export function clampScale(value: number): number {
  return Math.min(Math.max(value, MIN_SCALE), MAX_SCALE)
}

export function nextRotation(rotation: number): number {
  return (rotation + 90) % 360
}

export function describePdfError(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'PasswordException') return '此 PDF 受密码保护，当前版本暂不支持打开。'
  if (name === 'InvalidPDFException' || name === 'FormatError') {
    return '无法读取此 PDF，文件可能已损坏或格式不正确。'
  }
  if (name === 'MissingPDFException') return '无法读取所选文件，请重新选择。'
  return 'PDF 加载失败，请确认文件有效后重试。'
}
