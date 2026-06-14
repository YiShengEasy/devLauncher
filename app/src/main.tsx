import ReactDOM from "react-dom/client";
import { Suspense } from "react";
import App from "./App";
import { BUILTIN_REGISTRY } from "./builtins/_registry";
import { SearchEntryApp } from "./entry/SearchEntryApp";
import { PetEntryApp } from "./entry/PetEntryApp";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const entry = params.get("entry");
const view = params.get("view");
const plugin = view ? BUILTIN_REGISTRY.find((item) => item.manifest.id === view) : null;

function RoutedApp() {
  if (entry === "search") return <SearchEntryApp />;
  if (entry === "pet") return <PetEntryApp />;

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
