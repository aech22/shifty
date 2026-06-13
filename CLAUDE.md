# CLAUDE.md — Shifty 一般公開版

作成日: 2026年6月  
ベース: aech22/aech22.ontheshift.io（自分用Pro版）

---

## プロジェクト概要

**Shifty** — 飲食店向けシフト提出・管理Webアプリの**一般公開版（サブスク制限付き）**。

自分用（Pro相当・制限なし）は別リポジトリで運用中。  
このリポジトリはFree/Proの2段階プラン制限を持つ一般ユーザー向け版。

---

## ファイル構成

```
/
├── index.html              ← CDN読み込み + Reactマウント + 全OS互換性設定
├── app.js                  ← アプリ全体（約3650行のReact JSX）
├── functions/
│   └── index.js            ← Firebase Cloud Functions（Stripe Webhook・決済セッション）
├── CLAUDE.md               ← このファイル
└── サブスク_プラン設計書.md ← プラン仕様
```

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フロントエンド | React 18（CDN UMD版）+ Babel Standalone（ビルド不要） |
| データベース | Firebase Realtime Database（compat版 v9.23.0） |
| Excel出力 | ExcelJS 4.4.0（CDN） |
| ホスティング | GitHub Pages |
| 認証 | Firebase Authentication（Google/Apple/メール+パスワード）+ Cookie併用 |
| 決済 | Stripe Checkout（月払いサブスク）+ Firebase Cloud Functions |
| Cloud Functions | Firebase Functions v1（asia-northeast1）+ Stripe Webhook |

### index.html CDN構成
```html
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
<script type="text/babel" src="app.js" data-presets="react"></script>
```

---

## OS・ブラウザ互換性対応（実装済み）

| OS/ブラウザ | 対応内容 |
|---|---|
| iOS Safari | ノッチ・ホームバー対応（safe-area）、inputズーム防止（font-size:16px）、-webkit-sticky、viewport-fit=cover |
| Android Chrome | タップハイライト無効化、web-app-capable |
| Windows | MSタイルカラー設定 |
| 全OS共通 | クリップボードAPI fallback（execCommand）、文字サイズ自動調整無効化 |

---

## app.js 構造

### グローバル定数・ユーティリティ（1〜246行）

```js
FIREBASE_CONFIG          // Firebase設定（要変更）
WD = ["日","月",...]     // 曜日定数
JH_FIXED / JH_DATES      // 日本の祝日（2025〜2027年）
CAND_WEEKDAY / WEEKEND   // デフォルト候補時間
TO                        // 時間オプション（9:00〜27:00、15分刻み）
fd/pd/gd/gto/idp         // 日付ユーティリティ
lg/ls                    // localStorage読み書き
timeToNum()              // 時間文字列→小数変換（Excel用）
storeKey()               // localStorageキー生成
makeShop/makePeriod/makeSettings  // 初期データ生成
genToken()               // 8文字ランダムトークン生成
buildUrl/parseUrl/resolvePeriodFromUrl  // URL操作
setCookie/getCookie/delCookie  // Cookie操作
ssGet/ssSave             // sessionStorage操作
```

### 定数・キー

```js
// Cookie
CK_SHOP = "ots_shopId"                        // 端末の店舗ID（1年間）
ckStaffKey(shopId, periodId)                  // スタッフ名（提出後保存）

// sessionStorage
SS_SHOP = "ss_shopId"    // 店舗ID（リロード復元）
SS_APID = "ss_apid"      // アクティブ期間ID
SS_VIEW = "ss_view"      // 現在の画面
SS_TAB  = "ss_tab"       // 管理者タブ
```

### URL形式

```
スタッフ用: #/s/<urlToken>   例: #/s/a3f8x2k9
管理者アクセス: ハッシュなし
旧形式互換:  #/<token>（スタッフとして処理）
```

### コンポーネント一覧

