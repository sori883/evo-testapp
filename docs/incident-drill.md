# インシデント・ドリル runbook（壊す → 検知 → 修正 PR → マージ → CD → 復旧）

evo の「障害検知 → 診断 → 修正 PR」ループを、この対象アプリで意図的に再現・検証するための手順書です。
evo は **PR 作成までで停止**します。人間が PR をレビュー/マージ → **CD（`.github/workflows/cd.yml`）が
`main` への push で再デプロイ** → 復旧、という流れになります。

```
 [壊す]            [検知]                 [診断/修正]          [人]         [CD]          [確認]
 fault 注入  →  CloudWatch ALARM  →  evo が PR 作成  →  PR マージ  →  cdk deploy  →  アラーム OK
 (コード or CDK)   (EventBridge)        (止まる)         (人の承認)    (main push)   (smoke.sh)
```

## 前提

- スタックがデプロイ済み（`pnpm deploy`）。出力の `ApiUrl` を控える。
- evo 側が本リポジトリを `GITHUB_REPO` に、`evo-target:true` を監視対象に設定済み。
- ローカルに AWS 認証情報（read 用途 + 検証時の一時操作）。

便利スクリプト（`scripts/`）:

| スクリプト | 役割 |
|------------|------|
| `smoke.sh <ApiUrl>` | 全 CRUD を検証（正常性 / 復旧確認） |
| `load.sh <ApiUrl> [回数]` | リクエストを流してアラームを誘発 |
| `alarm-state.sh` | 対象アラームの ALARM/OK 状態を表示 |
| `fault.sh {show\|set\|clear\|reset}` | デプロイ済み Lambda の `FAULT_*` を安全に切替（Mode B の一時トリガ） |

---

## 共通フロー

1. **平常確認**: `scripts/smoke.sh <ApiUrl>` が `SMOKE OK`、`scripts/alarm-state.sh` が全 `OK`。
2. **壊す**: シナリオ（下記）に従って障害を注入する。
3. **発報**: `scripts/load.sh <ApiUrl> 200` でトラフィックを与え、数分後 `scripts/alarm-state.sh` で
   対象アラームが `ALARM` になることを確認 → ここで evo が起動し、診断して**修正 PR を作成**する。
4. **修正 PR を確認・マージ**: evo の PR をレビュー。問題なければ `main` にマージ。
5. **再デプロイ**: `main` への push で CD が走り `cdk deploy`（Mode A はコード、Mode B は構成を反映）。
6. **復旧確認**: `scripts/smoke.sh <ApiUrl>` が `SMOKE OK`、`scripts/alarm-state.sh` が `OK` に戻る。

> 検証を中断・巻き戻すには `scripts/fault.sh reset`（Mode B）/ 注入ブランチを破棄（Mode A）。

---

## Mode A — コード欠陥（evo は「コード修正 PR」を出す）

実際の局在コードバグを仕込み、evo にバグ関数をコードで直させる。
詳細・適用パッチは [`docs/scenarios/A-code-bug.md`](./scenarios/A-code-bug.md)。

要点:
- バグは関数単位に局在（例: `getTodo` の not-found ガード欠落 → null 参照 → 500）。
- 既存テストが落ちるので、本来は CI で止まる「悪い変更がすり抜けた」想定で手動デプロイして再現する。
- evo の修正 = ガード復元のコード PR。マージ → CD でコードが直る。

## Mode B — 構成ミス（evo は「CDK 差分 PR」を出す）

CDK の設定値を誤らせ、evo に IaC を差分 PR で直させる。
詳細・適用パッチは [`docs/scenarios/B-cdk-misconfig.md`](./scenarios/B-cdk-misconfig.md)。

要点:
- 例: `infra/lib/evo-testapp-stack.ts` の `FAULT_ERROR_RATE` を `'1'` にしてデプロイ。
- evo の修正 = 当該値を `'0'` に戻す CDK 差分 PR。マージ → CD で構成が直る。
- 速い検証だけしたい場合は、デプロイせず `scripts/fault.sh set FAULT_ERROR_RATE=1` で一時的に同じ症状を作れる
  （ただしこの一時操作の「修正」はコード/IaC ではないので、PR ループの実証には CDK 経由を使う）。

---

## どのフォルトがどのアラームを発報するか

| 注入 | 主に発報するアラーム | 症状 |
|------|----------------------|------|
| `FAULT_NULL_DEREF` / not-found ガード欠落 | `sampleapp-lambda-errors`, `sampleapp-api-5xx` | 例外 → 500 |
| `FAULT_ERROR_RATE` | `sampleapp-lambda-errors`, `sampleapp-api-5xx` | 確率的 500 |
| `FAULT_LATENCY_MS` | `sampleapp-api-latency-p99` | 遅延 |
| `FAULT_DYNAMO_FAIL` | `sampleapp-lambda-errors`, `sampleapp-api-5xx` | データ層失敗 |

## トラブルシュート

- アラームが `INSUFFICIENT_DATA` のまま: トラフィック不足。`scripts/load.sh` の回数を増やす。
- `fault.sh` 後に効かない: Lambda の構成更新は数秒かかる。`fault.sh show` で反映を確認。
- 復旧しない: `alarm-state.sh` の `Updated` 時刻と、CloudWatch Logs の error ログ（operation/stack）を確認。
