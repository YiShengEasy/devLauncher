import ReactDOM from "react-dom/client";
import { Suspense } from "react";
import App from "./App";
import { BUILTIN_REGISTRY } from "./builtins/_registry";
import { SearchEntryApp } from "./entry/SearchEntryApp";
import { PetEntryApp } from "./entry/PetEntryApp";
import { BrowserPreviewApp } from "./entry/BrowserPreviewApp";
import { UiAuditPreviewApp } from "./entry/UiAuditPreviewApp";
import { WorkflowPreviewApp } from "./entry/WorkflowPreviewApp";
import { PluginHostApp } from "./plugins/PluginHostApp";
import { PinnedScreenshotApp } from "./builtins/screenshot/PinnedScreenshotApp";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const entry = params.get("entry");
const view = params.get("view");
const preview = params.get("preview");
const plugin = view ? BUILTIN_REGISTRY.find((item) => item.manifest.id === view) : null;
const isTauriRuntime = Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

function RoutedApp() {
  if (preview === "ui-audit") return <UiAuditPreviewApp />;
  if (preview === "workflow") return <WorkflowPreviewApp />;
  if (preview === "pet-motion" || (!isTauriRuntime && !entry && !view)) return <BrowserPreviewApp />;
  if (entry === "search") return <SearchEntryApp />;
  if (entry === "pet") return <PetEntryApp />;
  if (entry === "plugin-host") return <PluginHostApp />;
  if (entry === "screenshot-pin") return <PinnedScreenshotApp />;

  if (plugin) {
    return (
      <Suspense fallback={null}>
        <plugin.App />
      </Suspense>
    );
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<RoutedApp />);
