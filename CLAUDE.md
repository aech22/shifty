# CLAUDE.md — Shifty

作成日: 2026年6月（コードベースから自動生成）

---

## プロジェクト概要

**Shifty** (`shiftyshifty.app`) — 飲食店向けシフト提出・管理 Web アプリの一般公開版。  
スタッフは URL を開くだけで希望シフトを提出できる。管理者は提出状況を確認し Excel で出力できる。  
Free / Pro の 2 段階プラン制。Pro は Stripe サブスク（500円/月・店舗単位）。

---

## アーキテクチャ

| 項目 | 内容 |
|---|---|
| フロントエンド | React 18（CDN UMD）+ Babel Standalone（ビルドステップ不要） |
| データベース | Firebase Realtime Database（compat版 v9.23.0） |
| 認証 | Firebase Authentication（Google / Apple / メール+パスワード）+ Cookie 併用 |
| 決済 | Stripe Checkout（月払いサブスク） |
| バックエンド | Firebase Cloud Functions v1（asia-northeast1） |
| ホスティング | GitHub Pages（`main` ブランチ = 本番、`develop` = 開発） |
| Excel出力 | ExcelJS 4.4.0（CDN） |
| 分析 | PostHog（`ph()` ヘルパー経由） |

### 2つの Firebase プロジェクト

```
DEV_MODE = true  → thirty-dev-b6958（開発用）  ← develop ブランチ
DEV_MODE = false → ontheshift（本番）            ← main ブランチ
```

`CF_BASE`（Cloud Functions エンドポイント）も `DEV_MODE` に連動して切り替わる（[app.js:3744](app.js)）。

---

## ファイル構成

```
/
├── index.html          ← CDN 読み込み・PWA meta・OGP・Babel mount
├── app.js              ← アプリ全体（約3850行の React JSX）
├── functions/
│   └── index.js        ← Firebase Cloud Functions（Stripe・メール送信）
├── RULES.md            ← やってはいけないこと（必読）
├── firebase.json       ← Firebase Hosting / Functions 設定
├── database.rules.json ← Firebase セキュリティルール
├── CNAME               ← shiftyshifty.app
└── scripts/
    └── stripe-setup.js ← Stripe Price ID 確認スクリプト
```

---

## app.js 構造（行番号は現在のコード基準）

### 1〜35行: Firebase 設定

```js
const DEV_MODE = true;            // develop=true / main=false
const FIREBASE_CONFIG_PROD = {...} // ontheshift プロジェクト
const FIREBASE_CONFIG_DEV  = {...} // thirty-dev-b6958 プロジェクト
const FIREBASE_CONFIG = DEV_MODE ? FIREBASE_CONFIG_DEV : FIREBASE_CONFIG_PROD;
```

### 40〜105行: Firebase 初期化ヘルパー

```js
firebaseDB       // firebase.database() インスタンス（グローバル）
firebaseAuth     // firebase.auth() インスタンス（グローバル）
firebaseFunctions // firebase.app().functions("asia-northeast1")
firebaseEnabled  // 接続状態フラグ
fbPath(shopId, key) // "shops/{shopId}/{key}" パス生成
fbSet(path, val)    // 書き込み（ほぼ未使用、fbW を使う）
fbOn(path, cb)      // リアルタイム購読
ph(event, props)    // PostHog イベント送信
```

### 118〜180行: 定数

```js
WD = ["日","月","火","水","木","金","土"]
JH_FIXED / JH_DATES   // 日本の祝日（2025〜2027）
DEFAULT_PW = "admin1234"
_LA_KEY / _LL_KEY      // ログイン試行ロック（10回・30分）
DEV_PLAN_OVERRIDE = null // "free"|"pro"|null。テスト時のみ変更
UNLOCK_HASH / UNLOCK_HASH_TEMP / UNLOCK_CODE_TEMP_EXPIRY // Pro解放コード
PLAN_LIMITS = { free: {staff:20, periods:1}, pro: {staff:Infinity, periods:Infinity} }
```

### 202〜265行: ユーティリティ

```js
fd(d)            // Date → "YYYY-MM-DD"
pd(s)            // "YYYY-MM-DD" → Date
gd(s, e)         // 開始〜終了の日付文字列配列
gto()            // 時間オプション 9:00〜27:00（15分刻み）→ TO 定数
idp(d)           // 期限切れ判定
lg(k, fb)        // localStorage 読み取り（JSON.parse + fallback）
ls(k, v)         // localStorage 書き込み（JSON.stringify）
sc(cs)           // 候補時間ソート（closed は末尾に固定）
timeToNum(t)     // "HH:MM" → Excel用小数（例: "10:30" → 10.5）
isWeekend(dateStr) // 土日祝判定
storeKey(shopId, key) // localStorage キー生成
genToken()       // 8文字ランダムトークン（URLトークン・招待コード用）
genSecureId(len) // 24文字強力ランダムID（shopId用）
isSpacer(n)      // "__spacer__" 区切り判定
buildUrl(shops, shopId, period) // スタッフ用URL生成（#/s/<token>）
parseUrl()       // URL解析（{type:"staff", token}）
resolvePeriodFromUrl(shops, allPeriods) // URLトークン→period解決
```

### 316〜338行: Cookie / SessionStorage キー

```js
CK_SHOP = "ots_shopId"              // 現在の店舗ID（1年Cookie）
ckStaffKey(shopId, periodId)        // スタッフ名Cookie
SS_SHOP / SS_APID / SS_VIEW / SS_TAB // sessionStorage キー
THEME_KEY = "ots_theme"             // テーマ設定（localStorage）
```

### 349〜1547行: App() コンポーネント（メインアプリ）

主要 state 変数：

| state | 型 | 説明 |
|---|---|---|
| `shops` | Shop[] | 現在のセッションで管理中の店舗（通常1件） |
| `allLinkedShops` | Shop[] | Auth UIDに紐付いた全店舗（企業アカウント用） |
| `currentShopId` | string | 現在アクティブな店舗ID |
| `currentShopIdRef` | Ref | 非同期処理内で最新shopIdを参照するためのRef |
| `authUser` | FirebaseUser\|null | Firebase Auth ユーザー（null=未ログイン） |
| `authChecked` | bool | onAuthStateChanged 初回完了フラグ |
| `view` | "staff"\|"admin" | 現在の画面 |
| `apid` | string | アクティブ期間ID |
| `urlLocked` | bool | URLにtokenがある場合true（スタッフ専用モード） |
| `urlResolved` | bool | Phase3完了フラグ |
| `unbound` | bool | 店舗未紐付け状態（ログイン画面を表示） |
| `plan` | "free"\|"pro" | 現在のプラン |
| `planExpiry` | string\|null | プラン有効期限（"YYYY-MM-DD"） |
| `paymentFailed` | bool | 決済失敗フラグ |
| `settings` | Settings | 店舗設定 |
| `periods` | Period[] | 期間一覧（startDate降順ソート済み） |
| `staffList` | string[] | スタッフ名一覧 |
| `subs` | Sub[] | 提出データ一覧 |
| `globalTemplates` | Template[] | 全店舗共有テンプレート（global/templates） |
| `inviteCodeDisplay` | string\|null | 企業招待コード表示用 |
| `syncStatus` | "init"\|"online"\|"offline"\|"no_config" | Firebase接続状態 |

主要関数：

| 関数 | 説明 |
|---|---|
| `startSubscriptions(targetSid, shopList)` | Firebase の5パス（settings/periods/staff/subs/accounts）をリアルタイム購読開始。Phase1から直接呼ぶ（useEffectに入れると競合） |
| `saveSettings / savePeriods / saveStaff / saveSubs / saveShops` | Firebase + localStorage 二重書きラッパー |
| `fbW(path, val)` | App内の Firebase 書き込みショートハンド |
| `touchLastActivity()` | 最終更新日時を記録（1年未更新店舗の自動削除に使用） |
| `signInWithGoogle() / signInWithEmail() / signUpWithEmail()` | ログイン画面からの認証 |
| `signInAndLinkGoogle() / signInAndLinkEmail()` | Cookie認証中ユーザーが Auth アカウントと店舗を紐付け |
| `linkProvider(type) / unlinkProvider(providerId)` | 既存AuthユーザーにGoogle/メールを追加/解除 |
| `sendEmailOtp() / verifyAndLinkEmail()` | OTP経由メール連携（Cloud Function呼び出し） |
| `doLogout()` | セッションのみクリア（Firebase Auth は維持） |
| `doFullSignOut()` | Firebase Auth 含む完全サインアウト |
| `generateInviteCode()` | 企業アカウント招待コード生成（24時間有効） |
| `joinByInviteCode(code)` | 招待コードで他ユーザーの企業アカウントに参加 |
| `applyInviteCode()` | 店舗コード（shopId）で端末を店舗に紐付け |
| `createNewShop()` | 新規店舗作成（global/shops に追加） |
| `linkExistingShopToAuth(shopId)` | 既存店舗を Auth UIDに紐付け |
| `unlinkShopFromAuth(targetShopId)` | 企業アカウントから店舗の紐付けを解除 |
| `refreshAuthUser()` | authUser.providerData を最新状態にリフレッシュ |

### 3フェーズ初期化

```
Phase1 (useEffect[]) — Firebase初期化 → onAuthStateChanged → loadShops()
  → URLトークンあり: 全店舗periodを横断検索 → shop/period確定 → startSubscriptions()
  → Auth済み:        accounts/{uid}/shops → setAllLinkedShops → startSubscriptions()
  → Cookie:          CK_SHOP → startSubscriptions()
  → なし:            setUnbound(true) → ログイン画面

Phase2 (startSubscriptions関数) — sid確定後にuseEffectを経由せず直接呼ぶ
  → global/templates, shops/{sid}/settings, periods, staff, subs
  → accounts/{sid}/plan, planExpiry, paymentFailed をリアルタイム購読

Phase3 (useEffect[ready, periods, urlResolved]) — URLなし時のapid初期化
  → sessionStorage復元 or periods[0]（最新期間）
```

**重要**: `startSubscriptions` は `useCallback` で定義してあるが、`useEffect([ready, sid])` に依存させてはいけない。React のバッチ処理で sid/ready の更新タイミングがズレて競合が発生する。Phase1内から直接呼ぶこと。

---

## コンポーネント一覧

