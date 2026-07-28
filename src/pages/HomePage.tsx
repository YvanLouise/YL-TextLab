import {
  ArrowRight,
  BarChart3,
  Bolt,
  Check,
  ClipboardList,
  CopyCheck,
  FileText,
  FileSearch,
  Images,
  LockKeyhole,
  Music2,
  RefreshCw,
  ScanText,
  ShieldCheck,
  Sparkles,
  Square,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { SiteHeader } from '../components/SiteHeader'
import styles from './HomePage.module.css'

const upcomingFeatures = [
  {
    title: '文本清理',
    description: '清理文本中的多余空格、换行、特殊字符等，让文本更整洁。',
    icon: ScanText,
    items: ['空格处理', '换行处理', '标点处理', '更多规则…'],
  },
  {
    title: '文本分析',
    description: '统计文本字数、词频等信息，帮助你更好地分析文本内容。',
    icon: FileSearch,
    items: ['字数统计', '词频分析', '关键词提取', '阅读时间估算'],
  },
  {
    title: '批量处理',
    description: '支持批量导入文件进行处理，提高工作效率，节省时间。',
    icon: ClipboardList,
    items: ['文件批量导入', '统一规则处理', '结果导出', '更多格式支持'],
  },
]

const assurances = [
  {
    title: '本地处理',
    description: '文本不上传服务器\n仅保存在本机浏览器',
    icon: ShieldCheck,
  },
  { title: '高效快速', description: '本地计算，响应迅速\n处理大文本也流畅', icon: Bolt },
  { title: '简洁易用', description: '界面简洁直观\n操作简单上手快', icon: Square },
  { title: '数据安全', description: '清空即可删除草稿\n不建立云端副本', icon: LockKeyhole },
]

export function HomePage() {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main>
        <section className={styles.hero}>
          <div className={`page-shell ${styles.heroInner}`}>
            <div className={styles.heroCopy}>
              <h1>
                简单高效的文本处理工具
                <span>让文本处理更轻松</span>
              </h1>
              <p>
                YL文件工具箱是一款专注于文件处理的在线工具，
                <br />
                现已支持关键词替换、PDF 查看、图片与音频格式转换，未来将持续扩展更多实用功能。
              </p>
            </div>
            <div className={styles.heroMedia} aria-hidden="true">
              <img src={`${import.meta.env.BASE_URL}assets/hero-replace.png`} alt="" />
            </div>
            <div className={styles.heroActions}>
              <Link className="button button-primary" to="/replace">
                开始使用 <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link className="button" to="/features">
                查看功能
              </Link>
            </div>
          </div>
        </section>

        <section id="features" className={styles.features} aria-labelledby="features-title">
          <div className="page-shell">
            <div className={styles.sectionHeading}>
              <h2 id="features-title">功能概览</h2>
              <p>关键词替换、PDF 查看、图片与音频格式转换均已上线，更多功能正在开发中。</p>
            </div>
            <div className={styles.featureGrid}>
              <article className={`${styles.featureCard} ${styles.activeCard}`}>
                <div className={styles.cardTop}>
                  <span className={`${styles.iconBox} ${styles.activeIcon}`}>
                    <RefreshCw aria-hidden="true" />
                  </span>
                  <h3>关键词替换</h3>
                  <span className={styles.onlineBadge}>已上线</span>
                </div>
                <p>将文本中的指定关键词替换为新的内容，支持多种匹配选项，精准高效。</p>
                <ul>
                  {['替换全部或第一个匹配项', '区分大小写 / 全字匹配', '实时预览替换结果', '匹配数量统计'].map(
                    (item) => (
                      <li key={item}>
                        <Check aria-hidden="true" /> {item}
                      </li>
                    ),
                  )}
                </ul>
                <Link className={styles.cardLink} to="/replace">
                  立即使用 <ArrowRight aria-hidden="true" />
                </Link>
              </article>

              <article className={`${styles.featureCard} ${styles.activeCard}`}>
                <div className={styles.cardTop}>
                  <span className={`${styles.iconBox} ${styles.activeIcon}`}>
                    <FileText aria-hidden="true" />
                  </span>
                  <h3>PDF 查看</h3>
                  <span className={styles.onlineBadge}>已上线</span>
                </div>
                <p>直接在浏览器打开本机 PDF，支持翻页、缩放、旋转与下载原文件。</p>
                <ul>
                  {['本机文件直接查看', '翻页与页码跳转', '缩放和适应宽度', '旋转与原文件下载'].map((item) => (
                    <li key={item}><Check aria-hidden="true" /> {item}</li>
                  ))}
                </ul>
                <Link className={styles.cardLink} to="/pdf">
                  立即使用 <ArrowRight aria-hidden="true" />
                </Link>
              </article>

              <article className={`${styles.featureCard} ${styles.activeCard}`}>
                <div className={styles.cardTop}>
                  <span className={`${styles.iconBox} ${styles.activeIcon}`}>
                    <Images aria-hidden="true" />
                  </span>
                  <h3>图片格式转换</h3>
                  <span className={styles.onlineBadge}>已上线</span>
                </div>
                <p>单张或批量转换常用图片、应用图标与游戏纹理格式，全程本地完成。</p>
                <ul>
                  {['PNG / JPG / WebP / BMP', 'ICO 单尺寸与多尺寸', 'TGA 与 DDS 游戏格式', '批量转换与 ZIP 下载'].map((item) => (
                    <li key={item}><Check aria-hidden="true" /> {item}</li>
                  ))}
                </ul>
                <Link className={styles.cardLink} to="/image-convert">
                  立即使用 <ArrowRight aria-hidden="true" />
                </Link>
              </article>

              <article className={`${styles.featureCard} ${styles.activeCard}`}>
                <div className={styles.cardTop}>
                  <span className={`${styles.iconBox} ${styles.activeIcon}`}>
                    <Music2 aria-hidden="true" />
                  </span>
                  <h3>音频格式转换</h3>
                  <span className={styles.onlineBadge}>已上线</span>
                </div>
                <p>在浏览器本地转换常用音乐格式，支持质量参数、标签保留与批量下载。</p>
                <ul>
                  {['MP3 / WAV / FLAC / M4A', 'AAC / OGG / Opus 输出', '码率、采样率与声道', '批量转换、试听与 ZIP 下载'].map((item) => (
                    <li key={item}><Check aria-hidden="true" /> {item}</li>
                  ))}
                </ul>
                <Link className={styles.cardLink} to="/audio-convert">
                  立即使用 <ArrowRight aria-hidden="true" />
                </Link>
              </article>

              {upcomingFeatures.map(({ title, description, icon: Icon, items }) => (
                <article className={`${styles.featureCard} ${styles.upcomingCard}`} key={title}>
                  <div className={styles.cardTop}>
                    <span className={styles.iconBox}>
                      <Icon aria-hidden="true" />
                    </span>
                    <h3>{title}</h3>
                    <span className={styles.soonBadge}>敬请期待</span>
                  </div>
                  <p>{description}</p>
                  <ul>
                    {items.map((item) => (
                      <li key={item}>
                        <Check aria-hidden="true" /> {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            <div className={styles.assuranceBand}>
              {assurances.map(({ title, description, icon: Icon }) => (
                <div className={styles.assurance} key={title}>
                  <Icon aria-hidden="true" />
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <span className={styles.decorative} aria-hidden="true">
        <Sparkles />
        <CopyCheck />
        <BarChart3 />
      </span>
    </div>
  )
}
