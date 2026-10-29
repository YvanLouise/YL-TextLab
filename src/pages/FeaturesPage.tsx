import {
  ArrowDown,
  ArrowRight,
  AudioLines,
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
import { Link, useSearchParams } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { SiteHeader } from '../components/SiteHeader'
import { ToolDirectory } from '../components/ToolDirectory'
import { tools } from '../navigation/tools'
import type { ToolId } from '../navigation/tools'
import styles from './FeaturesPage.module.css'

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
    description: '按字符与 UTF-8 字节双重上限，优先在段落与句子边界切分。',
    icon: Rows3,
  },
  {
    title: '逐段复制',
    description: '按顺序复制每个片段，并依次粘贴到 Notion。',
    icon: ClipboardCopy,
  },
]

const notionSplitCapabilities = [
  { title: '双重上限', description: '默认每段最多 2,000 个可见字符，同时保留 400 KB 字节保护。', icon: Settings2 },
  { title: '智能边界', description: '优先保留空行、换行、句末标点和单词边界。', icon: Rows3 },
  { title: '完整保留', description: '不删减原文内容与换行，按顺序拼接即可还原原文。', icon: FileText },
  { title: '本地隐私', description: '文本仅保存在本机浏览器，不上传服务器，可通过清空删除草稿。', icon: LockKeyhole },
]

const pdfWorkflow = [
  { title: '选择文件', description: '从本机选择需要阅读的 PDF。', icon: FolderOpen },
  { title: '本地解析', description: '浏览器直接解析，不上传文件。', icon: ShieldCheck },
  { title: '编辑与导出', description: '修改内容并另存为，或提取文字与页面图片。', icon: Download },
]

