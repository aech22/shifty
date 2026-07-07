// ============================================================
// Shifty - メインアプリ App()（app.js から分割 M-1）
// ============================================================

// ============================================================
// メインアプリ
// ============================================================
// ============================================================
// メインアプリ - 3フェーズ初期化
// ============================================================

function App(){
  const[syncStatus,setSyncStatus]=useState("init");
  const[ready,setReady]=useState(false); // Phase1完了フラグ
  const[initError,setInitError]=useState(null); // "auth"=匿名認証不可 / "resolve"=スタッフURL解決不可（アプリ内ブラウザの制限等）
  const[paymentToast,setPaymentToast]=useState(()=>{
    const p=new URLSearchParams(window.location.search);
    if(p.get("payment")==="success") return "success";
    if(p.get("payment")==="cancel") return "cancel";
    return null;
  });
  useEffect(()=>{
    if(!paymentToast) return;
    window.history.replaceState({},"",window.location.pathname+window.location.hash);
    const t=setTimeout(()=>setPaymentToast(null),5000);
    return()=>clearTimeout(t);
  },[paymentToast]);

  const[shops,setShops]=useState([]);
  const[allLinkedShops,setAllLinkedShops]=useState([]); // accounts/{uid}/shops に紐付いた全店舗
  // URLにtokenがある場合はsessionStorageを無視してPhase1で確定
  const _hasUrlToken=!!(parseUrl()?.type==="staff");
  const[currentShopId,setCurrentShopId]=useState(()=>_hasUrlToken?null:ssGet(SS_SHOP,null));
  const currentShopIdRef=useRef(_hasUrlToken?null:ssGet(SS_SHOP,null));
  const[view,setView]=useState(()=>_hasUrlToken?"staff":ssGet(SS_VIEW,"staff"));
  const[authUser,setAuthUser]=useState(null); // Firebase Auth ユーザー（null=未ログイン）
  const[authChecked,setAuthChecked]=useState(false); // Auth状態確認完了フラグ
  const[authLoading,setAuthLoading]=useState(false); // OAuth処理中
  const[authError,setAuthError]=useState(""); // ログインエラー
  const[settings,setSettings]=useState(null);
  const[periods,setPeriods]=useState([]);
  const[staffList,setStaffList]=useState([]);
  const[subs,setSubs]=useState([]);
  // URLトークンがある場合はapidもPhase1で確定させる
  const[apid,setApid]=useState(()=>_hasUrlToken?null:ssGet(SS_APID,null));
  const[urlResolved,setUrlResolved]=useState(false);
  const[unbound,setUnbound]=useState(false); // 引き継ぎコード未入力（未所属）状態
  const[inviteCode,setInviteCode]=useState(""); // 引き継ぎコード入力値
  const[inviteError,setInviteError]=useState(""); // エラーメッセージ
  const[inviteCodeDisplay,setInviteCodeDisplay]=useState(null); // 企業アカウント招待コード表示用
  const[inviteCodeGenLoading,setInviteCodeGenLoading]=useState(false); // 招待コード生成中フラグ
  const[companyInfo,setCompanyInfo]=useState(null); // {companyId,code,name} 企業アカウント（作成者本人 or 企業ログイン中）
  const[companyLoginMode,setCompanyLoginMode]=useState(false); // ログイン画面で企業コードログインフォーム表示中
  const[companyCodeVal,setCompanyCodeVal]=useState("");
  const[companyPwVal,setCompanyPwVal]=useState("");
  const[plan,setPlan]=useState("free"); // サブスクプラン
  const[planExpiry,setPlanExpiry]=useState(null); // プラン有効期限
  const[paymentFailed,setPaymentFailed]=useState(false); // 決済失敗フラグ
  const[emailMode,setEmailMode]=useState(null); // null | "login" | "register"
  const[emailVal,setEmailVal]=useState("");
  const[passwordVal,setPasswordVal]=useState("");
  const[password2Val,setPassword2Val]=useState("");
  // App スコープのトースト（generateInviteCode など App 内関数から使用）
  const[appToast,setAppToast]=useState(null);
  const appToastRef=useRef();
  const tt=m=>{setAppToast(m);clearTimeout(appToastRef.current);appToastRef.current=setTimeout(()=>setAppToast(null),2500);};

  // ===================================================================
  // Phase1: Firebase初期化 → global/shopsをonceで読む → shops/sid確定
  // ===================================================================
  useEffect(()=>{
    // 旧・解放コード（廃止済み）のlocalStorageキーを即時削除
    try{localStorage.removeItem("ots_unlocked");}catch(e){console.warn("localStorage cleanup failed:",e);}
    const configured = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";

    if(!configured){
      // Firebase未設定: localStorageのみ
      const local=lg("shift_shops_v6",null);
      const sh=local&&local.length>0?local:[makeShop("メイン店舗")];
      setShops(sh); ls("shift_shops_v6",sh);
      setCurrentShopId(sh[0].id);
      setSyncStatus("no_config");
      setReady(true);
      return;
    }

    // Firebase SDK 初期化（DB接続のみクリティカルパス、Auth/Functionsは別で）
    try{
      if(!firebase.apps||firebase.apps.length===0) firebase.initializeApp(FIREBASE_CONFIG);
      firebaseDB = firebase.database();
      firebaseDB.ref(".info/connected").on("value",snap=>{
        firebaseEnabled=snap.val()===true;
        setSyncStatus(firebaseEnabled?"online":"offline");
      });
    }catch(e){
      console.warn("Firebase DB init failed:",e);
      const local=lg("shift_shops_v6",null)||[makeShop("メイン店舗")];
      setShops(local); setCurrentShopId(local[0].id);
      setSyncStatus("offline"); setAuthChecked(true); setReady(true); return;
    }
    // Auth/Functionsは接続のクリティカルパスから分離（失敗しても接続に影響しない）
    try{ firebaseAuth = firebase.auth(); }catch(e){ console.warn("Auth init failed:",e); }
    try{ firebaseFunctions = firebase.app().functions("asia-northeast1"); }catch(e){ console.warn("Functions init failed:",e); }

    // App Check（サイトキー設定済みの場合のみ有効化。未設定時はスキップ）
    try{
      if(APP_CHECK_SITE_KEY && firebase.appCheck){
        firebase.appCheck().activate(APP_CHECK_SITE_KEY, true);
      }
    }catch(e){ console.warn("App Check init failed:",e); }

    // Auth状態を確認してからshops読み込みを開始
    // 全クライアントを匿名認証でauth != null にする（Firebaseルールが未認証アクセスを拒否するため）。
    // 匿名セッションもGoogle/メールの実ログインもLOCALで永続化する（端末ごとにuidを安定させ、
    // リロード後も複数店舗ログイン状態を維持するため）。
    // 「新端末で自動ログインされる」旧バグの再発防止は、実ユーザーセッションの有無ではなく
    // 明示的なログアウト操作の有無（AUTH_LOGGED_OUT_LS）で判定する。doLogout/doFullSignOutで
    // フラグが立っていれば、実ユーザーが復元されてもサインアウトして匿名に入り直す。
    if(firebaseAuth){
      // アプリ内ブラウザ（iOS WKWebView等）でindexedDBがハングし、setPersistence/onAuthStateChangedが
      // 永久に解決しない事象への保険。10秒で初期化が進まなければエラー画面へ。
      // 遅れて初期化が完了し店舗に入れた場合はエラー画面は自動で消える（renderの抑制条件）
      const authWatchdog=setTimeout(()=>setInitError(prev=>prev||"auth"),10000);
      firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e=>console.warn("setPersistence失敗:",e)).then(()=>{
        const unsubAuth = firebaseAuth.onAuthStateChanged(user=>{
          unsubAuth(); // 初回のみ
          const proceed=(realUser)=>{
            clearTimeout(authWatchdog);
            setAuthUser(realUser);
            setAuthChecked(true);
            loadShops(realUser);
          };
          if(user&&!user.isAnonymous&&lg(AUTH_LOGGED_OUT_LS,false)){
            // 明示的にログアウト済み: 実ユーザーセッションが残っていても自動復元しない
            firebaseAuth.signOut().catch(()=>{}).then(()=>
              firebaseAuth.signInAnonymously().catch(e=>{console.warn("匿名サインイン失敗:",e);setInitError("auth");})
            ).then(()=>proceed(null));
          }else if(user&&!user.isAnonymous){
            proceed(user); // 実ユーザーセッション復元（複数店舗ログイン状態を維持）
          }else if(!user){
            firebaseAuth.signInAnonymously().catch(e=>{console.warn("匿名サインイン失敗:",e);setInitError("auth");}).then(()=>proceed(null));
          }else{
            proceed(null); // 匿名ユーザー復元済み
          }
        });
      });
    }else{
      // Auth未初期化: Cookie/localStorageで続行
      setAuthChecked(true);
      loadShops(null);
    }

    const loadShops=(authUser)=>{
    // 店舗はglobal/shopsの全件読みをやめ、必要なIDの直キー読みで取得する（一覧の公開を前提にしない）
    const readShop=id=>firebaseDB.ref(`global/shops/${id}`).once("value").then(s=>{const v=s.val();return v&&v.id?v:null;});
    const enterShop=(shopObj)=>{
      setShops([shopObj]);
      ls("shift_shops_v6",[shopObj]);
      currentShopIdRef.current=shopObj.id;
      setCurrentShopId(shopObj.id);
      startSubscriptions(shopObj.id,[shopObj]);
      setReady(true);
    };
    const toUnbound=()=>{ setUnbound(true); setReady(true); };
    // Cookie店舗で入る（DB読み失敗時はlocalStorageキャッシュでオフライン継続）
    const cookieFallback=()=>{
      const ckId=getCookie(CK_SHOP);
      if(!ckId||ckId==="default"){ dlog("未ログイン: ログイン画面へ"); toUnbound(); return; }
      readShop(ckId).then(shop=>{
        if(shop){ dlog("Cookie店舗:",shop.name); enterShop(shop); }
        else toUnbound(); // CookieのIDがDBに存在しない
      }).catch(e=>{
        console.warn("shops読み込み失敗:",e);
        const local=lg("shift_shops_v6",null)||[];
        const cached=local.find(s=>s&&s.id===ckId);
        if(cached) enterShop(cached); else toUnbound();
      });
    };
    const parsed=parseUrl();
    // URLにtokenがある場合: tokens逆引きインデックスでshop/periodを特定
    if(parsed&&parsed.token&&parsed.type==="staff"){
      const token=parsed.token;
      firebaseDB.ref(`tokens/${token}`).once("value").then(tsnap=>{
        const tv=tsnap.val();
        if(!tv||!tv.shopId) return false;
        return readShop(tv.shopId).then(shop=>{
          if(!shop) return false;
          dlog("URL解決(tokens): shop=",shop.name);
          setApid(tv.periodId||null);
          setUrlResolved(true);
          enterShop(shop);
          return true;
        });
      }).then(ok=>{ if(!ok){ console.warn("token一致なし:",token,"→ Cookieチェックへ"); setInitError("resolve"); cookieFallback(); } })
        .catch(e=>{ console.warn("スタッフURL解決失敗:",e); setInitError("resolve"); cookieFallback(); });
      return;
    }
    // 1) Firebase Auth ユーザーがいる場合 → accounts/{uid}/shops を確認
    if(authUser){
      // 企業コード＋パスワードでログインしたセッション（uid="company_"+companyId）は
      // accounts/{uid}/shops ではなく companies/{companyId}/pub/shops に連携店舗を持つ
      if(String(authUser.uid).startsWith("company_")){
        const companyId=authUser.uid.slice("company_".length);
        firebaseDB.ref(`companies/${companyId}/pub`).once("value").then(pubSnap=>{
          const pub=pubSnap.val();
          if(!pub){ toUnbound(); return; }
          setCompanyInfo({companyId,code:pub.code||"",name:pub.name||""});
          const linkedIds=Object.keys(pub.shops||{});
          if(linkedIds.length===0){ toUnbound(); return; }
          Promise.all(linkedIds.map(id=>readShop(id).catch(()=>null))).then(shopObjs=>{
            const linkedShops=shopObjs.filter(s=>s&&s.id);
            if(linkedShops.length===0){ toUnbound(); return; }
            dlog("企業ログイン店舗:",linkedShops.map(s=>s.name));
            setAllLinkedShops(linkedShops);
            const ckId=getCookie(CK_SHOP);
            const ssId=ssGet(SS_SHOP,null);
            const targetId=linkedShops.find(s=>s.id===ckId)?ckId:linkedShops.find(s=>s.id===ssId)?ssId:linkedShops[0].id;
            const targetShop=linkedShops.find(s=>s.id===targetId)||linkedShops[0];
            enterShop(targetShop);
          });
        }).catch(()=>toUnbound());
        return;
      }
      firebaseDB.ref(`accounts/${authUser.uid}/shops`).once("value").then(accSnap=>{
        const linked=accSnap.val(); // {shopId: true, ...} or null
        const linkedIds=linked?Object.keys(linked):[];
        if(linkedIds.length===0){ toUnbound(); return; } // Auth済みだが店舗未登録 → 登録画面へ
        Promise.all(linkedIds.map(id=>readShop(id).catch(()=>null))).then(shopObjs=>{
          const linkedShops=shopObjs.filter(s=>s&&s.id);
          if(linkedShops.length===0){ toUnbound(); return; } // 紐付いた店舗がglobal/shopsにない
          dlog("Auth店舗:",linkedShops.map(s=>s.name));
          setAllLinkedShops(linkedShops);
          // Cookie（最後に使った店舗）→ セッション復元 → 最初の店舗
          const ckId=getCookie(CK_SHOP);
          const ssId=ssGet(SS_SHOP,null);
          const targetId=linkedShops.find(s=>s.id===ckId)?ckId:linkedShops.find(s=>s.id===ssId)?ssId:linkedShops[0].id;
          const targetShop=linkedShops.find(s=>s.id===targetId)||linkedShops[0];
          enterShop(targetShop);
        });
      }).catch(()=>toUnbound());
      return;
    }
    // 2) Auth なし → Cookie チェック（単一店舗のみ）
    cookieFallback();
    }; // loadShops end

    return()=>{ if(firebaseDB) firebaseDB.ref(".info/connected").off(); };
  },[]);

  const shop=shops.find(s=>s.id===currentShopId)||shops[0];
  const sid=shop?.id||"default";
  // refとsessionStorage・Cookieを最新のsidに同期
  useEffect(()=>{
    currentShopIdRef.current=sid;
    if(!_hasUrlToken){
      ssSave(SS_SHOP,sid);
      // "default"はCookieに保存しない（リロード時の誤ログイン画面表示を防ぐ）
      if(sid&&sid!=="default"){
        setCookie(CK_SHOP,sid,365);  // 単一店舗のみ保存
      }
    }
  },[sid]);

  // 曜日別候補テンプレート（店舗単位: shops/{shopId}/templates）
  const[globalTemplates,setGlobalTemplates]=useState([]);
  const saveGlobalTemplates=useCallback(v=>{
    setGlobalTemplates(v);
    const targetSid=currentShopIdRef.current;
    if(!targetSid||targetSid==="default")return;
    ls(storeKey(targetSid,"templates_v6"),v);
    if(firebaseDB) firebaseDB.ref(fbPath(targetSid,"templates")).set(v).catch(e=>console.warn("templates保存失敗:",e));
  },[]);
  useEffect(()=>{ if(!_hasUrlToken) ssSave(SS_APID,apid); },[apid]);
  useEffect(()=>{ if(!_hasUrlToken) ssSave(SS_VIEW,view); },[view]);

  // startSubscriptions: Phase1内でsid確定直後に呼ぶ（useEffectに依存しない）
  const activeSubsRef=useRef([]); // 購読中のrefリスト（クリーンアップ用）
  const startSubscriptions=useCallback((targetSid,shopList)=>{
    if(!firebaseDB)return;
    // 既存の購読を解除
    activeSubsRef.current.forEach(r=>r.off());
    activeSubsRef.current=[];
    const refs=activeSubsRef.current;
    const on=(path,cb)=>{
      const r=firebaseDB.ref(path);
      r.on("value",snap=>cb(snap.val()),err=>console.warn("購読失敗:",path,err));
      refs.push(r);
    };
    dlog("購読開始 targetSid=",targetSid);
    try { window.posthog && window.posthog.identify(targetSid); } catch {}
    ph("app_loaded",{shop_id:targetSid});

    // 曜日別候補テンプレート（店舗単位: shops/{shopId}/templates）
    on(fbPath(targetSid,"templates"),val=>{
      if(!val){setGlobalTemplates([]);return;}
      const arr=Array.isArray(val)?val.filter(Boolean):Object.values(val);
      setGlobalTemplates(arr);
      ls(storeKey(targetSid,"templates_v6"),arr);
    });

    // 店舗リスト設定（shopListが明示的に渡された時のみ更新）
    dlog("startSubscriptions: shopList=",shopList?.length,shopList?.map(s=>s?.id));
    if(shopList&&shopList.length>0){
      dlog("startSubscriptions: 店舗リスト設定",shopList.map(s=>s?.id));
      setShops(shopList);
      ls("shift_shops_v6",shopList);
    }
    // shopListなし（店舗切り替え時）は既存のshopsを維持
    // settings
    on(fbPath(targetSid,"settings"),val=>{
      if(val&&typeof val==="object"){ setSettings(val); ls(storeKey(targetSid,"settings_v6"),val); }
      else{ setSettings(makeSettings(targetSid)); }
    });
    // periods
    on(fbPath(targetSid,"periods"),val=>{
      if(!val)return;
      const arr=typeof val==="object"&&!Array.isArray(val)
        ?Object.values(val).filter(p=>p&&p.id)
        :(Array.isArray(val)?val:Object.values(val)).filter(p=>p&&p.id);
      if(arr.length>0){
        // 旧データにはshopIdがない期間があり、店舗切替直後のtokens補完で他店舗のsidが
        // 混入し得るため、購読元のsidでここで補完しておく
        arr.forEach(p=>{ if(!p.shopId) p.shopId=targetSid; });
        arr.sort((a,b)=>new Date(b.startDate||0)-new Date(a.startDate||0));
        setPeriods(arr); ls(storeKey(targetSid,"periods_v6"),arr);
      }
    });
    // staff
    on(fbPath(targetSid,"staff"),val=>{
      if(!val){ setStaffList([]); return; }
      const arr=Array.isArray(val)
        ?val.filter(s=>s&&typeof s==="string")
        :typeof val==="object"?Object.values(val).filter(s=>s&&typeof s==="string"):[];
      setStaffList(arr); ls(storeKey(targetSid,"staff_v6"),arr);
    });
    // subs（リロード時にキャッシュを先に表示してからFirebaseで上書き）
    setSubs(lg(storeKey(targetSid,"subs_v6"),[]));
    on(fbPath(targetSid,"subs"),val=>{
      if(!val){ setSubs([]); ls(storeKey(targetSid,"subs_v6"),[]); return; }
      const arr=typeof val==="object"&&!Array.isArray(val)
        ?Object.values(val).filter(s=>s&&s.id)
        :(Array.isArray(val)?val:Object.values(val)).filter(s=>s&&s.id);
      arr.sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt));
      setSubs(arr); ls(storeKey(targetSid,"subs_v6"),arr);
      dlog("subs受信:",arr.length,"件 sid=",targetSid);
    });
    // accounts/<shopId>/plan（プラン読み込み）
    on(`accounts/${targetSid}/plan`,val=>{
      setPlan(DEV_PLAN_OVERRIDE||(val&&["free","pro","premium"].includes(val)?val:"free"));
    });
    // accounts/<shopId>/planExpiry（有効期限）
    on(`accounts/${targetSid}/planExpiry`,val=>{
      setPlanExpiry(val||null);
    });
    // accounts/<shopId>/paymentFailed（決済失敗フラグ）
    on(`accounts/${targetSid}/paymentFailed`,val=>{
      setPaymentFailed(!!val);
    });

    // settingsデフォルト書き込み（スタッフセッションはルールで拒否されるためcatchで握る）
    firebaseDB.ref(fbPath(targetSid,"settings")).once("value").then(snap=>{
      if(!snap.val()) firebaseDB.ref(fbPath(targetSid,"settings")).set(makeSettings(targetSid)).catch(()=>{});
    }).catch(()=>{});
  },[]);

  // ===================================================================
  // Auth ヘルパー関数
  // ===================================================================
  // 実ログイン（Google/メール）の直前に呼ぶ: LOCAL永続化してリロード後も複数店舗ログイン状態を維持する
  const _preRealSignIn=async()=>{
    try{ await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); }catch(e){ console.warn("setPersistence(LOCAL)失敗:",e); }
  };
  // 実ログイン終了後（完全サインアウト時）に匿名セッションへ戻す
  const _restoreAnonSession=async()=>{
    if(!firebaseAuth)return;
    try{ await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); }catch{}
    try{ await firebaseAuth.signInAnonymously(); }catch(e){ console.warn("匿名サインイン失敗:",e); }
  };

  // ===================================================================
  // オーナー権限（管理キー）管理
  // shops/{shopId}/private/adminKey と owners/{uid} で管理者を店舗に登録する。
  // - 未claim店舗: adminKeyを生成して初回claim（既存店舗の移行経路）
  // - claim済み店舗: localStorageの管理キーで owners に自uidを追加（端末追加・uid変化時の再claim）
  // - キーを持たない端末: 読み書きともルールで拒否される → ownerReadOnly=true
  // ===================================================================
  const[adminKeys,setAdminKeys]=useState(()=>lg(ADMIN_KEYS_LS,{})||{});
  const[ownerReadOnly,setOwnerReadOnly]=useState(false);
  const rememberAdminKey=useCallback((shopId,key)=>{
    setAdminKeyLS(shopId,key);
    setAdminKeys(m=>({...m,[shopId]:key}));
  },[]);
  const claimOwnership=useCallback(async(shopId)=>{
    const applyResult=ok=>{ if(shopId===currentShopIdRef.current) setOwnerReadOnly(!ok); return ok; };
    if(!firebaseDB||!firebaseAuth?.currentUser||!shopId||shopId==="default")return applyResult(false);
    const uid=firebaseAuth.currentUser.uid;
    let key=getAdminKeyLS(shopId);
    if(!key){
      // キー未保持: 未claim店舗ならadminKeyを生成して初回claim。
      // 締めルールではprivateの読みがオーナー限定のため未claim店舗でも読みは拒否される。
      // 読めない場合も「未claimなら書ける」書き込みルールを頼りに生成キーのsetを試す
      // （claim済み店舗の非オーナーはsetも拒否されるため乗っ取りは成立しない）
      try{
        const snap=await firebaseDB.ref(`shops/${shopId}/private/adminKey`).once("value");
        key=snap.val();
      }catch(e){ key=null; }
      if(!key){
        key=genSecureId(32);
        try{
          await firebaseDB.ref(`shops/${shopId}/private/adminKey`).set(key);
        }catch(e){
          dlog("adminKey取得不可（オーナー未登録端末）:",shopId);
          return applyResult(false);
        }
      }
    }
    try{
      await firebaseDB.ref(`shops/${shopId}/owners/${uid}`).set(key);
      rememberAdminKey(shopId,key);
      return applyResult(true);
    }catch(e){
      // 保存済みキーが古い（ローテーション済み）場合はルールで拒否される
      console.warn("オーナー登録失敗:",shopId,e);
      return applyResult(false);
    }
  },[rememberAdminKey]);

  // 店舗をアカウントに紐付け（Google/Apple ユーザーのみ）
  const linkShopToAccount=(uid,shopId)=>{
    if(!firebaseDB||!uid)return;
    firebaseDB.ref(`accounts/${uid}/shops/${shopId}`).set(true).catch(e=>console.warn("shop link失敗:",e));
  };

  // Auth UIDに紐付いた店舗一覧を直キー読みで取得（global/shopsの全件読みはしない）
  const fetchLinkedShops=async(uid)=>{
    const snap=await firebaseDB.ref(`accounts/${uid}/shops`).once("value");
    const linkedIds=Object.keys(snap.val()||{});
    const shopSnaps=await Promise.all(linkedIds.map(id=>firebaseDB.ref(`global/shops/${id}`).once("value").catch(()=>null)));
    return shopSnaps.map(s=>s&&s.val()).filter(s=>s&&s.id);
  };

  // ログイン直後の共通処理: 紐付き店舗を読み、先頭店舗でセッション開始
  const _enterLinkedShops=async(user)=>{
    ls(AUTH_LOGGED_OUT_LS,false); // 実ログイン成立: リロード後もこのセッションを維持対象にする
    const linkedShops=await fetchLinkedShops(user.uid);
    setAllLinkedShops(linkedShops);
    if(linkedShops.length>0){
      const targetShop=linkedShops[0];
      setShops([targetShop]);
      ls("shift_shops_v6",[targetShop]);
      currentShopIdRef.current=targetShop.id;
      setCurrentShopId(targetShop.id);
      startSubscriptions(targetShop.id,[targetShop]);
      setUnbound(false);
    } else {
      setUnbound(true);
    }
  };

  // Googleでサインイン
  const signInWithGoogle=async()=>{
    if(!firebaseAuth){setAuthError("Firebase Auth未初期化");return;}
    setAuthLoading(true);setAuthError("");
    try{
      await _preRealSignIn();
      const provider=new firebase.auth.GoogleAuthProvider();
      const result=await firebaseAuth.signInWithPopup(provider);
      const user=result.user;
      setAuthUser(user);
      ph("login",{method:"google"});
      // accounts/{uid}/shops を確認
      if(!firebaseDB){setAuthLoading(false);return;}
      await _enterLinkedShops(user);
    }catch(e){
      console.warn("Google sign-in failed:",e);
      if(e.code==="auth/popup-closed-by-user"||e.code==="auth/cancelled-popup-request"){}
      else setAuthError("Googleログインに失敗しました: "+e.message);
    }finally{setAuthLoading(false);}
  };

  // メール+パスワードでサインイン（共通処理）
  const _afterEmailAuth=async(user)=>{
    setAuthUser(user);
    ph("login",{method:"email"});
    if(!firebaseDB){setAuthLoading(false);return;}
    await _enterLinkedShops(user);
  };
  const signInWithEmail=async(email,password)=>{
    if(!firebaseAuth){setAuthError("Firebase Auth未初期化");return;}
    const ns="email";
    if(_isLocked(ns)){setAuthError(_lockMsg(ns));return;}
    setAuthLoading(true);setAuthError("");
    try{
      await _preRealSignIn();
      const result=await firebaseAuth.signInWithEmailAndPassword(email,password);
      _resetAttempts(ns);
      await _afterEmailAuth(result.user);
    }catch(e){
      console.warn("Email sign-in failed:",e);
      if(e.code==="auth/user-not-found"||e.code==="auth/wrong-password"||e.code==="auth/invalid-credential"){
        const n=_incAttempts(ns);
        const rem=_MAX_ATTEMPTS-n;
        if(_isLocked(ns)) setAuthError(_lockMsg(ns));
        else setAuthError(`メールアドレスまたはパスワードが正しくありません（残り${rem}回）`);
      }else if(e.code==="auth/invalid-email")
        setAuthError("メールアドレスの形式が正しくありません");
      else if(e.code==="auth/too-many-requests"){
        _incAttempts(ns);
        setAuthError("ログイン試行が多すぎます。しばらく待ってから再試行してください");
      }else setAuthError("ログインに失敗しました");
    }finally{setAuthLoading(false);}
  };
  // パスワードリセットメール送信
  const sendPasswordReset=async(email)=>{
    if(!firebaseAuth){setAuthError("Firebase Auth未初期化");return;}
    if(!email){setAuthError("メールアドレスを入力してください");return;}
    setAuthLoading(true);setAuthError("");
    try{
      await firebaseAuth.sendPasswordResetEmail(email);
      setAuthError("✓ パスワードリセットメールを送信しました");
    }catch(e){
      if(e.code==="auth/user-not-found") setAuthError("このメールアドレスは登録されていません");
      else setAuthError("送信に失敗しました: "+e.message);
    }finally{setAuthLoading(false);}
  };
  const signUpWithEmail=async(email,password)=>{
    if(!firebaseAuth){setAuthError("Firebase Auth未初期化");return;}
    setAuthLoading(true);setAuthError("");
    try{
      await _preRealSignIn();
      const result=await firebaseAuth.createUserWithEmailAndPassword(email,password);
      await _afterEmailAuth(result.user);
    }catch(e){
      console.warn("Email sign-up failed:",e);
      if(e.code==="auth/email-already-in-use")
        setAuthError("このメールアドレスは既に使用されています");
      else if(e.code==="auth/invalid-email")
        setAuthError("メールアドレスの形式が正しくありません");
      else if(e.code==="auth/weak-password")
        setAuthError("パスワードは6文字以上にしてください");
      else setAuthError("登録に失敗しました: "+e.message);
    }finally{setAuthLoading(false);}
  };

  // Cookie認証ユーザーがサインイン/登録して現在の店舗を紐付ける共通処理
  const _afterSignInAndLink=async(user)=>{
    ls(AUTH_LOGGED_OUT_LS,false); // 実ログイン成立: リロード後もこのセッションを維持対象にする
    setAuthUser(user);
    if(!firebaseDB)return;
    const shopId=currentShopIdRef.current;
    if(shopId&&shopId!=="default"){
      await firebaseDB.ref(`accounts/${user.uid}/shops/${shopId}`).set(true);
    }
  };
  const signInAndLinkGoogle=async()=>{
    if(!firebaseAuth)return{error:"Firebase Auth未初期化"};
    try{
      await _preRealSignIn();
      const provider=new firebase.auth.GoogleAuthProvider();
      const result=await firebaseAuth.signInWithPopup(provider);
      await _afterSignInAndLink(result.user);
      return{};
    }catch(e){
      if(e.code==="auth/popup-closed-by-user"||e.code==="auth/cancelled-popup-request")return{error:""};
      return{error:"Googleログインに失敗しました: "+e.message};
    }
  };
  const signInAndLinkEmail=async(email,password,isSignUp)=>{
    if(!firebaseAuth)return{error:"Firebase Auth未初期化"};
    try{
      await _preRealSignIn();
      let result;
      if(isSignUp){
        result=await firebaseAuth.createUserWithEmailAndPassword(email,password);
      }else{
        result=await firebaseAuth.signInWithEmailAndPassword(email,password);
      }
      await _afterSignInAndLink(result.user);
      return{};
    }catch(e){
      if(e.code==="auth/email-already-in-use")return{error:"このメールアドレスは既に使用されています"};
      if(e.code==="auth/user-not-found"||e.code==="auth/wrong-password"||e.code==="auth/invalid-credential")return{error:"メールアドレスまたはパスワードが正しくありません"};
      if(e.code==="auth/invalid-email")return{error:"メールアドレスの形式が正しくありません"};
      if(e.code==="auth/weak-password")return{error:"パスワードは6文字以上にしてください"};
      return{error:(isSignUp?"登録":"ログイン")+"に失敗しました: "+e.message};
    }
  };

  // authUser.providerData を最新状態に更新する
  const refreshAuthUser=async()=>{
    if(!firebaseAuth?.currentUser)return;
    try{
      await firebaseAuth.currentUser.reload();
      const u=firebaseAuth.currentUser;
      setAuthUser({...u,providerData:u.providerData?[...u.providerData]:[]});
    }catch(e){console.warn("reload失敗:",e);}
  };

  // Google / Apple 連携
  const linkProvider=async(type)=>{
    if(!firebaseAuth?.currentUser)return{error:"ログインが必要です"};
    try{
      let provider;
      if(type==="google"){
        provider=new firebase.auth.GoogleAuthProvider();
      }else{
        provider=new firebase.auth.OAuthProvider("apple.com");
        provider.addScope("name");provider.addScope("email");
      }
      await firebaseAuth.currentUser.linkWithPopup(provider);
      await refreshAuthUser();
      return{};
    }catch(e){
      if(e.code==="auth/popup-closed-by-user"||e.code==="auth/cancelled-popup-request")return{error:""};
      if(e.code==="auth/credential-already-in-use")return{error:"このアカウントは別のユーザーで使用済みです"};
      if(e.code==="auth/provider-already-linked")return{error:"既に連携済みです"};
      return{error:e.message};
    }
  };

  // メール OTP 送信（Cloud Function）
  const sendEmailOtp=async(email)=>{
    if(!firebaseFunctions)return{error:"Firebase未初期化"};
    try{
      await firebaseFunctions.httpsCallable("sendEmailOtp")({email});
      return{};
    }catch(e){return{error:e.message};}
  };

  // OTP 検証→ emailLink 取得→ linkWithEmailLink で連携
  const verifyAndLinkEmail=async(code,email)=>{
    if(!firebaseAuth?.currentUser||!firebaseFunctions)return{error:"Firebase未初期化"};
    try{
      const result=await firebaseFunctions.httpsCallable("verifyEmailOtp")({code});
      const{emailLink,email:confirmedEmail}=result.data;
      await firebaseAuth.currentUser.linkWithEmailLink(confirmedEmail,emailLink);
      await refreshAuthUser();
      return{};
    }catch(e){
      if(e.code==="auth/provider-already-linked")return{error:"既にメールアドレスと連携済みです"};
      if(e.code==="auth/email-already-in-use")return{error:"このメールアドレスは既に使用されています"};
      return{error:e.message};
    }
  };

  // プロバイダー連携解除
  const unlinkProvider=async(providerId)=>{
    if(!firebaseAuth?.currentUser)return{error:"ログインが必要です"};
    const providers=firebaseAuth.currentUser.providerData||[];
    if(providers.length<=1)return{error:"最後の連携方法は解除できません"};
    try{
      await firebaseAuth.currentUser.unlink(providerId);
      await refreshAuthUser();
      return{};
    }catch(e){return{error:e.message};}
  };

  // 店舗セッションのみログアウト（企業連携・Firebase Auth は維持）
  const doLogout=async()=>{
    // 前店舗の購読を解除（ログイン画面表示中に店舗データの受信を続けない）
    activeSubsRef.current.forEach(r=>r.off());
    activeSubsRef.current=[];
    delCookie(CK_SHOP);
    sessionStorage.clear();
    ls(AUTH_LOGGED_OUT_LS,true); // 明示ログアウト: 次回起動時に実ユーザーセッションを自動復元しない
    setCurrentShopId(null);
    setShops([]); // セッションの店舗リストをクリア（authUser・allLinkedShops は維持）
    setUnbound(true);
  };

  // 指定店舗のみセッションからログアウト（他店舗のセッション・企業連携は維持）
  const doShopLogout=(targetShopId)=>{
    const newShops=shops.filter(s=>s.id!==targetShopId);
    if(newShops.length===0){ doLogout(); return; } // 最後の1店舗は従来通り全体ログアウト
    if(currentShopId===targetShopId){
      const next=newShops[0];
      currentShopIdRef.current=next.id;
      setCurrentShopId(next.id);
      ssSave(SS_SHOP,next.id);
      startSubscriptions(next.id,newShops); // shops更新＋購読先切り替え
    }else{
      setShops(newShops);
      ls("shift_shops_v6",newShops);
    }
  };

  // Firebase Auth を含む完全サインアウト
  const doFullSignOut=async()=>{
    activeSubsRef.current.forEach(r=>r.off());
    activeSubsRef.current=[];
    if(firebaseAuth&&authUser){
      try{await firebaseAuth.signOut();}catch(e){console.warn("signOut失敗:",e);}
    }
    delCookie(CK_SHOP);
    sessionStorage.clear();
    ls(AUTH_LOGGED_OUT_LS,true); // 明示ログアウト: 次回起動時に実ユーザーセッションを自動復元しない
    setAuthUser(null);
    setCurrentShopId(null);
    setShops([]);
    setAllLinkedShops([]);
    setUnbound(true);
    // ルールがauth必須のため匿名セッションに戻す（戻せないとログイン画面の店舗コード参加等が失敗する）
    await _restoreAnonSession();
  };

  // 企業アカウント招待コード関数
  const generateInviteCode=async()=>{
    if(!authUser || !firebaseDB) return;
    setInviteCodeGenLoading(true);
    try{
      const code=genToken();
      const now=new Date();
      const expiresAt=new Date(now.getTime() + 24*60*60*1000);  // 24時間後
      // 旧コードを削除（管理キー入りの失効コードをDBに残さない）
      try{
        const prev=(await firebaseDB.ref(`accounts/${authUser.uid}/inviteCode`).once("value")).val();
        if(prev&&prev.code&&prev.code!==code) await firebaseDB.ref(`inviteCodes/${prev.code}`).remove();
      }catch{}
      await firebaseDB.ref(`accounts/${authUser.uid}/inviteCode`).set({
        code,
        createdAt:now.toISOString(),
        expiresAt:expiresAt.toISOString(),
        createdBy:authUser.email
      });
      // 参加者が招待主のaccountsを読まなくて済むよう、店舗紐付けのスナップショットを埋め込む
      const shopsSnap=await firebaseDB.ref(`accounts/${authUser.uid}/shops`).once("value");
      const shopIds=Object.keys(shopsSnap.val()||{});
      // 参加者が各店舗のオーナーになれるよう管理キーも埋め込む（自分が読める店舗のみ。24時間で失効するコード内に限定）
      const adminKeyMap={};
      await Promise.all(shopIds.map(async id=>{
        let k=getAdminKeyLS(id);
        if(!k){ try{ k=(await firebaseDB.ref(`shops/${id}/private/adminKey`).once("value")).val(); }catch{} }
        if(k) adminKeyMap[id]=k;
      }));
      await firebaseDB.ref(`inviteCodes/${code}`).set({
        uid:authUser.uid,
        expiresAt:expiresAt.toISOString(),
        expiresAtMs:expiresAt.getTime(), // 締めルールが期限切れコードの読み取りを拒否する判定用
        shops:shopsSnap.val()||null,
        adminKeys:Object.keys(adminKeyMap).length>0?adminKeyMap:null
      });
      setInviteCodeDisplay(code);
      dlog("招待コード生成:", code);
    }catch(e){
      console.warn("招待コード生成失敗:", e);
      tt("招待コードの生成に失敗しました: " + (e?.message||e?.code||"不明なエラー"));
    }finally{
      setInviteCodeGenLoading(false);
    }
  };

  const joinByInviteCode=async(code)=>{
    if(!firebaseDB || !authUser) return;
    let codeData;
    try{
      const codeSnap=await firebaseDB.ref(`inviteCodes/${code}`).once('value');
      codeData=codeSnap.val();
    }catch(e){
      // 締めルールでは期限切れ・存在しないコードの読み取り自体が拒否される（adminKey漏洩防止）
      if(e&&(e.code==='PERMISSION_DENIED'||/permission_denied/i.test(e.message||''))){
        setInviteError('無効または期限切れのコードです');
      }else{
        console.warn("招待コード参加失敗:", e);
        setInviteError('処理に失敗しました');
      }
      return;
    }
    try{
      if(!codeData || new Date()>=new Date(codeData.expiresAt)){
        setInviteError('無効または期限切れのコードです');
        return;
      }
      const foundUid=codeData.uid;
      // members に追加
      await firebaseDB.ref(`accounts/${foundUid}/members/${authUser.uid}`).set({
        email:authUser.email,
        joinedAt:new Date().toISOString(),
        role:'member'
      });
      // 管理キーが埋め込まれていれば保存（各店舗のオーナーclaimは管理者画面表示時に行われる）
      if(codeData.adminKeys){
        Object.entries(codeData.adminKeys).forEach(([id,k])=>{ if(id&&k) rememberAdminKey(id,k); });
      }
      // shops をマージ（上書きではなく update でマージ）
      // 新形式: コードに埋め込まれたスナップショットを使う（他人のaccountsを読まない）
      if(codeData.shops){
        await firebaseDB.ref(`accounts/${authUser.uid}/shops`).update(codeData.shops);
      }else{
        // 旧形式コードの互換（新ルール適用後は他人のaccounts読み取りが拒否されるため失敗し得る）
        const linkedShops=await firebaseDB.ref(`accounts/${foundUid}/shops`).once('value');
        if(linkedShops.val()){
          await firebaseDB.ref(`accounts/${authUser.uid}/shops`).update(linkedShops.val());
        }
      }
      setUnbound(false);
      setInviteCode("");
      dlog("招待コードで参加完了");
    }catch(e){
      console.warn("招待コード参加失敗:", e);
      setInviteError('処理に失敗しました');
    }
  };

  const linkExistingShopToAuth=async(shopId)=>{
    if(!authUser || !firebaseDB) return;
    try{
      await firebaseDB.ref(`accounts/${authUser.uid}/shops/${shopId}`).set(true);
      // allLinkedShops を全連携店舗で更新（直キー読み）
      const newLinked=await fetchLinkedShops(authUser.uid);
      setAllLinkedShops(newLinked);
      // shops（セッション）は変更しない
      dlog("既存店舗を企業アカウントに連携:", shopId);
    }catch(e){
      console.warn("連携失敗:", e);
    }
  };

  const unlinkShopFromAuth=async(targetShopId)=>{
    if(!authUser || !firebaseDB) return;
    if(allLinkedShops.length>0&&allLinkedShops.length<=1){tt("✕ 最後の店舗は解除できません");return;}
    if(allLinkedShops.length===0&&shops.length<=1){tt("✕ 最後の店舗は解除できません");return;}
    try{
      await firebaseDB.ref(`accounts/${authUser.uid}/shops/${targetShopId}`).remove();
      const remainingLinked=allLinkedShops.filter(s=>s.id!==targetShopId);
      setAllLinkedShops(remainingLinked);
      let newShops=shops.filter(s=>s.id!==targetShopId);
      if(currentShopId===targetShopId){
        // セッションのshopsが空になる場合は残りの連携店舗から次を選ぶ（TypeError防止）
        const next=newShops[0]||remainingLinked[0];
        if(next){
          if(newShops.length===0)newShops=[next];
          setCurrentShopId(next.id);
          startSubscriptions(next.id,newShops);
        }else{
          setCurrentShopId(null);
          setUnbound(true);
        }
      }
      setShops(newShops);
      ls("shift_shops_v6",newShops);
      tt("✓ 店舗の連携を解除しました");
    }catch(e){
      console.warn("連携解除失敗:", e);
      tt("✕ 解除に失敗しました");
    }
  };

  // ===================================================================
  // 企業アカウント（企業名＋企業コード＋パスワード）
  // 作成: メール/グーグルでログイン済みの本人が createCompany CF を呼ぶ。
  // ログイン: 企業コード＋パスワード → companyLogin CF → カスタムトークンでサインイン。
  // 企業ログインuid（company_{companyId}）は各店舗のownerに登録され管理権限を持つ。
  // ===================================================================
  const _callCF=async(name,payload)=>{
    if(!firebaseFunctions) throw new Error("Firebase未初期化");
    const r=await firebaseFunctions.httpsCallable(name)(payload||{});
    return r.data;
  };
  // 企業の連携店舗を読み込みセッション開始（企業ログイン後）
  const _enterCompanyShops=async(companyId)=>{
    const snap=await firebaseDB.ref(`companies/${companyId}/pub/shops`).once("value");
    const ids=Object.keys(snap.val()||{});
    const objs=await Promise.all(ids.map(id=>firebaseDB.ref(`global/shops/${id}`).once("value").catch(()=>null)));
    const linked=objs.map(s=>s&&s.val()).filter(s=>s&&s.id);
    setAllLinkedShops(linked);
    if(linked.length>0){
      const t=linked[0];
      setShops([t]); ls("shift_shops_v6",[t]);
      currentShopIdRef.current=t.id; setCurrentShopId(t.id);
      startSubscriptions(t.id,[t]); setUnbound(false);
    }else{ setUnbound(true); }
  };
  // 企業コード＋パスワードでログイン（ログイン画面から）
  const companyLoginAndEnter=async(code,password)=>{
    if(!firebaseAuth||!firebaseFunctions) return {error:"Firebase未初期化"};
    try{
      await _preRealSignIn();
      const {token,companyId,name}=await _callCF("companyLogin",{code,password});
      const result=await firebaseAuth.signInWithCustomToken(token);
      ls(AUTH_LOGGED_OUT_LS,false); // 実ログイン成立: リロード後もこのセッションを維持対象にする
      setAuthUser(result.user);
      setCompanyInfo({companyId,code:(code||"").trim().toUpperCase(),name});
      ph("login",{method:"company"});
      await _enterCompanyShops(companyId);
      return {};
    }catch(e){
      const msg=(e&&e.message)||"";
      if(/permission|not-found|正しく/.test(msg)) return {error:"企業コードまたはパスワードが正しくありません"};
      return {error:"ログインに失敗しました。しばらくしてから再度お試しください"};
    }
  };
  const _doCompanyLogin=async()=>{
    if(!companyCodeVal.trim()||!companyPwVal){setAuthError("企業コードとパスワードを入力してください");return;}
    setAuthLoading(true);setAuthError("");
    const {error}=await companyLoginAndEnter(companyCodeVal.trim(),companyPwVal);
    if(error)setAuthError(error);
    else{setCompanyLoginMode(false);setCompanyCodeVal("");setCompanyPwVal("");}
    setAuthLoading(false);
  };
  // 企業アカウント作成（メール/グーグルでログイン済みの本人）
  const createCompany=async(name,password)=>{
    if(!authUser||authUser.isAnonymous) return {error:"メールまたはGoogleでログインしてください"};
    try{
      const shopIds=(allLinkedShops.length>0?allLinkedShops:shops).map(s=>s&&s.id).filter(Boolean);
      const {companyId,code}=await _callCF("createCompany",{name,password,shopIds});
      setCompanyInfo({companyId,code,name});
      return {code};
    }catch(e){ return {error:(e&&e.message)||"作成に失敗しました"}; }
  };
  const changeCompanyPassword=async(newPassword)=>{
    if(!companyInfo) return {error:"企業アカウントがありません"};
    try{ await _callCF("changeCompanyPassword",{companyId:companyInfo.companyId,newPassword}); return {}; }
    catch(e){ return {error:(e&&e.message)||"変更に失敗しました"}; }
  };
  const renameCompany=async(name)=>{
    if(!companyInfo) return {error:"企業アカウントがありません"};
    try{ await _callCF("renameCompany",{companyId:companyInfo.companyId,name}); setCompanyInfo(c=>({...c,name})); return {}; }
    catch(e){ return {error:(e&&e.message)||"変更に失敗しました"}; }
  };
  // 店舗コードで企業に連携（SetTabの連携店舗一覧の追加ボタン）
  const linkStoreToCompany=async(rawCode)=>{
    if(!companyInfo) return {error:"企業アカウントがありません"};
    const {shopId}=parseShopCode(rawCode);
    try{
      const {name}=await _callCF("linkStoreToCompany",{companyId:companyInfo.companyId,shopId});
      await _refreshCompanyLinkedShops();
      return {name};
    }catch(e){ return {error:/not-found|正しく/.test((e&&e.message)||"")?"店舗コードが正しくありません":((e&&e.message)||"追加に失敗しました")}; }
  };
  const unlinkStoreFromCompany=async(shopId)=>{
    if(!companyInfo) return {error:"企業アカウントがありません"};
    try{
      await _callCF("unlinkStoreFromCompany",{companyId:companyInfo.companyId,shopId});
      await _refreshCompanyLinkedShops(shopId);
      return {};
    }catch(e){ return {error:(e&&e.message)||"解除に失敗しました"}; }
  };
  const _refreshCompanyLinkedShops=async(removedId)=>{
    if(!companyInfo) return;
    const snap=await firebaseDB.ref(`companies/${companyInfo.companyId}/pub/shops`).once("value");
    const ids=Object.keys(snap.val()||{});
    const objs=await Promise.all(ids.map(id=>firebaseDB.ref(`global/shops/${id}`).once("value").catch(()=>null)));
    const linked=objs.map(s=>s&&s.val()).filter(s=>s&&s.id);
    setAllLinkedShops(linked);
    if(removedId&&currentShopId===removedId){
      const next=linked[0];
      if(next){ const ns=[next]; setShops(ns); ls("shift_shops_v6",ns); currentShopIdRef.current=next.id; setCurrentShopId(next.id); startSubscriptions(next.id,ns); }
      else { setCurrentShopId(null); setUnbound(true); }
    }
  };
  // 作成者本人（メール/グーグル）ログイン時に自分の企業アカウント情報を復元
  useEffect(()=>{
    if(!firebaseDB||!authUser||authUser.isAnonymous||companyInfo)return;
    if(String(authUser.uid).startsWith("company_"))return; // 企業ログインセッションはcompanyLoginで設定済み
    let cancelled=false;
    firebaseDB.ref(`accounts/${authUser.uid}/company`).once("value").then(snap=>{
      const v=snap.val();
      if(!cancelled&&v&&v.companyId) setCompanyInfo({companyId:v.companyId,code:v.code||"",name:v.name||""});
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[authUser,companyInfo]);

  // URLにtokenが含まれるか（スタッフ専用モード・期間固定）
  const [urlLocked]=useState(()=>{ const p=parseUrl(); return !!(p&&p.token); });

  // 管理者セッションのオーナーlazy claim（既存店舗の移行・端末追加時の再claim・冪等）
  // スタッフURL（urlLocked）では実行しない
  useEffect(()=>{
    if(!firebaseDB||urlLocked||!ready)return;
    if(view!=="admin")return;
    if(!sid||sid==="default")return;
    let cancelled=false;
    claimOwnership(sid).then(ok=>{ if(!cancelled) setOwnerReadOnly(!ok); });
    return()=>{ cancelled=true; };
  },[ready,sid,view,urlLocked,claimOwnership]);

  // tokens逆引きインデックスの補完（既存期間の自動移行・冪等）。管理者セッションのみ実行
  useEffect(()=>{
    if(!firebaseDB||urlLocked||!ready)return;
    if(!sid||sid==="default")return;
    periods.forEach(p=>{
      if(!p||!p.urlToken||!p.id)return;
      if(p.shopId&&p.shopId!==sid)return; // 店舗切替直後の古いstate混入を防ぐ
      firebaseDB.ref(`tokens/${p.urlToken}`).set({shopId:p.shopId||sid,periodId:p.id}).catch(()=>{});
    });
  },[periods,sid,ready,urlLocked]);

  // ===================================================================
  // Phase3: URLなし時のapid初期化（セッション復元優先）
  // ===================================================================
  useEffect(()=>{
    if(!ready||urlResolved)return;
    if(periods.length===0)return; // periodsが届くまで待機
    // URLトークンがある場合はPhase1で解決済みなのでPhase3では何もしない
    if(_hasUrlToken){
      // apidはPhase1でセット済み。未セットの場合だけperiods[0]を使う
      if(!apid&&periods.length>0) setApid(periods[0].id);
      setUrlResolved(true);
      return;
    }
    // URLなし: セッションに保存されたapidがperiodsに存在するか確認
    const savedApid=ssGet(SS_APID,null);
    const restored=savedApid?periods.find(p=>p.id===savedApid):null;
    if(restored){
      setApid(restored.id);
    } else if(!apid){
      setApid(periods[0].id);
    }
    setUrlResolved(true);
  },[ready,periods,urlResolved]);

  // periodsが来たらapidを設定（URLで指定済みの場合は上書きしない）
  useEffect(()=>{
    if(!apid&&periods.length>0&&urlResolved){
      const latest=[...periods].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate))[0];
      setApid(latest.id);
    }
  },[periods,urlResolved]);

  // ===================================================================
  // 保存関数（Firebase + localStorage 二重書き）
  // ===================================================================
  const fbW=(path,val)=>{ if(firebaseDB) firebaseDB.ref(path).set(val).catch(e=>console.warn("書き込み失敗:",path,e)); };
  const touchLastActivity=useCallback(()=>{
    if(firebaseDB&&sid) firebaseDB.ref(`shops/${sid}/lastActivity`).set(new Date().toISOString()).catch(()=>{});
  },[sid]);
  const saveSettings=useCallback(v=>{ setSettings(v); ls(storeKey(sid,"settings_v6"),v); fbW(fbPath(sid,"settings"),v); touchLastActivity(); },[sid,touchLastActivity]);
  const savePeriods =useCallback(v=>{
    // 削除された期間のsubsとURLトークン逆引きをFirebaseから削除
    const deletedPeriods=periods.filter(p=>!v.find(np=>np.id===p.id));
    const deletedIds=deletedPeriods.map(p=>p.id);
    if(deletedIds.length>0&&firebaseDB){
      deletedPeriods.forEach(p=>{ if(p.urlToken) firebaseDB.ref(`tokens/${p.urlToken}`).remove().catch(()=>{}); });
      const newSubs=subs.filter(s=>!deletedIds.includes(s.periodId));
      setSubs(newSubs); ls(storeKey(sid,"subs_v6"),newSubs);
      firebaseDB.ref(fbPath(sid,"subs")).once("value").then(snap=>{
        const val=snap.val(); if(!val)return;
        const updates={};
        Object.keys(val).forEach(k=>{ if(deletedIds.includes(val[k]?.periodId)) updates[k]=null; });
        if(Object.keys(updates).length>0) firebaseDB.ref(fbPath(sid,"subs")).update(updates);
      });
    }
    setPeriods(v);
    ls(storeKey(sid,"periods_v6"),v);
    if(firebaseDB){
      const obj={};
      v.forEach(p=>{ if(p&&p.id) obj[p.id]=p; });
      firebaseDB.ref(fbPath(sid,"periods")).set(obj).catch(e=>console.warn("periods書き込み失敗:",e));
      // 追加された期間のURLトークン逆引きを登録（スタッフURLのO(1)解決用）
      v.filter(p=>p&&p.urlToken&&!periods.find(op=>op.id===p.id)).forEach(p=>{
        firebaseDB.ref(`tokens/${p.urlToken}`).set({shopId:sid,periodId:p.id}).catch(()=>{});
      });
    }
    touchLastActivity();
  },[sid,periods,subs,touchLastActivity]);
  const saveStaff   =useCallback(v=>{ setStaffList(v);ls(storeKey(sid,"staff_v6"),v);    fbW(fbPath(sid,"staff"),v); touchLastActivity();   },[sid,touchLastActivity]);
  const saveSubs    =useCallback((v,deletedId=null)=>{
    setSubs(v);
    ls(storeKey(sid,"subs_v6"),v);
    // Firebase には update() でマージ書き込み（set()は他端末データを上書きするためNG）
    // 差分書き込み: 直前のstate subs とオブジェクト参照比較し、新規・変更されたsubのみ書く
    // （呼び出し元はいずれも変更subを新しいオブジェクト参照で作っているため参照比較で検知できる）
    // deletedId を渡すと null セットで Firebase からも削除する
    if(firebaseDB){
      const prevSet=new Set(subs);
      const changed=v.filter(s=>s&&s.id&&!prevSet.has(s));
      const obj={};
      changed.forEach(s=>{ obj[s.id]=s; });
      if(deletedId) obj[deletedId]=null;
      if(Object.keys(obj).length>0){
        firebaseDB.ref(fbPath(sid,"subs")).update(obj).catch(e=>console.warn("subs書き込み失敗:",e));
      }
    }
    touchLastActivity();
  },[sid,subs,touchLastActivity]);
  const saveShops   =useCallback(v=>{
    const prev=shops;
    setShops(v);
    ls("shift_shops_v6",v);
    if(firebaseDB){
      // 変更された店舗のみ個別に書く（update一括だと非オーナー店舗が混ざった時に全体が拒否されるため）
      v.forEach(s=>{
        if(!s||!s.id)return;
        const old=prev.find(p=>p&&p.id===s.id);
        if(old&&JSON.stringify(old)===JSON.stringify(s))return;
        firebaseDB.ref(`global/shops/${s.id}`).set(s).catch(e=>console.warn("shops書き込み失敗:",s.id,e));
      });
    }
  },[shops]);

  // 1年間未更新の店舗の自動削除は Cloud Functions（purgeInactiveShops）のスケジュール実行に移行済み。
  // クライアント側での削除は端末時計ズレ・壊れたlastActivityによる誤削除リスクがあるため行わない。

  // ap: apidに対応するperiodを取得
  // 最新の期間 = startDateが最も新しいperiod
  const latestPeriod=periods.length>0?[...periods].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate))[0]:null;
  // urlLocked時はapidが確定するまで表示しない、それ以外は最新期間をデフォルトに
  const ap=periods.find(p=>p.id===apid)||(urlLocked?null:latestPeriod);
  const effectiveSettings=settings||makeSettings(sid);

  // 初期化失敗画面（匿名認証失敗/ハング・スタッフURL解決失敗。アプリ内ブラウザの制限や無効URLで発生）
  // ローディング判定より先に出す（urlLocked時はapidが確定しないため、これがないと無限ローディングになる）
  // 店舗に入れた（ready && currentShopId確定）場合は表示しない＝遅延後の初期化成功で自動的に消える
  if(initError&&(!ready||!currentShopId)) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#1A1A2E",flexDirection:"column",gap:16,padding:24}}>
      <ShiftyIcon size={64}/>
      <div style={{color:"white",fontSize:18,fontWeight:700}}>ページを開けませんでした</div>
      <div style={{color:"rgba(255,255,255,.7)",fontSize:14,lineHeight:1.8,maxWidth:340,textAlign:"left"}}>
        LINEやInstagramなどのアプリ内ブラウザでは、制限により読み込めないことがあります。<br/>
        メニューから「ブラウザで開く」「Safariで開く」を選ぶか、URLをコピーしてSafariやChromeに貼り付けて開いてください。<br/>
        それでも開けない場合は、管理者に最新のURLを確認してください。
      </div>
      <button onClick={()=>window.location.reload()} style={{marginTop:8,padding:"12px 36px",background:"#f87036",border:"none",borderRadius:10,fontSize:15,fontWeight:700,color:"white",cursor:"pointer"}}>再試行</button>
    </div>
  );

  // ローディング画面
  if(!ready||(urlLocked&&!apid)) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#1A1A2E",flexDirection:"column",gap:16}}>
      <ShiftyIcon size={64}/>
      <div style={{color:"white",fontSize:16,fontWeight:700}}>Shifty</div>
      <div style={{color:"rgba(255,255,255,.5)",fontSize:13}}>データを読み込み中...</div>
    </div>
  );

  // 引き継ぎコード（店舗コード / 管理コード shopId.adminKey）でログイン
  const applyInviteCode=()=>{
    const raw=inviteCode.trim();
    if(!raw){setInviteError("店舗コードを入力してください");return;}
    if(!firebaseDB){setInviteError("Firebase未接続です");return;}
    const{shopId:code,adminKey}=parseShopCode(raw);
    setInviteError("確認中...");
    firebaseDB.ref(`global/shops/${code}`).once("value").then(snap=>{
      const found=snap.val();
      if(found&&found.id===code){
        // 管理コードにadminKeyが含まれていれば保存（claimは管理者画面表示時のlazy claimで行う）
        if(adminKey) rememberAdminKey(code,adminKey);
        // Auth ユーザーがいればアカウントにも紐付け
        if(authUser) linkShopToAccount(authUser.uid,code);
        // 古いCookie を完全削除（複数店舗対応の遺跡削除）
        delCookie(CK_SHOP);
        try{ delCookie("ots_shopIds"); }catch{}
        // Cookie: 単一店舗のみ保存（上書き）
        setCookie(CK_SHOP,code,365);
        // localStorage も単一店舗のみに統一
        const newShops=[found];
        ls("shift_shops_v6",newShops);
        // sessionStorage もクリア（古い状態を削除）
        sessionStorage.clear();
        currentShopIdRef.current=code;
        setCurrentShopId(code);
        startSubscriptions(code,newShops);
        setUnbound(false);
        setInviteError("");
        setInviteCode("");
      } else {
        setInviteError("コードが正しくありません。もう一度確認してください。");
      }
    }).catch(()=>setInviteError("確認に失敗しました。もう一度お試しください。"));
  };

  // 新規店舗作成
  const createNewShop=()=>{
    dlog("createNewShop: 実行開始");
    if(!firebaseDB){setInviteError("Firebase未接続");return;}
    setInviteError("作成中...");
    const newShop=makeShop("新しい店舗");
    dlog("createNewShop: 新規店舗作成",newShop.id,newShop.name);
    firebaseDB.ref(`global/shops/${newShop.id}`).set(newShop).then(async()=>{
      // 作成者をオーナー登録（管理キー生成 → owners に自uidを追加）
      await claimOwnership(newShop.id);
      // Auth ユーザーはアカウントにも紐付け
      if(authUser) linkShopToAccount(authUser.uid,newShop.id);
      // Cookie: 単一店舗のみ保存（上書き）
      setCookie(CK_SHOP,newShop.id,365);
      // shops 配列にも新規店舗だけ
      const newShops=[newShop];
      setShops(newShops);
      currentShopIdRef.current=newShop.id;
      setCurrentShopId(newShop.id);
      startSubscriptions(newShop.id,newShops);
      setUnbound(false);
      setInviteError("");
    }).catch(()=>setInviteError("エラーが発生しました。再試行してください。"));
  };

  if(unbound&&authUser&&allLinkedShops.length>0) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0F172A",padding:"20px"}}>
      <div style={{background:"#1E293B",borderRadius:24,padding:"36px 28px",width:"100%",maxWidth:420,boxShadow:"0 12px 40px rgba(0,0,0,.5)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><ShiftyIcon size={64}/></div>
          <div style={{color:"#F1F5F9",fontSize:22,fontWeight:800,letterSpacing:"-0.5px"}}>Shifty</div>
          <div style={{color:"#94A3B8",fontSize:12,marginTop:4}}>{authUser.displayName||authUser.email||"ログイン中"}</div>
        </div>
        <div style={{color:"#CBD5E1",fontSize:13,fontWeight:700,marginBottom:12}}>店舗を選択してください</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
          {allLinkedShops.map(sh=>(
            <button key={sh.id} onClick={()=>{
              ls(AUTH_LOGGED_OUT_LS,false); // 店舗選択でセッション再開: リロード後の維持対象に戻す
              currentShopIdRef.current=sh.id;
              setCurrentShopId(sh.id);
              startSubscriptions(sh.id,[sh]);
              setUnbound(false);
            }} style={{width:"100%",padding:"14px 16px",background:"rgba(255,255,255,.06)",border:"1px solid #334155",borderRadius:12,color:"#F1F5F9",fontSize:14,fontWeight:600,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span>{sh.name}</span>
              <span style={{fontSize:12,color:"#64748B"}}>→</span>
            </button>
          ))}
        </div>
        <div style={{textAlign:"center",borderTop:"1px solid #1E3A5F",paddingTop:16}}>
          <button onClick={doFullSignOut} style={{background:"none",border:"none",color:"#64748B",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>
            別のアカウントでログインする
          </button>
        </div>
      </div>
    </div>
  );

  if(unbound) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0F172A",padding:"20px"}}>
      <div style={{background:"#1E293B",borderRadius:24,padding:"36px 28px",width:"100%",maxWidth:420,boxShadow:"0 12px 40px rgba(0,0,0,.5)"}}>
        {/* ロゴ */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><ShiftyIcon size={72}/></div>
          <div style={{color:"#F1F5F9",fontSize:24,fontWeight:800,letterSpacing:"-0.5px"}}>Shifty</div>
          <div style={{color:"#94A3B8",fontSize:13,marginTop:6}}>URLを送るだけでシフトが集まる</div>
        </div>

        {/* Auth ログインボタン */}
        {authLoading
          ?<div style={{textAlign:"center",color:"#94A3B8",padding:"20px 0",fontSize:14}}>⏳ 認証中...</div>
          :emailMode
            ?<div>
              {/* メール認証フォーム */}
              {(()=>{const locked=emailMode==="login"&&_isLocked("email");return(
              <React.Fragment>
              <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
                <button onClick={()=>{setEmailMode(null);setAuthError("");setEmailVal("");setPasswordVal("");setPassword2Val("");}}
                  style={{background:"none",border:"none",color:"#94A3B8",fontSize:13,cursor:"pointer",padding:"0 8px 0 0"}}>← 戻る</button>
                <div style={{color:"#F1F5F9",fontSize:16,fontWeight:700}}>{emailMode==="login"?"メールでログイン":"新規アカウント登録"}</div>
              </div>
              <input type="email" value={emailVal} onChange={e=>setEmailVal(e.target.value)}
                placeholder="メールアドレス" maxLength={254} disabled={locked}
                style={{width:"100%",padding:"12px 14px",background:"rgba(255,255,255,.06)",border:"1px solid #334155",borderRadius:10,color:"#F1F5F9",fontSize:16,outline:"none",marginBottom:10,opacity:locked?.5:1}}/>
              <input type="password" value={passwordVal} onChange={e=>setPasswordVal(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&emailMode==="login"&&!locked)signInWithEmail(emailVal,passwordVal);}}
                placeholder="パスワード（6文字以上）" maxLength={128} disabled={locked}
                style={{width:"100%",padding:"12px 14px",background:"rgba(255,255,255,.06)",border:"1px solid #334155",borderRadius:10,color:"#F1F5F9",fontSize:16,outline:"none",marginBottom:emailMode==="register"?10:16,opacity:locked?.5:1}}/>
              {emailMode==="register"&&<input type="password" value={password2Val} onChange={e=>setPassword2Val(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&password2Val===passwordVal)signUpWithEmail(emailVal,passwordVal);}}
                placeholder="パスワード（確認）" maxLength={128}
                style={{width:"100%",padding:"12px 14px",background:"rgba(255,255,255,.06)",border:"1px solid #334155",borderRadius:10,color:"#F1F5F9",fontSize:16,outline:"none",marginBottom:16}}/>}
              {authError&&<div style={{color:"#FF4757",fontSize:12,textAlign:"center",marginBottom:12,background:"rgba(255,71,87,.1)",padding:"8px 12px",borderRadius:8}}>{authError}</div>}
              <button disabled={locked||authLoading}
                onClick={()=>emailMode==="login"?signInWithEmail(emailVal,passwordVal):(password2Val!==passwordVal?setAuthError("パスワードが一致しません"):signUpWithEmail(emailVal,passwordVal))}
                style={{width:"100%",padding:"13px",background:locked?"#64748B":"#f87036",border:"none",borderRadius:12,color:"white",fontSize:15,fontWeight:700,cursor:locked?"not-allowed":"pointer",marginBottom:12}}>
                {emailMode==="login"?"ログイン":"アカウント作成"}
              </button>
              </React.Fragment>
              );})()}
              {emailMode==="login"
                ?<div style={{textAlign:"center",fontSize:12,color:"#64748B"}}>
                  <button onClick={()=>sendPasswordReset(emailVal)} style={{background:"none",border:"none",color:"#94A3B8",fontSize:12,cursor:"pointer",textDecoration:"underline",marginBottom:6,display:"block",width:"100%"}}>パスワードを忘れた方</button>
                  アカウントがない場合は
                  <button onClick={()=>{setEmailMode("register");setAuthError("");}} style={{background:"none",border:"none",color:"#f87036",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>新規登録</button>
                </div>
                :<div style={{textAlign:"center",fontSize:12,color:"#64748B"}}>既にアカウントがある場合は
                  <button onClick={()=>{setEmailMode("login");setAuthError("");}} style={{background:"none",border:"none",color:"#f87036",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>ログイン</button>
                </div>
              }
            </div>
            :companyLoginMode
            ?<div>
              <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
                <button onClick={()=>{setCompanyLoginMode(false);setAuthError("");setCompanyCodeVal("");setCompanyPwVal("");}}
                  style={{background:"none",border:"none",color:"#94A3B8",fontSize:13,cursor:"pointer",padding:"0 8px 0 0"}}>← 戻る</button>
                <div style={{color:"#F1F5F9",fontSize:16,fontWeight:700}}>企業コードでログイン</div>
              </div>
              <input value={companyCodeVal} onChange={e=>setCompanyCodeVal(e.target.value)}
                placeholder="企業コード" maxLength={16}
                style={{width:"100%",padding:"12px 14px",background:"rgba(255,255,255,.06)",border:"1px solid #334155",borderRadius:10,color:"#F1F5F9",fontSize:16,outline:"none",marginBottom:10,letterSpacing:"0.05em"}}/>
              <input type="password" value={companyPwVal} onChange={e=>setCompanyPwVal(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!authLoading)_doCompanyLogin();}}
                placeholder="パスワード" maxLength={128}
                style={{width:"100%",padding:"12px 14px",background:"rgba(255,255,255,.06)",border:"1px solid #334155",borderRadius:10,color:"#F1F5F9",fontSize:16,outline:"none",marginBottom:16}}/>
              {authError&&<div style={{color:"#FF4757",fontSize:12,textAlign:"center",marginBottom:12,background:"rgba(255,71,87,.1)",padding:"8px 12px",borderRadius:8}}>{authError}</div>}
              <button disabled={authLoading} onClick={_doCompanyLogin}
                style={{width:"100%",padding:"13px",background:"#f87036",border:"none",borderRadius:12,color:"white",fontSize:15,fontWeight:700,cursor:authLoading?"not-allowed":"pointer"}}>
                {authLoading?"ログイン中...":"ログイン"}
              </button>
              <div style={{textAlign:"center",fontSize:11,color:"#64748B",marginTop:12,lineHeight:1.6}}>企業コードとパスワードは、企業アカウントの作成者から共有されます。</div>
            </div>
            :<>
              <button onClick={signInWithGoogle} disabled={authLoading}
                style={{width:"100%",padding:"14px",background:"white",border:"none",borderRadius:14,color:"#1A1A2E",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}>
                <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Googleでログイン
              </button>
              <button onClick={()=>{setEmailMode("login");setAuthError("");}}
                style={{width:"100%",padding:"14px",background:"rgba(255,255,255,.05)",border:"1px solid #334155",borderRadius:14,color:"#CBD5E1",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                メールアドレスで続ける
              </button>
              <button onClick={()=>{setCompanyLoginMode(true);setAuthError("");}}
                style={{width:"100%",padding:"14px",background:"rgba(255,255,255,.05)",border:"1px solid #334155",borderRadius:14,color:"#CBD5E1",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                🏢 企業コードでログイン
              </button>
              {authError&&<div style={{color:"#FF4757",fontSize:12,textAlign:"center",marginBottom:12,background:"rgba(255,71,87,.1)",padding:"8px 12px",borderRadius:8}}>{authError}</div>}
            </>
        }

        {!emailMode&&!companyLoginMode&&<>
        {/* 区切り線 */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <div style={{flex:1,height:1,background:"#334155"}}/>
          <div style={{color:"#64748B",fontSize:12}}>または</div>
          <div style={{flex:1,height:1,background:"#334155"}}/>
        </div>
        </>}

        {/* 店舗コードで参加・新規作成（メール認証フォーム非表示時のみ） */}
        {!emailMode&&!companyLoginMode&&<>
        <div style={{fontSize:12,color:"#64748B",marginBottom:6,fontWeight:600}}>店舗コードで参加（この端末でのみ有効）</div>
        <div style={{display:"flex",gap:8,marginBottom:6}}>
          <input
            value={inviteCode}
            onChange={e=>{setInviteCode(e.target.value);setInviteError("");}}
            onKeyDown={e=>e.key==="Enter"&&applyInviteCode()}
            placeholder="店舗コードを貼り付け" maxLength={100}
            style={{flex:1,padding:"12px 14px",background:"rgba(255,255,255,.06)",border:"1px solid #334155",borderRadius:10,color:"#F1F5F9",fontSize:14,outline:"none"}}
          />
          <button onClick={applyInviteCode}
            style={{padding:"12px 16px",background:"#f87036",border:"none",borderRadius:10,color:"white",fontSize:14,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            参加
          </button>
        </div>
        {inviteError&&<div style={{color:inviteError==="確認中..."||inviteError==="作成中..."?"#F59E0B":"#FF4757",fontSize:12,marginBottom:8,textAlign:"center"}}>{inviteError}</div>}

        {/* 新規作成 */}
        <button onClick={createNewShop}
          style={{width:"100%",padding:"12px",background:"rgba(248,112,54,.12)",border:"1px solid rgba(248,112,54,.3)",borderRadius:10,color:"#f87036",fontSize:14,fontWeight:700,cursor:"pointer",marginTop:8}}>
          ＋ 新規店舗を作成する
        </button>

        {/* 注意書き */}
        <div style={{marginTop:20,fontSize:11,color:"#475569",textAlign:"center",lineHeight:1.7}}>
          複数端末でデータを同期するにはGoogle/メール認証をご利用ください。<br/>
          店舗コード・新規作成はこの端末のみ有効です。
        </div>
        </>}
      </div>
    </div>
  );

  return(
    <div style={{fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif",minHeight:"100vh",background:"var(--c-bg)"}}>
      {paymentToast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:2000,background:paymentToast==="success"?"#22C55E":"#6B7280",color:"white",padding:"13px 24px",borderRadius:12,fontWeight:700,fontSize:14,boxShadow:"0 4px 20px rgba(0,0,0,.3)",animation:"sI .3s"}}>
        {paymentToast==="success"?"★ Proプランへのアップグレードが完了しました！":"決済がキャンセルされました"}
      </div>}
      {appToast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:1000,background:"var(--c-card)",backdropFilter:"blur(10px)",color:"var(--c-text)",padding:"10px 20px",borderRadius:24,fontSize:14,fontWeight:500,border:"1px solid var(--c-border2)",boxShadow:"0 4px 16px var(--c-shadow)",whiteSpace:"nowrap"}}>{appToast}</div>}
      {/* 同期ステータスバー（接続中以外のみ表示） */}
      {syncStatus!=="online"&&<div style={{background:syncStatus==="offline"?"#F59E0B":"#6B7280",color:"white",fontSize:11,fontWeight:700,textAlign:"center",padding:"4px 8px"}}>
        {syncStatus==="offline"?"オフライン（再接続中...）":syncStatus==="no_config"?"Firebase未設定":"⏳ 接続中..."}
      </div>}
      {/* タブ: URLロック時はスタッフ画面のみ表示 */}
      {!urlLocked&&<div style={{display:"flex",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}>
        <button onClick={()=>setView("staff")} style={{flex:1,padding:"13px 0",border:"none",cursor:"pointer",fontSize:14,fontWeight:700,background:view==="staff"?"#f87036":"#1A1A2E",color:"white"}}>スタッフ画面</button>
        <button onClick={()=>setView("admin")} style={{flex:1,padding:"13px 0",border:"none",cursor:"pointer",fontSize:14,fontWeight:700,background:view==="admin"?"#16213E":"#111827",color:"white"}}>管理者画面</button>
      </div>}
      {/* メインコンテンツ */}
      {(urlLocked||view==="staff")
        ?<StaffView periods={periods} ap={ap} apid={apid} setApid={setApid} shopId={sid} settings={effectiveSettings} subs={subs} staffList={staffList} plan={plan}
            urlLocked={urlLocked}
            onSub={sub=>{
              const currentSid=currentShopIdRef.current||sid;
              const a=[...subs];const i=a.findIndex(s=>s.staffName===sub.staffName&&s.periodId===sub.periodId);
              if(i>=0)a[i]=sub;else a.push(sub);
              setSubs(a);
              ls(storeKey(currentSid,"subs_v6"),a);
              if(!firebaseDB)return Promise.reject(new Error("firebase未接続"));
              const path=`shops/${currentSid}/subs/${sub.id}`;
              return firebaseDB.ref(path).set(sub)
                .then(()=>dlog(sub.isUpdated?"変更保存完了":"提出完了","path=",path))
                .catch(e=>{console.warn("sub書き込み失敗:",path,e);throw e;});
            }}
            onDeleteSub={subId=>{
              const currentSid=currentShopIdRef.current||sid;
              const a=subs.filter(s=>s.id!==subId);
              setSubs(a);
              ls(storeKey(currentSid,"subs_v6"),a);
              if(firebaseDB) firebaseDB.ref(`shops/${currentSid}/subs/${subId}`).remove().catch(e=>console.warn("sub削除失敗:",e));
            }}
            shopName={shop?.name}/>
        :<AdminView settings={effectiveSettings} periods={periods} subs={subs} staffList={staffList} shops={shops}
              currentShopId={sid} saveSettings={saveSettings} savePeriods={savePeriods} saveSubs={saveSubs}
              saveStaff={saveStaff} saveShops={saveShops}
              adminCode={adminKeys[sid]?`${sid}.${adminKeys[sid]}`:sid} ownerReadOnly={ownerReadOnly}
              onRememberAdminKey={rememberAdminKey} onClaimShop={claimOwnership}
              globalTemplates={globalTemplates} saveGlobalTemplates={saveGlobalTemplates}
              plan={plan} planExpiry={planExpiry} paymentFailed={paymentFailed}
              setCurrentShopId={id=>{
                currentShopIdRef.current=id;
                setCurrentShopId(id);
                ssSave(SS_SHOP,id);
                startSubscriptions(id);
              }}
              startSubscriptions={startSubscriptions}
              logout={doLogout} logoutShop={doShopLogout} authUser={authUser} syncStatus={syncStatus}
              allLinkedShops={allLinkedShops}
              onSwitchToShop={id=>{
                const sh=allLinkedShops.find(s=>s.id===id);
                if(!sh)return;
                const alreadyIn=shops.some(s=>s.id===id);
                if(!alreadyIn){const ns=[...shops,sh];setShops(ns);ls("shift_shops_v6",ns);}
                currentShopIdRef.current=id;setCurrentShopId(id);ssSave(SS_SHOP,id);
                startSubscriptions(id); // shopListなし→既存のshopsリストを維持しつつ購読先だけ切り替え
              }}
              onLinkProvider={linkProvider} onSendEmailOtp={sendEmailOtp}
              onVerifyAndLinkEmail={verifyAndLinkEmail} onUnlinkProvider={unlinkProvider}
              onSignInAndLinkGoogle={signInAndLinkGoogle} onSignInAndLinkEmail={signInAndLinkEmail}
              onLinkExistingShop={linkExistingShopToAuth} onUnlinkShop={unlinkShopFromAuth}
              companyInfo={companyInfo} onCreateCompany={createCompany} onChangeCompanyPassword={changeCompanyPassword}
              onRenameCompany={renameCompany} onLinkStoreToCompany={linkStoreToCompany} onUnlinkStoreFromCompany={unlinkStoreFromCompany}/>
      }
    </div>
  );
}


// ===== React マウント =====
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
