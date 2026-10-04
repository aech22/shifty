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

// ===== Nodeテスト用エクスポート（ブラウザでは module 未定義のため無視される）=====
if(typeof module!=="undefined"&&module.exports){
  module.exports={MY_TABS,isMyRouteHash,MY_DISPLAY_NAME_MAX,MY_NUMBER_MAX,MY_PASSWORD_MIN,toHalfWidthDigits,normalizeMyDisplayName,normalizeMyNumber,validateMyProfile,buildMyProfileRecord,myProfileOf,validateMyEmail,validateMyPassword,MY_CREDENTIAL_ERROR_CODES,isPermissionDeniedError,myAuthErrorMessage,isMyCredentialError,MY_BLOCK_MESSAGES,staffAccountBlockReason,myOwnerCheckShopIds,isStaffAccountMarked,mayBeStaffAccountUser};
}
