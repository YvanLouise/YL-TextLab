import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

function wav(channels = 2) {
  const sampleRate = 16000
  const bytes = Buffer.alloc(44 + sampleRate * channels * 2)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8)
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * channels * 2, 28)
  bytes.writeUInt16LE(channels * 2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40)
  for (let i = 0; i < sampleRate; i++) for (let channel = 0; channel < channels; channel++) {
    bytes.writeInt16LE(Math.round(12000 * Math.sin(i * (channel + 1) * 0.13)), 44 + (i * channels + channel) * 2)
  }
  return bytes
}

function samples(bytes: Buffer) {
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(at + 4)
    if (bytes.toString('ascii', at, at + 4) === 'data') return bytes.subarray(at + 8, at + 8 + size)
    at += 8 + size + size % 2
  }
  throw new Error('Missing WAV data')
}

test('separates a stereo selection into exact left and right WAV downloads', async ({ page }, testInfo) => {
  const errors: string[] = []
  const mutations: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
  await page.goto('/audio-split')
  await expect(page).toHaveTitle('音频分割与提取 · YL文件工具箱')
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.getByRole('button', { name: '左右声道分离', exact: true }).click()
  const input = wav()
  await page.getByLabel('选择要处理的音频或视频文件').setInputFiles({ name: '双声道歌曲.wav', mimeType: 'audio/wav', buffer: input })
  await expect(page.getByText('双声道歌曲.wav', { exact: true })).toBeVisible()
  await expect(page.getByLabel('输出格式')).toHaveValue('wav')
  await page.screenshot({ path: testInfo.outputPath('channels-editor.png') })
  await page.getByLabel('开始时间', { exact: true }).fill('00:00.250')
  await page.getByLabel('开始时间', { exact: true }).press('Enter')
  await page.getByLabel('结束时间', { exact: true }).fill('00:00.750')
  await page.getByLabel('结束时间', { exact: true }).press('Enter')
  await page.getByLabel('输出文件名').fill('双声道歌曲.wav')
  await page.getByRole('button', { name: '分离并导出左右声道' }).click()
  await expect(page.getByRole('link', { name: '下载右声道' })).toBeVisible({ timeout: 30_000 })
  for (const [channel, label] of ['左声道', '右声道'].entries()) {
    await expect(page.getByLabel(`${label}试听`)).toBeVisible()
    const pending = page.waitForEvent('download')
    await page.getByRole('link', { name: `下载${label}` }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe(`双声道歌曲_${channel === 0 ? 'L' : 'R'}.wav`)
    const bytes = await readFile((await download.path())!)
    expect(bytes.readUInt16LE(22)).toBe(1)
    expect(bytes.readUInt32LE(24)).toBe(16000)
    const expected = Buffer.alloc(8000 * 2)
    for (let i = 0; i < 8000; i++) expected.writeInt16LE(input.readInt16LE(44 + ((i + 4000) * 2 + channel) * 2), i * 2)
    expect(samples(bytes).equals(expected)).toBe(true)
  }
  await page.getByLabel('左右声道分离结果').scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('channels-results.png') })
  expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(mutations).toEqual([])
  expect(errors).toEqual([])
})

test('explains why mono input cannot be separated and leaves clip export available', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('yl-text-tool:theme', 'dark'))
  await page.goto('/audio-split')
  await page.getByLabel('选择要处理的音频或视频文件').setInputFiles({ name: 'mono.wav', mimeType: 'audio/wav', buffer: wav(1) })
  await expect(page.getByText('mono.wav', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '左右声道分离', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('此文件是单声道')
  await expect(page.getByRole('button', { name: '分离并导出左右声道' })).toBeDisabled()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('channels-mono-dark.png') })
  await page.getByRole('button', { name: '片段导出', exact: true }).click()
  await expect(page.getByRole('button', { name: '导出所选片段' })).toBeEnabled()
})

test('separates an MP3 song and can cancel initial loading before retrying', async ({ page }) => {
  await page.goto('/audio-convert')
  await page.getByLabel('选择音频文件').setInputFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: wav() })
  await expect(page.getByText('等待转换')).toBeVisible()
  await page.getByRole('button', { name: /开始转换/ }).click()
  const source = page.getByRole('link', { name: '下载 song.mp3' })
  await expect(source).toBeVisible({ timeout: 30_000 })
  const pending = page.waitForEvent('download')
  await source.click()
  const download = await pending
  const buffer = await readFile((await download.path())!)
  await page.goto('/audio-split')
  await page.getByRole('button', { name: '左右声道分离', exact: true }).click()
  await page.getByLabel('选择要处理的音频或视频文件').setInputFiles({ name: 'song.mp3', mimeType: 'audio/mpeg', buffer })
  await expect(page.getByText('song.mp3', { exact: true })).toBeVisible()
  await page.getByLabel('输出格式').selectOption('original')
  let release = () => {}
  let requested = false
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*ffmpeg-core*.wasm*', async route => { requested = true; await gate; await route.continue().catch(() => undefined) })
  await page.getByRole('button', { name: '分离并导出左右声道' }).click()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: '取消导出' }).click()
  release()
  await page.getByRole('button', { name: '分离并导出左右声道' }).click()
  const right = page.getByRole('link', { name: '下载右声道' })
  await expect(right).toBeVisible({ timeout: 30_000 })
  await expect(right).toHaveAttribute('download', 'song_R.mp3')
  for (const label of ['左声道', '右声道']) {
    const channels = await page.getByLabel(`${label}试听`).evaluate(async (element: HTMLAudioElement) => {
      const context = new AudioContext()
      try { return (await context.decodeAudioData(await (await fetch(element.src)).arrayBuffer())).numberOfChannels }
      finally { await context.close() }
    })
    expect(channels).toBe(1)
  }
})