| 行 | コンポーネント | 役割 |
|---|---|---|
| 93 | `ShiftyIcon` | アプリアイコン |
| 333 | `App()` | メインアプリ・3フェーズ初期化・Auth/Cookie管理 |
| 1430 | `StaffView` | スタッフのシフト提出画面 |
| 1733 | `StaffHdr` | スタッフ画面ヘッダー |
| 1762 | `CellEditPanel` | セル編集パネル（既存データを初期値として保持） |
| 1805 | `SmModal` | 提出状況一覧（名前列固定・日付横スクロール） |
| 1940 | `AdminLogin` | 管理者ログイン画面 |
| 1972 | `AdminView` | 管理者画面（タブ切り替え） |
| 2149 | `PeriodsTab` | 期間管理・URLシェア |
| 2312 | `PEF` | 期間編集フォーム |
| 2327 | `expXl()` | ExcelJSによるExcel生成 |
| 2520 | `StaffTab` | スタッフ登録・並べ替え |
| 2676 | `CandTab` | 候補時間・休業日管理 |
| 2923 | `SubsTab` | 提出一覧・編集・変更履歴 |
| 3029 | `UnlockCodeInput` | 解放コード入力（Pro機能テスト用） |
| 3057 | `SetTab` | 設定・Cookie引き継ぎコード・企業アカウント連携 |
| 3413 | `MyPageTab` | マイページ（プラン確認・アップグレード） |
| 3560 | `UpgradeModal` | アップグレード促進モーダル |
| 3619 | `AC/AL/AT/CL` | 汎用UIパーツ（カード・ラベル・タイトル・候補リスト） |

---

## Firebaseデータ構造

```
Firebase Realtime Database
├── global/
│   ├── shops          ← 全端末共有の店舗一覧 {shopId: shopObj}
│   └── templates      ← 曜日別候補テンプレート（全店舗共有）
├── shops/
│   └── {shopId}/
│       ├── settings   ← 店舗設定（候補時間含む）
│       ├── periods    ← 期間一覧 {periodId: periodObj}
│       ├── staff      ← スタッフ一覧（文字列配列）
│       └── subs/      ← 提出データ {subId: subObj}
└── accounts/
    └── {shopId}/            ← プラン管理（shopId単位）
        ├── plan             = "free" | "pro"
        ├── planExpiry       = "2026-12-31"
        └── stripeCustomerId ← Stripe顧客ID（Customer Portal用）
    └── {uid}/               ← Firebase Auth UIDで複数店舗管理
        └── shops            ← {shopId: true} の紐付けマップ
```

### 重要: FirebaseはJavaScript配列をオブジェクトに変換する

```js
// 常に {id: data} 形式で保存
const obj = {};
items.forEach(item => { obj[item.id] = item; });
firebaseDB.ref(path).set(obj);

// 読み取り時は Object.values() で配列に変換
const arr = typeof val === "object" && !Array.isArray(val)
  ? Object.values(val).filter(s => s && s.id)
  : val.filter(Boolean);
```

### FIREBASE_CONFIGの場所

`app.js` 11行目：
```js
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  databaseURL: "https://PROJECT-default-rtdb.firebaseio.com",
  // ...
};
```
**新しいFirebaseプロジェクトの設定をここに貼り付ける。**

---

## 認証・端末管理フロー

```
アプリ起動（Phase1）
  ↓
URLに #/s/<token> あり？
  ├─ Yes → Firebaseで全店舗横断検索 → period特定
  │         → スタッフ画面固定（管理者タブ非表示）
  └─ No  → Firebase Auth 状態確認（onAuthStateChanged）
             ├─ Auth済み → accounts/{uid}/shops から店舗一覧を取得
             │              → 複数店舗なら一覧表示、1店舗なら即移動
             └─ Auth未認証 → Cookie ots_shopId を確認
                              ├─ あり → その店舗を使用（単一店舗Cookie認証）
                              └─ なし → ログイン/新規作成画面
                                          ├─ Google/Apple/メールでサインイン
                                          └─ 新規作成 → 新しい店舗を作成
```

### 企業アカウント（複数店舗管理）

Firebase Authユーザーが複数店舗を持つ場合：
- `accounts/{uid}/shops` に店舗ID一覧を保存
- 既存Cookie店舗をAuth UIDに紐付け（signInAndLink系関数）
- 招待コードで他端末の店舗を同一Authに追加（`onGenerateInviteCode` / `onJoinByInviteCode`）

---

## 3フェーズ初期化（App()の起動フロー）

```
Phase1: Firebase初期化 → global/shops をonce()で取得
        → URLトークンがあれば全店舗のperiodsを横断検索
        → shopId確定 → startSubscriptions() を直接呼ぶ
        → setReady(true)

Phase2（startSubscriptions関数）:
        確定したsidでglobal/shops・settings・periods・staff・subs
        をリアルタイム購読（on()）

Phase3 useEffect: URLなし時のapid初期化
        → sessionStorageから復元 or periodsの最新（startDate降順）
```

**重要**: Phase2はuseEffectではなくPhase1内から直接呼ぶ。
useEffect([ready, sid])に依存するとReactのバッチ処理で競合が発生するため。

