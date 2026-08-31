// ============================================================
// Shifty v6 - Firebase リアルタイム同期版 [build:20260831-27f8a76]
// ============================================================
console.log("[Shifty] app.js loaded: build 20260831-27f8a76");
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

const FIREBASE_CONFIG_PROD = {
  apiKey:            "AIzaSyDdl1Li3QduufAFhBWcF4nmOlFcCsx8zlQ",
  authDomain:        "ontheshift.firebaseapp.com",
  databaseURL:       "https://ontheshift-default-rtdb.firebaseio.com",
  projectId:         "ontheshift",
  storageBucket:     "ontheshift.firebasestorage.app",
  messagingSenderId: "29720860733",
  appId:             "1:29720860733:web:94aec772f4cddcb1287254",
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
  return{shopId,candidates:CAND_WEEKDAY,weekdayCandidates:{0:CAND_WEEKEND,6:CAND_WEEKEND},dateCandidates:{},templates:[],breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},staffAttributes:{},staffTypeLimits:{employee:{name:"社員",daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0},parttime:{name:"バイト",daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0}},overtimeSettings:{byStaff:{}},staffNumbers:{},shopAbbrs:[],staffWorkplaces:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
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

// ===== 管理キー（オーナー権限のcapability）=====
// shopIdはスタッフURLからも辿れるため管理権限の根拠にできない。
// 管理キーは管理者端末のlocalStorageのみに保存し、Firebaseルールの
// owners登録（shops/{shopId}/owners/{uid} = adminKey）の照合に使う。
const ADMIN_KEYS_LS="ots_adminKeys_v1";
function getAdminKeyLS(shopId){const m=lg(ADMIN_KEYS_LS,{})||{};return m[shopId]||null;}
function setAdminKeyLS(shopId,key){const m=lg(ADMIN_KEYS_LS,{})||{};m[shopId]=key;ls(ADMIN_KEYS_LS,m);}

// 実ログイン（Google/メール）は端末にLOCAL永続化し、リロード後も複数店舗ログイン状態を維持する。
// ただし明示的なログアウト操作後は、Firebase Authに実ユーザーセッションが残っていても
// 次回起動時に自動復元しない（「新端末で自動ログインされる」旧バグの再発防止）。
// このフラグはdoLogout/doFullSignOutでtrueにし、実ログイン成立時にfalseへ戻す。
const AUTH_LOGGED_OUT_LS="ots_authLoggedOut_v1";
// 店舗コード入力のパース: "shopId"（旧形式）または "shopId.adminKey"（管理コード）
function parseShopCode(raw){
  const t=(raw||"").trim();
  const i=t.indexOf(".");
  if(i<0)return{shopId:t,adminKey:null};
  return{shopId:t.slice(0,i),adminKey:t.slice(i+1)||null};
}

// ===== App Check（reCAPTCHA v3）=====
// Firebaseコンソールでアプリ登録・サイトキー発行後にキーを設定すると有効化される。
// 空文字の間は初期化をスキップする（enforce はコンソール側で別途操作）。
const APP_CHECK_SITE_KEY = DEV_MODE ? "" : "";

// ===== 共通スタイル定数 =====
const AI={width:"100%",padding:"11px 14px",background:"var(--c-card)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none"};
const AB={padding:"10px 18px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:14,fontWeight:700,cursor:"pointer"};
// 削除ボタン。marginLeft は「破壊的操作だけ他のボタンから離す」ための余白（バグチェック#74）。
// 375px幅の実測で、削除は隣のボタンと4〜6pxしか離れていない場所が多かった。寸法そのものは
// 密度を優先して据え置き、取り返しのつかない操作だけ指1本ぶんの距離を確保する。
const AD={padding:"6px 11px",background:"rgba(255,71,87,.1)",border:"1px solid rgba(255,71,87,.25)",borderRadius:4,color:"#FF4757",fontSize:12,fontWeight:600,cursor:"pointer",marginLeft:10};
const AGray={padding:"10px 16px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text2)",fontSize:14,cursor:"pointer"};
