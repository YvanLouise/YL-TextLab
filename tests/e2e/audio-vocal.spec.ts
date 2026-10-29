import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const rate = 16000, seconds = 3
function fixture(channels = 2, antiphase = true) {
  const samples = Array.from({ length: rate * seconds * channels }, (_, i) => {
    const t = Math.floor(i / channels) / rate
    const lead = .3 * Math.sin(2 * Math.PI * 220 * t) + .12 * Math.sin(2 * Math.PI * 440 * t) + .06 * Math.sin(2 * Math.PI * 660 * t)
    const sample = lead + .04 * Math.sin(2 * Math.PI * 330 * t)
    return Math.round(32768 * (channels === 1 || i % 2 === 0 ? sample : antiphase ? -sample : .2 * Math.sin(2 * Math.PI * 550 * t)))
  })
  const bytes = Buffer.alloc(44 + samples.length * 2)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8)
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(channels, 22)
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * channels * 2, 28); bytes.writeUInt16LE(channels * 2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((value, i) => bytes.writeInt16LE(value, 44 + i * 2))
  return { bytes, samples }
}
async function upload(page: Page, channels = 2, antiphase = true) {
  await page.getByLabel('选择已分离的人声音频').setInputFiles({ name: '人声.wav', mimeType: 'audio/wav', buffer: fixture(channels, antiphase).bytes })
  await expect(page.getByRole('status')).toContainText('人声音轨已就绪')
}
async function generate(page: Page, preview = false, bypass = false) {
  await page.getByRole('button', { name: preview ? '净化 20 秒试听' : '净化整段并导出', exact: true }).click()
  await expect(page.getByRole('link', { name: bypass ? '下载原声对照 WAV' : preview ? '下载净化试听片段' : '下载净化人声 WAV', exact: true })).toBeVisible({ timeout: 60000 })
}
async function downloadWave(page: Page, name: string) {
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name, exact: true }).click()
  const download = await pending, bytes = await readFile((await download.path())!)
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
  expect(bytes.readUInt16LE(20)).toBe(3); expect(bytes.readUInt16LE(34)).toBe(32)
  expect(bytes.readUInt32LE(24)).toBe(rate)
  expect(bytes.toString('ascii', 48, 52)).toBe('data')
  return { filename: download.suggestedFilename(), channels: bytes.readUInt16LE(22),
    samples: Array.from({ length: bytes.readUInt32LE(52) / 4 }, (_, i) => bytes.readFloatLE(56 + i * 4)) }
}
function amplitude(samples: number[], hz: number, channels: number) {
  let real = 0, imaginary = 0, count = 0
  for (let i = rate * .25; i < rate * .75; i++) {
    real += samples[i * channels] * Math.cos(2 * Math.PI * hz * i / rate)
    imaginary += samples[i * channels] * Math.sin(2 * Math.PI * hz * i / rate); count++
  }
  return Math.hypot(real, imaginary) * 2 / count
}