| コンポーネント | 行 | 役割 |
|---|---|---|
| `App()` | ~349 | メインアプリ・3フェーズ初期化・全 state 管理 |
| `StaffView` | ~1552 | スタッフのシフト提出画面 |
| `StaffHdr` | ~1733 | スタッフ画面ヘッダー（期間選択） |
| `CellEditPanel` | ~1762 | 提出状況ビュー内のセル編集（既存データを初期値） |
| `SmModal` | ~1805 | 提出状況一覧（名前列固定・日付横スクロール） |
| `AdminLogin` | ~2062 | 管理者ログイン（パスワード認証・ロック機能） |
| `AdminView` | ~2100 | 管理者画面（タブ切り替え） |
| `PeriodsTab` | ~2215 | 期間管理・URL シェア |
| `PEF` | ~2446 | 期間編集フォーム |
| `expXl()` | ~2461 | ExcelJS による Excel 生成 |
| `StaffTab` | ~2520 | スタッフ登録・並べ替え・別名設定 |
| `CandTab` | ~2676 | 候補時間・休業日管理 |
| `SubsTab` | ~2923 | 提出一覧・セル編集・変更履歴 |
| `UnlockCodeInput` | ~3029 | Pro 機能解放コード入力 |
| `SetTab` | ~3057 | 設定・Cookie引き継ぎ・企業アカウント連携 |
| `MyPageTab` | ~3599 | マイページ（プラン確認・アップグレード） |
| `UpgradeModal` | ~3748 | アップグレード促進モーダル（Stripe Checkout 呼び出し） |
| `AC / AL / AT / CL` | ~3807 | 汎用UIパーツ（カード・ラベル・タイトル・候補リスト） |

---

## Firebase データ構造

```
Firebase Realtime Database
├── global/
│   ├── shops          ← 全端末共有の店舗一覧 {shopId: shopObj}
│   └── templates      ← 曜日別候補テンプレート（Proプランのみ利用可能）
├── shops/
│   └── {shopId}/
│       ├── settings   ← 候補時間・スタッフ色・別名・Excel設定など
│       ├── periods    ← 期間一覧 {periodId: periodObj}
│       ├── staff      ← スタッフ名一覧（文字列配列）
│       ├── lastActivity ← ISO文字列（1年未更新で自動削除対象）
│       └── subs/      ← 提出データ {subId: subObj}
├── accounts/
│   └── {shopId}/            ← プラン管理（shopId単位）
│       ├── plan             = "free" | "pro"
│       ├── planExpiry       = "YYYY-MM-DD"
│       ├── stripeCustomerId ← Stripe Customer Portal 用
│       └── paymentFailed    = true（決済失敗時）
│   └── {uid}/               ← Firebase Auth UIDで複数店舗管理
│       ├── shops            ← {shopId: true} 紐付けマップ
│       ├── inviteCode       ← {code, createdAt, expiresAt, createdBy}
│       └── members/         ← {uid: {email, joinedAt, role:"member"}}
├── inviteCodes/
│   └── {code}           ← {uid, expiresAt}（企業招待コード）
└── email_otps/
    └── {uid}            ← {code, email, emailLink, expiry}（OTP）
```

### Firebase 書き込みルール（最重要）

```js
// ✅ subs: 個別パスに書き込む（競合防止）
firebaseDB.ref(`shops/${shopId}/subs/${sub.id}`).set(sub);

// ✅ コレクション更新: update() でマージ
firebaseDB.ref(fbPath(sid, "periods")).set(periodsObj); // periods は全体set OK
firebaseDB.ref(fbPath(sid, "subs")).update(subsObj);    // subs は必ず update

// ❌ 禁止: subs を set() で全体上書き → 他端末の提出が消える
firebaseDB.ref(`shops/${shopId}/subs`).set(allSubs);

// ❌ 禁止: accounts 全件読み取り
firebaseDB.ref('accounts').once('value');
```

---

## データ型

```ts
// 店舗
Shop = { id: string, name: string, createdAt: string, lastActivity: string }

// 期間
Period = { id: string, urlToken: string, shopId: string, label: string,
           startDate: string, endDate: string, deadlineDate: string, createdAt: string }

// 提出
Sub = { id: string, periodId: string, staffName: string, shopId: string,
        shifts: {[date: string]: {status:"work"|"holiday", start?:string, end?:string}},
        comment: string, submittedAt: string, updatedAt?: string, isUpdated?: boolean }

// 候補時間
Cand = { start: string, end: string } | { closed: true }

// 設定
Settings = { shopId, password, candidates: Cand[], weekdayCandidates: {[dow]: Cand[]},
             dateCandidates: {[date]: Cand[]}, templates: Template[],
             xlShopName?: string, staffColors?: {[name]: "red"|"black"},
             staffAliases?: {[registered]: string[]}, periodUnit?: "2week"|"1month" }
```

---

## 企業アカウント（companyLink）の仕組み

1. **Firebase Auth ユーザー**が店舗を作成すると `accounts/{uid}/shops/{shopId} = true` に紐付け
2. 複数端末から同じ Google/Apple/メールでログインすると、`allLinkedShops` に全店舗が入る
3. 企業招待コード（`generateInviteCode`）:
   - `inviteCodes/{8文字トークン} = {uid, expiresAt}` を書き込む（24時間有効）
   - 別ユーザーが `joinByInviteCode(code)` で参加:
     - `accounts/{招待主uid}/members/{自分のuid}` に追記
     - `accounts/{招待主uid}/shops` の内容を自分の shops にコピー
4. **店舗切り替え**: `onSwitchToShop(id)` → `startSubscriptions(id)` を shopList なしで呼ぶ（既存の shops リストを維持しつつ購読先だけ切り替え）
5. `doLogout()` はセッションのみクリア（authUser・allLinkedShops は維持）
6. `doFullSignOut()` は Firebase Auth も含む完全サインアウト

---

## Cloud Functions（functions/index.js）

| 関数 | トリガー | 説明 |
|---|---|---|
| `createCheckoutSession` | POST `/createCheckoutSession` | Stripe Checkout セッション作成 |
| `stripeWebhook` | POST `/stripeWebhook` | Webhook受信（plan更新・失敗フラグ・キャンセル） |
| `createPortalSession` | POST `/createPortalSession` | Stripe Customer Portal セッション |
| `sendEmailOtp` | Callable `sendEmailOtp` | メール連携用OTP送信 |
| `verifyEmailOtp` | Callable `verifyEmailOtp` | OTP検証 |
| `sendSurveyEmails` | POST `/sendSurveyEmails` | ユーザーアンケート一斉送信（要秘密トークン） |

### Stripe Webhook イベント処理

| イベント | 処理 |
|---|---|
| `checkout.session.completed` / `invoice.payment_succeeded` | `accounts/{shopId}/plan = "pro"` + `planExpiry` 更新 |
| `invoice.payment_failed` | `accounts/{shopId}/paymentFailed = true` |
| `customer.subscription.deleted` | `accounts/{shopId}/plan = "free"` |

### Secrets（firebase functions:secrets:set で設定済み）

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SMTP_USER
SMTP_PASS
SURVEY_SEND_TOKEN
```

---

## デプロイ

### フロントエンド（GitHub Pages）

```bash
# develop での開発 → main へマージ（PRフロー）
git push origin develop
# PR 作成 → DEV_MODE を false に変更してから main にマージ
```

**マージ前チェックリスト**:
- [ ] `DEV_MODE = false` になっているか（app.js 12行目）
- [ ] `DEV_PLAN_OVERRIDE = null` になっているか（app.js ~171行目）

### Cloud Functions

```bash
cd functions
firebase deploy --only functions
```

---

## 開発時の注意点

### ブランチと DEV_MODE

- `develop`: 常に `DEV_MODE = true`（DEV Firebase に接続）
- `main`: 常に `DEV_MODE = false`（本番 Firebase に接続）
- `CF_BASE` も `DEV_MODE` に連動して自動切り替わる（app.js 3744行目）

### プランのテスト

```js
// app.js ~171行目
const DEV_PLAN_OVERRIDE = "free"; // "free" | "pro" | null（本番は null）
```

### React・スタイル制約

- **ビルド不要**: Babel Standalone がブラウザでトランスパイル。`import`/`export` は使えない
- **スタイルは inline style のみ**: 外部 CSS ファイル・CSS モジュール追加禁止
- **`input` の `fontSize` は 16px 以上**: iOS Safari ズーム防止（`fontSize:14` の箇所は既知の技術負債）
- **スタイル定数**: `AI`（input）/ `AB`（primary button）/ `AD`（delete）/ `AGray`（secondary）が定義済み

### CSS カスタムプロパティ（テーマ）

```css
var(--c-bg)      /* 背景 */
var(--c-card)    /* カード背景 */
var(--c-input)   /* 入力欄背景 */
var(--c-text)    /* メインテキスト */
var(--c-text2)   /* サブテキスト */
var(--c-text3)   /* 薄テキスト */
var(--c-text4)   /* 最薄テキスト */
var(--c-border)  /* ボーダー */
var(--c-border2) /* 強めボーダー */
var(--c-shadow)  /* シャドウ */
```

### Firebase 読み書き注意点

- Firebase は JavaScript 配列を数値キーオブジェクトに変換する
- 読み取り時は常に `Object.values(val).filter(s => s && s.id)` でフィルタ
- `on()` で購読したリスナーは `activeSubsRef.current` で管理し、`startSubscriptions` 再呼び出し時に `off()` で全解除する

---

## よくある修正パターン

### 新機能に Free/Pro 制限を追加

```js
// プラン制限チェック
if (plan !== "pro") {
  onUpgrade && onUpgrade({ type: "staff", limit: PLAN_LIMITS.free.staff, plan });
  return;
}
```

### 新しい Firebase パスをリアルタイム購読に追加

`startSubscriptions` 関数の中の `on()` 呼び出しを追加する:

```js
on(`accounts/${targetSid}/newField`, val => {
  setNewState(val || defaultValue);
});
```

### 設定項目を追加

1. `makeSettings()` のデフォルト値に追加
2. `SetTab` の UI を追加
3. `onSave({...settings, newField: val})` で保存（`saveSettings` 経由）

### スタッフ画面に新しい状態を表示

`StaffView` は props として `plan` を受け取っている。`plan === "pro"` で条件分岐できる。

### トースト表示

コンポーネント内では `tt(message)` を使う。`tt` は各コンポーネントのローカル関数。  
App スコープのトーストは `appToast` state（招待コード生成エラーなど、Auth 関数から呼ぶ場合）。

### 期間の保存（periods は全体 set が安全）

```js
// OK: periods は競合リスクが低いので全体 set でよい
const obj = {};
newPeriods.forEach(p => { if (p && p.id) obj[p.id] = p; });
firebaseDB.ref(fbPath(sid, "periods")).set(obj);
```

---

## 既知の技術負債

- `signInWithApple` / `signInAndLinkApple` がデッドコードとして残存（UI削除済み、関数は残る）
- 管理者画面の `fontSize:14` / `fontSize:12` の `input` は iOS Safari ズームが発生する可能性あり（管理者のみ影響）

---

## SNS・お問い合わせ

- X（Twitter）: [@shifty_shift_](https://x.com/shifty_shift_)
- サイト: https://shiftyshifty.app

---

## 関連ドキュメント

- [RULES.md](RULES.md) — やってはいけないことのリスト（必読）
- [VISION.md](VISION.md) — プロダクトビジョン
- [BACKLOG.md](BACKLOG.md) — 機能バックログ
- [サブスク_プラン設計書.md](サブスク_プラン設計書.md) — プラン仕様詳細

---

## バグチェック最新状況

> 全履歴: `/Users/hiroshi/Documents/Obsidian Vault/Projects/Shifty/バグチェックログ.md`

<!-- BUG_CHECK_LATEST_START -->
## Shifty バグチェックレポート（2026-07-08 自動実行）

### 修正済み

- **🔴 DEV_MODE = false のまま develop ブランチにコミットされていた**（app.js:12）
  RULES.md 違反。直近コミット `5dfa299 chore: DEV_MODE=false（本番リリース用）` で `false` のまま develop に残存していた。`true` に修正してコミット・プッシュ済み（c609862）。

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5dfa299: DEV_MODE=false（本番リリース用）→ develop ブランチにあったため RULES.md 違反として修正（c609862）
- 575ea84: Free/ProプランからPremiumへのアップグレードボタン追加 → 正常
- 2cec6cd: 解放コード廃止・旧ots_unlockedキー自動削除 → 正常
<!-- BUG_CHECK_LATEST_END -->

-
---


-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
---

## Obsidianノート（自動同期）
### 2026-07-04-report
=== HEALTH REPORT ===
Mode: full
Date: 2026-07-04
Notes scanned: 0 | Topic maps: 0 | Inbox items: 0

Summary: 0 FAIL, 0 WARN, 0 PASS — NO VAULT DETECTED

This directory is a software project (Shifty), not an arscontexta knowledge
vault. There is no notes/, inbox/, ops/queue/, or self/ space to diagnose, and
the health skill's own ops/derivation-manifest.md and ops/config.yaml are empty
(pre-init / standalone invocation). All 8 diagnostic categories are inapplicable
because there are no knowledge notes, topic maps, or three-space structure.

The 707 .md files under this tree are codebase docs and plugin-cache/node_modules
files (CLAUDE.md, RULES.md, BACKLOG.md, VISION.md, .claude/commands/*, etc.), not
knowledge-graph notes with YAML frontmatter, wiki links, and MOCs. No file
carries `type: moc` frontmatter.

---

[1] Schema Compliance ............ N/A  (no notes/ vault)
[2] Orphan Detection ............. N/A  (no notes/ vault)
[3] Link Health .................. N/A  (no wiki-link graph)
[4] Description Quality .......... N/A  (no notes/ vault)
[5] Three-Space Boundaries ....... N/A  (no self/ notes/ ops/ spaces)
[6] Processing Throughput ........ N/A  (no inbox/ or queue)
[7] Stale Notes .................. N/A  (no notes/ vault)
[8] MOC Coherence ................ N/A  (no topic maps)

---

Maintenance Signals:
    No arscontexta ops/ signal directories exist (observations/, tensions/,
    sessions/, queue/). Nothing to trigger.

---

Recommended Actions:
1. If you intended to run health on a knowledge vault, cd into that vault first
   (a directory containing notes/, inbox/, and ops/), then re-run /health.
2. If you want to START a knowledge system here or elsewhere, run /setup to
   scaffold notes/, inbox/, ops/, templates, and topic maps.
3. If this was meant to be a Shifty code task, use the project's own tooling
   instead — /bug-check (app.js + functions scan), /check-dev, or /run-dev.
=== END REPORT ===

### BACKLOG
# BACKLOG.md — 実装待ち機能リスト

ループが参照するタスクリスト。
先頭のタスクから順に実装する。完了したらそのタスクを削除して次へ。

## フォーマット

```
## [優先度] タスク名

