import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const minimalPdf = Buffer.from(`%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <</Font <</F1 4 0 R>>>> /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
5 0 obj <</Length 45>> stream
BT /F1 24 Tf 72 720 Td (PDF Viewer Test) Tj ET
endstream endobj
trailer <</Root 1 0 R>>
%%EOF`)

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIA6iJZkgAAAABJRU5ErkJggg==',
  'base64',
)

function createTinyWav(durationSeconds = 0.1) {
  const sampleRate = 8000
  const sampleCount = Math.round(sampleRate * durationSeconds)
  const dataSize = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 9000)
    buffer.writeInt16LE(sample, 44 + index * 2)
  }
  return buffer
}

test('home navigation and replacement workflow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /简单高效的文本处理工具/ })).toBeVisible()
  await page.locator('main').getByRole('link', { name: '开始使用' }).click()
  await expect(page).toHaveURL(/\/replace$/)

  await page.getByRole('textbox', { name: '原始文本' }).fill('易联科技与易联科技')
  await page.getByLabel('查找关键词').fill('易联科技')
  await page.getByLabel('替换为').fill('悦联智能')
  await page.getByRole('button', { name: '执行替换' }).click()
  await expect(page.getByRole('textbox', { name: '替换结果' })).toHaveValue('悦联智能与悦联智能')
  await expect(page.getByText('已替换 2 处', { exact: true })).toBeVisible()
})

test('draft persists and clear removes it', async ({ page }) => {
  await page.goto('/replace')
  await page.getByRole('textbox', { name: '原始文本' }).fill('本机草稿')
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.getByRole('textbox', { name: '原始文本' })).toHaveValue('本机草稿')
  await page.getByRole('button', { name: '清空' }).click()
  await page.reload()
  await expect(page.getByRole('textbox', { name: '原始文本' })).toHaveValue('')
})

test('help, changelog and mobile navigation are usable', async ({ page, isMobile }) => {
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: '使用帮助', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '关于作者' })).toBeVisible()
  await expect(page.getByText('YvanLouise')).toBeVisible()
  await page.getByText('替换结果可以编辑吗？').click()
  await expect(page.getByText(/结果区继续修改后复制/)).toBeVisible()
  await page.goto('/changelog')
  await expect(page.getByText('v1.5.0')).toBeVisible()
  await expect(page.getByText('2026-08-14')).toBeVisible()
  await expect(page.getByText('v1.0.0')).toBeVisible()
  await expect(page.getByText('2026-07-23')).toBeVisible()

  if (isMobile) {
    await page.goto('/')
    await page.getByRole('button', { name: '打开导航菜单' }).click()
    const mobileNavigation = page.getByRole('navigation', { name: '移动端导航' })
    await expect(mobileNavigation).toBeVisible()
    await expect(mobileNavigation.getByRole('link', { name: 'Notion 切分' })).toBeVisible()
    await expect.poll(async () => (await mobileNavigation.boundingBox())?.height).toBe(
      page.viewportSize()?.height,
    )
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    await page.getByRole('button', { name: '关闭导航菜单' }).press('Escape')
    await expect(mobileNavigation).toBeHidden()
  }
})

