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
const STAFF_TYPE_LABELS = {employee:"社員",parttime:"パート・アルバイト",dispatch:"派遣",other:"その他"};
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
  "adjustedBreak","leaveType","leaveTypes"];
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
// 自店舗のカウントから外す帯（2026-09-28）。x（ヘルプ・カウント外）と他店舗ヘルプ略称の両方を、h/k と同じ
// 帯規則（resolveBandValues）で解決する: 出勤セル=ランチ帯・退勤セル=ディナー帯・両方=終日。17:00 をまたがない
// シフトでは反対側セルの印も有効。以前 x だけは「どちらのセルに付いてもその日全体を外す」日単位の判定
// （app-admin.js の isCountExcluded）で、片側に入れても終日ヘルプになっていた。
// 時間帯別出勤人数・店舗間重複・ポジション判定・セルの赤ハイライトの4箇所がこれ1つを使う。
function excludedBandsOf(o){
  const shops=(o&&o.abbrToShop)||{};
  const mark=n=>!!n&&(n==="x"||(Object.prototype.hasOwnProperty.call(shops,n)&&!!shops[n]));
  const bv=resolveBandValues(o.stM,o.enM,mark(o.startNote)?1:null,mark(o.endNote)?1:null,HEAT_BAND_SPLIT_MIN);
  return{lunch:!!bv.lunch,dinner:!!bv.dinner};
}
// PDF の日付ヘッダに出す「昼・夜の人数」（2026-09-30・§3.9-4・P3.5d）。settings.headcountAt={enabled,lunch,dinner}。
// 確認時刻は店舗の設定（コードは持たない）。enabled でも時刻が空の側は出さない。**PDF だけ**に出す（画面・Excel には出さない）。
function headcountAtOf(settings){
  const raw=(settings&&settings.headcountAt)||{};
  const ok=v=>typeof v==="string"&&/^\d{1,2}:\d{2}$/.test(v);
  return{enabled:raw.enabled===true,lunch:ok(raw.lunch)?raw.lunch:"",dinner:ok(raw.dinner)?raw.dinner:""};
}
// その時刻に出勤している人数。entries は [{name, stM, enM, leave:{lunch,dinner}}]（自店舗で数える区間。
// 他店舗への応援・x の帯は呼び出し側が excludedBandsOf で外してから渡す＝ヒートマップと同じ区間）。
// 数え方: 出勤≦確認時刻＜退勤。同じ人は1人（締の追加出勤などで区間が2つあっても）。
// その帯（確認時刻が HEAT_BAND_SPLIT_MIN より前＝ランチ／以降＝ディナー）に休暇（公休・有給・慶弔）がある人は数えない。
// section（"kit"|"hall"）を渡すとその区分の区間だけを数える（2026-10-02 ユーザー指示でキッチンとホールを分けた）。
// 区分は heatSectionEntries が付けたもの＝ヒートマップと同じ（h/k の印・17:00 で区分が変わる人は区間が分かれている）。
function countPresentAt(entries,atMin,section){
  if(!(Number.isFinite(atMin)))return 0;
  const band=atMin<HEAT_BAND_SPLIT_MIN?"lunch":"dinner";
  const seen=new Set();
  (entries||[]).forEach(e=>{
    if(!e||seen.has(e.name))return;
    if(section&&e.section!==section)return;
    if(e.leave&&e.leave[band])return;
    if(e.stM<=atMin&&atMin<e.enM)seen.add(e.name);
  });
  return seen.size;
}
// 日付ヘッダの文言の後ろ半分（「昼3 夜7」）。0人の側は出さない。店休日は何も付けない（曜日だけ）。
function headcountLabelOf(counts,closed){
  if(closed||!counts)return"";
  const parts=[];
  if(counts.lunch>0)parts.push(`昼${counts.lunch}`);
  if(counts.dinner>0)parts.push(`夜${counts.dinner}`);
  return parts.join(" ");
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
// 属性の並び順の正本（2026-09-26 ユーザー指示）。組み込みの 社員 → パート・アルバイト を上に固定し、
// 残り（自由追加した属性と、旧 makeSettings が入れていた 派遣／その他）を**表示名の50音順**で並べる。
// スタッフタブの属性プルダウンと設定タブの属性別勤務時間設定の**両方がここを通る**
// ——並べ替えを画面ごとに書くと、片方だけ直したときに並びが食い違う。
// 漢字は読み仮名を持たないので localeCompare の照合順（かな→漢字）になる点は許容する。
// 引数は [属性ID, 表示名] の組の配列で、**表示名は呼び出し側が解決してから渡す**
// （設定タブは lim 本体が要るので ID→名前のマップを作れない）。
const ATTR_PINNED_ORDER=["employee","parttime"];
function sortAttrEntries(entries){
  return (entries||[]).slice().sort((a,b)=>{
    const ia=ATTR_PINNED_ORDER.indexOf(a[0]),ib=ATTR_PINNED_ORDER.indexOf(b[0]);
    if(ia>=0&&ib>=0)return ia-ib;
    if(ia>=0)return -1;
    if(ib>=0)return 1;
    return String(a[1]||"").localeCompare(String(b[1]||""),"ja");
  });
}
// 属性ID→名称のリスト（並びは sortAttrEntries・組み込みは STAFF_TYPE_LABELS が正本）
// **組み込み属性の表示名は staffTypeLimits の name を読まない**（2026-09-26）。組み込みの名前を変える
// 入口は UI に無い（設定タブは組み込みだけ input ではなく固定表示）ので、name に入っているのは
// makeSettings が書いた当時の既定名だけ。読むと「バイト」→「パート・アルバイト」の改称が
// 既存店舗に届かない（データ移行をしないための選択）。
function getAttrOptions(settings){
  const stl=(settings&&settings.staffTypeLimits)||{};
  const out=[["employee",STAFF_TYPE_LABELS.employee],["parttime",STAFF_TYPE_LABELS.parttime]];
  // 組み込みの dispatch/other は名前が無くても既定名で補う。2026-06-16〜06-28 の makeSettings は
  // name を持たない {daily,weekly} で保存しており、スタッフタブの属性選択・設定タブの制限一覧は
  // STAFF_TYPE_LABELS で「派遣」「その他」を出すのに、ここだけ落として休憩タグに選べなかった（バグチェック#121）。
  Object.keys(stl).forEach(id=>{
    if(id==="employee"||id==="parttime")return;
    const t=stl[id];
    const nm=BUILTIN_TYPES.includes(id)?STAFF_TYPE_LABELS[id]:(t&&typeof t==="object"?(t.name||""):"");
    if(nm)out.push([id,nm]);
  });
  return sortAttrEntries(out);
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
  // 中休み（settings.idleBreak・P3.5a）は 2026-10-02 のユーザー指示で機能ごと削除した（休憩は前後に勤務がある時間帯に
  // だけ当たる＝時間帯方式の休憩帯で表せる、という決定）。店舗データに idleBreak が残っていても読まない。
  // ② 長さ方式: 拘束の長さだけで控除を決める（S-3）。片側セルは時間帯方式と同じく非適用。
  //    ただし候補タブにその人の属性の休憩（属性あり）があり、勤務がそれを丸ごと含む日はそちらを優先する（2026-10-02 ユーザー指示）。
  //    属性ありの休憩が当たらない日（含まない・その日区分に無い）は長さ方式。全属性の休憩（タグなし）は勤務時間に使わない。
  if(breakModeOf(settings)==="length"){
    const tagged=_lengthTaggedBreaks(settings,dateStr,staffName,shift);
    if(tagged.length)return tagged;
    if(!effShiftStart(shift)||!effShiftEnd(shift))return[];
    const r=effShiftRangeMin(shift,settings);
    if(!r)return[];
    const len=_lengthBreakMin(settings,shift,staffName);
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
// ヒートマップが人数から外す休憩（2026-10-02 ユーザー指示）。**勤務時間・休憩の分は getBreaksFor のまま**で、ここは時間帯の位置だけ。
// 長さ方式は休憩の時間帯が決まらない（getBreaksFor は勤務の先頭に置いた合成の帯を返す）ので、ヒートマップには候補タブの
// 休憩帯を時間帯方式と同じ規則（属性タグ・勤務が休憩を丸ごと含む日だけ）で当てる。日別の上書き（分だけ）も位置を持たないので同じ。
// 長さ方式で全属性の休憩（タグなし）を使うのはヒートマップだけ（2026-10-02 ユーザー指示）。
// 時間帯方式の店舗は getBreaksFor と同じ（従来どおり）。
// 属性ありの休憩が当たる人（_lengthTaggedBreaks）はその休憩帯で外す（勤務時間と同じ帯・2026-10-02 ユーザー指示）。
function _filterBreakTimes(settings,keep){
  const bt=(settings&&settings.breakTimes)||{};const out={};
  Object.keys(bt).forEach(k=>{const l=Array.isArray(bt[k])?bt[k]:Object.values(bt[k]||{});out[k]=l.filter(b=>b&&keep(b));});
  return out;
}
function _untaggedBreakTimes(settings){return _filterBreakTimes(settings,b=>!(b.tags&&b.tags.length));}
// 長さ方式の店舗で、その人の属性の休憩（属性あり）のうち勤務が丸ごと含むもの。時間帯方式と同じ規則（getBreaksFor ③）で選ぶ
function _lengthTaggedBreaks(settings,dateStr,staffName,shift){
  const attr=((settings&&settings.staffAttributes)||{})[staffName]||"parttime";
  const bt=_filterBreakTimes(settings,b=>Array.isArray(b.tags)&&b.tags.includes(attr));
  return getBreaksFor({...settings,breakMode:"band",breakTimes:bt},dateStr,staffName,shift);
}
function heatBreaksFor(settings,dateStr,staffName,shift){
  if(breakModeOf(settings)!=="length")return getBreaksFor(settings,dateStr,staffName,shift);
  if(!shift)return[];
  const sh={...shift};delete sh.adjustedBreak;
  const tagged=_lengthTaggedBreaks(settings,dateStr,staffName,sh);
  if(tagged.length)return tagged;
  return getBreaksFor({...settings,breakMode:"band",breakTimes:_untaggedBreakTimes(settings)},dateStr,staffName,sh);
}
// 長さ方式の休憩と候補タブの休憩（全属性＝タグなし）の食い違い（2026-10-02 ユーザー指示の確認表示）。
// 長さ方式の休憩は**いちばん長い段**の分（通し勤務が受ける休憩）。日区分ごとに全属性の休憩帯の合計と比べ、違う区分だけ返す。
// 全属性の休憩帯が無い区分は比べない。時間帯方式の店舗は空。戻り値 [{dayType,label,bands:["15:00〜17:00"],bandMin,lengthMin}]
function lengthBandMismatchOf(settings){
  if(breakModeOf(settings)!=="length")return[];
  const top=breakLengthRuleOf(settings).tiers[0];
  const lengthMin=top?top.breakMin:0;
  const bt=_untaggedBreakTimes(settings);const out=[];
  POSITION_DAY_TYPES.forEach(([dt,label])=>{
    const list=(bt[dt]||[]).filter(b=>b.start&&b.end);
    if(!list.length)return;
    const bandMin=breakMinutesOf(list);
    if(bandMin!==lengthMin)out.push({dayType:dt,label,bands:list.map(b=>`${b.start}〜${b.end}`),bandMin,lengthMin});
  });
  return out;
}
// 確認表示の文言（設定タブの休憩の決め方と候補タブの休憩時間設定で同じ文を出す）
function lengthBandMismatchText(list){
  if(!list||!list.length)return"";
  // 休憩帯が同じ日区分は1つにまとめる（「平日・土曜・日曜 15:00〜17:00＝120分」）
  const g=[];list.forEach(x=>{const k=x.bands.join("・");const f=g.find(y=>y.k===k);if(f)f.labels.push(x.label);else g.push({k,labels:[x.label],min:x.bandMin});});
  const parts=g.map(y=>`${y.labels.join("・")} ${y.k}＝${y.min}分`).join("、");
  return`長さ方式の休憩（${list[0].lengthMin}分）と候補タブの全属性の休憩（${parts}）が違います。勤務時間と休憩は長さ方式の${list[0].lengthMin}分で計算し（属性ありの休憩が当たる日はその休憩）、全属性の休憩はヒートマップで人数を外す時間帯にだけ使います。`;
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
// 設定画面の選択肢。**括弧の中は「その制がどの雇用形態に当たるか」の目安**で、
// ユーザー指定の文言（2026-09-26）。判定は属性ごとの laborSystem で決まるので、
// この括弧は選ぶときの手がかりにすぎない（括弧の中の語でマッチングはしない）。
const LABOR_SYSTEM_LABELS={A:"1か月単位の変形労働時間制（正社員・契約社員・特定技能）",
  B:"通常の労働時間制（パート・アルバイト）",none:"判定対象外（応援・外部）"};
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
  agreementAnnualOtMin:21600, // 36協定 1年の延長上限（分・360h）。法定の原則値で、協定で下げられる
  fiscalYearStartMonth:4,     // 年度の開始月（1なら暦年）。有給残数と年間累計の区切りに使う
  // 以下4つは 2026-09-30（労務給与_複数法人_実装計画.md §3.3・P2）。0＝未設定で、未設定なら従来と1分も変わらない。
  annualScheduledMin:0,       // 年間所定労働時間（分）。設定すると月の所定上限（年按分）と目安の基準が変わる
  rateDenominatorMin:0,       // 1時間当たり賃金の分母（分）。0なら年間所定÷12を0.1h（6分）単位で切り捨てた値
  weekStartDow:1,             // 週の起算曜日（0=日〜6=土）。割増の計算（P5）で使う
  weekSplitAtMonthEdge:1,     // 1=月をまたぐ週はその月の日だけで切る（既定）／0=行政解釈。割増の計算（P5）だけに効く
  // 以下2つは 2026-09-30（§3.9-2・P3.5b）。既定はオフで、オフなら従来と1分も変わらない。
  showDailyOverB:0,           // 1=通常の労働時間制（B制）の人の「その日のしきい値超」を残業予定として数値で出す
  dailyOverThresholdMin:LEGAL_DAILY_MIN, // 上のしきい値（分）。既定は法定の1日8時間
  // 以下2つは 2026-09-30（§3.9-3・P3.5c）。既定はオフ。判定対象外（応援・外部）の人の長時間の日をセル色で示すだけで、
  // 労務判定の表・総括には載せない（派遣元の36協定に配慮するための目印）。
  highlightExternalOver8h:0,  // 1=判定対象外の人の実働がしきい値を超える日のセルを塗る
  externalOverThresholdMin:LEGAL_DAILY_MIN // 上のしきい値（分）。**超える**日だけ（ちょうどは塗らない）
};
// 真偽値は 0/1 の数値で持つ（laborSettingsOf と CF の sanitizeCompanySettings は「0以上の数値」しか受けないため）。
// 範囲の決まっているキーは範囲外を既定値へ倒す（CF 側 functions/company-config.js も同じ範囲で捨てる）。
const LABOR_SETTING_RANGES={weekStartDow:[0,6],weekSplitAtMonthEdge:[0,1],showDailyOverB:[0,1],highlightExternalOver8h:[0,1]};
function laborSettingsOf(settings){
  const raw=(settings&&settings.laborSettings)||null;
  const out={...DEFAULT_LABOR_SETTINGS};
  if(raw&&typeof raw==="object"){
    Object.keys(DEFAULT_LABOR_SETTINGS).forEach(k=>{
      const v=Number(raw[k]);
      if(!(Number.isFinite(v)&&v>=0))return;
      const r=LABOR_SETTING_RANGES[k];
      if(r&&!(Number.isInteger(v)&&v>=r[0]&&v<=r[1]))return;
      out[k]=Math.round(v);
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
// 月の上限の入口（2026-10-01・ひな型 2026-10 版との差分 F4）。年間所定を設定した（所定上限が正）ときは
// ひな型と同じ ROUNDDOWN(所定上限 + 固定残業)（**時間未満を切り捨て**）。2,080h・31日なら 176:39+30h → 206:00。
// 未設定なら従来の monthlyCapMin（総枠 + 固定残業・切り捨てなし）と1分も変わらない。
// laborMonthFrame の capMin と guideStatusOf の「みなし超」が同じ式を通る（同じ問いへの答えを2つ持たない）。
function monthlyCapMinFor(baseMin,scheduledCapMin,fixedOtMin){
  const s=Number(scheduledCapMin)||0;
  if(s>0)return Math.max(0,Math.floor((s+(Number(fixedOtMin)||0))/60)*60);
  return monthlyCapMin(baseMin,fixedOtMin);
}
// "YYYY-MM" または "YYYY-MM-DD" の暦日数
function daysInMonthOf(ym){
  const m=typeof ym==="string"?/^(\d{4})-(\d{2})/.exec(ym):null;
  if(!m)return 0;
  const mo=Number(m[2]);
  if(mo<1||mo>12)return 0;
  return new Date(Number(m[1]),mo,0).getDate();
}
// 暦年の日数（うるう年は366）
function yearDaysOf(y){
  const n=Number(y);
  if(!Number.isInteger(n))return 0;
  return(n%4===0&&n%100!==0)||n%400===0?366:365;
}
// 月の所定上限（分）= FLOOR(年間所定 × 暦日数 ÷ その暦年の日数)（§3.3）。年間所定が0（未設定）なら0。
// 2,080h で 31日=176:39／30日=170:57／28日=159:33／うるう年2月=164:48。
function monthlyScheduledCapMin(annualMin,days,yearDays){
  const a=Number(annualMin),d=Number(days),yd=Number(yearDays);
  if(!(a>0&&d>0&&yd>0))return 0;
  return Math.floor(a*d/yd);
}
// その月のA制の枠を一括で出す。ym は "YYYY-MM"（期間の startDate をそのまま渡してもよい）。
// scheduledCapMin は年間所定を設定したときだけ正の値（未設定は0）。設定すると目安は総枠ではなく
// 所定上限から引き（目安 = 所定上限 + 固定残業 − 余裕）、上限も所定上限から引く
// （上限 = ROUNDDOWN(所定上限 + 固定残業)・2026-10-01 F4。以前は総枠＋固定残業のままで、ひな型より 1h08 甘かった）。
// 総枠（baseMin）は変えない——残業予定（月実働 − 総枠）の基準のまま。
function laborMonthFrame(settings,ym){
  const ls=laborSettingsOf(settings);
  const weeklyMin=weeklyLegalMinFromBase31(ls.monthlyBase31Min);
  const days=daysInMonthOf(ym);
  const baseMin=monthlyBaseMin(weeklyMin,days);
  const y=typeof ym==="string"?Number(ym.slice(0,4)):NaN;
  const scheduledCapMin=days>0?monthlyScheduledCapMin(ls.annualScheduledMin,days,yearDaysOf(y)):0;
  return{days,weeklyMin,baseMin,scheduledCapMin,
    guideMin:monthlyGuideMin(scheduledCapMin>0?scheduledCapMin:baseMin,ls.fixedOvertimeMin,ls.marginMin,ls.agreementDailyOtMin),
    capMin:monthlyCapMinFor(baseMin,scheduledCapMin,ls.fixedOvertimeMin)};
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
// B制の日ごとの「しきい値超」（分）（2026-09-30・P3.5b）。laborSettings.showDailyOverB=1 の店舗だけが画面に出す。
// しきい値は laborSettings.dailyOverThresholdMin（0以下なら法定の1日8時間）。週40h超は週の欄のまま（ここでは数えない）。
function dailyOverThresholdOf(ls){const v=Number(ls&&ls.dailyOverThresholdMin);return v>0?v:LEGAL_DAILY_MIN;}
// 判定対象外（区分 none）の長時間の日のしきい値（P3.5c）。トグルがオフなら 0＝塗らない。
function externalOverThresholdOf(ls){
  if(!(ls&&Number(ls.highlightExternalOver8h)===1))return 0;
  const v=Number(ls.externalOverThresholdMin);return v>0?v:LEGAL_DAILY_MIN;
}
function dailyOverMinB(dayMins,thresholdMin){
  const t=Number(thresholdMin)>0?Number(thresholdMin):LEGAL_DAILY_MIN;
  return(dayMins||[]).map(m=>Math.max(0,(Number(m)||0)-t));
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

// ===== 入力の確認（2026-10-01・シフトひな型2026-10版との差分 F6・D11）=====
// ひな型は「入力の問題」（片側だけ・読めない文字）を要修正にしているが、Shifty は片側だけの日を候補時間で補完し
// （oneSidedFillBounds）、読めない文字をメモとして保存する＝**黙って通る**。店長がひな型と同じ基準で見られるよう、
// 労務の確認パネルに「入力の確認n日（…）」として並べる。**要修正ではない**（OVERALL_FIX_KEYS・LABOR_DAY_FIX_KEYS に入れない）。
// 戻り値 {oneSided, memoOnly}:
//   oneSided … 出勤だけ／退勤だけが入っている日（補完が効いた日）。退勤≦出勤（timeError）とは別の問い。
//              空いている側に休み希望（adminRest）・半日の休暇（leaveTypes）・締めの印がある日と、
//              入っている側が応援の指定（x・店舗略称＝出勤セルだけ＝ランチ帯の応援、の設計どおりの入力）の日は除く
//   memoOnly … 時刻が無く、コマンドでも店舗略称でもない文字だけのセルがある日（例「事務11」）。
//              h/k/x 単独（extractNote が "x" にする）・休み・休暇・締め・abbrToShop の略称は除く
function inputCheckOfShift(shift,abbrToShop){
  const r={oneSided:false,memoOnly:false};
  if(!shift)return r;
  const st=effShiftStart(shift),en=effShiftEnd(shift);
  const ar=shift.adminRest||{};
  const lv=leaveFieldsOf(shift);
  const noteOf=f=>{if(ar[f])return"";const n=f==="start"?(shift.adjustedStartNote??shift.startNote):(shift.adjustedEndNote??shift.endNote);
    return typeof n==="string"?n.trim():"";};
  const isAbbr=n=>!!n&&!!abbrToShop&&Object.prototype.hasOwnProperty.call(abbrToShop,n);
  const isSuffixCmd=n=>CELL_COMMANDS.some(c=>c.kind==="suffix"&&c.key===String(n).toLowerCase());
  const intended=f=>!!ar[f]||!!lv[f]||!!shift[f==="start"?"adjustedStartFixed":"adjustedEndFixed"];
  const helpMark=f=>{const n=noteOf(f);return n==="x"||isAbbr(n);};
  if(shift.status==="work"){
    if(st&&!en&&!intended("end")&&!helpMark("start"))r.oneSided=true;
    if(!st&&en&&!intended("start")&&!helpMark("end"))r.oneSided=true;
  }
  const memoCell=f=>{
    if(f==="start"?st:en)return false;
    const n=noteOf(f);
    if(!n||isSuffixCmd(n)||isRestCommand(n)||isAbbr(n))return false;
    return true;
  };
  r.memoOnly=memoCell("start")||memoCell("end");
  return r;
}

// 従業員番号が未設定か（F6③）。空欄とひな型の「派遣」（番号の代わりに書かれる語）を未設定とみなす。
function isStaffNumberMissing(settings,name){
  const v=((settings&&settings.staffNumbers)||{})[name];
  const t=v==null?"":String(v).trim();
  return!t||t==="派遣";
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
// scheduledCapMin（laborMonthFrame の所定上限）を渡し、それが正なら「所定未満」は**所定上限**と比べ、
// 「みなし超」は monthlyCapMinFor の上限（ROUNDDOWN(所定上限 + 固定残業)）と比べる（2026-10-01 F4）。
// 0・省略なら従来どおり総枠と 総枠＋固定残業 で比べる。
const GUIDE_STATUS_COLORS={over:"#e53935",under_base:"#e53935",under_guide:"#B8860B",ok:null,none:null};
function guideStatusOf(monthWorkMin,baseMin,fixedOtMin,guideMin,scheduledCapMin=0){
  const sched=Number(scheduledCapMin)||0;
  if(sched>0){
    // 所定基準（F4）。差は**分のまま**取ってから時間に直す——176:39 を 176.65h にしてから引くと
    // 二進小数の誤差で ROUNDUP が 0.65 を 0.66 にする（実測）。上限は時間単位なので丸めずに比べる。
    const wm=Math.max(0,Number(monthWorkMin)||0),gm=Number(guideMin)||0;
    if(!(wm>0))return{key:"none",label:"",color:null};
    const capm=monthlyCapMinFor(baseMin,sched,fixedOtMin);
    if(wm>capm)return{key:"over",label:`みなし超 ${excelRoundUp(minToH(wm-capm),2)}h`,color:GUIDE_STATUS_COLORS.over};
    if(wm<sched)return{key:"under_base",label:`所定未満 あと${excelRoundUp(minToH(sched-wm),2)}h`,color:GUIDE_STATUS_COLORS.under_base};
    if(wm<gm)return{key:"under_guide",label:`目安未満 あと${excelRoundUp(minToH(gm-wm),2)}h`,color:GUIDE_STATUS_COLORS.under_guide};
    return{key:"ok",label:`OK 上限まで${excelRoundDown(minToH(capm-wm),2)}h`,color:null};
  }
  const w=minToH(monthWorkMin),b=minToH(baseMin),f=minToH(fixedOtMin),g=minToH(guideMin);
  if(!(w>0))return{key:"none",label:"",color:null};
  const cap=b+f;
  if(w>excelRound(cap,2))return{key:"over",label:`みなし超 ${excelRoundUp(w-cap,2)}h`,color:GUIDE_STATUS_COLORS.over};
  if(w<excelRound(b,2))return{key:"under_base",label:`所定未満 あと${excelRoundUp(b-w,2)}h`,color:GUIDE_STATUS_COLORS.under_base};
  if(w<g)return{key:"under_guide",label:`目安未満 あと${excelRoundUp(g-w,2)}h`,color:GUIDE_STATUS_COLORS.under_guide};
  return{key:"ok",label:`OK 上限まで${excelRoundDown(cap-w,2)}h`,color:null};
}

// 36協定の単月の絶対上限。2026-09-30（P5・§4.4）から**時間外＋法定休日労働**で比べる
// （以前は Shifty に法定休日労働を区別するデータが無く「月の残業予定」だけと比べていた＝法定より緩い側に倒れていた）。
const AGREEMENT_SINGLE_MONTH_CAP_H=100;
// 年単位の絶対上限（判断4・案b。2026-09-26 にユーザーが追加を指示）。
// 720h・80h・6回は**法律が決める値で協定では緩められない**のでコード側の定数にする。
// 年360h だけは「協定で定める年間の上限」なので設定で変えられる（laborSettings.agreementAnnualOtMin）。
const AGREEMENT_ANNUAL_CAP_H=720;      // 特別条項の年間の絶対上限
const AGREEMENT_AVG_CAP_H=80;          // 複数月（2〜6ヶ月）平均の絶対上限
const AGREEMENT_OVER45_H=45;           // 「月45時間超」の判定に使う法定の原則値
const AGREEMENT_OVER45_COUNT_LIMIT=6;  // 月45時間超にできるのは年6回まで
const AGREEMENT_AVG_MONTHS=[2,3,4,5,6];
// 法定の上限一覧。設定画面のチェックリストをこのレジストリから自動生成する（判定の有無を取り違えない）。
const AGREEMENT_LEGAL_ITEMS=[
  {key:"dailyOt",label:"1日の延長時間の上限",judged:true,note:"36協定で定めた時間。日ごとに判定します"},
  {key:"monthlyOt",label:"1か月の延長時間の上限（原則45時間）",judged:true,note:"36協定で定めた時間。月の残業予定（通常の労働時間制は1日8時間・週40時間を超えた時間外）と比べます"},
  {key:"singleMonth100",label:"単月100時間未満（特別条項の絶対上限）",judged:true,note:"時間外に法定休日労働を足して比べます。法定休日は、週に休日が1日も無いときのその週の最後の勤務日（実績で指定した日があればその日）です"},
  {key:"year720",label:"年720時間以内（特別条項）",judged:true,note:"年度の各月の残業予定を足して比べます"},
  {key:"avg80",label:"複数月平均80時間以内（特別条項）",judged:true,note:"連続する2〜6ヶ月の平均を全通り見ます。時間外に法定休日労働を足して比べます"},
  {key:"over45x6",label:"月45時間超は年6回まで（特別条項）",judged:true,note:"月の残業予定が45時間を超えた月を数えます"},
  {key:"year360",label:"年360時間以内（原則）",judged:true,note:"36協定で定めた年間の上限。下の入力欄で変えられます"},
];
// 年度の12ヶ月を開始月から並べる
function fiscalYearMonths(fy,startMonth){
  const st=Math.min(12,Math.max(1,Number(startMonth)||1));
  const out=[];
  for(let i=0;i<12;i++){
    const m=st+i, y=Number(fy)+Math.floor((m-1)/12), mm=((m-1)%12)+1;
    out.push(`${y}-${String(mm).padStart(2,"0")}`);
  }
  return out;
}
// 年度の各月の残業予定（時間）。**月の値はその月の最後の期間にだけ持たせる**ので、
// 半月運用でも2重に数えない。凍結値（period.laborTotals[name].monthOtH）を優先し、
// 無い月は live(ym) で数える。期間はあるのに読めない月は missingMonths に積む。
// 期間が1つも無い月は 0（まだシフトを組んでいない月）で、判定の対象からも外す（scoped）。
// ag は単月100h・複数月平均80hに使う「時間外＋法定休日労働」（P5）。凍結値 monthAgH が無い月（P5 より前に凍結した月）は h で代える。
// live(ym) は数値（h）か {h, ag} を返す。
function yearOvertimeMonths(periods,name,fy,startMonth,live){
  const list=fiscalYearMonths(fy,startMonth).map(ym=>{
    const inMonth=(periods||[]).filter(p=>p&&p.startDate&&p.startDate.slice(0,7)===ym)
      .slice().sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)));
    const last=inMonth[inMonth.length-1];
    let h=0,ag=null,known=false;
    if(last){
      const t=last.laborTotals&&last.laborTotals[name];
      const st=t?Number(t.monthOtH):NaN;
      if(Number.isFinite(st)){h=st;known=true;const sa=Number(t.monthAgH);if(Number.isFinite(sa))ag=sa;}
      else{
        const l=live?live(ym):null;
        if(typeof l==="number"){h=l;known=true;}
        else if(l&&typeof l==="object"&&Number.isFinite(Number(l.h))){h=Number(l.h);known=true;if(Number.isFinite(Number(l.ag)))ag=Number(l.ag);}
      }
    }
    h=Math.max(0,h);
    return{ym,h,ag:ag==null?h:Math.max(0,ag),hasPeriod:!!last,known};
  });
  let lastIdx=-1;list.forEach((v,i)=>{if(v.hasPeriod)lastIdx=i;});
  return{list,scoped:lastIdx<0?[]:list.slice(0,lastIdx+1),
    missingMonths:list.filter(v=>v.hasPeriod&&!v.known).map(v=>v.ym)};
}
// 36協定の年単位の判定（判断4・案b）。months は yearOvertimeMonths の scoped（連続した月）。
// **シフトを組んである月までしか見ない**——未作成の月を0として平均に混ぜると実態より低く出る。
// 年単位の値（年の残業の合計・月45h超の回数・複数月平均がいちばん高い窓）。判定（agreementYearFindings）と
// 企業横断ダッシュボードの「残り」（P7）が**同じ値**を使う（判定と残りの計算を二重に持たない）。
// worstAvg は連続する2〜6ヶ月の平均の最大（同じ値なら短い窓・前の窓）。窓が1つも無ければ null。
function agreementYearStatus(months){
  const vals=(months||[]).map(v=>Math.max(0,Number(v&&v.h)||0));
  const total=excelRound(vals.reduce((a,b)=>a+b,0),2);
  const n45=vals.filter(h=>h>AGREEMENT_OVER45_H).length;
  // 複数月平均80hは時間外＋法定休日労働（ag）で比べる（P5・§4.4）。ag を持たない値は h で代える
  const ags=(months||[]).map(v=>{const a=Number(v&&v.ag);return Math.max(0,Number.isFinite(a)?a:(Number(v&&v.h)||0));});
  let worst=null;
  AGREEMENT_AVG_MONTHS.forEach(w=>{
    for(let i=0;i+w<=ags.length;i++){
      const avg=ags.slice(i,i+w).reduce((a,b)=>a+b,0)/w;
      if(!worst||avg>worst.avg)worst={w,avg};
    }
  });
  return{months:vals.length,totalH:total,n45,worstAvg:worst};
}
function agreementYearFindings(months,annualLimitH){
  const out=[];
  const st=agreementYearStatus(months);
  if(!st.months)return out;
  const total=st.totalH;
  const lim=Number(annualLimitH)||0;
  if(lim>0&&total>lim)out.push({key:"yearOtOverAgreement",label:`年${excelRound(lim,2)}h超`});
  if(total>AGREEMENT_ANNUAL_CAP_H)out.push({key:"yearOt720",label:`年${AGREEMENT_ANNUAL_CAP_H}h超`});
  if(st.n45>AGREEMENT_OVER45_COUNT_LIMIT)out.push({key:"over45Count",label:`月${AGREEMENT_OVER45_H}h超が年${st.n45}回`});
  if(st.worstAvg&&st.worstAvg.avg>AGREEMENT_AVG_CAP_H)out.push({key:"avgOver80",label:`複数月平均${AGREEMENT_AVG_CAP_H}h超(${st.worstAvg.w}ヶ月)`});
  return out;
}
// 「n日」と数える判定の該当日を、ラベルの後ろに `（17・22）` の形で足す（2026-09-26 ユーザー指示）。
// **日だけを出す**（同日の追加指示）。日次の判定は選択中の期間で絞られているので月は要らない。
// 期間が月をまたぐ設定では日番号だけが並ぶが、グリッドの日付列も同じく日だけなので表と揃う。
// **件数が多いときは途中で打ち切る**——休憩を1件も設定していない店舗では実働6h超の日が
// すべて休憩不足に当たるため（セル色を付けないと決めた理由とまったく同じ）、全部並べると
// 1人ぶんが何行にもなって「直すべき日」が埋もれる。打ち切った残りは件数で示す。
const LABOR_FINDING_DATES_MAX=10;
function laborFindingDatesLabel(dates){
  const ds=(dates||[]).filter(Boolean);
  if(!ds.length)return"";
  const head=ds.slice(0,LABOR_FINDING_DATES_MAX).map(d=>{
    const t=pd(d);return isNaN(t)?String(d):String(t.getDate());});
  const rest=ds.length-head.length;
  return`（${head.join("・")}${rest>0?` ほか${rest}日`:""}）`;
}
// 週に帰属する判定（B制の週40h超）の該当週を `（5〜11）` の形で足す。週は月曜起算なので
// 月曜と日曜の日だけを出す。日に割れない判定でも「どの週か」までは示せる。
function laborWeekDatesLabel(weekStarts){
  const ws=(weekStarts||[]).filter(Boolean);
  if(!ws.length)return"";
  const head=ws.slice(0,LABOR_FINDING_DATES_MAX).map(s=>{
    const m=pd(s);if(isNaN(m))return String(s);
    const e=new Date(m);e.setDate(m.getDate()+6);
    return`${m.getDate()}〜${e.getDate()}`;});
  const rest=ws.length-head.length;
  return`（${head.join("・")}${rest>0?` ほか${rest}週`:""}）`;
}
// スタッフ1人ぶんの労務日次・月次判定（S-4）。文言と発火条件は S-4 の表に一致させる。
// 引数はオプションオブジェクト（第2弾で項目が増えたため位置引数から変えた）。
//   laborSystem      "A"|"B"|"none"|null（null＝区分が空欄か誤り）
//   dayMins          日ごとの実働分の配列（休み・未入力の日は0で入れてよい。4h未満は m>0 で絞る）
//   dayDates         dayMins・dayOtH と**同じ並びの日付**（"YYYY-MM-DD"）。渡すと 12h超・4h未満・
//                    8h超・1日の残業が上限超 のラベルの後ろに該当日が出る（2026-09-26 ユーザー指示）
//   weekDayMins      週ごとの実働分の配列の配列（B制の週40h超用）
//   weekDates        weekDayMins と同じ並びの週の開始日（月曜）。渡すと週40h超に該当週が出る
//   timeErrorCount   退勤≦出勤の日数（項目12）
//   timeErrorDates   同じものを日付で渡す形。渡すと件数もこの配列から数える
//   breakShortCount  休憩不足の日数（第3弾）
//   breakShortDates  休憩不足の該当日（"YYYY-MM-DD" の配列）。渡すとラベルの後ろに日付が出る。
//                    **渡したときは件数もこの配列から数える**（同じ問いへの答えを2つ持たない）。
//                    breakShortCount は件数だけを渡す呼び出しとの後方互換で残してある
//   monthOtH         月の残業予定（時間）。A制は「月実働−総枠」、B制は割増の計算（P5）の①＋②
//   monthAgreementH  単月100hと比べる「時間外＋法定休日労働」（時間・P5）。省くと monthOtH
//   dayOtH           日別の残業予定（時間・A制のみ）
//   agreementDailyOtH / agreementMonthlyOtH / fixedOtH  36協定と固定残業（時間）
//   monthReady       その月の全日にデータが揃っているか。false なら月単位の判定を出さない
//   skilledWeekDates 特定技能の週の公休が足りない週の開始日（月曜）。渡すと「特定技能の週の公休不足（28〜4）」が出る
//   inputCheckDates  入力の確認が要る日（inputCheckOfShift の oneSided か memoOnly）。区分によらず「入力の確認n日（…）」（F6）
//   staffNumberMissing 従業員番号が空か「派遣」。A/B の人だけ「従業員番号が未設定」（F6）。どちらも要修正ではない
// laborSystem==="none"（判定対象外＝Excelの「応援・外部」）は労働時間の判定・集計から外す。
// ただし「時刻の入力ミス」は労務の判定ではなく入力データそのものの誤りなので区分によらず出す
// （項目12・案Cのセル色と同じ集合を指す）。
// 戻り値は {key,label} の配列。**総括判定が key で引く**ので、文言だけを返す形にはしない。
function laborFindingsFor(o){
  const {laborSystem=null,dayMins=[],dayDates=[],weekDayMins=[],weekDates=[],
    timeErrorCount=0,timeErrorDates=[],breakShortCount=0,breakShortDates=[],
    monthOtH=0,monthAgreementH=null,dayOtH=[],agreementDailyOtH=0,agreementMonthlyOtH=0,fixedOtH=0,monthReady=true,
    skilledWeekDates=[],inputCheckDates=[],staffNumberMissing=false}=o||{};
  const out=[];
  const push=(key,label)=>out.push({key,label});
  const mins=(dayMins||[]).map(m=>Math.max(0,Number(m)||0));
  const dOt=(dayOtH||[]).map(h=>Math.max(0,Number(h)||0));
  const mOt=Math.max(0,Number(monthOtH)||0);
  const mAg=monthAgreementH==null?mOt:Math.max(0,Number(monthAgreementH)||0);
  const dd=dayDates||[];
  // 日に帰属する判定は、**当たった日の添字を集めてから件数と該当日を同時に作る**。
  // 件数と日付を別の式から出すと、条件を直したときに片方だけ直して食い違う。
  const hitIdx=(arr,fn)=>{const ix=[];arr.forEach((v,i)=>{if(fn(v,i))ix.push(i);});return ix;};
  // `n日` ＋（該当日）。dayDates を渡していなければ日付は出ない（件数だけの呼び出しと同じ）。
  const dayLabel=(ix,suffix="")=>`${ix.length}日${suffix}${laborFindingDatesLabel(ix.map(i=>dd[i]))}`;
  if(laborSystem==="A"){
    const ix12=hitIdx(mins,m=>m>LABOR_LONG_DAY_MIN);
    if(ix12.length>0)push("over12",`12h超${dayLabel(ix12)}`);
    const ix4=hitIdx(mins,m=>m>0&&m<LABOR_SHORT_DAY_MIN);
    if(ix4.length>0)push("under4",`4h未満${dayLabel(ix4)}`);
    if(monthReady){
      if(agreementMonthlyOtH>0&&mOt>agreementMonthlyOtH)push("monthOtOverAgreement","月の残業が上限超");
      if(fixedOtH>0&&mOt>fixedOtH)push("monthOtOverFixed",`固定残業${excelRound(fixedOtH,2)}h超`);
      // 単月100h未満（36協定の絶対上限）。S-4 の表には無い行で、文言はここで決めた（判断4）。
      // 時間外＋法定休日労働で比べる（P5・§4.4）
      if(mAg>=AGREEMENT_SINGLE_MONTH_CAP_H)push("monthOt100",`月の残業が${AGREEMENT_SINGLE_MONTH_CAP_H}h以上`);
    }
    if(agreementDailyOtH>0){
      const ixo=hitIdx(dOt,h=>h>agreementDailyOtH);
      if(ixo.length>0)push("dayOtOverAgreement",`1日の残業予定が上限超${dayLabel(ixo)}`);
    }
  }else if(laborSystem==="B"){
    const ix8=hitIdx(mins,m=>m>LEGAL_DAILY_MIN);
    if(ix8.length>0)push("over8",`8h超${dayLabel(ix8,"(残業)")}`);
    const weekOver=weeklyOverTotalMinB(weekDayMins);
    // 週40h超は日を特定できない（週の合計に対する判定）ので**該当週**を出す。
    const wk=laborWeekDatesLabel(hitIdx(weekDayMins||[],w=>weeklyOverMinB(w)>0).map(i=>(weekDates||[])[i]));
    if(weekOver>0)push("weekOver40",`週40h超(残業)${wk}`);
    if(agreementDailyOtH>0){
      const lim=LEGAL_DAILY_MIN+agreementDailyOtH*60;
      const ixb=hitIdx(mins,m=>m>lim);
      if(ixb.length>0)push("dayOverAgreementB",`1日の残業が上限超${dayLabel(ixb)}`);
    }else if(weekOver>0){
      push("weekOver40NoAgreement",`週40h超(協定なし)${wk}`);
    }
    // 36協定の月45h・単月100h を B制にも（P5・§4.3）。月の時間外は割増の計算の①＋②
    if(monthReady){
      if(agreementMonthlyOtH>0&&mOt>agreementMonthlyOtH)push("monthOtOverAgreement","月の残業が上限超");
      if(mAg>=AGREEMENT_SINGLE_MONTH_CAP_H)push("monthOt100",`月の残業が${AGREEMENT_SINGLE_MONTH_CAP_H}h以上`);
    }
  }
  // 休憩不足は**労務の判定**なので、判定対象外（応援・外部）は出さない。
  // 次の「時刻の入力ミス」だけは労務ではなく入力データそのものの誤りなので区分によらず出す。
  const bsDates=(breakShortDates||[]).filter(Boolean);
  const bs=bsDates.length||Math.max(0,Number(breakShortCount)||0);
  if(bs>0&&laborSystem!=="none")push("breakShort",`休憩不足${bs}日${laborFindingDatesLabel(bsDates)}`);
  // 特定技能の週の公休（2026-10-01）。週に帰属するので該当週を出す（月をまたぐ週は月末側・月初側に各1回が要る）。
  // 労務の判定なので判定対象外（none）は出さない（isSkilledWorkerAttr も none を外している）
  const skw=(skilledWeekDates||[]).filter(Boolean);
  if(skw.length>0&&laborSystem!=="none")push("skilledWeekRest",`特定技能の週の公休不足${laborWeekDatesLabel(skw)}`);
  const teDates=(timeErrorDates||[]).filter(Boolean);
  const te=teDates.length||Math.max(0,Number(timeErrorCount)||0);
  if(te>0)push("timeError",`時刻の入力ミス${te}日${laborFindingDatesLabel(teDates)}`);
  // 入力の確認（F6）。時刻の入力ミスと同じく入力データの話なので区分によらず出す（判定対象外にも出す）。**要修正ではない**
  const icDates=[...new Set((inputCheckDates||[]).filter(Boolean))].sort();
  if(icDates.length>0)push("inputCheck",`入力の確認${icDates.length}日${laborFindingDatesLabel(icDates)}`);
  // 従業員番号は労務の対象（A/B）だけ。日ではなく人に1回
  if(staffNumberMissing&&(laborSystem==="A"||laborSystem==="B"))push("inputCheckNumber","従業員番号が未設定");
  // ここから下（月の残業・固定残業・単月100h・年の36協定・区分が空欄）は**日を特定できない**。
  // 月・年の合計に対する判定なので、該当日を足せる材料がそもそも無い（週は上で該当週を出した）。
  if(laborSystem===null||laborSystem===undefined)push("badSystem","区分が空欄か誤り");
  return out;
}
// 労務判定のうち「その日」に帰属するもので、**セル色で示すと決めた2種類だけ**を日ごとに返す
// （2026-09-26 ユーザー指定）。12h超 と 1日の残業が上限超（A制の残業予定・B制の実残業）。
// **塗らないもの**と、その理由:
//   4h未満・休憩不足 … 要修正ではあるが該当日が多くなりやすく、塗ると直すべき日が埋もれる
//                       （休憩を1件も設定していない店舗では実働6h超の日がすべて該当する）
//   8h超・週40h超    … OVERALL_FIX_KEYS に無い＝要修正ではない
//   月の残業・目安・年の36協定 … 週・月に帰属するので日を特定できない
//   時刻の入力ミス   … 専用の色（timeErr）を先に持っている
// どれもパネル（laborFindingsFor）には従来どおり出る。ここは**色を塗る日**の一覧にすぎない。
// **laborFindingsFor と件数が必ず一致する**ことを tests/core.test.js が照合する。
// externalOver（2026-09-30・P3.5c）は判定対象外（応援・外部）の人の長時間の日で、店舗トグルがオンのときだけ付く。
// **要修正（OVERALL_FIX_KEYS）でも労務判定の表（laborFindingsFor）でもない**——色で示すだけの目印。
const LABOR_DAY_FIX_KEYS=["over12","dayOtOverAgreement","dayOverAgreementB","externalOver"];
// セルの title に出す短い理由。**LABOR_DAY_FIX_KEYS の全キーを持つ**ことをテストが照合する。
const LABOR_DAY_ERR_LABELS={over12:"12h超",dayOtOverAgreement:"1日の残業予定が上限超",
  dayOverAgreementB:"1日の残業が上限超",externalOver:"判定対象外（応援・外部）の長時間の日"};
function laborDayFindingsFor(o){
  const {laborSystem=null,dayMins=[],dayOtH=[],agreementDailyOtH=0,externalOverMin=0}=o||{};
  const extTh=Math.max(0,Number(externalOverMin)||0);
  const mins=(dayMins||[]).map(m=>Math.max(0,Number(m)||0));
  const dOt=(dayOtH||[]).map(h=>Math.max(0,Number(h)||0));
  const agDay=Math.max(0,Number(agreementDailyOtH)||0);
  return mins.map((m,i)=>{
    const keys=[];
    if(laborSystem==="A"){
      if(m>LABOR_LONG_DAY_MIN)keys.push("over12");
      if(agDay>0&&(dOt[i]||0)>agDay)keys.push("dayOtOverAgreement");
    }else if(laborSystem==="B"){
      if(agDay>0&&m>LEGAL_DAILY_MIN+agDay*60)keys.push("dayOverAgreementB");
    }else if(laborSystem==="none"){
      if(extTh>0&&m>extTh)keys.push("externalOver");
    }
    return keys;
  });
}
// 表示用。パネルはこちらを使う（総括判定は key を見るので laborFindingsFor をそのまま使う）。
function laborFindingLabels(o){return laborFindingsFor(o).map(f=>f.label);}

// 総括判定（S-6）。上から順に評価する4値＋Shifty固有の1値。
//   要修正 / 目安未満 / 残業あり / OK  … S-6 の4値
//   ＋OK … 月に帰属する判定（目安・月の残業）をまだ出せないとき。Shifty は半月運用で1つの月が
//          2期間に分かれ、月が埋まるまで月実働が必ず不足するので、S-6 をそのまま当てると
//          全員が所定未満になる。**日・週に帰属する判定は材料が揃っているので出す**ので、
//          「いま分かっている範囲では問題なし。月の判定は月が埋まってから」を意味する。
//          2026-09-26 にユーザー指示で「要確認」から変えた（出せる判定は出し、実数も見せる）。
// weekNoRest（週の休みに ×休なし がある）は第3弾で渡すようになるまで常に false。
const OVERALL_FIX_KEYS=["over12","under4","monthOtOverAgreement","dayOtOverAgreement",
  "monthOt100","dayOverAgreementB","weekOver40NoAgreement","breakShort","timeError","badSystem","skilledWeekRest"];
function overallVerdictOf(o){
  const {laborSystem=null,findings=[],guideKey="none",weekNoRest=false,monthReady=true}=o||{};
  if(laborSystem==="none")return{key:"none",label:""};
  const keys=new Set((findings||[]).map(f=>f&&f.key));
  // **月が埋まっていない間は目安を総括に入れない。** 呼び出し側は月が埋まる前も現状の実数で
  // guideStatusOf を出すようになった（画面に「＋所定未満 あと90h」と出る）ので、その key を
  // そのまま採ると全員が要修正になる。月に帰属する findings は laborFindingsFor 側が落としている。
  const gk=monthReady?guideKey:"none";
  // monthOt100 は S-6 の一覧に無いが、36協定の絶対上限の違反なので要修正に入れる（判断4）。
  const fix=weekNoRest||keys.has("badSystem")||keys.has("timeError")||keys.has("breakShort")||keys.has("skilledWeekRest")
    ||(laborSystem==="A"&&(gk==="over"||gk==="under_base"
        ||keys.has("over12")||keys.has("under4")||keys.has("monthOtOverAgreement")
        ||keys.has("dayOtOverAgreement")||keys.has("monthOt100")))
    ||(laborSystem==="B"&&(keys.has("dayOverAgreementB")||keys.has("weekOver40NoAgreement")
        ||keys.has("monthOtOverAgreement")||keys.has("monthOt100")));
  if(fix)return{key:"fix",label:"要修正"};
  if(laborSystem==="A"&&gk==="under_guide")return{key:"under_guide",label:"目安未満"};
  if(laborSystem==="B"&&(keys.has("over8")||keys.has("weekOver40")))return{key:"ot",label:"残業あり"};
  if(!monthReady&&laborSystem==="A")return{key:"ok_partial",label:"＋OK"};
  return{key:"ok",label:"OK"};
}

// ===== 属性別の勤務時間の上限・目安（目安は 2026-09-26 に「下限」として追加し、2026-09-28 に目安へ改めた）=====
// 上限と目安は**同じ窓（1日・週・2週間・1ヶ月・任意日数）で対にして持つ**。どちらも 0＝未設定。
// minKey＝目安（旧・下限）。**キー名は変えていない**（既存データの移行をしないため）。
// **目安は何も判定しない**（2026-09-28 ユーザー指示）。集計表に行として出るだけで、色もバッジも付けない。
// 1ヶ月の窓だけ otKey（1ヶ月の残業・時間）を持つ。1ヶ月の上限・目安は、入力値を「31日の月の値」とみなして
// 労務設定と同じ式で月の暦日数に日割りし、そこへ残業を足した値になる（attrMonthFrameOf）。
// 一覧をここに置くのは、SetTab の入力欄・シフト作成タブの集計表・提出一覧のバッジが
// **同じ窓の組**を3箇所に書き写さないようにするため（書き写すとどれかが取り残される）。
const STAFF_LIMIT_WINDOWS=[
  {key:"daily",   minKey:"dailyMin",   label:"1日",    max:24},
  {key:"weekly",  minKey:"weeklyMin",  label:"週",     max:168},
  {key:"biweekly",minKey:"biweeklyMin",label:"2週間",  max:336},
  {key:"monthly", minKey:"monthlyMin", label:"1ヶ月",  max:744, otKey:"monthlyOt", otMax:200},
];
const STAFF_LIMIT_DEFAULTS=(()=>{
  const o={name:"",customDays:0,customHours:0,customHoursMin:0};
  STAFF_LIMIT_WINDOWS.forEach(w=>{o[w.key]=0;o[w.minKey]=0;if(w.otKey)o[w.otKey]=0;});
  return o;
})();
// 属性IDの上限・下限をまとめて引く（未設定は0で埋める）。
function staffLimitOf(settings,attrId){
  const raw=((settings&&settings.staffTypeLimits)||{})[attrId||"parttime"];
  return{...STAFF_LIMIT_DEFAULTS,...(raw&&typeof raw==="object"?raw:{})};
}
// その窓の判定。上限を超えたときだけ "over"、それ以外は null。
// **目安は判定しない**（2026-09-28）ので "under" は返さない。以前の第3引数（下限）は受けても無視する。
function limitStateOf(min,upperHours){
  const m=Number(min)||0;
  if(!(m>0))return null;
  const up=Number(upperHours)||0;
  if(up>0&&m>up*60)return"over";
  return null;
}
// その属性が上限をひとつでも持っているか（判定を走らせるかの入口）。目安だけの属性では判定を走らせない。
function hasAnyStaffLimit(lim){
  if(!lim)return false;
  if(lim.customDays&&lim.customHours)return true;
  return STAFF_LIMIT_WINDOWS.some(w=>lim[w.key]);
}
// 31日の月の値（時間）を、その月の暦日数に日割りした分数（2026-09-28）。労務設定の月の総枠と**同じ2段の丸め**
// （週の値 W を30分単位に丸めてから FLOOR(W×暦日数÷7)）を使う。そのため入力値そのものが31日でも
// そのまま戻らないことがある（160h → W=36h → 31日は 159:25）。0・未設定は0。
// ごく小さい値（約1.1h未満）は W が0に丸まって**上限が黙って消える**ので、そのときだけ丸めずに比例で出す。
function prorateMonthlyHours(hours31,ym){
  const h=Number(hours31)||0;
  if(!(h>0))return 0;
  const days=daysInMonthOf(ym);
  const w=weeklyLegalMinFromBase31(h*60);
  if(!(w>0))return days>0?Math.floor(h*60*days/31):0;
  return monthlyBaseMin(w,days);
}
// 属性の1ヶ月の枠（分）。{capMin, guideMin}。0＝未設定。
// 上限・目安とも日割りしたうえで1ヶ月の残業（monthlyOt・時間・日割りしない）を足す。残業だけでは枠にならない。
function attrMonthFrameOf(lim,ym){
  const l=lim||{};
  const ot=Math.max(0,Number(l.monthlyOt)||0)*60;
  const cap=Number(l.monthly)>0?prorateMonthlyHours(l.monthly,ym)+ot:0;
  const guide=Number(l.monthlyMin)>0?prorateMonthlyHours(l.monthlyMin,ym)+ot:0;
  return{capMin:cap,guideMin:guide};
}
function attrMonthFrame(settings,attrId,ym){return attrMonthFrameOf(staffLimitOf(settings,attrId),ym);}

// 残業予定の按分窓（2026-09-30・§3.9-2・P3.5b）。属性の設定 staffTypeLimits[属性].otProrate={window, fixedMin?}。
//   window:"month"     … 月（既定・従来）。月の残業予定（月実働−総枠）を月の勤務日に実働比で配る
//   window:"halfMonth" … 半月（1〜15日／16日〜月末）ごとに配る
//   fixedMin           … 窓ごとの残業予定を固定値にする（窓の実働がそれ未満なら実働まで）
// fixedMin の無い halfMonth は配る元の値が無いので月と同じに倒す。設定の無い属性は従来と1分も変わらない。
// 値（窓・固定値）はすべて属性の設定で、コードは持たない。企業共通・法人でも設定できる（COMPANY_LIMIT_KEYS）。
const OT_PRORATE_WINDOWS=["month","halfMonth"];
const OT_PRORATE_WINDOW_LABELS={month:"月ごと",halfMonth:"半月ごと（1〜15日・16日〜月末）"};
const OT_PRORATE_FIXED_MAX_MIN=744*60;
const HALF_MONTH_LAST_DAY=15; // 半月の区切り。Shifty の2週間期間（前半＝1〜15日）と同じ
function otProrateOf(raw){
  if(!raw||typeof raw!=="object"||OT_PRORATE_WINDOWS.indexOf(raw.window)<0)return null;
  const o={window:raw.window};
  const f=Number(raw.fixedMin);
  if(Number.isFinite(f)&&f>0&&f<=OT_PRORATE_FIXED_MAX_MIN)o.fixedMin=Math.round(f);
  return o;
}
function staffOtProrateOf(settings,name){
  const attr=((settings&&settings.staffAttributes)||{})[name]||"parttime";
  return otProrateOf(staffLimitOf(settings,attr).otProrate)||{window:"month"};
}
// 月の残業予定と日別の按分（A制）。dates と dayMins は同じ並び（その月の全日）。戻り値の dayOtH も同じ並び。
function overtimePlanOf(o){
  const {dates=[],dayMins=[],baseMin=0,prorate=null}=o||{};
  const mins=(dayMins||[]).map(m=>Math.max(0,Number(m)||0));
  const p=otProrateOf(prorate)||{window:"month"};
  const fixed=p.fixedMin>0?p.fixedMin:0;
  const total=mins.reduce((a,b)=>a+b,0);
  if(!fixed){
    const monthOtH=monthlyOvertimeH(total/60,(Number(baseMin)||0)/60);
    return{monthOtH,dayOtH:prorateOvertimeH(mins.map(m=>m/60),monthOtH,total/60),window:"month",fixed:false};
  }
  const groups=p.window==="halfMonth"
    ?[[],[]].map((g,k)=>{mins.forEach((_,i)=>{const d=Number(String(dates[i]||"").slice(8,10));if((d<=HALF_MONTH_LAST_DAY)===(k===0))g.push(i);});return g;})
    :[mins.map((_,i)=>i)];
  const dayOtH=mins.map(()=>0);
  let sum=0;
  groups.forEach(idx=>{
    const w=idx.reduce((a,i)=>a+mins[i],0);
    if(!(w>0))return;
    const ot=excelRound(Math.min(fixed,w)/60,2);
    sum+=ot;
    const d=prorateOvertimeH(idx.map(i=>mins[i]/60),ot,w/60);
    idx.forEach((i,k)=>{dayOtH[i]=d[k];});
  });
  return{monthOtH:excelRound(sum,2),dayOtH,window:p.window,fixed:true};
}

// ===== 割増の計算（2026-09-30・P5・労務給与_複数法人_実装計画.md §4.1〜§4.4・決定 #3・#4・#5）=====
// 入力は resolveActualDay（実績が無い日は確定シフト）の1日だけ。単位はすべて分・1分単位。
// **週は laborSettings.weekStartDow 起算、月をまたぐ週は既定でその月に属する日だけで切る（weekSplitAtMonthEdge=1）**。
// この切り方は**ここ（割増の計算）にだけ効かせる**——既存の週の休み（weekRestStateOf の呼び出し側）と
// B制の週40h超（weeklyOverMinB の呼び出し側）は今までどおり前後の月にまたがる週で数える（計画書 §3.3）。
// 深夜の時間帯（0:00〜5:00 と 22:00〜29:00＝翌5:00）。Shifty の時刻は 30:00 まで入るので 29:00〜30:00 は深夜ではない。
const NIGHT_WINDOWS_MIN=[[0,5*60],[22*60,29*60]];
const OVER60_THRESHOLD_MIN=60*60; // 月60時間を超えた時間外に +25%（法定休日労働は含めない）
function _ovMin(a0,a1,b0,b1){return Math.max(0,Math.min(a1,b1)-Math.max(a0,b0));}
function nightOverlapMin(s,e){
  const a=Number(s),b=Number(e);
  if(!(Number.isFinite(a)&&Number.isFinite(b)&&b>a))return 0;
  return NIGHT_WINDOWS_MIN.reduce((t,[n0,n1])=>t+_ovMin(a,b,n0,n1),0);
}
// その日の深夜労働（分）。day は resolveActualDay（または scheduledDay）の戻り値。
// 休憩が深夜帯にかかる分は引く。休憩の位置が分かる（時間帯方式の帯＝breakBands）ならその重なりを、
// 位置が無い（長さ方式・日別の上書き・実績の休憩分）なら**拘束時間に占める深夜帯の比率で按分**（決定 #4）。
// 按分で引く分は切り捨て（1分未満は深夜の側に残す＝労働者に不利な側へ丸めない）。「締」の追加出勤には休憩が無い。
function nightMinutesOf(day){
  if(!day||!Array.isArray(day.segments))return 0;
  const brk=Math.max(0,Number(day.breakMin)||0);
  let tot=0;
  day.segments.forEach(sg=>{
    if(!sg)return;
    const s=Number(sg.startMin),e=Number(sg.endMin);
    if(!(e>s))return;
    let n=nightOverlapMin(s,e);
    if(!sg.extra&&n>0&&brk>0){
      if(Array.isArray(day.breakBands)){
        n-=day.breakBands.reduce((a,b)=>a+(b?nightOverlapMin(Math.max(s,Number(b.startMin)),Math.min(e,Number(b.endMin))):0),0);
      }else{
        n-=Math.floor(brk*n/(e-s));
      }
    }
    tot+=Math.max(0,n);
  });
  return tot;
}
// 週の開始日（weekStartDow 起算・0=日〜6=土）
function premiumWeekStartOf(dateStr,weekStartDow){
  const d=pd(dateStr);
  if(isNaN(d))return null;
  const w=Number.isInteger(Number(weekStartDow))&&Number(weekStartDow)>=0&&Number(weekStartDow)<=6?Number(weekStartDow):1;
  d.setDate(d.getDate()-((d.getDay()-w+7)%7));
  return fd(d);
}
// 法定休日（決定 #5）。days=[{date, workMin, rest:true|false|null, manualLegal}]（rest=null はデータが無い日）。
//  - 実績で法定休日を指定した日（manualLegal・その日に勤務がある）はそのまま法定休日労働。指定のある週は自動判定しない
//  - 指定の無い週は「週（weekStartDow 起算の7日）に休日が1日も無いとき、その週の最後の勤務日」を法定休日労働にする
//  - 7日のどれかのデータが無い週は**判定しない**（無い日が休日かもしれない）＝undeterminedWeeks に積む
//  休日の判定は呼び出し側が決める（シフト作成タブは週の休みと同じ dayRestKindOf＝公休・空欄を休日、有給・慶弔・欠勤は休日にしない）。
//  この週の判定は**月で切らない**（週1回の休日は暦の7日で見る）。
function legalHolidayDatesOf(o){
  const {days=[],weekStartDow=1}=o||{};
  const byDate=new Map();
  (days||[]).forEach(x=>{if(x&&isValidDateStr(x.date))byDate.set(x.date,x);});
  const weeks=new Map();
  byDate.forEach((x,d)=>{const ws=premiumWeekStartOf(d,weekStartDow);if(!weeks.has(ws))weeks.set(ws,[]);weeks.get(ws).push(d);});
  const manual=[],auto=[],undetermined=[];
  [...weeks.keys()].sort().forEach(ws=>{
    const list=[];for(let i=0;i<7;i++)list.push(addDays(ws,i));
    const man=list.filter(d=>{const x=byDate.get(d);return!!(x&&x.manualLegal&&(Number(x.workMin)||0)>0);});
    if(man.length){man.forEach(d=>manual.push(d));return;}
    if(list.some(d=>{const x=byDate.get(d);return!x||x.rest===null||x.rest===undefined;})){undetermined.push(ws);return;}
    if(list.some(d=>byDate.get(d).rest===true))return;
    const worked=list.filter(d=>(Number(byDate.get(d).workMin)||0)>0);
    if(worked.length)auto.push(worked[worked.length-1]);
  });
  return{dates:[...manual,...auto].sort(),manual,auto,undeterminedWeeks:undetermined};
}
// 割増の内訳（1人・1か月）。
//   system          "A"（1か月単位の変形）| "B"（通常）| それ以外（時間外は0。深夜・法定休日だけ数える）
//   days            [{date, workMin, scheduledMin, nightMin, rest, manualLegal}]。ym の全日を含める。
//                   週の法定休日の判定と weekSplitAtMonthEdge=0 の週のため、前後の月の日も入れてよい
//   ym              "YYYY-MM"（この月の時間外を出す）
//   weekStartDow / weekSplitAtMonthEdge  laborSettings の値（1=月をまたぐ週はその月の日だけで切る）
//   monthFrameMin   A制の月の総枠（laborMonthFrame の baseMin）
// A制（§4.2）: ① max(0, 実働 − max(所定, 8h)) ② max(0, Σ週(実働−①) − max(Σ週所定, 40h)) ③ max(0, Σ月(実働−①−②) − 総枠)
// B制（§4.3）: ① max(0, 実働 − 8h)           ② max(0, Σ週(実働−①) − 40h)
// 法定休日労働は①②③に含めない（35%のみ）。深夜は法定休日の日も数え、重なった分を別に持つ（35%+25%）。
// weekSplitAtMonthEdge=0（行政解釈）は、週の開始日がこの月にある週だけを7日まるごと数える
// （この月の1日を含み前の月に始まる週は前の月の分）。UI は無く引数だけ（計画書 §4.1）。
// 戻り値の perDay は日ごとの時間外（①はその日、②は週の最後の日＝この月の中の最後の日、③は月の最終日に載せる）。
function premiumBreakdownOf(o){
  const {system=null,days=[],ym="",weekStartDow=1,splitAtMonthEdge=1,monthFrameMin=0}=o||{};
  const byDate=new Map();
  (days||[]).forEach(x=>{if(x&&isValidDateStr(x.date))byDate.set(x.date,x);});
  const monthDates=[...byDate.keys()].filter(d=>d.slice(0,7)===ym).sort();
  const legal=legalHolidayDatesOf({days,weekStartDow});
  const legalSet=new Set(legal.dates);
  const isA=system==="A",isB=system==="B";
  const W=d=>{const x=byDate.get(d);return x&&!legalSet.has(d)?Math.max(0,Number(x.workMin)||0):0;};
  const S=d=>{const x=byDate.get(d);return x&&!legalSet.has(d)?Math.max(0,Number(x.scheduledMin)||0):0;};
  const d1=d=>isA?Math.max(0,W(d)-Math.max(S(d),LEGAL_DAILY_MIN)):isB?Math.max(0,W(d)-LEGAL_DAILY_MIN):0;
  const perDay={};monthDates.forEach(d=>{perDay[d]=d1(d);});
  const dayOt={};monthDates.forEach(d=>{if(perDay[d]>0)dayOt[d]=perDay[d];});
  // 週の組
  const groups=new Map();
  if(Number(splitAtMonthEdge)===0){
    monthDates.forEach(d=>{const ws=premiumWeekStartOf(d,weekStartDow);if(ws&&ws.slice(0,7)===ym&&!groups.has(ws)){
      const l=[];for(let i=0;i<7;i++)l.push(addDays(ws,i));groups.set(ws,l);}});
  }else{
    monthDates.forEach(d=>{const ws=premiumWeekStartOf(d,weekStartDow);if(!groups.has(ws))groups.set(ws,[]);groups.get(ws).push(d);});
  }
  const weekOt=[];let sumD2=0;
  [...groups.keys()].sort().forEach(ws=>{
    const l=groups.get(ws);
    const sw=l.reduce((a,d)=>a+W(d)-d1(d),0);
    const ss=l.reduce((a,d)=>a+S(d),0);
    const v=isA?Math.max(0,sw-Math.max(ss,LEGAL_WEEKLY_MIN)):isB?Math.max(0,sw-LEGAL_WEEKLY_MIN):0;
    const inM=l.filter(d=>d.slice(0,7)===ym);
    const last=inM[inM.length-1]||null;
    weekOt.push({weekStart:ws,dates:l.slice(),min:v,lastDate:last});
    if(v>0&&last){perDay[last]=(perDay[last]||0)+v;}
    sumD2+=v;
  });
  const sumD1=monthDates.reduce((a,d)=>a+d1(d),0);
  const monthRest=monthDates.reduce((a,d)=>a+W(d)-d1(d),0)-sumD2;
  const d3=isA?Math.max(0,monthRest-Math.max(0,Number(monthFrameMin)||0)):0;
  if(d3>0&&monthDates.length){const ld=monthDates[monthDates.length-1];perDay[ld]=(perDay[ld]||0)+d3;}
  const otMin=sumD1+sumD2+d3;
  const nightDates=monthDates.filter(d=>(Number((byDate.get(d)||{}).nightMin)||0)>0);
  const nightMin=nightDates.reduce((a,d)=>a+(Number(byDate.get(d).nightMin)||0),0);
  const legalInMonth=legal.dates.filter(d=>d.slice(0,7)===ym);
  const legalHolidayMin=legalInMonth.reduce((a,d)=>a+Math.max(0,Number((byDate.get(d)||{}).workMin)||0),0);
  const legalHolidayNightMin=legalInMonth.reduce((a,d)=>a+Math.max(0,Number((byDate.get(d)||{}).nightMin)||0),0);
  // この月の合計（P6b の賃金計算の入力）。実労働は法定休日の日も含めた実働、所定はその日の確定シフトの実働、
  // 不就労（欠勤・遅刻・早退）は resolveActualDay の absentMin
  const sumM=f=>monthDates.reduce((a,d)=>a+Math.max(0,Number((byDate.get(d)||{})[f])||0),0);
  return{system,workMin:sumM("workMin"),scheduledMin:sumM("scheduledMin"),absentMin:sumM("absentMin"),
    dayOverMin:sumD1,weekOverMin:sumD2,monthOverMin:d3,otMin,
    over60Min:Math.max(0,otMin-OVER60_THRESHOLD_MIN),
    nightMin,nightDates,legalHolidayMin,legalHolidayNightMin,legalHolidayDates:legalInMonth,
    legalHolidayManual:legal.manual.filter(d=>d.slice(0,7)===ym),
    undeterminedWeeks:legal.undeterminedWeeks,dayOt,weekOt,perDay};
}
// 36協定の単月100h・複数月平均80hは**時間外＋法定休日労働**で比べる（§4.4）。時間
function premiumAgreementH(b){return b?excelRound(((Number(b.otMin)||0)+(Number(b.legalHolidayMin)||0))/60,2):0;}
// 労務確認パネルに出す割増の該当日（2026-09-30・P5）。dates は選択中の期間の日（日に帰属する判定はこの範囲で数える）。
// 要修正ではない（総括判定の OVERALL_FIX_KEYS に入れない）。判定対象外（none）は出さない。
const PREMIUM_FINDING_KEYS=["p5DayOt","p5WeekOt","p5Night","p5LegalHoliday","p5Over60"];
function premiumFindingsFor(b,o){
  const {system=null,dates=[]}=o||{};
  if(!b||(system!=="A"&&system!=="B"))return[];
  const inP=new Set(dates||[]);
  const out=[];
  const dd=Object.keys(b.dayOt||{}).filter(d=>inP.has(d)).sort();
  if(dd.length)out.push({key:"p5DayOt",label:`日の時間外${dd.length}日${laborFindingDatesLabel(dd)}`});
  const ww=(b.weekOt||[]).filter(w=>w.min>0&&w.dates.some(d=>inP.has(d)));
  if(ww.length){
    const lab=ww.map(w=>{const a=w.dates.filter(d=>d.slice(0,7)===String(w.lastDate||"").slice(0,7));
      const f=pd(a[0]||w.dates[0]).getDate(),l=pd(a[a.length-1]||w.dates[w.dates.length-1]).getDate();return`${f}〜${l}`;});
    out.push({key:"p5WeekOt",label:`週の時間外（${lab.join("・")}）`});
  }
  const nd=(b.nightDates||[]).filter(d=>inP.has(d));
  if(nd.length)out.push({key:"p5Night",label:`深夜${nd.length}日${laborFindingDatesLabel(nd)}`});
  const ld=(b.legalHolidayDates||[]).filter(d=>inP.has(d));
  if(ld.length)out.push({key:"p5LegalHoliday",label:`法定休日労働${ld.length}日${laborFindingDatesLabel(ld)}`});
  if(b.over60Min>0)out.push({key:"p5Over60",label:`月60h超 ${fmtMin(b.over60Min)}`});
  return out;
}

// シフト作成タブの1日の入力（P5）。own は自店の resolveActualDay、helpers は helperActualDaysOn の戻り値、
// kind は週の休みと同じ dayRestKindOf（他店で働いた日は "work"）。休日＝公休・空欄で、実績で働いた日・欠勤の日は休日にしない。
// データの無い日は rest=null（その週の法定休日は判定しない）。unread は行き先の確定済みの期間の実績を読めていない日
function premiumDayInput(o){
  const {date,own,helpers=[],hasData=true,kind="rest"}=o||{};
  const hs=helpers||[];const ow=own||{};
  const sum=f=>hs.reduce((t,e)=>t+f(e.day),0);
  const workMin=(Number(ow.workMin)||0)+sum(d=>Number(d.workMin)||0);
  return{date,workMin,scheduledMin:(Number(ow.scheduledWorkMin)||0)+sum(d=>Number(d.scheduledWorkMin)||0),
    nightMin:nightMinutesOf(ow)+sum(d=>nightMinutesOf(d)),
    absentMin:(Number(ow.absentMin)||0)+sum(d=>Number(d.absentMin)||0),
    manualLegal:!!ow.isLegalHoliday||hs.some(e=>e.day.isLegalHoliday),
    rest:!hasData?null:(workMin>0||ow.absent||hs.some(e=>e.day.absent))?false:kind==="rest",
    unread:hs.some(e=>e.actualUnread),hasActual:!!ow.hasActual||hs.some(e=>e.day.hasActual)};
}
// その月の割増の計算に渡す日（月の全日＋法定休日の判定のため前後の週の日）
function premiumMonthDates(ym,weekStartDow){
  const n=daysInMonthOf(ym);if(!n)return[];
  const first=premiumWeekStartOf(`${ym}-01`,weekStartDow);
  const end=addDays(premiumWeekStartOf(`${ym}-${String(n).padStart(2,"0")}`,weekStartDow),6);
  const out=[];for(let d=first;d<=end;d=addDays(d,1))out.push(d);
  return out;
}
// 1人・1か月の割増（シフト作成タブの入口）。dayOf(日付) は premiumDayInput の戻り値。週・総枠は settings の労務設定。
// otH は時間外（時間・B制の月の残業）、agH は単月100h・平均80h 用の時間外＋法定休日労働、unread は他店の実績を読めていない
function premiumMonthOf(o){
  const {ym,system,settings,dayOf}=o||{};
  const ls=laborSettingsOf(settings);
  const days=premiumMonthDates(ym,ls.weekStartDow).map(dayOf);
  const b=premiumBreakdownOf({system,days,ym,weekStartDow:ls.weekStartDow,splitAtMonthEdge:ls.weekSplitAtMonthEdge,
    monthFrameMin:laborMonthFrame(settings,ym).baseMin});
  return{...b,otH:excelRound(b.otMin/60,2),agH:premiumAgreementH(b),unread:days.some(x=>x&&String(x.date).slice(0,7)===ym&&x.unread)};
}
// 労務判定表の割増の行（P5）の1セル。kind: "ot"（時間外①②③）| "night" | "legal" | "over60" | "bPlan"（B制の残業予定）。
// l は laborByStaff の1人分（prem・monthCovered・sys・periodOtB・monthOtB）。ctx: {pendingReason, actualsReadable, monthLabel}。
// 暦月の値。月が埋まっていない・他店の実績を読めていないときは先頭に「＋」を付けて淡色（途中の値）
function premiumRowCell(kind,l,ctx){
  const c=ctx||{};
  if(!l||!l.prem)return{};
  const b=l.prem;
  const part=!l.monthCovered||!!b.unread;
  const note=(b.unread?"／他店の実績を読み込めていません（その店舗のオーナーとして開くと合算されます）":"")
    +(!l.monthCovered&&c.pendingReason?`／${c.pendingReason}`:"")
    +(c.actualsReadable?"／実績（入力の無い日は確定シフト）で計算":"／この端末は実績を読めないため確定シフトで計算");
  const pre=part?"＋":"";const dim="var(--c-text3)";
  const days=ds=>ds.map(d=>Number(d.slice(8,10))+"日").join("・");
  if(kind==="bPlan"){
    const ph=excelRound((Number(l.periodOtB)||0)/60,2);
    if(!part&&!(l.periodOtB>0))return{};
    return{label:`${pre}${ph}h`,color:part?dim:"#B8860B",title:`この期間 ${ph}h ／ ${c.monthLabel||""}月の合計 ${l.monthOtB}h`
      +`（1日8時間超 ${fmtMin(b.dayOverMin)}・週40時間超 ${fmtMin(b.weekOverMin)}）`+note};
  }
  if(kind==="ot"){
    if(!part&&!(b.otMin>0))return{};
    const br=l.sys==="A"?`①日 ${fmtMin(b.dayOverMin)}／②週 ${fmtMin(b.weekOverMin)}／③月 ${fmtMin(b.monthOverMin)}`
      :`①日8時間超 ${fmtMin(b.dayOverMin)}／②週40時間超 ${fmtMin(b.weekOverMin)}`;
    return{label:`${pre}${fmtMin(b.otMin)}`,color:part?dim:b.otMin>0?"#B8860B":"var(--c-text2)",
      title:`月の時間外 ${fmtMin(b.otMin)}（${br}。法定休日の労働は含めない）`+note};
  }
  if(kind==="night"){
    if(!(b.nightMin>0))return{};
    return{label:`${pre}${fmtMin(b.nightMin)}`,color:part?dim:"var(--c-text2)",
      title:`22:00〜翌5:00 の労働 ${fmtMin(b.nightMin)}（${days(b.nightDates)}）`
        +(b.legalHolidayNightMin>0?`／うち法定休日 ${fmtMin(b.legalHolidayNightMin)}`:"")+note};
  }
  if(kind==="legal"){
    if(!(b.legalHolidayMin>0))return{};
    const auto=b.legalHolidayDates.some(d=>!b.legalHolidayManual.includes(d));
    return{label:`${pre}${fmtMin(b.legalHolidayMin)}`,color:part?dim:"var(--c-text2)",
      title:`法定休日の労働 ${fmtMin(b.legalHolidayMin)}（${days(b.legalHolidayDates)}）`
        +(auto?"／休日が1日も無い週の最後の勤務日":"")+(b.legalHolidayManual.length?"／実績で指定した日":"")+"。時間外には含めません"+note};
  }
  if(kind==="over60"){
    if(!(b.over60Min>0))return{};
    return{label:`${pre}${fmtMin(b.over60Min)}`,color:part?dim:"#e53935",bold:!part,
      title:`月の時間外 ${fmtMin(b.otMin)} のうち60時間を超えた分（法定休日の労働は含めない）`+note};
  }
  return{};
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
// 長さ方式の段の決め方（2026-09-30・P3.5a）。settings.breakLength に
//   basis: "work"（既定・しきい値を実働＝拘束−控除で見る）| "binding"（拘束で見る）
//   tiers: [{overMin, breakMin, inclusive}]（その時間を超えたら／以上なら breakMin 分）
// を足した。tiers が無ければ従来の2段（実働8h超→over8Min／6h超→over6Min・どちらも「超」）で、
// **basis も tiers も持たない店舗は従来と1分も変わらない**。しきい値の値はすべて店舗の設定で、コードは持たない。
const BREAK_LENGTH_BASES=["work","binding"];
const BREAK_LENGTH_BASIS_LABELS={work:"引いたあとの実働で判定",binding:"拘束時間（出勤〜退勤）で判定"};
const BREAK_LENGTH_TIERS_MAX=5;
function _breakTiersOf(raw){
  if(!Array.isArray(raw)&&!(raw&&typeof raw==="object"))return null;
  const list=(Array.isArray(raw)?raw:Object.values(raw)).map(t=>{
    if(!t||typeof t!=="object")return null;
    const o=Number(t.overMin),b=Number(t.breakMin);
    if(!(Number.isFinite(o)&&o>=0&&Number.isFinite(b)&&b>=0))return null;
    return{overMin:Math.round(o),breakMin:Math.round(b),inclusive:t.inclusive===true};
  }).filter(Boolean).slice(0,BREAK_LENGTH_TIERS_MAX);
  if(!list.length)return null;
  return list.sort((a,b)=>b.overMin-a.overMin||b.breakMin-a.breakMin);
}
// 長さ方式の規則を1つにまとめて返す。custom＝店舗が段を自分で決めているか（UI の出し分け用）。
function breakLengthRuleOf(settings){
  const raw=(settings&&settings.breakLength)||{};
  const basis=BREAK_LENGTH_BASES.indexOf(raw.basis)>=0?raw.basis:"work";
  const custom=_breakTiersOf(raw.tiers);
  if(custom)return{basis,tiers:custom,custom:true};
  const L=breakLengthOf(settings);
  // 従来の2段。しきい値は法定（実働8h・6h）で、休憩の長さだけが設定値。
  return{basis,custom:false,tiers:[{overMin:LEGAL_DAILY_MIN,breakMin:L.over8Min,inclusive:false},
    {overMin:BREAK_SHORT_TARGET_MIN,breakMin:L.over6Min,inclusive:false}]};
}
// 長さ方式で引く分。basis:"work" は「引いたあとの実働がその段を超える（以上）」段、
// basis:"binding" は「拘束がその段を超える（以上）」段のうち、しきい値のいちばん高いものを使う。
function _lengthBreakMin(settings,shift,staffName){
  const bind=shiftBindingMin(shift,settings,staffName);
  const rule=breakLengthRuleOf(settings);
  const hit=rule.tiers.find(t=>{
    const v=rule.basis==="binding"?bind:bind-t.breakMin;
    return t.inclusive?v>=t.overMin:v>t.overMin;
  });
  return hit?hit.breakMin:0;
}
// 休憩の合計分（合成の帯も実在の帯も同じ式で足す）。
function breakMinutesOf(breaks){
  const t=x=>{const p=String(x).split(":").map(Number);return p[0]*60+p[1];};
  return(breaks||[]).reduce((a,br)=>a+(br&&br.start&&br.end?Math.max(0,t(br.end)-t(br.start)):0),0);
}
// その日の休憩の出どころ（詳細モーダルの「自動／手動」表示用）。
// source: "manual"（日別の上書き）| "length"（長さ方式）| "band"（時間帯方式）。
// autoMin は上書きを外したときの分＝「自動に戻す」を押すとこうなる値。
function breakDecisionOf(settings,dateStr,staffName,shift){
  if(!shift||shift.status!=="work")return{source:null,min:0,autoMin:0};
  const auto={...shift};delete auto.adjustedBreak;
  const autoMin=breakMinutesOf(getBreaksFor(settings,dateStr,staffName,auto));
  // 長さ方式でも属性ありの休憩が当たる日は時間帯（getBreaksFor ② と同じ判定）
  const autoSource=breakModeOf(settings)==="length"&&!_lengthTaggedBreaks(settings,dateStr,staffName,auto).length?"length":"band";
  const adj=Number(shift.adjustedBreak);
  // 判定は getBreaksFor の①と同じ式（食い違うと「手動」と出ているのに自動の値で計算される）
  if(Number.isFinite(adj)&&adj>=0)
    return{source:"manual",min:breakMinutesOf(getBreaksFor(settings,dateStr,staffName,shift)),autoMin,autoSource};
  return{source:autoSource,min:autoMin,autoMin,autoSource};
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
// 休暇はセルの色ではなく**セルに種別名を出して**見せる（2026-09-26 ユーザー指示）。
// **種別名を出すセルには斜線も引かない**（文字と斜線が重なって読めなくなるため。同日ユーザー指示）。
// 入力欄の value にそのまま入れるので、表示のまま blur しても保存されないよう
// handleBlur が「表示中の種別名と同じ入力は何もしない」で受ける（app-admin.js）。
const LEAVE_TYPE_CELL_TEXT={public:"公休",paid:"有給",ceremony:"慶弔"};
// **休暇種別は帯（出勤セル=ランチ／退勤セル=ディナー）ごとに持つ**（2026-09-26 ユーザー指示）。
// 有給は半日単位で取れるので、打ち込んだセルにだけ種別名が出る。`shift.leaveTypes={start,end}`。
// 旧い形（日単位の `shift.leaveType`）も読む——同日に一度その形で書いたデータがあるため。
function leaveFieldsOf(shift){
  const m=(shift&&shift.leaveTypes)||null;
  const one=shift&&LEAVE_TYPES.indexOf(shift.leaveType)>=0?shift.leaveType:null;
  const pick=f=>{
    const v=m&&m[f];
    if(LEAVE_TYPES.indexOf(v)>=0)return v;
    return m?null:one;   // leaveTypes を持つ日は leaveType へ落とさない（片側だけの指定を潰さない）
  };
  return{start:pick("start"),end:pick("end")};
}
// **セルに文字を出すのはその帯に種別が入っているときだけ**。`/`（休み希望・旧 y）は種別を持たないので
// 従来どおり斜線のままで文字を出さない。一方 leaveTypeOf は「週の休みに数えるか」を決める判定で、
// 終日の休み希望も公休として扱い続ける——見せ方（ここ）と数え方は別の問いなので同じ関数で答えない。
function leaveCellTextOf(shift,field){
  const lv=leaveFieldsOf(shift);
  const t=field?lv[field]:(lv.start&&lv.start===lv.end?lv.start:null);
  return t?LEAVE_TYPE_CELL_TEXT[t]:"";
}
// 有給・慶弔の日数（半日＝0.5）。公休は日単位なのでここでは数えない。
function leaveHalfDaysOf(shift){
  const lv=leaveFieldsOf(shift);
  const c=t=>((lv.start===t?0.5:0)+(lv.end===t?0.5:0));
  return{paid:c("paid"),ceremony:c("ceremony")};
}
// その日の休暇種別。**本機能の導入前に入力済みの終日の休み希望（旧 y・leaveType なし）は公休として扱う**
// ——データ移行はしない。これをしないと既存店舗で `×休なし` の誤警告が出る。
function leaveTypeOf(shift){
  if(!shift)return null;
  const lv=leaveFieldsOf(shift);
  if(lv.start&&lv.start===lv.end)return lv.start;   // 終日ぶん指定されている
  if(lv.start||lv.end)return null;                  // 半日だけ＝日単位の種別は決まらない
  const ar=shift.adminRest||{};
  if(ar.start&&ar.end)return"public";        // 終日の休み希望 /（斜線も公休として数える）
  if(shift.status==="holiday")return"public"; // スタッフ提出の終日休み
  return null;
}
// 週の休みの判定に使う日の種類（S-5・判断8）。
//  rest   公休（終日の休み希望 /・提出の休み）と**無記入** → 週の休みに数える
//  work   出勤
//  leave  有給・慶弔 → 休みに数えない（出勤日に取る休暇のため）。ただし「データはある」
//  nodata その日を含む期間が無い／購読の窓の外 → その週は数え切れないので `＋休n`（下記）
function dayRestKindOf(shift,hasData){
  if(hasData===false)return"nodata";
  if(!shift)return"rest";
  // 半日の有給・慶弔は**その日を出勤日のまま**にする（残り半分を働くため）。
  // 週の休みに数えないのは終日ぶん取ったときだけ。
  const hasWork=shift.status==="work"
    &&!!(effShiftStart(shift)||effShiftEnd(shift)||(shift.extraStart&&shift.extraEnd));
  if(hasWork)return"work";
  const hd=leaveHalfDaysOf(shift);
  if(hd.paid>0||hd.ceremony>0)return"leave";
  const lt=leaveTypeOf(shift);
  if(lt==="public")return"rest";
  if(shift.status!=="work")return"rest";
  return"rest";
}
// 週（7日）の状態（S-5）。**シフト表の空欄は公休として数える**（2026-09-26 ユーザー指示）。
// 以前は「全日が無記入の週」を評価対象外（skip）にしていたが、空欄が公休である以上その週は
// 休7 であって「数えられない週」ではない。
// データそのものが無い日（期間が無い・購読の窓の外）がある週も、**要確認で止めずに
// データのある日だけで数えた実数を返す**（2026-09-26 ユーザー指示で「要確認」から変更）。
// 不明な日が休みに転ぶ可能性があるので count は下限で、**先頭に `＋`** を付けて途中であることを示す
// （`＋` は必ず前に置く。2026-09-26 ユーザー指示。数値の後ろに置くと単位のように読めるため）
// （労務判定表の年計が既に使っている表記に揃える）。
// **揃わない週の key を "none" にしてはいけない**——総括判定は key==="none"（×休なし）を
// 週1休の違反として要修正に直結させるので、3日出勤・4日不明の週を ×休なし と呼ぶと
// 誤って要修正になる。**表示の実数（count）と週1休の判定（key）は別の問いで、
// 判定は7日揃った週だけで行う。**
function weekRestStateOf(kinds){
  const k=kinds||[];
  const n=k.filter(x=>x==="rest").length;
  const missing=k.filter(x=>x==="nodata").length;
  if(missing>0)return{key:"partial",label:`＋休${n}`,count:n,missing};
  if(n===0)return{key:"none",label:"×休なし",count:0,missing:0};
  return{key:"ok",label:`休${n}`,count:n,missing:0};
}
// ===== 特定技能の週の公休（2026-10-01 ユーザー指示）=====
// 特定技能の人は週1回の公休が要り、**週の途中で月をまたぐときは月末側と月初側に各1回（計2回）**要る。
// 対象かどうかは属性の表示名に「特定技能」を含むかで決める（企業属性 co_* を含む・労働時間制が判定対象外の人は除く）。
// **判定をこの1本に集めてある**——将来、属性に明示のフラグを持たせるときはここだけ直す。
const SKILLED_WORKER_ATTR_KEYWORD="特定技能";
function isSkilledWorkerAttr(settings,name){
  const id=((settings&&settings.staffAttributes)||{})[name];
  if(!id)return false;
  const t=((settings&&settings.staffTypeLimits)||{})[id];
  const nm=BUILTIN_TYPES.includes(id)?STAFF_TYPE_LABELS[id]:(t&&typeof t==="object"?String(t.name||""):"");
  if(!nm.includes(SKILLED_WORKER_ATTR_KEYWORD))return false;
  return laborSystemForStaff(settings,name)!=="none";
}
// 特定技能の人の週（7日・kinds は dayRestKindOf の値、dates は同じ並びの "YYYY-MM-DD"）。
// 週の中の日を年月で分け、**月ごとに公休（rest）が1日以上**あるかを見る。月をまたがない週は従来の週1休と同じ。
// nodata を含む月の側は判定しない（既存の `＋休n` と同じく、数え切れない側では違反と呼ばない）。
// 判定した側に公休0の月があれば違反: またがない週は key "none"（×休なし・従来と同じ）、またぐ週は "skilledNone"（×休n）。
// sides は [{ym, rest, missing}]（title に「9月側 0日・10月側 1日」と出すため）。
function skilledWeekRestStateOf(kinds,dates){
  const base=weekRestStateOf(kinds);
  const k=kinds||[],ds=dates||[];
  const byYm=[];
  k.forEach((x,i)=>{
    const ym=String(ds[i]||"").slice(0,7);
    let g=byYm.find(e=>e.ym===ym);
    if(!g){g={ym,rest:0,missing:0};byYm.push(g);}
    if(x==="rest")g.rest++;else if(x==="nodata")g.missing++;
  });
  const cross=byYm.length>1;
  const short=byYm.filter(g=>g.missing===0&&g.rest===0);
  if(!cross){
    return{...base,crossMonth:false,sides:byYm};
  }
  if(short.length>0)return{key:"skilledNone",label:`×休${base.count}`,count:base.count,missing:base.missing,crossMonth:true,sides:byYm};
  if(base.missing>0)return{...base,crossMonth:true,sides:byYm};
  return{...base,key:"ok",crossMonth:true,sides:byYm};
}
// 違反の週（skilledWeekRestStateOf の key が none / skilledNone）。労務の確認の「特定技能の週の公休不足」に使う
function isSkilledWeekRestShort(st){return!!st&&(st.key==="none"||st.key==="skilledNone");}
// title 用の内訳「9月側 0日・10月側 1日」（月をまたぐ週だけ）
function skilledWeekSidesLabel(st){
  if(!st||!st.crossMonth||!Array.isArray(st.sides))return"";
  return st.sides.map(g=>`${Number(g.ym.slice(5,7))}月側 ${g.missing>0?`＋${g.rest}`:g.rest}日`).join("・");
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
  ["workMin","publicOff"].forEach(k=>{const v=Math.round(Number(t&&t[k])||0);if(v>0)o[k]=v;});
  // 有給・慶弔は半日（0.5）があるので小数1桁で持つ
  ["paid","ceremony"].forEach(k=>{const v=excelRound(Number(t&&t[k])||0,1);if(v>0)o[k]=v;});
  // 月の残業予定（時間・小数2桁）。**その月の最後の期間にだけ載せる**（半月運用で2重に数えない）。
  const ot=Number(t&&t.monthOtH);
  if(Number.isFinite(ot)&&ot>0)o.monthOtH=excelRound(ot,2);
  // 単月100h・複数月平均80h 用の「時間外＋法定休日労働」（P5）。monthOtH と同じく月の最後の期間にだけ載せる
  const ag=Number(t&&t.monthAgH);
  if(Number.isFinite(ag)&&ag>0)o.monthAgH=excelRound(ag,2);
  return Object.keys(o).length?o:null;
}
function laborTotalsEqual(a,b){
  const ka=Object.keys(a||{}),kb=Object.keys(b||{});
  if(ka.length!==kb.length)return false;
  return ka.every(n=>{
    const x=(a||{})[n]||{},y=(b||{})[n]||{};
    return["workMin","paid","publicOff","ceremony","monthOtH","monthAgH"].every(k=>(Number(x[k])||0)===(Number(y[k])||0));
  });
}
// 年度の合計。period.laborTotals（凍結時点の値）を優先し、無い期間は live(p) で数える。
// live が null を返した期間は missingPeriodIds に積む＝「読めていない期間がある」と画面に出せる。
// preferLive=true のときは逆に**提出を読めている期間は live を優先**し、凍結値は読めない期間の
// 代わりにだけ使う（2026-09-29 ユーザー指示「年間の勤務時間は実データで」）。凍結値は期間の
// 最終日で止まるので、終了後に直した提出が年計に届かない。
function yearLaborSummary(periods,name,fy,startMonth,live,preferLive=false){
  let workMin=0,paid=0,publicOff=0,ceremony=0;const missing=[];
  (periods||[]).forEach(p=>{
    if(!p||!p.startDate)return;
    if(fiscalYearOf(p.startDate,startMonth)!==fy)return;
    const stored=p.laborTotals&&typeof p.laborTotals==="object"?p.laborTotals[name]:null;
    const st=(stored&&typeof stored==="object")?stored:null;
    const l=preferLive?((live&&live(p))||st):(st||(live?live(p):null));
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
  {key:"x",kind:"suffix",usage:"9x",label:"ヘルプ（カウント外）",desc:"時間帯別出勤人数・店舗間重複・ポジション判定から外す。出勤セルに付けるとランチ帯（〜17時）、退勤セルに付けるとディナー帯（17時〜）だけ、両方に付けると終日（片方の帯しかないシフトでは反対側のセルの x も有効）。x単体入力も同じ扱い（コマンド以外の文字だけの入力はメモとしてそのまま表示される）",color:"#FFF3B0"},
  {key:"/",kind:"rest",aliases:["／"],usage:"/",label:"休み希望",desc:"セルを休み扱いにして斜線を表示する（出勤セル=ランチ帯・退勤セル=ディナー帯・両方=終日）。**表示は斜線のまま**で、終日でも「公休」の文字は出ない（文字を出したいときは ko を使う）。週の休みには終日の / も公休として数える。もう一度 / で解除、時間を入力すると出勤に上書き。全角の「／」でも入力できる（「y」「休」は休みにならず、メモとして残る）",hatch:true},
  {key:"ko",kind:"rest",leaveType:"public",usage:"ko",label:"公休（終日）",desc:"その日を終日の公休にする（セルに「公休」と表示され、斜線は引かれない）。もう一度 ko で解除、または**セルの「公休」の文字を消しても解除**（終日なので出勤・退勤どちらのセルから消しても両方外れる）。**週の休みに数える**（何も入力していない日・終日の y も同じく公休として数える）",hatch:false},
  {key:"yu",kind:"rest",leaveType:"paid",usage:"yu",label:"有給（終日）",desc:"**打ち込んだセルだけ**を有給にする（出勤セル=ランチ帯・退勤セル=ディナー帯。有給は半日単位で取れる）。そのセルに「有給」と表示される。もう一度 yu で解除、または**そのセルの「有給」の文字を消しても解除**。**週の休みには数えず**（有給は出勤日に取る休暇のため、有給の週も別に公休が1日以上要る）、実働にも入らない。管理者のみ入力できる",color:"#DCEBFB"},
  {key:"ke",kind:"rest",leaveType:"ceremony",usage:"ke",label:"慶弔（終日）",desc:"**打ち込んだセルだけ**を慶弔休暇にする（有給と同じく半日単位）。そのセルに「慶弔」と表示される。もう一度 ke で解除、または**そのセルの「慶弔」の文字を消しても解除**。有給と同じく週の休みには数えず、実働にも入らない。管理者のみ入力できる",color:"#FADCE6"},
  {key:"締",kind:"fixed",usage:"16k締",label:"締め（東通り店専用・追加出勤）",desc:"出勤・退勤どちらのセルに単独入力、または数字・h/k/x・他店舗略称など他のコマンドと組み合わせて（前後どちらでも可）入力しても、23:00〜25:00(翌1:00)を主シフトとは別の追加出勤として計上する（例: 出勤13・退勤17締 → 13〜17時と23〜25時の2出勤。出勤16k締 → キッチン入りかつ追加出勤）。鷄えん東通り店でのみ有効",start:"23:00",end:"25:00"},
];
// セル背景色・記号の意味（cellBgForとレジェンドの共通ソース）
const CELL_COLOR_LEGEND=[
  {key:"changed",color:"rgba(52,199,89,.30)",label:"変更マーク",desc:"セルをトリプルクリック（スマホはトリプルタップ）でオン/オフ。確定後に変更したシフトの目印"},
  {key:"dup",color:"rgba(255,71,87,.35)",label:"店舗間シフト重複",desc:"企業連携している他店舗のシフトと勤務時間が重なっている"},
  {key:"note",color:"#FFF3B0",label:"特記あり",desc:"h・k・x・他店舗略称などのサフィックスが付いたセル"},
  {key:"rest",hatch:true,label:"休み希望（斜線）",desc:"スタッフが提出した休み希望、または管理者が / で入力した休み"},
  {key:"posErr",color:"rgba(250,204,21,0.35)",label:"ポジション不足",desc:"必要ポジション設定に対して出勤人数・ポジションが不足しているランチ/ディナーの行"},
  {key:"timeErr",color:"rgba(190,24,93,.25)",label:"時刻の入力ミス",desc:"退勤が出勤以前になっている。深夜は 25:00・26:00 のように24時を超える表記で入力する"},
  // 判定対象外（応援・外部）の長時間の日（2026-09-30・P3.5c）。依頼どおり赤系で、店舗間重複（dup）の赤より濃く暗い赤にして見分ける。
  // 店舗トグル（laborSettings.highlightExternalOver8h）がオンのときだけ付く。要修正ではない（労務判定の表・総括には出ない）。
  {key:"externalOver",color:"rgba(185,28,28,.45)",label:"外部の長時間",desc:"労働時間制が「判定対象外（応援・外部）」の人の実働が店舗で設定したしきい値を超える日（設定でオンにした店舗だけ）。派遣元の36協定に配慮するための目印で、労務判定の表と総括には出ない"},
  {key:"laborErr",color:"rgba(139,92,246,.28)",label:"労務の要修正",desc:"1日12時間を超える日、または1日の残業が36協定の上限を超える日。他の労務の指摘（4h未満・休憩不足など）は色を付けず「労務の確認が必要です」にだけ出る"},
];
// 休みコマンド判定（セル全体が / ／ ko yu ke のとき。時間付きの「9/」は通常サフィックス＝メモ扱い）。
// **レジストリ駆動**にしてあるので kind:"rest" を足せば判定・予約語（isReservedShopAbbr）に自動で乗る。
// 休み希望は 2026-09-30 に y から / へ変えた（計画書 §3.9・決定 #16）。y・ｙ・休 は別名に残さない。
function restCommandOf(raw){
  const s=String(raw==null?"":raw).trim().toLowerCase();
  if(!s)return null;
  // 長いキーを先に見る（キー同士が前方一致しても短い方に食われないように）。別名（全角／）も同じ扱い。
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
// - kind:"suffix"(h/k/x)・kind:"rest"(/ ／ ko yu ke) は **完全一致** だけが衝突する
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
function _isPlainObj(v){return!!v&&typeof v==="object"&&!Array.isArray(v);}
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
      // 履歴（period.history＝{キー: 記録}）は**記録1件ずつ**書く（2026-09-30・P3）。フィールドごと書くと、
      // 他の端末が同じ時刻に足した記録をこの端末の古い一覧で上書きして消す（履歴は上書きしない約束）。
      if(k==="history"&&_isPlainObj(next[k])&&(prev[k]==null||_isPlainObj(prev[k]))){
        const ph=prev[k]||{};
        new Set([...Object.keys(next[k]),...Object.keys(ph)]).forEach(hk=>{
          if(_periodFieldEqual(next[k][hk],ph[hk]))return;
          out[`${id}/history/${hk}`]=(hk in next[k])?next[k][hk]:null;
        });
        return;
      }
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
  "breakTimes","candidates","weekdayCandidates","laborSettings","breakMode","breakLength","paidLeaveGranted",
  "staffHomeShop"];
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
// **確定（period.confirmation）した期間も終了前から写しを採用する**（2026-09-30・P3・計画書 §3.5 の v8 注記 2）。
// 確定の瞬間に写しを書くので、確定後のマスタ変更（スタッフ・属性・退勤延長）はその期間に流れ込まない。
function resolvePeriodMaster(period,staffList,settings,todayStr){
  const snap=period&&period.snapshot;
  const rawSl=snap&&snap.staffList;
  const sl=Array.isArray(rawSl)?rawSl:(rawSl&&typeof rawSl==="object"?Object.values(rawSl):null);
  if(!(isPeriodEnded(period,todayStr)||isPeriodConfirmed(period))||!sl)return{staffList:mergeKeepStaff(staffList,period),settings:applyKeepAttrs(settings,period),locked:false};
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
const STAFF_KEYED_SETTING_MAPS=["staffColors","staffAttributes","staffNumbers","staffPositions","staffAliases","staffWorkplaces","staffHidden","paidLeaveGranted","staffHomeShop"];
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
    // 凍結時点の労務の合計も名前がキー。移さないと、終わった期間の年度累計・有給の消化・
    // 月の残業予定が「読めていない期間」に落ち、有給残が多く出て36協定の年判定が月を見落とす。
    const lt=np&&np.laborTotals;
    if(lt&&typeof lt==="object"&&lt[oldName]!==undefined){
      changed=true;
      np={...np,laborTotals:_renameMapKey(lt,oldName,newName)};
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

// ===== 企業連携の拡張（2026-09-27）=====
// 企業の設定は正本 companies/{id}/pub/config を Cloud Functions が各店舗の shops/{shopId}/company へ
// 写す（ミラー）。店舗側はミラーだけを読む（companies 配下はクライアントから書けず、読みも企業uidと
// 作成者に限られるため）。企業設定＞店舗設定の重ね合わせは App の effectiveSettings で**1回だけ**
// 行い（applyCompanySettings）、保存経路で企業が決めたキーを剥がす（stripCompanySettings）。
// settings は全体 set() で保存されるので、剥がさないと企業の値が店舗の「自分の設定」として
// 永続化され、企業が後で値を外しても店舗に最後の値が残る。
//
// cs の意味: null/undefined＝企業に属していない（またはミラー未着）。{}＝企業に属していて何も決めていない。
// 企業が消した属性を「未設定」へ倒すのは後者のときだけ（ミラー未着の一瞬に割当を落とさないため）。
const COMPANY_LABOR_KEYS=Object.keys(DEFAULT_LABOR_SETTINGS);
const COMPANY_LIMIT_KEYS=(()=>{const k=["laborSystem","otProrate","customDays","customHours","customHoursMin"];STAFF_LIMIT_WINDOWS.forEach(w=>{k.push(w.key,w.minKey);if(w.otKey)k.push(w.otKey);});return k;})();
const COMPANY_ATTR_ID_RE=/^co_[A-Za-z0-9]{8}$/;
function isCompanyAttrId(id){return typeof id==="string"&&COMPANY_ATTR_ID_RE.test(id);}
// **genSecureId を使わない**。あちらの文字集合は記号13種を含み、8文字すべてが英数字になるのは約27%。
// Cloud Functions は同じ正規表現で検証するので、使うと約7割の属性が黙って捨てられる。
function genCompanyAttrId(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr=new Uint8Array(8);
  crypto.getRandomValues(arr);
  return"co_"+Array.from(arr,b=>chars[b%chars.length]).join("");
}
// 労務設定はキーが有れば 0 も企業の決定（agreementDailyOtMin=0 は「残業を前提にしない」運用）。
function _coLaborSet(v){return v!==undefined&&v!==null&&v!==""&&Number.isFinite(Number(v))&&Number(v)>=0;}
// 勤務時間の上限・下限は既存の意味どおり 0＝未設定（staffLimitOf と同じ規則）。laborSystem は "" が未設定。
// otProrate（按分窓・P3.5b）は窓が正しいオブジェクトなら企業の決定。
function _coLimitSet(k,v){return k==="laborSystem"?LABOR_SYSTEMS.indexOf(v)>=0:k==="otProrate"?!!otProrateOf(v):Number(v)>0;}
function _coLimitVal(k,v){return k==="laborSystem"?v:k==="otProrate"?otProrateOf(v):Number(v);}
function _coObj(v){return v&&typeof v==="object"?v:null;}
function applyCompanySettings(settings,cs){
  const s=settings||{};
  const c=_coObj(cs);
  const cLabor=c&&_coObj(c.laborSettings);
  const cStl=c&&_coObj(c.staffTypeLimits);
  const out={...s};
  let changed=false;
  if(cLabor){
    const l={...(_coObj(s.laborSettings)||{})};
    let any=false;
    COMPANY_LABOR_KEYS.forEach(k=>{if(_coLaborSet(cLabor[k])){l[k]=Math.round(Number(cLabor[k]));any=true;}});
    if(any){out.laborSettings=l;changed=true;}
  }
  const shopStl=_coObj(s.staffTypeLimits);
  // 店舗側に co_ 属性が残っていても正本は企業なので読まない（保存時に剥がしているが、念のため）
  if(cStl||(shopStl&&Object.keys(shopStl).some(isCompanyAttrId))){
    const stl={};
    Object.keys(shopStl||{}).forEach(id=>{if(!isCompanyAttrId(id))stl[id]=shopStl[id];});
    Object.keys(cStl||{}).forEach(id=>{
      // 企業が決められるのは組み込み属性と企業属性だけ（店舗の custom_ は店舗ごとに別物）
      if(!isCompanyAttrId(id)&&BUILTIN_TYPES.indexOf(id)<0)return;
      const ce=_coObj(cStl[id]);
      if(!ce)return;
      const base={...(_coObj(stl[id])||{})};
      COMPANY_LIMIT_KEYS.forEach(k=>{if(_coLimitSet(k,ce[k]))base[k]=_coLimitVal(k,ce[k]);});
      if(isCompanyAttrId(id))base.name=typeof ce.name==="string"?ce.name:"";
      stl[id]=base;
    });
    out.staffTypeLimits=stl;
    changed=true;
  }
  // 企業が消した属性を指す割当は「属性未設定」と同じ扱いにする（保存値は書き換えない）。
  // 放置すると laborSystemOf が null を返し、その人に「区分が空欄か誤り」が出る。
  const sa=_coObj(s.staffAttributes);
  if(c&&sa){
    const dead=Object.keys(sa).filter(n=>isCompanyAttrId(sa[n])&&!(cStl&&cStl[sa[n]]));
    if(dead.length){const a={...sa};dead.forEach(n=>{delete a[n];});out.staffAttributes=a;changed=true;}
  }
  return changed?out:settings;
}
// 保存直前に企業が決めているキーを落とす。**値の一致ではなくキーの支配で判定する**
// （店舗が企業と同じ値を自分で持っていても落とす＝企業が外したとき未設定に戻るのが正しい）。
function stripCompanySettings(settings,cs){
  if(!settings||typeof settings!=="object")return settings;
  const c=_coObj(cs);
  const cLabor=c&&_coObj(c.laborSettings);
  const cStl=c&&_coObj(c.staffTypeLimits);
  const out={...settings};
  let changed=false;
  const l=_coObj(settings.laborSettings);
  if(cLabor&&l){
    const nl={...l};
    let any=false;
    COMPANY_LABOR_KEYS.forEach(k=>{if(_coLaborSet(cLabor[k])&&k in nl){delete nl[k];any=true;}});
    if(any){out.laborSettings=nl;changed=true;}
  }
  const stl=_coObj(settings.staffTypeLimits);
  if(stl){
    const n={};
    let any=false;
    Object.keys(stl).forEach(id=>{
      if(isCompanyAttrId(id)){any=true;return;}
      const e=stl[id];
      const ce=cStl&&_coObj(cStl[id]);
      if(ce&&_coObj(e)){
        const ne={...e};
        let hit=false;
        COMPANY_LIMIT_KEYS.forEach(k=>{if(_coLimitSet(k,ce[k])&&k in ne){delete ne[k];hit=true;}});
        n[id]=hit?ne:e;
        if(hit)any=true;
      }else n[id]=e;
    });
    if(any){out.staffTypeLimits=n;changed=true;}
  }
  return changed?out:settings;
}
// 設定タブの表示用。企業が決めている項目を「入力欄ではなく固定表示」にするための一覧。
function companyControlledKeys(cs){
  const c=_coObj(cs);
  const labor=new Set(), limits={}, attrs=new Set();
  const cLabor=c&&_coObj(c.laborSettings);
  const cStl=c&&_coObj(c.staffTypeLimits);
  if(cLabor)COMPANY_LABOR_KEYS.forEach(k=>{if(_coLaborSet(cLabor[k]))labor.add(k);});
  if(cStl)Object.keys(cStl).forEach(id=>{
    const ce=_coObj(cStl[id]);
    if(!ce)return;
    if(isCompanyAttrId(id))attrs.add(id);
    const set=new Set();
    COMPANY_LIMIT_KEYS.forEach(k=>{if(_coLimitSet(k,ce[k]))set.add(k);});
    limits[id]=set;
  });
  return{labor,limits,attrs};
}

// 企業内の期間の対応づけ。期間IDとURLトークンは店舗ごとに別で、企業横断の期間はデータに無いので、
// 全店舗に共通する座標＝開始日と終了日の組で対応づける（企業内は同じ作成期間で運用する前提・ユーザー確認済み）。
// キーの区切りは "_"（Firebase のキーに使えない . # $ / [ ] を避ける）。
function periodRangeKey(p){return p&&p.startDate&&p.endDate?`${p.startDate}_${p.endDate}`:"";}
// 選択肢の表示名。「2026年10月前半」「2026年10月後半」「2026年10月」。どれにも当たらなければ日付の範囲。
function periodRangeLabel(startDate,endDate){
  const s=pd(startDate), e=pd(endDate);
  if(isNaN(s)||isNaN(e))return`${startDate||"?"}〜${endDate||"?"}`;
  const y=s.getFullYear(), m=s.getMonth()+1;
  if(s.getFullYear()===e.getFullYear()&&s.getMonth()===e.getMonth()){
    const last=new Date(y,s.getMonth()+1,0).getDate();
    if(s.getDate()===1&&e.getDate()===last)return`${y}年${m}月`;
    if(s.getDate()===1&&e.getDate()<=16)return`${y}年${m}月前半`;
    if(s.getDate()>=15&&e.getDate()===last)return`${y}年${m}月後半`;
  }
  return`${y}/${m}/${s.getDate()}〜${e.getMonth()+1}/${e.getDate()}`;
}
// {[shopId]: Period[]} から選択肢を作る。同じ範囲は1件に畳み、開始日の新しい順。
function collectPeriodRanges(shopPeriods){
  const map={};
  Object.keys(shopPeriods||{}).forEach(sid=>{
    (shopPeriods[sid]||[]).forEach(p=>{
      const k=periodRangeKey(p);
      if(!k)return;
      if(!map[k])map[k]={key:k,startDate:p.startDate,endDate:p.endDate,label:periodRangeLabel(p.startDate,p.endDate),shopIds:[]};
      if(map[k].shopIds.indexOf(sid)<0)map[k].shopIds.push(sid);
    });
  });
  return Object.values(map).sort((a,b)=>a.startDate!==b.startDate?(a.startDate<b.startDate?1:-1):(a.endDate<b.endDate?1:a.endDate>b.endDate?-1:0));
}
function findShopPeriodByRange(periods,key){return(periods||[]).find(p=>periodRangeKey(p)===key)||null;}

// 企業→店舗の「完成シフトの提出期限」。period.deadlineDate（スタッフ→店舗の希望提出締切）とは別物。
// 企業が期間ごとに日付を直接入れる（全店舗共通の日付＋店舗別の上書き）。
// 企業の正本: config.deadlines = {[periodRangeKey]: {all?: "YYYY-MM-DD", shops?: {[shopId]: "YYYY-MM-DD"}}}
// 店舗のミラー: company.deadlines = {[periodRangeKey]: "YYYY-MM-DD"}（その店舗に効く日付だけ）
function isValidDateStr(v){
  if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=pd(v);
  return!isNaN(d)&&fd(d)===v;
}
function companyDeadlineFor(deadlines,rangeKey,shopId){
  const e=_coObj(deadlines&&rangeKey?deadlines[rangeKey]:null);
  if(!e)return null;
  const own=e.shops&&e.shops[shopId];
  if(isValidDateStr(own))return own;
  return isValidDateStr(e.all)?e.all:null;
}
// 店舗側（ミラー）から、その期間の提出期限を引く
function shopDeadlineFromLink(companyLink,period){
  const d=companyLink&&_coObj(companyLink.deadlines);
  const v=d?d[periodRangeKey(period)]:null;
  return isValidDateStr(v)?v:null;
}
// 毎月の固定締切（2026-09-27 ユーザー指示）。企業が「毎月10日・25日」のように日だけを持つ。
// 2週間単位の運用では月に2回締切が来るので複数持てる。31 は「月末」で、29〜31 は短い月の月末に丸める。
// 期間の締切は「その期間の開始日より前で最も遅い固定日」。優先順位は 日付指定（deadlines）＞ 毎月の固定。
// 企業の正本: config.monthlyDeadlineDays = [10,25] ／ 店舗のミラー: company.monthlyDeadlineDays（同じ配列）
// CF 側の同じ規則は functions/company-config.js にあり、tests/core.test.js が一致を照合する。
const MONTHLY_DEADLINE_MAX=4;
function sanitizeMonthlyDeadlineDays(raw){
  // Firebase は配列を数値キーのオブジェクトで返すことがあるので両方を受ける
  const vals=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?Object.values(raw):[]);
  const set=new Set();
  vals.forEach(v=>{const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)set.add(n);});
  return[...set].sort((a,b)=>a-b).slice(0,MONTHLY_DEADLINE_MAX);
}
function monthlyDeadlineDayLabel(d){return d===31?"月末":`${d}日`;}
function monthlyDeadlineFor(days,startDate){
  const ds=sanitizeMonthlyDeadlineDays(days);
  if(!ds.length||!isValidDateStr(startDate))return null;
  const s=pd(startDate);
  let best=null;
  // 開始月と前月だけを見れば足りる（前月の固定日はどれも開始日より前なので、必ず候補が1つはある）
  for(let back=0;back<=1;back++){
    const y=s.getFullYear(), m=s.getMonth()-back;
    const last=new Date(y,m+1,0).getDate();
    ds.forEach(d=>{const c=fd(new Date(y,m,Math.min(d,last)));if(c<startDate&&(!best||c>best))best=c;});
  }
  return best;
}
// 店舗側（ミラー）から、その期間の提出期限と出どころを引く。{date, source:"date"|"monthly"} か null。
function shopDeadlineInfoFromLink(companyLink,period){
  if(!companyLink||!period)return null;
  const own=shopDeadlineFromLink(companyLink,period);
  if(own)return{date:own,source:"date"};
  const m=monthlyDeadlineFor(companyLink.monthlyDeadlineDays,period.startDate);
  return m?{date:m,source:"monthly"}:null;
}

// ===== 所属店舗とヘルプ判定（2026-09-27）=====
// settings.staffHomeShop[名前]=shopId。無ければ自店所属。
// 同一人物の判定は「所属店舗が一致すること」＝A店所属の田中がB店の名簿に所属A店で載っていれば同じ人。
// 両店でそれぞれ自店所属の同名は別人として扱う（名前だけで同一視すると同名別人を重複エラーにする）。
function homeShopOf(settings,name,shopId){
  const h=_coObj(settings&&settings.staffHomeShop)||{};
  const v=h[name];
  return typeof v==="string"&&v?v:shopId;
}
function isHelperAt(settings,name,shopId){return homeShopOf(settings,name,shopId)!==shopId;}
// 店舗間シフト重複を見に行く他店舗の一覧。otherShops は {[shopId]: {staffSet:Set, homeShop:{…}|null}}。
// 旧データ settings.staffWorkplaces（企業連携タブの「勤務先店舗」・UIは廃止）は1リリースだけ和集合で残す。
function dupTargetShopsFor({name,shopId,settings,otherShops}){
  const myHome=homeShopOf(settings,name,shopId);
  const out=[];
  Object.keys(otherShops||{}).forEach(sid=>{
    if(sid===shopId)return;
    const o=otherShops[sid];
    if(!o||!o.staffSet||!o.staffSet.has(name))return;
    const oh=_coObj(o.homeShop)||{};
    const theirHome=typeof oh[name]==="string"&&oh[name]?oh[name]:sid;
    if(theirHome===myHome)out.push(sid);
  });
  const legacy=_coObj(((settings&&settings.staffWorkplaces)||{})[name]);
  if(legacy)Object.keys(legacy).forEach(sid=>{if(legacy[sid]&&sid!==shopId&&out.indexOf(sid)<0)out.push(sid);});
  return out;
}

// ===== ヘルプ先勤務の所属店舗への合算（2026-09-30・労務給与_複数法人_実装計画.md §3.9・P3.6）=====
// sub は行き先の店にあるので、所属店舗の労務判定・月計・週の休みはその人の他店勤務を知らない（空欄＝休みに見える）。
// 所属店舗のシフト作成タブが店舗間の重複判定のために読んでいる連携店舗の subs を使って合算する。
// 合算するのは**予定（subs）だけ**。他店の laborMonths・actuals・private/pay はオーナーしか読めないので、
// P4（実績）の他店合算はそのセッションが行き先の店のオーナーのときだけ行う（CLAUDE.md に申し送り）。
//
// 写しの people（shops/{sid}/company.people = {personId: {shopId: 登録名}}）から「店舗×登録名 → personId」
function personIndexOfMirror(people){
  const m=new Map();
  const p=_coObj(people);
  if(!p)return m;
  Object.keys(p).forEach(id=>{
    if(!PERSON_ID_RE.test(id))return;
    const l=_coObj(p[id]);if(!l)return;
    Object.keys(l).forEach(sid=>{if(typeof l[sid]==="string"&&l[sid])m.set(sid+"\u0000"+l[sid],id);});
  });
  return m;
}
// 同じ人の他店舗での登録 [{shopId, name, by:"person"|"home"}]。
// o: {shopId, name, settings, people(写しの people・無ければ null), otherShops:{sid:{staffSet, homeShop, entityId?}}, entityId?}
//  ① 自店の登録が people に載っていれば、その人物の links が正（他店での登録名は自店と違ってよい）。
//  ② どちらかの登録が people に載っていなければ、後方互換として dupTargetShopsFor と同じ規則
//     （同じ名前で、両方の登録の所属店舗が同じ店舗を指す）。
//  両方の登録が people に載っていて人物が違えば別人（同姓同名を束ねない）。名前が同じで番号も所属も無い登録も別人。
//  entityId（自店の法人）と相手の entityId がどちらも分かっていて違う店舗は対象外（同じ法人の中だけで合算する）。
function samePersonRegistrations(o){
  const x=o||{};const sid0=x.shopId,name=x.name;
  const shops=_coObj(x.otherShops)||{};
  const idx=personIndexOfMirror(x.people);
  const myPid=idx.get(sid0+"\u0000"+name)||null;
  const links=myPid?(_coObj(x.people)[myPid]||{}):null;
  const myHome=homeShopOf(x.settings,name,sid0);
  const out=[];
  Object.keys(shops).forEach(sid=>{
    if(sid===sid0)return;
    const o2=shops[sid]||{};
    if(x.entityId&&o2.entityId&&o2.entityId!==x.entityId)return;
    if(links&&typeof links[sid]==="string"&&links[sid]){out.push({shopId:sid,name:links[sid],by:"person"});return;}
    if(!o2.staffSet||!o2.staffSet.has(name))return;
    if(myPid&&idx.get(sid+"\u0000"+name))return;
    const oh=_coObj(o2.homeShop)||{};
    const theirHome=typeof oh[name]==="string"&&oh[name]?oh[name]:sid;
    if(theirHome===myHome)out.push({shopId:sid,name,by:"home"});
  });
  return out;
}
// その人の所属店舗。自店と同じ人の登録の staffHomeShop に**明示された値**が1つに決まればその店舗。
// 他店に登録が無ければ自店。明示が無い（両方とも未設定）・食い違うときは null＝どちらにも合算しない
// （両方が自店を所属とみなすと同じ時間を2店舗で数える。企業内登録スタッフ一覧が「所属店舗を設定してください」を出す）。
function personHomeShopOf(o){
  const x=o||{};const regs=x.regs||[];
  const ex=new Set();
  const own=(_coObj(x.settings&&x.settings.staffHomeShop)||{})[x.name];
  if(typeof own==="string"&&own)ex.add(own);
  regs.forEach(r=>{const o2=(x.otherShops||{})[r.shopId];const h=(_coObj(o2&&o2.homeShop)||{})[r.name];if(typeof h==="string"&&h)ex.add(h);});
  if(ex.size===1)return[...ex][0];
  if(ex.size===0&&!regs.length)return x.shopId;
  return null;
}
// この店舗から見たその人の扱い。{regs, home, role, unread}
//  role "home": 所属店舗＝他店の勤務を合算する／"dest": 行き先＝所属店舗で判定する（この店舗の laborTotals に入れない）／null: どちらでもない
//  "dest" は所属店舗の登録を自分が知っているときだけ（所属店舗が企業に連携していない・登録が無いと、どこでも数えられなくなる）。
//  unread: 合算に要る他店を読めていない（読めない店舗の勤務が抜けた値になる。画面は「＋」と注記）。
function helperPersonOf(o){
  const x=o||{};
  const shops=_coObj(x.otherShops)||{};
  const regs=samePersonRegistrations(x);
  const home=personHomeShopOf({shopId:x.shopId,name:x.name,settings:x.settings,regs,otherShops:shops});
  let role=null;
  if(regs.length&&home===x.shopId)role="home";
  else if(home&&home!==x.shopId&&regs.some(r=>r.shopId===home))role="dest";
  const failed=Object.keys(shops).filter(sid=>sid!==x.shopId&&shops[sid]&&shops[sid].loadFailed
    &&!(x.entityId&&shops[sid].entityId&&shops[sid].entityId!==x.entityId));
  const inPeople=personIndexOfMirror(x.people).has(x.shopId+"\u0000"+x.name);
  const unread=role!=="dest"&&(regs.some(r=>failed.indexOf(r.shopId)>=0)||(!inPeople&&failed.length>0));
  return{regs,home,role,unread};
}
// 行き先の店がその日に使う設定。店舗の設定に企業（同じ法人なので自店と同じ）の設定を重ね、その日を含む期間が
// 確定・終了済みなら写し（resolvePeriodMaster）を当てる＝行き先のシフト作成タブが同じ日に使う設定と同じ。
// shop: {settings, periods:[…]|{…}, staffList}。cache（Map）を渡すと期間ごとに1回だけ解決する。
function helperShopSettingsOn(shop,sid,date,todayStr,companySettings,cache){
  const ps=Array.isArray(shop.periods)?shop.periods:Object.values(shop.periods||{});
  const p=ps.find(q=>q&&q.startDate&&q.endDate&&q.startDate<=date&&date<=q.endDate)||null;
  const key=sid+"\u0000"+(p?p.id:"");
  if(cache&&cache.has(key))return cache.get(key);
  const base=applyCompanySettings(shop.settings||{},companySettings||null);
  const sl=Array.isArray(shop.staffList)?shop.staffList:Object.values(shop.staffList||{});
  const v=p?resolvePeriodMaster(p,sl,base,todayStr).settings:base;
  if(cache)cache.set(key,v);
  return v;
}
// その日の他店での勤務 [{shopId, name, abbr, start, end, min, breakShort}]。休憩は**行き先の店の設定で引いた実働**を
// そのまま持ち込む（所属店舗の設定で数え直さない）。自店のその日の勤務と時間が重なる他店の勤務は足さない
// ——ヘルプコマンド（略称サフィックス）で自店にも同じ勤務を入れている、または重複エラーの日で、足すと二重に数える。
// o: {regs, otherShops:{sid:{workMap, abbrs, name, settings, periods, staffList, loadFailed}}, date, todayStr,
//     companySettings, ownRange:{startMin,endMin}|null, cache}
function helperWorkOn(o){
  const x=o||{};const d=x.date;const out=[];
  (x.regs||[]).forEach(r=>{
    const shop=(x.otherShops||{})[r.shopId];
    if(!shop||shop.loadFailed||!shop.workMap)return;
    const sh=shop.workMap.get(r.name+"|"+d);
    if(!sh||sh.status!=="work")return;
    const st=helperShopSettingsOn(shop,r.shopId,d,x.todayStr,x.companySettings,x.cache);
    const rng=effShiftRangeMin(sh,st);
    const own=x.ownRange;
    if(rng&&own&&rng.startMin<own.endMin&&own.startMin<rng.endMin)return;
    const min=calcNetWorkMinutes(sh,getBreaksFor(st,d,r.name,sh),getOT(r.name,st,sh),st);
    if(!(min>0))return;
    const abbrs=(shop.abbrs||[]).filter(a=>typeof a==="string"&&a);
    out.push({shopId:r.shopId,name:r.name,shopName:shop.name||r.shopId,abbr:abbrs[0]||String(shop.name||r.shopId).slice(0,1),
      start:effShiftStart(sh)||"",end:effShiftEnd(sh)||"",min,breakShort:isBreakShort(sh,st,d,r.name)});
  });
  return out;
}
// その日の他店での勤務を、行き先の店の実績（あれば）で解決した1日（P5）。helperWorkOn と同じ規則で拾い
// （同じ人の登録・自店の勤務と重なる他店の勤務は足さない）、resolveActualDay を行き先の店の設定で通す。
// 行き先の店の実績を読めない（オーナーでない）ときは確定シフトで解決し、**その日を含む行き先の期間が確定済みなら**
// actualUnread を立てる（確定前の期間には実績を入れる入口が無いので、読めなくても値は変わらない）。
// 戻り値 [{shopId, name, day（resolveActualDay の戻り値）, actualUnread}]
function helperActualDaysOn(o){
  const x=o||{};const d=x.date;const out=[];
  (x.regs||[]).forEach(r=>{
    const shop=(x.otherShops||{})[r.shopId];
    if(!shop||shop.loadFailed||!shop.workMap)return;
    const sh=shop.workMap.get(r.name+"|"+d);
    if(!sh||sh.status!=="work")return;
    const st=helperShopSettingsOn(shop,r.shopId,d,x.todayStr,x.companySettings,x.cache);
    const rng=effShiftRangeMin(sh,st);
    const own=x.ownRange;
    if(rng&&own&&rng.startMin<own.endMin&&own.startMin<rng.endMin)return;
    const p=Object.values(shop.periods||{}).find(q=>q&&q.startDate&&q.endDate&&q.startDate<=d&&d<=q.endDate)||null;
    const act=p&&!shop.actualsUnread?actualOf(shop.actuals,p.id,r.name,d):null;
    const day=resolveActualDay({shifts:{[d]:sh}},act,d,st,r.name);
    if(!(day.workMin>0)&&!act)return;
    out.push({shopId:r.shopId,name:r.name,day,actualUnread:!!(shop.actualsUnread&&p&&isPeriodConfirmed(p))});
  });
  return out;
}
// 他店舗の読み込み結果（settings・subs・staff・periods の生の値）を、店舗間の重複判定とヘルプ先勤務の合算が使う形にする。
// シフト作成タブ（companyData）と企業の確定（loadForConfirm）が同じ規則で読む。
// workMap は「登録名|日付 → 出勤シフト」。別名で提出された sub はその店舗自身の staffAliases で登録名へ解決してからキーにし、
// 同じキーに複数あれば出勤・退勤の両方が揃ったシフトを優先する（休み希望のセルは effShiftStart/End が "" ＝揃っていない）。
function otherShopDataOf(o){
  const x=o||{};
  const st=_coObj(x.settings)||{};
  const abbrs=Object.values(st.shopAbbrs||{}).filter(v=>typeof v==="string");
  const aliases=st.staffAliases||{};
  const workMap=new Map();
  const hasBoth=sh=>!!(effShiftStart(sh)&&effShiftEnd(sh));
  Object.values(_coObj(x.subs)||{}).forEach(sub=>{
    if(!sub||!sub.staffName||!sub.shifts)return;
    const resolved=resolveAlias(sub.staffName,aliases);
    Object.entries(sub.shifts).forEach(([d,sh])=>{
      if(!sh||sh.status!=="work")return;
      const k=resolved+"|"+d;
      const cur=workMap.get(k);
      if(!cur||(!hasBoth(cur)&&hasBoth(sh)))workMap.set(k,sh);
    });
  });
  const staffList=Object.values(_coObj(x.staff)||{}).filter(n=>typeof n==="string");
  // 実績（shops/{sid}/actuals・P4）はオーナーしか読めない。読めた店舗だけ actuals を持ち、読めない店舗は actualsUnread
  // （P5 の割増で他店の実績を合算するのは、そのセッションが行き先の店のオーナーのときだけ＝計画書 §3.9）
  return{name:x.name,abbrs,workMap,staffSet:new Set(staffList.filter(n=>!isSpacer(n))),homeShop:st.staffHomeShop||null,
    loadFailed:!!x.loadFailed,settings:st,staffList,periods:_coObj(x.periods)||{},
    actuals:_coObj(x.actuals)||{},actualsUnread:x.actuals===undefined||x.actualsUnread===true};
}
// ヘルプ先勤務の合算の対象店舗（企業の写しの連携店舗で、読み込んだもの）。写しの法人を entityId として載せる
function helperShopsOf(companyLink,otherShops,shopId){
  const out={};
  if(!companyLink)return out;
  const ents=_coObj(companyLink.shopEntities)||{};
  Object.keys(_coObj(companyLink.shops)||{}).forEach(sid=>{
    if(sid===shopId||!otherShops||!otherShops[sid])return;
    out[sid]={...otherShops[sid],entityId:typeof ents[sid]==="string"?ents[sid]:null};
  });
  return out;
}
// 企業の確定（シフト作成タブを開かずに集計する経路）でヘルプ先の勤務を合算するための関数を返す。
// o: {shopId, names, settings, companyLink, otherShops（helperShopsOf の戻り値）, subs（自店）, todayStr}
// 戻り値: {info:{名前:helperPersonOf}, excludeNames:[所属店舗で判定する人], dayMin(名前,日付)}
// シフト作成タブの helperEntriesOn と同じ規則（自店の勤務と重なる他店の勤務は足さない）。
function helperScheduleContext(o){
  const x=o||{};const settings=x.settings||{};
  const cl=x.companyLink||null;
  const people=(cl&&cl.people)||null;
  const eid=cl&&typeof cl.entityId==="string"?cl.entityId:null;
  const shops=x.otherShops||{};
  const info={};
  if(Object.keys(shops).length)(x.names||[]).forEach(n=>{if(n&&!isSpacer(n))info[n]=helperPersonOf({shopId:x.shopId,name:n,settings,people,otherShops:shops,entityId:eid});});
  const own=new Map();
  (x.subs||[]).forEach(s=>{
    if(!s||!s.staffName||!s.shifts)return;
    Object.keys(s.shifts).forEach(d=>{const sh=s.shifts[d];const k=s.staffName+"|"+d;if(sh&&sh.status==="work"&&!own.has(k))own.set(k,sh);});
  });
  const aliases=settings.staffAliases||{};
  const cache=new Map();
  const dayMin=(name,d)=>{
    const h=info[name];
    if(!h||h.role!=="home")return 0;
    const sh=resolveSubByAlias(n=>own.get(n+"|"+d),name,aliases);
    return helperWorkOn({regs:h.regs,otherShops:shops,date:d,todayStr:x.todayStr,companySettings:cl?(cl.settings||null):null,
      ownRange:sh?effShiftRangeMin(sh,settings):null,cache}).reduce((a,e)=>a+e.min,0);
  };
  return{info,excludeNames:Object.keys(info).filter(n=>info[n].role==="dest"),dayMin};
}

// 企業コード＋パスワードでログインしたセッション（companyLogin のカスタムトークン）の uid は "company_"+企業ID。
// 企業パスワードの変更は作成者のアカウント（メール／Google）に限る（2026-09-28）ので、UI はこれでボタンを出し分ける。
// 同じ規則は functions/company-config.js の COMPANY_SESSION_UID_PREFIX にあり、tests/core.test.js が一致を照合する。
const COMPANY_SESSION_UID_PREFIX="company_";
function isCompanySessionUid(uid){return typeof uid==="string"&&uid.indexOf(COMPANY_SESSION_UID_PREFIX)===0;}

// ===== 従業員番号で企業内の他店舗のスタッフを呼び出す（2026-09-28）=====
// 対象は**数字だけ**の番号。入力も相手の番号も /^\d+$/ のときだけ、文字列の完全一致で探す（「012」と「12」は別）。
// shops: [{id, name, staff:[名前…]|{…}, staffNumbers, staffAttributes, staffHomeShop}]
// 戻り値は一致した生の行 [{shopId, shopName, name, attrId, homeShopId}]（homeShopId はその店舗での所属。未設定ならその店舗）
function findStaffByNumber(number,shops){
  const num=String(number==null?"":number).trim();
  if(!/^\d+$/.test(num))return[];
  const out=[];
  (shops||[]).forEach(sh=>{
    if(!sh||!sh.id)return;
    const list=Array.isArray(sh.staff)?sh.staff:Object.values(sh.staff||{});
    const nums=sh.staffNumbers||{},attrs=sh.staffAttributes||{},homes=sh.staffHomeShop||{};
    list.forEach(name=>{
      if(typeof name!=="string"||!name||isSpacer(name))return;
      const n=String(nums[name]==null?"":nums[name]).trim();
      if(!/^\d+$/.test(n)||n!==num)return;
      const h=typeof homes[name]==="string"&&homes[name]?homes[name]:sh.id;
      out.push({shopId:sh.id,shopName:sh.name||sh.id,name,attrId:attrs[name]||null,homeShopId:h});
    });
  });
  return out;
}
// 同じ番号の一致行を**名前ごとに1人**へまとめる。企業内で同じ番号が複数の店舗で見つかるのは
// 「同じ人が所属店舗とヘルプ先の両方に登録されている」ケースなので選択肢にしない。
// 属性と所属は所属店舗側の登録（homeShopId===shopId の行）を正とし、無ければ最初の行が指す所属を使う。
// 戻り値の長さが2以上＝同じ番号で別の名前＝企業内の番号重複（データの不整合）で、そのときだけ呼び出し側で選ばせる。
function mergeStaffMatches(rows){
  const byName=new Map();
  (rows||[]).forEach(r=>{if(!byName.has(r.name))byName.set(r.name,[]);byName.get(r.name).push(r);});
  const names={};(rows||[]).forEach(r=>{names[r.shopId]=r.shopName;});
  return[...byName.entries()].map(([name,rs])=>{
    const home=rs.find(r=>r.homeShopId===r.shopId)||null;
    const base=home||rs[0];
    const homeShopId=home?home.shopId:base.homeShopId;
    return{name,attrId:base.attrId||null,homeShopId,homeShopName:names[homeShopId]||null,shops:rs.map(r=>r.shopId)};
  });
}

// ===== 法人（entity）レイヤー（2026-09-30・労務給与_複数法人_実装計画.md §3.1・P1）=====
// 企業の下に法人を置き、店舗は必ず1法人に属す。正本は companies/{id}/pub の entities / shopEntities /
// defaultEntityId / shopKinds で、書くのは CF だけ。店舗は写し shops/{sid}/company の entityId・entityName・kind を読む。
// 下の2つは functions/company-config.js の entityIdOfShop / shopKindOf と**同じ規則**（tests/core.test.js が照合する）。
const COMPANY_ENTITY_ID_RE=/^[-0-9A-Za-z_]{1,64}$/;
const COMPANY_SHOP_KINDS=["shop","hq"];
// 割当が無い・割当先の法人が消えている店舗は既定の法人へ倒す。どれも無ければ null（移行前の企業）
function companyEntityIdOfShop(pub,shopId){
  const p=pub&&typeof pub==="object"?pub:{};
  const ents=p.entities&&typeof p.entities==="object"?p.entities:{};
  const ok=id=>typeof id==="string"&&COMPANY_ENTITY_ID_RE.test(id)&&!!ents[id]&&typeof ents[id]==="object";
  const own=(p.shopEntities||{})[shopId];
  if(ok(own))return own;
  return ok(p.defaultEntityId)?p.defaultEntityId:null;
}
function companyShopKindOf(pub,shopId){return((pub&&pub.shopKinds)||{})[shopId]==="hq"?"hq":"shop";}
// 法人の一覧（名前の50音順・既定の法人を先頭）。[{id,name,isDefault}]
function companyEntityList(pub){
  const p=pub&&typeof pub==="object"?pub:{};
  const ents=p.entities&&typeof p.entities==="object"?p.entities:{};
  return Object.keys(ents).filter(id=>COMPANY_ENTITY_ID_RE.test(id)&&ents[id]&&typeof ents[id]==="object")
    .map(id=>({id,name:String(ents[id].name||""),isDefault:id===p.defaultEntityId}))
    .sort((a,b)=>a.isDefault!==b.isDefault?(a.isDefault?-1:1):a.name.localeCompare(b.name,"ja"));
}
// 労務判定の設定を企業の共通設定から法人の設定へ移す計画（2026-10-01 ユーザー決定: 労務判定は法人に統合し、
// 企業の共通設定には属性別の制限だけを残す）。写しは「企業共通 → 法人」をキー単位で重ねる（mergeEntitySettings）ので、
// 各法人に {...企業の laborSettings, ...法人の laborSettings}（法人が勝つ）を持たせ、企業側から laborSettings を外せば
// 写しの値は1つも変わらない。返り値は {entities:{法人ID: 送り直す settings}, company: laborSettings を外した企業の settings}、
// 移すものが無い（企業に laborSettings が無い）・法人が無い・どの法人にも属さない連携店舗がある（移すとその店舗だけ
// 労務設定を失う）ときは null。呼び出し側は全法人の保存が通ってから企業側を保存する（失敗したら企業側を消さない）。
function planLaborToEntities(companySettings,pub){
  const isObj=v=>!!v&&typeof v==="object"&&!Array.isArray(v);
  const cs=isObj(companySettings)?companySettings:{};
  const lab=isObj(cs.laborSettings)?cs.laborSettings:{};
  if(Object.keys(lab).length===0)return null;
  const p=isObj(pub)?pub:{};
  const ents=companyEntityList(p);
  if(ents.length===0)return null;
  if(Object.keys(isObj(p.shops)?p.shops:{}).some(sid=>!companyEntityIdOfShop(p,sid)))return null;
  const entities={};
  ents.forEach(({id})=>{
    const cur=isObj(((p.entities||{})[id]||{}).settings)?p.entities[id].settings:{};
    const el=isObj(cur.laborSettings)?cur.laborSettings:{};
    entities[id]={...cur,laborSettings:{...lab,...el}};
  });
  const company={...cs};delete company.laborSettings;
  return{entities,company};
}

// ===== 機能のプランゲート（2026-09-30・労務給与_複数法人_実装計画.md §3.7・決定6）=====
// 法人・所定・確定・実績・賃金は Premium。将来「法人プラン」を足すときに各所の plan==="premium" を
// 探して回らないよう、新しい機能のゲートはこの1本だけを通す（法人プランを足すときはここだけ触る）。
const GATED_FEATURES=["entity","scheduled","confirm","actuals","pay"];
function featureEnabled(kind,o){
  if(!GATED_FEATURES.includes(kind))return false;
  const plan=o&&o.plan;
  return plan==="premium";
}

// ===== 賃金マスタ（2026-09-30・労務給与_複数法人_実装計画.md §3.7・§4.5・P6a）=====
// 置き場は shops/{所属店舗}/private/pay/{名前}（owners しか読めない）。settings 配下には絶対に置かない
// （settings は auth != null で誰でも読める）。期間の写しにも入れない。
// 1時間当たり賃金の分母（分）。laborSettings.rateDenominatorMin が正ならその値、0（未設定）なら
// 年間所定÷12 を 0.1h（6分）単位で切り捨てた値（2,080h → 173.3h＝10398分・§3.3 決定2）。
// 年間所定も未設定なら 173.3h。
const DEFAULT_RATE_DENOMINATOR_MIN=10398;
function rateDenominatorMinOf(laborSettings){
  const l=laborSettings||{};
  const v=Number(l.rateDenominatorMin);
  if(Number.isFinite(v)&&v>0)return Math.round(v);
  const a=Number(l.annualScheduledMin);
  if(Number.isFinite(a)&&a>0){const d=Math.floor(a/72)*6;if(d>0)return d;}
  return DEFAULT_RATE_DENOMINATOR_MIN;
}
const PAY_TYPES=["monthly","hourly"];
const PAY_TYPE_LABELS={monthly:"月給",hourly:"時給"};
// 属性「社員」は固定給のため月給固定（決定17）。給与形態の切替も時給欄も出さない
function isPayTypeFixed(attrId){return attrId==="employee";}
// 既定の給与形態: 社員・企業属性（特定技能・契約社員など）=月給、それ以外（パート・アルバイト等）=時給
function defaultPayTypeOf(attrId){
  if(isPayTypeFixed(attrId)||isCompanyAttrId(attrId))return"monthly";
  return"hourly";
}
function _payInt(v){const n=Number(v);return Number.isFinite(n)&&n>=0?Math.round(n):0;}
function _payArr(v){return Array.isArray(v)?v.filter(x=>x!=null):(v&&typeof v==="object"?Object.values(v).filter(x=>x!=null):[]);}
// 割増の基礎に入る手当の合計（excludeFromRate の手当と通勤手当は除く）
function payRateBaseYen(pay){
  if(!pay||typeof pay!=="object")return 0;
  return _payInt(pay.base)+_payArr(pay.allowances).reduce((s,a)=>s+(a&&!a.excludeFromRate?_payInt(a.amount):0),0);
}
// 時給換算（円/時・端数そのまま）。月給者は (基本給+割増の基礎に入る手当) ÷ 分母、時給者は時給
function hourlyRateOf(pay,denomMin){
  if(!pay||typeof pay!=="object")return null;
  if(pay.payType==="hourly")return _payInt(pay.base)||null;
  const d=Number(denomMin)>0?Number(denomMin):DEFAULT_RATE_DENOMINATOR_MIN;
  const b=payRateBaseYen(pay);
  return b>0?b*60/d:null;
}
// 整数どうしの切上げ除算（浮動小数の誤差で 46199.000001 が 46200 にならないように整数で割る）
function _ceilDiv(num,den){return Math.floor(num/den)+(num%den?1:0);}
// 固定残業代の自動計算: 基本給 ÷ 分母(時間) × 1.25 × 時間 を1円未満切上げ（§4.5）。
// 213,500 ÷ 173.3 × 1.25 × 30 = 46,198.79… → 46,199
function fixedOtAmountOf(baseYen,hours,denomMin){
  const b=_payInt(baseYen);
  const hMin=Math.round((Number(hours)||0)*60);
  const d=Number(denomMin)>0?Math.round(Number(denomMin)):DEFAULT_RATE_DENOMINATOR_MIN;
  if(!b||hMin<=0)return 0;
  return _ceilDiv(b*125*hMin,d*100);
}
// 賃金の法人設定 wageSettings の検証（P6a で最低賃金、P6b で割増率と端数規則を足した）。
//   minWage       最低賃金の履歴 [{from,yen}]
//   premiumRates  割増率（%）{ot, over60, night, holiday}。**法定値より下げられない**（上乗せだけ）。法定値と同じか空欄は持たない
//                 （ot=時間外25・over60=月60h超の追加25・night=深夜25・holiday=法定休日35）
//   roundingRule  金額の端数（"ceil" 円未満切上げ＝既定 | "round" 四捨五入 | "floor" 切捨て）。既定の "ceil" は持たない
// functions/company-config.js の sanitizeWageSettings と**同じ規則**（tests/core.test.js が照合する）。
const MIN_WAGE_MAX_ENTRIES=20;
const PREMIUM_RATE_KEYS=["ot","over60","night","holiday"];
const LEGAL_PREMIUM_RATES={ot:25,over60:25,night:25,holiday:35};
const PREMIUM_RATE_LABELS={ot:"時間外",over60:"月60時間超（追加）",night:"深夜",holiday:"法定休日"};
const PREMIUM_RATE_MAX=100;
const ROUNDING_RULES=["ceil","round","floor"];
const ROUNDING_RULE_LABELS={ceil:"円未満切上げ",round:"円未満四捨五入",floor:"円未満切捨て"};
function sanitizeWageSettings(raw){
  const out={};
  if(!raw||typeof raw!=="object")return out;
  const pr=raw.premiumRates&&typeof raw.premiumRates==="object"?raw.premiumRates:null;
  if(pr){
    const o={};
    PREMIUM_RATE_KEYS.forEach(k=>{const v=Number(pr[k]);if(Number.isInteger(v)&&v>LEGAL_PREMIUM_RATES[k]&&v<=PREMIUM_RATE_MAX)o[k]=v;});
    if(Object.keys(o).length)out.premiumRates=o;
  }
  if(ROUNDING_RULES.includes(raw.roundingRule)&&raw.roundingRule!=="ceil")out.roundingRule=raw.roundingRule;
  const byFrom={};
  _payArr(raw.minWage).forEach(e=>{
    if(!e||typeof e!=="object"||!isValidDateStr(e.from))return;
    const y=Number(e.yen);
    if(!Number.isInteger(y)||y<1||y>100000)return;
    byFrom[e.from]=y;
  });
  const mw=Object.keys(byFrom).sort().slice(-MIN_WAGE_MAX_ENTRIES).map(from=>({from,yen:byFrom[from]}));
  if(mw.length)out.minWage=mw;
  return out;
}
// その日に効いている最低賃金（円）。履歴に無ければ null（＝比較を出さない）
function minWageOn(wageSettings,dateStr){
  const mw=sanitizeWageSettings(wageSettings).minWage||[];
  let yen=null;
  mw.forEach(e=>{if(e.from<=dateStr)yen=e.yen;});
  return yen;
}
// 最賃との比較（§4.5）。月給者は 基本給 ÷ 分母、時給者は時給で比べる。最賃が分からなければ null
function minWageCheck(pay,minWageYen,denomMin){
  if(!pay||typeof pay!=="object"||!(Number(minWageYen)>0))return null;
  const d=Number(denomMin)>0?Number(denomMin):DEFAULT_RATE_DENOMINATOR_MIN;
  const rate=pay.payType==="hourly"?_payInt(pay.base):_payInt(pay.base)*60/d;
  if(!rate)return null;
  return{rate,min:Number(minWageYen),ok:rate>=Number(minWageYen)};
}
// 賃金の1版（history を除く）を正規化する。保存・比較・履歴の積み上げはこの形で行う
function normalizePayVersion(v){
  const p=v&&typeof v==="object"?v:{};
  const payType=PAY_TYPES.includes(p.payType)?p.payType:"monthly";
  const out={payType,base:_payInt(p.base),effectiveFrom:isValidDateStr(p.effectiveFrom)?p.effectiveFrom:""};
  const cm=p.commute&&typeof p.commute==="object"?p.commute:{};
  out.commute={amount:_payInt(cm.amount),per:cm.per==="day"?"day":"month"};
  if(payType==="monthly"){
    out.allowances=_payArr(p.allowances).filter(a=>a&&typeof a==="object").map(a=>({
      name:String(a.name||"").slice(0,30),amount:_payInt(a.amount),excludeFromRate:!!a.excludeFromRate,excludeFromDeduction:!!a.excludeFromDeduction,
    })).filter(a=>a.name||a.amount);
    const fo=p.fixedOt&&typeof p.fixedOt==="object"?p.fixedOt:{};
    const hours=Math.max(0,Math.round((Number(fo.hours)||0)*100)/100);
    out.fixedOt={hours,auto:fo.auto!==false,amount:_payInt(fo.amount)};
    const fn=p.fixedNight&&typeof p.fixedNight==="object"?p.fixedNight:{};
    out.fixedNight={hours:Math.max(0,Math.round((Number(fn.hours)||0)*100)/100),amount:_payInt(fn.amount)};
  }
  return out;
}
// 自動計算の固定残業代を入れた版を返す（auto のときだけ額を式で置き換える）
function withFixedOtAmount(v,denomMin){
  const n=normalizePayVersion(v);
  if(n.payType==="monthly"&&n.fixedOt.auto)n.fixedOt={...n.fixedOt,amount:fixedOtAmountOf(n.base,n.fixedOt.hours,denomMin)};
  return n;
}
function _payVersionEqual(a,b){return JSON.stringify(normalizePayVersion(a))===JSON.stringify(normalizePayVersion(b));}
// 改定を当てる。**上書きせず版を足す**（§3.7）: 適用開始日が変わった保存は、それまでの版を history へ積む。
// 同じ適用開始日のままの保存はその版の訂正として置き換える（入力の打ち間違いで版が増え続けないように）。
// 返り値は保存する1人分のレコード。内容も日付も変わらなければ prev をそのまま返す（書かない判定に使える）。
function applyPayRevision(prev,next,nowIso){
  const hist=prev?_payArr(prev.history).map(normalizePayVersion):[];
  const n=normalizePayVersion(next);
  if(prev&&_payVersionEqual(prev,n))return prev;
  if(prev&&normalizePayVersion(prev).effectiveFrom!==n.effectiveFrom){
    const old={...normalizePayVersion(prev),...(prev.updatedAt?{updatedAt:prev.updatedAt}:{})};
    hist.push(old);
  }
  hist.sort((a,b)=>String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
  return{...n,updatedAt:nowIso,...(hist.length?{history:hist}:{})};
}
// その日に効いている版（effectiveFrom が日付以前で最も新しい版）。無ければ null（P6b が使う）
function payVersionOn(pay,dateStr){
  if(!pay||typeof pay!=="object")return null;
  const all=[..._payArr(pay.history),pay].map(normalizePayVersion);
  let best=null;
  all.forEach(v=>{if((!v.effectiveFrom||v.effectiveFrom<=dateStr)&&(!best||String(v.effectiveFrom)>=String(best.effectiveFrom)))best=v;});
  return best;
}
// スタッフ名キーの private ノード（STAFF_KEYED_SETTING_MAPS とは別リスト。settings 配下ではないため）。
// 改名は renameStaffInPay、削除は dropStaffFromPay を通す。ノードを足したらここに登録する（テストが照合する）。
const STAFF_KEYED_PRIVATE_NODES=["pay"];
// 改名: 旧名のレコードを新名へ移す差分（update 用 {新名: レコード, 旧名: null}）。移すものが無ければ null
function renameStaffInPay(payMap,oldName,newName){
  const m=payMap&&typeof payMap==="object"?payMap:{};
  if(!oldName||!newName||oldName===newName||m[oldName]==null)return null;
  return{[newName]:m[oldName],[oldName]:null};
}
// 削除: 名前のレコードを消す差分（update 用 {名前: null}）。消すものが無ければ null
function dropStaffFromPay(payMap,names){
  const m=payMap&&typeof payMap==="object"?payMap:{};
  const out={};
  (names||[]).forEach(n=>{if(n&&m[n]!=null)out[n]=null;});
  return Object.keys(out).length?out:null;
}
// 金額の表示。伏せるときは「••••」（桁数も出さない）
function maskYen(v,unlocked){
  if(!unlocked)return"••••";
  const n=Number(v);
  if(v==null||v===""||!Number.isFinite(n))return"—";
  return Math.round(n).toLocaleString("ja-JP")+"円";
}

// ===== 月次の賃金計算（2026-09-30・労務給与_複数法人_実装計画.md §4.5・P6b）=====
// 出すのは「割増賃金・控除の内訳」まで。社会保険・所得税・住民税・支給総額は対象外（給与ソフトへ CSV で渡す）。
// 入力の時間は割増の内訳（premiumBreakdownOf・P5）と同じ1分単位。額は項目ごとに端数規則で丸める。
// 割増率（%）。法人設定に無い項目は法定値
function premiumRatesOf(wageSettings){
  const pr=sanitizeWageSettings(wageSettings).premiumRates||{};
  const out={};PREMIUM_RATE_KEYS.forEach(k=>{out[k]=pr[k]||LEGAL_PREMIUM_RATES[k];});
  return out;
}
function roundingRuleOf(wageSettings){return sanitizeWageSettings(wageSettings).roundingRule||"ceil";}
// num/den 円（正の整数どうし）を端数規則で円にする。整数で割る（46199.000001 のような浮動小数の誤差を出さない）
function roundYenFrac(num,den,rule){
  if(!(num>0)||!(den>0))return 0;
  if(rule==="floor")return Math.floor(num/den);
  if(rule==="round")return Math.floor((2*num+den)/(2*den));
  return _ceilDiv(num,den);
}
// 控除の端数は労働者に有利な向き（支払いの規則を裏返す）。切上げで控除を多く取ると賃金の全額払いを割るため
const DEDUCTION_ROUNDING={ceil:"floor",floor:"ceil",round:"round"};
// 1分あたりの単価（円）を分数 {num,den} で持つ。月給者は (基本給＋割増の基礎に入る手当) ÷ 分母、時給者は時給 ÷ 60
function _payRatePerMin(v,denomMin){
  if(v.payType==="hourly")return{num:_payInt(v.base),den:60};
  const d=Number(denomMin)>0?Math.round(Number(denomMin)):DEFAULT_RATE_DENOMINATOR_MIN;
  return{num:payRateBaseYen(v),den:d};
}
// 単価 × 率(%) × 分
function _payAmount(r,pct,min,rule){
  const m=Math.max(0,Math.round(Number(min)||0));
  return roundYenFrac(r.num*pct*m,r.den*100,rule);
}
// 割増額（§4.5）。v は賃金の1版（normalizePayVersion の形）、t は割増の内訳の時間（分）:
//   {workMin, otMin, over60Min, nightMin, legalHolidayMin}
// 月給者: 時間外 = 単価 × (1+時間外率) × (時間外 − 固定残業に充当した分)。固定残業の時間までは固定残業代で払い済み＝不支給
//         法定休日 = 単価 × (1+休日率) × 法定休日労働（基本給は所定の対価なので時間の分も払う）
// 時給者: 時給 × 実労働（時間外・法定休日の時間も含む）に、時間外・法定休日は率の分だけを足す（固定残業・固定深夜は持たない）
// 共通:   60h超 = 単価 × 60h超率 × 60h超。深夜 = 単価 × 深夜率 × 深夜 − 固定深夜手当の充当
// 固定深夜手当の充当（計画書 §8「残る確認」の未決事項。計画どおり深夜割増から引く）: 額があれば額、額が0で時間だけあれば
// その時間分の深夜割増を充当の上限にする。充当しきれない深夜割増だけを払う
function wageOf(o){
  const x=o||{};
  const v=normalizePayVersion(x.pay);
  const t=x.times||{};
  const rates=x.rates||premiumRatesOf(null);
  const rule=ROUNDING_RULES.includes(x.rule)?x.rule:"ceil";
  const r=_payRatePerMin(v,x.denomMin);
  const hourly=v.payType==="hourly";
  const otMin=Math.max(0,Math.round(Number(t.otMin)||0));
  const fixedOtMin=hourly?0:Math.round((Number(v.fixedOt&&v.fixedOt.hours)||0)*60);
  const otCoveredMin=Math.min(otMin,fixedOtMin);
  const otPaidMin=otMin-otCoveredMin;
  const basePay=hourly?_payAmount(r,100,t.workMin,rule):v.base;
  const otPay=_payAmount(r,(hourly?0:100)+rates.ot,otPaidMin,rule);
  const over60Pay=_payAmount(r,rates.over60,t.over60Min,rule);
  const holidayPay=_payAmount(r,(hourly?0:100)+rates.holiday,t.legalHolidayMin,rule);
  const nightPremium=_payAmount(r,rates.night,t.nightMin,rule);
  const fn=v.fixedNight||{hours:0,amount:0};
  const nightCoverLimit=hourly?0:(fn.amount>0?fn.amount:_payAmount(r,rates.night,Math.round((Number(fn.hours)||0)*60),rule));
  const nightCovered=Math.min(nightPremium,nightCoverLimit);
  const nightPay=nightPremium-nightCovered;
  return{payType:v.payType,ratePerHour:r.den>0?r.num*60/r.den:0,basePay,otCoveredMin,otPaidMin,fixedOtMin,otPay,over60Pay,
    nightPremium,nightCovered,nightPay,holidayPay,premiumTotal:otPay+over60Pay+nightPay+holidayPay};
}
// 欠勤控除（§4.5）: (基本給＋控除から除かない手当) ÷ 分母 × 不就労。月給者だけ（時給者は働いた分だけ払うので控除しない）。
// 端数は支払いと逆の向き（DEDUCTION_ROUNDING）
function deductionOf(o){
  const x=o||{};
  const v=normalizePayVersion(x.pay);
  if(v.payType==="hourly")return 0;
  const m=Math.max(0,Math.round(Number(x.absentMin)||0));
  const b=_payInt(v.base)+(v.allowances||[]).reduce((s,a)=>s+(a&&!a.excludeFromDeduction?_payInt(a.amount):0),0);
  const d=Number(x.denomMin)>0?Math.round(Number(x.denomMin)):DEFAULT_RATE_DENOMINATOR_MIN;
  const rule=DEDUCTION_ROUNDING[ROUNDING_RULES.includes(x.rule)?x.rule:"ceil"];
  return roundYenFrac(b*m,d,rule);
}
// 1人・1か月の内訳（月次賃金ページと CSV の1行）。
//   pay        private/pay の1人分（history を含むレコード）。無ければ賃金は出さず時間だけ
//   ym         "YYYY-MM"。**版は月初時点**（月の途中の改定は日割りせず、月初に効いている版で計算する。日割りは BACKLOG）
//   times      {scheduledMin, workMin, otMin, dayOverMin, weekOverMin, monthOverMin, over60Min, nightMin, legalHolidayMin, absentMin}
//   denomMin   1時間当たり賃金の分母（rateDenominatorMinOf）
//   wageSettings 法人の賃金設定（最賃・割増率・端数規則）
//   schedAvgMin 年平均所定（分）。分母を上回ると警告（月給者の時給換算が実態より高く出て、最低賃金を割るおそれ）
function monthlyPayBreakdown(o){
  const x=o||{};
  const ym=String(x.ym||"");
  const n=daysInMonthOf(ym);
  const first=`${ym}-01`,last=n?`${ym}-${String(n).padStart(2,"0")}`:first;
  const denomMin=Number(x.denomMin)>0?Math.round(Number(x.denomMin)):DEFAULT_RATE_DENOMINATOR_MIN;
  const ws=x.wageSettings||null;
  const warnings=[],notes=[];
  let v=payVersionOn(x.pay,first);
  if(!v){
    v=payVersionOn(x.pay,last);
    if(v)notes.push(`${v.effectiveFrom} からの賃金です（月の途中から適用・日割りしていません）`);
  }
  if(x.pay&&typeof x.pay==="object"&&v){
    const mids=[..._payArr(x.pay.history),x.pay].map(normalizePayVersion).map(p=>p.effectiveFrom).filter(d=>d&&d>first&&d<=last&&d!==v.effectiveFrom);
    [...new Set(mids)].sort().forEach(d=>notes.push(`${d} に改定があります（日割りせず月初時点の版で計算しています）`));
  }
  const out={ym,denomMin,version:v,notes,warnings,wage:null,deduction:0,minWage:null};
  const sa=Number(x.schedAvgMin);
  if(v&&v.payType==="monthly"&&Number.isFinite(sa)&&sa>denomMin)
    warnings.push({key:"schedAvgOverDenom",label:`年平均所定 ${fmtMin(Math.round(sa))} が分母 ${fmtMin(denomMin)} を上回っています（時給換算が実態より高く出て、最低賃金を割るおそれがあります）`});
  if(!v){warnings.push({key:"noPay",label:"賃金が未設定です"});return out;}
  const t=x.times||{};
  const rule=roundingRuleOf(ws);
  out.wage=wageOf({pay:v,times:t,denomMin,rates:premiumRatesOf(ws),rule});
  out.deduction=deductionOf({pay:v,absentMin:t.absentMin,denomMin,rule});
  const mwYen=minWageOn(ws,first);
  const chk=minWageCheck(v,mwYen,denomMin);
  out.minWage=chk;
  if(chk&&!chk.ok)warnings.push({key:"minWage",label:`時給換算 ${Math.floor(chk.rate).toLocaleString("ja-JP")}円 が最低賃金 ${chk.min.toLocaleString("ja-JP")}円 を下回っています`});
  return out;
}
// 月次内訳の列（画面の表と CSV が同じ定義を使う）。kind: "text" | "time"（分・伏せない）| "yen"（パスコード解除まで伏せる）
const PAYROLL_COLUMNS=[
  {key:"number",label:"従業員番号",kind:"text"},{key:"name",label:"名前",kind:"text"},{key:"attr",label:"属性",kind:"text"},
  {key:"sys",label:"労働時間制",kind:"text"},{key:"payType",label:"給与形態",kind:"text"},
  {key:"scheduledMin",label:"所定",kind:"time"},{key:"workMin",label:"実労働",kind:"time"},
  {key:"dayOverMin",label:"時間外①日",kind:"time"},{key:"weekOverMin",label:"時間外②週",kind:"time"},{key:"monthOverMin",label:"時間外③月",kind:"time"},
  {key:"otMin",label:"時間外計",kind:"time"},{key:"over60Min",label:"60h超",kind:"time"},{key:"nightMin",label:"深夜",kind:"time"},
  {key:"legalHolidayMin",label:"法定休日",kind:"time"},{key:"absentMin",label:"欠勤・遅刻早退",kind:"time"},
  {key:"rate",label:"時給換算",kind:"yen"},{key:"basePay",label:"基本給／時給×実労働",kind:"yen"},
  {key:"otCoveredMin",label:"固定残業の充当",kind:"time"},{key:"otPay",label:"時間外手当",kind:"yen"},
  {key:"over60Pay",label:"60h超割増",kind:"yen"},{key:"nightPay",label:"深夜割増",kind:"yen"},{key:"nightCovered",label:"固定深夜の充当",kind:"yen"},
  {key:"holidayPay",label:"法定休日手当",kind:"yen"},{key:"deduction",label:"欠勤控除",kind:"yen"},{key:"notes",label:"注記",kind:"text"},
];
// 1行の値（数値のまま）。r は {name, number, attr, sysLabel, times, calc: monthlyPayBreakdown の戻り値, notes[]}
function payrollRowValues(r){
  const t=r.times||{},c=r.calc||{},w=c.wage;
  const val={number:r.number||"",name:r.name||"",attr:r.attr||"",sys:r.sysLabel||"",
    payType:c.version?PAY_TYPE_LABELS[c.version.payType]:"",
    scheduledMin:t.scheduledMin,workMin:t.workMin,dayOverMin:t.dayOverMin,weekOverMin:t.weekOverMin,monthOverMin:t.monthOverMin,
    otMin:t.otMin,over60Min:t.over60Min,nightMin:t.nightMin,legalHolidayMin:t.legalHolidayMin,absentMin:t.absentMin,
    rate:w?Math.floor(w.ratePerHour):null,basePay:w?w.basePay:null,otCoveredMin:w&&w.payType==="monthly"?w.otCoveredMin:null,
    otPay:w?w.otPay:null,over60Pay:w?w.over60Pay:null,nightPay:w?w.nightPay:null,nightCovered:w&&w.payType==="monthly"?w.nightCovered:null,
    holidayPay:w?w.holidayPay:null,deduction:w&&w.payType==="monthly"?c.deduction:null,
    notes:[...(r.notes||[]),...(c.notes||[]),...((c.warnings||[]).map(x=>x.label))].join("／")};
  return val;
}
// 1セルの表示。時間は H:MM、金額は伏せるときは「••••」（CSV も同じ規則＝解除していなければ金額を出さない）
function payrollCellText(col,val,unlocked){
  const v=val[col.key];
  if(col.kind==="time")return v==null||v===""?"":fmtMin(Math.max(0,Math.round(Number(v)||0)));
  if(col.kind==="yen"){if(v==null||v==="")return"";return unlocked?String(Math.round(Number(v)||0)):"••••";}
  return v==null?"":String(v);
}
// CSV（給与ソフトへ渡す）。先頭に BOM を付けるのは呼び出し側。改行は CRLF・全セルを "" で囲む
function payrollCsvOf(rows,unlocked){
  const q=s=>`"${String(s).replace(/"/g,'""')}"`;
  const head=PAYROLL_COLUMNS.map(c=>q(c.kind==="time"?`${c.label}（時:分）`:c.kind==="yen"?`${c.label}（円）`:c.label)).join(",");
  const body=(rows||[]).map(r=>{const val=payrollRowValues(r);return PAYROLL_COLUMNS.map(c=>q(payrollCellText(c,val,unlocked))).join(",");});
  return[head,...body].join("\r\n")+"\r\n";
}

// ===== 賃金の閲覧パスコード（2026-09-30・§3.7・決定12）=====
// 画面ロック（覗き見・開きっぱなし対策）。アクセス制御そのものはルール（private は owners のみ）が担う。
// 置き場は shops/{sid}/private/payCode = {hash, salt, updatedAt}（企業連携店舗は企業のコードを CF が同期）。
// 未設定なら「0000」を受け付ける。hash = SHA-256(salt + code) の16進（functions/company-config.js の payCodeHashCF と同じ）。
const PAY_CODE_DEFAULT="0000";
const PAY_CODE_RE=/^\d{4}$/;
function isValidPayCode(c){return typeof c==="string"&&PAY_CODE_RE.test(c);}
// SHA-256（FIPS 180-4）の素の実装。Web Crypto の crypto.subtle は安全なコンテキスト（https・localhost）にしか無く、
// http の LAN アドレス等で開くと undefined になってパスコードが一切通らなくなるため、その場合だけこちらを使う。
function sha256HexOfBytes(bytes){
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
    0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
    0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
    0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const len=bytes.length,total=((len+9+63)>>6)<<6;
  const m=new Uint8Array(total);m.set(bytes);m[len]=0x80;
  const bits=len*8;
  for(let i=0;i<8;i++)m[total-1-i]=Math.floor(bits/Math.pow(2,8*i))&0xff;
  const w=new Array(64);
  const ror=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let off=0;off<total;off+=64){
    for(let i=0;i<16;i++)w[i]=(m[off+4*i]<<24)|(m[off+4*i+1]<<16)|(m[off+4*i+2]<<8)|m[off+4*i+3];
    for(let i=16;i<64;i++){
      const s0=ror(w[i-15],7)^ror(w[i-15],18)^(w[i-15]>>>3),s1=ror(w[i-2],17)^ror(w[i-2],19)^(w[i-2]>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)|0;
    }
    let[a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){
      const t1=(h+(ror(e,6)^ror(e,11)^ror(e,25))+((e&f)^(~e&g))+K[i]+w[i])|0;
      const t2=((ror(a,2)^ror(a,13)^ror(a,22))+((a&b)^(a&c)^(b&c)))|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
  }
  return H.map(x=>(x>>>0).toString(16).padStart(8,"0")).join("");
}
async function payCodeHash(salt,code){
  const data=new TextEncoder().encode(String(salt||"")+String(code||""));
  const subtle=globalThis.crypto&&globalThis.crypto.subtle;
  if(!subtle)return sha256HexOfBytes(data);
  const buf=await subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,"0")).join("");
}
function isPayCodeRecord(rec){
  return!!rec&&typeof rec==="object"&&typeof rec.hash==="string"&&/^[0-9a-f]{64}$/.test(rec.hash)&&typeof rec.salt==="string";
}
async function verifyPayCode(code,rec){
  if(!isValidPayCode(code))return false;
  if(!isPayCodeRecord(rec))return code===PAY_CODE_DEFAULT;
  return(await payCodeHash(rec.salt,code))===rec.hash;
}
// 解除状態の照合キー。パスコードのレコードが同じなら（企業連携店舗どうし）解除を持ち越し、別のコードの店舗へ移ると伏せ直す
function payCodeIdentity(rec){return isPayCodeRecord(rec)?rec.hash:"default";}
// 失敗回数のロック（5回失敗で60秒待たせる）。state={fails, lockedUntil}。ok なら数え直し
const PAY_CODE_MAX_FAILS=5;
const PAY_CODE_LOCK_MS=60000;
const PAY_UNLOCK_IDLE_MS=10*60*1000;
function nextPayCodeLockout(state,ok,now){
  if(ok)return{fails:0,lockedUntil:0};
  const fails=((state&&state.fails)||0)+1;
  if(fails>=PAY_CODE_MAX_FAILS)return{fails:0,lockedUntil:now+PAY_CODE_LOCK_MS};
  return{fails,lockedUntil:0};
}
function payCodeWaitSec(state,now){
  const u=Number(state&&state.lockedUntil)||0;
  return u>now?Math.ceil((u-now)/1000):0;
}

// ===== 企業内登録スタッフ（企業連携タブの一覧・2026-09-28）=====
// 従業員番号の並びの鍵。0=数字のみ（数値の昇順・同値なら桁数の少ない順）→1=数字＋文字（先頭の数値、次に残りを50音）
// →2=文字のみ（50音）→3=番号なし。50音は sortAttrEntries と同じ localeCompare(…,"ja")（漢字は照合順のまま）。
function staffNumberSortKey(num){
  const s=String(num==null?"":num).trim();
  if(!s)return{group:3,n:null,len:0,rest:""};
  if(/^\d+$/.test(s))return{group:0,n:Number(s),len:s.length,rest:""};
  const m=/^(\d+)(.*)$/.exec(s);
  if(m)return{group:1,n:Number(m[1]),len:m[1].length,rest:m[2]};
  return{group:2,n:null,len:0,rest:s};
}
function _cmpStaffNumber(a,b){
  const ka=staffNumberSortKey(a),kb=staffNumberSortKey(b);
  if(ka.group!==kb.group)return ka.group-kb.group;
  if(ka.group<=1){if(ka.n!==kb.n)return ka.n-kb.n;if(ka.len!==kb.len)return ka.len-kb.len;}
  return String(ka.rest).localeCompare(String(kb.rest),"ja");
}
// mode: "number"（既定＝従業員番号順）/ "shop"（所属店舗名の50音 → その中で番号順）。同じ番号の中は名前の50音
function compareCompanyStaffRows(a,b,mode){
  if(mode==="shop"){
    const sa=String(a.homeShopName||a.shopName||""),sb=String(b.homeShopName||b.shopName||"");
    const c=sa.localeCompare(sb,"ja");if(c)return c;
  }
  const c=_cmpStaffNumber(a.number,b.number);if(c)return c;
  return String(a.name||"").localeCompare(String(b.name||""),"ja");
}
// 企業内の全店舗の登録スタッフを1つの表の行にする。載せるのは**店舗に依存しない情報**だけ
// （従業員番号・属性・所属店舗・有給）。ポジションや退勤延長は店舗依存なので出さない（2026-09-28 ユーザー指示）。
// shops: [{id, name, staff, settings, periods, entityId?, kind?, coSettings?}]。companySettings は企業の共通設定（属性名・年度の開始月を重ねる）。
// coSettings はその店舗の写しの settings（企業共通 → 法人 を重ねた後の値）で、あればこちらを優先する（2026-09-30・P1）。
// entityId は店舗の法人。**従業員番号でまとめるのは同じ法人の中だけ**（別法人の同じ番号は別人＝別行・P1）。
// 行には代表の登録の法人（entityId）と、所属店舗が本部店舗か（isHq）を載せる。
// 行＝「同じ人」。次の2つの登録を1行にまとめる（2026-09-29 ユーザー指示で1つ目を追加）:
//   ① 従業員番号が**数字だけ**で同じ登録（店舗によって「田中」「田中 太郎」と書き方が違っても同じ人とみなす）
//   ② ヘルプ先での登録（所属店舗が別の連携店舗で、所属店舗側にも同名がいる）
// 名前は空白を除いた長さが最も長い表記（＝フルネーム）に寄せる。他の表記は otherNames に残し、
// フルネームに含まれない表記（番号が同じなのに名前が食い違う＝データの不整合）だけ conflictNames に出す。
// 所属店舗は、まとめた登録それぞれの所属を重複なく並べる（homeShopIds / homeShopNames）。
// 有給は代表の登録（所属店舗に登録されている方を優先）の所属店舗の期間だけで数える
// （ヘルプ先で取った分は足さない＝所属店舗のシフト作成タブの「有給残」と同じ答え）。
// 残日数は yearLaborSummary（凍結値 laborTotals だけ・subs は読まない）と paidLeaveRemaining をそのまま使う。
// 凍結値の無い期間は paidMissing に期間ラベルで返し、画面は残日数の前に「＋」を付ける。
// people（companies/{id}/pub/people・P1b）を渡すと保存済みの人物で束ね、行に personId・links を載せる（推定は未リンクの登録だけ）。
// 企業内の同一人物の推定（2026-09-30・P1b で buildCompanyStaffRows から切り出し）。
// regs: [{shopId, name, entityId, number, homeShopId}]。① 同じ法人で数字だけの同じ従業員番号
// ② ヘルプ先の登録（所属店舗側に同名がいる）を同じ人とみなす。戻り値は添字の配列の配列。
// **functions/company-config.js の groupStaffRegsCF と同じ規則**（CF が人物を自動生成するときに使う。tests が照合する）
function groupStaffRegs(regs){
  const list=regs||[];
  const parent=list.map((_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const union=(a,b)=>{const ra=find(a),rb=find(b);if(ra!==rb)parent[Math.max(ra,rb)]=Math.min(ra,rb);};
  const byNumber=new Map(),byShopName=new Map();
  list.forEach((r,i)=>{
    byShopName.set(r.shopId+"\u0000"+r.name,i);
    const num=String(r.number==null?"":r.number).trim();
    if(!/^\d+$/.test(num))return;
    const nk=(r.entityId||"")+"\u0000"+num;
    if(byNumber.has(nk))union(byNumber.get(nk),i);else byNumber.set(nk,i);
  });
  list.forEach((r,i)=>{
    const home=r.homeShopId||r.shopId;
    if(home===r.shopId)return;
    const j=byShopName.get(home+"\u0000"+r.name);
    if(j!=null)union(i,j);
  });
  const groups=new Map();
  list.forEach((_,i)=>{const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);});
  return[...groups.values()];
}
// 人物ID（companies/{id}/pub/people・P1b）で束ねる。people が null（読めない・まだ無い）なら推定だけ。
// 保存済みの人物が正で、どの人物の links にも無い登録（未リンク）だけを推定でまとめる（personId は null）。
// 戻り値: [{idx:[regsの添字], personId}]
const PERSON_ID_RE=/^(\d{1,20}|p_[A-Za-z0-9]{8})$/;
function groupStaffRegsWithPeople(regs,people){
  const list=regs||[];
  if(!people||typeof people!=="object")return groupStaffRegs(list).map(idx=>({idx,personId:null}));
  const at=new Map();list.forEach((r,i)=>at.set(r.shopId+"\u0000"+r.name,i));
  const used=new Set();const out=[];
  Object.keys(people).filter(id=>PERSON_ID_RE.test(id)&&people[id]&&typeof people[id]==="object").forEach(id=>{
    const l=people[id].links&&typeof people[id].links==="object"?people[id].links:{};
    const idx=[];
    Object.keys(l).forEach(sid=>{const i=at.get(sid+"\u0000"+l[sid]);if(i!=null&&!used.has(i)){used.add(i);idx.push(i);}});
    if(idx.length)out.push({idx:idx.sort((a,b)=>a-b),personId:id});
  });
  const rest=list.map((_,i)=>i).filter(i=>!used.has(i));
  groupStaffRegs(rest.map(i=>list[i])).forEach(g=>out.push({idx:g.map(j=>rest[j]),personId:null}));
  return out;
}
function _staffNameLen(n){return String(n||"").replace(/[\s\u3000]/g,"").length;}
function buildCompanyStaffRows(shops,companySettings,today,people){
  const list=(shops||[]).filter(s=>s&&s.id);
  const byId={};
  list.forEach(s=>{
    const cs=s.coSettings&&typeof s.coSettings==="object"?s.coSettings:companySettings;
    const eff=cs?applyCompanySettings(s.settings||{},cs):(s.settings||{});
    const staff=(Array.isArray(s.staff)?s.staff:Object.values(s.staff||{})).filter(n=>typeof n==="string"&&n&&!isSpacer(n));
    const periods=Object.values(s.periods||{}).filter(p=>p&&p.id);
    byId[s.id]={id:s.id,name:s.name||s.id,eff,staff,staffSet:new Set(staff),periods,entityId:typeof s.entityId==="string"?s.entityId:"",kind:s.kind==="hq"?"hq":"shop"};
  });
  // 登録（店舗×名前）を並べ、同じ人どうしをまとめる（保存済みの人物 people が正・無ければ推定）
  const regs=[];
  list.forEach(s=>{
    const sh=byId[s.id];const eff=sh.eff;
    sh.staff.forEach(name=>{
      const h=((eff.staffHomeShop||{})[name]);
      const num=((eff.staffNumbers||{})[name]);
      regs.push({shop:sh,shopId:sh.id,name,entityId:sh.entityId,homeShopId:typeof h==="string"&&h?h:sh.id,homeSet:typeof h==="string"&&!!h,number:String(num==null?"":num).trim()});
    });
  });
  const groups=new Map();
  groupStaffRegsWithPeople(regs,people).forEach(g=>{groups.set(groups.size,{rs:g.idx.map(i=>regs[i]),personId:g.personId});});
  const rows=[];
  groups.forEach(({rs,personId})=>{
    // 代表: 所属店舗に登録されている方 → 有給の付与がある方 → 店舗の並び順
    const atHome=rs.filter(r=>r.homeShopId===r.shop.id);
    const pool=atHome.length?atHome:rs;
    const base=pool.find(r=>Number.isFinite(Number(((r.shop.eff.paidLeaveGranted||{})[r.name]))))||pool[0];
    const ordered=[base,...rs.filter(r=>r!==base)];
    let name=base.name;
    ordered.forEach(r=>{if(_staffNameLen(r.name)>_staffNameLen(name))name=r.name;});
    const otherNames=[];ordered.forEach(r=>{if(r.name!==name&&otherNames.indexOf(r.name)<0)otherNames.push(r.name);});
    const nameKey=String(name).replace(/[\s\u3000]/g,"");
    const conflictNames=otherNames.filter(n=>!nameKey.includes(String(n).replace(/[\s\u3000]/g,"")));
    const homeShopIds=[];ordered.forEach(r=>{if(homeShopIds.indexOf(r.homeShopId)<0)homeShopIds.push(r.homeShopId);});
    const homeShopNames=homeShopIds.map(id=>byId[id]?byId[id].name:null);
    const eff=base.shop.eff;
    const attrOwner=ordered.find(r=>(r.shop.eff.staffAttributes||{})[r.name])||null;
    const attrId=attrOwner?(attrOwner.shop.eff.staffAttributes||{})[attrOwner.name]:null;
    const stl=((attrOwner?attrOwner.shop.eff:eff).staffTypeLimits||{})[attrId];
    const attrLabel=!attrId?"":(BUILTIN_TYPES.includes(attrId)?STAFF_TYPE_LABELS[attrId]:((stl&&typeof stl==="object"&&stl.name)||attrId));
    const number=(ordered.find(r=>r.number)||base).number;
    const home=byId[base.homeShopId]||base.shop;
    const heff=home.eff;
    const fyStart=fiscalYearStartMonthOf(heff);
    const fy=fiscalYearOf(today,fyStart);
    const yr=fy==null?null:yearLaborSummary(home.periods,base.name,fy,fyStart,null);
    const g=Number(((heff.paidLeaveGranted||{})[base.name]));
    const labelOf={};home.periods.forEach(p=>{labelOf[p.id]=p.label||p.startDate||p.id;});
    const person=personId&&people?people[personId]:null;
    rows.push({key:personId?"p|"+personId:base.shop.id+"|"+base.name,personId:personId||null,shopId:base.shop.id,shopName:base.shop.name,name,otherNames,conflictNames,
      // 人物の法人（企業スタッフ一覧の「編集」で変えられる・P1b）。人物に無ければ代表の登録の店舗の法人
      entityId:(person&&typeof person.entityId==="string"&&person.entityId)||base.shop.entityId||null,isHq:home.kind==="hq",
      // この人の登録（店舗×名前）。編集モーダルの改名・統合解除が使う
      links:ordered.map(r=>({shopId:r.shop.id,shopName:r.shop.name,name:r.name,number:r.number})),
      // 「統合しない」と記録した相手の人物ID（people/{personId}/distinct のキー）。重複候補と編集モーダルが使う
      distinct:person&&person.distinct&&typeof person.distinct==="object"?Object.keys(person.distinct):[],
      // 賃金の置き場（所属店舗に登録されている名前・§3.7）。所属店舗側に登録が無ければ null（賃金列は「—」）
      payShopId:base.homeShopId===base.shop.id?base.shop.id:null,payName:base.homeShopId===base.shop.id?base.name:null,
      number,attrId,attrLabel,homeShopId:base.homeShopId,homeShopName:homeShopNames.find(n=>n)||null,homeShopIds,homeShopNames,
      // どれかの登録で所属店舗が明示されているか（P3.6）。2店舗以上に登録があって明示が無い人は、ヘルプ先の勤務を
      // どちらの店舗へ合算するか決まらないので合算されない（一覧が「所属店舗を設定してください」を出す）
      homeExplicit:ordered.some(r=>r.homeSet),
      paidGranted:Number.isFinite(g)?g:null,paidUsed:yr?yr.paid:0,
      paidRemain:yr?paidLeaveRemaining(heff,base.name,yr.paid):null,
      paidMissing:yr?yr.missingPeriodIds.map(id=>labelOf[id]||id):[],
      hidden:isStaffHiddenNow(eff,base.name)});
  });
  return rows;
}
// 重複候補（P3.6）: 同じ名前（空白を除いて一致）の登録が2店舗以上にあるのに人物（personId）が別の行の組。
// ヘルプ先の勤務の合算は人物（people.links）で束ねるので、別人物のままだと所属店舗に合算されない。
// 一覧の先頭に出し、その場で統合できるようにする（同姓同名の別人もここに出るので、統合するかは人が決める）。
// 「統合しない」と記録した組（行の distinct。どちらか一方向でも記録があれば別人）は、組の全ペアが記録済みなら出さない。
// 1ペアでも未記録なら組ごと出す（3人組で2人だけ別人と決めた場合も、残りの判断が要るので行は全部出す）。
// 戻り値: [{name, rows:[行…]（人物IDの昇順）, shopIds:[その名前で登録のある店舗]}]
function duplicatePersonCandidates(rows){
  const norm=n=>String(n==null?"":n).replace(/[\s\u3000]/g,"");
  const by=new Map();
  (rows||[]).forEach(r=>{
    if(!r||!r.personId)return;
    (r.links||[]).forEach(l=>{
      const n=norm(l&&l.name);if(!n)return;
      if(!by.has(n))by.set(n,{name:l.name,rows:new Map(),shops:new Set()});
      const g=by.get(n);g.rows.set(r.personId,r);g.shops.add(l.shopId);
    });
  });
  const out=[];const seen=new Set();
  by.forEach(g=>{
    if(g.rows.size<2||g.shops.size<2)return;
    const rs=[...g.rows.values()].sort((a,b)=>String(a.personId).localeCompare(String(b.personId)));
    const key=rs.map(r=>r.personId).join("|");
    if(seen.has(key))return;seen.add(key);
    const dis=(a,b)=>(a.distinct||[]).includes(b.personId)||(b.distinct||[]).includes(a.personId);
    let all=true;
    for(let i=0;i<rs.length&&all;i++)for(let j=i+1;j<rs.length;j++)if(!dis(rs[i],rs[j])){all=false;break;}
    if(all)return;
    out.push({name:g.name,rows:rs,shopIds:[...g.shops]});
  });
  return out;
}
// 従業員番号と名前の部分一致（まとめる前の別表記 otherNames も見る。大小文字・全角半角の正規化はしない）。空なら全件
function filterCompanyStaffRows(rows,query){
  const q=String(query==null?"":query).trim();
  if(!q)return rows||[];
  return(rows||[]).filter(r=>String(r.number||"").includes(q)||String(r.name||"").includes(q)||(r.otherNames||[]).some(n=>String(n).includes(q)));
}

// ===== シフト作成タブの全表示: 人数が多いときだけ列を横幅に合わせる（2026-09-28）=====
// 実測（1400×900・16日）で縦は人数に関係なく常に高さいっぱい、余るのは横幅だけだったので、
// 「拡大」は**列幅を横幅いっぱいに広げること**だけを指す（行高・文字は広げない）。
// 人数が少ないときは従来どおり列 39px・余りは左右の余白。横幅いっぱいに割った列幅 fillW が
// 48px（39×1.25）以下になる人数から、列幅を fillW にする（1400px 幅なら26名以上）。
// 17日以上の期間（1ヶ月）は従来どおり（39px 上限・縦スクロール）で、この規則を当てない。
const FV_COL_NATURAL=39;
const FV_COL_MAX=48;
function fullViewColW(o){
  const n=Math.max(1,Number(o&&o.staffCount)||0);
  const dateW=Number(o&&o.dateW)||45;
  const fillW=Math.floor(((Number(o&&o.availW)||0)-dateW*2)/n);
  const short=(Number(o&&o.days)||0)<=(Number(o&&o.maxDays)||16);
  if(!short)return{colW:Math.max(12,Math.min(FV_COL_NATURAL,fillW)),expanded:false,fillW};
  if(fillW<=FV_COL_MAX)return{colW:Math.max(12,fillW),expanded:true,fillW};
  return{colW:FV_COL_NATURAL,expanded:false,fillW};
}
// 全表示のセルの文字。行高から出した値（rowFont）を上限に、列が 39px より細いときだけ列幅に比例して小さくする
// （列を広げても文字は大きくしない。以前は列幅を見ておらず、31px の列に 14px の文字が入っていた）。
function fullViewFontOf(rowFont,colW){
  return Math.min(Number(rowFont)||0,Math.max(5,Math.floor((Number(colW)||0)*14/FV_COL_NATURAL)));
}

// ===== 人×月の所定・確定ロック・交付（2026-09-30・労務給与_複数法人_実装計画.md §3.4・§3.5・P3）=====
// 状態は 未提出 → 提出済み → 確定済み → 交付済み。確定（period.confirmation）はセルの編集もロックし
// （シフト作成タブ）、スタッフの再提出をルールで止める（database.rules.json の subs）。
// 以前の「この期間を確定」（period.lockedAt＋写し）は写しでマスタを固定するだけでセルは編集できた。
// lockedAt は書くだけで誰も読まなかったので confirmation.at に統合し、確定のときに消す。
function isPeriodConfirmed(p){return!!(p&&p.confirmation&&typeof p.confirmation.at==="string"&&p.confirmation.at);}
function isPeriodDelivered(p){return isPeriodConfirmed(p)&&!!(p.delivery&&p.delivery.at);}
const PERIOD_STATES=["pending","submitted","confirmed","delivered"];
const PERIOD_STATE_LABELS={pending:"未提出",submitted:"提出済み",confirmed:"確定済み",delivered:"交付済み"};
function periodStateOf(p){
  if(isPeriodDelivered(p))return"delivered";
  if(isPeriodConfirmed(p))return"confirmed";
  if(p&&p.submission&&p.submission.at)return"submitted";
  return"pending";
}
// 確定できるセッション（決定 #10・#21）。企業に連携している店舗は**企業セッション**だけ——企業コードの
// ログイン（uid が company_ で始まる）と企業の作成者本人（CF の assertCompanyMember と同じ範囲）。
// App の companyInfo はこの2種類のセッションにしか入らないので、その企業IDが店舗の連携先と一致するかで見る。
// 企業に連携していない単独店舗は店舗のオーナーが確定する（本部が無いため）。**UI だけの制限**
// （期間の書き込みはルール上オーナーなら誰でも通る）。
function canConfirmPeriod(o){
  const x=o||{};
  if(x.ownerReadOnly)return false;
  if(x.companyLinkId)return!!x.sessionCompanyId&&x.sessionCompanyId===x.companyLinkId;
  return true;
}
// 履歴（period.history）は {キー: 記録} で持ち、**上書きしない**（diffPeriodsForFlatWrite が記録1件ずつ書く）。
// 配列にしないのは、Firebase の配列は添字で上書きされ、2つの端末が同時に足すと片方が消えるため。
const PERIOD_HISTORY_KINDS=["submit","resubmit","confirm","unconfirm","deliver"];
const PERIOD_HISTORY_LABELS={submit:"提出",resubmit:"再提出",confirm:"確定",unconfirm:"確定の解除",deliver:"交付"};
const _HIST_KEY_CHARS="abcdefghijklmnopqrstuvwxyz0123456789";
function genPeriodHistoryKey(nowMs){
  let r="";for(let i=0;i<4;i++)r+=_HIST_KEY_CHARS[Math.floor(Math.random()*_HIST_KEY_CHARS.length)];
  return"h"+Math.max(0,Math.floor(Number(nowMs)||Date.now())).toString(36)+r;
}
function periodHistoryEntry(kind,o){
  const x=o||{};
  const e={kind,at:String(x.at||""),byUid:String(x.byUid||"")};
  if(x.note)e.note=String(x.note).slice(0,200);
  if(x.method)e.method=String(x.method).slice(0,40);
  return e;
}
function withPeriodHistory(p,key,entry){
  const h=_isPlainObj(p&&p.history)?p.history:{};
  return{...p,history:{...h,[key]:entry}};
}
function periodHistoryList(p){
  const h=p&&p.history;
  const arr=Array.isArray(h)?h.map((e,i)=>e&&({...e,key:String(i)})):(_isPlainObj(h)?Object.keys(h).map(k=>h[k]&&({...h[k],key:k})):[]);
  return arr.filter(e=>e&&PERIOD_HISTORY_KINDS.includes(e.kind)&&typeof e.at==="string")
    .sort((a,b)=>String(a.at).localeCompare(String(b.at))||String(a.key).localeCompare(String(b.key)));
}
// 期間がかかる暦月（"YYYY-MM"）の一覧
function monthsOfPeriod(p){
  if(!p||!isValidDateStr(p.startDate)||!isValidDateStr(p.endDate)||p.endDate<p.startDate)return[];
  const out=[];let y=Number(p.startDate.slice(0,4)),m=Number(p.startDate.slice(5,7));
  const ey=Number(p.endDate.slice(0,4)),em=Number(p.endDate.slice(5,7));
  while(y<ey||(y===ey&&m<=em)){out.push(`${y}-${String(m).padStart(2,"0")}`);m++;if(m>12){m=1;y++;}}
  return out;
}
function monthDatesOf(ym){
  const n=daysInMonthOf(ym);
  return Array.from({length:n},(_,i)=>`${ym}-${String(i+1).padStart(2,"0")}`);
}
// 人×月の所定の自動集計（§3.4）。シフト作成タブの月実働（laborDayMin）と同じ経路:
// 名前＋日付の最初の出勤シフト（別名は resolveSubByAlias）→ calcNetWorkMinutes（休憩控除後・締の追加出勤を含む・
// 休暇日は 0）。所定労働日数 = 実働が 0 分より大きい日の数。settings はその期間の設定（確定済みなら写し）を渡す。
// extraDayMin(名前, 日付) はヘルプ先での勤務（P3.6・行き先の店の設定で引いた実働）。所属店舗の所定は合算後の値にする。
// excludeNames は所属店舗で判定する人（行き先の店では数えない＝同じ時間を2店舗で数えない）。
function aggregateScheduledMonth(o){
  const x=o||{};const ym=x.ym;const settings=x.settings||{};
  const extra=typeof x.extraDayMin==="function"?x.extraDayMin:null;
  const excl=new Set(x.excludeNames||[]);
  const work=new Map();
  (x.subs||[]).forEach(s=>{
    if(!s||!s.staffName||!s.shifts)return;
    Object.keys(s.shifts).forEach(d=>{
      if(String(d).slice(0,7)!==ym)return;
      const sh=s.shifts[d];const k=s.staffName+"|"+d;
      if(sh&&sh.status==="work"&&!work.has(k))work.set(k,sh);
    });
  });
  const aliases=settings.staffAliases||{};
  const dates=monthDatesOf(ym);
  const out={};
  (x.names||[]).forEach(name=>{
    if(!name||typeof name!=="string"||isSpacer(name)||excl.has(name))return;
    let days=0,min=0;
    dates.forEach(d=>{
      const sh=resolveSubByAlias(n=>work.get(n+"|"+d),name,aliases);
      const m=(sh?calcNetWorkMinutes(sh,getBreaksFor(settings,d,name,sh),getOT(name,settings,sh),settings):0)
        +(extra?(Number(extra(name,d))||0):0);
      if(m>0){days++;min+=m;}
    });
    out[name]={days,min};
  });
  return out;
}
// その月が凍結できるか: 月の全日がどれかの期間に入っていて、その月にかかる期間がすべて確定済み。
// 半月運用では前半だけ確定した時点では凍結しない（後半の確定で月全体を集計し直してから凍結する）。
function isMonthFullyConfirmed(periods,ym){
  const ps=(periods||[]).filter(p=>p&&isValidDateStr(p.startDate)&&isValidDateStr(p.endDate));
  const dates=monthDatesOf(ym);
  if(!dates.length)return false;
  if(!dates.every(d=>ps.some(p=>p.startDate<=d&&d<=p.endDate)))return false;
  return ps.filter(p=>p.startDate<=dates[dates.length-1]&&p.endDate>=dates[0]).every(isPeriodConfirmed);
}
function laborMonthOf(laborMonths,ym,name){
  const m=laborMonths&&laborMonths[ym];
  const r=m&&m[name];
  return r&&typeof r==="object"?r:null;
}
function isLaborMonthFrozen(rec){return!!(rec&&rec.frozenAt);}
// 手修正された記録か（確定値が自動集計と違う／自動集計を持たない＝手で登録した）。確定のやり直しで上書きしない
function isLaborMonthEdited(rec){
  if(!rec)return false;
  const a=rec.auto;
  if(!a||typeof a!=="object")return true;
  return Number(rec.min)!==Number(a.min)||Number(rec.days)!==Number(a.days);
}
// 確定。返り値の period を savePeriods（差分 update）で、laborMonthsPatch を shops/{sid}/laborMonths への update で書く。
// 写しは**確定の瞬間に書く**（終了済みで写しを持つ期間はその写しを残す＝終了時点で凍結したマスタを確定する）。
function planPeriodConfirmation(o){
  const x=o||{};const period=x.period;
  if(!period||!period.id)return{error:"期間がありません"};
  if(isPeriodConfirmed(period))return{error:"この期間は既に確定しています"};
  const nowIso=x.nowIso||new Date().toISOString();const uid=x.uid||"";
  const snap=period.snapshot;
  const keepSnap=isPeriodEnded(period,x.todayStr)&&snap&&snap.staffList;
  const confirmation={at:nowIso,byUid:uid};if(x.note)confirmation.note=String(x.note).slice(0,200);
  let next={...period,confirmation,snapshot:keepSnap?snap:buildPeriodSnapshot(x.staffList,x.settings)};
  delete next.lockedAt;
  next=withPeriodHistory(next,x.historyKey||genPeriodHistoryKey(Date.parse(nowIso)),periodHistoryEntry("confirm",{at:nowIso,byUid:uid,note:x.note}));
  const nextPeriods=(x.periods||[]).map(p=>p&&p.id===period.id?next:p);
  if(!nextPeriods.some(p=>p&&p.id===period.id))nextPeriods.push(next);
  const master=resolvePeriodMaster(next,x.staffList,x.settings,x.todayStr);
  const names=visibleStaffList(master.staffList,master.settings,next).filter(n=>!isSpacer(n));
  const laborMonthsPatch={};
  const months=monthsOfPeriod(period);
  months.forEach(ym=>{
    const agg=aggregateScheduledMonth({subs:x.subs,names,settings:master.settings,ym,extraDayMin:x.extraDayMin,excludeNames:x.excludeNames});
    const frozen=isMonthFullyConfirmed(nextPeriods,ym);
    Object.keys(agg).forEach(name=>{
      const cur=laborMonthOf(x.laborMonths,ym,name);
      const keep=isLaborMonthEdited(cur);
      const rec={days:keep?Number(cur.days)||0:agg[name].days,min:keep?Number(cur.min)||0:agg[name].min,auto:agg[name]};
      if(frozen){rec.frozenAt=nowIso;rec.frozenBy=uid;}
      laborMonthsPatch[`${ym}/${name}`]=rec;
    });
    // 名簿に居ない人の記録（手で登録した人など）も、月が凍結されるなら一緒に凍結する
    if(frozen)Object.keys((x.laborMonths&&x.laborMonths[ym])||{}).forEach(name=>{
      if(agg[name])return;
      const cur=laborMonthOf(x.laborMonths,ym,name);
      if(cur&&!cur.frozenAt){laborMonthsPatch[`${ym}/${name}/frozenAt`]=nowIso;laborMonthsPatch[`${ym}/${name}/frozenBy`]=uid;}
    });
  });
  return{period:next,laborMonthsPatch,months};
}
// 確定の解除（理由を履歴に残す）。写しは残す（解除前の状態へ戻す＝終了済みの期間は終了時点のマスタのまま）。
// 交付の記録も外す（確定し直したら交付し直す）。その月の所定は凍結を外し、手修正できる状態に戻す。
function planPeriodUnconfirm(o){
  const x=o||{};const period=x.period;
  if(!period||!period.id)return{error:"期間がありません"};
  if(!isPeriodConfirmed(period))return{error:"この期間は確定していません"};
  const nowIso=x.nowIso||new Date().toISOString();const uid=x.uid||"";
  let next={...period};
  delete next.confirmation;delete next.delivery;delete next.lockedAt;
  next=withPeriodHistory(next,x.historyKey||genPeriodHistoryKey(Date.parse(nowIso)),periodHistoryEntry("unconfirm",{at:nowIso,byUid:uid,note:x.note}));
  const laborMonthsPatch={};
  monthsOfPeriod(period).forEach(ym=>{
    Object.keys((x.laborMonths&&x.laborMonths[ym])||{}).forEach(name=>{
      const cur=laborMonthOf(x.laborMonths,ym,name);
      if(cur&&cur.frozenAt){laborMonthsPatch[`${ym}/${name}/frozenAt`]=null;laborMonthsPatch[`${ym}/${name}/frozenBy`]=null;}
    });
  });
  return{period:next,laborMonthsPatch};
}
// 交付（本人へ交付した記録。公開機能ではない）。確定済みの期間だけ
function planPeriodDelivery(o){
  const x=o||{};const period=x.period;
  if(!period||!period.id)return{error:"期間がありません"};
  if(!isPeriodConfirmed(period))return{error:"確定してから交付を記録してください"};
  const nowIso=x.nowIso||new Date().toISOString();const uid=x.uid||"";
  const delivery={at:nowIso,byUid:uid};if(x.method)delivery.method=String(x.method).slice(0,40);
  const next=withPeriodHistory({...period,delivery},x.historyKey||genPeriodHistoryKey(Date.parse(nowIso)),periodHistoryEntry("deliver",{at:nowIso,byUid:uid,method:x.method}));
  return{period:next};
}
// 確定前の手修正（10月分を遡って登録する欄もこれを通る）。凍結済みの月は拒否する
const LABOR_MONTH_MAX_MIN=31*24*60;
function planLaborMonthManual(o){
  const x=o||{};const ym=String(x.ym||"");const name=x.name;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym))return{error:"月が正しくありません"};
  if(!name||typeof name!=="string"||firebaseKeyForbiddenChars(name).length)return{error:"名前が正しくありません"};
  const cur=laborMonthOf(x.laborMonths,ym,name);
  if(isLaborMonthFrozen(cur))return{error:"確定済みの月は変更できません（確定を解除してから）"};
  const days=Number(x.days),min=Number(x.min);
  if(!Number.isInteger(days)||days<0||days>31)return{error:"所定日数は0〜31の整数にしてください"};
  if(!Number.isInteger(min)||min<0||min>LABOR_MONTH_MAX_MIN)return{error:"所定時間が正しくありません"};
  const a=x.auto||(cur&&cur.auto)||null;
  const rec={days,min};
  if(a&&typeof a==="object")rec.auto={days:Number(a.days)||0,min:Number(a.min)||0};
  return{patch:{[`${ym}/${name}`]:rec}};
}
// "H:MM"（または時間の整数）→ 分。読めなければ null
function parseHoursMinutes(v){
  const t=String(v==null?"":v).trim();
  let m=/^(\d{1,3}):([0-5]\d)$/.exec(t);
  if(m)return Number(m[1])*60+Number(m[2]);
  m=/^(\d{1,3})$/.exec(t);
  return m?Number(m[1])*60:null;
}
// 差の表示（+1:20 ／ −0:12 ／ ±0:00）
function fmtSignedMin(d){
  const n=Math.round(Number(d)||0);
  return(n>0?"+":n<0?"−":"±")+fmtMin(Math.abs(n));
}
// スタッフ名キーの月別ノード（shops/{sid}/laborMonths/{YYYY-MM}/{名前}）。STAFF_KEYED_SETTING_MAPS・
// STAFF_KEYED_PRIVATE_NODES の隣の「月キー付きマップ」の一覧。改名は renameStaffInLaborMonths、削除は
// dropStaffFromLaborMonths を通す。CF の改名（companyRenameStaff）も同じ規則（テストが照合する）。
const STAFF_KEYED_MONTH_NODES=["laborMonths"];
function renameStaffInLaborMonths(laborMonths,oldName,newName){
  const lm=_isPlainObj(laborMonths)?laborMonths:{};
  if(!oldName||!newName||oldName===newName)return null;
  const out={};
  Object.keys(lm).forEach(ym=>{const m=lm[ym];if(_isPlainObj(m)&&m[oldName]!=null){out[`${ym}/${newName}`]=m[oldName];out[`${ym}/${oldName}`]=null;}});
  return Object.keys(out).length?out:null;
}
function dropStaffFromLaborMonths(laborMonths,names){
  const lm=_isPlainObj(laborMonths)?laborMonths:{};
  const out={};
  Object.keys(lm).forEach(ym=>{const m=lm[ym];if(!_isPlainObj(m))return;(names||[]).forEach(n=>{if(n&&m[n]!=null)out[`${ym}/${n}`]=null;});});
  return Object.keys(out).length?out:null;
}
// 年平均所定（年度の開始月〜その月）。valueOf(ym) は月の所定（分）を返す:
// 数値＝その月の値／null＝期間はあるが読めていない（missing に数える）／undefined＝期間が無い月（数えない）。
// 値は laborMonths の確定値を優先し、無い月は呼び出し側が凍結値・実データで埋める（yearLaborSummary の preferLive と同じ考え）。
function yearScheduledAverage(months,valueOf){
  let sum=0,count=0;const missing=[];
  (months||[]).forEach(ym=>{
    const v=valueOf(ym);
    if(v===undefined)return;
    if(v===null||!Number.isFinite(Number(v))){missing.push(ym);return;}
    sum+=Number(v);count++;
  });
  return{avgMin:count?Math.round(sum/count):null,count,missing};
}
// その日が休業日か（日付別候補を優先し、無ければ曜日別候補。休業日は候補に {closed:true} を持つ）
function isClosedDateOf(settings,ds){
  const st=settings||{};
  const dc=(st.dateCandidates||{})[ds];
  if(Array.isArray(dc)&&dc.length)return dc.some(c=>c&&c.closed);
  const wc=(st.weekdayCandidates||{})[pd(ds).getDay()];
  return Array.isArray(wc)&&wc.some(c=>c&&c.closed);
}
// 本部店舗（kind:"hq"）の固定勤務パターンの投入（§3.1・P3）。閉店日と土日祝は除外し、
// **まだ何も入っていない日だけ**に入れる（手で直した日・休み希望・休暇を上書きしない＝押し直しても壊れない）。
// 値は管理者の編集値（adjustedStart/End）と日別の休憩（adjustedBreak・分）で書く＝シフト作成タブのセル編集と同じ置き場。
function fillFixedPattern(o){
  const x=o||{};
  const start=String(x.start||""),end=String(x.end||"");
  const brk=Math.max(0,Math.round(Number(x.breakMin)||0));
  const settings=x.settings||{};const aliases=settings.staffAliases||{};
  const newSubs=[...(x.subs||[])];
  let filled=0;
  const targetDates=(x.dates||[]).filter(d=>!isWeekendOrHoliday(d)&&!isClosedDateOf(settings,d));
  (x.names||[]).forEach(name=>{
    if(!name||isSpacer(name))return;
    let idx=newSubs.findIndex(s=>s&&s.periodId===x.periodId&&s.staffName===name);
    if(idx<0)for(const a of(aliases[name]||[])){idx=newSubs.findIndex(s=>s&&s.periodId===x.periodId&&s.staffName===a);if(idx>=0)break;}
    let sub=idx>=0?{...newSubs[idx],shifts:{...(newSubs[idx].shifts||{})}}
      :{id:(x.genId||genSecureId)(24),periodId:x.periodId,staffName:name,shopId:x.shopId||"",shifts:{},comment:"",submittedAt:x.nowIso||new Date().toISOString(),source:"grid"};
    let n=0;
    targetDates.forEach(d=>{
      if(sub.shifts[d])return;
      const sd={status:"work",adjustedStart:start,adjustedEnd:end,adjustedStartNote:"",adjustedEndNote:""};
      if(brk>0)sd.adjustedBreak=brk;
      sub.shifts[d]=sd;n++;
    });
    if(!n)return;
    filled+=n;
    if(idx>=0)newSubs[idx]=sub;else newSubs.push(sub);
  });
  return{subs:newSubs,filled,dates:targetDates.length};
}

// ===== 実績（2026-09-30・P4・計画書 §3.6・§4.1）=====
// shops/{sid}/actuals/{periodId}/{名前}/{YYYY-MM-DD} = {start?, end?, breakMin?, absent?, absentMin?, legalHoliday?, note?}。
// **確定シフトと違う項目だけを持つ**（未入力の日・項目は確定シフト＝実績とみなす）。subs には書かない
// （スタッフの提出で消えない・確定ロックと独立に書ける・打刻 CSV の取込に差し替えやすい）。読み書きはオーナーのみ。
// 以後の割増計算（P5）は resolveActualDay の戻り値だけを入力にする。
const ACTUAL_FIELDS=["start","end","breakMin","absent","absentMin","legalHoliday","note"];
const ACTUAL_NOTE_MAX=200;
const ACTUAL_MIN_MAX=24*60;
const ACTUAL_CLOCK_MAX=30*60; // 30:00（翌6:00）まで。シフト作成タブのセル（parseTime）と同じ上限
function _clockToMin(t){
  const m=/^(\d{1,2}):([0-5]\d)$/.exec(String(t==null?"":t).trim());
  if(!m)return null;
  const v=Number(m[1])*60+Number(m[2]);
  return v<=ACTUAL_CLOCK_MAX?v:null;
}
function minToClock(min){
  if(min==null||min==="")return""; // Number(null)=0 を 00:00 にしない
  const n=Number(min);
  if(!Number.isFinite(n)||n<0)return"";
  const r=Math.round(n);
  return`${String(Math.floor(r/60)).padStart(2,"0")}:${String(r%60).padStart(2,"0")}`;
}
// 時刻の入力（シフト作成タブのセルと同じ読み方）: "9" → 09:00、"930" → 09:30、"9:30"、"9.5" → 09:30、"25" → 25:00。
// 読めなければ ""（空欄も ""）
function parseClockInput(v){
  const s=String(v==null?"":v).trim();
  if(!s)return"";
  const ok=(h,m)=>h>=0&&h<=30&&m>=0&&m<60&&h*60+m<=ACTUAL_CLOCK_MAX;
  const out=(h,m)=>`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  let m=/^(\d{1,2})[:：](\d{2})$/.exec(s);
  if(m){const h=Number(m[1]),mi=Number(m[2]);return ok(h,mi)?out(h,mi):"";}
  if(/^\d+\.\d+$/.test(s)){const n=parseFloat(s);const h=Math.floor(n);const mi=Math.round((n-h)*60);return ok(h,mi)?out(h,mi):"";}
  if(/^\d+$/.test(s)){
    const n=parseInt(s,10);
    if(s.length<=2)return ok(n,0)?out(n,0):"";
    const h=Math.floor(n/100),mi=n%100;return ok(h,mi)?out(h,mi):"";
  }
  return"";
}
// 分の入力（休憩・遅刻早退）: "60" → 60、"1:00" → 60。空欄は null、読めなければ NaN
function parseMinutesInput(v){
  const s=String(v==null?"":v).trim();
  if(!s)return null;
  if(/^\d{1,4}$/.test(s))return Number(s);
  const m=/^(\d{1,2})[:：]([0-5]\d)$/.exec(s);
  return m?Number(m[1])*60+Number(m[2]):NaN;
}
// getBreaksFor の休憩を位置つきの帯にする（深夜の計算・P5）。時間帯方式の帯だけが位置を持ち、長さ方式・
// 日別の上書きの休憩（synthetic＝勤務の先頭に置いた控除量だけの帯）が1つでもあれば位置は分からない＝null（按分する）
function breakBandsOf(brks){
  const list=(brks||[]).filter(b=>b&&b.start&&b.end);
  if(list.some(b=>b.synthetic))return null;
  const t=x=>{const p=String(x).split(":").map(Number);return p[0]*60+p[1];};
  return list.map(b=>({startMin:t(b.start),endMin:t(b.end)})).filter(b=>b.endMin>b.startMin);
}
// 確定シフトのその日（§4.1 の scheduledDay）。シフト作成タブの月実働（laborDayMin）・人×月の所定（aggregateScheduledMonth）と
// 同じ経路で数える: calcNetWorkMinutes（getBreaksFor の休憩控除・退勤延長・片側セルの補完・締の追加出勤を含む）。
// endMin は退勤延長を足した後の退勤（実績の初期値として見せる値）。breakMin は主シフトから実際に引いた休憩。
// settings はその期間の設定（確定済みなら写し）を渡す。staffName を省くと sub.staffName（別名のことがある）。
function scheduledDay(sub,date,settings,staffName){
  const st=settings||{};
  const name=staffName||(sub&&sub.staffName)||"";
  const sh=sub&&sub.shifts?sub.shifts[date]:null;
  const out={startMin:null,endMin:null,breakMin:0,workMin:0,extraMin:0,isRest:true,segments:[],breakBands:[]};
  if(!sh||sh.status!=="work")return out;
  const rng=effShiftRangeMin(sh,st);
  const ot=getOT(name,st,sh);
  const brks=getBreaksFor(st,date,name,sh);
  const work=calcNetWorkMinutes(sh,brks,ot,st);
  out.breakBands=breakBandsOf(brks);
  if(rng){
    out.startMin=rng.startMin;out.endMin=rng.endMin+(ot>0?ot:0);
    out.segments.push({startMin:out.startMin,endMin:out.endMin});
  }
  if(sh.extraStart&&sh.extraEnd){
    const es=_clockToMin(sh.extraStart),ee=_clockToMin(sh.extraEnd);
    if(es!=null&&ee!=null&&ee>es){out.extraMin=ee-es;out.segments.push({startMin:es,endMin:ee,extra:true});}
  }
  out.workMin=work;
  out.breakMin=Math.max(0,(rng?out.endMin-out.startMin:0)+out.extraMin-work);
  out.isRest=work<=0;
  return out;
}
// 実績の1日（§4.1 の resolveActualDay）。実績 = actual ?? 確定シフト。
//  - 実績が無い日・項目は確定シフトの値（未入力＝確定シフトが実績）
//  - start/end は主シフトを置き換える。**退勤延長は足さない**（入れた退勤が実際の退勤）。「締」の追加出勤は確定シフトのまま足す
//  - 休憩は breakMin があればそれ、無ければ確定シフトと同じ getBreaksFor の経路（時刻が変わった日は変わった時刻で判定し直す）
//  - absent（欠勤）は実働0・不就労＝確定シフトの実働（absentMin で上書き可）。absentMin（遅刻・早退の不就労分）は
//    賃金の控除（P6b）に使う値で、実働（workMin）からは引かない（時刻を直せば実働に反映される）
//  - legalHoliday は手動のフラグだけを返す（既定の自動判定＝週に休日が無いときの最後の勤務日は P5 の legalHolidayOf）
function resolveActualDay(sub,actual,date,settings,staffName){
  const st=settings||{};
  const name=staffName||(sub&&sub.staffName)||"";
  const sched=scheduledDay(sub,date,st,name);
  const a=_isPlainObj(actual)?actual:null;
  const hasActual=!!a&&ACTUAL_FIELDS.some(k=>a[k]!=null&&a[k]!==false&&a[k]!=="");
  const legal=!!(a&&a.legalHoliday===true);
  const numOr=(v,d)=>{const n=Number(v);return v!=null&&v!==""&&Number.isFinite(n)&&n>=0?Math.round(n):d;};
  const base={scheduledWorkMin:sched.workMin,hasActual,note:a&&typeof a.note==="string"?a.note:""};
  if(!a)return{...base,startMin:sched.startMin,endMin:sched.endMin,breakMin:sched.breakMin,workMin:sched.workMin,
    absentMin:0,isRest:sched.isRest,isLegalHoliday:false,absent:false,segments:sched.segments,breakBands:sched.breakBands};
  if(a.absent===true){
    return{...base,startMin:null,endMin:null,breakMin:0,workMin:0,absentMin:numOr(a.absentMin,sched.workMin),
      isRest:false,isLegalHoliday:false,absent:true,segments:[],breakBands:[]};
  }
  const absentMin=numOr(a.absentMin,0);
  const as=a.start!=null&&a.start!==""?_clockToMin(a.start):null;
  const ae=a.end!=null&&a.end!==""?_clockToMin(a.end):null;
  const brkGiven=a.breakMin!=null&&a.breakMin!==""&&Number.isFinite(Number(a.breakMin));
  const extraSeg=sched.segments.filter(sg=>sg.extra);
  let startMin=sched.startMin,endMin=sched.endMin,breakMin=sched.breakMin,mainWork=sched.workMin-sched.extraMin;
  // 休憩の位置（深夜の計算・P5）。実績で休憩の分だけを入れた日は位置が分からない＝null（按分）
  let breakBands=sched.breakBands;
  if(as!=null||ae!=null){
    startMin=as!=null?as:sched.startMin;endMin=ae!=null?ae:sched.endMin;
    if(startMin==null||endMin==null||endMin<=startMin){
      startMin=null;endMin=null;breakMin=0;mainWork=0;breakBands=[];
    }else if(brkGiven){
      breakMin=Math.min(Math.max(0,Math.round(Number(a.breakMin))),endMin-startMin);mainWork=endMin-startMin-breakMin;breakBands=null;
    }else{
      // 変わった時刻で休憩を判定し直す（確定シフトと同じ getBreaksFor の経路）。退勤延長は足さない
      const sh=(sub&&sub.shifts&&sub.shifts[date])||{};
      const synth={...sh,status:"work",adjustedStart:minToClock(startMin),adjustedEnd:minToClock(endMin)};
      delete synth.adminRest;delete synth.extraStart;delete synth.extraEnd;
      const stNoOt=st.overtimeSettings?{...st,overtimeSettings:undefined}:st;
      const brks=getBreaksFor(stNoOt,date,name,synth);
      mainWork=calcNetWorkMinutes(synth,brks,0,stNoOt);
      breakMin=Math.max(0,endMin-startMin-mainWork);
      breakBands=breakBandsOf(brks);
    }
  }else if(brkGiven&&startMin!=null&&endMin!=null){
    breakMin=Math.min(Math.max(0,Math.round(Number(a.breakMin))),endMin-startMin);mainWork=endMin-startMin-breakMin;breakBands=null;
  }
  const segments=[...(startMin!=null?[{startMin,endMin}]:[]),...extraSeg];
  const workMin=Math.max(0,mainWork)+sched.extraMin;
  return{...base,startMin,endMin,breakMin,workMin,absentMin,isRest:workMin<=0,isLegalHoliday:legal,absent:false,segments,breakBands};
}
// 実績の入力1件を、確定シフトと違う項目だけの記録にする。patch は shops/{sid}/actuals への update 用
// （{"期間ID/名前/日付": 記録 | null}。null＝確定シフトに戻す）。入力: entry={start?,end?,breakMin?,absent?,absentMin?,legalHoliday?,note?}
// （start/end は入力の文字列のまま・空欄は確定シフトの値、breakMin/absentMin は数値か入力の文字列）。
function planActualEdit(o){
  const x=o||{};
  const pid=String(x.periodId||""),name=x.name,date=String(x.date||"");
  if(!pid||firebaseKeyForbiddenChars(pid).length)return{error:"期間が正しくありません"};
  if(!name||typeof name!=="string"||firebaseKeyForbiddenChars(name).length)return{error:"名前が正しくありません"};
  if(!isValidDateStr(date))return{error:"日付が正しくありません"};
  const key=`${pid}/${name}/${date}`;
  const e=x.entry;
  if(e==null)return{patch:{[key]:null},record:null};
  const st=x.settings||{};
  const sched=scheduledDay(x.sub,date,st,name);
  const note=typeof e.note==="string"?e.note.trim():"";
  if(note.length>ACTUAL_NOTE_MAX)return{error:`メモは${ACTUAL_NOTE_MAX}文字までです`};
  const readMin=(v,label)=>{
    const n=typeof v==="number"?v:parseMinutesInput(v);
    if(n==null)return{v:null};
    if(!Number.isInteger(n)||n<0||n>ACTUAL_MIN_MAX)return{error:`${label}は0〜${ACTUAL_MIN_MAX}分の整数にしてください`};
    return{v:n};
  };
  const ab=readMin(e.absentMin,"遅刻・早退");
  if(ab.error)return{error:ab.error};
  const rec={};
  if(e.absent===true){
    if(sched.workMin<=0)return{error:"予定の無い日は欠勤にできません"};
    rec.absent=true;
    if(ab.v!=null&&ab.v!==sched.workMin)rec.absentMin=ab.v;
    if(note)rec.note=note;
    return{patch:{[key]:rec},record:rec};
  }
  const readClock=(v,label)=>{
    if(v==null||String(v).trim()==="")return{v:null};
    const c=parseClockInput(v);
    return c?{v:c}:{error:`${label}の時刻が読めません（例: 9:30・25:00）`};
  };
  const sT=readClock(e.start,"出勤"),eT=readClock(e.end,"退勤");
  if(sT.error)return{error:sT.error};
  if(eT.error)return{error:eT.error};
  const sMin=sT.v!=null?_clockToMin(sT.v):sched.startMin,eMin=eT.v!=null?_clockToMin(eT.v):sched.endMin;
  if((sT.v!=null||eT.v!=null)&&(sMin==null||eMin==null))return{error:"予定の無い日は出勤と退勤の両方を入れてください"};
  if(sMin!=null&&eMin!=null&&eMin<=sMin)return{error:"退勤は出勤より後にしてください（深夜は 25:00 のように入力します）"};
  if(sT.v!=null&&_clockToMin(sT.v)!==sched.startMin)rec.start=sT.v;
  if(eT.v!=null&&_clockToMin(eT.v)!==sched.endMin)rec.end=eT.v;
  const bk=readMin(e.breakMin,"休憩");
  if(bk.error)return{error:bk.error};
  if(bk.v!=null){
    if(sMin==null||eMin==null)return{error:"勤務の無い日に休憩は入れられません"};
    if(bk.v>=eMin-sMin)return{error:"休憩が勤務時間以上になっています"};
    // 自動で決まる休憩と同じ値なら持たない（確定シフトと同じ経路で決まる値＝差分ではない）
    const auto=resolveActualDay(x.sub,{...rec},date,st,name);
    if(bk.v!==auto.breakMin)rec.breakMin=bk.v;
  }
  if(ab.v)rec.absentMin=ab.v;
  if(e.legalHoliday===true)rec.legalHoliday=true;
  if(note)rec.note=note;
  const has=Object.keys(rec).length>0;
  return{patch:{[key]:has?rec:null},record:has?rec:null};
}
function actualOf(actuals,periodId,name,date){
  const p=_isPlainObj(actuals)?actuals[periodId]:null;
  const n=_isPlainObj(p)?p[name]:null;
  const r=_isPlainObj(n)?n[date]:null;
  return _isPlainObj(r)?r:null;
}
// スタッフ名キーの期間別ノード（shops/{sid}/actuals/{期間ID}/{名前}）。STAFF_KEYED_MONTH_NODES の隣の一覧。
// 改名は renameStaffInActuals、削除は dropStaffFromActuals を通す。CF の改名（companyRenameStaff）も同じ規則（テストが照合する）
const STAFF_KEYED_PERIOD_NODES=["actuals"];
function renameStaffInActuals(actuals,oldName,newName){
  const ac=_isPlainObj(actuals)?actuals:{};
  if(!oldName||!newName||oldName===newName)return null;
  const out={};
  Object.keys(ac).forEach(pid=>{const m=ac[pid];if(_isPlainObj(m)&&m[oldName]!=null){out[`${pid}/${newName}`]=m[oldName];out[`${pid}/${oldName}`]=null;}});
  return Object.keys(out).length?out:null;
}
function dropStaffFromActuals(actuals,names){
  const ac=_isPlainObj(actuals)?actuals:{};
  const out={};
  Object.keys(ac).forEach(pid=>{const m=ac[pid];if(!_isPlainObj(m))return;(names||[]).forEach(n=>{if(n&&m[n]!=null)out[`${pid}/${n}`]=null;});});
  return Object.keys(out).length?out:null;
}
// ===== 実績の CSV 取込（P4 後半）=====
// 打刻機の形式は未確定なので、列の位置（1始まり・0=使わない）と見出し行の有無を店舗設定 settings.actualsCsv に持つ。
// 1行＝1人1日（日付・名前・出勤・退勤・休憩）。名前は別名解決（resolveAlias）を通す。取り込む先は選択中の期間だけ。
const ACTUALS_CSV_FIELDS=["date","name","start","end","breakMin"];
const ACTUALS_CSV_FIELD_LABELS={date:"日付",name:"名前",start:"出勤",end:"退勤",breakMin:"休憩（分）"};
const DEFAULT_ACTUALS_CSV_MAPPING={hasHeader:true,date:1,name:2,start:3,end:4,breakMin:5};
function actualsCsvMappingOf(settings){
  const raw=(settings&&settings.actualsCsv)||{};
  const out={hasHeader:raw.hasHeader===undefined?DEFAULT_ACTUALS_CSV_MAPPING.hasHeader:raw.hasHeader===true};
  ACTUALS_CSV_FIELDS.forEach(f=>{const n=Number(raw[f]);out[f]=Number.isInteger(n)&&n>=0&&n<=50?n:DEFAULT_ACTUALS_CSV_MAPPING[f];});
  return out;
}
// CSV の行と列（引用符・"" のエスケープ・CRLF・先頭の BOM に対応。区切りはカンマかタブ＝1行目に多い方）
function parseCsvRows(text){
  const s=String(text==null?"":text).replace(/^﻿/,"");
  const first=s.split(/\r?\n/)[0]||"";
  const sep=(first.split("\t").length>first.split(",").length)?"\t":",";
  const rows=[];let row=[],cur="",q=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(q){if(c==='"'){if(s[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;continue;}
    if(c==='"'){q=true;continue;}
    if(c===sep){row.push(cur);cur="";continue;}
    if(c==="\r")continue;
    if(c==="\n"){row.push(cur);rows.push(row);row=[];cur="";continue;}
    cur+=c;
  }
  if(cur!==""||row.length){row.push(cur);rows.push(row);}
  return rows.filter(r=>r.some(v=>String(v).trim()!==""));
}
// 日付: 2026-10-01 ／ 2026/10/1 ／ 2026年10月1日 ／ 10/1（年は期間から。期間に入る年を採る）
function parseCsvDate(v,period){
  const s=String(v==null?"":v).trim();
  const f=(y,m,d)=>`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  let m=/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(s);
  if(m){const ds=f(m[1],m[2],m[3]);return isValidDateStr(ds)?ds:null;}
  m=/^(\d{1,2})[/月](\d{1,2})日?$/.exec(s);
  if(m&&period&&isValidDateStr(period.startDate)&&isValidDateStr(period.endDate)){
    const ys=[Number(period.startDate.slice(0,4)),Number(period.endDate.slice(0,4))];
    for(const y of ys){const ds=f(y,m[1],m[2]);if(isValidDateStr(ds)&&period.startDate<=ds&&ds<=period.endDate)return ds;}
    const ds=f(ys[0],m[1],m[2]);return isValidDateStr(ds)?ds:null;
  }
  return null;
}
// 取込の計画。返り値 {patch, applied, rows:[{line, date, name, ok, reason}]}。patch は planActualEdit と同じ形で、
// 既存の実績の欠勤は外し、法定休日・遅刻早退・メモは残す（打刻が来た日は出勤した日）。同じ人・同じ日の2行目以降は使わない。
function planActualsImport(o){
  const x=o||{};
  const period=x.period||{};const pid=period.id;
  const mp=x.mapping||DEFAULT_ACTUALS_CSV_MAPPING;
  const st=x.settings||{};const aliases=st.staffAliases||{};
  const names=new Set((x.staffList||[]).filter(n=>n&&!isSpacer(n)));
  const byName=new Map();
  (x.subs||[]).forEach(s=>{if(s&&s.periodId===pid&&s.staffName&&!byName.has(s.staffName))byName.set(s.staffName,s);});
  const subOf=n=>resolveSubByAlias(k=>byName.get(k),n,aliases);
  const rows=parseCsvRows(x.text);
  const body=mp.hasHeader?rows.slice(1):rows;
  const col=(r,f)=>{const i=Number(mp[f]);return i>0?String(r[i-1]==null?"":r[i-1]).trim():"";};
  const patch={};const out=[];const seen=new Set();let applied=0;
  body.forEach((r,i)=>{
    const line=i+1+(mp.hasHeader?1:0);
    const date=parseCsvDate(col(r,"date"),period);
    const raw=col(r,"name");
    const name=resolveAlias(raw,aliases);
    const res={line,date,name:name||raw,ok:false,reason:""};
    out.push(res);
    if(!date){res.reason="日付が読めません";return;}
    if(!(period.startDate<=date&&date<=period.endDate)){res.reason="期間の外の日付です";return;}
    if(!raw){res.reason="名前がありません";return;}
    if(!names.has(name)){res.reason="この期間のスタッフにいない名前です";return;}
    const k=name+"|"+date;
    if(seen.has(k)){res.reason="同じ人・同じ日の2行目以降は取り込みません";return;}
    seen.add(k);
    const cur=actualOf(x.actuals,pid,name,date)||{};
    const entry={start:col(r,"start"),end:col(r,"end"),breakMin:col(r,"breakMin")||null,
      absentMin:cur.absentMin,legalHoliday:cur.legalHoliday===true,note:cur.note||""};
    if(!entry.start||!entry.end){res.reason="出勤と退勤の両方が要ります";return;}
    const pl=planActualEdit({periodId:pid,name,date,entry,sub:subOf(name),settings:st});
    if(pl.error){res.reason=pl.error;return;}
    Object.assign(patch,pl.patch);res.ok=true;applied++;
  });
  return{patch,applied,rows:out};
}

// ===== 非表示マウントが読む提出の範囲（2026-09-30・P7 の前に実測して修正）=====
// 一括PDF・企業横断ダッシュボードは ShiftEditTab を画面外へマウントし pastSubsLoaded=true を渡す。ShiftEditTab は
// pastSubsLoaded=true の期間を「提出を読めている」とみなすので、**読んでいない期間は空欄＝実働0・全日公休として**
// 年度の累計（年計・年平均所定・年の36協定・年間休日）に入り、「＋」（読めていない印）も付かない。
// そこで年度の全期間とその前後の週（年度の最初と最後の月も月ごとの値をその場で数えるので、月をまたぐ週・法定休日の週が要る）、
// 対象の日の前後の週にかかる期間を読む。first/last は対象の期間（または月）の最初と最後の日。年度は first の日付で決める
// （yearLaborSummary と同じ）。
function laborReadPeriodIds(periods,settings,first,last){
  if(!isValidDateStr(first)||!isValidDateStr(last))return[];
  const fyStart=fiscalYearStartMonthOf(settings);
  const months=fiscalYearMonths(fiscalYearOf(first,fyStart),fyStart);
  const fyFirst=`${months[0]}-01`;
  const fyLast=`${months[11]}-${String(daysInMonthOf(months[11])).padStart(2,"0")}`;
  const a=addDays(first,-7),b=addDays(last,7),fa=addDays(fyFirst,-7),fb=addDays(fyLast,7);
  const from=a<fa?a:fa,to=b>fb?b:fb;
  return(periods||[]).filter(p=>p&&p.id&&isValidDateStr(p.startDate)&&isValidDateStr(p.endDate)&&p.startDate<=to&&p.endDate>=from).map(p=>p.id);
}

// ===== 企業横断ダッシュボード（2026-09-30・労務給与_複数法人_実装計画.md §6 P7・§1 の要件5・16）=====
// 本部が法人→店舗→人の当月と年をひと目で見る。**時間の計算はシフト作成タブの労務判定表と同じ**（ShiftEditTab を画面外へ
// マウントし、書き出しジョブ exportJob.kind="dashboard" で人ごとの値を返させる＝月次賃金・一括PDFと同じ形）。
// ここに置くのはその値の並べ方（差・残り・件数・CSV）だけで、新しい労務の式は作らない。賃金（金額）は出さない。
const ANNUAL_REST_MIN_DAYS=52; // 年間休日の下限（週1日以上の休日を1年＝52週続けた日数・§1 の要件5）
// 年間休日の状態。restDays は年度の始め〜選んだ月の公休日数（yearLaborSummary の publicOff＝空欄も公休）。
// ok＝52日以上 ／ short＝足りない（年度の最後の月まで数え終えた、または残りの日を全部休んでも届かない）／
// pending＝まだ年度の途中で届きうる（読めていない期間があるときも途中として扱う）
function annualRestStatusOf(o){
  const x=o||{};
  const days=Math.max(0,Number(x.restDays)||0);
  const need=Math.max(0,ANNUAL_REST_MIN_DAYS-days);
  if(need===0)return{key:"ok",days,need};
  if(Number(x.missing)>0)return{key:"pending",days,need};
  if(x.final||need>Math.max(0,Number(x.remainDays)||0))return{key:"short",days,need};
  return{key:"pending",days,need};
}
// その月にかかる期間の確定・交付の進捗（periodStateOf の数え上げ）。submitted は提出以上（確定・交付を含む）
function monthPeriodProgressOf(periods,ym){
  const n=daysInMonthOf(ym);
  const out={total:0,submitted:0,confirmed:0,delivered:0,labels:[]};
  if(!n)return out;
  const first=`${ym}-01`,last=`${ym}-${String(n).padStart(2,"0")}`;
  (periods||[]).filter(p=>p&&p.id&&isValidDateStr(p.startDate)&&isValidDateStr(p.endDate)&&p.startDate<=last&&p.endDate>=first)
    .slice().sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate))).forEach(p=>{
      const st=periodStateOf(p);
      out.total++;
      if(st!=="pending")out.submitted++;
      if(st==="confirmed"||st==="delivered")out.confirmed++;
      if(st==="delivered")out.delivered++;
      out.labels.push(`${p.label||p.startDate}: ${PERIOD_STATE_LABELS[st]}`);
    });
  return out;
}
function monthProgressLabel(pg){
  if(!pg||!pg.total)return"期間なし";
  return`確定 ${pg.confirmed}/${pg.total}・交付 ${pg.delivered}/${pg.total}`;
}
// ShiftEditTab の書き出しジョブ（kind="dashboard"）が返す1人ぶん（r）と月の前提（ctx）から、表と CSV の値を作る。
// r: {name, number, attr, sys, skip?, dest?, homeName, schedMin, schedSource, schedPartial, avgMin, avgMissing,
//     monthOtH, monthPartial, yearMonths:[{ym,h,ag}], yearMissing:[ym], restDays, restMissing, helperUnread, unread}
// ctx: {capMin, capName, denomMin, agMonthH, agYearH, restRemainDays, restFinal}
// 判定の向きは労務判定表と同じ: 月所定の超過は A制で月が埋まっているとき（labor_sched 行）・月の残業の超過は月が埋まっているとき
// （laborFindingsFor の monthReady）・年の4項目は agreementYearFindings と同じ比較（残り＜0＝超過）。
function dashboardPersonView(r,ctx){
  const x=r||{},c=ctx||{};
  const v={...x};
  if(x.skip||x.dest)return v;
  const cap=Number(c.capMin)||0,den=Number(c.denomMin)||0;
  v.capMin=cap>0?cap:null;v.capName=c.capName||"";
  v.schedDiffMin=cap>0&&x.schedMin!=null?Math.round(Number(x.schedMin)-cap):null;
  v.schedOver=x.sys==="A"&&v.schedDiffMin>0&&!x.schedPartial;
  v.denomMin=den>0?den:null;
  v.avgDiffMin=x.avgMin!=null&&den>0?Math.round(Number(x.avgMin)-den):null;
  v.avgOver=v.avgDiffMin>0&&!(Number(x.avgMissing)>0);
  const st=agreementYearStatus(x.yearMonths||[]);
  const mH=Number(c.agMonthH)||0,yH=Number(c.agYearH)||0;
  v.monthOtH=Math.max(0,Number(x.monthOtH)||0);
  v.monthLeftH=mH>0?excelRound(mH-v.monthOtH,2):null;
  v.yearOtH=st.totalH;
  v.yearLeftH=yH>0?excelRound(yH-st.totalH,2):null;
  v.year720LeftH=excelRound(AGREEMENT_ANNUAL_CAP_H-st.totalH,2);
  v.worstAvgH=st.worstAvg?excelRound(st.worstAvg.avg,2):null;
  v.worstAvgW=st.worstAvg?st.worstAvg.w:null;
  v.avg80LeftH=st.worstAvg?excelRound(AGREEMENT_AVG_CAP_H-st.worstAvg.avg,2):null;
  v.n45=st.n45;v.n45Left=AGREEMENT_OVER45_COUNT_LIMIT-st.n45;
  v.yearPartial=(x.yearMissing||[]).length>0;
  v.agOver=(v.monthLeftH!=null&&v.monthLeftH<0&&!x.monthPartial)||(v.yearLeftH!=null&&v.yearLeftH<0)
    ||v.year720LeftH<0||(v.avg80LeftH!=null&&v.avg80LeftH<0)||v.n45Left<0;
  v.rest=x.restDays==null?null:annualRestStatusOf({restDays:x.restDays,missing:x.restMissing,remainDays:c.restRemainDays,final:c.restFinal});
  v.restShort=!!(v.rest&&v.rest.key==="short");
  return v;
}
// 店舗・法人の見出し行に出す件数（判定対象の人数と、それぞれの超過・不足の人数）
function dashboardCountsOf(views){
  const o={people:0,schedOver:0,avgOver:0,agOver:0,restShort:0};
  (views||[]).forEach(v=>{
    if(!v||v.skip||v.dest)return;
    o.people++;
    if(v.schedOver)o.schedOver++;
    if(v.avgOver)o.avgOver++;
    if(v.agOver)o.agOver++;
    if(v.restShort)o.restShort++;
  });
  return o;
}
// 表と CSV が共有する列。kind: "text" | "min"（分・H:MM）| "signedMin"（分・±H:MM）| "hours"（時間・H:MM）|
// "signedHours"（時間・±H:MM）| "count" | "days"。group は画面の見出しの上の段、csv は CSV の見出し（無ければ label）。
// screen:false の列は画面では見出し行（法人・店舗）に出すので表の列にしない
const DASHBOARD_COLUMNS=[
  {key:"entity",label:"法人",kind:"text",screen:false},{key:"shop",label:"店舗",kind:"text",screen:false},
  {key:"progress",label:"確定・交付",kind:"text",screen:false},
  {key:"number",label:"従業員番号",kind:"text",screen:false},{key:"name",label:"名前",kind:"text"},
  {key:"sys",label:"区分",kind:"text"},
  {key:"schedMin",label:"月所定",csv:"月所定",kind:"min",group:"所定"},{key:"capMin",label:"上限",csv:"所定上限",kind:"min",group:"所定"},
  {key:"schedDiffMin",label:"差",csv:"月所定と上限の差",kind:"signedMin",group:"所定"},
  {key:"avgMin",label:"年平均",csv:"年平均所定",kind:"min",group:"年平均所定"},{key:"denomMin",label:"分母",csv:"分母",kind:"min",group:"年平均所定"},
  {key:"avgDiffMin",label:"差",csv:"年平均所定と分母の差",kind:"signedMin",group:"年平均所定"},
  {key:"monthOtH",label:"月の残業",csv:"月の残業",kind:"hours",group:"36協定"},{key:"monthLeftH",label:"月の残り",csv:"36協定 月の残り",kind:"signedHours",group:"36協定"},
  {key:"yearOtH",label:"年の残業",csv:"年の残業",kind:"hours",group:"36協定"},{key:"yearLeftH",label:"年の残り",csv:"36協定 年の残り",kind:"signedHours",group:"36協定"},
  {key:"year720LeftH",label:"720hの残り",csv:"年720時間の残り",kind:"signedHours",group:"36協定"},
  {key:"worstAvgH",label:"複数月平均",csv:"複数月平均の最大",kind:"hours",group:"36協定"},{key:"avg80LeftH",label:"80hの残り",csv:"複数月平均80時間の残り",kind:"signedHours",group:"36協定"},
  {key:"n45",label:"45h超",csv:"月45時間超の回数",kind:"count",group:"36協定"},
  {key:"restDays",label:"年間休日",csv:"年間休日",kind:"days",group:"休日"},{key:"restNeed",label:"52日まで",csv:"52日までの残り",kind:"days",group:"休日"},
  {key:"notes",label:"注記",kind:"text"},
];
const DASHBOARD_SYS_LABELS={A:"変形",B:"通常",none:"対象外"};
// 1行の値（数値のまま）と注記。row = {view: dashboardPersonView の戻り値, entity, shop, progress, shopNote?}
function dashboardRowValues(row){
  const r=row||{},v=r.view||{};
  const val={entity:r.entity||"",shop:r.shop||"",progress:r.progress||"",number:v.number||"",name:v.name||"",
    sys:DASHBOARD_SYS_LABELS[v.sys]||""};
  // 店舗ごと集計できなかった行（期間が無い・読み込みに失敗）は店舗の注記だけを出す
  if(r.shopNote!=null){val.notes=String(r.shopNote);return val;}
  const notes=[];
  if(v.dest){notes.push(`所属店舗（${v.homeName||"別の店舗"}）で集計します`);val.notes=notes.join("／");return val;}
  if(v.skip){notes.push(v.skip==="none"?"判定対象外":"データがありません");val.notes=notes.join("／");return val;}
  Object.assign(val,{schedMin:v.schedMin,capMin:v.capMin,schedDiffMin:v.schedDiffMin,avgMin:v.avgMin,denomMin:v.denomMin,avgDiffMin:v.avgDiffMin,
    monthOtH:v.monthOtH,monthLeftH:v.monthLeftH,yearOtH:v.yearOtH,yearLeftH:v.yearLeftH,year720LeftH:v.year720LeftH,
    worstAvgH:v.worstAvgH,avg80LeftH:v.avg80LeftH,n45:v.n45,restDays:v.rest?v.rest.days:null,restNeed:v.rest?v.rest.need:null});
  if(v.monthPartial)notes.push("＋月の日がデータで埋まっていない途中の値");
  if(v.helperUnread||v.unread)notes.push("＋他店の勤務・実績を読み込めていない途中の値");
  if(v.schedSource==="auto")notes.push("所定は未確定（シフトから集計）");
  if(Number(v.avgMissing)>0)notes.push(`＋年平均所定に読み込めていない月が${v.avgMissing}か月`);
  if(v.yearPartial)notes.push(`＋年の残業に読み込めていない月（${(v.yearMissing||[]).join("・")}）`);
  if(Number(v.restMissing)>0)notes.push(`＋年間休日に読み込めていない期間が${v.restMissing}件`);
  if(v.worstAvgW)notes.push(`複数月平均の最大は${v.worstAvgW}か月`);
  if(v.rest)notes.push(v.rest.key==="ok"?"年間休日52日以上":v.rest.key==="short"?`年間休日が${v.rest.need}日足りません`:`年間休日はあと${v.rest.need}日（年度の途中）`);
  val.notes=notes.join("／");
  return val;
}
const _dashHM=h=>Math.round((Number(h)||0)*60);
function dashboardCellText(col,val){
  const v=val[col.key];
  if(v==null||v==="")return"";
  switch(col.kind){
    case"min":return fmtMin(Math.max(0,Math.round(Number(v)||0)));
    case"signedMin":return fmtSignedMin(v);
    case"hours":return fmtMin(Math.max(0,_dashHM(v)));
    case"signedHours":return fmtSignedMin(_dashHM(v));
    case"count":return`${v}回`;
    case"days":return`${v}日`;
    default:return String(v);
  }
}
// CSV（BOM は呼び出し側）。改行 CRLF・全セルを "" で囲む（月次賃金の CSV と同じ形）
function dashboardCsvOf(rows){
  const q=s=>`"${String(s).replace(/"/g,'""')}"`;
  const unit=c=>c.kind==="min"||c.kind==="signedMin"||c.kind==="hours"||c.kind==="signedHours"?"（時:分）":c.kind==="days"?"（日）":c.kind==="count"?"（回）":"";
  const head=DASHBOARD_COLUMNS.map(c=>q(`${c.csv||c.label}${unit(c)}`)).join(",");
  const body=(rows||[]).map(r=>{const val=dashboardRowValues(r);return DASHBOARD_COLUMNS.map(c=>q(dashboardCellText(c,val))).join(",");});
  return[head,...body].join("\r\n")+"\r\n";
}

// ===== Nodeテスト用エクスポート（ブラウザでは module 未定義のため無視される）=====
if(typeof module!=="undefined"&&module.exports){
  module.exports={premiumMonthOf,premiumDayInput,premiumMonthDates,premiumRowCell,NIGHT_WINDOWS_MIN,OVER60_THRESHOLD_MIN,nightOverlapMin,nightMinutesOf,premiumWeekStartOf,legalHolidayDatesOf,premiumBreakdownOf,premiumAgreementH,PREMIUM_FINDING_KEYS,premiumFindingsFor,breakBandsOf,helperActualDaysOn,HOLIDAY_DROP_SHIFT_FIELDS,validatePeriodDates,oneSidedFillBounds,effShiftRangeMin,PERIOD_SNAPSHOT_SETTING_KEYS,isPeriodEnded,buildPeriodSnapshot,periodSnapshotEqual,resolvePeriodMaster,mergeKeepStaff,keepAttrsOf,applyKeepAttrs,attrIdExists,BUILTIN_TYPES,isUnregisteredSubName,visibleStaffList,staffHiddenRanges,isStaffHiddenInPeriod,isStaffHiddenNow,hideStaffFrom,showStaffFrom,moveStaffHiddenBoundaries,PERIOD_SNAPSHOT_EXEMPT_STAFF_MAPS,STAFF_KEYED_SETTING_MAPS,renameStaffInSettings,renameStaffInPeriods,retainedPeriodIds,defaultKeepCount,PLAN_RANK_UI,PLAN_LABELS,fd,pd,gd,idp,sc,isHoliday,isWeekendOrHoliday,calcNetWorkMinutes,effShiftStart,effShiftEnd,getBreakList,shiftBandInfo,ADMIN_SHIFT_FIELDS,carryAdminShiftFields,HEAT_BAND_SPLIT_MIN,resolveBandValues,noteToHeatSection,heatSectionEntries,getBreaksFor,heatBreaksFor,lengthBandMismatchOf,lengthBandMismatchText,getOT,fmtMin,genToken,genSecureId,isSpacer,firebaseKeyForbiddenChars,cookieSafeKey,resolveAlias,aliasOwnerOf,resolveSubByAlias,buildSuggestList,STAFF_TYPE_LABELS,ATTR_PINNED_ORDER,sortAttrEntries,getAttrOptions,TO,TO_START,JH_DATES,CELL_COMMANDS,CELL_COLOR_LEGEND,isRestCommand,isReservedShopAbbr,extractNote,fixedShiftCommandFor,isFixedShiftEligibleShop,SUBS_WINDOW_MONTHS,subsWindowCutoff,recentPeriodIds,dateCandidateDisplayCutoff,subLastActionTime,deadlineGatePassed,subHasRealUpdate,sanitizeForSet,sanitizeForUpdate,diffSubForFlatWrite,applyFlatSubWrite,diffPeriodsForFlatWrite,dayTypeOf,matchPositionSlots,POSITION_DAY_TYPES,weekdayKeyToPositionDayType,candListsEqual,matchingPositionDayTypes,positionDayTypeFor,hasAnyRequiredPosition,requiredPositionsFor,isSpecialRedDate,LEGAL_DAILY_HOURS,LEGAL_WEEKLY_HOURS,LEGAL_DAILY_MIN,LEGAL_WEEKLY_MIN,LABOR_LONG_DAY_MIN,LABOR_SHORT_DAY_MIN,LABOR_SYSTEMS,LABOR_SYSTEM_LABELS,DEFAULT_LABOR_SYSTEM_BY_ATTR,laborSystemOf,laborSystemForStaff,DEFAULT_LABOR_SETTINGS,laborSettingsOf,weeklyLegalMinFromBase31,monthlyBaseMin,monthlyGuideMin,monthlyCapMin,monthlyCapMinFor,daysInMonthOf,yearDaysOf,monthlyScheduledCapMin,LABOR_SETTING_RANGES,laborMonthFrame,weeklyOverMinB,weeklyOverTotalMinB,TIME_ORDER_ERROR_HINT,isTimeOrderInvalid,inputCheckOfShift,isStaffNumberMissing,LABOR_FINDING_DATES_MAX,laborFindingDatesLabel,laborWeekDatesLabel,laborFindingsFor,laborFindingLabels,LABOR_DAY_FIX_KEYS,LABOR_DAY_ERR_LABELS,laborDayFindingsFor,excelRound,excelRoundUp,excelRoundDown,monthlyOvertimeH,prorateOvertimeH,dailyOverThresholdOf,dailyOverMinB,externalOverThresholdOf,OT_PRORATE_WINDOWS,OT_PRORATE_WINDOW_LABELS,OT_PRORATE_FIXED_MAX_MIN,HALF_MONTH_LAST_DAY,otProrateOf,staffOtProrateOf,overtimePlanOf,guideStatusOf,AGREEMENT_SINGLE_MONTH_CAP_H,AGREEMENT_LEGAL_ITEMS,overallVerdictOf,OVERALL_FIX_KEYS,BREAK_MODES,BREAK_MODE_LABELS,DEFAULT_BREAK_LENGTH,breakModeOf,breakLengthOf,BREAK_LENGTH_BASES,BREAK_LENGTH_BASIS_LABELS,BREAK_LENGTH_TIERS_MAX,breakLengthRuleOf,breakMinutesOf,breakDecisionOf,shiftBindingMin,isBreakShort,BREAK_SHORT_TARGET_MIN,LEAVE_TYPES,LEAVE_TYPE_LABELS,LEAVE_TYPE_CELL_TEXT,leaveCellTextOf,leaveFieldsOf,leaveHalfDaysOf,leaveTypeOf,dayRestKindOf,weekRestStateOf,SKILLED_WORKER_ATTR_KEYWORD,isSkilledWorkerAttr,skilledWeekRestStateOf,isSkilledWeekRestShort,skilledWeekSidesLabel,restCommandOf,DEFAULT_FISCAL_YEAR_START_MONTH,fiscalYearStartMonthOf,fiscalYearOf,fiscalYearLabel,compactLaborTotal,laborTotalsEqual,yearLaborSummary,paidLeaveRemaining,STAFF_LIMIT_WINDOWS,STAFF_LIMIT_DEFAULTS,staffLimitOf,limitStateOf,hasAnyStaffLimit,AGREEMENT_ANNUAL_CAP_H,AGREEMENT_AVG_CAP_H,AGREEMENT_OVER45_H,AGREEMENT_OVER45_COUNT_LIMIT,AGREEMENT_AVG_MONTHS,fiscalYearMonths,yearOvertimeMonths,agreementYearStatus,agreementYearFindings,COMPANY_LABOR_KEYS,COMPANY_LIMIT_KEYS,COMPANY_ATTR_ID_RE,isCompanyAttrId,genCompanyAttrId,applyCompanySettings,stripCompanySettings,companyControlledKeys,periodRangeKey,periodRangeLabel,collectPeriodRanges,findShopPeriodByRange,isValidDateStr,companyDeadlineFor,shopDeadlineFromLink,MONTHLY_DEADLINE_MAX,sanitizeMonthlyDeadlineDays,monthlyDeadlineDayLabel,monthlyDeadlineFor,shopDeadlineInfoFromLink,homeShopOf,isHelperAt,dupTargetShopsFor,personIndexOfMirror,samePersonRegistrations,personHomeShopOf,helperPersonOf,helperShopSettingsOn,helperWorkOn,otherShopDataOf,helperShopsOf,helperScheduleContext,COMPANY_SESSION_UID_PREFIX,isCompanySessionUid,excludedBandsOf,headcountAtOf,countPresentAt,headcountLabelOf,prorateMonthlyHours,attrMonthFrameOf,attrMonthFrame,findStaffByNumber,mergeStaffMatches,staffNumberSortKey,compareCompanyStaffRows,groupStaffRegs,groupStaffRegsWithPeople,PERSON_ID_RE,buildCompanyStaffRows,duplicatePersonCandidates,filterCompanyStaffRows,COMPANY_ENTITY_ID_RE,COMPANY_SHOP_KINDS,companyEntityIdOfShop,companyShopKindOf,companyEntityList,planLaborToEntities,GATED_FEATURES,featureEnabled,DEFAULT_RATE_DENOMINATOR_MIN,rateDenominatorMinOf,PAY_TYPES,PAY_TYPE_LABELS,isPayTypeFixed,defaultPayTypeOf,payRateBaseYen,hourlyRateOf,fixedOtAmountOf,MIN_WAGE_MAX_ENTRIES,sanitizeWageSettings,minWageOn,minWageCheck,normalizePayVersion,withFixedOtAmount,applyPayRevision,payVersionOn,STAFF_KEYED_PRIVATE_NODES,renameStaffInPay,dropStaffFromPay,maskYen,PREMIUM_RATE_KEYS,LEGAL_PREMIUM_RATES,PREMIUM_RATE_LABELS,PREMIUM_RATE_MAX,ROUNDING_RULES,ROUNDING_RULE_LABELS,premiumRatesOf,roundingRuleOf,roundYenFrac,DEDUCTION_ROUNDING,wageOf,deductionOf,monthlyPayBreakdown,PAYROLL_COLUMNS,payrollRowValues,payrollCellText,payrollCsvOf,sha256HexOfBytes,PAY_CODE_DEFAULT,PAY_CODE_RE,isValidPayCode,payCodeHash,isPayCodeRecord,verifyPayCode,payCodeIdentity,PAY_CODE_MAX_FAILS,PAY_CODE_LOCK_MS,PAY_UNLOCK_IDLE_MS,nextPayCodeLockout,payCodeWaitSec,FV_COL_NATURAL,FV_COL_MAX,fullViewColW,fullViewFontOf,isPeriodConfirmed,isPeriodDelivered,PERIOD_STATES,PERIOD_STATE_LABELS,periodStateOf,canConfirmPeriod,PERIOD_HISTORY_KINDS,PERIOD_HISTORY_LABELS,genPeriodHistoryKey,periodHistoryEntry,withPeriodHistory,periodHistoryList,monthsOfPeriod,monthDatesOf,aggregateScheduledMonth,isMonthFullyConfirmed,laborMonthOf,isLaborMonthFrozen,isLaborMonthEdited,planPeriodConfirmation,planPeriodUnconfirm,planPeriodDelivery,LABOR_MONTH_MAX_MIN,planLaborMonthManual,parseHoursMinutes,fmtSignedMin,STAFF_KEYED_MONTH_NODES,renameStaffInLaborMonths,dropStaffFromLaborMonths,yearScheduledAverage,isClosedDateOf,fillFixedPattern,ACTUAL_FIELDS,ACTUAL_NOTE_MAX,ACTUAL_MIN_MAX,minToClock,parseClockInput,parseMinutesInput,scheduledDay,resolveActualDay,planActualEdit,actualOf,STAFF_KEYED_PERIOD_NODES,renameStaffInActuals,dropStaffFromActuals,ACTUALS_CSV_FIELDS,ACTUALS_CSV_FIELD_LABELS,DEFAULT_ACTUALS_CSV_MAPPING,actualsCsvMappingOf,parseCsvRows,parseCsvDate,planActualsImport,laborReadPeriodIds,ANNUAL_REST_MIN_DAYS,annualRestStatusOf,monthPeriodProgressOf,monthProgressLabel,dashboardPersonView,dashboardCountsOf,DASHBOARD_COLUMNS,DASHBOARD_SYS_LABELS,dashboardRowValues,dashboardCellText,dashboardCsvOf};
}
