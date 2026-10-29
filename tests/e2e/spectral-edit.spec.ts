import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const rate = 48000, seconds = 3
function fixture() {
  const samples = Array.from({ length: rate * seconds }, (_, i) => Math.round(32768 * (
    .25 * Math.sin(2 * Math.PI * 440 * i / rate) + .15 * Math.sin(2 * Math.PI * 1760 * i / rate) + .1 * Math.sin(2 * Math.PI * 12000 * i / rate))))
  const bytes = Buffer.alloc(44 + samples.length * 4)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8)
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22)
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 4, 28); bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(samples.length * 4, 40)
  samples.forEach((value, i) => { bytes.writeInt16LE(value, 44 + i * 4); bytes.writeInt16LE(-value, 46 + i * 4) })
  return { bytes, samples }
}
async function upload(page: Page) {
  await page.goto('/audio-midi')
  await page.getByLabel('选择频谱音频文件').setInputFiles({ name: '频谱编辑.wav', mimeType: 'audio/wav', buffer: fixture().bytes })
  await expect(page.getByRole('status')).toContainText('频谱已就绪')
  await page.getByRole('button', { name: '去除频谱', exact: true }).click()
}
async function generate(page: Page) {
  await page.getByRole('button', { name: /^(生成处理音频|重新生成处理音频)$/ }).click()
  await expect(page.getByRole('link', { name: '下载去除后 WAV' })).toBeVisible({ timeout: 60000 })
}
function amplitude(samples: number[], hz: number) {
  let real = 0, imaginary = 0, count = 0
  for (let i = rate * .8; i < rate * 1.2; i++) {
    real += samples[i * 2] * Math.cos(2 * Math.PI * hz * i / rate)
    imaginary += samples[i * 2] * Math.sin(2 * Math.PI * hz * i / rate); count++
  }
  return Math.hypot(real, imaginary) * 2 / count
}

