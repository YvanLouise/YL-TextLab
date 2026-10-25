import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

function silentWav() {
  const wav = Buffer.alloc(44 + 1600)
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8)
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(1600, 40)
  return wav
}

test('every route renders with the correct title and no runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  for (const [path, title] of [
    ['/', 'YL文件工具箱'], ['/features', '全部功能'], ['/replace', '关键词替换'],
    ['/notion-split', 'Notion 文本切分'], ['/pdf', 'PDF 查看'], ['/image-convert', '图片转换与压缩'],
    ['/audio-convert', '音频格式转换'], ['/audio-split', '音频分割与提取'],
    ['/help', '使用帮助'], ['/changelog', '更新日志'],
  ]) {
    await page.goto(path)
    await expect(page).toHaveTitle(new RegExp(title))
    await expect(page.locator('main h1').first()).toBeVisible()
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    await expect(page.getByText('页面暂时无法打开')).toHaveCount(0)
    expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  }
  await page.goto('/help#%5B')
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(errors).toEqual([])
})

test('tool navigation traps focus, restores the trigger and opens another tool', async ({ page }, testInfo) => {
  await page.goto('/replace')
  const trigger = page.getByRole('button', { name: '打开导航菜单' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '导航菜单' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭导航菜单' })).toBeFocused()
  for (let index = 0; index < 15; index += 1) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await page.screenshot({ path: testInfo.outputPath('navigation.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
  await trigger.click()
  await page.getByRole('navigation', { name: '移动端导航' }).getByRole('link', { name: 'PDF 查看' }).click()
  await expect(page).toHaveURL(/\/pdf$/)
  await expect(page).toHaveTitle(/PDF 查看/)
})

test('audio conversion cancels core loading and can immediately start again', async ({ page }) => {
  let release = () => {}
  let requested = false
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/*ffmpeg-core*.wasm*', async (route) => {
    requested = true
    await gate
    await route.continue().catch(() => undefined)
  })
  await page.goto('/audio-convert')
  await page.getByLabel('选择音频文件').setInputFiles({ name: 'cancel.wav', mimeType: 'audio/wav', buffer: silentWav() })
  await expect(page.getByText('等待转换')).toBeVisible()
  await page.getByRole('button', { name: /开始转换/ }).click()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: '停止转换' }).click()
  await expect(page.getByRole('button', { name: '清空' })).toBeEnabled()
  release()
  await page.getByRole('button', { name: /开始转换/ }).click()
  await expect(page.getByText('1 个音频转换完成')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: '下载 cancel.mp3' })).toHaveAttribute('download', 'cancel.mp3')
})

test('a malformed saved draft does not crash the replacement tool', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('yl-text-tool', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('drafts', 'readwrite')
      transaction.objectStore('drafts').put({ version: 1, source: {}, options: null }, 'keyword-replace')
      transaction.oncomplete = () => { database.close(); resolve() }
    }
  }))
  await page.goto('/replace')
  await expect(page.getByRole('textbox', { name: '原始文本' })).toHaveValue('')
  await expect(page.getByText('页面暂时无法打开')).toHaveCount(0)
  await page.getByRole('textbox', { name: '原始文本' }).fill('safe')
  await page.getByLabel('查找关键词').fill('safe')
  await page.getByLabel('替换为').fill('ready')
  await page.getByRole('button', { name: '执行替换' }).click()
  await expect(page.getByRole('textbox', { name: '替换结果' })).toHaveValue('ready')
})

test('exports and splits stereo Opus without losing its channel count', async ({ page }) => {
  const wav = silentWav()
  wav.writeUInt16LE(2, 22)
  wav.writeUInt32LE(32000, 28)
  wav.writeUInt16LE(4, 32)
  await page.goto('/audio-convert')
  await page.getByLabel('选择音频文件').setInputFiles({ name: 'stereo.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.getByText('等待转换')).toBeVisible()
  await page.getByRole('button', { name: /Opus/ }).click()
  await page.getByRole('button', { name: /开始转换/ }).click()
  await expect(page.getByText('1 个音频转换完成')).toBeVisible({ timeout: 30_000 })
  const downloaded = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载 stereo.opus' }).click()
  const download = await downloaded
  const bytes = await readFile((await download.path())!)
  const header = bytes.indexOf('OpusHead')
  expect(header).toBeGreaterThanOrEqual(0)
  expect(bytes[header + 9]).toBe(2)
  await page.goto('/audio-split')
  await page.getByLabel('选择要处理的音频或视频文件').setInputFiles({ name: 'stereo.opus', mimeType: 'audio/ogg', buffer: bytes })
  await expect(page.getByText('stereo.opus', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '导出所选片段' }).click()
  const result = page.getByRole('link', { name: '下载片段' })
  await expect(result).toBeVisible({ timeout: 30_000 })
  const splitDownload = page.waitForEvent('download')
  await result.click()
  const split = await splitDownload
  const splitBytes = await readFile((await split.path())!)
  const splitHeader = splitBytes.indexOf('OpusHead')
  expect(splitHeader).toBeGreaterThanOrEqual(0)
  expect(splitBytes[splitHeader + 9]).toBe(2)
})
