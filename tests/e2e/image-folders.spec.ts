import { expect, test } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync, zlibSync } from 'fflate'
import { joinBytes, pngChunk } from '../../src/features/image-conversion/lossless'

function fixturePng() {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, 2)
  view.setUint32(4, 1)
  header.set([8, 6], 8)
  const raw = new Uint8Array([0, 20, 100, 180, 255, 80, 180, 20, 128])
  return joinBytes([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
    pngChunk('tEXt', new TextEncoder().encode('Comment\0removable metadata '.repeat(8))),
    pngChunk('IDAT', zlibSync(raw, { level: 0 })), pngChunk('IEND', new Uint8Array())])
}

test('imports a real folder recursively, processes over 20 images and downloads the directory tree', async ({ page }, testInfo) => {
  const folder = testInfo.outputPath('input', '素材')
  await mkdir(path.join(folder, '子目录'), { recursive: true })
  const png = fixturePng()
  for (let index = 0; index < 24; index += 1) {
    await writeFile(path.join(folder, index % 2 ? '子目录' : '', `图片${index}.PNG`), png)
  }
  await writeFile(path.join(folder, 'readme.txt'), 'not an image')
  await writeFile(path.join(folder, 'broken.png'), new Uint8Array([1, 2, 3]))
  const errors: string[] = []
  const uploads: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (!['GET', 'HEAD'].includes(request.method())) uploads.push(request.url()) })
  await page.goto('/image-convert')
  await expect(page.getByRole('button', { name: '文件夹无损压缩' })).toBeVisible()
  await page.getByLabel('选择无损压缩文件夹').setInputFiles(folder)
  await expect(page.getByRole('button', { name: '无损压缩', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('25 / 500 个文件')).toBeVisible()
  await expect(page.getByText('2 × 1', { exact: true })).toHaveCount(24)
  await expect(page.getByText(/跳过 1 个其他文件/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('folder-import-viewport.png') })
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByText('24 个文件处理完成，1 个失败')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: '文件夹无损压缩' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载目录 ZIP' }).click()
  const download = await downloadPromise
  const entries = unzipSync(await readFile(await download.path()))
  expect(Object.keys(entries)).toHaveLength(24)
  expect(entries['素材-lossless/子目录/图片1.PNG']).toBeDefined()
  expect(entries['素材-lossless/图片0.PNG']).toBeDefined()
  expect(Object.keys(entries).some((name) => /readme|broken|compressed/.test(name))).toBe(false)
  for (const bytes of Object.values(entries)) expect(bytes.length).toBeLessThan(png.length)
  await download.delete()
  await page.screenshot({ path: testInfo.outputPath('folder-lossless.png'), fullPage: true })
  await page.getByText('24 个文件处理完成，1 个失败').scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('folder-results-viewport.png') })
  expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(uploads).toEqual([])
  expect(errors).toEqual([])
})

test('exports a new folder with a native directory handle and preserves original filenames', async ({ page }, testInfo) => {
  const folder = testInfo.outputPath('input', 'Photos')
  await mkdir(path.join(folder, 'album'), { recursive: true })
  await writeFile(path.join(folder, 'album', 'ORIGINAL.PNG'), fixturePng())
  await page.addInitScript(() => {
    const written: string[] = []
    const created: string[] = []
    const state = window as unknown as { folderWrites: string[]; folderCreates: string[]; showDirectoryPicker: () => Promise<unknown> }
    state.folderWrites = written
    state.folderCreates = created
    const directory = (fullPath: string): unknown => ({
      name: fullPath.split('/').at(-1),
      getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
        if (!options?.create) {
          if (name === 'Photos-lossless') return directory('target/Photos-lossless')
          throw new DOMException('', 'NotFoundError')
        }
        created.push(`${fullPath}/${name}`)
        return directory(`${fullPath}/${name}`)
      },
      getFileHandle: async (name: string) => ({ createWritable: async () => ({
        write: async (blob: Blob) => { if (blob.size) written.push(`${fullPath}/${name}`) },
        close: async () => undefined, abort: async () => undefined,
      }) }),
    })
    state.showDirectoryPicker = async () => directory('target')
  })
  await page.goto('/image-convert')
  await page.getByLabel('选择无损压缩文件夹').setInputFiles(folder)
  await expect(page.getByText('2 × 1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByText('1 个文件处理完成')).toBeVisible()
  await page.getByRole('button', { name: '导出到文件夹' }).click()
  await expect(page.getByText(/文件夹导出完成：Photos-lossless-2，已写入 1 张图片/)).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { folderWrites: string[] }).folderWrites))
    .toEqual(['target/Photos-lossless-2/album/ORIGINAL.PNG'])
  expect(await page.evaluate(() => (window as unknown as { folderCreates: string[] }).folderCreates))
    .toEqual(['target/Photos-lossless-2', 'target/Photos-lossless-2/album'])
})

test('offers a directory ZIP when native folder output is unavailable', async ({ page }, testInfo) => {
  const folder = testInfo.outputPath('input', 'Fallback')
  await mkdir(folder, { recursive: true })
  await writeFile(path.join(folder, 'one.png'), fixturePng())
  await page.addInitScript(() => { Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined }) })
  await page.goto('/image-convert')
  await page.getByLabel('选择无损压缩文件夹').setInputFiles(folder)
  await expect(page.getByText('2 × 1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /开始压缩/ }).click()
  await expect(page.getByText('1 个文件处理完成')).toBeVisible()
  await expect(page.getByRole('button', { name: '导出到文件夹' })).toHaveCount(0)
  await expect(page.getByText(/当前浏览器不支持直接写入文件夹/)).toBeVisible()
  await expect(page.getByRole('button', { name: '下载目录 ZIP' })).toBeVisible()
})
