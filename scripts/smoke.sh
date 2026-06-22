#!/usr/bin/env bash
# API スモークテスト: 全 CRUD を叩いて期待ステータスを検証する。
# 用途: デプロイ直後の動作確認 / 修正後の「復旧確認」。アラームが OK に戻る根拠になる。
#
# 使い方:
#   API_URL=https://xxxx.execute-api.ap-northeast-1.amazonaws.com scripts/smoke.sh
#   または: scripts/smoke.sh https://xxxx.execute-api.ap-northeast-1.amazonaws.com
set -euo pipefail

API_URL="${1:-${API_URL:-}}"
if [[ -z "${API_URL}" ]]; then
  echo "ERROR: API_URL を指定してください（引数 or 環境変数）" >&2
  exit 2
fi
API_URL="${API_URL%/}"

fail=0
# $1=期待コード $2=実コード $3=ラベル
assert_status() {
  if [[ "$2" == "$1" ]]; then
    echo "  ok   $3 -> $2"
  else
    echo "  FAIL $3 -> $2 (expected $1)" >&2
    fail=1
  fi
}

# $1=METHOD $2=PATH $3=BODY(optional) ; stdout=body, returns code via global LAST_CODE
LAST_CODE=""
LAST_BODY=""
call() {
  local method="$1" path="$2" body="${3:-}"
  local out
  if [[ -n "${body}" ]]; then
    out=$(curl -sS -o /tmp/smoke_body -w '%{http_code}' -X "${method}" "${API_URL}${path}" \
      -H 'content-type: application/json' -d "${body}")
  else
    out=$(curl -sS -o /tmp/smoke_body -w '%{http_code}' -X "${method}" "${API_URL}${path}")
  fi
  LAST_CODE="${out}"
  LAST_BODY="$(cat /tmp/smoke_body)"
}

echo "smoke test against ${API_URL}"

call POST /todos '{"title":"smoke-test"}'
assert_status 201 "${LAST_CODE}" "POST /todos"
ID="$(printf '%s' "${LAST_BODY}" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
echo "  created id=${ID}"

call GET /todos
assert_status 200 "${LAST_CODE}" "GET /todos"

call GET "/todos/${ID}"
assert_status 200 "${LAST_CODE}" "GET /todos/{id}"

call PUT "/todos/${ID}" '{"completed":true}'
assert_status 200 "${LAST_CODE}" "PUT /todos/{id}"

call DELETE "/todos/${ID}"
assert_status 200 "${LAST_CODE}" "DELETE /todos/{id}"

call GET "/todos/${ID}"
assert_status 404 "${LAST_CODE}" "GET deleted -> 404"

if [[ "${fail}" -ne 0 ]]; then
  echo "SMOKE FAILED" >&2
  exit 1
fi
echo "SMOKE OK"
