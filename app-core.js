// ============================================================
// Shifty v6 - Firebase リアルタイム同期版 [build:20261008-4ce93f2]
// ============================================================
console.log("[Shifty] app.js loaded: build 20261008-4ce93f2");
const {useState,useEffect,useCallback,useRef,useMemo}=React;

// ============================================================
// ★ Firebase 設定 ★
// DEV_MODE はホスト名で自動判定する（手動切替による事故防止のため固定値にしない）。
// 本番カスタムドメイン(shiftyshifty.app)以外はすべて開発用Firebaseに接続する。
// ============================================================
const DEV_MODE = location.hostname !== "shiftyshifty.app";

// ============================================================
// ★ デモモード ★
// 広告等から来た未ログイン訪問者に、ログインさせずに完成形の管理画面を見せるための体験版。
// URLハッシュ #/demo で起動し、DEMO_SHOP_ID の店舗を直接読み込む。
// 訪問者の操作は fbSet/fbUpd の入口で握り潰すためFirebaseには一切保存されない
// （リロードで元に戻る＝荒らしが成立せず、本番データも汚れない）。
// shopId を URL から受け取らないのは、任意の店舗を第三者に閲覧させないため（固定値のみ許可）。
// ============================================================
const DEMO_SHOP_ID = DEV_MODE
  ? "ML2JUEd~eC8a2L=zbcKA=2h7"   // dev: 居酒屋 とり松（販促用デモ店舗）
  : "demo-toriMatsu-v1";          // 本番: devのとり松を複製したデモ店舗（owners空・adminKey設定済でclaim不可）
const DEMO_MODE = !!DEMO_SHOP_ID && /^#\/demo\/?$/.test(location.hash);

// ===== 従業員画面（マイシフト・給料・スタッフ個別URL・公開ボタン）の公開ゲート =====
// 2026-10-04 にユーザー指示で本番にも公開した（以前は = DEV_MODE で開発環境だけ）。
// 定数は残してある: false にすると入口・#/me・#/m/・公開ボタン・管理者側の承認 UI が一括で消える（緊急時の止め口）。
const MY_SCREEN_ENABLED = true;

const FIREBASE_CONFIG_PROD = {
  apiKey:            "AIzaSyDdl1Li3QduufAFhBWcF4nmOlFcCsx8zlQ",
  authDomain:        "ontheshift.firebaseapp.com",
  databaseURL:       "https://ontheshift-default-rtdb.firebaseio.com",
  projectId:         "ontheshift",
  storageBucket:     "ontheshift.firebasestorage.app",
  messagingSenderId: "29720860733",
  appId:             "1:29720860733:web:858670ff3a1db9b6287254", // 2026-10-08: プロジェクトに実在するウェブアプリ（App Check に登録したもの）。旧 ID のアプリはプロジェクトに無かった
  measurementId:     "G-P8RP0TG9JG"
};

// 開発用Firebaseプロジェクト（thirty-dev-b6958）
const FIREBASE_CONFIG_DEV = {
  apiKey:            "AIzaSyAR4TJRJytLge7jgei4xbKXHwUfU-nWEd0",
  authDomain:        "thirty-dev-b6958.firebaseapp.com",
  databaseURL:       "https://thirty-dev-b6958-default-rtdb.firebaseio.com",
  projectId:         "thirty-dev-b6958",
  storageBucket:     "thirty-dev-b6958.firebasestorage.app",
  messagingSenderId: "744273295072",
  appId:             "1:744273295072:web:eccfe72f92bbc948dc4285",
};

const FIREBASE_CONFIG = DEV_MODE ? FIREBASE_CONFIG_DEV : FIREBASE_CONFIG_PROD;
// ============================================================

// Firebase SDK の初期化
let firebaseDB = null;
let firebaseAuth = null;
let firebaseFunctions = null;
let firebaseEnabled = false;

// Firebase パス生成（店舗ID + キー）
function fbPath(shopId, key) { return `shops/${shopId}/${key}`; }

// PostHog イベント送信ヘルパー
function ph(event, props) {
  try { window.posthog && window.posthog.capture(event, props); } catch {}
}

