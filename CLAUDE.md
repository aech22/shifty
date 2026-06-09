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
├── app.js                  ← アプリ全体（約2100行のReact JSX）
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
| 認証 | Cookie（現在）→ Firebase Authentication（Phase2予定） |
| 決済 | Stripe（Phase3予定） |

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
| 248 | `App()` | メインアプリ・3フェーズ初期化・Cookie管理 |
| 744 | `StaffView` | スタッフのシフト提出画面 |
| 1056 | `CellEditPanel` | セル編集パネル（既存データを初期値として保持） |
| 1099 | `SmModal` | 提出状況一覧（名前列固定・日付横スクロール） |
| 1249 | `AdminView` | 管理者画面（タブ切り替え） |
| 1322 | `PeriodsTab` | 期間管理・URLシェア |
| 1482 | `expXl()` | ExcelJSによるExcel生成 |
| 1659 | `StaffTab` | スタッフ登録・並べ替え |
| 1689 | `CandTab` | 候補時間・休業日管理 |
| 1935 | `SubsTab` | 提出一覧・編集・変更履歴 |
| 2008 | `SetTab` | 設定・Cookie引き継ぎコード |
| 2104 | `CL` | 候補リスト表示コンポーネント |

---

## Firebaseデータ構造

```
Firebase Realtime Database
├── global/
│   ├── shops          ← 全端末共有の店舗一覧 {shopId: shopObj}
│   └── templates      ← 曜日別候補テンプレート（全店舗共有）
└── shops/
    └── {shopId}/
        ├── settings   ← 店舗設定（候補時間含む）
        ├── periods    ← 期間一覧 {periodId: periodObj}
        ├── staff      ← スタッフ一覧（文字列配列）
        └── subs/      ← 提出データ {subId: subObj}
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
  └─ No  → Cookie ots_shopId を確認
             ├─ あり → その店舗を使用（引き継ぎ画面なし）
             └─ なし → 引き継ぎコード入力画面（unbound=true）
                         ├─ コード入力 → 既存店舗に紐付け
                         └─ 新規作成 → 新しい店舗を作成
```

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
- [x] テスト用: `DEV_PLAN_OVERRIDE = "free"` をセットして動作確認（app.js 144行目）

### ✅ Phase 2（Firebase Authentication — 実装完了）
- [x] メール+パスワード認証
- [x] uidとshopIdの紐付け
- [x] Cookie認証との併用（Firebase Auth + Cookieどちらでも動作）

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

## 最初にやること（Claude Codeへの指示例）

```
このCLAUDE.mdとapp.jsを読んで。
一般公開版としてPhase 1を実装して：

1. Firebase の accounts/<shopId>/plan を読んでプランを判定
   （存在しない場合は "free" として扱う）

2. Freeプランの制限:
   - 店舗追加: 1店舗を超えたら追加できないようにする
   - スタッフ登録: 11人目以降は登録できないようにする
   - 期間作成: 4つ目以降は作成できないようにする
   - 制限到達時はアップグレード促進モーダルを表示

3. Pro限定機能:
   - スタッフ並べ替えUIはProのみ表示
   - Excel書き出し時の店舗名変更入力欄はProのみ表示
   - Excelスタッフ名色選択（黒/赤）はProのみ表示

4. テスト用: plan = "free" をハードコードして動作確認できるようにする

FirebaseのCONFIGは後で渡すので、まずロジックだけ実装して。
```
