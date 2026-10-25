import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function wav(seconds = 5) {
  const rate = 16000
  const length = Math.round(seconds * rate)
  const buffer = Buffer.alloc(44 + length * 2)
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8)
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36); buffer.writeUInt32LE(length * 2, 40)
  for (let i = 0; i < length; i += 1) buffer.writeInt16LE(Math.round(Math.sin(i / rate * 440 * 2 * Math.PI) * (5000 + Math.sin(i / rate * 3) * 4000)), 44 + i * 2)
  return buffer
}

async function upload(page: Page, seconds = 5) {
  await page.goto('/audio-split')
  await expect(page).toHaveTitle('音频分割与提取 · YL文件工具箱')
  await expect(page.getByRole('heading', { name: '音频分割与视频音轨提取', exact: true })).toBeVisible()
  await page.getByLabel('选择要处理的音频或视频文件').setInputFiles({ name: '剪辑测试.wav', mimeType: 'audio/wav', buffer: wav(seconds) })
  await expect(page.getByText('剪辑测试.wav', { exact: true })).toBeVisible()
}

async function range(page: Page, start: string, end: string) {
  await page.getByLabel('开始时间', { exact: true }).fill(start)
  await page.getByLabel('开始时间', { exact: true }).press('Enter')
  await page.getByLabel('结束时间', { exact: true }).fill(end)
  await page.getByLabel('结束时间', { exact: true }).press('Enter')
}

