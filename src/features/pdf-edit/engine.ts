import type { WrappedPdfiumModule } from '@embedpdf/pdfium'
import type { EditObject, EditPage, PdfEdit } from './model'
import { validateTextEdit } from './model'
import { cidMap, unicodeCmap } from './font'

// Each transaction starts from the immutable original. Failed edits never affect a later save.
export class PdfContentEngine {
  private source: Uint8Array | null = null
  constructor(private p: WrappedPdfiumModule, private loadFont: () => Promise<Uint8Array>) {}

  open(bytes: Uint8Array) { this.source = bytes }

  private memory<T>(size: number, fn: (pointer: number) => T): T {
    const ptr = this.p.pdfium.wasmExports.malloc(size)
    if (!ptr) throw new Error('浏览器内存不足，请关闭其他大文件后重试。')
    try { return fn(ptr) } finally { this.p.pdfium.wasmExports.free(ptr) }
  }
  private f32(ptr: number) { return this.p.pdfium.HEAPF32[ptr / 4] }

  async run(edits: PdfEdit[], pageNumber: number, save = false): Promise<EditPage | Uint8Array> {
    if (!this.source) throw new Error('请先打开 PDF。')
    const fontBytes = edits.some((edit) => edit.kind === 'text') ? await this.loadFont() : null
    const p = this.p
    return this.memory(this.source.length, (ptr) => {
      p.pdfium.HEAPU8.set(this.source!, ptr)
      const doc = p.FPDF_LoadMemDocument(ptr, this.source!.length, '')
      if (!doc) throw new Error(p.FPDF_GetLastError() === 4 ? '加密 PDF 暂不支持内容编辑，请提供未加密的可编辑副本。' : '编辑引擎无法打开此 PDF。')
      const pages = new Map<number, number>()
      let font = 0
      try {
        if (p.EPDF_IsEncrypted(doc)) throw new Error('加密 PDF 暂不支持内容编辑；原有阅读功能不受影响。')
        if (p.FPDF_GetSignatureCount(doc)) throw new Error('此 PDF 含数字签名，内容编辑会使签名失效。请使用未签名副本。')
        if (!(p.FPDF_GetDocPermissions(doc) & 8)) throw new Error('此 PDF 未授权修改内容。')
        const count = p.FPDF_GetPageCount(doc)
        if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > count) throw new Error('页码无效。')
        const loadPage = (number: number) => {
          if (!Number.isInteger(number) || number < 1 || number > count) throw new Error('编辑页码无效。')
          if (!pages.has(number)) {
            const page = p.FPDF_LoadPage(doc, number - 1)
            if (!page) throw new Error(`第 ${number} 页无法编辑。`)
            pages.set(number, page)
          }
          return pages.get(number)!
        }
        if (fontBytes) {
          const map = cidMap(fontBytes)
          for (const edit of edits) if (edit.kind === 'text') for (const char of edit.text ?? '') {
            const code = char.charCodeAt(0)
            if (!map[code * 2] && !map[code * 2 + 1]) throw new Error(`内置字体不支持“${char}”，请更换文字后重试。`)
          }
          font = this.memory(fontBytes.length, (fontPtr) => this.memory(map.length, (mapPtr) => {
            p.pdfium.HEAPU8.set(fontBytes, fontPtr)
            p.pdfium.HEAPU8.set(map, mapPtr)
            return p.FPDFText_LoadCidType2Font(doc, fontPtr, fontBytes.length, unicodeCmap(edits.map((item) => item.text ?? '').join('')), mapPtr, map.length)
          }))
        }
        if (fontBytes && !font) throw new Error('内置编辑字体加载失败。')
        const changedPages = new Set(edits.map((item) => item.page))
        const objectMaps = new Map<number, Map<string, number>>()
        for (const number of changedPages) {
          const page = loadPage(number)
          const objects = new Map<string, number>()
          for (let i = 0; i < p.FPDFPage_CountObjects(page); i++) objects.set(String(i), p.FPDFPage_GetObject(page, i))
          objectMaps.set(number, objects)
        }
        for (const edit of edits) {
          const page = loadPage(edit.page)
          const objects = objectMaps.get(edit.page)!
          const original = objects.get(edit.id)
          if (!edit.id.startsWith('new-') && !original) throw new Error('原内容对象已变更，请重新打开编辑器。')
          if (original && ![1, 3].includes(p.FPDFPageObj_GetType(original))) throw new Error('此复杂对象暂不支持编辑。')
          if (edit.kind !== 'delete') {
            const object = edit.kind === 'text' ? this.createText(doc, font, edit) : this.createImage(doc, edit)
            // Preserve the original stacking position; new content is placed on top.
            const at = original ? Array.from({ length: p.FPDFPage_CountObjects(page) }, (_, i) => i).find((i) => p.FPDFPage_GetObject(page, i) === original) : undefined
            if (at === undefined) p.FPDFPage_InsertObject(page, object)
            else if (!p.FPDFPage_InsertObjectAtIndex(page, object, at)) { p.FPDFPageObj_Destroy(object); throw new Error('无法插入编辑后的内容。') }
            objects.set(edit.id, object)
          } else objects.delete(edit.id)
          if (original) {
            if (!p.FPDFPage_RemoveObject(page, original)) throw new Error('无法移除原对象，未保存任何更改。')
            p.FPDFPageObj_Destroy(original)
          }
        }
        for (const number of changedPages) if (!p.FPDFPage_GenerateContent(loadPage(number))) throw new Error('页面内容生成失败，未保存任何更改。')
        if (save) return this.save(doc)
        const page = loadPage(pageNumber)
        return this.preview(page, pageNumber, count, objectMaps.get(pageNumber))
      } finally {
        for (const page of pages.values()) p.FPDF_ClosePage(page)
        if (font) p.FPDFFont_Close(font)
        p.FPDF_CloseDocument(doc)
      }
    })
  }

  private createText(doc: number, font: number, edit: PdfEdit) {
    const error = validateTextEdit(edit.text ?? '', edit.fontSize ?? 0, edit.color ?? '')
    if (error) throw new Error(error)
    const p = this.p
    const object = p.FPDFPageObj_CreateTextObj(doc, font, edit.fontSize!)
    if (!object) throw new Error('无法创建文字对象。')
    try {
      this.memory((edit.text!.length + 1) * 2, (ptr) => {
        p.pdfium.stringToUTF16(edit.text!, ptr, (edit.text!.length + 1) * 2)
        if (!p.FPDFText_SetText(object, ptr)) throw new Error('部分文字无法写入 PDF，请使用常用中英文字符。')
      })
      const color = edit.color!.slice(1).match(/../g)!.map((value) => parseInt(value, 16))
      p.FPDFPageObj_SetFillColor(object, color[0], color[1], color[2], 255)
      this.setMatrix(object, edit.matrix)
      return object
    } catch (error) { p.FPDFPageObj_Destroy(object); throw error }
  }

  private createImage(doc: number, edit: PdfEdit) {
    const image = edit.image
    if (!image || image.width < 1 || image.height < 1 || image.width * image.height > 8_000_000 || image.pixels.length !== image.width * image.height * 4) throw new Error('图片数据无效或超过 800 万像素。')
    const p = this.p, object = p.FPDFPageObj_NewImageObj(doc)
    if (!object) throw new Error('无法创建图片对象。')
    const bitmap = p.FPDFBitmap_Create(image.width, image.height, 1)
    if (!bitmap) { p.FPDFPageObj_Destroy(object); throw new Error('图片内存分配失败。') }
    try {
      const buffer = p.FPDFBitmap_GetBuffer(bitmap), stride = p.FPDFBitmap_GetStride(bitmap)
      const heap = p.pdfium.HEAPU8
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        const src = (y * image.width + x) * 4, dst = buffer + y * stride + x * 4
        heap[dst] = image.pixels[src + 2]; heap[dst + 1] = image.pixels[src + 1]; heap[dst + 2] = image.pixels[src]; heap[dst + 3] = image.pixels[src + 3]
      }
      if (!p.FPDFImageObj_SetBitmap(0, 0, object, bitmap)) throw new Error('无法嵌入图片。')
      this.setMatrix(object, edit.matrix)
      return object
    } catch (error) { p.FPDFPageObj_Destroy(object); throw error }
    finally { p.FPDFBitmap_Destroy(bitmap) }
  }

  private setMatrix(object: number, matrix?: number[]) {
    if (!matrix || matrix.length !== 6 || matrix.some((v) => !Number.isFinite(v))) throw new Error('对象位置无效。')
    this.memory(24, (ptr) => {
      this.p.pdfium.HEAPF32.set(matrix, ptr / 4)
      if (!this.p.FPDFPageObj_SetMatrix(object, ptr)) throw new Error('无法设置对象位置。')
    })
  }

  private save(doc: number) {
    const p = this.p, writer = p.PDFiumExt_OpenFileWriter()
    if (!writer) throw new Error('无法创建 PDF 导出缓冲。')
    try {
      if (!p.FPDF_SaveAsCopy(doc, writer, 2)) throw new Error('PDF 导出失败。')
      const size = p.PDFiumExt_GetFileWriterSize(writer)
      if (!size || size > 200 * 1024 * 1024) throw new Error('导出文件过大，请减少插入的图片。')
      return this.memory(size, (ptr) => {
        p.PDFiumExt_GetFileWriterData(writer, ptr, size)
        return this.p.pdfium.HEAPU8.slice(ptr, ptr + size)
      })
    } finally { p.PDFiumExt_CloseFileWriter(writer) }
  }

  private preview(page: number, pageNumber: number, pageCount: number, objectMap?: Map<string, number>): EditPage {
    const p = this.p
    const pageWidth = p.FPDF_GetPageWidth(page), pageHeight = p.FPDF_GetPageHeight(page)
    if (!Number.isFinite(pageWidth + pageHeight) || pageWidth <= 0 || pageHeight <= 0) throw new Error('页面尺寸无效。')
    const scale = Math.min(1.5, 1400 / Math.max(pageWidth, pageHeight))
    const width = Math.max(1, Math.round(pageWidth * scale)), height = Math.max(1, Math.round(pageHeight * scale))
    const bitmap = p.FPDFBitmap_Create(width, height, 1)
    if (!bitmap) throw new Error('页面预览内存不足。')
    const pixels = new Uint8ClampedArray(width * height * 4)
    try {
      p.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff)
      p.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, 1)
      const buffer = p.FPDFBitmap_GetBuffer(bitmap), stride = p.FPDFBitmap_GetStride(bitmap)
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const src = buffer + y * stride + x * 4, dst = (y * width + x) * 4
        pixels[dst] = p.pdfium.HEAPU8[src + 2]; pixels[dst + 1] = p.pdfium.HEAPU8[src + 1]; pixels[dst + 2] = p.pdfium.HEAPU8[src]; pixels[dst + 3] = 255
      }
    } finally { p.FPDFBitmap_Destroy(bitmap) }
    const toPage = (x: number, y: number): [number, number] => this.memory(16, (ptr) => {
      p.FPDF_DeviceToPage(page, 0, 0, width, height, 0, x, y, ptr, ptr + 8)
      return [p.pdfium.HEAPF64[ptr / 8], p.pdfium.HEAPF64[ptr / 8 + 1]]
    })
    const toScreen = (x: number, y: number) => this.memory(8, (ptr) => {
      p.FPDF_PageToDevice(page, 0, 0, width, height, 0, x, y, ptr, ptr + 4)
      return [p.pdfium.HEAP32[ptr / 4] / width, p.pdfium.HEAP32[ptr / 4 + 1] / height]
    })
    const origin = toPage(0, 0), endX = toPage(width, 0), endY = toPage(0, height)
    const reverse = new Map(Array.from(objectMap ?? []).map(([id, object]) => [object, id]))
    const objects: EditObject[] = []
    let complexObjects = 0
    const textPage = p.FPDFText_LoadPage(page)
    try {
      const count = p.FPDFPage_CountObjects(page)
      if (count > 5000) throw new Error('本页对象超过 5,000 个，暂不支持编辑，可继续阅读。')
      for (let i = 0; i < count; i++) {
        const object = p.FPDFPage_GetObject(page, i), kind = p.FPDFPageObj_GetType(object)
        if (kind === 5) complexObjects++
        if (kind !== 1 && kind !== 3) continue
        // Text used as a clipping mask is not safely replaceable as ordinary text.
        if (kind === 1 && p.FPDFTextObj_GetTextRenderMode(object) !== 0) { complexObjects++; continue }
        this.memory(64, (ptr) => {
          if (!p.FPDFPageObj_GetBounds(object, ptr, ptr + 4, ptr + 8, ptr + 12)) return
          const bounds = Array.from({ length: 4 }, (_, n) => this.f32(ptr + n * 4))
          if (!p.FPDFPageObj_GetMatrix(object, ptr + 16)) return
          const matrix = Array.from({ length: 6 }, (_, n) => this.f32(ptr + 16 + n * 4))
          const corners = [toScreen(bounds[0], bounds[1]), toScreen(bounds[0], bounds[3]), toScreen(bounds[2], bounds[1]), toScreen(bounds[2], bounds[3])]
          const x = Math.min(...corners.map((v) => v[0])), y = Math.min(...corners.map((v) => v[1]))
          const w = Math.max(...corners.map((v) => v[0])) - x, h = Math.max(...corners.map((v) => v[1])) - y
          let text = '', fontSize = 14, color = '#182235'
          if (kind === 1) {
            const size = p.FPDFTextObj_GetText(object, textPage, 0, 0)
            if (size > 100_000) return
            if (size > 2) text = this.memory(size, (str) => { p.FPDFTextObj_GetText(object, textPage, str, size); return p.pdfium.UTF16ToString(str) })
            if (!text.trim()) return
            if (p.FPDFTextObj_GetFontSize(object, ptr + 40)) fontSize = this.f32(ptr + 40)
            if (p.FPDFPageObj_GetFillColor(object, ptr + 44, ptr + 48, ptr + 52, ptr + 56)) color = `#${[44, 48, 52].map((n) => p.pdfium.HEAPU32[(ptr + n) / 4].toString(16).padStart(2, '0')).join('')}`
          }
          objects.push({ id: reverse.get(object) ?? String(i), kind: kind === 1 ? 'text' : 'image', text, fontSize, color, matrix, bounds, screen: { x, y, width: w, height: h } })
        })
      }
    } finally { p.FPDFText_ClosePage(textPage) }
    return { page: pageNumber, pageCount, width, height, pixels, objects, complexObjects, origin, axisX: [endX[0] - origin[0], endX[1] - origin[1]], axisY: [endY[0] - origin[0], endY[1] - origin[1]] }
  }
}
