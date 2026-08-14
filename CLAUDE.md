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

## 複数セッション並行時のルール（並行編集・デプロイ順序）

別チャット（別セッション）が同じ Shifty のファイルを並行して編集していることがある。着手前に「他のセッションが並行編集中」と伝えられたとき、または `git status` に自分の作業でない変更があるときは、以下を守る。

1. **混同・上書きを防ぐ**: どのファイルを自分が触るかを最初に確定し、他セッションが編集中と分かっているファイルには不用意に触らない。並行編集が確実なら `shifty-e2e-verify` スキル0.5節の git worktree 隔離手順で作業を分離する。編集前に必ず対象ファイルを Read し、想定と違う変更（見覚えのない差分）が入っていたら上書きせず報告する。
2. **デプロイは全セッションの作業が終わってからまとめて1回**: main へのマージ／push・Firebase デプロイは、並行しているすべてのセッションの作業が完了してから実施する。自分のタスクが終わっても他セッションが未完了なら、単独でデプロイせず全作業の完了を待つ。中途半端な状態を main・本番に出さない。デプロイ可否が判断できないときは、勝手にデプロイせずユーザーに全セッションの完了を確認する。

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
│   └── index.js        ← Firebase Cloud Functions（Stripe・メール送信・店舗/期間の自動削除・企業アカウント）
├── RULES.md            ← やってはいけないこと（必読）
├── firebase.json       ← Firebase Hosting / Functions 設定
├── database.rules.json ← Firebase セキュリティルール（現行・移行猶予あり）
├── database.rules.tightened.json ← 締めルール（猶予終了後に差し替え。BACKLOG参照）
├── CNAME               ← shiftyshifty.app
├── privacy.html / terms.html ← 静的ページ（プライバシー・規約）
├── ogp.png             ← OGP画像（実配信物。index.html の og:image が参照）
├── generate-ogp.js     ← ogp.png の生成元。画像を変えるときはこれを編集して再生成する
│                          （@napi-rs/canvas が必要。フォントは Hiragino Sans を明示すること）
├── blog/               ← SEO記事HTML（shift-kanri-muryou.html 等）
├── x-bot/              ← X（Twitter）自動投稿bot（独立Node環境・別途node_modules）
└── scripts/            ← 運用スクリプト（stripe-setup / seed_shops / list_shops / copy-prod-to-dev / obsidian-sync 等。service-account-*.jsonはgitignore済み）
```

**分割の仕組み**: Babel Standalone は複数の `<script type="text/babel">` を同一グローバルスコープで順に実行するため、`import`/`export` なしでファイル間参照が成立する（実証済み）。**index.html の読み込み順（utils→core→staff→admin→main）を変えてはいけない**。新しいコンポーネント・関数は所属に応じたファイルへ追加する。

## ソースファイルの内容

### app-utils.js（純粋関数・Nodeテスト対象）

```js
WD / JH_FIXED / JH_DATES   // 曜日・日本の祝日（2025〜2028）
PLAN_LIMITS / PLAN_LABELS  // プラン定義
fd(d) / pd(s) / gd(s,e)    // 日付ユーティリティ
gto() → TO / TO_START      // 時間オプション 0:00〜27:00（15分刻み・連続。翌3:00まで）
sc(cs)                     // 候補時間ソート（closed は末尾）
isHoliday / isWeekendOrHoliday(dateStr) // 土日祝判定
calcNetWorkMinutes / getBreakList / getBreaksFor / getOT // 純勤務時間計算
shiftBandInfo              // ランチ/ディナー帯判定（isBreakEligible は b5e23c1 で廃止。休憩適用は getBreaksFor が時間帯の重なりだけで判定する）
dayTypeOf(dateStr) / POSITION_DAY_TYPES // 祝日をholSat/holSunに分割した5分類（必要ポジション設定タブ用・breakTimes等には非影響）
matchPositionSlots(slots, attendees)    // 必要ポジションと出勤者の最大二部マッチング（Kuhn法・ポジション不足エラー判定＝Premium限定）
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
| ~~`authChecked`~~ | bool | **書かれるが読まれない**（app-main.js:37 で宣言。`setAuthChecked` は :119・:150・:169 で呼ばれるが、**値を読む箇所はゼロ**でAuth待ちのゲートには使われていない。#70でこの記述を訂正） |
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
| `shopTemplates` | Template[] | 曜日別候補テンプレート（shops/{shopId}/templates・店舗単位） |
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
| ~~`generateInviteCode()`~~ | **デッドコード**（app-main.js:819 に定義はあるが呼び出し元ゼロ。2026-07-08 の CompanyTab 新設で企業コード＋パスワード方式に置き換わった） |
| ~~`joinByInviteCode(code)`~~ | **存在しない**（コード上に実体なし。招待コード方式の名残の記述） |
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
| `CompanyTab` | app-admin.js | 企業連携（企業アカウント作成/ログイン・連携店舗一覧・店舗略称・スタッフ勤務先） |
| `SetTab` | app-admin.js | 設定（管理コード・属性別制限・退勤延長・Excel・期間単位・テーマ・アカウント連携） |
| `MyPageTab` | app-admin.js | マイページ（プラン確認・アップグレード・利用規約） |
| `TermsModal` | app-admin.js | 利用規約全文モーダル（`TERMS_TEXT` 定数を表示） |
| `UpgradeModal` | app-admin.js | アップグレード促進モーダル（Stripe Checkout 呼び出し） |
| `GridLegend / HeatTable / SummaryTable` | app-admin.js | シフト作成タブの操作説明レジェンド・ヒートマップ表・集計表 |
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
├── email_otps/
│   └── {uid}            ← {code, email, emailLink, expiry, attempts}（OTP・5回失敗で無効化）
├── companies/
│   └── {companyId}/     ← 企業アカウント（CompanyTab・企業コード＋パスワード方式。accounts/{uid}のcompanyLinkとは別系統）
│       ├── pub          ← {name, ownerUid, shops:{shopId:true}}（連携店舗マップ）
│       └── private/passwordHash ← パスワードハッシュ（Cloud Functions経由のみ）
└── companyCodes/
    └── {code}           ← companyId（企業コードの逆引き。companyLoginでカスタムトークン発行に使用）
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
3. **複数ユーザーでの店舗共有は「企業アカウント」方式**（2026-07-08 の CompanyTab 新設で確定）:
   - `createCompany`（Cloud Function）で企業コード（8桁）とパスワードを発行し、`companies/{companyId}` と `companyCodes/{code}` を作る
   - 別端末・別ユーザーは `companyLogin`（企業コード＋パスワード）でカスタムトークンを受け取り、`company_{companyId}` uid としてログインする
   - 店舗の追加・解除は `linkStoreToCompany` / `unlinkStoreFromCompany`（管理コード `shopId.adminKey` の提示が必要）
   - ~~旧・企業招待コード方式（`inviteCodes/{token}` + `accounts/{uid}/members`）~~: **現在は未使用**。`generateInviteCode` は app-main.js:819 に残っているが呼び出し元がなく、`joinByInviteCode` は実体自体が存在しない。`database.rules.json` の `inviteCodes` ルールも呼び出し元のない状態で維持されている（バグチェック#66）
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
| `purgeOldPeriods` | schedule 毎日（JST） | endDateが36ヶ月超の期間の period・subs・tokens を削除。`PURGE_OLD_PERIODS_DRY_RUN=true` でdry-run中（本有効化はBACKLOG参照） |
| `sendSurveyEmails` | POST `/sendSurveyEmails` | ユーザーアンケート一斉送信（要秘密トークン） |
| `createCompany` | Callable `createCompany` | 企業アカウント作成（企業コード発行・パスワードハッシュ保存・作成者オーナー店舗を連携） |
| `companyLogin` | Callable `companyLogin` | 企業コード＋パスワードで認証しカスタムトークンを発行 |
| `changeCompanyPassword` | Callable `changeCompanyPassword` | 企業パスワード変更 |
| `renameCompany` | Callable `renameCompany` | 企業名変更（作成者ポインタの表示名も更新） |
| `linkStoreToCompany` | Callable `linkStoreToCompany` | 店舗コード（shopId / shopId.adminKey）で店舗を企業に連携 |
| `unlinkStoreFromCompany` | Callable `unlinkStoreFromCompany` | 店舗の企業連携を解除 |

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

### シフト作成タブにセル操作・セル色を追加（2026-07-09〜）

1. `app-utils.js` の `CELL_COMMANDS`（セル内コマンド）/ `CELL_COLOR_LEGEND`（色・記号の意味）レジストリに**必ず登録**する
2. タブ最下部の「操作方法」レジェンド（`GridLegend`・app-admin.js）はレジストリから自動生成されるため、個別編集は不要（登録するだけで説明が自動追記される）
3. パーサ（`extractNote`・app-utils.js）もレジストリ駆動。`tests/core.test.js` の完全性テストが登録漏れ・実装との乖離を検出する
4. 既存コマンド: `h`/`k`/`x`（サフィックス）、`y`/`休`（休み希望・`adminRest`フィールドに保存・トグル式）、`締`（kind:"fixed"・店舗限定の追加出勤コマンド。詳細は下記5参照）。店舗略称バリデーション（CompanyTab）の予約語も忘れずに更新する
5. 店舗限定コマンドの例: `締`（鷄えん東通り店専用・2026-07-12追加、2026-07-12に数字と組み合わせ可能な追加出勤方式へ拡張）。出勤・退勤どちらのセルにも、単独（例:「締」）でも数字と組み合わせ（例: 出勤セル`13`+退勤セル`17締`）でも入力でき、主シフトとは別に23:00〜25:00(翌1:00)を**追加出勤**(`shift.extraStart`/`extraEnd`)として計上する（1日に2出勤が成立する）。判定は`applyEditToSubs`内でstart/endどちらかのnoteが`fixedShiftCommandFor`にマッチするかをblurごとに再評価しON/OFFする（`applyFixedShiftToSubs`という専用関数は廃止済み）。`calcNetWorkMinutes`/`shiftBandInfo`（app-utils.js）は`extraStart`/`extraEnd`を主シフトと合算する形で対応済み。ヒートマップ（`heatData`/`heatHours`）・休みカウント（`restCounts`等）・`isWorkDay`もextra期間を考慮する。店舗の識別は店舗名の部分一致（`isFixedShiftEligibleShop`）で行っており、店舗名変更で無効化されうる点に注意

---

## 既知の技術負債

- iOS Safari ズーム問題（input の fontSize<16）は 2026-07-06 に全箇所解消済み
- 残存する既知の設計課題は「shopIdを知る者=管理可」のcapabilityモデル（恒久対応は BACKLOG の Anonymous Auth 権限分離を参照）
- ~~`globalTemplates` という state/prop 名の不一致~~ → 2026-08-10 に `shopTemplates` / `setShopTemplates` / `saveShopTemplates` へ改名して解消（Firebaseパス `shops/{shopId}/templates` と localStorage キー `templates_v6` は変更なし＝データ移行不要）

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
## Shifty バグチェックレポート（2026-08-14 自動実行 #73）

### 修正済み

