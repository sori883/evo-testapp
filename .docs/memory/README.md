# ローカルファイルメモリ

このディレクトリは、エージェントループの永続メモリと作業状態のバックエンドである。外部サービス（Linear 等）には依存せず、すべてローカルの markdown ファイルで管理する。詳細な運用は `$local-memory` skill（`.claude/skills/local-memory/SKILL.md`）を参照する。

## 構成

- `feedback/` — 横断フィードバック置き場（scope 別フォルダ）。`README.md`（索引）＋ `review.md` / `implementation.md` / `research.md` / `general.md`。特定 work item に閉じず以後の作業全般に効くフィードバックを controller が蓄積し、指定エージェントが「自分の scope ＋ general」を参照する。各エントリは `種別`・`status`（active/applied/retired）で分類・ライフサイクル管理し、追記のたびに即時トリアージ（即時反映 / 改善 work item 化 / retired）して継続的改善につなげる。
- `issues/` — 1 ファイル = 1 work item。ファイル名は `<id>-<短いスラッグ>.md`（例: `0007-login-error-display.md`）。
- `index.md` — work item 一覧・現在状態の進捗ボード（標準）。controller が status 変更時に更新する。

## work item の書き方

各 work item ファイルは frontmatter（`id` / `title` / `status` / `labels` / `assignee` / `created` / `updated` / `links`）と本文（`## 作業概要` / `## 目的` / `## 背景` / `## 受け入れ条件` / `## レビュー観点` / `## 人間の判断・フィードバック` / `## 検証` / `## エスカレーション` / `## 実行ログ`）を持つ。テンプレートは `issues/_template.md` を参照する。

記録したい「作業内容」の中心は次の3つ:

- `## 作業概要` — 2〜3行で「何の作業か」。
- `## 人間の判断・フィードバック` — 対話で人間が決めたこと（判断: 論点/選択肢/決定/理由）と、指摘・修正・確認・好み（フィードバック: フィードバック/背景/反映方法）を `[判断]` / `[フィードバック]` のタグで分けて記録する append-only ログ。controller が転記する。横断的に効くフィードバックは `feedback/` へ昇格する。
- `## レビュー観点` — 確認すべき**基準**のチェックリスト。レビューの「結果」は `## 実行ログ` の工程レビューに残す（基準と結果を分離する）。

進捗管理:

- 主進捗 = frontmatter `status`（状態機械 `Backlog → Todo → In Progress → In Review → Done`）。
- 細粒度進捗 = `## 受け入れ条件` / `## レビュー観点` のチェックボックス消化状況。
- 一覧進捗 = `index.md` の進捗ボード。

その他:

- `status` / `labels` の値と遷移は `$local-memory` の状態機械に従う。
- `## 人間の判断・フィードバック` / `## 実行ログ` は append-only。既存エントリを改変・削除しない。
- 書き込み（記録・status/label 更新・work item 作成・`index.md` 更新）は controller のみが適用する。read-only サブエージェントは `.docs/memory` を直接読めるが、書き込みは行わず更新案を返す。
