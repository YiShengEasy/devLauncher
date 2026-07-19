#!/usr/bin/env bash
set -euo pipefail

REPO="${DEVLAUNCHER_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO"

VERSION="$(node -p "require('./app/src-tauri/tauri.conf.json').version")"
TAG="v$VERSION"
DMG="$(find app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg -name '*.dmg' -type f -print -quit)"
test -n "$DMG"

ASSET_NAME="$(basename "$DMG")"
TEMP_ASSET_NAME="${ASSET_NAME%.dmg}.uploading.dmg"
DMG_SHA="$(shasum -a 256 "$DMG" | awk '{print $1}')"
DMG_SIZE="$(stat -f %z "$DMG")"
ORIGIN_URL="$(git remote get-url origin)"
case "$ORIGIN_URL" in
  https://github.com/*) REPO_SLUG="${ORIGIN_URL#https://github.com/}" ;;
  git@github.com:*) REPO_SLUG="${ORIGIN_URL#git@github.com:}" ;;
  *)
    echo "发布失败：origin 不是受支持的 GitHub 地址：$ORIGIN_URL" >&2
    exit 24
    ;;
esac
REPO_SLUG="${REPO_SLUG%.git}"

PROXY_URL="$(git config --get https.proxy || git config --get http.proxy || true)"
if [ -n "$PROXY_URL" ]; then
  CURL_PROXY_ARGS=(--proxy "$PROXY_URL")
  echo "GitHub 请求将使用 Git 已配置的代理。"
else
  CURL_PROXY_ARGS=()
fi

TOKEN="$(gh auth token)"
if [ -z "$TOKEN" ]; then
  echo "发布失败：无法从 GitHub CLI 读取 Token。" >&2
  exit 25
fi
trap 'unset TOKEN' EXIT

github_curl() {
  local max_seconds="$1"
  shift
  printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" | curl \
    --config - \
    --http1.1 \
    "${CURL_PROXY_ARGS[@]}" \
    --connect-timeout 20 \
    --max-time "$max_seconds" \
    --retry 3 \
    --retry-all-errors \
    --retry-delay 3 \
    --silent \
    --show-error \
    --header "Accept: application/vnd.github+json" \
    --header "X-GitHub-Api-Version: 2026-03-10" \
    "$@"
}

github_response() {
  local max_seconds="$1"
  local method="$2"
  local url="$3"
  shift 3
  github_curl "$max_seconds" \
    --request "$method" \
    --write-out $'\n%{http_code}' \
    "$@" \
    "$url"
}

github_upload() {
  local url="$1"
  local attempt="$2"
  local protocol_args=(--http2)
  if (( attempt % 2 == 0 )); then
    protocol_args=(--http1.1)
  fi
  printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" | curl \
    --config - \
    "${protocol_args[@]}" \
    "${CURL_PROXY_ARGS[@]}" \
    --connect-timeout 60 \
    --max-time 900 \
    --keepalive-time 20 \
    --fail-with-body \
    --silent \
    --show-error \
    --request POST \
    --header "Accept: application/vnd.github+json" \
    --header "X-GitHub-Api-Version: 2026-03-10" \
    --header "Content-Type: application/octet-stream" \
    --header "Expect:" \
    --data-binary "@$DMG" \
    --write-out $'\n__UPLOAD_META__ http=%{http_code} protocol=%{http_version} seconds=%{time_total}' \
    "$url"
}

response_status() {
  printf '%s' "${1##*$'\n'}"
}

response_body() {
  printf '%s' "${1%$'\n'*}"
}

json_field() {
  local field="$1"
  node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      const output = value?.[process.argv[1]];
      if (output !== undefined && output !== null) process.stdout.write(String(output));
    });
  ' "$field"
}

asset_field() {
  local name="$1"
  local field="$2"
  node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      const assets = JSON.parse(input);
      const asset = assets.find((item) => item.name === process.argv[1]);
      const output = asset?.[process.argv[2]];
      if (output !== undefined && output !== null) process.stdout.write(String(output));
    });
  ' "$name" "$field"
}

