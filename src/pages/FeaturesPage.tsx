import {
  ArrowDown,
  ArrowRight,
  Archive,
  BarChart3,
  CaseSensitive,
  Check,
  ChevronRight,
  ClipboardCopy,
  ClipboardList,
  Download,
  FileText,
  FolderOpen,
  Images,
  Layers3,
  LockKeyhole,
  Maximize2,
  Music2,
  RefreshCw,
  RotateCw,
  Rows3,
  ScanText,
  Scissors,
  Search,
  Settings2,
  ShieldCheck,
  UploadCloud,
  WholeWord,
  ZoomIn,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { SiteHeader } from '../components/SiteHeader'
import styles from './FeaturesPage.module.css'

type ToolId = 'replace' | 'notionSplit' | 'pdf' | 'image' | 'audio' | 'audioSplit'

interface ToolNavigationItem {
  id: ToolId
  title: string
  icon: LucideIcon
}

const liveTools: ToolNavigationItem[] = [
  { id: 'replace', title: '关键词替换', icon: Search },
  { id: 'notionSplit', title: 'Notion 文本切分', icon: Rows3 },
  { id: 'pdf', title: 'PDF 查看', icon: FileText },
  { id: 'image', title: '图片格式转换', icon: Images },
  { id: 'audio', title: '音频格式转换', icon: Music2 },
  { id: 'audioSplit', title: '音频分割与提取', icon: Scissors },
]

const plannedTools = [
  { title: '文本清理', icon: ScanText },
  { title: '文本分析', icon: BarChart3 },
  { title: '批量处理', icon: ClipboardList },
]

const replacementWorkflow = [
  {
    title: '输入与设置',
    description: '输入原文本并设置查找与替换内容，选择匹配规则。',
    icon: Settings2,
  },
  {
    title: '精准匹配',
    description: '按所选规则查找关键词，高亮显示匹配结果。',
    icon: Search,
  },
  {
    title: '编辑与复制',
    description: '查看替换预览，确认无误后一键复制使用。',
    icon: ClipboardCopy,
  },
]

const replacementRules = [
  {
    title: '普通文本',
    description: '按普通文本匹配，不支持正则表达式或通配符。',
    icon: FileText,
  },
  {
    title: '区分大小写',
    description: '匹配时区分英文大小写，例如“YL”与“yl”被视为不同内容。',
    icon: CaseSensitive,
  },
  {
    title: '全字匹配',
    description: '仅匹配完整的词，避免替换词组中的局部内容。',
    icon: WholeWord,
  },
  {
    title: '仅替换第一个',
    description: '只替换首次匹配的结果，其余匹配保持不变。',
    icon: RefreshCw,
  },
]

const notionSplitWorkflow = [
  {
    title: '粘贴长文本',
    description: '将准备粘贴到 Notion 的长文本放入工具。',
    icon: FileText,
  },
  {
    title: '智能切分',
    description: '按 UTF-8 字节上限，优先在段落与句子边界切分。',
    icon: Rows3,
  },
  {
    title: '逐段复制',
    description: '按顺序复制每个片段，并依次粘贴到 Notion。',
    icon: ClipboardCopy,
  },
]

const notionSplitCapabilities = [
  { title: '安全上限', description: '每个片段都不超过设定的 UTF-8 字节数，并可在 100–450 KB 间调整。', icon: Settings2 },
  { title: '智能边界', description: '优先保留空行、换行、句末标点和单词边界。', icon: Rows3 },
  { title: '完整保留', description: '不删减原文内容与换行，按顺序拼接即可还原原文。', icon: FileText },
  { title: '本地隐私', description: '文本仅保存在本机浏览器，不上传服务器，可通过清空删除草稿。', icon: LockKeyhole },
]

const pdfWorkflow = [
  { title: '选择文件', description: '从本机选择需要阅读的 PDF。', icon: FolderOpen },
  { title: '本地解析', description: '浏览器直接解析，不上传文件。', icon: ShieldCheck },
  { title: '阅读与下载', description: '翻页、缩放、旋转并下载原文件。', icon: Download },
]

const pdfCapabilities = [
  { title: '翻页与跳转', description: '使用按钮或页码快速定位内容。', icon: RefreshCw },
  { title: '缩放与适应宽度', description: '按阅读场景调整页面显示比例。', icon: ZoomIn },
  { title: '旋转与下载', description: '调整页面方向，并随时下载原文件。', icon: RotateCw },
  { title: '本地隐私', description: '文件仅在当前浏览器中读取，不会上传。', icon: LockKeyhole },
]

const imageWorkflow = [
  { title: '添加图片', description: '选择单张图片，或拖拽多张文件批量处理。', icon: UploadCloud },
  { title: '选择格式', description: '统一设置目标格式、质量、背景或 ICO 尺寸。', icon: Settings2 },
  { title: '本地下载', description: '逐项下载结果，或将全部文件打包为 ZIP。', icon: Archive },
]

const imageCapabilities = [
  { title: '常用图片', description: 'PNG、JPG、WebP 与 BMP 相互转换。', icon: Images },
  { title: '应用图标', description: '生成单尺寸或多分辨率 ICO 文件。', icon: Layers3 },
  { title: '游戏素材', description: '读取与输出 TGA，并处理常见 DDS 纹理。', icon: Archive },
  { title: '本地隐私', description: '图片不上传服务器，也不保存在浏览器草稿中。', icon: LockKeyhole },
]

const audioWorkflow = [
  { title: '添加音频', description: '选择单首音乐，或拖拽多个文件加入队列。', icon: UploadCloud },
  { title: '设置处理方式', description: '转换格式与质量，或仅修改信息并保持原音质。', icon: Settings2 },
  { title: '试听下载', description: '逐项试听与下载，或将结果打包为 ZIP。', icon: Archive },
]

const audioCapabilities = [
  { title: '主流格式', description: '输出 MP3、WAV、FLAC、M4A、AAC、OGG 与 Opus。', icon: Music2 },
  { title: '实用参数', description: '按格式设置质量，并可调整采样率与声道。', icon: Settings2 },
  { title: '标签与封面', description: '尽力保留歌曲标签，以及目标容器兼容的封面。', icon: FileText },
  { title: '原音质编辑', description: '使用音频流复制，只修改歌曲信息，不重新编码。', icon: FileText },
  { title: '本地隐私', description: '音频不会上传，也不会保存在浏览器草稿中。', icon: LockKeyhole },
]

const audioSplitWorkflow = [
  { title: '添加媒体', description: '选择需要截取的音频，或需要提取音轨的视频。', icon: UploadCloud },
  { title: '选择区域', description: '拖动波形边界，或输入精确的开始与结束时间。', icon: Scissors },
  { title: '试听导出', description: '试听所选区域，并导出原格式、MP3 或 WAV。', icon: Download },
]

const audioSplitCapabilities = [
  { title: '波形选择', description: '在可视化波形上直接调整片段范围。', icon: Scissors },
  { title: '精确时间', description: '支持毫秒级开始时间、结束时间和时长显示。', icon: Settings2 },
  { title: '视频音轨', description: '从 MP4、MOV、WebM、MKV、AVI 中提取指定音频区域。', icon: Music2 },
  { title: '本地隐私', description: '音视频只在浏览器本地处理，不会上传服务器。', icon: LockKeyhole },
]

function ToolNavigation({ selected, onSelect }: { selected: ToolId; onSelect: (id: ToolId) => void }) {
  return (
    <aside className={styles.toolNavigation} aria-label="功能选择">
      <div className={styles.navigationGroup}>
        <h2>已上线</h2>
        <div className={styles.navigationItems}>
          {liveTools.map(({ id, title, icon: Icon }) => (
            <button
              className={selected === id ? styles.selectedTool : ''}
              type="button"
              aria-pressed={selected === id}
              onClick={() => onSelect(id)}
              key={id}
            >
              <Icon aria-hidden="true" />
              <span>{title}</span>
              <ChevronRight className={styles.rowArrow} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className={`${styles.navigationGroup} ${styles.plannedGroup}`}>
        <h2>计划中</h2>
        <div className={styles.navigationItems}>
          {plannedTools.map(({ title, icon: Icon }) => (
            <div className={styles.plannedTool} key={title} aria-disabled="true">
              <Icon aria-hidden="true" />
              <span>{title}</span>
              <small>敬请期待</small>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

function Workflow({ items }: { items: typeof replacementWorkflow }) {
  return (
    <section className={styles.workflow} aria-label="使用流程">
      {items.map(({ title, description, icon: Icon }, index) => (
        <article key={title}>
          <span className={styles.workflowIcon}><Icon aria-hidden="true" /></span>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          {index < items.length - 1 ? <ChevronRight className={styles.workflowArrow} aria-hidden="true" /> : null}
        </article>
      ))}
    </section>
  )
}

function ReplacementFeature() {
  return (
    <div className={styles.featureContent}>
      <header className={styles.featureHeader}>
        <span className={styles.featureIcon}><Search aria-hidden="true" /></span>
        <div>
          <h2>关键词替换</h2>
          <p>精准查找文本中的指定关键词，并按规则替换为新的内容。</p>
        </div>
        <Link className="button button-primary" to="/replace">
          打开工具 <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <section className={styles.transformPreview} aria-labelledby="preview-title">
        <h3 id="preview-title" className="sr-only">关键词替换效果预览</h3>
        <article className={`${styles.previewDocument} ${styles.sourceDocument}`}>
          <header><FileText aria-hidden="true" /><strong>源文本（示例）</strong></header>
          <div className={styles.previewText}>
            <p>YL文件工具箱是一款简单易用的 <mark>本地</mark> 工具，</p>
            <p>支持关键词替换与 PDF 查看。数据仅在 <mark>本地</mark> 处理。</p>
          </div>
          <footer><span>查找：<strong>本地</strong></span><span>替换为：<strong>离线</strong></span></footer>
        </article>

        <span className={styles.transformArrow} aria-hidden="true"><ArrowRight /><ArrowDown /></span>

        <article className={`${styles.previewDocument} ${styles.resultDocument}`}>
          <header><FileText aria-hidden="true" /><strong>替换结果（预览）</strong></header>
          <div className={styles.previewText}>
            <p>YL文件工具箱是一款简单易用的 <mark>离线</mark> 工具，</p>
            <p>支持关键词替换与 PDF 查看。数据仅在 <mark>离线</mark> 处理。</p>
          </div>
          <footer><span className={styles.completed}><Check aria-hidden="true" /> 已替换 2 处</span></footer>
        </article>
      </section>

      <Workflow items={replacementWorkflow} />

      <section className={styles.detailList} aria-labelledby="rules-title">
        <header><FileText aria-hidden="true" /><h2 id="rules-title">匹配规则</h2></header>
        <div className={styles.detailRows}>
          {replacementRules.map(({ title, description, icon: Icon }) => (
            <article key={title}>
              <span className={styles.ruleIcon}><Icon aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function NotionSplitFeature() {
  return (
    <div className={styles.featureContent}>
      <header className={styles.featureHeader}>
        <span className={styles.featureIcon}><Rows3 aria-hidden="true" /></span>
        <div>
          <h2>Notion 文本切分</h2>
          <p>将超长文本自动拆分为安全片段，方便逐段复制并粘贴到 Notion。</p>
        </div>
        <Link className="button button-primary" to="/notion-split">
          打开工具 <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <section className={styles.transformPreview} aria-labelledby="notion-preview-title">
        <h3 id="notion-preview-title" className="sr-only">Notion 文本切分效果预览</h3>
        <article className={`${styles.previewDocument} ${styles.sourceDocument}`}>
          <header><FileText aria-hidden="true" /><strong>超长文本（示例）</strong></header>
          <div className={styles.previewText}>
            <p>长篇笔记包含多个段落、句子与换行，需要分多次粘贴到 Notion 中。</p>
            <p>工具会保留原有内容，并在自然边界处自动生成安全片段。</p>
          </div>
          <footer><span>原文字符数：<strong>5,460</strong></span></footer>
        </article>

        <span className={styles.transformArrow} aria-hidden="true"><ArrowRight /><ArrowDown /></span>

        <article className={`${styles.previewDocument} ${styles.resultDocument}`}>
          <header><Rows3 aria-hidden="true" /><strong>切分结果（预览）</strong></header>
          <div className={styles.previewText}>
            <p><strong>片段 1：</strong>保留完整段落与句子边界</p>
            <p><strong>片段 2：</strong>低于设定的 UTF-8 字节上限</p>
            <p><strong>片段 3：</strong>可按顺序独立复制使用</p>
          </div>
          <footer><span className={styles.completed}><Check aria-hidden="true" /> 已生成 3 个安全片段</span></footer>
        </article>
      </section>

      <Workflow items={notionSplitWorkflow} />

      <section className={styles.detailList} aria-labelledby="notion-capability-title">
        <header><Rows3 aria-hidden="true" /><h2 id="notion-capability-title">切分能力</h2></header>
        <div className={styles.detailRows}>
          {notionSplitCapabilities.map(({ title, description, icon: Icon }) => (
            <article key={title}>
              <span className={styles.ruleIcon}><Icon aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function PdfFeature() {
  return (
    <div className={styles.featureContent}>
      <header className={styles.featureHeader}>
        <span className={styles.featureIcon}><FileText aria-hidden="true" /></span>
        <div>
          <h2>PDF 查看</h2>
          <p>直接在浏览器中打开本机 PDF，支持翻页、缩放与旋转。</p>
        </div>
        <Link className="button button-primary" to="/pdf">
          打开工具 <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <section className={styles.pdfPreview} aria-labelledby="pdf-preview-title">
        <span className={styles.pdfDocumentIcon}><FileText aria-hidden="true" /></span>
        <h3 id="pdf-preview-title">选择一个 PDF 文件</h3>
        <p>文件仅在当前浏览器中读取，不会上传或保存。</p>
        <Link className="button button-primary" to="/pdf"><FolderOpen aria-hidden="true" /> 选择 PDF</Link>
      </section>

      <Workflow items={pdfWorkflow} />

      <section className={styles.detailList} aria-labelledby="capability-title">
        <header><Maximize2 aria-hidden="true" /><h2 id="capability-title">查看能力</h2></header>
        <div className={styles.detailRows}>
          {pdfCapabilities.map(({ title, description, icon: Icon }) => (
            <article key={title}>
              <span className={styles.ruleIcon}><Icon aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function ImageFeature() {
  return (
    <div className={styles.featureContent}>
      <header className={styles.featureHeader}>
        <span className={styles.featureIcon}><Images aria-hidden="true" /></span>
        <div>
          <h2>图片格式转换</h2>
          <p>批量转换常用图片、应用图标与游戏纹理，全程在本机完成。</p>
        </div>
        <Link className="button button-primary" to="/image-convert">
          打开工具 <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <section className={`${styles.pdfPreview} ${styles.imagePreview}`} aria-labelledby="image-preview-title">
        <span className={styles.pdfDocumentIcon}><Images aria-hidden="true" /></span>
        <h3 id="image-preview-title">7 种目标格式自由选择</h3>
        <p>保留原始分辨率，并按目标格式处理透明通道与图标尺寸。</p>
        <div className={styles.formatPreview} aria-label="支持的输出格式">
          {['PNG', 'JPG', 'WebP', 'BMP', 'ICO', 'TGA', 'DDS'].map((format) => <span key={format}>{format}</span>)}
        </div>
        <Link className="button button-primary" to="/image-convert"><UploadCloud aria-hidden="true" /> 添加图片</Link>
      </section>

      <Workflow items={imageWorkflow} />

      <section className={styles.detailList} aria-labelledby="image-capability-title">
        <header><Layers3 aria-hidden="true" /><h2 id="image-capability-title">格式能力</h2></header>
        <div className={styles.detailRows}>
          {imageCapabilities.map(({ title, description, icon: Icon }) => (
            <article key={title}>
              <span className={styles.ruleIcon}><Icon aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function AudioFeature() {
  return (
    <div className={styles.featureContent}>
      <header className={styles.featureHeader}>
        <span className={styles.featureIcon}><Music2 aria-hidden="true" /></span>
        <div>
          <h2>音频格式转换</h2>
          <p>批量转换常用音乐格式，也可保持原音质仅修改歌曲信息。</p>
        </div>
        <Link className="button button-primary" to="/audio-convert">
          打开工具 <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <section className={`${styles.pdfPreview} ${styles.imagePreview}`} aria-labelledby="audio-preview-title">
        <span className={styles.pdfDocumentIcon}><Music2 aria-hidden="true" /></span>
        <h3 id="audio-preview-title">7 种目标格式自由选择</h3>
        <p>本机完成转码，按格式设置码率、采样率与声道。</p>
        <div className={styles.formatPreview} aria-label="支持的音频输出格式">
          {['MP3', 'WAV', 'FLAC', 'M4A', 'AAC', 'OGG', 'Opus'].map((format) => <span key={format}>{format}</span>)}
        </div>
        <Link className="button button-primary" to="/audio-convert"><UploadCloud aria-hidden="true" /> 添加音频</Link>
      </section>

      <Workflow items={audioWorkflow} />

      <section className={styles.detailList} aria-labelledby="audio-capability-title">
        <header><Music2 aria-hidden="true" /><h2 id="audio-capability-title">音频能力</h2></header>
        <div className={styles.detailRows}>
          {audioCapabilities.map(({ title, description, icon: Icon }) => (
            <article key={title}>
              <span className={styles.ruleIcon}><Icon aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function AudioSplitFeature() {
  return (
    <div className={styles.featureContent}>
      <header className={styles.featureHeader}>
        <span className={styles.featureIcon}><Scissors aria-hidden="true" /></span>
        <div>
          <h2>音频分割与提取</h2>
          <p>截取音频指定区域，或从视频中提取所选时间范围的音轨。</p>
        </div>
        <Link className="button button-primary" to="/audio-split">
          打开工具 <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <section className={`${styles.pdfPreview} ${styles.imagePreview}`} aria-labelledby="audio-split-preview-title">
        <span className={styles.pdfDocumentIcon}><Scissors aria-hidden="true" /></span>
        <h3 id="audio-split-preview-title">可视化选择音视频区域</h3>
        <p>拖动波形边界或输入毫秒级时间，导出前可直接试听所选音轨。</p>
        <div className={styles.formatPreview} aria-label="音频分割能力">
          {['波形选择', '精确时间', '视频音轨', 'MP3', 'WAV'].map((item) => <span key={item}>{item}</span>)}
        </div>
        <Link className="button button-primary" to="/audio-split"><Scissors aria-hidden="true" /> 选择音视频</Link>
      </section>

      <Workflow items={audioSplitWorkflow} />

      <section className={styles.detailList} aria-labelledby="audio-split-capability-title">
        <header><Scissors aria-hidden="true" /><h2 id="audio-split-capability-title">分割能力</h2></header>
        <div className={styles.detailRows}>
          {audioSplitCapabilities.map(({ title, description, icon: Icon }) => (
            <article key={title}>
              <span className={styles.ruleIcon}><Icon aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export function FeaturesPage() {
  const [selectedTool, setSelectedTool] = useState<ToolId>('replace')

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main>
        <div className={`page-shell ${styles.workspace}`}>
          <section className={styles.hero}>
            <h1>功能中心</h1>
            <p>关键词替换、Notion 文本切分、PDF 查看、图片转换、音频转换与分割均已上线。</p>
          </section>
          <ToolNavigation selected={selectedTool} onSelect={setSelectedTool} />
          {selectedTool === 'replace'
            ? <ReplacementFeature />
            : selectedTool === 'notionSplit'
              ? <NotionSplitFeature />
              : selectedTool === 'pdf'
                ? <PdfFeature />
                : selectedTool === 'image'
                  ? <ImageFeature />
                  : selectedTool === 'audio'
                    ? <AudioFeature />
                    : <AudioSplitFeature />}
        </div>
      </main>
      <Footer />
    </div>
  )
}
