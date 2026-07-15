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
  { key: "1", text: "双击 Ctrl 唤起虚拟键盘" },
  { key: "Q", text: "点击空键位选择动作类型" },
  { key: "Y", text: "绑定内置工具或脚本动作" },
  { key: "C", text: "拖拽键帽交换常用位置" },
  { key: "N", text: "按下键位立即执行动作" },
];

const typedText = document.querySelector("#typedText");
const keyboardBoard = document.querySelector("#keyboardBoard");
const operationFlow = document.querySelector("#operationFlow");
const year = document.querySelector("#year");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

let stepIndex = 0;
let text = "";
let isDeleting = false;

function renderKeyboard(activeKey) {
  if (!keyboardBoard) return;

  keyboardBoard.innerHTML = keyRows
    .map((row, rowIndex) => `
      <div class="keyboard-row row-${rowIndex}">
        ${row
          .map((key) => {
            const binding = bindings[key];
            const style = binding ? ` style="--accent: ${binding.color}"` : "";
            return `
              <button class="keycap ${binding ? "is-bound" : ""} ${binding?.tile ? "has-tile-icon" : ""} ${activeKey === key ? "is-active" : ""}"${style} type="button" aria-label="${key}${binding ? ` ${binding.name}` : ""}">
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

function renderOperationFlow(activeKey) {
  if (!operationFlow) return;
  const activeIndex = demoSteps.findIndex((step) => step.key === activeKey);
  operationFlow.innerHTML = demoSteps
    .map((step, index) => `
      <span class="${index === activeIndex ? "is-active" : ""}">
        <b>${String(index + 1).padStart(2, "0")}</b>${step.text}
      </span>
    `)
    .join("");
}

function renderDemo() {
  const activeKey = demoSteps[stepIndex].key;
  renderKeyboard(activeKey);
  renderOperationFlow(activeKey);
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