// ===== Firebase書き込みの唯一の入口 =====
// firebaseDB.ref(path).set()/update() を直接呼ばず、必ずこの2つを経由する（eslintのno-restricted-syntaxで強制）。
// 目的は undefined 混入による同期例外の防止で、詳細は app-utils.js の sanitizeForSet を参照。
// 開発時（DEV_MODE）は現状どおり例外を投げて呼び出し元のバグを即座に露呈させ、本番では
// 除去して書き込みを通し、警告と計測イベントで発生を観測できるようにする（利用者のデータを失わせない）。
// strict を引数で受けるのは DEV_MODE を書き換えずに両分岐をテストできるようにするため。
// 戻り値は必ず Firebase の Promise をそのまま返す（呼び出し元が await/.then/.catch を自由に使えるように）。
function _fbGuard(path, found, strict) {
  if (!found.length) return;
  const msg = `undefined を含む書き込み: ${path} -> ${found.join(", ")}`;
  if (strict) throw new Error(msg);
  console.warn(msg);
  ph("write_undefined_stripped", { path, keys: found.slice(0, 5) });
}
function fbSet(path, val, strict = DEV_MODE) {
  // デモモードでは書き込みを行わない（UIは操作できるがローカルstateにしか反映されない）
  if (DEMO_MODE) return Promise.resolve();
  const { value, found } = sanitizeForSet(val);
  _fbGuard(path, found, strict);
  // eslint-disable-next-line no-restricted-syntax -- 書き込みの唯一の入口（ここだけは直接呼ぶ）
  return firebaseDB.ref(path).set(value);
}
function fbUpd(path, payload, strict = DEV_MODE) {
  // デモモードでは書き込みを行わない（fbSet と同じ理由）
  if (DEMO_MODE) return Promise.resolve();
  const { value, found } = sanitizeForUpdate(payload);
  _fbGuard(path, found, strict);
  // eslint-disable-next-line no-restricted-syntax -- 書き込みの唯一の入口（ここだけは直接呼ぶ）
  return firebaseDB.ref(path).update(value);
}
const dlog=(...a)=>{if(DEV_MODE)console.log(...a);};

// ===== ログイン試行制限（10回でロック・30分間）=====
const _LA_KEY="ots_login_attempts";
const _LL_KEY="ots_login_locked_until";
const _MAX_ATTEMPTS=10;
const _LOCK_MS=30*60*1000;
function _getAttempts(ns){try{return parseInt(localStorage.getItem(_LA_KEY+"_"+ns)||"0",10);}catch{return 0;}}
function _getLockUntil(ns){try{return parseInt(localStorage.getItem(_LL_KEY+"_"+ns)||"0",10);}catch{return 0;}}
function _isLocked(ns){return Date.now()<_getLockUntil(ns);}
function _lockRemaining(ns){return Math.max(0,_getLockUntil(ns)-Date.now());}
function _incAttempts(ns){
  try{
    const n=_getAttempts(ns)+1;
    localStorage.setItem(_LA_KEY+"_"+ns,String(n));
    if(n>=_MAX_ATTEMPTS) localStorage.setItem(_LL_KEY+"_"+ns,String(Date.now()+_LOCK_MS));
    return n;
  }catch{return 0;}
}
function _resetAttempts(ns){
  try{localStorage.removeItem(_LA_KEY+"_"+ns);localStorage.removeItem(_LL_KEY+"_"+ns);}catch{}
}
function _lockMsg(ns){
  const s=Math.ceil(_lockRemaining(ns)/1000);
  const m=Math.floor(s/60),r=s%60;
  return`ログイン試行回数が上限（${_MAX_ATTEMPTS}回）を超えました。${m}分${r}秒後に再試行できます`;
}

// ===== プランオーバーライド（URLパラメータ / DEV_MODE連動）=====
const DEV_PLAN_OVERRIDE = DEV_MODE
  ? (new URLSearchParams(location.search).get('plan') || null)
  : null;

// ===== localStorage ヘルパー =====
function lg(k,fb){try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch{return fb;}}
function ls(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}

const td=new Date(),tds=fd(td);

// ===== 初期データ =====
function makeShop(name="店舗1"){const now=new Date().toISOString();return{id:genSecureId(24),name,createdAt:now,lastActivity:now};}
function makeSettings(shopId){
  return{shopId,candidates:CAND_WEEKDAY,weekdayCandidates:{0:CAND_WEEKEND,6:CAND_WEEKEND},dateCandidates:{},templates:[],breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},staffAttributes:{},staffTypeLimits:{employee:{name:STAFF_TYPE_LABELS.employee,daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0},parttime:{name:STAFF_TYPE_LABELS.parttime,daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0}},overtimeSettings:{byStaff:{}},staffNumbers:{},shopAbbrs:[],shopAbbr2:null,staffWorkplaces:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
}

