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
// 休憩は1出勤（ランチ・ディナー両帯 or 9時間以上）のスタッフにのみ適用
function isBreakEligible(shift){return shiftBandInfo(shift).attendance===1;}
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
// 休憩適用の統一入口: 適用可否判定 + 属性タグフィルタ + 出勤開始時刻フィルタ
function getBreaksFor(settings,dateStr,staffName,shift){
  if(!isBreakEligible(shift))return[];
  const list=getBreakList(settings,dateStr);
  const attr=((settings&&settings.staffAttributes)||{})[staffName]||"parttime";
  const stStr=shift&&(shift.adjustedStart??shift.start);
  const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
  const ws=stStr?toMin(stStr):null;
  return list.filter(br=>{
    const tags=br&&br.tags;if(tags&&tags.length&&!tags.includes(attr))return false;
    if(ws!==null&&br&&br.start&&ws>=toMin(br.start))return false;
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

// ===== Nodeテスト用エクスポート（ブラウザでは module 未定義のため無視される）=====
if(typeof module!=="undefined"&&module.exports){
  module.exports={fd,pd,gd,idp,sc,isHoliday,isWeekendOrHoliday,calcNetWorkMinutes,getBreakList,shiftBandInfo,isBreakEligible,getBreaksFor,getOT,fmtMin,genToken,genSecureId,isSpacer,resolveAlias,buildSuggestList,getAttrOptions,TO,TO_START,JH_DATES};
}
