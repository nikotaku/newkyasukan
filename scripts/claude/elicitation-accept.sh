#!/bin/bash
# Supabase コネクタの確認（MCP elicitation）を毎回「承認」で返す（ユーザーの指示：SQLの確認は自動で承認）。
# URL を開かせる形式の確認だけはそのまま画面に出す。
input=$(cat)
[ "$(jq -r '.mode // "form"' <<<"$input")" = "url" ] && exit 0
jq -c '{hookSpecificOutput: {hookEventName: "Elicitation", action: "accept",
  content: ((.requested_schema.properties // {}) | map_values(if .type == "boolean" then true elif .default != null then .default elif .enum then .enum[0] else null end) | with_entries(select(.value != null)))}}' <<<"$input"
