import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

function wav() {
  const rate = 22050, seconds = 6, channels = 2
  const bytes = Buffer.alloc(44 + rate * seconds * channels * 2)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8)
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(channels, 22)
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * channels * 2, 28); bytes.writeUInt16LE(channels * 2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40)
  for (let i = 0; i < rate * seconds; i++) {
    const frequency = [440, 523.251, 659.255][Math.floor(i / rate / 2)]
    const envelope = Math.min(1, (i % (rate * 2)) / (rate * .025))
    const value = Math.round(15000 * envelope * Math.sin(2 * Math.PI * frequency * i / rate))
    bytes.writeInt16LE(value, 44 + i * 4); bytes.writeInt16LE(-value, 46 + i * 4)
  }
  return bytes
}

async function upload(page: Page) {
  await page.getByLabel('选择频谱音频文件').setInputFiles({ name: '旋律练习.wav', mimeType: 'audio/wav', buffer: wav() })
  await expect(page.getByRole('status')).toContainText('频谱已就绪', { timeout: 30_000 })
}

function midiNotes(bytes: Buffer) {
  expect(bytes.toString('ascii', 0, 4)).toBe('MThd')
  expect(bytes.toString('ascii', 14, 18)).toBe('MTrk')
  expect(bytes.readUInt16BE(12)).toBe(960)
  const notes: { pitch: number; start: number; end: number; velocity: number }[] = []
  const active = new Map<number, { start: number; velocity: number }>()
  let at = 22, tick = 0, tempo = 500000
  const variable = () => { let result = 0, value: number; do { value = bytes[at++]; result = result * 128 + (value & 127) } while (value & 128); return result }
  while (at < bytes.length) {
    tick += variable()
    const status = bytes[at++]
    if (status === 255) {
      const type = bytes[at++], length = variable()
      if (type === 81) tempo = bytes.readUIntBE(at, 3)
      at += length
    } else if (status === 192) at++
    else {
      const pitch = bytes[at++], velocity = bytes[at++]
      const time = tick / 960 * tempo / 1000000
      if (status === 144) active.set(pitch, { start: time, velocity })
      else if (status === 128) { const note = active.get(pitch)!; notes.push({ ...note, pitch, end: time }); active.delete(pitch) }
    }
  }
  expect(active.size).toBe(0)
  return notes
}

