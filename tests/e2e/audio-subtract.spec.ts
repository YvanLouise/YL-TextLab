import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

function wav(samples: number[], channels = 2, rate = 16000) {
  const bytes = Buffer.alloc(44 + samples.length * 2)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8)
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * channels * 2, 28)
  bytes.writeUInt16LE(channels * 2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((value, index) => bytes.writeInt16LE(value, 44 + index * 2))
  return bytes
}

function noise(length: number, seed: number, amplitude = 16000) {
  return Array.from({ length }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return Math.round((seed / 4294967296 - .5) * amplitude / 4) * 4
  })
}
function residualError(output: number[], expected: number[]) {
  return Math.sqrt(output.reduce((sum, value, i) => sum + (value - expected[i] / 32768) ** 2, 0) / output.length)
}

async function upload(page: Page, slot: 'A' | 'B', buffer: Buffer, name = `${slot}.wav`) {
  await page.getByLabel(`选择音频 ${slot} 文件`).setInputFiles({ name, mimeType: 'audio/wav', buffer })
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

async function generate(page: Page) {
  await page.getByRole('button', { name: '生成音频 C', exact: true }).click()
  await expect(page.getByRole('link', { name: '下载音频 C', exact: true })).toBeVisible({ timeout: 60_000 })
}

async function downloadSamples(page: Page, name: string) {
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载音频 C', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe(name)
  const bytes = await readFile((await download.path())!)
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
  expect(bytes.toString('ascii', 8, 12)).toBe('WAVE')
  let rate = 0
  let channels = 0
  let data = Buffer.alloc(0)
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(at + 4)
    const id = bytes.toString('ascii', at, at + 4)
    if (id === 'fmt ') {
      const format = bytes.readUInt16LE(at + 8)
      expect(format === 3 || (format === 0xfffe && bytes.readUInt16LE(at + 32) === 3)).toBe(true)
      expect(bytes.readUInt16LE(at + 22)).toBe(32)
      channels = bytes.readUInt16LE(at + 10)
      rate = bytes.readUInt32LE(at + 12)
    }
    if (id === 'data') data = bytes.subarray(at + 8, at + 8 + size)
    at += 8 + size + size % 2
  }
  expect(data.length).toBeGreaterThan(0)
  return { rate, channels, samples: Array.from({ length: data.length / 4 }, (_, index) => data.readFloatLE(index * 4)) }
}

test('recovers C from A = B + C, previews and directly downloads exact floating-point samples', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  const mutations: string[] = []
  const coreRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url())
    if (request.url().includes('ffmpeg-core')) coreRequests.push(request.url())
  })
  await page.goto('/')
  await page.locator('article').filter({ has: page.getByRole('heading', { name: '音频相减', exact: true }) }).getByRole('link', { name: /立即使用/ }).click()
  await expect(page).toHaveURL(/\/audio-subtract$/)
  await expect(page).toHaveTitle('音频相减 · YL文件工具箱')
  expect(coreRequests).toEqual([])
  const common = Array.from({ length: 64000 }, (_, i) => Math.round(8000 * Math.sin(Math.floor(i / 2) * (i % 2 ? .07 : .11))))
  const target = common.map((_, i) => Math.round(3000 * Math.sin(i * .043)))
  const combined = wav(target.map((value, i) => value + common[i]))
  await upload(page, 'A', combined, '人声与伴奏.wav')
  await upload(page, 'B', wav(common), '伴奏.wav')
  await expect(page.getByText(/正在本机核对/)).toHaveCount(0)
  await expect(page.getByText(/A、B 的文件内容完全相同/)).toHaveCount(0)
  expect(coreRequests).toEqual([])
  await page.getByLabel('输出文件名').fill('保留的声音.wav')
  await generate(page)
  await expect(page.getByRole('region', { name: '全段音量对照' })).toBeVisible()
  const output = await downloadSamples(page, '保留的声音.wav')
  expect(output.rate).toBe(16000)
  expect(output.channels).toBe(2)
  expect(output.samples.length).toBe(target.length)
  expect(output.samples.every((sample, i) => sample === target[i] / 32768)).toBe(true)
  const preview = page.getByLabel('音频 C 试听')
  await expect.poll(() => preview.evaluate((audio: HTMLAudioElement) => audio.readyState)).toBeGreaterThanOrEqual(2)
  expect(await preview.evaluate((audio: HTMLAudioElement) => audio.duration)).toBeCloseTo(2, 3)
  expect(await preview.evaluate(async (audio: HTMLAudioElement) => (await fetch(audio.src)).headers.get('content-type'))).toBe('audio/wav')
  await preview.evaluate((audio: HTMLAudioElement) => audio.play())
  await expect.poll(() => preview.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false)
  await preview.evaluate((audio: HTMLAudioElement) => audio.pause())
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.screenshot({ path: testInfo.outputPath('audio-subtract-result.png'), fullPage: true })
  await page.getByLabel('B 的音量比例').fill('50')
  await expect(page.getByRole('link', { name: '下载音频 C' })).toHaveCount(0)
  await page.getByRole('button', { name: '恢复默认设置' }).click()
  await upload(page, 'B', combined, '完全相同.wav')
  await expect(page.getByText(/A、B 的文件内容完全相同/)).toBeVisible()
  await expect(page.getByRole('button', { name: '生成音频 C' })).toBeEnabled()
  await generate(page)
  await expect(page.getByText(/结果为静音或接近静音/)).toBeVisible()
  expect((await downloadSamples(page, '人声与伴奏_minus_完全相同.wav')).samples.every(sample => sample === 0)).toBe(true)
  await page.getByLabel('选择音频 B 文件').setInputFiles({ name: '人声与伴奏.wav', mimeType: 'audio/wav', buffer: wav(common) })
  await expect(page.getByText('人声与伴奏.wav', { exact: true })).toHaveCount(2)
  await expect(page.getByText(/正在本机核对/)).toHaveCount(0)
  await expect(page.getByText(/A、B 的文件内容完全相同/)).toHaveCount(0)
  expect(mutations).toEqual([])
  expect(errors).toEqual([])
  await page.reload()
  await expect(page.getByRole('button', { name: '生成音频 C' })).toBeDisabled()
  await expect(page.getByLabel('音频 A 试听')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '下载音频 C' })).toHaveCount(0)
})

