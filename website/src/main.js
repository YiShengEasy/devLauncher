const contributionGrid = document.querySelector(".contribution-grid");

if (contributionGrid) {
  for (let index = 0; index < 156; index += 1) {
    const cell = document.createElement("span");
    const wave = Math.sin(index * 0.42) + Math.cos(index * 0.17);
    const level = wave > 1.15 ? 4 : wave > 0.48 ? 3 : wave > -0.15 ? 2 : wave > -0.85 ? 1 : 0;
    if (level > 0) cell.dataset.level = String(level);
    contributionGrid.append(cell);
  }
}

const commands = [
  "open clipboard history",
  "search API Lab",
  "run deploy script",
  "install marketplace tool",
];

const commandText = document.querySelector("#commandText");
let activeIndex = 0;

function rotateCommand() {
  if (!commandText) return;
  commandText.textContent = commands[activeIndex % commands.length];
  activeIndex += 1;
}

rotateCommand();
window.setInterval(rotateCommand, 1800);
