import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIA6iJZkgAAAABJRU5ErkJggg==', 'base64')

test('compresses PNG to JPG locally and directly downloads the image', async ({ page }, testInfo) => {
  const uploads: string[] = []
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) uploads.push(request.url())
  })
  await page.goto('/image-convert')
  await page.getByRole('button', { name: '图片压缩' }).click()
  await page.getByLabel('选择图片文件').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: pixel })
  await expect(page.getByText('1 × 1')).toBeVisible()
  await page.getByRole('button', { name: /转为 JPG/ }).click()
  await page.getByLabel('目标大小（可选）').fill('1')
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByText('1 个文件处理完成')).toBeVisible()
  await expect(page.getByText(/体积增加|节省|体积未减小/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('image-compression.png'), fullPage: true })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载图片' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('pixel-compressed.jpg')
  const bytes = await readFile(await download.path())
  expect(bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true)
  await download.delete()
  expect(uploads).toEqual([])

  await page.getByLabel('目标大小（可选）').fill('2')
  await expect(page.getByText('1 / 20 个文件')).toBeVisible()
  await expect(page.getByRole('link', { name: '下载图片' })).toHaveCount(0)
  const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
  expect(bodyWidth).toBeLessThanOrEqual(page.viewportSize()!.width)
})

test('compresses two images and offers ZIP download', async ({ page }) => {
  await page.goto('/image-convert')
  await page.getByRole('button', { name: '图片压缩' }).click()
  const jpeg = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const context = canvas.getContext('2d')!
    context.fillStyle = '#4488cc'
    context.fillRect(0, 0, 2, 2)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('JPEG unavailable')), 'image/jpeg'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }))
  await page.getByLabel('选择图片文件').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: pixel },
    { name: 'second.jpg', mimeType: 'image/jpeg', buffer: jpeg },
  ])
  await expect(page.getByText('2 / 20 个文件')).toBeVisible()
  await page.getByRole('button', { name: /转为 WebP/ }).click()
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByText('2 个文件处理完成')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载全部 ZIP' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('YL-ImageLab-compressed.zip')
  const bytes = await readFile(await download.path())
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
  await download.delete()
})
