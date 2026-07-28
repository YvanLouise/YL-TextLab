import { describe, expect, it } from 'vitest'
import { clampPage, clampScale, describePdfError, isPdfFile, nextRotation } from './viewer'

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
})
