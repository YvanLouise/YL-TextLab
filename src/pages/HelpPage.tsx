import {
  ArrowRight,
  ArrowRightLeft,
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
  Rows3,
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
    question: 'Notion 文本切分会改变或遗漏原文吗？',
    answer: '不会。片段会完整保留原文内容和换行，按顺序拼接所有片段即可还原原文。',
  },
  {
    question: '为什么有些片段没有达到字符上限？',
    answer: '工具会优先在段落、换行和句末标点处切分，以减少句子被截断的情况。',
  },
  {
    question: '如何彻底删除本机草稿？',
    answer: '点击关键词替换或 Notion 切分工具中的“清空”，页面内容和对应的本机草稿会同时删除。',
  },
  {
    question: 'GIF 转换后为什么没有动画？',
    answer: '首版图片转换会读取 GIF 的第一帧并输出静态图片，不保留动画时间轴。',
  },
  {
    question: '图片压缩后为什么没有变小？',
    answer: '重新编码不保证文件一定变小，尤其是已优化的图片和无损 PNG。工具会显示实际增减比例；可以设置目标大小并允许自动缩小尺寸，或改用 JPG/WebP。',
  },
  {
    question: '图片压缩会保留拍摄信息吗？',
    answer: '常规压缩重新编码像素，默认移除 EXIF 等拍摄元数据。无损压缩保留色彩配置及 EXIF，以避免改变颜色或照片方向，因此可能保留拍摄信息；需要清除拍摄信息请使用常规压缩。PNG 和 WebP 保留透明度；转 JPG 时按选定背景色合并透明区域。',
  },
  {
    question: '无损压缩和常规压缩有什么区别？',
    answer: '无损压缩支持 PNG/JPG/WebP，保持原格式、尺寸和图像编码内容，不降低质量、不缩放。PNG 优化压缩数据，JPG/WebP 仅清理注释及 XMP 等非显示信息；结果不会增大，但已优化文件可能无法进一步缩减。常规压缩可以降低 JPG/WebP 质量或缩小尺寸以逼近目标大小。',
  },
  {
    question: 'DDS 会保留压缩和 mipmap 吗？',
    answer: 'DDS 输入可读取 DXT1、DXT3、DXT5 和未压缩像素；输出为未压缩 RGBA8，仅包含最高分辨率图层。',
  },
  {
    question: '如何把歌曲拆分为左右声道文件？',
    answer: '打开音频分割工具，选择“左右声道分离”，再导入双声道歌曲。默认分离整首，也可调整开始和结束时间。点击“分离并导出左右声道”，即可分别试听、下载带 _L 和 _R 后缀的单声道文件。默认输出 WAV，可切换为 MP3 或原格式；单声道和多于两个声道的文件会提示不支持分离。',
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
  { title: '质量与大小', badge: 'HQ', description: '有损格式支持推荐档位和自定义码率，并会按歌曲时长估算输出文件大小。' },
  { title: '歌曲信息', badge: 'TAG', description: '可选择“仅修改信息”保持原格式和音质，逐首更新标题、艺术家、专辑、年份、音轨、流派、备注与兼容封面。' },
  { title: '批量转换', badge: 'ZIP', description: '支持顺序转换、进度反馈、单项下载与全部结果 ZIP 打包。' },
]

