#!/usr/bin/env bash
# Claude（クラウドの作業環境）が使うブラウザ操作エージェント jev-ultrafast の準備と実行。
#   scripts/claude/jev.sh setup                     … 取得・インストール・Chromium起動（何度実行してもよい）
#   scripts/claude/jev.sh check                     … AIを呼ばない動作確認（料金なし）
#   scripts/claude/jev.sh run --url URL --goal 目的 … 実行（TypeSafe と OpenRouter の料金がかかる）
#   scripts/claude/jev.sh stop                      … Chromium を止める
# APIキーは環境変数 TYPESAFE_API_KEY / TEXT_MODEL_API_KEY（クラウド環境の設定で入れる。リポジトリに書かない）。
set -euo pipefail

JEV_REPO="https://github.com/browser-use/jev-ultrafast"
JEV_REF="1231850a0bf1a0c0341fe408ef1668dbbfdfac46" # 動作確認した版に固定
JEV_DIR="${JEV_DIR:-$HOME/.cache/jev-ultrafast}"
CDP_PORT="${JEV_CDP_PORT:-9222}"
PROFILE_DIR="${JEV_PROFILE_DIR:-$HOME/.cache/jev-chrome-profile}"
PROXY_CA="/root/.ccr/agent-proxy-ca.crt"
export BU_CDP_URL="http://127.0.0.1:${CDP_PORT}"

log() { echo "[jev] $*" >&2; }

cdp_ready() { curl -s --noproxy '*' --max-time 2 "$BU_CDP_URL/json/version" >/dev/null 2>&1; }

install_jev() {
  command -v uv >/dev/null || { log "uv がありません（https://docs.astral.sh/uv/）"; exit 1; }
  if [ ! -d "$JEV_DIR/.git" ]; then
    mkdir -p "$(dirname "$JEV_DIR")"
    git clone -q "$JEV_REPO" "$JEV_DIR"
  fi
  if [ "$(git -C "$JEV_DIR" rev-parse HEAD)" != "$JEV_REF" ]; then
    git -C "$JEV_DIR" fetch -q origin
    git -C "$JEV_DIR" checkout -q "$JEV_REF"
  fi
  (cd "$JEV_DIR" && uv sync -q)
}

# クラウドの作業環境は通信をプロキシで検査していて、Chromium はそのCAを NSS から読む。
# 入っていなければ信頼済みとして追加する（TLSの検証は切らない）
trust_proxy_ca() {
  [ -f "$PROXY_CA" ] || return 0
  if ! command -v certutil >/dev/null; then
    apt-get install -y -q libnss3-tools >/dev/null 2>&1 || { apt-get update -q >/dev/null 2>&1 && apt-get install -y -q libnss3-tools >/dev/null 2>&1; }
  fi
  mkdir -p "$HOME/.pki/nssdb"
  [ -f "$HOME/.pki/nssdb/cert9.db" ] || certutil -N --empty-password -d "sql:$HOME/.pki/nssdb"
  certutil -L -n ccr-agent-proxy -d "sql:$HOME/.pki/nssdb" >/dev/null 2>&1 \
    || certutil -A -n ccr-agent-proxy -t "C,," -i "$PROXY_CA" -d "sql:$HOME/.pki/nssdb"
}

chromium_bin() {
  local bin
  bin=$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1 || true)
  [ -n "$bin" ] || bin=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)
  [ -n "$bin" ] || { log "Chromium が見つかりません"; exit 1; }
  echo "$bin"
}

start_chromium() {
  cdp_ready && return 0
  mkdir -p "$PROFILE_DIR"
  setsid "$(chromium_bin)" --headless=new --no-sandbox --remote-debugging-port="$CDP_PORT" \
    --user-data-dir="$PROFILE_DIR" --window-size=1280,900 about:blank >"$PROFILE_DIR/chrome.log" 2>&1 < /dev/null &
  for _ in $(seq 1 40); do cdp_ready && return 0; sleep 0.25; done
  log "Chromium が起動しませんでした（$PROFILE_DIR/chrome.log）"; exit 1
}

setup() {
  install_jev
  trust_proxy_ca
  start_chromium
  log "準備できました（Chromium: $BU_CDP_URL）"
}

case "${1:-}" in
  setup) setup ;;
  check)
    setup
    cd "$JEV_DIR" && uv run python scripts/check_guards.py
    ;;
  run)
    shift
    : "${TYPESAFE_API_KEY:?TYPESAFE_API_KEY が設定されていません（クラウド環境の設定で環境変数に入れる）}"
    : "${TEXT_MODEL_API_KEY:?TEXT_MODEL_API_KEY が設定されていません（OpenRouter のキー）}"
    export TYPESAFE_MODEL="${TYPESAFE_MODEL:-jev-latest}"
    export TEXT_MODEL_BASE_URL="${TEXT_MODEL_BASE_URL:-https://openrouter.ai/api/v1}"
    export TEXT_MODEL="${TEXT_MODEL:-inception/mercury-2.5}"
    export TEXT_MODEL_REASONING="${TEXT_MODEL_REASONING:-none}"
    setup
    cd "$JEV_DIR" && uv run python examples/run.py "$@"
    ;;
  stop)
    pid=$(pgrep -f -- "--remote-debugging-port=${CDP_PORT}" | head -1 || true)
    [ -n "$pid" ] && kill "$pid" && log "Chromium を止めました"
    ;;
  *)
    sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
