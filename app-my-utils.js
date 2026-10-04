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
// ===== メール確認つきの新規登録（2026-10-04・ユーザー指示「確認メールを送り、メールのリンクから続きの登録」）=====
// Firebase Auth のメールリンク（sendSignInLinkToEmail → リンクを開く → signInWithEmailLink → updatePassword）。
// 管理者（ログイン画面・設定タブのアカウント連携）とスタッフ（マイシフト）の**新規登録だけ**がこの流れを通る。ログイン・再設定・Google・企業コードは変えない。
// 戻り先（continueUrl）はクエリで「どの登録の続きか」だけを持つ: elk=staff|admin、elh=戻るハッシュ（#/s/… #/me。スタッフだけ）。
// **メールアドレス・店舗コード・名前は URL に載せない**（同じブラウザで開いたときのために localStorage に置く）。
// Firebase はこの URL に apiKey・oobCode・mode=signIn・lang をクエリで付けて戻す。ハッシュを付けると付け足しが壊れるので戻り先にはハッシュを付けない
const EMAIL_LINK_PENDING_LS="ots_emailLinkPending_v1";
const EMAIL_LINK_KINDS=["staff","admin"];
const EMAIL_LINK_PENDING_MAX_MS=7*24*60*60*1000; // 覚えておくアドレスの有効期間（リンク自体の期限は Firebase が決める）
const EMAIL_LINK_RESEND_WAIT_MS=30*1000;
// メールリンクが使えないとき（Firebase コンソールで無効・戻り先のドメインが承認されていない）のエラーコード。
// これらは**従来の登録（その場でパスワードを入れて作る）へ自動で切り替える**（コンソールの設定前でも登録を止めない）。
// 2026-10-04 に dev（メールリンク無効）へ本物の SDK で送ると、戻り先が localhost・shiftyshifty.app・firebaseapp.com のどれでも auth/operation-not-allowed
const EMAIL_LINK_FALLBACK_CODES=["auth/operation-not-allowed","auth/unauthorized-continue-uri","auth/invalid-continue-uri","auth/missing-continue-uri","auth/unauthorized-domain","auth/admin-restricted-operation"];
function isEmailLinkFallbackError(e){return EMAIL_LINK_FALLBACK_CODES.includes(String((e&&e.code)||""));}
// 戻るハッシュとして受け付ける形（従来のスタッフURL・#/me）。それ以外は捨てる（任意の場所へ飛ばさない）
function emailLinkSafeHash(h){const s=String(h||"");return /^#\/[A-Za-z0-9_\-/.~]{1,120}$/.test(s)&&!s.includes("..")?s:"";}
// loc={origin, pathname}。戻り先の URL
function emailLinkContinueUrl(loc,o){
  const x=o||{};
  const kind=EMAIL_LINK_KINDS.includes(x.kind)?x.kind:"admin";
  const q=new URLSearchParams();q.set("elk",kind);
  const h=kind==="staff"?emailLinkSafeHash(x.hash):"";
  if(h)q.set("elh",h);
  return`${loc.origin}${loc.pathname||"/"}?${q.toString()}`;
}
// 開いた URL がこの登録の続きか。続きでなければ null。{kind, hash, hasCode（oobCode と mode=signIn がある）}
function parseEmailLinkLanding(href){
  let u;try{u=new URL(String(href||""));}catch{return null;}
  const kind=u.searchParams.get("elk");
  if(!EMAIL_LINK_KINDS.includes(kind))return null;
  return{kind,hash:emailLinkSafeHash(u.searchParams.get("elh")),hasCode:u.searchParams.get("mode")==="signIn"&&!!u.searchParams.get("oobCode")};
}
// 登録を終えた（やめた）あとに開く URL＝クエリ（oobCode）を落とし、戻るハッシュを付ける
function emailLinkCleanUrl(href,hash){
  let u;try{u=new URL(String(href||""));}catch{return"/";}
  return`${u.origin}${u.pathname}${emailLinkSafeHash(hash)}`;
}
// 送った記録（同じブラウザで開いたときにアドレスを入れ直さなくて済むように）。kind が違う・古い記録は使わない
function emailLinkPendingRecord(email,kind,nowMs,linkShopId){
  const r={email:String(email||"").trim(),kind,at:Number(nowMs)||0};
  if(typeof linkShopId==="string"&&linkShopId)r.linkShopId=linkShopId;
  return r;
}
function emailLinkPendingFor(rec,kind,nowMs){
  if(!rec||typeof rec!=="object"||rec.kind!==kind||typeof rec.email!=="string"||!rec.email)return null;
  const at=Number(rec.at)||0;
  if(!(at>0)||Number(nowMs)-at>EMAIL_LINK_PENDING_MAX_MS)return null;
  return rec;
}
// 管理者のパスワードは従来どおり6文字以上（スタッフは MY_PASSWORD_MIN）
const ADMIN_PASSWORD_MIN=6;
function validateEmailLinkPassword(kind,pw,pw2){
  const min=kind==="staff"?MY_PASSWORD_MIN:ADMIN_PASSWORD_MIN;
  const s=String(pw==null?"":pw);
  if(!s)return"パスワードを入力してください";
  if(s.length<min)return`パスワードは${min}文字以上にしてください`;
  if(s!==String(pw2==null?"":pw2))return"確認用のパスワードが一致しません";
  return null;
}
// 送信・続きの登録のエラー文言。phase は "send"|"finish"|"password"
function emailLinkErrorMessage(e,phase){
  const code=String((e&&e.code)||"");
  if(code==="auth/invalid-action-code"||code==="auth/expired-action-code")return"このリンクは期限切れか、すでに使われています。もう一度登録をやり直してください";
  if(code==="auth/invalid-email")return phase==="finish"?"メールアドレスが、確認メールを送ったアドレスと違います":"メールアドレスの形式が正しくありません";
  if(code==="auth/too-many-requests")return"送信が多すぎます。しばらく待ってからもう一度お試しください";
  if(code==="auth/network-request-failed")return"通信できませんでした。通信状態を確認してもう一度お試しください";
  if(code==="auth/weak-password")return"パスワードが短すぎます";
  if(code==="auth/requires-recent-login")return"もう一度メールのリンクから登録を続けてください";
  return phase==="send"?"確認メールを送れませんでした。もう一度お試しください":phase==="password"?"パスワードを設定できませんでした。もう一度お試しください":"登録を続けられませんでした。もう一度お試しください";
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
// スタッフアカウントを「店舗＋登録名」に紐付ける（計画書 E.3）。A＝従業員番号・B＝登録ネームは管理者への提案。
// C＝個人リンクコードは 2026-10-05 にユーザー指示で機能ごと削除した（スタッフ専用のURLに一本化）。以前にコードで作られた紐付けは
// method:"code" のまま残るので、表示名（MY_LINK_METHOD_LABELS.code）は残してある。照合の規則は Cloud Functions の functions/staff-link.js と**同じ内容**にする
// （functions/ はこのファイルを読めないので書き写している。一致は tests/my.test.js が照合する）。
// データ: shops/{sid}/linkRequests/{uid}（本人の申請）・shops/{sid}/staffLinks/{uid}（紐付け。名前の正本）・users/{uid}/links/{sid}（本人の索引）。
const MY_LINK_METHOD_LABELS={number:"従業員番号が一致",name:"登録ネームが一致",code:"個人リンクコード"};
// 方式A の照合キー: 全角数字を半角にし前後の空白を落とす。数字だけのときだけキーになる（それ以外は ""＝照合しない）。先頭のゼロは残す
function linkNumberKey(s){const t=normalizeMyNumber(s);return /^[0-9]+$/.test(t)?t:"";}
// 方式B の照合キー: 空白（半角・全角、途中も含む）をすべて除く。それ以外は一字一句そのまま
function linkNameKey(s){return String(s==null?"":s).replace(/[\s　]/g,"");}
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

// ===== マイシフト（2026-10-04・第2部 E3）=====
// app-utils.js の関数（scheduledDay・resolvePeriodMaster・resolveSubByAlias・isStaffHiddenInPeriod・isPeriodPublished・
// isPeriodConfirmed・featureEnabled・pd・fd）を使う。Node のテストはこのファイルだけを require するので、U（app-utils.js の
// module.exports）を引数で渡す。ブラウザでは省略してよい（同じ名前のグローバルを使う）
function _myU(U){
  if(U)return U;
  return{scheduledDay,resolveActualDay,resolvePeriodMaster,resolveSubByAlias,isStaffHiddenInPeriod,isPeriodPublished,isPeriodConfirmed,featureEnabled,
    // 全員のシフト表（個別URL・2026-10-04）。期間の選択肢は管理者画面の subs 部分購読と同じ窓（subsWindowCutoff）
    visibleStaffList,isSpacer,leaveCellTextOf,leaveShownTextOf,isHoliday,subsWindowCutoff,
    // 全員のシフト表は PDF のシフト表と同じ関数（2026-10-04）
    isUnregisteredSubName,gd,isFixedShiftEligibleShop,oneSidedFillBounds,headcountAtOf,heatStaffDayEntriesOf,shiftSheetHeadcountOf,shiftTableHtmlOf,shiftSheetCellOf,shiftSheetStoredText,
    // 全員のシフト表の他店でのヘルプ勤務（H2）。PDF（シフト作成タブの helperDisp）と同じ関数
    helperShopsOf,helperPersonOf,helperWorkOn,helperCellDisplay,effShiftRangeMin,shiftSheetDecimal,shiftSheetFixedKey,otherShopDataOf,
    // 本人のカレンダーと給料のヘルプ勤務（2026-10-04 B）。行き先の店の設定（helperShopSettingsOn）で引く＝管理者画面の合算（P3.6）と同じ
    helperShopSettingsOn,fmtMin,
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
        // 実績の上書き（E4・users/{uid}/overrides/{shopId}/{date}）は**給料計算にだけ効く**（2026-10-04 ユーザー指示
        // 「スタッフ側の出退勤時間の変更は給料計算のみに影響」）。entry の時刻（startMin〜segments）は常に公開内容（sched）で、
        // カレンダー・日付の詳細の主表示・次のシフト・.ics・Google カレンダー・全員の表は上書きの有無に関係なく公開内容を出す。
        // 上書きの値は actual（表示用の要約）と actualDay（resolveActualDay の戻り値＝myPayWorkDays が使う）にだけ載せる。
        // 計算は店舗の実績と同じ resolveActualDay（退勤延長は足さない・締の追加出勤は確定シフトのまま足す）。
        // 「変更あり」の指紋も公開内容（sched）で作る＝上書きしても変更ありにならない
        const ov=myOverrideOf(ovs[date]);
        const ad=u.resolveActualDay?u.resolveActualDay(sub,ov?{start:ov.start,end:ov.end,breakMin:ov.breakMin}:null,date,st,name):null;
        const actual=ov&&ad?{startMin:ad.startMin,endMin:ad.endMin,breakMin:ad.breakMin,workMin:ad.workMin,segments:segOf(ad.segments)}:null;
        out.push({...base,date,kind:"published",confirmed,...sched,sched,overridden:!!actual,override:actual?ov:null,actual,actualDay:ad,hope,differs});
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
    if(!e||e.kind!=="published"||e.helper)return; // ヘルプ先の勤務（2026-10-04）は他店のデータなので「変更あり」に入れない
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
// ---- 本人のカレンダーと給料のヘルプ勤務（2026-10-04 ユーザー指示「ヘルプ関係なしに所属店舗のシフトが確定されたら管理者画面の pdf 通りに
// ヘルプ勤務も反映して」「ヘルプ先の勤務も計算に入れて」「ヘルプ先の日にも実績の時刻を入れられるように」）----
// 所属店舗（shopId）が公開済みの期間で、PDF のシフト表のその人のセルがヘルプ表示になる日の他店での勤務。**ヘルプ先の店舗の状態**
// （公開済みか・本人がヘルプ先に紐付いているか・ヘルプ先のプラン）には関係しない。規則は PDF（buildMyShiftSheet の helperDispOf・
// シフト作成タブの helperDisp）と同じ: 所属店舗＝helperPersonOf の role "home" の人だけ・休暇の日は出さない・自店の勤務と時間が重なる
// 他店の勤務は足さない（helperWorkOn）。時間は**行き先の店の設定**で引いた実働（helperShopSettingsOn・管理者画面の合算 P3.6 と同じ）。
// 本人の実績（overrides）は**ヘルプ先の店舗の ID** をキーに持つ（users/{uid}/overrides/{ヘルプ先}/{日付}・同じ日に所属店舗とヘルプ先の
// 両方で働く日もそれぞれの実績を持てる）。実績は給料計算だけに効き、休憩が無ければ行き先の店の設定で判定し直す（resolveActualDay）。
// o={shopId, name, periods, subsByPeriod, settings（企業設定を重ねた所属店舗の設定）, staff, todayStr, premium（公開済みの表示ができるか）,
//    companyLink（shops/{所属店舗}/company）, otherShops（{sid: otherShopDataOf の戻り値}）, overrides（{shopId:{日付:記録}}＝本人の全部）}
// 戻り値 {role:"home"|null, unread（合算に要る他店を読めていない）, byDate:{日付:[{shopId,shopName,regName,homeShopId,periodId,confirmed,
//          sched,ov,actualDay}]}}
function myHelperDaysOf(o,U){
  const u=_myU(U);const x=o||{};
  const out={role:null,unread:false,byDate:{}};
  const link=_myObj(x.companyLink);
  if(!x.name||!x.shopId||!link||!x.premium)return out;
  const shops=u.helperShopsOf(link,_myObj(x.otherShops)||{},x.shopId);
  if(!Object.keys(shops).length)return out;
  const people=link.people||null;
  const eid=typeof link.entityId==="string"?link.entityId:null;
  const coSt=link.settings||null;
  const cache=new Map();
  const ovs=_myObj(x.overrides)||{};
  (x.periods||[]).forEach(p=>{
    if(!p||!p.id||!u.isPeriodPublished(p))return;
    const list=x.subsByPeriod&&x.subsByPeriod[p.id];
    if(!Array.isArray(list))return;
    const st=u.resolvePeriodMaster(p,x.staff||[],x.settings||{},x.todayStr).settings||{};
    if(u.isStaffHiddenInPeriod(x.name,st,p))return;
    const hi=u.helperPersonOf({shopId:x.shopId,name:x.name,settings:st,people,otherShops:shops,entityId:eid});
    if(hi.unread)out.unread=true;
    if(hi.role!=="home")return;
    out.role="home";
    const byName=new Map();
    list.forEach(s=>{if(s&&s.staffName&&s.periodId===p.id&&!byName.has(s.staffName))byName.set(s.staffName,s);});
    const sub=u.resolveSubByAlias(n=>byName.get(n),x.name,st.staffAliases||{});
    const confirmed=u.isPeriodConfirmed(p);
    _myDatesOf(p).forEach(date=>{
      if(out.byDate[date])return;
      const sh=sub&&sub.shifts?sub.shifts[date]:null;
      if(u.leaveShownTextOf(sh,"start")||u.leaveShownTextOf(sh,"end"))return;
      const wsh=sh&&sh.status==="work"?sh:null;
      const ownRange=wsh?u.effShiftRangeMin(wsh,st):null;
      const es=u.helperWorkOn({regs:hi.regs,otherShops:shops,date,todayStr:x.todayStr,companySettings:coSt,ownRange,cache});
      const rows=[];
      es.forEach(e=>{
        const shop=shops[e.shopId];
        const hsh=shop&&shop.workMap?shop.workMap.get(e.name+"|"+date):null;
        if(!hsh)return;
        const hst=u.helperShopSettingsOn(shop,e.shopId,date,x.todayStr,coSt,cache);
        const one={shifts:{[date]:hsh}};
        const sd=u.scheduledDay(one,date,hst,e.name);
        const segOf=gs=>(gs||[]).map(g=>({startMin:g.startMin,endMin:g.endMin,extra:!!g.extra}));
        const ov=myOverrideOf((_myObj(ovs[e.shopId])||{})[date]);
        const ad=u.resolveActualDay(one,ov?{start:ov.start,end:ov.end,breakMin:ov.breakMin}:null,date,hst,e.name);
        rows.push({shopId:e.shopId,shopName:e.shopName||e.shopId,regName:e.name,homeShopId:x.shopId,periodId:p.id,confirmed,
          sched:{startMin:sd.startMin,endMin:sd.endMin,breakMin:sd.breakMin,workMin:sd.workMin,segments:segOf(sd.segments)},
          ov,actualDay:ad,actual:ov?{startMin:ad.startMin,endMin:ad.endMin,breakMin:ad.breakMin,workMin:ad.workMin,segments:segOf(ad.segments)}:null});
      });
      if(rows.length)out.byDate[date]=rows;
    });
  });
  return out;
}
// ヘルプ勤務をカレンダーの entry にする。kind は公開と同じ（次のシフト・.ics・日付の詳細・実績の入力に出す）。helper:true で見分け、
// 「変更あり」の指紋には入れない（myPublishedFingerprints）。時刻は公開内容（sched）、実績は actual（給料計算だけ）
function myHelperShiftEntries(hd,o){
  const x=o||{};const out=[];
  Object.entries((hd&&hd.byDate)||{}).forEach(([date,rows])=>(rows||[]).forEach(h=>{
    out.push({shopId:h.shopId,workplaceId:h.shopId,shopName:h.shopName,color:x.colorOf?x.colorOf(h.shopId):MY_WORKPLACE_COLORS[0],periodId:h.periodId,date,
      kind:"published",helper:true,homeShopId:h.homeShopId,homeShopName:x.homeShopName||"",confirmed:h.confirmed,...h.sched,sched:h.sched,
      overridden:!!h.actual,override:h.actual?h.ov:null,actual:h.actual,actualDay:h.actualDay,hope:null,differs:false});
  }));
  return out;
}
// 二重に出さない: 本人がヘルプ先にも紐付いていて、そのお店の公開済みのシフトとして同じ日に出ているヘルプ勤務は外す（そちらを残す）
function myMergeHelperEntries(entries,helperEntries){
  const has=new Set((entries||[]).filter(e=>e&&e.kind==="published"&&!e.helper).map(e=>e.shopId+"|"+e.date));
  return[...(entries||[]),...(helperEntries||[]).filter(h=>!has.has(h.shopId+"|"+h.date))];
}
// 所属店舗の給料に寄せたヘルプ先の日（{ヘルプ先の店舗: [日付]}）。ヘルプ先の勤務先の側では、この日を数えない（二重に数えない・
// 所属店舗へ寄せるのが管理者画面の規則と同じ）。helperByHome＝{所属店舗: myHelperDaysOf の戻り値}
function myMovedHelperDates(helperByHome){
  const out={};
  Object.values(_myObj(helperByHome)||{}).forEach(hd=>Object.entries((hd&&hd.byDate)||{}).forEach(([d,rows])=>(rows||[]).forEach(h=>{(out[h.shopId]=out[h.shopId]||new Set()).add(d);})));
  return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,[...v].sort()]));
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
// 時刻と休憩は**15分刻みのプルダウンだけ**で選ぶ（2026-10-04 ユーザー指示。自由記入の欄は置かない）。
// 時刻は 0:00〜30:00（深夜営業の24時超え表記を含む＝シフト表と同じ）。value は保存の形・label はシフト表と同じ表記
const MY_TIME_STEP_MIN=15;
const MY_TIME_OPTIONS=(()=>{const a=[];for(let t=0;t<=MY_CLOCK_MAX_MIN;t+=MY_TIME_STEP_MIN)a.push({value:myClockStr(t),label:fmtMyClock(t)});return a;})();
// 休憩（分）の選択肢（0〜180分の15分刻み）
const MY_BREAK_MAX_OPTION_MIN=180;
const MY_BREAK_OPTIONS=(()=>{const a=[];for(let t=0;t<=MY_BREAK_MAX_OPTION_MIN;t+=MY_TIME_STEP_MIN)a.push(t);return a;})();
// プルダウンに出す時刻。今の値が15分刻みでない（以前の5分刻み・9:05 等）ときは、その値を選択肢に足して表示と保持をする
// （黙って丸めない＝保存し直しても値が変わらない）。value は入力の文字列（"HH:MM" か ""）
function myTimeSelectOptions(value){
  const v=parseMyClockInput(value);
  if(!v||MY_TIME_OPTIONS.some(o=>o.value===v))return MY_TIME_OPTIONS;
  const min=_myClock(v);
  return[...MY_TIME_OPTIONS,{value:v,label:fmtMyClock(min)}].sort((a,b)=>_myClock(a.value)-_myClock(b.value));
}
// プルダウンに出す休憩（分）。15分刻みでない・180分を超える今の値は、その値を足す
function myBreakSelectOptions(value){
  const n=parseMyMinutesInput(value);
  if(n==null||MY_BREAK_OPTIONS.includes(n))return MY_BREAK_OPTIONS;
  return[...MY_BREAK_OPTIONS,n].sort((a,b)=>a-b);
}
function parseMyMinutesInput(v){
  const s=toHalfWidthDigits(v).replace(_MY_TRIM_RE,"");
  if(!s)return 0;
  if(!/^\d{1,4}$/.test(s))return null;
  const n=+s;return n<=1440?n:null;
}
// 開始・終了・休憩の検証（手入力のシフトと実績の上書きで共通）。戻り値 {error, suggestEnd?} か {start,end,breakMin,startMin,endMin}
const MY_OVERNIGHT_HINT="日をまたぐときは、24時より後の時刻を選びます（翌2:00 なら 26:00）";
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
// その店舗でのその人の従業員番号（settings.staffNumbers[名前]）。番号は店舗ごとに違うので、設定タブの勤務先の名前の横に店舗ごとに出す
// （2026-10-04 ユーザー指示）。未登録・空・文字列でなければ ""（何も出さない）
function myStaffNumberOf(settings,name){
  const m=settings&&settings.staffNumbers&&typeof settings.staffNumbers==="object"?settings.staffNumbers:null;
  const v=m&&name?m[name]:null;
  return typeof v==="string"||typeof v==="number"?String(v).replace(_MY_TRIM_RE,""):"";
}
// アカウントの従業員番号（profile.number）の説明。1つしか持てないので、照合に使う番号であることと、お店ごとに違うときの入れ方を書く
const MY_PROFILE_NUMBER_HINT="お店とのリンクの照合に使います。お店ごとに番号が違うときは、リンクを申請するお店の番号を入れてください。お店ごとの番号は勤務先の一覧に出ます";
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
//   時刻は、上書きのある日は上書き（e.actual）・それ以外は公開内容（entry の表示用の時刻は常に公開内容なので、ここで取り替える）
function myPayWorkDays(entries){
  return(entries||[]).filter(e=>e&&(e.kind==="published"||e.kind==="manual")).map(e=>{
    const t=e.kind==="published"&&e.overridden&&e.actual?e.actual:e;
    return{date:e.date,kind:e.kind==="manual"?"manual":"shifty",workplaceId:e.workplaceId||e.shopId,shopId:e.shopId||null,periodId:e.periodId||null,
      shiftId:e.shiftId||null,confirmed:!!e.confirmed,source:e.kind==="manual"?"manual":e.overridden?"override":"published",
      startMin:t.startMin,endMin:t.endMin,breakMin:t.breakMin,workMin:t.workMin,segments:(t.segments||[]).map(g=>({...g})),actualDay:e.actualDay||null};
  });
}
// ---- .ics（RFC 5545）----
// 公開済み（本人の実績の上書きがあっても公開の時刻）と手入力のシフトを VEVENT にする。未公開（グレー）は含めない。
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
      // 時刻は公開内容（本人の実績の上書きは給料計算にだけ効く＝カレンダーには出さない・2026-10-04）
      if(e.kind==="published")desc.push(e.confirmed?"確定":"公開");
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
// TimeTree などのアプリで見るときの案内（2026-10-04・ユーザー指示「TimeTree 等のアプリにも対応して」）。
// 事実は TimeTree の公式ヘルプ（support.timetreeapp.com の記事 360000629341「他のカレンダーを利用したい」・360000639682「他のカレンダーを表示したい」・
// 360000639742「他のカレンダーを共有したい」・24881309862041「シフトボードがTimeTreeに反映されない」・11197101505433。2026-10-04 に読んだ）:
//   ・TimeTree は .ics のファイルを直接は取り込めない（取り込み元は iPhone・Android の標準カレンダーと、そこに同期している Google カレンダー等だけ）
//   ・標準カレンダーの予定は「ホームカレンダー」に表示でき、自動で更新される（カレンダーの権限＝iOS は「フルアクセス」・表示するフィルターでオン）
//   ・共有カレンダーへの「外部カレンダーの予定をインポート」は自動では更新されず、内容が違う予定は別の予定として重複して入る
// したがって効く経路は「.ics を端末のカレンダーに取り込む → TimeTree のホームカレンダーで表示」だけ。ほかのアプリ（ジョルテ・Yahoo!カレンダー等）は
// 公式の情報を確かめられていないので名前を出さず、「端末のカレンダーの予定を表示できるアプリ」とだけ書く（確かめていない対応を「対応」と書かない）
const MY_ICS_APP_GUIDE={
  title:"TimeTree などのアプリで見るには",
  intro:"TimeTree は .ics のファイルを直接は取り込めません。いったん端末のカレンダーに取り込むと、端末のカレンダーの予定を表示できるアプリ（TimeTree など）にも出ます。",
  steps:{
    ios:["上のボタンでこの月のシフトを書き出し、「すべてを追加」で iPhone のカレンダーに取り込む",
      "iPhone の「設定」→「TimeTree」→「カレンダー」で「フルアクセス」を許可する",
      "TimeTree の画面左下のカレンダー → 右上のアイコン →「表示するフィルターを選択」で、取り込んだカレンダー（iCloud など）をオンにする"],
    android:["パソコンのブラウザで Google カレンダーの「設定 → インポート / エクスポート」からこのファイルを取り込む（スマホだけなら、日付の詳細の「Google カレンダーに追加」で1件ずつ）",
      "端末の「設定」でその Google アカウントのカレンダーの同期をオンにし、「アプリ」→「TimeTree」→「権限」でカレンダーを許可する",
      "TimeTree の画面左下のカレンダー → 右上のアイコン →「表示するフィルターを選択」で、そのカレンダーをオンにする"],
    desktop:["このパソコンで Google カレンダーの「設定 → インポート / エクスポート」からこのファイルを取り込む",
      "スマホの端末のカレンダーにその Google アカウントを追加して同期する（iPhone は「設定」→「カレンダー」→「アカウント」→「アカウントを追加」）",
      "スマホの TimeTree にカレンダーの権限を許可し、「表示するフィルターを選択」でそのカレンダーをオンにする"],
  },
  note:"ホームカレンダーに表示する方法なら、端末のカレンダーの予定が変わると TimeTree にも自動で反映されます。共有カレンダーへの「外部カレンダーの予定をインポート」は自動では更新されず、時刻が変わった予定は別の予定として重複して入ります。",
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

// ===== カレンダーへ取り込む前の確認（2026-10-04・ユーザー指示「カレンダー同期の際、ホーム画面にブックマークを保存する必要がある、
// ないしはその他操作が必要ならその操作を促すポップアップを表示する」）=====
// 確かめた事実（2026-10-04）:
//   ・iOS の Safari（タブ）: a[download]＋blob で「カレンダーに追加」の画面が直接出る（iOS 27 のシミュレーター）
//   ・iOS のホーム画面に追加して開いた状態（navigator.standalone=true・ウェブアプリとして開く）: 同じ渡し方で同じ画面が出て、閉じるとアプリに戻る
//     （iOS 27 のシミュレーター。UA は Safari のタブと同じ）。**ホーム画面への追加は取り込みに不要で、妨げにもならない**ので促さない。
//     古い iOS ではホーム画面のアプリのダウンロードが効かない・閉じられない報告がある（WebKit Bugzilla 231892〔iOS 13〜15〕・275288〔iOS 17〕）ので、
//     書き出した後の案内に「画面が出ないときは Safari で開く」を1文足すだけにする（UA の OS 表記は 18_7 に固定されていて版で分けられない）
//   ・アプリの中のブラウザ（LINE・Instagram・Facebook・TikTok 等）: WKWebView は blob: の a[download] に対応しない（WebKit Bugzilla 216918）、
//     ダウンロードはアプリ側の実装（iOS は WKDownload・Android は DownloadListener）が要る。Google は埋め込みのブラウザからの OAuth を
//     2021-09-30 から拒否している（Google Developers Blog）。**実機では未確認**（シミュレーターに LINE 等が無い）ので「取り込めないことがある」と書く
//   ・LINE は URL の openExternalBrowser=1 で外部ブラウザで開く（LINE Developers「LINE URL スキーム」の「外部ブラウザで開く」。
//     LINE の中のブラウザで開いているページから、この印を付けた URL へ移ったときに外部ブラウザへ切り替わるかは未確認）
//   ・Android の WebView は UA に「; wv」が入る（Android Developers Blog 2024-12「User-Agent reduction on Android WebView」）
//   ・Android の Chrome・PC: ファイルはダウンロードされるだけで、開く操作が要る（Google カレンダーのアプリは .ics を開けない＝MY_ICS_HINTS と同じ）
// 判定は UA だけ（X・Slack は印が無く判定できない＝アプリの中でも「なし」になる）。誤判定しても「このまま書き出す」で先へ進める
const MY_IN_APP_BROWSERS=[
  {id:"line",name:"LINE",re:/\bLine\/\d/},
  {id:"instagram",name:"Instagram",re:/\bInstagram\b/},
  {id:"facebook",name:"Facebook",re:/FBAN\/|FBAV\/|FB_IAB|FBIOS/},
  {id:"tiktok",name:"TikTok",re:/musical_ly|BytedanceWebview|TikTok/},
];
function myInAppBrowserOf(ua){
  const u=String(ua||"");
  const hit=MY_IN_APP_BROWSERS.find(b=>b.re.test(u));
  if(hit)return{id:hit.id,name:hit.name};
  if(/Android/.test(u)&&/;\s*wv\)/.test(u))return{id:"webview",name:"アプリ"};
  // iOS の Safari・ホーム画面のアプリ・Chrome（CriOS）等は UA に「Safari/」が入る。入らない iOS の UA はアプリの中のブラウザ（WKWebView の既定の UA）
  if(/iPhone|iPad|iPod/.test(u)&&!/Safari\//.test(u))return{id:"webview",name:"アプリ"};
  return null;
}
function myCalendarEnvOf(o){
  const x=o||{};
  const ua=String(x.ua||"");
  const platform=myIcsPlatformOf(ua,x.maxTouchPoints);
  const inApp=myInAppBrowserOf(ua);
  // iOS の Safari 以外のブラウザ（Chrome＝CriOS・Firefox＝FxiOS・Edge＝EdgiOS・Opera＝OPiOS 等）
  const iosOther=platform==="ios"&&!inApp&&/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo/.test(ua);
  return{platform,inApp,standalone:!!x.standalone,iosOther};
}
// action: "ics"（.ics の書き出し）| "gcal"（Google カレンダーに追加のリンク）。o.needsLogin: メールのアカウントの画面（#/me）
// 戻り値: null（そのまま進める）| {kind, required, title, lead, steps[], openLabel?}
//   required=true は「そのままでは取り込めないことが多い」環境。「次から表示しない」を覚えていても出す
function myCalendarPromptOf(env,action,o){
  const e=env||{};const x=o||{};
  const browser=e.platform==="android"?"Chrome":e.platform==="ios"?"Safari":"ブラウザ";
  const again=action==="gcal"?"開いたページで、日付の詳細の「Google カレンダーに追加」をもう一度押します":"開いたページで、もう一度「この月のシフトをカレンダーに取り込む」を押します";
  const login=x.needsLogin?["メールのアカウントの画面は、開いたブラウザでもう一度ログインします"]:[];
  if(e.inApp){
    const line=e.inApp.id==="line";
    return{kind:"inApp",required:true,
      title:`${e.inApp.name}の中で開いています`,
      lead:action==="gcal"?`アプリの中のブラウザでは Google にログインできないことがあります。${browser}で開いてから追加してください。`
        :`アプリの中のブラウザでは、カレンダーのファイルを受け取れないことがあります。${browser}で開いてから取り込んでください。`,
      steps:[line?`下の「${browser}で開く」を押します`:`画面の「…」などのメニューから、${browser}（ブラウザ）で開く項目を選びます。見つからないときは「URL をコピー」して${browser}に貼り付けます`,again,...login],
      openLabel:line?`${browser}で開く`:null};
  }
  if(action!=="ics")return null;
  if(e.platform==="ios"){
    if(!e.iosOther)return null; // Safari（タブ・ホーム画面のアプリ）はそのまま取り込める
    return{kind:"iosOther",required:false,title:"Safari で開くと、そのまま取り込めます",
      lead:"iPhone の Safari では、押すとカレンダーに追加する画面がそのまま出ます。このブラウザでその画面が出ないときは、Safari でこのページを開いてもう一度押してください。",
      steps:[],openLabel:null};
  }
  if(e.platform==="android")return{kind:"downloadThenOpen",required:false,title:"ダウンロードしたファイルを開いて追加します",lead:"",
    steps:["「書き出す」を押すと、.ics のファイルがダウンロードされます",
      "通知かダウンロードの一覧からファイルを開き、カレンダーのアプリを選びます",
      "Google カレンダーのアプリは .ics を開けません。Google カレンダーだけのときは、日付の詳細の「Google カレンダーに追加」から1件ずつ追加します"],openLabel:null};
  return{kind:"downloadThenOpen",required:false,title:"ダウンロードしたファイルを開いて追加します",lead:"",
    steps:["「書き出す」を押すと、.ics のファイルがダウンロードされます",
      "ファイルを開くと、Outlook や Apple のカレンダーなどに追加できます",
      "Google カレンダーは、パソコンのブラウザで Google カレンダーの「設定 → インポート / エクスポート」からこのファイルを選びます"],openLabel:null};
}
// 「次から表示しない」の記録（端末の localStorage・{"ics:downloadThenOpen":true} の形）
const MY_CAL_PROMPT_LS="shifty_my_calPrompt_v1";
function myCalendarPromptKey(action,prompt){return`${action}:${prompt&&prompt.kind}`;}
function myCalendarPromptShown(prompt,action,remembered){
  if(!prompt)return false;
  if(prompt.required)return true;
  return!(remembered&&remembered[myCalendarPromptKey(action,prompt)]);
}
// ホーム画面から開いた iOS で書き出した後に足す1文（シミュレーターの iOS 27 では不要だったが、古い iOS の報告があるため）
const MY_ICS_STANDALONE_NOTE="ホーム画面から開いていてその画面が出ないときは、Safari でこのページを開いてもう一度押してください。";
// LINE の外部ブラウザで開く URL（今の URL に openExternalBrowser=1 を足す。ハッシュ（#/m/… ・#/me）とほかのクエリはそのまま）
function myExternalBrowserUrl(href){
  let u;
  try{u=new URL(String(href||""));}catch{return"";}
  if(!/^https?:$/.test(u.protocol))return"";
  u.searchParams.set("openExternalBrowser","1");
  return u.toString();
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
  const helperDays=_myObj(x.helperDays)||{};      // myHelperDaysOf の byDate（所属店舗として計算するとき）
  const moved=new Set(Array.isArray(x.movedDates)?x.movedDates:[]); // myMovedHelperDates の1店舗分（ヘルプ先として計算するとき）
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
        submitted:!published&&!!(sh&&sh.status==="work"&&(sh.start||sh.end)),
        // ヘルプ先の勤務（2026-10-04）: 所属店舗の公開済みの日に、他店での勤務を足す（myHelperDaysOf）。moved＝この勤務先がヘルプ先で、
        // その日を所属店舗の給料に寄せた（ここでは数えない）
        helpers:published&&helperDays[date]?helperDays[date]:[],moved:published&&moved.has(date)};
    });
  });
  return out;
}
// [from, to] の日のうち、本人の実績の上書きで計算する日（公開済みで上書きがある日）。info は myShiftyDayInfo の戻り値
function myOverrideDatesIn(info,from,to){
  return Object.keys(_myObj(info)||{}).filter(d=>d>=String(from||"")&&d<=String(to||"")&&info[d]&&info[d].published&&!info[d].moved
    &&(info[d].ov||(info[d].helpers||[]).some(h=>h.ov))).sort();
}
// [from, to] のヘルプ先の勤務の合計（内訳の「うち他店でのヘルプ」）。{min, shops:[店舗名], dates}
function myHelperTimesIn(info,from,to){
  let min=0;const shops=[],dates=[];
  Object.keys(_myObj(info)||{}).sort().forEach(d=>{
    if(d<String(from||"")||d>String(to||""))return;
    const hs=(info[d]&&info[d].published&&!info[d].moved?info[d].helpers:null)||[];
    if(!hs.length)return;
    dates.push(d);
    hs.forEach(h=>{min+=Math.max(0,Number(h.actualDay&&h.actualDay.workMin)||0);if(!shops.includes(h.shopName))shops.push(h.shopName);});
  });
  return{min,shops,dates};
}
// [from, to] のうち、所属店舗へ寄せた日（ヘルプ先の勤務先の内訳）
function myMovedDatesIn(info,from,to){
  return Object.keys(_myObj(info)||{}).filter(d=>d>=String(from||"")&&d<=String(to||"")&&info[d]&&info[d].moved).sort();
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
      else if(it.moved)v=u.premiumDayInput({date:d,hasData:true,kind:"rest"}); // 所属店舗の給料に寄せた日（ヘルプ先の勤務先の側）
      else{
        const sh=it.sub&&it.sub.shifts?it.sub.shifts[d]:null;
        const own=u.resolveActualDay(it.sub,it.ov?{start:it.ov.start,end:it.ov.end,breakMin:it.ov.breakMin}:null,d,st,x.name);
        // ヘルプ先の勤務は月次賃金ページ（ShiftEditTab の premiumDayOf）と同じく helpers に渡す。自店が空欄でも他店で働いた日は出勤日
        const helpers=(it.helpers||[]).map(h=>({day:h.actualDay,actualUnread:false}));
        const k0=u.dayRestKindOf(sh,true);
        const kind=k0==="rest"&&helpers.some(h=>(Number(h.day&&h.day.workMin)||0)>0)?"work":k0;
        v=u.premiumDayInput({date:d,hasData:true,kind,own,helpers});
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
      // 本人が入れた実績（上書き）は給料計算にだけ効く（シフトの表示は公開のまま）。どの日が実績で計算されたかを内訳に出す
      const ovDates=myOverrideDatesIn(wp.shifty.info,plan.from,plan.to);
      if(ovDates.length)notes.push(`あなたが入れた実績の時間で計算した日 ${ovDates.length}日（${ovDates.map(d=>`${Number(d.slice(5,7))}/${Number(d.slice(8))}`).join("・")}）。シフトの表示は公開された時間のままです`);
      // ヘルプ先の勤務（2026-10-04）: 所属店舗の行に入れる（賃金は所属店舗の設定）。ヘルプ先の行からは寄せた日を外す
      const ht=myHelperTimesIn(wp.shifty.info,plan.from,plan.to);
      if(ht.min>0)notes.push(`うち他店でのヘルプ ${u.fmtMin(ht.min)}（${ht.shops.join("・")}・${ht.dates.length}日）。この勤務先の賃金で計算しています`);
      const mv=myMovedDatesIn(wp.shifty.info,plan.from,plan.to);
      if(mv.length)notes.push(`所属店舗${wp.shifty.homeShopName?`（${wp.shifty.homeShopName}）`:""}の給料に入れたヘルプの日 ${mv.length}日（${mv.map(d=>`${Number(d.slice(5,7))}/${Number(d.slice(8))}`).join("・")}）は、この勤務先には含めていません`);
      if(wp.shifty.helperUnread)notes.push("ほかのお店でのヘルプ勤務の一部を読み込めていません。金額はその分を含まない途中の値です");
    }
    if(wage.payType==="daily"&&wp.kind==="shifty")notes.push("日給は割増を含めていません");
    if(wage.source==="none")notes.push(wp.kind==="manual"?"時給（日給）が未設定のため、時間だけ表示しています":"時給（日給）が未設定のため、時間だけ表示しています");
    const amounts=myPayAmounts({kind:wp.kind,wage,times,from:plan.from,to:plan.to,todayStr:x.todayStr,denomMin,
      wageSettings:wp.kind==="shifty"?wp.shifty.wageSettings:null,manualPay:own},u);
    return{id:wp.id,kind:wp.kind,name:wp.name,color:wp.color,plan,wage,amounts,notes,times,
      estimate:!plan.monthEnd||(wp.kind==="shifty"&&wage.payType==="daily"),partial:wp.kind==="shifty"&&!!wp.shifty.helperUnread};
  });
  const add=k=>rows.reduce((s,r)=>s+(r.amounts[k]!=null?r.amounts[k]:0),0);
  return{payYm:x.payYm,rows,total:add("total"),confirmedTotal:add("confirmedTotal"),projectedTotal:add("projectedTotal"),
    workMin:rows.reduce((s,r)=>s+r.amounts.minutes.workMin,0),hasAmount:rows.some(r=>r.amounts.total!=null),partial:rows.some(r=>r.partial)};
}
// 給料タブの要約の出し方（2026-10-04 ユーザー指示「月間目標は任意。設定しなくても確定分とシフト上の見込みは出す」）。
// 確定分・見込み・合計・勤務時間は目標と関係なく出し、**目標を設定したときだけ**進み具合（円グラフ・割合）を出す。
// 時給（日給）が未設定の勤務先は金額を出せないので名前を返す（画面は「設定で時給を入れる」導線を出す）。
// 戻り値 {showRing, progress（0〜1・目標なしは null）, missingWage:[勤務先の名前], allMissing（金額を1つも出せない）}
function myPaySummaryOf(month,goal){
  const g=Number(goal)>0?Number(goal):0;
  const rows=month&&Array.isArray(month.rows)?month.rows:[];
  const missing=rows.filter(r=>r&&r.amounts&&r.amounts.total==null).map(r=>r.name);
  return{showRing:g>0,progress:g>0&&month?myGoalProgress(month.confirmedTotal,g):null,missingWage:missing,allMissing:rows.length>0&&missing.length===rows.length};
}
// 年（暦年）の支給月ごとの一覧と合計。received は users/{uid}/actuals（{支給月: {勤務先: 円}}）
function myPayYearMonths(year){return Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,"0")}`);}
function myReceivedSum(received,payYm){return Object.values((_myObj(received)||{})[payYm]||{}).reduce((s,v)=>s+(Number(v)>0?Math.round(Number(v)):0),0);}
// これまでの給料（振込額）の一括入力（2026-10-04 ユーザー指示「引き継ぎ用に年単位で今までの給料を一括で入力」）。置き場は振込額と同じ
// actuals/{支給月}/{勤務先}（新しいノードは無い）。form={勤務先ID: {支給月: 入力の文字列}}、received＝今の actuals。
// 書くのは**変えたセルだけ**（"actuals/{ym}/{wid}": 円 か null）。空欄のセルは、もともと空なら何もしない・金額が入っていた月を消したときだけ null
// （画面は保存の前に消す件数を確認する）。読めない入力があれば書かずに {error, ym, wid} を返す
function planMyReceivedBulk(received,form){
  const rc=_myObj(received)||{};
  const patch={};let writes=0,removes=0;
  for(const[wid,months]of Object.entries(_myObj(form)||{})){
    for(const[ym,raw]of Object.entries(_myObj(months)||{})){
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym))continue;
      const cur=Number((((rc[ym])||{})[wid]));
      const has=Number.isFinite(cur)&&cur>=0&&(((rc[ym])||{})[wid])!=null;
      const r=parseMyReceivedInput(raw);
      if(r.error)return{error:r.error,ym,wid};
      if(r.remove){if(has){patch[`actuals/${ym}/${wid}`]=null;removes++;}continue;}
      if(has&&cur===r.value)continue;
      patch[`actuals/${ym}/${wid}`]=r.value;writes++;
    }
  }
  return{patch,writes,removes};
}
// 一括入力の初期値（その年の支給月×勤務先の、今入っている振込額）
function myReceivedBulkForm(received,year,wids){
  const rc=_myObj(received)||{};const out={};
  (wids||[]).forEach(w=>{out[w]={};myPayYearMonths(year).forEach(ym=>{const v=((rc[ym])||{})[w];out[w][ym]=v!=null&&Number(v)>=0?String(Math.round(Number(v))):"";});});
  return out;
}
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
  revoked:"このURLは使えなくなりました。お店の管理者から新しいURLを受け取ってください",
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
// 管理者がスタッフ専用のURLを直接発行する（2026-10-04 ユーザー指示「個人リンクコードは新規登録に繋がる URL の方が助かる」）。
// 申請を経ずに、その名前に結び付いた**承認済み**の記録をオーナーが作る（承認と同じ権限・Cloud Functions を使わない）。
// 記録の形は申請を承認したものと同じ（ルールの必須の子 displayName・requestedAt・name・approvedAt。displayName と requestedAt は
// 名前と発行の時刻で埋める＝本人の申請ではない）。同じ名前に承認済みの個別URLがあれば取り消す（1つの名前に1つ＝再発行は古いURLを止める）。
// 書く順は呼び出し側: 先に staffPageTokens/{token}（tokenRec・作成だけ許される）、次に staffPages への update（patch）
function planIssueStaffPage(o){
  const x=_myObj(o)||{};
  const pages=_myObj(x.pages)||{};
  if(!isMyPageToken(x.token))return _myPageErr("URLを作れませんでした。もう一度お試しください");
  if(pages[x.token])return _myPageErr("URLを作れませんでした。もう一度お試しください");
  if(typeof x.name!=="string"||!myStaffNamesOf(x.staff).includes(x.name))return _myPageErr("スタッフ一覧にない名前には発行できません");
  if(typeof x.shopId!=="string"||!x.shopId)return _myPageErr("お店を読み込めませんでした");
  const at=String(x.nowIso||"");
  const rec={status:"approved",displayName:x.name.slice(0,MY_DISPLAY_NAME_MAX),requestedAt:at,name:x.name,approvedAt:at};
  if(typeof x.byUid==="string"&&x.byUid)rec.byUid=x.byUid;
  const patch={[x.token]:rec};
  const revoked=[];
  Object.entries(pages).forEach(([t,r])=>{
    if(_myObj(r)&&r.status==="approved"&&r.name===x.name){patch[`${t}/status`]="revoked";patch[`${t}/revokedAt`]=at;revoked.push(t);}
  });
  return{tokenRec:{shopId:x.shopId,at},patch,revoked};
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

// ---- マイシフトを開いている間のアドレスバー（2026-10-04 ユーザー指示「マイシフトを開き、そのURLを開いたらシフト提出画面がでた」）----
// 募集URL（#/s/<token>）の画面で「マイシフト」を押したら、アドレスバーを「開き直すと同じ画面になる URL」にする。
//  ①この端末が知っている個別URL（個別URLで開いた・申請した・管理者が発行した URL を開いた）のうち、いま使える（承認済みで
//    名前がいまのスタッフ一覧にある＝resolveMyPage の ok）もの → #/m/<pageToken>（個別URLの画面を重ねる）
//  ②メールのアカウントでログイン中 → #/me
//  ③どちらでもない（未登録・承認待ち・取り消された）→ URL を変えない（登録・ログインの画面）
// known＝個別URLで開いたもの・made＝この端末で申請したもの。どちらも {shopId: {token}}。known を先に見る
// （申請をやり直すと made は新しい承認待ちの token に替わるが、管理者が発行した承認済みの URL は known に残る）
function myPageOpenCandidates(known,made,shopId){
  const out=[];
  [known,made].forEach(m=>{const r=_myObj(m)&&_myObj(m[shopId]);const t=r&&r.token;if(isMyPageToken(t)&&!out.includes(t))out.push(t);});
  return out;
}
// 候補のうち最初に使えるもの {token, name}。recs＝{token: shops/{shopId}/staffPages/{token} の値}
function myPickOpenablePage(cands,recs,staff,shopId){
  for(const t of(Array.isArray(cands)?cands:[])){
    const r=resolveMyPage(t,{shopId},(_myObj(recs)||{})[t],staff);
    if(r.state==="ok")return{token:t,name:r.name};
  }
  return null;
}
// 重ねた画面に合わせるハッシュ。null＝URL を変えない
function myOverlayHashOf(o){
  const x=_myObj(o)||{};
  if(isMyPageToken(x.pageToken))return"#/m/"+x.pageToken;
  if(x.account)return"#/me";
  return null;
}
// メールのアカウントの「この画面のURL」（設定タブの一番下）。#/me はログインすればどの端末でも同じ画面になる
function buildMyAccountUrl(base){return`${String(base||"")}?openExternalBrowser=1#/me`;}

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

