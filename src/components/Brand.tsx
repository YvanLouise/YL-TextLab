import { Link } from 'react-router-dom'
import styles from './Brand.module.css'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={styles.brand} to="/" aria-label="YL文件工具箱首页">
      <span className={styles.mark} aria-hidden="true">
        YL
      </span>
      <span className={compact ? styles.compactName : styles.name}>YL文件工具箱</span>
    </Link>
  )
}
