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
function gto(){
  const o=[];
  // 9:00〜24:00（15分刻み）
  for(let h=9;h<=24;h++){
    const ms=h===24?[0]:[0,15,30,45];
    for(const m of ms) o.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  }
  // 翌0:15〜翌3:00（25:00〜27:00形式、15分刻み）
  for(let h=25;h<=27;h++){
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
function calcNetWorkMinutes(shift,breaks,overtimeMins=0){
  if(!shift||shift.status!=="work")return 0;
  const st=shift.adjustedStart??shift.start;
  let en=shift.adjustedEnd??shift.end;
  if(!st||!en)return 0;
  if(overtimeMins>0){const[h,m]=en.split(":").map(Number);const tot=h*60+m+overtimeMins;en=`${Math.floor(tot/60)}:${String(tot%60).padStart(2,"0")}`;}
  const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
  const ws=toMin(st),we=toMin(en);
  if(we<=ws)return 0;
  let net=we-ws;
  (breaks||[]).forEach(br=>{const bs=toMin(br.start),be=toMin(br.end);if(ws>=bs)return;const ol=Math.min(we,be)-Math.max(ws,bs);if(ol>0)net-=ol;});
  return Math.max(0,net);
}
function getBreakList(settings,dateStr){
  const dow=pd(dateStr).getDay();const hol=isHoliday(dateStr);const bt=(settings&&settings.breakTimes)||{};
  if(hol)return bt.hol||[];if(dow===0)return bt.sun||[];if(dow===6)return bt.sat||[];return bt.weekday||[];
}
// 17:00(1020分)を境界にランチ帯/ディナー帯を判定し出勤数を返す
function shiftBandInfo(shift){
  if(!shift||shift.status!=="work")return{startMin:0,endMin:0,hasLunch:false,hasDinner:false,attendance:0};
  const st=shift.adjustedStart??shift.start;const en=shift.adjustedEnd??shift.end;
  if(!st||!en)return{startMin:0,endMin:0,hasLunch:false,hasDinner:false,attendance:0};
  const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
  const startMin=toMin(st),endMin=toMin(en);
  if(endMin<=startMin)return{startMin,endMin,hasLunch:false,hasDinner:false,attendance:0};
  const hasLunch=startMin<1020,hasDinner=endMin>1020;
  const attendance=((hasLunch&&hasDinner)||(endMin-startMin)>=540)?1:0.5;
  return{startMin,endMin,hasLunch,hasDinner,attendance};
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
const DAY_TYPES=[["weekday","平日"],["sat","土曜"],["sun","日曜"],["hol","祝日"]];
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
// シフト作成タブ「必要ポジション設定」の曜日区分タブ（祝日をholSat/holSunに分割した5分類。DAY_TYPESとは別物＝breakTimes等には影響しない）
const POSITION_DAY_TYPES=[["weekday","平日"],["sat","土曜"],["sun","日曜"],["holSat","祝日（連休中・単日）"],["holSun","祝日（最終日）"]];
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
  {key:"h",kind:"suffix",usage:"9h",label:"ホール出張",desc:"キッチン所属のスタッフをこの日だけホールの人数として集計する",color:"#FFF3B0"},
  {key:"k",kind:"suffix",usage:"9k",label:"キッチン入り",desc:"ホール所属のスタッフをこの日だけキッチンの人数として集計する",color:"#FFF3B0"},
  {key:"x",kind:"suffix",usage:"9x",label:"ヘルプ（カウント外）",desc:"時間帯別出勤人数に数えない。時間なしの文字だけの入力も同じ扱い",color:"#FFF3B0"},
  {key:"y",kind:"rest",usage:"y",label:"休み希望",desc:"セルを休み扱いにして斜線を表示する（出勤セル=ランチ帯・退勤セル=ディナー帯・両方=終日）。もう一度 y で解除、時間を入力すると出勤に上書き。「休」でも入力できる",hatch:true},
];
// セル背景色・記号の意味（cellBgForとレジェンドの共通ソース）
const CELL_COLOR_LEGEND=[
  {key:"changed",color:"rgba(52,199,89,.30)",label:"変更マーク",desc:"セルをトリプルクリック（スマホはトリプルタップ）でオン/オフ。確定後に変更したシフトの目印"},
  {key:"dup",color:"rgba(255,71,87,.35)",label:"店舗間シフト重複",desc:"企業連携している他店舗のシフトと勤務時間が重なっている"},
  {key:"note",color:"#FFF3B0",label:"特記あり",desc:"h・k・x・他店舗略称などのサフィックスが付いたセル"},
  {key:"rest",hatch:true,label:"休み希望（斜線）",desc:"スタッフが提出した休み希望、または管理者が y で入力した休み"},
  {key:"posErr",color:"rgba(239,68,68,0.18)",label:"ポジション不足",desc:"必要ポジション設定に対して出勤人数・ポジションが不足しているランチ/ディナーの行"},
];
// 休み希望コマンド判定（セル全体が y / 休 のとき。時間付きの「9y」は通常サフィックス扱い）
const isRestCommand=raw=>/^(y|ｙ|休)$/i.test(String(raw==null?"":raw).trim());
// サフィックス抽出: 登録済みコマンド(kind:"suffix")は小文字に正規化、任意文字列=そのまま保持、""=通常。
// rest=true は休み希望コマンド（numeric/noteは空）。旧実装はShiftEditTab内ローカル関数（2026-07-09にレジストリ駆動化して移設）
function extractNote(raw){
  if(raw==null||!String(raw).trim())return{numeric:"",note:"",rest:false};
  const s=String(raw).trim();
  if(isRestCommand(s))return{numeric:"",note:"",rest:true};
  const m=s.match(/^([\d.:]+)(.*)$/s);
  if(!m||!m[1])return{numeric:"",note:"x",rest:false}; // 数値部なし(文字のみ) → ヘルプ
  const suf=m[2].trim();
  if(!suf)return{numeric:m[1],note:"",rest:false};
  const l=suf.toLowerCase();
  if(CELL_COMMANDS.some(c=>c.kind==="suffix"&&c.key===l))return{numeric:m[1],note:l,rest:false};
  return{numeric:m[1],note:suf,rest:false}; // 日本語含む任意サフィックスはそのまま保持
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

// ===== Nodeテスト用エクスポート（ブラウザでは module 未定義のため無視される）=====
if(typeof module!=="undefined"&&module.exports){
  module.exports={fd,pd,gd,idp,sc,isHoliday,isWeekendOrHoliday,calcNetWorkMinutes,getBreakList,shiftBandInfo,getBreaksFor,getOT,fmtMin,genToken,genSecureId,isSpacer,resolveAlias,buildSuggestList,getAttrOptions,TO,TO_START,JH_DATES,CELL_COMMANDS,CELL_COLOR_LEGEND,isRestCommand,extractNote,SUBS_WINDOW_MONTHS,subsWindowCutoff,recentPeriodIds,diffSubForFlatWrite,applyFlatSubWrite,dayTypeOf,matchPositionSlots,POSITION_DAY_TYPES};
}
