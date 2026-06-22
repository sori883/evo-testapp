---
name: loop-engineering
description: コーディングエージェントのループを設計・実行するための Skill。作業発見、作業単位の切り出し、作成者/確認者の分離、検証、local-memory などのメモリバックエンドへの永続状態委譲、次アクション判断を扱う。Claude Code が反復可能なエージェントループを動かす、automation prompt を準備する、triage/explorer/implementer/phase-reviewer/verifier を協調させる、またはメモリバックエンドに依存しない汎用ループ挙動を保つ必要があるときに使う。
---

# ループエンジニアリング

## 概要

この Skill は、単発プロンプトではなく、小さく反復可能なコーディングエージェントループを動かすために使う。ループ自体は汎用に保ち、作業、検証、エスカレーションを制御し、永続状態の読み書きは設定されたメモリバックエンドに委譲する。

## ループ契約

現在の依頼を、次のフィールドを持つ境界付き work item として扱う。

```md
## 目的
## 背景
## 制約
## 受け入れ条件
## 検証
## エスカレーション
```

不足しているフィールドがあれば、ローカル文脈から安全な最小値を推定する。欠落が実行リスクや実装方針の分岐につながる場合だけ、人間に確認する。

## コントローラーワークフロー

1. 依頼を境界付き work item に正規化する。
2. 永続状態を読む・書く前に、設定された memory backend skill を読み込む。ローカルファイル（`.docs/memory`）が backend の場合は `$local-memory` を使う。
3. discovery で選んだ work item は、実作業前に memory backend の最新状態を再確認して claim する。claim できない場合は作業せず、次候補を探すか no-op / escalation として扱う。
4. 非自明な作業では作成者/確認者を分離する。
   - `triage` は候補作業の優先度とスコープを整理する。
   - `explorer` はコード、依存関係、既存パターンを調査する。explorer へ dispatch する前に `$iterative-retrieval` で関連ファイルを 3〜5 件に絞り、決定したファイルを prompt に明示して渡す。
   - `implementer` は範囲を絞って変更する。
   - `phase-reviewer` は各工程の成果物を独立レビューする。controller が orchestration boundary に従って spawn し、ステップ 6 の review gate を担わせる。
   - `verifier` は全 phase 完了後、目的と受け入れ条件に照らして最終確認する。
5. 実装を伴う作業では `$tdd-cycle` を使い、計画、記録、Red、Green、リファクタリング、検証の順に進める。
6. 各工程後に `$cross-review-gates` を使い、担当エージェントとは別エージェント（`phase-reviewer`）で review gate を通す。gate の起動主体は controller のみ。
7. 各エージェントが何を読み書きできるかは memory backend skill と project policy に従う。
8. 検証と review gate が通る、人間が明示的に停止する、またはエスカレーションが必要になるまで進める。

## メモリバックエンドの扱い

backend 固有の memory rule はこの Skill に書かない。

- ローカルファイル（`.docs/memory`）が設定されている場合は、`.docs/memory/` のドキュメント、work item ファイル、実行ログの読み取りと、実行ログ、検証、エスカレーションの記録に `$local-memory` を使う。
- 進捗状態は `$local-memory` の状態機械に従って work item ファイルの status / label / 実行ログに反映する。
- 実装を伴う場合は `$tdd-cycle` を使い、計画、E2E/受け入れテスト、最小実装、テスト通過、リファクタリングのサイクルを守る。
- 設計、テスト、実装、リファクタリング、検証の各工程後は `$cross-review-gates` を使い、controller が担当エージェントとは別エージェント（phase-reviewer）にクロスレビューさせる。work item 全体の最終検証は verifier が担い、工程ゲートとは区別する。
- 別の backend が設定されている場合は、その backend 用 Skill を使う。
- backend が設定されていない場合は、永続 memory があるふりをしない。最終応答に結果を要約し、永続化していないことを明記する。

## 検証ルール

主観的な完了宣言ではなく、検証可能な停止条件を優先する。

- 既存テスト、lint、type check、build、screenshot、対象を絞った手動確認など、状況に合う検証を使う。
- 検証手段がない場合は、最小限有用な確認を行い、その限界を記録する。
- 意味のある変更では、implementer だけを成功判定者にしない。
- verifier が `REJECT` した場合は、修正して再検証するか、明確な理由とともにエスカレーションする。
- 各工程後のレビュー担当が `REJECT` した場合は、次工程へ進まず、対象 phase を修正して再レビューする。
- memory backend がある場合は、検証結果をそこに記録する。

## エスカレーションルール

ループが安全に進められない場合はエスカレーションする。

- 目的がプロジェクト制約と衝突している。
- 必要な認証、承認、外部状態が不足している。
- 次アクションが破壊的または高リスクである。
- 受け入れ条件が曖昧で、実装方針が変わり得る。
- 利用可能な tool では信頼できる検証ができない。

エスカレーションでは、具体的な質問と、人間に必要な判断を明示する。memory backend がある場合は、エスカレーションもそこに記録する。

## 自動実行プロンプトの形

Automation prompt は長い手順を埋め込まず、この Skill を呼ぶ短い形にする。

```text
$loop-engineering を使う。
ローカルファイル（.docs/memory）が memory backend の場合は $local-memory を使う。
実装が必要な場合は $tdd-cycle を使う。
設計、テスト、実装、リファクタリング、検証工程の各 phase 後に $cross-review-gates を使う（work item 全体の最終検証は verifier）。
境界付き work item を 1 件発見する、または受け入れる。
作業前に memory backend の最新状態を再確認し、project policy に従って claim する。
非自明な作業では作成者/確認者を分離する。
完了前に検証する。
設定された memory backend に永続状態を記録する。
```
