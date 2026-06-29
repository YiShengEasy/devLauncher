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

for (const id of ["requestName", "method", "url", "send", "cancel", "envSelect", "resolvedUrl", "sidePanel", "requestPanel", "responsePanel"]) {
  assert(html.includes(`id="${id}"`), `missing #${id}`);
}

for (const token of [
  "localStorage",
  "fetch(",
  "AbortController",
  "buildRequest",
  "resolveVariables",
  "resolvedPreview",
  "authHeader",
  "Bearer Token",
  "Basic Auth",
  "copyText",
  "copy-body",
  "copy-headers",
  "loadExampleRequest",
  "exportData",
  "importData",
  "saveDraftToCollection"
]) {
  assert(html.includes(token), `missing ${token}`);
}

console.log(`API Lab smoke test passed at ${path.basename(new URL(".", root).pathname)}`);
