# CLAUDE.md — Shifty

作成日: 2026年6月（コードベースから自動生成）／最終更新: 2026-07-06（app.js 5分割・セキュリティルール改修を反映）

---

## プロジェクト概要

**Shifty** (`shiftyshifty.app`) — 飲食店向けシフト提出・管理 Web アプリの一般公開版。  
スタッフは URL を開くだけで希望シフトを提出できる。管理者は提出状況を確認し Excel で出力できる。  
Free / Pro / Premium の 3 段階プラン制。Stripe サブスク（Pro 500円/月・Premium 2,980円/月・店舗単位）。

---

## 実装依頼の受け方（全モデル共通・必読）

実行モデル（Sonnet / Opus / Fable 等）に関わらず同じ品質を担保するための手順。モデルの判断力に頼らず、この手順自体が品質を保証する。

1. **着手前にタスクを定型化する**: フリーフォームの依頼（「〜を直して」「〜を追加して」）は、実装前に「**目的**（なぜ必要か）/ **受け入れ条件**（チェックリスト）/ **影響範囲**（ファイル・コンポーネント）」の3点に変換して提示してから着手する。typo修正などの自明な1行修正は省略してよい。
2. **該当スキルを必ず経由する**: バグ調査・修正 → `/bug-check`、BACKLOG実装 → `/shifty-feature`、本番リリース → `/release-to-main`。スキル内のPHASE・チェックリストを省略しない。
3. **修正前に全呼び出し元を洗い出す**: 5ファイル分割のため定義と呼び出しが別ファイルにあるのが普通。`grep -n "関数名" app-*.js` で全ファイル横断で確認してから編集する。
4. **コミット前の検証は固定**: `npm test` と `npx eslint app-*.js` を必ず実行し、結果を省略せず報告する。失敗したら失敗のまま報告する（成功したことにしない）。
5. **受け入れ条件を1つずつ照合してから完了報告する**: 未検証の項目は「未検証」と明記する。

※ main へのpush・本番Firebase（ontheshift）へのデプロイ・DEV_MODE固定値の書き込みは PreToolUse フックが機械的にブロックする。ブロックされたら回避せず、フックのメッセージに従うこと。

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

`DEV_MODE` はブランチではなく**実行時のホスト名で自動判定**する（[app-core.js:12](app-core.js)）:

```js
const DEV_MODE = location.hostname !== "shiftyshifty.app";
```

```
本番カスタムドメイン(shiftyshifty.app) → DEV_MODE=false → ontheshift（本番）
それ以外（localhost・プレビューURL等）  → DEV_MODE=true  → thirty-dev-b6958（開発用）
```

developブランチ・mainブランチのどちらにチェックアウトしていても同じ判定になるため、マージ前後で手動切り替えする必要はない。`CF_BASE`（Cloud Functions エンドポイント）も `DEV_MODE` に連動して切り替わる（app-core.js）。

---

## ファイル構成（2026-07-06 に app.js を5ファイルに分割）

```
/
├── index.html          ← CDN 読み込み（SRI付き）・PWA meta・OGP・スクリプト読み込み
├── app-utils.js        ← 純粋関数・定数（ブラウザAPI非依存 = Nodeでテスト可能・プレーンscript）
├── app-core.js         ← DEV_MODE・Firebase設定・Cookie/テーマ/localStorage・スタイル定数（プレーンscript）
├── app-staff.js        ← ShiftyIcon, StaffView, StaffHdr, CellEditPanel, SmModal（babel）
├── app-admin.js        ← AdminView と全タブ, expXl, UpgradeModal, AC/AL/AT/CL（babel）
├── app-main.js         ← App() 本体 + ReactDOM マウント（babel）
├── tests/
│   └── core.test.js    ← app-utils.js の Node ユニットテスト（node --test）
├── functions/
│   └── index.js        ← Firebase Cloud Functions（Stripe・メール送信・店舗自動アーカイブ）
├── RULES.md            ← やってはいけないこと（必読）
├── firebase.json       ← Firebase Hosting / Functions 設定
├── database.rules.json ← Firebase セキュリティルール
├── CNAME               ← shiftyshifty.app
└── scripts/
    └── stripe-setup.js ← Stripe Price ID 確認スクリプト
```

