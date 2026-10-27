import { expect, test } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { unzipSync } from 'fflate'

function wav(bitDepth = 24, channels = 2, floating = false) {
  const sampleRate = 48000
  const frames = 24000
  const sampleBytes = bitDepth / 8
  const bytes = Buffer.alloc(44 + frames * channels * sampleBytes)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8)
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(floating ? 3 : 1, 20)
  bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * channels * sampleBytes, 28)
  bytes.writeUInt16LE(channels * sampleBytes, 32); bytes.writeUInt16LE(bitDepth, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40)
  for (let i = 0; i < frames; i++) for (let channel = 0; channel < channels; channel++) {
    const at = 44 + (i * channels + channel) * sampleBytes
    const value = 0.7 * Math.sin(i * (channel + 1) * 0.1)
    if (floating) bytes.writeFloatLE(value, at)
    else bytes.writeIntLE(Math.round(value * (2 ** (bitDepth - 1) - 1)), at, sampleBytes)
  }
  return bytes
}

async function core() {
  const require = createRequire(resolve('package.json'))
  const previousSelf = Object.getOwnPropertyDescriptor(globalThis, 'self')
  // The bundled build targets Workers; its only required browser global at startup is self.location.
  Object.defineProperty(globalThis, 'self', { configurable: true, value: { location: { href: 'file:///ffmpeg-core.js' } } })
  try {
    return await require('@ffmpeg/core')({ wasmBinary: await readFile(require.resolve('@ffmpeg/core/wasm')) }) as {
      exec(...args: string[]): number
      reset(): void
      FS: { readFile(path: string): Uint8Array; writeFile(path: string, data: Uint8Array): void }
    }
  } finally {
    if (previousSelf) Object.defineProperty(globalThis, 'self', previousSelf)
    else Reflect.deleteProperty(globalThis, 'self')
  }
}

test('compresses 24-bit stereo audio with exact PCM and cancels initial loading safely', async ({ page }, testInfo) => {
  const errors: string[] = []
  const mutations: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
  await page.goto('/audio-convert')
  await expect(page).toHaveTitle('音频格式转换 · YL文件工具箱')
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.getByRole('combobox', { name: '采样率', exact: true }).selectOption('44100')
  await page.getByRole('combobox', { name: '声道', exact: true }).selectOption('mono')
  await page.getByRole('button', { name: '无损压缩', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '采样率', exact: true })).toHaveCount(0)
  const source = wav()
  await page.getByLabel('选择音频文件').setInputFiles({ name: '录音母带.wav', mimeType: 'audio/wav', buffer: source })
  await expect(page.getByText('等待转换')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('lossless-settings.png') })

  let release = () => {}
  let requested = false
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*ffmpeg-core*.wasm*', async route => { requested = true; await gate; await route.continue().catch(() => undefined) })
  await page.getByRole('button', { name: /开始无损压缩/ }).click()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: '停止压缩' }).click()
  release()
  await page.getByRole('button', { name: /开始无损压缩/ }).click()
  await expect(page.getByText('1 个音频无损压缩完成')).toBeVisible({ timeout: 30_000 })
  const result = page.getByLabel('录音母带.wav 的无损压缩结果')
  await expect(result).toContainText('采样校验通过 · 48 kHz · 24 位 · 2 声道')
  await expect(result).toContainText('节省')
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载 录音母带-无损.flac' }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('录音母带-无损.flac')
  const bytes = await readFile((await download.path())!)
  expect(bytes.length).toBeLessThan(source.length)
  expect(bytes.toString('ascii', 0, 4)).toBe('fLaC')
  const decoder = await core()
  decoder.FS.writeFile('result.flac', bytes)
  expect(decoder.exec('-i', 'result.flac', '-c:a', 'pcm_s24le', '-f', 's24le', 'decoded.pcm')).toBe(0)
  expect(Buffer.from(decoder.FS.readFile('decoded.pcm')).equals(source.subarray(44))).toBe(true)
  await result.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('lossless-result.png') })
  expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(errors).toEqual([])
  expect(mutations).toEqual([])
})

test('batches lossless results into ZIP and warns about already compressed audio', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('yl-text-tool:theme', 'dark'))
  await page.goto('/audio-convert')
  await page.getByRole('button', { name: '无损压缩', exact: true }).click()
  await page.getByLabel('选择音频文件').setInputFiles([
    { name: 'one.wav', mimeType: 'audio/wav', buffer: wav() },
    { name: 'two.wav', mimeType: 'audio/wav', buffer: wav(16, 1) },
  ])
  await expect(page.getByText('等待转换')).toHaveCount(2)
  await page.getByRole('button', { name: /开始无损压缩/ }).click()
  await expect(page.getByText('2 个音频无损压缩完成')).toBeVisible({ timeout: 30_000 })
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载全部' }).click()
  const archive = await pending
  const entries = unzipSync(await readFile((await archive.path())!))
  expect(Object.keys(entries).sort()).toEqual(['one-无损.flac', 'two-无损.flac'])
  await page.getByRole('button', { name: '清空' }).click()
  await page.getByLabel('选择音频文件').setInputFiles({ name: 'existing.flac', mimeType: 'audio/flac', buffer: Buffer.from(entries['one-无损.flac']) })
  await expect(page.getByText('等待转换')).toBeVisible()
  await page.getByRole('button', { name: /开始无损压缩/ }).click()
  await expect(page.getByText('1 个音频无损压缩完成')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/输出体积未减小，已保留原 FLAC 内容/)).toBeVisible()
  const result = page.getByLabel('existing.flac 的无损压缩结果')
  await expect(result).toContainText('体积未变化')
  await result.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('lossless-existing-dark.png') })
  expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})