- **🟡 モバイル幅でシフト作成タブがページごと横スクロールしていた**（app-admin.js:1757）— `53f610f`
  「時間帯別出勤人数」のキッチン/ホールを横並びにする flex 行に `flexWrap` が無く、子の `HeatTable` は `minWidth:200`（app-admin.js:234）で縮まないため、行が親より広い **410px**（200×2＋gap10）を要求してはみ出していた。**375px で `documentElement.scrollWidth` が 432**（ビューポート375に対し +57px）。ホール側ヒートマップが `left=232 → right=432` に置かれ画面外に出るうえ、**祖先に横スクロールコンテナが無いためページ全体が横スクロールする**——右へスクロールするとヘッダー・タブバー・グリッドまで一緒にずれる。`flexWrap:"wrap"` を足し、収まらない幅でだけ縦積みにした。**375px は 432→375**（2つとも幅331pxのフル幅・top が 1490 と 1971 に分離）、**768px は横並びのまま不変**（top が同じ1293・各357px）。1400px はそもそも下段ブロックを描画しない（サイドパネル経路・app-admin.js:1041-1045）ため無影響。Chromium・WebKit 両方で確認。
  **発生条件**: `hasSplit`（キッチン/ホール分割あり）かつ `hasPanel` が false。モバイル幅では `rawPanelW` が閾値150pxに届かず `hasPanel` は**必ず** false になるため、分割運用の店舗がスマホでシフト作成タブを開くと**常に**発生していた。
  **由来**: 2026-07-09 の `62fc0ae`（横並び化）以来の既存欠陥で、直近のデザイン是正が作ったものではない。#72 までの巡回がすべて1400px幅だったため見えていなかった。

### 要確認（未修正）

- **🟢 `index.html` の `?v=` と `build:` が今回の修正を指していない**（`20260813-e785d22` のまま・app-*.js の最終変更は `53f610f`）。**申し送りのみ**——`/release-to-main` の手順63が標準工程としてバンプするため BACKLOG 化しない（二重管理になる）。バンプしないとキャッシュに旧JSが残り、上の修正が既存訪問者に届かない
- **🟢 `firebase.json` の hosting ignore に削除済みの `ogp.html` が残っている**（firebase.json:11・無害）
- **🟢 OGP画像の「7名提出済み」と表示行数4名が不一致**（ogp.png）
- **🟢 マイページに `ownerReadOnly` が渡っていない**（app-admin.js:208）。#68 から変化なし
- **🟡 固定の淡い色の帯にダークで沈む文字色が直書きされている**（閲覧のみバナー本文 2.16:1 等）→ BACKLOG化済み・**デザイン判断待ち**
- **🟡 アクセント塗り＋白文字が 2.85:1 で AA 未達**（白 on `#f87036`）→ BACKLOG化済み・**デザイン判断待ち**
- **🟡 Pro/Premium 店舗ではスタッフURLを開いた誰でも他人の提出を削除できる**（#70）→ BACKLOG化済み・仕様判断待ち
- **🟡 解約イベントだけが metadata でプランを判定している**（functions/index.js:319）→ BACKLOG化済み。Stripe実データが要るため状態変化なし
- 以下は #46〜#72 からの継続（状態変化なし）: 未claim店舗を誰でも自分の企業に取り込める根／`findActiveSubscription` の `|| live[0]`／`subscription_schedule.*` の4分岐が未購読／`planExpiry` のUTC基準計算／決済失敗フラグの誤解除／片側セルだけの日が0分／`purgeOldPeriods` のUTC日付／`getBreaksFor` の休憩判定／`generateInviteCode` のデッドコード／`urlLocked` が StaffView で未使用／`staffSectionOn` と `isCountExcluded`／SubsTab「月計」の別名重複／`sub.shopId` が死にフィールド／店舗削除が `global/shops/{id}` を消さない／`companyCodes` の TOCTOU／略称の先勝ち／期間作成の日付検証なし／提出状況ビューのセル編集／Excel analytics の数え方／スタッフ数バーのスペーサー／`breakTimes[].tags` の残留／別名解決順の不一致／`heatHours` が `adminRest` を無視／スタッフ削除時のキー残留／`onSub` のローカルstate更新キーの不一致

### 今回の対象と見つけ方

**#72 以降のコミットは4件で、コードの変更は `7f58443`（Safari の box-shadow 修正）1件だけ**。残り3件は #72 自身の記録・訂正コミットである。つまり**新しく入った変更を検査する余地はほとんど無く、今回の中身は #72 が指名した宿題そのもの**になった。

**(1) 宿題の実行 — モバイル幅（375px）での「はみ出し・重なり」を全DOM実測。ここで唯一の実害が出た**。`getBoundingClientRect()` がビューポート右端を越える要素と、`scrollWidth > clientWidth` かつ `overflow-x` が `visible`/`hidden` な要素（＝スクロールで救われない要素）を全DOMから列挙する検査を書き、**管理者8タブ全部＋スタッフ画面＋ログイン画面＋モーダル3種**を375pxで巡回した。**祖先に有効な横スクロールコンテナがある要素は除外**しないと、意図的な横スクロール表（ヒートマップ・集計表）が大量に偽陽性として出るため、祖先チェーンを辿って除外する実装にした。

結果は**シフト作成タブの1件のみ**（`pageScrollWidth` 432 vs 375）で、他の7タブ・スタッフ画面・ログイン画面・モーダル3種はすべて 375/375・0件だった。#72 が理由に挙げた「タブ列の `flexWrap` と Phase 3 の `marginLeft:"auto"` が折り返し時に空白を作るのでは」という仮説は**外れ**で、実際の破綻は**まったく別の場所（ヒートマップの横並び）**にあった。

**(2) 偽陽性の除去でつまずいた点を記録する**。最初の巡回では全画面に同じ12件が出たが、これは index.html の**SEO用の非表示テキストブロック**（`clientWidth:1` に押し込まれた `h1`/`p`/`ul`）で、意図的な実装だった。「はみ出している」という条件だけでは**意図的なクリップと事故を区別できない**。判定を「ビューポートを越えたか」に寄せ、祖先スクローラで除外する形に変えてから、残ったのが本物の1件だった。

**(3) 巡回の取りこぼしを潰した**。1回目のスクリプトは同じページ上でタブを順にクリックする作りで、**候補・企業連携・設定・マイページの4タブが「ボタンが見つからない」で測れていなかった**。タブごとに新しいブラウザコンテキストを作ってリロードから始める作りに変えたら8タブ全部が測れた。**測れなかったものを「異常なし」に数えない**ため、ここは作り直した。

**(4) 修正の副作用は「壊れないこと」ではなく「変わらないこと」を数値で示した**。`flexWrap` は全幅に影響するため、375/768/1400 の3幅で子要素の `top`/`left`/`width` を測り、**375px＝縦積み（topが1490と1971で分離）・768px＝横並び（topが同じ1293・各357px）・1400px＝そもそも下段ブロックが描画されない**ことを確認した。1400px で描画されないのは `hasPanel` が真になりヒートマップがサイドパネル経路に入るためで、**この欠陥が最初からデスクトップには存在し得なかった**ことの裏付けでもある（両エンジンで確認）。

**(5) #72 の4検査のうち、コミット内容に依存しない3つは念のため当てた**——未定義のCSS変数参照 **0件**／ダーク定義の二重管理は**乖離なし**／SVG属性内 `var()` は `app-staff.js:9` の1件で増えていない。「色リテラルを `var()` へ置換するコミット」は今回の窓に無いため、ロジック混入の差分検査（4検査の3つ目）は**発火条件を満たさず未実施**。

### 検証したこと

- `DEV_MODE`（app-core.js:12・式のまま）／`DEV_PLAN_OVERRIDE`（:125）正常
- `subs` の `set()` 全体上書き **0件**／`accounts` 全件読み **0件**／CF `.delete()` 誤用 **0件**
- 読み込み順維持（utils→core→staff→admin→main）・SRI **11本**
- `npm test` **168件パス**／`npx eslint app-*.js` **0 errors 98 warnings**／`node --check functions/index.js` OK（修正後も同じ）
- **実機実測（標準テスト店舗・`?plan=premium`）**: 375px で管理者8タブ＋スタッフ画面＋ログイン画面＋モーダル3種（スタッフの提出状況・提出一覧の詳細・利用規約）を巡回し、修正後は**全画面が `pageScrollWidth == vw`・はみ出し0件・コンソールエラー0件**。1400px でも8タブ全部が 1400/1400・0件（非回帰）。**WebKit 26.5** でも 375px で縦積み・はみ出し0件、1400px でサイドパネル経路になることを確認
- **未検証**: 実機のiOS Safari（WebKitエンジンでの確認に留まる。タッチ操作・アドレスバーの伸縮による実効ビューポート変化は未確認）／375px 以外の狭い幅（320px 等）は未測定／ダークテーマでの375px巡回は未実施（今回は横幅のみを対象にした）／🟡の実機E2E（スタッフURLでの他人の提出削除）は今回も未実施

### 総括

**#72 の指名した宿題は当たり、しかも「予想した場所」ではないところに当たった。** #72 は横幅の破綻を疑う理由として「Phase 2〜4 が padding・角丸・fontSize を広範に触った」ことを挙げていたが、**見つかった欠陥はデザイン是正とは無関係の、2026-07-09 から1ヶ月以上そこにあった `flexWrap` の欠落**だった。**検査を追加する価値は「直近の変更を裏取りできること」ではなく、「これまで一度も測っていない軸を測れること」にある**——今回の収穫は新しいコミットではなく、**古いコードの見ていなかった側面**から出た。

**沈黙する欠陥の2例目を、同じ方法論で捕まえた。** #72 のコントラストと今回の横幅は、どちらも **`npm test` も `eslint` も通り、コンソールに何も出ず、目視レビューでも1400pxで見ている限り絶対に気づけない**という性質を共有する。違いは、コントラストが「色を指定した結果」だったのに対し、今回は「**レイアウトを指定しなかった結果**」だという点である。`flexWrap` は書かれていないので grep では探せない。**「どこにも書かれていないから壊れている」種類の欠陥は、コードを読む検査では届かず、描画結果を測る検査でしか出てこない**——これは #72 が `body` の `color` 欠落について書いたことと同じ構造で、2回続けて同じ形の欠陥が出たことになる。

**影響の大きさは、プロダクトの前提と照らして初めて分かった。** 「ページが57px横にずれる」だけなら軽微に見えるが、VISION の設計原則4は**モバイルファースト**を掲げ、ターゲットは「スマートフォンでの利用を前提とする」飲食店のシフト作成担当者である。そして発生条件（分割運用＋モバイル幅）は**回避不能**——モバイルでは `hasPanel` が必ず false になるため、キッチン/ホールを分けている店舗は**スマホで開けば毎回**この状態だった。**Premium の主機能が、主要な利用環境で崩れていた**という点で #72 と同じ場所を踏んでいる。

**「測れなかったもの」を成功に数えない運用を1つ守れた。** 1回目の巡回は4タブが測れないまま「他は0件」という結果を返してきており、そのまま報告すれば**カバレッジ8タブ中4タブの検査を「異常なし」と書くことになっていた**。タブごとにコンテキストを作り直して8タブ全部を実測し直した。同じ理由で、モーダル3種とログイン画面も**タブ巡回では一度も開かれない画面**として明示的に測った。それでも iOS 実機・320px幅・ダークでの375px巡回は測っていないので、上に「未検証」として残した。

