// ============================================================
// Shifty - 共有ユーティリティ（純粋関数・ブラウザAPI非依存 / Nodeテスト可能）
// app.js から分割（M-1）。ロジックは一切変更していない。
// ============================================================

// ===== 定数 =====
const WD=["日","月","火","水","木","金","土"];
// 日本の祝日（固定祝日 + ハッピーマンデー + 年ごと変動）
// 固定祝日: MMDD形式
const JH_FIXED=new Set(["0101","0211","0223","0429","0503","0504","0505","0811","1103","1123"]);
// 年別祝日（振替・ハッピーマンデー含む）: YYYYMMDD形式
const JH_DATES=new Set([
  // 2025
  "20250101","20250113","20250211","20250223","20250320","20250429","20250503","20250504","20250505",
  "20250721","20250811","20250915","20250923","20251013","20251103","20251123","20251124",
  // 2026
  "20260101","20260112","20260211","20260223","20260320","20260429","20260503","20260504","20260505",
  "20260720","20260811","20260921","20260922","20260923","20261012","20261103","20261123",
  // 2027
  "20270101","20270111","20270211","20270223","20270321","20270322","20270429","20270503","20270504","20270505",
  "20270719","20270811","20270920","20270923","20271011","20271103","20271123",
  // 2028
  "20280101","20280110","20280211","20280223","20280320","20280429","20280503","20280504","20280505",
  "20280717","20280811","20280918","20280922","20281009","20281103","20281123",
]);
function isHoliday(dateStr){
  const d=pd(dateStr);
  const yyyymmdd=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  const mmdd=yyyymmdd.slice(4);
  return JH_DATES.has(yyyymmdd)||JH_FIXED.has(mmdd);
}

// ===== サブスクリプション プラン定義（純粋定数）=====
const PLAN_LIMITS = {
  free:    { shops: Infinity, staff: 20, periods: 1 },
  pro:     { shops: Infinity, staff: Infinity, periods: Infinity },
  premium: { shops: Infinity, staff: Infinity, periods: Infinity },
};
const PLAN_LABELS = { free: "Free", pro: "Pro", premium: "Premium" };
const STAFF_TYPE_LABELS = {employee:"社員",parttime:"バイト",dispatch:"派遣",other:"その他"};
const BUILTIN_TYPES = ["employee","parttime","dispatch","other"];

// ===== デフォルト候補時間 =====
// ===== デフォルト候補時間 =====
const CAND_WEEKDAY=[
  {start:"10:00",end:"15:00"},{start:"11:00",end:"15:00"},
  {start:"17:00",end:"23:00"},{start:"18:00",end:"23:00"},
  {start:"10:00",end:"23:00"},{start:"11:00",end:"23:00"}
];
const CAND_WEEKEND=[
  {start:"10:00",end:"15:00"},{start:"11:00",end:"15:00"},
  {start:"10:00",end:"17:00"},{start:"11:00",end:"17:00"},
  {start:"15:00",end:"23:00"},{start:"17:00",end:"23:00"},
  {start:"18:00",end:"23:00"},{start:"10:00",end:"23:00"},
  {start:"11:00",end:"23:00"}
];