test('protects unmatched regions and provides accurate whole-track inspection on desktop and mobile', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const errors: string[] = [], uploads: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) uploads.push(request.url()) })
  await page.goto('/audio-subtract')
  const rate = 8000, common = noise(rate * 4, 193, 12000), solo = noise(rate * 4, 91, 12000), target = noise(rate * 4, 83, 800)
  const b = common.map((v, i) => i >= rate && i < rate * 2 ? 0 : v)
  const a = common.map((v, i) => i < rate ? 0 : i < rate * 2 ? solo[i] : i < rate * 3 ? v + target[i] : -v)
  await upload(page, 'A', wav(a, 1, rate))
  await upload(page, 'B', wav(b, 1, rate))
  await page.getByLabel('处理模式').selectOption('protected')
  await expect(page.getByLabel('输出防削波')).not.toBeChecked()
  await expect(page.getByLabel('输出防削波')).toBeDisabled()
  await generate(page)
  await expect(page.getByRole('region', { name: '保护模式结果' })).toContainText('20 / 80')
  const output = await downloadSamples(page, 'A_minus_B.wav')
  expect(output.samples.length).toBe(a.length)
  expect(output.samples.every((v, i) => i >= rate * 2 && i < rate * 3 || v === a[i] / 32768)).toBe(true)
  expect(output.samples.slice(rate * 2 + 40, rate * 3 - 40).every((v, i) => v === target[i + rate * 2 + 40] / 32768)).toBe(true)
  const chart = page.getByRole('region', { name: '全段音量对照' })
  await expect(chart).toBeVisible()
  await expect(chart.getByRole('img')).toHaveCount(3)
  await page.getByLabel('音量显示指标').selectOption('peak')
  const position = page.getByRole('slider', { name: '音量对照位置' })
  await position.focus()
  await page.keyboard.press('ArrowRight')
  await expect(position).toHaveValue('1')
  await expect.poll(() => page.getByLabel('音频 A 试听').evaluate((audio: HTMLAudioElement) => audio.readyState)).toBeGreaterThan(0)
  await expect.poll(() => page.getByLabel('音频 C 试听').evaluate((audio: HTMLAudioElement) => audio.readyState)).toBeGreaterThan(0)
  await chart.getByRole('button', { name: '将 A / C 试听定位到此处' }).click()
  expect(await page.getByLabel('音频 A 试听').evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeCloseTo(.05, 3)
  expect(await page.getByLabel('音频 C 试听').evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeCloseTo(.05, 3)
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await chart.screenshot({ path: testInfo.outputPath('protected-levels.png') })
  await page.getByRole('button', { name: '切换为深色主题' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await chart.screenshot({ path: testInfo.outputPath('protected-levels-dark.png') })
  await page.getByLabel('处理模式').selectOption('strict')
  await expect(chart).toHaveCount(0)
  await generate(page)
  const strict = await downloadSamples(page, 'A_minus_B.wav')
  expect(strict.samples.slice(0, rate).every((v, i) => v === -b[i] / 32768)).toBe(true)
  await expect(page.getByText(/严格相减会留下反相的 B/)).toBeVisible()
  expect(uploads).toEqual([])
  expect(errors).toEqual([])
})

test('distinguishes clipping protection from cancellation using exact output samples and before/after curves', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.goto('/audio-subtract')
  const rate = 8000, a = Array.from({ length: rate * 2 }, (_, i) => i < rate ? 30000 : 10000)
  const b = Array.from({ length: rate * 2 }, (_, i) => i < rate ? -30000 : 0)
  await upload(page, 'A', wav(a, 1, rate))
  await upload(page, 'B', wav(b, 1, rate))
  await generate(page)
  const chart = page.getByRole('region', { name: '全段音量对照' })
  await expect(chart).toBeVisible()
  await expect(chart.getByRole('img')).toHaveCount(4)
  await expect(chart).toContainText('包括 B 静音的位置')
  const position = page.getByRole('slider', { name: '音量对照位置' })
  await position.focus()
  await page.keyboard.press('End')
  await expect(chart).toContainText('变化来自防削波的整体降音量')
  const protectedOutput = await downloadSamples(page, 'A_minus_B.wav')
  expect(protectedOutput.samples[rate]).toBeCloseTo(.999 / 6, 6)
  expect(protectedOutput.samples[0]).toBeCloseTo(.999, 6)
  await chart.screenshot({ path: testInfo.outputPath('clipping-levels.png') })
  await page.getByLabel('输出防削波').uncheck()
  await expect(chart).toHaveCount(0)
  await generate(page)
  await expect(chart.getByRole('img')).toHaveCount(3)
  const raw = await downloadSamples(page, 'A_minus_B.wav')
  expect(raw.samples[rate]).toBe(10000 / 32768)
  expect(raw.samples[0]).toBe(60000 / 32768)
})

test('cancels initial engine loading, rejects channel mismatch, then retries with sample alignment', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/audio-subtract')
  const early = [1000, -2000, 3000, 0, 0, 0]
  const late = [0, 1000, -2000, 3000, 0, 0]
  await upload(page, 'A', wav(late, 1, 8000))
  await upload(page, 'B', wav(early, 2, 8000))
  let release!: () => void
  let requested = false
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*ffmpeg-core*.wasm*', async route => { requested = true; await gate; await route.continue().catch(() => undefined) })
  await page.getByRole('button', { name: '生成音频 C' }).click()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: '停止处理' }).click()
  await expect(page.getByRole('status')).toContainText('处理已停止')
  release()
  await page.getByRole('button', { name: '生成音频 C' }).click()
  await expect(page.getByRole('alert')).toContainText('声道数不同', { timeout: 60_000 })
  await expect(page.getByRole('link', { name: '下载音频 C' })).toHaveCount(0)
  await upload(page, 'B', wav(early, 1, 8000))
  await page.getByLabel('B 的时间偏移').fill('0.125')
  await generate(page)
  await expect(page.getByText(/实际偏移 1 个采样点/)).toBeVisible()
  const aligned = await downloadSamples(page, 'A_minus_B.wav')
  expect(aligned.samples).toHaveLength(6)
  expect(aligned.samples.every(sample => sample === 0)).toBe(true)
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await expect(page.getByLabel('音频 A 试听')).toHaveCount(0)
  await expect(page.getByLabel('音频 B 试听')).toHaveCount(0)
})

