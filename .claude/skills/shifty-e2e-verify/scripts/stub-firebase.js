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
//
// 守備範囲の外: セキュリティルール（database.rules.json）は一切評価しない。Admin SDK と同じで
// 素通りするので、ルールの許可・拒否を確かめたいときは実クライアントか認証付きRESTで測る。
"use strict";

/**
 * @param {object} o
 * @param {object} o.seed        初期DB（JSONで埋め込む）
 * @param {string} o.uid         サインイン済みとして扱うuid（"company_XXX" なら企業ログインセッション）
 * @param {string} [o.view]      起動時の画面（既定 "admin"）
 * @param {string} [o.tab]       起動時の管理者タブ（既定 "periods"）
 * @param {object} [o.cfHandlers] Callable名 → "ok" | "reject:メッセージ" | "unlink" | "link" | "companyConfig"（本物のCFと同じ後始末）
 * @param {boolean}[o.confirm]   window.confirm の戻り値（既定 true）
 */
function makeStub(o) {
  const seed = o.seed || {};
  const uid = o.uid;
  const view = o.view || "admin";
  const tab = o.tab || "periods";
  const cfHandlers = o.cfHandlers || {};
  const confirmValue = o.confirm === undefined ? true : !!o.confirm;

  return `<script>
(function(){
  var LS_DB="__stub_fdb", LS_AUTH="__stub_fauth";
  var SEED=${JSON.stringify(seed)};
  var CF=${JSON.stringify(cfHandlers)};
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
  function notify(){
    listeners.slice().forEach(function(e){
      setTimeout(function(){ e.cb(snap(applyQuery(getPath(e.path),e.query))); },0);
    });
  }
  function refFor(p,q){
    var ks=norm(p);
    return {
      key: ks.length?ks[ks.length-1]:null,
      toString:function(){ return "stub://"+p; },
      child:function(c){ return refFor(p+"/"+c); },
      once:function(){
        if(p===".info/connected") return Promise.resolve(snap(true));
        return Promise.resolve(snap(applyQuery(getPath(p),q)));
      },
      on:function(ev,cb){
        if(p===".info/connected"){ setTimeout(function(){ cb(snap(true)); },0); return cb; }
        listeners.push({path:p,cb:cb,query:q});
        setTimeout(function(){ cb(snap(applyQuery(getPath(p),q))); },0);
        return cb;
      },
      off:function(){ for(var i=listeners.length-1;i>=0;i--) if(listeners[i].path===p) listeners.splice(i,1); },
      set:function(v){ setPath(p,v); notify(); return Promise.resolve(); },
      update:function(o){ Object.keys(o||{}).forEach(function(k){ setPath(p+"/"+k,o[k]); }); notify(); return Promise.resolve(); },
      remove:function(){ setPath(p,null); notify(); return Promise.resolve(); },
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

  window.__cf=[];
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
      if(h==="companyConfig"){
        // 本物の saveCompanyConfig（functions/index.js）と同じ後始末: 正本を保存し、連携全店舗の
        // shops/{sid}/company を作り直す。検証（sanitize）はしない＝CF側の検証は tests/core.test.js が見る。
        var cid=payload.companyId, base="companies/"+cid+"/pub";
        if(payload.settings!==undefined) setPath(base+"/config/settings",payload.settings);
        if(payload.deadlines!==undefined) Object.keys(payload.deadlines||{}).forEach(function(rk){ setPath(base+"/config/deadlines/"+rk,payload.deadlines[rk]); });
        var pub=getPath(base)||{}, cfg=pub.config||{}, linked=Object.keys(pub.shops||{}), names={};
        linked.forEach(function(sid){ names[sid]=((getPath("global/shops/"+sid)||{}).name)||""; });
        linked.forEach(function(sid){
          var dl={}, all=cfg.deadlines||{};
          Object.keys(all).forEach(function(rk){ var e=all[rk]||{}; var v=(e.shops&&e.shops[sid])||e.all; if(v) dl[rk]=v; });
          setPath("shops/"+sid+"/company",{id:cid,name:pub.name||"",settings:cfg.settings||{},deadlines:dl,shops:names,syncedAt:"stub"});
        });
        notify();
        return Promise.resolve({data:{ok:true,synced:linked,failed:[]}});
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
  authFn.EmailAuthProvider={credential:function(){ return {}; }};

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
