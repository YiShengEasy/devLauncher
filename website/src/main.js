const keyRows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

const bindings = {
  1: { name: "飞书", type: "app", icon: "云", color: "#fbbf24", tile: true },
  3: { name: "安全检查", type: "system", icon: "♢", color: "#34d399" },
  5: { name: "截图 OCR", type: "builtin", icon: "▧", color: "#f59e0b" },
  8: { name: "DevDocs", type: "url", icon: "D", color: "#dffcf2" },
  0: { name: "系统工具", type: "system", icon: "☼", color: "#f97316" },
  Q: { name: "网站", type: "url", icon: "◎", color: "#22d3ee" },
  Y: { name: "终端", type: "ssh", icon: "▻", color: "#4ade80" },
  I: { name: "Writing", type: "plugin", icon: "W", color: "#dffcf2" },
  P: { name: "API Lab", type: "plugin", icon: "△", color: "#c4b5fd", tile: true },
  A: { name: "文档", type: "file", icon: "▤", color: "#facc15" },
  D: { name: "JSON", type: "script", icon: "{·}", color: "#a78bfa" },
  F: { name: "Vite", type: "app", icon: "V", color: "#dffcf2" },
  L: { name: "系统工具", type: "system", icon: "☼", color: "#f97316" },
  X: { name: "剪切板", type: "builtin", icon: "▣", color: "#22d3ee" },
  C: { name: "飞书CC-...", type: "script", icon: "▻", color: "#4ade80" },
  V: { name: "AI 工具", type: "app", icon: "A", color: "#dffcf2" },
  N: { name: "切图", type: "script", icon: "▻", color: "#4ade80" },
};

const demoSteps = [
  { key: "1", text: "双击 Ctrl 唤起虚拟键盘", title: "快捷唤起", type: "快捷键", detail: "短时间连续按两次 Control，即可打开或隐藏虚拟键盘。", accent: "#60a5fa", mode: "summon" },
  { key: "W", text: "点击空键位选择动作类型", title: "选择动作类型", type: "空键位", detail: "点击未绑定的键位，从应用、网址、脚本、内置工具和插件中选择。", accent: "#22d3ee", mode: "select" },
  { key: "Y", text: "绑定内置工具或脚本动作", title: "绑定动作", type: "动作设置", detail: "填写目标并保存，动作图标会立即出现在对应键帽上。", accent: "#4ade80", mode: "bind" },
  { key: "C", targetKey: "N", text: "拖拽键帽交换常用位置", title: "拖拽交换", type: "键位整理", detail: "按住已绑定键帽拖到另一个位置，两个动作会直接交换。", accent: "#a78bfa", mode: "drag" },
  { key: "N", text: "按下键位立即执行动作", title: "立即执行", type: "一键启动", detail: "按下高亮键位后，DevLauncher 立即运行已绑定的动作。", accent: "#fbbf24", mode: "execute" },
];

const actionTypes = [
  { id: "app", code: "APP", name: "应用程序", detail: "启动本机应用，并按需要附带启动参数。", accent: "#60a5fa" },
  { id: "folder", code: "DIR", name: "文件夹", detail: "用 Finder、VS Code、Cursor 或指定工具打开项目目录。", accent: "#fbbf24" },
  { id: "file", code: "FILE", name: "文件", detail: "直接打开文档、配置文件、图片或其他本地素材。", accent: "#facc15" },
  { id: "url", code: "URL", name: "网址", detail: "打开常用网站、管理后台或本地开发服务。", accent: "#22d3ee" },
  { id: "ssh", code: "SSH", name: "SSH", detail: "连接保存的远程主机，快速进入终端会话。", accent: "#4ade80" },
  { id: "script", code: "CMD", name: "脚本", detail: "运行 Shell 命令或自动化脚本，把重复操作变成一个键位。", accent: "#a78bfa" },
  { id: "system", code: "SYS", name: "系统", detail: "执行系统命令、桌面控制和常用系统动作。", accent: "#fb7185" },
  { id: "builtin", code: "TOOL", name: "内置", detail: "打开剪切板、截图、JSON 助手、终端等内置工具。", accent: "#f59e0b" },
  { id: "plugin", code: "PLUG", name: "插件", detail: "运行从插件市场安装的 WebView 工具和扩展能力。", accent: "#c4b5fd" },
];

