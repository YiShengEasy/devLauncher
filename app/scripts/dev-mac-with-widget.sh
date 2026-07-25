#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "dev:mac:widget only supports macOS." >&2
  exit 1
fi

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILT_APP="$APP_ROOT/src-tauri/target/release/bundle/macos/DevLauncher.app"
DEBUG_BINARY="$APP_ROOT/src-tauri/target/debug/app"
INSTALLED_APP="${DEVLAUNCHER_WIDGET_HOST_APP:-/Applications/DevLauncher.app}"
WIDGET_NAME="DevLauncherWidget.appex"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
VITE_PID=""

terminate_tree() {
  local pid="$1"
  local child
  while read -r child; do
    [[ -n "$child" ]] && terminate_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  if [[ -n "$VITE_PID" ]]; then
    terminate_tree "$VITE_PID"
    wait "$VITE_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

running_app_pids="$(lsof -t "$INSTALLED_APP/Contents/MacOS/app" 2>/dev/null || true)"
if [[ -n "$running_app_pids" ]]; then
  echo "Restarting the existing DevLauncher Widget development app..."
  while read -r pid; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done <<< "$running_app_pids"
fi

for _ in {1..20}; do
  port_pid="$(lsof -tiTCP:1420 -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  [[ -z "$port_pid" ]] && break

  port_cwd="$(lsof -a -p "$port_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
  if [[ "$port_cwd" == "$APP_ROOT" || "$port_cwd" == "$APP_ROOT/"* ]]; then
    kill "$port_pid" 2>/dev/null || true
  else
    echo "Port 1420 is used by another application (PID $port_pid)." >&2
    exit 1
  fi
  sleep 0.25
done

if lsof -tiTCP:1420 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 1420 did not become available after stopping the previous DevLauncher session." >&2
  exit 1
fi

if lsof "$DEBUG_BINARY" >/dev/null 2>&1; then
  echo "An existing Tauri development process is still running." >&2
  echo "Stop the previous dev:mac:widget process with Ctrl+C, then run this command again." >&2
  exit 1
fi

echo "[1/6] Building the app bundle and WidgetKit extension..."
(
  cd "$APP_ROOT"
  npm run tauri build -- --bundles app
)

if [[ ! -w "$(dirname "$INSTALLED_APP")" ]]; then
  echo "Cannot install the Widget host into: $INSTALLED_APP" >&2
  echo "Run this script from an administrator account." >&2
  exit 1
fi

echo "[2/6] Installing the Widget host into /Applications..."
ditto "$BUILT_APP" "$INSTALLED_APP"

echo "[3/6] Starting the Vite development server..."
(
  cd "$APP_ROOT"
  npm run dev
) &
VITE_PID=$!

vite_ready=false
for _ in {1..50}; do
  if curl --noproxy '*' -g -fsS 'http://[::1]:1420/' >/dev/null 2>&1 \
    || curl --noproxy '*' -fsS 'http://127.0.0.1:1420/' >/dev/null 2>&1; then
    vite_ready=true
    break
  fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

if [[ "$vite_ready" != true ]]; then
  echo "Vite failed to become ready on port 1420." >&2
  exit 1
fi

echo "[4/6] Building the debug executable..."
(
  cd "$APP_ROOT/src-tauri"
  cargo build --bin app
)

echo "[5/6] Embedding, signing, and registering the debug app..."
ditto "$DEBUG_BINARY" "$INSTALLED_APP/Contents/MacOS/app"
(
  cd "$APP_ROOT"
  npm run sign:mac:app -- "$INSTALLED_APP"
)
"$LSREGISTER" -f "$INSTALLED_APP"
pluginkit -a "$INSTALLED_APP/Contents/PlugIns/$WIDGET_NAME"

echo "[6/6] Launching the installed debug app..."
echo "Frontend hot reload is active. The Widget is managed by macOS."
open -W "$INSTALLED_APP"
