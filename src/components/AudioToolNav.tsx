import { NavLink } from 'react-router-dom'
import { tools } from '../navigation/tools'
import styles from './AudioToolNav.module.css'

const audioTools = tools.filter(tool => tool.category === 'audio')

export function AudioToolNav() {
  return <nav className={styles.nav} aria-label="音频工具导航">{audioTools.map(({ path: to, audioLabel: label, detail, icon: Icon }) =>
    <NavLink key={to} to={to} className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
      <Icon size={19} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span>
    </NavLink>)}
  </nav>
}
