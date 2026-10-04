// ============================================================
// Shifty - 管理者画面コンポーネント（app.js から分割 M-1）
// ============================================================


// ============================================================
// 管理者画面
// ============================================================
// 人×月の所定（shops/{sid}/laborMonths・P3）を持たないとき（オーナーでない端末・一括PDFの非表示マウント）の既定
const LABOR_MONTHS_OFF={enabled:false,loaded:false,map:{},save:()=>Promise.resolve(),rename:()=>{},drop:()=>{}};
// 実績（shops/{sid}/actuals・P4）を持たないとき（オーナーでない端末・一括PDFの非表示マウント）の既定
const ACTUALS_OFF={enabled:false,loaded:false,map:{},save:()=>Promise.resolve(),rename:()=>{},drop:()=>{},csvMapping:null,saveCsvMapping:null};
// 従業員画面の紐付け（shops/{sid}/staffLinks・linkRequests・第2部 E2）を持たないとき（オーナーでない端末・本番・非表示マウント）の既定
const STAFF_LINKS_OFF={enabled:false,loaded:false,map:{},requests:{},rename:()=>{},drop:()=>{},reject:()=>Promise.resolve({}),call:()=>Promise.resolve({error:"この操作はできません"})};
function AdminView({settings,periods,subs,staffList,shops,currentShopId,saveSettings,savePeriods,saveSubs,saveStaff,saveShops,setCurrentShopId,startSubscriptions,onLoadPastSubs,pastSubsLoaded=false,logout,logoutShop,authUser,syncStatus,plan="free",planExpiry=null,paymentFailed=false,billingSchedule=null,billingExempt=false,companyLink=null,onSaveCompanyConfig,allLinkedShops=[],onSwitchToShop,onLinkProvider,onSendEmailOtp,onVerifyAndLinkEmail,onUnlinkProvider,onSignInAndLinkGoogle,onSignInAndLinkEmail,onUnlinkShop,adminCode,ownerReadOnly=false,onRememberAdminKey,onClaimShop,companyInfo=null,onCreateCompany,onChangeCompanyPassword,onRenameCompany,onLinkStoreToCompany,onUnlinkStoreFromCompany,onCompanyLogin,onCompanyCall,pay:payProp=null,laborMonths:lmProp,actuals:actProp=null,staffLinks:slProp=null}){
  const[tab,setTab]=useState(()=>ssGet(SS_TAB,"periods"));
  // 管理者画面の中身を丸ごと差し替える全画面ビュー。null＝通常のタブ表示。
  // {kind:"companyStaff"}＝企業内登録スタッフ（2026-09-28）／{kind:"staffPay",name}＝賃金設定（2026-09-30・P6a）
  const[fullPage,setFullPage]=useState(null);
  // 賃金設定ページから戻ったときに開き直す編集モーダルのスタッフ名（StaffTab は全画面の間アンマウントされるため）
  const[returnEdit,setReturnEdit]=useState(null);
  const pay=payProp||PAY_OFF;
  const lm=lmProp||LABOR_MONTHS_OFF;
  const sl=slProp||STAFF_LINKS_OFF;
  // 実績（P4）。CSV取込の列の位置は店舗の設定（settings.actualsCsv）に持つ＝現在の設定から読み書きする（確定済み期間の写しではない）
  const act=actProp?{...actProp,csvMapping:actualsCsvMappingOf(settings),saveCsvMapping:m=>saveSettings({...settings,actualsCsv:m})}:ACTUALS_OFF;
  // 所属店舗の選択肢。企業の写しが持つ連携店舗の一覧を優先し、この端末が知っている店舗（allLinkedShops）で補う。
  // 企業の作成者でも企業ログインでもない端末（Cookie・管理コードで追加した端末）は allLinkedShops を持たないため。
  const homeShopChoices=(()=>{
    const m=new Map();
    Object.entries((companyLink&&companyLink.shops)||{}).forEach(([id,nm])=>{if(id)m.set(id,{id,name:nm||id});});
    (allLinkedShops||[]).forEach(s=>{if(s&&s.id&&!m.has(s.id))m.set(s.id,{id:s.id,name:s.name||s.id});});
    return[...m.values()];
  })();
  useEffect(()=>{ssSave(SS_TAB,tab);ph("admin_tab_changed",{tab});},[tab]);
  // 課金対象外の店舗ではマイページを出さない（2026-08-31 決定6）。
  // billingExempt は null=未確定（購読が返る前・店舗切替の直後）。**未確定のうちは「出す」**——
  // 2026-08-31 のユーザー判断で、フラグの無い店舗（＝実際の利用者）の操作感を優先し、
  // マイページを1往復ぶん遅らせないことを選んだ。**隠すのは確定して true のときだけ**。
  // 代償として、フラグ持ちの店舗では店舗切替のたびにタブが約190ms描画される（実測済み・承知のうえ）。
  // タブ配列・決済失敗バナー・レンダリングの3箇所は必ずこの1つを共用する（食い違うと
  // 「タブは無いのに中身が出る」状態になる）。
  const hideMypage=billingExempt===true;
  // タブは sessionStorage から復元されるので、前回 "mypage" で閉じた端末が取り残されないよう
  // 期間タブへ戻す。**確定して true のときだけ**戻す（未確定で戻すと、フラグの無い店舗の
  // ユーザーが復元したマイページから勝手に弾かれる）。
  useEffect(()=>{if(billingExempt===true&&tab==="mypage")setTab("periods");},[billingExempt,tab]);
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
    // ref() は禁止文字（# $ [ ]）や空パスに対して「同期に」throwする。下の .catch は
    // promiseに付くため同期throwを受け取れず、「確認中...」のまま固まる。入口で弾く。
    // プラン上限より前に置く（不正なコードでアップグレード案内を出さないため）。
    if(!code||firebaseKeyForbiddenChars(code).length){setShopCodeError("コードが正しくありません");return;}
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
      if(authUser) fbSet(`accounts/${authUser.uid}/shops/${code}`, true);
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

  if(fullPage&&fullPage.kind==="companyStaff"&&companyInfo&&plan==="premium")
    return <CompanyStaffDirectory companyId={companyInfo.companyId} pay={pay} plan={plan} onCompanyCall={onCompanyCall} onBack={()=>setFullPage(null)}/>;
  // 月次賃金（P6b）。自店はスタッフタブ（オーナーの端末）、他の連携店舗は企業連携タブの法人カードから開く。
  // 読めるかどうか（オーナーか・対象店舗が Premium か）はページが読み込みで確かめる
  if(fullPage&&fullPage.kind==="payroll"&&featureEnabled("pay",{plan}))
    return <PayrollPage shopId={fullPage.shopId||currentShopId} shopName={fullPage.shopName||(shops.find(s=>s.id===currentShopId)||shops[0])?.name||""}
      pay={pay} tt={tt} onBack={()=>setFullPage(null)}/>;
  if(fullPage&&fullPage.kind==="staffPay"&&pay.enabled){
    const pn=fullPage.name;
    const hs=homeShopOf(settings,pn,currentShopId);
    return <StaffPayPage name={pn} settings={settings} shopId={currentShopId} shopName={(shops.find(s=>s.id===currentShopId)||shops[0])?.name||""}
      homeShopName={(homeShopChoices.find(x=>x.id===hs)||{}).name||""} companyLink={companyLink} pay={pay} tt={tt}
      onBack={()=>{setFullPage(null);setReturnEdit(pn);}}/>;
  }
  const isHqShop=!!(companyLink&&companyLink.kind==="hq");
  return(
    <div style={{background:"var(--c-bg)",minHeight:"calc(100vh - 44px)"}}>
      {/* 管理ヘッダー */}
      <div style={{background:"var(--c-card)",borderBottom:"1px solid var(--c-border)",padding:"12px 16px"}}>
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
                        <div key={sh.id} style={{display:"flex",alignItems:"center",background:sh.id===currentShopId?"rgba(248,112,54,.12)":"var(--c-card)",borderBottom:"1px solid var(--c-border)"}}>
                          <div onClick={()=>{setCurrentShopId(sh.id);setShopMenuOpen(false);}} style={{flex:1,padding:"11px 16px",cursor:"pointer",fontSize:14,fontWeight:sh.id===currentShopId?700:400,color:sh.id===currentShopId?"var(--c-accent)":"var(--c-text)",display:"flex",alignItems:"center",gap:8}}>
                            {sh.id===currentShopId&&<span style={{fontSize:10}}>✓</span>}{sh.name}
                          </div>
                          <button onClick={e=>{e.stopPropagation();const isLast=shops.length<=1;const msg=isLast?`ログアウトしますか？（この端末の店舗セッションを終了します）`:`「${sh.name}」からログアウトしますか？（他の店舗のセッションは維持されます）`;if(!window.confirm(msg))return;setShopMenuOpen(false);if(logoutShop)logoutShop(sh.id);else logout();}} style={{padding:"6px 10px",margin:"0 8px",background:"rgba(255,71,87,.08)",border:"1px solid rgba(255,71,87,.2)",borderRadius:4,color:"#FF4757",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>ログアウト</button>
                        </div>
                      ))}
                      <div style={{borderTop:"1px solid var(--c-border)",padding:"8px 10px",display:"flex",gap:6}}>

                        <button onClick={()=>{setShopEditMode(v=>!v);setShopCodeMode(false);}} style={{flex:1,padding:"7px",background:"var(--c-bg)",border:"none",borderRadius:8,fontSize:12,fontWeight:600,color:"var(--c-text)",cursor:"pointer"}}>編集</button>
                        <button onClick={()=>{setShopCodeMode(v=>!v);setShopEditMode(false);setShopCodeInput("");setShopCodeError("");}} style={{flex:1,padding:"7px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,fontSize:12,fontWeight:600,color:"var(--c-text2)",cursor:"pointer"}}>コードで追加</button>
                        <button onClick={()=>{
                          const lim=PLAN_LIMITS[plan]?.shops??Infinity;
                          if(shops.length>=lim){setShopMenuOpen(false);setUpgradeReason({type:"shops",limit:lim,plan});return;}
                          const name=prompt("新しい店舗名を入力");if(!name)return;const ns=makeShop(name.trim());const newShops=[...shops,ns];saveShops(newShops);if(authUser&&firebaseDB)fbSet(`accounts/${authUser.uid}/shops/${ns.id}`, true).catch(e=>console.warn("店舗紐付け失敗:",e));setCurrentShopId(ns.id);setShopMenuOpen(false);tt("✓ 店舗を追加しました");
                        }} style={{flex:1,padding:"7px",background:"var(--c-accent)",border:"none",borderRadius:8,fontSize:12,fontWeight:700,color:"white",cursor:"pointer"}}>＋ 新規</button>
                      </div>
                      {/* 店舗コードで追加パネル */}
                      {shopCodeMode&&<div style={{borderTop:"1px solid var(--c-border)",padding:"10px"}}>
                        <div style={{fontSize:11,color:"var(--c-text3)",marginBottom:6}}>店舗コードを入力して既存店舗を追加</div>
                        <div style={{display:"flex",gap:6}}>
                          <input value={shopCodeInput} onChange={e=>{setShopCodeInput(e.target.value);setShopCodeError("");}}
                            onKeyDown={e=>e.key==="Enter"&&addShopByCode()}
                            placeholder="店舗コードを貼り付け"
                            style={{flex:1,padding:"7px 10px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none"}}/>
                          <button onClick={addShopByCode} style={{padding:"7px 10px",background:"var(--c-accent)",border:"none",borderRadius:8,fontSize:12,fontWeight:700,color:"white",cursor:"pointer"}}>追加</button>
                        </div>
                        {shopCodeError&&<div style={{fontSize:11,color:shopCodeError==="確認中..."?"#F59E0B":"#FF4757",marginTop:4}}>{shopCodeError}</div>}
                      </div>}
                      {shopEditMode&&<div style={{borderTop:"1px solid var(--c-border)",padding:"10px"}}>
                        {shops.map(sh=>(
                          <div key={sh.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                            <span style={{flex:1,fontSize:13,color:"var(--c-text)"}}>{sh.name}</span>
                            <button onClick={()=>{const name=prompt("店舗名を変更",sh.name);if(!name)return;saveShops(shops.map(s=>s.id===sh.id?{...s,name:name.trim()}:s));tt("✓ 変更しました");}} style={{padding:"4px 8px",background:"var(--c-bg)",border:"none",borderRadius:4,fontSize:11,color:"var(--c-text3)",cursor:"pointer"}}>名前</button>
                            {/* この操作は店舗を削除しない。Authなら accounts/{uid}/shops から、非Authならこの端末の一覧から外すだけで、
                                shops/{shopId} も global/shops/{shopId} も残る（クライアントに削除経路は無く、消すのは CF の purgeInactiveShops だけ）。
                                CompanyTab の同じ操作（:3203）が「解除」と呼んでいるのに合わせる。戻すには店舗コードが要る点が実際の損失。 */}
                            {shops.length>1&&<button onClick={async()=>{if(!confirm(`「${sh.name}」を一覧から外しますか？\nシフトデータは削除されません。戻すには店舗コード（設定タブ）が必要です。`))return;if(authUser&&onUnlinkShop){const r=await onUnlinkShop(sh.id);tt(r&&r.error?("✕ "+r.error):"✓ 一覧から外しました");}else{const ns=shops.filter(s=>s.id!==sh.id);saveShops(ns);if(sh.id===currentShopId){setCurrentShopId(ns[0].id);startSubscriptions(ns[0].id,ns);}tt("✓ 一覧から外しました");}}} style={{padding:"4px 8px",background:"none",border:"none",borderRadius:4,fontSize:11,color:"#FF4757",cursor:"pointer"}}>解除</button>}
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
          {/* gap は8px以上を保つ。375pxではタブが2段に折り返るため、4pxだと隣のタブと
              指の幅より近くなり誤タップが起きる（バグチェック#74の実測）。タブ自体の高さ(34px)は
              縦の嵩を増やさないため据え置く＝移動先を間違えても取り返しがつく操作だから */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[["periods","期間"],["staff","スタッフ"],["candidates","候補"],["submissions","提出一覧"],["edit","シフト作成"],["company","企業連携"],["mypage","マイページ"],["settings","設定"]].filter(([id])=>!(hideMypage&&id==="mypage")).map(([id,l])=>(
              <button key={id} onClick={()=>setTab(id)} style={{padding:"7px 13px",background:tab===id?"var(--c-accent)":"var(--c-input)",border:`1px solid ${tab===id?"var(--c-accent)":"var(--c-border)"}`,borderRadius:8,color:tab===id?"white":"var(--c-text2)",fontSize:12,fontWeight:600,cursor:"pointer"}}>{l}</button>
            ))}
            {/* ログアウトはここに置かない。タブは画面の移動、ログアウトは実行で種類が違ううえ、
                確認ダイアログなしで即実行されるため誤操作を招く。
                導線は店舗名ボタン→ドロップダウン内のログアウト（確認あり・店舗ごと）に一本化する */}
          </div>
        </div>
      </div>
      <div style={{maxWidth:900,margin:"0 auto",padding:"20px 14px 60px"}}>
        {DEMO_MODE&&<div style={{background:"rgba(248,112,54,.1)",border:"1px solid rgba(248,112,54,.35)",borderRadius:8,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:13,fontWeight:700,color:"#C2410C",marginBottom:2}}>これはデモです（サンプル店舗・全機能が使えるPremium表示）</div>
            <div style={{fontSize:12,color:"#9A3412"}}>自由に触って試せます。入力内容は保存されず、ページを再読み込みすると元に戻ります。</div>
          </div>
          {/* ?start=1 を付けるのはハッシュだけを外すと同一ドキュメント遷移になり再読み込みされないため。
              GA4でデモからの「無料で始める」到達を計測できる副次効果もある */}
          <a href={window.location.pathname+"?start=1"} style={{padding:"10px 18px",background:"var(--c-accent)",color:"#fff",borderRadius:8,fontSize:14,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>無料で始める</a>
        </div>}
        {ownerReadOnly&&<div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:8,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"#B45309",marginBottom:2}}>この端末は管理者として登録されていません</div>
            <div style={{fontSize:12,color:"#92400E"}}>提出データの編集はできますが、設定・期間・スタッフ・候補時間・店舗名の変更は保存できません。変更するには、登録済みの端末の「設定タブ → 管理コード」を「店舗名ボタン → コードで追加」に入力してください。</div>
          </div>
        </div>}
        {/* 課金対象外の店舗ではバナーごと出さない（2026-08-31 決定6）。本文が「マイページ → 請求管理」を
            案内しており、ボタンだけ隠すと存在しないタブへ誘導する文言が残るため。契約が無い店舗に
            paymentFailed が立つことはないはずだが、経路として塞いでおく */}
        {paymentFailed&&!hideMypage&&<div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"#DC2626",marginBottom:2}}>決済に失敗しました</div>
            <div style={{fontSize:12,color:"var(--c-text2)"}}>登録中のカードに問題が発生しています。マイページ → 請求管理から支払い方法を更新してください。</div>
          </div>
          <button onClick={()=>setTab("mypage")} style={{padding:"6px 12px",background:"#DC2626",border:"none",borderRadius:8,color:"white",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>マイページへ</button>
        </div>}
        {tab==="periods"&&<PeriodsTab periods={periods} subs={subs} staffList={staffList} shops={shops} onSave={savePeriods} saveSubs={saveSubs} tt={tt} shopId={currentShopId} shopName={(shops.find(s=>s.id===currentShopId)||shops[0])?.name} plan={plan} onUpgrade={setUpgradeReason} settings={settings} onSaveSettings={saveSettings} isHqShop={isHqShop}/>}
        {tab==="staff"&&<StaffTab staffList={staffList} onSave={saveStaff} tt={tt} plan={plan} onUpgrade={setUpgradeReason} settings={settings} onSaveSettings={saveSettings} subs={subs} periods={periods} savePeriods={savePeriods} ownerReadOnly={ownerReadOnly} shopId={currentShopId} shopName={(shops.find(s=>s.id===currentShopId)||shops[0])?.name||""} linkedShops={homeShopChoices} companyShops={Object.entries((companyLink&&companyLink.shops)||{}).filter(([id])=>id&&id!==currentShopId).map(([id,nm])=>({id,name:nm||id}))}
          pay={pay} laborMonths={lm} actuals={act} staffLinks={sl} mirrorPeople={(companyLink&&companyLink.people)||null} companyLinked={!!companyLink} onOpenPay={n=>setFullPage({kind:"staffPay",name:n})} onOpenPayroll={()=>setFullPage({kind:"payroll"})} initialEditKey={returnEdit} onInitialEditConsumed={()=>setReturnEdit(null)} onRenameStaff={(oldName,newName)=>{
          const newList=staffList.map(n=>n===oldName?newName:n);
          saveStaff(newList);
          const newSubs=subs.map(s=>s.staffName===oldName?{...s,staffName:newName}:s);
          saveSubs(newSubs);
          // スタッフ名をキーに持つ設定マップは全てキーを移し替える（漏れると属性・ポジション等が黙って初期値に戻る）。
          // 規則は app-utils.js の renameStaffInSettings に一本化し、下の写しにも同じものを当てる。
          saveSettings(renameStaffInSettings(settings,oldName,newName));
          // 賃金（shops/{sid}/private/pay/{名前}）も名前がキーなので移す（STAFF_KEYED_PRIVATE_NODES・P6a）
          pay.rename(oldName,newName);
          // 人×月の所定（shops/{sid}/laborMonths/{月}/{名前}）も名前がキーなので移す（STAFF_KEYED_MONTH_NODES・P3）
          lm.rename(oldName,newName);
          // 実績（shops/{sid}/actuals/{期間ID}/{名前}）も名前がキーなので移す（STAFF_KEYED_PERIOD_NODES・P4）
          act.rename(oldName,newName);
          // マイシフトの紐付け（shops/{sid}/staffLinks/{uid}.name・第2部 E2）も名前を値に持つので書き換える。
          // 新しい名前に残っていた紐付け（前に同じ名前だった人の削除の追随が届かなかったもの）は先に外す
          sl.drop([newName]);
          sl.rename(oldName,newName);
          // 確定済み期間の写し（period.snapshot）も同時に改名する。上で sub.staffName を全期間ぶん
          // 書き換えるため、写しだけ旧名で残るとシフト作成タブ・Excel・PDF がその人のsubを引けなくなる。
          if(savePeriods){
            const r=renameStaffInPeriods(periods,oldName,newName);
            if(r.changed)savePeriods(r.periods);
          }
          tt(`✓ ${oldName} → ${newName} に変更しました`);
        }}/>}
        {tab==="candidates"&&<CandTab settings={settings} onSave={saveSettings} tt={tt} plan={plan} periods={periods}/>}
        {tab==="submissions"&&<SubsTab key={currentShopId} subs={subs} periods={periods} staffList={staffList} onSave={saveSubs} tt={tt} settings={settings} onSaveSettings={saveSettings} plan={plan} onLoadPastSubs={onLoadPastSubs} pastSubsLoaded={pastSubsLoaded}/>}
        {tab==="edit"&&<ShiftEditTab subs={subs} periods={periods} staffList={staffList} onSave={saveSubs} tt={tt} settings={settings} plan={plan} shopId={currentShopId} shopName={(shops.find(s=>s.id===currentShopId)||shops[0])?.name} onUpgrade={setUpgradeReason} allLinkedShops={allLinkedShops} onLoadPastSubs={onLoadPastSubs} pastSubsLoaded={pastSubsLoaded} savePeriods={savePeriods} ownerReadOnly={ownerReadOnly} companyLink={companyLink} companyInfo={companyInfo} laborMonths={lm} actuals={act}/>}
        {tab==="company"&&<CompanyTab settings={settings} onSave={saveSettings} tt={tt} shopId={currentShopId} staffList={staffList} authUser={authUser} shops={shops} allLinkedShops={allLinkedShops} onSwitchToShop={onSwitchToShop} onUnlinkShop={onUnlinkShop} companyInfo={companyInfo} onCreateCompany={onCreateCompany} onChangeCompanyPassword={onChangeCompanyPassword} onRenameCompany={onRenameCompany} onLinkStoreToCompany={onLinkStoreToCompany} onUnlinkStoreFromCompany={onUnlinkStoreFromCompany} plan={plan} onSaveCompanyConfig={onSaveCompanyConfig} onCompanyLogin={onCompanyLogin} onCompanyCall={onCompanyCall} onOpenCompanyStaff={()=>setFullPage({kind:"companyStaff"})} onOpenPayroll={(sid,nm)=>setFullPage({kind:"payroll",shopId:sid,shopName:nm})}/>}
        {tab==="mypage"&&!hideMypage&&<MyPageTab plan={plan} planExpiry={planExpiry} billingSchedule={billingSchedule} staffList={staffList} periods={periods} shopId={currentShopId} tt={tt} onUpgrade={setUpgradeReason}/>}
        {tab==="settings"&&<SetTab settings={settings} onSave={saveSettings} subs={subs} saveSubs={saveSubs} tt={tt} syncStatus={syncStatus} plan={plan} shopId={currentShopId} authUser={authUser} onLinkProvider={onLinkProvider} onSendEmailOtp={onSendEmailOtp} onVerifyAndLinkEmail={onVerifyAndLinkEmail} onUnlinkProvider={onUnlinkProvider} onSignInAndLinkGoogle={onSignInAndLinkGoogle} onSignInAndLinkEmail={onSignInAndLinkEmail} adminCode={adminCode} ownerReadOnly={ownerReadOnly} companyLink={companyLink}/>}
      </div>
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"var(--c-card)",backdropFilter:"blur(10px)",color:"var(--c-text)",padding:"10px 20px",borderRadius:12,fontSize:14,fontWeight:500,zIndex:999,border:"1px solid var(--c-border2)",boxShadow:"0 4px 16px var(--c-shadow)"}}>{toast}</div>}
      {upgradeReason&&<UpgradeModal reason={upgradeReason} currentPlan={plan} shopId={currentShopId} onClose={()=>setUpgradeReason(null)}/>}
    </div>
  );
}

// ===== 期間管理タブ =====
function PeriodsTab({periods,subs,staffList,shops,onSave,saveSubs,tt,shopId,shopName,plan="free",onUpgrade,settings={},onSaveSettings,isHqShop=false}){
  const[eid,setEid]=useState(null);
  // 本部店舗（企業連携タブで種別を「本部」にした店舗・2026-09-30 P1）は固定勤務で希望を集めないので、
  // スタッフ提出URLの案内を出さない。出すこと自体はできるよう、押せば表示する
  const[hqShowUrl,setHqShowUrl]=useState(false);
  const[form,setForm]=useState({label:"",startDate:"",endDate:"",deadlineDate:""});
  const[show,setShow]=useState(false);
  const[usePreset,setUsePreset]=useState(true); // プリセット使用フラグ
  const[presetDeadline,setPresetDeadline]=useState(""); // プリセット作成時の締切日（任意）
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
    // 日付の検証は作成・編集で同じ関数を通す（片方にしか無いと、編集だけ素通りする）
    const v=validatePeriodDates(form,periods);
    if(v.error){tt("▲ "+v.error);return;}
    if(v.warning&&!confirm(`${v.warning}。\nこのまま作成しますか？（同じ日に2つの期間があると、提出やシフトが期間ごとに分かれます）`))return;
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
        <button onClick={()=>setViewPeriodId(null)} style={{marginBottom:16,padding:"8px 16px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,color:"var(--c-text)",fontSize:13,cursor:"pointer"}}>← 期間一覧に戻る</button>
        {/* 管理者がこのビューでセルを編集しても isUpdated/updatedAt は立てない。これらは「スタッフ本人が
            再提出した」ことを表す提出メタで、subHasRealUpdate（提出一覧の「更新: …」バッジ・締切日ゲート付き）と
            subLastActionTime（提出一覧の並べ替え）が読む。管理者の編集時刻でこれを立てると、締切を守った
            スタッフが「締切後に変更あり」と表示される（バグチェック#59）。管理者の他のセル編集経路
            （シフト作成タブのapplyEditToSubs・提出一覧詳細モーダルのsaveAdj:2930）も同じ理由で立てていない。
            既にスタッフの再提出で立っている値はそのまま引き継ぐ（消すと本物の再提出記録が消えるため）。 */}
        <SmModal subs={subs} periods={periods} apid={viewPeriodId} onClose={()=>setViewPeriodId(null)} staffList={staffList} plan={plan} staffAliases={settings.staffAliases||{}} onDeleteSub={subId=>{const a=subs.filter(s=>s.id!==subId);saveSubs&&saveSubs(a,subId);tt("提出を削除しました");}} onEditSub={sub=>{const a=[...subs];const i=a.findIndex(s=>s.id===sub.id);if(i>=0){a[i]=sub;saveSubs&&saveSubs(a);}tt("✓ 更新しました");}}/>
      </div>
    );
  }

  // 期間を開始日の降順でソート（最新が上）
  const sortedPeriods=[...periods].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate));

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <AT>期間管理</AT>
        <button onClick={()=>{setShow(v=>!v);setUsePreset(true);setPresetDeadline("");setForm({label:"",startDate:"",endDate:"",deadlineDate:""}); }} style={{padding:"9px 16px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:13,fontWeight:700,cursor:"pointer"}}>＋ 新しい期間を作成</button>
      </div>
      {plan==="free"&&<div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,background:"var(--c-card)",border:"1px solid var(--c-border)",borderRadius:8,padding:"7px 10px"}}>
        {`Freeプラン：最大${PLAN_LIMITS.free.periods}件まで作成可能（${periods.length}/${PLAN_LIMITS.free.periods}件）`}
        {periods.length>=PLAN_LIMITS.free.periods&&<span style={{marginLeft:8,color:"#F59E0B",fontSize:11}}>期間追加はProプランで利用できます</span>}
      </div>}
      {show&&<AC title="新しい期間を作成">
        {/* プリセット使用 / 手動入力 の切り替え */}
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={()=>{setUsePreset(true);setPresetDeadline("");}} style={{flex:1,padding:"9px 0",border:`2px solid ${usePreset?"var(--c-accent)":"var(--c-border2)"}`,borderRadius:8,background:usePreset?"rgba(248,112,54,.15)":"rgba(0,0,0,.03)",color:usePreset?"var(--c-accent)":"var(--c-text3)",fontSize:13,fontWeight:700,cursor:"pointer"}}>プリセットから選ぶ</button>
          <button onClick={()=>{setUsePreset(false);setPresetDeadline("");setForm({label:"",startDate:"",endDate:"",deadlineDate:""}); }} style={{flex:1,padding:"9px 0",border:`2px solid ${!usePreset?"var(--c-accent)":"var(--c-border2)"}`,borderRadius:8,background:!usePreset?"rgba(248,112,54,.15)":"rgba(0,0,0,.03)",color:!usePreset?"var(--c-accent)":"var(--c-text3)",fontSize:13,fontWeight:700,cursor:"pointer"}}>手動で入力する</button>
        </div>

        {usePreset?(
          /* プリセット選択 */
          (()=>{
            const availPresets=pre.filter(p=>!periods.some(pp=>pp.startDate===p.startDate&&pp.endDate===p.endDate));
            return(
            <div>
              <div style={{marginBottom:12}}>
                <AL>締切日（任意）</AL>
                <input type="date" value={presetDeadline} onChange={e=>setPresetDeadline(e.target.value)} style={AI}/>
              </div>
              <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:10}}>選択するとすぐに作成されます</div>
              {availPresets.length===0
                ?<div style={{fontSize:13,color:"var(--c-text3)",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>表示できるプリセットがありません（すべて作成済みです）</div>
                :<div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
                {availPresets.map((p,i)=>(
                  <button key={i} onClick={()=>{
                    if(periods.some(pp=>pp.startDate===p.startDate&&pp.endDate===p.endDate)){tt("▲ この期間はすでに作成済みです");return;}
                    // 完全一致の作成済みチェックだけでは「一部だけ重なる期間」を素通りさせる。
                    // 手入力で 9/05〜9/20 を作ったあとの「9月前半」、periodUnit を 2week→1month に
                    // 切り替えたあとの「9月」がこれに当たる。作成の入口は手入力・編集・ここの3つあり、
                    // ここだけが validatePeriodDates を通っていなかった（バグチェック#95）
                    const pv=validatePeriodDates(p,periods);
                    if(pv.error){tt("▲ "+pv.error);return;}
                    if(pv.warning&&!confirm(`${pv.warning}。\nこのまま作成しますか？（同じ日に2つの期間があると、提出やシフトが期間ごとに分かれます）`))return;
                    if(!checkPeriodLimit())return;
                    const np={id:`p_${Date.now()}`,urlToken:genToken(),shopId,label:p.label,startDate:p.startDate,endDate:p.endDate,deadlineDate:presetDeadline,createdAt:new Date().toISOString()};
                    ph("period_created",{period_id:np.id,shop_id:shopId});
                    onSave([...periods,np]);setShow(false);setUsePreset(true);setPresetDeadline("");tt(`✓ ${p.label} を作成しました`);
                  }} style={{padding:"10px 16px",background:"var(--c-border)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text)",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                    {p.label}
                  </button>
                ))}
              </div>}
              <button onClick={()=>setShow(false)} style={{...AGray,width:"100%"}}>キャンセル</button>
            </div>
            );
          })()
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
          <div key={p.id} style={{background:"rgba(0,0,0,.03)",border:"1px solid var(--c-border)",borderRadius:12,padding:18,marginBottom:12,cursor:"pointer"}} onClick={e=>{if(e.target.tagName==="BUTTON"||e.target.closest("button"))return;setViewPeriodId(p.id);}}>
            {eid===p.id
              ?<PEF period={p} onSave={u=>{
                  const v=validatePeriodDates({...u,id:p.id},periods);
                  if(v.error){tt("▲ "+v.error);return;}
                  if(v.warning&&!confirm(`${v.warning}。\nこのまま保存しますか？`))return;
                  onSave(periods.map(pp=>pp.id===p.id?{...pp,...u}:pp));
                  // 非表示の範囲は期間の開始日を値で持つので、開始日を動かしたら境界も一緒に動かす
                  // （動かさないと非表示にした人がシフト表に戻る／表示に戻した人が消える。バグチェック#136）
                  const ns=moveStaffHiddenBoundaries(settings,p.startDate,u.startDate,periods.filter(pp=>pp.id!==p.id));
                  if(ns!==settings)onSaveSettings&&onSaveSettings(ns);
                  tt("✓ 保存しました");setEid(null);
                }} onCancel={()=>setEid(null)}/>
              :<>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)",marginBottom:3}}>{p.label}</div>
                    <div style={{fontSize:13,color:"var(--c-text3)"}}>{p.startDate?.replace(/-/g,"/")} 〜 {p.endDate?.replace(/-/g,"/")}（{dates.length}日間）</div>
                    {p.deadlineDate&&<div style={{fontSize:12,marginTop:3,color:ip?"#FF8C94":"var(--c-text4)"}}>締切：{p.deadlineDate.replace(/-/g,"/")} {ip?"（済み）":""}</div>}
                    {/* source:"grid" は管理者がシフト作成タブのセルに直接入力して生まれたsubで、スタッフの提出ではない
                        （app-admin.js の applyEditToSubs）。除外しないと、このカードをタップして開くSmModalの
                        「提出済み N名」（app-staff.js）や提出一覧タブ（app-admin.js の SubsTab）と件数が食い違う（バグチェック#56）。
                        Excel出力（expXl）は管理者入力も出力対象なので、そちらは除外しないままでよい。 */}
                    <div style={{fontSize:11,color:"var(--c-text4)",marginTop:4}}>提出：{subs.filter(s=>s.periodId===p.id&&s.source!=="grid").length}件</div>
                  </div>
                  <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <button onClick={e=>{e.stopPropagation();setEid(p.id);}} style={{padding:"5px 9px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:4,color:"var(--c-text2)",fontSize:11,cursor:"pointer"}}>編集</button>
                    {/* 確定済み期間はシフト作成タブと同じ凍結名簿・凍結設定で出力する。
                        ここだけ現在値のまま出すと、同じ期間のExcelが出す場所によって中身が変わる。 */}
                    <button onClick={e=>{e.stopPropagation();const m=resolvePeriodMaster(p,staffList,settings,fd(new Date()));expXl(p,subs,m.staffList,tt,m.settings.xlShopName||shopName,{staffColors:m.settings.staffColors||{},staffAliases:m.settings.staffAliases||{},staffNumbers:m.settings.staffNumbers||{},settings:m.settings});}} style={{padding:"5px 9px",background:"#1D6F42",border:"none",borderRadius:4,color:"white",fontSize:11,fontWeight:700,cursor:"pointer"}}>Excel</button>
                    {/* 期間の削除は app-main.js の savePeriods でこの期間のsubsと tokens/{urlToken} まで
                        連鎖削除される。件数は上の「提出：N件」と同じ式で数える（食い違うとバグチェック#56 と同じ混乱になる）。 */}
                    <button onClick={e=>{e.stopPropagation();const sc=subs.filter(s=>s.periodId===p.id&&s.source!=="grid").length;if(!confirm(`「${p.label}」を削除しますか？\n${sc>0?`提出済みのシフト${sc}件も一緒に削除されます。\n`:""}スタッフ用URLも無効になります。この操作は取り消せません。`))return;onSave(periods.filter(pp=>pp.id!==p.id));tt("削除しました");}} style={AD}>削除</button>
                  </div>
                </div>
                {/* URLシェア */}
                {isHqShop&&!hqShowUrl?<div data-hq-url-hidden="1" style={{marginTop:10,padding:"8px 12px",background:"rgba(0,0,0,.03)",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,color:"var(--c-text3)",flex:1}}>本部店舗のため、スタッフ提出URLは表示していません</span>
                  <button onClick={e=>{e.stopPropagation();setHqShowUrl(true);}} style={{padding:"4px 10px",background:"var(--c-border)",border:"none",borderRadius:4,color:"var(--c-text)",fontSize:11,cursor:"pointer",flexShrink:0}}>URLを表示</button>
                </div>:
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
              }}} style={{padding:"4px 10px",background:"var(--c-border)",border:"none",borderRadius:4,color:"var(--c-text)",fontSize:11,cursor:"pointer",flexShrink:0}}>コピー</button>
                </div>}
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
  const settings=options.settings||{};
  const ss=subs.filter(s=>s.periodId===p.id);
  if(typeof ExcelJS==="undefined"){tt("▲ ExcelJS未読込み");return;}
  const dates=gd(p.startDate,p.endDate);
  const staffAliases=options.staffAliases||{};
  // 名前→sub の逆引き（重複時は最初の1件＝ShiftEditTab の subsByKey と同じ規則）。
  // 以前はセルごとに ss.find(登録名一致||別名一致) を回しており、同一期間に登録名subと別名subが
  // 併存すると採用されるのが配列順＝Firebaseのキー順（提出時刻順ではない）で決まっていた。
  // グリッド・PDF は完全一致優先なので、同じ期間で画面とExcelが別のsubを見ることがあった（バグチェック#105）。
  const subByName=new Map();
  ss.forEach(s=>{if(s&&s.staffName&&!subByName.has(s.staffName))subByName.set(s.staffName,s);});
  const submittedNames=ss.map(s=>s.staffName);
  const unregistered=submittedNames.filter(n=>isUnregisteredSubName(n,staffList,staffAliases,p)).sort((a,b)=>a.localeCompare(b,"ja"));
  // 受け取る staffList は名簿そのもの（非表示スタッフを含む）。未登録名の判定には名簿を使い、
  // 列にするときだけ非表示スタッフを落とす。呼び出し元2箇所（シフト作成タブ・期間タブ）の
  // どちらも名簿を渡すので、絞り込みはここ1箇所で完結する。
  const sl=[...visibleStaffList(staffList,settings,p),...unregistered];
  const realStaffCount=sl.filter(n=>!isSpacer(n)).length;
  if(realStaffCount===0){tt("▲ スタッフが登録されていません");return;}
  // スタッフ35名以上: 部門仕切り用スペーサー列が常に空白のままだと、印刷時に日付を見失いやすいため日付を表示する
  const showSpacerDate=realStaffCount>34;

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
  // スタッフ名セル専用（K2・2026-10-04）。ExcelJS 4.4.0 は数値の textRotation:255 を書き出し時に捨てるので
  // aV では縦書きにならない。"vertical" なら textRotation="255" として出力される（実測）。aV は SC の既定値で
  // 他のセルにも効くため変えない
  const aName={horizontal:"center",vertical:"middle",textRotation:"vertical"};

  // 塗り
  const fSat  ={type:"pattern",pattern:"solid",fgColor:{argb:R("DDEEFF")},bgColor:{argb:"FFFFFFFF"}};
  const fHol  ={type:"pattern",pattern:"solid",fgColor:{argb:R("FFEEEE")},bgColor:{argb:"FFFFFFFF"}};
  const fYel  ={type:"pattern",pattern:"solid",fgColor:{argb:R("FFFF00")},bgColor:{argb:"FFFFFFFF"}};
  // 変更マーク（CELL_COLOR_LEGEND の "changed"）。PDF（buildShiftTableHtml の chgBg）と同じ #B7EBC6 を使う。
  // 画面・PDF・Excel の3つが同じレジストリの色を描くので、**どれか1つだけ描かない状態を作らないこと**
  // （2026-09-18 まで Excel だけがこの塗りを持たず、トリプルクリックで付けた目印が
  //   配布した Excel からだけ無言で消えていた。バグチェック#134）。
  const fChg  ={type:"pattern",pattern:"solid",fgColor:{argb:R("B7EBC6")},bgColor:{argb:"FFFFFFFF"}};
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
    SC(2,C_STAFF+i,nm,aName,fNone,
      {top:T,bottom:M,left:isFirst?T:undefined,right:T},
      {bold:true,size:9,color:{argb:staffColorArgb}});
  });
  // Row1右端(曜日:店舗名): 従業員コード行のため横結合・空欄
  SC(1,C_WD_R,null,aH,fNone,{top:M,bottom:T,left:M,right:T},{bold:false,size:8});
  SC(1,C_SHOP_R,null,aH,fNone,{top:M,bottom:T,left:T,right:T},{bold:false,size:8});
  ws.mergeCells(1,C_WD_R,1,C_SHOP_R);
  // Row2: 右端曜日・店舗名（縦書き）
  SC(2,C_WD_R,"曜日",aV,fNone,{top:T,bottom:M,left:M,right:T},{bold:true,size:14});
  SC(2,C_SHOP_R,shopName||"",aV,fNone,{top:T,bottom:M,left:T,right:T},{bold:true,size:14});

  // 呼び出し元が resolver を渡さないとき（期間管理タブのExcelボタン）に使う既定の解決。
  // シフト作成タブの adjResolver の「保存値」分岐（getStoredTime/getStoredNote/getStoredFixed）と同じ規則で、
  // **管理者調整値・休み希望(/)・「締」を必ず通す**。ここを null のままにしていた間、同じ期間でも
  // 期間管理タブから出した Excel だけがスタッフの提出値そのままになっていた（バグチェック#134）。
  // 未保存の localEdits はシフト作成タブしか持たないので、その差だけは resolver 側に残る。
  // fixed は店舗の対象判定(isFixedShiftEligibleShop)を掛け直さない——このフラグは対象店舗でしか
  // 書かれないうえ、ここへ渡る shopName は xlShopName で上書きされうる表示名で店舗の識別に使えない。
  const storedRv=(sh,field)=>{
    if(!sh)return{time:"",note:"",fixed:false};
    if(sh.adminRest&&sh.adminRest[field])return{time:"",note:"",fixed:false,rest:true};
    return{
      time:(field==="start"?(sh.adjustedStart??sh.start):(sh.adjustedEnd??sh.end))||"",
      note:(field==="start"?(sh.adjustedStartNote??sh.startNote):(sh.adjustedEndNote??sh.endNote))||"",
      fixed:!!(field==="start"?sh.adjustedStartFixed:sh.adjustedEndFixed),
    };
  };
  const shiftOf=(nm,ds)=>resolveSubByAlias(n=>subByName.get(n),nm,staffAliases)?.shifts?.[ds];
  const effResolver=resolver||((nm,ds,field)=>storedRv(shiftOf(nm,ds),field));
  // 管理者調整（resolver経由）で表示すべき値があるか。スタッフが1日休みで提出した日でも、管理者が
  // メモ・「締」・時刻を入れていればグリッド(getVal)・PDF(pdfResolve)は表示する。スタッフ提出の
  // status だけで分岐すると Excel でだけ斜線に潰れて内容が落ちる（バグチェック#54）
  const hasAdminDisp=(nm,ds)=>
    ["start","end"].some(f=>{const v=effResolver(nm,ds,f);return!!(v&&(v.time||v.note||v.fixed||v.helperText));});
  // その日に他店でのヘルプ勤務がある（シフト作成タブの adjResolver だけが返す・H2）。提出が無い人・休みの日でも
  // 出勤の分岐で書き、休みの斜線は引かない。期間管理タブの Excel（resolver なし）は提出そのままなので常に false
  const helperDayOf=(nm,ds)=>
    ["start","end"].some(f=>{const v=effResolver(nm,ds,f);return!!(v&&v.helperDay);});

  // ===== データ行 (1日=2行) =====
  dates.forEach((ds,di)=>{
    const d=pd(ds),dow=d.getDay(),day=d.getDate(),wd=WD[dow];
    const isSat=dow===6,isSunHol=dow===0||isHoliday(ds);
    const isSpecRed=isSpecialRedDate(ds,settings);
    const fill=isSat?fSat:(isSunHol||isSpecRed)?fHol:fNone; // 平日=塗りなし
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
      const sub=resolveSubByAlias(n=>subByName.get(n),nm,staffAliases),sh=sub?.shifts?.[ds];
      const isWork=sh&&sh.status==="work";
      // 変更マーク（トリプルクリックで付ける緑）。出勤・休みのどちらの分岐でも塗る
      // （PDFも同じく出勤・休み・空白のすべてに chgBg を乗せる。984dc54 で空白セルの脱落を直した経緯がある）
      const isChanged=!!(sh&&sh.changed===true);
      const ci=C_STAFF+si;
      // 上行: top:medium, bot:hair
      // 下行: top:hair, bot:thin (最終日はbot:medium)
      const botT=isLast?M:T;
      if(isSpacer(nm)){
        // スペーサー列: 35名以上は作成表両端(A/B列)と同じ結合・太枠で日にち(月なし)を表示、34名以下は従来通り空白
        if(showSpacerDate){
          SC(rT,ci,day,aH,fill,{top:M,bottom:M,left:M,right:M},{name:"Yu Gothic",bold:false,size:12,color:{argb:"FF000000"}});
          SC(rB,ci,null,aH,fill,{top:M,bottom:M,left:M,right:M});
          ws.mergeCells(rT,ci,rB,ci);
        } else {
          SC(rT,ci,null,aH,fill,{top:M,bottom:H,left:T,right:T});
          SC(rB,ci,null,aH,fill,{top:H,bottom:botT,left:T,right:T});
        }
      } else if(!sub&&!helperDayOf(nm,ds)){
        // 未提出: 空白
        SC(rT,ci,null,aH,fill,{top:M,bottom:H,left:T,right:T});
        SC(rB,ci,null,aH,fill,{top:H,bottom:botT,left:T,right:T});
      } else if(isWork||hasAdminDisp(nm,ds)||helperDayOf(nm,ds)){
        const fmtT=t=>{if(!t)return null;const[h,m]=t.split(":").map(Number);return m===0?String(h):String(h+m/60);};
        // 調整済み値の解決は必ず effResolver を通す（呼び出し元が resolver を渡さない場合も既定の
        // 解決が入るので、2つの入口が同じ中身のExcelを出す。バグチェック#134）
        const rv={st:effResolver(nm,ds,"start"),en:effResolver(nm,ds,"end")};
        const startT=rv.st.time, endT=rv.en.time;
        const sNote=rv.st.note, eNote=rv.en.note;
        // 「締」等の店舗限定固定シフトコマンドはnoteとは別枠で永続化されるため、ここで表示へ合成する
        const sFx=rv.st.fixed?FIXED_KEY:"", eFx=rv.en.fixed?FIXED_KEY:"";
        // サフィックスh/k/xがある場合は黄色塗り（締めは対象外＝PDFのセル背景判定と同じくnoteだけで決める）。
        // 変更マーク（緑）は画面（cellBgFor）・PDF（cbg）と同じく note より優先する。
        // ヘルプの合成表示（helperText・H2）も特記ありと同じ黄色。列幅は変えず、収まらなければ Excel 側で縮小して表示する
        const startFill=isChanged?fChg:((sNote||rv.st.helperText)?fYel:fill);
        const endFill=isChanged?fChg:((eNote||rv.en.helperText)?fYel:fill);
        // 時刻が無くてもnote・締めがあれば表示する。従来は時刻の有無だけで判定していたため、
        // 単独「締」やメモのみのセルがグリッド・PDFには出るのにExcelでだけ空欄に落ちていた
        // （バグチェック#52）。グリッドのgetVal・PDFのpdfResolveと同じ真偽判定に揃える
        const startDisp=rv.st.helperText||((startT||sNote||sFx)?((fmtT(startT)||"")+sNote+sFx):null);
        const endDisp=rv.en.helperText||((endT||eNote||eFx)?((fmtT(endT)||"")+eNote+eFx):null);
        // 管理者入力の休み希望(/)はフィールド単位で斜線（どちらの入口から出しても同じ）
        const diagR={up:false,down:true,style:"thin",color:{argb:R("AAAAAA")}};
        const stB={top:M,bottom:H,left:T,right:T,...(rv.st.rest?{diagonal:diagR}:{})};
        const enB={top:H,bottom:botT,left:T,right:T,...(rv.en.rest?{diagonal:diagR}:{})};
        SC(rT,ci,startDisp,rv.st.helperText?{...aH,shrinkToFit:true}:aH,startFill,stB,{name:"Yu Gothic",bold:false,size:12});
        SC(rB,ci,endDisp,rv.en.helperText?{...aH,shrinkToFit:true}:aH,endFill,enB,{name:"Yu Gothic",bold:false,size:12});
      } else if(!sh){
        // その日のエントリ自体を持たない: 空白（未提出の列と同じ）。
        // 下の「休み」へ落とすと **提出していない日が休み希望として配布Excelに出る**。
        // sub はあるのに sh が無い状態は例外ではなく常用経路で生まれる（バグチェック#137）:
        //   - 管理者がシフト作成グリッドで未提出スタッフのセルに入力すると、applyEditToSubs が
        //     **その日だけ**を持つ sub（source:"grid"）を作る＝期間の残り全日がここへ来る
        //   - スタッフの提出後に期間の終了日を延ばすと、増えた日は提出時の shifts に無い
        //     （buildShift は提出した時点の dates ぶんしか作らない）
        // 画面(holidayCellDash は `if(!sh)return false`)・PDF(`if(sh&&sh.status==="holiday")`)は
        // どちらも空白にしており、Excel だけが else に落ちていた。斜線はレジェンドで
        // 「スタッフが提出した休み希望、または管理者が / で入力した休み」と定義されているので、
        // 何も提出されていない日に出してはいけない。
        SC(rT,ci,null,aH,fill,{top:M,bottom:H,left:T,right:T});
        SC(rB,ci,null,aH,fill,{top:H,bottom:botT,left:T,right:T});
      } else {
        // 休み: 斜線（右上→左下）。休みの日に付けた変更マークも画面・PDFと同じく塗る
        const diagU={up:false,down:true,style:"thin",color:{argb:R("AAAAAA")}};
        const restFill=isChanged?fChg:fill;
        SC(rT,ci,null,aH,restFill,{top:M,bottom:H,left:T,right:T,diagonal:diagU});
        SC(rB,ci,null,aH,restFill,{top:H,bottom:botT,left:T,right:T,diagonal:diagU});
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
function StaffTab({staffList,onSave,tt,plan="free",onUpgrade,onRenameStaff,settings={},onSaveSettings,subs=[],periods=[],savePeriods,ownerReadOnly=false,shopId="",shopName="",linkedShops=[],companyShops=[],
  pay=PAY_OFF,laborMonths:lm=LABOR_MONTHS_OFF,actuals:act=ACTUALS_OFF,staffLinks:sl=STAFF_LINKS_OFF,mirrorPeople=null,companyLinked=false,onOpenPay,onOpenPayroll,initialEditKey=null,onInitialEditConsumed}){
  const[newName,setNewName]=useState("");
  // 削除確認ポップアップ。対象は index ではなく「スタッフ名」で持つ（下のコメントと同じ理由）。
  const[delTarget,setDelTarget]=useState(null);
  // 「どの期間まで名前を残すか」の選択位置（delPeriodChoices の1始まりindex）。0=どの期間にも残さない。
  // 範囲は時系列で読む＝選んだ期間と **それより古い** 期間に残す（685c219。retainedPeriodIds・app-utils.js）。
  // 初期値は del() がポップアップを開くたびに defaultKeepCount で入れ直す（ここの 0 は使われない）。
  const[delKeepCount,setDelKeepCount]=useState(0);
  // 非表示ポップアップ。対象は削除ポップアップと同じ理由で「スタッフ名」で持つ（indexで持たない）。
  // mode は開いた時点の状態で決まる（"hide"=これから非表示にする / "show"=解除する）。
  // choiceIdx は delPeriodChoices（最新3期間・startDate降順）の0始まりindexで、0が最新期間。
  const[hideTarget,setHideTarget]=useState(null);
  const[hideMode,setHideMode]=useState("hide");
  const[hideChoiceIdx,setHideChoiceIdx]=useState(0);
  // 属性変更ポップアップ。対象は上の2つと同じ理由で「スタッフ名」で持つ（indexで持たない）。
  // attrNext は選ばれた新しい属性ID、attrKeepCount は「どの期間まで旧属性のままにするか」の
  // 選択位置（delPeriodChoices の1始まりindex）。削除ポップアップと違い 0（＝残さない）は無い
  // ＝3択（2026-09-08 ユーザー決定）。属性は必ずどこかの期間まで旧属性のまま残る。
  const[attrTarget,setAttrTarget]=useState(null);
  const[attrNext,setAttrNext]=useState("");
  const[attrKeepCount,setAttrKeepCount]=useState(1);
  // 編集中・別名パネル・ポジションパネルの対象は「スタッフ名」で持つ（indexで持ってはいけない）。
  // indexで持つと、パネルを開いたまま別の行を削除する／並べ替える／他端末がstaffListを変えると、
  // 同じindexが別人を指すようになり、開いたままの編集欄が別人の行に移って保存が別人を書き換える
  // （実測: [田中,佐藤,鈴木,高橋,渡辺] で高橋を編集中に田中を削除すると、"高橋"を入れた編集欄が
  // 渡辺の行に移り、保存すると onRenameStaff("渡辺","高橋 太郎") が走る）。名前は add/confirmEdit が
  // 重複を禁止し、空白列も "__spacer__"+genToken() で一意なので、キーとして安全に使える。
  const[editKey,setEditKey]=useState(null);
  const[editName,setEditName]=useState("");
  const[paidKey,setPaidKey]=useState(null);   // 有給日数パネルを開いているスタッフ名
  const[posKey,setPosKey]=useState(null); // ポジション編集中のスタッフ名
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
  const staffPositions=settings.staffPositions||{};
  const savePositions=(staffName,meal,arr)=>{
    const cur=staffPositions[staffName]||{lunch:[],dinner:[]};
    onSaveSettings&&onSaveSettings({...settings,staffPositions:{...staffPositions,[staffName]:{...cur,[meal]:arr}}});
  };
  // キッチン/ホールで同名ポジションを登録できる（追加時の重複チェックはセクション内のみ）ため、
  // 合算リストは必ず重複排除する。しないと同じ「＋ ○○」ボタンが2つ並び、key重複でReactが警告する。
  const allPositions=[...new Set([...((settings.positions&&settings.positions.kitchen)||[]),...((settings.positions&&settings.positions.hall)||[])])];
  // 最新期間の提出名のうち、未登録かつ未エイリアスのもの。
  // 判定は提出一覧の「別名を登録」と同じ述語（isUnregisteredSubName・app-utils.js）に通す。
  // その期間の keepStaff に載っている人＝期限付き削除で名前を残した人は名簿にいる扱いなので、
  // ここの別名候補にも出さない（出すと、残すと決めた本人を自分自身の別名として登録させる導線になる）。
  const latestPeriod=[...periods].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate))[0];
  const unregisteredNames=useMemo(()=>{
    if(!latestPeriod)return[];
    const names=subs.filter(s=>s.periodId===latestPeriod.id).map(s=>s.staffName);
    return[...new Set(names)].filter(n=>isUnregisteredSubName(n,staffList,staffAliases,latestPeriod));
  },[subs,latestPeriod,staffList,staffAliases]);
  const lim=PLAN_LIMITS[plan]?.staff??10;
  const staffColors=settings.staffColors||{};
  const toggleColor=name=>{
    const cur=staffColors[name]||"black";
    const next=cur==="black"?"red":"black";
    onSaveSettings&&onSaveSettings({...settings,staffColors:{...staffColors,[name]:next}});
  };
  // 非表示は「削除せずにシフト表からだけ外す」操作。staffList には手を触れないので、配布済みの提出URL・
  // 別名・既存の提出データの紐付けは全部生きたまま、シフト作成グリッド・Excel・PDF からだけ名前が消える
  // （実際に落としているのは visibleStaffList・app-utils.js の1箇所）。プラン制限の人数には従来どおり数える
  // ＝登録は残っているため。
  // **範囲で持つ**（2026-09-06 決定）: 非表示にした時点の最新期間から、解除した時点の最新期間の
  // 1つ手前までが非表示になり、解除した期間からは再び出る。境界はどちらも latestPeriod の startDate。
  // 範囲の読み書きは app-utils.js（hideStaffFrom / showStaffFrom）に寄せてあり、ここは入口だけ持つ。
  const hiddenNow=name=>isStaffHiddenNow(settings,name);
  const openHiddenFrom=name=>{
    const r=staffHiddenRanges(settings,name).find(x=>x.to==null);
    return r?r.from:null;
  };
  const periodLabelOfStart=sd=>{
    const p=periods.find(x=>x&&x.startDate===sd);
    return (p&&p.label)||sd||"";
  };
  // 開始・解除の期間は押した瞬間に確定させず、必ずポップアップで選ばせる（2026-09-06 決定）。
  // 既定は最新期間で、そのまま確定すれば「いま非表示にする／いまから戻す」になる。
  // 境界を1期間ずらしたいことが実務では普通にあり（先に伝えられていた休職の開始が前の期間だった等）、
  // あとから直す導線が無いと、範囲を直すためだけに非表示と解除を往復することになる。
  const openHiddenDialog=name=>{
    setHideTarget(name);
    setHideMode(hiddenNow(name)?"show":"hide");
    setHideChoiceIdx(0);
  };
  const confirmHidden=()=>{
    const n=hideTarget;
    if(!n){setHideTarget(null);return;}
    // 期間が1件も無ければ選択肢も無い。その場合は下限・上限を書けないので null で従来どおり扱う
    // （非表示は全期間・解除は指定ごと取り消し）。
    const p=delPeriodChoices[hideChoiceIdx];
    const sd=p?p.startDate:null;
    // 解除の開始が非表示の開始と同じか手前なら、範囲は空になって捨てられる＝非表示そのものの取り消し。
    // 「戻しました」と言うと、実際には何も隠されていない状態を「一部は非表示のまま」と誤解させる。
    const cancels=hideMode==="show"&&hideStaffRangeWouldVanish(n,sd);
    const ns=hideMode==="hide"?hideStaffFrom(settings,n,sd):showStaffFrom(settings,n,sd);
    setHideTarget(null);
    if(ns===settings){tt("変更はありません");return;}
    onSaveSettings&&onSaveSettings(ns);
    const lbl=sd?`「${periodLabelOfStart(sd)}」`:"";
    if(hideMode==="hide")tt(sd?`「${n}」を${lbl}以降のシフト表から非表示にしました`:`「${n}」をシフト表から非表示にしました`);
    else if(cancels)tt(`「${n}」の非表示を取り消しました`);
    else tt(`「${n}」を${lbl}から表示に戻しました（それより前の期間は非表示のままです）`);
  };
  // 解除の開始をこの期間にすると、非表示の範囲が丸ごと消えるか（＝何も隠していない状態になるか）。
  // ポップアップの説明文とトーストの両方が同じ判定を使う。
  const hideStaffRangeWouldVanish=(name,startDate)=>{
    if(!startDate)return true; // 上限を書けない＝範囲ごと捨てる
    const from=openHiddenFrom(name);
    return from!=null&&startDate<=from;
  };
  // ===== 属性の変更（旧属性をどの期間まで残すか）=====
  // 属性は押した瞬間には反映せず、必ずポップアップで「どの期間まで旧属性のままにするか」を選ばせる
  // （2026-09-08 ユーザー決定）。夏休みだけ上限の大きい属性にして元へ戻すと、戻した瞬間に
  // 配り終えた期間まで新しい上限で再判定され、過去のシフト表が上限超過エラーになるため。
  // 旧属性は選んだ期間とそれより古い期間の period.keepAttrs へ書く（読む側は app-utils.js の
  // applyKeepAttrs＝resolvePeriodMaster 経由でシフト作成タブ・ヒートマップ・集計・Excel・PDF に効く）。
  const attrLabelOf=id=>{const f=getAttrOptions(settings).find(([v])=>v===id);return f?f[1]:(STAFF_TYPE_LABELS[id]||id||"");};
  const curAttrOf=n=>(settings.staffAttributes||{})[n]||"parttime";
  const saveAttr=(n,v)=>{
    const attrs={...(settings.staffAttributes||{})};
    if(v)attrs[n]=v;else delete attrs[n];
    onSaveSettings&&onSaveSettings({...settings,staffAttributes:attrs});
  };
  const openAttrDialog=(n,v)=>{
    if(!v||v===curAttrOf(n))return;
    // 期間が1件も無ければ旧属性を書き置く先が無い。過去のシフト表も存在しないので従来どおり即反映する。
    if(!delPeriodChoices.length){saveAttr(n,v);tt(`✓「${n}」を${attrLabelOf(v)}に変更しました`);return;}
    setAttrTarget(n);setAttrNext(v);
    // 既定は「いちばん新しい **終了済み** の期間まで旧属性のまま」＝削除ポップアップと同じ考え方。
    // 9月に夏休み属性を戻すなら 8月後半（終了済み）までが旧属性、進行中の9月前半から新属性になる。
    // 終了済みが1つも無ければ 0 が返るが 0 の選択肢は無いので、最新期間（＝1）へ丸める。
    setAttrKeepCount(Math.max(1,defaultKeepCount(delPeriodChoices,todayStr)));
  };
  const confirmAttr=()=>{
    const n=attrTarget,v=attrNext;
    if(!n||!v){setAttrTarget(null);return;}
    const old=curAttrOf(n);
    const keepIds=new Set(retainedPeriodIds(delPeriodChoices,attrKeepCount));
    let wrote=0;
    if(!ownerReadOnly&&savePeriods&&keepIds.size){
      const next=periods.map(p=>{
        if(!p||!keepIds.has(p.id))return p;
        // **既に指定のある期間は上書きしない**。そこに入っている値は前回の属性変更で
        // 「その期間に効いていた属性」として書き置いたものなので、いまの属性で塗り替えると
        // 過去の記録のほうが壊れる（足すだけで消さない＝keepStaff と同じ原則）。
        if((keepAttrsOf(p)||{})[n])return p;
        wrote++;
        return{...p,keepAttrs:{...(keepAttrsOf(p)||{}),[n]:old}};
      });
      if(wrote)savePeriods(next);
    }
    saveAttr(n,v);
    setAttrTarget(null);
    const last=delPeriodChoices[attrKeepCount-1];
    tt(wrote
      ?`✓「${n}」を${attrLabelOf(v)}に変更しました（「${last?(last.label||"(名称なし)"):""}」までは${attrLabelOf(old)}のままです）`
      :`✓「${n}」を${attrLabelOf(v)}に変更しました`);
  };
  const startEdit=n=>{setEditKey(n);setEditName(n);};
  const cancelEdit=()=>{setEditKey(null);setEditName("");};
  // 賃金設定ページから戻ったら、開いていた編集モーダルを開き直す（全画面の間このタブはアンマウントされている）
  useEffect(()=>{
    if(!initialEditKey)return;
    if(staffList.includes(initialEditKey))startEdit(initialEditKey);
    onInitialEditConsumed&&onInitialEditConsumed();
  },[initialEditKey]);
  const[payCodeModal,setPayCodeModal]=useState(false);
  // スタッフ名は STAFF_KEYED_SETTING_MAPS の各マップ（+ overtimeSettings.byStaff）で
  // Firebaseのキーになる（一覧は app-utils.js のその定数が正本）。禁止文字を
  // 含む名前を通すと、色や属性を1つ設定した瞬間に settings の set() が同期例外を投げ、
  // fbW の .catch では拾えないまま保存が黙って失われる（画面とlocalStorageだけが更新される）。
  // ID生成側（genSecureId・app-utils.js）は既に同じ集合を除外している。入口をそちらに揃える。
  const rejectBadName=n=>{
    const bad=firebaseKeyForbiddenChars(n);
    if(!bad.length)return false;
    tt(`▲ 名前に使えない文字があります（${bad.join(" ")}）`);
    return true;
  };
  // 他人の別名と同じ名前は登録できない。resolveAlias（app-utils.js）は入力名が誰かの別名なら
  // 登録名へ寄せるため、通してしまうと本人が自分の名前を入力しても別人の提出になり、
  // 管理者側のその人の行は空のままになる（バグチェック#107 で実測）。
  // addAlias は逆向き（登録名と同じ別名）を既に禁じている。同じ不変条件の反対側の入口。
  const rejectAliasCollision=(n,selfName)=>{
    const owner=aliasOwnerOf(n,staffAliases,selfName);
    if(!owner)return false;
    tt(`▲「${n}」は ${owner} さんの別名として登録されています`);
    return true;
  };
  const confirmEdit=n=>{
    const trimmed=editName.trim();
    if(!trimmed){tt("▲ 名前を入力してください");return;}
    if(staffList.includes(trimmed)&&trimmed!==n){tt("▲ 既に登録されている名前です");return;}
    if(trimmed===n){cancelEdit();return;}
    if(rejectBadName(trimmed))return;
    if(rejectAliasCollision(trimmed,n))return;
    onRenameStaff&&onRenameStaff(n,trimmed);
    setEditKey(null);setEditName("");
  };
  // 従業員番号（数字だけ）で企業内の他店舗から呼び出して登録する（2026-09-28）。対象は企業の写しの連携店舗だけ
  // （companyShops。企業に入れていない自分の店舗は読まない）。名前・番号・属性・所属店舗を揃え、有給の付与日数は持ち込まない
  // （残数は所属店舗の期間データから数えるので、ヘルプ先にも持つと残数が2つできる）。
  const[lookupNum,setLookupNum]=useState("");
  const[lookupBusy,setLookupBusy]=useState(false);
  const[lookupChoices,setLookupChoices]=useState(null);
  const registerLookup=m=>{
    const name=m.name;
    if(staffList.includes(name)){tt("▲ 既に登録されています");return;}
    if(rejectBadName(name))return;
    if(rejectAliasCollision(name,null))return;
    if(staffList.filter(n=>!isSpacer(n)).length>=lim){onUpgrade&&onUpgrade({type:"staff",limit:lim,plan});return;}
    const num=lookupNum.trim();
    const attrOk=m.attrId&&(BUILTIN_TYPES.includes(m.attrId)||((settings.staffTypeLimits||{})[m.attrId]!==undefined));
    const home={...(settings.staffHomeShop||{})};
    if(m.homeShopId&&m.homeShopId!==shopId)home[name]=m.homeShopId;else delete home[name];
    ph("staff_added",{staff_count:staffList.filter(n=>!isSpacer(n)).length+1,via:"number_lookup"});
    sl.drop([name]); // 同じ名前に残っていたマイシフトの紐付け（削除の追随が届かなかったもの）を外す（E2）
    onSave([...staffList,name]);
    onSaveSettings&&onSaveSettings({...settings,
      staffNumbers:{...(settings.staffNumbers||{}),[name]:num},
      ...(attrOk?{staffAttributes:{...(settings.staffAttributes||{}),[name]:m.attrId}}:{}),
      staffHomeShop:home});
    setLookupNum("");setLookupChoices(null);
    tt(`✓ ${name}（${m.homeShopName||"所属店舗"}）を追加しました`);
  };
  const lookupByNumber=async()=>{
    const num=lookupNum.trim();
    if(!/^\d+$/.test(num)){tt("▲ 従業員番号は数字だけで入力してください");return;}
    if(!firebaseDB){tt("✕ 読み込めませんでした（オフライン）");return;}
    setLookupBusy(true);setLookupChoices(null);
    const failed=[];
    const shops=(await Promise.all((companyShops||[]).map(async s=>{
      try{
        const [st,nums,attrs,homes]=await Promise.all(["staff","settings/staffNumbers","settings/staffAttributes","settings/staffHomeShop"]
          .map(p=>firebaseDB.ref(`shops/${s.id}/${p}`).once("value").then(x=>x.val())));
        return{id:s.id,name:s.name,staff:st||[],staffNumbers:nums||{},staffAttributes:attrs||{},staffHomeShop:homes||{}};
      }catch{failed.push(s.name||s.id);return null;}
    }))).filter(Boolean);
    setLookupBusy(false);
    const matches=mergeStaffMatches(findStaffByNumber(num,shops));
    if(failed.length)tt(`▲ 読み込めなかった店舗があります（${failed.join("・")}）`);
    if(matches.length===0){if(!failed.length)tt(`▲ 従業員番号 ${num} のスタッフは見つかりませんでした`);return;}
    if(matches.length===1){registerLookup(matches[0]);return;}
    setLookupChoices(matches);
  };
  const add=()=>{
    if(!newName.trim()){tt("▲ 名前を入力");return;}
    if(staffList.includes(newName.trim())){tt("▲ 既に登録されています");return;}
    if(rejectBadName(newName.trim()))return;
    if(rejectAliasCollision(newName.trim(),null))return;
    if(staffList.filter(n=>!isSpacer(n)).length>=lim){onUpgrade&&onUpgrade({type:"staff",limit:lim,plan});return;}
    ph("staff_added",{staff_count:staffList.filter(n=>!isSpacer(n)).length+1});
    // 同じ名前に残っていたマイシフトの紐付け（前任者の削除の追随が届かなかったもの）を外す。外さないと前任者のアカウントが
    // 新しく登録した同名の人のシフトを見る（E2）。通常は削除の時点で外しているので何もしない
    sl.drop([newName.trim()]);
    onSave([...staffList,newName.trim()]);setNewName("");tt(`✓ ${newName.trim()} を追加しました`);
  };
  // 他の破壊的操作（店舗 / 期間 / 提出 / ポジション）は全て confirm で対象を示すのに、
  // スタッフ削除だけが素通りだった。ここは1行に 別名/ポジション/編集/削除 が並ぶ最も密なリスト（バグチェック#74:
  // スタッフタブは43要素中39個が44px未満）で、押した瞬間に対象がシフト作成の列（gridStaff）と
  // ヒートマップ（heatData）から消える。件数は「提出済みのシフト」の語に合わせて source:"grid"
  // （管理者がセルに直接入力した分）を除く＝提出一覧・SmModal と同じ式にする（食い違うとバグチェック#56 の再来）。
  // 別名ぶんも必ず数える: registerAlias は sub.staffName を書き換えず staffAliases に登録するだけなので、
  // 別名で出された提出は staffName に別名が入ったまま残る。一方 提出一覧は resolveAlias 済みの名前で表示し、
  // Excel（expXl）も別名を登録名の列に出す。名前一致だけで数えると、この文が名指しした2つの出力に
  // 残るものを数え落とす（全提出が別名ぶんなら 0件 になり警告文ごと消える）。他4箇所（app-staff.js の未提出リスト /
  // expXl / 提出一覧 / _getSubForPeriod）は既に別名込みで数えており、ここだけが名前一致だった。
  // 提出データ自体は del では消えない（onSave は staffList のみ）ため「残る」と明示する。取り消し不能とは書かない
  // ——同名で追加し直せば設定マップもsubsも復帰し、失われるのは並び順だけである。
  // 削除ポップアップに出す期間: 最新から3つまで（startDate降順）。
  // 4つ目以降を出さないのは、そこまで遡ると必ず確定済みの設定期間に入っており、かつ最短（2週間単位）でも
  // 1ヶ月半前になるため、名前の出し分けを変える必要が実務上考えられないから。
  const delPeriodsSorted=useMemo(()=>
    [...periods].filter(p=>p&&p.id).sort((a,b)=>String(b.startDate||"").localeCompare(String(a.startDate||"")))
  ,[periods]);
  const delPeriodChoices=useMemo(()=>delPeriodsSorted.slice(0,3),[delPeriodsSorted]);
  // 選べない4つ目以降で列が実際に残るのは「終了済み **かつ** 写し(snapshot)を持つ」期間だけ
  // （resolvePeriodMaster は locked のときしか写しを採用しない）。写しはシフト作成タブをその期間の
  // 終了前に開いたときにだけ撮られるので、一度も開かないまま終わった期間・この機能より前に終わった
  // 期間は写しを持たず、そこからは列が消える。ポップアップの注記はこの実測に合わせて出し分ける
  // （「古い期間は確定済みなので変わりません」と無条件に書くと、その場合に嘘になる）。
  const delOlder=useMemo(()=>{
    const t=fd(new Date());
    const rest=delPeriodsSorted.slice(3);
    const kept=rest.filter(p=>isPeriodEnded(p,t)&&p.snapshot).length;
    return{kept,lost:rest.length-kept};
  },[delPeriodsSorted]);
  const delSubCount=n=>subs.filter(s=>(s.staffName===n||(staffAliases[n]||[]).includes(s.staffName))&&s.source!=="grid").length;
  // keepStaff の要素（文字列の旧形式 / {name,index}）を素直な形に均す
  const keepEntriesOf=p=>{
    const raw=p&&p.keepStaff;
    const arr=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?Object.values(raw):[]);
    return arr.map(e=>(typeof e==="string"?{name:e,index:null}:(e&&typeof e==="object"&&typeof e.name==="string"?{name:e.name,index:Number.isInteger(e.index)?e.index:null}:null))).filter(Boolean);
  };
  // 「削除済みだが、シフト表には残している人」。スタッフ一覧に元の位置のまま出し続けて、
  // もう一度「削除」を押せば同じポップアップで範囲の変更・解除・削除の取り消しができる。
  // **残した期間の最終日が過ぎたら一覧から自動で消える**（そこから先は変更する必要がないため）。
  // 一覧から消えても keepStaff は残る＝終わった期間のシフト表には名前が載ったまま、が意図した状態。
  const todayStr=fd(new Date());
  const retained=useMemo(()=>{
    const m=new Map();
    delPeriodChoices.forEach((p,pi)=>keepEntriesOf(p).forEach(e=>{
      if(staffList.includes(e.name))return; // 同名で登録し直された人は通常の行として出る
      const cur=m.get(e.name)||{name:e.name,index:e.index,upto:0,labels:[],maxEnd:""};
      if(cur.index==null&&e.index!=null)cur.index=e.index;
      // 選んだ位置＝残っている期間のうち **いちばん新しいもの**（そこから古い側へ続く）。
      // 「削除」を押し直したときにポップアップが同じ選択肢を選んだ状態で開くための値なので、
      // 最大ではなく最小を採る（最大だといちばん古い期間が選ばれた状態で開いてしまう）。
      cur.upto=cur.upto?Math.min(cur.upto,pi+1):pi+1;
      cur.labels.push(p.label||"(名称なし)");
      if((p.endDate||"")>cur.maxEnd)cur.maxEnd=p.endDate||"";
      m.set(e.name,cur);
    }));
    // 残した期間のうち最も遅い最終日がまだ来ていない人だけ一覧に出す（"YYYY-MM-DD"は辞書順=日付順）
    return[...m.values()].filter(r=>r.maxEnd&&todayStr<=r.maxEnd);
  },[delPeriodChoices,staffList,todayStr]);
  const retainedOf=n=>retained.find(r=>r.name===n)||null;
  // 期限切れ＝残した期間の最終日を過ぎて、上の retained から落ちた人（＝一覧から行が消えた人）。
  // retained と同じ材料（最新3期間の keepStaff）から、日付の条件だけを反転して拾う。
  const expiredRetained=useMemo(()=>{
    const m=new Map();
    delPeriodChoices.forEach(p=>keepEntriesOf(p).forEach(e=>{
      if(staffList.includes(e.name))return; // 同名で登録し直された人は現役なので触らない
      const cur=m.get(e.name)||{name:e.name,maxEnd:""};
      if((p.endDate||"")>cur.maxEnd)cur.maxEnd=p.endDate||"";
      m.set(e.name,cur);
    }));
    return[...m.values()].filter(r=>r.maxEnd&&todayStr>r.maxEnd);
  },[delPeriodChoices,staffList,todayStr]);
  // スタッフ名をキーに持つ設定マップから、指定した名前をまとめて落とした settings を返す。
  // 変化が無ければ null（無駄な書き込みを出さないため。後始末のuseEffectが収束する根拠でもある）。
  const settingsWithoutStaff=names=>{
    const targets=(names||[]).filter(Boolean);
    if(!targets.length)return null;
    const dropKeys=map=>{
      if(!map)return null;
      const hit=targets.filter(t=>map[t]!==undefined);
      if(!hit.length)return null;
      const m={...map};hit.forEach(t=>delete m[t]);return m;
    };
    const ns={...settings};let touched=false;
    // 対象マップは app-utils.js の STAFF_KEYED_SETTING_MAPS を正とする。ここに同じ一覧を
    // 書き写すと、改名（renameStaffInSettings）と削除（ここ）で守る範囲が黙って食い違う
    // ——#105〜#107 が3回続けて踏んだ「同じ不変条件に入口が2つあり、片方だけが知っている」形。
    STAFF_KEYED_SETTING_MAPS.forEach(k=>{
      const m=dropKeys(settings[k]);if(m){ns[k]=m;touched=true;}
    });
    const ot=settings.overtimeSettings&&dropKeys(settings.overtimeSettings.byStaff);
    if(ot){ns.overtimeSettings={...settings.overtimeSettings,byStaff:ot};touched=true;}
    return touched?ns:null;
  };
  // 行が一覧から自動で消えるタイミングでの設定の後始末（2026-08-31 決定4・案A）。
  // confirmDelete は「どの期間にも残さない」ときにしか消さないので、「残す」を選んだ人は
  // 期限切れで行が消えたあとも設定7マップと別名が残り続けていた（#79 の②がこの経路でだけ生き残る）。
  // 実行主体は **オーナー端末がスタッフタブを開いたとき1回**。閲覧専用端末は settings への
  // 書き込みがルールで拒否されるので走らせない（拒否のトーストが出るだけになる）。
  // 収束の根拠: 書いたあとに再実行されても settingsWithoutStaff が null を返すので二度書かない。
  // 対象は最新3期間の keepStaff に載っている人だけ。それより古い期間にしか残っていない人は
  // そもそも一覧に出たことがないので、ここでは触らない（写しの側で名前が要る可能性を残す）。
  useEffect(()=>{
    if(ownerReadOnly||!onSaveSettings||expiredRetained.length===0)return;
    const ns=settingsWithoutStaff(expiredRetained.map(r=>r.name));
    if(ns)onSaveSettings(ns);
    // 賃金も同じタイミングで消す（private/pay・P6a）。購読が届く前は何も消さず、届いたら（pay.map の変化で）もう一度通る
    pay.drop(expiredRetained.map(r=>r.name));
    lm.drop(expiredRetained.map(r=>r.name)); // 人×月の所定（laborMonths・P3）も同じ
    act.drop(expiredRetained.map(r=>r.name)); // 実績（actuals・P4）も同じ
    sl.drop(expiredRetained.map(r=>r.name)); // マイシフトの紐付け（staffLinks・E2）。削除の時点で外しているので通常は何もしない
  },[expiredRetained,ownerReadOnly,settings,pay.map,lm.map,act.map,sl.map]);
  // スタッフ一覧に描く行の並び。実スタッフは staffList の index をそのまま持たせる
  // （ドラッグ・編集・削除は従来どおり staffList の index で動くため、意味を一切変えない）。
  // **並びはシフト作成グリッドと同じ関数（mergeKeepStaff）に決めさせる**。ここで独自に
  // index の昇順で splice してはいけない: 各 index は「その人を削除した瞬間の一覧」での位置であって
  // 元の一覧での位置ではないため、昇順に入れると座標系がズレてグリッド・Excel・PDF と別の場所に行が出る
  // （実測: ["A","B","_spacer","C"] から B→C の順に削除すると、グリッドは ["A","B","_spacer","C"] に
  //  戻るのに一覧は ["A","B","C","_spacer"] ＝ C がスペーサーを跨いでキッチン側の行になる。
  //  スペーサーが無くても ["A","B","C"] が一覧では ["A","C","B"] になる）。
  // 並び順の材料には **最も古い選択肢の keepStaff** を使う。retainedPeriodIds はどの選択位置でも
  // 最古の期間を必ず含む（slice(k-1) は末尾を落とさない）ので、そこに retained 全員が削除順で並んでいる。
  const displayRows=useMemo(()=>{
    const retMap=new Map(retained.map(r=>[r.name,r]));
    const order=keepEntriesOf(delPeriodChoices[delPeriodChoices.length-1]).filter(e=>retMap.has(e.name));
    // 期間を消した等で最古の選択肢に載っていない人は取りこぼさず末尾へ回す
    retained.forEach(r=>{if(!order.some(e=>e.name===r.name))order.push({name:r.name,index:r.index});});
    // mergeKeepStaff は staffList の並びを変えずに名前を差し込むだけなので、
    // 差し込み以外の行は staffList の index と1対1で対応する
    let si=0;
    return mergeKeepStaff(staffList,{keepStaff:order}).map(n=>{
      const r=retMap.get(n);
      return r?{kind:"retained",n,r}:{kind:"staff",n,i:si++};
    });
  },[staffList,retained,delPeriodChoices]);
  const del=i=>{
    const n=staffList[i];
    // 空白列は表示上の区切りでしかなく、期間ごとの出し分けを持たないので従来どおり即削除する
    if(isSpacer(n)){const a=[...staffList];a.splice(i,1);onSave(a);tt("削除しました");return;}
    setDelTarget(n);
    // 既定は「いちばん新しい **終了済み** の期間まで残す」（2026-08-31 決定・案B）。
    // 何も選ばずに確定したときに、配り終えた期間には名前が残り、これから配る期間からは消える。
    // 終了済みの期間が無ければ 0＝残さない。
    setDelKeepCount(defaultKeepCount(delPeriodChoices,todayStr));
  };
  // 削除済み・表示中の人の行から「削除」を押したとき。同じポップアップを今の範囲を選んだ状態で開く
  const editRetention=n=>{setDelTarget(n);setDelKeepCount(retainedOf(n)?.upto||0);};
  // 削除そのものを取り消してスタッフ一覧へ戻す。記録しておいた位置に差し戻し、keepStaff は全て外す
  // （通常のスタッフに戻る＝以後は普通に全期間へ出るので、残す指定を持ち続ける意味がない）。
  const undoDelete=()=>{
    const n=delTarget;const r=retainedOf(n);
    if(!n||!r){setDelTarget(null);return;}
    if(savePeriods&&delPeriodChoices.length){
      const targetIds=new Set(delPeriodChoices.map(p=>p.id));
      savePeriods(periods.map(p=>{
        if(!p||!targetIds.has(p.id))return p;
        const rest=keepEntriesOf(p).filter(e=>e.name!==n);
        if(rest.length===keepEntriesOf(p).length)return p;
        const np={...p};
        if(rest.length)np.keepStaff=rest;else delete np.keepStaff;
        return np;
      }));
    }
    const at=(r.index==null||r.index>staffList.length)?staffList.length:r.index;
    const a=[...staffList];a.splice(at,0,n);
    onSave(a);
    setDelTarget(null);
    tt(`✓「${n}」の削除を取り消しました`);
  };
  // 削除の実行。名前を残すと選んだ期間には period.keepStaff へ名前を足す（写し=snapshot は触らない）。
  // keepStaff は resolvePeriodMaster（app-utils.js）が名簿へマージするので、シフト作成グリッド・
  // ヒートマップ・Excel・PDF に列が残る。スタッフ一覧と提出一覧は生の staffList を見るので従来どおり消える。
  const confirmDelete=()=>{
    const n=delTarget;
    if(!n)return;
    const inList=staffList.includes(n);
    const already=retainedOf(n);
    // 位置は「確定を押した時点」の並びから取る。ポップアップを開いている間に他端末が並べ替えたら、
    // 開いたときの位置ではなく今の位置が正しい（対象の同一性は名前で持っているのでズレない）。
    // 既に削除済みの人（範囲の変更）は、そのとき記録した位置をそのまま引き継ぐ。
    const keepIdx=inList?staffList.indexOf(n):(already&&already.index!=null?already.index:null);
    if(!inList&&!already){setDelTarget(null);tt("▲ この人は既に一覧から削除されています");return;}
    // 「この期間まで残す」は時系列で読む＝選んだ期間とそれより古い方に残し、新しい方からは外す
    // （retainedPeriodIds・app-utils.js に理由つきで切り出してある）。
    const keepIds=new Set(retainedPeriodIds(delPeriodChoices,delKeepCount));
    // 最新3期間だけを対象に、選んだ期間へは足し、選ばなかった期間からは外す（＝取り消しもここで効く）。
    // 4つ目以降の期間の keepStaff には触れない（ポップアップに出していない＝変更対象ではない）。
    if(savePeriods&&delPeriodChoices.length){
      const targetIds=new Set(delPeriodChoices.map(p=>p.id));
      let changed=false;
      const next=periods.map(p=>{
        if(!p||!targetIds.has(p.id))return p;
        const cur=keepEntriesOf(p);
        const has=cur.some(e=>e.name===n);
        const want=keepIds.has(p.id);
        if(has===want)return p;
        changed=true;
        if(want)return{...p,keepStaff:[...cur,{name:n,index:keepIdx}]};
        const rest=cur.filter(e=>e.name!==n);
        const np={...p};
        // Firebaseは空配列をキーごと落とすので、0件になったらこちらでも消しておく（読み戻しと形を揃える）
        if(rest.length)np.keepStaff=rest;else delete np.keepStaff;
        return np;
      });
      if(changed)savePeriods(next);
    }
    // 名前で除外する（index の splice にしない。ポップアップが開いている間に他端末が並べ替えると別人が消える）
    if(inList)onSave(staffList.filter(x=>x!==n));
    // マイシフトの紐付け（staffLinks・第2部 E2）は**削除した時点で外す**（名前を残す期間を選んでも外す）。
    // 残すと、同じ名前で別の人を登録したときに前任者のアカウントがその人のシフトを見る。削除を取り消しても紐付けは戻らない
    sl.drop([n]);
    // スタッフ名をキーに持つ設定マップの後始末（バグチェック#79）。
    // リネーム(onRenameStaff)は7マップを漏れなく移し替えるのに、削除は何も触っていなかったため
    // ①同名で追加し直すと前任者の社員番号・属性・ポジションをそのまま継承する
    // ②退職者の別名が staffAliases に残り、URLを持ったままの本人の提出が登録名へ解決され続ける
    // という差が出ていた。**一覧から完全に消えるとき（どの期間にも残さない）だけ**消す:
    // 期間に名前を残す場合はシフト表の表示にその設定（退勤延長・従業員番号）が要るうえ、
    // 一覧に行が残っている間は「削除を取り消す」で戻せるため、ここでは消さない。
    // 残した期間の最終日を過ぎて行が消えたときは、上の useEffect が同じ後始末を行う（決定4）。
    if(onSaveSettings&&keepIds.size===0){
      const ns=settingsWithoutStaff([n]);
      if(ns)onSaveSettings(ns);
      pay.drop([n]); // 賃金（private/pay・P6a）も同じ条件で消す
      lm.drop([n]); // 人×月の所定（laborMonths・P3）も同じ条件で消す
      act.drop([n]); // 実績（actuals・P4）も同じ条件で消す
    }
    setDelTarget(null);
    const kept=keepIds.size;
    // 「直近N期間」は新しい側から数える言い方で、時系列の指定と食い違う。最後に残る期間を名指しする。
    const keptLabel=delKeepCount>=1&&delPeriodChoices[delKeepCount-1]?(delPeriodChoices[delKeepCount-1].label||"(名称なし)"):"";
    if(!inList)tt(kept?`表示範囲を変更しました（「${keptLabel}」まで）`:"シフト表から外しました");
    else tt(kept?`削除しました（「${keptLabel}」までのシフト表には名前を残します）`:"削除しました");
  };
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
      {/* 削除確認ポップアップ。confirm() では選択肢を出せないためモーダルにしてある。
          「どの期間まで名前を残すか」は時系列の選択（k個目を選ぶと、その期間とそれより古い期間に残り、
          それより新しい期間からは消える）。新しい側から累積する読み方は 685c219 で廃止した。 */}
      {delTarget&&(()=>{
        const sc=delSubCount(delTarget);
        // 既にスタッフ一覧から消えている人＝「表示範囲の変更」として開いている（取り消し導線）
        const isRetained=!staffList.includes(delTarget);
        const opt=(i,label,note)=>(
          <label key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 10px",marginBottom:4,borderRadius:8,cursor:"pointer",
            background:delKeepCount===i?"rgba(248,112,54,.10)":"var(--c-input)",
            border:`1px solid ${delKeepCount===i?"var(--c-accent)":"var(--c-border)"}`}}>
            <input type="radio" name="delKeep" checked={delKeepCount===i} onChange={()=>setDelKeepCount(i)} style={{marginTop:2,flexShrink:0,width:16,height:16}}/>
            <span style={{minWidth:0}}>
              <span style={{fontSize:13,color:"var(--c-text)",fontWeight:600}}>{label}</span>
              {note&&<span style={{display:"block",fontSize:11,color:"var(--c-text4)",marginTop:2}}>{note}</span>}
            </span>
          </label>
        );
        return(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setDelTarget(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--c-card)",borderRadius:12,padding:"18px 18px 14px",maxWidth:440,width:"100%",maxHeight:"85vh",overflowY:"auto",boxShadow:"0 8px 32px var(--c-shadow)"}}>
            <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>{isRetained?`「${delTarget}」の表示範囲を変えます`:`「${delTarget}」を削除します`}</div>
            {isRetained&&<div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10}}>この人は既にスタッフ一覧から削除済みで、いまはシフト表にだけ名前を残しています。</div>}
            {sc>0&&<div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10}}>提出済みのシフト{sc}件は削除されません（提出一覧とExcelには残ります）。</div>}
            <div style={{fontSize:13,fontWeight:700,color:"var(--c-text2)",marginTop:10,marginBottom:2}}>シフト表に名前をどの期間まで残しますか？</div>
            <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:8}}>残した期間では、シフト作成タブ・Excel・PDF にこの人の列が出たままになります（スタッフ一覧からは消えます）。</div>
            {delPeriodChoices.length===0
              ?<div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>期間がまだありません。</div>
              :<div>
                {/* 選ぶと「その期間とそれより古い期間」に残り、それより新しい期間からは消える。
                    どの期間が消えるかを名指しで書く（件数だけだと、退職者が新しい期間に出続ける
                    のを見落とす。実際その取り違えが本番で起きた）。 */}
                {delPeriodChoices.map((p,idx)=>opt(idx+1,
                  `${p.label||"(名称なし)"} まで残す`,
                  `${(p.startDate||"").replace(/-/g,"/")}〜${(p.endDate||"").replace(/-/g,"/")}`
                  +(idx===0?"":` ／ ${delPeriodChoices.slice(0,idx).map(q=>q.label||"(名称なし)").join("・")} からは消えます`)
                  +(p.snapshot?" ／ 確定済み（選ばなくても残ります）":"")))}
                {/* 「残さない」でも完全には消えない: 提出のある人は expXl・buildPdfCols が
                    未登録名として末尾に足すため、Excel・PDFには出る。文言をそちらに合わせる。 */}
                {opt(0,"どの期間にも残さない","シフト作成タブから列が消えます（提出がある人は、Excel・PDFには未登録の名前として末尾に出ます）")}
              </div>}
            {(delOlder.kept+delOlder.lost)>0&&<div style={{fontSize:11,color:delOlder.lost?"var(--c-text3)":"var(--c-text4)",margin:"6px 0 12px"}}>
              {delOlder.lost===0
                ?"※ これより古い期間は確定済みのため、表示は変わりません。"
                :`※ これより古い期間は選べません。${delOlder.kept?`確定済みの${delOlder.kept}件は表示が変わりませんが、`:""}未確定の${delOlder.lost}件からはこの人の列が消えます（シフト作成タブで「この期間を確定」すると残せます）。`}
            </div>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button onClick={()=>setDelTarget(null)} style={AGray}>キャンセル</button>
              {isRetained&&<button onClick={undoDelete} style={{...AGray,color:"var(--c-accent)",borderColor:"var(--c-accent)"}}>削除を取り消す</button>}
              <button onClick={confirmDelete} style={isRetained?AB:AD}>{isRetained?"変更する":"削除する"}</button>
            </div>
          </div>
        </div>);
      })()}
      {/* 非表示の開始／解除の期間を選ぶポップアップ。選択肢は削除ポップアップと同じ最新3期間
          （delPeriodChoices・startDate降順）で、先頭が最新期間。既定は最新期間。 */}
      {hideTarget&&(()=>{
        const isShow=hideMode==="show";
        const openFrom=openHiddenFrom(hideTarget);
        const opt=(idx,p)=>{
          const dates=`${(p.startDate||"").replace(/-/g,"/")}〜${(p.endDate||"").replace(/-/g,"/")}`;
          const note=isShow
            ?(hideStaffRangeWouldVanish(hideTarget,p.startDate)
              ?`${dates} ／ 非表示にした期間と同じか手前なので、非表示の指定ごと取り消されます`
              :`${dates} ／ この期間から名前が戻ります（これより前は非表示のまま）`)
            :`${dates} ／ この期間から先のシフト表に名前が出なくなります`;
          return(
            <label key={idx} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 10px",marginBottom:4,borderRadius:8,cursor:"pointer",
              background:hideChoiceIdx===idx?"rgba(248,112,54,.10)":"var(--c-input)",
              border:`1px solid ${hideChoiceIdx===idx?"var(--c-accent)":"var(--c-border)"}`}}>
              <input type="radio" name="hideChoice" checked={hideChoiceIdx===idx} onChange={()=>setHideChoiceIdx(idx)} style={{marginTop:2,flexShrink:0,width:16,height:16}}/>
              <span style={{minWidth:0}}>
                <span style={{fontSize:13,color:"var(--c-text)",fontWeight:600}}>{(p.label||"(名称なし)")+(idx===0?"（最新）":"")}</span>
                <span style={{display:"block",fontSize:11,color:"var(--c-text4)",marginTop:2}}>{note}</span>
              </span>
            </label>
          );
        };
        return(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setHideTarget(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--c-card)",borderRadius:12,padding:"18px 18px 14px",maxWidth:440,width:"100%",maxHeight:"85vh",overflowY:"auto",boxShadow:"0 8px 32px var(--c-shadow)"}}>
            <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>
              {isShow?`「${hideTarget}」を表示に戻します`:`「${hideTarget}」を非表示にします`}
            </div>
            <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10}}>
              スタッフ登録も提出用URLも消えません。シフト作成タブ・Excel・PDF から名前が出なくなるだけで、本人はこれまでどおり提出できます。
            </div>
            {isShow&&openFrom&&<div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10}}>
              いまは「{periodLabelOfStart(openFrom)}」以降を非表示にしています。
            </div>}
            <div style={{fontSize:13,fontWeight:700,color:"var(--c-text2)",marginTop:10,marginBottom:8}}>
              {isShow?"どの期間から表示に戻しますか？":"どの期間から非表示にしますか？"}
            </div>
            {delPeriodChoices.length===0
              ?<div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>
                期間がまだありません。{isShow?"非表示の指定を取り消します。":"これから作る期間もすべて非表示になります。"}
              </div>
              :<div>{delPeriodChoices.map((p,idx)=>opt(idx,p))}</div>}
            {delPeriodsSorted.length>delPeriodChoices.length&&<div style={{fontSize:11,color:"var(--c-text4)",margin:"6px 0 12px"}}>
              ※ これより古い期間は選べません（表示は変わりません）。
            </div>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button onClick={()=>setHideTarget(null)} style={AGray}>キャンセル</button>
              <button onClick={confirmHidden} style={AB}>{isShow?"表示に戻す":"非表示にする"}</button>
            </div>
          </div>
        </div>);
      })()}
      {/* 属性変更ポップアップ。選択肢は削除・非表示と同じ最新3期間（delPeriodChoices・startDate降順）。
          「この期間まで旧属性のまま」＝選んだ期間とそれより古い期間に旧属性を書き置き、
          それより新しい期間から新しい属性で判定される（retainedPeriodIds と同じ時系列の読み方）。 */}
      {attrTarget&&(()=>{
        const old=curAttrOf(attrTarget);
        const oldL=attrLabelOf(old),newL=attrLabelOf(attrNext);
        const opt=(idx,p)=>{
          const dates=`${(p.startDate||"").replace(/-/g,"/")}〜${(p.endDate||"").replace(/-/g,"/")}`;
          // 前回の属性変更で既に指定が入っている期間は上書きしない（confirmAttr と同じ判定）。
          // 「選んだのに変わらない」を黙って起こさないよう、選択肢の側で名指しする。
          const fixed=(keepAttrsOf(p)||{})[attrTarget];
          const newer=delPeriodChoices.slice(0,idx).map(q=>q.label||"(名称なし)");
          return(
            <label key={idx} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 10px",marginBottom:4,borderRadius:8,cursor:"pointer",
              background:attrKeepCount===idx+1?"rgba(248,112,54,.10)":"var(--c-input)",
              border:`1px solid ${attrKeepCount===idx+1?"var(--c-accent)":"var(--c-border)"}`}}>
              <input type="radio" name="attrKeep" checked={attrKeepCount===idx+1} onChange={()=>setAttrKeepCount(idx+1)} style={{marginTop:2,flexShrink:0,width:16,height:16}}/>
              <span style={{minWidth:0}}>
                <span style={{fontSize:13,color:"var(--c-text)",fontWeight:600}}>{`${p.label||"(名称なし)"} まで ${oldL} のまま`}</span>
                <span style={{display:"block",fontSize:11,color:"var(--c-text4)",marginTop:2}}>
                  {dates}
                  {newer.length?` ／ ${newer.join("・")} から ${newL} になります`:` ／ これより新しい期間から ${newL} になります`}
                  {fixed?` ／ この期間は前回の変更で ${attrLabelOf(fixed)} に固定済み（変わりません）`:""}
                </span>
              </span>
            </label>
          );
        };
        return(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setAttrTarget(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--c-card)",borderRadius:12,padding:"18px 18px 14px",maxWidth:440,width:"100%",maxHeight:"85vh",overflowY:"auto",boxShadow:"0 8px 32px var(--c-shadow)"}}>
            <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>
              {`「${attrTarget}」の属性を ${oldL} → ${newL} に変更します`}
            </div>
            <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10}}>
              属性は勤務時間の上限判定に使います。何も指定せずに変えると、配り終えた過去のシフト表まで新しい上限で判定し直され、上限超過のエラーが出ます。
            </div>
            <div style={{fontSize:13,fontWeight:700,color:"var(--c-text2)",marginTop:10,marginBottom:8}}>
              {`どの期間まで ${oldL} のままにしますか？`}
            </div>
            <div>{delPeriodChoices.map((p,idx)=>opt(idx,p))}</div>
            {(delOlder.kept+delOlder.lost)>0&&<div style={{fontSize:11,color:delOlder.lost?"var(--c-text3)":"var(--c-text4)",margin:"6px 0 12px"}}>
              {delOlder.lost===0
                ?"※ これより古い期間は確定済みのため、属性は変わりません。"
                :`※ これより古い期間は選べません。${delOlder.kept?`確定済みの${delOlder.kept}件は変わりませんが、`:""}未確定の${delOlder.lost}件は ${newL} で判定されます（シフト作成タブで「この期間を確定」すると変わらなくなります）。`}
            </div>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button onClick={()=>setAttrTarget(null)} style={AGray}>キャンセル</button>
              <button onClick={confirmAttr} style={AB}>変更する</button>
            </div>
          </div>
        </div>);
      })()}
      {/* 賃金の閲覧パスコード（P6a）は「スタッフ登録」の横。Premium・オーナーの端末だけ */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <AT>スタッフ登録</AT>
        {pay.enabled&&<div style={{display:"flex",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
          {onOpenPayroll&&<button data-open-payroll="1" onClick={onOpenPayroll} style={{...AGray,padding:"7px 12px",fontSize:12,whiteSpace:"nowrap"}}>月次賃金 →</button>}
          <PayCodeBox pay={pay} onOpenChange={()=>setPayCodeModal(true)}/>
        </div>}
      </div>
      {payCodeModal&&<PayCodeChangeModal tt={tt} onClose={()=>setPayCodeModal(false)} onSubmit={pay.changeCode}
        note={companyLinked?"企業に連携している店舗は、企業のパスコードに統一されています。企業連携タブの「企業アカウント」か、「企業内登録スタッフ」の一覧の上部にある「変更」で変更してください。":null}/>}
      {/* マイシフト（従業員画面）のリンク申請（第2部 E2）。MY_SCREEN_ENABLED・オーナーの端末だけ（sl.enabled）。申請が無ければ何も出さない */}
      <StaffLinkRequestsCard links={sl} staffList={staffList} staffNumbers={settings.staffNumbers||{}} mirrorPeople={mirrorPeople} shopId={shopId} tt={tt}/>
      <AC title="スタッフ一覧">
        {!isPro&&<div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,background:"var(--c-card)",border:"1px solid var(--c-border)",borderRadius:8,padding:"7px 10px"}}>
          {`Freeプラン：最大${lim}名まで登録可能（${staffList.filter(n=>!isSpacer(n)).length}/${lim}名）`}
          {!isPro&&<span style={{marginLeft:8,color:"#F59E0B",fontSize:11}}>並べ替え・名前色変更はProプラン（500円/月）で利用できます</span>}
        </div>}
        {staffList.length===0&&<div style={{fontSize:13,color:"var(--c-text4)",marginBottom:12}}>スタッフが登録されていません</div>}
        {/* 行はカード幅に収め、入りきらないボタンは次の行へ折り返す（2026-09-29）。
            以前は max-content の箱で横スクロールさせていたため、スマホでは編集・削除が画面外にあった
            （iPhone 17 の Safari で実測）。横スクロールの箱は保険として残す。 */}
        <div style={{overflowX:"auto"}}>
        <div>
        {/* 行の並びは displayRows（staffList ＋ 削除済みで表に残している人を元の位置に差し込んだもの）。
            実スタッフの行に渡す i は staffList の index のままなので、ドラッグ・編集・削除の意味は一切変えていない。 */}
        {displayRows.map(row=>row.kind==="retained"?(
          <div key={"kept-"+row.n} style={{marginBottom:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"var(--c-card)",border:"1px dashed var(--c-border2)",borderRadius:8,opacity:.85}}>
              {isPro&&<span style={{width:18,flexShrink:0}}/>}
              <span style={{fontSize:13,color:"var(--c-text4)",minWidth:24,textAlign:"center"}}>−</span>
              <span style={{flex:1,minWidth:0}}>
                <span style={{fontSize:14,color:"var(--c-text3)",fontWeight:600,textDecoration:"line-through"}}>{row.n}</span>
                <span style={{display:"block",fontSize:11,color:"var(--c-text4)",marginTop:2}}>
                  削除済み ／ シフト表に表示中（{row.r.labels.join("・")}） ／ {(row.r.maxEnd||"").replace(/-/g,"/")} を過ぎるとこの一覧から消えます
                </span>
              </span>
              <button onClick={()=>editRetention(row.n)} style={AD}>削除</button>
            </div>
          </div>
        ):(()=>{const n=row.n,i=row.i;const hidden=!isSpacer(n)&&hiddenNow(n);const hiddenFrom=hidden?openHiddenFrom(n):null;return(
          <div key={i} style={{marginBottom:6}}>
          {isSpacer(n)
            ?<div data-staff-idx={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",border:dragOverIdx===i&&dragIdx!==null?"2px solid var(--c-accent)":"1px dashed var(--c-border2)",borderRadius:8,background:"transparent",opacity:dragIdx===i?.4:1,transition:"opacity .15s"}}>
              {isPro&&<span onPointerDown={e=>handleGripPointerDown(e,i)} onPointerMove={handleGripPointerMove} onPointerUp={handleGripPointerUp} onPointerCancel={handleGripPointerCancel} onContextMenu={e=>e.preventDefault()} style={{cursor:"grab",color:dragIdx===i?"var(--c-accent)":"var(--c-text4)",fontSize:16,padding:"0 2px",userSelect:"none",WebkitUserSelect:"none",lineHeight:1,touchAction:"none"}}>⠿</span>}
              <span style={{flex:1,fontSize:12,textAlign:"center",color:"var(--c-text4)",letterSpacing:2}}>─ 空白列 ─</span>
              <button onClick={()=>del(i)} style={AD}>削除</button>
            </div>
            :<div data-staff-idx={i} style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8,padding:"10px 12px",background:"var(--c-card)",border:dragOverIdx===i&&dragIdx!==null?"2px solid var(--c-accent)":"1px solid var(--c-border)",borderRadius:8,opacity:dragIdx===i?.4:(hidden?.6:1),transition:"opacity .15s"}}>
            {/* 名前側とボタン側の2つに分ける。1行に収まらないときはボタン側が丸ごと次の行へ回り、
                ボタン側の中でも入りきらない分だけ折り返す。名前側の 140px は折り返しを決める幅で、
                1行に収まるときは残り幅いっぱいに広がる（名前の flex:1 を直接並べると幅0まで潰れて折り返さない）。 */}
            <div style={{display:"flex",alignItems:"center",gap:8,flex:"1 1 140px",minWidth:0}}>
            {isPro&&<span onPointerDown={e=>handleGripPointerDown(e,i)} onPointerMove={handleGripPointerMove} onPointerUp={handleGripPointerUp} onPointerCancel={handleGripPointerCancel} onContextMenu={e=>e.preventDefault()} style={{cursor:"grab",color:dragIdx===i?"var(--c-accent)":"var(--c-text4)",fontSize:16,padding:"0 2px",userSelect:"none",WebkitUserSelect:"none",lineHeight:1,flexShrink:0,touchAction:"none"}}>⠿</span>}
            <span style={{fontSize:13,color:"var(--c-text4)",minWidth:24,textAlign:"center"}}>{staffList.slice(0,i).filter(x=>!isSpacer(x)).length+1}</span>
            {isPro&&<button onClick={()=>toggleColor(n)} title="タップで色を切り替え" style={{width:18,height:18,borderRadius:"50%",background:(staffColors[n]||"black")==="red"?"#FF4757":"#374151",border:"2px solid var(--c-border2)",cursor:"pointer",flexShrink:0,padding:0}}/>}
            <span style={{flex:1,minWidth:0,fontSize:14,color:hidden?"var(--c-text3)":"var(--c-text)",fontWeight:600}}>{n}</span>
            {/* 賃金は一覧に出さない（誰でも覗ける場面が多い）。設定済みかどうかだけを示す（P6a） */}
            {pay.enabled&&pay.map&&pay.map[n]&&<span data-pay-mark={n} title="賃金設定あり" style={{fontSize:12,fontWeight:700,color:"var(--c-text3)",flexShrink:0}}>¥</span>}
            {/* 非表示の印は「(非表示)」だけにする（2026-09-08 ユーザー決定）。説明と対象期間は title へ。 */}
            {hidden&&<span title={`${hiddenFrom?`${periodLabelOfStart(hiddenFrom)}以降 ／ `:""}シフト作成タブ・Excel・PDF に出ません（提出は今までどおりできます）`} style={{fontSize:11,color:"var(--c-text4)",flexShrink:0,whiteSpace:"nowrap"}}>(非表示)</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8,minWidth:0}}>
            {/* 行に出すボタンは 有給日数・ポジション・非表示・編集・削除 の5つだけ（2026-09-26 ユーザー指示）。
                従業員番号・属性・別名・退勤延長・名前は「編集」で開くモーダルにまとめてある。 */}
            {/* 幅は固定にする（ポジションボタンと同じ扱い）。日数の有無でボタンが伸び縮みすると、
                右隣の4ボタンが横にずれて押し間違える。110px は最大値「有給日数 (80.5)」（実測103.9px）が
                収まる幅＝**半日付与を入れても変わらない**。 */}
            {isPremium&&<button onClick={()=>{setPaidKey(paidKey===n?null:n);}} style={{padding:"6px 8px",background:paidKey===n?"rgba(16,185,129,.15)":"rgba(16,185,129,.06)",border:`1px solid ${paidKey===n?"#10B981":"rgba(16,185,129,.3)"}`,borderRadius:4,color:"#10B981",fontSize:12,cursor:"pointer",width:110,boxSizing:"border-box",flexShrink:0,whiteSpace:"nowrap",textAlign:"center"}}>
              有給日数{(settings.paidLeaveGranted||{})[n]!=null?` (${(settings.paidLeaveGranted||{})[n]})`:""}
            </button>}
            {isPremium&&<button onClick={()=>{setPosKey(posKey===n?null:n);}} style={{padding:"6px 8px",background:posKey===n?"rgba(59,130,246,.15)":"rgba(59,130,246,.06)",border:`1px solid ${posKey===n?"#3B82F6":"rgba(59,130,246,.3)"}`,borderRadius:4,color:"#3B82F6",fontSize:12,cursor:"pointer",width:118,boxSizing:"border-box",flexShrink:0,whiteSpace:"nowrap",textAlign:"center"}}>
              ポジション{(((staffPositions[n]&&staffPositions[n].lunch)||[]).length+((staffPositions[n]&&staffPositions[n].dinner)||[]).length)>0?` (${((staffPositions[n]&&staffPositions[n].lunch)||[]).length+((staffPositions[n]&&staffPositions[n].dinner)||[]).length})`:""}
            </button>}
            <button onClick={()=>openHiddenDialog(n)} title="シフト作成タブ・Excel・PDF から名前を外す（登録と提出URLはそのまま）" style={{padding:"6px 10px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text3)",fontSize:12,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>{hidden?"表示":"非表示"}</button>
            <button onClick={()=>startEdit(n)} style={{padding:"6px 10px",background:"rgba(59,130,246,.08)",border:"1px solid rgba(59,130,246,.25)",borderRadius:4,color:"#3B82F6",fontSize:12,cursor:"pointer",flexShrink:0}}>編集</button>
            <button onClick={()=>del(i)} style={{...AD,flexShrink:0}}>削除</button>
            </div>
          </div>}
          {/* 有給日数パネル（Premium・展開時） */}
          {isPremium&&paidKey===n&&(
            <div style={{marginTop:4,padding:"12px 14px",background:"rgba(16,185,129,.04)",border:"1px solid rgba(16,185,129,.2)",borderRadius:8,position:"sticky",left:0,maxWidth:"calc(100vw - 76px)",boxSizing:"border-box"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#10B981",marginBottom:8}}>有給の付与日数</div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <input type="number" min={0} max={80} step={0.5} value={(settings.paidLeaveGranted||{})[n]==null?"":(settings.paidLeaveGranted||{})[n]} placeholder="未設定"
                  onChange={e=>{const v=e.target.value;const g={...(settings.paidLeaveGranted||{})};
                    if(v==="")delete g[n];else g[n]=Math.max(0,Math.min(80,parseFloat(v)||0));
                    onSaveSettings&&onSaveSettings({...settings,paidLeaveGranted:g});}}
                  style={{...AI,width:90,textAlign:"center",padding:"6px 8px"}}/>
                <span style={{fontSize:12,color:"var(--c-text4)"}}>日</span>
              </div>
              <div style={{fontSize:11,color:"var(--c-text4)",marginTop:8}}>シフト作成タブの労務判定に「有給残」（付与日数 − その年度に消化した有給の日数）が出ます。空欄にすると残数を出しません。</div>
            </div>
          )}
          {/* ポジションパネル（Premium・展開時） */}
          {isPremium&&posKey===n&&(
            <div style={{marginTop:4,padding:"12px 14px",background:"rgba(59,130,246,.04)",border:"1px solid rgba(59,130,246,.2)",borderRadius:8,position:"sticky",left:0,maxWidth:"calc(100vw - 76px)",boxSizing:"border-box"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#3B82F6",marginBottom:8}}>ポジション（設定タブで登録したポジションから選択）</div>
              {allPositions.length===0
                ?<div style={{fontSize:12,color:"var(--c-text4)"}}>設定タブの「ポジション設定」で先にポジションを登録してください</div>
                :["lunch","dinner"].map(meal=>{
                  const cur=(staffPositions[n]&&staffPositions[n][meal])||[];
                  return(
                    <div key={meal} style={{marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--c-text3)",marginBottom:6}}>{meal==="lunch"?"ランチ":"ディナー"}</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>
                        {cur.length===0&&<div style={{fontSize:12,color:"var(--c-text4)"}}>未設定</div>}
                        {cur.map((p,pi)=>(
                          <div key={pi} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(59,130,246,.1)",border:"1px solid rgba(59,130,246,.25)",borderRadius:12,padding:"3px 10px 3px 12px",fontSize:13,color:"#3B82F6",fontWeight:600}}>
                            {p}<button onClick={()=>savePositions(n,meal,cur.filter((_,ci)=>ci!==pi))} style={{background:"none",border:"none",color:"#3B82F6",cursor:"pointer",padding:"0 0 0 4px",fontSize:14,lineHeight:1}}>×</button>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {allPositions.filter(p=>!cur.includes(p)).map(p=>(
                          <button key={p} onClick={()=>savePositions(n,meal,[...cur,p])} style={{padding:"5px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:12,fontSize:13,color:"var(--c-text2)",cursor:"pointer",fontWeight:600}}>＋ {p}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          </div>
        );})()
        )}
        </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="スタッフ名を入力" maxLength={50} style={AI}/>
          <button onClick={add} style={AB}>＋ 追加</button>
        </div>
        {/* 従業員番号で企業内の他店舗から呼び出す（Premium・企業の写しに他店舗があるときだけ）。番号が数字以外の人は対象外 */}
        {isPremium&&!ownerReadOnly&&(companyShops||[]).length>0&&<div style={{marginTop:10}}>
          <div style={{display:"flex",gap:8}}>
            <input value={lookupNum} onChange={e=>setLookupNum(e.target.value.replace(/\s/g,""))} onKeyDown={e=>e.key==="Enter"&&!lookupBusy&&lookupByNumber()} inputMode="numeric" maxLength={8} placeholder="従業員番号（数字）で他店舗から呼び出す" style={AI}/>
            <button disabled={lookupBusy} onClick={lookupByNumber} style={{...AGray,whiteSpace:"nowrap"}}>{lookupBusy?"検索中...":"呼び出す"}</button>
          </div>
          <div style={{fontSize:11,color:"var(--c-text4)",marginTop:4}}>企業に連携している店舗から、同じ従業員番号（数字だけの番号）の人を名前・属性・所属店舗ごと登録します。</div>
          {lookupChoices&&<div style={{marginTop:8,padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8}}>
            <div style={{fontSize:12,color:"var(--c-text2)",marginBottom:6}}>同じ従業員番号で別の名前が登録されています。登録する人を選んでください。</div>
            {lookupChoices.map(m=><button key={m.name} onClick={()=>registerLookup(m)} style={{...AGray,display:"block",width:"100%",textAlign:"left",marginBottom:6}}>{m.name}（{m.homeShopName||"所属不明"}）</button>)}
            <button onClick={()=>setLookupChoices(null)} style={{background:"none",border:"none",color:"var(--c-text4)",fontSize:12,cursor:"pointer"}}>取消</button>
          </div>}
        </div>}
        {isPro&&<button onClick={()=>{onSave([...staffList,"__spacer__"+genToken()]);tt("✓ 空白列を追加しました");}} style={{...AGray,width:"100%",fontSize:13,marginTop:8}}>＋ 空白列を追加（末尾）</button>}
        {staffList.filter(n=>!isSpacer(n)).length>=lim&&<div style={{marginTop:10,fontSize:12,color:"#F59E0B",textAlign:"center"}}>▲ 上限に達しています。アップグレードするとさらに追加できます。</div>}
      </AC>

      {/* スタッフの編集モーダル（2026-09-26 ユーザー指示）。名前・従業員番号・属性・別名・退勤延長を
          1画面にまとめる。行に残すのは 有給日数・ポジション・非表示・編集・削除 の5ボタンだけ。
          **zIndex は 9998。** 上の3つのポップアップ（削除・非表示・属性）は 9999 にしてある——
          属性の変更はこのモーダルの中から開くので、同じ値だと DOM 順で下に潜って操作できない。 */}
      {editKey&&(()=>{
        const n=editKey;
        const otRaw=(settings.overtimeSettings?.byStaff||{})[n];
        const ot=typeof otRaw==="number"?{lunch:otRaw,dinner:otRaw}:(otRaw||{lunch:0,dinner:0});
        const setOT=(band,v)=>{
          const bs={...(settings.overtimeSettings?.byStaff||{})};
          const prevRaw=bs[n];const prev=typeof prevRaw==="number"?{lunch:prevRaw,dinner:prevRaw}:(prevRaw||{lunch:0,dinner:0});
          const next={...prev,[band]:v};
          if((next.lunch||0)>0||(next.dinner||0)>0)bs[n]={lunch:next.lunch||0,dinner:next.dinner||0};else delete bs[n];
          onSaveSettings&&onSaveSettings({...settings,overtimeSettings:{...(settings.overtimeSettings||{}),byStaff:bs}});
        };
        const selStyle={fontSize:16,padding:"5px 8px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text)",cursor:"pointer"};
        const sec=(title,body)=>(<div style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--c-text3)",marginBottom:6}}>{title}</div>{body}</div>);
        return(
        <div onClick={cancelEdit} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9998,padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--c-card)",borderRadius:12,padding:"20px 20px 16px",width:"100%",maxWidth:460,maxHeight:"86vh",overflowY:"auto",boxShadow:"0 8px 32px var(--c-shadow)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)"}}>{n} の設定</div>
              <button onClick={cancelEdit} style={{background:"none",border:"none",color:"var(--c-text3)",fontSize:20,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>×</button>
            </div>

            {sec("名前",<>
              <div style={{display:"flex",gap:8}}>
                <input value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")confirmEdit(n);if(e.key==="Escape")cancelEdit();}} maxLength={50} style={{...AI,flex:1,padding:"8px 10px"}}/>
                <button onClick={()=>confirmEdit(n)} style={{...AB,padding:"8px 14px",fontSize:13,whiteSpace:"nowrap"}}>保存</button>
              </div>
              <div style={{fontSize:11,color:"var(--c-text4)",marginTop:6}}>改名すると設定・過去の期間の記録も一緒に移ります。</div>
            </>)}

            {isPremium&&sec("従業員番号",<>
              <input value={(settings.staffNumbers||{})[n]||""} maxLength={8} placeholder="番号"
                onChange={e=>{const v=e.target.value;const nums={...(settings.staffNumbers||{})};if(v)nums[n]=v;else delete nums[n];onSaveSettings&&onSaveSettings({...settings,staffNumbers:nums});}}
                style={{...AI,width:120,textAlign:"center",padding:"6px 8px"}}/>
            </>)}

            {isPremium&&sec("属性",<>
              {/* 選んだ瞬間には保存しない。openAttrDialog が「どの期間まで旧属性のままにするか」を
                  確定してから保存する。value は settings のままなのでキャンセルすれば表示も戻る。 */}
              <select value={(settings.staffAttributes||{})[n]||"parttime"} onChange={e=>openAttrDialog(n,e.target.value)} style={{...selStyle,width:"auto",minWidth:140}}>
                {/* 並びは getAttrOptions（＝sortAttrEntries）が正本。設定タブの属性別勤務時間設定と同じ順に出す */}
                {getAttrOptions(settings).map(([v,label])=><option key={v} value={v}>{label}</option>)}
              </select>
            </>)}

            {/* 所属店舗（2026-09-27 企業連携の拡張）。他店舗を所属にした人は、この店舗のシフトでは「ヘルプ」として
                列見出しに所属店舗名が出て、所属店舗と時間が重なるとシフト作成タブに重複エラーが出る。
                同一人物の判定は「所属店舗が一致すること」（app-utils.js の dupTargetShopsFor）。 */}
            {isPremium&&(()=>{
              const others=(linkedShops||[]).filter(s=>s&&s.id&&s.id!==shopId);
              const cur=((settings.staffHomeShop||{})[n])||"";
              if(others.length===0&&!cur)return null;
              const known=!cur||others.some(s=>s.id===cur);
              const setHome=v=>{
                const h={...(settings.staffHomeShop||{})};
                if(v&&v!==shopId)h[n]=v;else delete h[n];
                onSaveSettings&&onSaveSettings({...settings,staffHomeShop:h});
              };
              return sec("所属店舗",<>
                <select value={cur} onChange={e=>setHome(e.target.value)} style={{...selStyle,width:"auto",minWidth:180}}>
                  <option value="">{shopName||"この店舗"}</option>
                  {others.map(s=><option key={s.id} value={s.id}>{s.name||s.id}</option>)}
                  {!known&&<option value={cur}>連携していない店舗</option>}
                </select>
                <div style={{fontSize:11,color:"var(--c-text4)",marginTop:6}}>他店舗を選ぶと、{shopName||"この店舗"}のシフトではヘルプとして扱われます。所属店舗と勤務時間が重なるとシフト作成タブにエラーが出ます。</div>
              </>);
            })()}

            {isPremium&&sec("退勤延長",<>
              <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:8}}>シフト終了後の延長時間。ランチ帯（退勤17:00以前）とディナー帯（17:00超）で別に設定できます。勤務時間の合計に加算されます。</div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                {[["lunch","ランチ"],["dinner","ディナー"]].map(([band,lbl])=>(
                  <div key={band} style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:12,color:"var(--c-text3)"}}>{lbl}</span>
                    <select value={ot[band]||0} onChange={e=>setOT(band,parseInt(e.target.value)||0)} style={selStyle}>
                      <option value={0}>延長なし</option>{[15,30,45,60,90,120].map(m=><option key={m} value={m}>+{m}分</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </>)}

            {isPro&&sec("別名",<>
              <div style={{padding:"10px 12px",background:"rgba(248,112,54,.04)",border:"1px solid rgba(248,112,54,.2)",borderRadius:8}}>
    <div style={{fontSize:12,fontWeight:700,color:"var(--c-accent)",marginBottom:8}}>別名（スタッフが入力できる名前）</div>
                  {/* 登録済み別名 */}
                  {(staffAliases[n]||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                    {(staffAliases[n]||[]).map((alias,ai)=>(
                      <div key={ai} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(248,112,54,.1)",border:"1px solid rgba(248,112,54,.25)",borderRadius:12,padding:"3px 10px 3px 12px",fontSize:13,color:"#c45b1a",fontWeight:600}}>
                        {alias}
                        <button onClick={()=>delAlias(n,alias)} style={{background:"none",border:"none",color:"var(--c-accent)",cursor:"pointer",padding:"0 0 0 4px",fontSize:14,lineHeight:1}}>×</button>
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
                          style={{padding:"5px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:12,fontSize:13,color:"var(--c-text2)",cursor:"pointer",fontWeight:600}}>
                          ＋ {alias}
                        </button>
                      ))}
                    </div>
                  }
                  <div style={{fontSize:11,color:"var(--c-text4)",marginTop:8}}>タップした名前が「{n}」の別名として登録されます</div>
              </div>
            </>)}

            {sl.enabled&&sec("マイシフト",<StaffLinkEditSection links={sl} name={n} tt={tt}/>)}

            {pay.enabled&&(()=>{
              const hs=homeShopOf(settings,n,shopId);
              if(hs!==shopId){
                const hn=((linkedShops||[]).find(s=>s&&s.id===hs)||{}).name||"他の店舗";
                return sec("賃金",<div data-pay-helper-note="1" style={{fontSize:12,color:"var(--c-text3)"}}>賃金は所属店舗（{hn}）で設定します。</div>);
              }
              return sec("賃金",<button onClick={()=>{const k=n;cancelEdit();onOpenPay&&onOpenPay(k);}} style={{...AGray,width:"100%"}}>賃金設定を開く →</button>);
            })()}

            <button onClick={cancelEdit} style={{...AGray,width:"100%",marginTop:4}}>閉じる</button>
          </div>
        </div>);
      })()}
    </div>
  );
}

// ===== 候補管理タブ（複数選択対応）=====
function CandTab({settings,onSave,tt,plan="free",periods=[]}){
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
  const[selDayType,setSelDayType]=useState("weekday");
  const[brkStart,setBrkStart]=useState("");
  const[brkEnd,setBrkEnd]=useState("");
  const[brkTags,setBrkTags]=useState([]); // 新規休憩に付与する属性タグ
  const[editTagKey,setEditTagKey]=useState(null); // タグ編集中の "dayType_index"
  const[posTypeModal,setPosTypeModal]=useState(null); // {date, types:[posType,...]} 必要ポジションの曜日区分選択ポップアップ

  const toggleArr=(arr,setArr,val)=>setArr(prev=>prev.includes(val)?prev.filter(v=>v!==val):[...prev,val]);

  // 日付別候補を保存したあと、その候補がポジション区分の異なる複数の曜日別候補と一致する場合のみ
  // 「必要ポジションでどの曜日設定を使うか」を選ぶポップアップを開く（単一日付編集時のみ）。
  const maybePromptPosType=dc=>{
    if(selDates.length!==1)return;
    if(!hasAnyRequiredPosition(settings.requiredPositions))return; // 必要ポジション未設定ならポップアップ不要
    const date=selDates[0];
    const cands=dc[date]||[];
    if(!cands.length)return;
    const types=[...matchingPositionDayTypes(cands,settings.weekdayCandidates||{})];
    if(types.length>=2)setPosTypeModal({date,types});
  };
  // ポップアップの選択結果を settings.dateCandidatePosTypes に保存（自動判定=nullは該当キーを削除）。
  const applyPosType=(date,posType)=>{
    const m={...(settings.dateCandidatePosTypes||{})};
    if(posType)m[date]=posType;else delete m[date];
    onSave({...settings,dateCandidatePosTypes:m});
    setPosTypeModal(null);
    tt(posType?`✓ ${(POSITION_DAY_TYPES.find(t=>t[0]===posType)||[])[1]||posType}の必要ポジションを適用`:"✓ 自動判定に設定");
  };

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
    if(total>0)maybePromptPosType(dc);
  };
  const delD=(dt,i)=>{const dc={...(settings.dateCandidates||{})};dc[dt]=[...(dc[dt]||[])];dc[dt].splice(i,1);const next={...settings,dateCandidates:dc};if(dc[dt].length===0){delete dc[dt];if((settings.dateCandidatePosTypes||{})[dt]){const m={...settings.dateCandidatePosTypes};delete m[dt];next.dateCandidatePosTypes=m;}}onSave(next);};
  // 曜日を1つ選ぶと、その曜日に設定した全候補を日付別候補に追加（機能1）＋ ポジション区分を自動設定（機能2）
  const addAllFromWeekday=(wkey)=>{
    const wcands=((settings.weekdayCandidates||{})[wkey]||[]).filter(c=>!c.closed);
    if(!wcands.length){tt("▲ この曜日に候補がありません");return;}
    const dc={...(settings.dateCandidates||{})};
    let added=0;
    selDates.forEach(dt=>{
      const prev=dc[dt]||[];
      const toAdd=wcands.filter(wc=>!prev.some(p=>p.start===wc.start&&p.end===wc.end));
      if(toAdd.length){dc[dt]=sc([...prev,...toAdd]);added+=toAdd.length;}
    });
    if(added===0){tt("▲ 既に登録済みです");return;}
    const posType=weekdayKeyToPositionDayType(wkey);
    const newSettings={...settings,dateCandidates:dc};
    if(posType){const m={...(settings.dateCandidatePosTypes||{})};selDates.forEach(dt=>{m[dt]=posType;});newSettings.dateCandidatePosTypes=m;}
    onSave(newSettings);
    tt(`✓ ${wdLabelFull(wkey)}の候補（${wcands.length}件）を${selDates.length}日付に追加`);
  };

  // 選択中の日付の候補（複数選択時は全日付の和集合）
  const dC=selDates.length===1?((settings.dateCandidates||{})[selDates[0]]||[]):[];

  // 曜日別候補の区分: 0〜6=通常の曜日、7=祝日（連休中・単日、土曜扱い）、8=祝日（最終日、日曜扱い）
  const WDAY_OPTS=[0,1,2,3,4,5,6,7,8];
  const wdLabel=d=>d===7?"祝(単)":d===8?"祝(終)":WD[d];
  const wdLabelFull=d=>d===7?"祝日（連休中・単日）":d===8?"祝日（最終日）":WD[d]+"曜日";
  const wdIsSat=d=>d===6; // 土曜扱い（土曜のみ）
  const wdIsSun=d=>d===0||d===7||d===8; // 日曜扱い（日曜そのもの・祝日は連休中/単日・最終日ともに日曜色）

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
        {[["global","全体"],["weekday","曜日別"],["date","日付別"],...(plan==="premium"?[["break","休憩"]]:[])] .map(([id,l])=>(
          <button key={id} onClick={()=>setMode(id)} style={{padding:"8px 14px",background:mode===id?"var(--c-accent)":"var(--c-border)",border:`1px solid ${mode===id?"var(--c-accent)":"var(--c-border)"}`,borderRadius:8,color:"var(--c-text)",fontSize:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
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

        {/* 曜日選択ボタン（日曜を先頭に・祝日2種も含む） */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
          {WDAY_OPTS.map(d=>{
            const sel=selDows.includes(d);
            const isSat=wdIsSat(d),isSun=wdIsSun(d);
            return(<button key={d} onClick={()=>setSelDows(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d])}
              style={{padding:"7px 14px",borderRadius:12,fontSize:13,fontWeight:700,border:"1px solid",cursor:"pointer",
                background:sel?(isSat?"#3B82F6":isSun?"#FF4757":"var(--c-accent)"):"var(--c-input)",
                borderColor:sel?"transparent":isSat?"rgba(147,197,253,.3)":isSun?"rgba(252,165,165,.3)":"var(--c-border2)",
                color:sel?"white":isSat?"#3B82F6":isSun?"#FF4757":"var(--c-text2)"}}>
              {wdLabel(d)}
            </button>);
          })}
        </div>

        {/* 追加フォーム（常に表示・選択中の曜日を表示） */}
        <div style={{marginBottom:16,padding:"12px",background:"var(--c-input2)",borderRadius:8}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-end",marginBottom:8}}>
            <SingleTimeSelect value={wSelStart} onChange={setWSelStart} label="出勤時刻"/>
            <div style={{color:"var(--c-text4)",paddingBottom:12,fontSize:16}}>〜</div>
            <SingleTimeSelect value={wSelEnd} onChange={setWSelEnd} label="退勤時刻"/>
            <button onClick={addW} style={{...AB,whiteSpace:"nowrap"}}>＋ 追加</button>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:10,color:"var(--c-text4)"}}>{selDows.map(wdLabel).join("・")} に追加</div>
            <button onClick={()=>{
              const w={...(settings.weekdayCandidates||{})};
              let total=0;
              selDows.forEach(dow=>{
                const b=w[dow]||[];
                if(!b.some(c=>c.closed)){w[dow]=sc([...b,{closed:true}]);total++;}
              });
              onSave({...settings,weekdayCandidates:w});
              tt(total>0?`✓ ${selDows.map(wdLabel).join("・")}に休業日を設定`:"▲ 既に設定済みです");
            }} style={{padding:"6px 12px",background:"rgba(255,71,87,.15)",border:"1px solid rgba(255,71,87,.3)",borderRadius:8,color:"#FF4757",fontSize:12,fontWeight:700,cursor:"pointer"}}>× 休業日に設定</button>
          </div>
        </div>

        {/* 全曜日の候補一覧（常に表示・日曜→祝→月〜土の順） */}
        <div style={{borderTop:"1px solid var(--c-border)",paddingTop:14}}>
          <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,fontWeight:600}}>全曜日の登録済み候補</div>
          {WDAY_OPTS.map(d=>{
            const cands=(settings.weekdayCandidates||{})[d]||[];
            const isSat=wdIsSat(d),isSun=wdIsSun(d);
            const label=wdLabelFull(d);
            const lc=isSat?"#3B82F6":isSun?"#FCA5A5":"#4B5563";
            return(
              <div key={d} style={{marginBottom:8,background:"var(--c-input2)",borderRadius:8,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",
                  borderBottom:cands.length>0?"1px solid var(--c-border)":"none"}}>
                  <span style={{fontSize:13,fontWeight:700,color:lc}}>{label}</span>
                  <span style={{fontSize:11,color:cands.length>0?"var(--c-text4)":"var(--c-border2)"}}>
                    {cands.length>0?`${cands.length}件`:"未設定"}
                  </span>
                </div>
                {cands.length>0&&<div style={{padding:"6px 8px"}}>
                  {cands.map((c,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                      padding:"5px 8px",background:c.closed?"rgba(255,71,87,.08)":"var(--c-card)",border:c.closed?"1px solid rgba(255,71,87,.2)":"none",borderRadius:8,marginBottom:3}}>
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
          {(()=>{
            // 必要ポジション設定済み店舗で候補が登録された日付なら、曖昧一致の有無に関わらず現在値＋変更ボタンを常に表示する
            if(!hasAnyRequiredPosition(settings.requiredPositions)||dC.length===0)return null;
            const date=selDates[0];
            const ov=(settings.dateCandidatePosTypes||{})[date];
            const ambTypes=[...matchingPositionDayTypes(dC,settings.weekdayCandidates||{})];
            const lbl=ov?((POSITION_DAY_TYPES.find(t=>t[0]===ov)||[])[1]||ov):"自動判定";
            return(<div style={{marginTop:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",fontSize:12,color:"var(--c-text3)"}}>
              <span>必要ポジションの曜日区分：<b style={{color:"var(--c-text)"}}>{lbl}</b></span>
              <button onClick={()=>setPosTypeModal({date,types:ambTypes.length>=2?ambTypes:POSITION_DAY_TYPES.map(t=>t[0])})} style={{padding:"3px 10px",borderRadius:4,background:"var(--c-border)",border:"1px solid var(--c-border2)",color:"var(--c-text)",fontSize:11,fontWeight:600,cursor:"pointer"}}>変更</button>
            </div>);
          })()}
        </>}
        <div style={{marginTop:12,padding:"12px",background:"var(--c-input2)",borderRadius:8}}>
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
              if(total>0)maybePromptPosType(dc);
            }} style={{padding:"6px 12px",background:"rgba(255,71,87,.15)",border:"1px solid rgba(255,71,87,.3)",borderRadius:8,color:"#FF4757",fontSize:12,fontWeight:700,cursor:"pointer"}}>× 休業日に設定</button>
          </div>
          {(()=>{
            const wc=settings.weekdayCandidates||{};
            const keysWithCands=WDAY_OPTS.filter(d=>(wc[d]||[]).some(c=>!c.closed));
            if(!keysWithCands.length||selDates.length===0)return null;
            return(<div style={{marginTop:12,borderTop:"1px solid var(--c-border)",paddingTop:10}}>
              <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:8,fontWeight:600}}>曜日別から選ぶ</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {keysWithCands.map(d=>{
                  const isSat=wdIsSat(d),isSun=wdIsSun(d);
                  const lc=isSat?"#3B82F6":isSun?"#FF4757":"#4B5563";
                  return(<button key={d} onClick={()=>addAllFromWeekday(d)}
                    style={{padding:"6px 14px",borderRadius:8,fontSize:13,fontWeight:700,border:`1px solid ${lc}`,cursor:"pointer",background:"var(--c-input)",color:lc}}>
                    {wdLabelFull(d)}
                  </button>);
                })}
              </div>
            </div>);
          })()}
        </div>
        {(()=>{
          // 最新から3個前の期間より古い設定済み日付は非表示（データは削除せず表示フィルタのみ）。設定済み日付の選択は単一選択。
          const dcCutoff=dateCandidateDisplayCutoff(periods);
          const dispDates=Object.keys(settings.dateCandidates||{}).sort().filter(dt=>dcCutoff===null||dt>=dcCutoff);
          if(dispDates.length===0)return null;
          return(<div style={{marginTop:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--c-text3)",marginBottom:8}}>設定済みの日付</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{dispDates.map(dt=>{const sel=selDates.includes(dt);return(<button key={dt} onClick={()=>setSelDates(prev=>(prev.length===1&&prev[0]===dt)?[]:[dt])} style={{padding:"4px 9px",borderRadius:4,background:sel?"var(--c-accent)":"var(--c-border)",border:`1px solid ${sel?"var(--c-accent)":"var(--c-border2)"}`,color:"var(--c-text)",fontSize:11,fontWeight:600,cursor:"pointer"}}>{dt.replace(/-/g,"/")}（{((settings.dateCandidates||{})[dt]||[]).length}件）</button>);})}</div>
          </div>);
        })()}
      </AC>}

      {mode==="break"&&(()=>{
        const attrOpts=getAttrOptions(settings);
        const attrName=id=>{const f=attrOpts.find(a=>a[0]===id);return f?f[1]:id;};
        const dtColor=dt=>dt==="sat"?"#3B82F6":(dt==="sun"||dt==="hol"||dt==="holSat"||dt==="holSun")?"#FF4757":"var(--c-accent)";
        const removeBreak=(dt,i)=>{const bt={...(settings.breakTimes||{})};bt[dt]=[...(bt[dt]||[])];bt[dt].splice(i,1);onSave({...settings,breakTimes:bt});setEditTagKey(null);tt("削除しました");};
        // tagsが空になったらキー自体を削除する。undefinedのまま残すとFirebaseのset()が同期例外を投げ、
        // この保存が失われるだけでなく、settings stateに残ったundefinedのせいで以降の設定保存も全て失敗する
        const toggleTag=(dt,i,tagId)=>{const bt={...(settings.breakTimes||{})};bt[dt]=[...(bt[dt]||[])];const cur=bt[dt][i]||{};const tags=[...(cur.tags||[])];const p=tags.indexOf(tagId);if(p>=0)tags.splice(p,1);else tags.push(tagId);const nb={...cur};if(tags.length)nb.tags=tags;else delete nb.tags;bt[dt][i]=nb;onSave({...settings,breakTimes:bt});};
        return(<AC title="休憩時間設定">
        {breakModeOf(settings)==="length"
          ?<div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>この店舗は休憩の決め方が「長さ方式」なので、勤務時間から引く休憩は設定タブの長さ方式の分です。ただし属性ありの休憩は、その属性の人の勤務が丸ごと含む日に長さ方式より優先して引きます。全属性の休憩（タグなし）は、ヒートマップで人数を外す時間帯にだけ使います。</div>
          :<div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>設定した休憩時間は出勤〜退勤から自動的に差し引かれ、純勤務時間として表示されます。</div>}
        {(()=>{const t=lengthBandMismatchText(lengthBandMismatchOf(settings));return t
          ?<div data-break-mismatch style={{marginBottom:10,padding:"8px 10px",borderRadius:8,fontSize:12,lineHeight:1.6,background:"#FEF3C7",color:"#92400E",border:"1px solid #F59E0B"}}>{t}</div>:null;})()}
        {/* 適用条件の正本は getBreaksFor（app-utils.js）。2026-08-25〜08-31 の決定3で「重なる日」から
            「丸ごと含む日」へ絞り、片側セルを対象外にしたが、この注記だけが 2026-07-10 の旧仕様のまま
            6週間残っていた（バグチェック#114）。条件を変えるときはこの文も同じコミットで直す。 */}
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>休憩は勤務時間が休憩時間帯を丸ごと含む日にのみ適用されます（出勤が休憩開始より前・退勤が休憩終了より後）。出勤・退勤の片方だけを入力した日には適用されません。</div>
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>タグを設定した休憩はその属性のスタッフにのみ適用されます。タグなしの休憩は、タグ付き休憩がない属性のスタッフに適用されます。</div>
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>日区分は必要ポジション設定と同じ5分類です。祝日は「連休中・単日」と「最終日」に分かれ、各日付は候補タブの日付別で選んだ区分に自動で追従します。</div>
        {/* 追加フォーム */}
        <div>
          <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:8,fontWeight:600}}>休憩を追加</div>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {POSITION_DAY_TYPES.map(([dt,l])=>{const sel=selDayType===dt;const c=dtColor(dt);
              return(<button key={dt} onClick={()=>setSelDayType(dt)} style={{padding:"7px 14px",borderRadius:12,fontSize:13,fontWeight:700,border:"1px solid",cursor:"pointer",background:sel?c:"var(--c-input)",borderColor:sel?"transparent":"var(--c-border2)",color:sel?"white":c}}>{l}</button>);
            })}
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:5}}>適用する属性（未選択＝全属性）</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {attrOpts.map(([aid,anm])=>{const on=brkTags.includes(aid);return(<button key={aid} onClick={()=>toggleArr(brkTags,setBrkTags,aid)} style={{padding:"5px 12px",borderRadius:12,fontSize:12,fontWeight:600,border:"1px solid",cursor:"pointer",background:on?"var(--c-accent)":"var(--c-input)",borderColor:on?"transparent":"var(--c-border2)",color:on?"white":"var(--c-text2)"}}>{anm}</button>);})}
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <SingleTimeSelect value={brkStart} onChange={setBrkStart} label="開始時刻"/>
            <div style={{color:"var(--c-text4)",paddingBottom:12,fontSize:16}}>〜</div>
            <SingleTimeSelect value={brkEnd} onChange={setBrkEnd} label="終了時刻"/>
            <button onClick={()=>{
              if(!brkStart||!brkEnd){tt("▲ 開始・終了を選択してください");return;}
              if(brkStart>=brkEnd){tt("▲ 終了は開始より後にしてください");return;}
              const bt={...(settings.breakTimes||{weekday:[],sat:[],sun:[],holSat:[],holSun:[]})};
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
          {[...POSITION_DAY_TYPES,...(((settings.breakTimes||{}).hol||[]).length?[["hol","祝日（旧設定・自動適用中）"]]:[])].map(([dt,l])=>{
            const brks=(settings.breakTimes||{})[dt]||[];
            const lc=dtColor(dt);
            return(
              <div key={dt} style={{marginBottom:8,background:"var(--c-input2)",borderRadius:8,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderBottom:brks.length>0?"1px solid var(--c-border)":"none"}}>
                  <span style={{fontSize:13,fontWeight:700,color:lc}}>{l}</span>
                  <span style={{fontSize:11,color:brks.length>0?"var(--c-text4)":"var(--c-border2)"}}>{brks.length>0?`${brks.length}件`:"未設定"}</span>
                </div>
                {brks.map((b,i)=>{
                  const ek=`${dt}_${i}`;const tags=b.tags||[];
                  return(<div key={i} style={{padding:"8px 12px",borderBottom:i<brks.length-1?"1px solid var(--c-border)":"none"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                      <span style={{fontSize:13,color:"var(--c-text)",fontWeight:600}}>{b.start} 〜 {b.end}</span>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setEditTagKey(editTagKey===ek?null:ek)} style={{padding:"4px 10px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text2)",fontSize:12,fontWeight:600,cursor:"pointer"}}>タグ</button>
                        <button onClick={()=>removeBreak(dt,i)} style={AD}>削除</button>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:5}}>
                      {tags.length>0?tags.map(tg=>(<span key={tg} style={{fontSize:11,padding:"2px 8px",borderRadius:12,background:"rgba(248,112,54,.12)",color:"var(--c-accent)",fontWeight:600}}>{attrName(tg)}</span>))
                        :<span style={{fontSize:11,color:"var(--c-text4)"}}>全属性</span>}
                    </div>
                    {editTagKey===ek&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8,paddingTop:8,borderTop:"1px dashed var(--c-border)"}}>
                      {attrOpts.map(([aid,anm])=>{const on=tags.includes(aid);return(<button key={aid} onClick={()=>toggleTag(dt,i,aid)} style={{padding:"5px 12px",borderRadius:12,fontSize:12,fontWeight:600,border:"1px solid",cursor:"pointer",background:on?"var(--c-accent)":"var(--c-input)",borderColor:on?"transparent":"var(--c-border2)",color:on?"white":"var(--c-text2)"}}>{anm}</button>);})}
                    </div>}
                  </div>);
                })}
              </div>
            );
          })}
        </div>
      </AC>);
      })()}

      {posTypeModal&&(()=>{
        const opts=(posTypeModal.types||[]).map(pt=>[pt,(POSITION_DAY_TYPES.find(t=>t[0]===pt)||[])[1]||pt]);
        return(<div onClick={()=>setPosTypeModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--c-card)",borderRadius:12,padding:"20px",maxWidth:360,width:"100%",boxShadow:"0 10px 40px var(--c-shadow)"}}>
            <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>この日のポジション設定を選んでください</div>
            <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:14}}>{posTypeModal.date.replace(/-/g,"/")} の候補が複数の曜日設定と一致します。必要ポジション判定でどの曜日区分を使うか選べます。</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {opts.map(([pt,l])=>(
                <button key={pt} onClick={()=>applyPosType(posTypeModal.date,pt)} style={{padding:"11px 14px",borderRadius:8,background:"var(--c-input)",border:"1px solid var(--c-border2)",color:"var(--c-text)",fontSize:14,fontWeight:600,cursor:"pointer",textAlign:"left"}}>{l}</button>
              ))}
              <button onClick={()=>applyPosType(posTypeModal.date,null)} style={{padding:"11px 14px",borderRadius:8,background:"transparent",border:"1px solid var(--c-border)",color:"var(--c-text3)",fontSize:13,fontWeight:600,cursor:"pointer",textAlign:"left"}}>選択しない（自動判定）</button>
            </div>
          </div>
        </div>);
      })()}
    </div>
  );
}

// ===== 提出一覧タブ =====
function SubsTab({subs,periods,staffList,onSave,tt,settings={},onSaveSettings,plan="free",onLoadPastSubs,pastSubsLoaded=false}){
  // 直近3ヶ月より古い期間が存在し、まだ過去分を読み込んでいなければ「過去参照」ボタンを出す
  const hasOlderPeriods=periods.some(p=>p&&p.startDate&&p.startDate<subsWindowCutoff());
  const[fn,setFn]=useState(""),[fp,setFp]=useState("all");
  const fpInit=useRef(false);
  useEffect(()=>{if(!fpInit.current&&periods.length>0){fpInit.current=true;const lat=[...periods].sort((a,b)=>new Date(b.startDate||0)-new Date(a.startDate||0))[0];if(lat)setFp(lat.id);}},[periods.length]);
  const[sf,setSf]=useState("submittedAt"),[sdr,setSdr]=useState("desc");
  const[det,setDet]=useState(null);
  const[linkTarget,setLinkTarget]=useState(null); // {subName, selectedStaff}
  const isPro=plan==="pro"||plan==="premium";
  const isPremium=plan==="premium";
  const staffAliases=settings.staffAliases||{};
  // 「別名を登録」を出すかは **その提出が属する期間の名簿** で決める（isUnregisteredSubName・app-utils.js）。
  // 期限付き削除で名前を残した期間では、シフト作成グリッド・Excel・PDF に本人の列が出ている一方、
  // ここだけが生の staffList を見ていたため、本人が提出すると「別名を登録」が出ていた。
  const periodById=useMemo(()=>{const m=new Map();periods.forEach(p=>{if(p&&p.id)m.set(p.id,p);});return m;},[periods]);
  const isUnregisteredSub=sub=>isUnregisteredSubName(sub.staffName,staffList,staffAliases,periodById.get(sub.periodId));
  // 週・月・連続日数の上限判定は「期間をまたいだ実際の勤務」で数える。1つのsubは1期間ぶんの日付しか持たないため、
  // sub自身のshiftsだけで数えると、期間の境界にかかる週と、periodUnit:"2week" のときの月が必ず過少になる
  // （実測: 8月を2週×2期間で20日×8h＝160h働いても、月上限100hの判定は両期間とも false）。
  // 同じ「その週/月の勤務時間」を、シフト作成タブの getWeekMin（_getWorkShift 経由）と
  // 詳細モーダルの週間勤務時間/月計（:3074・wSS フォールバック）は既に期間跨ぎで出しており、
  // 行バッジの判定だけが期間内に閉じていた。同じ問いに2つの式がある状態を、多数派（期間跨ぎ）へ揃える。
  // 別名も必ず解決する: registerAlias は sub.staffName を書き換えないため、別名で出された提出は別名のまま残る。
  // 「2週間」上限（biweekly）は週を2つずつ組にして合算していたが、組の起点が weekMap のキー順＝そのsubが
  // たまたま触れた週に依存するため、①期間の境界をまたぐ連続2週が一度も合算されない ②同じ勤務でも期間の
  // 区切り方で判定が反転する、の2つが起きていた（実測: 連続2週で70h・上限60h が両期間とも false。
  // 同じ勤務を週境界に揃った1期間で見ると true）。任意日数の上限（customDays/customHours）は同じ式の中で
  // 既に「各出勤日を起点にN日間を前方に合算する」スライディング窓で正しく書かれており、biweekly はその
  // 5分前に書かれたまま更新されていなかった（8334f8e 23:24 → 8501732 23:29）。窓の実装を _windowVio に
  // 一本化して biweekly を days=14 で通す。以後どちらかだけが直る形にはならない。
  // 重複キー（同じ staffName|date が複数のsubにある）は「最初の1件」を採る。期間の重複は PEF に
  // バリデーションが無いため作成でき、重なった日に両方の期間へ提出があるとキーが衝突する。
  // 同じ形のマップが2つあり、ShiftEditTab の workShiftByStaffDate は !m.has(k) で最初を、
  // subsByKey も「重複時はfindと同じ最初の1件を採用」とコメントで明示しているのに、
  // ここだけ無条件 set ＝最後の1件だった（実測: 重なった週の勤務時間が シフト作成タブ 25:00 に対し
  // 提出一覧 65:00 と食い違い、週上限40hの判定が画面ごとに反転した）。衝突が無い通常時の挙動は不変。
  const shiftByStaffDate=useMemo(()=>{const m=new Map();subs.forEach(s=>{if(!s||!s.shifts)return;Object.keys(s.shifts).forEach(d=>{const sh=s.shifts[d];const k=s.staffName+"|"+d;if(sh&&sh.status==="work"&&!m.has(k))m.set(k,sh);});});return m;},[subs]);
  const _shiftAt=(name,date)=>resolveSubByAlias(n=>shiftByStaffDate.get(n+"|"+date),name,staffAliases);
  const _workDatesOf=name=>{const names=[name,...(staffAliases[name]||[])];const out=new Set();shiftByStaffDate.forEach((_v,k)=>{const i=k.lastIndexOf("|");if(names.includes(k.slice(0,i)))out.add(k.slice(i+1));});return[...out].sort();};
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
  // source:"grid" はシフト作成タブが直接作成したsub（スタッフのURL提出ではない）なので提出一覧には出さない
  // 提出日時での並べ替えは subLastActionTime（再提出＝変更ありはupdatedAt）を使い、再提出も新規提出と同じ土俵で上位に来るようにする
  // 氏名の絞り込み・並べ替えは表示名（resolveAlias で解決した登録名）でも突き合わせる。
  // 生の s.staffName だけを見ると、別名で提出されたsubは行に「田中」と表示されているのに「田中」で
  // 絞り込むと消える＝画面に出ている名前でその行を引けない。氏名列の並べ替えも同じ理由で表示名を使う
  // （生の別名でも従来どおり引けるよう、絞り込みは生の名前との一致も残す＝ヒットが減ることはない）。
  const dispName=s=>resolveAlias(s.staffName,staffAliases);
  const fil=subs.filter(s=>s.source!=="grid"&&(!fn||s.staffName.includes(fn)||dispName(s).includes(fn))&&(fp==="all"||s.periodId===fp)).sort((a,b)=>{let va=sf==="submittedAt"?subLastActionTime(a):(sf==="staffName"?dispName(a):(a[sf]||"")),vb=sf==="submittedAt"?subLastActionTime(b):(sf==="staffName"?dispName(b):(b[sf]||""));return(va<vb?-1:va>vb?1:0)*(sdr==="asc"?1:-1);});
  const gpl=id=>periods.find(p=>p.id===id)?.label||"不明";
  const saveAdj=(subId,date,field,value)=>{
    const newSubs=subs.map(s=>{if(s.id!==subId)return s;const sh={...(s.shifts||{})};sh[date]={...sh[date]};if(value!==""&&value!=null)sh[date][field]=value;else delete sh[date][field];return{...s,shifts:sh};});
    onSave(newSubs);
    // 退勤≦出勤（項目12・案C）。**保存は止めない**——シフト作成タブの applyEditToSubs と
    // 同じ isTimeOrderInvalid を通す。片方だけに入れると同じ状態をもう一方の入口から作れる。
    {const after=(newSubs.find(x=>x.id===subId)||{}).shifts;
     if(after&&isTimeOrderInvalid(after[date])&&tt)tt(TIME_ORDER_ERROR_HINT);}
    setDet(prev=>{if(!prev||prev.id!==subId)return prev;const sh={...(prev.shifts||{})};sh[date]={...sh[date]};if(value!==""&&value!=null)sh[date][field]=value;else delete sh[date][field];return{...prev,shifts:sh};});
  };
  // 休暇種別のプルダウン。**シフト作成タブの ko（終日）と同じ形で書く**——leaveTypes だけを書くと
  // 休み扱い（adminRest）が付かず、出勤時刻が残った日が「実働8h＋有給1日」と二重に数えられ、
  // 外す側も adminRest が残るので「公休」に戻って外せなかった（バグチェック#148）。
  const applyLeave=(sd0,type)=>{
    const sd={...(sd0||{status:"work"})};
    delete sd.leaveType;
    if(type){
      sd.leaveTypes={start:type,end:type};
      sd.adminRest={...(sd.adminRest||{}),start:true,end:true};
      delete sd.adjustedStart;delete sd.adjustedEnd;
      delete sd.adjustedStartNote;delete sd.adjustedEndNote;
      delete sd.adjustedStartFixed;delete sd.adjustedEndFixed;
    }else{
      delete sd.leaveTypes;
      const ar={...(sd.adminRest||{})};delete ar.start;delete ar.end;
      if(Object.keys(ar).length)sd.adminRest=ar;else delete sd.adminRest;
    }
    return sd;
  };
  const saveLeave=(subId,date,type)=>{
    const upd=s=>{const sh={...(s.shifts||{})};sh[date]=applyLeave(sh[date],type);return{...s,shifts:sh};};
    onSave(subs.map(s=>s.id===subId?upd(s):s));
    setDet(prev=>(!prev||prev.id!==subId)?prev:upd(prev));
  };
  // 詳細モーダルの勤務時間も「その提出の期間の属性」で引く。行の上限判定（:3815 の pAttrSettings）だけが
  // keepAttrs を当てていたため、keepAttrs を持つ期間では **同じ提出の同じ日** が行とモーダルで食い違っていた
  // （実測: 属性タグ付き休憩 60分/120分 の店舗で 行 8:00 / モーダル 7:00）。休憩は属性タグで絞るので、
  // 属性が違えば引かれる休憩が変わり、勤務計・週間勤務時間・月計・各日の時間・合計がまとめてずれる。
  const detAttrSettings=det?applyKeepAttrs(settings,periods.find(p=>p.id===det.periodId)):settings;
  return(<div>
    <AT>提出一覧</AT>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <input value={fn} onChange={e=>setFn(e.target.value)} placeholder="氏名で絞り込み" style={{flex:1,minWidth:130,padding:"10px 14px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none"}}/>
      <select value={fp} onChange={e=>setFp(e.target.value)} style={{padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none",cursor:"pointer"}}>
        <option value="all">全期間</option>
        {periods.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </div>
    <div style={{marginBottom:12,fontSize:13,color:"var(--c-text3)"}}>件数：<strong style={{color:"#FFA070",fontSize:16}}>{fil.length}</strong></div>
    {onLoadPastSubs&&(pastSubsLoaded
      ?<div style={{marginBottom:12,fontSize:12,color:"var(--c-text3)"}}>過去のすべての提出データを読み込みました</div>
      :hasOlderPeriods&&<button onClick={onLoadPastSubs} style={{...AGray,marginBottom:12,fontSize:13,padding:"8px 14px"}}>3ヶ月より前の提出データも読み込む</button>)}
    <div style={{background:"var(--c-card)",border:"1px solid var(--c-border)",borderRadius:12,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr>
            {[["staffName","氏名"],["submittedAt","提出日時"]].map(([f,l])=><th key={f} onClick={()=>tg(f)} style={{background:"var(--c-input)",color:"var(--c-text2)",padding:"10px 14px",textAlign:"left",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",borderBottom:"1px solid var(--c-border)"}}>{l}{sf===f?(sdr==="asc"?" ▲":" ▼"):" ↕"}</th>)}
            {["出勤","操作"].map(h=><th key={h} style={{background:"var(--c-input)",color:"var(--c-text2)",padding:"10px 14px",textAlign:"left",fontWeight:600,whiteSpace:"nowrap",borderBottom:"1px solid var(--c-border)"}}>{h}</th>)}
          </tr></thead>
          <tbody>{fil.length===0
            ?<tr><td colSpan={4} style={{textAlign:"center",color:"var(--c-text4)",padding:24}}>提出データがありません</td></tr>
            :fil.map(sub=>{const resolvedName=resolveAlias(sub.staffName,staffAliases);const ds=Object.keys(sub.shifts||{}).sort(),wkDays=ds.filter(d=>sub.shifts[d]&&sub.shifts[d].status==="work");const att=wkDays.reduce((acc,d)=>{const sh=sub.shifts[d];return acc+(shiftBandInfo(sh,settings).attendance||1);},0);const attLabel=`${att}日`;const at=new Date(sub.submittedAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});const subPeriod=periods.find(p=>p.id===sub.periodId);const hasRealUpdate=subHasRealUpdate(sub,subPeriod?.deadlineDate);
              // 上限超過の判定に使う属性は **その提出の期間の属性**。このタブは他タブと違い
              // resolvePeriodMaster を通していないので、ここで keepAttrs だけを当てる
              // （当てないと、属性を戻した瞬間に過去の提出が現在の上限で再判定されて赤線が出る）。
              // 休憩の属性タグ（getBreaksFor）も同じ属性で引く必要があるので同じ settings を渡す。
              const pAttrSettings=applyKeepAttrs(settings,subPeriod);
              const staffType=isPremium?(((pAttrSettings.staffAttributes)||{})[resolvedName]||"parttime"):null;const typeLimRaw=staffType?((settings.staffTypeLimits)||{})[staffType]:null;const typeLim={...STAFF_LIMIT_DEFAULTS,...(typeLimRaw&&typeof typeLimRaw==="object"?typeLimRaw:{})};let dailyVio=false,weeklyVio=false,biweeklyVio=false,monthlyVio=false,customVio=false;if(isPremium&&staffType&&hasAnyStaffLimit(typeLim)){const weekMap={};const monthMap={};const _min=(n,d2)=>{const sh=_shiftAt(n,d2);return sh?calcNetWorkMinutes(sh,getBreaksFor(pAttrSettings,d2,n,sh),getOT(n,settings,sh),settings):0;};/* 1日上限も _min（_shiftAt 経由）で引く。このバッジが出す5つの判定のうち、週・2週・月・任意日数の
   4つは _min を通すのに、1日だけが sub.shifts[d] を直に読んでいた＝同じ人・同じ日について別のシフトを
   見うる。同じ名前|日付のシフトが2つある状態は別名だけでなく **期間の重なり** でも作れる（PEF は
   重なりを警告のみで通す・2026-08-25 決定 案B）ので、別名を使わない店舗でも到達する。
   実測: 9/1 が両方に含まれる2期間で、片方が 9:00-18:00・もう片方が 9:00-13:00 のとき、
   行は「1日超過」バッジ（9:00 と判定）を出すのに、同じ行の週集計と詳細モーダルの週間勤務時間は
   4:00 を数えていた。重複が無い通常時は 28 ケースすべてで現行と同じ分数を返すことを確認済み。 */
ds.forEach(d=>{const nm=_min(resolvedName,d);if(limitStateOf(nm,typeLim.daily)==="over")dailyVio=true;});const wkSet2=new Set(),moSet2=new Set();ds.forEach(d=>{const dt=pd(d),dow=dt.getDay(),mon=new Date(dt);mon.setDate(dt.getDate()-(dow===0?6:dow-1));wkSet2.add(fd(mon));moSet2.add(d.slice(0,7));});wkSet2.forEach(monStr=>{let tot=0;for(let i=0;i<7;i++){const dd=pd(monStr);dd.setDate(dd.getDate()+i);tot+=_min(resolvedName,fd(dd));}weekMap[monStr]=tot;});moSet2.forEach(mo=>{let tot=0;const[yy,mm]=mo.split("-").map(Number);const dim=new Date(yy,mm,0).getDate();for(let i=1;i<=dim;i++)tot+=_min(resolvedName,`${mo}-${String(i).padStart(2,"0")}`);monthMap[mo]=tot;});let _awCache=null;const _allWork=()=>(_awCache||(_awCache=_workDatesOf(resolvedName)));/* 上限を窓ごとに見る（目安は判定しない・2026-09-28）。 */
const _windowStates=(days,upH)=>{const startDs=ds.filter(d=>{const sh=sub.shifts[d];return sh&&sh.status==="work";}).sort();const allWork=_allWork();const r={over:false};for(const sd of startDs){const start=pd(sd);let tot=0;for(const d2 of allWork){if(d2<sd)continue;const diffD=(pd(d2)-start)/86400000;if(diffD>=days)break;tot+=_min(resolvedName,d2);}if(limitStateOf(tot,upH)==="over")r.over=true;}return r;};
Object.values(weekMap).forEach(wm=>{if(limitStateOf(wm,typeLim.weekly)==="over")weeklyVio=true;});
if(typeLim.biweekly){biweeklyVio=_windowStates(14,typeLim.biweekly).over;}
/* 1ヶ月の上限は月ごとに暦日数で日割り＋残業（attrMonthFrameOf・2026-09-28）。monthMap のキーは "YYYY-MM" */
Object.entries(monthMap).forEach(([mo,mm])=>{if(limitStateOf(mm,attrMonthFrameOf(typeLim,mo).capMin/60)==="over")monthlyVio=true;});
if(typeLim.customDays&&typeLim.customHours){customVio=_windowStates(typeLim.customDays,typeLim.customHours).over;}}const hasVio=dailyVio||weeklyVio||biweeklyVio||monthlyVio||customVio;
              {/* 超過行は塗りつぶさず左に線を引く。塗ると行内の他の情報が読みにくくなる。
                  線は tr ではなく先頭の td に置くこと: WebKit(Safari/iOS Safari) は tr への
                  box-shadow を描画しないため、tr に置くと Safari でだけ目印が消える
                  （getComputedStyle は指定どおりの値を返すので気づけない。実測: バグチェック#72） */}
              return(<tr key={sub.id}>
              <td style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,0,0,.03)",color:"var(--c-text)",fontWeight:600,...(hasVio?{boxShadow:"inset 2px 0 0 #FF4757"}:{})}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span>{resolvedName}</span>
                  {/* 「変更あり」と「別名を登録」は管理者の対応が要る項目。同じアクセント塗りに揃えて
                      「オレンジの箱がある行＝手を動かす必要がある行」という規則を1つだけ作る */}
                  {hasRealUpdate&&<span style={{fontSize:10,background:"var(--c-accent)",color:"#fff",padding:"2px 7px",borderRadius:4,fontWeight:700}}>変更あり</span>}
                  {/* 超過は異常だが「今すぐ操作する」項目ではないので、要対応バッジとは別の見え方にする */}
                  {hasVio&&<span style={{fontSize:11,color:"#FF4757",fontWeight:700,whiteSpace:"nowrap"}}>{[dailyVio&&"1日超過",weeklyVio&&"週超過",biweeklyVio&&"2週超過",monthlyVio&&"月超過",customVio&&"任意超過"].filter(Boolean).join(" / ")}</span>}
                  {isPro&&isUnregisteredSub(sub)&&(
                    linkTarget?.subName===sub.staffName
                      ?<div style={{display:"flex",alignItems:"center",gap:4,marginTop:4,width:"100%"}}>
                        <select defaultValue="" onChange={e=>e.target.value&&registerAlias(sub.staffName,e.target.value)}
                          style={{fontSize:16,padding:"3px 6px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:4,color:"var(--c-text)",cursor:"pointer"}}>
                          <option value="">スタッフを選択</option>
                          {staffList.filter(s=>!isSpacer(s)).map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={()=>setLinkTarget(null)} style={{background:"none",border:"none",color:"var(--c-text4)",cursor:"pointer",fontSize:12}}>✕</button>
                      </div>
                      :<button onClick={()=>setLinkTarget({subName:sub.staffName})}
                        style={{fontSize:10,background:"var(--c-accent)",color:"#fff",border:"none",padding:"2px 8px",borderRadius:4,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                        別名を登録
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
                <button onClick={()=>setDet({...sub,staffName:resolvedName})} style={{padding:"5px 10px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:4,color:"var(--c-text2)",fontSize:12,cursor:"pointer",marginRight:4}}>詳細</button>
                {/* 一覧の行なので、対象名を出さないと隣の「詳細」と押し間違えても気づけない（gap 4px・#74実測）。
                    saveSubs は deletedId を受けると flat[deletedId]=null で sub 全体を消す＝archived退避なし。
                    ただし本人が再提出できるので「元に戻せない」ではなく再提出が要ると書く。
                    スタッフ側の同じ操作（app-staff.js:589）は既に対象名を出している */}
                {isPro&&<button onClick={()=>{if(!confirm(`「${resolvedName}」の提出を削除しますか？${ds.length>0?`\n${ds.length}日分の希望が消えます（戻すには本人の再提出が必要です）。`:""}`))return;onSave(subs.filter(s=>s.id!==sub.id),sub.id);tt("削除しました");}} style={AD}>削除</button>}
              </td>
            </tr>);})}
          </tbody>
        </table>
      </div>
    </div>
    {det&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"fI .2s"}} onClick={()=>setDet(null)}>
      <div style={{background:"var(--c-card)",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:560,maxHeight:"88vh",overflow:"hidden",display:"flex",flexDirection:"column",animation:"sU .25s"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"var(--c-border2)",borderRadius:4,margin:"10px auto 0"}}/>
        <div style={{padding:"12px 20px 14px",borderBottom:"1px solid var(--c-border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontSize:16,fontWeight:700,color:"var(--c-text)"}}>{det.staffName}</div><div style={{fontSize:12,color:"var(--c-text4)",marginTop:2}}>{gpl(det.periodId)} ／ {new Date(det.submittedAt).toLocaleString("ja-JP")} 提出</div></div>
          <button onClick={()=>setDet(null)} style={{background:"var(--c-input)",border:"none",borderRadius:"50%",width:32,height:32,color:"var(--c-text2)",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{overflowY:"auto",padding:"8px 16px 24px"}}>
          {isPremium&&(()=>{const dDs=Object.keys(det.shifts||{}).sort();const dWorkDs=dDs.filter(d=>det.shifts[d]?.status==="work");const dAtt=dWorkDs.reduce((acc,d)=>{const sh=det.shifts[d];return acc+(shiftBandInfo(sh,settings).attendance||1);},0);const dTot=dDs.reduce((a,d)=>a+calcNetWorkMinutes(det.shifts[d],getBreaksFor(detAttrSettings,d,det.staffName,det.shifts[d]),getOT(det.staffName,settings,det.shifts[d]),settings),0);const detOTMax=dDs.reduce((mx,d)=>{const s=det.shifts[d];return s&&s.status==="work"?Math.max(mx,getOT(det.staffName,settings,s)):mx;},0);const SB=(l,v,c,bg)=>(<div style={{background:bg,borderRadius:8,padding:"6px 10px",textAlign:"center",border:`1px solid ${c}33`,minWidth:56}}><div style={{fontSize:10,color:"var(--c-text4)",marginBottom:1}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div></div>);return(<div style={{display:"flex",gap:6,flexWrap:"wrap",padding:"8px 0 4px"}}>{SB("出勤",`${dAtt}日`,"#FFA070","rgba(248,112,54,.1)")}{dTot>0&&SB("勤務計",fmtMin(dTot),"var(--c-text2)","var(--c-input)")}{detOTMax>0&&SB("延長",`+${detOTMax}分`,"#10B981","rgba(52,211,153,.1)")}</div>);})()}
          {/* 週・月の集計は日付ごとに _shiftAt で1シフトだけ引く（行の上限判定 :3044 の _min と同じ引き方に揃える）。
              sub を走査して足すと、同一人物・同一日に2つのsubがあるとき（別名ぶん＋登録名ぶん）に同じ日を二重計上する。
              属性・退勤延長は「登録名」をキーに持つ設定（staffAttributes / overtimeSettings.byStaff）なので、
              別名で提出されたsubの日でも det.staffName（解決済みの登録名）で引く。 */}
          {isPremium&&(()=>{const wP=periods.find(p=>p.id===det.periodId);if(!wP)return null;const wSS=subs.filter(s=>s.staffName===det.staffName||(staffAliases[det.staffName]||[]).includes(s.staffName));const perDs=gd(wP.startDate,wP.endDate);const wkSet=new Set();perDs.forEach(d=>{const dt=pd(d),dow=dt.getDay(),mon=new Date(dt);mon.setDate(dt.getDate()-(dow===0?6:dow-1));wkSet.add(fd(mon));});const weeks=[...wkSet].sort();const mo=wP.startDate.slice(0,7);const _dayMin=d=>{const sh=_shiftAt(det.staffName,d);return sh?calcNetWorkMinutes(sh,getBreaksFor(detAttrSettings,d,det.staffName,sh),getOT(det.staffName,settings,sh),settings):0;};const moDs=new Set();wSS.forEach(s=>Object.keys(s.shifts||{}).forEach(d=>{if(d.startsWith(mo))moDs.add(d);}));let moTot=0;moDs.forEach(d=>{moTot+=_dayMin(d);});const wkData=weeks.map(monStr=>{let tot=0;for(let i=0;i<7;i++){const dd=new Date(pd(monStr));dd.setDate(pd(monStr).getDate()+i);tot+=_dayMin(fd(dd));}return{monStr,tot};});return(<div style={{marginBottom:4}}><div style={{fontSize:11,fontWeight:700,color:"var(--c-text3)",margin:"6px 0 5px"}}>週間勤務時間</div><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{wkData.map(({monStr,tot})=>{const m=pd(monStr);const sun=new Date(m);sun.setDate(m.getDate()+6);const lbl=`${m.getMonth()+1}/${m.getDate()}〜${sun.getMonth()+1}/${sun.getDate()}`;return(<div key={monStr} style={{background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,padding:"5px 8px",textAlign:"center",minWidth:76}}><div style={{fontSize:9,color:"var(--c-text4)"}}>{lbl}</div><div style={{fontSize:12,fontWeight:700,color:tot>0?"var(--c-text2)":"var(--c-text4)"}}>{tot>0?fmtMin(tot):"−"}</div></div>);})}{moTot>0&&<div style={{background:"rgba(248,112,54,.08)",border:"1px solid rgba(248,112,54,.2)",borderRadius:8,padding:"5px 8px",textAlign:"center",minWidth:76}}><div style={{fontSize:9,color:"#FFA070"}}>{mo.replace("-","年")}月計</div><div style={{fontSize:12,fontWeight:700,color:"#FFA070"}}>{fmtMin(moTot)}</div></div>}</div></div>);})()}
          {det.comment&&<div style={{background:"var(--c-input)",borderRadius:8,padding:"10px 12px",margin:"8px 0",fontSize:13,color:"var(--c-text2)"}}>{det.comment}</div>}
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr>{["日付","区分","出勤","退勤",...(isPremium?["休憩","休暇","時間"]:[])].map(h=><th key={h} style={{background:"var(--c-input)",color:"var(--c-text2)",padding:"8px 12px",textAlign:"left",fontWeight:600}}>{h}</th>)}</tr></thead>
            <tbody>{Object.keys(det.shifts||{}).sort().map(ds=>{const d=pd(ds),s=det.shifts[ds],iw=s&&s.status==="work";const detOT2=isPremium&&iw?getOT(det.staffName,settings,s):0;const nm=iw?calcNetWorkMinutes(s,getBreaksFor(detAttrSettings,ds,det.staffName,s),detOT2,settings):0;const effEnd=isPremium&&iw&&detOT2>0&&(s.adjustedEnd??s.end)?`→${(()=>{const en=s.adjustedEnd??s.end;const[h,m]=en.split(":").map(Number);const tot=h*60+m+detOT2;return`${Math.floor(tot/60)}:${String(tot%60).padStart(2,"0")}`;})()}`:null;return(<tr key={ds}>
              <td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)",color:"var(--c-text2)"}}>{d.getMonth()+1}/{d.getDate()}（{WD[d.getDay()]}）</td>
              <td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)"}}>{iw?<span style={{background:"rgba(248,112,54,.15)",color:"#FFA070",border:"1px solid rgba(248,112,54,.3)",padding:"2px 7px",borderRadius:4,fontSize:12,fontWeight:600}}>出勤</span>:<span style={{background:"var(--c-input)",color:"var(--c-text3)",padding:"2px 7px",borderRadius:4,fontSize:12}}>休み</span>}</td>
              <td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)"}}>
                {iw?<div>{isPremium&&<div style={{color:"var(--c-text4)",fontSize:11}}>{s.start}</div>}{isPremium?<select value={s.adjustedStart||""} onChange={e=>saveAdj(det.id,ds,"adjustedStart",e.target.value||"")} style={{fontSize:16,padding:"3px 5px",background:"var(--c-input)",border:`1px solid ${s.adjustedStart?"#3B82F6":"var(--c-border)"}`,borderRadius:4,color:s.adjustedStart?"#3B82F6":"var(--c-text)",cursor:"pointer",marginTop:2,maxWidth:72}}><option value="">提出値</option>{TO.map(t=><option key={t} value={t}>{t}</option>)}</select>:<span style={{fontSize:13,color:"var(--c-text2)"}}>{s.start||"-"}</span>}</div>:"-"}
              </td>
              <td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)"}}>
                {iw?<div>{isPremium&&<div style={{color:"var(--c-text4)",fontSize:11}}>{s.end}</div>}{isPremium?<><select value={s.adjustedEnd||""} onChange={e=>saveAdj(det.id,ds,"adjustedEnd",e.target.value||"")} style={{fontSize:16,padding:"3px 5px",background:"var(--c-input)",border:`1px solid ${s.adjustedEnd?"#3B82F6":"var(--c-border)"}`,borderRadius:4,color:s.adjustedEnd?"#3B82F6":"var(--c-text)",cursor:"pointer",marginTop:2,maxWidth:72}}><option value="">提出値</option>{TO.map(t=><option key={t} value={t}>{t}</option>)}</select>{effEnd&&<div style={{fontSize:10,color:"#10B981",marginTop:2,fontWeight:600}}>{effEnd}（+{detOT2}分）</div>}</>:<span style={{fontSize:13,color:"var(--c-text2)"}}>{s.end||"-"}</span>}</div>:"-"}
              </td>
              {/* 休憩の日別上書き（第3弾・項目8）。空欄＝店舗の設定どおり、0＝休憩なし。
                  saveAdj は "" を削除・0 を値として扱う（0 が falsy で消えないようにしてある）。 */}
              {isPremium&&<td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)"}}>
                {iw?<div>
                  {/* 自動＝灰色（長さ方式・時間帯方式のどちらで決まったか）／手動＝太字。「自動に戻す」は上書きを消す（P3.5a） */}
                  {(()=>{const bd=breakDecisionOf(detAttrSettings,ds,det.staffName,s);const fm=m=>m>0?`${m}分`:"なし";
                    const SRC={length:"長さ",band:"時間帯"};
                    if(bd.source==="manual")return(<div data-break-src="manual" style={{fontSize:11}}>
                      <span style={{fontWeight:700,color:"var(--c-text)"}}>手動 {fm(bd.min)}</span>
                      <span style={{color:"var(--c-text4)",marginLeft:4}}>（自動 {fm(bd.autoMin)}）</span>
                      <button onClick={()=>saveAdj(det.id,ds,"adjustedBreak","")} style={{display:"block",marginTop:2,padding:"2px 6px",background:"transparent",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text3)",fontSize:11,cursor:"pointer"}}>自動に戻す</button>
                    </div>);
                    return(<div data-break-src={bd.source} style={{color:"var(--c-text4)",fontSize:11}}>自動 {fm(bd.min)}{bd.min>0?`（${SRC[bd.source]||""}）`:""}</div>);})()}
                  <input type="number" min={0} max={480} step={5} value={s.adjustedBreak==null?"":s.adjustedBreak}
                    placeholder="設定"
                    onChange={e=>{const v=e.target.value;saveAdj(det.id,ds,"adjustedBreak",v===""?"":Math.max(0,Math.min(480,parseInt(v)||0)));}}
                    style={{fontSize:16,padding:"3px 5px",width:64,background:"var(--c-input)",border:`1px solid ${s.adjustedBreak!=null?"#3B82F6":"var(--c-border)"}`,borderRadius:4,color:s.adjustedBreak!=null?"#3B82F6":"var(--c-text)",marginTop:2}}/>
                </div>:"-"}
              </td>}
              {/* 休暇種別（第3弾・項目9）。グリッドの ko と同じ形で終日の leaveTypes と adminRest を書く（saveLeave）。 */}
              {isPremium&&<td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)"}}>
                <select value={leaveTypeOf(s)||""} onChange={e=>saveLeave(det.id,ds,e.target.value||null)}
                  style={{fontSize:16,padding:"3px 5px",background:"var(--c-input)",border:`1px solid ${leaveTypeOf(s)?"#3B82F6":"var(--c-border)"}`,borderRadius:4,color:leaveTypeOf(s)?"#3B82F6":"var(--c-text)",cursor:"pointer",maxWidth:86}}>
                  <option value="">—</option>
                  {LEAVE_TYPES.map(t=><option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}
                </select>
              </td>}
              {isPremium&&<td style={{padding:"9px 12px",borderBottom:"1px solid var(--c-border)",color:nm>0?"var(--c-text2)":"var(--c-text3)"}}>{iw?fmtMin(nm):"-"}</td>}
            </tr>);})}
            </tbody>
          </table>
          {isPremium&&(()=>{const tot=Object.keys(det.shifts||{}).reduce((acc,ds)=>{const s=det.shifts[ds];return acc+calcNetWorkMinutes(s,getBreaksFor(detAttrSettings,ds,det.staffName,s),getOT(det.staffName,settings,s),settings);},0);return tot>0?<div style={{textAlign:"right",padding:"6px 12px",fontSize:13,color:"var(--c-text2)",fontWeight:700}}>合計：{fmtMin(tot)}</div>:null;})()}
        </div>
      </div>
    </div>}
  </div>);
}

// ============================================================
// マイページ タブ (Phase 4)
// ============================================================
const TERMS_TEXT=`Shifty 利用規約

この利用規約(以下「本規約」)は、TODGE(以下「運営者」)が提供するシフト管理サービス「Shifty」(https://shiftyshifty.app 以下「本サービス」)の利用条件を定めるものです。本サービスを利用することにより、利用者は本規約に同意したものとみなします。

第1条(適用)
1. 本規約は、本サービスの利用に関する運営者と利用者との間の一切の関係に適用されます。
2. 運営者が本サービス上で別途掲載する個別の注意事項等は、本規約の一部を構成します。

第2条(定義)
1. 「店舗」とは、本サービス上で作成されるシフト管理の単位をいいます。
2. 「管理者」とは、店舗を作成・管理する利用者をいいます。
3. 「スタッフ」とは、管理者が共有したURLを通じて希望シフトを提出する利用者をいいます。
4. 「管理コード」とは、店舗の管理権限を端末に付与するためのコードをいいます。

第3条(利用開始)
1. 本サービスは、アカウント登録なしで利用を開始できます。
2. 管理者は、店舗のURLおよび管理コードを自己の責任で管理するものとします。URLまたは管理コードの共有・漏洩により生じた損害について、運営者は責任を負いません。

第4条(プランおよび料金)
1. 本サービスには Free プラン(無料)、Pro プラン(月額500円・税込)、Premium プラン(月額2,980円・税込)があります。有料プランの契約は店舗単位です。
2. 各プランで利用できる機能・上限は、本サービス上に表示するとおりとします。
3. 料金の支払いは、決済代行サービス(Stripe)を通じたクレジットカードによる月額自動更新払いとします。

第5条(解約・返金)
1. 有料プランの解約は、本サービスのマイページから行うことができます(Stripeカスタマーポータル経由)。
2. 解約後も、支払い済みの利用期間の末日までは有料プランの機能を利用できます。期間途中の解約による日割り返金は行いません。
3. 決済が完了しない場合、運営者は有料プランの機能提供を停止し、Freeプラン相当の提供に変更することができます。

第6条(データの保存期間および削除)
1. シフト期間および提出データは、各期間の終了日から36ヶ月間保存され、これを超えたものから順次削除されます。
2. Freeプランの店舗は、最終の利用(データ更新)から1年間更新がない場合、店舗に関するデータ全体が削除の対象となります。削除は約30日間の猶予期間を経て確定します。
3. 有料プラン(Pro・Premium)の課金が継続している店舗は、前項の自動削除の対象外とします。
4. 運営者は、第1項・第2項の削除に先立ち、本サービス上で告知します。利用者は、保管が必要なデータをExcel出力機能等により自己の責任で保存するものとします。
5. 削除されたデータは復元できません。

第7条(利用者の責務)
1. 管理者は、スタッフの氏名その他の情報を本サービスに登録するにあたり、適用される法令(個人情報保護法を含む)に従い、必要な同意の取得その他の対応を自己の責任で行うものとします。
2. 労働関係法令上の帳簿(出勤簿等)の作成・保存義務は管理者に帰属します。本サービスの保存期間はこれらの法定保存期間の充足を保証するものではなく、必要な記録は前条第4項に従い利用者が保管するものとします。
3. 未成年のスタッフに本サービスを利用させる場合、管理者は必要に応じて保護者等の同意取得その他法令上必要な措置を行うものとします。

第8条(禁止事項)
利用者は、本サービスの利用にあたり、以下の行為をしてはなりません。
1. 法令または公序良俗に違反する行為
2. 本サービスのサーバー・ネットワークに過度の負荷をかける行為、不正アクセス、リバースエンジニアリング
3. 他の店舗・利用者のデータへの不正なアクセスまたは取得を試みる行為
4. 本サービスの運営を妨害する行為
5. その他、運営者が合理的な理由に基づき不適切と判断する行為

第9条(サービスの変更・中断・終了)
1. 運営者は、利用者への事前の通知なく、本サービスの内容を変更・追加できるものとします。
2. 運営者は、システム保守、障害、天災その他やむを得ない事由により、本サービスの提供を一時的に中断することができます。
3. 運営者は、30日前までに本サービス上で告知することにより、本サービスの全部または一部の提供を終了することができます。この場合、支払い済みの未経過期間の料金は月割で返金します。

第10条(免責)
1. 運営者は、本サービスが利用者の特定の目的に適合すること、期待する正確性・有用性を有すること、および中断なく利用できることを保証しません。
2. 運営者は、本サービスの利用または利用不能、データの消失・毀損により利用者に生じた損害について、運営者に故意または重過失がある場合を除き、責任を負いません。
3. 運営者が損害賠償責任を負う場合であっても、その総額は、当該利用者(店舗)が直近12ヶ月間に運営者に支払った利用料金の総額を上限とします。
4. 運営者が利用者からの問い合わせに応じて行う説明・案内等は、その正確性および完全性を保証するものではありません。

第11条(個人情報の取扱い)
1. 運営者は、本サービスで取得する情報を、本サービスの提供・改善、料金決済、利用状況の分析、および利用者への連絡の目的でのみ利用します。
2. 運営者は、法令に基づく場合を除き、取得した情報を第三者に提供しません。ただし、本サービスの提供に必要な範囲で、決済代行(Stripe)・データベースおよび認証基盤(Google Firebase)等の業務委託先に取り扱いを委託することがあります。
3. 運営者は、本サービスの利用状況分析のため、Cookieおよびアクセス解析ツールを利用することがあります。

第12条(知的財産権)
本サービスに関する著作権・商標権その他の知的財産権は、運営者または運営者にライセンスを許諾する者に帰属します。利用者は、運営者の書面による事前の承諾なく、本サービスの全部または一部を複製、翻案その他の方法により利用することはできません。

第13条(反社会的勢力の排除)
1. 利用者および運営者は、自己(法人にあってはその役員を含む)が現在、暴力団、暴力団員、暴力団準構成員、暴力団関係企業その他の反社会的勢力(以下「反社会的勢力」といいます)に該当しないこと、および反社会的勢力と密接な関係を有していないことを表明し、将来にわたっても該当しないことを確約します。
2. 利用者が前項の表明保証に違反した場合、運営者は何らの催告を要せず、直ちに利用契約を解除することができます。この場合、運営者は利用者に生じた損害について一切の責任を負いません。

第14条(規約の変更)
1. 運営者は、民法第548条の4の規定に基づき、本規約を変更することができます。
2. 変更後の規約は、本サービス上での掲載その他の適切な方法により周知し、周知の際に定める効力発生日から適用されます。

第15条(通知の方法)
運営者から利用者への通知は、本サービス上での掲示その他運営者が適当と判断する方法により行い、掲示の場合は掲示後24時間を経過した時点で到達したものとみなします。

第16条(権利義務の譲渡禁止)
利用者は、運営者の書面による事前の承諾なく、本規約上の地位または権利義務を第三者に譲渡できません。

第17条(存続条項)
本規約の終了後も、第6条、第10条、第11条および本条の規定は、なお効力を有するものとします。

第18条(分離可能性)
本規約のいずれかの条項が法令に基づき無効または執行不能と判断された場合であっても、当該条項は必要な範囲で修正されるものとし、その他の条項の効力には影響しないものとします。

第19条(準拠法・管轄)
1. 本規約は日本法に準拠し、日本法に従って解釈されます。
2. 本サービスに関して紛争が生じた場合、運営者の所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とします。

附則
- 2026年7月9日 制定
- 2026年7月9日 改定(v1.1: 第三者提供の是正・反社会的勢力の排除・知的財産権・Cookie利用明記・サポート対応範囲の限定・存続条項を追加)
- 2026年7月9日 改定(v1.2: 分離可能性条項・未成年スタッフに関する一文(第7条)・通知の方法を追加)`;

function TermsModal({onClose}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fI .2s"}} onClick={onClose}>
      <div style={{background:"var(--c-card)",border:"1px solid var(--c-border)",borderRadius:12,width:"100%",maxWidth:520,maxHeight:"80vh",display:"flex",flexDirection:"column",animation:"sI .2s",boxShadow:"0 8px 40px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"20px 24px 14px",borderBottom:"1px solid var(--c-border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)"}}>利用規約</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:"var(--c-text3)",cursor:"pointer",padding:4,lineHeight:1}}>✕</button>
        </div>
        <div style={{padding:"18px 24px",overflowY:"auto",whiteSpace:"pre-wrap",fontSize:12.5,lineHeight:1.8,color:"var(--c-text2)"}}>
          {TERMS_TEXT}
        </div>
      </div>
    </div>
  );
}

// ===== プランの購入・変更の唯一の入口 =====
// 契約の作り方が2通りあるため（新規契約=Checkout / 既存契約の価格差し替え=changePlan）、
// 呼び出し側ごとに使い分けると「有料プラン中に新規契約を作ろうとして409」のような
// 食い違いが起きる（2026-08-11 の本番実測）。振り分けはここ1箇所に閉じる。
//   有料プラン中 → changePlan（契約を作り直さないので二重課金が起こらない）
//   Free        → createCheckoutSession（新規契約）
// 手動でプランを付与した店舗のように「有料表示だが契約が無い」ケースがあるため、
// changePlan が no_subscription を返したときだけ Checkout へフォールバックする。
// デモ（#/demo）は誰のものでもない共有店舗を全員が同じ匿名セッションで開く。しかも owners が
// 空なので Cloud Functions のオーナー照合（未claim店舗は許可）も素通りする。ここを通すと
// 訪問者が「自分の店舗ではない店」の決済ページへ飛ばされ、実際に課金されうる。
async function requestPlanAction(shopId,plan,currentPlan){
  if(DEMO_MODE) return{kind:"error",error:"デモではプランの購入・変更はできません"};
  const idToken=await firebaseAuth?.currentUser?.getIdToken().catch(()=>null);
  const headers={"Content-Type":"application/json",...(idToken?{"Authorization":`Bearer ${idToken}`}:{})};
  // 有料プラン中に Checkout へ回った＝「変更」のつもりが「新規契約」になる。呼び出し側が
  // 追加の同意を取れるよう、フォールバックしたことを結果に含める（newContract）。
  let fellBack=false;
  if(currentPlan==="pro"||currentPlan==="premium"){
    try{
      const r=await fetch(`${CF_BASE}/changePlan`,{method:"POST",headers,body:JSON.stringify({shopId,plan})});
      const d=await r.json().catch(()=>({}));
      if(r.ok)return{kind:"changed",applied:d.applied,plan:d.plan,effectiveAt:d.effectiveAt};
      if(d.code!=="no_subscription")return{kind:"error",error:d.error||"プランを変更できませんでした"};
      fellBack=true;
    }catch(e){ return{kind:"error",error:"通信エラーが発生しました"}; }
  }
  try{
    const r=await fetch(`${CF_BASE}/createCheckoutSession`,{
      method:"POST",headers,
      body:JSON.stringify({shopId,plan,successUrl:window.location.href+"?payment=success",cancelUrl:window.location.href+"?payment=cancel"}),
    });
    const d=await r.json().catch(()=>({}));
    if(d.url)return{kind:"checkout",url:d.url,newContract:fellBack};
    return{kind:"error",error:d.error||"決済ページの取得に失敗しました"};
  }catch(e){ return{kind:"error",error:"通信エラーが発生しました"}; }
}

function MyPageTab({plan="free",planExpiry,billingSchedule=null,staffList=[],periods=[],shopId,tt,onUpgrade}){
  const[portalLoading,setPortalLoading]=useState(false);
  const[showTerms,setShowTerms]=useState(false);
  const lim=PLAN_LIMITS[plan]||PLAN_LIMITS.free;
  const isPaid=plan==="pro"||plan==="premium";

  const[changing,setChanging]=useState("");
  const bs=billingSchedule||{};
  // 選べるプラン変更先。現在のプランと、既に切替予約済みのプランは除く（同じ操作を二度押させない）
  const changeOptions=["pro","premium"].filter(p=>p!==plan&&p!==bs.scheduledPlan);
  // プラン変更（Pro⇄Premium）。契約は作り直さずCF側で price を差し替える。
  // アップグレードは即時反映、ダウングレードは期間終了時切替（CFのchangePlan参照）。
  const changePlan=async(next)=>{
    const isUp=(PLAN_RANK_UI[next]||0)>(PLAN_RANK_UI[plan]||0);
    const msg=isUp
      ? `${PLAN_LABELS[next]}プランに変更します。\n\n・すぐに${PLAN_LABELS[next]}の機能が使えるようになります\n・差額のみを即時に請求します（二重請求にはなりません）\n\nよろしいですか？`
      : `${PLAN_LABELS[next]}プランに変更します。\n\n・${PLAN_LABELS[plan]}の機能は${bs.currentPeriodEnd?bs.currentPeriodEnd:"今の期間の終わり"}までご利用いただけます\n・その翌日から${PLAN_LABELS[next]}に切り替わります\n・日割りの返金はありません\n\nよろしいですか？`;
    if(!confirm(msg))return;
    ph("plan_change_requested",{from:plan,to:next});
    setChanging(next);
    const r=await requestPlanAction(shopId,next,plan);
    setChanging("");
    if(r.kind==="error"){ tt("✕ "+r.error); return; }
    // 契約が無い店舗（手動付与・契約が失効した等）はCheckoutへ回る。ここで無言に遷移すると、
    // 上の確認文（「期間の終わりまで使えます」「日割り返金はありません」＝プランの変更の説明）
    // で同意した利用者が、実際には新規の月額契約の決済ページに立たされる。金額と自動更新を
    // 示して同意を取り直す（定期購入の最終確認。Freeからの購入は UpgradeModal が同じ説明を出す）。
    if(r.kind==="checkout"){
      if(r.newContract&&!confirm(
        `この店舗には有効な契約が見つかりませんでした。\n\n`+
        `続けると${PLAN_LABELS[next]}プランの「新規のお申し込み」になります。\n`+
        `・${PLAN_LABELS[next]}プラン ${next==="premium"?"2,980":"500"}円/月（税込・1店舗あたり）\n`+
        `・毎月自動で更新される定期課金です\n`+
        `・お支払いが完了した時点で${PLAN_LABELS[next]}プランに切り替わります\n\n`+
        `決済ページへ移動しますか？`
      )) return;
      window.location.href=r.url; return;
    }
    tt(r.applied==="immediate"
      ? `✓ ${PLAN_LABELS[next]}プランに変更しました`
      : `✓ ${r.effectiveAt||"期間終了時"}から${PLAN_LABELS[next]}プランに変更されます`);
  };

  // プラン変更の予約（ダウングレード）の取り消し。有料プランは2つしかないため、予約が入ると
  // changeOptions が必ず空になり「プランを変更」セクションごと消える。カスタマーポータルにも
  // プラン変更のUIが無い（2026-08-11 実測）ので、この導線が無いと利用者は自分で入れた予約から
  // 降りられず、切替後に再アップグレードして差額を払う以外に戻す手段が無くなる。
  const[cancelingChange,setCancelingChange]=useState(false);
  const cancelPlanChange=async()=>{
    if(DEMO_MODE){ tt("✕ デモではプランの購入・変更はできません"); return; }
    if(!confirm(
      `${PLAN_LABELS[bs.scheduledPlan]}プランへの変更予約を取り消します。\n\n`+
      `・${PLAN_LABELS[plan]}プランのまま継続します\n`+
      `・${bs.scheduledPlanDate||"次の更新日"}以降も現在の料金で自動更新されます\n\n`+
      `よろしいですか？`
    ))return;
    ph("plan_change_canceled",{from:plan,scheduled:bs.scheduledPlan});
    setCancelingChange(true);
    try{
      const idToken=await firebaseAuth?.currentUser?.getIdToken().catch(()=>null);
      const r=await fetch(`${CF_BASE}/cancelPlanChange`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...(idToken?{"Authorization":`Bearer ${idToken}`}:{})},
        body:JSON.stringify({shopId}),
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok){ tt("✕ "+(d.error||"予約を取り消せませんでした")); return; }
      tt("✓ プラン変更の予約を取り消しました");
    }catch(e){ tt("✕ 通信エラーが発生しました"); }
    finally{ setCancelingChange(false); }
  };

  const openPortal=async()=>{
    // デモ店舗のポータルを開かせない（requestPlanAction と同じ理由）。誰かが一度でも
    // デモ店舗で決済してしまうと、以降のデモ訪問者にその人の請求情報が開いてしまう
    if(DEMO_MODE){ tt("✕ デモでは請求管理を利用できません"); return; }
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
  // unit は無制限プランでの単位。Bar はスタッフ数と期間数の両方に使うので、
  // 「名」を決め打ちにすると期間数が「2名 / 無制限」になる（Pro・Premium で実際に出ていた）。
  const Bar=({used,max,label,unit="名"})=>{
    const pct=max===Infinity?0:Math.min(100,Math.round(used/max*100));
    const isOver=used>=max;
    return(
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
          <span style={{fontSize:13,color:"var(--c-text2)",fontWeight:600}}>{label}</span>
          <span style={{fontSize:13,fontWeight:700,color:isOver?"#FF4757":max===Infinity?"#10B981":"var(--c-text)"}}>
            {max===Infinity?`${used}${unit} / 無制限`:`${used} / ${max}`}
          </span>
        </div>
        {max!==Infinity&&<div style={{height:6,background:"var(--c-border)",borderRadius:4,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,background:isOver?"#FF4757":pct>80?"#F59E0B":"#10B981",borderRadius:4,transition:"width .4s"}}/>
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
          <div style={{flex:1}}>
            <div style={{fontSize:22,fontWeight:800,color:"var(--c-text)"}}>{PLAN_LABELS[plan]||"Free"}プラン</div>
            {expiryLabel&&<div style={{fontSize:12,color:"var(--c-text3)",marginTop:3}}>{expiryLabel}</div>}
            {!isPaid&&<div style={{fontSize:12,color:"var(--c-text4)",marginTop:3}}>無料プランをご利用中です</div>}
          </div>
        </div>

        {/* 契約の予定状態。Stripe側は「期間終了時に解約」で処理されるため、これを出さないと
            解約したのに画面が何も変わらず、解約が効いていないように見える */}
        {isPaid&&bs.cancelAtPeriodEnd&&(
          <div style={{background:"rgba(255,71,87,.08)",border:"1px solid rgba(255,71,87,.3)",borderRadius:8,padding:"10px 13px",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:"#FF4757",marginBottom:2}}>解約済み</div>
            <div style={{fontSize:12,color:"var(--c-text2)",lineHeight:1.6}}>
              {bs.currentPeriodEnd?`${bs.currentPeriodEnd} をもって終了します。`:"現在の期間の終了をもって終了します。"}
              それまでは{PLAN_LABELS[plan]}の機能をそのままご利用いただけます。
              <br/>解約を取り消す場合は下の「請求管理」からお手続きください。
            </div>
          </div>
        )}
        {isPaid&&!bs.cancelAtPeriodEnd&&bs.scheduledPlan&&bs.scheduledPlan!==plan&&(
          <div style={{background:"rgba(96,165,250,.08)",border:"1px solid rgba(96,165,250,.35)",borderRadius:8,padding:"10px 13px",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:"#3B82F6",marginBottom:2}}>プラン変更の予約中</div>
            <div style={{fontSize:12,color:"var(--c-text2)",lineHeight:1.6}}>
              {bs.scheduledPlanDate?`${bs.scheduledPlanDate} から`:"次の更新日から"}
              {PLAN_LABELS[bs.scheduledPlan]}プランに切り替わります。
              それまでは{PLAN_LABELS[plan]}の機能をご利用いただけます。
            </div>
            {!DEMO_MODE&&(
              <button onClick={cancelPlanChange} disabled={cancelingChange}
                style={{...AGray,marginTop:9,opacity:cancelingChange?.6:1}}>
                {cancelingChange?"取り消し中…":"予約を取り消す"}
              </button>
            )}
          </div>
        )}

        {/* プラン変更（Pro⇄Premium）。契約は作り直さないので二重請求は起こらない。
            現在のプランと切替予約済みのプランは選択肢に出さないため、残りが0件なら
            見出しだけが残らないようセクションごと隠す */}
        {isPaid&&!DEMO_MODE&&!bs.cancelAtPeriodEnd&&changeOptions.length>0&&(
          <div style={{marginBottom:4}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--c-text3)",marginBottom:6}}>プランを変更</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {changeOptions.map(p=>{
                const isUp=(PLAN_RANK_UI[p]||0)>(PLAN_RANK_UI[plan]||0);
                const busy=changing===p;
                return(
                  <button key={p} onClick={()=>changePlan(p)} disabled={!!changing}
                    style={{flex:"1 1 160px",padding:"11px 14px",borderRadius:8,cursor:changing?"default":"pointer",fontSize:14,fontWeight:700,
                      border:isUp?"none":"1px solid var(--c-border2)",
                      background:isUp?"var(--c-accent)":"var(--c-input)",color:isUp?"white":"var(--c-text2)",opacity:changing?.6:1}}>
                    {busy?"変更中...":`${PLAN_LABELS[p]}プランに${isUp?"アップグレード":"変更"}`}
                  </button>
                );
              })}
            </div>
            <div style={{fontSize:11,color:"var(--c-text4)",marginTop:6,lineHeight:1.6}}>
              アップグレードはすぐに反映され、差額のみを請求します。ダウングレードは現在の期間の終了後に切り替わります（日割りの返金はありません）。
            </div>
          </div>
        )}

        {/* 使用量 */}
        <div style={{borderTop:"1px solid var(--c-border)",paddingTop:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--c-text3)",marginBottom:12}}>使用状況</div>
          {/* 上限判定（StaffTab:2442）と同じ式で数える。staffList には空白列（スペーサー）が
              混ざっていて、それは登録スタッフではなくキッチン/ホールの区切りでしかない。
              生の length で数えると、同じ店舗を見ている StaffTab の「17/20名」に対して
              ここだけ「20 / 20」（赤＝上限）と出て、画面どうしで数が食い違う（バグチェック#56 と同じ形）。 */}
          <Bar used={staffList.filter(n=>!isSpacer(n)).length} max={lim.staff} label="スタッフ数"/>
          <Bar used={periods.length} max={lim.periods} label="期間数" unit="件"/>
        </div>

        {/* 新規申し込み（Freeのみ）。
            有料プラン中のプラン変更は上の「プランを変更」に一本化してあるので、
            ここに重ねて出さない（同じ操作の入口が2つあると、押した側によって
            新規契約とプラン変更に分岐して二重課金の温床になる） */}
        {plan==="free"&&<div style={{marginTop:4}}>
          {/* 主導線はPremium。同じ強さの塗りを2つ並べるとどちらを選ぶべきか読めないため、Proは枠線に落とす */}
          <button onClick={()=>onUpgrade&&onUpgrade({type:"edit",plan})}
            style={{width:"100%",padding:"13px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:8}}>
            Premium にする<span style={{fontWeight:400,fontSize:13,opacity:.92,marginLeft:6}}>月 2,980円</span>
          </button>
          <button onClick={()=>onUpgrade&&onUpgrade({type:"staff",limit:lim.staff,plan})}
            style={{width:"100%",padding:"13px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text2)",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:8}}>
            Pro にする<span style={{fontWeight:400,fontSize:13,color:"var(--c-text3)",marginLeft:6}}>月 500円</span>
          </button>
        </div>}
        {plan==="pro"&&<div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.6,marginTop:4,textAlign:"center"}}>プランの変更は上の「プランを変更」からお手続きください</div>}
      </AC>

      {/* プラン比較表 */}
      <AC title="プラン比較">
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr>
                {[["","機能"],["Free","無料"],["Pro","500円/月"],["Premium","2,980円/月"]].map(([icon,price],i)=>(
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
                      color:v==="✓"?"#10B981":v==="✕"?"var(--c-text4)":"var(--c-text)",fontWeight:600}}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AC>

      {/* 使い方マニュアル */}
      <AC title="使い方マニュアル">
        <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:14}}>
          Shiftyの使い方や機能の解説記事（note）をまとめています。はじめての方や設定に迷ったときにご覧ください。
        </div>
        <a href="https://note.com/todge00/m/m894b1b9ff090" target="_blank" rel="noopener" onClick={()=>ph("manual_opened")}
          style={{display:"block",width:"100%",padding:"13px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text2)",fontSize:14,fontWeight:600,cursor:"pointer",textDecoration:"none",textAlign:"center",boxSizing:"border-box"}}>
          マニュアルを見る（note）
        </a>
        <div style={{fontSize:11,color:"var(--c-text4)",marginTop:8,textAlign:"center"}}>外部のnoteサイトに移動します</div>
      </AC>

      {/* 請求管理。デモはPremium表示だが契約は存在しないので出さない（下のデモ用の案内に差し替わる） */}
      {isPaid&&!DEMO_MODE&&<AC title="請求・サブスクリプション管理">
        <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:14}}>
          請求履歴の確認、クレジットカードの変更、プランの変更・解約はStripeの管理ページで行えます。
        </div>
        <button onClick={openPortal} disabled={portalLoading}
          style={{width:"100%",padding:"13px",background:portalLoading?"#999":"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text2)",fontSize:14,fontWeight:600,cursor:portalLoading?"not-allowed":"pointer"}}>
          {portalLoading?"読み込み中...":"請求・解約の管理（Stripeポータル）"}
        </button>
        <div style={{fontSize:11,color:"var(--c-text4)",marginTop:8,textAlign:"center"}}>外部のStripeサイトに移動します</div>
      </AC>}

      {(!isPaid||DEMO_MODE)&&<AC title="請求・サブスクリプション管理">
        <div style={{fontSize:13,color:"var(--c-text4)",textAlign:"center",padding:"8px 0"}}>
          {DEMO_MODE
            ?"デモでは購入・請求のお手続きはできません。ご利用を始めるには「無料で始める」からお進みください。"
            :"有料プランをご購入後に請求管理ページが利用できます"}
        </div>
      </AC>}

      {/* データ保存期間の告知（保存上限④・36ヶ月超の期間データは順次削除） */}
      <div style={{fontSize:11,color:"var(--c-text4)",textAlign:"center",padding:"0 16px"}}>
        シフト期間データは終了日から36ヶ月を超えると順次削除されます（詳細は利用規約 第6条）
      </div>

      {/* 利用規約 */}
      <div style={{textAlign:"center",marginTop:8,paddingBottom:8}}>
        <button onClick={()=>setShowTerms(true)}
          style={{background:"none",border:"none",color:"var(--c-text3)",fontSize:12,textDecoration:"underline",cursor:"pointer",padding:8}}>
          利用規約
        </button>
      </div>
      {showTerms&&<TermsModal onClose={()=>setShowTerms(false)}/>}
    </div>
  );
}


// ============================================================
// アップグレード促進モーダル
// ============================================================
function UpgradeModal({reason,currentPlan,shopId,onClose}){
  const[loading,setLoading]=useState(null);
  const[error,setError]=useState("");
  const[done,setDone]=useState(""); // 既存契約の価格差し替えで完了したときの案内（決済ページへ遷移しないため画面内で伝える）
  const isEditType=reason.type==="edit";
  const msgs={
    shops:  {title:"店舗数の上限に達しました",desc:`${PLAN_LABELS[currentPlan]||"Free"}プランでは最大${reason.limit}店舗まで管理できます。`,next:"Proプラン（500円/月）なら店舗を無制限に管理できます。"},
    staff:  {title:"スタッフ数の上限に達しました",desc:"Freeプランでは最大20名まで登録できます。",next:"Proプラン（500円/月）ならスタッフ数・期間数が無制限になります。"},
    periods:{title:"期間数の上限に達しました",desc:"Freeプランでは期間を1件まで作成できます。",next:"Proプラン（500円/月）なら期間を無制限に作成できます。"},
    edit:   {title:"シフト作成はPremiumプランの機能です",desc:"提出されたシフトの編集・調整、休憩・属性管理、PDF/Excel書き出しはPremiumプランでご利用いただけます。",next:"Premiumプラン（2,980円/月）で、シフト表の仕上げから書き出しまでこのアプリだけで完結します。"},
  };
  const m=msgs[reason.type]||{title:"上限に達しました",desc:"",next:""};

  // 購入と変更の振り分けは requestPlanAction に一本化してある。
  // このモーダルは機能ゲート（Proユーザーがシフト作成タブを触った等）からも開くため、
  // 契約済みの相手にCheckoutを叩くと409で止まる。ここでも同じ入口を使う。
  const checkout=async(plan)=>{
    ph("upgrade_started",{plan,from:currentPlan});
    setLoading(plan);setError("");
    const r=await requestPlanAction(shopId,plan,currentPlan);
    setLoading(null);
    if(r.kind==="checkout"){ window.location.href=r.url; return; }
    if(r.kind==="error"){ setError(r.error); return; }
    // 既存契約の価格差し替えで完了した（新しい契約は作られていない）
    setDone(r.applied==="immediate"
      ? `${PLAN_LABELS[plan]}プランに変更しました。そのままご利用いただけます。`
      : `${r.effectiveAt||"期間終了時"}から${PLAN_LABELS[plan]}プランに変更されます。`);
  };

  const proLabel=currentPlan==="pro"?"Pro（現在）":"Pro";
  const planRows=isEditType
    ?[["Free","無料","スタッフ20名 / 期間1件"],[proLabel,"500円/月","スタッフ・期間 無制限＋並べ替え・名前色"],["Premium","2,980円/月","Proの全機能＋シフト作成・調整・休憩/属性管理・PDF出力"]]
    :[["Free","無料","スタッフ20名 / 期間1件"],["Pro","500円/月","スタッフ・期間 無制限＋並べ替え・名前色"],["Premium","2,980円/月","Proの全機能＋シフト作成・調整・休憩/属性管理・PDF出力"]];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fI .2s"}} onClick={onClose}>
      <div style={{background:"var(--c-card)",border:"1px solid var(--c-border)",borderRadius:12,width:"100%",maxWidth:400,padding:"28px 24px",animation:"sI .2s",boxShadow:"0 8px 40px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:17,fontWeight:700,color:"var(--c-text)",marginBottom:8}}>{m.title}</div>
          <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.6,marginBottom:8}}>{m.desc}</div>
          <div style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.6}}>{m.next}</div>
        </div>
        <div style={{background:"rgba(248,112,54,.08)",border:"1px solid rgba(248,112,54,.25)",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--c-accent)",marginBottom:8}}>プラン比較</div>
          {planRows.map(([label,price,desc])=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--c-border)"}}>
              <span style={{fontSize:13,color:"var(--c-text2)",fontWeight:600,minWidth:72}}>{label}</span>
              <span style={{fontSize:11,color:"var(--c-text3)",flex:1}}>{desc}</span>
              <span style={{fontSize:13,color:"var(--c-text)",fontWeight:600,whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>{price}</span>
            </div>
          ))}
        </div>
        <div style={{fontSize:11,color:"var(--c-text3)",lineHeight:1.7,marginBottom:14}}>
          月額料金の<strong style={{color:"var(--c-text2)"}}>自動更新（定期課金）</strong>です。表示価格は税込・1店舗あたりの月額で、Stripe を通じて毎月自動的に課金されます。解約はいつでもマイページ（Stripe カスタマーポータル）から行え、解約後も支払い済み期間の末日まで利用できます（期間途中の日割り返金はありません）。
          <span style={{display:"block",marginTop:6}}>
            <a href="/terms.html" target="_blank" rel="noopener" style={{color:"var(--c-accent)",textDecoration:"none"}}>利用規約</a>
            <span style={{margin:"0 6px",color:"var(--c-text4)"}}>·</span>
            <a href="/privacy.html" target="_blank" rel="noopener" style={{color:"var(--c-accent)",textDecoration:"none"}}>プライバシーポリシー</a>
          </span>
        </div>
        {error&&<div style={{color:"#FF4757",fontSize:12,textAlign:"center",marginBottom:10,background:"rgba(255,71,87,.1)",padding:"8px",borderRadius:8}}>{error}</div>}
        {done&&<div style={{color:"#10B981",fontSize:13,fontWeight:700,textAlign:"center",marginBottom:10,background:"rgba(34,197,94,.12)",padding:"10px",borderRadius:8}}>✓ {done}</div>}
        {/* 変更が完了したら購入ボタンは出さない（同じ操作を二度実行させない） */}
        {done?null:isEditType?(
          <button onClick={()=>checkout("premium")} disabled={!!loading} style={{width:"100%",padding:"13px",background:loading==="premium"?"var(--c-text3)":"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",marginBottom:12}}>
            {loading==="premium"?"処理中...":<React.Fragment>Premium にする<span style={{fontWeight:400,fontSize:13,opacity:.92,marginLeft:6}}>月 2,980円</span></React.Fragment>}
          </button>
        ):(
          <button onClick={()=>checkout("pro")} disabled={!!loading} style={{width:"100%",padding:"13px",background:loading==="pro"?"var(--c-text3)":"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",marginBottom:12}}>
            {loading==="pro"?"処理中...":<React.Fragment>Pro にする<span style={{fontWeight:400,fontSize:13,opacity:.92,marginLeft:6}}>月 500円</span></React.Fragment>}
          </button>
        )}
        <button onClick={onClose} style={{width:"100%",padding:"11px",background:done?"var(--c-accent)":"var(--c-input)",border:done?"none":"1px solid var(--c-border)",borderRadius:8,color:done?"white":"var(--c-text3)",fontSize:done?15:13,fontWeight:done?700:400,cursor:"pointer"}}>{done?"閉じる":"今はしない"}</button>
      </div>
    </div>
  );
}

// ============================================================
// 共通UIパーツ
// ============================================================
function AC({title,children}){return(<div style={{background:"var(--c-card)",border:"1px solid var(--c-border)",borderRadius:12,padding:20,marginBottom:16,boxShadow:"0 1px 4px var(--c-shadow)"}}><div style={{fontSize:14,fontWeight:700,color:"var(--c-text2)",marginBottom:14}}>{title}</div>{children}</div>);}
function AL({children}){return(<label style={{fontSize:13,fontWeight:600,color:"var(--c-text3)",display:"block",marginBottom:6}}>{children}</label>);}
function AT({children}){return(<div style={{fontSize:18,fontWeight:700,color:"var(--c-text)",marginBottom:16}}>{children}</div>);}
function CL({items,onDel}){return items.map((c,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:c.closed?"rgba(255,71,87,.08)":"rgba(255,255,255,.05)",border:`1px solid ${c.closed?"rgba(255,71,87,.2)":"var(--c-border)"}`,borderRadius:8,marginBottom:6}}>
  {c.closed
    ?<span style={{flex:1,fontSize:14,color:"#FF4757",fontWeight:600}}>× 休業日</span>
    :<span style={{flex:1,fontSize:14,color:"var(--c-text)",fontWeight:500}}>{c.start} 〜 {c.end}</span>
  }
  <button onClick={()=>onDel(i)} style={AD}>削除</button>
</div>));}
