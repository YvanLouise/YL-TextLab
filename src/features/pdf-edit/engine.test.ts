// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { beforeAll, beforeEach, expect, it } from 'vitest'
import { init } from '@embedpdf/pdfium'
import { PdfContentEngine } from './engine'
import type { EditPage } from './model'
import { editOutputName, insertionMatrix, retainedImageBytes, updateEdits, validateTextEdit } from './model'

let engine: PdfContentEngine
beforeAll(async () => {
  const options = { thisProgram: 'pdf-editor', wasmBinary: new Uint8Array(await readFile('node_modules/@embedpdf/pdfium/dist/pdfium.wasm')).buffer }
  const p = await init(options)
  p.PDFiumExt_Init()
  engine = new PdfContentEngine(p, () => readFile('public/pdf-editor/NotoSansSC-Regular.ttf'))
}, 30_000)
beforeEach(async () => engine.open(await readFile('tests/fixtures/pdf/reader-sample.pdf')))

it('reads actual page text objects and replaces original text in a saved PDF', async () => {
  const before = await engine.run([], 1) as EditPage
  const title = before.objects.find((o) => o.text.includes('A better way'))!
  expect(title).toBeDefined()
  const changes = [{ id: title.id, page: 1, kind: 'text' as const, text: 'Edited PDF title', fontSize: 24, color: '#286cf4', matrix: title.matrix }]
  const data = await engine.run(changes, 1, true) as Uint8Array
  expect(new TextDecoder().decode(data.slice(0, 5))).toBe('%PDF-')
  engine.open(data)
  const after = await engine.run([], 1) as EditPage
  expect(after.objects.map((o) => o.text).join(' ')).toContain('Edited PDF title')
  expect(after.objects.map((o) => o.text).join(' ')).not.toContain('A better way')
  expect(after.pageCount).toBe(4)
}, 30_000)

it('adds Chinese text and removes an image without changing other pages', async () => {
  const page = await engine.run([], 3) as EditPage
  const edits = [{ id: 'new-title', page: 3, kind: 'text' as const, text: '中文内容编辑验证', fontSize: 18, color: '#159447', matrix: insertionMatrix(page, .1, .8) }]
  const result = await engine.run(edits, 3) as EditPage
  expect(result.objects.map((o) => o.text)).toContain('中文内容编辑验证')
  expect(result.objects.some((o) => o.text.includes('本地阅读'))).toBe(true)
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128])
  const withImage = await engine.run([...edits, { id: 'new-image', page: 3, kind: 'image', image: { pixels, width: 2, height: 1 }, matrix: [80, 0, 0, 40, 40, 100] }], 3) as EditPage
  expect(withImage.objects.find((o) => o.id === 'new-image')?.kind).toBe('image')
  const area = withImage.objects.find((o) => o.id === 'new-image')!.screen
  const pixel = (fraction: number) => {
    const x = Math.round((area.x + area.width * fraction) * withImage.width), y = Math.round((area.y + area.height * .5) * withImage.height)
    return Array.from(withImage.pixels.slice((y * withImage.width + x) * 4, (y * withImage.width + x) * 4 + 4))
  }
  expect(pixel(.25)).toEqual([255, 0, 0, 255])
  expect(pixel(.75)[2]).toBe(255)
  expect(pixel(.75)[0]).toBeGreaterThan(120)
  expect(pixel(.75)[0]).toBeLessThan(135)
  const exported = await engine.run(edits, 3, true) as Uint8Array
  engine.open(exported)
  const reopened = await engine.run([], 3) as EditPage
  expect(reopened.objects.map((o) => o.text)).toContain('中文内容编辑验证')
}, 30_000)

it('deletes text rather than covering it, and repeated transactions start from the original', async () => {
  const page = await engine.run([], 1) as EditPage
  const item = page.objects.find((o) => o.text.includes('A better way'))!
  const deleted = await engine.run([{ id: item.id, page: 1, kind: 'delete' }], 1) as EditPage
  expect(deleted.objects.some((o) => o.text === item.text)).toBe(false)
  const restored = await engine.run([], 1) as EditPage
  expect(restored.objects.some((o) => o.text === item.text)).toBe(true)
  const rotated = await engine.run([], 2) as EditPage
  expect(rotated.objects.every((o) => o.screen.width >= 0 && o.screen.height >= 0)).toBe(true)
})

it('rejects encrypted documents without stripping permissions', async () => {
  engine.open(await readFile('tests/fixtures/pdf/restricted.pdf'))
  await expect(engine.run([], 1)).rejects.toThrow('加密')
  engine.open(await readFile('tests/fixtures/pdf/locked.pdf'))
  await expect(engine.run([], 1)).rejects.toThrow('加密')
})

it('validates text, filenames and stable edit identities', () => {
  expect(validateTextEdit('你好 PDF', 14, '#123abc')).toBeNull()
  expect(validateTextEdit('', 14, '#123abc')).toBeTruthy()
  expect(validateTextEdit('a\nb', 14, '#123abc')).toBeTruthy()
  expect(validateTextEdit('a', 0, '#123abc')).toBeTruthy()
  expect(validateTextEdit('😀', 14, '#123abc')).toBeTruthy()
  expect(editOutputName('report.PDF')).toBe('report-edited.pdf')
  const edits = updateEdits([], { page: 1, id: 'new-1', kind: 'text', text: 'A' })
  expect(updateEdits(edits, { page: 1, id: 'new-1', kind: 'text', text: 'B' })).toHaveLength(1)
  expect(updateEdits(edits, { page: 1, id: 'new-1', kind: 'delete' })).toEqual([])
  const image = { pixels: new Uint8Array(40), width: 10, height: 1 }
  const imageEdits = [{ page: 1, id: 'new-2', kind: 'image' as const, image }]
  expect(retainedImageBytes([imageEdits, imageEdits, []])).toBe(40)
})
