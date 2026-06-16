#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_DIR="$APP_ROOT/src-tauri"
BIN="$TAURI_DIR/target/debug/app"
IDENTIFIER="${DEVLAUNCHER_DEV_IDENTIFIER:-com.yisheng.devlauncher.dev}"
VITE_URL="${DEVLAUNCHER_DEV_URL:-http://localhost:1420}"
VITE_LOG="$TAURI_DIR/target/devlauncher-vite.log"
VITE_PID=""

cleanup() {
  if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "$APP_ROOT"

if curl -fsS "$VITE_URL" >/dev/null 2>&1; then
  echo "Vite is already running at $VITE_URL"
else
  mkdir -p "$TAURI_DIR/target"
  echo "Starting Vite at $VITE_URL ..."
  npm run dev -- --host localhost >"$VITE_LOG" 2>&1 &
  VITE_PID="$!"

  for _ in {1..80}; do
    if curl -fsS "$VITE_URL" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$VITE_PID" 2>/dev/null; then
      echo "Vite failed to start. Log:"
      sed -n '1,160p' "$VITE_LOG" || true
      exit 1
    fi
    sleep 0.25
  done

  if ! curl -fsS "$VITE_URL" >/dev/null 2>&1; then
    echo "Timed out waiting for Vite at $VITE_URL. Log:"
    sed -n '1,160p' "$VITE_LOG" || true
    exit 1
  fi
fi

echo "Building Tauri debug binary ..."
cargo build --manifest-path "$TAURI_DIR/Cargo.toml"

echo "Signing $BIN with identifier $IDENTIFIER ..."
codesign --force --deep --sign - --identifier "$IDENTIFIER" "$BIN"
codesign -dv "$BIN" 2>&1 | sed -n '1,12p'

cat <<EOF

If macOS still cannot see other apps in screenshots, grant Screen Recording to:
  $BIN

The stable development identifier is:
  $IDENTIFIER

EOF

"$BIN"