**次回の手を1つに絞る。** 今回も「指定ではなく結果を測る」で成果が出たので、同じ軸を**もう一段深く**する。**次は 375px の縦方向、つまり「操作できるか」を実測する**——具体的には、**タップ可能要素（`button`・`select`・`input`）の実寸を全DOMで測り、44×44px（Apple HIG の最小タップ領域）を下回るものと、互いに 8px 未満まで近接しているものを列挙する**。理由は3つ: ①今回の巡回で管理者タブのボタンが375pxでは2段に折り返っており、**押し間違いが起きうる密度**になっていることをスクリーンショットで観測した ②`fontSize` 16px 以上のルールは iOS のズーム防止のためのもので、**タップ領域の大きさは別問題として一度も検査していない** ③横幅と同じく**コンソールに何も出ず、テストも通る**。**コードと実機だけで閉じられ、ユーザー判断を要しない。**

**CF側の宿題（#68 の2つ目）は今回も持ち越し。** `resolveShopMeta` の非対称は「コードの非対称は確実・発火は Stripe 次第」のままで、**実購入テストのダウングレード発火直後に subscription の `metadata.plan` を1回読む**だけで閉じられる。この紐付けは維持する。
<!-- BUG_CHECK_LATEST_END -->

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

## 🟡 デザイン是正の残り: 色のコントラストを決め切る（2件・どちらもライトの見た目とのトレードオフ）

**目的**: デザイン是正 Phase 1〜5 の後にダーク／ライト両テーマのコントラストを全DOMで実測した結果、**「実装の誤り」ではなく「どの色を正とするか」でしか閉じられない2件**が残った。どちらもライトモードの見た目を変えずに直す方法が無く、色の選択がユーザー判断になる。決まればループが実装できる。

**測り方（再現手順）**: `getComputedStyle` から前景色と実効背景色（祖先を辿って透明を合成）を取り、WCAG のコントラスト比を計算して閾値未満を列挙する。**色の破損はコンソールに何も出ず `npm test`・`eslint` も通る**ため、目視レビューでは落ちる。ダーク実測で当初118件、うち「色指定がなく既定の黒になっていた」24件は `3490707` で解消済み（残94件が下記）。

**決めること1: 固定の淡い色の帯にダークで沈む文字色が直書きされている（残94件の主要部分）**

- 実測例: 閲覧のみバナーの本文 `#92400E` on 合成後 `rgb(38,37,39)` = **2.16:1**（見出しも4.18:1）。同じ形が DEMOバナー（`#C2410C`/`#9A3412`）・決済失敗バナー（`#DC2626`/`#B91C1C`）にもある
- 原因: 背景が `rgba(245,158,11,.1)` のような淡いティントで、**ライトでは白に載って淡黄色、ダークでは暗い背景に載って暗色**になる。一方で文字色は濃い茶系が直書きなので、ダークでは暗色の上に暗色が乗る
- inline style では `@media`／`data-theme` を書けないため、テーマで文字色を切り替えるには CSS変数の新設が必要
  - **案A: 帯の背景をティントではなく固定の明るい色にする**（例 `rgba(245,158,11,.1)` → その合成結果 `#FEF6E7`）。ライトの見た目は完全に不変で、ダークでは「暗い画面に明るい帯」になる
  - **案B: `--c-warn-bg`／`--c-warn-text` 等をテーマごとに定義して切り替える**（ライト不変・ダークでも馴染むが、変数が増える）
  - **案C: 現状維持**（ダークの利用者にだけ読めない帯が残る）

**決めること2: アクセント塗り＋白文字が 2.85:1 で AA を満たさない（Phase 3 が自ら基準にした値より悪い）**

- 実測: 白文字 on `#f87036` = **2.85:1**（AA は通常文字 4.5:1）。タブバー・主要ボタン・選択状態・「変更あり」バッジなど**アクセント塗りの全箇所**が該当
- **Phase 3（`7357531`）はスタッフ画面の出勤/休みの選択状態について「従来は出勤=薄オレンジ地に茶文字(3.88:1)で同化していた」ことを理由に塗りへ変更したが、変更後の白 on アクセントは 2.85:1 で、問題として挙げた 3.88:1 より悪い**（休み側は `--c-danger` #DC2626 + 白 = 4.83:1 で改善しており、こちらは commit の記述どおり。数値は再計算で commit と一致することを確認済み）
  - **案A: 塗り用に暗いオレンジを1つ増やす**（例 `#C2410C` + 白 = 5.18:1）。ブランドのオレンジは変えずに「塗りの上に文字を置くとき専用の色」を持つ
  - **案B: アクセント塗りの上は文字を大きく／太くする**（18.66px以上の太字なら AA は 3:1 なので 2.85:1 でもなお不足。実質は案Aか案Cになる）
  - **案C: 現状維持**（ブランドの一貫性を取り、AA未達を受け入れる）

**受け入れ条件**:
- [ ] 決めること1・2それぞれで案を選ぶ（**ユーザー判断**）
- [ ] 決めた案を実装し、ダーク／ライト両テーマで再実測して閾値未満の件数が想定どおり減ることを確認する
- [ ] ライトモードの見た目が変わらない（または変わる範囲を承知している）ことを確認する
- [ ] `?v=` と `build:` のバンプはリリース工程（`/release-to-main` 手順63）で行う

**影響範囲**: index.html（CSS変数を増やす場合）、app-admin.js（3バナー・タブ・バッジ・ボタン）、app-staff.js（出勤/休みの選択状態・CellEditPanel）、app-core.js（`AB` 等のスタイル定数）
**備考**: バグチェック#72（2026-08-13）で検出・**条件B（仕様＝デザイン判断）に該当**。グローバル指示「UIデザインの基準」により、検出結果を一括修正で先行させずユーザーの合意を得てから直す。既定の黒に依存していた24件（最悪1.18:1・シフト作成タブ）は判断不要の実装バグだったため同日 `3490707` で修正済み。

---

## 🔴 デモURLの課金・オーナー権限の穴を本番へ反映する（修正済み・リリース待ち）

**目的**: バグチェック#67（2026-08-11）で、**本番で公開中のデモURL（`https://shiftyshifty.app/#/demo`）から2つの穴が開いていることを検出した**。修正は develop に入っている（`8e50036`・`12776cd`）が、**本番は今も穴が開いたまま**である。デモは広告からの流入先なので、放置している間ずっと不特定多数に露出している。

**本番で今起きていること**:
- **🔴 訪問者が、自分のものではないデモ店舗のStripe決済ページへ飛ばされる**。デモは `plan` を premium 固定で描画するためマイページに「Proプランに変更」「請求・解約の管理」が出る。押すと `changePlan`（契約が無いので409）→ `createCheckoutSession` へフォールバックし、実在するデモ店舗の決済ページへ遷移する。**誰かが決済を完了すると、その人は自分のものでない店舗に月額課金され**、さらに `accounts/demo-toriMatsu-v1/stripeCustomerId` が入るため、**以後のデモ訪問者が「請求管理」からその人のStripeポータル（請求履歴・カード情報・解約）を開ける**
- **🟡 訪問者が、本番のデモ店舗のオーナー権限を自分の企業アカウントに取れる**。デモ画面からGoogle/メールでログイン →企業連携タブ→企業アカウント作成、で `createCompany` にデモ店舗のshopIdが渡り、`registerCompanyAsOwner` が Admin SDK で `shops/demo-toriMatsu-v1/owners/company_X` を書く。以後その企業ログインでデモ店舗を書き換えられる（デモ画面の改ざん）
- **成立の理由**: 本番のデモ店舗は `owners` が**空**（2026-08-11 実測）。Cloud Functions の `verifyShopOwner` は「未claim店舗は移行猶予として許可」するため、**匿名の訪問者でもオーナー照合を通過する**。dev のデモ店舗は owners が3件あるため**この穴は本番でしか再現しない**

**受け入れ条件**:
- [ ] develop を main へマージして本番配信する（`8e50036`・`12776cd`・および未リリースの `99d8cd5`）
- [ ] **`index.html` の `?v=` を必ずバンプする**。develop・main とも現在 `20260811-83a7bf5` で同値のため、バンプしないと既存訪問者のブラウザキャッシュに旧 app-admin.js / app-main.js が残り、**穴が閉じない**
- [ ] `cd functions && firebase deploy --only functions --project ontheshift` を実行する（デモ店舗を課金3エンドポイントと企業連携で拒否する変更が入っている）
- [ ] 反映後、本番の `#/demo` でマイページを開き、プラン変更セクションと請求管理ボタンが出ないことを目視で確認する
- [ ] `accounts/demo-toriMatsu-v1` が存在しない（＝誰も決済していない）ことを確認する。存在した場合は、その契約の解約・返金対応が要る

**影響範囲**: app-admin.js（MyPageTab・`requestPlanAction`・`openPortal`）、app-main.js（`_callCF`）、functions/index.js（`createCheckoutSession`・`changePlan`・`createPortalSession`・`createCompany`・`linkStoreToCompany`）、index.html（キャッシュ版数）
**備考**: バグチェック#67（2026-08-11）で検出・**条件A（ユーザーにしか実行できない操作）に該当**。main へのpushと本番デプロイはループの権限外で、PreToolUseフックが機械的にブロックする。**クライアントとCFはどちらを先に出しても壊れない**（CFの追加は拒否条件のみで、旧クライアントの正規利用を妨げない）。なお今回の修正はデモ店舗をdenylistに入れる**対症療法**であり、根（未claim店舗は誰でも自分の企業に取り込める）は下の「企業連携の解除が…」タスクで決着させる必要がある。

---

## 🟡 Webhook の疎通確認と、解約済みテスト契約の残骸データの整理

**目的**: 2026-08-11 のCF本番デプロイ後、`stripeWebhook` のログに18件の署名検証失敗（400）が並んでいたため一時「本番のWebhookが全滅している」と判断したが、**Stripeダッシュボードの実測でこれは誤りと判明した**。実際に残っている課題は2つ（疎通の未確認・解約済み契約の残骸データ）だけである。

**誤警報だった経緯（2026-08-11・記録として残す）**:
- 当初の判断: ログ上18件すべて400・成功系ログ0件・実課金店舗の `planExpiry`(2026-08-09) と失敗時刻が一致 → 「更新請求のWebhookが失われた」
- **実測による否定**: ①エンドポイントは `charming-euphoria` の**1つだけ**で**エラー発生率0%**（重複登録もテストモードの二重登録もない）②対象2契約は **2026/07/09 に作成され同日 19:27/19:28 に解約・全額返金済み**、契約期間は 2026/07/09〜2026/08/09 ③**2026/07/12 以降のイベントは `balance.available` 1件のみ**
- **結論**: 7/09以降そもそも配信すべきイベントが無く、**配信0は正常**。`planExpiry=2026-08-09` は「更新の取りこぼし」ではなく**購入日+1ヶ月がそのまま書かれた値**で、契約期間の表示と一致する。18件の400は **Stripe CLI**（`stripe listen`/`stripe trigger`）由来で、CLIは登録エンドポイントとは別の `whsec_` で署名するため一致しない（ダッシュボードの配信カウントにも乗らない＝実際0件）
- **`STRIPE_WEBHOOK_SECRET` は正しい。差し替えてはいけない**（39バイト＝`whsec_`+32文字で形式も正常）
- **教訓**: 「成功ログが無い」を「失敗している証拠」として読んだのが誤り。実際は「送られていないから何も無い」だった。ログ保持が約3時間しかなく、そこにたまたまCLIテストの塊が入っていたのを全体像として扱ってしまった。**ログの保持範囲を確認せず、その窓の中身を代表値として扱わないこと。**

