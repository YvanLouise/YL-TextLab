import { ArrowRight, ChevronDown, ChevronRight, Grid2X2, Menu, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { tools, toolCategories } from '../navigation/tools'
import { Brand } from './Brand'
import { ThemeButton } from './ThemeButton'
import { ToolDirectory } from './ToolDirectory'
import styles from './SiteHeader.module.css'

const utilityLinks = [
  { label: '首页', to: '/' },
  { label: '使用帮助', to: '/help' },
  { label: '更新日志', to: '/changelog' },
]

function CategoryMenu() {
  const location = useLocation()
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === location.key
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const isTool = tools.some(tool => tool.path === location.pathname) || location.pathname === '/features'

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector('input')?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenAt(null)
    }
    const mobile = window.matchMedia('(max-width: 980px)')
    const closeOnMobile = () => { if (mobile.matches) setOpenAt(null) }
    mobile.addEventListener('change', closeOnMobile)
    document.addEventListener('pointerdown', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      mobile.removeEventListener('change', closeOnMobile)
    }
  }, [open])

  return <div className={styles.categoryRoot} ref={rootRef}
    onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpenAt(null)
    }} onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        setOpenAt(null)
        triggerRef.current?.focus()
      }
    }}>
    <button ref={triggerRef} type="button" className={`${styles.navLink} ${open || isTool ? styles.active : ''}`}
      aria-expanded={open} aria-controls={id} onClick={() => setOpenAt(open ? null : location.key)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpenAt(location.key) }
      }}>
      工具分类 <ChevronDown size={15} aria-hidden="true" className={open ? styles.rotated : ''} />
    </button>
    {open ? <div ref={panelRef} id={id} className={styles.categoryPanel} role="region" aria-label="工具分类面板">
      <ToolDirectory onNavigate={() => setOpenAt(null)} />
      <footer className={styles.panelFooter}><span>{tools.length} 个工具，按任务快速找到入口</span>
        <Link to="/features" onClick={() => setOpenAt(null)}>查看功能说明 <ArrowRight size={16} aria-hidden="true" /></Link>
      </footer>
    </div> : null}
  </div>
}

function NavigationMenu() {
  const location = useLocation()
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === location.key
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current!
    const trigger = triggerRef.current
    const overflow = document.body.style.overflow
    dialog.showModal()
    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'
    const desktop = window.matchMedia('(min-width: 981px)')
    const closeOnDesktop = () => { if (desktop.matches) setOpenAt(null) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      desktop.removeEventListener('change', closeOnDesktop)
      dialog.close()
      document.body.style.overflow = overflow
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <>
      <button ref={triggerRef} className={styles.menuButton}
        type="button" aria-expanded={open} aria-controls={id} aria-label="打开导航菜单"
        onClick={() => setOpenAt(location.key)}>
        <Menu aria-hidden="true" />
      </button>
      {open ? (
        <dialog ref={dialogRef} className={styles.mobileLayer} aria-label="导航菜单"
          onCancel={(event) => { event.preventDefault(); setOpenAt(null) }}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return
            const controls = event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled)')
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (document.activeElement === (event.shiftKey ? first : last)) {
              event.preventDefault()
              const next = event.shiftKey ? last : first
              next?.focus()
            }
          }}
          onClick={(event) => { if (event.target === event.currentTarget) setOpenAt(null) }}>
          <nav id={id} className={styles.mobileNav} aria-label="移动端导航">
            <div className={styles.mobileTop}>
              <Link to="/" className={styles.mobileTitle} onClick={() => setOpenAt(null)} aria-label="YL文件工具箱首页">
                <span>YL</span>工具导航
              </Link>
              <div><ThemeButton /><button ref={closeRef} className={styles.closeButton} type="button"
                aria-label="关闭导航菜单" onClick={() => setOpenAt(null)}><X aria-hidden="true" /></button></div>
            </div>
            <div className={styles.mobileScroll}>
              <ToolDirectory compactSearch onNavigate={() => setOpenAt(null)} afterSearch={
                <div className={styles.mobileUtilities}>{utilityLinks.map(item =>
                  <NavLink key={item.to} end to={item.to} onClick={() => setOpenAt(null)}>{item.label}</NavLink>)}</div>
              } />
            </div>
            <footer className={styles.mobileFooter}>
              <Link className="button button-primary" to="/features" onClick={() => setOpenAt(null)}>
                全部工具与功能说明 <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </footer>
          </nav>
        </dialog>
      ) : null}
    </>
  )
}

function Header({ toolName, wide = false }: { toolName?: string; wide?: boolean }) {
  const { pathname, key } = useLocation()
  const currentTool = tools.find(tool => tool.path === pathname)
  const category = toolCategories.find(item => item.id === currentTool?.category)
  return (
    <header className={`${styles.header} ${toolName ? styles.toolHeader : ''}`}>
      <div className={`page-shell ${styles.inner} ${wide ? styles.wideInner : ''}`}>
        <Brand />
        <nav className={styles.desktopNav} aria-label="主导航">
          <NavLink end to="/" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}>首页</NavLink>
          <CategoryMenu key={key} />
          {utilityLinks.slice(1).map((item) => (
            <NavLink key={item.to} end={item.to === '/'} to={item.to}
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.actions}>
          <ThemeButton />
          <Link className="button button-primary button-small" to="/features"><Grid2X2 size={16} aria-hidden="true" />全部工具</Link>
          <NavigationMenu key={key} />
        </div>
      </div>
      {toolName ? <div className={`page-shell ${styles.breadcrumb} ${wide ? styles.wideInner : ''}`}>
        <Link to="/features">全部工具</Link><ChevronRight size={13} aria-hidden="true" />
        {category && currentTool ? <><Link to={`/features?tool=${currentTool.id}`}>{category.title}</Link><ChevronRight size={13} aria-hidden="true" /></> : null}
        <span aria-current="page">{toolName}</span>
      </div> : null}
    </header>
  )
}

export function SiteHeader() { return <Header /> }

export function ToolHeader({
  toolName, wide = false,
}: { toolName: string; wide?: boolean; showMobileTheme?: boolean }) {
  return <Header toolName={toolName} wide={wide} />
}
