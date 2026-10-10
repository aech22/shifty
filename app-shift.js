// ============================================================
// Shifty - シフト作成タブのコンポーネント（2026-09-30 に app-admin.js から2回目の分割）
// app-admin.js が約40万字になり、回帰 example-index-html-load.js の上限（40万字・Babel Standalone の
// 500KB 上限の手前）まで残り23字になったため、シフト作成タブ一式をそのまま移した:
//   LEGEND_COLORS / FIXED_ENTRY / FIXED_KEY / HDASH_IMG（セル色・固定シフトコマンド・斜線）、
//   HeatTable / SummaryTable / GridLegend（ヒートマップ・集計表・操作説明）、
//   ACT_DIFF_BG / ActualsGrid / ActualsCsvDialog（実績の入力と CSV 取り込み）、ShiftEditTab 本体
// index.html で app-admin.js の直後・app-company.js の前に読み込む。全ファイルが同じ
// グローバルスコープを共有し、描画は app-main.js の ReactDOM マウント時なので、
// AdminView（app-admin.js）と一括PDF（app-company.js）からここの ShiftEditTab を、
// expXl（app-admin.js）からここの FIXED_KEY を参照できる。
// ============================================================

// セル背景色はレジストリ（app-utils.js の CELL_COLOR_LEGEND）を単一ソースにする（グリッド描画とレジェンド表示で共用）
const LEGEND_COLORS=Object.fromEntries(CELL_COLOR_LEGEND.filter(c=>c.color).map(c=>[c.key,c.color]));
// 店舗限定固定シフトコマンド（現状「締」）のレジストリエントリ・キー文字。複数店舗限定コマンドが増えても
// 単一のkind:"fixed"想定のまま（現状1件のみ登録）
const FIXED_ENTRY=CELL_COMMANDS.find(c=>c.kind==="fixed")||null;
const FIXED_KEY=FIXED_ENTRY?FIXED_ENTRY.key:"";
// 休み希望セルの斜線（右上→左下・PDF出力のhatchと同じSVG方式）。#999はライト/ダーク両テーマで視認可、
// non-scaling-strokeでセルサイズに引き伸ばしても線幅一定。inputのbackgroundImageに敷き、色背景はbackgroundColorと2層で共存させる。
// **viewBox は必須**（2026-09-23）: width/height だけで viewBox を持たないSVGを背景画像として引き伸ばすと、
// WebKit（Safari）は non-scaling-stroke を効かせずセルの大きさに比例して線を太くする。実測（直交線幅・
// アンチエイリアス込み）では 36x22 のセルで Chromium 2.61px に対し WebKit 5.21px と約2倍になっていた。
// viewBox を付けると両エンジンとも同じ太さになる（同条件で 2.09px / 2.09px）。
const HDASH_IMG=`url("data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' preserveAspectRatio='none'><line x1='10' y1='0' x2='0' y2='10' stroke='#999' stroke-width='1' vector-effect='non-scaling-stroke'/></svg>")}")`;

// 確定とセルへの打鍵がこの時間止まったら、後回しにしていた重い計算（労務判定・合計・ヒートマップ）を始める（S3）
const CALC_IDLE_MS=300;
// 後回しの計算（S3）の途中であることを示す控えめな表示。見出しの横に置く文字と、表を薄くする style
const CALC_PENDING_DIM={opacity:0.55};
function CalcPendingNote(){
  return <span data-calc-pending="1" style={{fontSize:11,fontWeight:400,color:"var(--c-text3)"}}>計算中</span>;
}

// 時間帯別出勤人数（ヒートマップ）。ShiftEditTab の外（モジュールスコープ）で定義しコンポーネント型を固定する。
// ShiftEditTab内で定義すると親の再レンダー（セル選択等）のたびに新しい関数=新しい型になり、
// Reactが毎回このサブツリーをアンマウント→再マウントしてスクロール位置がリセットされてしまうため。
// fitHours を立てると **横スクロールを無くして全時間帯を幅いっぱいに割り付ける**
// （2026-09-23 ユーザー指示。通常表示・絞り込み表示のどちらでも、幅が足りる限りこちらを使う）。
// 立てるかどうかは呼び出し側が幅だけで決める（heatFitsIn）。px を計算せず table-layout:fixed に
// 割らせるので、横パネル（幅が containerLeft 依存）でもグリッド下（flex:1）でも同じ1本で効く。
// 渡さなければ従来どおり1列22pxの最小幅で、入りきらない分は横スクロールになる。
// pending（S3）: 後回しの計算の途中。表を薄くし、日付列の見出しを「計算中」にする（見出しの高さを変えないため文字だけ替える）
function HeatTable({label,section,maxC,rowH,theadH,sectionLabel,dates,heatHours,countHeat,hBg,scrollRef,onScroll,maxH,fitHours,fixedW,pending=false}){
  const BD="1px solid var(--c-border)",BD2="1px solid var(--c-border2)",CRD="var(--c-card)";
  const fmtDL=date=>{const d=pd(date);return`${d.getDate()}(${WD[d.getDay()]})`;};
  // maxH指定時（サイドパネル）: グリッドと同じ高さの縦スクロール領域にし、ヘッダーをsticky固定して日付行の位置を揃える
  return(
    <div ref={scrollRef} onScroll={onScroll} style={{overflowX:fitHours?"hidden":"auto",...(maxH?{overflowY:"auto",maxHeight:maxH}:{}),border:BD,borderRadius:8,...(fixedW?{flex:"0 0 auto",width:fixedW,minWidth:fixedW,maxWidth:fixedW}:{flex:rowH?undefined:1,minWidth:rowH?undefined:200}),...(pending?CALC_PENDING_DIM:{})}}>
      {label&&<div style={{fontSize:12,fontWeight:700,padding:"4px 8px",borderBottom:BD,color:"var(--c-text2)"}}>{label}</div>}
      <table style={{borderCollapse:"collapse",minWidth:fitHours?"unset":"max-content",width:fitHours?"100%":undefined,tableLayout:fitHours?"fixed":undefined}}>
        <thead><tr style={theadH?{height:theadH}:{}}>
          <th style={{position:"sticky",left:0,...(maxH?{top:0,zIndex:3}:{zIndex:2}),background:CRD,padding:"3px 6px",fontSize:10,fontWeight:600,borderBottom:BD2,minWidth:52,...(fitHours?{width:52,maxWidth:52,boxSizing:"border-box"}:{}),whiteSpace:"nowrap",verticalAlign:"bottom"}}>
            {sectionLabel&&<div style={{fontSize:10,fontWeight:700,color:"var(--c-text2)",marginBottom:4}}>{sectionLabel}</div>}
            {pending?<span data-calc-pending="1">計算中</span>:"日付"}
          </th>
          {heatHours.map(hr=><th key={hr} style={{minWidth:fitHours?0:22,boxSizing:fitHours?"border-box":undefined,padding:fitHours?"2px 0":"2px 1px",fontSize:fitHours?9:10,textAlign:"center",borderLeft:BD,borderBottom:BD2,background:CRD,fontWeight:500,verticalAlign:"bottom",...(maxH?{position:"sticky",top:0,zIndex:2}:{})}}>{hr}</th>)}
        </tr></thead>
        <tbody>{dates.map(date=>{
          const d=pd(date);const day=d.getDay();const isHol=isHoliday(date);
          const dc=(day===0||isHol)?"#e53935":day===6?"#1976d2":"var(--c-text)";
          return(<tr key={date} style={rowH?{height:rowH}:{}}>
            <td style={{position:"sticky",left:0,background:CRD,zIndex:1,padding:"2px 6px",fontSize:15,fontWeight:600,color:dc,borderBottom:BD,...(fitHours?{width:52,minWidth:52,maxWidth:52,boxSizing:"border-box",fontSize:13}:{}),whiteSpace:"nowrap",verticalAlign:"middle"}}>{fmtDL(date)}</td>
            {heatHours.map((hr,hi)=>{const n=countHeat(section,date,hr);return(
              <td key={hi} style={{minWidth:fitHours?0:22,boxSizing:fitHours?"border-box":undefined,padding:fitHours?"2px 0":"2px 1px",textAlign:"center",fontSize:fitHours?10:11,borderLeft:BD,borderBottom:BD,background:hBg(n,maxC),color:n===0?"var(--c-text4)":"var(--c-text)",fontWeight:n>0?600:400,verticalAlign:"middle"}}>{n||""}</td>
            );})}
          </tr>);
        })}</tbody>
      </table>
    </div>
  );
}

