---
id: 0001
title: evo 監視対象サンプルアプリ（ToDo API）の初期構築
status: In Progress
labels: [loop-managed, agent-active, ready-for-agent]
assignee: "controller"
created: 2026-06-22
updated: 2026-06-22
links: []
---

## 作業概要

evo（外部 SRE エージェント基盤）の監視・自動修正の対象となる、サーバーレス ToDo API を新規構築する。
API Gateway (HTTP API) → Lambda (Node.js 22 / TS) → DynamoDB。observability（構造化ログ・メトリクス・
アラーム）と IaC（CDK）、CI/CD（GitHub Actions OIDC）、フォルトインジェクションを備える。

## 目的

evo が「正しいシグナルを出し、IaC で構成され、PR でデプロイできる」対象システムとして機能すること。

## 背景

evo 本体は含めない。本リポジトリは「対象アプリ」のみ。連携契約（同一アカウント / ap-northeast-1 /
`evo-target:true` タグ / CloudWatch アラーム / 構造化ログ / CDK / GitHub PR 運用）を満たす必要がある。

## 受け入れ条件

- [ ] ap-northeast-1 に CDK でデプロイでき、全リソースに `evo-target:true` タグが付く。
- [ ] API が動作し、CloudWatch に構造化ログ（JSON 1行）・メトリクスが出る。
- [ ] 主要メトリクスに分かりやすい名前の CloudWatch アラームがある。
- [ ] フォルト注入を ON にするとエラー増→アラーム発報まで再現できる。
- [ ] GitHub リポジトリ + CI（test/synth 緑）+ CD（OIDC デプロイ）。main は PR 運用。
- [ ] README に構成 / デプロイ手順 / フォルト注入の使い方 / evo 連携前提を記載する。
- [ ] リポジトリ直下に AGENTS.md（運用ルールと連携契約）を置く。

## レビュー観点

- [ ] 全 AWS リソースに `evo-target:true` タグが付くか（app レベル Tags）。
- [ ] アラーム名が分かりやすく、incident トリガとして機能するか。
- [ ] エラーログに「どの関数で何が起きたか」（operation 名 + stack）が残るか。
- [ ] フォルトが特定箇所に局在し、テストで守られているか。
- [ ] secret/トークンが commit・ログに含まれないか。

## 人間の判断・フィードバック

### [判断] 01 ドメイン選定 — 2026-06-22
論点: CRUD 対象ドメイン。
提示した選択肢: ToDo API / URL 短縮 API。
決定: ToDo API。
理由: 最も標準的でフォルト局在・テストが容易、自律開発向き。

### [判断] 02 今回セッションの範囲 — 2026-06-22
論点: どこまで実施するか。
決定: コード一式をローカル構築。git init / commit / push / PR / GitHub repo 作成 / デプロイは行わず、完了後に承認を求める。
理由: commit/push/PR/deploy はユーザー承認時のみ、というループ運用ルール。

## 検証

ローカル検証（2026-06-22, controller 実行）:

- `pnpm typecheck`（tsc --noEmit）: PASS。
- `pnpm test`（vitest）: 5 ファイル / 53 テスト PASS（domain / faults / operations / router / logger）。
- `pnpm lint`（Biome）: クリーン（フォーマット自動修正適用済み）。
- `pnpm build`（tsup）: PASS。`dist/handler.cjs`（15.4KB, Node22/CJS）を出力。
- `pnpm synth`（cdk synth）: PASS。`cdk.out/EvoTestappStack.template.json` 生成。
- タグ検証: タグ可能な全 10 リソース（Lambda / DynamoDB / LogGroup / IAM Role / Api / Stage / Alarm×4）に
  `evo-target:true` 付与を確認。未タグはタグ非対応の CFN 種別（IAM::Policy / ApiGatewayV2::Integration /
  ApiGatewayV2::Route / Lambda::Permission / CDK::Metadata）のみ。
- アラーム名確認: `sampleapp-lambda-errors` / `sampleapp-lambda-throttles` / `sampleapp-api-5xx` /
  `sampleapp-api-latency-p99`。
- Lambda: Runtime `nodejs22.x` / Handler `handler.handler`。

未実施（ユーザー承認が必要なため保留）:

- git init / commit（feature ブランチ）/ push / GitHub repo 作成 / PR / `cdk bootstrap` / `cdk deploy`。
- 実 AWS 上での「フォルト注入 ON → アラーム発報」の動作確認（デプロイ後に実施）。

## エスカレーション

- デプロイ・GitHub 連携（repo 作成、ブランチ保護、CD 用 OIDC ロール `AWS_DEPLOY_ROLE_ARN` の作成）は
  ユーザー承認・認証情報が必要。承認待ち。

## 実行ログ

### 2026-06-22 controller bootstrap 着手
- 環境確認: Node v24（Lambda ランタイムは 22 を指定）/ pnpm 10 / gh / aws-cli あり。
- ロガーは pino ではなく zero-dep の最小構造化ロガーを採用（Lambda バンドルの確実性と JSON 1行保証のため）。README に根拠を記載予定。

### 2026-06-22 構築完了（ローカル）
- アプリ実装: src/（handler / app ルーター / handlers/todo / domain/todo / lib: config・faults・logger・errors・http・repository・dynamo-repository）。
- フォルト注入を src/lib/faults.ts に局在（FAULT_NULL_DEREF / FAULT_LATENCY_MS / FAULT_ERROR_RATE / FAULT_DYNAMO_FAIL、平常 OFF）。
- IaC: infra/（bin/app.ts で region 固定 + App レベルで evo-target タグ、lib/evo-testapp-stack.ts で DynamoDB / Lambda / HTTP API / アラーム4種）。
- CI/CD: .github/workflows/ci.yml（lint/typecheck/test/build/synth）, cd.yml（main push で OIDC デプロイ）。
- ドキュメント: README.md / AGENTS.md / .env.example。
- 全ローカル検証 PASS（上記「検証」節）。pino 不採用の根拠は README に記載済み。
- 次アクション: git/PR/deploy はユーザー承認待ち。

### 2026-06-23 インシデント・ドリル用ハーネス追加
- 依頼: 「意図してエラーを起こして修正するワークフロー」。修正は Mode A（コード修正PR）/ Mode B（CDK差分PR）の両方。
  evo は PR 作成で停止 → 人がマージ → CD で再デプロイ → 復旧、という境界（既存の main PR運用 + cd.yml と一致）。
- 追加: scripts/{smoke,load,alarm-state,fault}.sh（chmod +x, bash -n 構文チェック済み、fault.sh は env 全置換を
  避け TABLE_NAME を保持する python マージを実機なしで検証）。
- 追加: docs/incident-drill.md（runbook）, docs/scenarios/A-code-bug.md（getTodo の not-found ガード欠落 →
  null 参照 500）, docs/scenarios/B-cdk-misconfig.md（CDK env の FAULT_ERROR_RATE 誤設定）。
- README にドリル節と scripts 導線を追加。シナリオ diff は実コードと一致を確認。テスト 53 件グリーン維持。