// ===== ユーティリティ =====
// ===== ユーティリティ =====
function fd(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function pd(s){if(typeof s!=="string"||!s)return new Date(NaN);const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);}
function gd(s,e){if(typeof s!=="string"||typeof e!=="string"||!s||!e)return[];const r=[],st=pd(s),en=pd(e);if(isNaN(st)||isNaN(en))return[];let c=new Date(st);while(c<=en){r.push(fd(c));c.setDate(c.getDate()+1);}return r;}
// subs購読の直近ウィンドウ（月数）。startDateがこの期間内の期間だけを常時購読しDL量を抑える。
const SUBS_WINDOW_MONTHS=3;
// 直近ウィンドウの下限日付("YYYY-MM-DD")。refDate（省略時は今日）からmonths分さかのぼった日付。
function subsWindowCutoff(refDate,months){
  const d=refDate?new Date(refDate):new Date();
  const base=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  base.setMonth(base.getMonth()-(months==null?SUBS_WINDOW_MONTHS:months));
  return fd(base);
}
// startDateが直近ウィンドウ内にある期間IDの配列を返す（"YYYY-MM-DD"は辞書順比較が日付順と一致）。
function recentPeriodIds(periods,refDate,months){
  const cutoff=subsWindowCutoff(refDate,months);
  return (periods||[]).filter(p=>p&&p.id&&p.startDate&&p.startDate>=cutoff).map(p=>p.id);
}
// 「設定済みの日付」一覧の表示下限日付("YYYY-MM-DD")。最新から3個前の期間(降順で4番目)のstartDateを返し、
// この日付以降の設定済み日付だけを表示する（cutoff当日は dt>=cutoff で残る）。期間が4件未満なら null=全件表示。
// periodsは降順ソート済み前提だが、空・未ソートでも安全に動くよう startDate で降順ソートし直してから取る。
function dateCandidateDisplayCutoff(periods){
  const dates=(periods||[]).filter(p=>p&&p.startDate).map(p=>p.startDate).sort().reverse();
  return dates.length>=4?dates[3]:null;
}
function gto(){
  const o=[];
  // 0:00〜27:00（15分刻み・連続）。24:00=翌0:00、25:00〜27:00=翌1:00〜翌3:00 で深夜跨ぎを表現。
  // 全24時間＋深夜帯を欠けなくカバー（朝営業・深夜営業の候補時刻に対応）。
  for(let h=0;h<=27;h++){
    const ms=h===27?[0]:[0,15,30,45];
    for(const m of ms) o.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  }
  return o;
}
const TO=gto();
const TO_START=TO.filter(t=>{const m=t.split(":")[1];return m==="00"||m==="30";}); // 出勤時間は30分刻み
function idp(d){return d?new Date()>new Date(d+"T23:59:59"):false;}
function sc(cs){return[...cs].sort((a,b)=>{if(a.closed)return 1;if(b.closed)return -1;const ta=Number(a.start.replace(":","").replace(":","")),tb=Number(b.start.replace(":","").replace(":","")),ea=Number(a.end.replace(":","").replace(":","")),eb=Number(b.end.replace(":","").replace(":",""));return ta!==tb?ta-tb:ea-eb;});}
// 祝日判定（簡易）
// isHoliday は上で定義済み
function isWeekendOrHoliday(dateStr){const dow=pd(dateStr).getDay();return dow===0||dow===6||isHoliday(dateStr);}
// extraStart/extraEnd（「締」等の店舗限定固定シフトコマンドによる追加出勤期間）がある場合は主シフトとは別に加算する。
// 追加期間は休憩控除・残業延長の対象外（主シフトの休憩帯と重ならない深夜帯を想定した単純加算）。
function calcNetWorkMinutes(shift,breaks,overtimeMins=0){
  if(!shift||shift.status!=="work")return 0;
  const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
  let net=0;
  const st=shift.adjustedStart??shift.start;
  let en=shift.adjustedEnd??shift.end;
  if(st&&en){
    if(overtimeMins>0){const[h,m]=en.split(":").map(Number);const tot=h*60+m+overtimeMins;en=`${Math.floor(tot/60)}:${String(tot%60).padStart(2,"0")}`;}
    const ws=toMin(st),we=toMin(en);
    if(we>ws){
      let seg=we-ws;
      (breaks||[]).forEach(br=>{const bs=toMin(br.start),be=toMin(br.end);if(ws>=bs)return;const ol=Math.min(we,be)-Math.max(ws,bs);if(ol>0)seg-=ol;});
      net+=Math.max(0,seg);
    }
  }
  if(shift.extraStart&&shift.extraEnd){
    const es=toMin(shift.extraStart),ee=toMin(shift.extraEnd);
    if(ee>es)net+=(ee-es);
  }
  return net;
}
function getBreakList(settings,dateStr){
  const bt=(settings&&settings.breakTimes)||{};
  // 必要ポジション設定と同じ5区分(平日/土曜/日曜/祝日連休中/祝日最終日)で解決し、
  // 候補タブの日付別で選んだ区分(dateCandidatePosTypes / 候補一致推論)に自動追従する。
  const dt=positionDayTypeFor(dateStr,settings);
  let list=bt[dt];
  // 旧4区分の後方互換: 祝日を holSat/holSun に分割する前の "hol" データは、
  // 該当する祝日区分に未設定のときだけ流用する（既存店舗の休憩設定を失わせない）。
  if((!list||!list.length)&&(dt==="holSat"||dt==="holSun"))list=bt.hol;
  return list||[];
}
// 17:00(1020分)を境界にランチ帯/ディナー帯を判定し出勤数を返す。
// extraStart/extraEnd（「締」等の追加出勤期間）があれば主シフトと合算してhasLunch/hasDinner/attendanceを判定する
// （主シフトがランチのみ・追加期間がディナー帯なら合わせて終日出勤=attendance1になる）。
function shiftBandInfo(shift){
  if(!shift||shift.status!=="work")return{startMin:0,endMin:0,hasLunch:false,hasDinner:false,attendance:0};
  const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
  const st=shift.adjustedStart??shift.start;const en=shift.adjustedEnd??shift.end;
  let startMin=0,endMin=0,hasLunch=false,hasDinner=false,totalMin=0,any=false;
  if(st&&en){
    const s0=toMin(st),e0=toMin(en);
    if(e0>s0){startMin=s0;endMin=e0;hasLunch=s0<1020;hasDinner=e0>1020;totalMin+=e0-s0;any=true;}
  }
  if(shift.extraStart&&shift.extraEnd){
    const s1=toMin(shift.extraStart),e1=toMin(shift.extraEnd);
    if(e1>s1){
      if(!any){startMin=s1;endMin=e1;}
      hasLunch=hasLunch||s1<1020;hasDinner=hasDinner||e1>1020;totalMin+=e1-s1;any=true;
    }
  }
  if(!any)return{startMin:0,endMin:0,hasLunch:false,hasDinner:false,attendance:0};
  const attendance=((hasLunch&&hasDinner)||totalMin>=540)?1:0.5;
  return{startMin,endMin,hasLunch,hasDinner,attendance};
}
// ===== シフト作成タブ: セルコマンドの帯別（ランチ/ディナー）反映 =====
// 帯境界は17:00固定（shiftBandInfo・ヘルプ判定・ポジション判定と同じ1020分）。候補時間から算出される
// HEAT_LUNCH_END_MIN / HEAT_DINNER_START_MIN（app-admin.js）は「片側セルのみ入力時の時間補完」専用であり、
// 帯の区切りには使わない（可変境界を区切りに使うと時間セルが2帯にまたがって二重カウントされる）。
const HEAT_BAND_SPLIT_MIN=1020;
// 出勤セルの値=ランチ帯・退勤セルの値=ディナー帯に対応付ける共通規則。h/kサフィックスと
// 他店舗ヘルプ略称の両方がこの規則を共有する。
// 帯を跨ぐシフトは各セルの値をその帯に厳密に適用する（「9三」「22」＝ランチだけ他店舗ヘルプ）。
// 片方の帯にしか掛からないシフトのみ、値のないセル側を反対側セルの値でフォールバックする
// （「18h」「23」のようなディナーのみシフトでhが黙殺されないようにするため。2026-07-21確定仕様）。
function resolveBandValues(stM,enM,startVal,endVal,splitM){
  const sp=splitM==null?HEAT_BAND_SPLIT_MIN:splitM;
  const sv=startVal||null,ev=endVal||null;
  if(stM<sp&&enM>sp)return{lunch:sv,dinner:ev};
  return{lunch:sv||ev,dinner:ev||sv};
}
// h/kサフィックス→ヒートマップのセクション（"hall"/"kit"）。未登録・空はnull（＝所属のデフォルトに従う）
function noteToHeatSection(note){
  return note==="h"?"hall":note==="k"?"kit":null;
}
// ヒートマップの出勤エントリをセクション別に分割する。帯を跨ぎ かつ ランチ帯とディナー帯で
// セクションが異なるときだけ HEAT_BAND_SPLIT_MIN で2件に分ける。
// splitEnabled=false（ホール/キッチン分割を使っていない店舗＝hall列が非表示）は、h/kが付いていても
// 常にdefaultSecの1件に集約する（hallに振り分けるとカウントが画面から消えるため）。
function heatSectionEntries(o){
  const stM=o.stM,enM=o.enM,def=o.defaultSec||"kit";
  if(!(stM<enM))return[];
  if(!o.splitEnabled)return[{stM,enM,section:def}];
  const sp=o.splitM==null?HEAT_BAND_SPLIT_MIN:o.splitM;
  const bv=resolveBandValues(stM,enM,noteToHeatSection(o.startNote),noteToHeatSection(o.endNote),sp);
  const ls=bv.lunch||def,ds=bv.dinner||def;
  if(enM<=sp)return[{stM,enM,section:ls}];
  if(stM>=sp)return[{stM,enM,section:ds}];
  if(ls===ds)return[{stM,enM,section:ls}];
  return[{stM,enM:sp,section:ls},{stM:sp,enM,section:ds}];
}
// 属性ID→名称のリスト（staffTypeLimits優先・社員/バイト補完）
function getAttrOptions(settings){
  const stl=(settings&&settings.staffTypeLimits)||{};
  const out=[];
  if(stl.employee&&stl.employee.name)out.push(["employee",stl.employee.name]);else out.push(["employee","社員"]);
  if(stl.parttime&&stl.parttime.name)out.push(["parttime",stl.parttime.name]);else out.push(["parttime","バイト"]);
  Object.keys(stl).forEach(id=>{if(id!=="employee"&&id!=="parttime"&&stl[id]&&stl[id].name)out.push([id,stl[id].name]);});
  return out;
}
// 休憩適用の統一入口: 属性タグフィルタ + 実際のシフト時間帯との重なり判定
// 属性一致のタグ付き休憩がその日区分にある場合はタグなし休憩を適用しない（差し替え方式）
// 休憩の適用可否は出勤日数(attendance=1出勤等)のような汎用閾値では判定しない（2026-07-10改修）。
// その代わり、休憩を丸ごとまたいでいるか（出勤が休憩開始より前 かつ 退勤が休憩終了より後）だけを見る。
// ランチのみ（休憩終了と同時刻に退勤）やディナーのみ（休憩開始と同時刻に出勤）のような
// 休憩の片側にしか触れないシフトには適用しない（2026-07-10追加修正）。
function getBreaksFor(settings,dateStr,staffName,shift){
  if(!shift||shift.status!=="work")return[];
  const list=getBreakList(settings,dateStr);
  const attr=((settings&&settings.staffAttributes)||{})[staffName]||"parttime";
  const hasTagged=list.some(br=>br&&br.tags&&br.tags.length&&br.tags.includes(attr));
  const stStr=shift&&(shift.adjustedStart??shift.start);
  const enStr=shift&&(shift.adjustedEnd??shift.end);
  const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
  const ws=stStr?toMin(stStr):null;
  const we=enStr?toMin(enStr):null;
  return list.filter(br=>{
    const tags=br&&br.tags;
    if(tags&&tags.length){if(!tags.includes(attr))return false;}
    else if(hasTagged)return false;
    if(ws!==null&&br&&br.start&&ws>=toMin(br.start))return false;
    if(we!==null&&br&&br.end&&we<=toMin(br.end))return false;
    return true;
  });
}
// 退勤延長: shiftの実効終了時刻で ランチ(≤17:00)/ディナー(>17:00) を判定して延長分を返す
function getOT(staffName,settings,shift){
  const raw=(settings?.overtimeSettings?.byStaff||{})[staffName];
  if(raw==null)return 0;
  if(typeof raw==="number")return raw; // レガシー数値
  const lunch=raw.lunch||0,dinner=raw.dinner||0;
  if(!shift)return dinner;
  const en=shift.adjustedEnd??shift.end;
  if(!en)return dinner;
  const[h,m]=en.split(":").map(Number);
  return(h*60+m)<=1020?lunch:dinner;
}
function fmtMin(min){if(!min&&min!==0)return"";const h=Math.floor(min/60),m=min%60;return`${h}:${String(m).padStart(2,"0")}`;}

