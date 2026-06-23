# evo-testapp — SRE エージェント基盤「evo」の監視・自動修正対象サンプル

外部 SRE エージェント基盤 **evo** によって監視・診断され、障害時にはコード修正 PR を自動で出される
「対象システム」となるサーバーレス ToDo API です。普通のアプリですが、evo が機能するための観測シグナルと
運用前提（タグ・アラーム・構造化ログ・IaC・PR 運用）を満たしています。

> 運用ルールと evo 連携契約の要点は [`AGENTS.md`](./AGENTS.md) を参照。

## アーキテクチャ

```
  Client
    │  HTTPS
    ▼
  API Gateway (HTTP API)        routeKey 例: "POST /todos", "GET /todos/{id}"
    │  Lambda proxy integration
    ▼
  AWS Lambda (Node.js 22 / TypeScript)     ← 構造化ログ(JSON 1行) を CloudWatch Logs へ
    │  @aws-sdk/lib-dynamodb
    ▼
  DynamoDB (sampleapp-todos, PK: id)
```

- **言語/ツール**: TypeScript / AWS CDK / pnpm / vitest / tsup / Biome
- **観測**: 構造化ログ（自前の最小ロガー）/ CloudWatch 標準メトリクス / CloudWatch アラーム
- **リージョン**: `ap-northeast-1` 固定（evo 連携契約）

### ディレクトリ構成

```
src/
  handler.ts            Lambda エントリ（env から依存を組み立て）
  app.ts                ルーティング + 横断的なログ/エラーハンドリング（副作用なし・テスト可能）
  handlers/todo.ts      CRUD operation（フォルト注入の局在ポイント）
  domain/todo.ts        ドメイン（純粋関数: バリデーション/生成/更新）
  lib/
    config.ts           実行時設定（env）
    faults.ts           フォルトインジェクション（意図的バグを集約）
    logger.ts           構造化ロガー（JSON 1行 / Error 自動展開）
    errors.ts           AppError(4xx) 型
    http.ts             リクエスト/レスポンス変換
    repository.ts       永続化の抽象（インターフェース）
    dynamo-repository.ts  DynamoDB 実装
infra/
  bin/app.ts            CDK App（region 固定・evo-target タグ付与）
  lib/evo-testapp-stack.ts  Stack（DynamoDB / Lambda / HTTP API / アラーム）
test/                   vitest（domain / faults / operations / router / logger）
```

## API

| Method | Path          | 説明                         |
|--------|---------------|------------------------------|
| POST   | `/todos`      | 作成（body: `{title, completed?}`） |
| GET    | `/todos`      | 一覧（query: `limit`、既定 50 / 上限 100） |
| GET    | `/todos/{id}` | 取得                         |
| PUT    | `/todos/{id}` | 部分更新（body: `{title?, completed?}`） |
| DELETE | `/todos/{id}` | 削除                         |

エラーは `{ "code", "message", "details?" }`。4xx は想定内（バリデーション/未検出）、5xx は想定外
（バグ・フォルト注入）で Lambda Errors / API 5xx メトリクスを増やしアラームを発報させます。

## セットアップ

```bash
pnpm install
pnpm check     # lint + typecheck + test + build + synth を一括実行
```

個別:

```bash
pnpm test        # vitest
pnpm lint        # Biome（--write で自動修正は pnpm lint:fix）
pnpm typecheck   # tsc --noEmit
pnpm build       # tsup（Lambda バンドルを dist/handler.cjs に出力）
pnpm synth       # cdk synth（事前に pnpm build が必要）
```

## デプロイ手順（`ap-northeast-1`）

前提: AWS アカウントへの認証情報、CDK ブートストラップ済みであること。

```bash
# 1. 一度だけ: CDK ブートストラップ（対象アカウント/リージョン）
pnpm exec cdk bootstrap aws://<ACCOUNT_ID>/ap-northeast-1

# 2. デプロイ（build → cdk deploy）
pnpm deploy
```

出力の `ApiUrl` がベース URL です。動作確認:

```bash
API=<ApiUrl>
curl -s -XPOST "$API/todos" -d '{"title":"買い物"}'
curl -s "$API/todos"
```

### CI/CD

- **CI**（`.github/workflows/ci.yml`）: PR / feature ブランチで lint・typecheck・test・build・synth。
- **CD**（`.github/workflows/cd.yml`）: `main` への push（PR マージ）で OIDC により `ap-northeast-1` へ
  `cdk deploy`。`main` 直 push は禁止（ブランチ保護）。
- CD には GitHub の **OIDC ロール ARN** を repo variable `AWS_DEPLOY_ROLE_ARN` に設定する
  （`aws-actions/configure-aws-credentials`）。長期キーは置かない。

## フォルトインジェクションの使い方