if [ "${1:-}" != "--probe-upload" ]; then
  LOCAL_SHA="$(git rev-parse HEAD)"
  PUSH_OK=false
  for attempt in 1 2 3; do
    echo "推送 main（第 $attempt/3 次，单次超时 60 秒）"
    if perl -e 'alarm shift; exec @ARGV' 60 git push origin main; then
      PUSH_OK=true
      break
    fi
    REMOTE_SHA="$(perl -e 'alarm shift; exec @ARGV' 30 git ls-remote origin refs/heads/main | awk '{print $1}')" || REMOTE_SHA=""
    if [ "$REMOTE_SHA" = "$LOCAL_SHA" ]; then
      echo "连接虽然中断，但远端 main 已更新到 $LOCAL_SHA"
      PUSH_OK=true
      break
    fi
    if [ "$attempt" -lt 3 ]; then
      sleep $((attempt * 5))
    fi
  done
  if [ "$PUSH_OK" != "true" ]; then
    echo "发布失败：重试 3 次后仍无法推送 main。" >&2
    exit 21
  fi
fi

RELEASE_URL="https://api.github.com/repos/$REPO_SLUG/releases/tags/$TAG"
RELEASE_RESPONSE="$(github_response 90 GET "$RELEASE_URL")"
RELEASE_STATUS="$(response_status "$RELEASE_RESPONSE")"
RELEASE_JSON="$(response_body "$RELEASE_RESPONSE")"

if [ "$RELEASE_STATUS" = "404" ] && [ "${1:-}" != "--probe-upload" ]; then
  CREATE_BODY="$(node -e '
    const tag = process.argv[1];
    process.stdout.write(JSON.stringify({
      tag_name: tag,
      target_commitish: "main",
      name: `DevLauncher ${tag}`,
      generate_release_notes: true
    }));
  ' "$TAG")"
  RELEASE_RESPONSE="$(github_response 90 POST \
    "https://api.github.com/repos/$REPO_SLUG/releases" \
    --header "Content-Type: application/json" \
    --data-binary "$CREATE_BODY")"
  RELEASE_STATUS="$(response_status "$RELEASE_RESPONSE")"
  RELEASE_JSON="$(response_body "$RELEASE_RESPONSE")"
fi

if [ "$RELEASE_STATUS" != "200" ] && [ "$RELEASE_STATUS" != "201" ]; then
  echo "发布失败：读取或创建 ${TAG} 返回 HTTP ${RELEASE_STATUS}。" >&2
  exit 26
fi

RELEASE_ID="$(printf '%s' "$RELEASE_JSON" | json_field id)"
if [ -z "$RELEASE_ID" ]; then
  echo "发布失败：GitHub 响应中缺少 Release ID。" >&2
  exit 28
fi

fetch_assets() {
  local response status
  response="$(github_response 90 GET \
    "https://api.github.com/repos/$REPO_SLUG/releases/$RELEASE_ID/assets")" || return 1
  status="$(response_status "$response")"
  [ "$status" = "200" ] || return 1
  response_body "$response"
}

read_asset_metadata() {
  local name="$1"
  ASSET_DIGEST="$(printf '%s' "$ASSETS_JSON" | asset_field "$name" digest)"
  ASSET_STATE="$(printf '%s' "$ASSETS_JSON" | asset_field "$name" state)"
  ASSET_SIZE="$(printf '%s' "$ASSETS_JSON" | asset_field "$name" size)"
  ASSET_ID="$(printf '%s' "$ASSETS_JSON" | asset_field "$name" id)"
}

asset_matches_local() {
  [ "$ASSET_STATE" = "uploaded" ] && {
    [ "$ASSET_DIGEST" = "sha256:$DMG_SHA" ] || {
      [ -z "$ASSET_DIGEST" ] && [ "$ASSET_SIZE" = "$DMG_SIZE" ]
    }
  }
}

delete_asset() {
  local id="$1"
  [ -n "$id" ] || return 0
  local response status
  response="$(github_response 90 DELETE \
    "https://api.github.com/repos/$REPO_SLUG/releases/assets/$id")"
  status="$(response_status "$response")"
  [ "$status" = "204" ]
}