// ===== ポジションエラー判定 =====
// 休み日（土日祝のいずれか）判定。連休の塊を数えるための内部ヘルパー
function isRestDay(dateStr){const dow=pd(dateStr).getDay();return dow===0||dow===6||isHoliday(dateStr);}
function addDays(dateStr,n){const d=pd(dateStr);d.setDate(d.getDate()+n);return fd(d);}
// 曜日区分判定（祝日は「連休の中でどう機能するか」でさらに2分割する）。
// weekday/sat/sun は非祝日のみ。祝日は必ず holSat か holSun のどちらかになる（祝日自体が土日でも同様）。
// holSun（日曜扱い）: 祝日自体が日曜日、または「休み日(土日祝)が2日以上連続する塊」の最終日（＝翌日に平日が戻る）
// holSat（土曜扱い）: 祝日自体が土曜日、または連休初日〜最終日前日、または前後を平日に挟まれた単独の祝日
//   （単独祝日は2日以上の塊を作らないため「連休最終日」に該当せずholSatに倒れる）
// sun（非祝日の日曜）: 翌日(月曜)が祝日で連休が続く場合はsunではなくsat扱いにする
//   （その日曜はまだ連休の途中であり、実際の最終日は翌日の祝日=holSunになるため）
function dayTypeOf(dateStr){
  const dow=pd(dateStr).getDay();
  if(isHoliday(dateStr)){
    if(dow===0)return"holSun";
    if(dow===6)return"holSat";
    let runEnd=dateStr;
    while(isRestDay(addDays(runEnd,1)))runEnd=addDays(runEnd,1);
    let runStart=dateStr;
    while(isRestDay(addDays(runStart,-1)))runStart=addDays(runStart,-1);
    const runLength=Math.round((pd(runEnd)-pd(runStart))/86400000)+1;
    return(runLength>=2&&runEnd===dateStr)?"holSun":"holSat";
  }
  if(dow===0)return isHoliday(addDays(dateStr,1))?"sat":"sun";
  if(dow===6)return"sat";
  return"weekday";
}
// シフト作成タブ「必要ポジション設定」の曜日区分（祝日をholSat/holSunに分割した5分類）。休憩時間(breakTimes)もこの5区分を共有し、getBreakListがpositionDayTypeForで日付→区分を解決する（旧"hol"データは後方互換で流用）。
const POSITION_DAY_TYPES=[["weekday","平日"],["sat","土曜"],["sun","日曜"],["holSat","祝日（連休中・単日）"],["holSun","祝日（最終日）"]];
// weekdayCandidates のキー(0〜8) → 必要ポジションの曜日区分(weekday/sat/sun/holSat/holSun) へ変換する。
// 0=日→sun, 1〜5=月〜金→weekday, 6=土→sat, 7=祝(単)→holSat, 8=祝(終)→holSun。対応外はnull。
function weekdayKeyToPositionDayType(key){
  const k=Number(key);
  if(k===7)return"holSat";
  if(k===8)return"holSun";
  if(k===0)return"sun";
  if(k===6)return"sat";
  if(k>=1&&k<=5)return"weekday";
  return null;
}
// 2つの候補配列(Cand[])が「同じ内容か」を判定する。sc()で正規化後に要素ごとに比較（closedも含めて完全一致）。
function candListsEqual(a,b){
  const na=sc([...(a||[])]),nb=sc([...(b||[])]);
  if(na.length!==nb.length)return false;
  for(let i=0;i<na.length;i++){
    const x=na[i],y=nb[i];
    if(x.closed||y.closed){if(!!x.closed!==!!y.closed)return false;continue;}
    if(x.start!==y.start||x.end!==y.end)return false;
  }
  return true;
}
// 指定した候補配列と完全一致する曜日別候補(weekdayCandidates)を探し、対応するポジション区分の集合を返す。
// 例: dateCandsが土曜と単独祝日の両方の候補と一致するなら Set{"sat","holSat"} を返す。
function matchingPositionDayTypes(dateCands,weekdayCandidates){
  const set=new Set();
  const wc=weekdayCandidates||{};
  Object.keys(wc).forEach(key=>{
    const cands=wc[key];
    if(!cands||!cands.length)return;
    if(candListsEqual(dateCands,cands)){
      const pt=weekdayKeyToPositionDayType(key);
      if(pt)set.add(pt);
    }
  });
  return set;
}
// requiredPositions に1件でもポジション枠が設定されているか（区分×ランチ/ディナー×キッチン/ホールのいずれか）。
function hasAnyRequiredPosition(requiredPositions){
  const reqAll=requiredPositions||{};
  return Object.values(reqAll).some(dt=>dt&&["lunch","dinner"].some(m=>{const r=dt[m];return !!(r&&(((r.kitchen||[]).length)||((r.hall||[]).length)||((r.all||[]).length)));}));
}
// 必要ポジション判定で日付に適用する曜日区分を決める。
// 1) settings.dateCandidatePosTypes[dateStr] に有効な手動指定があればそれを使う
// 2) なければ dateCandidates[dateStr] と完全一致する曜日別候補の区分が一意に定まればそれを使う
// 3) それ以外はカレンダー規則(dayTypeOf)へフォールバック
function positionDayTypeFor(dateStr,settings){
  const s=settings||{};
  const override=s.dateCandidatePosTypes&&s.dateCandidatePosTypes[dateStr];
  if(override&&POSITION_DAY_TYPES.some(t=>t[0]===override))return override;
  const dc=s.dateCandidates&&s.dateCandidates[dateStr];
  if(dc&&dc.length){
    const types=matchingPositionDayTypes(dc,s.weekdayCandidates||{});
    if(types.size===1)return[...types][0];
  }
  return dayTypeOf(dateStr);
}
// 必要ポジション(slots・重複可の配列)と出勤者(attendees:[{name,positions:[]}])の最大二部マッチング（Kuhn法）。
// 1人が複数ポジションを持っていても同時に埋められるのは1枠のみ（「1出勤につき1人」の制約）。
// 単純な貪欲割当だと本来埋まる組み合わせを見逃す（例: 枠[調理長,フライヤー]・A[調理長,フライヤー]・B[調理長]は
// A→フライヤー,B→調理長で両方埋まるが、枠を先頭から貪欲に割り当てるとAが調理長を取ってフライヤーが埋まらなくなる）
// ため、増加道(augmenting path)による再割当てで最大マッチングを求める。
function matchPositionSlots(slots,attendees){
  const shortageByPosition={};
  if(!slots||slots.length===0)return{matchedCount:0,shortageByPosition};
  const list=attendees||[];
  const matchOfStaff=new Array(list.length).fill(-1); // staffIdx -> slotIdx
  const slotMatched=new Array(slots.length).fill(false);
  const tryAssign=(slotIdx,visited)=>{
    for(let si=0;si<list.length;si++){
      if(visited[si])continue;
      if(!(list[si].positions||[]).includes(slots[slotIdx]))continue;
      visited[si]=true;
      if(matchOfStaff[si]===-1||tryAssign(matchOfStaff[si],visited)){
        matchOfStaff[si]=slotIdx;
        slotMatched[slotIdx]=true;
        return true;
      }
    }
    return false;
  };
  slots.forEach((_,slotIdx)=>{tryAssign(slotIdx,new Array(list.length).fill(false));});
  let matchedCount=0;
  slots.forEach((posName,slotIdx)=>{
    if(slotMatched[slotIdx])matchedCount++;
    else shortageByPosition[posName]=(shortageByPosition[posName]||0)+1;
  });
  return{matchedCount,shortageByPosition};
}

