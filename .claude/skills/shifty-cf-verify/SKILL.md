---
name: shifty-cf-verify
description: Shifty の Cloud Functions（functions/index.js）を変更したときに、本物のコードをNodeで実行して検証する。dev プロジェクト（thirty-dev-b6958）は Spark プランで **Functions をデプロイできず**、RTDB エミュレータも Java 未導入で動かないため（2026-09-16 時点の環境。Blaze 化・Java 導入で状況が変われば、この説明とリポジトリ CLAUDE.md の両方を直す）、「実機で確かめられない＝未検証のまま出す」か「ロジックを手で書き写して合成データに当てる（写し間違いを検出できない）」になりがちで、実際に CLAUDE.md に複数回その申し送りが残っている。このスキルは firebase-functions / firebase-admin / stripe / nodemailer をモックへ差し替えて **functions/index.js そのもの** を読み込み、onCall・onRequest・pubsub.onRun のハンドラをメモリ上のRTDBに対して実行する。Stripe Webhook の分岐・課金エンドポイントの権限判定・企業アカウント系 Callable・スケジュール削除（purgeInactiveShops / purgeOldPeriods）の検証で使う。ブラウザ側（React・UI・スタッフ画面）の検証は shifty-e2e-verify、app-utils.js の純粋関数は `npm test` の領分。
---

# Shifty Cloud Functions の実行検証（エミュレータ無し）

`functions/index.js` は**本物のまま実行できる**。必要なのは外部依存4つ（firebase-functions / firebase-admin / stripe / nodemailer）を差し替えることだけで、デプロイも Java も Firebase プロジェクトも要らない。

```bash
node .claude/skills/shifty-cf-verify/scripts/example-company-owner.js      # Callable（企業連携の権限分岐）
node .claude/skills/shifty-cf-verify/scripts/example-purge-old-periods.js  # pubsub.onRun（期間の自動削除・dry-run）
```

どちらも `pass N / fail 0` で終わり、失敗があれば終了コード1を返す。**作業ディレクトリはどこでもよい**（依存はすべてモックなので `functions/` の node_modules に依存しない）。

**ただし、読む index.js の場所は cwd では決まらない。** `cf-harness.js` は**メインのリポジトリの絶対パス**（`REPO` 定数）を直書きしており、`loadFunctions()` の既定はその `functions/index.js` を読む。リポジトリ CLAUDE.md の並行編集ルールや shifty-e2e-verify 0.5節に従って **git worktree で隔離して作業しているときは、既定のままだと「編集していない方の index.js」を検証して全項目パスする**（自分の変更を一度も実行しないまま緑になる）。worktree で編集したものを検証するときは `indexPath` に worktree 側のフルパスを必ず渡す。

```js
const h = loadFunctions({ indexPath: "/Users/hiroshi/Documents/Claude Code/<worktree名>/functions/index.js", data });
```

## 使い方

```js
const { loadFunctions, callFn, callHttp, callRun, makeChecker } = require("./cf-harness.js");

const h = loadFunctions({ data: { shops: { s1: { owners: { u1: "KEY" } } } } });
const r = await callFn(h.fns.claimCompanyShop, { companyId: "-Nc", shopId: "s1" }, { uid: "u1" });
//    r = { ok:true, res:{...} } または { ok:false, code:"permission-denied", msg:"..." }
h.db.get("shops/s1/owners/u1");   // 実行後のDBを読む
h.db.put("shops/s1/owners", null); // 実行前にDBを直接いじる
```

| 呼ぶもの | ヘルパー | 返り値 |
|---|---|---|
| `https.onCall` | `callFn(fn, data, {uid, provider})` | `{ok, res}` / `{ok:false, code, msg}` |
| `https.onRequest` | `callHttp(fn, {method, body, headers, rawBody})` | `{status, body, headers}` |
| `pubsub.onRun` | `callRun(fn)` | `{ok, res}` |

`loadFunctions` のオプション: `data`（初期DB）・`stripe`（Stripeスタブ）・`verifyIdToken`（IDトークン検証の差し替え）・`env`（モジュール読み込み時に読む環境変数）・`indexPath`（別バージョンの index.js を読む＝下記の反証確認用）。
返り値には `fns`（エクスポート一式）・`db`（`get` / `put` / `dump` / `reset`）・`mails`（nodemailer が送ろうとしたメール）・`customTokens`（発行されたカスタムトークン）が入る。

