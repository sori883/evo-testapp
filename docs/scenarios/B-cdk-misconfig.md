# シナリオ B — 構成ミス（evo は「CDK 差分 PR」を出す）

IaC（CDK）の設定値を誤らせてデプロイし、アラーム発報 → evo が **CDK の差分 PR** で構成を直す、までを再現する。
コードは正しいまま、「構成だけが悪い」状態を作るのがポイント。

## 構成ミスの内容

`infra/lib/evo-testapp-stack.ts` の Lambda 環境変数 `FAULT_ERROR_RATE` を `'1'` にしてデプロイする
（全リクエストが `InjectedFaultError` → 500）。evo は当該行を `'0'` に戻す CDK 差分 PR を出す。

### 注入パッチ（適用すると壊れる）

```diff
       environment: {
         TABLE_NAME: table.tableName,
         SERVICE_NAME: 'evo-testapp',
         STAGE: props.stage,
         LOG_LEVEL: 'info',
         // フォルトインジェクション（平常 OFF）。
         FAULT_NULL_DEREF: 'false',
         FAULT_LATENCY_MS: '0',
-        FAULT_ERROR_RATE: '0',
+        FAULT_ERROR_RATE: '1', // MISCONFIG(scenario-B): 誤って全リクエストを失敗させる構成
         FAULT_DYNAMO_FAIL: 'false',
       },
```

> コード/テストには影響しない（`pnpm test` は緑のまま）。壊れるのは「デプロイされる構成」だけ。
> CI の `cdk synth` は通ってしまうため、構成ミスはこの種の差分で本番に入りうる ——
> だからこそ evo の CDK 差分 PR が価値を持つ。

## 手順

1. 平常確認: `scripts/smoke.sh <ApiUrl>` → `SMOKE OK`、`scripts/alarm-state.sh` → 全 `OK`。
2. 注入: 上記 diff を適用（`feature/misconfig-error-rate` ブランチ等）。
3. デプロイ: `pnpm build && pnpm deploy`（または PR マージ → CD）。
4. 発報: `scripts/load.sh <ApiUrl> 200` → 全件 500。数分後 `scripts/alarm-state.sh` で
   `sampleapp-lambda-errors` / `sampleapp-api-5xx` が `ALARM`。
5. evo: アラーム → 診断。構成（Lambda env / CDK）に原因があると判断し、
   `FAULT_ERROR_RATE` を `'0'` に戻す **CDK 差分 PR** を作成する。
6. 人: PR をレビューしてマージ。
7. CD: `main` push で `cdk deploy`。構成が直る。
8. 復旧確認: `scripts/smoke.sh <ApiUrl>` → `SMOKE OK`、`scripts/alarm-state.sh` → `OK`。

## 速い検証だけしたい場合（PR ループは回さない）

デプロイせずに同じ症状だけ作るなら、デプロイ済み Lambda の env を一時操作する:

```bash
scripts/fault.sh set FAULT_ERROR_RATE=1   # 注入
scripts/load.sh <ApiUrl> 200              # 発報させる
scripts/fault.sh reset                    # 戻す
```

ただしこの一時操作の「修正」はコードでも IaC でもないため、evo の PR ループ実証には上記の CDK 経由を使うこと。

## 別バリエーション（任意）

- `timeout: Duration.seconds(1)` のように過小なタイムアウトへ変更 + `FAULT_LATENCY_MS` で遅延 → タイムアウト多発。
  evo は timeout/memory を引き上げる CDK 差分 PR を出す、という構成性能系のシナリオにもできる。
