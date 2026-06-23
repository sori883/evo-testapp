---
name: local-memory
description: ローカルファイル（`.docs/memory`）をエージェントループの永続メモリバックエンドと状態管理バックエンドとして使うための Skill。Claude Code のサブエージェントが work item を読む、実行ログ・status/label 更新・判断・エスカレーションを扱う必要があるときに使う。read は全エージェント可（`.docs/memory` 配下を直接読める）。メモリへの書き込み（記録・status/label 更新・work item 作成）は controller が適用し、read-only サブエージェントは更新案・証跡案を返す。チャット文脈に依存せず、`.docs/memory` を source of truth として扱う。
---

# ローカルファイルメモリ

## 概要

`.docs/memory` 配下のローカルファイルを loop state の source of truth として使う。チャット文脈は一時的な実行文脈であり、memory として扱わない。

メモリへの読み書きは、標準のファイルツール（`Read` / `Glob` / `Grep` / `Write` / `Edit`）で行う。外部サービス（MCP）には依存しない。

## ディレクトリ構成

`.docs/memory/` を memory backend のルートとする。

- `.docs/memory/feedback/` — 横断フィードバック（scope 別フォルダ）。索引 `README.md` ＋ `review.md` / `implementation.md` / `research.md` / `general.md`。詳細は「横断フィードバック」節。
- `.docs/memory/issues/` — 1 ファイル = 1 work item。ファイル名は `<id>-<短いスラッグ>.md`（例: `0007-login-error-display.md`）。
- `.docs/memory/index.md`（任意） — work item の一覧・現在状態の早見表。controller が必要に応じて更新する。

ディレクトリが存在しない場合は controller が作成する。read-only サブエージェントは作成・書き込みを行わない。

## work item ファイルの形式

各 work item は次の frontmatter + 本文を持つ 1 つの markdown ファイルにする。

```md
---
id: 0007
title: ログイン失敗時のエラー表示を修正する
status: Todo
labels: [loop-managed, ready-for-agent]
assignee: ""
created: 2026-06-22
updated: 2026-06-22
links: []
---

## 作業概要

## 目的

## 背景

## 受け入れ条件

## レビュー観点

## 人間の判断・フィードバック

## 検証

## エスカレーション

## 実行ログ

<!-- append-only。新しいエントリを末尾に追記する。既存エントリは改変・削除しない。 -->
```

- `id` は zero-padded のローカル連番。controller が `.docs/memory/issues/` を走査して次番号を割り当てる。
- `status` / `labels` は frontmatter で管理する（後述の状態機械）。
- `## 作業概要` は 2〜3 行で「何の作業か」を要約する。controller が記録する。
- `## レビュー観点` は確認すべき**基準**のチェックリスト。レビューの「結果」は `## 実行ログ` の工程レビューに残す（基準と結果を分離する）。
- `## 人間の判断・フィードバック` は append-only。対話で人間が決めたこと（判断）と、指摘・修正・確認・好み（フィードバック）を controller が転記する。
- `## 実行ログ` は append-only。エージェントのアクション、調査結果、検証、工程レビュー、状態遷移、人間向け質問を時系列で追記する。

## work item の title

work item の title は日本語で作成する。

- 新規 work item、同期 work item、分割 work item、エスカレーション work item の title は、簡潔な日本語の作業名にする。
- 英語だけの title を作らない。外部由来のテキストやエラー文が英語の場合も、日本語に要約して title にする。
- 固有名詞、コード識別子、API 名、ライブラリ名、エラーコードは原文のまま残してよい。
- title は「何をするか」が分かる動詞句にする。例: `ログイン失敗時のエラー表示を修正する`。
- 詳細な背景、英語原文、ログ、リンクは本文または実行ログに残し、title に詰め込まない。

## 作業前に読むもの

