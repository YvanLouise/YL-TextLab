import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'
import { encodeBmp } from '../../src/features/image-conversion/codecs'
import { joinBytes, pngChunk } from '../../src/features/image-conversion/lossless'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIA6iJZkgAAAABJRU5ErkJggg==', 'base64')

test('losslessly optimizes transparent PNG and directly downloads identical pixels', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/image-convert')
  await expect(page).toHaveTitle(/YL/)
  const source = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 32
    const context = canvas.getContext('2d')!
    context.fillStyle = '#2080cc'
    context.fillRect(0, 0, 32, 32)
    context.fillStyle = 'rgba(200, 100, 50, 0.5)'
    context.fillRect(32, 0, 32, 16)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  const original = new Uint8Array(source)
  const metadata = pngChunk('tEXt', new TextEncoder().encode(`Comment\0${'removable text '.repeat(100)}`))
  const png = Buffer.from(joinBytes([original.subarray(0, 33), metadata, original.subarray(33)]))
  await page.getByRole('button', { name: '图片压缩' }).click()
  await page.getByLabel('选择图片文件').setInputFiles({ name: 'transparent.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('64 × 32')).toBeVisible()
  await page.getByRole('button', { name: '无损压缩', exact: true }).click()
  await expect(page.getByRole('slider')).toHaveCount(0)
  await expect(page.getByLabel('目标大小（可选）')).toHaveCount(0)
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByText('无损优化 · 原始尺寸与图像数据保留')).toBeVisible()
  const result = await page.getByRole('link', { name: '下载 transparent.png' }).evaluate(async (link, source) => {
    const output = await fetch((link as HTMLAnchorElement).href).then((response) => response.blob())
    const readPixels = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      const result = { width: bitmap.width, height: bitmap.height, pixels: Array.from(context.getImageData(0, 0, bitmap.width, bitmap.height).data) }
      bitmap.close()
      return result
    }
    const before = await readPixels(new Blob([new Uint8Array(source)], { type: 'image/png' }))
    const after = await readPixels(output)
    return { size: output.size, mime: output.type, identical: JSON.stringify(before) === JSON.stringify(after), width: after.width, height: after.height }
  }, Array.from(png))
  expect(result).toMatchObject({ mime: 'image/png', identical: true, width: 64, height: 32 })
  expect(result.size).toBeLessThan(png.length)
  await page.getByRole('button', { name: '对比预览' }).click()
  await page.screenshot({ path: testInfo.outputPath('lossless-light.png'), fullPage: true })
  await page.getByRole('button', { name: '切换为深色主题' }).click()
  await page.waitForTimeout(250)
  await page.screenshot({ path: testInfo.outputPath('lossless-dark.png'), fullPage: true })
  const pendingDownload = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载图片', exact: true }).click()
  const download = await pendingDownload
  expect(download.suggestedFilename()).toBe('transparent.png')
  expect((await readFile(await download.path())).length).toBe(result.size)
  await download.delete()
  expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(errors).toEqual([])
  await page.getByRole('button', { name: '常规压缩', exact: true }).click()
  await expect(page.getByRole('link', { name: '下载图片', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('目标大小（可选）')).toBeVisible()
})

test('losslessly processes JPG and WebP batches without touching encoded images', async ({ page }) => {
  await page.goto('/image-convert')
  const sources = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const context = canvas.getContext('2d')!
    context.fillStyle = '#2080cc'
    context.fillRect(0, 0, 8, 8)
    const results: number[][] = []
    for (const mime of ['image/jpeg', 'image/webp']) {
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), mime, 0.7))
      results.push(Array.from(new Uint8Array(await blob.arrayBuffer())))
    }
    return results
  })
  const jpeg = Buffer.from(sources[0])
  const comment = Buffer.from('remove this comment')
  const jpegWithComment = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([255, 254, 0, comment.length + 2]), comment, jpeg.subarray(2)])
  await page.getByRole('button', { name: '图片压缩' }).click()
  await page.getByRole('button', { name: '无损压缩', exact: true }).click()
  await page.getByLabel('选择图片文件').setInputFiles([
    { name: 'photo.JPEG', mimeType: 'image/jpeg', buffer: jpegWithComment },
    { name: 'web.webp', mimeType: 'image/webp', buffer: Buffer.from(sources[1]) },
    { name: 'photo.JPEG', mimeType: 'image/jpeg', buffer: jpegWithComment },
  ])
  await expect(page.getByText('8 × 8')).toHaveCount(3)
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByText('3 个文件处理完成')).toBeVisible()
  for (const [index, name] of ['photo.JPEG', 'web.webp'].entries()) {
    const bytes = await page.getByRole('link', { name: `下载 ${name}` }).first().evaluate(async (link) =>
      Array.from(new Uint8Array(await fetch((link as HTMLAnchorElement).href).then((response) => response.arrayBuffer()))))
    expect(bytes).toEqual(sources[index])
  }
  await expect(page.getByRole('button', { name: '下载全部 ZIP' })).toBeVisible()
  const pendingDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载全部 ZIP' }).click()
  const download = await pendingDownload
  const entries = unzipSync(await readFile(await download.path()))
  expect(Object.keys(entries)).toEqual(['photo.JPEG', 'web.webp', '2/photo.JPEG'])
  expect(Array.from(entries['photo.JPEG'])).toEqual(sources[0])
  expect(Array.from(entries['2/photo.JPEG'])).toEqual(sources[0])
  await download.delete()
})

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
  await expect(page.getByText(/体积增加|节省|体积未减小/).first()).toBeVisible()
  await page.getByRole('button', { name: '对比预览' }).click()
  await expect(page.getByRole('region', { name: '原图与结果对比' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('image-compression.png'), fullPage: true })
  await page.getByRole('button', { name: '切换为深色主题' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.waitForTimeout(250)
  await page.screenshot({ path: testInfo.outputPath('image-compression-dark.png'), fullPage: true })
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

test('reaches a per-image target by resizing noisy input', async ({ page }) => {
  await page.goto('/image-convert')
  const noisyPng = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext('2d')!
    const image = context.createImageData(512, 512)
    let seed = 17
    for (let pixel = 0; pixel < image.data.length; pixel += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      image.data[pixel] = seed & 255
      image.data[pixel + 1] = (seed >>> 8) & 255
      image.data[pixel + 2] = (seed >>> 16) & 255
      image.data[pixel + 3] = 255
    }
    context.putImageData(image, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG unavailable')), 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }))
  await page.getByRole('button', { name: '图片压缩' }).click()
  await page.getByLabel('选择图片文件').setInputFiles({ name: 'noise.png', mimeType: 'image/png', buffer: noisyPng })
  await expect(page.getByText('512 × 512')).toBeVisible()
  await page.getByRole('button', { name: /转为 WebP/ }).click()
  await page.getByLabel('目标大小（可选）').fill('30')
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByText('1 个文件处理完成')).toBeVisible()
  const output = await page.getByRole('link', { name: '下载 noise-compressed.webp' }).evaluate(async (link) => {
    const blob = await fetch((link as HTMLAnchorElement).href).then((response) => response.blob())
    const bitmap = await createImageBitmap(blob)
    const result = { size: blob.size, width: bitmap.width, height: bitmap.height, mime: blob.type }
    bitmap.close()
    return result
  })
  expect(output.mime).toBe('image/webp')
  expect(output.size).toBeLessThanOrEqual(30 * 1024)
  expect(output.width).toBeLessThan(512)
  expect(output.width).toBeGreaterThanOrEqual(128)
  expect(output.height).toBe(output.width)
  await expect(page.getByText(/已达到目标/).first()).toBeVisible()
})

test('keeps a mixed batch running when original-format compression is unavailable', async ({ page }) => {
  await page.goto('/image-convert')
  await page.getByRole('button', { name: '图片压缩' }).click()
  const bmp = Buffer.from(encodeBmp({ width: 1, height: 1, data: new Uint8ClampedArray([40, 100, 200, 255]) }))
  await page.getByLabel('选择图片文件').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: pixel },
    { name: 'second.bmp', mimeType: 'image/bmp', buffer: bmp },
  ])
  await expect(page.getByText('1 × 1')).toHaveCount(2)
  await expect(page.getByText(/此格式不能保留原格式压缩/)).toBeVisible()
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByText('处理失败')).toBeVisible()
  await expect(page.getByRole('link', { name: '下载 first-compressed.png' })).toBeVisible()
  await page.getByRole('button', { name: /转为 WebP/ }).click()
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByText('2 个文件处理完成')).toBeVisible()
})

test('keeps the tablet layout and controls within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/image-convert')
  await page.getByRole('button', { name: '图片压缩' }).click()
  await page.getByLabel('选择图片文件').setInputFiles({ name: 'tablet.png', mimeType: 'image/png', buffer: pixel })
  await expect(page.getByText('1 × 1')).toBeVisible()
  await page.getByRole('button', { name: /转为 WebP/ }).click()
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByRole('link', { name: '下载图片' })).toBeVisible()
  expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(768)
})
