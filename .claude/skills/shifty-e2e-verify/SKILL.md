---
name: shifty-e2e-verify
description: ShiftyをlocalhostでブラウザE2E検証する手順（Playwright MCP使用。占有時はClaude Previewフォールバック、Safari系はWebKitスクリプト）。「動作確認して」「実機確認」「ブラウザで確認」「E2Eで検証」と言われたとき、/bug-check や /shifty-feature の検証フェーズでUI変更を確認するとき、本番でのみ再現すると報告されたUI・スクロール・レイアウト系バグを調査するとき、preview_start が「Maximum 5 dev servers」で失敗したときやPlaywrightブラウザが他セッションに占有されているとき、**無人セッション（スケジュール実行）でdevサーバーの起動が拒否され「実機検証ができない」と結論しかけたとき（1.5節にサーバー無しで起動する手順がある。拒否されるのはdevサーバーであってブラウザ検証ではない）**、シフト作成グリッド・企業連携・ログイン等のフローをヘッドレスで操作する必要があるときに必ず使う。**スタッフ削除・期間削除のような破壊的操作を含む再現をやりたいが dev のテストデータを汚したくないとき、また「他端末が同時に変更したら」という2端末が要る状況を再現したいときは1.6節**（`scripts/mount-component.js` でコンポーネント1つだけを実ブラウザにマウントし `onSave` をスパイに差し替える。Firebaseへは1バイトも出ない）。単体テスト（npm test）では確認できないブラウザ挙動の検証はすべてこのスキルを経由する。**別セッションが同じ作業ディレクトリで並行編集中と伝えられたときのgit worktree隔離手順（0.5節）も持つ**ため、E2E検証に限らず実装作業の着手前に「並行作業中」「他チャットが編集中」等が話題に出たときも必ず参照する。
---

# Shifty E2E検証（localhost + Playwright MCP）

localhostは `DEV_MODE=true`（ホスト名自動判定）なので、接続先は常にdev Firebase（thirty-dev-b6958）。
本番データに触れる心配はないが、**devにテストデータが残る**ので、作ったアカウント・店舗名は最後にユーザーへ報告する。

## 0. 標準テスト店舗（毎回作り直さない・管理コードで即オーナー復帰）

dev Firebaseには**使い回す前提の標準テスト店舗**を置く。キッチン/ホール分割スタッフ（田中・佐藤｜鈴木・高橋）と期間（2026年7月前半）を持つ。検証のたびに新規作成・削除を繰り返さず、まずこれを再利用する。

- **現在の標準テスト店舗ID**: `eb6AfsQv4JAht+cX*xP7fuDa`（2026-07-09作成。「標準テスト店舗」名）
- **管理コード**: このファイルには書かない。**同じディレクトリの `.secrets.local`**（git追跡外）の `SHIFTY_TEST_ADMIN_CODE` を読む（`cat .claude/skills/shifty-e2e-verify/.secrets.local`）。下記「オーナー復帰」の手順で使う。dev専用の使い捨てテストデータの鍵ではあるが、**このSKILL.mdとscripts/は公開リポジトリで追跡している**ので、鍵だけは追跡外のファイルに置く
  - 別名登録の回帰テスト用フィクスチャ入り: `田中`の別名`たなか`で実提出済み（comment・7/1,7/2のシフトあり）、`鈴木`にsource:"grid"の管理者入力ダミーsubあり（提出状況一覧に出ないことの確認用）
- **閲覧のみでよい検証**（レイアウト確認・スタッフ画面の見た目など）: ログイン画面の「店舗コードで参加」にshopIdをそのまま貼り付ければ即バインドできる。オーナー権限は不要。
- **管理者としてデータを変更する検証**（スタッフ追加・シフト入力・設定変更など）が必要な場合は、下記「オーナー復帰」を必ず先に行う。

### オーナー復帰（毎回のClaude Preview/Playwrightの新しいブラウザセッションで必要）

**Claude Preview/Playwrightの新しいブラウザセッションはAnonymous Authのuidが前回セッションと一致しない**（`preview_start`はポートも毎回変わり、Firebase AuthのIndexedDBはoriginごと＝ポートごとに分離されるため、同じ物理マシン・同じ標準店舗でも実質的に「初めて訪れる端末」として扱われる）。そのため何もしなければ「この端末は管理者として登録されていません（閲覧のみ）」になるのが通常。

これは**管理コード（上記）を毎回「店舗名ボタン → コードで追加」に入力するだけで即座に解決する**（2026-07-09に実機検証済み：IndexedDB/localStorageを消して匿名uidを作り直した状態から、管理コードの入力だけでオーナー復帰できることを確認した）。手順:

