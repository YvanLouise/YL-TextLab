import { ChevronRight, Search, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { searchTools, toolCategories } from '../navigation/tools'
import type { ToolId } from '../navigation/tools'
import styles from './ToolDirectory.module.css'

interface Props {
  variant?: 'menu' | 'sidebar'
  selected?: ToolId
  onSelect?: (id: ToolId) => void
  onNavigate?: () => void
  afterSearch?: ReactNode
  compactSearch?: boolean
}

export function ToolDirectory({ variant = 'menu', selected, onSelect, onNavigate, afterSearch, compactSearch = false }: Props) {
  const [query, setQuery] = useState('')
  const id = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const filtered = searchTools(query)
  const clearSearch = () => { setQuery(''); searchRef.current?.focus() }

  return <div className={`${styles.directory} ${styles[variant]}`}>
    <div className={styles.search}>
      <Search size={18} aria-hidden="true" />
      <input ref={searchRef} id={`${id}-search`} type="search" aria-label="搜索工具或用途" autoComplete="off"
        placeholder={variant === 'sidebar' || compactSearch ? '搜索工具或用途' : '搜索工具或用途，如：无损、MIDI、替换'}
        value={query} onChange={event => setQuery(event.target.value)} />
      {query ? <button type="button" aria-label="清除工具搜索" onClick={clearSearch}><X size={16} aria-hidden="true" /></button> : null}
    </div>
    {afterSearch}
    <span role="status" className="sr-only">{query ? `找到 ${filtered.length} 个工具` : ''}</span>
    <div className={styles.groups}>
      {toolCategories.map(category => {
        const matches = filtered.filter(tool => tool.category === category.id)
        if (!matches.length) return null
        const CategoryIcon = category.icon
        return <section className={styles.group} key={category.id} aria-labelledby={`${id}-${category.id}`}>
          <header className={styles.groupHeading}>
            <span className={styles.categoryIcon}><CategoryIcon size={22} aria-hidden="true" /></span>
            <div><h2 id={`${id}-${category.id}`}>{category.title}</h2><p>{category.description}</p></div>
            <span className={styles.count}>{matches.length}<span className="sr-only"> 个工具</span></span>
          </header>
          <div className={styles.items}>
            {matches.map(tool => {
              const Icon = tool.icon
              const content = <><Icon size={21} aria-hidden="true" /><span className={styles.copy}>
                <strong>{tool.title}</strong><small id={`${id}-${tool.id}-detail`}>{tool.detail}</small>
              </span><ChevronRight className={styles.arrow} size={16} aria-hidden="true" /></>
              return onSelect ? <button key={tool.id} type="button" aria-label={tool.title}
                aria-pressed={selected === tool.id} aria-describedby={`${id}-${tool.id}-detail`}
                className={`${styles.item} ${selected === tool.id ? styles.active : ''}`}
                onClick={() => onSelect(tool.id)}>{content}</button>
                : <NavLink key={tool.id} to={tool.path} aria-label={tool.title}
                  aria-describedby={`${id}-${tool.id}-detail`} onClick={onNavigate}
                  className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}>{content}</NavLink>
            })}
          </div>
        </section>
      })}
    </div>
    {!filtered.length ? <div className={styles.empty}><strong>没有找到相关工具</strong>
      <p>试试“图片”“无损”或“MIDI”。</p>
      <button className="button button-small" type="button" onClick={clearSearch}>查看全部工具</button>
    </div> : null}
  </div>
}
