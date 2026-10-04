// ============================================================
// Shifty - 企業連携・設定・賃金マスタのコンポーネント（2026-09-30 に app-admin.js から分割）
// app-admin.js が Babel Standalone の 500KB 上限を超えたため、次の2つの塊をそのまま移した:
//   1. 賃金マスタ・閲覧パスコード（PAY_OFF / PayCodeBox / PayCodeChangeModal / StaffPayPage）
//   2. 企業連携タブ一式（CoLaborFields・CompanyConfigCard・CompanyEntityCard・EntityFilter・
//      CompanyStaffCard / CompanyStaffDirectory・人物の編集と統合・CompanySubmissionsCard・
//      CompanyBulkPdf・CompanyDashboardCard・CompanyLoginCard・CompanyTab）と、それに続く設定タブ（SetTab）
// index.html で app-admin.js の直後・app-main.js の直前に読み込む。全ファイルが同じ
// グローバルスコープを共有し、描画は app-main.js の ReactDOM マウント時なので、
// AdminView（app-admin.js）からここのコンポーネントを参照できる。
// ============================================================

// ============================================================
// 賃金マスタ・閲覧パスコード（2026-09-30・労務給与_複数法人_実装計画.md §3.7・P6a）
// pay は App（app-main.js）から来る1つのオブジェクト: {enabled, loaded, map, codeRec, unlockedFor(rec?), unlockedDefault,
//   unlock(code, rec?), lock(), save(name, record), rename(old, new), drop(names), changeCode(cur, next)}。
// パスコードは画面ロック（覗き見・開きっぱなし対策）。読み書きの権限そのものはルール（private は owners のみ）が決める。
// ============================================================
const PAY_OFF={enabled:false,loaded:false,map:{},codeRec:null,unlockedFor:()=>false,unlockedDefault:false,
  unlock:async()=>({ok:false}),lock:()=>{},save:()=>Promise.reject(new Error("off")),rename:()=>{},drop:()=>{},changeCode:async()=>({error:"off"})};
// 4桁の入力ボックス。rec を渡せばそのパスコード（企業内登録スタッフは企業のもの）で照合する
function PayCodeBox({pay,rec,onOpenChange}){
  const[v,setV]=useState("");
  const[msg,setMsg]=useState("");
  const unlocked=pay.unlockedFor(rec);
  const submit=async code=>{
    const res=await pay.unlock(code,rec);
    setV("");
    if(res.ok){setMsg("");return;}
    setMsg(res.wait?`${res.wait}秒待ってからもう一度入力してください`:`パスコードが違います（あと${res.left}回で60秒待ちになります）`);
  };
  return(<div data-pay-code-box="1" style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      {unlocked
        ?<><span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"}}>賃金を表示中</span>
          <button onClick={pay.lock} title="賃金を伏せる" aria-label="賃金を伏せる" style={{...AGray,padding:"6px 10px"}}>🔒</button></>
        :<input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={v} placeholder="パスコード" aria-label="賃金の閲覧パスコード（4桁）"
          onChange={e=>{const x=e.target.value.replace(/\D/g,"").slice(0,4);setV(x);if(x.length===4)submit(x);}}
          style={{...AI,width:120,padding:"7px 10px",textAlign:"center",letterSpacing:4}}/>}
      {onOpenChange&&<button onClick={onOpenChange} style={{...AGray,padding:"6px 10px",fontSize:12,whiteSpace:"nowrap"}}>変更</button>}
    </div>
    {msg&&<div style={{fontSize:11,color:"#DC2626"}}>{msg}</div>}
  </div>);
}
// パスコードの変更（現在の番号と新しい番号）。onSubmit(cur,next) は {error?} を返す。note があればフォームの代わりに案内だけ出す
function PayCodeChangeModal({onSubmit,onClose,note,tt}){
  const[cur,setCur]=useState("");const[nx,setNx]=useState("");const[nx2,setNx2]=useState("");const[busy,setBusy]=useState(false);
  // 失敗はモーダルの中にも出す（企業内登録スタッフは全画面で、トーストや一覧の帯は覆いの下に隠れる）
  const[err,setErr]=useState("");
  const fail=t=>{setErr(t);tt&&tt("✕ "+t);};
  const digits=s=>s.replace(/\D/g,"").slice(0,4);
  const inp=(val,set,ph)=><input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={val} placeholder={ph} onChange={e=>set(digits(e.target.value))} style={{...AI,marginBottom:8,textAlign:"center",letterSpacing:4}}/>;
  const go=async()=>{
    if(!isValidPayCode(cur)||!isValidPayCode(nx)){fail("パスコードは4桁の数字で入力してください");return;}
    if(nx!==nx2){fail("新しいパスコードが一致しません");return;}
    setErr("");setBusy(true);const r=await onSubmit(cur,nx);setBusy(false);
    if(r&&r.error){fail(r.error);return;}
    tt&&tt("✓ 賃金の閲覧パスコードを変更しました");onClose();
  };
  return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}>
    <div onClick={e=>e.stopPropagation()} data-pay-code-modal="1" style={{background:"var(--c-card)",borderRadius:12,padding:20,width:"100%",maxWidth:360,boxShadow:"0 8px 32px var(--c-shadow)"}}>
      <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)",marginBottom:12}}>賃金の閲覧パスコードを変更</div>
      {note?<div style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.6,marginBottom:12}}>{note}</div>:<>
        <AL>現在のパスコード（未設定なら 0000）</AL>{inp(cur,setCur,"現在")}
        <AL>新しいパスコード（4桁の数字）</AL>{inp(nx,setNx,"新しい番号")}{inp(nx2,setNx2,"新しい番号（確認）")}
        {err&&<div data-pay-code-err="1" style={{fontSize:12,color:"#DC2626",marginBottom:8}}>✕ {err}</div>}
        <button disabled={busy} onClick={go} style={{...AB,width:"100%",marginBottom:8,opacity:busy?0.6:1}}>{busy?"変更中...":"変更する"}</button>
      </>}
      <button onClick={onClose} style={{...AGray,width:"100%"}}>閉じる</button>
    </div>
  </div>);
}
// 企業のパスコードの変更（CF setCompanyPayCode が連携全店舗へ同期する）。入口は企業アカウントのカードと企業内登録スタッフの上部の2つで、
// どちらもこの関数を PayCodeChangeModal の onSubmit に渡す（現在の番号の照合は CF がする）
const companyPayCodeSubmit=onCompanyCall=>async(cur,next)=>{
  const r=onCompanyCall?await onCompanyCall("setCompanyPayCode",{currentCode:cur,newCode:next}):{error:"企業アカウントがありません"};
  if(r&&r.error)return r;
  return (r&&r.failed&&r.failed.length)?{error:`${r.failed.length}店舗への反映に失敗しました。もう一度変更してください`}:{};
};
// 賃金設定ページ（スタッフタブ → 編集 → 「賃金設定を開く →」）。管理者画面を丸ごと差し替えて出す（AdminView の fullPage）。
// 置き場は shops/{この店舗}/private/pay/{名前}。所属店舗でだけ編集できる（ヘルプ先では案内だけ）。
function StaffPayPage({name,settings,shopId,shopName,homeShopName,companyLink,pay,tt,onBack}){
  const attrId=(settings.staffAttributes||{})[name]||"parttime";
  const attrLabel=((getAttrOptions(settings).find(([v])=>v===attrId))||[])[1]||STAFF_TYPE_LABELS[attrId]||attrId;
  const sys=laborSystemForStaff(settings,name);
  // 応援・外部（保存値 none）の人は判定が B と同じなので B と出る（2026-10-03）
  const sysLabel=sys==="A"?"A（1か月単位の変形労働時間制）":sys==="B"?"B（通常の労働時間制）":"未設定";
  const number=(settings.staffNumbers||{})[name]||"";
  const coSet=(companyLink&&companyLink.settings)||{};
  const denom=rateDenominatorMinOf({...(settings.laborSettings||{}),...(coSet.laborSettings||{})});
  const denomH=Math.round(denom/6)/10;
  const fixedType=isPayTypeFixed(attrId);
  const atHome=homeShopOf(settings,name,shopId)===shopId;
  const prev=(pay.map||{})[name]||null;
  const today=fd(new Date());
  const draftOf=()=>{
    const p=prev&&typeof prev==="object"?prev:{};
    const al=Array.isArray(p.allowances)?p.allowances:Object.values(p.allowances||{});
    return{payType:fixedType?"monthly":(PAY_TYPES.includes(p.payType)?p.payType:defaultPayTypeOf(attrId)),base:Number(p.base)||0,
      allowances:al.filter(Boolean).map(a=>({name:a.name||"",amount:Number(a.amount)||0,excludeFromRate:!!a.excludeFromRate,excludeFromDeduction:!!a.excludeFromDeduction})),
      fixedOt:{hours:Number(p.fixedOt&&p.fixedOt.hours)||0,auto:!(p.fixedOt&&p.fixedOt.auto===false),amount:Number(p.fixedOt&&p.fixedOt.amount)||0},
      fixedNight:{hours:Number(p.fixedNight&&p.fixedNight.hours)||0,amount:Number(p.fixedNight&&p.fixedNight.amount)||0},
      commute:{amount:Number(p.commute&&p.commute.amount)||0,per:p.commute&&p.commute.per==="day"?"day":(p.payType==="hourly"||(!prev&&defaultPayTypeOf(attrId)==="hourly")?"day":"month")},
      effectiveFrom:isValidDateStr(p.effectiveFrom)?p.effectiveFrom:today};
  };
  const[d,setD]=useState(draftOf);
  const[dirty,setDirty]=useState(false);
  const[busy,setBusy]=useState(false);
  // 購読が後から届いたら（まだ触っていなければ）保存済みの値で入れ直す
  useEffect(()=>{if(!dirty)setD(draftOf());},[prev]);
  const up=patch=>{setD(x=>({...x,...patch}));setDirty(true);};
  const unlocked=pay.unlockedFor();
  const cur=withFixedOtAmount(d,denom);
  const monthly=d.payType==="monthly";
  const minDate=d.effectiveFrom&&d.effectiveFrom>today?d.effectiveFrom:today;
  const minYen=minWageOn(coSet.wageSettings,minDate);
  const chk=minWageCheck(cur,minYen,denom);
  const rate=hourlyRateOf(cur,denom);
  const yen=v=>maskYen(v,unlocked);
  const num=v=>{const n=parseInt(String(v).replace(/[^\d]/g,""),10);return Number.isFinite(n)?n:0;};
  const hrs=v=>{const n=parseFloat(String(v).replace(/[^\d.]/g,""));return Number.isFinite(n)?Math.min(300,n):0;};
  const yenInput=(val,onCh,label)=>unlocked
    ?<input inputMode="numeric" value={val?String(val):""} placeholder="0" aria-label={label} onChange={e=>onCh(num(e.target.value))} style={{...AI,width:150,padding:"7px 10px",textAlign:"right"}}/>
    :<span data-pay-masked="1" style={{display:"inline-block",minWidth:150,fontSize:16,color:"var(--c-text3)",letterSpacing:2}}>••••</span>;
  const hoursInput=(val,onCh,label)=><input inputMode="decimal" disabled={!unlocked} value={val?String(val):""} placeholder="0" aria-label={label} onChange={e=>onCh(hrs(e.target.value))} style={{...AI,width:90,padding:"7px 10px",textAlign:"right",opacity:unlocked?1:0.6}}/>;
  const row=(label,body,note)=>(<div style={{marginBottom:12}}>
    <div style={{fontSize:12,fontWeight:700,color:"var(--c-text3)",marginBottom:4}}>{label}</div>
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>{body}</div>
    {note&&<div style={{fontSize:11,color:"var(--c-text4)",marginTop:4,lineHeight:1.5}}>{note}</div>}
  </div>);
  const back=()=>{if(dirty&&!window.confirm("保存していない変更があります。破棄して戻りますか？"))return;onBack();};
  const save=async()=>{
    if(!unlocked)return;
    if(!isValidDateStr(d.effectiveFrom)){tt("▲ 適用開始日を入力してください");return;}
    if(!(Number(d.base)>0)){tt(monthly?"▲ 基本給を入力してください":"▲ 時給を入力してください");return;}
    const pv=prev?normalizePayVersion(prev):null;
    if(pv&&pv.effectiveFrom&&d.effectiveFrom<pv.effectiveFrom){tt(`▲ 適用開始日は今の版（${pv.effectiveFrom}）以降にしてください`);return;}
    const rec=applyPayRevision(prev,{...cur,payType:fixedType?"monthly":cur.payType},new Date().toISOString());
    if(rec===prev){tt("変更はありません");setDirty(false);return;}
    setBusy(true);
    try{await pay.save(name,rec);setDirty(false);tt(pv&&pv.effectiveFrom!==rec.effectiveFrom?`✓ 保存しました（${pv.effectiveFrom} からの版は履歴に残しました）`:"✓ 保存しました");}
    catch{/* savePay がトーストを出す */}
    setBusy(false);
  };
  const history=prev?(Array.isArray(prev.history)?prev.history:Object.values(prev.history||{})).filter(Boolean).map(normalizePayVersion).sort((a,b)=>String(b.effectiveFrom).localeCompare(String(a.effectiveFrom))):[];
  const card={background:"var(--c-card)",border:"1px solid var(--c-border)",borderRadius:12,padding:16,marginBottom:14};
  return(<div data-staff-pay-page="1" style={{background:"var(--c-bg)",minHeight:"calc(100vh - 44px)"}}>
    <div style={{background:"var(--c-card)",borderBottom:"1px solid var(--c-border)",padding:"12px 16px"}}>
      <div style={{maxWidth:720,margin:"0 auto",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={back} style={{...AGray,whiteSpace:"nowrap"}}>← 戻る</button>
        <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)"}}>{name} の賃金設定</div>
      </div>
    </div>
    <div style={{maxWidth:720,margin:"0 auto",padding:"16px 14px 60px"}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><PayCodeBox pay={pay}/></div>
      <div style={card}>
        {[["名前",name],["従業員番号",number||"—"],["属性",attrLabel],["労働時間制",sysLabel],["所属店舗",atHome?(shopName||"この店舗"):(homeShopName||"他の店舗")]].map(([k,v])=>(
          <div key={k} style={{display:"flex",gap:12,fontSize:13,padding:"3px 0"}}><span style={{width:90,color:"var(--c-text3)",flexShrink:0}}>{k}</span><span style={{color:"var(--c-text)",fontWeight:600}}>{v}</span></div>))}
      </div>
      {!atHome?<div style={{...card,fontSize:13,color:"var(--c-text2)"}}>賃金は所属店舗（{homeShopName||"他の店舗"}）で設定します。</div>:!pay.loaded?<div style={{fontSize:13,color:"var(--c-text3)"}}>読み込み中...</div>:<>
      {!unlocked&&<div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10}}>パスコードを入力するまで金額は伏せてあり、編集できません。</div>}
      <div style={card}>
        {fixedType
          ?row("給与形態",<span style={{fontSize:14,fontWeight:700,color:"var(--c-text)"}}>月給（社員は固定給）</span>)
          :row("給与形態",PAY_TYPES.map(t=><button key={t} disabled={!unlocked} data-pay-type={t} onClick={()=>up({payType:t,commute:{...d.commute,per:t==="hourly"?"day":d.commute.per}})}
              style={{padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:700,cursor:unlocked?"pointer":"default",background:d.payType===t?"var(--c-accent)":"var(--c-input)",color:d.payType===t?"#fff":"var(--c-text2)",border:`1px solid ${d.payType===t?"var(--c-accent)":"var(--c-border)"}`}}>{PAY_TYPE_LABELS[t]}</button>))}
        {!monthly&&<>
          {row("時給（円）",yenInput(d.base,v=>up({base:v}),"時給"))}
          {row("割増率",(()=>{const r=premiumRatesOf(coSet.wageSettings);const legal=PREMIUM_RATE_KEYS.every(k=>r[k]===LEGAL_PREMIUM_RATES[k]);
            return<span data-pay-rates="1" style={{fontSize:13,color:"var(--c-text2)"}}>時間外 {r.ot}%・深夜 {r.night}%・法定休日 {r.holiday}%・月60時間超 {r.ot+r.over60}%（{legal?"法定の率":"法人の設定"}）</span>;})(),
            "率はこの画面では変えません（企業連携タブの法人の設定で上乗せできます）。")}
        </>}
        {monthly&&<>
          {row("基本給（円・月）",yenInput(d.base,v=>up({base:v}),"基本給"))}
          <div style={{fontSize:12,fontWeight:700,color:"var(--c-text3)",marginBottom:4}}>諸手当</div>
          {d.allowances.length===0&&<div style={{fontSize:12,color:"var(--c-text4)",marginBottom:6}}>なし</div>}
          {d.allowances.map((a,i)=>(<div key={i} data-pay-allowance={i} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8,padding:"8px 10px",background:"var(--c-input)",borderRadius:8}}>
            <input disabled={!unlocked} value={a.name} maxLength={30} placeholder="手当の名前" aria-label="手当の名前" onChange={e=>up({allowances:d.allowances.map((x,j)=>j===i?{...x,name:e.target.value}:x)})} style={{...AI,width:140,padding:"7px 10px"}}/>
            {yenInput(a.amount,v=>up({allowances:d.allowances.map((x,j)=>j===i?{...x,amount:v}:x)}),"手当の金額")}
            <label style={{fontSize:12,color:"var(--c-text2)",display:"flex",alignItems:"center",gap:4}}><input type="checkbox" disabled={!unlocked} checked={a.excludeFromRate} onChange={e=>up({allowances:d.allowances.map((x,j)=>j===i?{...x,excludeFromRate:e.target.checked}:x)})}/>割増の基礎から除く</label>
            <label style={{fontSize:12,color:"var(--c-text2)",display:"flex",alignItems:"center",gap:4}}><input type="checkbox" disabled={!unlocked} checked={a.excludeFromDeduction} onChange={e=>up({allowances:d.allowances.map((x,j)=>j===i?{...x,excludeFromDeduction:e.target.checked}:x)})}/>欠勤控除から除く</label>
            {unlocked&&<button onClick={()=>up({allowances:d.allowances.filter((_,j)=>j!==i)})} style={{...AD,marginLeft:0}}>削除</button>}
          </div>))}
          {unlocked&&<button onClick={()=>up({allowances:[...d.allowances,{name:"",amount:0,excludeFromRate:false,excludeFromDeduction:false}]})} style={{...AGray,fontSize:13,padding:"7px 12px",marginBottom:12}}>＋ 手当を追加</button>}
          {row("固定残業",<>
            {hoursInput(d.fixedOt.hours,v=>up({fixedOt:{...d.fixedOt,hours:v}}),"固定残業の時間")}<span style={{fontSize:13,color:"var(--c-text3)"}}>時間</span>
            <label style={{fontSize:12,color:"var(--c-text2)",display:"flex",alignItems:"center",gap:4,marginLeft:8}}><input type="checkbox" disabled={!unlocked} checked={d.fixedOt.auto} onChange={e=>up({fixedOt:{...d.fixedOt,auto:e.target.checked,amount:e.target.checked?d.fixedOt.amount:cur.fixedOt.amount}})}/>額を自動計算</label>
            {d.fixedOt.auto?<span data-pay-fixed-ot="1" style={{fontSize:16,fontWeight:700,color:"var(--c-text)"}}>{yen(cur.fixedOt.amount)}</span>:yenInput(d.fixedOt.amount,v=>up({fixedOt:{...d.fixedOt,amount:v}}),"固定残業の額")}
          </>,d.fixedOt.auto?(unlocked&&d.base>0&&d.fixedOt.hours>0
            ?`${Number(d.base).toLocaleString("ja-JP")} ÷ ${denomH}h × 1.25 × ${d.fixedOt.hours}h = ${cur.fixedOt.amount.toLocaleString("ja-JP")}円（1円未満切上げ）`
            :`基本給 ÷ ${denomH}h × 1.25 × 時間（1円未満切上げ）`):"手修正の額を使います。")}
          {row("固定深夜手当",<>
            {hoursInput(d.fixedNight.hours,v=>up({fixedNight:{...d.fixedNight,hours:v}}),"固定深夜の時間")}<span style={{fontSize:13,color:"var(--c-text3)"}}>時間</span>
            {yenInput(d.fixedNight.amount,v=>up({fixedNight:{...d.fixedNight,amount:v}}),"固定深夜の額")}
          </>)}
        </>}
        {row("通勤手当",<>
          {yenInput(d.commute.amount,v=>up({commute:{...d.commute,amount:v}}),"通勤手当")}
          <select disabled={!unlocked} value={d.commute.per} onChange={e=>up({commute:{...d.commute,per:e.target.value}})} style={{...AI,width:"auto",padding:"7px 10px"}}>
            <option value="day">日額</option><option value="month">月額</option>
          </select>
        </>,"割増の基礎と最低賃金の比較には入れません。")}
      </div>
      <div style={card} data-pay-check="1">
        {monthly&&<div style={{fontSize:13,color:"var(--c-text2)",marginBottom:6}}>時給換算（基本給＋割増の基礎に入る手当 ÷ {denomH}h）: <b>{unlocked?(rate?`${Math.floor(rate*100)/100}円`:"—"):"••••"}</b></div>}
        {minYen==null
          ?<div style={{fontSize:12,color:"var(--c-text4)",lineHeight:1.6}}>{sanitizeWageSettings(coSet.wageSettings).minWage
            ?`${minDate} に効く最低賃金が法人の設定にありません。`
            :"最低賃金との比較は、企業連携タブの「法人」で最低賃金を登録すると出ます。"}</div>
          :!chk?<div style={{fontSize:12,color:"var(--c-text4)"}}>金額を入力すると最低賃金（{minYen.toLocaleString("ja-JP")}円・{minDate} 時点）と比べます。</div>
          :<div data-min-wage-ok={chk.ok?"1":"0"} style={{fontSize:13,fontWeight:700,color:chk.ok?"#059669":"#DC2626"}}>
            {chk.ok?"最低賃金以上です":"最低賃金を下回っています"}（最低賃金 {minYen.toLocaleString("ja-JP")}円・{minDate} 時点{unlocked?`／${monthly?"基本給の時給換算":"時給"} ${Math.floor(chk.rate*100)/100}円`:""}）
          </div>}
      </div>
      <div style={card}>
        {row("適用開始日",<input type="date" disabled={!unlocked} value={d.effectiveFrom} onChange={e=>up({effectiveFrom:e.target.value})} style={{...AI,width:"auto",padding:"7px 10px"}}/>,
          "適用開始日を変えて保存すると、今の版は改定履歴に残ります（上書きしません）。同じ日のまま保存するとその版の訂正になります。")}
        {history.length>0&&<details data-pay-history="1" style={{marginTop:4}}>
          <summary style={{fontSize:12,color:"var(--c-text3)",cursor:"pointer"}}>改定履歴（{history.length}件・読み取り専用）</summary>
          {history.map((h,i)=><div key={i} style={{fontSize:12,color:"var(--c-text2)",padding:"6px 0",borderBottom:"1px solid var(--c-border)"}}>
            {h.effectiveFrom||"（日付なし）"} から ／ {PAY_TYPE_LABELS[h.payType]} {yen(h.base)}{h.payType==="monthly"&&h.fixedOt&&h.fixedOt.hours?` ／ 固定残業 ${h.fixedOt.hours}h ${yen(h.fixedOt.amount)}`:""}
          </div>)}
        </details>}
      </div>
      <button disabled={!unlocked||busy} onClick={save} style={{...AB,width:"100%",opacity:!unlocked||busy?0.5:1}}>{busy?"保存中...":"保存"}</button>
      </>}
    </div>
  </div>);
}

// ============================================================
// 月次賃金ページ（2026-09-30・労務給与_複数法人_実装計画.md §4.5・P6b）。管理者画面を丸ごと差し替えて出す（AdminView の fullPage）。
// 入口はスタッフタブ（自店・オーナーの端末）と企業連携タブの法人カード（法人 → 店舗）。Premium・オーナーだけ。
// 時間は**シフト作成タブの労務判定表と同じ計算**で出す: 対象店舗の ShiftEditTab を画面外へマウントし、書き出しジョブ
// （exportJob.kind="payroll"）で割増の内訳・月所定・年平均所定を返させる（一括PDFと同じ形＝計算を二重に持たない）。
// 非表示マウントは書き込みを塞ぐ（savePeriods=null・ownerReadOnly・onSave は何もしない・laborMonths は読むだけ）。
// 金額は閲覧パスコードの解除まで「••••」（時間は伏せない）。CSV も解除するまで出せない。**PDF・Excel には出さない**。
// 社会保険・所得税・住民税・支給総額は対象外（CSV を給与ソフトへ渡す）。
// ============================================================
function PayrollPage({shopId,shopName,pay=PAY_OFF,tt,onBack}){
  const[ym,setYm]=useState(()=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return fd(d).slice(0,7);});
  const[data,setData]=useState(null);   // 読み込んだ店舗のデータ | {error}
  const[report,setReport]=useState(null); // ShiftEditTab が返した1か月の時間 | {error}
  const[tick,setTick]=useState(0);
  const runRef=useRef(0);
  useEffect(()=>{
    if(!firebaseDB||!shopId||!/^\d{4}-\d{2}$/.test(ym)){setData({error:"月を選んでください"});return;}
    const run=++runRef.current;
    setData(null);setReport(null);
    const ref=p=>firebaseDB.ref(p).once("value").then(x=>x.val());
    (async()=>{
      const[staff,settingsRaw,coLink,periodsRaw,plan]=await Promise.all([ref(`shops/${shopId}/staff`),ref(`shops/${shopId}/settings`),
        ref(`shops/${shopId}/company`).catch(()=>null),ref(`shops/${shopId}/periods`),ref(`accounts/${shopId}/plan`).catch(()=>null)]);
      if(!featureEnabled("pay",{plan}))return{error:"この店舗は Premium ではないため、月次賃金は使えません"};
      // 賃金・所定・実績はオーナーしか読めない（private・laborMonths・actuals）
      let priv,lmMap;
      try{[priv,lmMap]=await Promise.all([ref(`shops/${shopId}/private`),ref(`shops/${shopId}/laborMonths`)]);}
      catch{return{error:"この店舗の賃金を読み込めませんでした（この端末・アカウントが店舗の管理者として登録されていません）"};}
      const settings=applyCompanySettings(settingsRaw||makeSettings(shopId),(coLink&&coLink.settings)||{});
      const periods=Object.values(periodsRaw||{}).filter(x=>x&&x.id&&isValidDateStr(x.startDate)&&isValidDateStr(x.endDate))
        .sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));
      const n=daysInMonthOf(ym);const first=`${ym}-01`,last=`${ym}-${String(n).padStart(2,"0")}`;
      const inMonth=periods.filter(p=>p.startDate<=last&&p.endDate>=first);
      if(!inMonth.length)return{error:"この月にかかる期間がありません"};
      const target=inMonth.find(p=>p.startDate.slice(0,7)===ym)||inMonth[0];
      // 提出は年度の始め（年平均所定）〜月末の期間と、月初・月末の週（法定休日の判定）にかかる前後の期間を読む。
      // 月末の週の翌月側を読まないと、その日が空欄＝公休に見え、翌月側が有給・慶弔だけの週で当月の法定休日労働が消える
      const fyStart=fiscalYearStartMonthOf(settings);
      const fyFirst=`${fiscalYearMonths(fiscalYearOf(first,fyStart),fyStart)[0]}-01`;
      const from=fyFirst<addDays(first,-7)?fyFirst:addDays(first,-7);
      const subPids=periods.filter(p=>p.startDate<=addDays(last,7)&&p.endDate>=from).map(p=>p.id);
      const actPids=periods.filter(p=>p.startDate<=addDays(last,7)&&p.endDate>=addDays(first,-7)).map(p=>p.id);
      const q=pid=>firebaseDB.ref(`shops/${shopId}/subs`).orderByChild("periodId").equalTo(pid).once("value");
      const[subSnaps,actList]=await Promise.all([Promise.all(subPids.map(q)),
        Promise.all(actPids.map(pid=>ref(`shops/${shopId}/actuals/${pid}`).then(v=>[pid,v||{}])))]);
      const subs=[];subSnaps.forEach(sn=>Object.values(sn.val()||{}).forEach(x=>{if(x&&x.id)subs.push(x);}));
      return{staffList:Object.values(staff||{}).filter(x=>typeof x==="string"),settings,periods,subs,companyLink:coLink||null,
        laborMonths:lmMap||{},actuals:Object.fromEntries(actList),payMap:(priv&&priv.pay)||{},codeRec:(priv&&priv.payCode)||null,
        wageSettings:((coLink&&coLink.settings)||{}).wageSettings||null,periodId:target.id,key:`${run}_${shopId}_${ym}`};
    })().then(d=>{if(runRef.current===run)setData(d);},()=>{if(runRef.current===run)setData({error:"読み込みに失敗しました"});});
  },[shopId,ym,tick]);
  // 書き出しジョブは読み込み1回につき1つ（描画のたびに作り直すと ShiftEditTab の待ち時間がやり直しになる）
  const jobKey=data&&!data.error?data.key:null;
  const job=useMemo(()=>jobKey?{key:jobKey,kind:"payroll",
    onDone:(err,rep)=>{if(runRef.current!==Number(String(jobKey).split("_")[0]))return;setReport(err?{error:"計算に失敗しました"}:rep);}}:null,[jobKey]);
  const unlocked=!!(data&&!data.error&&pay.unlockedFor(data.codeRec));
  const rows=(report&&!report.error?report.rows:[]).map(r=>{
    const sysLabel=r.sys==="A"?"A":r.sys==="B"?"B":"未設定";
    if(r.dest)return{...r,sysLabel,note:`所属店舗（${r.homeName||"別の店舗"}）で計算します`};
    if(r.skip)return{...r,sysLabel,note:r.skip==="badSystem"?"労働時間制が未設定のため計算しません":"データがありません"};
    const notes=[];
    if(r.partial)notes.push("＋月の日がデータで埋まっていない途中の値");
    if(r.unread||r.helperUnread)notes.push("＋他店の勤務・実績を読み込めていない途中の値");
    if(r.schedSource==="auto")notes.push("所定は未確定（シフトから集計）");
    return{...r,sysLabel,notes,calc:monthlyPayBreakdown({pay:data.payMap[r.name]||null,ym:report.ym,times:r.times,
      denomMin:report.denomMin,wageSettings:data.wageSettings,schedAvgMin:r.schedAvgMin})};
  });
  const calcRows=rows.filter(r=>r.calc);
  const rates=premiumRatesOf(data&&data.wageSettings);
  const rule=roundingRuleOf(data&&data.wageSettings);
  const downloadCsv=()=>{
    if(!unlocked||!calcRows.length)return;
    const blob=new Blob(["﻿"+payrollCsvOf(calcRows,true)],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`${String(shopName||shopId).replace(/[\\/:*?"<>|]/g,"")}_${ym}_月次賃金.csv`;
    document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);
    ph("payroll_csv_exported",{rows:calcRows.length});tt&&tt("✓ CSV をダウンロードしました");
  };
  const TH={borderBottom:"1px solid var(--c-border2)",padding:"6px 6px",fontSize:11,color:"var(--c-text3)",fontWeight:700,textAlign:"left",whiteSpace:"nowrap",position:"sticky",top:0,background:"var(--c-card)"};
  const TD={borderBottom:"1px solid var(--c-border)",padding:"6px 6px",fontSize:12,whiteSpace:"nowrap",verticalAlign:"top"};
  return(<div data-payroll-page="1" style={{background:"var(--c-bg)",minHeight:"calc(100vh - 44px)"}}>
    <div style={{background:"var(--c-card)",borderBottom:"1px solid var(--c-border)",padding:"12px 16px"}}>
      <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{...AGray,padding:"6px 12px"}}>← 戻る</button>
        <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)",flex:"1 1 160px"}}>月次賃金<span style={{fontSize:13,fontWeight:400,color:"var(--c-text3)",marginLeft:8}}>{shopName}</span></div>
        {data&&!data.error&&<PayCodeBox pay={pay} rec={data.codeRec}/>}
      </div>
    </div>
    <div style={{maxWidth:1200,margin:"0 auto",padding:16}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <input type="month" value={ym} aria-label="対象の月" onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))setYm(e.target.value);}} style={{...AI,width:"auto",padding:"7px 10px"}}/>
        <button onClick={()=>setTick(t=>t+1)} style={{...AGray,padding:"7px 12px",fontSize:12}}>再読み込み</button>
        <button data-payroll-csv="1" disabled={!unlocked||!calcRows.length} onClick={downloadCsv}
          title={unlocked?"":"パスコードを入力すると出力できます"}
          style={{...AB,padding:"8px 14px",width:"auto",opacity:!unlocked||!calcRows.length?0.5:1}}>CSV を出力</button>
      </div>
      <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginBottom:12}}>
        割増賃金と欠勤控除の内訳です。社会保険・所得税・住民税・支給総額は計算しません（CSV を給与ソフトへ取り込んでください）。
        月給者は基本給を動かさず、割増と控除だけを出します。時給者は時給×実労働に割増を足します。
        賃金はこの月の1日時点の版で計算します（月の途中の改定は日割りしません）。
        割増率: {PREMIUM_RATE_KEYS.map(k=>`${PREMIUM_RATE_LABELS[k]}${rates[k]}%`).join("・")}。端数: {ROUNDING_RULE_LABELS[rule]}（欠勤控除は労働者に有利な向き）。
        {report&&!report.error&&<>分母 {fmtMin(report.denomMin)}。</>}
        {report&&!report.error&&!report.actualsReadable&&<>実績を読めないため確定シフトで計算しています。</>}
      </div>
      {!data?<div style={{fontSize:13,color:"var(--c-text3)"}}>読み込み中...</div>
        :data.error?<div data-payroll-error="1" style={{fontSize:13,color:"#DC2626"}}>✕ {data.error}</div>
        :!report?<div style={{fontSize:13,color:"var(--c-text3)"}}>計算中...</div>
        :report.error?<div data-payroll-error="1" style={{fontSize:13,color:"#DC2626"}}>✕ {report.error}</div>
        :<div style={{overflowX:"auto",background:"var(--c-card)",border:"1px solid var(--c-border)",borderRadius:8}}>
          <table data-payroll-table="1" style={{borderCollapse:"collapse",width:"100%"}}>
            <thead><tr>{PAYROLL_COLUMNS.map(c=><th key={c.key} style={{...TH,textAlign:c.kind==="text"?"left":"right"}}>{c.label}</th>)}</tr></thead>
            <tbody>{rows.map(r=>{
              if(!r.calc)return(<tr key={r.name} data-payroll-row={r.name}>
                {PAYROLL_COLUMNS.slice(0,5).map(c=><td key={c.key} style={TD}>{c.key==="number"?r.number:c.key==="name"?r.name:c.key==="attr"?r.attr:c.key==="sys"?r.sysLabel:""}</td>)}
                <td colSpan={PAYROLL_COLUMNS.length-5} style={{...TD,color:"var(--c-text3)"}}>{r.note}</td></tr>);
              const val=payrollRowValues(r);
              const warn=(r.calc.warnings||[]).length>0;
              return(<tr key={r.name} data-payroll-row={r.name}>{PAYROLL_COLUMNS.map(c=>{
                const t=payrollCellText(c,val,unlocked);
                const masked=c.kind==="yen"&&!unlocked&&t==="••••";
                return<td key={c.key} data-col={c.key} data-masked={masked?"1":undefined}
                  style={{...TD,textAlign:c.kind==="text"?"left":"right",color:c.key==="notes"&&warn?"#DC2626":masked?"var(--c-text3)":"var(--c-text)",
                    whiteSpace:c.key==="notes"?"normal":"nowrap",minWidth:c.key==="notes"?220:undefined,fontWeight:c.key==="name"?700:400}}>
                  {c.kind==="yen"&&t&&!masked?Number(t).toLocaleString("ja-JP"):t}</td>;})}</tr>);
            })}</tbody>
          </table>
        </div>}
    </div>
    {job&&!report&&<div style={{display:"none"}} aria-hidden="true">
      <ShiftEditTab key={job.key} subs={data.subs} periods={data.periods} staffList={data.staffList}
        onSave={()=>{}} tt={()=>{}} settings={data.settings} plan="premium" shopId={shopId} shopName={shopName}
        onUpgrade={()=>{}} allLinkedShops={[]} savePeriods={null} ownerReadOnly={true} pastSubsLoaded={true}
        initialPeriodId={data.periodId} exportJob={job}
        laborMonths={{...LABOR_MONTHS_OFF,loaded:true,map:data.laborMonths||{}}}
        actuals={{...ACTUALS_OFF,enabled:true,loaded:true,map:data.actuals||{}}}
        companyLink={data.companyLink}/>
    </div>}
  </div>);
}

