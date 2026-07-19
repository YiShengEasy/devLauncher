import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
const productManual = resolve(root, "..", "docs", "DevLauncher产品说明书-v0.2.0.docx");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(join(root, "index.html"), join(dist, "index.html"));
cpSync(join(root, "src"), join(dist, "src"), { recursive: true });
cpSync(join(root, "public"), join(dist, "public"), { recursive: true });
mkdirSync(join(dist, "docs"), { recursive: true });
cpSync(productManual, join(dist, "docs", "DevLauncher产品说明书-v0.2.0.docx"));
writeFileSync(join(dist, ".nojekyll"), "");

console.log(`Built static website to ${dist}`);