// 集計表：scrollRefを外から渡してスクロール同期、sticky背景を確実に塗る。
// HeatTable と同じ理由でモジュールスコープに固定（親の再レンダーで型が変わりスクロール位置がリセットされるのを防ぐ）。
// ラベル列の幅はメイングリッドの日付列と同じ labelW（通常表示・全表示とも45px）に詰める。
// fullView ではさらに右端に同幅の空列を足す。グリッドが [日付][スタッフ×n][日付] になるので、
// こちらも [ラベル][スタッフ×n][空] に揃えないとスタッフ列が横にずれる。
// **休みカウント表はスタッフ名のヘッダを持たず列位置だけで誰の数字かを示している**ので、
// ずれると読めなくなる。ラベルは45pxに入りきらないので省略記号＋title で全文を残す。
// pending（S3）: 後回しの計算の途中。見出しの横に「計算中」を出し、表を薄くする（数字は1つ前の確定の値）
function SummaryTable({title,titleRight=null,rowLabel,rows,scrollRef,onScroll,fitAll,mapGridCols,spacerTh,spacerCell,colW,VTH,labelW=45,fullView=false,tableW=null,pending=false}){
  const BD="1px solid var(--c-border)",BD2="1px solid var(--c-border2)",CRD="var(--c-card)";
  const fmtH4=min=>{if(!min)return"";const h=Math.floor(min/60);const m=min%60;if(h>=100)return String(h);return m===0?String(h):`${h}:${String(m).padStart(2,"0")}`;};
  return(
    <div style={{marginBottom:16}}>
      {/* titleRight は見出しの右隣に置くボタン用のスロット（労務判定の「過去データ読込」）。
          渡されないときは従来どおり見出しだけを描く。 */}
      <div style={{fontSize:13,fontWeight:600,marginBottom:6,color:"var(--c-text2)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span>{title}</span>{pending&&<CalcPendingNote/>}{titleRight}
      </div>
      <div ref={scrollRef} onScroll={onScroll} style={{overflowX:fitAll?"hidden":"auto",border:BD,borderRadius:8,...(fullView?{width:"fit-content",marginLeft:"auto",marginRight:"auto"}:{}),...(pending?CALC_PENDING_DIM:{})}}>
        <table style={{borderCollapse:"collapse",width:fullView&&tableW?tableW:(fitAll?"100%":"unset"),minWidth:fitAll?"unset":"max-content"}}>
          <thead><tr>
            <th title={rowLabel} style={{boxSizing:"border-box",...(fullView?{}:{position:"sticky",left:0,zIndex:2}),background:CRD,padding:0,fontSize:11,fontWeight:600,borderBottom:BD2,width:labelW,minWidth:labelW,maxWidth:labelW}}><div style={{width:labelW,padding:"2px 2px",boxSizing:"border-box",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{rowLabel}</div></th>
            {mapGridCols(name=>VTH(name),spacerTh)}
            {fullView&&<th style={{background:CRD,padding:0,borderBottom:BD2,borderLeft:BD2,boxSizing:"border-box",width:labelW,minWidth:labelW,maxWidth:labelW}}></th>}
          </tr></thead>
          <tbody>{rows.map(row=>{
            const bg=row._bg||"transparent";const stickyBg=row._bg?`linear-gradient(${row._bg},${row._bg}),${CRD}`:CRD;
            return(<tr key={row.id} style={{background:bg}}>
              <td style={{boxSizing:"border-box",...(fullView?{}:{position:"sticky",left:0,zIndex:1}),background:stickyBg,padding:0,fontSize:11,fontWeight:row._bold?700:400,color:row._color||"var(--c-text2)",borderBottom:BD,width:labelW,minWidth:labelW,maxWidth:labelW}}><div title={row.label} style={{width:labelW,padding:"2px 2px",boxSizing:"border-box",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{row.label}</div></td>
              {mapGridCols(name=>{
                // getText を持つ行は文字セル（労務の目安・総括）。持たない行は従来どおり分→"H:MM"。
                if(row.getText){const t=row.getText(name)||{};return(
                  <td key={name} title={t.title||t.label||""} style={{width:colW,minWidth:colW,maxWidth:colW,boxSizing:"border-box",padding:"3px 1px",borderLeft:BD,borderBottom:BD,textAlign:"center",fontSize:10,lineHeight:1.25,background:t.bg||bg,fontWeight:t.bold?700:400,color:t.color||"var(--c-text2)",overflow:"hidden"}}>{t.label||""}</td>
                );}
                const min=row.getMin(name);
                // _violateFn は true／"over"（上限超過）か falsy を返す。目安は判定しない（2026-09-28）ので色は上限超過だけ。
                const vr=row._violateFn?row._violateFn(name,min):false;
                const vio=(vr===true||vr==="over")?"over":null;
                const cellBg=vio==="over"?"rgba(255,71,87,.15)":bg;
                const vioColor=vio==="over"?"#FF4757":null;
                return(
                <td key={name} style={{width:colW,minWidth:colW,maxWidth:colW,boxSizing:"border-box",padding:"3px 2px",borderLeft:BD,borderBottom:BD,textAlign:"center",fontSize:11,background:cellBg,fontWeight:(row._bold||vio)&&min>0?700:400,color:min>0?(vioColor||row._color||"var(--c-text2)"):"var(--c-text4)"}}>{min>0?fmtH4(min):""}</td>
              );},spacerCell)}
              {fullView&&<td style={{background:stickyBg,padding:0,borderBottom:BD,borderLeft:BD2,boxSizing:"border-box",width:labelW,minWidth:labelW,maxWidth:labelW}}></td>}
            </tr>);
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

// ===== シフト作成タブ =====
// ===== シフト作成タブ: 操作方法レジェンド =====
// 内容は app-utils.js の CELL_COMMANDS / CELL_COLOR_LEGEND から自動生成される。
// セルコマンドや色を追加するときはレジストリに登録するだけでここに反映される（このコンポーネントの個別編集は不要）。
// 企業連携の他店舗略称は abbrToShop（設定値）から動的生成。モジュールスコープで定義しコンポーネント型を固定する。
function GridLegend({abbrToShop,shopName}){
  const[open,setOpen]=useState(()=>lg("shifty_grid_legend_open",false)===true);
  const toggle=()=>setOpen(o=>{ls("shifty_grid_legend_open",!o);return!o;});
  const LBD="1px solid var(--c-border)";
  const swatch=(color,hatch)=>(
    <span style={{display:"inline-block",width:26,height:16,borderRadius:4,border:LBD,verticalAlign:"middle",background:color||"var(--c-input)",...(hatch?{backgroundImage:HDASH_IMG,backgroundRepeat:"no-repeat",backgroundSize:"100% 100%"}:{}),flexShrink:0}}/>
  );
  const chip=t=>(
    <code style={{display:"inline-block",padding:"1px 7px",borderRadius:4,border:LBD,background:"var(--c-input)",color:"var(--c-text)",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>{t}</code>
  );
  // 説明文の **…** は太字にする（文字列のまま出すと ** が画面に見える・2026-10-08）
  const rich=t=>String(t).split("**").map((x,i)=>i%2?<b key={i} style={{color:"var(--c-text)"}}>{x}</b>:x);
  const row=(key,left,desc)=>(
    <div key={key} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"3px 0"}}>
      <div style={{minWidth:120,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>{left}</div>
      <div style={{fontSize:12,color:"var(--c-text2)",lineHeight:1.55}}>{rich(desc)}</div>
    </div>
  );
  const SecH=({children})=>(<div style={{fontSize:12,fontWeight:700,color:"var(--c-text)",margin:"10px 0 3px"}}>{children}</div>);
  const lbl=t=>(<span style={{fontSize:12,fontWeight:700,color:"var(--c-text)"}}>{t}</span>);
  const abbrs=Object.entries(abbrToShop||{});
  return(
    <div style={{border:LBD,borderRadius:8,marginBottom:16,background:"var(--c-card)"}}>
      <button onClick={toggle} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:"transparent",border:"none",cursor:"pointer",color:"var(--c-text)",fontSize:13,fontWeight:700,textAlign:"left"}}>
        <span style={{display:"inline-block",transform:open?"rotate(90deg)":"none",transition:"transform .15s",fontSize:11}}>▶</span>
        操作方法（セル入力コマンド・色の意味）
      </button>
      {open&&<div style={{padding:"0 14px 12px"}}>
        <SecH>セルの色・記号</SecH>
        {CELL_COLOR_LEGEND.map(c=>row(c.key,swatch(c.color,c.hatch),`${c.label} — ${c.desc}`))}
        <SecH>セル内コマンド</SecH>
        {CELL_COMMANDS.filter(c=>c.kind!=="fixed"||isFixedShiftEligibleShop(shopName)).map(c=>row(c.key,<>{chip(c.usage)}{(c.color||c.hatch)?swatch(c.color,c.hatch):null}</>,`${c.label} — ${c.desc}`))}
        {row("free",chip("9○○"),"時間+任意の文字 — メモとしてそのまま表示（特記の黄色背景）")}
        <SecH>キー・マウス操作</SecH>
        {row("k1",chip("Enter"),"次のセルへ移動して確定（出勤→退勤→翌日の出勤）")}
        {row("k2",chip("Ctrl(⌘)+Enter"),"逆方向に移動して確定")}
        {row("k3",lbl("トリプルクリック"),"変更マーク（緑）のオン/オフ。スマホはトリプルタップ")}
        {row("k4",lbl("空にして確定"),"管理者入力を消去。スタッフ提出の休み希望があれば斜線が復元される")}
        {row("k5",lbl("セル選択"),"スタッフが提出した元の値をツールチップに表示")}
        <SecH>時間の入力（出勤・退勤セル）</SecH>
        {row("t1",chip("9"),"9:00（1〜2桁は「時」）")}
        {row("t2",chip("930"),"9:30（3〜4桁は「時分」）")}
        {row("t3",chip("9.5"),"9:30（小数は時+分の割合）")}
        {row("t4",chip("9:30"),"9:30（コロン区切りそのまま）")}
        {abbrs.length>0&&<React.Fragment>
          <SecH>企業連携ヘルプ（登録済み略称）</SecH>
          <div style={{fontSize:12,color:"var(--c-text2)",lineHeight:1.55,padding:"2px 0 4px"}}>
            時間+略称で他店舗ヘルプになる。出勤セルのみ=ランチ帯、退勤セルのみ=ディナー帯、両方=終日。ヘルプ帯は自店舗の時間帯別出勤人数から除外される。
          </div>
          {abbrs.map(([a,s])=>row("ab_"+a,chip("9"+a),`${s.name} へのヘルプ`))}
        </React.Fragment>}
      </div>}
    </div>
  );
}

// ===== 実績の入力（2026-09-30・P4・計画書 §3.6）=====
// シフト作成タブの「実績」切替で出す。確定済みの期間だけ（確定シフトが実績の初期値になるため）。
// セルには実績（無い日は確定シフト）を出し、確定シフトと違う日だけを shops/{sid}/actuals に保存して色を付ける。
// 出勤・退勤はセルで直接直し、休憩・欠勤・遅刻早退・法定休日・メモはセルを選ぶと出る欄で入れる。
// 確定ロック中でも書ける（actuals は subs と別ノードで、ルールもオーナーだけ）。
const ACT_DIFF_BG="rgba(248,112,54,.14)";
// 別名の無い店舗の staffAliases の既定値（S1・2026-10-04）。`||{}` を描画のたびに書くと毎回新しいオブジェクトになり、
// これを依存に持つ useCallback / useMemo（liveTotalFor・liveMonthOtFor → 労務判定）が1文字ごとに作り直される。
// 読むだけの値なので凍結して共有する
const NO_STAFF_ALIASES=Object.freeze({});
function ActualsGrid({period,dates,staff,subOf,settings,act,tt,subs}){
  const pid=period.id;
  const[edits,setEdits]=useState({});   // "名前|日付|start|end" → 入力中の文字列（blur で確定）
  const[sel,setSel]=useState(null);     // {name,date}
  const[form,setForm]=useState(null);   // 詳細欄の入力
  const[csvOpen,setCsvOpen]=useState(false);
  const busy=!act.loaded;
  const recOf=(n,d)=>actualOf(act.map,pid,n,d);
  const dayOf=(n,d)=>resolveActualDay(subOf(n),recOf(n,d),d,settings,n);
  const schedOf=(n,d)=>scheduledDay(subOf(n),d,settings,n);
  const fmtD=d=>{const x=pd(d);return`${x.getMonth()+1}/${x.getDate()}(${WD[x.getDay()]})`;};
  const clk=m=>m==null?"":minToClock(m);
  const cellValue=(n,d,f)=>{const r=dayOf(n,d);if(r.absent)return"";return clk(f==="start"?r.startMin:r.endMin);};
  const entryFromRec=rec=>({start:(rec&&rec.start)||"",end:(rec&&rec.end)||"",breakMin:rec&&rec.breakMin!=null?String(rec.breakMin):"",
    absent:!!(rec&&rec.absent),absentMin:rec&&rec.absentMin!=null?String(rec.absentMin):"",legalHoliday:!!(rec&&rec.legalHoliday),note:(rec&&rec.note)||""});
  const save=(n,d,entry,okMsg)=>{
    const r=planActualEdit({periodId:pid,name:n,date:d,entry,sub:subOf(n),settings});
    if(r.error){tt("▲ "+r.error);return false;}
    act.save(r.patch).then(()=>{if(okMsg)tt(okMsg);}).catch(()=>{});
    return true;
  };
  const openDetail=(n,d)=>{
    if(sel&&sel.name===n&&sel.date===d)return;
    const rec=recOf(n,d);const r=dayOf(n,d);
    setSel({name:n,date:d});
    setForm({...entryFromRec(rec),start:r.absent?"":clk(r.startMin),end:r.absent?"":clk(r.endMin)});
  };
  // セルの出勤・退勤の確定。空欄にすると確定シフトの値に戻す。欠勤の日に時刻を入れると欠勤を外す
  const commitCell=(n,d,f)=>{
    const k=`${n}|${d}|${f}`;
    if(!(k in edits))return;
    const v=String(edits[k]).trim();
    setEdits(p=>{const q={...p};delete q[k];return q;});
    if(v===cellValue(n,d,f))return;
    const e={...entryFromRec(recOf(n,d)),absent:false};
    e[f]=v;
    if(save(n,d,e)&&sel&&sel.name===n&&sel.date===d)setForm(fm=>fm&&{...fm,[f]:parseClockInput(v)||v,absent:false});
  };
  const submitForm=()=>{
    if(!sel||!form)return;
    if(save(sel.name,sel.date,form,"✓ 実績を保存しました")){setSel(null);setForm(null);}
  };
  const resetDay=()=>{
    if(!sel)return;
    if(save(sel.name,sel.date,null,"✓ 確定シフトに戻しました")){setSel(null);setForm(null);}
  };
  const diffCount=Object.values((act.map&&act.map[pid])||{}).reduce((a,m)=>a+(m&&typeof m==="object"?Object.keys(m).length:0),0);
  const sumOf=n=>dates.reduce((a,d)=>{const r=dayOf(n,d);a.act+=r.workMin;a.sch+=r.scheduledWorkMin;return a;},{act:0,sch:0});
  // 詳細欄の見込み（保存前）
  const preview=(()=>{
    if(!sel||!form)return null;
    const pl=planActualEdit({periodId:pid,name:sel.name,date:sel.date,entry:form,sub:subOf(sel.name),settings});
    if(pl.error)return{error:pl.error};
    return{day:resolveActualDay(subOf(sel.name),pl.record,sel.date,settings,sel.name)};
  })();
  const selSched=sel?schedOf(sel.name,sel.date):null;
  const autoBreak=(()=>{
    if(!sel||!form)return null;
    const pl=planActualEdit({periodId:pid,name:sel.name,date:sel.date,entry:{...form,breakMin:""},sub:subOf(sel.name),settings});
    return pl.error?null:resolveActualDay(subOf(sel.name),pl.record,sel.date,settings,sel.name).breakMin;
  })();
  const BDc="1px solid var(--c-border)";
  const thS={padding:"4px 6px",borderBottom:BDc,borderRight:BDc,background:"var(--c-card)",fontSize:12,fontWeight:700,color:"var(--c-text2)",whiteSpace:"nowrap"};
  const lbl={fontSize:12,color:"var(--c-text3)",display:"flex",flexDirection:"column",gap:2};
  const inS={...AI,width:96,padding:"6px 8px"};
  return(
    <div data-actuals="1">
      <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap",marginBottom:8}}>
        <span style={{fontSize:14,fontWeight:700}}>実績</span>
        <span style={{fontSize:12,color:"var(--c-text3)"}}>確定シフトを初期値に出しています。予定と違う日だけが保存され、色が付きます（空欄にすると予定に戻ります）。</span>
        <span data-actuals-count={diffCount} style={{fontSize:12,color:"var(--c-text2)"}}>予定と違う日 {diffCount}件</span>
        <span style={{flex:1}}/>
        <button data-actuals-csv-open="1" disabled={busy} onClick={()=>setCsvOpen(true)} style={{...AGray,padding:"5px 12px",fontSize:12}}>CSV取込</button>
      </div>
      {busy&&<div style={{fontSize:12,color:"var(--c-text3)",marginBottom:8}}>実績を読み込み中です…</div>}
      {sel&&form&&(
        <div data-actuals-detail={`${sel.name}|${sel.date}`} style={{border:"1px solid var(--c-border2)",borderRadius:8,padding:"10px 12px",marginBottom:10,background:"var(--c-card)"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap",marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:700}}>{sel.name} {fmtD(sel.date)}</span>
            <span data-actuals-sched="1" style={{fontSize:12,color:"var(--c-text3)"}}>
              予定: {selSched.startMin!=null?`${clk(selSched.startMin)}〜${clk(selSched.endMin)}・休憩${selSched.breakMin}分`:"なし（休み）"}
              {selSched.extraMin>0?`・締 ${selSched.segments.filter(s=>s.extra).map(s=>clk(s.startMin)+"〜"+clk(s.endMin)).join("")}（出勤・退勤とは別に数えます）`:""}
              ・実働{fmtMin(selSched.workMin)}
            </span>
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
            <label style={lbl}>出勤<input data-actuals-f-start="1" value={form.start} disabled={form.absent} onChange={e=>setForm({...form,start:e.target.value})} placeholder="9:30" style={inS}/></label>
            <label style={lbl}>退勤<input data-actuals-f-end="1" value={form.end} disabled={form.absent} onChange={e=>setForm({...form,end:e.target.value})} placeholder="25:00" style={inS}/></label>
            <label style={lbl}>休憩（分）<input data-actuals-f-break="1" value={form.breakMin} disabled={form.absent} inputMode="numeric" onChange={e=>setForm({...form,breakMin:e.target.value})}
              placeholder={autoBreak!=null?`自動 ${autoBreak}`:"自動"} style={inS}/></label>
            <label style={lbl}>遅刻・早退（分）<input data-actuals-f-absentmin="1" value={form.absentMin} inputMode="numeric" onChange={e=>setForm({...form,absentMin:e.target.value})} placeholder="0" style={inS}/></label>
            <label style={{...lbl,flexDirection:"row",alignItems:"center",gap:6,fontSize:13,color:"var(--c-text2)",minHeight:40}}>
              <input data-actuals-f-absent="1" type="checkbox" checked={form.absent} onChange={e=>setForm({...form,absent:e.target.checked})} style={{width:18,height:18}}/>欠勤</label>
            <label style={{...lbl,flexDirection:"row",alignItems:"center",gap:6,fontSize:13,color:"var(--c-text2)",minHeight:40}}>
              <input data-actuals-f-legal="1" type="checkbox" checked={form.legalHoliday} disabled={form.absent} onChange={e=>setForm({...form,legalHoliday:e.target.checked})} style={{width:18,height:18}}/>法定休日の労働</label>
            <label style={{...lbl,flex:"1 1 180px"}}>メモ<input data-actuals-f-note="1" value={form.note} maxLength={ACTUAL_NOTE_MAX} onChange={e=>setForm({...form,note:e.target.value})} style={{...AI,padding:"6px 8px"}}/></label>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:10}}>
            <button data-actuals-save="1" onClick={submitForm} style={{...AB,padding:"6px 14px",fontSize:13}}>保存</button>
            <button data-actuals-reset="1" onClick={resetDay} style={{...AGray,padding:"6px 12px",fontSize:13}}>予定に戻す</button>
            <button onClick={()=>{setSel(null);setForm(null);}} style={{...AGray,padding:"6px 12px",fontSize:13}}>閉じる</button>
            <span data-actuals-preview="1" style={{fontSize:12,color:preview&&preview.error?"var(--c-danger)":"var(--c-text2)"}}>
              {preview&&(preview.error?preview.error:preview.day.absent?`欠勤（不就労 ${fmtMin(preview.day.absentMin)}）`
                :`実働 ${fmtMin(preview.day.workMin)}（予定との差 ${fmtSignedMin(preview.day.workMin-preview.day.scheduledWorkMin)}）`)}
            </span>
          </div>
        </div>
      )}
      <div style={{overflow:"auto",maxHeight:"70vh",border:BDc,borderRadius:8}}>
        <table style={{borderCollapse:"collapse",minWidth:"max-content"}}>
          <thead>
            <tr>
              <th rowSpan={2} style={{...thS,position:"sticky",left:0,top:0,zIndex:3}}>日付</th>
              {staff.map(n=><th key={n} colSpan={2} style={{...thS,position:"sticky",top:0,zIndex:2,textAlign:"center"}}>{n}</th>)}
            </tr>
            <tr>
              {staff.map(n=><React.Fragment key={n}>
                <th style={{...thS,position:"sticky",top:25,zIndex:2,fontWeight:500,fontSize:11}}>出勤</th>
                <th style={{...thS,position:"sticky",top:25,zIndex:2,fontWeight:500,fontSize:11}}>退勤</th>
              </React.Fragment>)}
            </tr>
          </thead>
          <tbody>
            {dates.map(d=>{
              const dow=pd(d).getDay();const red=dow===0||isHoliday(d);
              return(
                <tr key={d}>
                  <td style={{...thS,position:"sticky",left:0,zIndex:1,fontWeight:600,color:red?"#DC2626":dow===6?"#1D4ED8":"var(--c-text2)"}}>{fmtD(d)}</td>
                  {staff.map(n=>{
                    const rec=recOf(n,d);const r=dayOf(n,d);
                    const isSel=!!(sel&&sel.name===n&&sel.date===d);
                    const title=[rec?"予定と違う日":"予定どおり",r.absent?`欠勤（不就労 ${fmtMin(r.absentMin)}）`:`実働 ${fmtMin(r.workMin)}・休憩${r.breakMin}分`,
                      r.absentMin&&!r.absent?`遅刻・早退 ${r.absentMin}分`:"",r.isLegalHoliday?"法定休日の労働":"",r.note?`メモ: ${r.note}`:""].filter(Boolean).join("／");
                    return(<React.Fragment key={n}>{["start","end"].map(f=>{
                      const k=`${n}|${d}|${f}`;
                      return(
                        <td key={f} data-actual-td={k} data-actual-diff={rec?"1":"0"} title={title}
                          style={{borderBottom:BDc,borderRight:f==="end"?BDc:"none",padding:0,position:"relative",
                            background:rec?ACT_DIFF_BG:"transparent",outline:isSel?"2px solid var(--c-accent)":"none",outlineOffset:-2}}>
                          <input data-actual-cell={k} value={k in edits?edits[k]:cellValue(n,d,f)} readOnly={busy}
                            placeholder={r.absent&&f==="start"?"欠勤":""}
                            onFocus={()=>openDetail(n,d)} onChange={e=>setEdits(p=>({...p,[k]:e.target.value}))}
                            onBlur={()=>commitCell(n,d,f)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}
                            style={{width:62,padding:"5px 2px",border:"none",background:"transparent",color:"var(--c-text)",fontSize:16,
                              fontWeight:rec?700:400,textAlign:"center",outline:"none"}}/>
                          {f==="end"&&(r.isLegalHoliday||r.note)&&<span aria-hidden="true" style={{position:"absolute",top:1,right:2,fontSize:9,color:"var(--c-text3)",pointerEvents:"none"}}>{r.isLegalHoliday?"法":"＊"}</span>}
                        </td>
                      );
                    })}</React.Fragment>);
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{...thS,position:"sticky",left:0,bottom:0,zIndex:2}}>実働計</td>
              {staff.map(n=>{const s=sumOf(n);return(
                <td key={n} colSpan={2} data-actual-sum={n} style={{...thS,position:"sticky",bottom:0,zIndex:1,textAlign:"center",fontWeight:700}}>
                  {fmtMin(s.act)}<div style={{fontSize:10,fontWeight:400,color:"var(--c-text3)"}}>予定 {fmtMin(s.sch)}</div>
                </td>);})}
            </tr>
          </tfoot>
        </table>
      </div>
      {csvOpen&&<ActualsCsvDialog period={period} staff={staff} subs={subs} settings={settings} act={act} tt={tt} onClose={()=>setCsvOpen(false)}/>}
    </div>
  );
}
// 実績の CSV 取込（P4 後半）。打刻機の形式が決まっていないので列の位置を選べるようにし、店舗設定に覚える。
// 取り込む先は選択中の期間だけで、名前は別名解決を通す。取り込めない行は理由つきで一覧に出す
function ActualsCsvDialog({period,staff,subs,settings,act,tt,onClose}){
  const[text,setText]=useState("");
  const[enc,setEnc]=useState("Shift_JIS");
  const[mp,setMp]=useState(()=>act.csvMapping||DEFAULT_ACTUALS_CSV_MAPPING);
  const plan=useMemo(()=>text.trim()?planActualsImport({text,mapping:mp,period,staffList:staff,subs,settings,actuals:act.map}):null,[text,mp,period,staff,subs,settings,act.map]);
  const readFile=f=>{
    if(!f)return;
    const fr=new FileReader();
    fr.onload=()=>setText(String(fr.result||""));
    fr.onerror=()=>tt("▲ ファイルを読めませんでした");
    fr.readAsText(f,enc);
  };
  const doImport=()=>{
    if(!plan||!plan.applied)return;
    if(!confirm(`${plan.applied}件の実績を取り込みますか？\n同じ人・同じ日に入っている実績の出勤・退勤・休憩は上書きされます。`))return;
    act.save(plan.patch).then(()=>{
      tt(`✓ ${plan.applied}件の実績を取り込みました`);
      const cur=act.csvMapping||DEFAULT_ACTUALS_CSV_MAPPING;
      if(act.saveCsvMapping&&JSON.stringify(cur)!==JSON.stringify(mp))act.saveCsvMapping(mp);
      onClose();
    }).catch(()=>{});
  };
  const bad=plan?plan.rows.filter(r=>!r.ok):[];
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9998,padding:16}}>
      <div data-actuals-csv="1" onClick={e=>e.stopPropagation()} style={{background:"var(--c-card)",borderRadius:12,padding:"20px 18px",width:"100%",maxWidth:560,maxHeight:"90vh",overflow:"auto",boxShadow:"0 8px 32px var(--c-shadow)"}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>実績のCSV取込</div>
        <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:12}}>{period.label||`${period.startDate}〜${period.endDate}`}に取り込みます。1行＝1人1日（日付・名前・出勤・退勤・休憩）。名前は別名でも登録名に寄せます。</div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:8}}>
          <input data-actuals-csv-file="1" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={e=>readFile(e.target.files&&e.target.files[0])} style={{fontSize:16}}/>
          <select value={enc} onChange={e=>setEnc(e.target.value)} style={{fontSize:16,padding:"4px 8px",border:"1px solid var(--c-border2)",borderRadius:4,background:"var(--c-input)",color:"var(--c-text)"}}>
            <option value="Shift_JIS">Shift_JIS（Excel の既定）</option>
            <option value="UTF-8">UTF-8</option>
          </select>
        </div>
        <textarea data-actuals-csv-text="1" value={text} onChange={e=>setText(e.target.value)} rows={6} placeholder={"日付,名前,出勤,退勤,休憩\n2026-11-02,田中,9:58,18:05,60"}
          style={{...AI,fontFamily:"monospace",resize:"vertical",marginBottom:10}}/>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
          {ACTUALS_CSV_FIELDS.map(f=>(
            <label key={f} style={{fontSize:12,color:"var(--c-text3)",display:"flex",flexDirection:"column",gap:2}}>{ACTUALS_CSV_FIELD_LABELS[f]}の列
              <input data-actuals-csv-col={f} type="number" min={0} max={50} inputMode="numeric" value={mp[f]} onChange={e=>setMp({...mp,[f]:Math.max(0,Math.min(50,Number(e.target.value)||0))})}
                style={{...AI,width:72,padding:"5px 6px"}}/></label>
          ))}
          <label style={{fontSize:13,color:"var(--c-text2)",display:"flex",alignItems:"center",gap:6,minHeight:40}}>
            <input data-actuals-csv-header="1" type="checkbox" checked={mp.hasHeader} onChange={e=>setMp({...mp,hasHeader:e.target.checked})} style={{width:18,height:18}}/>1行目は見出し</label>
        </div>
        <div style={{fontSize:11,color:"var(--c-text3)",marginBottom:10}}>列は左から 1, 2, 3…。0 は使わない列（休憩を 0 にすると休憩は自動）。</div>
        {plan&&<div data-actuals-csv-summary={`${plan.applied}/${bad.length}`} style={{fontSize:13,marginBottom:6}}>取り込める行 {plan.applied}件・取り込めない行 {bad.length}件</div>}
        {bad.length>0&&<div style={{fontSize:12,color:"var(--c-text2)",lineHeight:1.7,maxHeight:140,overflow:"auto",marginBottom:10}}>
          {bad.slice(0,50).map(r=><div key={r.line}>{r.line}行目: {r.name||"（名前なし）"} {r.date||""} — {r.reason}</div>)}
          {bad.length>50&&<div>ほか{bad.length-50}行</div>}
        </div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{...AGray,padding:"8px 14px",fontSize:13}}>キャンセル</button>
          <button data-actuals-csv-import="1" disabled={!plan||!plan.applied} onClick={doImport} style={{...AB,padding:"8px 14px",fontSize:13,opacity:plan&&plan.applied?1:0.5}}>取り込む</button>
        </div>
      </div>
    </div>
  );
}

// ===== シフト作成グリッドのセル（S2・2026-10-04）=====
// 選択と1文字入力では**このセルだけ**を描き直す。入力中の文字（draft）とフォーカスの状態はセルの中に持ち、
// 親（ShiftEditTab）へは確定（blur・Enter）のときだけ api.commit で伝える。入力中の値は api.draft で親の ref にも置き、
// flushEdits・PDF・Excel から見えるようにする。
// **props はプリミティブか安定した参照だけにする**（memo が効かなくなる）。関数は親の api（useMemo([]) で1回だけ
// 作った転送役）だけを渡し、毎回作るクロージャ・style オブジェクトは渡さない。base は親が useMemo で固定した AI2。
// 親が渡す値はすべて「フォーカスしていないとき」の見え方（idleVal・col・color・hFont）。フォーカス中の見え方は
// 以前 focusKey で切り替えていたものをここで作る: 背景色は付けない（斜線だけ残す）・文字色は既定・
// 混在の日（自店＋ヘルプ）の合成表示は自店の値（editVal）に切り替える（ヘルプ先だけの日＝hKeep は合成表示のまま）。
const cellBgStyleOf=(col,dash)=>{
  const layers=[];
  if(dash)layers.push(HDASH_IMG);
  if(col)layers.push(`linear-gradient(${col},${col})`);
  // 色が付くセルだけ不透明ベースを敷く＝下の曜日色・不足色を完全に隠す（fill 方式・ShiftEditTab の cellBgCol のコメント）
  const st={backgroundColor:col?"var(--c-card)":"transparent"};
  if(layers.length){st.backgroundImage=layers.join(",");st.backgroundRepeat="no-repeat";st.backgroundSize="100% 100%";}
  return st;
};
// セルの入力の上限。打った文字のうちコマンド以外はメモ（adjustedStartNote / adjustedEndNote）になり、
// ルール（database.rules.json）がメモを200字までに制限している。超えると saveSubs の1回の update ごと拒否され、
// 同じ回の他の人のセルも保存されない（画面は保存できたように見える）ので、入力の時点で止める
const SHIFT_CELL_MAX_LEN=200;
const ShiftCell=React.memo(function ShiftCell({name,date,field,idleVal,editVal,col,dash,color,hFont,hLh,hKeep,hDay,title,readOnly,isPremium,canEdit,locked,base,cursor,prevDate,nextDate,resetKey,api}){
  const[focused,setFocused]=useState(false);
  const[draft,setDraft]=useState(null);
  // 店舗の切り替え・選択中の期間の消失（親の discardEdits）で入力中の文字を捨てる。初回は何もしない
  const resetSeen=useRef(resetKey);
  useEffect(()=>{if(resetSeen.current===resetKey)return;resetSeen.current=resetKey;setDraft(null);setFocused(false);},[resetKey]);
  const key=`${name}|${date}|${field}`;
  const value=draft!=null?draft:(focused&&editVal!==undefined?editVal:idleVal);
  const showHelper=hFont!=null&&(!focused||hKeep);
  const style=useMemo(()=>{
    const st={...base,background:undefined,...cellBgStyleOf(focused?null:col,dash),color:(focused?undefined:color)||base.color,opacity:isPremium?1:0.55,cursor};
    if(showHelper){st.fontSize=hFont;st.whiteSpace="nowrap";st.overflow="hidden";if(hLh)st.lineHeight=hLh;if(hDay)st.cursor="default";}
    return st;
  },[base,focused,col,dash,color,isPremium,cursor,showHelper,hFont,hLh,hDay]);
  return(
    <input type="text" inputMode="text" value={value} placeholder="--"
      maxLength={SHIFT_CELL_MAX_LEN}
      title={title}
      data-helper={showHelper?"1":undefined}
      readOnly={readOnly}
      data-sc={`${date}|${field}`} data-scn={name}
      onChange={e=>{if(!isPremium||locked)return;const v=e.target.value;setDraft(v);api.draft(key,v);}}
      // 変更マークのトリプルクリック／トリプルタップは、ヘルプ先だけの日（hDay・読み取り専用）のセルでも効かせる。
      // マークは自店の提出（subs）の changed で、ヘルプの合成表示とは別物。以前は hDay で止めていたため、
      // 緑が付いたままヘルプ表示に変わったセルのマークを外せなかった（2026-10-10 本番で報告）
      onClick={e=>{if(!isPremium){api.upgrade();return;}if(canEdit&&e.detail===3)api.triple(name,date);}}
      onTouchEnd={()=>{if(!canEdit)return;api.tripleTap(name,date);}}
      onFocus={e=>{if(!isPremium){e.target.blur();api.upgrade();return;}setFocused(true);api.tip(name,date,field,e.target.getBoundingClientRect());}}
      onBlur={e=>{api.commit(name,date,field,e.target.value);api.hideTip();setFocused(false);setDraft(null);api.draft(key,null);}}
      // 日本語IME変換確定のEnter(isComposing/keyCode229)はセル確定・フォーカス移動として扱わない。
      // 除外しないと変換確定のEnterで即座に次セルへ移動し、IMEの確定処理がそのまま次セルに入って
      // 手打ちしていないセルにも同じ文字（例:「締」）が入ってしまう
      onKeyDown={e=>{
        if(e.key!=="Enter"||e.nativeEvent.isComposing||e.keyCode===229)return;
        e.preventDefault();
        api.commit(name,date,field,e.target.value);
        // 出勤→同じ日の退勤→次の日の出勤の順に進む。Ctrl/Cmd+Enter は逆向き
        const back=e.ctrlKey||e.metaKey;
        const to=field==="start"?(back?(prevDate?`${prevDate}|end`:""):`${date}|end`):(back?`${date}|start`:(nextDate?`${nextDate}|start`:""));
        if(to)document.querySelector(`[data-sc="${to}"][data-scn="${CSS.escape(name)}"]`)?.focus();
      }}
      style={style}/>
  );
});
// セルを選んだときの「提出値」ツールチップ。表全体を描き直さないよう、自分の state だけで出し入れする
// （親はセルの api.tip / api.hideTip から setRef.current を呼ぶだけ）
const CellTip=React.memo(function CellTip({setRef}){
  const[tip,setTip]=useState(null);
  React.useLayoutEffect(()=>{setRef.current=setTip;return()=>{if(setRef.current===setTip)setRef.current=null;};},[setRef]);
  if(!tip)return null;
  return <div style={{position:"fixed",left:tip.x,top:tip.y-26,transform:"translateX(-50%)",background:"rgba(30,30,30,0.82)",color:"#fff",fontSize:11,fontWeight:600,padding:"2px 7px",borderRadius:8,pointerEvents:"none",zIndex:9999,whiteSpace:"nowrap",backdropFilter:"blur(4px)"}}>{tip.value}</div>;
});

// staffList/settings を props 名のまま受けないのは、このタブだけが「選択中の期間が終了済みなら
// その期間の写し(period.snapshot)を使う」＝他タブと違う値で動くため。以降の本文が参照する
// staffList/settings は解決後の値で、写しの更新にだけ生の staffListProp/settingsProp を使う。
function ShiftEditTab({subs,periods,staffList:staffListProp,onSave,tt,settings:settingsProp,plan,shopId,shopName,onUpgrade,allLinkedShops=[],onLoadPastSubs,pastSubsLoaded=false,savePeriods,ownerReadOnly=false,companyLink=null,companyInfo=null,laborMonths:lm=LABOR_MONTHS_OFF,actuals:act=ACTUALS_OFF,initialPeriodId="",exportJob=null}){
  // 直近3ヶ月より古い期間があり、まだ過去分未読なら「過去参照」ボタンを出す（古い期間のシフトを見るため）
  const hasOlderPeriods=periods.some(p=>p&&p.startDate&&p.startDate<subsWindowCutoff());
  const firstPid=(periods[0]||{}).id||"";
  // initialPeriodId は企業連携タブの一括PDF（非表示マウント）が対象期間を指定するために使う
  const[selPid,setSelPid]=useState(initialPeriodId||firstPid);
  // localEdits は**確定した**セルの表示用バッファ（blur 後も保存の反映まで残す）。入力中の文字はセル（ShiftCell）の
  // 中にあり、ここには確定のときだけ入る（S2）。flushEdits が blur の直後に同期的に読めるよう ref にも同じ値を置く
  // （更新は必ず updLocalEdits を通す）。入力中の文字は draftRef（{key,value}）にセルが置く。
  const[localEdits,setLocalEdits]=useState({});
  const localEditsRef=useRef(localEdits);
  const updLocalEdits=fn=>{const next=fn(localEditsRef.current);if(next===localEditsRef.current)return;localEditsRef.current=next;setLocalEdits(next);};
  const draftRef=useRef(null);
  // 確定済み＋入力中の値（入力中のセルが無ければ localEdits と同じ参照）
  const editsNow=()=>{const d=draftRef.current;const le=localEditsRef.current;return d&&d.key?{...le,[d.key]:d.value}:le;};
  const[heatEdits,setHeatEdits]=useState({}); // blur確定値のみ（集計・ヒートマップ用）
  // ===== 確定後の重い計算を後回しにする（S3・2026-10-04）=====
  // 労務判定・週の休み・ヒートマップ・合計・重複/ポジション/時刻の判定は、subs と heatEdits の**後回しにした値**
  // （useDeferredValue）を依存に持つ。確定するとまず今の値でセルの表示とカーソル移動だけを描き（このとき重い useMemo は
  // 依存が変わらないので前の結果を返す）、重い計算は React が手の空いたときに後回しの値で描き直す。
  // **重い useMemo の依存に subs / heatEdits / それらから毎回作る値を直接入れない**（入れると確定の描画で計算が走る）。
  // 計算の中身は今の値を読む関数のままでよい（後回しの描画では今の値＝後回しの値になる）。
  // calcPending の間は「計算中」を出し、外へ書くもの（laborTotals・PDF・Excel・確定・非表示マウントの報告）は待たせる。
  // **続けて入力している間は計算の入力を進めない**: 確定とセルへの打鍵が CALC_IDLE_MS 止まってから calcIn を進め、
  // それを useDeferredValue に通す。useDeferredValue だけだと確定のたびに重い計算が1回ずつ走り（5セルで5回）、
  // 遅い端末では計算中に打った次の文字が待たされる（2026-10-04 の計測）
  const[calcIn,setCalcIn]=useState(()=>({subs,heatEdits}));
  const calcLatestRef=useRef(null);calcLatestRef.current={subs,heatEdits};
  const calcTimerRef=useRef(null);
  const scheduleCalc=useCallback(()=>{
    clearTimeout(calcTimerRef.current);
    calcTimerRef.current=setTimeout(()=>{
      calcTimerRef.current=null;
      const l=calcLatestRef.current;
      setCalcIn(cur=>(cur.subs===l.subs&&cur.heatEdits===l.heatEdits)?cur:{subs:l.subs,heatEdits:l.heatEdits});
    },CALC_IDLE_MS);
  },[]);
  useEffect(()=>{if(calcIn.subs!==subs||calcIn.heatEdits!==heatEdits)scheduleCalc();},[subs,heatEdits]);
  useEffect(()=>()=>clearTimeout(calcTimerRef.current),[]);
  const subsCalc=React.useDeferredValue(calcIn.subs);
  const heatEditsCalc=React.useDeferredValue(calcIn.heatEdits);
  const calcPending=subsCalc!==subs||heatEditsCalc!==heatEdits;
  // セルの入力中の文字を捨てる合図（ShiftCell が resetKey の変化で draft とフォーカス表示を消す）
  const[cellResetKey,setCellResetKey]=useState(0);
  // localEdits/heatEdits とセルの入力中の文字をまとめて捨てる（店舗切替・期間切替・選択中の期間の消失）
  const discardEdits=()=>{updLocalEdits(()=>({}));setHeatEdits({});draftRef.current=null;setCellResetKey(k=>k+1);};
  const[fitAll,setFitAll]=useState(false);
  const[deptFilter,setDeptFilter]=useState("all"); // "all"|"kit"|"hall" — キッチン/ホール絞り込み表示
  const[pdfModal,setPdfModal]=useState(false);
  const[pdfBusy,setPdfBusy]=useState(false);
  const[containerW,setContainerW]=useState(800);
  const[containerLeft,setContainerLeft]=useState(0);
  const outerRef=useRef(null);
  const mainScrollRef=useRef(null);
  const periodScrollRef=useRef(null);
  const laborScrollRef=useRef(null);
  const weekRestScrollRef=useRef(null);
  const weekScrollRef=useRef(null);
  const restScrollRef=useRef(null);
  const gridBodyRef=useRef(null);
  const gridTheadRef=useRef(null);
  const[measuredRowH,setMeasuredRowH]=useState(null);
  const[measuredTheadH,setMeasuredTheadH]=useState(null);
  // 全表示（DEV限定）で縦を1画面に収めるための、グリッド上端のページ内オフセット。
  // **行高・フォントの計算結果はここへ戻らない**ので measuredRowH と違い再計測ループにならない
  // （グリッドの上端は自分の高さではなく上に積まれた要素だけで決まる）。
  const[gridTop,setGridTop]=useState(null);
  // 通常表示のときの中央カラム幅。全表示・絞り込み中はグリッドだけを画面幅いっぱいに広げ、
  // 不足情報・ヒートマップ・操作方法は**この幅のまま**据え置く（2026-09-23 ユーザー指示）。
  const[normalW,setNormalW]=useState(null);
  // 中央カラムの画面上の左端。全表示・絞り込みで親の位置が変わる（fitsCentered の中央寄せ・
  // 横パネル・スクロールバー）ので、**式で当てずに実測する**。出力（ブロックの幅）はこの値に
  // 依存しないので測り直しのループにならない。
  const centerColRef=useRef(null);
  const[centerColLeft,setCenterColLeft]=useState(null);

  const isPremium=plan==="premium";

  // 店舗切替（ヘッダーの店舗ドロップダウン）はタブを離脱しないためこのコンポーネントはアンマウントされない。
  // localEdits/heatEditsはスタッフ名をキーに持つバッファのため、リセットしないと前の店舗で入力中/確定済みの
  // 値が新しい店舗のグリッドに残存表示され、保存操作(handleBlur/handleSaveAll)で同名スタッフ（複数店舗在籍者）
  // の別店舗データへ誤って書き込まれる。shopId変更時に必ずクリアする。
  useEffect(()=>{discardEdits();},[shopId]);

  // 企業連携の他店舗データ（略称・提出シフト）。ヘルプ判定・重複チェックに使用
  const[companyData,setCompanyData]=useState({}); // {shopId:{name,abbrs:[],workMap:Map(name|date→shift)}}
  // 他店舗の読み込みが終わったか。一括PDF（exportJob）は終わってから書き出す（ヘルプ先勤務の合算・P3.6 が入った値で出す）
  const[companyDataReady,setCompanyDataReady]=useState(false);
  // 見に行く他店舗は 企業の写しの連携店舗 ∪ allLinkedShops。管理コード（Cookie）で入った端末は
  // allLinkedShops を持たないので、写しを見ないと所属店舗を設定できても重複エラーが出ない（バグチェック#150）。
  // 依存を id の文字列にするのは、写しの syncedAt が変わるたびに他店舗を読み直さないため。
  const otherShopsKey=(()=>{
    const m=new Map();
    (allLinkedShops||[]).forEach(s=>{if(s&&s.id&&s.id!==shopId)m.set(s.id,s.name||s.id);});
    Object.entries((companyLink&&companyLink.shops)||{}).forEach(([id,nm])=>{if(id&&id!==shopId&&!m.has(id))m.set(id,nm||id);});
    return JSON.stringify([...m.entries()]);
  })();
  useEffect(()=>{
    const otherShops=JSON.parse(otherShopsKey).map(([id,name])=>({id,name}));
    if(!firebaseDB||otherShops.length===0){setCompanyData({});setCompanyDataReady(true);return;}
    setCompanyDataReady(false);
    let cancelled=false;
    // 他店の読みは、この端末がその店舗を読める理由（同じ企業の店舗の管理者＝readers の o）を先に登録する（2026-10-08）
    Promise.all(otherShops.map(os=>shopReadReady(os.id).catch(()=>false).then(()=>
      Promise.all([
        // 設定は丸ごと読む（略称・別名・所属店舗に加え、ヘルプ先勤務の合算（P3.6）が行き先の店の休憩・退勤延長で
        // 実働を数えるため）。どれも auth != null で読める
        firebaseDB.ref(`shops/${os.id}/settings`).once("value").catch(()=>null),
        firebaseDB.ref(`shops/${os.id}/subs`).once("value").catch(()=>null),
        // 所属店舗による同一人物の判定（dupTargetShopsFor）に使う名簿
        firebaseDB.ref(`shops/${os.id}/staff`).once("value").catch(()=>null),
        // 行き先の店の期間（確定・終了済みの日は写しの設定で数える＝行き先の画面と同じ実働・P3.6）
        firebaseDB.ref(`shops/${os.id}/periods`).once("value").catch(()=>null),
        // 実績（P5）はオーナーだけ読める。拒否は loadFailed に数えない
        firebaseDB.ref(`shops/${os.id}/actuals`).once("value").then(s=>({ok:true,v:s.val()})).catch(()=>({ok:false})),
      ]).then(([seS,sS,stS,peS,acR])=>{
        // 形の組み立ては otherShopDataOf（app-utils.js）に一本化（企業の確定の集計も同じ関数で読む）。
        // 別名で提出された sub は他店舗自身の staffAliases で登録名へ解決してからキーにする（参照側の dupErrors が
        // 自店舗の登録名で引いたときに外れないように）。休み希望のセルは勤務時間なし＝両方揃ったシフトに負ける。
        // 読めなかった店舗を「データが無い」と区別できるよう印を残す（丸めて黙る箇所を増やさない。
        // 倒す向きの判断は BACKLOG「読みの失敗を『問題なし』に丸めている3箇所」のまま）
        return[os.id,otherShopDataOf({name:os.name,settings:seS&&seS.val(),subs:sS&&sS.val(),staff:stS&&stS.val(),periods:peS&&peS.val(),
          loadFailed:!seS||!sS||!stS||!peS,actuals:acR&&acR.ok?(acR.v||{}):undefined,actualsUnread:!(acR&&acR.ok)})];
      }))
    )).then(entries=>{if(!cancelled){setCompanyData(Object.fromEntries(entries));setCompanyDataReady(true);}});
    return()=>{cancelled=true;};
    // selPidは依存に入れない: この取得は期間に依存しない（workMapは名前|日付キーで全期間を保持し、
    // 参照側のdupErrors/heatDataが自分のselPid依存で再計算する）。依存に入れると期間ドロップダウンを
    // 切り替えるたびに連携店舗ぶんの shops/{id}/subs を毎回まるごと再取得してしまう（期間の絞り込みが
    // 効かない全件読みのため、店舗数×蓄積データに比例して増える）。
  },[shopId,otherShopsKey]);
  // 略称→他店舗の逆引き
  const abbrToShop=useMemo(()=>{
    const m={};
    Object.entries(companyData).forEach(([id,d])=>(d.abbrs||[]).forEach(a=>{if(a&&!m[a])m[a]={id,name:d.name};}));
    return m;
  },[companyData]);

  // periodsが非同期ロード後に届いた場合、selPidが""のままなら先頭に補正。
  // 選択中の期間が他端末・他セッションで削除されたときもここへ来て別の期間へ移る。その場合は
  // 期間ドロップダウン・店舗切替と同じく localEdits/heatEdits を必ずクリアする。
  // 両者は `名前|日付|フィールド` キーのバッファで期間を持たないため、残したまま「保存」を押すと
  // handleSaveAll が現在の selPid（＝移った先の期間）に対して applyEditToSubs を再適用し、
  // 消えた期間の日付が別の期間のsubへ書き込まれる（グリッドは期間内の日付しか描かないので画面には出ない）。
  useEffect(()=>{
    if(periods.length>0&&!periods.find(p=>p.id===selPid)){
      setSelPid(periods[0].id);
      discardEdits();
    }
  },[periods]);

  // コンテナ幅・左オフセットの計測（fitAll用）
  useEffect(()=>{
    const update=()=>{
      if(outerRef.current){
        const rect=outerRef.current.getBoundingClientRect();
        setContainerLeft(rect.left);
        setContainerW(window.innerWidth-16);
        // outerRef はブレイクアウトの外側なので、全表示・絞り込み中でも通常表示の幅のまま
        if(rect.width>0)setNormalW(Math.round(rect.width));
      }
    };
    update();
    window.addEventListener("resize",update);
    return()=>window.removeEventListener("resize",update);
  },[]);

  const period=periods.find(p=>p.id===selPid)||null;
  // 選択中の期間が終了済み（today > endDate）で写しを持つなら、staffList と凍結対象settingsを写しから読む。
  // 以降このコンポーネントが参照する staffList / settings はすべてこの解決後の値になるため、
  // Excel(expXl)・PDF(buildPdfCols) も同じ凍結名簿で出力される。他タブは props のまま＝現在値で動く。
  const todayStr=fd(new Date());
  const periodMaster=useMemo(()=>resolvePeriodMaster(period,staffListProp,settingsProp,todayStr),[period,staffListProp,settingsProp,todayStr]);
  const settings=periodMaster.settings;
  // rosterStaffList = その期間の名簿そのもの（非表示スタッフを含む）。staffList = 表示・出力用に
  // 非表示スタッフを落としたもの。以降の描画・集計・Excel・PDF はすべて staffList 側を使い、
  // 「提出名がこの期間の名簿にあるか」の判定（isUnregisteredSubName）だけ rosterStaffList を使う。
  // 逆にすると非表示の人の提出が未登録名に化けて、隠したはずの列が末尾に復活する（visibleStaffList のコメント）。
  const rosterStaffList=periodMaster.staffList;
  // **参照を安定させるために useMemo にする**。下の重い useMemo 6つ（heatData / dupErrors /
  // positionErrors / positionErrorEntries / restCounts / consecCounts）は依存配列に staffList・
  // dates・realStaff を並べている。ここで毎レンダー新しい配列を返すと依存が毎回「変化した」と
  // 判定され、**メモ化が1度も効かない**＝打鍵ごとにヒートマップ・ポジション不足の二部マッチング・
  // 休みカウント・連勤カウントを全部やり直す（実測: 4打鍵＝4レンダーで6つとも4回再計算）。
  const staffList=useMemo(()=>visibleStaffList(rosterStaffList,settings,period),[rosterStaffList,settings,period]);
  // 確定（period.confirmation・P3）した期間は**セルも編集できない**（以前の「確定」は写しでマスタを固定するだけで
  // セルは編集できた）。スタッフの再提出はルール（database.rules.json の subs）が止める。
  const periodConfirmed=isPeriodConfirmed(period);
  const canEditCells=isPremium&&!periodConfirmed;
  // 実績（P4）の切替は確定済みの期間だけ（確定シフトを初期値にするため）。オーナーの端末だけが actuals を読み書きできる
  const[actualMode,setActualMode]=useState(false);
  const canActuals=!!period&&periodConfirmed&&isPremium&&!ownerReadOnly&&act.enabled;
  const showActuals=canActuals&&actualMode;
  // 最新の subs（確定の集計は、未確定のセルを flush した後の値で行う）
  const subsRef=useRef(subs);subsRef.current=subs;
  // 期間が生きている間はシフト作成タブを開くたびに写しを最新化し、最終日を超えたら更新を止める＝そこで凍結。
  // 「確定の瞬間に撮る」ではなく「確定まで撮り続ける」形にしないと、最終日を過ぎてから初めてアプリを
  // 開くまでの間に行われたスタッフ削除を取りこぼす（写しはアプリが動いている瞬間しか撮れないため）。
  // 内容に変化があるときだけ書く。ownerReadOnly端末は periods への書き込みがルールで拒否されるので何もしない。
  // 期間ごとの労務の合計（写しと同じゲートで凍結する）。実体の書き込みは laborByStaff の直後の
  // useEffect が写しとまとめて1回で行う——**別々の effect にすると互いを上書きする**。
  // どちらも自分のレンダーの periods を map するので、同じコミットで2つ走ると後勝ちで片方が消え、
  // 次のレンダーで消えた側が書き直す＝毎回2回書く（2026-09-26 にハーネスで実測した）。
  // dates / realStaff も同じ理由で参照を安定させる（上の staffList のコメント参照）。
  const dates=useMemo(()=>period?gd(period.startDate,period.endDate):[],[period]);
  const realStaff=useMemo(()=>staffList.filter(n=>!isSpacer(n)),[staffList]);
  // ===== ヘルプ先勤務の所属店舗への合算（2026-09-30・P3.6・計画書 §3.9）=====
  // 対象は企業の写しの連携店舗（allLinkedShops のうち企業に入れていない店舗は含めない）で、写しに法人が
  // 焼いてあれば同じ法人の店舗だけ。読み込みは店舗間の重複判定の companyData をそのまま使う（他店の subs・staff・
  // settings・periods は auth != null で読める＝店長のセッションでも合算できる）。
  // 同一人物は写しの people（P1b の人物）が第1の根拠、無い人は所属店舗の一致（dupTargetShopsFor と同じ規則）。
  const helperShops=useMemo(()=>helperShopsOf(companyLink,companyData,shopId),[companyLink,companyData,shopId]);
  // {名前: {role:"home"|"dest"|null, home, homeName, regs, unread}}。role の無い人は載せない
  const helperInfo=useMemo(()=>{
    const out={};
    if(!Object.keys(helperShops).length)return out;
    const people=(companyLink&&companyLink.people)||null;
    const eid=companyLink&&typeof companyLink.entityId==="string"?companyLink.entityId:null;
    realStaff.forEach(name=>{
      const h=helperPersonOf({shopId,name,settings,people,otherShops:helperShops,entityId:eid});
      if(!h.role&&!h.unread)return;
      const hs=h.home&&helperShops[h.home];
      out[name]={...h,homeName:hs?hs.name:(((companyLink&&companyLink.shops)||{})[h.home]||"")};
    });
    return out;
  },[helperShops,companyLink,shopId,settings,realStaff]);
  const spIdx=staffList.findIndex(n=>isSpacer(n));
  const hallStaff=spIdx>-1?staffList.slice(spIdx+1).filter(n=>!isSpacer(n)):[];

  // スクロール同期（onScroll経由で確実に同期）。
  //
  // 同期先はそれぞれ自分の最大スクロール量までしか動けない。連動する表は幅が揃っておらず
  // （日付/ラベル列の padding 差で集計表だけ8px狭い、メイングリッドだけ縦スクロールバー分
  // clientWidth が狭い）、限界に達した相手は書いた値ではなくクランプ後の値になる。その値が
  // 相手の scroll イベントとして戻ってきて本体へ書き戻されると、操作中のスクロールが引き戻される。
  // **スクロールバーがレイアウト幅を占有する環境（Windows）でだけ幅の差が開くため、macOS では
  // ほぼ出ず Windows で「引っかかる」として出る。** 自分が書いた値の反射はここで捨てる。
  //
  // あわせて、値が変わる領域にだけ書く。グリッドの onScroll は縦スクロールでも syncScrollH を
  // 呼ぶため、比較が無いと scrollLeft が1pxも動かない縦操作でも集計表3つへ毎イベント書き込みが
  // 走り、そのたびに3つの表がレイアウトと再描画をやり直す。
  const syncingRef=useRef(false);
  const echoHRef=useRef(null);
  const echoVRef=useRef(null);
  if(echoHRef.current===null)echoHRef.current=new WeakMap();
  if(echoVRef.current===null)echoVRef.current=new WeakMap();
  // 読み（clientWidth等）と書き（scrollLeft代入）を2段に分ける。混ぜるとレイアウトが毎回やり直される。
  const syncAxis=(src,refs,posKey,sizeKey,clientKey,echo)=>{
    const cur=src[posKey];
    const wrote=echo.get(src);
    if(wrote!==undefined&&Math.abs(wrote-cur)<0.5){echo.delete(src);return;} // 自分が書いた分の反射
    const targets=[];
    refs.forEach(r=>{
      const el=r.current;if(!el||el===src)return;
      const v=Math.max(0,Math.min(cur,el[sizeKey]-el[clientKey]));
      if(Math.abs(el[posKey]-v)>=0.5)targets.push([el,v]);
    });
    targets.forEach(t=>{t[0][posKey]=t[1];echo.set(t[0],t[1]);});
  };
  const syncScrollH=useCallback((src)=>{
    if(syncingRef.current)return;
    syncingRef.current=true;
    syncAxis(src,[mainScrollRef,periodScrollRef,weekScrollRef,restScrollRef,laborScrollRef,weekRestScrollRef],"scrollLeft","scrollWidth","clientWidth",echoHRef.current);
    requestAnimationFrame(()=>{syncingRef.current=false;});
  },[]);
  // 縦スクロール同期（メイングリッド⇔左右ヒートマップ）
  const kitHeatRef=useRef(null);
  const hallHeatRef=useRef(null);
  const syncScrollV=useCallback((src)=>{
    syncAxis(src,[mainScrollRef,kitHeatRef,hallHeatRef],"scrollTop","scrollHeight","clientHeight",echoVRef.current);
  },[]);

  const toDecimal=t=>{if(!t)return"";const[h,m]=t.split(":").map(Number);return m===0?String(h):String(h+m/60);};
  const parseTime=v=>{
    if(!v||!v.trim())return"";const s=v.trim();
    if(/^\d{1,2}:\d{2}$/.test(s)){const[h,m]=s.split(":").map(Number);if(h>=0&&h<=30&&m>=0&&m<60)return`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;return"";}
    if(/^\d+\.\d+$/.test(s)){const n=parseFloat(s);const h=Math.floor(n);const m=Math.round((n-h)*60);if(h>=0&&h<=30&&m>=0&&m<60)return`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;return"";}
    if(/^\d+$/.test(s)){const n=parseInt(s,10);if(s.length<=2){if(n>=0&&n<=30)return`${String(n).padStart(2,"0")}:00`;}else{const h=Math.floor(n/100);const m=n%100;if(h>=0&&h<=30&&m>=0&&m<60)return`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}return"";}
    return"";
  };
  // サフィックス抽出は app-utils.js の extractNote（CELL_COMMANDSレジストリ駆動）を使用。
  // h=ホール出張, k=キッチン入り, x=ヘルプ, y/休=休み希望(rest), 任意文字列=そのまま保持

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
  // 休みの日も含む全シフトのマップ。週の休み判定（S-5）は「出勤が無い日」ではなく
  // 「公休か・有給か・無記入か」を区別する必要があるため、work 限定の上のマップでは足りない。
  const anyShiftByStaffDate=useMemo(()=>{
    const m=new Map();
    subs.forEach(s=>{
      if(!s||!s.staffName||!s.shifts)return;
      Object.entries(s.shifts).forEach(([d,sh])=>{const k=s.staffName+"|"+d;if(sh&&!m.has(k))m.set(k,sh);});
    });
    return m;
  },[subs]);
  // 別名解決は app-utils.js の resolveSubByAlias に一本化する（完全一致を必ず優先）。
  // Excel出力（expXl）も同じ関数を通す＝画面とExcelが別のsubを見ることが構造的に起きない（バグチェック#105）
  const staffAliases=settings?.staffAliases||NO_STAFF_ALIASES;
  // pidを外から指定できる版（期間別勤務時間は前半/後半/月計で selPid 以外の期間も参照するため）
  const _getSubForPeriod=(pid,name)=>resolveSubByAlias(n=>subsByKey.get(pid+"|"+n),name,staffAliases);
  const _getSub=(name)=>_getSubForPeriod(selPid,name);
  // workShiftByStaffDate も同様に別名フォールバックする（週間勤務時間の集計用）
  const _getWorkShift=(name,date)=>resolveSubByAlias(n=>workShiftByStaffDate.get(n+"|"+date),name,staffAliases);
  const _getAnyShift=(name,date)=>resolveSubByAlias(n=>anyShiftByStaffDate.get(n+"|"+date),name,staffAliases);
  // 所属店舗から見た、その日の他店での勤務（P3.6）。所属店舗（role "home"）の人だけ。行き先の店の設定で引いた実働を
  // そのまま使い、自店の勤務と時間が重なる他店の勤務は足さない（helperWorkOn）。名前×日付で1回だけ数える。
  // キャッシュは表示用（helperCache・今の subs）と計算用（helperCacheCalc・後回しの subs・S3）の2つ。
  // 重い計算は計算用だけを使う（表示用を依存に入れると確定の描画で重い計算が走る）
  const helperCache=useMemo(()=>({days:new Map(),settings:new Map()}),[helperInfo,helperShops,subs,settings,todayStr]);
  const helperCacheCalc=useMemo(()=>({days:new Map(),settings:new Map()}),[helperInfo,helperShops,subsCalc,settings,todayStr]);
  const helperEntriesOn=(name,d,cache=helperCacheCalc)=>{
    const hi=helperInfo[name];
    if(!hi||hi.role!=="home")return[];
    const k=name+"|"+d;
    if(cache.days.has(k))return cache.days.get(k);
    const own=_getWorkShift(name,d);
    const v=helperWorkOn({regs:hi.regs,otherShops:helperShops,date:d,todayStr,companySettings:companyLink?(companyLink.settings||null):null,
      ownRange:own?effShiftRangeMin(own,settings):null,cache:cache.settings});
    cache.days.set(k,v);
    return v;
  };
  const helperMinOn=(name,d)=>helperEntriesOn(name,d).reduce((a,e)=>a+e.min,0);
  // 週の休み・休暇の数え方の入口。自店が空欄（公休）でも他店で働いた日は出勤日
  const dayKindWithHelper=(name,d,hasData)=>{
    const k=dayRestKindOf(_getAnyShift(name,d),hasData);
    return k==="rest"&&helperMinOn(name,d)>0?"work":k;
  };
  // 管理者編集値(adjustedXxx)優先、なければスタッフ提出値(xxx)にフォールバック。
  // 管理者入力の休み希望(adminRest)が付いたフィールドは実効値なし=""（休みカウント・ヒートマップ・集計・表示すべて休み扱いになる）
  const fieldRest=(name,date,field)=>{const sh=_getSub(name)?.shifts?.[date];return!!(sh&&sh.adminRest&&sh.adminRest[field]);};
  const getStoredTime=(name,date,field)=>{const sh=_getSub(name)?.shifts?.[date];if(!sh)return"";if(sh.adminRest&&sh.adminRest[field])return"";return(field==="start"?(sh.adjustedStart??sh.start):(sh.adjustedEnd??sh.end))||"";};
  const getStoredNote=(name,date,field)=>{const sh=_getSub(name)?.shifts?.[date];if(!sh)return"";if(sh.adminRest&&sh.adminRest[field])return"";return(field==="start"?(sh.adjustedStartNote??sh.startNote):(sh.adjustedEndNote??sh.endNote))||"";};
  // 締めフラグ（adjustedStartFixed/adjustedEndFixed）: noteとは独立に永続化する。noteは締め文字を含まない
  // 「素の」値（h/k/x・略称等）のまま保つことで、h/k判定・abbrToShop完全一致lookupに影響を与えない
  const getStoredFixed=(name,date,field)=>{if(!fixedShiftEnabled)return false;const sh=_getSub(name)?.shifts?.[date];const fk=field==="start"?"adjustedStartFixed":"adjustedEndFixed";return!!(sh&&sh[fk]);};
  // 終日の休暇はセルに種別名（公休/有給/慶弔）を出す。色は塗らない（2026-09-26 ユーザー指示）。
  // 出勤・退勤の**両方**に出す——片方だけだと半日の休み希望と見分けがつかない。
  // 判定は app-utils.js の leaveShownTextOf（PDF・従業員画面の全員の表・Excel と同じ関数・2026-10-04）
  const leaveCellText=(name,date,field)=>leaveShownTextOf(_getSub(name)?.shifts?.[date],field);
  const ownVal=(name,date,field)=>{const lv=leaveCellText(name,date,field);if(lv)return lv;const t=toDecimal(getStoredTime(name,date,field));const n=getStoredNote(name,date,field);const fx=getStoredFixed(name,date,field)?FIXED_KEY:"";if(t)return t+n+fx;return(n+fx)||"";};
  // 所属店舗のグリッドに、他店でのヘルプ勤務を出す（P3.6 → 2026-10-04 H2 で表示を変更）。
  // 決まりは app-utils.js の helperCellDisplay（PDF の buildShiftTableHtml・Excel の adjResolver も同じ関数を通す）:
  // 上＝最初の勤務の開始・下＝最後の勤務の終了。ヘルプ先の時刻なら略称を付けて黄色（表示だけ。subs には書かない）。
  // ヘルプ先だけの日は読み取り専用（編集は行き先の店）。自店と混在する日は、略称の付くセルを選ぶと自店の値に切り替わって
  // 編集でき、離れると合成表示に戻る。休暇ラベルのある日は休暇を優先してヘルプを出さない（今回変えない）。
  const helperDisp=(name,date)=>{
    const hi=helperInfo[name];
    if(!hi||hi.role!=="home")return null;
    // この期間でこの人の自動表示を OFF にしていれば出さない（2026-10-05・見た目だけ。合算の helperEntriesOn は変えない）。
    // 画面・PDF・Excel・blur の保存しない判定・読み取り専用（isHelperOnly）・斜線（cellDash）がすべてここを通るので一緒に追随する
    if(isHelperDisplayOff(period,name))return null;
    if(leaveCellText(name,date,"start")||leaveCellText(name,date,"end"))return null;
    const es=helperEntriesOn(name,date,helperCache);
    if(!es.length)return null;
    const own=_getWorkShift(name,date);
    return helperCellDisplay({entries:es,ownRange:own?effShiftRangeMin(own,settings):null,
      ownText:{start:ownVal(name,date,"start"),end:ownVal(name,date,"end")}});
  };
  // ===== ヘルプ勤務の自動表示の ON/OFF（2026-10-05 ユーザー指示）=====
  // メイングリッドの名前の見出しの下に切り替えを出す。出すのは自動で取得したヘルプ勤務がこの期間にある人（所属店舗＝role "home"）と、
  // 既に OFF にしてある人（ON に戻せるように）だけ。全表示では列が細いので出さない。
  // 保存先は period.helperDisplayOff（作成中のこの期間だけ）。押せるのは期間を書ける端末で、確定済みの期間では押せない（表示だけ）
  const helperToggleNames=new Set();
  if(period){
    Object.keys(helperInfo).forEach(n=>{
      if(helperInfo[n].role!=="home")return;
      if(isHelperDisplayOff(period,n)||dates.some(d=>helperEntriesOn(n,d,helperCache).length>0))helperToggleNames.add(n);
    });
  }
  const canToggleHelperDisp=!!period&&!!savePeriods&&!ownerReadOnly&&!exportJob&&!periodConfirmed;
  const toggleHelperDisp=name=>{
    if(!canToggleHelperDisp)return;
    const off=!isHelperDisplayOff(period,name);
    const np=planHelperDisplayToggle(period,name,off);
    if(np===period)return;
    savePeriods(periods.map(p=>p&&p.id===period.id?np:p));
    tt(off?`✓ ${name}さんのヘルプ勤務の自動表示をOFFにしました（この期間だけ・勤務時間の合算は続けます）`:`✓ ${name}さんのヘルプ勤務の自動表示をONにしました`);
  };
  const isHelperOnly=(name,date)=>{const hd=helperDisp(name,date);return!!(hd&&hd.helperOnly);};
  // フォーカスしていないときにセルに合成表示（時刻＋略称）を出すならその文字列、出さないなら ""。
  // 混在の日の略称の付くセルは、フォーカス中だけ自店の値（ownEditVal）に切り替える＝切り替えはセル（ShiftCell）が行う（S2）。
  const helperShownText=(name,date,field)=>{
    const hd=helperDisp(name,date);
    if(!hd||!hd[field].helper)return"";
    return hd[field].text;
  };
  // セルの自店の値（確定済みの編集＞保存値）。フォーカスしていないセルは合成表示があればそちらを出す（getVal）
  const ownEditVal=(name,date,field)=>{const key=`${name}|${date}|${field}`;if(key in localEdits)return localEdits[key];return ownVal(name,date,field);};
  const getVal=(name,date,field)=>{const hx=helperShownText(name,date,field);if(hx)return hx;return ownEditVal(name,date,field);};
  // 店舗限定固定シフトコマンド（「締」等）が有効な店舗かどうか
  const fixedShiftEnabled=useMemo(()=>isFixedShiftEligibleShop(shopName),[shopName]);
  // 1セル分の編集をnewSubs配列に適用する（handleBlur・保存ボタン一括保存の共通ロジック）。
  // newSubsは呼び出し元がprevSubsから作った配列を直接破壊的に更新する（呼び出し元でreturnする）。
  // 「締」等の店舗限定固定シフトコマンド(kind:"fixed")は、出勤・退勤どちらのフィールドの note に
  // 付いていても主シフト(adjField/adjustedStart等)とは別の追加出勤(extraStart/extraEnd)として扱う。
  // 数字と組み合わせた「17締」（主シフト17:00+追加締め）と、単独の「締」（主シフトなし+追加締めのみ）の
  // 両方をこの1関数で処理する。extraStart/extraEndは日全体で1組のみのため、2フィールドのうち
  // どちらかが締めならON、どちらも締めでなくなればOFFという形で毎回のblurごとに再判定する。
  const applyEditToSubs=(newSubs,name,date,field,rawValue)=>{
    // 退勤≦出勤の日を検出して印を置く（項目12・案C。**保存は止めない**）。
    // 提出一覧の saveAdj と同じ isTimeOrderInvalid を通す——片方だけだと同じ状態をもう一方から作れる。
    const _flagTimeOrder=sd=>{if(isTimeOrderInvalid(sd))timeErrToastRef.current=true;return sd;};
    const{numeric,note,rest,hasFixed,leaveType:leaveCmd}=extractNote(rawValue);
    const parsed=parseTime(numeric);
    const fixedCmd=(fixedShiftEnabled&&hasFixed)?FIXED_ENTRY:null;
    // 管理者編集はadjustedXxxに保存（スタッフ提出のstart/endを保護）
    const adjField=field==="start"?"adjustedStart":"adjustedEnd";
    const nk=field==="start"?"adjustedStartNote":"adjustedEndNote";
    // 締めフラグは note とは別に永続化する（noteはh/k/x・略称等の「素の」値のまま保つ）
    const fixedFieldKey=field==="start"?"adjustedStartFixed":"adjustedEndFixed";
    const otherFixedFieldKey=field==="start"?"adjustedEndFixed":"adjustedStartFixed";
    let idx=newSubs.findIndex(s=>s.periodId===selPid&&s.staffName===name);
    if(idx===-1){
      // 別名で提出済みの場合は表示解決(_getSub)と同じロジックでその提出を編集対象にする。
      // ここでaliasを見ずに登録名一致だけで判定すると、別名提出者の編集がidx===-1に落ちて
      // 登録名の別subを新規作成してしまい、_getSubの完全一致優先により元の提出が読めなくなる。
      const aliases=staffAliases[name]||[];
      for(const alias of aliases){
        idx=newSubs.findIndex(s=>s.periodId===selPid&&s.staffName===alias);
        if(idx!==-1)break;
      }
    }
    if(idx===-1){
      if(rest){
        // 休み希望(/)を未提出スタッフのセルに入力: adminRestのみ持つsubを新規作成
        const ns={id:genSecureId(24),periodId:selPid,staffName:name,shopId,shifts:{},comment:"",submittedAt:new Date().toISOString(),source:"grid"};
        // yu/ke は終日の休暇（第3弾・判断6）。/ は従来どおり入れたフィールドだけ。
        // yu/ke は**打ち込んだ帯だけ**（有給は半日単位で取れる）。ko（公休）だけ終日。
        ns.shifts[date]=leaveCmd
          ?(leaveCmd==="public"
            ?{status:"work",adminRest:{start:true,end:true},leaveTypes:{start:"public",end:"public"}}
            :{status:"work",adminRest:{[field]:true},leaveTypes:{[field]:leaveCmd}})
          :{status:"work",adminRest:{[field]:true}};
        newSubs.push(ns);
        return _flagTimeOrder(ns.shifts[date]);
      }
      // 時間も締めもメモ(コマンド外の任意文字)も無いなら新規作成不要
      if(!parsed&&!fixedCmd&&!note)return;
      // シフト作成タブから直接新規作成したsubはsource:"grid"を付与する。
      // 提出一覧(SubsTab)はスタッフURL経由の提出のみを表示するため、この印で除外する。
      const ns={id:genSecureId(24),periodId:selPid,staffName:name,shopId,shifts:{},comment:"",submittedAt:new Date().toISOString(),source:"grid"};
      const sd0={status:"work"};
      // 時間ありは時刻＋note、時間なしのメモのみ(例「研修」)はadjField=""でnoteだけ保存する
      // （提出のないスタッフのセルにコマンド外の文字を入れてもリロードで消えないようにする）
      if(parsed){sd0[adjField]=parsed;sd0[nk]=note;}
      else if(note){sd0[adjField]="";sd0[nk]=note;}
      if(fixedCmd){sd0[fixedFieldKey]=true;sd0.extraStart=fixedCmd.start;sd0.extraEnd=fixedCmd.end;}
      ns.shifts[date]=sd0;
      newSubs.push(ns);
      return _flagTimeOrder(sd0);
    }else{
      const sub={...newSubs[idx]};const shifts={...(sub.shifts||{})};const sd={...(shifts[date]||{status:"work"})};
      if(rest&&leaveCmd){
        // 休暇種別。**yu/ke は打ち込んだ帯だけ**（有給は半日単位で取れる）、ko は終日。
        // 同じ種別をもう一度入れると解除する。旧い日単位の leaveType は触った時点で捨てる。
        const cur=leaveFieldsOf(sd);
        const whole=leaveCmd==="public";
        const already=whole?(cur.start===leaveCmd&&cur.end===leaveCmd):(cur[field]===leaveCmd);
        const lt={...(sd.leaveTypes||{})};
        if(!sd.leaveTypes){if(cur.start)lt.start=cur.start;if(cur.end)lt.end=cur.end;}
        const ar={...(sd.adminRest||{})};
        if(already){
          if(whole){delete lt.start;delete lt.end;delete ar.start;delete ar.end;}
          else{delete lt[field];delete ar[field];}
        }else{
          if(whole){lt.start="public";lt.end="public";ar.start=true;ar.end=true;
            delete sd.adjustedStart;delete sd.adjustedEnd;
            delete sd.adjustedStartNote;delete sd.adjustedEndNote;
            delete sd.adjustedStartFixed;delete sd.adjustedEndFixed;}
          else{lt[field]=leaveCmd;ar[field]=true;
            delete sd[adjField];delete sd[nk];delete sd[fixedFieldKey];}
        }
        delete sd.leaveType;
        if(Object.keys(lt).length)sd.leaveTypes=lt;else delete sd.leaveTypes;
        if(Object.keys(ar).length)sd.adminRest=ar;else delete sd.adminRest;
      }else if(rest){
        // 休み希望トグル: 同じセルへの再入力で解除。セット時は同フィールドの管理者調整値を消す
        // （スタッフ提出のstart/end/statusには触れない。実効値の抑制はgetStoredTimeのadminRest判定が担う）
        const ar={...(sd.adminRest||{})};
        if(ar[field]){delete ar[field];}
        else{ar[field]=true;delete sd[adjField];delete sd[nk];delete sd[fixedFieldKey];}
        if(Object.keys(ar).length)sd.adminRest=ar;else delete sd.adminRest;
        // **/（旧 y）は leaveType を書かない**（2026-09-26 ユーザー指示）。終日でもセルは斜線のままで、
        // 「公休」の文字は出さない。文字を出す＝記録として残すのは ko（leaveType:"public"）のほう。
        // 週の休みに数えるかは leaveTypeOf が終日の / も公休として扱うので、この変更では動かない。
        if(sd.leaveType==="public")delete sd.leaveType;
      }else if(parsed){
        // 休み希望セルへの入力は出勤扱いに変えるが、元のstatusをorigStatusに退避して消去時に復元できるようにする
        if(sd.status!=="work"&&sd.origStatus===undefined)sd.origStatus=sd.status;
        sd[adjField]=parsed;sd[nk]=note;sd.status="work";
        // 時間を入れた＝その帯は出勤に戻す
        if(sd.leaveType)delete sd.leaveType;
        if(sd.leaveTypes&&sd.leaveTypes[field]){const lt2={...sd.leaveTypes};delete lt2[field];
          if(Object.keys(lt2).length)sd.leaveTypes=lt2;else delete sd.leaveTypes;}
        if(fixedCmd)sd[fixedFieldKey]=true;else delete sd[fixedFieldKey];
        // 時間入力は同フィールドの休み希望マーク(adminRest)を解除する
        if(sd.adminRest&&sd.adminRest[field]){const ar={...sd.adminRest};delete ar[field];if(Object.keys(ar).length)sd.adminRest=ar;else delete sd.adminRest;}
      }else{
        // セルの文字を消して空欄にしたら、そのセルに出ている休暇の種別も外す（2026-09-26 ユーザー指示）。
        // **外す範囲は「同じコマンドをもう一度入れたとき」と揃える**——公休は終日（ko は終日でしか
        // 入らないので、片方のセルだけ外すと残った側が「公休」のまま消せなくなる）、有給・慶弔は
        // 打ち込んだ帯だけ。判定は表示ではなく保存値（leaveFieldsOf）で行うので、旧い日単位の
        // leaveType しか持たない日にも同じ規則が当たる。メモ・締めを伴う入力は空欄ではないので外さない。
        const curLv=leaveFieldsOf(sd);
        if(!note&&!fixedCmd&&curLv[field]){
          const whole=curLv[field]==="public";
          const lt={...(sd.leaveTypes||{})};
          if(!sd.leaveTypes){if(curLv.start)lt.start=curLv.start;if(curLv.end)lt.end=curLv.end;}
          const ar={...(sd.adminRest||{})};
          if(whole){delete lt.start;delete lt.end;delete ar.start;delete ar.end;
            // 反対側のセルも空欄の上書きにする。下で空欄にするのは打ったセルだけなので、
            // これが無いとスタッフ提出のある日は反対側に提出時刻が戻り、片側だけの勤務になる。
            // ko を入れた時点で両側の調整値は消してあるので、ここで失われる入力は無い。
            if(field==="start"){sd.adjustedEnd="";sd.adjustedEndNote="";delete sd.adjustedEndFixed;}
            else{sd.adjustedStart="";sd.adjustedStartNote="";delete sd.adjustedStartFixed;}}
          else{delete lt[field];delete ar[field];}
          delete sd.leaveType;
          if(Object.keys(lt).length)sd.leaveTypes=lt;else delete sd.leaveTypes;
          if(Object.keys(ar).length)sd.adminRest=ar;else delete sd.adminRest;
        }
        // セルを空欄にする＝「時間なし」の明示的な上書きとして保存する（空文字はnullish coalescing
        // では素通りしないため、getStoredTime/getStoredNoteがスタッフ提出値にフォールバックしなくなる）。
        // スタッフ提出値そのものを消したいときはこの上書きで対応でき、提出値に戻したいときは
        // 提出一覧タブの詳細モーダルにある「提出値」選択（saveAdj）を使う想定
        sd[adjField]="";sd[nk]=note;
        if(fixedCmd)sd[fixedFieldKey]=true;else delete sd[fixedFieldKey];
        // 出勤・退勤とも管理者調整値が空欄になったら退避したstatusに戻す（休み希望なら斜線が復活する）。
        // スタッフ提出のstart/endが残っている場合は本人が出勤に変えているため復元しない
        // （締めコマンドが付いている場合は下の追加出勤トグルがstatus="work"に再設定するため復元させない）
        const otherAdj=field==="start"?"adjustedEnd":"adjustedStart";
        if(!sd[otherAdj]&&sd.origStatus!==undefined&&!fixedCmd){
          if(!sd.start&&!sd.end)sd.status=sd.origStatus;
          delete sd.origStatus;
        }
      }
      // 締め(kind:"fixed")の追加出勤トグル: start/endどちらかのadjustedXFixedがtrueならON、どちらもfalseならOFF。
      // noteの文字列一致ではなくこの専用フラグで判定するため、h/k/x・略称等と組み合わせた
      // 「16k締」のような入力でも（どちらのセルから入力されても・入力順序に関わらず）正しくON/OFFが決まる。
      if(fixedShiftEnabled){
        const anyFixed=!!sd[fixedFieldKey]||!!sd[otherFixedFieldKey];
        if(anyFixed){
          if(sd.status!=="work"&&sd.origStatus===undefined)sd.origStatus=sd.status;
          sd.status="work";
          sd.extraStart=FIXED_ENTRY.start;sd.extraEnd=FIXED_ENTRY.end;
        }else{
          delete sd.extraStart;delete sd.extraEnd;
        }
      }
      shifts[date]=sd;sub.shifts=shifts;newSubs[idx]=sub;
      return _flagTimeOrder(sd);
    }
  };
  // 休み希望(/)の二重適用ガード: Enterキー確定はhandleBlurを直接呼んだ後にフォーカス移動で
  // ネイティブblurイベントも発火し、同じ値で2回呼ばれる。時間入力は再適用が冪等なので無害だが、
  // / はトグルのため2回目で打ち消されてしまう。同一セル・短時間の連続rest適用を1回に抑止する。
  const restAppliedRef=useRef({key:null,t:0});
  // 時刻の入力ミス（項目12・案C）のトースト。applyEditToSubs は onSave の関数型更新の中で
  // 走る＝同期的には結果を受け取れないため、ここに印だけ置いて次のレンダー後に出す。
  // （updater はコミット毎に厳密に1回だけ呼ばれる＝app-main.js の saveSubs のコメント参照）
  const timeErrToastRef=useRef(false);
  useEffect(()=>{
    if(!timeErrToastRef.current)return;
    timeErrToastRef.current=false;
    tt(TIME_ORDER_ERROR_HINT);
  });
  const handleBlur=(name,date,field,rawValue)=>{
    if(!isPremium||periodConfirmed)return;
    const ekey=`${name}|${date}|${field}`;
    // セルに出している休暇の種別名をそのまま blur しても何もしない（メモとして保存しない）。
    // 種別を外すときは同じコマンド（ko/yu/ke）をもう一度入れるか、時間を入力して出勤に戻す。
    // **種別名が出ているセルだけが対象**。空文字どうしの一致で早期returnすると、休暇でない
    // セルを空欄にする blur が丸ごと捨てられ、消したはずの文字が保存値から復活する（本番報告）。
    const leaveShown=leaveCellText(name,date,field);
    if(leaveShown&&leaveShown===String(rawValue==null?"":rawValue).trim()){
      updLocalEdits(prev=>{if(!(ekey in prev))return prev;const n={...prev};delete n[ekey];return n;});
      return;
    }
    // ヘルプの合成表示（時刻＋略称・H2）のまま blur しても保存しない。**合成表示が出ているセルだけが対象**
    // （合成表示は必ず時刻を含むので空文字どうしでは一致しない＝上の休暇ラベルと同じ事故は起きない）。
    // フォーカス中は自店の値に切り替わっているので、通常の blur は自店の値を保存する
    const hdB=helperDisp(name,date);
    if(hdB&&hdB[field].helper&&hdB[field].text===String(rawValue==null?"":rawValue).trim()){
      updLocalEdits(prev=>{if(!(ekey in prev))return prev;const n={...prev};delete n[ekey];return n;});
      return;
    }
    const{numeric,note,rest,hasFixed}=extractNote(rawValue);
    if(rest){
      const now=Date.now();
      if(restAppliedRef.current.key===ekey&&now-restAppliedRef.current.t<400)return;
      restAppliedRef.current={key:ekey,t:now};
      // 表示は保存値由来に任せる（トグルON=空欄+斜線 / OFF=提出値が復元されて再表示）ため編集値ごと消す
      updLocalEdits(prev=>{const n={...prev};delete n[ekey];return n;});
      setHeatEdits(prev=>{const n={...prev};delete n[ekey];return n;});
      onSave(prevSubs=>{
        const newSubs=[...prevSubs];
        applyEditToSubs(newSubs,name,date,field,rawValue);
        return newSubs;
      });
      return;
    }
    const parsed=parseTime(numeric);
    const fx=(fixedShiftEnabled&&hasFixed)?FIXED_KEY:"";
    // 数値なし(締めコマンド単独・締め+他コマンドの組み合わせ含む)の場合、通常なら空欄表示になってしまう
    // 箇所を締め自体の表示として残す
    const display=parsed?(toDecimal(parsed)+note+fx):((note+fx)||"");
    updLocalEdits(prev=>({...prev,[ekey]:display}));
    setHeatEdits(prev=>({...prev,[ekey]:display})); // blur確定値を集計/ヒートマップ用に反映
    // 直前state(prevSubs)基準の関数型更新。Enterキーでの高速な連続blur等、再レンダーを挟まず
    // 複数セルが立て続けに確定するケースでも、propsのsubs（古いスナップショットの可能性がある）
    // ではなく直前stateから計算するため、後続の呼び出しが前の編集を上書き消去しない。
    onSave(prevSubs=>{
      const newSubs=[...prevSubs];
      applyEditToSubs(newSubs,name,date,field,rawValue);
      return newSubs;
    });
  };
  // 「保存」ボタン: localEditsに残っている全セルをまとめて確定書き込みする。
  // 個々のセルはonBlur/Enterで既に確定済みのはずだが、それでも保存漏れの不安を訴える声があったため、
  // 「明示的に押せば確実に保存される」導線として用意する（同じ値の再適用は冪等なので害はない）。
  // silent=true は提出ボタンから呼ぶ（保存と同じ処理を黙って済ませてから提出を記録する）。
  // localEdits は blur 後も表示用に残るので「未保存があれば提出させない」とは判定できない。
  const flushEdits=(silent)=>{
    if(!isPremium||periodConfirmed)return 0;
    // 対象は「確定済みの編集＋入力中のセルの文字」（S2 で入力中の文字は localEdits に入らなくなったので、
    // 以前の localEdits と同じ中身になるよう blur の前に合わせて取る。blur で確定した分は直前の onBlur が書く）
    const pending=editsNow();
    // フォーカス中セルがあれば先にblurさせ、その場のonBlurで確定させてから一括処理する
    if(document.activeElement&&document.activeElement.tagName==="INPUT")document.activeElement.blur();
    const entries=Object.entries(pending);
    if(entries.length===0){if(!silent)tt("変更はありません");return 0;}
    onSave(prevSubs=>{
      const newSubs=[...prevSubs];
      entries.forEach(([key,rawValue])=>{
        const m=key.match(/^(.*)\|(\d{4}-\d{2}-\d{2})\|(start|end)$/);
        if(!m)return;
        // 休み希望(/)はトグルのため一括再適用しない（直前のblurで既に適用済み。
        // localEditsのstale closureに残った値を再適用すると打ち消されてしまう）
        if(isRestCommand(rawValue))return;
        applyEditToSubs(newSubs,m[1],m[2],m[3],rawValue);
      });
      return newSubs;
    });
    setHeatEdits(prev=>({...prev,...pending}));
    if(!silent)tt(`✓ ${entries.length}件のシフトを保存しました`);
    return entries.length;
  };
  const handleSaveAll=()=>{flushEdits(false);};

  // 集計/ヒートマップ用は heatEdits（blur確定値）を参照
  const getEffHHMM=(name,date,field,src=heatEdits)=>{const key=`${name}|${date}|${field}`;if(key in src){const{numeric}=extractNote(src[key]);return parseTime(numeric)||"";}return getStoredTime(name,date,field);};
  // シフトのノート取得: 管理者調整値優先、なければスタッフ提出値（edits最優先）
  const getShiftNote=(name,date,src=heatEdits)=>{
    for(const field of["start","end"]){const key=`${name}|${date}|${field}`;if(key in src){const{note}=extractNote(src[key]);if(note)return note;}if(fieldRest(name,date,field))continue;const sh=_getSub(name)?.shifts?.[date];const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";const origNk=field==="start"?"startNote":"endNote";const n=(sh?.[adjNk]??sh?.[origNk]);if(n)return n;}return"";
  };
  // フィールド別ノート取得（edits最優先→管理者調整値→スタッフ提出値。adminRestフィールドはノートなし）
  const getFieldNote=(name,date,field,src=heatEdits)=>{
    const key=`${name}|${date}|${field}`;
    if(key in src)return extractNote(src[key]).note||"";
    if(fieldRest(name,date,field))return"";
    const sh=_getSub(name)?.shifts?.[date];
    const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";
    const origNk=field==="start"?"startNote":"endNote";
    return(sh?.[adjNk]??sh?.[origNk])||"";
  };
  // フィールド別「締め」フラグ取得（edits最優先→永続化済みadjustedXFixed）。getFieldNoteと対で使う。
  // noteとは独立管理のため、h/k/x・略称等と組み合わせた入力でもnote側の完全一致判定に影響しない
  const getFieldFixed=(name,date,field,src=heatEdits)=>{
    if(!fixedShiftEnabled)return false;
    const key=`${name}|${date}|${field}`;
    if(key in src)return extractNote(src[key]).hasFixed;
    if(fieldRest(name,date,field))return false;
    const sh=_getSub(name)?.shifts?.[date];
    const fk=field==="start"?"adjustedStartFixed":"adjustedEndFixed";
    return!!(sh&&sh[fk]);
  };
  // 自店舗のカウントから外す帯（x と他店舗ヘルプ略称・2026-09-28）。出勤セル=ランチ帯・退勤セル=ディナー帯・両方=終日。
  // 規則は app-utils.js の excludedBandsOf（h/k と同じ resolveBandValues）。4箇所の判定がこれを共有する
  const exBandsOf=(name,date,s,e,src=heatEdits)=>excludedBandsOf({stM:s,enM:e,startNote:getFieldNote(name,date,"start",src),endNote:getFieldNote(name,date,"end",src),abbrToShop});
  // ランチ帯/ディナー帯それぞれのセクションを返す（"kit"/"hall"）。ヒートマップ(heatSectionEntries)と
  // ポジション不足判定・セル赤ハイライトで同じ規則を共有するための入口。
  const bandSectionsOf=(name,date,stM,enM)=>{
    const def=hallStaff.includes(name)?"hall":"kit";
    if(hallStaff.length===0)return{lunch:"kit",dinner:"kit"};
    const bv=resolveBandValues(stM,enM,noteToHeatSection(getFieldNote(name,date,"start")),noteToHeatSection(getFieldNote(name,date,"end")),HEAT_BAND_SPLIT_MIN);
    return{lunch:bv.lunch||def,dinner:bv.dinner||def};
  };
  // ヒートマップの休憩・退勤延長判定用の一時シフト（片側セルの日も返す・2026-08-31 の決定3）は
  // app-utils.js の heatStaffDayEntriesOf の中にある（従業員画面のシフト表と共有・2026-10-04）
  const timeToMin=t=>{if(!t)return null;const[h,m]=t.split(":").map(Number);return h*60+m;};
  // ヒートマップ補完用の境界（片側セルのみ入力時）: 候補タブ(candidates/weekdayCandidates/dateCandidates)の
  // 実際の候補時間帯から算出し、該当候補がなければ標準値（ランチ終わり15:00・ディナー始まり17:00）にフォールバック。
  // ランチ終わり = 17時以前(17時含む)に終わる候補のうち最も遅い退勤。ディナー始まり = 17時以降(17時含む)に始まる候補のうち最も早い出勤。
  const{HEAT_LUNCH_END_MIN,HEAT_DINNER_START_MIN}=(()=>{
    // c&& は app-utils.js の oneSidedFillBounds と同じ規則（同じ式の3つ目の写し）。配列の穴を
    // スプレッドすると undefined 要素になり、ガードが無いと c.closed で TypeError を投げて
    // タブ全体が描画不能になる（Firebaseはnull要素をキーごと削除するため、候補配列は
    // {0:..,2:..}→疎な配列として戻りうる）。ガードがあれば単に除外されるだけで済む。
    const allCands=[...(settings.candidates||[]),...Object.values(settings.weekdayCandidates||{}).flat(),...Object.values(settings.dateCandidates||{}).flat()].filter(c=>c&&!c.closed&&c.start&&c.end);
    const lunchEnds=allCands.map(c=>timeToMin(c.end)).filter(m=>m!==null&&m<=1020);
    const dinnerStarts=allCands.map(c=>timeToMin(c.start)).filter(m=>m!==null&&m>=1020);
    return{HEAT_LUNCH_END_MIN:lunchEnds.length?Math.max(...lunchEnds):900,HEAT_DINNER_START_MIN:dinnerStarts.length?Math.min(...dinnerStarts):1020};
  })();
  // section: "kit" or "hall" — サフィックスh/kで所属を上書き、xはどちらにも入らない
  // 列hr[hr*60,(hr+1)*60)にカウント: stM<(hr+1)*60 && enM>hr*60
  // 日付×スタッフの実効出勤情報（開始・延長込み終了・休憩・所属）を事前計算しておき、
  // ヒートマップの各セルは区間判定だけで数える（従来は日付×時間×スタッフ×subs.findの全走査で入力が重かった）
  const heatData=useMemo(()=>{
    const perDate={};
    dates.forEach(date=>{
      const arr=[];
      realStaff.forEach(name=>{
        // 1人1日の区間は app-utils.js の heatStaffDayEntriesOf（従業員画面のシフト表の昼夜の人数と同じ関数・2026-10-04）。
        // ここで解決するのは入力中の編集を含む実効値（getEffHHMM・getFieldNote・getFieldFixed）だけ
        heatStaffDayEntriesOf({name,date,settings,start:getEffHHMM(name,date,"start"),end:getEffHHMM(name,date,"end"),
          startNote:getFieldNote(name,date,"start"),endNote:getFieldNote(name,date,"end"),
          fixed:getFieldFixed(name,date,"start")||getFieldFixed(name,date,"end"),base:_getSub(name)?.shifts?.[date],
          lunchEnd:HEAT_LUNCH_END_MIN,dinnerStart:HEAT_DINNER_START_MIN,abbrToShop,isHall:hallStaff.includes(name),splitEnabled:hallStaff.length>0})
          .forEach(e=>arr.push(e));
      });
      perDate[date]=arr;
    });
    return perDate;
  },[subsCalc,heatEditsCalc,settings,selPid,staffList,periods,companyData,fixedShiftEnabled]);
  // 店舗間シフト重複エラー: 同じ人が他店舗と時間重複していないか（blur確定値ベース）。
  // 見に行く他店舗は所属店舗の一致で決める（dupTargetShopsFor・2026-09-27）。旧データの
  // staffWorkplaces（企業連携タブの「勤務先店舗」・UIは廃止）はその関数の中で1リリースだけ併用する。
  const dupErrors=useMemo(()=>{
    const errs={}; // {name|date: 他店舗名}
    if(Object.keys(companyData).length===0)return errs;
    realStaff.forEach(name=>{
      const wps=dupTargetShopsFor({name,shopId,settings,otherShops:companyData}).filter(id=>companyData[id]);
      if(wps.length===0)return;
      dates.forEach(date=>{
        let s=timeToMin(getEffHHMM(name,date,"start")),e=timeToMin(getEffHHMM(name,date,"end"));
        // 片側セルのみ入力はヒートマップ・ポジション判定と同じ規則で補完する（バグチェック#86）。
        // 補完せず早期returnすると「出勤だけ入っている日は他店舗と重なっていても一度も見に行かない」になる
        if(s===null&&e===null)return;
        if(e===null)e=HEAT_LUNCH_END_MIN;
        if(s===null)s=HEAT_DINNER_START_MIN;
        if(s>=e)return;
        // 退勤延長（残業）は勤務時間として数えている時間なので、二重予約の判定にも含める（バグチェック#86）。
        // 他店舗側の延長は companyData が overtimeSettings を読んでいないため加算できない＝自店舗側のみ。
        {
          const dsh=_getWorkShift(name,date);
          const ot=dsh?getOT(name,settings,dsh):0;
          if(ot>0){const wasLunch=e<=HEAT_BAND_SPLIT_MIN;e+=ot;if(wasLunch)e=Math.min(e,HEAT_BAND_SPLIT_MIN);}
        }
        // x と他店舗ヘルプの帯は他店舗勤務が前提なので判定から除外（帯の解決規則はヒートマップと共通＝excludedBandsOf。バグチェック#85）
        {
          const hv=exBandsOf(name,date,s,e);
          if(hv.lunch&&hv.dinner)return;
          if(hv.lunch)s=Math.max(s,HEAT_BAND_SPLIT_MIN);
          if(hv.dinner)e=Math.min(e,HEAT_BAND_SPLIT_MIN);
          if(s>=e)return;
        }
        for(const osid of wps){
          const osh=companyData[osid].workMap.get(name+"|"+date);
          if(!osh)continue;
          // 他店舗側も自店舗側（上の s/e）と**同じ規則**で解決する。effShiftRangeMin（app-utils.js）は
          // 休み希望マーク（effShiftStart/End が "" を返す）とメモだけのセルを null にし、
          // 片側セルは候補時間から補完する＝この2行上の補完と同じことを1関数でやる。
          // かつては生の effShiftStart/End を読んで「どちらかが null なら continue」としていたが、
          // それだと休み希望と一緒に**片側セルまで落ちる**。他店舗が「退勤22:00だけ」の日は
          // 自店舗と実際に重なっていても一度も見に行かず、重複エラーが出ないまま二重予約になる
          // （自店舗側で同じ穴を塞いだのがバグチェック#86。他店舗側だけ取り残されていた）。
          // 補完境界は自店舗の候補時間から採る。companyData は他店舗の settings を読んでいないため
          // それしか無く、落として見ないより近い（見落としより過検出のほうが安全な向き＝
          // 重複エラーは表示だけで保存を止めないため）。
          const orng=effShiftRangeMin(osh,settings);
          if(!orng)continue;
          const os=orng.startMin,oe=orng.endMin;
          if(os<e&&oe>s){errs[`${name}|${date}`]=companyData[osid].name;break;}
        }
      });
    });
    return errs;
  },[companyData,heatEditsCalc,subsCalc,settings,selPid,staffList,periods,shopId]);
  // 時刻の入力ミス（項目12・案C）: 退勤≦出勤 のセル。保存は通し、色とエラーパネルで知らせる。
  // 判定は dupErrors と同じ入口（getEffHHMM＝blur確定値）から引くので、保存前の編集も反映される。
  // **両側とも入力されている日だけ**が対象（片側セルは補完の領分で入力ミスではない）。
  // 区分（laborSystem）で絞らない——これは労務の判定ではなく入力データそのものの誤りで、
  // 所属店舗で判定する人（行き先の店・内部値 none）でも、この店舗のセルとして直す必要があるため。
  const timeErrors=useMemo(()=>{
    const errs={};
    realStaff.forEach(name=>{
      dates.forEach(date=>{
        const st=getEffHHMM(name,date,"start"),en=getEffHHMM(name,date,"end");
        if(!st||!en)return;
        if(isTimeOrderInvalid({status:"work",start:st,end:en}))errs[`${name}|${date}`]=true;
      });
    });
    return errs;
  },[realStaff,dates,heatEditsCalc,subsCalc,selPid]);
  // ポジション不足エラー: 日付×ランチ/ディナー×キッチン/ホールで、必要ポジション(settings.requiredPositions)に対する
  // 出勤スタッフの保有ポジション(settings.staffPositions)を最大二部マッチング(matchPositionSlots)し、埋まらない枠を不足として集計する。
  // section判定はheatDataと同じ入口(bandSectionsOf)を使い、ランチ帯/ディナー帯で別々に振り分ける
  // （出勤セルのh/k→ランチ帯、退勤セルのh/k→ディナー帯。分割未設定店舗は常にkitchenに集約）
  const positionErrors=useMemo(()=>{
    const result={}; // {date:{lunch:{kitchen:{pos:不足数},hall:{...}},dinner:{...}}}
    if(!isPremium)return result; // ポジションエラー判定はPremium限定機能（プラン変更後も過去のrequiredPositionsで誤表示しないよう明示的にガード）
    const reqAll=settings.requiredPositions||{};
    const staffPos=settings.staffPositions||{};
    if(!hasAnyRequiredPosition(reqAll))return result;
    dates.forEach(date=>{
      const req=requiredPositionsFor(settings,date);
      const attendees={lunch:{kitchen:[],hall:[]},dinner:{kitchen:[],hall:[]}};
      realStaff.forEach(name=>{
        let s=timeToMin(getEffHHMM(name,date,"start"));let e=timeToMin(getEffHHMM(name,date,"end"));
        // 片側セルのみ入力はヒートマップ(heatData)と同じ規則で補完する
        // （出勤のみ→ランチ終わりまで、退勤のみ→ディナー始まりから出勤扱い）。
        // 補完せず早期returnすると、ヒートマップでは出勤として数えているスタッフが
        // ポジション判定でだけ不在扱いになり、実際には埋まっている枠を「不足」と誤報する（バグチェック#53）
        if(s===null&&e===null)return;
        if(e===null)e=HEAT_LUNCH_END_MIN;
        if(s===null)s=HEAT_DINNER_START_MIN;
        if(s>=e)return;
        {
          const hv=exBandsOf(name,date,s,e);
          if(hv.lunch&&hv.dinner)return;
          if(hv.lunch)s=Math.max(s,HEAT_BAND_SPLIT_MIN);
          if(hv.dinner)e=Math.min(e,HEAT_BAND_SPLIT_MIN);
          if(s>=e)return;
        }
        // ランチ帯とディナー帯でセクションが変わりうるため帯ごとに振り分ける（"kit"→"kitchen"に読み替え）
        const bs=bandSectionsOf(name,date,s,e);
        const secOf=v=>v==="hall"?"hall":"kitchen";
        const positions=staffPos[name]||{lunch:[],dinner:[]};
        if(s<HEAT_BAND_SPLIT_MIN)attendees.lunch[secOf(bs.lunch)].push({name,positions:positions.lunch||[]});
        if(e>HEAT_BAND_SPLIT_MIN)attendees.dinner[secOf(bs.dinner)].push({name,positions:positions.dinner||[]});
      });
      const dayResult={lunch:{kitchen:{},hall:{},all:{}},dinner:{kitchen:{},hall:{},all:{}}};
      ["lunch","dinner"].forEach(meal=>{
        ["kitchen","hall"].forEach(section=>{
          const slots=(req[meal]&&req[meal][section])||[];
          if(slots.length===0)return;
          const{shortageByPosition}=matchPositionSlots(slots,attendees[meal][section]);
          if(Object.keys(shortageByPosition).length>0)dayResult[meal][section]=shortageByPosition;
        });
      });
      // "全て"セクション: キッチン+ホール全員を合算してマッチング
      ["lunch","dinner"].forEach(meal=>{
        const allSlots=(req[meal]&&req[meal].all)||[];
        if(allSlots.length>0){
          const allAttendees=[...attendees[meal].kitchen,...attendees[meal].hall];
          const{shortageByPosition}=matchPositionSlots(allSlots,allAttendees);
          if(Object.keys(shortageByPosition).length>0)dayResult[meal].all=shortageByPosition;
        }
      });
      const hasErr=["lunch","dinner"].some(m=>Object.keys(dayResult[m].kitchen).length>0||Object.keys(dayResult[m].hall).length>0||Object.keys(dayResult[m].all).length>0);
      if(hasErr)result[date]=dayResult;
    });
    return result;
  },[isPremium,subsCalc,heatEditsCalc,settings,selPid,staffList,periods,companyData]);
  // スタッフの帯別所属(キッチン/ホール)判定。positionErrors算出時のsection規則(bandSectionsOf)と同一の入口を使う。
  // 分割なし店舗(hallStaff.length===0)は全員kitchenに集約されるため、キッチン不足＝全スタッフのセルが対象＝従来の「全セル赤」動作になる。
  const staffSectionOn=(name,date,meal)=>{
    if(hallStaff.length===0)return"kitchen";
    let s=timeToMin(getEffHHMM(name,date,"start")),e=timeToMin(getEffHHMM(name,date,"end"));
    // positionErrorsと同じ片側補完。補完せず下の bandSectionsOf に 0 を渡すと、
    // 退勤セルのみのシフトが stM=0（＝ランチ帯から在席）と誤判定され、
    // positionErrors 側の帯振り分けとセル赤ハイライトの帯がズレる（バグチェック#53）
    if(e===null&&s!==null)e=HEAT_LUNCH_END_MIN;
    if(s===null&&e!==null)s=HEAT_DINNER_START_MIN;
    // positionErrorsと同じ帯クリップ（x・他店舗ヘルプ＝excludedBandsOf）。自店舗カウント外の帯は所属判定からも外す。
    // これを行わないと、自店舗カウント外の帯をこの赤ハイライト判定だけ自店舗所属扱いしてズレる。
    if(s!=null&&e!=null&&s<e){
      const hv=exBandsOf(name,date,s,e);
      if(hv.lunch&&hv.dinner)return null;
      if(hv.lunch)s=Math.max(s,HEAT_BAND_SPLIT_MIN);
      if(hv.dinner)e=Math.min(e,HEAT_BAND_SPLIT_MIN);
      if(s>=e)return null;
    }
    const bs=bandSectionsOf(name,date,s==null?0:s,e==null?0:e);
    return(meal==="dinner"?bs.dinner:bs.lunch)==="hall"?"hall":"kitchen";
  };
  // ポジション不足でセルを赤くするか: そのスタッフのその帯の所属セクションに不足がある帯(lunch=出勤行/dinner=退勤行)のみ対象。
  // 所属なし(null=その帯は他店舗ヘルプで自店舗カウント外)はハイライトしない。
  const cellPosErr=(name,date,meal)=>{const pe=positionErrors[date];if(!pe)return false;const sec=staffSectionOn(name,date,meal);if(sec&&Object.keys(pe[meal].all||{}).length>0)return true;if(!sec)return false;return Object.keys(pe[meal][sec]||{}).length>0;};
  // エラーサマリー用に日付順のフラットな一覧へ展開（キッチン/ホール別）
  const positionErrorEntries=useMemo(()=>{
    const kitchen=[],hall=[],all=[];
    dates.forEach(date=>{
      const pe=positionErrors[date];
      if(!pe)return;
      ["lunch","dinner"].forEach(meal=>{
        ["kitchen","hall"].forEach(section=>{
          Object.entries(pe[meal][section]||{}).forEach(([posName,short])=>{
            (section==="kitchen"?kitchen:hall).push({date,meal,posName,short});
          });
        });
        Object.entries(pe[meal].all||{}).forEach(([posName,short])=>{
          all.push({date,meal,posName,short});
        });
      });
    });
    return{kitchen,hall,all};
  },[positionErrors,dates]);
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
    const allCands=[...(settings.candidates||[]),...Object.values(settings.weekdayCandidates||{}).flat(),...Object.values(settings.dateCandidates||{}).flat()].filter(c=>c&&!c.closed&&c.start&&c.end); // c&& の理由は HEAT_LUNCH_END_MIN のコメント参照
    allCands.forEach(c=>{const sh=parseInt(c.start);const eh=parseInt(c.end);for(let h=sh;h<=eh;h++)hrs.add(h);});
    // 実際の提出・入力値から時間帯を収集（退勤延長分・「締」等の追加出勤(extraStart/extraEnd)も含める）
    subs.filter(s=>s.periodId===selPid).forEach(sub=>{Object.values(sub.shifts||{}).forEach(sh=>{if(sh.status!=="work")return;const st=sh.adjustedStart??sh.start,en=sh.adjustedEnd??sh.end;if(st)hrs.add(parseInt(st));if(en){hrs.add(parseInt(en));const ot=getOT(resolveAlias(sub.staffName,staffAliases),settings,sh);if(ot>0){const[h,m]=en.split(":").map(Number);hrs.add(Math.floor((h*60+m+ot)/60));}}if(sh.extraStart)hrs.add(parseInt(sh.extraStart));if(sh.extraEnd)hrs.add(parseInt(sh.extraEnd));});});
    // heatEdits（blur確定値）からも収集
    Object.entries(heatEdits).forEach(([,v])=>{const{numeric}=extractNote(v);const p=parseTime(numeric);if(p)hrs.add(parseInt(p));});
    // 「締」等の固定シフトコマンドが有効な店舗では、その追加出勤時間帯も列として必ず含める
    // （候補時間・提出データに深夜帯がまだ登録されていない新規店舗でも列が欠けないようにする）
    if(fixedShiftEnabled){
      CELL_COMMANDS.filter(c=>c.kind==="fixed").forEach(c=>{
        const sh=parseInt(c.start);const eh=parseInt(c.end);
        for(let h=sh;h<=eh;h++)hrs.add(h);
      });
    }
    if(hrs.size===0){for(let h=9;h<=24;h++)hrs.add(h);}
    const mn=Math.min(...hrs),mx=Math.max(...hrs);
    return Array.from({length:mx-mn+1},(_,i)=>mn+i);
  })();

  // 期間別勤務時間: 同月の全期間を両方表示
  // weeks・sameMoPeriods はメモ化する（S1・2026-10-04）。描画のたびに新しい配列にすると、weeks を依存に持つ
  // weekRestByStaff → laborByStaff（労務判定・割増・36協定の年の集計）が1文字入力・セル選択のたびに全員分やり直される
  const sameMoPeriods=useMemo(()=>{
    if(!period)return[];
    const perD=pd(period.startDate);
    return[...periods].filter(p=>{const d=pd(p.startDate);return d.getFullYear()===perD.getFullYear()&&d.getMonth()===perD.getMonth();}).sort((a,b)=>a.startDate.localeCompare(b.startDate));
  },[period,periods]);
  // 期間別・週間勤務時間の合計は後回しの値で数え、描画のたびには数え直さない（S3。キャッシュの鍵が後回しの subs）
  const totalsCache=useMemo(()=>new Map(),[subsCalc,settings,periods,helperCacheCalc,staffAliases]);
  const getPeriodMin=(pid,name)=>{
    const ck="p|"+pid+"|"+name;
    if(totalsCache.has(ck))return totalsCache.get(ck);
    const v=getPeriodMinRaw(pid,name);totalsCache.set(ck,v);return v;
  };
  const getPeriodMinRaw=(pid,name)=>{
    const p=periods.find(pp=>pp.id===pid);if(!p)return 0;
    const sub=_getSubForPeriod(pid,name); // 日ループの外で1回だけ引く。別名提出者も解決する
    // 他店での勤務（P3.6）は自店の提出が無い期間でも足す
    return gd(p.startDate,p.endDate).reduce((acc,d)=>{const sh=sub&&sub.shifts?.[d];return acc+(sh&&sh.status==="work"?calcNetWorkMinutes(sh,getBreaksFor(settings,d,name,sh),getOT(name,settings,sh),settings):0)+helperMinOn(name,d);},0);
  };

  // 週間勤務時間（前の期間を跨ぐ）
  const prevPeriod=period?([...periods].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate)).find(p=>new Date(p.endDate)<new Date(period.startDate))||null):null;
  const weeks=useMemo(()=>{
    if(!period)return[];
    const allD=[...(prevPeriod?gd(prevPeriod.startDate,prevPeriod.endDate):[]),...gd(period.startDate,period.endDate)];
    const wkSet=new Set();allD.forEach(d=>{const dt=pd(d),dow=dt.getDay(),mon=new Date(dt);mon.setDate(dt.getDate()-(dow===0?6:dow-1));wkSet.add(fd(mon));});
    return[...wkSet].sort();
  },[period,prevPeriod]);
  const getWeekMin=(monStr,name)=>{
    const ck="w|"+monStr+"|"+name;
    if(totalsCache.has(ck))return totalsCache.get(ck);
    const v=getWeekMinRaw(monStr,name);totalsCache.set(ck,v);return v;
  };
  const getWeekMinRaw=(monStr,name)=>{
    let tot=0;for(let i=0;i<7;i++){const dd=new Date(pd(monStr));dd.setDate(pd(monStr).getDate()+i);const ds=fd(dd);const sh=_getWorkShift(name,ds);if(sh)tot+=calcNetWorkMinutes(sh,getBreaksFor(settings,ds,name,sh),getOT(name,settings,sh),settings);tot+=helperMinOn(name,ds);}
    return tot;
  };

  // ===== 労務判定（S-4・第1弾ぶん）=====
  // その日の実働（分）。集計表・週集計とまったく同じ入口（_getWorkShift → calcNetWorkMinutes）を通す
  // ＝同じ日について労務判定と集計表が違う数字を出すことがない。
  // 他店での勤務（P3.6・所属店舗の人だけ）を足した値。月計・週計・労務判定・laborTotals・laborMonths が同じ入口を通る
  const laborDayMin=(name,ds)=>{const sh=_getWorkShift(name,ds);return(sh?calcNetWorkMinutes(sh,getBreaksFor(settings,ds,name,sh),getOT(name,settings,sh),settings):0)+helperMinOn(name,ds);};
  // 入力の確認（F6）が要るこの期間の日。片側だけの日と読めない文字だけのセルの日（inputCheckOfShift）。要修正ではない
  const inputCheckDatesOf=name=>dates.filter(d=>{const r=inputCheckOfShift(_getAnyShift(name,d),abbrToShop);return r.oneSided||r.memoOnly;});
  // 月の枠と、その月の全日。**按分・目安・上限の単位は暦月**だが Shifty の期間は半月のことがあるので、
  // 「選択中の期間の startDate と同じ年月の全日」を月として集計する。
  const laborFrame=useMemo(()=>period?laborMonthFrame(settings,period.startDate):null,[settings,period]);
  const laborMonthDays=useMemo(()=>{
    if(!period)return[];
    const ym=period.startDate.slice(0,7);
    return Array.from({length:daysInMonthOf(ym)},(_,i)=>`${ym}-${String(i+1).padStart(2,"0")}`);
  },[period]);
  // 月単位の値と判定を出す条件（2026-09-26 ユーザー指示で1つに減らした）。
  // **条件は「その月の全日がデータで埋まっていること」（laborMonthCovered）だけ。**
  // 以前はこれに「その月の最後の期間を開いていること」を AND していたが、月が埋まっていれば
  // 前半を開いていても月実働・目安・総括の材料は完全に揃っており、**計算済みの値を表示段階で
  // 捨てていただけ**だった。1ヶ月運用ではその月の期間が1つなので元から差が出ない。
  // 月が埋まっていないときも「要確認」で止めず、**データのある日だけで数えた実数の先頭に `＋` を
  // 付けて出す**（同日ユーザー指示。`＋0h` の形で、`0h＋` のように後ろへ置かない——数値の後ろだと
  // 単位のように読める）。ただし月に帰属する**判定**（目安・月の残業・年の36協定）は
  // 出さない——暦月の枠に途中までの実働を当てると全員が所定未満になり、直しようがない警告で
  // 埋まる。数字は出す・判定は出さない、の切り分けがこの変更の要点。
  // laborIsLastOfMonth は判定には使わず、**period.laborTotals へ月の残業予定を二重に
  // 書かないためだけに残してある**（半月運用で同じ月を2回数えない不変条件）。
  // その月の全日がデータで埋まっているか（期間が存在し、subs の購読窓の中にある）。
  const laborMonthCovered=useMemo(()=>{
    if(!period)return false;
    const cut=subsWindowCutoff();
    return laborMonthDays.every(d=>{
      const p=periods.find(q=>q&&q.startDate&&q.endDate&&q.startDate<=d&&d<=q.endDate);
      if(!p)return false;                                 // その日を含む期間がまだ無い
      if(!pastSubsLoaded&&p.startDate<cut)return false;   // 購読窓の外＝subs を読めていない
      return true;
    });
  },[period,periods,laborMonthDays,pastSubsLoaded]);
  // その月の最後の期間を開いているか。**判定には使わない**（上のコメント参照）。
  const laborIsLastOfMonth=useMemo(()=>{
    const last=sameMoPeriods[sameMoPeriods.length-1];
    return!!(period&&last&&last.id===period.id);
  },[period,sameMoPeriods]);
  // 月の数字が途中である理由。`＋` が付いたセルの title に出す。
  const laborPendingReason=useMemo(()=>{
    if(!period||laborMonthCovered)return "";
    return "その月の日がまだデータで埋まっていません（後半の期間が未作成、または購読の窓の外）。"
      +"数字はデータのある日だけの合計で、月に帰属する判定（目安・月の残業）は月が埋まってから出ます";
  },[period,laborMonthCovered]);

  // その日のデータが読めているか（期間が存在し、subs の購読窓の中か）。
  const laborDayHasData=useCallback(d=>{
    const p=periods.find(q=>q&&q.startDate&&q.endDate&&q.startDate<=d&&d<=q.endDate);
    if(!p)return false;
    return pastSubsLoaded||!(p.startDate<subsWindowCutoff());
  },[periods,pastSubsLoaded]);

  // 週の休み（S-5・判断8）。月曜起算で、前の期間を跨いで数える（weeks が既に跨いでいる）。
  // 公休と**無記入**だけを休みに数え、有給・慶弔は数えない（出勤日に取る休暇のため）。
  // 特定技能の人（属性名に「特定技能」）は、月をまたぐ週は月末側と月初側に各1回の公休が要る（2026-10-01・skilledWeekRestStateOf）
  const weekRestByStaff=useMemo(()=>{
    const out={};
    if(!isPremium)return out;
    realStaff.forEach(name=>{
      const skilled=isSkilledWorkerAttr(settings,name);
      out[name]=weeks.map(monStr=>{
        const kinds=[],wds=[];
        for(let i=0;i<7;i++){
          const dd=new Date(pd(monStr));dd.setDate(pd(monStr).getDate()+i);const ds=fd(dd);
          kinds.push(dayKindWithHelper(name,ds,laborDayHasData(ds)));wds.push(ds);
        }
        return skilled?{...skilledWeekRestStateOf(kinds,wds),skilled:true}:weekRestStateOf(kinds);
      });
    });
    return out;
  },[isPremium,realStaff,weeks,subsCalc,heatEditsCalc,laborDayHasData,selPid,helperCacheCalc,settings]);

  // 年度の区切り（既定4月。設定で暦年にできる）。
  const fyStart=useMemo(()=>fiscalYearStartMonthOf(settings),[settings]);
  const fy=useMemo(()=>period?fiscalYearOf(period.startDate,fyStart):null,[period,fyStart]);
  // 凍結値を持たない期間ぶんを、読めている範囲でその場で数える関数を返す。
  // 読めていない期間は null を返す＝yearLaborSummary が missingPeriodIds に積み、画面で明示する。
  // 休憩・退勤延長は**その期間の設定**（確定済みなら写し）で数える。凍結値を書く側
  // （laborByStaff の pm）がその期間を開いたときの設定で数えているのと揃えるため。
  const periodSettingsCache=useMemo(()=>new Map(),[staffListProp,settingsProp,todayStr]);
  const settingsForPeriod=pp=>{
    if(period&&pp.id===period.id)return settings;
    if(!periodSettingsCache.has(pp.id))periodSettingsCache.set(pp.id,resolvePeriodMaster(pp,staffListProp,settingsProp,todayStr).settings);
    return periodSettingsCache.get(pp.id);
  };
  const liveTotalFor=useCallback(name=>(pp)=>{
    if(!pp||!pp.startDate||!pp.endDate)return null;
    if(!pastSubsLoaded&&pp.startDate<subsWindowCutoff())return null;
    const settings=settingsForPeriod(pp);
    let workMin=0,paid=0,publicOff=0,ceremony=0;
    const ds=gd(pp.startDate,pp.endDate);
    // **空欄も公休として数える**（2026-09-26 ユーザー指示）。以前は「出勤も休暇も1日も無い期間」を
    // 0に倒していたが、空欄が公休である以上その期間はまるごと公休で、0ではない。
    const kinds=ds.map(d=>dayKindWithHelper(name,d,true));
    ds.forEach((d,i)=>{
      const sh=_getWorkShift(name,d);
      if(sh)workMin+=calcNetWorkMinutes(sh,getBreaksFor(settings,d,name,sh),getOT(name,settings,sh),settings);
      workMin+=helperMinOn(name,d); // 他店での勤務（P3.6）
      const hd=leaveHalfDaysOf(_getAnyShift(name,d));
      paid+=hd.paid;ceremony+=hd.ceremony;
      if(!hd.paid&&!hd.ceremony&&kinds[i]==="rest")publicOff++;
    });
    return{workMin,paid,publicOff,ceremony};
  },[settings,subsCalc,pastSubsLoaded,staffAliases,periodSettingsCache,period,helperCacheCalc]);

  // 割増（P5）: 自店の実績（無ければ確定シフト）＋他店の勤務
  const premiumDayCache=useMemo(()=>new Map(),[settings,subsCalc,act.map,helperCacheCalc,periods,pastSubsLoaded]);
  const premiumDayOf=(name,d)=>{
    const k=name+"|"+d;
    if(premiumDayCache.has(k))return premiumDayCache.get(k);
    const sh=_getWorkShift(name,d);
    const pp=periods.find(q=>q&&q.startDate&&q.endDate&&q.startDate<=d&&d<=q.endDate);
    const hi=helperInfo[name];
    const v=premiumDayInput({date:d,hasData:laborDayHasData(d),kind:dayKindWithHelper(name,d,laborDayHasData(d)),
      own:resolveActualDay({shifts:sh?{[d]:sh}:{}},pp&&act.enabled?actualOf(act.map,pp.id,name,d):null,d,settings,name),
      helpers:hi&&hi.role==="home"?helperActualDaysOn({regs:hi.regs,otherShops:helperShops,date:d,todayStr,
        companySettings:companyLink?(companyLink.settings||null):null,ownRange:sh?effShiftRangeMin(sh,settings):null,cache:helperCacheCalc.settings}):[]});
    premiumDayCache.set(k,v);
    return v;
  };
  const premiumForMonth=(name,ym,sys)=>premiumMonthOf({ym,system:sys,settings,dayOf:d=>premiumDayOf(name,d)});
  // 年単位の36協定判定で、凍結値を持たない月の残業予定をその場で数える関数を返す。
  // 月の全日が読めていないときは null（＝yearOvertimeMonths が missingMonths に積む）。
  // {h:残業予定（B制は①＋②）, ag:時間外＋法定休日}（P5）
  const liveMonthOtFor=useCallback(name=>(ym)=>{
    const n=daysInMonthOf(ym);
    if(!n)return null;
    const days=Array.from({length:n},(_,i)=>`${ym}-${String(i+1).padStart(2,"0")}`);
    if(!days.every(d=>laborDayHasData(d)))return null;
    const sys=laborSystemForStaff(settings,name);
    const pb=premiumForMonth(name,ym,sys);
    if(sys==="B")return{h:pb.otH,ag:pb.agH};
    // 按分窓（属性の otProrate・P3.5b）を画面と同じ overtimePlanOf で通す（年の36協定と画面の月の残業予定を揃える）
    return{h:overtimePlanOf({dates:days,dayMins:days.map(d=>laborDayMin(name,d)),baseMin:laborMonthFrame(settings,ym).baseMin,
      prorate:staffOtProrateOf(settings,name)}).monthOtH,ag:pb.agH};
  },[settings,subsCalc,laborDayHasData,staffAliases,helperCacheCalc,premiumDayCache]);

  // スタッフ1人ぶんの労務の集計。日次の件数は**選択中の期間の日**、月単位の判定は**暦月**で数える
  // （利用者が今そこで直せる範囲＝期間、法令・協定の単位＝月）。
  // 合計（totals）は useMemo の結果として返す（S3）。後回しの描画は途中で捨てられることがあるので、描画中に ref へ書くと
  // 画面に出ていない計算の値を laborTotals の保存が拾いうる
  // セルの紫（労務の要確認・2026-10-08 ユーザー指示）のうち、属性の勤務時間の上限を超えた日。
  // 窓と比べる値は既存の表示と同じ: 週＝週間勤務時間の表（getWeekMin）、1ヶ月＝期間別勤務時間の「月計」（getPeriodMin の和）、
  // 2週間・任意日数＝提出一覧のバッジと同じ rollingLimitOverWindows（attrLimitOverDatesOf・app-utils.js）
  const attrLimitDatesFor=name=>attrLimitOverDatesOf({lim:staffLimitOf(settings,(settings.staffAttributes||{})[name]),dates,
    minOf:d=>laborDayMin(name,d),weeks,weekMinOf:ws=>getWeekMin(ws,name),monthYm:period?period.startDate.slice(0,7):"",
    monthMin:sameMoPeriods.reduce((a,p)=>a+getPeriodMin(p.id,name),0)});
  // 特定技能の週の公休不足の週の出勤日（月をまたぐ週は足りなかった月の側だけ）。週の判定は週の休みの表と同じ weekRestByStaff
  const skilledShortDatesFor=name=>weeks.flatMap((ws,i)=>{
    const st=(weekRestByStaff[name]||[])[i];
    if(!st||!st.skilled||!isSkilledWeekRestShort(st))return[];
    const wds=[];for(let k=0;k<7;k++){const dd=new Date(pd(ws));dd.setDate(pd(ws).getDate()+k);wds.push(fd(dd));}
    return skilledShortWorkDates(st,wds,wds.map(d=>dayKindWithHelper(name,d,laborDayHasData(d))));
  });
  const laborCalc=useMemo(()=>{
    const out={},totals={};
    if(!isPremium||!period||!laborFrame)return{out,totals:null};
    const ls=laborSettingsOf(settings);
    const agDay=ls.agreementDailyOtMin/60, agMonth=ls.agreementMonthlyOtMin/60, fixOt=ls.fixedOvertimeMin/60;
    const agYear=ls.agreementAnnualOtMin/60;
    const monthIdx={};laborMonthDays.forEach((d,i)=>{monthIdx[d]=i;});
    realStaff.forEach(name=>{
      // 所属店舗が別の連携店舗にある人（P3.6）は所属店舗で合算して判定する。この店舗では判定せず、
      // 凍結値（laborTotals）にも入れない（同じ時間を2店舗で数えない。有給残と同じ「所属店舗に1本化」）
      const hi=helperInfo[name];
      if(hi&&hi.role==="dest"){
        // 入力の確認（F6）はこの店舗のセルの話なので、所属店舗で判定する人にも出す（総括は「所属店舗で判定」のまま）
        // セルの紫は属性の上限超だけ（週間勤務時間の表の赤と同じ窓。労務の判定は所属店舗で行う）
        const destDayFindings=laborDayFindingsFor({laborSystem:"none",dayMins:dates.map(d=>laborDayMin(name,d)),dayDates:dates,
          attrLimitDates:attrLimitDatesFor(name)});
        out[name]={dest:true,homeName:hi.homeName,sys:"none",monthWorkMin:0,findings:laborFindingsFor({laborSystem:"none",inputCheckDates:inputCheckDatesOf(name)}),dayFindings:destDayFindings,guide:{key:"none",label:"",color:null},
          overall:{key:"dest",label:"所属店舗で判定"},monthCovered:laborMonthCovered,paidRemain:null,year:null};
        return;
      }
      const sys=laborSystemForStaff(settings,name);
      const monthMins=laborMonthDays.map(d=>laborDayMin(name,d));
      const monthWorkMin=monthMins.reduce((a,b)=>a+b,0);
      // 按分は**月が埋まっていなくても計算する**（2026-09-26 ユーザー指示。以前は
      // laborMonthCovered を条件にして 0 に倒していた）。暦月の枠に途中までの実働を当てるので
      // 月が埋まるまでは 0h になりやすいが、それが現時点の実数。画面は `＋` で途中を示す。
      // **月の全日でやる**——日別の和が月の残業予定と一致する形が崩れるので期間で切らない。
      // 按分窓は属性の設定（otProrate・P3.5b）。未設定なら従来どおり「月実働−総枠」を月の全日に配る。
      const otPlan=sys==="A"?overtimePlanOf({dates:laborMonthDays,dayMins:monthMins,baseMin:laborFrame.baseMin,
        prorate:staffOtProrateOf(settings,name)}):null;
      const monthOtH=otPlan?otPlan.monthOtH:0;
      const monthOtDays=otPlan?otPlan.dayOtH:[];
      const periodOtH=dates.map(d=>(monthIdx[d]!=null?(monthOtDays[monthIdx[d]]||0):0));
      // この期間（半月運用なら半月）ぶんの残業予定。日別の按分をこの期間の日だけ足す。
      const periodOtSumH=excelRound(periodOtH.reduce((a,b)=>a+b,0),2);
      // **dates と同じ並びで渡す**（0分の日も落とさない）。労務判定は該当日をラベルに出すので、
      // 添字が dates・periodOtH とずれると別の日が表示される。`4h未満` は関数側が m>0 で絞る。
      const dayMins=dates.map(d=>laborDayMin(name,d));
      // B制の日ごとの「しきい値超」（店舗トグル showDailyOverB・P3.5b）。オフなら null＝表に出さない
      const dayOverB=(sys==="B"&&ls.showDailyOverB===1)?dailyOverMinB(dayMins,dailyOverThresholdOf(ls)):null;
      const weekMins=sys==="B"?weeks.map(monStr=>{
        const arr=[];
        for(let i=0;i<7;i++){const dd=new Date(pd(monStr));dd.setDate(pd(monStr).getDate()+i);arr.push(laborDayMin(name,fd(dd)));}
        return arr;
      }):[];
      const teDates=dates.filter(d=>!!timeErrors[`${name}|${d}`]);
      // **該当日をラベルに出す**（2026-09-26 ユーザー指示）。日に帰属する判定はすべて対象で、
      // 特にセル色を付けない判定（4h未満・休憩不足）は日付が無いと画面から辿れない。
      // 他店での勤務の休憩不足は行き先の店の設定で判定した結果（P3.6・helperWorkOn）
      const bsDates=dates.filter(d=>{const sh=_getWorkShift(name,d);return(!!sh&&isBreakShort(sh,settings,d,name))||helperEntriesOn(name,d).some(e=>e.breakShort);});
      const weekNoRest=(weekRestByStaff[name]||[]).some(w=>w&&w.key==="none");
      // 特定技能の週の公休不足（2026-10-01）。該当週を「労務の確認が必要です」に出す（総括は要修正）
      const skilledWeekDates=weeks.filter((w,i)=>{const st=(weekRestByStaff[name]||[])[i];return!!st&&st.skilled&&isSkilledWeekRestShort(st);});
      const prem=(sys==="A"||sys==="B")?premiumForMonth(name,laborMonthDays[0].slice(0,7),sys):null;
      const monthOtB=sys==="B"&&prem?prem.otH:0,monthAgH=prem?prem.agH:0;
      const findings=laborFindingsFor({laborSystem:sys,dayMins,dayDates:dates,weekDayMins:weekMins,weekDates:weeks,
        timeErrorDates:teDates,breakShortDates:bsDates,skilledWeekDates,
        inputCheckDates:inputCheckDatesOf(name),staffNumberMissing:isStaffNumberMissing(settings,name),
        monthOtH:sys==="B"?monthOtB:monthOtH,monthAgreementH:monthAgH,dayOtH:periodOtH,agreementDailyOtH:agDay,agreementMonthlyOtH:agMonth,fixedOtH:fixOt,monthReady:laborMonthCovered});
      // 36協定の年単位4項目（年360h・年720h・月45h超が年6回・複数月平均80h）。
      // 月の値は「その月の最後の期間」に残した凍結値を優先するので、過去参照を押さなくても効く。
      let yearOt=null;
      if((sys==="A"||sys==="B")&&laborMonthCovered&&fy!=null){
        yearOt=yearOvertimeMonths(periods,name,fy,fyStart,liveMonthOtFor(name));
        agreementYearFindings(yearOt.scoped,agYear).forEach(f=>findings.push(f));
      }
      // 目安は**月が埋まっていなくても現状の実数で出す**（2026-09-26 ユーザー指示。以前は
      // 「要確認」に倒していた）。暦月の枠に対する途中の値なので `＋` と淡色で示し、
      // **総括には入れない**（overallVerdictOf の monthReady が key を捨てる）。
      const guideRaw=sys!=="A"?{key:"none",label:"",color:null}
        :guideStatusOf(monthWorkMin,laborFrame.baseMin,ls.fixedOvertimeMin,laborFrame.guideMin,laborFrame.scheduledCapMin);
      const guide=(sys==="A"&&!laborMonthCovered&&guideRaw.label)
        ?{...guideRaw,label:`＋${guideRaw.label}`,color:"var(--c-text3)",
          title:`${guideRaw.label}（データのある日だけで計算した途中の値）／${laborPendingReason}`}
        :guideRaw;
      const overall=overallVerdictOf({laborSystem:sys,findings,guideKey:guide.key,weekNoRest,monthReady:laborMonthCovered});
      // 割増の該当日（要修正ではない）
      if(prem)premiumFindingsFor(prem,{system:sys,dates}).forEach(f=>findings.push(f));
      const periodOtB=sys==="B"&&prem?dates.reduce((a,d)=>a+(prem.perDay[d]||0),0):0;
      // この期間の休暇日数。**シフト表の空欄は公休**（2026-09-26 ユーザー指示）なので、
      // 1日も出勤が無い人もその期間ぶんが丸ごと公休になる（以前はここを0に倒していた）。
      const kinds=dates.map(d=>dayKindWithHelper(name,d,true));
      let paidD=0,pubD=0,ceD=0;
      // 有給・慶弔は**半日＝0.5日**で数える。公休は日単位（無記入の日も含む）。
      dates.forEach((d,i)=>{
        const hd=leaveHalfDaysOf(_getAnyShift(name,d));
        paidD+=hd.paid;ceD+=hd.ceremony;
        if(!hd.paid&&!hd.ceremony&&kinds[i]==="rest")pubD++;
      });
      // 年度の累計。**提出を読めている期間は実データで数え**（2026-09-29 ユーザー指示）、
      // 読めない期間だけ凍結時に残した laborTotals で埋める＝過去参照を押さなくても出る。
      const yr=fy==null?null:yearLaborSummary(periods,name,fy,fyStart,liveTotalFor(name),true);
      // セルを紫で塗る日（dates と同じ並び・2026-10-08 ユーザー指示）。12h超・法定休日労働・月60h超・
      // 特定技能の週の公休不足の週の出勤日・属性の上限超。1日の残業の上限超（A制・B制）は塗らない（パネルには出る）
      const dayFindings=laborDayFindingsFor({laborSystem:sys,dayMins,dayDates:dates,
        // 月60h超は出勤した日だけ（週の時間外②は週の最後の日＝空欄の日曜にも載るので、空欄のセルは塗らない）
        legalHolidayDates:prem?prem.legalHolidayDates:[],over60Dates:prem?over60DatesOf(prem).filter(d=>laborDayMin(name,d)>0):[],
        skilledWeekRestDates:skilledShortDatesFor(name),attrLimitDates:attrLimitDatesFor(name)});
      out[name]={sys,monthWorkMin,monthOtH,periodOtSumH,otWindow:otPlan&&otPlan.fixed?otPlan.window:null,dayOverB,
        prem,monthOtB,periodOtB,
        monthCovered:laborMonthCovered,yearOt,findings,guide,overall,weekNoRest,dayFindings,
        periodLeave:{paid:paidD,publicOff:pubD,ceremony:ceD},year:yr,
        paidRemain:yr?paidLeaveRemaining(settings,name,yr.paid):null,
        // 他店の勤務を読めていない（合算値が足りない）。表は「＋」と注記を出す（P3.6）
        helperUnread:!!(hi&&hi.unread),helperShopNames:hi&&hi.role==="home"?[...new Set(hi.regs.map(r=>(helperShops[r.shopId]||{}).name||r.shopId))]:[]};
      // この期間ぶんの合計（凍結時に periods へ残す値）。上の useEffect が書く。
      const pm=dates.reduce((a,d)=>a+laborDayMin(name,d),0);
      // 月の残業予定は**その月の最後の期間にだけ**残す（半月運用で年度集計が2重にならない）。
      // **月が埋まっていない間は残さない**（0＝compactLaborTotal が落とす）。画面には途中の実数を
      // 出すが、凍結値に途中の値を書くと yearOvertimeMonths が live での数え直しに降りず、
      // 「読めていない月」の印も付かないまま年度の合計が黙って小さく出る。
      // B制は①＋②を残す（P5）。他店の実績を読めていない人は途中の値なので残さない
      const lastOk=laborIsLastOfMonth&&laborMonthCovered&&!(prem&&prem.unread);
      const c=compactLaborTotal({workMin:pm,paid:paidD,publicOff:pubD,ceremony:ceD,
        monthOtH:lastOk?(sys==="B"?monthOtB:monthOtH):0,monthAgH:lastOk?monthAgH:0});
      if(c)totals[name]=c;
    });
    return{out,totals};
  },[isPremium,period,laborFrame,laborMonthDays,laborMonthCovered,laborIsLastOfMonth,laborPendingReason,realStaff,dates,weeks,settings,heatEditsCalc,subsCalc,timeErrors,selPid,weekRestByStaff,periods,fy,fyStart,liveMonthOtFor,liveTotalFor,helperInfo,helperCacheCalc,premiumDayCache,abbrToShop,totalsCache,sameMoPeriods]);
  const laborByStaff=laborCalc.out;

  // 期間が生きている間はシフト作成タブを開くたびに写しと労務の合計を最新化し、最終日を超えたら
  // 更新を止める＝そこで凍結。「確定の瞬間に撮る」ではなく「確定まで撮り続ける」形にしないと、
  // 最終日を過ぎてから初めてアプリを開くまでの間に行われたスタッフ削除を取りこぼす。
  // 合計を残しておくと、年度の累計を出すのに古い期間の subs を読み直さなくて済む
  // （subs は直近3ヶ月の部分購読だが periods は起動時に全件購読するため）。
  // 内容に変化があるときだけ書く。ownerReadOnly端末は periods への書き込みがルールで拒否される。
  useEffect(()=>{
    if(ownerReadOnly||!savePeriods||!period)return;
    if(isPeriodEnded(period,todayStr))return;
    // 後回しの計算が済むまで書かない（S3。確定の直後の描画の合計は1つ前の subs の値）
    if(calcPending)return;
    const nextSnap=buildPeriodSnapshot(staffListProp,settingsProp);
    // 他店舗の読み込みが終わるまでは労務の合計を書かない（ヘルプ先勤務の合算・P3.6 が入る前の値で凍結しない）
    const nextTotals=companyDataReady?(laborCalc.totals||{}):{};
    // **確定済みの期間は写しを最新化しない**（P3）。確定の瞬間に書いた写しがその期間のマスタで、ここで上書きすると
    // 確定後のスタッフ・属性・退勤延長の変更が流れ込み、確定の意味がなくなる。労務の合計は従来どおり終了まで書く。
    const snapSame=isPeriodConfirmed(period)||periodSnapshotEqual(period.snapshot,nextSnap);
    const totalsSame=!Object.keys(nextTotals).length||laborTotalsEqual(period.laborTotals,nextTotals);
    if(snapSame&&totalsSame)return;
    savePeriods(periods.map(p=>{
      if(!p||p.id!==period.id)return p;
      const n={...p};
      if(!snapSame)n.snapshot=nextSnap;
      if(!totalsSame)n.laborTotals=nextTotals;
      return n;
    }));
  },[period,staffListProp,settingsProp,periods,ownerReadOnly,todayStr,savePeriods,laborCalc,companyDataReady,calcPending]);

  const laborFindings=useMemo(()=>{
    if(!isPremium)return[];
    const out=[];
    realStaff.forEach(name=>{
      const sys=laborSystemForStaff(settings,name);
      const dayMins=dates.map(d=>laborDayMin(name,d)).filter(m=>m>0);
      // B制の週40h超は月曜起算（weeks は前の期間ぶんも含む）。データの無い日は0分で入るので、
      // 前月・翌月にまたがる週は結果として「データのある日だけ」で計算されたのと同じになる（S-5）。
      void sys;void dayMins;
      const all=laborByStaff[name]?.findings||[];
      // findings は PDF の「労務の確認が必要です」、screen は画面の一覧（SHIFT_TAB_HIDDEN_FINDING_KEYS を除く）
      const f=all.map(x=>x.label);
      if(f.length)out.push({name,findings:f,screen:shiftTabFindingLabels(all)});
    });
    return out;
  },[isPremium,realStaff,dates,settings,laborByStaff]);

  // セルを紫で塗る日（セル色用）。`名前|日付` → 理由キーの配列（一覧は app-utils.js の LABOR_DAY_FIX_KEYS）。
  // 週・月の窓で判定するもの（特定技能の週の公休不足・属性の週／2週間／1ヶ月／任意日数の上限）は窓の中の出勤日を塗る。
  // 週40h超・月の残業・目安・1日の残業の上限超は塗らない＝パネルに名前が出ていてもセルが塗られないことがある。
  const laborDayErrors=useMemo(()=>{
    const m={};
    if(!isPremium)return m;
    Object.entries(laborByStaff).forEach(([name,l])=>{
      (l&&l.dayFindings||[]).forEach((keys,i)=>{
        if(keys&&keys.length&&dates[i])m[`${name}|${dates[i]}`]=keys;
      });
    });
    return m;
  },[isPremium,laborByStaff,dates]);
  const laborErrTitle=(name,date)=>{
    const keys=laborDayErrors[`${name}|${date}`];
    if(!keys||!keys.length)return"";
    return"労務の要修正: "+keys.map(k=>LABOR_DAY_ERR_LABELS[k]||k).join("・");
  };

  // "h"なし勤務時間フォーマット
  const fmtH=min=>{if(!min)return"";const h=Math.floor(min/60);const m=min%60;return m===0?String(h):`${h}:${String(m).padStart(2,"0")}`;};
  // 画面の集計表用: 4桁以内に抑える（100時間以上は時間のみ）。列幅がグリッドとずれるのを防ぐ
  const fmtH4=min=>{if(!min)return"";const h=Math.floor(min/60);const m=min%60;if(h>=100)return String(h);return m===0?String(h):`${h}:${String(m).padStart(2,"0")}`;};
  // 日付を"日(曜)"のみ表示（月不要）
  const fmtDL=date=>{const d=pd(date);return`${d.getDate()}(${WD[d.getDay()]})`;};
  const BD="1px solid var(--c-border)";const BD2="1px solid var(--c-border2)";const CRD="var(--c-card)";
  // サイドパネル: 通常表示+split時かつ左右に十分な余白があるPC幅のみ（携帯・タブレットではグリッド下に表示）
  const hasSplit=hallStaff.length>0;
  // **縦スクロールバーの幅を含まない**表示幅。window.innerWidth はバーを含むので、
  // それで幅を割り振ると実測で6pxほど足りず最後の列が切れる（2026-09-23 実測）。
  const viewW=(document.documentElement&&document.documentElement.clientWidth)||window.innerWidth;
  const rawPanelW=Math.max(0,containerLeft-4);
  // キッチン/ホール絞り込み中は絞り込んだ側のみ横パネル候補にする（もう一方は常にグリッド下）
  const deptSidePanel=deptFilter==="kit"?"kit":deptFilter==="hall"?"hall":null;
  // 熱マップ行高: 計測値があれば使う、なければフォールバック
  const heatRowH=measuredRowH||48;
  // キッチン/ホール絞り込み時の追加表示スタッフ: 相手グループでも該当サフィックス(k/h)が
  // 期間内のどこかのシフトに付いていればヘルプ要員として表示に含める
  const kitchenGroup=realStaff.filter(n=>!hallStaff.includes(n));
  const kitExtra=hasSplit?hallStaff.filter(n=>dates.some(d=>getShiftNote(n,d)==="k")):[];
  const hallExtra=hasSplit?kitchenGroup.filter(n=>dates.some(d=>getShiftNote(n,d)==="h")):[];
  const kitExtraSet=new Set(kitExtra),hallExtraSet=new Set(hallExtra);
  // gridStaff: spacer列を含む列描画リスト（絞り込み時はspacerなしの単一列リスト。集計はrealStaffのまま）
  const gridStaff=deptFilter==="kit"?realStaff.filter(n=>!hallStaff.includes(n)||kitExtraSet.has(n))
    :deptFilter==="hall"?realStaff.filter(n=>hallStaff.includes(n)||hallExtraSet.has(n))
    :staffList;
  // === 横パネルを使うか・ヒートマップの時間帯をどう出すか ===
  // **ヒートマップの幅は常に通常表示と同じ（rawPanelW）に固定する**（2026-09-23 ユーザー指示）。
  // スタッフ数に応じて伸縮させない。その固定幅のまま「全時間帯を詰めて出す」か「横スクロールする」かを
  // 切り替える。1列9px を確保できるなら詰めて全部出し、足りなければ従来どおり22px幅でスクロールする。
  const HEAT_MIN_HOURW=9;
  const heatHourCount=Math.max(1,heatHours.length);
  // その幅なら全時間帯を横スクロールなしで出せるか。52pxは日付列・8pxは枠線（heatInnerW と同じ内訳）。
  const heatFitsIn=w=>((w||0)-52-8)>=HEAT_MIN_HOURW*heatHourCount;
  // 詰めない（fitHours なし）ときの実測の列幅。HeatTable の `minWidth:22` に padding 左右1pxが付く。
  const HEAT_NAT_HOURW=24;
  // 固定幅のまま全時間帯を置くのに要る枠幅。これを下回るときだけ詰める。
  const heatNaturalW=52+HEAT_NAT_HOURW*heatHourCount+8;
  const heatNeedsFit=w=>(w||0)<heatNaturalW;
  // ヒートマップ1枚の幅。**置き場所（セルの横の横パネル／グリッド下）によらず同じ幅**にする
  // （2026-09-23 ユーザー指示）。2枚並びを基準に、通常表示の幅の半分（gap 10px を引く）で固定する。
  // 絞り込み無しの通常表示の横パネルだけは従来どおり左余白の幅のまま（既存の見た目を変えないため）。
  // **半分の幅では全時間帯が収まらず、全幅なら収まるときは1枚あたり全幅にする**（＝縦積みになる。
  // 2026-09-23 ユーザー指示）。携帯（幅375px）では半分が約166pxで時間帯に使えるのは約106pxしかなく、
  // 16時間ぶんは最小の9px/列にも届かないため、半分のままだと必ず横スクロールに落ちる。
  const heatBelowHalfW=normalW?Math.floor((normalW-10)/2):null;
  // 縦積みにしたときの1枚の幅。**normalW をそのまま使ってはいけない**——測っている outerRef は
  // 左右 padding 8px を持つので、中身が実際に使えるのは normalW-16 しかない。normalW を渡すと
  // 横パネルを使わない通常表示でページ全体が16px横スクロールする（バグチェック#73 と同じ形）。
  const heatBelowFullW=normalW?normalW-16:null;
  const heatBelowStacked=!!normalW&&!heatFitsIn(heatBelowHalfW)&&heatFitsIn(heatBelowFullW);
  const heatBelowW=heatBelowStacked?heatBelowFullW:heatBelowHalfW;
  // グリッド下へ回したときに全時間帯を出せるか。置き場所の選択（heatPanelUsable）にも使う。
  const belowFitsAll=heatFitsIn(heatBelowW);
  // 絞り込み中の横パネルの幅。**スタッフの全表示を最優先**し、グリッドが必要な幅を先に確保してから、
  // 余った幅をヒートマップに回す（2026-09-23 ユーザー指示）。ただし下に出すときと同じ幅を上限にして、
  // それ以上には広げない。上限は**縦積みにする前の半分幅**で据え置く——縦積みは下に出すときの話で、
  // 横パネルを広げる理由にはならない。+32 はグリッド枠の border・flex の gap と左右 padding・丸め（実測）。
  // 日付列（グリッド左端と、休みカウント表・集計表のラベル列）の幅。**通常表示と全表示で同じ値**に
  // 統一する（2026-09-23 ユーザー指示。それまでは通常表示90px・全表示45pxで食い違っていた）。
  // 45px は fmtDL の "31(土)"＝半角4+全角1 が収まる幅として全表示で実証済み。
  const DATE_COL_W=45;
  // 45px に 16px のフォントは入らない（"31(土)" で約43px必要）ので、通常表示の日付も詰める。
  // RULES.md の16px規約は input/select/textarea が対象で、td/th のここは対象外。
  const DATE_COL_FONT=13;
  const gridNeedW=DATE_COL_W+39*Math.max(1,gridStaff.length)+32;
  const heatLeftoverW=Math.max(0,viewW-24-gridNeedW);
  const heatPanelW=deptSidePanel
    ?Math.min(heatBelowHalfW||rawPanelW,heatLeftoverW)
    :rawPanelW;
  const heatInnerW=heatPanelW-52-8;              // 日付列52pxと枠線を引いた、時間帯に使える幅
  const heatFitsAll=heatFitsIn(heatPanelW);
  const heatVisibleHours=Math.max(0,Math.floor(heatInnerW/22)); // スクロール時に一度に見える時間数
  // **3時間ぶん出せるならセルの横（横パネル）、2時間以下になるなら下へ回す**（2026-09-23 ユーザー指示）。
  // 下へ回したときは全表示と同じく両方のヒートマップを並べる。
  // ただし**携帯幅だけは、横パネルで全時間帯を出せないのに下へ回せば出せるとき、下を選ぶ**
  // （2026-09-23 ユーザー指示の「全時間帯をスクロールなしで出す」を、携帯に限り置き場所より優先する）。
  // これが無いと、日付列を90px→45pxに詰めてグリッドが軽くなった分だけ横パネルが成立してしまい、
  // 携帯の絞り込み表示が「全幅で全時間帯」から「157pxで4時間ぶんの横スクロール」へ戻る（実測）。
  // **この下優先を携帯幅に限るのは同日の再指示**。幅を見ずに効かせていた版では、タブレット幅でも
  // 下へ回っていた（実測: 768px×24名が横パネル199px→下。以前は横パネルだった条件）。
  // パネル幅も見える時間数も 414px×6名（194px・6時間）と 768px×24名（199px・6時間）でほぼ同値なので、
  // **この2つを分けられる変数は画面幅しかない**。600px は両者の間で、iPhone の横持ち(844px)は
  // タブレット側に入る。
  const HEAT_PANEL_MIN_HOURS=3;
  const HEAT_BELOW_FIRST_MAX_W=600;
  const heatPanelUsable=heatFitsAll||(heatVisibleHours>=HEAT_PANEL_MIN_HOURS&&!(belowFitsAll&&viewW<HEAT_BELOW_FIRST_MAX_W));
  // 余った幅で4時間ぶんも出せないならセルの横をあきらめて下へ回す（時間帯の条件だけで決める）。
  const hasPanel=deptSidePanel?heatPanelUsable:(hasSplit&&!fitAll&&rawPanelW>=150);
  const kitShownAsPanel=hasPanel&&deptSidePanel!=="hall";
  const hallShownAsPanel=hasPanel&&deptSidePanel!=="kit"&&hasSplit;
  const kitBelow=!kitShownAsPanel;
  const hallBelow=hasSplit&&!hallShownAsPanel;
  // 絞り込み中は横パネルの有無にかかわらず画面幅を使う。パネルを下へ回したときに通常幅へ戻ると、
  // せっかく空けた幅をグリッドが使えず**28名で332pxの横スクロールに戻る**（実測）。
  const useBreakout=hasPanel||fitAll||deptFilter!=="all";
  const panelCount=(kitShownAsPanel?1:0)+(hallShownAsPanel?1:0);
  const panelW=hasPanel?heatPanelW:0;
  // **時間帯の列幅は1列24pxに固定し、枠いっぱいに引き伸ばさない**（2026-09-23 ユーザー指示）。
  // `fitHours` は `table-layout:fixed` + `width:100%` なので、立てると列が枠幅まで伸びる。
  // 立てるのは**自然幅では収まらないときだけ**にする＝収まるなら固定幅のまま、収まらないなら
  // 詰めて全時間帯を出す（それでも足りなければ従来どおり横スクロール）。
  // これを無条件にしていた版では、通常表示・全表示の列幅が24px→39.7pxへ伸びていた（実測）。
  const fitHeatHoursPanel=heatFitsAll&&heatNeedsFit(heatPanelW);
  const fitHeatHoursBelow=belowFitsAll&&heatNeedsFit(heatBelowW);
  // 中央グリッド幅 = ブレイクアウト時はビューポート幅 - パネル分
  const centerW=useBreakout?(viewW-panelW*panelCount-24):containerW;
  // 不足情報・ヒートマップ・操作方法は、全表示でも絞り込み中でも**通常表示の幅のまま**据え置く。
  // 広げてよいのはシフト表のグリッドと、それに列を揃える集計表だけ（2026-09-23 ユーザー指示）。
  // **maxWidth では足りない**——親（中央カラム）が横パネルのぶん狭くなると一緒に縮んでしまう。
  // 幅を実値で固定したうえで、画面中央に戻す（従来どおりの中央揃え）。親の左端は
  // ブレイクアウトの padding 8px ＋ 左パネル（キッチン側）なので、その分を marginLeft で打ち消す。
  const NORMAL_W=(useBreakout&&normalW)?{
    width:normalW,maxWidth:"none",boxSizing:"border-box",marginRight:0,
    marginLeft:centerColLeft!=null?Math.round((viewW-normalW)/2-centerColLeft):0,
  }:{};
  // === 全表示（新レイアウト）===
  // 2026-09-23 に本番解放（それまでは `fitAll&&DEV_MODE` で Dev 限定にしていた）。
  const fullView=fitAll;
  // レイアウトは毎レンダーの割り算だけで決める（都度計算）。DOM計測は gridTop の1つだけで、
  // その値はここの出力に依存しないため測り直しのループが起きない。
  const fvDateW=DATE_COL_W;                           // 両端の日付列。通常表示と同じ幅（DATE_COL_W）
  const fvAvailW=Math.max(320,centerW-8);
  const fvAvailH=Math.max(200,(gridTop!=null?window.innerHeight-gridTop:Math.round(window.innerHeight*0.72))-8);
  const fvNameH=Math.min(72,Math.max(24,Math.round(fvAvailH*0.12)));  // 縦書きスタッフ名の高さ
  // thead は tr に height を明示して高さを確定させる（明示しないと中身なりの高さになり、予約とズレる）。
  // 行高は**小数のまま**使う。整数に丸めると1px刻みでしか調整できず、収まる最大値を1px下回った時点で
  // 行数ぶん（31日なら62px）まとめて捨てることになる。
  // 差し引く 0.5 は border-collapse の分け合うボーダー。実測で1行あたり指定値+0.5pxになる。
  // さらに 6px は枠線(2px)と丸め誤差のための安全代（実測: これが無いと4pxはみ出す）。
  const fvTheadH=fvNameH+10;
  // **1画面に収めるのは2週間ぶんまで**（2026-09-23 ユーザー指示）。1ヶ月の期間を選んでいても
  // 行高は2週間ぶんで決め、はみ出す日は縦スクロールで見る。こうしないと1ヶ月×30名で
  // セルのフォントが下限の5pxまで落ちて時刻が読めなくなる（実測）。
  // 16日なのは Shifty の「2週間」期間が半月単位＝最長16日（16日〜月末）だから。
  const FV_MAX_DAYS=16;
  const fvFitDays=Math.max(1,Math.min(dates.length,FV_MAX_DAYS));
  // 2週間ぶんに収める結果、1ヶ月の期間では縦スクロールが起きる。**そのときだけスタッフ名の行を
  // 上端に固定する**（2026-09-23 ユーザー指示）。固定しないと下へスクロールした時点でどの列が
  // 誰か分からなくなる。全部が1画面に収まる期間（16日以下）では固定しない＝当初の指示どおり。
  const fvScrolls=fullView&&dates.length>FV_MAX_DAYS;
  const fvRowH=Math.max(6,(fvAvailH-6-fvTheadH)/(fvFitDays*2)-0.5);
  // 全表示のセル色の出し方。通常表示は input が td より一回り小さく、**周囲に見える td の帯**で
  // 土日祝の行色とポジション不足の黄色を見せている。全表示では input が td を覆い切るので
  // この2色が画面から消える（バグチェック#141 の実測: 通常表示 7px/4.5px → 全表示 0px/0.5px）。
  // 2案（fill＝input を透明にして td の色をセル全面に出す／edge＝input を一回り小さくして通常表示と
  // 同じ帯で見せる）を実装して見比べ、**2026-09-23 に fill で確定**した。edge は通常表示と見た目が
  // 揃う代わりに行高を4px使いフォントが落ちる（実測: 15日×30名で16px→12px）ため採らない。
  const fvEdge=false;
  const fvInnerH=fvRowH;
  // 出勤・退勤セルの文字は行高から出した値より **さらに2px小さく**する（2026-09-23 ユーザー指示）。
  const fvRowFont=Math.max(5,Math.min(16,Math.floor(fvInnerH)-2)-2);
  const fvDateFont=Math.max(7,Math.min(13,Math.floor(fvRowH*2)-4));
  // 全表示では border-box に揃える。既定の content-box のままだと padding のぶん実幅が式より
  // 広くなり（日付列+8px・スタッフ列+4px/列）、overflowX:"hidden" と相まって右端が黙って切れる。
  // スタッフが少ないときは列を引き伸ばさない（39px・余りは左右の余白・2026-09-23 ユーザー指示）。
  // **人数が多いときだけ列を横幅いっぱいに合わせる**（2026-09-28 ユーザー指示・2週間以下の期間だけ）。
  // 規則は app-utils.js の fullViewColW（横幅いっぱいに割った列幅が48px以下になる人数から）。
  const fvCol=fullViewColW({availW:fvAvailW,staffCount:gridStaff.length,days:dates.length,maxDays:FV_MAX_DAYS,dateW:fvDateW});
  const colW=fullView?fvCol.colW
    :fitAll?Math.max(24,Math.floor((centerW-DATE_COL_W)/Math.max(1,gridStaff.length))):39;  // fullView=fitAll なのでこの枝は現在到達しない
  // 列が細くなったら文字も細くする（2週間以下の期間だけ。1ヶ月の期間は従来どおり行高だけで決める＝R21）
  const fvFont=dates.length<=FV_MAX_DAYS?fullViewFontOf(fvRowFont,colW):fvRowFont;
  // 全表示の表の実幅。グリッド・休みカウント表・集計表がこの同じ幅で中央に並ぶので列位置が揃う。
  const fvTableW=fvDateW*2+colW*gridStaff.length;
  const fvCenter=fullView?{width:"fit-content",marginLeft:"auto",marginRight:"auto"}:{};
  // boxSizing は**どの表示でも border-box**にする（2026-09-23 ユーザー指示）。
  // かつては通常表示だけ content-box のままにしていた（全表示が Dev 限定だった頃の
  // 「通常表示を1pxも変えない」という約束の名残）が、そのせいで通常表示だけ
  // **グリッドのスタッフ列が43px・集計表が39px**と食い違い、人数が増えるほど
  // 列位置が1列4pxずつずれていた。指定どおりの39pxに揃える。
  // gridContentW=日付列+colW×人数 が padding を勘定しないので、content-box のままだと
  // **最後のスタッフ列が6pxほど切れる**問題も同時に消える。
  // これで input の周りに見える td の帯は 7px→3px に細くなるが、**色の見え方には効かない**——
  // 同じ 2026-09-23 に cellBgStyle を fill へ一本化し、土日祝の行色とポジション不足の黄色は
  // 帯ではなく透明な input を透かしてセル全面に出るようにしたため。
  const BOXS="border-box";
  const spacerCell=(key)=>(<td key={key} style={{width:colW,minWidth:colW,maxWidth:colW,boxSizing:BOXS,borderLeft:BD2,background:"var(--c-input2, var(--c-input))",padding:0}}></td>);
  const spacerTh=(key,sticky=false)=>(<th key={key} style={{width:colW,minWidth:colW,maxWidth:colW,boxSizing:BOXS,borderLeft:BD2,background:"var(--c-input2, var(--c-input))",padding:0,...(sticky&&(!fullView||fvScrolls)?{position:"sticky",top:0,zIndex:3}:{})}}></th>);
  // gridStaffを列描画: spacer位置はspacerFnで空セル、実スタッフはrenderFnで描画
  const mapGridCols=(renderFn,spacerFn)=>gridStaff.map((name,i)=>isSpacer(name)?spacerFn(`sp${i}`):renderFn(name,i));
  // キッチン/ホール絞り込み表示（片側パネルのみ）時: ヒートマップ+グリッドの塊が画面に収まるなら画面中央に配置する。
  // 収まらない場合は現状どおりパネルを端に固定しグリッドを残り幅いっぱいに広げる（flex:1、内部は横スクロール）。
  // fitAll（全表示）時はグリッド自体が既にcenterWいっぱいに広がる設計のため対象外。
  const singlePanel=panelCount===1&&!fitAll;
  // +6 は枠線と丸めの実測分。これが無いと、グリッドを中央寄せする経路（片側パネル＋収まる幅）で
  // **最後のスタッフ列が6px切れる**（2026-09-23 実測。3名でも28名でも同じ6px）。
  const gridContentW=DATE_COL_W+colW*gridStaff.length+6;
  const fitsCentered=singlePanel&&(panelW+4+gridContentW+24)<=viewW;
  // 全表示では枠・角丸・paddingを外して高さを行高ちょうどに固定する（行高が決定的になり縦の計算が当たる）。
  // fontSize が16pxを下回るのは全表示のセルだけ。RULES.md の16px規約に対する**明示的な例外**で、
  // 2026-09-23 にユーザーが「全表示の際、フォントの縮小はok」と決めた（編集は維持する）。
  // iOS/iPadOSでは全表示のセルをタップするとフォーカス時に自動ズームが起きる。
  // **参照を固定する**（S2）: セル部品（ShiftCell）が base として受け取り、memo の比較に使う。毎回作ると全セルが描き直される
  const AI2=useMemo(()=>fullView
    ?{width:fvEdge?"calc(100% - 6px)":"100%",height:fvInnerH,display:"block",margin:fvEdge?"2px 3px":0,
      fontSize:fvFont,lineHeight:fvInnerH+"px",border:fvEdge?BD:"none",borderRadius:fvEdge?3:0,padding:0,
      // fill は透明にして td（土日祝の行色・ポジション不足の黄色）をセル全面に透かす
      background:fvEdge?"var(--c-input)":"transparent",color:"var(--c-text)",textAlign:"center",boxSizing:"border-box"}
    // 通常表示も fill に統一し、**input がセル全面を覆う**（2026-09-23 ユーザー指示）。
    // fill にする前は input を一回り小さくして td の色を周りの帯として見せていたが、fill では
    // td の色が input を透かして全面に出るので、その帯は要らなくなった。
    // 帯を外すぶん input 自身の枠・角丸も外す——残すと td の borderLeft と隣り合って
    // 縦線が2pxに見える（帯が無くなり両者が接するため）。セルの区切りは td 側の罫線が担う。
    // 縦の padding 4px は、td の padding と input の余白を合わせて**行の高さを従来どおり**に保つため
    // （帯を外しただけで行が詰まると、行ストライドが 52px→44px になりグリッド全体の高さが変わる）。
    :{width:"100%",display:"block",fontSize:16,border:"none",borderRadius:0,padding:"4px 1px",background:"transparent",color:"var(--c-text)",textAlign:"center",boxSizing:"border-box"},
  [fullView,fvEdge,fvInnerH,fvFont,BD]);
  // 斜線画像 HDASH_IMG はモジュールスコープ（GridLegend・cellBgStyleと共用）
  // 全表示では日付列を左右両端に置くため sticky を外す（全体が見えるので固定する意味が無い）。
  // 休みカウント表・集計表のラベル列も同じ SD を使うので、幅を変えると3表の列位置が一緒に揃う。
  // **幅は通常表示も全表示も DATE_COL_W で同じ**（2026-09-23 ユーザー指示）。通常表示だけは
  // グリッドが横スクロールするので sticky を残す。box-sizing も border-box に揃える——
  // content-box のままだと padding のぶん実幅が45pxを超え、スタッフ列の位置が下段3表とずれる。
  const SD=fullView
    ?{background:CRD,whiteSpace:"nowrap",width:fvDateW,minWidth:fvDateW,maxWidth:fvDateW,boxSizing:"border-box",padding:"0 1px",fontSize:fvDateFont,fontWeight:600,borderRight:BD2,overflow:"hidden",textAlign:"center"}
    :{position:"sticky",left:0,background:CRD,zIndex:2,whiteSpace:"nowrap",width:DATE_COL_W,minWidth:DATE_COL_W,maxWidth:DATE_COL_W,boxSizing:"border-box",padding:"2px 1px",fontSize:DATE_COL_FONT,fontWeight:600,borderRight:BD2,overflow:"hidden",textAlign:"center"};
  // 右端の日付列。左端と鏡像にする（境界線を右ではなく左に置く）
  const SDR={...SD,borderRight:undefined,borderLeft:BD2};
  // スタッフ名色（Excel書き出しと同ルール: staffColors[name]==="red"→赤）
  const nameColor=name=>((settings.staffColors||{})[name]==="red"?"#e53935":"var(--c-text)");
  // sticky=true: メイングリッドの名前行のみ画面上端に固定（出勤・退勤行はその下をスクロール、テーブル末尾を過ぎると自然に解除される）。
  // 全表示では縦スクロールが起きないので固定しない。
  // 列見出しは名前だけ（所属店舗名は出さない・2026-09-27 ユーザー指示）。所属店舗は重複エラーの判定にだけ使う。
  // helperToggle=true はメイングリッドの見出しだけ（集計表の見出しは同じ VTH を使うが切り替えを出さない）
  const VTH=(name,sticky=false,helperToggle=false)=>{
    const showHt=helperToggle&&!fullView&&helperToggleNames.has(name);
    const htOff=showHt&&isHelperDisplayOff(period,name);
    return(
    <th key={name} style={{width:colW,minWidth:colW,maxWidth:colW,boxSizing:BOXS,padding:fullView?0:"2px",textAlign:"center",borderLeft:BD,borderBottom:BD2,background:CRD,verticalAlign:"middle",...(sticky&&(!fullView||fvScrolls)?{position:"sticky",top:0,zIndex:3}:{})}}>
      <div style={{writingMode:"vertical-rl",textOrientation:"mixed",height:fullView?fvNameH:72,display:"inline-block",fontSize:fullView?Math.max(7,Math.min(11,colW-2)):11,fontWeight:600,color:nameColor(name),whiteSpace:"nowrap",textAlign:"center",lineHeight:String(colW-4)+"px",overflow:fullView?"hidden":undefined}}>{name}</div>
      {showHt&&(
        <button type="button" data-helper-toggle={name} data-helper-off={htOff?"1":"0"} disabled={!canToggleHelperDisp}
          onClick={()=>toggleHelperDisp(name)}
          title={(htOff?"ヘルプ勤務の自動表示: OFF（押すと表示する）":"ヘルプ勤務の自動表示: ON（押すと隠す）")+"\nこの期間だけ・見た目だけの切り替えです。勤務時間・労務の合算は続けます。手入力のヘルプ（例「9三」）は変わりません。"+(canToggleHelperDisp?"":"\n確定済みの期間・閲覧専用の端末では変更できません。")}
          style={{display:"block",margin:"2px auto 0",width:Math.max(20,colW-6),height:20,padding:0,fontSize:10,fontWeight:700,lineHeight:"18px",borderRadius:4,
            cursor:canToggleHelperDisp?"pointer":"default",opacity:canToggleHelperDisp?1:0.6,
            border:htOff?"1px solid var(--c-border2)":"1px solid #d4b106",
            background:htOff?"transparent":"#FFF3B0",color:htOff?"var(--c-text3)":"#5c4a00",textDecoration:htOff?"line-through":"none"}}>
          ヘ
        </button>
      )}
    </th>
    );
  };
  // 集計用の実効値（heatEdits＝blur確定値ベース）
  const getHeatVal=(name,date,field)=>{const key=`${name}|${date}|${field}`;if(key in heatEdits)return heatEdits[key];const t=toDecimal(getStoredTime(name,date,field));return t||"";};
  // その日出勤しているか（0.5出勤含む）: start か end のどちらかに有効値がある
  // その日「締」等の固定シフトコマンドが有効か（start/endどちらかのnoteがそれに該当）
  const hasFixedCmd=(name,date)=>getFieldFixed(name,date,"start")||getFieldFixed(name,date,"end");
  const isWorkDay=(name,date)=>{
    const shift=_getSub(name)?.shifts?.[date];
    const s=parseFloat(getHeatVal(name,date,"start"));
    const e=parseFloat(getHeatVal(name,date,"end"));
    const hasVal=!isNaN(s)||!isNaN(e)||hasFixedCmd(name,date);
    if(shift&&shift.status==="holiday"&&!hasVal)return false;
    return hasVal;
  };
  // 休みカウント: 17時基準で前半/後半それぞれ出勤なし=0.5、終日なし=1
  // 併せて 1日休み(その日の休み値=1)・半日休み(その日の休み値=0.5) の回数も集計する
  // （半日休みは 0.5 を合算せず「回数」として数える: ランチ休み+ディナー休みで半休2回=2）
  // 「締」等の固定シフトコマンドはディナー帯(17時以降)の追加出勤として扱い、後半の休み判定を打ち消す
  const {restCounts,fullDayCounts,halfDayCounts}=React.useMemo(()=>{
    const rest={},full={},half={};
    realStaff.forEach(name=>{
      let count=0,fd=0,hd=0;
      dates.forEach(date=>{
        const shift=_getSub(name)?.shifts?.[date];
        const s=parseFloat(getHeatVal(name,date,"start"));
        const e=parseFloat(getHeatVal(name,date,"end"));
        const fixedCmd=hasFixedCmd(name,date);
        let day=0;
        if((!shift||shift.status==="holiday")&&isNaN(s)&&isNaN(e)&&!fixedCmd){day=1;}
        else{
          if(!(!isNaN(s)&&s<17))day+=0.5;
          if(!((!isNaN(e)&&e>17)||fixedCmd))day+=0.5;
        }
        count+=day;
        if(day===1)fd++;else if(day===0.5)hd++;
      });
      rest[name]=count;full[name]=fd;half[name]=hd;
    });
    return {restCounts:rest,fullDayCounts:full,halfDayCounts:half};
  },[realStaff,dates,subsCalc,heatEditsCalc,selPid,fixedShiftEnabled]);
  // 削りカウント（2026-10-05 ユーザー指示）: スタッフの提出から帯を削った日数。通しの半分も終日も1日1回。
  // 判定は app-utils.js の shiftCutOf（手入力だけの日・休みコマンドの帯・ヘルプ・帯の移し替えは数えない）。
  // セルの値は休みカウントと同じ getHeatVal / getFieldNote / hasFixedCmd で読む＝2つの表が同じ値を見る
  const cutCounts=React.useMemo(()=>{
    const result={};
    realStaff.forEach(name=>{
      const sub=_getSub(name);
      let n=0;
      if(sub)dates.forEach(date=>{
        if(shiftCutOf({sub,shift:sub.shifts&&sub.shifts[date],
          startH:parseFloat(getHeatVal(name,date,"start")),endH:parseFloat(getHeatVal(name,date,"end")),
          startNote:getFieldNote(name,date,"start"),endNote:getFieldNote(name,date,"end"),
          fixed:hasFixedCmd(name,date)}))n++;
      });
      result[name]=n;
    });
    return result;
  },[realStaff,dates,subsCalc,heatEditsCalc,selPid,fixedShiftEnabled]);
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
  },[realStaff,dates,subsCalc,heatEditsCalc,selPid,fixedShiftEnabled]);
  const kitMax=Math.max(1,...dates.flatMap(date=>heatHours.map(hr=>countHeat("kit",date,hr))));
  const hallMax=hallStaff.length>0?Math.max(1,...dates.flatMap(date=>heatHours.map(hr=>countHeat("hall",date,hr)))):1;
  const hBg=(n,mx)=>n===0?"transparent":`rgba(248,112,54,${0.15+(n/mx)*0.75})`;

  // 休み希望の黒破線枠判定（field: "start"=出勤セル / "end"=退勤セル）
  // 表示条件は2つのみ: スタッフが1日休みとして提出(status==="holiday") または 管理者がそのフィールドに休み希望(/)を明示入力(adminRest)。
  // ランチ/ディナーの片方だけ入力された work 提出を「反対側は休み」とみなす自動推測は行わない。
  const holidayCellDash=(name,date,field)=>{
    const sh=_getSub(name)?.shifts?.[date];
    if(!sh)return false;
    if(sh.adminRest&&sh.adminRest[field])return true; // 管理者入力の休み希望(/)
    return sh.status==="holiday"; // スタッフ提出の1日休み希望
  };
  // セルの色: 緑(スタッフ変更) > 赤(店舗間重複) > 黄(サフィックスnote・他店舗ヘルプ含む) > 行背景。
  // フォーカス中セルは通常背景（色を付けない）＝セル（ShiftCell）が自分で外す（S2）。ここはフォーカスしていないときの色
  const cellBgFor=(name,date,field,rb)=>{
    const key=`${name}|${date}|${field}`;
    if(_getSub(name)?.shifts?.[date]?.changed===true)return LEGEND_COLORS.changed;
    if(timeErrors[`${name}|${date}`])return LEGEND_COLORS.timeErr;
    if(dupErrors[`${name}|${date}`])return LEGEND_COLORS.dup;
    // 労務で**紫に塗ると決めた日**（12h超・法定休日労働・月60h超・特定技能の週の公休不足・属性の上限超。2026-10-08 ユーザー指示）。
    // 一覧は app-utils.js の LABOR_DAY_FIX_KEYS が正本で、1日の残業の上限超・4h未満・休憩不足は
    // パネルには出るが色は付けない。
    if(laborDayErrors[`${name}|${date}`])return LEGEND_COLORS.laborErr;
    // ヘルプの合成表示（時刻＋略称・H2）は特記ありと同じ黄色（表示だけ。subs に特記を書かない）
    if(helperShownText(name,date,field))return LEGEND_COLORS.note;
    // 休み希望(/)・休暇セルは通常背景+斜線（noteの黄色も休暇の色も付けない）。
    // 休暇は色ではなく**セルに種別名を出して**見せる（2026-09-26 ユーザー指示・getVal 参照）。
    if(fieldRest(name,date,field))return rb;
    // note有無を localEdits/保存値から判定
    let note="";
    if(key in localEdits){note=extractNote(localEdits[key]).note;}
    else{const sh=_getSub(name)?.shifts?.[date];const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";const origNk=field==="start"?"startNote":"endNote";note=(sh?.[adjNk]??sh?.[origNk])||"";}
    if(note)return LEGEND_COLORS.note;
    return rb;
  };
  const cellTextColor=(name,date,field)=>{
    const key=`${name}|${date}|${field}`;
    if(_getSub(name)?.shifts?.[date]?.changed===true)return undefined;
    if(helperShownText(name,date,field))return"#333";
    if(fieldRest(name,date,field))return undefined;
    let note="";
    if(key in localEdits){note=extractNote(localEdits[key]).note;}
    else{const sh=_getSub(name)?.shifts?.[date];const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";const origNk=field==="start"?"startNote":"endNote";note=(sh?.[adjNk]??sh?.[origNk])||"";}
    return note?"#333":undefined;
  };
  // ヘルプの合成表示のセルの見た目（H2）。**列幅は1pxも変えない**（2026-10-04 ユーザー指示）ので、収まらない文字は
  // そのセルの文字サイズだけを縮める（helperCellFontPx）。縮めるのは合成表示を出している間だけで、混在の日にフォーカスして
  // 自店の値を編集する間は通常の大きさ（通常表示 16px＝iOS のズーム防止の規約どおり）に戻る（helperShownText が "" になる）。
  // ヘルプ先だけの日のセルは readOnly なので編集のズームは起きない。
  // 使える幅＝列幅 − td の左罫線1px − input の左右 padding − 余白1px
  const helperCellStyle=(name,date,field)=>{
    const hx=helperShownText(name,date,field);
    if(!hx)return{};
    const base=AI2.fontSize;
    const avail=colW-1-(fullView?0:2)-1;
    const st={fontSize:helperCellFontPx(hx,avail,base),whiteSpace:"nowrap",overflow:"hidden"};
    // 通常表示の input は高さを持たず文字の大きさで決まるので、縮めたセルだけ行が詰まる（実測 26px→20px）。
    // 16px の line-height:normal と同じ行の高さ（mac の Chromium・WebKit・iPhone で 18px＝16×1.125）を指定して行を保つ。
    // 全表示は AI2 が高さと line-height を固定しているので触らない
    if(!fullView)st.lineHeight=Math.round(base*1.125)+"px";
    if(isHelperOnly(name,date))st.cursor="default";
    return st;
  };
  // セル背景は **fill 方式に一本化する**（2026-09-23 ユーザー指示）。
  // input の背景を透明にして td/tr の色（土日祝の行色・ポジション不足の黄色）をセル全面に透かし、
  // 色が付くセルだけ不透明ベース(CRD)の上に**優先順位で勝った1色だけ**を塗って下の色を完全に隠す。
  // 半透明のレジェンド色（緑=変更・赤=重複）を透明の上に重ねると下の色と混ざるので、この
  // 「勝った1色だけ・不透明ベース」が要になる。
  // 以前は通常表示だけ別実装で、backgroundColor に不透明の var(--c-input) を敷いて td の色を
  // **隠していた**（だから土日祝色と不足色は input の外側の帯にしか出なかった）。列幅を
  // border-box に揃えてその帯が 7px→3px に細くなったため、全表示と同じ fill に統一した。
  // 休み希望の斜線(HDASH_IMG)も backgroundImage を使うため、両方付くときは斜線を前面にカンマ合成する。
  // 優先順位: 変更 > 不足 > 企業間他店舗被り > ヘルプ(メモ) > 曜日（2026-09-23 ユーザー指示）。
  // セルに塗る1色（無ければ null）と斜線の有無を返す。style への組み立ては cellBgStyleOf（モジュール直下・ShiftCell と共用）。
  // フォーカス中は色を付けない（斜線だけ残す）＝ShiftCell が col を null にして組み立てる
  const BG_NONE="__bg_none__";
  const cellBgCol=(name,date,field)=>{
    let col=cellBgFor(name,date,field,BG_NONE);
    if(col===BG_NONE)col=null;
    // 不足は changed の次・dup より前に割り込ませる（cellBgFor は td 側の不足色を知らないため）。
    // **時刻の入力ミス（timeErr）には割り込ませない**——入力そのものの誤りで、直さない限り
    // その日の実働は0のまま集計にも出ない。不足に上書きさせると、ポジションが足りない日は
    // 両方のセルが黄色になって**セル側の手がかりが消える**（2026-09-26 に dev 実機で実測）。
    if(col!==LEGEND_COLORS.changed&&col!==LEGEND_COLORS.timeErr&&col!==LEGEND_COLORS.laborErr&&cellPosErr(name,date,field==="start"?"lunch":"dinner"))col=LEGEND_COLORS.posErr;
    return col;
  };
  // 休暇の種別名を出すセルには斜線を引かない（文字と重なって読めなくなる・2026-09-26 ユーザー指示）。
  // スタッフ提出の休み（種別名を出さない）は従来どおり斜線のまま。
  // ヘルプ先の勤務がある日は斜線を引かない（H2。PDF・Excel も同じ）
  // 色が付くセルだけ不透明ベースを敷き、色が無いセルは透明のままにして tr の曜日色をそのまま1色で見せる（cellBgStyleOf）
  const cellDash=(name,date,field)=>holidayCellDash(name,date,field)&&!leaveCellText(name,date,field)&&!helperDisp(name,date);
  // トリプルクリック/トリプルタップ: そのシフトのchangedフラグをトグル（Firebase永続化）
  const toggleChanged=(name,date)=>{
    if(!isPremium||periodConfirmed)return;
    const sub=_getSub(name);const sd0=sub?.shifts?.[date];
    if(!sub||!sd0)return;
    // handleBlur同様、直前state(prevSubs)基準で計算する関数型更新にしてある
    onSave(prevSubs=>{
      const newSubs=[...prevSubs];const idx=newSubs.findIndex(s=>s.id===sub.id);if(idx===-1)return prevSubs;
      const ns={...newSubs[idx]};const shifts={...(ns.shifts||{})};const sd={...shifts[date]};
      if(sd.changed===true)delete sd.changed;else sd.changed=true;
      shifts[date]=sd;ns.shifts=shifts;newSubs[idx]=ns;
      return newSubs;
    });
  };
  const lastTapRef=useRef({key:null,times:[]});
  // トリプルタップの二重適用ガード: タッチ端末では3回目のtouchendでトグルした直後に、ブラウザが合成した
  // clickが detail===3 で同じセルに届き、もう一度トグルして打ち消してしまう（Chromium実測でtouchendの
  // 1ms後に到達）。touchend由来の適用を記録し、その直後に来た合成clickだけを無視する。
  // タッチ側は抑止しないので、連続でトグルし直す操作は従来どおり効く。
  const tapToggledRef=useRef({key:null,t:0});
  const onCellTripleClick=(name,date)=>{
    const k=`${name}|${date}`;const r=tapToggledRef.current;
    if(r.key===k&&Date.now()-r.t<700)return; // touchend で適用済みの合成click
    toggleChanged(name,date);
  };
  const onCellTripleTap=(name,date)=>{
    const k=`${name}|${date}`;const now=Date.now();const prev=lastTapRef.current;
    const times=(prev.key===k&&prev.times.length>0&&now-prev.times[prev.times.length-1]<350)?[...prev.times,now]:[now];
    if(times.length>=3){toggleChanged(name,date);tapToggledRef.current={key:k,t:now};lastTapRef.current={key:null,times:[]};}
    else{lastTapRef.current={key:k,times};}
  };
  // ===== セル（ShiftCell）から親へ伝える入口（S2）=====
  // セルへ渡す api は**最初の1回だけ作る**（useMemo([])）。中身は最後にコミットした描画の関数を cellApiRef から呼ぶ
  // （描画のたびに新しい関数を渡すと memo が効かず、選択・入力のたびに全セルが描き直される）。
  const cellApiRef=useRef(null);
  const tipSetRef=useRef(null);
  React.useLayoutEffect(()=>{
    cellApiRef.current={
      commit:handleBlur,
      upgrade:()=>{onUpgrade&&onUpgrade({type:"edit",plan});},
      triple:onCellTripleClick,
      tripleTap:onCellTripleTap,
      // ツールチップはスタッフが提出した値（管理者の調整前）
      tip:(name,date,field,r)=>{
        const sh=_getSub(name)?.shifts?.[date];
        const v=toDecimal((field==="start"?sh?.start:sh?.end)||"");const n=(field==="start"?sh?.startNote:sh?.endNote)||"";
        const set=tipSetRef.current;if(set)set({x:r.left+r.width/2,y:r.top,value:v?(v+n):"—"});
      },
    };
  });
  const cellApi=useMemo(()=>({
    commit:(n,d,f,v)=>cellApiRef.current.commit(n,d,f,v),
    upgrade:()=>cellApiRef.current.upgrade(),
    triple:(n,d)=>cellApiRef.current.triple(n,d),
    tripleTap:(n,d)=>cellApiRef.current.tripleTap(n,d),
    tip:(n,d,f,r)=>cellApiRef.current.tip(n,d,f,r),
    hideTip:()=>{const set=tipSetRef.current;if(set)set(null);},
    // 入力中の文字。value=null は「このセルの入力を終えた」（別のセルの入力中の文字は消さない）
    draft:(key,value)=>{if(value==null){if(draftRef.current&&draftRef.current.key===key)draftRef.current=null;}else{draftRef.current={key,value};if(calcTimerRef.current)scheduleCalc();}},
  }),[]);
  // セル1つぶんの props（すべてフォーカスしていないときの見え方）。値はプリミティブだけ
  const cellCursor=canEditCells?"text":(isPremium?"default":"pointer");
  const cellPropsOf=(name,date,field,di)=>{
    const hx=helperShownText(name,date,field);
    const hDay=isHelperOnly(name,date);
    const hs=hx?helperCellStyle(name,date,field):null;
    return{name,date,field,
      idleVal:getVal(name,date,field),
      // 混在の日の合成表示のセルだけ、フォーカス中は自店の値に切り替える（ヘルプ先だけの日は readOnly で合成表示のまま）
      editVal:hx&&!hDay?ownEditVal(name,date,field):undefined,
      col:cellBgCol(name,date,field),dash:cellDash(name,date,field),color:cellTextColor(name,date,field),
      hFont:hs?hs.fontSize:null,hLh:hs&&hs.lineHeight?hs.lineHeight:null,hKeep:!!hx&&hDay,hDay,
      title:laborErrTitle(name,date)||helperDisp(name,date)?.title||undefined,
      readOnly:!canEditCells||hDay,isPremium,canEdit:canEditCells,locked:periodConfirmed,base:AI2,cursor:cellCursor,
      prevDate:di>0?dates[di-1]:"",nextDate:di<dates.length-1?dates[di+1]:"",resetKey:cellResetKey,api:cellApi};
  };

  // グリッドの実際の行高・thead高を測定してサイドパネルと同期。
  // 見出しの高さは描画の後からも変わる（他店舗を読み終えてからヘルプ勤務の切り替え「ヘ」が名前の下に出る等）ので、
  // 依存の変化だけでなく見出しと本体の大きさの変化（ResizeObserver）でも測り直す。測り直しで変わるのは
  // ヒートマップ側の高さだけで、グリッドの大きさには戻らないのでループにならない（2026-10-09 本番で全行が見出しの差だけずれた）
  useEffect(()=>{
    const measure=()=>{
    if(gridBodyRef.current){
      const rows=gridBodyRef.current.querySelectorAll("tr");
      if(rows.length>=4){
        // 日付1件=2行のペア間の実ストライドで測る（h1+h2の合算はborder-collapseの共有ボーダー分がズレて累積する）
        const stride=rows[2].getBoundingClientRect().top-rows[0].getBoundingClientRect().top;
        if(stride>0)setMeasuredRowH(stride);
      }else if(rows.length>=2){
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
    };
    measure();
    if(typeof ResizeObserver==="undefined")return;
    const ro=new ResizeObserver(()=>measure());
    if(gridTheadRef.current)ro.observe(gridTheadRef.current);
    if(gridBodyRef.current)ro.observe(gridBodyRef.current);
    return()=>ro.disconnect();
    // fitAll・showActuals・deptFilter はグリッドの表を作り直す（監視先の要素が替わる）ので依存に入れる
  },[selPid,dates.length,colW,fitAll,showActuals,deptFilter]);

  // 全表示（DEV限定）: グリッド上端のページ内オフセットを測る。使うのは「画面の残り高さ」を出すためだけで、
  // 出力（行高・フォント）はこの値に戻らないので測り直しのループにならない。依存配列にも行高・フォントを
  // 入れないこと（入れると計測→再描画→計測の循環になる）。
  useEffect(()=>{
    const update=()=>{
      const el=mainScrollRef.current;if(!el)return;
      const t=Math.round(el.getBoundingClientRect().top+(window.scrollY||0));
      setGridTop(prev=>(prev!==null&&Math.abs(prev-t)<2)?prev:t);
      const cc=centerColRef.current;
      if(cc){const l=Math.round(cc.getBoundingClientRect().left);
        setCenterColLeft(prev=>(prev!==null&&Math.abs(prev-l)<2)?prev:l);}
    };
    update();
    window.addEventListener("resize",update);
    return()=>window.removeEventListener("resize",update);
  },[selPid,fitAll,deptFilter,dates.length,staffList.length]);

  // HeatTable / SummaryTable はモジュールスコープに移動済み（スクロール位置リセットバグ対策）

  // 期間ラベルから先頭の年号（例:「2026年」）を除去して「10月前半」等のみにする。
  // 画面の集計表とPDFで同じ規則を使う（2026-09-23 ユーザー指示で画面側も揃えた）。
  // 集計表のラベル列は45pxしかなく、年号を残すと「2026年…」で本体が省略されて読めない。
  const periodLabelShort=l=>String(l||"").replace(/^\d+年/,"");
  // 期間行：前半/後半/月計を常に3行表示
  const mo2=period?pd(period.startDate).getMonth()+1:0;
  const moYm=period?String(period.startDate).slice(0,7):"";
  const firstHalf=sameMoPeriods.find(p=>pd(p.startDate).getDate()<=15)||null;
  const secondHalf=sameMoPeriods.find(p=>pd(p.startDate).getDate()>15)||null;
  const periodRows=[
    {id:firstHalf?.id||"nofirst",label:periodLabelShort(firstHalf?.label)||`${mo2}月前半`,getMin:name=>firstHalf?getPeriodMin(firstHalf.id,name):0,
      _bold:firstHalf?.id===selPid,_color:firstHalf?.id===selPid?"var(--c-accent)":undefined,_bg:firstHalf?.id===selPid?"rgba(248,112,54,0.15)":undefined},
    {id:secondHalf?.id||"nosecond",label:periodLabelShort(secondHalf?.label)||`${mo2}月後半`,getMin:name=>secondHalf?getPeriodMin(secondHalf.id,name):0,
      _bold:secondHalf?.id===selPid,_color:secondHalf?.id===selPid?"var(--c-accent)":undefined,_bg:secondHalf?.id===selPid?"rgba(248,112,54,0.15)":undefined},
    // 1ヶ月の上限・目安は月の暦日数で日割りし、1ヶ月の残業を足した値（attrMonthFrame・2026-09-28）。
    // 月は選択中の期間の startDate の年月（集計の月計と同じ暦月）。
    {id:"total",label:"月計",getMin:name=>sameMoPeriods.reduce((a,p)=>a+getPeriodMin(p.id,name),0),_bold:true,_color:"var(--c-accent)",
      _violateFn:(name,min)=>limitStateOf(min,attrMonthFrame(settings,(settings.staffAttributes||{})[name],moYm).capMin/60)},
    {id:"monthly_limit",label:"月上限",getMin:name=>attrMonthFrame(settings,(settings.staffAttributes||{})[name],moYm).capMin,_color:"#3B82F6",_bg:"rgba(96,165,250,0.07)"},
    // 目安は設定している店舗にだけ行を出す（使っていない店舗の集計表を長くしない）。判定はしない（数字を出すだけ）
    ...(realStaff.some(n=>staffLimitOf(settings,(settings.staffAttributes||{})[n]).monthlyMin>0)
      ?[{id:"monthly_min",label:"月目安",getMin:name=>attrMonthFrame(settings,(settings.staffAttributes||{})[name],moYm).guideMin,_color:"#2563EB",_bg:"rgba(59,130,246,0.07)"}]:[])
  ];

  // ============ PDF書き出し ============
  // シフト表HTMLを構築（Excelと同ルール：管理者調整値優先＋サフィックス＋従業員番号行）
  const pdfSanitize=s=>(s||"").replace(/[\\/:*?"<>|]/g,"");
  const staffNums=settings.staffNumbers||{};
  const staffAliasesPdf=settings.staffAliases||{};
  const staffColorsPdf=settings.staffColors||{};
  // PDF用: シフト値の解決（localEdits優先→保存値、サフィックス連結）
  const pdfResolve=(name,date,field)=>{
    if(fieldRest(name,date,field))return{disp:"",note:""}; // 休み希望(/)フィールドは空欄（斜線は呼び出し元で描画）
    const key=`${name}|${date}|${field}`;
    let time="",note="",fixed=false;
    const LE=editsNow(); // 確定済み＋入力中のセル（S2。入力中の文字は localEdits に入らない）
    if(key in LE){const{numeric,note:nt,hasFixed}=extractNote(LE[key]);time=parseTime(numeric)||"";note=nt||"";fixed=fixedShiftEnabled&&hasFixed;}
    // 保存値だけのセルは従業員画面のシフト表と同じ関数（shiftSheetStoredText・app-utils.js）で解決する
    else return shiftSheetStoredText(_getSub(name)?.shifts?.[date],field,fixedShiftEnabled);
    const dec=time?toDecimal(time):"";
    const fx=fixed?FIXED_KEY:"";
    // 「締」（東通り店専用・追加出勤）は画面のgetVal同様、note末尾にコマンド文字を付加して表示する。
    // main時刻が無い単独「締」でもfxだけで表示できるようdec||fxを判定条件にする（従来はdecのみでfx脱落=空欄化していた）。
    // コマンド外の文字だけのメモ（時刻もfxも無い「研修」等）も同様にnote単体で表示できるよう判定に含める
    // （getVal: if(t)return t+n+fx; return(n+fx)||""; と同じ真偽判定に揃える）
    return{disp:(dec||fx||note)?(dec+note+fx):"",note};
  };
  // 提出があるか（休みか未提出かの判定用）
  const pdfHasSub=(name,date)=>{const sh=_getSub(name)?.shifts?.[date];const key1=`${name}|${date}|start`,key2=`${name}|${date}|end`;const LE=editsNow();const edited=(key1 in LE)||(key2 in LE);return!!sh||edited;};
  // Excel出力と同じ列構成（staffList＋未提出の未登録名）。dept="kit"/"hall"の場合はgridStaffと同じ規則（h/kサフィックスのヘルプ要員を含む）で絞り込む
  const buildPdfCols=(dept="all")=>{
    if(dept==="kit")return realStaff.filter(n=>!hallStaff.includes(n)||kitExtraSet.has(n));
    if(dept==="hall")return realStaff.filter(n=>hallStaff.includes(n)||hallExtraSet.has(n));
    const submittedNames=subs.filter(s=>s.periodId===selPid).map(s=>s.staffName);
    const unreg=submittedNames.filter(n=>isUnregisteredSubName(n,rosterStaffList,staffAliasesPdf,period)).sort((a,b)=>a.localeCompare(b,"ja"));
    return[...staffList,...unreg];
  };
  const esc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  // PDFも画面の集計表と同じ規則（periodLabelShort）を使う。ここは別名の残り。
  const pdfPeriodLabel=periodLabelShort;
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
  const buildShiftTableHtml=(withHeat=false,staffCols=true,dept="all")=>{
    // 表の組み立ては app-utils.js の shiftTableHtmlOf（従業員画面の「全員のシフト」と同じ関数・2026-10-04）。
    // ここで解決するのは、入力中の編集（pdfResolve）・他店のヘルプ（helperDisp）・ヒートマップと昼夜の人数（heatData）だけ
    const showKit=withHeat&&heatHours.length>0;
    // 日付ヘッダの「昼・夜の人数」（settings.headcountAt・P3.5d）。**PDF だけ**に出す（画面・Excel には出さない）。
    // 数える区間はヒートマップと同じ heatData（片側セルの補完・退勤延長・応援と x の帯を外した後）。
    // キッチンとホールを分けている店舗（hasSplit）は区分ごとに数え、キッチンのヒートマップ側（左）の曜日列にキッチンの人数、
    // ホール側（右）の曜日列にホールの人数を出す（2026-10-02 ユーザー指示）。分けていない店舗は従来どおり左右とも合計。
    const headcountOf=(ds,section)=>shiftSheetHeadcountOf({settings,date:ds,entries:heatData[ds]||[],shiftOf:n=>_getSub(n)?.shifts?.[ds],hasSplit,section});
    return shiftTableHtmlOf({cols:buildPdfCols(dept),dates,periodLabel:pdfPeriodLabel(period.label||""),shopName,staffNums,staffColors:staffColorsPdf,settings,staffCols,
      headcountOf,
      heat:showKit?{hours:heatHours,kitLabel:hasSplit?"キッチン":"時間帯別出勤人数",showHall:hasSplit,count:countHeat,kitMax,hallMax}:null,
      // 他店でのヘルプ勤務（H2）。画面と同じ helperCellDisplay の文字・黄色（#FFFF00）。この日にヘルプ先の勤務があれば、
      // 合成表示でない側のセルも斜線を引かない（shiftSheetCellOf）
      cellOf:(nm,ds,field)=>{
        const pdfHd=helperDisp(nm,ds);
        const sh=_getSub(nm)?.shifts?.[ds];
        return shiftSheetCellOf({sh,field,hasSub:pdfHasSub(nm,ds),helper:pdfHd,r:pdfResolve(nm,ds,field),otherDisp:pdfResolve(nm,ds,field==="start"?"end":"start").disp});
      }});
  };
  // 休み・連勤カウント統合table（名前ヘッダー1行＋値2行）
  const buildCountsTableHtml=(dept="all")=>{
    const cols=buildPdfCols(dept);const BDp="1px solid #888";
    let h=`<div style="font-size:13px;font-weight:700;margin:10px 0 4px;">休み・連勤カウント</div>`;
    h+='<table style="border-collapse:collapse;font-size:11px;"><thead><tr>';
    h+=`<th style="border:${BDp};padding:3px 6px;background:#f7f7f7;"></th>`;
    cols.forEach(nm=>{if(isSpacer(nm)){h+=`<th style="border:${BDp};width:26px;"></th>`;return;}const col=staffColorsPdf[nm]==="red"?"#e53935":"#000";h+=`<th style="border:${BDp};padding:3px 1px;width:26px;text-align:center;font-size:${vfontSize(nm,10)}px;line-height:1.15;color:${col};vertical-align:middle;">${vtext(nm)}</th>`;});
    h+='</tr></thead><tbody>';
    const rows=[["1日休み（回）",nm=>fullDayCounts[nm]||0],["半日休み（回）",nm=>halfDayCounts[nm]||0],["休み合計",nm=>{const v=restCounts[nm]||0;return v%1===0?v:v.toFixed(1);}],["最大連勤数",nm=>consecCounts[nm]||0],["削り（回）",nm=>cutCounts[nm]||0]];
    rows.forEach(([lbl,valFn])=>{
      h+=`<tr><td style="border:${BDp};padding:3px 6px;background:#f7f7f7;font-weight:600;white-space:nowrap;">${esc(lbl)}</td>`;
      cols.forEach(nm=>{if(isSpacer(nm)){h+=`<td style="border:${BDp};"></td>`;return;}h+=`<td style="border:${BDp};padding:3px 2px;text-align:center;">${esc(valFn(nm))}</td>`;});
      h+='</tr>';
    });
    h+='</tbody></table>';
    return h;
  };
  // 週の休み・労務判定の行。**画面の表と PDF（全データ）が同じ定義を使う**（2026-09-29）。
  // 別々に書くと、片方だけ文言や記号を直したときに画面と配布物が食い違う。
  const weekRestRows=weeks.map((monStr,wi)=>{
    const m=pd(monStr);const sun=new Date(m);sun.setDate(m.getDate()+6);
    return{id:"wr_"+monStr,label:`${m.getDate()}〜${sun.getDate()}日`,getText:name=>{
      const st=(weekRestByStaff[name]||[])[wi];
      if(!st||st.key==="skip")return{};
      const bad=st.key==="none"||st.key==="skilledNone";
      // 特定技能（2026-10-01）: 月をまたぐ週は月末側と月初側に各1回の公休が要る。内訳を title に出す
      const sk=st.skilled?`特定技能: 週1回の公休が必要です。月をまたぐ週は月末側と月初側に各1回の公休が必要です${st.crossMonth?`（${skilledWeekSidesLabel(st)}）`:""}`:"";
      return{label:st.label,bold:bad,
        color:bad?"#e53935":st.key==="partial"?"var(--c-text3)":"var(--c-text2)",
        title:[st.key==="partial"
          ?`データのある日だけで数えた休み${st.count}日（残り${st.missing}日はまだデータがありません。週1休の判定は7日揃ってから出ます）`
          :st.label,sk].filter(Boolean).join("／")};
    }};
  });
  // ===== 人×月の所定（2026-09-30・P3・§3.4）=====
  // 月の所定は laborMonths の確定値（手修正後）を優先し、無い月はシフトから集計した月実働で埋める。
  const lmYm=period?period.startDate.slice(0,7):"";
  const schedCapOf=()=>laborFrame?(laborFrame.scheduledCapMin>0?{min:laborFrame.scheduledCapMin,name:"所定上限"}:{min:laborFrame.baseMin,name:"総枠"}):null;
  // 年平均所定（年度の開始月〜この月）。確定値 → この月はシフトから集計 → 他の月は期間の実データ → 凍結値の順で埋める
  const schedAvgOf=name=>{
    if(fy==null||!lmYm)return null;
    const months=fiscalYearMonths(fy,fyStart).filter(m=>m<=lmYm);
    return yearScheduledAverage(months,ym=>{
      const rec=laborMonthOf(lm.map,ym,name);
      if(rec)return Number(rec.min)||0;
      if(ym===lmYm){const l=laborByStaff[name];return l&&l.monthCovered?l.monthWorkMin:null;}
      const ps=periods.filter(p=>p&&p.startDate&&p.startDate.slice(0,7)===ym);
      if(!ps.length)return undefined;
      let sum=0;
      for(const pp of ps){
        const live=liveTotalFor(name)(pp);
        if(live){sum+=live.workMin;continue;}
        if(pp.laborTotals&&typeof pp.laborTotals==="object"){const t=pp.laborTotals[name];sum+=(t&&Number(t.workMin))||0;continue;}
        return null;
      }
      return sum;
    });
  };
  // 描画のたびに過去の期間を数え直さないよう、スタッフごとにまとめて1回だけ出す
  const schedAvgByStaff=useMemo(()=>{
    const o={};if(!isPremium)return o;
    realStaff.forEach(n=>{o[n]=schedAvgOf(n);});
    return o;
  },[isPremium,realStaff,fy,fyStart,lmYm,lm.map,laborByStaff,periods,liveTotalFor]);
  // 月次賃金ページ（P6b）へ渡す1か月の時間。**労務判定表と同じ計算（laborByStaff の割増・月所定・年平均所定）を
  // そのまま渡す**＝賃金の入力が画面の表と食い違わない。月所定は laborMonths の確定値、無ければシフトから集計した月実働。
  // 所属店舗で判定する人（行き先の店・P3.6）は時間を渡さない（所属店舗の月次賃金に合算される）
  const payrollReportRef=useRef(null);
  payrollReportRef.current=()=>{
    const ls=laborSettingsOf(settings);
    const attrOpts=getAttrOptions(settings);
    return{ym:lmYm,denomMin:rateDenominatorMinOf(ls),monthCovered:laborMonthCovered,pendingReason:laborPendingReason,
      actualsReadable:!!act.enabled,
      rows:realStaff.map(name=>{
        const attrId=(settings.staffAttributes||{})[name]||"";
        const base={name,number:(settings.staffNumbers||{})[name]||"",attrId,
          attr:((attrOpts.find(([v])=>v===attrId))||[])[1]||STAFF_TYPE_LABELS[attrId]||attrId,
          sys:laborSystemForStaff(settings,name)};
        const l=laborByStaff[name];
        if(!l)return{...base,skip:"noData"};
        if(l.dest)return{...base,dest:true,homeName:l.homeName||""};
        // prem が無いのは区分が空欄か誤り（laborSystemForStaff が null）の人だけ（応援・外部は B と同じ判定・2026-10-03）
        if(!l.prem)return{...base,skip:"badSystem"};
        const b=l.prem;const rec=laborMonthOf(lm.map,lmYm,name);const av=schedAvgByStaff[name]||null;
        return{...base,
          times:{scheduledMin:rec?(Number(rec.min)||0):l.monthWorkMin,workMin:b.workMin,dayOverMin:b.dayOverMin,weekOverMin:b.weekOverMin,
            monthOverMin:b.monthOverMin,otMin:b.otMin,over60Min:b.over60Min,nightMin:b.nightMin,legalHolidayMin:b.legalHolidayMin,absentMin:b.absentMin},
          schedSource:rec?(isLaborMonthFrozen(rec)?"frozen":"registered"):"auto",
          schedAvgMin:av&&av.avgMin!=null?av.avgMin:null,schedAvgMissing:av?av.missing.length:0,
          partial:!l.monthCovered,unread:!!b.unread,helperUnread:!!l.helperUnread};
      })};
  };
  // 企業横断ダッシュボード（P7）へ渡す人ごとの当月と年の値。**労務判定表と同じ値**（月所定/上限・年平均所定/分母の行、
  // laborByStaff の月の残業予定（B制は①＋②）、yearOvertimeMonths・yearLaborSummary）を並べ直すだけで、式は持たない。
  // 年の値は**年度の始め〜選んだ月まで**（その月より後に作ってある期間は入れない＝空の先の期間を公休・残業0として数えない）。
  const dashboardReportRef=useRef(null);
  dashboardReportRef.current=()=>{
    const ls=laborSettingsOf(settings);
    const attrOpts=getAttrOptions(settings);
    const cap=schedCapOf();
    const monthLast=laborMonthDays[laborMonthDays.length-1]||"";
    const upto=periods.filter(p=>p&&p.startDate&&p.startDate<=monthLast);
    const fyMonths=fy==null?[]:fiscalYearMonths(fy,fyStart);
    const fyEndYm=fyMonths[fyMonths.length-1]||"";
    const fyEnd=fyEndYm?`${fyEndYm}-${String(daysInMonthOf(fyEndYm)).padStart(2,"0")}`:"";
    const remainDays=monthLast&&fyEnd&&fyEnd>monthLast?Math.round((pd(fyEnd)-pd(monthLast))/86400000):0;
    return{ym:lmYm,fyLabel:fy==null?"":fiscalYearLabel(fy,fyStart),capMin:cap?cap.min:0,capName:cap?cap.name:"",
      denomMin:rateDenominatorMinOf(ls),agMonthH:ls.agreementMonthlyOtMin/60,agYearH:ls.agreementAnnualOtMin/60,
      restRemainDays:remainDays,restFinal:!!(fyEndYm&&lmYm===fyEndYm&&laborMonthCovered),
      monthCovered:laborMonthCovered,pendingReason:laborPendingReason,actualsReadable:!!act.enabled,
      rows:realStaff.map(name=>{
        const attrId=(settings.staffAttributes||{})[name]||"";
        const base={name,number:(settings.staffNumbers||{})[name]||"",
          attr:((attrOpts.find(([v])=>v===attrId))||[])[1]||STAFF_TYPE_LABELS[attrId]||attrId,
          sys:laborSystemForStaff(settings,name)};
        const l=laborByStaff[name];
        if(!l)return{...base,skip:"noData"};
        if(l.dest)return{...base,dest:true,homeName:l.homeName||""};
        const rec=laborMonthOf(lm.map,lmYm,name);
        const av=schedAvgByStaff[name]||null;
        const yo=fy==null?null:yearOvertimeMonths(upto,name,fy,fyStart,liveMonthOtFor(name));
        const yr=fy==null?null:yearLaborSummary(upto,name,fy,fyStart,liveTotalFor(name),true);
        return{...base,
          schedMin:rec?(Number(rec.min)||0):l.monthWorkMin,
          schedSource:rec?(isLaborMonthFrozen(rec)?"frozen":"registered"):"auto",schedPartial:!rec&&!l.monthCovered,
          avgMin:av&&av.avgMin!=null?av.avgMin:null,avgMissing:av?av.missing.length:0,
          monthOtH:l.sys==="B"?l.monthOtB:l.monthOtH,monthPartial:!l.monthCovered,
          yearMonths:yo?yo.scoped.map(v=>({ym:v.ym,h:v.h,ag:v.ag})):[],yearMissing:yo?yo.missingMonths:[],
          restDays:yr?yr.publicOff:null,restMissing:yr?yr.missingPeriodIds.length:0,
          helperUnread:!!l.helperUnread,unread:!!(l.prem&&l.prem.unread)};
      })};
  };
  // 人×月の所定の手修正欄（確定前のみ。前の月を遡って登録するときは、その月の期間を選んで入力する）
  const[lmOpen,setLmOpen]=useState(false);
  const[lmDraft,setLmDraft]=useState({});
  useEffect(()=>{setLmDraft({});},[lmYm,shopId]);
  // 自動集計も他店での勤務（P3.6）を足した値。行き先の店で所属店舗で判定する人は数えない
  const lmAuto=useMemo(()=>(isPremium&&lmOpen&&lmYm)?aggregateScheduledMonth({subs:subsCalc,names:realStaff,settings,ym:lmYm,
    extraDayMin:helperMinOn,excludeNames:Object.keys(helperInfo).filter(n=>helperInfo[n].role==="dest")}):{},[isPremium,lmOpen,lmYm,subsCalc,realStaff,settings,helperInfo,helperCacheCalc]);
  const saveLmRow=name=>{
    const rec=laborMonthOf(lm.map,lmYm,name);const a=lmAuto[name]||{days:0,min:0};
    const d=lmDraft[name]||{};
    const days=d.days!==undefined?Number(d.days):(rec?Number(rec.days)||0:a.days);
    const min=d.time!==undefined?parseHoursMinutes(d.time):(rec?Number(rec.min)||0:a.min);
    if(min==null){tt("▲ 所定時間は 176:39 のように入力してください");return;}
    const r=planLaborMonthManual({laborMonths:lm.map,ym:lmYm,name,days,min,auto:a});
    if(r.error){tt("▲ "+r.error);return;}
    lm.save(r.patch).then(()=>{setLmDraft(x=>{const n={...x};delete n[name];return n;});tt(`✓ ${name} の所定を登録しました`);}).catch(()=>{});
  };
  const p5Ctx={pendingReason:laborPendingReason,actualsReadable:act.enabled,monthLabel:period?period.startDate.slice(0,7).replace("-","年"):""};
  const laborRows=[
    {id:"labor_month",label:"月実働",getText:name=>{const l=laborByStaff[name];
      if(!l||l.sys==="none"||!(l.monthWorkMin>0))return{};
      // 集計表の既定フォーマッタ(fmtH4)は100時間以上で分を落とすが、労務では
      // 177:08 と 177:00 の差が判定を分けるので分まで出す。
      // 月が埋まっていない間も実数を出すが、**途中であることを `＋` で明示する**
      // （以前は印が無く、半月ぶんの合計が月の合計に見えた）。
      const t=fmtMin(l.monthWorkMin);
      // 他店での勤務（P3.6）を足した値。読めていない他店があれば途中の値として「＋」を付ける
      const hs=l.helperShopNames&&l.helperShopNames.length?`（${l.helperShopNames.join("・")}での勤務を含む）`:"";
      if(l.helperUnread)return{label:`＋${t}`,color:"var(--c-text3)",title:`他店の勤務を読み込めていません。合計 ${t}${hs}は他店の分が足りない途中の値です`};
      return l.monthCovered?{label:t,title:`月の実働 ${t}${hs}`}
        :{label:`＋${t}`,color:"var(--c-text3)",title:`データのある日だけの合計 ${t}${hs}／${laborPendingReason}`};}},
    {id:"labor_sched",label:"月所定/上限",getText:name=>{const l=laborByStaff[name];const cap=schedCapOf();
      if(!l||l.sys==="none"||!cap)return{};
      const rec=laborMonthOf(lm.map,lmYm,name);
      const min=rec?(Number(rec.min)||0):l.monthWorkMin;
      if(!rec&&!(min>0))return{};
      const partial=!rec&&!l.monthCovered;
      const diff=min-cap.min;
      const over=l.sys==="A"&&diff>0&&!partial;
      return{label:`${partial?"＋":""}${fmtMin(min)} ${fmtSignedMin(diff)}`,color:partial?"var(--c-text3)":over?"#e53935":"var(--c-text2)",bold:over,
        title:`月所定 ${fmtMin(min)}${rec?(isLaborMonthFrozen(rec)?"（確定済み）":"（登録値）"):"（未確定・シフトから集計）"}`
          +`${rec?`・所定日数 ${rec.days}日`:""}／${cap.name} ${fmtMin(cap.min)}（差 ${fmtSignedMin(diff)}）${partial?"／"+laborPendingReason:""}`};}},
    {id:"labor_sched_avg",label:"年平均所定/分母",getText:name=>{const l=laborByStaff[name];
      if(!l||l.sys==="none")return{};
      const av=schedAvgByStaff[name];
      if(!av||av.avgMin==null)return{};
      const den=rateDenominatorMinOf(laborSettingsOf(settings));
      const diff=av.avgMin-den;const miss=av.missing.length;
      return{label:`${miss?"＋":""}${fmtMin(av.avgMin)} ${fmtSignedMin(diff)}`,color:miss?"var(--c-text3)":"var(--c-text2)",
        title:`${fiscalYearLabel(fy,fyStart)}の月平均所定 ${fmtMin(av.avgMin)}（${av.count}か月）／分母 ${fmtMin(den)}（差 ${fmtSignedMin(diff)}）`
          +(miss?`／読み込めていない月 ${av.missing.join("・")}（「過去データ読込」で正確になります）`:"")};}},
    {id:"labor_guide",label:"目安",getText:name=>{const l=laborByStaff[name];if(!l||l.sys!=="A")return{};return{label:l.guide.label,color:l.guide.color,title:l.guide.title||l.guide.label};}},
    {id:"labor_ot",label:"残業予定",getText:name=>{const l=laborByStaff[name];
      // B制は店舗トグル（showDailyOverB）がオンのときだけ、日ごとの「しきい値超」の合計を出す（P3.5b）。
      // 週40h超は週の欄（労務判定）のまま。オフの店舗は従来どおり空欄。
      if(l&&l.sys==="B"&&l.dayOverB){
        const hits=dates.map((d,i)=>[d,l.dayOverB[i]||0]).filter(([,m])=>m>0);
        if(!hits.length)return{};
        const tot=hits.reduce((a,[,m])=>a+m,0);
        const th=dailyOverThresholdOf(laborSettingsOf(settings));
        return{label:`${excelRound(tot/60,2)}h`,color:"#B8860B",
          title:`この期間の1日${fmtMin(th)}超の合計 ${fmtMin(tot)}（${hits.map(([d,m])=>`${Number(d.slice(8,10))}日 ${fmtMin(m)}`).join("・")}）`};
      }
      // B制（トグルがオフ）は割増の①＋②（P5）
      if(l&&l.sys==="B"&&l.prem)return premiumRowCell("bPlan",l,p5Ctx);
      if(!l||l.sys!=="A")return{};
      // 月が埋まっていない間も現状の実数を出す（2026-09-26 ユーザー指示。以前は「要確認」）。
      // 暦月の枠に途中までの実働を当てるので 0h になりやすいが、それが現時点の実数。
      // **0h でも `＋` を付けて出す**——空欄にすると「判定して問題なし」と読める。
      if(!l.monthCovered)return{label:`＋${l.periodOtSumH}h`,color:"var(--c-text3)",
        title:`データのある日だけで計算した途中の値（この期間 ${l.periodOtSumH}h ／ 月の合計 ${l.monthOtH}h）／${laborPendingReason}`};
      if(!(l.monthOtH>0))return{};
      // この期間（半月運用なら半月）ぶん。月計はツールチップに出す。
      return{label:`${l.periodOtSumH}h`,color:"#B8860B",
        title:`この期間 ${l.periodOtSumH}h ／ ${period?period.startDate.slice(0,7).replace("-","年"):""}月の合計 ${l.monthOtH}h`
          +(l.otWindow?`（属性の設定で${OT_PRORATE_WINDOW_LABELS[l.otWindow]||""}の固定枠を配っています）`:"")};}},
    // 割増（P5）。セルは premiumRowCell
    ...[["ot","時間外①②③"],["night","深夜"],["legal","法定休日"],["over60","60h超"]].map(([k,label])=>
      ({id:"labor_p5_"+k,label,getText:name=>premiumRowCell(k,laborByStaff[name],p5Ctx)})),
    {id:"labor_year",label:fy==null?"年計":`${fiscalYearLabel(fy,fyStart)}計`,getText:name=>{const l=laborByStaff[name];
      if(!l||l.sys==="none"||!l.year)return{};
      const miss=l.year.missingPeriodIds.length;
      const yo=l.yearOt?excelRound(l.yearOt.scoped.reduce((a,v)=>a+v.h,0),2):null;
      // 年計の `＋` も先頭に置く（2026-09-26 ユーザー指示。表の中で印の位置を揃える）
      return{label:(miss?"＋":"")+(l.year.workMin>0?fmtMin(l.year.workMin):""),
        color:miss?"var(--c-text3)":"var(--c-text2)",
        title:(miss?`読み込めていない期間が${miss}件あります（「過去データ読込」で正確になります）／`:"")
          +`${fiscalYearLabel(fy,fyStart)}の累計 ${fmtMin(l.year.workMin)}`
          +(yo==null?"":`／残業予定の年計 ${yo}h`)};}},
    {id:"labor_leave",label:"休暇",getText:name=>{const l=laborByStaff[name];
      if(!l||!l.periodLeave)return{};
      const{paid,publicOff,ceremony}=l.periodLeave;
      if(!paid&&!publicOff&&!ceremony)return{};
      return{label:`有${paid}/公${publicOff}/慶${ceremony}`,title:`この期間 有給${paid}日・公休${publicOff}日・慶弔${ceremony}日`};}},
    {id:"labor_paid",label:"有給残",getText:name=>{const l=laborByStaff[name];
      if(!l||l.paidRemain==null)return{};
      return{label:`${l.paidRemain}日`,color:l.paidRemain<0?"#e53935":"var(--c-text2)",bold:l.paidRemain<0,
        title:`付与 ${(settings.paidLeaveGranted||{})[name]}日 − ${fiscalYearLabel(fy,fyStart)}の消化 ${l.year?l.year.paid:0}日`};}},
    {id:"labor_verdict",label:"総括",_bg:"rgba(248,112,54,0.05)",getText:name=>{const l=laborByStaff[name];if(!l)return{};
      // 所属店舗が別の連携店舗にある人（P3.6）。この店舗の勤務は所属店舗で合算して判定する
      if(l.dest)return{label:"所属店舗で判定",color:"var(--c-text3)",
        title:`${l.homeName||"所属店舗"}で、この店舗での勤務を合算して判定します（この店舗の集計には含めません）`};
      if(l.helperUnread)return{label:(String(l.overall.label).startsWith("＋")?"":"＋")+l.overall.label,color:"var(--c-text3)",
        title:`他店の勤務を読み込めていません。判定は他店の分が足りない途中の値です${shiftTabFindingLabels(l.findings).length?"／"+shiftTabFindingLabels(l.findings).join("、"):""}`};
      const c=l.overall.key==="fix"?"#e53935":l.overall.key==="under_guide"?"#B8860B":l.overall.key==="ot"?"#3B82F6":l.overall.key==="ok_partial"?"var(--c-text3)":"var(--c-text2)";
      // ＋OK は「日・週の判定では問題なし。月の判定は月が埋まってから」。理由を title に出す。
      // 画面の「労務の確認」と同じく、外した10項目（SHIFT_TAB_HIDDEN_FINDING_KEYS）は title にも出さない
      const ft=shiftTabFindingLabels(l.findings).join("、");
      return{label:l.overall.label,color:c,bold:l.overall.key==="fix",
        title:l.overall.key==="ok_partial"?`日・週の判定では問題ありません／${laborPendingReason}`:ft};}},
  ];
  const showLaborTable=isPremium&&Object.keys(laborByStaff).length>0;
  // 文字を出す集計表（週の休み・労務判定）の PDF 版。行は画面の SummaryTable と同じ
  // {label,getText,_bg} をそのまま受ける。画面の色はテーマ変数なので印刷用の固定色へ置き換える。
  // **見出しは表と同じブロックに入れる**＝1枚の画像になるので、見出しと表が別のページに分かれない。
  const pdfTextColor=c=>c==="var(--c-text3)"?"#888":c==="var(--c-text2)"||!c?"#333":c;
  const buildTextRowsTableHtml=(title,rowLabel,rows,dept="all")=>{
    const cols=buildPdfCols(dept);const BDp="1px solid #888";
    let t=`<div style="font-size:13px;font-weight:700;margin:0 0 4px;">${esc(title)}</div>`;
    t+='<table style="border-collapse:collapse;font-size:11px;"><thead><tr>';
    t+=`<th style="border:${BDp};padding:3px 6px;background:#f7f7f7;text-align:left;">${esc(rowLabel)}</th>`;
    cols.forEach(nm=>{if(isSpacer(nm)){t+=`<th style="border:${BDp};"></th>`;return;}const col=staffColorsPdf[nm]==="red"?"#e53935":"#000";t+=`<th style="border:${BDp};padding:3px 1px;width:30px;text-align:center;font-size:${vfontSize(nm,10)}px;line-height:1.15;color:${col};vertical-align:middle;">${vtext(nm)}</th>`;});
    t+='</tr></thead><tbody>';
    rows.forEach(row=>{
      t+=`<tr><td style="border:${BDp};padding:3px 6px;font-weight:600;white-space:nowrap;background:#f7f7f7;">${esc(row.label)}</td>`;
      cols.forEach(nm=>{
        if(isSpacer(nm)){t+=`<td style="border:${BDp};"></td>`;return;}
        const v=row.getText(nm)||{};
        const st=`color:${pdfTextColor(v.color)};font-weight:${v.bold?700:400};${row._bg?`background:${row._bg};`:""}`;
        t+=`<td style="border:${BDp};padding:3px 2px;text-align:center;white-space:nowrap;font-size:10px;${st}">${esc(v.label||"")}</td>`;
      });
      t+='</tr>';
    });
    t+='</tbody></table>';
    return t;
  };
  // 労務の確認が必要な人と理由（画面の「⚠ 労務の確認が必要です」と同じ内容）。
  const buildLaborFindingsHtml=(dept="all")=>{
    const inDept=new Set(buildPdfCols(dept));
    const list=laborFindings.filter(f=>inDept.has(f.name));
    if(!list.length)return null;
    let t=`<div style="font-size:13px;font-weight:700;margin:0 0 4px;color:#C2410C;">労務の確認が必要です</div>`;
    t+='<div style="font-size:11px;line-height:1.7;border:1px solid #e0b9a4;background:#FFF5EF;padding:6px 10px;max-width:1100px;">';
    list.forEach(({name,findings})=>{t+=`<div>${esc(name)}：${esc(findings.join("、"))}</div>`;});
    t+='</div>';
    return t;
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
  // opts は企業連携タブの一括PDF用（2026-09-27）: pdf＝既存の jsPDF に追記、first===false＝先頭で改ページ
  // （new jsPDF は最初から1ページ持つので、ページ数で判定すると1店舗目の前に空白ページができる）、
  // save===false＝保存・トースト・モーダル閉じ・分析イベントを行わず、失敗は呼び出し元へ投げ直す。
  const exportPdf=async(mode,dept="all",opts={})=>{
    const batch=opts.save===false;
    if(!period){if(batch)throw new Error("期間が見つかりません");return;}
    if(typeof window.html2canvas==="undefined"||typeof window.jspdf==="undefined"){if(batch)throw new Error("PDFライブラリ未読込み");tt("▲ PDFライブラリ未読込み");return;}
    setPdfBusy(true);
    try{
      const heading=`${esc(shopName||"店舗")} ${esc(pdfPeriodLabel(period.label)||"")}`;
      // ブロック=ページ内で分割しない単位。収まらないブロックは次ページへ、単独で超える場合は縮小して1ページに収める
      const blocks=[];
      if(mode==="shift"){
        blocks.push(`<div style="font-size:16px;font-weight:700;margin-bottom:8px;">${heading} シフト表</div>`+buildShiftTableHtml(false,true,dept));
      }else{
        // 1ページ目: シフト表のみ（シフトモードと同じ内容）
        blocks.push(`<div style="font-size:18px;font-weight:700;margin-bottom:10px;">${heading} シフト作成データ</div>`+buildShiftTableHtml(false,true,dept));
        // 2ページ目: 時間帯別出勤人数（ヒートマップ）のみ。1ページ目と同じ日付行構造(mergeTd)を使うことで高さ・幅を揃え、
        // PDF_SYNCSCALEで1ページ目と同じmm/pxスケールを引き継ぐことで見た目の整合性を取る
        if(heatHours.length>0){
          blocks.push(PDF_PAGEBREAK);
          blocks.push(PDF_SYNCSCALE);
          blocks.push(`<div style="font-size:18px;font-weight:700;margin-bottom:10px;">${heading} 時間帯別出勤人数</div>`+buildShiftTableHtml(true,false,dept));
        }
        // 3ページ目以降: 休み・連勤カウント等の期間別集計
        blocks.push(PDF_PAGEBREAK);
        blocks.push(buildCountsTableHtml(dept));
        // 期間別勤務時間
        {const cols=buildPdfCols(dept);const BDp="1px solid #888";
         let t=`<div style="font-size:13px;font-weight:700;margin:0 0 4px;">期間別勤務時間</div>`;
         t+='<table style="border-collapse:collapse;font-size:11px;"><thead><tr>';
         t+=`<th style="border:${BDp};padding:3px 6px;background:#f7f7f7;text-align:left;">期間</th>`;
         cols.forEach(nm=>{if(isSpacer(nm)){t+=`<th style="border:${BDp};"></th>`;return;}const col=staffColorsPdf[nm]==="red"?"#e53935":"#000";t+=`<th style="border:${BDp};padding:3px 1px;width:26px;text-align:center;font-size:${vfontSize(nm,10)}px;line-height:1.15;color:${col};vertical-align:middle;">${vtext(nm)}</th>`;});
         t+='</tr></thead><tbody>';
         periodRows.forEach(row=>{t+=`<tr><td style="border:${BDp};padding:3px 6px;font-weight:${row._bold?700:400};white-space:nowrap;">${esc(pdfPeriodLabel(row.label))}</td>`;cols.forEach(nm=>{if(isSpacer(nm)){t+=`<td style="border:${BDp};"></td>`;return;}const min=row.getMin(nm);const vr=row._violateFn?row._violateFn(nm,min):false;const vio=vr===true||vr==="over";const vs=vio?"background:#FFE0E3;color:#e53935;font-weight:700;":"";t+=`<td style="border:${BDp};padding:3px 2px;text-align:center;${vs}">${min>0?esc(fmtH(min)):""}</td>`;});t+='</tr>';});
         t+='</tbody></table>';blocks.push(t);}
        // 週間勤務時間
        if(weeks.length>0){
          const cols=buildPdfCols(dept);const BDp="1px solid #888";
          let t=`<div style="font-size:13px;font-weight:700;margin:0 0 4px;">週間勤務時間（前期間含む）</div>`;
          t+='<table style="border-collapse:collapse;font-size:11px;"><thead><tr>';
          t+=`<th style="border:${BDp};padding:3px 6px;background:#f7f7f7;text-align:left;">週</th>`;
          cols.forEach(nm=>{if(isSpacer(nm)){t+=`<th style="border:${BDp};"></th>`;return;}const col=staffColorsPdf[nm]==="red"?"#e53935":"#000";t+=`<th style="border:${BDp};padding:3px 1px;width:26px;text-align:center;font-size:${vfontSize(nm,10)}px;line-height:1.15;color:${col};vertical-align:middle;">${vtext(nm)}</th>`;});
          t+='</tr></thead><tbody>';
          weeks.forEach(monStr=>{const m=pd(monStr);const sun=new Date(m);sun.setDate(m.getDate()+6);t+=`<tr><td style="border:${BDp};padding:3px 6px;white-space:nowrap;">${m.getDate()}〜${sun.getDate()}日</td>`;cols.forEach(nm=>{if(isSpacer(nm)){t+=`<td style="border:${BDp};"></td>`;return;}const min=getWeekMin(monStr,nm);const wl=staffLimitOf(settings,(settings.staffAttributes||{})[nm]);const st=limitStateOf(min,wl.weekly);const vs=st==="over"?"background:#FFE0E3;color:#e53935;font-weight:700;":"";t+=`<td style="border:${BDp};padding:3px 2px;text-align:center;${vs}">${min>0?esc(fmtH(min)):""}</td>`;});t+='</tr>';});
          t+='</tbody></table>';blocks.push(t);
        }
        // 週の休み・労務判定（2026-09-29 ユーザー指示で追加）。画面と同じ行定義（weekRestRows・laborRows）を使う
        if(isPremium&&weeks.length>0)blocks.push(buildTextRowsTableHtml("週の休み（前期間含む）","週",weekRestRows,dept));
        if(showLaborTable){
          blocks.push(buildTextRowsTableHtml(`労務判定（${period.startDate.slice(0,7).replace("-","年")}月）`,"労務",laborRows,dept));
          const fh=buildLaborFindingsHtml(dept);
          if(fh)blocks.push(fh);
        }
      }
      const{jsPDF}=window.jspdf;
      const pdf=opts.pdf||new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
      if(opts.pdf&&opts.first===false)pdf.addPage();
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
      if(batch)return;
      const deptSuffix=dept==="kit"?"_キッチン":dept==="hall"?"_ホール":"";
      const fname=`${pdfSanitize(shopName||"店舗")}${pdfSanitize(period.label||"")}${mode==="shift"?"シフト":"全データ"}${deptSuffix}.pdf`;
      pdf.save(fname);
      ph("pdf_exported",{period_id:period.id,mode,dept});
      tt(`✓ ${fname} をダウンロードしました`);
      setPdfModal(false);
    }catch(e){
      console.error("PDF生成失敗:",e);
      if(batch)throw e;
      tt("✕ PDF生成に失敗しました: "+e.message);
    }finally{
      setPdfBusy(false);
    }
  };
  // 全データPDFの年計を**実データ**で出すため、書き出す前に3ヶ月より前の提出も読み込む
  // （2026-09-29 ユーザー指示）。読み込みは非同期で、ここの exportPdf は古い描画の値を閉じ込めているので、
  // 届いたあとの描画で下の useEffect から書き出す（年計が「＋」付きの途中値のまま印刷されない）。
  // Excel 出力（期間タブの expXl と同じ関数を、このタブの凍結名簿・調整値で呼ぶ）。後回しの計算（S3）の途中に押されたら
  // 済んだ描画で下の useEffect から書き出す
  const exportExcel=()=>{
    const LE=editsNow(); // 確定済み＋入力中のセル（S2）
    const adjResolver=(name,date,field)=>{
      // ヘルプの合成表示（H2）。画面・PDF と同じ helperCellDisplay の文字を helperText で返し、expXl が黄色で書く。
      // helperDay（その日にヘルプ先の勤務がある）なら休みの斜線を引かない
      const hd=helperDisp(name,date);
      if(hd&&hd[field].helper)return{time:"",note:"",fixed:false,helperText:hd[field].text,helperDay:true};
      const helperDay=!!hd;
      if(fieldRest(name,date,field))return{time:"",note:"",fixed:false,rest:!helperDay,helperDay}; // 休み希望(/)はExcelで斜線描画
      const key=`${name}|${date}|${field}`;
      let time="",fixed=false;
      if(key in LE){const{numeric,hasFixed}=extractNote(LE[key]);time=parseTime(numeric)||"";fixed=fixedShiftEnabled&&hasFixed;}
      else{time=getStoredTime(name,date,field);fixed=getStoredFixed(name,date,field);}
      let note="";
      if(key in LE){note=extractNote(LE[key]).note||"";}
      else{const sh=_getSub(name)?.shifts?.[date];const adjNk=field==="start"?"adjustedStartNote":"adjustedEndNote";const origNk=field==="start"?"startNote":"endNote";note=sh?.[adjNk]??sh?.[origNk]??"";}
      // 「締」（追加出勤）はnoteとは独立に永続化されるためfixedで別枠に返す（pdfResolveと同じ組み立て）。
      // ここで返さないとExcelでだけ締めが脱落する（バグチェック#52）
      return{time,note,fixed,helperDay};
    };
    // 店舗名は settings.xlShopName（設定タブ「Excel書き出し設定」）を優先する。期間タブのExcel（PeriodsTab の expXl 呼び出し）は
    // 既にそうしており、設定の説明文も「Excel出力時のファイル名・シート内店舗名に反映されます」と
    // 約束している。ここだけ登録名を使うと、実際に配る側のシートにだけ設定が効かない。
    // xlShopName は凍結対象キーではないため、確定済み期間でも現在値が入る（期間タブ側と同じ）。
    expXl(period,subs,rosterStaffList,tt,settings.xlShopName||shopName||"店舗",{staffColors:settings.staffColors||{},staffAliases:settings.staffAliases||{},staffNumbers:settings.staffNumbers||{},settings},adjResolver);
  };
  const[xlPending,setXlPending]=useState(false);
  useEffect(()=>{
    if(!xlPending||calcPending)return;
    setXlPending(false);
    exportExcel();
  },[xlPending,calcPending]);
  const[pdfPending,setPdfPending]=useState(null);
  const startPdf=(mode,dept="all")=>{
    // 後回しの計算（S3）が済んでいなければ、済んだ描画で下の useEffect から書き出す（古い労務判定・合計で印刷しない）
    if(calcPending&&!(mode==="all"&&isPremium&&onLoadPastSubs&&!pastSubsLoaded&&hasOlderPeriods)){setPdfBusy(true);setPdfPending({mode,dept,needPast:false});return;}
    if(!(mode==="all"&&isPremium&&onLoadPastSubs&&!pastSubsLoaded&&hasOlderPeriods)){exportPdf(mode,dept);return;}
    setPdfBusy(true);
    const go=()=>setPdfPending({mode,dept,needPast:true});
    Promise.resolve(onLoadPastSubs()).then(go,go);
  };
  useEffect(()=>{
    // 過去の提出を待つ job（needPast）だけが pastSubsLoaded を待つ。計算中で積んだ job は計算が済めば書き出す
    if(!pdfPending||(pdfPending.needPast&&!pastSubsLoaded)||calcPending)return;
    const job=pdfPending;setPdfPending(null);
    exportPdf(job.mode,job.dept);
  },[pdfPending,pastSubsLoaded,calcPending]);
  // 企業連携タブの一括PDF（非表示マウント）から渡される書き出しジョブ。描画と集計が落ち着いてから1回だけ実行し、
  // 結果を onDone(null | Error) で返す。キーで重複実行を防ぐ（再レンダーで二重に書き出さない）。
  const exportJobDoneRef=useRef(null);
  useEffect(()=>{
    if(!exportJob||!period||!companyDataReady||calcPending||exportJobDoneRef.current===exportJob.key)return;
    const t=setTimeout(()=>{
      if(exportJobDoneRef.current===exportJob.key)return;
      exportJobDoneRef.current=exportJob.key;
      // 月次賃金ページ（P6b）: PDF は作らず、月の時間だけを返す
      if(exportJob.kind==="payroll"){
        let rep=null;try{rep=payrollReportRef.current();}catch(e){exportJob.onDone(e);return;}
        exportJob.onDone(null,rep);return;
      }
      // 企業横断ダッシュボード（P7）: PDF は作らず、人ごとの当月と年の値だけを返す
      if(exportJob.kind==="dashboard"){
        let rep=null;try{rep=dashboardReportRef.current();}catch(e){exportJob.onDone(e);return;}
        exportJob.onDone(null,rep);return;
      }
      exportPdf(exportJob.mode,"all",{pdf:exportJob.pdf,first:exportJob.first,save:false})
        .then(()=>exportJob.onDone(null),e=>exportJob.onDone(e||new Error("PDF生成失敗")));
    },300);
    return()=>clearTimeout(t);
  },[exportJob,period,companyDataReady,calcPending]);

  // 「過去データ読込」は労務判定の見出しの右に置く（2026-09-26 ユーザー指示）。年計・有給残が
  // 購読窓の外の期間を読めていないときに押すボタンなので、その表のそばに置く。
  // ただし労務判定表は「期間を選択済み・Premium・判定対象が1人以上」のときしか描かれないので、
  // 描かれないときだけ従来どおりヘッダーに出す（出す条件そのものは変えない＝ボタンが消えない）。
  const pastSubsBtn=(onLoadPastSubs&&!pastSubsLoaded&&hasOlderPeriods)?(
    <button onClick={onLoadPastSubs}
      style={{padding:"5px 10px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
      過去データ読込
    </button>
  ):null;
  // 企業への完成シフトの提出と提出期限（2026-09-27 企業連携の拡張）。企業に連携した店舗（companyLink）で、
  // Premium のときだけ出す。提出の状態は期間レコードの submission={at,byUid} に持ち、savePeriods
  // （差分 update）で書く。提出後の編集は自由。提出後のボタンは「再提出」で、押すと submission を丸ごと
  // 置き換える＝以前の提出記録は残さない。取り消しは無い（2026-09-27 ユーザー指示）。
  const submission=period&&period.submission&&period.submission.at?period.submission:null;
  // 期限は 日付指定 ＞ 毎月の固定締切（企業連携タブで設定）。ボタン行の下に1行で出す（2026-09-27 ユーザー指示）
  const coDeadlineInfo=companyLink&&period&&isPremium?shopDeadlineInfoFromLink(companyLink,period):null;
  const coDeadline=coDeadlineInfo?coDeadlineInfo.date:null;
  const coDeadlineOver=!!(coDeadline&&!submission&&todayStr>coDeadline);
  const coDaysLeft=coDeadline?Math.round((pd(coDeadline)-pd(todayStr))/86400000):null;
  // 確定した期間は提出し直せない（確定の解除は本部が行う）
  const canSubmit=!!companyLink&&isPremium&&!!period&&!ownerReadOnly&&!!savePeriods&&!periodConfirmed;
  const fmtMD=ds=>{const d=pd(ds);return isNaN(d)?ds:`${d.getMonth()+1}/${d.getDate()}(${WD[d.getDay()]})`;};
  const fmtAt=iso=>{const d=new Date(iso);return isNaN(d)?"":`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};
  const curUid=()=>(typeof firebaseAuth!=="undefined"&&firebaseAuth&&firebaseAuth.currentUser&&firebaseAuth.currentUser.uid)||"";
  const submitShift=()=>{
    if(!canSubmit)return;
    flushEdits(true);
    const by=curUid();
    const at=new Date().toISOString();
    // 提出・再提出は履歴（period.history）にも1件ずつ残す（submission は最新の1件で上書きされるため）
    savePeriods(periods.map(p=>p.id===period.id?withPeriodHistory({...p,submission:{at,byUid:by}},genPeriodHistoryKey(Date.parse(at)),periodHistoryEntry(submission?"resubmit":"submit",{at,byUid:by})):p));
    tt(submission?"✓ 企業にシフトを再提出しました":"✓ 企業にシフトを提出しました");
  };
  // ===== 本部店舗の固定勤務パターン（2026-09-30・P3・§3.1）=====
  const isHqPeriodFill=!!(companyLink&&companyLink.kind==="hq")&&!!period&&canEditCells&&!ownerReadOnly;
  const[hqFill,setHqFill]=useState({start:"9:00",end:"18:00",brk:"60"});
  const applyHqFill=()=>{
    if(!isHqPeriodFill)return;
    const st=parseTime(hqFill.start),en=parseTime(hqFill.end),brk=Number(hqFill.brk);
    if(!st||!en||st>=en){tt("▲ 出勤と退勤の時刻を確かめてください（退勤は出勤より後）");return;}
    if(!Number.isInteger(brk)||brk<0||brk>480){tt("▲ 休憩は0〜480分の整数で入れてください");return;}
    const preview=fillFixedPattern({subs,periodId:period.id,shopId,names:realStaff,dates,start:st,end:en,breakMin:brk,settings});
    if(!preview.filled){tt("入れる日がありません（土日祝・閉店日・入力済みの日は除外しています）");return;}
    if(!confirm(`${realStaff.length}名の空いている日（${preview.filled}件）に ${st}〜${en}・休憩${brk}分を入れますか？\n土日祝と閉店日は除外し、入力済みの日は変えません。`))return;
    flushEdits(true);
    const pid=period.id;
    onSave(prevSubs=>fillFixedPattern({subs:prevSubs,periodId:pid,shopId,names:realStaff,dates,start:st,end:en,breakMin:brk,settings}).subs);
    tt(`✓ ${preview.filled}件に固定勤務パターンを入れました`);
  };
  // ===== 確定・解除・交付（2026-09-30・P3・計画書 §3.5）=====
  // 確定できるのは企業セッション（企業コードのログインと企業の作成者本人）だけ。企業に連携していない店舗はオーナー。
  const canConfirm=!!period&&!!savePeriods&&canConfirmPeriod({companyLinkId:companyLink&&companyLink.id,sessionCompanyId:companyInfo&&companyInfo.companyId,ownerReadOnly});
  // 新しく確定するのは Premium だけ（GATED_FEATURES の confirm）。確定はスタッフの再提出をルールで止めるので、
  // Free/Pro の店舗が押せると提出が止まる。解除・交付は絞らない（降格した店舗が確定済みの期間を戻せなくなるため）
  const canStartConfirm=canConfirm&&featureEnabled("confirm",{plan,companyLink});
  const periodDelivered=isPeriodDelivered(period);
  const confirmPeriod=()=>{
    if(!canStartConfirm||periodConfirmed)return;
    if(lm.enabled&&!lm.loaded){tt("所定を読み込み中です。少し待ってからもう一度押してください");return;}
    if(!confirm("この期間を確定しますか？\n確定すると、この期間のシフトは編集できなくなり、スタッフの再提出もできなくなります。スタッフ一覧・属性・退勤延長などもこの時点の内容で固定し、人×月の所定（所定日数・所定時間）を集計して記録します。\n変更が必要になったら、理由を添えて確定を解除できます。"+(MY_SCREEN_ENABLED&&!isPeriodPublished(period)?"\nまだ公開していないので、スタッフのマイシフトにも同時に公開します（確定を解除しても公開は続きます）。":"")))return;
    // 未確定のセルを保存してから、その反映後の提出データで所定を集計する（onSave の反映は次の描画）。
    // 後回しの計算（S3）が済んだ描画で下の useEffect が行う（以前は setTimeout(0) で次の描画を待っていた）
    flushEdits(true);
    setConfirmJob({pid:period.id});
  };
  const[confirmJob,setConfirmJob]=useState(null);
  useEffect(()=>{
    if(!confirmJob||calcPending)return;
    const pid=confirmJob.pid;
    setConfirmJob(null);
    {
      const cur=periods.find(p=>p&&p.id===pid);
      // 所属店舗の所定は他店での勤務を足した値、行き先の店では所属店舗で判定する人を数えない（P3.6）。
      // 企業の確定（企業連携タブ）と同じ helperScheduleContext を通す
      const hctx=helperScheduleContext({shopId,names:rosterStaffList,settings,companyLink,otherShops:helperShops,subs:subsRef.current,todayStr});
      const r=planPeriodConfirmation({period:cur,periods,subs:subsRef.current,staffList:staffListProp,settings:settingsProp,laborMonths:lm.map,todayStr,uid:curUid(),
        extraDayMin:hctx.dayMin,excludeNames:hctx.excludeNames});
      if(r.error){tt("✕ "+r.error);return;}
      savePeriods(periods.map(p=>p&&p.id===pid?r.period:p));
      lm.save(r.laborMonthsPatch).catch(()=>{});
      updLocalEdits(()=>({}));
      tt("✓ この期間を確定しました（所定を記録しました）");
    }
  },[confirmJob,calcPending]);
  const unconfirmPeriod=()=>{
    if(!canConfirm||!periodConfirmed)return;
    const note=window.prompt("確定を解除する理由を入力してください（履歴に残ります）","");
    if(note===null)return;
    if(!note.trim()){tt("理由を入力してください");return;}
    const r=planPeriodUnconfirm({period,laborMonths:lm.map,uid:curUid(),note:note.trim()});
    if(r.error){tt("✕ "+r.error);return;}
    savePeriods(periods.map(p=>p&&p.id===period.id?r.period:p));
    lm.save(r.laborMonthsPatch).catch(()=>{});
    tt("✓ 確定を解除しました");
  };
  const deliverPeriod=()=>{
    if(!canConfirm||!periodConfirmed||periodDelivered)return;
    if(!confirm("この期間のシフトを本人へ交付したことを記録しますか？"))return;
    const r=planPeriodDelivery({period,uid:curUid()});
    if(r.error){tt("✕ "+r.error);return;}
    savePeriods(periods.map(p=>p&&p.id===period.id?r.period:p));
    tt("✓ 交付を記録しました");
  };
  // ===== 従業員画面への公開（2026-10-04・第2部 E3）=====
  // 公開・取り下げは period.published を差分 update で書く（submission と同じ流儀）。確定は未公開なら同時に公開する（planPeriodConfirmation）。
  // 出すのは従業員画面の入口が開いている環境（MY_SCREEN_ENABLED）で、この店舗が Premium（featureEnabled "myShift"）のオーナーの端末だけ。
  // 非表示マウント（一括PDF・月次賃金・ダッシュボード）は savePeriods=null・ownerReadOnly=true・exportJob ありなので出ない
  const periodPublished=isPeriodPublished(period);
  const canPublish=MY_SCREEN_ENABLED&&!!period&&!!savePeriods&&!ownerReadOnly&&!exportJob&&featureEnabled("myShift",{plan,companyLink});
  const publishPeriod=()=>{
    if(!canPublish||periodPublished)return;
    if(!confirm("この期間のシフトをスタッフのマイシフトに公開しますか？\n公開すると、マイシフトのアカウントを持つスタッフに、この期間の自分のシフトが確定した時間で表示されます。公開後に直したシフトはそのまま反映され、本人の画面に「変更あり」が付きます。"))return;
    // 未確定のセルを保存してから記録する（提出ボタンと同じ）。公開は計算の結果を使わないので後回しの計算（S3）は待たない
    flushEdits(true);
    const r=planPeriodPublish({period,uid:curUid()});
    if(r.error){tt("✕ "+r.error);return;}
    savePeriods(periods.map(p=>p&&p.id===period.id?r.period:p));
    tt("✓ この期間をマイシフトに公開しました");
  };
  const unpublishPeriod=()=>{
    if(!canPublish||!periodPublished)return;
    if(!confirm("この期間の公開を取り下げますか？\nスタッフのマイシフトでは、本人の提出（希望）の表示に戻ります。シフトの内容と確定には影響しません。"))return;
    const r=planPeriodUnpublish({period,uid:curUid()});
    if(r.error){tt("✕ "+r.error);return;}
    savePeriods(periods.map(p=>p&&p.id===period.id?r.period:p));
    tt("✓ 公開を取り下げました");
  };

  return(
    <div ref={outerRef} style={{padding:"12px 8px"}}>
      <CellTip setRef={tipSetRef}/>
      <div style={{marginBottom:10,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:15}}>シフト作成</span>
        <select value={selPid} onChange={e=>{setSelPid(e.target.value);discardEdits();setActualMode(false);}}
          style={{fontSize:16,padding:"4px 8px",border:BD,borderRadius:4,background:"var(--c-input)",color:"var(--c-text)"}}>
          {periods.map(p=><option key={p.id} value={p.id}>{p.label||(p.startDate+"〜"+p.endDate)}</option>)}
        </select>
        {/* 確定バッジと確定/解除/交付ボタン（P3）。確定するとセルもロックする（以前の確定は写しでマスタを固定するだけだった）。
            確定できるのは企業セッションだけ（単独店舗はオーナー）。終了前でも確定できる（前月末に確定するため）。 */}
        {period&&periodConfirmed&&<span data-period-state={periodDelivered?"delivered":"confirmed"}
          title={`確定 ${fmtAt(period.confirmation.at)}${periodDelivered?`／交付 ${fmtAt(period.delivery.at)}`:""}。この期間のシフトは編集できません（スタッフの再提出もできません）。スタッフ・属性・退勤延長などは確定時点の内容で固定しています`}
          style={{padding:"3px 8px",background:"rgba(248,112,54,.15)",border:"1px solid rgba(248,112,54,.45)",borderRadius:4,color:"var(--c-accent)",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{periodDelivered?"確定・交付済み":"確定済み（編集不可）"}</span>}
        {period&&canConfirm&&(periodConfirmed
          ?<React.Fragment>
            {!periodDelivered&&<button data-period-deliver="1" onClick={deliverPeriod}
              style={{padding:"5px 10px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>交付を記録</button>}
            <button data-period-unconfirm="1" onClick={unconfirmPeriod}
              style={{padding:"5px 10px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text2)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>確定を解除</button>
          </React.Fragment>
          :canStartConfirm&&<button data-period-confirm="1" onClick={confirmPeriod}
              style={{padding:"5px 10px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>確定</button>
        )}
        {canPublish&&(periodPublished
          ?<React.Fragment>
            <span data-period-published="1" title={`マイシフトに公開 ${fmtAt(period.published.at)}`}
              style={{fontSize:11,color:"var(--c-text3)",whiteSpace:"nowrap"}}>公開中 {fmtAt(period.published.at)}</span>
            <button data-period-unpublish="1" onClick={unpublishPeriod}
              style={{padding:"5px 10px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text2)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>公開を取り下げる</button>
          </React.Fragment>
          :<button data-period-publish="1" onClick={publishPeriod}
              style={{padding:"5px 10px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>公開</button>
        )}
        {canActuals&&<button data-actual-toggle={actualMode?"on":"off"} onClick={()=>setActualMode(v=>!v)}
          style={{padding:"5px 10px",background:actualMode?"var(--c-border2)":"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
          {actualMode?"シフト表示に戻る":"実績"}
        </button>}
        {!showLaborTable&&pastSubsBtn}
        {/* 入力例の案内は 2026-09-23 のユーザー指示で削除（操作方法はタブ最下部のレジェンドにある）。
            span 自体は flex:1 の伸び代として残す＝これを外すと右側のボタン群が左へ寄る。 */}
        <span style={{fontSize:11,color:"var(--c-text3)",flex:1}}>{isPremium?"":"閲覧のみ（編集はPremiumプランで）"}</span>
        <button onClick={()=>{setFitAll(v=>!v);setDeptFilter("all");}}
          style={{padding:"5px 10px",background:fitAll?"var(--c-border2)":"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
          {fitAll?"通常表示":"全表示"}
        </button>
        {hasSplit&&<button onClick={()=>{setDeptFilter(f=>f==="kit"?"all":"kit");setFitAll(false);}}
          style={{padding:"5px 10px",background:deptFilter==="kit"?"var(--c-border2)":"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
          キッチン
        </button>}
        {hasSplit&&<button onClick={()=>{setDeptFilter(f=>f==="hall"?"all":"hall");setFitAll(false);}}
          style={{padding:"5px 10px",background:deptFilter==="hall"?"var(--c-border2)":"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:4,color:"var(--c-text)",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
          ホール
        </button>}
        {/* 出力・保存はひとまとまりの操作なので、折り返さない1グループにする。
            以前は親の flexWrap がボタン単位で折り返すため、幅が足りない行末で「保存」だけが
            次の行に落ちて PDF出力 から離れていた。グループごと次の行へ送れば並びは崩れない。 */}
        {(period||isPremium)&&<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"nowrap"}}>
        {period&&<button onClick={()=>{if(calcPending){setXlPending(true);return;}exportExcel();}}
          style={{padding:"6px 14px",background:"#1D6F42",border:"none",borderRadius:8,color:"white",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
          Excel出力
        </button>}
        {period&&isPremium&&<button onClick={()=>setPdfModal(true)}
          style={{padding:"6px 14px",background:"#C0392B",border:"none",borderRadius:8,color:"white",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
          PDF出力
        </button>}
        {canEditCells&&<button onClick={handleSaveAll}
          style={{padding:"6px 14px",background:"var(--c-accent)",border:"none",borderRadius:8,color:"white",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
          保存
        </button>}
        {/* 提出（企業へ）。アクセントは保存に残し、提出は無彩色の枠線ボタンにする（アクセントは1つ） */}
        {canSubmit&&submission&&<span data-co-submitted="1" style={{fontSize:11,color:"var(--c-text3)",whiteSpace:"nowrap"}}>提出済み {fmtAt(submission.at)}</span>}
        {canSubmit&&<button data-co-submit-btn="1" onClick={submitShift}
          style={{padding:"6px 14px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text)",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
          {submission?"再提出":"提出"}
        </button>}
        </div>}
      </div>

      {/* 企業への提出期限。未提出の間は赤地の帯で目立たせる（2026-09-27 ユーザー指示）。提出済みになったら
          落ち着いた色へ戻す。赤は白文字とのコントラストが 4.5:1 を超える #C62828（#FF4757 だと約3.3:1で足りない） */}
      {coDeadline&&(
        <div data-co-deadline="1" data-co-deadline-source={coDeadlineInfo.source} data-co-deadline-alert={submission?"0":"1"}
          style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap",marginBottom:10,padding:"10px 14px",borderRadius:8,
            fontSize:13,fontWeight:600,
            ...(submission
              ?{background:"var(--c-input)",border:"1px solid var(--c-border2)",color:"var(--c-text2)"}
              :{background:"#C62828",border:"1px solid #C62828",color:"#FFFFFF"})}}>
          <span>提出期限</span>
          <span data-co-deadline-date="1" style={{fontSize:18,fontWeight:800}}>{fmtMD(coDeadline)}</span>
          <span data-co-deadline-state="1" style={{fontSize:14,fontWeight:700}}>
            {submission?"提出済み":coDeadlineOver?"期限を過ぎています":coDaysLeft===0?"今日まで":`あと${coDaysLeft}日`}
          </span>
        </div>
      )}

      {/* 本部店舗（kind:"hq"）の固定勤務パターン（P3・§3.1）。閉店日と土日祝を除き、まだ何も入っていない日だけに入れる */}
      {isHqPeriodFill&&(
        <div data-hq-fill="1" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10,padding:"8px 12px",border:"1px solid var(--c-border2)",borderRadius:8,fontSize:12,color:"var(--c-text2)",...NORMAL_W}}>
          <span style={{fontWeight:700}}>固定勤務パターン</span>
          <input data-hq-fill-start="1" value={hqFill.start} onChange={e=>setHqFill(f=>({...f,start:e.target.value}))} placeholder="9:00" style={{...AI,width:72,padding:"4px 6px"}}/>
          <span>〜</span>
          <input data-hq-fill-end="1" value={hqFill.end} onChange={e=>setHqFill(f=>({...f,end:e.target.value}))} placeholder="18:00" style={{...AI,width:72,padding:"4px 6px"}}/>
          <span>休憩</span>
          <input data-hq-fill-break="1" type="number" inputMode="numeric" min={0} max={480} value={hqFill.brk} onChange={e=>setHqFill(f=>({...f,brk:e.target.value}))} style={{...AI,width:72,padding:"4px 6px"}}/>
          <span>分</span>
          <button data-hq-fill-btn="1" onClick={applyHqFill} style={{...AGray,padding:"5px 10px",fontSize:12}}>全日に投入</button>
          <span style={{fontSize:11,color:"var(--c-text3)"}}>土日祝と閉店日は除外し、まだ何も入っていない日だけに入れます</span>
        </div>
      )}

      {/* 店舗間シフト重複エラー一覧 */}
      {Object.keys(dupErrors).length>0&&(
        <div style={{background:"rgba(255,71,87,.08)",border:"1px solid rgba(255,71,87,.3)",borderRadius:8,padding:"8px 12px",marginBottom:10,...NORMAL_W}}>
          <div style={{fontSize:12,fontWeight:700,color:"#FF4757",marginBottom:4,display:"flex",alignItems:"center",gap:8}}><span>⚠ 出勤がだぶついています（他店舗と時間重複）</span>{calcPending&&<CalcPendingNote/>}</div>
          <div style={{fontSize:12,color:"var(--c-text2)",lineHeight:1.7}}>
            {Object.entries(dupErrors).map(([k,shopNm])=>{
              const i=k.indexOf("|");const nm=k.slice(0,i);const d=k.slice(i+1);
              return`${nm} ${fmtDL(d)}（${shopNm}）`;
            }).join("、")}
          </div>
        </div>
      )}

      {/* 時刻の入力ミス（項目12・案C）: 保存は通し、ここと セル色で知らせる */}
      {Object.keys(timeErrors).length>0&&(
        <div style={{background:"rgba(190,24,93,.08)",border:"1px solid rgba(190,24,93,.3)",borderRadius:8,padding:"8px 12px",marginBottom:10,...NORMAL_W}}>
          <div style={{fontSize:12,fontWeight:700,color:"#BE185D",marginBottom:4,display:"flex",alignItems:"center",gap:8}}><span>⚠ 時刻の入力ミス（退勤が出勤より前）</span>{calcPending&&<CalcPendingNote/>}</div>
          <div style={{fontSize:12,color:"var(--c-text2)",lineHeight:1.7}}>
            {Object.keys(timeErrors).map(k=>{const i=k.indexOf("|");return`${k.slice(0,i)} ${fmtDL(k.slice(i+1))}`;}).join("、")}
          </div>
          <div style={{fontSize:11,color:"var(--c-text3)",marginTop:4}}>深夜は 25:00・26:00 のように入力します</div>
        </div>
      )}

      {pdfModal&&(
        <div onClick={()=>{if(!pdfBusy)setPdfModal(false);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9998,padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--c-card)",borderRadius:12,padding:"22px 20px",width:"100%",maxWidth:340,boxShadow:"0 8px 32px var(--c-shadow)"}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:6,color:"var(--c-text)"}}>PDF出力</div>
            <div style={{fontSize:12,color:"var(--c-text3)",marginBottom:16}}>出力する内容を選択してください</div>
            <button disabled={pdfBusy} onClick={()=>startPdf("shift")}
              style={{width:"100%",padding:"12px",marginBottom:10,background:"#C0392B",border:"none",borderRadius:8,color:"white",fontSize:14,fontWeight:700,cursor:pdfBusy?"default":"pointer",opacity:pdfBusy?0.6:1}}>
              {pdfBusy?"生成中...":"シフト"}
              <div style={{fontSize:11,fontWeight:400,marginTop:2,opacity:0.85}}>シフト表のみ（Excelと同じ形式）</div>
            </button>
            <button disabled={pdfBusy} onClick={()=>startPdf("all")}
              style={{width:"100%",padding:"12px",marginBottom:hasSplit?10:14,background:"var(--c-card)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text)",fontSize:14,fontWeight:700,cursor:pdfBusy?"default":"pointer",opacity:pdfBusy?0.6:1}}>
              {pdfBusy?"生成中...":"全データ"}
              <div style={{fontSize:11,fontWeight:400,marginTop:2,opacity:0.85}}>{isPremium?"シフト表・カウント・ヒートマップ・勤務時間集計・週の休み・労務判定":"シフト表・カウント・ヒートマップ・勤務時間集計"}</div>
            </button>
            {hasSplit&&<div style={{marginBottom:14}}>
              <div style={{display:"flex",gap:6}}>
                <button disabled={pdfBusy} onClick={()=>startPdf("shift","hall")}
                  style={{flex:1,padding:"9px 4px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text2)",fontSize:12,fontWeight:600,cursor:pdfBusy?"default":"pointer",opacity:pdfBusy?0.6:1}}>
                  ホールのみ
                </button>
                <button disabled={pdfBusy} onClick={()=>startPdf("shift","kit")}
                  style={{flex:1,padding:"9px 4px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text2)",fontSize:12,fontWeight:600,cursor:pdfBusy?"default":"pointer",opacity:pdfBusy?0.6:1}}>
                  キッチンのみ
                </button>
              </div>
            </div>}
            <button disabled={pdfBusy} onClick={()=>setPdfModal(false)}
              style={{width:"100%",padding:"9px",background:"var(--c-input)",border:"1px solid var(--c-border2)",borderRadius:8,color:"var(--c-text2)",fontSize:13,fontWeight:600,cursor:pdfBusy?"default":"pointer",opacity:pdfBusy?0.6:1}}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      {!period?<div style={{color:"var(--c-text3)"}}>期間を選択してください</div>:showActuals?(
        <ActualsGrid period={period} dates={dates} staff={realStaff} subOf={_getSub} settings={settings} act={act} tt={tt} subs={subs}/>
      ):(
        <div style={useBreakout?{marginLeft:-(containerLeft+8),width:viewW,paddingLeft:8,paddingRight:8,boxSizing:"border-box",display:hasPanel?"flex":"block",justifyContent:fitsCentered?"center":"flex-start",alignItems:"flex-start",gap:4}:{}}>

          {/* === 左パネル: キッチン熱マップ（通常表示+split時、またはキッチン絞り込み時） === */}
          {kitShownAsPanel&&<div style={{width:panelW,flexShrink:0,overflowX:"auto"}}>
            <HeatTable pending={calcPending} label="" section="kit" maxC={kitMax} rowH={heatRowH} theadH={measuredTheadH} sectionLabel="キッチン" dates={dates} heatHours={heatHours} countHeat={countHeat} hBg={hBg} scrollRef={kitHeatRef} onScroll={e=>syncScrollV(e.currentTarget)} maxH="70vh" fitHours={fitHeatHoursPanel}/>
          </div>}

          {/* === 中央: グリッド + 集計 === */}
          {/* fitsCentered時はwidthを明示指定する。GridLegend/集計表など幅auto(=block)の子要素の
              max-content幅（折り返し前提の説明文など）に引きずられてflex:0 0 autoだけでは
              グリッド表本来の幅に収まらないため、グリッドの実幅(gridContentW)で強制的に固定する */}
          <div ref={centerColRef} style={hasPanel?(fitsCentered?{flex:"0 0 auto",width:gridContentW,minWidth:0}:{flex:1,minWidth:0}):{}}>

          {/* ===メイングリッド（SL列廃止・日付のみstickyで15名対応）=== */}
          {/* overflowXが"auto"だとoverflowYも暗黙にautoへ昇格し、maxHeightがないと内部スクロールが発生せずposition:stickyのtopが機能しない。名前行を画面上端に固定するためmaxHeightで実スクロール領域にする */}
          <div ref={mainScrollRef} onScroll={e=>{syncScrollH(e.currentTarget);syncScrollV(e.currentTarget);}} style={{overflowX:fitAll?"hidden":"auto",overflowY:"auto",maxHeight:fullView?fvAvailH:"70vh",border:BD,borderRadius:8,marginBottom:16,...fvCenter}}>
            <table style={{borderCollapse:"collapse",width:fullView?fvTableW:(fitAll?"100%":"unset"),minWidth:fitAll?"unset":"max-content"}}>
              <thead ref={gridTheadRef}>
                <tr style={fullView?{height:fvTheadH}:undefined}>
                  {/* 通常表示のヘッダは padding を SD（2px 1px）のまま使う。4px にすると45pxの
                      border-box では中身が37pxになり、「日付」の位置だけ下の行とずれて見える */}
                  <th style={{...SD,...(fullView?(fvScrolls?{position:"sticky",top:0,zIndex:4}:{}):{top:0,zIndex:4}),fontWeight:600,borderBottom:BD2,background:CRD}}>日付</th>
                  {mapGridCols(name=>VTH(name,true,true),key=>spacerTh(key,true))}
                  {fullView&&<th style={{...SDR,...(fvScrolls?{position:"sticky",top:0,zIndex:4}:{}),fontWeight:600,borderBottom:BD2,background:CRD}}>日付</th>}
                </tr>
              </thead>
              <tbody ref={gridBodyRef}>
                {dates.map((date,di)=>{
                  const d=pd(date);const day=d.getDay();
                  const isHol=isHoliday(date);const isSun=day===0;const isSat=day===6;
                  const isSpecRed=isSpecialRedDate(date,settings);
                  const dc=(isSun||isHol||isSpecRed)?"#e53935":isSat?"#1976d2":"var(--c-text)";
                  const baseRb=(isSun||isHol||isSpecRed)?"rgba(229,57,53,0.07)":isSat?"rgba(25,118,210,0.07)":"transparent";
                  // ポジション不足がある帯（ランチ=出勤行/ディナー=退勤行）のセル背景を黄色く塗る。
                  // 不足しているカテゴリ(キッチン/ホール)の担当スタッフのセルのみ対象（cellPosErrがスタッフ所属で判定）。
                  const rbS=name=>cellPosErr(name,date,"lunch")?LEGEND_COLORS.posErr:baseRb;
                  const rbE=name=>cellPosErr(name,date,"dinner")?LEGEND_COLORS.posErr:baseRb;
                  return[
                    <tr key={date+"-s"} style={{background:baseRb}}>
                      <td rowSpan={2} style={{...SD,color:dc,verticalAlign:"middle",borderBottom:BD,background:CRD}}>{fmtDL(date)}</td>
                      {mapGridCols(name=>(
                        <td key={name} style={{padding:0,boxSizing:BOXS,borderLeft:BD,borderBottom:"none",textAlign:"center",background:rbS(name),width:colW,minWidth:colW,maxWidth:colW}}>
                          <ShiftCell {...cellPropsOf(name,date,"start",di)}/>
                        </td>
                      ),spacerCell)}
                      {/* 右端の日付（全表示のみ）。左端と同じ rowSpan=2 で出勤行に置く */}
                      {fullView&&<td rowSpan={2} style={{...SDR,color:dc,verticalAlign:"middle",borderBottom:BD,background:CRD}}>{fmtDL(date)}</td>}
                    </tr>,
                    <tr key={date+"-e"} style={{background:baseRb}}>
                      {mapGridCols(name=>(
                        <td key={name} style={{padding:0,boxSizing:BOXS,borderLeft:BD,borderBottom:BD,textAlign:"center",background:rbE(name),width:colW,minWidth:colW,maxWidth:colW}}>
                          <ShiftCell {...cellPropsOf(name,date,"end",di)}/>
                        </td>
                      ),spacerCell)}
                    </tr>
                  ];
                })}
              </tbody>
            </table>
          </div>

          {/* ポジション不足エラー一覧: 通常/ホール絞り込み時はホール→キッチンの順、キッチン絞り込み時は逆順 */}
          {(positionErrorEntries.kitchen.length>0||positionErrorEntries.hall.length>0||positionErrorEntries.all.length>0)&&(
            <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"8px 12px",marginBottom:10,...NORMAL_W}}>
              <div style={{fontSize:12,fontWeight:700,color:"#DC2626",marginBottom:4,display:"flex",alignItems:"center",gap:8}}><span>⚠ ポジションが不足しています</span>{calcPending&&<CalcPendingNote/>}</div>
              <div style={{fontSize:12,color:"var(--c-text2)",lineHeight:1.7}}>
                {(deptFilter==="kit"?[...positionErrorEntries.kitchen,...positionErrorEntries.hall,...positionErrorEntries.all]:[...positionErrorEntries.hall,...positionErrorEntries.kitchen,...positionErrorEntries.all])
                  .map(e=>`${pd(e.date).getDate()}日${e.meal==="lunch"?"ランチ":"ディナー"}${e.posName} -${e.short}`)
                  .join("、")}
              </div>
            </div>
          )}

          {/* === 休みカウント / 連勤カウント === */}
          <div ref={restScrollRef} onScroll={e=>syncScrollH(e.currentTarget)} style={{overflowX:fitAll?"hidden":"auto",border:BD,borderRadius:8,marginBottom:16,...fvCenter,...(calcPending?CALC_PENDING_DIM:{})}}>
            <table style={{borderCollapse:"collapse",width:fullView?fvTableW:(fitAll?"100%":"unset"),minWidth:fitAll?"unset":"max-content"}}>
              {/* ラベル列はグリッドの日付列と同じ45pxなので、省略記号で消えないよう
                  短い見出しに差し替える（title属性に元の見出しを残す）。全表示では右端にも同幅の空列を足して
                  スタッフ列の位置をグリッドと揃える。**この表はスタッフ名のヘッダを持たないので、
                  列がずれるとどの数字が誰のものか分からなくなる。** */}
              <tbody>
                {[
                  {key:"full",label:"1日休み（回）",short:"1日休",bb:BD,val:name=>fullDayCounts[name]||0},
                  {key:"half",label:"半日休み（回）",short:"半日休",bb:BD,val:name=>halfDayCounts[name]||0},
                  {key:"sum",label:"休み合計",short:"休計",bb:BD,val:name=>(restCounts[name]||0)%1===0?(restCounts[name]||0):(restCounts[name]||0).toFixed(1)},
                  {key:"consec",label:"最大連勤数",short:"連勤",bb:BD,val:name=>consecCounts[name]||0},
                  {key:"cut",label:"削り（回）",short:"削り",bb:BD2,val:name=>cutCounts[name]||0},
                ].map(r=>(
                  <tr key={r.key}>
                    <td title={r.label} style={{...SD,fontWeight:600,borderBottom:r.bb,background:CRD,fontSize:fullView?Math.min(11,fvDateFont):11}}>{r.short}</td>
                    {mapGridCols(name=>(
                      <td key={name} style={{width:colW,minWidth:colW,maxWidth:colW,boxSizing:BOXS,padding:"3px 2px",textAlign:"center",borderLeft:BD,borderBottom:r.bb,background:CRD,fontSize:11,fontWeight:400,color:"var(--c-text2)"}}>
                        {r.val(name)}
                      </td>
                    ),spacerTh)}
                    {fullView&&<td style={{...SDR,borderBottom:r.bb,background:CRD}}></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===時間帯別出勤人数 (サイドパネル非表示分・絞り込み時の相手側は常にここに表示) === */}
          {(kitBelow||hallBelow)&&<div style={{marginBottom:16,...NORMAL_W}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:6,color:"var(--c-text2)",display:"flex",alignItems:"center",gap:8}}><span>時間帯別出勤人数</span>{calcPending&&<CalcPendingNote/>}</div>
            {/* flexWrap は必須: 子は minWidth:200 で縮まないため、幅が 410px(200*2+gap) を
                下回るモバイルでは折り返さないと横並びのまま親をはみ出し、ページ全体が横スクロールする
                （デスクトップ幅では2つとも収まるので折り返さず見た目は不変。実測: バグチェック#73） */}
            <div style={{display:"flex",flexDirection:"row",flexWrap:"wrap",gap:10,justifyContent:"center"}}>
              {kitBelow&&<HeatTable pending={calcPending} label={hasSplit?"キッチン":""} section="kit" maxC={kitMax} dates={dates} heatHours={heatHours} countHeat={countHeat} hBg={hBg} fitHours={fitHeatHoursBelow} fixedW={heatBelowW}/>}
              {hallBelow&&<HeatTable pending={calcPending} label="ホール" section="hall" maxC={hallMax} dates={dates} heatHours={heatHours} countHeat={countHeat} hBg={hBg} fitHours={fitHeatHoursBelow} fixedW={heatBelowW}/>}
            </div>
          </div>}

          {/* ===期間別勤務時間（前半/後半/月計を常に3行）=== */}
          <SummaryTable pending={calcPending} title="期間別勤務時間" rowLabel="期間" scrollRef={periodScrollRef} onScroll={e=>syncScrollH(e.currentTarget)} rows={periodRows} fitAll={fitAll} mapGridCols={mapGridCols} spacerTh={spacerTh} spacerCell={spacerCell} colW={colW} VTH={VTH} labelW={DATE_COL_W} fullView={fullView} tableW={fvTableW}/>

          {/* ===週間勤務時間=== */}
          {weeks.length>0&&<SummaryTable
            pending={calcPending}
            title="週間勤務時間（前期間含む）"
            rowLabel="週"
            scrollRef={weekScrollRef}
            onScroll={e=>syncScrollH(e.currentTarget)}
            fitAll={fitAll}
            labelW={DATE_COL_W}
            fullView={fullView}
            tableW={fvTableW}
            mapGridCols={mapGridCols}
            spacerTh={spacerTh}
            spacerCell={spacerCell}
            colW={colW}
            VTH={VTH}
            rows={[...weeks.map(monStr=>{
              const m=pd(monStr);const sun=new Date(m);sun.setDate(m.getDate()+6);
              return{id:monStr,label:`${m.getDate()}〜${sun.getDate()}日`,getMin:name=>getWeekMin(monStr,name),
                _violateFn:(name,min)=>{const l=staffLimitOf(settings,(settings.staffAttributes||{})[name]);return limitStateOf(min,l.weekly);}};
            }),{id:"weekly_limit",label:"週上限",getMin:name=>staffLimitOf(settings,(settings.staffAttributes||{})[name]).weekly*60,_color:"#3B82F6",_bg:"rgba(96,165,250,0.07)"},
            ...(realStaff.some(n=>staffLimitOf(settings,(settings.staffAttributes||{})[n]).weeklyMin>0)
              ?[{id:"weekly_min",label:"週目安",getMin:name=>staffLimitOf(settings,(settings.staffAttributes||{})[name]).weeklyMin*60,_color:"#2563EB",_bg:"rgba(59,130,246,0.07)"}]:[])]}
          />}

          {/* === 週の休み（S-5）。公休と無記入だけを数え、有給・慶弔は数えない === */}
          {isPremium&&weeks.length>0&&<SummaryTable
            pending={calcPending}
            title="週の休み（前期間含む）"
            rowLabel="週"
            scrollRef={weekRestScrollRef}
            onScroll={e=>syncScrollH(e.currentTarget)}
            fitAll={fitAll}
            labelW={DATE_COL_W}
            fullView={fullView}
            tableW={fvTableW}
            mapGridCols={mapGridCols}
            spacerTh={spacerTh}
            spacerCell={spacerCell}
            colW={colW}
            VTH={VTH}
            rows={weekRestRows}
          />}

          {/* === 労務（A制の目安・総括判定）。所属店舗で判定する人（行き先の店）は空欄になる === */}
          {showLaborTable&&<SummaryTable
            pending={calcPending}
            title={`労務判定（${period?period.startDate.slice(0,7).replace("-","年")+"月":""}）`}
            titleRight={pastSubsBtn}
            rowLabel="労務"
            scrollRef={laborScrollRef}
            onScroll={e=>syncScrollH(e.currentTarget)}
            fitAll={fitAll}
            labelW={DATE_COL_W}
            fullView={fullView}
            tableW={fvTableW}
            mapGridCols={mapGridCols}
            spacerTh={spacerTh}
            spacerCell={spacerCell}
            colW={colW}
            VTH={VTH}
            rows={laborRows}
          />}

          {/* 人×月の所定（P3・§3.4）。確定で自動集計して凍結する。確定前はここで手修正できる（10月分の遡り登録もここ） */}
          {isPremium&&lm.enabled&&period&&(
            <div data-lm-card="1" style={{border:"1px solid var(--c-border2)",borderRadius:8,padding:"8px 12px",marginBottom:10,...NORMAL_W}}>
              <button data-lm-toggle="1" onClick={()=>setLmOpen(v=>!v)} style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:12,fontWeight:700,color:"var(--c-text2)"}}>
                {lmOpen?"▾":"▸"} 人×月の所定（{lmYm.replace("-","年")}月）
              </button>
              {lmOpen&&<div style={{marginTop:8}}>
                <div style={{fontSize:11,color:"var(--c-text3)",lineHeight:1.6,marginBottom:8}}>期間を確定すると、シフトから所定日数・所定時間を集計して記録します。確定前はここで直せます（前の月を遡って登録するときは、その月の期間を選んでから入力します）。月のすべての期間が確定すると変更できなくなります。</div>
                {!lm.loaded?<div style={{fontSize:12,color:"var(--c-text3)"}}>読み込み中...</div>:
                <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr>{["名前","シフトから集計","所定日数","所定時間","状態",""].map(h=><th key={h} style={{textAlign:"left",padding:"4px 6px",borderBottom:BD,color:"var(--c-text3)",fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                  <tbody>{realStaff.map(name=>{
                    const rec=laborMonthOf(lm.map,lmYm,name);const a=lmAuto[name]||{days:0,min:0};
                    const frozen=isLaborMonthFrozen(rec);const d=lmDraft[name]||{};
                    const dv=d.days!==undefined?d.days:String(rec?rec.days:a.days);
                    const tv=d.time!==undefined?d.time:fmtMin(rec?Number(rec.min)||0:a.min);
                    return(<tr key={name} data-lm-row={name}>
                      <td style={{padding:"4px 6px",borderBottom:BD,whiteSpace:"nowrap",fontWeight:600}}>{name}</td>
                      <td style={{padding:"4px 6px",borderBottom:BD,whiteSpace:"nowrap",color:"var(--c-text3)"}}>{a.days}日・{fmtMin(a.min)}</td>
                      <td style={{padding:"4px 6px",borderBottom:BD}}><input data-lm-days={name} disabled={frozen} type="number" inputMode="numeric" min={0} max={31} value={dv} onChange={e=>setLmDraft(x=>({...x,[name]:{...(x[name]||{}),days:e.target.value}}))} style={{...AI,width:64,padding:"3px 6px"}}/></td>
                      <td style={{padding:"4px 6px",borderBottom:BD}}><input data-lm-time={name} disabled={frozen} value={tv} onChange={e=>setLmDraft(x=>({...x,[name]:{...(x[name]||{}),time:e.target.value}}))} style={{...AI,width:84,padding:"3px 6px"}}/></td>
                      <td data-lm-state={frozen?"frozen":rec?"saved":"none"} style={{padding:"4px 6px",borderBottom:BD,whiteSpace:"nowrap",color:"var(--c-text3)"}}>{frozen?"確定済み":rec?(isLaborMonthEdited(rec)?"手修正":"記録済み"):"未登録"}</td>
                      <td style={{padding:"4px 6px",borderBottom:BD}}>{!frozen&&!ownerReadOnly&&<button data-lm-save={name} onClick={()=>saveLmRow(name)} style={{...AGray,padding:"3px 10px",fontSize:12}}>登録</button>}</td>
                    </tr>);
                  })}</tbody>
                </table></div>}
              </div>}
            </div>
          )}

          {/* 労務判定（S-4）。所属店舗で判定する人（行き先の店・P3.6）は労働時間の判定・集計から外れる。
              応援・外部の属性は B と同じ判定（2026-10-03）。
              **労務判定の表のすぐ下に置く**（2026-09-26 ユーザー指示）。総括が「要修正」の人を
              表で見つけ、そのまま下の一覧で理由を読む並びにしている */}
          {laborFindings.some(f=>f.screen.length>0)&&(
            <div style={{background:"rgba(248,112,54,.07)",border:"1px solid rgba(248,112,54,.3)",borderRadius:8,padding:"8px 12px",marginBottom:10,...NORMAL_W}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--c-accent)",marginBottom:4,display:"flex",alignItems:"center",gap:8}}><span>⚠ 労務の確認が必要です</span>{calcPending&&<CalcPendingNote/>}</div>
              <div style={{fontSize:12,color:"var(--c-text2)",lineHeight:1.7}}>
                {laborFindings.filter(f=>f.screen.length>0).map(({name,screen})=>(
                  <div key={name}>{name}：{screen.join("、")}</div>
                ))}
              </div>
            </div>
          )}

          {/* ===操作方法レジェンド（CELL_COMMANDS / CELL_COLOR_LEGEND から自動生成）=== */}
          <div style={{...NORMAL_W,overflow:"hidden"}}><GridLegend abbrToShop={abbrToShop} shopName={shopName}/></div>

          </div>{/* end center */}

          {/* === 右パネル: ホール熱マップ（通常表示+split時、またはホール絞り込み時） === */}
          {hallShownAsPanel&&<div style={{width:panelW,flexShrink:0,overflowX:"auto"}}>
            <HeatTable pending={calcPending} label="" section="hall" maxC={hallMax} rowH={heatRowH} theadH={measuredTheadH} sectionLabel="ホール" dates={dates} heatHours={heatHours} countHeat={countHeat} hBg={hBg} scrollRef={hallHeatRef} onScroll={e=>syncScrollV(e.currentTarget)} maxH="70vh" fitHours={fitHeatHoursPanel}/>
          </div>}

        </div>
      )}
    </div>
  );
}