## 踏む罠

1. **モックのDBはセキュリティルールを一切評価しない。** Admin SDK と同じで素通りする。したがってこのハーネスで確かめられるのは**関数の中の権限判定**（`assertCompanyMember`・`verifyShopOwner`・`owners[uid]` の照合）だけで、`database.rules.json` の検証にはならない。**ルールの検証手順はこのスキルにも shifty-e2e-verify にも無い**——実クライアント（ブラウザ）から実際に読み書きして拒否/許可を見るか、認証トークン付きの REST で叩く（リポジトリ CLAUDE.md に「REST実測」の先例がある）。shifty-e2e-verify 1.6節は Firebase へ1バイトも出さない仕組みなので、ルール検証には**使えない**。
2. **「素通りするテスト」になっていないかを毎回確かめる。** `indexPath` に修正前の index.js を渡して**落ちること**を見る。`functions/index.js` は Stop フックの自動コミット対象外（対象は `app-*.js` の5本だけ）なので、**修正をコミットする前なら** `git show HEAD:functions/index.js > /tmp/index-pre.js` がそのまま「修正前」になる。コミット済みなら `git show <修正前のコミット>:functions/index.js` を使う。`git` コマンドはリポジトリ内で打つ（cwd 自由なのはハーネスだけ）。
   ```js
   const pre = loadFunctions({ indexPath: "/tmp/index-pre.js", data: {...} });
   // 新しい期待値に対して pre が落ちることを確認してから、修正後で通す
   ```
   **pre が落ちなかったらテストを疑う前に採取時点を疑う。** まず `diff /tmp/index-pre.js functions/index.js` を取り、同一なら「修正前」を採り損ねている（コミット済み・worktree 違い）。差分があるのに落ちないときに初めて、テストが何も検証していない疑いへ進む。
3. **`Date.now()` を使う関数は実時刻で動く。** `purgeOldPeriodsCutoff` のように「今から36ヶ月前」を計算するものは、テストデータ側の日付を**実行時刻からの相対**で作る（固定日付を書くと数ヶ月後に静かに落ちる）。
4. **モジュール読み込み時に決まる定数は後から変えられない。** `PURGE_OLD_PERIODS_DRY_RUN` はソース直書きの `const` なので、dry-run を外した挙動を試すには `indexPath` に書き換えた写しを渡す。環境変数で決まるものは `env` オプションで渡せる。
5. **Stripe を使う関数はスタブを渡さないと落ちる**（「stripe を使う関数を呼ぶなら…」というエラーが出る）。Webhook の検証では `constructEvent` を差し替えて任意のイベントを流し込む形にする。
6. **`callHttp` の `rawBody`** は署名検証を通す関数（`stripeWebhook`）で要る。省略すると `body` の JSON 文字列が入る。
7. **モックに無い API・依存で落ちたら、ロジックの書き写しへ退行しない。** DBモックは `functions/index.js` が現に使う API（`once` / `set` / `update` / `remove` / `push` / `orderByChild().equalTo()`）だけを実装しているので、`transaction()` や新しい npm 依存が増えると `TypeError` や `Cannot find module` で落ちる。そのときは `cf-harness.js` のモックに不足分を足す（このスキルの存在理由は「本物のコードを動かす」ことなので、ロジックを手で書き写して合成データに当てる形に戻ってはいけない）。足せない事情があるなら、その関数を**「未検証」と明記して報告する**（検証したことにしない）。
8. **自作のテストは `scripts/` に置く。** 「使い方」のスニペットは `require("./cf-harness.js")` の相対参照なので、別の場所に置くならフルパスで require する。

## 何を確かめたか書けること

このハーネスは「動かした」ではなく「どの分岐を通したか」を出せる。**関数の権限分岐は表にして、拒否側（permission-denied / failed-precondition）も必ず1項目ずつ通す**——実装のバグは許可側ではなく拒否側に出る。`example-company-owner.js` が雛形で、許可2件に対して拒否5件を並べている。

## 守備範囲の外

- **RTDB のセキュリティルール**（上記の罠1。実クライアントまたは REST の実測が要る）。
- **実際のStripe・SMTPとの通信**。スタブの先は検証しない。
- **デプロイの成否**。`firebase deploy --only functions --project ontheshift` は本番だけで、このスキルは出す前の検証に限る。
