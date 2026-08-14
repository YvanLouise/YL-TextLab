# YL-TextLab

YL-TextLab 是一个完全运行在浏览器中的本机文件处理工具箱，现已提供关键词替换、Notion 文本切分、PDF 查看、图片格式转换、音频转换与音视频分割，并支持深浅主题、帮助文档和更新日志。

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

## GitHub 推送

双击 `GitHub推送控制台\一键打开GitHub推送控制台.cmd`。控制台已连接到本项目根目录，并使用 `origin` 远程仓库进行安全提交和推送。

远程仓库：<https://github.com/YvanLouise/YL-TextLab>

## 自动部署

推送到 `main` 后，GitHub Actions 会自动执行 ESLint、Vitest 和生产构建，并将站点部署到 GitHub Pages：

<https://yvanlouise.github.io/YL-TextLab/>

首次上线前，请在仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。

所有内容仅在本机浏览器中处理，不上传服务器。关键词替换和 Notion 文本切分会保存本机草稿，可通过清空删除；PDF、图片、音频与视频文件不会持久保存。
