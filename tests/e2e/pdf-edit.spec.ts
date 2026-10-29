import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function openEditor(page: Page, name = 'reader-sample.pdf') {
  await page.goto('/pdf')
  await page.getByLabel('选择 PDF 文件').setInputFiles(resolve('tests/fixtures/pdf', name))
  await page.getByRole('button', { name: '编辑 PDF 内容' }).click()
  await expect(page.getByRole('heading', { name: '编辑 PDF 内容' })).toBeVisible()
}

test('edits real text, undo/redo and exports a searchable Chinese PDF without uploading', async ({ page }) => {
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4175/')) external.push(request.url()); expect(request.method()).not.toBe('POST') })
  await openEditor(page)
  await page.getByRole('button', { name: '编辑文字：A better way to read PDFs' }).click()
  await page.getByLabel('文字内容').fill('中文内容编辑验证 PDF')
  await page.getByRole('button', { name: '应用文字修改' }).click()
  await expect(page.getByRole('button', { name: '编辑文字：中文内容编辑验证 PDF', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '撤销编辑' }).click()
  await expect(page.getByRole('button', { name: '编辑文字：A better way to read PDFs' })).toBeVisible()
  await page.getByRole('button', { name: '重做编辑' }).click()
  await expect(page.getByRole('button', { name: '编辑文字：中文内容编辑验证 PDF', exact: true })).toBeVisible()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '另存为 PDF' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('reader-sample-edited.pdf')
  const path = (await download.path())!
  expect((await readFile(path)).subarray(0, 5).toString()).toBe('%PDF-')
  await page.getByRole('button', { name: '返回阅读' }).click()
  const originalEvent = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载原文件' }).click()
  expect(await readFile((await (await originalEvent).path())!)).toEqual(await readFile(resolve('tests/fixtures/pdf/reader-sample.pdf')))
  await page.getByLabel('选择 PDF 文件').setInputFiles({ name: 'edited.pdf', mimeType: 'application/pdf', buffer: await readFile(path) })
  await expect(page.getByLabel('第 1 页可选择文字', { exact: true })).toContainText('中文内容编辑验证 PDF')
  await expect(page.getByLabel('第 1 页可选择文字', { exact: true })).not.toContainText('A better way to read PDFs')
  expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(errors).toEqual([]); expect(external).toEqual([])
})

test('adds text and an image on a rotated page, deletes and restores image', async ({ page }) => {
  await openEditor(page)
  await page.getByRole('button', { name: '编辑下一页' }).click()
  await expect(page.getByText('第 2 / 4 页', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '新增文字', exact: true }).click()
  await page.getByLabel('文字内容').fill('Rotated page edit')
  await page.getByRole('button', { name: '添加到页面' }).click()
  await expect(page.getByRole('button', { name: '编辑文字：Rotated page edit', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '插入图片', exact: true }).click()
  await page.getByLabel('插入图片文件').setInputFiles(resolve('public/assets/hero-replace.png'))
  await expect(page.getByRole('button', { name: '添加到页面' })).toBeEnabled()
  await page.getByLabel('距顶（%）').fill('60')
  await page.getByRole('button', { name: '添加到页面' }).click()
  await expect(page.getByRole('button', { name: /选择图片对象 new-/ })).toBeVisible()
  await page.getByRole('button', { name: '删除对象' }).click()
  await expect(page.getByRole('button', { name: /选择图片对象 new-/ })).toHaveCount(0)
  await page.getByRole('button', { name: '撤销编辑' }).click()
  await expect(page.getByRole('button', { name: /选择图片对象 new-/ })).toBeVisible()
  expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})

test('explains encrypted and scanned content limits, and confirms unsaved changes', async ({ page }) => {
  await openEditor(page, 'restricted.pdf')
  await expect(page.getByRole('alert')).toContainText('加密 PDF')
  await page.getByRole('button', { name: '返回阅读' }).click()
  await expect(page.getByLabel('PDF 查看器', { exact: true })).toBeVisible()
  await page.getByLabel('选择 PDF 文件').setInputFiles(resolve('tests/fixtures/pdf/scanned.pdf'))
  await page.getByRole('button', { name: '编辑 PDF 内容' }).click()
  await expect(page.getByText(/本页没有可编辑的独立文字/)).toBeVisible()
  await page.getByRole('button', { name: '新增文字', exact: true }).click()
  await page.getByLabel('文字内容').fill('Unsaved edit')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: '返回阅读' }).click()
  await expect(page.getByLabel('文字内容')).toHaveValue('Unsaved edit')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '返回阅读' }).click()
  await expect(page.getByLabel('PDF 查看器', { exact: true })).toBeVisible()
})