**受け入れ条件**:
- [x] **残骸データの整理（2026-08-11 完了）**: 対象は **`mKdff4?v88uPN=B=eEsc&WHW` の1件のみ**と特定した。店舗名が **「あ」**、`lastActivity` が作成時刻（2026-07-09T10:15:09Z ＝ JST 19:15:09）のまま更新されていない**試験課金用の捨て店舗**で、`stripeCustomerId` が `cus_Uqwu81keEbgVBe`＝解約済みPremium契約の顧客IDと一致した。解約ハンドラと同じ動作（`plan="free"` ＋ `planExpiry` 削除・`stripeCustomerId` は Portal 用に保持）を本番へ適用済み。**他12店舗（すべて実店舗・`premium`/`2100-06-29` の自家用シード）は無変更**であることを適用後に確認済み
      - もう1件の `stripeCustomerId` 保有ノード `shop_1780453329813` は実店舗「東通り」で、`planExpiry:2100-06-29` の手動シード＝Webhook由来ではないため**対象外**（触らない）
- [x] **疎通確認（2026-08-11 完了・実購入テストで検証）**: 本番モードにはテストイベントを送る手段が無い（①「…」メニューにテスト送信が無い ②ワークベンチShellは本番で読み取り専用 ③7/09イベントの再送は30日制限）ことを確認したため、**テスト店舗で Pro(¥500) を実購入して検証した**（後日返金）。
      - 検証店舗: `_kcHL+eJi8MRHWJacGDU8vWn`（テスト_20260811）。**開始時点で `accounts/{shopId}` が `null`＝Webhook以外にデータが生まれる経路が無い状態**から実施
      - **購入**: 16:54 に2件の200（`checkout.session.completed` と初回 `invoice.payment_succeeded`）。両方で `プラン更新完了: plan=pro customerId=cus_V32XoHaPVHxVBL`。`accounts` が `null` → `{plan:"pro", planExpiry:"2026-09-10", stripeCustomerId:...}`
      - **即時解約**: 17:09 に200 ＋ `プランFreeに戻す`。`accounts` → `{plan:"free", stripeCustomerId:...}`（`planExpiry` も正しく削除）
      - **結論**: `STRIPE_WEBHOOK_SECRET` は正しく、署名検証は通る。`4acd089`（店舗特定）・`eee5096`（解約時のプラン照合）・`3fccd20`（更新時の降格防止）が実データで機能することを確認した
      - **未検証のまま残るもの**: `7d21104`（`linkStoreToCompany` の認可）は企業連携の経路で課金とは別系統のため、この테スト では通っていない

---

## 🟡（新規）カスタマーポータルの解約がアプリに伝わらない（`customer.subscription.updated` を捨てている）

> **✅ 実装・本番反映まで完了（2026-08-11・`2123952` / `7767551` / `b73bba4`・リリース `88a4ca5`）**
> デプロイ順序は rules → Cloud Functions → mainリリース（ルール変更が読み取りの「追加」のため、通常の「クライアント先」とは逆）。本番配信6ファイルが origin/main とバイト一致することを確認済み。
> `customer.subscription.updated` を処理して `cancelAtPeriodEnd` / `currentPeriodEnd` を保存し、マイページに「解約済み・YYYY-MM-DD をもって終了します」を表示する。降格自体は従来どおり `customer.subscription.deleted` で行う（払い済み期間は使えるまま）。
> **残: 実購入テストでの最終確認のみ**（dev では解約予約・変更予約の両バナーを実機確認済み）。

**目的**: 2026-08-11 の実購入テストで判明。ユーザーがアプリの正規導線（マイページ → 請求管理 → カスタマーポータル）から解約すると、Stripeは**「期間終了時に解約」**として扱い、`customer.subscription.updated`（`cancel_at_period_end=true`）を送る。エンドポイントはこのイベントを購読済みで**実際に届いている**（2件・いずれも200）が、`stripeWebhook` に分岐が無いため**何もせず捨てている**。
**結果として起きていること**:
- 解約してもマイページの表示は `pro`・「2026-09-10 まで有効」のままで、**「解約済み・9/10で終了」という状態がどこにも出ない**。ユーザーからは解約が効いていないように見える
- 実際の降格は期間終了時に `customer.subscription.deleted` が飛んだ時点で正しく起きる（＝データとしては最終的に正しくなる）。**壊れているのは「解約したことが分かるか」というUXの部分**
**受け入れ条件**:
- [ ] `stripeWebhook` に `customer.subscription.updated` の分岐を追加し、`cancel_at_period_end` と `current_period_end` を `accounts/{shopId}` へ保存する
- [ ] 解約予約を取り消した場合（ポータルの「サブスクリプションをキャンセルしない」）にフラグが戻ることも確認する
- [ ] MyPageTab に「解約済み・YYYY-MM-DD で終了します」を表示する
- [ ] プラン降格そのものは従来どおり `customer.subscription.deleted` で行う（期間終了まで使える仕様は維持する）
**影響範囲**: functions/index.js（`stripeWebhook`）、app-main.js（購読の追加）、app-admin.js（MyPageTab の表示）
**備考**: 2026-08-11 の実購入テストで検出。下の「二重課金の根治」の受け入れ条件にある「`customer.subscription.updated` の処理が必要か検討する」への**答えは Yes** で確定した。単独でも実装できるが、二重課金の根治と同じファイルを触るため一緒にやるのが効率的。

---

## 🟢（新規）planExpiry がUTC基準で計算され、JST午前9時以降の購入で1日短く表示される

**目的**: 2026-08-11 の実購入テストで判明。[functions/index.js:253](functions/index.js) は `new Date()` から1ヶ月後を求めて `toISOString().split("T")[0]` で日付にしているが、Cloud Functions のサーバー時刻はUTCのため、**JST 9:00〜24:00 の購入は日付が1日巻き戻る**。実測では JST 2026-08-11 01:54（UTC 08-10 16:54）の購入で `planExpiry = "2026-09-10"` となり、JSTの感覚（9/11）と1日ずれた。
**受け入れ条件**:
- [ ] `planExpiry` をJST基準で算出する（UTC+9してから日付を取る）
- [ ] 既存の `planExpiry` を持つアカウントの扱いを決める（放置でよいか、次回更新時に自然に直るか）
**影響範囲**: functions/index.js（`stripeWebhook` の expiry 計算1箇所）
**備考**: 2026-08-11 の実購入テストで検出。`planExpiry` は表示専用（app-admin.js:3957 の「〜まで有効」）で機能ゲートは `plan` のみを見るため実害は軽微。既知の🟢「`purgeOldPeriods` のカットオフがUTC日付」と同種の取りこぼし。
**影響範囲**: 本番Firebase の `accounts/{shopId}`（データのみ・コード変更なし）、Stripeダッシュボード操作
**備考**: 2026-08-11 のCF本番デプロイ後の確認で検出。残骸データの整理はユーザーの明示指示を得て同日実行済み。疎通確認は**条件A（ユーザーにしか実行できない操作）に該当**し、案Bを採る場合は実課金を伴うためユーザー判断が要る。

---

## 🔴 Pro→Premium アップグレードの二重課金を根治する

> **✅ 実装・本番反映まで完了（2026-08-11・`2123952` / `7767551` / `b73bba4`・リリース `88a4ca5`）**
> デプロイ順序は rules → Cloud Functions → mainリリース（ルール変更が読み取りの「追加」のため、通常の「クライアント先」とは逆）。本番配信6ファイルが origin/main とバイト一致することを確認済み。
> 案A・案Bのいずれでもなく、**契約を作り直さず price を差し替える「案C」**で実装した（`changePlan` を新設し `subscriptions.update` を使う）。契約が増えないため二重課金が「起きない」のではなく**起こしようがない**構造になる。`createCheckoutSession` は有効な契約がある店舗を409で拒否する。Stripe側の設定変更は不要。
> **残: 実購入での全遷移検証のみ**（Pro購入 → Premiumへアップグレード＝差額請求 → Proへダウングレード＝予約表示 → 解約 → 返金）。**特にダウングレードの Subscription Schedule は Stripe API の挙動依存で、コードだけでは正しさを保証できていない。**
> **注意（本番の12店舗について）**: 自家用の12店舗は `plan:"premium"` が手動シードされているだけで Stripe の契約を持たない。マイページにプラン変更ボタンは出るが、押すと `changePlan` が「有効な契約が見つかりません」（409）を返す。
> **⚠️ 2026-08-11 訂正（バグチェック#68）**: ここに書いてあった「データは壊れないが、押しても何も起きないUXになる」は**誤り**だった。クライアントは 409 の `code:"no_subscription"` を受けると `createCheckoutSession` へフォールバックするため、実際には**新規契約のStripe決済ページへ遷移する**（localhost で fetch を模擬して実測）。完了すると Premium 表示の店舗が **Pro（500円/月）の実課金に切り替わる**。`e1c0377` で「新規のお申し込みになります／金額／毎月自動更新」を示す確認を挟むようにしたので無言の遷移はしなくなったが、**ボタンの出し分けが要るかの判断は未決のまま残る**。

**目的**: `createCheckoutSession`（functions/index.js:123）は常に `mode:"subscription"` で**新しい契約を作る**ため、Pro ユーザーがマイページで「Premiumにアップグレード」を押すと **500円/月と2,980円/月が同時に走る**。さらに Checkout に既存の `customer` を渡していないので契約ごとに別の Stripe Customer が作られ、`accounts/{shopId}/stripeCustomerId` は新しい方で上書きされる。その結果 **Customer Portal は新Premiumの顧客しか開けず、旧Proを解約する導線がアプリ内に存在しない**。
**これが原因で生じている派生問題（根治すればすべて消える）**:
- **旧Proの月次更新が支払い済みPremiumをProへ引き下げる** → `3fccd20` でガード済み（対症療法）
- **旧Proを解約するとPremiumごとFreeに落ちる** → `eee5096` でガード済み（対症療法）
- **Premiumを解約すると、契約が残っているProまで一緒にFreeへ落ちる**（functions/index.js:295）→ **未対応**。次のPro更新請求まで最大1ヶ月、支払い中なのに有料機能を失う
- **決済失敗フラグが別契約の請求成功で解除される**（functions/index.js:281）→ 未対応（実害小）
**受け入れ条件**:
- [ ] 方式を決める（**どちらを採るかはユーザー判断**）
  - 案A: Checkout に既存 `customer`（`accounts/{shopId}/stripeCustomerId`）を渡し、**旧契約を解約してから新契約を作る**
  - 案B: アップグレード/ダウングレードを **Stripe Customer Portal のプラン変更**に寄せ、`createCheckoutSession` は新規契約専用にする（Portal側の設定変更が必要）
  - **⚠️ 2026-08-11 実測: 現在のカスタマーポータルには「プラン変更」のUIが無い**（表示されるのは「サブスクリプションのキャンセル」「決済手段」「請求先情報」のみ）。案Bを採るには **Stripe側でPortal設定の「サブスクリプションの更新」を有効化し、切替可能な価格を登録する**必要があり、さらにアップグレード操作がアプリ外へ出るためUXも変わる。**この実測により案Aの方が有利になった**（コードだけで完結し、アプリ内に導線が残る）。一度「案B推奨」と報告したが撤回し、再検討する
