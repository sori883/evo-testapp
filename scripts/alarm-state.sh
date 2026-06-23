#!/usr/bin/env bash
# 対象 CloudWatch アラームの現在状態を表示する（ALARM / OK / INSUFFICIENT_DATA）。
# 障害注入後の「発報確認」、修正後の「復旧確認」の両方に使う。
#
# 使い方:
#   scripts/alarm-state.sh                 # 既定リージョン ap-northeast-1
#   REGION=ap-northeast-1 scripts/alarm-state.sh
#   watch -n 15 scripts/alarm-state.sh     # 継続監視
set -euo pipefail

REGION="${REGION:-ap-northeast-1}"
ALARMS=(
  sampleapp-lambda-errors
  sampleapp-lambda-throttles
  sampleapp-api-5xx
  sampleapp-api-latency-p99
)

aws cloudwatch describe-alarms \
  --region "${REGION}" \
  --alarm-names "${ALARMS[@]}" \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Updated:StateUpdatedTimestamp}' \
  --output table