1. ユーザー依頼、automation prompt、`CLAUDE.md` の「ループポリシー」、`.docs/memory/` から対象の work item または discovery scope を特定する。
2. プロジェクト固有ルールを適用する前に、関連する `.docs/memory/` のドキュメントを読む。
3. 対象 work item ファイルの frontmatter（status、labels、links）、本文、`## 実行ログ` の最近のエントリを読む。
4. chat history と `.docs/memory` の durable state が矛盾する場合は、最新の `.docs/memory` state を優先する。
5. 必要な work item や rule ドキュメントが見つからない場合は、不足している identifier を確認する。対象 work item がある場合は escalation として記録する。
6. `CLAUDE.md` の「ループポリシー」（discovery scope、claim、write boundary、triage writer、write policy、completion evidence）を project policy として扱う。

read は全エージェントが可能で、read-only サブエージェント（triage / explorer / phase-reviewer / verifier）も `.docs/memory` 配下を `Read` / `Glob` / `Grep` で直接読んでよい。ただし書き込み（mutation）は行わず、controller が prompt 内で渡した文脈と直接 read の両方を根拠に判断してよい。判断に必要な追加文脈が読めない場合は escalation として controller に返す。

## 作業中に書くもの

現在のエージェント実行を超えて残すべき情報は `.docs/memory` に記録する。

- project policy が controller-only mutation を定義している場合、controller 以外のエージェントは更新案と証拠だけを返し、controller がファイルに記録する。
- work item の作成または title 更新を提案する場合は、日本語 title を含める。
- 調査メモ、実装サマリ、検証結果、blocker、人間向け質問は `## 実行ログ` に追記する。
- 各工程後の cross-review 結果は `## 実行ログ` に追記する。
- 実装成果物（変更したファイル、検証コマンドの結果など）と work item の紐づけは `## 実行ログ`（または frontmatter の `links`）に追記する。
- frontmatter（status / labels / links）の更新は、project policy または user request が許可している場合だけ行う。
- 進捗ログを書くためだけに `## 目的` / `## 背景` などの本文セクションを上書きしない。run history は `## 実行ログ` に残す。
- `## 実行ログ` の既存エントリを削除・改変しない（append-only）。
- ログは事実ベースで簡潔にする。chain-of-thought や長い terminal output は、証拠として必要な場合を除いて保存しない。

## 振り返りと改善 work item

loop 中に悪かった点、詰まり、検証不足、自動化できる手作業、agent の役割分担の曖昧さ、prompt / rule / test / skill / agent の不足を見つけた場合は、現在の work item の `## 実行ログ` または完了証跡に残す。

read-only サブエージェント（triage / explorer / phase-reviewer / verifier）は、本節の記録・work item 作成・capability（skill/agent）追加を直接行わず、提案として controller に返す。`.docs/memory` への記録と適用、capability ファイルの作成・更新は controller のみが行う。

- 通常 run では、改善をその場で広げすぎない。現在の work item の受け入れ条件に必要な修正だけを行い、別作業にすべき改善は新しい work item ファイルに残す。
- PJ の最後、milestone/release/主要な区切りの完了前、または人間が振り返りを要求した場合は、関連 work item と実行ログ、および `feedback/`（README 索引から各 scope ファイル）を読み、改善候補を集約する。`status: active` で未反映のフィードバックは改善 work item 化の主要な候補とする。
- 同じ原因や同じ改善先を持つ候補は 1 つの改善 work item にまとめる。重複する根拠、英語原文、ログ、関連リンクは本文または実行ログに残す。
- 改善 work item の title は日本語にする。labels には `loop-managed` と `loop-improvement` を付ける。
- すぐ実行できる改善には `ready-for-agent` を付ける。調査や整理が必要な改善には `needs-triage` を付ける。
- 既存 skill や agent では改善候補を解消できない場合は、改善 work item に `capability-expansion` を付ける。新規 skill が必要なら `skill-gap`、新規 agent が必要なら `agent-gap` も付ける。
- 新規 skill / agent の作成は、それ自体を改善手段として扱ってよい。skill は `.claude/skills/<skill-name>/`、agent は `.claude/agents/<agent-name>.md` に限定する。
- 広範な設計変更、破壊的変更、権限/費用/外部契約が絡む変更、受け入れ条件が曖昧な改善は `needs-human` として残す。
- 小さく局所的で検証可能な改善、skill 追加、agent 追加は、controller が、project policy の claim、TDD、review gate、completion evidence に従って実行する。read-only サブエージェントは提案を返すのみ。
- 新規 skill / agent を作成または更新した場合は、作成理由、対象ファイル、検証、別エージェント review gate の結果を `## 実行ログ` または完了証跡に残す。