**目的**: なぜ必要か
**受け入れ条件**:
- [ ] 条件1
- [ ] 条件2
**影響範囲**: 変更するコンポーネント・ファイル
**備考**: 注意点・参考情報
```

優先度: 🔴 高 / 🟡 中 / 🟢 低

---

## プランについて

| プラン | 内容 |
|--------|------|
| **Free** | スタッフ20名・期間1件まで |
| **Pro** | スタッフ・期間 無制限 + 全機能（500円/月） |
| **Premium** | Pro の全機能 + 以下の BACKLOG 機能（価格未定） |

**このBACKLOGの機能はすべて Premium ティア向け**。  
現在の実装では `plan === "pro"` チェックで開発・テストし、本番リリース時に `plan === "premium"` へ切り替える。  
localhost での Premium テストは `?plan=premium` を URL に追加。

---

## 実装待ちタスク

---



## 🟢 企業連携内の他店舗ヘルプ表示

**目的**: 同じ企業グループ内の他店舗にヘルプで入るスタッフを、在籍店舗のシフト表に略称で表示する。
**受け入れ条件**:
- [ ] 店舗ごとに2文字の略称を設定できる（SetTab）
- [ ] 企業連携内の他店舗シフトに同じスタッフ名が登録されている場合、在籍店舗のシフト表に略称を表示する
- [ ] ランチ帯ヘルプ（出勤時間セルに略称）、ディナー帯ヘルプ（退勤時間セルに略称）を区別して表示する
- [ ] ヘルプ設定の有無に関わらず視覚的に他店舗出勤とわかる表示にする
**影響範囲**: SubsTab、SetTab、allLinkedShops を使った他店舗データ取得
**備考**: 企業連携（allLinkedShops）が設定されている場合のみ表示

---

## 🟢 企業連携内の店舗間シフト重複エラー

**目的**: 同じスタッフが同時刻に複数店舗に入っているミスを自動検知する。
**受け入れ条件**:
- [ ] 企業連携内の店舗間で、同一スタッフが同一日・重複時間帯に登録されている場合にエラー表示する
- [ ] ヘルプ設定があるのに片方の店舗にしか登録がない場合も警告する
- [ ] エラー表示は SubsTab のセルまたは行に視覚的に表示（赤枠・アイコンなど）
**影響範囲**: SubsTab、allLinkedShops を使った他店舗データ取得
**備考**: 🟢「企業連携内の他店舗ヘルプ表示」の完了後に実装する

---

## 見送り

### ⏸️ React Native（Expo）アプリ — 見送り（2026-07-04 判断）

**判断**: Web版（shiftyshifty.app）のみで継続する方針に決定。Expo アプリ化はやらない。
これに伴い、下記備考にあった「Expo 着手と同タイミングの Vite + TypeScript フル移行」も前提条件ではなくなった。
Vite + TS へのフル移行は不要。

**中間案（バグ削減）は実装済み（2026-07-04・commit `efb7c83`）**: 当初は「JSDoc 型注釈 + `tsc --checkJs`」を検討したが、app.js が `.js` ファイル内に大量の JSX を含むため tsc では解析できないと判明。代わりに **ESLint による静的検査 CI** を採用した（`@babel/eslint-parser` + `eslint-plugin-react`、`no-undef` / `react/jsx-no-undef` を error）。ビルドステップなし・配信物（app.js / index.html）のランタイムは無変更・GitHub Pages のデプロイ変更なし。Shifty で頻発してきた未定義参照バグ（`setNewAlias`・`tt`・`currentShopIdRef` 等）を push 前・CI で検出できる。設定は `eslint.config.js` / `package.json` / `.github/workflows/lint.yml`。

<details>
<summary>元のタスク内容（参考・凍結）</summary>

**目的**: shiftyshifty.app を維持しながら、iOS / Android アプリを App Store / Google Play にリリースする。年内（2026年末）に Web 版と同等機能を搭載することを目標とする。
**方針**: React Native（Expo）で新規プロジェクトを作成。Firebase・ビジネスロジックは Web 版と共有。

- Phase 1: 基盤構築（Expo 新規作成・Firebase 接続・認証・スタッフ画面・TestFlight/内部テスト配信）
- Phase 2: 管理者機能（提出一覧・期間管理・スタッフ管理・Excel出力・プラン制御・プッシュ通知）
- Phase 3: Web 版同等・ストア審査・公開

**備考**:
- Apple Developer Program（年 $99）・Google Play デベロッパー登録（$25 一回）が必要
- コンポーネントは Web 版の inline style ではなく StyleSheet で書き直す
- **Expo 着手と同タイミングで Web 版も Vite + TypeScript に移行する**構想だった（app.js が Babel Standalone のビルドレスで `import`/`export` 不可・分割不可のため）。→ Expo 見送りにより本構想も凍結。

</details>

---

## 完了済みタスク

### ✅ 退勤時間延長（残業）on/off 設定（2026-06-18）

**受け入れ条件**:
- [x] SetTab の「退勤延長設定」AC ブロックで、スタッフごとに延長時間（なし/+15〜+120分）を設定できる（Pro以上）
- [x] 延長時間は 15 分刻みで選択（settings.overtimeSettings.byStaff に保存）
- [x] calcNetWorkMinutes に overtimeMins 引数を追加。延長時間を退勤時刻に加算して計算
- [x] SubsTab の勤務時間合計・週間集計・制限チェックがすべて延長時間込みで再計算
- [x] 詳細モーダルの退勤セルに「→HH:MM（+N分）」バッジ表示、サマリーに「延長 +N分」SBバッジを追加

---

### ✅ 時間帯別出勤人数の表示（2026-06-18）

**受け入れ条件**:
- [x] SubsTab の提出一覧の下部に、1時間ごとの出勤人数ヒートマップを追加
- [x] 表示は縦に時間帯、横に日付の配置（横スクロール対応）
- [x] staffList のスペーサー位置を境界として ランチ帯 / ディナー帯 に分割表示（スペーサーなしは1テーブルで表示）
- [x] 出勤中（adjustedStart/adjustedEnd を優先した start〜end の間）のスタッフ数を1時間ごとにカウント
- [x] `status: "holiday"` のスタッフはカウントしない。提出0件・出勤0件時はパネル非表示

---

### ✅ 出退勤時間の管理者調整と自動再計算（2026-06-18）

**受け入れ条件**:
- [x] 詳細モーダルの出勤・退勤列に調整用 select を追加（提出値を上段に薄く表示）
- [x] 調整は TO（15分刻み）リストから選択、「提出値」を選ぶとクリア
- [x] 調整値未設定時は提出値をそのまま使用（既存動作を維持）
- [x] calcNetWorkMinutes が adjustedStart/adjustedEnd を優先使用するよう修正 → 統計・制限チェックが即時再計算
- [x] 調整値は shift[date].adjustedStart / adjustedEnd として保存、提出値を上書きしない

---

### ✅ 週間勤務時間の表示（前期間跨ぎ対応）（2026-06-18）

**受け入れ条件**:
- [x] SubsTab 詳細モーダルに週別（月〜日）勤務時間合計を表示
- [x] 現在期間に1日以上含まれる全週を対象
- [x] 週が前期間・次期間にまたがる場合、他の提出データも合算
- [x] 月単位合計（period.startDate の月基準）も表示
- [x] 純勤務時間（calcNetWorkMinutes）ベースで計算

---

### ✅ シフト統計パネル — 休み回数・連勤数・勤務時間合計（2026-06-18）

**受け入れ条件**:
- [x] SubsTab の各行に休日数・短日数（純勤務 < 4h）・純勤務時間合計を表示
- [x] 最大連勤数を表示（前期間データがあれば前期間末尾と合算して計算）
- [x] 前の期間データが存在しない場合は現在期間のみで計算
- [x] 純勤務時間（calcNetWorkMinutes）ベースで計算
- [x] 詳細モーダルにも出勤・休み・短日・勤務計・最長連勤のサマリーカードを追加

---

### ✅ スタッフ属性設定と勤務時間制限（2026-06-16）

**受け入れ条件**:
- [x] スタッフごとに属性（社員 / バイト / 派遣 / その他）を設定できる（StaffTab）
- [x] 属性ごとに「1日の最大勤務時間」「週の最大勤務時間」を設定できる（SetTab）
- [x] SubsTab のシフト一覧で、制限を超えているスタッフの行を赤背景・「1日超過」「週超過」バッジで強調表示
- [x] 休憩時間設定タスク完了後の純勤務時間ベースで計算する

---

### ✅ 休憩時間設定と純勤務時間の計算（2026-06-16）

**目的**: 勤務時間を「実労働時間（休憩抜き）」で表示・集計する基盤。
**受け入れ条件**:
- [x] Settings に休憩時間設定を追加（平日・土・日・祝それぞれ独立して設定可能）
- [x] 各休憩設定は「開始時刻〜終了時刻」の形式（例: 12:00〜13:00）で複数設定可能
- [x] シフトの出勤〜退勤時間が休憩時間と重なる場合、重複分を差し引いた時間を純勤務時間とする
- [x] 設定画面（CandTab）から休憩設定を追加・削除できる
- [x] 既存の勤務時間表示箇所で純勤務時間が反映される（SubsTab 一覧 + 詳細モーダル）

### RULES
# RULES.md — やってはいけないこと

## コード全般

- `DEV_MODE` を `false` のまま develop ブランチにコミットしない（develop は常に `true`）
- `DEV_MODE` を `true` のまま main ブランチにマージしない
- Firebase の `set()` でコレクション全体を上書きしない（他端末データが消える）
- `firebaseDB.ref('accounts').once('value')` など全件読み取りを新規追加しない

## セキュリティ

- API キー・Stripe シークレット・Webhook シークレットをコードに直書きしない
- Firebase Secrets（`functions:secrets:set`）で管理済みの値を env にハードコードしない
- `shopId` や `uid` を URL パラメータに露出させない

## UI / UX

- `input` の `fontSize` を 16px 未満にしない（iOS Safari でズームが発生する）
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
- `DEV_MODE` の切り替えを忘れずに main マージ前に行う
- Cloud Functions のデプロイは `cd functions && firebase deploy --only functions`

## ループ動作中の禁止事項

- ユーザーに確認なく `main` ブランチへのマージ・プッシュをしない
- ユーザーに確認なく Firebase の本番データを変更しない
- ユーザーに確認なく Stripe の本番設定を変更しない
- 1回のループで複数の独立した機能を同時実装しない（1ループ＝1タスク）

### VISION
# VISION.md — Shifty の完成形イメージ

## プロダクトの目的

飲食店のシフト提出・管理を、スタッフと店長の双方にとって「当たり前に使えるツール」にする。
専用アプリをインストールせず、URLを開くだけで使えることが最大の強み。

## 成功の定義

### ユーザー体験
- スタッフが URL を開いて 1 分以内にシフト提出できる
- 店長が全スタッフの提出状況を一覧で把握できる
- iOS Safari・Android Chrome・PC ブラウザで同一品質で動作する

### 信頼性
- データが消えない（Firebase Realtime Database による永続化）
- 複数端末から同時アクセスしても競合しない
- ページリロード後に状態が復元される

### ビジネス
- Free プランで「使える」と感じてもらい、Pro で「もっと使いたい」と思わせる
- Pro 転換率を上げる摩擦点を継続的に解消する
- チャーン（解約）の主因はバグと UX の不満 → 素早く検出・修正する

## 現在のフェーズ（2026年6月）

- Phase 1〜4（プラン制限・Auth・Stripe・マイページ）実装完了
- ユーザーアンケート送信済み（2026-06-15）
- 次フェーズ：フィードバックを基にした UX 改善 + 新機能

## ループが「完了」とみなす基準

### バグチェックループ
- Critical（🔴）バグがゼロ
- Medium（🟡）バグがゼロ
- Minor（🟢）は記録するが完了扱いにしてよい

### 機能実装ループ
- BACKLOG.md に書かれた受け入れ条件をすべて満たしている
- DEV_MODE=true で develop ブランチ動作確認済み
- コードレビューループをパスしている
- Critical/Medium バグが新規発生していない

### コードレビューループ
- RULES.md の禁止事項に違反していない
- セキュリティ上の問題がない
- パフォーマンス上の明らかな問題がない

### bug-check
---
description: Shifty の app.js と functions/index.js をスキャンして🔴🟡🟢のバグを分類・修正し、Obsidian のバグチェックログに結果を追記します。新機能実装後や定期メンテ時に使います。
---

# Shifty バグチェック・修正スキル

作業ディレクトリ: `/Users/hiroshi/Documents/Claude Code/シフト作成アプリーshifty`

---

## PHASE 0: コンテキスト読み込み

必ず最初に読む（CLAUDE.md は既に context に入っているが、以下は必要に応じて）:

- `RULES.md` → 禁止事項（Firebase set() 誤用・fontSize < 16px など）
- `VISION.md` → バグチェックループの完了基準

---

## PHASE 1: 現状把握

```bash
git log --oneline -10
git diff HEAD~1 HEAD --stat
git status
```

**前回の未修正リストを確認**:
`/Users/hiroshi/Documents/Obsidian Vault/Projects/Shifty/バグチェックログ.md` の末尾の「要確認（未修正）」セクションを読む。

---

## PHASE 2: バグ検索

### 2-A. Firebase 書き込みパターンの確認（🔴🟡）

```bash
# subs の set() 全体上書き（RULES.md 禁止）
grep -n "subs\)\.set\|\"subs\"\)\.set\|subs\`\)\.set" app.js

