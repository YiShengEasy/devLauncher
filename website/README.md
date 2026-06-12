# DevLauncher Website

独立的 DevLauncher 个人产品介绍主页，不依赖 `app/` 桌面工具项目运行。

## GitHub Pages

推送到 `main` 后，GitHub Actions 会自动构建并发布 `website/dist`。

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

也可以直接用浏览器打开 `index.html` 预览。

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

Cloudflare Pages / Vercel / Netlify:

```text
项目根目录: website
构建命令: npm run build
输出目录: dist
Node.js: 20 或 22 LTS
```

桌面安装包建议发布到 GitHub Releases 或对象存储，官网只维护下载入口。