// ===== ストレージキー（店舗IDベース）=====
function storeKey(shopId,key){return`shift_${shopId}_${key}`;}

// ===== ランダムID生成 =====
function genToken(){
  // 8文字のランダム英数字（URLトークン用・小文字のみ・紛らわしい文字除外）
  const chars="abcdefghijkmnpqrstuvwxyz23456789";
  let t="";
  for(let i=0;i<8;i++) t+=chars[Math.floor(Math.random()*chars.length)];
  return t;
}
function genSecureId(len=24){
  // 大文字・小文字・数字・記号を含む強力なランダムID（招待コード・shopId用）
  // Firebase禁止文字（. $ # [ ] /）を除外した記号のみ使用
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@%&*+-=?_~";
  const arr=new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr,b=>chars[b%chars.length]).join("");
}
const isSpacer=n=>typeof n==="string"&&n.startsWith("__spacer__");

// ===== 別名解決・サジェスト =====
// 別名 → 登録名に解決する（staffAliases: {"登録名": ["alias1","alias2"]}）
function resolveAlias(inputName, staffAliases){
  if(!inputName||!staffAliases)return inputName;
  for(const [registered, aliases] of Object.entries(staffAliases)){
    if(Array.isArray(aliases)&&aliases.map(a=>a.trim()).includes(inputName.trim()))return registered;
  }
  return inputName;
}
// 登録名+別名を含む全サジェスト候補を生成（{display, registered, isAlias}[]）
function buildSuggestList(staffList, staffAliases){
  const result=[];
  staffList.forEach(name=>{
    result.push({display:name,registered:name,isAlias:false});
    const aliases=(staffAliases||{})[name]||[];
    aliases.forEach(a=>{if(a&&a.trim())result.push({display:a.trim(),registered:name,isAlias:true});});
  });
  return result;
}

