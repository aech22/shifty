# CLAUDE.md — Shifty

作成日: 2026年6月（コードベースから自動生成）／最終更新: 2026-10-05（9ファイル構成・従業員画面の本番公開・個人リンクコードの機能ごとの削除までをコードと照合）

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
3. **修正前に全呼び出し元を洗い出す**: 9ファイル分割のため定義と呼び出しが別ファイルにあるのが普通。`grep -n "関数名" app-*.js` で全ファイル横断で確認してから編集する。
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

## ファイル構成（2026-07-06 に app.js を5ファイルに分割・2026-09-30 に app-company.js と app-shift.js を切り出して7ファイル・2026-10-04 に従業員画面の2ファイルを足して9ファイル）

```
/
├── index.html          ← CDN 読み込み（SRI付き）・PWA meta・OGP・スクリプト読み込み
├── app-utils.js        ← 純粋関数・定数（ブラウザAPI非依存 = Nodeでテスト可能・プレーンscript）
├── app-my-utils.js     ← 従業員画面（第2部）の純粋関数・定数（プレーンscript・Nodeテスト可能。app-utils.js が大きい（2026-10-05 で約27万字）ので従業員画面の関数はこちら）
├── app-core.js         ← DEV_MODE・Firebase設定・Cookie/テーマ/localStorage・スタイル定数（プレーンscript）
├── app-staff.js        ← ShiftyIcon, StaffView, StaffHdr, CellEditPanel, SmModal（babel）
├── app-admin.js        ← AdminView・期間/スタッフ/候補/提出一覧/マイページの各タブ, expXl, UpgradeModal, AC/AL/AT/CL（babel）
├── app-shift.js        ← シフト作成タブ一式（ShiftEditTab・実績の ActualsGrid/ActualsCsvDialog・HeatTable/SummaryTable/GridLegend・LEGEND_COLORS/FIXED_KEY 等）（babel）
├── app-company.js      ← 企業連携タブ一式（CompanyTab と部品・企業の一括PDF・企業横断ダッシュボード）・設定タブ（SetTab）・賃金マスタ（StaffPayPage・PayCodeBox）・月次賃金（PayrollPage）（babel）
├── app-my.js           ← 従業員画面（MyView・マイシフト／給料／設定の下部タブ・アカウントの登録とログイン・メールリンクの画面）・
│                          スタッフ個別URL（#/m/ の MyPageView・登録・暗証番号・URLの再送）・スタッフタブで描く管理者側の部品
│                          （StaffPageEditSection・StaffPageRequestsCard・StaffLinkEditSection・StaffLinkRequestsCard）（babel）
├── app-main.js         ← App() 本体 + ReactDOM マウント（babel）
├── tests/
│   ├── core.test.js    ← app-utils.js の Node ユニットテスト（node --test）。管理者画面の実装を読むドリフト検出は
│   │                      app-admin.js＋app-shift.js＋app-company.js を連結して読む（`_readAdminSurface`）
│   └── my.test.js      ← app-my-utils.js のユニットテストと、読み込み順（index.html・package.json・eslint）のドリフト検出
├── functions/
│   ├── index.js        ← Firebase Cloud Functions（Stripe・メール送信・店舗/期間の自動削除・企業アカウント・従業員画面の紐付け・
│   │                      スタッフ個別URL（myPagePin・getMyPay・setPageEmail・recoverPageUrl）。38本。個人リンクコードの CF
│   │                      （issueStaffLinkCode・redeemStaffLinkCode）は 2026-10-05 に削除した＝本番から消すには関数の削除が要る）
│   ├── company-config.js ← 企業アカウント系 CF の純粋関数（tests/core.test.js がクライアントとの一致を照合）
│   ├── staff-link.js   ← 従業員画面の紐付け（E2）の純粋関数（tests/my.test.js が app-my-utils.js との一致を照合）
│   ├── my-pay.js       ← 従業員画面の会社設定の賃金（E6・getMyPay）の純粋関数（tests/my.test.js が normalizePayVersion との一致を照合）
│   └── my-page.js      ← スタッフ個別URLの給料の暗証番号（myPagePin）の純粋関数（2026-10-04。crypto を読まない＝E2E のスタブにも埋め込む）
├── RULES.md            ← やってはいけないこと（必読）
├── sw.js               ← 通知（Web Push）の Service Worker（2026-10-08）。push と notificationclick だけ・**ファイルをキャッシュしない**・index.html からは読み込まない（通知を有効にする操作のときだけ登録）
├── functions/notify.js（※ functions/ 配下）← 通知の宛先と判定の純粋関数（tests/notify.test.js が照合）
├── firebase.json       ← Firebase Hosting / Functions 設定
├── database.rules.json ← Firebase セキュリティルール（**正本はこの1ファイルのみ**。2026-07-28 に締めルールへ切替済み）
│                          ※ `database.rules.tightened.json` は 2026-09-05 に削除（切替完了後はバイト同一の残骸で、
│                            ルール変更のたびに二重管理を強いていた。`firebase.json` はこの1本だけを参照する）
├── CNAME               ← shiftyshifty.app
├── privacy.html / terms.html ← 静的ページ（プライバシー・規約）
├── favicon-staff.svg / favicon-staff-180.png ← スタッフ側の URL で使うアイコン（2026-10-05・管理画面の favicon のオレンジと白を入れ替えたもの。オレンジは #f87036 に白を20%混ぜた #f98d5e）
├── ogp.png             ← OGP画像（実配信物。index.html の og:image が参照）
├── generate-ogp.js     ← ogp.png の生成元。画像を変えるときはこれを編集して再生成する
│                          （@napi-rs/canvas が必要。フォントは Hiragino Sans を明示すること）
├── blog/               ← SEO記事HTML（shift-kanri-muryou.html 等）
├── x-bot/              ← X（Twitter）自動投稿bot（独立Node環境・別途node_modules）
└── scripts/            ← 運用スクリプト（stripe-setup / seed_shops / list_shops / copy-prod-to-dev / obsidian-sync 等。service-account-*.jsonはgitignore済み）
```

**分割の仕組み**: Babel Standalone は複数の `<script type="text/babel">` を同一グローバルスコープで順に実行するため、`import`/`export` なしでファイル間参照が成立する（実証済み）。**index.html の読み込み順（utils→my-utils→core→staff→admin→shift→company→my→main）を変えてはいけない**（tests/my.test.js が index.html・package.json の lint 対象・eslint の files の3つを照合する）。新しいコンポーネント・関数は所属に応じたファイルへ追加する。

**従業員画面の2ファイル（2026-10-04・第2部 E0）**: app-my-utils.js は app-utils.js の直後（app-core.js の `parseUrl` が使うので core より前）、
app-my.js は app-company.js の直後・app-main.js の前（App が MyView を描く）。app-my.js のトップレベル即時実行コードから
staff/admin/shift/company の識別子を参照しない（関数の中ならよい＝描画は全ファイルの実行後）。**Stop フックの自動コミットは
7ファイルを名指ししていて app-my-utils.js と app-my.js を含まない**——この2つの変更は自分でコミットすること。

**app-company.js の切り出し（2026-09-30）**: app-admin.js が 50.8 万字になり、Babel Standalone が変換時に
「[BABEL] Note: The code generator has deoptimised the styling of … as it exceeds the max of 500KB.」を console.error で
出していた（本番の利用者のコンソールにも出る）。企業連携タブ一式・SetTab・賃金マスタを**中身を変えずに**移し、
app-admin.js 356,698 字・app-company.js 152,520 字になった（移動は `8d271c8`・参照の追随は `5bdc591`。元の行 4383-4588 と 5239-7201 がバイト一致で移っている）。
AdminView（app-admin.js）が app-company.js のコンポーネントを描けるのは、描画が app-main.js の ReactDOM マウント時＝
全ファイルの実行後だから。**逆に app-admin.js のトップレベル即時実行コード（const の初期化式など）から app-company.js の識別子を
参照してはいけない**（その時点ではまだ未定義）。どのファイルも **40万字を超えたら次の分割を考える**（500,000 字で上の Note が出る）。
回帰スクリプトのハーネス（`mount-component.js`）の既定の読み込みにも app-company.js が入っている。
**Stop フックの自動コミット（`.claude/settings.json`）は app-*.js の7ファイルすべて（utils・core・staff・admin・shift・company・main）を
名指ししている**（2026-10-04 にフックの中身を読んで確認。`d534246`・`3c45a97`・`ea26e73` で app-shift.js が自動コミットされた実績もある）。
main 以外のブランチで `DEV_MODE` が式のままのとき、ターンが終わるたびに7ファイルの変更を `Auto-commit: app-*.js changes` として
コミットし push する。テスト・回帰スクリプト・文書は対象外なので、それらは自分で別のコミットにすること。
`.claude/settings.json` は `.gitignore`（`.claude/*`）でリポジトリに入っていない端末ローカルの設定なので、対象を確かめるときはファイルを直接読む。

**app-shift.js の切り出し（2026-09-30・2回目の分割）**: P3〜P5 の追加で app-admin.js が再び 399,977 字になり、
上の40万字の上限（`example-index-html-load`）まで残り23字になった。シフト作成タブ一式（app-admin.js の 271〜3463 行＝
LEGEND_COLORS・FIXED_ENTRY・FIXED_KEY・HDASH_IMG・HeatTable・SummaryTable・GridLegend・ACT_DIFF_BG・ActualsGrid・
ActualsCsvDialog・ShiftEditTab）を**中身を変えずに**移し、app-admin.js 198,981 字・app-shift.js 201,775 字になった
（移動は `a5d9c3c`・参照の追随は `018ceeb`。移した範囲の sha256 先頭16桁 `b8258275242617e3` が一致）。
この塊を選んだのは、範囲の外から参照される名前が ShiftEditTab（AdminView の描画と app-company.js の一括PDF）と
FIXED_KEY（app-admin.js の expXl の関数本体）の2つだけで、どちらも実行時の参照だから。読み込み時に使うのは
app-utils.js の定数（CELL_COLOR_LEGEND・CELL_COMMANDS）だけなので、admin の直後に置いて問題ない。
**シフト作成タブ（グリッド・ヒートマップ・集計表・実績・PDF）を直すときの編集先は app-shift.js**。
Excel（expXl）・提出一覧・スタッフタブは app-admin.js に残っている。app-shift.js も Stop フックの自動コミットの
対象に入っている（上の段落）。

## ソースファイルの内容

### app-utils.js（純粋関数・Nodeテスト対象）

```js
WD / JH_FIXED / JH_DATES   // 曜日・日本の祝日（2025〜2029。2029 は計算値）
PLAN_LIMITS / PLAN_LABELS  // プラン定義
fd(d) / pd(s) / gd(s,e)    // 日付ユーティリティ
gto() → TO / TO_START      // 時間オプション 0:00〜27:00（15分刻み・連続。翌3:00まで）
sc(cs)                     // 候補時間ソート（closed は末尾）
isHoliday / isWeekendOrHoliday(dateStr) // 土日祝判定
calcNetWorkMinutes / getBreakList / getBreaksFor / getOT // 純勤務時間計算
shiftCutOf                 // 削り（2026-10-05）。スタッフの提出（shift.start/end）から管理者が帯を削った日か。シフト作成タブの「休み・連勤カウント」表の
                           // 「削り（回）」（連勤の下の行・画面と全データPDF）が日数を数える。帯は休みカウントと同じ（出勤セル<17時＝ランチ・退勤セル>17時か締＝ディナー）。
                           // 1日に何帯削っても1回。11〜23→17〜23 は数える。数えない: 手入力だけの日（source:"grid"）・休みコマンドの帯（adminRest）・
                           // ヘルプ（時刻か略称がセルに残る）・帯の移し替え（提出に無い帯を足した日。例 11〜15→17〜23）・同じ帯の中での短縮。回帰は example-shift-cut-count.js
                           // （2026-10-05 本番反映。Chromium と iPhone 13 のエミュレーションで確認・WebKit は未確認）
shiftBandInfo              // ランチ/ディナー帯判定（isBreakEligible は b5e23c1 で廃止。休憩適用は getBreaksFor が時間帯の重なりだけで判定する）
dayTypeOf(dateStr) / POSITION_DAY_TYPES // 祝日をholSat/holSunに分割した5分類。必要ポジション設定タブと breakTimes（休憩時間設定）が共有する（getBreakList が positionDayTypeFor で日付→区分を解決。旧4区分の "hol" データは後方互換で流用）
requiredPositionsFor(settings,dateStr) // 日付に適用する必要ポジション枠。getBreakList と同じ規則で旧 "hol" を流用する（祝日区分に枠が無いときだけ）。分割（1cdcd6b）で移行が無く祝日判定から消えていた枠を拾う（#120）
firebaseKeyForbiddenChars(name)          // Firebaseがキーに使えない文字（. # $ / [ ] 制御文字）の検出。スタッフ名は STAFF_KEYED_SETTING_MAPS の9つの設定マップ（＋overtimeSettings.byStaff）でキーになるため追加・改名の入口で弾く
matchPositionSlots(slots, attendees)    // 必要ポジションと出勤者の最大二部マッチング（Kuhn法・ポジション不足エラー判定＝Premium限定）
genToken() / genSecureId(len)   // ランダムID生成
isSpacer(n) / resolveAlias / buildSuggestList
excludedBandsOf({stM,enM,startNote,endNote,abbrToShop}) // 自店舗のカウントから外す帯（2026-09-28）。x と他店舗ヘルプ略称を h/k と同じ resolveBandValues で
                           // 出勤セル=ランチ帯・退勤セル=ディナー帯・両方=終日に解決する。以前 x だけは日単位（isCountExcluded）で、片側でも終日になっていた。
                           // ヒートマップ・店舗間重複・ポジション判定・セルの赤ハイライトの4箇所がこれを共有する
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
STAFF_KEYED_SETTING_MAPS   // スタッフ名をキーに持つ設定マップ9件の**正本**（+ overtimeSettings.byStaff で計10）。改名（renameStaffInSettings）と削除の後始末（app-admin.js の settingsWithoutStaff）の**両方がここを参照する**。新しいマップを足すときはここに登録し、あわせて PERIOD_SNAPSHOT_SETTING_KEYS にも入れる（入れないと写しの側で改名が届かず #107 が再発する）。一覧を別の場所へ書き写さないこと——tests/core.test.js がドリフトを検出する（#108）
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
LABOR_SYSTEMS / LABOR_SYSTEM_CHOICES / laborSystemChoiceOf / laborSystemOf / laborSystemForStaff / laborSystemRawOf / laborSystemRawForStaff
                           // 労働時間制（A=1か月単位の変形／B=通常／none=旧「判定対象外」の保存値）。**属性単位**で持ち
                           // `staffTypeLimits[属性ID].laborSystem` に入る（2026-09-26・労務判定 第1弾）。
                           // 既定は 社員=A・パート・アルバイト=B・応援・外部（dispatch）/その他=none（DEFAULT_LABOR_SYSTEM_BY_ATTR）。
                           // **null を返したら「区分が空欄か誤り」**＝staffTypeLimits に無い属性か、
                           // custom属性で laborSystem が未設定。組み込みIDは既定が必ず答えるので null にならない
                           // （既存店舗の employee/parttime が一斉に警告になるのを防ぐ）
                           // **保存値 none は 2026-10-03 から B と同じ判定**（ユーザー指示。以前は「判定対象外（応援・外部）」で
                           // 判定・集計から外していた）。laborSystemOf / laborSystemForStaff は none を B に読み替えて**none を返さない**。
                           // 保存値は laborSystemRaw* が返し、使うのは isStaffNumberMissing（none の人には番号の未設定を出さない）だけ。
                           // **選択肢は LABOR_SYSTEM_CHOICES（A・B）だけ**（同日の追加指示）。none は UI から新たに書けず、
                           // 保存値・既定が none の属性は laborSystemChoiceOf が B を選んだ状態で出す（設定タブ・企業の共通設定・企業設定の固定表示）。
                           // LABOR_SYSTEMS・既定・CF の COMPANY_LABOR_SYSTEMS は none を受け付けたまま（データ移行なし・旧クライアントとの互換）
laborSettingsOf / DEFAULT_LABOR_SETTINGS / LABOR_SETTING_RANGES // 労務設定の読み手側フォールバック。**makeSettings は変更していない**。
                           // **DEFAULT_LABOR_SETTINGS に載っていないキーは黙って捨てる**ので、新キーは必ずここに既定値で足す
                           // （COMPANY_LABOR_KEYS は自動で追随、functions/company-config.js の COMPANY_LABOR_KEYS は手で足す＝テストが照合）。
                           // 2026-09-30（P2）に annualScheduledMin:0・rateDenominatorMin:0・weekStartDow:1・weekSplitAtMonthEdge:1 を追加。
                           // 真偽値は 0/1 の数値で持つ。weekStartDow（0〜6）と weekSplitAtMonthEdge（0/1）は範囲外を既定へ倒す（CF も同じ範囲）
weeklyLegalMinFromBase31 / monthlyBaseMin / monthlyGuideMin / monthlyCapMin / laborMonthFrame
                           // A制の月の枠。**31日の総枠だけを手入力**し、週の法定労働時間 W を30分単位に
                           // 丸めて逆算してから各月を FLOOR(W × 暦日数 ÷ 7 × 60, 1) ÷ 60 で出す。
                           // 丸めないと28日の月が 159:59 になり Excel と1分ずれる。週44時間の特例措置対象
                           // 事業場は別トグルを作らず、31日に 194:51 を入れれば W=44h になる
yearDaysOf / monthlyScheduledCapMin     // 年間所定労働時間（P2・2026-09-30）。laborMonthFrame が返す scheduledCapMin（月の所定上限）＝
                           // FLOOR(年間所定 × 暦日数 ÷ その暦年の日数)。2,080h で 31/30/28日・うるう年2月 = 176:39／170:57／159:33／164:48。
                           // **年間所定を設定すると目安（guideMin）は総枠ではなく所定上限から引く**（31日 199h／30日 193h／2月 182h）。
                           // 未設定（0）なら scheduledCapMin=0 で目安も従来どおり総枠から＝S-1 と1分も変わらない。
monthlyCapMinFor           // 月の上限の入口（2026-10-01・ひな型2026-10版との差分 F4）。**年間所定を設定すると上限も所定基準**＝
                           // ROUNDDOWN(所定上限 + 固定残業)（時間未満を切り捨て・ひな型の式）。2,080h で 31/30/29/28日 = 206:00／200:00／194:00／189:00。
                           // 未設定なら従来の monthlyCapMin（総枠 + 固定残業・切り捨てなし＝207:08）と1分も変わらない。
                           // laborMonthFrame の capMin と guideStatusOf の「みなし超」が同じこの関数を通る。総枠（baseMin）は残業予定の基準のまま変えない
                           // weekStartDow・weekSplitAtMonthEdge は**割増の計算（P5）だけ**に効く。既存の週の休み・B制の週40h超は変えていない
weeklyOverMinB / weeklyOverTotalMinB    // B制の週40h超。各日の実働を1日8hで切ってから週で足し40h超だけ取る
isTimeOrderInvalid / TIME_ORDER_ERROR_HINT
                           // 退勤≦出勤の日（BACKLOG #129・案C）。**両側とも入力されている日だけ**が対象で、
                           // 片側セルは補完の領分。`effShiftRangeMin` は「退勤≦出勤」と「片側だけ」の
                           // 両方を null にして区別できないので専用に持つ。入口2つ（applyEditToSubs・
                           // saveAdj）の両方がこれを通る（tests/core.test.js のドリフト検出が守る）
inputCheckOfShift / isStaffNumberMissing
                           // 入力の確認（2026-10-01・ひな型2026-10版との差分 F6）。ひな型が「入力の問題」として要修正にしていた日を、
                           // Shifty は補完（片側だけ）とメモ（読めない文字）で黙って通していたので、労務の確認パネルに並べる。
                           // inputCheckOfShift(shift, abbrToShop) → {oneSided, memoOnly}。oneSided＝出勤だけ／退勤だけの日（空いている側が
                           // 休み希望・半日の休暇・締めの日と、入っている側が応援の指定＝x・店舗略称の日は除く）。memoOnly＝時刻が無く
                           // コマンドでも店舗略称でもない文字だけのセル（例「事務11」。h/k/x 単独・休み・休暇・締め・略称は除く）。
                           // isStaffNumberMissing＝settings.staffNumbers が空か「派遣」（番号欄の文字の話・属性名とは別）。労働時間制の保存値が none の人は常に false（2026-10-03）。
                           // シフト作成タブの laborByStaff が期間の日ごとに通し、
                           // 所属店舗で判定する人（P3.6 の dest）にも①②を出す（この店舗のセルの話なので）
laborFindingDatesLabel / laborWeekDatesLabel / LABOR_FINDING_DATES_MAX
                           // 労務判定の該当日を `（17・22）`、該当週を `（5〜11）` の形でラベルの後ろに足す
                           // （2026-09-26 ユーザー指示）。**日だけを出し月は出さない**——日次の判定は
                           // 選択中の期間で絞られているため（同日の追加指示）。`laborFindingsFor` に
                           // `dayDates`（dayMins・dayOtH と同じ並び）・`weekDates`・`timeErrorDates`・
                           // `breakShortDates` を渡すと出る。**日付を渡したときは件数もその配列から数える**
                           // （同じ問いへの答えを2つ持たない。`*Count` は件数だけを渡す呼び出しとの後方互換）。
                           // **10件で打ち切って残りを「ほかn日」にする**——休憩を1件も設定していない
                           // 店舗では実働6h超の日がすべて該当するので、全部並べると直すべき日が埋もれる
laborFindingsFor / laborFindingLabels / overallVerdictOf
                           // 日次・月次の労務判定（S-4）と総括判定（S-6）。引数はオプションオブジェクト。
                           // laborSystem==="none" は**内部値**で、行き先の店で「所属店舗で判定」する人（P3.6 の dest）を
                           // 労働時間の判定・集計から外す（休憩不足も出さない）。属性の保存値 none は B に読み替え済みでここには来ない。ただし
                           // **「時刻の入力ミス」だけは区分によらず出す**——労務ではなく入力データの誤りのため。
                           // 「入力の確認n日（…）」（key inputCheck・inputCheckDates）も同じく区分によらず出し、「従業員番号が未設定」
                           // （key inputCheckNumber・staffNumberMissing）は A/B の人だけ（2026-10-01・F6）。**どちらも要修正ではない**
                           // （OVERALL_FIX_KEYS・LABOR_DAY_FIX_KEYS に入れない＝総括もセル色も変えない。テストで固定）。
                           // 戻り値は {key,label}。総括判定が key で引くので文字列だけを返す形にしない
excelRound / excelRoundUp / excelRoundDown
                           // Excel の丸め。**Math.round を直接使わない**（負の値で挙動が違う）。
                           // 桁をずらしたあと toPrecision(15) で丸め直し、1.005*100 の取りこぼしも消す
monthlyOvertimeH / prorateOvertimeH     // 月の残業予定と日別の按分（S-2）。**累積の差分**で配るので
                           // 日別の和が月の残業予定と完全に一致する（毎日「実働×比率」を丸めるとずれる）
guideStatusOf              // 目安の4段階（S-6）。みなし超／所定未満／目安未満／OK 上限まで。第5引数に laborMonthFrame の scheduledCapMin を渡すと
                           // （2026-10-01・F4）**「所定未満」は所定上限（176:39）と、「みなし超」は monthlyCapMinFor の上限（206h）と比べる**。
                           // その分岐は差を分のまま取ってから時間に直す（176.65h−176h を浮動小数で引くと ROUNDUP が 0.65 を 0.66 にする）。
                           // 0・省略なら従来どおり総枠（177:08）と 総枠＋固定残業 で比べる。呼び出し元はシフト作成タブ1か所（ドリフト検出テストあり）
AGREEMENT_LEGAL_ITEMS / AGREEMENT_SINGLE_MONTH_CAP_H
                           // 36協定の法定上限の一覧（判定する・しないを含む）。設定画面のチェックリストは
                           // これを自動生成する。単月100h未満と複数月平均80hは**時間外＋法定休日労働**で比べる（2026-09-30・P5。
                           // 以前は休日労働を足していなかった）。laborFindingsFor の monthAgreementH・yearOvertimeMonths の ag
breakModeOf / breakLengthOf / shiftBindingMin / isBreakShort
                           // 休憩方式（band=既定／length）と拘束時間・休憩不足（S-3）。
                           // **長さ方式のしきい値は実働で見る**——S-3 の本文は「拘束>8h→1.0h」だが
                           // 同じ節の表（拘束8.5h→控除0.75h・実働7.75h）は実働基準でしか再現できない。
                           // 労基法34条の「労働時間」も実働なので表を採った
breakLengthRuleOf / breakMinutesOf / breakDecisionOf / heatBreaksFor / lengthBandMismatchOf / lengthBandMismatchText
                           // 店舗別ルール（2026-09-30・P3.5a）。getBreaksFor の優先順は **日別上書き ＞ 長さ ＞ 時間帯**（長さ方式でも、その人の属性の休憩（属性あり）を勤務が丸ごと含む日はそちらが長さより優先＝2026-10-02 ユーザー指示。全属性の休憩は長さ方式では勤務時間に使わない。中休み idleBreak は 2026-10-02 のユーザー指示で機能ごと削除。休憩は前後に勤務がある時間帯にだけ当たる＝時間帯方式の休憩帯で表す。店舗データに残る idleBreak は読まない）。
                           // 長さ方式は breakLength.basis（"work"=実働・既定／"binding"=拘束）と tiers（[{overMin,breakMin,inclusive}]）で段を決め、
                           // tiers が無ければ従来の2段（実働8h超／6h超・しきい値は法定の定数）。
                           // heatBreaksFor はヒートマップが人数から外す休憩の位置（2026-10-02 ユーザー指示）。長さ方式は休憩の時間帯が決まらないので
                           // 属性ありの休憩が当たる人はその帯、それ以外は候補タブの**全属性（タグなし）の**休憩帯を時間帯方式と同じ規則で当てる（勤務時間・休憩の分は getBreaksFor＝長さ方式のまま）。時間帯方式は getBreaksFor と同じ。
                           // lengthBandMismatchOf は長さ方式の休憩（いちばん長い段の分）と候補タブの全属性の休憩帯の合計を日区分ごとに比べ、
                           // 違えば設定タブの休憩の決め方と候補タブの休憩時間設定に確認表示（[data-break-mismatch]・文言は lengthBandMismatchText）を出す（2026-10-02）。
                           // 段の時間と分はすべて店舗の設定で**コードに依頼文の値は無い**。breakDecisionOf は詳細モーダルの「自動（灰）／手動（太字）」と「自動に戻す」の値。
                           // isBreakShort（休憩不足）は法定の基準のまま変えていない
overtimePlanOf / otProrateOf / staffOtProrateOf / dailyOverMinB / dailyOverThresholdOf
                           // 残業予定の日割り（P3.5b）。A制の月の残業予定と日別の按分は overtimePlanOf 1本（画面の表と年の36協定の
                           // liveMonthOtFor が同じ関数を通る）。属性の staffTypeLimits[属性].otProrate={window:"month"|"halfMonth",fixedMin?}
                           // で固定枠を窓（月／半月＝1〜15日・16日〜）ごとに配る（窓の実働が固定枠未満なら実働まで）。未設定・固定枠なしは従来と同じ。
                           // otProrate は COMPANY_LIMIT_KEYS に入る（企業共通・法人でも決められる）。CF の sanitizeOtProrate と一致をテストで照合。
                           // B制は laborSettings.showDailyOverB=1 の店舗だけ、日ごとのしきい値超の合計を「残業予定」の行に出す
                           // （オフの店舗の B制の残業予定は 2026-09-30 の P5 から割増の①＋②を出す）
headcountAtOf / countPresentAt / headcountLabelOf
                           // PDF の曜日の下の「昼n 夜n」（P3.5d・settings.headcountAt）。数える区間はヒートマップの heatData
                           // （応援・x の帯を外した後）で、帯に休暇のある人・0人の側・店休日は出さない。**PDF だけ**（画面・Excel は参照しないことをテストで固定）
LEAVE_TYPES / leaveTypeOf / dayRestKindOf / weekRestStateOf
                           // 休暇種別（公休/有給/慶弔）と週の休み3状態（S-5）＝`休n`／`×休なし`／
                           // `＋休n`（7日揃わない週。2026-09-26 に「要確認」から変更）。**導入前の終日の
                           // 休み希望（旧 y。leaveType なし）は公休として扱う**（データ移行はしない）
SKILLED_WORKER_ATTR_KEYWORD / isSkilledWorkerAttr / skilledWeekRestStateOf / isSkilledWeekRestShort / skilledWeekSidesLabel
                           // 特定技能の週の公休（2026-10-01）。詳細は「特定技能の週の公休」の節。対象の判定は isSkilledWorkerAttr 1本
fiscalYearOf / fiscalYearStartMonthOf / yearLaborSummary / paidLeaveRemaining
                           // 年度（既定4月開始・設定で暦年にできる）の累計と有給残。累計は
                           // **period.laborTotals（凍結時点の値）を優先**するので過去参照が要らない
STAFF_LIMIT_WINDOWS / staffLimitOf / limitStateOf / hasAnyStaffLimit / prorateMonthlyHours / attrMonthFrameOf / attrMonthFrame
                           // 属性別の勤務時間の上限・目安（1日/週/2週間/1ヶ月＋任意日数）。0＝未設定。
                           // **「下限」は 2026-09-28 に「目安」へ改め、何も判定しない**（limitStateOf は "over" だけ。キーは *Min のまま＝移行なし）。
                           // 1ヶ月の上限・目安は入力値を31日の月の値とみなし、労務設定と同じ式（W を30分単位→FLOOR(W×暦日数÷7)）で
                           // 月の暦日数に日割りし、1ヶ月の残業 monthlyOt（時間・日割りしない）を足す（attrMonthFrameOf）。
                           // monthlyOt は企業の共通設定でも決められる（COMPANY_LIMIT_KEYS と CF の COMPANY_LIMIT_NUM_KEYS の両方に登録済み）。
                           // 窓の一覧をここに1本化してある——設定UI・集計表・提出一覧のバッジ・PDFが
                           // 組を書き写すと、項目を足したときにどれかが取り残される
applyCompanySettings / stripCompanySettings / companyControlledKeys / genCompanyAttrId / isCompanyAttrId
                           // 企業設定＞店舗設定の重ね合わせ（App の effectiveSettings で1回だけ）と保存前の剥がし（2026-09-27）。
                           // CF 側の同じ規則は functions/company-config.js にあり、tests/core.test.js が一致を照合する
periodRangeKey / periodRangeLabel / collectPeriodRanges / findShopPeriodByRange
                           // 企業内の期間の対応づけ（"開始日_終了日"）と「2026年10月前半」等の表示名
isValidDateStr / companyDeadlineFor / shopDeadlineFromLink
                           // 企業→店舗の完成シフトの提出期限。period.deadlineDate とは別物。
                           // UI は全店舗共通の日付だけ（店舗別は 2026-09-27 に廃止）。関数は旧データの店舗別も読める
sanitizeMonthlyDeadlineDays / monthlyDeadlineFor / shopDeadlineInfoFromLink
                           // 毎月の固定締切（2026-09-27）。日だけ（1〜31・最大4件・29〜31は短い月の月末）。
                           // 期間の締切＝開始日より前で最も遅い固定日。優先は 期間ごとの日付指定 ＞ 毎月の固定。
                           // CF 側の同じ規則は functions/company-config.js（tests/core.test.js が一致を照合）
homeShopOf / isHelperAt / dupTargetShopsFor
personIndexOfMirror / samePersonRegistrations / personHomeShopOf / helperPersonOf / helperShopSettingsOn / helperWorkOn
otherShopDataOf / helperShopsOf / helperScheduleContext / duplicatePersonCandidates
helperCellDisplay / helperCellFontPx / cellTextEm / HELPER_CELL_MIN_FONT_PX
                           // ヘルプ勤務の表示（2026-10-04・H2）。画面・PDF・Excel が同じ helperCellDisplay を通す（「ヘルプ先勤務の所属店舗への合算」の節のグリッドの項）。
                           // helperCellFontPx は列幅を変えずに合成表示を収めるフォントサイズ（下限 8px）
shiftTableHtmlOf / shiftSheetCellOf / shiftSheetStoredText / shiftSheetHeadcountOf / heatStaffDayEntriesOf
                           // シフト表（2026-10-04）。**PDF の「シフト表」（app-shift.js の buildShiftTableHtml）と従業員画面の「全員のシフト」
                           // （app-my-utils.js の buildMyShiftSheet）が同じこの関数で表を作る**。値を解決する部分（入力中の編集・他店のヘルプ・
                           // ヒートマップ）は呼び出し側に残し、ここは「解決した値 → セル → HTML」だけ。heatStaffDayEntriesOf はシフト作成タブの
                           // heatData の1人1日の区間（片側セルの補完・退勤延長・x と他店の略称の帯・締）で、昼夜の人数もこれを数える。
                           // markName・tags（本人の列の印と data-sheet-* 属性）は従業員画面だけが渡す＝PDF の HTML は共有化の前とバイト一致（実測）
helperDisplayOffOf / isHelperDisplayOff / planHelperDisplayToggle
                           // ヘルプ勤務の自動表示の ON/OFF（2026-10-05・period.helperDisplayOff={名前:true}）。**作成中の期間ごと・スタッフごと・見た目だけ**。
                           // 詳細は「ヘルプ先勤務の所属店舗への合算」の節のグリッドの項の直後
shopAbbr2Of / shopAbbr2Error / SHOP_ABBR2_MAX_LEN
                           // 2セル表示用の店舗略称（settings.shopAbbr2={top,bottom}・H1）。上下が両方揃ったときだけ有効・各2文字・予約語は isReservedShopAbbr。
                           // **表示専用**で abbrToShop（手入力のヘルプコマンド）にも期間の写しにも入れない。otherShopDataOf が abbr2 として読み、helperWorkOn の勤務に載る
                           // ヘルプ先勤務の所属店舗への合算（2026-09-30・P3.6）。詳細は「企業アカウント」の P3.6 の節
COMPANY_ENTITY_ID_RE / COMPANY_SHOP_KINDS / companyEntityIdOfShop / companyShopKindOf / companyEntityList / planLaborToEntities
                           // planLaborToEntities（2026-10-01）は労務判定を企業の共通設定から法人の設定へ移す計画（「法人レイヤー」の節）
                           // 法人レイヤー（2026-09-30・P1）。店舗の法人（割当が無い・消えた法人を指すなら既定の法人）と本部の種別。
                           // CF 側の entityIdOfShop / shopKindOf（functions/company-config.js）と同じ規則で、tests/core.test.js が照合する。
                           // buildCompanyStaffRows は店舗に entityId・kind・coSettings（写しの settings）を持たせると、
                           // **従業員番号でまとめるのを同じ法人の中だけ**にし、行に entityId・isHq を載せる。
                           // 行には賃金の置き場 payShopId・payName（所属店舗に登録されている名前。ヘルプ先だけの人は null）も載る（P6a）
groupStaffRegs / groupStaffRegsWithPeople / PERSON_ID_RE
                           // 企業内の同一人物（2026-09-30・P1b）。groupStaffRegs は buildCompanyStaffRows から切り出した推定
                           // （同じ法人で数字だけの同じ番号＋ヘルプ先の登録）で、**CF の groupStaffRegsCF（functions/company-config.js）と
                           // 同じ規則**（tests/core.test.js が乱数の登録でも照合する）。buildCompanyStaffRows は第4引数 people
                           // （companies/{id}/pub/people）を渡すと保存済みの人物で束ね、推定は**どの人物にもつながっていない登録だけ**に当てる。
                           // 行に personId・links（[{shopId,shopName,name,number}]）が載り、entityId は人物の法人が優先
featureEnabled(kind,{plan,companyLink}) / GATED_FEATURES
                           // 新機能のプランゲートの**1本だけの入口**（2026-09-30・計画書 §3.7・決定6）。法人・所定・確定・実績・賃金・
                           // 従業員画面への公開（myShift・2026-10-04・第2部 E3）は Premium。
                           // 法人プランを足すときはここだけ触る。新しい機能で plan==="premium" を直接書かない
rateDenominatorMinOf / DEFAULT_RATE_DENOMINATOR_MIN / fixedOtAmountOf / hourlyRateOf / payRateBaseYen / minWageCheck
                           // 賃金（P6a）。分母は laborSettings.rateDenominatorMin が正ならその値、0 なら年間所定÷12 を 0.1h（6分）単位で
                           // 切り捨てた値（2,080h → 10398分＝173.3h・P2）、年間所定も無ければ 10398分。
                           // 固定残業代 = 基本給 ÷ 分母(h) × 1.25 × 時間 を1円未満切上げ（213,500→30h で 46,199）。**整数の切上げ除算**で計算する
                           // （浮動小数で割ると割り切れる額が1円増えうる）。最賃比較は月給なら基本給÷分母、時給なら時給（§4.5）
sanitizeWageSettings / minWageOn / MIN_WAGE_MAX_ENTRIES
                           // 法人設定 wageSettings.minWage=[{from,yen}]（最低賃金の履歴）。CF 側の同じ規則は functions/company-config.js
                           // （tests/core.test.js が照合）。**店舗の settings には入らない**（applyCompanySettings は労務と属性だけを重ねる）。
                           // 画面は companyLink.settings.wageSettings を直接読む。その日に効く最賃が無ければ比較を出さない
PREMIUM_RATE_KEYS / LEGAL_PREMIUM_RATES / PREMIUM_RATE_MAX / premiumRatesOf / ROUNDING_RULES / roundingRuleOf / roundYenFrac / DEDUCTION_ROUNDING
wageOf / deductionOf / monthlyPayBreakdown / PAYROLL_COLUMNS / payrollRowValues / payrollCellText / payrollCsvOf
                           // 月次の賃金計算（2026-09-30・P6b・§4.5）。詳細は「月次賃金（P6b）」の節。wageSettings に割増率（法定より下げられない）と
                           // 端数規則（既定 ceil）を足した（sanitizeWageSettings・CF と同じ規則）。額は単価を分数のまま整数で割り項目ごとに丸める
laborReadPeriodIds         // 非表示マウント（一括PDF・企業横断ダッシュボード）が読む提出の期間＝年度の全期間とその前後の週・対象の前後の週（2026-09-30・P7）。
                           // pastSubsLoaded=true で渡すので、読んでいない期間は実働0・全日公休として年の値に入る（「＋」も付かない）。詳細は「企業横断ダッシュボード」の節
agreementYearStatus        // 36協定の年の合計・月45h超の回数・複数月平均の最大の窓（80h以下でも返す）。agreementYearFindings とダッシュボードの「残り」が共有する（P7）
ANNUAL_REST_MIN_DAYS / annualRestStatusOf / monthPeriodProgressOf / monthProgressLabel
dashboardPersonView / dashboardCountsOf / DASHBOARD_COLUMNS / dashboardRowValues / dashboardCellText / dashboardCsvOf
                           // 企業横断ダッシュボード（2026-09-30・P7）。**新しい労務の式は持たない**——ShiftEditTab が返す値の差・残り・件数・CSV だけ。
                           // 年間休日は公休日数を52日と比べ、ok／short（年度末まで数え終えた・残りの日を全部休んでも届かない）／pending（途中）。列は画面と CSV が共有し金額の列を持たない
PAY_TYPES / isPayTypeFixed / defaultPayTypeOf / normalizePayVersion / withFixedOtAmount / applyPayRevision / payVersionOn
                           // 賃金の1版の形。社員（employee）は月給固定（決定17）、企業属性は月給・それ以外は時給が既定。
                           // **改定は版を足す**: 適用開始日を変えた保存は前の版を history へ積み、同じ日のままの保存はその版の訂正
isPeriodConfirmed / isPeriodDelivered / periodStateOf / canConfirmPeriod / periodHistoryList / withPeriodHistory / genPeriodHistoryKey
planPeriodConfirmation / planPeriodUnconfirm / planPeriodDelivery / planLaborMonthManual / aggregateScheduledMonth / isMonthFullyConfirmed
                           // 確定・交付と人×月の所定（2026-09-30・P3）。状態は 未提出→提出済み→確定済み→交付済み（periodStateOf）。
                           // 確定は写しを**確定の瞬間に**書き（終了済みで写しがあればそれを残す）、lockedAt を消し、履歴を1件足し、
                           // その月の所定を aggregateScheduledMonth（laborDayMin と同じ calcNetWorkMinutes 経路）で集計して laborMonths へ書く。
                           // **月が凍結（frozenAt）されるのは、月の全日が期間に入りその月の期間がすべて確定したとき**（半月運用は後半の確定で凍結）。
                           // 手修正した記録（確定値≠auto）は確定し直しても上書きしない。解除は確定・交付を外し、その月の凍結を解く（写しは残す）。
                           // 確定できるのは canConfirmPeriod＝企業に連携した店舗は企業セッション（App の companyInfo の企業が連携先と一致）だけ、
                           // 単独店舗はオーナー（UI だけの制限）。入口はシフト作成タブと提出状況表の2つで、どちらも planPeriodConfirmation を通る
STAFF_KEYED_MONTH_NODES / renameStaffInLaborMonths / dropStaffFromLaborMonths / yearScheduledAverage / fillFixedPattern / isClosedDateOf
                           // 月キー付きの名前ノード（いまは laborMonths だけ）。改名は lm.rename、削除は lm.drop（pay と同じ2つの入口）。
                           // CF の companyRenameStaff も renameStaffLaborMonthsPatch で移す（tests が一致を照合）。
                           // fillFixedPattern は本部店舗の固定勤務パターン（土日祝・閉店日を除き、**何も入っていない日だけ**に入れる）
scheduledDay / resolveActualDay / planActualEdit / actualOf / parseClockInput / minToClock
                           // 実績（2026-09-30・P4・§3.6・§4.1）。scheduledDay は確定シフトのその日（laborDayMin・aggregateScheduledMonth と同じ
                           // calcNetWorkMinutes 経路。endMin は退勤延長を足した後）。resolveActualDay は「actual ?? 確定シフト」の1日
                           // {startMin,endMin,breakMin,workMin,absentMin,isRest,isLegalHoliday,…,segments}＝**P5 の割増はこれだけを入力にする**。
                           // 実績の start/end は主シフトを置き換え（退勤延長は足さない）、締の追加出勤は確定シフトのまま足す。休憩は breakMin があれば
                           // それ、無ければ getBreaksFor で判定し直す。absentMin（遅刻早退）は控除用の値で実働からは引かない。legalHoliday は手動のフラグだけ
                           // （既定の自動判定は P5）。planActualEdit は入力を**確定シフトと違う項目だけ**の記録にし、同じなら null（＝消す）
STAFF_KEYED_PERIOD_NODES / renameStaffInActuals / dropStaffFromActuals
                           // 期間キー付きの名前ノード（いまは actuals だけ）。改名は act.rename、削除は act.drop（lm と同じ2つの入口）、
                           // 期間の削除（savePeriods）でも actuals/{期間ID} を消す。CF の companyRenameStaff も renameStaffActualsPatch で移す
premiumBreakdownOf / legalHolidayDatesOf / nightMinutesOf / nightOverlapMin / premiumWeekStartOf / premiumAgreementH / breakBandsOf
premiumFindingsFor / PREMIUM_FINDING_KEYS / premiumDayInput / premiumMonthDates / premiumMonthOf / premiumRowCell / helperActualDaysOn
                           // 割増の計算（2026-09-30・P5・計画書 §4.1〜§4.4）。入力は resolveActualDay の1日だけ（1分単位）。詳細は「割増の計算（P5）」の節
actualsCsvMappingOf / parseCsvRows / parseCsvDate / planActualsImport / DEFAULT_ACTUALS_CSV_MAPPING
                           // 実績の CSV 取込（P4 後半）。列の位置（1始まり・0=使わない）と見出しの有無は settings.actualsCsv。名前は resolveAlias、
                           // 取り込む先は選択中の期間だけ。打刻の来た日は欠勤を外し、法定休日・遅刻早退・メモは残す。同じ人・同じ日の2行目以降は使わない
STAFF_KEYED_PRIVATE_NODES / renameStaffInPay / dropStaffFromPay
                           // 名前キーの private ノード（いまは pay だけ）。STAFF_KEYED_SETTING_MAPS とは別リスト（settings 配下ではないため）。
                           // 改名（AdminView の onRenameStaff）と削除（settingsWithoutStaff を呼ぶ2か所）が必ず pay.rename / pay.drop を通る
                           // ——tests/core.test.js のドリフト検出が守る。**ノードを足したらここに登録し、改名・削除の両方の入口へ足す**
payCodeHash / sha256HexOfBytes / verifyPayCode / payCodeIdentity / nextPayCodeLockout / payCodeWaitSec / maskYen
                           // 賃金の閲覧パスコード（4桁・画面ロック）。hash = SHA-256(salt+code) の16進で CF の payCodeHashCF と一致（テストで照合）。
                           // **crypto.subtle が無い環境（http の LAN アドレス等）では sha256HexOfBytes に落ちる**——無いまま呼ぶと
                           // パスコードが一切通らなくなる（E2E ハーネスは http 配信なので実際にこれで止まった）。未設定は 0000 を受け付ける
fullViewColW / fullViewFontOf // シフト作成タブの全表示（2026-09-28）。2週間以下の期間で人数が多いときだけ列を横幅に合わせる
                           // （横幅いっぱいに割った列幅が48px以下になる人数から・少人数は39pxのまま・1ヶ月の期間は従来どおり）。
                           // 縦は常に高さいっぱいなので拡大は列幅だけ。列が39pxより細いときは文字も比例して小さくする
findStaffByNumber / mergeStaffMatches
                           // 従業員番号（数字だけ）で企業内の他店舗のスタッフを呼び出す（2026-09-28・スタッフタブの「呼び出す」）。
                           // 完全一致（「012」≠「12」）。同じ人の所属店舗・ヘルプ先の登録は1人にまとめ所属店舗側の属性・所属を採る。
                           // 対象は企業の写しの連携店舗（companyShops）だけで、有給の付与日数は持ち込まない
                           // 所属店舗（staffHomeShop）とヘルプ判定。重複判定の対象店舗は「所属が一致する同名」
// 末尾に module.exports ガード（Nodeテスト用）
```

### app-core.js（ブラウザ依存のグローバル）

```js
const DEV_MODE = location.hostname !== "shiftyshifty.app"; // 12行目・ホスト名で自動判定
FIREBASE_CONFIG_PROD / DEV / FIREBASE_CONFIG
firebaseDB / firebaseAuth / firebaseFunctions / firebaseEnabled
fbPath(shopId, key) / ph(event, props) / dlog(...)  // dlogはDEV_MODE時のみconsole.log
DEV_PLAN_OVERRIDE   // DEV_MODE時のみ ?plan= URLパラメータで上書き
_LA_KEY / _LL_KEY   // ログイン試行ロック（10回・30分・管理者のメールログインと従業員画面のログインで使用。名前空間で分ける）
lg / ls             // localStorage（キーを作る storeKey は app-utils.js）
CK_SHOP / ckStaffKey / SS_* / THEME_KEY / applyTheme // Cookie・セッション・テーマ
ADMIN_SHOPS_LS      // 管理者のセッションで開いている店舗IDの一覧（2026-10-05・ots_adminShops_v1）。Google・メールのログインが無い端末も、
                    // 起動時に Cookie の1店舗だけでなくこの一覧を戻す（cookieFallback・sessionShopIdsToRestore）。書くのは App の effect（店舗が1つ以上・
                    // スタッフURL／#/m/／#/me／デモでは書かない）、消すのはログアウト。権限は従来どおり owners と管理コードで決まる
HOME_ICONS / applyHomeIcon // ホーム画面に追加したときのアイコン（2026-10-05）。スタッフ側の URL（#/s/・#/m/・#/me＝homeIconKindOf）は
                    // favicon-staff-180.png / favicon-staff.svg（管理画面のアイコンのオレンジと白を入れ替えたもの）。読み込み時と hashchange・popstate で切り替える
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
| `view` | "staff"\|"admin" | 現在の画面。タブごとの sessionStorage（`SS_VIEW`）で覚える。**`#/admin`（2026-10-05）で開いたタブはその記憶に関係なく管理者画面から始まる**（`isAdminRouteHash`・`parseUrl` が旧形式のスタッフURL `#/<token>` より先に判定する。後にすると "admin" というトークンのスタッフURLに読まれる）。回帰は `example-admin-route.js` |
| `apid` | string | アクティブ期間ID |
| `urlLocked` | bool | URLにtokenがある場合とスタッフ個別URL（#/m/）の場合true（スタッフ専用モード） |
| `urlResolved` | bool | Phase3完了フラグ |
| `unbound` | bool | 店舗未紐付け状態（ログイン画面を表示） |
| `plan` | "free"\|"pro"\|"premium" | 現在のプラン（デモは常に premium） |
| `planExpiry` | string\|null | プラン有効期限（"YYYY-MM-DD"） |
| `paymentFailed` | bool | 決済失敗フラグ |
| `settings` | Settings | 店舗設定 |
| `periods` | Period[] | 期間一覧（startDate降順ソート済み） |
| `staffList` | string[] | スタッフ名一覧 |
| `subs` | Sub[] | 提出データ一覧 |
| `syncStatus` | "init"\|"online"\|"offline"\|"no_config" | Firebase接続状態 |

主要関数：

| 関数 | 説明 |
|---|---|
| `startSubscriptions(targetSid, shopList)` | Firebase の settings/periods/staff/subs（期間ごとの部分購読）/company と accounts/{sid} の子フィールドをリアルタイム購読開始。Phase1から直接呼ぶ（useEffectに入れると競合） |
| `saveSettings / savePeriods / saveStaff / saveSubs / saveShops` | Firebase + localStorage 二重書きラッパー |
| `fbW(path, val)` | App内の Firebase 書き込みショートハンド |
| `touchLastActivity()` | 最終更新日時を記録（1年未更新店舗の自動削除に使用） |
| `signInWithGoogle() / signInWithEmail() / signUpWithEmail()` | ログイン画面からの認証 |
| `signInAndLinkGoogle() / signInAndLinkEmail()` | Cookie認証中ユーザーが Auth アカウントと店舗を紐付け |
| `linkProvider(type) / unlinkProvider(providerId)` | 既存AuthユーザーにGoogle/メールを追加/解除 |
| `sendEmailOtp() / verifyAndLinkEmail()` | OTP経由メール連携（Cloud Function呼び出し） |
| `doLogout()` | セッションのみクリア（Firebase Auth は維持。明示ログアウトの印 `AUTH_LOGGED_OUT_LS` は立てない＝リロードで実ユーザーが復元される） |
| `doFullSignOut()` | Firebase Auth 含む完全サインアウト（`AUTH_LOGGED_OUT_LS` を立てる＝次の起動で実ユーザーを復元しない） |
| ~~`generateInviteCode()` / `joinByInviteCode(code)`~~ | **どちらもコード上に存在しない**。2026-07-08 の CompanyTab 新設で企業コード＋パスワード方式に置き換わり、残っていた `generateInviteCode` の定義も 2026-08-24 に削除済み（`8384467`） |
| `applyInviteCode()` | 管理コード（`shopId.adminKey`）で端末を店舗の管理者に登録して入る（2026-10-08 に店舗IDだけの参加は廃止） |
| `verifyAdminCode(raw, expectShopId?)` | 管理コードの照合の1本だけの入口（2026-10-08）。店舗IDだけ・形の不正・別の店舗のコードを拒否し、`owners/{uid}` への書き込み（ルールが `private/adminKey` との一致を要求）で照合する。ログイン画面・店舗メニューの「管理コードで追加」・管理コードの入力画面の3か所が通る |
| `createNewShop()` | 新規店舗作成（global/shops に追加） |
| `linkExistingShopToAuth(shopId)` | 既存店舗を Auth UIDに紐付け |
| `unlinkShopFromAuth(targetShopId)` | 企業アカウントから店舗の紐付けを解除 |
| `refreshAuthUser()` | authUser.providerData を最新状態にリフレッシュ |

### 3フェーズ初期化

```
Phase1 (useEffect[]) — Firebase初期化 → onAuthStateChanged → loadShops()
  → #/demo:          デモ店舗（DEMO_SHOP_ID）を直キー読み → 管理者画面
  → #/me:            店舗を読まずに従業員画面（MyView）
  → #/m/<pageToken>: staffPageTokens/{pageToken} → global/shops/{shopId} 直キー読み → startSubscriptions()（MyPageView）
  → URLトークンあり: tokens/{token} をO(1)読み → global/shops/{shopId} 直キー読み → startSubscriptions()
  → Auth済み:        accounts/{uid}/shops → 各shopIdを直キー読み → setAllLinkedShops → startSubscriptions()
                     （企業コードのセッション uid=company_… は companies/{id}/pub/shops を読む）
  → Cookie:          CK_SHOP → global/shops/{ckId} 直キー読み → startSubscriptions()
  → なし:            setUnbound(true) → ログイン画面
  ※ global/shops の全件読みはセキュリティルールで拒否される（一覧の公開廃止・直キー読みのみ）

Phase2 (startSubscriptions関数) — sid確定後にuseEffectを経由せず直接呼ぶ
  → shops/{sid}/settings, periods, staff, subs（直近3ヶ月の期間ごとに orderByChild("periodId")）, company（企業設定の写し）
    （templates は 2026-09-28 に購読を撤去）
  → accounts/{sid}/plan, planExpiry, paymentFailed, cancelAtPeriodEnd, currentPeriodEnd, scheduledPlan, scheduledPlanDate,
    billingExempt を子フィールドごとに購読（accounts/{sid} 自体は .read:false）

Phase3 (useEffect[ready, periods, urlResolved]) — URLなし時のapid初期化
  → sessionStorage復元 or periods[0]（最新期間）
```

**tokens逆引きインデックス**: `tokens/{urlToken} = {shopId, periodId}`。期間の作成/削除時（savePeriods）に書き込み・削除され、既存期間は管理者セッションのlazy backfill（App内useEffect）が冪等に補完する。スタッフURLはこのインデックスで解決される。
**補完はサーバーに同じ値がある token を書かない（2026-10-04）**。以前の補完は periods が変わるたびに（label だけでなく、
シフト作成タブが自動で書く snapshot・laborTotals でも）全期間の tokens を同じ値で書き直していた。いまは app-main.js の
`tokensSyncedRef`（店舗ごとに「確かめた token → shopId/periodId」）を見て、確かめていない token だけを1回 `once` で読み、
無いか値が違うときだけ書く。savePeriods が書いた token・消した token もこの ref に記録する（新規期間を二重に書かない）。
動くのは **claim が通った店舗（`ownerClaimedSid===sid`）だけ**で、オーナーでない端末からは拒否される書き込みを投げない。
読めなかった token は次の periods の変化で読み直し、書き込みが拒否された token はそのセッションでは繰り返さない。
回帰は `example-tokens-backfill.js`（修正前は書き込み45件・修正後6件）。

**重要**: `startSubscriptions` は `useCallback` で定義してあるが、`useEffect([ready, sid])` に依存させてはいけない。React のバッチ処理で sid/ready の更新タイミングがズレて競合が発生する。Phase1内から直接呼ぶこと。

---

## コンポーネント一覧

| コンポーネント | ファイル | 役割 |
|---|---|---|
| `App()` | app-main.js | メインアプリ・3フェーズ初期化・全 state 管理・ReactDOMマウント |
| `ShiftyIcon` | app-staff.js | アプリアイコンSVG（全画面共通） |
| `MyView` | app-my.js | 従業員画面（#/me・募集URLの「マイシフト」）。マイシフト／給料／設定の下部タブ・アカウントの登録とログイン |
| `MyPageView` | app-my.js | スタッフ個別URL（#/m/<pageToken>）の画面。マイシフト／提出／給料／設定の下部タブ |
| `StaffPageEditSection / StaffPageRequestsCard / StaffLinkEditSection / StaffLinkRequestsCard` | app-my.js | スタッフタブで描く管理者側の部品（専用URLの発行・申請の承認・リンクの解除。個人リンクコードは 2026-10-05 に機能ごと削除した） |
| `StaffView` | app-staff.js | スタッフのシフト提出画面 |
| `StaffHdr` | app-staff.js | スタッフ画面ヘッダー（期間選択） |
| `CellEditPanel` | app-staff.js | 提出状況ビュー内のセル編集（既存データを初期値） |
| `SmModal` | app-staff.js | 提出状況一覧（名前列固定・日付横スクロール） |
| `AdminView` | app-admin.js | 管理者画面（タブ切り替え） |
| `ShiftEditTab` | app-shift.js | シフト作成グリッド・ヒートマップ・集計・PDF出力（Premium） |
| `ActualsGrid / ActualsCsvDialog` | app-shift.js | 実績の入力（P4）。シフト作成タブの「実績」切替（確定済みの期間・オーナーの端末だけ）で ShiftEditTab のグリッドと差し替わる |
| `PeriodsTab` | app-admin.js | 期間管理・URL シェア |
| `PEF` | app-admin.js | 期間編集フォーム |
| `expXl()` | app-admin.js | ExcelJS による Excel 生成 |
| `StaffTab` | app-admin.js | スタッフ登録・並べ替え・別名設定 |
| `CandTab` | app-admin.js | 候補時間・休業日・休憩管理 |
| `SubsTab` | app-admin.js | 提出一覧・セル編集・変更履歴 |
| `CompanyTab` | app-company.js | 企業連携。カードの並びは シフトの提出状況 → 企業内登録スタッフ → 企業横断ダッシュボード → 企業アカウント → 連携店舗 → 法人 → 企業の共通設定（2026-09-28・法人とダッシュボードは 2026-09-30） |
| `CompanyEntityCard / EntityFilter / CoLaborFields` | app-company.js | 法人（2026-09-30・P1）。法人の追加・改名・法人の労務設定・店舗の法人と種別（店舗／本部）を CF（App の `callCompanyCF`）で書く。法人の無い企業ではカードが `ensureCompanyEntities` を1回呼んで移行する。`EntityFilter` は法人が2つ以上のときだけ出る絞り込み（提出状況・企業内登録スタッフ）。`CoLaborFields` は法人の設定の労務判定の入力欄（2026-10-01 に企業の共通設定からは外した。空欄＝店舗の設定） |
| `CompanyStaffCard / CompanyStaffDirectory` | app-company.js | 企業内登録スタッフ（2026-09-28・Premium）。カードの「一覧を開く」で AdminView の `fullPage` が管理者画面の中身を差し替える（新しいブラウザタブは使わない。入れた当時の理由は「実ログインは永続化しない」だったが、いまは実ログインも LOCAL で永続化している＝その理由は当たらない。同じタブで差し替える形はそのまま）。従業員番号順（既定・**法人に関係なく番号だけで並べ、見出しを出さない**）／法人別（法人が2つ以上のときだけ出る。法人 → 本部 → 番号）／店舗別（法人 → 本部 → 所属店舗 → 番号）・番号と名前で検索（並びの3つは 2026-10-02 ユーザー指示）。載せるのは店舗依存でない情報（番号・属性・所属店舗・有給の付与と残）だけ。計算は `buildCompanyStaffRows`（有給は所属店舗の `laborTotals` だけ・subs は読まない・凍結値の無い期間があれば残に「＋」）。**数字だけの同じ従業員番号は1行にまとめ**（2026-09-29）、名前は空白を除いて最も長い表記＝フルネームに寄せ、所属店舗は全部並べる。フルネームに含まれない別の名前（番号が同じなのに名前が食い違う）は「別の登録名」として残す。店舗タブの「呼び出す」（`mergeStaffMatches`）は名前でまとめるので、こちらの規則とは別。上部の並びは「従業員番号順」「法人別」「店舗別」「パスコード」（2026-09-30・P6a。法人別は 2026-10-02）で、「賃金」列は企業のパスコードで解除するまで「••••」。**行は人物ID（P1b）で束ね**、開いたときに未リンクの登録があれば CF `ensureCompanyPeople` を1回呼ぶ。「編集」は右端の列（2026-09-30 に一度名前の右へ移したが、ユーザー指示で右端へ戻した。375px では表の枠の中で横スクロールする＝承知のうえ）。PC で表が横スクロールしないよう、一覧の外枠は `maxWidth:1280`（ヘッダーと本文の2か所を同じ値。900 だと長いフルネーム・別の登録名・賃金列で横スクロールした・回帰 `pcNoScroll`）。番号の前のチェックで2人を選んで「同一人物として統合」。別法人と番号が重なる行には「番号 X は◯◯法人でも使われています」。**先頭に「重複候補」**（同じ名前が2店舗以上にあって人物が別・`duplicatePersonCandidates`・P3.6）を出し「統合」で統合モーダルを開く。同名の別人（外国人スタッフの略称・スポットワークの登録名など）は「統合しない」で別人と記録し、候補に出さない（取消は「編集」の「統合しない相手」の「取消」）。2店舗以上に登録があって所属店舗が明示されていない行と候補の側に「所属店舗を設定してください」（ヘルプ先の勤務の合算先が決まらないため） |
| `CompanyPersonEditModal / CompanyPersonMergeModal` | app-company.js | 企業内登録スタッフの編集（2026-09-30・P1b）。**保存ボタンは1つ**（2026-10-02 ユーザー指示で「名前を変更」ボタンを外した）で、`companyUpdateStaff`（番号・法人・属性・所属店舗）→ `companyRenameStaff`（名前）の順に送る（前者は送り直しても同じ結果・後者は2回目が拒否されるため。前者が拒否されたら名前は送らずモーダルに理由。前者が一部の店舗で失敗（failed）したときも名前は送らず、失敗をモーダルに残す＝2026-10-02・バグチェック#160。途中の成功では一覧を読み直さず、閉じるときに読み直す）。名前の変更（店舗ごとにチェック・CF `companyRenameStaff`。**いまの登録名が新しい名前と同じ店舗は送らない**＝CF は1店舗でも「名前が変わっていません」なら全体を拒否するため・2026-10-01 に本番で実害）・番号/法人/属性/所属店舗（`companyUpdateStaff`・属性と所属店舗はつながっている全店舗に同じ値）・統合の解除（店舗ごとに「切り出す」＝`splitPerson`）・「ID を番号に振り直す」（`reassignPersonId`・番号が数字だけで ID と違うときだけ）。統合は残す方（番号・法人・所属）を選ぶ（`mergePeople`）。編集・統合モーダルの結果（拒否の「✕ 理由」）は**モーダルの中**に出す（`CompanyModalMsg`。一覧の帯はモーダルの覆いの下で見えない）。結果は一覧の上に出す（全画面なので AdminView のトーストは出ない） |
| `StaffPayPage` | app-company.js | 賃金設定ページ（2026-09-30・P6a・Premium・オーナー）。スタッフタブ → 編集 → 「賃金設定を開く →」で AdminView の `fullPage={kind:"staffPay",name}` が管理者画面を差し替える（`CompanyStaffDirectory` と同じ方式）。「← 戻る」で編集モーダルを開き直す（`returnEdit` → StaffTab の `initialEditKey`）。**所属店舗のスタッフだけ**編集でき、ヘルプの人は編集モーダルで「賃金は所属店舗（◯◯）で設定します」。保存先は `shops/{sid}/private/pay/{名前}`（`applyPayRevision` を通す） |
| `PayCodeBox / PayCodeChangeModal / PAY_OFF` | app-company.js | 賃金の閲覧パスコード（P6a）。ボックスはスタッフタブの「スタッフ登録」の横・`StaffPayPage` の上部・企業内登録スタッフの上部（従業員番号順・店舗別の次）。「初期パスコードのままです」の注意は 2026-10-01 のユーザー指示で出さない。変更は「現在の番号 → 新しい番号を2回」で、失敗の理由はモーダルの中にも出す（全画面の企業内登録スタッフではトーストが見えないため）。企業内登録スタッフの箱にも「変更」がある（2026-10-01・企業アカウントのカードと同じ `companyPayCodeSubmit` で CF `setCompanyPayCode` を呼ぶ）。解除前は金額を「••••」にして編集させない（時間と最賃の可否は伏せない）。`PAY_OFF` は pay を持たない呼び出し元の既定値 |
| `PayrollPage` | app-company.js | 月次賃金（2026-09-30・P6b・Premium・オーナー）。AdminView の `fullPage={kind:"payroll",shopId?,shopName?}`。入口はスタッフタブの「スタッフ登録」の横の「月次賃金 →」（自店・`pay.enabled`）と企業連携タブの法人カードの「月次賃金: 店舗 →」（法人 → 店舗）。対象店舗の ShiftEditTab を画面外へマウントし `exportJob.kind="payroll"` で時間を受け取る。人×項目の表と CSV（パスコード解除後だけ） |
| `CompanyDashboardCard` | app-company.js | 企業横断ダッシュボード（2026-09-30・P7・Premium・企業セッション）。企業連携タブの「企業内登録スタッフ」の下。月と法人を選んで「集計する」→ 連携店舗ごとに ShiftEditTab を画面外へマウントし `exportJob.kind="dashboard"` で人ごとの当月と年の値を受け取る。法人→店舗（確定・交付の進捗と件数）→人（開閉）の表と CSV |
| `SetTab` | app-company.js | 設定（管理コード・属性別制限・退勤延長・Excel・期間単位・テーマ・アカウント連携） |
| `MyPageTab` | app-admin.js | マイページ（プラン確認・アップグレード・利用規約） |
| `TermsModal` | app-admin.js | 利用規約全文モーダル（`TERMS_TEXT` 定数を表示） |
| `UpgradeModal` | app-admin.js | アップグレード促進モーダル（Stripe Checkout 呼び出し） |
| `GridLegend / HeatTable / SummaryTable` | app-shift.js | シフト作成タブの操作説明レジェンド・ヒートマップ表・集計表 |
| `AC / AL / AT / CL` | app-admin.js | 汎用UIパーツ（カード・ラベル・タイトル・候補リスト） |

※ 管理者パスワード認証（AdminLogin）は廃止・削除済み。管理者権限は2026-07-07から**管理キー（adminKey）方式**: `shops/{shopId}/owners/{uid}` に登録された端末のみ管理系パスに書き込める。端末追加は管理コード（`shopId.adminKey`）をログイン画面の「管理コードで参加」か店舗メニューの「管理コードで追加」に入力する。**2026-10-08 に店舗ID（旧「店舗コード」）だけでの参加・追加・企業連携を廃止した**。管理者として登録されていない端末には管理者画面（以前の「閲覧専用」表示を含む）を描かず、管理コードの入力画面（app-main.js の `AdminCodeGate`・`[data-admin-code-gate]`）を出す。claim の結果が出るまでは、端末にその店舗の管理キーがあれば管理者画面（オフラインでも開ける）、無ければ「管理者の確認中」（`claimDoneSid`）。デモと Firebase 未接続では出さない。回帰は `example-admin-code-only.js`（スタブの `ownerRules` で owners の規則を真似る）。

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
│       ├── templates  ← 旧・曜日別候補テンプレート。**2026-09-28 に UI・購読・保存を撤去**（機能していなかったため）。
│       │                 ノードとルールは残置（ルールのデプロイを避ける）。クライアントはもう読み書きしない
│       ├── lastActivity ← ISO文字列（CFの1年未更新アーカイブ判定に使用）
│       ├── subs/      ← 提出データ {subId: subObj}（書き込みは.validateで形状検証・auth必須）
│       ├── owners/    ← {uid: adminKey} 管理者登録（自uid追加はadminKey照合が必要・読みはオーナーのみ）
│       ├── laborMonths/{YYYY-MM}/{名前} ← 人×月の所定 {days, min, auto:{days,min}, frozenAt?, frozenBy?}（2026-09-30・P3）。
│       │                 **読み書きともオーナーのみ**（所定は個人の労働条件）。確定で自動集計・凍結、確定前は手修正（10月分の遡り登録も）。
│       │                 名前キー＝改名・削除の後始末は STAFF_KEYED_MONTH_NODES
│       ├── actuals/{期間ID}/{名前}/{YYYY-MM-DD} ← 実績（2026-09-30・P4）{start?, end?, breakMin?, absent?, absentMin?, legalHoliday?, note?}。
│       │                 **確定シフトと違う項目だけ**を持つ（未入力＝確定シフトが実績）。subs には書かない。読み書きともオーナーのみ・
│       │                 .validate で項目の形（start/end は HH:MM で 30:00 まで・分は 0〜1440・真偽・メモ200字・他の項目は拒否）。
│       │                 名前キー＝改名・削除の後始末は STAFF_KEYED_PERIOD_NODES。期間の削除と purgeOldPeriods で一緒に消す
│       ├── company    ← 企業設定の写し（2026-09-27）{id, name, entityId?, entityName?, kind, settings, deadlines:{期間キー:日付}, shops:{shopId:店舗名},
│       │                 people?:{personId:{shopId:登録名}}, shopEntities?:{shopId:法人ID}, syncedAt}。
│       │                 settings は「企業共通 → 法人」を CF が重ねた値。entityId/entityName/kind は 2026-09-30（P1）から。
│       │                 people / shopEntities は 2026-09-30（P3.6）から＝人物の正本 companies/{id}/pub/people は企業コードのログインと
│       │                 作成者しか読めないので、店長のセッションがヘルプ先勤務の合算で同一人物を引くためにここへ焼く
│       │                 **CF（syncCompanyMirror）だけが書く**（.write:false）・読みは auth != null。
│       │                 無い＝企業に連携していない。店舗側の企業機能（設定の重ね合わせ・提出ボタン・提出期限・所属店舗の選択肢）はこれだけを見る
│       ├── linkRequests/{uid} ← 従業員画面のリンク申請（2026-10-04・第2部 E2）{displayName, number?, at}。書きは本人でメールのある認証
│       │                 （auth.token.email != null・global/shops に店舗があること・デモ店舗は不可）、読みはオーナーと本人、消すのは本人かオーナー（却下）
│       ├── staffLinks/{uid} ← 紐付け（E2）{name, personId?, method: "number"|"name"|"code"|"page", at}。**名前の正本**。作るのは Cloud Functions だけ。
│       │                 オーナーは削除と `name` の書き換えだけできる（改名・削除の追随をクライアントからも書けるように）。読みはオーナーと本人
│       ├── staffPages/{pageToken} ← スタッフ個別URL（2026-10-04）{status:"pending"|"approved"|"rejected"|"revoked", displayName, number?, requestedAt,
│       │                 name?, approvedAt?, byUid?, revokedAt?, pinResetAt?}。**name（スタッフ一覧の名前）が正本**。申請は誰でも（pending を作るだけ・
│       │                 name 等のオーナーの項目は書けない・pending の取り下げだけ可）、承認・却下・取り消し・改名・暗証番号のリセットはオーナーだけ。
│       │                 一覧の読みはオーナー、1件は pageToken を知っていれば読める（auth != null）。デモ店舗は不可
│       └── private/     ← 読みはオーナーのみ（配下すべて）
│           ├── adminKey ← 管理キー（32桁）
│           ├── pay/{名前} ← 賃金マスタ（2026-09-30・P6a）。書きもオーナーのみ・.validate で payType（monthly|hourly）と base（数値）必須。
│           │                **給与は settings（auth != null で誰でも読める）に絶対に置かない**。期間の写しにも入れない。
│           │                置き場は所属店舗。改名・削除の後始末は STAFF_KEYED_PRIVATE_NODES
│           └── payCode  ← 賃金の閲覧パスコード {hash, salt, updatedAt}（P6a）。書きもオーナーのみ。企業連携店舗は CF が企業のものを同期
├── archived/
│   └── shops/{shopId} ← purgeInactiveShops が退避した店舗（30日猶予後に本削除）
├── accounts/
│   └── {shopId}/            ← プラン管理（shopId単位）
│       ├── plan             = "free" | "pro" | "premium"
│       ├── planExpiry       = "YYYY-MM-DD"
│       ├── stripeCustomerId ← Stripe Customer Portal 用
│       ├── paymentFailed    = true（決済失敗時）
│       ├── cancelAtPeriodEnd / currentPeriodEnd / scheduledPlan / scheduledPlanDate ← Stripe Webhook（CF）だけが書く・読みは auth != null
│       ├── billingExempt    = true（手動で有料プランにしている店舗・2026-08-31。クライアントからは書けない・読みは auth != null）
│       └── stripeSubscriptionId ← CF だけ（ルールで読み書きとも不可）
│   └── {uid}/               ← Firebase Auth UIDで複数店舗管理（本人のみ読み書き可）
│       ├── shops            ← {shopId: true} 紐付けマップ
│       └── company          ← {companyId, code, name}（createCompany・renameCompany が書く・本人だけ読める）
│                              ※ inviteCode / members は旧・招待コード方式のもので 2026-08-24 に削除済み（8384467）
├── email_otps/
│   └── {uid}            ← {code, email, emailLink, expiry, attempts}（OTP・5回失敗で無効化）
├── users/
│   └── {uid}/           ← 従業員画面のスタッフアカウント（2026-10-04・第2部 E1）。**読みは本人だけ**（auth.uid === $uid）
│       ├── profile      ← {displayName, number?, updatedAt}。書きは本人で**メールのある認証**だけ（auth.token.email != null＝匿名のままの uid は不可）。
│       │                  同じ users/{uid} の下に links・seen・workplaces・shifts・overrides・goals・actuals がある（計画書 E.4）。
│       │                  **ルールは本番反映済み（2026-10-04）**
│       ├── links/{shopId} ← 本人の紐付けの索引（E2）{name, personId?, at}。**Cloud Functions だけが書く**（ルールに書き込みが無い）。
│       │                  name は紐付けた時点の写しで、オーナーの端末の改名では書き換わらない——名前は shops/{sid}/staffLinks/{uid}.name を正とする
│       ├── seen/{shopId}/{periodId} ← マイシフトで最後に見た公開内容（E3）{at, days?:{日付: 指紋}}。書きは本人でメールのある認証だけ・
│       │                  days のキーは日付・値は40字以内。「変更あり」の判定に使う（myChangedDates）
│       ├── workplaces/{id} ← 勤務先（E4）{kind:"shifty"|"manual", color, name?, shopId?}。Shifty の店舗は id＝shopId（name は本人の表示名・無ければ店舗名）、
│       │                  手入力は id＝"m_"+英数字8桁（name 必須・shopId なし）。**書くのは update だけ**（E5 が同じレコードに pay を足す）。
│       │                  紐付けが外れても残す（給料設定を消さない）。pay の子のルールは E5 で足した（下の workplaces/{id}/pay）
│       ├── shifts/{id}  ← 手入力の勤務先のシフト（E4）{workplaceId(m_…), date, start, end, breakMin, memo?}。id＝"h_"+英数字10桁。時刻は "HH:MM"（30:00 まで）
│       ├── overrides/{shopId}/{date} ← 公開済みの Shifty のシフトへの本人の実績（E4）{start, end, breakMin}。本人の画面と給料計算にだけ効く（店舗には送らない）。
│       │                  workplaces・shifts・overrides の書きは本人でメールのある認証だけ・形の検証・未知のキーは拒否
│       ├── workplaces/{id}/pay ← 本人の給料設定（E5）{closingDay, payMonthOffset, payDay, holidayRule, wageType?, rate?, commute?:{amount,per}, night?, over8?, updatedAt}。
│       │                  締日・給料日の 31 は「末日」。night・over8（深夜25%・8h超25%）は手入力の勤務先だけ。勤務先の名前・色と同じ update で書く
│       ├── goals        ← 月間目標（E5）{monthly(円), updatedAt}
│       └── actuals/{支給月 YYYY-MM}/{勤務先ID} ← 振込額（E5・本人の手入力・円）。**店舗の shops/{sid}/actuals（打刻の実績・P4）とは別物**で、コードでは「振込額」（received）と呼ぶ。
│                          pay・goals・actuals の書きも本人でメールのある認証だけ・形の検証
├── companies/
│   └── {companyId}/     ← 企業アカウント（CompanyTab・企業コード＋パスワード方式。作成者本人の accounts/{uid}/company＝{companyId, code, name} は createCompany が書く写し）
│       ├── pub          ← {name, ownerUid, shops:{shopId:true}}（連携店舗マップ）
│       │   ├── entities/{entityId} ← 法人 {name, createdAt, settings?:{laborSettings?, staffTypeLimits?, wageSettings?}}（2026-09-30・P1・CF だけが書く。wageSettings は P6a）
│       │   ├── shopEntities/{shopId} ← その店舗の法人ID（無い・消えた法人なら defaultEntityId の法人）
│       │   ├── defaultEntityId       ← 既定の法人（移行で企業名と同名の法人を作ってここに置く）
│       │   ├── shopKinds/{shopId}    ← "hq"＝本部店舗（無ければ通常の店舗）。**正本はここ**。global/shops/{sid}/kind にも
│       │   │                            写すが、クライアントの saveShops が店舗オブジェクトを丸ごと set() するので消えうる
│       │   ├── people/{personId} ← 人物（2026-09-30・P1b・CF だけが書く・読みは pub のルールのまま＝企業uidと作成者）
│       │   │                          {displayName, entityId?, number?, links:{shopId: 登録名}, createdAt, updatedAt, mergedFrom?:{personId: 日時},
│       │   │                           distinct?:{personId: 日時}（「統合しない」と記録した相手・両方向・2026-09-30）}。
│       │   │                          personId は数字だけの従業員番号（1〜20桁）か p_+英数字8桁。**作成後は変えない**（振り直しは明示操作だけ）
│       │   └── config   ← 企業の共通設定の正本（2026-09-27・CF saveCompanyConfig だけが書く）
│       │                   {settings:{laborSettings?, staffTypeLimits?}, deadlines:{期間キー:{all?, shops?:{shopId:日付}}},
│       │                    monthlyDeadlineDays?:[日], updatedAt}
│       ├── private/payCode ← 企業の賃金閲覧パスコード {hash, salt, updatedAt}（2026-09-30・P6a・CF setCompanyPayCode だけが書く）。
│       │                     読みは企業uidと作成者だけ（private の他は閉じたまま）。連携全店舗の shops/{sid}/private/payCode に同じ値を書く
│       ├── grants/{shopId}/{uid} ← claimCompanyShop が企業経由で与えたオーナー権限の台帳。
│       │                            解除時にここに載ったuidだけを owners から外す（元からの
│       │                            オーナーは載せない＝巻き添えにしない）。**ルールを持たない
│       │                            ＝クライアントからは読み書きできないCF専用パス**
│       └── private/passwordHash ← パスワードハッシュ（Cloud Functions経由のみ）
├── companyCodes/
│   └── {code}           ← companyId（企業コードの逆引き。companyLoginでカスタムトークン発行に使用）
├── staffPageTokens/{pageToken} ← 個別URLの逆引き（2026-10-04）{shopId, at}。直キー読みだけ（一覧は不可）。**作成後は書き換えられない**
│                          （URL を別の店舗へ付け替えさせない）・消せるのはその店舗のオーナー。token は英数字24文字（genMyPageToken）
├── staffPageData/{pageToken}/ ← 個別URLの本人のデータ（2026-10-04）。workplaces・shifts・overrides・goals・actuals・seen を users/{uid} と**同じ形**で持つ
│                          （tests/my.test.js が形の一致を照合）。読み書きは「その token の staffPages が approved の間」だけで、**token を知る人なら誰でも**
├── staffPagePins/{pageToken} ← 個別URLの給料の暗証番号 {hash, salt, setAt, fails, lockedUntil}（2026-10-04）。CF myPagePin だけ（ルールで読み書きとも不可）
├── staffPageEmails/{pageToken} ← 個別URLをなくしたとき用のメールアドレス（2026-10-05）{email, key, setAt, sentAt?}。CF setPageEmail・recoverPageUrl だけが書く
│                          （ルールで読み書きとも不可）。クライアントへは登録の有無と伏せたアドレスしか返さない
├── staffPageEmailIndex/{key}/{pageToken} = true ← アドレスからの逆引き（key＝正規化したアドレスの SHA-256）。CF だけ
├── （通知の購読・2026-10-08）staffPageData/{token}/push/{key}・users/{uid}/push/{key}・shops/{sid}/private/push/{key}
│                          ← {endpoint, keys:{p256dh,auth}, at, ua?}（管理者の記録は uid も必須＝書いた本人の uid）。key は endpoint の SHA-256 の先頭32桁。
│                          **endpoint はブラウザの Push サービスだけ**（FCM・Apple・Mozilla・WNS。ルールと CF の `PUSH_ENDPOINT_RE` が同じ・テストで照合）
├── notifyRate/submit_{shopId} ← 提出の通知の1時間あたりの回数（CF だけ・ルールに無い）
├── staffPageEmailRate/{種類}_{鍵} ← 送信回数の制限 {count, windowStart}（同じ URL・同じアドレス・同じ呼び出し元の単位）。CF だけ
└── （削除済み）staffLinkCodes・staffLinkCodeIndex・staffLinkCodeAttempts ← 個人リンクコード（E2）の置き場。2026-10-05 に機能ごと削除した
                           （CF・ルール・画面とも無い。ルールに無い＝クライアントからは読み書きできない）。本番に残っている値は purgeInactiveShops が丸ごと消す
```

**セキュリティモデル（2026-07-07改修・フェーズB）**: 「Anonymous Auth必須 + オーナー権限分離（管理キー方式）」。
- 全クライアントは起動時に `signInAnonymously()`（LOCAL永続化・端末ごとにuid安定）。**全ルールが `auth != null` 必須**のため未認証RESTは全拒否。
- **実ログイン（Google・メール・企業コードのカスタムトークン）も LOCAL で永続化する**（2026-07-07 `96e5fa0` から。Phase1 の `setPersistence(LOCAL)` と、
  サインイン直前の `_preRealSignIn` がどちらも LOCAL。以前の「サインイン直前に NONE へ切替」は廃止済みで、コードに NONE・SESSION は1か所も無い）。
  リロード後も複数店舗のログイン状態が残る。「新しい端末で勝手にログイン状態になる」旧バグの再発防止は、永続化の切替ではなく
  **明示ログアウトの印** `AUTH_LOGGED_OUT_LS`（`ots_authLoggedOut_v1`・localStorage）で行う: `doFullSignOut` が true にし、Phase1 は印のある端末で
  復元された実ユーザーを signOut して匿名に入り直す（`adminBranch`）。実ログインの成立（Google・メール・企業コード・店舗選択でのセッション再開）で false に戻す。
  `doLogout`（店舗セッションだけのログアウト）は印を立てない（`43166ab` で外した）＝リロードで実ユーザーが復元され店舗に戻る。
  スタッフアカウント（従業員画面）にはこの印を当てない（「従業員画面」の節）。app-core.js の `AUTH_LOGGED_OUT_LS` の上のコメントと app-main.js の Phase1 のコメントも
  2026-10-04 に実装へ合わせた（立てるのは doFullSignOut だけ）
- 管理系パス（settings/periods/staff/templates/tokens/global/shops）の書き込みは `shops/{shopId}/owners/{auth.uid}` 登録者のみ。owners への自己登録は `private/adminKey` との値照合が必要で、adminKeyは管理者端末のlocalStorage（`ots_adminKeys_v1`）にのみ保存される。**スタッフURLから得られるshopIdだけでは管理操作できない**（2026-10-08 から閲覧もできない＝管理コードの入力画面だけが出る）。
- スタッフは subs の読み書きと settings/periods/staff の読みのみ（従来機能を維持）。**subs の書き込み・削除は認証済みなら誰でも通る**（`.write: auth != null && $shopId !== 'demo-toriMatsu-v1'`）。**ただし 2026-09-30（P3）から、その sub の期間（書き込み後の periodId と、削除・変更前の periodId の両方）に `confirmation` があるときはオーナーだけが書ける**（スタッフの再提出を確定でルールごと止める）。提出を触れるのを本人だけに絞っているのは **UI（app-staff.js の `canTouch`）だけ**で、ルールは名乗った名前を検証できない——2026-08-31 決定1で承知のうえ引き受けたトレードオフなので、**再検出しても「バグ」として直さない**。
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
           laborTotals?: {[name]: {workMin,paid,publicOff,ceremony,monthOtH?,monthAgH?}},  // 凍結時点の労務の合計（年度の累計用）。
                                                   // monthOtH＝月の残業（A制は残業予定・B制は割増の①＋②）、monthAgH＝時間外＋法定休日労働（P5）。どちらも月の最後の期間だけ
           submission?: {at: string, byUid: string},                  // 企業への完成シフトの提出（2026-09-27。無ければ未提出）
           confirmation?: {at: string, byUid: string, note?: string},  // 確定（2026-09-30・P3）。セルの編集とスタッフの再提出を止める。旧 lockedAt はここへ統合（確定で消す）
           delivery?: {at: string, byUid: string, method?: string},    // 本人への交付の記録（確定済みのときだけ。公開機能ではない）
           published?: {at: string, byUid: string},                    // 従業員画面（マイシフト）への公開（2026-10-04・第2部 E3）。確定で未公開なら同時に書く
           helperDisplayOff?: {[name: string]: true},                  // ヘルプ勤務の自動表示を出さない人（2026-10-05・この期間だけ・見た目だけ）
           history?: {[key: string]: {kind: "submit"|"resubmit"|"confirm"|"unconfirm"|"deliver"|"publish"|"unpublish", at, byUid, note?, method?}} }
                                                                       // 確定と同時の公開は kind "publish"・method "confirm"
                                                                       // 上書きしない履歴。diffPeriodsForFlatWrite が記録1件ずつ書く

// 提出
Sub = { id: string, periodId: string, staffName: string, shopId: string,
        // shift の管理者フィールドは ADMIN_SHIFT_FIELDS（app-utils.js）が正本。
        // adjustedBreak（分・日別の休憩上書き）と leaveType（"public"|"paid"|"ceremony"）を含む
        shifts: {[date: string]: {status:"work"|"holiday", start?:string, end?:string}},
        comment: string, submittedAt: string, updatedAt?: string, isUpdated?: boolean,
        submitterUid?: string }   // 記録・監査用（2026-08-31 から削除の判定には使わない）

// 候補時間
Cand = { start: string, end: string } | { closed: true }

// 設定（passwordは廃止済み・新規店舗には書かれない）
Settings = { shopId, candidates: Cand[], weekdayCandidates: {[dow]: Cand[]},
             dateCandidates: {[date]: Cand[]}, templates: Template[],
             breakTimes?: {weekday|sat|sun|holSat|holSun: {start,end,tags?}[]},   // 旧4区分の hol は後方互換で読むだけ
             staffAttributes?: {[name]: 属性ID},
             staffTypeLimits?: {[属性ID]: {name, laborSystem?: "A"|"B"|"none",
                 daily,weekly,biweekly,monthly,customDays,customHours,          // 上限（0=未設定）
                 dailyMin,weeklyMin,biweeklyMin,monthlyMin,customHoursMin,     // 下限（0=未設定）
                 otProrate?: {window: "month"|"halfMonth", fixedMin?}}},        // 残業予定の按分窓（P3.5b・既定は月）
             laborSettings?: {monthlyBase31Min, fixedOvertimeMin, marginMin,
                 agreementDailyOtMin, agreementMonthlyOtMin, agreementAnnualOtMin, fiscalYearStartMonth,
                 annualScheduledMin, rateDenominatorMin, weekStartDow, weekSplitAtMonthEdge, // 分単位・既定は読み手側フォールバック。この4つは P2（0＝未設定・真偽値は0/1）
                 showDailyOverB, dailyOverThresholdMin},            // P3.5b: B制の日ごとのしきい値超を残業予定に出す（既定0＝オフ・しきい値は既定480）
                                                                    // P3.5c の2キー（判定対象外の長時間の日の色）は 2026-10-03 に削除。保存済みの値は laborSettingsOf が捨てる
             breakMode?: "band"|"length",                                       // 休憩の決め方（既定 band＝従来）
             breakLength?: {over8Min, over6Min, basis?: "work"|"binding",       // basis・tiers は P3.5a（無ければ従来の2段）
                 tiers?: {overMin, breakMin, inclusive}[]},
             headcountAt?: {enabled, lunch: "HH:MM", dinner: "HH:MM"},          // PDF の昼・夜の人数（P3.5d・既定なし）
             paidLeaveGranted?: {[name]: 日数},                                  // 有給の付与日数（残数の基準）
             overtimeSettings?: {byStaff: {[name]: {lunch,dinner}}}, staffNumbers?: {[name]: string},
             xlShopName?: string, staffColors?: {[name]: "red"|"black"},
             staffAliases?: {[registered]: string[]}, staffHidden?: {[name]: {from:string|null,to:string|null}[]}, periodUnit?: "2week"|"1month",
             staffHomeShop?: {[name]: shopId},    // 所属店舗（2026-09-27。無ければ自店所属。STAFF_KEYED_SETTING_MAPS 登録済み）
             shopAbbrs?: string[],                // 店舗略称。手入力のヘルプコマンド（例「9三」）と、先頭がヘルプ表示の1セル用
             shopAbbr2?: {top, bottom}|null,      // 2セル表示用の略称（2026-10-04・H1）。表示専用・各2文字・企業連携タブで登録
             payCalendar?: {closingDay, payMonthOffset, payDay, holidayRule, updatedAt},  // マイシフトの給料の締日・給料日（2026-10-05・本人の設定より優先）
             actualsCsv?: {hasHeader, date, name, start, end, breakMin} }  // 実績の CSV 取込の列の位置（1始まり・0=使わない・P4）

// 実績（shops/{shopId}/actuals/{期間ID}/{名前}/{日付}・2026-09-30・P4）。確定シフトと違う項目だけ。解決は resolveActualDay
Actual = { start?: "HH:MM", end?: "HH:MM", breakMin?: number, absent?: true, absentMin?: number, legalHoliday?: true, note?: string }

// 賃金マスタ（shops/{shopId}/private/pay/{名前}・2026-09-30・P6a）。1版の形は normalizePayVersion が正本
Pay = { payType: "monthly"|"hourly", base: number,            // 月給は基本給（月）・時給は時給。社員は常に monthly
        allowances?: {name, amount, excludeFromRate, excludeFromDeduction}[],   // 月給のみ
        fixedOt?: {hours, amount, auto},  fixedNight?: {hours, amount},        // 月給のみ。auto なら amount は式で再計算
        commute: {amount, per: "day"|"month"}, effectiveFrom: "YYYY-MM-DD", updatedAt: string,
        history?: Pay[] }   // 前の版（適用開始日の昇順・読み取り専用）

// 企業の人物（companies/{id}/pub/people/{personId}・2026-09-30・P1b）。店舗側の名前キーは変えない（企業レベルの上乗せ）
Person = { displayName: string, entityId?: string, number?: string, links: {[shopId]: 登録名},   // 1店舗1名前
           createdAt: string, updatedAt: string, mergedFrom?: {[personId]: string},
           distinct?: {[personId]: string} }   // 「統合しない」と記録した相手（両方向に書く・値は記録した時刻）

// 従業員画面の紐付け（2026-10-04・第2部 E2）。名前の正本は StaffLink.name（UserLink.name は紐付けた時点の写し）
LinkRequest = { displayName: string, number?: string, at: string }                      // shops/{shopId}/linkRequests/{uid}
StaffLink   = { name: string, personId?: string, method: "number"|"name"|"code"|"page", at: string }  // shops/{shopId}/staffLinks/{uid}（page＝専用URLから本人が追加・2026-10-05）
UserLink    = { name: string, personId?: string, at: string }                           // users/{uid}/links/{shopId}

// 従業員画面の本人のデータ（2026-10-04・第2部 E4）。時刻は "HH:MM"（時は2桁・24時超え表記で 30:00 まで・退勤 > 出勤）
MyWorkplace = { kind: "shifty"|"manual", color: "#rrggbb", name?: string, shopId?: string, pay?: MyPay }  // users/{uid}/workplaces/{shopId | m_xxxxxxxx}
// 本人の給料設定（2026-10-04・第2部 E5）。読みは myPayOf（壊れた記録は null＝未設定）
MyPay       = { closingDay: 1..31, payMonthOffset: 0|1|2, payDay: 1..31, holidayRule: "before"|"after"|"none",   // 31＝末日
                wageType?: "hourly"|"daily", rate?: 円, commute?: {amount: 円, per: "day"|"month"}, night?: boolean, over8?: boolean, updatedAt: string }
MyGoals     = { monthly: 円, updatedAt: string }                                                       // users/{uid}/goals
// users/{uid}/actuals/{支給月}/{勤務先ID} = 振込額（円・number）
MyShift     = { workplaceId: string, date: "YYYY-MM-DD", start: string, end: string, breakMin: number, memo?: string }  // users/{uid}/shifts/{h_xxxxxxxxxx}
MyOverride  = { start: string, end: string, breakMin: number }                                // users/{uid}/overrides/{shopId}/{date}
// スタッフ個別URL（2026-10-04）。staffPageData/{pageToken} の下は上の My* と同じ形（users/{uid} の profile・links は持たない）
StaffPage   = { status: "pending"|"approved"|"rejected"|"revoked", displayName: string, number?: string, requestedAt: string,
                name?: string, approvedAt?: string, byUid?: string, revokedAt?: string, pinResetAt?: string }  // shops/{shopId}/staffPages/{pageToken}
StaffPageToken = { shopId: string, at: string }                                                   // staffPageTokens/{pageToken}

// 企業設定の写し（shops/{shopId}/company・2026-09-27）
CompanyLink = { id: string, name: string, entityId?: string, entityName?: string, kind?: "shop"|"hq",   // 法人と本部（2026-09-30・P1）
                settings: {laborSettings?, staffTypeLimits?, wageSettings?: {minWage?: {from, yen}[],
                  premiumRates?: {ot?, over60?, night?, holiday?},   // 割増率（%）。法定より上の値だけ持つ（P6b）
                  roundingRule?: "round"|"floor"}},                  // 金額の端数。無ければ円未満切上げ（P6b）
                deadlines: {[期間キー]: "YYYY-MM-DD"},
                monthlyDeadlineDays?: number[],   // 毎月の固定締切（日付指定の無い期間に効く・2026-09-27）
                shops: {[shopId]: 店舗名},
                people?: {[personId]: {[shopId]: 登録名}},   // 連携店舗ぶんの人物（P3.6・CF の mirrorPeopleOf）
                shopEntities?: {[shopId]: 法人ID},            // 連携店舗の法人（P3.6・同じ法人の中だけで合算する）
                syncedAt: string }   // 期間キー = periodRangeKey(period) = "開始日_終了日"
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
     **ただし Cloud Functions には残っている**（#147 で実測）: `purgeInactiveShops` の3節（functions/index.js の「3) 期限切れの inviteCodes / email_otps を削除」のコメントの下）が
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

### 法人レイヤー（2026-09-30・P1・本番反映済み）

`労務給与_複数法人_実装計画.md` §3.1・P1。企業（管理グループ）の下に法人を置き、店舗は必ず1法人に属す。
- **重ね合わせは CF 側**（`buildShopMirror`・`mergeEntitySettings`）。写しの settings は「企業共通 → 法人」を重ねた値で、
  店舗のクライアント（`applyCompanySettings / stripCompanySettings / companyControlledKeys`）は変えていない。
  法人が決めた項目も写しにキーがあるので、設定タブでは「企業設定」の固定表示になる
- **移行は片方向**: `syncCompanyMirror` が毎回 `planEntityMigration` を通す（法人が無ければ企業名と同名の法人を作り、割当の無い店舗を既定へ）。
  **既存の `pub/config.settings` は法人へ写さない**（企業共通の層のまま。既定の法人は設定を持たないので写しの settings は移行前後で同じ）
- **労務判定は法人の設定だけで決める（2026-10-01 ユーザー決定）**。企業の共通設定と法人の設定で同じ労務判定の欄が重複していたので
  企業の共通設定から外し、企業の共通設定は属性別の勤務時間制限だけになった（法人の設定の労務判定は空欄＝店舗の設定）。
  既存の企業の `pub/config.settings.laborSettings` は、法人カードの読み込みで1回だけ各法人へ移す（`planLaborToEntities`）:
  各法人に「企業の値＋法人の値（法人が勝つ）」を `saveEntityConfig` で保存し、全法人が通ってから `saveCompanyConfig` で企業側の
  laborSettings を外す。重ね合わせ（`mergeEntitySettings`）はキー単位なので写しの値は前後で変わらない（テストで照合）。
  どの法人にも属さない連携店舗がある・法人が無いときは移さない。失敗したら企業側は消さない（次に開くとやり直す）。
  企業の共通設定カードの保存は、保存直前に読み直した企業の laborSettings だけを送り直す（移行前の値を消さないため。CF は settings を丸ごと置き換える）。
  CF・ルールの変更は無い（既存の `saveEntityConfig`・`saveCompanyConfig` だけで行う）
- `linkStoreToCompany` は別の企業に連携中の店舗を拒否し、`createCompany` はスキップする（`otherCompanyLinksOf`＋相手企業の pub/shops で確認）
- 本部店舗（`kind:"hq"`）は期間管理タブでスタッフ提出URLを隠し（ボタンで表示可）、企業内登録スタッフで「本部」の見出しに分かれる
- 検証は `tests/core.test.js`（CF の規則）と `example-company-entities.js`（スタブが company-config.js をそのまま読み込む）。ルールの変更は無い

### 賃金マスタ・閲覧パスコード（2026-09-30・P6a・ルールと CF も本番反映済み）

`労務給与_複数法人_実装計画.md` §3.7・P6a（決定 #6・#12・#17）。人ごとの時給・月給・手当を `shops/{所属店舗}/private/pay/{名前}` に持つ。
- **購読は claim が通った店舗でだけ**（App の `ownerClaimedSid===sid`）。先に購読するとオーナーでない端末で拒否されてリスナーが外れ、
  あとで claim が通っても戻らない。App が1つのオブジェクト `pay`（map・codeRec・unlock・save・rename・drop・changeCode…）を AdminView へ渡す
- **パスコードの解除状態は App のメモリに持つ（計画書 §3.7 の `SS_PAY_UNLOCK`＝sessionStorage から変えた）**。sessionStorage はリロードを
  またいで残るので、「リロードで伏せ直す」という受け入れ条件と食い違う。値は「どのパスコードで解除したか」（`payCodeIdentity`）で、
  企業連携店舗どうし（同じコード）では解除を持ち越し、別のコードの店舗へ移ると伏せ直す。🔒・リロード・10分無操作で伏せ直す。
  **失敗回数のロック（5回で60秒）だけは sessionStorage（`ss_payCodeLock`）**——メモリだとリロードで待ち時間を回避できるため
- 企業連携店舗のパスコードは企業のものに統一（CF `setCompanyPayCode`・企業アカウントのカードか企業内登録スタッフの上部の「変更」から変更）。スタッフタブの「変更」は案内だけ。
  連携していない店舗はクライアントが `private/payCode` を直接書く（オーナーのルール）
- 最賃比較は法人設定 `wageSettings.minWage`（P1 の法人設定に P6a で追加。法人カードの「法人の設定」で入力）。登録が無ければ比較を出さない
- 企業内登録スタッフの「賃金」列は解除後にだけ各所属店舗の `private/pay` を読む（企業のパスコードで解除。店舗の owners に入っている uid だけが読める）
- ルールは新ノードだけ（`private/pay`・`private/payCode` の書き込み＝オーナー、`companies/$id/private/payCode` の読み＝企業uidと作成者）。
  **新ノードなので本番はルールが先**（計画書 §6 冒頭）。dev は 2026-09-30 に反映し、`probe-rules-pay.js` で20項目（非オーナーの読み書き401・
  オーナー200・形の不正401・企業の payCode 401）を実測済み
- 検証: `tests/core.test.js`（数値・CF との一致・ドリフト検出）と `example-staff-pay.js`（スタブ・34項目・375px 含む）

### 人×月の所定・確定ロック・交付（2026-09-30・P3・ルールと CF も本番反映済み）

`労務給与_複数法人_実装計画.md` §3.4・§3.5・P3（決定 #1・#10・#18・#21）。
- **確定の意味が変わった**: 以前の「この期間を確定」（終了後だけ・写しでマスタ固定・セルは編集可・`lockedAt` は誰も読まない）を
  「確定」（終了前から可・**セルもロック**・スタッフの再提出をルールで拒否）に置き換えた。`resolvePeriodMaster` は
  「(終了済み or 確定済み) かつ写しあり」で locked。シフト作成タブの写しの最新化は確定済みの期間で止まる（laborTotals は終了まで書く）
- 解除は理由を `window.prompt` で取り履歴に残す。**写しは消さない**（以前の「確定を解除＝写しを消して現在値に戻す」は無くなった）
- 労務判定表（全データPDFにも載る）に「月所定/上限」（所定上限＝年間所定の年按分・未設定なら総枠との差）と
  「年平均所定/分母」（年度の開始月〜この月。laborMonths → この月はシフトから集計 → 実データ → 凍結値の順で埋める）を追加
- 所定の手修正欄はシフト作成タブの労務判定表の下（「人×月の所定」を開く）。凍結済みの月は変更できない
- 本部店舗（写しの `kind:"hq"`）のシフト作成タブに「固定勤務パターン」（既定 9:00〜18:00・休憩60分＝`adjustedBreak`）
- 企業連携タブの提出状況表に「確定」「交付」列と「履歴」。店舗の staff・settings・company/settings・periods・laborMonths とその月の subs を読み、
  シフト作成タブと同じ `planPeriodConfirmation` で書く（期間は差分 update）。企業の作成者がその店舗の owners に居ないと書き込みは拒否される
- ルール: `laborMonths` は新ノード（オーナーのみ）＝本番はルールが先。subs の確定条件は既存パスの締め付け＝CLAUDE.md の順（クライアント先）。
  dev は 2026-09-30 に反映し、`probe-rules-confirm.js` で32項目（匿名uidの未確定への提出200・確定済みへの提出/付け替え/修正/削除401・オーナー200・laborMonths の非オーナー401と形の不正401）を実測済み
- 検証: `tests/core.test.js`（計画・凍結条件・履歴の差分・改名の CF 一致・ルールと入口のドリフト検出）と `example-labor-confirm.js`（28項目）

### 人物ID と企業スタッフ一覧の編集（2026-09-30・P1b・本番反映済み・ルールの変更なし）

`労務給与_複数法人_実装計画.md` §3.8・P1b（決定 #13）。企業レベルに personId を上乗せし、店舗側の名前キーは変えない。
- **人物を作るのは CF `ensureCompanyPeople` だけ**（計画書の `upsertPerson` にあたる）。企業内登録スタッフを開いたとき、どの人物にも
  つながっていない登録（未リンク）があれば1回呼ぶ。初回は既存の推定（`groupStaffRegs`）どおりに全員分を作る＝一覧の見た目は変わらない。
  以後は保存済みの people が正で、未リンクの登録だけを拾う（推定で1人につながればそこへ足す／店舗側で改名された人は同じ法人・同じ番号で
  同じ人物へ戻す／それ以外は新しい人物）。**つながっている人物が2人以上なら勝手にまとめない**＝統合解除した登録は再びまとまらない。
  読めない店舗が1つでもあれば作らない（その店舗の登録を別人物として作らないため）
- **personId**: 数字だけの従業員番号ならその番号、それ以外・未設定・既に使われている（別法人の同じ番号）なら `p_`＋英数字8桁
  （`genPersonAutoId`。**genSecureId を使わない**＝記号を含むため）。作成後は変えない。番号を ID に揃えるのは「ID を番号に振り直す」だけ
- **従業員番号は法人内で一意**（`staffNumberConflict`。保存済みの人物の番号と、店舗の登録の番号の両方を見る。衝突は `already-exists` で拒否）。
  番号は人物とつながっている全店舗の `settings/staffNumbers` に書く（シフト表・Excel の番号と揃える）。一覧の番号列は従来どおり店舗の番号
- **改名（`companyRenameStaff`）は StaffTab の改名と同じ結果**: 選んだ店舗ごとに staff（トランザクション）・**全** subs.staffName
  （3ヶ月の購読窓の外も）・settings（名前キーの8マップ）・periods（snapshot / keepStaff / keepAttrs / laborTotals）・private/pay・people.links を移す。
  settings・subs・periods・pay は**差分 update**（全体 set() しない）。規則は `functions/company-config.js` の
  `renameStaffSettingsPatch / renameStaffPeriodsPatch / renameStaffPayPatch / renameStaffSubsPatch / validateStaffRename` で、
  **クライアントの renameStaffInSettings / renameStaffInPeriods / renameStaffInPay を当てた結果と一致することをテストが照合する**。
  laborMonths（P3）は `renameStaffLaborMonthsPatch`、actuals（P4）は `renameStaffActualsPatch` で移している（`STAFF_KEYED_PERIOD_NODES_CF`）
- 統合・統合解除は企業側の束ね方（people）だけを変え、店舗のデータは動かさない。統合は同じ店舗に別の登録名があると拒否（1店舗1名前）
- **「統合しない」（2026-09-30）**: 重複候補の組を別人と記録する。置き場は `people/{personId}/distinct/{相手のpersonId}=ISO時刻` で、
  **両方向に書く**（CF `markPeopleDistinct`・`planMarkDistinct` が全ペア＝3人組なら3ペア6キー）。読む側（`isDistinctPair`・
  `duplicatePersonCandidates`）は**どちらか一方向でも記録があれば別人**とみなし、組の**全ペア**が記録済みなら候補に出さない
  （1ペアでも未記録なら組ごと出す）。行には `buildCompanyStaffRows` が `distinct:[相手のpersonId…]` を載せる（people を別に渡さない）。
  **統合（`planMergePeople`）は記録を消す**（keep/drop 間の記録は明示の統合なので消し、drop の記録は keep へ引き継ぎ、drop を指す
  第三者の記録は keep へ付け替える）。**切り出し（`planSplitPerson`）は自動で記録する**（別人と決めた操作なので、直後に候補へ戻らない）。
  ID の振り直し（`planReassignPersonId`）も他人の記録を新しい ID へ付け替える。取り消しは各人の「編集」モーダルの「統合しない相手」
  （`planUnmarkDistinct`・両方向を消す。相手が消えた人物でも ID だけ出して消せる）。links は変わらないので写しは作り直さない。
  写し（`mirrorPeopleOf`）と同期（`planPeopleSync`）は distinct を見ない。回帰は `example-company-dup-candidates.js` の F〜I
- 属性・所属店舗の変更は、つながっている全店舗の settings に同じ値を書く（StaffTab の「どの期間まで旧属性のままか」の確認は出さない）
- 検証: `tests/core.test.js`（規則・CF とクライアントの一致・ドリフト検出）と `example-company-people.js`（スタブ・29項目・375px 含む。拒否がモーダルの中に見えること・既に同じ名前の店舗を送らないことも測る。
  P1b 前の配信物に向けると25項目が落ちる＝素通りしない）

### ヘルプ先勤務の所属店舗への合算（2026-09-30・P3.6・本番反映済み・ルールの変更なし）

sub は行き先の店にあるので、以前は所属店舗の労務判定・月計・週の休みがその人の他店勤務を知らなかった（空欄＝休みに見えた）。
所属店舗のシフト作成タブが店舗間の重複判定のために読んでいる連携店舗のデータ（`companyData`。他店の settings・subs・staff・periods は
`auth != null` で読める）を使って合算する。形の組み立ては `otherShopDataOf` で、企業の確定（企業連携タブの提出状況表）も同じ関数で読む。

- **対象店舗**: 企業の写し（`companyLink.shops`）の連携店舗だけ（`allLinkedShops` のうち企業に入れていない店舗は含めない）。
  写しの `shopEntities` があれば**同じ法人の店舗だけ**（`helperShopsOf`）
- **同一人物（`samePersonRegistrations`）**: ① 写しの `people` に自店の登録が載っていれば、その人物の links が正（登録名は店舗ごとに違ってよい）。
  ② どちらかの登録が people に無ければ `dupTargetShopsFor` と同じ規則（同じ名前で両方の登録の所属店舗が一致）。
  **両方の登録が別の人物に載っていれば別人**（同姓同名を束ねない）。名前が同じで番号も所属も無い登録も別人
- **所属（`personHomeShopOf`）**: 同じ人の登録の `staffHomeShop` に**明示された値が1つに決まる**ときだけ。両方未設定・食い違いは null＝
  **どちらにも合算しない**（両方が自店を所属とみなすと同じ時間を2店舗で数えるため）。企業内登録スタッフの一覧が「所属店舗を設定してください」を出す
- **役割（`helperPersonOf`）**: 所属側（role "home"）が他店の勤務を足す。行き先（role "dest"）は労務判定表の総括を「所属店舗で判定」にし、
  **`laborTotals`・`laborMonths` に入れない**（有給残と同じ「所属店舗に1本化」）。dest は所属店舗の登録を自分が知っているときだけ
  （知らないと、どこでも数えられなくなる）。行き先の表示（人数・ポジション・重複判定）はそのまま
- **他店の勤務（`helperWorkOn`）**: 休憩は**行き先の店の設定**（企業設定を重ね、その日を含む期間が確定・終了済みなら写し＝`helperShopSettingsOn`）で
  引いた実働を持ち込む（所属店舗の設定で数え直さない）。**自店のその日の勤務と時間が重なる他店の勤務は足さない**——ヘルプコマンド
  （略称サフィックス）で自店にも同じ勤務を入れているか、重複エラーの日で、足すと二重に数える。期間の切り方が違っても日付で拾う
- **合算する画面**: 所属店舗のシフト作成タブの `laborDayMin`（月実働・残業予定・労務判定・laborTotals・年計）・`getWeekMin`（週計）・
  `getPeriodMin`（期間別勤務時間の月計）・週の休み（`dayKindWithHelper`＝自店が空欄でも他店で働いた日は出勤日）・休暇の公休日数・休憩不足（行き先の判定）・PDF。
  **休みカウント表（1日休・半日休）と最大連勤は合算していない**（計画の対象外）
- **グリッド**（2026-10-04・H2 で表示を変更）: 決まりは `helperCellDisplay`（app-utils.js）1本で、画面・PDF（`buildShiftTableHtml`）・
  Excel（シフト作成タブの `adjResolver` → `expXl`）が同じ関数を通す。上セル＝その日の最初の勤務の開始、下セル＝最後の勤務の終了で、
  その時刻がヘルプ先のものなら時刻の後ろに略称を付けて**特記ありと同じ黄色**（画面 `#FFF3B0`・PDF と Excel `#FFFF00`）。
  ヘルプ先だけの日は2セル用の略称（`shopAbbr2` の上・下）を分けて出し（例「11鶏」「15三」）、2セル用が未登録なら上に1セル用（`shopAbbrs` の先頭）・
  下は時刻だけ。自店と混在する日は1セル用（例 昼ヘルプ＋夜自店＝「11鶏三」「23」）。2店舗へ行く日は上下それぞれに該当店舗の1セル用。
  「→」・斜体・灰色は付けない。**黄色は表示だけで subs に特記を書かない**（ヒートマップの除外・重複チェックは変わらない）。
  ヘルプ先の勤務がある日は休みの斜線を描かない（画面 `cellBgStyle`・PDF・Excel の diagonal）。title は隠れる時刻も含めて全件（例
  「鷄えん3ビル 11:00〜15:00（実働 4:00）／自店 17:00〜23:00」）。ヘルプ先だけの日は読み取り専用（編集は行き先の店）、混在の日は
  略称の付くセルを選ぶと自店の値に切り替わって編集でき（保存されるのは自店の値だけ）、離れると合成表示に戻る。合成表示のまま blur しても保存しない
  （`handleBlur`）。休暇ラベルのある日は休暇を優先してヘルプを出さない。自店の勤務と時間が重なるヘルプ先の勤務は今までどおり出さない（`helperWorkOn`）。
  **列幅は変えない**（2026-10-04 ユーザー指示。計画書の「その人の列だけ広げる」は不採用）。収まらない合成表示は、そのセルの文字だけを
  `helperCellFontPx` で縮める（1文字を半角英数 0.62em・記号 0.34em・全角 1em で見積もり、0.5px 刻み・下限 8px）。通常表示の列39pxで
  「11鶏三」「23鶏三」は 10.5px、「17鶏」「15三」は 15.5px、全表示（列39px）の「11鶏三」は 11px、PDF（列30px）の「11鶏三」は 8px・「17鶏」は 11.5px。
  縮めるのは合成表示を出している間だけで、混在の日にフォーカスして自店の値を編集する間は通常の 16px に戻る（iOS のズーム防止の規約どおり）。
  縮めたセルは line-height を 16px のときと同じ 18px に固定して行の高さを保つ（指定しないと 26px→20px に詰まる）。Excel は該当セルだけ
  `shrinkToFit`。15分刻みの時刻（例「11.25鶏三」）は下限 8px でも収まらず端が切れる。回帰は `example-helper-aggregate.js`（41項目・WebKit でも通る。計算が H2 前と同じことは `example-helper-aggregate.stable.json` と照合）
- **自動表示の ON/OFF（2026-10-05 ユーザー指示）**: メイングリッドの名前の見出しの下の「ヘ」ボタン（`data-helper-toggle`）で、
  **作成中のこの期間だけ・この人だけ**、上の合成表示を出さない。保存は `period.helperDisplayOff={名前:true}`（既定 ON＝キー無し・
  `planHelperDisplayToggle`→`savePeriods`。`diffPeriodsForFlatWrite` が名前1件ずつのパスで書く）。ボタンが出るのは、この期間に自動のヘルプ勤務がある
  所属店舗の人と既に OFF の人だけで、全表示では出さない。押せるのは期間を書ける端末（savePeriods あり・閲覧専用でない・非表示マウントでない）で、
  **確定済みの期間では押せない**（表示だけ）。**見た目だけ**: OFF は `helperDisp` の先頭で null を返すだけなので、画面・PDF・Excel・読み取り専用・斜線・
  blur の保存しない判定が一緒に戻り、**労務の合算（`helperEntriesOn` → 月実働・週の休み・36協定・laborTotals・laborMonths・賃金）は変えない**
  （tests/core.test.js のドリフト検出が守る）。手打ちのヘルプ（「9三」）は subs の値なのでそのまま出る。従業員画面の「全員のシフト」（`buildMyShiftSheet`）も
  同じ期間の設定に従い、本人のカレンダー・給料（`myHelperDaysOf`）は変えない。改名は `renameStaffInPeriods` と CF の `renameStaffPeriodsPatch` が移す
  （CF は**本番未デプロイ**＝企業の一覧からの改名ではその期間の OFF が旧名に残り、表示が ON に戻る）。削除では掃除しない（keepAttrs と同じ）。
  ルール・データ移行なし。回帰は `example-helper-toggle.js`（20項目・前の配信物では切り替えが現れず落ちる）
- **laborMonths**: 確定の2つの入口（シフト作成タブ・企業の確定）がどちらも `helperScheduleContext` を通して `planPeriodConfirmation` の
  `extraDayMin`／`excludeNames` に渡す（`aggregateScheduledMonth` が他店の勤務を足し、行き先では所属店舗で判定する人を数えない）
- **読めない他店**: 読み込みに失敗した店舗に登録がある人（people に載っていない人は、失敗した店舗が1つでもあれば）は月実働・総括に「＋」と
  「他店の勤務を読み込めていません」。**他店を読み終えるまでは laborTotals を書かない**（合算前の値で凍結しない・`companyDataReady`）。
  一括PDF（非表示マウント）は写しを渡し、他店の読み込みを待ってから書き出す
- **写しの people**: CF の `buildShopMirror` が `mirrorPeopleOf`（連携店舗ぶん・人物ID の形を満たすもの）と `mirrorShopEntitiesOf` を焼く。
  人物を変える CF（ensureCompanyPeople・mergePeople・splitPerson・reassignPersonId・companyRenameStaff）は `syncPeopleMirror` で写しを作り直す
- **合算するのは予定（subs）だけ**。他店の `laborMonths`・`actuals`・`private/pay` はオーナーしか読めず、店長のセッションは自分の店舗の
  オーナーでしかない。**実績の他店合算は、そのセッションが行き先の店のオーナーであるときだけ行う**（P5 で実装。企業コードのログインは全連携店舗の
  オーナーなので読める）。読めないときは同じく「＋」と「他店の実績を読み込めていません」を出す（割増の行だけ。予定の合算は従来どおり）。月次賃金ページ（P6b）も
  同じ ShiftEditTab の計算を通すので同じ規則になる: 他店の予定はどのセッションでも足し、他店の実績は行き先の店のオーナー（企業コードのログインなら全店）
  のときだけ使い、読めなければ行に「＋他店の勤務・実績を読み込めていない途中の値」と出す（計画書 §3.9 の「読み取り権限の制約」）
- 検証: `tests/core.test.js`（同一人物・所属と行き先・行き先の休憩と写し・期間の切り方が違う2店舗・laborMonths の凍結値・写しの people・
  重複候補・入口のドリフト）と `example-helper-aggregate.js`（店長のセッション・14項目）・`example-company-dup-candidates.js`（統合で写しが作り直される）。
  どちらも P3.6 より前の配信物に向けると落ちる

### 実績（2026-09-30・P4・ルールと CF も本番反映済み）

`労務給与_複数法人_実装計画.md` §3.6・§4.1・P4（決定 #8: 手入力が先・CSV は列の位置を設定に持つ）。確定シフトとは別ノードに実労働を持つ。
- **置き場は `shops/{sid}/actuals/{期間ID}/{名前}/{日付}`**。subs に書かないので、スタッフの提出で消えず、確定ロック中でも書ける。
  読み書きはオーナーだけ（`laborMonths` と同じ形のルール）。App は claim が通った店舗でだけ購読する（所定・賃金と同じ理由）。
  書き込みは `fbUpd` の差分だけ（`{"期間ID/名前/日付": 記録|null}`）。**コレクション全体を set() しない**
- **確定シフトと違う日だけを保存する**。`planActualEdit` が入力から確定シフトと同じ項目を落とし、何も残らなければ null で消す。
  実績の出勤・退勤の初期値は `scheduledDay`（退勤延長を足した後の退勤）なので、見えている値をそのまま保存しても記録は増えない
- **解決は `resolveActualDay` 1本**（P5 の割増はこれだけを入力にする）。出勤・退勤は主シフトを置き換え、退勤延長は足さない
  （入れた退勤が実際の退勤）。締の追加出勤は確定シフトのまま足す。休憩は breakMin が無ければ変わった時刻で `getBreaksFor` を通し直す。
  欠勤の不就労は確定シフトの実働。遅刻・早退（absentMin）は賃金の控除（P6b）用の値で、実働からは引かない
- **UI**: シフト作成タブの「実績」切替は**確定済みの期間・オーナーの端末・Premium だけ**。出勤・退勤はセルで直し（空欄で予定に戻る）、
  セルを選ぶと出る欄で休憩・欠勤・遅刻早退・法定休日・メモ・「予定に戻す」。差分のある日だけ色（`ACT_DIFF_BG`）と太字、法定休日は「法」
- **CSV取込**（同じダイアログ）: 1行＝1人1日（日付・名前・出勤・退勤・休憩）。列の位置と見出しの有無は `settings.actualsCsv`（変えて取り込んだときだけ保存）。
  文字コードは Shift_JIS（既定）と UTF-8。打刻機の形式が分かった時点で既定の列を変える
- **他店の実績の合算は P5 の割増の計算で行う**（「割増の計算（P5）」の節）。行き先の店の actuals を読めたときだけ使い、読めなければ「＋」
- 改名・削除: `STAFF_KEYED_PERIOD_NODES`（act.rename／act.drop・CF は `renameStaffActualsPatch`）。期間の削除（savePeriods）と CF の purgeOldPeriods も actuals/{期間ID} を消す
- ルールは新ノードだけ＝**本番はルールが先**（計画書 §6 冒頭）。dev は 2026-09-30 に反映し `probe-rules-actuals.js` で22項目（匿名uidの読み書き・削除401・オーナー200・形の不正401）を実測済み
- 検証: `tests/core.test.js`（解決・差分保存・改名削除・CF との一致・ルールと入口のドリフト・CSV）と `example-actuals.js`（21項目・375px 含む）

### 割増の計算（2026-09-30・P5・本番反映済み・ルールと CF の変更なし）

`労務給与_複数法人_実装計画.md` §4.1〜§4.4・P5（決定 #3・#4・#5）。入力は `resolveActualDay`（実績が無い日は確定シフト）の1日だけで、単位は分・1分単位。
- **A制（§4.2）**: ① max(0, 実働 − max(所定, 8h)) ② max(0, Σ週(実働−①) − max(Σ週所定, 40h)) ③ max(0, Σ月(実働−①−②) − 総枠)。
  **B制（§4.3）**: ① max(0, 実働 − 8h) ② max(0, Σ週(実働−①) − 40h)。日の所定は確定シフト（`scheduledDay`）、総枠は `laborMonthFrame` の baseMin。
  `laborMonths` の月の確定値は式に入らない（③の閾値は総枠）＝月所定の行（P3）でだけ使う
- **週**は `laborSettings.weekStartDow` 起算。月をまたぐ週は既定でその月の日だけで切る（`weekSplitAtMonthEdge=1`）。
  **この切り方は割増の計算にだけ効く**——既存の週の休み・B制の週40h超（労務判定の weekOver40）は今までどおり月で切らない（テストで固定）。
  `weekSplitAtMonthEdge=0`（行政解釈）は週の開始日の月に7日まるごと入れる（UI なし・引数だけ）
- **法定休日（決定 #5）**: 暦の7日（weekStartDow 起算・**月で切らない**）に休日が1日も無い週の最後の勤務日。実績の `legalHoliday` が付いた週は
  その日だけ（自動判定しない）。休日は週の休みと同じ数え方（公休・空欄）で、有給・慶弔・欠勤・実績で働いた日は休日にしない。
  **7日のどれかのデータが無い週は判定しない**。法定休日労働は①②③と60h超に含めず、深夜と重なった分は `legalHolidayNightMin` に別に持つ
- **深夜（決定 #4）**: 0:00〜5:00 と 22:00〜29:00。休憩は、時間帯方式の帯（`breakBands`＝`resolveActualDay`/`scheduledDay` が返す位置）なら
  深夜帯との重なりを引き、位置の無い休憩（長さ方式・日別の上書き・実績で分だけ入れた休憩＝`breakBands:null`）は
  **拘束に占める深夜帯の比率で按分**（引く分は1分未満切り捨て）。締の追加出勤には休憩が無い
- **60h超**: 月の時間外（法定休日を除く）が 3,600 分を超えた分
- **36協定**: B制にも月45h・単月100h・年の4項目を当てる（総括の要修正も A制と同じ）。**単月100h と複数月平均80h は時間外＋法定休日労働**
  （`premiumAgreementH`。A制は割増の①②③＋法定休日、以前の「残業予定だけ」より厳しい側）。年360h・720h・月45h超の回数は時間外だけ。
  年の値は `laborTotals[名前].monthOtH`（A制は従来の残業予定、**B制は①＋②**）と `monthAgH`（時間外＋法定休日）。`monthAgH` の無い凍結値（P5 前）は monthOtH で代える
- **表示**: 労務判定表に「時間外①②③」「深夜」「法定休日」「60h超」（暦月・title に内訳と計算の前提）。B制の「残業予定」はトグル
  （showDailyOverB）がオフでも割増の①＋②のうちこの期間の分を出す（オンの店舗は P3.5b の日ごとのしきい値超のまま）。A制の「残業予定」は
  予定ベースの見込みのまま。月が埋まっていない・他店の実績を読めていないときは先頭に「＋」。労務確認パネルに `日の時間外n日（…）`・
  `週の時間外（2〜8）`・`法定休日労働n日`・`月60h超`（要修正ではない＝総括を変えない。`深夜n日` は 2026-10-08 のユーザー指示で出さない＝深夜は判定表の列と月次賃金で見る）。全データPDFは laborRows を共有して同じ行が載る
- **実績の読み**: 自店の actuals はオーナーの端末だけ（`act.enabled`）。読めない端末は確定シフトで計算し title に書く。
  他店は `companyData` の読み込みで `shops/{他店}/actuals` も読み（拒否は `actualsUnread`・`loadFailed` に数えない）、`helperActualDaysOn` が
  行き先の店の設定と実績で解決する。**読めない確定済みの期間があれば「＋」と「他店の実績を読み込めていません」**（未確定の期間は実績の入口が無いので印を付けない）。
  他店の実績を読めていない人の月の値は laborTotals に残さない
- **app-admin.js の文字数**: P5 で 40万字の上限（`example-index-html-load`）を超えたので、セルと1日の組み立てを app-utils.js へ移して
  399,977 字に戻した。余裕が23字しかなかったので、同日シフト作成タブ一式を app-shift.js へ切り出して解消した
  （上の「app-shift.js の切り出し」。app-admin.js 198,981 字・app-shift.js 201,775 字）
- 検証: `tests/core.test.js`（手計算の期待値: 締23〜25時の深夜・帯と按分の休憩・12h勤務・所定4hの日・③と60h超・休日ゼロ週・
  月をまたぐ週・36協定の休日労働込み・他店の実績）と `example-labor-premium.js`（18項目・WebKit の iPhone 13 でも通る。P5 より前の配信物では16項目が落ちる）

### 月次賃金（2026-09-30・P6b・本番反映済み・ルールの変更なし）

`労務給与_複数法人_実装計画.md` §4.5・P6b（決定 #2・#6・#12・#17）。出すのは割増賃金と欠勤控除の内訳まで（社会保険・税・支給総額は対象外）。
- **時間は労務判定表と同じ計算**: `PayrollPage` が対象店舗の staff・settings（企業設定を重ねる）・写し・periods・年度の始め〜月末の期間と月初・月末の週にかかる
  前後の期間の subs・その月の前後の週にかかる期間の actuals・laborMonths・private（pay と payCode）を1回読み、ShiftEditTab を画面外へマウントする。
  **提出は月末＋7日にかかる期間まで読む**（2026-10-02・バグチェック#161）。非表示マウントは `pastSubsLoaded=true` なので、読んでいない翌月の日は空欄＝公休に見える。
  月末で切っていた間は、月末をまたぐ週で当月側が全日出勤・翌月側が終日の有給や慶弔だけのとき、当月の最後の勤務日が法定休日労働にならなかった（回帰 `example-payroll-month-edge.js`）。
  ShiftEditTab は `exportJob.kind==="payroll"` のとき PDF を作らず `payrollReportRef` の値（`laborByStaff[名前].prem`＝割増の内訳・月所定＝laborMonths の
  登録値か月実働・年平均所定＝`schedAvgByStaff`）を返す。割増の内訳は P6b で月の実労働（`workMin`・法定休日の日を含む）・所定・不就労（`absentMin`）の合計も持つ。
  非表示マウントは一括PDFと同じく書き込まない（savePeriods=null・ownerReadOnly・laborMonths は読むだけ）
- **式（§4.5）**: 単価は月給者 (基本給＋割増の基礎に入る手当) ÷ 分母、時給者は時給。月給者は基本給を動かさず、時間外は固定残業の時間を充当した残り
  × (1＋時間外率)、法定休日は × (1＋休日率)。時給者は時給 × 実労働に時間外・法定休日は率の分だけを足す（固定残業・固定深夜・欠勤控除を持たない）。
  60h超 × 追加率、深夜 × 深夜率 − 固定深夜手当の充当（**固定深夜の充当規則は計画書 §8「残る確認」の未決事項で、計画どおり深夜割増から額を引いて実装した**。
  額が0で時間だけあるときはその時間分の深夜割増を上限にする）。欠勤控除は (基本給＋控除から除かない手当) ÷ 分母 × 不就労
- **端数**: 項目ごとに `roundingRule`（既定 円未満切上げ）。**欠勤控除だけは逆向き**（切上げなら切捨て）——控除を切り上げると賃金の全額払いを割るため
  （計画書は「項目ごとに roundingRule」としか書いていない。この向きは実装で置いた前提）
- **版は月初時点**（`payVersionOn(pay, 月の1日)`）。月の途中の改定は注記だけで日割りしない（日割りは BACKLOG）。月初に版が無く月末にあれば（月の途中の入社）その版を使い注記
- **警告**: 年平均所定 > 分母（月給者だけ・特定技能の最賃割れ防止）・最賃割れ（月初時点の最賃）・賃金未設定
- **割増率と端数規則は法人の設定**（企業連携タブの法人カード「法人の設定」。賃金設定ページ（P6a）の割増率の表示もこの値になる）。`wageSettings.premiumRates`（法定より下げられない・法定と同じなら持たない）と
  `roundingRule`（既定の ceil は持たない）。CF の sanitize（`saveEntityConfig`・`saveCompanyConfig`）を通して保存する（CF は 2026-10-01 に本番反映を確認済み）
- **伏字**: 金額は閲覧パスコード（対象店舗の `private/payCode`、企業連携店舗は企業のコード）を解除するまで「••••」。時間は伏せない。CSV は解除するまで押せない。
  列の定義は `PAYROLL_COLUMNS` 1本（画面の表と CSV が共有・`kind` が "yen" の列だけ伏せる）
- **PDF・Excel には出さない**: `buildShiftTableHtml`・`exportPdf`・`expXl` が月次賃金の関数・賃金マスタを参照しないことを `tests/core.test.js` が固定する
- 自店以外（企業連携タブから開いた店舗）は、そのセッションが店舗のオーナーでないと private を読めず「この店舗の賃金を読み込めませんでした」を出す。
  対象店舗が Premium でなければ使えない（`accounts/{sid}/plan` を読んで `featureEnabled`）
- 検証: `tests/core.test.js`（手計算の額・端数・版の選択・警告・CF と同じ sanitize・CSV・書き出しのドリフト）と `example-payroll.js`（17項目・375px。
  P6b より前の配信物では16項目が落ちる。Pro でボタンが出ないことだけは元から通る）

### 企業横断ダッシュボード（2026-09-30・P7・本番反映済み・ルールと CF の変更なし）

`労務給与_複数法人_実装計画.md` §6 P7・§1 の要件5（年52日以上）と16（当月所定と総枠の差・年平均と分母の差）。本部が法人→店舗→人の当月と年をひと目で見る。
- **置き場は企業連携タブの新カード `CompanyDashboardCard`**（Premium・企業セッション＝`companyInfo` がある端末）。月（既定は今月）と法人を選び「集計する」で
  連携店舗（`companies/{id}/pub/shops`）を法人の順→店舗名の順に1店舗ずつ集計する。重いので開いただけでは集計しない
- **時間はシフト作成タブの労務判定表と同じ計算**: 店舗ごとに ShiftEditTab を画面外へマウントし `exportJob.kind="dashboard"` で `dashboardReportRef` の値を受け取る
  （月次賃金・一括PDFと同じ形）。返すのは「月所定/上限」「年平均所定/分母」の行と同じ値、laborByStaff の月の残業予定（B制は割増の①＋②）、
  `yearOvertimeMonths`・`yearLaborSummary` の年の値。**新しい労務の式は作っていない**（並べ方だけ app-utils.js の dashboard* 関数）
- **年の値は年度の始め〜選んだ月まで**（その月より後に作ってある期間は入れない。空欄＝公休なので、先の空の期間を入れると年間休日が水増しされる）
- **非表示マウントは書き込まない**（savePeriods=null・ownerReadOnly・onSave は何もしない・allLinkedShops=[]）。提出は `laborReadPeriodIds` で年度の全期間を読む。
  所定（laborMonths）・実績（actuals）は読めなければ所定はシフトから集計・実績は確定シフトで数え、店舗の行に注記。1店舗60秒で打ち切り「集計に失敗しました」
- **36協定の残り**: 月（協定の月の上限 − 月の残業予定）・年（協定の年の上限 − 年の合計）・年720h・複数月平均80h（いちばん高い窓）・月45h超の回数。
  年の3つは `agreementYearStatus`（`agreementYearFindings` と同じ値）。月の超過は月が埋まっているときだけ赤（労務判定表の monthReady と同じ）
- **年間休日**は公休（空欄を含む）の日数。52日以上＝ok、年度末まで数え終えた／残りの日を全部休んでも届かない＝不足（赤）、それ以外＝途中（「＋」と淡色）
- **確定・交付の進捗**はその月にかかる期間を `periodStateOf` で数える（店舗の見出し行と法人の見出し行）
- **賃金（金額）は出さない**（月次賃金ページの領分）。`tests/core.test.js` が、ダッシュボードが private/pay・月次賃金の関数を参照せず書き込みを持たないことを固定する
- 検証: `tests/core.test.js`（手計算の差・残り・年間休日・進捗・CSV・入口のドリフト）と `example-company-dashboard.js`（16項目・375px 含む。P7 より前の配信物では15項目が落ちる）
- **読みの負荷**: 1店舗の集計で ShiftEditTab が連携店舗（同じ法人）のデータも読む（ヘルプ先勤務の合算・P3.6）ので、店舗数の2乗で読みが増える。
  13店舗なら一括PDFと同程度。店舗が大きく増えたらキャッシュを検討する

### 企業連携の拡張（2026-09-27・本番反映済み: クライアント 2282f11／ルール／Cloud Functions）

計画書（Fable 作成・Fable レビュー済み）の P0〜P5。ユーザー決定: 所属一致で同一人物を判定・略称入力は残す（D4）／
提出期限は期間ごとに日付を直接入れる（D5）／企業内の期間は「2026年10月前半」等の選択肢で選ぶ（D8）／
企業機能と所属店舗はすべて Premium（D9）／公開ボタンは従業員画面の実装時（D10）。

- **企業設定＞店舗設定の重ね合わせは App の `effectiveSettings` で1回だけ**（`applyCompanySettings`・useMemo）。
  読み手（laborSettingsOf・staffLimitOf・laborSystemOf・getAttrOptions）は何も変えていない。
  **`saveSettings` は企業が決めた項目を剥がしてから保存する**（`stripCompanySettings`）。settings は全体 set() なので、
  剥がさないと企業の値が店舗の設定として残り、企業が外しても消えなくなる。判定は値の一致ではなく**キーの支配**。
  労務設定は 0 も企業の決定、上限・下限の 0 は未設定。企業属性の ID は `genCompanyAttrId()`（`co_`＋英数字8桁）で、
  **`genSecureId` を使わない**（記号を含み、CF の検証で約7割が捨てられる）。企業が消した属性への割当は未設定扱い
- **写し（`shops/{sid}/company`）の購読が返る前は `companyLink=null`＝企業なし側に倒す**（非連携店舗に提出ボタンを一瞬出さないため）。
  null のときは剥がしも重ね合わせもしない＝店舗の保存値は壊れない
- **所属店舗とヘルプ判定**: `settings.staffHomeShop`。店舗間シフト重複で見に行く他店舗は `dupTargetShopsFor` が
  「所属店舗が一致する同名」で決める（同名別人を誤検出しない）。旧 `staffWorkplaces` は UI を廃止し、
  判定は1リリースだけ和集合で併用する（撤去は BACKLOG）。略称サフィックス（`9三`）のヘルプ入力は従来どおり。
  **シフト作成タブの列見出しには所属店舗名を出さない**（2026-09-27 ユーザー指示で撤回。所属店舗は判定にだけ使う）
- **提出状況の期間は、どれか1店舗でも作っている最新の期間が既定**（2026-09-27 ユーザー指示。以前は今日を含む期間で、
  次の期間を作り始めても表示が前の期間のままだった）。提出期限は全店舗共通の1つだけ（店舗別は廃止）
- **提出**: シフト作成タブの「提出」が `period.submission` を `savePeriods`（差分 update）で書く。提出は保存と同じ処理
  （`flushEdits(true)`）を黙って済ませてから記録する——`localEdits` は blur 後も表示用に残るので「未保存なら提出不可」とは判定できない
- **一括PDF**: 企業連携タブが対象店舗ごとに `ShiftEditTab` を画面外へ1店舗ずつマウントし、`exportJob` で既存の `exportPdf` を
  呼ばせて1つの jsPDF に追記する（計算を二重に持たない）。**非表示マウントでは `savePeriods={null}`・`ownerReadOnly={true}`・
  `allLinkedShops={[]}` を必ず渡す**（渡さないと写し・労務合計を他店舗の期間へ書く／他店舗の提出を読みに行く）。
  **提出は `laborReadPeriodIds`（年度の全期間と前後の週）を読む**（2026-09-30 修正）。以前は対象と直前の期間しか読まず、`pastSubsLoaded={true}` のため
  読んでいない期間が実働0・全日公休として年計・年平均所定に入っていた（実測: 4〜10月に月10時間で、一括PDFの年度計 20:00・店舗単体は 70:00。
  `example-company-bulk-pdf-year.js`）
- **企業機能の対象店舗は `companies/{id}/pub/shops`**（`allLinkedShops` ではない。あちらは企業に入れていない自分の店舗も含む）
- **dev では企業機能を実機で確かめられない**: dev（Spark）に CF をデプロイできず写しが作られないため。検証は
  `.claude/skills/shifty-e2e-verify/scripts/example-company-{settings,submit,bulk-pdf}.js`・`example-home-shop-dup.js`・
  `example-staff-home-shop.js`（スタブ Firebase・実ブラウザ）と `tests/core.test.js`（CF 側の検証 `functions/company-config.js` を含む）で行う
- **ルールの反映順は従来どおり（クライアントが先）でよい**: 新クライアントは `shops/{sid}/company` の読みを拒否されても、
  購読が `console.warn` を出して企業機能が出ないだけで壊れない。CF は写しを Admin SDK で書くのでルールと独立
- **取り消し方**: develop へは `feature/company-ext` を `--no-ff` の1マージで入れてある。`git revert -m 1 <そのマージ>` で全部戻る。
  データ面は追加だけ（`staffHomeShop`・`period.submission`・`shops/{sid}/company`・`companies/{id}/pub/config`）で、
  既存のデータ・`staffWorkplaces` は消していないので、コードを戻せば従来の挙動に戻る

---

## 従業員画面（マイシフト・給料）のアカウント（2026-10-04・第2部 E1・本番反映済み）

（2026-10-05: 本番公開済み。この節の「未デプロイ」「DEV_MODE のときだけ」「本番では出ない」は当時の記述で、最新の状態は「従業員画面の 2026-10-05 時点の状態」の節）

計画は `Shifty_実装計画_2026-10.md` 第2部（E.0〜E.7）。画面は app-my.js、純粋関数は app-my-utils.js（テストは tests/my.test.js）。
**入口は本番でも開いている**: `MY_SCREEN_ENABLED = true`（app-core.js・2026-10-04 `dff85c4`）。以前は `= DEV_MODE` で開発環境だけだった。
定数は緊急時の止め口として残してあり、false にすると「マイシフト」ボタン・`#/me`・`#/m/`・公開ボタン・管理者側の承認 UI が一括で消え、
`#/me` は旧形式のスタッフURL（トークン "me"）に戻る。

- **アカウントの作り方（2026-10-05 時点）**: 新規登録は確認メール（メールリンク）で、uid は匿名 uid を引き継がない（下の「新規登録はメール確認つき」）。
  メールリンクが使えないときの従来の登録欄（`myRegister`）は、まず匿名 uid に連結を試み（`currentUser.linkWithCredential(EmailAuthProvider.credential(...))`）、
  列挙保護で拒否されたら新しいアカウントを作る。連結が通る環境なら uid が変わらないので
  提出済みの `submitterUid` と一致したまま。別の端末では `signInWithEmailAndPassword` で同じ uid に入り、**成功したら再読み込みする**
  （匿名 uid から替わるので、購読と App の状態を Phase1 から作り直す）。パスワードは8文字以上（`MY_PASSWORD_MIN`。管理者の登録は6文字のまま）
- **連結が拒否されたら新しいアカウントとして作る（2026-10-04・`4163394`）**: メールアドレスの列挙保護が有効なプロジェクト（本番・dev とも）では
  `linkWithCredential` が `auth/operation-not-allowed`（"Please verify the new email before changing email"）になる。そのときだけ
  `createUserWithEmailAndPassword` で作り、新しい uid で印と profile を書いて再読み込みする（uid が替わるので、匿名のときの提出の `submitterUid` とは一致しない）。
  回帰は `example-my-account.js` の L（スタブの `authSeed.linkBlocked:true`。以前のスタブは連結が必ず成功したので本番の不具合を検出できなかった）
- **新規登録はメール確認つき（2026-10-04 ユーザー指示「メアドの打ち間違いと不正登録防止」・`dd06a46`）**: マイシフト（`MyAuthScreen`）・管理者のログイン画面・
  設定タブのアカウント連携の3つの新規登録が、app-my.js の `EmailLinkSendBox`（アドレスだけ入れて `sendSignInLinkToEmail`）を通る。メールのリンクを開くと
  App が Phase1 の画面の代わりに `EmailLinkFinishScreen` を描き（`?elk=staff|admin`・`parseEmailLinkLanding`）、パスワード（スタッフは登録ネーム・番号も）を入れると
  `signInWithEmailLink` → `updatePassword` → 印・profile（スタッフ）／`AUTH_LOGGED_OUT_LS=false` と設定タブから始めた店舗の紐付け（管理者）→ oobCode を落とした URL で開き直す。
  戻り先の URL は `?elk=…&elh=戻るハッシュ` だけ（メールアドレス・店舗コードは URL に載せず localStorage `ots_emailLinkPending_v1` に置く）。別のブラウザでは
  アドレスをもう一度入れてもらう。管理者用とマイシフト用のアカウントは混ぜない（スタッフの登録で accounts/{uid}/shops がある・管理者の登録で users/{uid}/profile がある
  ならサインアウトして理由）。既にあるアカウントのアドレスでも、リンクを開けた＝メールを受け取れるのでパスワードを設定し直す（再設定と同じ）。パスワードの設定に
  失敗したらサインインしたまま設定し直せ、離脱した人は同じアドレスで登録をやり直すと続きができる（スタッフは印を付けてあるのでその端末ではマイシフトに入れる）。
  匿名 uid は引き継がない（uid が替わる＝列挙保護の下の従来のフォールバックと同じ）。**メールリンクが使えない（Firebase コンソールで無効・戻り先のドメインが未承認）
  ときは従来の登録欄に自動で切り替える**（`EMAIL_LINK_FALLBACK_CODES`。2026-10-04 に dev へ本物の SDK で送ると、戻り先が localhost・shiftyshifty.app・firebaseapp.com の
  どれでも `auth/operation-not-allowed`）。**前提のコンソール設定はユーザーが行う**（Authentication の「メール/パスワード」で「メールリンク（パスワードなしでログイン）」を有効・
  承認済みドメインに shiftyshifty.app・メールテンプレートの日本語化。BACKLOG）。ログイン・再設定・Google・企業コード・OTP の連携は変えていない。
  回帰は `example-email-link.js`（スタブの `authSeed.emailLink`）と `example-my-account.js`（設定前のフォールバックを通る）
- **スタッフアカウントは管理者の実ログインとして扱わない**: App は `staffUser`（{uid,email}）を別に持ち、`authUser` は null のまま。
  したがって `accounts/{uid}/shops` を読まない・書かない、`doFullSignOut` も signOut しない。判定は Phase1 の `onAuthStateChanged` で、
  ①localStorage の印 `ots_staffAccount_v1`（{uid}・登録とログインの成功で書き、ログアウトで消す）が一致すればスタッフ、
  ②印が無いメール＋パスワードのユーザー（`mayBeStaffAccountUser`）だけ `users/{uid}/profile` を読み（3秒で打ち切り）、あればスタッフ、
  ③それ以外は従来の分岐（`adminBranch`）。**スタッフアカウントには明示ログアウトの自動サインアウト（`AUTH_LOGGED_OUT_LS`）を当てない**
  ——当てると、管理者がその端末でログアウトしたことがあるだけでスタッフアカウントが毎回消える。①②は `MY_SCREEN_ENABLED` のときだけ（2026-10-04 から本番でも有効）
- **永続化**: 全クライアントが LOCAL（「セキュリティモデル」の節）。連結した端末は匿名のときと同じ LOCAL のまま残り、別端末のログインも LOCAL で残る
- **管理者の端末では作らせない・入らせない**（`myBlockReason`・`staffAccountBlockReason`）: owners は uid で判定するので、owners に載っている
  匿名 uid を連結すると、そのアカウントでログインした**別の端末にも店舗の管理権限が付く**。判定は「管理キー（`ots_adminKeys_v1`）を1つでも持つ」か
  「現在の店舗・Cookie の店舗・管理キーの店舗・キャッシュの店舗の `owners/{uid}` が読めて存在する」（読みはオーナーにしか許されない＝拒否は
  オーナーでない、それ以外の失敗は確かめられない＝止める）。企業ログイン（company_）・管理者の実ログイン中・体験版も止める。
  逆向きの防御として、`claimOwnership` はスタッフアカウントの uid を owners に登録しない（閲覧のみ）、ログイン画面の「管理コードで参加」と
  「新規作成」はスタッフアカウントの端末では止める（`MY_ADMIN_BLOCKED_MSG`）。**管理者のメールアカウント（accounts/{uid}/shops がある）で
  マイシフトにログインしたら、サインアウトして理由を残し再読み込みする**
- **ログイン試行の制限は名前空間 "staff"**（`_isLocked` 等は app-core.js の既存の仕組み）。管理者のメールログイン（"email"）のロックとは独立
- **ログアウト**: 印を消して signOut → 再読み込み。Phase1 が匿名サインインし直すので、URL からの提出は従来どおり（uid は新しくなる）
- **ルール**: `users/$uid` の読みは本人、`profile` の書きは本人かつ `auth.token.email != null`。`sign_in_provider` で判定しないのは、
  **匿名から連結した uid のトークンは sign_in_provider が "anonymous" のまま残ることがある**ため（未検証。email クレームはユーザーの記録に従って
  更新される）。連結の直後は `getIdToken(true)` で取り直してから書き、拒否されたら 1.5 秒待って1回だけ書き直す。**ルールが未デプロイの間、
  dev の実機ではプロフィールの保存が拒否される**（画面は落ちず、設定タブに理由を出し、入力した値を残して保存し直せる）
- **スタッフURLの画面から開いたマイシフトは重ねて表示する**（`data-my-overlay`）。提出画面を外すと入力途中の希望が消えるため。
  **「マイシフト」のボタンはオレンジのヘッダー（`StaffHdr`）の下・締切日の帯の上に横幅いっぱい**（2026-10-04 ユーザー指示。ヘッダーの中にあると
  375px 級の端末で期間名が「2026年10月…」と省略されていた）。白地にアクセントの文字・高さ44px。「提出状況」はヘッダーの中のまま
  ログインの再読み込みをまたいで開き直すのは sessionStorage の `ss_myOpen`
- 検証: tests/my.test.js（入力の正規化・検証・エラー文言・端末の判定・ルールの形）と `example-my-account.js`（スタブの `auth:"accounts"`・
  375px・6場面23項目。E1 より前の配信物では最初の項目で落ちる）。**実 Firebase のトークン・ルールの実測は未記録**（ルールは本番反映済み。連結は本番で列挙保護により拒否されることを 2026-10-04 に確認＝`4163394`）

### 紐付け（2026-10-04・第2部 E2・本番反映済み）

（2026-10-05: 本番公開済み。この節の「未デプロイ」「DEV_MODE のときだけ」「本番では出ない」は当時の記述で、最新の状態は「従業員画面の 2026-10-05 時点の状態」の節）

スタッフアカウントを「店舗＋登録名」に紐付ける。規則は app-my-utils.js（クライアント）と functions/staff-link.js（CF）に**同じ内容**で書き、
tests/my.test.js が乱数の入力で一致を照合する。管理者側の UI も入口と同じく `MY_SCREEN_ENABLED` の下（2026-10-04 から本番でも購読する）・オーナーの端末だけ。

- **2方式**（以前は3方式。2026-10-05 に本人が専用URLから追加する method "page" が加わった＝「従業員画面の 2026-10-05 時点の状態」の「掛け持ち」）: A＝従業員番号（`linkNumberKey`。全角数字を半角にし前後の空白を落として、**双方が数字だけのときだけ**完全一致。先頭のゼロは区別。
  照合先は `settings.staffNumbers[名前]` と、企業連携の店舗では写しの人物（`shops/{sid}/company.people`）の**数字の人物ID**）、
  B＝登録ネーム（`linkNameKey`。空白を半角・全角・途中も含めてすべて除いて一字一句一致。かな・大文字小文字は揃えない）、
  どちらも提案だけで、CF `approveStaffLink` が**候補を照合し直して**候補に無い名前を拒否する（管理者が任意の名前を選ぶ経路は無い）。
  どちらにも当たらない申請は「未リンクの申請」に残り、却下で対応する。C＝個人リンクコードは 2026-10-05 にユーザー指示で機能ごと削除した
  （スタッフ専用のURLに一本化）。以前にコードで作られた紐付けは method "code" のまま残るので、`LINK_METHODS`・ルール・`MY_LINK_METHOD_LABELS` は "code" を受け付けたまま
- **1つの名前に紐付くアカウントは1つ**（既に別の uid が紐付いた名前は提案で押せず、CF も拒否する）。**1店舗に1つの名前**（staffLinks のキーが uid）
- **店舗のオーナーの uid と企業ログイン（company_）は紐付けない**（CF の `linkTargetError`）。E1 の「管理者の端末ではアカウントを作らせない」と同じ理由
- **本人の画面**（設定タブの「勤務先のお店」・`MyLinksSection`）: 紐付いた店舗の一覧と解除、スタッフURLから開いたときはその店舗への申請（登録ネームと番号を送る）・
  申請中の表示と取り消し。**`#/me` で開いたとき（shopId が無い）は申請を出さず**、紐付いた店舗が無ければ「スタッフ用URLから開くと申請できます」の案内だけ（コードの入力欄は 2026-10-05 に削除）
- **管理者の画面**: スタッフタブの「マイシフトのリンク申請」（`StaffLinkRequestsCard`・申請があるときだけ）と、編集モーダルの「メールのアカウントとのリンク」
  （`StaffLinkEditSection`・リンク済みの人にだけ出し、表示と解除だけ）。部品は app-my.js にあり、App が `staffLinks` オブジェクト（購読した map・requests・rename・drop・reject・call）を渡す
- **改名・削除・統合への追随（計画書のリスク）**: staffLinks は名前を値に持つ。作成は CF だけだが、**改名・削除はオーナーの端末から staffLinks を直接書く**
  （ルールでオーナーに削除と `name` の書き換えだけを許した。CF が使えない環境・通信の失敗でも追随させるため）。入口はすべて StaffTab と App:
  改名（`onRenameStaff`）で `sl.drop([新しい名前])`→`sl.rename(旧,新)`、削除（`confirmDelete`）で**名前を残す期間を選んでも削除の時点で** `sl.drop([名前])`
  （削除を取り消しても紐付けは戻らない）、期限切れで行が消える経路でも `sl.drop`、スタッフの追加（`add`・番号の呼び出し `registerLookup`）で
  **同じ名前に残っていた古い紐付けを外す**。CF の `companyRenameStaff` は staffLinks と `users/{uid}/links` の写しの名前を移し、人物を変える CF は
  すべて `syncPeopleMirror` → `syncStaffLinkPersonIds` で personId を合わせ直す。tests/my.test.js が入口のドリフトを検出する
- **読む側の保証（E3 以降）**: `readMyLinks(uid)`（app-my.js）→ `resolveMyLink`（app-my-utils.js）。`users/{uid}/links` は「どの店舗か」の索引だけで、
  **名前は `shops/{sid}/staffLinks/{uid}.name`**。staffLinks が無い（解除・削除）か、その名前がいまのスタッフ一覧に無いなら無効（ok:false）として**使わない**
- **追随は購読を待たない（2026-10-04 に穴を塞いだ）**: 以前は差分を購読のキャッシュ（`staffLinkMapRef`）から作っていたので、購読が届く前の改名・削除・追加は
  何も書かれず、その後に同じ名前を登録し直すと古い紐付けが生き返った（前任者のアカウントが新しい人のシフトを見る）。いまは `sl.rename`／`sl.drop` が
  **操作**（`staffLinkOpOf`）を店舗ごとの保留の列（localStorage `ots_staffLinkOps_v1`）に積み、App の `flushStaffLinkOps` が**その時点の
  `shops/{sid}/staffLinks` を `once()` で読み直して**差分を作り（`planStaffLinkOp`）update する。読めない・書けないときは列に残して
  `MY_STAFF_LINK_PENDING_MSG`（「保留しました」）を出し（入口は app-admin.js の `staffLinkFollow`）、購読が届いたとき・`online` のとき・次の操作のときに
  前から順にやり直す（同時に2本走らせない）。**世代の目印**: 操作は自分の時刻（`.info/serverTimeOffset` で寄せた時刻）を持ち、
  紐付けの `at`（CF のサーバー時刻）がそれより新しいものには当てない（`staffLinksAsOf`）——やり直しが遅れても、操作の後に正しく作られた紐付けを消さない。
  対象は `MY_SCREEN_ENABLED`・デモでない・閲覧専用でない端末だけ（2026-10-04 から本番でも動く）。ルール・CF の変更は無い。
  **それでも残る条件**: ①保留は**その端末の** localStorage にあるので、その端末で管理画面を二度と開かなければやり直されない（ただし名前が一覧から消えていれば
  読む側で無効、同じ名前を別の端末で登録し直せばその端末の追加が読み直して外す）。②その別の端末でも読めない（ルール未反映・オフライン）なら古い紐付けは残るが、
  その場合は操作者に「保留しました」が出る。③端末の時計とサーバーの時計の差が `.info/serverTimeOffset` で取れないと、世代の判定がその差だけずれる。
  ④名前以外に登録を区別する鍵は依然として無い（スタッフの ID は無い）。personId は企業連携の店舗だけで、店舗の登録をまたいだ同一人物の判定にしか使えない。
  また subs は認証済みなら店舗全員分を読める（E.4 の既存の注意）ので、紐付けは「画面で本人の分だけを出す」ための鍵で、ルール上の保護ではない
- 検証: tests/my.test.js（照合・コード・差分・計画・ルールの形・入口のドリフト・クライアントと CF の一致）、`shifty-cf-verify/scripts/example-staff-link.js`
  （本物の index.js・44項目。拒否側を含む。E2 前の index.js では落ちる）、`shifty-e2e-verify/scripts/example-my-link.js`（スタブの cfHandlers "staffLink" が
  functions/staff-link.js の計画関数を通す・32項目・375px。E2 前の配信物では落ちる）。**ルールと CF の実機（dev・本番）は未検証**

### マイシフトと「公開」ボタン（2026-10-04・第2部 E3・本番反映済み・CF なし）

（2026-10-05: 本番公開済み。この節の「未デプロイ」「DEV_MODE のときだけ」「本番では出ない」は当時の記述で、最新の状態は「従業員画面の 2026-10-05 時点の状態」の節）

- **公開**: シフト作成タブに「公開」／「公開中 日時」と「公開を取り下げる」。`period.published={at,byUid}` を `planPeriodPublish`／`planPeriodUnpublish`
  （app-utils.js）で作り `savePeriods`（差分 update＝`p1/published` と履歴1件だけ）で書く。押す前に `flushEdits(true)` で未確定のセルを保存する
  （提出ボタンと同じ。公開は計算結果を使わないので S3 の後回しの計算は待たない）。公開はセルの編集・提出・スタッフの再提出・ルールに何も効かない（表示だけ）
- **確定は未公開なら同時に公開する**（`planPeriodConfirmation` の中＝シフト作成タブと企業連携タブの提出状況表の両方の入口に効く）。公開済みなら
  その記録（at）を書き換えない。**確定の解除では公開を外さない**（`planPeriodUnconfirm` は published に触らない）。確定の確認文に、
  未公開なら同時に公開する旨を `MY_SCREEN_ENABLED` のときだけ足している。データは本番でも同じく書かれる（confirm と同じ更新に `published` が入る）
- **公開ボタンの出る条件**（`canPublish`）: `MY_SCREEN_ENABLED`（2026-10-04 から本番でも出す）・期間あり・`savePeriods` あり・`!ownerReadOnly`・`!exportJob`（非表示マウント）・
  `featureEnabled("myShift",{plan})`（その店舗が Premium）。確定と違い企業セッションに限らない＝企業連携の店舗の店長が先に知らせるのに使う
- **履歴**: `PERIOD_HISTORY_KINDS` に publish・unpublish を足した（表示名あり・ルールに history の検証は無い）。表示名の抜けはテストが検出する
- **マイシフト**（app-my.js の `MyShiftTab`）: `readMyLinks` の ok の行ごとに periods・settings（`applyCompanySettings` で企業設定を重ねる）・staff・
  `accounts/{sid}/plan`（`DEV_PLAN_OVERRIDE` が効く）を読み、表示中の月と今日以降にかかる期間の subs だけを期間ごとの部分読み
  （`orderByChild("periodId").equalTo`）で読む。**店舗の subs 全件は読まない・店舗のデータには書かない**（書くのは users/{uid}/seen だけ＝テストで固定）。
  紐付いていない他店は、所属店舗のヘルプ勤務を出すための読み（企業に連携した店舗の settings・staff・periods と、登録がある店舗の期間ごとの subs の部分読み・2026-10-04 `64b6e76`）のほかは読まない
- **表示の規則**（`buildMyShiftDays`・app-my-utils.js）: 未公開の期間は本人の提出（`shifts[日付].start/end`・status work）をグレー（`var(--c-text3)`・ドットは `--c-text4`）で
  「提出済み（未確定）」。公開済みの期間は `scheduledDay`（管理者の調整値・退勤延長・締を含む。設定は `resolvePeriodMaster`＝確定・終了済みなら写し）を黒（`var(--c-text)`）で
  「公開」、確定済みなら「確定」。出勤にならなかった日は出さない。提出と時間が違えば「希望 …」を添える。その期間に非表示の人の公開分は出さない。
  別名で出した提出は `resolveSubByAlias`（写しの別名）で拾う
- **変更あり**: 指紋は「その人のその期間の公開済みの日ごとの `開始-終了-休憩(+締)`」（`myDayFingerprint`）。`users/{uid}/seen/{sid}/{pid}.days` と比べ
  （`myChangedDates`）、違う日を帯（`[data-my-changed]`）とマスの「変更」で出す。**初めて見る公開は「変更あり」にせず今の内容を記録する**。
  「確認した」で今の内容を記録すると消える。他人のシフトの変更・確定の有無だけの変化では付かない。seen が読めない間は書かない
- **プラン**（計画書 E.5）: `featureEnabled("myShift")` を `myShiftPremiumOf` で「紐付いた店舗のいずれかが Premium」にする。**E3 で置いた境目**: 紐付けと提出のグレー表示は
  プランに関係なく出し、公開済みの黒文字・次のシフト・変更ありを Premium の機能にした（Premium でなければ公開済みでもグレーと案内）
- **勤務先の色**: `myWorkplaceColor(shopId, 並び順, overrides)`。既定は `MY_WORKPLACE_COLORS`（先頭がアクセント #f87036）。E4 で本人が選ぶ色を overrides に渡す
- 検証: tests/core.test.js（公開・取り下げ・確定で同時に公開・解除で残る・差分の形・履歴の表示名・ゲート・入口のドリフト）・tests/my.test.js（グレー／黒・
  写し・非表示・別名・指紋・他人の変更・次のシフト・カレンダー・プラン・色・seen のルールの形・書き込み先）と
  `shifty-e2e-verify/scripts/example-my-shift.js`（スタブ・41項目・375px。E3 前の配信物では17項目が落ちる）。**ルールの実機は未検証**

### 手入力の勤務先とシフト・実績の上書き・.ics（2026-10-04・第2部 E4・本番反映済み・CF なし）

（2026-10-05: 本番公開済み。この節の「未デプロイ」「DEV_MODE のときだけ」「本番では出ない」は当時の記述で、最新の状態は「従業員画面の 2026-10-05 時点の状態」の節）

- **本人のデータは MyView が1回読む**（`useMyPersonal`・app-my.js）。`users/{uid}/workplaces`・`shifts`・`overrides` を読み、書いたら手元の状態を合わせる（購読しない）。
  マイシフトと設定タブが同じものを使う。書き込みは `users/{uid}` への差分 update（`fbUpd`）だけで、店舗のデータには書かない（tests/my.test.js が書き込み先を固定）
- **勤務先**（設定タブ・`MyWorkplacesSection`）: 一覧は `myWorkplaceList`（Shifty の店舗をリンクの順・手入力を名前の順・リンク解除済みの店舗）。
  Shifty の店舗の記録は本人が名前か色を変えたときに作る（id＝shopId）。名前が店舗名と同じか空なら持たない。色は `MY_WORKPLACE_COLORS` の6色から選ぶ（自由入力なし）。
  **Shifty の店舗の名前の横に、その店舗でのその人の従業員番号**（`settings.staffNumbers[紐付いた名前]`・`myStaffNumberOf`。番号は店舗ごとに違う・2026-10-04 ユーザー指示）。
  未登録なら出さない。アカウントの `profile.number`（1つだけ）は紐付けの提案（方式A）の照合に使う番号で、入力欄に「申請するお店の番号を入れる」旨の説明（`MY_PROFILE_NUMBER_HINT`）
  **紐付けが外れた店舗の記録は残し**「リンク解除済みのお店」として出す（本人が消すと実績の上書きも消える）。手入力の勤務先を消すと**そのシフトも一緒に消す**（確認文に件数）
- **手入力のシフト**（マイシフトの日付の詳細・`MyManualShiftForm`）: 勤務先・日付・開始・終了・休憩・メモ。**時刻と休憩は15分刻みのプルダウンだけ**（2026-10-05 に時刻は1分刻みの2列ホイールへ変更・「従業員画面の 2026-10-05 時点の状態」の節）
  （2026-10-04 ユーザー指示で自由記入の欄を削除。時刻は 0:00〜30:00＝24時超え表記を含む・休憩は 0〜180分。実績の上書きも同じ部品）。15分刻みでない以前の値
  （5分刻みで入れた 9:05・休憩10分）は選択肢に足して表示・保持する（`myTimeSelectOptions`・`myBreakSelectOptions`。黙って丸めない）。
  **終了が開始より前なら保存せず、24時超え表記を案内して「26:00 にする」ボタンを出す**（翌日扱いに自動で直さない＝シフト表と同じ表記にそろえる）。
  同じ勤務先・同じ日・同じ時間のシフトは二重に入れない。手入力のシフトは手入力の勤務先にだけ入る（Shifty の店舗には入れない＝公開分と二重に数えないため）
- **履歴から追加**: 追加の欄で、同じ勤務先の過去の時間帯（開始・終了・休憩が同じものはまとめ、新しい順に5件）をタップすると選んだ日にそのまま保存する（`myShiftHistoryCandidates`）
- **実績の上書き**: 公開済みの Shifty のシフトに開始・終了・休憩を入れる（`MyOverrideForm`）。計算は店舗の実績と同じ `resolveActualDay`（退勤延長は足さない・締の追加出勤は残す）。
  公開と同じ値で保存すると上書きを消す。**「変更あり」の指紋は公開内容（`entry.sched`）で作る**ので上書きしても付かない。
  **上書きは給料計算にだけ効く（2026-10-04 ユーザー指示「スタッフ側の出退勤時間の変更は給料計算のみに影響」・`7801432`）**: entry の時刻（startMin〜segments）は
  常に公開内容（`scheduledDay`）で、カレンダー・日付の詳細の主表示・次のシフト・.ics・Google カレンダーのリンク・全員の表は上書きの有無に関係なく公開内容。
  上書きの値は `entry.actual`（表示用の要約）と `entry.actualDay`（resolveActualDay の戻り値）にだけ載り、`myPayWorkDays` は上書きのある日だけ actual の時刻を返す。
  入れる場所は日付の詳細のまま（「給料計算の実績を入力／直す」・「実績を消す」）で、主表示の下に「給料計算の実績 …」の1行。給料タブの内訳の注記に
  「あなたが入れた実績の時間で計算した日 n日（日付）」（`myOverrideDatesIn`）。保存データ（`overrides`）の形は変えていない
  Premium でないとき（グレー表示）は上書きを当てない（公開済みの表示が無いため）
- **次のシフト**は公開済み（所属店舗が公開済みならヘルプ先の勤務を含む・`64b6e76`）と手入力の出勤（同じ日は開始の早い順・`myEntryOrder`）
- **.ics**（`buildMyIcs`）: 表示中の月の公開済み（上書きがあっても公開の時刻・2026-10-04 から。所属店舗が公開済みならヘルプ先の勤務も PDF どおり）と手入力のシフト。未公開は含めない。VTIMEZONE（Asia/Tokyo・+0900 の STANDARD 1つ）を同梱して
  `DTSTART;TZID=Asia/Tokyo:…`。24時超えは翌日の時刻、締の追加出勤は別のイベント。UID は「勤務先と日付（手入力はシフトID）」から作るので書き出し直しても同じ。
  RFC 5545 の75オクテットの折り返し（UTF-8 の文字の途中では切らない）・エスケープ（`\` `;` `,` 改行・単独の CR）・CRLF・BOM なし・`SEQUENCE`（2026-01-01 からの分＝後の書き出しほど大きい）・
  VTIMEZONE に `X-LIC-LOCATION`（2026-10-04 に互換性を点検して足した）。**UTC（末尾 Z）にしない**: iOS 27 のシミュレーターで比べると UTC の予定は
  iPhone のカレンダーで「18:00（9:00GMT）」と全件に GMT の時刻が添えられ、TZID の予定は「18:00」とだけ出た（独立した3つのパーサー＝ical.js・node-ical・
  Python icalendar はどちらの形も同じ JST の時刻に読む）。**渡し方は全端末で a[download]＋blob**（iOS 27 の Safari ではこれで「n件の予定／すべて追加」の
  画面が直接出て取り込めた）。端末ごとに変えるのは書き出した後の案内だけ（`myIcsPlatformOf`・`MY_ICS_HINTS`。iPadOS は Mac の UA＋タッチで見分ける）。
  **カレンダーへの取り込みは「この月のシフトをカレンダーに取り込む」1つだけ**（2026-10-05 ユーザー指示で、日付の詳細の各シフトにあった「Google カレンダーに追加」のリンクと
  `myGoogleCalendarLinks` を外した）。Google カレンダーは .ics の取り込みが PC のウェブ版の「設定 → インポート / エクスポート」からだけなので、案内（`MY_ICS_HINTS`・確認の手順）はそれを書く。
  **未検証**: Outlook（デスクトップ・Outlook.com）・Yahoo!カレンダー・Android の取り込みの実機、Google カレンダーの実際の取り込み（ログインが要る）、
  iOS で同じ UID を取り込み直したときに SEQUENCE で上書きされるか
- **Premium**: 手入力・上書き・.ics・勤務先の追加と編集は `myShiftPremiumOf`（紐付いた店舗のいずれかが Premium）のときだけ。Premium でないときも入れたシフトは表示し、
  **消すこと（手入力のシフトの削除・上書きを戻す・勤務先の削除）はできる**。本人のデータが読めないとき（ルール未反映）も追加と編集を止める
- **給料計算（E5）への渡し口**: `myPayWorkDays(entries)`（app-my-utils.js）。マイシフトの entry から未公開を除き、`{date, kind:"shifty"|"manual", workplaceId, shopId, periodId, shiftId,
  confirmed, source:"published"|"override"|"manual", startMin, endMin, breakMin, workMin, segments, actualDay}` にそろえる。`actualDay` は Shifty の日の `resolveActualDay` の戻り値
  （上書き適用後・`premiumDayInput` の own にそのまま渡せる）
- 検証: tests/my.test.js（時刻の入力・24時超え・休憩・ID・勤務先の一覧と update の中身・手入力と Shifty の並び・次のシフト・履歴・上書きと指紋・給料の1日・.ics・ルールの形・書き込み先）と
  `shifty-e2e-verify/scripts/example-my-manual.js`（スタブ・375px。E4 前の配信物では最初の項目で止まる）。**ルールの実機は未検証**

### 給料（E5）と会社設定の賃金（E6）（2026-10-04・第2部・本番反映済み）

（2026-10-05: 本番公開済み。この節の「未デプロイ」「DEV_MODE のときだけ」「本番では出ない」は当時の記述で、最新の状態は「従業員画面の 2026-10-05 時点の状態」の節）

計画書 E.2「給料」「設定」・E.4・E.5・E.6。純粋関数は app-my-utils.js の「給料」の節、CF の判定は functions/my-pay.js。**金額は目安**で、月次賃金ページ（給与計算の元）とは別物として表示する。
- **支給月**: 勤務日 → 締め月（`myClosingMonthOf`・その月の締日以前ならその月、過ぎていれば翌月。31・短い月の29〜30は月末に寄せる）→ 支給月（＋payMonthOffset）。
  締め期間は「前の月の締日の翌日〜その月の締日」（`myClosingRangeOf`）。給料日は土日祝（`isWeekendOrHoliday`）なら前倒し・後ろ倒し・そのまま（`myPayDateOf`。後ろ倒しで翌月にかかってもよい）。
  当月払いは給料日を締日より後に限る。**締日と給料日が未設定の勤務先は月末締め・翌月25日・土日祝は前倒しで振り分け**、その旨を内訳に出す（`MY_PAY_DEFAULT`）
- **Shifty の店舗の計算は既存の関数だけ**: 日ごとに `resolveActualDay`（本人の上書き込み）→ `premiumDayInput` → 暦月ごとに `premiumMonthOf`（設定は月次賃金ページと同じ
  「その月に始まる最も新しい期間」の設定・確定済みなら写し＝`myMonthSettingsOf`）→ 締め期間の日の時間を足して `wageOf`／`deductionOf`（率は写しの `wageSettings` の
  `premiumRatesOf`・端数は `roundingRuleOf`・分母は `rateDenominatorMinOf`）。日ごとの時間外は `perDay`（①はその日・②は週の最後の日・③は月の最終日）、
  **月60時間超はその月の時間外を日付の順に積んで60hを超えた分**（月の合計は over60Min と一致）。**月末締めなら月次賃金ページと同じ金額**（tests/my.test.js が時給者・月給者・率と端数あり／なしで照合）。
  締日が月末でない勤務先は「目安」の印と、月単位の割増が明細とずれうる注記を出す（計画書のリスク）
- **月次賃金ページとの差が出る条件**（同じ人・同じ月でも）: ①店舗の打刻の実績（`shops/{sid}/actuals`）は本人に読めないので使わず、本人の上書き（`users/{uid}/overrides`）を使う。
  ②月所定の登録値（`laborMonths`）・年平均所定を使わない（賃金の式に入らないので額は変わらないが、警告は出さない）。③**ヘルプ先の勤務は所属店舗の行に所属店舗の賃金で合算する**
  （2026-10-04 `64b6e76`。それより前は合算しなかった。月次賃金ページの P3.6 と同じく `premiumDayInput` の helpers に渡し、内訳に「うち他店でのヘルプ」。
  ヘルプ先にも紐付いていれば寄せた日はヘルプ先の行から外す。ヘルプ先の打刻実績は使わない）。④未公開（グレー）の期間・Premium でないときは数えない。
  ⑤月の途中で賃金の版が変わっても日割りしない（月次賃金と同じ）。版は締め期間の初日に効く版（月末締めなら月初＝月次賃金と同じ）
- **確定分と見込み**: 確定分は今日までの日の時間で同じ式を通した額、見込みは合計との差（端数の合計がずれない）。**月給者の基本給・手当・月額の交通費は締め期間が終わるまで見込み**。
  基本給は締め期間で日割りしない（月次賃金と同じ。月給者は基本給を動かさず割増と控除だけ）。欠勤控除は不就労（本人の画面では店舗の実績が無いので通常は0）
- **手入力の勤務先**: 時給×実働（円未満切上げ）に、オンにした割増だけを足す（深夜25%＝22〜5時・休憩は拘束の比率で按分＝`nightMinutesOf` と同じ／1日8時間超25%）。日給は日給×出勤日数（割増なし）
- **賃金の出どころ**（`myWageSourceOf`）: 会社設定（getMyPay）の版 → 本人の時給／日給 → どちらも無ければ時間だけ。会社設定があれば交通費も会社設定
- **月間目標は任意（2026-10-04 ユーザー指示）**: 合計・確定分・これからの見込み・勤務時間・勤務先ごとの行・内訳・年は目標と関係なく出す。円グラフ（進み具合）は
  **目標を設定したときだけ**で、目標が無いときは合計を大きく出す（`myPaySummaryOf`）。時給（日給）が未設定の勤務先は名前と「設定で時給を入れる」を出す
  （個別URLの給料タブからも設定タブへ行ける）
- **これまでの給料をまとめて入力（引き継ぎ・2026-10-04 ユーザー指示）**: 年の表示の「これまでの給料をまとめて入力」（`MyReceivedBulkForm`）。その年の支給月×勤務先の振込額を
  1画面で入れる（勤務先が2つ以上ならプルダウンで切り替え・入れた値は残る）。置き場は既存の振込額 `actuals/{支給月}/{勤務先}`（新しいノード・ルールなし）。
  保存は**変えたセルだけ**を1回の update（`planMyReceivedBulk`）。空欄は変えず、入っていた金額を消したときだけ件数を確認して null。読めない入力があれば書かない。
  年の表の規則は変えていない（見込み（目安）と振込額は別々の列と別々の年間合計。シフトの無い月の振込額も振込額の年間に入る）。境目は振込額の入力と同じ（canEdit）
- **画面**: 給料タブ（月＝支給月ごとの円グラフ（月間目標に対する確定分・1つの弧・アクセント1色・目標があるときだけ）・合計・確定分・見込み・勤務時間・勤務先ごとの行と内訳・振込額の入力／
  年＝支給月ごとの見込みと振込額・年間合計）。設定タブの勤務先の編集に「給料」（締日・給料日・土日祝・時給／日給・交通費、手入力は割増のオン／オフ）、
  「月間目標」の節。**Premium（紐付いた店舗のいずれかが Premium・`myShiftPremiumOf`）でなければ金額を出さず、給料設定と振込額は表示だけ**（変更できない）。手入力の勤務先しか無い人も使えない
- **E4 の渡し口 `myPayWorkDays` は使っていない**: 週40h・法定休日の判定に休日・データの無い日まで要るので、店舗の期間の全日を `myShiftyDayInfo` で作り、
  各日を `resolveActualDay` に通し直す（`myPayWorkDays` は勤務のある日だけを返す）。`myPayWorkDays` は残してあり、テストもそのまま
- **読む範囲**: 支給月（年の表示なら12か月）ごとの締め期間を含む暦月の全日と前後1週（`myPayReadRange`）にかかる期間の subs だけ（期間ごとの部分読み）。読み込みはマイシフトと共有の
  `useMyShiftSources`（app-my.js）。**書くのは users/{uid} の pay・goals・actuals だけ**（tests/my.test.js が書き込み先を固定）
- **getMyPay（E6）**: Callable・`{shopId}` だけを受け取る。呼び出し元 uid の `shops/{sid}/staffLinks/{uid}.name` を確かめてから（メールのある認証・紐付けあり・名前がスタッフ一覧にある）
  `shops/{sid}/private/pay/{名前}` を読み、いまの版と過去の版（`normalizePayVersion` と同じ形・updatedAt なし）を返す。**名前・uid は呼び出し元から受け取らない＝他人の賃金は取れない**。
  閲覧パスコードは求めない（本人の分だけ）。shopId の形とデモ店舗を確かめる。何も書かない。最低賃金・割増率・端数は写しからクライアントが読むので返さない
- **ヘルプ先だけの紐付け**: 賃金は所属店舗の private/pay にある（P6a）。紐付いた店舗に記録が無く `staffHomeShop` が別の店舗なら、getMyPay は `pay:null` と所属店舗を返し、
  画面は「賃金は所属店舗（◯◯）で設定されています」と出して本人の設定で計算する（所属店舗の賃金を他の店舗の紐付けからは返さない＝紐付けの無い店舗の private を読まない）
- **会社設定の表示**: 勤務先の編集で「会社設定（お店が登録した賃金・変更できません）」として時給／月給・手当・固定残業・交通費・適用開始を出し、時給と交通費の入力欄を出さない。
  **CF が使えない（未デプロイ・通信・dev は CF が無い）ときは本人の設定にフォールバックし「会社の賃金設定を確認できませんでした」**。結果は uid と店舗ごとに覚え、失敗は覚えない
- 検証: tests/my.test.js（締め期間・給料日・検証・手計算の額・月次賃金との一致・20日締め・グレーと上書き・手入力・年・ルールの形・書き込み先・CF の版の形の一致と判定）、
  `shifty-e2e-verify/scripts/example-my-pay.js`（スタブ・375px。E5 前の配信物では落ちる）、`shifty-cf-verify/scripts/example-my-pay.js`（本物の index.js・15項目。E6 前の index.js では13項目が落ちる）。
  **ルールと CF の実機（dev・本番）は未検証**

### スタッフ個別URL（2026-10-04・ユーザーの仕様変更・本番反映済み）

（2026-10-05: 本番公開済み。この節の「未デプロイ」「DEV_MODE のときだけ」「本番では出ない」は当時の記述で、最新の状態は「従業員画面の 2026-10-05 時点の状態」の節）

決定（ユーザー・2026-10-04）: ①メール＋パスワードのアカウント（E1〜E6）と**併用**（個別URLで閲覧と提出・アカウントは任意で残す）。②給料は**4桁の暗証番号**。
③登録はすべて**管理者が承認**。④全員のシフト表は**公開済みだけ**。計画書 `Shifty_実装計画_2026-10.md` の末尾「追記: スタッフ個別URL」。画面は app-my.js 末尾、
純粋関数は app-my-utils.js の「スタッフ個別URL」の節、CF の判定は functions/my-page.js。**すべて `MY_SCREEN_ENABLED` の下**（2026-10-04 から本番でも有効。止め口を false にすると parseUrl が `#/m/` を返さなくなる）。

- **ルーティング**: `#/m/<pageToken>`（parseUrl が `{type:"page",pageToken}`。#/s/ と旧形式より先に判定）。App は `_hasUrlToken`・`urlLocked` を個別URLでも立てる
  （セッションの店舗・期間を復元しない・管理者の経路に入らない・lazy claim しない）。Phase1 は `staffPageTokens/{token}` → `global/shops/{shopId}` を直キーで読み、
  スタッフURLと同じく `enterShop`（店舗の settings・periods・staff・subs を購読）。`pageBoot` に結果、`MyPageView` が描く。apid は常に最新の期間（`latestPeriod`）に追随させる
- **申請**: 募集URL（StaffView の「自分専用のURLを作る」→ 重ねて表示する `MyPageRegister`）。名前と任意の番号を入れると、トークンを作って `staffPageTokens` →
  `staffPages`（pending）の順に書き、その場で個別URL（コピー・共有）と「承認待ち」を出す。作ったURLは端末の localStorage（`ots_myPages_v1`）に店舗ごとに覚えて見せ直す。
  **募集URLだけで名前を入れて提出する従来の動線は変えていない**（VISION 原則1）
- **承認**（スタッフタブの「個別URLの申請」・`StaffPageRequestsCard`）: 候補は紐付けの A・B（`linkCandidatesFor`）で、選んだ状態で出す。**管理者がスタッフ一覧から任意の名前を
  選んで承認できる**（CF を使わずオーナーが書くので、E2 と違い候補に縛らない）。スタッフ一覧に無い人は先にスタッフを追加してから（承認時に追加するボタンは置かない＝
  人数の上限・別名の規則はスタッフの追加の経路が持つ）。差分は App の `staffPageAct` が**その時点の staffPages を `once()` で読み直して**作り update する。
  1つの名前に承認済みは1つ（新しい承認が前のものを revoked にする）。編集モーダルの「スタッフ専用のURL」（`StaffPageEditSection`）で URL の表示・取り消し・暗証番号のリセット
- **管理者が直接発行（2026-10-04 ユーザー指示「個人リンクコードは新規登録に繋がる URL の方が助かる」・`a47183e`）**: 編集モーダルの「このスタッフ専用のURLを発行」で、
  その名前の**承認済み**の記録を申請なしで作る（`planIssueStaffPage`・App の `staffPageAct("issue")`。逆引き `staffPageTokens` を先に、記録を後に書く）。本人は URL を開くだけで
  自分の画面に入る（名前・番号・メール・パスワード・コードの入力なし）。発行済みの人には URL を出し直し、「新しいURLを発行」（確認つき）で古い URL を revoked にする。
  記録の形は承認したものと同じ（displayName は名前・requestedAt は発行時刻・byUid）なので、**ルールと CF の変更は無い**（オーナーは approved を新規作成でき、逆引きは新規作成なら書ける）。
  改名・削除の追随も同じ（planStaffPageOp）。一覧の行に「URL」の印（発行済み）。個人リンクコードは 2026-10-05 に機能ごと削除した（CF・ルール・画面とも。リンク済みの人の編集モーダルには「メールのアカウントとのリンク」の解除だけが出る）。
  回帰は `example-staff-page-issue.js`
- **改名・削除・同名の再登録への追随**: 紐付けの保留の列（`b43a7d7`）の**同じ操作を staffPages にも当てる**（`flushStaffLinkOps` が staffLinks と staffPages を順に読み直す。
  `planStaffPageOp`・世代の目印は approvedAt）。改名は name を移し、削除は revoked（同じ名前を登録し直しても古いURLは生き返らない）。読む側（`resolveMyPage`）も
  「承認済みで、名前がいまのスタッフ一覧にある」ときだけ使う（missingName で止める）
- **本人の画面**（`MyPageView`・下部タブ マイシフト／提出／給料／設定）: マイシフト・給料・勤務先・月間目標はアカウントと**同じ部品**を「本人」（subject）を替えて使う
  （`myAccountSubject(uid)`＝users/{uid}・`myPageSubject`＝staffPageData/{token}。base と links() と companyPay(sid)。tests が base の出どころを2か所に固定）。
  マイシフトは「自分のシフト」「全員のシフト」を**横スクロール（scroll-snap）とタブで切り替え**（`MyShiftPager`。ピンチで拡大している間＝visualViewport.scale>1 は横スクロールを止める。
  表示が1つのときはタブを出さない＝木の形は同じなので、後から「全員のシフト」が足されても「自分のシフト」は作り直されない）
- **開いた直後の既定はマイシフト（下部タブ）の本人のカレンダー（横スワイプの「自分のシフト」）**。タブも横スワイプの位置も保存しない（`MyPageView` の `useState("shift")`・`MyShiftPager` の `useState(0)`）ので、
  全員のシフト・提出タブへ移ってから開き直してもマイシフトから始まる（2026-10-04 にユーザー指示を受けて実測。develop と `19da811` で Chromium・WebKit の iPhone 13 とも既にこの挙動＝コードの変更なし。回帰 `example-my-page.js` の V_defaultIsMyCalendar）
- **全員のシフトの期間の選び方（2026-10-04 改め・ユーザー指示）**: 未公開でも「まだ公開されていません」の案内を**出さない**。表の上の**期間のプルダウン**の選択肢は
  **公開済みかつ startDate が直近3ヶ月**（管理者画面の subs 部分購読と同じ `subsWindowCutoff`）の期間を新しい順（`myAllShiftPeriodOptions`）、既定はその先頭＝
  **今日を含む期間**（2026-10-05 改め・`myNowPeriodOf`。今日を含む公開済みが無ければ今日より前に始まった最も新しい公開済み、それも無ければいちばん近い先の期間。次の期間を先に公開しても既定は今の期間のまま。選択肢の並びは新しい順のまま）。店舗が Premium でなければ選択肢は空。**選択肢が1つも無ければ「全員のシフト」の切り替えごと出さない**
  （プレミアムの案内文も出さない）。部品は `MyAllShiftPane`（期間の select だけ・`AI`＝16px。**店舗の select は 2026-10-05 に廃止**＝下の「1画面に縦に並べる」）と `myAllShiftStack`
  （選んだ期間が選択肢から消えたら既定へ戻す。旧 `myAllShiftSelection` はテストだけが使う）。個別URLの提出は App の購読（直近3ヶ月の期間ごとの部分購読＝選択肢と同じ窓）をそのまま使う。**「提出」タブの対象は従来どおり最新の期間**
- **メールのアカウント（`#/me`）の全員のシフト（2026-10-04・ユーザー指示）**: `MyAccountShiftPager` が「自分のシフト」「全員のシフト」を同じ部品で出す。店舗は
  **有効な紐付け（`readMyLinks` の ok＝承認済みで名前がいまのスタッフ一覧にある）の全店舗のうち、選べる期間がある店舗**（`myAllShiftChoices`・並びは readMyLinks の並び）。
  既定の店舗は**募集URLの「マイシフト」から開いたときはその店舗**、それ以外は**今日を含む期間がある店舗**を先に、その中で既定の期間の startDate が最も新しい店舗（同じなら並びの先・2026-10-05）。
  読み込みは `useMyAllShiftSources`（店舗ごとに periods・settings・staff・company・plan、選んだ期間の subs だけを `orderByChild("periodId")` の部分読み・読んだ期間は覚える・書き込みなし）。
  同時に開く「自分のシフト」と同じ店舗を2回読まないよう `readMyShiftShopShared`（読めたものだけ30秒）を共有する
- **全員のシフト表**（`MyAllShiftTable`・`buildMyShiftSheet`）: 選んだ期間が公開済み・その店舗が Premium のときだけ（それ以外の状態は何も描かない）。
  **PDF の「シフト表」と同じ仕様**（2026-10-04 ユーザー指示）＝**同じ関数**（app-utils.js の `shiftTableHtmlOf` 以下）で作った HTML を `dangerouslySetInnerHTML` で入れる
  （文字はすべて `shiftSheetEsc` を通す）。日付と曜日（左右）・上が出勤／下が退勤・時刻は「17.5」の表記で保存値（管理者の調整値＞提出値。退勤延長は足さない）・
  メモ（h/k/x・略称・研修 等）と締・休み希望／休暇／休みの提出は斜線（種別名は出さない）・変更マークの緑・メモの黄色・従業員番号の行・名前の色・土日祝の色・
  この期間に提出した未登録の名前の列・空白列（35人超は日付）・昼夜の人数（`headcountAt`。他店の略称は企業の写しの店舗の `settings/shopAbbrs` だけを読む）。
  **PDF と違うのは2つだけ**: ①入力中の編集は無い、②本人の列の名前の見出しに印（`data-sheet-me`）。
  **他店でのヘルプ勤務（H2）も PDF と同じに出す（2026-10-04 ユーザー指示・`828875d`）**: `buildMyShiftSheet` が `helpers`（写しと連携店舗の `otherShopDataOf`）を受け取り、
  シフト作成タブの helperDisp と同じ規則（所属店舗＝role "home" の人だけ・休暇の日は出さない・自店と重なる勤務は足さない・`helperCellDisplay`）で解決する。
  材料は app-my.js の `useMyHelperShops`: 企業に連携していない店舗では他店を何も読まず、連携店舗（写しの法人が分かれば同じ法人だけ）の settings・staff・periods と、
  **表示中の期間の日付にかかる期間の subs だけ**を期間ごとの部分読みで読む（PDF は他店の subs を丸ごと読むが、ここは読まない）。書き込みなし・30秒覚える。
  読み終えるまではヘルプなしの表を出して差し替え、読めない他店があれば「ほかのお店でのヘルプ勤務の一部を読み込めませんでした」（`data-my-all-helpers`）
  **比率を保って画面の横幅に合わせる**（`transform: scale`・`myShiftSheetScale`・2倍まで。白地・黒文字の紙と同じ見た目でダーク表示でも変えない。ピンチで拡大）。
  回帰 `example-my-sheet-pdf.js` が PDF 出力の table と HTML の一致（印を外して）を確かめる。実測: 30人×5日 375px で倍率0.288
- **提出**: 「提出」タブは最新の期間へ、承認された名前で固定（`StaffView` の `fixedName`。名前の入力欄なし・Cookie を読まない書かない）。提出の処理は募集URLと同じ
  App の `staffOnSub`（差分書き込み・締切・carryAdminShiftFields・別名の解決はそのまま）。確定済みの期間は StaffView が止め、ルールも拒否する
- **給料の暗証番号**: 給料タブは CF `myPagePin` で開く（初回に決める・設定タブで変更・管理者のリセット＝`pinResetAt`）。開いた状態は MyPageView のメモリだけ
  （再読み込み・10分操作なしで伏せる）。開くまで設定タブにも給料の設定・月間目標を出さない。会社が登録した賃金は照合が通ってから CF が返す。**CF が使えない環境（dev）では開かない**
- **capability モデルの限界（承知のうえ）**: 個別URLにはログインが無いので、**pageToken を知る人は誰でも** その人のシフト・本人のデータ（staffPageData：
  本人が入れた時給・交通費・締日・振込額・手入力のシフト）を REST で読める。暗証番号は画面上の鍵で、本人が入れた給料の設定は守らない。
  守るのは**会社が登録した賃金（private/pay）だけ**（CF が番号を照合してから返す・ハッシュはクライアントから読めない場所）。URL の漏えい時は管理者が取り消す。
  また subs は認証済みなら店舗全員分を読める（E.4 の既存の注意）ので、全員の表は「公開済みだけを画面に出す」絞り込みで、ルール上の保護ではない
- **TimeTree などで見る案内**（2026-10-04）: **マイシフトの一番下**に折りたたみ（`MyIcsAppGuide`・文言は `MY_ICS_APP_GUIDE`。同日のユーザー指示で .ics の書き出しの直下から移した。書き出しのボタンの位置は変えていない）。TimeTree の公式ヘルプで確かめた事実
  （.ics を直接取り込めない・端末の標準カレンダーの予定をホームカレンダーに表示できる＝自動更新・共有カレンダーへのインポートは自動更新されず重複しうる）だけを書き、
  端末（iOS・Android・PC）ごとの3手順を出す。確かめていない他社アプリの名前は出さない。.ics の中身と渡し方は変えていない
- **カレンダーへ取り込む前の確認**（2026-10-04・ユーザー指示「ホーム画面にブックマークを保存する必要がある、ないしはその他操作が必要ならその操作を促すポップアップ」）:
  「この月のシフトをカレンダーに取り込む」を押したとき、**この端末・このブラウザで追加の操作が要るときだけ**モーダル（`MyCalendarPrompt`）を出す。
  条件と文言は `myCalendarPromptOf`（app-my-utils.js）1本で、入力は UA・タッチ点・standalone。**ホーム画面への追加は取り込みに不要なので促さない**
  （iOS 27 のシミュレーターで、Safari のタブとホーム画面から開いた状態＝navigator.standalone の両方で a[download]＋blob が「カレンダーに追加」の画面を出し、閉じると戻った。
  UA は両方同じ）。ホーム画面から開いた iOS だけ、書き出した後の案内に「出ないときは Safari で開く」の1文を足す（古い iOS で効かない報告があり、UA の OS 表記は 18_7 固定で版を分けられない）。
  出す環境: アプリの中のブラウザ（LINE・Instagram・Facebook・TikTok・Android の「; wv」・「Safari/」の無い iOS の UA）＝**必須**（「次から表示しない」を覚えていても出す）、iOS の Safari 以外のブラウザ（CriOS 等）・Android の Chrome・PC の .ics＝**任意**
  （localStorage `shifty_my_calPrompt_v1` に `{"ics:downloadThenOpen":true}` の形で覚える）。iOS の Safari は出さない。LINE は「Safariで開く／Chromeで開く」で今の URL に
  `openExternalBrowser=1` を足して移る（`myExternalBrowserUrl`・ハッシュ #/m/… と #/me を保つ）。ほかのアプリは「URL をコピー」（コピーできなければ URL の欄）。
  #/me ではログインし直しの1行を足す。誤判定しても「このまま書き出す」で先へ進める。確認で手順を見せたときは書き出した後の案内を重ねない。
  **アプリの中のブラウザの実機は未検証**（シミュレーターに LINE 等が無い。BACKLOG の実機確認 ⑥）。回帰は `example-my-cal-prompt.js`（UA と standalone を差し替える）
- 検証: tests/my.test.js（トークン・状態・承認と追随の差分・候補・全員の表と寸法・期間と店舗の選び方・暗証番号の計画・CF との一致・ルールの形・入口と書き込み先のドリフト）、
  `shifty-e2e-verify/scripts/example-my-page.js`（スタブ・P1〜P4・375px／320px・WebKit iPhone 13 でも allPass。73942db の配信物では最初の項目で止まる。
  AL0・AL の期間のプルダウンは 89a455c の配信物で EXIT=2）、`example-my-shift.js` の AM（#/me の全員のシフト・89a455c で EXIT=1）、
  `shifty-cf-verify/scripts/example-my-page.js`（本物の index.js・30項目。73942db の index.js では28項目が落ちる）。**ルールと CF の実機（dev・本番）・iPhone の指のスワイプとピンチは未検証**

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
| `purgeInactiveShops` | schedule 毎日（JST） | 1年未更新店舗を archived/ へ退避→30日後に本削除。Invalid Dateはスキップしてログ。削除した個人リンクコードの残り（`staffLinkCodes`・`staffLinkCodeIndex`・`staffLinkCodeAttempts`）があれば丸ごと消す（2026-10-05）。退避する店舗のスタッフ個別URLの `staffPageTokens`・`staffPageData`・`staffPagePins` も消す（2026-10-04。本人のデータは archived に残さない）。URLをなくしたとき用のメールアドレス（`staffPageEmails`）とその逆引き（`staffPageEmailIndex`）も消す |
| `purgeOldPeriods` | schedule 毎日（JST） | endDateが36ヶ月超の期間の period・subs・tokens・actuals（P4）を削除。`PURGE_OLD_PERIODS_DRY_RUN=true` でdry-run中（本有効化はBACKLOG参照） |
| `sendSurveyEmails` | POST `/sendSurveyEmails` | ユーザーアンケート一斉送信（要秘密トークン） |
| `createCompany` | Callable `createCompany` | 企業アカウント作成（企業コード発行・パスワードハッシュ保存・作成者オーナー店舗を連携） |
| `companyLogin` | Callable `companyLogin` | 企業コード＋パスワードで認証しカスタムトークンを発行。**カスタムトークンの署名に、CF の実行サービスアカウントの「サービス アカウント トークン作成者」（`iam.serviceAccounts.signBlob`）が要る**——無いと照合は通るのに `createCustomToken` が `auth/insufficient-permission` で 500 になり、画面は「ログインに失敗しました」だけを出す（2026-09-27 に本番で実際に発生・`firebase functions:log --only companyLogin` で確認）。ログイン画面と企業連携タブの「企業アカウントでログイン」の両方がこれを呼ぶ |
| `changeCompanyPassword` | Callable `changeCompanyPassword` | 企業パスワード変更。**現在のパスワード（`currentPassword`）を照合してから**変える（2026-09-27）。UI は新しいパスワードを2回入力して一致したときだけ送る。**変更できるのは企業の作成者のアカウント（`pub/ownerUid`）だけ**で、企業コードでログインしたセッション（uid が `company_` で始まる）は `permission-denied`（2026-09-28・判定は `functions/company-config.js` の `canChangeCompanyPassword`）。UI もそのセッションではボタンを出さない |
| `renameCompany` | Callable `renameCompany` | 企業名変更（作成者ポインタの表示名も更新） |
| `linkStoreToCompany` | Callable `linkStoreToCompany` | 管理コード（shopId.adminKey）で店舗を企業に連携（CF は既にオーナーなら shopId だけでも通すが、クライアントは 2026-10-08 から管理コードの形しか送らない） |
| `saveCompanyConfig` | Callable `saveCompanyConfig` | 企業の共通設定（settings は丸ごと置換）と提出期限（期間ごとの差分）を保存し、連携全店舗の `shops/{sid}/company` を作り直す（2026-09-27）。検証は `functions/company-config.js`（純粋関数・テストで照合） |
| `ensureCompanyEntities / createEntity / renameEntity / assignShopEntity / saveEntityConfig / setShopKind` | Callable | 法人の管理（2026-09-30・P1・本番反映済み）。権限は `assertCompanyMember`。保存後に写しを作り直す。規則は `functions/company-config.js` |
| `ensureCompanyPeople / mergePeople / splitPerson / reassignPersonId / companyRenameStaff / companyUpdateStaff / markPeopleDistinct` | Callable | 人物ID と企業スタッフ一覧の編集（2026-09-30・P1b・本番反映済み）。`markPeopleDistinct` は「統合しない」（`{personIds:[…], distinct:true}` で全ペアを両方向に記録、`{personIds:[a,b], distinct:false}` で取り消し。写しは作り直さない）。権限は `assertCompanyMember`。人物（`companies/{id}/pub/people`）を作るのは `ensureCompanyPeople` だけ。改名は店舗のデータを差分 update で移す（上の「人物ID と企業スタッフ一覧の編集」）。規則は `functions/company-config.js` |
| `setCompanyPayCode` | Callable | 企業の賃金閲覧パスコードの変更（2026-09-30・P6a・本番反映済み）。現在の番号を照合（未設定なら 0000）し、`companies/{id}/private/payCode` と連携全店舗の `shops/{sid}/private/payCode` に同じハッシュを書く。作成者と企業セッションの両方が可（`assertCompanyMember`）。`syncCompanyMirror` も写しを作り直すたびに企業のパスコードを同期する（後から連携した店舗に届く） |
| `approveStaffLink / unlinkStaff` | Callable | 従業員画面の紐付け（2026-10-04・第2部 E2・本番反映済み。個人リンクコードの `issueStaffLinkCode`・`redeemStaffLinkCode` は 2026-10-05 にコードから削除＝本番の関数の削除は未実施）。承認は店舗のオーナー（`owners/{uid}`）、解除は本人かオーナー。shopId・uid・名前はパスに埋め込む前に形を確かめ、デモ店舗は拒否。紐付けは `shops/{sid}/staffLinks/{uid}` と `users/{uid}/links/{sid}` を同じ update で書く。規則は `functions/staff-link.js` |
| `linkStaffPage` | Callable | 専用URLのお店をメールのアカウントに追加（2026-10-05・**本番未デプロイ**）。`{token, pin?}`。メールのある認証だけ。URL が使える状態を `myPageAccessCF` で確かめ、名前は staffPages の承認済みの name（呼び出し元から受け取らない）。暗証番号を決めている URL は myPagePin と同じ照合（トランザクションで試行回数を数える）を、リンクできることを確かめた**後**に通す。管理者の再承認はしない。staffLinks（method "page"）・users/{uid}/links を書き、保留中の申請を消す。規則は `functions/staff-link.js` の `planLinkStaffPage` |
| `myPagePin` | Callable | スタッフ個別URLの給料の暗証番号（2026-10-04・本番反映済み）。`{token, action:"status"|"set"|"verify", pin?, currentPin?}`。URL が使える状態（承認済み・名前がスタッフ一覧にある）を確かめ、`staffPagePins/{token}` のハッシュと照合する（5回の誤りで15分・トランザクションで数える）。照合が通ると（決めたときも）会社が登録した本人の賃金（`private/pay/{staffPages の name}`）を getMyPay と同じ形で返す。名前・店舗は受け取らない（URL から引く）。デモ店舗は拒否。規則は `functions/my-page.js` |
| `getMyPay` | Callable | 従業員画面の会社設定の賃金（2026-10-04・第2部 E6・本番反映済み）。`{shopId}` だけを受け取り、呼び出し元 uid の staffLinks の名前の `private/pay` を返す（本人の分だけ・名前は受け取らない）。メールのある認証・紐付けあり・名前がスタッフ一覧にあることを確かめ、shopId の形とデモ店舗を拒否。何も書かない。規則は `functions/my-pay.js` |
| `notifyNewPeriod / notifyStaffSubmit / notifyDeadlines` | DB トリガー・schedule | 通知（Web Push・2026-10-08）。新しい期間の作成でスタッフへ（承認済みの個別URLとアカウントの紐付け・終了済みの期間とデモは送らない）、スタッフの提出・再提出で管理者へ（owners にいる uid の購読だけ・店舗ごとに1時間60件まで）、毎日12:00 JST に締切日の未提出のスタッフ（別名・非表示を考慮）と、企業への提出締切日に未提出の期間の管理者へ。送信は npm の `web-push`（VAPID）。宛先と判定は `functions/notify.js`。410/404 の購読は消す。**提出かどうかは `submittedAt`（初回）と `isUpdated:true`＋`updatedAt` の進み（再提出）で判定する**ので、`isUpdated`・`updatedAt` を書いてよいのはスタッフ画面だけ（管理者の編集で書くと「提出しました」が送られる・テストが守る）。入口はマイシフトと個別URLの設定タブ、管理者の設定タブ「通知（この端末）」。募集URLだけのスタッフは本人を特定できないので対象外。iPhone はホーム画面に追加したアプリだけ。入社日・退社日（staffTenure）は締切の宛先にまだ当てていない |
| `claimCompanyShop` | Callable `claimCompanyShop` | 連携済み店舗のオーナーに**呼び出し元のuid**を登録（企業連携タブの「ログイン」で管理コードの再入力を無くす。付与は `companies/{id}/grants/{shopId}/{uid}` に記録し、解除時に回収する） |
| `unlinkStoreFromCompany` | Callable `unlinkStoreFromCompany` | 店舗の企業連携を解除（企業uid＋`grants` の付与uidを owners から外す） |

### Stripe Webhook イベント処理

| イベント | 処理 |
|---|---|
| `checkout.session.completed` / `invoice.payment_succeeded` | `accounts/{shopId}/plan`（price から解決した pro または premium）・`planExpiry`・`stripeCustomerId`・`stripeSubscriptionId` を更新し、解約予約・変更予約の表示を消す。更新の請求が現行より下位のプランなら反映しない |
| `invoice.payment_succeeded` | `paymentFailed` を消す |
| `invoice.payment_failed` | `accounts/{shopId}/paymentFailed = true` |
| `customer.subscription.updated` | `cancelAtPeriodEnd`・`currentPeriodEnd` と、有効な契約なら price から `plan` を反映（追跡中と別の契約は無視） |
| `subscription_schedule.created` / `subscription_schedule.updated` | 降格の予約（`scheduledPlan`・`scheduledPlanDate`） |
| `subscription_schedule.released` / `canceled` / `completed` | `scheduledPlan`・`scheduledPlanDate` を消す |
| `customer.subscription.deleted` | `accounts/{shopId}/plan = "free"`（解約された契約のプランが現行と違えば何もしない） |

### Secrets（firebase functions:secrets:set で設定済み）

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SMTP_USER
SMTP_PASS
SURVEY_SEND_TOKEN
VAPID_PRIVATE_KEY   ← 通知（2026-10-08）。公開鍵は app-core.js と functions/notify.js（一致をテストで照合）
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
- [ ] `npm test` が全パスするか（tests/core.test.js・tests/my.test.js。app-utils.js・app-my-utils.js・functions/ の純粋関数と、入口・書き込み先のドリフト検出）
- [ ] index.html の `?v=`（9か所）と app-core.js の `build:` を同じ版数に上げたか（ビルドレスのためキャッシュ対策は手動）
- [ ] BACKLOG.md の「🔴 次の本番リリースでユーザーと突き合わせる実機確認」をユーザーと1項目ずつ行ったか（高速化の体感・H2 の縮めた文字・Excel の名前行・.ics の取り込み・給料と明細。2026-10-04 ユーザー指示）

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
npm test          # tests/core.test.js・tests/my.test.js（app-utils.js・app-my-utils.js・functions/ の純粋関数とドリフト検出）
npx eslint app-*.js  # 0 errors を維持（CI は同じ9ファイルを npm run lint で検査する）
```

### React・スタイル制約

- **ビルド不要**: Babel Standalone がブラウザでトランスパイル。`import`/`export` は使えない
- **ファイル分割の制約**: index.html の読み込み順（utils→my-utils→core→staff→admin→shift→company→my→main）を変えない。全ファイルがグローバルスコープを共有する
- **スタイルは inline style のみ**: 外部 CSS ファイル・CSS モジュール追加禁止
- **`input`/`select`/`textarea` の `fontSize` は 16px 以上**: iOS Safari ズーム防止（2026-07-06に全箇所解消済み。新規追加時に守ること）
- **CDNスクリプトはSRI付き**: バージョン変更時は integrity ハッシュの再計算が必要（`curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`）
- **時刻ホイールのマウスホイールは1回＝1行**（2026-10-08）。passive でない wheel のリスナーで、行・ページ単位の wheel は1回1行、ピクセル単位は150ms 空いた最初の1回で1行・続きは 44px（1行の高さ）たまるごとに1行。タッチのスワイプは scroll-snap のまま。回帰は `example-time-wheel.js`
- **提出状況一覧（SmModal）の未提出は `visibleStaffList(mergeKeepStaff(staffList,period),settings,period)`**（2026-10-08）。その期間に非表示の人（と入社前・退社後の人）は未提出に出さない。期限付き削除で名前を残した人は数える。呼び出し元3か所は settings を渡す（tests/core.test.js が検査）。回帰は `example-smmodal-hidden.js`
- **マイシフトの新規登録の直後**（2026-10-08）: マイシフトのタブはリンクと本人データを読み終えるまで「読み込み中…」だけを出す（以前はカレンダーを先に描き、リンクが無いと分かってから「申請しました」に描き替えていたので一瞬カレンダーが見えた）。回帰は `example-my-register-flash.js`
- **時刻を選ぶ欄は、指定が無ければ時刻ホイール（`TimeWheelField`）にする**（2026-10-05 ユーザー指示）。文字入力などの指定があればそれに従う。刻みはその都度ユーザーに決めてもらい `options` で渡す（RULES.md）。提出一覧の詳細モーダルの出勤・退勤の調整値（`adj-{日付}-{start|end}`・「提出値に戻す」）と設定タブの PDF の昼夜の人数の確認時刻（`headcount-{lunch|dinner}`・「出さない」）も同日にホイールにした（刻みは従来の TO＝15分）。実績の出勤・退勤と本部の固定勤務パターンは文字入力のまま残す（ユーザー指示）
- **スタイル定数**: `AI`（input）/ `AB`（primary button）/ `AD`（delete）/ `AGray`（secondary）が app-core.js に定義済み
- **console.log は `dlog()` を使う**（DEV_MODE時のみ出力。warn/errorはそのまま）
- **シフト作成タブ（ShiftEditTab）の重い計算の依存を、描画のたびに新しくなる値にしない**（S1・2026-10-04）。`weeks`・`sameMoPeriods` は `useMemo`、`staffAliases` の既定値はモジュール直下の凍結した `NO_STAFF_ALIASES`（`||{}` と書くと毎回新しいオブジェクトになる）。どれも `weekRestByStaff`・`laborByStaff`・`liveTotalFor`・`liveMonthOtFor` の依存に入っていて、1つでも毎回変わると**セルの選択と1文字入力のたびに労務判定・割増・36協定の年の集計が全員分やり直される**（30人×31日で `laborFindingsFor` が30回）。依存に値を足すときは、その値が入力・フォーカスで変わらないことを確かめる。測り方は `.claude/skills/shifty-e2e-verify/scripts/perf-shift-edit-tab.js`（選択と入力で `laborFindingsFor` が0回でないと EXIT=1）
- **グリッドのセルは部品 `ShiftCell`（`React.memo`）で、props はプリミティブと安定した参照だけにする**（S2・2026-10-04）。関数は親が `useMemo([])` で1回だけ作る `cellApi`（中身は `cellApiRef` から最後にコミットした描画の `handleBlur` 等を呼ぶ）、style の土台は `useMemo` で固定した `AI2` だけを渡す。毎回作るクロージャ・オブジェクトを渡すと memo が効かず、選択・入力のたびに1,860個のセルが描き直される。**入力中の文字はセルの state と `draftRef`、確定済みの表示は `localEdits`（＝`localEditsRef`。更新は必ず `updLocalEdits`）**に分かれている。親はフォーカスを知らない（`focusKey` は無い）ので、フォーカス中の見え方（色を付けない・混在の日の自店の値）はセルが作る。入力中の値を読む書き出し・保存は `editsNow()` を通す。入力を捨てる経路（店舗・期間の切替）は `discardEdits`（`cellResetKey` を進めてセルの文字も捨てる）。回帰は `example-shift-cell-behaviors.js`
- **重い計算は後回しの値（`subsCalc`・`heatEditsCalc`）を依存に持ち、外へ書くものは `calcPending` の間は動かさない**（S3・2026-10-04）。確定とセルへの打鍵が `CALC_IDLE_MS`（300ms）止まってから `calcIn` を進め、`useDeferredValue` に通す。重い `useMemo` の依存に `subs`・`heatEdits`・表示用の `helperCache` を直接入れない（入れると確定の同期描画で全員分を計算し直す。計算用は `helperCacheCalc`・合計は `totalsCache`）。`period.laborTotals` は `laborCalc.totals`（memo の結果。描画中に ref へ書かない）を `calcPending` でない描画でだけ書く。PDF・Excel・確定・非表示マウントの `exportJob` は計算が済んだ描画で動く（ボタンは job を積み、useEffect が実行する）。その間は合計・労務判定表・週の休み・ヒートマップ・警告に「計算中」（`CalcPendingNote`・`data-calc-pending`）を出して表を薄くする。労務の色と警告は入力が止まってから遅れて変わる。回帰は `example-shift-calc-deferred.js`
- **Excel の名前行（2行目のスタッフ名）は 9pt・太字・縦書き・左右中央・上下中央**（K2・2026-10-04）。`expXl` の名前セル専用の整列 `aName`（`textRotation:"vertical"`）を使う。**ExcelJS 4.4.0 は数値の `textRotation:255` を書き出し時に捨てる**（実測。`"vertical"` なら `textRotation="255"` が出力される）ので、`aV`（期間ラベル・曜日・店舗名が使う既定値）は縦書きになっていない。`aV` を直すと他のセルの見た目まで変わるので名前セルだけ別にしてある。行の高さは 78 のままで、9pt の縦書きで収まるのは目安7文字前後。回帰は `example-excel-missing-day.js`（名前セル以外の書式が K2 の前と同じことも測る）

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

**2026-09-23 に本番で実害**: 鷄えん3ビル（`shop_…9520`）の「2026年10月前半」
（`p_…1346`）の期間レコードが消え、**提出40件と `tokens/（伏せ字）` は無傷で残った**。
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
2. タブ最下部の「操作方法」レジェンド（`GridLegend`・app-shift.js）はレジストリから自動生成されるため、個別編集は不要（登録するだけで説明が自動追記される）
3. パーサ（`extractNote`・app-utils.js）もレジストリ駆動。`tests/core.test.js` の完全性テストが登録漏れ・実装との乖離を検出する
4. 既存コマンド: `h`/`k`/`x`（サフィックス）、`/`・全角`／`（休み希望・`adminRest`フィールドに保存・トグル式）、`ko`/`yu`/`ke`（休暇種別）、`締`（kind:"fixed"・店舗限定の追加出勤コマンド。詳細は下記5参照）。店舗略称バリデーション（CompanyTab）の予約語は `isReservedShopAbbr` がレジストリから自動で決める（`/`・`／` も略称に登録できない）
   - **休み希望は 2026-09-30 に `y` から `/` へ変えた**（`労務給与_複数法人_実装計画.md` §3.9・P0・決定 #16）。
     **`y`・`ｙ`・`休` は別名に残さず、打っても休みにならない**（他のコマンド外の文字と同じくメモとして残る。
     廃止の案内トーストは出さない）。**保存データの移行は無い**——休みコマンドは `applyEditToSubs` の中で
     `adminRest`（と `ko`/`yu`/`ke` なら `leaveTypes`）に解決され、打った文字そのものは保存されないため。
     `y` が予約語でなくなったので、店舗略称として `y`・`休` は登録できるようになった
5. 店舗限定コマンドの例: `締`（鷄えん東通り店専用・2026-07-12追加、2026-07-12に数字と組み合わせ可能な追加出勤方式へ拡張）。出勤・退勤どちらのセルにも、単独（例:「締」）でも数字と組み合わせ（例: 出勤セル`13`+退勤セル`17締`）でも入力でき、主シフトとは別に23:00〜25:00(翌1:00)を**追加出勤**(`shift.extraStart`/`extraEnd`)として計上する（1日に2出勤が成立する）。判定は`applyEditToSubs`内で`extractNote`が返す`hasFixed`（セル値に締めキーを含むか）と`fixedShiftEnabled`をblurごとに再評価しON/OFFする（`applyFixedShiftToSubs`という専用関数は廃止済み）。**`fixedShiftCommandFor`（app-utils.js）は 2026-07-12 の`2a68ea6`で呼び出しが無くなり、現在はテストからしか呼ばれない**——その完全一致規則（「9締」はnull）は現行の併用可能な挙動と逆なので、判定の根拠として読まないこと（バグチェック#124）。`calcNetWorkMinutes`/`shiftBandInfo`（app-utils.js）は`extraStart`/`extraEnd`を主シフトと合算する形で対応済み。ヒートマップ（`heatData`/`heatHours`）・休みカウント（`restCounts`等）・`isWorkDay`もextra期間を考慮する。店舗の識別は店舗名の部分一致（`isFixedShiftEligibleShop`）で行っており、店舗名変更で無効化されうる点に注意

---

### 従業員画面の 2026-10-05 時点の状態（本番公開済み・この節が最新。上の各節の「develop のみ」「未デプロイ」「DEV_MODE のときだけ」は当時の記述）

- **本番公開**: `MY_SCREEN_ENABLED = true`（2026-10-04・`dff85c4`）。定数は止め口として残してあり、false にすると入口・`#/me`・`#/m/`・公開ボタン・管理者側の承認 UI が一括で消える。ルールと Cloud Functions は本番反映済み（ただし個人リンクコードの削除（2026-10-05）はコードだけで、本番のルール・関数への反映は未実施）
- **アカウント作成**: 匿名 uid への連結は、メールアドレスの列挙保護が有効なプロジェクト（本番・dev とも）では `auth/operation-not-allowed` で拒否される。確認メール（メールリンク）で登録し、方式が使えないときは従来の登録（`createUserWithEmailAndPassword`）へ自動で切り替える。**uid は匿名 uid を引き継がない**
- **マイシフトのアドレス**: 募集URLの画面でマイシフトを開くと、アドレスバーが開き直せる URL（個別URLの人は `#/m/<token>`、アカウントの人は `#/me`）になる。閉じると `#/s/<token>` に戻る
- **個別URL**: 設定タブの**一番下**に表示（コピー・共有だけ。変更は管理者）。メールアドレスの任意登録はその上。管理者がスタッフ編集モーダルで発行・再発行した URL が常に有効
- **個人リンクコード**: 2026-10-05 にユーザー指示で**機能ごと削除した**（スタッフ専用の URL に一本化）。画面・CF（`issueStaffLinkCode`・`redeemStaffLinkCode`）・ルール（`staffLinkCodes` 等の3ノード）・純粋関数・テストとも無い。以前にコードで作られた紐付け（method "code"）はそのまま有効。リンク済みの人の編集モーダルには解除だけが出る。**本番への反映は未実施**（クライアント → ルール → 関数の削除の順。BACKLOG）
- **ヘルプ勤務**: 所属店舗が公開済みなら、ヘルプ先の状態に関係なく、全員の表・本人のカレンダー・.ics に PDF どおり出す。給料は所属店舗の賃金で計算し（`myHelperDaysOf`）、内訳に「うち他店でのヘルプ」。ヘルプ先の日にも給料計算用の実績を入れられる（`users/{uid}/overrides/{ヘルプ先}/{日付}`）
- **スタッフが入れた時刻**: 表示（カレンダー・次のシフト・.ics・全員の表）は常に公開内容。本人の実績は給料計算だけに効く
- **URLをなくしたときはアカウントに一本化（2026-10-08 ユーザー指示）**: 個別URLの設定タブの「URLをなくしたとき用のメールアドレス」の欄は外し、「マイシフトのアカウントに追加」の下に「アカウントに追加しておけば、URLをなくしてもメールアドレスとパスワードでログインして見られます」の案内だけを出す。募集URLの「URLをなくした場合」と #/me のログイン画面は「追加済みならマイシフトからログイン・未追加ならお店の管理者に再発行を頼む」の案内（募集URLには `?openExternalBrowser=1#/me` で開き直すボタン）。CF `setPageEmail`・`recoverPageUrl`・ルール・`staffPageEmails` は残置（クライアントからは呼ばない・tests/my.test.js が検査）。回帰は `example-my-page-email.js`
- **掛け持ち（2026-10-05 ユーザー指示・**CF とルールは本番未反映**）**: ①**従業員番号はお店ごとに申請のときに入れる**（設定タブ「勤務先のお店」の申請の欄の「このお店の従業員番号」・`MY_LINK_NUMBER_HINT`）。初期値はリンク済みのお店が無いときだけアカウントの番号（`myLinkRequestNumberDefault`）。アカウントの番号（profile.number）は1つ目のお店の申請（登録と同時の自動申請）に使う。リンク後のお店ごとの番号は従来どおり勤務先の一覧（`settings.staffNumbers`）。#/me の設定に、リンク済みのお店があっても「掛け持ち先のお店を足すとき」の案内を出す。②**専用URL（#/m/）のお店をアカウントに追加**: 個別URLの設定タブの「マイシフトのアカウントに追加」（`MyPageAccountLinkBox`・状態は `myPageAccountLinkState`）。未ログインなら「ログイン・登録して追加する」でログインの画面（戻ると sessionStorage `ss_myPageLinkIntent` で設定タブから始まる）、ログイン済みなら CF `linkStaffPage`（暗証番号を決めていれば入力）で即時にリンク（method "page"・管理者の再承認なし＝ユーザー決定）。**個別URLの本人のデータ（staffPageData）はアカウントへ持ち込まない**（ユーザー決定）。個別URLはそのまま使える。ルールは staffLinks の method に 'page' を足した（既存パスの値の追加＝**クライアント→ルール→CF の順で本番反映**。CF より先にクライアントを出すと「追加」が「関数が無い」で失敗するだけで他は壊れない）。回帰は `example-my-multi-shop.js`（30項目・d781ac6 の配信物で EXIT≠0）と cf-verify の `example-link-staff-page.js`（23項目）
- **休暇の種別名**: 画面・PDF・全員の表・シフト作成タブからの Excel。期間タブの Excel は提出そのまま（斜線）
- **ホーム画面のアプリ（2026-10-05・同日2回目で改め）**: manifest.json の start_url は "./" なので、iOS でスタッフ側のURLを「ホーム画面に追加」するとアプリは "/" で開き、管理者の端末では管理者画面になっていた。二段構えで直した。①**iOS のスタッフ側のURL（#/s/・#/m/・#/me）では manifest を置かない**（manifest が無ければ iOS は追加した時点の URL＝ハッシュ込みで開く）。index.html の head のスクリプトが最初の manifest を同じ規則で入れ（静的な link は置かない）、以後は app-core.js の `applyHomeManifest`（`homeManifestPlanOf`）。iOS 以外は data: の manifest（`homeManifestOf`）。②**ホーム画面から開いてハッシュが無いときの保険**: ブラウザのタブでスタッフ側のURLを開いている間は Cookie `ots_homeLaunch` にそのハッシュを置き（管理者側では消す）、ホーム画面のアプリ（`navigator.standalone`・display-mode standalone）で最初に開いたときだけその Cookie で開き先を決めて、アプリ側の localStorage `ots_homeLaunch_v1` に残す（以後はそれだけ＝`homeLaunchRestoreOf`。Cookie が無ければ "admin"）。app-core.js の読み込み時（App が URL を読む前）に `history.replaceState` でハッシュを付ける。**iPhone 実機では未確認**（iOS が追加時に Safari の Cookie をアプリへ写す前提。写らなくても①で開く想定）。既に追加済みのアプリは追加し直しが要る。回帰は `example-my-1005.js` の IOS（iPhone の UA と standalone を差し替え）
- **提出タブ（2026-10-05）**: 個別URLの「提出」タブは、提出済みでも「提出完了」ではなく提出の内容を反映した選択画面を開く（`data-staff-restored` の帯）。提出した直後だけ「提出完了」。募集URL（Cookie の名前）は従来どおり「提出完了」から
- **全員のシフトのヘルプ先（2026-10-05）**: 同じ人の他店の登録（写しの人物、無ければ所属店舗の一致＝`myHelpDestRegs`・同じ法人だけ）がある店舗を「◯◯店（ヘルプ先）」として出す（同日の2回目の指示で、お店のプルダウンではなく下の「1画面に縦に並べる」の1ブロック）。選択肢は**公開済みか確定済み**かつ直近3ヶ月の期間（`myHelpDestPeriodOptions`。同日の追加指示「公開だけの期間も出して」で確定済みだけから広げた）、既定は自分の店舗。読み込みは `useMyHelpDestShops`（settings・staff・periods）と、選んだ期間の subs だけの部分読み（書き込みなし）。個別URL・#/me の両方
- **全員のシフトを1画面に縦に並べる（2026-10-05 ユーザー指示「店舗の切り替えは要らない。同じ期間なら所属店舗のシフトの下にヘルプ先、Shifty を使っている別の店舗も縦に並べて1画面で」）**:
  店舗のプルダウンを廃止し、期間のプルダウン（先頭の店舗＝`myAllShiftChoices` の既定の店舗の選択肢）だけにした。`myAllShiftStack`（app-my-utils.js）が
  先頭の店舗の選んだ期間と**日付が1日でも重なる期間**を他の店舗から拾い、`MyAllShiftBlock`（店舗名の見出し＋`MyAllShiftTable`）を縦に並べる。並びは
  所属店舗 → そのヘルプ先（`baseShopId`）→ 別の店舗（それぞれの直後にそのヘルプ先）。ヘルプ先は**公開済みか確定済み**の期間、別の店舗は公開済みの期間（従来の選択肢の規則のまま）。
  期間の切り方が違う店舗は重なる期間をすべて開始の順に出し、見出しにその店舗の期間名を添える。重なる期間の無い店舗は出さない（その店の別の期間は、
  先頭の店舗で重なる期間を選べば出る＝**先頭の店舗に公開済みの期間が無い月の、別の店舗だけの期間は見られない**）。
  「別の店舗」は #/me なら有効な紐付けの全店舗、個別URL（#/m/）なら**この端末で開いた・作った別の店舗の個別URL**（`ots_myPageKnown_v1`・`ots_myPages_v1`。
  `myKnownPageShops`→`useMyKnownPageShops` が staffPages/{token} を読み、承認済みで名前がスタッフ一覧にあるもの＝`resolveMyPage` の ok だけ。#/me でも紐付けの無い店舗はこれで足す）。
  個別URLの人が別の端末で開くと、その端末で開いたことの無い店舗は出ない（個別URLにはログインが無く、端末の記憶しか手がかりが無いため）。読み込みは従来どおり
  期間ごとの部分読みで書き込みなし。回帰は `example-my-1005.js` の HD・KP と `example-my-shift.js` の AM（前の配信物では HD・KP・AM が落ちる）
- **「公開」の表示は「確定」（2026-10-05）**: 提出だけが未確定なので、マイシフトのラベル（MY_KIND_LABEL）・全員の表の見出し（`確定（m/d）`＝確定済みなら確定した日）・.ics の説明は公開でも「確定」。説明文の「公開された時間」などはそのまま
- **給料のグラフ（2026-10-05）**: 目標の弧は下地（--c-border）の上に、これからの見込みまでを --c-text4、確定分をアクセントで重ねる（`MyGoalRing`・`myPaySummaryOf` の projectedProgress）。年の表示にも同じ部品（`MyPaySummaryBody`）で年の目標＝月間目標×12（`myPayYearGoalOf`）と、勤務先ごとの年間の収入と支給月ごとの内訳（`myPayYearByWorkplace`）
- **お店の締日・給料日（2026-10-05）**: `settings.payCalendar={closingDay,payMonthOffset,payDay,holidayRule,updatedAt}`。設定タブの「締日・給料日（スタッフのマイシフト）」（この店舗）と企業連携タブの同名カード（選んだ連携店舗にまとめて。他店舗は `settings/payCalendar` だけを update）で登録する。マイシフトの給料は本人の締日・給料日よりこちらを優先し（`myPayWithShopCalendar`。時給・交通費は本人のまま）、勤務先の編集は締日の欄の代わりに「お店の登録・変更できません」。検証は `validatePayCalendarInput`（本人の設定と同じ規則）。ルール・CF の変更なし（settings の既存ルール）。回帰は `example-my-1005.js`
- **確認メールのリンクの判定（2026-10-05・本番で「リンクを開くと管理者のログイン画面」）**: Firebase コンソールでアクション URL を自前のドメインにすると、リンクは `https://shiftyshifty.app/?mode=signIn&oobCode=…&continueUrl=<戻り先>` の形で届き、`elk` が continueUrl の中に入ったままになる。`parseEmailLinkLanding` は continueUrl・link の中も見て、それでも分からないメールリンク（mode=signIn と oobCode）は送った記録の kind、無ければスタッフとして続きの登録にする。スタッフで戻り先が無ければ後始末は `#/me`（`emailLinkReturnHash`。"/" は管理者のログイン画面）。**原因がコンソールのアクション URL かは本番の設定を見ていないので推定**。回帰は `example-email-link.js` の S7
- **登録と同時にリンクを申請（2026-10-05）**: 続きの登録（メールリンク）と従来の登録の「登録する」で、始めた画面のお店（`#/s/<token>`→tokens、`#/m/<pageToken>`→staffPageTokens＝`myLinkShopRefOfHash`）へそのまま `linkRequests` を書く（`myAutoLinkRequest`・設定タブの「申請する」と同じ形・リンク済みなら書かない）。開き直したマイシフトは「◯◯にリンクを申請しました」を出し、「設定でお店とリンクする」を出さない（sessionStorage `ss_myLinkReq`）。回帰は `example-email-link.js` の S2
- **管理者のスタッフ編集の「URLを取り消す」は「連携解除」（2026-10-05）**: 中身（staffPages を revoked にする）は同じ
- **時刻の2列ホイール（2026-10-05）**: 時刻は select ではなく、押すと時と分の2列のホイールが開く部品（app-staff.js の `TimeWheelField`・`data-time-wheel`）で選ぶ。「決定」で反映し、背景のタップと Esc は取り消し。列は scroll-snap で1行ずつ止まり、**先頭（0時・00分）と末尾（最後の時・59分）で止まる＝ループしない**。選べる時刻は呼び出し側の options が決め、時の列は options にある時、分の列はその時にある分だけ（27時・30時は 00 分だけ）。寄せ方は app-utils.js の `timeWheelModel`・`timeWheelPick`（同じ距離なら小さい方）。ダイアログは document.body へのポータルで、背景のタップは親へ伝えない（セル編集の画面が閉じない）。**シフト提出は出勤30分刻み（`TO_START`）・退勤15分刻み（`TO`）**（同日に一度出勤も15分にしたが、ユーザー指示で30分に戻した）。提出状況一覧のセル編集（`CellEditPanel`）も同じ部品（`TO`）。**候補タブの時刻欄（全体・曜日別・日付別・休憩の開始・終了の8つ）も同じ部品**（app-admin.js の `CandTimeWheel`・`TO`・`data-time-wheel="cand-{global|weekday|date|break}-{start|end}"`。CandTab の外に置く＝中で定義すると再描画のたびに作り直され、開いたホイールが閉じる）。**マイシフトの手入力のシフトと給料計算の実績の開始・終了は1分刻み**（`MY_TIME_STEP_MIN=1`・`MY_TIME_WHEEL_VALUES`＝0:00〜30:00 の1801件。以前の `myTimeSelectOptions` は削除）。空の欄を開くと開始は 9:00、終了は開始＋1時間（開始が空なら 18:00）から。**休憩は15分刻みのプルダウンのまま**（`MY_BREAK_STEP_MIN`）。回帰は `example-time-wheel.js`（提出・セル編集・候補タブ）と `example-my-manual.js` の B・C・I（マイシフト）。**iPhone の指でのスクロールは未確認**（ヘッドレスの Chromium で scrollTop を動かして測った）
- **メールの差出人**: Firebase Auth の確認メールは標準の差出人だと迷惑メールに入る（2026-10-05 にユーザーが確認）。`shiftyshifty.app` を差出人にするには Firebase コンソールのカスタムドメインの DNS レコード4件（SPF・firebase の TXT、DKIM の CNAME 2件）を Cloudflare に足して確認する（未実施）

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
Shifty の期間は半月のことがある。「選択中の期間の startDate と同じ年月の全日」を月として集計する。
月単位の**判定**を出す条件は **`laborMonthCovered`（その月の全日がデータで埋まっている）だけ**。
当初はこれに「その月の最後の期間を開いていること」を AND していたが、**同日のリリース後に
ユーザー指示で外した**（下記「月が埋まっていないときも実数を出す」）。月が埋まっていれば前半を
開いていても月実働・目安・総括の材料は完全に揃っており、**計算済みの値を表示段階で捨てていただけ**
だった。`laborIsLastOfMonth` は判定には使わず、`period.laborTotals` へ月の残業予定を二重に
書かないためだけに残してある。

**月が埋まっていないときも実数を出す（2026-09-26・リリース後のユーザー指示。確定仕様 S-5／S-6 の
「要確認」を置き換える）**。以前は月の材料が揃わないと 目安・残業予定・総括 と、7日揃わない週の
休みを「要確認」に倒していた。**現在はデータのある日だけで数えた実数を出し、先頭に `＋` を付けて
途中であることを示す**（年計の行が元から使っていた表記に揃えた）。理由は `laborPendingReason` を
ツールチップに出す。

- **数字は出す・月に帰属する判定は出さない。** `overallVerdictOf` は `monthReady` が false のとき
  渡された `guideKey` を捨てる（`gk`）。呼び出し側は月が埋まる前も `guideStatusOf` の実数を出すので、
  **捨てないと暦月の枠に対して全員が「所定未満」＝要修正になる**。総括はこのとき `＋OK`
  （日・週の判定では問題なし、月の判定は月が埋まってから）。
- **`weekRestStateOf` は7日揃わない週を `partial` にし、`none`（×休なし）にしない。** 総括は
  `key==="none"` を週1休の違反として要修正に直結させるので、3日出勤・4日不明の週を ×休なし と
  呼ぶと誤って要修正になる。実測で `＋休0` の週が出る（下の回帰スクリプトが固定している）。
- **`period.laborTotals` には途中の月の残業予定を書かない**（`laborIsLastOfMonth && laborMonthCovered`）。
  画面には途中の実数を出すが、凍結値に途中の値を入れると `yearOvertimeMonths` が live での数え直しに
  降りず、**「読めていない月」の印も付かないまま年度の合計が黙って小さく出る**。
- **残業予定は 0h でも `＋0h` と出す。** 暦月の枠に半月ぶんを当てるので月が埋まるまでは 0 になりやすく、
  空欄にすると「判定して問題なし」と読めてしまう。
- 回帰は `example-labor-partial-month.js`（月が埋まっていない場合。反証も実測済み＝変更前の配信物では
  `allPass=false`）と `example-labor-phase2.js` の `half_former_*`（月は埋まっていて前半を開いている場合）。

**年度の累計が過去参照なしで出る仕組み（2026-09-26 ユーザー案）**: `subs` は直近3ヶ月の部分購読だが
`periods` は起動時に全件購読する。そこで**期間が終わるまで `period.laborTotals` を書き続け、
終わったら止める**（写し＝`snapshot` と同じゲート・**同じ useEffect**）。読めていない期間は画面に「＋」で明示する。
**2026-09-29 に優先順位を逆にした（ユーザー指示「年間の勤務時間は実データで」）**: 提出を読めている期間は
**実データ（`liveTotalFor`）で数え**、凍結値は読めない期間の代わりにだけ使う（`yearLaborSummary` の
`preferLive=true`）。凍結値は最終日で止まるので、終了後に直した提出が年計に届かず、生きている期間でも
その期間を最後に開いたときの値のまま残っていた（反証: 変更前は当月77hの実データがあっても凍結値の60分を足していた）。
実データはその期間の設定（確定済みなら写し）で数え、凍結値を書く側と揃えている。
**全データPDFは書き出す前に3ヶ月より前の提出も読み込む**（`startPdf` → `loadPastSubs` の Promise を待つ）ので、
印刷される年計に「＋」は付かない。PDF には「週の休み」「労務判定」「労務の確認が必要です」も載り、
行の定義は画面と共有している（`weekRestRows`・`laborRows`）。回帰は `example-pdf-labor.js`。
**写しと合計を別々の effect にしてはいけない**——どちらも自分のレンダーの `periods` を map するので
同じコミットで2つ走ると後勝ちで片方が消え、毎回2回書く（`6856168` で1つにまとめた）。

**36協定は7項目すべてを判定する（2026-09-26・判断4を案b に変更）**。当初は3項目（1日・1か月・
単月100h未満）で、年単位4項目は「期間をまたぐ年間集計の基盤ができたとき」を再着手条件に据え置いていた。
その基盤が `period.laborTotals` で出来たのでユーザーの指示で追加した。
- **年の値は月ごとに持ち、その月の最後の期間にだけ残す**（`laborTotals[name].monthOtH`）。
  半月運用で同じ月を2回数えないための不変条件で、`yearOvertimeMonths` も月の最後の期間からしか読まない。
- **シフトを組んである月までしか見ない**（`scoped`）。未作成の月を0として平均に混ぜると実態より低く出る。
- 720h・80h・6回は**法律が決める値なのでコード側の定数**。年360h だけは協定で定める値なので設定にした。
- **2026-09-30（P5）から B制にも当てる**。B制の月の値は割増の①＋②。単月100h・複数月平均80h は時間外＋法定休日労働（「割増の計算（P5）」の節）
- 複数月平均は連続する2〜6ヶ月の窓を全通り見て、**平均がいちばん高い窓を1つだけ**出す（同値なら短い窓）。

**残業予定は半月ごとに見える（2026-09-26 ユーザー指示）**。按分は**月の全日**でやるが、表に出すのは
選択中の期間ぶんの和（`periodOtSumH`）で、月の合計はツールチップに出す。日別按分の和が月の残業予定と
一致する形を崩すので、**按分そのものを期間で切ってはいけない**。

**未検証**: 計画の検証手順5（職場の実データ1ヶ月分を Excel と Shifty の両方に入れて全数値を
突き合わせる）。xlsm の操作はユーザーの領分。**Shifty 側の計算値を Excel 側の値として代用しない。**

---

## 入社日・退社日・新店開始日（2026-10-08）

`settings.staffTenure[名前] = {join?, leave?, transfer?:{shopId,date}}`（日付は "YYYY-MM-DD"）。判定は app-utils.js の `isStaffInTenure` の1本で、
`visibleStaffList` の中から呼ぶ。そのためシフト作成グリッド・ヒートマップ・集計・Excel・PDF・従業員画面の全員のシフト表・確定時の所定の集計
（`planPeriodConfirmation`）が同じ規則を通る。入社日は期間の endDate < join の期間に出さない、退社日は startDate > leave の期間に出さない、
新店開始日は startDate >= transfer.date の期間に旧店舗で出さない（期間の途中なら旧店舗と新店の両方、初日なら新店だけ）。期間・日付が無い・
読めない値は出す側に倒す。`STAFF_KEYED_SETTING_MAPS`（CF の `STAFF_KEYED_SETTING_MAPS_CF` にも）に登録＝改名・削除の後始末が自動で効く。
値が日付を持つので写しには凍結しない（`PERIOD_SNAPSHOT_EXEMPT_STAFF_MAPS`）。

入口はスタッフタブの編集モーダルだけ（シフト作成タブには入力欄を作らず、表示が自動で変わる）。入社日・退社日は全プラン、新店開始日は企業連携の写しが
ある店舗（Premium）だけで、候補は `companyLink.shops` から自店を除いたもの。保存は ①自店の transfer（saveSettings）②新店の `shops/{新店}/staff`
にその名前が無ければトランザクションで末尾に足す ③`shops/{新店}/settings/staffTenure/{名前}/join` の1キーだけ update。新店に同じ名前があれば
確認して同じ人として join だけ書く。新店に書けない（オーナーでない）ときは自店の transfer だけ残して新店側での登録を案内する。解除は自店の
transfer だけを消す。退社後もスタッフ一覧からは消さない。`staffHomeShop` は触らない。**新店へ足すときにプランの人数上限・別名の衝突は確かめず、
番号・属性・所属店舗も写さない**（未対応）。従業員画面の本人のカレンダーと給料（`isStaffHiddenInPeriod` を直接呼ぶ3か所）には在籍期間を当てていない。
回帰は `example-staff-tenure.js`（変更前の配信物では20項目が落ちる）。

## スタッフタブの構成（2026-09-26 ユーザー指示で再編）

スタッフ1行に出すボタンは **有給日数・ポジション・非表示・編集・削除 の5つだけ**。
名前・従業員番号・属性・別名・退勤延長（のちに所属店舗・スタッフ専用のURL・メールのアカウントとのリンク・賃金も追加）は「編集」で開く**モーダル**にまとめてある。
以前は行に番号入力・属性セレクト・別名ボタンが並んでいて、横に長く押しづらかった。

**行はカード幅に収め、入りきらないボタンは次の行へ折り返す**（2026-09-29）。名前側とボタン側の2つの塊に分けてあり、
広い画面では従来どおり1行（変更前と高さ・幅・ボタン位置が一致することを実測）、スマホ（390px）では
名前の行＋ボタン2行になる。以前は `minWidth:"max-content"` の箱で横スクロールさせていたため、
スマホでは編集・削除が画面外にあった（行幅681pxに対し見える幅334px）。回帰は `example-staff-hidden.js` を
`SHIFTY_ENGINE=webkit SHIFTY_DEVICE="iPhone 13"` で回す。

- **設定タブから移したもの**: 「有給の付与日数」「退勤延長設定」の2カード。設定タブには置かない
  （移設に伴い `SetTab` は `staffList` を受け取らなくなった）。
- 有給日数は行のボタンでインラインのパネルを開く（ポジションと同じ形）。
- 属性の変更は従来どおり `openAttrDialog` を通す（「どの期間まで旧属性のままか」を確定してから保存する）。
  モーダルの中でも同じ関数を呼ぶので `period.keepAttrs` の扱いは変わらない。
- 別名パネルは開閉の state を持たず、モーダル内に常時表示する。

## 属性の並びと既定名（2026-09-26 ユーザー指示）

**属性の並びの正本は `sortAttrEntries`（app-utils.js）1本**で、組み込みの `employee`→`parttime`
（`ATTR_PINNED_ORDER`）を上に固定し、残りを**表示名の50音順**（`localeCompare(…,"ja")`）で並べる。
スタッフタブの属性プルダウン（`getAttrOptions` 経由）と設定タブの属性別勤務時間設定の**両方がここを通る**
——並べ替えを画面ごとに書くと、片方だけ直したときに並びが食い違う。かなが漢字より先に来るのは
照合順の結果で、漢字は読み仮名を持たないため許容する。旧 `makeSettings` が入れていた `dispatch`／`other` は
固定の外なので50音順の側に入る（「その他」＜「応援・外部」。「応援」は漢字始まりなのでかなの後）。

**設定タブは `getAttrOptions` を使わず、自分で `[ID, 表示名]` を組んで `sortAttrEntries` に渡す。**
`getAttrOptions` は名前が空の属性を落とすので、通すと**名前を消した直後のカスタム属性の入力欄ごと消えて
付け直せなくなる**。

**組み込み属性の表示名は `STAFF_TYPE_LABELS` が正本で、`staffTypeLimits[id].name` を読まない。**
組み込みの名前を変える入口は UI に無い（設定タブは組み込みだけ input ではなく固定表示）ので、
そこに入っているのは `makeSettings` が書いた当時の既定名だけ。読むと `parttime` の
**「バイト」→「パート・アルバイト」の改称（同日指示）が既存店舗に届かない**——
本番データを書き換えずに改称を効かせるためにこの形を採った。
**2026-10-03 に同じ形で `dispatch` を「派遣」→「応援・外部」に改称した**（ユーザー指示。ID と保存データは変えない）。
従業員番号の「派遣」（`isStaffNumberMissing` が未設定とみなす番号欄の文字）は属性名とは別の話なので変えていない。

## 休暇の見せ方（2026-09-26 ユーザー指示）

**色も斜線も使わず、セルに種別名を出す。** コマンドは `ko`＝公休・`yu`＝有給・`ke`＝慶弔。

- **`yu`／`ke` は打ち込んだ帯だけ**（出勤セル=ランチ・退勤セル=ディナー）。有給は半日単位で
  取れるため。`ko`（公休）だけは終日。種別は `shift.leaveTypes={start,end}` に**帯ごと**持つ。
- **休み希望の `/`（2026-09-30 までは `y`）は種別を書かない。** 終日でも従来どおり斜線のままで文字を出さない。ただし
  **数え方は公休のまま**——`leaveTypeOf` は終日の休み希望とスタッフ提出の休みを公休として扱い、
  週の休みに数える。**見せ方（`leaveCellTextOf`）と数え方（`leaveTypeOf`）は別の関数で答える。**
- **種別名を出すセルには斜線を引かない**（文字と重なって読めなくなる）。
- **PDF・従業員画面の全員のシフト表・Excel も同じ見せ方（2026-10-04 ユーザー指示「PDF も種別名に」「Excel も統一して」・`f6a0804`＋自動コミット `a794735`）**。
  セルに何を出すかは app-utils.js の **`leaveShownTextOf(shift, field)` 1本**（その帯が休み扱い＝adminRest で種別があれば種別名、無ければ ""）で、
  画面の `leaveCellText`（app-shift.js）・PDF と全員の表の `shiftSheetCellOf`（kind "leave"・12px・斜線なし・変更マークの緑は残す）・
  Excel の `expXl`（種別名・`shrinkToFit`・`diagonal` なし）の4か所がこれを通す（tests/core.test.js がドリフトを検出）。
  **Excel はシフト作成タブからの出力（`adjResolver` あり）だけ種別名**。期間管理タブの Excel（resolver なし）は提出そのままの位置づけで変えない
  （ユーザー決定「期間タブは提出したままで良い」。`expXl` の `lvOn=!!resolver`。休暇の帯は従来どおり斜線＝19da811 と同じセルを回帰が照合）。スタッフ提出の休みの日に片側だけ休暇を入れた日は、
  もう片側を斜線にする（画面の cellDash・PDF と同じ）。休暇の日はヘルプ勤務（H2）を出さない規則は変えていない。
  **誰が有給かが全員の表で見える**ことはユーザーが承知済み。回帰は `example-excel-missing-day.js` の j〜l（l は期間管理タブが 19da811 の出力と一致）と `example-my-sheet-pdf.js` の leaveShown
- 有給・慶弔の日数は**半日＝0.5**で数える（`leaveHalfDaysOf`）。公休は日単位で、無記入の日も含む。
  半日の有給を取った日は**出勤日のまま**なので週の休みには数えない（残り半分を働くため）。
- `CELL_COLOR_LEGEND` に休暇の色は**持たない**（持つとレジェンドが嘘になる）。
- 入力欄の value に種別名を入れているので、**表示のまま blur しても何もしない**ように
  `handleBlur` が先頭で弾く（メモとして保存されるのを防ぐ）。**この判定は種別名が実際に
  出ているセルにだけ当てる**——空文字どうしの一致で早期 return すると、**休暇でないセルを
  空欄にする blur が丸ごと捨てられ、消したはずの文字が保存値から復活する**（2026-09-26 に
  本番で報告。`96df9d6` で入り同日中に修正）。
- **外し方は3つ**: 同じコマンド（`ko`/`yu`/`ke`）をもう一度入れる・時間を入力して出勤に戻す・
  **セルの種別名を消して空欄にする**（2026-09-26 ユーザー指示で追加）。文字消しで外す範囲は
  「同じコマンドをもう一度入れたとき」と揃えてある——**`ko` は終日なので出勤・退勤どちらの
  セルから消しても両方外れ**（片側だけ外すと残った側が「公休」のまま消せなくなる）、
  `yu`/`ke` は消したセルの帯だけ外れる。判定は表示ではなく保存値（`leaveFieldsOf`）で行うので、
  旧い日単位の `leaveType` しか持たない日にも同じ規則が当たる。**メモや締めを伴う入力は
  空欄ではないので外さない**。
- スタッフタブの3つのポップアップ（削除・非表示・属性）は `zIndex:9999`。編集モーダルは 9998。
  属性の変更はモーダルの中から開くので、同じ値だと DOM 順で下に潜って操作できない。

シフト作成タブの表の並びは **週の休み → 労務判定** の順（同日ユーザー指示）。

## 特定技能の週の公休（2026-10-01 ユーザー指示）

特定技能の人は週1回の公休が要り、**週の途中で月をまたぐときは月末側と月初側に各1回（計2回）**要る。
違反は「⚠ 労務の確認が必要です」に `特定技能の週の公休不足（28〜4）` と出し（総括は要修正）、週の休み表のセルを赤・太字にする。

- **対象**: 属性の表示名に「特定技能」を含む人（`isSkilledWorkerAttr`。企業属性 `co_*` と店舗の独自属性の両方。
  労働時間制の保存値が none の属性も含む＝2026-10-03 に B と同じ判定にしたため。以前は除いていた）。
  **判定の入口はこの1本だけ**——将来、属性に明示のフラグを持たせるときはここを直す。
  設定タブと企業の共通設定の属性の説明に1行出している（新しい入力欄は無い）
- **週と公休の数え方は既存の週の休みと同じ**（月曜起算・月で切らない `weeks`、公休＝`dayRestKindOf` の `rest`＝空欄・休み希望・提出の休み・`ko`。
  有給・慶弔は数えない）。`skilledWeekRestStateOf` が週の7日を年月で分け、月ごとに公休1日以上を求める
- **データの無い日（nodata）を含む月の側は判定しない**（既存の `＋休n` と同じ扱い）。揃っている側で公休0なら、もう一方が未作成でも違反
- 表示: またがない週の違反は従来どおり `×休なし`、またぐ週の違反は `×休n`（n は週の公休の合計）。title に `9月側 0日・10月側 1日`。
  全データPDFは画面と同じ行定義（`weekRestRows`・`laborRows`）なので自動で載る
- 不足した週（月をまたぐ週は足りない側）の出勤日を紫で塗る（2026-10-08・`LABOR_DAY_FIX_KEYS`）。`OVERALL_FIX_KEYS` にも入れる
- 回帰: `example-skilled-week-rest.js`（画面・PDF・両側に公休がある対照・非特定技能の対照）

## シフト作成タブの労務の見せ方（2026-09-26 ユーザー指示・リリース後の追加）

- **空欄は公休**。`dayRestKindOf` は元から無記入を `rest` にしていたが、「出勤も休暇も1日も無い
  週／期間」だけを評価対象外に落とす2つのガードが残っていた（`weekRestStateOf` の `skip` と
  `laborByStaff`／`liveTotalFor` の `active`）。**どちらも外した**ので、まるごと空欄の週は `休7`、
  まるごと空欄の期間は `公=期間の日数` になる。シフトを組み始めた直後は全員がその状態になるが、
  埋めるにつれて減る。**非表示にしたスタッフは `visibleStaffList` で先に落ちる**ので数えない。
- **データが揃っていないセルは「要確認」ではなく `＋` ＋実数**（同日・上記「月が埋まっていないときも
  実数を出す」が正本）。`＋` が付くのは 月実働・目安・残業予定・総括（`＋OK`）・週の休み の5箇所で、
  色は `var(--c-text3)`（淡色）に落として確定値と見分ける。**`＋` は必ず数値の前に置く**
  （`＋0h`。`0h＋` のように後ろへ置くと単位のように読める。2026-09-26 ユーザー指示）。
  年計の `＋` も同じ位置に揃えたが意味は違い、**読めていない期間がある**ことを示す
  （購読の窓の外＝「過去データ読み込み」で消える）。
- **一部の日はセルを紫で塗る**（`CELL_COLOR_LEGEND` の `laborErr`・2026-10-08 ユーザー指示で基準を変更）。塗るのは
  `LABOR_DAY_FIX_KEYS`＝**12h超（A制）・法定休日労働の日・月60h超の日（時間外を日付順に積んで60hを超えた出勤日・`over60DatesOf`）・
  特定技能の週の公休不足の週の出勤日（月をまたぐ週は足りない側だけ・`skilledShortWorkDates`）・属性の勤務時間の上限超（`attrLimitOverDatesOf`）**。
  属性の上限の窓は既存の表示と同じ値を使う（週＝週間勤務時間の表、1ヶ月＝期間別勤務時間の「月計」、2週間・任意日数＝提出一覧のバッジと同じ
  `rollingLimitOverWindows`）。窓を超えたら、その窓の中の出勤日を塗る。**1日の残業予定が上限超（A制）と1日の残業が上限超（B制・「8h超(残業)」の日を含む）は
  2026-10-08 から塗らない**（パネルには出る）。4h未満・休憩不足・8h超・週40h超・月の残業・目安・年の36協定も塗らない
  （該当日が多く、塗ると直すべき日が埋もれるため）。紫は総括判定とは別で、法定休日労働・月60h超・属性の上限超は総括を変えない。
  法定休日と月60h超は割増の計算と同じく期間の開始月だけで判定する。2026-09-30（P3.5c）に足した判定対象外の人の長時間の日を
  専用の赤で塗る店舗トグルは、**2026-10-03 のユーザー指示で機能ごと削除した**。本番の店舗に残る `laborSettings` の保存値は
  `laborSettingsOf` が既定値の無いキーとして捨てる（テストで固定）。
  **パネルに名前が出ていてもセルが塗られないことが普通にある**——パネルが判定の全量で、色はその一部にすぎない。理由はセルの `title`
  （「労務の要修正: 法定休日労働」の形）に出る。回帰は `example-labor-purple.js`（変更前の配信物では落ちる）。
- **パネルの判定は該当日をラベルの後ろに出す**（2026-09-26 ユーザー指示・リリース後の追加）。
  `休憩不足2日（3・5）` の形で、**日だけを出し月は出さない**（日次の判定は選択中の期間で絞られている
  ——同日の追加指示）。**10件で打ち切り残りは「ほかn日」**（`LABOR_FINDING_DATES_MAX`）——休憩を
  1件も設定していない店舗では全出勤日が該当するため、全部並べると1人ぶんが何行にもなる。
  - **日が付くもの**: 12h超・4h未満・1日の残業予定が上限超・8h超(残業)・1日の残業が上限超・
    休憩不足・時刻の入力ミス。色を付けない判定（4h未満・休憩不足）はこれが唯一の手がかりになる。
  - **週が付くもの**: 週40h超(残業)・週40h超(協定なし)は日に割れないので `（5〜11）` と該当週を出す。
    同じ週を2つの文言で説明するので、**どちらも同じ `wk` から作る**（別々に作ると食い違う）。
  - **何も付かないもの**: 月の残業・固定残業超・単月100h・目安・年の36協定4項目・区分が空欄か誤り。
    月・年の合計に対する判定で、該当日を足せる材料がそもそも無い。
  - **`dayMins` は `dates` と同じ並びで渡す**（0分の日も落とさない）。`4h未満` の `m>0` 絞りは
    `laborFindingsFor` の側にあるので結果は変わらないが、**落とすと添字がずれて別の日が表示される**。
- **この色は画面だけ**。Excel（`expXl`）と PDF（`buildShiftTableHtml`）は元から独自の色付けを
  持っていて参照が無く、**書き出しには出ない**。揃えようとして参照を足すと黙って配布物に出るので、
  参照が無いことをテストで固定してある。
- **労務の確認パネルは労務判定表のすぐ下**。総括が「要修正」の人を表で見つけ、そのまま下の一覧で
  理由を読む並びにしている（ポジション不足の一覧はグリッドの直下のまま）。
- **労働時間制の選択肢は雇用形態つきの2つだけ**（`LABOR_SYSTEM_CHOICES`・`LABOR_SYSTEM_LABELS`）。
  `1か月単位の変形労働時間制（正社員・契約社員・特定技能）` ／ `通常の労働時間制（パート・アルバイト）`。
  3つ目の `判定対象外（応援・外部）`（保存値 none）は 2026-10-03 に判定を B と同じにし、同日の追加指示で**選択肢から外した**
  （一度は選択肢を「応援・外部」に改名したが、ユーザーの言う「応援・外部」は組み込み属性 `dispatch` のことだったので、
  属性名のほうを「応援・外部」にし、同じ名前の労働時間制が並ばないよう選択肢を消した）。保存値・既定が none の属性は B が選ばれた状態で出る。
  **括弧の中は選ぶときの手がかりで、判定には使わない**
  （判定は属性ごとの `laborSystem`）。回帰スクリプトが select を探すときは
  **文言ではなく `option.value` で見分けること**——ここを文言で見ていた
  `example-labor-phase1.js` はこの変更で落ちた。

---

## 既知の技術負債

- ~~**app-admin.js が Babel Standalone の 500,000 文字を超えた（2026-09-30・P1b で 491,126 → 503,713 文字）**~~ →
  **同日 app-company.js を切り出して解消**（上の「app-company.js の切り出し」）。超えていた間は Babel が
  「[BABEL] Note: … exceeds the max of 500KB.」を console.error で出し、E2E ハーネスはこの1文だけを数えないようにしていたが、
  分割後に除外を外した（いまは console.error をすべて数える）。分割前の app-admin.js で回すとハーネスは EXIT=1 になる（実測）
- iOS Safari ズーム問題（input の fontSize<16）は **2026-09-01 にようやく全箇所解消**（バグチェック#103・`bc7bf2e`）。
  一括是正 `b7c084d`（2026-07-08）が見たのは app-staff.js と app-admin.js だけで、**その2日前の5分割（`f02cc80`）で
  生まれたばかりの app-main.js を一度も開いていない**。そのままここに「全箇所解消済み」と
  書かれ、ログイン画面の店舗コード入力（`fontSize:14`）が約2ヶ月残った。**件数をここに書かない**
  ——フォーム部品はUIを足すたびに増えるので、書いた数はコード変更なしに黙って偽になる（実際 56→57→58 と
  ずれた）。見るのは**16未満が0件**であることだけで、判定は毎回この走査で採る
  （2026-09-10 実測: フォーム部品58件・違反0件）。
  **走査するファイルに app-company.js・app-shift.js・app-my-utils.js・app-my.js を必ず入れる**（2026-09-30 分割・2026-10-04 従業員画面）。実測: 6ファイルで117件・違反0件、
  app-company.js を抜いた旧5ファイルの一覧だと43件＝**設定タブ・企業連携タブの74件を黙って数え落とす**。
  2回目の分割後の実測: 7ファイルで151件・違反0件、app-shift.js を抜いた6ファイルの一覧だと130件＝**シフト作成タブの21件を数え落とす**。
  2026-10-04（従業員画面 E1）の実測: 9ファイルで150件・違反0件。2026-10-05（847888f）の実測: 9ファイルで164件・違反0件（app-my.js は15件。大半は `style={AI}`／`MY_SELECT`（`{...AI}`）の変数渡しで、走査は数値リテラルしか見ないため、16px であることは `AI`（app-core.js）側で確かめる）。

  **走査が数えない例外が1件ある（2026-09-23〜）**: シフト作成タブの「全表示」のセル
  （app-shift.js の `AI2` の `fullView` 分岐。2026-09-30 の分割までは app-admin.js）は、行高から font を算出するので1ヶ月期間では
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
  for(const f of ["app-utils.js","app-my-utils.js","app-core.js","app-staff.js","app-admin.js","app-shift.js","app-company.js","app-my.js","app-main.js"]){
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
- **2026-10-08 のセキュリティ強化**（ユーザー指示「セキュリティ向上のためにできることをすべて実行」）:
  - 全員のシフト表の `shiftSheetEsc` が `"` `'` もエスケープする（スタッフURLから提出した名前で属性値を抜け出せた XSS の修正）
  - **提出（subs）は許可制**: 直下と日ごとの項目・型・長さを database.rules.json が縛る（`$other:false`）。staffName は `" < >` と改行・タブを拒否。**新しい項目を subs に書くときはルールにも足す**（tests/core.test.js の subs ルールのドリフト検出が漏れを落とす）。スタッフの登録・改名と提出画面の名前入力は `staffNameUnsafeChars`・`STAFF_NAME_UNSAFE_RE` で先に弾く。dev の実測は `probe-rules-subs.js`（57項目）
  - CF: sendEmailOtp は uid・アドレスごとに1時間5回（`emailOtpRate`）と `crypto.randomInt`、companyLogin は試行回数（`companies/{id}/private/loginFails`・5回目から1分・倍・上限30分・待ちの間は scrypt を回さない）、verifyShopOwner は未 claim の店舗も 403、myPagePin のロックは2回目から倍・上限24時間（`locks`）。純粋関数は `functions/security.js`（`tests/security.test.js`）。cf-verify は `example-security-cf.js`
  - `genToken`（スタッフURLのトークン）は `crypto.getRandomValues`
  - `_config.yml` で開発用の文書・functions・ルール・テストを GitHub Pages で配信しない（以前は shiftyshifty.app/CLAUDE.md が読めた）。**ただしリポジトリ（aech22/shifty）が公開なので GitHub からは読める**（非公開化はユーザー判断・Pages に有料プランが要る）
  - 通知の購読の endpoint はブラウザの Push サービスだけ（`PUSH_ENDPOINT_RE`）・提出の通知は店舗ごとに1時間60件
  - **CSP**: index.html の meta（GitHub Pages なのでヘッダーは付けられない）。script-src・connect-src・frame-src を既知の先に限る（Babel のため 'unsafe-eval'・'unsafe-inline' は残る。frame-ancestors は meta では効かない）。**外部の読み込み先・接続先を足すときは CSP にも足す**（回帰 `example-csp.js`＝本物の SDK で dev に接続して違反0件を確かめる）。App Check を有効にするときは reCAPTCHA の許可を足す
  - **計測の URL の伏せ字**: PostHog の `before_send` と GA の page_location で、#/s/・#/m/ のトークンと oobCode などのクエリを伏せる（index.html の analytics-mask の印の間・`tests/analytics-mask.test.js`・`example-analytics-mask.js`）。PostHog のセッション録画の画面の文字には届かない
  - **管理端末の一覧・解除・管理コードの作り直し**（設定タブの店舗管理コードの下・オーナーの端末だけ・app-main.js の rotateAdminKey）。解除だけでは管理コードを覚えた端末と企業メンバーは次に開いたとき自動で登録し直されるので、締め出しは作り直しで行う（この端末と企業アカウントは残る）。回帰 `example-admin-devices.js`
- 残存する既知の設計課題は capability モデル（管理系の書き込みは 2026-07-07 から owners 必須になったが、提出 `subs` の書き込みと個別URL（pageToken）は「URL・shopId を知る者」なら行える）。恒久対応は BACKLOG の「App Check の有効化」を参照
- ~~`globalTemplates` という state/prop 名の不一致~~ → 2026-08-10 に `shopTemplates` / `setShopTemplates` / `saveShopTemplates` へ改名して解消。**2026-09-28 にテンプレート機能そのもの（UI・購読・保存）を撤去したので、これらの名前もコードには無い**（Firebase の `shops/{shopId}/templates` は残存データのみ）（Firebaseパス `shops/{shopId}/templates` と localStorage キー `templates_v6` は変更なし＝データ移行不要）

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
- [労務給与_複数法人_実装計画.md](労務給与_複数法人_実装計画.md) — 労務・給与計算と複数法人の実装計画（P0〜P8）。労務判定 S-1〜S-7 の正本は 労務判定_実装計画.html のまま
- [Shifty_実装計画_2026-10.md](Shifty_実装計画_2026-10.md) — 従業員画面（マイシフト・給料・スタッフ個別URL）の計画（第2部 E.0〜E.7）
- [労務給与_複数法人_P8適用手順.md](労務給与_複数法人_P8適用手順.md) — P8（実店舗への適用）の本番反映後の運用手順
- [労務判定_実装計画.html](労務判定_実装計画.html) — 労務判定の確定仕様 S-1〜S-7（テストの期待値の正本）
- [シフトひな型2026-10版_取り込みと差分_実装計画.html](シフトひな型2026-10版_取り込みと差分_実装計画.html) — シフトひな型（2026-10版）の取り込みと機能差分（第3部 F7 の判断 D1〜D12）

---

## バグチェック最新状況

> 全履歴: `/Users/hiroshi/Documents/Obsidian Vault/Projects/Shifty/バグチェックログ.md`

<!-- BUG_CHECK_LATEST_START -->
## Shifty バグチェックレポート（2026-10-08 自動実行 #165）

> 着手時の HEAD は `fe3bbe6`。#164（`4edc06f`）以降に163コミット。主な変更は従業員画面（app-my.js・app-my-utils.js）、通知（functions/notify.js・Web Push の CF 3本）、セキュリティ強化（subs の許可制ルール・CSP・計測の伏せ字・管理端末の一覧と管理コードの作り直し・CF の試行回数制限）、労務の紫セルの基準変更、入社日・退社日。

### 修正済み

なし。

### 要確認（未修正）

- **[🟢] develop に本番未反映のコミットが20件ある。** origin/main..HEAD にセキュリティ強化（subs の許可制ルール `b107087`・CF の試行回数制限・verifyShopOwner の未claim 拒否・CSP）とマイシフト登録の表示が入っている。配信版数は `20261008-8328670` のままで、app-*.js・index.html が版数より後に変わっている。subs のルールは既存パスの締め付けなので CLAUDE.md の順（クライアント → ルール → CF）で `/release-to-main` を通せば閉じる。BACKLOG 化はしない。
- **[🟢] lint の warnings が 119 から 184 に増えた。** 全件 no-unused-vars（ファイルをまたぐコンポーネントと定数の誤検知）で、errors は0件。
- **[🟢] SVG の属性に `var()` を書いた箇所が2件**（app-staff.js:148 の `fill`、app-my.js:1799 の `stroke`）。後者を WebKit で実測した記録はまだ無い。
- **[🟢] #158 から継続の4件・#163 の F6③・`.cursorrules` の未コミット変更。** 状態は同じ。

### 異常なし

- 通知の CF（notifyStaffSubmit）は `after.periodId` をパスに埋め込むが、ルールが subs の periodId を `^[A-Za-z0-9_-]+$`・64字以内に限っているので Admin SDK の空セグメントの詰め（#125 の形）は起きない。secrets は通知3本とも `VAPID_PRIVATE_KEY` を持つ。
- `npm test` **739件パス**・`npx eslint app-*.js` **0 errors / 184 warnings**・functions/*.js の構文チェックはすべて通過。
- `DEV_MODE` は式のまま。読み込み順は9ファイルとも正しい。Babel を通る最大のファイルは app-company.js の 225,150 字。SRI は11本。未定義の CSS 変数は0件で、ダーク定義の2箇所も一致。フォーム部品162件で fontSize 16 未満は0件。subs・periods の全体 set()・global/shops の一覧読み・`".read": true`・functions の `.delete()` は0件。削除の filter 3か所はどれも deletedId を渡すか remove() を呼んでいる。
- **Firebase・Stripe・本番データには一切アクセスしていない。** 実ブラウザの回帰は今回回していない。

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

## 🟡 メール確認つきの新規登録: Firebase コンソールの設定（ユーザー作業）→ 本番で登録を1回通す

**目的**: 2026-10-04 に新規登録（マイシフト・管理者のログイン画面・設定タブのアカウント連携）を「確認メールのリンクを開いて続きを登録」に変えた（`dd06a46`）。
コードはコンソールの設定前でも壊れない（`auth/operation-not-allowed`・`auth/unauthorized-continue-uri` なら従来の登録に自動で切り替わる）が、
**設定するまで本番は従来の登録のまま**（確認メールは送られない）。設定はユーザーの作業（コードやデプロイでは変えられない）。
**受け入れ条件**:
- [ ] Firebase コンソール（ontheshift）→ Authentication → Sign-in method → 「メール / パスワード」→ 「メールリンク（パスワードなしでログイン）」を有効にして保存
- [ ] Authentication → Settings → 承認済みドメイン に `shiftyshifty.app` を追加（2026-10-04 時点は localhost・ontheshift.firebaseapp.com・ontheshift.web.app・aech22.github.io だけ）
- [ ] Authentication → Templates → 「メールアドレスのリンクでログイン」（Email link sign-in）のテンプレートの言語を日本語に（任意）
- [ ] 本番で新規登録を1回通す（実在の自分のアドレス）: 確認メールが届く → リンクで続きの画面が開く → パスワードを決めて登録 → 再読み込み後もログインのまま
- [ ] dev（thirty-dev-b6958）でも同じ設定をするかはユーザー判断（しない場合、dev は従来の登録のまま）
**影響範囲**: Firebase コンソールだけ（コード・ルール・CF の変更なし）

---

## 🔴 次の本番リリースでユーザーと突き合わせる実機確認（`/release-to-main` の担当は必ずこの一覧を開く）

**目的**: 2026-10-04 の第1部（S1〜S3・H2・K2）と第2部（従業員画面 E0〜E6）は、ヘッドレスのブラウザ・スタブ Firebase・シミュレーターでしか確かめていない。
見た目と体感、実際のアプリへの取り込み、実際の給与明細との一致は**実機とユーザーの目でしか決まらない**ので、本番へ出すリリースの際にユーザーと1項目ずつ突き合わせる
（2026-10-04 ユーザー指示）。**ここに✅を付けるのはユーザーと確認した後だけ**。読めない・切れる・合わないが見つかったら、その項目の「戻る先」のタスクを開き直す。
**いつ**: 第1部（S1〜S3・H2・K2）が載るリリースと、従業員画面の入口（`MY_SCREEN_ENABLED`）を外すリリース（下の「従業員画面の本番反映」③）。同じリリースなら1回でよい。

- [ ] **高速化（S1〜S3）の体感**: 人数の多い店舗（30人×31日ほど）のシフト作成タブで、セルの入力・選択・確定（Enter・フォーカスの移動）が引っかからないか。
      確定のあとに労務判定・ヒートマップ・集計が少し遅れて更新される（S3 の「後回しの計算」・淡く表示）のが気にならないか。PC と iPhone の両方。
      戻る先: 完了済みの S1・S2・S3（計測は `perf-shift-edit-tab.js`）
- [ ] **H2 の縮めた文字の読みやすさ**: ヘルプ勤務の合成表示（例「11鶏三」）は、画面の通常表示で 10.5px・全表示で 11px、PDF で 8px まで縮む。
      実機の画面（PC と iPhone）と、印刷した PDF で読めるか。読めなければ H2 の再着手条件に当たる（列を広げる案は不採用のまま・まず文字の下限を見直す）。
      戻る先: 完了済みの H2
- [ ] **Excel の名前行（K2）**: 9pt・縦書き・行の高さ 78 のまま。**7文字を超える名前が切れないか**を、実際の Excel（Windows と Mac）でファイルを開いて確かめる。
      切れるなら行の高さか文字の大きさを決め直す。戻る先: 完了済みの K2
- [ ] **.ics の取り込み**（従業員画面の給料・マイシフト。2026-10-04 に互換性を点検）: ①実機の iPhone の Safari でマイシフトの「この月のシフトをカレンダーに取り込む」→
      「すべて追加」（iOS 27 のシミュレーターでは取り込めた）、②Google カレンダー（PC のウェブ版の「設定 → インポート / エクスポート」でファイルを選ぶ・
      日付の詳細の「Google カレンダーに追加」リンク）、③Outlook（デスクトップと Outlook.com）、④Android のカレンダー。
      見るもの: 時刻（**24時超えの勤務が翌日の時刻になるか**・時刻がずれないか）、日本語のタイトル、締の追加出勤が別の予定になるか、
      同じ月を書き出し直したときに予定が増えずに上書きされるか（SEQUENCE。シミュレーターでは確かめられなかった）。戻る先: 完了済みの E4
      ⑤**TimeTree**（2026-10-04 追加）: TimeTree は .ics を直接取り込めない（公式ヘルプ）ので、①で iPhone のカレンダーに取り込んだあと、iPhone の「設定」→「TimeTree」→
      「カレンダー」を「フルアクセス」にし、TimeTree の左下のカレンダー → 右上のアイコン →「表示するフィルターを選択」で取り込み先のカレンダー（iCloud 等）をオン →
      **ホームカレンダーにシフトが出るか**、同じ月を書き出し直したときに **TimeTree 側で予定が二重にならないか**（iPhone のカレンダーで上書きされていれば二重にならないはず）、
      マイシフトの「TimeTree などのアプリで見るには」の手順の文言が実際の画面の名前と合っているか。Android は Google カレンダーに取り込み → 同期 → TimeTree の権限 → 同じフィルター。戻る先: 完了済みの「全員のシフトの期間のプルダウンと #/me の全員のシフト」
      ⑥**LINE から開いた場合・ホーム画面から開いた場合**（2026-10-04 追加・取り込む前の確認）: (a) LINE のトークに個別URL を `openExternalBrowser=1` を**外して**送り、
      LINE の中のブラウザで開く →「この月のシフトをカレンダーに取り込む」で「LINEの中で開いています」の確認が出るか →「Safariで開く」で Safari に切り替わり
      同じ画面（#/m/… のまま）が開くか（LINE の中のブラウザからこの印つきの URL へ移ったときに外へ出るかは未確認）→ Safari で取り込めるか。
      確認の「このまま書き出す」で LINE の中のまま書き出すと何が起きるか（取り込めるなら確認を任意へ下げる。iPhone と Android の両方）。
      Instagram の中のブラウザでも確認が出て「URL をコピー」が使えるか。(b) 実機の iPhone で Safari の「ホーム画面に追加」（ウェブアプリとして開く）から
      マイシフトを開き、確認が出ずに「すべてを追加」の画面が出て、閉じるとアプリに戻るか（iOS 27 のシミュレーターでは出た。古い iOS では出ない報告がある）。
      #/me をホーム画面から開くと Safari とログインが分かれる（保存場所が別）ことも見る。(c) Android の Chrome で確認の3手順どおりにファイルを開けるか。戻る先: 完了済みの「カレンダーへ取り込む前の確認」
- [ ] **全員のシフトの期間のプルダウン**（2026-10-04 追加）: 実機の iPhone で個別URLと #/me の「全員のシフト」の期間・店舗の select を開いて選べるか（iOS のホイールのピッカー）、
      選んだ後に横スワイプで「自分のシフト」へ戻れるか（select の操作で横スクロールが動かないか）。戻る先: 同上
- [ ] **給料の目安と実際の明細の突き合わせ**（E5・E6）: 1人1か月ぶん、給料タブの金額（合計・確定分・内訳）と実際の給与明細を並べる。
      時給者と月給者、月末締めでない勤務先、ヘルプ先の勤務がある人を含める（ヘルプ先の勤務は所属店舗の給料に合算しない差がある＝CLAUDE.md の E5 の節）。
      **Shifty の計算値を正解として代用しない**（ユーザーの領分）。戻る先: 完了済みの E5・E6
- [ ] **スタッフ個別URLの横スワイプとピンチ拡大**（2026-10-04）: 実機の iPhone の Safari で個別URLのマイシフトを開き、①指の横スワイプで「自分のシフト」「全員のシフト」が
      切り替わるか（上のタブの表示も追随するか）、②全員の表を2本の指で拡大して細部（30人×31日では文字が約3px）が読めるか、③**拡大したまま表を左右に動かしても
      隣の表示へ切り替わらないか**（visualViewport.scale で横スクロールを止める実装。Chromium の page scale では確かめた・WebKit の実機は未検証）、
      ④縦のスクロールとスワイプが混ざって誤って切り替わらないか。Android の Chrome でも同じ。戻る先: 完了済みの「スタッフ個別URL」P3
- [ ] **個別URLの申請から提出まで**（2026-10-04）: 実機で募集URL → 「自分専用のURLを作る」→ コピーと共有（LINE に貼る）→ 管理者が承認 → **別の端末（家族のスマホ等）で同じURL**
      → 本人のシフト・全員の表・「提出」タブから最新期間に提出 → 管理者のシフト作成タブに出る。ホーム画面に追加して開けるか。戻る先: 完了済みの「スタッフ個別URL」P1・P2

**影響範囲**: なし（確認だけ。食い違いが見つかったときは戻る先のタスクで直す）

---

## 🟡 従業員画面（第2部 E0〜E6）の本番反映: ルール → CF → クライアント（入口のゲートを外す）

**目的**: 従業員画面（マイシフト・給料）は E0〜E6 を 2026-10-04 に develop で実装し終えたが、**ルールも Cloud Functions も dev・本番とも未デプロイ**（担当の制約）。
入口は `MY_SCREEN_ENABLED = DEV_MODE`（app-core.js）の下にあり、本番では出ていない。CF は cf-harness（本物の index.js）、画面はスタブ Firebase でしか確かめていない。
以前の「E1 の残り（users/{uid} ルール）」「E2 の残り（紐付けの CF とルール）」をここへまとめた（2026-10-04）。
**順序（厳守）**: ①ルール（新ノードだけなので**ルールが先**＝CLAUDE.md の「クライアント先」と逆。旧クライアントは users/・linkRequests・staffLinks・staffLinkCode* を触らない。
リリース直前にユーザーへ理由を示して承認を取る）→ ②CF（下の5本と既存の更新。P1〜P6 と同じく1回のデプロイ）→ ③クライアントの配信（`?v=` のバンプ）と `MY_SCREEN_ENABLED` のゲートを外す。
ゲートを外すのは①②の実測が済んでから（外す判断はユーザー）。①だけ・②だけでゲートを外すと、プロフィール・紐付け・勤務先・給料の保存が拒否されるか「関数が無い」で失敗する（画面は落ちず理由を出す）。
**①ルール（dev → 本番）と REST の実測**:
- [ ] dev の RTDB へ反映する（確認ゲートあり・ユーザー承認）
- [ ] REST で実測: 匿名 uid は自分の `users/{uid}/profile` に書けない（401）／メールを連結した uid は書ける（200）・他人の uid には書けない（401）・
      形の不正（displayName 51文字・number 9文字・余計なキー）は 401・本人は読める／他人は読めない。
      **連結の直後のトークンで書けるか**（`auth.token.email` が連結直後に入るか）を実 Firebase で確かめる
- [ ] 実 Firebase で「登録 → 別ブラウザでログイン → 同じ uid・同じ登録ネーム」を1回通す（スタブでは検証済み）
- [ ] E3（2026-10-04）で足した `users/$uid/seen/$shopId/$periodId` も同じ回で反映し、REST で実測する: メールのある本人は書ける（200）・匿名 uid・他人の uid は 401・
      `at` の無い記録・日付でない `days` のキー・41字以上の値・余計なキーは 401。反映まで dev の実機では「変更あり」の記録が拒否される（画面は落ちず、毎回初回の扱いになる）
- [ ] E4（2026-10-04）で足した `users/$uid/workplaces/$wid`・`shifts/$sid`・`overrides/$shopId/$date` も同じ回で反映し、REST で実測する:
      メールのある本人は書ける（200）・匿名 uid・他人の uid は 401。
      workplaces: `m_`+8桁の id に kind manual・name・color は 200／Shifty の店舗は id＝shopId・kind shifty・shopId 一致で 200（name なしも 200）／
      kind と id の食い違い（m_ の id に shifty・店舗 id に manual・shopId が id と違う）・色が #rrggbb でない・name 31字・余計なキー（`pay` を含む。E5 がルールを足すまで）は 401。
      **update でフィールドだけ書けること**（`{color}` だけの update が既存の kind・shopId と合わせて通る）と、`name:null` で名前だけ消せることも確かめる。
      shifts: `h_`+10桁の id で 200／id の形・workplaceId が m_ でない・日付の形（2026-13-01）・時刻 "9:30"（1桁）・"30:05"・breakMin 1441・memo 201字・必須の欠け・余計なキーは 401。
      overrides: start・end・breakMin が揃えば 200／欠け・形の不正は 401。`overrides/{shopId}` をまとめて null にできる（リンク解除済みの店舗を消すとき）。
      `users/{uid}` への複数パスの update（勤務先とそのシフトをまとめて消す）が子のルールだけで通ることも確かめる。反映まで dev の実機では手入力・上書き・勤務先の保存が拒否される（画面は落ちず、理由を出す）
- [ ] REST で実測: 申請は本人かつメールのある認証だけ書ける（匿名 uid・他人の uid・存在しない店舗・デモ店舗・形の不正は 401）／オーナーは読めて消せる・本人は自分の申請だけ読める。
      staffLinks はオーナーも**作れない**（401）・オーナーは消せる・既存の紐付けの `name` だけ書き換えられる（`method`・`personId` は 401）・本人は自分の分だけ読める。
      `staffLinkCodes` 等の3ノードは誰も読み書きできない
- [ ] E5（2026-10-04）の `users/$uid/workplaces/$wid/pay`・`users/$uid/goals`・`users/$uid/actuals/$ym/$wid` を REST で実測する: メールのある本人は書ける（200）・匿名 uid・他人の uid は 401。
      pay: 必須（closingDay・payMonthOffset・payDay・holidayRule）の欠け・closingDay 0／32・payMonthOffset 3・holidayRule "x"・rate だけで wageType なし・rate 0・commute の per "week"・
      commute の余計なキー・余計なキーは 401。**勤務先の update（kind・shopId・color・name・pay を1回の update）が通ること**と、`pay:null` で給料設定だけ消せること。
      goals: monthly 0 は 401（消すのは null）・余計なキーは 401。actuals: `2026-13` の月・負の値・1千万円超は 401、`actuals/{ym}` をまとめて消せる。`actuals` 全体への書き込みは 401
- [ ] スタッフ個別URL（2026-10-04）の `staffPageTokens`・`shops/*/staffPages`・`staffPageData`・`staffPagePins` を同じ回で反映し、REST で実測する（匿名 uid で足りる）:
      **staffPageTokens**: 新しい token の作成は 200（shopId が global/shops にある店舗）・同じ token の上書き（別の shopId）は 401・存在しない店舗・デモ店舗・token の形（23文字・記号）・
      余計なキーは 401・一覧の読みは 401・1件の読みは 200・削除はその店舗のオーナーだけ 200（他は 401）。
      **staffPages**: オーナー以外は `status:"pending"` の新規作成だけ 200（`name`・`approvedAt`・`byUid`・`pinResetAt` を含むと 401・`status:"approved"` は 401）・
      pending の削除は誰でも 200・approved の書き換えと削除はオーナー以外 401・オーナーは承認（status・name・approvedAt・byUid＝自分の uid）200・`byUid` が他人の uid なら 401・
      approved なのに name が無いと 401・一覧の読みはオーナーだけ（他は 401）・1件の読みは 200・デモ店舗は 401。
      **staffPageData**: approved の token は読み書き 200（形は users/{uid} と同じ検証）・pending／revoked／存在しない token は読み書きとも 401・`profile`・`links` 等の余計なキーは 401。
      **staffPagePins**: 誰も読み書きできない（401）。反映まで dev の実機では申請・承認・本人のデータの保存が拒否される（画面は落ちず理由を出す）
- [ ] 本番へ反映する（dev と同じファイル。本番のルールは REST で叩かない）
**②CF（本番）**:
- [ ] 紐付けの4本（`approveStaffLink`・`issueStaffLinkCode`・`redeemStaffLinkCode`・`unlinkStaff`）と既存の更新（`companyRenameStaff`・`syncPeopleMirror`・`purgeInactiveShops`）、
      E6 の `getMyPay`。**CF より先にクライアントを出すと**、承認・コードの発行と入力・解除が「関数が無い」で失敗し、給料は会社設定を読めず本人の設定で計算する（申請・却下・改名と削除の追随はクライアントだけで動く）
- [ ] 実機（dev は Spark で CF が動かないので本番の検証店舗）で A・B・C を1回ずつ通し、`staffLinks` と `users/{uid}/links` が同じ値で書かれること、
      コードが1回で消えること、`redeemStaffLinkCode` の `token.email` が連結直後の匿名 uid でも入ること（E1 の未検証と同じ問い）を確かめる
- [ ] Admin SDK の `transaction()` の挙動（手元に値が無いと最初に null で呼ぶ）で「1回限り」が崩れないことを実機で確かめる（cf-harness のモックは1回だけ呼ぶ）
- [ ] getMyPay を本番の検証店舗で1回通す: 紐付いた本人に自分の private/pay だけが返る・別の uid の紐付けの名前を渡しても自分の分だけ・紐付けの無い uid は permission-denied・
      匿名 uid は failed-precondition（**連結直後のトークンに email が入るか**は E1 と同じ未検証の問い）
- [ ] Admin SDK の `transaction()` の挙動（手元に値が無いと最初に null で呼ぶ）で「1回限り」が崩れないことを実機で確かめる（cf-harness のモックは1回だけ呼ぶ）
- [ ] スタッフ個別URL（2026-10-04）の `myPagePin`（新規）と `purgeInactiveShops` の更新（アーカイブする店舗の staffPageTokens・staffPageData・staffPagePins を消す）。
      **CF より先にクライアントを出すと**、個別URLの給料タブが開かない（「暗証番号を確認できませんでした」）。閲覧・提出・承認はクライアントだけで動く。
      本番の検証店舗で1回通す: 番号を決める → 本人の private/pay だけが返る・誤りで残り回数・5回で15分・管理者のリセットで決め直し。
      **試行回数のトランザクションが実 SDK で null から呼ばれても回数が数えられること**（cf-harness のモックは1回だけ呼ぶ）を確かめる
**③クライアントとゲート**:
- [ ] リリースの際に、この上の「🔴 次の本番リリースでユーザーと突き合わせる実機確認」をユーザーと1項目ずつ行う（.ics・給料の項目はこのゲートを外すリリースで）
- [ ] `MY_SCREEN_ENABLED = DEV_MODE` を外して本番に入口を出す（①②の実測の後・ユーザー判断）。外すと本番でもスタッフURLに「マイシフト」ボタンが出て、`#/me` が従業員画面になる
- [ ] 本番で「登録 → 別ブラウザでログイン → 同じ uid・同じ登録ネーム」・紐付け（A・B・C を1回ずつ）・公開と確定で黒文字・手入力のシフト・給料の月と年を1回ずつ通す
**未検証の一覧（2026-10-04 時点）**: ルールの実機すべて／CF の実機すべて（getMyPay・myPagePin を含む）／個別URLの iPhone の指のスワイプとピンチ拡大／連結直後のトークンの email／`transaction()` の1回限り／
実機の iPhone・Google カレンダー・Outlook・Android への .ics の取り込み（2026-10-04 に iOS 27 のシミュレーターでは取り込めた）／公開シフトが消えた日に残った上書きの掃除／給料の目安と実際の給与明細の突き合わせ（ユーザーの領分。Shifty の計算値を正解として代用しない）／
ヘルプ先の勤務を所属店舗の給料に合算しない差（月次賃金ページとは週40h・月の総枠の扱いがずれる）
**影響範囲**: database.rules.json・functions/index.js・functions/staff-link.js・functions/my-pay.js・functions/my-page.js（反映のみ）・app-core.js（ゲート）

---

## 🟢 スタッフ個別URLとメールのアカウントの統合（見送り・2026-10-04）

**目的**: 同じ人が個別URL（`staffPageData/{token}`）とメールのアカウント（`users/{uid}`）の両方を使うと、勤務先・手入力のシフト・給料の設定が別々に残る。
個別URLのデータをアカウントへ取り込む（または逆）経路は作っていない。
**やらなかった理由**: 重複は表示の問題で、取り込みには「同じ人である」ことの確認（個別URLの暗証番号とアカウントのログインの両方）と、重なった記録の決め方が要る。
今回の依頼（個別URLでの閲覧と提出）には不要。
**再着手条件**: 両方を使って困っているという声が出たとき、または本番で個別URLとアカウントの両方を持つ人が一定数を超えたとき。
**影響範囲（そのとき）**: app-my.js（設定タブに取り込みの入口）・Cloud Functions（両方の本人確認をしてから写す）・database.rules.json

## 🟢 実績で出勤・退勤を変えた日に、確定シフトの日別休憩上書き（adjustedBreak）をそのまま当てるか

**目的**: `resolveActualDay`（app-utils.js）は実績の時刻で `getBreaksFor` を通し直すが、確定シフトの `adjustedBreak` は残すので、
日別上書きが最優先で当たる。実測: 9:00〜18:00・休憩30分指定の日に実績の退勤を 09:15 にすると、実働0分・休憩15分になる
（10:00 なら実働30分・休憩30分、上書きが無ければ実働15分）。仕様の文言（「日別上書き＞長さ＞時間帯」（当時は中休みを含む）「breakMin が無ければ判定し直す」）
どおりの挙動で、実績の休憩欄に分を入れれば直せる。
**受け入れ条件**:
- [ ] 実績の時刻が確定シフトと違う日に `adjustedBreak` を当て続けるか、落として判定し直すかを決める（**ユーザー判断**）
- [ ] 決めた向きを実装し、割増（P5）・月次賃金（P6b）の値が変わる例をテストで固定する
**影響範囲**: app-utils.js（`resolveActualDay`）、tests/core.test.js
**備考**: バグチェック#156（2026-09-30）で検出・条件B（仕様判断）に該当。起きるのは休憩を日別に指定した日を実績で大きく短くしたときだけ。

---

## 🟡 労務・給与と複数法人: 法人レイヤー（P1）の Cloud Functions の本番反映と実データ確認（全フェーズ完了後に1回）

> **✅ 2026-10-01 確認: ルール・Cloud Functions の本番反映は済んでいる。** 主セッションが本番（ontheshift）のセキュリティルールを
> ローカルの `database.rules.json` とバイト照合して完全一致（8437 bytes）、`firebase functions:list` で32関数の稼働を確認した。
> 下のチェックのうち「ルール」「CF」の反映と順序の項目は完了扱いで、**残りは実データでの確認だけ**（未チェックのまま残す）。

**目的**: P1（2026-09-30・develop `6074b26`〜）の CF は **本番に未デプロイ**。dev は Spark で CF をデプロイできないため、
CF の中身は `tests/core.test.js`（`functions/company-config.js` の純粋関数）とスタブ Firebase の実ブラウザ回帰
（`example-company-entities.js`）でしか確かめていない。ユーザー指示（2026-09-30）で本番反映は P0〜P7 の完了後に1回だけ行う。
**反映が要るもの**:
- [ ] CF: 新規6本（`ensureCompanyEntities`・`createEntity`・`renameEntity`・`assignShopEntity`・`saveEntityConfig`・`setShopKind`）と
      既存の更新（`syncCompanyMirror` を使う全関数・`createCompany`・`linkStoreToCompany`・`unlinkStoreFromCompany`）
- [ ] ルール: **変更なし**（新ノードはすべて `companies/$id/pub` 配下＝既存ルールで CF 専用・企業 uid と作成者だけ読める。dev の REST で19項目実測済み）
- [ ] 順序: CF を先に出してからクライアント。**クライアントだけ先に出ると**、法人カードの `ensureCompanyEntities` が存在しない CF を呼んで
      「法人を準備できませんでした」のトーストが出る（他の機能は壊れない。法人の無い企業は従来どおり1法人扱いで表示される）
- [ ] 反映後、既存企業で企業連携タブを1回開き、`companies/{id}/pub/entities` ができて全店舗が割り当たり、写し `shops/{sid}/company` に
      `entityId`・`entityName`・`kind` が入ることを `shifty-prod-data-probe`（読み取り専用）で確認する
- [ ] 別の企業に連携中の店舗を `linkStoreToCompany` で追加すると拒否されることを本番で1回確かめる（dev では CF が動かず未検証）
- [ ] P2（`f02b4bb`）: `sanitizeCompanySettings` が労務設定の新キー4つ（年間所定・分母・週の起算・月をまたぐ週）を通すようになった。
      同じデプロイに含めれば足りる（`saveCompanyConfig`・`saveEntityConfig`）。反映後、企業の共通設定に年間所定 2080h を入れて保存し、
      写しの `settings.laborSettings.annualScheduledMin=124800` と店舗の設定タブの所定上限の列（31日 176:39）を確かめる
**影響範囲**: functions/index.js・functions/company-config.js（コード変更は済み）

---

## 🟡 労務・給与と複数法人: 人物ID（P1b）の Cloud Functions の本番反映と実データ確認（全フェーズ完了後に1回）

> **✅ 2026-10-01 確認: ルール・Cloud Functions の本番反映は済んでいる。** 主セッションが本番（ontheshift）のセキュリティルールを
> ローカルの `database.rules.json` とバイト照合して完全一致（8437 bytes）、`firebase functions:list` で32関数の稼働を確認した。
> 下のチェックのうち「ルール」「CF」の反映と順序の項目は完了扱いで、**残りは実データでの確認だけ**（未チェックのまま残す）。

**目的**: P1b（2026-09-30・develop `a52a405`〜）の CF は **本番に未デプロイ**。dev は Spark で CF をデプロイできないため、
中身は `tests/core.test.js`（`functions/company-config.js` の純粋関数とクライアントとの一致）とスタブ Firebase の実ブラウザ回帰
（`example-company-people.js`）でしか確かめていない。ユーザー指示（2026-09-30）で本番反映は P0〜P7 の完了後に1回だけ行う。
**反映が要るもの**:
- [ ] CF: 新規6本（`ensureCompanyPeople`・`mergePeople`・`splitPerson`・`reassignPersonId`・`companyRenameStaff`・`companyUpdateStaff`）
- [x] CF: 「統合しない」（2026-09-30）の `markPeopleDistinct` と、distinct の後始末を足した `mergePeople`・`splitPerson`・`reassignPersonId`。**CF より先にクライアントを出すと**、重複候補の「統合しない」と編集モーダルの「取消」が「関数が無い」で失敗する（候補の表示・統合は従来どおり動く） → **2026-09-30 13:16 に本番へデプロイ済み**（32関数・markPeopleDistinct は create、他は update。未認証 POST が INVALID_ARGUMENT を返すことを確認）
- [ ] ルール: **変更なし**（`companies/$id/pub/people` は既存の pub のルールで読みが企業uidと作成者・書きは `companies/$id/.write:false`＝CF 専用）
- [ ] 順序: CF を先に出してからクライアント。**クライアントだけ先に出ると**、企業内登録スタッフを開いたときの `ensureCompanyPeople` が失敗し、
      行に人物IDが付かないので「編集」と統合のチェックが押せないまま（一覧の表示は従来どおりで壊れない）
- [ ] 反映後、企業内登録スタッフを1回開いて `companies/{id}/pub/people` ができ、行数と並びが反映前と同じことを `shifty-prod-data-probe`（読み取り専用）で確認する
- [ ] 本番で1人の改名を企業の一覧から通し、店舗の staff・全 subs・settings・periods・private/pay が移ったことを同じく読み取りで確認する
      （Admin SDK での `staff` のトランザクションと subs 全件の読みは実データでしか確かめられない）
**影響範囲**: functions/index.js・functions/company-config.js（コード変更は済み）

---

## 🟡 労務・給与と複数法人: ヘルプ先勤務の合算（P3.6）の Cloud Functions の本番反映と実データ確認（全フェーズ完了後に1回）

> **✅ 2026-10-01 確認: ルール・Cloud Functions の本番反映は済んでいる。** 主セッションが本番（ontheshift）のセキュリティルールを
> ローカルの `database.rules.json` とバイト照合して完全一致（8437 bytes）、`firebase functions:list` で32関数の稼働を確認した。
> 下のチェックのうち「ルール」「CF」の反映と順序の項目は完了扱いで、**残りは実データでの確認だけ**（未チェックのまま残す）。

**目的**: P3.6（2026-09-30・develop `a892d85`〜）は写し `shops/{sid}/company` に `people`・`shopEntities` を焼くよう CF を変えた。**本番に未デプロイ**。
中身は `tests/core.test.js`（`buildShopMirror`・`mirrorPeopleOf`）とスタブの実ブラウザ回帰（`example-helper-aggregate.js`・`example-company-dup-candidates.js`）でしか確かめていない。
**反映が要るもの**:
- [ ] CF: `syncCompanyMirror` を使う全関数（写しの形が変わる）と、人物を変える5本（`ensureCompanyPeople`・`mergePeople`・`splitPerson`・`reassignPersonId`・`companyRenameStaff`）の `syncPeopleMirror`。
      P1b の CF と同じデプロイで出せば足りる
- [ ] ルール: **変更なし**（写しは既存ルールで CF 専用・読みは `auth != null`。他店の subs・staff・settings・periods も既存ルールで `auth != null` で読める）
- [ ] 順序: CF を先に出してからクライアント。**クライアントだけ先に出ると**、写しに `people` が無いので同一人物は後方互換の規則（所属店舗の一致）だけで判定され、
      人物で束ねた（登録名が違う・所属店舗が未設定の）登録は合算されない（壊れはしない＝以前と同じ表示に倒れる）
- [ ] 反映後、企業内登録スタッフを1回開き（または人物を1つ統合し）、写し `shops/{sid}/company.people` ができたことを `shifty-prod-data-probe`（読み取り専用）で確かめる
- [ ] 本番で、所属店舗が明示されていて他店にもシフトがある人を1人選び、所属店舗のシフト作成タブで読み取り専用セル・月実働の合算を目で確かめる
      （行き先の店の設定で引いた実働が、その店のシフト作成タブの値と一致すること）
**影響範囲**: functions/index.js・functions/company-config.js（コード変更は済み）

---

## 🟡 労務・給与と複数法人: 実績（P4）のルール・CF の本番反映と実データ確認（全フェーズ完了後に1回）

> **✅ 2026-10-01 確認: ルール・Cloud Functions の本番反映は済んでいる。** 主セッションが本番（ontheshift）のセキュリティルールを
> ローカルの `database.rules.json` とバイト照合して完全一致（8437 bytes）、`firebase functions:list` で32関数の稼働を確認した。
> 下のチェックのうち「ルール」「CF」の反映と順序の項目は完了扱いで、**残りは実データでの確認だけ**（未チェックのまま残す）。

**目的**: P4（2026-09-30・develop `7520a55`〜`564ae08`）は新ノード `shops/{sid}/actuals` を足した。ルールは dev にだけ反映する（反映と REST 実測は
`probe-rules-actuals.js`）。CF の変更（`companyRenameStaff` が actuals を移す・`purgeOldPeriods` が actuals/{期間ID} を消す）は本番に未デプロイ。
**反映が要るもの**:
- [ ] ルール: `actuals`（読み書きともオーナー・形の検証）。**新ノードなので本番はルールが先**（計画書 §6 冒頭。ルールが無いと実績の保存が拒否される）
- [ ] CF: `companyRenameStaff`・`purgeOldPeriods`（P1b・P3.6 と同じデプロイで出せば足りる）。**クライアントだけ先に出ても壊れない**
      （企業の一覧からの改名で actuals だけ旧名のまま残る。店舗のスタッフタブからの改名はクライアントが移す）
- [ ] 反映後、本番の確定済みの期間で「実績」を1件入れて消し、`shops/{sid}/actuals` に差分だけが書かれ、消すとノードが無くなることを `shifty-prod-data-probe`（読み取り専用）で確かめる
- [ ] 打刻機の CSV 形式が分かったら、`DEFAULT_ACTUALS_CSV_MAPPING` と文字コードの既定を合わせる（計画書 §8「残る確認」）
**影響範囲**: database.rules.json・functions/index.js・functions/company-config.js（コード変更は済み）

---

## 🟡 労務・給与と複数法人: 賃金マスタ（P6a）のルール・CF の本番反映と実データ確認（全フェーズ完了後に1回）

> **✅ 2026-10-01 確認: ルール・Cloud Functions の本番反映は済んでいる。** 主セッションが本番（ontheshift）のセキュリティルールを
> ローカルの `database.rules.json` とバイト照合して完全一致（8437 bytes）、`firebase functions:list` で32関数の稼働を確認した。
> 下のチェックのうち「ルール」「CF」の反映と順序の項目は完了扱いで、**残りは実データでの確認だけ**（未チェックのまま残す）。

**目的**: P6a（2026-09-30・develop `65f7a49`〜`374e914`）はルールを dev にだけ反映し、CF は本番に未デプロイ。
ユーザー指示（2026-09-30）で本番反映は P0〜P7 の完了後に1回だけ行う。
**反映が要るもの**:
- [ ] ルール: 新ノード（`shops/*/private/pay`・`shops/*/private/payCode` の書き込み＝オーナー、`companies/*/private/payCode` の読み＝企業uidと作成者）。
      **新ノードなのでルールが先**（計画書 §6 冒頭。CLAUDE.md の「クライアント先」と逆になるので、リリース直前にユーザーへ理由を示して承認を取る）。
      ルールより先にクライアントを出すと、賃金の保存と店舗のパスコード変更が拒否される（トーストが出るだけで他は壊れない）
- [ ] CF: 新規 `setCompanyPayCode`、`syncCompanyMirror` のパスコード同期、`sanitizeCompanySettings`・`mergeEntitySettings` の `wageSettings`
      （`saveEntityConfig`・`saveCompanyConfig` とその写しを作る全関数に効く）。CF より先にクライアントを出すと、法人の最低賃金を保存しても
      旧 CF の sanitize で捨てられ最賃比較が出ない／企業のパスコード変更が「関数が無い」で失敗する（賃金の入力そのものは動く）
- [ ] 反映後、本番で企業アカウントの「賃金の閲覧パスコードを変更する」を1回通し、連携全店舗の `private/payCode` に同じ値が入ることを
      `shifty-prod-data-probe`（読み取り専用）で確認する（dev は Spark で CF が動かず未検証）
- [ ] 反映後、`node .claude/skills/shifty-e2e-verify/scripts/probe-rules-pay.js` と同じ20項目を本番ではなく dev で再実行して ALL_OK を確かめる
      （本番のルールは REST で叩かない。dev と同じファイルを出すことで担保する）
**影響範囲**: database.rules.json・functions/index.js・functions/company-config.js（コード変更は済み）

---

## 🟡 労務・給与と複数法人: 月次賃金（P6b）の CF 本番反映と実データ確認（全フェーズ完了後に1回）

> **✅ 2026-10-01 確認: ルール・Cloud Functions の本番反映は済んでいる。** 主セッションが本番（ontheshift）のセキュリティルールを
> ローカルの `database.rules.json` とバイト照合して完全一致（8437 bytes）、`firebase functions:list` で32関数の稼働を確認した。
> 下のチェックのうち「ルール」「CF」の反映と順序の項目は完了扱いで、**残りは実データでの確認だけ**（未チェックのまま残す）。

**目的**: P6b（2026-09-30・develop `8d0cff1`〜）は法人の賃金設定に割増率（`premiumRates`）と端数規則（`roundingRule`）を足し、
CF の `sanitizeWageSettings`（functions/company-config.js）を同じ規則に広げた。**本番に未デプロイ**。ルール・データ移行は無し。
**反映が要るもの**:
- [ ] CF: `sanitizeCompanySettings` を通る `saveEntityConfig`・`saveCompanyConfig`（P6a の CF と同じデプロイで出せば足りる）。
      CF より先にクライアントを出すと、法人の設定で割増率・端数を入れて保存しても旧 CF の sanitize で捨てられ、月次賃金は法定率・切上げで計算される
      （月次賃金ページ自体は動く）
- [ ] 反映後、本番の法人の設定で割増率を1つ入れて保存し、写し `shops/{sid}/company/settings/wageSettings/premiumRates` に入ることを
      `shifty-prod-data-probe`（読み取り専用）で確かめる
- [ ] 実データで1か月分の月次賃金を給与ソフト（または手計算）と突き合わせる（ユーザーの領分。Shifty の計算値を正解として代用しない）
- [ ] 計画書 §8「残る確認」の固定深夜手当の充当規則（深夜割増から額を引く、で実装）が運用と合っているかをユーザーに確かめる
**影響範囲**: functions/company-config.js（コード変更は済み）

---

## 🟡 労務・給与と複数法人: 所定・確定ロック（P3）のルール・CF の本番反映と実データ確認（全フェーズ完了後に1回）

> **✅ 2026-10-01 確認: ルール・Cloud Functions の本番反映は済んでいる。** 主セッションが本番（ontheshift）のセキュリティルールを
> ローカルの `database.rules.json` とバイト照合して完全一致（8437 bytes）、`firebase functions:list` で32関数の稼働を確認した。
> 下のチェックのうち「ルール」「CF」の反映と順序の項目は完了扱いで、**残りは実データでの確認だけ**（未チェックのまま残す）。

**目的**: P3（2026-09-30・develop `96458b6`〜）は本番に未反映。ユーザー指示（2026-09-30）で本番反映は P0〜P7 の完了後に1回だけ行う。
**反映が要るもの**:
- [ ] ルール（2つ・性質が違う）: ①新ノード `shops/*/laborMonths`（読み書きともオーナー）＝**ルールが先**（無いとクライアントの所定の保存・購読が拒否される）。
      ②既存パスの締め付け `shops/*/subs/$subId/.write`（期間に `confirmation` があるときはオーナーだけ）＝CLAUDE.md の順（**クライアントが先**）。
      同じファイルなので1回で出すなら、リリース直前にユーザーへ「①のためにルールを先に出す。②は旧クライアントが confirmation を書かないので先に出しても壊れない」を示して承認を取る
- [ ] CF: `companyRenameStaff`（laborMonths の移し替え）。P1・P1b・P6a の CF と同じ1回のデプロイでよい
- [ ] データ移行: なし（旧 `lockedAt` は読まない。確定で消える。旧「確定済み」の期間は未確定として表示され、必要なら「確定」を押し直す）
- [ ] 反映後、本番で11月分を1店舗だけ確定し、`laborMonths/2026-11` が書かれることと、スタッフURLからの再提出が拒否されることを確かめる
- [ ] 10月分（手運用）の所定を、10月の期間を選んで「人×月の所定」欄から遡って登録する（運用。コードの作業ではない）
**影響範囲**: database.rules.json・functions/index.js・functions/company-config.js（コード変更は済み）

---

## 🟡 労務・給与と複数法人: 店舗別ルール4件（P3.5）の CF 本番反映（全フェーズ完了後に1回）

> **✅ 2026-10-01 確認: ルール・Cloud Functions の本番反映は済んでいる。** 主セッションが本番（ontheshift）のセキュリティルールを
> ローカルの `database.rules.json` とバイト照合して完全一致（8437 bytes）、`firebase functions:list` で32関数の稼働を確認した。
> 下のチェックのうち「ルール」「CF」の反映と順序の項目は完了扱いで、**残りは実データでの確認だけ**（未チェックのまま残す）。

**目的**: P3.5（2026-09-30・develop `f97cb72`〜`a921796`）は本番に未反映。ユーザー指示（2026-09-30）で本番反映は P0〜P7 の完了後に1回だけ行う。
**反映が要るもの**:
- [ ] ルール: **変更なし**（新しい設定はすべて既存の `settings` の中・`laborSettings` の中・`staffTypeLimits` の中に入る）
- [ ] CF: `functions/company-config.js` の `sanitizeCompanySettings`（`laborSettings` の新キー4つ `showDailyOverB`・`dailyOverThresholdMin`・
      `highlightExternalOver8h`・`externalOverThresholdMin` と、属性の `otProrate`）。`saveCompanyConfig`・`saveEntityConfig` と写しを作る全関数に効く。
      **CF より先にクライアントを出すと、企業の共通設定・法人設定で「残業予定の配り方」を保存しても旧 CF の sanitize で捨てられる**
      （店舗の設定タブで入れた値は CF を通らないので効く）。P1・P1b・P3・P6a の CF と同じ1回のデプロイでよい
- [ ] データ移行: なし（設定が無い店舗は従来と同じ計算）
- [ ] 設定の投入（しきい値・B制トグル・外部の色・昼夜人数・特定技能の按分窓。中休みは 2026-10-02 に機能ごと削除）は P8-7 の運用手順で行う（コードの作業ではない）
**影響範囲**: functions/company-config.js（コード変更は済み）
- **2026-10-03 追記**: P3.5c（判定対象外の人の長時間の日のセル色）はユーザー指示で機能ごと削除した（develop `4f5d200`）。
  CF の `COMPANY_LABOR_KEYS`・`COMPANY_LABOR_RANGES` からも `highlightExternalOver8h`・`externalOverThresholdMin` を外したので、
  **次の CF デプロイからは企業・法人の設定でこの2キーを保存しても捨てられる**（クライアントにも入力欄は無い）。
  本番10店舗の `settings.laborSettings` に残る保存値はデータ移行しない（`laborSettingsOf` が読み捨てる）。上の「外部の色」の投入は不要になった

---

## 🟡 企業連携の拡張（2026-09-27 実装・本番反映済み）の実データ確認

**目的**: 企業連携の拡張（一括PDF・企業の共通設定・提出期限・提出ボタン・所属店舗）は 2026-09-27 に本番へ反映した
（ユーザー指示「デプロイまでして」）。**既存の企業には写し（`shops/{sid}/company`）がまだ無い**ので、企業設定・提出期限・
提出ボタンは、企業連携タブで「企業の共通設定を保存」か「提出期限を保存」を1回押すまで出ない（押すと CF が全店舗へ写しを作る）。
CF 本体の動作は本番の実データでは未検証（dev＝Spark には CF をデプロイできない）。

**受け入れ条件**:
- [x] `/release-to-main` でクライアント（2282f11・配信6ファイルが origin/main とバイト一致）→ ルール（dev→本番。dev で読み200・書き401を実測）
      → CF（18関数・saveCompanyConfig は create。未認証は UNAUTHENTICATED・不正IDは INVALID_ARGUMENT を実測）の順に反映した
- [ ] 反映後、企業の作成者のセッションで「企業の共通設定を保存」を1回押し、各連携店舗の `shops/{sid}/company` が書かれることを
      `shifty-prod-data-probe`（読み取り専用）で確認する
- [ ] 本番の店舗で「提出」「提出状況表」「一括PDF（シフトのみ・全データ）」を1回ずつ通す
- [x] **`changeCompanyPassword` の作成者限定（`e696d1f`・2026-09-28）を CF へ反映する** → **2026-09-29 に本番へデプロイ済み**（18関数すべて更新成功・未認証呼び出しが UNAUTHENTICATED を返すことを確認。反映前に cf-harness で企業コードのセッション拒否・作成者の変更可を実行検証）。コミット時点で CF は未デプロイ
      （計画どおり別ステップ）。反映するまで、UI はボタンを隠すが企業コードのセッションから CF を直接呼べば変更が通る。
      バグチェック#152（2026-09-28）で申し送り・条件A（本番デプロイ）に該当

**取り消し方**: develop の `feature/company-ext` の `--no-ff` マージコミットを `git revert -m 1` する。データは追加だけで既存を消していない。
**影響範囲**: app-utils.js・app-main.js・app-admin.js・functions/index.js・functions/company-config.js・database.rules.json

---

## 🟢 staffWorkplaces（旧「スタッフの勤務先店舗」）の読み取りと一覧登録の撤去

**目的**: 2026-09-27 に企業連携タブの「勤務先店舗」UI を廃止し、店舗間重複の判定を所属店舗（staffHomeShop）へ移した。
既存データを1リリースだけ `dupTargetShopsFor` の和集合で併用しているので、所属店舗の登録が済んだら撤去する。
**再着手条件**: 本番のヘルプ要員全員に staffHomeShop が入っていることを `shifty-prod-data-probe` で確認したとき。
**撤去箇所**: `dupTargetShopsFor` の和集合・`STAFF_KEYED_SETTING_MAPS`・`PERIOD_SNAPSHOT_SETTING_KEYS`・`makeSettings`（app-core.js）の4箇所と、
tests/core.test.js の旧データのテスト。

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
**現在の場所（2026-10-05 確認）**: 上の行番号は #147 時点のもので、いまは別のコードを指す。どれも app-main.js の中にあり、
Phase1 の `firebaseAuth.signInAnonymously()` の2経路（後ろが `.then(()=>proceed(null))` の側）、`const revertAdminWrite`、
エラー画面の条件 `if(initError&&(!ready||!currentShopId))` を grep で引く。
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

**影響範囲**: app-admin.js（`addShopByCode`・ドロップダウンのボタン）、app-company.js（設定タブ `SetTab` の案内文）、app-main.js（`createNewShop`・`applyInviteCode`）
**現在の場所（2026-10-05 確認）**: 上の行番号は #146 時点のもの。設定タブは 2026-09-30 に app-company.js へ移ったので、
案内文「別端末への共有は『店舗名ボタン → コードで追加』」は app-company.js にある。`addShopByCode` は app-admin.js、
`createNewShop`・`applyInviteCode` は app-main.js のまま（名前で grep する）。
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

**影響範囲**: app-shift.js（`ShiftEditTab` の他店舗読み＝`companyData` の読み込み）、app-company.js（`CompanyTab` の `allAbbrs` の先読み）、app-main.js（`claimOwnership`）
**現在の場所（2026-10-05 確認）**: 上の表の行番号は #146 時点のもの。①はシフト作成タブの分割で app-shift.js へ移った。
2026-09-30（P3.6）から読めなかった店舗には `loadFailed` の印が付き、ヘルプ先勤務の合算はそれを見て「＋」を出すが、
**`dupErrors` は `loadFailed` を見ず、読めなかった店舗をデータの無い店舗と同じに扱うので、重複0件として黙る形は変わっていない**（読み込み部のコメントも「倒す向きの判断はこのタスクのまま」と書いている）。
②は app-company.js の `.catch(()=>[s.id,[]])`、③は app-main.js の `const claimOwnership` を grep で引く。
**備考**: バグチェック#146（2026-09-25）で検出・**条件B（確認できなかったときに倒す向きの判断）に該当**。
3件をまとめたのは根が同じ（読みの失敗を良性の値に丸める）で、**倒す向きを一度決めれば3箇所に同じ規則を当てられる**ため。
**実際に失敗した形跡は見ていない**（Firebase には一切アクセスしていない）。根拠はコードの読みのみ。

---

## 🟡 `settings` / `staff` は今も「コレクション全体 set()」で、期間を1件失ったのと同じ形が2経路残っている（`templates` は 2026-09-28 に書き込みごと撤去）

**目的**: 2026-09-23 の本番事故（期間レコードが1件消えた）の根は「**古い state をそのまま全体 `set()` する**」で、
`periods` は `156a925` の差分 update() で塞いだ。**同じ根が `settings`・`staff`・`templates` に残っている。**

**コード上で確定していること**:

| | 書き込み | 古い state を持ちうるか |
|---|---|---|
| `periods` | `fbUpd`（差分・**塞いだ**） | 持つ（app-main.js:374 で localStorage から埋める） |
| `settings` | **`fbW(fbPath(sid,"settings"), v)` ＝ 全体 set()**（app-main.js:1237） | 持つ（同:373） |
| `staff` | **`fbW(fbPath(sid,"staff"), v)` ＝ 全体 set()**（同:1271） | 持つ（同:372） |
| ~~`templates`~~ | ~~**`fbSet(fbPath(targetSid,"templates"), v)`**（同:339）~~ **2026-09-28 に UI・購読・保存を撤去済み**（クライアントはもう書かない） | — |

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

**影響範囲**: app-main.js（`saveSettings` / `saveStaff`）、app-utils.js（差分関数の追加）、
tests/core.test.js、RULES.md
**現在の場所（2026-10-05 確認）**: 表の行番号は #142 時点のもの。`const saveSettings` と `const saveStaff` を app-main.js で grep すると、
どちらもいまも `fbW(fbPath(sid,"settings"|"staff"), …)` で全体を set() している。localStorage から state を埋める処理は
`startSubscriptions` の中の `lg(storeKey(targetSid,…_v6))` の並び。`saveShopTemplates` は撤去されてもう無い。
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
> **2026-09-28 のユーザー指示で一部を改めた**: 人数が多いときだけ列を横幅いっぱいに合わせる
> （横幅いっぱいに割った列幅が48px＝39×1.25 以下になる人数から。1400px 幅なら26名以上）。
> 人数が少ないときは下の 39px 上限のまま、1ヶ月（17日以上）の期間は従来どおり。縦は人数に関係なく常に
> 高さいっぱいで余りが無いので、「拡大」は列幅だけで行高・文字は広げない。列が39pxより細いときは文字も比例して小さくする。
> 規則は app-utils.js の `fullViewColW` / `fullViewFontOf`。回帰は `example-fitall-geometry.js`（10水準）。
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
app-shift.js（緑セル描画 `LEGEND_COLORS.changed`・`toggleChanged`・`buildShiftTableHtml` の `chgBg`）、app-admin.js（`expXl`）
（2026-10-05 確認: シフト作成タブ一式は 2026-09-30 に app-admin.js から app-shift.js へ移った。本文の行番号は #138・#143 時点のもので、名前で grep する）
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

**影響範囲**: app-company.js（設定タブ `SetTab` の `deleteType`）、app-admin.js（候補タブ `CandTab` の休憩時間設定の `attrName`・`toggleTag`／チップ表示）、app-utils.js（掃除を純粋関数に切り出す場合）
（2026-10-05 確認: 設定タブは 2026-09-30 に app-company.js へ移った。本文の行番号は #137 時点のもので、名前で grep する）
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

> **✅ 2026-09-26 案Cで実装済み（`44e7561`）／残りは dev 実機E2Eのみ**
> ユーザー判断は **案C**（保存は通し、`dupErrors` と同じくセル色付け＋エラーパネル）で確定。
> 判定を `isTimeOrderInvalid`（app-utils.js）に切り出し、**両側とも入力されている日だけ**を対象にした
> （片側セルは補完の領分なので対象外・24時超え表記の 25:00・26:00 は影響を受けない）。
> 入口2つ（シフト作成タブの `applyEditToSubs`・提出一覧の `saveAdj`）の**両方**から同じ関数を通す。
> シフト作成タブにはセル色（`CELL_COLOR_LEGEND` の `timeErr`）と「⚠ 時刻の入力ミス」パネルが出る。
> **データの扱いは1バイトも変えていない**（`effShiftRangeMin` が null を返すことも実働0のままも変えない）。
>
> 検証: ユニットテスト（`isTimeOrderInvalid` の境界・24時超え表記の非回帰）、
> ドリフト検出テスト（両経路が同じ関数を通ることを走査。対照3種で落ちることを確認済み）、
> 実ブラウザ（`example-labor-phase1.js` 17項目 allPass・コンソールエラー0件）、
> 既存回帰 `example-shift-edit-tab.js` allPass。
> dev 実機E2E（検証手順4）も 2026-09-26 に実施済み。標準テスト店舗（8月前半・`?plan=premium`）で
> セル編集→保存→表示を踏み、Firebase に `adjustedStart/adjustedEnd` が書かれること（既存subを再利用し
> 新規作成していないこと）、トースト・エラーパネル・セル色が出ること、Excel（10,721 bytes）と PDF の
> 出力が通ることを確認した。pageerror・console error ともに0件。**この検証でセル色の不具合を1件見つけて
> 直した**（ポジション不足の黄色が入力ミス色を上書きしていた・`a67b27b`）。触ったデータは元に戻してある。

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
（2026-10-05 確認: 本文の行番号は #108・#146 時点のもので、いまは別のコードを指す。`exports.cancelPlanChange` と、app-admin.js の
`const changeOptions`・トースト「✓ プラン変更の予約を取り消しました」を grep で引く。`r.ok` だけを見て `released` を読まない形はいまも同じ）
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
（2026-10-05 確認: この追記の app-admin.js の行番号は #128 時点のもの。いまは MyPageTab の「をもって終了します」の文言と
`bs.scheduledPlan!==plan` の条件を grep で引く）

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
**影響範囲**: functions/index.js（`unlinkStoreFromCompany`・`linkStoreToCompany`・`createCompany`）、app-company.js（CompanyTab の解除UI・エラー表示。2026-09-30 に app-admin.js から移った）
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

### ⏸️ シフトひな型（2026-10版）にあって Shifty に入れない3機能 — 見送り（2026-10-01 判断）

出典は `シフトひな型2026-10版_取り込みと差分_実装計画.html` 第3部 F7（ユーザーが判断 D1〜D12 を「全部推奨で」と決定）。
同じ計画のうち F4（上限と「所定未満」を所定基準に）と F6（入力の確認）は実装済みで、ここに書く3件だけを入れない。

**① 前半の見込み判定**（ひな型: 後半が空の間は「前半実働 × 月の日数 ÷ 15」で所定・上限を見込む）
- 理由: 2026-09-26 に「月が埋まっていない間は `＋` を付けた実数を出す。見込みは出さない」と決めている
  （CLAUDE.md「月が埋まっていないときも実数を出す」）。見込みを足すと同じ月について数字が2つになり、どちらで判断するかがぶれる。
- 再着手条件: ユーザーが「＋」の実数より見込みの値を求めたとき。

**② 人ごとの休憩の個別設定**（ひな型: 前半シートの60〜63行に人ごとの休憩を書ける）
- 理由: 2026-10-01 に届いた xlsm 13本はすべてこの欄が空欄で、使われていない。日別の上書き（`adjustedBreak`）と
  店舗の規則（P3.5a の長さ方式。中休みは 2026-10-02 に削除）で、いまの運用は表せる。
- 再着手条件: xlsm の60〜63行に値が入り始めたとき。

**③ 確認時刻方式の人数チェック**（ひな型: 確認時刻（12時・19時）に担当別（ホール・キッチン）の人数が不足・多すぎを判定する）
- 理由: xlsm の担当欄が入っているのは3店舗（計7名）、必要人数は2店舗だけで、ひな型でも大半の店で動いていない。
  Shifty には必要ポジション（`matchPositionSlots`）と PDF の昼夜人数（`headcountAt`）が既にある（判断 D12）。
- 再着手条件: 担当（ホール・キッチン・両方）と必要人数が3店舗以上で運用に使われたとき。

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

### ✅ 2026-10-05 の本番リリース（版数 20261005-d54059e ほか）と、そのあとの修正

- **リリース済み**: マイシフトのアドレスバー（開き直せる URL）と設定の一番下の個別URL、ヘルプ勤務の表示と給料計算（ヘルプ先の日の実績入力を含む）、URLをなくしたとき用のメールアドレス（CF `setPageEmail`・`recoverPageUrl`、ルール3行＝CF 専用ノード）。ルールは dev→本番、CF は40本（新規2本）
- **Opus のエージェントが利用上限で2回停止**したため、残り（回帰2本の修正・個別URLを設定の最下部へ並べ替え・検証・リリース）は主セッションが行った
- **個人リンクコードの発行を画面から削除**（ユーザー指示）。本人側の入力欄も外した。CF は残置。`example-my-link.js` は発行と引き換えを CF 直接呼び出しで確かめる形に直した
- **メール登録の画面の回帰** `example-my-page-email.js` を追加（登録→控え1通・伏せ表示・CF 専用の置き場・「なくした場合」の統一文言・削除）。`9251272` の配信物では EXIT=2
- **未検証**: 本番での控えのメール・送り直しのメールの実送信。Firebase Auth の確認メールは迷惑メールに入る（カスタムドメインの DNS 4件が未設定）


### ✅ 🟡 スタッフ画面の追加指示 A・B・D・E'・C（2026-10-04 develop 完了／ルール・CF の変更なし・本番未反映）

- **A 全員のシフト表に他店でのヘルプ勤務**（`828875d`）: PDF と同じ規則・同じ関数。他店は表示中の期間にかかる期間の subs だけを部分読み。回帰 `example-my-sheet-pdf.js`（helperSamePdf・helperReadScope）
- **B スタッフの実績の上書きは給料計算だけ**（`7801432`）: シフトの表示（カレンダー・詳細・次のシフト・.ics・Google カレンダー）は公開内容のまま。給料の内訳に実績で計算した日の注記。回帰 `example-my-manual.js` の C・D
- **D 休暇を PDF・全員の表・Excel でも種別名**（`a794735`＋`f6a0804`）: 4か所が `leaveShownTextOf` を通る。Excel は2つの入口とも。回帰 `example-excel-missing-day.js`・`example-my-sheet-pdf.js`
- **E' 管理者がスタッフ専用のURLを直接発行**（`a47183e`）: 承認済みの個別URLを申請なしで作る・再発行（確認つき）・取り消し。ルール・CF の変更なし。回帰 `example-staff-page-issue.js`。
  当初の E（匿名 uid で個人リンクコードを引き換える CF）はユーザーの方針変更で取りやめ（着手前）
- **C メール確認つきの新規登録**（`dd06a46`）: 上の🟡（コンソールの設定）が残る。回帰 `example-email-link.js`
- 経緯: Stop フックが C の作業途中の app-main.js・app-company.js を `1c43f62` として自動コミット・push したため、develop が起動時に壊れる状態になった。
  `d70aef5` で revert し（履歴は書き換えていない）、C は E' のあとに改めて `dd06a46` で入れた

### ✅ 🟡 本番のスタッフ画面を実機で見たうえでの修正7件・これまでの給料の一括入力・アカウント作成のフォールバックの回帰（2026-10-04 develop 完了／ルール・CF の変更なし・本番未反映）

ユーザー指示（2026-10-04・実機 iPhone で本番のスタッフ画面を見たうえで）。設計は CLAUDE.md の従業員画面の各節。
- [x] (1 `c283723`・`9aa8370`) 全員のシフトを **PDF の「シフト表」と同じ仕様**に。PDF の表の組み立て（`buildShiftTableHtml` の本体）とヒートマップの1人1日の区間（heatData）を
      app-utils.js の `shiftTableHtmlOf` 以下へ移し、従業員画面（`buildMyShiftSheet`）も同じ関数を通す。画面は比率を保って横幅に合わせる（`transform: scale`）。
      PDF と違うのは他店でのヘルプ勤務（H2・他店の提出を読まないと作れない）を出さないことと、本人の列の見出しの印だけ。
      検証: PDF の HTML（シフトのみ・35人超・全データ）が共有化の前とバイト一致、perf の画面と保存の指紋が一致、`example-my-sheet-pdf.js`（PDF 出力の table と同じ HTML・
      375/390/320px・ダーク表示でも白地・WebKit iPhone 13。a10c1e3 の配信物では EXIT=2）
- [x] (2 `dad1da7`) 「細かいところは2本の指で拡大して見てください」を削除
- [x] (3 `c545e5d`) 「TimeTree などのアプリで見るには」をマイシフトの一番下へ（書き出しのボタンの位置は変えない）。`example-my-manual.js` の D_icsAppGuide（直前の配信物では落ちる）
- [x] (4 `142607a`) 開始・終了・休憩を15分刻みのプルダウンだけに（自由記入の欄を削除）。0:00〜30:00・休憩0〜180分。15分刻みでない以前の値は選択肢に足して保持。
      `example-my-manual.js` の B_selectOnly15・I_keepsOffStepValues（直前の配信物では落ちる）
- [x] (5 `27bb650`) 給料タブは月間目標が無くても合計・確定分・見込みを大きく出し、円グラフは目標を設定したときだけ。時給が未設定の勤務先は名前と「設定で時給を入れる」。
      `example-my-pay.js` の B_noGoalShowsAmounts・B_noWageGuide・E_goal（直前の配信物では落ちる）、`example-my-page.js` の PN_noGoalStillShowsPay
- [x] (6 `1243e19`) 設定タブの勤務先の名前の横に、その店舗での従業員番号（`settings.staffNumbers[紐付いた名前]`）。アカウントの番号の入力欄に照合用である旨の説明。
      `example-my-manual.js` の A_staffNumberPerShop（直前の配信物では落ちる）、`example-my-page.js` の PN_wpStaffNumber
- [x] (7 `bb611f3`) スタッフURLの「マイシフト」をオレンジのヘッダーの下・締切日の帯の上に横幅いっぱいで（「提出状況」はヘッダーの中のまま）。
      `example-my-account.js` の H（375・390px で「2026年10月後半」が省略されない。直前の配信物では省略されて落ちる）。Chromium と WebKit
- [x] (8 `7e9315f`・追加指示) 給料タブの年の表示から、これまでの給料（振込額）を支給月×勤務先でまとめて入力（引き継ぎ用）。置き場は既存の振込額・保存は変えたセルだけ。
      `example-my-pay.js` の N（375・320px・変えたセルだけの update・年の表と合計・再度開くと初期表示）と F_noBulk（直前の配信物では落ちる）
- [x] (`0e22bb5`) スタブ Firebase に `authSeed.linkBlocked`（連結が `auth/operation-not-allowed`）を足し、`example-my-account.js` の L で「拒否 → 新しいアカウントとして作成」を固定
      （4163394 より前の配信物では「アカウントの作成に失敗しました」で落ちる）
- 置いた前提: 全員のシフトの休暇は PDF と同じく斜線（以前の画面は種別名を出していた）・退勤延長は足さない（PDF は保存された時刻）・従業員番号の行と未登録の提出者の列を出す。
  再着手条件: スタッフに休暇の種別名を見せたい・他店でのヘルプ勤務も出したい、と言われたとき（後者は他店の提出の読み込みが要る）
- 未検証: 実機の iPhone での見え方（縮めた表のピンチ拡大・ボタンの位置）。下の「実機の iPhone で確かめること」と同じ回で見る

**2026-10-04 の本番リリース3回（記録）**: `ff384fd`（18:14・版数 20261004-7a32870。保存ボタンの表記・Excel の名前行・シフト作成タブの高速化 S1〜S3・ヘルプ勤務の表示 H2・
tokens の重複書き込み・320px のはみ出し）→ `048a52b`（18:51・20261004-dff85c4。従業員画面を本番に公開＝`MY_SCREEN_ENABLED = true`）→
`a10c1e3`（19:30・20261004-4163394。アカウント作成が列挙保護で失敗するのを直す）。

### ✅ 🟡 全員のシフトの期間のプルダウン・#/me の全員のシフト・TimeTree 等の案内・バグチェックの定型走査の対象（2026-10-04 develop 完了／ルール・CF の変更なし）

ユーザー指示（2026-10-04）の5件。設計は CLAUDE.md「スタッフ個別URL」の節と計画書の末尾の「追記2」。
- [x] (1 `954e05d`) 全員のシフトは未公開の案内を出さず、公開済みの最新を既定に。期間のプルダウン（公開済みかつ直近3ヶ月＝`subsWindowCutoff`）。選べる期間が無ければ切り替えごと出さない。
      `example-my-page.js` の AL0・AL（最新が未公開でも1つ前の公開済み・選択肢は今月と先月だけ・先月を選ぶと先月の表・375/320px）。89a455c の配信物で EXIT=2
- [x] (2 `c77319c`) #/me でも全員のシフト（有効な紐付けの全店舗・店舗のプルダウン・既定は募集URLの店舗か公開済みの最新が新しい店舗・選んだ期間だけの部分読み）。
      旧「🟢 アカウント（#/me）側の全員のシフト表示（見送り）」はこれで完了。`example-my-shift.js` の AM。89a455c の配信物で EXIT=1
- [x] (3 `331b5a6`) .ics の書き出しの下に「TimeTree などのアプリで見るには」（TimeTree の公式ヘルプで確かめた事実だけ・端末ごとの3手順）。実機の確認は上の「次の本番リリースで…」の .ics の⑤
- [x] (4) スケジュールタスク `shifty-bug-check`（リポジトリ外）の PHASE 2〜4 を削除済みの `app.js` から外し、検査は `~/.claude/commands/bug-check.md` の PHASE 2 を正本として参照する形にした
      （二重管理をやめた）。CLAUDE.md の申し送り「スケジュールタスクの PHASE 2〜4 の grep はいまも削除済みの app.js を対象にしている（19回目）」は**解消した**。
      あわせて bug-check.md の 2-E の期待値2件（global/shops の一覧の ref・`".read": true` はどちらも0件が正常）と、ugrep で通らない後方参照を直した
- [x] (5 `64483cd`) app-core.js の `AUTH_LOGGED_OUT_LS` のコメント（と app-main.js の Phase1 のコメント）を実装に合わせた（立てるのは doFullSignOut だけ）
- 検証: npm test・eslint（0 errors）・E2E の全回帰・WebKit iPhone 13（下の報告の数値）
- **未検証**: iPhone の実機での select・TimeTree の実機（上の🔴の一覧に足した）

### ✅ 🟡 スタッフ個別URL（登録・承認・個別URLでの閲覧と提出・全員のシフト表・給料の暗証番号）（2026-10-04 develop 完了／ルールは追加だけ・CF は新規1本＋更新1本・どちらも未デプロイ）

**目的**: ユーザーの仕様変更（2026-10-04）。募集URLから申請 → 管理者が承認 → 個別URL（`#/m/<pageToken>`）でどの端末でも同じスタッフの画面（ログイン不要）。
決定: アカウントと併用・給料は4桁の暗証番号・登録は管理者が承認・全員の表は公開済みだけ。設計は CLAUDE.md「スタッフ個別URL」と計画書の末尾の追記。
- [x] (P1 `ed584af`) 申請 → その場で個別URL（コピー・共有）と承認待ち／承認前は承認待ちの画面／スタッフタブで名前を選んで承認・却下・取り消し／別の端末（別の匿名 uid）で同じ画面
- [x] (P1) 改名・削除・同名の再登録に追随（保留の列に同じ入口）。読む側は承認済みで名前がスタッフ一覧にあるときだけ
- [x] (P2 `ed584af`) 最新期間への提出（名前は固定・subs の staffName が承認された名前・既存の提出は同じ sub を更新）／確定済みは提出できない
- [x] (P3 `15eec71`) 横スワイプとタップの切り替え・公開済みだけの全員の表・375px と 320px で横スクロール0（10人×16日 11.2px、30人×31日 3.3px／2.6px）・ピンチ拡大中は横スクロールを止める
- [x] (P4 `c37063e`) 暗証番号（初回・変更・5回で15分・管理者のリセット）・会社が登録した賃金は CF が照合してから返す
- [x] ルールは追加だけ（4ノード）・デプロイしない／`MY_SCREEN_ENABLED` の下（本番相当では入口も #/m/ も動かない）／375px・320px・入力欄16px以上／WebKit iPhone 13
- 検証: npm test・eslint・`shifty-e2e-verify/scripts/example-my-page.js`（Chromium と WebKit iPhone 13 で allPass）・`shifty-cf-verify/scripts/example-my-page.js`（30項目）
- **未検証**: ルールと CF の実機・iPhone の指のスワイプとピンチ（上の🔴の一覧と🟡の本番反映に足した）

### ✅ 🟡 従業員画面 E6: 会社設定の賃金の参照（getMyPay）と「会社設定」表示（2026-10-04 develop 完了 `2f52b75`／CF は未デプロイ・ルールの変更なし）

`Shifty_実装計画_2026-10.md` 第2部 E.4・E.6 の E6（確認したい点5番）。設計は CLAUDE.md「給料（E5）と会社設定の賃金（E6）」の節。
- [x] CF `getMyPay`: `{shopId}` だけを受け取り、呼び出し元 uid の staffLinks の名前の `private/pay` だけを返す（名前・uid は受け取らない）。
      紐付けなし・匿名・名前がスタッフ一覧に無い・shopId の形・デモ店舗は拒否。何も書かない。`shifty-cf-verify/example-my-pay.js` 15項目（E6 前の index.js では13項目が落ちる）
- [x] 判定は `functions/my-pay.js`（版の形は `normalizePayVersion` と同じ＝乱数400件で照合）。テスト4件
- [x] 勤務先の編集で「会社設定」の固定表示・時給と交通費の入力欄なし・給料タブは会社設定の版で計算（`example-my-pay.js` の J）。CF 失敗で本人の設定にフォールバックし理由を出す（K）
- [x] ヘルプ先だけの紐付け: 紐付いた店舗に記録が無く所属店舗が別なら「所属店舗（◯◯）で設定されています」と出して本人の設定で計算（L）。所属店舗の賃金を他の店舗の紐付けからは返さない
- 未検証: CF の実機（未デプロイ。本番反映のタスクに getMyPay の実測を足した）

### ✅ 🟡 従業員画面 E5: 給料設定・支給月の振り分け・給料タブ（月・内訳・年）・月間目標と振込額（2026-10-04 develop 完了 `f040353`／ルールは追加だけ・未反映）

**本番反映のとき**: 実機での確認は「🔴 次の本番リリースでユーザーと突き合わせる実機確認」（実装待ちタスクの先頭）の一覧で行う。

`Shifty_実装計画_2026-10.md` 第2部 E.2・E.4・E.5・E.6 の E5。設計は CLAUDE.md「給料（E5）と会社設定の賃金（E6）」の節。
- [x] 給料設定 `users/{uid}/workplaces/{id}/pay`（締日・給料日と当月／翌月／翌々月・土日祝の前倒し後ろ倒し・時給／日給・交通費、手入力は深夜25%・8h超25%）。ルールで形を検証（`example-my-pay.js` の A・テスト）
- [x] 月間目標 `users/{uid}/goals`・振込額 `users/{uid}/actuals/{支給月}/{勤務先}`（E・C）
- [x] 支給月の振り分け（月末・15日・20日・30日締め・翌月払い・土日祝・祝日・年またぎ・うるう年2月）（テスト）
- [x] Shifty の店舗は既存の関数だけで計算し、**月末締めで monthlyPayBreakdown と同じ金額**（時給者・月給者 × 率と端数あり／なし・法定休日・時間外・深夜が出る入力でテスト）
- [x] 確定分（今日まで）と見込み・未公開を含めない・上書きが入る（B・テスト）。手入力の簡易計算（テスト・B）
- [x] 給料タブ: 月（円グラフ・合計・確定分・見込み・勤務時間・勤務先別・内訳・振込額）・年（支給月ごとと年間合計）・20日締めの「目安」（B・C・D・I）
- [x] Premium でないときは閲覧のみ（F）・ルール未反映で落ちない（G）・店舗のデータへの書き込み0件（M・テストで書き込み先を固定）・375px で横はみ出し無し・入力欄16px以上（A・B・D）
- 検証: `npm test` 603件パス（587→603。E5 の12件と E6 の4件。E5 の12件と書き込み先を広げた2件は E5 前のソースで落ちる）・`npx eslint app-*.js` 0 errors / 152 warnings
  （144→152 は app-my.js の新しい部品8つの未使用判定＝既存の部品と同じ扱い）。`example-my-pay.js` 36項目パス（E5 前の配信物では非0・E6 の J〜L は E5 の配信物で落ちる）。
  回帰スクリプト67本（新規1本を含む）と cf-verify 4本すべて EXIT=0。フォーム部品158件で fontSize 16未満は0件。kill-ai-slop の走査で app-my.js に検出なし
- 置いた前提: ①月給者の基本給・手当・月額の交通費は締め期間が終わるまで「見込み」に入れ、日割りしない（月次賃金と同じ）。②締日・給料日が未設定なら月末締め・翌月25日・前倒し。
  ③日給は割増を含めない（Shifty の店舗でも）。④ヘルプ先の勤務を所属店舗の給料に合算しない（店舗ごとに別の勤務先）。⑤月間目標の弧は確定分の割合（見込みを含む割合ではない）。
  ⑥土日祝の判定は app-utils.js の祝日テーブル（2029年まで）
- 未検証: ルールの実機（未デプロイ）・実際の給与明細との突き合わせ

### ✅ 🟢 マイシフト: カレンダーへ取り込む前の確認（2026-10-04 develop 完了／ルール・CF なし）

ユーザー指示「カレンダー同期の際、ホーム画面にブックマークを保存する必要がある、ないしはその他操作が必要ならその操作を促すポップアップを表示する」。
設計は CLAUDE.md「カレンダーへ取り込む前の確認」の項目。
- [x] **ホーム画面への追加は不要**（iOS 27 のシミュレーターで、Safari のタブとホーム画面から開いた状態の両方で a[download]＋blob の .ics が「カレンダーに追加」の画面を出し、閉じると戻る）。促さない
- [x] 出す条件は純粋関数 `myCalendarPromptOf`（app-my-utils.js）。アプリの中のブラウザ（LINE・Instagram・Facebook・TikTok・Android の WebView・iOS の WKWebView）は必須、
      iOS の Safari 以外のブラウザと Android の Chrome・PC は任意（「次から表示しない」を localStorage に覚える）、iOS の Safari は出さない（tests/my.test.js・UA 17種）
- [x] LINE は「Safariで開く／Chromeで開く」（openExternalBrowser=1・ハッシュを保つ）、ほかは「URL をコピー」（コピーできなければ URL の欄）。Google カレンダーに追加のリンクもアプリの中だけ確認を出す
- [x] モーダル: role=dialog・Esc と背景で閉じる・開くとフォーカスが移る・375px と 320px ではみ出し無し・入力欄16px（`example-my-cal-prompt.js`・Chromium と WebKit の iPhone 13）
- [x] 確認で手順を見せたときは書き出した後の案内を重ねない。ホーム画面から開いた iOS は案内に「出ないときは Safari で開く」の1文
- 検証: `npm test` 625件パス（+1）・`npx eslint app-*.js` 0 errors / 168 warnings（増えた1件は新しいコンポーネントの未使用判定＝既存と同じ扱い）・
  `example-my-cal-prompt.js` 37項目（95fc029 の配信物では21項目が落ちる）・`example-my-manual.js` は PC の確認を通すように直した
- 未検証: LINE・Instagram 等のアプリの中のブラウザの実機（シミュレーターに無い）・LINE の中から openExternalBrowser=1 へ移ったときに外へ出るか・iOS 26 以前のホーム画面のアプリ・
  Android の実機・iOS の Chrome の挙動（任意の確認にとどめた）。上の「🔴 次の本番リリースでユーザーと突き合わせる実機確認」の ⑥ に足した

### ✅ 🟡 従業員画面 E4: 手入力の勤務先とシフト・履歴から追加・実績の上書き・.ics（2026-10-04 develop 完了／ルールは追加だけ・未反映・CF なし）

**本番反映のとき**: 実機での確認は「🔴 次の本番リリースでユーザーと突き合わせる実機確認」（実装待ちタスクの先頭）の一覧で行う。

`Shifty_実装計画_2026-10.md` 第2部 E.2・E.4・E.6 の E4。設計は CLAUDE.md「手入力の勤務先とシフト・実績の上書き・.ics」の節。
- [x] 設定タブの「勤務先」: Shifty の店舗と手入力の勤務先の一覧・追加（名前・プリセットの色）・編集・削除（シフトの件数を示して確認し、一緒に消す）。`example-my-manual.js` の A・H
- [x] 手入力のシフトの追加・編集・削除（直接入力と5分刻みの選択・24時超えの案内と「26:00 にする」）。掛け持ちの分が同じカレンダーに出る・次のシフトに入る（B）
- [x] 履歴から追加（同じ勤務先の過去の時間帯をワンタップで選んだ日に）（B）
- [x] 実績の上書き（公開済みのシフトに開始・終了・休憩）。表示は「実績」と公開の時間の併記・「変更あり」は付かない・開き直しても同じ・公開の時間に戻せる（C）。
      給料計算に渡す1日の勤務（`myPayWorkDays`）に上書きが入ることはテスト（E5 の画面はまだ無い）
- [x] .ics（表示中の月の公開済み＋手入力・グレーは入れない・TZID・24時超えは翌日・締は別イベント・CRLF・折り返し・エスケープ・UID 固定）（D・テスト）
- [x] Premium でないときは追加・編集・.ics を止め、入れたデータは表示・削除はできる（F）。ルール未反映で書き込みが拒否されても落ちず理由を出す（G）
- [x] 店舗のデータへの書き込み0件（E・テストで書き込み先を固定）。375px で横はみ出し無し・入力欄16px以上（A・B・C）
- 検証: `npm test` 587件パス（576→587。新しい11件と、E3 の書き込み先の検査を広げた1件の計12件は E4 前のソースでは落ちる）・`npx eslint app-*.js` 0 errors / 144 warnings
  （136→144 は app-my.js の新しい部品8つの未使用判定＝既存の部品と同じ扱い）。`example-my-manual.js` 31項目パス（E4 前の配信物では最初の項目で止まる）。
  回帰スクリプト66本すべて EXIT=0。kill-ai-slop の走査で app-my.js に検出なし
- 置いた前提: ①終了が開始より前の入力は翌日扱いに自動で直さず、24時超え表記を案内する。②手入力の勤務先を消すとそのシフトも消す。③リンクが外れた店舗の勤務先の記録は残す
  （給料設定を消さない）。④Premium でないときも削除（手入力のシフト・上書き・勤務先）はできる。⑤.ics は VTIMEZONE 同梱の TZID 形式。⑥手入力のシフトは手入力の勤務先にだけ入る
- 未検証: ルールの実機（未デプロイ。E1 の「ルールの dev 反映」タスクに REST の項目を足した）・iOS と Google カレンダーへの .ics の実際の取り込み・
  公開シフトが消えた日に残った上書きの掃除（画面に出ないまま残る＝給料計算にも入らない）

### ✅ 🟡 従業員画面 E3: シフト作成タブの「公開」ボタンとマイシフト（2026-10-04 develop 完了／ルールは追加だけ・未反映・CF なし）

`Shifty_実装計画_2026-10.md` 第2部 E.1・E.2・E.5・E.6 の E3。設計は CLAUDE.md「マイシフトと『公開』ボタン」の節。旧「🟢 シフト作成タブの『公開』ボタン」（2026-09-27 の D10）はここに統合した。
- [x] シフト作成タブの「公開」「公開を取り下げる」（`period.published={at,byUid}` を差分 update・履歴に publish／unpublish）。`example-my-shift.js` の B・D
- [x] 確定を押すと未公開なら同時に公開（`planPeriodConfirmation`＝シフト作成タブと企業の提出状況表の両方）。解除では外さない（E・テスト）
- [x] マイシフト: 月のカレンダー（日曜はじまり）・勤務先の色のドット・日付の詳細・未公開はグレー・公開済みは `scheduledDay` を黒・確定の表示・希望との違い・次のシフト（A・C・E）
- [x] 変更あり: 本人の公開内容の指紋を `users/{uid}/seen` と比べる。初回は付けない・他人の変更では付かない・「確認した」で消える（C・F・G）
- [x] 2店舗に紐付いた人のカレンダーに両方出る（A・C）。紐付けが無効（改名・削除後）の店舗は出さず理由を出す（H）
- [x] プラン: `featureEnabled("myShift")`・紐付いた店舗のいずれかが Premium（I）。Pro の店舗のオーナーには公開ボタンが出ない
- [x] 閲覧専用の端末（J）・本番相当 `MY_SCREEN_ENABLED=false`（K）に公開ボタンとマイシフトの入口が出ない。非表示マウントは条件 `!exportJob`・`savePeriods`（テストで固定）
- [x] 375px で横はみ出し無し・入力欄16px以上（A）
- 検証: `npm test` 576件パス（562→576・新しい14件は E3 前のソースではすべて落ちる）・`npx eslint app-*.js` 0 errors / 136 warnings（135→136 は
  app-my.js の新しい部品 `MyShiftEntryRow` の未使用判定。同じファイルの既存の部品と同じ扱い）。`example-my-shift.js` 41項目パス（E3 前の配信物では17項目が落ちる）。
  回帰スクリプト65本すべて EXIT=0（`example-labor-confirm.js` は確定で公開の履歴が1件増える分の期待値を直した）。`perf-shift-edit-tab.js` allPass（選択・入力で労務判定0回）
- 置いた前提: ①Premium の境目は「紐付け・提出のグレー表示は無料、公開済みの黒文字以降が Premium」。②「変更あり」は日ごとの指紋で判定し、初めて見る公開は付けない。
  消すのは「確認した」ボタン（日付を開いただけでは消さない）。③公開の取り下げは確定済みの期間でもできる（取り下げると確定していてもグレーに戻る）
- 未検証: `users/$uid/seen` のルールの実機（未デプロイ）。E1 の「ルールの dev 反映」タスクに足した

### ✅ 🟡 従業員画面 E2: 紐付け（申請・番号と名前の提案・承認・個人リンクコード・解除）（2026-10-04 develop 完了／ルール・CF は未反映）

`Shifty_実装計画_2026-10.md` 第2部 E.3・E.4・E.6 の E2。設計は CLAUDE.md「従業員画面…のアカウント」の「紐付け」の節。
- [x] A（従業員番号・数字だけの完全一致・全角は半角に・先頭のゼロは区別・企業連携は数字の人物IDも）と B（空白を除いた一致）は提案だけで、承認で紐付く（スタブの実ブラウザ・cf-harness）
- [x] C（8桁・24時間・1回限り・本人単位で5回失敗すると15分止める）は承認なしで紐付く。24時間ちょうどで使えない（テスト）・期限切れは使えない（実ブラウザ・cf-harness）
- [x] 数字以外の番号（A-01）では A の提案が出ない／空白違いの名前で B の提案が出る／候補が2つの申請は2つ並ぶ／どちらにも当たらない申請は「未リンクの申請」（実ブラウザ）
- [x] 却下・解除（本人とオーナー）。取られた名前は押せず CF も拒否。店舗のオーナーの uid は紐付けない
- [x] 改名・削除・統合への追随: 改名と削除はオーナーの端末から staffLinks を直接書く（ルールで削除と name の書き換えだけ許す）。削除は名前を残す期間を選んでも外す。
      追加で同じ名前に残った古い紐付けを外す。CF の改名と人物の変更も追随。読む側は staffLinks の名前を正とし、無い・一覧に無い紐付けを使わない（実ブラウザ・テスト）
- [x] 管理者側の UI は `MY_SCREEN_ENABLED` の下・オーナーの端末だけ（閲覧専用と本番相当で出ないことを実測。本番相当は購読もしない）
- 検証: `npm test` 562件パス（+19）・`npx eslint app-*.js` 0 errors / 135 warnings（増えた3件は新しいコンポーネントの未使用判定＝既存と同じ扱い）・
  `example-my-link.js` 32項目（375px で横はみ出し0・入力欄16px）・`example-staff-link.js`（cf-harness）44項目。どちらも E2 前の版では落ちる。回帰スクリプトの結果は報告に記載
- 置いた前提: `#/me` で開いたとき（shopId なし）は申請を出さず、URL から開く案内とコードの入力だけ。コードの試行回数は記録ではなく本人単位（計画書の `attempts` は持たない）。
  紐付けにプランの判定はしていない（Premium の判定は E3）。残る穴は CLAUDE.md の節に書いた（購読前の端末での同名の登録し直し）

### ✅ 🟡 従業員画面 E1: アカウント（連結・ログイン・再設定）と入口（2026-10-04 develop 完了／ルールは追加だけ・未反映・CF なし）

`Shifty_実装計画_2026-10.md` 第2部 E.3・E.6 の E1。設計は CLAUDE.md「従業員画面（マイシフト・給料）のアカウント」の節。
- [x] 登録（`linkWithCredential`）で uid が変わらず、`users/{uid}/profile`（登録ネーム・番号は全角を半角に）が書かれる（スタブで実測）
- [x] 別の端末でログインして同じ uid・同じ登録ネーム。誤ったパスワード（残り回数つき・名前空間 "staff"）・使用済みのメール・確認用パスワード違いにエラー
- [x] パスワード再設定メール・パスワード変更（現在のパスワードの照合あり）・ログアウト（匿名の新しい uid に戻り、また提出できる）
- [x] アカウントなしでも従来どおり提出できる。管理者ログイン画面のメールログインと試行ロック（"email"）は変わらない
- [x] `users/$uid` のルールを追加（13行の追加だけ・既存の行の変更0）。**反映と REST 実測は未検証**（上の🟡に残した）
- [x] 入口: スタッフURLの画面の「マイシフト」（`MY_SCREEN_ENABLED = DEV_MODE` のときだけ・本番相当で出ないことを実測）と `#/me`。下部タブ「マイシフト」「給料」「設定」
      （マイシフト・給料は E3・E5 が埋めるまで説明文だけ。使えないボタンは置いていない）
- 管理者の端末（管理キーを持つ・owners に載っている匿名 uid）では作らせない。管理者のメールアカウントでのマイシフトのログインは断る。
  スタッフアカウントの uid は `claimOwnership` が owners に登録せず、ログイン画面の店舗参加・作成も止める
- 検証: `npm test` 543件パス・`npx eslint app-*.js` 0 errors / 132 warnings（増えた13件は新しいコンポーネントとファイルをまたぐ識別子の未使用判定＝既存と同じ扱い）・
  `example-my-account.js` 7場面24項目パス（375px・横はみ出し0・入力欄16px）。E1 より前の配信物では最初の項目で落ちる。回帰スクリプト63本すべて EXIT=0

### ✅ 🟡 従業員画面 E0: 土台（VISION の追記・ファイルの追加）（2026-10-04 develop 完了／ルール・CF・データ移行なし）

`Shifty_実装計画_2026-10.md` 第2部 E0。
- [x] VISION.md の原則1に「アカウントは任意。提出には不要」を追記した
- [x] 新しいファイル `app-my-utils.js`（プレーン・純粋関数・module.exports ガード）と `app-my.js`（babel・画面）を足した。
      index.html の読み込み順は utils → my-utils → core → staff → admin → shift → company → my → main。`?v=` は既存と同じ `20261003-f053304`（バンプしていない）
- [x] eslint.config.js の files・package.json の lint 対象・`tests/my.test.js`（新設。読み込み順を index.html・package.json・eslint の3つで照合する）・
      mount-component.js の既定の読み込み・自前で並べる回帰スクリプト18本・example-index-html-load.js（9ファイル・ハイフン入りのファイル名）・CLAUDE.md を追随した
- [x] `npm test` 532件パス（+2）・`npx eslint app-*.js` 0 errors / 119 warnings（変更前と同数）・回帰スクリプト62本すべて EXIT=0
- 置いた前提: app-my-utils.js は app-core.js の `parseUrl` が使う（E1）ので core より前に置いた。Stop フックの自動コミットは7ファイルを名指ししていて
  新しい2ファイルを含まない（フックは変えていない）。`~/.claude/commands/bug-check.md` の読み込み順・ファイル数は追随していない（範囲外）

### ✅ 🟢 小さな修正3件: 自動コミットの記述・企業連携タブの横はみ出し・tokens の重複書き込み（2026-10-04 develop 完了／ルール・CF・データ移行なし）

- **自動コミットの記述（`869818b`・文書のみ）**: `.claude/settings.json` の Stop フックを読むと app-*.js の7ファイルすべて（app-shift.js・app-company.js を含む）が対象だった。CLAUDE.md の「5ファイル・対象外」の現在形の案内2箇所を直した。完了記録の中の過去の申し送りは履歴なので残した
- **企業連携タブの横はみ出し（`b878640`）**: 本物の index.html（`*{box-sizing:border-box}` 込み）で測ると、「企業アカウントを作成」フォームは 375px・320px とも 0px で、H1 が記録した 376px は index.html の CSS を持たない mount-component.js での測定の産物だった。320px では企業ログイン後に実際のはみ出しが2つあり、どちらも select の `width:"auto"` に最大幅が無いことが原因だった。1つは企業の共通設定の「残業予定の配り方」（`OtProrateField`）で、ページを 27px 広げカードから 42px 出ていた。もう1つは法人の絞り込み（`EntityFilter`）で、提出状況・ダッシュボードのカードから 8px 出ていた。2つに `maxWidth:"100%"` を足し、PC の幅は修正前と同じ（278px・299px）。回帰 `example-company-tab-mobile-fit.js`（chromium・webkit で EXIT=0、修正前は 320px で EXIT=1）
  - 直していないもの: 提出状況表（375px で 520/305px）と法人カードの店舗表（397/305px）は `overflowX:auto` の枠の中で横スクロールする表で、ページは動かない。表の作りを変える判断が要るので対象外にした
- **tokens の重複書き込み（`af8845a`）**: 補完の useEffect が、期間のどのフィールドが変わっても全期間の tokens を同じ値で書き直していた。`tokensSyncedRef` で確かめた token を覚え、確かめていない token だけを読み、無いか値が違うときだけ書くようにした。動かすのは claim が通った店舗だけ。回帰 `example-tokens-backfill.js` で、全段の書き込みが 45件から 6件に減った（修正前は EXIT=1）
- 未検証: 実 Firebase のルール下での tokens の読み書き（スタブはルールを評価しない）。デモ店舗（`#/demo`）の経路は実ブラウザで踏んでいない（fbSet が元から何も書かないうえ、補完は DEMO_MODE で先に戻る）

### ✅ 🔴 S3. シフト作成タブの高速化 第3段: 確定後の計算を後回しにする（2026-10-04 develop 完了）

**本番反映のとき**: 実機での確認は「🔴 次の本番リリースでユーザーと突き合わせる実機確認」（実装待ちタスクの先頭）の一覧で行う。

計画書 `Shifty_実装計画_2026-10.md` S3。重い計算（労務判定 `laborCalc`・週の休み・ヒートマップ・重複/ポジション/時刻の判定・休み/連勤カウント・
期間別/週間勤務時間・人×月の所定の自動集計）の依存を、subs と heatEdits の後回しの値（`subsCalc`・`heatEditsCalc`）に替えた。
確定の同期描画では依存が変わらないので前の結果を返し、セルの値とカーソル移動だけが先に出る。ヘルプ先の勤務のキャッシュは表示用（`helperCache`）と
計算用（`helperCacheCalc`）に分け、期間別・週間の合計は `totalsCache`（鍵は後回しの subs）を通す。

**計画から変えた点（実験で決めた）**: `useDeferredValue` だけの版を先に作って測ったところ、確定の同期描画は縮んだ（6倍で 420ms → 88ms）が、
5セル続けて入力すると重い計算が確定ごとに5回走り（入力回数より少なくならない）、計画の方針「続けて数セル入力した場合は再計算を1回にまとめる」を満たさなかった。
そこで**確定とセルへの打鍵が `CALC_IDLE_MS`（300ms）止まってから計算の入力（`calcIn`）を進め、それを `useDeferredValue` に通す**形にした（打鍵で待ちを延ばす）。
代わりに労務の色・警告・合計は、入力が止まってから 300ms＋計算の時間だけ遅れて変わる（下の表の settled）。

- [x] Enter で次のセルへ移ったあと、再計算の完了を待たずに次の入力ができる: 確定の同期描画（次のセルにフォーカス・確定したセルに値）は 6倍で 446ms → 89ms、
      その間の laborFindingsFor は0回。確定の 60ms 後に打った1文字が待たされる時間は 6倍で 402ms → 38ms（`keyAfterCommit`）
- [x] 5セル続けて入力したとき、労務判定の再計算（laborFindingsFor ÷ 30人）が 5回 → 1回（1倍・6倍とも。`burstFewerRecomputes`）
- [x] 再計算が終わった後の表示と保存される内容が変更前と一致: `perf-shift-edit-tab.js` の指紋（タブ全体の文字・全セルの値と背景色・subs）が `51fbba7` と同じ。
      `example-shift-calc-deferred.js` の出力（laborTotals・Excel の値・PDF のシフト表・確定の結果・非表示マウントの報告）も変更前と同じ
- [x] 再計算が終わるまで「計算中」: 期間別・週間勤務時間・週の休み・労務判定の見出し、時間帯別出勤人数、4つの警告パネルに `CalcPendingNote`（`data-calc-pending`）を出し、表を薄くする（休みカウント表は見出しが無いので薄くするだけ）。
      確定の直後に出て、済むと消えることを perf と `example-shift-calc-deferred.js` で確認
- [x] PDF・Excel・確定は入力中の値の確定と再計算の完了を待つ: ボタンは job を積み、`calcPending` でない描画の useEffect が実行する。
      `example-shift-calc-deferred.js` で、入力中のセルを残したまま押しても expXl・jsPDF・確定の savePeriods が「計算中」の消えた後に呼ばれ、そのセルの値が入る。
      待ちを外した写しでは3項目とも落ちる
- [x] 労務合計の保存（period.laborTotals）は済んだ値でだけ書く: memo の結果 `laborCalc.totals` を `calcPending` でない描画で書く（描画中に ref へ書かない）。
      「計算中」の間の書き込みは0件（ただしこの項目はガードを外しても依存の作りで結果的に守られるので、対照では区別できない）
- 非表示マウント（一括PDF・月次賃金・ダッシュボード）の exportJob も `calcPending` を待つ。マウント直後に subs が変わっても報告は変わった後の値（`example-shift-calc-deferred.js` の e）

| 操作 | CPU | 変更前（51fbba7） | S2 後 | useDeferredValue だけ（不採用） | S3 後 |
|---|---|---|---|---|---|
| 確定→次のセルに値とフォーカス（同期描画） | 1倍 | 72.5ms | 70.4ms | 15.3ms | 16.4ms |
| 確定→重い計算まで済む | 1倍 | 82.4ms | 80.3ms | 104.8ms | 440.8ms（うち待ち300ms） |
| 確定の60ms後の打鍵が待たされる時間 | 1倍 | 13.3ms | 12.0ms | 19.8ms | 2.4ms |
| 5セル連続入力の再計算回数 | 1倍 | 5 | 5 | 5 | 1 |
| 確定→次のセルに値とフォーカス（同期描画） | 6倍 | 446.4ms | 420.0ms | 87.9ms | 89.2ms |
| 確定→重い計算まで済む | 6倍 | 517.3ms | 492.5ms | 660.0ms | 973.4ms（うち待ち300ms） |
| 確定の60ms後の打鍵が待たされる時間 | 6倍 | 402.2ms | 375.6ms | 32.5ms | 38.0ms |
| 5セル連続入力の再計算回数 | 6倍 | 5 | 5 | 5 | 1 |
| 5セル連続入力にかかった時間（打ち終わるまで） | 6倍 | 3,855ms | 2,861ms | 2,487ms | 1,120ms |

- 計測は `perf-shift-edit-tab.js`（30人×31日・各5回の中央値）。harness の periods を固定の配列にした（アプリは App の state を渡すので参照が安定している。
  描画のたびに配列を作ると periods を依存に持つ重い計算が確定の同期描画でも走り、実アプリと違う計測になっていた）。上の表はすべて固定後の同じ harness の値
- 回帰: `example-*.js` 60本（新規 `example-shift-calc-deferred.js` を含む）がすべて EXIT=0。WebKit iPhone 13 で `example-shift-cell-behaviors.js`・`example-shift-calc-deferred.js`・
  `example-shift-edit-tab.js`、WebKit デスクトップで `example-helper-aggregate.js` も EXIT=0
- 途中で見つけて直したもの: (1) 計算中に積んだ PDF の job が `pastSubsLoaded` を待ってしまい、過去の提出を読んでいない画面では書き出されなかった（`needPast` で分けた・
  `example-company-bulk-pdf*.js` が検出）。(2) スタブ Firebase（`stub-firebase.js`）がどこへの書き込みでも全 listener を呼んでいたため、App の tokens の補完
  （periods が変わるたびに全期間の `tokens/{urlToken}` を同じ値で set する）が periods の listener を呼び直し、subs の配列が作り直され続ける描画のループになっていた
  （3秒で約2,000回。S2 の時点でもループしていたが、PDF が計算を待たなかったので表に出なかった）。実 Firebase と同じく、見ているデータが変わったときだけ届けるように直した
- 検証: `npm test` 530件パス（P3.6 のドリフト検出を getWeekMinRaw・getPeriodMinRaw の形に直した）・`npx eslint app-*.js` 0 errors / 119 warnings（118＋新しい `CalcPendingNote` の no-unused-vars）
- 変わった動作: 確定ボタンの所定の集計は setTimeout(0) ではなく計算が済んだ描画で行う（押した時点の periods ではなく最新の periods を使う）。
  プランが Premium でない描画では労務の合計を書かない（以前はその前に計算した値が ref に残っていれば書きえた）
- コードは Stop フックの自動コミット `3c45a97`・`ea26e73` に入った。テスト・スクリプト・スタブ・BACKLOG・CLAUDE.md は別のコミット
- **残る重い処理（S4〜S6 の判断材料）**: 確定の同期描画に残るのは全セルの props の組み立て（`resolveSubByAlias` 約19,000回・1倍 16ms・6倍 89ms）。
  後回しの描画は1回あたり `calcNetWorkMinutes` 約10,000回・`resolveSubByAlias` 約80,000回・laborFindingsFor 30回（6倍で約600ms・この間に打った文字は待たされる）。
  打鍵とセル選択はセル1つの描画だけ（1倍 0.3ms）

### ✅ 🔴 S2. シフト作成タブの高速化 第2段: 入力と選択では計算しない（セルの分離）（2026-10-04 develop 完了）

**本番反映のとき**: 実機での確認は「🔴 次の本番リリースでユーザーと突き合わせる実機確認」（実装待ちタスクの先頭）の一覧で行う。

計画書 `Shifty_実装計画_2026-10.md` S2。グリッドのセルをモジュール直下の `ShiftCell`（`React.memo`）に、ツールチップを `CellTip` に分けた。
入力中の文字とフォーカスの状態はセルの中に持ち、親（ShiftEditTab）へは確定（blur・Enter）のときだけ `api.commit`（= handleBlur）で伝える。
親の `focusKey`・`cellTip` の state は無くなり、`localEdits` は確定済みのセルの表示用バッファだけになった（入力中の文字は `draftRef`、
flushEdits が blur の直後に読めるよう `localEditsRef` にも置く・更新は `updLocalEdits`）。セルの props はプリミティブと、親が1回だけ作る
`cellApi`（中身は `cellApiRef` 経由で最後にコミットした描画の関数）と、`useMemo` で固定した `AI2` だけ。フォーカス中の見え方
（色を付けない・文字色は既定・混在の日は自店の値＝`editVal`）はセルが作る。店舗切替・期間切替・選択中の期間の消失は `discardEdits` が
`cellResetKey` を進めてセルの入力中の文字も捨てる。PDF・Excel の解決は `editsNow()`（確定済み＋入力中）を読む。

- [x] 1文字入力とセル選択で描き直されるのが、そのセル（とツールチップ）だけ: `perf-shift-edit-tab.js` で ShiftEditTab の描画0回・
      ShiftCell の描画1回（操作したセルだけ）・CellTip 1回（1倍・6倍とも。`focusNoParentRender`・`keyNoParentRender`・`onlyTargetCellRerenders`）
- [x] 変わらない動作: 新しい回帰 `example-shift-cell-behaviors.js`（Enter・Ctrl/Cmd+Enter の移動、IME 変換中の Enter と keyCode 229、
      「/」の切り替え（Enter の二重 blur でも1回）、ツールチップ、入力中に「保存」を押したときの件数（どちらも「6件」）と保存内容、
      店舗切替・期間切替で入力中の文字を捨てる、確定済み期間の readOnly、トリプルクリックの変更マーク、Premium 以外の誘導）が
      変更前（`51fbba7`）と変更後で同じ結果（Chromium と WebKit iPhone 13 の両方）。わざと IME の判定と resetKey を外した写しでは3項目が落ちる
- [x] 既存の E2E: `example-*.js` 59本（新規1本を含む）がすべて EXIT=0。`example-helper-aggregate.js` は WebKit（デスクトップ）でも EXIT=0。
      WebKit を iPhone 13 で回すと `c_colWidthUnchangedFull` だけ落ちるが、変更前も同じく落ちる（安定値が Chromium デスクトップの寸法のため）
- 表示と保存の一致: 同じ合成データ・同じ操作列で、マウント直後と全操作の後のタブ全体の文字・全セルの値と背景色（斜線を含む）・onSave に渡った subs の
  指紋が変更前と一致（`a40ab3a6…`/`88be3bcf…`、操作後 `c59330b1…`/`f5f60932…`、subs `fe3fc854…`）

| 操作 | CPU | 変更前（51fbba7） | S2 後 | ShiftEditTab の描画（前→後） | calcNetWorkMinutes（前→後） | resolveSubByAlias（前→後） |
|---|---|---|---|---|---|---|
| セルを選ぶ | 1倍 | 39.6ms | 13.3ms | 1 → 0 | 2,773 → 0 | 20,968 → 1 |
| 1文字入力 | 1倍 | 34.2ms | 0.3ms | 1 → 0 | 2,773 → 0 | 20,964 → 0 |
| 確定して次のセルへ | 1倍 | 81.7ms | 79.5ms | — | — | — |
| セルを選ぶ | 6倍 | 219.0ms | 70.4ms | 1 → 0 | 2,785 → 0 | 20,830 → 1 |
| 1文字入力 | 6倍 | 220.3ms | 66.6ms | 1 → 0 | 2,785 → 0 | 20,826 → 0 |
| 確定して次のセルへ | 6倍 | 524.2ms | 493.0ms | — | — | — |

- 確定は変わらない（S3 の対象）。6倍の選択・入力に残る約70ms は計測の setTimeout(0) の待ちを含む（1倍では 0.3ms）
- この表の数値は計測 harness の periods を固定する前のもの（S3 で固定した。固定後の同じ harness の値は S3 の表）
- 検証: `npm test` 530件パス（P3 のドリフト検出の readOnly の項を ShiftCell の形に直した。意図＝確定とヘルプ先だけの日で両方のセルがロックされる、は同じ）・
  `npx eslint app-*.js` 0 errors / 118 warnings（116＋2。新しい ShiftCell・CellTip が既存の HeatTable 等と同じ no-unused-vars を出す）
- コードは Stop フックの自動コミット `d534246`（Auto-commit: app-*.js changes）に入った（フックが app-shift.js も対象にするようになっている）。
  テスト・計測スクリプト・BACKLOG は別のコミット

### ✅ 🟡 H2. シフト作成タブ: ヘルプ勤務の表示変更（2026-10-04 develop 完了／ルール・CF・データ移行なし）

**本番反映のとき**: 実機での確認は「🔴 次の本番リリースでユーザーと突き合わせる実機確認」（実装待ちタスクの先頭）の一覧で行う。

`Shifty_実装計画_2026-10.md` H2。決まりは `helperCellDisplay`（app-utils.js）1本で、画面・PDF・Excel が同じ関数を通す。
- [x] 計画書の表の4通りが画面・PDF・Excel で同じ文字と黄色になる（ヘルプ先のみ「17鶏」「23三」／昼ヘルプ＋夜自店「11鶏三」「23」／昼自店＋夜ヘルプ「11」「23鶏三」／自店のみは変化なし。単体テストと `example-helper-aggregate.js`。Excel は生成物を ExcelJS で読み直した）
- [x] 「→」・斜体・灰色が画面と PDF から無くなった（実ブラウザで8セルを測定）
- [x] ヘルプ先の勤務がある日は画面・PDF・Excel で休みの斜線が出ない（スタッフ提出の休み＋ヘルプの日で、画面の backgroundImage と Excel の diagonal を確認。PDF はヘルプのセルが先に描かれるので斜線は元から出ない）
- [x] 半日ヘルプの日、黄色はヘルプ側のセルだけ
- [x] 混在の日、略称の付くセルを選ぶと自店の値（16px）に切り替わって編集でき、保存されるのは自店の値だけ（`adjustedStart:"18:00"`・略称は subs に入らない）。変えずに離れても何も保存しない。離れると合成表示に戻る
- [x] 自店の勤務と時間が重なるヘルプ先の勤務は表示しない（`helperWorkOn` の重複除外のまま）
- [x] 労務の合計・ヒートマップ・重複チェックの結果は変更前と同じ（H2 前の `978277e` で同じデータを測った値を `example-helper-aggregate.stable.json` に置き、労務判定・週の休み・期間別勤務時間・ヒートマップの表・重複の表示・laborTotals が一致）
- [x] `CELL_COLOR_LEGEND` の「特記あり」と「休み希望」の説明に自動表示のヘルプを足した
- [x] `helperCellDisplay` の単体テスト（4通り・2店舗ヘルプ・2セル用未登録・略称未登録・30分単位・メモだけの日）と `helperCellFontPx` のテスト
- [x] E2E `example-helper-aggregate.js` を新しい表示に直した（41項目。Chromium と WebKit で通る。H2 前の配信物では表示の19項目が落ち、計算の項目は通る）
- [x] 列幅は1pxも変えない: 田中・佐藤・山田の列の td の位置と幅が H2 前と同じ（通常表示 39px・全表示も一致）。収まらない合成表示はそのセルの文字だけを縮める
- [x] CLAUDE.md（P3.6 のグリッドの項・関数一覧・Settings 型）と 労務給与_複数法人_実装計画.md §3.9 を更新
- **計画書から変えた点（2026-10-04 ユーザー指示）**: 計画書の「『11鶏三』が収まらないときその人の列だけ広げる」（確認したい点4）は**不採用**。
  再着手条件は、縮めた文字（下限 8px）が実機で読めないという報告があったとき、または15分刻みの時刻でヘルプを組む店舗が出たとき（下の切れの問題）。
- 文字の縮め方: `helperCellFontPx` が1文字を半角英数 0.62em・記号 0.34em・全角 1em で見積もり、0.5px 刻みで切り下げ、下限 8px。
  実測（通常表示・列39px）で「11鶏三」「23鶏三」10.5px、「17鶏」「15三」15.5px、全表示の「11鶏三」11px、PDF（列30px）は「11鶏三」8px・「17鶏」11.5px。
  縮めるのは合成表示を出している間だけで、編集中は 16px（iOS のズーム防止）。縮めたセルは line-height を 18px に固定して行の高さを保つ
  （指定しないと、そのセルしか無い行が 26px→20px に詰まった）。Excel は該当セルだけ `shrinkToFit`
- 残る制約: 15分刻みの時刻と2文字の略称（例「11.25鶏三」）は下限 8px でも入らず、端が切れる（overflow:hidden）。ツールチップには全体が出る
- 検証: `npm test` 530件パス・`npx eslint app-*.js` 0 errors / 116 warnings（変更前と同数）。回帰スクリプト58本（`perf-shift-edit-tab.js`・`example-index-html-load.js` を含む）がすべて EXIT=0

### ✅ 🟡 H1. 企業連携タブ: 店舗略称の2パターン（2026-10-04 develop 完了／ルール・CF の変更なし）

`Shifty_実装計画_2026-10.md` H1。ヘルプ勤務の表示で使う略称を「1セル表示用」（既存の `settings.shopAbbrs` の先頭）と
「2セル表示用」（新キー `settings.shopAbbr2={top,bottom}`）に分けた。
- [x] 店舗ごとに2セル用（上・下）を登録・変更・削除できる。企業連携タブの店舗カードに欄を足し、1セル用は既存の略称の先頭である旨を表示（`example-shop-abbr2.js`）
- [x] 2セル用も `isReservedShopAbbr` を通し、各2文字まで・上下の両方が必須（`shopAbbr2Error`。テストと実ブラウザで h・数字始まり・3文字・片方だけを拒否）
- [x] 他店舗の保存は `shops/{sid}/settings` への update（`fbUpd`）。削除は `shopAbbr2:null` の update。表示中の店舗は saveSettings（実ブラウザで書き込みの種類とパスを記録して確認・set は0件）
- [x] `makeSettings` に `shopAbbr2:null`、`otherShopDataOf` が `abbr2` を読み（`shopAbbr2Of`）、`helperWorkOn` の勤務に `abbr2` を載せる
- [x] 2セル用は `abbrs`（`abbrToShop` の元）に入らない・`PERIOD_SNAPSHOT_SETTING_KEYS` に無い（テスト）
- [x] 375px で店舗カードの中にはみ出す要素が無く、入力欄はカードの内側・16px
- 「2セル用が未登録なら上セルに1セル用・下セルは時刻のみ」は表示の規則なので H2 で実装・検証する
- 検証: `npm test` 525件パス・`npx eslint app-*.js` 0 errors / 116 warnings（変更前と同数）。`example-shop-abbr2.js` 19項目パス（H1 より前の配信物では入力欄が無く EXIT=2）。
  企業連携系の回帰（unlink・entities・settings・login-tab・home-shop-dup・index-html-load）も EXIT=0
- スコープ外で見つけたもの: 375px では「企業アカウントを作成」フォームの入力欄3つ（`width:100%` に padding が足される）がページを1〜2px 横に広げる。H1 より前（`978277e`）から同じで、今回は触っていない

### ✅ S1. シフト作成タブの高速化 第1段（依存の安定化）と計測（2026-10-04 develop 完了）

**本番反映のとき**: 実機での確認は「🔴 次の本番リリースでユーザーと突き合わせる実機確認」（実装待ちタスクの先頭）の一覧で行う。

計画書 `Shifty_実装計画_2026-10.md` の S.0・S1。app-shift.js の3か所だけを変えた: `weeks` と `sameMoPeriods` を `useMemo`（依存はそれぞれ `[period,prevPeriod]`・`[period,periods]`＝計算が読む値のすべて）、`staffAliases` の既定値をモジュール直下の凍結した空オブジェクト `NO_STAFF_ALIASES` にした。`ShiftEditTab` の最上位に早期 return は無く（最初の return は描画）、新しい useMemo は直下の既存の useMemo（`laborFrame`）と同じ並びにある。

計測は新しいスクリプト `.claude/skills/shifty-e2e-verify/scripts/perf-shift-edit-tab.js`（30人×31日＋前の期間・ヘッドレス Chromium・Firebase なし・各5回の中央値。CPU 6倍は CDP の `Emulation.setCPUThrottlingRate`）。変更前は同じスクリプトを変更前の作業ツリーで流した。計測用に関数を包んでいるので絶対値は大きめに出る。比率として読む。

| 操作 | CPU | 変更前 | 変更後 | laborFindingsFor（前→後） | calcNetWorkMinutes（前→後） | resolveSubByAlias（前→後） |
|---|---|---|---|---|---|---|
| セルを選ぶ | 1倍 | 75.9ms | 43.7ms | 30 → 0 | 9,684 → 2,770 | 40,380 → 20,990 |
| 1文字入力 | 1倍 | 65.3ms | 33.7ms | 30 → 0 | 9,684 → 2,770 | 40,376 → 20,986 |
| 確定して次のセルへ | 1倍 | 69.8ms | 70.7ms | 30 → 30 | 11,058 → 11,058 | 61,089 → 61,089 |
| セルを選ぶ | 6倍 | 423.5ms | 225.7ms | 30 → 0 | 9,694 → 2,773 | 40,328 → 20,938 |
| 1文字入力 | 6倍 | 433.8ms | 225.9ms | 30 → 0 | 9,694 → 2,773 | 40,324 → 20,934 |
| 確定して次のセルへ | 6倍 | 534.8ms | 548.9ms | 30 → 30 | 11,080 → 11,080 | 60,967 → 60,967 |

- [x] 1文字入力とフォーカスで `laborFindingsFor` が0回（上表・スクリプトの `focusNoLabor`/`keyNoLabor`）
- [x] 労務の表示が変更前と一致: 同じ合成データで、マウント直後と編集の後の両方について、タブ全体の文字と全1,860セルの値・背景色の指紋（sha256）が変更前と同じ（`a40ab3a6…`/`a43937b4…`、編集後 `3ebf7db1…`/`b74f481b…`）。`npm test` 522件パス。ShiftEditTab を使う回帰22本（labor-phase1〜3・cell-color・partial-month・premium・annual・confirm・pdf-labor・skilled-week-rest・fitall-geometry・fullview-cell-colors・helper-aggregate・input-check・limits・ot-window・payroll・company-dashboard・cell-clear・toolbar-save-button・actuals・shift-edit-tab）はすべて EXIT=0
- [x] 変更前後の計測値をここに記録した（上表）
- [ ] 実機（普段使っている端末）で体感を確認する: **未検証**（ユーザーの領分）
- 検証: `npm test` 522件パス・`npx eslint app-*.js` 0 errors / 116 warnings（基準と同数）
- 分かったこと: 確定（blur）は今も30人分を計算し、時間も変わらない（計画書どおり S2・S3 の対象）。選択・入力に残る約2,770回の `calcNetWorkMinutes` と約2万回の `resolveSubByAlias` は、メモ化されていない描画中の集計（週・期間の合計・ヒートマップ等＝計画書 S4 の対象）とセルごとの `_getSub` から来る

### ✅ K2. Excel 書き出しの名前行を 9pt・縦書き・左右中央・上下中央に（2026-10-04 develop 完了・コードは自動コミット `0f6c78b`）

**本番反映のとき**: 実機での確認は「🔴 次の本番リリースでユーザーと突き合わせる実機確認」（実装待ちタスクの先頭）の一覧で行う。

計画書 `Shifty_実装計画_2026-10.md` の K2。`expXl`（app-admin.js）に名前セル専用の整列 `aName={horizontal:"center",vertical:"middle",textRotation:"vertical"}` を足し、名前セルのフォントを 14 → 9 にした。`aV` は変えていない。

- **ExcelJS 4.4.0 の実験**（CDN の 4.4.0 をヘッドレス Chromium で読み、書き出した xlsx の styles.xml を展開して確認）: `textRotation:255` は `<alignment horizontal="center" vertical="distributed"/>` と出力され**回転が捨てられる**。`textRotation:"vertical"` は `textRotation="255"` として出力され、読み直すと `"vertical"`。変更前の配信物（`b014efa`）で書き出した名前セルにも回転は無かった＝これまで Excel で手直しが必要だった理由はこれ
- [x] 名前セルがフォント 9・方向＝縦書き・横＝中央・縦＝中央（`example-excel-missing-day.js` の `g_名前行は9pt縦書き中央`）
- [x] 太字と色は現状のまま（staffColors の赤の人は FFFF0000、他は FF000000・太字）
- [x] 名前セル以外（期間ラベル・左右の曜日・店舗名・従業員番号・日付・曜日・時刻の上下）の書式が変更前と一致（変更前の配信物で書き出した値を期待値に固定・`i_名前セル以外は変わらない`）
- [x] 期間タブ（resolver なし）とシフト作成タブ（resolver あり）の両方の入口で同じ（`h_2つの入口で名前行が同じ`）
- [x] `example-excel-missing-day.js` に名前セルの alignment と font.size の確認を足した。EXIT=0。変更前の配信物では `g`・`i` が false で EXIT=1
- 検証: `npm test` 522件パス・`npx eslint app-*.js` 0 errors / 116 warnings。Excel を読む他の回帰 `example-staff-hidden.js`・`example-pdf-headcount.js` も EXIT=0
- 残る注意（計画書の備考どおり）: 行の高さは 78 のまま。9pt の縦書きで収まるのは目安7文字前後で、長い名前は切れうる（実際の Excel での見え方は未検証）

### ✅ K1. スタッフ編集モーダルと法人名変更の保存ボタンを「保存」に（2026-10-04 develop 完了）

計画書 `Shifty_実装計画_2026-10.md` の K1。途中で範囲を1点広げた（コーディネーター経由のユーザー指示）: 企業連携タブの法人名の変更ボタン（app-company.js）も「保存」にした。

- [x] スタッフ編集モーダルのボタンが「保存」（app-admin.js の1行）。`example-staff-pay.js` で、モーダルを開いた状態で文字が「保存」と完全一致するボタンが1つだけで、それを押すと改名が通り private/pay のキーが移ることを確認（`editSaveIsOnly`・`renameFollows`）
- [x] 動作（`confirmEdit`）は変えていない（差分はラベルの文字だけ）
- [x] `example-staff-pay.js` の `clickExact("名前を保存")` を「保存」に直した。EXIT=0（変更前の配信物では EXIT=1・`editSaveIsOnly`/`renameFollows` が false）
- [x] 追加: 法人名の変更ボタンを「保存」にし、一意に押せるよう `data-co-entity-rename={法人ID}` を付けた（動作の renameEntity は変えていない）。これを押す E2E は元々無かったので `example-company-entities.js` に往復の改名（乙法人→丙法人→乙法人）を足した。EXIT=0（変更前の配信物では EXIT=1・`entityRenameSaveLabel` が false）
- 検証: `npm test` 522件パス・`npx eslint app-*.js` 0 errors / 116 warnings（基準と同数）

### ✅ 「外部の長時間」の削除と「応援・外部」を通常の労働時間制と同じ判定に（2026-10-03・develop のみ・未リリース）

ユーザー指示（2026-10-03）の2件と、同日の追加指示1件。リリース（main・CF デプロイ・`?v=` のバンプ）は別途ユーザーの指示を待つ。
- **外部の長時間（P3.5c）の削除**（`4f5d200`）: 設定タブのトグルとしきい値・セル色・title・操作方法レジェンド・`LABOR_DAY_FIX_KEYS` のキー・
  労務設定の既定値と範囲・CF の `COMPANY_LABOR_KEYS`/`COMPANY_LABOR_RANGES` を消した。完成したシフトにも色が残り、直す必要のない目印が増えるため。
  本番10店舗に残る保存値（`highlightExternalOver8h:1`・`externalOverThresholdMin:480`）はデータ移行せず、`laborSettingsOf` が捨てることをテストで固定した
- **保存値 none（旧「判定対象外（応援・外部）」）を B と同じ判定に**（`e582b0c`）: `laborSystemOf` が保存値 none を B に読み替える。
  このコミットでは労働時間制の選択肢の名前を「応援・外部」に改名したが、下の追加指示で選択肢そのものを外したので、その改名は残っていない。
  保存値・`LABOR_SYSTEMS`・既定（dispatch/other＝none）・CF は変えていない（データ移行なし）。従業員番号の未設定だけは保存値 none の人に出さない
  （保存値を見る `laborSystemRawOf` を新設）。内部値 none は行き先の店で「所属店舗で判定」する人（P3.6）の値として残した
- 検証: `npm test` 522件パス・`npx eslint app-*.js` 0 errors / 116 warnings（着手前と同数）。新しい回帰 `example-labor-external-as-b.js` は
  応援・外部の人と parttime の人の労務判定表の列・パネルの行が一致すること、設定タブにトグルが無いこと、レジェンドに「外部の長時間」が無いこと、
  保存済みの値があってもセルが塗られないことを確かめる（14項目。変更前の配信物では9項目が落ちる）
- **追加指示: 組み込み属性 dispatch を「応援・外部」に改称し、労働時間制の選択肢から none を外す**（`3a34438`）:
  ユーザーが「外部・応援」と呼んでいたのは労働時間制ではなく組み込み属性 `dispatch`（表示名「派遣」）だった（設定タブの属性カードのスクリーンショットで指定）。
  `STAFF_TYPE_LABELS.dispatch` を「応援・外部」にした（ID・保存データは変えない＝「バイト」→「パート・アルバイト」と同じ形）。
  労働時間制の選択肢は新設の `LABOR_SYSTEM_CHOICES`（A・B）だけにし、保存値・既定が none の属性は `laborSystemChoiceOf` で B が選ばれた状態で出す
  （設定タブ・企業の共通設定・企業設定の固定表示）。`LABOR_SYSTEMS`・`DEFAULT_LABOR_SYSTEM_BY_ATTR`・CF の `COMPANY_LABOR_SYSTEMS` は none を受け付けたまま。
  参照の無くなる `LABOR_SYSTEM_LABELS.none` は削除した。UI で B を選び直して保存した属性の人には、B を明示した結果として「従業員番号が未設定」が出るようになる。
  検証: `npm test` 522件パス・lint 0 errors / 116 warnings・`example-labor-external-as-b.js` を20項目に拡張（変更前の配信物では8項目が落ちる）
- **残り**: 削除済み機能の回帰 `example-labor-external-over.js` は、`git rm` が Bash フックの不可逆ゲートに止められたため**リポジトリに残っている**
  （いま回すと設定タブのトグルが無いので EXIT=2）。ユーザーの承認を得てから削除する

### ✅ 管理者からの変更依頼4件（2026-10-01・同日本番リリース）

- **賃金パスコードの注意文の削除**: 「初期パスコードのままです。変更してください」を出さない（`PayCodeBox`）
- **企業内登録スタッフでもパスコードを変更できる**: 上部の箱に「変更」（現在の番号 → 新しい番号2回・CF `setCompanyPayCode`）。
  ユーザーの「企業連携タブのパスコードは入力のみで変更できない」は、この箱のことと判断した（企業アカウントのカードには元から変更ボタンがある）
- **労務判定を法人の設定に統合**（ユーザー決定）: 企業の共通設定から労務判定の欄を外し、既存の企業の値は法人カードの読み込みで1回だけ
  各法人へ移す（`planLaborToEntities`・写しは前後で同じ）。属性別の勤務時間制限は企業の共通設定に残す
- **特定技能の週の公休**: 属性名に「特定技能」を含む人は週1回の公休、月をまたぐ週は月末側・月初側に各1回。違反は労務の確認と週の休み表（赤）に出る
- 置いた前提は CLAUDE.md の「法人レイヤー」「特定技能の週の公休」の節。再着手条件: 特定技能の判定を属性名ではなく明示のフラグにしたくなったとき（`isSkilledWorkerAttr` だけを直す）

### ✅ 🟡 労務・給与と複数法人 P7: 企業横断ダッシュボード（2026-09-30 develop 完了・`eca6959`〜`2c3bffb`／ルールと CF の変更なし）

**目的**: `労務給与_複数法人_実装計画.md` §6 P7・§1 の要件5・16。詳細は CLAUDE.md の「企業横断ダッシュボード（P7）」の節。
- [x] 企業連携タブの新カード `CompanyDashboardCard`（Premium・企業セッション）。法人→店舗→人の表（`example-company-dashboard.js`）
- [x] 当月の所定 vs 所定上限（未設定なら総枠）と差、年平均所定 vs 分母と差（労務判定表の「月所定/上限」「年平均所定/分母」と同じ値）
- [x] 36協定の残り: 月・協定の年・年720h・複数月平均80h（いちばん高い窓）・月45h超の回数（`agreementYearStatus`＝判定と同じ値）
- [x] 確定・交付の進捗（その月にかかる期間を `periodStateOf` で数える。店舗と法人の見出し行）
- [x] 年間休日（公休＝空欄を含む）と 52日以上の判定（ok／不足／途中）
- [x] CSV（BOM付き UTF-8・画面と同じ列の定義・金額の列なし）
- [x] 集計は既存関数の合成（新しい労務の式なし）。店舗ごとの値は ShiftEditTab の非表示マウントと `exportJob.kind="dashboard"`。賃金は出さない（`tests/core.test.js` が固定）
- [x] 読めない店舗・途中の月は「＋」と淡色、超過・不足は赤（労務判定表と同じ流儀）
- [x] **一括PDFの年の値の不具合を実測して修正**（`eca6959`・別コミット）: 非表示マウントは `pastSubsLoaded=true` なのに提出を対象と直前の期間しか読んでおらず、
      読んでいない期間が実働0・全日公休として年計・年平均所定に入っていた。4〜10月に月10時間のデータで、修正前は一括PDFの年度計 20:00・年平均所定 2:51、
      店舗単体の全データは 70:00・10:00。修正後は一括PDFも 70:00・10:00（`example-company-bulk-pdf-year.js`）。読む範囲は `laborReadPeriodIds` に切り出してダッシュボードも使う
- 検証: `npm test` 493件パス・`npx eslint app-*.js` 0 errors（warnings 115＝P6b の 114＋新しいカードの未使用判定1。既存のカードと同じ扱い）。
  `example-company-dashboard.js` 16項目パス（P7 より前の配信物では15項目が落ちる。Pro でカードが出ないことだけは元から通る）。既存の回帰19本も通過（`example-company-entities.js` は法人フィルタの数を
  提出状況表の分だけ数えるように直した）。フォーム部品155件で fontSize 16 未満は0件
- 前提として置いたこと: ①年の値は年度の始め〜選んだ月まで（先に作ってある空の期間を公休として数えない）。②年間休日の「不足」は、年度末まで数え終えたか、
  残りの日を全部休んでも52日に届かないとき。それ以外は途中。③36協定の年の3項目は月が埋まっていなくても超えていれば赤（途中の値が既に超えている＝確定的に超過）
- 申し送り: 本番反映で要るものは無い（ルール・CF・データ移行なし。クライアントの配信だけ）。月次賃金ページ（P6b）も提出を月末までしか読まず、
  月末をまたぐ週の法定休日の判定が次の期間の空欄を休日とみなす可能性がある（コードを読んだだけ・未実測・P7 の範囲外なので直していない）
  → **2026-10-02 のバグチェック#161 で実測して修正済み（`7a70ca5`）**。翌月側が終日の有給・慶弔だけの週で当月の法定休日労働が消えていた。提出を月末＋7日まで読む

### ✅ 🟡 労務・給与と複数法人 P6b: 賃金計算と出力（2026-09-30 develop 完了・`8d0cff1`〜／ルールの変更なし・CF は本番未反映）

**目的**: `労務給与_複数法人_実装計画.md` §4.5・§6 P6b・決定 #2・#6・#12・#17。詳細は CLAUDE.md の「月次賃金（P6b）」の節。
- [x] 月次内訳（人×項目: 所定／実労働／時間外①②③／60h超／深夜／法定休日／欠勤・遅刻早退／各割増額／固定残業の充当／固定深夜の充当／欠勤控除）と CSV。
      新規ページ `PayrollPage`（`fullPage` kind "payroll"・Premium・オーナー）。入口はスタッフタブの「月次賃金 →」と企業連携タブの法人カード（法人 → 店舗）
- [x] PDF・Excel には出ない（`tests/core.test.js` が `buildShiftTableHtml`・`exportPdf`・`expXl` の本体を走査。月次賃金の関数を注入した写しでは落ちる）
- [x] 時給者は 時給 × 実労働 ＋ 割増、月給者は基本給を動かさず割増と控除だけ（テストの手計算・`example-payroll.js`）
- [x] 「年平均所定 > 分母」の警告（月給者・テストと実ブラウザ）
- [x] 適用開始日で版を選ぶ（月初時点の版・月の途中の改定は注記だけで日割りしない・テスト）
- [x] 金額は閲覧パスコード解除まで「••••」（時間は伏せない）・CSV は解除まで押せない（`example-payroll.js`）
- [x] 法人設定 `wageSettings` に `premiumRates`（法定値既定・上乗せだけ）と `roundingRule`（既定 円未満切上げ）。CF の sanitize と一致をテストで照合
- [x] `サブスク_プラン設計書.md` の Premium に「賃金計算」を追記（決定 #6）
- [x] 賃金設定ページ（P6a）の割増率の表示を、法定の固定文言から法人の設定の率に変えた（§3.7「法人設定の率を表示」）
- 検証: `npm test` 485件パス・`npx eslint app-*.js` 0 errors（warnings 114＝P5 の 113＋新しいページの未使用判定1。既存のコンポーネントと同じ扱い）。
  `example-payroll.js` 17項目パス（P6b より前の配信物では16項目が落ちる。Pro でボタンが出ないことだけは元から通る）。既存の回帰13本（staff-pay は「月次賃金 →」を包んだ配置に合わせて1項目を直した）も通過。
  フォーム部品154件で fontSize 16 未満は0件
- 前提として置いたこと: ①固定深夜手当は深夜割増から**額**を引く（計画書 §8「残る確認」の未決事項。額が0で時間だけあればその時間分の深夜割増を上限）。
  ②欠勤控除の端数は支払いと逆向き（切上げなら切捨て。計画書は「項目ごとに roundingRule」としか書いていない）。
  ③時給者の時間外・法定休日は率の分だけ（時給 × 実労働が 1.0 倍分を含むため）。④労働時間制が判定対象外（none）の人は時間を出さず「計算しません」
- 申し送り: 月の途中の改定の日割りは未実装（計画どおり BACKLOG 相当）。割増率・端数は CF を本番へ出すまで本番では保存されない（上の🟡）

### ✅ 🔴 app-admin.js の2回目の分割（40万字の上限の手前・シフト作成タブ一式を app-shift.js へ）（2026-09-30 develop 完了・`a5d9c3c` `018ceeb`／ルール・CF の変更なし）

**目的**: P3〜P5 の追加で app-admin.js が 399,977 字になり、回帰 `example-index-html-load.js` の上限（40万字・Babel Standalone の
500KB 上限の手前）まで残り 23 字だった。P6b・P7 の追加を受けられるよう、挙動を1バイトも変えずに2回目の分割をする
（ユーザー指示「必要があれば分割して」2026-09-30）。

- [x] 新ファイル `app-shift.js` に、シフト作成タブ一式（app-admin.js の 271〜3463 行＝LEGEND_COLORS・FIXED_ENTRY・FIXED_KEY・HDASH_IMG・
      HeatTable・SummaryTable・GridLegend・ACT_DIFF_BG・ActualsGrid・ActualsCsvDialog・ShiftEditTab）を**そのまま**移した。
      選んだ理由: 範囲の外から参照される名前が ShiftEditTab（AdminView の描画・app-company.js の一括PDF）と FIXED_KEY（expXl の関数本体）の
      2つだけで、どちらも実行時の参照。読み込み時の依存は app-utils.js の定数だけ（AST で確認）。
      結果 app-admin.js 198,981 字・app-shift.js 201,775 字（app-company.js 175,052 字は変わらず）
- [x] 移動のコミット（`a5d9c3c`）は移動だけ。`git diff --numstat`: app-admin.js は追加0行・削除3,194行（移したブロック3,193行＋直後の空行1行）で、
      削除行はブロック＋空行と完全一致。ブロックの sha256 先頭16桁 `b8258275242617e3` が app-shift.js の本文（見出しコメントを除く）と一致
- [x] index.html: app-admin.js の直後・app-company.js の前に app-shift.js（同じ版数）。?v= は7箇所・読み込み順は utils→core→staff→admin→shift→company→main
- [x] package.json の lint・eslint.config.js（files・sharedGlobals に FIXED_KEY・説明コメント）。lint 0 errors / 113 warnings（分割前と同数・
      警告の ruleId と文言の集合も一致。app-admin.js の30件が admin 21＋shift 9 に分かれた）
- [x] tests/core.test.js: `_readAdminSurface` を admin→shift→company の3本の連結にし、差し替え口 `SHIFTY_SHIFT_SRC` を足した。476件パス。
      読み口を直す前は12件が落ちた（移した範囲を検査しているテストが素通りにならない）。反証: app-shift.js の写しで isTimeOrderInvalid を
      別名に置き換えると項目12が、シフト日に新フィールドを書かせると ADMIN_SHIFT_FIELDS が、それぞれ1件落ちる
- [x] mount-component.js の既定の読み込みと、自前で並べる回帰スクリプト12本に app-shift.js を足した。回帰49本すべて EXIT=0
      （出力に console.error・Babel の 500KB 警告なし）
- [x] `example-index-html-load.js` を7ファイルに合わせ、期間を1つ持たせてシフト作成タブ（app-shift.js）が描けることを確かめる項目を足した。EXIT=0。
      反証: app-shift.js の行を抜いた index.html では `ReferenceError: ShiftEditTab is not defined` で EXIT=1。
      あわせて実物の Firebase SDK（dev）で index.html をそのまま開き、7ファイルを読み込んでログイン画面まで console.error 0件
- [x] CLAUDE.md（ファイル構成・分割の仕組み・読み込み順・コンポーネント一覧のファイル列・P5 の文字数の申し送り・既知の技術負債・
      fontSize 走査の一覧＝7ファイルで151件・違反0件、app-shift.js を抜くと21件を数え落とす）、RULES.md（全表示セルの例外の場所）、
      shifty-e2e-verify の SKILL.md、`~/.claude/commands/bug-check.md` を追随

**申し送り**: `.claude/settings.json` の Stop フック（Auto-commit）は5ファイルを名指ししていて app-shift.js も含まない
（フックの対象を増やすかはユーザー判断待ちなので触っていない）。app-shift.js の変更は自分でコミットすること。
**本番反映で要るもの**: 次のリリースで `?v=` のバンプ（app-shift.js が新しく配信物に加わる）。ルール・CF・データ移行は無し。

### ✅ 🟡 労務・給与と複数法人 P5: 割増の計算（2026-09-30 develop 完了・`d88e1cc`〜`8ea5b27`／ルールと CF の変更なし）

**目的**: `労務給与_複数法人_実装計画.md` §4.1〜§4.4・§6 P5・決定 #3・#4・#5。詳細は CLAUDE.md の「割増の計算（P5）」の節。
- [x] 手計算の期待値のテスト（月またぎの週・12h 勤務・所定4hの日・休日ゼロ週・深夜 23:00〜25:00 の締）を `tests/core.test.js` に追加
- [x] B制に残業予定の行（トグルがオフでも①＋②）と月45h・年360h（年の4項目）の判定が出る（テスト・`example-labor-premium.js`）
- [x] 36協定の単月100h・複数月平均80h が法定休日労働を含める（`monthAgreementH`・`laborTotals.monthAgH`・テスト）
- [x] 労務確認パネルに該当日（`日の時間外n日（…）`・`週の時間外（…）`・`深夜n日`・`法定休日労働n日`・`月60h超`）。全データPDFにも載る
- 他店の実績は行き先の店の actuals を読めたときだけ合算し、読めない確定済みの期間があれば「＋」と注記（P3.6 の申し送り）
- 検証: `npm test` 476件パス・`npx eslint app-*.js` 0 errors（warnings 113＝P4 と同数）。`example-labor-premium.js` 18項目パス（WebKit の iPhone 13 でも通る。
  P5 より前の配信物では16項目が落ちる）。既存の回帰は3本を P5 に合わせて直し（ot-window の B制の行・phase2 の設定タブの注記・pdf-headcount の検出）、49本すべて通過
- 申し送り: app-admin.js は 399,977 字で 40万字の上限まで 23 字しかない。P6b・P7 で app-admin.js に足す前に分割が要る

### ✅ 🟡 労務・給与と複数法人 P4: 実績レイヤー（2026-09-30 develop 完了・`7520a55`〜`564ae08`／ルールは dev のみ反映済み・CF は本番未反映）

**目的**: `労務給与_複数法人_実装計画.md` §3.6・§4.1・§6 P4・決定 #8。詳細は CLAUDE.md の「実績」の節。
- [x] 確定済みの期間で「実績」切替が出て、差分のある日だけ `actuals` に保存される（`example-actuals.js`・未確定の期間とオーナーでない端末には出ない）
- [x] `resolveActualDay` が未入力日は確定値を返す（テスト。`aggregateScheduledMonth` の月の所定とも一致）
- [x] 欠勤・遅刻早退・法定休日フラグ（とメモ・休憩）が入力できる（詳細欄・`example-actuals.js`）
- [x] CSV 取込（日付・名前・出勤・退勤・休憩）で同じノードに書ける。名前は `resolveAlias`、列の位置は `settings.actualsCsv`（テスト・実ブラウザ）
- [x] ルールの REST 実測: 2026-09-30 に dev へ反映し `probe-rules-actuals.js` で22項目（非オーナーの読み・書き・差分 update・削除401・オーナー200・形の不正9種401・後始末）すべて期待どおり。既存の `probe-rules-confirm.js`（33項目）・`probe-rules-pay.js`（21項目）も再実行して非回帰
- 検証: `npm test` 467件パス・`npx eslint app-*.js` 0 errors（warnings 113＝既存111＋新しいコンポーネント2つの未使用判定。既存のコンポーネントと同じ扱い）。
  `example-actuals.js` 21項目パス（P4 より前の配信物では起動できず非0）。既存の回帰43本と関連5本もすべて通過。

### ✅ 🟡 労務・給与と複数法人 P3.6: ヘルプ先勤務の所属店舗への合算（2026-09-30 develop 完了・`a892d85`〜`bc60037`／ルール変更なし・CF は本番未反映）

**目的**: `労務給与_複数法人_実装計画.md` §3.9「ヘルプ先勤務の所属店舗への合算」・§6 P3.6・決定 #15。詳細は CLAUDE.md の「ヘルプ先勤務の所属店舗への合算」の節。
- [x] 所属店舗のシフト作成タブに他店勤務日が読み取り専用セル（出勤セル「→三17」・退勤セル「23」）で出て、月実働・週計・月計・週の休み・残業予定・労務判定表・PDF が合算後（`example-helper-aggregate.js`）
- [x] 行き先の店の `laborTotals` に入らず、総括が「所属店舗で判定」（同上）
- [x] 読めない他店があれば月実働・総括に「＋」と注記（`helperPersonOf` の unread・テスト。実ブラウザでは読み込み失敗を作れないので未検証）
- [x] `laborTotals`（実ブラウザ・他店を読み終えるまで書かない）／`laborMonths`（テスト・シフト作成タブと企業の確定の両方が `helperScheduleContext` を通す）の凍結値が合算後
- [x] 期間の切り方が違う2店舗（1か月と半月×2）でも日付で拾う（テスト・実ブラウザ）
- [x] 略称サフィックスを使わず2店舗で組んだ同一人物（写しの people で束なる）が合算され、同姓同名で personId が別の2人は合算されない（テスト・実ブラウザ）
- [x] 企業内登録スタッフに「重複候補」が出て、その場で統合でき、統合で写しの people が作り直される（`example-company-dup-candidates.js`）
- [x] 店長のセッション（企業コードのログインではない）で写し `shops/{sid}/company.people` から同一人物を引いて合算される（`example-helper-aggregate.js` は uid が企業uidでなく allLinkedShops も空）
- 検証: `npm test` 459件パス・`npx eslint app-*.js` 0 errors・上の2本は P3.6 より前の配信物で非0。既存の回帰（重複判定・企業・労務・PDF の22本）はすべて通過。
  `example-company-staff-directory.js` は所属店舗の注記を期待値に足した
- 置いた前提: 所属店舗は「同じ人の登録の staffHomeShop に明示された値が1つに決まる」ときだけ決まる（両方未設定は合算しない）。
  休みカウント表（1日休・半日休）と最大連勤は合算していない（計画の対象外）

### ✅ 🟡 労務・給与と複数法人 P3.5: 店舗別ルール4件（2026-09-30 develop 完了・`f97cb72`〜`a921796`／ルール変更なし・CF は本番未反映）

**目的**: `労務給与_複数法人_実装計画.md` §3.9・§6 P3.5。依頼文の数値はコードに書かず、すべて店舗（または属性）の設定・既定オフで入れる。
- [x] P3.5a 中休み（`settings.idleBreak`・**2026-10-02 に機能ごと削除**）と長さ方式のしきい値（`breakLength.basis`／`tiers`）。優先順は 上書き＞中休み＞長さ＞時間帯。
      `basis:"binding", tiers:[{overMin:360,breakMin:60,inclusive:true}]` で 17-23=60分・10-17=60分・10-15:59=0分、中休み（平日）で 10-22=120分、
      15-23 は長さ方式の60分、設定の無い店舗は 17-23=0分のまま（テストで固定）。休憩不足の判定は法定のまま。
      提出一覧の詳細で自動＝灰（中休み／長さ／時間帯）・手動＝太字、「自動に戻す」で `adjustedBreak` を消す
- [x] P3.5b B制の日ごとのしきい値超を「残業予定」に数値表示（`laborSettings.showDailyOverB`・`dailyOverThresholdMin`・既定オフ）。
      属性の按分窓 `staffTypeLimits[属性].otProrate={window:"month"|"halfMonth",fixedMin?}`（半月15h・実働15h未満はその値の按分をテストで固定）。
      企業共通・法人でも設定でき、CF の sanitize と一致を照合
- [x] P3.5c 判定対象外（区分 none）の実働がしきい値を**超える**日のセル色（`highlightExternalOver8h`・`externalOverThresholdMin`・既定オフ）。
      `LABOR_DAY_FIX_KEYS` に `externalOver`。色は専用の赤（`CELL_COLOR_LEGEND` の `externalOver`）。判定表・総括には載せない。ちょうど閾値は塗らない（テスト）
- [x] P3.5d PDF の曜日の下に「昼n 夜n」（`settings.headcountAt`・既定オフ）。応援・x の帯と休暇の帯を除外、0人の側と店休日は出さない。画面と Excel には出ない（テストと実ブラウザ）
- [x] 4件共通: 設定の無い店舗は従来と同じ（既存テスト・回帰スクリプトすべて通過）／`app-*.js` の追加行に依頼文の時刻・値のリテラルなし（grep）／企業ID・店舗名・shopId の分岐なし
- 検証: `npm test` 451件パス・`example-break-idle.js`・`example-labor-ot-window.js`・`example-labor-external-over.js`・`example-pdf-headcount.js`（いずれも allPass・変更前の配信物では非0で終わる）・既存回帰一式

### ✅ 🔴 労務・給与と複数法人 P3: 人×月の所定登録＋確定ロック＋交付記録（2026-09-30 develop 完了・`96458b6`〜／ルールは dev に反映・REST 実測済み・CF は本番未反映）

**目的**: `労務給与_複数法人_実装計画.md` §6 P3。確定した勤務表から人×月の所定を凍結し、確定・解除・交付を記録する。
- [x] 「確定」で `laborMonths/{YYYY-MM}/{名前}` に所定日数・所定時間を自動集計（1か月期間は確定と同時に凍結・半月運用は後半の確定で凍結）。確定前は手修正できる（10月分の遡り登録も同じ欄）
- [x] 確定後はシフト作成タブが編集不可（セル readOnly・保存/提出ボタンなし）。スタッフの再提出はルールで拒否（dev へ 46ba8dc のルールを反映し、`probe-rules-confirm.js` の32項目が ALL_OK＝匿名uidは未確定へ提出200・確定済みへの提出/付け替え/修正/削除401・オーナーは200・laborMonths は非オーナー401。P6a の `probe-rules-pay.js` も ALL_OK）
- [x] 確定・解除（理由つき）・交付・提出・再提出が `period.history` に残り（記録1件ずつのパスで書く）、提出状況表に「確定」「交付」列と履歴が出る
- [x] 労務判定表に「月所定/上限（差）」「年平均所定/分母（差）」（1か月の期間を実測。半月は月の全日で集計する既存の月実働と同じ経路）
- [x] 改名で `laborMonths` のキーが移る（クライアント・CF とも。テストで一致を照合）
- [x] 全データPDFに2行が載る（`example-labor-confirm.js` で PDF のテキストを実測）
- [x] 本部店舗の「固定勤務パターンを全日に投入」（土日祝・閉店日を除き、空いている日だけ）
- 検証: `npm test`（P3 のテスト14件を含む）・`example-labor-confirm.js`（28項目 allPass）・既存回帰スクリプト一式

### ✅ 🔴 app-admin.js の分割（Babel の 500KB 上限超過の解消）（2026-09-30 develop 完了・`8d271c8` `5bdc591`／ルール・CF の変更なし）

**目的**: app-admin.js が 50.8 万字（508,479 字）になり、Babel Standalone が変換時に
「[BABEL] Note: … exceeds the max of 500KB.」を console.error で出していた（本番の利用者のコンソールにも出る）。
P1b で E2E ハーネスがこの1文だけを無視するようにしていた。ユーザー承認の方針（企業連携まわりを新ファイルへ移し、
index.html で app-admin.js と app-main.js の間に読み込む）で解消する。

- [x] 新ファイル `app-company.js` に、賃金マスタ（PAY_OFF・PayCodeBox・PayCodeChangeModal・StaffPayPage）と企業連携タブ一式
      （CoLaborFields・HoursDecimalInput・CompanyConfigCard・CompanyEntityCard・EntityFilter・CompanyStaffCard／CompanyStaffDirectory・
      CompanyPersonEditModal／MergeModal・CompanySubmissionsCard・CompanyBulkPdf・CompanyLoginCard・CompanyTab）を**そのまま**移した。
      **それだけでは app-admin.js が 406,628 字で 40 万字を超えたので、直後に続く SetTab も移した**（企業設定の固定表示と
      HoursDecimalInput・minToH1 を使う）。結果 app-admin.js 356,698 字・app-company.js 152,520 字
- [x] 移動のコミット（`8d271c8`）は移動だけ。元の行 4383-4588 と 5239-7201 が app-company.js に同じバイト列で現れ、
      「元ファイル − 2塊（各塊の後ろの空行を含む）」が新しい app-admin.js とバイト一致（`git diff --stat`: app-admin.js −2171 行・app-company.js +2182 行。差は先頭の見出しコメントと塊の間の空行の分）
- [x] index.html: app-admin.js の直後・app-main.js の直前に app-company.js（同じ版数）。?v= は6箇所・読み込み順は utils→core→staff→admin→company→main
- [x] package.json の lint・eslint.config.js（files・sharedGlobals に CompanyTab／CompanyStaffDirectory・説明コメント）。lint 0 errors / 110 warnings（分割前と同数・警告の中身も同一）
- [x] tests/core.test.js: 管理者画面の実装を読む検査7本を app-admin.js＋app-company.js を連結して読む `_readAdminSurface` に通した。
      反証: app-company.js の写しに違反（別名の自前展開・スタッフ設定マップの直書き）を注入すると新しいテストは2件落ち、分割前のテストは0件（素通り）
- [x] mount-component.js の既定の読み込みと回帰スクリプト10本に app-company.js を足し、500KB Note の除外を外した。
      回帰39本すべて EXIT=0・console.error 0件。反証: 分割前の app-admin.js に向けると example-shift-edit-tab.js が EXIT=1（Note を数える）
- [x] 本物の index.html をスタブ Firebase で丸ごと起動する `example-index-html-load.js` を追加（読み込み順・版数・40万字以下・
      ログイン画面・企業連携／スタッフ／設定タブ・console.error 0件）。EXIT=0。反証: app-company.js の行を抜いた index.html では
      `ReferenceError: CompanyTab is not defined` で EXIT=1。あわせて実物の Firebase SDK（dev）で index.html をそのまま開き、ログイン画面まで console.error 0件
- [x] CLAUDE.md（ファイル構成・分割の仕組み・読み込み順・コンポーネント一覧のファイル列・既知の技術負債・fontSize 走査の一覧）、
      shifty-e2e-verify の SKILL.md、`~/.claude/commands/bug-check.md`（6分割・2-F の期待値・?v= の箇所数・eslint の対象）を追随。
      RULES.md には読み込み順の記述が無く変更なし。release-to-main.md は ?v= の箇所数を書いておらず `app-*.js` の glob なので変更なし

**申し送り**: `.claude/settings.json` の Stop フック（Auto-commit）は5ファイルを名指ししていて app-company.js を含まない
（設定の変更はこのタスクの範囲外なので触っていない）。app-company.js の変更は自動ではコミットされない。
**本番反映で要るもの**: 次のリリースで `?v=` のバンプ（app-company.js が新しく配信物に加わる）。ルール・CF・データ移行は無し。

### ✅ 労務・給与と複数法人 P2: 年間所定労働時間と月の所定上限（2026-09-30 develop 完了・`f02b4bb` `7a98b11` `ea6560a` `51288a4`／ルールの変更なし・CF は本番未反映）

計画書 `労務給与_複数法人_実装計画.md` §3.3・§6 P2（決定 #2・#3）。

- [x] `laborMonthFrame` が `scheduledCapMin` を返し、2,080h で 31/30/28日・うるう年2月 = 176:39／170:57／159:33／164:48（テスト・実ブラウザの表）
- [x] 目安が「所定上限 + 固定残業 − 余裕」になる（31日 199h／30日 193h／2月 182h）。未設定なら従来値（テスト・実ブラウザ）
- [x] 設定カード（店舗の設定タブ・企業の共通設定・法人の設定）に「年間所定労働時間」「1時間当たり賃金の分母」「週の起算」が入り、
      企業共通→法人の順で写しに焼かれる（`buildShopMirror` のテスト）。企業・法人が決めていれば店舗では固定表示になり、店舗の保存から剥がされる（実ブラウザ）
- [x] 既存テスト（S-1）が壊れない。未設定時に総枠・目安・上限が完全に同じ値であることを4か月×4通りの未設定で照合
- [x] `rateDenominatorMinOf` を「分母が0なら年間所定÷12 を0.1h単位で切り捨て、年間所定も無ければ 10398」に変更（2,080h → 10398）

回帰: `example-labor-annual.js`（25項目。反証: P2 前の配信物 `c51c3de` では21項目が落ちる）。既存の12本（company-settings・company-entities・
labor-phase1〜3・labor-limits・staff-pay・attr-order・labor-partial-month・pdf-labor・company-people・company-staff-directory）も EXIT=0。

置いた前提: 1日の延長上限が0（残業を前提にしない運用）のときの目安は、従来の「目安＝総枠」を「目安＝所定上限」に読み替えた
（年間所定を設定したときは総枠の役割を所定上限が担うため）。労務判定の「所定未満」（`guideStatusOf`）は総枠との比較のまま変えていない。
**2026-10-01 追記（F4）**: ひな型2026-10版に合わせ、年間所定を設定したときは「所定未満」を所定上限と、上限（`capMin`）を ROUNDDOWN(所定上限＋固定残業)＝206h と比べるように変えた（`monthlyCapMinFor`）。
`weekSplitAtMonthEdge` の UI は計画どおり作っていない（BACKLOG 相当・P5 で関数の引数として使う）。

**本番反映で要るもの**: CF の `saveCompanyConfig`・法人設定の保存（`sanitizeCompanySettings` が新キー4つを通すようになった）の本番デプロイ。
デプロイ前は企業・法人の画面で入れた年間所定・分母・週の起算が CF に捨てられる（店舗の設定タブでは効く）。データ移行は不要。

### ✅ 労務・給与と複数法人 P1b: 人物ID と企業スタッフ一覧の編集（2026-09-30 develop 完了・`a52a405` `6501627` `4a9c6b3` `ea385e4`／CF は本番未反映・ルールの変更なし）

計画書 `労務給与_複数法人_実装計画.md` §3.8・§6 P1b（決定 #13）。企業レベルに `companies/{id}/pub/people/{personId}` を上乗せし、店舗側の名前キーは変えない。

- [x] 初回に `people` が既存の推定から自動生成され、一覧の見た目が変わらない（テスト: 人物で束ねた行と推定だけの行が personId・links 以外で一致／
      実ブラウザ: 人物を作らせない対照と行が一致）。作るのは CF `ensureCompanyPeople`（計画書の `upsertPerson` にあたる）で、一覧を開いたときに1回呼ぶ
- [x] 「編集」から名前変更。店舗の `staff / subs（全件・3ヶ月の窓の外も） / settings / periods（snapshot・keepStaff・keepAttrs・laborTotals） / private/pay / people.links`
      が移る。CF の差分パッチを当てた結果がクライアントの `renameStaffInSettings / renameStaffInPeriods / renameStaffInPay` と一致することをテストで照合。
      `laborMonths / actuals` は未実装なので、足す担当（P3・P4）が `companyRenameStaff` に足す旨を関数のコメントと CLAUDE.md に残した
- [x] 2行を選んで統合・誤統合の解除。統合は店舗のデータを動かさない（実ブラウザで店舗の staff・番号が変わらないことを確認）。解除した登録は同期で再びまとまらない
- [x] personId は数字だけの番号ならその番号・それ以外は `p_`＋英数字8桁。別法人で番号が衝突した側だけ自動採番（テスト・実ブラウザ）。作成後は不変で、
      振り直しは「ID を番号に振り直す」だけ（`reassignPersonId`）
- [x] 従業員番号は法人内で一意（保存時に拒否。テストと実ブラウザ）
- [x] 一覧上部が「従業員番号順」「店舗別」「パスコード」の並び（P6a で実装済みのまま）

計画と変えた点: CF 名の `upsertPerson` は `ensureCompanyPeople` とした（人物を作る入口を1本にし、`ensureCompanyEntities` と同じ形にそろえた）。
属性・所属店舗の変更は、つながっている全店舗に同じ値を書く（StaffTab の「どの期間まで旧属性のままか」の確認は出さない）。
写し `shops/{sid}/company.people` への焼き込みは P3.6 の担当として今回は行っていない。

### ✅ 労務・給与と複数法人 P6a: 賃金マスタ・閲覧パスコード（2026-09-30 develop 完了・`65f7a49`〜`374e914`／ルールは dev のみ・CF は本番未反映）

計画書 `労務給与_複数法人_実装計画.md` §3.7・§6 P6a（決定 #6・#12・#17）。人ごとの時給・月給・手当を
`shops/{所属店舗}/private/pay/{名前}`（owners だけが読み書き）に持ち、4桁の閲覧パスコードで画面を伏せる。

- [x] スタッフタブ → 編集 → 「賃金設定を開く →」（Premium・オーナー・所属店舗のみ）で `StaffPayPage` が全画面で開き、「← 戻る」で編集モーダルに戻る
- [x] 月給／時給・諸手当（2つの除外フラグ）・固定残業（自動↔手修正）・固定深夜・通勤手当（日額／月額）・適用開始日が保存される
- [x] 社員は給与形態の切替と時給欄が無く `payType:"monthly"`。既定はパート・アルバイト=時給／企業属性=月給（テストと実ブラウザ）
- [x] 固定残業の自動計算 213,500÷173.3×1.25×30 = 46,199（テストと実ブラウザ）
- [x] 時給換算と最賃比較（時給 1,230 円 vs 最賃 1,231 円で赤・1,231 円で緑）。最賃は法人設定 `wageSettings.minWage`（P6a で P1 の法人設定に追加）
- [x] `private/pay` がオーナー以外から読めない・書けない（dev REST 20項目）。ヘルプ先では「賃金は所属店舗（◯◯）で設定します」
- [x] 改名・削除で `private/pay` が追随（`STAFF_KEYED_PRIVATE_NODES`・ドリフト検出テスト。わざと外した写しで落ちることを確認）
- [x] 改定は版を足す（適用開始日を変えた保存で `history` に積む）。過去の版は読み取り専用で折りたたみ表示
- [x] パスコード: 「スタッフ登録」の横の4桁ボックス・未設定は 0000・解除前は「••••」で編集不可・🔒／リロード／10分無操作で伏せ直す・5回失敗で60秒待ち（リロードでも待ちは続く）
- [x] 企業内登録スタッフの上部が「従業員番号順」「店舗別」「パスコード」、解除で「賃金」列。企業のパスコードは CF で全連携店舗へ同期（スタブで確認・CF 本体は本番未検証）
- [x] ハッシュは `auth != null` で読める場所に無い（`private` 配下と企業uid・作成者だけが読める `companies/*/private/payCode`。dev REST で非オーナー 401）

計画と変えた点: 解除状態は sessionStorage（`SS_PAY_UNLOCK`）ではなく App のメモリに持つ（リロードで伏せ直すため。失敗回数だけ sessionStorage）。
`crypto.subtle` の無い http の環境向けに SHA-256 の予備実装を足した（E2E ハーネスで実際に照合が通らなかった）。
残り: 割増率（`premiumRates`）・端数規則（`roundingRule`）の法人設定は P6b で足す（この画面は法定の率を表示するだけ）。

### ✅ 労務・給与と複数法人 P1: 法人レイヤー（2026-09-30 develop 完了・`6074b26` `d7feafa` `dc0ff72` `9d2a77b`／CF は本番未反映）

計画書 `労務給与_複数法人_実装計画.md` §3.1・§6 P1（決定 #7・#11）。企業の下に法人を置き、店舗は必ず1法人に属す。
正本は `companies/{id}/pub/{entities, shopEntities, defaultEntityId, shopKinds}`（CF 専用）。店舗は写しの
`entityId`・`entityName`・`kind` と、企業共通 → 法人 を重ねた `settings` を読む（クライアントの `applyCompanySettings` 系は無変更）。

- 移行: `syncCompanyMirror` が毎回 `planEntityMigration` を通し、法人の無い企業に企業名と同名の法人を作って全店舗を割り当てる。
  企業連携タブの法人カードが法人の無い企業で `ensureCompanyEntities` を1回呼ぶ。**既存の `pub/config.settings` は法人へ写さない**
  （計画書 §3.1 の「defaultEntity.settings に写す」とは違う。写すと企業の共通設定を後で変えても既定の法人の店舗に効かなくなるため、
  企業共通の層のまま残し、既定の法人は設定を持たない。写しの settings は移行前後で同じ＝テストと実ブラウザで確認）
- 本部店舗 `kind:"hq"` の正本は `pub/shopKinds`（CF `setShopKind`）。`global/shops/{sid}/kind` にも写すが、オーナーなら書け、
  クライアントの `saveShops` が店舗オブジェクトを丸ごと `set()` するので消えうる＝正本にしない（dev REST でオーナー PUT 200 を実測）
- 法人の設定の画面は労務設定だけ。属性別の制限の法人上書きは CF と重ね合わせは対応済みだが、入力欄は作っていない
- 法人の削除は作っていない（再着手条件: 法人を間違えて作った運用が出たとき。削除時は店舗を既定の法人へ戻す）
- 検証: `npm test` 390件・`example-company-entities.js` 25項目（375px 含む）・既存の回帰スクリプト35本すべて EXIT=0・dev REST 19項目


### ✅ 労務・給与と複数法人 P0: 休みコマンドを「/」に（2026-09-30 完了・`a77134a`）

計画書 `労務給与_複数法人_実装計画.md` §3.9・§6 P0（決定 #16）。`CELL_COMMANDS` の休み希望を
`key:"/"`・`aliases:["／"]` にし、`y`・`ｙ`・`休` は別名に残さず廃止した（打つとメモとして残る。案内トーストなし）。
`CELL_COLOR_LEGEND` の rest の説明と店舗略称の予約語エラー文も追随。

- [x] 半角 `/` と全角 `／` で休み扱い（テスト・`example-labor-phase3.js` で斜線と adminRest を実測）
- [x] `y`・`ｙ`・`休` では休みにならない（テスト・実ブラウザで `y` がメモになり斜線も adminRest も付かないことを実測）
- [x] 操作方法レジェンドの表記が `/`（テスト・実ブラウザでチップ `/` があり `y` が無いことを実測）
- [x] 他店舗略称に `/`・`／` を登録できない（`isReservedShopAbbr` のテスト）
- [x] CLAUDE.md・E2E スキルの記述が追随

`npm test` 383件パス・`npx eslint app-*.js` 0 errors 101 warnings。**保存データの移行は無い**
（休みは `adminRest`／`leaveTypes` に解決され、打った文字は保存されない）。
**リリース前の確認が1つ残る**: 本番の `shopAbbrs` に `/`・`／` を含む店舗が無いこと（計画書 §3.9。本番データは読んでいない）。

---

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
