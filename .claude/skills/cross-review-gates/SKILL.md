---
name: cross-review-gates
description: 各工程後に、担当したエージェントとは別のエージェントで独立レビューを行うための Skill。設計、テスト、実装、リファクタリング、検証工程の各 phase で、成果物だけを対象にクロスチェックし、APPROVE / REJECT / ESCALATE を判定する必要があるときに使う（work item 全体を Done にする最終検証は verifier の役割で別物）。controller が spawn する phase-reviewer agent がこの skill をプリロードして使う。t-wada 流 TDD、Loop Engineering、local memory と組み合わせて使う。
---

# クロスレビューゲート

## 概要

各工程の完了後に、担当エージェントとは別の読み取り専用レビュー担当エージェントを起動してクロスチェックする。レビューは改善作業ではなく、次の工程に進んでよいかを判定する gate として扱う。

## 基本ルール

- このゲートを spawn する主体は controller（メインの Claude セッション）のみ。実装担当エージェントが自分でゲートを起動・完結してはいけない（`CLAUDE.md` の orchestration boundary）。controller は通常 `phase-reviewer` をレビュー担当として起動する。
- 工程を実行したエージェントと、その工程をレビューするエージェントは同一にしない。
- controller がレビュー担当を新しいサブエージェントとして起動する。
- controller はレビュー担当に、成果物、目的、受け入れ条件、関連差分（変更したファイルと内容）、テスト出力など、判定に必要な証拠を prompt 内で明示して渡す。実行ログへの記録前でもレビューできるよう、証跡は prompt に載せる（レビュー担当は `.docs/memory` を直接読めるが、prompt の証跡を一次根拠とする）。
- レビュー担当に実行者の chain-of-thought や隠れた意図を渡さない。
- レビュー担当は成果物を変更しない。判定と根拠だけを返す。
- controller 以外のエージェントが `.docs/memory` の mutation を直接行った証拠がある場合は、`APPROVE` せず `ESCALATE` として扱う。
- `APPROVE` なしに次工程へ進まない。

## レビューゲート

標準 gate:

1. 設計レビュー: 計画とテストリストが目的/受け入れ条件を満たすか確認する。
2. テストレビュー: 追加した E2E/受け入れテストが仕様を表しており、期待通り Red になっているか確認する。
3. 実装レビュー: Green のための実装が最小で、テストを不正に弱めていないか確認する。
4. リファクタリングレビュー: 振る舞いを変えずに整理され、テストが通ったままか確認する。
5. 検証工程レビュー: 検証工程（テスト/lint/type check/build 等）が十分で、残リスクが明示されているか確認する。これは phase-reviewer による工程ゲートであり、work item 全体を Done にする verifier の最終検証とは別物。

## レビュー担当の出力

レビュー担当は次の形式で返す。

```md
## 工程レビュー

工程:
実行者:
レビュー担当:
判定: APPROVE | REJECT | ESCALATE

## 根拠

## 満たしていない基準

## 必要な次アクション

## 残るリスク
```

`APPROVE` は、次工程へ進んでよい場合だけ使う。
`REJECT` は、実行者が修正して同じ gate を再実行できる場合に使う。
`ESCALATE` は、仕様判断、権限、外部状態、人間の承認が必要な場合に使う。

## 記録

レビュー担当（phase-reviewer 等）は read-only であり、`.docs/memory` には書き込まない。各 review gate の結果は実行ログ案として controller に返し、ローカルファイル（`.docs/memory`）が memory backend の場合は controller が `$local-memory` を使って work item の `## 実行ログ` に記録する。

記録する内容:

- 工程
- 実行者
- レビュー担当
- 判定
- 根拠
- 必要な次アクション
- 残るリスク

## 停止条件

次工程へ進める条件:

- 対象 phase のレビュー担当が `APPROVE` を返している。
- `REJECT` の場合は、実行者が修正し、同じ phase を再レビューしている。
- `ESCALATE` の場合は、人間の判断が local memory（`.docs/memory`）または現在の会話に記録されている。

レビューできない場合は、レビューを省略せず `ESCALATE` として扱う。
