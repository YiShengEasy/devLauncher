const pixelStage = document.querySelector(".pixel-stage");

if (pixelStage) {
  const palette = [
    "rgba(125, 211, 252, 0.72)",
    "rgba(45, 212, 191, 0.66)",
    "rgba(96, 165, 250, 0.7)",
    "rgba(251, 191, 36, 0.55)",
  ];

  for (let index = 0; index < 150; index += 1) {
    const pixel = document.createElement("i");
    pixel.className = "pixel";
    pixel.style.setProperty("--x", `${Math.round(Math.random() * 96 + 2)}%`);
    pixel.style.setProperty("--y", `${Math.round(Math.random() * 88 + 6)}%`);
    pixel.style.setProperty("--s", `${Math.round(Math.random() * 13 + 5)}px`);
    pixel.style.setProperty("--d", `${(Math.random() * 4.8).toFixed(2)}s`);
    pixel.style.setProperty("--c", palette[index % palette.length]);
    pixelStage.append(pixel);
  }
}