# 削除操作で update() を使っているパターン（今後も要チェック）
# → onSave(array.filter(...)) や saveSubs(filtered) の後に Firebase remove() が呼ばれているか確認
grep -n "\.filter(s=>s\.id!==" app.js | grep -v "//\|const fil\|staffList\|periods\|newSubs\|allC\|prevDs\|ds\b\|dates\|fil\."
```

**削除バグの確認方法**: `filter(s=>s.id!==...)` で配列を縮小したあと、Firebase の `.remove()` を呼ばずに `saveSubs()` や `onSave()` だけ呼んでいる箇所は削除がFirebaseに反映されない可能性がある。

### 2-B. プラン制限ロジックの確認（🟡）

```bash
# isPro を使っているが isPremium が正しい箇所がないか
grep -n "isPro&&\|isPro ?" app.js | grep -v "//\|color\|toggleColor\|staffColors\|drag\|alias\|spacer\|button\|span\|div\|td\|th\|style\|delete\|rename"

# Premium 機能が isPro に残っていないか確認
grep -n "plan.*pro.*premium\|pro.*plan" app.js | grep "attribute\|break\|limit\|overtime\|consec\|heatmap\|weekl\|calcNet" | head -10
```

### 2-C. Cloud Functions の確認（🟡）

```bash
# secrets の抜け漏れ
grep -n "secrets:\|SMTP_USER\|SMTP_PASS" functions/index.js

# .delete() の誤用（正解は .remove()）
grep -n "\.delete()" functions/index.js
```

### 2-D. RULES.md 違反チェック（🔴）

```bash
# DEV_MODE が誤って false になっていないか（develop ブランチは常に true）
grep -n "^const DEV_MODE" app.js

# DEV_PLAN_OVERRIDE が null 以外になっていないか
grep -n "^const DEV_PLAN_OVERRIDE" app.js
```

### 2-E. 既知の軽微問題（🟢）

以下は毎回リストに記載するが修正は任意:
- `signInWithApple` / `signInAndLinkApple` デッドコード（app.js:806, 943）
- `AI` 定数の `fontSize:14`（app.js 末尾付近）
- 管理者 input の `fontSize:12`
- `onJoinByInviteCode` デッドプロップ

---

## PHASE 3: 修正

優先度順に修正する。1件ずつ個別に修正・確認・コミットする（まとめて修正しない）。

| 優先度 | 対応 |
|-------|------|
| 🔴 | 必ず修正・コミット |
| 🟡 | 修正・コミット（1件ずつ個別コミット） |
| 🟢 | リストアップのみ（修正は任意） |

### 修正前の必須チェックリスト（誘発バグ防止）

修正を始める前に、必ず以下を実行する:

**1. 修正対象の関数・変数の全呼び出し元を洗い出す**
```bash
# 修正する関数名で grep（例: saveSubs を修正する場合）
grep -n "saveSubs" app.js
```
→ 洗い出した呼び出し元をすべてリストアップしてから修正に進む。

**2. 修正箇所の前後30行を読む**
- Edit ツールの old_string は最低20行以上のコンテキストを含める
- 変数のスコープ（props / state / ローカル変数）を確認する
- クロージャ内の変数が修正後も参照可能か確認する

**3. 関数シグネチャを変更する場合は全呼び出し元を同時に更新する**
- 引数を追加・削除する場合、grep で洗い出した全呼び出し元を同じコミットで更新する
- 1箇所だけ変えて他を放置しない

### 修正後の誘発バグ確認チェックリスト

Edit 後、コミット前に必ず確認:

```bash
# 1. DEV_MODE が変わっていないか
grep -n "^const DEV_MODE\|^const DEV_PLAN_OVERRIDE" app.js

# 2. 修正した関数の全呼び出し元が新しいシグネチャと一致しているか
#    （例: saveSubs を修正した場合）
grep -n "saveSubs(" app.js

# 3. 修正箇所で参照している変数が正しいスコープにあるか
#    （例: sid, shopId, settings など）
grep -n "const sid\|const shopId" app.js | head -5
```

追加で確認:
- `subs` を `.set()` で全体上書きしていないか
- `fontSize` が 16px 未満の input を新たに追加していないか
- 修正した行の前後で undefined / null 参照が生まれていないか

### コミットルール

```bash
git add app.js  # または functions/index.js
git commit -m "fix: [問題の概要]（ファイル名:行番号）"
git push origin develop
```

---

## PHASE 4: Obsidian 記録

**Obsidian CLI は使わない**。直接ファイルに Edit ツールで追記する。

ファイルパス: `/Users/hiroshi/Documents/Obsidian Vault/Projects/Shifty/バグチェックログ.md`

末尾の `---` の直後に以下の形式でレポートを追加:

```markdown
## Shifty バグチェックレポート（YYYY-MM-DD 実行）

### 修正済み

- **[🔴/🟡] 問題の概要**（ファイル名:行番号）
  修正内容の1行説明

### 要確認（未修正）

- **[🟢] 問題の概要**（ファイル名:行番号）
  内容と理由

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。（修正がない場合）

---
```

---

## よく出るバグパターン（参考）

### Firebase 削除が永続しないパターン（🟡）

```js
// ❌ 間違い: update()にないキーはFirebaseから消えない
saveSubs(subs.filter(s => s.id !== subId)); // リロードで復活する

// ✅ 正しい: deletedId を saveSubs に渡す
saveSubs(subs.filter(s => s.id !== subId), subId);
// または
firebaseDB.ref(`shops/${sid}/subs/${subId}`).remove();
```

### Premium 機能を isPro で表示してしまうパターン（🟡）

```js
// ❌ 間違い: Pro ユーザーにも Premium 機能が見える
{isPro && <PremiumFeatureComponent />}

