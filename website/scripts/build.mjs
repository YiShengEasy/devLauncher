import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(join(root, "index.html"), join(dist, "index.html"));
cpSync(join(root, "src"), join(dist, "src"), { recursive: true });
cpSync(join(root, "public"), join(dist, "public"), { recursive: true });

console.log(`Built static website to ${dist}`);
