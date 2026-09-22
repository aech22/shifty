# RULES.md — やってはいけないこと

## コード全般

- `DEV_MODE` はホスト名で自動判定する式（`location.hostname !== "shiftyshifty.app"`）。固定値の `true`/`false` に書き換えない
- Firebase の `set()` でコレクション全体を上書きしない（他端末データが消える）
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
```

## ブランチ・デプロイ

- `main` ブランチへの直接プッシュをしない（develop → main の PR フローを守る）
- Cloud Functions のデプロイは `cd functions && firebase deploy --only functions`

## ループ動作中の禁止事項

- ユーザーに確認なく `main` ブランチへのマージ・プッシュをしない
- ユーザーに確認なく Firebase の本番データを変更しない
- ユーザーに確認なく Stripe の本番設定を変更しない
- 1回のループで複数の独立した機能を同時実装しない（1ループ＝1タスク）
