import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      © {new Date().getFullYear()} YL文件工具箱. All rights reserved.
    </footer>
  )
}