- [ ] 1店舗が同時に2つの有効な契約を持たない状態になる
- [ ] 既に2契約になっている店舗があるか Stripe ダッシュボードで確認し、あれば手動で解消する
- [ ] 根治後、対症療法で入れたガード（`shouldApplyRenewalPlan` / 解約時のプラン照合）を残すか外すか判断する（残す場合は「多重防御として意図的に残す」とコメントに書く）
- [ ] `customer.subscription.updated`（Portalでのプラン変更）のWebhook処理が必要か検討する
**影響範囲**: functions/index.js（`createCheckoutSession`・`stripeWebhook`・`createPortalSession`）、app-admin.js（`UpgradeModal` の導線・MyPageTab）、Stripe本番設定（Customer Portal の設定変更を伴う可能性）
**備考**: バグチェック #64（2026-08-09）で検出・#65（2026-08-10）で派生2件を確認・**条件A（Stripe本番設定）と条件B（方式の選択）の両方に該当**。RULES.md「ユーザーに確認なく Stripe の本番設定を変更しない」によりループでは着手できない。**現在は Webhook のイベント種別ごとにガードを足して回る形になっており、イベントが増えるたびに同じ穴が開く**。

**根拠について（2026-08-11 訂正）**: 2026/07/09 に Pro(¥500) と Premium(¥2,980) の2契約が存在した記録を「アプリが同時に2契約を作った実データの証拠」と一度報告したが、**これは誤り**。ユーザーの申告では「Proを解約してからPremiumに登録した」操作であり、アプリが2契約を並存させた証拠にはならない（ダッシュボード上のタイムスタンプは Pro解約 19:28 / Premium請求書 19:16 と読め、申告と食い違うが、断定できる材料ではない）。**本タスクの根拠はコード側のみで十分に成立する**: `createCheckoutSession` は常に `mode:"subscription"` で新規契約を作り、既存 `customer` を渡さず、旧契約の解約も行わない。むしろ「解約をStripeの画面から手で行った」という事実自体が、**アプリ内に解約導線が存在しない**という本タスクの指摘を裏付けている。

---

## 🔴 利用規約・特定商取引法に基づく表記の整備（表記内容＋サイト表示の是正）

**目的**: 有料サブスク（Pro/Premium）を提供している以上、特定商取引法・定型約款（民法548条の2〜4）・改正特商法（2022年6月・定期購入の最終確認画面）の表示義務を満たす必要がある。2026-07-14の調査で「内容（本文）は概ね適法だが、必須の特商法表記が無く、サイトでの表示（公開場所・バージョン整合・購入前提示）に不備がある」ことが判明したため是正する。
**前提（2026-07-14確認済み・残1点）**:
- 事業者形態は**未登記（法人登記も開業届も未提出・名称「TODGE」のみ）**。ただし**Stripeで有料課金を実施している以上、特商法上は「事業者」に該当し表記義務は消えない**。未登記のため販売業者名は屋号「TODGE」単独では不可で、**運営者本人の本名**の記載が必須。
- 住所・電話番号は**「請求があれば遅滞なく開示」で代替**する方針で確定（サイト常時表示はしない）。
- [ ] **残る必要情報＝①運営者の本名（販売業者名として表示）②連絡先メールアドレス（常時表示・必須）**。この2点が揃えば `tokusho.html` を作成・導線配線できる。→ ①③④の表示是正は 2026-07-14 に実装済み（コミット`ca2caa8`）。本タスクは②の特商法表記ページのみ残。
- （参考・スコープ外）未登記での有料サービス運営は税務上の開業届未提出リスクも伴う。特商法表記とは別問題として要検討。
**受け入れ条件**:
- [ ] **特定商取引法に基づく表記**を独立ページ（例: `tokusho.html`）として新設する。記載事項: 販売業者名（上記確定値）・所在地・連絡先・販売価格（Pro 500円/Premium 2,980円 税込）・支払方法（Stripeクレカ）・支払時期（月額自動更新）・提供時期・解約/返金条件（日割り返金なし）。
- [x] **静的ページの最新版同期（2026-07-14 完了・コミット`ca2caa8`／2026-08-10 再検証）**: `terms.html` は TERMS_TEXT(v1.2) から生成され直しており、**19条すべてが欠落なく一致することをスクリプトで再確認済み**。`privacy.html` も運営者(TODGE)・36ヶ月保存期間・改定日を反映済み。バージョン混在は解消されている。
- [x] **導線の整備（2026-07-14 完了・コミット`ca2caa8`）**: ログイン画面（＝実質のランディング。`index.html` はSPAのシェルでリンクはReact側が描画する）のフッターに利用規約・プライバシーポリシーを常時表示（app-admin.js:3810-3811）。`UpgradeModal` にも規約リンクを追加（:4173-4175）。**特商法表記へのリンクだけは、ページ本体が未作成のため未配線**。
- [x] **購入前の明示（2026-07-14 完了・コミット`ca2caa8`）**: `UpgradeModal` に「月額料金の自動更新（定期課金）／表示価格は税込・1店舗あたり／Stripeを通じて毎月自動課金／解約はマイページのStripeカスタマーポータルから／期間途中の日割り返金なし」を明示（app-admin.js:4171付近）。
**影響範囲**: 新規 `tokusho.html`、既存 `terms.html`・`privacy.html`（内容更新）、`index.html`（フッターリンク）、app-admin.js（`UpgradeModal`・規約導線）。正本はObsidian利用規約.md。
**備考**: 調査日 2026-07-14。本文の免責条項（第10条・故意重過失を除外し12ヶ月料金を上限）は消費者契約法8条の全部免責には当たらず概ね適法と判断。最大の欠落は「特商法表記ページの不在」と「静的terms.htmlの旧版残存」。

---

## 🟡 解約イベントだけが「契約の実際のprice」ではなく metadata でプランを判定している

**目的**: `resolveShopMeta`（functions/index.js:319）は冒頭で `if (md && md.shopId) return { shopId: md.shopId, plan: md.plan || null }` と早期returnする。**イベント本体が Subscription オブジェクトそのものである `customer.subscription.deleted` / `customer.subscription.updated` は必ずこの行で返るため、同関数が下（:336）で行っている「プランは metadata ではなく契約の実際のprice から解決する」という処置がこの2イベントには一切適用されない。** その :336 のコメント自体が「metadata を信じると降格を巻き戻す」と書いており、`99d8cd5` はまさにそれを直した修正だったが、**修正が届いたのは invoice 経路（subscription を retrieve する分岐）だけ**だった。

**これが問題になる経路**: `customer.subscription.deleted` のハンドラ（:557）は、受け取った `plan` と DB の現行プランが食い違うと「別契約の解約」とみなして**ダウングレードを丸ごとスキップする**（:563）。したがって subscription の `metadata.plan` と `accounts/{shopId}/plan` が一度でも食い違うと、**解約しても店舗が有料プランのまま残り続ける**（契約は消えているので以後イベントは二度と来ない＝自動回復しない＝無償で有料機能が使えたままになる）。
- 食い違いが生まれうる形: 期間終了時ダウングレード（Subscription Schedule）は price を差し替える。`customer.subscription.updated` は price からプランを解決して DB を更新する（:517）一方、subscription の `metadata.plan` は**フェーズのmetadataがStripe側で適用されて初めて**追随する。コード中のコメント自身がこれを「多重防御」と呼んでおり確実性は前提にされていない。Stripeダッシュボードから手作業でpriceを変えた場合も同じ食い違いになる。

**受け入れ条件**:
- [ ] `resolveShopMeta` が、対象が Subscription オブジェクトのときは `planOfSubscription()`（price 由来）を優先し、解決できないときだけ `metadata.plan` にフォールバックするようにする
- [ ] `customer.subscription.deleted` の「プラン不一致ならスキップ」ガードを残すか外すかを決める。`createCheckoutSession` が有効契約のある店舗を409で拒否するようになった今、**1店舗2契約はもう構造的に作れない**ため、このガードの前提（2契約併存）は既に消えている（**ユーザー判断**）
- [ ] Stripe のテスト環境またはテスト店舗の実購入で「ダウングレード予約 → 期間終了で切替 → 解約」を通し、解約後に `plan` が `free` に落ちることを実データで確認する
**影響範囲**: functions/index.js（`resolveShopMeta`・`customer.subscription.deleted` ハンドラ）
**備考**: バグチェック#68（2026-08-11）で検出・**条件A（Cloud Functionsの本番デプロイとStripe実データでの確認）に該当**。ループ内では Stripe の状態を再現できないため未修正。**コード上の非対称は確実だが、「実際に食い違いが発生するか」は Stripe がフェーズのmetadataを適用するかに依存し未検証**。上の「実購入での全遷移検証」（二重課金タスクの残作業）と同じ操作で確認できるので、まとめて実施するのが効率的。

---

## 🟡 企業連携の解除が、稼働中の店舗を「オーナー0人」に戻してしまう

**目的**: `unlinkStoreFromCompany`（functions/index.js:815）は `shops/{shopId}/owners/company_{companyId}` を無条件に削除する。企業ログインのセッションで作った店舗はオーナーが企業uidだけなので、**解除すると owners が空になる**。`linkStoreToCompany` は未claim店舗（`allowed = !owners`・:798）を**管理キーなしで連携できる**ため、その隙に shopId を知る第三者が自分の企業へ連携してオーナーになれる。shopId はスタッフURLの `tokens` 逆引きから辿れるため、店舗コードは秘密情報として扱えない。
**受け入れ条件**:
- [ ] 「最後のオーナーを外したときにどうするか」を決める（**ユーザー判断**）
  - 案A: 最後のオーナーは解除できない（エラーを返す）
  - 案B: 解除は許すが、`private/adminKey` を残したまま「要再claim」状態にし、`linkStoreToCompany` の未claim分岐を**adminKey必須**に変更する
  - 案C: 解除時に企業の作成者uid（`companies/{id}/pub/ownerUid`）へオーナーを移し替える
- [ ] `linkStoreToCompany` / `createCompany` の未claim分岐（「先に触った人がオーナーになれる」）の扱いを合わせて決める
- [ ] 本番13店舗が全てclaim済みであることを再確認してから適用する（締めルール切替時と同じゲート）
**影響範囲**: functions/index.js（`unlinkStoreFromCompany`・`linkStoreToCompany`・`createCompany`）、app-admin.js（CompanyTab の解除UI・エラー表示）
**備考**: バグチェック #65（2026-08-10）で検出・**条件B（仕様判断）に該当**。既存の🟢「未claim店舗は先に触った人がownerになれる」は「新規店舗作成直後の一瞬」と整理していたが、**解除操作が既存店舗を後からその状態に戻せる**点が新しい。本番13店舗は全てclaim済みのため現時点の実害はなく、解除操作を行った瞬間にだけ窓が開く。