test('opens from the feature center and mobile menu, with dark and tablet layouts', async ({ page, isMobile }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('yl-text-tool:theme', 'dark'))
  await page.goto('/features')
  await page.getByRole('button', { name: '音频相减', exact: true }).click()
  await page.getByRole('link', { name: '选择两段音频', exact: true }).click()
  await expect(page.getByRole('heading', { name: '音频相减', exact: true })).toBeVisible()
  await page.getByLabel('自动匹配相似波形').check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.screenshot({ path: testInfo.outputPath('audio-subtract-dark.png'), fullPage: true })
  if (isMobile) {
    await page.goto('/')
    await page.getByRole('button', { name: '打开导航菜单' }).click()
    await page.getByRole('dialog').getByRole('link', { name: '音频相减', exact: true }).click()
    await expect(page).toHaveURL(/\/audio-subtract$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } else {
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1024 })
      expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(width)
    }
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.screenshot({ path: testInfo.outputPath('audio-subtract-tablet.png'), fullPage: true })
  }
})

test('automatically aligns similar waveforms, gain and polarity with measurable cancellation and direct downloads', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const errors: string[] = [], mutations: string[] = [], workers: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url())
    if (request.url().includes('alignment.worker')) workers.push(request.url())
  })
  await page.goto('/audio-subtract')
  const rate = 16000, common = noise(rate * 2, 61), target = noise(rate * 2, 93, 1200)
  for (const { delay, gain } of [{ delay: 317, gain: .75 }, { delay: -317, gain: -.75 }]) {
    const a = target.map((value, index) => value + gain * (common[index - delay] ?? 0))
    await upload(page, 'A', wav(a, 1, rate), 'A.wav')
    await upload(page, 'B', wav(common, 1, rate), 'B.wav')
    if (delay > 0) {
      expect(workers).toEqual([])
      await generate(page)
      const manual = await downloadSamples(page, 'A_minus_B.wav')
      expect(residualError(manual.samples, target)).toBeGreaterThan(.1)
      expect(workers).toEqual([])
      const toggle = page.getByLabel('自动匹配相似波形')
      await toggle.focus()
      await page.keyboard.press('Space')
      await expect(toggle).toBeChecked()
    }
    await page.getByLabel('搜索范围', { exact: true }).selectOption('250')
    await generate(page)
    const analysis = page.getByRole('region', { name: '自动匹配结果' })
    await expect(analysis).toContainText(`${(delay / rate * 1000).toFixed(3)} ms`)
    await expect(analysis).toContainText(gain < 0 ? '已反转' : '保持原样')
    await expect(analysis).toContainText('取样匹配可靠')
    await expect(analysis).toContainText('相关系数不是消除成功率')
    const aligned = await downloadSamples(page, 'A_minus_B.wav')
    expect(aligned.samples).toHaveLength(target.length)
    expect(residualError(aligned.samples, target)).toBeLessThan(.001)
    expect(workers.length).toBeGreaterThan(0)
    expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
    if (delay > 0) {
      await page.screenshot({ path: testInfo.outputPath('automatic-result-light.png'), fullPage: true, animations: 'disabled' })
      await page.getByRole('button', { name: '切换为深色主题' }).click()
      await page.screenshot({ path: testInfo.outputPath('automatic-result-dark.png'), fullPage: true, animations: 'disabled' })
      await page.getByRole('button', { name: '切换为浅色主题' }).click()
    }
  }
  const strength = page.getByRole('slider', { name: '消减强度' })
  await strength.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(strength).toHaveValue('95')
  await expect(page.getByRole('region', { name: '自动匹配结果' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '下载音频 C' })).toHaveCount(0)
  expect(errors).toEqual([])
  expect(mutations).toEqual([])
  await page.reload()
  await expect(page.getByRole('button', { name: '生成音频 C' })).toBeDisabled()
})

