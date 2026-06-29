# API Lab Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first-phase `API Lab` official DevLauncher WebView plugin for lightweight API requests, environments, collections, history, import/export, and marketplace installation.

**Architecture:** The first phase is a static WebView plugin under `examples/plugins/api-lab` with all app logic bundled into `dist/index.html`. It uses browser `fetch` through a focused `FetchTransport`, persists plugin data in `localStorage`, and publishes through the existing static marketplace files. Native HTTP is not implemented in this plan; it stays as a later spec.

**Tech Stack:** Static HTML/CSS/JavaScript, browser `fetch`, `AbortController`, `localStorage`, DevLauncher `plugin.json` WebView plugin format, marketplace zip packaging, existing `app` TypeScript/Vite validation.

---

## File Structure

- Create: `examples/plugins/api-lab/plugin.json`
  - DevLauncher plugin manifest.
- Create: `examples/plugins/api-lab/icon.svg`
  - Local plugin icon.
- Create: `examples/plugins/api-lab/README.md`
  - Plugin scope, CORS limit, and user-facing feature summary.
- Create: `examples/plugins/api-lab/dist/index.html`
  - Single-file plugin UI, state, request transport, collection/history/env storage, import/export.
- Create: `examples/plugins/api-lab/smoke-test.mjs`
  - Node smoke checks for manifest, exported fixture shape, and required HTML anchors.
- Create: `marketplace/icons/api-lab.svg`
  - Marketplace icon copy.
- Create: `marketplace/plugins/api-lab/README.md`
  - Marketplace plugin description.
- Create: `marketplace/releases/api-lab-1.0.0.zip`
  - Release package containing manifest, README, icon, and `dist/index.html`.
- Modify: `marketplace/marketplace.json`
  - Add `devlauncher.tools.api-lab` entry with sha256.

The plan intentionally does not modify Tauri Rust code, plugin host code, or manifest schema. It uses the existing plugin market path proven by Developer Toolkit.

---

### Task 1: Plugin Skeleton And Static UI Shell

**Files:**
- Create: `examples/plugins/api-lab/plugin.json`
- Create: `examples/plugins/api-lab/icon.svg`
- Create: `examples/plugins/api-lab/README.md`
- Create: `examples/plugins/api-lab/dist/index.html`
- Create: `examples/plugins/api-lab/smoke-test.mjs`

- [ ] **Step 1: Create the plugin manifest**

Create `examples/plugins/api-lab/plugin.json` with this exact content:

```json
{
  "id": "devlauncher.tools.api-lab",
  "name": "API Lab",
  "version": "1.0.0",
  "kind": "webview",
  "description": "轻量 API 请求、环境变量、集合和历史记录工具。",
  "entry": "dist/index.html",
  "icon": "icon.svg",
  "actions": [
    {
      "id": "open",
      "title": "打开 API Lab",
      "type": "webview"
    }
  ]
}
```

- [ ] **Step 2: Create the local plugin icon**

Create `examples/plugins/api-lab/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="API Lab">
  <rect width="96" height="96" rx="20" fill="#101116"/>
  <path d="M20 31h56a9 9 0 0 1 9 9v16a9 9 0 0 1-9 9H20a9 9 0 0 1-9-9V40a9 9 0 0 1 9-9Z" fill="#1d202a" stroke="#f6b44b" stroke-width="4"/>
  <path d="M27 48h13m8 0h21" stroke="#e8eaf0" stroke-width="6" stroke-linecap="round"/>
  <circle cx="72" cy="48" r="5" fill="#2ec4b6"/>
</svg>
```

- [ ] **Step 3: Create the plugin README**

Create `examples/plugins/api-lab/README.md`:

```markdown
# API Lab

Static DevLauncher WebView plugin for lightweight API requests.

Features:

- Edit method, URL, query, headers, and body.
- Send requests with browser `fetch`.
- View status, time, response headers, and formatted response body.
- Save environments, collections, and recent history locally.
- Import and export API Lab JSON backups.

First version limitation:

- Requests run through browser `fetch`, so some APIs may fail because of CORS.
- Native proxy, certificate, cookie jar, multipart upload, and binary response support are planned for a later DevLauncher native HTTP capability.
```

- [ ] **Step 4: Create the first HTML shell**

