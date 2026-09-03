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
├── database.rules.json ← Firebase セキュリティルール（現行。2026-07-28 に締めルールへ切替済み）
├── database.rules.tightened.json ← 上と**バイト単位で同一の残骸**。切替は完了済みで差し替え先としての役目は無い
│                          （消すまでは二重管理。ルールを変えたら必ず両方を同じ内容にする）
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
dayTypeOf(dateStr) / POSITION_DAY_TYPES // 祝日をholSat/holSunに分割した5分類。必要ポジション設定タブと breakTimes（休憩時間設定）が共有する（getBreakList が positionDayTypeFor で日付→区分を解決。旧4区分の "hol" データは後方互換で流用）
firebaseKeyForbiddenChars(name)          // Firebaseがキーに使えない文字（. # $ / [ ] 制御文字）の検出。スタッフ名は7つの設定マップでキーになるため追加・改名の入口で弾く
matchPositionSlots(slots, attendees)    // 必要ポジションと出勤者の最大二部マッチング（Kuhn法・ポジション不足エラー判定＝Premium限定）
genToken() / genSecureId(len)   // ランダムID生成
isSpacer(n) / resolveAlias / buildSuggestList
aliasOwnerOf(name, staffAliases, selfName)  // その名前を別名にしている他人。addAlias（登録名と同じ別名を禁止）の反対側の入口＝スタッフ追加・改名で使う。通さないと「他人の別名と同名のスタッフ」が作れ、本人の提出が別人のsubへ入る（#107）
renameStaffInSettings / renameStaffInPeriods // 改名時のキー移し替え。settings 本体と period.snapshot.settings の両方に同じものを当てる（写しだけ旧名で残ると確定済み期間のシフトが空欄になる・#107）
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
- スタッフは subs の読み書きと settings/periods/staff の読みのみ（従来機能を維持）。**subs の書き込み・削除は認証済みなら誰でも通る**（`.write: auth != null && $shopId !== 'demo-toriMatsu-v1'`）。提出を触れるのを本人だけに絞っているのは **UI（app-staff.js の `canTouch`）だけ**で、ルールは名乗った名前を検証できない——2026-08-31 決定1で承知のうえ引き受けたトレードオフなので、**再検出しても「バグ」として直さない**。
- **移行猶予は 2026-07-28 に終了済み**（`dbdd9d9`）。未claim店舗への「誰でも書き込み可」ブランチは撤去され、管理系パスは owner uid 一致が必須。**`database.rules.tightened.json` は `database.rules.json` とバイト単位で同一の残骸**で、切り替え先としての役目はもう無い（ルールを変えるときは両方を同じ内容に保つこと。2026-08-31 の `0c236ac`・`8384467` はどちらも両方を編集している）。
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