振り返りを記録する場合は、次の形式を使う。

```md
## 振り返り

対象:
読んだ work item / 実行ログ:
見つけた悪かった点:
共通原因:
作成/更新した改善 work item:
作成/更新した skill / agent:
自律修正してよい範囲:
needs-human にした判断:
残るリスク:
次:
```

## 状態機械

frontmatter の `status` は work item の大きな進捗だけに使う。TDD phase や review phase のような細かい状態は `labels` または `## 実行ログ` に残す。

デフォルト status:

- `Backlog`: 発見済み。まだ triage 済みではない。
- `Todo`: 実行可能。目的、受け入れ条件、対象範囲が十分に明確。
- `In Progress`: エージェントまたは人間が現在作業中。
- `In Review`: verifier の最終検証、または人間の確認待ち。各工程の phase-reviewer ゲートは status を動かさず `In Progress` のまま label（`needs-review` + `phase-*`）で表す。
- `Done`: 受け入れ条件を表す E2E、受け入れ、または最も外側に近い integration evidence が通り、必要な review gate も通っている。
- `Canceled`: やらない、または実行しない判断をした。
- `Duplicate`: 他 work item に統合する。

デフォルト labels:

- `loop-managed`: loop が管理する work item。
- `needs-triage`: まだ目的、受け入れ条件、スコープが足りない。
- `ready-for-agent`: エージェントが実行してよい。
- `agent-active`: エージェントが作業中。
- `needs-review`: phase-reviewer または verifier の確認待ち。
- `needs-human`: 人間の判断待ち。
- `blocked`: 外部要因で停止中。
- `verification-failed`: 検証または review gate が失敗した。
- `loop-improvement`: 振り返りから生まれた loop、test、prompt、automation、review、tooling、documentation の改善対象。
- `needs-retro`: PJ 最後または milestone/release 前の振り返りで集約する対象。
- `capability-expansion`: 既存 skill、agent、automation prompt、loop policy では足りず、能力拡張を改善手段として扱う対象。
- `skill-gap`: 新規 skill または既存 skill の拡張が必要な対象。
- `agent-gap`: 新規 agent または既存 agent の責務調整が必要な対象。
- `phase-planning`
- `phase-red`
- `phase-green`
- `phase-refactor`
- `phase-verify`

## 状態遷移

状態遷移は `## 実行ログ` への追記とセットで行う。status だけを動かさない。

標準遷移:

- `Backlog -> Todo`: triage が完了し、実行可能になった。
- `Todo -> In Progress`: エージェントが claim し、作業を開始した。
- `In Progress -> In Review`: 全工程が完了し、verifier による最終検証ゲート待ちになった。各工程（設計 / テスト / 実装 / リファクタリング / 検証工程）の phase-reviewer ゲートは label（`needs-review` + `phase-*`）で表し、status は `In Progress` のまま保つ（工程ごとに In Review を往復させない）。
- `In Review -> In Progress`: レビュー担当が `REJECT` し、修正が必要になった。
- `In Review -> Done`: 受け入れ証跡を含む最終検証と review gate が `APPROVE` になった。
- `Any -> Todo`: blocker が解消し、再実行可能になった。
- `Any -> Canceled`: 人間または project policy が中止を決めた。
- `Any -> Duplicate`: 重複 work item と判定した。