---

## 書き込みルール

```js
// ✅ subs: 1件ずつ個別パスに書き込む（競合防止）
firebaseDB.ref(`shops/${shopId}/subs/${sub.id}`).set(sub);

// ✅ 配列全体の更新: update()でマージ
firebaseDB.ref(path).update(obj);

// ❌ set()で配列全体を上書きすると他端末データが消える
```

---

## サブスクリプション プラン

プランは **Free / Pro の2段階**。Pro は **1サブスク = 1店舗**。

| | Free | Pro |
|---|---|---|
| 月額 | 無料 | 500円 / 店舗 |
| 年額 | 無料 | 6,000円 / 店舗（2ヶ月分無料） |
| スタッフ数 | 20名 | 無制限 |
| 期間数 | 1 | 無制限 |
| スタッフ並べ替え | ❌ | ✅ |
| テンプレート共有 | ❌ | ✅ |
| Excel書き出し時店舗名変更 | ❌ | ✅ |
| Excelスタッフ名色選択 | ❌ | ✅ |

**複数店舗** → 店舗ごとに個別契約（Pro × 店舗数）  
**複数端末** → 店舗コードで紐付け。同じ店舗なら追加料金なし

### プラン情報のFirebase保存先（Phase1以降）
```
accounts/<shopId>/plan       = "free" | "pro"
accounts/<shopId>/planExpiry = "2026-12-31"
```

---

## 実装ロードマップ

### ✅ Phase 1（実装完了）
- [x] プラン判定ロジック追加（`accounts/<shopId>/plan`をFirebaseから読む）
- [x] Free: スタッフ数・期間数の制限チェック
- [x] Free: スタッフ並べ替えUIを無効化
- [x] Pro: テンプレート共有を有効化
- [x] Pro: Excel書き出し時の店舗名変更UI
- [x] Pro: Excelスタッフ名色選択（黒/赤）UI
- [x] 制限到達時のアップグレード促進モーダル
- [x] テスト用: `DEV_PLAN_OVERRIDE = null` → `"free"` にセットして動作確認（app.js 156行目）

### ✅ Phase 2（Firebase Authentication — 実装完了）
- [x] メール+パスワード認証（新規登録・ログイン・パスワードリセット）
- [x] Googleログイン
- [x] Appleログイン
- [x] uidとshopIdの紐付け（`accounts/{uid}/shops`）
- [x] Cookie認証との併用（Firebase Auth + Cookieどちらでも動作）
- [x] 既存Cookie店舗をAuth UIDに連携（signInAndLinkGoogle/Apple/Email）
- [x] 複数店舗管理（Authユーザーが複数店舗を持てる）
- [x] 企業アカウント招待コード（同一UIDに別端末の店舗を追加）

### ✅ Phase 3（Stripe決済 — 実装完了）
- [x] Stripe Checkout でサブスク決済ページ（店舗単位）
- [x] Firebase Cloud Functions で Webhook 受信
- [x] 決済完了 → `accounts/<shopId>/plan` を更新
- [x] キャンセル → `accounts/<shopId>/plan` を "free" に戻す
- [x] Customer Portal セッション（請求管理・解約）

### ✅ Phase 4（マイページ — 実装完了）
- [x] 現在のプラン確認（店舗ごと）
- [x] アップグレード/ダウングレード（UpgradeModal + Stripeチェックアウト）
- [x] 請求履歴（Stripeポータルへ誘導）

---

## 開発上の注意点

1. **Reactはビルド不要** — Babel StandaloneがブラウザでJSXをトランスパイル
2. **全スタイルはCSS-in-JS** — 外部CSSファイルなし、inline styleのみ
3. **input font-sizeは16px以上** — iOS Safariのズーム防止のため
4. **クリップボードAPI** — `navigator.clipboard`が使えない環境用に`execCommand`フォールバック済み
5. **shopIDは完全ランダム** — `${genToken()}${genToken()}`（16文字）でセキュリティ向上
6. **URLプレフィックス必須** — スタッフURL: `#/s/<token>`、管理者はハッシュなし

---

## 開発Tips

### プランのテスト方法
```js
// app.js 156行目
const DEV_PLAN_OVERRIDE = "free"; // "free" | "pro" | null（本番はnull）
```

### Stripe Price ID（本番）
```
pro_monthly: price_1TgTwHDjKKQsHl7LRZKClgFc  // 500円/月
```
年払いは未実装（STRIPE_PRICESに`pro_annual`を追加すれば対応可能）。

