import {
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  ClipboardPaste,
  CloudOff,
  Copy,
  FileText,
  HardDrive,
  HelpCircle,
  ListChecks,
  Palette,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { SiteHeader } from '../components/SiteHeader'
import styles from './ContentPage.module.css'

const steps = [
  { title: '输入原始文本', description: '粘贴或输入需要处理的文本。', icon: ClipboardPaste },
  { title: '填写替换内容', description: '设置要查找的关键词和替换内容。', icon: Search },
  { title: '选择匹配规则', description: '按需要开启匹配选项并执行替换。', icon: Settings2 },
  { title: '检查并复制结果', description: '确认结果，也可继续编辑后复制。', icon: Copy },
]

const matchOptions = [
  {
    title: '区分大小写',
    badge: 'Aa',
    description: '开启后，英文大小写必须完全一致；例如 Hello 与 hello 会被视为不同内容。',
  },
  {
    title: '全字匹配',
    badge: '[ ]',
    description: '英文和数字按单词边界匹配；中文或中英混合内容按连续的完整关键词匹配。',
  },
  {
    title: '仅替换第一个',
    badge: '1st',
    description: '无论原文中存在多少处匹配，每次执行仅替换第一个符合规则的内容。',
  },
]

const faqs = [
  {
    question: '查找关键词可以为空吗？',
    answer: '不可以。关键词用于确定匹配位置；替换内容可以留空，此时会删除匹配项。',
  },
  {
    question: '没有找到匹配内容怎么办？',
    answer: '请检查关键词是否正确，并确认“区分大小写”或“全字匹配”是否限制了匹配范围。',
  },
  {
    question: '“交换内容”会交换什么？',
    answer: '它只交换“查找关键词”和“替换为”两个输入框，方便快速进行反向替换。',
  },
  {
    question: '替换结果可以编辑吗？',
    answer: '可以。你可以在结果区继续修改后复制；再次执行替换时会根据原文重新生成结果。',
  },
  {
    question: '如何彻底删除本机草稿？',
    answer: '点击替换工具中的“清空”，页面内容和浏览器本机保存的草稿会同时删除。',
  },
]

export function HelpPage() {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={`page-shell ${styles.contentLayout}`}>
        <aside className={styles.sideRail} aria-label="帮助目录">
          <div className={styles.sideTitle}>
            <HelpCircle aria-hidden="true" /> 使用帮助
          </div>
          <a href="#quick-start">快速开始</a>
          <a href="#matching">匹配选项说明</a>
          <a href="#privacy">数据与草稿</a>
          <a href="#faq">常见问题</a>
          <div className={styles.sideTip}>
            <ShieldCheck aria-hidden="true" />
            <strong>小贴士</strong>
            <p>所有处理都在本机完成，无需联网即可安全使用。</p>
          </div>
        </aside>

        <div className={styles.document}>
          <header className={styles.pageIntro}>
            <div>
              <h1>使用帮助</h1>
              <p>快速了解关键词替换工具的使用方法、匹配规则和本机草稿机制。</p>
            </div>
            <img src="/assets/help-illustration.png" alt="" aria-hidden="true" />
          </header>

          <section id="quick-start" className={styles.section}>
            <h2>快速开始</h2>
            <div className={styles.steps}>
              {steps.map(({ title, description, icon: Icon }, index) => (
                <article key={title}>
                  <span className={styles.stepNumber}>{index + 1}</span>
                  <Icon aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{description}</p>
                  {index < steps.length - 1 ? <ArrowRight className={styles.stepArrow} /> : null}
                </article>
              ))}
            </div>
          </section>

          <section id="matching" className={styles.section}>
            <h2>匹配选项说明</h2>
            <p className={styles.sectionLead}>所有查找内容都按普通文本处理，不会被解释为正则表达式。</p>
            <div className={styles.optionCards}>
              {matchOptions.map((option) => (
                <article key={option.title}>
                  <span>{option.badge}</span>
                  <div>
                    <h3>{option.title}</h3>
                    <p>{option.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="privacy" className={styles.section}>
            <h2>数据与草稿</h2>
            <div className={styles.privacyGrid}>
              <article>
                <CloudOff aria-hidden="true" />
                <h3>不上传服务器</h3>
                <p>原文、关键词和结果始终只在浏览器本机处理。</p>
              </article>
              <article>
                <HardDrive aria-hidden="true" />
                <h3>自动保存草稿</h3>
                <p>输入内容自动保存在当前浏览器，刷新后可以继续。</p>
              </article>
              <article>
                <Trash2 aria-hidden="true" />
                <h3>清空即删除</h3>
                <p>“清空”会同步删除页面内容和本机保存的草稿。</p>
              </article>
              <article>
                <Palette aria-hidden="true" />
                <h3>记住主题</h3>
                <p>深浅主题偏好同样只保存在本机浏览器。</p>
              </article>
            </div>
          </section>

          <section id="faq" className={styles.section}>
            <h2>常见问题</h2>
            <div className={styles.faqGrid}>
              {faqs.map((faq) => (
                <details key={faq.question}>
                  <summary>
                    <HelpCircle aria-hidden="true" /> {faq.question}
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className={styles.ctaBand}>
            <span>
              <CheckCircle2 aria-hidden="true" />
            </span>
            <div>
              <h2>准备好开始处理文本了吗？</h2>
              <p>打开关键词替换工具，体验高效、私密的文本处理。</p>
            </div>
            <Link className="button button-primary" to="/replace">
              打开关键词替换工具 <ArrowRight aria-hidden="true" />
            </Link>
          </section>
        </div>
      </main>
      <Footer />
      <span className="sr-only">
        <FileText /> <ListChecks /> <ArrowRightLeft />
      </span>
    </div>
  )
}