claim の扱い:

- project policy が controller-only claim を定義している場合、controller だけが claim を適用する。
- controller は claim 直前に work item ファイルを再読み込みし、status、labels、最新の実行ログが discovery scope と矛盾しないことを確認する。
- claim は status 変更、`agent-active` label の付与、`ready-for-agent` label の削除、`## 実行ログ` への追記をセットで扱う。
- 再読み込み時に `blocked`、`needs-human`、`agent-active`、`needs-review` など除外 label が見つかった場合は、その work item を変更せず次候補へ移る。
- claim できなかった work item を無理に作業せず、候補がなければ no-op または escalation として記録する。

人間判断が必要な場合:

- status は原則 `In Review` にする。
- label に `needs-human` を付ける。
- `## 実行ログ` に具体的な質問、選択肢、blocking reason を書く。

検証失敗または review failure の場合:

- 工程ゲートの失敗は status を `In Progress` のまま保ち、label で表す。verifier の最終検証が失敗した場合も `In Progress` に戻す（人間判断が必要な場合のみ `In Review`）。
- label に `verification-failed` または `needs-review` を付ける。
- `## 実行ログ` に failed criteria と required next action を書く。

## 状態更新権限

全エージェントが自由に status を動かしてはいけない。役割ごとに許可範囲を分ける。`CLAUDE.md` の「ループポリシー」などの project policy がより狭い権限境界を定義している場合は、必ず project policy を優先する。

- Triage: `Backlog -> Todo`、`needs-triage` / `ready-for-agent` の更新案を作成してよい。project policy が明示的に許可する場合だけ直接更新してよい。
- Triage が read-only agent として設定されている場合は、status / label / 実行ログの更新案だけを返し、controller が証拠を確認して適用する。
- Implementer: phase label、検証結果、変更したファイルの記録案を作成してよい。project policy が controller-only mutation または controller-only claim を定義している場合は、`.docs/memory` を直接更新せず controller への提案として返す。
- 工程レビュー担当（phase-reviewer）: 工程ゲートの判定（APPROVE / REJECT / ESCALATE）と、`needs-review` + `phase-*` / `verification-failed` の付与・除去を提案として返す。status は `In Progress` のまま保ち、`In Review` への遷移は提案しない。read-only のため直接の status / label 更新は行わない（適用は controller）。
- Verifier: 最終 `APPROVE` で `In Review -> Done`、`REJECT` で `In Progress` へ戻す遷移を提案として返す。read-only のため直接の status 更新は行わない（適用は controller または人間）。
- 人間 / controller: すべての状態遷移を行ってよい。

project policy が未定義の場合の安全な default:

- エージェントは実行ログと label の更新案を作成する。直接更新は、その role に明示的に許可された場合だけ行う。
- `Done`、`Canceled`、`Duplicate` への status 変更は controller または人間が適用する（read-only agent は提案のみ）。

## 実行ログの内容

各エージェントの実行ログエントリは、実際に発生した項目だけを含める。

```md
### エージェント実行 — <日付>

エージェント:
アクション:
結果: DONE | PARTIAL | APPROVE | REJECT | ESCALATE
根拠:
次:
```

工程レビューを記録する場合は、次の形式を使う。

```md
### 工程レビュー — <日付>

工程:
実行者:
レビュー担当:
判定: APPROVE | REJECT | ESCALATE
根拠:
必要な次アクション:
残るリスク:
```

状態遷移を記録する場合は、次の形式を使う。

```md
### 状態遷移 — <日付>

変更前:
変更後:
追加したラベル:
削除したラベル:
理由:
根拠:
次:
```

関連 work item、log、artifact を参照する場合は、ファイルパス・work item identifier を使う。

## レビュー観点と人間の判断・フィードバック