// ✅ 正しい
{isPremium && <PremiumFeatureComponent />}
```

### Cloud Functions の secrets 抜け漏れ（🟡）

```js
// ❌ 間違い: SMTP_USER が secrets に入っていない
.runWith({ secrets: ["SMTP_PASS"] })

// ✅ 正しい
.runWith({ secrets: ["SMTP_USER", "SMTP_PASS"] })
```

### release-to-main
---
description: developブランチの内容をmainにマージして本番デプロイします。DEV_MODE/DEV_PLAN_OVERRIDEチェック・未コミット変更の退避・マージコンフリクト解決を含む一連の流れを自動化します。
---

# release-to-main — develop → main マージ・デプロイ

`/deploy` は main 上で直接コミット→pushするコマンド（hotfix向け）。
このコマンドは **develop の変更を丸ごと main に取り込んでリリースする**ときに使う。

---

## ステップ1: 現状把握

```bash
git status
git log main..develop --oneline
git diff main..develop --stat -- functions/
```

- develop に app.js/index.html 以外の**無関係な未コミット変更**（ドキュメント類など）がある場合は、mainへの切り替えで巻き込まれたりチェックアウト失敗の原因になるので退避する:
  ```bash
  git stash push -u -m "wip before release"
  ```
- `functions/` に差分がある場合は、後述ステップ7でユーザーに Cloud Functions の再デプロイ要否を確認する

## ステップ2: developのフラグ確認

```bash
grep -n "^const DEV_MODE" app.js
```

developでは `true` が正しい状態。`false` になっていた場合はRULES.md違反なのでユーザーに報告する（このコマンドの対象外の問題なので、報告のみで先に進めてよい）。

## ステップ3: main を最新化してマージ

```bash
git checkout main
git pull origin main
git merge develop --no-edit
```

## ステップ4: コンフリクト解決（発生時のみ）

```bash
grep -n "^<<<<<<<\|^=======\|^>>>>>>>" app.js
```

**基本方針**: developはmainより新しい変更を持ち込む側なので、単純な追加（addのみ）のコンフリクトは develop 側を採用する。ロジックが競合している場合はコードの意味を読んで判断し、どちらを採用すべきか自明でない場合はユーザーに確認してから進める。コンフリクトマーカー（`<<<<<<<` `=======` `>>>>>>>`）を残したままコミットしない。

## ステップ5: 本番用フラグに変更

```bash
grep -n "^const DEV_MODE\|^const DEV_PLAN_OVERRIDE" app.js
```

- `DEV_MODE` を `false` に変更する（Editツールで `const DEV_MODE = true;` → `const DEV_MODE = false;`）
- `DEV_PLAN_OVERRIDE` は `const DEV_PLAN_OVERRIDE = DEV_MODE ? (...) : null;` のように DEV_MODE に連動する式で定義されているのが現在の実装。式のままなら DEV_MODE=false で自動的に null になるので触らなくてよい。もし直値（`"free"` 等）で定義されているのを見つけた場合はそれ自体がバグなので `null` に修正してユーザーに報告する。

## ステップ6: コミット

```bash
git add app.js  # functions/index.js 等、他に変更があれば含める
git commit -m "..."
```

コミットメッセージには develop で取り込んだ主要コミットを箇条書きで含める（`git log main..develop --oneline` の内容を要約）。

**コミット後の最終チェック**（この2つがクリアでない限りpushしない）:

```bash
grep -n "^const DEV_MODE\|^const DEV_PLAN_OVERRIDE" app.js
git log main..develop --oneline   # 空であることを確認
```

## ステップ7: push前の確認

`main` への push は本番公開であり取り返しがつきにくい操作。RULES.md でも「main への直接プッシュをしない（develop → main の PR フローを守る）」とされているため、原則ユーザーに確認する。

ただしユーザーが今回のコマンド実行や直前の指示で「pushして」「デプロイして」等、明示的に本番反映を指示している場合は、確認を挟まずそのまま進めてよい。指示が曖昧な場合（例:「マージだけしておいて」）は push 前に必ず一言確認する。

`functions/` に差分があった場合は、ここで `cd functions && firebase deploy --only functions` の実行要否もあわせて確認する。

## ステップ8: push

```bash
git push origin main
```

GitHub Pages が `main` を自動デプロイする（反映まで数分）。

## ステップ9: developに戻す

```bash
git checkout develop
git stash pop   # ステップ1で退避した場合のみ
```

## ステップ10: 完了報告

以下を簡潔にまとめて報告する:
- マージしたコミット数と主な内容
- コンフリクトの有無と解決内容（あれば）
- DEV_MODE / DEV_PLAN_OVERRIDE の最終確認結果
- push結果とコミットハッシュ
- functions の再デプロイが必要かどうか
- GitHub Pages反映まで数分かかる旨

### run-dev
---
description: Shifty を localhost で起動してブラウザプレビューを表示します。?plan=free / ?plan=pro / ?plan=premium で動作プランを切り替えられます
---

以下の手順で Shifty をローカルで起動してください。

## 1. サーバー起動

`.claude/launch.json` の `shifty-server` 設定を使って preview_start ツールでサーバーを起動します。

## 2. スクリーンショット確認

preview_screenshot でアプリが正常に表示されることを確認します。

## 3. プラン切り替え（DEV_MODE=true 時のみ有効）

URL パラメータでプランをオーバーライドできます：

| URL                                   | 効果                             |
| ------------------------------------- | ------------------------------ |
| `http://localhost:PORT/`              | Firebase の実際のプランを使用            |
| `http://localhost:PORT/?plan=free`    | Free プランで表示                    |
| `http://localhost:PORT/?plan=pro`     | Pro プランで表示                     |
| `http://localhost:PORT/?plan=premium` | Premium プランで表示（BACKLOG 機能テスト用） |

## 4. Firebase 接続について

`DEV_MODE = true` のとき、開発用 Firebase プロジェクト (`thirty-dev-b6958`) に接続します。
スタッフ情報・シフトデータはこのプロジェクトに保存・取得されます。
本番データには影響しません。

## 注意

- `DEV_MODE` が `true` のままであることを確認してから作業してください
- `main` ブランチへのマージ時は `DEV_MODE = false` に戻すこと（`/check-dev` で確認可）

### shifty-feature
---
description: BACKLOG.md の先頭タスクを1件取り出し、develop ブランチで実装する。1ループ＝1タスク。完了後 main へのマージはユーザーが確認してから行う。
---

# Shifty クローズドループ② — 機能実装ループ

## 作業ディレクトリ
/Users/hiroshi/Documents/Claude Code/シフト作成アプリーshifty

## このループの目的
BACKLOG.md の先頭タスクを1件取り出し、develop ブランチで実装する。
VISION.md の「機能実装ループ完了基準」を満たしたらコミットして終了。
main へのマージは行わない（ユーザーが確認後に行う）。

---

## PHASE 0: スキル読み込み

```
Read: VISION.md    → 完了基準・プロダクトの目的
Read: RULES.md     → やってはいけないこと
Read: CLAUDE.md    → アーキテクチャ・データ構造・コンポーネント一覧
Read: BACKLOG.md   → 実装待ちタスク一覧
```

---

## PHASE 1: DISCOVER（タスク確認）

BACKLOG.md を読み込み、先頭のタスクを1件取り出す。

**タスクが存在しない場合:**
Obsidian CLI で以下のノートに追記して終了する:
- ノートパス: `Projects/Shifty/実装ログ`
- 内容: `## YYYY-MM-DD: BACKLOG が空のためスキップ`

**タスクが存在する場合:**
- タスク名・目的・受け入れ条件・影響範囲を把握する
- 現在のブランチが develop であることを確認する
  ```bash
  git branch --show-current
  git status
  ```
- develop でない場合は `git checkout develop` してから続ける

---

## PHASE 2: PLAN（実装計画）

CLAUDE.md のコンポーネント一覧・データ構造を参照し、以下を決める:

1. 変更するファイル・コンポーネント・行番号の目安
2. 実装手順（ステップ順）
3. 受け入れ条件の確認方法
4. RULES.md で禁止されていることに引っかからないか確認

---

## PHASE 3: EXECUTE（実装）

RULES.md の禁止事項を守りながら実装する。

**コーディングルール（CLAUDE.md より）:**
- import 文は使わない（CDN 版 React）
- inline style のみ（外部 CSS なし）
- input の fontSize は 16px 以上
- Firebase 書き込みは個別パス (`ref(...).set()`) か `update()`
- DEV_MODE は変更しない（develop では true のまま）
- 不要なコメント・リファクタリングはしない
- 1タスクに絞って実装する（関係ない改善はしない）

---

## PHASE 4: VERIFY（コードレビュー）

実装後、以下の観点でセルフレビューを行う:

**機能レビュー:**
- 受け入れ条件をすべて満たしているか（BACKLOG.md の チェックリスト）
- VISION.md の完了基準を満たしているか

**コード品質レビュー:**
- RULES.md の禁止パターンに違反していないか
- Firebase の書き込みパターンが正しいか
- iOS Safari / Android Chrome で問題が起きそうな箇所がないか
- DEV_MODE が true のままか

**バグ混入チェック:**
- 実装した箇所以外に副作用がないか
- 新たな 🔴🟡 バグを生み出していないか

問題が見つかった場合 → PHASE 3 に戻る（最大3回まで）。
3回繰り返しても解決しない場合 → 実装を中断してレポートのみ出力。

---

## PHASE 5: ITERATE 判定

- 受け入れ条件がすべて ✅ → PHASE 6 へ
- 未達の条件がある → PHASE 3 に戻る（最大2サイクルまで）

---

## PHASE 6: コミット + BACKLOG 更新

**コミット:**
```bash
git add app.js  # 変更ファイルを明示的に指定
git commit -m "feat: [タスク名の概要]"
git push
```
- Co-Authored-By 行は不要
- main ブランチへの push は絶対にしない

**BACKLOG.md の更新:**
実装したタスクを「完了済みタスク」セクションに移動する（削除せず移動）。

---

## PHASE 7: レポート出力 + Obsidian 記録

Obsidian CLI を使い、以下のノートに追記する:
- ノートパス: `Projects/Shifty/実装ログ`
- 上書きではなく append で追記

**レポート形式:**

```
## YYYY-MM-DD: [タスク名]

**実装内容**: [何をしたか1〜2行]
**変更ファイル**: app.js（行番号範囲）
**受け入れ条件**:
- [x] 条件1
- [x] 条件2
**動作確認**: develop ブランチで実装完了。main へのマージはユーザー確認後。
**残課題**: （あれば）

---
```

---

## 重要な制約
- main ブランチへの checkout・push・マージは絶対に行わない
- Firebase 本番データの変更は行わない
- 1回のループで複数タスクを実装しない（1ループ＝1タスク）
- BACKLOG.md が空の場合は何も実装せずに終了する

### サブスク_プラン設計書
# サブスクリプション プラン設計書

