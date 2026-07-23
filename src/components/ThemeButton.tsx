import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme/themeContext'
import styles from './ThemeButton.module.css'

export function ThemeButton() {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'light' ? '深色' : '浅色'

  return (
    <button
      className={styles.button}
      type="button"
      onClick={toggleTheme}
      aria-label={`切换为${nextTheme}主题`}
      title={`切换为${nextTheme}主题`}
    >
      {theme === 'light' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  )
}
