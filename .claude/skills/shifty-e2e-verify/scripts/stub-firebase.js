// Firebase compat SDK（firebase-app / database / auth / functions）の差し替え。
//
// 1.6節のハーネスは app-main.js を読まないことで Firebase 接続を避けるが、**App() のクロージャの中に
// ある処理（ログイン・店舗切替・連携解除・3フェーズ初期化）はそれでは1行も実行できない**。
// このスタブを `extraHead` に入れると、app-main.js を読み込んでも実ネットワークへは出ず、
// メモリ上のRTDBに対して本物の App() が動く。DBと認証状態は localStorage に載せてあるので
// **page.reload() をまたいで残る**＝「サーバー側に残った状態でリロードする」再現に使える。
//
// 使い方:
//   const { makeStub } = require(".../stub-firebase.js");
//   const h = await openHarness({ extraHead: makeStub({seed, uid}), scripts:[...app-main.jsを含む...] });
//
// ページ側に置かれるもの:
//   window.__db(path)   … モックDBの値を読む（検証のアサーションに使う）
//   window.__dbDump()   … 全体のスナップショット
//   window.__cf         … httpsCallable の呼び出し記録 [{name,payload}]
//   window.__reads      … once() で読まれたパスの記録（どの店舗を読みに行ったかの確認に使う）
//
// 守備範囲の外: セキュリティルール（database.rules.json）は一切評価しない。Admin SDK と同じで
// 素通りするので、ルールの許可・拒否を確かめたいときは実クライアントか認証付きRESTで測る。
"use strict";
const fs = require("node:fs");
const path = require("node:path");
// functions/company-config.js をページへ埋め込む（CommonJS を即時関数で包む）。法人の CF の後始末に使う
const CFC_SRC = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "functions", "company-config.js"), "utf8");
// functions/staff-link.js（従業員画面の紐付け・E2）も同じく埋め込む。cfHandlers の "staffLink" が本物の計画関数を通す
const SLK_SRC = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "functions", "staff-link.js"), "utf8");
// functions/my-pay.js（従業員画面の会社設定の賃金・E6）。cfHandlers の "myPay" が本物の判定関数を通す
const MYP_SRC = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "functions", "my-pay.js"), "utf8");
// functions/my-page.js（スタッフ個別URLの暗証番号・2026-10-04）。cfHandlers の "myPage" が本物の判定関数を通す
const MYPG_SRC = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "functions", "my-page.js"), "utf8");

/**
 * @param {object} o
 * @param {object} o.seed        初期DB（JSONで埋め込む）
 * @param {string} o.uid         サインイン済みとして扱うuid（"company_XXX" なら企業ログインセッション）
 * @param {string} [o.view]      起動時の画面（既定 "admin"）
 * @param {string} [o.tab]       起動時の管理者タブ（既定 "periods"）
 * @param {object} [o.cfHandlers] Callable名 → "ok" | "reject:メッセージ" | "unlink" | "link" | "companyConfig" | "companyLogin:<companyId>" | "entity" | "people" | "payCode"（本物のCFと同じ後始末）
 *                                "people" は人物の7本（P1b: ensureCompanyPeople / mergePeople / splitPerson / reassignPersonId /
 *                                companyRenameStaff / companyUpdateStaff、統合しない: markPeopleDistinct）。規則は functions/company-config.js をそのまま使う。
 *                                "staffLink" は従業員画面の紐付けの2本（E2: approveStaffLink / unlinkStaff。個人リンクコードの
 *                                issueStaffLinkCode・redeemStaffLinkCode は 2026-10-05 に機能ごと削除）。判定と書く差分は functions/staff-link.js の
 *                                plan* をそのまま使う（呼び出し元の uid とメールは auth:"accounts" なら __authCur()、既定なら固定のユーザー）。
 *                                "pageLink" は linkStaffPage（専用URLのお店をアカウントに追加・2026-10-05）。planLinkStaffPage と planMyPagePin を通す。
 *                                "myPay" は getMyPay（E6）。呼び出し元の uid の staffLinks の名前で private/pay を読み、functions/my-pay.js の
 *                                myPayLinkNameCF・planGetMyPay をそのまま通す（名前は payload から受け取らない＝本物と同じ）。
 *                                "myPage" は myPagePin（スタッフ個別URLの給料の暗証番号・2026-10-04）。functions/my-page.js の myPageAccessCF・
 *                                planMyPagePin と my-pay.js の planGetMyPay をそのまま通す。ハッシュは app-utils.js の payCodeHash（index.js の
 *                                payCodeHashCF と同じ値）。staffPagePins/{token} に書く（試行回数も）。トランザクションは単純な読み書きで代える。
 *                                "pageEmail" は setPageEmail・recoverPageUrl（URLをなくしたとき用のメールアドレス・2026-10-04）。functions/my-page.js の
 *                                planSetPageEmailCF・planRecoverPageUrlCF をそのまま通し、送ろうとしたメールを window.__mails に積む（回数の制限は省く＝CF の検証の領分）。
 *                                "payCode" は setCompanyPayCode（P6a）。現在の番号を照合して企業と連携全店舗の private/payCode を書く。
 *                                "entity" は法人の6本（ensureCompanyEntities / createEntity / renameEntity / assignShopEntity /
 *                                saveEntityConfig / setShopKind）。移行と写しの組み立ては **functions/company-config.js をそのまま読み込んで**
 *                                使う（planEntityMigration・buildShopMirror）ので、CF と同じ規則で写しができる。
 * @param {boolean}[o.confirm]   window.confirm の戻り値（既定 true）
 * @param {string[]}[o.denyRead] once() を PERMISSION_DENIED で拒否するパス（前方一致）。ルールは評価しないので、
 *                                「オーナーでない店舗の actuals は読めない」のような拒否を再現するときに使う（P5）
 * @param {string[]}[o.holdOn]    on() の購読の配信（最初の値もその後の変化も）を止めておくパス（前方一致・2026-10-04）。once() は止めない＝
 *                              「購読がまだ届いていないが、読みにいけば読める」状態。ページの window.__releaseHold(path) で配信する。
 *                              window.__setDenyRead([...]) / window.__setDenyWrite([...]) で拒否するパスを途中で差し替えられる。
 * @param {string[]}[o.denyWrite] set/update/remove を PERMISSION_DENIED で拒否するパス（前方一致）。「ルールが未デプロイで
 *                                users/{uid} に書けない」を再現するときに使う（従業員画面 E1）
 * @param {string} [o.auth]      "accounts" にすると認証が本物に近い形になる（従業員画面 E1・2026-10-04）。既定は従来の
 *                                「uid 固定の実ユーザー1人」。accounts では、匿名サインイン（呼ぶたびに新しい uid）・
 *                                linkWithCredential（匿名の uid にメールを連結。uid は変わらない）・メールでのログイン・
 *                                signOut・パスワードの変更と再設定が、localStorage 上のアカウント表で動く。
 *                                ルールの代わりに **users/{uid} への書き込みは「その uid 本人で、メールのある認証」だけ**を通す
 *                                （database.rules.json の users/$uid/profile と同じ条件を真似たもの。ルールそのものは評価しない）。
 * @param {object} [o.authSeed]  accounts のときの初期状態 {users:{メール:{uid,password}}, cur:{uid,isAnonymous,email}|null, linkBlocked?}。
 *                                別の端末を再現するときは、1台目の __authDump().users と __dbDump() を2台目の authSeed・seed に渡す。
 *                                linkBlocked:true にすると linkWithCredential が auth/operation-not-allowed で拒否される（本番・dev の
 *                                メールアドレスの列挙保護の挙動。2026-10-04 に本番で発生した不具合 4163394 の回帰用）
 *                                emailLink: メール確認つきの新規登録（2026-10-04）。"on" で sendSignInLinkToEmail が通る（リンクは
 *                                __authDump().links に残り、window.__emailLinkUrl(i) が開く URL を返す）。省略（既定）は dev・本番の
 *                                コンソール設定前と同じく auth/operation-not-allowed、"domain" は auth/unauthorized-continue-uri。
 *                                links: 別のブラウザを再現するとき1台目の __authDump().links を渡す。failUpdatePassword: n で
 *                                updatePassword を n 回 auth/network-request-failed にする。expireLinks:true でリンクを期限切れ扱い
 */