// ===== 企業連携タブ =====
// ============================================================
// 企業の共通設定（2026-09-27 企業連携の拡張）
// 企業が決めた項目だけを持ち、空欄＝「店舗で設定」。企業設定＞店舗設定で、店舗は企業が決めていない
// 項目を自分で足せる。重ね合わせは App の effectiveSettings（applyCompanySettings）が行う。
// 保存は下のボタン1つで CF saveCompanyConfig を呼ぶ（入力のたびに CF を走らせない）。
// 単位は店舗設定と同じ: 労務設定は分（入力は時間）・勤務時間の上限・目安は時間。
// 労務設定は 0 も企業の決定（1日の延長上限0＝残業を前提にしない運用）、上限・目安・残業の 0 は未設定。
// ============================================================
const CO_LABOR_FIELDS=[
  {key:"fixedOvertimeMin",label:"固定残業",max:200},
  {key:"marginMin",label:"余裕",max:200},
  {key:"agreementDailyOtMin",label:"36協定 1日の延長上限",max:16},
  {key:"agreementMonthlyOtMin",label:"36協定 1か月の延長上限",max:200},
  {key:"agreementAnnualOtMin",label:"36協定 1年の延長上限",max:999},
];
// 時間を小数1桁で入力し、分で返す（年間所定・分母。2026-09-30 P2）。入力途中の「2080.」を消さないよう
// 文字列で持ち、確定（blur・Enter）のときだけ 0.1h 単位に丸めて返す。空欄は null（呼び出し側が意味を決める）。
function HoursDecimalInput({min,onCommit,placeholder,max=9999,width=84,zeroBlank=false}){
  const toText=m=>m===undefined||m===null||m===""||(zeroBlank&&!(Number(m)>0))?"":String(Math.round(Number(m)/6)/10);
  const[text,setText]=useState(toText(min));
  useEffect(()=>{setText(toText(min));},[min]);
  const commit=()=>{
    const t=text.trim();
    if(t===""){if(toText(min)!=="")onCommit(null);return;}
    const h=Number(t);
    if(!Number.isFinite(h)||h<0){setText(toText(min));return;}
    const v=Math.round(Math.min(max,h)*10)*6;
    setText(toText(v));
    if(v!==Number(min))onCommit(v);
  };
  return(<input type="text" inputMode="decimal" value={text} placeholder={placeholder}
    onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}
    style={{...AI,width,textAlign:"center",padding:"5px 6px"}}/>);
}
// 残業予定の配り方（属性の otProrate・2026-09-30 P3.5b）。企業の共通設定と店舗の設定タブで共有する。
// 空＝blankLabel（店舗なら既定の月ごと、企業なら店舗で設定）。固定枠は時間で入れ分で保存する。
function OtProrateField({value,onChange,blankLabel,fixedText}){
  const p=otProrateOf(value);
  const win=p?p.window:"";
  const LBL={fontSize:11,color:"var(--c-text3)",whiteSpace:"nowrap"};
  if(fixedText!==undefined)return(<div data-ot-prorate style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:8}}>
    <span style={LBL}>残業予定の配り方</span>{fixedText}</div>);
  return(<div data-ot-prorate style={{marginBottom:8}}>
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      <span style={LBL}>残業予定の配り方</span>
      {/* 選択肢「半月ごと（1〜15日・16日〜月末）」の長さで 320px 幅のページを広げていた（2026-10-04 実測 27px）ので親の幅で止める */}
      <select value={win} onChange={e=>{const w=e.target.value;onChange(w?{window:w,...(p&&p.fixedMin?{fixedMin:p.fixedMin}:{})}:null);}}
        style={{...AI,width:"auto",maxWidth:"100%",padding:"5px 8px",cursor:"pointer"}}>
        <option value="">{blankLabel}</option>
        {OT_PRORATE_WINDOWS.map(w=><option key={w} value={w}>{OT_PRORATE_WINDOW_LABELS[w]}</option>)}
      </select>
      {win&&<><span style={LBL}>固定枠</span>
        <HoursDecimalInput min={p.fixedMin||0} zeroBlank max={744} width={64} placeholder="なし" onCommit={v=>onChange({window:win,...(v>0?{fixedMin:v}:{})})}/>
        <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span></>}
    </div>
    {win&&<div style={{fontSize:11,color:"var(--c-text4)",marginTop:4}}>固定枠を入れると、区切りごとにその時間（区切りの実働が短ければ実働まで）を勤務日に実働の比で配ります。固定枠が無ければ従来どおり「月実働 − 総枠」を月の勤務日に配ります。1か月単位の変形労働時間制の人にだけ効きます。</div>}
  </div>);
}
const fmtOtProrate=v=>{const p=otProrateOf(v);return p?`${OT_PRORATE_WINDOW_LABELS[p.window]}${p.fixedMin?` 固定${minToH1(p.fixedMin)}h`:""}`:"—";};
const WEEK_START_OPTIONS=[[1,"月曜"],[2,"火曜"],[3,"水曜"],[4,"木曜"],[5,"金曜"],[6,"土曜"],[0,"日曜"]];
const minToH1=m=>String(Math.round((Number(m)||0)/6)/10);
// 労務判定の入力欄（法人の設定。2026-09-30 に CompanyConfigCard から切り出し、2026-10-01 に企業の共通設定からは外した）。
// 空欄＝店舗の設定タブの値を使う。
function CoLaborFields({labor,setLabor,placeholder,blankLabel}){
  const LBL={fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"};
  const UNIT={fontSize:11,color:"var(--c-text4)"};
  const numIn=(val,onCh,max,w=58)=>(<input type="number" min={0} max={max} value={val===undefined||val===null?"":val} placeholder={placeholder}
    onChange={e=>{const t=e.target.value;if(t===""){onCh(null);return;}onCh(Math.max(0,Math.min(max,parseInt(t)||0)));}}
    style={{...AI,width:w,textAlign:"center",padding:"5px 6px"}}/>);
  const b31=labor.monthlyBase31Min;
  return(<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
    <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
      <span style={{...LBL,minWidth:150}}>31日の月の総枠</span>
      {numIn(b31===undefined?null:Math.floor(b31/60),v=>setLabor("monthlyBase31Min",v===null?null:v*60+(b31===undefined?0:b31%60)),744,64)}
      <span style={UNIT}>時間</span>
      {numIn(b31===undefined?null:b31%60,v=>setLabor("monthlyBase31Min",(b31===undefined?0:Math.floor(b31/60))*60+(v||0)),59,64)}
      <span style={UNIT}>分</span>
    </div>
    {CO_LABOR_FIELDS.map(f=>(
      <div key={f.key} style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
        <span style={{...LBL,minWidth:150}}>{f.label}</span>
        {numIn(labor[f.key]===undefined?null:Math.floor(labor[f.key]/60),v=>setLabor(f.key,v===null?null:v*60),f.max)}
        <span style={UNIT}>h</span>
      </div>
    ))}
    <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
      <span style={{...LBL,minWidth:150}}>年の区切り</span>
      <select value={labor.fiscalYearStartMonth||""} onChange={e=>setLabor("fiscalYearStartMonth",e.target.value?parseInt(e.target.value):null)}
        style={{...AI,width:"auto",padding:"5px 8px",cursor:"pointer"}}>
        <option value="">{blankLabel}</option>
        <option value={1}>1月（暦年）</option><option value={4}>4月（年度）</option><option value={7}>7月</option><option value={10}>10月</option>
      </select>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
      <span style={{...LBL,minWidth:150}}>年間所定労働時間</span>
      <HoursDecimalInput min={labor.annualScheduledMin} onCommit={v=>setLabor("annualScheduledMin",v)} placeholder={placeholder}/>
      <span style={UNIT}>h（0＝使わない）</span>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
      <span style={{...LBL,minWidth:150}}>1時間当たり賃金の分母</span>
      <HoursDecimalInput min={labor.rateDenominatorMin} onCommit={v=>setLabor("rateDenominatorMin",v)} placeholder={placeholder}/>
      <span style={UNIT}>h（0＝年間所定÷12 を0.1h未満切り捨て）</span>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
      <span style={{...LBL,minWidth:150}}>週の起算</span>
      <select value={labor.weekStartDow===undefined||labor.weekStartDow===null?"":labor.weekStartDow} onChange={e=>setLabor("weekStartDow",e.target.value===""?null:parseInt(e.target.value))}
        style={{...AI,width:"auto",padding:"5px 8px",cursor:"pointer"}}>
        <option value="">{blankLabel}</option>
        {WEEK_START_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  </div>);
}
function CompanyConfigCard({companyId,onSaveCompanyConfig,tt}){
  const[draft,setDraft]=useState(null);
  const[loadErr,setLoadErr]=useState(false);
  const[busy,setBusy]=useState(false);
  const[dirty,setDirty]=useState(false);
  useEffect(()=>{
    if(!firebaseDB||!companyId){setDraft({});return;}
    let cancelled=false;
    setDraft(null);setLoadErr(false);setDirty(false);
    firebaseDB.ref(`companies/${companyId}/pub/config/settings`).once("value")
      .then(sn=>{if(!cancelled)setDraft(sn.val()||{});})
      .catch(()=>{if(!cancelled)setLoadErr(true);});
    return()=>{cancelled=true;};
  },[companyId]);
  if(loadErr)return(<AC title="企業の共通設定"><div style={{fontSize:12,color:"#FF4757"}}>✕ 企業の共通設定を読み込めませんでした。再読み込みしてください。</div></AC>);
  if(!draft)return(<AC title="企業の共通設定"><div style={{fontSize:12,color:"var(--c-text3)"}}>読み込み中...</div></AC>);
  const stl=draft.staffTypeLimits||{};
  const upd=next=>{setDraft(next);setDirty(true);};
  const setLim=(id,k,v)=>{
    const e={...(stl[id]||{})};
    if(v===null||v===undefined||v===""||(k!=="laborSystem"&&k!=="name"&&k!=="otProrate"&&!(v>0)))delete e[k];else e[k]=v;
    upd({...draft,staffTypeLimits:{...stl,[id]:e}});
  };
  const numIn=(val,onCh,max,w=58)=>(<input type="number" min={0} max={max} value={val===undefined||val===null?"":val} placeholder="店舗"
    onChange={e=>{const t=e.target.value;if(t===""){onCh(null);return;}onCh(Math.max(0,Math.min(max,parseInt(t)||0)));}}
    style={{...AI,width:w,textAlign:"center",padding:"5px 6px"}}/>);
  const coAttrIds=Object.keys(stl).filter(isCompanyAttrId);
  // 「その他」は企業の属性設定に出さない（2026-09-27 ユーザー指示）。店舗側の「その他」は従来どおり
  const attrRows=[...BUILTIN_TYPES.filter(id=>id!=="other").map(id=>[id,STAFF_TYPE_LABELS[id]]),...coAttrIds.map(id=>[id,null])];
  const addAttr=()=>upd({...draft,staffTypeLimits:{...stl,[genCompanyAttrId()]:{name:""}}});
  const delAttr=id=>{
    if(!window.confirm("この属性を削除しますか？\n各店舗でこの属性にしていたスタッフは「属性未設定」の扱いになります。"))return;
    const n={...stl};delete n[id];upd({...draft,staffTypeLimits:n});
  };
  const save=async()=>{
    if(!onSaveCompanyConfig)return;
    if(coAttrIds.some(id=>!((stl[id]||{}).name||"").trim())){tt("✕ 名前の無い属性があります。名前を入れるか削除してください");return;}
    setBusy(true);
    // 労務判定はこのカードでは扱わない（法人の設定へ統合・2026-10-01）。settings は CF で丸ごと置き換わるので、
    // 法人への移行がまだ済んでいない企業の laborSettings を消さないよう、保存の直前に読み直した値だけを送り直す
    // （読み込み時の下書きの値は送らない＝移行が済んでいれば何も送らず、済んでいなければそのまま残る）
    const fresh=firebaseDB?await firebaseDB.ref(`companies/${companyId}/pub/config/settings/laborSettings`).once("value").then(x=>x.val()).catch(()=>undefined):null;
    if(fresh===undefined){setBusy(false);tt("✕ 企業の共通設定を読み直せませんでした。もう一度保存してください");return;}
    const next={...draft};delete next.laborSettings;
    if(fresh&&typeof fresh==="object"&&Object.keys(fresh).length)next.laborSettings=fresh;
    const r=await onSaveCompanyConfig({settings:next});
    setBusy(false);
    if(r&&r.error){tt("✕ "+r.error);return;}
    setDirty(false);
    const f=(r&&r.failed)||[];
    tt(f.length?`△ ${(r.synced||[]).length}件に反映し、${f.length}件は失敗しました。もう一度保存してください`:`✓ 連携店舗 ${(r&&r.synced||[]).length} 件に反映しました`);
  };
  const LBL={fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"};
  const UNIT={fontSize:11,color:"var(--c-text4)"};
  return(<AC title="企業の共通設定">
    <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12,lineHeight:1.6}}>
      連携している全店舗の設定タブに、ここで入れた属性別の勤務時間制限が優先して適用されます。空欄の項目は各店舗が自分で設定できます。労務判定（31日の月の総枠・36協定など）は上の「法人」のカードの「法人の設定」で法人ごとに決めます。
    </div>
    <AL>属性別の勤務時間制限</AL>
    <div data-skilled-note="1" style={{fontSize:11,color:"var(--c-text4)",marginBottom:8,lineHeight:1.5}}>属性名に「{SKILLED_WORKER_ATTR_KEYWORD}」を含む属性のスタッフは、週1回の公休（月をまたぐ週は月末側と月初側に各1回）があるかを判定します。</div>
    {attrRows.map(([id,label])=>{
      const e=stl[id]||{};
      const isCo=isCompanyAttrId(id);
      return(<div key={id} data-co-attr={id} style={{marginBottom:8,padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          {isCo
            ?<input value={e.name||""} maxLength={20} placeholder="属性名を入力" onChange={ev=>setLim(id,"name",ev.target.value)} style={{...AI,flex:1,fontWeight:700,padding:"4px 8px"}}/>
            :<div style={{fontSize:13,fontWeight:700,color:"var(--c-text)",flex:1}}>{label}</div>}
          {isCo&&<button onClick={()=>delAttr(id)} style={{...AD,padding:"4px 10px",fontSize:12}}>削除</button>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
          <span style={LBL}>労働時間制</span>
          {/* 選択肢は A・B だけ（2026-10-03）。保存値 none（旧「判定対象外」）は B が選ばれた状態で出す（判定も B と同じ） */}
          <select value={laborSystemChoiceOf(e.laborSystem)} onChange={ev=>setLim(id,"laborSystem",ev.target.value||null)}
            style={{...AI,width:"auto",flex:"1 1 220px",minWidth:180,padding:"5px 8px",cursor:"pointer"}}>
            <option value="">店舗で設定</option>
            {LABOR_SYSTEM_CHOICES.map(v=><option key={v} value={v}>{LABOR_SYSTEM_LABELS[v]}</option>)}
          </select>
        </div>
        <OtProrateField value={e.otProrate} blankLabel="店舗で設定" onChange={v=>setLim(id,"otProrate",v)}/>
        {[["上限",false],["目安",true]].map(([rowLbl,isMin])=>(
          <div key={rowLbl} style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:isMin?0:6}}>
            <span style={{fontSize:11,fontWeight:700,color:isMin?"#2563EB":"#FF4757",minWidth:26}}>{rowLbl}</span>
            {STAFF_LIMIT_WINDOWS.map(w=>{const k=isMin?w.minKey:w.key;return(<React.Fragment key={k}>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={LBL}>{w.label}</span>
                {numIn(e[k]>0?e[k]:null,v=>setLim(id,k,v),w.max,52)}
                <span style={UNIT}>h</span>
              </div>
              {/* 1ヶ月の残業（上限・目安の両方に足す。上限の行にだけ入力欄を置く） */}
              {!isMin&&w.otKey&&<div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={LBL}>＋残業</span>
                {numIn(e[w.otKey]>0?e[w.otKey]:null,v=>setLim(id,w.otKey,v),w.otMax,52)}
                <span style={UNIT}>h</span>
              </div>}
            </React.Fragment>);})}
          </div>
        ))}
      </div>);
    })}
    <button onClick={addAttr} style={{width:"100%",padding:"8px",background:"transparent",border:"1px dashed var(--c-border2)",borderRadius:8,color:"var(--c-text3)",fontSize:12,cursor:"pointer",marginBottom:12}}>＋ 企業の属性を追加</button>
    <button disabled={busy||!dirty} onClick={save} style={{...AB,width:"100%",opacity:busy||!dirty?0.5:1}}>{busy?"保存中...":"企業の共通設定を保存"}</button>
  </AC>);
}

// ============================================================
// シフトの提出状況と提出期限（2026-09-27 企業連携の拡張）
// 対象店舗は companies/{id}/pub/shops（企業に連携した店舗）で、allLinkedShops ではない
// （あちらは企業に入れていない自分の店舗も含む）。期間は店舗ごとにIDが違うので、開始日_終了日で
// 対応づけ、「2026年10月前半」のような選択肢にする（企業内は同じ作成期間で運用する前提）。
// 提出期限は企業が期間ごとに日付を直接入れる（全店舗共通の1つだけ。店舗別は 2026-09-27 のユーザー指示で廃止）。
// 期間ごとの日付を入れていない期間には「毎月の固定締切」（例: 毎月10日・25日）が効く。優先は 日付指定 ＞ 毎月の固定。
// 読めなかった店舗は「読み込み失敗」と出し、提出済みにも未提出にも数えない（丸めない）。
// ============================================================
// ============================================================
// 企業内登録スタッフ（2026-09-28）。企業連携タブのカードから全画面の一覧を開く。人数が多いので
// 管理者画面の中身を丸ごと差し替えて出す（AdminView の fullPage）。ブラウザの新しいタブは使わない——
// 実ログインは永続化しない設計なので、新しいタブでは未ログインになり companies/{id}/pub を読めない。
// 載せるのは店舗に依存しない情報だけ（従業員番号・属性・所属店舗・有給）。計算は buildCompanyStaffRows（app-utils.js）。
// ============================================================
// 法人（entity）（2026-09-30・労務給与_複数法人_実装計画.md §3.1・P1）
// 企業の下に法人を置き、店舗は必ず1法人に属す。正本は companies/{id}/pub の entities / shopEntities /
// defaultEntityId / shopKinds（書くのは CF だけ）。法人の設定は企業の共通設定より優先して写しに焼かれる。
// 法人が1つも無い企業（P1 より前に作った企業）は、このカードを開いたときに CF ensureCompanyEntities で
// 企業名と同名の法人を1つ作り、全店舗をそこへ割り当てる（片方向の移行・見た目は変わらない）。
// ============================================================
// 企業の構造（法人・店舗の割当・本部の種別）を読む。読めなかった項目は null（呼び出し側は「法人なし」として扱う）
async function readCompanyStructure(companyId){
  const keys=["entities","shopEntities","defaultEntityId","shopKinds"];
  const vals=await Promise.all(keys.map(k=>firebaseDB.ref(`companies/${companyId}/pub/${k}`).once("value").then(x=>x.val()).catch(()=>null)));
  const out={};keys.forEach((k,i)=>{out[k]=vals[i];});
  return out;
}
function CompanyEntityCard({companyId,shopNames={},onCompanyCall,onSaveCompanyConfig,tt,onChanged,onOpenPayroll}){
  const[st,setSt]=useState(null); // {pub, shopIds, names}
  const[loadErr,setLoadErr]=useState(false);
  const[tick,setTick]=useState(0);
  const[busy,setBusy]=useState(false);
  const[newName,setNewName]=useState("");
  const[nameDraft,setNameDraft]=useState({}); // {entityId: 入力中の名前}
  const[openCfg,setOpenCfg]=useState(null);   // 設定を開いている法人ID
  const[cfgDraft,setCfgDraft]=useState(null); // その法人の laborSettings の下書き
  const[wageDraft,setWageDraft]=useState([]); // その法人の最低賃金の履歴 [{from,yen}]（P6a・賃金設定ページの最賃比較に使う）
  const[rateDraft,setRateDraft]=useState({}); // 割増率の上乗せ {ot,over60,night,holiday: 入力中の文字列}（P6b・空欄＝法定値）
  const[roundDraft,setRoundDraft]=useState("ceil"); // 金額の端数規則（P6b）
  const triedEnsureRef=useRef(false);
  const triedMigrateRef=useRef(false);
  useEffect(()=>{
    if(!firebaseDB||!companyId){setSt({pub:{},shopIds:[],names:{}});return;}
    let cancelled=false;
    setLoadErr(false);
    Promise.all([readCompanyStructure(companyId),firebaseDB.ref(`companies/${companyId}/pub/shops`).once("value")]).then(async([pub,shS])=>{
      const shopIds=Object.keys(shS.val()||{});
      // 法人の無い企業は1回だけ移行を頼む（CF が法人を作り、全店舗を割り当てて写しを作り直す）
      if(companyEntityList(pub).length===0&&!triedEnsureRef.current&&onCompanyCall){
        triedEnsureRef.current=true;
        const r=await onCompanyCall("ensureCompanyEntities",{});
        if(cancelled)return;
        if(r&&r.error){tt("✕ 法人を準備できませんでした: "+r.error);}
        else{setTick(t=>t+1);onChanged&&onChanged();return;}
      }
      // 労務判定を企業の共通設定から法人の設定へ移す（2026-10-01・1回だけ）。各法人に「企業の値＋法人の値（法人が勝つ）」を
      // 保存し、全法人が通ってから企業側の laborSettings を外す。写しは移行の前後で同じ（planLaborToEntities）。
      // 失敗したら企業側は消さない（重ね合わせの結果は同じなので、次に開いたときにやり直せる）
      if(!triedMigrateRef.current&&onCompanyCall&&onSaveCompanyConfig&&companyEntityList(pub).length>0){
        triedMigrateRef.current=true;
        const cs=await firebaseDB.ref(`companies/${companyId}/pub/config/settings`).once("value").then(x=>x.val()).catch(()=>null);
        const plan=planLaborToEntities(cs,{...pub,shops:shS.val()||{}});
        if(plan){
          const ids=Object.keys(plan.entities);
          let ok=true;
          for(const eid of ids){
            const r=await onCompanyCall("saveEntityConfig",{entityId:eid,settings:plan.entities[eid]});
            if(r&&r.error){ok=false;break;}
          }
          if(cancelled)return;
          const r2=ok?await onSaveCompanyConfig({settings:plan.company}):null;
          if(cancelled)return;
          if(ok&&!(r2&&r2.error)){tt(`✓ 労務判定の設定を法人へ移しました（${ids.length}法人）`);setTick(t=>t+1);onChanged&&onChanged();return;}
          tt("✕ 労務判定の設定を法人へ移せませんでした（企業の値はそのまま効いています）。もう一度開くとやり直します");
        }
      }
      const names={};
      await Promise.all(shopIds.map(async sid=>{
        const nS=await firebaseDB.ref(`global/shops/${sid}/name`).once("value").catch(()=>null);
        names[sid]=(nS&&nS.val())||shopNames[sid]||sid;
      }));
      if(!cancelled)setSt({pub,shopIds,names});
    }).catch(()=>{if(!cancelled)setLoadErr(true);});
    return()=>{cancelled=true;};
  },[companyId,tick]);
  const call=async(name,payload,okMsg)=>{
    if(!onCompanyCall)return false;
    setBusy(true);
    const r=await onCompanyCall(name,payload);
    setBusy(false);
    if(r&&r.error){tt("✕ "+r.error);return false;}
    const f=(r&&r.failed)||[];
    tt(f.length?`△ ${okMsg}（${f.length}店舗への反映に失敗しました。もう一度保存してください）`:"✓ "+okMsg);
    setTick(t=>t+1);onChanged&&onChanged();
    return true;
  };
  if(loadErr)return(<AC title="法人"><div style={{fontSize:12,color:"#FF4757"}}>✕ 法人を読み込めませんでした。<button onClick={()=>setTick(t=>t+1)} style={{...AGray,marginLeft:8,padding:"4px 10px",fontSize:12}}>再読み込み</button></div></AC>);
  if(!st)return(<AC title="法人"><div style={{fontSize:12,color:"var(--c-text3)"}}>読み込み中...</div></AC>);
  const ents=companyEntityList(st.pub);
  const entOf=sid=>companyEntityIdOfShop(st.pub,sid);
  const kindOf=sid=>companyShopKindOf(st.pub,sid);
  const TD={borderBottom:"1px solid var(--c-border)",padding:"8px 6px",fontSize:13,verticalAlign:"middle"};
  const openConfig=e=>{
    if(openCfg===e.id){setOpenCfg(null);setCfgDraft(null);return;}
    const cur=((((st.pub.entities||{})[e.id]||{}).settings)||{});
    setOpenCfg(e.id);setCfgDraft({...(cur.laborSettings||{})});
    setWageDraft(((cur.wageSettings&&sanitizeWageSettings(cur.wageSettings).minWage)||[]).map(x=>({from:x.from,yen:String(x.yen)})));
    const cw=sanitizeWageSettings(cur.wageSettings);
    setRateDraft(Object.fromEntries(PREMIUM_RATE_KEYS.map(k=>[k,cw.premiumRates&&cw.premiumRates[k]?String(cw.premiumRates[k]):""])));
    setRoundDraft(roundingRuleOf(cur.wageSettings));
  };
  const setLabor=(k,v)=>setCfgDraft(d=>{const n={...(d||{})};if(v===null||v===undefined)delete n[k];else n[k]=v;return n;});
  const saveConfig=async eid=>{
    // 法人の設定は丸ごと置き換える。属性別の制限は画面から触らないので、保存済みの値をそのまま送り直す
    const cur=((((st.pub.entities||{})[eid]||{}).settings)||{});
    const pr={};PREMIUM_RATE_KEYS.forEach(k=>{if(String(rateDraft[k]||"").trim())pr[k]=Number(rateDraft[k]);});
    const wage=sanitizeWageSettings({minWage:wageDraft.map(x=>({from:x.from,yen:Number(x.yen)})),premiumRates:pr,roundingRule:roundDraft});
    if(wageDraft.some(x=>x.from||x.yen)&&(wage.minWage||[]).length!==wageDraft.filter(x=>x.from||x.yen).length){tt("▲ 最低賃金は適用開始日と時間額（1〜100,000円の整数）を両方入れてください。同じ日付は1つだけです");return;}
    const badRate=PREMIUM_RATE_KEYS.find(k=>pr[k]!==undefined&&!(Number.isInteger(pr[k])&&pr[k]>=LEGAL_PREMIUM_RATES[k]&&pr[k]<=PREMIUM_RATE_MAX));
    if(badRate){tt(`▲ ${PREMIUM_RATE_LABELS[badRate]}の割増率は ${LEGAL_PREMIUM_RATES[badRate]}〜${PREMIUM_RATE_MAX}% の整数で入れてください（法定より下げられません）`);return;}
    const settings={...(cur.staffTypeLimits?{staffTypeLimits:cur.staffTypeLimits}:{}),laborSettings:cfgDraft||{},...(Object.keys(wage).length?{wageSettings:wage}:{})};
    if(await call("saveEntityConfig",{entityId:eid,settings},"法人の設定を保存しました")){setOpenCfg(null);setCfgDraft(null);}
  };
  return(<AC title="法人">
    <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12,lineHeight:1.6}}>
      連携店舗を法人（雇用主）ごとに分けて管理します。店舗は必ずどれか1つの法人に属します。労務判定（31日の月の総枠・36協定など）は「法人の設定」で法人ごとに決め、その法人の店舗の設定タブに優先して適用されます。
    </div>
    {ents.length===0&&<div style={{fontSize:12,color:"var(--c-text4)",marginBottom:10}}>法人がまだありません。</div>}
    {ents.map(e=>{
      const draft=nameDraft[e.id];
      const nm=draft!==undefined?draft:e.name;
      const nShops=st.shopIds.filter(sid=>entOf(sid)===e.id).length;
      return(<div key={e.id} data-co-entity={e.id} style={{marginBottom:8,padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <input value={nm} maxLength={100} onChange={ev=>setNameDraft(d=>({...d,[e.id]:ev.target.value}))} style={{...AI,flex:"1 1 180px",fontWeight:700,padding:"5px 8px"}}/>
          {draft!==undefined&&draft.trim()!==e.name&&<button data-co-entity-rename={e.id} disabled={busy||!draft.trim()} onClick={async()=>{if(await call("renameEntity",{entityId:e.id,name:draft.trim()},"法人名を変更しました"))setNameDraft(d=>{const n={...d};delete n[e.id];return n;});}} style={{...AGray,padding:"5px 10px",fontSize:12}}>保存</button>}
          <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"}}>{nShops}店舗{e.isDefault?"・既定":""}</span>
          <button onClick={()=>openConfig(e)} style={{...AGray,padding:"5px 10px",fontSize:12}}>{openCfg===e.id?"閉じる":"法人の設定"}</button>
        </div>
        {onOpenPayroll&&nShops>0&&<div data-co-entity-payroll={e.id} style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:8}}>
          <span style={{fontSize:12,color:"var(--c-text3)"}}>月次賃金:</span>
          {st.shopIds.filter(sid=>entOf(sid)===e.id).sort((a,b)=>String(st.names[a]).localeCompare(String(st.names[b]),"ja")).map(sid=>(
            <button key={sid} data-co-payroll-btn={sid} onClick={()=>onOpenPayroll(sid,st.names[sid])} style={{...AGray,padding:"4px 10px",fontSize:12}}>{st.names[sid]} →</button>))}
        </div>}
        {openCfg===e.id&&cfgDraft&&<div style={{marginTop:10}}>
          <AL>労務判定（空欄は店舗の設定）</AL>
          <CoLaborFields labor={cfgDraft} setLabor={setLabor} placeholder="店舗" blankLabel="店舗で設定"/>
          <AL>最低賃金（適用開始日と時間額）</AL>
          <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:6,lineHeight:1.5}}>スタッフの賃金設定ページで、時給（月給は基本給の時給換算）と比べます。改定のたびに行を足してください。</div>
          {wageDraft.map((w,i)=>(<div key={i} data-co-min-wage={i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
            <input type="date" value={w.from} onChange={ev=>setWageDraft(a=>a.map((x,j)=>j===i?{...x,from:ev.target.value}:x))} style={{...AI,width:"auto",padding:"5px 8px"}}/>
            <input inputMode="numeric" value={w.yen} placeholder="円" aria-label="最低賃金（円）" onChange={ev=>setWageDraft(a=>a.map((x,j)=>j===i?{...x,yen:ev.target.value.replace(/\D/g,"")}:x))} style={{...AI,width:100,padding:"5px 8px",textAlign:"right"}}/>
            <span style={{fontSize:12,color:"var(--c-text3)"}}>円</span>
            <button onClick={()=>setWageDraft(a=>a.filter((_,j)=>j!==i))} style={{...AD,marginLeft:0}}>削除</button>
          </div>))}
          <button onClick={()=>setWageDraft(a=>[...a,{from:"",yen:""}])} style={{...AGray,fontSize:12,padding:"6px 10px",marginBottom:12}}>＋ 最低賃金を追加</button>
          <AL>割増率（空欄は法定の率・上乗せだけできます）</AL>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>{PREMIUM_RATE_KEYS.map(k=>(<label key={k} data-co-premium-rate={k} style={{display:"flex",alignItems:"center",gap:4,fontSize:12,color:"var(--c-text2)"}}>
            {PREMIUM_RATE_LABELS[k]}
            <input inputMode="numeric" value={rateDraft[k]||""} placeholder={String(LEGAL_PREMIUM_RATES[k])} aria-label={`${PREMIUM_RATE_LABELS[k]}の割増率`}
              onChange={ev=>{const v=ev.target.value.replace(/\D/g,"").slice(0,3);setRateDraft(d=>({...d,[k]:v}));}} style={{...AI,width:64,padding:"5px 8px",textAlign:"right"}}/>%
          </label>))}</div>
          <AL>金額の端数（月次賃金の各項目）</AL>
          <select data-co-rounding="1" value={roundDraft} onChange={ev=>setRoundDraft(ev.target.value)} style={{...AI,width:"auto",padding:"5px 8px",marginBottom:12,cursor:"pointer"}}>
            {ROUNDING_RULES.map(r=><option key={r} value={r}>{ROUNDING_RULE_LABELS[r]}{r==="ceil"?"（既定）":""}</option>)}
          </select>
          <button disabled={busy} onClick={()=>saveConfig(e.id)} style={{...AB,width:"100%",opacity:busy?0.5:1}}>{busy?"保存中...":"この法人の設定を保存"}</button>
        </div>}
      </div>);
    })}
    <div style={{display:"flex",gap:8,margin:"4px 0 16px"}}>
      <input value={newName} onChange={e=>setNewName(e.target.value)} maxLength={100} placeholder="法人名（例：株式会社〇〇）" style={{...AI,flex:1}}/>
      <button disabled={busy||!newName.trim()} onClick={async()=>{if(await call("createEntity",{name:newName.trim()},"法人を追加しました"))setNewName("");}} style={{...AB,whiteSpace:"nowrap",opacity:busy||!newName.trim()?0.5:1}}>＋ 法人を追加</button>
    </div>
    <AL>店舗の法人と種別</AL>
    {st.shopIds.length===0?<div style={{fontSize:12,color:"var(--c-text4)"}}>連携店舗がありません。</div>:(
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",minWidth:320}}>
          <thead><tr>{["店舗","法人","種別"].map(h=><th key={h} style={{...TD,fontSize:11,color:"var(--c-text3)",textAlign:"left",fontWeight:700}}>{h}</th>)}</tr></thead>
          <tbody>{st.shopIds.slice().sort((a,b)=>String(st.names[a]).localeCompare(String(st.names[b]),"ja")).map(sid=>(
            <tr key={sid} data-co-shop-entity={sid}>
              <td style={{...TD,fontWeight:600}}>{st.names[sid]}</td>
              <td style={TD}>
                <select disabled={busy||ents.length===0} value={entOf(sid)||""} onChange={ev=>{if(ev.target.value)call("assignShopEntity",{shopId:sid,entityId:ev.target.value},`「${st.names[sid]}」の法人を変更しました`);}} style={{...AI,width:"auto",padding:"5px 8px",cursor:"pointer"}}>
                  {!entOf(sid)&&<option value="">未設定</option>}
                  {ents.map(e=><option key={e.id} value={e.id}>{e.name||"（名前なし）"}</option>)}
                </select>
              </td>
              <td style={TD}>
                <select disabled={busy} value={kindOf(sid)} onChange={ev=>call("setShopKind",{shopId:sid,kind:ev.target.value},ev.target.value==="hq"?`「${st.names[sid]}」を本部にしました`:`「${st.names[sid]}」を店舗に戻しました`)} style={{...AI,width:"auto",padding:"5px 8px",cursor:"pointer"}}>
                  <option value="shop">店舗</option>
                  <option value="hq">本部</option>
                </select>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    )}
    <div style={{fontSize:11,color:"var(--c-text3)",marginTop:8,lineHeight:1.6}}>本部にした店舗では、期間管理タブにスタッフ提出URLを出しません（ボタンで表示はできます）。企業内登録スタッフでは「本部」の見出しで分かれます。</div>
  </AC>);
}
// 法人で絞る選択肢（法人が2つ以上のときだけ出す）
function EntityFilter({ents,value,onChange}){
  if(!ents||ents.length<2)return null;
  return(<select data-co-entity-filter="1" value={value} onChange={e=>onChange(e.target.value)} style={{...AI,width:"auto",maxWidth:"100%",padding:"5px 8px",cursor:"pointer"}}>
    <option value="">すべての法人</option>
    {ents.map(e=><option key={e.id} value={e.id}>{e.name||"（名前なし）"}</option>)}
  </select>);
}
function CompanyStaffCard({onOpen}){
  return(<AC title="企業内登録スタッフ">
    <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12,lineHeight:1.6}}>企業に連携している全店舗の登録スタッフを、従業員番号・属性・所属店舗・有給日数の一覧で確認できます。</div>
    <button onClick={()=>onOpen&&onOpen()} style={{...AGray,width:"100%"}}>一覧を開く</button>
  </AC>);
}
function CompanyStaffDirectory({companyId,onBack,pay=PAY_OFF,plan="free",onCompanyCall}){
  const[data,setData]=useState(null); // {rows, failed:[店舗名], ents, shops:[{id,name}], coAttrs:{属性ID:名前}, people}
  // 人物ID（P1b）: 一覧を開いたとき、まだどの人物にもつながっていない登録があれば CF ensureCompanyPeople に
  // 人物を作らせる（初回は全員分・既存の推定と同じまとまり）。1回開くごとに1回だけ頼む
  const ensuredRef=useRef(false);
  const[msg,setMsg]=useState(null);       // {ok:bool, text}
  const[busy,setBusy]=useState(false);
  const[editRow,setEditRow]=useState(null);
  const[picked,setPicked]=useState([]);   // 統合のために選んだ personId（最大2）
  const[mergeOpen,setMergeOpen]=useState(false);
  // 編集・統合のモーダルは結果をモーダルの中にも出す（覆いの下の一覧の帯は見えない）。開いた瞬間に前の操作の結果を出さないよう消す
  useEffect(()=>{if(editRow||mergeOpen)setMsg(null);},[editRow,mergeOpen]);
  const callPeople=async(name,payload,okText,opt)=>{
    if(!onCompanyCall){setMsg({ok:false,text:"企業アカウントでログインしてください"});return null;}
    setBusy(true);
    const r=await onCompanyCall(name,payload);
    setBusy(false);
    if(r&&r.error){setMsg({ok:false,text:"✕ "+r.error});return null;}
    const f=(r&&r.failed)||[];
    setMsg(f.length?{ok:false,text:`△ ${okText}（${f.length}店舗への反映に失敗しました。もう一度実行してください）`}:{ok:true,text:"✓ "+okText});
    // keepOpen は編集モーダルの保存の途中の呼び出し。読み直すと data が null になりモーダルが外れるので、閉じるときにまとめて読み直す
    if(opt&&opt.keepOpen)editDirtyRef.current=true;else setReloadTick(t=>t+1);
    return r||{};
  };
  const[loadErr,setLoadErr]=useState(false);
  const[reloadTick,setReloadTick]=useState(0);
  const[mode,setMode]=useState("number");
  const editDirtyRef=useRef(false);
  const[query,setQuery]=useState("");
  const[entityFilter,setEntityFilter]=useState("");
  // 賃金列（P6a）。パスコードは企業のもの（companies/{id}/private/payCode・企業uidと作成者だけが読める）。
  // 賃金は所属店舗の shops/{sid}/private/pay（owners だけ）を、解除したときに初めて読みに行く。
  const payOn=featureEnabled("pay",{plan});
  const[coCode,setCoCode]=useState(undefined); // undefined=読み込み中 / null=未設定（0000）
  const[wages,setWages]=useState(null);         // {shopId: {名前: レコード} | null(読めない)}
  // パスコードの変更（上部の箱の「変更」）。変えたら企業のパスコードを読み直す
  const[coCodeModal,setCoCodeModal]=useState(false);
  const[coCodeTick,setCoCodeTick]=useState(0);
  useEffect(()=>{
    if(!payOn||!firebaseDB||!companyId){setCoCode(null);return;}
    let c=false;
    firebaseDB.ref(`companies/${companyId}/private/payCode`).once("value").then(x=>{if(!c)setCoCode(x.val()||null);}).catch(()=>{if(!c)setCoCode(null);});
    return()=>{c=true;};
  },[companyId,coCodeTick]);
  const wageUnlocked=payOn&&coCode!==undefined&&pay.unlockedFor(coCode);
  useEffect(()=>{
    if(!wageUnlocked||!data||wages)return;
    const ids=[...new Set(data.rows.map(r=>r.payShopId).filter(Boolean))];
    let c=false;
    Promise.all(ids.map(sid=>firebaseDB.ref(`shops/${sid}/private/pay`).once("value").then(x=>[sid,x.val()||{}]).catch(()=>[sid,null])))
      .then(ps=>{if(!c)setWages(Object.fromEntries(ps));});
    return()=>{c=true;};
  },[wageUnlocked,data,wages]);
  const wageCell=r=>{
    if(!wageUnlocked)return<span style={{color:"var(--c-text3)",letterSpacing:2}}>••••</span>;
    if(!wages)return"…";
    if(!r.payShopId)return<span style={{color:"var(--c-text4)"}}>—</span>;
    const m=wages[r.payShopId];
    if(m===null)return<span title="この店舗の賃金を読めませんでした" style={{color:"var(--c-text4)"}}>読めません</span>;
    const v=m[r.payName];
    if(!v)return<span style={{color:"var(--c-text4)"}}>—</span>;
    const n=normalizePayVersion(v);
    return`${PAY_TYPE_LABELS[n.payType]} ${maskYen(n.base,true)}`;
  };
  useEffect(()=>{
    if(!firebaseDB||!companyId){setData({rows:[],failed:[],ents:[]});return;}
    let cancelled=false;
    setData(null);setLoadErr(false);
    Promise.all([
      firebaseDB.ref(`companies/${companyId}/pub/shops`).once("value"),
      firebaseDB.ref(`companies/${companyId}/pub/config/settings`).once("value").catch(()=>null),
      readCompanyStructure(companyId),
      firebaseDB.ref(`companies/${companyId}/pub/people`).once("value").then(x=>x.val()||{}).catch(()=>null),
    ]).then(async([shS,csS,structure,people])=>{
      const ids=Object.keys(shS.val()||{});
      const failed=[];
      const shops=(await Promise.all(ids.map(async sid=>{
        const nS=await firebaseDB.ref(`global/shops/${sid}/name`).once("value").catch(()=>null);
        const name=(nS&&nS.val())||sid;
        try{
          // subs は読まない（有給の残数は期間の凍結値 laborTotals だけで数える）
          const[st,se,pe]=await Promise.all(["staff","settings","periods"].map(p=>firebaseDB.ref(`shops/${sid}/${p}`).once("value").then(x=>x.val())));
          // 写しの settings（企業共通 → 法人 を重ねた値）。無ければ企業の共通設定で代える（2026-09-30・P1）
          const coS=await firebaseDB.ref(`shops/${sid}/company/settings`).once("value").catch(()=>null);
          return{id:sid,name,staff:st||[],settings:se||{},periods:pe||{},coSettings:(coS&&coS.val())||null,
            entityId:companyEntityIdOfShop(structure,sid)||"",kind:companyShopKindOf(structure,sid)};
        }catch{failed.push(name);return null;}
      }))).filter(Boolean);
      if(cancelled)return;
      const cs=(csS&&csS.val())||null;
      const rows=buildCompanyStaffRows(shops,cs,fd(new Date()),people);
      const coAttrs={};Object.entries((cs&&cs.staffTypeLimits)||{}).forEach(([id,v])=>{if(isCompanyAttrId(id))coAttrs[id]=(v&&v.name)||id;});
      setData({rows,failed,ents:companyEntityList(structure),shops:shops.map(x=>({id:x.id,name:x.name})),coAttrs,people});
      // 未リンクの登録があれば人物を作らせる（読めない店舗があるときは頼まない＝その店舗の登録を別人物として作らない）
      if(onCompanyCall&&people&&!failed.length&&rows.some(r=>!r.personId)&&!ensuredRef.current){
        ensuredRef.current=true;
        const r=await onCompanyCall("ensureCompanyPeople",{});
        if(!cancelled&&r&&!r.error&&r.changed)setReloadTick(t=>t+1);
      }
    }).catch(()=>{if(!cancelled)setLoadErr(true);});
    setWages(null);
    return()=>{cancelled=true;};
  },[companyId,reloadTick]);
  // 並びは3つ（2026-10-02 ユーザー指示）: 「従業員番号順」は法人に関係なく番号だけで並べる（見出しなし）。
  // 「法人別」（法人が2つ以上のときだけ）は法人 → 本部かどうか → 番号。「店舗別」は法人 → 本部かどうか → 店舗 → 番号。
  // 本部の行は各法人の最後に「本部」の見出しでまとめる（2026-09-30・P1）
  const ents=(data&&data.ents)||[];
  const entIdx={};ents.forEach((e,i)=>{entIdx[e.id]=i;});
  const shown=useMemo(()=>{
    if(!data)return[];
    const grouped=mode!=="number";
    return filterCompanyStaffRows(data.rows,query).filter(r=>!entityFilter||r.entityId===entityFilter).slice().sort((a,b)=>{
      if(grouped){
        const ea=entIdx[a.entityId]??99,eb=entIdx[b.entityId]??99;if(ea!==eb)return ea-eb;
        if(!!a.isHq!==!!b.isHq)return a.isHq?1:-1;
      }
      return compareCompanyStaffRows(a,b,mode==="shop"?"shop":"number");
    });
  },[data,query,mode,entityFilter]);
  const multiEnt=ents.length>=2;
  // 同じ番号が別の法人でも使われている行（番号は法人内で一意なので通常は起きない。決定 #13）。
  // 数字だけの番号だけを見る（「派遣」などの文字の番号は重複にしない・2026-10-02 ユーザー指示。CF の staffNumberConflict と同じ）
  const numEnts=useMemo(()=>{
    const m={};(data?data.rows:[]).forEach(r=>{const n=String(r.number||"").trim();if(!/^\d{1,20}$/.test(n))return;(m[n]=m[n]||new Set()).add(r.entityId||"");});
    return m;
  },[data]);
  const otherEntNames=r=>{
    const set=numEnts[String(r.number||"").trim()];
    if(!set||set.size<2)return[];
    return[...set].filter(e=>e!==(r.entityId||"")).map(e=>(ents[entIdx[e]]||{}).name||"法人未設定");
  };
  const togglePick=pid=>setPicked(p=>p.includes(pid)?p.filter(x=>x!==pid):[...p.slice(-1),pid]);
  // 重複候補（P3.6）: 同じ名前が2店舗以上にあるのに人物が別。ヘルプ先の勤務は人物で束ねて所属店舗へ合算するので、
  // 別人物のままだと合算されない。一覧の先頭に出し、その場で統合できるようにする（同姓同名の別人もここに出る）
  const dupCands=useMemo(()=>data?duplicatePersonCandidates(data.rows):[],[data]);
  const shopNameOf=id=>((data&&data.shops)||[]).find(x=>x.id===id)?.name||id;
  const pickedRows=picked.map(pid=>(data?data.rows:[]).find(r=>r.personId===pid)).filter(Boolean);
  const sectionOf=r=>{
    if(mode==="number")return"";
    const en=multiEnt&&!entityFilter?((ents[entIdx[r.entityId]]||{}).name||"法人未設定"):"";
    return r.isHq?(en?en+"・本部":"本部"):en;
  };
  const TH={padding:"8px 10px",textAlign:"left",fontSize:12,fontWeight:700,color:"var(--c-text2)",background:"var(--c-input)",borderBottom:"1px solid var(--c-border)",whiteSpace:"nowrap"};
  const TD={padding:"8px 10px",fontSize:13,color:"var(--c-text)",borderBottom:"1px solid var(--c-border)",whiteSpace:"nowrap"};
  const modeBtn=(id,label)=><button key={id} onClick={()=>setMode(id)} style={{padding:"7px 12px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",background:mode===id?"var(--c-accent)":"var(--c-input)",color:mode===id?"#fff":"var(--c-text2)",border:`1px solid ${mode===id?"var(--c-accent)":"var(--c-border)"}`}}>{label}</button>;
  const paidCell=r=>{
    if(r.paidGranted==null)return"—";
    const miss=r.paidMissing&&r.paidMissing.length>0;
    const remain=r.paidRemain==null?"—":(miss?"＋":"")+r.paidRemain;
    return<span title={miss?`凍結値の無い期間があるため途中の値です: ${r.paidMissing.join("・")}`:""}>付与 {r.paidGranted}／残 <b style={{color:miss?"var(--c-text3)":"var(--c-text)"}}>{remain}</b></span>;
  };
  let lastShop=null,lastSection="";
  return(<div style={{background:"var(--c-bg)",minHeight:"calc(100vh - 44px)"}}>
    <div style={{background:"var(--c-card)",borderBottom:"1px solid var(--c-border)",padding:"12px 16px"}}>
      {/* 幅はヘッダーと本文で同じ値にする。900 だと PC でも長いフルネーム・別の登録名・賃金列で表が横スクロールした（2026-09-30 に 1280 へ） */}
      <div style={{maxWidth:1280,margin:"0 auto",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{...AGray,whiteSpace:"nowrap"}}>← 戻る</button>
        <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)"}}>企業内登録スタッフ</div>
      </div>
    </div>
    <div style={{maxWidth:1280,margin:"0 auto",padding:"16px 14px 60px"}}>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="従業員番号・名前で検索" style={{...AI,boxSizing:"border-box",marginBottom:10}}/>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10}}>
        {/* 並びは「従業員番号順」「法人別」「店舗別」「パスコード」の順（決定12・法人別は 2026-10-02）。パスコードは企業のもの */}
        {modeBtn("number","従業員番号順")}{multiEnt&&modeBtn("entity","法人別")}{modeBtn("shop","店舗別")}
        {payOn&&coCode!==undefined&&<PayCodeBox pay={pay} rec={coCode} onOpenChange={onCompanyCall?()=>setCoCodeModal(true):undefined}/>}
        <EntityFilter ents={ents} value={entityFilter} onChange={setEntityFilter}/>
        <span style={{fontSize:12,color:"var(--c-text3)",marginLeft:"auto"}}>{data?`${shown.length}名`:""}</span>
        <button onClick={()=>setReloadTick(t=>t+1)} style={{background:"none",border:"none",color:"var(--c-text3)",fontSize:12,cursor:"pointer"}}>再読み込み</button>
      </div>
      {msg&&<div data-co-person-msg="1" style={{fontSize:13,color:msg.ok?"var(--c-text2)":"#B45309",marginBottom:10}}>{msg.text}</div>}
      {pickedRows.length>0&&<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10,padding:"8px 10px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8}}>
        <span style={{fontSize:13,color:"var(--c-text2)"}}>{pickedRows.map(r=>r.name).join("・")}を選択中</span>
        <button disabled={busy||pickedRows.length!==2} onClick={()=>setMergeOpen(true)} style={{...AB,padding:"6px 12px",fontSize:13,opacity:busy||pickedRows.length!==2?0.5:1}}>同一人物として統合</button>
        <button onClick={()=>setPicked([])} style={{...AGray,padding:"6px 12px",fontSize:13}}>選択を解除</button>
      </div>}
      {dupCands.length>0&&<div data-co-dup-cands="1" style={{marginBottom:12,padding:"10px 12px",background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.35)",borderRadius:8}}>
        <div style={{fontSize:13,fontWeight:700,color:"var(--c-text)",marginBottom:4}}>重複候補（{dupCands.length}件）</div>
        <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:8,lineHeight:1.6}}>同じ名前が2つ以上の店舗に別の人として登録されています。同じ人なら「統合」を押すと、ヘルプ先での勤務が所属店舗の労務集計に合算されます。同姓同名の別人（外国人スタッフの略称など）なら「統合しない」を押してください。統合しないと記録した組は候補に出なくなります（取消は「編集」から）。</div>
        {dupCands.map(g=>(<div key={g.rows.map(r=>r.personId).join("|")} data-co-dup-cand={g.name} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"6px 0",borderTop:"1px solid rgba(245,158,11,.25)"}}>
          <span style={{fontSize:13,fontWeight:700,color:"var(--c-text)"}}>{g.name}</span>
          <span style={{fontSize:12,color:"var(--c-text2)"}}>{g.rows.map(r=>`${(r.links||[]).map(l=>shopNameOf(l.shopId)).join("・")}${r.number?`（${r.number}）`:""}`).join(" ／ ")}</span>
          {g.rows.some(r=>!r.homeExplicit)&&<span data-co-dup-home-hint="1" style={{fontSize:11,color:"#B45309"}}>所属店舗を設定してください（{g.rows.filter(r=>!r.homeExplicit).map(r=>(r.links||[]).map(l=>shopNameOf(l.shopId)).join("・")).join(" ／ ")}の{g.name}）</span>}
          <span style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginLeft:"auto"}}>
            {g.rows.length===2
              ?<button disabled={busy} onClick={()=>{setPicked(g.rows.map(r=>r.personId));setMergeOpen(true);}} style={{...AB,padding:"5px 12px",fontSize:12,opacity:busy?0.5:1}}>統合</button>
              :<span style={{fontSize:11,color:"var(--c-text3)"}}>統合する2人を一覧で選んでください</span>}
            {/* 別人と記録する（組の全員の全ペア・両方向）。記録した組は候補に出なくなる。取り消しは各人の「編集」から */}
            <button data-co-distinct="1" disabled={busy} onClick={()=>callPeople("markPeopleDistinct",{personIds:g.rows.map(r=>r.personId),distinct:true},"別の人として記録しました（重複候補に出なくなります）")} style={{...AGray,padding:"5px 12px",fontSize:12,opacity:busy?0.5:1}}>統合しない</button>
          </span>
        </div>))}
      </div>}
      {loadErr&&<div style={{fontSize:13,color:"#DC2626",marginBottom:10}}>読み込めませんでした。再読み込みしてください。</div>}
      {data&&data.failed.length>0&&<div style={{fontSize:12,color:"#B45309",marginBottom:10}}>{data.failed.join("・")}は読み込めませんでした（一覧に含まれていません）。</div>}
      {!data&&!loadErr&&<div style={{fontSize:13,color:"var(--c-text3)"}}>読み込み中...</div>}
      {data&&<div style={{overflowX:"auto",border:"1px solid var(--c-border)",borderRadius:8,background:"var(--c-card)"}}>
        <table style={{borderCollapse:"collapse",width:"100%",minWidth:560}}>
          <thead><tr>{["従業員番号","名前","属性","所属店舗","有給（日）",...(payOn?["賃金"]:[]),""].map(h=><th key={h||"edit"} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {shown.length===0&&<tr><td colSpan={payOn?7:6} style={{...TD,textAlign:"center",color:"var(--c-text4)",padding:20}}>該当するスタッフはいません</td></tr>}
            {shown.map(r=>{
              const shopName=r.homeShopName||r.shopName;
              const sec=sectionOf(r);
              const secHead=sec!==lastSection&&!!sec;if(sec!==lastSection){lastSection=sec;lastShop=null;}
              const head=mode==="shop"&&shopName!==lastShop;lastShop=shopName;
              const homes=(r.homeShopNames||[r.homeShopName]).map(n=>n||"連携していない店舗");
              return(<React.Fragment key={r.key||r.shopId+"|"+r.name}>
                {secHead&&<tr data-co-section={sec}><td colSpan={payOn?7:6} style={{...TD,fontSize:13,fontWeight:700,color:"var(--c-text)",background:"var(--c-input)"}}>{sec}</td></tr>}
                {head&&<tr><td colSpan={payOn?7:6} style={{...TD,fontSize:12,fontWeight:700,color:"var(--c-text2)",background:"var(--c-input2)"}}>{shopName}</td></tr>}
                <tr data-co-person={r.personId||""}>
                  <td style={TD}>
                    {/* 統合のための選択（2人まで）。人物IDの無い行（準備中）は選べない */}
                    <input type="checkbox" aria-label={`${r.name}を選択`} disabled={!r.personId} checked={!!r.personId&&picked.includes(r.personId)} onChange={()=>r.personId&&togglePick(r.personId)} style={{marginRight:8,verticalAlign:"middle",width:16,height:16}}/>
                    {r.number||<span style={{color:"var(--c-text4)"}}>—</span>}
                    {otherEntNames(r).length>0&&<div style={{fontSize:11,color:"#B45309",marginTop:2,whiteSpace:"normal"}}>番号 {r.number} は{otherEntNames(r).join("・")}でも使われています</div>}
                  </td>
                  <td style={TD}>{r.name}{r.hidden&&<span style={{marginLeft:6,fontSize:11,color:"var(--c-text3)"}}>非表示中</span>}
                    {r.conflictNames&&r.conflictNames.length>0&&<div title="同じ従業員番号で名前の違う登録があります" style={{fontSize:11,color:"#B45309",marginTop:2}}>別の登録名: {r.conflictNames.join("・")}</div>}</td>
                  <td style={TD}>{r.attrLabel||<span style={{color:"var(--c-text4)"}}>未設定</span>}</td>
                  <td style={{...TD,whiteSpace:"normal"}}>{homes.map((n,i)=><span key={i} style={{whiteSpace:"nowrap",color:n==="連携していない店舗"?"var(--c-text4)":undefined}}>{i>0?"・":""}{n}</span>)}
                    {/* 2店舗以上に登録があって所属店舗が明示されていない人は、ヘルプ先の勤務をどちらへ合算するか決まらない（P3.6） */}
                    {(r.links||[]).length>=2&&!r.homeExplicit&&<div data-co-home-hint="1" style={{fontSize:11,color:"#B45309",marginTop:2}}>所属店舗を設定してください</div>}</td>
                  <td style={TD}>{paidCell(r)}</td>
                  {payOn&&<td style={TD} data-co-wage={r.name}>{wageCell(r)}</td>}
                  <td style={{...TD,textAlign:"right"}}><button data-co-person-edit="1" disabled={!r.personId||busy} title={r.personId?"":"人物IDを準備中です"} onClick={()=>setEditRow(r)} style={{...AGray,padding:"5px 10px",fontSize:12,opacity:r.personId?1:0.5}}>編集</button></td>
                </tr>
              </React.Fragment>);
            })}
          </tbody>
        </table>
      </div>}
    </div>
    {editRow&&data&&<CompanyPersonEditModal row={editRow} data={data} busy={busy} msg={msg}
      onClose={()=>{setEditRow(null);if(editDirtyRef.current){editDirtyRef.current=false;setReloadTick(t=>t+1);}}}
      onCall={async(name,payload,okText,opt)=>{const r=await callPeople(name,{personId:editRow.personId,...payload},okText,opt);
        if(r&&!(opt&&opt.keepOpen)){editDirtyRef.current=false;setEditRow(null);}return r;}}/>}
    {mergeOpen&&pickedRows.length===2&&<CompanyPersonMergeModal rows={pickedRows} ents={ents} busy={busy} msg={msg} onClose={()=>setMergeOpen(false)}
      onMerge={async(keep,drop)=>{const r=await callPeople("mergePeople",{keepPersonId:keep,dropPersonId:drop},"同一人物として統合しました");if(r){setMergeOpen(false);setPicked([]);}}}/>}
    {coCodeModal&&<PayCodeChangeModal tt={t=>setMsg({ok:t.startsWith("✓"),text:t})} onClose={()=>setCoCodeModal(false)}
      onSubmit={async(cur,next)=>{const r=await companyPayCodeSubmit(onCompanyCall)(cur,next);if(!(r&&r.error))setCoCodeTick(t=>t+1);return r;}}/>}
  </div>);
}
// 企業内登録スタッフの「編集」（P1b・§3.8）。すべて CF 経由（店舗のデータを丸ごと読み込んで書き戻さない）。
// 名前の変更は店舗の登録名を変える（StaffTab の改名と同じ結果）。保存ボタンは1つ（2026-10-02 ユーザー指示で「名前を変更」を外した）。
// 保存は ① 番号・法人・属性・所属店舗（companyUpdateStaff）→ ② 名前（companyRenameStaff）の順に送る。①は同じ値で送り直しても
// 結果が変わらず、②は一度通ると「名前が変わっていません」で拒否されるので、①が拒否されたら何も変えずに止まり、②だけ失敗したら
// 押し直しで①を送り直しても害が無い。①が一部の店舗で失敗（failed）したときも②へ進まず、失敗をモーダルに残す。①の後は一覧を読み直さない（読み直すとモーダルが外れる）。閉じるときに読み直す。
// 属性と所属店舗は、この人がつながっている全店舗の設定に同じ値を書く（変えないときは「変更しない」のまま）。
// 編集・統合モーダルの中の結果（成功はモーダルが閉じるので、ここに残るのは主に拒否の「✕ 理由」）。
// 一覧の帯（data-co-person-msg）は覆いの下に隠れるので、モーダルの中に同じ内容を出す。スクロールしても見えるよう上端に貼り付ける
function CompanyModalMsg({msg}){
  if(!msg)return null;
  return<div data-co-person-modal-msg="1" role="status" style={{position:"sticky",top:-18,zIndex:1,margin:"8px 0",padding:"8px 10px",borderRadius:8,fontSize:13,lineHeight:1.5,
    background:msg.ok?"var(--c-input)":"#FEF3C7",color:msg.ok?"var(--c-text2)":"#B45309",border:`1px solid ${msg.ok?"var(--c-border)":"#F59E0B"}`}}>{msg.text}</div>;
}
function CompanyPersonEditModal({row,data,busy,msg,onClose,onCall}){
  const links=row.links||[];
  const[newName,setNewName]=useState(row.name);
  const[renameShops,setRenameShops]=useState(links.map(l=>l.shopId));
  const[number,setNumber]=useState(row.number||"");
  const[entityId,setEntityId]=useState(row.entityId||"");
  const[attr,setAttr]=useState("");
  const[home,setHome]=useState("");
  const ents=data.ents||[];
  const attrOpts=[...BUILTIN_TYPES.map(id=>[id,STAFF_TYPE_LABELS[id]]),...Object.entries(data.coAttrs||{})];
  const numberDigits=/^\d{1,20}$/.test(String(row.number||"").trim());
  // 名前の変更は、いまの登録名が新しい名前と同じ店舗を送らない（CF は1店舗でも「名前が変わっていません」なら全体を拒否する）
  const nn=newName.trim();
  const sameName=sid=>(links.find(l=>l.shopId===sid)||{}).name===nn;
  const renameTargets=renameShops.filter(sid=>!sameName(sid));
  const doRename=!!nn&&renameTargets.length>0;
  const save=async()=>{
    const payload={};
    if(number.trim()!==String(row.number||""))payload.number=number.trim();
    if(entityId&&entityId!==(row.entityId||""))payload.entityId=entityId;
    if(attr)payload.attrs=Object.fromEntries(links.map(l=>[l.shopId,attr]));
    if(home)payload.homeShops=Object.fromEntries(links.map(l=>[l.shopId,home]));
    const hasUpdate=Object.keys(payload).length>0;
    if(!hasUpdate&&!doRename){onClose();return;}
    if(hasUpdate){
      const r=await onCall("companyUpdateStaff",payload,doRename?"番号などを保存しました。名前はまだ変えていません":"保存しました",{keepOpen:doRename});
      // ①が一部の店舗で失敗したら②へ進まない（進むと②の成功表示が「n店舗への反映に失敗」を上書きし、モーダルも閉じて失敗が見えなくなる）。
      // モーダルは開いたままなので、押し直せば①を送り直してから②へ進む
      if(!r||(r.failed&&r.failed.length))return;
    }
    if(doRename)await onCall("companyRenameStaff",{shopIds:renameTargets,newName:nn},hasUpdate?"保存し、名前を変更しました":"名前を変更しました");
  };
  const SEC={borderTop:"1px solid var(--c-border)",paddingTop:12,marginTop:12};
  return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div data-co-person-modal={row.personId} onClick={e=>e.stopPropagation()} style={{background:"var(--c-card)",borderRadius:12,padding:18,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxSizing:"border-box"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)",flex:1}}>{row.name}</div>
        <button onClick={onClose} style={{...AGray,padding:"5px 10px",fontSize:12}}>閉じる</button>
      </div>
      <div style={{fontSize:11,color:"var(--c-text3)"}}>人物ID: <span data-co-person-id="1">{row.personId}</span></div>
      <CompanyModalMsg msg={msg}/>

      <div style={SEC}>
        <AL>名前</AL>
        <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:6,lineHeight:1.5}}>変えると、チェックした店舗の登録名が下の「保存」で変わります（店舗のスタッフタブで変えるのと同じです。提出・設定・確定済みの期間・賃金も新しい名前に移ります）。</div>
        <input value={newName} onChange={e=>setNewName(e.target.value)} aria-label="新しい名前" style={{...AI,boxSizing:"border-box",marginBottom:6}}/>
        {links.map(l=>(<label key={l.shopId} style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"var(--c-text2)",marginBottom:4}}>
          <input type="checkbox" checked={renameShops.includes(l.shopId)} onChange={()=>setRenameShops(a=>a.includes(l.shopId)?a.filter(x=>x!==l.shopId):[...a,l.shopId])} style={{width:16,height:16}}/>
          {l.shopName}（いまの登録名: {l.name}）
          {nn&&l.name===nn&&renameShops.includes(l.shopId)&&<span data-co-rename-same="1" style={{fontSize:11,color:"var(--c-text4)"}}>既にこの名前です（変更しません）</span>}
        </label>))}
        {!nn&&<div style={{fontSize:11,color:"#B45309",marginTop:4}}>名前が空欄のときは名前を変えません。</div>}
      </div>

      <div style={SEC}>
        <AL>従業員番号・法人・属性・所属店舗</AL>
        <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:4}}>従業員番号（数字だけの番号は法人の中で重複できません）</div>
        <input value={number} onChange={e=>setNumber(e.target.value)} aria-label="従業員番号" style={{...AI,boxSizing:"border-box",marginBottom:8}}/>
        {ents.length>0&&<><div style={{fontSize:12,color:"var(--c-text3)",marginBottom:4}}>法人</div>
          <select value={entityId} onChange={e=>setEntityId(e.target.value)} aria-label="法人" style={{...AI,marginBottom:8,cursor:"pointer"}}>
            {!entityId&&<option value="">未設定</option>}
            {ents.map(e=><option key={e.id} value={e.id}>{e.name||"（名前なし）"}</option>)}
          </select></>}
        <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:4}}>属性（いま: {row.attrLabel||"未設定"}）</div>
        <select value={attr} onChange={e=>setAttr(e.target.value)} aria-label="属性" style={{...AI,marginBottom:8,cursor:"pointer"}}>
          <option value="">変更しない</option>
          {attrOpts.map(([id,nm])=><option key={id} value={id}>{nm}</option>)}
        </select>
        <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:4}}>所属店舗（いま: {(row.homeShopNames||[row.homeShopName]).filter(Boolean).join("・")||"—"}）</div>
        <select value={home} onChange={e=>setHome(e.target.value)} aria-label="所属店舗" style={{...AI,marginBottom:8,cursor:"pointer"}}>
          <option value="">変更しない</option>
          {(data.shops||[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:6,lineHeight:1.5}}>属性と所属店舗は、この人が登録されている全店舗（{links.map(l=>l.shopName).join("・")}）の設定に書きます。</div>
        <button data-co-person-save="1" disabled={busy} onClick={save} style={{...AB,width:"100%",opacity:busy?0.5:1}}>保存</button>
      </div>

      {links.length>1&&<div style={SEC}>
        <AL>統合の解除</AL>
        <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:6,lineHeight:1.5}}>別の人を同じ人物にまとめてしまったときに、店舗の登録を別の人物として切り出します。店舗のデータは変わりません。</div>
        {links.map(l=>(<div key={l.shopId} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          <span style={{flex:1,fontSize:13,color:"var(--c-text2)"}}>{l.shopName}: {l.name}</span>
          <button disabled={busy} onClick={()=>onCall("splitPerson",{shopId:l.shopId},`${l.shopName}の${l.name}を別の人物にしました`)} style={{...AGray,padding:"5px 10px",fontSize:12}}>切り出す</button>
        </div>))}
      </div>}

      {(row.distinct||[]).length>0&&<div style={SEC} data-co-distinct-list="1">
        <AL>統合しない相手</AL>
        <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:6,lineHeight:1.5}}>同じ名前の別人として記録した相手です。この相手とは重複候補に出ません。同じ人だったときは取り消してから統合してください。</div>
        {row.distinct.map(pid=>{
          const o=(data.rows||[]).find(r=>r.personId===pid);
          const label=o?`${o.name}（${(o.links||[]).map(l=>l.shopName).join("・")}）`:`人物ID ${pid}（見つかりません）`;
          return(<div key={pid} data-co-distinct-peer={pid} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{flex:1,fontSize:13,color:"var(--c-text2)"}}>{label}</span>
            <button data-co-distinct-undo="1" disabled={busy} onClick={()=>onCall("markPeopleDistinct",{personIds:[row.personId,pid],distinct:false},"別の人としての記録を取り消しました")} style={{...AGray,padding:"5px 10px",fontSize:12}}>取消</button>
          </div>);
        })}
      </div>}

      {numberDigits&&String(row.number).trim()!==row.personId&&<div style={SEC}>
        <AL>人物ID</AL>
        <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:6,lineHeight:1.5}}>人物IDは作成後に自動では変わりません。従業員番号（{row.number}）に揃えるときだけ押してください。</div>
        <button disabled={busy} onClick={()=>onCall("reassignPersonId",{},"人物IDを従業員番号に振り直しました")} style={{...AGray,width:"100%"}}>ID を番号に振り直す</button>
      </div>}
    </div>
  </div>);
}
// 統合: 2人のうち、番号・法人・所属店舗を残す方を選ぶ（店舗側のデータは動かさない）
function CompanyPersonMergeModal({rows,ents,busy,msg,onClose,onMerge}){
  const[keep,setKeep]=useState(rows[0].personId);
  const entName=id=>((ents||[]).find(e=>e.id===id)||{}).name||"";
  const drop=rows.find(r=>r.personId!==keep).personId;
  return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div data-co-merge-modal="1" onClick={e=>e.stopPropagation()} style={{background:"var(--c-card)",borderRadius:12,padding:18,width:"100%",maxWidth:440,boxSizing:"border-box"}}>
      <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>同一人物として統合</div>
      <CompanyModalMsg msg={msg}/>
      <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,lineHeight:1.6}}>番号・法人・所属店舗を残す方を選んでください。店舗の登録名とデータはそのままで、一覧で1人にまとまります。誤って統合したときは「編集」から解除できます。</div>
      {rows.map(r=>(<label key={r.personId} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 10px",marginBottom:6,border:`1px solid ${keep===r.personId?"var(--c-accent)":"var(--c-border)"}`,borderRadius:8,cursor:"pointer"}}>
        <input type="radio" name="co-merge-keep" checked={keep===r.personId} onChange={()=>setKeep(r.personId)} style={{marginTop:3}}/>
        <span style={{fontSize:13,color:"var(--c-text)"}}><b>{r.name}</b><br/>
          <span style={{color:"var(--c-text3)"}}>番号 {r.number||"なし"}{entName(r.entityId)?`・${entName(r.entityId)}`:""}・所属 {(r.homeShopNames||[r.homeShopName]).filter(Boolean).join("・")||"—"}</span></span>
      </label>))}
      <div style={{display:"flex",gap:8,marginTop:10}}>
        <button onClick={onClose} style={{...AGray,flex:1}}>やめる</button>
        <button disabled={busy} onClick={()=>onMerge(keep,drop)} style={{...AB,flex:1,opacity:busy?0.5:1}}>統合</button>
      </div>
    </div>
  </div>);
}

