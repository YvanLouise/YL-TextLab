import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Brand } from './Brand'
import { ThemeButton } from './ThemeButton'
import styles from './SiteHeader.module.css'

const navigation = [
  { label: '首页', to: '/' },
  { label: '功能', to: '/features' },
  { label: '使用帮助', to: '/help' },
  { label: '更新日志', to: '/changelog' },
]

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  return (
    <>
      <header className={styles.header}>
        <div className={`page-shell ${styles.inner}`}>
          <Brand />
          <nav className={styles.desktopNav} aria-label="主导航">
            {navigation.map((item) => (
              <NavLink
                key={item.label}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.active : ''}`
                }
                end={item.to === '/'}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className={styles.actions}>
            <ThemeButton />
            <Link className="button button-primary button-small" to="/replace">
              开始使用
            </Link>
            <button
              className={styles.menuButton}
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label="打开导航菜单"
              onClick={() => setMenuOpen(true)}
            >
              <Menu aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      {menuOpen ? (
        <div className={styles.mobileLayer} role="presentation" onMouseDown={() => setMenuOpen(false)}>
          <nav
            id="mobile-navigation"
            className={styles.mobileNav}
            aria-label="移动端导航"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.mobileTop}>
              <Brand compact />
              <button
                ref={closeButtonRef}
                className={styles.menuButton}
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="关闭导航菜单"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            {navigation.map((item) => (
              <Link
                key={item.label}
                className={styles.mobileLink}
                to={item.to}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link className="button button-primary" to="/replace" onClick={() => setMenuOpen(false)}>
              开始使用
            </Link>
          </nav>
        </div>
      ) : null}
    </>
  )
}

export function ToolHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  return (
    <>
      <header className={`${styles.header} ${styles.toolHeader}`}>
        <div className={`page-shell ${styles.inner}`}>
          <div className={styles.toolBranding}>
            <Brand />
            <span className={styles.divider} aria-hidden="true" />
            <span className={styles.toolName}>文本关键词替换工具</span>
          </div>
          <div className={styles.toolActions}>
            <span className={styles.toolTheme}>
              <ThemeButton />
            </span>
            <button
              className={`${styles.menuButton} ${styles.toolMenuButton}`}
              type="button"
              aria-expanded={menuOpen}
              aria-controls="tool-mobile-navigation"
              aria-label="打开导航菜单"
              onClick={() => setMenuOpen(true)}
            >
              <Menu aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      {menuOpen ? (
        <div className={styles.mobileLayer} role="presentation" onMouseDown={() => setMenuOpen(false)}>
          <nav
            id="tool-mobile-navigation"
            className={styles.mobileNav}
            aria-label="移动端导航"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.mobileTop}>
              <Brand compact />
              <button
                ref={closeButtonRef}
                className={styles.menuButton}
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="关闭导航菜单"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            {navigation.map((item) => (
              <Link
                key={item.label}
                className={styles.mobileLink}
                to={item.to}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  )
}