test('rejects lossy and floating-point inputs without claiming lossless success', async ({ page }) => {
  const encoder = await core()
  encoder.FS.writeFile('source.wav', wav())
  expect(encoder.exec('-i', 'source.wav', '-c:a', 'libmp3lame', 'lossy.mp3')).toBe(0)
  await page.goto('/audio-convert')
  await page.getByLabel('选择音频文件').setInputFiles({ name: 'lossy.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from(encoder.FS.readFile('lossy.mp3')) })
  await expect(page.getByText('等待转换')).toBeVisible()
  await page.getByRole('button', { name: '无损压缩', exact: true }).click()
  await expect(page.getByRole('button', { name: /开始无损压缩/ })).toBeDisabled()
  await expect(page.getByText(/不能恢复音质/)).toBeVisible()
  await page.getByLabel('选择音频文件').setInputFiles({ name: 'float.wav', mimeType: 'audio/wav', buffer: wav(32, 1, true) })
  await expect(page.getByText('等待转换')).toBeVisible()
  await page.getByRole('button', { name: /开始无损压缩/ }).click()
  await expect(page.getByText(/浮点或有损编码不能/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: /^下载 / })).toHaveCount(0)
  await page.getByRole('button', { name: /^格式转换/ }).click()
  await expect(page.getByRole('button', { name: /开始转换/ })).toBeEnabled()
})

test('compresses a real folder of more than twenty tracks and preserves nested paths in ZIP', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const folder = testInfo.outputPath('Album')
  await mkdir(join(folder, 'Side A'), { recursive: true })
  await mkdir(join(folder, 'Side B'), { recursive: true })
  const source = wav(16, 1)
  for (let i = 1; i <= 20; i++) await writeFile(join(folder, `${String(i).padStart(2, '0')}.wav`), source)
  await writeFile(join(folder, 'Side A', 'song.wav'), source)
  await writeFile(join(folder, 'Side B', 'song.wav'), wav())
  await writeFile(join(folder, '00-broken.wav'), Buffer.from('RIFF----WAVE'))
  await writeFile(join(folder, 'notes.txt'), 'Folder notes')
  await writeFile(join(folder, 'lossy.mp3'), 'Ignored lossy format')
  await page.goto('/audio-convert')
  await expect(page).toHaveTitle('音频格式转换 · YL文件工具箱')
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.getByLabel('选择音频无损压缩文件夹').setInputFiles(folder)
  await expect(page.getByRole('button', { name: '无损压缩', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('导入摘要')).toContainText('已添加 23 个音频。已忽略 2 个')
  await expect(page.getByText('等待转换')).toHaveCount(23)
  const importHeading = page.getByRole('heading', { name: '拖入多个音频或文件夹，或点击选择' })
  expect((await importHeading.boundingBox())!.height).toBeLessThan(80)
  await page.getByRole('button', { name: '文件夹无损压缩', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('folder-import.png') })
  await page.getByRole('button', { name: /开始无损压缩/ }).click()
  await expect(page.getByText('22 个音频无损压缩完成')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByLabel('批量结果汇总')).toContainText('已完成 22/23 个文件，1 个失败')
  await expect(page.getByRole('button', { name: /开始无损压缩/ })).toBeDisabled()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载文件夹 ZIP' }).click()
  const archive = await pending
  const entries = unzipSync(await readFile((await archive.path())!))
  expect(Object.keys(entries)).toHaveLength(22)
  expect(entries['Album/Side A/song-无损.flac']).toBeDefined()
  expect(entries['Album/Side B/song-无损.flac']).toBeDefined()
  const decoder = await core()
  for (const [index, path] of Object.keys(entries).entries()) {
    decoder.FS.writeFile(`${index}.flac`, entries[path])
    const is24Bit = path.includes('Side B')
    expect(decoder.exec('-i', `${index}.flac`, '-c:a', is24Bit ? 'pcm_s24le' : 'pcm_s16le', '-f', is24Bit ? 's24le' : 's16le', `${index}.pcm`)).toBe(0)
    expect(Buffer.from(decoder.FS.readFile(`${index}.pcm`)).equals((is24Bit ? wav() : source).subarray(44))).toBe(true)
    decoder.reset()
  }
  expect((await readFile(join(folder, 'Side A', 'song.wav'))).equals(source)).toBe(true)
  await page.getByRole('button', { name: '下载文件夹 ZIP' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('folder-results.png') })
  expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(errors).toEqual([])
})