**分割の仕組み**: Babel Standalone は複数の `<script type="text/babel">` を同一グローバルスコープで順に実行するため、`import`/`export` なしでファイル間参照が成立する（実証済み）。**index.html の読み込み順（utils→core→staff→admin→main）を変えてはいけない**。新しいコンポーネント・関数は所属に応じたファイルへ追加する。

## ソースファイルの内容

### app-utils.js（純粋関数・Nodeテスト対象）

```js
WD / JH_FIXED / JH_DATES   // 曜日・日本の祝日（2025〜2028）
PLAN_LIMITS / PLAN_LABELS  // プラン定義
fd(d) / pd(s) / gd(s,e)    // 日付ユーティリティ
gto() → TO / TO_START      // 時間オプション 9:00〜27:00
sc(cs)                     // 候補時間ソート（closed は末尾）
isHoliday / isWeekendOrHoliday(dateStr) // 土日祝判定
calcNetWorkMinutes / getBreakList / getBreaksFor / getOT // 純勤務時間計算
shiftBandInfo / isBreakEligible // ランチ/ディナー帯判定
genToken() / genSecureId(len)   // ランダムID生成
isSpacer(n) / resolveAlias / buildSuggestList
// 末尾に module.exports ガード（Nodeテスト用）
```

### app-core.js（ブラウザ依存のグローバル）

```js
const DEV_MODE = location.hostname !== "shiftyshifty.app"; // 12行目・ホスト名で自動判定
FIREBASE_CONFIG_PROD / DEV / FIREBASE_CONFIG
firebaseDB / firebaseAuth / firebaseFunctions / firebaseEnabled
fbPath(shopId, key) / ph(event, props) / dlog(...)  // dlogはDEV_MODE時のみconsole.log
DEV_PLAN_OVERRIDE   // DEV_MODE時のみ ?plan= URLパラメータで上書き
_LA_KEY / _LL_KEY   // ログイン試行ロック（10回・30分・メールログインで使用）
lg / ls / storeKey  // localStorage
CK_SHOP / ckStaffKey / SS_* / THEME_KEY / applyTheme // Cookie・セッション・テーマ
makeShop / makeSettings / buildUrl(period) / parseUrl
CF_BASE             // Cloud FunctionsエンドポイントをDEV_MODE連動で切り替え
AI / AB / AD / AGray // スタイル定数
```

### App() コンポーネント（app-main.js）

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
  → URLトークンあり: tokens/{token} をO(1)読み → global/shops/{shopId} 直キー読み → startSubscriptions()
  → Auth済み:        accounts/{uid}/shops → 各shopIdを直キー読み → setAllLinkedShops → startSubscriptions()
  → Cookie:          CK_SHOP → global/shops/{ckId} 直キー読み → startSubscriptions()
  → なし:            setUnbound(true) → ログイン画面
  ※ global/shops の全件読みはセキュリティルールで拒否される（一覧の公開廃止・直キー読みのみ）

Phase2 (startSubscriptions関数) — sid確定後にuseEffectを経由せず直接呼ぶ
  → shops/{sid}/templates, settings, periods, staff, subs
  → accounts/{sid}/plan, planExpiry, paymentFailed をリアルタイム購読

Phase3 (useEffect[ready, periods, urlResolved]) — URLなし時のapid初期化
  → sessionStorage復元 or periods[0]（最新期間）