test('cleans a real decoded vocal fixture, previews the selected time and exports both full-resolution signals', async ({ page }, info) => {
  test.setTimeout(120000)
  const errors: string[] = [], uploads: string[] = [], core: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) uploads.push(request.url())
    if (/ffmpeg-core|\.wasm/.test(request.url())) core.push(request.url())
  })
  await page.goto('/')
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: '主唱净化', exact: true }) }).getByRole('link', { name: '立即使用' }).click()
  await expect(page).toHaveURL(/\/audio-vocal$/)
  await expect(page).toHaveTitle(/主唱净化/)
  await expect(page.getByRole('heading', { name: '主唱净化', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^自然保留/ })).toHaveAttribute('aria-pressed', 'true')
  await upload(page)
  expect(core).toEqual([])
  await page.getByLabel('试听开始位置（秒）').fill('1')
  await generate(page, true)
  const preview = await downloadWave(page, '下载净化试听片段')
  const removed = await downloadWave(page, '下载被削弱部分')
  expect(preview.filename).toBe('人声-主唱净化-试听.wav')
  expect(preview.channels).toBe(2); expect(preview.samples).toHaveLength(rate * 2 * 2)
  expect(amplitude(preview.samples, 220, 2)).toBeGreaterThan(.285)
  expect(amplitude(preview.samples, 440, 2)).toBeGreaterThan(.112)
  expect(amplitude(preview.samples, 330, 2)).toBeLessThan(.023)
  const original = fixture().samples.slice(rate * 2)
  expect(preview.samples.every((value, i) => Math.abs(value + removed.samples[i] - original[i] / 32768) < 1e-7)).toBe(true)
  expect(preview.samples.every((value, i) => i % 2 || Math.abs(value + preview.samples[i + 1]) < 1e-7)).toBe(true)
  const cleanAudio = page.getByLabel('净化结果试听'), originalAudio = page.getByLabel('原人声试听')
  await expect.poll(() => cleanAudio.evaluate((audio: HTMLAudioElement) => audio.readyState)).toBeGreaterThanOrEqual(1)
  await cleanAudio.evaluate((audio: HTMLAudioElement) => { audio.currentTime = .5 })
  await page.getByRole('button', { name: '同位置听原声' }).click()
  await expect.poll(() => originalAudio.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThanOrEqual(1.5)
  await page.getByRole('button', { name: '同位置听净化' }).click()
  await expect.poll(() => cleanAudio.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false)
  expect(await originalAudio.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true)
  await cleanAudio.evaluate((audio: HTMLAudioElement) => { audio.pause() })
  await originalAudio.evaluate((audio: HTMLAudioElement) => { audio.currentTime = 3 })
  await page.getByRole('button', { name: '同位置听净化' }).click()
  await expect.poll(() => cleanAudio.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false)
  expect(await cleanAudio.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeLessThan(1)
  await page.getByRole('button', { name: /^自然保留/ }).click()
  await expect(page.getByRole('link', { name: '下载净化试听片段' })).toBeVisible()
  await page.getByLabel('试听开始位置（秒）').fill('0.5')
  await expect(page.getByRole('link', { name: '下载净化试听片段' })).toHaveCount(0)
  await generate(page)
  const full = await downloadWave(page, '下载净化人声 WAV')
  expect(full.filename).toBe('人声-主唱净化.wav'); expect(full.samples).toHaveLength(rate * seconds * 2)
  await page.screenshot({ path: info.outputPath('vocal-result.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: '切换为深色主题' }).click()
  await page.getByRole('region', { name: '对照试听与导出' }).screenshot({ path: info.outputPath('vocal-result-dark.png'), animations: 'disabled' })
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(width)
  }
  await page.getByLabel('主唱音域').selectOption('low')
  await expect(page.getByRole('link', { name: '下载净化人声 WAV' })).toHaveCount(0)
  expect(errors).toEqual([]); expect(uploads).toEqual([])
  expect(core.length).toBeGreaterThan(0)
})

test('cancels the actual processing worker, retries and recovers from unsupported channel or preview time', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/audio-vocal'); await upload(page, 1)
  let requested = false, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/vocal.worker-*.js', async route => { requested = true; await gate; await route.continue().catch(() => undefined) })
  await page.getByRole('button', { name: '净化整段并导出' }).click()
  await expect.poll(() => requested, { timeout: 60000 }).toBe(true)
  await page.getByRole('button', { name: '停止净化' }).click(); release()
  await expect(page.getByRole('status')).toContainText('已停止')
  await expect(page.getByRole('link', { name: '下载净化人声 WAV' })).toHaveCount(0)
  await generate(page)
  await page.getByLabel('输入声道').selectOption('right')
  await page.getByRole('button', { name: '净化整段并导出' }).click()
  await expect(page.getByRole('alert')).toContainText('没有独立的右声道', { timeout: 30000 })
  await page.getByLabel('输入声道').selectOption('original')
  await page.getByLabel('试听开始位置（秒）').fill('3')
  await page.getByRole('button', { name: '净化 20 秒试听' }).click()
  await expect(page.getByRole('alert')).toContainText('须小于音频总时长', { timeout: 30000 })
  await page.getByLabel('试听开始位置（秒）').fill('0')
  await generate(page, true)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('extracts the chosen channel and mixes the center without changing the original sampling rate', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/audio-vocal'); await upload(page, 2, false)
  const strength = page.getByRole('slider', { name: /次要声音抑制/ })
  await strength.focus(); await strength.press('Home')
  await expect(strength).toHaveValue('0')
  const source = fixture(2, false).samples
  for (const channel of ['left', 'right', 'center']) {
    await page.getByLabel('输入声道').selectOption(channel)
    await generate(page, false, true)
    await expect(page.getByText('未启用（0%）', { exact: true })).toBeVisible()
    const wave = await downloadWave(page, '下载原声对照 WAV')
    expect(wave.filename).toBe('人声-原声对照.wav')
    expect(wave.channels).toBe(1); expect(wave.samples).toHaveLength(rate * seconds)
    const maximumError = wave.samples.reduce((maximum, value, i) => {
      const left = source[i * 2] / 32768, right = source[i * 2 + 1] / 32768
      return Math.max(maximum, Math.abs(value - (channel === 'left' ? left : channel === 'right' ? right : (left + right) / 2)))
    }, 0)
    expect(maximumError, `${channel} maximum sample error`).toBeLessThan(1e-7)
  }
})