function makeStub(o) {
  const seed = o.seed || {};
  const uid = o.uid;
  const view = o.view || "admin";
  const tab = o.tab || "periods";
  const cfHandlers = o.cfHandlers || {};
  const confirmValue = o.confirm === undefined ? true : !!o.confirm;
  const denyRead = Array.isArray(o.denyRead) ? o.denyRead : [];
  const denyWrite = Array.isArray(o.denyWrite) ? o.denyWrite : [];
  const holdOn = Array.isArray(o.holdOn) ? o.holdOn : [];
  const authMode = o.auth || "simple";
  const authSeed = o.authSeed || { users: {}, cur: null };

  return `<script>
(function(){
  var LS_DB="__stub_fdb", LS_AUTH="__stub_fauth";
  var SEED=${JSON.stringify(seed)};
  var CFC=(function(){var module={exports:{}};var exports=module.exports;${CFC_SRC}
;return module.exports;})();
  var SLK=(function(){var module={exports:{}};var exports=module.exports;${SLK_SRC}
;return module.exports;})();
  var MYP=(function(){var module={exports:{}};var exports=module.exports;${MYP_SRC}
;return module.exports;})();
  var MYPG=(function(){var module={exports:{}};var exports=module.exports;${MYPG_SRC}
;return module.exports;})();
  var CF=${JSON.stringify(cfHandlers)};
  var DENY_READ=${JSON.stringify(denyRead.map(d => String(d).split("/").filter(Boolean).join("/")))};
  var DENY_WRITE=${JSON.stringify(denyWrite.map(d => String(d).split("/").filter(Boolean).join("/")))};
  var HOLD_ON=${JSON.stringify(holdOn.map(d => String(d).split("/").filter(Boolean).join("/")))};
  var _np=function(p){ return String(p).split("/").filter(Boolean).join("/"); };
  var held=function(p){ var np=_np(p); return HOLD_ON.some(function(d){ return np===d||np.indexOf(d+"/")===0; }); };
  window.__setDenyRead=function(a){ DENY_READ=(a||[]).map(_np); };
  window.__setDenyWrite=function(a){ DENY_WRITE=(a||[]).map(_np); };
  window.__holdPending=function(p){ var np=_np(p); return HOLD_ON.indexOf(np)>=0; };
  var AUTH_MODE=${JSON.stringify(authMode)};
  var AUTH_SEED=${JSON.stringify(authSeed)};
  var root=null;
  try{ root=JSON.parse(localStorage.getItem(LS_DB)||"null"); }catch(e){}
  if(!root){ root=SEED; localStorage.setItem(LS_DB, JSON.stringify(root)); }
  var save=function(){ localStorage.setItem(LS_DB, JSON.stringify(root)); };
  window.__db=function(p){ return getPath(p); };
  window.__dbDump=function(){ return JSON.parse(JSON.stringify(root)); };

  var norm=function(p){ return String(p).split("/").filter(function(s){return s.length;}); };
  function getPath(p){
    var n=root, ks=norm(p);
    for(var i=0;i<ks.length;i++){
      if(n===null||typeof n!=="object") return null;
      n=n[ks[i]];
      if(n===undefined) return null;
    }
    return n===undefined?null:n;
  }
  // Firebase は空オブジェクトのノードを保持しない（子キーが全部消えたら親ごと消える）
  function prune(o){
    Object.keys(o).forEach(function(k){
      var v=o[k];
      if(v===null||v===undefined){ delete o[k]; return; }
      if(typeof v==="object"){ prune(v); if(Object.keys(v).length===0) delete o[k]; }
    });
  }
  function setPath(p,v){
    var ks=norm(p);
    if(!ks.length){ root=(v==null?{}:v); prune(root); save(); return; }
    var n=root;
    for(var i=0;i<ks.length-1;i++){
      if(n[ks[i]]===null||typeof n[ks[i]]!=="object") n[ks[i]]={};
      n=n[ks[i]];
    }
    if(v===null||v===undefined) delete n[ks[ks.length-1]];
    else n[ks[ks.length-1]]=JSON.parse(JSON.stringify(v));
    prune(root); save();
  }

  // 書き込みの拒否（denyWrite と、auth:"accounts" のときの users/{uid} の本人・メール認証の条件）
  function writeDenied(p){
    var np=norm(p).join("/");
    var deny=function(){ var err=new Error("PERMISSION_DENIED: Permission denied"); err.code="PERMISSION_DENIED"; (window.__denied=window.__denied||[]).push(np); return err; };
    if(DENY_WRITE.some(function(d){ return np===d||np.indexOf(d+"/")===0; })) return deny();
    if(AUTH_MODE==="accounts"&&(np==="users"||np.indexOf("users/")===0)){
      var segs=np.split("/"), cu=window.__authCur&&window.__authCur();
      if(!cu||cu.isAnonymous||!cu.email||segs[1]!==cu.uid) return deny();
    }
    return null;
  }
  var listeners=[], pushSeq=0;
  function snap(v,key){
    return {
      val:function(){ return v===undefined?null:v; },
      exists:function(){ return v!==undefined&&v!==null; },
      key:key||null,
      numChildren:function(){ return (v&&typeof v==="object")?Object.keys(v).length:0; },
      forEach:function(f){ if(v&&typeof v==="object") Object.keys(v).forEach(function(k){ f(snap(v[k],k)); }); },
    };
  }
  function applyQuery(v,q){
    if(!q||!q.orderBy||!("equalTo" in q)) return v;
    if(!v||typeof v!=="object") return null;
    var out={}, any=false;
    Object.keys(v).forEach(function(k){
      if(v[k]&&v[k][q.orderBy]===q.equalTo){ out[k]=v[k]; any=true; }
    });
    return any?out:null;
  }
  // 実 Firebase と同じく、value イベントは**その listener が見ているデータが変わったときだけ**届ける（2026-10-04）。
  // 以前はどこへの書き込みでも全 listener を呼んでいたため、同じ値の書き込み（App の tokens の補完など）が
  // periods の listener を呼び直し、subs の配列が作り直され続ける描画のループになっていた（S3 の計算待ちが終わらない）
  function notify(){
    listeners.slice().forEach(function(e){
      setTimeout(function(){
        if(listeners.indexOf(e)<0) return;
        if(held(e.path)) return;
        var v=applyQuery(getPath(e.path),e.query);
        var j=JSON.stringify(v===undefined?null:v);
        if(e.last===j) return;
        e.last=j; e.cb(snap(v));
      },0);
    });
  }
  // holdOn で止めていた購読に、いまの値を配信する（最初の値を含む）
  window.__releaseHold=function(p){ var np=_np(p); HOLD_ON=HOLD_ON.filter(function(d){ return d!==np; }); listeners.slice().forEach(function(e){ if(held(e.path)) return; if(_np(e.path)!==np&&_np(e.path).indexOf(np+"/")!==0) return; setTimeout(function(){ if(listeners.indexOf(e)<0) return; var v=applyQuery(getPath(e.path),e.query); e.last=JSON.stringify(v===undefined?null:v); e.cb(snap(v)); },0); }); };
  function refFor(p,q){
    var ks=norm(p);
    return {
      key: ks.length?ks[ks.length-1]:null,
      toString:function(){ return "stub://"+p; },
      child:function(c){ return refFor(p+"/"+c); },
      once:function(){
        if(p===".info/connected") return Promise.resolve(snap(true));
        (window.__reads=window.__reads||[]).push(p);
        var np=norm(p).join("/");
        if(DENY_READ.some(function(d){ return np===d||np.indexOf(d+"/")===0; })){
          var err=new Error("PERMISSION_DENIED: Permission denied"); err.code="PERMISSION_DENIED"; return Promise.reject(err);
        }
        return Promise.resolve(snap(applyQuery(getPath(p),q)));
      },
      on:function(ev,cb){
        if(p===".info/connected"){ setTimeout(function(){ cb(snap(true)); },0); return cb; }
        var ent={path:p,cb:cb,query:q,last:undefined};
        listeners.push(ent);
        setTimeout(function(){ if(listeners.indexOf(ent)<0||held(p)) return; var v=applyQuery(getPath(p),q); ent.last=JSON.stringify(v===undefined?null:v); cb(snap(v)); },0);
        return cb;
      },
      off:function(){ for(var i=listeners.length-1;i>=0;i--) if(listeners[i].path===p) listeners.splice(i,1); },
      set:function(v){ var d=writeDenied(p); if(d) return Promise.reject(d); setPath(p,v); notify(); return Promise.resolve(); },
      update:function(o){ var d=writeDenied(p); if(d) return Promise.reject(d); Object.keys(o||{}).forEach(function(k){ setPath(p+"/"+k,o[k]); }); notify(); return Promise.resolve(); },
      remove:function(){ var d=writeDenied(p); if(d) return Promise.reject(d); setPath(p,null); notify(); return Promise.resolve(); },
      push:function(v){
        var id="-Stub"+(++pushSeq);
        if(v!==undefined) setPath(p+"/"+id,v);
        var cr=refFor(p+"/"+id);
        var pr=Promise.resolve(cr);
        Object.keys(cr).forEach(function(k){ pr[k]=cr[k]; });
        pr.key=cr.key;
        return pr;
      },
      orderByChild:function(k){ var nq={}; if(q) Object.keys(q).forEach(function(x){nq[x]=q[x];}); nq.orderBy=k; return refFor(p,nq); },
      equalTo:function(v){ var nq={}; if(q) Object.keys(q).forEach(function(x){nq[x]=q[x];}); nq.equalTo=v; return refFor(p,nq); },
      limitToLast:function(){ return refFor(p,q); },
    };
  }

  var USER={
    uid:${JSON.stringify(uid)}, isAnonymous:false, email:"owner@example.com",
    displayName:"オーナー", providerData:[{providerId:"password"}],
    getIdToken:function(){ return Promise.resolve("stub-id-token"); },
    reload:function(){ return Promise.resolve(); },
  };
  var signedIn;
  try{ signedIn=JSON.parse(localStorage.getItem(LS_AUTH)||"null"); }catch(e){}
  if(signedIn===null){ signedIn=true; localStorage.setItem(LS_AUTH,"true"); }

  var authObj={
    setPersistence:function(){ return Promise.resolve(); },
    onAuthStateChanged:function(cb){ setTimeout(function(){ cb(signedIn?USER:null); },0); return function(){}; },
    signInAnonymously:function(){ return Promise.resolve({user:{uid:"anon",isAnonymous:true}}); },
    signOut:function(){ signedIn=false; localStorage.setItem(LS_AUTH,"false"); return Promise.resolve(); },
    signInWithPopup:function(){ return Promise.resolve({user:USER}); },
    signInWithCustomToken:function(){ return Promise.resolve({user:USER}); },
    signInWithEmailAndPassword:function(){ return Promise.resolve({user:USER}); },
    createUserWithEmailAndPassword:function(){ return Promise.resolve({user:USER}); },
    sendPasswordResetEmail:function(){ return Promise.resolve(); },
  };
  Object.defineProperty(authObj,"currentUser",{get:function(){ return signedIn?USER:null; }});

  // ===== auth:"accounts"（従業員画面 E1）=====
  // localStorage にアカウント表と現在のユーザーを持つ。page.reload() をまたいで残る（DB と同じ）
  if(AUTH_MODE==="accounts"){
    var LS_ACC="__stub_facc";
    var acc=null;
    try{ acc=JSON.parse(localStorage.getItem(LS_ACC)||"null"); }catch(e){}
    if(!acc){ acc={users:JSON.parse(JSON.stringify(AUTH_SEED.users||{})),cur:AUTH_SEED.cur||null,seq:0,resets:[],links:JSON.parse(JSON.stringify(AUTH_SEED.links||[])),failPw:Number(AUTH_SEED.failUpdatePassword)||0}; localStorage.setItem(LS_ACC,JSON.stringify(acc)); }
    if(!acc.links) acc.links=[];
    var saveAcc=function(){ localStorage.setItem(LS_ACC,JSON.stringify(acc)); };
    var aerr=function(code){ var e=new Error("Firebase: Error ("+code+")."); e.code=code; return e; };
    var EMAIL_RE=/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;  // テンプレート文字列の中なのでバックスラッシュは2つ
    var userObj=null;
    var mkUser=function(){
      if(!acc.cur) return null;
      var c=acc.cur;
      if(!userObj||userObj.uid!==c.uid){
        userObj={
          getIdToken:function(){ window.__tokenRefreshes=(window.__tokenRefreshes||0)+1; return Promise.resolve("stub-id-token-"+acc.cur.uid); },
          reload:function(){ return Promise.resolve(); },
          linkWithCredential:function(cred){
            window.__linkAttempts=(window.__linkAttempts||0)+1;
            // 列挙保護が有効なプロジェクト: 匿名 uid へのメールの連結は「新しいメールを確認してから」と拒否される
            if(AUTH_SEED.linkBlocked) return Promise.reject(aerr("auth/operation-not-allowed"));
            if(!acc.cur||!acc.cur.isAnonymous) return Promise.reject(aerr("auth/provider-already-linked"));
            if(!EMAIL_RE.test(cred.email||"")) return Promise.reject(aerr("auth/invalid-email"));
            if(acc.users[cred.email]) return Promise.reject(aerr("auth/email-already-in-use"));
            if(String(cred.password||"").length<6) return Promise.reject(aerr("auth/weak-password"));
            acc.users[cred.email]={uid:acc.cur.uid,password:cred.password};
            acc.cur={uid:acc.cur.uid,isAnonymous:false,email:cred.email}; saveAcc(); sync();
            return Promise.resolve({user:userObj});
          },
          reauthenticateWithCredential:function(cred){
            var u=acc.cur&&acc.users[acc.cur.email];
            if(!u||u.password!==cred.password) return Promise.reject(aerr("auth/wrong-password"));
            return Promise.resolve({user:userObj});
          },
          updatePassword:function(pw){
            window.__pwUpdates=(window.__pwUpdates||0)+1;
            if(acc.failPw>0){ acc.failPw--; saveAcc(); return Promise.reject(aerr("auth/network-request-failed")); }
            if(String(pw||"").length<6) return Promise.reject(aerr("auth/weak-password"));
            acc.users[acc.cur.email].password=pw; saveAcc(); return Promise.resolve();
          },
        };
      }
      sync();
      return userObj;
    };
    var sync=function(){
      if(!userObj||!acc.cur) return;
      userObj.uid=acc.cur.uid; userObj.isAnonymous=!!acc.cur.isAnonymous; userObj.email=acc.cur.email||null;
      userObj.displayName=null; userObj.providerData=acc.cur.isAnonymous?[]:[{providerId:"password",email:acc.cur.email}];
    };
    window.__authCur=function(){ return acc.cur; };
    window.__authDump=function(){ return JSON.parse(JSON.stringify(acc)); };
    authObj={
      setPersistence:function(){ return Promise.resolve(); },
      onAuthStateChanged:function(cb){ setTimeout(function(){ cb(mkUser()); },0); return function(){}; },
      signInAnonymously:function(){ acc.seq++; acc.cur={uid:"anon-"+acc.seq+"-"+Math.random().toString(36).slice(2,6),isAnonymous:true}; saveAcc(); return Promise.resolve({user:mkUser()}); },
      signOut:function(){ acc.cur=null; saveAcc(); return Promise.resolve(); },
      signInWithEmailAndPassword:function(email,pw){
        if(!EMAIL_RE.test(email||"")) return Promise.reject(aerr("auth/invalid-email"));
        var u=acc.users[email];
        if(!u||u.password!==pw) return Promise.reject(aerr("auth/invalid-credential"));
        acc.cur={uid:u.uid,isAnonymous:false,email:email}; saveAcc(); return Promise.resolve({user:mkUser()});
      },
      createUserWithEmailAndPassword:function(email,pw){
        if(!EMAIL_RE.test(email||"")) return Promise.reject(aerr("auth/invalid-email"));
        if(acc.users[email]) return Promise.reject(aerr("auth/email-already-in-use"));
        acc.seq++; var nu="user-"+acc.seq; acc.users[email]={uid:nu,password:pw};
        acc.cur={uid:nu,isAnonymous:false,email:email}; saveAcc(); return Promise.resolve({user:mkUser()});
      },
      sendPasswordResetEmail:function(email){
        if(!EMAIL_RE.test(email||"")) return Promise.reject(aerr("auth/invalid-email"));
        acc.resets.push(email); saveAcc(); return Promise.resolve();
      },
      signInWithPopup:function(){ return Promise.reject(aerr("auth/operation-not-allowed")); },
      signInWithCustomToken:function(){ return Promise.reject(aerr("auth/operation-not-allowed")); },
      // メール確認つきの新規登録（2026-10-04）。リンクは acc.links に残す（メールは送らない）
      sendSignInLinkToEmail:function(email,settings){
        window.__linkSends=(window.__linkSends||[]);window.__linkSends.push({email:email,url:settings&&settings.url});
        if(AUTH_SEED.emailLink!=="on"&&AUTH_SEED.emailLink!=="domain") return Promise.reject(aerr("auth/operation-not-allowed"));
        if(AUTH_SEED.emailLink==="domain") return Promise.reject(aerr("auth/unauthorized-continue-uri"));
        if(!EMAIL_RE.test(email||"")) return Promise.reject(aerr("auth/invalid-email"));
        if(!settings||!settings.handleCodeInApp||!settings.url) return Promise.reject(aerr("auth/argument-error"));
        acc.links.push({email:email,url:settings.url,oob:"OOB"+(acc.links.length+1)+Math.random().toString(36).slice(2,6),used:false}); saveAcc();
        return Promise.resolve();
      },
      isSignInWithEmailLink:function(href){ try{ var u=new URL(href); return u.searchParams.get("mode")==="signIn"&&!!u.searchParams.get("oobCode"); }catch(e){ return false; } },
      signInWithEmailLink:function(email,href){
        var oob=null; try{ oob=new URL(href).searchParams.get("oobCode"); }catch(e){}
        var rec=acc.links.filter(function(l){ return l.oob===oob; })[0];
        if(!rec||rec.used) return Promise.reject(aerr("auth/invalid-action-code"));
        if(AUTH_SEED.expireLinks) return Promise.reject(aerr("auth/expired-action-code"));
        if(String(email||"").trim()!==rec.email) return Promise.reject(aerr("auth/invalid-email"));
        rec.used=true;
        var u=acc.users[rec.email], isNew=!u;
        if(!u){ acc.seq++; u={uid:"user-"+acc.seq,password:null}; acc.users[rec.email]=u; }
        acc.cur={uid:u.uid,isAnonymous:false,email:rec.email}; saveAcc();
        return Promise.resolve({user:mkUser(),additionalUserInfo:{isNewUser:isNew}});
      },
    };
    window.__emailLinkUrl=function(i){ var l=acc.links[i==null?acc.links.length-1:i]; if(!l) return null; return l.url+"&apiKey=stub&oobCode="+l.oob+"&mode=signIn&lang=ja"; };
    Object.defineProperty(authObj,"currentUser",{get:function(){ return mkUser(); }});
  }

  window.__cf=[];
  window.__mails=[];
  function runUnlink(payload){
    // 本物の unlinkStoreFromCompany（functions/index.js）が残す後始末と同じ:
    // companies/{id}/pub/shops/{shopId} を消し、企業uid と grants に載ったuidを owners から外す。
    // **CF本体の挙動は shifty-cf-verify のハーネスで別に実測する**（ここで測るのはクライアント側）。
    var cid=payload.companyId, sid=payload.shopId;
    var grants=getPath("companies/"+cid+"/grants/"+sid)||{};
    setPath("companies/"+cid+"/pub/shops/"+sid,null);
    setPath("shops/"+sid+"/owners/company_"+cid,null);
    Object.keys(grants).forEach(function(u){ setPath("shops/"+sid+"/owners/"+u,null); });
    setPath("companies/"+cid+"/grants/"+sid,null);
    notify();
  }
  var httpsCallable=function(name){
    return function(payload){
      window.__cf.push({name:name,payload:payload});
      var h=CF[name]||"ok";
      if(h.indexOf("reject:")===0) return Promise.reject(new Error(h.slice("reject:".length)));
      if(h==="unlink") runUnlink(payload||{});
      if(h.indexOf("companyLogin:")===0){
        // 本物の companyLogin（functions/index.js）の成功応答の形: {token, companyId, name}
        var lcid=h.slice("companyLogin:".length);
        return Promise.resolve({data:{token:"stub-token",companyId:lcid,name:getPath("companies/"+lcid+"/pub/name")||""}});
      }
      if(h==="companyConfig"){
        // 本物の saveCompanyConfig（functions/index.js）と同じ後始末: 正本を保存し、連携全店舗の
        // shops/{sid}/company を作り直す。検証（sanitize）はしない＝CF側の検証は tests/core.test.js が見る。
        // 写しは本物と同じ buildShopMirror で組む（2026-10-01。以前は企業の settings をそのまま写しにしていて、
        // 法人の設定が重ならなかった＝法人がある企業で本物と食い違っていた）
        var cid=payload.companyId, base="companies/"+cid+"/pub";
        if(payload.settings!==undefined) setPath(base+"/config/settings",payload.settings);
        if(payload.deadlines!==undefined) Object.keys(payload.deadlines||{}).forEach(function(rk){ setPath(base+"/config/deadlines/"+rk,payload.deadlines[rk]); });
        if(payload.monthlyDeadlineDays!==undefined) setPath(base+"/config/monthlyDeadlineDays",(payload.monthlyDeadlineDays||[]).length?payload.monthlyDeadlineDays:null);
        var pub=getPath(base)||{}, linked=Object.keys(pub.shops||{}), names={};
        linked.forEach(function(sid){ names[sid]=((getPath("global/shops/"+sid)||{}).name)||""; });
        linked.forEach(function(sid){ setPath("shops/"+sid+"/company",CFC.buildShopMirror(cid,pub,sid,names,"stub")); });
        notify();
        return Promise.resolve({data:{ok:true,synced:linked,failed:[]}});
      }
      if(h==="entity"){
        // 本物の法人 CF（functions/index.js）と同じ後始末。検証（名前の長さ・連携済みか等）の一部だけ真似る
        var ecid=payload.companyId, eb="companies/"+ecid+"/pub", seq=0;
        var newId=function(){ return "-Ent"+(++pushSeq); };
        var migrate=function(){
          var patch=CFC.planEntityMigration(getPath(eb)||{},newId,"stub");
          if(patch) Object.keys(patch).forEach(function(k){ setPath(eb+"/"+k,patch[k]); });
          return !!patch;
        };
        var sync=function(){
          migrate();
          var pub=getPath(eb)||{}, linked=Object.keys(pub.shops||{}), names={};
          linked.forEach(function(sid){ names[sid]=((getPath("global/shops/"+sid)||{}).name)||""; });
          linked.forEach(function(sid){ setPath("shops/"+sid+"/company",CFC.buildShopMirror(ecid,pub,sid,names,"stub")); });
          notify();
          return {ok:true,synced:linked,failed:[]};
        };
        if(name==="ensureCompanyEntities"){ var m=migrate(); if(m) sync(); return Promise.resolve({data:{ok:true,migrated:m}}); }
        if(name==="createEntity"){
          var nm=CFC.sanitizeEntityName(payload.name); if(!nm) return Promise.reject(new Error("法人名は1〜100文字にしてください"));
          migrate(); var id=newId(); setPath(eb+"/entities/"+id,{name:nm,createdAt:"stub"}); notify();
          return Promise.resolve({data:{ok:true,entityId:id}});
        }
        if(name==="renameEntity"){ setPath(eb+"/entities/"+payload.entityId+"/name",CFC.sanitizeEntityName(payload.name)); return Promise.resolve({data:sync()}); }
        if(name==="assignShopEntity"){ setPath(eb+"/shopEntities/"+payload.shopId,payload.entityId); return Promise.resolve({data:sync()}); }
        if(name==="saveEntityConfig"){ var st=CFC.sanitizeCompanySettings(payload.settings); setPath(eb+"/entities/"+payload.entityId+"/settings",Object.keys(st).length?st:null); return Promise.resolve({data:sync()}); }
        if(name==="setShopKind"){
          setPath(eb+"/shopKinds/"+payload.shopId,payload.kind==="hq"?"hq":null);
          setPath("global/shops/"+payload.shopId+"/kind",payload.kind==="hq"?"hq":null);
          return Promise.resolve({data:sync()});
        }
      }
      if(h==="people"){
        // 本物の人物 CF（functions/index.js・P1b）と同じ後始末。規則は functions/company-config.js をそのまま使う
        // （planPeopleSync・planMergePeople・planSplitPerson・planReassignPersonId・改名の差分パッチ）。
        var qcid=payload.companyId, qb="companies/"+qcid+"/pub", now="stub";
        var gen=function(){ return CFC.genPersonAutoId(function(n){ var a=[]; for(var i=0;i<n;i++) a.push(Math.floor(Math.random()*256)); return a; }); };
        var err=function(m){ return Promise.reject(new Error(m)); };
        var applyP=function(base,patch){ Object.keys(patch||{}).forEach(function(k){ setPath(base+"/"+k,patch[k]); }); };
        var regsOf=function(pub){
          var out=[];
          Object.keys(pub.shops||{}).forEach(function(sid){
            var st=getPath("shops/"+sid+"/settings")||{}, staff=getPath("shops/"+sid+"/staff")||[];
            (Array.isArray(staff)?staff:Object.values(staff)).filter(function(n){ return typeof n==="string"&&n&&n.indexOf("__spacer__")!==0; }).forEach(function(n){
              var hh=(st.staffHomeShop||{})[n], num=(st.staffNumbers||{})[n];
              out.push({shopId:sid,name:n,entityId:CFC.entityIdOfShop(pub,sid)||"",homeShopId:typeof hh==="string"&&hh?hh:sid,number:String(num==null?"":num).trim()});
            });
          });
          return out;
        };
        var qpub=getPath(qb)||{}, people=qpub.people||{};
        // 本物の CF と同じく、人物が変わったら連携全店舗の写し（people・P3.6）を作り直す
        var resync=function(){
          var pub=getPath(qb)||{}, linked=Object.keys(pub.shops||{}), names={};
          linked.forEach(function(sid){ names[sid]=((getPath("global/shops/"+sid)||{}).name)||""; });
          linked.forEach(function(sid){ setPath("shops/"+sid+"/company",CFC.buildShopMirror(qcid,pub,sid,names,"stub")); });
        };
        if(name==="ensureCompanyPeople"){
          var sy=CFC.planPeopleSync(people,regsOf(qpub),gen,now);
          if(sy.patch){ applyP(qb+"/people",sy.patch); resync(); }
          notify();
          return Promise.resolve({data:{ok:true,created:sy.created,changed:!!sy.patch}});
        }
        var pid=payload.personId, per=people[pid];
        if(name==="mergePeople"){
          var mr=CFC.planMergePeople(people,payload.keepPersonId,payload.dropPersonId,now);
          if(mr.error) return err(mr.error);
          applyP(qb+"/people",mr.patch); resync(); notify();
          return Promise.resolve({data:{ok:true}});
        }
        // 「統合しない」（2026-09-30）。distinct:true で全ペアを両方向に記録、false で2人の記録を取り消す（写しは作り直さない）
        if(name==="markPeopleDistinct"){
          var ids=Array.isArray(payload.personIds)?payload.personIds:[];
          var dr=payload.distinct===false?CFC.planUnmarkDistinct(people,ids[0],ids[1]):CFC.planMarkDistinct(people,ids,now);
          if(dr.error) return err(dr.error);
          applyP(qb+"/people",dr.patch); notify();
          return Promise.resolve({data:{ok:true}});
        }
        if(!per) return err("人物が見つかりません");
        if(name==="splitPerson"){
          var ssid=payload.shopId, snm=(per.links||{})[ssid], sst=getPath("shops/"+ssid+"/settings")||{};
          var sr=CFC.planSplitPerson(people,pid,{shopId:ssid,name:snm,entityId:CFC.entityIdOfShop(qpub,ssid)||"",number:String(((sst.staffNumbers||{})[snm])||"").trim()},gen,now);
          if(sr.error) return err(sr.error);
          applyP(qb+"/people",sr.patch); resync(); notify();
          return Promise.resolve({data:{ok:true,personId:sr.newId}});
        }
        if(name==="reassignPersonId"){
          var rr=CFC.planReassignPersonId(people,pid);
          if(rr.error) return err(rr.error);
          applyP(qb+"/people",rr.patch); resync(); notify();
          return Promise.resolve({data:{ok:true,personId:rr.newId}});
        }
        if(name==="companyRenameStaff"){
          var nn=String(payload.newName||"").trim(), sids=payload.shopIds||[];
          for(var i=0;i<sids.length;i++){
            var e1=CFC.validateStaffRename(getPath("shops/"+sids[i]+"/staff"),getPath("shops/"+sids[i]+"/settings")||{},(per.links||{})[sids[i]],nn);
            if(e1) return err(e1);
          }
          sids.forEach(function(sid){
            var on=per.links[sid];
            setPath("shops/"+sid+"/staff",CFC.renameStaffListCF(getPath("shops/"+sid+"/staff")||[],on,nn));
            applyP("shops/"+sid+"/settings",CFC.renameStaffSettingsPatch(getPath("shops/"+sid+"/settings")||{},on,nn));
            applyP("shops/"+sid+"/subs",CFC.renameStaffSubsPatch(getPath("shops/"+sid+"/subs")||{},on,nn));
            applyP("shops/"+sid+"/periods",CFC.renameStaffPeriodsPatch(getPath("shops/"+sid+"/periods")||{},on,nn));
            applyP("shops/"+sid+"/private/pay",CFC.renameStaffPayPatch(getPath("shops/"+sid+"/private/pay")||{},on,nn)||{});
            setPath(qb+"/people/"+pid+"/links/"+sid,nn);
          });
          setPath(qb+"/people/"+pid+"/displayName",CFC.personDisplayName(Object.values(getPath(qb+"/people/"+pid+"/links")||{})));
          resync(); notify();
          return Promise.resolve({data:{ok:true,done:sids,failed:[]}});
        }
        if(name==="companyUpdateStaff"){
          var hasN=payload.number!==undefined, hasE=payload.entityId!==undefined;
          var num2=hasN?CFC.sanitizeStaffNumber(payload.number):String(per.number||"");
          var eid=hasE?payload.entityId:(per.entityId||"");
          if(hasN||hasE){
            var cc=CFC.staffNumberConflict(people,regsOf(qpub),eid,num2,pid);
            if(cc) return err("従業員番号 "+num2+" はこの法人で既に使われています"+(cc.name?"（"+cc.name+"）":""));
          }
          if(hasN) setPath(qb+"/people/"+pid+"/number",num2||null);
          if(hasE) setPath(qb+"/people/"+pid+"/entityId",eid);
          Object.keys(per.links||{}).forEach(function(sid){
            var nm=per.links[sid], base="shops/"+sid+"/settings/";
            if(hasN) setPath(base+"staffNumbers/"+nm,num2||null);
            if(payload.attrs&&payload.attrs[sid]!==undefined) setPath(base+"staffAttributes/"+nm,payload.attrs[sid]);
            if(payload.homeShops&&payload.homeShops[sid]!==undefined) setPath(base+"staffHomeShop/"+nm,payload.homeShops[sid]&&payload.homeShops[sid]!==sid?payload.homeShops[sid]:null);
          });
          notify();
          return Promise.resolve({data:{ok:true,failed:[]}});
        }
      }
      if(h==="staffLink"){
        // 本物の紐付けの CF（functions/index.js・E2）と同じ後始末。判定は functions/staff-link.js の plan* を通す
        var me=AUTH_MODE==="accounts"?window.__authCur():(signedIn?{uid:USER.uid,email:USER.email}:null);
        var cu=me&&me.uid;
        if(!cu) return Promise.reject(Object.assign(new Error("ログインが必要です"),{code:"functions/unauthenticated"}));
        var lfail=function(r){ return Promise.reject(Object.assign(new Error(r.error.msg),{code:"functions/"+r.error.code})); };
        var lapply=function(patch){ Object.keys(patch||{}).forEach(function(k){ setPath(k,patch[k]); }); notify(); };
        var liso=new Date().toISOString();
        var lsid=payload.shopId;
        var lread=function(sid){ return {owners:getPath("shops/"+sid+"/owners"),staff:getPath("shops/"+sid+"/staff"),settings:getPath("shops/"+sid+"/settings"),
          mirrorPeople:getPath("shops/"+sid+"/company/people"),staffLinks:getPath("shops/"+sid+"/staffLinks")}; };
        if(name==="approveStaffLink"){
          var ar=SLK.planApproveStaffLink(Object.assign(lread(lsid),{shopId:lsid,uid:payload.uid,name:payload.name,callerUid:cu,nowIso:liso,request:getPath("shops/"+lsid+"/linkRequests/"+payload.uid)}));
          if(ar.error) return lfail(ar);
          lapply(ar.patch); return Promise.resolve({data:{ok:true,method:ar.method}});
        }
        if(name==="unlinkStaff"){
          var ur=SLK.planUnlinkStaff({shopId:lsid,uid:payload.uid!==undefined?payload.uid:cu,callerUid:cu,owners:getPath("shops/"+lsid+"/owners")});
          if(ur.error) return lfail(ur);
          lapply(ur.patch); return Promise.resolve({data:{ok:true}});
        }
      }
      if(h==="pageLink"){
        // 本物の linkStaffPage（functions/index.js・2026-10-05）と同じ順: メールのある認証 → URL の状態 → リンクできるか → 暗証番号 → 書く。
        // 判定は functions/staff-link.js の planLinkStaffPage と functions/my-page.js の myPageAccessCF・planMyPagePin をそのまま通す
        var kfail=function(e){ return Promise.reject(Object.assign(new Error(e.msg),{code:"functions/"+e.code})); };
        var kme=AUTH_MODE==="accounts"?window.__authCur():(signedIn?{uid:USER.uid,email:USER.email}:null);
        if(!kme||!kme.uid) return kfail({code:"unauthenticated",msg:"ログインが必要です"});
        if(!kme.email) return kfail({code:"failed-precondition",msg:"メールアドレスで登録したマイシフトのアカウントでログインしてください"});
        var ktk=payload&&payload.token;
        if(!MYPG.isPageTokenCF(ktk)) return kfail({code:"invalid-argument",msg:"URLが正しくありません"});
        var ktr=getPath("staffPageTokens/"+ktk), ksid=ktr&&ktr.shopId;
        if(!ksid) return kfail({code:"not-found",msg:"このURLは見つかりませんでした"});
        var kprec=getPath("shops/"+ksid+"/staffPages/"+ktk);
        var kacc=MYPG.myPageAccessCF({token:ktk,tokenRec:ktr,pageRec:kprec,staff:getPath("shops/"+ksid+"/staff")});
        if(kacc.error) return kfail(kacc.error);
        var kiso=new Date().toISOString();
        var kpre=SLK.planLinkStaffPage({shopId:ksid,uid:kme.uid,name:kacc.name,nowIso:kiso,owners:getPath("shops/"+ksid+"/owners"),
          staffLinks:getPath("shops/"+ksid+"/staffLinks"),mirrorPeople:getPath("shops/"+ksid+"/company/people")});
        if(kpre.error) return kfail(kpre.error);
        if(kpre.already) return Promise.resolve({data:{ok:true,already:true,shopId:ksid,name:kacc.name}});
        var kpin=getPath("staffPagePins/"+ktk);
        var kst=MYPG.planMyPagePin({action:"status",pinRec:kpin,pageRec:kprec,now:Date.now()});
        var kdone=function(){ Object.keys(kpre.patch).forEach(function(k){ setPath(k,kpre.patch[k]); }); notify(); return {data:{ok:true,shopId:ksid,name:kacc.name}}; };
        if(!(kst.result&&kst.result.hasPin)) return Promise.resolve(kdone());
        var kp=typeof payload.pin==="string"?payload.pin:"";
        if(!/^[0-9]{4}$/.test(kp)) return kfail({code:"failed-precondition",msg:"このURLの暗証番号（4桁）を入れてください"});
        return window.payCodeHash(kpin.salt,kp).then(function(hh){
          var kr=MYPG.planMyPagePin({action:"verify",pin:kp,pinRec:kpin,pageRec:kprec,now:Date.now(),nowIso:kiso,pinHash:hh});
          if(kr.pinPatch!==undefined) setPath("staffPagePins/"+ktk,kr.pinPatch);
          if(kr.error) return kfail(kr.error);
          return kdone();
        });
      }
      if(h==="myPay"){
        // 本物の getMyPay（functions/index.js・E6）と同じ順: 紐付けを確かめてから private/pay を読む。何も書かない
        var mme=AUTH_MODE==="accounts"?window.__authCur():(signedIn?{uid:USER.uid,email:USER.email}:null);
        if(!mme||!mme.uid) return Promise.reject(Object.assign(new Error("ログインが必要です"),{code:"functions/unauthenticated"}));
        var msid=payload&&payload.shopId;
        var mlk=MYP.myPayLinkNameCF({email:mme.email||null,staffLink:getPath("shops/"+msid+"/staffLinks/"+mme.uid)});
        if(mlk.error) return Promise.reject(Object.assign(new Error(mlk.error.msg),{code:"functions/"+mlk.error.code}));
        var mhs=getPath("shops/"+msid+"/settings/staffHomeShop/"+mlk.name);
        var mhome=typeof mhs==="string"&&mhs&&mhs!==msid?mhs:"";
        var mr=MYP.planGetMyPay({shopId:msid,name:mlk.name,staff:getPath("shops/"+msid+"/staff"),payRec:getPath("shops/"+msid+"/private/pay/"+mlk.name),
          homeShopId:mhome,homeShopName:mhome?getPath("global/shops/"+mhome+"/name"):null});
        if(mr.error) return Promise.reject(Object.assign(new Error(mr.error.msg),{code:"functions/"+mr.error.code}));
        return Promise.resolve({data:mr.result});
      }
      if(h==="myPage"){
        // 本物の myPagePin（functions/index.js・2026-10-04）と同じ順: 個別URLの状態を確かめ、暗証番号を照合してから賃金を読む
        var pfail=function(e){ return Promise.reject(Object.assign(new Error(e.msg),{code:"functions/"+e.code})); };
        var ptk=payload&&payload.token, pact=payload&&payload.action;
        if(!MYPG.isPageTokenCF(ptk)) return pfail({code:"invalid-argument",msg:"URLが正しくありません"});
        if(["status","set","verify"].indexOf(pact)<0) return pfail({code:"invalid-argument",msg:"操作が正しくありません"});
        var ptr=getPath("staffPageTokens/"+ptk), psid=ptr&&ptr.shopId;
        if(!psid) return pfail({code:"not-found",msg:"このURLは見つかりませんでした"});
        var prec=getPath("shops/"+psid+"/staffPages/"+ptk), pstaff=getPath("shops/"+psid+"/staff");
        var pacc=MYPG.myPageAccessCF({token:ptk,tokenRec:ptr,pageRec:prec,staff:pstaff});
        if(pacc.error) return pfail(pacc.error);
        var ppin=typeof payload.pin==="string"?payload.pin:"", pcur=typeof payload.currentPin==="string"?payload.currentPin:"";
        var prc=getPath("staffPagePins/"+ptk);
        var psalt=pact==="set"?("stubsalt"+(++pushSeq)+"0123456789abcdef"):"";
        var phx=function(sl,p){ return (typeof sl==="string"&&/^[0-9]{4}$/.test(p))?window.payCodeHash(sl,p):Promise.resolve(""); };
        return Promise.all([phx(prc&&prc.salt,ppin),phx(prc&&prc.salt,pcur),phx(psalt,ppin)]).then(function(hs){
          var pr=MYPG.planMyPagePin({action:pact,pin:ppin,currentPin:pcur,pinRec:prc,pageRec:prec,now:Date.now(),nowIso:new Date().toISOString(),salt:psalt,
            pinHash:hs[0],currentHash:hs[1],newHash:hs[2]});
          if(pr.pinPatch!==undefined) setPath("staffPagePins/"+ptk,pr.pinPatch);
          if(pr.error) return pfail(pr.error);
          if(!pr.unlocked) return {data:pr.result};
          var pnm=pacc.name, phs=getPath("shops/"+psid+"/settings/staffHomeShop/"+pnm);
          var phome=typeof phs==="string"&&phs&&phs!==psid?phs:"";
          var pg=MYP.planGetMyPay({shopId:psid,name:pnm,staff:pstaff,payRec:getPath("shops/"+psid+"/private/pay/"+pnm),homeShopId:phome,homeShopName:phome?getPath("global/shops/"+phome+"/name"):null});
          if(pg.error) return pfail(pg.error);
          return {data:Object.assign({},pg.result,pr.result,{shopId:psid})};
        });
      }
      if(h==="pageEmail"){
        var efail=function(e){ return Promise.reject(Object.assign(new Error(e.msg),{code:"functions/"+e.code})); };
        var ekey=function(em){ return window.payCodeHash(MYPG.PAGE_EMAIL_KEY_SALT_CF,MYPG.normalizePageEmailCF(em)); };
        var ewrite=function(w){ Object.keys(w||{}).forEach(function(k){ setPath(k,w[k]); }); notify(); };
        var EBASE="https://shiftyshifty.app";
        if(name==="setPageEmail"){
          var et=payload&&payload.token, eact=payload&&payload.action;
          if(!MYPG.isPageTokenCF(et)) return efail({code:"invalid-argument",msg:"URLが正しくありません"});
          var etr=getPath("staffPageTokens/"+et), esid=etr&&etr.shopId;
          if(!esid) return efail({code:"not-found",msg:"このURLは見つかりませんでした"});
          var epages=getPath("shops/"+esid+"/staffPages")||{}, estaff=getPath("shops/"+esid+"/staff");
          var eacc=MYPG.myPageAccessCF({token:et,tokenRec:etr,pageRec:epages[et],staff:estaff});
          if(eacc.error) return efail(eacc.error);
          var eprev={};
          Object.keys(epages).forEach(function(t){ var r=epages[t]; if(t!==et&&r&&r.status==="revoked"&&r.name===eacc.name&&getPath("staffPageEmails/"+t)) eprev[t]=getPath("staffPageEmails/"+t); });
          var em=typeof payload.email==="string"?payload.email:"";
          return (eact==="set"?ekey(em):Promise.resolve("")).then(function(k){
            var er=MYPG.planSetPageEmailCF({action:eact,token:et,access:eacc,pages:epages,emailRec:getPath("staffPageEmails/"+et),prevEmailRecs:eprev,email:em,emailKey:k,
              nowIso:new Date().toISOString(),base:EBASE,shopName:getPath("global/shops/"+esid+"/name")||""});
            if(er.error) return efail(er.error);
            ewrite(er.writes);
            if(er.mail) window.__mails.push(er.mail);
            return {data:er.result};
          });
        }
        if(name==="recoverPageUrl"){
          var rem=MYPG.normalizePageEmailCF(typeof (payload&&payload.email)==="string"?payload.email:"");
          if(!MYPG.isPageEmailCF(rem)) return efail({code:"invalid-argument",msg:"メールアドレスの形が正しくありません"});
          return ekey(rem).then(function(k){
            var idx=getPath("staffPageEmailIndex/"+k)||{}, ts={}, ers={}, pbs={}, sbs={}, sns={};
            Object.keys(idx).forEach(function(t){ var tr=getPath("staffPageTokens/"+t); if(tr&&tr.shopId){ ts[t]=tr.shopId; pbs[tr.shopId]=getPath("shops/"+tr.shopId+"/staffPages")||{};
              sbs[tr.shopId]=getPath("shops/"+tr.shopId+"/staff"); sns[tr.shopId]=getPath("global/shops/"+tr.shopId+"/name")||""; } var e=getPath("staffPageEmails/"+t); if(e) ers[t]=e; });
            var rr=MYPG.planRecoverPageUrlCF({email:rem,emailKey:k,index:idx,tokenShops:ts,pagesByShop:pbs,staffByShop:sbs,shopNames:sns,emailRecs:ers,base:EBASE});
            if(rr.error) return efail(rr.error);
            ewrite(rr.writes);
            if(rr.mail) window.__mails.push(rr.mail);
            return {data:rr.result};
          });
        }
      }
      if(h==="payCode"){
        // 本物の setCompanyPayCode（functions/index.js・P6a）と同じ後始末: 現在の番号を照合し（未設定なら 0000）、
        // SHA-256(salt+code) を companies/{id}/private/payCode と連携全店舗の shops/{sid}/private/payCode に書く
        var pcid=payload.companyId, pstored=getPath("companies/"+pcid+"/private/payCode");
        // ハッシュは app-utils.js の payCodeHash をそのまま使う（ハーネスは http で配信するので crypto.subtle が無い）
        var hex=function(salt,code){ return window.payCodeHash(salt,code); };
        if(!/^[0-9]{4}$/.test(String(payload.newCode||""))) return Promise.reject(new Error("パスコードは4桁の数字にしてください"));
        var pcheck=(pstored&&pstored.hash)?hex(pstored.salt,payload.currentCode).then(function(x){ return x===pstored.hash; }):Promise.resolve(payload.currentCode==="0000");
        return pcheck.then(function(ok){
          if(!ok) return Promise.reject(new Error("現在のパスコードが正しくありません"));
          var salt="stubsalt"+(++pushSeq);
          return hex(salt,payload.newCode).then(function(hh){
            var rec={hash:hh,salt:salt,updatedAt:"stub"}, plinked=Object.keys(getPath("companies/"+pcid+"/pub/shops")||{});
            setPath("companies/"+pcid+"/private/payCode",rec);
            plinked.forEach(function(sid){ setPath("shops/"+sid+"/private/payCode",rec); });
            notify();
            return {data:{ok:true,synced:plinked,failed:[]}};
          });
        });
      }
      if(h==="link"){
        // 本物の linkStoreToCompany が書くもの: 連携マップと owners への企業uid登録
        setPath("companies/"+payload.companyId+"/pub/shops/"+payload.shopId,true);
        setPath("shops/"+payload.shopId+"/owners/company_"+payload.companyId,"KEY-"+payload.shopId);
        notify();
        return Promise.resolve({data:{ok:true,name:(getPath("global/shops/"+payload.shopId)||{}).name||""}});
      }
      return Promise.resolve({data:{ok:true}});
    };
  };

  var dbObj={ ref:function(p){ return refFor(p===undefined?"":String(p)); } };
  var authFn=function(){ return authObj; };
  authFn.Auth={Persistence:{LOCAL:"local",NONE:"none",SESSION:"session"}};
  authFn.GoogleAuthProvider=function(){ this.providerId="google.com"; };
  authFn.GoogleAuthProvider.credential=function(){ return {}; };
  authFn.OAuthProvider=function(pid){ this.providerId=pid; this.addScope=function(){}; };
  authFn.EmailAuthProvider={credential:function(email,password){ return {providerId:"password",email:email,password:password}; }};

  window.firebase={
    apps:[],
    initializeApp:function(){ this.apps.push({name:"[DEFAULT]"}); return {}; },
    database:function(){ return dbObj; },
    auth:authFn,
    app:function(){ return { functions:function(){ return {httpsCallable:httpsCallable}; } }; },
  };

  // 起動時の画面・タブ。**生の文字列で置く**（ssGet は JSON.parse しないので JSON.stringify すると
  // どの分岐にも一致せず、検証が素通りする＝SKILL.md 1.6節 罠4）
  sessionStorage.setItem("ss_view",${JSON.stringify(view)});
  sessionStorage.setItem("ss_tab",${JSON.stringify(tab)});
  window.confirm=function(){ return ${confirmValue}; };
})();
</script>`;
}

module.exports = { makeStub };
