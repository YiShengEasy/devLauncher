# Developer Toolkit Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a static DevLauncher `Developer Toolkit` plugin with timestamp, codec/hash, regex, Cron, and QR Code utilities.

**Architecture:** Ship one static WebView plugin under `examples/plugins/developer-toolkit`, package it as a marketplace zip, and list it in `marketplace/marketplace.json`. The plugin is self-contained in `dist/index.html`, uses browser APIs only, and follows the current DevLauncher dark compact tool styling.

**Tech Stack:** DevLauncher static WebView plugin manifest, HTML/CSS/vanilla JavaScript, browser `crypto.subtle`, local zip marketplace packaging, Node-based smoke checks.

---

## Scope Check

This plan implements one plugin defined by `docs/superpowers/specs/2026-06-24-developer-toolkit-plugin-design.md`. It does not add plugin permissions, Tauri commands, file access, OCR, clipboard reading, external APIs, or changes to existing built-in tools.

## File Structure

- Create `examples/plugins/developer-toolkit/plugin.json`: manifest accepted by the existing Rust validator.
- Create `examples/plugins/developer-toolkit/README.md`: local fixture documentation.
- Create `examples/plugins/developer-toolkit/icon.svg`: compact icon used by local installation.
- Create `examples/plugins/developer-toolkit/dist/index.html`: self-contained plugin UI, styles, and logic.
- Create `marketplace/plugins/developer-toolkit/README.md`: marketplace-facing description.
- Create `marketplace/icons/developer-toolkit.svg`: marketplace icon.
- Create `marketplace/releases/developer-toolkit-1.0.0.zip`: release package with `plugin.json` at zip root.
- Modify `marketplace/marketplace.json`: add the Developer Toolkit market entry with computed SHA-256.

## Task 1: Add Static Plugin Skeleton

**Files:**
- Create: `examples/plugins/developer-toolkit/plugin.json`
- Create: `examples/plugins/developer-toolkit/README.md`
- Create: `examples/plugins/developer-toolkit/icon.svg`
- Create: `marketplace/plugins/developer-toolkit/README.md`
- Create: `marketplace/icons/developer-toolkit.svg`

- [ ] **Step 1: Create the plugin manifest**

Create `examples/plugins/developer-toolkit/plugin.json` with:

```json
{
  "id": "devlauncher.tools.developer-toolkit",
  "name": "Developer Toolkit",
  "version": "1.0.0",
  "kind": "webview",
  "description": "时间戳、编码、哈希、正则、Cron 和二维码工具箱。",
  "entry": "dist/index.html",
  "icon": "icon.svg",
  "actions": [
    {
      "id": "open",
      "title": "打开开发者工具箱",
      "type": "webview"
    }
  ]
}
```

- [ ] **Step 2: Add local and marketplace README files**

Create both README files with the same core content:

```markdown
# Developer Toolkit

Static DevLauncher WebView plugin for daily developer utilities:

- Timestamp conversion
- Base64, URL encoding, hashes, and JWT decode
- Regex match testing
- Unix Cron preview
- QR Code generation

The plugin runs locally in the DevLauncher plugin host. It does not read files,
execute scripts, read the system clipboard, or call remote services.
```

- [ ] **Step 3: Add matching SVG icons**

Create `examples/plugins/developer-toolkit/icon.svg` and copy it to `marketplace/icons/developer-toolkit.svg`. The icon should be a 64x64 dark rounded square with a small `</>` mark and amber/teal accents. Keep the SVG standalone and ASCII-only.

- [ ] **Step 4: Verify manifest schema compatibility**

Run:

```bash
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('examples/plugins/developer-toolkit/plugin.json','utf8')); if(!/^[a-z0-9.-]+$/.test(m.id)) throw new Error('bad id'); if(m.kind!=='webview') throw new Error('bad kind'); if(!m.entry.endsWith('.html')) throw new Error('bad entry'); if(!m.actions.length || m.actions[0].type!=='webview') throw new Error('bad action'); console.log('manifest ok')"
```

Expected output:

```text
manifest ok
```

## Task 2: Build The Single-Page Plugin UI

**Files:**
- Create: `examples/plugins/developer-toolkit/dist/index.html`

- [ ] **Step 1: Create the HTML shell and CSS tokens**

Create a complete `index.html` with `zh-CN`, `viewport`, and a dark compact UI. Use these root CSS tokens:

```css
:root {
  color-scheme: dark;
  --bg: #101116;
  --panel: rgba(255, 255, 255, 0.045);
  --panel-strong: rgba(255, 255, 255, 0.07);
  --line: rgba(255, 255, 255, 0.12);
  --text: #e8eaf0;
  --muted: rgba(255, 255, 255, 0.56);
  --accent: #f6b44b;
  --accent-2: #2ec4b6;
  --danger: #ff6b6b;
}
```

