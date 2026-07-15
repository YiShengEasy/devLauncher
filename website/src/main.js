const keyRows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

const bindings = {
  Q: { name: "剪切板历史", type: "内置", icon: "▤", color: "#7dd3fc", detail: "搜索复制记录，一键回填到当前上下文。" },
  W: { name: "截图问题报告", type: "内置", icon: "AI", color: "#7dd3fc", detail: "截图、标注并整理成可复制的 AI Prompt。" },
  E: { name: "JSON 助手", type: "内置", icon: "{ }", color: "#7dd3fc", detail: "格式化、转义、压缩 JSON 和常用片段。" },
  R: { name: "API Lab", type: "插件", icon: "API", color: "#a7f3d0", detail: "打开插件市场里的 API 调试面板。" },
  T: { name: "终端", type: "内置", icon: "▰", color: "#7dd3fc", detail: "进入内置终端或本地命令执行窗口。" },
  A: { name: "快捷记忆", type: "内置", icon: "MEM", color: "#7dd3fc", detail: "沉淀命令、快捷键和项目速查内容。" },
  S: { name: "项目文件夹", type: "文件夹", icon: "DIR", color: "#fbbf24", detail: "用 Finder、VS Code、Cursor 或自定义工具打开目录。" },
  D: { name: "网页账号", type: "网址", icon: "URL", color: "#34d399", detail: "打开常用网址，可配合 Chrome 扩展填入登录信息。" },
  F: { name: "SSH 会话", type: "SSH", icon: "SSH", color: "#c084fc", detail: "保存主机、端口、用户和终端偏好，一键连接。" },
  G: { name: "脚本命令", type: "脚本", icon: "$", color: "#f87171", detail: "运行终端脚本，把重复命令变成一个键位。" },
};

const demoSteps = [
  { key: "Q", text: "双击 Ctrl 唤起虚拟键盘" },
  { key: "W", text: "点击空键位选择动作类型" },
  { key: "E", text: "绑定内置工具或插件动作" },
  { key: "S", text: "拖拽键帽交换常用位置" },
  { key: "F", text: "按下键位立即执行动作" },
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
              <button class="keycap ${binding ? "is-bound" : ""} ${activeKey === key ? "is-active" : ""}"${style} type="button" aria-label="${key}${binding ? ` ${binding.name}` : ""}">
                <span class="key-label">${key}</span>
                ${binding ? `<span class="key-icon">${binding.icon}</span>${binding.type === "脚本" ? `<strong>${binding.name}</strong>` : ""}` : ""}
              </button>
            `;
          })
          .join("")}
      </div>
    `)
    .join("");
}

function renderInspector(activeKey) {
  if (!keyboardInspector) return;
  const binding = bindings[activeKey] ?? bindings.Q;
  const activeIndex = demoSteps.findIndex((step) => step.key === activeKey);

  keyboardInspector.innerHTML = `
    <div class="inspector-badge" style="--accent: ${binding.color}">
      <span>${activeKey}</span>
      <strong>${binding.type}</strong>
    </div>
    <h3>${binding.name}</h3>
    <p>${binding.detail}</p>
    <div class="binding-flow">
      ${demoSteps
        .map((step, index) => `
          <div class="flow-item ${index === activeIndex ? "is-active" : ""}">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <p>${step.text}</p>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderDemo() {
  const activeKey = demoSteps[stepIndex].key;
  renderKeyboard(activeKey);
  renderInspector(activeKey);
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
