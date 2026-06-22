# AGENTS.md — 運用ルールと evo 連携契約

このリポジトリは、外部 SRE エージェント基盤 **evo** の「監視・自動修正の対象」となるサンプルアプリ
（サーバーレス ToDo API）です。コードを変更する人間・エージェントは、以下を必ず守ってください。

## このアプリは何か

- API Gateway (HTTP API) → AWS Lambda (Node.js 22 / TypeScript) → DynamoDB の ToDo CRUD API。
- IaC は AWS CDK (TypeScript)。observability（構造化ログ・標準メトリクス・CloudWatch アラーム）を備える。
- evo 本体のコードは含まない。本リポジトリは「対象システム」のみ。

## evo 連携契約（MUST: これが崩れると evo が機能しない）

1. **同一アカウント・同一リージョン `ap-northeast-1`** にデプロイする（`infra/bin/app.ts` で region 固定）。
2. 全 AWS リソースに **`evo-target: true` タグ**を付ける（`infra/bin/app.ts` の `Tags.of(app)`）。
   - 新しいリソースを足しても App レベルのタグで自動付与される。タグ付けを止めないこと。
3. **CloudWatch アラーム**を維持する（incident のトリガ）。名前は分かりやすく:
   - `sampleapp-lambda-errors` / `sampleapp-lambda-throttles`
   - `sampleapp-api-5xx` / `sampleapp-api-latency-p99`
4. **構造化ログ（JSON 1行）** を出す。エラー時は例外メッセージ + スタックトレース + operation を残す
   （`src/lib/logger.ts` / `src/app.ts` のエラーハンドリング）。この形式を壊さないこと。
5. **メトリクス**を出す（AWS 標準メトリクスで可）。
6. **IaC（CDK）** でインフラを定義する。リソース変更は CDK の差分として PR に出す（evo もそうする）。
7. **GitHub リポジトリ + CI + CD（OIDC）**。`main` への直 push 禁止・PR 運用。

## ブランチ / PR 運用

- `main` への直コミット・直 push は禁止。必ず `feature/<topic>` ブランチ → Pull Request。
- `main` はブランチ保護を有効化する（PR 必須・CI 必須）。
- CI（`.github/workflows/ci.yml`）が緑（lint / typecheck / test / build / synth）であること。
- `main` への push（= PR マージ）で CD（`.github/workflows/cd.yml`）が OIDC で `ap-northeast-1` にデプロイする。
- evo の fine-grained PAT が書き込める repo であること（evo が修正 PR を作成する）。

## セキュリティ

- secret / トークン / 認証情報を commit・PR・ログに含めない。`.env` は commit しない（`.gitignore` 済み）。
- AWS 認証情報は GitHub Actions の OIDC ロール（`vars.AWS_DEPLOY_ROLE_ARN`）で取得する。長期キーを置かない。

## バグ修正の指針（evo / 人間 共通）

- バグは関数単位に局在させる。フォルトインジェクションは `src/lib/faults.ts` に集約されている。
- 変更はテストで守る（TDD: 失敗するテスト → 最小実装 → リファクタ）。
- エラーログに「どの operation で何が起きたか」を必ず残す。

## ローカル開発コマンド

```bash
pnpm install
pnpm test         # vitest
pnpm lint         # Biome
pnpm typecheck    # tsc --noEmit
pnpm build        # tsup（Lambda バンドルを dist/ に出力）
pnpm synth        # cdk synth（要: 事前に pnpm build）
pnpm check        # 上記を一括実行
```
