const keyRows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

const bindings = {
  1: { name: "飞书", type: "app", icon: "云", color: "#fbbf24", tile: true },
  3: { name: "安全检查", type: "system", icon: "♢", color: "#34d399" },
  5: { name: "截图报告", type: "builtin", icon: "▧", color: "#f59e0b" },
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

const typedText = document.querySelector("#typedText");
const keyboardBoard = document.querySelector("#keyboardBoard");
const keyboardInspector = document.querySelector("#keyboardInspector");
const year = document.querySelector("#year");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

let stepIndex = 0;
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

renderDemo();
tickTyping();
