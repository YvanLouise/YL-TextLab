import type { PDFDocumentProxy } from 'pdfjs-dist'
import { safePdfUrl } from './viewer'

export interface PdfOutlineEntry { title: string; destination: unknown; url: string | null; depth: number }
interface OutlineNode { title?: string; dest?: unknown; url?: unknown; items?: OutlineNode[] }
export function flattenPdfOutline(nodes: OutlineNode[]): PdfOutlineEntry[] {
  const result: PdfOutlineEntry[] = []
  const visit = (items: OutlineNode[], depth: number) => {
    for (const item of items) {
      if (result.length >= 2000) return
      result.push({ title: String(item.title || '未命名章节'), destination: item.dest, url: safePdfUrl(item.url), depth })
      if (depth < 12 && Array.isArray(item.items)) visit(item.items, depth + 1)
    }
  }
  visit(nodes, 0)
  return result
}

export async function resolvePdfDestination(pdf: PDFDocumentProxy, destination: unknown): Promise<number | null> {
  const resolved = typeof destination === 'string' ? await pdf.getDestination(destination) : destination
  if (!Array.isArray(resolved) || !resolved.length) return null
  const reference: unknown = resolved[0]
  let index: number
  if (typeof reference === 'number' && Number.isInteger(reference)) index = reference
  else if (reference && typeof reference === 'object' && 'num' in reference && 'gen' in reference && typeof reference.num === 'number' && typeof reference.gen === 'number') index = await pdf.getPageIndex({ num: reference.num, gen: reference.gen })
  else return null
  return index >= 0 && index < pdf.numPages ? index + 1 : null
}

export function getPdfPermissions(flags: Iterable<number> | null) {
  // High-quality printing (2048) only qualifies an existing print permission (4).
  const permissions = flags === null ? null : new Set(flags)
  return { canCopy: permissions === null || permissions.has(16), canPrint: permissions === null || permissions.has(4) }
}

export function getPdfInfoRows(info: Record<string, unknown>): { label: string; value: string }[] {
  const fields = { Title: '标题', Author: '作者', Subject: '主题', Creator: '创建程序', Producer: '生成程序', PDFFormatVersion: 'PDF 版本' }
  return Object.entries(fields).flatMap(([key, label]) => typeof info[key] === 'string' && info[key] ? [{ label, value: info[key] as string }] : [])
}
