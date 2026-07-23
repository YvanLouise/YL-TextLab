import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { clearReplacementDraft, saveReplacementDraft } from '../features/replacement/storage'
import { ThemeProvider } from '../theme/ThemeProvider'
import { ReplacePage } from './ReplacePage'

function renderPage() {
  return render(
    <BrowserRouter>
      <ThemeProvider>
        <ReplacePage />
      </ThemeProvider>
    </BrowserRouter>,
  )
}

afterEach(async () => {
  cleanup()
  await clearReplacementDraft()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('ReplacePage', () => {
  it('validates required fields and performs a replacement', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '执行替换' }))
    expect(await screen.findByText('请输入需要处理的原始文本')).toBeInTheDocument()
    expect(screen.getByText('请输入要查找的关键词')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: '原始文本' }), 'Hello hello')
    await user.type(screen.getByLabelText('查找关键词'), 'hello')
    await user.type(screen.getByLabelText('替换为'), '你好')
    await user.click(screen.getByRole('button', { name: '执行替换' }))

    expect(screen.getByRole('textbox', { name: '替换结果' })).toHaveValue('你好 你好')
    expect(screen.getByText('已替换 2 处')).toBeInTheDocument()
  })

  it('swaps keyword fields and allows editing the result', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText('查找关键词'), '旧内容')
    await user.type(screen.getByLabelText('替换为'), '新内容')
    await user.click(screen.getByRole('button', { name: '交换内容' }))
    expect(screen.getByLabelText('查找关键词')).toHaveValue('新内容')
    expect(screen.getByLabelText('替换为')).toHaveValue('旧内容')
  })

  it('copies the editable result and reports success', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    renderPage()
    await user.type(screen.getByRole('textbox', { name: '替换结果' }), '可复制结果')
    await user.click(screen.getByRole('button', { name: '复制结果' }))
    expect(writeText).toHaveBeenCalledWith('可复制结果')
    expect(screen.getByText('替换结果已复制到剪贴板')).toBeInTheDocument()
  })

  it('restores and clears the local draft', async () => {
    await saveReplacementDraft({
      version: 1,
      source: '已保存原文',
      search: '原文',
      replacement: '内容',
      result: '已保存内容',
      options: { caseSensitive: false, wholeWord: false, firstOnly: false },
    })
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByDisplayValue('已保存原文')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清空' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '原始文本' })).toHaveValue(''))
    expect(screen.getByText('内容和本机草稿已清空')).toBeInTheDocument()
  })
})
