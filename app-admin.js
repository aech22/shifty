// ============================================================
// Shifty - 管理者画面コンポーネント（app.js から分割 M-1）
// ============================================================


// ============================================================
// 管理者画面
// ============================================================
function AdminView({settings,periods,subs,staffList,shops,currentShopId,saveSettings,savePeriods,saveSubs,saveStaff,saveShops,setCurrentShopId,startSubscriptions,globalTemplates,saveGlobalTemplates,logout,logoutShop,authUser,syncStatus,plan="free",planExpiry=null,paymentFailed=false,allLinkedShops=[],onSwitchToShop,onLinkProvider,onSendEmailOtp,onVerifyAndLinkEmail,onUnlinkProvider,onSignInAndLinkGoogle,onSignInAndLinkEmail,onUnlinkShop,adminCode,ownerReadOnly=false,onRememberAdminKey,onClaimShop,companyInfo=null,onCreateCompany,onChangeCompanyPassword,onRenameCompany,onLinkStoreToCompany,onUnlinkStoreFromCompany}){
  const[tab,setTab]=useState(()=>ssGet(SS_TAB,"periods"));
  useEffect(()=>{ssSave(SS_TAB,tab);ph("admin_tab_changed",{tab});},[tab]);
  const[toast,setToast]=useState(null);
  const[shopMenuOpen,setShopMenuOpen]=useState(false);
  const[shopEditMode,setShopEditMode]=useState(false);
  const[shopCodeMode,setShopCodeMode]=useState(false); // コードで店舗追加モード
  const[shopCodeInput,setShopCodeInput]=useState("");
  const[shopCodeError,setShopCodeError]=useState("");
  const[upgradeReason,setUpgradeReasonRaw]=useState(null); // {type,limit,plan}
  const setUpgradeReason=r=>{if(r)ph("upgrade_modal_shown",{type:r.type,plan:r.plan});setUpgradeReasonRaw(r);};
  const tr=useRef();
  const shopMenuRef=useRef();
  const tt=m=>{setToast(m);clearTimeout(tr.current);tr.current=setTimeout(()=>setToast(null),2500);};
  const currentShop=shops.find(s=>s.id===currentShopId)||shops[0];

  // 店舗コード / 管理コード（shopId.adminKey）で既存店舗を追加（global/shopsの直キー読み。Enter/クリック共通）
  const addShopByCode=()=>{
    const raw=shopCodeInput.trim();
    if(!raw){setShopCodeError("コードを入力してください");return;}
    const{shopId:code,adminKey}=parseShopCode(raw);
    const lim=PLAN_LIMITS[plan]?.shops??Infinity;
    if(shops.length>=lim){setShopCodeMode(false);setShopMenuOpen(false);setUpgradeReason({type:"shops",limit:lim,plan});return;}
    if(!firebaseDB){setShopCodeError("Firebase未接続");return;}
    setShopCodeError("確認中...");
    firebaseDB.ref(`global/shops/${code}`).once("value").then(snap=>{
      const found=snap.val();
      if(!found||found.id!==code){setShopCodeError("コードが正しくありません");return;}
      if(adminKey&&onRememberAdminKey) onRememberAdminKey(code,adminKey);
      if(shops.find(s=>s.id===code)){
        if(!adminKey){setShopCodeError("既に追加済みです");return;}
        if(!onClaimShop){setShopCodeError("管理者登録に失敗しました");return;}
        setShopCodeError("確認中...");
        onClaimShop(code).then(ok=>{
          if(ok){
            setShopCodeMode(false);setShopMenuOpen(false);setShopCodeInput("");
            tt("✓ 管理コードを登録しました");
          }else{
            setShopCodeError("管理コードが正しくありません");
          }
        });
        return;
      }
      const newShops=[...shops,found];
      saveShops(newShops);
      if(authUser) firebaseDB.ref(`accounts/${authUser.uid}/shops/${code}`).set(true);
      setCurrentShopId(code);
      setShopCodeMode(false);setShopMenuOpen(false);setShopCodeInput("");
      tt(`✓ 「${found.name}」を追加しました`);
    }).catch(()=>setShopCodeError("確認に失敗しました"));
  };

  // 外タップでドロップダウンを閉じる
  useEffect(()=>{
    if(!shopMenuOpen)return;
    const handleOutside=(e)=>{
      if(shopMenuRef.current&&!shopMenuRef.current.contains(e.target)){
        setShopMenuOpen(false);
        setShopEditMode(false);
        setShopCodeMode(false);
      }
    };
    document.addEventListener("mousedown",handleOutside);
    document.addEventListener("touchstart",handleOutside);
    return()=>{
      document.removeEventListener("mousedown",handleOutside);
      document.removeEventListener("touchstart",handleOutside);
    };
  },[shopMenuOpen]);

  return(
    <div style={{background:"var(--c-bg)",minHeight:"calc(100vh - 44px)"}}>
      {/* 管理ヘッダー */}
      <div style={{background:"var(--c-card)",borderBottom:"1px solid #E5E7EB",padding:"12px 16px"}}>
        <div style={{maxWidth:900,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,flexShrink:0}}><ShiftyIcon size={34}/></div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)"}}>Shifty</div>
                {/* 店舗切り替えボタン: 常に表示（Cookie/Auth両対応） */}
                {true
                  ?<div ref={shopMenuRef} style={{position:"relative"}}>
                  <button onClick={()=>setShopMenuOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:5,background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,padding:"4px 10px",color:"var(--c-text2)",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    {currentShop?.name||"店舗"} ▼
                  </button>
                  {shopMenuOpen&&(
                    <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:"var(--c-card)",borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,.2)",zIndex:200,minWidth:180,overflow:"hidden"}}>
                      {shops.map(sh=>(
                        <div key={sh.id} style={{display:"flex",alignItems:"center",background:sh.id===currentShopId?"#FEF0E8":"white",borderBottom:"1px solid #F3F4F6"}}>
                          <div onClick={()=>{setCurrentShopId(sh.id);setShopMenuOpen(false);}} style={{flex:1,padding:"11px 16px",cursor:"pointer",fontSize:14,fontWeight:sh.id===currentShopId?700:400,color:sh.id===currentShopId?"#f87036":"#1A1A2E",display:"flex",alignItems:"center",gap:8}}>
                            {sh.id===currentShopId&&<span style={{fontSize:10}}>✓</span>}{sh.name}
                          </div>
                          <button onClick={e=>{e.stopPropagation();const isLast=shops.length<=1;const msg=isLast?`ログアウトしますか？（この端末の店舗セッションを終了します）`:`「${sh.name}」からログアウトしますか？（他の店舗のセッションは維持されます）`;if(!window.confirm(msg))return;setShopMenuOpen(false);if(logoutShop)logoutShop(sh.id);else logout();}} style={{padding:"6px 10px",margin:"0 8px",background:"rgba(255,71,87,.08)",border:"1px solid rgba(255,71,87,.2)",borderRadius:6,color:"#FF4757",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>ログアウト</button>
                        </div>
                      ))}
                      <div style={{borderTop:"1px solid var(--c-border)",padding:"8px 10px",display:"flex",gap:6}}>

                        <button onClick={()=>{setShopEditMode(v=>!v);setShopCodeMode(false);}} style={{flex:1,padding:"7px",background:"var(--c-bg)",border:"none",borderRadius:8,fontSize:12,fontWeight:600,color:"var(--c-text)",cursor:"pointer"}}>編集</button>
                        <button onClick={()=>{setShopCodeMode(v=>!v);setShopEditMode(false);setShopCodeInput("");setShopCodeError("");}} style={{flex:1,padding:"7px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,fontSize:12,fontWeight:600,color:"var(--c-text2)",cursor:"pointer"}}>コードで追加</button>
                        <button onClick={()=>{
                          const lim=PLAN_LIMITS[plan]?.shops??Infinity;
                          if(shops.length>=lim){setShopMenuOpen(false);setUpgradeReason({type:"shops",limit:lim,plan});return;}
                          const name=prompt("新しい店舗名を入力");if(!name)return;const ns=makeShop(name.trim());const newShops=[...shops,ns];saveShops(newShops);if(authUser&&firebaseDB)firebaseDB.ref(`accounts/${authUser.uid}/shops/${ns.id}`).set(true).catch(e=>console.warn("店舗紐付け失敗:",e));setCurrentShopId(ns.id);setShopMenuOpen(false);tt("✓ 店舗を追加しました");
                        }} style={{flex:1,padding:"7px",background:"#f87036",border:"none",borderRadius:8,fontSize:12,fontWeight:700,color:"white",cursor:"pointer"}}>＋ 新規</button>
                      </div>
                      {/* 店舗コードで追加パネル */}
                      {shopCodeMode&&<div style={{borderTop:"1px solid var(--c-border)",padding:"10px"}}>
                        <div style={{fontSize:11,color:"var(--c-text3)",marginBottom:6}}>店舗コードを入力して既存店舗を追加</div>
                        <div style={{display:"flex",gap:6}}>
                          <input value={shopCodeInput} onChange={e=>{setShopCodeInput(e.target.value);setShopCodeError("");}}
                            onKeyDown={e=>e.key==="Enter"&&addShopByCode()}
                            placeholder="店舗コードを貼り付け"
                            style={{flex:1,padding:"7px 10px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none"}}/>
                          <button onClick={addShopByCode} style={{padding:"7px 10px",background:"#f87036",border:"none",borderRadius:8,fontSize:12,fontWeight:700,color:"white",cursor:"pointer"}}>追加</button>
                        </div>
                        {shopCodeError&&<div style={{fontSize:11,color:shopCodeError==="確認中..."?"#F59E0B":"#FF4757",marginTop:4}}>{shopCodeError}</div>}
                      </div>}
                      {shopEditMode&&<div style={{borderTop:"1px solid #E5E7EB",padding:"10px"}}>
                        {shops.map(sh=>(
                          <div key={sh.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                            <span style={{flex:1,fontSize:13,color:"var(--c-text)"}}>{sh.name}</span>
                            <button onClick={()=>{const name=prompt("店舗名を変更",sh.name);if(!name)return;saveShops(shops.map(s=>s.id===sh.id?{...s,name:name.trim()}:s));tt("✓ 変更しました");}} style={{padding:"4px 8px",background:"var(--c-bg)",border:"none",borderRadius:6,fontSize:11,cursor:"pointer"}}>✏️</button>
                            {shops.length>1&&<button onClick={async()=>{if(!confirm(`「${sh.name}」を削除しますか？`))return;if(authUser&&onUnlinkShop){await onUnlinkShop(sh.id);}else{const ns=shops.filter(s=>s.id!==sh.id);saveShops(ns);if(sh.id===currentShopId){setCurrentShopId(ns[0].id);startSubscriptions(ns[0].id,ns);}tt("削除しました");}}} style={{padding:"4px 8px",background:"rgba(255,71,87,.1)",border:"none",borderRadius:6,fontSize:11,color:"#FF4757",cursor:"pointer"}}>🗑️</button>}
                          </div>
                        ))}
                      </div>}
                    </div>
                  )}
                </div>
                  :<span style={{fontSize:12,fontWeight:600,color:"var(--c-text3)",background:"var(--c-input)",padding:"4px 10px",borderRadius:8}}>{currentShop?.name||"店舗"}</span>
                }
              </div>
              <div style={{fontSize:11,color:"var(--c-text4)"}}>{authUser?`${authUser.displayName||authUser.email||"ログイン中"} · `:""}管理者画面</div>
            </div>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {[["periods","期間"],["staff","スタッフ"],["candidates","候補"],["submissions","提出一覧"],["edit","シフト作成"],["company","企業連携"],["mypage","マイページ"],["settings","設定"]].map(([id,l])=>(
              <button key={id} onClick={()=>setTab(id)} style={{padding:"7px 13px",background:tab===id?"#f87036":"var(--c-input)",border:`1px solid ${tab===id?"#f87036":"var(--c-border)"}`,borderRadius:7,color:tab===id?"white":"var(--c-text2)",fontSize:12,fontWeight:600,cursor:"pointer"}}>{l}</button>
            ))}
            <button onClick={logout} style={{padding:"7px 12px",background:"rgba(255,71,87,.08)",border:"1px solid rgba(255,71,87,.2)",borderRadius:7,color:"#FF4757",fontSize:12,cursor:"pointer"}}>ログアウト</button>
          </div>
        </div>
      </div>
      <div style={{maxWidth:900,margin:"0 auto",padding:"20px 14px 60px"}}>
        {ownerReadOnly&&<div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>🔒</span>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"#B45309",marginBottom:2}}>この端末は管理者として登録されていません（閲覧のみ）</div>
            <div style={{fontSize:12,color:"#92400E"}}>設定・シフトの変更を行うには、登録済みの端末の「設定タブ → 管理コード」を「店舗名ボタン → コードで追加」に入力してください。</div>
          </div>
        </div>}
        {paymentFailed&&<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>⚠️</span>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"#DC2626",marginBottom:2}}>決済に失敗しました</div>
            <div style={{fontSize:12,color:"#B91C1C"}}>登録中のカードに問題が発生しています。マイページ → 請求管理から支払い方法を更新してください。</div>
          </div>
          <button onClick={()=>setTab("mypage")} style={{padding:"6px 12px",background:"#DC2626",border:"none",borderRadius:7,color:"white",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>マイページへ</button>
        </div>}
        {tab==="periods"&&<PeriodsTab periods={periods} subs={subs} staffList={staffList} shops={shops} onSave={savePeriods} saveSubs={saveSubs} tt={tt} shopId={currentShopId} shopName={(shops.find(s=>s.id===currentShopId)||shops[0])?.name} plan={plan} onUpgrade={setUpgradeReason} settings={settings}/>}
        {tab==="staff"&&<StaffTab staffList={staffList} onSave={saveStaff} tt={tt} plan={plan} onUpgrade={setUpgradeReason} settings={settings} onSaveSettings={saveSettings} subs={subs} periods={periods} onRenameStaff={(oldName,newName)=>{
          const newList=staffList.map(n=>n===oldName?newName:n);
          saveStaff(newList);
          const newSubs=subs.map(s=>s.staffName===oldName?{...s,staffName:newName}:s);
          saveSubs(newSubs);
          // staffColorsのキーも更新
          const sc={...(settings.staffColors||{})};
          if(sc[oldName]!==undefined){sc[newName]=sc[oldName];delete sc[oldName];}
          saveSettings({...settings,staffColors:sc});
          tt(`✓ ${oldName} → ${newName} に変更しました`);
        }}/>}
        {tab==="candidates"&&<CandTab settings={settings} onSave={saveSettings} globalTemplates={globalTemplates} saveGlobalTemplates={saveGlobalTemplates} tt={tt} plan={plan}/>}
        {tab==="submissions"&&<SubsTab subs={subs} periods={periods} staffList={staffList} onSave={saveSubs} tt={tt} settings={settings} onSaveSettings={saveSettings} plan={plan}/>}
        {tab==="edit"&&<ShiftEditTab subs={subs} periods={periods} staffList={staffList} onSave={saveSubs} tt={tt} settings={settings} plan={plan} shopId={currentShopId} shopName={(shops.find(s=>s.id===currentShopId)||shops[0])?.name} onUpgrade={setUpgradeReason} allLinkedShops={allLinkedShops}/>}
        {tab==="company"&&<CompanyTab settings={settings} onSave={saveSettings} tt={tt} shopId={currentShopId} staffList={staffList} authUser={authUser} shops={shops} allLinkedShops={allLinkedShops} onSwitchToShop={onSwitchToShop} onUnlinkShop={onUnlinkShop} companyInfo={companyInfo} onCreateCompany={onCreateCompany} onChangeCompanyPassword={onChangeCompanyPassword} onRenameCompany={onRenameCompany} onLinkStoreToCompany={onLinkStoreToCompany} onUnlinkStoreFromCompany={onUnlinkStoreFromCompany}/>}
        {tab==="mypage"&&<MyPageTab plan={plan} planExpiry={planExpiry} staffList={staffList} periods={periods} shopId={currentShopId} tt={tt} onUpgrade={setUpgradeReason}/>}
        {tab==="settings"&&<SetTab settings={settings} onSave={saveSettings} subs={subs} saveSubs={saveSubs} tt={tt} syncStatus={syncStatus} plan={plan} shopId={currentShopId} authUser={authUser} onLinkProvider={onLinkProvider} onSendEmailOtp={onSendEmailOtp} onVerifyAndLinkEmail={onVerifyAndLinkEmail} onUnlinkProvider={onUnlinkProvider} onSignInAndLinkGoogle={onSignInAndLinkGoogle} onSignInAndLinkEmail={onSignInAndLinkEmail} staffList={staffList} adminCode={adminCode} ownerReadOnly={ownerReadOnly}/>}
      </div>
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"var(--c-card)",backdropFilter:"blur(10px)",color:"var(--c-text)",padding:"10px 20px",borderRadius:24,fontSize:14,fontWeight:500,zIndex:999,border:"1px solid var(--c-border2)",boxShadow:"0 4px 16px var(--c-shadow)"}}>{toast}</div>}
      {upgradeReason&&<UpgradeModal reason={upgradeReason} currentPlan={plan} shopId={currentShopId} onClose={()=>setUpgradeReason(null)}/>}
    </div>
  );
}