function CompanySubmissionsCard({companyId,shopNames={},onSaveCompanyConfig,tt,renderDownload,structureTick=0}){
  const[state,setState]=useState(null); // {shopIds,names,periods:{sid:Period[]|null},deadlines,monthly,structure}
  // 法人で絞る（2026-09-30・P1）。"" はすべての法人。法人が2つ以上のときだけ選択肢が出る
  const[entityFilter,setEntityFilter]=useState("");
  const[loadErr,setLoadErr]=useState(false);
  const[rangeKey,setRangeKey]=useState("");
  const[dlAll,setDlAll]=useState("");
  const[dlDirty,setDlDirty]=useState(false);
  const[monthly,setMonthly]=useState([]);
  const[monthlyDirty,setMonthlyDirty]=useState(false);
  // ユーザーがセレクトで期間を選んだか。選んでいなければ、読み込みのたびに最新の期間へ合わせる
  const userPickedRef=useRef(false);
  const[busy,setBusy]=useState(false);
  const[reloadTick,setReloadTick]=useState(0);
  // 確定・交付（P3）。操作中の店舗と、履歴を開いている店舗
  const[actSid,setActSid]=useState(null);
  const[histSid,setHistSid]=useState(null);
  useEffect(()=>{
    if(!firebaseDB||!companyId){setState({shopIds:[],names:{},periods:{},deadlines:{},monthly:[],structure:{}});return;}
    let cancelled=false;
    setLoadErr(false);
    Promise.all([
      firebaseDB.ref(`companies/${companyId}/pub/shops`).once("value"),
      firebaseDB.ref(`companies/${companyId}/pub/config/deadlines`).once("value"),
      firebaseDB.ref(`companies/${companyId}/pub/config/monthlyDeadlineDays`).once("value"),
      readCompanyStructure(companyId),
    ]).then(async([shS,dlS,mdS,structure])=>{
      const shopIds=Object.keys(shS.val()||{});
      const names={},periods={};
      await Promise.all(shopIds.map(async sid=>{
        const[nS,pS]=await Promise.all([
          firebaseDB.ref(`global/shops/${sid}/name`).once("value").catch(()=>null),
          firebaseDB.ref(`shops/${sid}/periods`).once("value").catch(()=>null),
        ]);
        names[sid]=(nS&&nS.val())||shopNames[sid]||sid;
        // 配列はオブジェクトで返るので Object.values → id 持ちに絞る（CLAUDE.md の読み取り規則）
        periods[sid]=pS?Object.values(pS.val()||{}).filter(x=>x&&x.id).sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate))):null;
      }));
      if(cancelled)return;
      setState({shopIds,names,periods,deadlines:dlS.val()||{},monthly:sanitizeMonthlyDeadlineDays(mdS.val()),structure:structure||{}});
    }).catch(()=>{if(!cancelled)setLoadErr(true);});
    return()=>{cancelled=true;};
  },[companyId,reloadTick,structureTick]);
  const ents=useMemo(()=>state?companyEntityList(state.structure):[],[state]);
  // 選んでいた法人が消えたら「すべて」に戻す
  useEffect(()=>{if(entityFilter&&!ents.some(e=>e.id===entityFilter))setEntityFilter("");},[ents,entityFilter]);
  const inFilter=sid=>!entityFilter||(state&&companyEntityIdOfShop(state.structure,sid))===entityFilter;
  // 期間の選択肢は法人ごとに分ける（法人ごとに期間の切り方が違ってよい・計画書 §3.1）
  const ranges=useMemo(()=>{
    if(!state)return[];
    const ok={};Object.keys(state.periods).forEach(sid=>{if(state.periods[sid]&&inFilter(sid))ok[sid]=state.periods[sid];});
    return collectPeriodRanges(ok);
  },[state,entityFilter]);
  // 既定の期間: 連携店舗のどれか1店舗でも作っている最新の期間（2026-09-27 ユーザー指示。以前は
  // 「今日を含む期間」で、次の期間を作り始めても表示が前の期間のままだった）。
  // ユーザーが選び直した期間は、期限の保存などの再読み込みで戻さない（無くなったときだけ最新へ）。
  useEffect(()=>{
    if(!ranges.length){setRangeKey("");return;}
    if(userPickedRef.current&&ranges.some(x=>x.key===rangeKey))return;
    setRangeKey(ranges[0].key);
  },[ranges]); // rangeKey は依存に入れない（選んだ直後に最新へ戻さないため）
  // 期間を切り替えたら、その期間の期限を入力欄へ読み込む（未保存の入力は捨てる）
  useEffect(()=>{
    const e=(state&&state.deadlines&&state.deadlines[rangeKey])||{};
    setDlAll(e.all||"");setDlDirty(false);
  },[rangeKey,state]);
  // 保存済みの毎月の固定締切を編集欄へ読み込む（再読み込みのたび。未保存の編集は捨てる）
  useEffect(()=>{setMonthly((state&&state.monthly)||[]);setMonthlyDirty(false);},[state]);
  if(loadErr)return(<AC title="シフトの提出状況"><div style={{fontSize:12,color:"#FF4757"}}>✕ 提出状況を読み込めませんでした。<button onClick={()=>setReloadTick(t=>t+1)} style={{...AGray,marginLeft:8,padding:"4px 10px",fontSize:12}}>再読み込み</button></div></AC>);
  if(!state)return(<AC title="シフトの提出状況"><div style={{fontSize:12,color:"var(--c-text3)"}}>読み込み中...</div></AC>);
  const savedDlDate=((state.deadlines||{})[rangeKey]||{}).all;
  const curRange=ranges.find(x=>x.key===rangeKey);
  const effOf=(dateStr,days)=>isValidDateStr(dateStr)?{date:dateStr,source:"date"}:(curRange?(d=>d?{date:d,source:"monthly"}:null)(monthlyDeadlineFor(days,curRange.startDate)):null);
  const savedEff=effOf(savedDlDate,state.monthly);
  const draftEff=effOf(dlAll,monthly);
  // 日付指定が無い期間は、毎月の固定締切から出した日付を入力欄の初期値にする（2026-09-27 ユーザー指示）。
  // 書き換えて保存すると、その期間だけの日付指定になる。書き換えずに保存しても日付指定にはしない
  // （毎月の締切を後から変えたときに追随させるため）。
  const monthlyInitial=!dlAll&&draftEff&&draftEff.source==="monthly"?draftEff.date:"";
  const entIdx={};ents.forEach((e,i)=>{entIdx[e.id]=i;});
  const entName={};ents.forEach(e=>{entName[e.id]=e.name;});
  const eOf=sid=>companyEntityIdOfShop(state.structure,sid);
  const rows=state.shopIds.filter(inFilter).map(sid=>{
    const ps=state.periods[sid];
    if(ps===null)return{sid,name:state.names[sid],status:"failed"};
    const p=findShopPeriodByRange(ps,rangeKey);
    if(!p)return{sid,name:state.names[sid],status:"none"};
    const sub=p.submission&&p.submission.at?p.submission:null;
    // 期限切れの判定は保存済みの値で行う（入力中の未保存の値では赤くしない）。日付指定が無ければ毎月の固定締切
    return{sid,name:state.names[sid],period:p,status:sub?"submitted":"pending",submission:sub,deadline:savedEff?savedEff.date:null};
  }).map(x=>({...x,entityId:eOf(x.sid),isHq:companyShopKindOf(state.structure,x.sid)==="hq"}))
    // 法人の順（既定の法人が先頭）→ 店舗名。一括PDFもこの順で出るので、法人ごとにまとまる
    .sort((a,b)=>{const ea=entIdx[a.entityId]??99,eb=entIdx[b.entityId]??99;if(ea!==eb)return ea-eb;return String(a.name).localeCompare(String(b.name),"ja");});
  // すべての法人を表示していて法人が2つ以上なら、法人の見出し行で分ける
  const showEntityHeads=!entityFilter&&ents.length>=2;
  const nSub=rows.filter(x=>x.status==="submitted").length;
  const nPend=rows.filter(x=>x.status==="pending").length;
  const nConf=rows.filter(x=>x.period&&isPeriodConfirmed(x.period)).length;
  const nDeliv=rows.filter(x=>x.period&&isPeriodDelivered(x.period)).length;
  // ===== 確定・解除・交付（2026-09-30・P3・計画書 §3.5）=====
  // この表は企業セッション（企業コードのログインと企業の作成者本人）にしか出ない＝確定できるのはここと、
  // 企業セッションで開いた店舗のシフト作成タブだけ。店舗の提出データ・設定・所定を読み、シフト作成タブと
  // 同じ planPeriodConfirmation で集計する（計算を二重に持たない）。期間は差分 update（全体 set() しない）。
  const loadForConfirm=async(sid,period,withHelper)=>{
    const ref=p=>firebaseDB.ref(p).once("value");
    const[stS,seS,coS,pS,lmS]=await Promise.all([ref(`shops/${sid}/staff`),ref(`shops/${sid}/settings`),ref(`shops/${sid}/company`),ref(`shops/${sid}/periods`),ref(`shops/${sid}/laborMonths`)]);
    const periods=Object.values(pS.val()||{}).filter(x=>x&&x.id);
    const cur=periods.find(p=>p.id===period.id);
    if(!cur)throw new Error("期間が見つかりません");
    // その月にかかる期間の提出をすべて読む（半月運用では前半・後半を合わせて月を集計する）
    const months=monthsOfPeriod(cur);
    const overl=periods.filter(p=>p.startDate&&p.endDate&&months.some(ym=>p.startDate<=`${ym}-31`&&p.endDate>=`${ym}-01`));
    const snaps=await Promise.all(overl.map(p=>firebaseDB.ref(`shops/${sid}/subs`).orderByChild("periodId").equalTo(p.id).once("value")));
    const subs=[];snaps.forEach(sn=>Object.values(sn.val()||{}).forEach(x=>{if(x&&x.id)subs.push(x);}));
    const coLink=coS.val()||null;
    const staffList=Object.values(stS.val()||{}).filter(n=>typeof n==="string");
    const settings=applyCompanySettings(seS.val()||makeSettings(sid),(coLink&&coLink.settings)||{});
    // ヘルプ先勤務の合算（P3.6）。同じ法人の連携店舗の予定（subs）を読み、所属店舗の所定に足す／行き先の店では
    // 所属店舗で判定する人を数えない。シフト作成タブの確定と同じ helperScheduleContext を通す
    const ents=(coLink&&coLink.shopEntities)||{};
    // 読むのは確定のときだけ（解除・交付は所定を集計しない）
    const others=withHelper?Object.keys((coLink&&coLink.shops)||{}).filter(o=>o!==sid&&!(coLink.entityId&&ents[o]&&ents[o]!==coLink.entityId)):[];
    const raw=await Promise.all(others.map(async o=>{
      const r=await Promise.all(["settings","subs","staff","periods"].map(k=>ref(`shops/${o}/${k}`).catch(()=>null)));
      return[o,otherShopDataOf({name:(coLink.shops||{})[o]||o,settings:r[0]&&r[0].val(),subs:r[1]&&r[1].val(),staff:r[2]&&r[2].val(),periods:r[3]&&r[3].val(),
        loadFailed:r.some(x=>!x)})];
    }));
    const hctx=helperScheduleContext({shopId:sid,names:staffList,settings,companyLink:coLink,otherShops:helperShopsOf(coLink,Object.fromEntries(raw),sid),subs,todayStr:fd(new Date())});
    return{cur,periods,subs,staffList,settings,laborMonths:lmS.val()||{},helper:hctx};
  };
  const uidNow=()=>(typeof firebaseAuth!=="undefined"&&firebaseAuth&&firebaseAuth.currentUser&&firebaseAuth.currentUser.uid)||"";
  const writePlan=async(sid,orig,r)=>{
    const flat=diffPeriodsForFlatWrite([orig],[r.period]);
    if(Object.keys(flat).length)await fbUpd(`shops/${sid}/periods`,flat);
    if(r.laborMonthsPatch&&Object.keys(r.laborMonthsPatch).length)await fbUpd(`shops/${sid}/laborMonths`,r.laborMonthsPatch);
  };
  const periodAct=async(x,kind)=>{
    if(!firebaseDB||!x.period||actSid)return;
    let note="";
    if(kind==="confirm"&&!confirm(`${x.name}の「${x.period.label||cur&&cur.label}」を確定しますか？\n確定すると、その期間のシフトは店舗で編集できなくなり、スタッフの再提出もできなくなります。人×月の所定を集計して記録します。${MY_SCREEN_ENABLED&&!isPeriodPublished(x.period)?"\nまだ公開していないので、スタッフのマイシフトにも同時に公開します。":""}`))return;
    if(kind==="unconfirm"){const v=window.prompt(`${x.name}の確定を解除する理由を入力してください（履歴に残ります）`,"");if(v===null)return;if(!v.trim()){tt("理由を入力してください");return;}note=v.trim();}
    if(kind==="deliver"&&!confirm(`${x.name}の「${x.period.label||cur&&cur.label}」を本人へ交付したことを記録しますか？`))return;
    setActSid(x.sid);
    try{
      const d=await loadForConfirm(x.sid,x.period,kind==="confirm");
      const r=kind==="confirm"
        ?planPeriodConfirmation({period:d.cur,periods:d.periods,subs:d.subs,staffList:d.staffList,settings:d.settings,laborMonths:d.laborMonths,todayStr:fd(new Date()),uid:uidNow(),
          extraDayMin:d.helper.dayMin,excludeNames:d.helper.excludeNames})
        :kind==="unconfirm"?planPeriodUnconfirm({period:d.cur,laborMonths:d.laborMonths,uid:uidNow(),note})
        :planPeriodDelivery({period:d.cur,uid:uidNow()});
      if(r.error){tt("✕ "+r.error);return;}
      await writePlan(x.sid,d.cur,r);
      tt(kind==="confirm"?`✓ ${x.name}を確定しました`:kind==="unconfirm"?`✓ ${x.name}の確定を解除しました`:`✓ ${x.name}の交付を記録しました`);
      setReloadTick(t=>t+1);
    }catch(e){
      console.warn("確定・交付の書き込みに失敗:",e);
      tt(`✕ ${x.name}に書き込めませんでした（その店舗の管理者として登録されていない可能性があります。企業連携タブの「ログイン」で一度その店舗を開いてください）`);
    }finally{setActSid(null);}
  };
  const today=fd(new Date());
  const fmtAt=iso=>{const d=new Date(iso);return isNaN(d)?"":`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};
  // 日は人が選ぶ（2026-09-27 ユーザー指示「初期値は人間が決める」）。「＋ 追加」は未選択(null)の欄を足すだけで、
  // 未選択が残っている間は保存できない（黙って捨てて保存しない）。
  const monthlyUnchosen=monthly.some(d=>d===null);
  // 保存ボタンは「提出期限を保存」1つだけ（2026-09-27 ユーザー指示）。毎月の締切と期間ごとの日付のうち、
  // 変えたほうだけを1回の呼び出しで送る（変えていないほうを送ると、他の端末の保存を古い値で上書きする）。
  const saveDirty=dlDirty||monthlyDirty;
  const saveDeadlines=async()=>{
    if(!onSaveCompanyConfig||!saveDirty||monthlyUnchosen)return;
    const patch={};
    if(dlDirty&&rangeKey){
      // 期間の期限はまるごと置き換わる＝以前の店舗別の日付もここで消える
      const entry={};if(isValidDateStr(dlAll))entry.all=dlAll;
      patch.deadlines={[rangeKey]:Object.keys(entry).length?entry:null};
    }
    if(monthlyDirty)patch.monthlyDeadlineDays=sanitizeMonthlyDeadlineDays(monthly);
    if(!Object.keys(patch).length)return;
    setBusy(true);
    const r=await onSaveCompanyConfig(patch);
    setBusy(false);
    if(r&&r.error){tt("✕ "+r.error);return;}
    tt("✓ 提出期限を保存しました");
    setReloadTick(t=>t+1);
  };
  const saveBtn=(<button disabled={busy||!saveDirty||monthlyUnchosen} onClick={saveDeadlines} style={{...AB,width:"100%",marginTop:12,opacity:busy||!saveDirty||monthlyUnchosen?0.5:1}}>{busy?"保存中...":"提出期限を保存"}</button>);
  const fmtMDW=ds=>{const d=pd(ds);return isNaN(d)?ds:`${d.getMonth()+1}/${d.getDate()}(${WD[d.getDay()]})`;};
  const DAY_OPTS=Array.from({length:31},(_,i)=>i+1);
  const monthlyEditor=(<div data-co-monthly="1" style={{marginBottom:14,paddingBottom:12,borderBottom:"1px solid var(--c-border)"}}>
    <div style={{fontSize:12,fontWeight:700,color:"var(--c-text2)",marginBottom:6}}>毎月の提出締切</div>
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}>
      {monthly.length===0&&<span style={{fontSize:12,color:"var(--c-text4)"}}>未設定</span>}
      {monthly.map((d,i)=>(<span key={i} style={{display:"inline-flex",alignItems:"center",gap:4}}>
        <span style={{fontSize:12,color:"var(--c-text3)"}}>毎月</span>
        <select data-co-monthly-day={i} value={d===null?"":d} onChange={e=>{const v=e.target.value===""?null:Number(e.target.value);setMonthly(ms=>ms.map((x,j)=>j===i?v:x));setMonthlyDirty(true);}} style={{...AI,width:"auto",padding:"4px 6px",cursor:"pointer"}}>
          {d===null&&<option value="">日を選択</option>}
          {DAY_OPTS.map(n=><option key={n} value={n}>{monthlyDeadlineDayLabel(n)}</option>)}
        </select>
        <button onClick={()=>{setMonthly(ms=>ms.filter((_,j)=>j!==i));setMonthlyDirty(true);}} style={{...AGray,padding:"4px 8px",fontSize:12}}>削除</button>
      </span>))}
      {monthly.length<MONTHLY_DEADLINE_MAX&&<button data-co-monthly-add="1" onClick={()=>{setMonthly(ms=>[...ms,null]);setMonthlyDirty(true);}} style={{...AGray,padding:"4px 10px",fontSize:12}}>＋ 追加</button>}
    </div>
    <div style={{fontSize:11,color:"var(--c-text3)",lineHeight:1.6,marginBottom:monthlyUnchosen?6:0}}>各期間の開始日より前で、いちばん近い締切日がその期間の提出期限になります。下で期間ごとに日付を指定した場合はそちらが優先されます。29〜31日は短い月では月末になります。</div>
    {monthlyUnchosen&&<div style={{fontSize:11,color:"#FF4757"}}>日を選んでいない締切があります。選ぶか削除してから保存してください。</div>}
  </div>);
  const TD={borderBottom:"1px solid var(--c-border)",padding:"8px 6px",fontSize:13,verticalAlign:"middle"};
  const dateIn=(v,onCh)=>(<input type="date" value={v||""} onChange={e=>{onCh(e.target.value);setDlDirty(true);}} style={{...AI,width:"auto",padding:"4px 6px"}}/>);
  const cur=curRange;
  return(<AC title="シフトの提出状況">
    {monthlyEditor}
    {ranges.length===0?<><div style={{fontSize:12,color:"var(--c-text4)"}}>連携店舗に期間がありません。</div>{saveBtn}</>:(<>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <select value={rangeKey} onChange={e=>{userPickedRef.current=true;setRangeKey(e.target.value);}} style={{...AI,width:"auto",padding:"5px 8px",cursor:"pointer"}}>
          {ranges.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <EntityFilter ents={ents} value={entityFilter} onChange={v=>{userPickedRef.current=false;setEntityFilter(v);}}/>
        <button onClick={()=>setReloadTick(t=>t+1)} style={{...AGray,padding:"6px 12px",fontSize:12}}>更新</button>
      </div>
      <div data-co-summary="1" style={{fontSize:13,color:"var(--c-text)",marginBottom:10}}>提出済み {nSub} ／ 未提出 {nPend}<span data-co-confirm-summary="1" style={{marginLeft:10,color:"var(--c-text2)"}}>確定 {nConf} ／ 交付 {nDeliv}</span></div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:10}}>
        <span style={{fontSize:12,color:"var(--c-text3)"}}>この期間の提出期限（日付指定）</span>
        {dateIn(dlAll||monthlyInitial,setDlAll)}
        {monthlyInitial&&<span style={{fontSize:11,color:"var(--c-text3)"}}>毎月の提出締切から</span>}
        {dlAll&&<button onClick={()=>{setDlAll("");setDlDirty(true);}} style={{...AGray,padding:"4px 8px",fontSize:12}}>日付指定を外す</button>}
      </div>
      <div data-co-effective="1" style={{fontSize:12,color:"var(--c-text2)",marginBottom:10}}>
        {draftEff?`適用される期限: ${fmtMDW(draftEff.date)}（${draftEff.source==="date"?"日付指定":"毎月の提出締切"}）`:"適用される期限: 未設定"}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",minWidth:520}}>
          <thead><tr>{["店舗","期間","状況","確定","交付",""].map(h=><th key={h} style={{...TD,fontSize:11,color:"var(--c-text3)",textAlign:"left",fontWeight:700}}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((x,i)=>(<React.Fragment key={x.sid}>
            {showEntityHeads&&(i===0||rows[i-1].entityId!==x.entityId)&&<tr data-co-entity-head={x.entityId||""}><td colSpan={6} style={{...TD,fontSize:12,fontWeight:700,color:"var(--c-text2)",background:"var(--c-input2)"}}>{entName[x.entityId]||"法人未設定"}</td></tr>}
            <tr data-co-row={x.sid}>
              <td style={{...TD,fontWeight:600}}>{x.name}{x.isHq&&<span style={{marginLeft:6,fontSize:11,fontWeight:400,color:"var(--c-text3)"}}>本部</span>}</td>
              <td style={{...TD,color:"var(--c-text2)"}}>{x.status==="failed"?"—":x.status==="none"?"該当期間なし":(x.period.label||cur&&cur.label)}</td>
              <td data-co-status={x.status} style={{...TD,whiteSpace:"nowrap",color:x.status==="pending"&&x.deadline&&today>x.deadline?"#FF4757":"var(--c-text)"}}>
                {x.status==="submitted"?`提出済み ${fmtAt(x.submission.at)}`:x.status==="pending"?"未提出":x.status==="none"?"—":"読み込み失敗"}
              </td>
              <td data-co-confirm={x.period&&isPeriodConfirmed(x.period)?"1":"0"} style={{...TD,whiteSpace:"nowrap"}}>
                {!x.period?"—":isPeriodConfirmed(x.period)
                  ?<>{fmtAt(x.period.confirmation.at)}<button data-co-unconfirm-btn={x.sid} disabled={!!actSid} onClick={()=>periodAct(x,"unconfirm")} style={{...AGray,marginLeft:6,padding:"3px 8px",fontSize:11}}>解除</button></>
                  :<button data-co-confirm-btn={x.sid} disabled={!!actSid} onClick={()=>periodAct(x,"confirm")} style={{...AGray,padding:"4px 10px",fontSize:12,opacity:actSid?0.5:1}}>{actSid===x.sid?"処理中...":"確定"}</button>}
              </td>
              <td data-co-deliver={x.period&&isPeriodDelivered(x.period)?"1":"0"} style={{...TD,whiteSpace:"nowrap"}}>
                {!x.period||!isPeriodConfirmed(x.period)?"—":isPeriodDelivered(x.period)?fmtAt(x.period.delivery.at)
                  :<button data-co-deliver-btn={x.sid} disabled={!!actSid} onClick={()=>periodAct(x,"deliver")} style={{...AGray,padding:"4px 10px",fontSize:12,opacity:actSid?0.5:1}}>交付</button>}
              </td>
              <td style={{...TD,whiteSpace:"nowrap"}}>{x.period&&periodHistoryList(x.period).length>0&&<button data-co-hist-btn={x.sid} onClick={()=>setHistSid(h=>h===x.sid?null:x.sid)} style={{background:"none",border:"none",padding:0,fontSize:12,color:"var(--c-text3)",cursor:"pointer",textDecoration:"underline"}}>履歴</button>}</td>
            </tr>
            {histSid===x.sid&&x.period&&<tr data-co-hist={x.sid}><td colSpan={6} style={{...TD,fontSize:12,color:"var(--c-text2)",background:"var(--c-input2)"}}>
              {periodHistoryList(x.period).map(h=>(<div key={h.key}>{fmtAt(h.at)} {PERIOD_HISTORY_LABELS[h.kind]||h.kind}{h.note?`（${h.note}）`:""}{h.method?`（${h.method}）`:""}{h.byUid?` — ${String(h.byUid).startsWith(COMPANY_SESSION_UID_PREFIX)?"企業アカウント":"作成者／店舗"}`:""}</div>))}
            </td></tr>}
          </React.Fragment>))}</tbody>
        </table>
      </div>
      {saveBtn}
      {renderDownload&&renderDownload({rangeKey,range:cur,rows})}
    </>)}
  </AC>);
}

// ============================================================
// 連携店舗のシフト一括PDF（2026-09-27 企業連携の拡張）
// 対象は提出状況表で「提出済み」かつ対応する期間を持つ店舗だけ。店舗ごとに ShiftEditTab を画面外
// （display:none）へ1店舗ずつマウントし、既存の PDF 出力（exportPdf）に書き出しジョブを渡して
// 1つの jsPDF に追記する＝店舗単体の PDF と同じ経路・同じ計算で出る（計算を二重に持たない）。
// 非表示マウントでは書き込みを塞ぐ: savePeriods=null・ownerReadOnly=true（写し・労務合計を書かない）、
// onSave は何もしない、allLinkedShops=[]（他店舗の提出を読みに行かない）。
// 読めなかった店舗は飛ばして、最後のトーストで名前を出す（成功に丸めない）。
// ============================================================
function CompanyBulkPdf({range,rows,companyName,tt}){
  const targets=rows.filter(x=>x.status==="submitted"&&x.period);
  const[job,setJob]=useState(null);
  const[progress,setProgress]=useState("");
  const runRef=useRef(0);
  const pendingRef=useRef(null);
  // タブを離れたら進行中の一括出力を止める（待っている Promise を解放する）
  useEffect(()=>()=>{runRef.current++;if(pendingRef.current)pendingRef.current(new Error("cancelled"));},[]);
  const loadShop=async(sid,period)=>{
    const ref=p=>firebaseDB.ref(p).once("value");
    // 写しは丸ごと読む（settings に加え、ヘルプ先勤務の合算（P3.6）が使う連携店舗・人物・法人）
    const[stS,seS,coS,pS]=await Promise.all([ref(`shops/${sid}/staff`),ref(`shops/${sid}/settings`),ref(`shops/${sid}/company`),ref(`shops/${sid}/periods`)]);
    const periods=Object.values(pS.val()||{}).filter(x=>x&&x.id).sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));
    const staffList=Object.values(stS.val()||{}).filter(n=>typeof n==="string");
    const coLink=coS.val()||null;
    const settings=applyCompanySettings(seS.val()||makeSettings(sid),(coLink&&coLink.settings)||{});
    // 非表示マウントは pastSubsLoaded=true で渡すので、年度の全期間と前後の週にかかる期間の提出を読む
    // （以前は対象と直前の期間だけで、読んでいない期間が実働0・全日公休として年計・年平均所定に入っていた。
    // 店舗単体の「全データ」は書き出す前に過去の提出を読むので、一括PDFだけ年の値が小さく出ていた）
    const pids=laborReadPeriodIds(periods,settings,period.startDate,period.endDate);
    if(!pids.includes(period.id))pids.push(period.id);
    const q=pid=>firebaseDB.ref(`shops/${sid}/subs`).orderByChild("periodId").equalTo(pid).once("value");
    const subSnaps=await Promise.all(pids.map(q));
    const subs=[];subSnaps.forEach(sn=>Object.values(sn.val()||{}).forEach(x=>{if(x&&x.id)subs.push(x);}));
    // 人×月の所定（P3）。企業セッションは連携店舗のオーナーなので読めるが、読めなければ無しで出す（シフトから集計した値になる）
    const lmS=await firebaseDB.ref(`shops/${sid}/laborMonths`).once("value").catch(()=>null);
    return{staffList,settings,periods,subs,periodId:period.id,laborMonths:(lmS&&lmS.val())||{},companyLink:coLink};
  };
  const start=async(mode)=>{
    if(!targets.length||job)return;
    if(!firebaseDB){tt("✕ Firebase未初期化");return;}
    if(typeof window.html2canvas==="undefined"||typeof window.jspdf==="undefined"){tt("▲ PDFライブラリ未読込み");return;}
    const runId=++runRef.current;
    const{jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
    const skipped=[];let first=true;let done=0;
    for(let i=0;i<targets.length;i++){
      if(runRef.current!==runId)return;
      const t=targets[i];
      setProgress(`${i+1} / ${targets.length} 店舗を処理中…`);
      let data;
      try{data=await loadShop(t.sid,t.period);}catch{skipped.push(t.name);continue;}
      if(runRef.current!==runId)return;
      const key=`${runId}_${t.sid}`;
      const err=await new Promise(res=>{
        pendingRef.current=res;
        setJob({key,sid:t.sid,shopName:t.name,data,exportJob:{key,mode,pdf,first,onDone:res}});
      });
      pendingRef.current=null;
      setJob(null);
      if(runRef.current!==runId)return;
      if(err){skipped.push(t.name);continue;}
      first=false;done++;
    }
    setProgress("");
    const miss=skipped.length?`（${skipped.join("・")} は取得に失敗したため含まれていません）`:"";
    if(done===0){tt("✕ PDFを作れませんでした"+miss);return;}
    const san=v=>String(v||"").replace(/[\\/:*?"<>|]/g,"");
    const fname=`${san(companyName||"企業")}_${range.startDate}〜${range.endDate}_${mode==="shift"?"シフト":"全データ"}.pdf`;
    pdf.save(fname);
    ph("company_pdf_exported",{mode,shops:done});
    tt(`✓ ${fname} をダウンロードしました${miss}`);
  };
  const busy=!!job||!!progress;
  const B=(mode,label)=>(<button disabled={busy||targets.length===0} onClick={()=>start(mode)}
    style={{flex:1,padding:"10px 6px",background:mode==="shift"?"#C0392B":"var(--c-card)",border:mode==="shift"?"none":"1px solid var(--c-border2)",borderRadius:8,
      color:mode==="shift"?"white":"var(--c-text)",fontSize:13,fontWeight:700,cursor:busy||targets.length===0?"default":"pointer",opacity:busy||targets.length===0?0.5:1}}>
    {label}（{targets.length}店舗）</button>);
  return(<div style={{marginTop:16,paddingTop:14,borderTop:"1px solid var(--c-border)"}}>
    <AL>一括ダウンロード（提出済みの店舗のみ）</AL>
    <div style={{display:"flex",gap:8}}>{B("shift","シフトのみPDF")}{B("all","全データPDF")}</div>
    {progress&&<div data-co-progress="1" style={{fontSize:12,color:"var(--c-text3)",marginTop:8}}>{progress}</div>}
    {job&&<div style={{display:"none"}} aria-hidden="true">
      <ShiftEditTab key={job.key} subs={job.data.subs} periods={job.data.periods} staffList={job.data.staffList}
        onSave={()=>{}} tt={()=>{}} settings={job.data.settings} plan="premium" shopId={job.sid} shopName={job.shopName}
        onUpgrade={()=>{}} allLinkedShops={[]} savePeriods={null} ownerReadOnly={true} pastSubsLoaded={true}
        initialPeriodId={job.data.periodId} exportJob={job.exportJob} laborMonths={{...LABOR_MONTHS_OFF,loaded:true,map:job.data.laborMonths||{}}}
        companyLink={job.data.companyLink||null}/>
    </div>}
  </div>);
}

// ============================================================
// 企業横断ダッシュボード（2026-09-30・労務給与_複数法人_実装計画.md §6 P7・§1 の要件5・16）
// 本部（企業セッション）が法人→店舗→人の当月と年をひと目で見る: 月所定と所定上限・年平均所定と分母・36協定の残り
// （月・年・年720h・複数月平均80h・月45h超の回数）・確定と交付の進捗・年間休日（52日以上）。CSV で出せる。
// **時間はシフト作成タブの労務判定表と同じ計算**: 店舗ごとに ShiftEditTab を画面外へ1店舗ずつマウントし、書き出しジョブ
// （exportJob.kind="dashboard"）で人ごとの値を返させる（一括PDF・月次賃金と同じ形＝計算を二重に持たない）。
// 非表示マウントは書き込まない（savePeriods=null・ownerReadOnly・onSave は何もしない・laborMonths は読むだけ）。
// 提出は laborReadPeriodIds（年度の全期間と前後の週）を読む＝pastSubsLoaded=true でも年の値が欠けない。
// **賃金（金額）は出さない**（月次賃金ページの領分）。読めない店舗・途中の月は「＋」と淡色（労務判定表と同じ流儀）。
// ============================================================
const DASHBOARD_JOB_TIMEOUT_MS=60000;
async function loadShopForDashboard(sid,ym){
  const ref=p=>firebaseDB.ref(p).once("value").then(x=>x.val());
  const[staff,settingsRaw,coLink,periodsRaw]=await Promise.all([ref(`shops/${sid}/staff`),ref(`shops/${sid}/settings`),
    ref(`shops/${sid}/company`).catch(()=>null),ref(`shops/${sid}/periods`)]);
  const settings=applyCompanySettings(settingsRaw||makeSettings(sid),(coLink&&coLink.settings)||{});
  const periods=Object.values(periodsRaw||{}).filter(x=>x&&x.id&&isValidDateStr(x.startDate)&&isValidDateStr(x.endDate))
    .sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));
  const progress=monthPeriodProgressOf(periods,ym);
  const n=daysInMonthOf(ym);const first=`${ym}-01`,last=`${ym}-${String(n).padStart(2,"0")}`;
  const inMonth=periods.filter(p=>p.startDate<=last&&p.endDate>=first);
  if(!inMonth.length)return{none:true,progress};
  const target=inMonth.find(p=>p.startDate.slice(0,7)===ym)||inMonth[inMonth.length-1];
  const pids=laborReadPeriodIds(periods,settings,first,last);
  if(!pids.includes(target.id))pids.push(target.id);
  const q=pid=>firebaseDB.ref(`shops/${sid}/subs`).orderByChild("periodId").equalTo(pid).once("value");
  const subSnaps=await Promise.all(pids.map(q));
  const subs=[];subSnaps.forEach(sn=>Object.values(sn.val()||{}).forEach(x=>{if(x&&x.id)subs.push(x);}));
  // 所定・実績はオーナーしか読めない。読めなければ所定は未確定（シフトから集計）・実績は確定シフトで数え、店舗の行に注記を出す
  const lm=await ref(`shops/${sid}/laborMonths`).then(v=>({ok:true,v:v||{}}),()=>({ok:false,v:{}}));
  const acts=await Promise.all(pids.map(pid=>ref(`shops/${sid}/actuals/${pid}`).then(v=>[pid,v||{}],()=>null)));
  const actualsReadable=acts.every(Boolean);
  return{staffList:Object.values(staff||{}).filter(x=>typeof x==="string"),settings,periods,subs,companyLink:coLink||null,
    laborMonths:lm.v,laborMonthsReadable:lm.ok,actuals:actualsReadable?Object.fromEntries(acts):{},actualsReadable,
    periodId:target.id,progress};
}
function CompanyDashboardCard({companyId,companyName,shopNames={},tt,structureTick=0}){
  const[ym,setYm]=useState(()=>fd(new Date()).slice(0,7));
  const[entityFilter,setEntityFilter]=useState("");
  const[base,setBase]=useState(null); // {shopIds,names,structure} | {error}
  const[result,setResult]=useState(null); // {ym, shops:[{sid,name,entityId,isHq,status,progress,report,notes[]}]}
  const[job,setJob]=useState(null);
  const[progress,setProgress]=useState("");
  const[open,setOpen]=useState({});
  const runRef=useRef(0);
  const pendingRef=useRef(null);
  useEffect(()=>()=>{runRef.current++;if(pendingRef.current)pendingRef.current({error:"cancelled"});},[]);
  useEffect(()=>{
    if(!firebaseDB||!companyId){setBase({shopIds:[],names:{},structure:{}});return;}
    let cancelled=false;
    Promise.all([firebaseDB.ref(`companies/${companyId}/pub/shops`).once("value"),readCompanyStructure(companyId)]).then(async([shS,structure])=>{
      const shopIds=Object.keys(shS.val()||{});
      const names={};
      await Promise.all(shopIds.map(async sid=>{
        const nS=await firebaseDB.ref(`global/shops/${sid}/name`).once("value").catch(()=>null);
        names[sid]=(nS&&nS.val())||shopNames[sid]||sid;
      }));
      if(!cancelled)setBase({shopIds,names,structure:structure||{}});
    }).catch(()=>{if(!cancelled)setBase({error:true});});
    return()=>{cancelled=true;};
  },[companyId,structureTick]);
  const ents=useMemo(()=>base&&!base.error?companyEntityList(base.structure):[],[base]);
  useEffect(()=>{if(entityFilter&&!ents.some(e=>e.id===entityFilter))setEntityFilter("");},[ents,entityFilter]);
  const entIdx={};ents.forEach((e,i)=>{entIdx[e.id]=i;});
  const entName={};ents.forEach(e=>{entName[e.id]=e.name;});
  const targets=base&&!base.error?base.shopIds.map(sid=>({sid,name:base.names[sid],entityId:companyEntityIdOfShop(base.structure,sid),
    isHq:companyShopKindOf(base.structure,sid)==="hq"})).filter(x=>!entityFilter||x.entityId===entityFilter)
    .sort((a,b)=>{const ea=entIdx[a.entityId]??99,eb=entIdx[b.entityId]??99;if(ea!==eb)return ea-eb;return String(a.name).localeCompare(String(b.name),"ja");}):[];
  const busy=!!progress;
  const run=async()=>{
    if(busy||!targets.length||!/^\d{4}-\d{2}$/.test(ym))return;
    const runId=++runRef.current;
    const shops=[];
    setResult(null);setOpen({});
    for(let i=0;i<targets.length;i++){
      if(runRef.current!==runId)return;
      const t=targets[i];
      setProgress(`${i+1} / ${targets.length} 店舗を集計中…`);
      let data;
      try{data=await loadShopForDashboard(t.sid,ym);}catch{shops.push({...t,status:"failed",notes:["読み込みに失敗しました"]});continue;}
      if(runRef.current!==runId)return;
      if(data.none){shops.push({...t,status:"none",progress:data.progress,notes:["この月にかかる期間がありません"]});continue;}
      const key=`${runId}_${t.sid}`;
      const out=await new Promise(res=>{
        const timer=setTimeout(()=>res({error:"timeout"}),DASHBOARD_JOB_TIMEOUT_MS);
        const done=v=>{clearTimeout(timer);res(v);};
        pendingRef.current=done;
        setJob({key,sid:t.sid,shopName:t.name,data,exportJob:{key,kind:"dashboard",onDone:(err,rep)=>done(err?{error:err}:{rep})}});
      });
      pendingRef.current=null;
      setJob(null);
      if(runRef.current!==runId)return;
      if(out.error||!out.rep){shops.push({...t,status:"failed",progress:data.progress,notes:["集計に失敗しました"]});continue;}
      const notes=[];
      if(out.rep.ym!==ym)notes.push(`この月に始まる期間が無いため ${out.rep.ym} の期間で集計しています`);
      if(!data.laborMonthsReadable)notes.push("＋所定を読み込めませんでした（シフトから集計した値。この店舗の管理者として登録されていません）");
      if(!data.actualsReadable)notes.push("実績を読み込めないため確定シフトで数えています");
      shops.push({...t,status:"ok",progress:data.progress,report:out.rep,notes});
    }
    setProgress("");
    setResult({ym,shops});
    const failed=shops.filter(s=>s.status==="failed").map(s=>s.name);
    tt&&tt(failed.length?`△ ${shops.length-failed.length}店舗を集計しました（${failed.join("・")} は失敗）`:`✓ ${shops.length}店舗を集計しました`);
  };
  // 表示用の行（店舗ごとに人の値を並べ直す）
  const shopRows=(result?result.shops:[]).map(s=>{
    const views=s.report?s.report.rows.map(r=>dashboardPersonView(r,s.report)):[];
    return{...s,views,counts:dashboardCountsOf(views),progressLabel:s.progress?monthProgressLabel(s.progress):""};
  });
  const entityGroups=[];
  shopRows.forEach(s=>{
    const g=entityGroups[entityGroups.length-1];
    if(g&&g.entityId===s.entityId)g.shops.push(s);else entityGroups.push({entityId:s.entityId,shops:[s]});
  });
  const sumOf=list=>{
    const c={people:0,schedOver:0,avgOver:0,agOver:0,restShort:0},p={total:0,confirmed:0,delivered:0};
    list.forEach(s=>{Object.keys(c).forEach(k=>{c[k]+=s.counts[k];});if(s.progress){p.total+=s.progress.total;p.confirmed+=s.progress.confirmed;p.delivered+=s.progress.delivered;}});
    return{c,p};
  };
  const countsText=c=>`対象 ${c.people}人・所定超過 ${c.schedOver}・年平均超過 ${c.avgOver}・36協定 ${c.agOver}・休日不足 ${c.restShort}`;
  const downloadCsv=()=>{
    if(!result)return;
    const rows=[];
    shopRows.forEach(s=>{
      const common={entity:entName[s.entityId]||"",shop:s.name,progress:s.progressLabel};
      if(!s.views.length){rows.push({...common,shopNote:(s.notes||[]).join("／")||"対象の人がいません"});return;}
      s.views.forEach(v=>rows.push({...common,view:v}));
    });
    const text=dashboardCsvOf(rows);
    const blob=new Blob(["﻿"+text],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`${String(companyName||"企業").replace(/[\\/:*?"<>|]/g,"")}_${result.ym}_企業横断ダッシュボード.csv`;
    document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);
    ph("company_dashboard_csv_exported",{shops:shopRows.length});tt&&tt("✓ CSV をダウンロードしました");
  };
  const cols=DASHBOARD_COLUMNS.filter(c=>c.screen!==false);
  const groups=[];cols.forEach(c=>{const g=groups[groups.length-1];if(g&&g.name===(c.group||""))g.span++;else groups.push({name:c.group||"",span:1});});
  const TH={borderBottom:"1px solid var(--c-border2)",padding:"4px 6px",fontSize:11,color:"var(--c-text3)",fontWeight:700,whiteSpace:"nowrap",textAlign:"right"};
  const TD={borderBottom:"1px solid var(--c-border)",padding:"5px 6px",fontSize:12,whiteSpace:"nowrap",textAlign:"right",verticalAlign:"top"};
  // 法人・店舗の見出し行は表の横スクロールに付いていかず左に留まる（狭い画面でも件数と進捗が読める）
  const HEAD_BOX={position:"sticky",left:6,maxWidth:"min(820px, calc(100vw - 90px))"};
  // セルの状態（途中の値＝「＋」と淡色／超過・不足＝赤）。労務判定表と同じ流儀
  const metaOf=(key,v)=>{
    switch(key){
      case"schedMin":case"capMin":return{partial:v.schedPartial};
      case"schedDiffMin":return{partial:v.schedPartial,bad:v.schedOver};
      case"avgMin":case"denomMin":return{partial:Number(v.avgMissing)>0};
      case"avgDiffMin":return{partial:Number(v.avgMissing)>0,bad:v.avgOver};
      case"monthOtH":return{partial:v.monthPartial||v.helperUnread||v.unread};
      case"monthLeftH":return{partial:v.monthPartial||v.helperUnread||v.unread,bad:v.monthLeftH!=null&&v.monthLeftH<0&&!v.monthPartial};
      case"yearOtH":case"worstAvgH":return{partial:v.yearPartial};
      case"yearLeftH":return{partial:v.yearPartial,bad:v.yearLeftH!=null&&v.yearLeftH<0};
      case"year720LeftH":return{partial:v.yearPartial,bad:v.year720LeftH<0};
      case"avg80LeftH":return{partial:v.yearPartial,bad:v.avg80LeftH!=null&&v.avg80LeftH<0};
      case"n45":return{partial:v.yearPartial,bad:v.n45Left<0};
      case"restDays":case"restNeed":return{partial:Number(v.restMissing)>0||(v.rest&&v.rest.key==="pending"),bad:v.restShort};
      default:return{};
    }
  };
  const personRow=(s,v)=>{
    const val=dashboardRowValues({view:v});
    if(v.dest||v.skip)return(<tr key={s.sid+"|"+v.name} data-dash-person={v.name} data-dash-shop-of={s.sid}>
      <td style={{...TD,textAlign:"left",fontWeight:600,paddingLeft:22}}>{v.name}</td><td style={{...TD,textAlign:"left"}}>{val.sys}</td>
      <td colSpan={cols.length-2} style={{...TD,textAlign:"left",color:"var(--c-text3)"}}>{val.notes}</td></tr>);
    return(<tr key={s.sid+"|"+v.name} data-dash-person={v.name} data-dash-shop-of={s.sid}>{cols.map(c=>{
      if(c.key==="name")return<td key={c.key} style={{...TD,textAlign:"left",fontWeight:600,paddingLeft:22}}>{v.name}</td>;
      if(c.key==="notes")return<td key={c.key} style={{...TD,textAlign:"left",whiteSpace:"normal",minWidth:220,color:"var(--c-text3)",fontSize:11}}>{val.notes}</td>;
      if(c.kind==="text")return<td key={c.key} style={{...TD,textAlign:"left"}}>{dashboardCellText(c,val)}</td>;
      const t=dashboardCellText(c,val);
      const m=metaOf(c.key,v);
      return<td key={c.key} data-col={c.key} data-bad={m.bad?"1":undefined} data-partial={m.partial&&t?"1":undefined}
        style={{...TD,color:m.bad?"#e53935":m.partial?"var(--c-text3)":"var(--c-text)",fontWeight:m.bad?700:400}}>{m.partial&&t?"＋":""}{t}</td>;
    })}</tr>);
  };
  const title="企業横断ダッシュボード";
  if(!base)return(<AC title={title}><div style={{fontSize:12,color:"var(--c-text3)"}}>読み込み中...</div></AC>);
  if(base.error)return(<AC title={title}><div style={{fontSize:12,color:"#FF4757"}}>✕ 連携店舗を読み込めませんでした。再読み込みしてください。</div></AC>);
  const showEntityHeads=ents.length>=2;
  return(<AC title={title}>
    <div data-co-dashboard="1">
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10}}>
        <input type="month" value={ym} aria-label="集計する月" onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){setYm(e.target.value);setResult(null);}}}
          disabled={busy} style={{...AI,width:"auto",padding:"7px 10px"}}/>
        <EntityFilter ents={ents} value={entityFilter} onChange={v=>{setEntityFilter(v);setResult(null);}}/>
        <button data-co-dashboard-run="1" disabled={busy||!targets.length} onClick={run}
          style={{...AB,width:"auto",padding:"8px 14px",opacity:busy||!targets.length?0.5:1}}>{busy?"集計中...":"集計する"}</button>
        <button data-co-dashboard-csv="1" disabled={busy||!result} onClick={downloadCsv}
          style={{...AGray,padding:"7px 12px",fontSize:12,opacity:busy||!result?0.5:1}}>CSV を出力</button>
      </div>
      <div style={{fontSize:11,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>
        連携店舗ごとにシフト作成タブの労務判定表と同じ計算で集計します（{targets.length}店舗）。年の値は年度の始めからこの月までです。
        「＋」と薄い文字は途中の値（月の日がまだ埋まっていない・読み込めていない期間や他店がある）、赤は超過・不足です。
        年間休日は公休（空欄を含む）の日数で、52日以上を確認します。賃金はここには出しません（月次賃金ページ）。
      </div>
      {progress&&<div data-co-dashboard-progress="1" style={{fontSize:12,color:"var(--c-text3)",marginBottom:8}}>{progress}</div>}
      {result&&<div style={{overflowX:"auto",border:"1px solid var(--c-border)",borderRadius:8}}>
        <table data-co-dashboard-table="1" style={{borderCollapse:"collapse",width:"100%"}}>
          <thead>
            <tr>{groups.map((g,i)=><th key={i} colSpan={g.span} style={{...TH,textAlign:"center",borderBottom:g.name?"1px solid var(--c-border)":"none"}}>{g.name}</th>)}</tr>
            <tr>{cols.map(c=><th key={c.key} style={{...TH,textAlign:c.kind==="text"?"left":"right"}}>{c.label}</th>)}</tr>
          </thead>
          <tbody>{entityGroups.map(g=>{
            const es=sumOf(g.shops);
            return(<React.Fragment key={g.entityId||"none"}>
              {showEntityHeads&&<tr data-dash-entity={g.entityId||""}><td colSpan={cols.length} style={{...TD,textAlign:"left",fontSize:12,fontWeight:700,color:"var(--c-text2)",background:"var(--c-input2)",whiteSpace:"normal"}}>
                <div style={HEAD_BOX}>{entName[g.entityId]||"法人未設定"}<span style={{fontWeight:400,marginLeft:10}}>店舗 {g.shops.length}・{countsText(es.c)}・確定 {es.p.confirmed}/{es.p.total}・交付 {es.p.delivered}/{es.p.total}</span></div></td></tr>}
              {g.shops.map(s=>{
                const isOpen=!!open[s.sid];
                const bad=s.counts.schedOver+s.counts.avgOver+s.counts.agOver+s.counts.restShort>0;
                return(<React.Fragment key={s.sid}>
                  <tr data-dash-shop={s.sid} data-dash-status={s.status}>
                    <td colSpan={cols.length} style={{...TD,textAlign:"left",whiteSpace:"normal"}}><div style={HEAD_BOX}>
                      <button data-dash-toggle={s.sid} disabled={!s.views.length} onClick={()=>setOpen(o=>({...o,[s.sid]:!o[s.sid]}))}
                        style={{background:"none",border:"none",padding:0,cursor:s.views.length?"pointer":"default",fontSize:13,fontWeight:700,color:"var(--c-text)"}}>
                        {s.views.length?(isOpen?"▾ ":"▸ "):""}{s.name}</button>
                      {s.isHq&&<span style={{marginLeft:6,fontSize:11,color:"var(--c-text3)"}}>本部</span>}
                      {s.progressLabel&&<span data-dash-progress={s.sid} title={(s.progress&&s.progress.labels||[]).join("\n")} style={{marginLeft:10,fontSize:12,color:"var(--c-text2)"}}>{s.progressLabel}</span>}
                      {s.status==="ok"&&<span data-dash-counts={s.sid} style={{marginLeft:10,fontSize:12,color:bad?"#e53935":"var(--c-text2)"}}>{countsText(s.counts)}</span>}
                      {(s.notes||[]).length>0&&<div style={{fontSize:11,color:s.status==="failed"?"#e53935":"var(--c-text3)",marginTop:2}}>{s.notes.join("／")}</div>}
                    </div></td>
                  </tr>
                  {isOpen&&s.views.map(v=>personRow(s,v))}
                </React.Fragment>);
              })}
            </React.Fragment>);
          })}</tbody>
        </table>
      </div>}
      {result&&shopRows.some(s=>s.views.length)&&<button onClick={()=>{const all=shopRows.every(s=>!s.views.length||open[s.sid]);setOpen(all?{}:Object.fromEntries(shopRows.map(s=>[s.sid,true])));}}
        style={{...AGray,marginTop:8,padding:"5px 10px",fontSize:12}}>{shopRows.every(s=>!s.views.length||open[s.sid])?"すべて閉じる":"すべての人を表示"}</button>}
    </div>
    {job&&<div style={{display:"none"}} aria-hidden="true">
      <ShiftEditTab key={job.key} subs={job.data.subs} periods={job.data.periods} staffList={job.data.staffList}
        onSave={()=>{}} tt={()=>{}} settings={job.data.settings} plan="premium" shopId={job.sid} shopName={job.shopName}
        onUpgrade={()=>{}} allLinkedShops={[]} savePeriods={null} ownerReadOnly={true} pastSubsLoaded={true}
        initialPeriodId={job.data.periodId} exportJob={job.exportJob}
        laborMonths={{...LABOR_MONTHS_OFF,loaded:true,map:job.data.laborMonths||{}}}
        actuals={{...ACTUALS_OFF,enabled:!!job.data.actualsReadable,loaded:true,map:job.data.actuals||{}}}
        companyLink={job.data.companyLink||null}/>
    </div>}
  </AC>);
}