**2026-08-27 に配色を巻き戻した**: 2026-08-25 のコントラスト是正（`d22653c`／`488d7e7`）は
`--c-accent-solid`(#C2410C) など13個の変数を追加してブランドのオレンジを塗り面から外していたが、
ブランド色が変わってしまうため `1807b5b` で色の変更をすべて取り消した。**現在のアクセントは
`--c-accent`(#f87036) のみ**で、塗り・文字・枠のどれにも同じ値を使う。土日色・告知帯・
ヒートマップの濃淡も各コンポーネントに固定リテラルで直書きされた元の形に戻っている。
同コミットに同居していたタップ領域の是正（タブバー `gap:8`・削除ボタンの `marginLeft:10`）だけは残した。

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

- iOS Safari ズーム問題（input の fontSize<16）は **2026-09-01 にようやく全箇所解消**（バグチェック#103・`bc7bf2e`）。
  一括是正 `b7c084d`（2026-07-08）が見たのは app-staff.js と app-admin.js だけで、**その2日前の5分割（`f02cc80`）で
  生まれたばかりの app-main.js（フォーム部品6件）を一度も開いていない**。そのままここに「全箇所解消済み」と
  書かれ、ログイン画面の店舗コード入力（`fontSize:14`）が約2ヶ月残った。現在はフォーム部品56件を全ファイル
  走査して0件（`<input>`/`<select>`/`<textarea>` のタグ内 `fontSize` を機械的に検査）
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
## Shifty バグチェックレポート（2026-09-03 自動実行 #107）

> 着手時の HEAD は `cbeff0b`。**#106 以降に入った実コードの変更は #106 自身の `8897a25` だけ**で、
> あとはドキュメント2件。#104〜#106 と同じ状況なので、機械スキャンは「基準線が動いていないこと」の
> 確認に留め、**時間はコード読解へ回した**。
> 見つけた2件は**どちらも「同じ不変条件を守る入口が2つあり、片方だけが守っていた」**という形で、
> #105・#106 と同型だった。ただし今回は**別名の解決規則ではなく「名前そのものの扱い」**にあった。

### 修正済み

- **🟡 スタッフの改名が、確定済み（凍結）期間のシフトを丸ごと空欄にしていた**（[app-admin.js:204](app-admin.js)）→ `3976e7c`

  `onRenameStaff` は `staffList`・`subs`・設定7マップを改名する。**`subs` は全期間ぶん遡って
  書き換わる**（2026-08-21 の `1c5272b` 以前からの挙動）。一方で `period.snapshot`
  ——終了した期間の名簿・設定の写し——には**一切触っていなかった**。

  結果、確定済み期間では**「旧名の行 × 新名のsub」**になる。行は写しの `staffList` から出るのに、
  `_getSubForPeriod`（app-admin.js:563）は `subs` の `staffName` で引くため一致しない。
  同じ写しを使う **Excel（`expXl`）と PDF（`buildPdfCols`）も同じものを出す**。

  **実測**（`AdminView` を実ブラウザにマウントし保存系をスパイに差し替え。**Firebase へは
  1バイトも出していない**）。8/15 に終わった確定済み期間で「田中」→「田中太郎」と改名する:

  | | シフト作成グリッドの見出し | 8/10 の値が入ったセル |
  |---|---|---|
  | 修正前 | **「田中」のまま** | **0個** |
  | 修正後 | 「田中太郎」 | 2個（9:00 / 18:00） |

  属性・従業員番号・退勤延長も写しの側で追随することを確認した。
  **同じスクリプトを修正前の worktree（`cbeff0b`）に向けると落ちる**＝素通りするテストではない。

  皮肉なのは、**凍結機能（`1c5272b`）が入った動機がまさにこれ**だったこと——
  「配り終えた過去のシフト表から、スタッフを1人消しただけで列が黙って消える」。
  凍結は**削除**からは守れていたが、**改名**は素通りしていた。しかも凍結を入れたことで
  「写し」という2つ目の名簿ができたため、**凍結前は起きなかった**食い違いが生まれている。

  直し方は #105・#106 と同じにした——改名の規則を `app-utils.js` の
  **`renameStaffInSettings`** に出し、`settings` 本体と写しの `settings` の**両方を同じ関数に通す**。
  写しの書き換えは `renameStaffInPeriods` が担当し、**該当者が居る写しだけ**を書き換えて
  居なければ `changed=false` を返す（無駄な `savePeriods` を呼ばない。実測で呼び出しは1回）。
  `keepStaff` は触らない——削除済みの行には改名の導線が無く（`編集` ボタンが出ない）、
  旧名が入ることがないため。

- **🟡 他人の別名と同じ名前のスタッフを登録できてしまう**（[app-admin.js:2446](app-admin.js)）→ `0d6042d`

  `addAlias`（:2388）は **「登録名と同じ別名は登録できない」** を明示的に禁じている。
  ところが**反対側の入口**であるスタッフ追加（`add`）と改名（`confirmEdit`）は、
  `staffList` との重複しか見ていなかった。

  `resolveAlias`（app-utils.js:533）は**入力名が誰かの別名なら登録名へ寄せる**ため、
  他人の別名と同名のスタッフを作ると、**本人が自分の名前を入力して提出しても別人のsubになる**。

  **実測**（配信物の関数を Node で実行）。鈴木に別名「たなか」がある店舗で「たなか」を登録すると:

  | 見るもの | 結果 |
  |---|---|
  | `resolveAlias("たなか")` | **"鈴木"** |
  | 本人が提出したときの `sub.staffName` | **"鈴木"** |
  | 管理者側の「たなか」の行が引くsub | **無し（空のまま）** |
  | 名前サジェストの「たなか」 | **2件**（→鈴木 / →たなか） |

  サジェストの2件は表示テキストが同一で、片方だけが橙色の「→ 鈴木」バッジで区別される。
  クリックすれば `s.registered` が入るので正しく選べるが、**入力して Enter を押すと必ず鈴木になる**
  （app-staff.js:283 が `resolveAlias` を通すため）。

  **実ブラウザ実測**（`AdminView` をマウント・保存系はスパイ）:

  | 操作 | 修正前 | 修正後 |
  |---|---|---|
  | 「たなか」を追加 | **「✓ たなか を追加しました」で素通り** | 「▲「たなか」は 鈴木 さんの別名として登録されています」で停止・`saveStaff` は呼ばれない |
  | 高橋 →「たなか」へ改名 | 通る | 同上で停止・名簿は不変 |
  | 「佐藤」を追加（非回帰） | 通る | 通る |
  | 高橋 →「高橋太郎」へ改名（非回帰） | 通る | 通る |
  | 鈴木 →「スズキ」へ改名（自分の別名） | 通る | **通る**（他人の乗っ取りにならないため意図的に許可） |

  pageerror / console.error はいずれも 0件。
  判定は `app-utils.js` の **`aliasOwnerOf(name, staffAliases, selfName)`** に置いた。

### 調べて「バグではない」と確定したもの

- **ポジション名にも同じ改名の穴があるのでは**と疑ったが、**反証した**。ポジションは追加と削除しか
  無く（app-admin.js:4069・:4106）**改名の導線が存在しない**。削除のカスケードは現在値の
  `positions`/`requiredPositions`/`staffPositions` の中で閉じており、写しは自分のコピーを
  持つので整合が崩れない。
- **`app-staff.js:538` の未提出リストが別名の順序に依存する**と疑ったが、**反証した**。
  `some(...)` の存在判定で、どれが先に当たるかは結果を変えない。
- **`app-admin.js:596-605` の `applyEditToSubs` が6本目の未対応経路**かと疑ったが、**反証した**。
  完全一致を先に引き、無ければ別名を**登録順のループ**で引いており、`resolveSubByAlias` と
  同じ順序になる（関数を通していないが答えは一致する）。
- **`app-admin.js:3530` の月計 `wSS` が重複subを二重計上する**と疑ったが、**反証した**。
  `wSS` は日付の集合を作るだけで、分の計算は `_shiftAt`（別名解決済み・日付ごとに1件）が行う
  ——#84 で直された形のまま維持されている。
- **期限切れスタッフの設定掃除（`08a531e`）が写しまで消す**と疑ったが、**反証した**。
  掃除の対象は現在値の `settings` だけで、写しは独立したコピーを持つ（＝凍結の意図どおり）。

### 要確認（未修正）

- **🟢（新規）自分の別名へ改名すると、その別名が自分自身に残る**（app-admin.js:2443 付近）。
  鈴木（別名「スズキ」）を「スズキ」へ改名すると、`staffAliases["スズキ"]` に「スズキ」が残る。
  `resolveAlias("スズキ")` は "スズキ" を返すので**動作は正しい**が、名前サジェストに同じ表示が
  2件並ぶ。`addAlias` が禁じている状態（登録名＝別名）に改名経由で到達できる、という形。
  **表示のみ**で、今回の2件と違い提出の行き先は狂わない。次に別名まわりを触る回に揃えればよい。
- **🟢 ヒートマップの時間目盛り（`heatHours`・app-admin.js:1065）だけが素の `subs` を走査している**
  （#106 から継続）。出るのは常に0の列で数字は狂わない＝表示のみ。
- **🟢 `database.rules.tightened.json` が現行ルールとバイト同一の残骸** → **BACKLOG化済み**。
  今回も `cmp` で同一を再確認。消すか残すかは**条件B（判断）**。
- **🟢 片側セルの日は「→15:15（+15分）」の実効退勤バッジが出ない**（app-admin.js:3534付近）。表示のみ。
- **🟢 期限切れの後始末が、より古い期間にしか残っていない人の設定を消しうる**（app-admin.js:2547付近）。
  2026-08-31 決定4・案Aの範囲設定そのままなので**仕様判断（条件B）**。
- **🟢 `purgeInactiveShops` が、もう存在しない `inviteCodes` を毎日掃除している**（functions/index.js:808）。
  読み取り1回ぶんの無駄。次に `functions/` を触る回に一緒に落とせばよい（#104 から継続）。
- **引き受け済みのトレードオフ（再検出しても直さない）**: `subs/$subId/.write` は
  `auth != null && $shopId !== 'demo-toriMatsu-v1'` だけで、提出を触れるのを本人に絞っているのは
  UI（`canTouch`）のみ。2026-08-31 決定1で承知のうえ引き受けたもの。
- **変化なし・BACKLOG化済み**: 秘密鍵ログ修正の本番反映／二重課金の根治／特商法表記（🔴 2件）／
  解約通知／解約時のプラン判定／企業連携の解除／別名提出の重複（#81・根は未解決）／
  スタッフ削除の残り確認2件。

### 申し送り（BACKLOG化しない）

- **配信版数が app-*.js の変更に追いついていない**: `?v=`（index.html 5箇所）と `build:`（app-core.js）は
  `20260831-c340d5c` のままで、以後 `6613c78`・`bc7bf2e`・`abcc668`・`e2fe16a`・`8897a25`・
  **`3976e7c`・`0d6042d`** が入っている。`/release-to-main` の手順63が標準工程としてバンプするため
  申し送りのみ（#103〜#106 から継続）。

### 検証したこと

- **RULES.md のスキャン項目は全項目クリア**: `DEV_MODE` は式のまま／`subs` の `set()` 全体上書き **0件**／
  `accounts`・`shops`・`global/shops` の全件読み **0件**／読み込み順（utils→core→staff→admin→main）維持／
  SRI **11本**／**フォーム部品56件の `fontSize<16` 0件**。
- **CSS変数**: 未定義参照 **0行**／手動ダークと OS ダークの定義に差分なし。
- `npm test` **219件パス**（+10。内訳: 改名と写し 6件・別名衝突 4件）／
  `npx eslint app-*.js` **0 errors 95 warnings**（警告は増減なし）／
  `node --check functions/index.js` OK／Cloud Functions の `secrets` 指定は6箇所とも過不足なし／
  `.delete()` の誤用 **0件**。
- **devのデータは1バイトも変えていない**（実ブラウザ検証は `AdminView` の単体マウントのみ。
  保存系は全てスパイで、`app-main.js` を読み込まないので `firebaseDB` は `null` のまま）。
- **未検証**: Excel・PDF の実物確認（**15回連続**・ユーザー操作が要る。**今回の改名の件で
  対象が1つ増えた**——確定済み期間の Excel が改名後も列を保つかは、コード上は同じ
  `resolvePeriodMaster` の結果を受け取るので同じになるはずだが、ファイルを開いてはいない）／
  iOS 実機／本番データ／**既に別名と同名のスタッフが登録されている店舗があるか**
  （今回の修正は新規の登録を止めるだけで、既にある衝突は解消しない）。

### 測り方の記録

今回も**測定手段のほうが2回壊れた**（#97・#105・#106 と同じ扱いで、直して測り直した）。

1. **スパイが毎レンダリングで初期化されていた。** ハーネスの `window.__spy={...}` を
   コンポーネント本体に書いたため、改名で再レンダリングが走るたびに記録が消え、
   **「`savePeriods` 呼び出し 0回」＝修正が効いていない**ように見えた。実際にはグリッドには
   新しい名前とシフトが出ていた。`window.__spy=window.__spy||{...}` に直して解決。
2. **「追加」ボタンを一度も押していなかった。** 実際のラベルは `＋ 追加` で、完全一致で
   探していたため掴めていない。**押せたかどうかを出力に含めていたので即座に分かった**
   （`"①追加ボタン": false`）。

1 は**画面の状態とスパイの記録が食い違った**ので気づけた。2 は #106 の教訓
「**検証スクリプトには必ず『そもそも操作が届いたか』を示す値を持たせる**」を実際に適用して
拾えたもの。2回とも、**測定値をひとつしか見ていなければ間違った結論を出していた**。

### 総括

**2件とも「同じ不変条件に入口が2つあり、片方だけが守っていた」形だった。**

- 改名: `subs` は書き換えるのに**写しは書き換えない**——名簿の実体が2つある（現在値と写し）のに、
  更新する側が片方しか知らなかった。
- 別名: `addAlias` は「登録名＝別名」を禁じるのに、**`add` / `confirmEdit` は禁じない**——
  同じ禁止事項に入口が3つあり、1つだけが番人を置いていた。

#105 は「規則を1関数に出して**全経路を通す**」で閉じ、#106 は「その**経路の数え落とし**」だった。
今回は一段違う。**経路を数える前に、そもそも「これは1つの規則である」と気づく必要があった。**
`addAlias` の1行のガードと `add` の1行のガードは、コード上は無関係な別の場所にあり、
grep で機械的に結びつく共通の識別子も無い。見つかったのは
**「なぜ addAlias だけがこれを禁じているのか」と理由を問い直したから**だった。

**不変条件を1箇所で強制できないなら、せめて両方の入口から同じ関数を呼ぶ。**
今回は `renameStaffInSettings` と `aliasOwnerOf` の2つを app-utils.js に置き、
どちらも**2つ以上の入口から呼ばれる形**にした。次に入口が増えたとき、
その関数を通し忘れれば同じことが起きる——それは避けられないが、
**通すべき関数が存在すること自体が手掛かりになる。**
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

## 🟡 Stripe秘密鍵の一部がログに出続けている（修正はdevelopにある・本番反映が未実施）

**目的**: 本番にデプロイされている Cloud Functions は、`getStripe()` と `createCheckoutSession` の入口の
2箇所で `STRIPE_SECRET_KEY.substring(0,12)` を `console.log` している。`sk_live_` が8文字なので
**実際の秘密の4文字**が Cloud Logging に、決済のたびに蓄積する。単独で鍵を復元できる長さではないが、
秘密の一部をログに残す理由が無い。

**修正は `87f66ee` で develop に入っている**（バイト長だけを出す形に変更。「未設定」と
「二重ペースト・末尾改行混入による長さ異常」はバイト長で判別できるので切り分けの用途は失われない）。
**残っているのは本番への反映だけ**で、これはループの権限外（RULES.md「ループ動作中の禁止事項」）。

**受け入れ条件**:
- [ ] `functions/` を本番プロジェクト（ontheshift）へ反映する
- [ ] 反映後、`getStripe` のログ行が `loaded(<バイト数>b)` になっていることを Cloud Logging で確認する
- [ ] 既に溜まっている過去ログの扱いを決める（保持期間で自然に消えるのを待つ／手動で消す）

**影響範囲**: functions/index.js（`getStripe`・`createCheckoutSession`）
**備考**: バグチェック#102（2026-09-01）で検出・**条件A（本番デプロイはユーザー操作）に該当**。
着手時に**作業ツリーへ未コミットのまま置かれていた**修正を取り込んだもの（mtime 2026-09-01 02:02・
おそらく `diagnose-secret-corruption` 系の別セッション）。コミットされていなかったので、
`git checkout` 1回で失われる状態だった。**次に functions/ を触るリリースへまとめて載せてよい**——
単独で急いで反映するほどの露出量ではない。

---

## 🟢 `database.rules.tightened.json` が現行ルールとバイト同一の残骸になっている

**目的**: 2026-07-28（`dbdd9d9`）に締めルールへの切り替えが完了した結果、
`database.rules.tightened.json` は `database.rules.json` と **`cmp` でバイト単位まで同一**になった。
切り替え先としての役目は終わっているのに、ルールを変えるたびに**両方を手で同じ内容に保つ必要**がある
（2026-08-31 の `0c236ac`・`8384467` はどちらも両ファイルを編集している）。片方だけ直せば、
次に「締めルールに差し替える」と信じた誰かが古い内容を本番へ出す。

**受け入れ条件**:
- [ ] ファイルを削除するか、`README` 的な一行を添えて残すかを決める（**ユーザー判断**）
  - 案A: 削除する（**`firebase.json:7` は `"rules": "database.rules.json"` の1本だけを参照していることを確認済み**＝配線への影響は無い）
  - 案B: 残す（履歴として。ただし「同期させ続ける」という負債を引き受けることになる）
- [ ] 決めた側に合わせて `CLAUDE.md` のファイル構成表を更新する（**記述は 2026-09-01 の `857041e` で実態に合わせ済み**）

**影響範囲**: database.rules.tightened.json、CLAUDE.md、firebase.json（参照していないことの確認）
**備考**: バグチェック#102（2026-09-01）で検出・**条件B（消すか残すかの判断）に該当**。
同じ回で、CLAUDE.md が「移行猶予（現行ルール）: 未claim店舗は従来通り書き込み可」と
**切替前のまま**書いていたことも見つけて直した（`857041e`）。CLAUDE.md は毎セッションの
コンテキストに載るので、この記述を信じたセッションはもう存在しない前提で設計判断をしうる。

---

## 🟢 スタッフ削除時の「名前をどの期間まで残すか」の残りの確認2件（配布物の実物・確定済みラベル）

**目的**: 2026-08-24 にスタッフ削除のポップアップと `period.keepStaff` を実装した（`95a3504` 機能本体・`2d33e1e` 位置保持・`01d7214` 文言修正・`1e2b1cd` 一覧への保持と取り消し導線）。**機能は動いていて実ブラウザで18項目を検証済み**。残っているのは確認だけで、実装の宿題は無い。

> **✅ 2026-08-24 解決済み（`1e2b1cd`）— 「取り消す導線が無い」件**
> 起票時にあった案A〜Cはユーザー判断で**「スタッフ欄の同じ場所に維持し、削除する場合は再度削除ボタンを押して同じ操作をする」**に決まり、そのまま実装した。
> - 「残す」を選んだ人は、その期間の間だけ**スタッフ一覧に元の位置のまま**残る（取り消し線＋「削除済み ／ シフト表に表示中（…） ／ YYYY/MM/DD を過ぎるとこの一覧から消えます」）。`staffList` からは消えているのでプラン上限には数えない
> - **残した期間のうち最も遅い最終日を過ぎると一覧から自動で消える**（`keepStaff` は残るので、終わった期間のシフト表には名前が載ったまま）
> - 行の「削除」で同じポップアップが**今の範囲を選んだ状態**で開き、範囲の変更ができる。確定処理を「選んだ期間へ足す」から「選んだ期間へ足し、選ばなかった期間からは外す」に変えたので**解除もこの1経路で効く**（対象は最新3期間のみ）
> - **「削除を取り消す」ボタン**で、記録しておいた位置に `staffList` へ差し戻し `keepStaff` も全て外す
> - 「どの期間にも残さない」は従来どおり一覧から即削除

> **✅ 2026-08-31 解決済み（`19f7fc5`）— 既定の選択が「最新の期間まで残す」になっていた件（#101）**
> `685c219` は「8月後半 まで残す」を選んだときに 9月前半にも名前が残る取り違えを直したが、
> **何も選ばずに削除したときの既定** は `del()` の `setDelKeepCount(1)` ＝ 先頭の選択肢＝
> **いちばん新しい期間「まで残す」**のままだった。時系列の解釈では「その期間とそれより古い期間すべてに残す」
> ＝**最新3期間すべてに `keepStaff` が入る**＝これから配るシフト表に退職者の列が残る。
>
> ユーザー判断は **案B**（既定を「いちばん新しい **終了済み** の期間まで残す」）で確定。終了済みの期間が
> 1つも無ければ 0＝どの期間にも残さない。判定は純粋関数 `defaultKeepCount`（app-utils.js）に切り出し、
> ユニットテスト3件を追加した（境界＝最終日当日はまだ終了済みではない／`endDate` の無い期間は飛ばす）。
>
> **実測**（375px・実ブラウザ・`StaffTab` だけをマウントし `savePeriods` をスパイに差し替え＝dev には
> 1バイトも出していない。今日=2026-08-31／9月前半:未終了・8月後半:最終日が今日・8月前半:終了済み で
> 「田中」の削除ボタンを押しただけ）:
>
> | | 修正前 | 修正後 |
> |---|---|---|
> | 開いた時の選択 | 2026年9月前半 まで残す | **2026年8月前半 まで残す** |
> | `keepStaff` が入る期間 | 9月前半・8月後半・8月前半（**3件**） | **8月前半のみ（1件）** |
>
> pageerror・console.error ともに0件。同じスクリプトを修正前の配信物（`SHIFTY_ROOT`）に向けると
> 落ちる＝素通りするテストではないことも確認済み。

**残っているもの（どちらも確認のみ）**:

1. **Excel・PDF のファイルを実際に開いての列確認が未実施**。グリッドの列が正しい位置に出ることは実ブラウザの `th` 実測で確認済みで、`expXl`/`buildPdfCols` は同じ解決後 `staffList` を受け取るためコード上は同じになるはず。ただし**ファイルを開いて見てはいない**。#81 から続く「Excel実物の確認」と同じ性質の宿題で、**まとめて1回やれば両方閉じる**。
2. **「確定済み（選ばなくても残ります）」ラベルの表示が未確認**。写し(`snapshot`)を持つ期間でのみ出る分岐で、ロジックはユニットテストで担保しているが実ブラウザで踏んでいない。

**受け入れ条件**:
- [ ] 1: 「残す」を選んで削除したあとの Excel と PDF を実際に開き、**その人の列が元の位置に**（末尾ではなく）出ることを確認する。あわせて「残さない」を選んだ場合に**提出があれば末尾に未登録名として出る**ことも確認する
- [ ] 2: 写しを持つ期間でポップアップを開き、ラベルが出ることを確認する（`shifty-e2e-verify` 1.6節のハーネスで `snapshot` 入りの期間を渡せば足りる）
- [x] 3: **削除ポップアップの既定の選択について案A〜Cのいずれかを選ぶ（#101・ユーザー判断）** → **案B**。`del()` の既定を `defaultKeepCount(delPeriodChoices,todayStr)` に変更し、375px の実ブラウザで「削除を押しただけの状態」では最新期間に `keepStaff` が入らないことを実測済み（`19f7fc5`）

**影響範囲**: なし（確認のみ。不一致が見つかった場合に限り app-admin.js の `expXl`／`buildPdfCols` 周辺）
**備考**: バグチェック#93 と同じ日にユーザー依頼で実装した機能の申し送り・**1は条件A（ファイルを開いて目視するのはユーザーの操作）に該当**。2はループでも閉じられるので次回の実装ループで拾ってよい。**機能自体は未完成ではない**——実ブラウザで「ポップアップが最新3期間のみを出す」「選んだ期間にだけ `keepStaff` が入る」「グリッドの列が元の位置のまま残る」「残さないと指定した期間では消える」「一覧に残る・自動で消える・範囲変更・削除の取り消し」をすべて確認済み（pageerror・console error 0件）。なお `keepStaff` は `periods` ノードに載るため、上の🟡「期間の確定（写し）が `periods` ノードを肥大化させる」と同じノードを太らせるが、**1人あたり数十バイト**なので写し（1期間57KB）に比べれば無視できる。
---

## 🟡 別名で提出した人が別端末から再提出すると、同じ期間に2つのsubができてExcelが古い方を出す

**目的**: `sub.staffName` には**別名がそのまま入っている**（`registerAlias`・app-admin.js:2969 は `staffAliases` に登録するだけで `staffName` を書き換えない）。一方スタッフ画面の既存sub検索（[app-staff.js:158](app-staff.js) `existSub`）は**登録名の完全一致だけ**で探す。そのため「別名で提出済みの人が、別端末（＝Cookieなし）から名前を打ち直して再提出する」と、`resolveAlias` が登録名を返す → 既存subが見つからない → **同一人物・同一期間に2つ目のsubが作られる**。

**実測（配信物の述語をNodeで実行して確認・2026-08-18 バグチェック#81）**:
- 入力「たなか」→ `resolveAlias` → `staffName="田中"` → `subs.find(s=>s.staffName==="田中"&&…)` は**見つからない**（別名ぶんのsub Aは `staffName:"たなか"` のため）
- 結果: sub A（たなか・古い）と sub B（田中・最新）が併存し、**提出一覧には「田中」の行が2つ並ぶ**（:3010 が `resolveAlias` 済みの名前で表示するため、どちらも「田中」に見える）
- **Excel（`expXl`・app-admin.js:2172）は `ss.find(...)` ＝最初の1件しか採らない**。実測では**古い方（A・退勤17:00）が出力され、本人が最後に出した B（退勤18:00）は黙って落ちた**
- **管理者が A に入れた `adjustedStart` も引き継がれない**（`buildShift` の `carryAdminShiftFields` は `existSub` からしか引き継がないため、A に取り残される）
- **さらに、画面とExcelが別のsubを見る**。シフト作成グリッド（`_getSubForPeriod`・app-admin.js:501-510）は**完全一致を先に引いてから別名にフォールバック**するのに対し、`expXl` の `find` は**完全一致を優先せず配列順で最初に条件に合った要素**を返す。`ss` は `subs.filter(...)` で並べ替えていない＝Firebaseのキー順（提出時刻順とは限らない）なので、別名subが先に並ぶと **グリッドは B（18:00）を表示し、Excelは A（17:00）を出力する**（実測で確認）。**管理者は画面で確認した内容と違うExcelを店舗に配ることになる。**

> **✅ 2026-09-02 解決済み（`e2fe16a`・バグチェック#105）— 上の「画面とExcelが別のsubを見る」だけ先に閉じた**
> 順序を直すのではなく、解決規則を app-utils.js の **`resolveSubByAlias`** 1関数に出し、
> グリッド（`_getSubForPeriod`）・週集計（`_getWorkShift`）・提出一覧（`_shiftAt`）・**Excel（`expXl`）**の
> 4経路すべてをそこへ通した。**expXl の `ss.find(登録名一致||別名一致)` は廃止**し、名前→sub の逆引き
> Map（重複時は最初の1件＝`subsByKey` と同じ規則）を1度だけ作って引く形にした。
> 実測（配信物のソース行をそのまま Node で実行）: 修正前は別名subが先に並ぶと グリッド `B`(18:00) /
> Excel `A`(17:00) と食い違い、修正後は並び順を入れ替えても両方 `B`。重複が無い通常時は修正前後で同じsub。
> ユニットテスト4件追加（209件パス）。**根（subが2つできること自体）はこのタスクのまま残る**——
> ただし重複が残っている店舗でも、Excelがグリッドと違うものを出すことは無くなった。

> **✅ 2026-09-03 追加で解決（`8897a25`・バグチェック#106）— 5本目の経路（スタッフ再提出）も通した**
> #105 が通したのは管理者側の4経路だけで、**スタッフ再提出の `existSub` は `resolveSubByAlias` を
> 通っていなかった**。`c889660` で入れた別名フォールバックは自前の
> `完全一致 || 別名includes` で、**完全一致の優先はできていたが**、
> 「**別名が複数登録されているとき、どの別名を先に見るか**」が `subs.find` の配列順＝
> Firebase のキー順で決まり、別名の**登録順**で引く画面側と食い違っていた。
> 実測（`StaffView` だけを実ブラウザにマウントし `onSub` をスパイに差し替え＝Firebaseへは1バイトも
> 出していない）: 別名 `["たなか","タナカ"]` の両方にsubがあり `タナカ` が先に並ぶ期間で再提出すると、
> **修正前は `B_タナカ` を上書きし、管理者が `A` に入れたメモ「研修」が失われた**（画面・Excelは
> `A_たなか` を読むので、**スタッフの提出が管理者の画面に一度も出ないsubへ入る**）。
> 修正後は `A_たなか` を再利用しメモも引き継ぐ。通常時7ケースは修正前後で同一。
> **これで `resolveSubByAlias` の呼び出しは4経路→5経路**。**根（subが2つできること自体）は依然このタスクに残る**。

**2026-08-19 追記（バグチェック#84）— この重複が引き起こす3つ目の症状を特定し、表示側だけ先に閉じた**: subが2つできた状態では、**提出一覧の詳細モーダルの月計が同じ日を二重計上していた**（`moTot` が `wSS` のsubを走査して足しており、日付での重複排除が無かった）。実測で**実勤務3日(1440分)に対し月計だけが 48:00＝ちょうど2.00倍**、同じモーダルの週バーと行の月計はどちらも 24:00 で、**1つの画面の中で数字が食い違っていた**。`bc95af4` で週・月の集計を `_shiftAt` 経由（日付ごとに1シフト）へ一本化し、**表示は重複subがあっても正しくなった**。ただし**根（subが2つできること自体）は未解決**で、上記のExcel取り違え・管理者調整値の取り残しはそのまま残る。**表示が直ったぶん、重複の存在に気づく手がかりが1つ減った点に注意。**

**正解は既にコードベース内にある**: 管理者側の同じ問題は**すでに修正済み**で、[app-admin.js:552-559](app-admin.js) が登録名で見つからなければ別名を順に探すフォールバックを持ち、コメントに理由まで書いてある——「ここでaliasを見ずに登録名一致だけで判定すると、別名提出者の編集がidx===-1に落ちて登録名の別subを新規作成してしまい、_getSubの完全一致優先により元の提出が読めなくなる」。**スタッフ側の :158 にだけ同じフォールバックが無い。**

**それでもループで直さなかった理由**: 直すには判断と、ループでは取れない検証が要る。
1. **`staffName` を登録名へ正規化するか**を決める必要がある。別名subを再利用して `staffName` を「田中」に書き換えると、[app-main.js:1517](app-main.js) のローカルstate更新が `findIndex(s=>s.staffName===sub.staffName&&s.periodId===…)` ＝ **staffName一致で探しているため旧エントリを取り逃し、画面上だけ重複が増える**。つまり **app-staff.js と app-main.js の2ファイルを同時に直す必要がある**（id一致で探すか、こちらも別名込みにするか）
2. **スタッフ提出パスはバグチェック#51・#56・#58 の回帰がすべて発生した場所**であり、修正後の非破壊確認には実機E2E（別端末＝Cookieなしからの再提出）が要る。**#78〜#81 の4回連続で `preview_start` が unattended session では拒否されており、この確認ができない。**

> **✅ 2026-08-21 決定・コード修正済み（`c889660`）／残るは実機E2Eと本番データ確認のみ**
> ユーザー判断は **「正規化する」** で確定した。スタッフ画面の `name` は入力・サジェスト確定の時点で
> 既に `resolveAlias` 済み（app-staff.js:272/:281）＝常に登録名なので、`existSub` に別名フォールバックを
> 足すだけで、再利用したsubの `staffName` が登録名へ正規化される。あわせて app-main.js:1517 の
> `findIndex` を id 一致へ変更した（名前一致のままだと正規化で旧エントリを取り逃し、画面上だけ2行になる）。
> **既存subの遡及正規化は行わない**（`registerAlias` 時に過去のsubを書き換えない）。次に再提出した時点で
> 正規化される漸進移行とする。過去の提出記録を後から書き換えないほうが安全で、実害（Excelの取り違え）は
> 再提出で解消するため。

**受け入れ条件**:
- [x] `existSub`（app-staff.js:158）を app-admin.js:563-573 と同じ別名フォールバック付きにする（`c889660`）
- [x] 再利用時に `staffName` を登録名へ正規化するかを決める（**ユーザー判断**）→ **正規化する**。app-main.js:1517 の `findIndex` を id 一致へ変更済み（`c889660`）
- [x] 実機E2Eで「別名で提出 → 管理者が別名登録 → 別端末から再提出」を通し、subが1件のままで管理者調整値が引き継がれることを確認する（**2026-08-22 完了**。dev標準テスト店舗で実施。既存subを「たなか」名義にし管理者調整値 `adjustedStart:"09:00"`／`adjustedStartNote:"研修"` を入れた状態から、氏名Cookieの無いスタッフ画面で「たなか」と入力→画面上で「田中」に解決→提出。結果は **sub 1件のまま**（既存id `ZPTq…` を再利用）・**`staffName` が「たなか」→「田中」へ正規化**・**調整値が残存**・`isUpdated:true`／`updatedAt` 更新。コンソールエラー0件）
- [ ] Excel出力に本人の最新提出が出ることを確認する（**未実施**。上のE2Eで sub が1件に収束したため `expXl` の `find` が取り違えようがない状態にはなったが、**Excelファイルを実際に開いて中身を見てはいない**）
- [ ] 既に2つのsubができている店舗があるか本番データで確認し、あれば統合方針を決める（**未実施**・本番データ確認はユーザーの操作）

**Nodeでの実測（`c889660` 時点・実機E2Eの代替にはならない）**: 配信物の `resolveAlias`・`carryAdminShiftFields`・`diffSubForFlatWrite` を読み込み、「別名『たなか』で提出済み＋管理者が `adjustedStart:09:00`・`adjustedStartNote:"研修"` を入れた状態で、別端末から再提出する」経路を再現。**修正前は新規sub（別id）が作られて調整値が消え行が2件**、**修正後は既存subを再利用し `staffName="田中"`・調整値が残り行が1件**。書き込みパスに `staffName` が含まれる＝正規化が永続化されることも確認。

**影響範囲**: app-staff.js（`existSub`・`buildShift`）、app-main.js（`onSub` のローカルstate更新 :1517）、~~app-admin.js（`expXl` の `find` を複数ヒット時にどう扱うか）~~ → **2026-09-02 `e2fe16a` で決着**（`resolveSubByAlias` に一本化＝完全一致優先。app-utils.js:548）
**備考**: バグチェック#81（2026-08-18）で検出・**条件B（`staffName` を正規化するかの仕様判断）と条件D（2ファイル同時変更＋実機E2Eが前提）に該当**。同じ回で見つかった「スタッフ削除の確認が別名ぶんを数え落とす」（app-admin.js:2332）は**数える式を他4箇所に合わせるだけで判断が不要だった**ため `3a5b830` で修正済み。両者の根は同じ「`sub.staffName` に別名が残る」だが、**こちらは提出データの取り違え、あちらは確認文の数え落とし**で直し方が独立するため分けて記載した。上の「仕様判断が必要な挙動のまとめ」にある**#79 の「死んだ別名が生き続ける」とも根が近い**（どちらも別名の後始末）ので、別名まわりをまとめて決着させるなら同時に扱うとよい。

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

## 🔴 Pro→Premium アップグレードの二重課金を根治する

> **✅ 実装・本番反映まで完了（2026-08-11・`2123952` / `7767551` / `b73bba4`・リリース `88a4ca5`）**
> デプロイ順序は rules → Cloud Functions → mainリリース（ルール変更が読み取りの「追加」のため、通常の「クライアント先」とは逆）。本番配信6ファイルが origin/main とバイト一致することを確認済み。
> 案A・案Bのいずれでもなく、**契約を作り直さず price を差し替える「案C」**で実装した（`changePlan` を新設し `subscriptions.update` を使う）。契約が増えないため二重課金が「起きない」のではなく**起こしようがない**構造になる。`createCheckoutSession` は有効な契約がある店舗を409で拒否する。Stripe側の設定変更は不要。
> **残: 実購入での全遷移検証のみ**（Pro購入 → Premiumへアップグレード＝差額請求 → Proへダウングレード＝予約表示 → 解約 → 返金）。**特にダウングレードの Subscription Schedule は Stripe API の挙動依存で、コードだけでは正しさを保証できていない。**
> **注意（本番の12店舗について）**: 自家用の12店舗は `plan:"premium"` が手動シードされているだけで Stripe の契約を持たない。マイページにプラン変更ボタンは出るが、押すと `changePlan` が「有効な契約が見つかりません」（409）を返す。
> **⚠️ 2026-08-11 訂正（バグチェック#68）**: ここに書いてあった「データは壊れないが、押しても何も起きないUXになる」は**誤り**だった。クライアントは 409 の `code:"no_subscription"` を受けると `createCheckoutSession` へフォールバックするため、実際には**新規契約のStripe決済ページへ遷移する**（localhost で fetch を模擬して実測）。完了すると Premium 表示の店舗が **Pro（500円/月）の実課金に切り替わる**。`e1c0377` で「新規のお申し込みになります／金額／毎月自動更新」を示す確認を挟むようにしたので無言の遷移はしなくなった。
>
> **✅ 2026-08-31 決着（決定6）**: ここに残っていた「**ボタンの出し分けが要るかの判断は未決**」への答えは
> 「**出し分けるどころか、マイページタブごと隠す**」。手動シード店舗には課金に関する表示を一切出さない
> （`accounts/{shopId}/billingExempt`）。この経路自体が到達不能になる。実装は `9291e1a`、詳細は
> 完了済みタスク「手動で有料プランにしている店舗ではマイページタブごと隠す」を参照。
> `changePlan` の 409 → Checkout フォールバックと `e1c0377` の確認ダイアログは**残してある**
> （将来この経路に別の入口ができたときの保険）。

**目的**: `createCheckoutSession`（functions/index.js:123）は常に `mode:"subscription"` で**新しい契約を作る**ため、Pro ユーザーがマイページで「Premiumにアップグレード」を押すと **500円/月と2,980円/月が同時に走る**。さらに Checkout に既存の `customer` を渡していないので契約ごとに別の Stripe Customer が作られ、`accounts/{shopId}/stripeCustomerId` は新しい方で上書きされる。その結果 **Customer Portal は新Premiumの顧客しか開けず、旧Proを解約する導線がアプリ内に存在しない**。
**これが原因で生じている派生問題（根治すればすべて消える）**:
- **旧Proの月次更新が支払い済みPremiumをProへ引き下げる** → `3fccd20` でガード済み（対症療法）
- **旧Proを解約するとPremiumごとFreeに落ちる** → `eee5096` でガード済み（対症療法）
- **Premiumを解約すると、契約が残っているProまで一緒にFreeへ落ちる**（functions/index.js:295）→ **未対応**。次のPro更新請求まで最大1ヶ月、支払い中なのに有料機能を失う
- **決済失敗フラグが別契約の請求成功で解除される**（functions/index.js:281）→ 未対応（実害小）
**受け入れ条件**:
- [x] 方式を決める → **案A・案Bのいずれでもなく案C**（契約を作り直さず price を差し替える。`changePlan` を新設し `subscriptions.update` を使う）で**実装・本番反映済み**（2026-08-11・`2123952`/`7767551`/`b73bba4`・リリース `88a4ca5`）。契約が増えないため二重課金が「起きない」のではなく**起こしようがない**構造になった。`createCheckoutSession` は有効な契約がある店舗を409で拒否する。Stripe側の設定変更は不要
  - 参考（採らなかった案）: 案A＝Checkout に既存 `customer` を渡し旧契約を解約してから新契約を作る／案B＝Customer Portal のプラン変更に寄せる（Portal側の設定変更が必要）
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

> **✅ 2026-08-25 コード修正済み（`c51b62e`）— 残りは Stripe 実データでの確認のみ**
> 早期returnで price 由来のプランを優先するようにした。ガードは**多重防御として残す**判断にし、
> 「createCheckoutSession が409で拒否するようになった今、1店舗2契約は構造的に作れない」ことと
> 「price 由来になったので metadata が古いだけの誤爆はなくなった」ことをコメントに書いた。

**受け入れ条件**:
- [x] `resolveShopMeta` が、対象が Subscription オブジェクトのときは `planOfSubscription()`（price 由来）を優先し、解決できないときだけ `metadata.plan` にフォールバックするようにする → `c51b62e`
- [x] `customer.subscription.deleted` の「プラン不一致ならスキップ」ガードを残すか外すかを決める → **残す（多重防御・コメントに明記）**。`createCheckoutSession` が有効契約のある店舗を409で拒否するようになった今、**1店舗2契約はもう構造的に作れない**ため、このガードの前提（2契約併存）は既に消えている（**ユーザー判断**）
- [ ] Stripe のテスト環境またはテスト店舗の実購入で「ダウングレード予約 → 期間終了で切替 → 解約」を通し、解約後に `plan` が `free` に落ちることを実データで確認する
**影響範囲**: functions/index.js（`resolveShopMeta`・`customer.subscription.deleted` ハンドラ）
**備考**: バグチェック#68（2026-08-11）で検出・**条件A（Cloud Functionsの本番デプロイとStripe実データでの確認）に該当**。ループ内では Stripe の状態を再現できないため未修正。**コード上の非対称は確実だが、「実際に食い違いが発生するか」は Stripe がフェーズのmetadataを適用するかに依存し未検証**。上の「実購入での全遷移検証」（二重課金タスクの残作業）と同じ操作で確認できるので、まとめて実施するのが効率的。

---

## 🟡 企業連携の解除が、稼働中の店舗を「オーナー0人」に戻してしまう

**目的**: `unlinkStoreFromCompany`（functions/index.js:815）は `shops/{shopId}/owners/company_{companyId}` を無条件に削除する。企業ログインのセッションで作った店舗はオーナーが企業uidだけなので、**解除すると owners が空になる**。`linkStoreToCompany` は未claim店舗（`allowed = !owners`・:798）を**管理キーなしで連携できる**ため、その隙に shopId を知る第三者が自分の企業へ連携してオーナーになれる。shopId はスタッフURLの `tokens` 逆引きから辿れるため、店舗コードは秘密情報として扱えない。
> **✅ 2026-08-25 コード修正済み（`d6c826a`）— 案A＋案Bで実装。残りは本番デプロイと claim 監査のみ**
> - `unlinkStoreFromCompany`: 解除後に owners が空になるなら failed-precondition で拒否（案A）
> - `linkStoreToCompany`: 「未claim なら無条件許可」を廃止し管理コードを要求（案B）。未claim店舗には
>   adminKey が無いため「先に店舗の管理者画面を開いて claim してください」と案内する
> - `createCompany`: 同じ未claim分岐を廃止し、オーナー登録済みの店舗だけを連携。連携できなかった
>   店舗は `skippedShops` で返し件数をトーストで知らせる（黙って落とさない）

**受け入れ条件**:
- [x] 「最後のオーナーを外したときにどうするか」を決める → **案A（エラーを返す）＋案B（未claim分岐をadminKey必須）**
  - 案A: 最後のオーナーは解除できない（エラーを返す）
  - 案B: 解除は許すが、`private/adminKey` を残したまま「要再claim」状態にし、`linkStoreToCompany` の未claim分岐を**adminKey必須**に変更する
  - 案C: 解除時に企業の作成者uid（`companies/{id}/pub/ownerUid`）へオーナーを移し替える
- [x] `linkStoreToCompany` / `createCompany` の未claim分岐（「先に触った人がオーナーになれる」）の扱いを合わせて決める → **廃止**（`d6c826a`）
- [ ] 本番13店舗が全てclaim済みであることを再確認してから適用する（締めルール切替時と同じゲート）
- [x] Cloud Functions を本番へデプロイする → **2026-08-25 のリリースで実施済み**（`d6c826a` は 2026-08-24 のコミットでデプロイに含まれる。バグチェック#97 で確認）。**したがってこのタスクに残るのは本番店舗の claim 監査だけ**
**影響範囲**: functions/index.js（`unlinkStoreFromCompany`・`linkStoreToCompany`・`createCompany`）、app-admin.js（CompanyTab の解除UI・エラー表示）
**備考**: バグチェック #65（2026-08-10）で検出・**条件B（仕様判断）に該当**。既存の🟢「未claim店舗は先に触った人がownerになれる」は「新規店舗作成直後の一瞬」と整理していたが、**解除操作が既存店舗を後からその状態に戻せる**点が新しい。本番13店舗は全てclaim済みのため現時点の実害はなく、解除操作を行った瞬間にだけ窓が開く。

**2026-08-11 追記（バグチェック#67）**: 同じ根に**別の入口から2回目の到達**をした。#65 は `unlinkStoreFromCompany` 経由、#67 は `createCompany` 経由（`if (owners && !owners[uid]) continue` の未claim分岐）で、**本番のデモ店舗が owners を空のまま公開されていたため、デモURLの訪問者が自分の企業のオーナーとして登録できる状態だった**。#67 ではデモ店舗をdenylistに入れる対症療法で塞いだ（上の🔴タスク）ので、**このタスクの対象は「未claim店舗を誰でも取り込める」という設計そのものの可否**に絞られる。3回目の入口が現れる前に決着させたい。

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

### ⏸️ Cloud Run ハイブリッド化（フロントは GitHub Pages のまま、API だけ Cloud Run に切り出す）— 見送り（2026-08-14 判断）

**判断**: 現行構成（GitHub Pages + Firebase Realtime Database）のまま継続する。API サーバーを Cloud Run に切り出すハイブリッド化はやらない。
Claude Code × Google Cloud のデモ（Cloud Run + Firestore + BigQuery + Vertex AI でフィードバックアプリを構築する内容）を調査した上での判断で、**Shifty の中核であるリアルタイム同期は Cloud Run に移しても結局 Firebase の仕事のまま**であり、Cloud Run の追加は「置き換え」ではなく「レイヤーの追加」にしかならない。現時点で得られるものが無く、構成の複雑化と実行費用だけが増える。

**再着手条件**（いずれかが成立したら再検討する）:
1. 管理者権限の判定をクライアントとセキュリティルールではなく**サーバー側で厳密に守る必要が発生した時**（現行は Anonymous Auth + adminKey によるオーナー分離で足りている）
2. **AI 機能・自動通知など、サーバー側でしか回せない処理を追加したくなった時**（シフト自動生成の提案、締切前のリマインド送信など）
3. **TODGE の受託案件として納品し、セキュリティ責任が発生した時**（自分の店舗で使う範囲を越えて第三者に納める場合）

**参照**: `Obsidian: Knowledge/claude-code-gcp-demo-reproduction.md` / `Knowledge/Claude-Code-GCP-フィードバックアプリまとめ.md`

---

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

### ✅ 提出データの権限を「名前」だけで判断する（2026-08-31 決定1・決定2・決定5／`0c236ac`）

長く持ち越していた「閲覧専用端末に設定・シフトの書き換えを許すか」と、そこにぶら下がっていた
`submitterUid` の上書き（#100）・スタッフ画面の「✎ 修正」（#99）を、ユーザー判断でまとめて決着させた。

| 論点 | 決定 |
|---|---|
| 提出データの「提出・変更・削除」を誰に許すか | **名前の一致だけで判断する**。同じ名前を名乗る端末なら誰でも触れる（`8952f8f` の「提出者とオーナーの2者のみ削除可」からの方針転換） |
| 閲覧専用バナー | **案B: 文言を実態に合わせる**（編集UIを止める案Aは決定1と衝突するので採らない） |
| スタッフ画面の提出状況一覧の編集 | **削除と同じく名前で絞る**（セル編集・「✎ 修正」を全行に出すのをやめる） |
| `submitterUid` の上書き（案ア〜ウ） | 削除の判定に使わなくなったので論点ごと消滅。**記録・監査用に書き込みだけ残す** |

**引き受けたトレードオフ（再検出しても「直す」ことをしない）**: セキュリティルールはクライアントが
名乗る名前を検証できないため、この絞り込みは**UIにしか無い**。ルール上は認証済みなら任意のsubを
削除・編集でき、RESTを直接叩けばUIの名前絞り込みを迂回できる。決定1を選んだ結果として承知のうえで
引き受けたもの。コード（app-staff.js の `canTouch` 直上）とコミットメッセージにも同じ趣旨を書いてある。

**実測**（375px・実ブラウザ・SmModalのみマウント＝Firebaseへは1バイトも出していない）:

| 状態 | 削除ボタン | ✎ 修正 | 他人のセルタップ |
|---|---|---|---|
| 名前未入力 | 0個 | 0個 | 開かない |
| 「田中」と入力しただけ（提出せず） | 1個（別名「たなか」名義の行） | 1個 | 開かない |
| 管理者（`myName=null`） | 2個 | 2個 | 開く（非回帰） |

自分の行の編集は `adjustedStart`/`adjustedStartNote` を保持したまま更新され、書き込みの形も
`diffSubForFlatWrite` で2本（`shifts/{日付}`・`updatedAt`）のまま＝#100 の基準値と一致。

**残（ルールのデプロイが要る）**: 削除が実際に Firebase を通ること・デモ店舗では引き続き拒否されることの
REST実測。`database.rules.json` の `subs/$subId/.write` から削除条件を外したので、**ルールを先に、
クライアントを後に**デプロイする（逆順だと削除ボタンは出るのにルールが拒否する時間帯ができる）。

---

### ✅ 休憩の適用範囲を「勤務が休憩を完全に含む日」だけに絞る（2026-08-31 決定3／`64d5b74`・`59343ca`・`268d7fe`）

2026-08-25 の案C（`a082d5d`・「休憩の内側から出勤して跨ぐ日にも適用」）を**撤回**した。あわせて
「2026-08-25 の仕様決定の端のケース2件」の**決めること1（片側セルのヒートマップ）も解消**した——
3計算を「片側セルには休憩を付けない／延長は付ける」で揃えたため、案A/案Bの選択自体が要らなくなった。

- 両側セル: 出勤 < 休憩開始 かつ 退勤 > 休憩終了 の日にだけ引く（境界一致・内側は引かない）
- 片側セル: 休憩は一切引かない（半日勤務が大半のため）。**退勤延長は反映する**
- `getHeatShift`（app-admin.js）が片側セルで null を返して延長ごと落としていたのを修正

**A/B実測**（休憩12:00〜13:00・候補09:00-15:00/17:00-23:00）:

| シフト | 休憩件数 | 純勤務 |
|---|---|---|
| 12:30〜20:00（休憩の内側から出勤） | 1→0件 | 7:00 → **7:30** |
| 09:00〜18:00（完全に含む） | 1→1件 | 8:00 → 8:00 |
| 09:00〜12:00 / 13:00〜22:00（境界） | 0→0件 | 変化なし |
| 出勤セルだけ 09:00（片側） | 1→0件 | 5:00 → **6:00** |
| 退勤セルだけ 22:00（片側） | 0→0件 | 5:00 → 5:00 |

**週/月の上限判定は勤務時間が増える方向に変わりうる**。実測（平日5日・09:00〜18:00×4＋12:30〜20:00×1）で
週上限39h が 39:00（収まる）→ 39:30（超過）に変わる。週上限40h では両方とも収まる。

ヒートマップ（実ブラウザ・ShiftEditTabのみマウント）: 片側セルの日の15時台が **0 → 1**（延長が反映）。
両側セルの対照日は 1 → 1 で不変。回帰テスト3件を追加し、変更前の実装では3件とも落ちることを確認済み。

---

### ✅ 期間に名前を残して削除した人の設定の後始末（2026-08-31 決定4・案A／`08a531e`）

「2026-08-25 の仕様決定の端のケース2件」の**決めること2**。`retainedOf` が期限切れと判定して
一覧から行が消えたタイミングで、設定7マップと別名を消す。実行主体は**オーナー端末がスタッフタブを
開いたとき1回**（`ownerReadOnly` 端末は settings を書けないので走らせない）。

**実測**（実ブラウザ・StaffTabのみマウント・`onSaveSettings` をスパイに差し替え）:

| | 変更前 | 変更後 |
|---|---|---|
| `onSaveSettings` の呼び出し | 0回 | **1回**（＝収束している） |
| 期限切れの人（8/15終了の期間に保持） | 全7マップに残存 | 全7マップから消える |
| 期限内の人・現役スタッフ | 残る | 残る（巻き込んでいない） |
| `ownerReadOnly=true` の端末 | 0回 | 0回 |

対象は最新3期間の `keepStaff` に載っている人だけ。それより古い期間にしか残っていない人は
そもそも一覧に出たことがないので触らない。

---

### ✅ 手動で有料プランにしている店舗ではマイページタブごと隠す（2026-08-31 決定6／`9291e1a`）

自家用の手動シード店舗（`plan:"premium"` を手で入れただけで Stripe 契約が無く、課金する予定もない店舗）に
**課金に関する表示を一切出さない**。副次的に「プラン変更 → `changePlan` が409 → `createCheckoutSession` へ
フォールバック → Pro(500円/月)の実課金画面へ遷移」という到達経路（#68）も到達不能になる。

クライアントは Stripe 契約の有無を読めない（`stripeCustomerId`/`stripeSubscriptionId` は `.read:false`）ため、
`accounts/{shopId}/billingExempt` という印を足して区別する。`planExpiry` の有無から推測する方法は**採らない**——
誤判定の向きが悪く、実課金の店舗で Webhook が書き損ねていると本物の課金者から唯一の解約導線が消える。

**実測**（実ブラウザ・AdminViewのみマウント・`paymentFailed=true` を渡した状態）:

| 条件 | タブ | 決済失敗バナー | マイページの中身 | `ss_tab` |
|---|---|---|---|---|
| フラグ無し・premium | マイページあり | 出る | 押すと出る | mypage |
| `billingExempt=true` | マイページなし | 出ない | 押せない | periods へ書き戻る |
| 同＋前回mypageで閉じた端末 | マイページなし | 出ない | 出ない | periods へ書き戻る |
| フラグ無し・free | マイページあり | 出る | 押すと出る（アップグレード導線は非回帰） | mypage |

引き継ぎ指定からの1点の逸脱: 決済失敗バナーは**ボタンだけでなくバナーごと**出さないようにした。
本文が「マイページ → 請求管理から…」と書いており、ボタンだけ隠すと存在しないタブへ誘導する文言が残るため。

**✅ 2026-08-31 に本番反映まで完了**（ルール → クライアント → データの順）。**`accounts` を持つ12店舗すべてに
`billingExempt=true`**。残る3件（デモ `demo-toriMatsu-v1`・「新しい店舗」×2）は `accounts` ノード自体が無いため
フラグも無く、Free扱いでマイページが出る（アップグレード導線を残す）。

書き込みは2段階で行った。

1. **11店舗**（有料プランだが Stripe 契約なし＝手動シード）: 監査時のリストを固定せず**書く直前に同じ規則で
   再導出**し、Stripe契約のある店舗が1件でも混ざったら中止する安全弁を通した。**11/11件成功・誤書き込み0件**
2. **`鷄えん東通り`（`shop_1780453329813`）**: **Stripe契約を持つ唯一の店舗**だが、ユーザーの明示指示により
   同じ扱いにした。規則ベースの一括スクリプトの安全弁に当たるため、対象を1件に固定した別スクリプトで書き、
   `plan`・`planExpiry`・`stripeCustomerId`・`stripeSubscriptionId` が無傷であることを読み返しで確認した

> **⚠️ この店舗だけ副作用がある**: 契約が生きているのにアプリ内から**請求・解約の導線（Stripeポータル）が消え、
> 決済失敗バナーも出なくなる**。カードの更新・解約は **Stripeダッシュボードから**行う必要がある。
> 元に戻すには `accounts/shop_1780453329813/billingExempt` を削除する。

**本番での実測**（配信版数 `20260831-27f8a76`・実ブラウザ・読み取りのみ）:

| 店舗 | タブ | 判定 |
|---|---|---|
| 京月梅田（手動シード） | 期間・スタッフ・候補・提出一覧・シフト作成・企業連携・設定 | **マイページなし** |
| 鷄えん東通り（実課金） | 同上 | **マイページなし** |

どちらも pageerror・console.error 0件。

---

### ✅ planExpiry がUTC基準で計算され、JST午前9時以降の購入で1日短く表示される（2026-08-25 完了・`c51b62e`）

受け入れ条件3件がすべて達成済み（コード修正・既存データの扱いの決定・本番デプロイ）だったのに
実装待ちへ残っていたため、2026-08-31 に完了済みへ移した。`toJstDateStr` を追加し、日付へ落とす直前に
JSTへ寄せる。`planExpiry` だけでなく `currentPeriodEnd`・`scheduledPlanDate`（`tsToDate`）も同時に修正。
実測: UTC 2026-08-10T16:54（JST 8/11 01:54）の購入 → 旧 `2026-09-10` / 新 `2026-09-11`。
既存の `planExpiry` は放置（表示専用でプラン判定には使わないため、次回更新で自然に直る）。

---

### ✅ 2026-08-25 の一括実装を本番へ反映（2026-08-25 完了・`d3dfb3f`）

クライアント → セキュリティルール → Cloud Functions の順で反映し、各段で実測を取った。

**① クライアント（GitHub Pages・`d3dfb3f`）**
版数 `20260824-5256014` → **`20260825-92a9e27`**（index.html 5箇所＋app-core.js 1箇所・旧版数の残り0）。
配信物6ファイルすべてが `origin/main` と SHA一致、`DEV_MODE` は式のまま。
本番の3画面（デスクトップ／モバイル／`#/demo`）を実ブラウザで開き **pageerror・console.error ともに0件**。

**② セキュリティルール（dev → 本番）**
dev へ先に出して REST で **10項目すべてパス**（匿名認証トークン2つで検証・使い捨てデータは検証内で削除済み）:
提出者本人は削除できる／提出者でもオーナーでもない端末は削除できない／`submitterUid` に他人のuidは書けない／
別端末からの再提出（更新）は通る／拒否された削除でデータが消えていない／`inviteCodes` は書き込めない、など。
そのうえで本番へ反映。

**③ Cloud Functions（本番）**
15関数すべて `Successful update operation`（今回は全て update ＝ 取りこぼしなし）。
事前に本番の店舗の claim 状況を監査し、**15店舗中14が claim 済み／未claim はデモ店舗のみ**であることを確認した
（デモは `isDemoShop` で先に弾かれるため、未claim分岐の廃止による影響を受けない）。

> **教訓**: claim 監査を最初 zsh スクリプトで書いたところ、スクリプト内で `python3` が見つからず
> パスのパーセントエンコードが空になり、**全15店舗が「未claim」と出た**。Node で書き直して正しい結果を得た。
> 「全件が同じ異常値」を見たら、まず測定手段の故障を疑うこと。

**残（このタスクの対象外）**: 実購入テストが要る項目（二重課金の全遷移・解約通知・#68 の解約時プラン判定）は
別タスクのまま。既存の sub には `submitterUid` が無いため、**当面はオーナーのみが提出を削除できる**
（本人が一度再提出すれば以後は本人でも削除できる）。

---

### ✅ 仕様判断まとめの10件が決着（2026-08-25 完了・`a082d5d` ほか）

長く「どちらが正しいかユーザーが決める」として持ち越していた項目を、ユーザー判断で決めて実装した。
残っているのは「閲覧専用端末に設定・シフトの書き換えを許すか」の1件だけ（実装待ちへ移動済み）。

| 論点 | 決定 | コミット |
|---|---|---|
| 提出データの削除を誰に許すか | **提出者とオーナーの2者のみ**（`submitterUid` ＋ ルールで削除限定） | `8952f8f` |
| 再提出で「休み」にしたときの管理者調整値 | **案A: 調整値も消す**（メモ・休み希望・「締」は残す） | `a082d5d` |
| 出勤・退勤の片方だけ入力された日 | **案A: ヒートマップと同じ補完で数える**（#82 の3箇所も同時に解消） | `a082d5d` |
| 同名ポジションの登録 | **禁止**（別セクションの同名も登録時に弾く） | `a082d5d` |
| スタッフ削除後の設定7マップ・別名 | **消す**（ただし「どの期間にも残さない」ときだけ） | `a082d5d` |
| 未登録名をグリッドにも出すか | **現状維持**（keepStaff で管理者が選べるため・コード変更なし） | — |
| 期間どうしの日付の重なり | **案B: 警告のみ**（＋#92 の検証漏れ＝空・終了日<開始日はエラーで停止） | `a082d5d` |
| `x`（ヘルプ）を店舗間重複の判定から外すか | **案A: 外して3計算を揃える** | `a082d5d` |
| 退勤延長を店舗間重複に含めるか | **案A: 自店舗側だけ加算** | `a082d5d` |
| 休憩の適用条件 | **案C: 休憩の内側から出勤して跨ぐ日にも適用**（ランチのみ・ディナーのみは従来どおり非適用） | `a082d5d` |

**実測**: 12:30〜20:00（休憩12:00〜13:00）の純勤務が 7:30 → **7:00**（休憩30分が引かれるようになった）／
出勤だけ入力された日が 0分 → **候補時間から補完した時間**（上限判定に乗る）。
`npm test` 197件パス（+6・追加分はいずれも修正前の実装では落ちることを確認）。
実ブラウザで期間検証の4ケースをコンソールエラー0件で確認。

---

### ✅ E2E検証ハーネスをリポジトリで保全（2026-08-25 完了・`2602095`・案A）

`.gitignore` の `.claude/` により追跡外だったハーネス（#91〜#93 で3回書き直した末に関数化したもの）を保全した。
- SKILL.md 0節の管理コードを `.secrets.local`（追跡外）へ分離し、SKILL.md は参照だけを持つ
- `.gitignore` を `.claude/*` ＋ `skills/shifty-e2e-verify` だけ再包含に変更（ルートの settings.local.json と `functions/.claude/` は従来どおり追跡しない）
- 追跡対象は SKILL.md・`scripts/mount-component.js`・`scripts/example-shift-edit-tab.js` の3ファイル
- **復元できることの実測**: 別ディレクトリから `node .../example-shift-edit-tab.js` → `verdict.allPass=true`・EXIT=0

---

### ✅ 期間の写しから日付別候補を外した（2026-08-25 完了・`3464eaa`・案A）

`PERIOD_SNAPSHOT_SETTING_KEYS` から `dateCandidates` / `dateCandidatePosTypes` を除外。
**実測（#88 と同じ条件）: 写し1件 57,620 bytes → 2,996 bytes（-94.8%）**。36期間で約2.0MB → 約108KB。
確定済み期間でも日付別候補は現在値を参照する（ヒートマップの補完境界を含む）＝承知の上の挙動変更。
回帰テスト2件を追加し、外す前の実装では落ちることを確認済み。

---

### ✅ 色のコントラスト是正（2026-08-25 完了・`d22653c`・決めること1〜5＝案B/A/A/A/B）

375px・Chromium・標準テスト店舗で、スタッフ画面＋提出状況モーダル＋管理者7タブを巡回した全DOM実測:

| | ライト | ダーク |
|---|---|---|
| `?plan=free` | 63件 → **0件** | 47件 → **0件** |
| `?plan=premium` | 72件 → **0件** | 53件 → **0件** |

- 決めること1・5（案B）: `--c-warn-*` / `--c-note-*` / `--c-danger-*` をテーマごとに定義
- 決めること2（案A）: 塗り＋白文字専用の `--c-accent-solid`(#C2410C・5.18:1) を追加し背景アクセント41箇所を移行
- 決めること3・4（案A）: `--c-sat`/`--c-sun` を追加。固定の明色チップは文字だけ濃くした
- あわせて: `--c-accent-text`・`--c-ok`・text3/text4 の値・ヒートマップの `--c-heat-scale`/`--c-heat-ink`

---

### ✅ タップ領域の是正（2026-08-25 完了・`d22653c`・決めること1/2/3＝案B/A/A）

- タブバーの `gap` を 4px → 8px（決めること1・案B）
- 削除ボタン（`AD`）に `marginLeft:10` を入れ、破壊的操作を隣から離す（決めること3・案A）
- シフト作成グリッドのセル寸法は密度優先で据え置き（決めること2・案A）
- **実測（375px・管理者6タブ）: 8px未満に近接するタップ要素の組 108 → 27。44px未満の159件は決定どおり据え置き**

---

### ✅ Webhook の疎通確認と解約済みテスト契約の残骸整理（2026-08-11 完了・受け入れ条件2/2）

実装待ちに残っていたが受け入れ条件は両方とも達成済みだったため移動（2026-08-25 整理）。
実購入テストで署名検証が通ること・`4acd089`/`eee5096`/`3fccd20` が実データで機能することを確認済み。
残骸データ（`mKdff4?v88uPN=B=eEsc&WHW`）も解約ハンドラと同じ処理を適用済み。

---

### ✅ 招待コード方式の残骸を削除（2026-08-25 完了・`8384467`・廃止で決定）

`generateInviteCode`（約60行）と state 2件、`database.rules.json` / `tightened` の
`inviteCodes`・`accounts/{uid}/members`・`accounts/{uid}/inviteCode` を削除した。
**ルールのデプロイはクライアント配信のあと**（本番配信中のクライアントも呼ばないため順序が前後しても壊れない）。

---

### ✅ デモURLの課金・オーナー権限の穴を本番へ反映（2026-08-22 完了・`6456cff`）

バグチェック#67（2026-08-11）で検出した2つの穴——①デモURLの訪問者が自分のものでないデモ店舗のStripe決済ページへ飛ばされる（誰かが決済すると以後の訪問者がその人のStripeポータルを開ける）②訪問者がデモ店舗のオーナー権限を自分の企業アカウントに取れる——を本番配信で塞いだ。修正自体は `8e50036`・`12776cd`・`99d8cd5` で develop に入っていたが、**本番は11日間にわたって穴が開いたままだった**（デモは広告からの流入先）。

**受け入れ条件**:
- [x] develop を main へマージして本番配信する → **53コミットを fast-forward でマージし `6456cff` を push**（コンフリクトなし）
- [x] **`index.html` の `?v=` を必ずバンプする** → `20260814-53f610f` → **`20260822-e9d98a4`**（index.html 5箇所＋app-core.js 1箇所・旧版数の残り0）
- [x] `cd functions && firebase deploy --only functions --project ontheshift` を実行する → **不要と判定**。`git diff main..develop -- functions/` が**空**で、2026-08-11 のデプロイ内容から1バイトも変わっていない（デモ店舗の拒否は当時のデプロイで既に本番へ入っている）
- [x] 反映後、本番の `#/demo` でマイページを開き、プラン変更セクションと請求管理ボタンが出ないことを確認 → **実測で確認**。配信版数が `20260822-e9d98a4` であること、プラン変更・請求管理系のボタンが**1つも描画されない**こと、「請求・解約の管理」「請求管理ページ」の文言が無いことを確認。コンソールエラー0件
- [x] `accounts/demo-toriMatsu-v1` が存在しない（＝誰も決済していない）ことを確認 → **ユーザーが本番データで確認済み（2026-08-22）。存在しない＝この穴による被害は発生していない**。解約・返金対応は不要

**本番配信の検証**: `app-utils.js`／`app-core.js`／`app-staff.js`／`app-admin.js`／`app-main.js`／`index.html` の**6ファイルすべてが `origin/main` とバイト一致**することを curl で確認。本番配信物の `DEV_MODE` 行が `location.hostname !== "shiftyshifty.app"` の式のままであることも確認済み。

**残る根の問題**: この修正は**デモ店舗をdenylistに入れる対症療法**であり、根（未claim店舗は誰でも自分の企業に取り込める）は未解決。「企業連携の解除が、稼働中の店舗を『オーナー0人』に戻してしまう」タスクで決着させる。

---


### ✅ 終了した期間のシフトを「確定」させ、その後のマスタ変更を反映しない（2026-08-21・`1c5272b`）

**実装内容**: シフト作成タブが staffList・属性・ポジション・従業員番号・退勤延長を**すべて現在値**で参照していたため、スタッフを1人削除すると配り終えた過去のシフト表からその人の列が黙って消えていた。終了した期間（`today > endDate`）は、その時点のマスタの写し（`period.snapshot`）を参照して固定するようにした。

- `app-utils.js`: `PERIOD_SNAPSHOT_SETTING_KEYS`・`isPeriodEnded`・`buildPeriodSnapshot`・`periodSnapshotEqual`・`resolvePeriodMaster` を追加（純粋関数）
- `ShiftEditTab`: props をそのまま使わず `resolvePeriodMaster` の結果を参照。**期間が生きている間はタブを開くたびに写しを最新化し、最終日を超えたら更新を止める＝そこで凍結**（写しはアプリが動いている瞬間しか撮れないため「確定の瞬間に撮る」では最終日翌日〜初回アクセスの間の削除を取りこぼす）
- 「確定済み」バッジ・「確定を解除」「この期間を確定」ボタン（オーナー限定・`confirm` 付き）。一方通行にしないため、解除した期間や本機能より前に終わった期間も後から確定できる
- 期間管理タブの Excel ボタンも同じ凍結を通す（同じ期間の Excel が出す場所によって変わらないように）

**受け入れ条件**:
- [x] `period.snapshot`（`{staffList, settings}`）と `period.lockedAt` を期間オブジェクトに持たせる
- [x] `today <= endDate` の期間は現在値で動作し、シフト作成タブを開いたときに写しを更新する（変化があるときだけ書く／`ownerReadOnly` 端末は書かない）
- [x] `today > endDate` かつ写しがある期間は staffList と凍結対象 settings を写しから読む
- [x] 写しが無い過去期間は従来どおり現在値で動く
- [x] 凍結はシフト作成タブの中だけ（`ShiftEditTab` 内で解決。`AdminView` の props は据え置き＝他タブは現在値）
- [x] Excel・PDF にも凍結が及ぶ（`expXl`:1612・`buildPdfCols`:1322 は解決後の変数を参照。期間管理タブの Excel も対応）
- [x] 「確定を解除」ボタン（オーナー限定）
- [x] 確定中であることが画面で分かる（期間ドロップダウン横に「確定済み」バッジ）
- [x] 純粋関数に切り出してユニットテスト追加（6件）
- [x] `npm test` 174件パス／`npx eslint app-*.js` 0 errors 98 warnings（増減なし）
- [x] `?v=` と `build:` のバンプ（**2026-08-22 のリリース `6456cff` で実施**。`20260814-53f610f` → `20260822-e9d98a4`）

**Nodeでの実測**: Firebase の往復（`sanitizeForSet` ＋ 空配列・空オブジェクトの脱落）を再現し、**写しの更新が1回で収束して書き込みループにならない**ことを確認。最終日当日は `locked=false`（現在値）、翌日にスタッフ「佐藤」を削除し退勤延長・従業員番号を消しても、写しから佐藤の列が残り退勤延長・従業員番号が保持されること、凍結対象外の `xlShopName` は現在値のままであることを確認。

**実機E2E: 2026-08-22 完了（対話セッションで実施・全項目パス／コンソールエラー0件）**。dev標準テスト店舗（`eb6AfsQv4JAht+cX*xP7fuDa`・`?plan=premium`）で確認した内容:
- **①確定 → 写しが書かれる**: 「この期間を確定」で `snapshot`（staffList 5名＋settings 7キー）と `lockedAt` が書かれ、期間レコードが **217 → 1,709 bytes**。バッジ「確定済み」と「確定を解除」に切り替わる
- **②スタッフを削除しても列が残る（対照つき）**: 「佐藤」を削除したうえで、確定済みの8月前半は `田中・佐藤・鈴木・高橋` が**残り**、未確定の7月後半は `田中・鈴木・高橋`（佐藤が消える）。**同じ削除に対し2期間が別挙動を示したので、キャッシュではなく写しが効いていることを確認**
- **③確定済み期間でもセル編集・保存ができる**: 削除済みスタッフのセルに入力し `adjustedStart:"10:00"`／`adjustedEnd:"18:00"` がFirebaseへ保存される（`readOnly:false`・`disabled:false`）
- **④確定を解除 → 完全に往復**: `snapshot`・`lockedAt` が消えて **1,709 → 217 bytes** に復帰、グリッドも現在値に戻る。**解除後に再度確定できる**ことも確認（一方通行になっていない）
- **既存の過去期間には自動で効かない**ことも実データで確認（終了済み2期間とも着手時点で `snapshot` 無し＝写し更新の useEffect が `isPeriodEnded` で早期returnするため）。必要な過去期間は「この期間を確定」で個別に固定する
- テストデータは着手前の状態へ復元済み（staff 5名・snapshot削除・作成したsub削除）

**教訓**: `preview_start` の unattended 拒否は**セッション単位で固定されない**。スケジュール起点のセッションでも、ユーザーが会話を始めた時点で通る。#78〜#88 の11回は「前回拒否された」を理由に再試行していなかっただけで、「このセッションはスケジュール起点だから不可」という申し送りは誤りだった。

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
