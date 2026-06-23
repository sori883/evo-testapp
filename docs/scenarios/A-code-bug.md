# シナリオ A — 局在コードバグ（evo は「コード修正 PR」を出す）

実際のコード欠陥を `src/` に仕込み、本物の例外 → アラーム発報 → evo がバグ関数を**コードで**修正する PR を
出す、までを再現する。バグは関数単位に局在し、既存テストが落ちる（= テストで守られている）ことを利用する。

## バグの内容

`src/handlers/todo.ts` の `getTodo` から **not-found ガードを削除**し、存在しない id で `null` を参照させる。
存在しない id への `GET /todos/{id}` は実運用でも普通に起きるため、デプロイ直後から 500 が出てアラームが発報する。

### 注入パッチ（適用すると壊れる）

```diff
   const id = requireId(event)
   const todo = await deps.repo.get(id)
-  if (!todo) {
-    throw new NotFoundError(`todo ${id} が見つかりません`)
-  }
-  return jsonResponse(200, todo)
+  // BUG(scenario-A): not-found ガードを削除した回帰。todo が null のとき下行で TypeError → 500。
+  return jsonResponse(200, { ...todo, title: (todo as { title: string }).title.trim() })
```

> このパッチを当てると `test/handlers/todo.test.ts` の「getTodo 存在しなければ NotFoundError」と
> `test/app.test.ts` の「NotFoundError は 404 に変換する」が **失敗する**。つまり CI が緑なら本来は止まる。
> ドリルでは「CI をすり抜けた悪い変更が本番に出た」想定で、ローカル適用 → 手動 `pnpm build && pnpm deploy`
> で再現する。

## 手順

1. 平常確認: `scripts/smoke.sh <ApiUrl>` → `SMOKE OK`、`scripts/alarm-state.sh` → 全 `OK`。
2. 注入: 上記 diff を適用（`feature/regression-getTodo-guard` ブランチ等）。
3. デプロイ: `pnpm build && pnpm deploy`（CI を介さない手動再現）。
4. 発報: 存在しない id を叩いて 500 を誘発しアラームを上げる。
   ```bash
   COUNT=200 METHOD=GET TARGET=/todos/does-not-exist scripts/load.sh <ApiUrl>
   ```
   数分後 `scripts/alarm-state.sh` で `sampleapp-lambda-errors` / `sampleapp-api-5xx` が `ALARM`。
5. evo: アラーム → EventBridge → 診断。CloudWatch Logs に
   `request failed (unhandled exception)` と `err.stack`（`getTodo` を指す）が残るので、evo はバグ箇所を特定し
   **ガードを復元するコード PR** を作成する。
6. 人: PR をレビューしてマージ。
7. CD: `main` push で `cdk deploy`。コードが直る。
8. 復旧確認: `scripts/smoke.sh <ApiUrl>` → `SMOKE OK`（`GET deleted -> 404` を含む）、
   `scripts/alarm-state.sh` → `OK`。

## 期待される evo の修正（参考）

注入パッチの逆 = not-found ガードの復元。修正後は「存在しない id → 404」に戻り、テストも再び緑になる。

## 別バリエーション（任意）

- `FAULT_NULL_DEREF=true` を CDK env で固定 → 変更系（create/update）で TypeError。`faults.ts` の
  局在バグをコードで無害化する PR、という形にもできる。