// ============================================================
// 企業アカウントでログイン（2026-09-27 ユーザー指示）
// 企業コード（ID）とパスワードだけでログインできる。メール/Google のアカウントが要るのは企業アカウントの
// 作成時だけで、作成後はこの2つを共有すれば誰でも企業の連携店舗を管理できる。
// ログイン画面（未連携の端末）と同じ companyLoginAndEnter（app-main.js）を呼ぶ。
// ============================================================
function CompanyLoginCard({onCompanyLogin,tt}){
  const[code,setCode]=useState("");
  const[pw,setPw]=useState("");
  const[show,setShow]=useState(false);
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState("");
  const submit=async()=>{
    if(busy||!onCompanyLogin)return;
    setErr("");
    if(!code.trim()||!pw){setErr("企業コードとパスワードを入力してください");return;}
    setBusy(true);
    const r=await onCompanyLogin(code.trim(),pw);
    setBusy(false);
    if(r&&r.error){setErr(r.error);return;}
    setCode("");setPw("");setShow(false);
    tt("✓ 企業アカウントでログインしました");
  };
  return(<AC title="企業アカウントでログイン">
    <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12,lineHeight:1.6}}>作成済みの企業アカウントには、企業コードとパスワードだけでログインできます（メールアドレスは不要）。</div>
    <AL>企業コード</AL>
    <input value={code} onChange={e=>setCode(e.target.value)} maxLength={16} placeholder="企業コード" autoComplete="username" style={{...AI,marginBottom:10,letterSpacing:"0.05em"}}/>
    <AL>パスワード</AL>
    <input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submit();}} maxLength={128} placeholder="パスワード" autoComplete="current-password" style={{...AI,marginBottom:8}}/>
    <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--c-text3)",marginBottom:10,cursor:"pointer",width:"fit-content"}}>
      <input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)} style={{width:18,height:18,cursor:"pointer"}}/>パスワードを表示
    </label>
    {err&&<div data-co-login-err="1" style={{color:"#FF4757",fontSize:12,marginBottom:8}}>{err}</div>}
    <button disabled={busy} onClick={submit} style={{...AB,width:"100%",opacity:busy?0.6:1}}>{busy?"ログイン中...":"企業アカウントでログイン"}</button>
  </AC>);
}