// ===== シフト作成タブ =====
function ShiftEditTab({subs,periods,staffList,onSave,tt,settings,plan,shopId,shopName,onUpgrade,allLinkedShops=[]}){
  const firstPid=(periods[0]||{}).id||"";
  const[selPid,setSelPid]=useState(firstPid);
  const[localEdits,setLocalEdits]=useState({});
  const[heatEdits,setHeatEdits]=useState({}); // blur確定値のみ（集計・ヒートマップ用）
  const[focusKey,setFocusKey]=useState(null); // フォーカス中セルkey（黄色ハイライト抑制用）
  const[cellTip,setCellTip]=useState(null); // {x,y,value}
  const[fitAll,setFitAll]=useState(false);
  const[pdfModal,setPdfModal]=useState(false);
  const[pdfBusy,setPdfBusy]=useState(false);
  const[containerW,setContainerW]=useState(800);
  const[containerLeft,setContainerLeft]=useState(0);
  const outerRef=useRef(null);
  const mainScrollRef=useRef(null);
  const periodScrollRef=useRef(null);
  const weekScrollRef=useRef(null);
  const restScrollRef=useRef(null);
  const gridBodyRef=useRef(null);
  const gridTheadRef=useRef(null);
  const[measuredRowH,setMeasuredRowH]=useState(null);
  const[measuredTheadH,setMeasuredTheadH]=useState(null);

  const isPremium=plan==="premium";

  // 企業連携の他店舗データ（略称・提出シフト）。ヘルプ判定・重複チェックに使用
  const[companyData,setCompanyData]=useState({}); // {shopId:{name,abbrs:[],workMap:Map(name|date→shift)}}
  useEffect(()=>{
    const otherShops=(allLinkedShops||[]).filter(s=>s&&s.id&&s.id!==shopId);
    if(!firebaseDB||otherShops.length===0){setCompanyData({});return;}
    let cancelled=false;
    Promise.all(otherShops.map(os=>
      Promise.all([
        firebaseDB.ref(`shops/${os.id}/settings/shopAbbrs`).once("value").catch(()=>null),
        firebaseDB.ref(`shops/${os.id}/subs`).once("value").catch(()=>null),
      ]).then(([aS,sS])=>{
        const abbrs=aS?Object.values(aS.val()||{}).filter(v=>typeof v==="string"):[];
        const workMap=new Map();
        // 出勤・退勤が両方揃ったシフトを優先（同名の部分データsubに完全データが隠されるのを防ぐ）
        const hasBoth=sh=>!!((sh.adjustedStart??sh.start)&&(sh.adjustedEnd??sh.end));
        Object.values((sS&&sS.val())||{}).forEach(sub=>{
          if(!sub||!sub.staffName||!sub.shifts)return;
          Object.entries(sub.shifts).forEach(([d,sh])=>{
            if(!sh||sh.status!=="work")return;
            const k=sub.staffName+"|"+d;
            const cur=workMap.get(k);
            if(!cur||(!hasBoth(cur)&&hasBoth(sh)))workMap.set(k,sh);
          });
        });
        return[os.id,{name:os.name,abbrs,workMap}];
      })
    )).then(entries=>{if(!cancelled)setCompanyData(Object.fromEntries(entries));});
    return()=>{cancelled=true;};
  },[shopId,allLinkedShops,selPid]);
  // 略称→他店舗の逆引き
  const abbrToShop=useMemo(()=>{
    const m={};
    Object.entries(companyData).forEach(([id,d])=>(d.abbrs||[]).forEach(a=>{if(a&&!m[a])m[a]={id,name:d.name};}));
    return m;
  },[companyData]);

  // periodsが非同期ロード後に届いた場合、selPidが""のままなら先頭に補正
  useEffect(()=>{
    if(periods.length>0&&!periods.find(p=>p.id===selPid)){
      setSelPid(periods[0].id);
    }
  },[periods]);

  // コンテナ幅・左オフセットの計測（fitAll用）
  useEffect(()=>{
    const update=()=>{
      if(outerRef.current){
        const rect=outerRef.current.getBoundingClientRect();
        setContainerLeft(rect.left);
        setContainerW(window.innerWidth-16);
      }
    };
    update();
    window.addEventListener("resize",update);
    return()=>window.removeEventListener("resize",update);
  },[]);

  const period=periods.find(p=>p.id===selPid)||null;
  const dates=period?gd(period.startDate,period.endDate):[];
  const realStaff=staffList.filter(n=>!isSpacer(n));
  const spIdx=staffList.findIndex(n=>isSpacer(n));
  const hallStaff=spIdx>-1?staffList.slice(spIdx+1).filter(n=>!isSpacer(n)):[];

  // 横スクロール同期（onScroll経由で確実に同期）
  const syncingRef=useRef(false);
  const syncScrollH=useCallback((src)=>{
    if(syncingRef.current)return;
    syncingRef.current=true;
    [mainScrollRef,periodScrollRef,weekScrollRef,restScrollRef].forEach(r=>{if(r.current&&r.current!==src)r.current.scrollLeft=src.scrollLeft;});
    requestAnimationFrame(()=>{syncingRef.current=false;});
  },[]);

  const toDecimal=t=>{if(!t)return"";const[h,m]=t.split(":").map(Number);return m===0?String(h):String(h+m/60);};
  const parseTime=v=>{
    if(!v||!v.trim())return"";const s=v.trim();
    if(/^\d{1,2}:\d{2}$/.test(s)){const[h,m]=s.split(":").map(Number);if(h>=0&&h<=30&&m>=0&&m<60)return`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;return"";}
    if(/^\d+\.\d+$/.test(s)){const n=parseFloat(s);const h=Math.floor(n);const m=Math.round((n-h)*60);if(h>=0&&h<=30&&m>=0&&m<60)return`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;return"";}
    if(/^\d+$/.test(s)){const n=parseInt(s,10);if(s.length<=2){if(n>=0&&n<=30)return`${String(n).padStart(2,"0")}:00`;}else{const h=Math.floor(n/100);const m=n%100;if(h>=0&&h<=30&&m>=0&&m<60)return`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}return"";}
    return"";
  };
  // サフィックス抽出: h=ホール出張, k=キッチン入り, x=ヘルプ(カウント外), 任意文字列=そのまま保持, ""=通常
  const extractNote=raw=>{
    if(!raw||!raw.trim())return{numeric:"",note:""};
    const s=raw.trim();
    const m=s.match(/^([\d.:]+)(.*)$/s);
    if(!m||!m[1])return{numeric:"",note:"x"}; // 数値部なし(文字のみ) → ヘルプ
    const suf=m[2].trim();
    if(!suf)return{numeric:m[1],note:""};
    const l=suf.toLowerCase();
    if(l==="h")return{numeric:m[1],note:"h"};
    if(l==="k")return{numeric:m[1],note:"k"};
    if(l==="x")return{numeric:m[1],note:"x"};
    return{numeric:m[1],note:suf}; // 日本語含む任意サフィックスはそのまま保持
  };

  // 提出データの逆引きインデックス（subs.findのO(n)探索をO(1)に。ヒートマップ・集計の再計算コスト削減）
  const subsByKey=useMemo(()=>{
    const m=new Map();
    subs.forEach(s=>{
      if(!s||!s.periodId||!s.staffName)return;
      const k=s.periodId+"|"+s.staffName;
      if(!m.has(k))m.set(k,s); // 重複時はfindと同じ「最初の1件」を採用
    });
    return m;
  },[subs]);
  // 週間集計用: スタッフ名+日付 → 出勤シフト（期間をまたいだ検索の高速化）
  const workShiftByStaffDate=useMemo(()=>{
    const m=new Map();
    subs.forEach(s=>{
      if(!s||!s.staffName||!s.shifts)return;
      Object.entries(s.shifts).forEach(([d,sh])=>{
        const k=s.staffName+"|"+d;
        if(sh&&sh.status==="work"&&!m.has(k))m.set(k,sh);
      });
    });
    return m;
  },[subs]);
  // Excel出力（expXl）と同じ別名解決: 登録名で見つからなければ別名で提出されたsubにフォールバック
  const staffAliases=settings?.staffAliases||{};
  const _getSub=(name)=>{
    const exact=subsByKey.get(selPid+"|"+name);
    if(exact)return exact;
    const aliases=staffAliases[name]||[];
    for(const alias of aliases){
      const s=subsByKey.get(selPid+"|"+alias);
      if(s)return s;
    }
    return undefined;
  };
  // 管理者編集値(adjustedXxx)優先、なければスタッフ提出値(xxx)にフォールバック
  const getStoredTime=(name,date,field)=>{const sh=_getSub(name)?.shifts?.[date];if(!sh)return"";return(field==="start"?(sh.adjustedStart??sh.start):(sh.adjustedEnd??sh.end))||"";};
  const getStoredNote=(name,date,field)=>{const sh=_getSub(name)?.shifts?.[date];if(!sh)return"";return(field==="start"?(sh.adjustedStartNote??sh.startNote):(sh.adjustedEndNote??sh.endNote))||"";};
  const getVal=(name,date,field)=>{const key=`${name}|${date}|${field}`;if(key in localEdits)return localEdits[key];const t=toDecimal(getStoredTime(name,date,field));const n=getStoredNote(name,date,field);return t?(t+n):""};
  const handleChange=(name,date,field,value)=>{setLocalEdits(prev=>({...prev,[`${name}|${date}|${field}`]:value}));};
  const handleBlur=(name,date,field,rawValue)=>{
    if(!isPremium)return;
    const{numeric,note}=extractNote(rawValue);
    const parsed=parseTime(numeric);const display=parsed?(toDecimal(parsed)+note):"";
    const ekey=`${name}|${date}|${field}`;
    setLocalEdits(prev=>({...prev,[ekey]:display}));
    setHeatEdits(prev=>({...prev,[ekey]:display})); // blur確定値を集計/ヒートマップ用に反映
    // 管理者編集はadjustedXxxに保存（スタッフ提出のstart/endを保護）
    const adjField=field==="start"?"adjustedStart":"adjustedEnd";
    const nk=field==="start"?"adjustedStartNote":"adjustedEndNote";
    let newSubs=[...subs];const idx=newSubs.findIndex(s=>s.periodId===selPid&&s.staffName===name);
    if(idx===-1){if(!parsed)return;const ns={id:genSecureId(24),periodId:selPid,staffName:name,shopId,shifts:{},comment:"",submittedAt:new Date().toISOString()};ns.shifts[date]={status:"work",[adjField]:parsed,[nk]:note};newSubs.push(ns);}
    else{const sub={...newSubs[idx]};const shifts={...(sub.shifts||{})};const sd={...(shifts[date]||{status:"work"})};if(parsed){sd[adjField]=parsed;sd[nk]=note;sd.status="work";}else{delete sd[adjField];delete sd[nk];}shifts[date]=sd;sub.shifts=shifts;newSubs[idx]=sub;}
    onSave(newSubs);
  };

  // 集計/ヒートマップ用は heatEdits（blur確定値）を参照
  const getEffHHMM=(name,date,field,src=heatEdits)=>{const key=`${name}|${date}|${field}`;if(key in src){const{numeric}=extractNote(src[key]);return parseTime(numeric)||"";}return getStoredTime(name,date,field);};
  // シフトのノート取得: 管理者調整値優先、なければスタッフ提出値（edits最優先）
  const getShiftNote=(name,date,src=heatEdits)=>{
    for(const field of["start","end"]){const key=`${name}|${date}|${field}`;if(key in src){const{note}=extractNote(src[key]);if(note)return note;}const sh=_getSub(name)?.shifts?.[date];const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";const origNk=field==="start"?"startNote":"endNote";const n=(sh?.[adjNk]??sh?.[origNk]);if(n)return n;}return"";
  };
  // フィールド別ノート取得（edits最優先→管理者調整値→スタッフ提出値）
  const getFieldNote=(name,date,field,src=heatEdits)=>{
    const key=`${name}|${date}|${field}`;
    if(key in src)return extractNote(src[key]).note||"";
    const sh=_getSub(name)?.shifts?.[date];
    const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";
    const origNk=field==="start"?"startNote":"endNote";
    return(sh?.[adjNk]??sh?.[origNk])||"";
  };
  // 他店舗ヘルプ判定: 出勤セルの略称=ランチ帯ヘルプ、退勤セルの略称=ディナー帯ヘルプ、両方=終日ヘルプ
  const getHelpInfo=(name,date,src=heatEdits)=>{
    const startShop=abbrToShop[getFieldNote(name,date,"start",src)]||null;
    const endShop=abbrToShop[getFieldNote(name,date,"end",src)]||null;
    if(!startShop&&!endShop)return null;
    return{startShop,endShop,full:!!(startShop&&endShop)};
  };
  // ヒートマップ休憩判定用: 実効start/endを反映した一時シフトオブジェクト
  const getHeatShift=(name,date)=>{
    const base=_getSub(name)?.shifts?.[date];
    const st=getEffHHMM(name,date,"start"),en=getEffHHMM(name,date,"end");
    if(!st||!en)return null;
    return{...(base||{}),status:"work",adjustedStart:st,adjustedEnd:en};
  };
  const timeToMin=t=>{if(!t)return null;const[h,m]=t.split(":").map(Number);return h*60+m;};
  // section: "kit" or "hall" — サフィックスh/kで所属を上書き、xはどちらにも入らない
  // 列hr[hr*60,(hr+1)*60)にカウント: stM<(hr+1)*60 && enM>hr*60
  // 日付×スタッフの実効出勤情報（開始・延長込み終了・休憩・所属）を事前計算しておき、
  // ヒートマップの各セルは区間判定だけで数える（従来は日付×時間×スタッフ×subs.findの全走査で入力が重かった）
  const heatData=useMemo(()=>{
    const perDate={};
    dates.forEach(date=>{
      const arr=[];
      realStaff.forEach(name=>{
        let stM=timeToMin(getEffHHMM(name,date,"start"));let enM=timeToMin(getEffHHMM(name,date,"end"));
        if(stM===null||enM===null)return;
        const hsh=getHeatShift(name,date);
        // 退勤延長分を末尾に加算してから境界判定（延長中の時間帯も出勤扱いにする）
        if(hsh){const ot=getOT(name,settings,hsh);if(ot>0)enM+=ot;}
        const note=getShiftNote(name,date);
        if(note==="x")return;
        // 他店舗ヘルプ帯は自店舗のカウントから除外（終日=全除外、出勤側=〜17時、退勤側=17時〜）
        const help=getHelpInfo(name,date);
        if(help){
          if(help.full)return;
          if(help.startShop)stM=Math.max(stM,1020);
          if(help.endShop)enM=Math.min(enM,1020);
          if(stM>=enM)return;
        }
        // 休憩適用者の休憩区間（時間帯セルを完全に覆う場合にカウント除外するため保持）
        const breaks=(hsh&&isBreakEligible(hsh))
          ?getBreaksFor(settings,date,name,hsh).map(br=>({bs:timeToMin(br.start),be:timeToMin(br.end)})).filter(b=>b.bs!==null&&b.be!==null)
          :[];
        const section=note==="h"?"hall":note==="k"?"kit":(hallStaff.includes(name)?"hall":"kit");
        arr.push({stM,enM,breaks,section});
      });
      perDate[date]=arr;
    });
    return perDate;
  },[subs,heatEdits,settings,selPid,staffList,periods,companyData]);
  // 店舗間シフト重複エラー: 勤務先登録済みスタッフが他店舗と時間重複していないか（blur確定値ベース）
  const dupErrors=useMemo(()=>{
    const errs={}; // {name|date: 他店舗名}
    const wpAll=settings.staffWorkplaces||{};
    if(Object.keys(companyData).length===0)return errs;
    realStaff.forEach(name=>{
      const wps=Object.keys(wpAll[name]||{}).filter(id=>companyData[id]);
      if(wps.length===0)return;
      dates.forEach(date=>{
        let s=timeToMin(getEffHHMM(name,date,"start")),e=timeToMin(getEffHHMM(name,date,"end"));
        if(s===null||e===null)return;
        // ヘルプ指定帯は他店舗勤務が前提なので判定から除外
        const help=getHelpInfo(name,date);
        if(help){
          if(help.full)return;
          if(help.startShop)s=Math.max(s,1020);
          if(help.endShop)e=Math.min(e,1020);
          if(s>=e)return;
        }
        for(const osid of wps){
          const osh=companyData[osid].workMap.get(name+"|"+date);
          if(!osh)continue;
          const os=timeToMin(osh.adjustedStart??osh.start),oe=timeToMin(osh.adjustedEnd??osh.end);
          if(os===null||oe===null)continue;
          if(os<e&&oe>s){errs[`${name}|${date}`]=companyData[osid].name;break;}
        }
      });
    });
    return errs;
  },[companyData,heatEdits,subs,settings,selPid,staffList,periods]);
  const countHeat=(section,date,hr)=>{
    const h0=hr*60,h1=(hr+1)*60;
    let cnt=0;
    (heatData[date]||[]).forEach(e=>{
      if(e.section!==section)return;
      if(e.stM>=h1||e.enM<=h0)return;
      if(e.breaks.some(b=>b.bs<=h0&&b.be>=h1))return;
      cnt++;
    });
    return cnt;
  };
  // heatHours: 候補管理の時間帯 + 実際に入力された時間帯を包含した範囲
  const heatHours=(()=>{
    const hrs=new Set();
    // 候補管理から時間帯を収集
    const allCands=[...(settings.candidates||[]),...Object.values(settings.weekdayCandidates||{}).flat(),...Object.values(settings.dateCandidates||{}).flat()].filter(c=>!c.closed&&c.start&&c.end);
    allCands.forEach(c=>{const sh=parseInt(c.start);const eh=parseInt(c.end);for(let h=sh;h<=eh;h++)hrs.add(h);});
    // 実際の提出・入力値から時間帯を収集（退勤延長分も含める）
    subs.filter(s=>s.periodId===selPid).forEach(sub=>{Object.values(sub.shifts||{}).forEach(sh=>{if(sh.status!=="work")return;const st=sh.adjustedStart??sh.start,en=sh.adjustedEnd??sh.end;if(st)hrs.add(parseInt(st));if(en){hrs.add(parseInt(en));const ot=getOT(sub.staffName,settings,sh);if(ot>0){const[h,m]=en.split(":").map(Number);hrs.add(Math.floor((h*60+m+ot)/60));}}});});
    // heatEdits（blur確定値）からも収集
    Object.entries(heatEdits).forEach(([,v])=>{const{numeric}=extractNote(v);const p=parseTime(numeric);if(p)hrs.add(parseInt(p));});
    if(hrs.size===0){for(let h=9;h<=24;h++)hrs.add(h);}
    const mn=Math.min(...hrs),mx=Math.max(...hrs);
    return Array.from({length:mx-mn+1},(_,i)=>mn+i);
  })();

  // 期間別勤務時間: 同月の全期間を両方表示
  const perD=period?pd(period.startDate):null;
  const sameMoPeriods=period?[...periods].filter(p=>{const d=pd(p.startDate);return d.getFullYear()===perD.getFullYear()&&d.getMonth()===perD.getMonth();}).sort((a,b)=>a.startDate.localeCompare(b.startDate)):[];
  const getPeriodMin=(pid,name)=>{
    const p=periods.find(pp=>pp.id===pid);if(!p)return 0;
    const sub=subsByKey.get(pid+"|"+name); // 日ループの外で1回だけ引く
    if(!sub)return 0;
    return gd(p.startDate,p.endDate).reduce((acc,d)=>{const sh=sub.shifts?.[d];return acc+(sh&&sh.status==="work"?calcNetWorkMinutes(sh,getBreaksFor(settings,d,name,sh),getOT(name,settings,sh)):0);},0);
  };

  // 週間勤務時間（前の期間を跨ぐ）
  const prevPeriod=period?([...periods].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate)).find(p=>new Date(p.endDate)<new Date(period.startDate))||null):null;
  const weeks=(()=>{
    if(!period)return[];
    const allD=[...(prevPeriod?gd(prevPeriod.startDate,prevPeriod.endDate):[]),...gd(period.startDate,period.endDate)];
    const wkSet=new Set();allD.forEach(d=>{const dt=pd(d),dow=dt.getDay(),mon=new Date(dt);mon.setDate(dt.getDate()-(dow===0?6:dow-1));wkSet.add(fd(mon));});
    return[...wkSet].sort();
  })();
  const getWeekMin=(monStr,name)=>{
    let tot=0;for(let i=0;i<7;i++){const dd=new Date(pd(monStr));dd.setDate(pd(monStr).getDate()+i);const ds=fd(dd);const sh=workShiftByStaffDate.get(name+"|"+ds);if(sh)tot+=calcNetWorkMinutes(sh,getBreaksFor(settings,ds,name,sh),getOT(name,settings,sh));}
    return tot;
  };

  // "h"なし勤務時間フォーマット
  // "h"なし勤務時間フォーマット
  const fmtH=min=>{if(!min)return"";const h=Math.floor(min/60);const m=min%60;return m===0?String(h):`${h}:${String(m).padStart(2,"0")}`;};
  // 画面の集計表用: 4桁以内に抑える（100時間以上は時間のみ）。列幅がグリッドとずれるのを防ぐ
  const fmtH4=min=>{if(!min)return"";const h=Math.floor(min/60);const m=min%60;if(h>=100)return String(h);return m===0?String(h):`${h}:${String(m).padStart(2,"0")}`;};
  // 日付を"日(曜)"のみ表示（月不要）
  const fmtDL=date=>{const d=pd(date);return`${d.getDate()}(${WD[d.getDay()]})`;};
  const BD="1px solid var(--c-border)";const BD2="1px solid var(--c-border2)";const CRD="var(--c-card)";
  // サイドパネル: 通常表示+split時かつ左右に十分な余白があるPC幅のみ（携帯・タブレットではグリッド下に表示）
  const hasSplit=hallStaff.length>0;
  const rawPanelW=Math.max(0,containerLeft-4);
  const hasPanel=hasSplit&&!fitAll&&rawPanelW>=150;
  const useBreakout=hasPanel||fitAll;
  const panelW=hasPanel?rawPanelW:0;
  // 熱マップ行高: 計測値があれば使う、なければフォールバック
  const heatRowH=measuredRowH||48;
  // 中央グリッド幅 = ブレイクアウト時はビューポート幅 - パネル×2
  const centerW=useBreakout?(window.innerWidth-panelW*2-24):containerW;
  // gridStaff: spacer列を含む列描画リスト（集計はrealStaffのまま）
  const gridStaff=staffList;
  const colW=fitAll?Math.max(24,Math.floor((centerW-90)/Math.max(1,gridStaff.length))):39;
  const spacerCell=(key)=>(<td key={key} style={{width:colW,minWidth:colW,maxWidth:colW,borderLeft:BD2,background:"var(--c-input2, var(--c-input))",padding:0}}></td>);
  const spacerTh=(key)=>(<th key={key} style={{width:colW,minWidth:colW,maxWidth:colW,borderLeft:BD2,background:"var(--c-input2, var(--c-input))",padding:0}}></th>);
  // gridStaffを列描画: spacer位置はspacerFnで空セル、実スタッフはrenderFnで描画
  const mapGridCols=(renderFn,spacerFn)=>gridStaff.map((name,i)=>isSpacer(name)?spacerFn(`sp${i}`):renderFn(name,i));
  const AI2={width:colW-3,fontSize:16,border:BD,borderRadius:3,padding:"1px 1px",background:"var(--c-input)",color:"var(--c-text)",textAlign:"center",boxSizing:"border-box"};
  const SD={position:"sticky",left:0,background:CRD,zIndex:2,whiteSpace:"nowrap",width:90,minWidth:90,padding:"2px 4px",fontSize:16,fontWeight:600,borderRight:BD2};
  // スタッフ名色（Excel書き出しと同ルール: staffColors[name]==="red"→赤）
  const nameColor=name=>((settings.staffColors||{})[name]==="red"?"#e53935":"var(--c-text)");
  const VTH=(name)=>(
    <th key={name} style={{width:colW,minWidth:colW,maxWidth:colW,padding:"2px",textAlign:"center",borderLeft:BD,borderBottom:BD2,background:CRD,verticalAlign:"middle"}}>
      <div style={{writingMode:"vertical-rl",textOrientation:"mixed",height:72,display:"inline-block",fontSize:11,fontWeight:600,color:nameColor(name),whiteSpace:"nowrap",textAlign:"center",lineHeight:String(colW-4)+"px"}}>{name}</div>
    </th>
  );
  // 集計用の実効値（heatEdits＝blur確定値ベース）
  const getHeatVal=(name,date,field)=>{const key=`${name}|${date}|${field}`;if(key in heatEdits)return heatEdits[key];const t=toDecimal(getStoredTime(name,date,field));return t||"";};
  // その日出勤しているか（0.5出勤含む）: start か end のどちらかに有効値がある
  const isWorkDay=(name,date)=>{
    const shift=_getSub(name)?.shifts?.[date];
    const s=parseFloat(getHeatVal(name,date,"start"));
    const e=parseFloat(getHeatVal(name,date,"end"));
    const hasVal=!isNaN(s)||!isNaN(e);
    if(shift&&shift.status==="holiday"&&!hasVal)return false;
    return hasVal;
  };
  // 休みカウント: 17時基準で前半/後半それぞれ出勤なし=0.5、終日なし=1
  const restCounts=React.useMemo(()=>{
    const result={};
    realStaff.forEach(name=>{
      let count=0;
      dates.forEach(date=>{
        const shift=_getSub(name)?.shifts?.[date];
        const s=parseFloat(getHeatVal(name,date,"start"));
        const e=parseFloat(getHeatVal(name,date,"end"));
        if((!shift||shift.status==="holiday")&&isNaN(s)&&isNaN(e)){count+=1;return;}
        if(!isNaN(s)&&s<17){}else{count+=0.5;}
        if(!isNaN(e)&&e>17){}else{count+=0.5;}
      });
      result[name]=count;
    });
    return result;
  },[realStaff,dates,subs,heatEdits,selPid]);
  // 連勤カウント: 期間内の最大連続出勤日数（0.5出勤も出勤扱い）
  const consecCounts=React.useMemo(()=>{
    const result={};
    realStaff.forEach(name=>{
      let maxC=0,cur=0;
      dates.forEach(date=>{
        if(isWorkDay(name,date)){cur++;maxC=Math.max(maxC,cur);}else cur=0;
      });
      result[name]=maxC;
    });
    return result;
  },[realStaff,dates,subs,heatEdits,selPid]);
  const kitMax=Math.max(1,...dates.flatMap(date=>heatHours.map(hr=>countHeat("kit",date,hr))));
  const hallMax=hallStaff.length>0?Math.max(1,...dates.flatMap(date=>heatHours.map(hr=>countHeat("hall",date,hr)))):1;
  const hBg=(n,mx)=>n===0?"transparent":`rgba(248,112,54,${0.15+(n/mx)*0.75})`;

  // セルの色: 緑(スタッフ変更) > 赤(店舗間重複) > 青(他店舗ヘルプ) > 黄(サフィックスnote) > 行背景。フォーカス中セルは通常背景。
  const cellBgFor=(name,date,field,rb)=>{
    const key=`${name}|${date}|${field}`;
    if(_getSub(name)?.shifts?.[date]?.changed===true)return"rgba(52,199,89,.30)";
    if(focusKey===key)return rb; // 編集中は通常背景
    if(dupErrors[`${name}|${date}`])return"rgba(255,71,87,.35)";
    // note有無を localEdits/保存値から判定
    let note="";
    if(key in localEdits){note=extractNote(localEdits[key]).note;}
    else{const sh=_getSub(name)?.shifts?.[date];const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";const origNk=field==="start"?"startNote":"endNote";note=(sh?.[adjNk]??sh?.[origNk])||"";}
    if(note&&abbrToShop[note])return"#BFDBFE"; // 他店舗ヘルプ
    if(note)return"#FFF3B0";
    return rb;
  };
  const cellTextColor=(name,date,field)=>{
    const key=`${name}|${date}|${field}`;
    if(_getSub(name)?.shifts?.[date]?.changed===true)return undefined;
    if(focusKey===key)return undefined;
    let note="";
    if(key in localEdits){note=extractNote(localEdits[key]).note;}
    else{const sh=_getSub(name)?.shifts?.[date];const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";const origNk=field==="start"?"startNote":"endNote";note=(sh?.[adjNk]??sh?.[origNk])||"";}
    return note?"#333":undefined;
  };
  // ダブルクリック/ダブルタップ: そのシフトのchangedフラグをトグル（Firebase永続化）
  const toggleChanged=(name,date)=>{
    if(!isPremium)return;
    const sub=_getSub(name);const sd0=sub?.shifts?.[date];
    if(!sub||!sd0)return;
    const newSubs=[...subs];const idx=newSubs.findIndex(s=>s.id===sub.id);if(idx===-1)return;
    const ns={...newSubs[idx]};const shifts={...(ns.shifts||{})};const sd={...shifts[date]};
    if(sd.changed===true)delete sd.changed;else sd.changed=true;
    shifts[date]=sd;ns.shifts=shifts;newSubs[idx]=ns;
    onSave(newSubs);
  };
  const lastTapRef=useRef({key:null,t:0});

  // グリッドの実際の行高・thead高を測定してサイドパネルと同期
  useEffect(()=>{
    if(gridBodyRef.current){
      const rows=gridBodyRef.current.querySelectorAll("tr");
      if(rows.length>=2){
        const h1=rows[0].getBoundingClientRect().height;
        const h2=rows[1].getBoundingClientRect().height;
        if(h1>0&&h2>0)setMeasuredRowH(h1+h2);
      }
    }
    // table top → 最初のtbody行 top の距離を直接計測（border-collapse誤差を回避）
    if(mainScrollRef.current&&gridBodyRef.current?.firstElementChild){
      const tableEl=mainScrollRef.current.querySelector('table');
      const firstRow=gridBodyRef.current.firstElementChild;
      if(tableEl){
        const offset=Math.round(firstRow.getBoundingClientRect().top-tableEl.getBoundingClientRect().top);
        if(offset>0)setMeasuredTheadH(offset);
      }
    }
  },[selPid,dates.length,colW]);

  const HeatTable=({label,section,maxC,rowH,theadH,sectionLabel})=>(
    <div style={{overflowX:"auto",border:BD,borderRadius:8,flex:rowH?undefined:1,minWidth:rowH?undefined:200}}>
      {label&&<div style={{fontSize:12,fontWeight:700,padding:"4px 8px",borderBottom:BD,color:"var(--c-text2)"}}>{label}</div>}
      <table style={{borderCollapse:"collapse",minWidth:"max-content"}}>
        <thead><tr style={theadH?{height:theadH}:{}}>
          <th style={{position:"sticky",left:0,background:CRD,zIndex:2,padding:"3px 6px",fontSize:10,fontWeight:600,borderBottom:BD2,minWidth:52,whiteSpace:"nowrap",verticalAlign:"bottom"}}>
            {sectionLabel&&<div style={{fontSize:10,fontWeight:700,color:"var(--c-text2)",marginBottom:4}}>{sectionLabel}</div>}
            日付
          </th>
          {heatHours.map(hr=><th key={hr} style={{minWidth:22,padding:"2px 1px",fontSize:10,textAlign:"center",borderLeft:BD,borderBottom:BD2,background:CRD,fontWeight:500,verticalAlign:"bottom"}}>{hr}</th>)}
        </tr></thead>
        <tbody>{dates.map(date=>{
          const d=pd(date);const day=d.getDay();const isHol=isHoliday(date);
          const dc=(day===0||isHol)?"#e53935":day===6?"#1976d2":"var(--c-text)";
          return(<tr key={date} style={rowH?{height:rowH}:{}}>
            <td style={{position:"sticky",left:0,background:CRD,zIndex:1,padding:"2px 6px",fontSize:15,fontWeight:600,color:dc,borderBottom:BD,whiteSpace:"nowrap",verticalAlign:"middle"}}>{fmtDL(date)}</td>
            {heatHours.map((hr,hi)=>{const n=countHeat(section,date,hr);return(
              <td key={hi} style={{minWidth:22,padding:"2px 1px",textAlign:"center",fontSize:11,borderLeft:BD,borderBottom:BD,background:hBg(n,maxC),color:n===0?"var(--c-text4)":"var(--c-text)",fontWeight:n>0?600:400,verticalAlign:"middle"}}>{n||""}</td>
            );})}
          </tr>);
        })}</tbody>
      </table>
    </div>
  );

  // 集計表：scrollRefを外から渡してスクロール同期、sticky背景を確実に塗る
  const SummaryTable=({title,rowLabel,rows,scrollRef,onScroll})=>(
    <div style={{marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:600,marginBottom:6,color:"var(--c-text2)"}}>{title}</div>
      <div ref={scrollRef} onScroll={onScroll} style={{overflowX:fitAll?"hidden":"auto",border:BD,borderRadius:8}}>
        <table style={{borderCollapse:"collapse",width:fitAll?"100%":"unset",minWidth:fitAll?"unset":"max-content"}}>
          <thead><tr>
            <th style={{position:"sticky",left:0,background:CRD,zIndex:2,padding:0,fontSize:11,fontWeight:600,borderBottom:BD2,width:90,minWidth:90,maxWidth:90}}><div style={{width:90,padding:"4px 8px",boxSizing:"border-box",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{rowLabel}</div></th>
            {mapGridCols(name=>VTH(name),spacerTh)}
          </tr></thead>
          <tbody>{rows.map(row=>{
            const bg=row._bg||"transparent";const stickyBg=row._bg?`linear-gradient(${row._bg},${row._bg}),${CRD}`:CRD;
            return(<tr key={row.id} style={{background:bg}}>
              <td style={{position:"sticky",left:0,background:stickyBg,zIndex:1,padding:0,fontSize:11,fontWeight:row._bold?700:400,color:row._color||"var(--c-text2)",borderBottom:BD,width:90,minWidth:90,maxWidth:90}}><div style={{width:90,padding:"4px 8px",boxSizing:"border-box",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{row.label}</div></td>
              {mapGridCols(name=>{const min=row.getMin(name);const vio=row._violateFn?row._violateFn(name,min):false;const cellBg=vio?"rgba(255,71,87,.15)":bg;return(
                <td key={name} style={{width:colW,minWidth:colW,maxWidth:colW,boxSizing:"border-box",padding:"3px 2px",borderLeft:BD,borderBottom:BD,textAlign:"center",fontSize:11,background:cellBg,fontWeight:(row._bold||vio)&&min>0?700:400,color:min>0?(vio?"#FF4757":(row._color||"var(--c-text2)")):"var(--c-text4)"}}>{min>0?fmtH4(min):""}</td>
              );},spacerCell)}
            </tr>);
          })}</tbody>
        </table>
      </div>
    </div>
  );

  // 期間行：前半/後半/月計を常に3行表示
  const mo2=period?pd(period.startDate).getMonth()+1:0;
  const firstHalf=sameMoPeriods.find(p=>pd(p.startDate).getDate()<=15)||null;
  const secondHalf=sameMoPeriods.find(p=>pd(p.startDate).getDate()>15)||null;
  const periodRows=[
    {id:firstHalf?.id||"nofirst",label:firstHalf?.label||`${mo2}月前半`,getMin:name=>firstHalf?getPeriodMin(firstHalf.id,name):0,
      _bold:firstHalf?.id===selPid,_color:firstHalf?.id===selPid?"#f87036":undefined,_bg:firstHalf?.id===selPid?"rgba(248,112,54,0.15)":undefined},
    {id:secondHalf?.id||"nosecond",label:secondHalf?.label||`${mo2}月後半`,getMin:name=>secondHalf?getPeriodMin(secondHalf.id,name):0,
      _bold:secondHalf?.id===selPid,_color:secondHalf?.id===selPid?"#f87036":undefined,_bg:secondHalf?.id===selPid?"rgba(248,112,54,0.15)":undefined},
    {id:"total",label:"月計",getMin:name=>sameMoPeriods.reduce((a,p)=>a+getPeriodMin(p.id,name),0),_bold:true,_color:"#f87036"},
    {id:"monthly_limit",label:"月上限",getMin:name=>{const t=(settings.staffAttributes||{})[name]||"parttime";const tls={employee:{name:"社員"},parttime:{name:"バイト"},...(settings.staffTypeLimits||{})};const l=tls[t];return(l&&typeof l==="object"&&l.monthly)?l.monthly*60:0;},_color:"#60A5FA",_bg:"rgba(96,165,250,0.07)"}
  ];

  // ============ PDF書き出し ============
  // シフト表HTMLを構築（Excelと同ルール：管理者調整値優先＋サフィックス＋従業員番号行）
  const pdfSanitize=s=>(s||"").replace(/[\\/:*?"<>|]/g,"");
  const staffNums=settings.staffNumbers||{};
  const staffAliasesPdf=settings.staffAliases||{};
  const staffColorsPdf=settings.staffColors||{};
  // PDF用: シフト値の解決（localEdits優先→保存値、サフィックス連結）
  const pdfResolve=(name,date,field)=>{
    const key=`${name}|${date}|${field}`;
    let time="",note="";
    if(key in localEdits){const{numeric,note:nt}=extractNote(localEdits[key]);time=parseTime(numeric)||"";note=nt||"";}
    else{time=getStoredTime(name,date,field);const sh=_getSub(name)?.shifts?.[date];const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";const origNk=field==="start"?"startNote":"endNote";note=(sh?.[adjNk]??sh?.[origNk])||"";}
    const dec=time?toDecimal(time):"";
    return{disp:dec?(dec+note):"",note};
  };
  // 提出があるか（休みか未提出かの判定用）
  const pdfHasSub=(name,date)=>{const sh=_getSub(name)?.shifts?.[date];const key1=`${name}|${date}|start`,key2=`${name}|${date}|end`;const edited=(key1 in localEdits)||(key2 in localEdits);return!!sh||edited;};
  // Excel出力と同じ列構成（staffList＋未提出の未登録名）
  const buildPdfCols=()=>{
    const allAliases=Object.values(staffAliasesPdf).flat();
    const submittedNames=subs.filter(s=>s.periodId===selPid).map(s=>s.staffName);
    const unreg=submittedNames.filter(n=>!staffList.includes(n)&&!isSpacer(n)&&!allAliases.includes(n)).sort((a,b)=>a.localeCompare(b,"ja"));
    return[...staffList,...unreg];
  };
  const esc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  // 期間ラベルから先頭の年号（例:「2026年」）を除去して「○月前半」等のみ表示する
  const pdfPeriodLabel=l=>String(l||"").replace(/^\d+年/,"");
  // 縦書き: html2canvasはwriting-modeを描画できないため1文字ずつ<br>で縦積みする
  // 長音記号(ー)等の横棒文字は縦書きだと本来90度回転するため個別に回転させる
  const vtext=s=>String(s==null?"":s).replace(/\s+/g,"").split("").map(ch=>{
    const e=esc(ch);
    return/[ー\-－~〜]/.test(ch)?`<span style="display:inline-block;transform:rotate(90deg);">${e}</span>`:e;
  }).join("<br>");
  // 縦書き名前のフォントサイズ: 5文字以内はbaseそのまま、超える分はbase*(5/文字数)で縮小しセル高さを一定に保つ
  const vfontSize=(s,base)=>{
    const len=String(s==null?"":s).replace(/\s+/g,"").length;
    return len<=5?base:+(base*5/len).toFixed(2);
  };
  // シフト表table（HTML文字列）。withHeat=trueで左右にヒートマップ列を統合し日付行に合わせて表示する
  const buildShiftTableHtml=(withHeat=false,staffCols=true)=>{
    const cols=buildPdfCols();
    const BDp="1px solid #888",BDp2="2px solid #555";
    // 斜線: Excelのdiagonal(右上→左下の1本線)に合わせ、セル毎に1本だけ描画する非リピートSVGを使う
    // style属性(二重引用符)内に埋め込むため、url()は単一引用符・SVG内の引用符は%27にエスケープする
    const hatch=`url('data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' preserveAspectRatio='none'><line x1='10' y1='0' x2='0' y2='10' stroke='#999' stroke-width='1'/></svg>").replace(/'/g,"%27")}') no-repeat center/100% 100%`;
    const showKit=withHeat&&heatHours.length>0;
    const showHall=showKit&&hasSplit;
    const kitLabel=hasSplit?"キッチン":"時間帯別出勤人数";
    // 日付・曜日・ヒートマップはセル2個分: html2canvasがrowspanを描画できないため上下2セルで境界線を消して結合風にする
    const mergeTd=(val,top)=>`<td style="border-left:${BDp2};border-right:${BDp2};border-top:${top?BDp2:"0"};border-bottom:${top?"0":BDp2};padding:1px 2px;text-align:center;font-weight:600;vertical-align:${top?"bottom":"top"};height:15px;">${top?val:""}</td>`;
    const mergeHeat=(val,top,bg)=>`<td style="border-left:${BDp};border-right:${BDp};border-top:${top?BDp:"0"};border-bottom:${top?"0":BDp};padding:1px 2px;text-align:center;font-weight:${val?600:400};vertical-align:${top?"bottom":"top"};height:15px;background:${bg};">${top?(val||""):""}</td>`;
    let h='<table style="border-collapse:collapse;font-size:12px;">';
    // ヘッダー2行
    h+='<thead>';
    // Row1: 従業員コード専用行（左右の端セルは結合・空欄。期間等は表示しない）。ヒートマップ列はセクション名を結合表示
    h+='<tr>';
    if(showKit)h+=`<th colspan="${heatHours.length}" style="border:${BDp2};padding:1px;height:16px;text-align:center;font-size:8px;font-weight:600;white-space:nowrap;">${esc(kitLabel)}</th>`;
    h+=`<th colspan="2" style="border:${BDp2};padding:1px;height:16px;"></th>`;
    if(staffCols)cols.forEach(nm=>{
      if(isSpacer(nm)){h+=`<th style="border:${BDp};padding:1px;width:30px;height:16px;"></th>`;return;}
      h+=`<th style="border:${BDp};padding:1px;width:30px;height:16px;text-align:center;font-size:9px;font-weight:600;">${esc(staffNums[nm]||"")}</th>`;
    });
    h+=`<th colspan="2" style="border:${BDp2};padding:1px;height:16px;"></th>`;
    if(showHall)h+=`<th colspan="${heatHours.length}" style="border:${BDp2};padding:1px;height:16px;text-align:center;font-size:8px;font-weight:600;white-space:nowrap;">ホール</th>`;
    h+='</tr>';
    // Row2: ヒートマップ時刻・期間（縦積み）・曜日・スタッフ名（縦積み）・曜日・店名（縦積み）・ヒートマップ時刻
    h+='<tr>';
    if(showKit)heatHours.forEach(hr=>{h+=`<th style="border:${BDp};padding:1px;width:20px;text-align:center;font-size:9px;font-weight:600;background:#f7f7f7;vertical-align:bottom;">${hr}</th>`;});
    h+=`<th style="border:${BDp2};padding:3px 2px;width:36px;text-align:center;font-weight:700;font-size:10px;line-height:1.2;vertical-align:middle;">${vtext(pdfPeriodLabel(period.label||""))}</th>`;
    h+=`<th style="border:${BDp2};padding:2px 4px;width:28px;text-align:center;font-weight:700;">曜日</th>`;
    if(staffCols)cols.forEach(nm=>{
      if(isSpacer(nm)){h+=`<th style="border:${BDp};"></th>`;return;}
      const col=staffColorsPdf[nm]==="red"?"#e53935":"#000";
      h+=`<th style="border:${BDp};padding:3px 1px;width:30px;text-align:center;font-weight:700;font-size:${vfontSize(nm,10)}px;line-height:1.15;color:${col};vertical-align:middle;">${vtext(nm)}</th>`;
    });
    h+=`<th style="border:${BDp2};padding:2px 4px;width:28px;text-align:center;font-weight:700;">曜日</th>`;
    h+=`<th style="border:${BDp2};padding:3px 2px;width:40px;text-align:center;font-weight:700;font-size:10px;line-height:1.2;vertical-align:middle;">${vtext(shopName||"店舗")}</th>`;
    if(showHall)heatHours.forEach(hr=>{h+=`<th style="border:${BDp};padding:1px;width:20px;text-align:center;font-size:9px;font-weight:600;background:#f7f7f7;vertical-align:bottom;">${hr}</th>`;});
    h+='</tr></thead><tbody>';
    dates.forEach((ds,di)=>{
      const d=pd(ds),dow=d.getDay(),day=d.getDate(),wd=WD[dow];
      const isSat=dow===6,isSunHol=dow===0||isHoliday(ds);
      const rowBg=isSat?"#DDEEFF":isSunHol?"#FFEEEE":"#fff";
      // 上行=出勤 / 下行=退勤
      ["start","end"].forEach((field,ri)=>{
        const top=ri===0;
        h+=`<tr style="background:${rowBg};">`;
        if(showKit)heatHours.forEach(hr=>{
          const n=countHeat("kit",ds,hr);
          const bg=n===0?"transparent":`rgba(248,112,54,${0.15+(n/kitMax)*0.75})`;
          h+=mergeHeat(n||"",top,bg);
        });
        h+=mergeTd(day,top);
        h+=mergeTd(esc(wd),top);
        if(staffCols)cols.forEach(nm=>{
          if(isSpacer(nm)){h+=`<td style="border:${BDp};"></td>`;return;}
          if(!pdfHasSub(nm,ds)){h+=`<td style="border:${BDp};"></td>`;return;}
          const sh=_getSub(nm)?.shifts?.[ds];
          const r=pdfResolve(nm,ds,field);
          const otherHas=pdfResolve(nm,ds,field==="start"?"end":"start").disp;
          if(!r.disp&&!otherHas){
            // 休み提出のみ斜線（出勤で上書きされていればdispがあるためここに来ない）
            if(sh&&sh.status==="holiday"){h+=`<td style="border:${BDp};background:${hatch};height:15px;"></td>`;return;}
            h+=`<td style="border:${BDp};height:15px;"></td>`;return;
          }
          // 背景: 緑(スタッフ変更) > 黄(サフィックスnote) — 画面と同じ優先順位
          const cbg=sh&&sh.changed===true?"#B7EBC6":r.note?"#FFFF00":"transparent";
          h+=`<td style="border:${BDp};padding:1px;text-align:center;background:${cbg};height:15px;">${esc(r.disp)}</td>`;
        });
        h+=mergeTd(esc(wd),top);
        h+=mergeTd(day,top);
        if(showHall)heatHours.forEach(hr=>{
          const n=countHeat("hall",ds,hr);
          const bg=n===0?"transparent":`rgba(248,112,54,${0.15+(n/hallMax)*0.75})`;
          h+=mergeHeat(n||"",top,bg);
        });
        h+='</tr>';
      });
    });
    h+='</tbody></table>';
    return h;
  };
  // 休み・連勤カウント統合table（名前ヘッダー1行＋値2行）
  const buildCountsTableHtml=()=>{
    const cols=buildPdfCols();const BDp="1px solid #888";
    let h=`<div style="font-size:13px;font-weight:700;margin:10px 0 4px;">休み・連勤カウント</div>`;
    h+='<table style="border-collapse:collapse;font-size:11px;"><thead><tr>';
    h+=`<th style="border:${BDp};padding:3px 6px;background:#f7f7f7;"></th>`;
    cols.forEach(nm=>{if(isSpacer(nm)){h+=`<th style="border:${BDp};width:26px;"></th>`;return;}const col=staffColorsPdf[nm]==="red"?"#e53935":"#000";h+=`<th style="border:${BDp};padding:3px 1px;width:26px;text-align:center;font-size:${vfontSize(nm,10)}px;line-height:1.15;color:${col};vertical-align:middle;">${vtext(nm)}</th>`;});
    h+='</tr></thead><tbody>';
    const rows=[["休みカウント",nm=>{const v=restCounts[nm]||0;return v%1===0?v:v.toFixed(1);}],["連勤カウント",nm=>consecCounts[nm]||0]];
    rows.forEach(([lbl,valFn])=>{
      h+=`<tr><td style="border:${BDp};padding:3px 6px;background:#f7f7f7;font-weight:600;white-space:nowrap;">${esc(lbl)}</td>`;
      cols.forEach(nm=>{if(isSpacer(nm)){h+=`<td style="border:${BDp};"></td>`;return;}h+=`<td style="border:${BDp};padding:3px 2px;text-align:center;">${esc(valFn(nm))}</td>`;});
      h+='</tr>';
    });
    h+='</tbody></table>';
    return h;
  };
  // ブロック単体をオフスクリーン描画してcanvas化（幅はコンテンツに追従）
  const renderBlock=async(html)=>{
    const c=document.createElement("div");
    c.style.cssText="position:fixed;left:-30000px;top:0;width:max-content;background:#fff;color:#000;font-family:'Yu Gothic','Hiragino Sans',sans-serif;padding:12px;box-sizing:border-box;";
    c.innerHTML=html;
    document.body.appendChild(c);
    try{return await window.html2canvas(c,{scale:2,backgroundColor:"#fff"});}
    finally{if(c.parentNode)c.parentNode.removeChild(c);}
  };
  const PDF_PAGEBREAK="__PAGEBREAK__";
  const PDF_SYNCSCALE="__SYNCSCALE__"; // 直前のブロックと同じmm/pxスケールを使う（ページ間で日付行の高さ・幅を揃えるため）
  const exportPdf=async(mode)=>{
    if(!period)return;
    if(typeof window.html2canvas==="undefined"||typeof window.jspdf==="undefined"){tt("▲ PDFライブラリ未読込み");return;}
    setPdfBusy(true);
    try{
      const heading=`${esc(shopName||"店舗")} ${esc(pdfPeriodLabel(period.label)||"")}`;
      // ブロック=ページ内で分割しない単位。収まらないブロックは次ページへ、単独で超える場合は縮小して1ページに収める
      const blocks=[];
      if(mode==="shift"){
        blocks.push(`<div style="font-size:16px;font-weight:700;margin-bottom:8px;">${heading} シフト表</div>`+buildShiftTableHtml(false));
      }else{
        // 1ページ目: シフト表のみ（シフトモードと同じ内容）
        blocks.push(`<div style="font-size:18px;font-weight:700;margin-bottom:10px;">${heading} シフト作成データ</div>`+buildShiftTableHtml(false));
        // 2ページ目: 時間帯別出勤人数（ヒートマップ）のみ。1ページ目と同じ日付行構造(mergeTd)を使うことで高さ・幅を揃え、
        // PDF_SYNCSCALEで1ページ目と同じmm/pxスケールを引き継ぐことで見た目の整合性を取る
        if(heatHours.length>0){
          blocks.push(PDF_PAGEBREAK);
          blocks.push(PDF_SYNCSCALE);
          blocks.push(`<div style="font-size:18px;font-weight:700;margin-bottom:10px;">${heading} 時間帯別出勤人数</div>`+buildShiftTableHtml(true,false));
        }
        // 3ページ目以降: 休み・連勤カウント等の期間別集計
        blocks.push(PDF_PAGEBREAK);
        blocks.push(buildCountsTableHtml());
        // 期間別勤務時間
        {const cols=buildPdfCols();const BDp="1px solid #888";
         let t=`<div style="font-size:13px;font-weight:700;margin:0 0 4px;">期間別勤務時間</div>`;
         t+='<table style="border-collapse:collapse;font-size:11px;"><thead><tr>';
         t+=`<th style="border:${BDp};padding:3px 6px;background:#f7f7f7;text-align:left;">期間</th>`;
         cols.forEach(nm=>{if(isSpacer(nm)){t+=`<th style="border:${BDp};"></th>`;return;}const col=staffColorsPdf[nm]==="red"?"#e53935":"#000";t+=`<th style="border:${BDp};padding:3px 1px;width:26px;text-align:center;font-size:${vfontSize(nm,10)}px;line-height:1.15;color:${col};vertical-align:middle;">${vtext(nm)}</th>`;});
         t+='</tr></thead><tbody>';
         periodRows.forEach(row=>{t+=`<tr><td style="border:${BDp};padding:3px 6px;font-weight:${row._bold?700:400};white-space:nowrap;">${esc(pdfPeriodLabel(row.label))}</td>`;cols.forEach(nm=>{if(isSpacer(nm)){t+=`<td style="border:${BDp};"></td>`;return;}const min=row.getMin(nm);t+=`<td style="border:${BDp};padding:3px 2px;text-align:center;">${min>0?esc(fmtH(min)):""}</td>`;});t+='</tr>';});
         t+='</tbody></table>';blocks.push(t);}
        // 週間勤務時間
        if(weeks.length>0){
          const cols=buildPdfCols();const BDp="1px solid #888";
          let t=`<div style="font-size:13px;font-weight:700;margin:0 0 4px;">週間勤務時間（前期間含む）</div>`;
          t+='<table style="border-collapse:collapse;font-size:11px;"><thead><tr>';
          t+=`<th style="border:${BDp};padding:3px 6px;background:#f7f7f7;text-align:left;">週</th>`;
          cols.forEach(nm=>{if(isSpacer(nm)){t+=`<th style="border:${BDp};"></th>`;return;}const col=staffColorsPdf[nm]==="red"?"#e53935":"#000";t+=`<th style="border:${BDp};padding:3px 1px;width:26px;text-align:center;font-size:${vfontSize(nm,10)}px;line-height:1.15;color:${col};vertical-align:middle;">${vtext(nm)}</th>`;});
          t+='</tr></thead><tbody>';
          weeks.forEach(monStr=>{const m=pd(monStr);const sun=new Date(m);sun.setDate(m.getDate()+6);t+=`<tr><td style="border:${BDp};padding:3px 6px;white-space:nowrap;">${m.getDate()}〜${sun.getDate()}日</td>`;cols.forEach(nm=>{if(isSpacer(nm)){t+=`<td style="border:${BDp};"></td>`;return;}const min=getWeekMin(monStr,nm);t+=`<td style="border:${BDp};padding:3px 2px;text-align:center;">${min>0?esc(fmtH(min)):""}</td>`;});t+='</tr>';});
          t+='</tbody></table>';blocks.push(t);
        }
      }
      const{jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
      const pageW=297,pageH=210,margin=5,imgW=pageW-margin*2,imgH=pageH-margin*2;
      let y=margin,lastMmPerPx=null,syncNext=false;
      for(const bh of blocks){
        if(bh===PDF_PAGEBREAK){pdf.addPage();y=margin;continue;}
        if(bh===PDF_SYNCSCALE){syncNext=true;continue;}
        const canvas=await renderBlock(bh);
        // 幅基準でスケール（自然サイズ以上には拡大しない）。1ページ高を超えるブロックは等比縮小
        let mmPerPx;
        if(syncNext&&lastMmPerPx&&canvas.width*lastMmPerPx<=imgW&&canvas.height*lastMmPerPx<=imgH){
          mmPerPx=lastMmPerPx; // 直前ブロックと同スケールを維持し、日付行の高さ・幅を揃える
        }else{
          mmPerPx=Math.min(imgW/canvas.width,0.14);
          if(canvas.height*mmPerPx>imgH)mmPerPx=imgH/canvas.height;
        }
        syncNext=false;
        lastMmPerPx=mmPerPx;
        const wMm=canvas.width*mmPerPx,hMm=canvas.height*mmPerPx;
        if(y>margin+0.1&&y+hMm>pageH-margin){pdf.addPage();y=margin;}
        pdf.addImage(canvas.toDataURL("image/jpeg",0.92),"JPEG",margin,y,wMm,hMm);
        y+=hMm+4;
      }
      const fname=`${pdfSanitize(shopName||"店舗")}${pdfSanitize(period.label||"")}${mode==="shift"?"シフト":"全データ"}.pdf`;
      pdf.save(fname);
      ph("pdf_exported",{period_id:period.id,mode});
      tt(`✓ ${fname} をダウンロードしました`);
      setPdfModal(false);
    }catch(e){
      console.error("PDF生成失敗:",e);
      tt("✕ PDF生成に失敗しました: "+e.message);
    }finally{
      setPdfBusy(false);
    }
  };

  return(
    <div ref={outerRef} style={{padding:"12px 8px"}}>
      {cellTip&&<div style={{position:"fixed",left:cellTip.x,top:cellTip.y-26,transform:"translateX(-50%)",background:"rgba(30,30,30,0.82)",color:"#fff",fontSize:11,fontWeight:600,padding:"2px 7px",borderRadius:10,pointerEvents:"none",zIndex:9999,whiteSpace:"nowrap",backdropFilter:"blur(4px)"}}>{cellTip.value}</div>}
      <div style={{marginBottom:10,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:15}}>シフト作成</span>
        <select value={selPid} onChange={e=>{setSelPid(e.target.value);setLocalEdits({});setHeatEdits({});setFocusKey(null);}}
          style={{fontSize:16,padding:"4px 8px",border:BD,borderRadius:6,background:"var(--c-input)",color:"var(--c-text)"}}>
          {periods.map(p=><option key={p.id} value={p.id}>{p.label||(p.startDate+"〜"+p.endDate)}</option>)}
        </select>
        <span style={{fontSize:11,color:"var(--c-text3)",flex:1}}>{isPremium?("例: 9, 9.5, 930, 9:30"+(Object.keys(abbrToShop).length>0?" / 略称でヘルプ（例: 9三）":"")):"閲覧のみ（編集はPremiumプランで）"}</span>
        <button onClick={()=>setFitAll(v=>!v)}
          style={{padding:"5px 10px",background:fitAll?"var(--c-border2)":"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:6,color:"var(--c-text)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
          {fitAll?"通常表示":"全員表示"}
        </button>
        {period&&<button onClick={()=>{
          const adjResolver=(name,date,field)=>{
            const key=`${name}|${date}|${field}`;
            let time="";
            if(key in localEdits){const{numeric}=extractNote(localEdits[key]);time=parseTime(numeric)||"";}
            else{time=getStoredTime(name,date,field);}
            let note="";
            if(key in localEdits){note=extractNote(localEdits[key]).note||"";}
            else{const sh=_getSub(name)?.shifts?.[date];const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";const origNk=field==="start"?"startNote":"endNote";note=sh?.[adjNk]??sh?.[origNk]??"";}
            return{time,note};
          };
          expXl(period,subs,staffList,tt,shopName||"店舗",{staffColors:settings.staffColors||{},staffAliases:settings.staffAliases||{},staffNumbers:settings.staffNumbers||{}},adjResolver);
        }}
          style={{padding:"6px 14px",background:"linear-gradient(135deg,#c45e1f,#a34d19)",border:"none",borderRadius:7,color:"white",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
          Excel出力
        </button>}
        {period&&isPremium&&<button onClick={()=>setPdfModal(true)}
          style={{padding:"6px 14px",background:"linear-gradient(135deg,#b91c1c,#7f1d1d)",border:"none",borderRadius:7,color:"white",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
          PDF出力
        </button>}
      </div>

      {/* 店舗間シフト重複エラー一覧 */}
      {Object.keys(dupErrors).length>0&&(
        <div style={{background:"rgba(255,71,87,.08)",border:"1px solid rgba(255,71,87,.3)",borderRadius:8,padding:"8px 12px",marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:700,color:"#FF4757",marginBottom:4}}>⚠ 出勤がだぶついています（他店舗と時間重複）</div>
          <div style={{fontSize:12,color:"var(--c-text2)",lineHeight:1.7}}>
            {Object.entries(dupErrors).map(([k,shopNm])=>{
              const i=k.indexOf("|");const nm=k.slice(0,i);const d=k.slice(i+1);
              return`${nm} ${fmtDL(d)}（${shopNm}）`;
            }).join("、")}
          </div>
        </div>
      )}

      {pdfModal&&(
        <div onClick={()=>{if(!pdfBusy)setPdfModal(false);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9998,padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--c-card)",borderRadius:14,padding:"22px 20px",width:"100%",maxWidth:340,boxShadow:"0 8px 32px var(--c-shadow)"}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:6,color:"var(--c-text)"}}>PDF出力</div>
            <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:16}}>出力する内容を選択してください</div>
            <button disabled={pdfBusy} onClick={()=>exportPdf("shift")}
              style={{width:"100%",padding:"12px",marginBottom:10,background:"linear-gradient(135deg,#b91c1c,#7f1d1d)",border:"none",borderRadius:9,color:"white",fontSize:14,fontWeight:700,cursor:pdfBusy?"default":"pointer",opacity:pdfBusy?0.6:1}}>
              {pdfBusy?"生成中...":"シフト"}
              <div style={{fontSize:11,fontWeight:400,marginTop:2,opacity:0.85}}>シフト表のみ（Excelと同じ形式）</div>
            </button>
            <button disabled={pdfBusy} onClick={()=>exportPdf("all")}
              style={{width:"100%",padding:"12px",marginBottom:14,background:"linear-gradient(135deg,#7c3aed,#5b21b6)",border:"none",borderRadius:9,color:"white",fontSize:14,fontWeight:700,cursor:pdfBusy?"default":"pointer",opacity:pdfBusy?0.6:1}}>
              {pdfBusy?"生成中...":"全データ"}
              <div style={{fontSize:11,fontWeight:400,marginTop:2,opacity:0.85}}>シフト表・カウント・ヒートマップ・勤務時間集計</div>
            </button>
            <button disabled={pdfBusy} onClick={()=>setPdfModal(false)}
              style={{width:"100%",padding:"9px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:9,color:"var(--c-text2)",fontSize:13,fontWeight:600,cursor:pdfBusy?"default":"pointer",opacity:pdfBusy?0.6:1}}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      {!period?<div style={{color:"var(--c-text3)"}}>期間を選択してください</div>:(
        <div style={useBreakout?{marginLeft:-(containerLeft+8),width:"100vw",paddingLeft:8,paddingRight:8,boxSizing:"border-box",display:hasPanel?"flex":"block",alignItems:"flex-start",gap:4}:{}}>

          {/* === 左パネル: キッチン熱マップ（通常表示+split時のみ） === */}
          {hasPanel&&<div style={{width:panelW,flexShrink:0,overflowX:"auto"}}>
            <HeatTable label="" section="kit" maxC={kitMax} rowH={heatRowH} theadH={measuredTheadH} sectionLabel="キッチン"/>
          </div>}

          {/* === 中央: グリッド + 集計 === */}
          <div style={hasPanel?{flex:1,minWidth:0}:{}}>

          {/* ===メイングリッド（SL列廃止・日付のみstickyで15名対応）=== */}
          <div ref={mainScrollRef} onScroll={e=>syncScrollH(e.currentTarget)} style={{overflowX:fitAll?"hidden":"auto",border:BD,borderRadius:8,marginBottom:16}}>
            <table style={{borderCollapse:"collapse",width:fitAll?"100%":"unset",minWidth:fitAll?"unset":"max-content"}}>
              <thead ref={gridTheadRef}>
                <tr>
                  <th style={{...SD,top:0,zIndex:4,padding:"4px",fontWeight:600,borderBottom:BD2,background:CRD}}>日付</th>
                  {mapGridCols(name=>VTH(name),spacerTh)}
                </tr>
              </thead>
              <tbody ref={gridBodyRef}>
                {dates.map(date=>{
                  const d=pd(date);const day=d.getDay();
                  const isHol=isHoliday(date);const isSun=day===0;const isSat=day===6;
                  const dc=(isSun||isHol)?"#e53935":isSat?"#1976d2":"var(--c-text)";
                  const rb=(isSun||isHol)?"rgba(229,57,53,0.07)":isSat?"rgba(25,118,210,0.07)":"transparent";
                  return[
                    <tr key={date+"-s"} style={{background:rb}}>
                      <td rowSpan={2} style={{...SD,color:dc,verticalAlign:"middle",borderBottom:BD,background:CRD}}>{fmtDL(date)}</td>
                      {mapGridCols(name=>(
                        <td key={name} style={{padding:"1px 1px",borderLeft:BD,borderBottom:"none",textAlign:"center",background:rb,width:colW,minWidth:colW,maxWidth:colW}}>
                          <input type="text" inputMode="text" value={getVal(name,date,"start")} placeholder="--"
                            readOnly={!isPremium} disabled={!isPremium}
                            data-sc={`${date}|start`} data-scn={name}
                            onChange={e=>isPremium&&handleChange(name,date,"start",e.target.value)}
                            onClick={!isPremium?()=>onUpgrade&&onUpgrade({type:"edit",plan}):undefined}
                            onDoubleClick={()=>toggleChanged(name,date)}
                            onTouchEnd={()=>{if(!isPremium)return;const k=`${name}|${date}`;const now=Date.now();if(lastTapRef.current.key===k&&now-lastTapRef.current.t<350){toggleChanged(name,date);lastTapRef.current={key:null,t:0};}else{lastTapRef.current={key:k,t:now};}}}
                            onFocus={e=>{if(!isPremium){e.target.blur();onUpgrade&&onUpgrade({type:"edit",plan});return;}setFocusKey(`${name}|${date}|start`);const sh=_getSub(name)?.shifts?.[date];const v=toDecimal(sh?.start||"");const n=sh?.startNote||"";const s=v?(v+n):"—";const r=e.target.getBoundingClientRect();setCellTip({x:r.left+r.width/2,y:r.top,value:s});}}
                            onBlur={e=>{handleBlur(name,date,"start",e.target.value);setCellTip(null);setFocusKey(null);}}
                            onKeyDown={e=>{if(e.key!=="Enter")return;e.preventDefault();handleBlur(name,date,"start",e.target.value);if(e.ctrlKey||e.metaKey){const pdi=dates.indexOf(date)-1;if(pdi>=0)document.querySelector(`[data-sc="${dates[pdi]}|end"][data-scn="${CSS.escape(name)}"]`)?.focus();}else{document.querySelector(`[data-sc="${date}|end"][data-scn="${CSS.escape(name)}"]`)?.focus();}}}
                            style={{...AI2,background:cellBgFor(name,date,"start",AI2.background),color:cellTextColor(name,date,"start")||AI2.color,opacity:isPremium?1:0.55,cursor:isPremium?"text":"pointer"}}/>
                        </td>
                      ),spacerCell)}
                    </tr>,
                    <tr key={date+"-e"} style={{background:rb}}>
                      {mapGridCols(name=>(
                        <td key={name} style={{padding:"1px 1px",borderLeft:BD,borderBottom:BD,textAlign:"center",background:rb,width:colW,minWidth:colW,maxWidth:colW}}>
                          <input type="text" inputMode="text" value={getVal(name,date,"end")} placeholder="--"
                            readOnly={!isPremium} disabled={!isPremium}
                            data-sc={`${date}|end`} data-scn={name}
                            onChange={e=>isPremium&&handleChange(name,date,"end",e.target.value)}
                            onClick={!isPremium?()=>onUpgrade&&onUpgrade({type:"edit",plan}):undefined}
                            onDoubleClick={()=>toggleChanged(name,date)}
                            onTouchEnd={()=>{if(!isPremium)return;const k=`${name}|${date}`;const now=Date.now();if(lastTapRef.current.key===k&&now-lastTapRef.current.t<350){toggleChanged(name,date);lastTapRef.current={key:null,t:0};}else{lastTapRef.current={key:k,t:now};}}}
                            onFocus={e=>{if(!isPremium){e.target.blur();onUpgrade&&onUpgrade({type:"edit",plan});return;}setFocusKey(`${name}|${date}|end`);const sh=_getSub(name)?.shifts?.[date];const v=toDecimal(sh?.end||"");const n=sh?.endNote||"";const s=v?(v+n):"—";const r=e.target.getBoundingClientRect();setCellTip({x:r.left+r.width/2,y:r.top,value:s});}}
                            onBlur={e=>{handleBlur(name,date,"end",e.target.value);setCellTip(null);setFocusKey(null);}}
                            onKeyDown={e=>{if(e.key!=="Enter")return;e.preventDefault();handleBlur(name,date,"end",e.target.value);if(e.ctrlKey||e.metaKey){document.querySelector(`[data-sc="${date}|start"][data-scn="${CSS.escape(name)}"]`)?.focus();}else{const ndi=dates.indexOf(date)+1;if(ndi<dates.length)document.querySelector(`[data-sc="${dates[ndi]}|start"][data-scn="${CSS.escape(name)}"]`)?.focus();}}}
                            style={{...AI2,background:cellBgFor(name,date,"end",AI2.background),color:cellTextColor(name,date,"end")||AI2.color,opacity:isPremium?1:0.55,cursor:isPremium?"text":"pointer"}}/>
                        </td>
                      ),spacerCell)}
                    </tr>
                  ];
                })}
              </tbody>
            </table>
          </div>

          {/* === 休みカウント / 連勤カウント === */}
          <div ref={restScrollRef} onScroll={e=>syncScrollH(e.currentTarget)} style={{overflowX:fitAll?"hidden":"auto",border:BD,borderRadius:8,marginBottom:16}}>
            <table style={{borderCollapse:"collapse",width:fitAll?"100%":"unset",minWidth:fitAll?"unset":"max-content"}}>
              <tbody>
                <tr>
                  <td style={{...SD,fontWeight:600,borderBottom:BD,background:CRD,fontSize:11}}>休みカウント</td>
                  {mapGridCols(name=>(
                    <td key={name} style={{width:colW,minWidth:colW,maxWidth:colW,padding:"3px 2px",textAlign:"center",borderLeft:BD,borderBottom:BD,background:CRD,fontSize:11,fontWeight:400,color:"var(--c-text2)"}}>
                      {(restCounts[name]||0)%1===0?(restCounts[name]||0):(restCounts[name]||0).toFixed(1)}
                    </td>
                  ),spacerTh)}
                </tr>
                <tr>
                  <td style={{...SD,fontWeight:600,borderBottom:BD2,background:CRD,fontSize:11}}>連勤カウント</td>
                  {mapGridCols(name=>(
                    <td key={name} style={{width:colW,minWidth:colW,maxWidth:colW,padding:"3px 2px",textAlign:"center",borderLeft:BD,borderBottom:BD2,background:CRD,fontSize:11,fontWeight:400,color:"var(--c-text2)"}}>
                      {consecCounts[name]||0}
                    </td>
                  ),spacerTh)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* ===時間帯別出勤人数 (サイドパネル非表示時 → グリッド下にキッチン→ホールの順で縦に表示) === */}
          {!hasPanel&&<div style={{marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:6,color:"var(--c-text2)"}}>時間帯別出勤人数</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <HeatTable label={hasSplit?"キッチン":""} section="kit" maxC={kitMax}/>
              {hasSplit&&<HeatTable label="ホール" section="hall" maxC={hallMax}/>}
            </div>
          </div>}

          {/* ===期間別勤務時間（前半/後半/月計を常に3行）=== */}
          <SummaryTable title="期間別勤務時間" rowLabel="期間" scrollRef={periodScrollRef} onScroll={e=>syncScrollH(e.currentTarget)} rows={periodRows}/>

          {/* ===週間勤務時間=== */}
          {weeks.length>0&&<SummaryTable
            title="週間勤務時間（前期間含む）"
            rowLabel="週"
            scrollRef={weekScrollRef}
            onScroll={e=>syncScrollH(e.currentTarget)}
            rows={[...weeks.map(monStr=>{
              const m=pd(monStr);const sun=new Date(m);sun.setDate(m.getDate()+6);
              const tls={employee:{name:"社員"},parttime:{name:"バイト"},...(settings.staffTypeLimits||{})};
              return{id:monStr,label:`${m.getDate()}〜${sun.getDate()}日`,getMin:name=>getWeekMin(monStr,name),
                _violateFn:(name,min)=>{const t=(settings.staffAttributes||{})[name]||"parttime";const l=tls[t];const lim=l&&typeof l==="object"&&l.weekly?l.weekly*60:0;return lim>0&&min>=lim;}};
            }),{id:"weekly_limit",label:"週上限",getMin:name=>{const t=(settings.staffAttributes||{})[name]||"parttime";const tls={employee:{name:"社員"},parttime:{name:"バイト"},...(settings.staffTypeLimits||{})};const l=tls[t];return(l&&typeof l==="object"&&l.weekly)?l.weekly*60:0;},_color:"#60A5FA",_bg:"rgba(96,165,250,0.07)"}]}
          />}

          </div>{/* end center */}

          {/* === 右パネル: ホール熱マップ（通常表示+split時のみ） === */}
          {hasPanel&&<div style={{width:panelW,flexShrink:0,overflowX:"auto"}}>
            <HeatTable label="" section="hall" maxC={hallMax} rowH={heatRowH} theadH={measuredTheadH} sectionLabel="ホール"/>
          </div>}

        </div>
      )}
    </div>
  );
}

// ===== 期間管理タブ =====
function PeriodsTab({periods,subs,staffList,shops,onSave,saveSubs,tt,shopId,shopName,plan="free",onUpgrade,settings={}}){
  const[eid,setEid]=useState(null);
  const[form,setForm]=useState({label:"",startDate:"",endDate:"",deadlineDate:""});
  const[show,setShow]=useState(false);
  const[usePreset,setUsePreset]=useState(true); // プリセット使用フラグ
  const[viewPeriodId,setViewPeriodId]=useState(null);

  // プリセット生成（1ヶ月前除外、今月〜再来月）
  const genPresets=()=>{
    const result=[],today=new Date();
    const cutoff=new Date(today.getFullYear(),today.getMonth()-1,today.getDate());
    const use1month=(plan==="pro"||plan==="premium")&&(settings.periodUnit||"2week")==="1month";
    for(let offset=0;offset<=2;offset++){
      const base=new Date(today.getFullYear(),today.getMonth()+offset,1);
      const yr=base.getFullYear(),mo=base.getMonth()+1,ms=String(mo).padStart(2,"0");
      const lastDay=fd(new Date(yr,mo,0));
      if(use1month){
        const full={label:`${yr}年${mo}月`,startDate:`${yr}-${ms}-01`,endDate:lastDay};
        if(pd(full.endDate)>=cutoff)result.push(full);
      }else{
        const fh={label:`${yr}年${mo}月前半`,startDate:`${yr}-${ms}-01`,endDate:`${yr}-${ms}-15`};
        const sh={label:`${yr}年${mo}月後半`,startDate:`${yr}-${ms}-16`,endDate:lastDay};
        if(pd(fh.endDate)>=cutoff)result.push(fh);
        if(pd(sh.endDate)>=cutoff)result.push(sh);
      }
    }
    return result;
  };
  const pre=genPresets();

  const checkPeriodLimit=()=>{
    const lim=PLAN_LIMITS[plan]?.periods??1;
    if(periods.length>=lim){onUpgrade&&onUpgrade({type:"periods",limit:lim,plan});return false;}
    return true;
  };
  const create=()=>{
    if(!form.startDate||!form.endDate){tt("▲ 開始日・終了日を入力");return;}
    if(!checkPeriodLimit())return;
    const p={id:`p_${Date.now()}`,urlToken:genToken(),shopId,
      label:form.label||`${form.startDate.replace(/-/g,"/")}〜${form.endDate.replace(/-/g,"/")}`,
      startDate:form.startDate,endDate:form.endDate,deadlineDate:form.deadlineDate,
      createdAt:new Date().toISOString()};
    ph("period_created",{period_id:p.id,shop_id:shopId});
    onSave([...periods,p]);
    setForm({label:"",startDate:"",endDate:"",deadlineDate:""});
    setShow(false);setUsePreset(true);
    tt("✓ 期間を作成しました");
  };

  // 提出状況ビュー
  if(viewPeriodId){
    const vp=periods.find(p=>p.id===viewPeriodId);
    if(!vp)return null;
    return(
      <div>
        <button onClick={()=>setViewPeriodId(null)} style={{marginBottom:16,padding:"8px 16px",background:"var(--c-input)",border:"1px solid #E5E7EB",borderRadius:8,color:"var(--c-text)",fontSize:13,cursor:"pointer"}}>← 期間一覧に戻る</button>
        <SmModal subs={subs} periods={periods} apid={viewPeriodId} onClose={()=>setViewPeriodId(null)} staffList={staffList} plan={plan} onDeleteSub={subId=>{const a=subs.filter(s=>s.id!==subId);saveSubs&&saveSubs(a,subId);tt("提出を削除しました");}} onEditSub={sub=>{const updated={...sub,updatedAt:new Date().toISOString(),isUpdated:true};const a=[...subs];const i=a.findIndex(s=>s.id===sub.id);if(i>=0){a[i]=updated;saveSubs&&saveSubs(a);}tt("✓ 更新しました");}}/>
      </div>
    );
  }

  // 期間を開始日の降順でソート（最新が上）
  const sortedPeriods=[...periods].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate));

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <AT>期間管理</AT>
        <button onClick={()=>{setShow(v=>!v);setUsePreset(true);setForm({label:"",startDate:"",endDate:"",deadlineDate:""}); }} style={{padding:"9px 16px",background:"#f87036",border:"none",borderRadius:9,color:"white",fontSize:13,fontWeight:700,cursor:"pointer"}}>＋ 新しい期間を作成</button>
      </div>
      {plan==="free"&&<div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,background:"var(--c-card)",border:"1px solid #E5E7EB",borderRadius:8,padding:"7px 10px"}}>
        {`Freeプラン：最大${PLAN_LIMITS.free.periods}件まで作成可能（${periods.length}/${PLAN_LIMITS.free.periods}件）`}
        {periods.length>=PLAN_LIMITS.free.periods&&<span style={{marginLeft:8,color:"#F59E0B",fontSize:11}}>期間追加はProプランで利用できます</span>}
      </div>}
      {show&&<AC title="新しい期間を作成">
        {/* プリセット使用 / 手動入力 の切り替え */}
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={()=>setUsePreset(true)} style={{flex:1,padding:"9px 0",border:`2px solid ${usePreset?"#f87036":"var(--c-border2)"}`,borderRadius:9,background:usePreset?"rgba(248,112,54,.15)":"rgba(0,0,0,.03)",color:usePreset?"#f87036":"#6B7280",fontSize:13,fontWeight:700,cursor:"pointer"}}>プリセットから選ぶ</button>
          <button onClick={()=>{setUsePreset(false);setForm({label:"",startDate:"",endDate:"",deadlineDate:""}); }} style={{flex:1,padding:"9px 0",border:`2px solid ${!usePreset?"#f87036":"var(--c-border2)"}`,borderRadius:9,background:!usePreset?"rgba(248,112,54,.15)":"rgba(0,0,0,.03)",color:!usePreset?"#f87036":"#6B7280",fontSize:13,fontWeight:700,cursor:"pointer"}}>手動で入力する</button>
        </div>

        {usePreset?(
          /* プリセット選択 */
          <div>
            <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:10}}>選択するとすぐに作成されます</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
              {pre.map((p,i)=>{
                const alreadyExists=periods.some(pp=>pp.startDate===p.startDate&&pp.endDate===p.endDate);
                return(
                  <button key={i} onClick={()=>{
                    if(alreadyExists){tt("▲ この期間はすでに作成済みです");return;}
                    if(!checkPeriodLimit())return;
                    const np={id:`p_${Date.now()}`,urlToken:genToken(),shopId,label:p.label,startDate:p.startDate,endDate:p.endDate,deadlineDate:"",createdAt:new Date().toISOString()};
                    onSave([...periods,np]);setShow(false);setUsePreset(true);tt(`✓ ${p.label} を作成しました`);
                  }} style={{padding:"10px 16px",background:alreadyExists?"rgba(0,0,0,.02)":"var(--c-border)",border:`1px solid ${alreadyExists?"var(--c-border)":"var(--c-border2)"}`,borderRadius:9,color:alreadyExists?"var(--c-border2)":"#1A1A2E",fontSize:13,fontWeight:600,cursor:alreadyExists?"not-allowed":"pointer",textDecoration:alreadyExists?"line-through":"none"}}>
                    {p.label}{alreadyExists&&<span style={{fontSize:10,marginLeft:4}}>作成済み</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={()=>setShow(false)} style={{...AGray,width:"100%"}}>キャンセル</button>
          </div>
        ):(
          /* 手動入力 */
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
              <div><AL>ラベル</AL><input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="例）7月前半" maxLength={50} style={AI}/></div>
              <div><AL>開始日 *</AL><input type="date" value={form.startDate} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))} style={AI}/></div>
              <div><AL>終了日 *</AL><input type="date" value={form.endDate} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))} style={AI}/></div>
              <div><AL>締切日</AL><input type="date" value={form.deadlineDate} onChange={e=>setForm(f=>({...f,deadlineDate:e.target.value}))} style={AI}/></div>
            </div>
            {form.startDate&&form.endDate&&form.startDate<=form.endDate&&<div style={{fontSize:12,color:"var(--c-text4)",marginBottom:10}}>期間：{gd(form.startDate,form.endDate).length}日間</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={create} style={AB}>✓ 作成する</button>
              <button onClick={()=>setShow(false)} style={AGray}>キャンセル</button>
            </div>
          </div>
        )}
      </AC>}

      {sortedPeriods.map(p=>{
        const dates=gd(p.startDate,p.endDate),ip=idp(p.deadlineDate);
        const pUrl=buildUrl(p);
        return(
          <div key={p.id} style={{background:"rgba(0,0,0,.03)",border:"1px solid #E5E7EB",borderRadius:14,padding:18,marginBottom:12,cursor:"pointer"}} onClick={e=>{if(e.target.tagName==="BUTTON"||e.target.closest("button"))return;setViewPeriodId(p.id);}}>
            {eid===p.id
              ?<PEF period={p} onSave={u=>{onSave(periods.map(pp=>pp.id===p.id?{...pp,...u}:pp));tt("✓ 保存しました");setEid(null);}} onCancel={()=>setEid(null)}/>
              :<>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)",marginBottom:3}}>{p.label}</div>
                    <div style={{fontSize:13,color:"var(--c-text3)"}}>{p.startDate?.replace(/-/g,"/")} 〜 {p.endDate?.replace(/-/g,"/")}（{dates.length}日間）</div>
                    {p.deadlineDate&&<div style={{fontSize:12,marginTop:3,color:ip?"#FF8C94":"#9CA3AF"}}>締切：{p.deadlineDate.replace(/-/g,"/")} {ip?"（済み）":""}</div>}
                    <div style={{fontSize:11,color:"var(--c-text4)",marginTop:4}}>提出：{subs.filter(s=>s.periodId===p.id).length}件</div>
                  </div>
                  <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <button onClick={e=>{e.stopPropagation();setEid(p.id);}} style={{padding:"5px 9px",background:"var(--c-input)",border:"1px solid #E5E7EB",borderRadius:6,color:"var(--c-text2)",fontSize:11,cursor:"pointer"}}>編集</button>
                    <button onClick={e=>{e.stopPropagation();expXl(p,subs,staffList,tt,settings.xlShopName||shopName,{staffColors:settings.staffColors||{},staffAliases:settings.staffAliases||{},staffNumbers:settings.staffNumbers||{}});}} style={{padding:"5px 9px",background:"linear-gradient(135deg,#c45e1f,#a34d19)",border:"none",borderRadius:6,color:"white",fontSize:11,fontWeight:700,cursor:"pointer"}}>Excel</button>
                    <button onClick={e=>{e.stopPropagation();if(!confirm("削除しますか？"))return;onSave(periods.filter(pp=>pp.id!==p.id));tt("削除しました");}} style={AD}>削除</button>
                  </div>
                </div>
                {/* URLシェア */}
                <div style={{marginTop:10,padding:"8px 12px",background:"rgba(0,0,0,.03)",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,color:"var(--c-text4)",flexShrink:0}}>URL</span>
                  <span style={{fontSize:11,color:"var(--c-text3)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pUrl}</span>
                  <button onClick={e=>{e.stopPropagation();
              if(navigator.clipboard&&navigator.clipboard.writeText){
                navigator.clipboard.writeText(pUrl).then(()=>tt("✓ URLをコピーしました")).catch(()=>{
                  // フォールバック（iOS Safari 12以下等）
                  const el=document.createElement("textarea");el.value=pUrl;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);tt("✓ URLをコピーしました");
                });
              } else {
                const el=document.createElement("textarea");el.value=pUrl;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);tt("✓ URLをコピーしました");
              }}} style={{padding:"4px 10px",background:"var(--c-border)",border:"none",borderRadius:6,color:"var(--c-text)",fontSize:11,cursor:"pointer",flexShrink:0}}>コピー</button>
                </div>
              </>
            }
          </div>
        );
      })}
    </div>
  );
}
function PEF({period,onSave,onCancel}){
  const[f,setF]=useState({label:period.label,startDate:period.startDate,endDate:period.endDate,deadlineDate:period.deadlineDate||""});
  return(<div onClick={e=>e.stopPropagation()}>
    <div style={{fontSize:13,fontWeight:700,color:"var(--c-text2)",marginBottom:10}}>編集中</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:9,marginBottom:12}}>
      <div><AL>ラベル</AL><input value={f.label} onChange={e=>setF(p=>({...p,label:e.target.value}))} style={AI}/></div>
      <div><AL>開始日</AL><input type="date" value={f.startDate} onChange={e=>setF(p=>({...p,startDate:e.target.value}))} style={AI}/></div>
      <div><AL>終了日</AL><input type="date" value={f.endDate} onChange={e=>setF(p=>({...p,endDate:e.target.value}))} style={AI}/></div>
      <div><AL>締切日</AL><input type="date" value={f.deadlineDate} onChange={e=>setF(p=>({...p,deadlineDate:e.target.value}))} style={AI}/></div>
    </div>
    <div style={{display:"flex",gap:8}}><button onClick={()=>onSave(f)} style={AB}>保存</button><button onClick={onCancel} style={AGray}>キャンセル</button></div>
  </div>);
}

// ===== Excel出力 =====
function expXl(p,subs,staffList,tt,shopName,options={},resolver=null){
  ph("excel_exported",{period_id:p.id,submission_count:subs.filter(s=>s.periodId===p.id).length});
  const ss=subs.filter(s=>s.periodId===p.id);
  if(typeof ExcelJS==="undefined"){tt("▲ ExcelJS未読込み");return;}
  const dates=gd(p.startDate,p.endDate);
  const staffAliases=options.staffAliases||{};
  const allAliases=Object.values(staffAliases).flat();
  const submittedNames=ss.map(s=>s.staffName);
  const unregistered=submittedNames.filter(n=>!staffList.includes(n)&&!isSpacer(n)&&!allAliases.includes(n)).sort((a,b)=>a.localeCompare(b,"ja"));
  const sl=[...staffList,...unregistered];
  if(sl.filter(n=>!isSpacer(n)).length===0){tt("▲ スタッフが登録されていません");return;}

  const firstDate=pd(dates[0]);
  const mo=firstDate.getMonth()+1;
  const isLatter=firstDate.getDate()>=16||(p.label&&p.label.includes("後半"));
  const periodLabel=`${mo}月${isLatter?"後半":"前半"}`;

  // ============================================================
  // サンプルファイル完全準拠レイアウト
  //
  // ヘッダー行:
  //   Row1 = 従業員コード専用行（A1:B1結合・右端2セル結合は空欄、スタッフ列=従業員番号）
  //   Row2 = A:期間ラベル(縦書き) / B:曜日 / スタッフ名(縦書き) / 曜日 / 店舗名
  //
  // データ行(1日=2行):
  //   上行: A=日付(横書き), B=曜日(横書き) → 両方 medium四辺・上下結合
  //         スタッフ列 → top:medium, bot:hair, left:thin, right:thin
  //         右端A=曜日(横書き, medium四辺・上下結合)
  //         右端B=日付(横書き, medium四辺・上下結合)
  //   下行: A/B結合(bot:medium), スタッフ → top:hair, bot:thin
  //         右端結合(bot:medium)
  //   最終日の下行: スタッフ → bot:medium
  //
  // 塗り: 土日祝は A〜右端B 全列に塗り, 平日は塗りなし
  // ============================================================

  const R=h=>"FF"+h;
  // 列定義
  const C_PER=1;             // A: 期間
  const C_WD_H=2;            // B: 曜日ヘッダー
  const C_STAFF=3;           // C〜: スタッフ
  const C_WD_R=3+sl.length;  // 右端曜日
  const C_SHOP_R=4+sl.length;// 右端店舗名
  const staffNumbers=options.staffNumbers||{};
  // ヘッダー2行構成（Row1=従業員番号, Row2=スタッフ名）→ データはRow3から
  const DATA_START=3;

  // 枠線
  const M={style:"medium",color:{argb:R("555555")}};
  const T={style:"thin",  color:{argb:R("AAAAAA")}};
  const H={style:"hair",  color:{argb:R("CCCCCC")}};

  // 配置
  const aV={horizontal:"center",vertical:"distributed",textRotation:255,wrapText:false};
  const aH={horizontal:"center",vertical:"middle"};

  // 塗り
  const fSat  ={type:"pattern",pattern:"solid",fgColor:{argb:R("DDEEFF")},bgColor:{argb:"FFFFFFFF"}};
  const fHol  ={type:"pattern",pattern:"solid",fgColor:{argb:R("FFEEEE")},bgColor:{argb:"FFFFFFFF"}};
  const fYel  ={type:"pattern",pattern:"solid",fgColor:{argb:R("FFFF00")},bgColor:{argb:"FFFFFFFF"}};
  const fNone ={type:"pattern",pattern:"none"};

  const wb=new ExcelJS.Workbook();
  wb.creator="ShiftApp";
  const ws=wb.addWorksheet("シフト一覧",{pageSetup:{orientation:"landscape"}});

  // 列幅
  ws.getColumn(C_PER).width=5.2;
  ws.getColumn(C_WD_H).width=5.2;
  sl.forEach((n,i)=>ws.getColumn(C_STAFF+i).width=5.2);
  ws.getColumn(C_WD_R).width=5.2;
  ws.getColumn(C_SHOP_R).width=5.2;

  const SC=(r,c,val,al,fill,border,font)=>{
    const cell=ws.getRow(r).getCell(c);
    cell.value=(val===null||val===undefined||val==="")? null:val;
    // alignmentはObject.assignで確実に反映
    const a=al||aV;
    cell.alignment=Object.assign({},a);
    // fillを確実に設定
    const f=fill||fNone;
    if(f.pattern==="none"){
      cell.fill={type:"pattern",pattern:"none",fgColor:{argb:"FFFFFFFF"},bgColor:{argb:"FFFFFFFF"}};
    } else {
      cell.fill=Object.assign({},f);
    }
    cell.border=border?Object.assign({},border):{};
    cell.font=Object.assign({name:"Yu Gothic",size:12,bold:false},font||{}); // デフォルトフォント（boldはヘッダーのみ）
  };

  // ===== Row1=従業員番号 / Row2=スタッフ名 の2行ヘッダー =====
  ws.getRow(1).height=18;   // 従業員番号行（横書き・低め）
  ws.getRow(2).height=78;   // スタッフ名行（縦書き・従来通り）

  // Row1左端(A1:B1): 従業員コード行のため横結合・空欄（期間等は表示しない）
  SC(1,C_PER,null,aH,fNone,{top:M,bottom:T,left:M,right:T},{bold:false,size:8});
  SC(1,C_WD_H,null,aH,fNone,{top:M,bottom:T,left:T,right:M},{bold:false,size:8});
  ws.mergeCells(1,C_PER,1,C_WD_H);
  // Row2: A=期間ラベル(縦書き), B=曜日ヘッダー(縦書き)
  SC(2,C_PER,periodLabel,aV,fNone,{top:T,bottom:M,left:M,right:T},{bold:true,size:14});
  SC(2,C_WD_H,"曜日",aV,fNone,{top:T,bottom:M,left:T,right:M},{bold:true,size:14});
  // スタッフ列: Row1=従業員番号(横書き), Row2=スタッフ名(縦書き)
  sl.forEach((nm,i)=>{
    const isFirst=i===0;
    if(isSpacer(nm)){
      SC(1,C_STAFF+i,null,aH,fNone,{top:M,left:isFirst?T:undefined,right:T,bottom:T},{bold:false,size:8});
      SC(2,C_STAFF+i,null,aV,fNone,{top:T,bottom:M,left:isFirst?T:undefined,right:T},{bold:false,size:12});
      return;
    }
    const staffColorArgb=(options.staffColors||{})[nm]==="red"?"FFFF0000":"FF000000";
    const num=staffNumbers[nm]||"";
    // 従業員番号行: 横書き・中央・小さめ（列幅5.2に4文字収まるsize:8）
    SC(1,C_STAFF+i,num,aH,fNone,
      {top:M,left:isFirst?T:undefined,right:T,bottom:T},
      {bold:false,size:8,color:{argb:"FF000000"}});
    // スタッフ名行: 縦書き
    SC(2,C_STAFF+i,nm,aV,fNone,
      {top:T,bottom:M,left:isFirst?T:undefined,right:T},
      {bold:true,size:14,color:{argb:staffColorArgb}});
  });
  // Row1右端(曜日:店舗名): 従業員コード行のため横結合・空欄
  SC(1,C_WD_R,null,aH,fNone,{top:M,bottom:T,left:M,right:T},{bold:false,size:8});
  SC(1,C_SHOP_R,null,aH,fNone,{top:M,bottom:T,left:T,right:T},{bold:false,size:8});
  ws.mergeCells(1,C_WD_R,1,C_SHOP_R);
  // Row2: 右端曜日・店舗名（縦書き）
  SC(2,C_WD_R,"曜日",aV,fNone,{top:T,bottom:M,left:M,right:T},{bold:true,size:14});
  SC(2,C_SHOP_R,shopName||"",aV,fNone,{top:T,bottom:M,left:T,right:T},{bold:true,size:14});

  // ===== データ行 (1日=2行) =====
  dates.forEach((ds,di)=>{
    const d=pd(ds),dow=d.getDay(),day=d.getDate(),wd=WD[dow];
    const isSat=dow===6,isSunHol=dow===0||isHoliday(ds);
    const fill=isSat?fSat:isSunHol?fHol:fNone; // 平日=塗りなし
    const isLast=di===dates.length-1;
    const rT=DATA_START+di*2, rB=rT+1;
    ws.getRow(rT).height=16.5;
    ws.getRow(rB).height=16.5;

    // A列: 日付 (medium四辺, 上下結合, 横書き)
    SC(rT,C_PER,day,aH,fill,{top:M,bottom:M,left:M,right:M},{name:"Yu Gothic",bold:false,size:12,color:{argb:"FF000000"}});
    SC(rB,C_PER,null,aH,fill,{top:M,bottom:M,left:M,right:M});
    ws.mergeCells(rT,C_PER,rB,C_PER);

    // B列: 曜日 (medium四辺, 上下結合, 横書き)
    SC(rT,C_WD_H,wd,aH,fill,{top:M,bottom:M,left:M,right:M},{name:"Yu Gothic",bold:false,size:12,color:{argb:R("000000")}});
    SC(rB,C_WD_H,null,aH,fill,{top:M,bottom:M,left:M,right:M});
    ws.mergeCells(rT,C_WD_H,rB,C_WD_H);

    // スタッフ列
    sl.forEach((nm,si)=>{
      const sub=ss.find(s=>s.staffName===nm||(staffAliases[nm]||[]).includes(s.staffName)),sh=sub?.shifts?.[ds];
      const isWork=sh&&sh.status==="work";
      const ci=C_STAFF+si;
      // 上行: top:medium, bot:hair
      // 下行: top:hair, bot:thin (最終日はbot:medium)
      const botT=isLast?M:T;
      if(isSpacer(nm)){
        // スペーサー列: 空白
        SC(rT,ci,null,aH,fill,{top:M,bottom:H,left:T,right:T});
        SC(rB,ci,null,aH,fill,{top:H,bottom:botT,left:T,right:T});
      } else if(!sub){
        // 未提出: 空白
        SC(rT,ci,null,aH,fill,{top:M,bottom:H,left:T,right:T});
        SC(rB,ci,null,aH,fill,{top:H,bottom:botT,left:T,right:T});
      } else if(isWork){
        const fmtT=t=>{if(!t)return null;const[h,m]=t.split(":").map(Number);return m===0?String(h):String(h+m/60);};
        // resolver がある場合は調整済み値を使用
        const rv=resolver?{st:resolver(nm,ds,"start"),en:resolver(nm,ds,"end")}:null;
        const startT=rv?rv.st.time:sh.start, endT=rv?rv.en.time:sh.end;
        const sNote=rv?rv.st.note:(sh.startNote||""), eNote=rv?rv.en.note:(sh.endNote||"");
        // サフィックスh/k/xがある場合は黄色塗り
        const startFill=sNote?fYel:fill;
        const endFill=eNote?fYel:fill;
        const startDisp=startT?((fmtT(startT)||"")+sNote):null;
        const endDisp=endT?((fmtT(endT)||"")+eNote):null;
        SC(rT,ci,startDisp,aH,startFill,{top:M,bottom:H,left:T,right:T},{name:"Yu Gothic",bold:false,size:12});
        SC(rB,ci,endDisp,aH,endFill,{top:H,bottom:botT,left:T,right:T},{name:"Yu Gothic",bold:false,size:12});
      } else {
        // 休み: 斜線（右上→左下）
        const diagU={up:false,down:true,style:"thin",color:{argb:R("AAAAAA")}};
        SC(rT,ci,null,aH,fill,{top:M,bottom:H,left:T,right:T,diagonal:diagU});
        SC(rB,ci,null,aH,fill,{top:H,bottom:botT,left:T,right:T,diagonal:diagU});
      }
    });

    // 右端曜日: medium四辺, 上下結合
    SC(rT,C_WD_R,wd,aH,fill,{top:M,bottom:M,left:M,right:M},{name:"Yu Gothic",bold:false,size:12,color:{argb:R("000000")}});
    SC(rB,C_WD_R,null,aH,fill,{top:M,bottom:M,left:M,right:M});
    ws.mergeCells(rT,C_WD_R,rB,C_WD_R);

    // 右端日付: medium四辺, 上下結合
    SC(rT,C_SHOP_R,day,aH,fill,{top:M,bottom:M,left:M,right:M},{name:"Yu Gothic",bold:false,size:12});
    SC(rB,C_SHOP_R,null,aH,fill,{top:M,bottom:M,left:M,right:M});
    ws.mergeCells(rT,C_SHOP_R,rB,C_SHOP_R);
  });

  // ファイル名・ダウンロード
  const sn=(shopName||"店舗").replace(/[\\/:*?"<>|]/g,"");
  const pl=periodLabel.replace(/[\\/:*?"<>|]/g,"");
  const fname=`${sn}${pl}${resolver?"":"_修正前"}.xlsx`;
  wb.xlsx.writeBuffer().then(buf=>{
    const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=fname; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    tt(`✓ ${fname} をダウンロードしました`);
  }).catch(e=>{
    console.error("Excel生成失敗:",e);
    tt("✕ Excel生成に失敗しました: "+e.message);
  });
}

// ===== スタッフ登録タブ =====
function StaffTab({staffList,onSave,tt,plan="free",onUpgrade,onRenameStaff,settings={},onSaveSettings,subs=[],periods=[]}){
  const[newName,setNewName]=useState("");
  const[editIdx,setEditIdx]=useState(null);
  const[editName,setEditName]=useState("");
  const[aliasIdx,setAliasIdx]=useState(null); // 別名編集中のスタッフindex
  const isPro=plan==="pro"||plan==="premium";
  const isPremium=plan==="premium";
  const[dragIdx,setDragIdx]=useState(null);
  const[dragOverIdx,setDragOverIdx]=useState(null);
  const staffAliases=settings.staffAliases||{};
  const saveAlias=(staffName,aliases)=>{
    onSaveSettings&&onSaveSettings({...settings,staffAliases:{...staffAliases,[staffName]:aliases}});
  };
  const addAlias=(staffName,alias)=>{
    if(staffList.includes(alias)){tt("▲ 登録名と同じ名前は別名にできません");return;}
    const cur=staffAliases[staffName]||[];
    if(cur.includes(alias)){tt("▲ 既に登録されている別名です");return;}
    saveAlias(staffName,[...cur,alias]);
    tt(`✓「${alias}」を別名として追加しました`);
  };
  const delAlias=(staffName,alias)=>{
    const cur=(staffAliases[staffName]||[]).filter(a=>a!==alias);
    saveAlias(staffName,cur);
    tt("別名を削除しました");
  };
  // 最新期間の提出名のうち、未登録かつ未エイリアスのもの
  const allAliases=Object.values(staffAliases).flat();
  const latestPeriod=[...periods].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate))[0];
  const unregisteredNames=useMemo(()=>{
    if(!latestPeriod)return[];
    const names=subs.filter(s=>s.periodId===latestPeriod.id).map(s=>s.staffName);
    return[...new Set(names)].filter(n=>!staffList.includes(n)&&!allAliases.includes(n));
  },[subs,latestPeriod,staffList,staffAliases]);
  const lim=PLAN_LIMITS[plan]?.staff??10;
  const staffColors=settings.staffColors||{};
  const toggleColor=name=>{
    const cur=staffColors[name]||"black";
    const next=cur==="black"?"red":"black";
    onSaveSettings&&onSaveSettings({...settings,staffColors:{...staffColors,[name]:next}});
  };
  const startEdit=i=>{setEditIdx(i);setEditName(staffList[i]);};
  const cancelEdit=()=>{setEditIdx(null);setEditName("");};
  const confirmEdit=i=>{
    const trimmed=editName.trim();
    if(!trimmed){tt("▲ 名前を入力してください");return;}
    if(staffList.includes(trimmed)&&trimmed!==staffList[i]){tt("▲ 既に登録されている名前です");return;}
    if(trimmed===staffList[i]){cancelEdit();return;}
    onRenameStaff&&onRenameStaff(staffList[i],trimmed);
    setEditIdx(null);setEditName("");
  };
  const add=()=>{
    if(!newName.trim()){tt("▲ 名前を入力");return;}
    if(staffList.includes(newName.trim())){tt("▲ 既に登録されています");return;}
    if(staffList.filter(n=>!isSpacer(n)).length>=lim){onUpgrade&&onUpgrade({type:"staff",limit:lim,plan});return;}
    ph("staff_added",{staff_count:staffList.filter(n=>!isSpacer(n)).length+1});
    onSave([...staffList,newName.trim()]);setNewName("");tt(`✓ ${newName.trim()} を追加しました`);
  };
  const del=i=>{const a=[...staffList];a.splice(i,1);onSave(a);tt("削除しました");};
const dragIdxRef=useRef(null);
  const longPressTimer=useRef(null);
  const dragActiveRef=useRef(false);
  const handleGripPointerDown=(e,i)=>{
    if(!isPro)return;
    e.preventDefault();
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
    longPressTimer.current=setTimeout(()=>{
      dragActiveRef.current=true;
      dragIdxRef.current=i;
      setDragIdx(i);
      if(navigator.vibrate)navigator.vibrate(50);
    },500);
  };
  const handleGripPointerMove=(e)=>{
    if(!dragActiveRef.current)return;
    e.preventDefault();
    const el=document.elementFromPoint(e.clientX,e.clientY);
    const item=el&&el.closest("[data-staff-idx]");
    if(item){const idx=parseInt(item.getAttribute("data-staff-idx"),10);if(!isNaN(idx))setDragOverIdx(idx);}
  };
  const handleGripPointerUp=()=>{
    clearTimeout(longPressTimer.current);
    if(dragActiveRef.current){
      const from=dragIdxRef.current;
      setDragIdx(null);
      setDragOverIdx(prev=>{
        if(from!==null&&prev!==null&&from!==prev){
          const a=[...staffList];const[moved]=a.splice(from,1);a.splice(prev,0,moved);onSave(a);
        }
        return null;
      });
      dragIdxRef.current=null;
      dragActiveRef.current=false;
    }
  };
  const handleGripPointerCancel=()=>{
    clearTimeout(longPressTimer.current);
    dragIdxRef.current=null;
    dragActiveRef.current=false;
    setDragIdx(null);
    setDragOverIdx(null);
  };
  return(
    <div>
      <AT>スタッフ登録</AT>
      <AC title="スタッフ一覧">
        {!isPro&&<div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,background:"var(--c-card)",border:"1px solid #E5E7EB",borderRadius:8,padding:"7px 10px"}}>
          {`Freeプラン：最大${lim}名まで登録可能（${staffList.filter(n=>!isSpacer(n)).length}/${lim}名）`}
          {!isPro&&<span style={{marginLeft:8,color:"#F59E0B",fontSize:11}}>並べ替え・名前色変更はProプラン（500円/月）で利用できます</span>}
        </div>}
        {staffList.length===0&&<div style={{fontSize:13,color:"var(--c-text4)",marginBottom:12}}>スタッフが登録されていません</div>}
        {/* 行がカード幅を超える場合はカード内で横スクロール（行背景は末尾の削除ボタンまで届く） */}
        <div style={{overflowX:"auto"}}>
        <div style={{minWidth:"max-content"}}>
        {staffList.map((n,i)=>(
          <div key={i} style={{marginBottom:6}}>
          {isSpacer(n)
            ?<div data-staff-idx={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",border:dragOverIdx===i&&dragIdx!==null?"2px solid #f87036":"1px dashed var(--c-border2)",borderRadius:10,background:"transparent",opacity:dragIdx===i?.4:1,transition:"opacity .15s"}}>
              {isPro&&<span onPointerDown={e=>handleGripPointerDown(e,i)} onPointerMove={handleGripPointerMove} onPointerUp={handleGripPointerUp} onPointerCancel={handleGripPointerCancel} onContextMenu={e=>e.preventDefault()} style={{cursor:"grab",color:dragIdx===i?"#f87036":"var(--c-text4)",fontSize:16,padding:"0 2px",userSelect:"none",WebkitUserSelect:"none",lineHeight:1,touchAction:"none"}}>⠿</span>}
              <span style={{flex:1,fontSize:12,textAlign:"center",color:"var(--c-text4)",letterSpacing:2}}>─ 空白列 ─</span>
              <button onClick={()=>del(i)} style={AD}>削除</button>
            </div>
            :<div data-staff-idx={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"var(--c-card)",border:dragOverIdx===i&&dragIdx!==null?"2px solid #f87036":"1px solid #E5E7EB",borderRadius:10,opacity:dragIdx===i?.4:1,transition:"opacity .15s"}}>
            {isPro&&<span onPointerDown={e=>handleGripPointerDown(e,i)} onPointerMove={handleGripPointerMove} onPointerUp={handleGripPointerUp} onPointerCancel={handleGripPointerCancel} onContextMenu={e=>e.preventDefault()} style={{cursor:"grab",color:dragIdx===i?"#f87036":"var(--c-text4)",fontSize:16,padding:"0 2px",userSelect:"none",WebkitUserSelect:"none",lineHeight:1,flexShrink:0,touchAction:"none"}}>⠿</span>}
            <span style={{fontSize:13,color:"var(--c-text4)",minWidth:24,textAlign:"center"}}>{staffList.slice(0,i).filter(x=>!isSpacer(x)).length+1}</span>
            {editIdx===i
              ?<>
                {isPro&&<div style={{width:18,height:18,borderRadius:"50%",background:(staffColors[staffList[i]]||"black")==="red"?"#FF4757":"#374151",border:"2px solid #D1D5DB",flexShrink:0}}/>}
                <input value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")confirmEdit(i);if(e.key==="Escape")cancelEdit();}} autoFocus maxLength={50} style={{...AI,flex:1,padding:"6px 10px",fontSize:16}}/>
                <button onClick={()=>confirmEdit(i)} style={{...AB,padding:"6px 12px",fontSize:12}}>保存</button>
                <button onClick={cancelEdit} style={{...AGray,padding:"6px 12px",fontSize:12}}>ｷｬﾝｾﾙ</button>
              </>
              :<>
                {isPro&&<button onClick={()=>toggleColor(n)} title="タップで色を切り替え" style={{width:18,height:18,borderRadius:"50%",background:(staffColors[n]||"black")==="red"?"#FF4757":"#374151",border:"2px solid #D1D5DB",cursor:"pointer",flexShrink:0,padding:0}}/>}
                <span style={{flex:1,fontSize:14,color:"var(--c-text)",fontWeight:600}}>{n}</span>
                {isPremium&&<input value={(settings.staffNumbers||{})[n]||""} onChange={e=>{const v=e.target.value;const nums={...(settings.staffNumbers||{})};if(v)nums[n]=v;else delete nums[n];onSaveSettings&&onSaveSettings({...settings,staffNumbers:nums});}} maxLength={8} placeholder="番号" style={{width:64,fontSize:16,padding:"4px 6px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:6,color:"var(--c-text2)",flexShrink:0,textAlign:"center"}}/>}
                {isPremium&&<select value={(settings.staffAttributes||{})[n]||"parttime"} onChange={e=>{const v=e.target.value;const attrs={...(settings.staffAttributes||{})};if(v)attrs[n]=v;else delete attrs[n];onSaveSettings&&onSaveSettings({...settings,staffAttributes:attrs});}} style={{fontSize:16,padding:"4px 6px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:6,color:"var(--c-text2)",cursor:"pointer",flexShrink:0}}>
                  {Object.entries({employee:{name:"社員"},parttime:{name:"バイト"},...(settings.staffTypeLimits||{})}).map(([v,t])=>{const label=(typeof t==="object"?t.name:"")||STAFF_TYPE_LABELS[v]||"";return label?<option key={v} value={v}>{label}</option>:null;})}
                </select>}
                {isPro&&<button onClick={()=>{setAliasIdx(aliasIdx===i?null:i);}} style={{padding:"6px 10px",background:aliasIdx===i?"rgba(248,112,54,.15)":"rgba(248,112,54,.06)",border:`1px solid ${aliasIdx===i?"#f87036":"rgba(248,112,54,.3)"}`,borderRadius:6,color:"#f87036",fontSize:12,cursor:"pointer",minWidth:64,textAlign:"center"}}>
                  別名{(staffAliases[n]||[]).length>0?` (${(staffAliases[n]||[]).length})`:""}
                </button>}
                <button onClick={()=>startEdit(i)} style={{padding:"6px 10px",background:"rgba(59,130,246,.08)",border:"1px solid rgba(59,130,246,.25)",borderRadius:6,color:"#3B82F6",fontSize:12,cursor:"pointer"}}>編集</button>
                <button onClick={()=>del(i)} style={AD}>削除</button>
              </>
            }
          </div>}
          {/* 別名パネル（Pro・展開時） */}
          {isPro&&aliasIdx===i&&(
            <div style={{marginTop:4,padding:"12px 14px",background:"rgba(248,112,54,.04)",border:"1px solid rgba(248,112,54,.2)",borderRadius:10,position:"sticky",left:0,maxWidth:"calc(100vw - 76px)",boxSizing:"border-box"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#f87036",marginBottom:8}}>別名（スタッフが入力できる名前）</div>
              {/* 登録済み別名 */}
              {(staffAliases[n]||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                {(staffAliases[n]||[]).map((alias,ai)=>(
                  <div key={ai} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(248,112,54,.1)",border:"1px solid rgba(248,112,54,.25)",borderRadius:16,padding:"3px 10px 3px 12px",fontSize:13,color:"#c45b1a",fontWeight:600}}>
                    {alias}
                    <button onClick={()=>delAlias(n,alias)} style={{background:"none",border:"none",color:"#f87036",cursor:"pointer",padding:"0 0 0 4px",fontSize:14,lineHeight:1}}>×</button>
                  </div>
                ))}
              </div>}
              {/* 最新期間の未登録名から選ぶ */}
              <div style={{fontSize:11,fontWeight:700,color:"var(--c-text3)",marginBottom:6}}>
                最新期間「{latestPeriod?.label||""}」の未登録の名前：
              </div>
              {unregisteredNames.length===0
                ?<div style={{fontSize:12,color:"var(--c-text4)",padding:"6px 0"}}>
                    {latestPeriod?"未登録の提出名はありません":"期間データがありません"}
                  </div>
                :<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {unregisteredNames.map((alias,ai)=>(
                    <button key={ai} onClick={()=>addAlias(n,alias)}
                      style={{padding:"5px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:16,fontSize:13,color:"var(--c-text2)",cursor:"pointer",fontWeight:600}}>
                      ＋ {alias}
                    </button>
                  ))}
                </div>
              }
              <div style={{fontSize:11,color:"var(--c-text4)",marginTop:8}}>タップした名前が「{n}」の別名として登録されます</div>
            </div>
          )}
          </div>
        ))}
        </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="スタッフ名を入力" maxLength={50} style={AI}/>
          <button onClick={add} style={AB}>＋ 追加</button>
        </div>
        {isPro&&<button onClick={()=>{onSave([...staffList,"__spacer__"+genToken()]);tt("✓ 空白列を追加しました");}} style={{...AGray,width:"100%",fontSize:13,marginTop:8}}>＋ 空白列を追加（末尾）</button>}
        {staffList.filter(n=>!isSpacer(n)).length>=lim&&<div style={{marginTop:10,fontSize:12,color:"#F59E0B",textAlign:"center"}}>▲ 上限に達しています。アップグレードするとさらに追加できます。</div>}
      </AC>
    </div>
  );
}

// ===== 候補管理タブ（複数選択対応）=====
function CandTab({settings,onSave,globalTemplates=[],saveGlobalTemplates,tt,plan="free"}){
  const[mode,setMode]=useState("global");
  const[selDows,setSelDows]=useState([1]);
  const[selDates,setSelDates]=useState([tds]);
  const[newDate,setNewDate]=useState(tds);
  // 複数選択用
  const[selStart,setSelStart]=useState("");
  const[selEnd,setSelEnd]=useState("");
  const[wSelStart,setWSelStart]=useState("");
  const[wSelEnd,setWSelEnd]=useState("");
  const[dSelStart,setDSelStart]=useState("");
  const[dSelEnd,setDSelEnd]=useState("");
  const[tmplName,setTmplName]=useState("");
  const[selDayType,setSelDayType]=useState("weekday");
  const[brkStart,setBrkStart]=useState("");
  const[brkEnd,setBrkEnd]=useState("");
  const[brkTags,setBrkTags]=useState([]); // 新規休憩に付与する属性タグ
  const[editTagKey,setEditTagKey]=useState(null); // タグ編集中の "dayType_index"

  const toggleArr=(arr,setArr,val)=>setArr(prev=>prev.includes(val)?prev.filter(v=>v!==val):[...prev,val]);

  const addG=()=>{
    if(!selStart||!selEnd){tt("▲ 開始・終了を選択してください");return;}
    if(selStart>=selEnd){tt("▲ 退勤は出勤より後にしてください");return;}
    const nc={start:selStart,end:selEnd};
    if((settings.candidates||[]).some(c=>c.start===nc.start&&c.end===nc.end)){tt("▲ 同じ時間帯が既に登録されています");return;}
    const merged=sc([...(settings.candidates||[]),nc]);
    onSave({...settings,candidates:merged});setSelStart("");setSelEnd("");tt(`✓ ${selStart}〜${selEnd} を追加`);
  };
  const delG=i=>{const c=[...(settings.candidates||[])];c.splice(i,1);onSave({...settings,candidates:c});};

  const addW=()=>{
    if(!wSelStart||!wSelEnd){tt("▲ 開始・終了を選択してください");return;}
    if(wSelStart>=wSelEnd){tt("▲ 退勤は出勤より後にしてください");return;}
    const w={...(settings.weekdayCandidates||{})};
    const nc={start:wSelStart,end:wSelEnd};
    let total=0;
    selDows.forEach(dow=>{
      const b=w[dow]||[];
      if(!b.some(c=>c.start===nc.start&&c.end===nc.end)){w[dow]=sc([...b,nc]);total++;}
    });
    onSave({...settings,weekdayCandidates:w});setWSelStart("");setWSelEnd("");
    tt(total>0?`✓ ${selDows.map(d=>WD[d]).join("・")}に追加`:"▲ 既に登録済みです");
  };
  const delW=(d,i)=>{const w={...(settings.weekdayCandidates||{})};w[d]=[...(w[d]||[])];w[d].splice(i,1);onSave({...settings,weekdayCandidates:w});tt("削除しました");};

  const addD=()=>{
    if(!dSelStart||!dSelEnd){tt("▲ 開始・終了を選択してください");return;}
    if(dSelStart>=dSelEnd){tt("▲ 退勤は出勤より後にしてください");return;}
    const dc={...(settings.dateCandidates||{})};
    const nc={start:dSelStart,end:dSelEnd};
    let total=0;
    selDates.forEach(dt=>{
      if(!(dc[dt]||[]).some(c=>c.start===nc.start&&c.end===nc.end)){dc[dt]=sc([...(dc[dt]||[]),nc]);total++;}
    });
    onSave({...settings,dateCandidates:dc});setDSelStart("");setDSelEnd("");
    tt(total>0?`✓ ${selDates.length}日付に追加`:"▲ 既に登録済みです");
  };
  const delD=(dt,i)=>{const dc={...(settings.dateCandidates||{})};dc[dt]=[...(dc[dt]||[])];dc[dt].splice(i,1);if(dc[dt].length===0)delete dc[dt];onSave({...settings,dateCandidates:dc});};

  // テンプレート保存
  const saveTemplate=()=>{
    if(!tmplName.trim()){tt("▲ テンプレート名を入力");return;}
    const wdCopy={...(settings.weekdayCandidates||{})};
    const tmpl={name:tmplName.trim(),weekdayCandidates:wdCopy,savedAt:new Date().toISOString()};
    const ts=[...globalTemplates,tmpl];
    saveGlobalTemplates(ts);setTmplName("");tt(`✓ テンプレート「${tmplName.trim()}」を保存しました（この店舗）`);
  };
  const applyTemplate=t=>{
    if(!confirm(`テンプレート「${t.name}」を適用しますか？現在の曜日別候補が上書きされます。`))return;
    onSave({...settings,weekdayCandidates:t.weekdayCandidates});tt(`✓ テンプレート「${t.name}」を適用しました`);
  };
  const delTemplate=i=>{const ts=[...globalTemplates];ts.splice(i,1);saveGlobalTemplates(ts);tt("削除しました");};

  // 選択中の日付の候補（複数選択時は全日付の和集合）
  const dC=selDates.length===1?((settings.dateCandidates||{})[selDates[0]]||[]):[];

  const SingleTimeSelect=({value,onChange,label})=>(
    <div style={{flex:1}}>
      <div style={{fontSize:11,color:"var(--c-text3)",marginBottom:4}}>{label}</div>
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:"100%",padding:"9px 10px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none",cursor:"pointer"}}>
        <option value="">-- 選択 --</option>
        {TO.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );

  return(
    <div>
      <AT>候補管理</AT>
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {[["global","全体"],["weekday","曜日別"],["date","日付別"],["template","テンプレ"],...(plan==="premium"?[["break","休憩"]]:[])] .map(([id,l])=>(
          <button key={id} onClick={()=>setMode(id)} style={{padding:"8px 14px",background:mode===id?"#f87036":"var(--c-border)",border:`1px solid ${mode===id?"#f87036":"var(--c-border)"}`,borderRadius:8,color:"var(--c-text)",fontSize:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
        ))}
      </div>

      {mode==="global"&&<AC title="全体候補（優先度低）">
        <CL items={settings.candidates||[]} onDel={delG}/>
        <div style={{marginTop:12,display:"flex",gap:10,alignItems:"flex-end"}}>
          <SingleTimeSelect value={selStart} onChange={setSelStart} label="出勤時刻"/>
          <div style={{color:"var(--c-text4)",paddingBottom:12,fontSize:16}}>〜</div>
          <SingleTimeSelect value={selEnd} onChange={setSelEnd} label="退勤時刻"/>
          <button onClick={addG} style={{...AB,whiteSpace:"nowrap",marginBottom:0}}>＋ 追加</button>
        </div>
      </AC>}

      {mode==="weekday"&&<AC title="曜日別候補（全体より優先）">
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>複数選択で一括追加 ／ 祝日は平日・土日より優先適用されます</div>

        {/* 曜日選択ボタン（日曜を先頭に・祝日も含む） */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
          {[0,1,2,3,4,5,6,7].map(d=>{
            const sel=selDows.includes(d);
            const isSat=d===6,isSun=d===0,isHol=d===7;
            return(<button key={d} onClick={()=>setSelDows(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d])}
              style={{padding:"7px 14px",borderRadius:20,fontSize:13,fontWeight:700,border:"1px solid",cursor:"pointer",
                background:sel?(isSat?"#3B82F6":isSun||isHol?"#FF4757":"#f87036"):"var(--c-input)",
                borderColor:sel?"transparent":isSat?"rgba(147,197,253,.3)":isSun||isHol?"rgba(252,165,165,.3)":"var(--c-border2)",
                color:sel?"white":isSat?"#3B82F6":isSun||isHol?"#FF4757":"var(--c-text2)"}}>
              {d===7?"祝":WD[d]}
            </button>);
          })}
        </div>

        {/* 追加フォーム（常に表示・選択中の曜日を表示） */}
        <div style={{marginBottom:16,padding:"12px",background:"var(--c-input2)",borderRadius:10}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-end",marginBottom:8}}>
            <SingleTimeSelect value={wSelStart} onChange={setWSelStart} label="出勤時刻"/>
            <div style={{color:"var(--c-text4)",paddingBottom:12,fontSize:16}}>〜</div>
            <SingleTimeSelect value={wSelEnd} onChange={setWSelEnd} label="退勤時刻"/>
            <button onClick={addW} style={{...AB,whiteSpace:"nowrap"}}>＋ 追加</button>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:10,color:"var(--c-text4)"}}>{selDows.map(d=>d===7?"祝":WD[d]).join("・")} に追加</div>
            <button onClick={()=>{
              const w={...(settings.weekdayCandidates||{})};
              let total=0;
              selDows.forEach(dow=>{
                const b=w[dow]||[];
                if(!b.some(c=>c.closed)){w[dow]=sc([...b,{closed:true}]);total++;}
              });
              onSave({...settings,weekdayCandidates:w});
              tt(total>0?`✓ ${selDows.map(d=>d===7?"祝":WD[d]).join("・")}に休業日を設定`:"▲ 既に設定済みです");
            }} style={{padding:"6px 12px",background:"rgba(255,71,87,.15)",border:"1px solid rgba(255,71,87,.3)",borderRadius:8,color:"#FF4757",fontSize:12,fontWeight:700,cursor:"pointer"}}>× 休業日に設定</button>
          </div>
        </div>

        {/* 全曜日の候補一覧（常に表示・日曜→祝→月〜土の順） */}
        <div style={{borderTop:"1px solid var(--c-border)",paddingTop:14}}>
          <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,fontWeight:600}}>全曜日の登録済み候補</div>
          {[0,1,2,3,4,5,6,7].map(d=>{
            const cands=(settings.weekdayCandidates||{})[d]||[];
            const isSat=d===6,isSun=d===0,isHol=d===7;
            const label=d===7?"祝日":WD[d]+"曜日";
            const lc=isSat?"#93C5FD":isSun||isHol?"#FCA5A5":"#4B5563";
            return(
              <div key={d} style={{marginBottom:8,background:"var(--c-input2)",borderRadius:10,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",
                  borderBottom:cands.length>0?"1px solid var(--c-border)":"none"}}>
                  <span style={{fontSize:13,fontWeight:700,color:lc}}>{label}</span>
                  <span style={{fontSize:11,color:cands.length>0?"#9CA3AF":"var(--c-border2)"}}>
                    {cands.length>0?`${cands.length}件`:"未設定"}
                  </span>
                </div>
                {cands.length>0&&<div style={{padding:"6px 8px"}}>
                  {cands.map((c,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                      padding:"5px 8px",background:c.closed?"rgba(255,71,87,.08)":"var(--c-card)",border:c.closed?"1px solid rgba(255,71,87,.2)":"none",borderRadius:7,marginBottom:3}}>
                      {c.closed
                        ?<span style={{fontSize:13,color:"#FF4757",fontWeight:600}}>× 休業日</span>
                        :<span style={{fontSize:13,color:"var(--c-text)",fontWeight:600}}>{c.start} 〜 {c.end}</span>
                      }
                      <button onClick={()=>delW(d,i)} style={AD}>削除</button>
                    </div>
                  ))}
                </div>}
              </div>
            );
          })}
        </div>
      </AC>}

      {mode==="date"&&<AC title="日付別候補（最優先）">
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:6}}>複数選択可（選択した全日付にまとめて追加）</div>
        <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
          <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{...AI,maxWidth:180}}/>
          <button onClick={()=>{if(!selDates.includes(newDate))setSelDates(prev=>[...prev,newDate]);}} style={{...AB,padding:"10px 14px",fontSize:13}}>＋ 追加</button>
        </div>
        {selDates.length>0&&<div style={{marginBottom:10}}>
          <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:6}}>選択中の日付：</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {selDates.sort().map(dt=>(
              <div key={dt} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(248,112,54,.15)",border:"1px solid rgba(248,112,54,.3)",borderRadius:8,padding:"4px 8px"}}>
                <span style={{fontSize:12,color:"#FFA070",fontWeight:600}}>{dt.replace(/-/g,"/")}</span>
                <button onClick={()=>setSelDates(prev=>prev.filter(d=>d!==dt))} style={{background:"none",border:"none",color:"#FFA070",cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>×</button>
              </div>
            ))}
          </div>
        </div>}
        {selDates.length===1&&<>
          <div style={{fontSize:13,fontWeight:700,color:"var(--c-text2)",marginBottom:8}}>{selDates[0].replace(/-/g,"/")} の登録済み候補</div>
          {dC.length===0&&<div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>未設定</div>}
          <CL items={dC} onDel={i=>delD(selDates[0],i)}/>
        </>}
        <div style={{marginTop:12,padding:"12px",background:"var(--c-input2)",borderRadius:10}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-end",marginBottom:8}}>
            <SingleTimeSelect value={dSelStart} onChange={setDSelStart} label="出勤時刻"/>
            <div style={{color:"var(--c-text4)",paddingBottom:12,fontSize:16}}>〜</div>
            <SingleTimeSelect value={dSelEnd} onChange={setDSelEnd} label="退勤時刻"/>
            <button onClick={addD} style={{...AB,whiteSpace:"nowrap"}}>＋ 追加</button>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:10,color:"var(--c-text4)"}}>{selDates.length}日付に追加</div>
            <button onClick={()=>{
              const dc={...(settings.dateCandidates||{})};
              let total=0;
              selDates.forEach(dt=>{
                if(!(dc[dt]||[]).some(c=>c.closed)){dc[dt]=sc([...(dc[dt]||[]),{closed:true}]);total++;}
              });
              onSave({...settings,dateCandidates:dc});
              tt(total>0?`✓ ${selDates.length}日付に休業日を設定`:"▲ 既に設定済みです");
            }} style={{padding:"6px 12px",background:"rgba(255,71,87,.15)",border:"1px solid rgba(255,71,87,.3)",borderRadius:8,color:"#FF4757",fontSize:12,fontWeight:700,cursor:"pointer"}}>× 休業日に設定</button>
          </div>
        </div>
        {Object.keys(settings.dateCandidates||{}).length>0&&<div style={{marginTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--c-text3)",marginBottom:8}}>設定済みの日付</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{Object.keys(settings.dateCandidates||{}).sort().map(dt=>{const sel=selDates.includes(dt);return(<button key={dt} onClick={()=>setSelDates(prev=>prev.includes(dt)?prev.filter(d=>d!==dt):[...prev,dt])} style={{padding:"4px 9px",borderRadius:6,background:sel?"#f87036":"var(--c-border)",border:`1px solid ${sel?"#f87036":"var(--c-border2)"}`,color:"var(--c-text)",fontSize:11,fontWeight:600,cursor:"pointer"}}>{dt.replace(/-/g,"/")}（{((settings.dateCandidates||{})[dt]||[]).length}件）</button>);})}</div>
        </div>}
      </AC>}

      {mode==="template"&&<AC title="曜日別候補テンプレート">
        {plan==="free"&&<div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#F59E0B"}}>テンプレート機能はProプラン（500円/月）で利用できます</div>}
        <div style={{fontSize:13,color:"var(--c-text3)",marginBottom:12,opacity:plan==="free"?.4:1}}>現在の曜日別候補をテンプレートとして保存し、後で再利用できます。</div>
        <div style={{display:"flex",gap:8,marginBottom:16,opacity:plan==="free"?.4:1,pointerEvents:plan==="free"?"none":"auto"}}>
          <input value={tmplName} onChange={e=>setTmplName(e.target.value)} placeholder="テンプレート名を入力" style={{...AI,flex:1}}/>
          <button onClick={saveTemplate} style={AB}>保存</button>
        </div>
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>この店舗に保存されます</div>
        {globalTemplates.length===0&&<div style={{fontSize:13,color:"var(--c-text4)"}}>保存済みテンプレートはありません</div>}
        {globalTemplates.map((t,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:10,marginBottom:6,opacity:plan==="free"?.4:1,pointerEvents:plan==="free"?"none":"auto"}}>
            <span style={{flex:1,fontSize:14,color:"var(--c-text)",fontWeight:600}}>{t.name}</span>
            <button onClick={()=>applyTemplate(t)} style={{...AB,padding:"6px 12px",fontSize:12}}>適用</button>
            <button onClick={()=>delTemplate(i)} style={AD}>削除</button>
          </div>
        ))}
      </AC>}

      {mode==="break"&&(()=>{
        const attrOpts=getAttrOptions(settings);
        const attrName=id=>{const f=attrOpts.find(a=>a[0]===id);return f?f[1]:id;};
        const dtColor=dt=>dt==="sat"?"#3B82F6":dt==="sun"||dt==="hol"?"#FF4757":"#f87036";
        const removeBreak=(dt,i)=>{const bt={...(settings.breakTimes||{})};bt[dt]=[...(bt[dt]||[])];bt[dt].splice(i,1);onSave({...settings,breakTimes:bt});setEditTagKey(null);tt("削除しました");};
        const toggleTag=(dt,i,tagId)=>{const bt={...(settings.breakTimes||{})};bt[dt]=[...(bt[dt]||[])];const cur=bt[dt][i]||{};const tags=[...(cur.tags||[])];const p=tags.indexOf(tagId);if(p>=0)tags.splice(p,1);else tags.push(tagId);bt[dt][i]={...cur,tags:tags.length?tags:undefined};onSave({...settings,breakTimes:bt});};
        return(<AC title="休憩時間設定">
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>設定した休憩時間は出勤〜退勤から自動的に差し引かれ、純勤務時間として表示されます。</div>
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>休憩はランチ・ディナー両方の出勤、または9時間以上勤務するスタッフにのみ適用されます。</div>
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>タグを設定した休憩はその属性のスタッフにのみ適用されます。タグなしは全属性に適用。</div>
        {/* 追加フォーム */}
        <div>
          <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:8,fontWeight:600}}>休憩を追加</div>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {DAY_TYPES.map(([dt,l])=>{const sel=selDayType===dt;const c=dtColor(dt);
              return(<button key={dt} onClick={()=>setSelDayType(dt)} style={{padding:"7px 14px",borderRadius:20,fontSize:13,fontWeight:700,border:"1px solid",cursor:"pointer",background:sel?c:"var(--c-input)",borderColor:sel?"transparent":"var(--c-border2)",color:sel?"white":c}}>{l}</button>);
            })}
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:5}}>適用する属性（未選択＝全属性）</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {attrOpts.map(([aid,anm])=>{const on=brkTags.includes(aid);return(<button key={aid} onClick={()=>toggleArr(brkTags,setBrkTags,aid)} style={{padding:"5px 12px",borderRadius:16,fontSize:12,fontWeight:600,border:"1px solid",cursor:"pointer",background:on?"#f87036":"var(--c-input)",borderColor:on?"transparent":"var(--c-border2)",color:on?"white":"var(--c-text2)"}}>{anm}</button>);})}
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <SingleTimeSelect value={brkStart} onChange={setBrkStart} label="開始時刻"/>
            <div style={{color:"var(--c-text4)",paddingBottom:12,fontSize:16}}>〜</div>
            <SingleTimeSelect value={brkEnd} onChange={setBrkEnd} label="終了時刻"/>
            <button onClick={()=>{
              if(!brkStart||!brkEnd){tt("▲ 開始・終了を選択してください");return;}
              if(brkStart>=brkEnd){tt("▲ 終了は開始より後にしてください");return;}
              const bt={...(settings.breakTimes||{weekday:[],sat:[],sun:[],hol:[]})};
              const cur=bt[selDayType]||[];
              if(cur.some(b=>b.start===brkStart&&b.end===brkEnd)){tt("▲ 既に登録されています");return;}
              const nb={start:brkStart,end:brkEnd};if(brkTags.length)nb.tags=[...brkTags];
              bt[selDayType]=[...cur,nb].sort((a,b)=>a.start.localeCompare(b.start));
              onSave({...settings,breakTimes:bt});setBrkStart("");setBrkEnd("");setBrkTags([]);
              tt(`✓ ${brkStart}〜${brkEnd} を追加しました`);
            }} style={{...AB,whiteSpace:"nowrap"}}>＋ 追加</button>
          </div>
        </div>
        {/* 全区分の登録済み休憩一覧（常に表示） */}
        <div style={{marginTop:14,borderTop:"1px solid var(--c-border)",paddingTop:12}}>
          <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,fontWeight:600}}>登録済みの休憩</div>
          {DAY_TYPES.map(([dt,l])=>{
            const brks=(settings.breakTimes||{})[dt]||[];
            const lc=dtColor(dt);
            return(
              <div key={dt} style={{marginBottom:8,background:"var(--c-input2)",borderRadius:10,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderBottom:brks.length>0?"1px solid var(--c-border)":"none"}}>
                  <span style={{fontSize:13,fontWeight:700,color:lc}}>{l}</span>
                  <span style={{fontSize:11,color:brks.length>0?"#9CA3AF":"var(--c-border2)"}}>{brks.length>0?`${brks.length}件`:"未設定"}</span>
                </div>
                {brks.map((b,i)=>{
                  const ek=`${dt}_${i}`;const tags=b.tags||[];
                  return(<div key={i} style={{padding:"8px 12px",borderBottom:i<brks.length-1?"1px solid var(--c-border)":"none"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                      <span style={{fontSize:13,color:"var(--c-text)",fontWeight:600}}>{b.start} 〜 {b.end}</span>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setEditTagKey(editTagKey===ek?null:ek)} style={{padding:"4px 10px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:6,color:"var(--c-text2)",fontSize:12,fontWeight:600,cursor:"pointer"}}>タグ</button>
                        <button onClick={()=>removeBreak(dt,i)} style={AD}>削除</button>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:5}}>
                      {tags.length>0?tags.map(tg=>(<span key={tg} style={{fontSize:11,padding:"2px 8px",borderRadius:12,background:"rgba(248,112,54,.12)",color:"#f87036",fontWeight:600}}>{attrName(tg)}</span>))
                        :<span style={{fontSize:11,color:"var(--c-text4)"}}>全属性</span>}
                    </div>
                    {editTagKey===ek&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8,paddingTop:8,borderTop:"1px dashed var(--c-border)"}}>
                      {attrOpts.map(([aid,anm])=>{const on=tags.includes(aid);return(<button key={aid} onClick={()=>toggleTag(dt,i,aid)} style={{padding:"5px 12px",borderRadius:16,fontSize:12,fontWeight:600,border:"1px solid",cursor:"pointer",background:on?"#f87036":"var(--c-input)",borderColor:on?"transparent":"var(--c-border2)",color:on?"white":"var(--c-text2)"}}>{anm}</button>);})}
                    </div>}
                  </div>);
                })}
              </div>
            );
          })}
        </div>
      </AC>);
      })()}
    </div>
  );
}