平常時はすべて OFF。**ON にするとエラー増 → アラーム発報** を再現でき、evo の診断 → 修正 PR の一連を
検証できます。バグは [`src/lib/faults.ts`](./src/lib/faults.ts) に局在させ、テストで挙動を固定しています。

| 環境変数            | 例       | 効果                                              | 主に発報するアラーム            |
|---------------------|----------|---------------------------------------------------|---------------------------------|
| `FAULT_NULL_DEREF`  | `true`   | 変更系 operation で本物の `TypeError`（null 参照） | `sampleapp-lambda-errors` / `sampleapp-api-5xx` |
| `FAULT_ERROR_RATE`  | `1`      | 確率的に `InjectedFaultError`（0..1）             | `sampleapp-lambda-errors` / `sampleapp-api-5xx` |
| `FAULT_LATENCY_MS`  | `5000`   | 各リクエストにレイテンシ注入                       | `sampleapp-api-latency-p99`     |
| `FAULT_DYNAMO_FAIL` | `true`   | DynamoDB アクセスを擬似的に失敗                     | `sampleapp-lambda-errors` / `sampleapp-api-5xx` |

ON にする方法（例）:

```bash
# デプロイ済み Lambda の環境変数を一時的に書き換えてフォルトを ON にする
aws lambda update-function-configuration \
  --function-name sampleapp-api --region ap-northeast-1 \
  --environment "Variables={TABLE_NAME=sampleapp-todos,FAULT_ERROR_RATE=1}"

# トラフィックを与える → Lambda Errors 増 → sampleapp-* アラームが ALARM → evo が起動
for i in $(seq 1 20); do curl -s -XPOST "$API/todos" -d '{"title":"x"}' >/dev/null; done

# 検証後は OFF（フォルト変数を外して元の環境変数に戻す）
```

> 注意: `update-function-configuration` は `--environment` を**全置換**します。`TABLE_NAME` 等を必ず含めること。
> 恒久的な変更は CDK（`infra/lib/evo-testapp-stack.ts` の `environment`）側で行い PR 経由でデプロイします。

## インシデント・ドリル（壊す → 検知 → 修正 PR → 復旧）

evo の「障害検知 → 診断 → 修正 PR」ループを意図的に再現・検証するための手順とスクリプトを用意しています。
evo は **PR 作成までで停止**し、人が PR をマージ → CD が再デプロイ → 復旧、という流れです。

- 手順書: [`docs/incident-drill.md`](./docs/incident-drill.md)
- シナリオ A（コード欠陥 → evo は**コード修正 PR**）: [`docs/scenarios/A-code-bug.md`](./docs/scenarios/A-code-bug.md)
- シナリオ B（構成ミス → evo は**CDK 差分 PR**）: [`docs/scenarios/B-cdk-misconfig.md`](./docs/scenarios/B-cdk-misconfig.md)

運用スクリプト（`scripts/`、要 `ApiUrl` / AWS 認証情報）:

```bash
scripts/smoke.sh <ApiUrl>             # 全 CRUD を検証（正常性 / 復旧確認）
scripts/load.sh  <ApiUrl> 200         # リクエストを流してアラームを誘発
scripts/alarm-state.sh                # 対象アラームの ALARM/OK を表示
scripts/fault.sh set FAULT_ERROR_RATE=1   # デプロイ済み Lambda の FAULT_* を安全に切替（一時操作）
scripts/fault.sh reset                    # FAULT_* を安全既定へ戻す
```

## evo 連携前提（チェックリスト）

- [x] `ap-northeast-1` に CDK でデプロイでき、全リソースに `evo-target:true` タグが付く。
- [x] 構造化ログ（JSON 1行）。エラー時は例外メッセージ + スタック + operation を残す。
- [x] CloudWatch 標準メトリクス + 分かりやすい名前のアラーム（incident トリガ）。
- [x] フォルト注入 ON でエラー増 → アラーム発報を再現できる。
- [x] GitHub リポジトリ + CI（test/synth）+ CD（OIDC）。`main` は PR 運用。

evo 側の設定（このリポジトリの作業外）:

- evo の `GITHUB_REPO` をこのリポへ、`EVO_GITHUB_PAT` をこのリポに書ける PAT へ向ける。
- 監視タグは `evo-target:true` を使う。

## ロギングについて（pino ではなく自前ロガー）

推奨ツールに pino が挙がっていますが、本リポジトリは zero-dependency の最小構造化ロガー
（`src/lib/logger.ts`）を採用しています。理由:

- Lambda へのバンドル（tsup/esbuild）が確実で、`thread-stream` 等のワーカー依存を持ち込まない。
- 出力が常に「JSON 1行」で、`Error` を `{name, message, stack}` に自動展開する（evo の原因特定に最適）。

API は pino 互換に寄せてあり（`info/warn/error/child`）、必要なら pino へ差し替え可能です。