作成日: 2026年6月
更新日: 2026年6月29日

---

## プラン一覧（3階層）

| | **Free** | **Pro** | **Premium** |
|---|---|---|---|
| 月額 | 無料 | **500円 / 店舗** | **2,980円 / 店舗** |
| 対象 | 1店舗 | 1店舗 | 1店舗 |
| スタッフ数 | 20名まで | 無制限 | 無制限 |
| 期間数 | 1つまで | 無制限 | 無制限 |

> **複数店舗を管理する場合は、店舗ごとに加入する。**
> 例: 3店舗管理でPro → Pro × 3（月額1,500円）

---

## 機能比較

| 機能 | Free | Pro | Premium |
|---|---|---|---|
| シフト提出・提出状況一覧 | ✅ | ✅ | ✅ |
| Excel出力（提出タブ） | ✅ | ✅ | ✅ |
| 候補管理・休業日設定 | ✅ | ✅ | ✅ |
| スタッフ用URL共有 | ✅ | ✅ | ✅ |
| スタッフの並べ替え | ❌ | ✅ | ✅ |
| テンプレート共有 | ❌ | ✅ | ✅ |
| Excel書き出し時の店舗名変更 | ❌ | ✅ | ✅ |
| Excelスタッフ名色選択（黒/赤） | ❌ | ✅ | ✅ |
| 休憩時間設定・純勤務時間計算 | ❌ | ✅ | ✅ |
| スタッフ属性設定・勤務時間制限 | ❌ | ✅ | ✅ |
| 時間帯別出勤人数ヒートマップ | ❌ | ✅ | ✅ |
| 週間勤務時間・連勤数・統計 | ❌ | ✅ | ✅ |
| 退勤延長設定 | ❌ | ✅ | ✅ |
| シフト時間の管理者調整（adjustedStart/End） | ❌ | ❌ | ✅ |
| シフト作成グリッド・全員表示 | ❌ | ❌ | ✅ |
| シフト作成Excel出力（調整済み） | ❌ | ❌ | ✅ |

---

## Stripe 設定

| 商品名 | Price ID | 月額 |
|---|---|---|
| Shifty Pro | `price_1TgTwHDjKKQsHl7LRZKClgFc` | 500円 |
| Shifty Premium | `price_1TnOJYDjKKQsHl7LhJxMUbQE` | 2,980円 |

Stripe手数料: 3.6%

---

## 複数端末・複数店舗の考え方

### 複数端末（同じ店舗）
- 店舗コードを使って別端末に紐付け → 追加料金なし
- プランは1店舗につき1サブスク（何台からアクセスしてもOK）

### 複数店舗
- 店舗ごとに個別にプランを契約する
- 店舗Aを Free、店舗Bを Pro にすることも可能

---

## 制限の実装方針

```js
const PLAN_LIMITS = {
  free:    { shops: Infinity, staff: 20, periods: 1 },
  pro:     { shops: Infinity, staff: Infinity, periods: Infinity },
  premium: { shops: Infinity, staff: Infinity, periods: Infinity },
};
```

プランデータの保存先:
```
Firebase: accounts/{shopId}/plan       = "free" | "pro" | "premium"
Firebase: accounts/{shopId}/planExpiry = "YYYY-MM-DD"
```

---

## 収益シミュレーション

| 契約店舗数 | 月間収益（Pro 500円想定） |
|---|---|
| 100店舗 | 約50,000円 |
| 500店舗 | 約250,000円 |
| 1,000店舗 | 約500,000円 |

---

## 実装状況

- [x] Phase 1: Free/Proプラン制限ロジック
- [x] Phase 2: Firebase Authentication 導入
- [x] Phase 3: Stripe + Cloud Functions（Pro 500円）
- [x] Phase 4: マイページUI（MyPageTab）
- [x] Phase 5: Premium tier追加（2,980円/月）・シフト作成タブ編集をPremium限定化

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

---

## Shifty バグチェックレポート（2026-06-14 自動実行）

### 修正済み

- **🟡 App()スコープで tt が未定義 → 招待コード生成失敗時に ReferenceError**（app.js:1046）
  最新コミット（55facab）で generateInviteCode の catch ブロックに tt 呼び出しが追加されたが、tt は AdminView 内のローカル関数であり App スコープでは未定義だった。招待コード生成が失敗した際に ReferenceError: tt is not defined が発生し、エラートーストが表示されなかった。App に appToast state と tt 関数を追加し、アプリ全体のトーストとして表示できるよう修正。

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:776-808, 909-920）
  AppleログインUIは削除済みだが関数が残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:3725）
  管理者フォーム全般に使用されるAIスタイル定数が fontSize:14。PEF期間編集・各種入力欄に影響。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄の fontSize:12**（app.js:2126）
  管理者ヘッダーの「コードで追加」入力欄が fontSize:12。管理者画面のみの影響。

- **🟢 CandTab 全曜日候補一覧で休業日アイテムの表示が不正**（app.js:2919）
  「全曜日の登録済み候補」セクションで closed:true のアイテムが「開始時刻 〜 終了時刻」の空白表示になっている。CL コンポーネントと同様に「× 休業日」と表示すべき軽微なUI不具合。

### 異常なし
クリティカル（🔴）の問題はなし。中程度（🟡）1件を修正済み。

---

## Shifty バグチェックレポート（2026-06-14 自動実行）

### 修正済み
（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:776-808, 908-920）
  AppleログインUIは削除済みだが関数が残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:3809）
  管理者フォーム全般に使用されるAIスタイル定数が fontSize:14。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄の fontSize:12**（app.js:2179）
  管理者ヘッダーの「コードで追加」入力欄が fontSize:12。管理者画面のみの影響。

- **🟢 CandTab 全曜日候補一覧で休業日アイテムの表示が不正**（app.js:2991）
  「全曜日の登録済み候補」セクションで closed:true のアイテムが空白表示になっている。CL コンポーネントと同様に「× 休業日」と表示すべき軽微なUI不具合。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから呼ばれていない**（app.js:3209）
  joinByInviteCode 関数は App() に実装・SetTab に prop として渡されているが、SetTab 内でその prop を使う UI が存在しない（企業アカウント招待コード参加UIが未実装）。デッドプロップ。

### 最新コミット確認（901e8c2）
「ヘッダーは現在のセッション店舗のみ・設定は全連携店舗を表示」設計変更を確認。startSubscriptions の shopList なし呼び出し時の挙動・doLogout での setShops([]) は意図通りに動作。新規バグなし。

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。

---


---

## Shifty バグチェックレポート（2026-06-15 自動実行）

### 修正済み

- **🟡 sendSurveyEmails: SMTP_USER が secrets リスト未追加 + fallback typo**（functions/index.js:265,280）
  runWith の secrets に SMTP_USER が含まれておらず、process.env.SMTP_USER が undefined になるため fallback の "thifty.app@gmail.com"（typo: thifty → shifty）が使用されていた。将来の再送信時に送信元メールアドレスが誤る。SMTP_USER を secrets リストに追加し、fallback を "shifty.app@gmail.com" に修正。

- **🟢 CandTab 全曜日候補一覧で休業日アイテムの表示が不正**（app.js:3015）
  「全曜日の登録済み候補」セクションで closed:true のアイテムが空白表示されていた。CL コンポーネントと同様に「× 休業日」と表示するよう修正（赤字・背景色付き）。

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:781-815, 919-930）
  AppleログインUIは削除済みだが関数が残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:3833）
  管理者フォーム全般に使用されるAIスタイル定数が fontSize:14。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄の fontSize:12**（app.js:2195）
  管理者ヘッダーの「コードで追加」入力欄が fontSize:12。管理者画面のみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから呼ばれていない**（app.js:2274）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

### 異常なし
クリティカル（🔴）の問題はなし。中程度（🟡）1件・軽微（🟢）1件を修正済み。

---

## Shifty バグチェックレポート（2026-06-15 自動実行 #2）

### 修正済み

- **🟡 DEV_MODE = false のまま develop ブランチにコミットされていた**（app.js:12）
  RULES.md 違反。develop ブランチは常に `true` にすべきところ `false` になっており、開発中のアプリが本番 Firebase（ontheshift）に接続していた。`true` に修正してコミット・プッシュ済み（af354e0）。

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:781-815, 919-930）
  Apple ログイン UI は削除済みだが関数が残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI 定数の fontSize:14**（app.js:3836）
  管理者フォーム全般に使用されるスタイル定数が `fontSize:14`。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄の fontSize:12**（app.js:2195）
  管理者ヘッダーの「コードで追加」入力欄が `fontSize:12`。管理者画面のみの影響。

- **🟢 onJoinByInviteCode が SetTab に渡されているが UI から呼ばれていない**（app.js:3236）
  企業アカウント招待コード参加 UI が未実装のためデッドプロップ。

### 異常なし
クリティカル（🔴）の問題はなし。中程度（🟡）1 件（DEV_MODE 違反）を修正済み。

---

---

## Shifty バグチェックレポート（2026-06-18 自動実行）

### 修正済み

- **🟡 sendEmailOtp: secrets に SMTP_USER が欠落 → OTP メール送信失敗**（functions/index.js:194）
  runWith の secrets に SMTP_USER が含まれておらず、smtpUser が undefined になりメール送信が失敗していた。sendSurveyEmails では前回修正済みだったが sendEmailOtp は見落とされていた。["SMTP_PASS"] → ["SMTP_USER", "SMTP_PASS"] に修正。

- **🟡 verifyEmailOtp: Firebase Admin SDK に .delete() は存在しない → TypeError で OTP 検証後エラー**（functions/index.js:253）
  OTP 検証成功後に email_otps のクリーンアップで .delete() を呼び出していたが、Realtime Database Reference は .remove() が正しい API。検証は成功するが await が TypeError を投げ、クライアントがエラー応答を受け取っていた。.delete() → .remove() に修正。

- **🟡 joinByInviteCode: accounts/{uid}/shops を .set() で全体上書き → 既存 shop リンクが消滅**（app.js:1112）
  招待コードで企業アカウントに参加する際、招待主の shops を .set() で書き込んでいたため、参加者が既に持っていた shop リンクが上書き削除されていた。RULES.md 違反。.set() → .update() に変更し既存 shop リンクを保持するよう修正。

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js 内）
  Apple ログイン UI は削除済みだが関数が残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI 定数の fontSize:14**（app.js:3933）
  管理者フォーム全般に使用されるスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: 管理者ヘッダー「コードで追加」入力欄の fontSize:12**（app.js:2216）
  管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab 詳細モーダルの調整時間 <select> の fontSize:12**（app.js:3258付近）
  出退勤調整機能追加時に追加された select 要素。管理者画面のみの影響。

- **🟢 onJoinByInviteCode が SetTab に渡されているが UI から未使用**（app.js 内）
  企業アカウント招待コード参加 UI が未実装のためデッドプロップ。

### 異常なし
クリティカル（🔴）の問題はなし。中程度（🟡）3 件を修正済み。

---

## Shifty バグチェックレポート（2026-06-19 自動実行）

### 修正済み

