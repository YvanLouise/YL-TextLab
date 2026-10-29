export interface EditObject {
  id: string
  kind: 'text' | 'image'
  text: string
  fontSize: number
  color: string
  // PDF coordinates and the object's original affine transform.
  matrix: number[]
  bounds: number[]
  screen: { x: number; y: number; width: number; height: number }
}

export interface PdfEdit {
  id: string
  page: number
  kind: 'text' | 'image' | 'delete'
  text?: string
  fontSize?: number
  color?: string
  matrix?: number[]
  image?: { pixels: Uint8Array; width: number; height: number }
}

export interface EditPage {
  page: number
  pageCount: number
  width: number
  height: number
  pixels: Uint8ClampedArray
  objects: EditObject[]
  complexObjects: number
  // Maps screen-normalized coordinates to PDF page coordinates (rotation included).
  origin: [number, number]
  axisX: [number, number]
  axisY: [number, number]
}

export const MAX_EDIT_STEPS = 50
export const MAX_EDIT_IMAGES_BYTES = 32 * 1024 * 1024
export function retainedImageBytes(history: PdfEdit[][]): number {
  const buffers = new Set(history.flatMap((edits) => edits.flatMap((edit) => edit.image ? [edit.image.pixels] : [])))
  return Array.from(buffers).reduce((sum, pixels) => sum + pixels.byteLength, 0)
}
export function updateEdits(edits: PdfEdit[], next: PdfEdit): PdfEdit[] {
  const existing = edits.findIndex((item) => item.id === next.id && item.page === next.page)
  if (next.id.startsWith('new-') && next.kind === 'delete') return edits.filter((item) => item.id !== next.id)
  return existing < 0 ? [...edits, next] : edits.map((item, index) => index === existing ? next : item)
}

export function editOutputName(name: string): string {
  return `${name.replace(/\.pdf$/i, '')}-edited.pdf`
}

export function validateTextEdit(text: string, size: number, color: string): string | null {
  if (!text.trim()) return '请输入文字；若要移除原内容，请使用“删除对象”。'
  if (text.length > 2000) return '每个文字对象最多 2,000 字，请分成多个对象添加。'
  if (/[\r\n]/.test(text)) return '一次编辑一行文字；请分别添加多行，不自动重排其他内容。'
  if (Array.from(text).some((char) => { const code = char.codePointAt(0)!; return code < 32 || code > 0xfffd || (code >= 0xd800 && code <= 0xdfff) })) return '当前编辑字体不支持 Emoji、控制字符或辅助平面字符，请使用常用中英文文字。'
  if (!Number.isFinite(size) || size < 4 || size > 200) return '字号需在 4–200 pt 之间。'
  if (!/^#[\da-f]{6}$/i.test(color)) return '请选择有效的文字颜色。'
  return null
}

export function pagePoint(page: EditPage, x: number, y: number): [number, number] {
  return [page.origin[0] + x * page.axisX[0] + y * page.axisY[0], page.origin[1] + x * page.axisX[1] + y * page.axisY[1]]
}

export function insertionMatrix(page: EditPage, x: number, y: number): number[] {
  const [px, py] = pagePoint(page, x, y)
  const length = Math.hypot(...page.axisX)
  const a = page.axisX[0] / length, b = page.axisX[1] / length
  return [a, b, -b, a, px, py]
}