const typedText = document.querySelector("#typedText");
const keyboardBoard = document.querySelector("#keyboardBoard");
const keyboardInspector = document.querySelector("#keyboardInspector");
const actionTypeExplorer = document.querySelector("#actionTypeExplorer");
const year = document.querySelector("#year");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

let stepIndex = 0;
let typeIndex = 0;
let text = "";
let isDeleting = false;

function renderKeyboard(activeStep) {
  if (!keyboardBoard) return;

  keyboardBoard.dataset.step = activeStep.mode;

  keyboardBoard.innerHTML = keyRows
    .map((row, rowIndex) => `
      <div class="keyboard-row row-${rowIndex}">
        ${row
          .map((key) => {
            const binding = bindings[key];
            const isActive = activeStep.key === key;
            const isDropTarget = activeStep.targetKey === key;
            const accent = isActive || isDropTarget ? activeStep.accent : binding?.color;
            const style = accent ? ` style="--accent: ${accent}"` : "";
            return `
              <button class="keycap ${binding ? "is-bound" : ""} ${binding?.tile ? "has-tile-icon" : ""} ${isActive ? `is-active is-${activeStep.mode}` : ""} ${isDropTarget ? "is-drop-target" : ""}"${style} type="button" aria-label="${key}${binding ? ` ${binding.name}` : ""}">
                <span class="key-label">${key}</span>
                ${binding ? `<span class="key-icon">${binding.icon}</span>${binding.type === "script" ? `<strong>${binding.name}</strong>` : ""}` : ""}
              </button>
            `;
          })
          .join("")}
      </div>
    `)
    .join("");
}

