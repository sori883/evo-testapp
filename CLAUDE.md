# プロジェクトガイド

このリポジトリは、コーディングエージェントのループ（triage / explorer / implementer / phase-reviewer / verifier を controller が協調させる）を、再利用可能な agent 定義と skill として提供する。永続メモリと作業状態は **ローカルファイル（`.docs/memory`）** をバックエンドとして扱う（`$local-memory` skill を参照）。

- 可変な状態（work item、claim 状況、実行ログ、検証結果、エスカレーション）は **`.docs/memory`** に置く。アクセスは標準のファイルツール（`Read` / `Glob` / `Grep` / `Write` / `Edit`）で行い、外部サービス（MCP）には依存しない。
- 静的なルール（ループの動かし方）は、この `CLAUDE.md` の「ループポリシー」に置く。起動時に自動読み込みされるため、全エージェントが project policy として参照できる。
- ループの起動・心拍（heartbeat）は本リポジトリの定義に含めない（トリガー非依存）。controller の手起動・外部スケジューラなど、運用側が任意の手段で起動する。起動レシピは `$loop-engineering` の automation prompt 雛形を使う（メインセッションを controller として動かす）。

## ループポリシー

ループの「プロジェクトポリシー」をここで宣言的に定義する。agents / skills はこのセクションを project policy として読み、claim・書き込み境界・完了判定の根拠にする。プロジェクトに合わせて各値を調整すること。

### discovery scope（探索スコープ）

- 対象とする work item の供給源: `.docs/memory/issues/` 配下の work item ファイル（対象範囲はループ起動時の依頼または automation prompt で指定する）。
- 対象 status: `Backlog` / `Todo` のうち `ready-for-agent` ラベルが付いたもの。
- 対象外: `blocked` / `needs-human` ラベル、進行中（他エージェントが claim 済み = `agent-active`）の work item。

### claim（作業の確保）

- controller のみが work item を claim する。サブエージェントは自分で claim しない。
- claim 前に必ず work item ファイルの最新状態を再確認し、未 claim であることを確かめる。
- claim は work item ファイルの status を進める／`agent-active` ラベルを付ける等の可視な操作で表す（`$local-memory` の状態機械に従う）。
- claim できない場合は作業せず、次候補へ移るか no-op / escalation とする。

### write boundary（書き込み境界）

- `explorer` / `triage` / `phase-reviewer` / `verifier` は読み取り専用。ファイル・`.docs/memory` を変更しない（提案のみ）。`.docs/memory` の読み取りは可。
- ループ内では `implementer` のみがコードを編集する。編集は claim 済み work item のスコープ内に限定し、無関係なユーザー変更は保持する。ループ外補助の `refactor-cleaner` も controller の明示指示時に限り編集するが、これは別枠（「ループ外の補助エージェント」節を参照）である。
- `.docs/memory` の更新（work item 作成・status/label 変更・実行ログ追記）は controller（メインの Claude セッション）が、承認された変更だけを適用する。コード変更は implementer がワークツリーに反映し、無関係な変更を混ぜない。バージョン管理（VCS 操作）はループの責務に含めず、運用側がループ外で扱う。`implementer` は Write/Edit を持つが、`.docs/memory` への記録は行わず controller に提案として返す。
- read-only 役（`explorer` / `triage` / `phase-reviewer` / `verifier`）は `permissionMode: plan` で動き、mutation を適用しない。これらの役が持つ `Bash` は読み取り・検証コマンド（テスト、lint、build、ファイル内容の確認等）に限り、ファイル書き込み・状態変更には使わない。`permissionMode: plan` によりファイル書き込みは構造的に行えず、`.docs/memory` への write も同様に行えない（read は可）。

### orchestration boundary（オーケストレーション境界）

- controller（メインの Claude セッション）だけがサブエージェントを spawn する。サブエージェントには `Agent` ツールを付与しない（`tools` に含めない）。これにより、統括能力はスキルのプリロード有無ではなく `tools` で強制される。
- サブエージェントの `skills` プリロードは「そのエージェント自身が実行する手順」だけに限る。controller の統括スキル（`$loop-engineering`）はサブエージェントのコンテキストに載せない。

### triage writer（トリアージの書き手）

- `triage` は status / label / 実行ログの**更新案**を作成するのみ。
- 直接の `.docs/memory` 更新は controller が行う。triage 自身は read-only であり、`.docs/memory` を直接更新しない（更新案のみを返す）。

### write policy（書き込みポリシー / 状態更新権限）

- 役割ごとに status 遷移の許可範囲を分ける（詳細は `$local-memory` の「状態更新権限」に従う）。
- 本ポリシーが `$local-memory` の既定よりも狭い境界を定義する場合は、本ポリシーを優先する。

### completion evidence（完了の証跡）

- 主観的な完了宣言ではなく、検証可能な停止条件で Done を判断する。
- 必要な証跡: 受け入れ条件の充足、関連テスト / lint / type check / build の成功ログ。
- `verifier` が証跡付きで `APPROVE` し、各 phase の `$cross-review-gates` が通った場合のみ Done にする。
- 検証手段が無い場合は最小限の確認を行い、その限界を `.docs/memory` に記録する。

## ループ外の補助エージェント

次のエージェントはループ（triage / explorer / implementer / phase-reviewer / verifier）には含まれず、controller（メインの Claude セッション）が必要に応じて手動で呼び出す補助として位置づける。いずれも `Agent` ツールを持たず（サブエージェントを spawn しない）、orchestration boundary に従う。

- `architect` — 構造設計・技術選定・ADR（読み取り専用）。実装手順の分解は行わない。
- `planner` — 設計確定後の実装ステップ分解（読み取り専用）。構造そのものの判断はしない。設計判断が必要なら architect に先行させる。
- `tech-docs-searcher` — 最新ドキュメント調査（読み取り専用 / Web 取得）。
- `memory-searcher` — `.docs/memory` の意図・実装・レビュー観点・判断/フィードバックを検索し、出典引用付きで要約（読み取り専用）。他人が作った記録の意図を後から復元し、人への確認を減らす用途。`$memory-recall` をプリロードする。
- `refactor-cleaner` — デッドコード整理（JS/TS 向け、コード編集あり）。ループの write boundary とは別枠で、controller の明示的な指示時のみ起動する。変更はワークツリーまでとし、バージョン管理（VCS 操作）はループ外で運用側が扱う。

## ループ外の補助 skill

次の skill はループの自動工程には組み込まれず、controller が必要に応じて手動で起動する。

- `empirical-prompt-tuning` — skill / プロンプトを新規作成・大幅改訂したときの品質検証。振り返りで「能力拡張」が必要と判断されたときに使う。
- `memory-recall` — `.docs/memory` から意図・実装・レビュー観点・判断/フィードバックを問いに沿って引き出し、出典引用付きで合成する読み取り手順。`memory-searcher` がプリロードするほか、controller が直接 `.docs/memory` を想起するときにも使う。
- `skill-authoring` — 繰り返されるユーザー依頼（設計書作成・仕様説明など）を手順書 skill として切り出す軽量 authoring 手順。明示依頼または繰り返し検知で controller が起動する。
