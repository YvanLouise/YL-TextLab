# YL-TextLab

YL-TextLab 是一个完全运行在浏览器中的在线文本处理工具。首版提供关键词替换、匹配高亮、结果编辑与复制、本机草稿保存、深浅主题、帮助文档和更新日志。

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

所有文本仅保存在本机浏览器，不上传服务器，可通过清空删除草稿。
