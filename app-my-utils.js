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

// ===== Nodeテスト用エクスポート（ブラウザでは module 未定義のため無視される）=====
if(typeof module!=="undefined"&&module.exports){
  module.exports={MY_TABS,isMyRouteHash,MY_DISPLAY_NAME_MAX,MY_NUMBER_MAX,MY_PASSWORD_MIN,toHalfWidthDigits,normalizeMyDisplayName,normalizeMyNumber,validateMyProfile,buildMyProfileRecord,myProfileOf,validateMyEmail,validateMyPassword,MY_CREDENTIAL_ERROR_CODES,isPermissionDeniedError,myAuthErrorMessage,isMyCredentialError,MY_BLOCK_MESSAGES,staffAccountBlockReason,myOwnerCheckShopIds,isStaffAccountMarked,mayBeStaffAccountUser,
    MY_LINK_METHOD_LABELS,MY_LINK_CODE_LEN,MY_LINK_CODE_TTL_MS,linkNumberKey,linkNameKey,normalizeLinkCode,isValidLinkCode,myStaffNamesOf,personIdForShopName,linkCandidatesFor,splitLinkRequests,staffLinksByName,renameStaffInStaffLinks,dropStaffFromStaffLinks,resolveMyLink,MY_LINK_INVALID_LABELS,buildLinkRequestRecord,fmtLinkCodeExpiry};
}