```

**tokens逆引きインデックス**: `tokens/{urlToken} = {shopId, periodId}`。期間の作成/削除時（savePeriods）に書き込み・削除され、既存期間は管理者セッションのlazy backfill（App内useEffect）が冪等に補完する。スタッフURLはこのインデックスで解決される。

**重要**: `startSubscriptions` は `useCallback` で定義してあるが、`useEffect([ready, sid])` に依存させてはいけない。React のバッチ処理で sid/ready の更新タイミングがズレて競合が発生する。Phase1内から直接呼ぶこと。

---

## コンポーネント一覧

| コンポーネント | ファイル | 役割 |
|---|---|---|
| `App()` | app-main.js | メインアプリ・3フェーズ初期化・全 state 管理・ReactDOMマウント |
| `ShiftyIcon` | app-staff.js | アプリアイコンSVG（全画面共通） |
| `StaffView` | app-staff.js | スタッフのシフト提出画面 |
| `StaffHdr` | app-staff.js | スタッフ画面ヘッダー（期間選択） |
| `CellEditPanel` | app-staff.js | 提出状況ビュー内のセル編集（既存データを初期値） |
| `SmModal` | app-staff.js | 提出状況一覧（名前列固定・日付横スクロール） |
| `AdminView` | app-admin.js | 管理者画面（タブ切り替え） |
| `ShiftEditTab` | app-admin.js | シフト作成グリッド・ヒートマップ・集計・PDF出力（Premium） |
| `PeriodsTab` | app-admin.js | 期間管理・URL シェア |
| `PEF` | app-admin.js | 期間編集フォーム |
| `expXl()` | app-admin.js | ExcelJS による Excel 生成 |
| `StaffTab` | app-admin.js | スタッフ登録・並べ替え・別名設定 |
| `CandTab` | app-admin.js | 候補時間・休業日・休憩管理 |
| `SubsTab` | app-admin.js | 提出一覧・セル編集・変更履歴 |
| `SetTab` | app-admin.js | 設定・Cookie引き継ぎ・企業アカウント連携 |
| `MyPageTab` | app-admin.js | マイページ（プラン確認・アップグレード） |
| `UpgradeModal` | app-admin.js | アップグレード促進モーダル（Stripe Checkout 呼び出し） |
| `AC / AL / AT / CL` | app-admin.js | 汎用UIパーツ（カード・ラベル・タイトル・候補リスト） |

※ 管理者パスワード認証（AdminLogin）は廃止・削除済み。管理者権限は2026-07-07から**管理キー（adminKey）方式**: `shops/{shopId}/owners/{uid}` に登録された端末のみ管理系パスに書き込める。端末追加は管理コード（`shopId.adminKey`）を「コードで追加」に入力する。

---

## Firebase データ構造

```
Firebase Realtime Database
├── global/
│   └── shops/{shopId} ← 店舗情報。直キー読みのみ許可（一覧読みはルールで拒否）
├── tokens/
│   └── {urlToken}     ← {shopId, periodId} スタッフURLのO(1)逆引きインデックス
├── shops/
│   └── {shopId}/
│       ├── settings   ← 候補時間・スタッフ色・別名・休憩・属性・Excel設定など
│       ├── periods    ← 期間一覧 {periodId: periodObj}
│       ├── staff      ← スタッフ名一覧（文字列配列）
│       ├── templates  ← 曜日別候補テンプレート（店舗単位・Pro以上）
│       ├── lastActivity ← ISO文字列（CFの1年未更新アーカイブ判定に使用）
│       ├── subs/      ← 提出データ {subId: subObj}（書き込みは.validateで形状検証・auth必須）
│       ├── owners/    ← {uid: adminKey} 管理者登録（自uid追加はadminKey照合が必要・読みはオーナーのみ）
│       └── private/
│           └── adminKey ← 管理キー（32桁）。読みはオーナー（未claim時はauth済み全員）のみ
├── archived/
│   └── shops/{shopId} ← purgeInactiveShops が退避した店舗（30日猶予後に本削除）
├── accounts/
│   └── {shopId}/            ← プラン管理（shopId単位）
│       ├── plan             = "free" | "pro" | "premium"
│       ├── planExpiry       = "YYYY-MM-DD"
│       ├── stripeCustomerId ← Stripe Customer Portal 用
│       └── paymentFailed    = true（決済失敗時）
│   └── {uid}/               ← Firebase Auth UIDで複数店舗管理（本人のみ読み書き可）
│       ├── shops            ← {shopId: true} 紐付けマップ
│       ├── inviteCode       ← {code, createdAt, expiresAt, createdBy}
│       └── members/         ← {uid: {email, joinedAt, role:"member"}}（自分の追加のみ可）
├── inviteCodes/
│   └── {code}           ← {uid, expiresAt, shops}（企業招待コード・shopsスナップショット埋め込み）
└── email_otps/
    └── {uid}            ← {code, email, emailLink, expiry, attempts}（OTP・5回失敗で無効化）