`## レビュー観点` と `## 人間の判断・フィードバック` は実行ログとは別の本文セクションであり、それぞれ次の形式で書く。

`## レビュー観点`（確認すべき基準のチェックリスト。計画時に設定し、phase-reviewer / verifier が照合する）:

```md
- [ ] <観点: 何を確認するか>
- [ ] <観点>
```

`## 人間の判断・フィードバック`（append-only。controller が転記する。エントリ種別をタグで区別する）:

判断エントリ（提示した選択肢からの決定）:

```md
### [判断] <NN> <論点の短い見出し> — <日付>

論点:
提示した選択肢:
決定:
理由:
```

フィードバックエントリ（選択肢提示を伴わない指摘・修正・確認・好み）:

```md
### [フィードバック] <NN> <要約> — <日付>

フィードバック:
背景:
反映方法:
```

- レビュー観点 = 何を確認すべきかの**基準**。レビューの**結果**（APPROVE/REJECT/ESCALATE）は `## 実行ログ` の工程レビューに残し、基準と結果を混在させない。
- 判断 = 提示した選択肢からの決定。フィードバック = 進め方・成果物への指摘や修正、確認、好み。両者を種別タグで分けて 1 セクションに記録する。
- 人間の判断には、エスカレーションへの人間の回答も含めてよい。既存エントリは改変・削除しない。
- フィードバックのうち特定 work item に閉じず以後の作業全般に効くものは、controller が `feedback/`（横断フィードバック）の該当 scope ファイルへ昇格させる（後述）。

## 進捗管理

work item の進捗は次の三層で管理する。

- 主進捗 = frontmatter `status`（状態機械 `Backlog → Todo → In Progress → In Review → Done`）。大きな進捗はここで表す。
- 細粒度進捗 = `## 受け入れ条件` / `## レビュー観点` のチェックボックス（`- [ ]` / `- [x]`）の消化状況。
- 一覧進捗 = `.docs/memory/index.md` の進捗ボード。controller が status 変更時に更新する。

`index.md` の形式:

```md
# work item インデックス

| id | title | status | updated |
|----|-------|--------|---------|
| 0001 | … | In Review | 2026-06-22 |
```

- `index.md`・`status`・`## 作業概要`・`## 人間の判断・フィードバック` の更新は controller が適用する。read-only サブエージェントは更新案を返すのみ。

## 横断フィードバック（feedback/）

特定 work item に閉じず、以後の作業全般に効くフィードバックは `.docs/memory/feedback/` フォルダに scope 別に蓄積し、**継続的改善**につなげる。

フォルダ構成:

- `feedback/README.md` — 索引（全エントリの id/scope/種別/status/要約）。
- `feedback/review.md` — レビュー系。phase-reviewer / verifier が読む。
- `feedback/implementation.md` — 実装系。implementer が読む。
- `feedback/research.md` — 調査系。tech-docs-searcher が読む。
- `feedback/general.md` — 全般。全指定エージェントが読む。

- 各エージェントは「自分の scope ファイル ＋ general.md」だけ読めばよい（scope はファイル位置で表す）。
- 追記・`status` 更新・README 索引の更新は controller のみが行う（append-only。既存エントリの本文は改変・削除しない）。
- work item 内のフィードバックのうち横断的に効くものを、controller が judge して該当 scope ファイルへ昇格させ、README 索引に登録する。
- 各エントリは次の形式（harness の feedback メモリ型に倣い、Why と反映方法を必ず書く）。ライフサイクルを `status` で管理する。id はフォルダ内でグローバル一意の `F<NN>`:

```md
## F01 <フィードバック要約>
- フィードバック:
- 背景（なぜ）:
- 反映方法（どう適用するか）:
- 種別: 恒常ガードレール | 一時修正 | 好み・規約 | プロセス改善
- status: active | applied | retired
- 関連改善 work item: <id または なし>
- 出典 work item: <id>
- 日付:
```

