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
  Images,
  Layers3,
  ListChecks,
  Music2,
  Palette,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
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
  {
    question: 'GIF 转换后为什么没有动画？',
    answer: '首版图片转换会读取 GIF 的第一帧并输出静态图片，不保留动画时间轴。',
  },
  {
    question: 'DDS 会保留压缩和 mipmap 吗？',
    answer: 'DDS 输入可读取 DXT1、DXT3、DXT5 和未压缩像素；输出为未压缩 RGBA8，仅包含最高分辨率图层。',
  },
  {
    question: '转换音频会上传歌曲吗？',
    answer: '不会。音频和转换结果都只存在于当前浏览器页面，离开页面或清空列表后不会保留。',
  },
  {
    question: '为什么部分音频没有保留封面？',
    answer: '不同格式对封面的支持不同。工具会优先保留兼容封面；不兼容时会保留音频与文本标签并给出提示。',
  },
]

const imageFormats = [
  { title: '常用图片', badge: 'IMG', description: 'PNG、JPG、WebP、BMP 可作为输入与输出；GIF 读取第一帧，AVIF 取决于浏览器解码能力。' },
  { title: '应用图标', badge: 'ICO', description: 'ICO 可输出单一尺寸，也可一次生成 16 至 256 像素的多分辨率图标。' },
  { title: '游戏素材', badge: 'TGA', description: '支持 24/32 位 TGA 与常见 DDS 纹理；DDS 输出为兼容性较好的未压缩 RGBA8。' },
]

const audioFormats = [
  { title: '主流输出', badge: 'MP3', description: '支持输出 MP3、WAV、FLAC、M4A、AAC、OGG 与 Opus；WMA、AIFF 可作为输入。' },
  { title: '质量参数', badge: 'HQ', description: '有损格式提供实用质量档位，并可选择保持原始、44.1 kHz 或 48 kHz 采样率。' },
  { title: '标签与批量', badge: 'ZIP', description: '尽力保留标准歌曲标签，支持顺序转换、单项下载与 ZIP 打包。' },
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
          <a href="#image-convert">图片格式转换</a>
          <a href="#audio-convert">音频格式转换</a>
          <a href="#matching">匹配选项说明</a>
          <a href="#privacy">数据与草稿</a>
          <a href="#faq">常见问题</a>
          <a href="#about-author">关于作者</a>
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
              <p>快速了解关键词替换、PDF、图片与音频工具及本机隐私机制。</p>
            </div>
            <img
              src={`${import.meta.env.BASE_URL}assets/help-illustration.png`}
              alt=""
              aria-hidden="true"
            />
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

          <section id="image-convert" className={styles.section}>
            <h2>图片格式转换</h2>
            <p className={styles.sectionLead}>单图与批量使用相同流程：添加图片、选择目标格式、执行转换并下载结果。</p>
            <div className={styles.optionCards}>
              {imageFormats.map((format) => (
                <article key={format.title}>
                  <span>{format.badge}</span>
                  <div><h3>{format.title}</h3><p>{format.description}</p></div>
                </article>
              ))}
            </div>
          </section>

          <section id="audio-convert" className={styles.section}>
            <h2>音频格式转换</h2>
            <p className={styles.sectionLead}>添加单首或多首音频，选择目标格式与质量参数，在本机依次完成转换。</p>
            <div className={styles.optionCards}>
              {audioFormats.map((format) => (
                <article key={format.title}>
                  <span>{format.badge}</span>
                  <div><h3>{format.title}</h3><p>{format.description}</p></div>
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
                <p>文本、PDF、图片和音频始终只在当前浏览器本机处理。</p>
              </article>
              <article>
                <HardDrive aria-hidden="true" />
                <h3>仅文本保存草稿</h3>
                <p>关键词替换会保存本机草稿；PDF、图片和音频文件不会保存。</p>
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

          <section id="about-author" className={styles.section}>
            <h2>关于作者</h2>
            <article className={styles.authorCard}>
              <span className={styles.authorIcon}>
                <UserRound aria-hidden="true" />
              </span>
              <div>
                <p>作者</p>
                <h3>YvanLouise</h3>
                <span>YL文件工具箱的设计与开发者</span>
              </div>
            </article>
          </section>

          <section className={styles.ctaBand}>
            <span>
              <CheckCircle2 aria-hidden="true" />
            </span>
            <div>
              <h2>准备好转换音频了吗？</h2>
              <p>添加单首或多首音频，在本机完成格式转换。</p>
            </div>
            <Link className="button button-primary" to="/audio-convert">
              打开音频转换工具 <ArrowRight aria-hidden="true" />
            </Link>
          </section>
        </div>
      </main>
      <Footer />
      <span className="sr-only">
        <FileText /> <ListChecks /> <ArrowRightLeft /> <Images /> <Layers3 /> <Music2 />
      </span>
    </div>
  )
}