function renderInspector(activeStep) {
  if (!keyboardInspector) return;

  keyboardInspector.innerHTML = `
    <div class="inspector-badge" style="--accent: ${activeStep.accent}">
      <span>${activeStep.key}</span>
      <strong>${activeStep.type}</strong>
    </div>
    <h3>${activeStep.title}</h3>
    <p>${activeStep.detail}</p>
    <div class="binding-flow">
      ${demoSteps
        .map((step, index) => `
          <div class="flow-item ${index === stepIndex ? "is-active" : ""}">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <p>${step.text}</p>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderDemo() {
  const activeStep = demoSteps[stepIndex];
  renderKeyboard(activeStep);
  renderInspector(activeStep);
}

function renderActionTypes() {
  if (!actionTypeExplorer) return;

  const activeType = actionTypes[typeIndex];
  actionTypeExplorer.dataset.activeType = activeType.id;
  actionTypeExplorer.innerHTML = `
    <div class="action-type-copy" style="--accent: ${activeType.accent}">
      <small>支持的动作类型</small>
      <div><span>${activeType.code}</span><h3>${activeType.name}</h3></div>
      <p>${activeType.detail}</p>
    </div>
    <div class="action-type-list" aria-label="应用程序、文件夹、文件、网址、SSH、脚本、系统、内置和插件">
      ${actionTypes
        .map((type, index) => `
          <span class="action-type-item ${index === typeIndex ? "is-active" : ""}" style="--accent: ${type.accent}">
            <b>${type.code}</b><em>${type.name}</em>
          </span>
        `)
        .join("")}
    </div>
  `;
}

function tickActionTypes() {
  window.setTimeout(() => {
    typeIndex = (typeIndex + 1) % actionTypes.length;
    renderActionTypes();
    tickActionTypes();
  }, 2200);
}

function tickTyping() {
  const currentPhrase = demoSteps[stepIndex].text;
  const complete = !isDeleting && text === currentPhrase;
  const empty = isDeleting && text === "";

  if (complete) {
    window.setTimeout(() => {
      isDeleting = true;
      tickTyping();
    }, 1800);
    return;
  }

  if (empty) {
    isDeleting = false;
    stepIndex = (stepIndex + 1) % demoSteps.length;
    renderDemo();
  } else {
    text = isDeleting ? text.slice(0, -1) : currentPhrase.slice(0, text.length + 1);
  }

  if (typedText) typedText.textContent = text;
  window.setTimeout(tickTyping, isDeleting ? 34 : 82);
}

function restartDemoProgress(root) {
  const progress = root?.querySelector(".showcase-progress");
  if (!progress || reducedMotionQuery.matches) return;
  progress.classList.remove("is-running");
  void progress.offsetWidth;
  progress.classList.add("is-running");
}

function createAutoDemo({ root, count, duration, render }) {
  if (!root) return { select: () => {} };

  let index = 0;
  let timer = null;
  let paused = false;

  const stop = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  const schedule = () => {
    stop();
    restartDemoProgress(root);
    if (paused || reducedMotionQuery.matches) return;
    timer = window.setTimeout(() => {
      index = (index + 1) % count;
      render(index);
      schedule();
    }, duration);
  };

  const select = (nextIndex) => {
    index = Math.max(0, Math.min(count - 1, nextIndex));
    render(index);
    schedule();
  };

  root.addEventListener("mouseenter", () => {
    paused = true;
    stop();
  });
  root.addEventListener("mouseleave", () => {
    paused = false;
    schedule();
  });
  root.addEventListener("focusin", () => {
    paused = true;
    stop();
  });
  root.addEventListener("focusout", () => {
    paused = false;
    schedule();
  });

  render(index);
  schedule();
  return { select, schedule, stop };
}

const screenshotDemo = document.querySelector("#screenshotDemo");
const screenshotStatus = document.querySelector("#screenshotStatus");
const screenshotStepButtons = [...document.querySelectorAll("[data-screenshot-step]")];
const screenshotStageLabels = [
  "正在框选区域",
  "标注工具已就绪",
  "OCR 已识别 6 行文字",
];

const screenshotController = createAutoDemo({
  root: screenshotDemo,
  count: screenshotStageLabels.length,
  duration: 3800,
  render(index) {
    if (screenshotDemo) screenshotDemo.dataset.demoStep = String(index);
    if (screenshotStatus) screenshotStatus.textContent = screenshotStageLabels[index];
    screenshotStepButtons.forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
  },
});

screenshotStepButtons.forEach((button) => {
  button.addEventListener("click", () => {
    screenshotController.select(Number(button.dataset.screenshotStep ?? 0));
  });
});

const workflowDemo = document.querySelector("#workflowDemo");
const workflowStatus = document.querySelector("#workflowStatus");
const workflowSummary = document.querySelector("#workflowSummary");
const workflowCounter = document.querySelector("#workflowCounter");
const workflowNodes = [...document.querySelectorAll("[data-workflow-node]")];
const workflowConsoleLines = [...document.querySelectorAll("[data-console-line]")];
const workflowTrack = document.querySelector(".workflow-track span");
const workflowStages = [
  { status: "执行 1 / 4", summary: "正在执行测试与前端构建" },
  { status: "执行 2 / 4", summary: "正在生成并签名 macOS DMG" },
  { status: "等待确认", summary: "构建完成，等待人工确认发布" },
  { status: "执行 4 / 4", summary: "正在部署官网并运行健康检查" },
];

createAutoDemo({
  root: workflowDemo,
  count: workflowStages.length,
  duration: 3800,
  render(index) {
    const stage = workflowStages[index];
    if (workflowStatus) workflowStatus.textContent = stage.status;
    if (workflowSummary) workflowSummary.textContent = stage.summary;
    if (workflowCounter) workflowCounter.textContent = `${index + 1} / ${workflowStages.length}`;
    if (workflowTrack) {
      workflowTrack.style.height = `${(index / (workflowStages.length - 1)) * 100}%`;
    }

    workflowNodes.forEach((node, nodeIndex) => {
      const state = nodeIndex < index ? "done" : nodeIndex === index ? "active" : "waiting";
      node.classList.toggle("is-done", state === "done");
      node.classList.toggle("is-active", state === "active");
      const stateLabel = node.querySelector("em");
      if (stateLabel) {
        stateLabel.textContent = state === "done"
          ? "完成"
          : state === "active"
            ? (index === 2 ? "待确认" : "运行中")
            : "等待";
      }
    });

    workflowConsoleLines.forEach((line, lineIndex) => {
      line.classList.toggle("is-visible", lineIndex <= index);
      line.classList.toggle("is-current", lineIndex === index);
    });
  },
});

const revealTargets = document.querySelectorAll("[data-reveal]");
if ("IntersectionObserver" in window && !reducedMotionQuery.matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.16 });
  revealTargets.forEach((target) => revealObserver.observe(target));
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

renderDemo();
renderActionTypes();
tickTyping();
tickActionTypes();