Create `examples/plugins/api-lab/dist/index.html` with this shell. Later tasks replace the small script with full behavior while keeping the DOM ids/classes stable:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Lab</title>
    <style>
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
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0)),
          var(--bg);
        color: var(--text);
      }
      button, input, textarea, select { font: inherit; }
      button {
        min-height: 31px;
        border: 1px solid rgba(255,255,255,0.13);
        border-radius: 7px;
        padding: 0 10px;
        background: rgba(255,255,255,0.07);
        color: rgba(255,255,255,0.78);
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      button:hover { border-color: rgba(246,180,75,0.52); }
      button:disabled { cursor: not-allowed; opacity: 0.5; }
      input, textarea, select {
        width: 100%;
        min-width: 0;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        background: rgba(255,255,255,0.055);
        color: var(--text);
        outline: none;
        font-size: 12px;
      }
      input, select { min-height: 31px; padding: 6px 9px; }
      textarea {
        min-height: 170px;
        padding: 10px 11px;
        resize: vertical;
        line-height: 1.5;
        font-family: Consolas, "Cascadia Code", Menlo, monospace;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .app {
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto auto 1fr;
        gap: 10px;
        padding: 12px;
      }
      .topbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
      }
      h1 { margin: 0; font-size: 15px; line-height: 1.25; letter-spacing: 0; }
      #status { margin: 3px 0 0; min-height: 16px; color: var(--muted); font-size: 11px; line-height: 16px; }
      #status.error { color: var(--danger); }
      .request-line {
        display: grid;
        grid-template-columns: 112px minmax(0, 1fr) auto auto;
        gap: 8px;
      }
      .layout {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(210px, 0.3fr) minmax(0, 1fr);
        gap: 10px;
      }
      .panel {
        min-width: 0;
        min-height: 0;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--panel);
        padding: 12px;
      }
      .section-title {
        margin: 0 0 8px;
        font-size: 12px;
        color: rgba(255,255,255,0.74);
        font-weight: 800;
      }
      .tabs { display: flex; gap: 6px; margin-bottom: 8px; overflow-x: auto; }
      .tab.active {
        border-color: rgba(246,180,75,0.6);
        background: rgba(246,180,75,0.14);
        color: #fff4df;
      }
      .split {
        height: 100%;
        display: grid;
        grid-template-rows: minmax(250px, 0.58fr) minmax(210px, 0.42fr);
        gap: 10px;
      }
      .row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
        gap: 6px;
        margin-bottom: 6px;
      }
      .list {
        display: grid;
        gap: 6px;
        max-height: 240px;
        overflow: auto;
      }
      .list button {
        min-height: 34px;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 8px;
        color: var(--muted);
        font-size: 11px;
      }
      .output {
        min-height: 160px;
        overflow: auto;
        padding: 10px 11px;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        background: rgba(0,0,0,0.16);
        font-size: 12px;
        line-height: 1.5;
        font-family: Consolas, "Cascadia Code", Menlo, monospace;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      @media (max-width: 780px) {
        .app { padding: 10px; }
        .request-line { grid-template-columns: 92px minmax(0, 1fr); }
        .layout { grid-template-columns: 1fr; }
        .split { grid-template-rows: auto auto; }
      }
    </style>
  </head>
  <body>
    <main class="app">
      <header class="topbar">
        <div>
          <h1>API Lab</h1>
          <p id="status">Ready</p>
        </div>
        <select id="envSelect" aria-label="Environment"></select>
      </header>

      <section class="request-line" aria-label="Request">
        <select id="method">
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>PATCH</option>
          <option>DELETE</option>
          <option>HEAD</option>
          <option>OPTIONS</option>
        </select>
        <input id="url" placeholder="https://api.example.com/users/{{id}}" />
        <button id="send" type="button">发送</button>
        <button id="cancel" type="button" disabled>取消</button>
      </section>

      <section class="layout">
        <aside class="panel">
          <div class="tabs">
            <button class="tab active" data-side-tab="collections" type="button">集合</button>
            <button class="tab" data-side-tab="history" type="button">历史</button>
            <button class="tab" data-side-tab="env" type="button">环境</button>
          </div>
          <div id="sidePanel"></div>
        </aside>

        <section class="split">
          <div class="panel">
            <div class="tabs">
              <button class="tab active" data-request-tab="query" type="button">Query</button>
              <button class="tab" data-request-tab="headers" type="button">Headers</button>
              <button class="tab" data-request-tab="body" type="button">Body</button>
            </div>
            <div id="requestPanel"></div>
          </div>

          <div class="panel">
            <div class="tabs">
              <button class="tab active" data-response-tab="body" type="button">Response</button>
              <button class="tab" data-response-tab="headers" type="button">Headers</button>
            </div>
            <div id="responsePanel">
              <div class="meta"><span>等待请求</span></div>
              <div class="output">发送请求后，这里会显示响应。</div>
            </div>
          </div>
        </section>
      </section>
    </main>

    <script>
      const statusEl = document.getElementById("status");
      function setStatus(message, isError = false) {
        statusEl.textContent = message;
        statusEl.classList.toggle("error", isError);
      }
      setStatus("Ready");
    </script>
  </body>
</html>
```

- [ ] **Step 5: Create the first smoke test**

Create `examples/plugins/api-lab/smoke-test.mjs`:

```js
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = new URL(".", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
const html = await readFile(new URL("dist/index.html", root), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(manifest.id === "devlauncher.tools.api-lab", "manifest id mismatch");
assert(manifest.kind === "webview", "manifest kind must be webview");
assert(manifest.entry === "dist/index.html", "manifest entry mismatch");
assert(manifest.actions?.[0]?.type === "webview", "manifest action must be webview");

for (const id of ["method", "url", "send", "cancel", "envSelect", "sidePanel", "requestPanel", "responsePanel"]) {
  assert(html.includes(`id="${id}"`), `missing #${id}`);
}

console.log(`API Lab smoke test passed at ${path.basename(new URL(".", root).pathname)}`);
```

- [ ] **Step 6: Run the smoke test**

Run:

```bash
node examples/plugins/api-lab/smoke-test.mjs
```

Expected:

```text
API Lab smoke test passed at api-lab
```

- [ ] **Step 7: Commit the skeleton**

```bash
git add examples/plugins/api-lab/plugin.json examples/plugins/api-lab/icon.svg examples/plugins/api-lab/README.md examples/plugins/api-lab/dist/index.html examples/plugins/api-lab/smoke-test.mjs
git commit -m "feat: add api lab plugin shell"
```

---

### Task 2: State, Storage, Variables, And Request Builder

**Files:**
- Modify: `examples/plugins/api-lab/dist/index.html`
- Modify: `examples/plugins/api-lab/smoke-test.mjs`

- [ ] **Step 1: Add state and storage code to the script**

In `examples/plugins/api-lab/dist/index.html`, replace the current `<script>` block with this script. This implements stable state, `localStorage`, variable interpolation, and request building without sending network requests yet:

```html
<script>
  const STORAGE_KEY = "devlauncher.apiLab.v1";
  const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  const BODY_MODES = ["none", "json", "text"];

  const els = {
    status: document.getElementById("status"),
    envSelect: document.getElementById("envSelect"),
    method: document.getElementById("method"),
    url: document.getElementById("url"),
    send: document.getElementById("send"),
    cancel: document.getElementById("cancel"),
    sidePanel: document.getElementById("sidePanel"),
    requestPanel: document.getElementById("requestPanel"),
    responsePanel: document.getElementById("responsePanel")
  };

  const defaultState = () => ({
    version: 1,
    activeEnvironmentId: "env-local",
    activeSideTab: "collections",
    activeRequestTab: "query",
    activeResponseTab: "body",
    environments: [
      {
        id: "env-local",
        name: "Local",
        variables: [
          { key: "baseUrl", value: "http://localhost:3000" },
          { key: "token", value: "" }
        ]
      }
    ],
    collections: [
      {
        id: "col-default",
        name: "Default",
        requests: []
      }
    ],
    history: [],
    draft: {
      id: "draft",
      name: "Untitled",
      method: "GET",
      url: "{{baseUrl}}",
      query: [{ key: "", value: "", enabled: true }],
      headers: [{ key: "Accept", value: "application/json", enabled: true }],
      bodyMode: "none",
      body: ""
    },
    response: null
  });

  let state = loadState();
  let activeAbort = null;

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle("error", isError);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1) return defaultState();
      return { ...defaultState(), ...parsed, response: null };
    } catch (error) {
      return defaultState();
    }
  }

  function saveState() {
    const { response, ...persisted } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }

  function activeEnvironment() {
    return state.environments.find((env) => env.id === state.activeEnvironmentId) ?? state.environments[0] ?? null;
  }

  function variableMap() {
    const env = activeEnvironment();
    const map = new Map();
    for (const pair of env?.variables ?? []) {
      if (pair.key.trim()) map.set(pair.key.trim(), pair.value);
    }
    return map;
  }

  function resolveVariables(input) {
    const missing = new Set();
    const vars = variableMap();
    const value = String(input ?? "").replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, key) => {
      if (!vars.has(key)) {
        missing.add(key);
        return `{{${key}}}`;
      }
      return vars.get(key);
    });
    return { value, missing: [...missing] };
  }

  function enabledPairs(pairs) {
    return (pairs ?? []).filter((pair) => pair.enabled && pair.key.trim());
  }

  function buildRequest() {
    const method = METHODS.includes(state.draft.method) ? state.draft.method : "GET";
    const resolvedUrl = resolveVariables(state.draft.url);
    const missing = new Set(resolvedUrl.missing);
    let url;
    try {
      url = new URL(resolvedUrl.value);
    } catch (error) {
      throw new Error("URL 无效，请输入完整 URL。");
    }

    for (const pair of enabledPairs(state.draft.query)) {
      const resolvedValue = resolveVariables(pair.value);
      resolvedValue.missing.forEach((key) => missing.add(key));
      url.searchParams.set(pair.key.trim(), resolvedValue.value);
    }

    const headers = {};
    for (const pair of enabledPairs(state.draft.headers)) {
      const resolvedValue = resolveVariables(pair.value);
      resolvedValue.missing.forEach((key) => missing.add(key));
      headers[pair.key.trim()] = resolvedValue.value;
    }

    let body = undefined;
    if (!["GET", "HEAD"].includes(method) && state.draft.bodyMode !== "none") {
      const resolvedBody = resolveVariables(state.draft.body);
      resolvedBody.missing.forEach((key) => missing.add(key));
      body = resolvedBody.value;
      if (state.draft.bodyMode === "json" && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    }

    if (missing.size > 0) {
      throw new Error(`缺少环境变量：${[...missing].join(", ")}`);
    }

    return { method, url: url.toString(), headers, body };
  }

  function updateDraft(patch) {
    state.draft = { ...state.draft, ...patch };
    saveState();
    render();
  }

  function updatePair(listName, index, patch) {
    const list = [...state.draft[listName]];
    list[index] = { ...list[index], ...patch };
    if (list.every((pair) => pair.key.trim())) {
      list.push({ key: "", value: "", enabled: true });
    }
    updateDraft({ [listName]: list });
  }

  function removePair(listName, index) {
    const list = state.draft[listName].filter((_, itemIndex) => itemIndex !== index);
    updateDraft({ [listName]: list.length ? list : [{ key: "", value: "", enabled: true }] });
  }

  function formatJsonBody() {
    try {
      updateDraft({ body: JSON.stringify(JSON.parse(state.draft.body || "{}"), null, 2), bodyMode: "json" });
      setStatus("JSON 已格式化。");
    } catch (error) {
      setStatus(`JSON 无效：${error.message}`, true);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function renderEnvSelect() {
    els.envSelect.innerHTML = state.environments.map((env) => (
      `<option value="${escapeHtml(env.id)}">${escapeHtml(env.name)}</option>`
    )).join("");
    els.envSelect.value = state.activeEnvironmentId ?? "";
  }

  function renderPairEditor(listName, title) {
    const pairs = state.draft[listName];
    return `
      <p class="section-title">${title}</p>
      ${pairs.map((pair, index) => `
        <div class="row">
          <input data-pair="${listName}" data-index="${index}" data-field="key" value="${escapeHtml(pair.key)}" placeholder="Key" />
          <input data-pair="${listName}" data-index="${index}" data-field="value" value="${escapeHtml(pair.value)}" placeholder="Value" />
          <button data-remove-pair="${listName}" data-index="${index}" type="button">删除</button>
        </div>
      `).join("")}
    `;
  }

  function renderRequestPanel() {
    if (state.activeRequestTab === "headers") {
      els.requestPanel.innerHTML = renderPairEditor("headers", "Headers");
      return;
    }
    if (state.activeRequestTab === "body") {
      els.requestPanel.innerHTML = `
        <p class="section-title">Body</p>
        <select id="bodyMode">
          ${BODY_MODES.map((mode) => `<option value="${mode}">${mode}</option>`).join("")}
        </select>
        <textarea id="bodyInput" placeholder="{ }">${escapeHtml(state.draft.body)}</textarea>
        <div class="actions">
          <button id="formatJson" type="button">格式化</button>
        </div>
      `;
      document.getElementById("bodyMode").value = state.draft.bodyMode;
      return;
    }
    els.requestPanel.innerHTML = renderPairEditor("query", "Query");
  }

  function renderSidePanel() {
    els.sidePanel.innerHTML = `<p class="section-title">第一阶段数据面板会在后续任务接入。</p>`;
  }

  function renderResponse() {
    els.responsePanel.innerHTML = `
      <div class="meta"><span>等待请求</span></div>
      <div class="output">发送请求后，这里会显示响应。</div>
    `;
  }

  function bindEvents() {
    els.method.onchange = () => updateDraft({ method: els.method.value });
    els.url.oninput = () => updateDraft({ url: els.url.value });
    els.envSelect.onchange = () => {
      state.activeEnvironmentId = els.envSelect.value;
      saveState();
      render();
    };
    document.querySelectorAll("[data-request-tab]").forEach((button) => {
      button.onclick = () => {
        state.activeRequestTab = button.dataset.requestTab;
        saveState();
        render();
      };
    });
    document.querySelectorAll("[data-side-tab]").forEach((button) => {
      button.onclick = () => {
        state.activeSideTab = button.dataset.sideTab;
        saveState();
        render();
      };
    });
    els.requestPanel.querySelectorAll("[data-pair]").forEach((input) => {
      input.oninput = () => updatePair(input.dataset.pair, Number(input.dataset.index), { [input.dataset.field]: input.value });
    });
    els.requestPanel.querySelectorAll("[data-remove-pair]").forEach((button) => {
      button.onclick = () => removePair(button.dataset.removePair, Number(button.dataset.index));
    });
    const bodyMode = document.getElementById("bodyMode");
    if (bodyMode) bodyMode.onchange = () => updateDraft({ bodyMode: bodyMode.value });
    const bodyInput = document.getElementById("bodyInput");
    if (bodyInput) bodyInput.oninput = () => updateDraft({ body: bodyInput.value });
    const formatJson = document.getElementById("formatJson");
    if (formatJson) formatJson.onclick = formatJsonBody;
    els.send.onclick = () => {
      try {
        const request = buildRequest();
        setStatus(`请求已构建：${request.method} ${request.url}`);
      } catch (error) {
        setStatus(error.message, true);
      }
    };
  }

  function render() {
    els.method.value = state.draft.method;
    els.url.value = state.draft.url;
    renderEnvSelect();
    document.querySelectorAll("[data-request-tab]").forEach((button) => button.classList.toggle("active", button.dataset.requestTab === state.activeRequestTab));
    document.querySelectorAll("[data-side-tab]").forEach((button) => button.classList.toggle("active", button.dataset.sideTab === state.activeSideTab));
    renderSidePanel();
    renderRequestPanel();
    renderResponse();
    bindEvents();
  }

  render();
  setStatus("Ready");
</script>
```

- [ ] **Step 2: Extend the smoke test for core functions**

Modify `examples/plugins/api-lab/smoke-test.mjs` by adding these assertions before the final `console.log`:

```js
for (const token of ["STORAGE_KEY", "resolveVariables", "buildRequest", "formatJsonBody", "localStorage"]) {
  assert(html.includes(token), `missing ${token}`);
}
```

- [ ] **Step 3: Run the smoke test**

Run:

```bash
node examples/plugins/api-lab/smoke-test.mjs
```

Expected:

```text
API Lab smoke test passed at api-lab
```

- [ ] **Step 4: Manually open the HTML**

Run:

```bash
open examples/plugins/api-lab/dist/index.html
```

Expected:

- API Lab opens in the browser.
- URL field starts with `{{baseUrl}}`.
- Clicking `发送` reports a built request using `http://localhost:3000`.
- Changing to Body tab, entering invalid JSON, and clicking `格式化` shows a JSON error.

- [ ] **Step 5: Commit state and builder work**

```bash
git add examples/plugins/api-lab/dist/index.html examples/plugins/api-lab/smoke-test.mjs
git commit -m "feat: add api lab request builder"
```

---

### Task 3: Fetch Transport And Response Viewer

**Files:**
- Modify: `examples/plugins/api-lab/dist/index.html`
- Modify: `examples/plugins/api-lab/smoke-test.mjs`

- [ ] **Step 1: Add fetch transport functions**

In `examples/plugins/api-lab/dist/index.html`, add these functions after `buildRequest()`:

```js
function responseSize(text) {
  return new Blob([text ?? ""]).size;
}

function formatBody(text, contentType) {
  if ((contentType ?? "").includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch (error) {
      return text;
    }
  }
  return text;
}

async function sendRequest() {
  let request;
  try {
    request = buildRequest();
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  const startedAt = performance.now();
  activeAbort = new AbortController();
  els.send.disabled = true;
  els.cancel.disabled = false;
  setStatus("正在发送请求...");

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: activeAbort.signal
    });
    const text = await response.text();
    const elapsedMs = Math.round(performance.now() - startedAt);
    const headers = [...response.headers.entries()].map(([key, value]) => ({ key, value }));
    state.response = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      elapsedMs,
      finalUrl: response.url,
      headers,
      size: responseSize(text),
      body: formatBody(text, response.headers.get("content-type")),
      rawBody: text
    };
    setStatus(`完成：${response.status} ${response.statusText}`);
  } catch (error) {
    const message = error.name === "AbortError"
      ? "请求已取消。"
      : `请求失败：${error.message}。如果目标服务未允许跨域访问，浏览器 CORS 会阻止第一版插件请求。`;
    state.response = {
      error: message,
      status: 0,
      statusText: "Failed",
      elapsedMs: Math.round(performance.now() - startedAt),
      finalUrl: request.url,
      headers: [],
      size: 0,
      body: ""
    };
    setStatus(message, true);
  } finally {
    activeAbort = null;
    els.send.disabled = false;
    els.cancel.disabled = true;
    render();
  }
}

function cancelRequest() {
  if (activeAbort) activeAbort.abort();
}
```

- [ ] **Step 2: Replace response rendering**

Replace the existing `renderResponse()` function with:

```js
function renderResponse() {
  const response = state.response;
  if (!response) {
    els.responsePanel.innerHTML = `
      <div class="meta"><span>等待请求</span></div>
      <div class="output">发送请求后，这里会显示响应。</div>
    `;
    return;
  }

  if (state.activeResponseTab === "headers") {
    els.responsePanel.innerHTML = `
      <div class="meta">
        <span>${escapeHtml(response.status)} ${escapeHtml(response.statusText)}</span>
        <span>${escapeHtml(response.elapsedMs)} ms</span>
        <span>${escapeHtml(response.size)} bytes</span>
      </div>
      <div class="output">${escapeHtml(response.headers.map((header) => `${header.key}: ${header.value}`).join("\n") || "No headers")}</div>
    `;
    return;
  }

  els.responsePanel.innerHTML = `
    <div class="meta">
      <span>${escapeHtml(response.status)} ${escapeHtml(response.statusText)}</span>
      <span>${escapeHtml(response.elapsedMs)} ms</span>
      <span>${escapeHtml(response.size)} bytes</span>
      <span>${escapeHtml(response.finalUrl)}</span>
    </div>
    <div class="output">${escapeHtml(response.error || response.body || "Empty response")}</div>
  `;
}
```

- [ ] **Step 3: Bind send, cancel, and response tabs**

In `bindEvents()`, replace the current `els.send.onclick = ...` block with:

```js
els.send.onclick = sendRequest;
els.cancel.onclick = cancelRequest;
document.querySelectorAll("[data-response-tab]").forEach((button) => {
  button.onclick = () => {
    state.activeResponseTab = button.dataset.responseTab;
    saveState();
    render();
  };
});
```

In `render()`, after the request tab active toggle, add:

```js
document.querySelectorAll("[data-response-tab]").forEach((button) => button.classList.toggle("active", button.dataset.responseTab === state.activeResponseTab));
```

- [ ] **Step 4: Extend the smoke test**

Add these assertions before the final `console.log` in `examples/plugins/api-lab/smoke-test.mjs`:

```js
for (const token of ["sendRequest", "cancelRequest", "AbortController", "formatBody", "responseSize"]) {
  assert(html.includes(token), `missing ${token}`);
}
```

- [ ] **Step 5: Run static smoke test**

Run:

```bash
node examples/plugins/api-lab/smoke-test.mjs
```

Expected:

```text
API Lab smoke test passed at api-lab
```

- [ ] **Step 6: Manually verify fetch behavior**

Run:

```bash
open examples/plugins/api-lab/dist/index.html
```

Manual checks:

- Set URL to `https://api.github.com/zen`, click `发送`, and verify status/body appears.
- Set URL to `https://api.github.com/repos/usebruno/bruno`, click `发送`, and verify JSON is formatted.
- Set URL to `http://localhost:1/no-service`, click `发送`, and verify a failure message appears without breaking the page.

- [ ] **Step 7: Commit transport work**

```bash
git add examples/plugins/api-lab/dist/index.html examples/plugins/api-lab/smoke-test.mjs
git commit -m "feat: add api lab fetch transport"
```

---

### Task 4: Collections, History, Environments, Import, And Export

**Files:**
- Modify: `examples/plugins/api-lab/dist/index.html`
- Modify: `examples/plugins/api-lab/smoke-test.mjs`

- [ ] **Step 1: Add collection and history helpers**

Add these functions after `updateDraft()`:

```js
function requestSnapshot(name = state.draft.name || "Untitled") {
  return {
    ...structuredClone(state.draft),
    id: uid("req"),
    name
  };
}

function loadRequest(request) {
  state.draft = structuredClone({ ...request, id: "draft" });
  saveState();
  render();
  setStatus(`已加载：${request.name}`);
}

function saveCurrentRequest() {
  const name = prompt("请求名称", state.draft.name || "Untitled");
  if (!name) return;
  const collection = state.collections[0] ?? { id: "col-default", name: "Default", requests: [] };
  if (state.collections.length === 0) state.collections.push(collection);
  collection.requests.unshift(requestSnapshot(name));
  saveState();
  render();
  setStatus("请求已保存。");
}

function deleteRequest(requestId) {
  state.collections = state.collections.map((collection) => ({
    ...collection,
    requests: collection.requests.filter((request) => request.id !== requestId)
  }));
  saveState();
  render();
  setStatus("请求已删除。");
}

function recordHistory(request, response) {
  state.history.unshift({
    id: uid("hist"),
    at: new Date().toISOString(),
    method: request.method,
    url: request.url,
    status: response.status,
    elapsedMs: response.elapsedMs,
    request: structuredClone(state.draft)
  });
  state.history = state.history.slice(0, 100);
}
```

- [ ] **Step 2: Add environment helpers**

Add these functions after `variableMap()`:

```js
function updateEnvironmentVariable(index, patch) {
  const env = activeEnvironment();
  if (!env) return;
  env.variables[index] = { ...env.variables[index], ...patch };
  if (env.variables.every((pair) => pair.key.trim())) {
    env.variables.push({ key: "", value: "" });
  }
  saveState();
  render();
}

function addEnvironment() {
  const name = prompt("环境名称", "Dev");
  if (!name) return;
  const env = {
    id: uid("env"),
    name,
    variables: [{ key: "baseUrl", value: "" }, { key: "token", value: "" }]
  };
  state.environments.push(env);
  state.activeEnvironmentId = env.id;
  saveState();
  render();
}
```

- [ ] **Step 3: Add import and export helpers**

Add these functions before `render()`:

```js
function exportData() {
  const payload = {
    version: 1,
    environments: state.environments,
    collections: state.collections
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "api-lab-export.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("已导出 API Lab JSON。");
}

function importDataFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result));
      if (payload.version !== 1 || !Array.isArray(payload.environments) || !Array.isArray(payload.collections)) {
        throw new Error("文件格式不是 API Lab v1。");
      }
      state.environments = payload.environments;
      state.collections = payload.collections;
      state.activeEnvironmentId = payload.environments[0]?.id ?? null;
      saveState();
      render();
      setStatus("导入完成。");
    } catch (error) {
      setStatus(`导入失败：${error.message}`, true);
    }
  };
  reader.readAsText(file);
}
```

- [ ] **Step 4: Record history after requests**

In `sendRequest()`, after setting successful `state.response`, add:

```js
recordHistory(request, state.response);
saveState();
```

In the `catch` block, after setting failed `state.response`, add:

```js
recordHistory(request, state.response);
saveState();
```

- [ ] **Step 5: Replace side panel rendering**

Replace `renderSidePanel()` with:

```js
function renderSidePanel() {
  if (state.activeSideTab === "history") {
    els.sidePanel.innerHTML = `
      <p class="section-title">最近请求</p>
      <div class="list">
        ${state.history.map((entry) => `
          <button data-load-history="${escapeHtml(entry.id)}" type="button">${escapeHtml(entry.method)} ${escapeHtml(entry.status)} ${escapeHtml(entry.url)}</button>
        `).join("") || "<p class=\"section-title\">暂无历史。</p>"}
      </div>
    `;
    return;
  }

  if (state.activeSideTab === "env") {
    const env = activeEnvironment();
    els.sidePanel.innerHTML = `
      <p class="section-title">环境变量</p>
      ${(env?.variables ?? []).map((pair, index) => `
        <div class="row">
          <input data-env-index="${index}" data-env-field="key" value="${escapeHtml(pair.key)}" placeholder="Key" />
          <input data-env-index="${index}" data-env-field="value" value="${escapeHtml(pair.value)}" placeholder="Value" />
          <span></span>
        </div>
      `).join("")}
      <div class="actions">
        <button id="addEnv" type="button">新环境</button>
        <button id="exportData" type="button">导出</button>
        <label>
          <input id="importData" type="file" accept="application/json" style="display:none" />
          <button id="importButton" type="button">导入</button>
        </label>
      </div>
    `;
    return;
  }

  const requests = state.collections.flatMap((collection) => collection.requests.map((request) => ({ ...request, collectionName: collection.name })));
  els.sidePanel.innerHTML = `
    <p class="section-title">集合</p>
    <div class="actions">
      <button id="saveRequest" type="button">保存当前请求</button>
    </div>
    <div class="list">
      ${requests.map((request) => `
        <button data-load-request="${escapeHtml(request.id)}" type="button">${escapeHtml(request.method)} ${escapeHtml(request.name)}</button>
      `).join("") || "<p class=\"section-title\">暂无保存的请求。</p>"}
    </div>
  `;
}
```

- [ ] **Step 6: Bind side panel interactions**

Add this block to the end of `bindEvents()`:

```js
els.sidePanel.querySelectorAll("[data-load-request]").forEach((button) => {
  button.onclick = () => {
    const request = state.collections.flatMap((collection) => collection.requests).find((item) => item.id === button.dataset.loadRequest);
    if (request) loadRequest(request);
  };
});
els.sidePanel.querySelectorAll("[data-load-history]").forEach((button) => {
  button.onclick = () => {
    const entry = state.history.find((item) => item.id === button.dataset.loadHistory);
    if (entry) loadRequest({ ...entry.request, name: `${entry.method} ${entry.url}` });
  };
});
els.sidePanel.querySelectorAll("[data-env-index]").forEach((input) => {
  input.oninput = () => updateEnvironmentVariable(Number(input.dataset.envIndex), { [input.dataset.envField]: input.value });
});
const saveRequestButton = document.getElementById("saveRequest");
if (saveRequestButton) saveRequestButton.onclick = saveCurrentRequest;
const addEnvButton = document.getElementById("addEnv");
if (addEnvButton) addEnvButton.onclick = addEnvironment;
const exportButton = document.getElementById("exportData");
if (exportButton) exportButton.onclick = exportData;
const importInput = document.getElementById("importData");
const importButton = document.getElementById("importButton");
if (importButton && importInput) {
  importButton.onclick = () => importInput.click();
  importInput.onchange = () => {
    const file = importInput.files?.[0];
    if (file) importDataFromFile(file);
  };
}
```

- [ ] **Step 7: Extend smoke test**

Add these assertions before the final `console.log` in `examples/plugins/api-lab/smoke-test.mjs`:

```js
for (const token of ["saveCurrentRequest", "recordHistory", "exportData", "importDataFromFile", "updateEnvironmentVariable"]) {
  assert(html.includes(token), `missing ${token}`);
}
```

- [ ] **Step 8: Run smoke and manual data checks**

Run:

```bash
node examples/plugins/api-lab/smoke-test.mjs
```

Expected:

```text
API Lab smoke test passed at api-lab
```

Manual checks:

- Save a request, reload the page, and verify it stays in Collection.
- Send a request, switch to History, and restore it.
- Add an environment, change `baseUrl`, and verify request building uses the new value.
- Export JSON, reload page, import JSON, and verify environments/collections return.

- [ ] **Step 9: Commit persistence features**

```bash
git add examples/plugins/api-lab/dist/index.html examples/plugins/api-lab/smoke-test.mjs
git commit -m "feat: add api lab saved data"
```

---

### Task 5: Marketplace Package

**Files:**
- Create: `marketplace/icons/api-lab.svg`
- Create: `marketplace/plugins/api-lab/README.md`
- Create: `marketplace/releases/api-lab-1.0.0.zip`
- Modify: `marketplace/marketplace.json`

- [ ] **Step 1: Copy the marketplace icon**

Create `marketplace/icons/api-lab.svg` with the same content as `examples/plugins/api-lab/icon.svg`.

- [ ] **Step 2: Create marketplace README**

Create `marketplace/plugins/api-lab/README.md`:

```markdown
# API Lab

Lightweight API request tool for DevLauncher.

Features:

- Edit method, URL, query, headers, and body.
- Send requests with browser `fetch`.
- Inspect status, time, response headers, and formatted body.
- Save environments, collections, and recent history locally.
- Import and export API Lab JSON backups.

This first release is a static WebView plugin. Some APIs may fail because of browser CORS restrictions. Native HTTP transport is planned as a later DevLauncher capability.
```

- [ ] **Step 3: Create the release zip**

Run:

```bash
cd examples/plugins/api-lab
zip -r ../../../marketplace/releases/api-lab-1.0.0.zip plugin.json README.md icon.svg dist/index.html
```

Expected:

```text
  adding: plugin.json
  adding: README.md
  adding: icon.svg
  adding: dist/index.html
```

- [ ] **Step 4: Compute sha256 and update marketplace index**

Run:

```bash
node --input-type=module -e "import fs from 'node:fs'; import crypto from 'node:crypto'; const zipPath = 'marketplace/releases/api-lab-1.0.0.zip'; const indexPath = 'marketplace/marketplace.json'; const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex'); const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); const entry = { id: 'devlauncher.tools.api-lab', name: 'API Lab', version: '1.0.0', kind: 'webview', description: 'Lightweight API requests, environments, collections, and history for DevLauncher.', downloadUrl: 'https://raw.githubusercontent.com/YiShengEasy/devLauncher/main/marketplace/releases/api-lab-1.0.0.zip', sha256, icon: 'https://raw.githubusercontent.com/YiShengEasy/devLauncher/main/marketplace/icons/api-lab.svg' }; const next = index.plugins.filter((plugin) => plugin.id !== entry.id); const developerToolkitIndex = next.findIndex((plugin) => plugin.id === 'devlauncher.tools.developer-toolkit'); next.splice(developerToolkitIndex + 1, 0, entry); fs.writeFileSync(indexPath, JSON.stringify({ ...index, plugins: next }, null, 2) + '\n'); console.log(sha256);"
```

Expected output shape:

```text
<64 lowercase hex characters>
```

- [ ] **Step 5: Validate marketplace JSON**

Run:

```bash
node --input-type=module -e "import fs from 'node:fs'; const data = JSON.parse(fs.readFileSync('marketplace/marketplace.json', 'utf8')); const item = data.plugins.find((plugin) => plugin.id === 'devlauncher.tools.api-lab'); if (!item) throw new Error('missing api lab'); if (!/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('bad sha'); console.log(item.name, item.version, item.sha256.length);"
```

Expected:

```text
API Lab 1.0.0 64
```

- [ ] **Step 6: Verify zip contents**

Run:

```bash
unzip -l marketplace/releases/api-lab-1.0.0.zip
```

Expected output includes:

```text
plugin.json
README.md
icon.svg
dist/index.html
```

- [ ] **Step 7: Commit marketplace package**

```bash
git add marketplace/icons/api-lab.svg marketplace/plugins/api-lab/README.md marketplace/releases/api-lab-1.0.0.zip marketplace/marketplace.json
git commit -m "chore: publish api lab plugin package"
```

---

### Task 6: Final Verification And Scope Check

**Files:**
- Modify only if verification finds a real issue:
  - `examples/plugins/api-lab/dist/index.html`
  - `examples/plugins/api-lab/smoke-test.mjs`
  - `marketplace/marketplace.json`

- [ ] **Step 1: Run plugin smoke test**

Run:

```bash
node examples/plugins/api-lab/smoke-test.mjs
```

Expected:

```text
API Lab smoke test passed at api-lab
```

- [ ] **Step 2: Run app tests**

Run:

```bash
cd app
npm run test
```

Expected:

```text
Test Files  ... passed
Tests       ... passed
```

- [ ] **Step 3: Run app build**

Run:

```bash
cd app
npm run build
```

Expected:

```text
vite v... building for production...
✓ built
```

- [ ] **Step 4: Manual plugin verification**

Run:

```bash
open examples/plugins/api-lab/dist/index.html
```

Verify:

- `GET https://api.github.com/zen` returns a response.
- `GET https://api.github.com/repos/usebruno/bruno` returns formatted JSON.
- A bad URL shows a URL validation error.
- A refused local URL shows a readable request failure.
- Saving a request persists after reload.
- History restores a prior request.
- Export/import restores environments and collections.
- Narrowing the browser to mobile width keeps controls readable and non-overlapping.

- [ ] **Step 5: Confirm no native HTTP work slipped in**

Run:

```bash
git diff --name-only HEAD~5..HEAD
```

Expected file set only includes:

```text
examples/plugins/api-lab/plugin.json
examples/plugins/api-lab/icon.svg
examples/plugins/api-lab/README.md
examples/plugins/api-lab/dist/index.html
examples/plugins/api-lab/smoke-test.mjs
marketplace/icons/api-lab.svg
marketplace/plugins/api-lab/README.md
marketplace/releases/api-lab-1.0.0.zip
marketplace/marketplace.json
```

- [ ] **Step 6: Capture second-phase follow-up**

Create a short note in the final implementation response, not a code file, saying:

```text
Native HTTP remains a follow-up spec. The API Lab MVP uses browser fetch and keeps CORS as a known first-phase limitation.
```

- [ ] **Step 7: Final commit if verification required fixes**

If Step 1 through Step 5 required fixes, commit those fixes:

```bash
git add examples/plugins/api-lab/dist/index.html examples/plugins/api-lab/smoke-test.mjs marketplace/marketplace.json
git commit -m "fix: polish api lab plugin verification"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Static WebView plugin identity is covered in Tasks 1 and 5.
- Request editing, variables, query, headers, and body are covered in Task 2.
- Fetch sending, cancellation, response status/time/headers/body, and CORS messaging are covered in Task 3.
- Collections, history, environments, import, and export are covered in Task 4.
- Marketplace zip, icon, README, sha256, and index update are covered in Task 5.
- Smoke, app test, app build, manual behavior, and native HTTP scope guard are covered in Task 6.

Placeholder scan:

- There are no open-ended implementation tasks without concrete code or commands.

Type consistency:

- State fields match the design spec names: `activeEnvironmentId`, `environments`, `collections`, `history`, and `draft`.
- Request fields match across helper functions: `method`, `url`, `query`, `headers`, `bodyMode`, and `body`.
- Later tasks reuse the same function names introduced earlier: `buildRequest`, `sendRequest`, `recordHistory`, `renderSidePanel`, and `renderResponse`.