// ===== シフト作成タブ: セルコマンドレジストリ =====
// パーサ（extractNote / isRestCommand）とタブ最下部の「操作方法」レジェンド（GridLegend）の共通ソース。
// 新しいセルコマンド・セル色を追加するときは必ずここに登録する。レジェンドはこの配列から自動生成されるため
// 登録すれば説明も自動で追記される（tests/core.test.js の完全性テストが登録漏れを検出する）。
const CELL_COMMANDS=[
  {key:"h",kind:"suffix",usage:"9h",label:"ホール出張",desc:"キッチン所属のスタッフをホールの人数として集計する。出勤セルに付けるとランチ帯（〜17時）、退勤セルに付けるとディナー帯（17時〜）だけに反映する（例: 出勤9h・退勤22 → ランチはホール・ディナーはキッチン）。片方の帯しかないシフトでは、もう一方のセルのコマンドも有効になる",color:"#FFF3B0"},
  {key:"k",kind:"suffix",usage:"9k",label:"キッチン入り",desc:"ホール所属のスタッフをキッチンの人数として集計する。出勤セルに付けるとランチ帯（〜17時）、退勤セルに付けるとディナー帯（17時〜）だけに反映する。片方の帯しかないシフトでは、もう一方のセルのコマンドも有効になる",color:"#FFF3B0"},
  {key:"x",kind:"suffix",usage:"9x",label:"ヘルプ（カウント外）",desc:"時間帯別出勤人数に数えない。x単体入力も同じ扱い（コマンド以外の文字だけの入力はメモとしてそのまま表示される）",color:"#FFF3B0"},
  {key:"y",kind:"rest",usage:"y",label:"休み希望",desc:"セルを休み扱いにして斜線を表示する（出勤セル=ランチ帯・退勤セル=ディナー帯・両方=終日）。もう一度 y で解除、時間を入力すると出勤に上書き。「休」でも入力できる",hatch:true},
  {key:"締",kind:"fixed",usage:"16k締",label:"締め（東通り店専用・追加出勤）",desc:"出勤・退勤どちらのセルに単独入力、または数字・h/k/x・他店舗略称など他のコマンドと組み合わせて（前後どちらでも可）入力しても、23:00〜25:00(翌1:00)を主シフトとは別の追加出勤として計上する（例: 出勤13・退勤17締 → 13〜17時と23〜25時の2出勤。出勤16k締 → キッチン入りかつ追加出勤）。鷄えん東通り店でのみ有効",start:"23:00",end:"25:00"},
];
// セル背景色・記号の意味（cellBgForとレジェンドの共通ソース）
const CELL_COLOR_LEGEND=[
  {key:"changed",color:"rgba(52,199,89,.30)",label:"変更マーク",desc:"セルをトリプルクリック（スマホはトリプルタップ）でオン/オフ。確定後に変更したシフトの目印"},
  {key:"dup",color:"rgba(255,71,87,.35)",label:"店舗間シフト重複",desc:"企業連携している他店舗のシフトと勤務時間が重なっている"},
  {key:"note",color:"#FFF3B0",label:"特記あり",desc:"h・k・x・他店舗略称などのサフィックスが付いたセル"},
  {key:"rest",hatch:true,label:"休み希望（斜線）",desc:"スタッフが提出した休み希望、または管理者が y で入力した休み"},
  {key:"posErr",color:"rgba(250,204,21,0.35)",label:"ポジション不足",desc:"必要ポジション設定に対して出勤人数・ポジションが不足しているランチ/ディナーの行"},
];
// 休み希望コマンド判定（セル全体が y / 休 のとき。時間付きの「9y」は通常サフィックス扱い）
const isRestCommand=raw=>/^(y|ｙ|休)$/i.test(String(raw==null?"":raw).trim());
// サフィックス抽出: 登録済みコマンド(kind:"suffix")は小文字に正規化、任意文字列=そのまま保持(数値なしの
// 文字だけの入力もコマンド以外はメモとしてそのまま保持し、x単体のみカウント外扱い)、""=通常。
// rest=true は休み希望コマンド（numeric/noteは空）。旧実装はShiftEditTab内ローカル関数（2026-07-09にレジストリ駆動化して移設）
// hasFixed: 店舗限定固定シフトコマンド(kind:"fixed"。現状「締」)が、他のサフィックス(h/k/x/略称)と
// 併用された場合も含めて含まれているかどうか。noteからは固定コマンドの文字自体を取り除いた「素の」値を返す
// ことで、h/k/x判定・略称lookup(abbrToShop等)がnoteの完全一致に依存する既存ロジックへ影響を与えない。
// 前後どちらの順序で入力しても（例:「16k締」「16締k」）同じ結果になるよう単純な文字列除去で判定する。
function extractNote(raw){
  if(raw==null||!String(raw).trim())return{numeric:"",note:"",rest:false,hasFixed:false};
  const s=String(raw).trim();
  if(isRestCommand(s))return{numeric:"",note:"",rest:true,hasFixed:false};
  const fixedKey=(CELL_COMMANDS.find(c=>c.kind==="fixed")||{}).key||"";
  const m=s.match(/^([\d.:]+)(.*)$/s);
  if(!m||!m[1]){
    // 数値部なし(文字のみ): 登録済みの固定シフトコマンド(締)を含んでいれば取り除いてから判定する。
    // 素の値が空=固定コマンド単独→note=""、登録済みsuffix(h/k/x)単体→x(カウント外)、
    // それ以外の「コマンド未設定の任意文字列」はメモとしてそのまま表示できるよう保持する
    // （数字付き「9研修」が研修を保持するのと同じ扱い。時間なしのため出勤人数・ヘルプ集計には非影響）。
    const hasFixed=!!fixedKey&&s.includes(fixedKey);
    const body=hasFixed?s.split(fixedKey).join(""):s;
    let note;
    if(!body)note="";
    else if(CELL_COMMANDS.some(c=>c.kind==="suffix"&&c.key===body.toLowerCase()))note="x";
    else note=body;
    return{numeric:"",note,rest:false,hasFixed};
  }
  const rawSuf=m[2].trim();
  if(!rawSuf)return{numeric:m[1],note:"",rest:false,hasFixed:false};
  const hasFixed=!!fixedKey&&rawSuf.includes(fixedKey);
  const suf=hasFixed?rawSuf.split(fixedKey).join(""):rawSuf;
  if(!suf)return{numeric:m[1],note:"",rest:false,hasFixed};
  const l=suf.toLowerCase();
  if(CELL_COMMANDS.some(c=>c.kind==="suffix"&&c.key===l))return{numeric:m[1],note:l,rest:false,hasFixed};
  return{numeric:m[1],note:suf,rest:false,hasFixed}; // 日本語含む任意サフィックスはそのまま保持
}
// 店舗限定の固定シフトコマンド（kind:"fixed"）判定。セル全体がコマンドキーと完全一致するときそのレジストリ
// エントリ（{start,end,...}）を返す。店舗が対象かどうかは呼び出し側がisFixedShiftEligibleShopで判定する
// （このパーサ自体は店舗を知らない純粋関数のまま保つ）。
function fixedShiftCommandFor(raw){
  const s=String(raw==null?"":raw).trim();
  if(!s)return null;
  return CELL_COMMANDS.find(c=>c.kind==="fixed"&&c.key===s)||null;
}
// 「締」等の店舗限定固定シフトコマンドを有効化する店舗かどうか（店舗名に対象文言を含むかで判定）
function isFixedShiftEligibleShop(shopName){
  return typeof shopName==="string"&&(shopName.includes("鷄えん東通り")||shopName.includes("東通り"));
}

