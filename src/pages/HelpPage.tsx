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
import { Download } from 'lucide-react'
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
          <a href="#pdf-reader">PDF 阅读与编辑</a>
          <a href="#image-convert">图片转换与压缩</a>
          <a href="#audio-convert">音频格式转换</a>
          <a href="#audio-subtract">音频相减</a>
          <a href="#audio-midi">频谱画 MIDI</a>
          <a href="#audio-vocal">主唱净化</a>
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

          <section id="pdf-reader" className={styles.section}>
            <h2>PDF 阅读、编辑与提取</h2>
            <p className={styles.sectionLead}>选择或拖入单个 PDF（最大 100 MB），在本机阅读。文件、密码和搜索内容不上传，也不保存为浏览器草稿。</p>
            <div className={styles.optionCards}>
              <article><span><FileText /></span><div><h3>导航与阅读</h3><p>左侧可切换缩略图、内嵌目录、搜索和文档信息。支持页码跳转、适应宽度／整页、25%–300% 缩放、旋转和浏览器全屏。手机可收起导航继续阅读。</p></div></article>
              <article><span><Search /></span><div><h3>搜索与复制</h3><p>搜索按普通文字匹配，可区分大小写；结果高亮并支持跨页跳转。输入框中 Enter 查找下一处，Shift + Enter 查找上一处；阅读区 Ctrl / ⌘ + F 打开文档搜索。</p></div></article>
              <article><span><Copy /></span><div><h3>提取与导出</h3><p>可选中文字或复制本页，导出带页码分隔的全文 TXT，或导出当前方向的 PNG（默认 144 dpi，最多 800 万像素）。文字按 PDF 内部顺序提取，多栏排版可能需要整理；扫描件不含文字层，暂不提供 OCR。</p></div></article>
              <article><span><ShieldCheck /></span><div><h3>密码与原文件</h3><p>受密码保护的文件需要正确的打开密码，遵循复制、打印权限。旋转只改变阅读方向，下载原文件不会改变内容、表单或签名。“系统查看与打印”在新标签页打开原文件，由浏览器 PDF 阅读器完成打印；密码文件可能需要再次输入密码。</p></div></article>
              <article><span><FileText /></span><div><h3>修改实际内容</h3><p>打开文件后点击“编辑内容”，点击页面文字或从对象列表选择，修改内容、字号与颜色后应用。也可新增单行文字、插入 PNG / JPG / WebP 图片、删除对象，并撤销 / 重做。编辑后的文字统一使用内置 Noto Sans SC 常规字体，保留原文字起点和方向，不自动重排；变长的内容请检查是否重叠。</p></div></article>
              <article><span><Download /></span><div><h3>预览与另存为</h3><p>应用修改后点击“另存为 PDF”，下载带 -edited 后缀的新文件，原文件不变。每次最多应用 50 次编辑；图片不超过 10 MB / 800 万像素，图片像素数据合计不超过 32 MB。编辑引擎和中文字库仅在首次使用时从本站加载，不向外部服务发送文件。</p></div></article>
            </div>
            <p>内容编辑不含 OCR、段落自动排版、表单或批注编辑；复杂嵌套对象保持显示但不可编辑，加密文件或带数字签名的文件需使用未加密、未签名的可编辑副本。删除对象不是安全脱敏，不能保证清除历史、元数据或隐藏副本。编辑不保存草稿，离开（包括浏览器返回）前请先另存为。</p>
            <p>阅读区 ← → / PageUp / PageDown 翻页，Home / End 跳至首尾，+ / − 缩放，0 适应宽度。大文档按需渲染缩略图，搜索最多显示 1,000 处；全文导出限制为 2,000 万字符，提取失败时不下载不完整结果。搜索、导出和加载均可取消。</p>
            <Link className="button button-primary" to="/pdf">打开 PDF 工具 <ArrowRight aria-hidden="true" /></Link>
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
            <p>列表可按文件名、文件夹或状态筛选；筛选只改变显示，处理和下载仍针对完整队列。开始试听一个文件会自动暂停其他试听。自定义码率可清空后重新输入，离开输入框时应用；处理中不能修改质量参数。</p>
            <p>转换及分割的单个输出上限为 256 MB；达到上限时会提示缩短片段或降低输出大小，不提供可能被截断的文件。首次引擎加载超过 90 秒可重试，支持随时停止；清空列表会释放引擎及文件资源。</p>
            <h3>分割工具的波形与大文件</h3>
            <p>波形只用于显示，以 16 kHz 分析所有声道的峰值，不改变原文件试听或导出参数。文件大于 64 MB、长于 10 分钟或解码预算不足时，会跳过完整波形并明确提示；仍可试听、输入精确时间和导出。读取时可点击“停止读取”。不能通过浏览器读取时长时，自动使用本机引擎探测容器信息。</p>
            <p>五个音频工具可通过页面内导航切换。有文件时刷新或关闭标签页会触发浏览器提示；工具内跳转不会保存内容，请先下载所需结果。WAV 保持原始采样率或声道时，不猜测未知参数对应的文件体积。</p>
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

          <section id="audio-subtract" className={styles.section}>
            <h2>音频相减：A − B = C</h2>
            <p className={styles.sectionLead}>添加原音频 A 和需要抵消的音频 B，点击“生成音频 C”，即可试听并直接下载 WAV 文件。</p>
            <p>选择两份文件后，会在本机按 1 MB 分块比较完整文件内容。内容完全相同会显示“同文件提示”，即使文件名不同；不会仅凭文件名或大小误判。此提示不阻止生成，替换、移除或清空文件后会更新，不上传也不保存校验数据。不同编码或标签的文件不视为同文件，即使听起来相同。</p>
            <p>这个工具执行采样级波形相减。例如 A 是人声与伴奏的混合，B 是相同版本、相同混音的伴奏，完全对齐后有机会抵消伴奏。它不进行 AI 声源识别；只要时长相同，或听起来包含相同旋律，都不足以保证抵消。不同录音、混响、压缩编码和动态处理可能留下残余。</p>
            <p>B 的音量比例默认为 100%，可在 0–200% 调整。时间偏移默认为 0 ms；正值让 B 推迟，负值让 B 提前，最终按 A 的采样率取最近的采样点。调整后需重新生成结果。</p>
            <h3>严格相减与保护模式</h3>
            <p>默认“严格 A−B”按每个采样点相减，不会判断 B 的内容是否存在于 A。A 静音而 B 有声时，0−B 是反相的 B，仍然听得见；波形包络看起来像混合不代表加减号写反。两份内容不同的独立人声通常不能直接相减来删除某个角色。</p>
            <p>“仅消减可靠匹配片段”使用全段局部分析，默认每窗约 50 ms，极长音频会增大窗口以限制内存。仅对归一化交叉能量相关系数至少 0.85、相减后能量至少下降 2% 且不新增过载的窗口消减；其他位置保留 A 的解码采样，边界在匹配片段内部做最多 5 ms 淡化。此模式不做整段降音量，分析失败时不会自动退回严格相减。它可能保守地跳过较弱的共同声音，不是人声、对白等语义识别；可配合自动对齐使用。</p>
            <h3>自动匹配相似波形</h3>
            <p>开启“自动匹配相似波形”后，在多个位置取样，寻找共同时间偏移，再按 A 的采样率精细校准，估计 B 的音量比例并检测反相。默认搜索中心为 0，范围为 ±3 秒，可改为 ±250 ms、±1 秒或 ±10 秒；已知大致偏移时可修改中心，总范围限制在 ±60 秒。</p>
            <p>“消减强度”默认 100%，即使用估计音量完整抵消；降低到 10–95% 可保留部分共同声音，不是对输出整体降低音量。结果会显示偏移、估计与实际应用的音量、极性及取样相关系数；相关系数不是“消除成功率”，请结合试听判断。点击“转为手动微调”会带入参数并清除旧结果，修改后重新生成。</p>
            <p>自动匹配需要至少 0.5 秒且时长可读取的音频。静音、不相关内容、重复周期波形、取样位置偏移不一致或估计音量超出 0–200% 时会停止并提示，不生成误导性结果。它使用整段统一偏移，不进行逐段时间拉伸、变速校正、均衡匹配或混响修复。手动模式可单独反转 B 的极性。</p>
            <p>输出使用 A 的时长和采样率。B 的采样率不同时会自动重采样并提示；A、B 声道数须一致（单声道或立体声），可先通过音频转换工具统一声道数。B 覆盖不到的位置保留 A 的内容。</p>
            <p>输出为 32 位浮点 WAV。严格模式的“输出防削波”默认开启，峰值溢出时降低整段音量，包括 B 静音或未覆盖的位置；这不是删除了那些位置的声音。关闭后保留原始运算幅度，过载播放可能失真。保护模式不进行这项整体衰减。相同解码采样在 100%、零偏移且不反转 B 时相减为静音，这是正确结果。</p>
            <h3>全段音量对照</h3>
            <p>结果显示 A、已对齐并应用音量的参考 B、最终 C 的整段 RMS 与采样峰值，使用同一时间轴和绝对 dBFS 刻度，不分别归一化。防削波实际生效时另显示衰减前的 C 和整段降低量。图底是 −72 dBFS，低于它的非零声音仍显示精确读数，−∞ 表示完全静音；RMS 不是感知响度 LUFS。拖动位置滑块或点击曲线可查看时间窗，也可将 A/C 试听定位到同一时刻。图表最多 800 个窗口，覆盖全段，而非仅取样几个片段。</p>
            <p>每个输入文件最多 500 MB，结果最多 256 MB；长音频建议先截取片段。支持停止处理、替换文件、交换 A/B 和清空。音频仅在本机浏览器中处理，不上传服务器；离开页面或清空后不会保留文件。</p>
            <Link className="button button-primary" to="/audio-subtract">打开音频相减 <ArrowRight aria-hidden="true" /></Link>
          </section>

          <section id="audio-vocal" className={styles.section}>
            <h2>主唱净化：保留主旋律，抑制弱声</h2>
            <p>导入已经分离的人声音轨，默认“自然保留”：35% 抑制强度、原声道，并保护齿音和气声。先选择开始秒数并点击“净化 20 秒试听”，对照原声、净化结果和被削弱的声音；满意后点击“净化整段并导出”。</p>
            <p>“同位置听原声 / 净化”会在试听片段和原文件之间换算时间，自动暂停其他播放器；位置超出片段或片段播放结束时，从片段起点开始对照。如果被削弱部分里能清楚听到主唱，请降低抑制强度或调整音域。0% 不做净化，输出标为“原声对照”，不计算旋律覆盖率；所选声道仍会生效。</p>
            <p>重复选择当前预设不会清除有效结果；修改净化参数或试听起点后，旧试听片段会失效。更换文件会保留当前参数，建议先试听新文件。</p>
            <p>音高跟随和柔和谐波保留用于突出较强、连续的旋律，不识别歌手身份。主唱与和声占据相同音高时可能同时保留；强和声、混响、无基频的气声也会影响效果。提高强度可能损伤音色、尾音与咬字，不能保证只剩主唱。局部残留可继续用频谱工具手动修整。</p>
            <p>“偏低 / 偏高音域”可缩小跟随范围。可选原声道、居中合并、只用左声道或右声道；居中合并会输出单声道，左右反相的声音可能被抵消，建议先使用原声道。弱声门限越高，越容易压低空隙噪声，也可能影响轻声。旋律跟随覆盖率表示检测到稳定音高的活动片段比例，不是去除成功率。</p>
            <p>本机处理、不上传，可停止和重试。支持 500 MB 以内文件、8–192 kHz 单 / 双声道；整段最长 10 分钟，解码后最多 128 MB，长文件可先试听片段或截短。输出保持原采样率，使用 32 位浮点 WAV，不保留标签或封面。净化会改变音频采样，不属于无损压缩；离开前请下载结果。</p>
            <Link className="button button-primary" to="/audio-vocal">打开主唱净化 <ArrowRight aria-hidden="true" /></Link>
          </section>

          <section id="audio-midi" className={styles.section}>
            <h2>音频频谱画 MIDI</h2>
            <p>导入音频后，在本机生成短时傅里叶频谱，横轴为时间、纵轴对应 A0–C8 音高。亮度表示频率能量，亮线可能是基频、泛音或其他乐器，不会自动转成音符。立体声按左右声道能量合成频谱，不会因反相抵消。</p>
            <p>用“画音符”拖动绘制，点击已有音符可移动或拖动两端调整长度；切换“拖动视图”进行平移，滚轮上下查看不同音区。也可用“添加音符”和数值表单精确设置音高、起止时间与力度。</p>
            <p>设置 20–300 BPM 与节拍吸附，默认 120 BPM、1/16 音符。修改 BPM 不改变已画音符的实际时间。选中音符后用方向键移动，Shift＋左右键调整长度，Delete 删除，Ctrl/Cmd＋Z 撤销；可撤销最近 60 次编辑。</p>
            <p>点击时间尺或播放位置滑块定位，再选择原音频、MIDI 或混合试听。MIDI 试听使用合成参考音色，不是原录音音色。MIDI 导出为单轨标准 .mid，含速度、力度和时值；同音高重叠音符合并，避免相互截断。原音频不写入 MIDI。</p>
            <p>可调整试听音量、开启或关闭“跟随播放”，播放指针超出视窗时自动滚动。试听使用 22.05 kHz 的分析音频，不适合比较原文件高频音质。点击“清空音频”会释放音频和编辑内容；有音符或去除区域时需先确认。</p>
            <p>音频最大 100 MB、最长 10 分钟，最多 2,000 个音符。以 22.05 kHz 分析，三种 FFT 精度可选：瞬态优先适合起音，音高优先适合低音；低频和快速音符仍可能模糊。浏览器不能解码时，可先使用音频转换工具转成 WAV。</p>
            <h3>手动去除指定频谱区域</h3>
            <p>选择“去除频谱”，在画布拖出矩形，框选起止时间与频率范围。也可在“手动频谱去除”中输入秒数与 Hz，点击“添加去除区域”或“应用区域修改”。画布显示约 27–4307 Hz，其他频率可用数值输入，但不能超过原音频采样率的一半。</p>
            <p>最多添加 50 个区域。在区域下拉框中选择后可修改、删除；支持独立的撤销、重做和清空。“去除频谱”模式下 Ctrl/Cmd＋Z 撤销区域、Delete 删除选中区域，MIDI 音符不会被删除。</p>
            <p>点击“生成处理音频”后在本机后台处理；首次处理按需加载网站自带的音频引擎。生成后可切换“频谱音频版本”，对比原音频和处理后的频谱及声音，再直接下载 WAV。修改区域后旧结果失效，重新生成始终从原文件计算，不叠加上次处理。</p>
            <p>去除会影响选区内所有重叠声音，不区分乐器或人声。时间和频率边界采用平滑过渡；很短或很窄的区域可能仍有残留，不等于精确的声源分离。未选时间的解码采样保持不变，音频时长不改变。</p>
            <p>导出保持原采样率及单/双声道，使用 32 位浮点 WAV，不经过 22.05 kHz 预览音频，不保留封面或歌曲标签。去除处理要求采样率至少 8 kHz、解码数据不超过 128 MB；超限时请先截取较短片段。可随时停止后重试，不覆盖原文件。</p>
            <p>去除区域及处理音频不自动保存，也不包含在 MIDI JSON 工程中；离开前请下载处理后的 WAV。所有处理在本机完成，不上传。</p>
            <p>文件和音符不上传、不自动保存。离开前请下载 MIDI 或保存 JSON 工程；下次先导入同一音频，再载入工程即可继续编辑。工程只保存音符和设置，不含音频。载入工程可撤销。</p>
            <Link className="button button-primary" to="/audio-midi">打开频谱画 MIDI <ArrowRight aria-hidden="true" /></Link>
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