**2026-08-11 追記（バグチェック#67）**: 同じ根に**別の入口から2回目の到達**をした。#65 は `unlinkStoreFromCompany` 経由、#67 は `createCompany` 経由（`if (owners && !owners[uid]) continue` の未claim分岐）で、**本番のデモ店舗が owners を空のまま公開されていたため、デモURLの訪問者が自分の企業のオーナーとして登録できる状態だった**。#67 ではデモ店舗をdenylistに入れる対症療法で塞いだ（上の🔴タスク）ので、**このタスクの対象は「未claim店舗を誰でも取り込める」という設計そのものの可否**に絞られる。3回目の入口が現れる前に決着させたい。

---

## 🟡 仕様判断が必要な挙動のまとめ（どちらが正しいかユーザーが決める）

**目的**: バグチェックで繰り返し検出されているが、「実装の誤り」ではなく「どちらの挙動を正とするか」の判断が必要なため、ループが手を出せずに毎回申し送られている項目をまとめて決着させる。**それぞれ独立して判断でき、決まればループが実装できる。**
**受け入れ条件**:
- [ ] **再提出で「休み」にしたとき、管理者の調整値をどうするか**（app-staff.js:167 `buildShift` → app-utils.js:190 `carryAdminShiftFields`）: 現状は `adjustedStart`/`adjustedEnd` は引き継がれるのに status は holiday のまま残り、「休みなのに調整時刻が入っている」状態になる。`adjustedStartFixed`（「締」）があるときだけ status を work に戻す実装。**案A: 休みにしたら調整値も消す／案B: 調整値があれば出勤扱いに戻す（「締」と同じ扱い）／案C: 現状維持**
- [ ] **出勤・退勤の片方だけ入力された日を何時間として数えるか**（app-utils.js:128 `calcNetWorkMinutes` の `if(st&&en)`）: 現状は勤務時間・期間集計・週/月上限判定だけが**0分**。一方でヒートマップは「出勤のみ→ランチ終わりまで／退勤のみ→ディナー始まりから」と補完して出勤者に数え（app-admin.js:767-768）、休みカウントも0.5休みとして扱う（:1105-1106）。**上限超過の見落としにつながる**。**案A: ヒートマップと同じ補完ルールで時間を数える／案B: 0分のまま（現状維持）＋UIで「時間未確定」を明示**
- [ ] **同名ポジションの登録を許すか**（#46から判断待ち）: 必要ポジション設定で同じ名前を複数登録できてしまう
- [ ] **「閲覧専用」端末に提出データの書き換え・削除を許すか**（#68で検出。app-admin.js:164 のバナー / database.rules.json:52）: 管理キーを持たない端末は `ownerReadOnly=true` になり「この端末は管理者として登録されていません（閲覧のみ）」と表示されるが、**`subs` の書き込みルールは `auth != null` だけで owner を要求していない**（スタッフがURLから提出できる必要があるため、**新規作成と更新は**ルール側で分離できない）。そのため閲覧専用端末でも提出一覧・シフト作成タブのセル編集と提出削除（管理者側の削除経路は app-main.js:1161 `saveSubs` の `flat[deletedId]=null`）が**実際にFirebaseへ通る**。バナーの文言と実際の権限が食い違っている。**案A: クライアント側で `ownerReadOnly` のとき提出の編集・削除UIを止める／案B: バナーの文言を実態に合わせる（「設定・期間・スタッフの変更のみ制限されています」）／案C: 現状維持／案D: sub 全体の削除だけをルールでオーナー限定にする（下記の訂正2を参照）**
      - **⚠️ 2026-08-12 訂正（バグチェック#69）**: ここに案Aの副作用として書いてあった「`ownerReadOnly` は Firebase 初期化前や匿名認証の遅延でも true になるため、正当なオーナーが一時的に編集不能になる」は**誤り**だった。実際は逆で、初期値は `false`（app-main.js:531）であり、true にしうる唯一の useEffect は `ready` で門番されている（app-main.js:1072-1079）。`ready` を立てる4箇所のうち `firebaseDB` が生きているのは `loadShops` 内の2箇所（:183 / :195）だけで、そこへ到達する経路は `proceed()` ＝ **`signInAnonymously()` が解決した後**である（:146-165）。Firebase未設定（:103）・DB初期化失敗（:119）の経路では `firebaseDB` が未代入のため useEffect が早期returnする。つまり**「初期化前・認証遅延の間」はバナーが出ずUIは編集可能**で、バナーが出るのは実際に claim が失敗した後だけ。唯一 true になる残りの経路は「DBは生きているがAuth初期化に失敗した」場合（:167-170）だが、そのときは書き込みがルール（`auth != null`）で本当に拒否されるので、バナーは**正しい**。**したがって案Aにこの副作用は無く、案A採用を妨げる理由は現存しない。**
      - **⚠️ 2026-08-12 訂正2（バグチェック#70）— この項目が「閲覧専用の管理者端末の話」として書かれていたのは実態の過小記述だった。**
        引用していた `app-main.js:1538` は管理者の削除経路ではなく **`StaffView` の `onDeleteSub`＝スタッフURL側の削除経路**である（管理者側は `saveSubs`・:1161）。実際に起きているのは次のことで、影響範囲は閲覧専用端末より広い:
        **`SmModal`（app-staff.js:510）は StaffView（:236・:257）と AdminView（app-admin.js:1867）の二重用途**で、削除ボタン（app-staff.js:587-591）は `plan==="pro"||plan==="premium"` かつ `onDeleteSub` が渡っていれば**提出者の全行に**描画される。StaffView は `onDeleteSub` を渡している（app-main.js:1533-1539・`shops/{sid}/subs/{subId}` を直 `remove()`）。スタッフ画面には**本人性の概念が無い**（設計原則1「スタッフに登録を求めない」）ため、**Pro/Premium 店舗では、スタッフURLを開いた誰でも他人の提出を削除できる**（確認ダイアログは相手の名前を出すだけで、権限は問わない）。ルール側も `auth != null` のみなので匿名認証で通る。
        なお「✎ 修正」（他人の提出の編集）は、通常の提出フローでも名前を選んで出し直せば同じ結果になるため**新しい能力ではない**。一方 **削除はデータを消す唯一の経路**で、VISION 原則5「データを勝手に失わない」に触れる。
        **案Dが成立する（「ルール側では分離できない」は過大だった）**: `subs/$subId` の `.write` を `auth != null && (newData.exists() || <owner判定>)` にすれば、**sub全体の削除だけ**をオーナー限定にできる。スタッフの正規フロー（新規提出・再提出）は `diffSubForFlatWrite` がフィールド単位のパスを書くだけで `newData.exists()` が真のまま通るため壊れない。分離できないのは create/update だけで、削除は分離できる。
        **判断が必要な点: スタッフ側の削除ボタンは意図した機能か**（意図なら案D＋UIの本人確認、非意図なら StaffView から `onDeleteSub` を外すだけで閉じる）。バグチェックログ#59 は「app-staff.js:236・257 スタッフ側 SmModal＝編集者がスタッフ本人なので正しい」としてこの2経路を調査対象から外していたが、**その前提が誤りだった**。
- [ ] 決まった項目はループが実装できるよう、このタスクに「決定: 案X」と追記する
**影響範囲**: app-utils.js（`carryAdminShiftFields`・`calcNetWorkMinutes`）、app-staff.js（`buildShift`）、app-admin.js（集計・上限判定・ポジション設定UI）、tests/core.test.js
**備考**: バグチェック #46・#52・#57・#64・#65 で継続検出・**条件B（仕様判断）に該当**。3項目とも「実装は難しくないが、正解が仕様側にしかない」。

---

## 🟢 招待コード方式の残骸を消すか復活させるかを決める

**目的**: 2026-07-08 の CompanyTab 新設で、複数ユーザーの店舗共有は「企業コード＋パスワード」方式（`createCompany` / `companyLogin` / `linkStoreToCompany`）に置き換わった。しかし旧・招待コード方式の残骸が**コードとセキュリティルールの両方に残っており、片方だけが生きている状態**になっている。実害はないが、次に触る人（人間・モデルとも）を確実に誤解させる。
**現状（2026-08-10 実測）**:
- `generateInviteCode`（app-main.js:819・約35行）は**定義のみで呼び出し元ゼロ**。`inviteCodeDisplay`/`inviteCodeGenLoading`（:68/:69）の2 state も未参照
- `joinByInviteCode` は**コード上に実体が存在しない**（CLAUDE.md には現行関数として載っていたため #66 で記述を是正済み）
- `database.rules.json` は 2026-07-28 の締めルール切替で `inviteCodes` に `expiresAtMs`(数値)・`uid===auth.uid` の validate を**追加している**が、その時点で既に書き込む側は死んでいた
- `accounts/{uid}/members`（招待コード方式の受け皿）は**書き込み元がゼロであることを確認済み**（2026-08-12・バグチェック#70。`grep -n "members" app-*.js functions/index.js` が0件で、ヒットするのは `database.rules.json:94` と `database.rules.tightened.json:94` のルール定義だけ）。`inviteCodes` と同じ「ルールだけが残っている」状態
**受け入れ条件**:
- [ ] 招待コード方式を**廃止するか復活させるか**を決める（**ユーザー判断**。企業コード＋パスワード方式で要件を満たせているなら廃止でよい）
- [ ] 廃止する場合: `generateInviteCode` と2 state を削除し、`database.rules.json` / `database.rules.tightened.json` の `inviteCodes`（および使われていなければ `accounts/{uid}/members`）ルールを削除する。**ルールの削除はクライアント配信後**（デプロイ順序ルール厳守）
- [x] `accounts/{uid}/members` に実際の書き込み元があるかを grep で確認してから判断する（2026-08-12 完了・書き込み元ゼロ＝ルールごと削除して差し支えない）
**影響範囲**: app-main.js（`generateInviteCode`・state 2件）、database.rules.json / database.rules.tightened.json、CLAUDE.md（#66 で是正済み）
**備考**: バグチェック#66（2026-08-10）で検出・**条件B（仕様判断）に該当**。実害ゼロのため優先度は🟢だが、「ルールだけが残っている機能」は監査のたびに再検出されるため一度決着させる価値がある。

---

## 🟢 データ保存上限④-b: dry-run観察後の36ヶ月超期間データ削除の本有効化

**目的**: dry-run で1ヶ月観察し、問題なければ実削除を有効化する。

> **⚠️ 前提が崩れていたので観察期間を引き直した（2026-08-11 判明）**
> このタスクは「dry-runリリース（`4aa100e`・2026-07-12）から1ヶ月観察」を前提に着手日を 2026-08-12 と定めていた。しかし **2026-08-11 のCF本番デプロイで `purgeOldPeriods` が `update` ではなく `create` として作られた**——つまり **`4aa100e` は develop に入っただけで本番には一度もデプロイされておらず、dry-run は1日も走っていない**。観察できるログは存在しない。
> **新しい着手日: 2026-09-11 以降**（本番稼働開始 2026-08-11 ＋ 1ヶ月）。それまでは `PURGE_OLD_PERIODS_DRY_RUN = true` のまま触らないこと。

