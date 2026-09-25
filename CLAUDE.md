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
├── database.rules.json ← Firebase セキュリティルール（**正本はこの1ファイルのみ**。2026-07-28 に締めルールへ切替済み）
│                          ※ `database.rules.tightened.json` は 2026-09-05 に削除（切替完了後はバイト同一の残骸で、
│                            ルール変更のたびに二重管理を強いていた。`firebase.json` はこの1本だけを参照する）
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
requiredPositionsFor(settings,dateStr) // 日付に適用する必要ポジション枠。getBreakList と同じ規則で旧 "hol" を流用する（祝日区分に枠が無いときだけ）。分割（1cdcd6b）で移行が無く祝日判定から消えていた枠を拾う（#120）
firebaseKeyForbiddenChars(name)          // Firebaseがキーに使えない文字（. # $ / [ ] 制御文字）の検出。スタッフ名は7つの設定マップでキーになるため追加・改名の入口で弾く
matchPositionSlots(slots, attendees)    // 必要ポジションと出勤者の最大二部マッチング（Kuhn法・ポジション不足エラー判定＝Premium限定）
genToken() / genSecureId(len)   // ランダムID生成
isSpacer(n) / resolveAlias / buildSuggestList
aliasOwnerOf(name, staffAliases, selfName)  // その名前を別名にしている他人。addAlias（登録名と同じ別名を禁止）の反対側の入口＝スタッフ追加・改名で使う。通さないと「他人の別名と同名のスタッフ」が作れ、本人の提出が別人のsubへ入る（#107）
renameStaffInSettings / renameStaffInPeriods // 改名時のキー移し替え。settings 本体と period.snapshot.settings の両方に同じものを当てる（写しだけ旧名で残ると確定済み期間のシフトが空欄になる・#107）
staffHiddenRanges / isStaffHiddenInPeriod / isStaffHiddenNow / hideStaffFrom / showStaffFrom
                           // スタッフの非表示。**期間の範囲**で持つ（2026-09-06 決定）。`settings.staffHidden[名前] = [{from,to}]` で
                           // from=非表示にした時点の最新期間のstartDate（含む）・to=解除した時点の最新期間のstartDate（**含まない**）。
                           // 「解除した期間からは再び出る／その1つ前までは非表示のまま」を to の非包含で表している。複数回の休職に耐えるよう配列。
                           // `true`（範囲を持たなかった頃の本番データの形）は下限も上限もない1本の範囲として読む。
                           // **書く側もこの形を使う**: 期間が1件も無い店舗で非表示にすると範囲が {from:null,to:null} になり、
                           // 全キーがnullの範囲はFirebaseに保存できない（nullのキーは書かれず、空オブジェクトはノードごと消える）。
                           // `_writeHiddenRanges` は下限も上限も無い範囲が1つでもあれば `true` に潰す（全期間を覆うので同値。#113）
visibleStaffList(list, settings, period) // 上の判定で名簿から落とす。シフト作成グリッド・ヒートマップ・Excel・PDF はこれを通した名簿で描く。**period を必ず渡す**（渡さないと隠さない側に倒れる）。**isUnregisteredSubName には通さない**（通すと非表示の人の提出が未登録名に化けてExcel/PDFの末尾に列として復活する）。staffList 本体は触らないので提出URL・別名・提出データの紐付けは生きたまま
STAFF_KEYED_SETTING_MAPS   // スタッフ名をキーに持つ設定マップ7件の**正本**（+ overtimeSettings.byStaff で計8）。改名（renameStaffInSettings）と削除の後始末（app-admin.js の settingsWithoutStaff）の**両方がここを参照する**。新しいマップを足すときはここに登録し、あわせて PERIOD_SNAPSHOT_SETTING_KEYS にも入れる（入れないと写しの側で改名が届かず #107 が再発する）。一覧を別の場所へ書き写さないこと——tests/core.test.js がドリフトを検出する（#108）
keepAttrsOf(period) / applyKeepAttrs(settings,period)
                           // 属性の期間指定（2026-09-08 決定）。`period.keepAttrs = {名前: 属性ID}` に**旧属性を書き置き**、
                           // resolvePeriodMaster が写しマージの**後**に staffAttributes へ上書きする（写しと食い違えば keepAttrs が勝つ）。
                           // 夏休みだけ上限の大きい属性にして戻すと、戻した瞬間に配り終えた期間まで新しい上限で
                           // 再判定され上限超過エラーになる、という報告への対応。keepStaff と同じ「期間側に足すだけ」の形で、
                           // settings.staffAttributes の形は変えない＝既存の読み手はそのまま動く。
                           // 書くのは StaffTab の属性変更ポップアップ（最新3期間から「どの期間まで旧属性のままか」を選ぶ3択）。
                           // **指定の無い期間では同じ参照を返す**ので、持たない期間は従来と1バイトも変わらない。
                           // 提出一覧(SubsTab)だけは resolvePeriodMaster を通らないので、上限判定の直前で個別に当てている。
                           // 改名では renameStaffInPeriods がキーを移す（移さないと過去期間の指定が引けずエラーが戻る）。
PERIOD_SNAPSHOT_EXEMPT_STAFF_MAPS // 上の例外＝**意図的に凍結しない**マップ（現在は staffHidden だけ）。値そのものが期間の範囲を持つので写しに焼くと同じ問いへの答えが2つできる。凍結対象外のキーは resolvePeriodMaster が現在値のまま残すため、終了した期間もその startDate で評価される
LEGAL_DAILY_MIN / LEGAL_WEEKLY_MIN     // 労基法32条の法定基準（480分・2400分）。B制の 8h超n日(残業)・週40h超(残業) に使う
LABOR_SYSTEMS / laborSystemOf / laborSystemForStaff
                           // 労働時間制（A=1か月単位の変形／B=通常／none=判定対象外）。**属性単位**で持ち
                           // `staffTypeLimits[属性ID].laborSystem` に入る（2026-09-26・労務判定 第1弾）。
                           // 既定は 社員=A・バイト=B・派遣/その他=none（DEFAULT_LABOR_SYSTEM_BY_ATTR）。
                           // **null を返したら「区分が空欄か誤り」**＝staffTypeLimits に無い属性か、
                           // custom属性で laborSystem が未設定。組み込みIDは既定が必ず答えるので null にならない
                           // （既存店舗の employee/parttime が一斉に警告になるのを防ぐ）
laborSettingsOf / DEFAULT_LABOR_SETTINGS // 労務設定の読み手側フォールバック。**makeSettings は変更していない**
weeklyLegalMinFromBase31 / monthlyBaseMin / monthlyGuideMin / monthlyCapMin / laborMonthFrame
                           // A制の月の枠。**31日の総枠だけを手入力**し、週の法定労働時間 W を30分単位に
                           // 丸めて逆算してから各月を FLOOR(W × 暦日数 ÷ 7 × 60, 1) ÷ 60 で出す。
                           // 丸めないと28日の月が 159:59 になり Excel と1分ずれる。週44時間の特例措置対象
                           // 事業場は別トグルを作らず、31日に 194:51 を入れれば W=44h になる
weeklyOverMinB / weeklyOverTotalMinB    // B制の週40h超。各日の実働を1日8hで切ってから週で足し40h超だけ取る
isTimeOrderInvalid / TIME_ORDER_ERROR_HINT
                           // 退勤≦出勤の日（BACKLOG #129・案C）。**両側とも入力されている日だけ**が対象で、
                           // 片側セルは補完の領分。`effShiftRangeMin` は「退勤≦出勤」と「片側だけ」の
                           // 両方を null にして区別できないので専用に持つ。入口2つ（applyEditToSubs・
                           // saveAdj）の両方がこれを通る（tests/core.test.js のドリフト検出が守る）
laborFindingsFor / laborFindingLabels / overallVerdictOf
                           // 日次・月次の労務判定（S-4）と総括判定（S-6）。引数はオプションオブジェクト。
                           // laborSystem==="none" は労働時間の判定・集計から外す（休憩不足も出さない）が、
                           // **「時刻の入力ミス」だけは区分によらず出す**——労務ではなく入力データの誤りのため。
                           // 戻り値は {key,label}。総括判定が key で引くので文字列だけを返す形にしない
excelRound / excelRoundUp / excelRoundDown
                           // Excel の丸め。**Math.round を直接使わない**（負の値で挙動が違う）。
                           // 桁をずらしたあと toPrecision(15) で丸め直し、1.005*100 の取りこぼしも消す
monthlyOvertimeH / prorateOvertimeH     // 月の残業予定と日別の按分（S-2）。**累積の差分**で配るので
                           // 日別の和が月の残業予定と完全に一致する（毎日「実働×比率」を丸めるとずれる）
guideStatusOf              // 目安の4段階（S-6）。みなし超／所定未満／目安未満／OK 上限まで
AGREEMENT_LEGAL_ITEMS / AGREEMENT_SINGLE_MONTH_CAP_H
                           // 36協定の法定上限の一覧（判定する・しないを含む）。設定画面のチェックリストは
                           // これを自動生成する。単月100h未満は**月の残業予定だけと比べ休日労働を足さない**
breakModeOf / breakLengthOf / shiftBindingMin / isBreakShort
                           // 休憩方式（band=既定／length）と拘束時間・休憩不足（S-3）。
                           // **長さ方式のしきい値は実働で見る**——S-3 の本文は「拘束>8h→1.0h」だが
                           // 同じ節の表（拘束8.5h→控除0.75h・実働7.75h）は実働基準でしか再現できない。
                           // 労基法34条の「労働時間」も実働なので表を採った
LEAVE_TYPES / leaveTypeOf / dayRestKindOf / weekRestStateOf
                           // 休暇種別（公休/有給/慶弔）と週の休み3状態（S-5）。**導入前の終日 y
                           // （leaveType なし）は公休として扱う**（データ移行はしない）
fiscalYearOf / fiscalYearStartMonthOf / yearLaborSummary / paidLeaveRemaining
                           // 年度（既定4月開始・設定で暦年にできる）の累計と有給残。累計は
                           // **period.laborTotals（凍結時点の値）を優先**するので過去参照が要らない
STAFF_LIMIT_WINDOWS / staffLimitOf / limitStateOf / hasAnyStaffLimit
                           // 属性別の勤務時間の上限・下限（1日/週/2週間/1ヶ月＋任意日数）。0＝未設定。
                           // **勤務が1分もない窓は下限割れにしない**（休んだ人が全員ハイライトされるのを防ぐ）。
                           // 窓の一覧をここに1本化してある——設定UI・集計表・提出一覧のバッジ・PDFが
                           // 組を書き写すと、項目を足したときにどれかが取り残される
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
| ~~`authChecked`~~ | bool | **書かれるが読まれない**（app-main.js 冒頭で宣言。`setAuthChecked` は Firebase初期化失敗・Auth復元・未ログイン確定の3経路で呼ばれるが、**値を読む箇所は宣言以外にゼロ**でAuth待ちのゲートには使われていない。#70でこの記述を訂正） |
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
| ~~`generateInviteCode()` / `joinByInviteCode(code)`~~ | **どちらもコード上に存在しない**。2026-07-08 の CompanyTab 新設で企業コード＋パスワード方式に置き換わり、残っていた `generateInviteCode` の定義も 2026-08-24 に削除済み（`8384467`） |
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
│       └── shops            ← {shopId: true} 紐付けマップ
│                              ※ inviteCode / members は旧・招待コード方式のもので 2026-08-24 に削除済み（8384467）
├── email_otps/
│   └── {uid}            ← {code, email, emailLink, expiry, attempts}（OTP・5回失敗で無効化）
├── companies/
│   └── {companyId}/     ← 企業アカウント（CompanyTab・企業コード＋パスワード方式。accounts/{uid}のcompanyLinkとは別系統）
│       ├── pub          ← {name, ownerUid, shops:{shopId:true}}（連携店舗マップ）
│       ├── grants/{shopId}/{uid} ← claimCompanyShop が企業経由で与えたオーナー権限の台帳。
│       │                            解除時にここに載ったuidだけを owners から外す（元からの
│       │                            オーナーは載せない＝巻き添えにしない）。**ルールを持たない
│       │                            ＝クライアントからは読み書きできないCF専用パス**
│       └── private/passwordHash ← パスワードハッシュ（Cloud Functions経由のみ）
└── companyCodes/
    └── {code}           ← companyId（企業コードの逆引き。companyLoginでカスタムトークン発行に使用）
```

**セキュリティモデル（2026-07-07改修・フェーズB）**: 「Anonymous Auth必須 + オーナー権限分離（管理キー方式）」。
- 全クライアントは起動時に `signInAnonymously()`（LOCAL永続化・端末ごとにuid安定）。**全ルールが `auth != null` 必須**のため未認証RESTは全拒否。実ログイン（Google/メール）は従来通り永続化しない（サインイン直前にNONEへ切替）。
- 管理系パス（settings/periods/staff/templates/tokens/global/shops）の書き込みは `shops/{shopId}/owners/{auth.uid}` 登録者のみ。owners への自己登録は `private/adminKey` との値照合が必要で、adminKeyは管理者端末のlocalStorage（`ots_adminKeys_v1`）にのみ保存される。**スタッフURLから得られるshopIdだけでは管理操作できない**。
- スタッフは subs の読み書きと settings/periods/staff の読みのみ（従来機能を維持）。**subs の書き込み・削除は認証済みなら誰でも通る**（`.write: auth != null && $shopId !== 'demo-toriMatsu-v1'`）。提出を触れるのを本人だけに絞っているのは **UI（app-staff.js の `canTouch`）だけ**で、ルールは名乗った名前を検証できない——2026-08-31 決定1で承知のうえ引き受けたトレードオフなので、**再検出しても「バグ」として直さない**。
- **移行猶予は 2026-07-28 に終了済み**（`dbdd9d9`）。未claim店舗への「誰でも書き込み可」ブランチは撤去され、管理系パスは owner uid 一致が必須。**ルールファイルは `database.rules.json` の1本だけ**（同内容の残骸だった `database.rules.tightened.json` は 2026-09-05 に削除済み。以後この二重管理は無い）。
- Cloud Functions（createCheckoutSession/createPortalSession）はIDトークン検証+オーナー照合。App CheckはSDK読込済み・サイトキー未設定でスキップ中（BACKLOG参照）。

### Firebase 書き込みルール（最重要）

```js
// ✅ subs: 個別パスに書き込む（競合防止）
firebaseDB.ref(`shops/${shopId}/subs/${sub.id}`).set(sub);

// ✅ コレクション更新: update() でマージ（periods も subs も同じ）
firebaseDB.ref(fbPath(sid, "periods")).update(periodsFlat); // 変わったキーだけ・削除は null
firebaseDB.ref(fbPath(sid, "subs")).update(subsObj);        // subs は必ず update

// ❌ 禁止: subs を set() で全体上書き → 他端末の提出が消える
firebaseDB.ref(`shops/${shopId}/subs`).set(allSubs);

// ❌ 禁止: periods を set() で全体上書き → この端末が知らない期間が消える
// （2026-09-23 に本番で実害。下の「期間の保存」を参照）
firebaseDB.ref(fbPath(sid, "periods")).set(periodsObj);

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
           startDate: string, endDate: string, deadlineDate: string, createdAt: string,
           snapshot?: {staffList: string[], settings: Settings},  // 確定済み期間の写し
           keepStaff?: {name: string, index: number}[],           // 削除しても列を残す人
           keepAttrs?: {[name: string]: 属性ID},                  // その期間に効かせる旧属性
           laborTotals?: {[name]: {workMin,paid,publicOff,ceremony}} } // 凍結時点の労務の合計（年度の累計用）

// 提出
Sub = { id: string, periodId: string, staffName: string, shopId: string,
        // shift の管理者フィールドは ADMIN_SHIFT_FIELDS（app-utils.js）が正本。
        // adjustedBreak（分・日別の休憩上書き）と leaveType（"public"|"paid"|"ceremony"）を含む
        shifts: {[date: string]: {status:"work"|"holiday", start?:string, end?:string}},
        comment: string, submittedAt: string, updatedAt?: string, isUpdated?: boolean }

// 候補時間
Cand = { start: string, end: string } | { closed: true }

// 設定（passwordは廃止済み・新規店舗には書かれない）
Settings = { shopId, candidates: Cand[], weekdayCandidates: {[dow]: Cand[]},
             dateCandidates: {[date]: Cand[]}, templates: Template[],
             breakTimes?: {weekday|sat|sun|hol: {start,end,tags?}[]},
             staffAttributes?: {[name]: 属性ID},
             staffTypeLimits?: {[属性ID]: {name, laborSystem?: "A"|"B"|"none",
                 daily,weekly,biweekly,monthly,customDays,customHours,          // 上限（0=未設定）
                 dailyMin,weeklyMin,biweeklyMin,monthlyMin,customHoursMin}},    // 下限（0=未設定）
             laborSettings?: {monthlyBase31Min, fixedOvertimeMin, marginMin,
                 agreementDailyOtMin, agreementMonthlyOtMin, fiscalYearStartMonth}, // 分単位・既定は読み手側フォールバック
             breakMode?: "band"|"length", breakLength?: {over8Min, over6Min},   // 休憩の決め方（既定 band＝従来）
             paidLeaveGranted?: {[name]: 日数},                                  // 有給の付与日数（残数の基準）
             overtimeSettings?: {byStaff: {[name]: {lunch,dinner}}}, staffNumbers?: {[name]: string},
             xlShopName?: string, staffColors?: {[name]: "red"|"black"},
             staffAliases?: {[registered]: string[]}, staffHidden?: {[name]: {from:string|null,to:string|null}[]}, periodUnit?: "2week"|"1month" }