test('stops a pending alignment worker, retries and refuses silent or unrelated waveforms', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/audio-subtract')
  const common = wav(noise(16000, 61), 1, 8000)
  await upload(page, 'A', common)
  await upload(page, 'B', common)
  await page.getByLabel('自动匹配相似波形').check()
  let release!: () => void
  let requested = false
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/alignment.worker-*.js', async route => { requested = true; await gate; await route.continue().catch(() => undefined) })
  await page.getByRole('button', { name: '生成音频 C' }).click()
  await expect.poll(() => requested, { timeout: 60_000 }).toBe(true)
  await expect(page.getByRole('status')).toContainText('正在匹配相似波形')
  await page.getByRole('button', { name: '停止处理' }).click()
  release()
  await expect(page.getByRole('status')).toContainText('处理已停止')
  await expect(page.getByRole('region', { name: '自动匹配结果' })).toHaveCount(0)
  await generate(page)
  expect((await downloadSamples(page, 'A_minus_B.wav')).samples.every(sample => Math.abs(sample) < 1e-6)).toBe(true)
  for (const b of [wav(new Array(16000).fill(0), 1, 8000), wav(noise(16000, 99), 1, 8000)]) {
    await upload(page, 'B', b)
    await page.getByRole('button', { name: '生成音频 C' }).click()
    await expect(page.getByRole('alert')).toContainText('未自动消减', { timeout: 30_000 })
    await expect(page.getByRole('link', { name: '下载音频 C' })).toHaveCount(0)
    await expect(page.getByLabel('音频 A 试听')).toHaveCount(1)
  }
  await page.getByLabel('自动匹配相似波形').uncheck()
  await generate(page)
  await expect(page.getByRole('region', { name: '自动匹配结果' })).toHaveCount(0)
})