**受け入れ条件**:
- [ ] **2026-09-11 以降に着手する**（それ以前に実削除を有効化しない）
- [ ] Cloud Functionsのログで`purgeOldPeriods`の`[dry-run]`出力を確認し、削除対象の件数・内容が想定通りであることを確認する（**日次実行なので、この時点で約30回分のログが溜まっているはず**）
- [ ] `functions/index.js`の`PURGE_OLD_PERIODS_DRY_RUN`を`false`に変更してデプロイする
- [ ] 有効化後、実際に削除が行われ`period`・`subs`・`tokens/{urlToken}`が正しく消えることを本番ログで確認する
**影響範囲**: functions/index.js（`PURGE_OLD_PERIODS_DRY_RUN`定数1箇所）
**備考**: 本番稼働開始 2026-08-11（デプロイ日）。孤児subs（periodIdが現存する期間に紐付かないもの）はこの削除の対象外（endDateという判定基準を持たないため）。列挙元は`/global/shops`のため、そこに載っていない孤児店舗の期間データは対象外（孤児店舗自体は`purgeInactiveShops`が別途処理）。**教訓: 「コミットした日」ではなく「本番にデプロイされた日」を観察期間の起点にすること**（バグチェック#65 の「いつ書かれたかではなく、いつから実際に走るかで判定する」と同じ形の見落とし）。

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

### ✅ Cloud Functions の本番デプロイ（2026-08-11 完了・課金/認可の修正4件を反映）

**実施内容**:
- [x] **本番（ontheshift）へデプロイ実行**: 14関数すべて成功（`4acd089`・`eee5096`・`3fccd20`・`7d21104` を反映）。うち **`purgeOldPeriods` は `update` ではなく `create` だった＝この関数は本番に一度も存在していなかった**（下の④-bタスクの前提が崩れているため同タスクを更新済み）
- [x] **CFログで `stripeWebhook` の起動を確認**: `firebase functions:list` で14関数の稼働を確認、監査ログの UpdateFunction が granted:true で完了
- [ ] **未達＝ここで新しい🔴を検出した**: Webhook 送信ログの直近イベントは 200 ではなく、**18件すべて 400（署名検証失敗）**だった。→ 実装待ちの「Stripe Webhook の署名検証が本番で失敗し続けている」へ分離
- [ ] **未達（上の🔴が直るまで実施しても意味がない）**: 署名検証で落ちるため、解約イベントを発火させても業務ロジックに到達しない
**残る実害**: デプロイ自体は完了したが、**Webhookの署名検証が通らないため4件の修正はまだ本番で効いていない**。署名シークレットを直した時点で初めて有効になる。
**備考**: バグチェック #61・#64・#65 で検出。2026-08-11 にユーザーの明示指示で実行。

---

### ✅ バグチェック#44 申し送りの軽微項目（2026-08-10 完了・受け入れ条件5件すべて達成）

**目的**: 2026-07-27 バグチェック#44の「要確認（未修正）」に残った軽微項目を消化する。いずれも実行時バグではないため個別タスク化せずまとめて扱う。
**受け入れ条件**:
- [x] **「曜日別から選ぶ」ブロック移動のE2E実機確認（2026-08-10 完了）**: localhost:3000 の標準テスト店舗（`eb6AfsQv4JAht+cX*xP7fuDa`・`?plan=premium`）で 管理者画面 → 候補 → 日付別 を開き、「曜日別から選ぶ」が日付別タブ内に表示されることを実機で確認。コンソールエラー0件。あわせて 候補→テンプレ タブも表示確認（`shopTemplates` 改名の非回帰確認を兼ねる）
- [x] **`isSpecialRedDate` のユニットテスト追加（2026-08-10 完了・コミット`8167927`）**（app-utils.js:646）: posType3種（`sun`/`holSat`/`holSun`）で true、`weekday`/`sat` で false、posType未設定・settings欠損、土曜(2026-08-15)・日曜(2026-08-16)の早期return、平日の実祝日（2026-08-11 山の日）の早期return——計5テストを追加。`npm test` 160件パス
- [x] **`.git` ロックファイル残留の調査（2026-07-28 完了）**: 残骸4件（`index.stash.13.lock`・`index.stash.44869`・`index_tmp`・`index_tmp.lock`）を削除しgit正常を確認。**根本原因が判明: これらは Shifty の自動コミットフックではなく、グローバルの `security-guidance` プラグイン由来**。`diffstate.py` の `git stash create`（timeout=15秒）がタイムアウトでSIGKILLされると `.git/index.stash.<pid>[.lock]` を残す。`index_tmp*` は旧バージョンのプラグインが `.git/index_tmp` を一時indexに使っていた化石（現行版はTMPDIRの`security_hook_idx_*`に変更済み）。**重要: これらは一時index側のロックのため、通常の`git add`/`commit`が使う`.git/index.lock`とは別物で、gitをブロックしない（＝#44の「commitがindex.lock/HEAD.lockに阻まれた」障害の原因ではない）**。#44を実際にブロックした`index.lock`/`HEAD.lock`はShiftyのStopフックの`git commit`がターン終了で強制終了された痕跡で、これは別系統。恒久対策は不要（無害・低頻度）だが、再発時はこの区別を踏まえること
- [x] **`VISION.md` の作成（2026-08-10 完了・コミット`df925ca`）**（#27から継続で不在だった）: `/bug-check` と `/shifty-feature` の両ループが PHASE 0 で参照する完了基準の正本として作成。プロダクトの目的・ターゲット・プラン・設計原則6項目・バグチェックループ完了基準・機能実装ループ完了基準・やらないと決めたこと（Expo/Vite+TS/AdminLogin の理由と再着手条件）・現在の重点を記載
- [x] **`globalTemplates` の命名整理（2026-08-10 完了・コミット`5e725b0`）**: `shopTemplates` / `setShopTemplates` / `saveShopTemplates` へ改名（app-main.js 8箇所・app-admin.js 8箇所）。**Firebaseパス `shops/{shopId}/templates` と localStorage キー `templates_v6` は変更していない＝データ移行不要**。CLAUDE.md の state一覧・技術負債欄も更新済み
**影響範囲**: tests/core.test.js（テスト追加）、新規VISION.md、.git運用（フック）、app-main.js/app-admin.js（命名整理は任意・広範）
**備考**: 「変更マークの締切ゲート対象外」（app-staff.js:166）・capabilityモデルの残存リスクも#44申し送りに含まれるが、前者は仕様判断待ち、後者は上記「App Checkの有効化」で恒久対応するため本まとめには含めない。リリース時のindex.htmlキャッシュバスティング版数バンプはrelease-to-mainフローの標準工程のため別管理。


### ✅ スタッフの提出書き込み（onSub）の差分書き込み化（2026-08-10）
**実装内容**:
- [x] `onSub`（app-main.js:1464）を `saveSubs` と同じ3点の保護に寄せた: **差分書き込み**（`diffSubForFlatWrite` + `fbUpd`。以前は `fbSet` で sub 全体を set）／**関数型state更新**／**`pendingSubWritesRef` による未確定書き込みの保護**。基準となる prevSub はサーバー由来の `subsMapRef` を優先し、未着時はローカルstateへフォールバックする
- [x] **E2Eで発覚した2段目の欠陥も修正**: `diffSubForFlatWrite`（app-utils.js:572）が `!==` の参照比較だったため、StaffView が再提出のたびに全日付を `buildShift` で作り直す実装と噛み合わず、**1日直しただけで全15日付が書き込み対象になり差分書き込みが無効化されていた**。値比較（`deepEqValue`・キー順非依存・ネスト対応）に変更した
- [x] ユニットテスト5件追加（`npm test` 165件パス）。`npx eslint app-*.js` 0 errors
- [x] **実機E2E（localhost・標準テスト店舗）で確認**: 修正前は sub 全体 set → 参照比較修正前は16パス（全15日付＋updatedAt）→ 修正後は変更した1日＋updatedAt、無変更の再提出では **`updatedAt` の1パスのみ**。管理者が 8/3 に入れた `adjustedStartNote:"研修"` が、スタッフの再提出を3回繰り返しても消えないことをFirebaseの実データで確認
**残課題**: スタッフが自分で触った日については、依然としてスタッフ端末の値が優先される（`carryAdminShiftFields` の引き継ぎ範囲の問題で、これは別件＝「仕様判断が必要な挙動のまとめ」の1項目目）。

---


### ✅ セキュリティ強化: 締めルールへの切り替え＋`.indexOn: ["periodId"]` 反映（2026-07-28）

**目的**: 2026-07-07実装のオーナー権限分離（Anonymous Auth + adminKey）の移行猶予を終了し、未claim店舗への「誰でも書き込み可」ブランチを撤去。あわせて同一 database deploy で `.indexOn` を反映。
**実装内容**:
- [x] **本番claim監査（デプロイ前ゲート）**: prodサービスアカウントで `/shops` 全13店舗を監査し、全店舗claim済み（未claim0・アクティブ未claim0・課金中未claim0）を確認。締めルールで書き込み不能になる店舗が存在しないことを確認してからデプロイ。
- [x] **クライアント先行の確認**: 本番配信中の `origin/main` が既に `inviteCodes` の `expiresAtMs`/`uid` 書き込み（app-main.js:847-853）と lazy claim（app-main.js:492-528）を実装済み＝デプロイ順序ルール（クライアント→ルール）を充足。
- [x] `database.rules.tightened.json` の内容を `database.rules.json` に反映（差分は owner uid 一致必須化の11行のみ）。settings/periods/staff/templates/tokens/lastActivity/private/global-shops の書き込みを owner 限定化。inviteCodes に `expiresAtMs`(数値)・`uid===auth.uid` の validate と期限切れ読み取り拒否を追加。owners に owner による削除ブランチを追加（企業連携の店舗解除用）。
- [x] dev（thirty-dev-b6958）→ 本番（ontheshift）の順で `firebase deploy --only database`。
- [x] **REST実機検証**: 匿名認証トークンで dev 16項目・本番 11項目パス（0 fail）。未claim書き込み拒否・claim後owner書き込み許可・スタッフ提出/読み取りの非破壊・inviteCodes正常形許可/欠損uid偽装拒否・owner削除ブランチを確認。テストデータは両環境で掃除・残存なし。
- [x] `.indexOn: ["periodId"]` の有効化を `orderByChild("periodId")` クエリで本番・dev 両方確認（index未定義なら400のところ200）。
**影響範囲**: database.rules.json（コミット `dbdd9d9`）。クライアント変更なし。
**残副作用（許容）**: `saveSubs` の `touchLastActivity` が締めルール下でowner限定化により無害にno-op（`.catch(()=>{})`で握り潰し・提出自体は成功）。lastActivityはowner操作でのみ更新されるが、全13店舗がpurge対象外premiumのため実害なし。
**備考**: 実施日 2026-07-28（着手ウィンドウ2026-07-21〜08-04内）。

### ✅ データ保存上限④: 36ヶ月超のシフト期間データの自動削除（dry-runリリース）（2026-07-12）