- **🟡 提出削除がFirebaseから消えずリロード後に復活するバグ**（app.js:1233,2365,3242）
  SubsTabの削除ボタン・PeriodsTabのSmModal削除が `saveSubs(filtered)+update()` のみでFirebaseからレコードを削除していなかった。Firebaseリスナー再発火で削除済み提出が即座に復活していた。`saveSubs` に `deletedId=null` 引数を追加し、渡された場合は `update({[deletedId]: null})` でFirebase削除するよう修正。2箇所の呼び出し元も `sub.id` を渡すよう更新。

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:806,943）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2219）
  管理者ヘッダーの入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3308）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 異常なし
クリティカル（🔴）の問題はなし。中程度（🟡）1 件を修正済み。

---

## Shifty バグチェックレポート（2026-06-19 自動実行 #2）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:806,943）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3220,2811）
  スタッフ別名リンクセレクト・スタッフ属性セレクト。管理者（Premium）のみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3310）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。直近コミット（提出削除Firebase修正・Premium制限・ヒートマップ名変更）を確認、新規バグなし。

---

## Shifty バグチェックレポート（2026-06-20 自動実行）

### 修正済み

- **🟡 DEV_MODE = false のまま develop ブランチにコミットされていた**（app.js:12）
  RULES.md 違反。2472097（新規提出Firebase修正）→ 4adea31（main からのマージ）の流れで `false` のまま develop に残存していた。`true` に修正してコミット・プッシュ済み（d8c06ee）。

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:806,943）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4004）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2220）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3314,3317）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js 内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 2472097: 新規提出時 updatedAt/isUpdated を spread で undefined 除去 → 問題なし
- 507a03b: SubsTab 期間フィルタを最新期間デフォルトに戻す → 問題なし
- cf9c8d6: リロード時に subs をキャッシュから初期表示 → 問題なし

---

## Shifty バグチェックレポート（2026-06-21 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:806,943）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4004）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2220）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3314,3317）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js 内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 問題なし
- 2472097: 新規提出時 updatedAt/isUpdated を spread で undefined 除去 → 問題なし
- 507a03b: SubsTab 期間フィルタを最新期間デフォルトに戻す → 問題なし

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。Firebase 書き込みパターン・プラン制限ロジック・Cloud Functions secrets すべて正常。

---

## Shifty バグチェックレポート（2026-06-22 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:806,943）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4004）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2220）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3314,3317）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2810）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js 内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 問題なし
- 2472097: 新規提出時 updatedAt/isUpdated を spread で undefined 除去 → 正しい実装
- 507a03b: SubsTab 期間フィルタを最新期間デフォルトに戻す → 問題なし
- cf9c8d6: リロード時に setSubs([])→キャッシュ初期化に変更 → 問題なし

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。Firebase 書き込みパターン・削除処理・プラン制限ロジック・Cloud Functions secrets すべて正常。

---

## Shifty バグチェックレポート（2026-06-23 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:806,943）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4004付近）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2220付近）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3314,3317付近）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js 内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭） → getCookie(CK_SHOP)を参照する1行追加のみ、問題なし
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 軽微な変更、問題なし
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。Firebase 書き込みパターン・削除処理（deletedId による remove）・プラン制限ロジック・Cloud Functions secrets（SMTP_USER/PASS/SURVEY_SEND_TOKEN すべて設定済み）正常。

---

## Shifty バグチェックレポート（2026-06-24 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js 内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭） → 変更は targetId の算出順のみ、問題なし
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 軽微な変更、問題なし
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。Firebase 書き込みパターン・削除処理・プラン制限ロジック（isPro/isPremium 正しく分離済み）・Cloud Functions secrets すべて正常。

---

## Shifty バグチェックレポート（2026-06-25 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭） → getCookie(CK_SHOP) を targetId 算出の先頭に追加のみ、getCookie関数・CK_SHOP定数とも正しく定義済みで問題なし
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 軽微な変更、問題なし
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。Firebase 書き込みパターン・削除処理（deletedId による remove）・プラン制限ロジック・Cloud Functions secrets（SMTP_USER/PASS/SURVEY_SEND_TOKEN すべて設定済み）正常。

---

---

## Shifty バグチェックレポート（2026-06-26 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位をCookie→セッション→先頭に変更 → targetId算出順の変更のみ、getCookie・CK_SHOPとも正しく定義済みで問題なし
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 軽微な変更、問題なし
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。Firebase 書き込みパターン（subs は update/remove で適切に処理）・プラン制限ロジック（isPro/isPremium 正しく分離）・Cloud Functions secrets（全関数で SMTP_USER/PASS 設定済み）・DEV_MODE=true（develop ブランチ正常）すべて確認済み。

---

## Shifty バグチェックレポート（2026-06-27 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005付近）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221付近）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318付近）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811付近）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭）→ targetId算出順の変更のみ、getCookie・CK_SHOPとも正しく定義済みで問題なし
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 軽微な変更、問題なし
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。DEV_MODE=true（develop ブランチ正常）・DEV_PLAN_OVERRIDE は URL パラメータ or null で正しく設定。saveSubs の deletedId 処理・直接 remove() 呼び出しパターン正常。Cloud Functions secrets（全関数で必要な secrets 設定済み・.delete() 誤用なし）正常。isPro/isPremium の分離も正しい。

---

## Shifty バグチェックレポート（2026-06-28 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005付近）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221付近）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318付近）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811付近）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭）→ targetId算出をCookie優先に変更のみ、getCookie・CK_SHOPとも正しく定義済みで問題なし
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 軽微な変更、問題なし
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。Firebase 書き込みパターン・削除処理（deletedId/remove()）・プラン制限ロジック（isPro/isPremium 正しく分離）・Cloud Functions secrets（全関数で必要な secrets 設定済み・.delete() 誤用なし）・DEV_MODE=true（develop ブランチ正常）すべて確認済み。

---

## Shifty バグチェックレポート（2026-06-29 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭）→ targetId算出をCookie優先に変更のみ、getCookie・CK_SHOPとも正しく定義済みで問題なし
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 軽微な変更、問題なし
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。DEV_MODE=true（develop ブランチ正常）・DEV_PLAN_OVERRIDE はURL param or null で正しく設定・saveSubs の deletedId 処理・直接 remove() 呼び出しパターン正常・Cloud Functions secrets（全関数で必要な secrets 設定済み・.delete() 誤用なし）・isPro/isPremium の分離も正しい。

---

## Shifty バグチェックレポート（2026-06-30 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005付近）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221付近）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318付近）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭）→ Cookie優先に変更のみ、getCookie・CK_SHOPとも正しく定義済みで問題なし
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 軽微な変更、問題なし
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。DEV_MODE=true（develop ブランチ正常）・DEV_PLAN_OVERRIDE はURL param or null で正しく設定・saveSubs の deletedId 処理（全呼び出し元で適切に渡し済み）・直接 remove() 呼び出しパターン正常・Cloud Functions secrets（全関数で必要な secrets 設定済み・.delete() 誤用なし）・isPro/isPremium の分離も正しい。

---

## Shifty バグチェックレポート（2026-06-30 自動実行 #2）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭）→ targetId算出をCookie優先に変更のみ、getCookie・CK_SHOPとも正しく定義済みで問題なし
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 軽微な変更、問題なし
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。Firebase 書き込みパターン（subs は update/remove で適切に処理・set()全体上書きなし）・Cloud Functions secrets（全関数で SMTP_USER/PASS 設定済み・.delete() 誤用なし）・isPro/isPremium 分離正常・DEV_MODE=true（develop ブランチ正常）すべて確認済み。

---

## Shifty バグチェックレポート（2026-07-01 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭）→ targetId算出の優先順序をCookie優先に変更のみ、getCookie・CK_SHOPとも正しく定義済みで問題なし
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 軽微な変更、問題なし
- d8c06ee: DEV_MODE=false 違反を修正（true に戻す）→ 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。DEV_MODE=true（develop ブランチ正常）・DEV_PLAN_OVERRIDE はURL param or null で正しく設定・saveSubs の deletedId 処理（全呼び出し元で適切に渡し済み）・subs.set()全体上書きなし・Cloud Functions secrets（全関数で必要な secrets 設定済み・.delete() 誤用なし）・isPro/isPremium の分離も正しい。

---

## Shifty バグチェックレポート（2026-07-02 自動実行）

### 修正済み

- **🟡 ヘッダーの店舗削除がAuthユーザーでリロード後に復活するバグ**（app.js:2255）
  AdminViewヘッダーの「編集」モードで店舗削除ボタンを押すと `saveShops(filtered)` が呼ばれるが、これは `update()` で残存店舗を書くだけで削除店舗のキーを Firebase から消さない。Auth ユーザーは `accounts/{uid}/shops` に削除店舗が残ったままになりリロード後に復活していた。Authユーザーの場合は `onUnlinkShop(sh.id)` に切り替え（`unlinkShopFromAuth` 経由で `accounts/{uid}/shops` を proper に `.remove()` する）、非Authユーザーは従来通り。（f93b74e）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- f93b74e: ヘッダーの店舗削除Authユーザー復活バグ修正 → 正常
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭）→ 正常
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 正常

---

## Shifty バグチェックレポート（2026-07-03 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- f93b74e: ヘッダーの店舗削除Authユーザー復活バグ修正 → 正常
- 5f7c4a0: 企業連携ログイン時のデフォルト店舗優先順位変更（Cookie→セッション→先頭）→ 正常
- 8a92433: 企業連携ログイン時のデフォルト店舗をCookie参照に変更 → 正常

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。DEV_MODE=true（develop ブランチ正常）・DEV_PLAN_OVERRIDE はURL param or null で正しく設定・saveSubs の deletedId 処理（全呼び出し元で適切に渡し済み）・subs.set()全体上書きなし・Cloud Functions secrets（全関数で必要な secrets 設定済み・.delete() 誤用なし）・isPro/isPremium の分離も正しい。

---

## Shifty バグチェックレポート（2026-07-07 自動実行）

### 修正済み

- **🔴 DEV_MODE = false のまま develop ブランチにコミットされていた**（app.js:12）
  RULES.md 違反。直近コミット `6403775 chore: DEV_MODE=false（本番リリース用）` で `false` のまま develop に残存していた。`true` に修正してコミット・プッシュ済み（c8e058f）。

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 6403775: DEV_MODE=false（本番リリース用）→ develop ブランチにあったため RULES.md 違反として修正（c8e058f）
- f91f2b8: Stripe Premium price ID設定（2,980円/月）→ 正常
- c882060: Premiumプラン2980円追加・シフト作成タブ編集をPremium限定に変更 → 正常

---

## Shifty バグチェックレポート（2026-07-08 自動実行）

### 修正済み

- **🔴 DEV_MODE = false のまま develop ブランチにコミットされていた**（app.js:12）
  RULES.md 違反。直近コミット `5dfa299 chore: DEV_MODE=false（本番リリース用）` で `false` のまま develop に残存していた。`true` に修正してコミット・プッシュ済み（c609862）。

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:807,944）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4005）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: コードで追加入力欄 fontSize:12**（app.js:2221）
  管理者ヘッダーの「コードで追加」入力欄。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット
