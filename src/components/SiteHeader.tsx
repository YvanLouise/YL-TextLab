import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Brand } from './Brand'
import { ThemeButton } from './ThemeButton'
import styles from './SiteHeader.module.css'

const navigation = [
  { label: '首页', to: '/' },
  { label: '功能', to: '/features' },
  { label: 'Notion 切分', to: '/notion-split' },
  { label: 'PDF 查看', to: '/pdf' },
  { label: '图片转换', to: '/image-convert' },
  { label: '音频转换', to: '/audio-convert' },
  { label: '音频分割', to: '/audio-split' },
  { label: '使用帮助', to: '/help' },
  { label: '更新日志', to: '/changelog' },
]

function NavigationMenu({ tool = false }: { tool?: boolean }) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const id = tool ? 'tool-mobile-navigation' : 'mobile-navigation'

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current!
    const trigger = triggerRef.current
    const overflow = document.body.style.overflow
    dialog.showModal()
    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <>
      <button ref={triggerRef} className={`${styles.menuButton} ${tool ? styles.toolMenuButton : ''}`}
        type="button" aria-expanded={open} aria-controls={id} aria-label="打开导航菜单"
        onClick={() => setOpen(true)}>
        <Menu aria-hidden="true" />
      </button>
      {open ? (
        <dialog ref={dialogRef} className={styles.mobileLayer} aria-label="导航菜单"
          onCancel={(event) => { event.preventDefault(); setOpen(false) }}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return
            const controls = event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (document.activeElement === (event.shiftKey ? first : last)) {
              event.preventDefault()
              const next = event.shiftKey ? last : first
              next?.focus()
            }
          }}
          onClick={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
          <nav id={id} className={styles.mobileNav} aria-label="移动端导航">
            <div className={styles.mobileTop}>
              <Brand compact />
              <button ref={closeRef} className={styles.menuButton} type="button"
                aria-label="关闭导航菜单" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
            </div>
            {navigation.map((item) => (
              <NavLink key={item.to} end={item.to === '/'} className={styles.mobileLink}
                to={item.to} onClick={() => setOpen(false)}>{item.label}</NavLink>
            ))}
            <Link className="button button-primary" to="/replace" onClick={() => setOpen(false)}>关键词替换</Link>
          </nav>
        </dialog>
      ) : null}
    </>
  )
}

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={`page-shell ${styles.inner}`}>
        <Brand />
        <nav className={styles.desktopNav} aria-label="主导航">
          {navigation.map((item) => (
            <NavLink key={item.to} end={item.to === '/'} to={item.to}
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.actions}>
          <ThemeButton />
          <Link className="button button-primary button-small" to="/replace">开始使用</Link>
          <NavigationMenu />
        </div>
      </div>
    </header>
  )
}

export function ToolHeader({
  toolName, wide = false, showMobileTheme = false,
}: { toolName: string; wide?: boolean; showMobileTheme?: boolean }) {
  return (
    <header className={`${styles.header} ${styles.toolHeader}`}>
      <div className={`page-shell ${styles.inner} ${wide ? styles.wideInner : ''}`}>
        <div className={styles.toolBranding}>
          <Brand />
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.toolName}>{toolName}</span>
        </div>
        <div className={styles.toolActions}>
          <span className={`${styles.toolTheme} ${showMobileTheme ? styles.mobileToolTheme : ''}`}><ThemeButton /></span>
          <NavigationMenu tool />
        </div>
      </div>
    </header>
  )
}
