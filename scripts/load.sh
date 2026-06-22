#!/usr/bin/env bash
# 負荷生成: API にリクエストを連続で流し、Lambda 起動を稼がせてアラームを誘発する。
# フォルトを ON にした状態でこれを流すと Errors / 5xx が増え、アラームが ALARM へ遷移する。
#
# 使い方:
#   API_URL=https://xxxx scripts/load.sh                # 既定 100 回 POST /todos
#   scripts/load.sh https://xxxx 300                    # 回数指定
#   COUNT=300 METHOD=GET TARGET=/todos scripts/load.sh https://xxxx
set -euo pipefail

API_URL="${1:-${API_URL:-}}"
COUNT="${2:-${COUNT:-100}}"
METHOD="${METHOD:-POST}"
TARGET="${TARGET:-/todos}"
BODY="${BODY:-{\"title\":\"load\"}}"

if [[ -z "${API_URL}" ]]; then
  echo "ERROR: API_URL を指定してください（引数 or 環境変数）" >&2
  exit 2
fi
API_URL="${API_URL%/}"

echo "load: ${METHOD} ${API_URL}${TARGET} x${COUNT}"
declare -A codes
for ((i = 1; i <= COUNT; i++)); do
  if [[ "${METHOD}" == "GET" || "${METHOD}" == "DELETE" ]]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -X "${METHOD}" "${API_URL}${TARGET}")
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' -X "${METHOD}" "${API_URL}${TARGET}" \
      -H 'content-type: application/json' -d "${BODY}")
  fi
  codes["${code}"]=$(( ${codes["${code}"]:-0} + 1 ))
  printf '\r  sent %d/%d' "${i}" "${COUNT}"
done
printf '\n'

echo "status code 内訳:"
for code in "${!codes[@]}"; do
  echo "  ${code}: ${codes[${code}]}"
done
echo "完了。1〜2 分後に scripts/alarm-state.sh でアラーム状態を確認してください。"
