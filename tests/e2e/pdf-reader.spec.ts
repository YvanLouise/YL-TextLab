import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const fixture = (name: string) => resolve('tests/fixtures/pdf', name)
async function openPdf(page: Page, name = 'reader-sample.pdf') {
  await page.goto('/pdf')
  await page.getByLabel('选择 PDF 文件').setInputFiles(fixture(name))
  await expect(page.getByTitle(name, { exact: true })).toBeVisible()
  await expect(page.getByLabel('PDF 第 1 页', { exact: true })).toBeVisible()
}
async function showNavigation(page: Page) {
  const button = page.getByRole('button', { name: '切换页面导航' })
  if (await button.getAttribute('aria-expanded') === 'false') await button.click()
}

test('PDF search, Chinese text layer, outline links and keyboard navigation work locally', async ({ page, context, isMobile }) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4175') && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) requests.push(request.url()) })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openPdf(page)
  await page.getByRole('button', { name: '搜索文档' }).click()
  await page.getByRole('searchbox', { name: '搜索 PDF 文字' }).fill('本地')
  await expect(page.getByText('1 / 2 处', { exact: true })).toBeVisible()
  await expect(page.getByLabel('当前页码')).toHaveValue('3')
  await expect(page.locator('mark').filter({ hasText: '本地' })).toHaveCount(2)
  await page.getByRole('button', { name: '下一个匹配' }).click()
  await expect(page.getByText('2 / 2 处', { exact: true })).toBeVisible()
  if (isMobile) {
    await expect(page.getByLabel('PDF 页面阅读区')).toBeHidden()
    await page.getByRole('button', { name: /收起导航/ }).click()
    await expect(page.getByLabel('PDF 页面阅读区')).toBeVisible()
  }
  await page.getByRole('button', { name: '复制本页文字' }).click()
  await expect(page.getByText('已复制当前页文字。', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('本地阅读，保护文档隐私')
  await showNavigation(page)
  await page.getByRole('tab', { name: '目录', exact: true }).click()
  await page.getByRole('button', { name: 'Landscape page' }).click()
  await expect(page.getByLabel('当前页码')).toHaveValue('2')
  if (isMobile) await expect(page.getByLabel('PDF 页面阅读区')).toBeFocused()
  const layer = page.getByLabel('第 2 页可选择文字', { exact: true })
  await expect(layer).toHaveAttribute('data-main-rotation', '90')
  await page.getByRole('button', { name: '顺时针旋转' }).click()
  await expect(layer).toHaveAttribute('data-main-rotation', '180')
  await page.getByLabel('PDF 页面阅读区').press('End')
  await expect(page.getByLabel('当前页码')).toHaveValue('4')
  await page.getByLabel('PDF 页面阅读区').press('Home')
  await expect(page.getByLabel('当前页码')).toHaveValue('1')
  if (!isMobile) {
    await page.getByRole('button', { name: '全屏阅读' }).click()
    await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible()
    await page.getByRole('button', { name: '退出全屏' }).click()
  }
  const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
  expect(bodyWidth).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('exports real PNG and complete UTF-8 text, while preserving original PDF bytes', async ({ page, context }) => {
  await openPdf(page)
  const textDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出全文 TXT' }).click()
  const text = await textDownload
  expect(text.suggestedFilename()).toBe('reader-sample.txt')
  const contents = await readFile((await text.path())!, 'utf8')
  expect(contents).toContain('本地阅读，保护文档隐私')
  expect(contents).toContain('--- 第 4 页 ---')
  expect(contents).toContain('End of the PDF reader guide')
  await text.delete()
  await page.getByRole('button', { name: '顺时针旋转' }).click()
  const imageDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出本页 PNG' }).click()
  const image = await imageDownload
  expect(image.suggestedFilename()).toBe('reader-sample-page-1.png')
  const bytes = await readFile((await image.path())!)
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(bytes.readUInt32BE(16)).toBe(1584)
  expect(bytes.readUInt32BE(20)).toBe(1224)
  await image.delete()
  const originalDownload = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载原文件' }).click()
  const original = await originalDownload
  expect(await readFile((await original.path())!)).toEqual(await readFile(fixture('reader-sample.pdf')))
  await original.delete()
  const printLink = page.getByRole('link', { name: '系统查看与打印' })
  await expect(printLink).toHaveAttribute('target', '_blank')
  await expect(printLink).toHaveAttribute('href', /^blob:.*#page=1$/)
  expect(context.pages()).toHaveLength(1)
})

test('password cancellation, wrong-password retry and refresh privacy', async ({ page }) => {
  await page.goto('/pdf')
  await page.getByLabel('选择 PDF 文件').setInputFiles(fixture('locked.pdf'))
  await expect(page.getByLabel('PDF 密码')).toBeVisible()
  await page.getByRole('button', { name: '取消打开' }).click()
  await expect(page.getByRole('button', { name: '选择 PDF', exact: true })).toBeEnabled()
  await page.getByLabel('选择 PDF 文件').setInputFiles(fixture('locked.pdf'))
  await page.getByLabel('PDF 密码').fill('incorrect')
  await page.getByRole('button', { name: '解锁并打开' }).click()
  await expect(page.getByRole('alert')).toContainText('密码不正确')
  await page.getByLabel('PDF 密码').fill('yl-demo')
  await page.getByRole('button', { name: '解锁并打开' }).click()
  await expect(page.getByTitle('locked.pdf', { exact: true })).toBeVisible()
  await expect(page.getByLabel('PDF 第 1 页', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '选择一个 PDF 文件' })).toBeVisible()
  await expect(page.getByTitle('locked.pdf', { exact: true })).toHaveCount(0)
})

test('honors permissions, identifies scanned text and retains a document after invalid replacement', async ({ page }) => {
  await openPdf(page, 'restricted.pdf')
  await expect(page.getByText('文档未授权打印')).toBeVisible()
  await expect(page.getByRole('button', { name: '导出全文 TXT' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '复制本页文字' })).toBeDisabled()
  await expect(page.getByRole('link', { name: '下载原文件' })).toBeVisible()
  await openPdf(page, 'scanned.pdf')
  await page.getByRole('button', { name: '导出全文 TXT' }).click()
  await expect(page.getByText(/未发现可提取文字/)).toBeVisible()
  await page.getByLabel('选择 PDF 文件').setInputFiles({ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not pdf') })
  await expect(page.getByRole('alert')).toContainText('文件头不是有效 PDF')
  await expect(page.getByTitle('scanned.pdf', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭 PDF' }).click()
  await page.getByLabel('选择 PDF 文件').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 broken file') })
  await expect(page.getByRole('alert')).toContainText('损坏')
  await page.getByLabel('选择 PDF 文件').setInputFiles({ name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) })
  await expect(page.getByRole('alert')).toContainText('文件为空')
})

test('long PDFs virtualize thumbnails and oversized pages cannot exceed the canvas budget', async ({ page }) => {
  await openPdf(page, 'many-pages.pdf')
  await showNavigation(page)
  expect(await page.getByRole('button', { name: /跳转第 \d+ 页/ }).count()).toBeLessThan(15)
  await page.getByLabel('当前页码').fill('120')
  await page.getByLabel('当前页码').press('Enter')
  await expect(page.getByRole('button', { name: '跳转第 120 页', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '搜索文档' }).click()
  await page.getByRole('searchbox', { name: '搜索 PDF 文字' }).fill('local')
  await expect(page.getByText('1 / 120 处', { exact: true })).toBeVisible()
  await openPdf(page, 'large-page.pdf')
  await page.getByLabel('缩放模式').selectOption('3')
  const canvas = page.getByLabel('PDF 第 1 页', { exact: true })
  await expect(page.getByText(/已限制画布像素/)).toBeVisible()
  const dimensions = await canvas.evaluate((element) => ({ width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height }))
  expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(8_000_000)
  await page.getByLabel('缩放模式').selectOption('fit')
  expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})

test('PDF reading controls stay inside 320px mobile, tablet and desktop widths', async ({ page }) => {
  await openPdf(page)
  for (const width of [320, 390, 768, 1024, 1536]) {
    await page.setViewportSize({ width, height: 844 })
    await page.getByLabel('缩放模式').selectOption('page')
    await expect(page.getByRole('button', { name: '搜索文档' })).toBeVisible()
    expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(width)
  }
})