### Cloud Functions デプロイ
```bash
cd functions && firebase deploy --only functions
```
Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`（firebase functions:secrets:set で設定）

-
-
-
-
-
-
---

## Obsidianノート（自動同期）
### バグチェックログ
# Shifty バグチェックログ

自動スケジュールによるバグチェック結果の記録。

---

## Shifty バグチェックレポート（2026-06-11 自動実行）

### 修正済み
（今回の実行では修正なし）

### 要確認（未修正）

- **🟡 joinByInviteCode が全accountsを一括読み取り**（app.js:1049）
  `firebaseDB.ref('accounts').once('value')` で全ユーザーのアカウント情報を取得している。Firebaseセキュリティルールが緩い場合、全ユーザーのplan情報・招待コード・shopIDが漏洩するリスク。パフォーマンス問題にもなり得る。

- **🟡 CF_BASEが本番Cloud FunctionsのURLにハードコード**（app.js:3562）
  `DEV_MODE = true` 時でも `https://asia-northeast1-ontheshift.cloudfunctions.net` が使われる。テスト中に本番Stripeセッションを誤作成するリスク（devプロジェクトのshopIdでは実際の決済は成立しない見込み）。

- **🟢 AppleログインのデッドコードUIから削除済み**（app.js:776-808, 908-920）
  最新コミットでAppleログインUIが削除されたが、`signInWithApple`・`signInAndLinkApple` 関数が残存。

- **🟢 DEV_MODE=true → main マージ時の手動対応が必要**
  GitHub Actionsに develop→main のDEV_MODE自動変更ワークフローなし。マージ前に手動で `false` に戻す必要がある。

### 異常なし
クリティカル（🔴）な問題はなし。直近コミットのAppleログイン削除は意図的な変更と確認。

---

## Shifty バグチェックレポート（2026-06-12 自動実行）

### 修正済み
（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:776-808, 908-920）
  AppleログインUIは削除済みだが、`signInWithApple`・`signInAndLinkApple` 関数が残存。動作に影響はないが将来的に削除推奨。

- **🟢 DEV_MODE = true（develop ブランチのため意図的）**（app.js:12）
  main マージ前に手動で `false` に変更が必要。

- **🟢 iOS Safari ズーム防止: fontSize:12 の input**（app.js:2095）
  管理者ヘッダーの「コードで追加」入力欄が `fontSize:12`。iOS Safariでズームが発生する可能性。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:3674）
  `AI` スタイル定数（管理者フォーム全般）が `fontSize:14`。PEF期間編集・xlShopName入力等に使用。管理者画面のみの影響。

### 前回から改善された点
- `joinByInviteCode` が `accounts` 全件読み取り → `inviteCodes/${code}` 個別読み取りに修正済み ✓
- `CF_BASE` が `DEV_MODE` に応じて dev/prod 正しく切り替わっている ✓

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。

---

## Shifty バグチェックレポート（2026-06-13 自動実行）

### 修正済み

- **🟡 sc()関数が{closed:true}アイテムと時間候補混在時にTypeErrorでクラッシュ**（app.js:224）
  休業日を設定済みの曜日/日付に時間候補を追加しようとするとソート処理がクラッシュ。closedアイテムを末尾に固定するガード処理を追加。

- **🟡 StaffTab: setNewAlias未定義によりProユーザーが別名パネルを開けない**（app.js:2643）
  別名ボタンのonClickでsetNewAlias（コンポーネント内で未定義）を呼び出していた。TypeError発生により別名パネルが一切開かなかった。不要なsetNewAlias("")呼び出しを削除。

- **🟢 AdminView: 店舗削除ハンドラでcurrentShopIdRef（スコープ外）を参照しTypeError**（app.js:2129）
  削除後の処理でcurrentShopIdRefを直接参照していたが、AdminViewスコープでは未定義。setCurrentShopId propsが既にref更新を内包しているため冗長な行を削除。削除完了トーストが表示されなかった問題を解消。

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:776-808, 908-920）
  AppleログインUIは削除済みだが関数が残存。動作に影響なし、将来的に削除推奨。

- **🟢 DEV_MODE = true（develop ブランチのため意図的）**（app.js:12）
  main マージ前に手動で false に変更が必要。

- **🟢 iOS Safari ズーム防止: fontSize:12 の input**（app.js:2095）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:3674）
  管理者フォーム全般に使用されるAIスタイル定数。管理者画面のみの影響。

### 異常なし
クリティカル（🔴）の問題はなし。中程度（🟡）2件を修正済み。

---