test('draws spectral regions and exports real band removal with native rate, unaffected times and stereo intact', async ({ page }, info) => {
  test.setTimeout(90000)
  const errors: string[] = [], uploads: string[] = [], core: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) uploads.push(request.url())
    if (request.url().includes('ffmpeg-core')) core.push(request.url())
  })
  await upload(page)
  expect(core).toEqual([])
  await page.getByRole('button', { name: '添加音符', exact: true }).click()
  const canvas = page.getByRole('application', { name: '频谱 MIDI 编辑区' })
  await canvas.scrollIntoViewIfNeeded()
  const box = (await canvas.boundingBox())!, scroll = await canvas.evaluate(element => element.parentElement!.parentElement!.scrollTop)
  const y = (hz: number) => box.y + 28 + (108.5 - (69 + 12 * Math.log2(hz / 440))) * 19 - scroll
  await page.mouse.move(box.x + 54 + 50, y(350)); await page.mouse.down()
  await page.mouse.move(box.x + 54 + 150, y(550), { steps: 8 }); await page.mouse.up()
  await expect(page.getByLabel('去除起点')).toHaveValue('0.5')
  await expect(page.getByLabel('去除终点')).toHaveValue('1.5')
  await expect(page.getByLabel('去除最低频率')).toHaveValue('350')
  await expect(page.getByLabel('去除最高频率')).toHaveValue('550')
  const before = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())
  await page.getByRole('button', { name: '撤销去除区域' }).click()
  await expect(page.getByRole('button', { name: '生成处理音频' })).toBeDisabled()
  await page.getByRole('button', { name: '重做去除区域' }).click()
  await generate(page)
  await expect(page.getByLabel('频谱音频版本')).toHaveValue('processed')
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).not.toBe(before)
  await expect(page.getByLabel('选择已有音符')).toContainText('C4')
  await page.getByLabel('试听内容').selectOption('audio')
  await page.getByRole('button', { name: '开始试听', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停试听' })).toBeVisible()
  await page.getByRole('button', { name: '暂停试听' }).click()
  await page.getByLabel('频谱音频版本').selectOption('original')
  await expect(page.getByLabel('试听内容')).toContainText('仅原音频')
  await page.getByLabel('频谱音频版本').selectOption('processed')
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载去除后 WAV' }).click()
  const download = await pending, bytes = await readFile((await download.path())!)
  expect(download.suggestedFilename()).toBe('频谱编辑-spectral-edited.wav')
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
  expect(bytes.readUInt16LE(20)).toBe(3); expect(bytes.readUInt16LE(22)).toBe(2)
  expect(bytes.readUInt32LE(24)).toBe(rate); expect(bytes.readUInt16LE(34)).toBe(32)
  expect(bytes.toString('ascii', 48, 52)).toBe('data')
  const result = Array.from({ length: bytes.readUInt32LE(52) / 4 }, (_, i) => bytes.readFloatLE(56 + i * 4))
  const original = fixture().samples
  expect(result.length).toBe(original.length * 2)
  expect(amplitude(result, 440)).toBeLessThan(.0005)
  expect(amplitude(result, 1760)).toBeCloseTo(.15, 3)
  expect(amplitude(result, 12000)).toBeCloseTo(.1, 3)
  expect(result.every((value, i) => Math.floor(i / 2) >= rate * .5 && Math.floor(i / 2) < rate * 1.5 || value === original[Math.floor(i / 2)] / 32768 * (i % 2 ? -1 : 1))).toBe(true)
  expect(result.every((value, i) => i % 2 || Math.abs(value + result[i + 1]) < 1e-6)).toBe(true)
  await canvas.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('spectral-editor.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('region', { name: '手动频谱去除' }).screenshot({ path: info.outputPath('spectral-panel.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '切换为深色主题' }).click()
  await page.getByRole('region', { name: '手动频谱去除' }).screenshot({ path: info.outputPath('spectral-panel-dark.png'), animations: 'disabled' })
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.getByLabel('选择去除区域').selectOption({ index: 1 })
  await canvas.focus(); await canvas.press('Delete')
  await expect(page.getByRole('link', { name: '下载去除后 WAV' })).toHaveCount(0)
  await canvas.press('Control+z')
  await expect(page.getByLabel('选择去除区域')).toContainText('350–550 Hz')
  expect(errors).toEqual([]); expect(uploads).toEqual([])
  page.once('dialog', dialog => dialog.accept())
  await page.reload()
  await expect(page.getByRole('application')).toHaveCount(0)
})

test('cancels spectral worker processing, retries and rejects frequencies above native Nyquist', async ({ page }) => {
  test.setTimeout(90000)
  await upload(page)
  await page.getByRole('button', { name: '添加去除区域' }).click()
  let requested = false, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/spectral.worker-*.js', async route => { requested = true; await gate; await route.continue().catch(() => undefined) })
  await page.getByRole('button', { name: '生成处理音频' }).click()
  await expect.poll(() => requested, { timeout: 60000 }).toBe(true)
  await page.getByRole('button', { name: '停止频谱处理' }).click()
  release()
  await expect(page.getByRole('status', { name: '频谱去除状态' })).toContainText('已停止')
  await expect(page.getByRole('link', { name: '下载去除后 WAV' })).toHaveCount(0)
  await generate(page)
  await page.getByLabel('去除最高频率').fill('30000')
  await page.getByRole('button', { name: '应用区域修改' }).click()
  await page.getByRole('button', { name: '生成处理音频' }).click()
  await expect(page.getByRole('alert')).toContainText('不能超过 24000 Hz', { timeout: 30000 })
  await expect(page.getByRole('link', { name: '下载去除后 WAV' })).toHaveCount(0)
  await page.getByLabel('去除最高频率').fill('550')
  await page.getByRole('button', { name: '应用区域修改' }).click()
  await generate(page)
})