```

**セキュリティモデル（2026-07-07改修・フェーズB）**: 「Anonymous Auth必須 + オーナー権限分離（管理キー方式）」。
- 全クライアントは起動時に `signInAnonymously()`（LOCAL永続化・端末ごとにuid安定）。**全ルールが `auth != null` 必須**のため未認証RESTは全拒否。実ログイン（Google/メール）は従来通り永続化しない（サインイン直前にNONEへ切替）。
- 管理系パス（settings/periods/staff/templates/tokens/global/shops）の書き込みは `shops/{shopId}/owners/{auth.uid}` 登録者のみ。owners への自己登録は `private/adminKey` との値照合が必要で、adminKeyは管理者端末のlocalStorage（`ots_adminKeys_v1`）にのみ保存される。**スタッフURLから得られるshopIdだけでは管理操作できない**。
- スタッフは subs の読み書きと settings/periods/staff の読みのみ（従来機能を維持）。
- **移行猶予（現行ルール）**: owners未登録（未claim）店舗は従来通り書き込み可。既存店舗は管理者画面表示時のlazy claimで自動移行する。猶予終了後は `database.rules.tightened.json` に差し替える（BACKLOG参照）。
- Cloud Functions（createCheckoutSession/createPortalSession）はIDトークン検証+オーナー照合。App CheckはSDK読込済み・サイトキー未設定でスキップ中（BACKLOG参照）。

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

// 設定（passwordは廃止済み・新規店舗には書かれない）
Settings = { shopId, candidates: Cand[], weekdayCandidates: {[dow]: Cand[]},
             dateCandidates: {[date]: Cand[]}, templates: Template[],
             breakTimes?: {weekday|sat|sun|hol: {start,end,tags?}[]},
             staffAttributes?: {[name]: 属性ID}, staffTypeLimits?: {[属性ID]: 制限},
             overtimeSettings?: {byStaff: {[name]: {lunch,dinner}}}, staffNumbers?: {[name]: string},
             xlShopName?: string, staffColors?: {[name]: "red"|"black"},
             staffAliases?: {[registered]: string[]}, periodUnit?: "2week"|"1month" }
```

---

## 企業アカウント（companyLink）の仕組み