// ===== Firebase書き込みの最終防御: undefined の除去 =====
// Realtime Database は undefined を含むオブジェクトに対して set()/update() が「同期例外」を投げる
// （Promiseのrejectではないため .catch() では捕捉できない）。呼び出し元が1箇所でも undefined を
// 混ぜると、その保存が失われるだけでなく、undefined入りのオブジェクトがReact stateに残るため
// 以降の全保存が同じ例外で失敗し続ける。書き込み直前にここを通して構造的に防ぐ。
// 実際の値は app-core.js の fbSet/fbUpd が書き込み前に適用する。
//
// 戻り値は {value, found}。found は検出したパスの配列で、空でなければ呼び出し元のバグを示す
// （fbSet/fbUpd が DEV_MODE では例外、本番では警告＋計測イベントに振り分ける）。

// set() 用。undefined を持つキーを再帰的に取り除く（＝そのキーはDB上に存在しなくなる）。
// null は「削除」の明示的な意思表示なので保持する。配列の undefined 要素は、要素を落とすと
// 添字がずれてデータが壊れるため null に置換する。入力オブジェクトは破壊しない
// （React state をそのまま渡すため、ここで書き換えると画面と保存内容が食い違う）。
function sanitizeForSet(val,base="",found=[]){
  if(val===undefined){found.push(base||"(root)");return{value:null,found};}
  if(Array.isArray(val)){
    const out=val.map((el,i)=>{
      if(el===undefined){found.push(`${base}[${i}]`);return null;}
      return sanitizeForSet(el,`${base}[${i}]`,found).value;
    });
    return{value:out,found};
  }
  if(val!==null&&typeof val==="object"&&!(val instanceof Date)){
    const out={};
    Object.keys(val).forEach(k=>{
      const v=val[k];
      const p=base?`${base}/${k}`:k;
      if(v===undefined){found.push(p);return;} // キーごと落とす
      out[k]=sanitizeForSet(v,p,found).value;
    });
    return{value:out,found};
  }
  return{value:val,found};
}

