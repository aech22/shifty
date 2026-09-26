# RULES.md — やってはいけないこと

## コード全般

- `DEV_MODE` はホスト名で自動判定する式（`location.hostname !== "shiftyshifty.app"`）。固定値の `true`/`false` に書き換えない
- Firebase の `set()` でコレクション全体を上書きしない（他端末データが消える）。**`subs` だけでなく `periods` も対象**（2026-09-23 に本番で期間レコードが1件消えた）
- `firebaseDB.ref('accounts').once('value')` など全件読み取りを新規追加しない

## セキュリティ

- API キー・Stripe シークレット・Webhook シークレットをコードに直書きしない
- Firebase Secrets（`functions:secrets:set`）で管理済みの値を env にハードコードしない
- `shopId` や `uid` を URL パラメータに露出させない

## UI / UX

- `input` の `fontSize` を 16px 未満にしない（iOS Safari でズームが発生する）
  - **例外は1つだけ**: シフト作成タブの「全表示」のセル（app-admin.js の `AI2` の `fullView` 分岐）。
    期間全体を1画面に収めるために行高から font を算出しており、1ヶ月期間では10px程度まで落ちる。
    2026-09-23 にユーザーが「全表示の際、フォントの縮小はok」と決めたうえでの例外で、編集は維持する。
    **iOS/iPadOS ではこのセルをタップするとフォーカス時に自動ズームが起きる**（規約の由来そのもの）。
    2026-09-23 に本番解放済み（Dev限定ではない）。
  - **CLAUDE.md の走査はこの例外を数えない**。値が変数（`fvFont`）で、走査は `fontSize:\s*(\d+)` の
    数値リテラルしか見ないため。走査の「0件」は**この1件を含まない**数字だと理解すること。
- inline style 以外の外部 CSS ファイルを追加しない（全スタイルは CSS-in-JS）
- ビルドステップを追加しない（Babel Standalone でブラウザ側トランスパイル）

## データ書き込みパターン

```js
// ✅ 正しい: 個別パスに書き込む
firebaseDB.ref(`shops/${shopId}/subs/${sub.id}`).set(sub);

// ✅ 正しい: update() でマージ
firebaseDB.ref(path).update(obj);

// ❌ 禁止: set() でコレクション全体を上書き
firebaseDB.ref(`shops/${shopId}/subs`).set(allSubs);
firebaseDB.ref(`shops/${shopId}/periods`).set(allPeriods);
```

`periods` の保存は `diffPeriodsForFlatWrite`（app-utils.js）で差分に落としてから `fbUpd` する。
購読が返る前の periods は localStorage の前回値なので、全体 `set()` は
**その端末が知らない期間を消す**（2026-09-23 の本番事故。詳細は CLAUDE.md「期間の保存」）。

`shops/{shopId}/company`（企業設定の写し）と `companies/*` はクライアントから書かない（CF 専用・ルールも .write:false）。
企業設定を店舗設定へ書き戻さないこと——保存は必ず `saveSettings`（企業が決めた項目を剥がす）を通す。

## ブランチ・デプロイ

- `main` ブランチへの直接プッシュをしない（develop → main の PR フローを守る）
- Cloud Functions のデプロイは `cd functions && firebase deploy --only functions`

## ループ動作中の禁止事項

- ユーザーに確認なく `main` ブランチへのマージ・プッシュをしない
- ユーザーに確認なく Firebase の本番データを変更しない
- ユーザーに確認なく Stripe の本番設定を変更しない
- 1回のループで複数の独立した機能を同時実装しない（1ループ＝1タスク）
