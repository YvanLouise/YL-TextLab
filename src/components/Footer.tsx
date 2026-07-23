import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      © {new Date().getFullYear()} YL文本处理功能. All rights reserved.
    </footer>
  )
}
