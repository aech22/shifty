// ============================================================
// Shifty - スタッフ画面コンポーネント（app.js から分割 M-1）
// ============================================================

// ===== アイコン =====
function ShiftyIcon({size=32}){
  return(
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 64 64" style={{display:"block",flexShrink:0}}>
      <rect width="64" height="64" rx="12" fill="var(--c-accent)"/>
      <rect x="16" y="14" width="32" height="36" fill="#f0f0ee" stroke="#8a8a84" strokeWidth="1.5"/>
      <line x1="16" y1="32" x2="48" y2="32" stroke="#8a8a84" strokeWidth="1.5" strokeDasharray="1.5,1.5"/>
    </svg>
  );
}

// スタッフ画面
// ============================================================
function StaffView({periods,ap,apid,setApid,shopId,settings,subs,staffList,onSub,onDeleteSub,shopName,urlLocked=false,plan="free"}){
  // Cookieからスタッフ名を復元
  const savedName=shopId&&apid?getCookie(ckStaffKey(shopId,apid))||"":"";
  const[name,setName]=useState(savedName);
  const[sd,setSd]=useState({});
  const[done,setDone]=useState(false);
  const[conf,setConf]=useState(false);
  const[sending,setSending]=useState(false);
  const[toast,setToast]=useState(null);
  const[sm,setSm]=useState(false);
  const editingRef=useRef(false); // 「修正する」でユーザーが手動編集中フラグ
  const dirtyRef=useRef(false); // 提出前フォームに未保存の入力があるフラグ（他人の提出によるsubs更新での消去防止）
  const initedApidRef=useRef(null); // 初期化済みのapid（期間が実際に変わったときだけリセットする）
  const[comment,setComment]=useState("");
  const[editN,setEditN]=useState(false);
  const[ni,setNi]=useState("");
  const[showSuggest,setShowSuggest]=useState(false);
  const tr=useRef(),nr=useRef(),nameWrapRef=useRef();
  const submittingRef=useRef(false); // 二重送信防止（state更新を待たない同期ガード）
  const dl=idp(ap?.deadlineDate);
  const dates=ap?gd(ap.startDate,ap.endDate):[];

  // 期間が実際に変わったとき（および初回）だけシフトデータを初期化する。
  // subs更新（他スタッフの提出）でこのeffectが再実行されても、同一期間ならリセットしない。
  useEffect(()=>{
    if(!apid||!ap)return;
    if(initedApidRef.current===apid)return;
    initedApidRef.current=apid;
    dirtyRef.current=false;
    editingRef.current=false;
    const ckName=shopId&&apid?getCookie(ckStaffKey(shopId,apid))||"":"";
    if(ckName)setName(ckName);
    const i={};dates.forEach(d=>{i[d]={status:"holiday"};});
    setSd(i);setDone(false);setComment("");
  },[apid,ap?.startDate,ap?.endDate,shopId]);

  // Cookieに保存された名前の提出済みデータを復元して完了画面を表示。
  // ユーザーが入力中（dirty/editing）のときは復元しない＝他人の提出で入力中フォームが消えるバグの防止。
  useEffect(()=>{
    if(!apid||!ap)return;
    if(editingRef.current||dirtyRef.current||done)return;
    const ckName=shopId&&apid?getCookie(ckStaffKey(shopId,apid))||"":"";
    if(!ckName)return;
    const prevSub=subs.find(s=>s.staffName===ckName&&s.periodId===apid);
    if(!prevSub)return;
    setName(ckName);
    const init={};
    gd(ap.startDate,ap.endDate).forEach(d=>{
      init[d]=(prevSub.shifts||{})[d]||{status:"holiday"};
    });
    setSd(init);
    setComment(prevSub.comment||"");
    setDone(true);
  },[apid,ap?.startDate,ap?.endDate,shopId,subs,done]);

  const tt_=m=>{setToast(m);clearTimeout(tr.current);tr.current=setTimeout(()=>setToast(null),2500);};
  // Firebaseはundefinedを含むオブジェクトのset()で例外を投げる（休みボタンでstart/endをundefinedにする既存の実装と相性が悪いため必須）
  // 実装は app-utils.js の sanitizeForSet に一本化した（旧実装は1階層のみで入れ子を取りこぼすため）。
  // o||{} は旧実装の {...null}==={} という挙動をそのまま保つためのもの。
  const stripUndef=o=>sanitizeForSet(o||{}).value;
  const upd=(ds,u)=>{dirtyRef.current=true;setSd(p=>({...p,[ds]:stripUndef({...p[ds],...u})}));};
  const reset=()=>{
    editingRef.current=false;
    dirtyRef.current=false;
    // CookieとStateをリセット
    if(shopId&&apid) delCookie(ckStaffKey(shopId,apid));
    setName("");
    const i={};dates.forEach(d=>{i[d]={status:"holiday"};});
    setSd(i);setDone(false);setComment("");
    tt_("↺ リセットしました");
  };

  // 候補取得（日付別 > 祝日[key=7:連休中・単日/key=8:最終日] > 曜日別 > 全体）
  const gc=ds=>{
    // 1. 日付別（最優先）
    const dc=(settings.dateCandidates||{})[ds];if(dc&&dc.length>0)return dc;
    // 2. 祝日（dayTypeOfで連休中・単日(holSat)/最終日(holSun)を判定）
    const dt=dayTypeOf(ds);
    if(dt==="holSat"){const hc=(settings.weekdayCandidates||{})[7]||[];if(hc.length>0)return hc;}
    // key8未設定（既存店舗の大半）は分割前の祝日候補(key7)にフォールバックする。
    // 分割前は全祝日がkey7に集約されており、ハッピーマンデー祝日（連休最終日=holSun）を
    // 素通りさせると既設定の祝日候補が最終日だけ効かなくなる回帰になるため。
    if(dt==="holSun"){const hc8=(settings.weekdayCandidates||{})[8]||[];if(hc8.length>0)return hc8;const hc7=(settings.weekdayCandidates||{})[7]||[];if(hc7.length>0)return hc7;}
    // 3. 曜日別（翌日が祝日で連休が続く非祝日の日曜日はdayTypeOfが"sat"を返すため土曜(6)の候補を使う）
    const dow=pd(ds).getDay();
    const wdKey=dt==="sat"?6:dow;
    const wdc=(settings.weekdayCandidates||{})[wdKey]||[];if(wdc.length>0)return wdc;
    // 4. 全体デフォルト
    if(isWeekendOrHoliday(ds))return settings.candidates||CAND_WEEKEND;
    return settings.candidates||CAND_WEEKDAY;
  };

  // 全日程一括入力（通し／ランチ／ディナー）※トグル: 既に全日程が同一内容なら休みに戻す
  const bulkFill=type=>{
    const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
    // 日付ごとに gc(ds)（日付別>祝日>曜日別>全体）で解決した候補から適用値を求める。
    // settings.candidates 直読みだと曜日別・日付別候補が無視され、通し=最長に対応しない不具合になる。
    const candFor=ds=>{
      const src=gc(ds).filter(c=>!c.closed&&c.start&&c.end);
      if(src.length===0)return null;
      if(type==="through"){
        // 通し: 単一候補ではなく、その日の候補の最も早い出勤〜最も遅い退勤を動的に組み立てる
        const earliestStart=src.reduce((best,c)=>!best||toMin(c.start)<toMin(best)?c.start:best,null);
        const latestEnd=src.reduce((best,c)=>!best||toMin(c.end)>toMin(best)?c.end:best,null);
        return earliestStart&&latestEnd?{start:earliestStart,end:latestEnd}:null;
      }
      const pool=type==="lunch"?src.filter(c=>toMin(c.end)<=toMin("17:00"))
        :src.filter(c=>toMin(c.start)>=toMin("17:00"));
      return pool.reduce((best,c)=>!best||(toMin(c.end)-toMin(c.start))>(toMin(best.end)-toMin(best.start))?c:best,null);
    };
    // 休業日を除き、その日に適用可能な候補がある日付のみ対象
    const applicable=dates.filter(ds=>!gc(ds).some(c=>c.closed)&&candFor(ds));
    if(applicable.length===0){tt_("▲ 該当する候補時間が見つかりません");return;}
    const alreadyApplied=applicable.every(ds=>{const s=sd[ds];const cand=candFor(ds);return s?.status==="work"&&s.start===cand.start&&s.end===cand.end;});
    editingRef.current=true;
    dirtyRef.current=true;
    setSd(p=>{
      const n={...p};
      applicable.forEach(ds=>{
        const cand=candFor(ds);
        n[ds]=stripUndef(alreadyApplied?{...n[ds],status:"holiday",start:undefined,end:undefined}:{...n[ds],status:"work",start:cand.start,end:cand.end});
      });
      return n;
    });
    tt_(alreadyApplied?`↺ ${{through:"通し",lunch:"ランチ",dinner:"ディナー"}[type]}を全日程「休み」に戻しました`:`✓ ${{through:"通し",lunch:"ランチ",dinner:"ディナー"}[type]}を全日程に反映しました`);
  };

  const submit=async()=>{
    if(submittingRef.current)return; // 連打・二重発火防止（stateの反映を待たず同期チェック）
    submittingRef.current=true;
    // 出勤>退勤バリデーション（HH:MMゼロ埋め文字列なので文字列比較でよい。25:00〜27:00形式も正しく比較される）
    const badDate=dates.find(d=>sd[d]?.status==="work"&&sd[d].start&&sd[d].end&&sd[d].start>=sd[d].end);
    if(badDate){
      const bd=pd(badDate);
      tt_(`▲ 退勤が出勤より前の日があります（${bd.getMonth()+1}/${bd.getDate()}）`);
      submittingRef.current=false;setSending(false);setConf(false);
      return;
    }
    const staffName=name.trim();
    // 既存subを検索（同じperiod+名前 → 上書き）
    const existSub=subs.find(s=>s.staffName===staffName&&s.periodId===apid);
    // source:"grid" は管理者がシフト作成タブのセルに直接下書きして生まれたsubで、スタッフの提出ではない
    // （バグチェック#56で導入した印）。これを「前回の提出」として扱うと、スタッフの初回提出なのに
    // submittedAt が管理者の入力時刻のまま残り、isUpdated と日ごとの changed マークまで立つ（#58）。
    // レコード自体（id・管理者フィールド）は引き継ぎ先として使うが、「前回提出」としては数えない。
    // ここで source を新subに引き継がないのは意図的で、提出後は実際の提出として数えられるようにする。
    const isFirstSubmission=!existSub||existSub.source==="grid";
    // 再提出時: 日付ごとに旧シフトと比較し、変更があれば changed:true を付与。
    // 管理者調整値(adjustedXxx)は旧シフトから引き継ぐ。
    const buildShift=d=>{
      let nw={...(sd[d]||{status:"holiday"})};
      delete nw.changed; // 過去のchangedは作り直す
      if(existSub){
        const old=existSub.shifts?.[d];
        if(old){
          // 管理者フィールド（休み希望・「締」の追加出勤・管理者調整値）はここで引き継ぐ。
          // sd は端末にCookieが無いと初期値のままなので（別端末からの再提出・リセット後の再提出）、
          // 引き継がないと管理者が作り込んだ休み希望・追加出勤が黙って消える（バグチェック#51）。
          // 引き継ぎは初回提出（管理者の下書きのみ）でも行う。消してよい値ではないため。
          nw=carryAdminShiftFields(nw,old);
          // changed は status 復元後の最終形で判定する（引き継ぎで元と同じ状態に戻った日を
          // 「変更あり」と誤表示しないため）
          if(!isFirstSubmission){
            const changed=(old.status!==nw.status)||((old.start||"")!==(nw.start||""))||((old.end||"")!==(nw.end||""));
            if(changed)nw.changed=true;
          }
        }
      }
      return stripUndef(nw); // Firebaseはundefinedを含むオブジェクトのset()で例外を投げるため最終防御として除去
    };
    const sub={
      id:existSub?existSub.id:genSecureId(24), // Date.now()は同時提出でID衝突するためランダムIDを使用
      periodId:apid,
      staffName,
      submittedAt:isFirstSubmission?new Date().toISOString():existSub.submittedAt,
      ...(isFirstSubmission?{}:{updatedAt:new Date().toISOString(),isUpdated:true}),
      shifts:Object.fromEntries(dates.map(d=>[d,buildShift(d)])),
      comment:comment.trim()
    };
    setSending(true);
    try{
      await onSub(sub);
    }catch(e){
      submittingRef.current=false;
      setSending(false);
      tt_("△ 通信エラー：提出できませんでした。もう一度お試しください");
      return;
    }
    submittingRef.current=false;
    setSending(false);
    // スタッフ名をCookieに保存（1年間）
    if(shopId&&apid) setCookie(ckStaffKey(shopId,apid),staffName,365);
    editingRef.current=false;
    dirtyRef.current=false;
    ph("shift_submitted",{period_id:apid,is_update:!isFirstSubmission,work_days:Object.values(sd).filter(s=>s?.status==="work").length});
    setConf(false);setDone(true);
  };

  const p0=dates[0]?`${pd(dates[0]).getMonth()+1}/${pd(dates[0]).getDate()}`:"";
  const pe=dates[dates.length-1]?`${pd(dates[dates.length-1]).getMonth()+1}/${pd(dates[dates.length-1]).getDate()}`:"";
  const wk=dates.filter(d=>sd[d]?.status==="work").length;

  // スタッフ名候補（登録名 + 別名）
  const staffAliases=settings?.staffAliases||{};
  const allSuggests=useMemo(()=>buildSuggestList(staffList.filter(n=>!isSpacer(n)),staffAliases),[staffList,staffAliases]);
  const filteredSuggests=ni
    ?allSuggests.filter(s=>s.display.includes(ni)||s.registered.includes(ni))
    :allSuggests;

  // クリック外で候補を閉じる
  useEffect(()=>{
    const h=e=>{if(nameWrapRef.current&&!nameWrapRef.current.contains(e.target))setShowSuggest(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);

  if(done)return(
    <div style={{background:"var(--c-bg)",minHeight:"calc(100vh - 44px)"}}>
      <StaffHdr ap={ap} p0={p0} pe={pe} nd={dates.length} subs={subs} apid={apid} onSm={()=>setSm(true)} shopName={shopName}/>
      {sm&&<SmModal subs={subs} periods={periods} apid={apid} onClose={()=>setSm(false)} staffList={staffList} plan={plan} staffAliases={staffAliases} onDeleteSub={onDeleteSub} onEditSub={sub=>{onSub({...sub,updatedAt:new Date().toISOString(),isUpdated:true}).catch(()=>tt_("△ 通信エラー：保存できませんでした"));}} onEditByName={sub=>{editingRef.current=true;setName(sub.staffName);const init={};const ds2=ap?gd(ap.startDate,ap.endDate):[];ds2.forEach(d=>{init[d]=(sub.shifts||{})[d]||{status:"holiday"};});setSd(init);setComment(sub.comment||"");setConf(false);setDone(false);}}/>}
      <div style={{maxWidth:560,margin:"0 auto",padding:"50px 20px",textAlign:"center"}}>
        <div style={{fontSize:68,animation:"bI .5s"}}>✓</div>
        <div style={{fontSize:22,fontWeight:700,color:"var(--c-accent)",marginTop:14,marginBottom:8}}>提出完了！</div>
        <div style={{background:"#FEF0E8",border:"1px solid #FDDCC7",borderRadius:12,padding:"14px 20px",marginBottom:24,fontSize:14,lineHeight:1.9,display:"inline-block",textAlign:"left"}}>
          <strong style={{color:"var(--c-accent)"}}>{ap?.label}</strong><br/>
          {ap?.startDate?.replace(/-/g,"/")} 〜 {ap?.endDate?.replace(/-/g,"/")}<br/>
          出勤予定：<strong style={{color:"var(--c-accent)"}}>{wk}日</strong>　休み：{dates.length-wk}日
          {comment&&<><br/>コメント：{comment}</>}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={()=>{editingRef.current=true;setDone(false);setConf(false);setSm(false);}} style={{padding:"11px 22px",background:"var(--c-card)",border:"2px solid var(--c-accent)",borderRadius:8,color:"var(--c-accent)",fontSize:14,fontWeight:700,cursor:"pointer"}}>修正する</button>
          <button onClick={reset} style={{padding:"11px 22px",background:"var(--c-bg)",border:"2px solid var(--c-border)",borderRadius:8,color:"var(--c-text3)",fontSize:14,fontWeight:700,cursor:"pointer"}}>↺ 最初から</button>
        </div>
      </div>
    </div>
  );

  return(
    <div style={{background:"var(--c-bg)",minHeight:"calc(100vh - 44px)"}}>
      <StaffHdr ap={ap} p0={p0} pe={pe} nd={dates.length} subs={subs} apid={apid} onSm={()=>setSm(true)} shopName={shopName}/>
      {sm&&<SmModal subs={subs} periods={periods} apid={apid} onClose={()=>setSm(false)} staffList={staffList} plan={plan} staffAliases={staffAliases} onDeleteSub={onDeleteSub} onEditSub={sub=>{onSub({...sub,updatedAt:new Date().toISOString(),isUpdated:true}).catch(()=>tt_("△ 通信エラー：保存できませんでした"));}} onEditByName={sub=>{editingRef.current=true;setName(sub.staffName);const init={};const ds2=ap?gd(ap.startDate,ap.endDate):[];ds2.forEach(d=>{init[d]=(sub.shifts||{})[d]||{status:"holiday"};});setSd(init);setComment(sub.comment||"");setConf(false);setDone(false);}}/>}
      <div style={{maxWidth:560,margin:"0 auto",padding:"14px 12px 120px"}}>
        {ap?.deadlineDate&&<div style={{background:dl?"#FFF0F1":"#FFFBEB",border:`1px solid ${dl?"#FF4757":"#FCD34D"}`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13,fontWeight:700,color:dl?"#FF4757":"#92400E"}}>{dl?`▲ 締切日（${ap.deadlineDate.replace(/-/g,"/")}）を過ぎています（提出・修正は可能です）`:`締切日：${ap.deadlineDate.replace(/-/g,"/")}`}</div>}

        {/* 名前カード */}
        <div style={{background:"var(--c-card)",borderRadius:12,boxShadow:"0 1px 4px var(--c-shadow)",marginBottom:14,padding:"16px 18px",display:"flex",alignItems:"center",gap:14}}>
          <div style={{flex:1,minWidth:0}} ref={nameWrapRef}>
            {editN?(
              <div style={{position:"relative"}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <input ref={nr} value={ni} onChange={e=>{setNi(e.target.value);setShowSuggest(true);}}
                    onKeyDown={e=>{
                      if(e.key==="Enter"){
                        if(ni.trim()){const resolved=resolveAlias(ni.trim(),staffAliases);dirtyRef.current=true;setName(resolved);}
                        setEditN(false);setShowSuggest(false);
                      }
                      if(e.key==="Escape"){setEditN(false);setShowSuggest(false);}
                    }}
                    onFocus={()=>setShowSuggest(true)}
                    placeholder="お名前を入力" maxLength={50}
                    style={{flex:1,padding:"10px 12px",fontSize:18,fontWeight:700,background:"var(--c-bg)",border:"2px solid var(--c-accent)",borderRadius:8,outline:"none",color:"var(--c-text)",minWidth:0}}/>
                  <button onClick={()=>{
                    if(ni.trim()){const resolved=resolveAlias(ni.trim(),staffAliases);dirtyRef.current=true;setName(resolved);}
                    setEditN(false);setShowSuggest(false);
                  }} style={{padding:"10px 16px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:14,fontWeight:700,cursor:"pointer",flexShrink:0}}>確定</button>
                </div>
                {showSuggest&&filteredSuggests.length>0&&(
                  <div className="name-suggest">
                    {filteredSuggests.map((s,i)=>(
                      <div key={i} className="name-suggest-item" onMouseDown={e=>{e.preventDefault();dirtyRef.current=true;setName(s.registered);setNi(s.registered);setEditN(false);setShowSuggest(false);}}
                        style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                        <span>{s.display}</span>
                        {s.isAlias&&<span style={{fontSize:11,color:"var(--c-accent)",background:"rgba(248,112,54,.1)",padding:"1px 6px",borderRadius:4,flexShrink:0}}>→ {s.registered}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ):name?(
              <div onClick={()=>{setNi(name);setEditN(true);setTimeout(()=>nr.current?.focus(),50);}} style={{cursor:"pointer"}}>
                <div style={{fontSize:10,fontWeight:700,color:"var(--c-text3)",marginBottom:2,letterSpacing:".05em"}}>名前（タップで変更）</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:22,fontWeight:900,color:"var(--c-text)",lineHeight:1}}>{name}</span>
                  <span style={{fontSize:12,color:"var(--c-text3)",background:"var(--c-bg)",padding:"2px 8px",borderRadius:4}}>✎ 変更</span>
                </div>
              </div>
            ):(
              <div onClick={()=>{setNi("");setEditN(true);setTimeout(()=>{nr.current?.focus();setShowSuggest(true);},50);}} style={{cursor:"pointer",padding:"4px 0"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--c-text3)",marginBottom:4}}>お名前を入力してください（必須）</div>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"var(--c-bg)",borderRadius:8,border:"2px dashed var(--c-border)"}}>
                  <span style={{fontSize:16,color:"var(--c-text4)"}}>例）山田 太郎</span>
                  <span style={{marginLeft:"auto",fontSize:12,color:"var(--c-accent)",fontWeight:700}}>タップして入力 →</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 全日程一括入力 */}
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[["through","通し"],["lunch","ランチ"],["dinner","ディナー"]].map(([k,l])=>(
            <button key={k} onClick={()=>bulkFill(k)}
              style={{flex:1,padding:"10px 0",background:"rgba(248,112,54,.1)",border:"1.5px solid #FDDCC7",borderRadius:8,color:"var(--c-accent)",fontSize:13,fontWeight:700,cursor:"pointer"}}>
              全日程「{l}」
            </button>
          ))}
        </div>

        {/* 日付カード */}
        {dates.map(ds=>{
          const d=pd(ds),m=d.getMonth()+1,day=d.getDate(),dow=d.getDay(),wd=WD[dow];
          const st=sd[ds]||{status:"holiday"},iw=st.status==="work",iS=dow===6,iSu=dow===0||isHoliday(ds);
          const cds=gc(ds).filter(c=>!c.closed);
          const dayIsClosed=gc(ds).some(c=>c.closed); // 休業日チェック
          return(
            <div key={ds} className="dc" style={{background:dayIsClosed?"rgba(255,71,87,.05)":"var(--c-card)",borderRadius:12,boxShadow:"0 1px 4px var(--c-shadow)",marginBottom:10,border:`2px solid ${dayIsClosed?"rgba(255,71,87,.3)":iw?"#FDDCC7":"var(--c-border)"}`,opacity:iw?1:.82}}>
              <div style={{padding:"11px 15px 9px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--c-card)"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:17,fontWeight:700,color:"var(--c-text)"}}>{m}/{day}</span>
                  <span style={{fontSize:13,fontWeight:700,padding:"2px 8px",borderRadius:4,background:iS?"#EFF6FF":iSu?"#FFF0F1":"var(--c-input)",color:iS?"#3B82F6":iSu?"#FF4757":"var(--c-text3)"}}>{wd}{isHoliday(ds)?"祝":""}</span>
                  {dayIsClosed&&<span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,background:"rgba(255,71,87,.1)",color:"#FF4757"}}>× 休業日</span>}
                </div>
                <span style={{fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:12,background:dayIsClosed?"rgba(255,71,87,.1)":iw?"#FEF0E8":"var(--c-input)",color:dayIsClosed?"#FF4757":iw?"#d4601a":"var(--c-text3)"}}>{dayIsClosed?"休業":iw?"出勤":"休み"}</span>
              </div>
              {dayIsClosed
                ?<div style={{padding:"8px 15px 12px"}}></div>
                :<div style={{display:"flex",gap:8,padding:"0 15px 10px"}}>
                {[["work","出勤"],["holiday","休み"]].map(([v,l])=>{
                  const a=st.status===v,iW=v==="work";
                  return(<div key={v} onClick={()=>upd(ds,{status:v,start:iW?(st.start||cds[0]?.start||"18:00"):undefined,end:iW?(st.end||cds[0]?.end||"23:00"):undefined})}
                    style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 0",borderRadius:8,cursor:"pointer",border:`2px solid ${a?(iW?"var(--c-accent)":"var(--c-danger)"):"var(--c-border)"}`,background:a?(iW?"var(--c-accent)":"var(--c-danger)"):"var(--c-input)",color:a?"#fff":"var(--c-text3)",fontSize:14,fontWeight:a?700:600,transition:"all .15s"}}>
                    <div style={{width:15,height:15,borderRadius:"50%",border:"2px solid currentColor",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{a&&<div style={{width:7,height:7,borderRadius:"50%",background:"currentColor"}}/>}</div>{l}
                  </div>);
                })}
              </div>}
              {!dayIsClosed&&iw&&(
                <div style={{padding:"0 15px 13px"}}>
                  {cds.length>0&&<div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:"var(--c-text3)",marginBottom:5}}>候補から選択</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {cds.map((c,i)=>{const sel=st.start===c.start&&st.end===c.end;return(
                        <button key={i} className="cb" onClick={()=>upd(ds,{start:c.start,end:c.end})}
                          style={{padding:"6px 11px",fontSize:13,fontWeight:700,background:sel?"var(--c-accent)":"rgba(248,112,54,.1)",color:sel?"white":"var(--c-accent)",border:`1.5px solid ${sel?"var(--c-accent)":"#FDDCC7"}`,borderRadius:8,whiteSpace:"nowrap",cursor:"pointer"}}>
                          {c.start}〜{c.end}
                        </button>
                      );})}
                    </div>
                  </div>}
                  <div style={{display:"flex",gap:8}}>
                    {[["start","出勤"],["end","退勤"]].map(([f,l])=>{
                      const base=f==="start"?TO_START:TO;
                      const opts=st[f]&&!base.includes(st[f])?[...base,st[f]].sort():base;
                      return(
                      <div key={f} style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--c-text3)",marginBottom:4}}>{l}</div>
                        {/* 矢印は data URI 内のSVGのため CSS変数が使えない。ライト/ダーク両方の背景で
                            非テキストコントラスト3:1を満たす中間グレー(#7E8899)を固定値で使う */}
                        <select value={st[f]||"18:00"} onChange={e=>upd(ds,{[f]:e.target.value})}
                          style={{width:"100%",padding:"9px 28px 9px 10px",fontSize:16,fontWeight:600,background:`var(--c-input) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%237E8899' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 8px center`,border:"2px solid var(--c-border)",borderRadius:8,color:"var(--c-text)",outline:"none",cursor:"pointer",appearance:"none",WebkitAppearance:"none"}}>
                          {opts.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!iw&&<div style={{padding:"0 15px 13px",fontSize:13,color:"var(--c-text3)",fontWeight:500}}>お休み</div>}
            </div>
          );
        })}

        {/* コメント欄 */}
        <div style={{background:"var(--c-card)",borderRadius:12,boxShadow:"0 1px 4px var(--c-shadow)",marginBottom:10,overflow:"hidden"}}>
          <div style={{padding:"12px 16px 10px",borderBottom:"1px solid var(--c-border)",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14,fontWeight:700,color:"var(--c-text)"}}>コメント・備考（任意）</span>
          </div>
          <div style={{padding:"14px 16px"}}>
            <textarea value={comment} onChange={e=>{dirtyRef.current=true;setComment(e.target.value);}} maxLength={500}
              placeholder="休み希望の理由、変動できる日、その他連絡事項など"
              style={{width:"100%",minHeight:80,padding:"10px 12px",fontSize:16,color:"var(--c-text)",background:"var(--c-bg)",border:"2px solid var(--c-border)",borderRadius:8,outline:"none",resize:"vertical",lineHeight:1.6,fontFamily:"inherit"}}
              onFocus={e=>e.target.style.borderColor="var(--c-accent)"} onBlur={e=>e.target.style.borderColor="var(--c-border)"}></textarea>
          </div>
        </div>
      </div>

      {/* 送信ボタン */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"var(--c-bg)",backdropFilter:"blur(10px)",padding:"10px 14px 16px",boxShadow:"0 -4px 20px rgba(0,0,0,.08)",zIndex:40}}>
        <div style={{maxWidth:560,margin:"0 auto",display:"flex",gap:8}}>
          <button onClick={reset} style={{padding:"13px 14px",background:"var(--c-card)",border:"2px solid var(--c-border)",borderRadius:8,color:"var(--c-text3)",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>↺ リセット</button>
          <button onClick={()=>{if(!name.trim()){tt_("▲ 名前を入力してください");return;}setConf(true);}}
            style={{flex:1,padding:13,background:"var(--c-accent)",color:"white",border:"none",borderRadius:8,fontSize:16,fontWeight:700,boxShadow:"0 4px 16px rgba(248,112,54,.35)",cursor:"pointer"}}>
            シフトを提出する
          </button>
        </div>
      </div>

      {/* 確認モーダル */}
      {conf&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fI .2s"}}>
        <div style={{background:"var(--c-card)",borderRadius:12,width:"100%",maxWidth:340,padding:"26px 22px 20px",boxShadow:"0 8px 32px rgba(0,0,0,.14)",animation:"sI .2s"}}>
          <div style={{fontSize:17,fontWeight:700,textAlign:"center",marginBottom:8}}>シフトを提出しますか？</div>
          <div style={{background:"var(--c-bg)",borderRadius:8,padding:"11px 13px",marginBottom:18,fontSize:13,lineHeight:1.9,color:"var(--c-text3)"}}>
            <strong style={{color:"var(--c-text)"}}>氏名</strong>：{name}<br/>
            <strong style={{color:"var(--c-text)"}}>期間</strong>：{ap?.label}<br/>
            <strong style={{color:"var(--c-text)"}}>出勤</strong>：{dates.filter(d=>sd[d]?.status==="work").length}日　<strong style={{color:"var(--c-text)"}}>休み</strong>：{dates.filter(d=>sd[d]?.status==="holiday").length}日
            {comment&&<><br/><strong style={{color:"var(--c-text)"}}>コメント</strong>：{comment}</>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button disabled={sending} onClick={()=>setConf(false)} style={{flex:1,padding:12,background:"var(--c-bg)",border:"none",borderRadius:8,fontSize:14,fontWeight:600,color:"var(--c-text3)",cursor:sending?"default":"pointer",opacity:sending?.5:1}}>キャンセル</button>
            <button disabled={sending} onClick={submit} style={{flex:2,padding:12,background:"var(--c-accent)",border:"none",borderRadius:8,fontSize:14,fontWeight:700,color:"white",cursor:sending?"default":"pointer",opacity:sending?.7:1}}>{sending?"送信中...":"提出する"}</button>
          </div>
        </div>
      </div>}
      {toast&&<div style={{position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",background:"var(--c-card)",color:"var(--c-text)",padding:"10px 20px",borderRadius:12,fontSize:14,fontWeight:500,zIndex:500,whiteSpace:"nowrap",animation:"fI .3s",border:"1px solid var(--c-border2)",boxShadow:"0 4px 16px var(--c-shadow)"}}>{toast}</div>}
    </div>
  );
}

// ===== スタッフヘッダー =====
function StaffHdr({ap,p0,pe,nd,subs,apid,onSm,shopName}){
  // source:"grid"はシフト作成タブの管理者入力用sub（実際の提出ではない）なのでバッジ件数から除外する
  const submitted=subs.filter(s=>s.periodId===apid&&s.source!=="grid");
  return(
    <div style={{background:"var(--c-accent)",boxShadow:"0 2px 12px rgba(248,112,54,.25)",padding:"12px 14px"}}>
      <div style={{maxWidth:560,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
          <ShiftyIcon size={28}/>
          <div style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              {shopName&&<span style={{fontSize:11,background:"rgba(255,255,255,.25)",color:"white",padding:"1px 7px",borderRadius:8,fontWeight:700,whiteSpace:"nowrap"}}>{shopName}</span>}
              <div style={{fontSize:15,fontWeight:700,color:"white",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {ap?.label||"シフト希望提出"}
              </div>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.85)",marginTop:1}}>{p0} 〜 {pe}（{nd}日間）</div>
          </div>
        </div>
        <button onClick={onSm} style={{flexShrink:0,background:"rgba(255,255,255,.18)",border:"1px solid rgba(255,255,255,.4)",borderRadius:12,padding:"7px 14px",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
          提出状況
          <span style={{background:submitted.length>0?"white":"rgba(255,255,255,.3)",color:submitted.length>0?"var(--c-accent)":"white",borderRadius:12,padding:"1px 8px",fontSize:12,fontWeight:800}}>{submitted.length}</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// セル編集パネル（元の時間を正しく初期表示）
// ============================================================
function CellEditPanel({sub,s,d,onApply,onClose}){
  const[status,setStatus]=useState(s.status||"holiday");
  const[start,setStart]=useState(s.start||"18:00");
  const[end,setEnd]=useState(s.end||"23:00");
  // statusが変わったとき出勤→即時適用
  const handleStatus=v=>{
    setStatus(v);
    if(v==="holiday")onApply(v,start,end);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fI .2s"}} onClick={onClose}>
      <div style={{background:"var(--c-card)",borderRadius:12,width:"100%",maxWidth:320,padding:"20px",animation:"sI .2s"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)",marginBottom:4}}>{sub?.staffName}</div>
        <div style={{fontSize:13,color:"var(--c-text3)",marginBottom:14}}>{d.getMonth()+1}/{d.getDate()}（{WD[d.getDay()]}）</div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[["work","出勤"],["holiday","休み"]].map(([v,l])=>(
            <button key={v} onClick={()=>handleStatus(v)}
              style={{flex:1,padding:"10px 0",border:`2px solid ${status===v?(v==="work"?"var(--c-accent)":"var(--c-danger)"):"var(--c-border)"}`,borderRadius:8,background:status===v?(v==="work"?"var(--c-accent)":"var(--c-danger)"):"var(--c-input)",color:status===v?"#fff":"var(--c-text3)",fontWeight:700,fontSize:14,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        {status==="work"&&<>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[["start","出勤時間"],["end","退勤時間"]].map(([f,l])=>(
              <div key={f} style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--c-text3)",marginBottom:4}}>{l}</div>
                <select value={f==="start"?start:end} onChange={e=>f==="start"?setStart(e.target.value):setEnd(e.target.value)}
                  style={{width:"100%",padding:"9px 10px",fontSize:16,fontWeight:700,background:"var(--c-input)",border:"2px solid var(--c-border)",borderRadius:8,color:"var(--c-text)",outline:"none",cursor:"pointer"}}>
                  {TO.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button onClick={()=>onApply(status,start,end)} style={{width:"100%",padding:"12px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:8}}>✓ 確定</button>
        </>}
        <button onClick={onClose} style={{width:"100%",padding:"10px",background:"var(--c-bg)",border:"none",borderRadius:8,color:"var(--c-text3)",fontSize:14,fontWeight:600,cursor:"pointer"}}>キャンセル</button>
      </div>
    </div>
  );
}

// ============================================================
// 提出状況モーダル（全画面・名前固定・横スクロール）
// ============================================================
function SmModal({subs,periods,apid,onClose,staffList,onEditSub,onEditByName,onDeleteSub,plan="free",staffAliases={}}){
  const period=periods.find(p=>p.id===apid);
  // source:"grid"はシフト作成タブが未提出スタッフのセルに直接作成した管理者入力用のsub（実際の提出ではない）。
  // スタッフ向けの提出状況一覧には表示しない（app-admin.jsのSubsTabと同じ除外基準）。
  const submitted=subs.filter(s=>s.periodId===apid&&s.source!=="grid");
  const dates=period?gd(period.startDate,period.endDate):[];
  const[editTarget,setEditTarget]=useState(null);
  // 別名照合: 提出名が登録名そのもの、または登録名の別名配列に含まれれば「提出済み」とみなす（提出一覧タブ/Excel出力と同じ照合）。
  const notSubmitted=staffList.filter(n=>!isSpacer(n)&&!submitted.some(s=>s.staffName===n||(staffAliases[n]||[]).includes(s.staffName)));
  const NW=88,CW=86,COMMENT_W=150;
  const handleCellClick=(sub,ds)=>{if(!sub)return;setEditTarget({subId:sub.id,ds});};
  const applyCellEdit=(subId,ds,newStatus,newStart,newEnd)=>{
    const sub=submitted.find(s=>s.id===subId);if(!sub)return;
    // 既存フィールドを保持してマージ（adjustedStart/End等の管理者調整値・changedフラグを消さない）
    const next={...((sub.shifts||{})[ds]||{}),status:newStatus};
    // 休みにした日はスタッフ提出の start/end を残さない（StaffViewの日付カード:336・一括反映:138と同じ扱い）。
    // 残すと status は holiday なのに getStoredTime が時刻を返し、シフト作成グリッド・PDF・Excel・
    // ヒートマップだけがその日を出勤として表示・カウントする一方、勤務時間・出勤日数は0のままになる
    // （＝画面内で矛盾する。バグチェック#55）。CellEditPanelは休み側でも選択中の時刻をそのまま渡してくる。
    // 管理者フィールド（adjustedXxx・adminRest・extraStart等）はここでは触らない（#51の引き継ぎ対象）。
    if(newStatus==="work"){next.start=newStart;next.end=newEnd;}
    else{
      delete next.start;delete next.end;
      // 管理者が入れた実効出退勤（グリッドの調整値・「締」の追加出勤）も同じ理由で残さない。
      // 残すと status は holiday なのに getStoredTime（app-admin.js:514）が調整値を返し、
      // グリッド・PDF・Excel・ヒートマップ・休みカウントだけがその日を出勤として扱う一方、
      // 勤務時間・出勤日数は0のままになる（#55と同じ矛盾。バグチェック#57）。
      // 追加出勤フラグを残したまま status を holiday にするのは、carryAdminShiftFields
      // （app-utils.js:186）が宣言している「フラグがある日は status="work"」の不変条件にも反する。
      // メモ（adjustedXxxNote）と休み希望（adminRest）は休みの日でも表示・意味が成立するため残す。
      delete next.adjustedStart;delete next.adjustedEnd;
      delete next.adjustedStartFixed;delete next.adjustedEndFixed;
      delete next.extraStart;delete next.extraEnd;
    }
    const shifts={...(sub.shifts||{}),[ds]:next};
    onEditSub({...sub,shifts});
    setEditTarget(null);
  };
  // 名前クリック→ホーム画面で修正
  const handleNameClick=(sub)=>{
    if(onEditByName)onEditByName(sub);
    onClose();
  };
  // 名前列と日付列の縦スクロール同期用ref
  const nameColRef=useRef();
  const dataColRef=useRef();

  return(
    <div style={{position:"fixed",inset:0,background:"var(--c-card)",zIndex:300,display:"flex",flexDirection:"column",animation:"fI .2s"}}>
      <div style={{background:"var(--c-accent)",padding:"12px 16px",flexShrink:0,boxShadow:"0 2px 8px rgba(248,112,54,.3)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"white"}}>提出状況一覧</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.85)",marginTop:1}}>{period?.label}　提出済み {submitted.length}名</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.4)",borderRadius:"50%",width:36,height:36,color:"white",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
      </div>
      {submitted.length===0
        ?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--c-text3)",fontSize:15,flexDirection:"column",gap:12}}>
            <div>まだ提出者がいません</div>
            {notSubmitted.length>0&&<div style={{fontSize:13,color:"var(--c-text4)"}}>未提出：{notSubmitted.join("、")}</div>}
          </div>
        :<div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {/* 左固定：名前列 */}
          <div style={{width:NW,flexShrink:0,display:"flex",flexDirection:"column",borderRight:"2px solid var(--c-border)",zIndex:2,background:"var(--c-card)"}}>
            <div style={{height:52,flexShrink:0,borderBottom:"2px solid var(--c-border)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"var(--c-text3)",background:"var(--c-card)"}}>名前</div>
            <div ref={nameColRef} onScroll={e=>{if(dataColRef.current)dataColRef.current.scrollTop=e.currentTarget.scrollTop;}} style={{flex:1,overflowY:"scroll",overflowX:"hidden",scrollbarWidth:"none"}}>
              {submitted.map((sub,ri)=>(
                <div key={sub.id}
                  style={{height:72,borderBottom:"2px solid var(--c-border)",display:"flex",alignItems:"center",justifyContent:"center",padding:"4px 6px",background:ri%2===0?"var(--c-card)":"var(--c-input2)",flexShrink:0,flexDirection:"column",gap:4}}>
                  <div onClick={()=>handleNameClick(sub)} style={{textAlign:"center",cursor:"pointer",flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}
                    onMouseEnter={e=>e.currentTarget.style.opacity=".7"}
                    onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                    <div style={{fontSize:12,fontWeight:700,color:"var(--c-text)",wordBreak:"break-all",lineHeight:1.3}}>{resolveAlias(sub.staffName,staffAliases)}</div>
                    <div style={{fontSize:10,color:"var(--c-accent)",marginTop:2}}>✎ 修正</div>
                  </div>
                  {(plan==="pro"||plan==="premium")&&onDeleteSub&&(
                    <button onClick={e=>{e.stopPropagation();if(confirm(`「${resolveAlias(sub.staffName,staffAliases)}」の提出を削除しますか？`)){onDeleteSub(sub.id);}}}
                      style={{width:"100%",padding:"2px 4px",background:"rgba(255,71,87,.08)",border:"1px solid rgba(255,71,87,.2)",borderRadius:4,color:"#FF4757",fontSize:10,cursor:"pointer",fontWeight:600}}>
                      削除
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 右側：ヘッダー行 + データ行を同一スクロールコンテナに */}
          <div ref={dataColRef} onScroll={e=>{if(nameColRef.current)nameColRef.current.scrollTop=e.currentTarget.scrollTop;}} style={{flex:1,overflow:"auto"}}>
            {/* 日付ヘッダー行（sticky で上固定、横スクロールに追従） */}
            <div style={{display:"flex",position:"sticky",top:0,zIndex:5,background:"var(--c-card)",borderBottom:"2px solid var(--c-border)",minWidth:"fit-content"}}>
              {dates.map(ds=>{
                const d=pd(ds),m=d.getMonth()+1,day=d.getDate(),dow=d.getDay(),wd=WD[dow],iS=dow===6,iSu=dow===0||isHoliday(ds);
                return(
                  <div key={ds} style={{width:CW,flexShrink:0,textAlign:"center",height:52,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRight:"1px solid var(--c-border)",borderLeft:"1px solid var(--c-border)"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--c-text)"}}>{m}/{day}</div>
                    <div style={{fontSize:11,fontWeight:700,padding:"1px 6px",borderRadius:4,background:iS?"#EFF6FF":iSu?"#FFF0F1":"var(--c-input)",color:iS?"#3B82F6":iSu?"#FF4757":"var(--c-text3)",marginTop:2}}>{wd}{isHoliday(ds)?"祝":""}</div>
                  </div>
                );
              })}
              <div style={{width:COMMENT_W,flexShrink:0,height:52,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"var(--c-text3)",borderRight:"1px solid var(--c-border)",borderLeft:"1px solid var(--c-border)"}}>コメント</div>
            </div>
            {/* データ行（ヘッダーと同じスクロールで横移動） */}
            {submitted.map((sub,ri)=>(
              <div key={sub.id} style={{display:"flex",height:72,borderBottom:"2px solid var(--c-border)",flexShrink:0,minWidth:"fit-content",background:ri%2===0?"var(--c-card)":"var(--c-input2)"}}>
                {dates.map(ds=>{
                  const s=(sub.shifts||{})[ds]||null;
                  const iw=s&&s.status==="work";
                  const isEditing=editTarget&&editTarget.subId===sub.id&&editTarget.ds===ds;
                  return(
                    <div key={ds} onClick={()=>handleCellClick(sub,ds)}
                      style={{width:CW,flexShrink:0,height:72,padding:"4px",borderRight:"1px solid var(--c-border)",borderLeft:"1px solid var(--c-border)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,cursor:"pointer",background:isEditing?"#FEF0E8":"transparent"}}
                      onMouseEnter={e=>{if(!isEditing)e.currentTarget.style.background="#F0FFF4";}}
                      onMouseLeave={e=>{if(!isEditing)e.currentTarget.style.background="transparent";}}>
                      {iw?(<>
                        <div style={{fontSize:10,fontWeight:700,background:"#FEF0E8",color:"#d4601a",padding:"1px 5px",borderRadius:4,border:"1px solid #FDDCC7"}}>出勤</div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--c-text)",whiteSpace:"nowrap"}}>{s.start||"--:--"}</div>
                        <div style={{fontSize:9,color:"var(--c-text4)"}}>〜</div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--c-text)",whiteSpace:"nowrap"}}>{s.end||"--:--"}</div>
                      </>):null}
                    </div>
                  );
                })}
                <div style={{width:COMMENT_W,flexShrink:0,height:72,padding:"6px 8px",borderRight:"1px solid var(--c-border)",borderLeft:"1px solid var(--c-border)",display:"flex",alignItems:"center"}}>
                  <span style={{fontSize:11,color:"var(--c-text3)",lineHeight:1.4,wordBreak:"break-all",display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{sub.comment||""}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      }
      {editTarget&&(()=>{
        const sub=submitted.find(s=>s.id===editTarget.subId);
        const s=(sub?.shifts||{})[editTarget.ds]||{status:"holiday"};
        const d=pd(editTarget.ds);
        // 編集用state（元の時間を初期値として保持）
        return <CellEditPanel
          key={editTarget.subId+editTarget.ds}
          sub={sub} s={s} d={d}
          onApply={(status,start,end)=>applyCellEdit(editTarget.subId,editTarget.ds,status,start,end)}
          onClose={()=>setEditTarget(null)}
        />;
      })()}
      {notSubmitted.length>0&&<div style={{background:"var(--c-card)",borderTop:"1px solid var(--c-border)",padding:"10px 16px",flexShrink:0}}>
        <div style={{fontSize:12,fontWeight:700,color:"var(--c-text4)",marginBottom:6}}>未提出（{notSubmitted.length}名）</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {notSubmitted.map((n,i)=><span key={i} style={{fontSize:12,background:"#FFF0F1",color:"#FF4757",border:"1px solid rgba(255,71,87,.2)",padding:"3px 10px",borderRadius:12,fontWeight:600}}>{n}</span>)}
        </div>
      </div>}
    </div>
  );
}

// ============================================================
// 管理者画面
