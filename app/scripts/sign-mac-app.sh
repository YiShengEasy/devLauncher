#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "Skipping macOS signing on non-macOS host."
  exit 0
fi

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${1:-$APP_ROOT/src-tauri/target/release/bundle/macos/DevLauncher.app}"
IDENTITY="${DEVLAUNCHER_SIGNING_IDENTITY:--}"
WIDGET_PATH="$APP_PATH/Contents/PlugIns/DevLauncherWidget.appex"
RELOADER_PATH="$APP_PATH/Contents/MacOS/DevLauncherWidgetReloader"
WIDGET_ENTITLEMENTS="$APP_ROOT/../native/DevLauncherWidget/DevLauncherWidget/DevLauncherWidget.entitlements"
APP_ENTITLEMENTS="$APP_ROOT/src-tauri/DevLauncher.entitlements"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  echo "Build it first with: npm run tauri build -- --bundles app" >&2
  exit 1
fi

echo "Signing $APP_PATH with identity: $IDENTITY"

if [[ -f "$APP_PATH/Contents/MacOS/devlauncher_native_host" ]]; then
  codesign --force --sign "$IDENTITY" "$APP_PATH/Contents/MacOS/devlauncher_native_host"
fi

if [[ -f "$RELOADER_PATH" ]]; then
  codesign --force --sign "$IDENTITY" "$RELOADER_PATH"
fi

if [[ -d "$WIDGET_PATH" ]]; then
  codesign --force --sign "$IDENTITY" --entitlements "$WIDGET_ENTITLEMENTS" "$WIDGET_PATH"
fi

codesign --force --sign "$IDENTITY" --entitlements "$APP_ENTITLEMENTS" "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"
echo "Signed app is ready: $APP_PATH"
