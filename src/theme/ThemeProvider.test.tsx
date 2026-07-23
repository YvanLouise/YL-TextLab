import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTheme } from './themeContext'
import { ThemeProvider } from './ThemeProvider'

function ThemeProbe() {
  const { theme } = useTheme()
  return <span>{theme}</span>
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('uses light as the first-visit default even when the system prefers dark', async () => {
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    expect(screen.getByText('light')).toBeInTheDocument()
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
  })

  it('restores an explicitly saved theme', () => {
    localStorage.setItem('yl-text-tool:theme', 'dark')
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    expect(screen.getByText('dark')).toBeInTheDocument()
  })
})