1. **Firebase Auth ユーザー**が店舗を作成すると `accounts/{uid}/shops/{shopId} = true` に紐付け
2. 複数端末から同じ Google/Apple/メールでログインすると、`allLinkedShops` に全店舗が入る
3. 企業招待コード（`generateInviteCode`）:
   - `inviteCodes/{8文字トークン} = {uid, expiresAt, shops}` を書き込む（24時間有効・shopsスナップショット埋め込み）
   - 別ユーザーが `joinByInviteCode(code)` で参加:
     - `accounts/{招待主uid}/members/{自分のuid}` に追記（ルール上「自分の追加」のみ可）
     - コードに埋め込まれた `shops` を自分の shops に update でマージ（他人のaccountsは読まない。ルールで本人限定のため）
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
| `verifyEmailOtp` | Callable `verifyEmailOtp` | OTP検証（5回失敗で無効化） |
| `purgeInactiveShops` | schedule 毎日（JST） | 1年未更新店舗を archived/ へ退避→30日後に本削除。Invalid Dateはスキップしてログ |
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
# PR 作成 → main にマージ（DEV_MODEはホスト名で自動判定されるため手動切り替え不要）
```

**マージ前チェックリスト**:
- [ ] `DEV_MODE` が `location.hostname !== "shiftyshifty.app"` の式のままか（**app-core.js 12行目**。固定の `true`/`false` に書き換わっていないか）
- [ ] `npm test` が全パスするか（app-utils.js のユニットテスト）

**Firebaseルールの変更を含むリリースの順序（厳守）**: クライアント変更を先に main へ反映し本番配信を確認 → その後に `firebase deploy --only database --project ontheshift`。ルールを先に出すと旧クライアントが壊れる。

### Cloud Functions

```bash
cd functions
firebase deploy --only functions --project ontheshift   # devプロジェクトはSparkプランのためデプロイ不可
```

### Firebaseセキュリティルール

```bash
firebase deploy --only database --project thirty-dev-b6958  # dev
firebase deploy --only database --project ontheshift        # 本番（クライアント配信後）
```

---

## 開発時の注意点

### ブランチと DEV_MODE

- `DEV_MODE` はブランチではなく実行時のホスト名で自動判定（`location.hostname !== "shiftyshifty.app"`）
- 本番カスタムドメイン以外（localhost・プレビューURL等）はすべて DEV Firebase に接続する
- develop・main どちらのブランチにチェックアウトしていても判定は同じなので、マージ前後の手動切り替えは不要
- `CF_BASE` も `DEV_MODE` に連動して自動切り替わる（app-core.js）

### プランのテスト

`DEV_PLAN_OVERRIDE`（app-core.js）は DEV_MODE 時のみ URL パラメータで上書きされる式。localhost で `?plan=free` / `?plan=pro` / `?plan=premium` を付けてテストする（コードの書き換えは不要）。

### テスト

```bash
npm test          # app-utils.js の純粋関数（calcNetWorkMinutes・祝日判定等）のユニットテスト
npx eslint app-*.js  # 0 errors を維持（CIでも実行）
```

### React・スタイル制約

- **ビルド不要**: Babel Standalone がブラウザでトランスパイル。`import`/`export` は使えない
- **ファイル分割の制約**: index.html の読み込み順（utils→core→staff→admin→main）を変えない。全ファイルがグローバルスコープを共有する
- **スタイルは inline style のみ**: 外部 CSS ファイル・CSS モジュール追加禁止
- **`input`/`select`/`textarea` の `fontSize` は 16px 以上**: iOS Safari ズーム防止（2026-07-06に全箇所解消済み。新規追加時に守ること）
- **CDNスクリプトはSRI付き**: バージョン変更時は integrity ハッシュの再計算が必要（`curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`）
- **スタイル定数**: `AI`（input）/ `AB`（primary button）/ `AD`（delete）/ `AGray`（secondary）が app-core.js に定義済み
- **console.log は `dlog()` を使う**（DEV_MODE時のみ出力。warn/errorはそのまま）

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

- iOS Safari ズーム問題（input の fontSize<16）は 2026-07-06 に全箇所解消済み
- 残存する既知の設計課題は「shopIdを知る者=管理可」のcapabilityモデル（恒久対応は BACKLOG の Anonymous Auth 権限分離を参照）
- `globalTemplates` という state/prop 名は店舗単位化後も歴史的経緯で残っている（実体は shops/{shopId}/templates）

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
## Shifty バグチェックレポート（2026-07-07 自動実行 #3）

### 修正済み

（今回の実行では修正なし）

### 要確認（未修正）

- **🟢 onJoinByInviteCode がSetTabに渡されているがUIから未使用**（app-admin.js:9,163,2050）
  企業アカウント招待コード参加UIが未実装のためデッドプロップ。

- **🟢 詳細モーダルの「時間」列ヘッダーがnon-Premiumでも常に表示される**（app-admin.js:2026）
  non-Premiumユーザーは全行「-」表示。機能上の問題はないが視覚的に不要な列が表示される軽微なUX問題。

### 確認した直近コミット（前回#2の243d8ee以降・5コミット）
- 3025a5e / 4f0ed95: 管理画面レイアウト崩れ3件の修正（スタッフタブ・シフト作成タブ・退勤延長設定の横幅/スクロールずれ）→ ブラウザ実機で900px幅までリサイズしサイドパネルが正しく非表示になり縦積みレイアウトに切り替わることを確認、コンソールエラーなし。
- 84e9b75: 購読ライフサイクルのレース修正・PeriodsTabクラッシュ防止・締めルール強化
  - `doLogout`/`doFullSignOut`で店舗切替前に`activeSubsRef`を明示的に`off()`してから解除（前店舗データの受信継続を防止）
  - periods購読ハンドラで`shopId`欠落データに購読元`targetSid`を補完（店舗切替直後のtokens補完で他店舗sidが混入するのを防止）
  - `app-utils.js`の`pd`/`gd`が非文字列・undefinedでも例外を投げず`Invalid Date`/`[]`を返すよう防御。ユニットテスト4件追加、全パス
  - `database.rules.tightened.json`（未適用の締めルール）強化。現行`database.rules.json`は変更なし
  - 招待コードの`expiresAtMs`ベース期限切れ読み取り拒否・締めルール下のエラーハンドリングを追加
- f8af476 / fb76c51: developへのマージコミットのみ、差分なし

### 追加確認
- Firebase書き込みパターン: `subs`の`set()`全体上書きなし。削除操作すべて`deletedId`渡しで正しく実装
- isPro/isPremium分離: 唯一の非色系`isPro`箇所（app-admin.js:2000、別名登録UI）はPro以上機能として意図通り
- index.html: スクリプト読み込み順維持、SRI 11本
- Cloud Functions: secrets抜け漏れなし、`.delete()`誤用なし、`purgeInactiveShops`安全装置維持
- DEV_MODE（app-core.js:12、式のまま）正常
- `npx eslint app-*.js` 0 errors / 92 warnings（すべてno-unused-vars誤検知）。`npm test` 22件全パス
- dev server実機確認: スタッフ画面・管理者画面各タブ（900px幅リサイズ含む）表示、非オーナー端末の閲覧専用バナー・`permission_denied`の安全な握りつぶしを確認、コンソールエラーなし

### 異常なし
クリティカル（🔴）・中程度（🟡）の問題はなし。前回チェック（2026-07-07 #2）以降の5コミットはすべて正しく実装されており、新規バグは検出されなかった。
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

## 🟡 セキュリティ強化: 締めルールへの切り替え（猶予期間終了後）

**目的**: 2026-07-07に実装したオーナー権限分離（Anonymous Auth + adminKey）の移行猶予を終了し、未claim店舗への書き込み許可ブランチを削除する。
**受け入れ条件**:
- [ ] 本番のアクティブ店舗のオーナーclaim状況を確認する（`shops/*/owners` が存在する店舗の割合。直近1〜2ヶ月にlastActivityがある店舗がすべてclaim済みであること）
- [ ] `database.rules.tightened.json` の内容を `database.rules.json` に反映してdev→本番の順にデプロイする
- [ ] デプロイ後にスタッフ提出・管理者書き込み・新規店舗作成の実機確認を行う
**影響範囲**: database.rules.json のみ（クライアント変更なし。クライアントは既にclaim済み前提で動作する）
**備考**: 開始日 2026-07-07（本番ルールデプロイ日）。**2〜4週間後（2026-07-21〜08-04）に着手する。** 猶予中の残存リスクは「未claim店舗に限り、shopIdを知る者が最初にclaimした者勝ち」（従来と同等）。claim済み店舗は管理コード（shopId.adminKey）保持者のみ管理可能。

---

## 🟢 App Check の有効化（reCAPTCHA v3）

**目的**: 正規のWebアプリ以外（curl・スクレイパー・改造クライアント）からのFirebaseアクセスを層として遮断する。SDK読込と初期化コードは実装済み（サイトキー未設定のためスキップ動作中）。
**受け入れ条件**:
- [ ] Firebaseコンソール（両プロジェクト）→ App Check → アプリを登録し、reCAPTCHA v3 サイトキーを発行する
- [ ] `app-core.js` の `APP_CHECK_SITE_KEY` にサイトキーを設定する（DEV_MODE分岐でdev/本番それぞれ）
- [ ] **未enforceの監視モードで2週間観察**し、コンソールのApp Checkメトリクスで正規トラフィックの検証成功率がほぼ100%であることを確認する
- [ ] Realtime Database と Cloud Functions のenforcementをコンソールから有効化する
**影響範囲**: app-core.js（定数1箇所）、Firebaseコンソール操作
**備考**: enforce後はRESTでの直接デバッグアクセスが遮断される点に注意（管理用途はAdmin SDK/コンソールを使う）。

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

### ✅ Anonymous Auth導入による権限分離（セキュリティ強化フェーズB）（2026-07-07）

**受け入れ条件**:
- [x] Firebase Anonymous Auth を導入し、全クライアントが `auth != null` になる（Phase1で signInAnonymously・LOCAL永続化。実ログインは従来通りNONE）
- [x] `shops/{shopId}/owners/{uid}` で管理者を管理し、settings/periods/staff/templates/tokens/global/shops の書き込みをオーナーに限定する（管理キー方式: `shops/{shopId}/private/adminKey` との照合でowners自己登録。キーはlocalStorageのみに保持しスタッフURLに露出しない）
- [x] スタッフ（URL経由）は subs への提出書き込みと閲覧のみ可能にする
- [x] `createPortalSession`・`createCheckoutSession` に Firebase Auth IDトークン検証+オーナー照合を追加
- [x] 移行: 既存店舗は管理者画面表示時のlazy claim（未claim店舗でadminKey生成→owners登録）。端末追加は管理コード（`shopId.adminKey`）入力。非オーナー端末には閲覧専用バナー表示
- [x] REST検証47項目パス（未認証全拒否・オーナー分離・乗っ取り防止・validate）+ 実機検証（claim・再claim・新規店舗作成・スタッフURL提出・3プラン）

**備考**: 猶予ルール（未claim店舗は従来通り書き込み可）でリリース。締めルールは `database.rules.tightened.json` に準備済み → 上記🟡タスクで切り替える。

---

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