test('precise waveform editing, loop preview and real WAV export', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(90_000)
  if (isMobile) await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []
  const mutations: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`) })
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
  await upload(page)
  await page.getByLabel('输出文件名').fill('自定义片段.wav')
  await range(page, '00:01.000', '00:03.000')
  await page.getByRole('button', { name: '缩放至选区' }).click()
  await expect(page.getByLabel('波形视窗位置')).toBeVisible()
  const canvas = page.getByRole('slider', { name: '播放位置', exact: true })
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 4 } })
  await expect(page.getByLabel('当前播放时间')).toHaveText('00:02.000')
  await page.getByRole('button', { name: '设为起点', exact: true }).click()
  await expect(page.getByLabel('开始时间', { exact: true })).toHaveValue('00:02.000')
  await expect(page.getByLabel('输出文件名')).toHaveValue('自定义片段.wav')
  await page.getByRole('button', { name: '显示全部' }).click()
  await range(page, '00:02.000', '00:02.250')
  await page.getByRole('button', { name: '循环试听' }).click()
  const audio = page.getByLabel('原音频试听')
  await page.getByLabel('试听音量').press('Home')
  await page.getByLabel('试听音量').press('ArrowRight')
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.volume)).toBe(0.01)
  await page.getByRole('button', { name: '静音', exact: true }).click()
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.muted)).toBe(true)
  await page.getByRole('button', { name: '取消静音' }).click()
  await page.getByRole('button', { name: '播放所选片段' }).click()
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false)
  await page.waitForTimeout(800)
  expect(await audio.evaluate((element: HTMLAudioElement) => !element.paused && element.currentTime >= 2 && element.currentTime <= 2.3)).toBe(true)
  await page.getByRole('button', { name: '循环试听' }).click()
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true)
  await expect(page.getByLabel('当前播放时间')).toHaveText('00:02.250')
  await range(page, '00:01.250', '00:03.750')
  await page.getByLabel('输出格式').selectOption('mp3')
  await expect(page.getByLabel('输出文件名')).toHaveValue('自定义片段.mp3')
  await page.getByLabel('输出格式').selectOption('wav')
  await page.getByRole('button', { name: '导出所选片段', exact: true }).click()
  const link = page.getByRole('link', { name: '下载片段' })
  await expect(link).toBeVisible({ timeout: 60_000 })
  const pendingDownload = page.waitForEvent('download')
  await link.click()
  const download = await pendingDownload
  expect(download.suggestedFilename()).toBe('自定义片段.wav')
  const bytes = await readFile((await download.path())!)
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
  expect(bytes.toString('ascii', 8, 12)).toBe('WAVE')
  let dataSize = 0
  let dataOffset = 0
  let byteRate = 0
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(at + 4)
    const id = bytes.toString('ascii', at, at + 4)
    if (id === 'fmt ') byteRate = bytes.readUInt32LE(at + 16)
    if (id === 'data') { dataSize = size; dataOffset = at + 8 }
    at += 8 + size + size % 2
  }
  expect(dataSize / byteRate).toBeCloseTo(2.5, 3)
  expect(bytes.subarray(dataOffset, dataOffset + 256)).toEqual(wav().subarray(44 + 20000 * 2, 44 + 20000 * 2 + 256))
  // Generating a result must not revoke the source URL or break its next preview.
  await page.getByRole('button', { name: '播放所选片段' }).click()
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false)
  await page.getByRole('button', { name: '暂停所选片段' }).click()
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(mutations).toEqual([])
  await page.screenshot({ path: join(tmpdir(), `yl-split-editor-${testInfo.project.name}.png`), fullPage: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(tmpdir(), `yl-split-editor-${testInfo.project.name}-viewport.png`) })
})

test('loops across the native end of a complete source', async ({ page }) => {
  await upload(page, 0.2)
  await page.getByRole('button', { name: '循环试听' }).click()
  await page.getByRole('button', { name: '播放所选片段' }).click()
  await page.waitForTimeout(700)
  await expect(page.getByRole('button', { name: '暂停所选片段' })).toBeVisible()
  await expect.poll(() => page.getByLabel('原音频试听').evaluate((element: HTMLAudioElement) => element.paused)).toBe(false)
  await page.getByRole('button', { name: '暂停所选片段' }).click()
})

test('exports OGG in its original format with the selected duration', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/audio-convert')
  await page.getByRole('button', { name: /OGG/ }).click()
  await page.getByLabel('选择音频文件').setInputFiles({ name: 'source.wav', mimeType: 'audio/wav', buffer: wav() })
  await page.getByRole('button', { name: /开始转换/ }).click()
  const sourceLink = page.getByRole('link', { name: '下载 source.ogg' })
  await expect(sourceLink).toBeVisible({ timeout: 60_000 })
  const pendingSource = page.waitForEvent('download')
  await sourceLink.click()
  const source = await pendingSource
  const buffer = await readFile((await source.path())!)
  expect(buffer.toString('ascii', 0, 4)).toBe('OggS')
  await page.goto('/audio-split')
  await page.getByLabel('选择要处理的音频或视频文件').setInputFiles({ name: '原格式测试.ogg', mimeType: 'audio/ogg', buffer })
  await expect(page.getByText('原格式测试.ogg', { exact: true })).toBeVisible()
  await expect(page.getByLabel('输出格式')).toHaveValue('original')
  await range(page, '00:01.000', '00:02.500')
  await page.getByRole('button', { name: '导出所选片段' }).click()
  const link = page.getByRole('link', { name: '下载片段' })
  await expect(link).toBeVisible({ timeout: 60_000 })
  expect(await link.getAttribute('download')).toMatch(/\.ogg$/)
  const pendingExport = page.waitForEvent('download')
  await link.click()
  const exported = await pendingExport
  const ogg = await readFile((await exported.path())!)
  const identification = 27 + ogg[26]
  expect(ogg.toString('ascii', identification + 1, identification + 7)).toBe('vorbis')
  const sampleRate = ogg.readUInt32LE(identification + 12)
  const blockSize = 1 << (ogg[identification + 28] >> 4)
  let finalGranule = 0n
  let endOfStream = false
  for (let offset = 0; offset < ogg.length;) {
    expect(ogg.toString('ascii', offset, offset + 4)).toBe('OggS')
    const segments = ogg[offset + 26]
    const bodySize = ogg.subarray(offset + 27, offset + 27 + segments).reduce((sum, size) => sum + size, 0)
    if (ogg[offset + 5] & 4) {
      finalGranule = ogg.readBigUInt64LE(offset + 6)
      endOfStream = true
    }
    offset += 27 + segments + bodySize
    expect(offset).toBeLessThanOrEqual(ogg.length)
  }
  expect(endOfStream).toBe(true)
  expect(Math.abs(Number(finalGranule) / sampleRate - 1.5)).toBeLessThanOrEqual(1 / sampleRate)
  const duration = await page.getByLabel('导出片段试听').evaluate(async (element: HTMLAudioElement) => {
    const context = new AudioContext()
    try { return (await context.decodeAudioData(await (await fetch(element.src)).arrayBuffer())).duration }
    finally { await context.close() }
  })
  // Browser decoders can retain Vorbis overlap padding; the EOS granule above must remain sample-accurate.
  expect(Math.abs(duration - 1.5)).toBeLessThanOrEqual(blockSize / sampleRate)
})

test('extracts a selected region from a real video with an audio track', async ({ page }) => {
  test.setTimeout(90_000)
  const mutations: string[] = []
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
  await page.goto('/audio-split')
  const videoBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64; canvas.height = 64
    const drawing = canvas.getContext('2d')!
    const video = canvas.captureStream(10)
    const context = new AudioContext()
    await context.resume()
    const oscillator = context.createOscillator()
    const destination = context.createMediaStreamDestination()
    oscillator.connect(destination)
    oscillator.start()
    const stream = new MediaStream([...video.getVideoTracks(), ...destination.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
    const chunks: Blob[] = []
    const done = new Promise<Blob>(resolve => {
      recorder.ondataavailable = event => chunks.push(event.data)
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
    })
    const timer = window.setInterval(() => { drawing.fillStyle = `hsl(${performance.now() % 360} 50% 50%)`; drawing.fillRect(0, 0, 64, 64) }, 80)
    recorder.start()
    await new Promise(resolve => setTimeout(resolve, 1400))
    recorder.stop()
    const blob = await done
    clearInterval(timer)
    oscillator.stop()
    stream.getTracks().forEach(track => track.stop())
    await context.close()
    return [...new Uint8Array(await blob.arrayBuffer())]
  })
  await page.getByLabel('选择要处理的音频或视频文件').setInputFiles({ name: '真实视频.webm', mimeType: 'video/webm', buffer: Buffer.from(videoBytes) })
  await expect(page.getByText('真实视频.webm', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/视频 · WEBM/)).toBeVisible()
  await range(page, '00:00.200', '00:00.700')
  await page.getByLabel('输出格式').selectOption('wav')
  await page.getByRole('button', { name: '提取所选音频' }).click()
  await expect(page.getByRole('link', { name: '下载片段' })).toBeVisible({ timeout: 60_000 })
  const decoded = await page.getByLabel('导出片段试听').evaluate(async (element: HTMLAudioElement) => {
    const context = new AudioContext()
    try {
      const bytes = await (await fetch(element.src)).arrayBuffer()
      const header = new TextDecoder().decode(bytes.slice(0, 4))
      const audio = await context.decodeAudioData(bytes)
      return { header, duration: audio.duration, nonSilent: audio.getChannelData(0).some(value => Math.abs(value) > 0.01) }
    } finally { await context.close() }
  })
  expect(decoded.header).toBe('RIFF')
  expect(decoded.duration).toBeCloseTo(0.5, 3)
  expect(decoded.nonSilent).toBe(true)
  expect(mutations).toEqual([])
})

test('cancels core loading and can export again', async ({ page }) => {
  test.setTimeout(90_000)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*ffmpeg-core*.wasm*', async route => { await gate; await route.continue().catch(() => undefined) })
  await upload(page)
  await page.getByRole('button', { name: '导出所选片段' }).click()
  await expect(page.getByLabel('开始时间', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '取消导出' }).click()
  await expect(page.getByRole('status')).toContainText('已取消导出')
  await expect(page.getByRole('link', { name: '下载片段' })).toHaveCount(0)
  release()
  await page.getByRole('button', { name: '导出所选片段' }).click()
  await expect(page.getByRole('link', { name: '下载片段' })).toBeVisible({ timeout: 60_000 })
})