The body layout must include:

```html
<main class="app">
  <header class="topbar">
    <div>
      <h1>Developer Toolkit</h1>
      <p id="status">Ready</p>
    </div>
    <button id="copyResult" type="button">复制</button>
  </header>
  <nav class="tabs" aria-label="Tools"></nav>
  <section id="toolPanel" class="tool-panel"></section>
</main>
```

- [ ] **Step 2: Add tab state and rendering**

Define tab metadata:

```js
const tabs = [
  { id: "timestamp", label: "Timestamp" },
  { id: "codec", label: "Codec" },
  { id: "regex", label: "Regex" },
  { id: "cron", label: "Cron" },
  { id: "qrcode", label: "QRCode" }
];
```

Persist the active tab with:

```js
const storage = {
  get activeTab() {
    return localStorage.getItem("devlauncher.developerToolkit.activeTab") || "timestamp";
  },
  set activeTab(value) {
    localStorage.setItem("devlauncher.developerToolkit.activeTab", value);
  }
};
```

- [ ] **Step 3: Add shared output and copy behavior**

Keep a `lastCopyText` string updated by each tool. Implement:

```js
async function copyText(text) {
  if (!text) {
    setStatus("没有可复制内容", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus("已复制");
  } catch {
    setStatus("复制不可用，请手动选择结果", "error");
  }
}
```

- [ ] **Step 4: Verify basic UI renders**

Run:

```bash
node -e "const fs=require('fs'); const html=fs.readFileSync('examples/plugins/developer-toolkit/dist/index.html','utf8'); for (const s of ['Developer Toolkit','Timestamp','Codec','Regex','Cron','QRCode']) if(!html.includes(s)) throw new Error('missing '+s); console.log('ui shell ok')"
```

Expected output:

```text
ui shell ok
```

## Task 3: Implement Text Utilities

**Files:**
- Modify: `examples/plugins/developer-toolkit/dist/index.html`

- [ ] **Step 1: Add timestamp helpers**

Implement:

```js
function parseTimestampInput(value) {
  const text = value.trim();
  if (!text) return new Date();
  if (/^\d{13}$/.test(text)) return new Date(Number(text));
  if (/^\d{10}$/.test(text)) return new Date(Number(text) * 1000);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error("无法解析时间");
  return parsed;
}

function formatDateBundle(date) {
  const ms = date.getTime();
  return [
    `Local: ${date.toLocaleString()}`,
    `ISO: ${date.toISOString()}`,
    `Unix 秒: ${Math.floor(ms / 1000)}`,
    `Unix 毫秒: ${ms}`
  ].join("\\n");
}
```

- [ ] **Step 2: Add codec and hash helpers**

Implement Base64, URL encode/decode, JWT decode, MD5, SHA-1, and SHA-256. Use `crypto.subtle.digest` for SHA-1 and SHA-256. Include a compact pure JavaScript MD5 function in the plugin file so the tool stays offline and dependency-free.

- [ ] **Step 3: Add regex helper**

Implement:

```js
function runRegex(pattern, flags, source) {
  const safeFlags = Array.from(new Set((flags || "g").replace(/[^gimsu]/g, "").split(""))).join("");
  const regex = new RegExp(pattern, safeFlags.includes("g") ? safeFlags : `${safeFlags}g`);
  const matches = [];
  for (const match of source.matchAll(regex)) {
    matches.push({
      index: match.index || 0,
      text: match[0],
      captures: match.slice(1)
    });
    if (match[0] === "") regex.lastIndex += 1;
  }
  return matches;
}
```

- [ ] **Step 4: Add Cron parser and preview**

Implement a 5-field Unix cron parser that supports `*`, `*/n`, `a,b`, `a-b`, and numeric values. Generate the next 5 run times by scanning minute-by-minute from the next minute with a maximum scan of 366 days.

- [ ] **Step 5: Verify utility snippets exist**

Run:

```bash
node -e "const html=require('fs').readFileSync('examples/plugins/developer-toolkit/dist/index.html','utf8'); for (const s of ['parseTimestampInput','formatDateBundle','runRegex','parseCronField','nextCronRuns','md5']) if(!html.includes(s)) throw new Error('missing '+s); console.log('utilities present')"
```

Expected output:

```text
utilities present
```

## Task 4: Implement QR Code Generation

**Files:**
- Modify: `examples/plugins/developer-toolkit/dist/index.html`

- [ ] **Step 1: Add QR Code generator**

Use a compact local QR encoder implementation inside `index.html`, exposed as:

```js
function createQrSvg(text, size, errorCorrectionLevel) {
  if (!text.trim()) throw new Error("请输入二维码内容");
  const qr = qrcode(0, errorCorrectionLevel);
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({
    cellSize: Math.max(2, Math.floor(size / qr.getModuleCount())),
    margin: 2
  });
}
```

The implementation must not load any CDN script.

- [ ] **Step 2: Add PNG download path**

Render the SVG to a canvas and download with:

```js
function downloadQrPng(svgText, filename) {
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  image.src = url;
}
```

- [ ] **Step 3: Verify no remote dependencies**

Run:

```bash
node -e "const html=require('fs').readFileSync('examples/plugins/developer-toolkit/dist/index.html','utf8'); if(/(?:src|href)=[\"']https?:\\/\\//.test(html)) throw new Error('remote dependency found'); console.log('offline ok')"
```

Expected output:

```text
offline ok
```

## Task 5: Package And Publish To Marketplace

**Files:**
- Create: `marketplace/releases/developer-toolkit-1.0.0.zip`
- Modify: `marketplace/marketplace.json`

- [ ] **Step 1: Create the release zip**

Run from the repository root:

```bash
cd examples/plugins/developer-toolkit && zip -r ../../../marketplace/releases/developer-toolkit-1.0.0.zip plugin.json README.md icon.svg dist
```

Expected output includes:

```text
adding: plugin.json
adding: README.md
adding: icon.svg
adding: dist/index.html
```

- [ ] **Step 2: Compute SHA-256**

Run:

```bash
shasum -a 256 marketplace/releases/developer-toolkit-1.0.0.zip
```

Use the first column as the marketplace `sha256`.

- [ ] **Step 3: Update marketplace index**

Run this script to compute the hash and insert or replace the marketplace entry:

```bash
node - <<'JS'
const fs = require('fs');
const crypto = require('crypto');
const zipPath = 'marketplace/releases/developer-toolkit-1.0.0.zip';
const marketPath = 'marketplace/marketplace.json';
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
const index = JSON.parse(fs.readFileSync(marketPath, 'utf8'));
const entry = {
  id: 'devlauncher.tools.developer-toolkit',
  name: 'Developer Toolkit',
  version: '1.0.0',
  kind: 'webview',
  description: 'Timestamp, codec, hash, regex, Cron, and QR Code utilities for DevLauncher.',
  downloadUrl: 'https://raw.githubusercontent.com/YiShengEasy/devLauncher/main/marketplace/releases/developer-toolkit-1.0.0.zip',
  sha256,
  icon: 'https://raw.githubusercontent.com/YiShengEasy/devLauncher/main/marketplace/icons/developer-toolkit.svg'
};
index.plugins = index.plugins.filter((plugin) => plugin.id !== entry.id);
index.plugins.push(entry);
fs.writeFileSync(marketPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(sha256);
JS
```

- [ ] **Step 4: Validate JSON**

Run:

```bash
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('marketplace/marketplace.json','utf8')); if(!data.plugins.some(p=>p.id==='devlauncher.tools.developer-toolkit')) throw new Error('missing developer toolkit'); console.log('marketplace ok')"
```

Expected output:

```text
marketplace ok
```

## Task 6: Final Verification

**Files:**
- Verify: `examples/plugins/developer-toolkit/plugin.json`
- Verify: `examples/plugins/developer-toolkit/dist/index.html`
- Verify: `marketplace/marketplace.json`
- Verify: `marketplace/releases/developer-toolkit-1.0.0.zip`

- [ ] **Step 1: Run frontend tests if dependencies are available**

Run:

```bash
npm --prefix app test -- --run
```

Expected: existing app tests pass, or document the exact failure if unrelated local changes already break them.

- [ ] **Step 2: Validate release zip root**

Run:

```bash
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('marketplace/releases/developer-toolkit-1.0.0.zip') as z:
    names = set(z.namelist())
required = {'plugin.json', 'README.md', 'icon.svg', 'dist/index.html'}
missing = required - names
if missing:
    raise SystemExit(f'missing {sorted(missing)}')
print('zip layout ok')
PY
```

Expected output:

```text
zip layout ok
```

- [ ] **Step 3: Review git diff scope**

Run:

```bash
git diff -- examples/plugins/developer-toolkit marketplace/plugins/developer-toolkit marketplace/icons/developer-toolkit.svg marketplace/marketplace.json
```

Expected: diff only contains Developer Toolkit plugin files and marketplace index changes.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add examples/plugins/developer-toolkit marketplace/plugins/developer-toolkit marketplace/icons/developer-toolkit.svg marketplace/releases/developer-toolkit-1.0.0.zip marketplace/marketplace.json docs/superpowers/plans/2026-06-24-developer-toolkit-plugin.md
git commit -m "feat: add developer toolkit plugin"
```