```js
// 1. shopIdをCookieにセットしてバインド（閲覧のみの状態になる）
document.cookie = `ots_shopId=${encodeURIComponent("eb6AfsQv4JAht+cX*xP7fuDa")};path=/;SameSite=Lax`;
location.reload();

// 2. 管理者画面 → 店舗名ボタンをクリックしてメニューを開く → 「コードで追加」をクリックして
//    パネルを開く（window.promptではなくインラインのinput+ボタンなので注意。下記参照）
// 3. input[placeholder="店舗コードを貼り付け"] に管理コードをnative setterで入れて、
//    テキスト"追加"のボタンをクリック
```

「コードで追加」ボタンは`window.prompt`を使わない。クリックすると`shopCodeMode`パネルがトグル表示され、`placeholder="店舗コードを貼り付け"`のinputと`追加`ボタンが出る（app-admin.js）。ここに管理コードをそのまま入れて`追加`を押すと`owners/{今のuid}`に自己登録され、リロード不要でオーナー扱いになる。

**絶対にやってはいけない回避策**: adminKeyをFirebase MCP等の管理者権限で読み取り、それを`window.prompt`の上書き値やクライアント`preview_eval`のJSペイロードに埋め込んで自分をownersへ登録する／`realtimedatabase_set_data`で`shops/{shopId}/owners/{uid}`に直接書き込んで自分をオーナー化する、という自己付与は**セキュリティ上のバイパスとして自動モード分類器にブロックされる**（実際に2026-07-09に両方とも試みてブロックされた）。素直にブロックを受け入れること。上記の管理コード方式はこれとは異なり、アプリが公式にサポートする「別端末をオーナーに追加する」正規フローそのものであり、バイパスではない。

**それでも管理コードが効かない・紛失した等でオーナーになれないとき**: 同じ要件（キッチン/ホール分割スタッフ4名以上＋期間1件）で新しい店舗を作り直し、**作成直後に必ず設定タブ→「この端末の管理コード」を控えて**この節の「現在の標準テスト店舗ID」と「管理コード」を新しい値に更新すること（このファイル自体を編集する）。旧店舗は`realtimedatabase_set_data`で `/tokens/{urlToken}`→`/shops/{shopId}`→`/global/shops/{shopId}` の順にnullを書いて削除する（詳細は6節）。shopIdに`*`や`%`等の記号が含まれる場合、REST pathでは`%2A`・`%25`のように完全にpercent-encodeしないと400 Bad Requestになる。

## 0.5 別セッションが同じ作業ディレクトリで並行編集中のときのworktree隔離

`git status`で自分が触ろうとしているファイルに未コミットの変更があり、かつ「別セッションが並行作業中」と伝えられたときは、直接同じディレクトリで編集しない。相手の未コミットWIPを誤ってコミットに巻き込んだり、Editツールの内容不一致エラーを踏んだりする。

1. `git worktree add ../<わかりやすい名前> -b <feature-branch名> develop` で隔離した作業コピーを作る（`EnterWorktree`ツールは「ユーザーが明示的にworktreeと言った場合のみ」という制約があるため、これは素のBashで手動作成する）
2. worktree側で **`npm install` を必ず実行する**（`node_modules`はworktree間で共有されないため、`npx eslint`が`Cannot find module '@babel/eslint-parser'`で失敗する）
3. 編集・`npm test`・`npx eslint`はすべてworktree側で行う
4. **罠**: `preview_start`はlaunch.jsonをworktreeにコピーしても**常に元の（メインの）作業ディレクトリを配信する**（同じ`.claude/launch.json`の`shifty-server`定義がプロセス起点のディレクトリに紐づくため）。`curl http://localhost:PORT/app-admin.js`を実際のworktree/メイン両方のファイルと`diff`して必ず確認すること。ワークアラウンド: worktree内で`npx serve -s . -l <好きなport>`をバックグラウンド起動し、既存のpreview serverId（Playwrightが他セッションに占有されている場合の定番フォールバックと同じ仕組み）に対して`preview_eval`で`window.location.href="http://localhost:<port>/..."`を実行してタブをそのポートへ向け直す。以後の`preview_eval`/`preview_click`/`preview_screenshot`はそのserverIdのままworktree側の内容に対して使い続けられる（Claude Preview MCPはページのURLではなくserverId＝ブラウザタブに紐づくため）。ただしポートが変わるとFirebase Authの匿名uidも変わる点は0節を参照
5. 作業完了後、pushする前に必ず `git fetch origin develop && git rebase origin/develop`（並行セッションが自分の作業中にdevelopへpushしている可能性が高い）
6. `git push origin <feature-branch>:develop` で直接developへfast-forward pushする（メインディレクトリ側でdevelopをcheckoutしている別セッションのファイルには一切触れずに済む。mainへのpushは別途ユーザーの明示的な合図があるまで行わない）
7. 後片付け: `git merge-base --is-ancestor <feature-branch> origin/develop` で完全に取り込まれたことを確認してから `git worktree remove ../<名前>` と `git branch -D <feature-branch>`。メインディレクトリでは `git pull` や `git merge` を自分から行わない（他セッションが使用中の可能性があるため、`git fetch`のみに留める）