// update() 用。トップレベルのエントリ値が undefined なら null に変換する。
// ここでエントリ自体を落としてはいけない（update はパス単位の代入なので、落とすと
// 「そのパスを触らない」＝古い値が残るという別のバグになる）。null に変換すればそのパスが
// 削除され、set() 側で「キーを落とす」のと同じ最終状態に収束する。
// エントリの値がオブジェクトの場合、そのパスへの書き込みは実質 set と同じなので中身は
// sanitizeForSet の規則（キーを落とす）を適用する。
function sanitizeForUpdate(payload,found=[]){
  const out={};
  Object.keys(payload||{}).forEach(k=>{
    const v=payload[k];
    if(v===undefined){found.push(k);out[k]=null;return;}
    out[k]=sanitizeForSet(v,k,found).value;
  });
  return{value:out,found};
}

// ===== subs保存: フィールド単位Firebase書き込み =====
// saveSubsが1つのsubの変更をFirebaseへ書き込む際、sub全体をset/updateすると同じsubの
// 別フィールドを編集した他端末・別編集の変更を巻き戻してしまう（last-write-winsが
// オブジェクト全体に効いてしまうため）。変更されたフィールドだけをフラットパス
// （"subId"=新規sub全体 / "subId/フィールド名" / "subId/shifts/日付"）に展開し、
// 実際に変わった部分だけをupdate()することで他フィールドを巻き込まないようにする。
// prevSubが存在しない（新規作成）場合はsub全体を1エントリとして返す。
function diffSubForFlatWrite(id,prevSub,newSub){
  const out={};
  if(!prevSub){out[id]=newSub;return out;}
  const prevShifts=prevSub.shifts||{};
  const shifts=newSub.shifts||{};
  Object.keys(shifts).forEach(date=>{
    if(shifts[date]!==prevShifts[date])out[`${id}/shifts/${date}`]=shifts[date];
  });
  Object.keys(prevShifts).forEach(date=>{
    if(!(date in shifts))out[`${id}/shifts/${date}`]=null;
  });
  Object.keys(newSub).forEach(key=>{
    if(key==="shifts")return;
    if(newSub[key]!==prevSub[key])out[`${id}/${key}`]=newSub[key];
  });
  Object.keys(prevSub).forEach(key=>{
    if(key==="shifts")return;
    if(!(key in newSub))out[`${id}/${key}`]=null;
  });
  return out;
}
// diffSubForFlatWriteが作ったフラットパス1件をsubId→subのマップに適用する（flushSubsのマージで使用）。
// value===nullはそのパスの削除。mapは呼び出し元が浅いコピーを渡すこと（このマップ自体を書き換える）。
function applyFlatSubWrite(map,path,value){
  const parts=path.split("/");
  const id=parts[0];
  if(parts.length===1){
    if(value===null)delete map[id];else map[id]=value;
    return;
  }
  if(!map[id])return; // ベースsubがまだ届いていない（後続の別flushで再試行される）
  const base={...map[id]};
  if(parts.length===2){
    const key=parts[1];
    if(value===null)delete base[key];else base[key]=value;
  }else if(parts.length===3&&parts[1]==="shifts"){
    const date=parts[2];
    const shifts={...(base.shifts||{})};
    if(value===null)delete shifts[date];else shifts[date]=value;
    base.shifts=shifts;
  }
  map[id]=base;
}

