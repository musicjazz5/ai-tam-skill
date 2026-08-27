#!/usr/bin/env bash
# ai-tam market-scan API 薄包裝。
#   ./ai-tam.sh                       → 端點目錄
#   ./ai-tam.sh health
#   ./ai-tam.sh themes/aiGrowth fields=symbol,change_pct limit=3
#   ./ai-tam.sh movers direction=up limit=10
#   ./ai-tam.sh datasets/stock_metrics shape=1
set -euo pipefail

BASE="${AI_TAM_BASE:-https://www.ai-tam.org/market-scan/api/v1}"
path="${1:-}"
[ $# -gt 0 ] && shift

query=""
for kv in "$@"; do
  query="${query:+$query&}$kv"
done

# 不留尾斜線：/api/v1/ 會 308 轉址到 /api/v1
path="${path#/}"
url="$BASE${path:+/$path}"
[ -n "$query" ] && url="$url?$query"

if command -v jq >/dev/null 2>&1; then
  curl -fsSL --max-time 30 "$url" | jq .
else
  curl -fsSL --max-time 30 "$url"
  echo
fi
