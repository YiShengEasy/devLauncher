# DevLauncher Landing Page

独立的 DevLauncher 产品宣传主页，是从 `devlauncher-landing-page.zip` 中的 React/Vite 落地页提炼出的静态复刻。

页面不依赖后端 API、运行时环境变量或 React 构建链，适合直接发布到 GitHub Pages。

## GitHub Pages

推送到 `main` 后，GitHub Actions 会自动构建并发布 `website/dist`。构建脚本会在产物根目录生成 `.nojekyll`，方便 GitHub Pages 直接托管静态资源。

访问地址：

```text
https://yishengeasy.github.io/devLauncher/
```

## 本地运行

```powershell
cd website
npm run dev
```

默认地址：

```text
http://localhost:5173
```

也可以直接用浏览器打开 `index.html` 预览。所有资源都使用相对路径，适配仓库子路径挂载。

## 后台运行并写日志

不打开 VSCode 时，推荐用脚本启动：

```powershell
cd website
npm run dev:start
```

常用命令：

```powershell
npm run dev:status
npm run dev:tail
npm run dev:stop
```

日志路径：

```text
website/logs/dev.log
website/logs/dev.err.log
```

## 构建

```powershell
npm run build
```

构建产物输出到：

```text
website/dist
```

## 部署建议

GitHub Pages / Cloudflare Pages / Vercel / Netlify:

```text
项目根目录: website
构建命令: npm run build
输出目录: dist
Node.js: 20 或 22 LTS
```

如果直接使用 GitHub Pages Actions，保持输出目录为 `website/dist` 即可。
