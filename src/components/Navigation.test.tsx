import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '../theme/ThemeProvider'
import { FeaturesPage } from '../pages/FeaturesPage'
import { HomePage } from '../pages/HomePage'
import { SiteHeader } from './SiteHeader'
import { ToolDirectory } from './ToolDirectory'

afterEach(() => { cleanup(); localStorage.clear() })

function Location() { const location = useLocation(); return <span data-testid="location">{location.pathname}{location.search}</span> }

function renderAt(element: React.ReactNode, path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><ThemeProvider>{element}<Location /></ThemeProvider></MemoryRouter>)
}

describe('category navigation', () => {
  it('groups real tool links and marks the active route', () => {
    renderAt(<ToolDirectory />, '/audio-subtract')
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3)
    expect(screen.getAllByRole('link')).toHaveLength(9)
    expect(screen.getByRole('link', { name: '音频相减' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByText('敬请期待')).not.toBeInTheDocument()
  })

  it('filters by use case, handles no matches and resets search', async () => {
    const user = userEvent.setup()
    renderAt(<ToolDirectory />)
    const search = screen.getByRole('searchbox', { name: '搜索工具或用途' })
    await user.type(search, '无损')
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByRole('status')).toHaveTextContent('找到 2 个工具')
    await user.clear(search)
    await user.type(search, 'missing-tool')
    expect(screen.getByText('没有找到相关工具')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '清除工具搜索' }))
    expect(screen.getAllByRole('link')).toHaveLength(9)
    expect(search).toHaveFocus()
  })

  it('opens with the keyboard, closes with Escape and restores focus', async () => {
    const user = userEvent.setup()
    renderAt(<SiteHeader />)
    const trigger = screen.getByRole('button', { name: '工具分类' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    const panel = screen.getByRole('region', { name: '工具分类面板' })
    expect(within(panel).getByRole('searchbox')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: '工具分类面板' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('navigates directly and closes the category panel', async () => {
    const user = userEvent.setup()
    renderAt(<SiteHeader />)
    await user.click(screen.getByRole('button', { name: '工具分类' }))
    await user.click(screen.getByRole('link', { name: '音频相减' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/audio-subtract')
    expect(screen.queryByRole('region', { name: '工具分类面板' })).not.toBeInTheDocument()
  })

  it('closes on an outside click', async () => {
    const user = userEvent.setup()
    renderAt(<><SiteHeader /><button>外部控件</button></>)
    await user.click(screen.getByRole('button', { name: '工具分类' }))
    await user.click(screen.getByRole('button', { name: '外部控件' }))
    expect(screen.getByRole('button', { name: '工具分类' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('restores feature selection from the URL and preserves the static planned tools', async () => {
    const user = userEvent.setup()
    renderAt(<FeaturesPage />, '/features?tool=audioSubtract')
    expect(screen.getByRole('heading', { name: '音频相减' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'PDF 查看' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/features?tool=pdf')
    expect(screen.getByRole('heading', { name: 'PDF 查看' })).toBeVisible()
    expect(screen.getAllByText('敬请期待')).toHaveLength(3)
    expect(screen.queryByRole('link', { name: '文本清理' })).not.toBeInTheDocument()
  })

  it('falls back safely for an unknown tool in a deep link', () => {
    renderAt(<FeaturesPage />, '/features?tool=unknown')
    expect(screen.getByRole('heading', { name: '关键词替换' })).toBeVisible()
  })

  it('filters homepage cards by category and restores the complete overview', async () => {
    const user = userEvent.setup()
    renderAt(<HomePage />)
    expect(screen.getAllByText('敬请期待')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: '音频处理 5' }))
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(screen.queryByRole('heading', { name: 'PDF 查看' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '全部工具 9' }))
    expect(screen.getAllByRole('article')).toHaveLength(12)
    expect(screen.getAllByText('敬请期待')).toHaveLength(3)
  })
})