test('draws on the real antiphase stereo spectrum, edits with keyboard, previews and round-trips MIDI/project exports', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(90_000)
  const errors: string[] = [], mutations: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
  await page.goto('/')
  await page.locator('article').filter({ has: page.getByRole('heading', { name: '频谱画 MIDI', exact: true }) }).getByRole('link', { name: /立即使用/ }).click()
  await expect(page).toHaveTitle('音频频谱画 MIDI · YL文件工具箱')
  await upload(page)
  await expect(page.getByRole('button', { name: '导出 MIDI', exact: true })).toBeDisabled()
  const canvas = page.getByRole('application', { name: '频谱 MIDI 编辑区' })
  await canvas.scrollIntoViewIfNeeded()
  const bounds = (await canvas.boundingBox())!
  const parentScroll = await canvas.evaluate(element => element.parentElement!.parentElement!.scrollTop)
  const y = bounds.y + 28 + (108 - 69) * 19 - parentScroll + 9
  const start = bounds.x + 54 + 50, end = bounds.x + 54 + 150
  await page.mouse.move(start, y); await page.mouse.down(); await page.mouse.move(end, y, { steps: 8 }); await page.mouse.up()
  await expect(page.getByLabel('选中音符音高')).toHaveValue('69')
  await expect(page.getByLabel('音符起点')).toHaveValue('0.5')
  await expect(page.getByLabel('音符终点')).toHaveValue('1.5')
  await canvas.focus(); await canvas.press('ArrowRight'); await canvas.press('ArrowUp')
  await expect(page.getByLabel('选中音符音高')).toHaveValue('70')
  await expect(page.getByLabel('音符起点')).toHaveValue('0.625')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByLabel('选择已有音符')).toContainText('A4')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await page.getByLabel('选择已有音符').selectOption({ index: 1 })
  await page.getByLabel('选中音符音高').selectOption('69')
  await page.getByLabel('音符起点').fill('0.5')
  await page.getByLabel('音符终点').fill('2')
  await page.getByLabel('音符力度').fill('110')
  await page.getByRole('button', { name: '应用音符修改' }).click()
  await page.getByLabel('MIDI 速度 BPM').fill('90')
  await page.getByRole('button', { name: '开始试听', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停试听', exact: true })).toBeVisible()
  await expect.poll(() => page.getByLabel('频谱播放位置').inputValue()).not.toBe('0')
  await page.getByRole('button', { name: '暂停试听', exact: true }).click()
  await page.getByRole('button', { name: '回到开头', exact: true }).click()
  await page.getByLabel('试听内容').selectOption('midi')
  await page.getByRole('button', { name: '开始试听', exact: true }).click()
  await page.getByRole('button', { name: '暂停试听', exact: true }).click()
  const pendingMidi = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 MIDI', exact: true }).click()
  const midi = await pendingMidi
  expect(midi.suggestedFilename()).toBe('旋律练习.mid')
  const result = midiNotes(await readFile((await midi.path())!))
  expect(result).toHaveLength(1)
  expect(result[0].pitch).toBe(69); expect(result[0].velocity).toBe(110)
  expect(result[0].start).toBeCloseTo(.5, 3); expect(result[0].end).toBeCloseTo(2, 3)
  const pendingProject = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存工程', exact: true }).click()
  const project = await pendingProject, projectBytes = await readFile((await project.path())!)
  expect(project.suggestedFilename()).toBe('旋律练习.yl-midi.json')
  const data = JSON.parse(projectBytes.toString())
  expect(data).toMatchObject({ version: 1, duration: 6, bpm: 90 })
  expect(data.notes).toHaveLength(1)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '清空音符', exact: true }).click()
  await expect(page.getByRole('button', { name: '导出 MIDI', exact: true })).toBeDisabled()
  await page.getByLabel('载入 MIDI 工程文件').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: projectBytes })
  await expect(page.getByRole('status')).toContainText('已载入工程中的 1 个音符')
  await page.getByLabel('选择已有音符').selectOption({ index: 1 })
  await page.getByLabel('频谱精度').selectOption('8192')
  await expect(page.getByRole('status')).toContainText('频谱已就绪', { timeout: 30_000 })
  await expect(page.getByLabel('选择已有音符')).toContainText('A4')
  await page.getByLabel('频谱亮度').fill('1.2')
  await page.getByRole('button', { name: '拖动视图', exact: true }).click()
  await canvas.scrollIntoViewIfNeeded()
  const moved = (await canvas.boundingBox())!
  await page.mouse.move(moved.x + 250, moved.y + 150); await page.mouse.down(); await page.mouse.move(moved.x + 100, moved.y + 180, { steps: 6 }); await page.mouse.up()
  if (isMobile) expect(await canvas.evaluate(element => element.parentElement!.parentElement!.scrollLeft)).toBeGreaterThan(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('midi-editor.png'), fullPage: true })
  await page.screenshot({ path: testInfo.outputPath('midi-editor-viewport.png') })
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(errors).toEqual([]); expect(mutations).toEqual([])
  page.once('dialog', dialog => dialog.accept())
  await page.reload()
  await expect(page.getByText('选择或拖入一段音频')).toBeVisible()
  await expect(page.getByRole('application')).toHaveCount(0)
})

test('cancels the analysis worker, retries, reports invalid input and has a dark mobile entry', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('yl-text-tool:theme', 'dark'))
  await page.goto('/features')
  await page.getByRole('button', { name: '频谱画 MIDI', exact: true }).click()
  await page.getByRole('link', { name: '开始手动转写', exact: true }).click()
  let release!: () => void
  let requested = false
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/spectrum.worker-*.js', async route => { requested = true; await gate; await route.continue().catch(() => undefined) })
  await page.getByLabel('选择频谱音频文件').setInputFiles({ name: '旋律练习.wav', mimeType: 'audio/wav', buffer: wav() })
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: '停止分析', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已停止分析')
  release()
  await upload(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '添加音符', exact: true }).click()
  await page.getByRole('button', { name: '删除音符', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('midi-editor-dark.png'), fullPage: true })
  await page.getByLabel('选择频谱音频文件').setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('broken audio') })
  await expect(page.getByRole('alert')).toContainText('无法解码')
  await expect(page.getByText('旋律练习.wav', { exact: true })).toBeVisible()
  await expect(page.getByRole('application')).toBeVisible()
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})
