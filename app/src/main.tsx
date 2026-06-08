import ReactDOM from "react-dom/client";
import App from "./App";
import { ClipboardApp } from "./ClipboardApp";
import { JsonHelperApp } from "./JsonHelperApp";
import { TotpApp } from "./TotpApp";
import { RemoteDeskApp } from "./RemoteDeskApp";
import "./index.css";

// Route based on URL param: ?view=clipboard → standalone clipboard window
const params = new URLSearchParams(window.location.search);
const view = params.get("view");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  view === "clipboard" ? <ClipboardApp /> :
  view === "json-helper" ? <JsonHelperApp /> :
  view === "totp" ? <TotpApp /> :
  view === "remotedesk" ? <RemoteDeskApp /> :
  <App />
);
