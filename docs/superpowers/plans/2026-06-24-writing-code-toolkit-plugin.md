# Writing And Code Toolkit Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a static DevLauncher `Writing & Code Toolkit` plugin with Diff, Markdown preview, Code Screenshot, and Snippets tools.

**Architecture:** Ship one self-contained static WebView plugin under `examples/plugins/writing-code-toolkit`, package it into the static marketplace, and list it in `marketplace/marketplace.json`. The plugin uses browser APIs only and runs inside the existing sandboxed plugin iframe.

**Tech Stack:** DevLauncher static WebView plugin manifest, HTML/CSS/vanilla JavaScript, browser canvas/SVG download path, local zip marketplace packaging, Node/Python smoke checks.

---

## File Structure

- Create `examples/plugins/writing-code-toolkit/plugin.json`.
- Create `examples/plugins/writing-code-toolkit/README.md`.
- Create `examples/plugins/writing-code-toolkit/icon.svg`.
- Create `examples/plugins/writing-code-toolkit/dist/index.html`.
- Create `marketplace/plugins/writing-code-toolkit/README.md`.
- Create `marketplace/icons/writing-code-toolkit.svg`.
- Create `marketplace/releases/writing-code-toolkit-1.0.0.zip`.
- Modify `marketplace/marketplace.json`.

## Tasks

- [ ] Create plugin skeleton and matching marketplace docs/icons.
- [ ] Build `dist/index.html` with tabs, safe storage, copy status, and DevLauncher-aligned dark compact styles.
- [ ] Implement line-level LCS diff with text output and colored preview rows.
- [ ] Implement escaped Markdown rendering for headings, emphasis, code blocks, links, quotes, lists, and paragraphs.
- [ ] Implement code screenshot rendering as an HTML preview card and PNG download through SVG/canvas.
- [ ] Implement snippets with add/update/delete, memory fallback, localStorage persistence when available, and insert-to-code-shot action.
- [ ] Package `writing-code-toolkit-1.0.0.zip`.
- [ ] Compute SHA-256 and add marketplace entry.
- [ ] Run static checks, zip layout check, app tests, and Chrome visual smoke check.
- [ ] Commit implementation with `feat: add writing code toolkit plugin`.

## Verification Commands

```bash
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('examples/plugins/writing-code-toolkit/plugin.json','utf8')); if(!/^[a-z0-9.-]+$/.test(m.id)) throw new Error('bad id'); if(m.kind!=='webview') throw new Error('bad kind'); if(!m.entry.endsWith('.html')) throw new Error('bad entry'); if(!m.actions.length || m.actions[0].type!=='webview') throw new Error('bad action'); console.log('manifest ok')"
```

```bash
node - <<'JS'
const fs = require('fs');
const html = fs.readFileSync('examples/plugins/writing-code-toolkit/dist/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
new Function(scripts);
console.log('script syntax ok');
JS
```

```bash
node -e "const html=require('fs').readFileSync('examples/plugins/writing-code-toolkit/dist/index.html','utf8'); if(/(?:src|href)=[\"']https?:\/\//.test(html)) throw new Error('remote dependency found'); console.log('offline ok')"
```

```bash
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('marketplace/releases/writing-code-toolkit-1.0.0.zip') as z:
    names = set(z.namelist())
required = {'plugin.json', 'README.md', 'icon.svg', 'dist/index.html'}
missing = required - names
if missing:
    raise SystemExit(f'missing {sorted(missing)}')
print('zip layout ok')
PY
```

```bash
npm --prefix app test -- --run
```