```

---

## 企業アカウント（companyLink）の仕組み

1. **Firebase Auth ユーザー**が店舗を作成すると `accounts/{uid}/shops/{shopId} = true` に紐付け
2. 複数端末から同じ Google/Apple/メールでログインすると、`allLinkedShops` に全店舗が入る
3. **複数ユーザーでの店舗共有は「企業アカウント」方式**（2026-07-08 の CompanyTab 新設で確定）:
   - `createCompany`（Cloud Function）で企業コード（8桁）とパスワードを発行し、`companies/{companyId}` と `companyCodes/{code}` を作る
   - 別端末・別ユーザーは `companyLogin`（企業コード＋パスワード）でカスタムトークンを受け取り、`company_{companyId}` uid としてログインする
   - 店舗の追加・解除は `linkStoreToCompany` / `unlinkStoreFromCompany`（管理コード `shopId.adminKey` の提示が必要）
   - **連携の実体は2箇所にある（2026-09-16）**: `accounts/{uid}/shops`（Phase1 が読む・作成者本人のセッション）と `companies/{companyId}/pub/shops`（企業ログインの Phase1 と、下記「連携店舗の一覧合流」が読む）。**解除は必ず両方を消す**——企業側だけ消していたため、企業の作成者が自分の店舗を解除すると一覧からは消えるのにリロードで戻ってきた（本番で報告）。実装は `unlinkShopFromAuth`（app-main.js）1本で、企業連携タブと店舗メニューの「解除」が共有する。企業IDは `companyInfo` を待たず `_resolveCompanyId` が引く（`accounts/{uid}/company` からの復元は非同期なので、押した瞬間に null でも企業側の登録は残っている）。企業側を先に解除するのは、CF が「外すと管理者が居なくなる解除」を拒否する（#65）ため、accounts を先に消すと拒否時に片側だけ消えた状態が残るから。**一覧を作り直すときも同じ集合（accounts ∪ companies）にする**（`_refreshCompanyLinkedShops`。企業側だけで置き換えると、企業に入れていない自分の店舗が操作直後だけ一覧から消える）
   - ~~旧・企業招待コード方式（`inviteCodes/{token}` + `accounts/{uid}/members`）~~: **2026-08-24 に削除済み**（`8384467`）。`generateInviteCode` の定義・`inviteCodes` と `accounts/{uid}/members` のセキュリティルールがこのとき消え、**app-*.js と `database.rules.json` には痕跡が無い**（バグチェック#66 で検出 → #116 で本記述を実態に訂正）。
     **ただし Cloud Functions には残っている**（#147 で実測）: `purgeInactiveShops` の3節（functions/index.js:904-911）が
     いまも毎日 `inviteCodes` を全件読み、`expiresAt` が無いか期限切れのエントリを削除している。#116 が確認したのは
     app-*.js とルールだけで **`functions/` を見ていなかった**——「痕跡は無い」は**その2つについての話**だと読むこと。
     ノードが存在しないので実害は1日1回の空読みだけだが、**ルールが消えた今このパスに `.read`/`.write` は無く、
     クライアントからは読み書きできない**（Admin SDK だけが触れる）。`app-main.js` の `inviteCode` という state 名
     （:69・:1378・:1578）は**別物**で、こちらは現行の店舗コード（shopId）入力欄の変数名が古いまま残っているだけ
4. **店舗切り替え**: `onSwitchToShop(id)` → `startSubscriptions(id)` を shopList なしで呼ぶ（既存の shops リストを維持しつつ購読先だけ切り替え）
   - **切り替え先の管理権限は管理コード無しで揃う（2026-09-16）**: 企業ログインuidは連携時に owners へ入るが、**企業の作成者本人（Google/メールのuid）は自分がclaimした店舗の owners にしか居ない**ため、企業連携タブの「ログイン」で他店舗へ移ると「管理者として登録されていません（閲覧のみ）」になり、店舗ごとに管理コードを入れ直す必要があった。`claimOwnership`（app-main.js）は管理キーを持たない店舗で `private/adminKey` の書き込みが拒否されたとき、`claimCompanyShop` CF を呼んで owners に登録してもらい、オーナーになってから `private/adminKey` を読み直す。**権限の根拠は「呼び出し元が企業メンバー」＋「その店舗が企業に連携済み」の2つだけ**で、連携の時点で管理コードの提示は済んでいる。企業情報の復元は非同期なので、lazy claim の useEffect は `companyInfo` を依存に持ちやり直す
   - **連携店舗の一覧合流**: 作成者本人のセッションは `accounts/{uid}/shops` しか読まないため、企業に連携しただけの他店舗はリロードすると一覧から消えていた。`companyInfo` が決まった時点で `companies/{id}/pub/shops` を読み、**既存の一覧に足りないぶんだけ足す**（既存の一覧は消さない）
5. `doLogout()` はセッションのみクリア（authUser・allLinkedShops は維持）
6. `doFullSignOut()` は Firebase Auth も含む完全サインアウト

---

## Cloud Functions（functions/index.js）

| 関数 | トリガー | 説明 |
|---|---|---|
| `createCheckoutSession` | POST `/createCheckoutSession` | Stripe Checkout セッション作成（**新規契約のみ**。有効な契約がある店舗は409で拒否する） |
| `changePlan` | POST `/changePlan` | **既存契約の price 差し替え**（Pro⇔Premium）。契約を作り直さないので二重課金が起こらない。降格は Subscription Schedule で期間終了時に予約する |
| `cancelPlanChange` | POST `/cancelPlanChange` | 降格予約の取り消し（`subscriptionSchedules.release`）。Stripe側に予約が残っていなくても `scheduledPlan` は必ず消す |
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
| `claimCompanyShop` | Callable `claimCompanyShop` | 連携済み店舗のオーナーに**呼び出し元のuid**を登録（企業連携タブの「ログイン」で管理コードの再入力を無くす。付与は `companies/{id}/grants/{shopId}/{uid}` に記録し、解除時に回収する） |
| `unlinkStoreFromCompany` | Callable `unlinkStoreFromCompany` | 店舗の企業連携を解除（企業uid＋`grants` の付与uidを owners から外す） |

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

### 期間の保存（periods も subs と同じく差分 update・2026-09-23 訂正）

**ここには長らく「periods は競合リスクが低いので全体 set でよい」と書かれていたが、これは誤りだった。**
`shops/{shopId}/periods` を `set()` すると、保存する端末が知らない期間まで一緒に消える。
`startSubscriptions` は購読が返るまでの間 periods を **localStorage の前回値**で埋めるので
（app-main.js）、前提の「保存する端末は期間の全体像を持っている」は普通に崩れる。

**2026-09-23 に本番で実害**: 鷄えん3ビル（`shop_1780453339520`）の「2026年10月前半」
（`p_1789525131346`）の期間レコードが消え、**提出40件と `tokens/ays323mr` は無傷で残った**。
`savePeriods` の削除経路は tokens と subs を先に消すので、**それらが残っていること自体が
「削除ではなく `set()` に巻き込まれた」証拠**になる。オフライン中の保存が再接続時に流れる場合も同じ形。

```js
// OK: 変わったフィールドと、この端末が実際に削除した期間（null）だけを update() する
const flat = diffPeriodsForFlatWrite(prevPeriods, newPeriods); // app-utils.js
if (Object.keys(flat).length > 0) fbUpd(fbPath(sid, "periods"), flat);
```

`diffPeriodsForFlatWrite`（app-utils.js）は subs の `diffSubForFlatWrite` と同じ形で、
**期間の中のフィールド単位**まで割る。新規の期間だけは丸ごと1エントリで返す
（セキュリティルールの `.validate: hasChildren(['id'])` を満たすため）。
フィールド単位にしてあるのは、シフト作成タブが期間を開くたびに `snapshot` を**自動で**書くためで、
期間まるごとの書き込みだと、その自動更新が他端末の直したばかりの `label` を黙って巻き戻す。
**正しさが state の鮮度に依存しない**のがこの形の要点で、古い state から保存しても他の期間は消えない。

### シフト作成タブにセル操作・セル色を追加（2026-07-09〜）

1. `app-utils.js` の `CELL_COMMANDS`（セル内コマンド）/ `CELL_COLOR_LEGEND`（色・記号の意味）レジストリに**必ず登録**する
2. タブ最下部の「操作方法」レジェンド（`GridLegend`・app-admin.js）はレジストリから自動生成されるため、個別編集は不要（登録するだけで説明が自動追記される）
3. パーサ（`extractNote`・app-utils.js）もレジストリ駆動。`tests/core.test.js` の完全性テストが登録漏れ・実装との乖離を検出する
4. 既存コマンド: `h`/`k`/`x`（サフィックス）、`y`/`休`（休み希望・`adminRest`フィールドに保存・トグル式）、`締`（kind:"fixed"・店舗限定の追加出勤コマンド。詳細は下記5参照）。店舗略称バリデーション（CompanyTab）の予約語も忘れずに更新する
5. 店舗限定コマンドの例: `締`（鷄えん東通り店専用・2026-07-12追加、2026-07-12に数字と組み合わせ可能な追加出勤方式へ拡張）。出勤・退勤どちらのセルにも、単独（例:「締」）でも数字と組み合わせ（例: 出勤セル`13`+退勤セル`17締`）でも入力でき、主シフトとは別に23:00〜25:00(翌1:00)を**追加出勤**(`shift.extraStart`/`extraEnd`)として計上する（1日に2出勤が成立する）。判定は`applyEditToSubs`内で`extractNote`が返す`hasFixed`（セル値に締めキーを含むか）と`fixedShiftEnabled`をblurごとに再評価しON/OFFする（`applyFixedShiftToSubs`という専用関数は廃止済み）。**`fixedShiftCommandFor`（app-utils.js）は 2026-07-12 の`2a68ea6`で呼び出しが無くなり、現在はテストからしか呼ばれない**——その完全一致規則（「9締」はnull）は現行の併用可能な挙動と逆なので、判定の根拠として読まないこと（バグチェック#124）。`calcNetWorkMinutes`/`shiftBandInfo`（app-utils.js）は`extraStart`/`extraEnd`を主シフトと合算する形で対応済み。ヒートマップ（`heatData`/`heatHours`）・休みカウント（`restCounts`等）・`isWorkDay`もextra期間を考慮する。店舗の識別は店舗名の部分一致（`isFixedShiftEligibleShop`）で行っており、店舗名変更で無効化されうる点に注意

---

## 労務判定（2026-09-26・3弾すべて実装済み）

職場のシフトExcelひな型（1か月単位の変形労働時間制＋36協定）の判定を移植したもの。
**期待値の正本はリポジトリ直下の `労務判定_実装計画.html` の確定仕様 S-1〜S-7**で、
テストの数値はそこからの転記。実装の出力から逆生成してはいけない。

| 弾 | 内容 | コミット |
|---|---|---|
| 第1弾 | 労働時間制（属性別のA/B/対象外）・月の総枠の自動算出・法定8h/40h・退勤≦出勤の検出 | `44e7561` `d4a026f` |
| 第2弾 | 残業の累積比例按分・36協定3項目・目安の4段階・総括判定 | `322c73b` |
| 第3弾 | 週1休の3状態・休憩方式と日別上書きと休憩不足・休暇種別 ＋ 年度の累計と有給残 | `a6b0883` |
| 追加 | 勤務時間の**下限**を上限と対で設定できるようにする | `b63627d` |

**計画と食い違えた3点（実装はこちらを採っている）**

- **S-3 の本文と表が矛盾していた。** 本文は「拘束>8h→1.0h／拘束>6h→0.75h」だが、同じ節の表の
  ケース3（12:30〜21:00＝拘束8.5h）は控除0.75h・実働7.75h で、**しきい値を実働で見ないと再現できない**。
  労基法34条の「労働時間」も実働なので**表を採った**。4ケースすべて表と一致する。Excel の数式を
  確かめられるのはユーザーだけなので、突き合わせ（検証手順5）のときにここを見ること。
- **単月100h未満の文言は S-4 の表に無い。** 判断4を受けて `月の残業が100h以上` とここで決めた。
  S-6 の総括判定の一覧にも無いが、**法定の絶対上限の違反なので要修正に入れる**
  （2026-09-26 にユーザーが「法定の絶対上限で進める」と確認済み）。
- **休暇のプルダウンは詳細モーダルに置いた。** 計画は「`ya`（終日）＝プルダウンで有給/慶事」だが、
  グリッドのセルに選択UIを載せるには新しいポップアップ層が要る。**`yu`＝有給・`ke`＝慶弔**の2コマンドにし
  （2026-09-26 ユーザー指定。当初 `ya`/`yc` で実装したものを改名した）、種別の変更は
  **提出一覧の詳細モーダルのプルダウン**で行う（日別の休憩上書きも同じ場所）。

**月の集計範囲（計画に無かったのでユーザーが決めた・2026-09-26）**: 按分も目安も上限も暦月が単位だが
Shifty の期間は半月のことがある。「選択中の期間の startDate と同じ年月の全日」を月として集計し、
月単位の判定は次の2つを**両方**満たすときだけ出す。
① **その月の最後の期間を開いていること。** 2週間運用では前半を編集している段階で月の判定を出さず、
  **後半のシフトを組むときに判定する**（前半だけ見て「所定未満」と言われても直しようがない）。
  1ヶ月運用ではその月の期間が1つなので常に最後＝従来どおり判定する。
② その月の全日がデータで埋まっていること。
満たさないときは「要確認」にし、**どちらの理由かをツールチップに出す**（`laborPendingReason`）。

**年度の累計が過去参照なしで出る仕組み（2026-09-26 ユーザー案）**: `subs` は直近3ヶ月の部分購読だが
`periods` は起動時に全件購読する。そこで**期間が終わるまで `period.laborTotals` を書き続け、
終わったら止める**（写し＝`snapshot` と同じゲート・**同じ useEffect**）。凍結値を持たない期間だけ
その場で数え、読めていない期間は画面に「＋」で明示する。
**写しと合計を別々の effect にしてはいけない**——どちらも自分のレンダーの `periods` を map するので
同じコミットで2つ走ると後勝ちで片方が消え、毎回2回書く（`6856168` で1つにまとめた）。

**第2弾以降で入れていないもの**: 36協定の年単位4項目（年720h・複数月平均80h・年6回・年360h）。
判断4の決定で、再着手条件は「期間をまたぐ年間集計の基盤を別件で作ったとき」。**その基盤は
上の `period.laborTotals` で出来たので、再着手の前提は満たされている**（判定自体は未実装）。

**未検証**: 計画の検証手順5（職場の実データ1ヶ月分を Excel と Shifty の両方に入れて全数値を
突き合わせる）。xlsm の操作はユーザーの領分。**Shifty 側の計算値を Excel 側の値として代用しない。**

---

## 既知の技術負債

- iOS Safari ズーム問題（input の fontSize<16）は **2026-09-01 にようやく全箇所解消**（バグチェック#103・`bc7bf2e`）。
  一括是正 `b7c084d`（2026-07-08）が見たのは app-staff.js と app-admin.js だけで、**その2日前の5分割（`f02cc80`）で
  生まれたばかりの app-main.js を一度も開いていない**。そのままここに「全箇所解消済み」と
  書かれ、ログイン画面の店舗コード入力（`fontSize:14`）が約2ヶ月残った。**件数をここに書かない**
  ——フォーム部品はUIを足すたびに増えるので、書いた数はコード変更なしに黙って偽になる（実際 56→57→58 と
  ずれた）。見るのは**16未満が0件**であることだけで、判定は毎回この走査で採る
  （2026-09-10 実測: フォーム部品58件・違反0件）。

  **走査が数えない例外が1件ある（2026-09-23〜）**: シフト作成タブの「全表示」のセル
  （app-admin.js の `AI2` の `fullView` 分岐）は、行高から font を算出するので1ヶ月期間では
  10px程度になる。走査は `fontSize:\s*(\d+)` の**数値リテラルしか見ない**ため、変数で渡すこの1件は
  黙って対象から外れ、**走査は「0件」と答え続ける**（実測: 変更後も 58件/違反0件）。
  RULES.md に例外として明記済みで、**規約違反として16pxへ戻さないこと**。

  **タグの終端は「波括弧の外にある `>`」で決めること。** 素朴な `indexOf(">")` は
  `onChange={e=>…}` の矢印に当たってタグを途中で切り、その先の `style` を読まないまま
  「0件」と言う（**偽陰性**）。2026-09-10 に実測で確認した——素朴版を `bc7bf2e~1`
  （`fontSize:14` が実在した版）に当てると **0件と答える**。下の走査は同じ版で
  正しく1件を出す:
  ```bash
  node -e '
  const fs=require("fs");let total=0;const bad=[];
  for(const f of ["app-utils.js","app-core.js","app-staff.js","app-admin.js","app-main.js"]){
    const s=fs.readFileSync(f,"utf8");const re=/<(input|select|textarea)[\s\/>]/g;let m;
    while((m=re.exec(s))){
      total++;let d=0,end=-1;
      for(let i=m.index+m[0].length-1;i<s.length;i++){
        const c=s[i];
        if(c==="{")d++;else if(c==="}")d--;else if(c===">"&&d===0){end=i;break;}
      }
      if(end<0)continue;
      const t=s.slice(m.index,end+1).match(/fontSize:\s*(\d+)/);
      if(t&&+t[1]<16)bad.push(f+":"+s.slice(0,m.index).split("\n").length+" fontSize:"+t[1]);
    }
  }
  console.log("form elements:",total,"/ fontSize<16:",bad.length);bad.forEach(b=>console.log("  "+b));'
  ```
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
## Shifty バグチェックレポート（2026-09-25 自動実行 #147）

> 着手時の HEAD は `db3a513`。**#143 の HEAD（`9d2579b`）以降、`app-*.js`・`functions/`・
> `index.html`・`database.rules.json` は1バイトも変わっていない**（5回連続でコードが同一）。
> そこで全部を **#146 の申し送り**に充てた——②「残りの `.catch` と `||` のフォールバックを
> 『この既定値は〈無い〉か〈分からない〉か』で当てる」／②に付いていた `attrIdExists` の宿題／
> ③「`app-admin.js` が `app-utils.js` のエクスポート済み関数を使わずに同じ計算を書いている箇所」。
>
> **③は当たり、②の宿題は外れ、②本体は当たったが場所が違った。** `.catch` の残りはどれも表示限りで、
> 代わりに**サインインそのものの失敗が同じ形で握り潰されている**のが出た。
> ③は `app-admin.js` に限らず **`app-main.js` にも同じ形があった**（写しは admin だけの癖ではない）。

### 修正済み

- **[🟢] subs 部分購読の窓が、同じ規則の2つの写しで計算されている**
  （app-utils.js の `recentPeriodIds` ／ app-main.js:476 の `reconcileSubs`）→ `d15a566`

  `recentPeriodIds` は **配信物のどこからも呼ばれていない**（呼ぶのはテストだけ）。
  `reconcileSubs` は `subsWindowCutoff` だけを借り、「どの期間を購読するか」の判定は
  自前で同じ式を持っている。**現状の値は一致＝ユーザーに見える差は無い**（8ケース実測）。
  問題は窓の規則を変えたときに**片方だけが追随する**こと——壊れるのは「直近3ヶ月ぶんだけ購読して
  DL量を抑える」という前提そのもので、症状は「古い期間の提出が出てこない」か「全期間を読む」の
  どちらかになり、**どちらも黙って起きる**。`fixedShiftCommandFor`（#124）と同じ
  「テストからしか呼ばれない純粋関数」の形で、これが2例目。写しを消すのは配信物の
  リファクタなので、**#144〜#146 と同じくドリフトの検出に留めた**（AST で `cutoff` の宣言と
  `want.add(p.id)` を含む文だけを取り出して実行し、`recentPeriodIds` と照合／
  `cutoff` が `subsWindowCutoff` を通っていることも確認）。

  **対照で裏を取った**（写しを改変し `SHIFTY_MAIN_SRC` で向ける。配信物は無変更）。無改変=283件パス、
  注入した6形はすべて検出: 境界 `>=`→`>` ／ 窓の判定を外す ／ 3ヶ月→6ヶ月 ／
  `cutoff` を自前の月計算に ／ id 無しガードを外す ／ `startDate` 無しを含める。
  ケースには**窓の下限ちょうどの期間を必ず入れた**（#146 で学んだとおり、境界に掛かる入力が
  無いと `>=`→`>` が両方とも同じ答えになって素通りする）。

- **[🟢] CLAUDE.md の「招待コード方式の痕跡はコードにもルールにも無い」が事実と違っていた** → `3b03c09`

  `purgeInactiveShops` の3節（functions/index.js:904-911）が**いまも毎日 `inviteCodes` を全件読み**、
  `expiresAt` が無いか期限切れのエントリを削除している。#116 が「痕跡は無い」と訂正したとき見たのは
  **app-*.js と `database.rules.json` だけで、`functions/` を見ていなかった**。
  ノードが存在しないので実害は1日1回の空読みだけだが、**ルールが消えた今このパスに `.read`/`.write` は
  無く、Admin SDK だけが触れる**状態で掃除機だけが残っている。記述を実態に直した。
  なお `app-main.js` の `inviteCode` という state 名（:69・:1378・:1578）は**別物**で、
  現行の店舗コード（shopId）入力欄の変数名が古いまま残っているだけ（機能は生きている）。

### 要確認（未修正）

**新規の 🔴 は無し。🟡 は1件で、条件B（仕様判断）に該当するため BACKLOG 化した。**

- **[🟡] 匿名サインインに失敗しても起動を続け、エラー画面も出さないまま「キャッシュだけのアプリ」になる** → **BACKLOG化済み**

  `signInAnonymously().catch(…).then(()=>proceed(null))`（app-main.js:172）は
  **拒否されても `proceed()` が走る**。エラー画面の条件は `initError&&(!ready||!currentShopId)`（:1354）
  なので、**Cookie で店舗が復元できる端末では画面が出ない**。全ルールが `auth != null` を要求するため
  あらゆる読みが拒否されるが、購読の失敗は `console.warn` だけ（:386）＝画面に出ているのは
  localStorage の前回値になる。保存も拒否され、そのとき `serverSnapRef` が空なので
  **`revertAdminWrite` の復元が走らず**（#96 で塞いだ「拒否されたのにローカルだけ変更後のまま」が再発）、
  出る文言は **「この端末は管理者として登録されていません。設定タブの『コードで追加』から登録できます」**
  ——原因と食い違ううえ、**案内された導線も同じ理由で失敗する**。
  `on("value")` はキャンセルされるとリスナーが外れ、再購読の経路が無いので**リロードするまで直らない**。
  引き金は狭い（Auth だけが落ちて RTDB は繋がる）。**実際に起きた形跡は見ていない。**

- **[🟢] `recentPeriodIds` は配信物から一度も呼ばれない**（上の修正済みの裏側）。
  同じ走査で、`module.exports` の93件のうち**他ファイルから一度も参照されないものが13件**あった。
  大半は `getBreakList`・`positionDayTypeFor` のような app-utils.js 内部の下請けで問題ないが、
  **`recentPeriodIds` と `fixedShiftCommandFor` の2件だけは「配信物に同じ判定の写しがある」型**で、
  テストが通っても実装が守られない。次にこの一覧を採るときは**内部下請けと写し持ちを区別して見ること**。

- **[🟢] #143 の「1時間ぶんの列幅の式が2本ある」**（app-admin.js:1248 の `22` と :1211 の
  `HEAT_NAT_HOURW=24`）と **`fvEdge=false` の死んだ分岐**（:1324）は変化なし。
  **今回で「同じ式が2本ある」型は4例目**になった。

- **#146 以前から継続（変化なし）**: BACKLOG 化済みの既存項目はすべて変化なし（コードが同一のため）。
- **引き受け済みのトレードオフ（再検出しても直さない）**: `subs/$subId/.write` は認証済みなら通る（2026-08-31 決定1）。

### 当てて否定した仮説

- **#146 申し送り②の宿題「`attrIdExists` の `BUILTIN_TYPES` 早期 return が、上限判定を走らせないまま
  当たる入力を持つか」→ 持たない（到達不能）**。成立には
  「`staffAttributes[名前]==="dispatch"` なのに `staffTypeLimits.dispatch` が無い」状態が要るが、
  **`makeSettings`（app-core.js:137）も SetTab の `DEFAULT_TYPES`（app-admin.js:4576）も
  employee/parttime しか作らない**ので、無い店舗では属性ピッカー（:3396＝`{employee,parttime,...stl}` を
  そのまま並べる）が**派遣を1つも出さない**。逆に持っている店舗（2026-06-16〜06-28 の `makeSettings` が
  作った旧データ）では上限も一緒に入っているので判定は走る。しかも
  **`deleteType` の削除ボタンは `!isBuiltin` のときしか描画されない**ので、後から消すこともできない。
  **この観点は閉じてよい。**

- **`.catch` の残り（#146 で挙げた3件以外）が「分からない」を「無い」に丸めていないか → 表示限りで実害なし**。
  店舗一覧を作る `readShop(id).catch(()=>null)`（app-main.js:278・296・651・1016・1104・1132）は
  読めなかった店舗を一覧から落とすが、**落ちた結果が永続する経路が無い**（`saveShops` は
  `global/shops/{id}` へ**書くだけで消さない**）。企業の連携店舗を合流させる :1126-1142 は
  **既存の一覧に足すだけ**で置き換えない。:535 の `if(!snap.val()) fbSet(settings, makeSettings())` は
  読みが reject すると `.catch(()=>{})` でチェーンごと止まる＝**既定値で上書きしない**側に倒れている。

- **属性の一覧を作る式が `getAttrOptions`（app-utils.js:311）と app-admin.js:3396 の2箇所にある
  → 現状は同値**。旧データの `dispatch:{daily,weekly}`（`name` 無し）・名前の空の custom 属性・
  並び順のいずれでも同じ結果になることを式のまま突き合わせて確認した。「同じ式が2本ある」型ではあるが、
  片方が `STAFF_TYPE_LABELS` へのフォールバックを持つ形まで一致しているので**今回は数えていない**。

### 検証したこと

- `npm test` **283件パス**（#146 の282件 +1・追加は `tests/` のみ）・`npx eslint app-*.js`
  **0 errors / 95 warnings**（同数）・`node --check functions/index.js` 通過。
- RULES.md スキャン（**#145 申し送り①の修正版 grep**）: `DEV_MODE` は式のまま（app-core.js:12）／
  `subs`・`periods` の全体 `set()` 0件（ヒットは購読と `fbUpd` のみ）／`accounts` 全件読み 0件／
  SRI 11件／**読み込み順を index.html の `<script>` 行そのもので確認**（utils→core→staff→admin→main。
  `app-[a-z]*\.js` の素朴な grep は CDN の `firebase-app-compat.js` とコメントを拾うので使わない）／
  `database.rules.json` の `".read": true` 0件／`functions/index.js` に `.delete()` 0件。
- **配信版数は追随済み**（`20260923-bb394a3`）。**今回の変更は `tests/`・`BACKLOG.md`・`CLAUDE.md`・
  `.cursorrules` だけで、配信物は1バイトも変えていない**（git で確認）。
- **実ブラウザの回帰スクリプトは今回も回していない**（#143 以降配信物が無変更のため。＝未実施）。
- **Firebase・Stripe・本番データには一切アクセスしていない。** 実測はすべて配信物の関数・式を
  Node で実行したもの（`app-utils.js` は require、app-main.js の式は AST とソース行の切り出しで実行）。

**申し送り（次回の観点）**

1. **スケジュールタスクのファイル（`~/.claude/scheduled-tasks/shifty-bug-check/SKILL.md`）の
   PHASE 2〜4 の grep は9箇所すべて `app.js` を対象にしており、`app.js` は 2026-07-06 の5分割
   （`f02cc80`）で存在しない**。#145・#146 に続き3回目の申し送り。実行すると0件が返るだけで
   「正常」と見分けがつかないため、毎回 `app-*.js` へ読み替えて手で当てている。
   **スキルファイル側なのでこのループでは直していない**（このループが書き換えてよい対象ではない）。
2. **「同じ式が2本ある」型は4例目で、しかも今回 `app-main.js` にも出た。**
   #146 の申し送りは `app-admin.js` を洗えと書いていたが、**写しは admin だけの癖ではない**。
   次回は逆向きに引くとよい——「`module.exports` にあるのに配信物から呼ばれない関数」を起点に、
   その判定が配信物のどこに書き写されているかを追う（今回それで1件出た）。残る候補は
   `candListsEqual`（候補リストの同値判定）と `positionDayTypeFor`。
3. **失敗の握り潰しは `.catch` の外にもある。** 今回の🟡は `.catch(…).then(…)` という形で、
   **catch がチェーンを解決済みに戻すため後続が走る**のが根だった。次回は
   `.catch(...).then(` と `catch{}` に続く処理を同じ目で当てるとよい。判定は
   「この失敗のあと、**続きを走らせてよいのか**」。
4. #143 申し送りの**ヒートマップ寸法定数**の境界水準を `example-heat-colw-fixed.js` に足す件は**今回も未着手**。
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

## 🟡 匿名サインインに失敗しても起動を続け、エラー画面も出さないまま「キャッシュだけのアプリ」になる

**目的**: 起動時の匿名サインインが失敗したとき、アプリは**失敗を握り潰して先へ進む**。
Cookie で店舗が復元できる端末では**エラー画面も出ない**ので、利用者には普通の管理画面に見える。
しかし全ルールが `auth != null` を要求するため**あらゆる読みが拒否され**、画面に出ているのは
localStorage の前回値だけになる。保存も拒否されるが、そのとき出る文言は
**「この端末は管理者として登録されていません。設定タブの『コードで追加』から登録できます」**で、
原因（サインインできていない）と食い違ううえ、**案内された「コードで追加」も同じ理由で失敗する**。

**実測**（配信物の該当行をソースからそのまま取り出して Node で実行。**Firebase・Stripe には一切アクセスしていない**）:

| 測ったもの | 結果 |
|---|---|
| `signInAnonymously().catch(…).then(()=>proceed(null))`（app-main.js:172） | 拒否されても `initError="auth"` を立てた**うえで `proceed()` が走る** |
| エラー画面の条件 `initError&&(!ready||!currentShopId)`（:1354） | 店舗なし→出す ／ **Cookie で店舗復元済み→出さない** |
| 購読の失敗（`on` の第3引数・:386） | `console.warn` だけ。UIに手がかりは出ない |
| `revertAdminWrite` の復元（:1218-1225） | `serverSnapRef` が空（購読が1度も返っていない）と**復元が走らない**＝ローカルは変更後のまま・サーバーは旧値 |
| その時の文言（:1228-1231） | `PERMISSION_DENIED` なので**「管理者として登録されていません」側**が出る |

**購読はやり直されない**。Firebase の `on("value")` はキャンセルコールバックが呼ばれた時点で
リスナーが外れ、`startSubscriptions` は再購読の経路を持たない。つまり一度失敗すると
**そのセッションの間ずっとキャッシュ表示のまま**で、リロードするまで直らない。

**引き金は狭い**: Auth のエンドポイントだけが落ちる（`auth/network-request-failed`・
`auth/too-many-requests` のクォータ・コンソールで匿名プロバイダが無効化される）一方で RTDB には
繋がる、という組み合わせが要る。**実際に起きた形跡は見ていない**——根拠は上のコード実測だけ。

**ループで直さなかった理由（条件B・仕様判断）**: 倒す向きが決まらない。
- 案A: サインインに失敗したら `proceed()` しない。確実だが、**一時的な失敗でもキャッシュすら見せずエラー画面**になる
  （いま「オフラインでも前回の表示は出る」ことに助けられている利用者を切る）
- 案B: 進むのは今のままにして、`currentShopId` があっても `initError==="auth"` なら
  **閲覧専用である旨の帯を出す**（既存の「管理者として登録されていません」バナーと同じ置き場）
- 案C: 文言だけ直す。`revertAdminWrite` で `firebaseAuth?.currentUser` が無いときは
  「サインインできていません。再読み込みしてください」に分ける（最小。読みが死んでいることは伝わらない）

**受け入れ条件**:
- [ ] 案A〜Cのどれにするか決める（**ユーザー判断**）
- [ ] 決めた案を実装する。案B/Cなら、`serverSnapRef` が空のときに復元が走らない点
      （＝拒否されたのにローカルだけ変更後のまま残る・#96 で塞いだ形の再発）も同じコミットで塞ぐ
- [ ] 購読がキャンセルされたことを UI が知る手段を持つか決める（いまは `console.warn` だけ）
- [ ] 非回帰: 通常の非オーナー端末で従来どおり「管理者として登録されていません」が出ること

**影響範囲**: app-main.js（`signInAnonymously` の2経路 :167/:172、`on` のエラーコールバック :386、
`revertAdminWrite` :1215-1232、エラー画面の条件 :1354）
**備考**: バグチェック#147（2026-09-25）で検出・**条件B（どちらの失敗の見せ方を取るかの判断）に該当**。
上の🟡「読みの失敗を『問題なし』に丸めている3箇所」と**家族は同じ**（失敗を良性の既定値に丸める）が、
あちらは `.catch` の既定値、こちらは**サインインそのものの失敗**で、直す場所も倒す向きの判断も独立するため分けた。

---

## 🟡 企業ログインのセッションで「コードで追加」した店舗が、リロードすると一覧から消える

**目的**: 企業コード＋パスワードでログインしたセッション（`uid="company_"+companyId`）が
店舗ドロップダウンの「コードで追加」で店舗を足すと、**成功トーストが出て切り替えもできるのに、
リロードすると一覧から消える**。管理コードを入れ直すまで毎セッション同じことが起きる。

**コード上で確定していること**（すべて配信物を読んで確認。Firebase・Stripe には一切アクセスしていない）:

| | 実測・コード上の事実 |
|---|---|
| 書き込み先 | `accounts/${authUser.uid}/shops/${code}`（app-admin.js:70）。企業セッションでは `accounts/company_{id}/shops/...` になる |
| 企業セッションの Phase1 が読む先 | `companies/{companyId}/pub/shops`（app-main.js:270-290）。この分岐は**読み終えると `return` する** |
| `accounts/{uid}/shops` を読むか | **読まない**（上の `return` より後にあるため到達しない） |
| Cookie フォールバック | `if(authUser){...return;}` の内側で必ず return するので、**authUser があるときは到達しない**（app-main.js:309） |
| 正しい書き込み経路 | `linkStoreToCompany`（CF）＝企業連携タブの「＋ 管理コードで追加」。こちらは `companies/{id}/pub/shops` を書く |
| ドロップダウン側の gating | **無い**。「コードで追加」ボタンは `companyInfo` に関係なく常に描画される（app-admin.js:124） |

つまり**同じ「店舗コードで追加する」操作にUIが2つあり、企業セッションでは一方だけが永続する**。
しかも設定タブは「別端末への共有は『店舗名ボタン → コードで追加』から行えます」（app-admin.js:4562）と
**消える側を案内している**。

**根は2026-09-16 に一度直したものと同じ**——CLAUDE.md が「連携の実体は2箇所にある
（`accounts/{uid}/shops` と `companies/{companyId}/pub/shops`）。**解除は必ず両方を消す**」と
書いているとおり、**解除側は両方を触るよう直された**が、**追加側（ドロップダウン）は片方しか書かず、
企業セッションでは読まれない方を書いている**。

**ループで直さなかった理由（条件B・仕様判断）**: 直し方で「誰にその店舗が見えるか」が変わる。
- 案A: 企業セッションではドロップダウンの追加も `onLinkStoreToCompany`（CF）へ回す。永続するが
  **企業の全メンバーにその店舗が見えるようになる**（「この端末に足す」つもりの操作が企業全体への連携になる）
- 案B: `accounts` と `companies/pub` の両方へ書く。実質案Aと同じ可視範囲になる
- 案C: 企業セッションではドロップダウンの「コードで追加」を出さず、企業連携タブへ誘導する
  （可視範囲は変えないが、端末単位で足す手段が無くなる）

「端末に足す」と「企業に連携する」が同じ操作でよいのかはコードからは決められない。

**受け入れ条件**:
- [ ] 上の案A〜Cのどれにするか決める（**ユーザー判断**）
- [ ] 決めた案を実装する。案A/Bなら `createNewShop`（app-main.js:1426）と `applyInviteCode`（同:1392）も
      同じ形（`accounts/{uid}/shops` だけを書く）なので、企業セッションでの扱いを揃える
- [ ] app-admin.js:70 の `fbSet` に `.catch` が無い点も併せて直す。外側の
      `.catch(()=>setShopCodeError("確認に失敗しました"))` は店舗照会の chain に付いており、
      **`fbSet` の失敗は受け取らない**（その promise を return していないため）。
      いま成功トーストは書き込み結果に関係なく出る
- [ ] 設定タブの案内文（app-admin.js:4562）が、決めた経路と一致しているか確認する

**影響範囲**: app-admin.js（`addShopByCode`・ドロップダウンのボタン・案内文）、app-main.js（`createNewShop`・`applyInviteCode`）
**備考**: バグチェック#146（2026-09-25）で検出・**条件B（可視範囲の仕様判断）に該当**。
**実害の報告はまだ無い**——根拠はコードの読みだけで、本番データには一切アクセスしていない。
自家用の店舗は企業連携タブ経由で連携済みなのでこの経路を踏んでいない可能性が高い。

---

## 🟡 読みの失敗を「問題なし」に丸めている3箇所（安全確認が黙って通り、1つは管理キーを回してしまう）

**目的**: いずれも `.catch` で読みの失敗を**良性の既定値に丸めている**ため、
「確認できなかった」が「問題なかった」として扱われる。3箇所とも**失敗しても何も表示されない**。

| | 場所 | 失敗時に何が起きるか |
|---|---|---|
| ① 店舗間シフト重複の判定 | app-admin.js:436-438（`shopAbbrs`・`subs`・`staffAliases` を `.catch(()=>null)`） | `null` が「その店舗にデータが無い」と同じに扱われ（`(sS&&sS.val())||{}`）、`dupErrors` が**重複0件**を返す。管理者は「他店舗との二重予約は無い」と読んでシフトを配る |
| ② 店舗略称の重複チェック | app-admin.js:4209（`.catch(()=>[s.id,[]])`） | その店舗は「略称を持たない」ことになり、**同じ略称が2店舗に登録できる**。直上のコメント自身が結果を書いている——`abbrToShop`（先勝ち）がヘルプ先を別店舗に解決する |
| ③ `claimOwnership` の管理キー読み | app-main.js:605-628（`catch(e){key=null;}`） | 非オーナーなら正しい（拒否＝キーは読めない）。だが**本当はオーナーで読みが一時的に失敗した**場合、`genSecureId(32)` で新しいキーを生成して `private/adminKey` を**書く**（オーナーには許可されている）。**他のオーナー端末が持つ既存のキーが無効になり**、`owners/{uid}` の再登録に失敗して閲覧専用に落ちる |

①②はどちらも「安全のための確認」で、**確認が走らなかったときに『問題なし』側へ倒れる**のが共通の形。
③は丸めた結果が**破壊的な書き込み**につながる点が違う。

**いずれも権限ではなくネットワーク起因**（①②が読むパスは `.read: auth != null`、③はオーナー自身の読み）。
つまり普段は起きないが、起きたときに**気づく手がかりが1つも無い**。

**ループで直さなかった理由（条件B・仕様判断）**: 「確認できなかった」ときにどう振る舞うかは仕様の話。
- ①②: 読めなかった店舗を明示する（「他店舗の確認ができませんでした」）／保存を止める／黙って通す、のどれか。
  **止めると、連携店舗が一時的に読めないだけでシフトを配れなくなる**ので、倒す向きの判断が要る
- ③: 拒否（`PERMISSION_DENIED`）と一時的な失敗を `e.code` で切り分け、**後者ではキーを生成しない**。
  切り分けが正しいかは実際の失敗モードを見ないと決められない

**受け入れ条件**:
- [ ] ①②で「確認できなかった」ときの振る舞いを決める（**ユーザー判断**。表示のみ／保存を止める／現状維持）
- [ ] ③は拒否と一時失敗を切り分け、一時失敗では `private/adminKey` を**生成・書き込みしない**ようにする
      （切り分けの根拠を `e.code` で示せるようにする）
- [ ] ③の非回帰: 非オーナー端末が従来どおり閲覧専用に落ちること・オーナー端末が従来どおり claim できることを確認する

**影響範囲**: app-admin.js（`useEffect` の他店舗読み・`allAbbrs` の先読み）、app-main.js（`claimOwnership`）
**備考**: バグチェック#146（2026-09-25）で検出・**条件B（確認できなかったときに倒す向きの判断）に該当**。
3件をまとめたのは根が同じ（読みの失敗を良性の値に丸める）で、**倒す向きを一度決めれば3箇所に同じ規則を当てられる**ため。
**実際に失敗した形跡は見ていない**（Firebase には一切アクセスしていない）。根拠はコードの読みのみ。

---

## 🟡 `settings` / `staff` / `templates` は今も「コレクション全体 set()」で、期間を1件失ったのと同じ形が3経路残っている

**目的**: 2026-09-23 の本番事故（期間レコードが1件消えた）の根は「**古い state をそのまま全体 `set()` する**」で、
`periods` は `156a925` の差分 update() で塞いだ。**同じ根が `settings`・`staff`・`templates` に残っている。**

**コード上で確定していること**:

| | 書き込み | 古い state を持ちうるか |
|---|---|---|
| `periods` | `fbUpd`（差分・**塞いだ**） | 持つ（app-main.js:374 で localStorage から埋める） |
| `settings` | **`fbW(fbPath(sid,"settings"), v)` ＝ 全体 set()**（app-main.js:1237） | 持つ（同:373） |
| `staff` | **`fbW(fbPath(sid,"staff"), v)` ＝ 全体 set()**（同:1271） | 持つ（同:372） |
| `templates` | **`fbSet(fbPath(targetSid,"templates"), v)`**（同:339） | 持つ（同:375） |

`fbSet` は `firebaseDB.ref(path).set(value)`（app-core.js:80-87）＝そのノードを丸ごと置き換えるので、
**保存する端末の state に無いキーはサーバーから消える**。

**実測**（`sanitizeForSet` と set() のセマンティクスをそのまま Node で再現。**Firebase には1バイトも出していない**）。
端末Aが古い settings を持ったまま、設定タブで **Excelの店舗名だけ**を変えて保存した場合:

| 端末Bが直前に足したもの | 保存後 |
|---|---|
| `staffAttributes` の「佐藤: 社員」 | **消える** |
| `breakTimes.weekday` の 12:00〜13:00 | **0件に戻る** |
| `staffAliases` の「田中 ←たなか」 | **消える** |

端末Aが変えたつもりなのは `xlShopName` だけなのに、`staffAttributes`・`breakTimes`・`staffAliases` の3キーが戻る。
**警告もエラーも出ない**（`set()` は成功する）。`staff` なら他端末が追加したスタッフが名簿から消え、
`templates` なら登録したテンプレートが消える。

**古い state になる経路は2つ**、どちらも期間の事故と同じ:
- **オフライン中の保存が再接続時にフラッシュされる**（`156a925` 自身が期間について同じ形を挙げている）
- **購読が返る前の窓**。app-main.js:372-375 が localStorage の前回値で state を埋め、`SS_TAB` は
  前回のタブを復元するので、**設定タブを開いたまま閉じたユーザーは設定タブから再開する**

**ループで直さなかった理由（条件D＋条件B）**:
- **`periods` と同じ形にはできない**。`periods` はキーが期間ID・値が独立したレコードなので
  「知らないキーに触らない」が素直に効くが、`settings` は**1つのオブジェクトの中に
  スタッフ名をキーに持つマップが8つ**ある（`STAFF_KEYED_SETTING_MAPS`）。トップレベルだけを
  フィールド単位にしても `settings/staffAttributes` を丸ごと書くので、**同じ問題が1階層下に移るだけ**
- **どこまで割るかがユーザー判断**（条件B）。マップの中までキー単位に割ると、
  「他端末が消したスタッフの属性が、こちらの保存で復活しない」ことまで面倒を見る必要が出る
- `staff` は**順序を持つ配列**で、キー単位の update に落とすとデータの形が変わる（移行が要る）

**受け入れ条件**:
- [ ] どこまで割るかを決める（**ユーザー判断**）
  - 案A: `settings` のトップレベルだけフィールド単位にする（`diffPeriodsForFlatWrite` と同じ形）。
    実装が小さく、**別々の設定項目を触った2端末は衝突しなくなる**。同じマップを触った場合は今のまま
  - 案B: スタッフ名キーのマップも中まで割る（`settings/staffAttributes/田中`）。衝突はほぼ消えるが、
    削除の扱い（消したキーを null で明示する側／しない側）を決める必要がある
  - 案C: 現状維持。「設定は1端末から編集するもの」と位置づけてコメントに明記する
- [ ] `staff`（順序つき配列）をどうするか決める。案A/Bを採っても配列のままなら保護されない
- [ ] 決めた案を実装し、`diffPeriodsForFlatWrite` と同じ形のユニットテストを追加する
      （**空配列・空オブジェクトの往復で再書き込みにならないこと**を必ず含める。#142 で `periods` 側が踏んだ）
- [ ] RULES.md の禁止事項に対象を追記する（現在は `subs` と `periods` だけ）

**影響範囲**: app-main.js（`saveSettings` / `saveStaff` / `saveShopTemplates`）、app-utils.js（差分関数の追加）、
tests/core.test.js、RULES.md
**備考**: バグチェック#142（2026-09-23）で検出・**条件D（設計変更）と条件B（どこまで割るかの判断）に該当**。
**実害の報告はまだ無い**——根拠は「`periods` で実際に起きた事故と機構が同一であること」と上の実測で、
本番データには一切アクセスしていない。app-main.js:371 のコメントは**店舗切替時**の取り違えを
同じ機構で説明しており（だから 372-375 でキャッシュへ同期リセットしている）、
**古いキャッシュそのものが同じ危険を持つ**ところまでは届いていなかった。

---

## 🔴 シフト作成タブ: 「全員表示」を「全表示」に改め、期間全体（左上「日付」〜右下最終日）を縦横スクロールなしで一望できるようにする

> **✅ 2026-09-23: 実装・本番解放まで完了**
> 当初はユーザー指示「一旦Devのみで表示して」により `const fullView=fitAll&&DEV_MODE;` で囲っていたが、
> 同日に `&&DEV_MODE` を外して**本番（shiftyshifty.app）へ解放した**（現在は `const fullView=fitAll;`）。
> ボタンのラベルも常に「全表示」になる。`boxSizing:"border-box"` が `fullView` に連動するため、
> **本番の全員表示に残っていた横はみ出し（8/15/25名で26/49/89px）も同時に解消した**。
> 通常表示の10指標はベースラインとバイト単位で一致することを実測済み（非回帰）。
>
> **追加のユーザー指示（2026-09-23）**: スタッフが少なくても画面幅いっぱいに列を引き伸ばさない。
> **スタッフ列の幅は通常表示と同じ39pxを上限**とし、余った幅は左右の余白にして**表は中央寄せ**にする。
> グリッド・休みカウント表・集計表の3つとも同じ幅で中央に置くので列位置は揃ったまま。
>
> 実測（`node .claude/skills/shifty-e2e-verify/scripts/example-fitall-geometry.js` → **EXIT=0 / allPass**。
> viewport 1400×900・Firebase非接続）:
>
> | 水準 | 横の余り | 縦の余り | 日付列 | スタッフ列 | セルのfont |
> |---|---|---|---|---|---|
> | 16日×8/15/25名 | 0px | 0px | 45px | 39px（上限） | **16px**（規約違反なし） |
> | 31日×8/15/25名 | 0px | 0px | 45px | 39px（上限） | **9px** |
>
> **2週間期間なら16pxのまま収まる**（＝16px規約に触れるのは1ヶ月期間だけ）。1ヶ月でも9pxで、
> 計画時の試算（5〜7px）より読める。全表示のまま編集できることも実測済み
> （31日×3名で186個のinputが描画され、セル編集→保存が「✓ 2件のシフトを保存しました」で通る）。
>
> **localhost の実アプリ（標準テスト店舗・8月前半15日・スタッフ4名）でも確認済み**:
> 縦横とも余り0px、日付列45px・スタッフ列39px、セルのfont 14px、表の中心が画面中心と一致
> （表の左右端 557/844・画面中心700）、グリッドと下段3表の1スタッフ目の列が全て同じ603pxから始まる。
>
> **行高は小数のまま使う**（整数に丸めると収まる最大値を1px下回った時点で行数ぶんまとめて捨てる）。
> thead は `<tr>` に height を明示して高さを確定させ、行あたり0.5px（border-collapse の分け合うボーダー）と
> 枠線・丸め用に6pxを差し引く。**この差し引きが無いと実アプリで4pxはみ出す**（実測して確定した値）。
>
> **2026-09-23 追加分**:
> - **2週間を上限**: 行高を期間の日数ではなく最長16日ぶんで決める（`FV_MAX_DAYS`）。1ヶ月の期間でも
>   フォントは16pxのままで、入りきらない日は縦スクロール。これが無いと1ヶ月×30名でフォントが
>   下限5pxまで落ちて時刻が読めない（実測）。16日なのは Shifty の「2週間」期間が半月単位＝最長16日だから。
> - **セル色の欠落を修正（`fill` で確定）**: 全表示では input が td を覆うため、td 側の2色（土日祝の行色・
>   ポジション不足の黄色）が消えていた（バグチェック#141 が検出）。2案を実装して見比べ、
>   **2026-09-23 に `fill` で確定した**（`const fvEdge=false;`。切り替えスイッチ `?fvcolor=` は削除済み）。
>   - `fill`（採用） … input の背景を透明にして td の色をセル全面に出す。**フォントを落とさない**。色は最も濃い
>   - `edge`（不採用） … input を一回り小さくし、通常表示と同じ帯（7px/4.5px）で見せる。見た目は揃うが
>     行高を4px使うのでフォントが落ちる（実測: 15日×30名で16px→12px）
> - **絞り込み時のヒートマップの置き場**: グリッドが必要とする幅（`gridNeedW`）を先に確保し、
>   余った幅だけをヒートマップの横パネルに回す。横パネルとして成立する下限は3時間ぶん
>   （`HEAT_PANEL_MIN_HOURS=3`）で、それを割るならヒートマップをグリッドの下へ回す。
> - **キッチン/ホール絞り込み時のヒートマップ**: 時間帯を横スクロールさせず全部出す（`fitHours`）。
>   px を計算せず `table-layout:fixed` に割らせるので、横パネルでもグリッド下でも同じ1本で効く。
>   実測（localhost・標準テスト店舗・10〜25時の16列）: 絞り込み無しは従来どおり1列22pxで160pxスクロール、
>   キッチンのみ／ホールのみでは**両方のヒートマップがはみ出し0**（列幅は12.1〜65.9pxで枠に応じて可変）。
>
> **並行していた `/bug-check` ループとの統合（2026-09-23）**: #140・#141 のセッションが
> `example-fullview-cell-colors.js` を追加していた（`5ea68ab`。app-admin.js は「並行セッションが編集中」
> として触っていない）。このスクリプトを本タスクの検証に取り込み、判定だけ拡張した——
> **帯の太さしか見ておらず `fill` 方式が偽陰性になる**ため、「帯がある」か「input が透明」かの
> どちらかで可とする `fullShowsTdColor` に変えた。
>
> **残り**: 本番リリース（`/release-to-main`・`?v=` のバンプ）のみ。
> ①`fill` の確定・②本番解放・③ドキュメントのコミット・④dev標準テスト店舗での実機E2E は完了済み。

**目的**: 現在の「全員表示」（`fitAll`・app-admin.js:376）は、導入時の意図が「列幅均等・横スクロールなし」＝**横だけ**を画面幅に収めることだった（`8b55951`。`88cd3f2` で熱マップをグリッド下部へ移し「全スタッフ一覧の目的を最優先」と確定）。縦は `maxHeight:"70vh"`（:1777）のままなので、31日期間×15名では表高1694pxに対し可視630pxしかなく、期間全体は一望できない。これを「**縦横とも収める**」に拡張し、左上の「日付」ヘッダから右下（最終日の行の右端）までをスクロールなしで表示する。あわせて、現行の全員表示に**今も本番で起きている横方向のはみ出し**（下記。`overflowX:"hidden"` のためスクロールバーも出ず右端の列に到達できない）を先行して修正する。

**現行の横はみ出し（先行コミットで直すバグ）**: `td`/`th` は既定 `box-sizing:content-box` なので、日付セル `SD`（:1192・padding "2px 4px"）で+8px、スタッフ列ヘッダ `VTH`（:1196-1200・padding "2px"）で各列+4pxずつ実幅が式より増えるのに、`colW=fitAll?Math.max(24,Math.floor((centerW-90)/Math.max(1,gridStaff.length))):39`（:1179）はそれを勘定していない。はみ出し量≒`4×スタッフ数+8−端数`。実測（Playwright・`.claude/skills/shifty-e2e-verify/scripts/mount-component.js`・viewport 1400×900・Firebase非接続・2026-09-23・develop `2f758c4`）:

| スタッフ数 | 表の幅 | 可視幅 | 切れている量 |
|---|---|---|---|
| 8名 | 1410px | 1384px | 26px |
| 15名 | 1433px | 1384px | 49px |
| 25名 | 1473px | 1384px | 89px（幅55pxの列1.6本分） |

**ユーザーが下した決定（2026-09-23・決定済み。実装者はこの節をユーザーに問い直さない）**:
- **全表示モードのセルに限り `input` の `fontSize` を16px未満にしてよい**。＝RULES.md:17「`input` の `fontSize` を 16px 未満にしない（iOS Safari でズームが発生する）」の**例外を全表示モードのセルに限って認める**、という解釈をユーザーに明示して採用済み。
- その帰結として**全表示中もセルの編集を維持する**（読み取り専用にしない。`readOnly={!isPremium}` の既存条件は据え置き）。
- 通常表示のフォント・レイアウトは1pxも変えない。
- 代替案（この解釈が違っていて「編集は不要」が真意だった場合のみ）: 全表示のセルを読み取り専用のテキスト描画（`input` をやめ `td` に直書き）に置き換えれば16px規約に一切触れず実装も小さくなる。ユーザーがそう言い直したときだけ切り替える。

**仕様**:
- ラベル「全員表示」→「全表示」（:1670）。コメント :1186 も直す。文字列「全員表示」の出現はこの2箇所のみ（他ファイル・テスト・スキルに出現なし・grep済み）。
- 日付列は**左右両端**に置く（最終スタッフ列の右外側に同内容の日付セルを追加し、ヘッダの「日付」も両端）。幅は現行90pxの半分（45px）を上限に、`fmtDL` の出力（例 "31(土)"＝半角4+全角1・:1150）が選んだフォントで省略なく収まる幅を計算する。
- 縦は全表示時のみ `70vh` 固定をやめ、「グリッド上端〜ビューポート下端」の実際に使える高さを枠にする。行高 `rowH=floor((枠高−thead高)/(日数×2))`、セル fontSize は行高から導出（上限16px）。thead（スタッフ名の縦書き `height:72`・:1198）も全表示時は縮めてよい。
- 行高・列幅・フォントは**レンダーごとの算術計算**（都度計算）。スタッフ数別の事前計算テーブルは作らない。DOM 計測の追加パスも足さない——追加されるのは既知数からの割り算だけなので、表示は今より遅くならない。
- 全表示では sticky 固定を使わない（全体が見えるので不要。通常表示の sticky は維持）。
- 「ヒートマップは下に配置」「通常表示でヒートマップを置いている所まで幅を使う」の2点は**現行の全員表示で既に満たされている**（`hasPanel` が fitAll で false・:1157、`useBreakout=hasPanel||fitAll`・:1162、下部表示 :1892-1901、`width:100vw` ブレイクアウト :1762）。新規実装として書かず**非回帰項目**として扱う。
- 推奨: レイアウト計算（入力: 可視幅・可視高・日数・スタッフ数 → 出力: 日付列幅・colW・行高・fontSize）を純粋関数として app-utils.js に置き、tests/core.test.js に6水準の数値テストを足す（Node で受け入れ条件を機械照合できる）。

**受け入れ条件**:
- [x] **本番解放**: `const fullView=fitAll&&DEV_MODE;` から `&&DEV_MODE` を外した（現在 `const fullView=fitAll;`）
- [x] **本番の横はみ出しの解消**: `boxSizing` が `fullView` に連動するため、本番解放と同時に解消した（解放前は8/15/25名で26/49/89px 切れていた）。無条件に `border-box` にはせず、通常表示の列幅は43pxのまま変えていない
- [x] ラベルを「全表示」に変更（`fitAll?"通常表示":"全表示"`）し、コメントも更新。本番解放に伴い DEV_MODE 分岐は無くなった
- [x] 全表示で、左上の「日付」ヘッダから右下（最終日の行の右端の日付セル）までが可視。**16日/31日 × 8/15/25名の6水準**を実測（`example-fitall-geometry.js` → EXIT=0）。横は全水準で余り0px。縦は `FV_MAX_DAYS=16` の決定により**16日までは1画面に収まり、31日は縦スクロール**になる（その場合だけスタッフ名の行を上端に固定する）
- [x] 日付列が左右両端にあり、幅は45px指定・実レンダー46pxで `fmtDL` 出力（"31(土)" 型）が収まる。右端ヘッダが "日付" であることを6水準で実測
- [x] 下段3表（休みカウント／期間別勤務時間／週間勤務時間）の列位置がグリッドと一致。**1スタッフ目の列開始位置が4表とも46pxで一致**することを6水準で実測。ラベルは45pxに詰まるので休みカウント表だけ短縮見出し（1日休／半日休／休計／連勤）に差し替え、`title` に元の見出しを残した
- [x] 行高・列幅・フォントが都度計算（事前計算テーブルなし）。DOM計測は `gridTop` の1つだけで、その値は出力に依存しないため測り直しのループにならない。`measuredRowH`/`measuredTheadH` は全表示のレイアウト計算に使っていない
- [x] 非回帰: 通常表示の10指標（日付列98px・スタッフ列43px・行ストライド52px・thead82px・表幅743px・font16px・可視幅1368px・表幅1368px・可視高630px・表高914px）が変更前のベースラインと**全項目一致**。既存の回帰テスト `example-shift-edit-tab.js` も allPass
- [x] 全表示でも土日祝の色（`dc`/`baseRb`）・ポジション不足の黄色（`rbS`/`rbE`）・セルコマンドの背景色（`cellBgStyle`）・スタッフ名色（`nameColor`）が通常表示と同一規則で再現される。`fill` 方式（input を透明にして td の色を全面に透かす）で実測（`example-fullview-cell-colors.js` → EXIT=0・`fullShowsTdColor:true`・`fullMode:"fill(input透明)"`・6水準ともコンソールエラー0件）
- [x] **16px例外の記録**: RULES.md の16px規約に例外節を追記し、CLAUDE.md「既知の技術負債」の走査節にも注記した。**走査は変更後も「フォーム部品58件・違反0件」と答える**（`fvFont` が変数で、走査は数値リテラルしか見ないため）＝0件はこの1件を含まない数字である旨を両方に明記済み
- [x] `npm test` **270件パス**／`npx eslint app-*.js` **0 errors 95 warnings**（どちらも変更前と同数）
- [x] E2E は dev 環境の標準テスト店舗（`eb6AfsQv4JAht+cX*xP7fuDa`・新規店舗は作っていない）で実施した。2026-09-23・実ブラウザ 1400×900・`?plan=premium`・8月前半（15日）×スタッフ30名。**全表示で縦横とも余り0px**（可視1299×653 / 表1299×653）、日付列45pxが両端（左右のヘッダーとも「日付」）、スタッフ列39px、セルのfont 14px、**表の中心700pxが画面中心700pxと一致**。グリッド・期間別勤務時間表・週間勤務時間表で田中の列が**3表とも left=96px / 幅39px で一致**。色は平のセルの input が透明で td の土曜 `rgba(25,118,210,0.07)`・日曜 `rgba(229,57,53,0.07)`・ポジション不足 `rgba(250,204,21,0.35)` が透ける（セルコマンド色を持つセルだけ通常表示と同じく不透明）。全表示のままセル編集→保存が通り（`✓ 1件のシフトを保存しました`）、値は元に戻した。**pageerror・console error ともに0件**
- [x] コミットする → `4327e23`（回帰スクリプト2本）・`f59a579`（本番解放と fill 確定・ドキュメント）

**フォント縮小の副作用（実装者への申し送り・取りこぼし禁止）**:
- **iOS/iPadOS で全表示のセルをタップすると自動ズームが起きる**（16px規約の由来はこれ）。全表示は一望が目的で編集は例外的な操作、ズームはフォーカス時のみでピンチで戻せる——が、編集を維持する以上タップ→ズームは実際に起きる。全表示中の編集頻度が高いと分かったときが読み取り専用案（上記代替案）への再着手条件。
- **各期間長での実現水準**（実測: 31日×15名で行ストライド52px/日＝26px/行・thead 82px・input実高20px。行のchrome（tdパディング+inputの枠）を約4〜6px/行まで詰めた場合の試算）:

| 期間 | 枠630px（現行70vh・高さ900px時） | 枠765px（85vh相当・全表示専用に枠を広げた場合） |
|---|---|---|
| 16日（2週間運用） | 17.1px/行 → セル約11px相当・実用下限 | 21.3px/行 → 約15px相当・実用 |
| 31日（1ヶ月運用） | 8.8px/行 → 約3〜5px相当・**時刻は判読不能** | 11.0px/行 → 約5〜7px相当・**判読限界以下** |

ユーザーは「小さくなるのは可」としているが、**1ヶ月期間では時刻の数字は判読できず、用途は「出勤の有無・埋まり具合の俯瞰」に限られる**。この水準を仕様として受け入れ済みの前提で実装し、完了報告に各水準の実測フォントサイズを記載する。

**影響範囲**: app-admin.js（`ShiftEditTab` 本体・`SummaryTable`）。推奨案を採る場合は app-utils.js（レイアウト純粋関数の追加）と tests/core.test.js（数値テスト）。例外の記録で RULES.md・CLAUDE.md。**触らない**: app-core.js（共通スタイル定数 `AI` 等は変更しない。`AI2` は ShiftEditTab ローカル :1190）・app-staff.js・app-main.js・functions/・database.rules.json・index.html。Excel/PDF 出力は `colW` に依存しないため対象外（`colW` の参照は `ShiftEditTab` の描画内に閉じている・grep済み）。

**備考**: 設計意図の出典は `8b55951`（feat: シフト作成に全員表示トグルを追加（列幅均等・横スクロールなし））と `88cd3f2`（refactor: 全員表示では熱マップをグリッド下部に表示）。数値はすべて実ブラウザ実測（Playwright・mount-component.js で `ShiftEditTab` 単体をマウント・viewport 1400×900・develop `2f758c4`・2026-09-23）で、**Firebase / Stripe には1バイトもアクセスしていない**。行番号は同コミット時点のもの。実装は `/shifty-feature` を経由し、本番反映は `/release-to-main` 経由でのみ行う。

---

## 🟡 確定済み期間で、シフト作成タブと提出一覧が同じ人・同じ日に違う勤務時間を出す

**目的**: 期間の確定（写し・2026-08-21 `1c5272b`）は**シフト作成タブの中だけ**で効く。
提出一覧（`SubsTab`）は `resolvePeriodMaster` を通らないので、**終了した期間でも現在の設定で計算する**。
そのため期間が終わったあとに退勤延長・休憩・上限を変えると、**配り終えたシフト表の元になった数字と
提出一覧の数字が食い違う**。どちらも「その人がその日に何時間働いたか」という1つの事実を出している。

**実測**（配信物の `resolvePeriodMaster`／`calcNetWorkMinutes`／`getBreaksFor`／`getOT` をそのまま Node で実行。
今日=2026-09-21・期間は 8/16〜8/31 で終了済み＝`locked=true`。田中の 8/17 は 09:00〜18:00。
**Firebase・Stripe には一切アクセスしていない**）:

| | シフト作成タブ（写し＝凍結） | 提出一覧（現在値） |
|---|---|---|
| **純勤務** | **8:30** | **7:00** |
| 退勤延長 | +30分 | +0分（期間終了後に外した） |
| 休憩 | 12:00〜13:00（60分） | 12:00〜14:00（120分に伸ばした） |
| 週上限 | 28h | 40h（緩めた） |
| 従業員番号 | A-01 | B-99（振り直した） |

週上限が違うので、**同じ期間の同じ人について、シフト作成タブの週バーは赤くなるのに
提出一覧の「週超過」バッジは出ない**（逆向きにもなる）。配布した Excel・PDF は凍結側から出ているため、
**食い違うのは提出一覧のほう**。

**写しはほぼ全ての期間が持っている**——`ShiftEditTab` は期間が生きている間、開くたびに写しを最新化する
（`1c5272b`）。「確定」ボタンを押していなくても、シフトを作った期間は終了と同時に凍結される。
つまりこれは特殊な設定の店舗だけの話ではない。

**ループで直さなかった理由（条件B・仕様判断）**: 2026-08-21 の実装は受け入れ条件に
**「凍結はシフト作成タブの中だけ（`AdminView` の props は据え置き＝他タブは現在値）」**と明記して
その範囲で合意している。一方 2026-09-08 の `keepAttrs` は、提出一覧について
「属性を戻した瞬間に過去の提出が現在の上限で再判定されて赤線が出る」のを**問題として扱い**、
`SubsTab` に `applyKeepAttrs` を個別に当てた。**同じ問いに2つの逆向きの答えが既に入っている**ので、
どちらへ揃えるかはコードからは決められない。

**受け入れ条件**:
- [ ] どちらに揃えるかを決める（**ユーザー判断**）
  - 案A: 提出一覧も `resolvePeriodMaster` を通す。行も詳細モーダルも「その提出の期間」の凍結値で計算する。
    `keepAttrs` の個別適用は `resolvePeriodMaster` の中に吸収されるので**当てる場所が1つに減る**。
    ただし**週・月の集計は期間をまたぐ**（詳細モーダルの週間勤務時間・行の `_windowVio`）ので、
    またいだ先の日をどちらの期間の凍結値で計算するかを決める必要がある
  - 案B: 現状維持。「提出一覧は常に現在の設定で見る画面」と位置づけ、コメントに明記する。
    **その場合 `keepAttrs` の個別適用（2026-09-08）と矛盾する**ので、そちらを外すかも合わせて決める
  - 案C: 提出一覧に「この期間は確定済み（表示は現在の設定）」と出すだけにする（数字は揃えない）
- [ ] 従業員番号（`staffNumbers`）の扱いも合わせて決める。Excel・PDF は凍結側の番号を印字するので、
      **配ったシフト表と画面で番号が違う**状態が同じ根から生まれる
- [ ] 決めた案を実装し、2つのタブが同じ答えを返す回帰テストを追加する
      （`.claude/skills/shifty-e2e-verify/scripts/example-subs-keepattrs.js` と同じ形で書ける）

**影響範囲**: app-admin.js（`SubsTab` の集計・上限判定・詳細モーダル、`AdminView` から渡す props）、
app-utils.js（`resolvePeriodMaster` の呼び出し位置）
**備考**: バグチェック#139（2026-09-21）で検出・**条件B（仕様判断）に該当**。
#138 の申し送り「確定済み期間について、シフト作成タブと提出一覧が同じ属性・退勤延長・従業員番号を
見ているかはまだ誰も測っていない」への答えで、**見ていない**が結論。
同じ回で見つかった「提出一覧の中だけで行とモーダルが食い違う」（`keepAttrs` の当て漏れ）は
**判断が要らなかった**ので `9a36285` で修正済み。両者の根は同じ「期間の属性・設定をどこで解決するか」だが、
**あちらは1つのタブの中の食い違い、こちらはタブ間の食い違い**で直し方が独立するため分けて記載した。

---

## 🟡 変更マーク（緑セル）と提出一覧の「変更あり」バッジが、締切日の編集とセル編集の2経路でまた食い違う

**目的**: 2026-09-20 の `40a88de` は「一覧は変更なしなのにシフト表のセルだけ緑」という本番報告を、
判定を `deadlineGatePassed`（app-utils.js）に一本化して直した。**ところが一本化されたのは判定式だけで、
2つの surface が答えを出す時点が違う**。

| surface | いつ決まるか | どこに持つか |
|---|---|---|
| 提出一覧の「変更あり」バッジ | **読み取り時**（描画のたびに `subHasRealUpdate(sub, period.deadlineDate)` で計算） | 持たない（毎回計算） |
| シフト作成タブの緑セル・Excel・PDF | **書き込み時**（提出した瞬間の判定） | `sub.shifts[日付].changed` に焼いて凍結 |

そのため次の2つで食い違う。どちらも通常のUI操作だけで到達する。

**① 提出後に管理者が締切日を編集する**（期間の編集フォーム `PEF`・app-admin.js:2158 でいつでも変えられる）。
バッジだけが新しい締切で再判定され、焼き込まれた緑セルは追随しない。
**実測**（配信物の `deadlineGatePassed`／`subHasRealUpdate` をそのまま Node で実行。9/12 12:00 に再提出した sub）:

| | 緑セル | 一覧バッジ | |
|---|---|---|---|
| 締切 9/10 のまま | あり | 変更あり | 一致 |
| 締切 9/15 のまま | なし | 変更なし | 一致 |
| **提出後に 9/10→9/15 へ延長** | **あり** | **変更なし** | **★食い違い（＝`40a88de` が直した症状そのものに戻る）** |
| 提出後に 9/15→9/10 へ短縮 | なし | 変更あり | ★食い違い |
| 提出後に締切を削除 | なし | 変更あり | ★食い違い |
| 提出後に締切を追加 | あり | 変更なし | ★食い違い |

**締切の延長は運用上ごく普通の操作**（未提出者がいるので締切を延ばす）なので、この向きが一番踏まれやすい。

**② スタッフが「提出状況一覧」のセル編集で変える**（`SmModal` の `applyCellEdit`・app-staff.js）。
この経路は `updatedAt`/`isUpdated` を進めるのでバッジは出るが、**`changed` を立てる処理を持たない**
（コメントは「changedフラグを消さない」と書いてあるが、新しく立てる側が無い）。
**実測**（締切 9/10・締切後の 9/12 に 9:00-17:00 → 10:00-18:00 へ変更）:

| 入口 | 緑セル | 一覧バッジ | |
|---|---|---|---|
| ホーム画面から再提出 | あり | 変更あり | 一致 |
| **提出状況一覧のセル編集** | **なし** | **変更あり** | **★食い違い** |

管理者は「締切後に誰かが変えた」と分かるのに、**どの日が変わったかがシフト表のどこにも出ない**。

**③ 管理者がトリプルクリックで付けた手動マークが、スタッフの再提出で1つ残らず消える**（2026-09-23・#143 で追加）。
`buildShift`（app-staff.js:195）は再提出のたび **`delete nw.changed` を無条件に実行**し、そのあと
「スタッフ提出値が前回と違う日」にだけ付け直す。`carryAdminShiftFields` が引き継ぐ管理者フィールドの一覧
（`ADMIN_SHIFT_FIELDS`・app-utils.js:244）に **`changed` は入っていない**ので、引き継ぎの対象にもならない。
`toggleChanged`（app-admin.js:1514）はその同じ `shifts[日付].changed` に `true` を書くため、
**管理者の手動マークは「前回のスタッフ提出と同じ値の日」に付いている限り必ず消える**。

**実測**（配信物の `carryAdminShiftFields`／`deadlineGatePassed` を読み込み、`buildShift` の式をそのまま
Node で実行。管理者が 9/10 を手動で緑にし、スタッフが別の日（9/12）だけ直して再提出した場合。
**Firebase へは1バイトも出していない**）:

| 期間の締切 | markChanged | 管理者が付けた緑（再提出前） | 再提出後の緑 | 同じ日の `adjustedStart` |
|---|---|---|---|---|
| なし | true | あり | **消える** | 残る |
| 2026-09-01（締切後） | true | あり | **消える** | 残る |
| 2099-01-01（締切前） | false | あり | **消える** | 残る |

**他の管理者フィールドは全部残るのに、手動マークだけが消える**のが要点で、しかも締切前
（`markChanged=false`）の期間では**付け直される日が1日も無い**ため、1回の再提出でその sub の手動マークが
全滅する。`SmModal` のセル編集（app-staff.js:577）は既存フィールドを保持するので消えない＝
**消えるのはホーム画面からの再提出だけ**という、気づきにくい壊れ方をする。

**素直な修正が効かない**: `ADMIN_SHIFT_FIELDS` に `changed` を足すと、**前回の自動マークまで引き継がれる**
（`carryAdminShiftFields` は手動と自動を区別できない）。これは `delete nw.changed;` のコメント
「過去のchangedは作り直す」と正面から衝突する。つまり③も①②と同じく、**先に案B（手動マークに別の印を持たせる）を
決めない限り直せない**。

**ループで直さなかった理由（条件B・仕様判断）**: 素直な直し方は「緑セルも読み取り時ゲートにする」
（`deadlineGatePassed(period.deadlineDate, subLastActionTime(sub))` を描画時に当てる）だが、
**`changed` は管理者のトリプルクリックによる手動マーク（`toggleChanged`・app-admin.js:1304）と同じフィールドを共有しており、
手動マークには締切の概念が無い**。読み取り時ゲートにすると、締切内の sub に管理者が付けた手動マークまで
一律に消える。手動か自動かを区別する印が `changed:true` には無いので、**直すには先に「その区別を持つか」を決める必要がある**。

**受け入れ条件**:
- [ ] どう揃えるかを決める（**ユーザー判断**）
  - 案A: 現状維持。締切編集後の食い違いを受け入れ、コメントに明記する（`9c1f5d1` で記述済みなのでコード変更なし）
  - 案B: 管理者の手動マークに別の印（例 `changedManual:true`）を持たせ、緑セルを**読み取り時ゲート**へ移す。
    両 surface が締切編集に同時に追随する。**既存データの `changed` は手動／自動を区別できない**ので、
    移行時にどちらとみなすかを決める（自動とみなすと過去の手動マークが締切内で消える）
  - 案C: 締切日を編集したときに、その期間の全 sub の `changed` を再評価して書き直す。
    書き込み量が増えるうえ、手動マークの扱いは案Bと同じ問題が残る
- [ ] ②（セル編集で緑が付かない）を直すかも合わせて決める。**管理者が同じ `SmModal` を期間管理タブから開いて編集する経路がある**
      ので、直す場合は `myName===null`（管理者）を除外しないと、管理者自身の編集が「スタッフが締切後に変えた」印になる
      （`isUpdated` は同じ理由で既に除外済み＝バグチェック#59）
- [ ] ③（手動マークが再提出で消える）も同じ案で塞ぐ。案Bを採るなら `changedManual` を
      `ADMIN_SHIFT_FIELDS` に登録する（登録しないと、印を分けても再提出のたびに消える点は変わらない）。
      案A／案C を採る場合は「手動マークは次のスタッフ再提出まで」という寿命を UI で示すか決める
- [ ] **着手時に `tests/core.test.js` の `NOT_ADMIN_FIELDS` を更新する**（バグチェック#144 で追加）。
      `app-admin.js` がシフト日へ書くキーと `ADMIN_SHIFT_FIELDS` を機械照合するテストがあり、
      `changed` は「一覧に無いのが既知」として理由つきで除外リストに置いてある。
      案Bで `changedManual` を導入する・`changed` を一覧へ登録するのどちらでも**このテストが落ちる**ので、
      除外リストを同じコミットで直すこと（落ちること自体は想定どおりで、直し忘れの検出が目的）
- [ ] 決めた案を実装し、2つの surface が同じ答えを返すユニットテストを追加する

**影響範囲**: app-utils.js（`deadlineGatePassed` の呼び出し位置）、app-staff.js（`buildShift`・`SmModal` の `applyCellEdit`）、
app-admin.js（緑セル描画 `LEGEND_COLORS.changed`・`toggleChanged`・`expXl`・`buildShiftTableHtml` の `chgBg`）
**備考**: バグチェック#138（2026-09-20）で検出・③はバグチェック#143（2026-09-23）で追加・
**条件B（手動マークと同じフィールドを共有するため、区別を持つかの仕様判断が要る）に該当**。
①②③は**同じ根**（変更マークは書き込み時に1経路でだけ決まるのに、バッジは読み取り時に毎回決まる。
そのうえ手動マークが同じフィールドに同居している）なので1タスクにまとめた。
**Firebase・Stripe には一切アクセスしていない**（実測はすべて配信物の関数を Node で実行したもの）。

---

## 🟢 属性を削除すると、その属性でタグ付けした休憩が「誰にも当たらない行」として残り、UIから外せない

**目的**: `deleteType`（app-admin.js の SetTab）は属性を削除するとき `settings.staffTypeLimits` と
`settings.staffAttributes` を掃除するが、**`settings.breakTimes[区分][i].tags` は掃除しない**。
タグは属性IDを**値で**持つので、そのIDは削除後も休憩行に残る。

**コードで確定していること**:

| | 実測・コード上の事実 |
|---|---|
| 休憩の適用判定 | `getBreaksFor`（app-utils.js）は `tags.includes(attr)` で絞る。消えた属性を持つ人は居ないので**その行は誰にも当たらない** |
| 差し替え方式 | タグ付き休憩がその人の属性に一致するときだけ、タグ無し休憩を使わない。死んだタグは一致しないので**タグ無し休憩のほうが当たる** |
| タグの表示 | `attrName`（app-admin.js:3605）は `getAttrOptions` に無いIDを**そのまま返す**＝チップに内部ID（`custom_xxxxxxxx`）が出る |
| タグを外す導線 | トグルボタン（app-admin.js:3677）は `attrOpts`＝**生きている属性しか並べない**。死んだタグのボタンは存在しない |
| 復旧手段 | その休憩行ごと削除して作り直すことだけ |

つまり**一覧には出るのに誰の勤務時間からも引かれない休憩行**ができ、しかも直せない。
気づく手がかりは「見覚えのない英数字のチップ」だけで、エラーも警告も出ない。

**ループで直さなかった理由**: **掃除の仕方で結果が実質的に変わり、ユーザー判断が要る（条件B）**。
`breakTimes:[{12:00-13:00, tags:["custom_x"]}]` の店舗で `custom_x` を削除した場合:

- タグだけを外す → その休憩は**タグ無し＝全員に当たる**ようになる（全スタッフの純勤務が60分減る）
- 休憩行ごと消す → **誰も引かれない**まま（現状と同じ結果だが、行が消えるので納得はできる）
- 現状維持 → 行は残るが誰にも当たらない

「属性を消す」が上のどれを意味するかは運用の話で、コードからは決められない。

**受け入れ条件**:
- [ ] 削除時に `breakTimes` のタグをどう扱うか決める（**ユーザー判断**）
  - 案A: そのIDを `tags` から外す。`tags` が空になったら**キーごと削除する**
        （`undefined` を残すと Firebase の `set()` が同期例外を投げる。app-admin.js:3608 の `toggleTag` と同じ扱い）。
        **その休憩が全員に当たるようになる**点を確認ダイアログで示す
  - 案B: そのIDだけをタグに持つ休憩行は**行ごと削除**する。複数タグのうち1つが消えた場合は案Aと同じく外すだけ
  - 案C: 現状維持。ただし `attrName` のフォールバックを「（削除済みの属性）」にし、
        **死んだタグを外すボタンをチップ側に出す**（掃除はユーザーの操作に委ねる）
- [ ] `delPos`（ポジション削除）と同じく、**何件が道連れになるかを確認ダイアログで提示する**
      （ポジション削除は既にそうしている。バグチェック#74）
- [ ] 決めた案を実装し、ユニットテストを追加する（`getBreaksFor` は純粋関数なので `tests/core.test.js` で足りる）

**影響範囲**: app-admin.js（`deleteType`・休憩時間設定の `attrName`／チップ表示）、app-utils.js（掃除を純粋関数に切り出す場合）
**備考**: バグチェック#137（2026-09-20）で検出・**条件B（仕様判断）に該当**。
**同じ「消えた属性を値で指す」問題は `period.keepAttrs` 側では既に塞がれている**——
`applyKeepAttrs` が `attrIdExists` を通して当てない（#119）。そのときの判断は「当てない＝全員と同じ
フォールバックに乗せる」で、**休憩タグだけがこの決定から取り残されている**。あちらに揃えるなら
「死んだタグは無いものとして扱う」＝案Aに近いが、休憩は**タグ無しが全員に当たる**ため
同じ扱いにすると挙動が逆側へ倒れる（だから自動で揃えられない）。
**Premium の休憩＋属性を両方使っている店舗でしか起きない**ので影響範囲は限定的。

---

## 🟡 企業ログインにサーバー側の試行回数制限が無く、企業パスワード1つで連携全店舗の管理者になれる

**目的**: `companyLogin`（functions/index.js）は企業コードとパスワードを受け取ってカスタムトークンを返す
Callable だが、**失敗回数を数えていない**。同じファイルの `verifyEmailOtp` は「5回失敗でOTPを無効化」を
サーバー側に持っているのに、**企業パスワードの側だけ持っていない**という非対称がある。
クライアント側のロック（`_LA_KEY`／10回・30分・app-core.js）は localStorage なので、
Callable を直接叩けば一切効かない。`companyLogin` は `context.auth` を見ないため、
**未認証の第三者がインターネットから何度でも呼べる**。

**2026-09-16 の変更で払い出しの価値が上がった**（＝いま起票する理由）: `claimCompanyShop`（`2766643`）は
企業メンバーの uid を連携済み店舗の owners に登録する。オーナーになれば `shops/{shopId}/private/adminKey` を
読めるので、**企業パスワードが1つ破られると、連携している全店舗の管理コードが渡る**。
BACKLOG 🟢「企業経由でオーナーになった端末は、連携解除後も管理コードで戻れる」により、
連携を解除しても取り返せない。企業アカウントが無かった頃には無かった被害範囲で、
**既存の弱点（試行制限なし）の重みだけが黙って変わった**形。

**コードで確定していること**:

| | 実測・コード上の事実 |
|---|---|
| 企業コード | 32文字アルファベットの8桁（`genCompanyCode`）＝約 2^40。**総当たりは非現実的** |
| パスワード | **6文字以上・複雑さの要件なし**（`createCompany`／`changeCompanyPassword`） |
| ハッシュ | scrypt・16バイトのソルト・`timingSafeEqual` 比較（**ここは妥当**） |
| サーバー側の試行制限 | **無し**（`companyLogin` に失敗回数を書く経路が1つも無い） |
| 呼び出しに認証が要るか | **不要**（`context.auth` を参照していない） |

したがって現実的な脅威は「**企業コードを知っている人**（元従業員・退職した店長・コードが書かれた紙を見た人）が、
辞書にあるような弱いパスワードを数千回試す」形。コードは店舗間で共有する運用上の識別子であって
秘密として扱える情報ではない。あわせて、**失敗1回ごとに scrypt が回る**ので、
呼び続けるだけで Cloud Functions の CPU を消費させられる（費用側のDoS）。

**ループで直さなかった理由**:
- **何で数えるかの判断が要る（条件B）**。企業コード単位で締めると、**攻撃者が正規の店長を締め出せる**
  （そのためだけに失敗を送ればよい）。IP単位・uid単位・指数バックオフのどれを採るかで副作用が変わる
- 効かせるには Cloud Functions の本番デプロイが要る（条件A）

**受け入れ条件**:
- [ ] 数え方を決める（**ユーザー判断**）
  - 案A: 企業コード単位で N 回失敗したらロック（実装が単純。**締め出しDoSを許す**ので、
    解除手段＝作成者本人の Auth ログインからの解除を同時に用意する）
  - 案B: 失敗のたびに待ち時間を指数的に伸ばす（締め出しにはならないが、分散して呼ばれると効きが薄い）
  - 案C: `companyLogin` に App Check を要求する（下の🟢「App Check の有効化」と同時にやる。
    ボット由来の呼び出しを層で落とす。正規クライアント以外からの呼び出しが全部消える）
- [ ] 決めた案を実装する。試行回数の置き場は `companies/{companyId}/private/` 配下など
      **クライアントからは読み書きできないパス**にする（`companies/{id}/.write:false`・`private` は `.read:false`）
- [ ] パスワードの最低文字数（現在6文字）を上げるかも合わせて決める（**上げる場合、既存のパスワードは
      そのままなので、変更を促す導線が要る**）
- [ ] Cloud Functions を本番へデプロイする

**影響範囲**: functions/index.js（`companyLogin`・必要なら `createCompany`／`changeCompanyPassword` の文字数条件）、
app-admin.js（CompanyTab のエラー表示）
**備考**: バグチェック#131（2026-09-17）で検出・**条件A（本番デプロイ）と条件B（数え方の判断）に該当**。
**実際に破られた形跡を見たわけではない**（Firebase・本番データには一切アクセスしていない）。
コード上「試行を数える経路が存在しない」ことと、破られたときの被害範囲が2026-09-16に広がったことが根拠。

---

## 🟡 Cloud Functions を本番へ反映する（未デプロイの修正が3件たまっている）

> **✅ 2026-09-23 に実測で解決——3件とも既に本番へ反映されていた（このタスクの前提が誤りだった）**
> `firebase deploy --only functions --project ontheshift` を実行したところ、
> **17関数すべてが `Skipped (No changes detected)`** で、本番は1バイトも変わらなかった。
> firebase-tools はソースのハッシュを突き合わせてスキップを決めるので、これは
> **本番に載っているソースが現在の `functions/index.js` と一致している**ことの証明になる。
> `main` と `develop` の `functions/` にも差分は無い（`git diff main develop -- functions/` が空）。
>
> **起票時の判定が誤っていた。** 3件が「未デプロイ」とされた根拠はコミット履歴だけで、
> 本番の状態は一度も測られていない。**完了済みの「Stripe秘密鍵の一部がログに出続けていた」
> タスクが残した教訓（「本番の状態はコミット履歴ではなく本番のログ／監査ログで確かめる」）が、
> ここに届いていなかった**——同じ形の取り違えが2回目。
>
> **残り（🟢 に下げてよい）**: 「企業連携タブから正規の解除が従来どおり通る」は**未検証**。
> 反映自体はいつの間にか済んでいたので、デプロイ直後の確認という形では取れない。
> 次に企業連携の解除を使う機会に見れば足りる（`isValidShopId` が既存店舗のIDを全件通すことは
> ローカルで実測済みで、締め出される想定は無い）。

**目的**: コード側は直っているが、**Cloud Functions は本番へデプロイするまで1バイトも効かない**。
現在3件たまっており、どれも同じ1回のデプロイで出る。

| コミット | 内容 | 効かないと起きること |
|---|---|---|
| `be8143e`（#132） | `linkStoreToCompany`・`unlinkStoreFromCompany` の `shopId` を `isValidShopId` に通す | 企業メンバーが `shopId:"/"` を送ると、`companies/{id}/pub/shops`（連携マップ）と `companies/{id}/grants`（付与台帳）が**丸ごと消える**。「最後のオーナーは外さない」判定（#65）も発火しない。**台帳が消えると企業経由で与えたオーナー権限を後から回収できない** |
| `0727598`（#131） | `purgeInactiveShops`・`purgeOldPeriods` に `isDemoShop` のガード | 本番のデモ店舗（`demo-toriMatsu-v1`・広告の着地先 `#/demo`）が1年未更新の自動アーカイブで消える |
| `aa17c88`（#133） | `createCompany` の `shopIds`（複数形）を `isValidShopId` に通す | **到達可能な穴は無い**（多重防御）。`shopId:"/"` は `companies/{id}/pub/shops` を `true` で上書きしうる形だが、通過には `shops/owners` が呼び出し元の uid を持つ必要があり、`shops/$shopId` の任意の子は `database.rules.json` に `.write` が無いのでクライアントからは作れない |

**受け入れ条件**:
- [x] `cd functions && firebase deploy --only functions --project ontheshift`
      → 2026-09-23 実行。**17関数すべて `Skipped (No changes detected)`＝反映済みだった**
- [ ] 反映後、企業連携タブから正規の解除が従来どおり通ることを確認する（`isValidShopId` は
      `genSecureId` 形式10万件・`shop_1780453329813`・`eb6AfsQv4JAht+cX*xP7fuDa` を全件通すことを
      ローカルで実測済みなので、既存店舗が締め出される想定は無い）→ **未検証**
- [x] `purgeInactiveShops` の関数更新が成功したことを確認する
      → 上の一覧に `purgeInactiveShops`・`purgeOldPeriods` とも載っており、現行ソースと一致している

**影響範囲**: functions/index.js（デプロイのみ・コード変更は済んでいる）
**備考**: バグチェック#131（2026-09-17）・#132（2026-09-17）・#133（2026-09-18）で検出・**条件A（本番デプロイ）に該当**。
`be8143e` の追加で優先度を 🟢 → 🟡 に上げた（デモの保護は期限が遠いが、連携マップの消失は
呼ばれた瞬間に起きる）。**期限もある**: デモ店舗の `lastActivity` が投入時刻（2026-08-11 ごろ）の
ままなら **2027-08-12** にアーカイブ対象へ変わる。

---

## 🟡 管理者が退勤を出勤より前の時刻で入力すると、シフト表には正しく見えるのに勤務時間・ヒートマップ・上限判定が黙って0になる

**目的**: 深夜まで営業する店舗で、管理者が22:00〜翌2:00のシフトを**退勤セルに「2」**と入力すると、
セルにもExcelにも「22 / 2」と普通の深夜シフトとして印字されるのに、**そこから計算される数字がすべて0になる**。
警告もエラー表示も出ない。正しい入力は24時超え表記の「26」で、候補時間の選択肢（`gto()` は 0:00〜27:00）も
その表記で作られているが、**シフト作成タブのセルは自由入力**で、そのことを伝える導線が無い。

**原因**（コード上で確定）: `effShiftRangeMin`（app-utils.js）は最後に `return e>s?{startMin:s,endMin:e}:null;`
と書かれており、**退勤 ≤ 出勤 の日は範囲を null にする**。`calcNetWorkMinutes`・`shiftBandInfo`・`getBreaksFor` は
いずれも null を「勤務時間なし」として扱うため、その日は集計にも時間帯別出勤人数にも一切現れない。
防御的なコードとして正しいが、**捨てたことを管理者に伝える経路がどこにも無い**。

**実測**（配信物の関数をそのまま Node で実行。`app-admin.js` の `parseTime` は定義をソースから切り出して実行。
候補時間 18:00〜26:00・休憩なし。**Firebase・Stripe には一切アクセスしていない**）:

`parseTime("2")` → `"02:00"` ／ `parseTime("26")` → `"26:00"`（どちらも受理される。0〜30時を許す）

| 管理者が入力した退勤 | 実効レンジ | 純勤務 | 出勤数 | ディナー帯 | 「両側入力」と判定 |
|---|---|---|---|---|---|
| 22:00 → **02:00** | **null** | **0:00** | **0** | **false** | **true** |
| 22:00 → 26:00 | あり | 4:00 | 0.5 | true | true |
| 18:00 → **01:00** | **null** | **0:00** | **0** | **false** | **true** |
| 18:00 → 25:00 | あり | 7:00 | 0.5 | true | true |

**Excelは正しく見える**: `expXl`（app-admin.js）は保存された時刻をそのまま
`fmtT(startT)` / `fmtT(endT)` で印字するだけで範囲を検証しないため、セルには「22」「2」と出る。
**つまり配るシフト表は正しく、集計だけが間違っている**という一番気づきにくい壊れ方をする。

**同じ条件を他の入力欄はすべて弾いている**のに、管理者の編集経路だけが素通りする:

| 入力欄 | 検証 |
|---|---|
| 候補時間（全体・曜日別・日付別／`addG`・`addW`・`addD`） | `start>=end` で「▲ 退勤は出勤より後にしてください」 |
| 休憩時間（`CandTab`） | `brkStart>=brkEnd` で「▲ 終了は開始より後にしてください」 |
| **シフト作成タブのセル（`applyEditToSubs`）** | **なし** |
| **提出一覧の詳細モーダル（`saveAdj`）** | **なし** |

**副次的な影響（確度は低い）**: 店舗間シフト重複（`dupErrors`）は他店舗のシフトを
`effShiftRangeMin` に通し `if(!orng)continue;` で飛ばすため、ヘルプ先の店舗がこの形で入力していると
**二重予約が検出されない**。さらに `hasBoth`（app-admin.js:424）は `effShiftStart`/`effShiftEnd` が
どちらも非空なら true を返す＝この壊れたシフトを「完全なデータ」とみなすので、同じ人・同じ日に
片側セルのsubが別にあると**そちらを押しのけて**採用され、本来動いていた補完つきの重複判定まで止まる。
ただしこれは同一人物・同一日に複数subがある状態（#81 の根）が前提なので発生頻度は低い。

**ループで直さなかった理由**: どう直すかで結果が実質的に変わり、ユーザー判断が要る（条件B）。
加えて修正箇所がセル編集フローで、ここは #51・#56・#58 の回帰がすべて起きた場所のため
実機E2Eが前提になる（条件D）。

**受け入れ条件**:
- [ ] どう扱うかを決める（**ユーザー判断**）
  - 案A: 保存前に弾いて候補時間・休憩と同じトーストを出す（「深夜は 25:00・26:00 のように入力します」を添える）。
    **ただしセルは1つずつ確定するので、出勤を直す前に退勤を直すと途中経過が弾かれる**。
    「両方揃ってから判定する」等の逃げ道を併せて決める必要がある
  - 案B: 退勤 < 出勤 なら24時間足して解釈する（「2」→ 26:00）。入力の手間は最小になるが、
    単なる打ち間違いを**4時間の深夜シフトとして黙って確定させる**向きに倒れる
  - 案C: 保存はそのまま通し、`dupErrors` と同じようにセルを色付けしてエラーパネルに出す（表示のみ・データは変えない）
- [ ] 決めた案を `applyEditToSubs`（シフト作成タブ）と `saveAdj`（提出一覧の詳細モーダル）の**両方**に入れる
      （片方だけだと同じ状態をもう一方の入口から作れる）
- [ ] 純粋関数に切り出せる部分にユニットテストを追加し、実機E2Eでセル編集の非回帰を確認する

**影響範囲**: app-admin.js（`applyEditToSubs` / `saveAdj`、案Cなら `ShiftEditTab` のエラーパネル）、
app-utils.js（判定を純粋関数に切り出す場合）
**備考**: バグチェック#129（2026-09-16）で検出・**条件B（どう直すかの仕様判断）と条件D（セル編集フローの実機E2E）に該当**。
**深夜営業の店舗ほど踏みやすい**——鷄えん東通り店は 23:00〜25:00 の「締」シフトを運用しており、
24時超え表記が日常的に必要な店舗が現に存在する。

---

## 🟡 スタッフが「休み」にする2つの入口で、「締」の追加出勤の扱いが正反対

**目的**: 同じスタッフが同じ日を「休み」にする操作に**入口が2つ**あり、`period` でも `settings` でもなく
**その日の「締」の追加出勤（`extraStart`/`extraEnd`）が残るか消えるか**が入口によって食い違う。

| 入口 | status | 追加出勤(締) | 締フラグ | 純勤務 |
|---|---|---|---|---|
| ホーム画面で「休み」にして再提出（`carryAdminShiftFields`・app-utils.js） | **work** | 23:00〜25:00（残る） | true | **120分** |
| 提出状況一覧のセル編集で「休み」（`SmModal` の `applyCellEdit`・app-staff.js） | **holiday** | **（消える）** | false | **0分** |

**実測**（配信物の関数をそのまま Node で実行。元の日 = `{status:"work",start:"13:00",end:"17:00",
adjustedStartFixed:true,extraStart:"23:00",extraEnd:"25:00"}`）。上表がその出力そのもの。

**どちらもコメントで理由つきに「否定」している**のが厄介なところ:
- app-utils.js（2026-08-25・`a082d5d`）: 「『締』の追加出勤（extraStart/extraEnd と adjustedXxxFixed）も**残す**
  ——こちらは 2026-07-12 に決めた『店舗が固定で入れる深夜の追加出勤』で、スタッフの休み希望とは
  別軸の出勤（フラグがある日は status="work" に戻す）という明示的な不変条件を持つため」
- app-staff.js（2026-08-06・`3914d615`・バグチェック#57）: 「追加出勤フラグを残したまま status を holiday に
  するのは、`carryAdminShiftFields` が宣言している『フラグがある日は status="work"』の不変条件にも反する」
  → だから**消す**

**後者が先に書かれ、前者の決定（本BACKLOGの完了済み「仕様判断まとめの10件」の
『再提出で「休み」にしたときの管理者調整値 → 案A（メモ・休み希望・「締」は残す）』）が
届いていない。** その決定は明示的に「**再提出**で」と書かれており、セル編集の入口は
スコープ外だった＝取りこぼしであって、意図的な使い分けではない可能性が高い。

**そのままループで揃えられない理由**: 前者に合わせると、スタッフがセル編集で「休み」を選んだのに
`carryAdminShiftFields` が `status="work"` へ戻すため、**セルが出勤のまま再描画される**
（「編集が効かなかった」ように見える）。UXとして許容するかの判断が要る。

**受け入れ条件**:
- [ ] どちらに揃えるかを決める（**ユーザー判断**）
  - 案A: セル編集も `carryAdminShiftFields` を通す（締は残り、その日は出勤のまま）。
    「この日は店舗の固定出勤があるため休みにできません」等の説明を出す
  - 案B: 現状維持とし、**入口によって違うことをコメントに明記**する（意図的な使い分けだと決める）
  - 案C: 締を残したままその日を休みにできるようにする（＝「フラグがある日は status="work"」の
    不変条件そのものを見直す。`calcNetWorkMinutes`・`shiftBandInfo` の早期returnまで波及する）
- [ ] 決めた案を実装し、2つの入口が同じ結果を返すユニットテストを追加する

**影響範囲**: app-staff.js（`SmModal` の `applyCellEdit`）、app-utils.js（`carryAdminShiftFields`・案Cなら `HOLIDAY_DROP_SHIFT_FIELDS`）
**備考**: バグチェック#118（2026-09-10）で検出・**条件B（仕様判断）に該当**。
**対象店舗は「締」が有効な店舗のみ**（`isFixedShiftEligibleShop`＝鷄えん東通り店）なので影響範囲は限定的だが、
**スタッフの操作で管理者が入れた値が消える**方向の食い違いなので放置しにくい。

---

## 🟡 完全削除したスタッフの `period.keepAttrs` が残り、同名の新人が前任者の属性を継承する

**目的**: 属性の期間指定（`period.keepAttrs`・2026-09-08 実装）は**書く・改名で移す・読む**の3つはあるが、
**消す経路がどこにも無い**（`grep keepAttrs` の結果が `confirmAttr` の書き込み・`renameStaffInPeriods` の
移し替え・`applyKeepAttrs`/`keepAttrsOf` の読みだけ）。スタッフを「どの期間にも残さない」で完全削除しても、
`settingsWithoutStaff`（app-admin.js）は `settings` の7マップしか掃除せず **periods には触らない**。

**実測**（配信物の `resolvePeriodMaster` をそのまま Node で実行。9月前半＝進行中の期間に
`keepAttrs:{"田中":"summer"}`／`summer` は週上限40h・`parttime` は週28h）:

| | 田中に効く属性 | 週上限 |
|---|---|---|
| ① 変更直後（前任者が在籍中） | summer | 40h |
| ② 前任者を完全削除した直後 | summer | 40h |
| ③ **同名の新人を追加しバイトに設定** | **summer** | **40h**（設定したのは28h） |

新人の週上限が 28h ではなく 40h として判定されるため、**シフト作成タブ・Excel・PDF が出すはずの
上限超過エラーが出ない**。

これはバグチェック#79 の①（「同名で追加し直すと前任者の社員番号・属性・ポジションをそのまま継承する」）と
**同じ形**で、そのときは `settingsWithoutStaff` を入れて閉じた。**2026-09-08 に足した `keepAttrs` が
その掃除の対象に入っていない**＝新しいフィールドが古い決定を自動的には継がない、という形。

**そのままループで消せない理由**: 完全削除した人でも、**終了した期間の写し（`snapshot.staffList`）には
名前が残る**ため、その期間のシフト表には引き続き列が出る。`keepAttrs` はその列の属性を写しより
優先して補正する記録なので、消すと**過去のシフト表の表示が変わりうる**。「同名継承を止める」ことと
「過去の記録を保つ」ことのどちらを取るかの判断が要る。

**受け入れ条件**:
- [ ] 完全削除時に `keepAttrs` をどうするかを決める（**ユーザー判断**）
  - 案A: `settingsWithoutStaff` と同じタイミングで最新3期間の `keepAttrs` からも落とす（#79 と同じ扱いに揃える）
  - 案B: 写しにその人が居ない期間からだけ落とす（過去の表示を変えずに同名継承だけ止める。判定が増える）
  - 案C: 現状維持。`keepAttrs` は履歴なので消さないとコメントに明記する（同名再登録時の継承は受け入れる）
- [ ] `undoDelete`（削除の取り消し）の扱いも合わせて決める。`keepStaff` は全て外すのに `keepAttrs` は残る
- [ ] 決めた案を実装し、ユニットテストを追加する

**影響範囲**: app-admin.js（`settingsWithoutStaff` / `confirmDelete` / `undoDelete`）、app-utils.js（掃除を純粋関数に切り出す場合）
**備考**: バグチェック#118（2026-09-10）で検出・**条件B（過去の記録を変えてよいかの判断）に該当**。
`keepAttrs` 自体は 2026-09-08（`0d5aba8`）実装で**まだ本番の版数に載っていない**（配信版数 `20260908-0d5aba8` は
そのコミット時点）ため、実データに `keepAttrs` を持つ店舗はまだ少ないはず。**早く決めるほど移行が要らない。**

---

## 🟢 非表示にしたスタッフを「未提出」に数えるか（提出状況一覧）

**目的**: スタッフ非表示（2026-09-06 実装）は効果範囲を「シフト作成タブ・Excel・PDF から名前が出なくなるだけ」と
ポップアップで明示しており、**提出状況一覧（`SmModal`）の未提出リストには従来どおり出る**。設計どおりの挙動だが、
休職などで非表示にした人が締切まで「未提出」に並び続けるため、**管理者が「全員提出済み」を読み取れない**。
`SmModal` はスタッフ側からも開けるので、休職者の名前が未提出として全員に見え続ける点も併せて判断がいる。

**受け入れ条件**:
- [ ] 非表示スタッフを未提出に数えるかを決める（**ユーザー判断**）
  - 案A: 現状維持（数える）。非表示はシフト表の見た目だけの機能という位置づけを保つ。コード変更なし
  - 案B: その期間で非表示なら未提出から外す。`SmModal` は対象期間を `periods.find(p=>p.id===apid)` で
    既に解決しているので、`visibleStaffList(staffList, settings, period)` を1回通すだけで
    呼び出し元3経路すべてに効く（**完了済みタスク「期限付き削除で名前を残した人を『未提出』に数える」と同じ形**）。
    `SmModal` に `settings` を渡す必要がある（現在は `staffAliases` だけを受けている）
- [ ] 決めた案を実装する（案Aならポップアップの説明文に「提出状況一覧には残ります」を1行足すだけでよい）

**影響範囲**: app-staff.js（`SmModal`）、呼び出し元3箇所（app-staff.js の StaffView 2箇所／app-admin.js の PeriodsTab 1箇所）の props
**備考**: バグチェック#113（2026-09-07）で検出・**条件B（仕様判断）に該当**。
**先例がある**: 2026-09-05（#110・案A）に「期限付き削除で名前を残した人」について同じ問いを立て、
**数える**と決めている（完了済みタスク参照）。ただしあちらは「その期間にシフト表の列が残る人」で、
今回は**列が消えている人**なので、同じ答えになるとは限らない。

---

## 🟡 プラン変更の予約（ダウングレード）を、ユーザーが自分で取り消せない

> **✅ 2026-09-05 実装済み（案A）／残るは Stripe 実データでの確認のみ**
> ユーザー判断は **案A**。Cloud Function `cancelPlanChange` を新設し、有効な契約に紐づく
> Subscription Schedule を `stripe.subscriptionSchedules.release(scheduleId)` で解放する。
> `changePlan` が `end_behavior:"release"` で作っているので、release すれば**現行priceのまま
> 通常の契約へ戻る**（契約は解約されない）。`changePlan` の 400 分岐（`currentPlan===plan` を弾く）
> には触っていない。Stripe 側にスケジュールが残っていなかった場合（既に released/completed 等）も
> **DB の `scheduledPlan`・`scheduledPlanDate` は必ず消す**——予約バナーだけが残って取り消せない、
> という状態を作らないため。あわせてマイページの予約バナーに「予約を取り消す」ボタンを追加した。
>
> **実測**（375px・実ブラウザ・`MyPageTab` だけをマウントし `fetch` をスパイに差し替え＝
> **Stripe にも Firebase にも1バイトも出していない**。`plan="premium"`・`scheduledPlan="pro"`）:
>
> | | 予約あり | 予約なし（対照） |
> |---|---|---|
> | 「プラン変更の予約中」バナー | 出る | 出ない |
> | 「予約を取り消す」ボタン | **1個** | 0個 |
> | 「プランを変更」セクション | **出ない**（＝起票時の問題そのもの） | 出る（「Proプランに変更」） |
>
> ボタンを押すと `cancelPlanChange` へ `{"shopId":"shop_test"}` を POST し、
> 「✓ プラン変更の予約を取り消しました」が出る。`pageerror`・`console.error` ともに 0件。

**目的**: Premium → Pro のダウングレードは `changePlan` が Subscription Schedule を作り、
期間終了時に切り替える「予約」になる。マイページには青い「プラン変更の予約中」バナー
（[app-admin.js](app-admin.js) の `MyPageTab`）が出るが、**その予約を取り消す導線がアプリ内にどこにも無い**。

**原因**（コード上で確定・実測済み）: プラン変更ボタンの選択肢は
`changeOptions=["pro","premium"].filter(p=>p!==plan&&p!==bs.scheduledPlan)`（[app-admin.js:4509](app-admin.js)）
で作られ、セクション全体が `changeOptions.length>0` でしか描画されない。
**有料プランは2つしかない**ので、予約が入っている状態では現在プランと予約プランで
2つとも除外され、必ず空になる。実測（同じ式をそのまま評価）:

| 状態 | changeOptions | 「プランを変更」セクション |
|---|---|---|
| Premium利用中・Pro への降格を予約済み | `[]` | **表示されない** |
| Pro利用中・Premium を予約済み | `[]` | **表示されない** |
| 予約なし・Premium利用中（対照） | `["pro"]` | 表示される |
| 予約なし・Pro利用中（対照） | `["premium"]` | 表示される |

**逃げ道も無い**: 解約バナーは「解約を取り消す場合は下の『請求管理』から」と
案内しているが、**変更予約バナーには同等の案内が無く**、しかも 2026-08-11 の実測で
**カスタマーポータルには「プラン変更」のUIが存在しない**ことが分かっている
（表示されるのはキャンセル・決済手段・請求先情報のみ。下の🔴「二重課金の根治」の備考を参照）。
つまりユーザーは予約を入れた瞬間に**降格を確定させられ、切替後に再アップグレードして
差額を払う以外に戻す手段が無い**。

**受け入れ条件**:
- [x] 予約を取り消せるようにするかを決める（**ユーザー判断**）→ **案A**（2026-09-05）
  - 案A: Cloud Function を1本足す（`stripe.subscriptionSchedules.release(scheduleId)`）。
    `end_behavior:"release"` で作っているので、release すれば現行priceのまま通常契約に戻る。
    バナー内に「予約を取り消す」ボタンを置く
  - 案B: `changeOptions` から `p!==bs.scheduledPlan` の除外を外し、「現在のプランへ戻す」を
    選べるようにする（＝`changePlan(現在のplan)` を予約解除として扱えるようサーバー側も対応する）。
    現状の `changePlan` は `currentPlan===plan` を400で弾く（functions/index.js の `changePlan`）ので、その分岐も変える
  - 案C: 現状維持。バナーに「取り消しはお問い合わせください」と明記するだけ（最小）
- [x] 決めた案を実装する（`cancelPlanChange` ＋ バナーの「予約を取り消す」ボタン）。
      **予約解除後に `accounts/{shopId}` の `scheduledPlan`・`scheduledPlanDate` が消えることは
      コード上そう書いてあるだけで、実データでは未確認**（下の条件と同じ購入テストで閉じる）
- [ ] Stripe の実購入（またはテスト環境）で「降格予約 → 取り消し → 期間終了をまたいでも降格しない」を通す

**2026-09-25 追記（バグチェック#146）— 実装したこの取り消しが「失敗しても成功と表示される」**:
`cancelPlanChange`（functions/index.js:358-373）は `subscriptionSchedules.release` を try/catch で包み、
**どんな例外も「既に released/completed だった」とみなす**。コメントもその前提で書かれている。
しかし**一時的な失敗（レート制限・接続エラー・Stripeの5xx）は同じ catch に落ちる**ので区別できない。
そのあと :373 が `scheduledPlan`・`scheduledPlanDate` を**無条件に消し**、`200 {ok:true, released:false}` を返す。

`released:false` という**正しい情報はレスポンスに入っている**が、**クライアントが読んでいない**——
app-admin.js:5160-5161 は `r.ok` だけを見て「✓ プラン変更の予約を取り消しました」を出す。
その結果:

| | 起きること |
|---|---|
| ユーザーが見るもの | 「✓ プラン変更の予約を取り消しました」＋予約バナーが消える |
| Stripe 側 | **スケジュールは生きたまま＝期間終了時に降格が実行される** |
| やり直せるか | **できない**。「予約を取り消す」ボタンは `scheduledPlan` があるときだけ描画され、それは消されている |
| 自然に直るか | **直らない**。`subscription_schedule.*` は購読イベントに入っていない（functions/index.js:308-310 のコメントが明記） |

**無条件に消すこと自体は 2026-09-05 の意図的な決定**（このタスクの上の注記「Stripe 側にスケジュールが
残っていなかった場合も DB の予約表示は必ず消す——予約バナーだけが残って取り消せない、という状態を
作らないため」）。**その決定が想定していたのは「既に消えていた」ケースだけ**で、
一時的な失敗を同じ扱いにする点までは決めていない。

**受け入れ条件（追加）**:
- [ ] 「既に released/completed」と「一時的な失敗」を切り分ける（`e.code` / `e.type` で判定する）。
      前者は従来どおり予約表示を消す。後者をどうするかは**ユーザー判断**——
      エラーを返して予約表示を残す（＝取り消しをやり直せる）か、消したうえで警告を出すか
- [ ] 少なくとも**クライアントが `released` を読む**ようにする（これはクライアントだけの変更で、
      サーバーが既に返している値を捨てているだけなので、上の切り分けと独立に入れられる）
- [ ] 上の実購入テストに「release が失敗したときに成功と表示されない」を1項目として足す

**影響範囲**: functions/index.js（`changePlan` または新規の予約解除関数、`cancelPlanChange` の catch）、app-admin.js（MyPageTab の予約バナー・`changeOptions`・`cancelPlanChange` のレスポンス処理）
**備考**: バグチェック#108（2026-09-04）で検出・**条件B（取り消しを許すかの仕様判断）と条件A（Stripe実データでの確認）に該当**。
下の🔴「二重課金の根治」に残っている「実購入での全遷移検証」と**同じ購入テストの中で一緒に確認できる**ので、
着手するならまとめてやるのが効率的。なお**降格そのものは正しく動く**（予約・切替・解約の各Webhookは実装済み）。
壊れているのは「入れた予約から降りられない」という一方通行性だけ。

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

1. ~~**Excel・PDF のファイルを実際に開いての列確認が未実施**~~ → **Excel は 2026-09-05（#110）に完了。残りは PDF のみ**。
2. **「確定済み（選ばなくても残ります）」ラベルの表示が未確認**。写し(`snapshot`)を持つ期間でのみ出る分岐で、ロジックはユニットテストで担保しているが実ブラウザで踏んでいない。

> **✅ 2026-09-05（#110）— Excel の実物確認は完了**
> `shifty-e2e-verify` 1.6節のハーネスに ExcelJS を載せ、`URL.createObjectURL` と
> `HTMLAnchorElement.prototype.click` を差し替えて**生成された .xlsx のバイト列を捕まえ**、
> ExcelJS で読み直した（Firebase へは1バイトも出していない）。
>
> | ケース | ヘッダー行（実測） |
> |---|---|
> | 期間管理タブ／「**残す**」 | 田中 ／ **佐藤** ／ (空白列) ／ 鈴木 ／ 山田 |
> | 期間管理タブ／「**残さない**」 | 田中 ／ (空白列) ／ 鈴木 ／ **佐藤** ／ 山田 |
> | シフト作成タブ（`resolver` あり）／「残す」 | 田中 ／ **佐藤** ／ (空白列) ／ 鈴木 ／ 山田 |
>
> 「残す」なら**元の位置**（末尾送りではない）、「残さない」でも提出があれば**末尾に未登録名として**出る。
> 2つの入口が同じ列構成を出すこと、空白列が空ヘッダーとして描かれることも確認。
> `pageerror`・`console.error` 0件。
>
> **PDF が残った理由**: jsPDF が HTML を html2canvas で**ラスタ画像に変換してから**埋め込むため、
> 出力に読み取れる文字が残らない。列を機械的に確認するには `buildShiftTableHtml` の
> 戻り値を捕まえる必要があるが、これは `ShiftEditTab` 内のクロージャで外から呼べない。
> **目視での確認が要る**（＝条件Aのまま）。

**受け入れ条件**:
- [x] 1-Excel: 「残す」を選んで削除したあとの Excel を実際に開き、**その人の列が元の位置に**出ること／「残さない」なら**提出があれば末尾に未登録名として出る**ことを確認する → **2026-09-05 完了（上表）**
- [ ] 1-PDF: 同じ確認を PDF で行う（**目視。上記のとおり機械的には読めない**）
- [ ] 2: 写しを持つ期間でポップアップを開き、ラベルが出ることを確認する（`shifty-e2e-verify` 1.6節のハーネスで `snapshot` 入りの期間を渡せば足りる）
- [x] 3: **削除ポップアップの既定の選択について案A〜Cのいずれかを選ぶ（#101・ユーザー判断）** → **案B**。`del()` の既定を `defaultKeepCount(delPeriodChoices,todayStr)` に変更し、375px の実ブラウザで「削除を押しただけの状態」では最新期間に `keepStaff` が入らないことを実測済み（`19f7fc5`）

**影響範囲**: なし（確認のみ。不一致が見つかった場合に限り app-admin.js の `expXl`／`buildPdfCols` 周辺）
**備考**: バグチェック#93 と同じ日にユーザー依頼で実装した機能の申し送り・**1は条件A（ファイルを開いて目視するのはユーザーの操作）に該当**。2はループでも閉じられるので次回の実装ループで拾ってよい。**機能自体は未完成ではない**——実ブラウザで「ポップアップが最新3期間のみを出す」「選んだ期間にだけ `keepStaff` が入る」「グリッドの列が元の位置のまま残る」「残さないと指定した期間では消える」「一覧に残る・自動で消える・範囲変更・削除の取り消し」をすべて確認済み（pageerror・console error 0件）。なお `keepStaff` は `periods` ノードに載るため、上の🟡「期間の確定（写し）が `periods` ノードを肥大化させる」と同じノードを太らせるが、**1人あたり数十バイト**なので写し（1期間57KB）に比べれば無視できる。
---

## 🟡 別名で提出した人が別端末から再提出すると、同じ期間に2つのsubができてExcelが古い方を出す

**目的**: `sub.staffName` には**別名がそのまま入っている**（`registerAlias`（app-admin.js）は `staffAliases` に登録するだけで `staffName` を書き換えない）。一方スタッフ画面の既存sub検索（[app-staff.js](app-staff.js) の `existSub`）は**登録名の完全一致だけ**で探す。そのため「別名で提出済みの人が、別端末（＝Cookieなし）から名前を打ち直して再提出する」と、`resolveAlias` が登録名を返す → 既存subが見つからない → **同一人物・同一期間に2つ目のsubが作られる**。

**実測（配信物の述語をNodeで実行して確認・2026-08-18 バグチェック#81）**:
- 入力「たなか」→ `resolveAlias` → `staffName="田中"` → `subs.find(s=>s.staffName==="田中"&&…)` は**見つからない**（別名ぶんのsub Aは `staffName:"たなか"` のため）
- 結果: sub A（たなか・古い）と sub B（田中・最新）が併存し、**提出一覧には「田中」の行が2つ並ぶ**（提出一覧が `resolveAlias` 済みの名前で表示するため、どちらも「田中」に見える）
- **Excel（`expXl`・app-admin.js）は `ss.find(...)` ＝最初の1件しか採らない**。実測では**古い方（A・退勤17:00）が出力され、本人が最後に出した B（退勤18:00）は黙って落ちた**
- **管理者が A に入れた `adjustedStart` も引き継がれない**（`buildShift` の `carryAdminShiftFields` は `existSub` からしか引き継がないため、A に取り残される）
- **さらに、画面とExcelが別のsubを見る**。シフト作成グリッド（`_getSubForPeriod`・app-admin.js）は**完全一致を先に引いてから別名にフォールバック**するのに対し、`expXl` の当時の `find` は**完全一致を優先せず配列順で最初に条件に合った要素**を返す。`ss` は `subs.filter(...)` で並べ替えていない＝Firebaseのキー順（提出時刻順とは限らない）なので、別名subが先に並ぶと **グリッドは B（18:00）を表示し、Excelは A（17:00）を出力する**（実測で確認）。**管理者は画面で確認した内容と違うExcelを店舗に配ることになる。**

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

> **✅ 2026-09-06 追加で解決（`c9a9d14`・バグチェック#112）— 6本目の経路（Cookieからの復元）も通した**
> #105・#106 が通した5経路はいずれも「解決規則へ**正しい名前を渡す側**」で、今回は
> **規則へ入る手前で名前が別名のままだった**箇所。スタッフ画面の `name` は入力・サジェスト確定
> （入力欄の onBlur・サジェスト候補クリック）で `resolveAlias` 済みだが、**Cookieから復元する経路は
> それを通らない**。`buildShift` 直前のコメントは「name は入力・サジェスト確定で resolveAlias 済み＝常に登録名」と
> **遠くの2箇所に依存して**不変条件を主張しており、Cookie経路の存在で黙って偽になっていた。
>
> `staffAliases` は**登録名をキー**に持つ（`{"田中":["たなか"]}`）ため、別名を起点にすると
> `staffAliases["たなか"]` が `undefined` になり、`resolveSubByAlias` は完全一致に失敗した後の
> **フォールバック先を1つも持てない**。つまり**一本化は入口の正規化とセットでなければ効かない**。
>
> 実測（配信物の関数を Node で実行・別名「たなか」で提出→管理者が別名登録→別端末からの再提出で
> `staffName` が「田中」へ正規化された状態で、端末A＝Cookie「たなか」を開く）:
>
> | | 修正前 | 修正後 |
> |---|---|---|
> | 提出済み画面 | **復元しない（未提出の空フォーム）** | 復元する |
> | 再提出の `staffName` | **"たなか"（新規sub）** | "田中"（既存subを更新） |
> | 管理者の調整値・メモ | **消える** | 残る |
> | 期間内のsub数 | **2** | 1 |
>
> **被害はスタッフ側で終わらない**——読み手（グリッド・週集計・提出一覧・Excel）は「田中」のsubを引くため、
> **この経路で作られた2つ目のsubは管理者の画面に一度も出ない**（#106 と同じ被害の形）。
> 修正は :67（Cookie名を `resolveAlias` で寄せ、探索を `resolveSubByAlias` に統一）と
> `buildShift` 内（`staffName` を `resolveAlias` に通し、**上記の不変条件を構成で保証**する）。
> 実ブラウザ4ケースで確認済み・回帰スクリプトを
> `.claude/skills/shifty-e2e-verify/scripts/example-staff-cookie-alias.js` に保全（`8a96acb`）。
> **これで呼び出しは6経路**。**根（別名で出した提出の `staffName` が別名のまま残ること自体）は依然このタスクに残る**
> ——ただし入口が構成で保証されたので、**7つ目の経路が増えても同じ形では再発しない**。

**2026-08-19 追記（バグチェック#84）— この重複が引き起こす3つ目の症状を特定し、表示側だけ先に閉じた**: subが2つできた状態では、**提出一覧の詳細モーダルの月計が同じ日を二重計上していた**（`moTot` が `wSS` のsubを走査して足しており、日付での重複排除が無かった）。実測で**実勤務3日(1440分)に対し月計だけが 48:00＝ちょうど2.00倍**、同じモーダルの週バーと行の月計はどちらも 24:00 で、**1つの画面の中で数字が食い違っていた**。`bc95af4` で週・月の集計を `_shiftAt` 経由（日付ごとに1シフト）へ一本化し、**表示は重複subがあっても正しくなった**。ただし**根（subが2つできること自体）は未解決**で、上記のExcel取り違え・管理者調整値の取り残しはそのまま残る。**表示が直ったぶん、重複の存在に気づく手がかりが1つ減った点に注意。**

**正解は既にコードベース内にある**: 管理者側の同じ問題は**すでに修正済み**で、[app-admin.js](app-admin.js) の `_getSubForPeriod` が登録名で見つからなければ別名を順に探すフォールバックを持ち、コメントに理由まで書いてある——「ここでaliasを見ずに登録名一致だけで判定すると、別名提出者の編集がidx===-1に落ちて登録名の別subを新規作成してしまい、_getSubの完全一致優先により元の提出が読めなくなる」。**スタッフ側の `existSub` にだけ同じフォールバックが無い。**

**それでもループで直さなかった理由**: 直すには判断と、ループでは取れない検証が要る。
1. **`staffName` を登録名へ正規化するか**を決める必要がある。別名subを再利用して `staffName` を「田中」に書き換えると、[app-main.js](app-main.js) の `onSub` のローカルstate更新が `findIndex(s=>s.staffName===sub.staffName&&s.periodId===…)` ＝ **staffName一致で探しているため旧エントリを取り逃し、画面上だけ重複が増える**。つまり **app-staff.js と app-main.js の2ファイルを同時に直す必要がある**（id一致で探すか、こちらも別名込みにするか）
2. **スタッフ提出パスはバグチェック#51・#56・#58 の回帰がすべて発生した場所**であり、修正後の非破壊確認には実機E2E（別端末＝Cookieなしからの再提出）が要る。**#78〜#81 の4回連続で `preview_start` が unattended session では拒否されており、この確認ができない。**

> **✅ 2026-08-21 決定・コード修正済み（`c889660`）／残るは実機E2Eと本番データ確認のみ**
> ユーザー判断は **「正規化する」** で確定した。スタッフ画面の `name` は入力・サジェスト確定の時点で
> 既に `resolveAlias` 済み（入力欄の onBlur・サジェスト候補クリック）＝常に登録名なので、`existSub` に別名フォールバックを
> 足すだけで、再利用したsubの `staffName` が登録名へ正規化される。あわせて app-main.js の `onSub` の
> `findIndex` を id 一致へ変更した（名前一致のままだと正規化で旧エントリを取り逃し、画面上だけ2行になる）。
> **既存subの遡及正規化は行わない**（`registerAlias` 時に過去のsubを書き換えない）。次に再提出した時点で
> 正規化される漸進移行とする。過去の提出記録を後から書き換えないほうが安全で、実害（Excelの取り違え）は
> 再提出で解消するため。

**受け入れ条件**:
- [x] `existSub`（app-staff.js）を app-admin.js の `_getSubForPeriod` と同じ別名フォールバック付きにする（`c889660`）
- [x] 再利用時に `staffName` を登録名へ正規化するかを決める（**ユーザー判断**）→ **正規化する**。app-main.js の `onSub` 内の `findIndex` を id 一致へ変更済み（`c889660`）
- [x] 実機E2Eで「別名で提出 → 管理者が別名登録 → 別端末から再提出」を通し、subが1件のままで管理者調整値が引き継がれることを確認する（**2026-08-22 完了**。dev標準テスト店舗で実施。既存subを「たなか」名義にし管理者調整値 `adjustedStart:"09:00"`／`adjustedStartNote:"研修"` を入れた状態から、氏名Cookieの無いスタッフ画面で「たなか」と入力→画面上で「田中」に解決→提出。結果は **sub 1件のまま**（既存id `ZPTq…` を再利用）・**`staffName` が「たなか」→「田中」へ正規化**・**調整値が残存**・`isUpdated:true`／`updatedAt` 更新。コンソールエラー0件）
- [ ] Excel出力に本人の最新提出が出ることを確認する（**未実施**。上のE2Eで sub が1件に収束したため `expXl` の `find` が取り違えようがない状態にはなったが、**Excelファイルを実際に開いて中身を見てはいない**）
- [ ] 既に2つのsubができている店舗があるか本番データで確認し、あれば統合方針を決める（**未実施**・本番データ確認はユーザーの操作）

**Nodeでの実測（`c889660` 時点・実機E2Eの代替にはならない）**: 配信物の `resolveAlias`・`carryAdminShiftFields`・`diffSubForFlatWrite` を読み込み、「別名『たなか』で提出済み＋管理者が `adjustedStart:09:00`・`adjustedStartNote:"研修"` を入れた状態で、別端末から再提出する」経路を再現。**修正前は新規sub（別id）が作られて調整値が消え行が2件**、**修正後は既存subを再利用し `staffName="田中"`・調整値が残り行が1件**。書き込みパスに `staffName` が含まれる＝正規化が永続化されることも確認。

**影響範囲**: app-staff.js（`existSub`・`buildShift`）、app-main.js（`onSub` のローカルstate更新）、~~app-admin.js（`expXl` の `find` を複数ヒット時にどう扱うか）~~ → **2026-09-02 `e2fe16a` で決着**（`resolveSubByAlias` に一本化＝完全一致優先。app-utils.js）
**備考**: バグチェック#81（2026-08-18）で検出・**条件B（`staffName` を正規化するかの仕様判断）と条件D（2ファイル同時変更＋実機E2Eが前提）に該当**。同じ回で見つかった「スタッフ削除の確認が別名ぶんを数え落とす」（app-admin.js の `StaffTab` 削除確認）は**数える式を他4箇所に合わせるだけで判断が不要だった**ため `3a5b830` で修正済み。両者の根は同じ「`sub.staffName` に別名が残る」だが、**こちらは提出データの取り違え、あちらは確認文の数え落とし**で直し方が独立するため分けて記載した。上の「仕様判断が必要な挙動のまとめ」にある**#79 の「死んだ別名が生き続ける」とも根が近い**（どちらも別名の後始末）ので、別名まわりをまとめて決着させるなら同時に扱うとよい。

**2026-09-21 追記（バグチェック#140）— 「同じ名前|日付のシフトが2つある」状態は、別名を使わなくても作れる**:
`validatePeriodDates` は**期間の重なりを警告のみで通す**（2026-08-25 決定・案B）ため、重なった日に
両方の期間へ提出があると、**別名が1件も無い店舗でも** `shiftByStaffDate` のキーが衝突する。
つまりこのタスクが閉じても、重複を前提にした読み手の食い違いは残る。**本タスクを「別名の話」としてだけ
読まないこと。**

同じ回で、**行の「1日超過」だけが `sub.shifts[d]` を直に読んでいた**問題は修正済み（`2f758c4`・
上限判定5つのうち4つが通っている `_min` へ揃えた）。**残っているのは表示の2箇所で、どちらも
「その提出を見せるのか、その人のその日を見せるのか」という1つの仕様判断に帰着する**:

- **詳細モーダルの「勤務計」「合計」「各日の勤務時間」**が `det.shifts[d]` を直に読む一方、
  同じモーダルの**週間勤務時間・月計は `_dayMin`（`_shiftAt` 経由）**で引く。
  実測（別名なし・期間の重なりのみ・9/24 が 09:00-13:00 と 09:00-18:00）: **勤務計 9:00 / 週間 4:00**。
- **`_windowVio` の窓の起点**だけが `sub.shifts[d]` を直に読む（窓の中の合算は `_min` × `_allWork()`）。
  「マップでは出勤だがこの提出では休み」の日が起点から漏れる。2週・任意日数の上限を使う店舗のみ。

**受け入れ条件（追加）**:
- [ ] 詳細モーダルが「その提出の明細」なのか「その人のその日」なのかを決める（**ユーザー判断**）。
      前者なら現状維持＋コメント明記、後者なら `_dayMin` へ揃える
- [ ] 決めた向きを `_windowVio` の起点にも同じ規則で当てる（片方だけ直すと同じ形が残る）
- [ ] 2つの数字が同じ日について同じ分数を返す回帰テストを追加する
      （`.claude/skills/shifty-e2e-verify/scripts/example-subs-daily-vs-week.js` と同じ形で書ける）

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
- [x] **導線の整備（2026-07-14 完了・コミット`ca2caa8`）**: ログイン画面（＝実質のランディング。`index.html` はSPAのシェルでリンクはReact側が描画する）のフッターに利用規約・プライバシーポリシーを常時表示（app-admin.js のログイン画面フッター）。`UpgradeModal` にも規約リンクを追加。**特商法表記へのリンクだけは、ページ本体が未作成のため未配線**。
- [x] **購入前の明示（2026-07-14 完了・コミット`ca2caa8`）**: `UpgradeModal` に「月額料金の自動更新（定期課金）／表示価格は税込・1店舗あたり／Stripeを通じて毎月自動課金／解約はマイページのStripeカスタマーポータルから／期間途中の日割り返金なし」を明示（app-admin.js の `UpgradeModal`）。
**影響範囲**: 新規 `tokusho.html`、既存 `terms.html`・`privacy.html`（内容更新）、`index.html`（フッターリンク）、app-admin.js（`UpgradeModal`・規約導線）。正本はObsidian利用規約.md。
**備考**: 調査日 2026-07-14。本文の免責条項（第10条・故意重過失を除外し12ヶ月料金を上限）は消費者契約法8条の全部免責には当たらず概ね適法と判断。最大の欠落は「特商法表記ページの不在」と「静的terms.htmlの旧版残存」。

---

## 🟡 解約イベントだけが「契約の実際のprice」ではなく metadata でプランを判定している

**目的**: `resolveShopMeta`（functions/index.js）は冒頭で `if (md && md.shopId) return { shopId: md.shopId, plan: md.plan || null }` と早期returnする。**イベント本体が Subscription オブジェクトそのものである `customer.subscription.deleted` / `customer.subscription.updated` は必ずこの行で返るため、同関数が下の invoice 経路（`planOfSubscription`）で行っている「プランは metadata ではなく契約の実際のprice から解決する」という処置がこの2イベントには一切適用されない。** その分岐のコメント自体が「metadata を信じると降格を巻き戻す」と書いており、`99d8cd5` はまさにそれを直した修正だったが、**修正が届いたのは invoice 経路（subscription を retrieve する分岐）だけ**だった。

**これが問題になる経路**: `customer.subscription.deleted` のハンドラは、受け取った `plan` と DB の現行プランが食い違うと「別契約の解約」とみなして**ダウングレードを丸ごとスキップする**。したがって subscription の `metadata.plan` と `accounts/{shopId}/plan` が一度でも食い違うと、**解約しても店舗が有料プランのまま残り続ける**（契約は消えているので以後イベントは二度と来ない＝自動回復しない＝無償で有料機能が使えたままになる）。
- 食い違いが生まれうる形: 期間終了時ダウングレード（Subscription Schedule）は price を差し替える。`customer.subscription.updated` は price からプランを解決して DB を更新する一方、subscription の `metadata.plan` は**フェーズのmetadataがStripe側で適用されて初めて**追随する。コード中のコメント自身がこれを「多重防御」と呼んでおり確実性は前提にされていない。Stripeダッシュボードから手作業でpriceを変えた場合も同じ食い違いになる。

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

**2026-09-14 追記（バグチェック#127）— 同じ Webhook の別経路: 解約済みの契約の請求書が後から支払われると、有料プランに戻ったまま降りない**:
`invoice.payment_succeeded` の分岐（functions/index.js の `stripeWebhook`）は、**契約がいま生きているか（`status`）を一度も見ない**。
支払い失敗の再試行が尽きて契約が `canceled` になった後に、その未払いの請求書が支払われると、次の順で有料プランに戻る（コードを読んで確定）。

1. `resolveShopMeta(invoice)` は invoice に `metadata.shopId` が無いので契約を retrieve する。解約済みでも契約の metadata と price は残るので `{shopId, plan:"pro"}` が返る
2. `shouldApplyRenewalPlan("free","pro")` は `true` を返す（引き上げ方向は常に反映する）
3. `plan="pro"`・`planExpiry`・`stripeSubscriptionId`（解約済みのID）が書かれる
4. その契約はもう消えているので、**以後この店舗を free へ戻すイベントは来ない**。`planExpiry` は表示専用でプラン判定に使わないため、**1回分の支払いで有料機能が無期限に使える**

**前提は Stripe 公式ドキュメントで確認済み**: 解約時に open な請求書は `auto_advance=false` になるだけで無効化されず、手動での回収は引き続き可能
（[サブスクリプションをキャンセル](https://docs.stripe.com/billing/subscriptions/cancel)）。再試行が尽きたときに契約を canceled／unpaid／past_due のどれにするかはダッシュボードの設定で決まる
（[支払いの再試行を自動化する](https://docs.stripe.com/billing/revenue-recovery/smart-retries)）。

**ループで直さなかった理由**:
- **Shifty の Stripe 設定がどれか分からない**（条件C）。unpaid・past_due なら契約は生きたままなので、この経路は起きない
- 局所モックでの再現（Firebase・Stripe へは出ない Node スクリプト）が **Bash フックの「stripe 変更系」ゲートで止まり**、承認なしには実行できなかった。実行で検証できない修正はしない
- 直しても、効かせるには CF の本番デプロイが要る（条件A）

**直すなら（案）**: `resolveShopMeta` の retrieve 経路で `sub.status` も返し、`invoice.payment_succeeded` のプラン反映を `LIVE_SUB_STATUSES` の契約に限る。
`paymentFailed` の解除はそのままでよい。`checkout.session.completed` は対象外にする（初回購入の反映を止めないため）。

**受け入れ条件（追加）**:
- [ ] Stripe ダッシュボードの「失敗した支払いの管理」で、再試行が尽きた後の契約の扱いを確認する（**canceled でなければ🟢へ下げてよい**）
- [ ] canceled の場合は上の案で修正し、承認を得てモックでの再現（修正前は pro に戻る／修正後は free のまま／有効契約の更新は従来どおり反映）を通してからデプロイする

**2026-09-15 追記（バグチェック#128）— 同じ根の3つ目: `customer.subscription.updated` はイベントの写しをそのまま書き、届いた順を疑わない**:
このハンドラ（functions/index.js:605）は `event.data.object`（**イベントが作られた瞬間の写し**）から
`cancelAtPeriodEnd`・`currentPeriodEnd`・`plan` を作り、623行でそのまま書く。どのイベントが新しいかを比べる処理も、
契約を取り直す処理も無い。一方 Stripe は**配信順を保証しない**。本番では失敗した配信を**最長3日間**再送し、
`created` は秒単位なので順序判定に使うなとも書いている（[Webhook](https://docs.stripe.com/webhooks) の「イベントの順序付け」「自動での再試行」）。
そのため、古い写しが後から届くと DB が過去の状態へ戻る。コードを読んで次の3形を確定した。

| 起きること | 届く順 | 結果 | 自然に直るか |
|---|---|---|---|
| ポータルで解約してすぐ取り消す | 取り消し(cancel=false) → 解約(cancel=true) | アプリは「解約済み・X をもって終了」を出し、プラン変更欄も隠れる（app-admin.js:4927・4957）。**実際には更新されて課金される** | 次の更新時の updated で直る（最大1期間） |
| Pro→Premium のアップグレード直前の updated(price=pro) が失敗し再送される | アップグレード → 古い updated | `plan="pro"` が書かれ、**払っている Premium の機能が止まる** | 次の更新請求で直る（最大1ヶ月） |
| 督促中の updated(status=past_due) が失敗し、3日以内に解約される | deleted → 古い updated | `tracked` は解約で null にされているので、古い写しの契約IDと `plan` が書き戻される（past_due は `LIVE_SUB_STATUSES` に入っている） | **直らない**（契約はもう無く、以後イベントが来ない＝#127 と同じ形） |

**#127 の申し送りへの答え（外れ）**: 「`subscription_schedule.updated` の遅延再送で取り消した予約バナーが復活する」は、
記録上の設定では起きない。購読しているイベントは `scripts/stripe-setup.js` の `REQUIRED_EVENTS` の5種類で、
`subscription_schedule.*` は含まれない（functions/index.js:303 のコメントも同じ）。
さらにクライアントは `scheduledPlan===plan` のときバナーを出さない（app-admin.js:4937）ので、切り替え後に古い予約が残っても見えない。
**ただし本番エンドポイントの実際の購読一覧は未確認**（Stripe には触れていない）。

**ループで直さなかった理由**: 上の #127 と同じ3つ（再現モックがフックのゲートに当たる／CF デプロイが要る＝条件A／
直し方が #127 の案と同じ関数に重なるので一緒に決めるべき＝条件D）。起きる確率はどれも「配信の失敗か入れ替わり」が前提で低い。

**直すなら（案・#127 の案と統合）**: Webhook でプランや契約の状態を書く前に、**`stripe.subscriptions.retrieve(id)` で契約を取り直し、
その値だけを書く**（Stripe が勧める「API から最新のオブジェクトを取得する」形）。取り直した契約が `LIVE_SUB_STATUSES` に無ければ
`plan` も `stripeSubscriptionId` も書かない。こうすると届いた順に関係なく、最後に処理した回が最新の状態を書く。
`invoice.payment_succeeded`（#127）と `customer.subscription.updated`（本件）を同じ取り直しの関数に通せば、
`resolveShopMeta` の2回呼び（#127 の🟢）も同時に消える。

**受け入れ条件（追加）**:
- [ ] Stripe の Webhook エンドポイントの購読イベント一覧が `REQUIRED_EVENTS` の5種類であることを確認する（`subscription_schedule.*` が入っていれば、そのハンドラも取り直しの対象に含める）
- [ ] 上の案で修正し、承認を得てモックで「古い写しを後から処理しても DB が最新の状態のまま」を3形とも通してからデプロイする

---

## 🟢 企業経由でオーナーになった端末は、連携解除後も管理コードで戻れる

**目的**: `claimCompanyShop`（2026-09-16 追加）で企業メンバーが連携済み店舗のオーナーになると、その端末は
オーナーとして `shops/{shopId}/private/adminKey` を読める＝**その店舗の管理コードを手に入れる**。
`unlinkStoreFromCompany` は `companies/{id}/grants` を見て owners から外すが、**既に渡った管理コードは
取り消せない**ので、解除後に「コードで追加」から自分を再登録できる。

**受け入れ条件**:
- [ ] 解除時に `private/adminKey` をローテーションするかを決める（ローテーションすると、**古いキーを
      localStorage に持つ既存のオーナー端末が `owners/{uid}` の再登録に失敗して閲覧のみに落ちる**
      ——ルールが値一致を要求するため。単純なローテーションでは店舗側が壊れる）
- [ ] 代案: owners に「企業由来」の印を持たせ、解除時にキーではなく **owners 側の再登録を拒否**する

**影響範囲**: functions/index.js（`claimCompanyShop`・`unlinkStoreFromCompany`）、database.rules.json（owners の write 条件）
**備考**: 元々「管理コードを渡した相手は以後ずっと管理者になれる」という性質は管理キー方式そのものが持つもので、
本件はその適用範囲が**企業連携経由でも起きるようになった**という話。連携には管理コードの提示（または
既存オーナーであること）が要るので、**第三者の権限奪取ではない**。

---

## 🟡 企業連携の解除が、稼働中の店舗を「オーナー0人」に戻してしまう

**目的**: `unlinkStoreFromCompany`（functions/index.js）は `shops/{shopId}/owners/company_{companyId}` を無条件に削除する。企業ログインのセッションで作った店舗はオーナーが企業uidだけなので、**解除すると owners が空になる**。`linkStoreToCompany` は未claim店舗（`allowed = !owners`）を**管理キーなしで連携できる**ため、その隙に shopId を知る第三者が自分の企業へ連携してオーナーになれる。shopId はスタッフURLの `tokens` 逆引きから辿れるため、店舗コードは秘密情報として扱えない。
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

**2026-09-05 追記（バグチェック#111）— 同じ根が Cloud Functions 側にも残っている（3つ目の入口）**:
`verifyShopOwner`（[functions/index.js](functions/index.js)）は `if (owners && !owners[decoded.uid])` と書かれており、
**`owners` が空（未claim）の店舗では、認証さえ通っていれば誰でも `ok:true` が返る**。直上のコメントは
これを「移行猶予として許可する」と説明しているが、**その移行猶予は 2026-07-28（`dbdd9d9`）に
`database.rules.json` 側では終了している**。つまり**ルールだけが締められ、Cloud Functions は猶予のまま**という
非対称が残っており、コメントを読んだ人は「現行の意図的な仕様」と受け取る（実際には期限切れの記述）。

この判定を通っているのは**課金系4エンドポイントすべて**（`createCheckoutSession`・`changePlan`・
**`cancelPlanChange`（2026-09-05 新設）**・`createPortalSession`）。新しい関数が同じ穴を自動的に
引き継ぐ構造なので、エンドポイントが増えるたびに露出面が広がる。

**現時点の実害は小さい**（ただし下記はいずれも実測ではなく既存記録とコード上の推論）:
- 2026-08-25 の claim 監査（BACKLOG 記載）では、本番15店舗中14が claim 済みで**未claim はデモのみ**。
  そのデモは4エンドポイント全てで `isDemoShop` により先に403で弾かれることを行番号で確認済み
- 未claim店舗は Stripe の customer/subscription を持たないため、`changePlan`・`cancelPlanChange` は
  `findActiveSubscription` が null を返して**409で止まる**。素通りしうるのは `createCheckoutSession`（＝#67 の形）
- `unlinkStoreFromCompany` が owners を空に戻す経路は `d6c826a`（案A）で塞がれているため、
  **稼働中の店舗が後から未claim へ戻ることは無い**

**したがって残る判断は1つ**: 上の受け入れ条件で「未claim分岐を廃止する」と決めた方針を、
`linkStoreToCompany`/`createCompany` だけでなく **`verifyShopOwner` にも適用するか**。適用するなら
`if (!owners || !owners[decoded.uid]) return 403` の1行で、**同時にコメントの「移行猶予」の記述も消す**
（記述だけが残ると、次に読んだ人が同じ誤解をする）。適用しない場合も、コメントを実態
（「未claim店舗は誰でも通る。デモは isDemoShop で別途拒否している」）に直す必要がある。
**条件A（Cloud Functions の本番デプロイ）と条件B（猶予を残すかの判断）に該当**するためループでは変更しない。

**2026-09-13 追記（バグチェック#125）— 上の「デモは `isDemoShop` で先に403で弾かれる」は、直接POSTでは成り立っていなかった**:
課金系4エンドポイントは `req.body.shopId` を検証せずに `shops/${shopId}/owners` へ埋め込んでいた。
Admin SDK はパスの空セグメントを詰めるので、`"demo-toriMatsu-v1/"`・`"/demo-toriMatsu-v1"`・配列 `["demo-toriMatsu-v1"]` は
**`isDemoShop` の文字列比較に一致しないのに、DB 上は本物のデモ店舗を読む**（firebase-admin 12.7.0 で `ref().toString()` を実測）。
デモは owners を持たないので `verifyShopOwner` も通り、#67 の denylist が迂回できた。

- **修正はコード上で済んでいる**（`d4867ef`・`isValidShopId` を4エンドポイントの `isDemoShop` より前に通す）。
  すり抜け3種と禁止文字（`. # $ [ ]`）は 400 になり、`genSecureId` 形式の10万件は全件通過（既存店舗に影響なし）
- ~~**ただし本番は未デプロイ**~~ → **2026-09-16 に本番反映済み**（全関数を `2766643` の内容へ揃えた。本番の4エンドポイントが `GET→405` / `POST(トークン無し)→400` を返すことを確認）
- **実害は小さい**: 悪用するには攻撃者自身がデモ店舗名義で決済する必要がある。そうすると、同じ細工をした第三者が
  **その決済者のカスタマーポータルを開ける**（#67 の①と同じ形）。正規のUIはデモで購入導線を出さないので、
  一般利用者がこの状態に入ることは無い
- **根はこのタスクと同じ**（未claim店舗が `verifyShopOwner` を通る）。上の判断で `!owners` を 403 にすれば、
  入力検証が無くてもデモの変種は弾かれる。入力検証は判断を待たずに入れられる多重防御として先行した

**2026-09-14 追記（バグチェック#126）— 企業系 Callable の `companyId` も同じ形で、#65 のガードを迂回できた**:
`changeCompanyPassword`・`renameCompany`・`linkStoreToCompany`・`unlinkStoreFromCompany` は `companyId` を
`typeof === "string"` だけで受けていた。`"/C1"` は権限チェック（`companies//C1/pub/ownerUid` → C1）を正しく通る一方、
`registerCompanyAsOwner` が `shops/S/owners/company_/C1` へ書くため、owners に **`"company_"` という偽のキー**が入る。
`unlinkStoreFromCompany` の「最後のオーナーは外さない」判定はそれを他のオーナーと数えるので、
**実オーナーが企業uidだけの店舗から、最後の実オーナーを外せた**（同じ式で評価: 通常は拒否 → `/C1` で連携した後は素通り）。

- **修正はコード上で済んでいる**（`a8169c0`・push().key の文字種に限る `isValidCompanyId` を4本の入口で通す）。
  すり抜け3種・禁止文字・空白・65文字以上は `invalid-argument` になり、`push().key` 10万件は全件通過
- ~~**本番は未デプロイ**~~ → **2026-09-16 に本番反映済み**（`d4867ef` と同じ1回のデプロイで両方が入った。本番の `claimCompanyShop` が不正な `companyId` に `invalid-argument` を返すことを確認）
- **実害は小さい**: 行えるのは、すでにその店舗を管理している企業メンバーだけ（第三者の権限奪取ではない）。
  外した後も `private/adminKey` は残り、管理コードを持つ端末はルール（owners/$uid の書き込み）で自分を登録し直せる

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

**2026-09-05 追記（バグチェック#111）— 有効化する前に、カットオフ計算のJST未適用を見ておくこと**:
`purgeOldPeriodsCutoff`（[functions/index.js](functions/index.js)）は
`d.toISOString().slice(0,10)` で日付へ落としており、**`toJstDateStr` を通していない**。
スケジュールは `timeZone("Asia/Tokyo")` なので、**JST 00:00〜09:00 に発火するとカットオフが1日古くなる**。

実測（同じ式をそのまま評価）:

| 発火時刻 | 算出されるカットオフ | JST基準の期待値 |
|---|---|---|
| JST 2026-09-05 00:30 | **2023-09-04** | 2023-09-05 |
| JST 2026-09-05 12:00 | 2023-09-05 | 2023-09-05（一致） |

**ずれる向きは「消しすぎ」ではなく「1日多く残す」**（`period.endDate >= cutoff` で残す判定のため）。
したがって**このまま有効化してもデータを余分に消すことは無い**——今すぐ直す必要は無く、
`PURGE_OLD_PERIODS_DRY_RUN=false` の作業を止める理由にはならない。ただし
**削除を実際に走らせる前に「向きが安全側である」と確認したうえで着手したほうがよい**ので、
ここに実測を残す。ついでに直すなら `tsToDate`/`toJstDateStr` と同じ扱いに揃える1行で済む
（同じUTC/JST問題は 2026-08-25 に `planExpiry` で一度直しており、そのとき**この関数には届いていなかった**）。

なお `d.setMonth(d.getMonth()-36)` の月跨ぎは、36ヶ月＝ちょうど3年で月インデックスが変わらないため
**2月29日に発火した場合だけ**が例外（存在しない日付が3月1日へ繰り上がる＝これも1日多く残す向き）。

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

### ✅ Stripe秘密鍵の一部がログに出続けていた（2026-09-05 完了・受け入れ条件3/3）

`getStripe()` と `createCheckoutSession` の入口の2箇所が `STRIPE_SECRET_KEY.substring(0,12)` を
`console.log` しており、`sk_live_` が8文字なので**実際の秘密の4文字**が Cloud Logging に蓄積していた。
修正（バイト長だけを出す形）は `87f66ee` で入っていた。

- [x] `functions/` を本番プロジェクト（ontheshift）へ反映する → 2026-09-05 のデプロイで16関数を反映
      （`cancelPlanChange` は create、他15関数は update。すべて成功）
- [x] 反映後、ログ行が `loaded(<バイト数>b)` になっていることを Cloud Logging で確認する
- [x] 既に溜まっている過去ログの扱いを決める → **保持期間で自然に消えるのを待つ**（下記の理由により露出は限定的）

> **⚠️ 起票時の前提が誤っていた——修正は今日より前から本番で動いていた**
> Cloud Logging に残っている `createCheckoutSession` の**最後の実行ログ**は
> `2026-08-31T18:02:59Z`（＝**2026-09-01 03:02 JST**）で、既に
> **`createCheckoutSession called, KEY: loaded(107b)`** と新しい形式で出ている。
> 一方 `87f66ee` のコミット時刻は **2026-09-01 09:17:30 JST** で、**ログのほうが6時間以上早い**。
>
> つまり 2026-09-01 未明に作業ツリーを直した別セッション（`diagnose-secret-corruption` 系。
> 起票時に「mtime 2026-09-01 02:02 の未コミット変更を取り込んだ」と記録されているもの）は、
> **コミットより先に本番へデプロイしていた**。BACKLOG に4日間「本番反映が未実施」と
> 書かれていたが、実態としては 2026-09-01 以降 `sk_live_` の断片はログに出ていない。
>
> **教訓**: 「develop にあるが未デプロイ」を**コミットの有無だけ**で判定していた。
> 本番の状態はコミット履歴ではなく**本番のログ／監査ログで確かめる**べきだった
> （#65 の「いつ書かれたかではなく、いつから実際に走るかで判定する」と同じ形の取り違え）。

**影響範囲**: functions/index.js（`getStripe`・`createCheckoutSession`）

---

### ✅ 祝日テーブルに2029年を追加（2026-09-05 完了・案A＝計算値で先に埋める）

`JH_DATES` が 2028-11-23 で尽きており、2029年は `JH_FIXED` の10件しか効かず、**実際の祝日19件のうち9件が
`isHoliday=false`** になっていた。壊れ始めるのは **2029-01-08（成人の日）**。ユーザー判断は**案A**で確定。

**追加した19件**（うち9件はテーブルに書かないと絶対に出てこないもの＝ハッピーマンデー・春分秋分・振替休日）:
成人の日 01-08 ／ 振替 02-12 ／ 春分 03-20 ／ 振替 04-30 ／ 海の日 07-16 ／ 敬老の日 09-17 ／
秋分 09-23 ／ 振替 09-24 ／ スポーツの日 10-08。

- [x] 案の決定 → **案A**（春分秋分の近似式が 2025〜2028 の実データと全欄一致することを #110 で確認済み。
      ハッピーマンデーと振替休日は規則が確定しておりずれる余地がない。案C＝計算への置き換えは祝日法改正・
      臨時の祝日を吸収できず二段構えが要るため、2029年を埋めるコストに見合わない）
- [x] 反映して「祝日テーブルが計算した日本の祝日と一致する」を通す（**226件パス**）
- [x] 期限切れに気づく仕掛けを置くか決める → **置かない**（#110 と同じ判断。コード変更なしにある日CIが落ちる副作用を避ける）

**回帰テストを1件追加**（9件を日付で名指し）。**追加前の app-utils.js に向けると実際に落ちる**ことを確認済み
（`2029-01-08 成人の日（第2月曜）: false !== true`）。なお既存の参照カレンダー照合テストは**対象年を
`JH_DATES` から自動で拾う**ため、2029年が載っていない状態では 2029年を1日も検査していなかった——
これがテーブル切れが誰にも気づかれない理由そのものだった。

**次の期限**: テーブルは 2029-11-23 で尽きる。2030年前半のシフトを組む **2029年12月**までに同じ作業が要る。

---

### ✅ 期限付き削除で名前を残した人を「未提出」に数える（2026-09-05 完了・案A）

ユーザー判断は**案A（数える）**で確定。`SmModal` の `notSubmitted` が生の `staffList` を見ていたため、
期限付き削除で「この期間まで残す」と指定した人が、**その期間のシフト表には列があり提出画面では本人の名前を
サジェストされるのに、未提出の一覧にだけ出てこない**状態だった（管理者が「全員出した」と読んで締め切れる）。

**呼び出し元3箇所を触らずに1箇所で直せた**。`SmModal` は `periods.find(p=>p.id===apid)` で対象期間を
既に解決しているので、`mergeKeepStaff(staffList, period)` をコンポーネント内で1回通すだけで
StaffView からの2経路と PeriodsTab からの1経路すべてに効く（起票時は「2ファイル3箇所」と見積もっていた）。

**実測**（375px・実ブラウザ・`SmModal` だけをマウント＝**Firebase へは1バイトも出していない**。
`staffList=["田中","鈴木"]`・9月前半の `keepStaff` に佐藤・提出は田中のみ）:

| | 修正前 | 修正後 |
|---|---|---|
| 未提出の表示 | **未提出（1名）＝鈴木のみ** | **未提出（2名）＝佐藤・鈴木** |
| 佐藤が画面に出るか | **false** | **true** |

`pageerror`・`console.error` ともに 0件。修正前の版（`app-staff.js` だけ HEAD 版に差し替え）で
実際に佐藤が出ないことを確認しており、素通りする検証ではない。

- [x] 数えるかを決める（ユーザー判断）→ **案A（数える）**
- [x] 実装し、`SmModal` に渡す名簿の出どころをコメントで明示する（名簿の要素が増えたときにこの経路が
      取り残されないよう、「呼び出し元は3つだが period はここで解決しているのでこのマージ1箇所で全経路に効く」と明記）

---

### ✅ `database.rules.tightened.json` を削除（2026-09-05 完了・案A）

2026-07-28 の締めルール切替（`dbdd9d9`）以降このファイルは `database.rules.json` と `cmp` でバイト同一の
残骸で、ルールを変えるたびに両方を手で同じ内容に保つ負債だけが残っていた。ユーザー判断は**案A（削除）**。

- [x] 削除するか残すかを決める → **案A（削除）**
- [x] `firebase.json:7` が `database.rules.json` の1本だけを参照していることを確認（配線への影響なし）
- [x] リポジトリ全体で `tightened` を参照するコード・設定が**0件**であることを確認（ヒットは全て説明文）
- [x] `CLAUDE.md` のファイル構成表とセキュリティモデルの記述を実態に合わせて更新

**影響範囲**: database.rules.tightened.json（削除）、CLAUDE.md（2箇所）

---

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
- [x] Excel・PDF にも凍結が及ぶ（`expXl`・`buildPdfCols` は解決後の変数を参照。期間管理タブの Excel も対応）
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
- [x] **`isSpecialRedDate` のユニットテスト追加（2026-08-10 完了・コミット`8167927`）**（app-utils.js）: posType3種（`sun`/`holSat`/`holSun`）で true、`weekday`/`sat` で false、posType未設定・settings欠損、土曜(2026-08-15)・日曜(2026-08-16)の早期return、平日の実祝日（2026-08-11 山の日）の早期return——計5テストを追加。`npm test` 160件パス
- [x] **`.git` ロックファイル残留の調査（2026-07-28 完了）**: 残骸4件（`index.stash.13.lock`・`index.stash.44869`・`index_tmp`・`index_tmp.lock`）を削除しgit正常を確認。**根本原因が判明: これらは Shifty の自動コミットフックではなく、グローバルの `security-guidance` プラグイン由来**。`diffstate.py` の `git stash create`（timeout=15秒）がタイムアウトでSIGKILLされると `.git/index.stash.<pid>[.lock]` を残す。`index_tmp*` は旧バージョンのプラグインが `.git/index_tmp` を一時indexに使っていた化石（現行版はTMPDIRの`security_hook_idx_*`に変更済み）。**重要: これらは一時index側のロックのため、通常の`git add`/`commit`が使う`.git/index.lock`とは別物で、gitをブロックしない（＝#44の「commitがindex.lock/HEAD.lockに阻まれた」障害の原因ではない）**。#44を実際にブロックした`index.lock`/`HEAD.lock`はShiftyのStopフックの`git commit`がターン終了で強制終了された痕跡で、これは別系統。恒久対策は不要（無害・低頻度）だが、再発時はこの区別を踏まえること
- [x] **`VISION.md` の作成（2026-08-10 完了・コミット`df925ca`）**（#27から継続で不在だった）: `/bug-check` と `/shifty-feature` の両ループが PHASE 0 で参照する完了基準の正本として作成。プロダクトの目的・ターゲット・プラン・設計原則6項目・バグチェックループ完了基準・機能実装ループ完了基準・やらないと決めたこと（Expo/Vite+TS/AdminLogin の理由と再着手条件）・現在の重点を記載
- [x] **`globalTemplates` の命名整理（2026-08-10 完了・コミット`5e725b0`）**: `shopTemplates` / `setShopTemplates` / `saveShopTemplates` へ改名（app-main.js 8箇所・app-admin.js 8箇所）。**Firebaseパス `shops/{shopId}/templates` と localStorage キー `templates_v6` は変更していない＝データ移行不要**。CLAUDE.md の state一覧・技術負債欄も更新済み
**影響範囲**: tests/core.test.js（テスト追加）、新規VISION.md、.git運用（フック）、app-main.js/app-admin.js（命名整理は任意・広範）
**備考**: 「変更マークの締切ゲート対象外」（app-staff.js:166）・capabilityモデルの残存リスクも#44申し送りに含まれるが、前者は仕様判断待ち、後者は上記「App Checkの有効化」で恒久対応するため本まとめには含めない。リリース時のindex.htmlキャッシュバスティング版数バンプはrelease-to-mainフローの標準工程のため別管理。


### ✅ スタッフの提出書き込み（onSub）の差分書き込み化（2026-08-10）
**実装内容**:
- [x] `onSub`（app-main.js）を `saveSubs` と同じ3点の保護に寄せた: **差分書き込み**（`diffSubForFlatWrite` + `fbUpd`。以前は `fbSet` で sub 全体を set）／**関数型state更新**／**`pendingSubWritesRef` による未確定書き込みの保護**。基準となる prevSub はサーバー由来の `subsMapRef` を優先し、未着時はローカルstateへフォールバックする
- [x] **E2Eで発覚した2段目の欠陥も修正**: `diffSubForFlatWrite`（app-utils.js）が `!==` の参照比較だったため、StaffView が再提出のたびに全日付を `buildShift` で作り直す実装と噛み合わず、**1日直しただけで全15日付が書き込み対象になり差分書き込みが無効化されていた**。値比較（`deepEqValue`・キー順非依存・ネスト対応）に変更した
- [x] ユニットテスト5件追加（`npm test` 165件パス）。`npx eslint app-*.js` 0 errors
- [x] **実機E2E（localhost・標準テスト店舗）で確認**: 修正前は sub 全体 set → 参照比較修正前は16パス（全15日付＋updatedAt）→ 修正後は変更した1日＋updatedAt、無変更の再提出では **`updatedAt` の1パスのみ**。管理者が 8/3 に入れた `adjustedStartNote:"研修"` が、スタッフの再提出を3回繰り返しても消えないことをFirebaseの実データで確認
**残課題**: スタッフが自分で触った日については、依然としてスタッフ端末の値が優先される（`carryAdminShiftFields` の引き継ぎ範囲の問題で、これは別件＝「仕様判断が必要な挙動のまとめ」の1項目目）。

---


### ✅ セキュリティ強化: 締めルールへの切り替え＋`.indexOn: ["periodId"]` 反映（2026-07-28）

**目的**: 2026-07-07実装のオーナー権限分離（Anonymous Auth + adminKey）の移行猶予を終了し、未claim店舗への「誰でも書き込み可」ブランチを撤去。あわせて同一 database deploy で `.indexOn` を反映。
**実装内容**:
- [x] **本番claim監査（デプロイ前ゲート）**: prodサービスアカウントで `/shops` 全13店舗を監査し、全店舗claim済み（未claim0・アクティブ未claim0・課金中未claim0）を確認。締めルールで書き込み不能になる店舗が存在しないことを確認してからデプロイ。
- [x] **クライアント先行の確認**: 本番配信中の `origin/main` が既に `inviteCodes` の `expiresAtMs`/`uid` 書き込みと lazy claim（いずれも app-main.js。招待コード方式ぶんは 2026-08-24 の `8384467` で削除済み）を実装済み＝デプロイ順序ルール（クライアント→ルール）を充足。
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