test('features page presents live and planned tools', async ({ page }) => {
  await page.goto('/features')
  await expect(page.getByRole('heading', { name: '功能详情' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '功能中心', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '关键词替换', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '匹配规则' })).toBeVisible()
  await expect(page.getByText('敬请期待', { exact: true })).toHaveCount(3)
  await expect(page.getByRole('link', { name: '文本清理' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '更多功能，敬请期待' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Notion 文本切分' }).click()
  await expect(page.getByRole('heading', { name: 'Notion 文本切分', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '切分能力' })).toBeVisible()
  await expect(page.getByText(/文本仅保存在本机浏览器/)).toBeVisible()

  await page.getByRole('button', { name: 'PDF 查看' }).click()
  await expect(page.getByRole('heading', { name: 'PDF 查看', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '查看能力' })).toBeVisible()

  await page.getByRole('button', { name: '图片格式转换' }).click()
  await expect(page.getByRole('heading', { name: '图片格式转换', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '格式能力' })).toBeVisible()

  await page.getByRole('button', { name: '音频格式转换' }).click()
  await expect(page.getByRole('heading', { name: '音频格式转换', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '音频能力' })).toBeVisible()

  await page.getByRole('button', { name: '音频分割与提取' }).click()
  await expect(page.getByRole('heading', { name: '音频分割与提取', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '分割能力' })).toBeVisible()
})

test('splits, copies, restores and clears a long Notion draft locally', async ({ page, context }) => {
  const externalMutations: string[] = []
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()) && !request.url().startsWith('http://127.0.0.1:4175')) {
      externalMutations.push(request.url())
    }
  })

  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4175',
  })
  await page.goto('/notion-split')
  await expect(page.getByRole('heading', { name: 'Notion 文本切分', level: 1 })).toBeVisible()

  const source = '长段落包含中文、English 和 Emoji 😀，用于验证字符与 UTF-8 字节双重切分。\n\n'.repeat(120)
  await page.getByLabel('每段字符上限').fill('1000')
  await page.getByRole('textbox', { name: '原始文本' }).fill(source)

  const chunks = page.getByLabel('切分片段').locator('article')
  await expect.poll(() => chunks.count()).toBeGreaterThan(1)
  const chunkValues = await page.getByRole('textbox', { name: /第 \d+ 段文本/ }).evaluateAll(
    (elements) => elements.map((element) => (element as HTMLTextAreaElement).value),
  )
  expect(chunkValues.join('')).toBe(source)
  expect(chunkValues.every((value) => Array.from(value).length <= 1000)).toBe(true)
  expect(chunkValues.every((value) => new TextEncoder().encode(value).byteLength <= 400_000)).toBe(true)

  await page.getByRole('button', { name: '复制下一段' }).click()
  await expect(page.getByText('已复制', { exact: true }).first()).toBeVisible()
  await expect.poll(async () => (
    await page.evaluate(() => navigator.clipboard.readText())
  ).replaceAll('\r\n', '\n')).toBe(chunkValues[0].replaceAll('\r\n', '\n'))

  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.getByRole('textbox', { name: '原始文本' })).toHaveValue(source)
  await page.getByRole('button', { name: '清空' }).click()
  await page.reload()
  await expect(page.getByRole('textbox', { name: '原始文本' })).toHaveValue('')

  const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
  expect(bodyWidth).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0)
  expect(externalMutations).toEqual([])
})

test('opens and controls a local PDF from the features page', async ({ page }) => {
  await page.goto('/features')
  await page.getByRole('button', { name: 'PDF 查看' }).click()
  await page.getByRole('link', { name: '打开工具' }).click()
  await expect(page).toHaveURL(/\/pdf$/)
  await page.getByLabel('选择 PDF 文件').setInputFiles({
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer: minimalPdf,
  })

  await expect(page.getByText('sample.pdf')).toBeVisible()
  await expect(page.getByTitle('sample.pdf')).toContainText('1 页')
  const canvas = page.locator('canvas[aria-label="PDF 第 1 页"]')
  await expect(canvas).toBeVisible()
  await expect.poll(async () => Number(await canvas.getAttribute('width'))).toBeGreaterThan(0)

  await page.getByRole('button', { name: '放大' }).click()
  await expect(page.getByText(/%$/)).toBeVisible()
  await page.getByRole('button', { name: '顺时针旋转' }).click()
  await expect(page.getByRole('button', { name: '上一页' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '下一页' })).toBeDisabled()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载原文件' }).click()
  const downloadedFile = await download
  expect(downloadedFile.suggestedFilename()).toBe('sample.pdf')
  await downloadedFile.delete()
  await page.getByRole('button', { name: '关闭 PDF' }).click()
  await expect(page.getByRole('heading', { name: '选择一个 PDF 文件' })).toBeVisible()
})

test('converts a local PNG to ICO and keeps the mobile layout inside the viewport', async ({ page }) => {
  await page.goto('/image-convert')
  await expect(page.getByRole('heading', { name: '图片格式转换', level: 1 })).toBeVisible()
  await page.getByLabel('选择图片文件').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  await expect(page.getByText('1 × 1')).toBeVisible()
  await page.getByRole('button', { name: /ICO/ }).click()
  await page.getByRole('button', { name: /开始转换/ }).click()
  await expect(page.getByText('1 个文件转换完成')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载 pixel.ico' }).click()
  const result = await download
  expect(result.suggestedFilename()).toBe('pixel.ico')
  await result.delete()

  const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
  const viewportWidth = page.viewportSize()?.width ?? 0
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth)
})

