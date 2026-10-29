import { describe, expect, it } from 'vitest'
import { clampPage, clampScale, describePdfError, getRasterSize, getViewScale, hasPdfHeader, isPdfFile, MAX_CANVAS_PIXELS, MAX_PDF_BYTES, nextRotation, normalizeRotation, pdfOutputName, safePdfUrl, validatePdfFile } from './viewer'

describe('PDF viewer helpers', () => {
  it('accepts PDF files and rejects other files', () => {
    expect(isPdfFile({ name: 'report.pdf', type: 'application/pdf' })).toBe(true)
    expect(isPdfFile({ name: 'REPORT.PDF', type: '' })).toBe(true)
    expect(isPdfFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false)
    expect(isPdfFile({ name: 'fake.pdf', type: 'text/plain' })).toBe(false)
  })

  it('keeps pages and scales inside supported ranges', () => {
    expect(clampPage(0, 8)).toBe(1)
    expect(clampPage(4.6, 8)).toBe(5)
    expect(clampPage(99, 8)).toBe(8)
    expect(clampScale(0)).toBe(0.25)
    expect(clampScale(10)).toBe(3)
  })

  it('rotates clockwise and maps known PDF errors', () => {
    expect(nextRotation(270)).toBe(0)
    expect(describePdfError(Object.assign(new Error(), { name: 'PasswordException' }))).toContain('密码')
    expect(describePdfError(Object.assign(new Error(), { name: 'InvalidPDFException' }))).toContain('损坏')
  })

  it('validates file size, empty files and real headers before parsing', () => {
    const file = { name: 'read.pdf', type: 'application/pdf', size: 100 }
    expect(validatePdfFile(file)).toBeNull()
    expect(validatePdfFile({ ...file, size: 0 })).toContain('为空')
    expect(validatePdfFile({ ...file, size: MAX_PDF_BYTES + 1 })).toContain('100 MB')
    expect(hasPdfHeader(new TextEncoder().encode('%PDF-1.7').buffer)).toBe(true)
    expect(hasPdfHeader(new TextEncoder().encode('not PDF').buffer)).toBe(false)
    expect(isPdfFile({ name: 'read.pdf', type: 'application/octet-stream' })).toBe(true)
  })

  it('fits oversized pages below the manual minimum and limits canvas allocation', () => {
    expect(getViewScale(20000, 20000, 400, 600, 'fit', 1)).toBeLessThan(0.25)
    expect(getViewScale(600, 800, 632, 432, 'page', 1)).toBe(0.5)
    expect(getViewScale(600, 800, 632, 432, 'custom', 9)).toBe(3)
    const raster = getRasterSize(60000, 60000, 2)
    expect(raster.width * raster.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS)
    expect(raster.width).toBeLessThanOrEqual(8192)
    expect(() => getRasterSize(0, 100)).toThrow()
    expect(clampScale(NaN)).toBe(1)
    expect(normalizeRotation(-90)).toBe(270)
  })

  it('uses safe output names and rejects executable or file links', () => {
    expect(pdfOutputName('notes.PDF', '-page-2.png')).toBe('notes-page-2.png')
    expect(pdfOutputName('../notes.pdf', '.txt')).toBe('.._notes.txt')
    expect(safePdfUrl('javascript:alert(1)')).toBeNull()
    expect(safePdfUrl('file:///C:/notes.txt')).toBeNull()
    expect(safePdfUrl('https://example.com')).toBe('https://example.com/')
  })
})
