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