// ===== 提出一覧タブ =====
function SubsTab({subs,periods,staffList,onSave,tt,settings={},onSaveSettings,plan="free"}){
  const[fn,setFn]=useState(""),[fp,setFp]=useState("all");
  const fpInit=useRef(false);
  useEffect(()=>{if(!fpInit.current&&periods.length>0){fpInit.current=true;const lat=[...periods].sort((a,b)=>new Date(b.startDate||0)-new Date(a.startDate||0))[0];if(lat)setFp(lat.id);}},[periods.length]);
  const[sf,setSf]=useState("submittedAt"),[sdr,setSdr]=useState("desc");
  const[det,setDet]=useState(null);
  const[linkTarget,setLinkTarget]=useState(null); // {subName, selectedStaff}
  const isPro=plan==="pro"||plan==="premium";
  const isPremium=plan==="premium";
  const staffAliases=settings.staffAliases||{};
  const allAliases=Object.values(staffAliases).flat();
  const isUnregistered=name=>!staffList.includes(name)&&!allAliases.includes(name);
  const registerAlias=(subName,registeredName)=>{
    const cur=staffAliases[registeredName]||[];
    if(!cur.includes(subName)){
      const newAliases={...staffAliases,[registeredName]:[...cur,subName]};
      onSaveSettings&&onSaveSettings({...settings,staffAliases:newAliases});
    }
    setLinkTarget(null);
    tt(`✓「${subName}」を「${registeredName}」の別名として登録しました`);
  };
  const tg=f=>{if(sf===f)setSdr(d=>d==="asc"?"desc":"asc");else{setSf(f);setSdr("asc");}};
  const fil=subs.filter(s=>(!fn||s.staffName.includes(fn))&&(fp==="all"||s.periodId===fp)).sort((a,b)=>{let va=sf==="submittedAt"?new Date(a[sf]).getTime():(a[sf]||""),vb=sf==="submittedAt"?new Date(b[sf]).getTime():(b[sf]||"");return(va<vb?-1:va>vb?1:0)*(sdr==="asc"?1:-1);});
  const gpl=id=>periods.find(p=>p.id===id)?.label||"不明";
  const saveAdj=(subId,date,field,value)=>{
    const newSubs=subs.map(s=>{if(s.id!==subId)return s;const sh={...(s.shifts||{})};sh[date]={...sh[date]};if(value)sh[date][field]=value;else delete sh[date][field];return{...s,shifts:sh};});
    onSave(newSubs);
    setDet(prev=>{if(!prev||prev.id!==subId)return prev;const sh={...(prev.shifts||{})};sh[date]={...sh[date]};if(value)sh[date][field]=value;else delete sh[date][field];return{...prev,shifts:sh};});
  };
  return(<div>
    <AT>提出一覧</AT>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <input value={fn} onChange={e=>setFn(e.target.value)} placeholder="氏名で絞り込み" style={{flex:1,minWidth:130,padding:"10px 14px",background:"var(--c-input)",border:"1px solid #E5E7EB",borderRadius:10,color:"var(--c-text)",fontSize:16,outline:"none"}}/>
      <select value={fp} onChange={e=>setFp(e.target.value)} style={{padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:10,color:"var(--c-text)",fontSize:16,outline:"none",cursor:"pointer"}}>
        <option value="all">全期間</option>
        {periods.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </div>
    <div style={{marginBottom:12,fontSize:13,color:"var(--c-text3)"}}>件数：<strong style={{color:"#FFA070",fontSize:16}}>{fil.length}</strong></div>
    <div style={{background:"var(--c-card)",border:"1px solid #E5E7EB",borderRadius:14,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr>
            {[["staffName","氏名"],["submittedAt","提出日時"]].map(([f,l])=><th key={f} onClick={()=>tg(f)} style={{background:"var(--c-input)",color:"var(--c-text2)",padding:"10px 14px",textAlign:"left",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",borderBottom:"1px solid #E5E7EB"}}>{l}{sf===f?(sdr==="asc"?" ▲":" ▼"):" ↕"}</th>)}
            {["出勤","操作"].map(h=><th key={h} style={{background:"var(--c-input)",color:"var(--c-text2)",padding:"10px 14px",textAlign:"left",fontWeight:600,whiteSpace:"nowrap",borderBottom:"1px solid #E5E7EB"}}>{h}</th>)}
          </tr></thead>
          <tbody>{fil.length===0
            ?<tr><td colSpan={4} style={{textAlign:"center",color:"var(--c-text4)",padding:24}}>提出データがありません</td></tr>
            :fil.map(sub=>{const resolvedName=resolveAlias(sub.staffName,staffAliases);const ds=Object.keys(sub.shifts||{}).sort(),wkDays=ds.filter(d=>sub.shifts[d]&&sub.shifts[d].status==="work");const att=wkDays.reduce((acc,d)=>{const sh=sub.shifts[d];const st=sh.adjustedStart??sh.start,en=sh.adjustedEnd??sh.end;return acc+((st&&en)?shiftBandInfo(sh).attendance:1);},0);const attLabel=`${att}日`;const at=new Date(sub.submittedAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});const rm=t=>Math.floor(new Date(t).getTime()/60000);const hasRealUpdate=sub.isUpdated&&sub.updatedAt&&rm(sub.updatedAt)>rm(sub.submittedAt);
              const staffType=isPremium?((settings.staffAttributes)||{})[resolvedName]:null;const typeLimRaw=staffType?((settings.staffTypeLimits)||{})[staffType]:null;const typeLim={daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0,...(typeLimRaw&&typeof typeLimRaw==="object"?typeLimRaw:{})};let dailyVio=false,weeklyVio=false,biweeklyVio=false,monthlyVio=false,customVio=false;if(isPremium&&staffType&&(typeLim.daily||typeLim.weekly||typeLim.biweekly||typeLim.monthly||typeLim.customDays)){const weekMap={};const monthMap={};ds.forEach(d=>{const sh=sub.shifts[d];const nm=calcNetWorkMinutes(sh,getBreaksFor(settings,d,resolvedName,sh),getOT(resolvedName,settings,sh));if(typeLim.daily&&nm>typeLim.daily*60)dailyVio=true;const dt=pd(d),dow=dt.getDay(),mon=new Date(dt);mon.setDate(dt.getDate()-(dow===0?6:dow-1));weekMap[fd(mon)]=(weekMap[fd(mon)]||0)+nm;monthMap[d.slice(0,7)]=(monthMap[d.slice(0,7)]||0)+nm;});if(typeLim.weekly)Object.values(weekMap).forEach(wm=>{if(wm>typeLim.weekly*60)weeklyVio=true;});if(typeLim.biweekly){const wkKeys=Object.keys(weekMap).sort();for(let i=0;i<wkKeys.length;i+=2){const tot=(weekMap[wkKeys[i]]||0)+(weekMap[wkKeys[i+1]]||0);if(tot>typeLim.biweekly*60)biweeklyVio=true;}}if(typeLim.monthly)Object.values(monthMap).forEach(mm=>{if(mm>typeLim.monthly*60)monthlyVio=true;});if(typeLim.customDays&&typeLim.customHours){const sortedDs=ds.filter(d=>{const sh=sub.shifts[d];return sh&&sh.status==="work";}).sort();for(let i=0;i<sortedDs.length;i++){const start=pd(sortedDs[i]);let tot=0;for(let j=i;j<sortedDs.length;j++){const diffD=(pd(sortedDs[j])-start)/86400000;if(diffD>=typeLim.customDays)break;const sh=sub.shifts[sortedDs[j]];tot+=calcNetWorkMinutes(sh,getBreaksFor(settings,sortedDs[j],resolvedName,sh),getOT(resolvedName,settings,sh));}if(tot>typeLim.customHours*60){customVio=true;break;}}}}const hasVio=dailyVio||weeklyVio||biweeklyVio||monthlyVio||customVio;
              return(<tr key={sub.id} style={hasVio?{background:"rgba(255,71,87,.12)"}:{}}>
              <td style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,0,0,.03)",color:"var(--c-text)",fontWeight:600}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span>{resolvedName}</span>
                  {hasRealUpdate&&<span style={{fontSize:10,background:"rgba(245,158,11,.2)",color:"#F59E0B",border:"1px solid rgba(245,158,11,.3)",padding:"1px 6px",borderRadius:4,fontWeight:700}}>変更あり</span>}
                  {hasVio&&<span style={{fontSize:10,background:"rgba(255,71,87,.15)",color:"#FF4757",border:"1px solid rgba(255,71,87,.3)",padding:"1px 6px",borderRadius:4,fontWeight:700,whiteSpace:"nowrap"}}>{dailyVio?"1日超過":""}{dailyVio&&weeklyVio?" / ":""}{weeklyVio?"週超過":""}</span>}
                  {isPro&&isUnregistered(sub.staffName)&&(
                    linkTarget?.subName===sub.staffName
                      ?<div style={{display:"flex",alignItems:"center",gap:4,marginTop:4,width:"100%"}}>
                        <select defaultValue="" onChange={e=>e.target.value&&registerAlias(sub.staffName,e.target.value)}
                          style={{fontSize:16,padding:"3px 6px",background:"var(--c-input)",border:"1px solid #E5E7EB",borderRadius:6,color:"var(--c-text)",cursor:"pointer"}}>
                          <option value="">スタッフを選択</option>
                          {staffList.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={()=>setLinkTarget(null)} style={{background:"none",border:"none",color:"var(--c-text4)",cursor:"pointer",fontSize:12}}>✕</button>
                      </div>
                      :<button onClick={()=>setLinkTarget({subName:sub.staffName})}
                        style={{fontSize:10,background:"rgba(255,71,87,.08)",color:"#FF4757",border:"1px solid rgba(255,71,87,.25)",padding:"1px 7px",borderRadius:4,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                        未登録 → 別名登録
                      </button>
                  )}
                </div>
              </td>
              <td style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,0,0,.03)",color:"var(--c-text3)",whiteSpace:"nowrap"}}>
                  {at}
                  {hasRealUpdate&&<><br/><span style={{fontSize:10,color:"#F59E0B",fontWeight:700}}>更新: {new Date(sub.updatedAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span></>}
                </td>
              <td style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,0,0,.03)"}}><div><span style={{background:"rgba(248,112,54,.15)",color:"#FFA070",border:"1px solid rgba(248,112,54,.3)",padding:"2px 8px",borderRadius:4,fontSize:12,fontWeight:600}}>{attLabel}</span></div></td>
              <td style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,0,0,.03)",whiteSpace:"nowrap"}}>
                <button onClick={()=>setDet({...sub,staffName:resolvedName})} style={{padding:"5px 10px",background:"var(--c-input)",border:"1px solid #E5E7EB",borderRadius:6,color:"var(--c-text2)",fontSize:12,cursor:"pointer",marginRight:4}}>詳細</button>
                {isPro&&<button onClick={()=>{if(!confirm("削除しますか？"))return;onSave(subs.filter(s=>s.id!==sub.id),sub.id);tt("削除しました");}} style={AD}>削除</button>}
              </td>
            </tr>);})}
          </tbody>
        </table>
      </div>
    </div>
    {det&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"fI .2s"}} onClick={()=>setDet(null)}>
      <div style={{background:"var(--c-card)",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:560,maxHeight:"88vh",overflow:"hidden",display:"flex",flexDirection:"column",animation:"sU .25s"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"var(--c-border2)",borderRadius:2,margin:"10px auto 0"}}/>
        <div style={{padding:"12px 20px 14px",borderBottom:"1px solid var(--c-border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontSize:16,fontWeight:700,color:"var(--c-text)"}}>{det.staffName}</div><div style={{fontSize:12,color:"var(--c-text4)",marginTop:2}}>{gpl(det.periodId)} ／ {new Date(det.submittedAt).toLocaleString("ja-JP")} 提出</div></div>
          <button onClick={()=>setDet(null)} style={{background:"var(--c-input)",border:"none",borderRadius:"50%",width:32,height:32,color:"var(--c-text2)",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{overflowY:"auto",padding:"8px 16px 24px"}}>
          {isPremium&&(()=>{const dDs=Object.keys(det.shifts||{}).sort();const dWorkDs=dDs.filter(d=>det.shifts[d]?.status==="work");const dAtt=dWorkDs.reduce((acc,d)=>{const sh=det.shifts[d];const st=sh.adjustedStart??sh.start,en=sh.adjustedEnd??sh.end;return acc+((st&&en)?shiftBandInfo(sh).attendance:1);},0);const dTot=dDs.reduce((a,d)=>a+calcNetWorkMinutes(det.shifts[d],getBreaksFor(settings,d,det.staffName,det.shifts[d]),getOT(det.staffName,settings,det.shifts[d])),0);const detOTMax=dDs.reduce((mx,d)=>{const s=det.shifts[d];return s&&s.status==="work"?Math.max(mx,getOT(det.staffName,settings,s)):mx;},0);const SB=(l,v,c,bg)=>(<div style={{background:bg,borderRadius:8,padding:"6px 10px",textAlign:"center",border:`1px solid ${c}33`,minWidth:56}}><div style={{fontSize:10,color:"var(--c-text4)",marginBottom:1}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div></div>);return(<div style={{display:"flex",gap:6,flexWrap:"wrap",padding:"8px 0 4px"}}>{SB("出勤",`${dAtt}日`,"#FFA070","rgba(248,112,54,.1)")}{dTot>0&&SB("勤務計",fmtMin(dTot),"var(--c-text2)","var(--c-input)")}{detOTMax>0&&SB("延長",`+${detOTMax}分`,"#34D399","rgba(52,211,153,.1)")}</div>);})()}
          {isPremium&&(()=>{const wP=periods.find(p=>p.id===det.periodId);if(!wP)return null;const wSS=subs.filter(s=>s.staffName===det.staffName||(staffAliases[det.staffName]||[]).includes(s.staffName));const perDs=gd(wP.startDate,wP.endDate);const wkSet=new Set();perDs.forEach(d=>{const dt=pd(d),dow=dt.getDay(),mon=new Date(dt);mon.setDate(dt.getDate()-(dow===0?6:dow-1));wkSet.add(fd(mon));});const weeks=[...wkSet].sort();const mo=wP.startDate.slice(0,7);let moTot=0;wSS.forEach(s=>{Object.keys(s.shifts||{}).forEach(d=>{if(d.startsWith(mo))moTot+=calcNetWorkMinutes(s.shifts[d],getBreaksFor(settings,d,s.staffName,s.shifts[d]),getOT(s.staffName,settings,s.shifts[d]));});});const wkData=weeks.map(monStr=>{let tot=0;for(let i=0;i<7;i++){const dd=new Date(pd(monStr));dd.setDate(pd(monStr).getDate()+i);const ds2=fd(dd);if(det.shifts[ds2]){tot+=calcNetWorkMinutes(det.shifts[ds2],getBreaksFor(settings,ds2,det.staffName,det.shifts[ds2]),getOT(det.staffName,settings,det.shifts[ds2]));}else{const os=wSS.find(s=>s.id!==det.id&&s.shifts&&s.shifts[ds2]);if(os)tot+=calcNetWorkMinutes(os.shifts[ds2],getBreaksFor(settings,ds2,os.staffName,os.shifts[ds2]),getOT(os.staffName,settings,os.shifts[ds2]));}}return{monStr,tot};});return(<div style={{marginBottom:4}}><div style={{fontSize:11,fontWeight:700,color:"var(--c-text3)",margin:"6px 0 5px"}}>週間勤務時間</div><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{wkData.map(({monStr,tot})=>{const m=pd(monStr);const sun=new Date(m);sun.setDate(m.getDate()+6);const lbl=`${m.getMonth()+1}/${m.getDate()}〜${sun.getMonth()+1}/${sun.getDate()}`;return(<div key={monStr} style={{background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,padding:"5px 8px",textAlign:"center",minWidth:76}}><div style={{fontSize:9,color:"var(--c-text4)"}}>{lbl}</div><div style={{fontSize:12,fontWeight:700,color:tot>0?"var(--c-text2)":"var(--c-text4)"}}>{tot>0?fmtMin(tot):"−"}</div></div>);})}{moTot>0&&<div style={{background:"rgba(248,112,54,.08)",border:"1px solid rgba(248,112,54,.2)",borderRadius:8,padding:"5px 8px",textAlign:"center",minWidth:76}}><div style={{fontSize:9,color:"#FFA070"}}>{mo.replace("-","年")}月計</div><div style={{fontSize:12,fontWeight:700,color:"#FFA070"}}>{fmtMin(moTot)}</div></div>}</div></div>);})()}
          {det.comment&&<div style={{background:"var(--c-input)",borderRadius:8,padding:"10px 12px",margin:"8px 0",fontSize:13,color:"var(--c-text2)"}}>{det.comment}</div>}
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr>{["日付","区分","出勤","退勤","時間"].map(h=><th key={h} style={{background:"var(--c-input)",color:"var(--c-text2)",padding:"8px 12px",textAlign:"left",fontWeight:600}}>{h}</th>)}</tr></thead>
            <tbody>{Object.keys(det.shifts||{}).sort().map(ds=>{const d=pd(ds),s=det.shifts[ds],iw=s&&s.status==="work";const detOT2=isPremium&&iw?getOT(det.staffName,settings,s):0;const nm=iw?calcNetWorkMinutes(s,getBreaksFor(settings,ds,det.staffName,s),detOT2):0;const effEnd=isPremium&&iw&&detOT2>0&&(s.adjustedEnd??s.end)?`→${(()=>{const en=s.adjustedEnd??s.end;const[h,m]=en.split(":").map(Number);const tot=h*60+m+detOT2;return`${Math.floor(tot/60)}:${String(tot%60).padStart(2,"0")}`;})()}`:null;return(<tr key={ds}>
              <td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)",color:"var(--c-text2)"}}>{d.getMonth()+1}/{d.getDate()}（{WD[d.getDay()]}）</td>
              <td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)"}}>{iw?<span style={{background:"rgba(248,112,54,.15)",color:"#FFA070",border:"1px solid rgba(248,112,54,.3)",padding:"2px 7px",borderRadius:4,fontSize:12,fontWeight:600}}>出勤</span>:<span style={{background:"var(--c-input)",color:"var(--c-text3)",padding:"2px 7px",borderRadius:4,fontSize:12}}>休み</span>}</td>
              <td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)"}}>
                {iw?<div>{isPremium&&<div style={{color:"var(--c-text4)",fontSize:11}}>{s.start}</div>}{isPremium?<select value={s.adjustedStart||""} onChange={e=>saveAdj(det.id,ds,"adjustedStart",e.target.value||"")} style={{fontSize:16,padding:"3px 5px",background:"var(--c-input)",border:`1px solid ${s.adjustedStart?"#60A5FA":"var(--c-border)"}`,borderRadius:6,color:s.adjustedStart?"#60A5FA":"var(--c-text)",cursor:"pointer",marginTop:2,maxWidth:72}}><option value="">提出値</option>{TO.map(t=><option key={t} value={t}>{t}</option>)}</select>:<span style={{fontSize:13,color:"var(--c-text2)"}}>{s.start||"-"}</span>}</div>:"-"}
              </td>
              <td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)"}}>
                {iw?<div>{isPremium&&<div style={{color:"var(--c-text4)",fontSize:11}}>{s.end}</div>}{isPremium?<><select value={s.adjustedEnd||""} onChange={e=>saveAdj(det.id,ds,"adjustedEnd",e.target.value||"")} style={{fontSize:16,padding:"3px 5px",background:"var(--c-input)",border:`1px solid ${s.adjustedEnd?"#60A5FA":"var(--c-border)"}`,borderRadius:6,color:s.adjustedEnd?"#60A5FA":"var(--c-text)",cursor:"pointer",marginTop:2,maxWidth:72}}><option value="">提出値</option>{TO.map(t=><option key={t} value={t}>{t}</option>)}</select>{effEnd&&<div style={{fontSize:10,color:"#34D399",marginTop:2,fontWeight:600}}>{effEnd}（+{detOT2}分）</div>}</>:<span style={{fontSize:13,color:"var(--c-text2)"}}>{s.end||"-"}</span>}</div>:"-"}
              </td>
              <td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)",color:nm>0?"var(--c-text2)":"var(--c-text3)"}}>{iw&&isPremium?fmtMin(nm):"-"}</td>
            </tr>);})}
            </tbody>
          </table>
          {isPremium&&(()=>{const tot=Object.keys(det.shifts||{}).reduce((acc,ds)=>{const s=det.shifts[ds];return acc+calcNetWorkMinutes(s,getBreaksFor(settings,ds,det.staffName,s),getOT(det.staffName,settings,s));},0);return tot>0?<div style={{textAlign:"right",padding:"6px 12px",fontSize:13,color:"var(--c-text2)",fontWeight:700}}>合計：{fmtMin(tot)}</div>:null;})()}
        </div>
      </div>
    </div>}
  </div>);
}

// ===== 企業連携タブ =====
function CompanyTab({settings,onSave,tt,shopId,staffList=[],authUser,
                     shops=[],allLinkedShops=[],onSwitchToShop,onUnlinkShop,
                     companyInfo=null,onCreateCompany,onChangeCompanyPassword,onRenameCompany,onLinkStoreToCompany,onUnlinkStoreFromCompany}){
  // 企業アカウントUI（SetTabから移動）
  const[coName,setCoName]=useState("");
  const[coPw,setCoPw]=useState("");
  const[coBusy,setCoBusy]=useState(false);
  const[coErr,setCoErr]=useState("");
  const[coCreated,setCoCreated]=useState(null); // 作成直後に表示する {code}
  const[coPwEdit,setCoPwEdit]=useState(false);
  const[coNewPw,setCoNewPw]=useState("");
  const[coAddCode,setCoAddCode]=useState("");
  const[coAddOpen,setCoAddOpen]=useState(false);
  // 店舗一覧トグル・略称・スタッフ勤務先
  const[expanded,setExpanded]=useState({});   // {shopId:true}
  const[shopMeta,setShopMeta]=useState({});   // {shopId:{abbrs:[],staff:[],workplaces:{},loaded:true}}
  const[abbrInput,setAbbrInput]=useState({}); // {shopId:"入力中の略称"}
  const listShops=allLinkedShops.length>0?allLinkedShops:shops;

  const loadShopMeta=(sid)=>{
    if(!firebaseDB)return;
    Promise.all([
      firebaseDB.ref(`shops/${sid}/settings/shopAbbrs`).once("value"),
      firebaseDB.ref(`shops/${sid}/staff`).once("value"),
      firebaseDB.ref(`shops/${sid}/settings/staffWorkplaces`).once("value"),
    ]).then(([aS,stS,wS])=>{
      const abbrs=Object.values(aS.val()||{}).filter(v=>typeof v==="string");
      const staff=Object.values(stS.val()||{}).filter(n=>typeof n==="string"&&!isSpacer(n));
      setShopMeta(m=>({...m,[sid]:{abbrs,staff,workplaces:wS.val()||{},loaded:true}}));
    }).catch(()=>{
      setShopMeta(m=>({...m,[sid]:{abbrs:[],staff:[],workplaces:{},loaded:true}}));
      tt("✕ 店舗データの読み込みに失敗しました");
    });
  };
  const toggleExpand=(sid)=>{
    setExpanded(e=>({...e,[sid]:!e[sid]}));
    if(!shopMeta[sid])loadShopMeta(sid);
  };
  // 表示中店舗はライブなsettingsを使い、他店舗は読み込んだメタを使う
  const metaFor=(sid)=>sid===shopId
    ?{abbrs:settings.shopAbbrs||[],staff:staffList.filter(n=>!isSpacer(n)),workplaces:settings.staffWorkplaces||{},loaded:true}
    :(shopMeta[sid]||null);
  // 略称・勤務先の保存: 表示中店舗はsaveSettings経由（localStorage二重書き維持）、他店舗はFirebaseへupdateマージ
  const saveMetaField=(sid,field,value)=>{
    const stateKey=field==="shopAbbrs"?"abbrs":"workplaces";
    if(sid===shopId){onSave({...settings,[field]:value});setShopMeta(m=>m[sid]?{...m,[sid]:{...m[sid],[stateKey]:value}}:m);return;}
    setShopMeta(m=>({...m,[sid]:{...(m[sid]||{abbrs:[],staff:[],workplaces:{},loaded:true}),[stateKey]:value}}));
    if(!firebaseDB)return;
    firebaseDB.ref(`shops/${sid}/settings`).update({[field]:value})
      .catch(()=>{tt("✕ 保存できませんでした（この店舗の管理者権限がありません）");loadShopMeta(sid);});
  };
  const addAbbr=(sid)=>{
    const v=(abbrInput[sid]||"").trim();
    if(!v)return;
    if(v.length>4){tt("✕ 略称は4文字以内にしてください");return;}
    if(/^[hkxHKX]$/.test(v)||/^[\d.:]+$/.test(v)){tt("✕ h・k・x・数字のみの略称は使用できません");return;}
    const cur=(metaFor(sid)||{}).abbrs||[];
    if(cur.includes(v)){tt("✕ 既に登録済みの略称です");return;}
    const conflict=listShops.find(s=>s.id!==sid&&((metaFor(s.id)||{}).abbrs||[]).includes(v));
    if(conflict){tt(`✕ 「${v}」は「${conflict.name}」で使用中です`);return;}
    saveMetaField(sid,"shopAbbrs",[...cur,v]);
    setAbbrInput(i=>({...i,[sid]:""}));
  };
  const removeAbbr=(sid,abbr)=>{
    const cur=(metaFor(sid)||{}).abbrs||[];
    saveMetaField(sid,"shopAbbrs",cur.filter(a=>a!==abbr));
  };
  const toggleWorkplace=(sid,staffName,targetShopId)=>{
    const meta=metaFor(sid);if(!meta)return;
    const wp={...(meta.workplaces||{})};
    const cur={...(wp[staffName]||{})};
    if(cur[targetShopId])delete cur[targetShopId];else cur[targetShopId]=true;
    if(Object.keys(cur).length)wp[staffName]=cur;else delete wp[staffName];
    saveMetaField(sid,"staffWorkplaces",wp);
  };

  const shopCard=(shop)=>{
    const isCurrent=shop.id===shopId;
    const open=!!expanded[shop.id];
    const meta=metaFor(shop.id);
    const canUnlink=listShops.length>1;
    const others=listShops.filter(s=>s.id!==shop.id);
    return(
      <div key={shop.id} style={{background:"var(--c-input)",borderRadius:10,border:`1px solid ${isCurrent?"rgba(248,112,54,.4)":"var(--c-border2)"}`,marginBottom:8,overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",cursor:"pointer"}} onClick={()=>toggleExpand(shop.id)}>
          <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
            <span style={{fontSize:11,color:"var(--c-text3)",transform:open?"rotate(90deg)":"none",transition:"transform .15s",flexShrink:0}}>▶</span>
            {isCurrent&&<span style={{fontSize:10,background:"#f87036",color:"white",padding:"2px 6px",borderRadius:4,fontWeight:700,flexShrink:0}}>表示中</span>}
            <span style={{fontSize:13,color:"var(--c-text)",fontWeight:isCurrent?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shop.name}</span>
            {meta&&meta.abbrs.length>0&&<span style={{fontSize:11,color:"var(--c-text3)",flexShrink:0}}>（{meta.abbrs.join("・")}）</span>}
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}} onClick={e=>e.stopPropagation()}>
            {!isCurrent&&onSwitchToShop&&(
              <button onClick={()=>{onSwitchToShop(shop.id);tt(`✓ 「${shop.name}」に切り替えました`);}}
                style={{padding:"5px 10px",background:"rgba(248,112,54,.1)",border:"1px solid rgba(248,112,54,.3)",borderRadius:8,color:"#f87036",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                ログイン
              </button>
            )}
            {canUnlink&&<button onClick={async()=>{
              if(!window.confirm(`「${shop.name}」の連携を解除しますか？`))return;
              if(companyInfo&&onUnlinkStoreFromCompany){const r=await onUnlinkStoreFromCompany(shop.id);tt(r&&r.error?("✕ "+r.error):`✓ 「${shop.name}」の連携を解除しました`);}
              else if(onUnlinkShop)onUnlinkShop(shop.id);
            }}
              style={{padding:"5px 10px",background:"var(--c-bg)",border:"1px solid var(--c-border)",borderRadius:8,color:"var(--c-text3)",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              解除
            </button>}
          </div>
        </div>
        {open&&(
          <div style={{borderTop:"1px solid var(--c-border2)",padding:"12px"}}>
            {!meta?<div style={{fontSize:12,color:"var(--c-text3)"}}>⏳ 読み込み中...</div>:(<>
              {/* 店舗略称 */}
              <AL>店舗略称（シフト作成タブでヘルプ入力に使用・複数登録可）</AL>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                {meta.abbrs.map(a=>(
                  <span key={a} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 8px",background:"rgba(96,165,250,.12)",border:"1px solid rgba(96,165,250,.4)",borderRadius:8,fontSize:13,fontWeight:600,color:"var(--c-text)"}}>
                    {a}
                    <button onClick={()=>removeAbbr(shop.id,a)} style={{background:"none",border:"none",color:"var(--c-text3)",cursor:"pointer",fontSize:12,padding:0,lineHeight:1}}>✕</button>
                  </span>
                ))}
                {meta.abbrs.length===0&&<span style={{fontSize:12,color:"var(--c-text4)"}}>未登録</span>}
              </div>
              <div style={{display:"flex",gap:6,marginBottom:14}}>
                <input value={abbrInput[shop.id]||""} onChange={e=>setAbbrInput(i=>({...i,[shop.id]:e.target.value}))}
                  onKeyDown={e=>{if(e.key==="Enter")addAbbr(shop.id);}}
                  placeholder="例：三（4文字以内）" maxLength={4}
                  style={{...AI,flex:1,maxWidth:200}}/>
                <button onClick={()=>addAbbr(shop.id)} style={{...AB,padding:"8px 14px",fontSize:13,whiteSpace:"nowrap"}}>追加</button>
              </div>
              {/* スタッフ一覧と勤務先登録 */}
              <AL>スタッフの勤務先店舗（複数店舗で働くスタッフに登録すると、シフト重複を自動チェックします）</AL>
              {meta.staff.length===0&&<div style={{fontSize:12,color:"var(--c-text4)"}}>スタッフが登録されていません</div>}
              {meta.staff.map(nm=>{
                const wps=(meta.workplaces||{})[nm]||{};
                return(
                  <div key={nm} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--c-border)",flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:600,color:"var(--c-text)",minWidth:80}}>{nm}</span>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",flex:1}}>
                      {others.length===0&&<span style={{fontSize:11,color:"var(--c-text4)"}}>他に連携店舗がありません</span>}
                      {others.map(os=>{
                        const sel=!!wps[os.id];
                        return(<button key={os.id} onClick={()=>toggleWorkplace(shop.id,nm,os.id)}
                          style={{padding:"4px 10px",borderRadius:14,border:`1px solid ${sel?"#f87036":"var(--c-border2)"}`,
                            background:sel?"rgba(248,112,54,.12)":"var(--c-bg)",color:sel?"#f87036":"var(--c-text3)",
                            fontSize:12,fontWeight:sel?700:400,cursor:"pointer",whiteSpace:"nowrap"}}>
                          {sel?"✓ ":""}{os.name}
                        </button>);
                      })}
                    </div>
                  </div>
                );
              })}
            </>)}
          </div>
        )}
      </div>
    );
  };

  return(<div>
    <AT>企業連携</AT>
    {!authUser?(
      <AC title="企業連携を利用するには">
        <div style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.7}}>
          企業連携を利用するには、まず「設定」タブの<b>アカウント連携</b>からGoogleまたはメールアドレスでアカウントを登録してください。
        </div>
      </AC>
    ):(<>
    <AC title="企業アカウント">
      {companyInfo?(
        <div>
          <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12,lineHeight:1.6}}>
            企業名・企業コード・パスワードを管理します。企業コードとパスワードを共有すると、他のスタッフが同じ企業アカウントにログインできます。
          </div>
          {/* 企業名（編集可） */}
          <AL>企業名</AL>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <input value={coName!==""?coName:companyInfo.name} onChange={e=>setCoName(e.target.value)} maxLength={100} style={{...AI,flex:1}}/>
            <button disabled={coBusy} onClick={async()=>{
              const nm=(coName!==""?coName:companyInfo.name).trim(); if(!nm||!onRenameCompany)return;
              setCoBusy(true); const r=await onRenameCompany(nm); setCoBusy(false);
              if(r&&r.error)tt("✕ "+r.error); else {tt("✓ 企業名を変更しました");setCoName("");}
            }} style={{...AGray,whiteSpace:"nowrap"}}>保存</button>
          </div>
          {/* 企業コード（コピー） */}
          <AL>企業コード（ログインID）</AL>
          <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:10,padding:"10px 14px",marginBottom:12}}>
            <span style={{flex:1,fontFamily:"monospace",fontSize:15,color:"#f87036",letterSpacing:"0.1em",fontWeight:700}}>{companyInfo.code}</span>
            <button onClick={()=>{
              const v=companyInfo.code;const copy=()=>{const el=document.createElement("textarea");el.value=v;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);tt("✓ 企業コードをコピーしました");};
              if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(v).then(()=>tt("✓ 企業コードをコピーしました")).catch(copy);}else copy();
            }} style={{padding:"6px 12px",background:"#f87036",border:"none",borderRadius:8,color:"white",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>📋 コピー</button>
          </div>
          {/* パスワード変更 */}
          {coPwEdit?(
            <div style={{marginBottom:4}}>
              <AL>新しいパスワード（6文字以上）</AL>
              <div style={{display:"flex",gap:8}}>
                <input type="password" value={coNewPw} onChange={e=>setCoNewPw(e.target.value)} maxLength={128} placeholder="新しいパスワード" style={{...AI,flex:1}}/>
                <button disabled={coBusy} onClick={async()=>{
                  if(coNewPw.length<6){tt("✕ パスワードは6文字以上にしてください");return;}
                  setCoBusy(true); const r=await onChangeCompanyPassword(coNewPw); setCoBusy(false);
                  if(r&&r.error)tt("✕ "+r.error); else {tt("✓ パスワードを変更しました");setCoNewPw("");setCoPwEdit(false);}
                }} style={{...AB,whiteSpace:"nowrap"}}>変更</button>
                <button onClick={()=>{setCoPwEdit(false);setCoNewPw("");}} style={{...AGray,whiteSpace:"nowrap"}}>取消</button>
              </div>
            </div>
          ):(
            <button onClick={()=>setCoPwEdit(true)} style={{...AGray,width:"100%"}}>パスワードを変更する</button>
          )}
        </div>
      ):(
        authUser.isAnonymous?(
          <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.6}}>企業アカウントの作成にはメールまたはGoogleでのログインが必要です。「設定」タブのアカウント連携から登録してください。</div>
        ):(
          <div>
            <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12,lineHeight:1.6}}>
              企業アカウントを作成すると、現在の店舗をまとめて管理でき、企業コード＋パスワードで他のスタッフもログインできます。
            </div>
            <AL>企業名</AL>
            <input value={coName} onChange={e=>setCoName(e.target.value)} maxLength={100} placeholder="例）〇〇フーズ" style={{...AI,marginBottom:10}}/>
            <AL>ログイン用パスワード（6文字以上）</AL>
            <input type="password" value={coPw} onChange={e=>setCoPw(e.target.value)} maxLength={128} placeholder="パスワード" style={{...AI,marginBottom:10}}/>
            {coErr&&<div style={{color:"#FF4757",fontSize:12,marginBottom:8}}>{coErr}</div>}
            {coCreated?(
              <div style={{background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.3)",borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:12,color:"var(--c-text2)",marginBottom:6}}>企業アカウントを作成しました。企業コード：</div>
                <div style={{fontFamily:"monospace",fontSize:16,color:"#22C55E",fontWeight:700,letterSpacing:"0.1em"}}>{coCreated.code}</div>
              </div>
            ):(
              <button disabled={coBusy} onClick={async()=>{
                setCoErr("");
                if(!coName.trim()){setCoErr("企業名を入力してください");return;}
                if(coPw.length<6){setCoErr("パスワードは6文字以上にしてください");return;}
                setCoBusy(true); const r=await onCreateCompany(coName.trim(),coPw); setCoBusy(false);
                if(r&&r.error)setCoErr(r.error); else {setCoCreated({code:r.code});setCoName("");setCoPw("");tt("✓ 企業アカウントを作成しました");}
              }} style={{...AB,width:"100%"}}>{coBusy?"作成中...":"企業アカウントを作成する"}</button>
            )}
          </div>
        )
      )}
    </AC>
    {listShops.length>0&&<AC title="連携店舗">
      <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12,lineHeight:1.6}}>
        {companyInfo?"この企業アカウントに紐付いている店舗の一覧です。店舗コードで追加・不要な店舗は連携解除できます。":"このアカウントに紐付いている全店舗の一覧です。不要な店舗は連携を解除できます。"}
        店舗名をタップすると略称・スタッフの勤務先を設定できます。
      </div>
      {companyInfo&&(
        coAddOpen?(
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <input value={coAddCode} onChange={e=>setCoAddCode(e.target.value)} maxLength={100} placeholder="店舗コードを貼り付け" style={{...AI,flex:1}}/>
            <button disabled={coBusy} onClick={async()=>{
              if(!coAddCode.trim()||!onLinkStoreToCompany)return;
              setCoBusy(true); const r=await onLinkStoreToCompany(coAddCode.trim()); setCoBusy(false);
              if(r&&r.error)tt("✕ "+r.error); else {tt(`✓ 「${r.name||"店舗"}」を追加しました`);setCoAddCode("");setCoAddOpen(false);}
            }} style={{...AB,whiteSpace:"nowrap"}}>追加</button>
            <button onClick={()=>{setCoAddOpen(false);setCoAddCode("");}} style={{...AGray,whiteSpace:"nowrap"}}>取消</button>
          </div>
        ):(
          <button onClick={()=>setCoAddOpen(true)} style={{width:"100%",padding:"10px",background:"rgba(248,112,54,.12)",border:"1px solid rgba(248,112,54,.3)",borderRadius:8,color:"#f87036",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>＋ 店舗コードで追加</button>
        )
      )}
      <div>{listShops.map(shopCard)}</div>
    </AC>}
    <AC title="シフト作成タブでのヘルプ入力">
      <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.8}}>
        店舗略称を登録すると、シフト作成タブのセルで「時間＋略称」（例: <b>9三</b>）と入力することで他店舗ヘルプとして扱われます。<br/>
        ・<b>出勤セルのみ</b>に略称 → その店舗のランチ帯（〜17時）のみヘルプ<br/>
        ・<b>退勤セルのみ</b>に略称 → その店舗のディナー帯（17時〜）のみヘルプ<br/>
        ・<b>両方のセル</b>に略称 → 出勤から退勤まで終日ヘルプ<br/>
        ヘルプ帯は自店舗の時間帯別出勤人数から除外されます。勤務先店舗を登録したスタッフは、他店舗と時間が重複するとシフト作成タブにエラーが表示されます。
      </div>
    </AC>
    </>)}
  </div>);
}