test('converts a local WAV to MP3 without uploading audio', async ({ page, isMobile }) => {
  const externalMutations: string[] = []
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) externalMutations.push(request.url())
  })

  await page.goto('/audio-convert')
  await expect(page.getByRole('heading', { name: '音频格式转换', level: 1 })).toBeVisible()
  await page.getByLabel('选择音频文件').setInputFiles({
    name: 'tone.wav',
    mimeType: 'audio/wav',
    buffer: createTinyWav(),
  })
  await expect(page.getByText('等待转换')).toBeVisible()

  const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
  const viewportWidth = page.viewportSize()?.width ?? 0
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth)
  if (isMobile) {
    await page.getByRole('button', { name: '自定义码率' }).click()
    await page.getByRole('button', { name: '编辑 tone.wav 的歌曲信息' }).click()
    await page.getByLabel('歌曲标题').fill('手机端测试')
    const expandedBodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
    expect(expandedBodyWidth).toBeLessThanOrEqual(viewportWidth)
    return
  }

  await page.getByRole('button', { name: '自定义码率' }).click()
  await page.getByLabel('码率数值').fill('160')
  await page.getByRole('button', { name: '编辑 tone.wav 的歌曲信息' }).click()
  await page.getByLabel('歌曲标题').fill('本地测试音频')
  await page.getByRole('textbox', { name: '艺术家', exact: true }).fill('YL TextLab')
  await page.getByRole('button', { name: /开始转换/ }).click()
  await expect(page.getByText('1 个音频转换完成')).toBeVisible({ timeout: 120_000 })

  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载 tone.mp3' }).click()
  const result = await download
  expect(result.suggestedFilename()).toBe('tone.mp3')
  const path = await result.path()
  expect(path).not.toBeNull()
  const output = await readFile(path!)
  const hasId3Header = output.subarray(0, 3).toString('ascii') === 'ID3'
  const hasMp3Frame = output[0] === 0xff && (output[1] & 0xe0) === 0xe0
  expect(hasId3Header || hasMp3Frame).toBe(true)
  await result.delete()

  await page.getByRole('button', { name: /FLAC/ }).click()
  await page.getByRole('button', { name: /开始转换/ }).click()
  await expect(page.getByRole('link', { name: '下载 tone.flac' })).toBeVisible({ timeout: 120_000 })

  await page.getByRole('button', { name: '清空' }).click()
  await page.getByRole('button', { name: /M4A/ }).click()
  await page.getByLabel('选择音频文件').setInputFiles([
    { name: 'one.wav', mimeType: 'audio/wav', buffer: createTinyWav() },
    { name: 'two.wav', mimeType: 'audio/wav', buffer: createTinyWav() },
  ])
  await expect(page.getByText('2 / 20 个文件')).toBeVisible()
  await page.getByRole('button', { name: /开始转换/ }).click()
  await expect(page.getByText('2 个音频转换完成')).toBeVisible({ timeout: 120_000 })
  expect(externalMutations).toEqual([])
})

test('edits local song information without re-encoding audio', async ({ page, isMobile }) => {
  const externalMutations: string[] = []
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) externalMutations.push(request.url())
  })

  await page.goto('/audio-convert')
  await page.getByRole('button', { name: /仅修改信息/ }).click()
  await expect(page.getByText('音频流原样复制')).toBeVisible()
  await page.getByLabel('选择音频文件').setInputFiles({
    name: 'metadata-tone.wav',
    mimeType: 'audio/wav',
    buffer: createTinyWav(),
  })
  await expect(page.getByText('等待转换')).toBeVisible()
  await page.getByLabel('歌曲标题').fill('仅修改歌曲信息')
  await page.getByRole('textbox', { name: '艺术家', exact: true }).fill('YL TextLab')

  const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
  const viewportWidth = page.viewportSize()?.width ?? 0
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth)
  if (isMobile) return

  await page.getByRole('button', { name: /写入歌曲信息/ }).click()
  await expect(page.getByText('1 个音频信息修改完成')).toBeVisible({ timeout: 120_000 })
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载文件' }).click()
  const result = await download
  expect(result.suggestedFilename()).toBe('metadata-tone-已编辑.wav')
  const path = await result.path()
  expect(path).not.toBeNull()
  const output = await readFile(path!)
  expect(output.subarray(0, 4).toString('ascii')).toBe('RIFF')
  expect(output.subarray(8, 12).toString('ascii')).toBe('WAVE')
  await result.delete()
  expect(externalMutations).toEqual([])
})

