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
// ---- 追随の操作（2026-10-04）----
// オーナーの端末の改名・削除・追加の追随を「操作」として持ち、**その時点の staffLinks を読み直して**差分を作る（App の staffLinkOps）。
// 以前は購読のキャッシュ（staffLinkMapRef）から差分を作っていたので、購読が届く前の操作は何も書かれず、削除の追随が落ちたまま
// 同じ名前を登録し直すと、前任者のアカウントが新しい人のシフトを見られた。操作は店舗ごとに端末の localStorage に積み、
// 読めない・書けないときは残して、購読が届いたとき・オンラインに戻ったとき・次の操作のときにやり直す。
// **世代の目印**: 操作は自分の時刻 at を持ち、紐付けの at（CF が作った時刻）がそれより新しいものには当てない。やり直しが遅れても、
// 操作の後に作られた正しい紐付け（例: 前の紐付けが別の経路で外れたあとに同じ名前で承認されたもの）を消さないため
const MY_STAFF_LINK_OPS_MAX=100;
function staffLinkOpOf(kind,a,b,atIso){
  const at=typeof atIso==="string"&&atIso?atIso:"";
  if(kind==="drop"){
    const names=(Array.isArray(a)?a:[]).filter(n=>typeof n==="string"&&n);
    return names.length?{kind,names:[...new Set(names)],at}:null;
  }
  if(kind==="rename")return typeof a==="string"&&a&&typeof b==="string"&&b&&a!==b?{kind,from:a,to:b,at}:null;
  return null;
}
// 操作の時刻より後に作られた紐付けを除く（at が無い紐付けは古いものとして扱う）
function staffLinksAsOf(staffLinks,atIso){
  const all=_myObj(staffLinks)||{};
  if(!atIso)return all;
  const out={};
  Object.entries(all).forEach(([u,r])=>{const rec=_myObj(r);if(!rec)return;const at=typeof rec.at==="string"?rec.at:"";if(!at||at<=atIso)out[u]=rec;});
  return out;
}
// 読み直した staffLinks に操作を当てた update の差分（変わらなければ null）
function planStaffLinkOp(staffLinks,op){
  const o=_myObj(op);
  if(!o)return null;
  const base=staffLinksAsOf(staffLinks,o.at);
  if(o.kind==="drop")return dropStaffFromStaffLinks(base,o.names);
  if(o.kind==="rename")return renameStaffInStaffLinks(base,o.from,o.to);
  return null;
}
// 保留の列に足す（形の壊れた記録は捨てる・上限を超えたら古い方から落とす）
function enqueueStaffLinkOp(queue,op){
  const q=(Array.isArray(queue)?queue:[]).filter(x=>_myObj(x)&&(x.kind==="drop"||x.kind==="rename"));
  if(op)q.push(op);
  return q.length>MY_STAFF_LINK_OPS_MAX?q.slice(q.length-MY_STAFF_LINK_OPS_MAX):q;
}
const MY_STAFF_LINK_PENDING_MSG="▲ マイシフトのリンクの後始末を保留しました（リンクを読み込めませんでした）。この端末で管理画面を開いているあいだに、やり直します";
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
  return{scheduledDay,resolveActualDay,resolvePeriodMaster,resolveSubByAlias,isStaffHiddenInPeriod,isPeriodPublished,isPeriodConfirmed,featureEnabled,
    // 全員のシフト表（個別URL・2026-10-04）
    visibleStaffList,isSpacer,leaveCellTextOf,isHoliday,
    // 給料（E5）: 月次賃金ページ（P6b）・割増（P5）と同じ関数
    premiumMonthOf,premiumDayInput,dayRestKindOf,laborSystemForStaff,laborSettingsOf,rateDenominatorMinOf,payVersionOn,wageOf,deductionOf,
    premiumRatesOf,roundingRuleOf,roundYenFrac,nightMinutesOf,normalizePayVersion,isWeekendOrHoliday,OVER60_THRESHOLD_MIN};
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
    const base={shopId:x.shopId,workplaceId:x.shopId,shopName:x.shopName||"",color:x.color||MY_WORKPLACE_COLORS[0],periodId:p.id};
    const ovs=_myObj(x.overrides)||{};
    _myDatesOf(p).forEach(date=>{
      const sh=sub&&sub.shifts?sub.shifts[date]:null;
      const hope=sh&&sh.status==="work"&&(sh.start||sh.end)?{startMin:_myClock(sh.start),endMin:_myClock(sh.end)}:null;
      if(published){
        const sd=u.scheduledDay(sub,date,st,name);
        if(sd.isRest||!(sd.workMin>0))return;
        const differs=!!hope&&(hope.startMin!==sd.startMin||hope.endMin!==sd.endMin);
        const segOf=gs=>(gs||[]).map(g=>({startMin:g.startMin,endMin:g.endMin,extra:!!g.extra}));
        const sched={startMin:sd.startMin,endMin:sd.endMin,breakMin:sd.breakMin,workMin:sd.workMin,segments:segOf(sd.segments)};
        // 実績の上書き（E4・users/{uid}/overrides/{shopId}/{date}）。本人の画面と給料計算にだけ効く。
        // 計算は店舗の実績と同じ resolveActualDay（退勤延長は足さない・締の追加出勤は確定シフトのまま足す）。
        // 「変更あり」の指紋は公開内容（sched）で作る＝上書きしても変更ありにならない
        const ov=myOverrideOf(ovs[date]);
        const ad=u.resolveActualDay?u.resolveActualDay(sub,ov?{start:ov.start,end:ov.end,breakMin:ov.breakMin}:null,date,st,name):null;
        const eff=ov&&ad?{startMin:ad.startMin,endMin:ad.endMin,breakMin:ad.breakMin,workMin:ad.workMin,segments:segOf(ad.segments)}:sched;
        out.push({...base,date,kind:"published",confirmed,...eff,sched,overridden:!!(ov&&ad),override:ov&&ad?ov:null,actualDay:ad,hope,differs});
      }else if(hope){
        out.push({...base,date,kind:"submitted",confirmed:false,startMin:hope.startMin,endMin:hope.endMin,breakMin:null,workMin:null,
          segments:[],hope,differs:false});
      }
    });
  });
  return out.sort(myEntryOrder);
}
// 同じ日の中は開始の早い順、同じ開始なら勤務先の順（店舗ID・手入力の勤務先ID）
function myEntryOrder(a,b){
  const sa=a.startMin==null?99999:a.startMin,sb=b.startMin==null?99999:b.startMin;
  return a.date.localeCompare(b.date)||sa-sb||String(a.workplaceId||a.shopId||"").localeCompare(String(b.workplaceId||b.shopId||""))||String(a.shiftId||"").localeCompare(String(b.shiftId||""));
}
// 1日の公開内容の指紋（「変更あり」の判定）。時刻・休憩・締の追加出勤で作る。確定の有無は含めない（内容の変化だけを見る）。
// 実績の上書き（E4）がある日は、上書き前の公開内容（e.sched）で作る
function myDayFingerprint(e0){
  const e=e0&&e0.sched?e0.sched:e0;
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
// 今日以降で最も近い出勤（公開済みと手入力。同じ日なら開始の早い順＝myEntryOrder の並び）。未公開（グレー）は含めない
function nextMyShift(entries,todayStr){
  return(entries||[]).find(e=>e&&(e.kind==="published"||e.kind==="manual")&&e.date>=String(todayStr||""))||null;
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

// ===== 手入力の勤務先とシフト・実績の上書き・.ics（2026-10-04・第2部 E4）=====
// データ（計画書 E.4。すべて users/{uid} の下・本人のみ）:
//   workplaces/{id}  { kind:"shifty"|"manual", color, name?, shopId? , pay?(E5) }
//     - Shifty の店舗: id は shopId そのもの（kind:"shifty", shopId===id）。name は本人が付けた表示名で、無ければ店舗名。
//       紐付けの正本は E2 の links／staffLinks のまま。レコードは本人が色・名前を変えたとき（E5 では給料設定を入れたとき）に作る。
//       紐付けが外れてもレコードは残す（入力済みの給料設定を消さない）。一覧では「リンク解除済み」として出し、本人が消せる
//     - 手入力の勤務先: id は "m_"+英数字8桁（kind:"manual", name 必須, shopId なし）
//   shifts/{id}      { workplaceId, date, start, end, breakMin, memo? }  id は "h_"+英数字10桁。手入力の勤務先のシフトだけ
//   overrides/{shopId}/{date}  { start, end, breakMin }  公開済みの Shifty のシフトに本人が入れた実績
// 時刻は "HH:MM"（時は2桁・24時超え表記で 30:00 まで。退勤 > 出勤）。日をまたぐ勤務は 26:00 のように書く（シフト表と同じ表記）
const MY_WORKPLACE_NAME_MAX=30;
const MY_SHIFT_MEMO_MAX=200;
const MY_CLOCK_MAX_MIN=30*60;
const MY_MANUAL_WP_ID_RE=/^m_[A-Za-z0-9]{8}$/;
const MY_SHIFT_ID_RE=/^h_[A-Za-z0-9]{10}$/;
const _MY_ID_CHARS="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// rand(n) は 0〜255 の数を n 個返す関数（ブラウザでは crypto.getRandomValues。テストでは固定値）
function genMyRecordId(prefix,len,rand){
  const bytes=rand(len);
  let s="";
  for(let i=0;i<len;i++)s+=_MY_ID_CHARS[(Number(bytes[i])||0)%_MY_ID_CHARS.length];
  return prefix+s;
}
const _MY_DATE_RE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function isMyDateStr(s){
  if(typeof s!=="string"||!_MY_DATE_RE.test(s))return false;
  const d=new Date(s+"T00:00:00Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function _myAddDays(date,n){const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
// 分 → 保存する "HH:MM"（時は2桁）
function myClockStr(min){const n=Math.round(Number(min));return`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;}
// 時刻の直接入力: "9"→09:00・"930"→09:30・"1730"→17:30・"9:30"・全角・"25:00"。空なら ""、読めない・30:00 超なら null
function parseMyClockInput(v){
  const s=toHalfWidthDigits(v).replace(/：/g,":").replace(_MY_TRIM_RE,"");
  if(!s)return"";
  let h,m;
  let r=/^(\d{1,2}):(\d{1,2})$/.exec(s);
  if(r){h=+r[1];m=+r[2];}
  else if((r=/^(\d{1,2})$/.exec(s))){h=+r[1];m=0;}
  else if((r=/^(\d{1,2})(\d{2})$/.exec(s))){h=+r[1];m=+r[2];}
  else return null;
  if(m>59||h*60+m>MY_CLOCK_MAX_MIN)return null;
  return myClockStr(h*60+m);
}
// 5分刻みの選択肢（0:00〜30:00）。value は保存の形・label はシフト表と同じ表記
const MY_TIME_OPTIONS=(()=>{const a=[];for(let t=0;t<=MY_CLOCK_MAX_MIN;t+=5)a.push({value:myClockStr(t),label:fmtMyClock(t)});return a;})();
// 休憩（分）の選択肢と直接入力。空は 0
const MY_BREAK_OPTIONS=(()=>{const a=[];for(let t=0;t<=180;t+=5)a.push(t);return a;})();
function parseMyMinutesInput(v){
  const s=toHalfWidthDigits(v).replace(_MY_TRIM_RE,"");
  if(!s)return 0;
  if(!/^\d{1,4}$/.test(s))return null;
  const n=+s;return n<=1440?n:null;
}
// 開始・終了・休憩の検証（手入力のシフトと実績の上書きで共通）。戻り値 {error, suggestEnd?} か {start,end,breakMin,startMin,endMin}
const MY_OVERNIGHT_HINT="日をまたぐときは、24時より後の時刻で入力します（翌2:00 なら 26:00）";
function _myCheckTimes(o){
  const x=o||{};
  const start=parseMyClockInput(x.start),end=parseMyClockInput(x.end),brk=parseMyMinutesInput(x.breakMin);
  if(start===""||end==="")return{error:"開始と終了の時刻を入力してください"};
  if(start===null)return{error:"開始の時刻が読めません（例 9:30・930）"};
  if(end===null)return{error:"終了の時刻が読めません（例 17:00・1700。最大 30:00）"};
  if(brk===null)return{error:"休憩は分の数字で入力してください（0〜1440）"};
  const sm=_myClock(start),em=_myClock(end);
  if(em<=sm){
    const alt=em+24*60;
    return{error:`終了が開始より前です。${MY_OVERNIGHT_HINT}`,suggestEnd:alt>sm&&alt<=MY_CLOCK_MAX_MIN?myClockStr(alt):null};
  }
  if(brk>=em-sm)return{error:"休憩が勤務の長さ以上になっています"};
  return{start,end,breakMin:brk,startMin:sm,endMin:em};
}
// 手入力のシフトの検証。o={workplaceId,date,start,end,breakMin,memo}、ctx.workplaceIds=使える勤務先ID（手入力の勤務先）
function validateMyShiftInput(o,ctx){
  const x=o||{};
  const ids=(ctx&&ctx.workplaceIds)||null;
  if(!x.workplaceId||!MY_MANUAL_WP_ID_RE.test(String(x.workplaceId))||(ids&&!ids.includes(x.workplaceId)))return{error:"勤務先を選んでください"};
  if(!isMyDateStr(x.date))return{error:"日付を選んでください"};
  const t=_myCheckTimes(x);
  if(t.error)return t;
  const memo=String(x.memo==null?"":x.memo).replace(_MY_TRIM_RE,"");
  if(memo.length>MY_SHIFT_MEMO_MAX)return{error:`メモは${MY_SHIFT_MEMO_MAX}文字以内にしてください`};
  return null;
}
// users/{uid}/shifts/{id} に書く形（検証を通った入力から作る）。メモが空ならキーを持たない
function buildMyShiftRecord(o){
  const t=_myCheckTimes(o);
  const rec={workplaceId:o.workplaceId,date:o.date,start:t.start,end:t.end,breakMin:t.breakMin};
  const memo=String(o.memo==null?"":o.memo).replace(_MY_TRIM_RE,"");
  if(memo)rec.memo=memo;
  return rec;
}
// 同じ勤務先・同じ日・同じ時間帯のシフトが既にあるか（履歴からの追加で二重に入れない）。exceptId は編集中のシフト
function myShiftDuplicateOf(shifts,rec,exceptId){
  return Object.entries(_myObj(shifts)||{}).find(([id,s])=>id!==exceptId&&s&&s.workplaceId===rec.workplaceId&&s.date===rec.date&&s.start===rec.start&&s.end===rec.end)||null;
}
// 実績の上書きの読み（壊れた記録は使わない）
function myOverrideOf(v){
  const o=_myObj(v);
  if(!o)return null;
  const sm=_myClock(o.start),em=_myClock(o.end),b=Number(o.breakMin);
  if(sm==null||em==null||em<=sm||!Number.isFinite(b)||b<0)return null;
  return{start:o.start,end:o.end,breakMin:Math.round(b)};
}
// 実績の上書きの入力 → 書く記録。公開内容（sched）と同じなら {remove:true}（＝上書きを消す）。戻り値 {error,suggestEnd?}|{record}|{remove:true}
function planMyOverride(input,sched){
  const t=_myCheckTimes(input);
  if(t.error)return t;
  const s=sched||{};
  if(t.startMin===s.startMin&&t.endMin===s.endMin&&t.breakMin===s.breakMin)return{remove:true};
  return{record:{start:t.start,end:t.end,breakMin:t.breakMin}};
}
// 勤務先の一覧（設定タブとカレンダーが共有する）。links は readMyLinks の ok の行（並び順＝既定の色の順）、workplaces は users/{uid}/workplaces。
// 返り値 [{id, kind, shopId, name, shopName, color, linked, rec}]。並びは Shifty の店舗（リンクの順）→ 手入力（名前の順）→ リンク解除済みの店舗
function myWorkplaceList(links,workplaces){
  const recs=_myObj(workplaces)||{};
  const ok=(Array.isArray(links)?links:[]).filter(l=>l&&l.ok&&l.shopId);
  const goodColor=c=>typeof c==="string"&&/^#[0-9a-fA-F]{6}$/.test(c);
  const out=ok.map((l,i)=>{
    const r=_myObj(recs[l.shopId]);
    const rec=r&&r.kind==="shifty"?r:null;
    const nm=rec&&typeof rec.name==="string"&&rec.name?rec.name:"";
    return{id:l.shopId,kind:"shifty",shopId:l.shopId,shopName:l.shopName||"",name:nm||l.shopName||"",color:rec&&goodColor(rec.color)?rec.color:MY_WORKPLACE_COLORS[i%MY_WORKPLACE_COLORS.length],linked:true,rec};
  });
  const linkedIds=new Set(ok.map(l=>l.shopId));
  const manual=[],gone=[];
  Object.entries(recs).forEach(([id,r])=>{
    if(!_myObj(r))return;
    if(r.kind==="manual"&&MY_MANUAL_WP_ID_RE.test(id)&&typeof r.name==="string"&&r.name)
      manual.push({id,kind:"manual",shopId:null,shopName:"",name:r.name,color:goodColor(r.color)?r.color:MY_WORKPLACE_COLORS[0],linked:false,rec:r});
    else if(r.kind==="shifty"&&!linkedIds.has(id))
      gone.push({id,kind:"shifty",shopId:id,shopName:"",name:typeof r.name==="string"&&r.name?r.name:"（リンク解除済みのお店）",color:goodColor(r.color)?r.color:MY_WORKPLACE_COLORS[0],linked:false,rec:r});
  });
  manual.sort((a,b)=>a.name.localeCompare(b.name,"ja")||a.id.localeCompare(b.id));
  return[...out,...manual,...gone];
}
// 新しい手入力の勤務先の既定の色（まだ使っていないプリセットの先頭。全部使っていれば数で回す）
function myNextWorkplaceColor(list){
  const used=new Set((list||[]).map(w=>w.color));
  return MY_WORKPLACE_COLORS.find(c=>!used.has(c))||MY_WORKPLACE_COLORS[(list||[]).length%MY_WORKPLACE_COLORS.length];
}
// 勤務先の名前と色の検証。kind が shifty なら名前は空でよい（空＝店舗名で表示）
function validateMyWorkplaceInput(o,kind){
  const x=o||{};
  const name=normalizeMyDisplayName(x.name);
  if(kind!=="shifty"&&!name)return"勤務先の名前を入力してください";
  if(name.length>MY_WORKPLACE_NAME_MAX)return`勤務先の名前は${MY_WORKPLACE_NAME_MAX}文字以内にしてください`;
  if(!MY_WORKPLACE_COLORS.includes(x.color))return"色を選んでください";
  return null;
}
// workplaces/{id} への update の中身（pay は E5 の担当が足すので触らない＝set() しない）。
// Shifty の店舗で名前が店舗名と同じか空なら name を消す（null）＝店舗名で表示
function buildMyWorkplacePatch(o,w){
  const name=normalizeMyDisplayName(o&&o.name);
  if(w&&w.kind==="shifty")return{kind:"shifty",shopId:w.shopId,color:o.color,name:name&&name!==w.shopName?name:null};
  return{kind:"manual",name,color:o.color};
}
// 手入力のシフト → カレンダーの entry（buildMyShiftDays と同じ形・kind "manual"）。勤務先が無い（消えた）シフトは出さない
function buildMyManualDays(list,shifts){
  const wp=new Map((list||[]).filter(w=>w.kind==="manual").map(w=>[w.id,w]));
  const out=[];
  Object.entries(_myObj(shifts)||{}).forEach(([id,s])=>{
    if(!_myObj(s)||!wp.has(s.workplaceId)||!isMyDateStr(s.date))return;
    const sm=_myClock(s.start),em=_myClock(s.end);
    if(sm==null||em==null||em<=sm)return;
    const w=wp.get(s.workplaceId);
    const b=Math.max(0,Math.min(Math.round(Number(s.breakMin)||0),em-sm));
    out.push({date:s.date,shopId:null,workplaceId:w.id,shiftId:id,shopName:w.name,color:w.color,periodId:null,kind:"manual",confirmed:false,
      startMin:sm,endMin:em,breakMin:b,workMin:em-sm-b,segments:[{startMin:sm,endMin:em,extra:false}],hope:null,differs:false,
      memo:typeof s.memo==="string"?s.memo:""});
  });
  return out.sort(myEntryOrder);
}
// 履歴から追加の候補: 同じ勤務先で過去に入れた時間帯（開始・終了・休憩が同じものはまとめる）を新しい日付の順に limit 件
function myShiftHistoryCandidates(shifts,workplaceId,limit){
  const n=limit==null?5:limit;
  const seen=new Set(),out=[];
  Object.values(_myObj(shifts)||{}).filter(s=>s&&s.workplaceId===workplaceId&&isMyDateStr(s.date)&&_myClock(s.start)!=null&&_myClock(s.end)!=null)
    .sort((a,b)=>b.date.localeCompare(a.date))
    .forEach(s=>{
      const b=Math.round(Number(s.breakMin)||0);
      const k=`${s.start}|${s.end}|${b}`;
      if(seen.has(k)||out.length>=n)return;
      seen.add(k);
      out.push({start:s.start,end:s.end,breakMin:b,label:`${fmtMyClock(_myClock(s.start))}〜${fmtMyClock(_myClock(s.end))}${b>0?`（休憩${b}分）`:""}`});
    });
  return out;
}
// 給料計算（E5）に渡す1日の勤務。マイシフトの entry（buildMyShiftDays＋buildMyManualDays）から、未公開（グレー）を除いて同じ形にそろえる。
//   source: "published"（公開・確定シフト）| "override"（本人が上書きした実績）| "manual"（手入力の勤務先）
//   actualDay: Shifty の店舗の日だけ。resolveActualDay の戻り値（上書き適用後）＝premiumDayInput の own にそのまま渡せる
function myPayWorkDays(entries){
  return(entries||[]).filter(e=>e&&(e.kind==="published"||e.kind==="manual")).map(e=>({
    date:e.date,kind:e.kind==="manual"?"manual":"shifty",workplaceId:e.workplaceId||e.shopId,shopId:e.shopId||null,periodId:e.periodId||null,
    shiftId:e.shiftId||null,confirmed:!!e.confirmed,source:e.kind==="manual"?"manual":e.overridden?"override":"published",
    startMin:e.startMin,endMin:e.endMin,breakMin:e.breakMin,workMin:e.workMin,segments:(e.segments||[]).map(g=>({...g})),actualDay:e.actualDay||null}));
}
// ---- .ics（RFC 5545）----
// 公開済み（上書きがあれば上書きの時刻）と手入力のシフトを VEVENT にする。未公開（グレー）は含めない。
// 時刻は TZID=Asia/Tokyo の現地時刻で書き、VTIMEZONE（+0900 の STANDARD 1つ・日本は夏時間なし）を同梱する。
// **UTC（末尾 Z）にしない**: 2026-10-04 に iOS 27 のシミュレーターで比べると、UTC の予定は iPhone のカレンダーで
// 「18:00（9:00GMT）」と全件に GMT の時刻が添えられ、TZID の予定は「18:00」とだけ出た（どちらも時刻自体は正しい）。
// 独立した3つのパーサー（ical.js・node-ical・Python icalendar）はどちらの形も同じ JST の時刻に読む。IANA の "Asia/Tokyo" は
// Google・Apple・現行の Outlook が解決でき、解決できない実装のために VTIMEZONE の定義と X-LIC-LOCATION を付ける。24時超えは翌日の時刻に直す。
// 締の追加出勤（segments の extra）は別のイベント。UID は「勤務先と日付（手入力はシフトID）」から作り、取り込み直しても同じになる。
// SEQUENCE は書き出した時刻（2026-01-01 からの分）で、取り込み直したときに新しい方で上書きされるようにする（Outlook・Apple は UID と SEQUENCE で更新を判定する）
function _icsEscape(s){return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r\n|\r|\n/g,"\\n");}
// 75オクテットで折り返す（UTF-8 の文字の途中では切らない。続きの行は先頭に空白1つ＝その空白も75に数える）
function icsFoldLine(line){
  const out=[];let cur="",bytes=0,limit=75;
  for(const ch of String(line)){
    const b=new TextEncoder().encode(ch).length;
    if(bytes+b>limit){out.push(cur);cur=" "+ch;bytes=1+b;}
    else{cur+=ch;bytes+=b;}
  }
  out.push(cur);
  return out.join("\r\n");
}
function _icsUidPart(s){return String(s==null?"":s).replace(/[^A-Za-z0-9-]/g,c=>"_"+c.charCodeAt(0).toString(16));}
function _icsLocal(date,min){
  const d=_myAddDays(date,Math.floor(min/1440)),r=min%1440;
  return`${d.replace(/-/g,"")}T${String(Math.floor(r/60)).padStart(2,"0")}${String(r%60).padStart(2,"0")}00`;
}
function _icsUtcStamp(iso){
  const d=new Date(iso);const t=Number.isFinite(d.getTime())?d:new Date(0);
  return t.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
}
function _icsSequence(iso){
  const t=new Date(iso).getTime();
  return Number.isFinite(t)?Math.max(0,Math.floor((t-Date.UTC(2026,0,1))/60000)):0;
}
const MY_ICS_DOMAIN="shiftyshifty.app";
function buildMyIcs(entries,o){
  const x=o||{};
  const nowIso=x.nowIso||new Date().toISOString();
  const stamp=_icsUtcStamp(nowIso),seq=_icsSequence(nowIso);
  const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TODGE//Shifty MyShift//JA","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    `X-WR-CALNAME:${_icsEscape(x.calName||"Shifty マイシフト")}`,"X-WR-TIMEZONE:Asia/Tokyo",
    "BEGIN:VTIMEZONE","TZID:Asia/Tokyo","X-LIC-LOCATION:Asia/Tokyo","BEGIN:STANDARD","DTSTART:19700101T000000","TZOFFSETFROM:+0900","TZOFFSETTO:+0900","TZNAME:JST","END:STANDARD","END:VTIMEZONE"];
  let n=0;
  (entries||[]).filter(e=>e&&(e.kind==="published"||e.kind==="manual")&&isMyDateStr(e.date)).forEach(e=>{
    const segs=(e.segments&&e.segments.length?e.segments:[{startMin:e.startMin,endMin:e.endMin}]).filter(g=>g&&g.startMin!=null&&g.endMin!=null&&g.endMin>g.startMin);
    let ex=0;
    segs.forEach(g=>{
      const uid=e.kind==="manual"?`manual-${_icsUidPart(e.shiftId)}${g.extra?`-x${++ex}`:""}`
        :`shifty-${_icsUidPart(e.shopId)}-${e.date.replace(/-/g,"")}${g.extra?`-x${++ex}`:""}`;
      const desc=[];
      if(e.kind==="published")desc.push(e.overridden?"実績（本人の入力）":e.confirmed?"確定":"公開");
      if(!g.extra&&e.breakMin>0)desc.push(`休憩${e.breakMin}分`);
      if(e.memo)desc.push(e.memo);
      L.push("BEGIN:VEVENT",`UID:${uid}@${MY_ICS_DOMAIN}`,`DTSTAMP:${stamp}`,`SEQUENCE:${seq}`,
        `DTSTART;TZID=Asia/Tokyo:${_icsLocal(e.date,g.startMin)}`,`DTEND;TZID=Asia/Tokyo:${_icsLocal(e.date,g.endMin)}`,
        `SUMMARY:${_icsEscape((e.shopName||"シフト")+(g.extra?"（追加）":""))}`);
      if(desc.length)L.push(`DESCRIPTION:${_icsEscape(desc.join("\n"))}`);
      L.push("END:VEVENT");n++;
    });
  });
  L.push("END:VCALENDAR");
  return{text:L.map(icsFoldLine).join("\r\n")+"\r\n",count:n};
}
// .ics に入れる entry（表示中の月の公開済み・手入力）
function myIcsEntriesForMonth(entries,ym){return(entries||[]).filter(e=>e&&(e.kind==="published"||e.kind==="manual")&&String(e.date).slice(0,7)===ym);}
// .ics の渡し方を端末で分ける。iPadOS の Safari は UA が Mac と同じなので、タッチ点の数で iPad を見分ける
function myIcsPlatformOf(ua,maxTouchPoints){
  const u=String(ua||"");
  if(/iPhone|iPad|iPod/.test(u)||(/Macintosh/.test(u)&&(+maxTouchPoints||0)>1))return"ios";
  if(/Android/.test(u))return"android";
  return"desktop";
}
// 書き出した後に出す案内（端末ごと）。Google カレンダーは .ics の取り込みが PC のウェブ版の設定画面からだけで、スマホのアプリでは開けない
const MY_ICS_HINTS={
  ios:"「カレンダーに追加」の画面が出たら「すべてを追加」を押してください。出ないときは Safari のダウンロード一覧からファイルを開きます。",
  android:"ダウンロードしたファイルを開くとカレンダーアプリに追加できます。Google カレンダーのアプリは .ics を開けないので、日付の詳細の「Google カレンダーに追加」から1件ずつ追加してください。",
  desktop:"ダウンロードしたファイルを開くと、Outlook・Apple のカレンダー等に追加できます。Google カレンダーは、パソコンのブラウザで Google カレンダーの「設定 → インポート / エクスポート」からこのファイルを選びます。",
};
// Google カレンダーに1件を追加するリンク（本人が押したときだけ開く）。送るのは勤務先名と時刻だけ（休憩・メモは送らない）。
// 時刻は日本時間の現地表記＋ctz=Asia/Tokyo（24時超えは翌日の時刻）。締の追加出勤は1件ずつ別のリンク
function myGoogleCalendarLinks(e){
  if(!e||!(e.kind==="published"||e.kind==="manual")||!isMyDateStr(e.date))return[];
  const segs=(e.segments&&e.segments.length?e.segments:[{startMin:e.startMin,endMin:e.endMin}]).filter(g=>g&&g.startMin!=null&&g.endMin!=null&&g.endMin>g.startMin);
  return segs.map(g=>{
    const title=(e.shopName||"シフト")+(g.extra?"（追加）":"");
    return{extra:!!g.extra,url:"https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(title)+
      "&dates="+_icsLocal(e.date,g.startMin)+"/"+_icsLocal(e.date,g.endMin)+"&ctz=Asia%2FTokyo"};
  });
}

// ===== 給料（2026-10-04・第2部 E5・E6）=====
// 計画書 E.2「給料」「設定」・E.4・E.5。金額は**目安**（月次賃金＝給与計算の元とは別物）。
// データ（すべて users/{uid} の下・本人のみ）:
//   workplaces/{id}.pay  本人の給料設定（勤務先ごと）{closingDay, payMonthOffset, payDay, holidayRule, wageType?, rate?, commute?, night?, over8?, updatedAt}
//                         closingDay・payDay の 31 は「末日」（短い月は月末に寄せる）。wageType・rate は会社設定（getMyPay）があれば使わない
//   goals                { monthly, updatedAt }  月間目標（円・支給月ごとの合計と比べる）
//   actuals/{YYYY-MM}/{workplaceId}  振込額（円・本人の手入力）。YYYY-MM は**支給月**。店舗の shops/{sid}/actuals（打刻の実績）とは別物で、
//                         コードでは「振込額」（received）と呼ぶ
// Shifty の店舗の計算は既存の関数だけを使う（新しい労務の式を作らない）: resolveActualDay（本人の上書き込み）→ premiumDayInput →
// premiumMonthOf（暦月の割増の時間・perDay）→ wageOf / deductionOf（月次賃金ページと同じ式・率・端数）。
// 本人のセッションが読めるデータ（確定シフト＝subs・設定・写し）だけで数える。laborMonths・店舗の actuals・private/pay はオーナーしか
// 読めないので使わない（打刻の実績・月所定の登録値が無い前提。月次賃金ページとの差になりうる＝画面と CLAUDE.md に書く）。
const MY_PAY_END_DAY=31;
const MY_PAY_HOLIDAY_RULES=["before","after","none"];
const MY_PAY_HOLIDAY_RULE_LABELS={before:"前倒し",after:"後ろ倒し",none:"そのまま"};
const MY_PAY_WAGE_TYPES=["hourly","daily"];
const MY_PAY_WAGE_TYPE_LABELS={hourly:"時給",daily:"日給"};
const MY_PAY_OFFSET_LABELS={0:"当月",1:"翌月",2:"翌々月"};
const MY_PAY_YEN_MAX=1000000;
const MY_PAY_GOAL_MAX=100000000;
// 締日・給料日が未設定の勤務先の振り分け（月末締め・翌月25日・土日祝は前倒し）。画面に「未設定のため」と出す
const MY_PAY_DEFAULT={closingDay:31,payMonthOffset:1,payDay:25,holidayRule:"before"};
// 手入力の勤務先の簡易計算の割増率（%）
const MY_MANUAL_NIGHT_PCT=25;
const MY_MANUAL_OVER8_PCT=25;
const MY_MANUAL_OVER8_MIN=8*60;
function _myInt(v){const n=Number(v);return Number.isFinite(n)?Math.round(n):NaN;}
function _myYenInput(v){
  const s=toHalfWidthDigits(v).replace(/[,，円\s　]/g,"");
  if(!s)return"";
  if(!/^\d{1,9}$/.test(s))return null;
  return +s;
}
function myPayDayLabel(d){return Number(d)>=MY_PAY_END_DAY?"末日":`${Number(d)}日`;}
// 保存された給料設定の読み（壊れた記録は使わない＝null）
function myPayOf(v){
  const o=_myObj(v);
  if(!o)return null;
  const cd=_myInt(o.closingDay),pd0=_myInt(o.payDay),off=_myInt(o.payMonthOffset);
  if(!(cd>=1&&cd<=31)||!(pd0>=1&&pd0<=31)||![0,1,2].includes(off)||!MY_PAY_HOLIDAY_RULES.includes(o.holidayRule))return null;
  const cm=_myObj(o.commute)||{};
  const ca=_myInt(cm.amount);
  const rate=_myInt(o.rate);
  return{closingDay:cd,payMonthOffset:off,payDay:pd0,holidayRule:o.holidayRule,
    wageType:MY_PAY_WAGE_TYPES.includes(o.wageType)?o.wageType:"hourly",rate:rate>0?rate:0,
    commute:{amount:ca>0?ca:0,per:cm.per==="day"?"day":"month"},night:o.night===true,over8:o.over8===true};
}
// 入力欄の値（文字列）の検証。ctx={kind:"shifty"|"manual", companyPay:boolean}。会社設定があるなら時給・交通費は入力しない
function validateMyPayInput(o,ctx){
  const x=o||{},c=ctx||{};
  const cd=_myInt(x.closingDay),pd0=_myInt(x.payDay),off=_myInt(x.payMonthOffset);
  if(!(cd>=1&&cd<=31))return"締日を選んでください";
  if(![0,1,2].includes(off))return"給料日の月を選んでください";
  if(!(pd0>=1&&pd0<=31))return"給料日を選んでください";
  if(!MY_PAY_HOLIDAY_RULES.includes(x.holidayRule))return"土日祝の扱いを選んでください";
  if(off===0&&pd0<=cd)return"当月払いのときは、給料日を締日より後の日にしてください";
  if(c.companyPay)return null;
  if(!MY_PAY_WAGE_TYPES.includes(x.wageType))return"時給か日給かを選んでください";
  const r=_myYenInput(x.rate);
  if(r===null||r===""||!(r>0)||r>MY_PAY_YEN_MAX)return`${MY_PAY_WAGE_TYPE_LABELS[x.wageType]}を円の数字で入力してください（1〜${MY_PAY_YEN_MAX.toLocaleString("ja-JP")}）`;
  const ca=_myYenInput(x.commuteAmount);
  if(ca===null||(ca!==""&&ca>MY_PAY_YEN_MAX))return"交通費は円の数字で入力してください";
  if(!["day","month"].includes(x.commutePer))return"交通費の単位を選んでください";
  return null;
}
// workplaces/{id}/pay に書く形（検証を通った入力から作る）。会社設定があるときも本人の時給は残す（会社設定が消えたときに使う）
function buildMyPayRecord(o,ctx,nowIso){
  const x=o||{},c=ctx||{};
  const rec={closingDay:_myInt(x.closingDay),payMonthOffset:_myInt(x.payMonthOffset),payDay:_myInt(x.payDay),holidayRule:x.holidayRule,updatedAt:String(nowIso||"")};
  const r=_myYenInput(x.rate),ca=_myYenInput(x.commuteAmount);
  if(MY_PAY_WAGE_TYPES.includes(x.wageType)&&r>0){rec.wageType=x.wageType;rec.rate=r;}
  if(ca>0&&["day","month"].includes(x.commutePer))rec.commute={amount:ca,per:x.commutePer};
  if(c.kind==="manual"){rec.night=x.night===true;rec.over8=x.over8===true;}
  return rec;
}
// 入力欄の初期値（保存値 → 文字列）
function myPayFormOf(pay){
  const p=myPayOf(pay);
  const d=p||{...MY_PAY_DEFAULT,wageType:"hourly",rate:0,commute:{amount:0,per:"day"},night:false,over8:false};
  return{closingDay:String(d.closingDay),payMonthOffset:String(d.payMonthOffset),payDay:String(d.payDay),holidayRule:d.holidayRule,
    wageType:d.wageType,rate:d.rate>0?String(d.rate):"",commuteAmount:d.commute.amount>0?String(d.commute.amount):"",commutePer:d.commute.per,
    night:!!d.night,over8:!!d.over8};
}
// 月間目標（goals）の検証と書く形。空なら null（目標を消す）
function parseMyGoalInput(v){
  const n=_myYenInput(v);
  if(n==="")return{remove:true};
  if(n===null||n>MY_PAY_GOAL_MAX)return{error:"目標は円の数字で入力してください"};
  return{value:n};
}
function myGoalOf(v){const o=_myObj(v);const n=o?_myInt(o.monthly):NaN;return n>0?n:0;}
// 振込額（actuals/{支給月}/{勤務先}）の入力。空なら削除
function parseMyReceivedInput(v){
  const n=_myYenInput(v);
  if(n==="")return{remove:true};
  if(n===null||n>MY_PAY_YEN_MAX*10)return{error:"振込額は円の数字で入力してください"};
  return{value:n};
}
// ---- 締め期間と支給月 ----
function _myDim(ym){const m=/^(\d{4})-(\d{2})$/.exec(String(ym||""));return m?new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate():0;}
// その月の「day 日」。31（末日）や短い月の 29・30 は月末に寄せる
function myClampDay(ym,day){const n=_myDim(ym);return`${ym}-${String(Math.min(Math.max(1,_myInt(day)||1),n)).padStart(2,"0")}`;}
// 勤務日 date が入る締め月（"YYYY-MM"＝その月の締日で締まる）
function myClosingMonthOf(date,closingDay){
  const ym=String(date).slice(0,7);
  return date<=myClampDay(ym,closingDay)?ym:myShiftMonth(ym,1);
}
// 締め月 closingYm の締め期間（前の月の締日の翌日 〜 その月の締日）
function myClosingRangeOf(closingYm,closingDay){
  return{from:_myAddDays(myClampDay(myShiftMonth(closingYm,-1),closingDay),1),to:myClampDay(closingYm,closingDay)};
}
// 給料日（土日祝の扱いを当てたあと）。isOff(日付) は土日祝か（app-utils.js の isWeekendOrHoliday）
function myPayDateOf(payYm,payDay,holidayRule,isOff){
  let d=myClampDay(payYm,payDay);
  if(holidayRule==="none"||typeof isOff!=="function")return d;
  const step=holidayRule==="after"?1:-1;
  for(let i=0;i<14&&isOff(d);i++)d=_myAddDays(d,step);
  return d;
}
// 支給月 payYm に払われる分（締め月・締め期間・給料日）。pay は myPayOf の値（無ければ MY_PAY_DEFAULT）
function myPayPlanOf(payYm,pay,isOff){
  const p=pay||MY_PAY_DEFAULT;
  const closingYm=myShiftMonth(payYm,-p.payMonthOffset);
  const r=myClosingRangeOf(closingYm,p.closingDay);
  return{payYm,closingYm,from:r.from,to:r.to,payDate:myPayDateOf(payYm,p.payDay,p.holidayRule,isOff),
    monthEnd:p.closingDay>=_myDim(closingYm)&&r.from.slice(8)==="01"};
}
// 勤務日 date の支給月
function myPayMonthOfDate(date,pay){const p=pay||MY_PAY_DEFAULT;return myShiftMonth(myClosingMonthOf(date,p.closingDay),p.payMonthOffset);}
function _myMonthsBetween(from,to){
  const out=[];let ym=String(from).slice(0,7);const last=String(to).slice(0,7);
  for(let i=0;i<40&&ym<=last;i++){out.push(ym);ym=myShiftMonth(ym,1);}
  return out;
}
// 期間が [from, to] に重なるもの（給料タブが読む提出の期間）
function myPeriodsInRange(periods,from,to){return(periods||[]).filter(p=>p&&p.id&&myPeriodOverlaps(p,from,to));}
// 給料タブで読む日の範囲: 支給月ごとの締め期間を含む暦月の全日と、その前後の週（法定休日・週40時間の判定）
function myPayReadRange(plans){
  const ps=(plans||[]).filter(Boolean);
  if(!ps.length)return null;
  const from=ps.reduce((a,p)=>p.from<a?p.from:a,ps[0].from),to=ps.reduce((a,p)=>p.to>a?p.to:a,ps[0].to);
  return{from:_myAddDays(`${from.slice(0,7)}-01`,-7),to:_myAddDays(myClampDay(to.slice(0,7),31),7)};
}
// ---- Shifty の店舗の1日 ----
// 店舗の期間ごとの日（給料の計算の元）。読めた期間（subsByPeriod にある期間）の日だけを返す。
//   {date: {periodId, published, sub, ov, submitted}}  published=false の日（未公開・Premium でない・その期間に非表示）は計算に入れない
// o={name, periods, subsByPeriod, settings, staff, todayStr, premium, overrides}
function myShiftyDayInfo(o,U){
  const u=_myU(U);const x=o||{};
  const out={};
  if(!x.name)return out;
  const ovs=_myObj(x.overrides)||{};
  (x.periods||[]).forEach(p=>{
    if(!p||!p.id)return;
    const list=x.subsByPeriod&&x.subsByPeriod[p.id];
    if(!Array.isArray(list))return;
    const st=u.resolvePeriodMaster(p,x.staff||[],x.settings||{},x.todayStr).settings||{};
    const byName=new Map();
    list.forEach(s=>{if(s&&s.staffName&&s.periodId===p.id&&!byName.has(s.staffName))byName.set(s.staffName,s);});
    const sub=u.resolveSubByAlias(n=>byName.get(n),x.name,st.staffAliases||{});
    const published=!!x.premium&&u.isPeriodPublished(p)&&!u.isStaffHiddenInPeriod(x.name,st,p);
    _myDatesOf(p).forEach(date=>{
      if(out[date])return;
      const sh=sub&&sub.shifts?sub.shifts[date]:null;
      out[date]={periodId:p.id,published,sub:sub||null,ov:published?myOverrideOf(ovs[date]):null,
        submitted:!published&&!!(sh&&sh.status==="work"&&(sh.start||sh.end))};
    });
  });
  return out;
}
// 暦月 ym の計算に使う店舗の設定。月次賃金ページと同じく「その月に始まる最も新しい期間（無ければ月にかかる最も新しい期間）」の設定
// （確定・終了済みなら写し）。シフト作成タブの労務判定表もこの期間の設定で月を数える
function myMonthSettingsOf(o,ym,U){
  const u=_myU(U);const x=o||{};
  const first=`${ym}-01`,last=myClampDay(ym,31);
  const inMonth=(x.periods||[]).filter(p=>p&&p.id&&p.startDate&&p.endDate&&p.startDate<=last&&p.endDate>=first)
    .sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));
  const target=inMonth.find(p=>String(p.startDate).slice(0,7)===ym)||inMonth[0];
  return target?(u.resolvePeriodMaster(target,x.staff||[],x.settings||{},x.todayStr).settings||{}):(x.settings||{});
}
// [from, to] の日ごとの時間（分）。暦月ごとに premiumMonthOf を通し、日ごとの時間外（perDay）と深夜・法定休日を取り出す。
// 月60時間超はその月の時間外を日付の順に積んで 60h を超えた分（月の合計は premiumBreakdownOf の over60Min と一致）。
// o={name, info: myShiftyDayInfo, monthSettingsOf(ym), from, to, todayStr}
// 戻り値 {days:[{date,workMin,otMin,over60Min,nightMin,legalHolidayMin,absentMin,past}], systems:{ym:"A"|"B"|null}, undetermined, missingDays, submittedDays}
function myShiftyPayTimes(o,U){
  const u=_myU(U);const x=o||{};
  const info=x.info||{};
  const days=[],systems={};
  let undetermined=0,missingDays=0,submittedDays=0;
  _myMonthsBetween(x.from,x.to).forEach(ym=>{
    const st=x.monthSettingsOf?x.monthSettingsOf(ym):{};
    const sys=u.laborSystemForStaff(st,x.name);
    systems[ym]=sys;
    const cache=new Map();
    const dayOf=d=>{
      if(cache.has(d))return cache.get(d);
      const it=info[d];let v;
      if(!it||!it.published)v=u.premiumDayInput({date:d,hasData:false});
      else{
        const sh=it.sub&&it.sub.shifts?it.sub.shifts[d]:null;
        const own=u.resolveActualDay(it.sub,it.ov?{start:it.ov.start,end:it.ov.end,breakMin:it.ov.breakMin}:null,d,st,x.name);
        v=u.premiumDayInput({date:d,hasData:true,kind:u.dayRestKindOf(sh,true),own});
      }
      cache.set(d,v);return v;
    };
    const b=u.premiumMonthOf({ym,system:sys,settings:st,dayOf});
    const legal=new Set(b.legalHolidayDates||[]);
    const n=_myDim(ym);
    let cum=0;
    if((b.undeterminedWeeks||[]).length)undetermined+=b.undeterminedWeeks.length;
    for(let i=1;i<=n;i++){
      const d=`${ym}-${String(i).padStart(2,"0")}`;
      const ot=Math.max(0,Number((b.perDay||{})[d])||0);
      const before=cum;cum+=ot;
      const th=u.OVER60_THRESHOLD_MIN;
      const o60=Math.max(0,cum-th)-Math.max(0,before-th);
      if(d<x.from||d>x.to)continue;
      const v=dayOf(d);const it=info[d];
      if(!it)missingDays++;
      else if(!it.published&&it.submitted)submittedDays++;
      days.push({date:d,workMin:Math.max(0,Number(v.workMin)||0),otMin:ot,over60Min:o60,nightMin:Math.max(0,Number(v.nightMin)||0),
        legalHolidayMin:legal.has(d)?Math.max(0,Number(v.workMin)||0):0,absentMin:Math.max(0,Number(v.absentMin)||0),past:d<=String(x.todayStr||"")});
    }
  });
  return{days,systems,undetermined,missingDays,submittedDays};
}
// 手入力の勤務先の日ごとの時間。entries は buildMyManualDays の戻り値（その勤務先の分）。同じ日の複数のシフトは足す
function myManualPayTimes(entries,from,to,todayStr,U){
  const u=_myU(U);
  const by=new Map();
  (entries||[]).forEach(e=>{
    if(!e||e.date<from||e.date>to)return;
    const cur=by.get(e.date)||{date:e.date,workMin:0,nightMin:0,otMin:0,over60Min:0,legalHolidayMin:0,absentMin:0,past:e.date<=String(todayStr||"")};
    cur.workMin+=Math.max(0,Number(e.workMin)||0);
    cur.nightMin+=u.nightMinutesOf({segments:e.segments||[],breakMin:e.breakMin,breakBands:null});
    by.set(e.date,cur);
  });
  const days=[...by.values()].sort((a,b)=>a.date.localeCompare(b.date));
  days.forEach(d=>{d.otMin=Math.max(0,d.workMin-MY_MANUAL_OVER8_MIN);});
  return{days,systems:{},undetermined:0,missingDays:0,submittedDays:0};
}
function _mySumTimes(days,pred){
  const t={workMin:0,otMin:0,over60Min:0,nightMin:0,legalHolidayMin:0,absentMin:0,workDays:0};
  (days||[]).forEach(d=>{if(pred&&!pred(d))return;["workMin","otMin","over60Min","nightMin","legalHolidayMin","absentMin"].forEach(k=>{t[k]+=d[k]||0;});if(d.workMin>0)t.workDays++;});
  return t;
}
// 賃金の出どころ。会社設定（getMyPay の pay＝賃金マスタの1人分・history 込み）が締め期間の初日に効いていればそれ、
// 無ければ本人の設定（時給／日給）。どちらも無ければ none（時間だけ出す）
function myWageSourceOf(o,U){
  const u=_myU(U);const x=o||{};
  if(x.companyPay&&typeof x.companyPay==="object"){
    const v=u.payVersionOn(x.companyPay,x.from)||u.payVersionOn(x.companyPay,x.to);
    if(v){
      const notes=[];
      if(v.effectiveFrom&&v.effectiveFrom>x.from)notes.push(`${v.effectiveFrom} からの会社設定の賃金です（日割りしていません）`);
      return{source:"company",payType:v.payType,version:v,commute:v.commute||{amount:0,per:"month"},notes};
    }
  }
  const own=x.own;
  if(own&&own.rate>0){
    if(own.wageType==="daily")return{source:"self",payType:"daily",rate:own.rate,commute:own.commute,notes:[]};
    return{source:"self",payType:"hourly",version:u.normalizePayVersion({payType:"hourly",base:own.rate}),commute:own.commute,notes:[]};
  }
  return{source:"none",payType:null,commute:own?own.commute:{amount:0,per:"month"},notes:[]};
}
// 金額（1つの勤務先・1つの締め期間）。月次賃金ページと同じ wageOf / deductionOf を通す（率・端数・固定残業・固定深夜の充当も同じ）。
// 確定分は今日までの日の時間で同じ式を通した額、見込みは合計との差（端数の合計がずれないように差で出す）。
// 月給者は基本給・手当を締め期間が終わってから確定分に入れる（それまでは見込み）。基本給は締め期間で日割りしない（月次賃金と同じ）
// o={kind:"shifty"|"manual", wage: myWageSourceOf, times:{days}, from, to, todayStr, denomMin, wageSettings, manualPay: myPayOf（手入力の割増のオン・オフ）}
const MY_PAY_ITEM_KEYS=["base","ot","over60","night","holiday","allowances","commute","deduction"];
function myPayAmounts(o,U){
  const u=_myU(U);const x=o||{};
  const days=(x.times&&x.times.days)||[];
  const T=_mySumTimes(days),P=_mySumTimes(days,d=>d.past);
  const w=x.wage||{source:"none"};
  const ended=String(x.to)<=String(x.todayStr||"");
  const zero=()=>({base:0,ot:0,over60:0,night:0,holiday:0,allowances:0,commute:0,deduction:0});
  const items=zero(),conf=zero();
  let detail=null;
  if(w.source==="none")return{items:null,confirmed:null,projected:null,total:null,confirmedTotal:null,projectedTotal:null,minutes:T,minutesPast:P,detail};
  if(w.payType==="daily"){
    items.base=w.rate*T.workDays;conf.base=w.rate*P.workDays;
  }else if(x.kind==="manual"){
    const r=w.version.base,mp=x.manualPay||{};
    const amt=(t,pct)=>u.roundYenFrac(r*pct*t,6000,"ceil");
    [[items,T],[conf,P]].forEach(([it,t])=>{
      it.base=u.roundYenFrac(r*t.workMin,60,"ceil");
      it.night=mp.night?amt(t.nightMin,MY_MANUAL_NIGHT_PCT):0;
      it.ot=mp.over8?amt(t.otMin,MY_MANUAL_OVER8_PCT):0;
    });
  }else{
    const rates=u.premiumRatesOf(x.wageSettings||null),rule=u.roundingRuleOf(x.wageSettings||null);
    const wT=u.wageOf({pay:w.version,times:T,denomMin:x.denomMin,rates,rule}),wP=u.wageOf({pay:w.version,times:P,denomMin:x.denomMin,rates,rule});
    detail=wT;
    const monthly=w.payType==="monthly";
    items.base=wT.basePay;conf.base=monthly?(ended?wT.basePay:0):wP.basePay;
    items.ot=wT.otPay;conf.ot=wP.otPay;items.over60=wT.over60Pay;conf.over60=wP.over60Pay;
    items.night=wT.nightPay;conf.night=wP.nightPay;items.holiday=wT.holidayPay;conf.holiday=wP.holidayPay;
    items.deduction=u.deductionOf({pay:w.version,absentMin:T.absentMin,denomMin:x.denomMin,rule});
    conf.deduction=u.deductionOf({pay:w.version,absentMin:P.absentMin,denomMin:x.denomMin,rule});
    if(monthly){
      const al=(w.version.allowances||[]).reduce((s,a)=>s+(a&&Number(a.amount)>0?Math.round(Number(a.amount)):0),0);
      items.allowances=al;conf.allowances=ended?al:0;
    }
  }
  const cm=w.commute||{amount:0,per:"month"};
  if(cm.amount>0){
    if(cm.per==="day"){items.commute=cm.amount*T.workDays;conf.commute=cm.amount*P.workDays;}
    else if(T.workDays>0||w.payType==="monthly"){items.commute=cm.amount;conf.commute=ended?cm.amount:0;}
  }
  // 確定分が合計を超えない（固定残業の充当などで部分の額が合計を上回ることがあるため）
  MY_PAY_ITEM_KEYS.forEach(k=>{conf[k]=Math.min(conf[k],items[k]);});
  const sum=it=>MY_PAY_ITEM_KEYS.reduce((s,k)=>s+(k==="deduction"?-it[k]:it[k]),0);
  const projected={};MY_PAY_ITEM_KEYS.forEach(k=>{projected[k]=items[k]-conf[k];});
  return{items,confirmed:conf,projected,total:sum(items),confirmedTotal:sum(conf),projectedTotal:sum(items)-sum(conf),minutes:T,minutesPast:P,detail};
}
// 1つの支給月の全勤務先。workplaces=[{id, kind, name, color, pay（myPayOf|null）, companyPay, companyNote, shifty:{name,info,monthSettingsOf,wageSettings}, manualEntries}]
// 戻り値 {payYm, rows:[{id,kind,name,color,plan,wage,amounts,notes,estimate}], total, confirmedTotal, projectedTotal, workMin, hasAmount}
function myPayMonthFor(o,U){
  const u=_myU(U);const x=o||{};
  const isOff=d=>u.isWeekendOrHoliday(d);
  const rows=(x.workplaces||[]).map(wp=>{
    const own=wp.pay||null;
    const plan=myPayPlanOf(x.payYm,own,isOff);
    const notes=[];
    if(!own)notes.push("締日と給料日が未設定のため、月末締め・翌月25日払い（土日祝は前倒し）として振り分けています");
    let times;
    if(wp.kind==="manual")times=myManualPayTimes(wp.manualEntries,plan.from,plan.to,x.todayStr,u);
    else times=myShiftyPayTimes({name:wp.shifty.name,info:wp.shifty.info,monthSettingsOf:wp.shifty.monthSettingsOf,from:plan.from,to:plan.to,todayStr:x.todayStr},u);
    const wage=myWageSourceOf({companyPay:wp.kind==="shifty"?wp.companyPay:null,own,from:plan.from,to:plan.to},u);
    notes.push(...wage.notes);
    if(wp.companyNote)notes.push(wp.companyNote);
    let denomMin=0;
    if(wp.kind==="shifty"){
      denomMin=u.rateDenominatorMinOf(u.laborSettingsOf(wp.shifty.monthSettingsOf(plan.to.slice(0,7))));
      if(Object.values(times.systems).some(s=>s!=="A"&&s!=="B"))notes.push("お店の労働時間制が未設定のため、時間外の割増を含めていません");
      if(times.submittedDays)notes.push(`未公開のシフト${times.submittedDays}日は含めていません`);
      if(times.missingDays)notes.push(`お店のシフト期間が無い日${times.missingDays}日は勤務なしとして数えています`);
      if(times.undetermined)notes.push("シフトの無い日を含む週は、法定休日の判定をしていません");
    }
    if(wage.payType==="daily"&&wp.kind==="shifty")notes.push("日給は割増を含めていません");
    if(wage.source==="none")notes.push(wp.kind==="manual"?"時給（日給）が未設定のため、時間だけ表示しています":"時給（日給）が未設定のため、時間だけ表示しています");
    const amounts=myPayAmounts({kind:wp.kind,wage,times,from:plan.from,to:plan.to,todayStr:x.todayStr,denomMin,
      wageSettings:wp.kind==="shifty"?wp.shifty.wageSettings:null,manualPay:own},u);
    return{id:wp.id,kind:wp.kind,name:wp.name,color:wp.color,plan,wage,amounts,notes,times,
      estimate:!plan.monthEnd||(wp.kind==="shifty"&&wage.payType==="daily")};
  });
  const add=k=>rows.reduce((s,r)=>s+(r.amounts[k]!=null?r.amounts[k]:0),0);
  return{payYm:x.payYm,rows,total:add("total"),confirmedTotal:add("confirmedTotal"),projectedTotal:add("projectedTotal"),
    workMin:rows.reduce((s,r)=>s+r.amounts.minutes.workMin,0),hasAmount:rows.some(r=>r.amounts.total!=null)};
}
// 年（暦年）の支給月ごとの一覧と合計。received は users/{uid}/actuals（{支給月: {勤務先: 円}}）
function myPayYearMonths(year){return Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,"0")}`);}
function myReceivedSum(received,payYm){return Object.values((_myObj(received)||{})[payYm]||{}).reduce((s,v)=>s+(Number(v)>0?Math.round(Number(v)):0),0);}
function myPayYearSummary(months,received){
  const rows=(months||[]).map(m=>({payYm:m.payYm,total:m.total,confirmedTotal:m.confirmedTotal,projectedTotal:m.projectedTotal,workMin:m.workMin,
    received:myReceivedSum(received,m.payYm),hasReceived:Object.keys(((_myObj(received)||{})[m.payYm])||{}).length>0}));
  return{rows,total:rows.reduce((s,r)=>s+r.total,0),received:rows.reduce((s,r)=>s+r.received,0),workMin:rows.reduce((s,r)=>s+r.workMin,0)};
}
// 給料タブの既定の支給月: 今日の勤務が払われる支給月のうち最も早いもの（勤務先ごとに設定が違うため）
function myDefaultPayMonth(pays,todayStr){
  const list=(pays||[]).filter(Boolean);
  const ms=(list.length?list:[MY_PAY_DEFAULT]).map(p=>myPayMonthOfDate(todayStr,p));
  return ms.sort()[0];
}
// 円の表示（3桁区切り）
function fmtMyYen(v){if(v==null||!Number.isFinite(Number(v)))return"—";const n=Math.round(Number(v));return`${n<0?"−":""}${Math.abs(n).toLocaleString("ja-JP")}円`;}
// 月間目標に対する進捗の弧（0〜1）。目標が無ければ null
function myGoalProgress(amount,goal){return goal>0?Math.max(0,Math.min(1,(Number(amount)||0)/goal)):null;}
// 会社設定（getMyPay）の戻り値の読み。CF が返す形（functions/my-pay.js）を確かめ、使えるものだけを残す
function myCompanyPayOf(res){
  const r=_myObj(res);
  if(!r||r.error)return{state:"error",error:(r&&r.error)||"",pay:null};
  const pay=_myObj(r.pay)&&["monthly","hourly"].includes(r.pay.payType)?r.pay:null;
  return{state:"ok",pay,homeShopId:typeof r.homeShopId==="string"?r.homeShopId:"",homeShopName:typeof r.homeShopName==="string"?r.homeShopName:""};
}

// ===== スタッフ個別URL（2026-10-04・ユーザーの仕様変更）=====
// シフト募集URL（#/s/<token>）の画面から本人が申請すると、その場で個別URL（#/m/<pageToken>）ができる。管理者がスタッフタブで
// 「スタッフ一覧のどの名前か」を選んで承認すると有効になり、どの端末で開いてもそのスタッフの画面（本人のカレンダー・最新期間の全員の表・
// 最新期間への提出・暗証番号で開く給料）になる。ログインは要らない＝**pageToken を知っていることが権限**（capability）。
// データ（追加だけ・既存ノードは変えない）:
//   staffPageTokens/{pageToken} = {shopId, at}                     逆引き（tokens と同じ発想。直キー読みのみ・作成後は書き換え不可）
//   shops/{shopId}/staffPages/{pageToken} = {status, displayName, number?, requestedAt, name?, approvedAt?, byUid?, revokedAt?, pinResetAt?}
//                                                                  申請は誰でも（pending だけ・name は書けない）、承認・却下・取り消し・改名はオーナーだけ
//   staffPageData/{pageToken}/…                                    本人のデータ（users/{uid} と同じ形。承認済みの間だけ読み書きできる）
//   staffPagePins/{pageToken}                                      給料の暗証番号のハッシュと試行回数（Cloud Functions だけが読み書き）
const MY_PAGE_TOKEN_LEN=24;
const MY_PAGE_TOKEN_RE=/^[A-Za-z0-9]{24}$/;
function isMyPageToken(s){return typeof s==="string"&&MY_PAGE_TOKEN_RE.test(s);}
// 英大小文字と数字の24文字（約142ビット）。genSecureId は記号を含みURLとFirebaseのキーに使えないので使わない
function genMyPageToken(rand){return genMyRecordId("",MY_PAGE_TOKEN_LEN,rand);}
// "#/m/<token>" → token（形は問わない。違えば画面で「使えないURL」と出す）。それ以外のハッシュは null
function myPageRouteOf(h){const m=/^#\/m\/([^/?#]*)\/?$/.exec(String(h==null?"":h));return m?m[1]:null;}
// 個別URL。base は origin+pathname（スタッフ募集URLの buildUrl と同じく LINE のアプリ内ブラウザを外へ出すパラメータを付ける）
function buildMyPageUrl(base,token){return`${String(base||"")}?openExternalBrowser=1#/m/${token}`;}
// 個別URLの下部タブ（アカウントの MY_TABS に「提出」を足したもの）
const MY_PAGE_TABS=[
  {key:"shift",label:"マイシフト"},
  {key:"submit",label:"提出"},
  {key:"pay",label:"給料"},
  {key:"settings",label:"設定"},
];
const MY_PAGE_STATUSES=["pending","approved","rejected","revoked"];
// 申請の記録。入力の検証はアカウントの登録ネームと同じ（validateMyProfile）。番号が空ならキーを持たない
function buildMyPageRequest(input,nowIso){
  const e=validateMyProfile(input);
  if(e)return{error:e};
  const rec={status:"pending",displayName:normalizeMyDisplayName(input.displayName),requestedAt:String(nowIso||"")};
  const num=normalizeMyNumber(input&&input.number);
  if(num)rec.number=num;
  return{rec};
}
// 個別URLを開いたときの状態。tokenRec=staffPageTokens/{token}、pageRec=shops/{shopId}/staffPages/{token}、staff=shops/{shopId}/staff。
// 使ってよいのは state:"ok"（承認済みで、名前がいまのスタッフ一覧にある）だけ。改名・削除の追随が届かなかった名前は missingName で止める
function resolveMyPage(token,tokenRec,pageRec,staff){
  if(!isMyPageToken(token))return{state:"invalid"};
  const tr=_myObj(tokenRec);
  const shopId=tr&&typeof tr.shopId==="string"&&tr.shopId?tr.shopId:"";
  if(!shopId)return{state:"missing"};
  const r=_myObj(pageRec);
  if(!r||!MY_PAGE_STATUSES.includes(r.status))return{state:"missing",shopId};
  const displayName=typeof r.displayName==="string"?r.displayName:"";
  if(r.status!=="approved")return{state:r.status,shopId,displayName};
  const name=typeof r.name==="string"?r.name:"";
  if(!name||!myStaffNamesOf(staff).includes(name))return{state:"missingName",shopId,displayName,name};
  return{state:"ok",shopId,displayName,name,approvedAt:typeof r.approvedAt==="string"?r.approvedAt:""};
}
const MY_PAGE_STATE_MESSAGES={
  invalid:"このURLは正しくありません。お店から受け取ったURLをそのまま開いてください",
  missing:"このURLは見つかりませんでした。お店の管理者に確認してください",
  pending:"お店の管理者の承認を待っています。承認されると、このURLで自分のシフトを見て提出できるようになります",
  rejected:"このURLの申請は承認されませんでした。お店の管理者に確認してください",
  revoked:"このURLは使えなくなりました（お店の管理者が取り消しました）。新しいURLをお店に確認してください",
  missingName:"お店のスタッフ一覧にこの名前がありません（名前の変更か削除）。お店の管理者に確認してください",
};
// 承認済みの個別URLを名前から引く（{名前: {token, rec}}）。1つの名前に承認済みは1つ（承認の差分が前のものを取り消す）
function approvedStaffPagesByName(pages){
  const out={};
  Object.entries(_myObj(pages)||{}).forEach(([t,r])=>{const rec=_myObj(r);if(rec&&rec.status==="approved"&&typeof rec.name==="string"&&rec.name)out[rec.name]={token:t,rec};});
  return out;
}
// 申請（pending）を「提案あり」と「未一致」に分ける。照合は紐付け（E2）の A・B と同じ linkCandidatesFor（takenBy＝既に承認済みの個別URLがある名前）
function splitStaffPageRequests(pages,ctx){
  const taken={};
  Object.entries(approvedStaffPagesByName(pages)).forEach(([n,v])=>{taken[v.token]={name:n};});
  const withCand=[],unmatched=[];
  Object.entries(_myObj(pages)||{}).filter(([,r])=>_myObj(r)&&r.status==="pending")
    .sort((a,b)=>String(a[1].requestedAt||"").localeCompare(String(b[1].requestedAt||"")))
    .forEach(([token,r])=>{
      const cands=linkCandidatesFor({displayName:r.displayName,number:r.number},{...(ctx||{}),staffLinks:taken,uid:token});
      (cands.length?withCand:unmatched).push({token,req:r,cands});
    });
  return{withCand,unmatched};
}
const _myPageErr=msg=>({error:msg});
// 承認の差分（shops/{sid}/staffPages への update）。同じ名前に承認済みの個別URLがあれば取り消す（1つの名前に1つ）
function planApproveStaffPage(o){
  const x=_myObj(o)||{};
  const rec=(_myObj(x.pages)||{})[x.token];
  if(!isMyPageToken(x.token)||!_myObj(rec))return _myPageErr("申請が見つかりません");
  if(rec.status!=="pending")return _myPageErr("この申請は既に処理されています");
  if(typeof x.name!=="string"||!myStaffNamesOf(x.staff).includes(x.name))return _myPageErr("スタッフ一覧にない名前は選べません");
  const at=String(x.nowIso||"");
  const patch={[`${x.token}/status`]:"approved",[`${x.token}/name`]:x.name,[`${x.token}/approvedAt`]:at};
  if(typeof x.byUid==="string"&&x.byUid)patch[`${x.token}/byUid`]=x.byUid;
  Object.entries(_myObj(x.pages)||{}).forEach(([t,r])=>{
    if(t!==x.token&&_myObj(r)&&r.status==="approved"&&r.name===x.name){patch[`${t}/status`]="revoked";patch[`${t}/revokedAt`]=at;}
  });
  return{patch};
}
function planRejectStaffPage(pages,token){
  const rec=(_myObj(pages)||{})[token];
  if(!_myObj(rec)||rec.status!=="pending")return _myPageErr("この申請は既に処理されています");
  return{patch:{[`${token}/status`]:"rejected"}};
}
function planRevokeStaffPage(pages,token,nowIso){
  const rec=(_myObj(pages)||{})[token];
  if(!_myObj(rec)||rec.status!=="approved")return _myPageErr("承認済みの個別URLではありません");
  return{patch:{[`${token}/status`]:"revoked",[`${token}/revokedAt`]:String(nowIso||"")}};
}
// 暗証番号のリセット（管理者）。Cloud Functions は pinResetAt より前に設定された番号を「未設定」として扱う（staffPagePins はクライアントから触れない）
function planResetStaffPagePin(pages,token,nowIso){
  const rec=(_myObj(pages)||{})[token];
  if(!_myObj(rec)||rec.status!=="approved")return _myPageErr("承認済みの個別URLではありません");
  return{patch:{[`${token}/pinResetAt`]:String(nowIso||"")}};
}
// 改名・削除・追加の追随（紐付けと同じ操作 staffLinkOpOf を、読み直した staffPages に当てる）。
// 世代の目印も同じ: 操作の時刻より後に承認された個別URLには当てない（操作の後に正しく承認されたものを取り消さない）。
// 削除は承認を取り消す（status:"revoked"）＝同じ名前をスタッフに登録し直しても、古い個別URLは生き返らない
function planStaffPageOp(pages,op){
  const o=_myObj(op);
  if(!o)return null;
  const out={};
  Object.entries(_myObj(pages)||{}).forEach(([t,r])=>{
    const rec=_myObj(r);
    if(!rec||rec.status!=="approved"||!isMyPageToken(t))return;
    const at=typeof rec.approvedAt==="string"?rec.approvedAt:"";
    if(o.at&&at&&at>o.at)return;
    if(o.kind==="drop"&&Array.isArray(o.names)&&o.names.includes(rec.name)){out[`${t}/status`]="revoked";out[`${t}/revokedAt`]=String(o.at||"");}
    if(o.kind==="rename"&&rec.name===o.from)out[`${t}/name`]=o.to;
  });
  return Object.keys(out).length?out:null;
}

// 給料の暗証番号（P4）。4桁の数字（全角は半角に）。照合・保存は Cloud Functions（functions/my-page.js）だけが行う
function normalizeMyPagePin(s){return toHalfWidthDigits(s).replace(/[\s　]/g,"");}
function isValidMyPagePin(s){return /^[0-9]{4}$/.test(normalizeMyPagePin(s));}
function validateMyPagePinInput(pin,pin2){
  if(!isValidMyPagePin(pin))return"暗証番号は4桁の数字にしてください";
  if(pin2!==undefined&&normalizeMyPagePin(pin)!==normalizeMyPagePin(pin2))return"確認の暗証番号が一致しません";
  return null;
}
// 最新の期間（startDate が最も新しい期間。App の Phase3 の「periods[0]＝最新」・latestPeriod と同じ決め方）。個別URLの提出先と全員の表の期間
function myLatestPeriodOf(periods){
  let best=null;
  (Array.isArray(periods)?periods:[]).forEach(p=>{
    if(!p||!p.id||!/^\d{4}-\d{2}-\d{2}$/.test(String(p.startDate)))return;
    if(!best||String(p.startDate)>String(best.startDate))best=p;
  });
  return best;
}

// ---- 最新期間の全員のシフト表（P3）----
// 個別URLの「全員」の表示。**公開済みの期間だけ**（未公開は state:"unpublished"＝「まだ公開されていません」）。中身は管理者の調整後の確定値
// （scheduledDay＝マイシフトの公開済みと同じ入口）。並びはシフト作成タブと同じ（写し＝resolvePeriodMaster・その期間に非表示の人は落とす
// ＝visibleStaffList・空白列は残す）。休み・休暇は PDF のシフト表に近い（出勤の帯ごとに時刻、休暇の帯は種別名）。労務・ヒートマップ・賃金・メモは出さない。
// o={period, staff, settings（企業設定を重ねた店舗の設定）, subs（その期間の提出）, todayStr, premium, me（本人の名前）}
function myStaffTimeText(min){
  if(min==null||!Number.isFinite(Number(min)))return"";
  const n=Math.max(0,Math.round(Number(min))),h=Math.floor(n/60),mi=n%60;
  return mi?`${h}:${String(mi).padStart(2,"0")}`:String(h);
}
function buildMyStaffTable(o,U){
  const u=_myU(U);const x=o||{};const p=x.period;
  if(!p||!p.id)return{state:"noPeriod"};
  if(!x.premium)return{state:"premium",period:p};
  if(!u.isPeriodPublished(p))return{state:"unpublished",period:p};
  const master=u.resolvePeriodMaster(p,x.staff||[],x.settings||{},x.todayStr);
  const st=master.settings||{};
  const names=u.visibleStaffList(master.staffList||[],st,p);
  const byName=new Map();
  (Array.isArray(x.subs)?x.subs:[]).forEach(s=>{if(s&&s.periodId===p.id&&s.staffName&&!byName.has(s.staffName))byName.set(s.staffName,s);});
  const cols=names.map(n=>u.isSpacer(n)?{spacer:true}:{name:n,me:!!x.me&&n===x.me});
  const dates=_myDatesOf(p);
  let maxChars=1;
  const rows=dates.map(date=>({date,holiday:!!(u.isHoliday&&u.isHoliday(date)),cells:cols.map(c=>{
    if(c.spacer)return null;
    const sub=u.resolveSubByAlias(n=>byName.get(n),c.name,st.staffAliases||{});
    const sh=sub&&sub.shifts?sub.shifts[date]:null;
    const lvS=sh?u.leaveCellTextOf(sh,"start"):"",lvE=sh?u.leaveCellTextOf(sh,"end"):"";
    const sd=u.scheduledDay(sub,date,st,c.name);
    const work=!sd.isRest&&sd.workMin>0;
    const main=(sd.segments||[]).find(g=>!g.extra);
    const extra=(sd.segments||[]).find(g=>g.extra);
    const top=lvS||(work&&main?myStaffTimeText(main.startMin):work&&extra?myStaffTimeText(extra.startMin):"");
    const bottom=lvE||(work&&main?myStaffTimeText(main.endMin):work&&extra?myStaffTimeText(extra.endMin):"");
    [top,bottom].forEach(t=>{if(t.length>maxChars)maxChars=t.length;});
    if(!top&&!bottom)return null;
    return{top,bottom,work,leave:!!(lvS||lvE),extra:!!(work&&main&&extra)};
  })}));
  return{state:"ok",period:p,confirmed:u.isPeriodConfirmed(p),publishedAt:p.published.at,cols,rows,maxChars};
}
// 全員の表を横幅いっぱいに収める寸法（横スクロールさせない。細部はピンチで拡大して見る）。
// width＝表に使える幅（px）、cols＝buildMyStaffTable の cols、maxChars＝セルの最長の文字数。空白列は 0.4 列ぶん
function myStaffTableLayout(o){
  const x=o||{};
  const width=Math.max(0,Number(x.width)||0);
  const cols=Array.isArray(x.cols)?x.cols:[];
  const units=cols.reduce((a,c)=>a+(c&&c.spacer?0.4:1),0)||1;
  const dateW=Math.max(20,Math.min(34,Math.round(width*0.09)));
  const colW=Math.max(0,(width-dateW)/units);
  // 数字の幅はおよそ 0.6em。セルの左右の余白を 2px 取り、14px を上限にする（下限は設けない＝収めることを優先し、ピンチで拡大して読む）
  const chars=Math.max(2,Number(x.maxChars)||2);
  const fontPx=Math.max(1,Math.min(14,Math.floor(((colW-2)/(chars*0.62))*10)/10));
  return{width,dateW,colW,spacerW:colW*0.4,fontPx,headFontPx:Math.max(1,Math.min(13,Math.floor(Math.min(colW*0.8,14)*10)/10)),rowH:Math.ceil(fontPx*1.2*2+2)};
}

// ===== Nodeテスト用エクスポート（ブラウザでは module 未定義のため無視される）=====
if(typeof module!=="undefined"&&module.exports){
  module.exports={MY_TABS,isMyRouteHash,MY_DISPLAY_NAME_MAX,MY_NUMBER_MAX,MY_PASSWORD_MIN,toHalfWidthDigits,normalizeMyDisplayName,normalizeMyNumber,validateMyProfile,buildMyProfileRecord,myProfileOf,validateMyEmail,validateMyPassword,MY_CREDENTIAL_ERROR_CODES,isPermissionDeniedError,myAuthErrorMessage,isMyCredentialError,MY_BLOCK_MESSAGES,staffAccountBlockReason,myOwnerCheckShopIds,isStaffAccountMarked,mayBeStaffAccountUser,
    MY_LINK_METHOD_LABELS,MY_LINK_CODE_LEN,MY_LINK_CODE_TTL_MS,linkNumberKey,linkNameKey,normalizeLinkCode,isValidLinkCode,myStaffNamesOf,personIdForShopName,linkCandidatesFor,splitLinkRequests,staffLinksByName,renameStaffInStaffLinks,dropStaffFromStaffLinks,MY_STAFF_LINK_OPS_MAX,staffLinkOpOf,staffLinksAsOf,planStaffLinkOp,enqueueStaffLinkOp,MY_STAFF_LINK_PENDING_MSG,resolveMyLink,MY_LINK_INVALID_LABELS,buildLinkRequestRecord,fmtLinkCodeExpiry,
    MY_WORKPLACE_COLORS,myWorkplaceColor,myShiftPremiumOf,fmtMyClock,fmtMyRange,myPeriodOverlaps,buildMyShiftDays,myDayFingerprint,myShiftSeenKey,myPublishedFingerprints,myChangedDates,buildMySeenRecord,nextMyShift,myMonthGrid,myShiftMonth,myShiftPeriodsToRead,myEntryOrder,
    MY_WORKPLACE_NAME_MAX,MY_SHIFT_MEMO_MAX,MY_CLOCK_MAX_MIN,MY_MANUAL_WP_ID_RE,MY_SHIFT_ID_RE,genMyRecordId,isMyDateStr,myClockStr,parseMyClockInput,MY_TIME_OPTIONS,MY_BREAK_OPTIONS,parseMyMinutesInput,
    MY_OVERNIGHT_HINT,validateMyShiftInput,buildMyShiftRecord,myShiftDuplicateOf,myOverrideOf,planMyOverride,myWorkplaceList,myNextWorkplaceColor,validateMyWorkplaceInput,buildMyWorkplacePatch,
    buildMyManualDays,myShiftHistoryCandidates,myPayWorkDays,icsFoldLine,MY_ICS_DOMAIN,buildMyIcs,myIcsEntriesForMonth,myIcsPlatformOf,MY_ICS_HINTS,myGoogleCalendarLinks,
    MY_PAY_END_DAY,MY_PAY_HOLIDAY_RULES,MY_PAY_HOLIDAY_RULE_LABELS,MY_PAY_WAGE_TYPES,MY_PAY_WAGE_TYPE_LABELS,MY_PAY_OFFSET_LABELS,MY_PAY_YEN_MAX,MY_PAY_GOAL_MAX,MY_PAY_DEFAULT,
    MY_MANUAL_NIGHT_PCT,MY_MANUAL_OVER8_PCT,MY_MANUAL_OVER8_MIN,myPayDayLabel,myPayOf,validateMyPayInput,buildMyPayRecord,myPayFormOf,parseMyGoalInput,myGoalOf,parseMyReceivedInput,
    myClampDay,myClosingMonthOf,myClosingRangeOf,myPayDateOf,myPayPlanOf,myPayMonthOfDate,myPeriodsInRange,myPayReadRange,myShiftyDayInfo,myMonthSettingsOf,
    myShiftyPayTimes,myManualPayTimes,myWageSourceOf,MY_PAY_ITEM_KEYS,myPayAmounts,myPayMonthFor,myPayYearMonths,myReceivedSum,myPayYearSummary,myDefaultPayMonth,
    fmtMyYen,myGoalProgress,myCompanyPayOf,
    MY_PAGE_TOKEN_LEN,MY_PAGE_TOKEN_RE,isMyPageToken,genMyPageToken,myPageRouteOf,buildMyPageUrl,MY_PAGE_TABS,MY_PAGE_STATUSES,buildMyPageRequest,resolveMyPage,MY_PAGE_STATE_MESSAGES,
    approvedStaffPagesByName,splitStaffPageRequests,planApproveStaffPage,planRejectStaffPage,planRevokeStaffPage,planResetStaffPagePin,planStaffPageOp,myLatestPeriodOf,normalizeMyPagePin,isValidMyPagePin,validateMyPagePinInput,myStaffTimeText,buildMyStaffTable,myStaffTableLayout};
}