const pdfCapabilities = [
  { title: '目录与缩略图', description: '使用内嵌目录、缩略图、页码或键盘快速定位内容。', icon: RefreshCw },
  { title: '全文搜索', description: '普通文字查找、区分大小写、跨页结果跳转与高亮，不支持扫描件 OCR。', icon: Search },
  { title: '阅读显示', description: '适应宽度、适应整页、25%–300% 缩放与全屏，保留 PDF 原生方向。', icon: ZoomIn },
  { title: '旋转与内容导出', description: '复制本页文字、导出全文 TXT 或本页 PNG；阅读旋转不会修改原 PDF。', icon: RotateCw },
  { title: '内容编辑', description: '修改独立文字、字号与颜色，插入文字 / 图片，删除对象；支持撤销重做并另存为。', icon: FileText },
  { title: '编辑范围', description: '逐行编辑、使用内置字体，不自动重排；扫描件无 OCR，加密 / 签名文件及复杂嵌套对象暂不编辑。', icon: ShieldCheck },
  { title: '密码与权限', description: '输入打开密码后在本机解密，遵循文档复制与打印权限，密码不保存。', icon: LockKeyhole },
  { title: '本地隐私', description: '单文件最大 100 MB；文件、搜索索引和密码均不上传、不保存草稿。', icon: ShieldCheck },
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
      <ToolDirectory variant="sidebar" selected={selected} onSelect={onSelect} />
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
            <p><strong>片段 2：</strong>同时低于字符和 UTF-8 字节上限</p>
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
          <p>本机阅读、全文搜索、目录导航与内容提取，支持密码文件。</p>
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
          <h2>图片转换与压缩</h2>
          <p>批量转换常用图片、应用图标与游戏纹理，也可压缩 PNG、JPG、WebP 并设置目标大小。</p>
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

      <section className={styles.detailList} aria-labelledby="image-compression-title">
        <header><Layers3 aria-hidden="true" /><h2 id="image-compression-title">图片压缩</h2></header>
        <div className={styles.detailRows}>
          <article><h3>保留格式或转换输出</h3><p>PNG、JPG、WebP 可保留原格式；其他可读取图片可选择输出为 JPG 或 WebP。</p></article>
          <article><h3>目标大小与尺寸</h3><p>可设 1–50,000 KB 的目标，必要时按比例缩小尺寸；未达目标会明确标记。</p></article>
          <article><h3>透明度与元数据</h3><p>PNG 无损重编码，WebP 保留透明度；JPG 按背景色合并透明区域，输出默认移除 EXIF。</p></article>
        </div>
      </section>

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
          <p>多选音频或导入文件夹批量无损压缩，也可转换音乐格式或仅修改歌曲信息。</p>
        </div>
        <Link className="button button-primary" to="/audio-convert">
          打开工具 <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <section className={`${styles.pdfPreview} ${styles.imagePreview}`} aria-labelledby="audio-preview-title">
        <span className={styles.pdfDocumentIcon}><Music2 aria-hidden="true" /></span>
        <h3 id="audio-preview-title">7 种目标格式自由选择</h3>
        <p>本机完成转码；无损压缩保留 16/24 位整数音频参数并校验全部采样。支持每批 100 个文件、保留子目录的 ZIP 和失败项重试。</p>
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
          <p>截取音频指定区域、提取视频音轨，或把立体声歌曲拆分为独立的左右声道文件。</p>
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
          {['波形选择', '精确时间', '左右声道分离', '视频音轨', 'MP3', 'WAV'].map((item) => <span key={item}>{item}</span>)}
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

function AudioSubtractFeature() {
  return <div className={styles.featureContent}>
    <header className={styles.featureHeader}>
      <span className={styles.featureIcon}><AudioLines aria-hidden="true" /></span>
      <div><h2>音频相减</h2><p>从音频 A 中减去音频 B 的波形，试听并下载新的音频 C。</p></div>
      <Link className="button button-primary" to="/audio-subtract">打开工具 <ArrowRight aria-hidden="true" /></Link>
    </header>
    <section className={`${styles.pdfPreview} ${styles.imagePreview}`}>
      <AudioLines aria-hidden="true" /><h3>C = A − B</h3>
      <p>A 是人声＋伴奏，B 是完全一致的伴奏时，可通过对齐后相减抵消伴奏。不同录音或混音通常无法完全抵消。</p>
      <Link className="button button-primary" to="/audio-subtract">选择两段音频 <ArrowRight aria-hidden="true" /></Link>
    </section>
    <Workflow items={[
      { title: '选择 A 和 B', description: '添加两段同源音频，先试听确认内容。', icon: UploadCloud },
      { title: '调整抵消设置', description: '手动调整，或开启自动匹配以校准时间、音量和极性。', icon: Settings2 },
      { title: '试听音频 C', description: '生成后试听并直接下载 32 位浮点 WAV。', icon: Download },
    ]} />
    <section className={styles.detailList}>
      <header><ShieldCheck aria-hidden="true" /><h2>相减规则</h2></header>
      <div className={styles.detailRows}>
        {[
          ['自动匹配相似波形', '在搜索中心附近 ±250 ms / 1 / 3 / 10 秒内多点取样，校准整段时间偏移、音量和极性；匹配不可靠时停止。'],
          ['消减强度与微调', '10–100% 控制应用的估计音量，可查看相关系数并转为手动微调。相关系数不是消除成功率。'],
          ['对齐的适用条件', '按采样点相减，仅时长或旋律相同不保证抵消；不做逐段变速、拉伸或混响修复。'],
          ['时长与采样率', '使用 A 的时长和采样率，自动重采样 B。声道数须相同；B 未覆盖的部分保留 A。'],
          ['输出防削波', '仅在幅度溢出时整体降低音量。关闭后浮点 WAV 保留原始运算幅度。'],
          ['本地处理', '文件不上传、不持久保存，可停止并重新处理；每个源文件 500 MB，结果最多 256 MB。'],
        ].map(([title, description]) => <article key={title}><span className={styles.ruleIcon}><Check aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p></article>)}
      </div>
    </section>
  </div>
}

function AudioMidiFeature() {
  return <div className={styles.featureContent}>
    <header className={styles.featureHeader}><span className={styles.featureIcon}><Music2 aria-hidden="true" /></span>
      <div><h2>频谱画 MIDI</h2><p>以真实音高频谱为背景，描出音符或去除指定区域的声音。</p></div>
      <Link className="button button-primary" to="/audio-midi">打开工具 <ArrowRight aria-hidden="true" /></Link>
    </header>
    <section className={`${styles.pdfPreview} ${styles.imagePreview}`}>
      <Music2 aria-hidden="true" /><h3>看频谱，画音符</h3>
      <p>横轴是时间，纵轴对齐 A0–C8 钢琴音高。可以描绘音符，也可切换“去除频谱”框选时间与频率，生成真正去除该频段后的音频。</p>
      <Link className="button button-primary" to="/audio-midi">开始手动转写 <ArrowRight aria-hidden="true" /></Link>
    </section>
    <Workflow items={[
      { title: '生成音高频谱', description: '导入最长 10 分钟的本机音频，在后台分析频率能量。', icon: UploadCloud },
      { title: '描绘或去除', description: '手工编辑音符；或框选去除区域，用时间和 Hz 数值精确调整。', icon: Settings2 },
      { title: '试听并导出', description: '对照原音频试听，导出 MIDI 或按原采样率、原声道导出去除后的 WAV。', icon: Download },
    ]} />
    <p>频谱去除最多支持 50 个区域，独立撤销、重做，可停止后重试。选区内所有叠加的声音都会受影响；边缘平滑过渡，不是按乐器自动分离。始终从原文件重新生成，选区外的时间不变。</p>
    <p>去除处理支持解码后最多 128 MB，导出 32 位浮点 WAV，不保留歌曲标签或封面。音符工程不含去除区域与音频，离开前请下载处理结果。</p>
    <p>本工具用于频谱辅助人工转写，不自动识别音符。亮线可能是基频或泛音；MIDI 文件不包含原录音。文件不上传、不自动保存。</p>
  </div>
}

function AudioVocalFeature() {
  return <div className={styles.featureContent}>
    <header className={styles.featureHeader}><span className={styles.featureIcon}><Music2 aria-hidden="true" /></span>
      <div><h2>主唱净化</h2><p>从已分离的人声出发，保留主唱音色，温和压低次要声音。</p></div>
      <Link className="button button-primary" to="/audio-vocal">打开工具 <ArrowRight aria-hidden="true" /></Link>
    </header>
    <section className={`${styles.pdfPreview} ${styles.imagePreview}`}><Music2 aria-hidden="true" /><h3>先试听，再决定抑制强度</h3>
      <p>跟随较强、连续的人声音高，优先保留对应谐波；支持齿音与气声保护，提供净化人声和被削弱声音的对照试听。</p>
      <Link className="button button-primary" to="/audio-vocal">选择人声音轨 <ArrowRight aria-hidden="true" /></Link>
    </section>
    <Workflow items={[
      { title: '导入分离后的人声', description: '支持单声道或立体声，可选原声道、居中、左声道或右声道。', icon: UploadCloud },
      { title: '自然保留先试听', description: '从指定位置处理 20 秒，再调整音域、强度和弱声门限。', icon: Settings2 },
      { title: '净化整段并下载', description: '保留原采样率，输出 32 位浮点 WAV，可停止并重试。', icon: Download },
    ]} />
    <p>同音高重叠的和声、混响或更响的次要人声可能保留，也可能跟错旋律。强抑制会改变音色，不保证只剩主唱；低覆盖率时采用温和降噪。输入最多 500 MB，整段最多 10 分钟，解码后最多 128 MB。输出不保留标签与封面。</p>
  </div>
}

export function FeaturesPage() {
  const [params, setParams] = useSearchParams()
  const selected = tools.find(tool => tool.id === params.get('tool')) ?? tools[0]
  const selectedTool = selected.id
  const setSelectedTool = (id: ToolId) => {
    setParams(previous => { const next = new URLSearchParams(previous); next.set('tool', id); return next })
    if (window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(() => document.getElementById('tool-details')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
      }))
    }
  }

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main>
        <div className={`page-shell ${styles.workspace}`}>
          <section className={styles.hero}>
            <h1>功能中心</h1>
            <p>按任务找到合适的工具，查看使用流程与功能说明。</p>
          </section>
          <ToolNavigation selected={selectedTool} onSelect={setSelectedTool} />
          <section id="tool-details" className={styles.detailPanel} aria-label={`${selected.title}功能说明`}>
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
                    : selectedTool === 'audioSplit'
                      ? <AudioSplitFeature />
                      : selectedTool === 'audioSubtract'
                        ? <AudioSubtractFeature />
                        : selectedTool === 'audioVocal' ? <AudioVocalFeature /> : <AudioMidiFeature />}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