test('selects and exports a local audio region', async ({ page, isMobile }) => {
  const externalMutations: string[] = []
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) externalMutations.push(request.url())
  })

  await page.goto('/audio-split')
  await expect(page.getByRole('heading', { name: '音频分割与视频音轨提取', level: 1 })).toBeVisible()
  await page.getByLabel('选择要处理的音频或视频文件').setInputFiles({
    name: 'tone.wav',
    mimeType: 'audio/wav',
    buffer: createTinyWav(),
  })
  await expect(page.getByText('tone.wav')).toBeVisible()
  await page.getByLabel('开始时间').fill('00:00.020')
  await page.getByLabel('开始时间').press('Enter')
  await page.getByLabel('结束时间').fill('00:00.080')
  await page.getByLabel('结束时间').press('Enter')
  await expect(page.getByLabel('片段时长')).toHaveValue('00:00.060')

  const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
  const viewportWidth = page.viewportSize()?.width ?? 0
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth)
  if (isMobile) return

  await page.getByRole('button', { name: '导出所选片段' }).click()
  const downloadLink = page.getByRole('link', { name: '下载片段' })
  await expect(downloadLink).toBeVisible({ timeout: 120_000 })
  const download = page.waitForEvent('download')
  await downloadLink.click()
  const result = await download
  const path = await result.path()
  expect(path).not.toBeNull()
  const output = await readFile(path!)
  expect(output.subarray(0, 4).toString('ascii')).toBe('RIFF')
  await result.delete()
  expect(externalMutations).toEqual([])
})

test('extracts a selected audio region from a local video', async ({ page, isMobile }) => {
  test.slow()
  const externalMutations: string[] = []
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) externalMutations.push(request.url())
  })

  await page.goto('/audio-convert')
  await page.getByRole('button', { name: /M4A/ }).click()
  await page.getByLabel('选择音频文件').setInputFiles({
    name: 'source.wav',
    mimeType: 'audio/wav',
    buffer: createTinyWav(1),
  })
  await page.getByRole('button', { name: /开始转换/ }).click()
  const sourceLink = page.getByRole('link', { name: '下载 source.m4a' })
  await expect(sourceLink).toBeVisible({ timeout: 120_000 })
  const sourceDownload = page.waitForEvent('download')
  await sourceLink.click()
  const sourceResult = await sourceDownload
  const sourcePath = await sourceResult.path()
  expect(sourcePath).not.toBeNull()
  const video = await readFile(sourcePath!)
  await sourceResult.delete()

  await page.goto('/audio-split')
  await page.getByLabel('选择要处理的音频或视频文件').setInputFiles({
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    buffer: video,
  })
  await expect(page.getByText('clip.mp4')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText(/视频 · MP4/)).toBeVisible()
  await expect(page.getByLabel('输出格式')).toHaveValue('mp3')
  await expect(page.getByRole('option', { name: '保持原格式' })).toHaveCount(0)

  await page.getByLabel('开始时间').fill('00:00.100')
  await page.getByLabel('开始时间').press('Enter')
  await page.getByLabel('结束时间').fill('00:00.500')
  await page.getByLabel('结束时间').press('Enter')
  await expect(page.getByLabel('片段时长')).toHaveValue('00:00.400')

  const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
  expect(bodyWidth).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0)
  if (isMobile) return

  await page.getByRole('button', { name: '提取所选音频' }).click()
  const downloadLink = page.getByRole('link', { name: '下载片段' })
  await expect(downloadLink).toBeVisible({ timeout: 120_000 })
  const download = page.waitForEvent('download')
  await downloadLink.click()
  const result = await download
  expect(result.suggestedFilename()).toMatch(/\.mp3$/)
  const path = await result.path()
  expect(path).not.toBeNull()
  const output = await readFile(path!)
  const hasId3Header = output.subarray(0, 3).toString('ascii') === 'ID3'
  const hasMp3Frame = output[0] === 0xff && (output[1] & 0xe0) === 0xe0
  expect(hasId3Header || hasMp3Frame).toBe(true)
  await result.delete()
  expect(externalMutations).toEqual([])
})
