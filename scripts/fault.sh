#!/usr/bin/env bash
# デプロイ済み Lambda の FAULT_* 環境変数を「安全に」切り替える（Mode B トリガ / 検証用の一時操作）。
# 注意: aws lambda update-function-configuration の --environment は Variables マップを全置換する。
#       本スクリプトは現在の env を取得 → マージして書き戻すため、TABLE_NAME 等を失わない。
#
# 使い方:
#   scripts/fault.sh show                       # 現在の FAULT_* を表示
#   scripts/fault.sh set FAULT_ERROR_RATE=1     # 1 つ ON にする
#   scripts/fault.sh set FAULT_NULL_DEREF=true
#   scripts/fault.sh clear FAULT_ERROR_RATE     # 1 つを安全既定へ戻す
#   scripts/fault.sh reset                      # すべての FAULT_* を安全既定へ戻す
#
# 恒久的な変更は CDK（infra/lib/evo-testapp-stack.ts の environment）で行い PR 経由でデプロイすること。
# このスクリプトはあくまで検証時の一時操作。
set -euo pipefail

FUNCTION_NAME="${FUNCTION_NAME:-sampleapp-api}"
REGION="${REGION:-ap-northeast-1}"
CMD="${1:-show}"

get_env() {
  aws lambda get-function-configuration \
    --function-name "${FUNCTION_NAME}" --region "${REGION}" \
    --query 'Environment.Variables' --output json
}

apply_env() {
  # $1 = 完全な Variables JSON
  aws lambda update-function-configuration \
    --function-name "${FUNCTION_NAME}" --region "${REGION}" \
    --environment "{\"Variables\": $1}" \
    --query 'LastUpdateStatus' --output text >/dev/null
  echo "updated ${FUNCTION_NAME} (${REGION})"
}

SAFE_DEFAULTS='{"FAULT_NULL_DEREF":"false","FAULT_LATENCY_MS":"0","FAULT_ERROR_RATE":"0","FAULT_DYNAMO_FAIL":"false"}'

case "${CMD}" in
  show)
    get_env | python3 -c 'import sys,json; v=json.load(sys.stdin) or {}; [print(f"{k}={v[k]}") for k in v if k.startswith("FAULT_")] or print("(FAULT_* 未設定)")'
    ;;
  set)
    KV="${2:?KEY=VALUE を指定してください}"
    KEY="${KV%%=*}"; VAL="${KV#*=}"
    [[ "${KEY}" == FAULT_* ]] || { echo "ERROR: FAULT_* 以外は操作しません: ${KEY}" >&2; exit 2; }
    merged=$(get_env | python3 -c "import sys,json; v=json.load(sys.stdin) or {}; v['${KEY}']='${VAL}'; print(json.dumps(v))")
    apply_env "${merged}"
    echo "set ${KEY}=${VAL}"
    ;;
  clear)
    KEY="${2:?FAULT_KEY を指定してください}"
    merged=$(get_env | python3 -c "import sys,json; d=json.loads('${SAFE_DEFAULTS}'); v=json.load(sys.stdin) or {}; v['${KEY}']=d.get('${KEY}','false'); print(json.dumps(v))")
    apply_env "${merged}"
    echo "cleared ${KEY}"
    ;;
  reset)
    merged=$(get_env | python3 -c "import sys,json; d=json.loads('${SAFE_DEFAULTS}'); v=json.load(sys.stdin) or {}; v.update(d); print(json.dumps(v))")
    apply_env "${merged}"
    echo "reset すべての FAULT_* を安全既定へ戻しました"
    ;;
  *)
    echo "usage: scripts/fault.sh {show|set KEY=VALUE|clear KEY|reset}" >&2
    exit 2
    ;;
esac