function SetTab({settings,onSave,subs,saveSubs,tt,syncStatus,plan="free",shopId,staffList=[],
                 authUser,onLinkProvider,onSendEmailOtp,onVerifyAndLinkEmail,onUnlinkProvider,
                 onSignInAndLinkGoogle,onSignInAndLinkEmail,adminCode=null,ownerReadOnly=false}){
  const[themePref,setThemePref]=useState(()=>lg(THEME_KEY,"light"));
  const[emailLinkStep,setEmailLinkStep]=useState(0); // 0=非表示 1=メール入力 2=コード入力
  const[emailInput,setEmailInput]=useState("");
  const[codeInput,setCodeInput]=useState("");
  const[pendingNewType,setPendingNewType]=useState(null); // null | {name:""}
  const[linkLoading,setLinkLoading]=useState(false);
  const[linkError,setLinkError]=useState("");
  // Cookie認証ユーザー向けアカウント登録/連携
  const[acctEmailMode,setAcctEmailMode]=useState(null); // null | "login" | "register"
  const[acctEmail,setAcctEmail]=useState("");
  const[acctPw,setAcctPw]=useState("");
  const[acctPw2,setAcctPw2]=useState("");
  const[acctLoading,setAcctLoading]=useState(false);
  const[acctError,setAcctError]=useState("");
  const changeTheme=pref=>{
    ls(THEME_KEY,pref);
    setThemePref(pref);
    applyTheme(pref);
    tt(pref==="light"?"☀️ ライトモード":(pref==="dark"?"ダークモード":"↺ システム設定に合わせる"));
  };
  const linkedIds=(authUser?.providerData||[]).map(p=>p.providerId);
  const handleLinkProvider=async(type)=>{
    setLinkLoading(true);setLinkError("");
    const r=await onLinkProvider(type);
    setLinkLoading(false);
    if(r?.error)setLinkError(r.error);
    else if(!r?.error&&r?.error!==undefined){}
    else tt("✓ 連携しました");
  };
  const handleSendOtp=async()=>{
    if(!emailInput.trim()){setLinkError("メールアドレスを入力してください");return;}
    setLinkLoading(true);setLinkError("");
    const r=await onSendEmailOtp(emailInput.trim());
    setLinkLoading(false);
    if(r?.error){setLinkError(r.error);}
    else{setEmailLinkStep(2);}
  };
  const handleVerifyOtp=async()=>{
    if(!codeInput.trim()){setLinkError("確認コードを入力してください");return;}
    setLinkLoading(true);setLinkError("");
    const r=await onVerifyAndLinkEmail(codeInput.trim(),emailInput.trim());
    setLinkLoading(false);
    if(r?.error){setLinkError(r.error);}
    else{setEmailLinkStep(0);setEmailInput("");setCodeInput("");tt("✓ メールアドレスを連携しました");}
  };
  const handleUnlink=async(pid)=>{
    setLinkLoading(true);setLinkError("");
    const r=await onUnlinkProvider(pid);
    setLinkLoading(false);
    if(r?.error)setLinkError(r.error);
    else tt("✓ 連携を解除しました");
  };

  const providerRow=(pid,icon,label)=>{
    const linked=linkedIds.includes(pid);
    const info=linked?(authUser.providerData.find(p=>p.providerId===pid)?.email||""):null;
    const isEmail=pid==="password";
    const canUnlink=linkedIds.length>1;
    return(
      <div key={pid} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:"1px solid var(--c-border2)"}}>
        <div style={{width:32,height:32,borderRadius:8,background:"var(--c-input)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:600,color:"var(--c-text)"}}>{label}</div>
          {linked&&info&&<div style={{fontSize:11,color:"var(--c-text3)",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{info}</div>}
        </div>
        {linked
          ?<span style={{fontSize:11,fontWeight:600,color:"#22C55E",background:"rgba(34,197,94,.12)",padding:"3px 10px",borderRadius:20,whiteSpace:"nowrap",flexShrink:0}}>連携済み</span>
          :<span style={{fontSize:11,color:"var(--c-text4)",flexShrink:0}}>未連携</span>
        }
        {linked&&canUnlink&&(
          <button disabled={linkLoading} onClick={()=>handleUnlink(pid)}
            style={{...AD,fontSize:11,padding:"5px 10px",flexShrink:0,opacity:linkLoading?.5:1}}>解除</button>
        )}
        {!linked&&!isEmail&&(
          <button disabled={linkLoading} onClick={()=>handleLinkProvider(pid==="google.com"?"google":"apple")}
            style={{...AB,fontSize:12,padding:"7px 14px",flexShrink:0,opacity:linkLoading?.5:1}}>連携する</button>
        )}
        {!linked&&isEmail&&emailLinkStep===0&&(
          <button disabled={linkLoading} onClick={()=>{setEmailLinkStep(1);setLinkError("");}}
            style={{...AB,fontSize:12,padding:"7px 14px",flexShrink:0}}>連携する</button>
        )}
      </div>
    );
  };

  return(<div>
    <AT>システム設定</AT>
    {shopId&&<AC title="この端末の管理コード">
      {ownerReadOnly?(
        <div style={{fontSize:12,color:"#B45309",lineHeight:1.6}}>この端末は管理者登録されていないため、正しい管理コードを表示できません。既に管理者登録済みの端末（設定変更ができる端末）でこのコードを確認してください。</div>
      ):(<>
      <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,lineHeight:1.6}}>このコードを別の端末で入力すると、同じ店舗を管理者として操作できるようになります。<b>スタッフには共有しないでください。</b></div>
      <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:10,padding:"10px 14px"}}>
        <span style={{flex:1,fontFamily:"monospace",fontSize:13,color:"var(--c-text)",letterSpacing:"0.05em",wordBreak:"break-all"}}>{adminCode||shopId}</span>
        <button onClick={()=>{
          const codeVal=adminCode||shopId;
          const copy=()=>{const el=document.createElement("textarea");el.value=codeVal;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);tt("✓ 管理コードをコピーしました");};
          if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(codeVal).then(()=>tt("✓ 管理コードをコピーしました")).catch(copy);}else{copy();}
        }} style={{padding:"6px 12px",background:"#f87036",border:"none",borderRadius:8,color:"white",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>コピー</button>
      </div>
      <div style={{fontSize:11,color:"var(--c-text4)",marginTop:6}}>別端末への共有は「店舗名ボタン → コードで追加」から行えます</div>
      </>)}
    </AC>}

    {plan==="premium"&&(()=>{
      const tls=settings.staffTypeLimits||{};
      const saveAllLimits=(newTls)=>onSave({...settings,staffTypeLimits:newTls});
      const saveLim=(type,key,val)=>saveAllLimits({...tls,[type]:{...tls[type],[key]:val}});
      const confirmAddType=()=>{if(!pendingNewType)return;const nm=pendingNewType.name.trim();if(!nm){setPendingNewType(null);return;}const id="custom_"+genSecureId(8);saveAllLimits({...tls,[id]:{name:nm,daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0}});setPendingNewType(null);};
      const deleteType=(id)=>{const n={...tls};delete n[id];const attrs={...(settings.staffAttributes||{})};Object.keys(attrs).forEach(k=>{if(attrs[k]===id)delete attrs[k];});onSave({...settings,staffTypeLimits:n,staffAttributes:attrs});};
      const renameType=(id,name)=>saveAllLimits({...tls,[id]:{...tls[id],name}});
      // builtinで未登録のものはデフォルト値で補完（社員・バイトのみ）
      const DEFAULT_TYPES=["employee","parttime"];
      const tlsMerged={...tls};DEFAULT_TYPES.forEach(k=>{if(!tlsMerged[k])tlsMerged[k]={name:STAFF_TYPE_LABELS[k],daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0};});
      const typeEntries=Object.entries(tlsMerged);
      return(<AC title="スタッフ属性別 勤務時間制限">
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>0は無制限。制限を超えたスタッフは提出一覧で赤くハイライトされます。</div>
        {typeEntries.map(([type,limRaw])=>{
          const lim={daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0,...(typeof limRaw==="object"?limRaw:{name:limRaw})};
          const isBuiltin=BUILTIN_TYPES.includes(type);
          const displayName=lim.name||STAFF_TYPE_LABELS[type]||type;
          return(<div key={type} style={{marginBottom:8,padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              {isBuiltin
                ?<div style={{fontSize:13,fontWeight:700,color:"var(--c-text)",flex:1}}>{displayName}</div>
                :<input value={lim.name||""} placeholder="属性名を入力" onChange={e=>renameType(type,e.target.value)}
                    style={{...AI,flex:1,fontSize:13,fontWeight:700,padding:"4px 8px"}}/>
              }
              {!isBuiltin&&<button onClick={()=>deleteType(type)} style={{padding:"4px 10px",background:"rgba(229,57,53,.1)",border:"1px solid rgba(229,57,53,.3)",borderRadius:6,color:"#e53935",fontSize:12,cursor:"pointer"}}>削除</button>}
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {[["daily","1日",24],["weekly","週",168],["biweekly","2週間",336],["monthly","1ヶ月",744]].map(([key,lbl,mx])=>(
                <div key={key} style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:11,color:"var(--c-text3)",whiteSpace:"nowrap"}}>{lbl}</span>
                  <input type="number" min={0} max={mx} value={lim[key]||""} placeholder="0"
                    onChange={e=>{const v=Math.max(0,Math.min(mx,parseInt(e.target.value)||0));saveLim(type,key,v);}}
                    style={{...AI,width:52,textAlign:"center",padding:"5px 6px"}}/>
                  <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span>
                </div>
              ))}
              <div style={{display:"flex",alignItems:"center",gap:4,paddingLeft:4,borderLeft:"1px solid var(--c-border)"}}>
                <span style={{fontSize:11,color:"var(--c-text3)",whiteSpace:"nowrap"}}>任意</span>
                <input type="number" min={0} max={365} value={lim.customDays||""} placeholder="日数"
                  onChange={e=>{const v=Math.max(0,Math.min(365,parseInt(e.target.value)||0));saveLim(type,"customDays",v);}}
                  style={{...AI,width:52,textAlign:"center",padding:"5px 6px"}}/>
                <span style={{fontSize:11,color:"var(--c-text4)"}}>日で</span>
                <input type="number" min={0} max={744} value={lim.customHours||""} placeholder="時間"
                  onChange={e=>{const v=Math.max(0,Math.min(744,parseInt(e.target.value)||0));saveLim(type,"customHours",v);}}
                  style={{...AI,width:52,textAlign:"center",padding:"5px 6px"}}/>
                <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span>
              </div>
            </div>
          </div>);
        })}
        {pendingNewType&&<div style={{marginBottom:8,padding:"10px 12px",background:"var(--c-input)",border:"1px solid #f87036",borderRadius:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <input autoFocus value={pendingNewType.name} placeholder="属性名を入力"
              onChange={e=>setPendingNewType({name:e.target.value})}
              onKeyDown={e=>{if(e.key==="Enter")confirmAddType();if(e.key==="Escape")setPendingNewType(null);}}
              style={{...AI,flex:1,fontSize:13,fontWeight:700,padding:"4px 8px"}}/>
            <button onClick={confirmAddType} style={{padding:"4px 10px",background:"rgba(248,112,54,.15)",border:"1px solid #f87036",borderRadius:6,color:"#f87036",fontSize:12,cursor:"pointer"}}>追加</button>
            <button onClick={()=>setPendingNewType(null)} style={{padding:"4px 10px",background:"transparent",border:"1px solid var(--c-border)",borderRadius:6,color:"var(--c-text3)",fontSize:12,cursor:"pointer"}}>ｷｬﾝｾﾙ</button>
          </div>
          <div style={{fontSize:11,color:"var(--c-text4)"}}>保存後に制限値を設定できます</div>
        </div>}
        {!pendingNewType&&<button onClick={()=>setPendingNewType({name:""})} style={{width:"100%",padding:"8px",background:"transparent",border:"1px dashed var(--c-border2)",borderRadius:8,color:"var(--c-text3)",fontSize:12,cursor:"pointer",marginTop:4}}>＋ 属性を追加</button>}
      </AC>);
    })()}

    {plan==="premium"&&staffList.filter(n=>!isSpacer(n)).length>0&&<AC title="退勤延長設定">
      <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>スタッフごとにシフト終了後の延長時間を設定します。ランチ帯（退勤17:00以前）とディナー帯（退勤17:00超）で個別に設定できます。勤務時間合計に加算され、提出一覧の退勤欄に表示されます。</div>
      {/* 行がカード幅を超える場合（携帯・タブレット）はカード内で横スクロールしてスタッフ名を確認できる */}
      <div style={{overflowX:"auto"}}>
      <div style={{minWidth:"max-content"}}>
      {staffList.filter(n=>!isSpacer(n)).map(n=>{
        const raw=(settings.overtimeSettings?.byStaff||{})[n];
        const ot=typeof raw==="number"?{lunch:raw,dinner:raw}:(raw||{lunch:0,dinner:0});
        const setOT=(band,v)=>{const bs={...(settings.overtimeSettings?.byStaff||{})};const prevRaw=bs[n];const prev=typeof prevRaw==="number"?{lunch:prevRaw,dinner:prevRaw}:(prevRaw||{lunch:0,dinner:0});const next={...prev,[band]:v};if((next.lunch||0)>0||(next.dinner||0)>0)bs[n]={lunch:next.lunch||0,dinner:next.dinner||0};else delete bs[n];onSave({...settings,overtimeSettings:{...(settings.overtimeSettings||{}),byStaff:bs}});};
        const selStyle={fontSize:16,padding:"5px 8px",background:"var(--c-card)",border:"1px solid var(--c-border2)",borderRadius:6,color:"var(--c-text)",cursor:"pointer"};
        return(<div key={n} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,marginBottom:6}}>
          <span style={{flex:1,fontSize:13,color:"var(--c-text)",fontWeight:600,whiteSpace:"nowrap"}}>{n}</span>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:11,color:"var(--c-text3)"}}>ランチ</span>
            <select value={ot.lunch||0} onChange={e=>setOT("lunch",parseInt(e.target.value)||0)} style={selStyle}>
              <option value={0}>延長なし</option>{[15,30,45,60,90,120].map(m=><option key={m} value={m}>+{m}分</option>)}
            </select>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:11,color:"var(--c-text3)"}}>ディナー</span>
            <select value={ot.dinner||0} onChange={e=>setOT("dinner",parseInt(e.target.value)||0)} style={selStyle}>
              <option value={0}>延長なし</option>{[15,30,45,60,90,120].map(m=><option key={m} value={m}>+{m}分</option>)}
            </select>
          </div>
        </div>);
      })}
      </div>
      </div>
    </AC>}

    {(plan==="pro"||plan==="premium")&&<AC title="Excel書き出し設定">
      <AL>書き出し時の店舗名（空欄 = 登録名をそのまま使用）</AL>
      <div style={{display:"flex",gap:8,marginBottom:4}}>
        <input value={settings.xlShopName||""} onChange={e=>onSave({...settings,xlShopName:e.target.value})} placeholder="例：〇〇カフェ 渋谷店" maxLength={100} style={{...AI,flex:1}}/>
        {(settings.xlShopName||"")&&<button onClick={()=>onSave({...settings,xlShopName:""})} style={{...AGray,padding:"10px 12px",fontSize:12}}>クリア</button>}
      </div>
      <div style={{fontSize:11,color:"var(--c-text4)",marginTop:4}}>設定した名前はExcel出力時のファイル名・シート内店舗名に反映されます</div>
    </AC>}

    {(plan==="pro"||plan==="premium")&&<AC title="期間の単位（プリセット）">
      <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10}}>期間を新規作成するときのプリセット選択肢を切り替えます。</div>
      <div style={{display:"flex",gap:8}}>
        {[["2week","2週間（前半／後半）"],["1month","️ 1ヶ月"]].map(([val,label])=>{
          const sel=(settings.periodUnit||"2week")===val;
          return(<button key={val} onClick={()=>onSave({...settings,periodUnit:val})}
            style={{flex:1,padding:"10px 8px",borderRadius:10,border:`2px solid ${sel?"#f87036":"var(--c-border)"}`,
              background:sel?"rgba(248,112,54,.1)":"var(--c-input)",color:sel?"#f87036":"var(--c-text2)",
              fontSize:13,fontWeight:sel?700:500,cursor:"pointer"}}>
            {label}
          </button>);
        })}
      </div>
    </AC>}

    <AC title="テーマ設定">
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[["auto","↺ 自動（システム設定）",null],["light","☀️ ライト","light"],["dark","ダーク","dark"]].map(([key,label,val])=>{
          const sel=themePref===val;
          return(<button key={key} onClick={()=>changeTheme(val)}
            style={{flex:1,padding:"10px 8px",borderRadius:10,border:`2px solid ${sel?"#f87036":"var(--c-border)"}`,
              background:sel?"rgba(248,112,54,.1)":"var(--c-input)",color:sel?"#f87036":"var(--c-text2)",
              fontSize:13,fontWeight:sel?700:500,cursor:"pointer",whiteSpace:"nowrap"}}>
            {label}
          </button>);
        })}
      </div>
    </AC>

    {!authUser&&shopId&&<AC title="アカウント連携">
      <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:14,lineHeight:1.6}}>
        アカウントを登録すると、端末やブラウザが変わっても同じ店舗にアクセスできます。
      </div>
      {acctLoading
        ?<div style={{textAlign:"center",color:"var(--c-text3)",padding:"12px 0",fontSize:14}}>⏳ 認証中...</div>
        :acctEmailMode
          ?<div>
            <div style={{display:"flex",alignItems:"center",marginBottom:14}}>
              <button onClick={()=>{setAcctEmailMode(null);setAcctError("");setAcctEmail("");setAcctPw("");setAcctPw2("");}}
                style={{background:"none",border:"none",color:"var(--c-text3)",fontSize:13,cursor:"pointer",padding:"0 8px 0 0"}}>← 戻る</button>
              <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)"}}>{acctEmailMode==="login"?"メールでログイン":"新規アカウント登録"}</div>
            </div>
            <input type="email" value={acctEmail} onChange={e=>setAcctEmail(e.target.value)}
              placeholder="メールアドレス" maxLength={254}
              style={{width:"100%",padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:10,color:"var(--c-text)",fontSize:16,outline:"none",marginBottom:8,boxSizing:"border-box"}}/>
            <input type="password" value={acctPw} onChange={e=>setAcctPw(e.target.value)}
              onKeyDown={async e=>{if(e.key==="Enter"&&acctEmailMode==="login"){setAcctLoading(true);setAcctError("");const r=await onSignInAndLinkEmail(acctEmail,acctPw,false);setAcctLoading(false);if(r?.error)setAcctError(r.error);else{setAcctEmailMode(null);tt("✓ アカウントを連携しました");}}}}
              placeholder="パスワード（6文字以上）" maxLength={128}
              style={{width:"100%",padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:10,color:"var(--c-text)",fontSize:16,outline:"none",marginBottom:acctEmailMode==="register"?8:12,boxSizing:"border-box"}}/>
            {acctEmailMode==="register"&&<input type="password" value={acctPw2} onChange={e=>setAcctPw2(e.target.value)}
              placeholder="パスワード（確認）" maxLength={128}
              style={{width:"100%",padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:10,color:"var(--c-text)",fontSize:16,outline:"none",marginBottom:12,boxSizing:"border-box"}}/>}
            {acctError&&<div style={{fontSize:12,color:"#EF4444",marginBottom:10,background:"rgba(239,68,68,.08)",padding:"8px 10px",borderRadius:8}}>{acctError}</div>}
            <button disabled={acctLoading} onClick={async()=>{
              if(acctEmailMode==="register"&&acctPw!==acctPw2){setAcctError("パスワードが一致しません");return;}
              setAcctLoading(true);setAcctError("");
              const r=await onSignInAndLinkEmail(acctEmail,acctPw,acctEmailMode==="register");
              setAcctLoading(false);
              if(r?.error)setAcctError(r.error);
              else{setAcctEmailMode(null);tt("✓ アカウントを連携しました");}
            }} style={{width:"100%",padding:"11px",background:"#f87036",border:"none",borderRadius:10,color:"white",fontSize:14,fontWeight:700,cursor:"pointer",marginBottom:8,opacity:acctLoading?.5:1}}>
              {acctEmailMode==="login"?"ログイン":"アカウント作成"}
            </button>
            {acctEmailMode==="login"
              ?<div style={{textAlign:"center",fontSize:12,color:"var(--c-text4)"}}>アカウントがない場合は<button onClick={()=>{setAcctEmailMode("register");setAcctError("");}} style={{background:"none",border:"none",color:"#f87036",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>新規登録</button></div>
              :<div style={{textAlign:"center",fontSize:12,color:"var(--c-text4)"}}>既にアカウントがある場合は<button onClick={()=>{setAcctEmailMode("login");setAcctError("");}} style={{background:"none",border:"none",color:"#f87036",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>ログイン</button></div>
            }
          </div>
          :<div style={{display:"flex",flexDirection:"column",gap:8}}>
            <button onClick={async()=>{setAcctLoading(true);setAcctError("");const r=await onSignInAndLinkGoogle();setAcctLoading(false);if(r?.error)setAcctError(r.error);else tt("✓ アカウントを連携しました");}}
              style={{width:"100%",padding:"12px",background:"white",border:"1px solid var(--c-border)",borderRadius:10,color:"#1A1A2E",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Googleで登録/ログイン
            </button>
            <button onClick={()=>{setAcctEmailMode("login");setAcctError("");}}
              style={{width:"100%",padding:"12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:10,color:"var(--c-text2)",fontSize:14,fontWeight:700,cursor:"pointer"}}>
              メールアドレスで続ける
            </button>
            {acctError&&<div style={{fontSize:12,color:"#EF4444",background:"rgba(239,68,68,.08)",padding:"8px 10px",borderRadius:8}}>{acctError}</div>}
          </div>
      }
    </AC>}

    {authUser&&<AC title="アカウント連携">
      <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12,lineHeight:1.6}}>
        複数のログイン方法を連携しておくと、端末やブラウザが変わっても同じアカウントにアクセスできます。
      </div>
      {providerRow("google.com","G","Googleアカウント")}
      {providerRow("password","✉","メールアドレス")}
      {emailLinkStep===1&&(
        <div style={{marginTop:14,padding:14,background:"var(--c-input)",borderRadius:10,border:"1px solid var(--c-border2)"}}>
          <AL>メールアドレス</AL>
          <div style={{display:"flex",gap:8}}>
            <input type="email" value={emailInput} onChange={e=>setEmailInput(e.target.value)}
              placeholder="example@example.com" style={{...AI,flex:1,fontSize:16}}
              onKeyDown={e=>{if(e.key==="Enter")handleSendOtp();}}/>
            <button onClick={handleSendOtp} disabled={linkLoading}
              style={{...AB,padding:"10px 14px",fontSize:13,whiteSpace:"nowrap",opacity:linkLoading?.5:1}}>
              {linkLoading?"送信中...":"確認コードを送信"}
            </button>
          </div>
          <button onClick={()=>{setEmailLinkStep(0);setLinkError("");}}
            style={{...AGray,marginTop:8,padding:"6px 12px",fontSize:12}}>キャンセル</button>
        </div>
      )}
      {emailLinkStep===2&&(
        <div style={{marginTop:14,padding:14,background:"var(--c-input)",borderRadius:10,border:"1px solid var(--c-border2)"}}>
          <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,lineHeight:1.6}}>
            <strong>{emailInput}</strong> に確認コードを送信しました。<br/>メールに記載された6桁のコードを入力してください。
          </div>
          <AL>確認コード（6桁）</AL>
          <div style={{display:"flex",gap:8}}>
            <input type="text" inputMode="numeric" value={codeInput} onChange={e=>setCodeInput(e.target.value.replace(/\D/g,"").slice(0,6))}
              placeholder="123456" maxLength={6} style={{...AI,flex:1,letterSpacing:"0.2em",fontSize:18,fontWeight:700}}
              onKeyDown={e=>{if(e.key==="Enter")handleVerifyOtp();}}/>
            <button onClick={handleVerifyOtp} disabled={linkLoading||codeInput.length<6}
              style={{...AB,padding:"10px 14px",fontSize:13,whiteSpace:"nowrap",opacity:(linkLoading||codeInput.length<6)?.5:1}}>
              {linkLoading?"確認中...":"確認して連携"}
            </button>
          </div>
          <button onClick={()=>{setEmailLinkStep(1);setCodeInput("");setLinkError("");}}
            style={{...AGray,marginTop:8,padding:"6px 12px",fontSize:12}}>← 戻る</button>
        </div>
      )}
      {linkError&&<div style={{marginTop:10,fontSize:12,color:"#EF4444"}}>{linkError}</div>}
    </AC>}

    <div style={{textAlign:"center",padding:"8px 0 4px",display:"flex",justifyContent:"center",gap:20}}>
      <a href="/terms.html" target="_blank" style={{fontSize:12,color:"var(--c-text4)",textDecoration:"none"}}>利用規約</a>
      <a href="/privacy.html" target="_blank" style={{fontSize:12,color:"var(--c-text4)",textDecoration:"none"}}>プライバシーポリシー</a>
    </div>

  </div>);
}

