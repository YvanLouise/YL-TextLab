# YL-TextLab

YL-TextLab 是一个完全运行在浏览器中的本机文件处理工具箱，现已提供关键词替换、Notion 文本切分、PDF 查看、图片格式转换与压缩、音频转换与音视频分割，并支持深浅主题、帮助文档和更新日志。

图片工具可批量转换格式或压缩 PNG、JPG、WebP。常规压缩默认保留原格式，可设 1–50,000 KB 目标大小并按需自动缩小尺寸；PNG 保留格式时为无损重编码（启用缩小会改变分辨率）。结果未达目标或比原文件更大时会显示实际情况。常规压缩结果默认移除 EXIF 等拍摄元数据；单图直接下载图片，多图可打包 ZIP。

无损压缩模式保留原格式、尺寸、透明度和图像数据，不经过 Canvas 重编码。PNG 在后台 Worker 中重新压缩原始 IDAT 数据；JPG 保留量化表及编码扫描数据，WebP 保留 VP8/VP8L、透明和动画数据，仅清理注释、文本或 XMP 等非显示信息。色彩配置及 EXIF 会保留（可能包含拍摄信息）。无损模式不提供质量、目标大小或缩放设置；不能安全减小时保留原文件内容，输出不会比原文件更大。仅支持 PNG/JPG/WebP，其他格式可切回常规压缩或格式转换。

无损压缩导出保留原文件名和扩展名，不添加 `-compressed` 后缀；ZIP 中同名文件放入编号文件夹以避免覆盖。常规压缩仍使用 `-compressed` 后缀。

“文件夹无损压缩”递归读取 PNG/JPG/WebP，自动启用无损模式，保留原文件名和子目录。文件夹批次最多 500 张、总输入 500 MB（普通文件选择仍为 20 张），单张 50 MB、单边 8192 px；其他文件及空目录不会导出。支持 File System Access API 的浏览器可授权目标目录并直接生成新的“原目录名-lossless”结果文件夹，目录重名时自动编号，绝不覆盖原文件。其他浏览器可下载保留目录结构的 ZIP 再解压。

无损流程只检查文件头和原始压缩数据，不解码完整 Canvas；完整结构检查和优化移入可终止的本机 Worker。PNG 验证 chunk CRC、zlib 校验码和解压大小（128 MB 安全上限），保持图像/色彩/方向信息；ZIP 按文件分块构建以降低批量内存峰值。失败项独立报错，停止保留已完成结果；目录写入逐项进行，失败和取消可重试。

压缩页提供 60% / 80% / 90% 质量预设、原图与结果对比、逐项进度和停止处理。批量图片按顺序读取和处理，停止后已完成结果仍可下载。目标大小是每张图片的上限而非整批总量；即使无法达到上限，也会保留最小的有效结果并明确提示。

## 本地运行

安装 Node.js 20.19+ 或 22.12+ 后，双击 `一键打开网站.cmd`，或执行：

```powershell
npm install
npm run dev
```

## 质量检查

```powershell
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run check` 可连续执行代码检查、单元测试和生产构建。`npm run test:e2e` 会先重新构建，再启动独立预览服务，覆盖桌面和移动端；本机使用已安装的 Chrome，CI 使用 Playwright Chromium。

## 维护与清理

当前版本为 1.6.4。工具页面按需加载；导航支持键盘与 Escape 关闭，页面加载失败可重试。音频引擎初始化和 PDF 加载可取消；音频批量 ZIP 分块生成并避免重名覆盖，打包期间也可停止。

```powershell
npm run clean -- --dry-run
npm run clean
```

清理仅删除可重建的 `dist`、`test-results`、`playwright-report` 和 `coverage`，不删除源码、依赖、浏览器草稿或 GitHub 推送控制台。清理后可运行 `npm run dev`；使用预览服务前需重新执行 `npm run build`。`tmp` 为本机临时目录，不纳入版本控制。

## GitHub 推送

双击 `GitHub推送控制台\一键打开GitHub推送控制台.cmd`。控制台已连接到本项目根目录，并使用 `origin` 远程仓库进行安全提交和推送。

远程仓库：<https://github.com/YvanLouise/YL-TextLab>

## 自动部署

推送到 `main` 后，GitHub Actions 会自动执行 ESLint、Vitest、桌面与移动端 Playwright 测试和生产构建，并将站点部署到 GitHub Pages：

<https://yvanlouise.github.io/YL-TextLab/>

首次上线前，请在仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。

所有内容仅在本机浏览器中处理，不上传服务器。关键词替换和 Notion 文本切分会保存本机草稿，可通过清空删除；PDF、图片、音频与视频文件不会持久保存。
