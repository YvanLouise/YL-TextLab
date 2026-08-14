import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearNotionSplitDraft,
  loadNotionSplitDraft,
  saveNotionSplitDraft,
} from '../features/notion-splitting/storage'
import { ThemeProvider } from '../theme/ThemeProvider'
import { NotionSplitPage } from './NotionSplitPage'

function renderPage() {
  return render(
    <BrowserRouter>
      <ThemeProvider>
        <NotionSplitPage />
      </ThemeProvider>
    </BrowserRouter>,
  )
}

function makeMultipleChunks() {
  return '第一段。'.repeat(10_000)
}

afterEach(async () => {
  cleanup()
  await clearNotionSplitDraft()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('NotionSplitPage', () => {
  it('automatically splits pasted text and preserves the source content', async () => {
    renderPage()
    const source = '第一段。\n\n第二段包含 emoji 😀。'

    fireEvent.change(screen.getByRole('textbox', { name: '原始文本' }), {
      target: { value: source },
    })

    expect(await screen.findByText('已切分 1 段')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '第 1 段文本' })).toHaveValue(source)
    expect(screen.getByRole('button', { name: '复制下一段' })).toBeEnabled()
  })

  it('accepts only integer limits from 100 through 450 KB', async () => {
    renderPage()
    const limit = screen.getByRole('spinbutton', { name: '每段安全上限' })

    fireEvent.change(limit, { target: { value: '99' } })
    expect(limit).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('请输入 100–450 之间的整数。')).toBeInTheDocument()
    expect(screen.getByText('请先修正安全上限')).toBeInTheDocument()

    fireEvent.change(limit, { target: { value: '451' } })
    expect(limit).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(limit, { target: { value: '100' } })
    expect(limit).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByText(/Notion 手动粘贴超过约 500 KB/)).toBeInTheDocument()

    fireEvent.change(limit, { target: { value: '450' } })
    expect(limit).toHaveAttribute('aria-invalid', 'false')

    fireEvent.change(limit, { target: { value: '100.5' } })
    await waitFor(() => expect(limit).toHaveAttribute('aria-invalid', 'true'))
  })

  it('copies the next un-copied chunk in order', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    renderPage()
    fireEvent.change(screen.getByRole('spinbutton', { name: '每段安全上限' }), {
      target: { value: '100' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: '原始文本' }), {
      target: { value: makeMultipleChunks() },
    })

    expect(await screen.findByText('已切分 2 段')).toBeInTheDocument()
    const firstChunk = screen.getByRole('textbox', { name: '第 1 段文本' })
    await user.click(screen.getByRole('button', { name: '复制下一段' }))

    expect(writeText).toHaveBeenCalledWith((firstChunk as HTMLTextAreaElement).value)
    expect(await screen.findByText('第 1 段已复制，可粘贴到 Notion')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '片段复制进度' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    )
  })

  it('announces a copy failure without advancing progress', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('clipboard denied'))
    renderPage()
    fireEvent.change(screen.getByRole('textbox', { name: '原始文本' }), {
      target: { value: '不能复制的文本' },
    })

    expect(await screen.findByText('已切分 1 段')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复制下一段' }))

    expect(await screen.findByText('第 1 段复制失败，请手动选择文本复制')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '片段复制进度' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
    expect(screen.getByRole('button', { name: '复制下一段' })).toBeEnabled()
  })

  it('resets copied progress when the source content changes', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    renderPage()
    const source = screen.getByRole('textbox', { name: '原始文本' })
    fireEvent.change(source, { target: { value: '第一版文本' } })

    expect(await screen.findByText('已切分 1 段')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复制下一段' }))
    expect(screen.getByRole('progressbar', { name: '片段复制进度' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    )

    fireEvent.change(source, { target: { value: '第二版文本' } })
    expect(screen.getByRole('progressbar', { name: '片段复制进度' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '第 1 段文本' })).toHaveValue('第二版文本')
    })
  })

  it('restores a local draft and clear removes it for the next mount', async () => {
    await saveNotionSplitDraft({
      version: 1,
      source: '已保存的 Notion 草稿',
      options: { maxBytes: 120_000, preferSemanticBoundaries: false },
    })
    const user = userEvent.setup()
    const view = renderPage()

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '原始文本' })).toHaveValue('已保存的 Notion 草稿')
    })
    expect(screen.getByRole('spinbutton', { name: '每段安全上限' })).toHaveValue(120)
    expect(screen.getByRole('checkbox', { name: '优先按段落边界切分' })).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: '清空' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '原始文本' })).toHaveValue(''))
    expect(screen.getByRole('spinbutton', { name: '每段安全上限' })).toHaveValue(400)
    expect(screen.getByRole('checkbox', { name: '优先按段落边界切分' })).toBeChecked()
    await waitFor(async () => expect(await loadNotionSplitDraft()).toBeNull())

    view.unmount()
    renderPage()
    await waitFor(() => expect(screen.getByRole('textbox', { name: '原始文本' })).toHaveValue(''))
  })
})