const notionSplitFeatures = [
  { title: '双重限制', badge: 'SAFE', description: '默认每段不超过 2,000 个可见字符，同时保留 400 KB 字节保护。' },
  { title: '智能边界', badge: 'TEXT', description: '优先沿空行、换行、句末标点和单词边界切分，尽量保持内容连贯。' },
  { title: '逐段复制', badge: 'COPY', description: '每个片段都可独立复制并记录完成状态，方便按顺序粘贴到 Notion。' },
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
          <a href="#notion-split">Notion 文本切分</a>
          <a href="#image-convert">图片转换与压缩</a>
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
              <p>快速了解文本、PDF、图片与音频工具及本机隐私机制。</p>
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

          <section id="notion-split" className={styles.section}>
            <h2>Notion 文本切分</h2>
            <p className={styles.sectionLead}>粘贴长文本后自动生成安全片段，再按顺序逐段复制到 Notion。</p>
            <div className={styles.optionCards}>
              {notionSplitFeatures.map((feature) => (
                <article key={feature.title}>
                  <span>{feature.badge}</span>
                  <div><h3>{feature.title}</h3><p>{feature.description}</p></div>
                </article>
              ))}
            </div>
          </section>

          <section id="image-convert" className={styles.section}>
            <h2>图片转换与压缩</h2>
            <p className={styles.sectionLead}>添加图片后选择格式转换或图片压缩；压缩可选常规或无损方式。单图直接下载，多图可分别下载或打包 ZIP。图片只在本机浏览器中处理。</p>
            <p>点击“文件夹无损压缩”选择整个文件夹，自动读取其中及子目录内的 PNG/JPG/WebP 并启用无损模式；其他文件、空文件夹不处理。文件夹批次最多 500 张、总输入 500 MB，单张不超过 50 MB，单边不超过 8192 px。PNG 解压数据超过 128 MB 会报错跳过，以保护浏览器内存；单项失败不影响其他图片。</p>
            <p>处理后点击“导出到文件夹”，授权目标目录后新建“原目录名-lossless”文件夹，保留文件原名和子目录结构。已有同名结果目录时自动添加编号，不覆盖原文件；取消授权不会丢失结果。浏览器不支持直接写入目录时，可“下载目录 ZIP”并解压。普通单图下载仍直接导出图片；重名文件使用编号子目录避免覆盖。</p>
            <p>无损压缩支持 PNG/JPG/WebP，保持原格式、原尺寸及图像数据。PNG 优化原始压缩数据；JPG/WebP 仅清理注释、文本或 XMP 等非显示信息，不重新编码图像。保留透明度、色彩配置及 EXIF，可能保留拍摄信息。无损模式不提供质量、目标大小或缩放设置，不能安全减小时会保留原文件内容。</p>
            <p>常规压缩默认保留 PNG、JPG、WebP 原格式；其他可读取格式请选 WebP 或 JPG。JPG/WebP 可用质量预设或滑块调整，PNG 保留格式时采用无损重新编码，但缩小尺寸会改变分辨率。目标大小可设为每张 1–50,000 KB，工具先尝试原尺寸下的质量，再按比例缩小；若无法达标或输出反而变大，文件行会明确显示。可打开原图与结果对比，批量处理中也可停止，已完成结果会保留。常规压缩结果默认移除 EXIF 等元数据。</p>
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
            <p>音频转换、无损压缩和歌曲信息编辑支持单文件最多 500 MB，每批最多 100 个文件、总输入最多 2 GB。音视频分割与左右声道分离也支持单文件最多 500 MB。大文件处理需要足够的设备内存，建议使用电脑浏览器。</p>
            <p>选择“无损压缩”可将 16/24 位整数 PCM WAV、AIFF 或 FLAC 压缩为 FLAC，保留原采样率、位深和声道。处理后校验全部采样数据，显示前后大小、节省比例与校验结果；可批量处理、停止及下载 ZIP。</p>
            <p>可多选音频或拖入整个文件夹，也可点击“文件夹无损压缩”。文件夹内及子目录中的 WAV/AIFF/FLAC 会自动进入无损模式，其他文件会跳过并统计。ZIP 保留目录结构，同名结果自动编号；空目录不导出。拖入目录最多扫描 10,000 项或 64 层，超过时会提示。</p>
            <p>批量处理显示整批进度和体积汇总。单项失败后继续处理其他音频，可点击“重试失败项”单独重试；停止后再开始会继续未完成项，已完成结果仍可下载。</p>
            <p>已有 FLAC 可能无法进一步减小。保留元数据且没有修改标签或封面时，重压缩未减小会保留原 FLAC 内容；其他情况会如实显示体积变化。MP3、AAC 等有损音频不能通过转换恢复音质，浮点及其他位深暂不支持此模式。歌曲标签与兼容封面会按设置保留，无损指音频采样一致，不代表容器文件字节不变。</p>
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
                <p>文本、PDF、图片、音频和视频始终只在当前浏览器本机处理。</p>
              </article>
              <article>
                <HardDrive aria-hidden="true" />
                <h3>仅文本保存草稿</h3>
                <p>关键词替换和 Notion 切分文本仅保存在本机浏览器；PDF、图片、音频与视频不会保存草稿。</p>
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
              <Rows3 aria-hidden="true" />
            </span>
            <div>
              <h2>准备好切分长文本了吗？</h2>
              <p>粘贴内容后自动生成安全片段，并逐段复制到 Notion。</p>
            </div>
            <Link className="button button-primary" to="/notion-split">
              打开 Notion 切分工具 <ArrowRight aria-hidden="true" />
            </Link>
          </section>
        </div>
      </main>
      <Footer />
      <span className="sr-only">
        <FileText /> <ListChecks /> <ArrowRightLeft /> <Images /> <Layers3 /> <Music2 /> <Rows3 />
      </span>
    </div>
  )
}
