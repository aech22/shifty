// ============================================================
// Shifty - 従業員画面（マイシフト・給料）の純粋関数（2026-10-04 新設・第2部 E0）
// ============================================================
// 計画: Shifty_実装計画_2026-10.md 第2部（E.0〜E.7）。画面は app-my.js（babel）に置き、
// ここにはブラウザ API に依存しない関数と定数だけを置く（Node のユニットテスト tests/my.test.js が読む）。
// app-utils.js は 34万字あり Babel Standalone の 500KB 上限に近いので、従業員画面の関数はこちらへ足す。
// 読み込み順は utils → my-utils → core → … → company → my → main（index.html）。
// app-utils.js の関数は使ってよい（先に読み込まれる）。app-core.js 以降の識別子はここから参照しない。
// ただし Node のテストはこのファイルだけを require するので、app-utils.js の関数を使う関数はテストで引数に渡す形にする。

// 下部タブ。並びと表示名の正本（app-my.js の MyTabBar が描く）
const MY_TABS=[
  {key:"shift",label:"マイシフト"},
  {key:"pay",label:"給料"},
  {key:"settings",label:"設定"},
];

// ===== ルート（E1）=====
// #/me で従業員画面を直接開く。app-core.js の parseUrl が MY_SCREEN_ENABLED のときだけ使う。
// 旧形式のスタッフURL（#/<token>）より先に判定する（"me" をトークンとして引きに行かないため）
function isMyRouteHash(h){return /^#\/me\/?$/.test(String(h==null?"":h));}

// ===== 入力の上限（E1）=====
// 登録ネームは店舗のスタッフ名と同じ上限（database.rules.json の staff/$i が 50 文字）。E2 の名前の照合で突き合わせる
const MY_DISPLAY_NAME_MAX=50;
// 従業員番号は settings.staffNumbers と同じ上限（スタッフ編集モーダルの番号欄が maxLength 8）
const MY_NUMBER_MAX=8;
// Firebase の下限は6文字。従業員画面は E5・E6 で本人の給料を扱うので8文字にする（管理者の登録は6文字のまま変えない）
const MY_PASSWORD_MIN=8;

const _MY_TRIM_RE=/^[\s　]+|[\s　]+$/g;
// 全角数字を半角に揃える（E.3「全角数字は半角に揃える。先頭のゼロは区別する」）。数字以外は変えない
function toHalfWidthDigits(s){
  return String(s==null?"":s).replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
}
// 登録ネーム: 前後の空白（全角を含む）だけを落とす。途中の空白は残す（E2 の名前照合が空白を除いて比べる）
function normalizeMyDisplayName(s){return String(s==null?"":s).replace(_MY_TRIM_RE,"");}
// 従業員番号: 全角数字を半角にし、前後の空白を落とす。先頭のゼロは残す（"012" と "12" は別の番号）
function normalizeMyNumber(s){return toHalfWidthDigits(s).replace(_MY_TRIM_RE,"");}

// プロフィールの検証。エラーの文言を返し、問題なければ null
function validateMyProfile(p){
  const name=normalizeMyDisplayName(p&&p.displayName);
  const num=normalizeMyNumber(p&&p.number);
  if(!name) return "登録ネームを入力してください";
  if(name.length>MY_DISPLAY_NAME_MAX) return `登録ネームは${MY_DISPLAY_NAME_MAX}文字以内にしてください`;
  if(num.length>MY_NUMBER_MAX) return `従業員番号は${MY_NUMBER_MAX}文字以内にしてください`;
  return null;
}
// users/{uid}/profile に書く形。番号が空ならキーを持たない（undefined を混ぜない＝fbSet が同期例外にしない）
function buildMyProfileRecord(p,nowIso){
  const rec={displayName:normalizeMyDisplayName(p&&p.displayName)};
  const num=normalizeMyNumber(p&&p.number);
  if(num) rec.number=num;
  rec.updatedAt=String(nowIso||"");
  return rec;
}
// 読んだ profile を画面の初期値にする（壊れた値・欠けた値は空文字に倒す）
function myProfileOf(v){
  const o=v&&typeof v==="object"?v:{};
  return{displayName:typeof o.displayName==="string"?o.displayName:"",number:typeof o.number==="string"?o.number:""};
}

function validateMyEmail(e){
  const s=String(e==null?"":e).trim();
  if(!s) return "メールアドレスを入力してください";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "メールアドレスの形式が正しくありません";
  return null;
}
// pw2 を渡したときだけ一致も見る（ログインは1回入力、登録と変更は確認用の2回目がある）
function validateMyPassword(pw,pw2){
  const s=String(pw==null?"":pw);
  if(!s) return "パスワードを入力してください";
  if(s.length<MY_PASSWORD_MIN) return `パスワードは${MY_PASSWORD_MIN}文字以上にしてください`;
  if(pw2!==undefined&&s!==String(pw2==null?"":pw2)) return "確認用のパスワードが一致しません";
  return null;
}

// Firebase Auth・RTDB のエラーコードを画面の文言にする。op は "register"|"login"|"reset"|"password"|"profile"
const MY_CREDENTIAL_ERROR_CODES=["auth/user-not-found","auth/wrong-password","auth/invalid-credential","auth/invalid-login-credentials"];
function isPermissionDeniedError(e){
  if(!e) return false;
  const c=String(e.code||"");
  return /^permission[-_]denied$/i.test(c)||/permission[_ ]denied/i.test(String(e.message||""));
}
function myAuthErrorMessage(e,op){
  const code=String((e&&e.code)||"");
  if(op==="profile"||isPermissionDeniedError(e)){
    if(isPermissionDeniedError(e)) return "保存できませんでした（サーバー側の設定が未反映の可能性があります）";
    return "保存できませんでした。通信状態を確認してもう一度お試しください";
  }
  if(code==="auth/email-already-in-use") return "このメールアドレスは既に使われています";
  if(code==="auth/invalid-email") return "メールアドレスの形式が正しくありません";
  if(code==="auth/weak-password") return `パスワードは${MY_PASSWORD_MIN}文字以上にしてください`;
  if(MY_CREDENTIAL_ERROR_CODES.includes(code)) return op==="password"?"現在のパスワードが正しくありません":"メールアドレスまたはパスワードが正しくありません";
  if(code==="auth/too-many-requests") return "試行回数が多すぎます。しばらく待ってからもう一度お試しください";
  if(code==="auth/network-request-failed") return "通信できませんでした。通信状態を確認してもう一度お試しください";
  if(code==="auth/requires-recent-login") return "安全のため、一度ログアウトしてログインし直してから変更してください";
  if(code==="auth/provider-already-linked"||code==="auth/credential-already-in-use") return "この端末は既にアカウントに連結されています";
  const what={register:"アカウントの作成",login:"ログイン",reset:"メールの送信",password:"パスワードの変更"}[op]||"処理";
  return `${what}に失敗しました。もう一度お試しください`;
}
// ログインの失敗回数を数える対象（パスワード違いなど本人の入力の誤り）。通信エラーは数えない
function isMyCredentialError(e){return MY_CREDENTIAL_ERROR_CODES.includes(String((e&&e.code)||""));}

// ===== スタッフアカウントを作る・入れてよい端末か（E1）=====
// 匿名 uid に連結するとアカウントはその uid を引き継ぐ。店舗の owners に入っている uid を連結すると、
// そのアカウントでログインした別の端末にも管理権限が付いてしまう（owners は uid で判定するため）。
// 管理者の端末では作らせない・入らせない。戻り値は {code,message} か null（作ってよい）
const MY_BLOCK_MESSAGES={
  demo:"体験版では使えません",
  company:"企業アカウントでログイン中の端末では使えません",
  admin:"管理者のアカウントでログイン中の端末です。マイシフトはご自身のスマートフォンで使ってください",
  owner:"この端末は店舗の管理者として登録されています。マイシフトはご自身のスマートフォンで使ってください（管理者の端末でアカウントを作ると、そのアカウントに店舗の管理権限が付いてしまうため）",
  unknown:"端末の状態を確認できませんでした。通信状態を確認してもう一度お試しください",
  signin:"サインインできていません。ページを再読み込みしてください",
};
function staffAccountBlockReason(o){
  const x=o||{};
  const r=code=>({code,message:MY_BLOCK_MESSAGES[code]});
  if(x.demo) return r("demo");
  if(!x.hasUser) return r("signin");
  if(x.isCompanySession) return r("company");
  if(!x.isAnonymous) return x.isStaff?null:r("admin");
  if((x.adminKeyCount||0)>0||(x.ownerShopIds||[]).length>0) return r("owner");
  if(x.ownerCheckFailed) return r("unknown");
  return null;
}
// owners を確かめに行く店舗の一覧（重複・空・"default"・Firebase のキーになれない ID を除く）
const _MY_KEY_FORBIDDEN_RE=/[.#$[\]/\u0000-\u001f\u007f]/;
function myOwnerCheckShopIds(o){
  const x=o||{}, out=[];
  const add=id=>{ const s=typeof id==="string"?id:""; if(s&&s!=="default"&&!_MY_KEY_FORBIDDEN_RE.test(s)&&!out.includes(s)) out.push(s); };
  add(x.currentShopId);
  add(x.cookieShopId);
  Object.keys((x.adminKeys&&typeof x.adminKeys==="object")?x.adminKeys:{}).forEach(add);
  (Array.isArray(x.cachedShops)?x.cachedShops:[]).forEach(s=>add(s&&s.id));
  return out;
}
// localStorage の印（{uid}）がこの uid のものか。印は登録・ログインの成功時に書き、ログアウトで消す
function isStaffAccountMarked(mark,uid){return !!(mark&&typeof mark.uid==="string"&&mark.uid&&uid&&mark.uid===uid);}
// 印の無い実ユーザーのうち、スタッフアカウントかもしれないもの（users/{uid}/profile を読んで確かめる対象）。
// メール＋パスワードの uid だけ。企業ログイン（company_）と Google だけのアカウントは読まない
function mayBeStaffAccountUser(user){
  if(!user||user.isAnonymous) return false;
  if(String(user.uid||"").startsWith("company_")) return false;
  return (Array.isArray(user.providerData)?user.providerData:[]).some(p=>p&&p.providerId==="password");
}

// ===== 紐付け（E2）=====
// スタッフアカウントを「店舗＋登録名」に紐付ける3方式（計画書 E.3）。A＝従業員番号・B＝登録ネームは管理者への提案、
// C＝個人リンクコードは承認なし。照合の規則は Cloud Functions の functions/staff-link.js と**同じ内容**にする
// （functions/ はこのファイルを読めないので書き写している。一致は tests/my.test.js が照合する）。
// データ: shops/{sid}/linkRequests/{uid}（本人の申請）・shops/{sid}/staffLinks/{uid}（紐付け。名前の正本）・users/{uid}/links/{sid}（本人の索引）。
const MY_LINK_METHOD_LABELS={number:"従業員番号が一致",name:"登録ネームが一致",code:"個人リンクコード"};
const MY_LINK_CODE_LEN=8;
const MY_LINK_CODE_TTL_MS=24*60*60*1000;
const _MY_LINK_CODE_RE=/^[A-HJ-NP-Z2-9]{8}$/;
// 方式A の照合キー: 全角数字を半角にし前後の空白を落とす。数字だけのときだけキーになる（それ以外は ""＝照合しない）。先頭のゼロは残す
function linkNumberKey(s){const t=normalizeMyNumber(s);return /^[0-9]+$/.test(t)?t:"";}
// 方式B の照合キー: 空白（半角・全角、途中も含む）をすべて除く。それ以外は一字一句そのまま
function linkNameKey(s){return String(s==null?"":s).replace(/[\s　]/g,"");}
// 入力されたコード: 全角英数を半角に・小文字を大文字に・空白とハイフンを除く
function normalizeLinkCode(s){
  return String(s==null?"":s).replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
    .replace(/[\s　\-‐－ー]/g,"").toUpperCase();
}
function isValidLinkCode(s){return typeof s==="string"&&_MY_LINK_CODE_RE.test(s);}
const _myObj=v=>(v&&typeof v==="object"?v:null);
// 店舗の staff（配列か数値キーのオブジェクト）を名前の配列にする。空白列は除く
function myStaffNamesOf(staff){
  const arr=Array.isArray(staff)?staff:Object.values(_myObj(staff)||{});
  return arr.filter(n=>typeof n==="string"&&n&&!n.startsWith("__spacer__"));
}
// 企業連携の店舗の写しの人物（{personId:{shopId:登録名}}）から、その店舗のその名前の人物IDを引く
function personIdForShopName(mirrorPeople,shopId,name){
  const p=_myObj(mirrorPeople)||{};
  for(const id of Object.keys(p)){
    if(!/^(?:[0-9]{1,20}|p_[A-Za-z0-9]{8})$/.test(id))continue;
    if((_myObj(p[id])||{})[shopId]===name)return id;
  }
  return null;
}
// 申請 → 候補。req={displayName,number}、ctx={shopId,staff,staffNumbers,mirrorPeople,staffLinks,uid}。
// 戻り値は staff の並び順の [{name,methods,takenBy}]（takenBy＝その名前に既に紐付いている別の uid）
function linkCandidatesFor(req,ctx){
  const r=_myObj(req)||{},c=_myObj(ctx)||{};
  const names=myStaffNamesOf(c.staff);
  const nums=_myObj(c.staffNumbers)||{};
  const rn=linkNumberKey(r.number),rk=linkNameKey(r.displayName);
  const byNum=new Set();
  if(rn){
    names.forEach(n=>{if(linkNumberKey(nums[n])===rn)byNum.add(n);});
    const people=_myObj(c.mirrorPeople)||{};
    if(/^[0-9]{1,20}$/.test(rn)&&_myObj(people[rn])){
      const n=people[rn][c.shopId];
      if(typeof n==="string"&&names.includes(n))byNum.add(n);
    }
  }
  const takenOf={};
  Object.entries(_myObj(c.staffLinks)||{}).forEach(([u,rec])=>{const nm=(_myObj(rec)||{}).name;if(typeof nm==="string"&&u!==c.uid)takenOf[nm]=u;});
  const out=[];
  names.forEach(n=>{
    const methods=[];
    if(byNum.has(n))methods.push("number");
    if(rk&&linkNameKey(n)===rk)methods.push("name");
    if(methods.length)out.push({name:n,methods,takenBy:takenOf[n]||null});
  });
  return out;
}
// 申請の一覧を「提案あり」と「未リンクの申請」に分ける。requests={uid:{displayName,number,at}}。古い申請から
function splitLinkRequests(requests,ctx){
  const withCand=[],unmatched=[];
  Object.entries(_myObj(requests)||{}).filter(([,r])=>_myObj(r)).sort((a,b)=>String(a[1].at||"").localeCompare(String(b[1].at||"")))
    .forEach(([uid,r])=>{
      const cands=linkCandidatesFor(r,{...(ctx||{}),uid});
      (cands.length?withCand:unmatched).push({uid,req:r,cands});
    });
  return{withCand,unmatched};
}
// staffLinks を名前から引く（{名前: {uid, rec}}）
function staffLinksByName(staffLinks){
  const out={};
  Object.entries(_myObj(staffLinks)||{}).forEach(([u,r])=>{const rec=_myObj(r);if(rec&&typeof rec.name==="string")out[rec.name]={uid:u,rec};});
  return out;
}
// 改名・削除の追随（オーナーの端末が shops/{sid}/staffLinks に update する差分。CF の renameStaffLinksPatchCF / dropStaffLinksPatchCF と同じ）
const _MY_KEY_SAFE=k=>typeof k==="string"&&k.length>0&&k.length<=128&&!/[/.#$[\]\u0000-\u001f\u007f]/.test(k);
function renameStaffInStaffLinks(staffLinks,oldName,newName){
  const out={};
  Object.entries(_myObj(staffLinks)||{}).forEach(([u,rec])=>{if(_MY_KEY_SAFE(u)&&(_myObj(rec)||{}).name===oldName)out[`${u}/name`]=newName;});
  return Object.keys(out).length?out:null;
}
function dropStaffFromStaffLinks(staffLinks,names){
  const set=new Set((Array.isArray(names)?names:[]).filter(n=>typeof n==="string"));
  const out={};
  Object.entries(_myObj(staffLinks)||{}).forEach(([u,rec])=>{if(_MY_KEY_SAFE(u)&&set.has((_myObj(rec)||{}).name))out[u]=null;});
  return Object.keys(out).length?out:null;
}
// 本人のセッションから見た紐付けの1件（E3 以降が「どの店舗のどの名前か」を得る入口）。
// userLink=users/{uid}/links/{shopId}、staffLink=shops/{shopId}/staffLinks/{uid}、staff=shops/{shopId}/staff。
// **名前は staffLink の name を使う**（オーナーの端末の改名は staffLinks だけを書き換える）。次のどれかなら無効:
// 店舗側の紐付けが無い（解除・削除で消えた）／その名前がいまのスタッフ一覧に無い（改名・削除の追随が届かなかった）
function resolveMyLink(shopId,userLink,staffLink,staff){
  const ul=_myObj(userLink),sl=_myObj(staffLink);
  if(!ul&&!sl)return null;
  if(!sl||typeof sl.name!=="string"||!sl.name)return{shopId,ok:false,reason:"unlinked",name:ul&&typeof ul.name==="string"?ul.name:""};
  if(!myStaffNamesOf(staff).includes(sl.name))return{shopId,ok:false,reason:"missing",name:sl.name};
  const pid=typeof sl.personId==="string"&&sl.personId?sl.personId:null;
  return{shopId,ok:true,name:sl.name,personId:pid,method:sl.method||"",at:sl.at||""};
}
const MY_LINK_INVALID_LABELS={unlinked:"お店の側でリンクが外されました",missing:"お店のスタッフ一覧にこの名前がありません（名前の変更か削除）"};
// 申請に書く形（users の profile から作る）。番号が空ならキーを持たない
function buildLinkRequestRecord(profile,nowIso){
  const rec={displayName:normalizeMyDisplayName(profile&&profile.displayName),at:String(nowIso||"")};
  const num=normalizeMyNumber(profile&&profile.number);
  if(num)rec.number=num;
  return rec;
}
// 有効期限の表示（例 "2026/10/05 14:30"）。端末の時刻帯で出す
function fmtLinkCodeExpiry(ms){
  const d=new Date(ms);
  if(!Number.isFinite(d.getTime()))return"";
  const p=n=>String(n).padStart(2,"0");
  return`${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ===== マイシフト（2026-10-04・第2部 E3）=====
// app-utils.js の関数（scheduledDay・resolvePeriodMaster・resolveSubByAlias・isStaffHiddenInPeriod・isPeriodPublished・
// isPeriodConfirmed・featureEnabled・pd・fd）を使う。Node のテストはこのファイルだけを require するので、U（app-utils.js の
// module.exports）を引数で渡す。ブラウザでは省略してよい（同じ名前のグローバルを使う）
function _myU(U){
  if(U)return U;
  return{scheduledDay,resolvePeriodMaster,resolveSubByAlias,isStaffHiddenInPeriod,isPeriodPublished,isPeriodConfirmed,featureEnabled};
}
// 勤務先の色（ドット）。E3 は既定色だけで、E4 で本人が選べるようにする。差し替え口は overrides（{shopId:"#rrggbb"}）。
// 先頭はブランドのアクセント（#f87036）。2店舗目以降は落ち着いた色で、店舗の区別だけに使う（意味を持たない装飾にしない）
const MY_WORKPLACE_COLORS=["#f87036","#2f6f9f","#4f7d4a","#8a5a9e","#a3742c","#6b6b6b"];
function myWorkplaceColor(shopId,index,overrides){
  const o=_myObj(overrides);
  const c=o&&typeof o[shopId]==="string"&&/^#[0-9a-fA-F]{6}$/.test(o[shopId])?o[shopId]:null;
  return c||MY_WORKPLACE_COLORS[((Number(index)||0)%MY_WORKPLACE_COLORS.length+MY_WORKPLACE_COLORS.length)%MY_WORKPLACE_COLORS.length];
}
// 公開済みの表示（黒文字）を使えるか。紐付いた店舗のいずれかが Premium なら使える（計画書 E.5）。plans は店舗ごとの plan の配列
function myShiftPremiumOf(plans,U){
  const u=_myU(U);
  return(Array.isArray(plans)?plans:[]).some(p=>u.featureEnabled("myShift",{plan:p}));
}
const _myClockRe=/^(\d{1,2}):(\d{2})$/;
function _myClock(t){const m=_myClockRe.exec(String(t==null?"":t));if(!m)return null;const h=+m[1],mi=+m[2];return mi<60&&h<=30?h*60+mi:null;}
// 分 → "9:00"・"25:00"（シフト表と同じ24時超え表記）
function fmtMyClock(min){
  if(min==null||!Number.isFinite(Number(min)))return"";
  const n=Math.max(0,Math.round(Number(min)));
  return`${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`;
}
function fmtMyRange(e){
  if(!e)return"";
  const a=fmtMyClock(e.startMin),b=fmtMyClock(e.endMin);
  return a||b?`${a}〜${b}`:"";
}
// 期間が [from, to]（"YYYY-MM-DD"）に重なるか
function myPeriodOverlaps(p,from,to){return!!(p&&p.startDate&&p.endDate&&p.startDate<=to&&p.endDate>=from);}
function _myDatesOf(p){
  const out=[];
  if(!p||!/^\d{4}-\d{2}-\d{2}$/.test(String(p.startDate))||!/^\d{4}-\d{2}-\d{2}$/.test(String(p.endDate))||p.endDate<p.startDate)return out;
  const d=new Date(p.startDate+"T00:00:00Z");
  for(let i=0;i<62;i++){const s=d.toISOString().slice(0,10);if(s>p.endDate)break;out.push(s);d.setUTCDate(d.getUTCDate()+1);}
  return out;
}
// 1店舗ぶんのマイシフトの日（カレンダーの元データ）。読むだけで、店舗のデータには何も書かない。
// o = {shopId, shopName, color, name（staffLinks の登録名）, periods, subsByPeriod:{periodId: sub[]}, settings（企業設定を重ねた店舗の設定）,
//      staff（店舗のスタッフ一覧）, todayStr, premium}
// 返り値は日ごとの entry の配列:
//   {date, shopId, shopName, color, periodId, kind:"published"|"submitted", confirmed, startMin, endMin, breakMin, workMin, segments, hope, differs}
// - 公開済みの期間（premium のときだけ）: 確定シフト＝scheduledDay（管理者の調整値・退勤延長・締の追加出勤を含む）。出勤にならなかった日は出さない。
//   設定はその期間の設定（確定・終了済みなら写し＝resolvePeriodMaster）。その期間に非表示の人は出さない（シフト表に載らないため）
// - 未公開の期間: 本人の提出（希望）のうち出勤の日だけ（kind "submitted"・グレーで描く）
// subsByPeriod に無い期間（読めていない）は何も出さない
function buildMyShiftDays(o,U){
  const u=_myU(U);const x=o||{};
  const name=x.name;if(!name)return[];
  const out=[];
  (x.periods||[]).forEach(p=>{
    if(!p||!p.id)return;
    const list=x.subsByPeriod&&x.subsByPeriod[p.id];
    if(!Array.isArray(list))return;
    const master=u.resolvePeriodMaster(p,x.staff||[],x.settings||{},x.todayStr);
    const st=master.settings||{};
    const byName=new Map();
    list.forEach(s=>{if(s&&s.staffName&&s.periodId===p.id&&!byName.has(s.staffName))byName.set(s.staffName,s);});
    const sub=u.resolveSubByAlias(n=>byName.get(n),name,st.staffAliases||{});
    const published=!!x.premium&&u.isPeriodPublished(p);
    const confirmed=u.isPeriodConfirmed(p);
    if(published&&u.isStaffHiddenInPeriod(name,st,p))return;
    const base={shopId:x.shopId,shopName:x.shopName||"",color:x.color||MY_WORKPLACE_COLORS[0],periodId:p.id};
    _myDatesOf(p).forEach(date=>{
      const sh=sub&&sub.shifts?sub.shifts[date]:null;
      const hope=sh&&sh.status==="work"&&(sh.start||sh.end)?{startMin:_myClock(sh.start),endMin:_myClock(sh.end)}:null;
      if(published){
        const sd=u.scheduledDay(sub,date,st,name);
        if(sd.isRest||!(sd.workMin>0))return;
        const differs=!!hope&&(hope.startMin!==sd.startMin||hope.endMin!==sd.endMin);
        out.push({...base,date,kind:"published",confirmed,startMin:sd.startMin,endMin:sd.endMin,breakMin:sd.breakMin,workMin:sd.workMin,
          segments:sd.segments.map(g=>({startMin:g.startMin,endMin:g.endMin,extra:!!g.extra})),hope,differs});
      }else if(hope){
        out.push({...base,date,kind:"submitted",confirmed:false,startMin:hope.startMin,endMin:hope.endMin,breakMin:null,workMin:null,
          segments:[],hope,differs:false});
      }
    });
  });
  return out.sort((a,b)=>a.date.localeCompare(b.date)||String(a.shopId).localeCompare(String(b.shopId)));
}
// 1日の公開内容の指紋（「変更あり」の判定）。時刻・休憩・締の追加出勤で作る。確定の有無は含めない（内容の変化だけを見る）
function myDayFingerprint(e){
  if(!e)return"";
  const seg=(e.segments||[]).filter(g=>g.extra).map(g=>`+${g.startMin}-${g.endMin}`).join("");
  return`${e.startMin==null?"":e.startMin}-${e.endMin==null?"":e.endMin}-${e.breakMin==null?"":e.breakMin}${seg}`;
}
// 公開済みの entry を「店舗|期間」ごとの {日付: 指紋} にまとめる。キーは myShiftSeenKey
function myShiftSeenKey(shopId,periodId){return`${shopId}|${periodId}`;}
function myPublishedFingerprints(entries,publishedKeys){
  const out={};
  (publishedKeys||[]).forEach(k=>{out[k]={};});
  (entries||[]).forEach(e=>{
    if(!e||e.kind!=="published")return;
    const k=myShiftSeenKey(e.shopId,e.periodId);
    (out[k]=out[k]||{})[e.date]=myDayFingerprint(e);
  });
  return out;
}
// 前回見た指紋（users/{uid}/seen/{shopId}/{periodId}.days）と今の指紋を比べ、変わった日付を返す。
// seenRec が無い（初めて見る公開）なら null＝「変更あり」ではない（呼び出し側が今の内容を見たものとして記録する）
function myChangedDates(seenRec,curDays){
  const sr=_myObj(seenRec);
  if(!sr)return null;
  const a=_myObj(sr.days)||{},b=_myObj(curDays)||{};
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  return[...keys].filter(d=>(a[d]||"")!==(b[d]||"")).sort();
}
// seen に書く形。days が空でも at は書く（Firebase は空のオブジェクトを保存しないので days を持たない形になる）
function buildMySeenRecord(curDays,nowIso){
  const rec={at:String(nowIso||"")};
  const d=_myObj(curDays);
  if(d&&Object.keys(d).length)rec.days={...d};
  return rec;
}
// 今日以降で最も近い公開済みの出勤（同じ日なら店舗IDの順＝buildMyShiftDays の並び）
function nextMyShift(entries,todayStr){
  return(entries||[]).find(e=>e&&e.kind==="published"&&e.date>=String(todayStr||""))||null;
}
// 月のカレンダー（日曜はじまり）。週ごとに7つの {date, inMonth}。ym は "YYYY-MM"
function myMonthGrid(ym){
  const m=/^(\d{4})-(\d{2})$/.exec(String(ym||""));
  if(!m)return[];
  const y=+m[1],mo=+m[2];
  const first=new Date(Date.UTC(y,mo-1,1));
  const days=new Date(Date.UTC(y,mo,0)).getUTCDate();
  const start=new Date(first);start.setUTCDate(1-first.getUTCDay());
  const weeks=[];const cur=new Date(start);
  const cells=Math.ceil((first.getUTCDay()+days)/7)*7;
  for(let i=0;i<cells;i+=7){
    const w=[];
    for(let j=0;j<7;j++){const s=cur.toISOString().slice(0,10);w.push({date:s,inMonth:s.slice(0,7)===ym});cur.setUTCDate(cur.getUTCDate()+1);}
    weeks.push(w);
  }
  return weeks;
}
function myShiftMonth(ym,delta){
  const m=/^(\d{4})-(\d{2})$/.exec(String(ym||""));
  if(!m)return"";
  const d=new Date(Date.UTC(+m[1],+m[2]-1+(Number(delta)||0),1));
  return d.toISOString().slice(0,7);
}
// マイシフトで読む期間: 表示中の月にかかる期間と、今日以降にかかる期間（「次のシフト」のため）
function myShiftPeriodsToRead(periods,ym,todayStr){
  const from=`${ym}-01`,to=`${ym}-31`;
  return(periods||[]).filter(p=>p&&p.id&&(myPeriodOverlaps(p,from,to)||(p.endDate&&p.endDate>=String(todayStr||""))));
}

// ===== Nodeテスト用エクスポート（ブラウザでは module 未定義のため無視される）=====
if(typeof module!=="undefined"&&module.exports){
  module.exports={MY_TABS,isMyRouteHash,MY_DISPLAY_NAME_MAX,MY_NUMBER_MAX,MY_PASSWORD_MIN,toHalfWidthDigits,normalizeMyDisplayName,normalizeMyNumber,validateMyProfile,buildMyProfileRecord,myProfileOf,validateMyEmail,validateMyPassword,MY_CREDENTIAL_ERROR_CODES,isPermissionDeniedError,myAuthErrorMessage,isMyCredentialError,MY_BLOCK_MESSAGES,staffAccountBlockReason,myOwnerCheckShopIds,isStaffAccountMarked,mayBeStaffAccountUser,
    MY_LINK_METHOD_LABELS,MY_LINK_CODE_LEN,MY_LINK_CODE_TTL_MS,linkNumberKey,linkNameKey,normalizeLinkCode,isValidLinkCode,myStaffNamesOf,personIdForShopName,linkCandidatesFor,splitLinkRequests,staffLinksByName,renameStaffInStaffLinks,dropStaffFromStaffLinks,resolveMyLink,MY_LINK_INVALID_LABELS,buildLinkRequestRecord,fmtLinkCodeExpiry,
    MY_WORKPLACE_COLORS,myWorkplaceColor,myShiftPremiumOf,fmtMyClock,fmtMyRange,myPeriodOverlaps,buildMyShiftDays,myDayFingerprint,myShiftSeenKey,myPublishedFingerprints,myChangedDates,buildMySeenRecord,nextMyShift,myMonthGrid,myShiftMonth,myShiftPeriodsToRead};
}
