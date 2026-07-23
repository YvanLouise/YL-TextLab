import { expect, test } from '@playwright/test'

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
  await page.getByText('替换结果可以编辑吗？').click()
  await expect(page.getByText(/结果区继续修改后复制/)).toBeVisible()
  await page.goto('/changelog')
  await expect(page.getByText('v1.0.0')).toBeVisible()
  await expect(page.getByText('2026-07-23')).toBeVisible()

  if (isMobile) {
    await page.goto('/')
    await page.getByRole('button', { name: '打开导航菜单' }).click()
    await expect(page.getByRole('navigation', { name: '移动端导航' })).toBeVisible()
  }
})