**目的**: シフト期間・提出データの保存期間を36ヶ月（労基法の帳簿保存義務3年に整合）と定め、超過分を順次削除してデータの無限増加を止める（2026-07-09 保存上限計画の項目2・5）。
**実装内容**:
- [x] `functions/index.js`に`purgeOldPeriods`（毎日実行）を新規追加。`period.endDate`が36ヶ月を超えた期間について`period`・該当`subs`・`tokens/{urlToken}`を削除する
- [x] `endDate`が欠損・不正な期間はスキップしてログ出力（削除しない）
- [x] `PURGE_OLD_PERIODS_DRY_RUN = true`のdry-runモードでリリース。削除対象を`[dry-run]`ログに出力するのみで実削除は行わない
- [x] 孤児subs（periodIdが現存するどの期間にも紐付かない）はこのスキャンの対象外と定義（endDateという判定基準を持たないため削除しない）
- [x] 日次スキャンは`shops/{id}/periods`のみ読み（subsを含まない軽量な部分木）、36ヶ月超の期間が見つかった場合のみ`orderByChild("periodId").equalTo(periodId)`で該当subsのみ絞り込んで読む。subs全件読み取りは行わない
- [x] マイページ（MyPageTab）に告知文を追加: 「シフト期間データは終了日から36ヶ月を超えると順次削除されます（詳細は利用規約 第6条）」
**影響範囲**: functions/index.js（`purgeOldPeriods`新規）、app-admin.js（MyPageTab告知文）
**検証**: `node -c functions/index.js`で構文確認。カットオフ日計算・判定ロジック（36ヶ月超/境界/endDate不正/null）を合成データでNode手動シミュレーションし全ケースPASS（エミュレータ・dev環境Functionsデプロイ不可のため実データ確認は不可・データ保存上限①と同様の検証方法）。`npm test`82件パス・`npx eslint app-*.js`0 errors 100 warnings。dev実機で告知文の表示を確認、コンソールエラーなし。
**備考**: 実削除の有効化は別タスク（🟢 データ保存上限④-b）として1ヶ月後に着手する。

---

### ✅ データ保存上限②: subs購読を直近3ヶ月に絞り込み＋過去参照ボタン（2026-07-09）

**目的**: クライアントが起動時に `shops/{sid}/subs` を全期間ぶん購読しており、利用長期化でDL量・クライアント負荷が線形に増える問題を、データ削除なしで解決する。
**実装内容**（設計判断: 「直近期間リストからの個別購読」方式を採用）:
- [x] startSubscriptions の subs 購読を全期間一括購読から**期間ベースの部分購読**へ変更。`periods` から startDate が直近3ヶ月以内の期間＋アクティブ期間(apid)を選び、`shops/{sid}/subs` を `orderByChild("periodId").equalTo(pid)` で期間ごとに購読して subId マップにマージする（app-main.js: subsMapRef/subsListenersRef/reconcileSubs）。古い期間の subs は購読対象外でDLされない。純粋関数 `subsWindowCutoff` / `recentPeriodIds` を app-utils.js に追加しユニットテスト（6件）で検証。
- [x] 週間勤務時間・最長連勤の前期間跨ぎ計算が従来どおり動く: 最新期間の隣接前期間（2週間/1ヶ月前）は必ず3ヶ月窓に入ることをユニットテストで確認。
- [x] 提出一覧(SubsTab)・シフト作成タブ(ShiftEditTab)に「過去参照ボタン」を追加。3ヶ月より古い期間が存在するときのみ表示され、押すと全期間購読へ切り替わる（App: loadPastSubs / pastSubsLoaded を AdminView経由で受け渡し）。
- [x] スタッフURL（過去期間のURLを開いた場合）: reconcile がアクティブ期間(apid)を常に購読対象に含めるため、3ヶ月より古い期間のURLでもその期間の提出が表示される。
- [x] `database.rules.json` / `database.rules.tightened.json` の subs に `.indexOn: ["periodId"]` を追加。**クライアント配信後にデプロイする**（リリース順序ルール厳守。未デプロイ時はFirebaseがクライアント側フィルタにフォールバックし警告を出すが動作は正常）。
**影響範囲**: app-utils.js（純粋関数+export）、app-main.js（startSubscriptions/refs/loadPastSubs）、app-admin.js（AdminView/SubsTab/ShiftEditTab）、database.rules.json・database.rules.tightened.json（.indexOn）、eslint.config.js（globals）、tests/core.test.js
**検証**: `npm test` 38件パス（新規6件）・`npx eslint app-*.js` 0 errors。dev実機（標準テスト店舗）で非回帰確認: 提出一覧「件数：1」・提出状況バッジ「1」が従来どおり表示（per-period マージ経路で source:"grid" ダミー除外も維持）、過去参照ボタンは古い期間がないため非表示（正しい）、コンソールエラーなし。**未検証（データ制約）**: 3ヶ月超の実期間データが本番にまだ存在しない（運用開始1ヶ月）ため、フィルタでの実DL削減量・過去参照ボタン押下時の古いsubs読込は実データでのE2E未実施（選択ロジックはユニットテスト済み・ボタン表示条件はdev確認済み）。**次アクション**: main配信・本番確認後に `firebase deploy --only database`（dev→本番）で `.indexOn` を反映する。

---

### ✅ データ保存上限③: 利用規約の掲載（マイページ最下部にボタン）（2026-07-09）

**目的**: データの定期削除は規約上の根拠なしに実施できない。キャンセルポリシー・データの扱い・保存期間（36ヶ月）を利用規約として明示する（2026-07-09 保存上限計画の項目4）。
**受け入れ条件**:
- [x] 利用規約の文面をユーザーが確認・承認済みであること（確定済み 2026-07-09・v1.0。正本: Obsidian `Projects/Shifty/利用規約.md`。名義=TODGE・税込表記・制定日2026-07-09）
- [x] MyPageTab の一番下に「利用規約」を開くボタンを追加し、モーダル（TermsModal）で全文を表示する（本文はTERMS_TEXT定数として正本から一字一句転記。node差分チェックで正本と完全一致を確認済み）
- [x] 文面にプラン・料金（第4条）・解約（第5条・Stripeカスタマーポータル）・返金なし（第5条2項）・データ保存期間（第6条・36ヶ月／Free店舗1年未更新削除・課金中対象外）・免責（第10条）が含まれる
- [x] input/select/textarea は追加していない（対象外）
**影響範囲**: app-admin.js（MyPageTab・TERMS_TEXT定数・TermsModalコンポーネントを新規追加）
**備考**: モーダルはUpgradeModalと同様のオーバーレイ形式・pre-wrapでの全文スクロール表示。dev環境でPlaywright（Claude Preview）実機検証済み（デスクトップ・モバイル375px幅）。

---

### ✅ データ保存上限①: purgeInactiveShops の課金中店舗除外と孤児データ掃除（2026-07-09）

**目的**: 1年未更新による店舗自動削除（purgeInactiveShops・稼働中）が課金中の店舗も削除対象にしており、削除されると stripeCustomerId が消えて「記録のない課金だけが続く」事故になり得る問題への対応。
**受け入れ条件**:
- [x] `accounts/{shopId}/plan` が "pro"/"premium" の店舗はアーカイブ・削除の対象外になる（plan未設定・"free" のみ対象。`accounts/{id}/plan` を毎ループ判定して除外）
- [x] 店舗をアーカイブ→本削除する際、その店舗の periods の urlToken に対応する `tokens/{urlToken}` と `accounts/{shopId}` を同時に削除する（アーカイブ時点で削除。archived/ 退避時に periods から urlToken を回収）
- [x] `inviteCodes` の expiresAt 切れ・`email_otps` の expiry 切れエントリを日次で削除する（期限フィールド欠損エントリも削除対象に含めた）
- [x] `/global/shops` に載っていない `/shops` 配下の孤児店舗を洗い出して掃除する（2026-07-09 ユーザーが手動整理済み: テスト残骸42店舗＋関連tokens・accounts参照を削除し、本番は自己使用のpremium 13店舗のみに。再発防止として、走査起点を `global/shops` から `/shops` 本体に変更し、今後生まれる孤児も自動的に判定対象へ入るようにした）
- [x] dry-run検証（合成データによるロジック単体検証・PASS）を実行し、誤爆がないことを確認してから本番デプロイした
**影響範囲**: functions/index.js（purgeInactiveShops）のみ。クライアント変更なし
**備考**: エミュレータ（RTDB emulatorはJava必須・環境にJava未インストール）とdev環境（Functionsデプロイ不可・Sparkプラン）の両方が使えなかったため、実際の分岐ロジックを合成データ（課金中/Free×新旧、孤児あり/なし、日付破損、expiresAt欠損等7パターン）に対して手動再現し全パスすることを確認するかたちでdry-run相当の検証を行った。本番Firebaseへの読み取りアクセスは自動分類器にブロックされたため実施していない（意図通り）。

---

### ✅ 企業連携タブ新設＋他店舗ヘルプ表示＋店舗間シフト重複エラー（2026-07-08）

**実装内容**（当初のBACKLOG案から設計変更あり: SubsTabではなくシフト作成タブ（ShiftEditTab）のセル入力方式で実装）:
- [x] 管理者画面に「企業連携」タブを新設（CompanyTab）。SetTabから企業アカウント（企業コード・企業名・パスワード）と連携店舗一覧（店舗コード追加・ログイン切替・解除）を移動
- [x] 店舗ごとに略称を複数登録できる（`settings.shopAbbrs`。4文字以内・h/k/x・数字のみは予約済みで不可・他店舗との重複チェック付き）
- [x] 連携店舗一覧の各店舗をトグル展開するとスタッフ一覧が表示され、スタッフごとに勤務先店舗を複数登録できる（`settings.staffWorkplaces`）
- [x] シフト作成タブ: セルに「時間＋略称」（例: 9三）で他店舗ヘルプ判定。出勤セルのみ=ランチ帯（〜17時）、退勤セルのみ=ディナー帯（17時〜）、両方=終日ヘルプ。ヘルプセルはh/k等と同じ黄色背景で表示
- [x] ヘルプ帯は自店舗の時間帯別出勤人数（ヒートマップ）から除外
- [x] 勤務先登録済みスタッフが他店舗と時間重複するとセル赤背景＋グリッド上部にエラーパネル表示（blur確定後に判定）
- [x] 設定タブ整理: 現在のプラン表示・お問い合わせ（X）を削除、表示順を「管理コード→属性別制限→退勤延長→Excel→期間単位→テーマ→アカウント連携」に変更
- [x] バグ修正: 店舗メニュー「＋新規」で作成した店舗が `accounts/{uid}/shops` に紐付かずリロードで消える問題

**備考**: 「他店舗で登録されたスタッフの在籍店舗シフト表への自動略称表示」（旧受け入れ条件の1つ）はセル入力方式への設計変更により対象外とした。ヘルプはシフト作成者が略称サフィックスで明示的に入力する。プラン制限はShiftEditTab自体のPremium制限に従う（企業連携タブはauthユーザーなら利用可）。devでPlaywright E2E検証済み（2店舗・略称・ヘルプ3パターン・重複エラー・ヒートマップ除外）。

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