- 5dfa299: DEV_MODE=false（本番リリース用）→ develop ブランチにあったため RULES.md 違反として修正（c609862）
- 575ea84: Free/ProプランからPremiumへのアップグレードボタン追加 → 正常
- 2cec6cd: 解放コード廃止・旧ots_unlockedキー自動削除 → 正常

---

## Shifty バグチェックレポート（2026-07-10 自動実行）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:795,932）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4457）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:3315,3318付近）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:2811付近）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app.js:3309付近）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認事項
前回（2026-07-08）の c609862 以降、develop ブランチへの新規コミットなし。DEV_MODE=true・DEV_PLAN_OVERRIDE の設定は正常。saveSubs の deletedId 処理（全呼び出し元で適切に渡し済み）・subs は set() ではなく update() でのみ書き込み・Cloud Functions secrets（全関数で必要な secrets 設定済み・.delete() 誤用なし）・isPro/isPremium の分離（staffAttribute・overtime・consecutive等はすべて isPremium 判定で正しい）を確認。

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。

---

## Shifty バグチェックレポート（2026-07-11 自動実行）

### 修正済み

（今回の実行では修正なし。前回実行の 2026-07-08 (c609862) 以降 develop に積まれた1件の app.js 変更（ShiftEditTabの時間帯別出勤人数ヒートマップに退勤延長分を反映）は、開始時点で作業ツリーに未コミットの WIP として残っていたが、既存の auto-commit フックにより本ループの開始前に commit 65260f3 として処理済みだった）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:837,974）
  Apple ログインUI削除済みだが関数残存。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4882）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:4147,4150付近）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:3651）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟡 CLAUDE.md がObsidian自動同期により肥大化・内容が5重に重複**（CLAUDE.md、9925行/476KB）
  BACKLOG/RULES/VISION/バグチェックログ等の内容が複数回重複して追記されており、`BUG_CHECK_LATEST_START/END` マーカーも5組存在する。同期処理が「置き換え」ではなく「追記」を繰り返している可能性がある。コード上のバグではないためこのループでは修正せず、CLAUDE.md 内の最後のマーカーブロックのみ今回のレポート内容に更新した。別タスクとしてユーザーに確認・修正を推奨（同期スクリプト or フックの調査が必要）。

### 確認した直近コミット
- 65260f3: Auto-commit: app.js changes（ShiftEditTabの時間帯別出勤人数ヒートマップに退勤延長分を反映）→ 正常
- 3d2059f: PDF書き出しの7項目修正（空白列白塗り・斜線1本化・年号非表示・ヒートマップ日付統合・棒線縦回転・カウント表2ページ目化）→ Premium限定表示（isPremium）で正しくゲートされている、Firebase書き込みなし、dev server起動でコンソールエラーなし
- 1f87b89: ヒートマップの終端時刻境界を元の仕様に戻す → 正常
- 8470b5c: PDFの縦書き・日付結合・斜線をhtml2canvas対応の実装に修正 → 正常

### 異常なし
クリティカル（🔴）・中程度（🟡、CLAUDE.md肥大化を除く）の問題はなし。DEV_MODE=true（develop ブランチ正常）・DEV_PLAN_OVERRIDE は式で正しく定義（DEV_MODE=trueのときのみ有効・main では自動的にnull）・subs は set() ではなく update()/remove() でのみ書き込み・Cloud Functions secrets（全関数で必要な secrets 設定済み・.delete() 誤用なし）・isPro/isPremium の分離は正しい。dev server起動確認でコンソールエラー・構文エラーなし。

---

## Shifty バグチェックレポート（2026-07-04 自動実行）

### 修正済み

（今回の実行では修正なし。app.js / functions/index.js への新規コミットは前回チェック以降なし。直近コミット efb7c83 は ESLint による静的解析 CI 基盤の追加のみで、app.js のランタイムには影響しない）

### 要確認（未修正）

- **🟢 signInWithApple / signInAndLinkApple デッドコード**（app.js:844,981）
  Apple ログインUI削除済みだが関数残存（signInAndLinkApple は SetTab に prop として渡されているが受け取り側で未使用）。動作に影響なし、将来的に削除推奨。

- **🟢 iOS Safari ズーム防止: AI定数の fontSize:14**（app.js:4889）
  管理者フォーム全般のスタイル定数。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: 店舗コード「コードで追加」入力欄の fontSize:12**（app.js:2269）
  直近数回のレポートで記載漏れになっていたが引き続き未修正（RULES.md の16px未満禁止に抵触する軽微な技術負債）。管理者画面のみの影響。

- **🟢 iOS Safari ズーム防止: SubsTab詳細モーダル調整selectの fontSize:12**（app.js:4154,4157付近）
  出退勤調整セレクト。Premiumユーザーのみの影響。

- **🟢 iOS Safari ズーム防止: staffAttribute selectの fontSize:12**（app.js:3658）
  スタッフ属性セレクト（StaffTab）。Premiumユーザーのみの影響。

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app.js内）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟡 CLAUDE.md がObsidian自動同期により肥大化・内容が重複し続けている（悪化中）**（CLAUDE.md、12,499行/603KB）
  前回確認時（2026-07-11時点で9,925行/476KB）からさらに肥大化しており、`BUG_CHECK_LATEST_START/END` マーカーが6組以上存在する状態。同期処理が「置き換え」ではなく「追記」を繰り返している可能性が高い。コード上のバグではないためこのループでは修正しない。悪化が続いているため、Obsidian↔CLAUDE.md 同期の仕組み（フックまたはスキル）を別途調査・修正することを推奨。

### 確認した内容
- Firebase 書き込みパターン: `subs` の `set()` 全体上書きなし。削除は3箇所すべて `saveSubs(a, id)` の deletedId 渡し、または `firebaseDB.ref(...).remove()` の直接呼び出しで正しく実装されている（app.js:1189-1190, 1574-1576, 2299, 3187, 4130）。
- `getBreaksFor` の休憩ロジック: 直近2コミット（136514d, 0b33fa0）で追加された「出勤開始時刻が休憩開始以降なら休憩を適用しない」フィルタが、`calcNetWorkMinutes` の全呼び出し元（勤務時間集計・週間集計・ヒートマップ・詳細モーダル）から一貫して `getBreaksFor` 経由で利用されており、統一入口を迂回する呼び出しは存在しない。
- Cloud Functions secrets: 全 `runWith` 呼び出しで必要な secrets（STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SMTP_USER, SMTP_PASS, SURVEY_SEND_TOKEN）が揃っている。`.delete()` 誤用なし。
- `isPro`/`isPremium` の分離: Premium限定機能（staffAttribute・overtime・adjustedStart/End・週間統計等）はすべて `isPremium` 判定で正しくゲートされている。`isPro` の使用箇所（別名編集・削除ボタン等）はPro相当の機能で誤用なし。
- DEV_MODE=true・DEV_PLAN_OVERRIDE は式で正しく定義（develop ブランチ正常）。
- 新規追加された ESLint CI（`npx eslint app.js`）を実行し `no-undef`/`react/jsx-no-undef` エラー0件を確認（warningのみ、すべて `no-unused-vars` で機能に影響なし）。
- dev server 起動確認（スタッフ画面のスクリーンショット表示・コンソールエラーなし・Firebase接続正常）。

### 異常なし
クリティカル（🔴）の問題はなし。中程度（🟡）はCLAUDE.md肥大化のみ（コードバグではなく別タスク推奨）。

---

### ユーザーアンケート
# Shifty ユーザーアンケート

作成日: 2026-06-15

---

## フォームURL

### 店長・管理者向け
- 回答URL: https://docs.google.com/forms/d/e/1FAIpQLSczQWvAMCkS_otEVWW14NkFDHbz7DuzU_Fv_qRm-P9o0GGpWA/viewform
- 編集URL: https://docs.google.com/forms/d/1pfXmhtvXydSGfb9zYLkB36n5rK9PPiJNZNhfwHCfrHc/edit

### スタッフ向け
- 回答URL: https://docs.google.com/forms/d/e/1FAIpQLScoUT7LzM_gxbmJur8HD3m7RTWGwi9VZQqYHlkNzamlUJnFkg/viewform
- 編集URL: https://docs.google.com/forms/d/1qQEpmnj09MUzqCJ54guOdt_UYDtU2YynRtR7Lftx_YA/edit

---

## 目的

スタッフ・店長それぞれの実際の使われ方と摩擦ポイントを特定し、Proプランへの転換率向上とチャーン防止施策の優先順位付けに使う。

## 対象・形式

- 形式: Googleフォームによるアンケート回答のみ（非同期・匿名可・謝礼なし・所要3〜5分）
- 目標回答数: 各セグメント10件以上

## 配布先

- Firebaseコンソール → Authentication のメール登録済みユーザー（自動送信済み・下記参照）
- SNS（Instagram / X）の飲食店オーナー向け投稿

## 一斉送信

- 送信日: 2026-06-15
- 方法: Cloud Function `sendSurveyEmails`（Firebase Auth の全メール登録ユーザーに自動送信）
- エンドポイント: `https://asia-northeast1-ontheshift.cloudfunctions.net/sendSurveyEmails`
- 再送信コマンド:
```bash
curl -X POST https://asia-northeast1-ontheshift.cloudfunctions.net/sendSurveyEmails \
  -H "Content-Type: application/json" \
  -d '{"token":"shifty-survey-2026"}'
```

---

## 質問内容

### 店長向け（6問）
1. 使い始めたきっかけ（選択）
2. よく使う機能（複数選択）
3. 面倒・不便な点（自由記述）
4. 有料プランを検討しない理由（選択）
5. 有料プランに切り替えて良かった点（自由記述・Proのみ）
6. 推薦意向 1〜5点（スケール）

### スタッフ向け（4問）
1. 初回アクセス時の迷い（選択＋自由記述）
2. 利用デバイス・操作感（選択＋自由記述）
3. 提出後の確認ニーズ（選択）
4. リマインド通知ニーズ（選択）

### 実装ログ
## 2026-06-16: 休憩時間設定と純勤務時間の計算

**実装内容**: CandTab に「休憩」タブを追加し、平日・土・日・祝それぞれの休憩時間を設定できるように実装。calcNetWorkMinutes / getBreakList / fmtMin ユーティリティ関数を追加し、SubsTab 詳細モーダルに「時間」列・合計行、一覧に純勤務時間合計を表示。
**変更ファイル**: app.js（230〜243行、2877〜3153行、3195〜3253行）
**受け入れ条件**:
- [x] Settings に休憩時間設定を追加（平日・土・日・祝それぞれ独立して設定可能）
- [x] 各休憩設定は「開始時刻〜終了時刻」の形式で複数設定可能
- [x] シフトの出勤〜退勤時間が休憩時間と重なる場合、重複分を差し引いた時間を純勤務時間とする
- [x] 設定画面（CandTab）から休憩設定を追加・削除できる
- [x] 既存の勤務時間表示箇所で純勤務時間が反映される
**動作確認**: develop ブランチで実装完了（e7b7262）。main へのマージはユーザー確認後。

---