function CompanyTab({settings,onSave,tt,shopId,authUser,plan="free",onSaveCompanyConfig,onOpenCompanyStaff,onOpenPayroll,
                     shops=[],allLinkedShops=[],onSwitchToShop,onUnlinkShop,
                     companyInfo=null,onCreateCompany,onChangeCompanyPassword,onRenameCompany,onLinkStoreToCompany,onUnlinkStoreFromCompany,onCompanyLogin,onCompanyCall}){
  // 企業アカウントUI（SetTabから移動）
  const[coName,setCoName]=useState("");
  const[coPw,setCoPw]=useState("");
  const[coBusy,setCoBusy]=useState(false);
  const[coErr,setCoErr]=useState("");
  const[coCreated,setCoCreated]=useState(null); // 作成直後に表示する {code}
  const[coPwEdit,setCoPwEdit]=useState(false);
  // 賃金の閲覧パスコード（P6a）。企業のコードは CF setCompanyPayCode が連携全店舗へ同期する（作成者・企業セッションの両方が変更可）
  const[coPayCodeModal,setCoPayCodeModal]=useState(false);
  const[coNewPw,setCoNewPw]=useState("");
  // パスワードは2回入力して一致したときだけ採用し、「パスワードを表示」で伏せ字を外せる（2026-09-27 ユーザー指示）。
  // 変更は現在のパスワードを先に入れる（CF の changeCompanyPassword でも照合する）。
  const[coPw2,setCoPw2]=useState("");
  const[coCurPw,setCoCurPw]=useState("");
  const[coNewPw2,setCoNewPw2]=useState("");
  const[coShowPw,setCoShowPw]=useState(false);
  const pwType=coShowPw?"text":"password";
  const showPwBox=(<label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--c-text3)",marginBottom:10,cursor:"pointer",width:"fit-content"}}>
    <input type="checkbox" checked={coShowPw} onChange={e=>setCoShowPw(e.target.checked)} style={{width:18,height:18,cursor:"pointer"}}/>パスワードを表示
  </label>);
  const resetPwEdit=()=>{setCoPwEdit(false);setCoCurPw("");setCoNewPw("");setCoNewPw2("");setCoShowPw(false);};
  const[coAddCode,setCoAddCode]=useState("");
  const[coAddOpen,setCoAddOpen]=useState(false);
  // 店舗一覧トグル・略称（スタッフの勤務先店舗は 2026-09-27 に廃止。スタッフタブの「所属店舗」へ移した）
  const[expanded,setExpanded]=useState({});   // {shopId:true}
  const[shopMeta,setShopMeta]=useState({});   // {shopId:{abbrs:[],loaded:true}}
  const[abbrInput,setAbbrInput]=useState({}); // {shopId:"入力中の略称"}
  const[abbr2Input,setAbbr2Input]=useState({}); // {shopId:{top,bottom}} 2セル表示用の入力中の値（H1）
  const[allAbbrs,setAllAbbrs]=useState({});   // {shopId:[略称]} 重複チェック専用（未展開店舗ぶんも先読み）
  const listShops=allLinkedShops.length>0?allLinkedShops:shops;
  // 法人の割当・種別を変えたら提出状況（法人で絞る・見出し）を読み直す
  const[structureTick,setStructureTick]=useState(0);

  const loadShopMeta=(sid)=>{
    if(!firebaseDB)return;
    Promise.all([firebaseDB.ref(`shops/${sid}/settings/shopAbbrs`).once("value"),firebaseDB.ref(`shops/${sid}/settings/shopAbbr2`).once("value")]).then(([aS,a2S])=>{
      const abbrs=Object.values(aS.val()||{}).filter(v=>typeof v==="string");
      setShopMeta(m=>({...m,[sid]:{abbrs,abbr2:shopAbbr2Of({shopAbbr2:a2S.val()}),loaded:true}}));
    }).catch(()=>{
      setShopMeta(m=>({...m,[sid]:{abbrs:[],abbr2:null,loaded:true}}));
      tt("✕ 店舗データの読み込みに失敗しました");
    });
  };
  const toggleExpand=(sid)=>{
    setExpanded(e=>({...e,[sid]:!e[sid]}));
    if(!shopMeta[sid])loadShopMeta(sid);
  };
  // 表示中店舗はライブなsettingsを使い、他店舗は読み込んだメタを使う
  const metaFor=(sid)=>sid===shopId
    ?{abbrs:settings.shopAbbrs||[],abbr2:shopAbbr2Of(settings),loaded:true}
    :(shopMeta[sid]||null);
  // 略称の保存: 表示中店舗はsaveSettings経由（localStorage二重書き維持）、他店舗はFirebaseへupdateマージ
  const saveMetaField=(sid,field,value)=>{
    const stateKey=field==="shopAbbr2"?"abbr2":"abbrs";
    if(sid===shopId){onSave({...settings,[field]:value});setShopMeta(m=>m[sid]?{...m,[sid]:{...m[sid],[stateKey]:value}}:m);return;}
    setShopMeta(m=>({...m,[sid]:{...(m[sid]||{abbrs:[],abbr2:null,loaded:true}),[stateKey]:value}}));
    if(field==="shopAbbrs")setAllAbbrs(a=>({...a,[sid]:value}));
    if(!firebaseDB)return;
    fbUpd(`shops/${sid}/settings`,{[field]:value})
      .catch(()=>{tt("✕ 保存できませんでした（この店舗の管理者権限がありません）");loadShopMeta(sid);});
  };
  // 略称の重複チェックは全連携店舗を見る必要があるが、shopMeta はカードを展開した店舗しか読まない。
  // 未展開店舗ぶんを先読みしておかないと衝突を検出できず、同じ略称が2店舗に登録される。そうなると
  // シフト作成タブの abbrToShop（先勝ちマップ）がヘルプ先を別店舗に解決し、レジェンドの店舗名が入れ替わる。
  useEffect(()=>{
    if(!firebaseDB)return;
    let cancelled=false;
    Promise.all(listShops.filter(s=>s&&s.id).map(s=>
      firebaseDB.ref(`shops/${s.id}/settings/shopAbbrs`).once("value")
        .then(sn=>[s.id,Object.values(sn.val()||{}).filter(v=>typeof v==="string")])
        .catch(()=>[s.id,[]])
    )).then(entries=>{if(!cancelled)setAllAbbrs(Object.fromEntries(entries));});
    return()=>{cancelled=true;};
  },[listShops]);
  // 略称の参照元: 表示中・展開済み店舗はライブなmeta、未展開店舗は先読みした allAbbrs
  const abbrsOf=(sid)=>{const m=metaFor(sid);return m?(m.abbrs||[]):(allAbbrs[sid]||[]);};
  const addAbbr=(sid)=>{
    const v=(abbrInput[sid]||"").trim();
    if(!v)return;
    if(v.length>4){tt("✕ 略称は4文字以内にしてください");return;}
    // 予約語の判定は app-utils.js の isReservedShopAbbr に一本化する（CELL_COMMANDSレジストリ駆動）。
    // **ここに判定式を書き写さないこと**——以前この場所に完全一致の式を直書きしていたため、
    // extractNote が部分一致で取り除く「締」を **含む** 略称（例「西締」）が登録できていた
    // （バグチェック#133。登録はできるのにセルでは note="西" に化けて解決されない）。
    // 先頭文字は extractNote のパース境界（^([\d.:]+) が時刻部として貪欲に食う）と一致させる。
    // 「2号」のような先頭が数字の略称を許すと、セルに「9 2号」の意で「92号」と入力したとき
    // numeric="92"（parseTimeが弾いて時刻消失）・note="号" となり、abbrToShopの完全一致lookupが
    // 必ず外れる＝ヘルプ判定も店舗間重複判定も無言で効かなくなる。「92号」を 9+「2号」と
    // 92+「号」のどちらに解釈するかは原理的に決められないため、パーサ側では直せない。
    if(isReservedShopAbbr(v)){tt("✕ h・k・x・/・ko・yu・ke・「締」を含む・数字や記号（. :）で始まる略称は使用できません");return;}
    const cur=(metaFor(sid)||{}).abbrs||[];
    if(cur.includes(v)){tt("✕ 既に登録済みの略称です");return;}
    const conflict=listShops.find(s=>s&&s.id!==sid&&abbrsOf(s.id).includes(v));
    if(conflict){tt(`✕ 「${v}」は「${conflict.name}」で使用中です`);return;}
    saveMetaField(sid,"shopAbbrs",[...cur,v]);
    setAbbrInput(i=>({...i,[sid]:""}));
  };
  const removeAbbr=(sid,abbr)=>{
    const cur=(metaFor(sid)||{}).abbrs||[];
    saveMetaField(sid,"shopAbbrs",cur.filter(a=>a!==abbr));
  };
  // 2セル表示用（H1）。表示専用なので店舗間の重複チェックはしない（abbrToShop に入らない）。削除は null を書く
  const saveAbbr2=(sid)=>{
    const cur=(metaFor(sid)||{}).abbr2||null;
    const inp=abbr2Input[sid]||{};
    const top=(inp.top!==undefined?inp.top:(cur?cur.top:"")).trim();
    const bottom=(inp.bottom!==undefined?inp.bottom:(cur?cur.bottom:"")).trim();
    const err=shopAbbr2Error(top,bottom);
    if(err){tt("✕ "+err);return;}
    saveMetaField(sid,"shopAbbr2",{top,bottom});
    setAbbr2Input(i=>{const n={...i};delete n[sid];return n;});
    tt("✓ 2セル表示用の略称を保存しました");
  };
  const removeAbbr2=(sid)=>{
    saveMetaField(sid,"shopAbbr2",null);
    setAbbr2Input(i=>{const n={...i};delete n[sid];return n;});
  };

  const shopCard=(shop)=>{
    const isCurrent=shop.id===shopId;
    const open=!!expanded[shop.id];
    const meta=metaFor(shop.id);
    const canUnlink=listShops.length>1;
    return(
      <div key={shop.id} style={{background:"var(--c-input)",borderRadius:8,border:`1px solid ${isCurrent?"rgba(248,112,54,.4)":"var(--c-border2)"}`,marginBottom:8,overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",cursor:"pointer"}} onClick={()=>toggleExpand(shop.id)}>
          <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
            <span style={{fontSize:11,color:"var(--c-text3)",transform:open?"rotate(90deg)":"none",transition:"transform .15s",flexShrink:0}}>▶</span>
            {isCurrent&&<span style={{fontSize:10,background:"var(--c-accent)",color:"white",padding:"2px 6px",borderRadius:4,fontWeight:700,flexShrink:0}}>表示中</span>}
            <span style={{fontSize:13,color:"var(--c-text)",fontWeight:isCurrent?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shop.name}</span>
            {meta&&meta.abbrs.length>0&&<span style={{fontSize:11,color:"var(--c-text3)",flexShrink:0}}>（{meta.abbrs.join("・")}）</span>}
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}} onClick={e=>e.stopPropagation()}>
            {!isCurrent&&onSwitchToShop&&(
              <button onClick={()=>{onSwitchToShop(shop.id);tt(`✓ 「${shop.name}」に切り替えました`);}}
                style={{padding:"5px 10px",background:"rgba(248,112,54,.1)",border:"1px solid rgba(248,112,54,.3)",borderRadius:8,color:"var(--c-accent)",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                ログイン
              </button>
            )}
            {canUnlink&&<button onClick={async()=>{
              // companyInfo の有無で分岐しない。企業情報の復元は非同期なので押した時点で null でも
              // 企業側の登録は残っていることがあり、片方だけ消すとリロードで一覧へ戻る。
              // App 側の1つの実装（unlinkShopFromAuth）が accounts と companies の両方を消す。
              if(!window.confirm(`「${shop.name}」の連携を解除しますか？\nシフトデータは削除されません。戻すには店舗コード（設定タブ）が必要です。`))return;
              const unlink=onUnlinkStoreFromCompany||onUnlinkShop;
              if(!unlink)return;
              const r=await unlink(shop.id);
              tt(r&&r.error?("✕ "+r.error):`✓ 「${shop.name}」の連携を解除しました`);
            }}
              style={{padding:"5px 10px",background:"var(--c-bg)",border:"1px solid var(--c-border)",borderRadius:8,color:"var(--c-text3)",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              解除
            </button>}
          </div>
        </div>
        {open&&(
          <div style={{borderTop:"1px solid var(--c-border2)",padding:"12px"}}>
            {!meta?<div style={{fontSize:12,color:"var(--c-text3)"}}>読み込み中...</div>:(<>
              {/* 店舗略称 */}
              <AL>店舗略称（シフト作成タブでヘルプ入力に使用・複数登録可。先頭が1セル表示用）</AL>
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
              {/* 2セル表示用（H1）。ヘルプ先だけの日に出勤セル・退勤セルへ分けて出す。手入力のヘルプコマンドには使わない */}
              <AL>2セル表示用（ヘルプ先だけの日に出勤・退勤のセルへ分けて表示・各{SHOP_ABBR2_MAX_LEN}文字まで）</AL>
              <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:6,lineHeight:1.6}}>
                1セル表示用は上の略称の先頭（{meta.abbrs[0]||"未登録"}）です。2セル表示用が未登録なら、出勤セルに1セル表示用の略称、退勤セルは時刻だけを出します。
              </div>
              {(()=>{
                const cur=meta.abbr2||null;
                const inp=abbr2Input[shop.id]||{};
                const top=inp.top!==undefined?inp.top:(cur?cur.top:"");
                const bottom=inp.bottom!==undefined?inp.bottom:(cur?cur.bottom:"");
                const setPart=(k,v)=>setAbbr2Input(i=>({...i,[shop.id]:{...(i[shop.id]||{}),[k]:v}}));
                return(<div data-abbr2-card={shop.id} style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:"var(--c-text2)"}}>上</span>
                  <input data-abbr2="top" value={top} onChange={e=>setPart("top",e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveAbbr2(shop.id);}}
                    placeholder="例：鶏" maxLength={SHOP_ABBR2_MAX_LEN} style={{...AI,width:64,minWidth:0,textAlign:"center"}}/>
                  <span style={{fontSize:12,color:"var(--c-text2)"}}>下</span>
                  <input data-abbr2="bottom" value={bottom} onChange={e=>setPart("bottom",e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveAbbr2(shop.id);}}
                    placeholder="例：三" maxLength={SHOP_ABBR2_MAX_LEN} style={{...AI,width:64,minWidth:0,textAlign:"center"}}/>
                  <button onClick={()=>saveAbbr2(shop.id)} style={{...AB,padding:"8px 14px",fontSize:13,whiteSpace:"nowrap"}}>{cur?"変更":"登録"}</button>
                  {cur&&<button onClick={()=>removeAbbr2(shop.id)} style={{...AGray,padding:"8px 12px",fontSize:13,whiteSpace:"nowrap"}}>削除</button>}
                  <span data-abbr2-current={shop.id} style={{fontSize:12,color:"var(--c-text3)"}}>{cur?`登録中：上「${cur.top}」・下「${cur.bottom}」`:"未登録"}</span>
                </div>);
              })()}
            </>)}
          </div>
        )}
      </div>
    );
  };

  return(<div>
    <AT>企業連携</AT>
    {!companyInfo&&onCompanyLogin&&<CompanyLoginCard onCompanyLogin={onCompanyLogin} tt={tt}/>}
    {!authUser?(
      <AC title="企業アカウントを作成するには">
        <div style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.7}}>
          企業アカウントを<b>新しく作成する</b>ときだけ、「設定」タブの<b>アカウント連携</b>からGoogleまたはメールアドレスでアカウントを登録してください。作成済みの企業には、上の企業コードとパスワードでログインできます。
        </div>
      </AC>
    ):(<>
    {/* カードの並び（2026-09-28 ユーザー指示）: シフト提出状況 → 企業内登録スタッフ → 企業アカウント → 連携店舗 → 企業の共通設定 */}
    {companyInfo&&plan==="premium"&&<CompanySubmissionsCard structureTick={structureTick} companyId={companyInfo.companyId} shopNames={Object.fromEntries((allLinkedShops||[]).map(s=>[s.id,s.name]))} onSaveCompanyConfig={onSaveCompanyConfig} tt={tt}
      renderDownload={({range,rows})=>range?<CompanyBulkPdf key={range.key} range={range} rows={rows} companyName={companyInfo.name} tt={tt}/>:null}/>}
    {companyInfo&&plan==="premium"&&<CompanyStaffCard onOpen={onOpenCompanyStaff}/>}
    {companyInfo&&plan==="premium"&&<CompanyDashboardCard structureTick={structureTick} companyId={companyInfo.companyId} companyName={companyInfo.name}
      shopNames={Object.fromEntries((allLinkedShops||[]).map(s=>[s.id,s.name]))} tt={tt}/>}
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
          <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,padding:"10px 14px",marginBottom:12}}>
            <span style={{flex:1,fontFamily:"monospace",fontSize:15,color:"var(--c-accent)",letterSpacing:"0.1em",fontWeight:700}}>{companyInfo.code}</span>
            <button onClick={()=>{
              const v=companyInfo.code;const copy=()=>{const el=document.createElement("textarea");el.value=v;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);tt("✓ 企業コードをコピーしました");};
              if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(v).then(()=>tt("✓ 企業コードをコピーしました")).catch(copy);}else copy();
            }} style={{padding:"6px 12px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>コピー</button>
          </div>
          {/* パスワード変更 */}
          {coPwEdit?(
            <div style={{marginBottom:4}}>
              <AL>現在のパスワード</AL>
              <input type={pwType} value={coCurPw} onChange={e=>setCoCurPw(e.target.value)} maxLength={128} placeholder="現在のパスワード" autoComplete="current-password" style={{...AI,marginBottom:10}}/>
              <AL>新しいパスワード（6文字以上）</AL>
              <input type={pwType} value={coNewPw} onChange={e=>setCoNewPw(e.target.value)} maxLength={128} placeholder="新しいパスワード" autoComplete="new-password" style={{...AI,marginBottom:8}}/>
              <input type={pwType} value={coNewPw2} onChange={e=>setCoNewPw2(e.target.value)} maxLength={128} placeholder="新しいパスワード（確認）" autoComplete="new-password" style={{...AI,marginBottom:8}}/>
              {showPwBox}
              <div style={{display:"flex",gap:8}}>
                <button disabled={coBusy} onClick={async()=>{
                  if(!coCurPw){tt("✕ 現在のパスワードを入力してください");return;}
                  if(coNewPw.length<6){tt("✕ 新しいパスワードは6文字以上にしてください");return;}
                  if(coNewPw!==coNewPw2){tt("✕ 新しいパスワードが一致しません");return;}
                  if(coNewPw===coCurPw){tt("✕ 現在と同じパスワードです");return;}
                  setCoBusy(true); const r=await onChangeCompanyPassword(coCurPw,coNewPw); setCoBusy(false);
                  if(r&&r.error)tt("✕ "+r.error); else {tt("✓ パスワードを変更しました");resetPwEdit();}
                }} style={{...AB,flex:1,whiteSpace:"nowrap"}}>{coBusy?"変更中...":"変更"}</button>
                <button onClick={resetPwEdit} style={{...AGray,whiteSpace:"nowrap"}}>取消</button>
              </div>
            </div>
          ):isCompanySessionUid(authUser&&authUser.uid)?(
            <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.6}}>パスワードは、企業の作成者のアカウント（メール／Google）でログインしたときだけ変更できます。</div>
          ):(
            <button onClick={()=>setCoPwEdit(true)} style={{...AGray,width:"100%"}}>パスワードを変更する</button>
          )}
          {featureEnabled("pay",{plan})&&<>
            <div style={{marginTop:16}}><AL>賃金の閲覧パスコード（4桁）</AL></div>
            <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:8,lineHeight:1.6}}>連携しているすべての店舗で、この番号を入れるまで賃金が伏せられます。未設定の間は 0000 です。</div>
            <button data-co-pay-code="1" onClick={()=>setCoPayCodeModal(true)} style={{...AGray,width:"100%"}}>賃金の閲覧パスコードを変更する</button>
            {coPayCodeModal&&<PayCodeChangeModal tt={tt} onClose={()=>setCoPayCodeModal(false)} onSubmit={companyPayCodeSubmit(onCompanyCall)}/>}
          </>}
        </div>
      ):(
        authUser.isAnonymous?(
          <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.6}}>企業アカウントの作成にはメールまたはGoogleでのログインが必要です。「設定」タブのアカウント連携から登録してください。作成済みの企業には、上の企業コードとパスワードでログインできます。</div>
        ):(
          <div>
            <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12,lineHeight:1.6}}>
              企業アカウントを作成すると、現在の店舗をまとめて管理でき、企業コード＋パスワードで他のスタッフもログインできます。
            </div>
            <AL>企業名</AL>
            <input value={coName} onChange={e=>setCoName(e.target.value)} maxLength={100} placeholder="例）〇〇フーズ" style={{...AI,marginBottom:10}}/>
            <AL>ログイン用パスワード（6文字以上）</AL>
            <input type={pwType} value={coPw} onChange={e=>setCoPw(e.target.value)} maxLength={128} placeholder="パスワード（6文字以上）" autoComplete="new-password" style={{...AI,marginBottom:8}}/>
            <input type={pwType} value={coPw2} onChange={e=>setCoPw2(e.target.value)} maxLength={128} placeholder="パスワード（確認）" autoComplete="new-password" style={{...AI,marginBottom:8}}/>
            {showPwBox}
            {coErr&&<div style={{color:"#FF4757",fontSize:12,marginBottom:8}}>{coErr}</div>}
            {coCreated?(
              <div style={{background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.3)",borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:12,color:"var(--c-text2)",marginBottom:6}}>企業アカウントを作成しました。企業コード：</div>
                <div style={{fontFamily:"monospace",fontSize:16,color:"#10B981",fontWeight:700,letterSpacing:"0.1em"}}>{coCreated.code}</div>
              </div>
            ):(
              <button disabled={coBusy} onClick={async()=>{
                setCoErr("");
                if(!coName.trim()){setCoErr("企業名を入力してください");return;}
                if(coPw.length<6){setCoErr("パスワードは6文字以上にしてください");return;}
                if(coPw!==coPw2){setCoErr("パスワードが一致しません");return;}
                setCoBusy(true); const r=await onCreateCompany(coName.trim(),coPw); setCoBusy(false);
                if(r&&r.error)setCoErr(r.error); else {setCoCreated({code:r.code});setCoName("");setCoPw("");setCoPw2("");setCoShowPw(false);
                  tt(r&&r.skipped>0?`✓ 作成しました（管理者未登録の${r.skipped}店舗は連携していません。その店舗の管理コードで追加してください）`:"✓ 企業アカウントを作成しました");}
              }} style={{...AB,width:"100%"}}>{coBusy?"作成中...":"企業アカウントを作成する"}</button>
            )}
          </div>
        )
      )}
    </AC>
    {listShops.length>0&&<AC title="連携店舗">
      <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12,lineHeight:1.6}}>
        {companyInfo?"この企業アカウントに紐付いている店舗の一覧です。管理コードで追加・不要な店舗は連携解除できます（追加する店舗の設定タブに表示されている「管理コード」が必要です）。":"このアカウントに紐付いている全店舗の一覧です。不要な店舗は連携を解除できます。"}
        店舗名をタップすると略称を設定できます。
      </div>
      {companyInfo&&(
        coAddOpen?(
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <input value={coAddCode} onChange={e=>setCoAddCode(e.target.value)} maxLength={100} placeholder="管理コードを貼り付け" style={{...AI,flex:1}}/>
            <button disabled={coBusy} onClick={async()=>{
              if(!coAddCode.trim()||!onLinkStoreToCompany)return;
              setCoBusy(true); const r=await onLinkStoreToCompany(coAddCode.trim()); setCoBusy(false);
              if(r&&r.error)tt("✕ "+r.error); else {tt(`✓ 「${r.name||"店舗"}」を追加しました`);setCoAddCode("");setCoAddOpen(false);}
            }} style={{...AB,whiteSpace:"nowrap"}}>追加</button>
            <button onClick={()=>{setCoAddOpen(false);setCoAddCode("");}} style={{...AGray,whiteSpace:"nowrap"}}>取消</button>
          </div>
        ):(
          <button onClick={()=>setCoAddOpen(true)} style={{width:"100%",padding:"10px",background:"rgba(248,112,54,.12)",border:"1px solid rgba(248,112,54,.3)",borderRadius:8,color:"var(--c-accent)",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>＋ 管理コードで追加</button>
        )
      )}
      <div>{listShops.map(shopCard)}</div>
    </AC>}
    {companyInfo&&plan==="premium"&&<CompanyEntityCard companyId={companyInfo.companyId} shopNames={Object.fromEntries((allLinkedShops||[]).map(s=>[s.id,s.name]))} onCompanyCall={onCompanyCall} onSaveCompanyConfig={onSaveCompanyConfig} tt={tt} onChanged={()=>setStructureTick(t=>t+1)} onOpenPayroll={onOpenPayroll}/>}
    {companyInfo&&plan==="premium"&&<CompanyConfigCard companyId={companyInfo.companyId} onSaveCompanyConfig={onSaveCompanyConfig} tt={tt}/>}
    <AC title="シフト作成タブでのヘルプ入力">
      <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.8}}>
        店舗略称を登録すると、シフト作成タブのセルで「時間＋略称」（例: <b>9三</b>）と入力することで他店舗ヘルプとして扱われます。<br/>
        ・<b>出勤セルのみ</b>に略称 → その店舗のランチ帯（〜17時）のみヘルプ<br/>
        ・<b>退勤セルのみ</b>に略称 → その店舗のディナー帯（17時〜）のみヘルプ<br/>
        ・<b>両方のセル</b>に略称 → 出勤から退勤まで終日ヘルプ<br/>
        ヘルプ帯は自店舗の時間帯別出勤人数から除外されます。<br/>スタッフタブの編集で所属店舗を他店舗にすると、その人はこの店舗のシフトでヘルプとして扱われ、所属店舗と時間が重複するとシフト作成タブにエラーが表示されます。
      </div>
    </AC>
    </>)}
  </div>);
}