// ===== URL生成・解析 =====
function buildUrl(period){
  if(!period)return "";
  const token=period.urlToken||period.id;
  // スタッフURL: #/s/<token>
  // openExternalBrowser=1 はLINEのアプリ内ブラウザで開かれた際に外部ブラウザ（Safari/Chrome）を
  // 自動起動させるLINE公式パラメータ。他のブラウザ・アプリでは無視される（parseUrlはhashのみ参照）
  return`${window.location.origin}${window.location.pathname}?openExternalBrowser=1#/s/${token}`;
}

function parseUrl(){
  const h=window.location.hash;
  // デモURL: #/demo（下の「旧形式互換」より先に判定する。#/demo は #/ で始まるため）
  if(/^#\/demo\/?$/.test(h)) return{type:"demo"};
  // 従業員画面: #/me（下の「旧形式互換」より先に判定する。#/me は #/ で始まるため）
  if(MY_SCREEN_ENABLED&&isMyRouteHash(h)) return{type:"me"};
  // スタッフ個別URL: #/m/<pageToken>（2026-10-04）。ゲートの下だけ。本番では従来どおり旧形式のスタッフURL（トークン "m/…"）として扱われる
  if(MY_SCREEN_ENABLED){const pt=myPageRouteOf(h);if(pt!==null) return{type:"page",pageToken:pt};}
  // 管理者画面: #/admin（2026-10-05）。最初から管理者画面で開く。下の「旧形式互換」より先に判定する（#/admin は #/ で始まるため）
  if(isAdminRouteHash(h)) return{type:"admin"};
  // スタッフURL: #/s/<token>
  if(h.startsWith("#/s/")){
    const token=h.slice(4);
    if(token) return{type:"staff",token};
  }
  // 旧形式互換（#/<token> または #p=<token>）→ スタッフとして扱う
  if(h.startsWith("#/")&&!h.startsWith("#/s/")&&!h.startsWith("#/a/")){
    const token=h.slice(2);
    if(token) return{type:"staff",token};
  }
  if(h.startsWith("#p="))return{type:"staff",token:h.slice(3)};
  return null;
}

// ============================================================
// Cookie管理（端末ごとに独立した店舗を管理）
// ============================================================
function setCookie(name,value,days){
  const exp=new Date();exp.setDate(exp.getDate()+(days||365));
  document.cookie=`${name}=${encodeURIComponent(value)};expires=${exp.toUTCString()};path=/;SameSite=Lax`;
}
function getCookie(name){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const m=document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return m?decodeURIComponent(m[1]):null;
}
function delCookie(name){
  document.cookie=`${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}
const CK_SHOP="ots_shopId";   // 現在のアクティブ店舗ID（単一店舗のみ）
// スタッフ名Cookie。shopId は genSecureId 由来で "=" を含みうるため cookieSafeKey を通す
// （通さないとCookie名が最初の "=" で切られ、同じ店舗の全期間が1つのCookieを共有してしまう）
const ckStaffKey=(shopId,periodId)=>cookieSafeKey(`ots_staff_${shopId}_${periodId}`);

// リロード時の状態復元用セッションキー
const SS_SHOP="ss_shopId";
const SS_APID="ss_apid";
const SS_VIEW="ss_view";
const SS_TAB="ss_tab";
function ssGet(k,fb){try{const v=sessionStorage.getItem(k);return v!==null?v:fb;}catch{return fb;}}
function ssSave(k,v){try{if(v)sessionStorage.setItem(k,v);else sessionStorage.removeItem(k);}catch{}}

// ===== テーマ管理 =====
const THEME_KEY="ots_theme"; // "light" | "dark" | null（自動）
function applyTheme(pref){
  const root=document.documentElement;
  if(pref==="light"||pref==="dark"){root.setAttribute("data-theme",pref);}
  else{root.removeAttribute("data-theme");} // CSS media query に任せる
}
// 初回適用
applyTheme(lg(THEME_KEY,"light"));

// ===== Cloud Functions エンドポイント =====
const CF_BASE = DEV_MODE
  ? "https://asia-northeast1-thirty-dev-b6958.cloudfunctions.net"
  : "https://asia-northeast1-ontheshift.cloudfunctions.net";

// ===== 通知（Web Push・2026-10-08）=====
// VAPID の公開鍵（公開してよい値）。送る側の functions/notify.js の VAPID_PUBLIC_KEY_CF と同じ値（tests/notify.test.js が照合する）。
// 秘密鍵は Cloud Functions の Secret Manager（VAPID_PRIVATE_KEY）にだけある。dev（Spark）は CF が動かないので同じ鍵のままでよい
const PUSH_VAPID_PUBLIC_KEY = "BPnyDGWCQvzW2fBXzjwi4kIHpKmEAB--D93n8zIB1OSuNP_HAdiQ4jYp9br0Lc9O5QodfNq7nCOOrTPHCpgyhNo";

// ===== 管理キー（オーナー権限のcapability）=====
// shopIdはスタッフURLからも辿れるため管理権限の根拠にできない。
// 管理キーは管理者端末のlocalStorageのみに保存し、Firebaseルールの
// owners登録（shops/{shopId}/owners/{uid} = adminKey）の照合に使う。
const ADMIN_KEYS_LS="ots_adminKeys_v1";
function getAdminKeyLS(shopId){const m=lg(ADMIN_KEYS_LS,{})||{};return m[shopId]||null;}
function setAdminKeyLS(shopId,key){const m=lg(ADMIN_KEYS_LS,{})||{};m[shopId]=key;ls(ADMIN_KEYS_LS,m);}
// 管理者のセッションで開いている店舗のID一覧（2026-10-05）。次に開いたとき、Cookie の1店舗だけでなくこの一覧を戻す
// （sessionShopIdsToRestore）。shift_shops_v6 はスタッフURL・デモを開くと上書きされるので、こちらは管理者の経路だけが書く。
// 書くのは App の effect（店舗が1つ以上あるとき）、消すのはログアウト（doLogout・doFullSignOut）
const ADMIN_SHOPS_LS="ots_adminShops_v1";

// ホーム画面に追加したときのアイコンを URL で切り替える（2026-10-05）。iOS は「ホーム画面に追加」を押した時点の
// <link rel="apple-touch-icon"> を使うので、読み込み時とハッシュが変わったときに合わせておく。判定は homeIconKindOf
const HOME_ICONS={admin:{png:"favicon-180.png",svg:"favicon.svg"},staff:{png:"favicon-staff-180.png",svg:"favicon-staff.svg"}};
function applyHomeIcon(){
  try{
    const ic=HOME_ICONS[homeIconKindOf(parseUrl())];
    document.querySelectorAll('link[rel="apple-touch-icon"],link[rel="icon"][type="image/png"]').forEach(l=>{if(l.getAttribute("href")!==ic.png)l.setAttribute("href",ic.png);});
    document.querySelectorAll('link[rel="icon"][type="image/svg+xml"]').forEach(l=>{if(l.getAttribute("href")!==ic.svg)l.setAttribute("href",ic.svg);});
  }catch(e){console.warn("アイコンの切り替えに失敗:",e);}
}
// ホーム画面のアプリの開き先（homeManifestPlanOf）。スタッフ側のURLでは、iOS は manifest を外し（追加した時点の URL で開く）、
// 他の端末は開いているURLを start_url にした data: の manifest にする。要素ごと入れ替えるのは、href の書き換えだけだとブラウザが前の manifest を使い続けることがあるため。
// 最初の manifest は index.html の head のスクリプトが同じ規則で入れる（静的な link を置くと読み込み時に manifest.json を読まれうる）
const HOME_IOS=(()=>{try{return isIosLike(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);}catch{return false;}})();
function applyHomeManifest(){
  try{
    const plan=homeManifestPlanOf(parseUrl(),window.location.href,HOME_IOS);
    const cur=document.querySelectorAll('link[rel="manifest"]');
    if(plan.mode==="none"){cur.forEach(l=>l.remove());return;}
    const href=plan.mode==="data"?"data:application/manifest+json;charset=utf-8,"+encodeURIComponent(JSON.stringify(plan.manifest)):"manifest.json";
    if(cur.length===1&&cur[0].getAttribute("href")===href)return;
    cur.forEach(l=>l.remove());
    const l=document.createElement("link");l.setAttribute("rel","manifest");l.setAttribute("href",href);
    document.head.appendChild(l);
  }catch(e){console.warn("manifest の切り替えに失敗:",e);}
}
// ホーム画面から開いたときの保険（homeLaunchRestoreOf）。HOME_LAUNCH_CK はブラウザのタブで開いているスタッフ側のハッシュ、
// HOME_LAUNCH_LS はホーム画面のアプリ側で最初に決めた開き先（iOS のアプリは Safari と別の保存領域を持つ）
const HOME_LAUNCH_CK="ots_homeLaunch";
const HOME_LAUNCH_LS="ots_homeLaunch_v1";
function isStandaloneLaunch(){try{return navigator.standalone===true||(!!window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches);}catch{return false;}}
function rememberHomeLaunch(){
  try{
    if(isStandaloneLaunch())return;
    const h=window.location.hash;
    if(isHomeStaffHash(h))setCookie(HOME_LAUNCH_CK,h,365);
    else if(!h||parseUrl().type==="admin")delCookie(HOME_LAUNCH_CK);
  }catch(e){console.warn("開き先の記録に失敗:",e);}
}
// 起動時に1回（App が URL を読む前）。ホーム画面から開いてハッシュが無ければ、決めておいたスタッフ側のハッシュを付ける
(function restoreHomeLaunch(){
  try{
    if(!isStandaloneLaunch())return;
    const d=homeLaunchRestoreOf({hash:window.location.hash,cookieHash:getCookie(HOME_LAUNCH_CK)||"",saved:lg(HOME_LAUNCH_LS,null)});
    if(d.save!==undefined)ls(HOME_LAUNCH_LS,d.save);
    if(d.hash)history.replaceState(null,"",window.location.pathname+window.location.search+d.hash);
  }catch(e){console.warn("開き先の復元に失敗:",e);}
})();
function applyHomeLaunch(){applyHomeIcon();applyHomeManifest();rememberHomeLaunch();}
applyHomeLaunch();
window.addEventListener("hashchange",applyHomeLaunch);
window.addEventListener("popstate",applyHomeLaunch);

// 実ログイン（Google/メール）は端末にLOCAL永続化し、リロード後も複数店舗ログイン状態を維持する。
// ただし明示的なログアウト操作後は、Firebase Authに実ユーザーセッションが残っていても
// 次回起動時に自動復元しない（「新端末で自動ログインされる」旧バグの再発防止）。
// このフラグは doFullSignOut（Firebase Auth を含む完全サインアウト）だけが true にし、実ログイン成立時に false へ戻す。
// doLogout（店舗セッションだけのログアウト）は立てない（43166ab で外した）＝リロードで実ユーザーが復元され店舗に戻る。
const AUTH_LOGGED_OUT_LS="ots_authLoggedOut_v1";
// 管理コード（"shopId.adminKey"）のパース。2026-10-08 に店舗ID（旧「店舗コード」）だけの入力は廃止したので、
// adminKey が null なら呼び出し側が拒否する
function parseShopCode(raw){
  const t=(raw||"").trim();
  const i=t.indexOf(".");
  if(i<0)return{shopId:t,adminKey:null};
  return{shopId:t.slice(0,i),adminKey:t.slice(i+1)||null};
}

// ===== App Check（Fraud Defense＝旧 reCAPTCHA Enterprise）=====
// 本番のキーは Google Cloud の Fraud Defense で作った「shifty」（ドメイン shiftyshifty.app）。公開してよいサイトキー。
// Firebase コンソールの App Check に同じキーを登録してある前提。dev は空＝初期化しない（キーのドメインに localhost が無いため）。
// enforce はコンソール（RTDB）とコード（Cloud Functions）で別途行う。
const APP_CHECK_SITE_KEY = DEV_MODE ? "" : "6LdEdeQtAAAAAAE51pmPSKT7fajmv9wZhZjaags6";

// ===== 共通スタイル定数 =====
const AI={width:"100%",padding:"11px 14px",background:"var(--c-card)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none"};
const AB={padding:"10px 18px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:14,fontWeight:700,cursor:"pointer"};
// 削除ボタン。marginLeft は「破壊的操作だけ他のボタンから離す」ための余白（バグチェック#74）。
// 375px幅の実測で、削除は隣のボタンと4〜6pxしか離れていない場所が多かった。寸法そのものは
// 密度を優先して据え置き、取り返しのつかない操作だけ指1本ぶんの距離を確保する。
const AD={padding:"6px 11px",background:"rgba(255,71,87,.1)",border:"1px solid rgba(255,71,87,.25)",borderRadius:4,color:"#FF4757",fontSize:12,fontWeight:600,cursor:"pointer",marginLeft:10};
const AGray={padding:"10px 16px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text2)",fontSize:14,cursor:"pointer"};