## 1. サーバー確保

まず `preview_start`（launch.jsonの `shifty-server`）を試す。
「Maximum 5 dev servers per folder reached」で失敗したら、他チャットのサーバーが同じ作業ツリーを配信しているのでポートを探して再利用する（静的サーバーなので編集は即反映される）:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -i node | awk '{print $9}' | sort -u
# 候補ポートに対して: curl -sL http://localhost:PORT/ | grep -o "<title>[^<]*"
# → 「shifty（シフティ）」が返るポートを使う
```

### 1.5 devサーバーがどうしても取れないとき（無人セッション）＝サーバー無しで起動する

スケジュール実行などの無人セッションでは `preview_start` が **必ず** 拒否される（「Dev servers can't be started from unattended sessions」）。他チャットのポートも無ければ上の手順は全滅する。

**それでもブラウザ検証はできる。devサーバーはブラウザ検証の必要条件ではない。**
Playwright の `route.fulfill` でローカルの配信物をディスクから直接返し、CDN と Firebase だけ実ネットワークへ通せば、アプリは丸ごと起動する。

```js
// Playwright本体はスキルのnode_modulesに既にある（npm install 不要・ブラウザ本体もキャッシュ済み）
import { chromium, webkit } from "/Users/hiroshi/.claude/skills/rendered-contrast-check/node_modules/playwright-core/index.mjs";
import { readFileSync, existsSync } from "node:fs";
const ROOT = "/Users/hiroshi/Documents/Claude Code/シフト作成アプリーshifty";
const ORIGIN = "http://localhost:3000"; // 実在しなくてよい（routeで横取りする）
const TYPES = {".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".json":"application/json",".svg":"image/svg+xml"};

const page = await (await (await chromium.launch()).newContext({viewport:{width:1400,height:900}})).newPage();
await page.route("**/*", route => {
  const url = new URL(route.request().url());
  if (url.origin !== ORIGIN) return route.continue();          // CDN・Firebaseは素通し
  let p = decodeURIComponent(url.pathname); if (p === "/") p = "/index.html";
  const f = ROOT + p;
  if (!existsSync(f)) return route.fulfill({status:404, body:"nf"});
  route.fulfill({status:200, contentType:TYPES[p.slice(p.lastIndexOf("."))]||"application/octet-stream", body:readFileSync(f)});
});
await page.goto(`${ORIGIN}/?plan=premium`, {waitUntil:"networkidle", timeout:60000});
```

これで `DEV_MODE=true`・`?plan=` の切替・`firebaseEnabled=true` が揃った状態で起動する（2026-08-22 バグチェック#90 で実測。コンソールエラー0件でログイン画面まで描画し、入力欄への打鍵・クリック・`getComputedStyle` 実測まで実行できた）。店舗バインドは 4.5節と同じく `addInitScript` で Cookie を入れる。

**Playwright MCP が `Browser is already in use` で落ちるときも、この直叩きは別プロセスなので通る。** Chromium と WebKit の両方が使える。

> **「拒否された」を「不可能」と読み替えないこと。** #78〜#89 の12回は、`preview_start` が拒否されたことを理由に「実機E2E不能」と申し送り続けたが、拒否されていたのは**手段（devサーバー）であって目的（ブラウザ検証）ではなかった**。道具は最初から手元にあった。据え置かれていたコントラスト実測（#72/#75/#76/#77）・タップ領域44px（#74）・`?plan=free` のUI確認（#77）は、この方法で無人のまま進められる。

### 1.6 部品1つだけを実ブラウザにマウントする（Firebaseを一切汚さずに破壊的操作を試す）

1.5節はアプリを丸ごと起動するので、**App() が Firebase に繋がり、検証のたびに dev の標準テスト店舗を実際に書き換える**。「スタッフを削除する」「期間を削除する」のような破壊的操作を含む再現をそこでやると、毎回テストデータを作り直すことになる。

**環境を用意するのではなく、副作用の出口だけ差し替えるほうが速くて安全。** `app-main.js` を読み込まなければ `firebaseDB` は `null` のままなので（app-core.js:53 は宣言だけで初期化しない）、**Firebase へは1バイトも出ない**。そのうえで `ShiftEditTab` や `StaffTab` を自前の親コンポーネントから直接 render し、`onSave` をローカルのスパイに差し替える。実ブラウザ・実React・実コンポーネントのままで、書き込みだけが起きない。

**毎回書き直さない。スキル同梱の `scripts/mount-component.js` を使う**（#91・#92・#93 で3回同じものを書き直したので関数化した）:

```js
const { openHarness } = require("/Users/hiroshi/Documents/Claude Code/シフト作成アプリーshifty/.claude/skills/shifty-e2e-verify/scripts/mount-component.js");

const h = await openHarness({
  waitFor: "select",              // マウント完了の判定に使うセレクタ
  jsx: `
    function Harness(){
      // 親が props を state で持つと、他端末の変更（期間削除・購読echo・並べ替え）を
      // window.__setX(...) でテスト側から注入できる ← #92・#93 はこれで2端末を1端末に畳んだ
      const [periods,setPeriods]=React.useState([PB,PA]);
      const [subs,setSubs]=React.useState([SUB_A,SUB_B]);
      window.__setPeriods=setPeriods;
      const onSave=v=>setSubs(prev=>{const next=(typeof v==="function")?v(prev):v;window.__subs=next;return next;});
      return <ShiftEditTab subs={subs} periods={periods} onSave={onSave} plan="premium" /* ...残りのprops */ />;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
  `,
});

await h.fill(h.cell("田中","2026-07-02","start"), "11");  // 入力→blur確定（グリッドはblurでsubsへ適用される）
await h.clickByText("保存");
console.log(await h.evaluate(()=>window.__subs), h.errors);
await h.close();
```

返り値: `page` / `errors`（pageerror・console errorを起動時から収集）/ `setInput` / `blur` / `fill` / `clickByText` / `cell(name,date,field)` / `evaluate` / `close`。
オプション: `engine:"webkit"`（Safari相当）・`viewport:{width:375,height:812}`（モバイル）・`scripts`（読み込むアプリファイル）・`root`（後述）・`headed:true`。

**必ず踏む罠が2つある。**

1. **`jsx` のトップレベルで React のフックを分割代入しない**。`const {useState}=React` と書くと app-staff.js が同名でグローバル宣言済みのため `Identifier 'useState' has already been declared` で**スクリプトごと落ちる**（画面は空のまま、原因は pageerror にしか出ない）。`React.useState(...)` の形で呼ぶ。`openHarness` はこのエラーを検出したらヒントを出す。
2. **`scripts` に `app-main.js` を足さない**。足すと App() がマウントされて Firebase に繋がり、この節の利点が消える（警告は出るが止めはしない）。アプリ全体を起動したいときは1.5節を使う。

**セレクタ**: シフト作成グリッドのセルは `data-sc="日付|start|end"` と `data-scn="名前"` を持つ（Enterでのフォーカス移動用に元から付いている属性で、検証用に足したものではない）。DOM構造に依存せず狙ったセルを掴めるので `h.cell()` がこれを組み立てる。

**動くサンプル兼リグレッションテスト**: `scripts/example-shift-edit-tab.js`（#93 の再現そのもの）。

```bash
node .claude/skills/shifty-e2e-verify/scripts/example-shift-edit-tab.js   # verdict.allPass=true / EXIT=0
```

**「素通りするテストではない」ことの確かめ方**（新しく再現を書いたら必ずやる）。`root`（または環境変数 `SHIFTY_ROOT`）で配信元を差し替えられるので、**修正前のコミットの配信物を置いたディレクトリに向けて同じスクリプトを流し、落ちることを確認する**:

```bash
S=<scratchpad>/prefix-<SHA>; mkdir -p $S
cp app-utils.js app-core.js app-staff.js $S/ && git show <修正前SHA>:app-admin.js > $S/app-admin.js
SHIFTY_ROOT=$S node .claude/skills/shifty-e2e-verify/scripts/example-shift-edit-tab.js   # EXIT=1 になるのが正しい
```

2026-08-24 実測: 修正後 `EXIT=0`、修正前（`62cbee8` の app-admin.js）`EXIT=1`（`step4_noLeak:false` ＝ 消えた期間の 2026-07-02 が期間Bのsubに現れる）。**この差が出ないテストは、何も検証していない。**

`root` はworktree隔離（0.5節）でも使える。1.5節の罠（`preview_start` は常にメインの作業ディレクトリを配信する）がそもそも発生しない。

### 1.7 アプリ全体は起動したいがdevを汚したくない（書き込みの発行を数える）

1.6節は「App()を読み込まない」ことで書き込みを止めるが、**App()全体が要る検証**（プラン境界・`#/demo`・タブ巡回・権限バナー）ではその手が使えない。
そのときは1.5節で起動したあと、`firebaseDB.ref` を差し替えて **`set`/`update`/`remove` を記録だけして `Promise.resolve()` を返す**。読みは素通しなので実データで描画したまま、**書き込みは1バイトも出ない**。

```js
await page.evaluate(() => {
  window.__writes = [];
  const db = eval("firebaseDB");           // Babel Standalone のトップレベル const は window に載らない（3節）
  const orig = db.ref.bind(db);
  db.ref = p => { const r = orig(p);
    ["set","update","remove"].forEach(m => { r[m] = (...a) => { window.__writes.push(m+" "+p); return Promise.resolve(); }; });
    return r; };
});
// …UI操作…
console.log(await page.evaluate(() => window.__writes));
```

`fbSet`/`fbUpd` の `DEMO_MODE` ガードより **下**（`ref()` の層）で捕まえるので、`.remove()` の直呼び（app-main.js の3箇所）も漏らさない。

**おまけに `__writes` は「その操作が本当に保存まで到達したか」の判定そのものになる。** 「トーストが出た」ではなく「どのパスへ何を発行したか」で修正前後をA/Bできる
（2026-08-26 バグチェック#98: Freeプランのテンプレ保存が修正前は `set shops/{sid}/templates` を発行、修正後は **0件**、pro/premiumは発行のまま＝非回帰、を1本のスクリプトで示した）。

**ゲートの検証はマウスだけで済ませない。** `pointerEvents:"none"` は**マウスしか止めない**——`disabled` でなければ Tab で到達し Enter で発火する。`document.elementFromPoint()` が対象ボタンではなく親DIVを返すことを確認しても、それは「クリックが届かない」の証明であって「押せない」の証明ではない。**`page.keyboard.press("Tab")` で到達できるか、`Enter` で実際に発火するかまで測る**（#98 の 🟡 はこれで見つかった。コードを読むだけなら「ゲートがある」で終わっていた）。

## 2. Playwrightツールをロード

ToolSearchで一括ロード（1回で済ませる）:
`select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_click,mcp__plugin_playwright_playwright__browser_evaluate,mcp__plugin_playwright_playwright__browser_type,mcp__plugin_playwright_playwright__browser_console_messages,mcp__plugin_playwright_playwright__browser_take_screenshot`

URLは `http://localhost:PORT/?plan=premium`（`?plan=free|pro|premium` でプラン切替。DEV_MODE時のみ有効）。

**Playwrightブラウザが他セッションに占有されているとき**（`Error: Browser is already in use for ~/Library/Caches/ms-playwright-mcp/...`）: 他チャットが同じMCPブラウザを掴んでいる。プロセスを殺さず、Claude Preview のツール群（`preview_eval` / `preview_click` / `preview_screenshot` 等。`preview_start` の返り値の serverId を使う）にフォールバックする。DOM検査・クリック・スクリーンショットは同等に使えるが、下記の制約が1つある。

**preview_eval環境の罠: `scrollTop`代入で scroll イベントが発火しない**。実ブラウザでは `el.scrollTop = 500` は scroll イベントを発火するが、preview_eval 経由では発火しない（リスナーを仕込んでも count 0 のまま）。このため「スクロール同期が動かない」ように見える偽陰性が出る — イベント不発をアプリのバグと結論しないこと。検証したいときは `el.dispatchEvent(new Event("scroll"))` を手動発火して React ハンドラの動作を確認するか、実スクロールが必要なら後述の WebKit/Playwright スクリプトで `mouse.wheel` を使う。

## 3. ページ操作の定石

**Reactのinputへの入力**（browser_typeが効かないグリッドセル等）は、native setter + input イベント + blur/focusout をevaluateで発火する:

```js
const setVal=(inp,val)=>{
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
  inp.focus(); setter.call(inp,val);
  inp.dispatchEvent(new Event("input",{bubbles:true}));
  inp.blur(); inp.dispatchEvent(new Event("focusout",{bubbles:true}));
};
```

**注意（focus→blurを別々のevaluate呼び出しに分けるとき）**: 上のように同一呼び出し内で完結させる分には問題ないが、「値を入れるステップ」と「blurして確定するステップ」を別々のevaluate呼び出しに分割すると、2回目の呼び出しで再取得した要素参照に対する`.blur()`がReactのonBlur合成イベントを発火しないことがある（DOM上は値が反映されて見えても、state更新やFirebase保存が一切走らない）。ブラウザ側のフォーカス状態が本物のactive elementになっていない可能性があるため。**blurは要素参照ではなく必ず`document.activeElement.blur()`で呼ぶ**と確実に発火する:

```js
// ステップ1（値を入れる。同一呼び出し内でfocus+値設定でOK）
inp.focus();
setter.call(inp,val);
inp.dispatchEvent(new Event("input",{bubbles:true}));

// ステップ2（別のevaluate呼び出しでもOK。ただしactiveElement経由にする）
document.activeElement.blur();
```

`preview_fill`のようなツールで値だけ入れて、blurを別途evaluateで発火する場合も同様に`document.activeElement.blur()`を使うこと。

**さらに重大な罠: `document.activeElement.blur()`自体がblur/focusoutイベントを発火しないことがある（preview_evalのバックグラウンドタブで顕著）**。`preview_eval`が操作しているタブはOSレベルのウィンドウフォーカスを持たない（`document.hasFocus()`が`false`）ことが多く、この状態では`.blur()`を呼ぶと`document.activeElement`は正しく`document.body`に変わる（＝一見成功したように見える）のに、`blur`イベントも、Reactが実際に購読している`focusout`イベントも一切発火しないケースがある。

症状が厄介なのは、**セルの表示値（DOM上の`input.value`）は更新されて「入力済み」に見えるのに、Reactの`onBlur`ハンドラ（＝Firebaseへの保存処理）が一度も呼ばれず、Firebase側のデータは無変更のまま**という点。スクリーンショットや`preview_snapshot`だけを見ていると「保存できた」と誤認しやすい。疑わしいときは`firebaseDB.ref(...).once("value")`で直接値を確認する、または以下でイベントの不発を直接検証する:

```js
let blurFired = false;
inp.addEventListener('blur', () => { blurFired = true; }, {once:true});
inp.focus();
document.activeElement.blur();
// blurFired が false のまま、activeElementだけはBODYに変わっている、というケースがある
```

対処は、`.blur()`の後に`focusout`イベントを**手動でdispatchする**こと（`bubbles:true`必須）。これを値のセット・`input`イベント発火・`blur()`・`focusout`のdispatchまで**すべて同一のevaluate呼び出し内で完結させる**のが最も確実（ステップを分けるほど再現しにくく、原因の切り分けも難しくなる）:

```js
const setVal=(inp,val)=>{
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
  inp.focus(); setter.call(inp,val);
  inp.dispatchEvent(new Event("input",{bubbles:true}));
  inp.blur();
  inp.dispatchEvent(new Event("focusout",{bubbles:true})); // これがないと保存されないことがある
};
```

**シフト作成グリッドのセル特定**: `input[data-sc="YYYY-MM-DD|start"]`（または `|end`）＋ `data-scn="スタッフ名"`。
blur確定後に集計・エラー判定が再計算されるので、入力→300〜1000ms待ってから検証する。

**スクロールコンテナ内のセルはCSSセレクタでのクリックが静かに失敗することがある**: メイングリッドは`overflowY:"auto", maxHeight:"70vh"`の内部スクロール領域（日付行が多いと画面外の行ができる）。画面外にあるセルをCSSセレクタでクリックすると「成功」と報告されても実際にはフォーカスが動かない。疑わしいときは`document.elementFromPoint(x,y)`で実際にその座標に何があるか確認する（ビューポート外なら`null`が返る）。対処は対象を`scrollIntoView()`してからクリックするか、そもそも座標クリックに頼らずJS上で`.focus()`→値設定→`document.activeElement.blur()`で完結させる。

**`computer`ツールのスクリーンショット座標クリックは実ビューポートとサイズが異なることがあり、静かに外れる**: 2026-07-12、期間作成プリセットボタンをスクリーンショット由来の座標で`computer left_click`したところ画面が無反応（Firebaseにも書き込まれず）だったが、`document.querySelector`で同じボタンを取得し`.click()`すると正常に動作した。原因はビューポート(例:1280×720)と返ってくるスクリーンショット画像(例:800×451)の解像度差。エラーは出ず「クリックした」というツール応答だけが返るため、これを「アプリ側の不具合」と誤認しやすい。ボタン押下等の重要な操作の検証で`computer left_click`後に画面上の変化が見られない場合は、アプリのバグと即断せず、まず`document.querySelector(...).click()`で同じ操作を再現できるか切り分けてから結論を出す。

**window.prompt/confirmを使うUI**（店舗作成・リネーム等）は、クリック前にevaluateで上書きする:
`window.prompt=()=>"テスト店舗名";`（ページ遷移・リロードで消えるので直前に仕込む）

**グローバル変数へのアクセス**: Babel Standaloneのトップレベル`const`（`firebaseDB`・`firebaseAuth`等）は`window`に載らないが、グローバルレキシカル環境にはあるので **`eval("firebaseDB")`** で取れる。dev Firebaseの直接読みに使える:

```js
const db=eval("firebaseDB");
db.ref("shops/{shopId}/subs").once("value").then(s=>...)
```

**evalのTDZ罠**: `const genToken = eval("genToken");` はエラーになる（eval内の名前解決が自分のローカルバインディング＝TDZ中の `genToken` を拾うため）。呼び出しごと評価する（`eval("genToken()")`）か、受ける変数名を変える。

**保存状態の検証**はlocalStorageでもできる:
`shift_{shopId}_settings_v6` / `_subs_v6` / `_periods_v6` / `shift_shops_v6`（店舗一覧）。

### 3.5 スタッフ提出画面を操作するときの罠（#99 で3回踏んだ）

**名前は blur では確定しない。** 名前カードの入力欄は `ni`（下書き）を持ち、`name`（本番の state）へ
移すのは **Enter キーか「確定」ボタン**だけ（app-staff.js:286・:295）。3節の native setter + `input`
イベントだけでは `ni` しか変わらないので、`name` を見る分岐（`SmModal` の `myName`・提出時の
`staffName`・氏名Cookie）はすべて**未入力のまま**動く。画面上は名前が入って見えるので偽陰性になる。

```js
// 値を入れる → 「確定」を押す、までで1セット
await page.evaluate(v=>{const i=[...document.querySelectorAll("input")].find(x=>x.placeholder==="お名前を入力");
  const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
  i.focus(); st.call(i,v); i.dispatchEvent(new Event("input",{bubbles:true}));}, "田中");
await page.evaluate(()=>[...document.querySelectorAll("button")].find(x=>x.innerText.trim()==="確定").click());
```

**確定したかの見分け方**: 入力欄が消えて名前が表示に戻る。`input[placeholder="お名前を入力"]` が
まだ DOM にあるなら確定していない。

**提出状況一覧を閉じたあと、同じページで名前カードをクリックしても編集に入れないことがある。**
「名前の状態を変えて一覧を開き直す」比較をしたいときは、同一ページで往復せず
**ケースごとに新しいページ（`context.newPage()`）で開き直す**のがいちばん速い。`ots_shopId` は
`addInitScript` で入れているのでページを作り直しても店舗バインドは維持される。

**提出の確定ボタンはテキスト完全一致で拾う。** 部分一致だと画面下部に常設の「シフトを提出する」が
先にヒットして、確認パネルの「提出する」を押せない（`x.innerText.trim()==="提出する"` と書く）。

## 4. よく使うフロー

- **初回はログイン画面**（Cookieなし）。「＋ 新規店舗を作成する」（prompt上書き必須）→ スタッフ画面 → 上部の「管理者画面」タブで管理者UIへ。
- **メール新規登録**: 設定タブ → アカウント連携 →「メールアドレスで続ける」→「新規登録」。`*-test@example.com` / 6文字以上のパスワードでdev Authに作成できる。実ログインはLOCAL永続化なのでリロード後も維持される。
- **複数店舗**: 店舗名ボタン▼ →「＋ 新規」。`allLinkedShops` はリロード時のPhase1でしか更新されないので、**店舗を追加したら一度リロード**してから企業連携・シフト作成の他店舗参照を検証する。
- **店舗切替直後の罠**: 切替後も periods 等のstateが前店舗の値を一瞬残すことがある。切替をまたぐ検証はリロードしてから行い、期間・スタッフが目的の店舗に本当に存在するかを `eval("firebaseDB")` で裏取りする。
- **同一タブ内で新規店舗作成/切替した直後は`sessionStorage.ss_apid`が古い期間IDのまま残る**: 症状は、Firebase上に正しいデータがあるのに提出件数などが0件・おかしい表示になる（例: スタッフ画面の「提出状況」バッジ）。原因はapp-main.jsの`SS_APID`復元ロジック（Phase3の`useEffect`）が「periodsの中に見つからなければ`apid`が空のときだけ`periods[0]`にフォールバックする」実装のため、別店舗の古い期間IDが`apid`に残っていても（空ではないので）上書きされない。ヘッダーの期間名表示自体は`ap = periods.find(...) || latestPeriod`という別のフォールバックで正しく見えてしまうため、`apid`自体が壊れていることに気づきにくい。対処: 同一タブ内で新規店舗作成・店舗切替を行った直後は、検証前に`sessionStorage.removeItem("ss_apid")`してから`location.reload()`する。

## 4.5 WebKit（Safari相当）での検証

ユーザーの実環境はMac＝Safariの可能性が高い。Chromiumで再現しないレンダリング・スクロール系の報告はWebKitでも確認する。Playwright MCPはChrome固定なので、scratchpadに素のPlaywrightを入れてスクリプトで回す:

```bash
cd <scratchpad> && npm init -y && npm install playwright && npx playwright install webkit
```

**インストールは基本いらない**（ネットワークと数分を使うだけ）。`/Users/hiroshi/.claude/skills/rendered-contrast-check/node_modules/playwright-core` を import すれば済み、WebKit のブラウザ本体も `~/Library/Caches/ms-playwright` に既にある（1.5節参照）。上の `npm install` は、そこに無かった場合の保険として残す。

店舗バインドはCookieで行う（ログインフロー再現は不要）。`ots_shopId` に **encodeURIComponent した shopId** を入れる（shopIdは `+` `&` `@` `=` を含む）:

```js
const { webkit } = require('playwright');
const page = await (await (await webkit.launch()).newContext({viewport:{width:1470,height:830}})).newPage();
await page.addInitScript(sid => { document.cookie = `ots_shopId=${encodeURIComponent(sid)};path=/;SameSite=Lax`; }, SID);
await page.goto("http://localhost:PORT/?plan=premium", {waitUntil:"networkidle"});
// 「管理者画面」→対象タブをlocator({hasText})でクリック → page.evaluate で計測
// 実スクロールは page.mouse.move(グリッド中央) → page.mouse.wheel(0, 600)（scroll イベントが本物どおり発火する）
```

要素の位置ズレ検証は目視でなく `getBoundingClientRect().top` の差分を全行分計測して数値で判定する（0.5px程度の恒常差は正常）。

## 5. 検証と証跡

- エラー確認は `browser_console_messages`（level: error）。Babelの precompile 警告1件は正常。
- 色・背景の検証は `getComputedStyle(el).backgroundColor` をevaluateで読む（スクリーンショット目視より確実）。
- 証跡スクリーンショットは `browser_take_screenshot` を **type: "jpeg"** で（pngはフォント待ちでタイムアウトすることがある）。保存先はリポジトリ直下になるので、**確認後に必ず削除**する（コミットに混ぜない）。
- トーストは2.5秒で消える。トースト文言の検証はクリック直後に行う。

**Claude Previewフォールバック時の罠: `preview_screenshot`が空白・古いスクロール位置の画像を返し続けることがある**。`preview_resize`や`window.scrollTo`/`scrollIntoView`を挟んでも改善せず、`preview_eval`で計測したスクロール位置(`window.scrollY`)は正しいのに撮れる画像だけがずれる/真っ白、というケースに複数回遭遇した。再試行やwaitを増やしても直らないことが多い。レイアウト検証（要素が横並びか縦並びか、位置関係が正しいか等）が目的なら、スクリーンショットに固執せず`preview_eval`で対象要素の`getBoundingClientRect()`を直接比較する方が確実で速い（例: 2要素が横並びなら`top`が同じで`left`が異なる、を数値で判定できる）。

**PDF出力（`exportPdf`/`html2canvas`方式）の中身を検証したいとき**: PDFは`renderBlock`が非表示div（`position:fixed;left:-30000px`）を`document.body.appendChild`→`html2canvas`でcanvas化→`jsPDF`で`pdf.save()`というブラウザダウンロードを行うため、生成後のPDFはバイナリでスクリーンショットや`get_page_text`では中身を読めない。`pdf.save()`のダウンロード自体を止める必要はなく（実害はないのでそのままでよい）、`document.body.appendChild`をフックしてhtml2canvasに渡される直前のHTML文字列を横取りするのが確実:

```js
window.__pdfBlocks = [];
const origAppend = document.body.appendChild.bind(document.body);
document.body.appendChild = function(node){
  if(node && node.style && node.style.left === "-30000px"){
    window.__pdfBlocks.push(node.innerHTML);
  }
  return origAppend(node);
};
// この後にUI操作でPDF出力ボタン（"シフト"/"全データ"等）を押すと
// window.__pdfBlocks[0] に実際のHTML文字列が入るので、
// .includes("期待するテキスト") や正規表現でセルの表示内容・背景色を直接assertできる
```

## 6. 終了時

1. **標準テスト店舗（0節）はそのまま残す**。中に追加したスタッフ・提出データも次回以降の再利用のために基本削除不要。0節を使わず個別に作った店舗・メールアカウント・期間・提出がある場合のみ**削除まで行い**、消したものをユーザーへ報告する
2. リポジトリに落ちた一時ファイル（スクリーンショット・`.playwright-mcp/`）を削除する
3. `git status` で意図しないファイルが混ざっていないか確認する

**テスト店舗の削除がクライアント権限で PERMISSION_DENIED になるとき**（owners/adminKey 配下はオーナー以外書けない）: Firebase MCP の管理権限で消す。`firebase_update_environment` で active_project を `thirty-dev-b6958` に切り替え、`realtimedatabase_set_data` に **databaseUrl: `https://thirty-dev-b6958-default-rtdb.firebaseio.com`**（デフォルト補完はregion違いで失敗する）を指定して、`/tokens/{urlToken}` → `/shops/{shopId}` → `/global/shops/{shopId}` の順に `null` を書く。urlTokenは削除前に periods から読み取っておく。**終わったら active_project を `ontheshift` に戻す**。

## 7. 「本番で再現する」と報告されたバグの前提確認

本番由来のバグ報告を調査するときは、コードを疑う前に配信状態を確認する:

```bash
curl -s "https://shiftyshifty.app/app-admin.js" -o /tmp/prod.js
git show origin/main:app-admin.js > /tmp/main.js && diff -q /tmp/prod.js /tmp/main.js
```

一致していれば「配信漏れ」は除外でき、localhost検証＝本番コードの検証になる（DEV_MODEはホスト名判定なので同一ファイルで成立）。GitHub Pagesは `max-age=600` だが、**デプロイ前から開きっぱなしのタブは再読み込みまで旧JSのまま動く**——修正済みの症状が報告されたら、まずタブの再読み込みを依頼する価値がある。
