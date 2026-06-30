const commands = [
  { id: "1", title: "Generate Report", icon: "⚡", shortcut: "⌘ G", color: "cyan" },
  { id: "2", title: "SSH Production Server", icon: "▰", shortcut: "⌘ ⇧ P", color: "violet" },
  { id: "3", title: "Search Snippets", icon: "{ }", shortcut: "⌘ S", color: "blue" },
  { id: "4", title: "Kill Port 3000", icon: "✕", shortcut: "⌘ K", color: "rose" },
  { id: "5", title: "Translate to English", icon: "◎", shortcut: "⌘ T", color: "emerald" },
];

const phrases = ["ssh", "report", "kill", "trans"];
const typedText = document.querySelector("#typedText");
const commandList = document.querySelector("#commandList");
const year = document.querySelector("#year");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

let text = "";
let phraseIndex = 0;
let isDeleting = false;

function renderCommands() {
  if (!commandList) return;
  const filtered = commands.filter((command) => command.title.toLowerCase().includes(text.toLowerCase()));

  if (filtered.length === 0) {
    commandList.innerHTML = `
      <div class="empty-results">
        <span>⌕</span>
        <p>No matching commands</p>
      </div>
    `;
    return;
  }

  commandList.innerHTML = filtered
    .map(
      (command, index) => `
        <article class="command-item ${index === 0 ? "is-active" : ""}">
          <span class="command-icon ${command.color}">${command.icon}</span>
          <strong>${command.title}</strong>
          <kbd>${command.shortcut}</kbd>
        </article>
      `,
    )
    .join("");
}

function tickTyping() {
  const currentPhrase = phrases[phraseIndex];
  const complete = !isDeleting && text === currentPhrase;
  const empty = isDeleting && text === "";

  if (complete) {
    window.setTimeout(() => {
      isDeleting = true;
      tickTyping();
    }, 2000);
    return;
  }

  if (empty) {
    isDeleting = false;
    phraseIndex = (phraseIndex + 1) % phrases.length;
  } else {
    text = isDeleting ? text.slice(0, -1) : currentPhrase.slice(0, text.length + 1);
  }

  if (typedText) typedText.textContent = text;
  renderCommands();
  window.setTimeout(tickTyping, isDeleting ? 40 : 120);
}

renderCommands();
tickTyping();