// ============================================================
// マイページ タブ (Phase 4)
// ============================================================
function MyPageTab({plan="free",planExpiry,staffList=[],periods=[],shopId,tt,onUpgrade}){
  const[portalLoading,setPortalLoading]=useState(false);
  const lim=PLAN_LIMITS[plan]||PLAN_LIMITS.free;
  const isPaid=plan==="pro"||plan==="premium";

  const openPortal=async()=>{
    ph("portal_opened");
    setPortalLoading(true);
    try{
      const idToken=await firebaseAuth?.currentUser?.getIdToken().catch(()=>null);
      const res=await fetch(`${CF_BASE}/createPortalSession`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...(idToken?{"Authorization":`Bearer ${idToken}`}:{})},
        body:JSON.stringify({shopId,returnUrl:window.location.href}),
      });
      const data=await res.json();
      if(data.url) window.location.href=data.url;
      else tt("✕ "+(data.error||"請求管理ページを開けませんでした"));
    }catch(e){
      tt("✕ 通信エラーが発生しました");
    }finally{setPortalLoading(false);}
  };

  // 有効期限の表示
  const expiryLabel=planExpiry?`${planExpiry} まで有効`:"";

  // 使用量バー
  const Bar=({used,max,label})=>{
    const pct=max===Infinity?0:Math.min(100,Math.round(used/max*100));
    const isOver=used>=max;
    return(
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
          <span style={{fontSize:13,color:"var(--c-text2)",fontWeight:600}}>{label}</span>
          <span style={{fontSize:13,fontWeight:700,color:isOver?"#FF4757":max===Infinity?"#10B981":"var(--c-text)"}}>
            {max===Infinity?`${used}名 / 無制限`:`${used} / ${max}`}
          </span>
        </div>
        {max!==Infinity&&<div style={{height:6,background:"var(--c-border)",borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,background:isOver?"#FF4757":pct>80?"#F59E0B":"#10B981",borderRadius:3,transition:"width .4s"}}/>
        </div>}
      </div>
    );
  };

  return(
    <div>
      <AT>マイページ</AT>

      {/* プランカード */}
      <AC title="現在のプラン">
        <div style={{display:"flex",alignItems:"center",gap:16,padding:"8px 0 16px"}}>
          <div style={{fontSize:48}}>{plan==="premium"?"★★":plan==="pro"?"★":""}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:22,fontWeight:800,color:"var(--c-text)"}}>{PLAN_LABELS[plan]||"Free"}プラン</div>
            {expiryLabel&&<div style={{fontSize:12,color:"var(--c-text3)",marginTop:3}}>{expiryLabel}</div>}
            {!isPaid&&<div style={{fontSize:12,color:"var(--c-text4)",marginTop:3}}>無料プランをご利用中です</div>}
          </div>
        </div>

        {/* 使用量 */}
        <div style={{borderTop:"1px solid var(--c-border)",paddingTop:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--c-text3)",marginBottom:12}}>使用状況</div>
          <Bar used={staffList.length} max={lim.staff} label="スタッフ数"/>
          <Bar used={periods.length} max={lim.periods} label="期間数"/>
        </div>

        {/* アップグレード */}
        {plan!=="premium"&&<div style={{marginTop:4}}>
          {plan==="free"&&<button onClick={()=>onUpgrade&&onUpgrade({type:"staff",limit:lim.staff,plan})}
            style={{width:"100%",padding:"13px",background:"linear-gradient(135deg,#f87036,#e05a1a)",border:"none",borderRadius:11,color:"white",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:8}}>
            {"★ Proにアップグレード（500円/月）"}
          </button>}
          {plan==="pro"&&<div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.6,marginBottom:8,textAlign:"center"}}>シフト作成・時間調整・PDF書き出しなど全機能が使えます</div>}
          <button onClick={()=>onUpgrade&&onUpgrade({type:"edit",plan})}
            style={{width:"100%",padding:"13px",background:"linear-gradient(135deg,#7c3aed,#5b21b6)",border:"none",borderRadius:11,color:"white",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:8}}>
            {"★★ Premiumにアップグレード（2,980円/月）"}
          </button>
        </div>}
      </AC>

      {/* プラン比較表 */}
      <AC title="プラン比較">
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr>
                {[["","機能"],["Free","無料"],["★ Pro","500円/月"],["★★ Premium","2,980円/月"]].map(([icon,price],i)=>(
                  <th key={i} style={{padding:"8px 6px",textAlign:"center",borderBottom:"2px solid var(--c-border)",color:"var(--c-text2)",fontWeight:700,background:
                    (i===1&&plan==="free")||(i===2&&plan==="pro")||(i===3&&plan==="premium")
                      ?"rgba(248,112,54,.1)":"transparent",
                    borderRadius:i>0?"8px 8px 0 0":0,fontSize:i===0?12:13}}>
                    {icon&&<div style={{fontSize:20,marginBottom:2}}>{icon}</div>}
                    <div>{price}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["スタッフ数","20名","無制限","無制限"],
                ["期間数","1件","無制限","無制限"],
                ["Excel書き出し","✓","✓","✓"],
                ["スタッフ並べ替え・名前色","✕","✓","✓"],
                ["テンプレート共有","✕","✓","✓"],
                ["Excel店舗名変更","✕","✓","✓"],
                ["名前リンク（別名）","✕","✓","✓"],
                ["シフト作成・時間調整","✕","✕","✓"],
                ["PDF書き出し","✕","✕","✓"],
                ["休憩時間・属性別設定","✕","✕","✓"],
                ["勤務時間制限チェック","✕","✕","✓"],
                ["時間帯別出勤人数","✕","✕","✓"],
                ["連勤・休みカウント","✕","✕","✓"],
                ["従業員番号のExcel/PDF出力","✕","✕","✓"],
              ].map(([feat,...vals])=>(
                <tr key={feat}>
                  <td style={{padding:"9px 6px",color:"var(--c-text3)",fontSize:12,fontWeight:600,borderBottom:"1px solid var(--c-border)"}}>{feat}</td>
                  {vals.map((v,i)=>(
                    <td key={i} style={{padding:"9px 6px",textAlign:"center",borderBottom:"1px solid var(--c-border)",
                      background:(i===0&&plan==="free")||(i===1&&plan==="pro")||(i===2&&plan==="premium")
                        ?"rgba(248,112,54,.06)":"transparent",
                      color:v==="✓"?"#10B981":v==="✕"?"#9CA3AF":"var(--c-text)",fontWeight:600}}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AC>

      {/* 請求管理 */}
      {isPaid&&<AC title="請求・サブスクリプション管理">
        <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:14}}>
          請求履歴の確認、クレジットカードの変更、プランの変更・解約はStripeの管理ページで行えます。
        </div>
        <button onClick={openPortal} disabled={portalLoading}
          style={{width:"100%",padding:"13px",background:portalLoading?"#999":"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:11,color:"var(--c-text2)",fontSize:14,fontWeight:600,cursor:portalLoading?"not-allowed":"pointer"}}>
          {portalLoading?"⏳ 読み込み中...":"請求・解約の管理（Stripeポータル）"}
        </button>
        <div style={{fontSize:11,color:"var(--c-text4)",marginTop:8,textAlign:"center"}}>外部のStripeサイトに移動します</div>
      </AC>}

      {!isPaid&&<AC title="請求・サブスクリプション管理">
        <div style={{fontSize:13,color:"var(--c-text4)",textAlign:"center",padding:"8px 0"}}>
          有料プランをご購入後に請求管理ページが利用できます
        </div>
      </AC>}
    </div>
  );
}


// ============================================================
// アップグレード促進モーダル
// ============================================================
function UpgradeModal({reason,currentPlan,shopId,onClose}){
  const[loading,setLoading]=useState(null);
  const[error,setError]=useState("");
  const isEditType=reason.type==="edit";
  const msgs={
    shops:  {title:"店舗数の上限に達しました",desc:`${PLAN_LABELS[currentPlan]||"Free"}プランでは最大${reason.limit}店舗まで管理できます。`,next:"Proプラン（500円/月）なら店舗を無制限に管理できます。"},
    staff:  {title:"スタッフ数の上限に達しました",desc:"Freeプランでは最大20名まで登録できます。",next:"Proプラン（500円/月）ならスタッフ数・期間数が無制限になります。"},
    periods:{title:"期間数の上限に達しました",desc:"Freeプランでは期間を1件まで作成できます。",next:"Proプラン（500円/月）なら期間を無制限に作成できます。"},
    edit:   {title:"シフト作成はPremiumプランの機能です",desc:"提出されたシフトの編集・調整、休憩・属性管理、PDF/Excel書き出しはPremiumプランでご利用いただけます。",next:"Premiumプラン（2,980円/月）で、シフト表の仕上げから書き出しまでこのアプリだけで完結します。"},
  };
  const m=msgs[reason.type]||{title:"上限に達しました",desc:"",next:""};

  const checkout=async(plan)=>{
    ph("upgrade_started",{plan});
    setLoading(plan);setError("");
    try{
      const idToken=await firebaseAuth?.currentUser?.getIdToken().catch(()=>null);
      const res=await fetch(`${CF_BASE}/createCheckoutSession`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...(idToken?{"Authorization":`Bearer ${idToken}`}:{})},
        body:JSON.stringify({shopId,plan,successUrl:window.location.href+"?payment=success",cancelUrl:window.location.href+"?payment=cancel"}),
      });
      const data=await res.json();
      if(data.url) window.location.href=data.url;
      else setError("決済ページの取得に失敗しました");
    }catch(e){
      setError("通信エラーが発生しました");
    }finally{setLoading(null);}
  };

  const proLabel=currentPlan==="pro"?"Pro（現在）":"Pro";
  const planRows=isEditType
    ?[["Free","無料","スタッフ20名 / 期間1件"],[proLabel,"500円/月","スタッフ・期間 無制限＋並べ替え・テンプレート・名前色"],["★ Premium","2,980円/月","Proの全機能＋シフト作成・調整・休憩/属性管理・PDF出力"]]
    :[["Free","無料","スタッフ20名 / 期間1件"],["★ Pro","500円/月","スタッフ・期間 無制限＋並べ替え・テンプレート・名前色"],["Premium","2,980円/月","Proの全機能＋シフト作成・調整・休憩/属性管理・PDF出力"]];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fI .2s"}} onClick={onClose}>
      <div style={{background:"var(--c-card)",border:"1px solid var(--c-border)",borderRadius:20,width:"100%",maxWidth:400,padding:"28px 24px",animation:"sI .2s",boxShadow:"0 8px 40px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:44,marginBottom:10}}>{isEditType?"✏️":"🚀"}</div>
          <div style={{fontSize:17,fontWeight:700,color:"var(--c-text)",marginBottom:8}}>{m.title}</div>
          <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.6,marginBottom:8}}>{m.desc}</div>
          <div style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.6}}>{m.next}</div>
        </div>
        <div style={{background:"rgba(248,112,54,.08)",border:"1px solid rgba(248,112,54,.25)",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"#f87036",marginBottom:8}}>プラン比較</div>
          {planRows.map(([label,price,desc])=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--c-border)"}}>
              <span style={{fontSize:13,color:"var(--c-text2)",fontWeight:600,minWidth:72}}>{label}</span>
              <span style={{fontSize:11,color:"var(--c-text3)",flex:1}}>{desc}</span>
              <span style={{fontSize:12,color:"#F59E0B",fontWeight:700,whiteSpace:"nowrap"}}>{price}</span>
            </div>
          ))}
        </div>
        {error&&<div style={{color:"#FF4757",fontSize:12,textAlign:"center",marginBottom:10,background:"rgba(255,71,87,.1)",padding:"8px",borderRadius:8}}>{error}</div>}
        {isEditType?(
          <button onClick={()=>checkout("premium")} disabled={!!loading} style={{width:"100%",padding:"13px",background:loading==="premium"?"var(--c-text3)":"linear-gradient(135deg,#7c3aed,#5b21b6)",border:"2px solid rgba(124,58,237,.3)",borderRadius:11,color:"white",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",marginBottom:12}}>
            {loading==="premium"?"⏳ 処理中...":"★ Premiumにアップグレード（2,980円/月）"}
          </button>
        ):(
          <button onClick={()=>checkout("pro")} disabled={!!loading} style={{width:"100%",padding:"13px",background:loading==="pro"?"var(--c-text3)":"linear-gradient(135deg,#f87036,#e05a1a)",border:"2px solid rgba(248,112,54,.3)",borderRadius:11,color:"white",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",marginBottom:12}}>
            {loading==="pro"?"⏳ 処理中...":"★ Proにアップグレード（500円/月）"}
          </button>
        )}
        <button onClick={onClose} style={{width:"100%",padding:"11px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:11,color:"var(--c-text3)",fontSize:13,cursor:"pointer"}}>今はしない</button>
      </div>
    </div>
  );
}

// ============================================================
// 共通UIパーツ
// ============================================================
function AC({title,children}){return(<div style={{background:"var(--c-card)",border:"1px solid #E5E7EB",borderRadius:16,padding:20,marginBottom:16,boxShadow:"0 1px 4px var(--c-shadow)"}}><div style={{fontSize:14,fontWeight:700,color:"var(--c-text2)",marginBottom:14}}>{title}</div>{children}</div>);}
function AL({children}){return(<label style={{fontSize:13,fontWeight:600,color:"var(--c-text3)",display:"block",marginBottom:6}}>{children}</label>);}
function AT({children}){return(<div style={{fontSize:18,fontWeight:700,color:"var(--c-text)",marginBottom:16}}>{children}</div>);}
function CL({items,onDel}){return items.map((c,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:c.closed?"rgba(255,71,87,.08)":"rgba(255,255,255,.05)",border:`1px solid ${c.closed?"rgba(255,71,87,.2)":"var(--c-border)"}`,borderRadius:10,marginBottom:6}}>
  {c.closed
    ?<span style={{flex:1,fontSize:14,color:"#FF4757",fontWeight:600}}>× 休業日</span>
    :<span style={{flex:1,fontSize:14,color:"var(--c-text)",fontWeight:500}}>{c.start} 〜 {c.end}</span>
  }
  <button onClick={()=>onDel(i)} style={AD}>削除</button>
</div>));}