function SetTab({settings,onSave,subs,saveSubs,tt,syncStatus,plan="free",shopId,
                 authUser,onLinkProvider,onSendEmailOtp,onVerifyAndLinkEmail,onUnlinkProvider,
                 onSignInAndLinkGoogle,onSignInAndLinkEmail,adminCode=null,ownerReadOnly=false,companyLink=null}){
  const[themePref,setThemePref]=useState(()=>lg(THEME_KEY,"light"));
  // 企業が決めている項目（2026-09-27 企業連携の拡張）。入力欄を出さず値と「企業設定」を出す。
  // settings は App で企業設定を重ねた値。保存は App の saveSettings が剥がすが、この2枚のカードは
  // 自分でも剥がしてから渡す（ハーネスなど App を通らない経路でも企業の値を店舗へ書かない二重防御）。
  const coSettings=companyLink?(companyLink.settings||{}):null;
  const coKeys=companyControlledKeys(coSettings);
  const coLabor=k=>coKeys.labor.has(k);
  // 企業が作った属性（co_）は全項目が企業のもの＝店舗では1つも変えられない（空欄の項目も入力欄を出さず「—」）。
  // 入力欄を出すと、編集しても保存時に剥がされて黙って元に戻る（2026-09-27 ユーザー報告）。
  const coLim=(type,k)=>isCompanyAttrId(type)||!!(coKeys.limits[type]&&coKeys.limits[type].has(k));
  const onSaveOwn=v=>onSave(coSettings?stripCompanySettings(v,coSettings):v);
  const coTag=<span style={{fontSize:10,color:"var(--c-text3)",whiteSpace:"nowrap"}}>企業設定</span>;
  const coVal=(text,minW=52)=>(<span data-company-fixed="1" style={{display:"inline-flex",alignItems:"baseline",gap:4}}><span style={{fontSize:13,color:"var(--c-text)",minWidth:minW,textAlign:"center"}}>{text}</span>{coTag}</span>);
  const coNote=companyLink&&<div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10}}>「企業設定」の項目は企業アカウント（{companyLink.name||"企業"}{companyLink.entityName&&companyLink.entityName!==companyLink.name?`・${companyLink.entityName}`:""}）が決めているため、この店舗では変更できません。変更は企業連携タブから行います。</div>;
  const[emailLinkStep,setEmailLinkStep]=useState(0); // 0=非表示 1=メール入力 2=コード入力
  const[emailInput,setEmailInput]=useState("");
  const[codeInput,setCodeInput]=useState("");
  const[pendingNewType,setPendingNewType]=useState(null); // null | {name:""}
  const[newPosInput,setNewPosInput]=useState({kitchen:"",hall:""}); // ポジション名追加の入力欄
  const[reqDayType,setReqDayType]=useState("weekday"); // 必要ポジション設定: 表示中の曜日区分
  const[reqMeal,setReqMeal]=useState("lunch"); // 必要ポジション設定: 表示中のランチ/ディナー
  const[linkLoading,setLinkLoading]=useState(false);
  const[linkError,setLinkError]=useState("");
  // Cookie認証ユーザー向けアカウント登録/連携
  const[acctEmailMode,setAcctEmailMode]=useState(null); // null | "login" | "register"
  // 新規登録はメール確認つき（app-my.js の EmailLinkSendBox・2026-10-04）。続きの登録を同じブラウザで終えると、この店舗をアカウントに紐付ける。
  // メールリンクが使えない（Firebase の設定前）ときだけ従来の欄に切り替える
  const[acctRegClassic,setAcctRegClassic]=useState(false);
  const[acctEmail,setAcctEmail]=useState("");
  const[acctPw,setAcctPw]=useState("");
  const[acctPw2,setAcctPw2]=useState("");
  const[acctLoading,setAcctLoading]=useState(false);
  const[acctError,setAcctError]=useState("");
  const changeTheme=pref=>{
    ls(THEME_KEY,pref);
    setThemePref(pref);
    applyTheme(pref);
    tt(pref==="light"?"ライトモード":(pref==="dark"?"ダークモード":"↺ システム設定に合わせる"));
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
          ?<span style={{fontSize:11,fontWeight:600,color:"#10B981",background:"rgba(34,197,94,.12)",padding:"3px 10px",borderRadius:12,whiteSpace:"nowrap",flexShrink:0}}>連携済み</span>
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
    {shopId&&<AC title="店舗管理コード">
      {ownerReadOnly?(
        <div style={{fontSize:12,color:"#B45309",lineHeight:1.6}}>この端末は管理者登録されていないため、正しい管理コードを表示できません。既に管理者登録済みの端末（設定変更ができる端末）でこのコードを確認してください。</div>
      ):(<>
      <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10,lineHeight:1.6}}>このコードを別の端末で入力すると、同じ店舗を管理者として操作できるようになります。<b>スタッフには共有しないでください。</b></div>
      <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,padding:"10px 14px"}}>
        <span style={{flex:1,fontFamily:"monospace",fontSize:13,color:"var(--c-text)",letterSpacing:"0.05em",wordBreak:"break-all"}}>{adminCode||shopId}</span>
        <button onClick={()=>{
          const codeVal=adminCode||shopId;
          const copy=()=>{const el=document.createElement("textarea");el.value=codeVal;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);tt("✓ 管理コードをコピーしました");};
          if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(codeVal).then(()=>tt("✓ 管理コードをコピーしました")).catch(copy);}else{copy();}
        }} style={{padding:"6px 12px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>コピー</button>
      </div>
      <div style={{fontSize:11,color:"var(--c-text4)",marginTop:6}}>別端末への共有は「店舗名ボタン → コードで追加」から行えます</div>
      </>)}
    </AC>}

    {plan==="premium"&&(()=>{
      const tls=settings.staffTypeLimits||{};
      const saveAllLimits=(newTls)=>onSaveOwn({...settings,staffTypeLimits:newTls});
      const saveLim=(type,key,val)=>saveAllLimits({...tls,[type]:{...tls[type],[key]:val}});
      const confirmAddType=()=>{if(!pendingNewType)return;const nm=pendingNewType.name.trim();if(!nm){setPendingNewType(null);return;}const id="custom_"+genSecureId(8);saveAllLimits({...tls,[id]:{name:nm,daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0}});setPendingNewType(null);};
      const deleteType=(id)=>{const n={...tls};delete n[id];const attrs={...(settings.staffAttributes||{})};Object.keys(attrs).forEach(k=>{if(attrs[k]===id)delete attrs[k];});onSave({...settings,staffTypeLimits:n,staffAttributes:attrs});};
      const renameType=(id,name)=>saveAllLimits({...tls,[id]:{...tls[id],name}});
      // builtinで未登録のものはデフォルト値で補完（社員・パート・アルバイトのみ）
      const tlsMerged={...tls};ATTR_PINNED_ORDER.forEach(k=>{if(!tlsMerged[k])tlsMerged[k]={name:STAFF_TYPE_LABELS[k],daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0};});
      // 表示名(displayNameと同ルール)。組み込みは STAFF_TYPE_LABELS が正本＝保存された旧既定名（"バイト"）を読まない
      const typeName=(id,raw)=>(BUILTIN_TYPES.includes(id)?STAFF_TYPE_LABELS[id]:"")||(raw&&typeof raw==="object"?raw.name:raw)||id;
      // 並びは sortAttrEntries が正本（スタッフタブの属性プルダウンと同じ順）。ここで getAttrOptions を
      // 使わないのは、名前が空のカスタム属性まで落ちて**入力欄ごと消える**ため（付け直せなくなる）。
      const typeEntries=sortAttrEntries(Object.entries(tlsMerged).map(([id,raw])=>[id,typeName(id,raw)])).map(([id])=>[id,tlsMerged[id]]);
      return(<AC title="スタッフ属性別 勤務時間制限">
        {coNote}
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>0は未設定。上限を超えたスタッフは提出一覧と集計表で赤くハイライトされます。目安は判定に使いません（集計表に行として出るだけです）。1ヶ月の上限・目安は31日の月の値として入れ、労務設定と同じ式で月の日数に日割りしたうえで「残業」を足した値になります。</div>
        <div data-skilled-note="1" style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>属性名に「{SKILLED_WORKER_ATTR_KEYWORD}」を含む属性のスタッフは、週1回の公休（月をまたぐ週は月末側と月初側に各1回）があるかを判定します。</div>
        {typeEntries.map(([type,limRaw])=>{
          const lim={daily:0,weekly:0,biweekly:0,monthly:0,customDays:0,customHours:0,...(typeof limRaw==="object"?limRaw:{name:limRaw})};
          const isBuiltin=BUILTIN_TYPES.includes(type);
          // 企業が作った属性は名前も削除も企業の領分（店舗では名前を固定表示し削除ボタンを出さない）
          const isCo=isCompanyAttrId(type);
          const displayName=typeName(type,lim);
          return(<div key={type} style={{marginBottom:8,padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              {isBuiltin||isCo
                ?<div style={{fontSize:13,fontWeight:700,color:"var(--c-text)",flex:1}}>{displayName}{isCo&&<span style={{marginLeft:6,fontWeight:400}}>{coTag}</span>}</div>
                :<input value={lim.name||""} placeholder="属性名を入力" onChange={e=>renameType(type,e.target.value)}
                    style={{...AI,flex:1,fontSize:16,fontWeight:700,padding:"4px 8px"}}/>
              }
              {!isBuiltin&&!isCo&&<button onClick={()=>deleteType(type)} style={{padding:"4px 10px",background:"rgba(229,57,53,.1)",border:"1px solid rgba(229,57,53,.3)",borderRadius:4,color:"#e53935",fontSize:12,cursor:"pointer"}}>削除</button>}
            </div>
            {/* 労働時間制（項目1）。組み込み属性は既定（社員=変形・パート・アルバイト=通常・応援・外部/その他=保存値 none＝判定は通常と同じ）が
                入った状態で表示されるので、既存店舗が「区分が空欄」にならない。選択肢は A・B だけで（2026-10-03）、
                保存値・既定が none の属性は B が選ばれた状態で出る（laborSystemChoiceOf）。 */}
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"var(--c-text3)",whiteSpace:"nowrap"}}>労働時間制</span>
              {coLim(type,"laborSystem")
                ?coVal(LABOR_SYSTEM_LABELS[laborSystemChoiceOf(lim.laborSystem)]||lim.laborSystem||"—",0)
                :<select value={laborSystemChoiceOf(lim.laborSystem)||laborSystemChoiceOf(DEFAULT_LABOR_SYSTEM_BY_ATTR[type])}
                onChange={e=>saveLim(type,"laborSystem",e.target.value)}
                style={{...AI,width:"auto",flex:"1 1 220px",minWidth:180,padding:"5px 8px",cursor:"pointer"}}>
                {!laborSystemChoiceOf(lim.laborSystem)&&!DEFAULT_LABOR_SYSTEM_BY_ATTR[type]&&<option value="">未設定</option>}
                {LABOR_SYSTEM_CHOICES.map(v=><option key={v} value={v}>{LABOR_SYSTEM_LABELS[v]}</option>)}
              </select>}
            </div>
            <OtProrateField value={lim.otProrate} blankLabel={OT_PRORATE_WINDOW_LABELS.month+"（既定）"}
              fixedText={coLim(type,"otProrate")?coVal(fmtOtProrate(lim.otProrate),0):undefined}
              onChange={v=>saveLim(type,"otProrate",v)}/>
            {/* 上限と目安を同じ窓で対にして入力する（窓の一覧は app-utils.js の STAFF_LIMIT_WINDOWS）。
                どちらも0＝未設定。目安は判定しない（2026-09-28）。1ヶ月の窓だけ「残業」欄を上限の行に持つ。 */}
            {[["上限",false],["目安",true]].map(([rowLbl,isMin])=>(
              <div key={rowLbl} style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:isMin?0:6}}>
                <span style={{fontSize:11,fontWeight:700,color:isMin?"#2563EB":"#FF4757",minWidth:26,whiteSpace:"nowrap"}}>{rowLbl}</span>
                {STAFF_LIMIT_WINDOWS.map(w=>{const k=isMin?w.minKey:w.key;return(<React.Fragment key={k}>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:11,color:"var(--c-text3)",whiteSpace:"nowrap"}}>{w.label}</span>
                    {coLim(type,k)?coVal(lim[k]||"—"):<input type="number" min={0} max={w.max} value={lim[k]||""} placeholder="0"
                      onChange={e=>{const v=Math.max(0,Math.min(w.max,parseInt(e.target.value)||0));saveLim(type,k,v);}}
                      style={{...AI,width:52,textAlign:"center",padding:"5px 6px"}}/>}
                    <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span>
                  </div>
                  {!isMin&&w.otKey&&<div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:11,color:"var(--c-text3)",whiteSpace:"nowrap"}}>＋残業</span>
                    {coLim(type,w.otKey)?coVal(lim[w.otKey]||"—"):<input type="number" min={0} max={w.otMax} value={lim[w.otKey]||""} placeholder="0"
                      onChange={e=>{const v=Math.max(0,Math.min(w.otMax,parseInt(e.target.value)||0));saveLim(type,w.otKey,v);}}
                      style={{...AI,width:52,textAlign:"center",padding:"5px 6px"}}/>}
                    <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span>
                  </div>}
                </React.Fragment>);})}
                <div style={{display:"flex",alignItems:"center",gap:4,paddingLeft:4,borderLeft:"1px solid var(--c-border)"}}>
                  <span style={{fontSize:11,color:"var(--c-text3)",whiteSpace:"nowrap"}}>任意</span>
                  {isMin
                    ?<span style={{fontSize:11,color:"var(--c-text4)",minWidth:52,textAlign:"center"}}>{lim.customDays||"—"}日で</span>
                    :coLim(type,"customDays")?coVal(lim.customDays||"—"):<input type="number" min={0} max={365} value={lim.customDays||""} placeholder="日数"
                      onChange={e=>{const v=Math.max(0,Math.min(365,parseInt(e.target.value)||0));saveLim(type,"customDays",v);}}
                      style={{...AI,width:52,textAlign:"center",padding:"5px 6px"}}/>}
                  {!isMin&&<span style={{fontSize:11,color:"var(--c-text4)"}}>日で</span>}
                  {coLim(type,isMin?"customHoursMin":"customHours")?coVal((isMin?lim.customHoursMin:lim.customHours)||"—"):<input type="number" min={0} max={744} value={(isMin?lim.customHoursMin:lim.customHours)||""} placeholder="時間"
                    onChange={e=>{const v=Math.max(0,Math.min(744,parseInt(e.target.value)||0));saveLim(type,isMin?"customHoursMin":"customHours",v);}}
                    style={{...AI,width:52,textAlign:"center",padding:"5px 6px"}}/>}
                  <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span>
                </div>
              </div>
            ))}
          </div>);
        })}
        {pendingNewType&&<div style={{marginBottom:8,padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-accent)",borderRadius:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <input autoFocus value={pendingNewType.name} placeholder="属性名を入力"
              onChange={e=>setPendingNewType({name:e.target.value})}
              onKeyDown={e=>{if(e.key==="Enter")confirmAddType();if(e.key==="Escape")setPendingNewType(null);}}
              style={{...AI,flex:1,fontSize:16,fontWeight:700,padding:"4px 8px"}}/>
            <button onClick={confirmAddType} style={{padding:"4px 10px",background:"rgba(248,112,54,.15)",border:"1px solid var(--c-accent)",borderRadius:4,color:"var(--c-accent)",fontSize:12,cursor:"pointer"}}>追加</button>
            <button onClick={()=>setPendingNewType(null)} style={{padding:"4px 10px",background:"transparent",border:"1px solid var(--c-border)",borderRadius:4,color:"var(--c-text3)",fontSize:12,cursor:"pointer"}}>ｷｬﾝｾﾙ</button>
          </div>
          <div style={{fontSize:11,color:"var(--c-text4)"}}>保存後に制限値を設定できます</div>
        </div>}
        {!pendingNewType&&<button onClick={()=>setPendingNewType({name:""})} style={{width:"100%",padding:"8px",background:"transparent",border:"1px dashed var(--c-border2)",borderRadius:8,color:"var(--c-text3)",fontSize:12,cursor:"pointer",marginTop:4}}>＋ 属性を追加</button>}
      </AC>);
    })()}

    {plan==="premium"&&(()=>{
      // 労務判定の枠（項目2＋3）。**31日の月の総枠だけを手入力**し、そこから週の法定労働時間 W を
      // 30分単位に丸めて逆算して、各月を FLOOR(W × 暦日数 ÷ 7 × 60, 1) ÷ 60 で出す（判断2）。
      // 週44時間の特例措置対象事業場は別トグルを作らず、31日の総枠に 194:51 を入れれば W=44h になる。
      const ls=laborSettingsOf(settings);
      const saveLabor=(k,v)=>onSaveOwn({...settings,laborSettings:{...ls,[k]:v}});
      const W=weeklyLegalMinFromBase31(ls.monthlyBase31Min);
      const wLabel=W%60===0?`${W/60}時間`:`${Math.floor(W/60)}時間${W%60}分`;
      const b31h=Math.floor(ls.monthlyBase31Min/60),b31m=ls.monthlyBase31Min%60;
      // 各暦日数の代表月で laborMonthFrame を引く（年間所定の年按分はその暦年の日数を使うので、29日はうるう年の2月）
      const rows=[[31,"2027-01"],[30,"2027-04"],[29,"2028-02"],[28,"2027-02"]].map(([d,ym])=>{
        const f=laborMonthFrame(settings,ym);
        return{d,base:f.baseMin,sched:f.scheduledCapMin,guide:f.guideMin,cap:f.capMin};
      });
      const hasAnnual=ls.annualScheduledMin>0;
      const denomAuto=rateDenominatorMinOf({...ls,rateDenominatorMin:0});
      const TD={border:"1px solid var(--c-border)",padding:"4px 8px",textAlign:"right",fontSize:12,whiteSpace:"nowrap"};
      return(<AC title="労務判定（1か月単位の変形労働時間制）">
        {coNote}
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>労働時間制を「1か月単位の変形労働時間制」にした属性のスタッフに適用します。「通常の労働時間制」の月の上限は上の「スタッフ属性別 勤務時間制限」の設定値をそのまま使います（こちらは法定・協定ではなく店舗の設定値による判定です）。</div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginBottom:6}}>
          <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap",minWidth:110}}>31日の月の総枠</span>
          {coLabor("monthlyBase31Min")?coVal(`${b31h}時間${b31m}分`,0):<>
          <input type="number" min={0} max={744} value={b31h} placeholder="0"
            onChange={e=>{const h=Math.max(0,Math.min(744,parseInt(e.target.value)||0));saveLabor("monthlyBase31Min",h*60+b31m);}}
            style={{...AI,width:64,textAlign:"center",padding:"5px 6px"}}/>
          <span style={{fontSize:11,color:"var(--c-text4)"}}>時間</span>
          <input type="number" min={0} max={59} value={b31m} placeholder="0"
            onChange={e=>{const m=Math.max(0,Math.min(59,parseInt(e.target.value)||0));saveLabor("monthlyBase31Min",b31h*60+m);}}
            style={{...AI,width:64,textAlign:"center",padding:"5px 6px"}}/>
          <span style={{fontSize:11,color:"var(--c-text4)"}}>分</span></>}
        </div>
        <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12}}>この値から週の法定労働時間を <strong style={{color:"var(--c-accent)"}}>{wLabel}</strong> と判定しました。</div>
        <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"}}>固定残業</span>
            {coLabor("fixedOvertimeMin")?coVal(Math.floor(ls.fixedOvertimeMin/60)):<input type="number" min={0} max={200} value={Math.floor(ls.fixedOvertimeMin/60)||""} placeholder="0"
              onChange={e=>{const h=Math.max(0,Math.min(200,parseInt(e.target.value)||0));saveLabor("fixedOvertimeMin",h*60);}}
              style={{...AI,width:56,textAlign:"center",padding:"5px 6px"}}/>}
            <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"}}>余裕</span>
            {coLabor("marginMin")?coVal(Math.floor(ls.marginMin/60)):<input type="number" min={0} max={200} value={Math.floor(ls.marginMin/60)||""} placeholder="0"
              onChange={e=>{const h=Math.max(0,Math.min(200,parseInt(e.target.value)||0));saveLabor("marginMin",h*60);}}
              style={{...AI,width:56,textAlign:"center",padding:"5px 6px"}}/>}
            <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap",minWidth:150}}>年間所定労働時間</span>
            {coLabor("annualScheduledMin")?coVal(hasAnnual?`${minToH1(ls.annualScheduledMin)}h`:"使わない",0):<>
            <HoursDecimalInput min={ls.annualScheduledMin} zeroBlank onCommit={v=>saveLabor("annualScheduledMin",v||0)} placeholder="未設定"/>
            <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span></>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap",minWidth:150}}>1時間当たり賃金の分母</span>
            {coLabor("rateDenominatorMin")?coVal(ls.rateDenominatorMin>0?`${minToH1(ls.rateDenominatorMin)}h`:`自動 ${minToH1(denomAuto)}h`,0):<>
            <HoursDecimalInput min={ls.rateDenominatorMin} zeroBlank onCommit={v=>saveLabor("rateDenominatorMin",v||0)} placeholder={`自動 ${minToH1(denomAuto)}`}/>
            <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span></>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap",minWidth:150}}>週の起算</span>
            {coLabor("weekStartDow")?coVal(((WEEK_START_OPTIONS.find(([v])=>v===ls.weekStartDow))||[])[1]||"",0):
            <select value={ls.weekStartDow} onChange={e=>saveLabor("weekStartDow",parseInt(e.target.value))}
              style={{...AI,width:"auto",padding:"5px 8px",cursor:"pointer"}}>
              {WEEK_START_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>}
          </div>
          <div style={{fontSize:11,color:"var(--c-text4)"}}>年間所定を入れると、各月の所定上限（年間所定 × 暦日数 ÷ その年の日数）を出し、目安をそこから引きます。分母を空欄にすると年間所定 ÷ 12 を0.1時間未満切り捨てで使い、年間所定も無ければ173.3時間です。</div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",minWidth:"max-content"}}>
            <thead><tr>
              {["暦日数","総枠（所定）",...(hasAnnual?["所定上限"]:[]),"目安","上限"].map(h=><th key={h} style={{...TD,textAlign:"center",background:"var(--c-input)",fontWeight:700,color:"var(--c-text3)"}}>{h}</th>)}
            </tr></thead>
            <tbody>{rows.map(r=>(<tr key={r.d}>
              <td style={{...TD,textAlign:"center",color:"var(--c-text3)"}}>{r.d}日</td>
              <td style={{...TD,color:"var(--c-text)"}}>{fmtMin(r.base)}</td>
              {hasAnnual&&<td style={{...TD,color:"var(--c-text)"}}>{fmtMin(r.sched)}</td>}
              <td style={{...TD,color:"var(--c-text)"}}>{fmtMin(r.guide)}</td>
              <td style={{...TD,color:"var(--c-text)"}}>{fmtMin(r.cap)}</td>
            </tr>))}</tbody>
          </table>
        </div>
        <div style={{fontSize:11,color:"var(--c-text4)",marginTop:8}}>目安 = {hasAnnual?"所定上限":"総枠"} + 固定残業 − 余裕（時間未満を切り捨て）／上限 = {hasAnnual?"所定上限 + 固定残業（時間未満を切り捨て）":"総枠 + 固定残業"}。{hasAnnual?"29日はうるう年の2月の値です。":""}月の残業予定は「月実働 − 総枠」で、日別にはその日までの累計実働の比で配分します。</div>

        {/* 通常の労働時間制（B制）の日ごとのしきい値超を数値で出す（店舗トグル・既定オフ・P3.5b）。
            判定（8h超・週40h超）は法定のまま変えず、シフト作成タブの「残業予定」の行に数値を足すだけ。 */}
        <div data-daily-over-b style={{marginTop:16,paddingTop:14,borderTop:"1px solid var(--c-border)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>通常の労働時間制の日ごとの残業</div>
          {coLabor("showDailyOverB")?coVal(ls.showDailyOverB===1?"表示する":"表示しない",0):
          <label style={{display:"flex",gap:8,alignItems:"center",cursor:"pointer",marginBottom:6}}>
            <input type="checkbox" checked={ls.showDailyOverB===1} onChange={e=>saveLabor("showDailyOverB",e.target.checked?1:0)} style={{width:18,height:18}}/>
            <span style={{fontSize:13,color:"var(--c-text)"}}>その日の実働がしきい値を超えた分を「残業予定」に数値で出す</span>
          </label>}
          {ls.showDailyOverB===1&&<div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginBottom:4}}>
            <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"}}>しきい値</span>
            {coLabor("dailyOverThresholdMin")?coVal(fmtMin(dailyOverThresholdOf(ls)),0):<>
            <input type="number" min={0} max={24} value={Math.floor(dailyOverThresholdOf(ls)/60)} placeholder="0"
              onChange={e=>{const h=Math.max(0,Math.min(24,parseInt(e.target.value)||0));saveLabor("dailyOverThresholdMin",h*60+dailyOverThresholdOf(ls)%60);}}
              style={{...AI,width:56,textAlign:"center",padding:"5px 6px"}}/>
            <span style={{fontSize:11,color:"var(--c-text4)"}}>時間</span>
            <input type="number" min={0} max={59} value={dailyOverThresholdOf(ls)%60} placeholder="0"
              onChange={e=>{const m=Math.max(0,Math.min(59,parseInt(e.target.value)||0));saveLabor("dailyOverThresholdMin",Math.floor(dailyOverThresholdOf(ls)/60)*60+m);}}
              style={{...AI,width:56,textAlign:"center",padding:"5px 6px"}}/>
            <span style={{fontSize:11,color:"var(--c-text4)"}}>分</span></>}
          </div>}
          <div style={{fontSize:11,color:"var(--c-text4)"}}>「通常の労働時間制」の属性の人が対象です。週40時間超は従来どおり労務判定の欄に出ます。</div>
        </div>

        <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid var(--c-border)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>36協定</div>
          <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"}}>1日の延長上限</span>
              {coLabor("agreementDailyOtMin")?coVal(Math.floor(ls.agreementDailyOtMin/60)):<input type="number" min={0} max={16} value={Math.floor(ls.agreementDailyOtMin/60)||""} placeholder="0"
                onChange={e=>{const h=Math.max(0,Math.min(16,parseInt(e.target.value)||0));saveLabor("agreementDailyOtMin",h*60);}}
                style={{...AI,width:56,textAlign:"center",padding:"5px 6px"}}/>}
              <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"}}>1か月の延長上限</span>
              {coLabor("agreementMonthlyOtMin")?coVal(Math.floor(ls.agreementMonthlyOtMin/60)):<input type="number" min={0} max={200} value={Math.floor(ls.agreementMonthlyOtMin/60)||""} placeholder="0"
                onChange={e=>{const h=Math.max(0,Math.min(200,parseInt(e.target.value)||0));saveLabor("agreementMonthlyOtMin",h*60);}}
                style={{...AI,width:56,textAlign:"center",padding:"5px 6px"}}/>}
              <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"}}>1年の延長上限</span>
              {coLabor("agreementAnnualOtMin")?coVal(Math.floor(ls.agreementAnnualOtMin/60)):<input type="number" min={0} max={999} value={Math.floor(ls.agreementAnnualOtMin/60)||""} placeholder="0"
                onChange={e=>{const h=Math.max(0,Math.min(999,parseInt(e.target.value)||0));saveLabor("agreementAnnualOtMin",h*60);}}
                style={{...AI,width:56,textAlign:"center",padding:"5px 6px"}}/>}
              <span style={{fontSize:11,color:"var(--c-text4)"}}>h</span>
            </div>
          </div>
          <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:6}}>1日の延長上限を0にすると「残業を前提にしない運用」とみなし、目安＝総枠になります。</div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:10}}>
            <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"}}>年の区切り</span>
            {coLabor("fiscalYearStartMonth")?coVal(`${fiscalYearStartMonthOf(settings)}月`,0):<select value={fiscalYearStartMonthOf(settings)} onChange={e=>saveLabor("fiscalYearStartMonth",parseInt(e.target.value)||4)}
              style={{...AI,width:"auto",padding:"5px 8px",cursor:"pointer"}}>
              <option value={1}>1月（暦年）</option>
              <option value={4}>4月（年度）</option>
              <option value={7}>7月</option>
              <option value={10}>10月</option>
            </select>}
            <span style={{fontSize:11,color:"var(--c-text4)"}}>有給の残数と年間の累計勤務時間の区切りに使います</span>
          </div>
          {/* 法定の上限一覧。判定する・しないを取り違えないよう AGREEMENT_LEGAL_ITEMS から自動生成する */}
          <div style={{background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,padding:"8px 10px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--c-text3)",marginBottom:4}}>法定の上限と、本機能が判定する範囲</div>
            {AGREEMENT_LEGAL_ITEMS.map(it=>(
              <div key={it.key} style={{display:"flex",gap:6,alignItems:"flex-start",marginTop:4}}>
                <span style={{fontSize:11,fontWeight:700,whiteSpace:"nowrap",color:it.judged?"#10B981":"var(--c-text4)"}}>{it.judged?"判定":"未判定"}</span>
                <span style={{fontSize:11,color:it.judged?"var(--c-text2)":"var(--c-text4)"}}>
                  {it.label}{it.judged?"":"（本機能では判定しません）"}
                  {it.note&&<span style={{display:"block",color:"var(--c-text4)"}}>{it.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </AC>);
    })()}

    {plan==="premium"&&(()=>{
      const mode=breakModeOf(settings);
      const L=breakLengthOf(settings);
      const rawLen=(settings.breakLength&&typeof settings.breakLength==="object")?settings.breakLength:{};
      const rule=breakLengthRuleOf(settings);
      // 編集中は保存順のまま並べる（判定は breakLengthRuleOf がしきい値の高い順に並べ直して使う）
      const rawTiers=Array.isArray(rawLen.tiers)?rawLen.tiers:(rawLen.tiers&&typeof rawLen.tiers==="object"?Object.values(rawLen.tiers):[]);
      const saveMode=m=>onSave({...settings,breakMode:m});
      const saveLenAll=next=>onSave({...settings,breakLength:next});
      const saveLen=(k,v)=>saveLenAll({...rawLen,...L,[k]:v});
      const saveTiers=list=>{const n={...rawLen};if(list&&list.length)n.tiers=list;else delete n.tiers;saveLenAll(n);};
      const setTier=(i,patch)=>saveTiers(rawTiers.map((t,j)=>j===i?{overMin:0,breakMin:0,inclusive:false,...t,...patch}:t));
      const numIn=(val,onCh,max,w=60)=>(<input type="number" min={0} max={max} value={val} placeholder="0"
        onChange={e=>onCh(Math.max(0,Math.min(max,parseInt(e.target.value)||0)))}
        style={{...AI,width:w,textAlign:"center",padding:"5px 6px"}}/>);
      const SUB={marginTop:6,padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8};
      const LB={fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"};
      const UN={fontSize:11,color:"var(--c-text4)"};
      return(<AC title="休憩の決め方">
        <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>勤務時間から差し引く休憩の決め方を選びます。変更しなければ従来どおり「時間帯方式」で、候補タブで登録した休憩帯と勤務が重なった分だけを引きます。</div>
        {BREAK_MODES.map(m=>(
          <label key={m} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:8,cursor:"pointer"}}>
            <input type="radio" name="breakmode" checked={mode===m} onChange={()=>saveMode(m)} style={{marginTop:3,width:18,height:18,flexShrink:0}}/>
            <span style={{fontSize:13,color:"var(--c-text)"}}>{BREAK_MODE_LABELS[m]}</span>
          </label>
        ))}
        {mode==="length"&&<div data-break-length style={SUB}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:8}}>
            <span style={LB}>段の判定</span>
            <select data-break-basis value={rule.basis} onChange={e=>saveLenAll({...rawLen,basis:e.target.value})}
              style={{...AI,width:"auto",padding:"5px 8px",cursor:"pointer"}}>
              {BREAK_LENGTH_BASES.map(b=><option key={b} value={b}>{BREAK_LENGTH_BASIS_LABELS[b]}</option>)}
            </select>
          </div>
          {!rule.custom&&<>
            <div style={{fontSize:11,color:"var(--c-text4)",marginBottom:8}}>{rule.basis==="work"?"引いたあとの実働がその段を超える範囲で、いちばん長い段を使います（労基法34条の「労働時間」は実働のため）。":"拘束時間がその段を超える範囲で、いちばん長い段を使います。"}</div>
            <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
              {[["over8Min","8時間超"],["over6Min","6時間超"]].map(([k,lbl])=>(
                <div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={LB}>{rule.basis==="work"?"実働":"拘束"}{lbl}</span>
                  <input type="number" min={0} max={240} step={5} value={L[k]}
                    onChange={e=>saveLen(k,Math.max(0,Math.min(240,parseInt(e.target.value)||0)))}
                    style={{...AI,width:64,textAlign:"center",padding:"5px 6px"}}/>
                  <span style={UN}>分</span>
                </div>
              ))}
            </div>
          </>}
          {rule.custom&&<div style={{fontSize:11,color:"var(--c-text4)",marginBottom:8}}>{rule.basis==="work"?"引いたあとの実働":"拘束時間"}が条件に当たる段のうち、しきい値のいちばん高い段を使います。</div>}
          {rawTiers.map((t,i)=>{const o=Math.max(0,Number(t&&t.overMin)||0);return(
            <div key={i} data-break-tier={i} style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginBottom:6}}>
              {numIn(Math.floor(o/60),v=>setTier(i,{overMin:v*60+o%60}),24,56)}<span style={UN}>時間</span>
              {numIn(o%60,v=>setTier(i,{overMin:Math.floor(o/60)*60+Math.min(59,v)}),59,56)}<span style={UN}>分</span>
              <select value={t&&t.inclusive===true?"1":"0"} onChange={e=>setTier(i,{inclusive:e.target.value==="1"})}
                style={{...AI,width:"auto",padding:"5px 8px",cursor:"pointer"}}>
                <option value="1">以上</option><option value="0">を超える</option>
              </select>
              <span style={LB}>→ 休憩</span>
              {numIn(Math.max(0,Number(t&&t.breakMin)||0),v=>setTier(i,{breakMin:v}),480,64)}<span style={UN}>分</span>
              <button onClick={()=>saveTiers(rawTiers.filter((_,j)=>j!==i))} style={{...AD,padding:"4px 10px",fontSize:12}}>削除</button>
            </div>);})}
          {rawTiers.length<BREAK_LENGTH_TIERS_MAX&&<button data-break-tier-add onClick={()=>saveTiers([...rawTiers,{overMin:0,breakMin:0,inclusive:false}])}
            style={{width:"100%",padding:"6px",background:"transparent",border:"1px dashed var(--c-border2)",borderRadius:8,color:"var(--c-text3)",fontSize:12,cursor:"pointer",marginTop:4}}>
            ＋ 段を自分で決める{rule.custom?"（段を追加）":"（上の2段の代わりに使います）"}</button>}
        </div>}
        {mode==="length"&&(()=>{const t=lengthBandMismatchText(lengthBandMismatchOf(settings));return t
          ?<div data-break-mismatch style={{marginTop:8,padding:"8px 10px",borderRadius:8,fontSize:12,lineHeight:1.6,background:"#FEF3C7",color:"#92400E",border:"1px solid #F59E0B"}}>{t}</div>:null;})()}
        {mode==="length"&&<div style={{fontSize:11,color:"var(--c-text4)",marginTop:6}}>長さ方式では、候補タブの全属性の休憩（タグなし）はヒートマップにだけ使い、勤務時間には使いません。属性ありの休憩は、その属性の人の勤務が丸ごと含む日に長さ方式より優先して引きます。</div>}
        <div style={{fontSize:11,color:"var(--c-text4)",marginTop:10}}>どの方式でも「実働6時間超なのに休憩が足りない日」はシフト作成タブの労務判定に出ます。日ごとの例外は提出一覧の詳細から変更できます。</div>
      </AC>);
    })()}

    {/* 有給の付与日数・退勤延長設定は 2026-09-26 にスタッフタブへ移した
        （有給日数＝行のボタン、退勤延長＝「編集」で開くモーダル）。設定タブには置かない。 */}

    {plan==="premium"&&<AC title="ポジション設定">
      <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>キッチン・ホールそれぞれのポジション名を登録します。下の「必要ポジション設定」・スタッフ一覧タブのポジション選択で使用します。</div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        {[["kitchen","キッチン"],["hall","ホール"]].map(([sec,label])=>{
          const list=(settings.positions&&settings.positions[sec])||[];
          const addPos=()=>{
            const v=(newPosInput[sec]||"").trim();
            if(!v)return;
            if(list.includes(v)){tt("▲ 既に登録されているポジションです");return;}
            // 同名を別セクションにも登録できると、名前をキーにする staffPositions / requiredPositions で
            // どちらのポジションを指すのか決められない（バグチェック#46）。登録の入口で弾く。
            const otherSec=sec==="kitchen"?"hall":"kitchen";
            const otherList=((settings.positions||{})[otherSec])||[];
            if(otherList.includes(v)){tt(`▲ 「${v}」は${otherSec==="kitchen"?"キッチン":"ホール"}に登録済みです（同じ名前は使えません）`);return;}
            onSave({...settings,positions:{...(settings.positions||{}),[sec]:[...list,v]}});
            setNewPosInput({...newPosInput,[sec]:""});
          };
          const delPos=p=>{
            // 削除時は必要ポジション設定・スタッフのポジションからも同名を除去する（属性削除と同じカスケード方針）。
            // ただしキッチン/ホールには同名ポジションを登録できる（追加時の重複チェックはセクション内のみ）ため、
            // 反対側に同名が残る場合は、そちらの必要ポジション枠・"全て"枠・スタッフのポジション
            // （セクション非依存）まで巻き添えで消さない。消すと有効な設定が黙って失われる。
            const newPositions={...(settings.positions||{}),[sec]:list.filter(x=>x!==p)};
            const other=sec==="kitchen"?"hall":"kitchen";
            const stillExists=((newPositions[other])||[]).includes(p);
            const cut=(arr,drop)=>drop?((arr||[]).filter(x=>x!==p)):((arr||[]).slice());
            const rp=settings.requiredPositions||{};
            const newRP={};
            Object.keys(rp).forEach(dt=>{
              const cur=rp[dt]||{};
              const cutMeal=m=>({
                kitchen:cut(cur[m]&&cur[m].kitchen,sec==="kitchen"||!stillExists),
                hall:cut(cur[m]&&cur[m].hall,sec==="hall"||!stillExists),
                all:cut(cur[m]&&cur[m].all,!stillExists),
              });
              newRP[dt]={lunch:cutMeal("lunch"),dinner:cutMeal("dinner")};
            });
            const sp=settings.staffPositions||{};
            const newSP={};
            Object.keys(sp).forEach(name=>{
              newSP[name]={lunch:cut(sp[name]&&sp[name].lunch,!stillExists),dinner:cut(sp[name]&&sp[name].dinner,!stillExists)};
            });
            // この × ボタンは 13.2x14px（Apple HIG の最小タップ領域 44x44 の約1割の面積）で誤タップしやすいのに、
            // 上のカスケードで必要ポジション設定（全日付区分×ランチ/ディナー×3セクション）とスタッフの
            // ポジション（全スタッフ）から同名を巻き添えで消す。期間削除・提出削除・店舗削除と同じく確認を挟み、
            // かつ何件が道連れになるかを提示する（バグチェック#74）。
            const cntRP=o=>Object.values(o||{}).reduce((n,dt)=>n+Object.values(dt||{}).reduce((m,meal)=>m+Object.values(meal||{}).reduce((k,arr)=>k+(Array.isArray(arr)?arr.length:0),0),0),0);
            const cntSP=o=>Object.values(o||{}).reduce((n,st)=>n+Object.values(st||{}).reduce((m,arr)=>m+(Array.isArray(arr)?arr.length:0),0),0);
            const lostRP=cntRP(rp)-cntRP(newRP), lostSP=cntSP(sp)-cntSP(newSP);
            const also=[lostRP>0?`必要ポジション設定の枠 ${lostRP}件`:"",lostSP>0?`スタッフのポジション ${lostSP}件`:""].filter(Boolean).join("・");
            if(!confirm(`ポジション「${p}」を削除しますか？${also?`\n${also}も一緒に削除されます。`:""}`))return;
            onSave({...settings,positions:newPositions,requiredPositions:newRP,staffPositions:newSP});
          };
          return(
            <div key={sec} style={{flex:"1 1 220px",minWidth:220}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--c-text2)",marginBottom:6}}>{label}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                {list.length===0&&<div style={{fontSize:12,color:"var(--c-text4)"}}>未登録</div>}
                {list.map(p=>(
                  <div key={p} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(248,112,54,.1)",border:"1px solid rgba(248,112,54,.25)",borderRadius:12,padding:"3px 10px 3px 12px",fontSize:13,color:"#c45b1a",fontWeight:600}}>
                    {p}<button onClick={()=>delPos(p)} style={{background:"none",border:"none",color:"var(--c-accent)",cursor:"pointer",padding:"0 0 0 4px",fontSize:14,lineHeight:1}}>×</button>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:6}}>
                <input value={newPosInput[sec]||""} onChange={e=>setNewPosInput({...newPosInput,[sec]:e.target.value})} onKeyDown={e=>e.key==="Enter"&&addPos()} placeholder="ポジション名" maxLength={20} style={{...AI,flex:1,padding:"6px 10px",fontSize:16}}/>
                <button onClick={addPos} style={{...AB,padding:"6px 12px",fontSize:12}}>＋</button>
              </div>
            </div>
          );
        })}
      </div>
    </AC>}

    {plan==="premium"&&<AC title="必要ポジション設定">
      <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:12}}>曜日区分・ランチ/ディナーごとに必要なポジションをタグで追加します。同じポジションを複数回追加すると、その人数分が必要になります（シフト作成タブで不足を判定）。</div>
      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
        {/* 旧4区分の「祝日」枠は requiredPositionsFor が祝日区分に流用するので、休憩設定と同じく見える場所に出して消せるようにする */}
        {[...POSITION_DAY_TYPES,...(hasAnyRequiredPosition({hol:(settings.requiredPositions||{}).hol})?[["hol","祝日（旧設定・自動適用中）"]]:[])].map(([id,label])=>(
          <button key={id} onClick={()=>setReqDayType(id)} style={{padding:"6px 12px",background:reqDayType===id?"var(--c-accent)":"var(--c-input)",border:`1px solid ${reqDayType===id?"var(--c-accent)":"var(--c-border2)"}`,borderRadius:8,color:reqDayType===id?"white":"var(--c-text2)",fontSize:12,fontWeight:600,cursor:"pointer"}}>{label}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["lunch","ランチ"],["dinner","ディナー"]].map(([id,label])=>(
          <button key={id} onClick={()=>setReqMeal(id)} style={{padding:"6px 12px",background:reqMeal===id?"var(--c-accent)":"var(--c-input)",border:`1px solid ${reqMeal===id?"var(--c-accent)":"var(--c-border2)"}`,borderRadius:8,color:reqMeal===id?"#fff":"var(--c-text2)",fontSize:12,fontWeight:600,cursor:"pointer"}}>{label}</button>
        ))}
      </div>
      {(()=>{
        const rp=settings.requiredPositions||{};
        const cur=(rp[reqDayType]&&rp[reqDayType][reqMeal])||{kitchen:[],hall:[],all:[]};
        const setCur=(sec,arr)=>{
          const nextDT={...(rp[reqDayType]||{lunch:{kitchen:[],hall:[],all:[]},dinner:{kitchen:[],hall:[],all:[]}})};
          nextDT[reqMeal]={...(nextDT[reqMeal]||{kitchen:[],hall:[],all:[]}),[sec]:arr};
          onSave({...settings,requiredPositions:{...rp,[reqDayType]:nextDT}});
        };
        return(
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            {[["kitchen","キッチン"],["hall","ホール"],["all","全て"]].map(([sec,label])=>{
              // "全て"は kitchen+hall 両方のポジションを選択可。他はそれぞれのセクションのみ。
              // 同名ポジションが両セクションに登録されていると合算リストで重複するため new Set で排除する。
              const options=sec==="all"
                ?[...new Set([...((settings.positions&&settings.positions.kitchen)||[]),...((settings.positions&&settings.positions.hall)||[])])]
                :(settings.positions&&settings.positions[sec])||[];
              const slots=cur[sec]||[];
              return(
                <div key={sec} style={{flex:"1 1 220px",minWidth:220}}>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--c-text2)",marginBottom:6}}>
                    {label}
                    {sec==="all"&&<span style={{fontSize:10,fontWeight:400,color:"var(--c-text4)",marginLeft:4}}>（キッチン+ホール合算）</span>}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8,minHeight:32,alignContent:"flex-start"}}>
                    {slots.length===0&&<div style={{fontSize:12,color:"var(--c-text4)",alignSelf:"center"}}>未設定</div>}
                    {slots.map((p,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:12,padding:"3px 10px 3px 12px",fontSize:13,color:"#DC2626",fontWeight:600}}>
                        {p}<button onClick={()=>setCur(sec,slots.filter((_,ci)=>ci!==i))} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",padding:"0 0 0 4px",fontSize:14,lineHeight:1}}>×</button>
                      </div>
                    ))}
                  </div>
                  {options.length===0
                    ?<div style={{fontSize:11,color:"var(--c-text4)"}}>{sec==="all"?"先に上の「ポジション設定」でポジションを登録してください":`先に上の「ポジション設定」で${label}のポジションを登録してください`}</div>
                    :<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {options.map(p=>(
                        <button key={p} onClick={()=>setCur(sec,[...slots,p])} style={{padding:"5px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:12,fontSize:13,color:"var(--c-text2)",cursor:"pointer",fontWeight:600}}>＋ {p}</button>
                      ))}
                    </div>
                  }
                </div>
              );
            })}
          </div>
        );
      })()}
    </AC>}

    {(plan==="pro"||plan==="premium")&&<AC title="Excel書き出し設定">
      <AL>書き出し時の店舗名（空欄 = 登録名をそのまま使用）</AL>
      <div style={{display:"flex",gap:8,marginBottom:4}}>
        <input value={settings.xlShopName||""} onChange={e=>onSave({...settings,xlShopName:e.target.value})} placeholder="例：〇〇カフェ 渋谷店" maxLength={100} style={{...AI,flex:1}}/>
        {(settings.xlShopName||"")&&<button onClick={()=>onSave({...settings,xlShopName:""})} style={{...AGray,padding:"10px 12px",fontSize:12}}>クリア</button>}
      </div>
      <div style={{fontSize:11,color:"var(--c-text4)",marginTop:4}}>設定した名前はExcel出力時のファイル名・シート内店舗名に反映されます</div>
    </AC>}

    {/* PDF の日付ヘッダに出す昼・夜の人数（2026-09-30・P3.5d）。確認時刻は店舗の設定で、コードに既定の時刻は無い */}
    {plan==="premium"&&(()=>{
      const hc=headcountAtOf(settings);
      const saveHc=patch=>onSave({...settings,headcountAt:{...hc,...patch}});
      const TOPT=["",...TO];
      const sel=(k,lbl)=>(<div style={{display:"flex",alignItems:"center",gap:4}}>
        <span style={{fontSize:12,color:"var(--c-text3)",whiteSpace:"nowrap"}}>{lbl}</span>
        <select data-headcount-at={k} value={hc[k]} onChange={e=>saveHc({[k]:e.target.value})} style={{...AI,width:"auto",padding:"5px 8px",cursor:"pointer"}}>
          {TOPT.map(t=><option key={t||"none"} value={t}>{t||"出さない"}</option>)}
        </select></div>);
      return(<AC title="PDF の昼・夜の人数">
        <div data-headcount-card>
          <label style={{display:"flex",gap:8,alignItems:"center",cursor:"pointer",marginBottom:hc.enabled?8:0}}>
            <input type="checkbox" checked={hc.enabled} onChange={e=>saveHc({enabled:e.target.checked})} style={{width:18,height:18}}/>
            <span style={{fontSize:13,color:"var(--c-text)"}}>PDF の曜日の下に、その時刻に出勤している人数を出す</span>
          </label>
          {hc.enabled&&<div style={{display:"flex",gap:14,flexWrap:"wrap"}}>{sel("lunch","昼の確認時刻")}{sel("dinner","夜の確認時刻")}</div>}
          <div style={{fontSize:11,color:"var(--c-text4)",marginTop:6}}>出勤がその時刻以前で、退勤がその時刻より後の人を数えます。他店舗への応援と、その時間帯に休暇（公休・有給・慶弔）の人は数えません。0人の側と店休日は出しません。キッチンとホールを分けている店舗では、左の曜日の列にキッチン、右の曜日の列にホールの人数を出します。画面と Excel には出ません。</div>
        </div>
      </AC>);
    })()}

    {(plan==="pro"||plan==="premium")&&<AC title="期間の単位（プリセット）">
      <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:10}}>期間を新規作成するときのプリセット選択肢を切り替えます。</div>
      <div style={{display:"flex",gap:8}}>
        {[["2week","2週間（前半／後半）"],["1month","1ヶ月"]].map(([val,label])=>{
          const sel=(settings.periodUnit||"2week")===val;
          return(<button key={val} onClick={()=>onSave({...settings,periodUnit:val})}
            style={{flex:1,padding:"10px 8px",borderRadius:8,border:`2px solid ${sel?"var(--c-accent)":"var(--c-border)"}`,
              background:sel?"rgba(248,112,54,.1)":"var(--c-input)",color:sel?"var(--c-accent)":"var(--c-text2)",
              fontSize:13,fontWeight:sel?700:500,cursor:"pointer"}}>
            {label}
          </button>);
        })}
      </div>
    </AC>}

    <AC title="テーマ設定">
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[["auto","↺ 自動（システム設定）",null],["light","ライト","light"],["dark","ダーク","dark"]].map(([key,label,val])=>{
          const sel=themePref===val;
          return(<button key={key} onClick={()=>changeTheme(val)}
            style={{flex:1,padding:"10px 8px",borderRadius:8,border:`1px solid ${sel?"var(--c-accent)":"var(--c-border2)"}`,
              background:sel?"var(--c-accent)":"var(--c-input)",color:sel?"#fff":"var(--c-text2)",
              fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
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
        ?<div style={{textAlign:"center",color:"var(--c-text3)",padding:"12px 0",fontSize:14}}>認証中...</div>
        :acctEmailMode
          ?<div>
            <div style={{display:"flex",alignItems:"center",marginBottom:14}}>
              <button onClick={()=>{setAcctEmailMode(null);setAcctRegClassic(false);setAcctError("");setAcctEmail("");setAcctPw("");setAcctPw2("");}}
                style={{background:"none",border:"none",color:"var(--c-text3)",fontSize:13,cursor:"pointer",padding:"0 8px 0 0"}}>← 戻る</button>
              <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)"}}>{acctEmailMode==="login"?"メールでログイン":"新規アカウント登録"}</div>
            </div>
            {acctEmailMode==="register"&&!acctRegClassic?<EmailLinkSendBox kind="admin" linkShopId={shopId} initialEmail={acctEmail}
              onFallback={em=>{setAcctEmail(em);setAcctRegClassic(true);setAcctError("");}}
              inputStyle={{width:"100%",padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none",boxSizing:"border-box"}}
              buttonStyle={{width:"100%",padding:"11px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:14,fontWeight:700,cursor:"pointer",marginBottom:8}}/>:<>
            {acctEmailMode==="register"&&<div data-email-link-fallback="1" style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginBottom:8}}>確認メールを送れないため、この画面で登録します。</div>}
            <input type="email" value={acctEmail} onChange={e=>setAcctEmail(e.target.value)}
              placeholder="メールアドレス" maxLength={254}
              style={{width:"100%",padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none",marginBottom:8,boxSizing:"border-box"}}/>
            <input type="password" value={acctPw} onChange={e=>setAcctPw(e.target.value)}
              onKeyDown={async e=>{if(e.key==="Enter"&&acctEmailMode==="login"){setAcctLoading(true);setAcctError("");const r=await onSignInAndLinkEmail(acctEmail,acctPw,false);setAcctLoading(false);if(r?.error)setAcctError(r.error);else{setAcctEmailMode(null);tt("✓ アカウントを連携しました");}}}}
              placeholder="パスワード（6文字以上）" maxLength={128}
              style={{width:"100%",padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none",marginBottom:acctEmailMode==="register"?8:12,boxSizing:"border-box"}}/>
            {acctEmailMode==="register"&&<input type="password" value={acctPw2} onChange={e=>setAcctPw2(e.target.value)}
              placeholder="パスワード（確認）" maxLength={128}
              style={{width:"100%",padding:"10px 12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text)",fontSize:16,outline:"none",marginBottom:12,boxSizing:"border-box"}}/>}
            {acctError&&<div style={{fontSize:12,color:"#FF4757",marginBottom:10,background:"rgba(239,68,68,.08)",padding:"8px 10px",borderRadius:8}}>{acctError}</div>}
            <button disabled={acctLoading} onClick={async()=>{
              if(acctEmailMode==="register"&&acctPw!==acctPw2){setAcctError("パスワードが一致しません");return;}
              setAcctLoading(true);setAcctError("");
              const r=await onSignInAndLinkEmail(acctEmail,acctPw,acctEmailMode==="register");
              setAcctLoading(false);
              if(r?.error)setAcctError(r.error);
              else{setAcctEmailMode(null);tt("✓ アカウントを連携しました");}
            }} style={{width:"100%",padding:"11px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:14,fontWeight:700,cursor:"pointer",marginBottom:8,opacity:acctLoading?.5:1}}>
              {acctEmailMode==="login"?"ログイン":"アカウント作成"}
            </button>
            </>}
            {acctEmailMode==="login"
              ?<div style={{textAlign:"center",fontSize:12,color:"var(--c-text4)"}}>アカウントがない場合は<button onClick={()=>{setAcctEmailMode("register");setAcctError("");}} style={{background:"none",border:"none",color:"var(--c-accent)",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>新規登録</button></div>
              :<div style={{textAlign:"center",fontSize:12,color:"var(--c-text4)"}}>既にアカウントがある場合は<button onClick={()=>{setAcctEmailMode("login");setAcctError("");}} style={{background:"none",border:"none",color:"var(--c-accent)",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>ログイン</button></div>
            }
          </div>
          :<div style={{display:"flex",flexDirection:"column",gap:8}}>
            <button onClick={async()=>{setAcctLoading(true);setAcctError("");const r=await onSignInAndLinkGoogle();setAcctLoading(false);if(r?.error)setAcctError(r.error);else tt("✓ アカウントを連携しました");}}
              style={{width:"100%",padding:"12px",background:"white",border:"1px solid var(--c-border)",borderRadius:8,color:"#1A1A2E",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Googleで登録/ログイン
            </button>
            <button onClick={()=>{setAcctEmailMode("login");setAcctError("");}}
              style={{width:"100%",padding:"12px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text2)",fontSize:14,fontWeight:700,cursor:"pointer"}}>
              メールアドレスで続ける
            </button>
            {acctError&&<div style={{fontSize:12,color:"#FF4757",background:"rgba(239,68,68,.08)",padding:"8px 10px",borderRadius:8}}>{acctError}</div>}
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
        <div style={{marginTop:14,padding:14,background:"var(--c-input)",borderRadius:8,border:"1px solid var(--c-border2)"}}>
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
        <div style={{marginTop:14,padding:14,background:"var(--c-input)",borderRadius:8,border:"1px solid var(--c-border2)"}}>
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
      {linkError&&<div style={{marginTop:10,fontSize:12,color:"#FF4757"}}>{linkError}</div>}
    </AC>}

    <div style={{textAlign:"center",padding:"8px 0 4px",display:"flex",justifyContent:"center",gap:20}}>
      <a href="/terms.html" target="_blank" style={{fontSize:12,color:"var(--c-text4)",textDecoration:"none"}}>利用規約</a>
      <a href="/privacy.html" target="_blank" style={{fontSize:12,color:"var(--c-text4)",textDecoration:"none"}}>プライバシーポリシー</a>
    </div>

  </div>);
}