// 提出一覧のソート用「最終アクション時刻」（ミリ秒）。再提出（変更あり）はupdatedAt、それ以外は初回提出時刻を返す。
// 変更ありの判定は分単位で比較する。提出直後にupdatedAtが数秒だけ進むケースを再提出とみなさないための基準。
// 「変更あり」バッジの判定は subHasRealUpdate（締切日ゲート付き）に移した。ここは並べ替え専用。
function subLastActionTime(sub){
  if(!sub)return 0;
  const st=new Date(sub.submittedAt||0).getTime();
  const base=Number.isNaN(st)?0:st;
  if(!sub.isUpdated||!sub.updatedAt)return base;
  const ut=new Date(sub.updatedAt).getTime();
  if(Number.isNaN(ut))return base;
  const mn=t=>Math.floor(t/60000);
  return mn(ut)>mn(base)?ut:base;
}

// 提出一覧の「変更あり」バッジ判定。締切日がある期間は「締切日（23:59）を過ぎてからの変更」のみ変更ありとする。
// 締切日なし・締切日が不正な日付の場合は従来判定（初回提出より1分以上後の更新があれば変更あり）。
function subHasRealUpdate(sub,deadlineDate){
  if(!sub)return false;
  const last=subLastActionTime(sub);
  const st=new Date(sub.submittedAt||0).getTime();
  const base=Number.isNaN(st)?0:st;
  if(last<=base)return false;            // 変更なし（subLastActionTimeの分単位判定に一本化）
  if(!deadlineDate)return true;          // 締切なし→従来判定
  const dl=new Date(deadlineDate+"T23:59:59").getTime();
  if(Number.isNaN(dl))return true;       // 不正な締切→従来判定
  return last>dl;                        // 締切後の変更のみ変更あり
}

// 平日（月〜金・非祝日）に日祝系ポジション区分が設定されている日付判定（シフト表・Excel・PDF の赤背景表示用）。
// posTypeが sun/holSat/holSun のいずれかで、かつ実際の日付が土日でも祝日でもない場合にtrueを返す。
function isSpecialRedDate(dateStr,settings){
  const posType=(settings&&settings.dateCandidatePosTypes)?settings.dateCandidatePosTypes[dateStr]:null;
  if(!posType)return false;
  const sunTypes=["sun","holSat","holSun"];
  if(!sunTypes.includes(posType))return false;
  const dow=pd(dateStr).getDay();
  if(dow===0||dow===6)return false; // 土日は元々色がある
  if(isHoliday(dateStr))return false; // 実祝日も元々色がある
  return true;
}

// ===== Nodeテスト用エクスポート（ブラウザでは module 未定義のため無視される）=====
if(typeof module!=="undefined"&&module.exports){
  module.exports={fd,pd,gd,idp,sc,isHoliday,isWeekendOrHoliday,calcNetWorkMinutes,getBreakList,shiftBandInfo,HEAT_BAND_SPLIT_MIN,resolveBandValues,noteToHeatSection,heatSectionEntries,getBreaksFor,getOT,fmtMin,genToken,genSecureId,isSpacer,resolveAlias,buildSuggestList,getAttrOptions,TO,TO_START,JH_DATES,CELL_COMMANDS,CELL_COLOR_LEGEND,isRestCommand,extractNote,fixedShiftCommandFor,isFixedShiftEligibleShop,SUBS_WINDOW_MONTHS,subsWindowCutoff,recentPeriodIds,dateCandidateDisplayCutoff,subLastActionTime,subHasRealUpdate,sanitizeForSet,sanitizeForUpdate,diffSubForFlatWrite,applyFlatSubWrite,dayTypeOf,matchPositionSlots,POSITION_DAY_TYPES,weekdayKeyToPositionDayType,candListsEqual,matchingPositionDayTypes,positionDayTypeFor,hasAnyRequiredPosition,isSpecialRedDate};
}