upload_verified_temp_asset() {
  local temp_name="$1"
  local max_attempts="$2"
  local attempt upload_response upload_status wait_seconds

  for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
    ASSETS_JSON="$(fetch_assets)" || ASSETS_JSON="[]"
    read_asset_metadata "$temp_name"
    if asset_matches_local; then
      echo "已发现校验通过的临时资产，继续发布。"
      return 0
    fi
    if [ -n "$ASSET_ID" ]; then
      delete_asset "$ASSET_ID" || true
    fi

    echo "上传临时资产 ${temp_name}（第 ${attempt}/${max_attempts} 次，单次最长 900 秒）"
    set +e
    upload_response="$(github_upload \
      "https://uploads.github.com/repos/$REPO_SLUG/releases/$RELEASE_ID/assets?name=$temp_name" \
      "$attempt")"
    upload_status=$?
    set -e
    if [ -n "$upload_response" ]; then
      echo "${upload_response##*$'\n'}"
    fi
    if [ "$upload_status" != "0" ]; then
      echo "上传请求中断（curl 状态 ${upload_status}），正在查询 GitHub 最终状态。" >&2
    fi

    ASSETS_JSON="$(fetch_assets)" || ASSETS_JSON="[]"
    read_asset_metadata "$temp_name"
    if asset_matches_local; then
      echo "临时 DMG 校验通过：sha256:$DMG_SHA"
      return 0
    fi
    if [ -n "$ASSET_ID" ]; then
      delete_asset "$ASSET_ID" || true
    fi
    if [ "$attempt" -lt "$max_attempts" ]; then
      wait_seconds=$((attempt * 8))
      echo "远端没有完整资产，${wait_seconds} 秒后重试。"
      sleep "$wait_seconds"
    fi
  done
  return 1
}

ASSETS_JSON="$(fetch_assets)"
if [ "${1:-}" = "--probe-upload" ]; then
  PROBE_NAME="${ASSET_NAME%.dmg}.probe-$(date +%s).dmg"
  if ! upload_verified_temp_asset "$PROBE_NAME" 4; then
    echo "上传探针失败：重试后仍未得到完整资产。" >&2
    exit 22
  fi
  ASSETS_JSON="$(fetch_assets)"
  read_asset_metadata "$PROBE_NAME"
  delete_asset "$ASSET_ID"
  echo "GitHub 上传探针通过并已清理：$PROBE_NAME"
  exit 0
fi

read_asset_metadata "$ASSET_NAME"
if asset_matches_local; then
  echo "Release 已包含相同 DMG，跳过重复上传。"
else
  if ! upload_verified_temp_asset "$TEMP_ASSET_NAME" 4; then
    echo "发布失败：重试后临时 DMG 的状态、大小或摘要仍不匹配。" >&2
    exit 22
  fi

  ASSETS_JSON="$(fetch_assets)"
  read_asset_metadata "$TEMP_ASSET_NAME"
  TEMP_ID="$ASSET_ID"
  read_asset_metadata "$ASSET_NAME"
  if [ -n "$ASSET_ID" ]; then
    delete_asset "$ASSET_ID"
  fi

  RENAME_BODY="$(node -e '
    process.stdout.write(JSON.stringify({ name: process.argv[1] }));
  ' "$ASSET_NAME")"
  RENAME_RESPONSE="$(github_response 90 PATCH \
    "https://api.github.com/repos/$REPO_SLUG/releases/assets/$TEMP_ID" \
    --header "Content-Type: application/json" \
    --data-binary "$RENAME_BODY")"
  RENAME_STATUS="$(response_status "$RENAME_RESPONSE")"
  if [ "$RENAME_STATUS" != "200" ]; then
    echo "发布失败：临时资产改名返回 HTTP ${RENAME_STATUS}。" >&2
    exit 23
  fi

  ASSETS_JSON="$(fetch_assets)"
  read_asset_metadata "$ASSET_NAME"
  if ! asset_matches_local; then
    echo "发布失败：正式 DMG 的最终摘要不匹配。" >&2
    exit 22
  fi
fi

echo "GitHub 发布完成：$TAG / $ASSET_NAME / sha256:$DMG_SHA"