`種別` の定義:

- 恒常ガードレール — 常に適用し続ける制約（完了概念なし、`status: active` のまま）。
- 一時修正 — 特定の誤りへの一回限りの是正（反映で `applied`）。
- 好み・規約 — スタイル / 命名 / 書式などの選好。
- プロセス改善 — 進め方・ループ運用の改善（多くは改善 work item 化）。

### 継続的改善ループ（追記のたび即時トリアージ）

フィードバックを `feedback/<scope>.md` に追記したら、controller はその場で次のいずれかに振り分ける。

- 即時反映できる → 反映し `status: applied`。`反映方法` に反映先（ファイル）を記す。
- 別作業が必要 → 改善 work item を作成（label `loop-improvement`、必要に応じて `capability-expansion` / `skill-gap` / `agent-gap`）し、`status: active`、`関連改善 work item` に id を記録。完了したら `applied` に更新する。
- 不要・陳腐化 → `status: retired`、理由を `反映方法` に記し、該当 scope ファイル末尾の `## アーカイブ` 見出し下へ移す。

いずれの場合も README 索引の status を更新する。

補足:

- 「常に Y を優先」のような恒常ガードレールは完了概念がないため `status: active` のまま継続適用する（`関連改善 work item: なし`）。
- skill / prompt の大幅改訂を伴う改善は `empirical-prompt-tuning` で品質検証する。
- 改善 work item 化は、後述「振り返りと改善 work item」の状態機械（labels / 状態遷移）に従う。フィードバックはその主要な入力源の 1 つとして扱う。

## 役割ごとの挙動

- Triage: 候補 work item、優先度、readiness、人間向け確認事項、`## レビュー観点` 案、`.docs/memory` 更新提案を作成する。read-only agent として動く場合は直接更新しない。
- Explorer: findings、関連ファイル、constraints、risks、recommended next action を記録する。
- Planner: 計画とあわせて `## レビュー観点`（確認基準）の案を提示する。
- Implementer: changed files、behavior changes、実行した verification、remaining risks を記録する。
- Verifier: `## レビュー観点` と受け入れ条件に照らし、証拠とともに `APPROVE`、`REJECT`、`ESCALATE` を記録する。
- 工程レビュー担当（phase-reviewer）: 設計、テスト、実装、リファクタリング、検証工程の各工程後に、担当エージェントとは別エージェントとして `## レビュー観点` に照らして `APPROVE`、`REJECT`、`ESCALATE` を判定し、記録案を controller に返す（`.docs/memory` への記録は controller。work item 全体の最終検証は verifier）。
- Controller: `## 作業概要` の記録、対話で得た決定・フィードバックの `## 人間の判断・フィードバック` への転記、横断フィードバックの `feedback/`（該当 scope ファイル＋README 索引）への昇格、`status` 遷移、`index.md` の更新を適用する。

## 状態変更

この Skill の状態機械を default として使う。`.docs/memory/` のドキュメントまたは user request に project 固有の状態遷移ルールがある場合は、それを優先する。

安全な default:

- Agents は実行ログの追記案を作成してよい。直接追記は project policy または user request が許可している場合だけ行う。
- Agents は自分の作業を説明する links の追加案を作成してよい。直接追加は project policy または user request が許可している場合だけ行う。
- project policy または状態更新権限がその role に許可していない限り、Agents は status 移動、work item の close、owner 変更をしない。
- controller-only claim が定義されている場合、controller 以外の Agents は `agent-active` 付与や `In Progress` への遷移を直接行わない。
- Human escalation は、labels や statuses が未設定でも、最低限 `## 実行ログ` のエントリとして見える状態にする。

## 最終応答

local memory に書き込んだ後の最終応答には、次だけを含める。

- 短い結果。
- 更新した work item ファイルまたは実行ログエントリ。
- 残るリスクまたは人間の判断が必要な事項。
