import { ArrowRight, Check, Clock3, Flag, RefreshCw, Rows3, ScanText, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { SiteHeader } from '../components/SiteHeader'
import styles from './ContentPage.module.css'

const roadmap = [
  { name: '文本清理', icon: ScanText },
  { name: '文本分析', icon: Search },
  { name: '批量处理', icon: RefreshCw },
]

export function ChangelogPage() {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main>
        <header className={styles.changelogHero}>
          <div className={`page-shell ${styles.changelogHeroInner}`}>
            <div>
              <span className={styles.headingIcon} aria-hidden="true">
                <Clock3 />
              </span>
              <div>
                <h1>更新日志</h1>
                <p>记录 YL文件工具箱的版本变化与改进</p>
              </div>
            </div>
            <img
              src={`${import.meta.env.BASE_URL}assets/changelog-illustration.png`}
              alt=""
              aria-hidden="true"
            />
          </div>
        </header>

        <div className={`page-shell ${styles.changelogBody}`}>
          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.6.5</strong>
              <time dateTime="2026-10-27">2026-10-27</time>
              <span className={styles.releaseBadge}>音频处理增强</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>音频无损压缩</h2>
                <ul>
                  <li><Check /> 音频转换新增无损压缩模式，将 16/24 位整数 PCM WAV、AIFF 和 FLAC 压缩为 FLAC</li>
                  <li><Check /> 保留原采样率、位深和声道，完整采样校验通过后才提供下载</li>
                  <li><Check /> 显示前后大小与节省比例；明确提示体积未减小和不支持的来源</li>
                  <li><Check /> 支持多选音频和文件夹递归导入，ZIP 保留子目录，同名结果自动编号</li>
                  <li><Check /> 批量进度与体积汇总、失败项重试、停止后继续未完成项</li>
                  <li><Check /> 按需读取源文件，编码与源采样校验共用解码，减少内存复制和重复解码</li>
                  <li><Check /> 未修改信息的 FLAC 如无法进一步减小则保留原内容</li>
                  <li><Check /> 音频队列扩大至每批 100 个文件、总输入 2 GB</li>
                  <li><Check /> 音频处理与音视频分割的单文件上限从 100 MB 提高至 500 MB</li>
                </ul>
              </section>
              <section>
                <h2>歌曲左右声道独立导出</h2>
                <ul>
                  <li><Check /> 音频分割工具新增左右声道分离模式，整首歌曲或所选片段均可处理</li>
                  <li><Check /> 分别生成 _L、_R 单声道文件，支持独立试听和下载</li>
                  <li><Check /> 默认 WAV 输出，支持 MP3 和保持原格式；自动识别并提示不适用的声道数</li>
                  <li><Check /> 分离在本机完成，支持取消和重试</li>
                </ul>
              </section>
            </div>
          </article>
          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.6.4</strong>
              <time dateTime="2026-10-25">2026-10-25</time>
              <span className={styles.releaseBadge}>性能与稳定性</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>优化与修复</h2>
                <ul>
                  <li><Check /> 工具页面按需加载，缩小首页资源；加载失败可重新尝试</li>
                  <li><Check /> 修复音频引擎加载期间的取消与资源释放，PDF 新增加载取消</li>
                  <li><Check /> 修复 Opus 立体声转换与分割崩溃，保留所选声道及歌曲标签</li>
                  <li><Check /> 音频 ZIP 分块打包、可停止，并避免同名与编号文件互相覆盖</li>
                  <li><Check /> 提前校验图片尺寸和损坏数据，降低 TGA 编码内存占用</li>
                  <li><Check /> 草稿保存等待事务提交，异常草稿不影响打开工具；导航支持完整键盘操作</li>
                </ul>
              </section>
            </div>
          </article>
          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.6.3</strong>
              <time dateTime="2026-10-07">2026-10-07</time>
              <span className={styles.releaseBadge}>文件夹无损压缩</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>新增与优化</h2>
                <ul>
                  <li><Check /> 整个文件夹递归导入 PNG/JPG/WebP，保留原文件名和子目录</li>
                  <li><Check /> 支持新建结果文件夹输出，其他浏览器可下载目录 ZIP，不覆盖原文件</li>
                  <li><Check /> 文件夹每批最多 500 张、总输入 500 MB；无损引擎不再解码完整像素画布</li>
                  <li><Check /> 全流程后台 Worker 可随时终止，增加 PNG 校验与内存保护，ZIP 分块打包</li>
                </ul>
              </section>
            </div>
          </article>
          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.6.2</strong>
              <time dateTime="2026-10-07">2026-10-07</time>
              <span className={styles.releaseBadge}>无损压缩</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>新增</h2>
                <ul>
                  <li><Check /> PNG/JPG/WebP 无损优化，保留原格式、尺寸、透明度与图像数据</li>
                  <li><Check /> PNG 后台优化压缩流，JPG/WebP 清理非显示信息，保留色彩配置和 EXIF</li>
                  <li><Check /> 无损模式不降低画质或缩小尺寸，无法减小时如实提示并保留原内容</li>
                </ul>
              </section>
            </div>
          </article>
          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.6.1</strong>
              <time dateTime="2026-09-29">2026-09-29</time>
              <span className={styles.releaseBadge}>压缩体验</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>改进</h2>
                <ul>
                  <li><Check /> 目标大小搜索减少重复编码，并改进自动缩放路径</li>
                  <li><Check /> 逐张生成轻量预览，增加质量预设、处理进度和停止操作</li>
                  <li><Check /> 增加原图与结果对比、批量大小汇总及未达标和变大提示</li>
                </ul>
              </section>
            </div>
          </article>

          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.6.0</strong>
              <time dateTime="2026-09-29">2026-09-29</time>
              <span className={styles.releaseBadge}>图片压缩</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>新增</h2>
                <ul>
                  <li><Check /> 图片工具增加格式转换与图片压缩模式切换</li>
                  <li><Check /> PNG、JPG、WebP 压缩及可选目标大小、自动等比缩小</li>
                  <li><Check /> 显示实际体积变化和目标达成状态；未达标也可下载有效结果</li>
                  <li><Check /> 单个结果直接下载，多图可打包 ZIP；压缩输出默认移除 EXIF</li>
                </ul>
              </section>
            </div>
          </article>

          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.5.0</strong>
              <time dateTime="2026-08-14">2026-08-14</time>
              <span className={styles.releaseBadge}>Notion 工具</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>新增</h2>
                <ul>
                  <li><Check /> 长文本按字符与 UTF-8 字节双重上限自动切分为多个片段</li>
                  <li><Check /> 优先保留段落、换行、句末标点与单词边界</li>
                  <li><Check /> 每段独立复制并记录完成状态，方便按顺序粘贴到 Notion</li>
                </ul>
              </section>
              <section>
                <h2>隐私</h2>
                <ul>
                  <li><Check /> 待切分文本仅保存在本机浏览器，不上传服务器</li>
                  <li><Check /> 本机草稿自动保存，并可通过“清空”完整删除</li>
                </ul>
              </section>
            </div>
          </article>

          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.4.0</strong>
              <time dateTime="2026-08-09">2026-08-09</time>
              <span className={styles.releaseBadge}>音乐信息</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>新增</h2>
                <ul>
                  <li><Check /> 仅修改信息模式保持每个文件的原格式与原音质</li>
                  <li><Check /> 使用音频流复制，不重新编码码率、采样率或声道</li>
                  <li><Check /> 输出文件增加“已编辑”后缀，避免覆盖原文件</li>
                </ul>
              </section>
            </div>
          </article>

          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.3.0</strong>
              <time dateTime="2026-08-07">2026-08-07</time>
              <span className={styles.releaseBadge}>音视频提取</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>新增</h2>
                <ul>
                  <li><Check /> 从 MP4、MOV、M4V、WebM、MKV、AVI 中提取指定区域音轨</li>
                  <li><Check /> 视频音轨可按毫秒级时间选择并导出为 MP3 或 WAV</li>
                  <li><Check /> 视频文件同样仅在浏览器本机处理，不上传服务器</li>
                </ul>
              </section>
            </div>
          </article>

          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.2.0</strong>
              <time dateTime="2026-07-29">2026-07-29</time>
              <span className={styles.releaseBadge}>音频工具</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>新增</h2>
                <ul>
                  <li><Check /> MP3、WAV、FLAC、M4A、AAC、OGG 与 Opus 输出</li>
                  <li><Check /> WMA 与 AIFF 输入兼容，以及质量、采样率和声道设置</li>
                  <li><Check /> 推荐档位、自定义码率与预计输出大小</li>
                  <li><Check /> 可编辑歌曲标签与兼容封面，原始信息尽力保留</li>
                </ul>
              </section>
              <section>
                <h2>批量处理</h2>
                <ul>
                  <li><Check /> 顺序转换、实时进度、试听和停止转换</li>
                  <li><Check /> 单项下载与全部结果 ZIP 打包</li>
                </ul>
              </section>
              <section>
                <h2>隐私</h2>
                <ul>
                  <li><Check /> 音频只在浏览器本机转码，不上传服务器</li>
                  <li><Check /> 转码核心由网站静态托管，音频文件不保存草稿</li>
                </ul>
              </section>
            </div>
          </article>

          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.1.0</strong>
              <time dateTime="2026-07-28">2026-07-28</time>
              <span className={styles.releaseBadge}>图片工具</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>新增</h2>
                <ul>
                  <li><Check /> PNG、JPG、WebP、BMP 单图与批量格式转换</li>
                  <li><Check /> ICO 单尺寸和多尺寸图标生成</li>
                  <li><Check /> TGA 与 DDS 游戏素材读取和输出</li>
                </ul>
              </section>
              <section>
                <h2>批量处理</h2>
                <ul>
                  <li><Check /> 拖拽、多选、逐项状态和单独下载</li>
                  <li><Check /> 一键将全部转换结果打包为 ZIP</li>
                </ul>
              </section>
              <section>
                <h2>隐私</h2>
                <ul>
                  <li><Check /> 图片仅在当前浏览器中处理，不上传服务器</li>
                  <li><Check /> 不保存图片草稿，关闭页面后自动释放文件</li>
                </ul>
              </section>
            </div>
          </article>

          <article className={styles.release}>
            <aside className={styles.releaseMeta}>
              <span className={styles.timelineDot} />
              <strong>v1.0.0</strong>
              <time dateTime="2026-07-23">2026-07-23</time>
              <span className={styles.releaseBadge}>首个版本</span>
            </aside>
            <div className={styles.releaseNotes}>
              <section>
                <h2>新增</h2>
                <ul>
                  <li><Check /> 首页、功能概览与统一的工具入口</li>
                  <li><Check /> 关键词替换、区分大小写、全字匹配和仅替换第一个</li>
                  <li><Check /> 可编辑替换结果、一键复制、清空与交换关键词</li>
                </ul>
              </section>
              <section>
                <h2>体验</h2>
                <ul>
                  <li><Check /> 深浅主题并记住用户偏好</li>
                  <li><Check /> 完整适配桌面、平板与移动设备</li>
                  <li><Check /> 本机草稿自动保存和完整使用帮助</li>
                </ul>
              </section>
              <section>
                <h2>隐私</h2>
                <ul>
                  <li><Check /> 文本只保存在本机浏览器，不上传服务器</li>
                  <li><Check /> 点击清空即可删除页面内容和本机草稿</li>
                </ul>
              </section>
            </div>
          </article>

          <section className={styles.roadmap}>
            <div className={styles.roadmapTitle}>
              <Flag aria-hidden="true" />
              <h2>后续计划</h2>
            </div>
            <div className={styles.roadmapItems}>
              {roadmap.map(({ name, icon: Icon }) => (
                <div key={name}>
                  <Icon aria-hidden="true" />
                  <strong>{name}</strong>
                  <span>敬请期待</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.ctaBand}>
            <span>
              <Rows3 aria-hidden="true" />
            </span>
            <div>
              <h2>开始切分 Notion 长文本</h2>
              <p>在本机自动生成安全片段，再按顺序逐段复制使用。</p>
            </div>
            <Link className="button button-primary" to="/notion-split">
              开始使用 <ArrowRight aria-hidden="true" />
            </Link>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
