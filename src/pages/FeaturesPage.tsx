import {
  ArrowRight,
  CaseSensitive,
  Check,
  ClipboardCopy,
  ClipboardList,
  FileSearch,
  FileText,
  RefreshCw,
  ScanText,
  Search,
  Settings2,
  WholeWord,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { SiteHeader } from '../components/SiteHeader'
import styles from './FeaturesPage.module.css'

const featureRail = [
  { title: '关键词替换', status: '已上线', icon: RefreshCw, active: true },
  { title: '文本清理', status: '敬请期待', icon: ScanText, active: false },
  { title: '文本分析', status: '敬请期待', icon: FileSearch, active: false },
  { title: '批量处理', status: '敬请期待', icon: ClipboardList, active: false },
]

const workflowSteps = [
  {
    title: '输入与设置',
    description: '输入原文与替换内容，按需选择大小写、全字和仅首项规则。',
    icon: Settings2,
  },
  {
    title: '精准匹配',
    description: '系统按普通文本完成非重叠匹配，并用蓝色标出原文位置。',
    icon: Search,
  },
  {
    title: '编辑与复制',
    description: '结果使用绿色高亮，可继续手工编辑，再一键复制使用。',
    icon: ClipboardCopy,
  },
]

const rules = [
  {
    title: '普通文本',
    description: '查找内容始终按字面量处理，正则符号和替换值中的 $ 不会被解释。',
    useCase: '适用于大多数常规替换需求',
    icon: FileText,
  },
  {
    title: '区分大小写',
    description: '开启后严格区分英文大小写，关闭时默认忽略大小写差异。',
    useCase: '适用于变量名、型号或专有名称',
    icon: CaseSensitive,
  },
  {
    title: '全字匹配',
    description: '英文、数字和下划线按单词边界匹配，中文及混合词按完整字符串匹配。',
    useCase: '避免替换词组中的局部内容',
    icon: WholeWord,
  },
  {
    title: '仅替换第一个',
    description: '每次执行只处理原文中第一个符合当前规则的匹配项。',
    useCase: '适用于只需修改首次出现位置',
    icon: RefreshCw,
  },
]

function DemoText({ result = false }: { result?: boolean }) {
  return (
    <div className={styles.demoText}>
      <p>
        <mark className={result ? styles.resultMark : styles.sourceMark}>
          {result ? '悦联智能' : '易联科技'}
        </mark>
        致力于为企业提供高效、稳定、安全的数字化解决方案。
      </p>
      <p>
        选择
        <mark className={result ? styles.resultMark : styles.sourceMark}>
          {result ? '悦联智能' : '易联科技'}
        </mark>
        ，选择值得信赖的合作伙伴。
      </p>
    </div>
  )
}

export function FeaturesPage() {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main>
        <section className={`page-shell ${styles.featureDetail}`} aria-labelledby="replacement-title">
          <aside className={styles.featureRail} aria-label="功能列表">
            <ul>
              {featureRail.map(({ title, status, icon: Icon, active }) => (
                <li className={active ? styles.activeFeature : styles.upcomingFeature} key={title}>
                  <span className={styles.railIcon}>
                    <Icon aria-hidden="true" />
                  </span>
                  <strong>{title}</strong>
                  <span>{status}</span>
                </li>
              ))}
            </ul>
          </aside>

          <div className={styles.featureBody}>
            <header className={styles.featureHeading}>
              <div>
                <h1 id="replacement-title">关键词替换</h1>
                <p>精准查找文本中的指定关键词，并按规则替换为新的内容。</p>
              </div>
              <Link className={styles.textLink} to="/replace">
                打开工具 <ArrowRight aria-hidden="true" />
              </Link>
            </header>

            <div className={styles.workflow}>
              {workflowSteps.map(({ title, description, icon: Icon }, index) => (
                <article key={title}>
                  <span className={styles.stepNumber}>{index + 1}</span>
                  <Icon aria-hidden="true" />
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                  {index < workflowSteps.length - 1 ? (
                    <ArrowRight className={styles.stepArrow} aria-hidden="true" />
                  ) : null}
                </article>
              ))}
            </div>

            <section className={styles.demoPanel} aria-labelledby="demo-title">
              <header className={styles.demoHeader}>
                <div>
                  <h3 id="demo-title">关键词替换预览</h3>
                  <p>蓝色显示原文匹配，绿色显示替换后的内容。</p>
                </div>
                <span className={styles.done}>已替换 2 处</span>
              </header>

              <div className={styles.demoGrid}>
                <div className={styles.demoSettings}>
                  <strong>替换设置</strong>
                  <label>
                    查找关键词
                    <span>易联科技</span>
                  </label>
                  <label>
                    替换为
                    <span>悦联智能</span>
                  </label>
                  <ul aria-label="示例匹配选项">
                    <li><Check aria-hidden="true" /> 不区分大小写</li>
                    <li><Check aria-hidden="true" /> 全字匹配</li>
                    <li>仅替换第一个：关闭</li>
                  </ul>
                  <Link className="button button-primary" to="/replace">
                    体验此流程
                  </Link>
                </div>
                <article className={styles.demoDocument}>
                  <header><strong>原始文本</strong><span>32 字符</span></header>
                  <DemoText />
                </article>
                <span className={styles.demoArrow} aria-hidden="true"><ArrowRight /></span>
                <article className={styles.demoDocument}>
                  <header><strong>替换结果</strong><span>32 字符</span></header>
                  <DemoText result />
                </article>
              </div>
            </section>

            <section id="matching-rules" className={styles.rules} aria-labelledby="rules-title">
              <header>
                <h2 id="rules-title">匹配规则一览</h2>
                <p>选择合适的匹配规则，精确控制替换范围。</p>
              </header>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>规则</th>
                      <th>说明</th>
                      <th>适用场景</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(({ title, description, useCase, icon: Icon }) => (
                      <tr key={title}>
                        <th scope="row"><Icon aria-hidden="true" /> {title}</th>
                        <td data-label="规则说明">{description}</td>
                        <td data-label="适用场景">{useCase}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
