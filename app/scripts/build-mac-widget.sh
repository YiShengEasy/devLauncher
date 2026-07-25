#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "Skipping macOS WidgetKit extension on non-macOS host."
  exit 0
fi

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_ROOT/.." && pwd)"
PROJECT="$REPO_ROOT/native/DevLauncherWidget/DevLauncherWidget/DevLauncherWidget.xcodeproj"
DERIVED_DATA="$APP_ROOT/src-tauri/target/widget-derived"

if [[ ! -d "$PROJECT" ]]; then
  echo "Widget project not found: $PROJECT" >&2
  exit 1
fi

echo "Building DevLauncher WidgetKit extension..."
xcodebuild \
  -project "$PROJECT" \
  -scheme DevLauncherWidget \
  -configuration Release \
  -sdk macosx \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  build

WIDGET="$DERIVED_DATA/Build/Products/Release/DevLauncherWidget.appex"
RELOADER_SOURCE="$REPO_ROOT/native/DevLauncherWidget/WidgetReloader.swift"
RELOADER="$DERIVED_DATA/DevLauncherWidgetReloader"
if [[ ! -d "$WIDGET" ]]; then
  echo "Widget build completed without an appex: $WIDGET" >&2
  exit 1
fi

echo "Building WidgetKit refresh helper..."
xcrun swiftc \
  "$RELOADER_SOURCE" \
  -framework WidgetKit \
  -module-cache-path "$DERIVED_DATA/ModuleCache.noindex" \
  -o "$RELOADER"

echo "Widget extension ready: $WIDGET"
echo "Widget refresh helper ready: $RELOADER"