// ---- 全員のシフト表（P3 → 2026-10-04 に PDF の「シフト表」と同じ仕様へ・ユーザー指示）----
// 個別URL・メールのアカウントの「全員のシフト」。**表は PDF と同じ関数（app-utils.js の shiftTableHtmlOf・shiftSheetCellOf・
// shiftSheetStoredText・shiftSheetHeadcountOf・heatStaffDayEntriesOf）で作る**＝見た目も中身も PDF のシフト表と同じ
// （日付と曜日の行・上が出勤／下が退勤・時刻は 17.5 の表記・メモ（h/k/x・略称・研修 等）と締・休み／休暇の斜線・
// 変更マークの緑・メモの黄色・従業員番号の行・名前の色・土日祝の色・未登録の提出者の列・空白列（35人超は日付）・昼夜の人数）。
// **公開済みの期間だけ**（未公開は state:"unpublished"。画面は選択肢を公開済みに絞るので、この状態を画面に出すことは無い）。
// 並びと設定はシフト作成タブと同じ（写し＝resolvePeriodMaster・非表示の人は visibleStaffList で落とす）。
// 他店でのヘルプ勤務（H2）も PDF と同じに出す（2026-10-04 ユーザー指示「ヘルプ勤務も pdf と同様に」）。規則はシフト作成タブの helperDisp と同じ
// （所属店舗＝role "home" の人だけ・休暇の日は出さない・自店と重なる他店の勤務は足さない・helperCellDisplay の文字と黄色）。
// 材料（helpers）は呼び出し側が読む（app-my.js の useMyHelperShops。企業の写しと、連携店舗の otherShopDataOf の形）。無ければヘルプなしの表。
// PDF と違うのは次の2つだけ: ①入力中の編集は無い（保存値だけ）、②本人の列の名前の見出しに印（markName）と、回帰が引く data 属性（tags）。
// 労務・ヒートマップ・賃金は PDF の「シフト表」にも無い。
// o={period, staff, settings（企業設定を重ねた店舗の設定）, subs（その期間の提出）, todayStr, premium, me（本人の名前）, shopName, abbrToShop（他店の略称・人数の除外）,
//    shopId, helpers:{companyLink（shops/{sid}/company）, otherShops:{sid: otherShopDataOf の戻り値}}（省略可）}
// 戻り値の helperUnread は「ヘルプ先の勤務の合算に要る他店を読めていない人がいる」（helperPersonOf の unread）
function buildMyShiftSheet(o,U){
  const u=_myU(U);const x=o||{};const p=x.period;
  if(!p||!p.id)return{state:"noPeriod"};
  if(!x.premium)return{state:"premium",period:p};
  if(!u.isPeriodPublished(p))return{state:"unpublished",period:p};
  const master=u.resolvePeriodMaster(p,x.staff||[],x.settings||{},x.todayStr);
  const st=master.settings||{};
  const roster=master.staffList||[];
  const staffList=u.visibleStaffList(roster,st,p);
  const aliases=st.staffAliases||{};
  const subs=(Array.isArray(x.subs)?x.subs:[]).filter(s=>s&&s.periodId===p.id&&s.staffName);
  const byName=new Map();
  subs.forEach(s=>{if(!byName.has(s.staffName))byName.set(s.staffName,s);}); // 重複時は最初の1件（シフト作成タブの subsByKey と同じ）
  const subOf=n=>u.resolveSubByAlias(k=>byName.get(k),n,aliases);
  // 列は PDF の buildPdfCols("all") と同じ: 名簿（非表示を落とした）＋この期間に提出した未登録の名前（50音順）
  const unreg=subs.map(s=>s.staffName).filter(n=>u.isUnregisteredSubName(n,roster,aliases,p)).sort((a,b)=>a.localeCompare(b,"ja"));
  const cols=[...staffList,...unreg];
  const dates=u.gd(p.startDate,p.endDate);
  const fixedEnabled=u.isFixedShiftEligibleShop(x.shopName);
  const shiftOf=(n,ds)=>{const sb=subOf(n);return sb&&sb.shifts?sb.shifts[ds]||null:null;};
  // 昼夜の人数（PDF だけの表示＝この表にも出す）。区間はヒートマップと同じ（シフト作成タブの heatData と同じ関数）
  const realStaff=staffList.filter(n=>!u.isSpacer(n));
  const spIdx=staffList.findIndex(n=>u.isSpacer(n));
  const hall=new Set(spIdx>-1?staffList.slice(spIdx+1).filter(n=>!u.isSpacer(n)):[]);
  const hasSplit=hall.size>0;
  const cfg=u.headcountAtOf(st);
  const bounds=u.oneSidedFillBounds(st);
  const entryCache=new Map();
  const entriesOf=ds=>{
    if(entryCache.has(ds))return entryCache.get(ds);
    const out=[];
    realStaff.forEach(n=>{
      const sh=shiftOf(n,ds);if(!sh)return;
      const rest=f=>!!(sh.adminRest&&sh.adminRest[f]);
      const t=f=>rest(f)?"":((f==="start"?(sh.adjustedStart??sh.start):(sh.adjustedEnd??sh.end))||"");
      const nt=f=>rest(f)?"":((f==="start"?(sh.adjustedStartNote??sh.startNote):(sh.adjustedEndNote??sh.endNote))||"");
      const fx=f=>fixedEnabled&&!rest(f)&&!!sh[f==="start"?"adjustedStartFixed":"adjustedEndFixed"];
      u.heatStaffDayEntriesOf({name:n,date:ds,settings:st,start:t("start"),end:t("end"),startNote:nt("start"),endNote:nt("end"),fixed:fx("start")||fx("end"),base:sh,
        lunchEnd:bounds.lunchEnd,dinnerStart:bounds.dinnerStart,abbrToShop:x.abbrToShop||{},isHall:hall.has(n),splitEnabled:hasSplit}).forEach(e=>out.push(e));
    });
    entryCache.set(ds,out);
    return out;
  };
  // 他店でのヘルプ勤務（H2）。シフト作成タブの helperShops・helperInfo・helperDisp と同じ組み立て
  const hx=x.helpers&&x.helpers.companyLink&&typeof x.helpers.companyLink==="object"?x.helpers:null;
  const helperShops=hx?u.helperShopsOf(hx.companyLink,hx.otherShops||{},x.shopId):{};
  const helperInfo={};
  if(Object.keys(helperShops).length){
    const people=hx.companyLink.people||null;
    const eid=typeof hx.companyLink.entityId==="string"?hx.companyLink.entityId:null;
    realStaff.forEach(n=>{
      const h=u.helperPersonOf({shopId:x.shopId,name:n,settings:st,people,otherShops:helperShops,entityId:eid});
      if(h.role||h.unread)helperInfo[n]=h;
    });
  }
  const helperSettingsCache=new Map();
  // 自店のセルの表示値（シフト作成タブの ownVal と同じ。休暇の日は helperDisp が先に null を返すので種別名の分岐は要らない）
  const ownValOf=(sh,f)=>{
    if(!sh)return"";
    const rest=!!(sh.adminRest&&sh.adminRest[f]);
    const time=rest?"":((f==="start"?(sh.adjustedStart??sh.start):(sh.adjustedEnd??sh.end))||"");
    const t=time?u.shiftSheetDecimal(time):"";
    const nt=rest?"":((f==="start"?(sh.adjustedStartNote??sh.startNote):(sh.adjustedEndNote??sh.endNote))||"");
    const fx=fixedEnabled&&sh[f==="start"?"adjustedStartFixed":"adjustedEndFixed"]?u.shiftSheetFixedKey():"";
    if(t)return t+nt+fx;
    return(nt+fx)||"";
  };
  const helperDispOf=(nm,ds)=>{
    const hi=helperInfo[nm];
    if(!hi||hi.role!=="home")return null;
    const sh=shiftOf(nm,ds);
    if(u.leaveShownTextOf(sh,"start")||u.leaveShownTextOf(sh,"end"))return null;
    const wsh=sh&&sh.status==="work"?sh:null;
    const ownRange=wsh?u.effShiftRangeMin(wsh,st):null;
    const es=u.helperWorkOn({regs:hi.regs,otherShops:helperShops,date:ds,todayStr:x.todayStr,
      companySettings:hx.companyLink.settings||null,ownRange,cache:helperSettingsCache});
    if(!es.length)return null;
    return u.helperCellDisplay({entries:es,ownRange,ownText:{start:ownValOf(sh,"start"),end:ownValOf(sh,"end")}});
  };
  const html=u.shiftTableHtmlOf({cols,dates,periodLabel:String(p.label||"").replace(/^\d+年/,""),shopName:x.shopName||"",
    staffNums:st.staffNumbers||{},staffColors:st.staffColors||{},settings:st,markName:x.me||"",tags:true,
    headcountOf:cfg.enabled?(ds,section)=>u.shiftSheetHeadcountOf({settings:st,date:ds,entries:entriesOf(ds),shiftOf:n=>shiftOf(n,ds),hasSplit,section}):null,
    cellOf:(nm,ds,field)=>{
      const sh=shiftOf(nm,ds);
      return u.shiftSheetCellOf({sh,field,hasSub:!!sh,helper:helperDispOf(nm,ds),r:u.shiftSheetStoredText(sh,field,fixedEnabled),
        otherDisp:u.shiftSheetStoredText(sh,field==="start"?"end":"start",fixedEnabled).disp});
    }});
  return{state:"ok",period:p,confirmed:u.isPeriodConfirmed(p),publishedAt:p.published.at,html,
    names:cols.filter(n=>!u.isSpacer(n)),headcount:!!cfg.enabled,
    helperUnread:Object.values(helperInfo).some(h=>h&&h.unread)};
}
// 全員の表を横幅に合わせる倍率（比率を保って表全体を縮める・広い画面では2倍まで）。natural＝表の本来の幅（px）
const MY_SHEET_MAX_SCALE=2;
function myShiftSheetScale(width,natural){
  const w=Number(width)||0,n=Number(natural)||0;
  if(!(w>0)||!(n>0))return 1;
  return Math.min(MY_SHEET_MAX_SCALE,w/n);
}
// ---- 全員のシフト表の期間と店舗の選び方（2026-10-04・ユーザー指示）----
// 未公開の期間は選択肢にも出さず、「まだ公開されていません」の案内も出さない。選択肢は**公開済み**かつ startDate が
// **直近3ヶ月**（管理者画面の subs 部分購読と同じ窓＝subsWindowCutoff。startDate >= 窓の下限）の期間で、startDate の新しい順
// （同じ日なら id の降順）。既定はその先頭＝その時点で公開済みの最新の期間。Premium でない店舗は空（公開済みの表示は Premium のときだけ）。
// o={premium, todayStr:"YYYY-MM-DD"（省略は今日）}
function _myDateOf(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||""));return m?new Date(+m[1],+m[2]-1,+m[3]):new Date();}
function myAllShiftPeriodOptions(periods,o,U){
  const u=_myU(U);const x=o||{};
  if(!x.premium)return[];
  const cutoff=u.subsWindowCutoff(_myDateOf(x.todayStr));
  return(Array.isArray(periods)?periods:[])
    .filter(p=>p&&p.id&&/^\d{4}-\d{2}-\d{2}$/.test(String(p.startDate))&&String(p.startDate)>=cutoff&&u.isPeriodPublished(p))
    .sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate))||String(b.id).localeCompare(String(a.id)));
}
// 店舗の選択肢（メールのアカウント・個別URL）。shops=[{shopId, shopName, name（本人の名前）, periods, plan}]（並びは呼び出し側の並び＝
// アカウントは readMyLinks の並び＝勤務先の既定の色の順）。選択肢のある店舗だけを残す（有効な紐付けでも、公開済みの期間が
// 直近3ヶ月に無い店舗・Premium でない店舗は出さない）。
// 既定の店舗: preferredShopId（募集URLから開いたときのその店舗）に選択肢があればそれ、なければ最新の選択肢の startDate が最も新しい店舗
// （同じなら並びの先）。戻り値 {shops:[{shopId,shopName,name,options}], defaultShopId}（選択肢が無ければ shops は空・defaultShopId は null）
function myAllShiftChoices(o,U){
  const x=o||{};
  const featureEnabled_=_myU(U).featureEnabled;
  // 渡された店舗のフィールド（settings・staff・plan 等＝表を作る材料）はそのまま持ち回る
  const shops=(Array.isArray(x.shops)?x.shops:[]).filter(s=>s&&s.shopId).map(s=>({...s,shopName:s.shopName||"",name:s.name||"",
    options:myAllShiftPeriodOptions(s.periods,{premium:featureEnabled_("myShift",{plan:s.plan}),todayStr:x.todayStr},U)})).filter(s=>s.options.length>0);
  let def=null;
  if(x.preferredShopId&&shops.some(s=>s.shopId===x.preferredShopId))def=x.preferredShopId;
  else shops.forEach(s=>{const d=String(s.options[0].startDate);if(!def||d>String(shops.find(t=>t.shopId===def).options[0].startDate))def=s.shopId;});
  return{shops,defaultShopId:def};
}
// いま表示する店舗と期間。sel={shopId, periodId}（本人が選んだもの）が選択肢に無くなっていれば既定へ戻す（公開の取り下げ・3ヶ月の窓から外れた等）
function myAllShiftSelection(choices,sel){
  const c=choices||{shops:[]};const s=sel||{};
  const shop=c.shops.find(x=>x.shopId===s.shopId)||c.shops.find(x=>x.shopId===c.defaultShopId)||c.shops[0]||null;
  if(!shop)return null;
  const period=shop.options.find(p=>p.id===s.periodId)||shop.options[0];
  return{shop,period};
}
// ===== Nodeテスト用エクスポート（ブラウザでは module 未定義のため無視される）=====
if(typeof module!=="undefined"&&module.exports){
  module.exports={EMAIL_LINK_PENDING_LS,EMAIL_LINK_KINDS,EMAIL_LINK_PENDING_MAX_MS,EMAIL_LINK_RESEND_WAIT_MS,EMAIL_LINK_FALLBACK_CODES,isEmailLinkFallbackError,emailLinkSafeHash,emailLinkContinueUrl,parseEmailLinkLanding,emailLinkCleanUrl,emailLinkPendingRecord,emailLinkPendingFor,ADMIN_PASSWORD_MIN,validateEmailLinkPassword,emailLinkErrorMessage,MY_TABS,isMyRouteHash,MY_DISPLAY_NAME_MAX,MY_NUMBER_MAX,MY_PASSWORD_MIN,toHalfWidthDigits,normalizeMyDisplayName,normalizeMyNumber,validateMyProfile,buildMyProfileRecord,myProfileOf,validateMyEmail,validateMyPassword,MY_CREDENTIAL_ERROR_CODES,isPermissionDeniedError,myAuthErrorMessage,isMyCredentialError,MY_BLOCK_MESSAGES,staffAccountBlockReason,myOwnerCheckShopIds,isStaffAccountMarked,mayBeStaffAccountUser,
    MY_LINK_METHOD_LABELS,linkNumberKey,linkNameKey,myStaffNamesOf,personIdForShopName,linkCandidatesFor,splitLinkRequests,staffLinksByName,renameStaffInStaffLinks,dropStaffFromStaffLinks,MY_STAFF_LINK_OPS_MAX,staffLinkOpOf,staffLinksAsOf,planStaffLinkOp,enqueueStaffLinkOp,MY_STAFF_LINK_PENDING_MSG,resolveMyLink,MY_LINK_INVALID_LABELS,buildLinkRequestRecord,
    MY_WORKPLACE_COLORS,myWorkplaceColor,myShiftPremiumOf,fmtMyClock,fmtMyRange,myPeriodOverlaps,buildMyShiftDays,myDayFingerprint,myShiftSeenKey,myPublishedFingerprints,myChangedDates,buildMySeenRecord,nextMyShift,myMonthGrid,myShiftMonth,myShiftPeriodsToRead,myEntryOrder,
    myHelperDaysOf,myHelperShiftEntries,myMergeHelperEntries,myMovedHelperDates,myHelperTimesIn,myMovedDatesIn,
    MY_WORKPLACE_NAME_MAX,MY_SHIFT_MEMO_MAX,MY_CLOCK_MAX_MIN,MY_MANUAL_WP_ID_RE,MY_SHIFT_ID_RE,genMyRecordId,isMyDateStr,myClockStr,parseMyClockInput,MY_TIME_STEP_MIN,MY_TIME_OPTIONS,MY_BREAK_MAX_OPTION_MIN,MY_BREAK_OPTIONS,myTimeSelectOptions,myBreakSelectOptions,parseMyMinutesInput,
    MY_OVERNIGHT_HINT,validateMyShiftInput,buildMyShiftRecord,myShiftDuplicateOf,myOverrideOf,planMyOverride,myStaffNumberOf,MY_PROFILE_NUMBER_HINT,myWorkplaceList,myNextWorkplaceColor,validateMyWorkplaceInput,buildMyWorkplacePatch,
    buildMyManualDays,myShiftHistoryCandidates,myPayWorkDays,icsFoldLine,MY_ICS_DOMAIN,buildMyIcs,myIcsEntriesForMonth,myIcsPlatformOf,MY_ICS_HINTS,MY_ICS_APP_GUIDE,myGoogleCalendarLinks,
    MY_IN_APP_BROWSERS,myInAppBrowserOf,myCalendarEnvOf,myCalendarPromptOf,MY_CAL_PROMPT_LS,myCalendarPromptKey,myCalendarPromptShown,MY_ICS_STANDALONE_NOTE,myExternalBrowserUrl,
    MY_PAY_END_DAY,MY_PAY_HOLIDAY_RULES,MY_PAY_HOLIDAY_RULE_LABELS,MY_PAY_WAGE_TYPES,MY_PAY_WAGE_TYPE_LABELS,MY_PAY_OFFSET_LABELS,MY_PAY_YEN_MAX,MY_PAY_GOAL_MAX,MY_PAY_DEFAULT,
    MY_MANUAL_NIGHT_PCT,MY_MANUAL_OVER8_PCT,MY_MANUAL_OVER8_MIN,myPayDayLabel,myPayOf,validateMyPayInput,buildMyPayRecord,myPayFormOf,parseMyGoalInput,myGoalOf,parseMyReceivedInput,
    myClampDay,myClosingMonthOf,myClosingRangeOf,myPayDateOf,myPayPlanOf,myPayMonthOfDate,myPeriodsInRange,myPayReadRange,myShiftyDayInfo,myOverrideDatesIn,myMonthSettingsOf,
    myShiftyPayTimes,myManualPayTimes,myWageSourceOf,MY_PAY_ITEM_KEYS,myPayAmounts,myPayMonthFor,myPaySummaryOf,planMyReceivedBulk,myReceivedBulkForm,myPayYearMonths,myReceivedSum,myPayYearSummary,myDefaultPayMonth,
    fmtMyYen,myGoalProgress,myCompanyPayOf,
    MY_PAGE_TOKEN_LEN,MY_PAGE_TOKEN_RE,isMyPageToken,genMyPageToken,myPageRouteOf,buildMyPageUrl,MY_PAGE_TABS,MY_PAGE_STATUSES,buildMyPageRequest,planIssueStaffPage,resolveMyPage,MY_PAGE_STATE_MESSAGES,
    approvedStaffPagesByName,splitStaffPageRequests,planApproveStaffPage,planRejectStaffPage,planRevokeStaffPage,planResetStaffPagePin,planStaffPageOp,myPageOpenCandidates,myPickOpenablePage,myOverlayHashOf,buildMyAccountUrl,myLatestPeriodOf,normalizeMyPagePin,isValidMyPagePin,validateMyPagePinInput,buildMyShiftSheet,MY_SHEET_MAX_SCALE,myShiftSheetScale,myAllShiftPeriodOptions,myAllShiftChoices,myAllShiftSelection};
}
