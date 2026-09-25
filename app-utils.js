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
// **振替休日を落とさないこと**: 祝日が日曜に当たると、その後の最初の「国民の祝日でない日」が
// 振替休日になる（＝直後が祝日なら連休の先へ押し出される）。GW最終日がこの形になりやすく、
// 落とすと飲食店の最繁忙日が平日扱いになって休憩時間・必要ポジション・候補時間の区分が全部ずれる。
// tests/core.test.js の「祝日テーブルが計算した日本の祝日と一致する」が全欄を機械照合するので、
// 年を足すときはそのテストを通してから入れる（2025-02-24・2025-05-06・2026-05-06 の3件が実際に落ちていた）。
const JH_DATES=new Set([
  // 2025
  "20250101","20250113","20250211","20250223","20250224","20250320","20250429","20250503","20250504","20250505","20250506",
  "20250721","20250811","20250915","20250923","20251013","20251103","20251123","20251124",
  // 2026
  "20260101","20260112","20260211","20260223","20260320","20260429","20260503","20260504","20260505","20260506",
  "20260720","20260811","20260921","20260922","20260923","20261012","20261103","20261123",
  // 2027
  "20270101","20270111","20270211","20270223","20270321","20270322","20270429","20270503","20270504","20270505",
  "20270719","20270811","20270920","20270923","20271011","20271103","20271123",
  // 2028
  "20280101","20280110","20280211","20280223","20280320","20280429","20280503","20280504","20280505",
  "20280717","20280811","20280918","20280922","20281009","20281103","20281123",
  // 2029（計算値で先に入れた分。春分・秋分は前年2月の暦要項で正式告示されるが、
  //        近似式が 2025〜2028 の実データと全欄一致することを確認済み。告示後にずれていたらここを直す）
  "20290101","20290108","20290211","20290212","20290223","20290320","20290429","20290430","20290503","20290504","20290505",
  "20290716","20290811","20290917","20290923","20290924","20291008","20291103","20291123",
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
// プランの序列。free < pro < premium。アップグレードとダウングレードを判別するために使う。
// Cloud Functions 側の PLAN_RANK（functions/index.js）と同じ値を保つこと。
const PLAN_RANK_UI = { free: 0, pro: 1, premium: 2 };
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
// シフトの実効出退勤時刻。管理者がシフト作成タブのセルに休み希望（y／休）を入力すると
// applyEditToSubs は adminRest[field] を立てるだけでスタッフ提出の start/end/status には触れない
// （提出値を壊さないため）。そのため実効値の抑制は読み出し側の責務で、画面表示は app-admin.js の
// getStoredTime が同じ規則で空文字を返している。ここを通さずに adjustedStart??start を直接読むと
// 「セルは休みで表示され、休みカウント・ヒートマップも休み扱いなのに、勤務時間と出勤日数の集計だけが
// 提出値のまま計上される」というズレになる（バグチェック#50）。
// 戻り値の "" は呼び出し側の st&&en 判定で「値なし」として扱われる。
// なお getBreaksFor / getOT は同じ生の値を読んでいるが、主シフトが抑制されると
// calcNetWorkMinutes 側の st&&en が false になり休憩控除も延長加算も適用されないため影響しない。
function effShiftStart(shift){
  if(!shift)return undefined;
  if(shift.adminRest&&shift.adminRest.start)return"";
  return shift.adjustedStart??shift.start;
}
function effShiftEnd(shift){
  if(!shift)return undefined;
  if(shift.adminRest&&shift.adminRest.end)return"";
  return shift.adjustedEnd??shift.end;
}
// extraStart/extraEnd（「締」等の店舗限定固定シフトコマンドによる追加出勤期間）がある場合は主シフトとは別に加算する。
// 追加期間は休憩控除・残業延長の対象外（主シフトの休憩帯と重ならない深夜帯を想定した単純加算）。
// ===== 期間の日付検証 =====
// 作成・編集の両方から呼ぶ。error があれば保存させない（純粋な入力ミス）、
// warning は「重なっているが運用上そうしたい」場合があるので確認だけ取って通す（バグチェック#83・#92）。
function validatePeriodDates(cand,others){
  const st=(cand&&cand.startDate)||"",en=(cand&&cand.endDate)||"";
  if(!st||!en)return{error:"開始日と終了日を入力してください"};
  if(en<st)return{error:"終了日が開始日より前になっています"};
  const hit=(others||[]).filter(o=>o&&o.id!==(cand&&cand.id)&&o.startDate&&o.endDate&&o.startDate<=en&&st<=o.endDate);
  if(hit.length>0){
    const names=hit.map(o=>o.label||`${o.startDate}〜${o.endDate}`).join("、");
    return{warning:`「${names}」と日付が重なっています`};
  }
  return{};
}
// ===== 片側セルのみ入力された日の時間補完 =====
// 出勤だけ／退勤だけが入っている日を、ヒートマップ（ShiftEditTab）と同じ規則で補完する。
// 以前は勤務時間・期間集計・週/月上限判定だけが「0分」として扱っており、ヒートマップは出勤者に数え
// 休みカウントは0.5休みにする、という食い違いがあった（上限超過の見落としにつながる。バグチェック#82）。
// 境界は候補時間から算出する: ランチ終わり=17:00以前に終わる候補の最も遅い退勤、
// ディナー始まり=17:00以降に始まる候補の最も早い出勤。候補が無ければ 15:00 / 17:00。
const _fillBoundsCache=typeof WeakMap!=="undefined"?new WeakMap():null;
function oneSidedFillBounds(settings){
  if(!settings)return{lunchEnd:900,dinnerStart:HEAT_BAND_SPLIT_MIN};
  if(_fillBoundsCache&&_fillBoundsCache.has(settings))return _fillBoundsCache.get(settings);
  const toMin=t=>{if(!t||typeof t!=="string")return null;const[h,m]=t.split(":").map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null;};
  const all=[...(settings.candidates||[]),...Object.values(settings.weekdayCandidates||{}).flat(),...Object.values(settings.dateCandidates||{}).flat()]
    .filter(c=>c&&!c.closed&&c.start&&c.end);
  const lunchEnds=all.map(c=>toMin(c.end)).filter(m=>m!==null&&m<=HEAT_BAND_SPLIT_MIN);
  const dinnerStarts=all.map(c=>toMin(c.start)).filter(m=>m!==null&&m>=HEAT_BAND_SPLIT_MIN);
  const r={lunchEnd:lunchEnds.length?Math.max(...lunchEnds):900,dinnerStart:dinnerStarts.length?Math.min(...dinnerStarts):HEAT_BAND_SPLIT_MIN};
  if(_fillBoundsCache)_fillBoundsCache.set(settings,r);
  return r;
}
// 主シフトの実効レンジ（分）。片側しか無い日は settings を渡すと補完する。
// settings を渡さない＝補完しない（従来どおり「時間が確定しない日」として扱う）。
function effShiftRangeMin(shift,settings){
  const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
  const st=effShiftStart(shift),en=effShiftEnd(shift);
  let s=st?toMin(st):null,e=en?toMin(en):null;
  if(s===null&&e===null)return null;
  if(settings&&(s===null||e===null)){
    const b=oneSidedFillBounds(settings);
    if(e===null)e=b.lunchEnd;
    if(s===null)s=b.dinnerStart;
  }
  if(s===null||e===null)return null;
  return e>s?{startMin:s,endMin:e}:null;
}
function calcNetWorkMinutes(shift,breaks,overtimeMins=0,settings=null){
  if(!shift||shift.status!=="work")return 0;
  const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
  let net=0;
  // settings を渡すと、出勤だけ／退勤だけの日も補完して数える（渡さなければ従来どおり0分）
  const rng=effShiftRangeMin(shift,settings);
  if(rng){
    const ws=rng.startMin;
    const we=rng.endMin+(overtimeMins>0?overtimeMins:0);
    if(we>ws){
      let seg=we-ws;
      // 休憩は「重なった分だけ」引く。適用するかどうかの判定は getBreaksFor 側（重なりが正なら適用）。
      (breaks||[]).forEach(br=>{const bs=toMin(br.start),be=toMin(br.end);const ol=Math.min(we,be)-Math.max(ws,bs);if(ol>0)seg-=ol;});
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
function shiftBandInfo(shift,settings=null){
  if(!shift||shift.status!=="work")return{startMin:0,endMin:0,hasLunch:false,hasDinner:false,attendance:0};
  const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
  let startMin=0,endMin=0,hasLunch=false,hasDinner=false,totalMin=0,any=false;
  // settings を渡すと片側セルのみの日も補完する（渡さなければ従来どおり主シフトは無いものとして扱う）
  const rng=effShiftRangeMin(shift,settings);
  if(rng){
    const s0=rng.startMin,e0=rng.endMin;
    startMin=s0;endMin=e0;hasLunch=s0<1020;hasDinner=e0>1020;totalMin+=e0-s0;any=true;
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
// ===== スタッフ再提出時に引き継ぐ管理者フィールド =====
// 管理者がシフト作成タブ・提出一覧で日ごとに書き込む、スタッフ提出値(status/start/end)とは
// 独立したフィールドの一覧。スタッフが再提出すると app-staff.js の buildShift が日オブジェクトを
// 作り直すため、ここに載っていないフィールドは黙って消える（バグチェック#51）。
// 新しい管理者フィールドを追加したら必ずここに登録すること。
const ADMIN_SHIFT_FIELDS=["adjustedStart","adjustedEnd","adjustedStartNote","adjustedEndNote",
  "adminRest","extraStart","extraEnd","adjustedStartFixed","adjustedEndFixed","origStatus",
  "adjustedBreak","leaveType"];
// 新しい日オブジェクト(newShift)に、既存提出(oldShift)の管理者フィールドを引き継ぐ。
// newShift側に既に値があるフィールドは上書きしない（スタッフの新しい入力を優先する）。
// 追加出勤フラグ(adjustedStartFixed/adjustedEndFixed)を引き継いだ日は status="work" に戻す。
// applyEditToSubs（app-admin.js）が「締」適用時に置いているのと同じ不変条件で、戻さないと
// extraStart/extraEndだけが残り calcNetWorkMinutes/shiftBandInfo の status!=="work" 早期returnで
// 追加出勤が0分に落ちる。newShift は破壊せず新しいオブジェクトを返す。
// スタッフが「休み」で出し直した日は、時刻を持つ管理者フィールドを引き継がない（バグチェック#52 の判断・2026-08-25 決定）。
// 以前は adjustedStart/adjustedEnd を引き継いだうえで status は holiday のままだったため、
// 「休みなのに調整時刻が入っている」日が残り、画面によって出勤扱い・休み扱いが割れる元になっていた。
// 落とすのは管理者が入れた出退勤の調整値だけ。メモ（adjustedXxxNote）と休み希望マーク（adminRest）は
// 休みの日でも意味が成立するので残し、「締」の追加出勤（extraStart/extraEnd と adjustedXxxFixed）も残す
// ——こちらは 2026-07-12 に決めた「店舗が固定で入れる深夜の追加出勤」で、スタッフの休み希望とは別軸の
// 出勤（フラグがある日は status="work" に戻す）という明示的な不変条件を持つため。
const HOLIDAY_DROP_SHIFT_FIELDS=["adjustedStart","adjustedEnd"];
function carryAdminShiftFields(newShift,oldShift){
  const nw={...(newShift||{})};
  if(!oldShift)return nw;
  const toHoliday=nw.status==="holiday";
  ADMIN_SHIFT_FIELDS.forEach(k=>{
    if(toHoliday&&HOLIDAY_DROP_SHIFT_FIELDS.includes(k))return;
    if(oldShift[k]!=null&&nw[k]==null)nw[k]=oldShift[k];
  });
  if(nw.adjustedStartFixed||nw.adjustedEndFixed){
    if(nw.status!=="work"&&nw.origStatus===undefined)nw.origStatus=nw.status;
    nw.status="work";
  }
  return nw;
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
  // 組み込みの dispatch/other は名前が無くても既定名で補う。2026-06-16〜06-28 の makeSettings は
  // name を持たない {daily,weekly} で保存しており、スタッフタブの属性選択・設定タブの制限一覧は
  // STAFF_TYPE_LABELS で「派遣」「その他」を出すのに、ここだけ落として休憩タグに選べなかった（バグチェック#121）。
  Object.keys(stl).forEach(id=>{
    if(id==="employee"||id==="parttime")return;
    const t=stl[id];
    const nm=t&&typeof t==="object"?(t.name||(BUILTIN_TYPES.includes(id)?STAFF_TYPE_LABELS[id]:"")):"";
    if(nm)out.push([id,nm]);
  });
  return out;
}
// 休憩適用の統一入口: 属性タグフィルタ + 実際のシフト時間帯との重なり判定
// 属性一致のタグ付き休憩がその日区分にある場合はタグなし休憩を適用しない（差し替え方式）
// 休憩の適用可否は出勤日数(attendance=1出勤等)のような汎用閾値では判定しない（2026-07-10改修）。
// その代わり「勤務が休憩を丸ごと含むか」（出勤が休憩開始より前 かつ 退勤が休憩終了より後）だけを見る。
// 境界に一致する日（退勤=休憩終了のランチのみ／出勤=休憩開始のディナーのみ）も、
// 休憩の内側に出勤・退勤が入る日も適用しない（2026-08-31 決定3）。
function getBreaksFor(settings,dateStr,staffName,shift){
  if(!shift||shift.status!=="work")return[];
  // ① 日別の上書き（adjustedBreak・分）は方式によらず最優先（第3弾・項目8）。
  //    時間帯が分からないので「勤務の先頭に置いた合成の休憩帯」で控除量だけを表す。
  {
    const adj=Number(shift.adjustedBreak);
    if(Number.isFinite(adj)&&adj>=0){
      const r=effShiftRangeMin(shift,settings);
      return(r&&adj>0)?[_syntheticBreak(r.startMin,adj)]:[];
    }
  }
  // ② 長さ方式: 拘束の長さだけで控除を決める（S-3）。片側セルは時間帯方式と同じく非適用。
  if(breakModeOf(settings)==="length"){
    if(!effShiftStart(shift)||!effShiftEnd(shift))return[];
    const r=effShiftRangeMin(shift,settings);
    if(!r)return[];
    const bind=shiftBindingMin(shift,settings,staffName);
    const L=breakLengthOf(settings);
    // **しきい値は実働（拘束 − 控除）で判定する。** 労基法34条の「労働時間」は実働であり、
    // S-3 の表のケース3（12:30〜21:00＝拘束8.5h → 控除0.75h・実働7.75h）はこの規則でしか
    // 再現できない。S-3 の本文は「拘束>8h→1.0h」と書いているが**同じ節の表と食い違う**ので、
    // 表を採った（S-3 自身が「6h／8h のしきい値判定に使うのは実働（Excelと同じ）」とも書いている）。
    // 引ける中でいちばん長い段を選ぶ＝引いた後の実働がその段のしきい値を超えている段。
    const len=(bind-L.over8Min>LEGAL_DAILY_MIN)?L.over8Min
      :((bind-L.over6Min>BREAK_SHORT_TARGET_MIN)?L.over6Min:0);
    return len>0?[_syntheticBreak(r.startMin,len)]:[];
  }
  // ③ 時間帯方式（既定・従来どおり）
  const list=getBreakList(settings,dateStr);
  const attr=((settings&&settings.staffAttributes)||{})[staffName]||"parttime";
  const hasTagged=list.some(br=>br&&br.tags&&br.tags.length&&br.tags.includes(attr));
  const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
  // 片側セル（出勤だけ・退勤だけ入力された日）には休憩を一切適用しない（2026-08-31 決定3）。
  // 半日勤務が大半で、補完した境界まで働いた前提で休憩を引くと実運用と合わないため。
  // ＃82（2026-08-25 案A）で入れた「補完して数える」は勤務時間・出勤日数の側だけに残り、
  // 休憩はここで落ちる。退勤延長は片側セルの日でも反映する（calcNetWorkMinutes の
  // overtimeMins・ヒートマップの app-admin.js getHeatShift はこの関数を経由しない）。
  if(!effShiftStart(shift)||!effShiftEnd(shift))return[];
  const rng=effShiftRangeMin(shift,settings);
  return list.filter(br=>{
    const tags=br&&br.tags;
    if(tags&&tags.length){if(!tags.includes(attr))return false;}
    else if(hasTagged)return false;
    if(!br||!br.start||!br.end)return false;
    if(!rng)return false;
    const bs=toMin(br.start),be=toMin(br.end),ws=rng.startMin,we=rng.endMin;
    // 勤務が休憩を完全に含む日にだけ適用する（2026-08-31 決定3）。
    // 2026-08-25 の案C（#89・「休憩の内側から出勤して休憩をまたぐ日にも適用する」）は撤回した。
    // 撤回により 12:30〜20:00（休憩12:00〜13:00）の純勤務は 7:00 → 7:30 に戻る。
    // 控除量は calcNetWorkMinutes が重なった分だけ引くが、ここを通った日は必ず全部が重なる。
    if(ws>=bs)return false;   // 出勤が休憩開始以降（同時刻・休憩の内側を含む）
    if(we<=be)return false;   // 退勤が休憩終了以前（同時刻・休憩の内側を含む）
    return true;
  });
}
// 退勤延長: shiftの実効終了時刻で ランチ(≤17:00)/ディナー(>17:00) を判定して延長分を返す。
// 判定には calcNetWorkMinutes / shiftBandInfo と同じ effShiftRangeMin の実効レンジを使う
// （settings を渡した呼び出しでは片側セルの補完後の退勤で判定される）。生の end を見ていた頃は、
// 出勤セルだけ入力された日＝実効退勤が無い日が一律ディナー扱いになり、同じ日を
// 「補完してランチ帯として」数える calcNetWorkMinutes に、ディナー側の延長が足されていた。
function getOT(staffName,settings,shift){
  const raw=(settings?.overtimeSettings?.byStaff||{})[staffName];
  if(raw==null)return 0;
  if(typeof raw==="number")return raw; // レガシー数値
  const lunch=raw.lunch||0,dinner=raw.dinner||0;
  if(!shift)return dinner;
  const rng=effShiftRangeMin(shift,settings);
  if(rng)return rng.endMin<=1020?lunch:dinner;
  // 補完できない日（settings なしの呼び出し・時刻がどちらも無い日）は従来どおり生の値で判定する
  const en=shift.adjustedEnd??shift.end;
  if(!en)return dinner;
  const[h,m]=en.split(":").map(Number);
  return(h*60+m)<=1020?lunch:dinner;
}
function fmtMin(min){if(!min&&min!==0)return"";const h=Math.floor(min/60),m=min%60;return`${h}:${String(m).padStart(2,"0")}`;}
// ===== 労務判定（2026-09-26・第1弾）=====
// 職場のシフトExcelひな型（1か月単位の変形労働時間制＋36協定）が持つ判定の移植。
// 期待値の正本は実装計画書『労務判定_実装計画.html』の確定仕様 S-1〜S-7 で、
// **この節の実装の出力からテストの期待値を逆生成してはいけない**。

// 労基法32条の法定基準。B制（通常の労働時間制）の日次・週次判定に使う。
const LEGAL_DAILY_HOURS=8;
const LEGAL_WEEKLY_HOURS=40;
const LEGAL_DAILY_MIN=LEGAL_DAILY_HOURS*60;    // 480
const LEGAL_WEEKLY_MIN=LEGAL_WEEKLY_HOURS*60;  // 2400
// A制の日次判定のしきい値（S-4）
const LABOR_LONG_DAY_MIN=12*60; // これを「超える」日が 12h超
const LABOR_SHORT_DAY_MIN=4*60; // 0より大きくこれ「未満」の日が 4h未満

// 労働時間制。Excelの「区分」列（A／B／応援・外部）に対応する。
// スタッフ単位ではなく**属性単位**で持つ（判断1・案a）。割当UI・期間指定(keepAttrs)・
// 改名/削除の後始末がすべて属性の仕組みに乗っているため、別軸を作ると同じ配線が2系統になる。
const LABOR_SYSTEMS=["A","B","none"];
const LABOR_SYSTEM_LABELS={A:"1か月単位の変形労働時間制",B:"通常の労働時間制",none:"判定対象外"};
// 組み込み属性の既定。dispatch/other は Excel の「応援・外部」に対応し、労働時間の判定・集計から外す。
// 属性が未割当のスタッフは既存フォールバックで parttime に倒れる＝B制（安全側）になる。
const DEFAULT_LABOR_SYSTEM_BY_ATTR={employee:"A",parttime:"B",dispatch:"none",other:"none"};

// 属性IDの労働時間制。**null は「区分が空欄か誤り」**（S-4の注記）＝
// staffTypeLimits に無い属性、または custom 属性で laborSystem が未設定のとき。
// 組み込みIDは DEFAULT_LABOR_SYSTEM_BY_ATTR が必ず答えるので null にならない
// （既存店舗の employee/parttime が一斉に「区分が空欄」になるのを防ぐ）。
function laborSystemOf(settings,attrId){
  const id=attrId||"parttime";
  const stl=(settings&&settings.staffTypeLimits)||{};
  const t=stl[id];
  const raw=t&&typeof t==="object"?t.laborSystem:undefined;
  if(LABOR_SYSTEMS.indexOf(raw)>=0)return raw;
  if(BUILTIN_TYPES.indexOf(id)>=0)return DEFAULT_LABOR_SYSTEM_BY_ATTR[id]||null;
  return null;
}
function laborSystemForStaff(settings,name){
  return laborSystemOf(settings,((settings&&settings.staffAttributes)||{})[name]);
}

// 労務設定の既定値。**makeSettings は変更せず読み手側のフォールバックで持つ**
// （既存の staffTypeLimits 等と同じ形。設定を持たない店舗は既定値で動く）。
// 既定の monthlyBase31Min=10628分(177:08) は週40時間の法定どおりの値。
const DEFAULT_LABOR_SETTINGS={
  monthlyBase31Min:10628, // 31日の月の総枠（分）＝この1つから他の月を逆算する
  fixedOvertimeMin:1800,  // 固定残業（分・30h）
  marginMin:420,          // 余裕（分・7h）
  agreementDailyOtMin:180,    // 36協定 1日の延長上限（分・3h）※判定は第2弾。目安の算出には第1弾から効く
  agreementMonthlyOtMin:2700, // 36協定 1か月の延長上限（分・45h）
  fiscalYearStartMonth:4      // 年度の開始月（1なら暦年）。有給残数と年間累計の区切りに使う
};
function laborSettingsOf(settings){
  const raw=(settings&&settings.laborSettings)||null;
  const out={...DEFAULT_LABOR_SETTINGS};
  if(raw&&typeof raw==="object"){
    Object.keys(DEFAULT_LABOR_SETTINGS).forEach(k=>{
      const v=Number(raw[k]);
      if(Number.isFinite(v)&&v>=0)out[k]=Math.round(v);
    });
  }
  return out;
}

// 31日の月の総枠（分）から週の法定労働時間（分）を逆算し、30分単位に丸める（判断2）。
// 丸めずに比例配分すると Excel と最大2分ずれる（30日が 171:25 ではなく 171:27 になる）。
// 週44時間の特例措置対象事業場は別トグルを作らず、31日の総枠に 194:51 を入れれば W=44h に丸まる。
const LABOR_W_GRID_MIN=30;
function weeklyLegalMinFromBase31(base31Min){
  const v=Number(base31Min);
  if(!Number.isFinite(v)||v<=0)return 0;
  return Math.round(v*7/31/LABOR_W_GRID_MIN)*LABOR_W_GRID_MIN;
}
// 総枠（所定）= FLOOR(W × 暦日数 ÷ 7 × 60, 1) ÷ 60。分で持つので FLOOR(weeklyMin × 暦日数 ÷ 7)。
function monthlyBaseMin(weeklyMin,days){
  const w=Number(weeklyMin),d=Number(days);
  if(!Number.isFinite(w)||!Number.isFinite(d)||w<=0||d<=0)return 0;
  return Math.floor(w*d/7);
}
// 目安 = ROUNDDOWN(総枠 + 固定残業 − 余裕, 0)（**時間単位**での切り捨て）。
// 36協定の1日の延長上限が0＝残業を前提にしない運用では目安＝総枠にする。
function monthlyGuideMin(baseMin,fixedOtMin,marginMin,agreementDailyOtMin){
  const b=Math.max(0,Number(baseMin)||0);
  if(!(Number(agreementDailyOtMin)>0))return b;
  const raw=b+(Number(fixedOtMin)||0)-(Number(marginMin)||0);
  return Math.max(0,Math.floor(raw/60)*60);
}
// 上限 = 総枠 + 固定残業（切り捨てなし）
function monthlyCapMin(baseMin,fixedOtMin){
  return Math.max(0,(Number(baseMin)||0)+(Number(fixedOtMin)||0));
}
// "YYYY-MM" または "YYYY-MM-DD" の暦日数
function daysInMonthOf(ym){
  const m=typeof ym==="string"?/^(\d{4})-(\d{2})/.exec(ym):null;
  if(!m)return 0;
  const mo=Number(m[2]);
  if(mo<1||mo>12)return 0;
  return new Date(Number(m[1]),mo,0).getDate();
}
// その月のA制の枠を一括で出す。ym は "YYYY-MM"（期間の startDate をそのまま渡してもよい）。
function laborMonthFrame(settings,ym){
  const ls=laborSettingsOf(settings);
  const weeklyMin=weeklyLegalMinFromBase31(ls.monthlyBase31Min);
  const days=daysInMonthOf(ym);
  const baseMin=monthlyBaseMin(weeklyMin,days);
  return{days,weeklyMin,baseMin,
    guideMin:monthlyGuideMin(baseMin,ls.fixedOvertimeMin,ls.marginMin,ls.agreementDailyOtMin),
    capMin:monthlyCapMin(baseMin,ls.fixedOvertimeMin)};
}

// B制の週40h超（分）。各日の実働を1日8hで切ってから週で足し、40hを超えた分だけを取る（S-5）。
// 前月・翌月にまたがる週は、呼び出し元が**データのある日だけ**を渡す。
function weeklyOverMinB(dayMins){
  const sum=(dayMins||[]).reduce((a,m)=>a+Math.min(Math.max(0,Number(m)||0),LEGAL_DAILY_MIN),0);
  return Math.max(0,sum-LEGAL_WEEKLY_MIN);
}
function weeklyOverTotalMinB(weeks){
  return(weeks||[]).reduce((a,w)=>a+weeklyOverMinB(w),0);
}

// 退勤が出勤以下の日（項目12・案C）。**両側とも入力されている日だけ**を対象にする——
// 片側セルは oneSidedFillBounds の補完の領分で、入力ミスではない。
// effShiftRangeMin は「退勤≦出勤」と「片側だけ」の両方を null にして区別できないので専用に持つ。
// 深夜シフトは 25:00・26:00 の24時超え表記で入力するのが正（候補時間 gto() も同じ表記）。
const TIME_ORDER_ERROR_HINT="退勤が出勤より前になっています。深夜は 25:00・26:00 のように入力します";
function isTimeOrderInvalid(shift){
  if(!shift||shift.status!=="work")return false;
  const st=effShiftStart(shift),en=effShiftEnd(shift);
  if(!st||!en)return false;
  const toMin=t=>{const p=String(t).split(":").map(Number);return p[0]*60+p[1];};
  const s=toMin(st),e=toMin(en);
  if(!Number.isFinite(s)||!Number.isFinite(e))return false;
  return e<=s;
}

// ===== 労務判定 第2弾（A制の中核・2026-09-26）=====
// Excel の丸め。**JavaScript の Math.round は負の値で挙動が違う**（-0.5→-0）ので直接使わない。
// 二進小数の誤差で境界がずれるのを防ぐため、桁をずらしたあと toPrecision(15) で丸め直してから整数化する
// （1.005*100 が 100.49999… になる類の取りこぼしを消す）。
function _shift(x,d){return Number((Math.abs(Number(x)||0)*Math.pow(10,d)).toPrecision(15));}
function excelRound(x,d=0){const s=(Number(x)||0)<0?-1:1;return s*Math.round(_shift(x,d))/Math.pow(10,d);}
function excelRoundUp(x,d=0){const s=(Number(x)||0)<0?-1:1;return s*Math.ceil(_shift(x,d))/Math.pow(10,d);}
function excelRoundDown(x,d=0){const s=(Number(x)||0)<0?-1:1;return s*Math.floor(_shift(x,d))/Math.pow(10,d);}
const minToH=m=>(Number(m)||0)/60;

// 月の残業予定（時間・小数2桁）= ROUNDUP(MAX(0, 月実働 − 総枠), 2)（S-2）
function monthlyOvertimeH(monthWorkH,baseH){
  return excelRoundUp(Math.max(0,(Number(monthWorkH)||0)-(Number(baseH)||0)),2);
}
// 日別の残業予定（S-2）。**累積の差分**で配る——「実働 × 比率」を毎日丸めると和が月の残業予定とずれる。
// この形なら1銭単位で割れる代わりに、日別の和が月の残業予定と完全に一致する。
// 実働0以下の日・月の残業予定が0・月実働が0 のときは全日0。
function prorateOvertimeH(dayHours,monthOtH,monthWorkH){
  const days=(dayHours||[]).map(h=>Math.max(0,Number(h)||0));
  const ot=Number(monthOtH)||0, tot=Number(monthWorkH)||0;
  if(!(ot>0)||!(tot>0))return days.map(()=>0);
  let cum=0,prevRounded=0;
  return days.map(h=>{
    if(!(h>0))return 0;
    cum+=h;
    const r=excelRound(cum*ot/tot,2);
    const d=excelRound(r-prevRounded,2);
    prevRounded=r;
    return d;
  });
}

// 目安の確認（S-6）。A制のみ・月実働0の人は空欄（key:"none"）。
// 上から順に評価する。丸めは S-6 のとおり（不足・超過は ROUNDUP、残りは ROUNDDOWN）。
const GUIDE_STATUS_COLORS={over:"#e53935",under_base:"#e53935",under_guide:"#B8860B",ok:null,none:null};
function guideStatusOf(monthWorkMin,baseMin,fixedOtMin,guideMin){
  const w=minToH(monthWorkMin),b=minToH(baseMin),f=minToH(fixedOtMin),g=minToH(guideMin);
  if(!(w>0))return{key:"none",label:"",color:null};
  const cap=b+f;
  if(w>excelRound(cap,2))return{key:"over",label:`みなし超 ${excelRoundUp(w-cap,2)}h`,color:GUIDE_STATUS_COLORS.over};
  if(w<excelRound(b,2))return{key:"under_base",label:`所定未満 あと${excelRoundUp(b-w,2)}h`,color:GUIDE_STATUS_COLORS.under_base};
  if(w<g)return{key:"under_guide",label:`目安未満 あと${excelRoundUp(g-w,2)}h`,color:GUIDE_STATUS_COLORS.under_guide};
  return{key:"ok",label:`OK 上限まで${excelRoundDown(cap-w,2)}h`,color:null};
}

// 36協定の絶対上限のうち本機能が判定する1件。**「月の残業予定」だけと比べ、休日労働は足さない**
// （Shifty に法定休日労働を区別するデータが無いため。法定の定義は時間外＋休日労働なので緩い側に倒れる）。
// 判定しない4項目（年720h・複数月平均80h・年6回・年360h）は設定画面のチェックリストに明記する。
const AGREEMENT_SINGLE_MONTH_CAP_H=100;
// 法定の上限一覧。設定画面のチェックリストをこのレジストリから自動生成する（判定の有無を取り違えない）。
const AGREEMENT_LEGAL_ITEMS=[
  {key:"dailyOt",label:"1日の延長時間の上限",judged:true,note:"36協定で定めた時間。日ごとに判定します"},
  {key:"monthlyOt",label:"1か月の延長時間の上限（原則45時間）",judged:true,note:"36協定で定めた時間。月の残業予定と比べます"},
  {key:"singleMonth100",label:"単月100時間未満（特別条項の絶対上限）",judged:true,note:"月の残業予定だけと比べます。法定は時間外＋休日労働ですが、Shiftyは法定休日労働を区別できないため休日労働を足していません（法定より緩い側に倒れます）"},
  {key:"year720",label:"年720時間以内（特別条項）",judged:false},
  {key:"avg80",label:"複数月平均80時間以内（特別条項）",judged:false},
  {key:"over45x6",label:"月45時間超は年6回まで（特別条項）",judged:false},
  {key:"year360",label:"年360時間以内（原則）",judged:false},
];
// スタッフ1人ぶんの労務日次・月次判定（S-4）。文言と発火条件は S-4 の表に一致させる。
// 引数はオプションオブジェクト（第2弾で項目が増えたため位置引数から変えた）。
//   laborSystem      "A"|"B"|"none"|null（null＝区分が空欄か誤り）
//   dayMins          出勤日の実働分の配列（休み・未入力の日は入れない）
//   weekDayMins      週ごとの実働分の配列の配列（B制の週40h超用）
//   timeErrorCount   退勤≦出勤の日数（項目12）
//   breakShortCount  休憩不足の日数（第3弾）
//   monthOtH         月の残業予定（時間・A制のみ）
//   dayOtH           日別の残業予定（時間・A制のみ）
//   agreementDailyOtH / agreementMonthlyOtH / fixedOtH  36協定と固定残業（時間）
//   monthReady       その月の全日にデータが揃っているか。false なら月単位の判定を出さない
// laborSystem==="none"（判定対象外＝Excelの「応援・外部」）は労働時間の判定・集計から外す。
// ただし「時刻の入力ミス」は労務の判定ではなく入力データそのものの誤りなので区分によらず出す
// （項目12・案Cのセル色と同じ集合を指す）。
// 戻り値は {key,label} の配列。**総括判定が key で引く**ので、文言だけを返す形にはしない。
function laborFindingsFor(o){
  const {laborSystem=null,dayMins=[],weekDayMins=[],timeErrorCount=0,breakShortCount=0,
    monthOtH=0,dayOtH=[],agreementDailyOtH=0,agreementMonthlyOtH=0,fixedOtH=0,monthReady=true}=o||{};
  const out=[];
  const push=(key,label)=>out.push({key,label});
  const mins=(dayMins||[]).map(m=>Math.max(0,Number(m)||0));
  const dOt=(dayOtH||[]).map(h=>Math.max(0,Number(h)||0));
  const mOt=Math.max(0,Number(monthOtH)||0);
  if(laborSystem==="A"){
    const over12=mins.filter(m=>m>LABOR_LONG_DAY_MIN).length;
    if(over12>0)push("over12",`12h超${over12}日`);
    const under4=mins.filter(m=>m>0&&m<LABOR_SHORT_DAY_MIN).length;
    if(under4>0)push("under4",`4h未満${under4}日`);
    if(monthReady){
      if(agreementMonthlyOtH>0&&mOt>agreementMonthlyOtH)push("monthOtOverAgreement","月の残業が上限超");
      if(fixedOtH>0&&mOt>fixedOtH)push("monthOtOverFixed",`固定残業${excelRound(fixedOtH,2)}h超`);
      // 単月100h未満（36協定の絶対上限）。S-4 の表には無い行で、文言はここで決めた（判断4）
      if(mOt>=AGREEMENT_SINGLE_MONTH_CAP_H)push("monthOt100",`月の残業が${AGREEMENT_SINGLE_MONTH_CAP_H}h以上`);
    }
    if(agreementDailyOtH>0){
      const n=dOt.filter(h=>h>agreementDailyOtH).length;
      if(n>0)push("dayOtOverAgreement",`1日の残業予定が上限超${n}日`);
    }
  }else if(laborSystem==="B"){
    const over8=mins.filter(m=>m>LEGAL_DAILY_MIN).length;
    if(over8>0)push("over8",`8h超${over8}日(残業)`);
    const weekOver=weeklyOverTotalMinB(weekDayMins);
    if(weekOver>0)push("weekOver40","週40h超(残業)");
    if(agreementDailyOtH>0){
      const lim=LEGAL_DAILY_MIN+agreementDailyOtH*60;
      const n=mins.filter(m=>m>lim).length;
      if(n>0)push("dayOverAgreementB",`1日の残業が上限超${n}日`);
    }else if(weekOver>0){
      push("weekOver40NoAgreement","週40h超(協定なし)");
    }
  }
  // 休憩不足は**労務の判定**なので、判定対象外（応援・外部）は出さない。
  // 次の「時刻の入力ミス」だけは労務ではなく入力データそのものの誤りなので区分によらず出す。
  const bs=Math.max(0,Number(breakShortCount)||0);
  if(bs>0&&laborSystem!=="none")push("breakShort",`休憩不足${bs}日`);
  const te=Math.max(0,Number(timeErrorCount)||0);
  if(te>0)push("timeError",`時刻の入力ミス${te}日`);
  if(laborSystem===null||laborSystem===undefined)push("badSystem","区分が空欄か誤り");
  return out;
}
// 表示用。パネルはこちらを使う（総括判定は key を見るので laborFindingsFor をそのまま使う）。
function laborFindingLabels(o){return laborFindingsFor(o).map(f=>f.label);}

// 総括判定（S-6）。上から順に評価する4値＋Shifty固有の1値。
//   要修正 / 目安未満 / 残業あり / OK  … S-6 の4値
//   要確認 … その月の日にデータが揃っていないとき（Shifty は半月運用で1つの月が2期間に分かれる。
//            後半を作る前は月実働が必ず不足するので、S-6 をそのまま当てると全員が所定未満になる）。
// weekNoRest（週の休みに ×休なし がある）は第3弾で渡すようになるまで常に false。
const OVERALL_FIX_KEYS=["over12","under4","monthOtOverAgreement","dayOtOverAgreement",
  "monthOt100","dayOverAgreementB","weekOver40NoAgreement","breakShort","timeError","badSystem"];
function overallVerdictOf(o){
  const {laborSystem=null,findings=[],guideKey="none",weekNoRest=false,monthReady=true}=o||{};
  if(laborSystem==="none")return{key:"none",label:""};
  const keys=new Set((findings||[]).map(f=>f&&f.key));
  // monthOt100 は S-6 の一覧に無いが、36協定の絶対上限の違反なので要修正に入れる（判断4）。
  const fix=weekNoRest||keys.has("badSystem")||keys.has("timeError")||keys.has("breakShort")
    ||(laborSystem==="A"&&(guideKey==="over"||guideKey==="under_base"
        ||keys.has("over12")||keys.has("under4")||keys.has("monthOtOverAgreement")
        ||keys.has("dayOtOverAgreement")||keys.has("monthOt100")))
    ||(laborSystem==="B"&&(keys.has("dayOverAgreementB")||keys.has("weekOver40NoAgreement")));
  if(fix)return{key:"fix",label:"要修正"};
  if(!monthReady&&laborSystem==="A")return{key:"pending",label:"要確認"};
  if(laborSystem==="A"&&guideKey==="under_guide")return{key:"under_guide",label:"目安未満"};
  if(laborSystem==="B"&&(keys.has("over8")||keys.has("weekOver40")))return{key:"ot",label:"残業あり"};
  return{key:"ok",label:"OK"};
}

// ===== 属性別の勤務時間の上限・下限（下限は 2026-09-26 追加）=====
// 上限と下限は**同じ窓（1日・週・2週間・1ヶ月・任意日数）で対にして持つ**。どちらも 0＝未設定。
// 一覧をここに置くのは、SetTab の入力欄・シフト作成タブの集計表・提出一覧のバッジが
// **同じ窓の組**を3箇所に書き写さないようにするため（書き写すとどれかが取り残される）。
const STAFF_LIMIT_WINDOWS=[
  {key:"daily",   minKey:"dailyMin",   label:"1日",    max:24},
  {key:"weekly",  minKey:"weeklyMin",  label:"週",     max:168},
  {key:"biweekly",minKey:"biweeklyMin",label:"2週間",  max:336},
  {key:"monthly", minKey:"monthlyMin", label:"1ヶ月",  max:744},
];
const STAFF_LIMIT_DEFAULTS=(()=>{
  const o={name:"",customDays:0,customHours:0,customHoursMin:0};
  STAFF_LIMIT_WINDOWS.forEach(w=>{o[w.key]=0;o[w.minKey]=0;});
  return o;
})();
// 属性IDの上限・下限をまとめて引く（未設定は0で埋める）。
function staffLimitOf(settings,attrId){
  const raw=((settings&&settings.staffTypeLimits)||{})[attrId||"parttime"];
  return{...STAFF_LIMIT_DEFAULTS,...(raw&&typeof raw==="object"?raw:{})};
}
// その窓の判定。**勤務が1分も無い窓は下限割れにしない**——休みの日・出勤の無い週を
// 「足りない」と数えると、休んだ人が全員赤くなって上限側の警告まで埋もれる。
// 戻り値は "over" / "under" / null。
function limitStateOf(min,upperHours,lowerHours){
  const m=Number(min)||0;
  if(!(m>0))return null;
  const up=Number(upperHours)||0, lo=Number(lowerHours)||0;
  if(up>0&&m>up*60)return"over";
  if(lo>0&&m<lo*60)return"under";
  return null;
}
// その属性が上限・下限をひとつでも持っているか（判定を走らせるかの入口）。
function hasAnyStaffLimit(lim){
  if(!lim)return false;
  if(lim.customDays&&(lim.customHours||lim.customHoursMin))return true;
  return STAFF_LIMIT_WINDOWS.some(w=>lim[w.key]||lim[w.minKey]);
}

// ===== 労務判定 第3弾（休みと休憩・2026-09-26）=====
// 休憩方式。既定は従来どおり「時間帯方式」で、**設定キーを持たない既存店舗は1分も挙動が変わらない**。
const BREAK_MODES=["band","length"];
const BREAK_MODE_LABELS={band:"時間帯方式（登録した休憩帯と重なった分を引く）",length:"長さ方式（勤務の長さで自動的に決める）"};
const DEFAULT_BREAK_LENGTH={over8Min:60,over6Min:45}; // 拘束>8h→1.0h ／ >6h→0.75h（S-3）
function breakModeOf(settings){const m=settings&&settings.breakMode;return BREAK_MODES.indexOf(m)>=0?m:"band";}
function breakLengthOf(settings){
  const raw=(settings&&settings.breakLength)||null;const out={...DEFAULT_BREAK_LENGTH};
  if(raw&&typeof raw==="object")Object.keys(DEFAULT_BREAK_LENGTH).forEach(k=>{
    const v=Number(raw[k]);if(Number.isFinite(v)&&v>=0)out[k]=Math.round(v);});
  return out;
}
// 拘束時間（分）。**実働と同じ範囲で測る**（S-3 のユーザー決定）——Shifty は Excel に無い
// 「退勤延長」と「締の追加出勤」を実働に足すので、拘束もそれを含める。こうすると
// `拘束 − 実働` がその日に実際に引かれた休憩と一致し、延長が控除より長い日に負にならない。
function shiftBindingMin(shift,settings,staffName){
  if(!shift||shift.status!=="work")return 0;
  const rng=effShiftRangeMin(shift,settings);
  let b=0;
  if(rng){
    const ot=staffName==null?0:getOT(staffName,settings,shift);
    b+=(rng.endMin+(ot>0?ot:0))-rng.startMin;
  }
  if(shift.extraStart&&shift.extraEnd){
    const t=x=>{const p=String(x).split(":").map(Number);return p[0]*60+p[1];};
    const es=t(shift.extraStart),ee=t(shift.extraEnd);
    if(ee>es)b+=ee-es;
  }
  return Math.max(0,b);
}
// 長さ方式・日別上書きの控除を「勤務の先頭に置いた合成の休憩帯」で表す。
// calcNetWorkMinutes は重なりぶんを引くので控除量として等価。**synthetic:true を付ける**ので、
// 帯を時刻として読む側（ヒートマップ）は除外できる——長さ方式では休憩の時間帯が分からないため、
// 勝手な時刻を人数から抜いてはいけない。
function _syntheticBreak(startMin,lenMin){
  const f=m=>`${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`;
  return{start:f(startMin),end:f(startMin+lenMin),synthetic:true};
}
// 休憩不足（S-3）。実働>6h の日だけが対象で、`拘束 − 実働`（＝その日に引かれた休憩）が
// 基準（実働>8h なら 0.999h、それ以外 0.749h）を下回ると不足。方式によらず判定する。
const BREAK_SHORT_TARGET_MIN=6*60;
const BREAK_SHORT_NEED_OVER8_MIN=0.999*60;
const BREAK_SHORT_NEED_MIN=0.749*60;
function isBreakShort(shift,settings,dateStr,staffName){
  if(!shift||shift.status!=="work")return false;
  const ot=staffName==null?0:getOT(staffName,settings,shift);
  const work=calcNetWorkMinutes(shift,getBreaksFor(settings,dateStr,staffName,shift),ot,settings);
  if(!(work>BREAK_SHORT_TARGET_MIN))return false;
  const taken=shiftBindingMin(shift,settings,staffName)-work;
  return taken<(work>LEGAL_DAILY_MIN?BREAK_SHORT_NEED_OVER8_MIN:BREAK_SHORT_NEED_MIN);
}

// 休暇種別（判断6・判断8）。管理者だけが付けられる。
const LEAVE_TYPES=["public","paid","ceremony"];
const LEAVE_TYPE_LABELS={public:"公休",paid:"有給",ceremony:"慶弔"};
const LEAVE_TYPE_LEGEND_KEY={public:"leavePublic",paid:"leavePaid",ceremony:"leaveCeremony"};
// その日の休暇種別。**本機能の導入前に入力済みの終日 y（leaveType なし）は公休として扱う**
// ——データ移行はしない。これをしないと既存店舗で `×休なし` の誤警告が出る。
function leaveTypeOf(shift){
  if(!shift)return null;
  if(LEAVE_TYPES.indexOf(shift.leaveType)>=0)return shift.leaveType;
  const ar=shift.adminRest||{};
  if(ar.start&&ar.end)return"public";        // 終日 y（既存データ）
  if(shift.status==="holiday")return"public"; // スタッフ提出の終日休み
  return null;
}
// 週の休みの判定に使う日の種類（S-5・判断8）。
//  rest   公休（終日 y・提出の休み）と**無記入** → 週の休みに数える
//  work   出勤
//  leave  有給・慶弔 → 休みに数えない（出勤日に取る休暇のため）。ただし「データはある」
//  nodata その日を含む期間が無い／購読の窓の外 → 要確認
function dayRestKindOf(shift,hasData){
  if(hasData===false)return"nodata";
  if(!shift)return"rest";
  const lt=leaveTypeOf(shift);
  if(lt==="paid"||lt==="ceremony")return"leave";
  if(lt==="public")return"rest";
  if(shift.status!=="work")return"rest";
  if(!effShiftStart(shift)&&!effShiftEnd(shift)&&!(shift.extraStart&&shift.extraEnd))return"rest";
  return"work";
}
// 週（7日）の状態（S-5）。**全日が無記入の週は評価対象外**——未提出の期間を「休みだらけ」と
// 数えて判定を空回りさせないため。
function weekRestStateOf(kinds){
  const k=kinds||[];
  if(k.some(x=>x==="nodata"))return{key:"unknown",label:"要確認"};
  if(!k.some(x=>x==="work"||x==="leave"))return{key:"skip",label:"",count:0};
  const n=k.filter(x=>x==="rest").length;
  if(n===0)return{key:"none",label:"×休なし",count:0};
  return{key:"ok",label:`休${n}`,count:n};
}

// ===== 年度の集計（2026-09-26 追加要件）=====
// 「年」の区切りは設定で選べる（laborSettings.fiscalYearStartMonth・既定4月＝年度）。1 なら暦年。
const DEFAULT_FISCAL_YEAR_START_MONTH=4;
function fiscalYearStartMonthOf(settings){
  const v=Number(laborSettingsOf(settings).fiscalYearStartMonth);
  return(Number.isFinite(v)&&v>=1&&v<=12)?Math.round(v):DEFAULT_FISCAL_YEAR_START_MONTH;
}
function fiscalYearOf(dateStr,startMonth){
  const m=/^(\d{4})-(\d{2})/.exec(String(dateStr||""));
  if(!m)return null;
  const st=Math.min(12,Math.max(1,Number(startMonth)||1));
  return Number(m[2])>=st?Number(m[1]):Number(m[1])-1;
}
function fiscalYearLabel(fy,startMonth){
  const st=Math.min(12,Math.max(1,Number(startMonth)||1));
  return st===1?`${fy}年`:`${fy}年度`;
}
// 期間1件ぶんの労務の合計。**シフトが凍結される（＝期間が終わる）時点の値を period に残す**ので、
// 年度の合計を出すのに古い期間の subs を読み直さなくて済む（subs は直近3ヶ月の部分購読）。
// 0 のフィールドは落として持つ（periods は起動時に全件購読するため、サイズがDL量に直結する）。
function compactLaborTotal(t){
  const o={};
  ["workMin","paid","publicOff","ceremony"].forEach(k=>{const v=Math.round(Number(t&&t[k])||0);if(v>0)o[k]=v;});
  return Object.keys(o).length?o:null;
}
function laborTotalsEqual(a,b){
  const ka=Object.keys(a||{}),kb=Object.keys(b||{});
  if(ka.length!==kb.length)return false;
  return ka.every(n=>{
    const x=(a||{})[n]||{},y=(b||{})[n]||{};
    return["workMin","paid","publicOff","ceremony"].every(k=>(Number(x[k])||0)===(Number(y[k])||0));
  });
}
// 年度の合計。period.laborTotals（凍結時点の値）を優先し、無い期間は live(p) で数える。
// live が null を返した期間は missingPeriodIds に積む＝「読めていない期間がある」と画面に出せる。
function yearLaborSummary(periods,name,fy,startMonth,live){
  let workMin=0,paid=0,publicOff=0,ceremony=0;const missing=[];
  (periods||[]).forEach(p=>{
    if(!p||!p.startDate)return;
    if(fiscalYearOf(p.startDate,startMonth)!==fy)return;
    const stored=p.laborTotals&&typeof p.laborTotals==="object"?p.laborTotals[name]:null;
    const l=(stored&&typeof stored==="object")?stored:(live?live(p):null);
    if(!l){missing.push(p.id);return;}
    workMin+=Number(l.workMin)||0;paid+=Number(l.paid)||0;
    publicOff+=Number(l.publicOff)||0;ceremony+=Number(l.ceremony)||0;
  });
  return{workMin,paid,publicOff,ceremony,missingPeriodIds:missing};
}
// 有給の残数。付与日数（settings.paidLeaveGranted[名前]・管理者の自由入力）から、その年度に
// 消化した有給の日数を引く。付与が未入力の人は null（残数を出さない＝0と混同しない）。
function paidLeaveRemaining(settings,name,usedDays){
  const raw=((settings&&settings.paidLeaveGranted)||{})[name];
  const g=Number(raw);
  if(!Number.isFinite(g))return null;
  return excelRound(g-(Number(usedDays)||0),1);
}

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
// 日付に適用する必要ポジション枠。区分の解決は getBreakList と同じ positionDayTypeFor で、
// 旧4区分の "hol" も getBreakList と同じく「祝日区分に枠が無いときだけ」流用する。
// 必要ポジションは 2026-07-10 に入り、翌日の 1cdcd6b で祝日を holSat/holSun に分けたが移行が無く、
// その間に「祝日」で保存された枠は祝日の不足判定から黙って消えていた（バグチェック#120）。
function requiredPositionsFor(settings,dateStr){
  const reqAll=(settings&&settings.requiredPositions)||{};
  const dt=positionDayTypeFor(dateStr,settings);
  const req=reqAll[dt];
  if((dt==="holSat"||dt==="holSun")&&!hasAnyRequiredPosition({[dt]:req})&&reqAll.hol)return reqAll.hol;
  return req||{};
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
// Firebaseのキーに使えない文字（genSecureId が記号から除外しているのと同じ集合）。
// スタッフ名は STAFF_KEYED_SETTING_MAPS の各マップ（+ overtimeSettings.byStaff）で「キー」として
// 使われるため（一覧はそちらが正本。ここに書き写すとマップが増えたとき黙って食い違う）、
// この文字を含む名前を登録すると saveSettings の set() が同期例外を投げる。fbW の
// `fbSet(...).catch(...)` は同期throwを受け取れない（.catchを付ける前に投げられる）ので
// 書き込み失敗のログすら出ず、setSettings/localStorage だけが先に成功して画面上は保存されたように見える。
// 名前が入る唯一の入口（追加・改名）で弾く。
// 半角スペース・ハイフンはFirebaseのキーとして有効なので含めない（「田中 太郎」を弾いてはいけない）。
const FIREBASE_KEY_FORBIDDEN_RE=/[.#$\/[\]\u0000-\u001F\u007F]/g;
function firebaseKeyForbiddenChars(name){
  const found=String(name==null?"":name).match(FIREBASE_KEY_FORBIDDEN_RE);
  if(!found)return[];
  return[...new Set(found.map(c=>(c.charCodeAt(0)<32||c.charCodeAt(0)===127)?"制御文字":c))];
}

// Cookie名に使う文字列から "=" を落とす。
// genSecureId の文字集合はFirebaseのキー禁止文字だけを避けており "=" を含むため、
// shopId の約25%が "=" を持つ。ブラウザは Cookie を最初の "=" で名前と値に分割する
// （RFC 6265 §5.2・Chromium/WebKit で実測）ので、"=" を含む shopId から作った
// ckStaffKey は名前が途中で切られ、同じ店舗の全期間が1つのCookieを奪い合う
// ＝期間が変わるたびにスタッフ名の記憶が消える。
// 置換先が "." なのは、genSecureId の文字集合に "." が無く（Firebaseのキー禁止文字として
// 除外されている）、periodId も `p_<数字>` のため、置換で別のキーと衝突しないから。
// "=" を持たない shopId ではキーが1バイトも変わらない＝既存のCookieを壊さない。
function cookieSafeKey(s){return String(s==null?"":s).replace(/=/g,".");}

// ===== 別名解決・サジェスト =====
// 別名 → 登録名に解決する（staffAliases: {"登録名": ["alias1","alias2"]}）
function resolveAlias(inputName, staffAliases){
  if(!inputName||!staffAliases)return inputName;
  for(const [registered, aliases] of Object.entries(staffAliases)){
    if(Array.isArray(aliases)&&aliases.map(a=>a.trim()).includes(inputName.trim()))return registered;
  }
  return inputName;
}
// その名前を「別名」として登録している他人を返す（居なければ null）。
// resolveAlias は入力名が誰かの別名なら登録名へ寄せるため、他人の別名と同じ名前のスタッフを
// 登録すると、本人が自分の名前を入力しても別人の提出になる（バグチェック#107）。
// addAlias（app-admin.js）は逆向き（登録名と同じ別名）を既に禁じているので、入口を揃えるための判定。
// selfName は改名中の本人（自分の別名は他人の乗っ取りにならないので除く）。
function aliasOwnerOf(name,staffAliases,selfName){
  const nm=String(name||"").trim();
  if(!nm||!staffAliases)return null;
  for(const[registered,aliases]of Object.entries(staffAliases)){
    if(registered===selfName)continue;
    if(Array.isArray(aliases)&&aliases.some(a=>String(a||"").trim()===nm))return registered;
  }
  return null;
}
// 登録名で引き、無ければ別名を登録順に引く（＝完全一致を必ず優先する）。
// lookup は「名前1つを受け取って見つかった物 or falsy を返す」関数で、キーの組み立て方
// （periodId|name か name|date か）は呼び出し側の自由。
// registerAlias は staffAliases に登録するだけで sub.staffName を書き換えないため、同じ人の
// 提出が「登録名のsub」と「別名のsub」に分かれて併存しうる（バグチェック#81）。どちらを採るかを
// ここ1箇所で決め、グリッド・週集計・Excel が同じ答えを返すようにする。
// 配列を走査する find で `登録名一致 || 別名一致` と書くと、採用されるのは配列の先頭に近い方＝
// Firebase のキー順（提出時刻順ではない）に左右され、完全一致優先が効かない（バグチェック#105）。
function resolveSubByAlias(lookup,name,staffAliases){
  const exact=lookup(name);
  if(exact)return exact;
  const aliases=(staffAliases&&staffAliases[name])||[];
  for(const alias of aliases){
    const hit=lookup(alias);
    if(hit)return hit;
  }
  return undefined;
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
  {key:"y",kind:"rest",aliases:["ｙ","休"],usage:"y",label:"休み希望",desc:"セルを休み扱いにして斜線を表示する（出勤セル=ランチ帯・退勤セル=ディナー帯・両方=終日）。もう一度 y で解除、時間を入力すると出勤に上書き。「休」でも入力できる",hatch:true},
  {key:"ya",kind:"rest",leaveType:"paid",usage:"ya",label:"有給（終日）",desc:"その日を終日の有給にする。もう一度 ya で解除。**週の休みには数えず**（有給は出勤日に取る休暇のため、有給の週も別に公休が1日以上要る）、実働にも入らない。管理者のみ入力できる",color:"#DCEBFB"},
  {key:"yc",kind:"rest",leaveType:"ceremony",usage:"yc",label:"慶弔（終日）",desc:"その日を終日の慶弔休暇にする。もう一度 yc で解除。有給と同じく週の休みには数えず、実働にも入らない。管理者のみ入力できる",color:"#FADCE6"},
  {key:"締",kind:"fixed",usage:"16k締",label:"締め（東通り店専用・追加出勤）",desc:"出勤・退勤どちらのセルに単独入力、または数字・h/k/x・他店舗略称など他のコマンドと組み合わせて（前後どちらでも可）入力しても、23:00〜25:00(翌1:00)を主シフトとは別の追加出勤として計上する（例: 出勤13・退勤17締 → 13〜17時と23〜25時の2出勤。出勤16k締 → キッチン入りかつ追加出勤）。鷄えん東通り店でのみ有効",start:"23:00",end:"25:00"},
];
// セル背景色・記号の意味（cellBgForとレジェンドの共通ソース）
const CELL_COLOR_LEGEND=[
  {key:"changed",color:"rgba(52,199,89,.30)",label:"変更マーク",desc:"セルをトリプルクリック（スマホはトリプルタップ）でオン/オフ。確定後に変更したシフトの目印"},
  {key:"dup",color:"rgba(255,71,87,.35)",label:"店舗間シフト重複",desc:"企業連携している他店舗のシフトと勤務時間が重なっている"},
  {key:"note",color:"#FFF3B0",label:"特記あり",desc:"h・k・x・他店舗略称などのサフィックスが付いたセル"},
  {key:"rest",hatch:true,label:"休み希望（斜線）",desc:"スタッフが提出した休み希望、または管理者が y で入力した休み"},
  {key:"posErr",color:"rgba(250,204,21,0.35)",label:"ポジション不足",desc:"必要ポジション設定に対して出勤人数・ポジションが不足しているランチ/ディナーの行"},
  {key:"leavePublic",color:"#E5E7EB",label:"公休（終日）",desc:"出勤・退勤の両方を y にした日。週の休みに数える。何も入力していない日も公休として数える"},
  {key:"leavePaid",color:"#DCEBFB",label:"有給（終日）",desc:"ya で入力した日。週の休みには数えず、実働にも入らない"},
  {key:"leaveCeremony",color:"#FADCE6",label:"慶弔（終日）",desc:"yc で入力した日。有給と同じく週の休みには数えない"},
  {key:"timeErr",color:"rgba(190,24,93,.25)",label:"時刻の入力ミス",desc:"退勤が出勤以前になっている。深夜は 25:00・26:00 のように24時を超える表記で入力する"},
];
// 休みコマンド判定（セル全体が y / 休 / ya / yc のとき。時間付きの「9y」は通常サフィックス扱い）。
// **レジストリ駆動**にしてあるので kind:"rest" を足せば判定・予約語（isReservedShopAbbr）に自動で乗る。
// 長いキーを先に見る（"ya" が "y" に食われないように）。全角の ｙ は y の別名として従来どおり受ける。
function restCommandOf(raw){
  const s=String(raw==null?"":raw).trim().toLowerCase();
  if(!s)return null;
  // 長いキーを先に見る（"ya" が "y" に食われないように）。別名（全角ｙ・休）も同じ扱い。
  const cands=CELL_COMMANDS.filter(c=>c.kind==="rest")
    .flatMap(c=>[c.key,...(c.aliases||[])].map(k=>({k:String(k).toLowerCase(),c})))
    .sort((a,b)=>b.k.length-a.k.length);
  for(const{k,c}of cands){if(s===k)return c;}
  return null;
}
const isRestCommand=raw=>!!restCommandOf(raw);
// 他店舗ヘルプの略称（settings.shopAbbrs）として使えない文字列。**判定は extractNote の
// パース規則と1対1で対応させる**——ここが緩いと、登録はできるのにセルに書いても解決されない
// 略称が作れてしまい、ヘルプ判定も店舗間重複判定も**エラーを出さずに止まる**。
// - kind:"suffix"(h/k/x)・kind:"rest"(y/休) は **完全一致** だけが衝突する
//   （extractNote は suffix を完全一致でしか拾わず、note も abbrToShop の完全一致で引くため）
// - kind:"fixed"(締) は extractNote が **部分一致で取り除く**（`split(key).join("")`）ので、
//   **含むだけで衝突する**。「西締」を許すと、セル「9西締」は note="西"・hasFixed=true に化け、
//   abbrToShop の完全一致lookupが必ず外れる。さらに「西」が別店舗の略称ならその店舗の
//   ヘルプとして解決され、対象店舗（isFixedShiftEligibleShop）では 23:00〜25:00 の
//   追加出勤まで無言で付く（バグチェック#133 で実測）
// - 先頭が数字・記号（. :）だと時刻部 `^([\d.:]+)` に食われる（下の addAbbr のコメント参照）
function isReservedShopAbbr(v){
  const s=typeof v==="string"?v.trim():"";
  if(!s)return true;
  if(/^[\d.:]/.test(s))return true;
  if(isRestCommand(s))return true;
  const l=s.toLowerCase();
  return CELL_COMMANDS.some(c=>c.kind==="fixed"?s.includes(c.key):c.key.toLowerCase()===l);
}
// サフィックス抽出: 登録済みコマンド(kind:"suffix")は小文字に正規化、任意文字列=そのまま保持(数値なしの
// 文字だけの入力もコマンド以外はメモとしてそのまま保持し、x単体のみカウント外扱い)、""=通常。
// rest=true は休み希望コマンド（numeric/noteは空）。旧実装はShiftEditTab内ローカル関数（2026-07-09にレジストリ駆動化して移設）
// hasFixed: 店舗限定固定シフトコマンド(kind:"fixed"。現状「締」)が、他のサフィックス(h/k/x/略称)と
// 併用された場合も含めて含まれているかどうか。noteからは固定コマンドの文字自体を取り除いた「素の」値を返す
// ことで、h/k/x判定・略称lookup(abbrToShop等)がnoteの完全一致に依存する既存ロジックへ影響を与えない。
// 前後どちらの順序で入力しても（例:「16k締」「16締k」）同じ結果になるよう単純な文字列除去で判定する。
function extractNote(raw){
  if(raw==null||!String(raw).trim())return{numeric:"",note:"",rest:false,hasFixed:false,leaveType:null};
  const s=String(raw).trim();
  {const rc=restCommandOf(s);if(rc)return{numeric:"",note:"",rest:true,hasFixed:false,leaveType:rc.leaveType||null};}
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
// 値の同一性判定。参照比較（!==）だと、内容が同じでも作り直されたオブジェクトを
// 「変更あり」と誤判定する。スタッフの再提出は shifts の全日付を毎回 buildShift で
// 作り直すため、参照比較のままだと1日だけ直しても全日付が書き込み対象になり、
// 差分書き込みが実質的に無効化される（＝管理者の編集を巻き込む）。
function deepEqValue(a,b){
  if(a===b)return true;
  if(a===null||b===null||a===undefined||b===undefined)return false;
  if(typeof a!=="object"||typeof b!=="object")return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  const ka=Object.keys(a),kb=Object.keys(b);
  if(ka.length!==kb.length)return false;
  return ka.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&deepEqValue(a[k],b[k]));
}
function diffSubForFlatWrite(id,prevSub,newSub){
  const out={};
  if(!prevSub){out[id]=newSub;return out;}
  const prevShifts=prevSub.shifts||{};
  const shifts=newSub.shifts||{};
  Object.keys(shifts).forEach(date=>{
    if(!deepEqValue(shifts[date],prevShifts[date]))out[`${id}/shifts/${date}`]=shifts[date];
  });
  Object.keys(prevShifts).forEach(date=>{
    if(!(date in shifts))out[`${id}/shifts/${date}`]=null;
  });
  Object.keys(newSub).forEach(key=>{
    if(key==="shifts")return;
    if(!deepEqValue(newSub[key],prevSub[key]))out[`${id}/${key}`]=newSub[key];
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

// ===== periods保存: キー単位・フィールド単位のFirebase書き込み =====
// savePeriods は長らく `shops/{shopId}/periods` を **コレクション全体 set()** で書いていた。
// この形は「保存する端末が期間の全体像を持っている」ことを前提にしているが、その前提は成り立たない——
// startSubscriptions は購読が返るまでの間 periods を **localStorage の前回値**で埋める（app-main.js）。
// キャッシュ以降に別端末が作った期間を知らないまま1回保存すると、その端末にとっては削除ではないので
// tokens も subs も触らないまま、**その期間のレコードだけがサーバーから消える**。
// 2026-09-23 に本番で実害（鷄えん3ビルの「2026年10月前半」。提出40件と tokens は無傷で残り、
// 期間レコードだけが消えた＝削除経路を通っていない証拠）。オフライン中の保存が再接続時に
// 流れる場合も同じ形になる。
//
// 対策は subs（diffSubForFlatWrite）と同じ「変わったところだけを update() する」形にすること。
// 知らないキーには触らないので、**古い state から保存しても他の期間は消えない**＝
// 正しさが state の鮮度に依存しなくなる。
//
// フィールド単位まで割るのは、期間1件の中でも書き手が分かれているため。シフト作成タブは
// 期間を開くたびに snapshot を**自動で**書き（app-admin.js の写し更新）、期間管理タブは label や
// 日付を、スタッフタブは keepStaff / keepAttrs を書く。キー単位（期間まるごと set）のままだと
// 自動で走る写し更新が、他端末が直したばかりの label を黙って巻き戻す。
//
// 新規の期間（prev に無い）は丸ごと1エントリとして返す（`.validate: hasChildren(['id'])` を満たす）。
// 逆に、ローカルにしか無い期間（別端末が削除済み）を編集した場合はフィールド単位のパスだけが
// 送られ id を持たないため、ルールがその update 全体を弾く。revertAdminWrite がサーバーの内容へ
// 描き直すので、消えた期間が中身の無いレコードとして復活することはない。
// フィールドが変わったかの判定。**素朴な deepEqValue では足りない**——Firebaseは空配列・空オブジェクトを
// キーごと落として返すので、書いた値と読み戻した値を素直に比べると毎回「変化あり」になる。
// periodSnapshotEqual が使うのと同じ正規形（_normSnap）で比べ直す。
// snapshot がこれに当たる: buildPeriodSnapshot は breakTimes の空配列・staffAttributes の空オブジェクト等を
// そのまま含むため（既定設定の店舗でも7キーが空）、正規化しないと**保存のたびに写し全体が書き込み対象になる**。
// 無駄な書き込みが増えるだけでなく、ユーザーが触っていない写しを毎回このクライアントの値で上書きするので、
// 古い state（購読が返る前・オフライン中の保存の再送）からの保存が他端末の新しい写しを消しうる＝
// この関数が成立させたはずの「正しさが state の鮮度に依存しない」が写しについてだけ崩れる（#142）。
function _periodFieldEqual(a,b){
  if(deepEqValue(a,b))return true;
  return JSON.stringify(_normSnap(a))===JSON.stringify(_normSnap(b));
}
function diffPeriodsForFlatWrite(prevList,nextList){
  const out={};
  const prevById={},nextById={};
  (prevList||[]).forEach(p=>{ if(p&&p.id) prevById[p.id]=p; });
  (nextList||[]).forEach(p=>{ if(p&&p.id) nextById[p.id]=p; });
  Object.keys(nextById).forEach(id=>{
    const prev=prevById[id],next=nextById[id];
    if(!prev){ out[id]=next; return; }
    // next に無いキーは削除（null）。両側を1周で見るので「next に空で入っている」と
    // 「next からキーごと消えた」が同じ正規形に落ち、どちらも書き込みなしに収束する。
    new Set([...Object.keys(next),...Object.keys(prev)]).forEach(k=>{
      if(_periodFieldEqual(next[k],prev[k]))return;
      out[`${id}/${k}`]=(k in next)?next[k]:null;
    });
  });
  Object.keys(prevById).forEach(id=>{ if(!(id in nextById)) out[id]=null; });
  return out;
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

// 締切日ゲート。「その時刻の変更を変更として扱ってよいか」の唯一の判定で、締切日がある期間は
// 締切日（23:59:59）を過ぎてからの変更だけを通す。締切なし・締切日が不正な日付は常に通す（従来判定）。
// **提出一覧の「変更あり」バッジ（subHasRealUpdate）と、シフト作成タブの日ごとの変更マーク＝緑セル
// （app-staff.js の buildShift）の両方がここを通る**。2026-07-21 にバッジだけゲートを入れた結果、
// 「一覧では変更ありにならないのにシフト表のセルだけ緑になる」という食い違いが残っていた
// （CLAUDE.md #44 申し送りの「変更マークの締切ゲート対象外」。2026-09-20 にユーザー判断でゲート対象へ）。
// at 省略時は現在時刻。ミリ秒・ISO文字列のどちらでも受ける。
//
// ⚠ **2つの surface が同じ規則を通るのは「1度の提出の瞬間」だけで、一致は保証されていない**
// （バグチェック#138 で実測）。バッジは読み取り時に毎回 subHasRealUpdate が現在の deadlineDate で
// 計算し直すのに対し、緑セルは提出した瞬間の判定を shifts[日付].changed に焼いて凍結する。
// そのため次の2つで食い違う。直すには仕様判断が要るので BACKLOG に起票してある。
//   ① 提出後に管理者が締切日を編集すると、バッジだけが新しい締切で再判定される
//      （延長: 一覧は変更なしなのにセルは緑のまま／短縮: 一覧は変更ありなのにセルは緑にならない）。
//   ② スタッフが提出状況一覧のセル編集（app-staff.js の SmModal applyCellEdit）で変えたときは、
//      updatedAt だけ進むのでバッジは出るが、その経路は changed を立てないので緑にならない。
function deadlineGatePassed(deadlineDate,at){
  if(!deadlineDate)return true;          // 締切なし→常に通す
  const dl=new Date(deadlineDate+"T23:59:59").getTime();
  if(Number.isNaN(dl))return true;       // 不正な締切→常に通す
  const t=at==null?Date.now():new Date(at).getTime();
  if(Number.isNaN(t))return true;        // 不正な時刻→常に通す
  return t>dl;
}

// 提出一覧の「変更あり」バッジ判定。締切日がある期間は「締切日（23:59）を過ぎてからの変更」のみ変更ありとする。
// 締切日なし・締切日が不正な日付の場合は従来判定（初回提出より1分以上後の更新があれば変更あり）。
function subHasRealUpdate(sub,deadlineDate){
  if(!sub)return false;
  const last=subLastActionTime(sub);
  const st=new Date(sub.submittedAt||0).getTime();
  const base=Number.isNaN(st)?0:st;
  if(last<=base)return false;            // 変更なし（subLastActionTimeの分単位判定に一本化）
  return deadlineGatePassed(deadlineDate,last); // 締切後の変更のみ変更あり
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

// ===== 期間の確定（終了した期間のマスタ凍結）=====
// シフト作成タブは staffList・属性・ポジション等をすべて「現在値」で参照するため、スタッフを1人削除すると
// 配り終えた過去のシフト表からその人の列が黙って消える（属性・退勤延長を変えれば過去の集計も動く）。
// 終了した期間は、その時点のマスタの写し(period.snapshot)を参照して固定する。
//
// 重要な制約: 写しを撮れるのはアプリが動いている瞬間だけで、「最終日の23:59の状態」を後から復元する
// 手段は無い。そのため期間が生きている間（today <= endDate）はシフト作成タブを開くたびに写しを
// 更新し続け、最終日を超えたら更新を止める＝その時点の内容がそのまま凍結される、という形にする。
// 写しを持たない過去期間（この機能より前に終わった期間）は従来どおり現在値で動かす。今日の値で
// 過去を固定すると「既に削除済みのスタッフが欠けた状態」を正として焼き付けてしまうため。
// 期間の確定（写し）で凍結する settings のキー。
// dateCandidates / dateCandidatePosTypes は**意図的に外している**。この2つは日付をキーに持つため
// 店舗の運用年数ぶんだけ積み上がり、実測で写し1件 57,620 bytes のうち 51,146 bytes（89%）を占めていた。
// periods は起動時に全件購読するので、その重さがアプリを開くたびのDL量に直結する（バグチェック#88）。
// 日付キーの候補は「その日の候補」であって過去の日付ぶんが後から書き換わることは稀なため、
// 凍結対象から外して現在値を参照する。確定済み期間でも日付別候補を編集すれば表示は動く（承知の上）。
const PERIOD_SNAPSHOT_SETTING_KEYS=["staffAttributes","staffTypeLimits","staffPositions","positions",
  "requiredPositions","staffNumbers","overtimeSettings","staffColors","staffAliases","staffWorkplaces",
  "breakTimes","candidates","weekdayCandidates","laborSettings","breakMode","breakLength","paidLeaveGranted"];
// スタッフ名キーの設定マップのうち、**意図的に凍結しない**もの。
// staffHidden は値そのものが期間の範囲（from/to）を持つので、いつの期間かは範囲が決める。
// 写しにも焼くと「範囲」と「凍結された当時の値」という**同じ問いへの答えが2つ**でき、
// #105〜#107 で3回踏んだ「入口が2つあり片方だけが知っている」形をまた作る。
// 凍結対象外のキーは resolvePeriodMaster が現在値のまま残すので、終了した期間でも
// 現在の範囲がその期間の startDate に対して評価される＝過去のシフト表も正しく再現される。
const PERIOD_SNAPSHOT_EXEMPT_STAFF_MAPS=["staffHidden"];
function isPeriodEnded(period,todayStr){return!!(period&&period.endDate&&todayStr&&todayStr>period.endDate);}
function buildPeriodSnapshot(staffList,settings){
  const s={};
  PERIOD_SNAPSHOT_SETTING_KEYS.forEach(k=>{const v=(settings||{})[k];if(v!==undefined&&v!==null)s[k]=v;});
  return{staffList:[...(staffList||[])],settings:s};
}
// Firebaseは空配列・空オブジェクトをキーごと落とし、疎配列をオブジェクトに変換して返す。
// 書いた値と読み戻した値を素朴に比較すると永久に「変化あり」と判定されて書き込みループになるため、
// 空を欠損と同一視し、配列/オブジェクトの表現差を吸収した正規形で比べる。
function _normSnap(v){
  if(v===undefined||v===null)return null;
  if(Array.isArray(v)){const a=v.map(_normSnap);return a.length?a:null;}
  if(typeof v==="object"){
    const o={};Object.keys(v).sort().forEach(k=>{const n=_normSnap(v[k]);if(n!==null)o[k]=n;});
    return Object.keys(o).length?o:null;
  }
  return v;
}
function periodSnapshotEqual(a,b){return JSON.stringify(_normSnap(a))===JSON.stringify(_normSnap(b));}
// 削除済みスタッフのうち「この期間のシフト表には名前を残す」と指定された分（period.keepStaff）を名簿へ足す。
// スタッフ一覧から消しても、作成中・配布済みのシフト表からその人の列が黙って消えないようにするための仕組みで、
// 削除時のポップアップ（StaffTab）が最新3期間まで選ばせて書き込む。
// **足すだけで消さない**のが要点: 確定済み期間の写し(snapshot)を書き換えないので凍結の意味を壊さず、
// 期間が終了する前（写しがまだ採用されない時期）にも効く。
// **列は元の位置に戻す**（末尾送りにしない）。要素は {name,index} で、index は削除した時点の並び順。
// 位置が意味を持つのは見た目だけではない: staffList の空白列(スペーサー)がキッチン/ホールの境界
// （ShiftEditTab の spIdx）なので、末尾に付けるとその人の所属セクションまで変わってしまう。
// **挿入は keepStaff の後ろから（＝最後に削除した人から）行う**。index を小さい順に入れてはいけない。
// 各 index は「その人を削除した瞬間の一覧」での位置であって、元の一覧での位置ではない
// （StaffTab は確定時に staffList.indexOf で採るため、先に削除・保持した人が既に抜けた座標系になる）。
// 削除を新しい順に巻き戻すと、そのつど「その削除の直前の一覧」が再現されるので index がそのまま使える。
// 例: ["A","B","_spacer","C"] で B(index1)→C(index2) の順に削除すると keepStaff=[B:1, C:2]。
// index昇順だと B→C の順に入れて ["A","B","C","_spacer"] となり **C が空白列を跨いでキッチン側へ移る**。
// 逆順なら C→B で ["A","B","_spacer","C"] ＝元どおりになる。
// Firebaseは配列を数値キーのオブジェクトにして返すことがあるので両方の形を受ける。
// index を持たない旧形式（名前だけの文字列）は末尾に足す。
function mergeKeepStaff(list,period){
  const raw=period&&period.keepStaff;
  const keep=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?Object.values(raw):[]);
  const out=(list||[]).filter(n=>typeof n==="string");
  const entries=keep.map(e=>{
    if(typeof e==="string")return{name:e,index:null};
    if(e&&typeof e==="object"&&typeof e.name==="string")return{name:e.name,index:Number.isInteger(e.index)?Math.max(0,e.index):null};
    return null;
  }).filter(e=>e&&e.name);
  for(let i=entries.length-1;i>=0;i--){
    const e=entries[i];
    if(out.includes(e.name))continue;
    if(e.index==null||e.index>=out.length)out.push(e.name);
    else out.splice(e.index,0,e.name);
  }
  return out;
}
// 提出された名前が「その期間の名簿にも別名にも無い名前」か＝管理者が別名を紐づける必要がある名前か。
// 名簿は **staffList に period.keepStaff をマージしたもの**（mergeKeepStaff）で、シフト作成グリッド・
// Excel・PDF が使う名簿（resolvePeriodMaster 経由）と同じものになる。
// 期限付き削除で「この期間まで残す」と指定した人は staffList から消えて keepStaff にだけ載るため、
// 生の staffList で判定すると **その期間のシフト表には列があるのに、本人の提出だけが「未登録」扱い**になる
// （提出一覧に「別名を登録」が出る・スタッフタブの未登録名に並ぶ）。判定の入口が3つあり、
// keepStaff を後から足したときに Excel/PDF 側（マージ済み名簿を受け取る）しか追従していなかった。
// 同じ不変条件に入口が複数あり片方だけが知っている形（#105〜#107）を作らないよう、ここへ一本化する。
// period を渡さない呼び出しは keepStaff 抜き＝従来どおりの判定になる。
function isUnregisteredSubName(name,staffList,staffAliases,period){
  if(!name||isSpacer(name))return false;
  if(mergeKeepStaff(staffList,period).includes(name))return false;
  return!Object.values(staffAliases||{}).flat().includes(name);
}
// 削除ポップアップの「この期間まで残す」を、実際に keepStaff を書き込む期間IDへ変換する。
// choices は startDate 降順（＝新しい順）に並んだ最新3件。keepCount は1始まりの選択位置で、
// 0（および範囲外）は「どの期間にも残さない」。
// **範囲は時系列で読む**: k番目を選んだら、その期間と **それより古い** choices に名前を残し、
// **それより新しい期間からは外す**。「8月後半まで残す」は「8月後半が最後」の意味であって、
// 9月前半（より新しい期間）にも出し続ける指定ではない。
// 削除の動機はほぼ「その人が辞めた／その期間までしか入らない」であり、名前を消したいのは
// これから配る新しいシフト表のほう、残したいのは既に作った・配った古いシフト表のほうなので、
// 新しい側から累積すると**やりたいことが表現できなくなる**（8月後半に残すと9月前半にも必ず出る）。
function retainedPeriodIds(choices,keepCount){
  if(!Array.isArray(choices)||!(keepCount>=1))return[];
  return choices.slice(keepCount-1).map(p=>p&&p.id).filter(Boolean);
}
// 削除ポップアップを開いたときの既定の選択（2026-08-31 決定・案B）。
// choices は startDate 降順＝新しい順なので、先頭から見て最初に見つかった「終了済み」の期間を選ぶ。
// 範囲は時系列で読む（retainedPeriodIds）ため、それより古い期間にも名前が残る＝
// **配り終えた期間には残し、これから配る期間からは消える**。削除の実際の動機と既定を一致させる。
// 終了済みの期間が1つも無ければ 0＝「どの期間にも残さない」（残すのは明示操作にする）。
function defaultKeepCount(choices,todayStr){
  if(!Array.isArray(choices))return 0;
  const i=choices.findIndex(p=>isPeriodEnded(p,todayStr));
  return i<0?0:i+1;
}
// ===== 属性の期間指定（period.keepAttrs）=====
// 属性（社員／バイト／夏休み等）は勤務時間の上限判定に直結する。夏休みのあいだだけ上限の大きい属性へ
// 変えて、夏休みが終わってから元へ戻すと、**戻した瞬間に夏休み中の期間まで新しい上限で再判定され**、
// 配り終えたシフト表が上限超過エラーだらけになる（2026-09-08 ユーザー報告）。
// そこで属性を変えるときに「どの期間まで旧属性のままにするか」を選ばせ、選んだ期間とそれより古い
// 期間へ **旧属性を書き置く**。keepStaff と同じ「期間側に足すだけ」の形にしてあり、同じ理由で
//   - settings.staffAttributes（＝現在の属性）の形を一切変えない＝既存の読み手はそのまま動く
//   - 確定済み期間の写し(snapshot)を書き換えないので凍結の意味を壊さない
//   - 期間が終了する前（写しがまだ採用されない時期）にも効く
// が成り立つ。値は {スタッフ名: 属性ID} の1階層マップ（keepStaff と違って順序を持たないため配列にしない）。
// 写し(snapshot.settings.staffAttributes)と食い違うときは **keepAttrs が勝つ**。写しは「その期間を
// 開いた瞬間の値」を受動的に撮ったものだが、keepAttrs は管理者がその期間を名指しで指定した記録なので、
// あとから入った明示の指定を優先する。
function keepAttrsOf(period){
  const raw=period&&period.keepAttrs;
  if(!raw||typeof raw!=="object")return null;
  const out={};
  Object.keys(raw).forEach(k=>{if(typeof raw[k]==="string"&&raw[k])out[k]=raw[k];});
  return Object.keys(out).length?out:null;
}
// その属性IDが今も実在するか。**BUILTIN_TYPES は常に true**——SetTab の削除ボタンが
// `!isBuiltin` のときしか出ない＝組み込みIDは削除で消えようがないうえ、employee/parttime は
// staffTypeLimits に無くても getAttrOptions が補完するため「登録が無い＝無効」ではない。
// 逆にそれ以外（custom_*）は deleteType が staffTypeLimits からキーごと消すので、
// 存在の有無がそのまま生死になる。判定に使う一覧は呼び出し元が渡した settings のもの
// ＝**その期間を支配する側**（確定済みなら写しの、未確定なら現在の staffTypeLimits）。
// **一覧そのものが無いときは true**（消えた証拠が無い）。staffTypeLimits を1件も持たない店舗は
// 上限を1つも設定していないだけで、そこから「その属性は削除された」は導けない。ここで false に
// 倒すと、上限判定に影響が無いのに staffAttributes だけが変わり、同じ属性で引いている
// 休憩の属性タグ（getBreaksFor）が黙って別の休憩を引く。落とすのは
// **一覧が実在し、そこに無いと言い切れるときだけ**にする。
function attrIdExists(settings,id){
  if(BUILTIN_TYPES.includes(id))return true;
  const stl=(settings||{}).staffTypeLimits;
  if(!stl||typeof stl!=="object")return true;
  return stl[id]!==undefined;
}
// keepAttrs を settings へ当てる。指定が無ければ **同じ参照をそのまま返す**
// ＝ keepAttrs を持たない期間は従来と1バイトも変わらない（useMemo の下流も再計算されない）。
//
// **消えた属性を指す指定は当てない。** 属性を削除する deleteType（app-admin.js の SetTab）は
// staffTypeLimits と settings.staffAttributes しか掃除しない——SetTab は periods を props に
// 持たないので、そもそも keepAttrs へ手が届かない。掃除されないこと自体は keepStaff/keepAttrs の
// 「期間側に足すだけ」の原則どおりで正しいが、**消えたIDを当ててしまう**と話が変わる:
// 読み手はどこも `(settings.staffTypeLimits||{})[staffType]` で引くだけなので undefined になり、
// typeLim が全項目0の既定へ落ちて `if(typeLim.daily||typeLim.weekly||…)` が偽＝**上限判定そのものが
// 走らなくなる**。掃除された他の人は staffAttributes から落ちて "parttime" にフォールバックし
// 上限が効くので、**旧属性を固定した人だけ上限超過エラーが出ない**（バグチェック#119 で実測）。
// 当てなければその人も同じフォールバックに乗る＝削除の結果が全員で揃う。
// 確定済み期間は写しの staffTypeLimits で判定するため、写しが属性を覚えている限り指定は生き続ける
// （凍結の意味を壊さない）。
function applyKeepAttrs(settings,period){
  const ka=keepAttrsOf(period);
  if(!ka)return settings;
  const live={};
  Object.keys(ka).forEach(n=>{if(attrIdExists(settings,ka[n]))live[n]=ka[n];});
  if(!Object.keys(live).length)return settings;
  return{...(settings||{}),staffAttributes:{...((settings||{}).staffAttributes||{}),...live}};
}
// シフト作成タブが実際に使う staffList / settings を解決する。locked=true のときだけ写しを採用する。
// 凍結対象キーは「写しに無ければ現在値も消す」＝写しを撮ったあとに新設された設定が過去期間へ
// 漏れ込まないようにする。凍結対象外のキー（xlShopName・periodUnit・templates 等）は現在値のまま。
// staffList はどちらの経路でも最後に keepStaff をマージする（確定済み・未確定の両方で名前が残る）。
// settings は最後に keepAttrs を当てる（同上。確定済み・未確定の両方で旧属性が効く）。
function resolvePeriodMaster(period,staffList,settings,todayStr){
  const snap=period&&period.snapshot;
  const rawSl=snap&&snap.staffList;
  const sl=Array.isArray(rawSl)?rawSl:(rawSl&&typeof rawSl==="object"?Object.values(rawSl):null);
  if(!isPeriodEnded(period,todayStr)||!sl)return{staffList:mergeKeepStaff(staffList,period),settings:applyKeepAttrs(settings,period),locked:false};
  const merged={...(settings||{})};
  const ss=snap.settings||{};
  PERIOD_SNAPSHOT_SETTING_KEYS.forEach(k=>{if(ss[k]===undefined)delete merged[k];else merged[k]=ss[k];});
  return{staffList:mergeKeepStaff(sl,period),settings:applyKeepAttrs(merged,period),locked:true};
}
// ===== スタッフの非表示（期間の範囲で持つ・2026-09-06 決定）=====
//
// 非表示は「今この瞬間の設定」ではなく **期間の範囲** で持つ。休職などで一時的に外した人が復帰したとき、
// 外していた間に作った・配ったシフト表からは名前が消えたまま、復帰後の最新期間からは再び出るようにするため。
// 「その時点の設定」で持つと、解除した瞬間に配布済みの期間まで名前が生えてしまう。
//
// settings.staffHidden[名前] = [{from, to}, ...]
//   from = 非表示にした時点の最新期間の startDate（**含む**）。null は下限なし。
//   to   = 解除した時点の最新期間の startDate（**含まない**）。null は未解除＝以降ずっと非表示。
// 「解除した時点の最新期間からは表示に戻る」＝ to を含まないことで表現している（その1つ前までが非表示）。
// 複数回の非表示・解除に耐えるよう配列で持つ。上書きにすると過去の範囲が消え、
// 一度目の休職中に配ったシフト表に名前が生える。
//
// Firebaseは配列を数値キーのオブジェクトにして返すので両方の形を受ける。
// 旧形式（`true` = 全期間で非表示。範囲を持たなかった頃の本番データ）は下限も上限もない1本の範囲として読む。
function staffHiddenRanges(settings,name){
  const raw=((settings||{}).staffHidden||{})[name];
  if(raw===true)return[{from:null,to:null}];
  const arr=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?Object.values(raw):[]);
  return arr.filter(r=>r&&typeof r==="object").map(r=>({
    from:typeof r.from==="string"?r.from:null,
    to:typeof r.to==="string"?r.to:null,
  }));
}
// その期間でその人が非表示か。期間の startDate が範囲に入るかだけで決まる。
// **期間が特定できないとき（startDate なし）は隠さない**。判断材料が無いまま隠すと、
// 呼び出し側が期間を渡し忘れただけで全員が消えるという壊れ方をする（安全側に倒す）。
function isStaffHiddenInPeriod(name,settings,period){
  const s=period&&period.startDate;
  if(!s)return false;
  return staffHiddenRanges(settings,name).some(r=>(r.from==null||s>=r.from)&&(r.to==null||s<r.to));
}
// いま非表示の指定が生きているか（未解除の範囲を持つか）。スタッフ一覧のボタン表記・行の見た目に使う。
// 期間ごとの表示判定には使わない（それは isStaffHiddenInPeriod）。
function isStaffHiddenNow(settings,name){
  return staffHiddenRanges(settings,name).some(r=>r.to==null);
}
function _writeHiddenRanges(settings,name,ranges){
  const map={...((settings||{}).staffHidden||{})};
  // 下限も上限も無い範囲（{from:null,to:null}）は **そのままでは保存できない**。全キーがnullで、
  // Firebaseはnullのキーを書かず、キーの残らない空オブジェクトはノードごと消すため、配列に入れて
  // 書くとその要素が消え、要素が1つならstaffHidden自体が消えて非表示が黙って無かったことになる
  // （トーストは成功と言う）。到達するのは期間が1件も無い店舗で非表示にしたときで、
  // ポップアップが「これから作る期間もすべて非表示になります」と約束している経路そのもの。
  // 旧形式の true がまさに「下限も上限もない1本の範囲」を表すので、その形で書く
  // （staffHiddenRanges がそのまま読み戻す）。全期間を覆う範囲は他の範囲があっても結果が同じなので、
  // 1つでも含まれていれば true に潰してよい（近似ではなく同値）。
  const v=ranges.some(r=>r.from==null&&r.to==null)?true:ranges;
  if(v===true||v.length)map[name]=v;else delete map[name];
  const out={...(settings||{})};
  if(Object.keys(map).length)out.staffHidden=map;else delete out.staffHidden;
  return out;
}
// 非表示にする。startDate はその時点の最新期間の startDate（期間が1件も無ければ null＝下限なし）。
// 既に未解除の範囲があるなら何もしない（二重に開かない）。
function hideStaffFrom(settings,name,startDate){
  const ranges=staffHiddenRanges(settings,name);
  if(ranges.some(r=>r.to==null))return settings;
  return _writeHiddenRanges(settings,name,[...ranges,{from:startDate||null,to:null}]);
}
// 解除する。未解除の範囲に上限を入れる＝その期間からは再び表示される。
// **同じ期間の中で付けて外した範囲（from >= to）は捨てる**。何も隠していないので残す意味がなく、
// 残すと空の範囲が積み上がって設定が太る。期間が1件も無いときは範囲ごと捨てる（上限を書けないため）。
function showStaffFrom(settings,name,startDate){
  const ranges=staffHiddenRanges(settings,name);
  if(!ranges.some(r=>r.to==null))return settings;
  const next=ranges
    .map(r=>r.to!=null?r:(startDate?{from:r.from,to:startDate}:null))
    .filter(Boolean)
    .filter(r=>!(r.from!=null&&r.to!=null&&r.from>=r.to));
  return _writeHiddenRanges(settings,name,next);
}
// 期間の開始日を編集したとき、その開始日を境界に持つ非表示の範囲を新しい開始日へ移す。
// 境界は「その時点のどれかの期間の startDate」を値で写したものなので、期間側だけ動かすと
// 範囲がその期間から外れる。開始日を前へずらすと非表示にした人がシフト表・Excel・PDFに戻り、
// 解除した期間の開始日を前へずらすと表示に戻したはずの人が消える（どちらも無言。バグチェック#136）。
// 他の期間も同じ開始日を持つときは、その境界がどちらの期間を指して書かれたか区別できないので動かさない。
function moveStaffHiddenBoundaries(settings,oldStart,newStart,otherPeriods){
  if(!oldStart||!newStart||oldStart===newStart)return settings;
  if((otherPeriods||[]).some(p=>p&&p.startDate===oldStart))return settings;
  let out=settings;
  Object.keys(((settings||{}).staffHidden)||{}).forEach(name=>{
    const ranges=staffHiddenRanges(out,name);
    if(!ranges.some(r=>r.from===oldStart||r.to===oldStart))return;
    const next=ranges
      .map(r=>({from:r.from===oldStart?newStart:r.from,to:r.to===oldStart?newStart:r.to}))
      .filter(r=>!(r.from!=null&&r.to!=null&&r.from>=r.to));
    out=_writeHiddenRanges(out,name,next);
  });
  return out;
}
// 非表示スタッフを名簿から落とす。シフト作成グリッド・ヒートマップ・集計・Excel・PDF はこれを通した名簿を描く。
// **落とすのは表示だけ**で staffList 本体は触らないため、スタッフ提出画面の名前候補（buildSuggestList）と
// 提出名の解決（resolveAlias）は従来どおり効く＝非表示にした人も配布済みのURLでそのまま提出でき、
// その提出は本人の登録名に紐づいたままになる。
// **名簿にいるかどうかの判定（isUnregisteredSubName）には通さないこと**。通すと非表示の人の提出が
// 「未登録の提出名」に化け、Excel・PDF が末尾に足す未登録列として復活する（隠したのに出る）。
// 空白列（スペーサー）は staffHidden にキーを持たないのでそのまま残る＝キッチン/ホールの境界は動かない。
function visibleStaffList(list,settings,period){
  return(list||[]).filter(n=>!isStaffHiddenInPeriod(n,settings,period));
}
// スタッフ名をキーに持つ設定マップ。改名でキーを移し替えないと属性・ポジション・別名等が黙って初期値に戻る。
const STAFF_KEYED_SETTING_MAPS=["staffColors","staffAttributes","staffNumbers","staffPositions","staffAliases","staffWorkplaces","staffHidden","paidLeaveGranted"];
function _renameMapKey(map,oldName,newName){
  const m={...(map||{})};
  if(m[oldName]===undefined)return m;
  m[newName]=m[oldName];delete m[oldName];
  return m;
}
function _hasStaffKey(settings,name){
  const st=settings||{};
  if(STAFF_KEYED_SETTING_MAPS.some(k=>st[k]&&st[k][name]!==undefined))return true;
  return!!(st.overtimeSettings&&st.overtimeSettings.byStaff&&st.overtimeSettings.byStaff[name]!==undefined);
}
// 改名の規則をここ1箇所に置く。settings 本体と period.snapshot.settings（確定済み期間の写し）の
// 両方に同じものを当てるため（片方だけ直すと名簿と提出データの結合が切れる）。
// 元から無いキーは作らない＝写しに空マップを足して凍結対象キーの有無を変えてしまわない。
function renameStaffInSettings(settings,oldName,newName){
  const out={...(settings||{})};
  STAFF_KEYED_SETTING_MAPS.forEach(k=>{if(out[k]!==undefined)out[k]=_renameMapKey(out[k],oldName,newName);});
  if(out.overtimeSettings&&out.overtimeSettings.byStaff)
    out.overtimeSettings={...out.overtimeSettings,byStaff:_renameMapKey(out.overtimeSettings.byStaff,oldName,newName)};
  return out;
}
// 改名を period.snapshot（終了した期間の写し）にも反映する。
// sub.staffName は改名時に全期間ぶん書き換わるのに、写しの staffList は旧名のまま残る。
// 反映しないと確定済み期間のシフト作成タブ・Excel・PDF が「旧名の行 × 新名のsub」になり、
// _getSubForPeriod が引けず **その人のシフトが丸ごと空欄になる**（バグチェック#107）。
// keepStaff も **移し替える**。「削除済みの行に改名の導線が無いから旧名は入らない」という前提で
// 長く触っていなかったが、その前提は同じ名前を **追加し直せる**ことで崩れる（StaffTab の del が
// 明記しているとおり、同名で足せば設定マップもsubsも復帰する）。復帰したあとの行は現役スタッフなので
// 編集ボタンから普通に改名でき、そのとき keepStaff だけが旧名で残る。すると mergeKeepStaff が
// 旧名を別人として名簿に足し、**同じ人がシフト作成グリッド・Excel・PDF で2列に割れる**。
// keepAttrs も同じ理由で **必ず移し替える**。こちらは現役のスタッフ名をキーに持ち、改名の導線が普通にある。
// 移し替えないと改名した瞬間に過去期間の属性指定が引けなくなり、現在の属性で再判定される
// ＝この機能で消したはずの上限超過エラーが黙って戻る（#107 と同じ「片方だけが知っている」形）。
// keepStaff（{name,index}[]・Firebase往復で数値キーのobjectにもなる）の名前を移す。
// 該当者が居なければ null を返して呼び出し元に「書かない」を選ばせる（無駄な書き込みをしない）。
// 改名先が既に居るときは重複させずに旧名の要素を落とす（mergeKeepStaff は先勝ちで無視するが、記録にも残さない）。
// 名前を持たない壊れた要素はそのまま通す（mergeKeepStaff 側が無視するので、ここで消して形を変えない）。
function _renameKeepStaff(raw,oldName,newName){
  const list=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?Object.values(raw):null);
  if(!list||!list.length)return null;
  const nameOf=e=>typeof e==="string"?e:(e&&typeof e==="object"&&typeof e.name==="string"?e.name:null);
  if(!list.some(e=>nameOf(e)===oldName))return null;
  const hasNew=list.some(e=>nameOf(e)===newName);
  const out=[];
  list.forEach(e=>{
    if(nameOf(e)!==oldName){out.push(e);return;}
    if(hasNew)return;
    out.push(typeof e==="string"?newName:{...e,name:newName});
  });
  return out;
}
function renameStaffInPeriods(periods,oldName,newName){
  let changed=false;
  const out=(periods||[]).map(p=>{
    let np=p;
    const ks=_renameKeepStaff(p&&p.keepStaff,oldName,newName);
    if(ks){
      changed=true;
      np={...np,keepStaff:ks};
    }
    const ka=keepAttrsOf(np);
    if(ka&&ka[oldName]!==undefined){
      changed=true;
      np={...np,keepAttrs:_renameMapKey(ka,oldName,newName)};
    }
    const snap=np&&np.snapshot;
    if(!snap)return np;
    const rawSl=snap.staffList;
    const sl=Array.isArray(rawSl)?rawSl:(rawSl&&typeof rawSl==="object"?Object.values(rawSl):null);
    if(!sl)return np;
    if(!sl.includes(oldName)&&!_hasStaffKey(snap.settings,oldName))return np;
    changed=true;
    return{...np,snapshot:{...snap,
      staffList:sl.map(n=>n===oldName?newName:n),
      settings:renameStaffInSettings(snap.settings,oldName,newName)}};
  });
  return{periods:out,changed};
}

// ===== Nodeテスト用エクスポート（ブラウザでは module 未定義のため無視される）=====
if(typeof module!=="undefined"&&module.exports){
  module.exports={HOLIDAY_DROP_SHIFT_FIELDS,validatePeriodDates,oneSidedFillBounds,effShiftRangeMin,PERIOD_SNAPSHOT_SETTING_KEYS,isPeriodEnded,buildPeriodSnapshot,periodSnapshotEqual,resolvePeriodMaster,mergeKeepStaff,keepAttrsOf,applyKeepAttrs,attrIdExists,BUILTIN_TYPES,isUnregisteredSubName,visibleStaffList,staffHiddenRanges,isStaffHiddenInPeriod,isStaffHiddenNow,hideStaffFrom,showStaffFrom,moveStaffHiddenBoundaries,PERIOD_SNAPSHOT_EXEMPT_STAFF_MAPS,STAFF_KEYED_SETTING_MAPS,renameStaffInSettings,renameStaffInPeriods,retainedPeriodIds,defaultKeepCount,PLAN_RANK_UI,PLAN_LABELS,fd,pd,gd,idp,sc,isHoliday,isWeekendOrHoliday,calcNetWorkMinutes,effShiftStart,effShiftEnd,getBreakList,shiftBandInfo,ADMIN_SHIFT_FIELDS,carryAdminShiftFields,HEAT_BAND_SPLIT_MIN,resolveBandValues,noteToHeatSection,heatSectionEntries,getBreaksFor,getOT,fmtMin,genToken,genSecureId,isSpacer,firebaseKeyForbiddenChars,cookieSafeKey,resolveAlias,aliasOwnerOf,resolveSubByAlias,buildSuggestList,getAttrOptions,TO,TO_START,JH_DATES,CELL_COMMANDS,CELL_COLOR_LEGEND,isRestCommand,isReservedShopAbbr,extractNote,fixedShiftCommandFor,isFixedShiftEligibleShop,SUBS_WINDOW_MONTHS,subsWindowCutoff,recentPeriodIds,dateCandidateDisplayCutoff,subLastActionTime,deadlineGatePassed,subHasRealUpdate,sanitizeForSet,sanitizeForUpdate,diffSubForFlatWrite,applyFlatSubWrite,diffPeriodsForFlatWrite,dayTypeOf,matchPositionSlots,POSITION_DAY_TYPES,weekdayKeyToPositionDayType,candListsEqual,matchingPositionDayTypes,positionDayTypeFor,hasAnyRequiredPosition,requiredPositionsFor,isSpecialRedDate,LEGAL_DAILY_HOURS,LEGAL_WEEKLY_HOURS,LEGAL_DAILY_MIN,LEGAL_WEEKLY_MIN,LABOR_LONG_DAY_MIN,LABOR_SHORT_DAY_MIN,LABOR_SYSTEMS,LABOR_SYSTEM_LABELS,DEFAULT_LABOR_SYSTEM_BY_ATTR,laborSystemOf,laborSystemForStaff,DEFAULT_LABOR_SETTINGS,laborSettingsOf,weeklyLegalMinFromBase31,monthlyBaseMin,monthlyGuideMin,monthlyCapMin,daysInMonthOf,laborMonthFrame,weeklyOverMinB,weeklyOverTotalMinB,TIME_ORDER_ERROR_HINT,isTimeOrderInvalid,laborFindingsFor,laborFindingLabels,excelRound,excelRoundUp,excelRoundDown,monthlyOvertimeH,prorateOvertimeH,guideStatusOf,AGREEMENT_SINGLE_MONTH_CAP_H,AGREEMENT_LEGAL_ITEMS,overallVerdictOf,OVERALL_FIX_KEYS,BREAK_MODES,BREAK_MODE_LABELS,DEFAULT_BREAK_LENGTH,breakModeOf,breakLengthOf,shiftBindingMin,isBreakShort,BREAK_SHORT_TARGET_MIN,LEAVE_TYPES,LEAVE_TYPE_LABELS,LEAVE_TYPE_LEGEND_KEY,leaveTypeOf,dayRestKindOf,weekRestStateOf,restCommandOf,DEFAULT_FISCAL_YEAR_START_MONTH,fiscalYearStartMonthOf,fiscalYearOf,fiscalYearLabel,compactLaborTotal,laborTotalsEqual,yearLaborSummary,paidLeaveRemaining,STAFF_LIMIT_WINDOWS,STAFF_LIMIT_DEFAULTS,staffLimitOf,limitStateOf,hasAnyStaffLimit};
}
