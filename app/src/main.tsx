import ReactDOM from "react-dom/client";
import App from "./App";
import { BUILTIN_REGISTRY } from "./builtins/_registry";
import "./index.css";

// Route based on URL param: ?view=<id> → find plugin in registry
const params = new URLSearchParams(window.location.search);
const view = params.get("view");
const plugin = view ? BUILTIN_REGISTRY.find(p => p.manifest.id === view) : null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  plugin ? <plugin.App /> : <App />
);
