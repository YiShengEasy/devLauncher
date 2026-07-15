#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$APP_DIR/.." && pwd)"

export RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$HOME/.cargo=/cargo --remap-path-prefix=$HOME/.rustup=/rustup --remap-path-prefix=$APP_DIR=/workspace/app --remap-path-prefix=$REPO_DIR=/workspace"

cd "$APP_DIR"
npm run tauri -- build --target aarch64-apple-darwin --bundles dmg
