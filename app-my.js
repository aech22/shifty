// ============================================================
// Shifty - 従業員画面（マイシフト・給料・設定）（2026-10-04 新設・第2部 E0）
// ============================================================
// 計画: Shifty_実装計画_2026-10.md 第2部（E.0〜E.7）。純粋関数は app-my-utils.js に置く。
// 読み込み順は utils → my-utils → core → staff → admin → shift → company → my → main（index.html）。
// App（app-main.js）がここのコンポーネントを描く。描画は ReactDOM のマウント時＝全ファイルの実行後なので、
// ここから staff/admin/shift/company の識別子を関数の中で参照してよい。トップレベルの即時実行コードからは参照しない。
//
// 構成（E1 時点）:
//   スタッフアカウントの印と認証操作（myRegister / myLogin / myLogout / myChangePassword / mySendReset / mySaveProfile）
//   MyView … 入口。未ログインなら MyAuthScreen、ログイン済みなら下部タブ（マイシフト・給料・設定）
//   MyShiftTab … 月のカレンダー・次のシフト・変更あり（E3）／MyPayTab … E1 では中身が無いことを伝える空の状態だけ（E5 が埋める）
//   MySettingsTab … 勤務先のお店（E2: 紐付けの一覧・申請）とアカウント（登録ネーム・従業員番号・メール・パスワード・ログアウト）
//   StaffLinkRequestsCard / StaffLinkEditSection … 管理者側（スタッフタブ）の申請の提案・未リンクの申請・リンクの解除（E2）
//   readMyLinks(uid) … 本人の紐付けの一覧（E3 以降が「どの店舗のどの名前か」を得る入口）
//
// 状態の持ち方: スタッフアカウントかどうかは App が staffUser（{uid,email}|null）として持つ（Phase1 が決める）。
// スタッフアカウントは管理者の実ログインとして扱わない＝App の authUser は null のまま（accounts/{uid}/shops を読まない・書かない）。
// プロフィール（users/{uid}/profile）は MyView が読み、設定タブが書く。

// ===== スタッフアカウントの印（localStorage）=====
// 登録・ログインが成功した端末に {uid} を置き、ログアウトで消す。Phase1（app-main.js）はこの印で
// 「実ユーザーだがスタッフアカウント」を見分け、管理者の経路（accounts/{uid}/shops・明示ログアウトの自動サインアウト）に入れない。
// 印が無い実ユーザーは users/{uid}/profile の有無で確かめ直す（mayBeStaffAccountUser の対象だけ）。
const STAFF_ACCOUNT_LS="ots_staffAccount_v1";
// スタッフURLの画面から開いたマイシフトを、ログイン後の再読み込みで開き直すための印
const SS_MY_OPEN="ss_myOpen";
// 募集URL（#/s/<token>）の画面からマイシフトを重ねて開き、アドレスバーを #/m/・#/me に切り替えたときの元のハッシュ（2026-10-04）
const SS_MY_BASE_HASH="ss_myBaseHash";
// 再読み込みをまたいで1回だけ出す知らせ（ログインを取り消したときの理由など）
const SS_MY_NOTICE="ss_myNotice";
// ログイン試行の制限は管理者のメールログイン（名前空間 "email"）と分ける。管理者のロックに影響させないため
const MY_LOGIN_LOCK_NS="staff";
// スタッフアカウントの端末でログイン画面から店舗の参加・作成をしようとしたときの文言（app-main.js が出す）。
// 店舗のオーナーになるとスタッフアカウントに管理権限が付くので止める（claimOwnership もスタッフアカウントを登録しない）
const MY_ADMIN_BLOCKED_MSG="マイシフトのアカウントでログイン中の端末では、店舗の管理はできません。マイシフトの設定からログアウトしてください";

function getStaffAccountMark(){const v=lg(STAFF_ACCOUNT_LS,null);return v&&typeof v.uid==="string"&&v.uid?v:null;}
function setStaffAccountMark(uid){ls(STAFF_ACCOUNT_LS,{uid});}
function clearStaffAccountMark(){try{localStorage.removeItem(STAFF_ACCOUNT_LS);}catch{/* 書けない端末は何もしない */}}
function isStaffAccountUser(user){return !!(user&&!user.isAnonymous&&isStaffAccountMarked(getStaffAccountMark(),user.uid));}
function staffUserOf(user){return user?{uid:user.uid,email:user.email||""}:null;}

// users/{uid}/profile を読む。読めない（ルール未反映・通信エラー・時間切れ）は null に倒す＝管理者の経路のまま
function readStaffProfile(uid,timeoutMs=3000){
  if(!firebaseDB||!uid) return Promise.resolve(null);
  const read=firebaseDB.ref(`users/${uid}/profile`).once("value").then(s=>s.val()||null).catch(()=>null);
  const timer=new Promise(r=>setTimeout(()=>r(null),timeoutMs));
  return Promise.race([read,timer]);
}

// スタッフアカウントを作る・入れてよい端末か。理由は staffAccountBlockReason（app-my-utils.js）
async function myBlockReason(shopId){
  const u=firebaseAuth&&firebaseAuth.currentUser;
  const base={demo:DEMO_MODE,hasUser:!!u};
  if(!u||DEMO_MODE) return staffAccountBlockReason(base);
  if(!u.isAnonymous) return staffAccountBlockReason({...base,isAnonymous:false,isStaff:isStaffAccountUser(u),isCompanySession:isCompanySessionUid(u.uid)});
  const adminKeys=lg(ADMIN_KEYS_LS,{})||{};
  const ids=myOwnerCheckShopIds({currentShopId:shopId,cookieShopId:getCookie(CK_SHOP),adminKeys,cachedShops:lg("shift_shops_v6",[])});
  const ownerShopIds=[];let ownerCheckFailed=false;
  // owners の読みはオーナーにしか許されない（database.rules.json）。拒否＝オーナーでない、それ以外の失敗＝確かめられない
  await Promise.all(ids.map(id=>firebaseDB.ref(`shops/${id}/owners/${u.uid}`).once("value")
    .then(s=>{if(s.exists())ownerShopIds.push(id);})
    .catch(e=>{if(!isPermissionDeniedError(e))ownerCheckFailed=true;})));
  return staffAccountBlockReason({...base,isAnonymous:true,adminKeyCount:Object.keys(adminKeys).length,ownerShopIds,ownerCheckFailed});
}

// プロフィールを書く。連結の直後はトークンを取り直してから書く（ルールはメールのある認証だけに書き込みを許すため。
// 取り直す前のトークンは匿名のもの）。拒否されたら1回だけ待って書き直す
async function mySaveProfile(uid,input,opts){
  const err=validateMyProfile(input);
  if(err) return{error:err};
  const rec=buildMyProfileRecord(input,new Date().toISOString());
  const refresh=async()=>{try{if(firebaseAuth&&firebaseAuth.currentUser)await firebaseAuth.currentUser.getIdToken(true);}catch{/* 取り直せなくても書いてみる */}};
  if(opts&&opts.fresh) await refresh();
  try{
    await fbSet(`users/${uid}/profile`,rec);
    return{profile:rec};
  }catch(e){
    if(!(opts&&opts.fresh)||!isPermissionDeniedError(e)) return{error:myAuthErrorMessage(e,"profile")};
  }
  await new Promise(r=>setTimeout(r,1500));
  await refresh();
  try{await fbSet(`users/${uid}/profile`,rec);return{profile:rec};}
  catch(e){return{error:myAuthErrorMessage(e,"profile")};}
}

// 登録したらそのままお店にリンクを申請する（2026-10-05 ユーザー指示「登録を押したら連携の提案まで。次のページで申請ボタンを押すのは無駄」）。
// 申請の中身は設定タブの「申請する」と同じ（buildLinkRequestRecord）。既にその店舗とリンク済みなら申請しない。
// 申請できたら、開き直した先のマイシフトに「申請しました」を出すため sessionStorage に店舗を覚える（SS_MY_LINK_REQ）
const SS_MY_LINK_REQ="ss_myLinkReq";
async function myResolveShopIdOfHash(h){
  const p=myLinkShopRefOfHash(h);
  if(!p||!firebaseDB)return null;
  const r=await _myRead(p);
  return r.ok&&r.v&&typeof r.v.shopId==="string"&&r.v.shopId?r.v.shopId:null;
}
async function myAutoLinkRequest(uid,shopId,input){
  if(!uid||!shopId||!firebaseDB||DEMO_MODE||!normalizeMyDisplayName(input&&input.displayName))return{skipped:true};
  const linked=await _myRead(`shops/${shopId}/staffLinks/${uid}`);
  if(linked.ok&&linked.v)return{already:true};
  try{
    await fbSet(`shops/${shopId}/linkRequests/${uid}`,buildLinkRequestRecord(input,new Date().toISOString()));
  }catch(e){console.warn("リンクの申請に失敗:",e&&e.code);return{error:true};}
  const nm=await _myRead(`global/shops/${shopId}/name`);
  ssSave(SS_MY_LINK_REQ,JSON.stringify({shopId,name:typeof nm.v==="string"?nm.v:""}));
  return{ok:true};
}
// 登録＝いまの匿名 uid にメール＋パスワードを連結する（uid は変わらない）
async function myRegister(f,shopId){
  const vErr=validateMyProfile(f)||validateMyEmail(f.email)||validateMyPassword(f.password,f.password2);
  if(vErr) return{error:vErr};
  if(!firebaseAuth) return{error:MY_BLOCK_MESSAGES.signin};
  const block=await myBlockReason(shopId);
  if(block) return{error:block.message};
  const u=firebaseAuth.currentUser;
  try{
    await u.linkWithCredential(firebase.auth.EmailAuthProvider.credential(String(f.email).trim(),f.password));
  }catch(e){
    console.warn("スタッフアカウントの連結に失敗:",e&&e.code);
    // メールアドレスの列挙保護が有効なプロジェクト（本番・dev とも）では、匿名 uid へのメール＋パスワードの連結が
    // auth/operation-not-allowed（"Please verify the new email before changing email"）で拒否される（2026-10-04 に本番で発生）。
    // そのときは新しいアカウントとして作る。uid が替わるので、別端末のログインと同じく再読み込みして Phase1 からやり直す
    if(String((e&&e.code)||"")!=="auth/operation-not-allowed") return{error:myAuthErrorMessage(e,"register")};
    let nu;
    try{
      nu=(await firebaseAuth.createUserWithEmailAndPassword(String(f.email).trim(),f.password)).user;
    }catch(e2){
      console.warn("スタッフアカウントの作成に失敗:",e2&&e2.code);
      return{error:myAuthErrorMessage(e2,"register")};
    }
    setStaffAccountMark(nu.uid);
    await mySaveProfile(nu.uid,f,{fresh:true});
    await myAutoLinkRequest(nu.uid,shopId,f);
    location.reload();
    return{pending:true};
  }
  setStaffAccountMark(u.uid);
  const cur=firebaseAuth.currentUser||u;
  const pr=await mySaveProfile(cur.uid,f,{fresh:true});
  if(pr.profile)await myAutoLinkRequest(cur.uid,shopId,f);
  return{user:{uid:cur.uid,email:cur.email||String(f.email).trim()},profile:pr.profile||null,profileError:pr.error?`アカウントは作成しました。登録ネームを${pr.error}。下の「保存」でもう一度保存してください`:null,
    draft:{displayName:normalizeMyDisplayName(f.displayName),number:normalizeMyNumber(f.number)}};
}

// ログイン＝別の端末で作ったアカウントに入る。成功したら再読み込みして Phase1 からやり直す
// （匿名 uid から別の uid へ替わるので、購読と App の状態を作り直すのがいちばん確実）
async function myLogin(f,shopId){
  const vErr=validateMyEmail(f.email)||(f.password?null:"パスワードを入力してください");
  if(vErr) return{error:vErr};
  if(!firebaseAuth) return{error:MY_BLOCK_MESSAGES.signin};
  if(_isLocked(MY_LOGIN_LOCK_NS)) return{error:_lockMsg(MY_LOGIN_LOCK_NS)};
  const block=await myBlockReason(shopId);
  if(block) return{error:block.message};
  let user;
  try{
    user=(await firebaseAuth.signInWithEmailAndPassword(String(f.email).trim(),f.password)).user;
    _resetAttempts(MY_LOGIN_LOCK_NS);
  }catch(e){
    if(isMyCredentialError(e)){
      const n=_incAttempts(MY_LOGIN_LOCK_NS);
      if(_isLocked(MY_LOGIN_LOCK_NS)) return{error:_lockMsg(MY_LOGIN_LOCK_NS)};
      return{error:`${myAuthErrorMessage(e,"login")}（残り${Math.max(0,_MAX_ATTEMPTS-n)}回）`};
    }
    return{error:myAuthErrorMessage(e,"login")};
  }
  // 管理者のアカウント（accounts/{uid}/shops に店舗がある）はスタッフアカウントとして使わない。
  // サインアウトで購読が切れるので、理由を残して再読み込みする
  let adminShops=null;
  try{adminShops=(await firebaseDB.ref(`accounts/${user.uid}/shops`).once("value")).val();}catch{adminShops=null;}
  if(adminShops&&Object.keys(adminShops).length){
    try{await firebaseAuth.signOut();}catch{/* 再読み込みで匿名に戻る */}
    ssSave(SS_MY_NOTICE,"このメールアドレスは店舗の管理用のアカウントです。マイシフトには別のメールアドレスで登録してください");
    location.reload();
    return{pending:true};
  }
  setStaffAccountMark(user.uid);
  location.reload();
  return{pending:true};
}

// ログアウト＝サインアウトして再読み込み。Phase1 が匿名サインインし直すので、URL からの提出は従来どおりできる
async function myLogout(){
  clearStaffAccountMark();
  ssSave(SS_MY_OPEN,null);
  // 募集URLの画面から開いて #/me に切り替えていたら、募集URLに戻してから再読み込みする（#/me のまま読み込むとログインの画面だけになる）
  const base=ssGet(SS_MY_BASE_HASH,null);
  ssSave(SS_MY_BASE_HASH,null);
  try{if(base&&history.state&&history.state.shiftyOverlay&&isMyRouteHash(location.hash))history.replaceState(null,"",location.pathname+location.search+base);}catch{/* そのまま再読み込み */}
  try{if(firebaseAuth)await firebaseAuth.signOut();}catch(e){console.warn("サインアウト失敗:",e);}
  location.reload();
}

async function mySendReset(email){
  const vErr=validateMyEmail(email);
  if(vErr) return{error:vErr};
  if(!firebaseAuth) return{error:MY_BLOCK_MESSAGES.signin};
  try{
    await firebaseAuth.sendPasswordResetEmail(String(email).trim());
    // 登録の無いアドレスでも同じ文言にする（アドレスの有無を第三者に教えない）
    return{ok:"登録されているメールアドレスであれば、パスワードを再設定するメールを送りました"};
  }catch(e){
    if(String((e&&e.code)||"")==="auth/user-not-found") return{ok:"登録されているメールアドレスであれば、パスワードを再設定するメールを送りました"};
    return{error:myAuthErrorMessage(e,"reset")};
  }
}

async function myChangePassword(f){
  const vErr=(f.current?null:"現在のパスワードを入力してください")||validateMyPassword(f.next,f.next2);
  if(vErr) return{error:vErr};
  const u=firebaseAuth&&firebaseAuth.currentUser;
  if(!u||u.isAnonymous||!u.email) return{error:MY_BLOCK_MESSAGES.signin};
  try{
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,f.current));
    await u.updatePassword(f.next);
    return{ok:"パスワードを変更しました"};
  }catch(e){
    return{error:myAuthErrorMessage(e,"password")};
  }
}

// ===== メール確認つきの新規登録（2026-10-04・ユーザー指示）=====
// 規則（戻り先の URL・覚えておく記録・切り替えるエラー・文言）は app-my-utils.js の「メール確認つきの新規登録」の節。
// 流れ: ①アドレスだけ入れて確認メールを送る（sendEmailLinkRegister）→ ②メールのリンクを開く（parseEmailLinkLanding）→
// ③開いた画面（EmailLinkFinishScreen）でパスワード（スタッフは登録ネームと番号も）を入れる → signInWithEmailLink → updatePassword →
// 印・プロフィール・店舗の紐付けを書いて、oobCode を落とした URL で開き直す（uid が替わるので Phase1 からやり直す＝別端末のログインと同じ流儀）。
// **メールリンクが使えない（Firebase コンソールで無効・戻り先のドメインが未承認）ときは onFallback で従来の登録に切り替える**。
async function sendEmailLinkRegister({email,kind,hash,linkShopId}){
  const vErr=validateMyEmail(email);
  if(vErr)return{error:vErr};
  if(DEMO_MODE)return{error:MY_BLOCK_MESSAGES.demo};
  if(!firebaseAuth)return{error:MY_BLOCK_MESSAGES.signin};
  const em=String(email).trim();
  try{
    await firebaseAuth.sendSignInLinkToEmail(em,{url:emailLinkContinueUrl(window.location,{kind,hash}),handleCodeInApp:true});
  }catch(e){
    console.warn("確認メールの送信に失敗:",e&&e.code);
    if(isEmailLinkFallbackError(e))return{fallback:true,code:String(e.code)};
    return{error:emailLinkErrorMessage(e,"send")};
  }
  ls(EMAIL_LINK_PENDING_LS,emailLinkPendingRecord(em,kind,Date.now(),linkShopId));
  return{sent:true,email:em};
}
// 新規登録の1段目（アドレスだけ）と、送ったあとの「メールを確認してください」。
// kind: "staff"|"admin"、hash: 戻るハッシュ（スタッフだけ）、linkShopId: 設定タブのアカウント連携で、続きの登録のあとに紐付ける店舗（localStorage にだけ置く）。
// onFallback(email): メールリンクが使えないとき。呼び出し側が従来の登録の欄を出す。inputStyle・buttonStyle は呼び出し側の見た目に合わせる
function EmailLinkSendBox({kind,hash,linkShopId,onFallback,initialEmail,inputStyle,buttonStyle,beforeSend}){
  const[email,setEmail]=useState(initialEmail||"");
  const[sent,setSent]=useState(null);   // 送ったアドレス
  const[sentAt,setSentAt]=useState(0);
  const[now,setNow]=useState(Date.now());
  const[busy,setBusy]=useState(false);
  const[msg,setMsg]=useState({});
  useEffect(()=>{if(!sent)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[sent]);
  const send=async()=>{
    setBusy(true);setMsg({});
    if(beforeSend){const b=await beforeSend();if(b){setBusy(false);setMsg({error:b});return;}}
    const r=await sendEmailLinkRegister({email,kind,hash,linkShopId});
    setBusy(false);
    if(r.fallback){if(onFallback)onFallback(String(email).trim());return;}
    if(r.error){setMsg({error:r.error});return;}
    setSent(r.email);setSentAt(Date.now());setNow(Date.now());
  };
  const wait=Math.max(0,Math.ceil((sentAt+EMAIL_LINK_RESEND_WAIT_MS-now)/1000));
  const inp=inputStyle||AI;
  const btn=buttonStyle||{...AB,width:"100%",padding:"13px 18px",fontSize:15};
  if(sent)return(
    <div data-email-link="sent">
      <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)",marginBottom:8}}>メールを確認してください</div>
      <div data-email-link-to="1" style={{fontSize:14,lineHeight:1.8,color:"var(--c-text2)",marginBottom:12,overflowWrap:"anywhere"}}>
        {sent} に確認メールを送りました。メールのリンクを開くと、続きの登録（パスワードの設定）に進みます。届かないときは迷惑メールのフォルダも確認してください。
      </div>
      <MyMessage {...msg}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button data-email-link-action="resend" disabled={busy||wait>0} onClick={send} style={{...AGray,opacity:busy||wait>0?.6:1}}>{wait>0?`もう一度送る（${wait}秒）`:busy?"送信中…":"もう一度送る"}</button>
        <button data-email-link-action="edit" onClick={()=>{setSent(null);setMsg({});}} style={AGray}>メールアドレスを直す</button>
      </div>
    </div>
  );
  return(
    <div data-email-link="form">
      <input type="email" autoComplete="email" maxLength={254} value={email} data-email-link-input="email" placeholder="メールアドレス"
        onChange={e=>{setEmail(e.target.value);setMsg({});}} onKeyDown={e=>{if(e.key==="Enter"&&!busy)send();}}
        style={{...inp,marginBottom:10}}/>
      <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginBottom:12}}>入力したアドレスに確認メールを送ります。メールのリンクから登録を続けます。</div>
      <MyMessage {...msg}/>
      <button data-email-link-action="send" disabled={busy} onClick={send} style={{...btn,opacity:busy?.6:1}}>{busy?"送信中…":"確認メールを送る"}</button>
    </div>
  );
}
// 確認メールのリンクを開いた画面（続きの登録）。App が Phase1 より先に描く（landing＝parseEmailLinkLanding の戻り値）。
// 同じブラウザならアドレスは送った記録から入る。別のブラウザ・メールアプリの中のブラウザでは、アドレスをもう一度入れてもらう
// （signInWithEmailLink がアドレスを求めるため）。パスワードの設定に失敗したら、サインインしたまま設定し直せる
function EmailLinkFinishScreen({landing}){
  const kind=landing.kind;
  const href=useRef(window.location.href).current;
  const pending=useMemo(()=>emailLinkPendingFor(lg(EMAIL_LINK_PENDING_LS,null),kind,Date.now()),[kind]);
  const[f,setF]=useState({email:pending?pending.email:"",displayName:"",number:"",password:"",password2:""});
  const[stage,setStage]=useState(landing.hasCode?"form":"bad"); // form | password（サインイン済みでパスワードだけ未設定）| bad | stop
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState(false);
  const set=(k,v)=>{setF(p=>({...p,[k]:v}));setMsg({});};
  const leave=()=>{try{localStorage.removeItem(EMAIL_LINK_PENDING_LS);}catch{/* 書けない端末は何もしない */}window.location.replace(emailLinkCleanUrl(href,emailLinkReturnHash(kind,landing.hash)));};
  const finishWith=async user=>{
    // パスワード（以後のログインはメール＋パスワード）。既にあるアカウントのアドレスでも、メールを受け取れることを確かめたので設定し直す（再設定と同じ）
    try{await user.updatePassword(f.password);}
    catch(e){console.warn("パスワードの設定に失敗:",e&&e.code);setStage("password");setMsg({error:emailLinkErrorMessage(e,"password")});return false;}
    if(kind==="staff"){
      const pr=await mySaveProfile(user.uid,f,{fresh:true});
      // 募集URL・個別URLの画面から始めた登録は、そのお店にそのままリンクを申請する（次の画面で「申請する」を押させない）
      if(pr.profile){const sid=await myResolveShopIdOfHash(landing.hash);if(sid)await myAutoLinkRequest(user.uid,sid,f);}
      // スタッフURLの画面から始めた登録は、戻った画面でマイシフトを開く
      if(landing.hash&&!isMyRouteHash(landing.hash))ssSave(SS_MY_OPEN,"1");
    }else{
      ls(AUTH_LOGGED_OUT_LS,false); // 実ログイン成立（次の起動で復元する）
      // 設定タブのアカウント連携から始めた登録（同じブラウザだけ）: その店舗をこのアカウントに紐付ける
      if(pending&&pending.linkShopId&&pending.email.toLowerCase()===String(user.email||f.email).toLowerCase()){
        try{await fbSet(`accounts/${user.uid}/shops/${pending.linkShopId}`,true);}catch(e){console.warn("店舗の紐付けに失敗:",e&&e.code);}
      }
    }
    leave();
    return true;
  };
  const submit=async()=>{
    const vErr=validateMyEmail(f.email)||(kind==="staff"?validateMyProfile(f):null)||validateEmailLinkPassword(kind,f.password,f.password2);
    if(vErr){setMsg({error:vErr});return;}
    if(!firebaseAuth){setMsg({error:MY_BLOCK_MESSAGES.signin});return;}
    setBusy(true);setMsg({});
    if(stage==="password"){
      const u=firebaseAuth.currentUser;
      if(!u||u.isAnonymous){setBusy(false);setStage("bad");return;}
      const ok=await finishWith(u);if(!ok)setBusy(false);return;
    }
    if(!firebaseAuth.isSignInWithEmailLink(href)){setBusy(false);setStage("bad");return;}
    // スタッフ: 管理者の端末では作らせない（E1 の myBlockReason）。管理者: マイシフトのアカウントでログイン中の端末では作らせない
    if(kind==="staff"){const b=await myBlockReason(null);if(b){setBusy(false);setMsg({error:b.message});return;}}
    else if(isStaffAccountUser(firebaseAuth.currentUser)){setBusy(false);setMsg({error:MY_ADMIN_BLOCKED_MSG});return;}
    let user;
    try{
      try{await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch{/* 既定も LOCAL */}
      user=(await firebaseAuth.signInWithEmailLink(String(f.email).trim(),href)).user;
    }catch(e){
      console.warn("メールリンクでのサインインに失敗:",e&&e.code);
      setBusy(false);
      const c=String((e&&e.code)||"");
      if(c==="auth/invalid-action-code"||c==="auth/expired-action-code"){setStage("bad");return;}
      setMsg({error:emailLinkErrorMessage(e,"finish")});return;
    }
    // 管理者用とマイシフト用のアカウントは混ぜない（myLogin と同じ考え方）
    const stopWith=async text=>{try{await firebaseAuth.signOut();}catch{/* 開き直しで匿名に戻る */}setBusy(false);setStage("stop");setMsg({error:text});};
    if(kind==="staff"){
      let adminShops=null;
      try{adminShops=(await firebaseDB.ref(`accounts/${user.uid}/shops`).once("value")).val();}catch{adminShops=null;}
      if(adminShops&&Object.keys(adminShops).length)return stopWith("このメールアドレスは店舗の管理用のアカウントです。マイシフトには別のメールアドレスで登録してください");
      setStaffAccountMark(user.uid);
    }else{
      const prof=await readStaffProfile(user.uid);
      if(prof)return stopWith("このメールアドレスはマイシフト用のアカウントです。店舗の管理には別のメールアドレスで登録してください");
    }
    const ok=await finishWith(user);
    if(!ok)setBusy(false);
  };
  const onKey=e=>{if(e.key==="Enter"&&!busy)submit();};
  const title=kind==="staff"?"マイシフトの登録":"アカウントの登録";
  return(
    <div data-email-link-finish={stage} data-email-link-kind={kind} style={{minHeight:"100vh",background:"var(--c-bg)"}}>
      <MyHeader title={title}/>
      <div style={{maxWidth:420,margin:"0 auto",padding:"24px 16px 40px"}}>
        <section style={MY_SECTION}>
          {stage==="bad"?<>
            <div style={MY_SECTION_TITLE}>このリンクは使えません</div>
            <div style={{fontSize:14,lineHeight:1.8,color:"var(--c-text2)",marginBottom:14}}>リンクの期限が切れているか、すでに使われています。お手数ですが、もう一度はじめから登録してください。</div>
            <button data-email-link-action="leave" onClick={leave} style={{...AB,width:"100%"}}>はじめの画面へ</button>
          </>:stage==="stop"?<>
            <div style={MY_SECTION_TITLE}>登録できませんでした</div>
            <MyMessage {...msg}/>
            <button data-email-link-action="leave" onClick={leave} style={{...AB,width:"100%"}}>はじめの画面へ</button>
          </>:<>
            <div style={MY_SECTION_TITLE}>{stage==="password"?"パスワードの設定":"続きの登録"}</div>
            <div style={{fontSize:13,lineHeight:1.7,color:"var(--c-text3)",marginBottom:14}}>
              {stage==="password"?"メールアドレスの確認は済んでいます。パスワードを設定すると登録が終わります。"
                :pending?"メールアドレスを確認できました。パスワードを決めて登録を終えてください。"
                :"確認メールを送ったメールアドレスを入れてください（別のブラウザで開いたときは、アドレスの入力が必要です）。"}
            </div>
            {stage==="form"&&!pending&&<MyField label="メールアドレス" type="email" autoComplete="email" value={f.email} data-my-input="email" onChange={e=>set("email",e.target.value)} onKeyDown={onKey}/>}
            {stage==="form"&&pending&&<div data-email-link-address="1" style={{fontSize:14,color:"var(--c-text2)",marginBottom:12,overflowWrap:"anywhere"}}>{pending.email}</div>}
            {kind==="staff"&&stage==="form"&&<>
              <MyField label="登録ネーム" value={f.displayName} maxLength={MY_DISPLAY_NAME_MAX} autoComplete="name" data-my-input="displayName" placeholder={MY_DISPLAY_NAME_PLACEHOLDER} onChange={e=>set("displayName",e.target.value)} hint="お店に登録されている名前と同じにしてください"/>
              <MyField label="従業員番号（任意）" value={f.number} maxLength={MY_NUMBER_MAX} inputMode="numeric" data-my-input="number" hint={MY_PROFILE_NUMBER_HINT} onChange={e=>set("number",e.target.value)}/>
            </>}
            <MyField label="パスワード" type="password" autoComplete="new-password" value={f.password} data-my-input="password"
              hint={NEW_PASSWORD_HINT} onChange={e=>set("password",e.target.value)} onKeyDown={onKey}/>
            <MyField label="パスワード（確認）" type="password" autoComplete="new-password" value={f.password2} data-my-input="password2" onChange={e=>set("password2",e.target.value)} onKeyDown={onKey}/>
            <MyMessage {...msg}/>
            <button data-email-link-action="finish" disabled={busy} onClick={submit} style={{...AB,width:"100%",padding:"13px 18px",fontSize:15,opacity:busy?.6:1}}>{busy?"処理中…":"登録する"}</button>
            {stage==="form"&&<button data-email-link-action="leave" onClick={leave} style={{...MY_LINK_BTN,marginTop:10}}>やめる</button>}
          </>}
        </section>
      </div>
    </div>
  );
}

// ===== 紐付け（第2部 E2）=====
// 本人の端末から呼ぶ Cloud Functions（コードでの紐付け・解除）。App の _callCF と同じくデモでは呼ばない
async function myCallCF(name,payload){
  if(DEMO_MODE)return{error:MY_BLOCK_MESSAGES.demo};
  if(!firebaseFunctions)return{error:MY_BLOCK_MESSAGES.signin};
  try{return(await firebaseFunctions.httpsCallable(name)(payload||{})).data||{};}
  catch(e){return{error:(e&&e.message)||"処理に失敗しました。もう一度お試しください"};}
}
const _myRead=p=>firebaseDB.ref(p).once("value").then(s=>({ok:true,v:s.val()}),()=>({ok:false,v:null}));
// 本人の紐付けの一覧（E3 以降が「どの店舗のどの名前か」を得る入口）。users/{uid}/links を索引にし、
// 店舗ごとに shops/{sid}/staffLinks/{uid}（名前の正本）と shops/{sid}/staff を読んで resolveMyLink で確かめる。
// 戻り値は [{shopId, shopName, ok, name, personId, method, at, reason}]。ok=false の紐付けは使わない（reason は MY_LINK_INVALID_LABELS か "unread"）
async function readMyLinks(uid){
  if(!firebaseDB||!uid)return[];
  const idx=await _myRead(`users/${uid}/links`);
  if(!idx.ok)return null; // 読めない（ルール未反映・通信）。呼び出し側が「確認できませんでした」を出す
  const ids=myOwnerCheckShopIds({cachedShops:Object.keys(idx.v||{}).map(id=>({id}))});
  return Promise.all(ids.map(async sid=>{
    const[sl,staff,nm]=await Promise.all([_myRead(`shops/${sid}/staffLinks/${uid}`),_myRead(`shops/${sid}/staff`),_myRead(`global/shops/${sid}/name`)]);
    const shopName=typeof nm.v==="string"&&nm.v?nm.v:"（店舗名を読めませんでした）";
    if(!sl.ok||!staff.ok)return{shopId:sid,shopName,ok:false,reason:"unread",name:((idx.v||{})[sid]||{}).name||""};
    return{...resolveMyLink(sid,(idx.v||{})[sid],sl.v,staff.v),shopName};
  }));
}

// ===== 本人（データの持ち主）（2026-10-04・スタッフ個別URL）=====
// アカウント（users/{uid}・E1〜E6）と個別URL（staffPageData/{pageToken}）で、マイシフト・給料・勤務先・月間目標の画面を共有する（画面を二重に作らない）。
//   key        … 読み込みをやり直す鍵（本人が替わったら読み直す）
//   base       … 本人のデータの基点（workplaces・shifts・overrides・goals・actuals・seen はこの下。形は同じ）
//   links()    … 紐付いた店舗の一覧（readMyLinks と同じ形の Promise。個別URLは承認された1店舗だけ）
//   companyPay(sid) … 会社が登録した賃金（myCompanyPayOf の形の Promise）
function myAccountSubject(uid){
  return uid?{kind:"account",key:"u:"+uid,base:`users/${uid}`,links:()=>readMyLinks(uid),companyPay:sid=>readMyCompanyPay(uid,sid)}:null;
}

// 管理者側（スタッフタブ）: 申請の提案と未リンクの申請。オーナーの端末で MY_SCREEN_ENABLED のときだけ（links.enabled）
function StaffLinkRequestsCard({links,staffList,staffNumbers,mirrorPeople,shopId,tt}){
  const[busy,setBusy]=useState("");
  if(!links||!links.enabled)return null;
  const{withCand,unmatched}=splitLinkRequests(links.requests,{shopId,staff:staffList,staffNumbers,mirrorPeople,staffLinks:links.map});
  if(!withCand.length&&!unmatched.length)return null;
  const who=r=>`${r.displayName||"（名前なし）"}${r.number?`（従業員番号 ${r.number}）`:""}`;
  const when=r=>{const d=new Date(r.at);return Number.isFinite(d.getTime())?`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")} に申請`:"";};
  const approve=async(uid,name)=>{
    setBusy(uid);
    const r=await links.call("approveStaffLink",{uid,name});
    setBusy("");
    tt(r.error?`▲ ${r.error}`:`✓ 「${name}」さんにリンクしました`);
  };
  const reject=async uid=>{
    setBusy(uid);
    const r=await links.reject(uid);
    setBusy("");
    tt(r&&r.error?`▲ ${r.error}`:"申請を却下しました");
  };
  const row={padding:"12px 0",borderTop:"1px solid var(--c-border)"};
  const btn={...AGray,padding:"7px 12px",fontSize:13};
  return(
    <AC title="マイシフトのリンク申請">
      <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginBottom:6}}>スタッフがマイシフトのアカウントから申請しています。リンクすると、そのアカウントでこの店舗の本人のシフトが見られるようになります。</div>
      {withCand.map(({uid,req,cands})=>(
        <div key={uid} data-link-request={uid} style={row}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)"}}>{who(req)}</div>
          <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:8}}>{when(req)}</div>
          {cands.map(c=>(
            <div key={c.name} data-link-candidate={c.name} style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8}}>
              <div style={{flex:"1 1 200px",minWidth:0,fontSize:13,color:"var(--c-text2)",lineHeight:1.6}}>
                このアカウントを「{c.name}」さんにリンクしますか
                <span style={{display:"block",fontSize:12,color:"var(--c-text3)"}}>{c.methods.map(m=>MY_LINK_METHOD_LABELS[m]).join("・")}{c.takenBy?" ／ 既に別のアカウントとリンク済み":""}</span>
              </div>
              {!c.takenBy&&<button data-link-approve={c.name} disabled={busy===uid} onClick={()=>approve(uid,c.name)} style={{...AB,padding:"7px 14px",fontSize:13,opacity:busy===uid?.6:1}}>リンクする</button>}
            </div>
          ))}
          <button data-link-reject={uid} disabled={busy===uid} onClick={()=>reject(uid)} style={btn}>却下</button>
        </div>
      ))}
      {unmatched.length>0&&<div data-link-unmatched="1" style={{marginTop:withCand.length?8:0}}>
        <div style={{fontSize:13,fontWeight:700,color:"var(--c-text2)",margin:"6px 0 2px"}}>未リンクの申請</div>
        <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7}}>登録名・従業員番号のどちらとも一致しません。本人に登録ネームを直して申請し直してもらうか、スタッフの「編集」から「このスタッフ専用のURLを発行」で本人にURLを渡してください。</div>
        {unmatched.map(({uid,req})=>(
          <div key={uid} data-link-request={uid} style={{...row,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{flex:"1 1 200px",minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)"}}>{who(req)}</div>
              <div style={{fontSize:12,color:"var(--c-text4)"}}>{when(req)}</div>
            </div>
            <button data-link-reject={uid} disabled={busy===uid} onClick={()=>reject(uid)} style={btn}>却下</button>
          </div>
        ))}
      </div>}
    </AC>
  );
}

// 管理者側（スタッフの編集モーダルの中）: その人の紐付けの状態と解除
function StaffLinkEditSection({links,name,tt}){
  const[busy,setBusy]=useState(false);
  if(!links||!links.enabled)return null;
  const linked=staffLinksByName(links.map)[name];
  const unlink=async()=>{
    if(!window.confirm(`「${name}」さんとマイシフトのアカウントのリンクを解除しますか？`))return;
    setBusy(true);
    const r=await links.call("unlinkStaff",{uid:linked.uid});
    setBusy(false);
    tt(r.error?`▲ ${r.error}`:"リンクを解除しました");
  };
  if(linked){
    const d=new Date(linked.rec.at);
    return(
      <div data-staff-link="linked">
        <div style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.7,marginBottom:8}}>
          マイシフトのアカウントとリンク済み
          <span style={{display:"block",fontSize:12,color:"var(--c-text3)"}}>{MY_LINK_METHOD_LABELS[linked.rec.method]||""}{Number.isFinite(d.getTime())?` ／ ${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`:""}</span>
        </div>
        <button data-staff-link-action="unlink" disabled={busy} onClick={unlink} style={{...AGray,opacity:busy?.6:1}}>リンクを解除</button>
      </div>
    );
  }
  // 個人リンクコードは 2026-10-05 にユーザー指示で機能ごと削除した（スタッフ専用のURLの発行に一本化）
  return null;
}

// 本人側（設定タブ）: 紐付いた店舗・申請・コードの入力
function MyLinksSection({staffUser,profile,shopId}){
  const uid=staffUser.uid;
  const[list,setList]=useState(undefined); // undefined=読み込み中・null=読めない
  const[req,setReq]=useState(undefined);   // 開いている店舗への自分の申請（null=無い）
  const[shopName,setShopName]=useState("");
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState("");
  const[seq,setSeq]=useState(0);
  // このお店で使っている従業員番号（掛け持ち先ごとに違う・2026-10-05）。null＝まだ触っていない（初期値を使う）
  const[num,setNum]=useState(null);
  const reload=()=>setSeq(x=>x+1);
  useEffect(()=>{
    let alive=true;
    readMyLinks(uid).then(v=>{if(alive)setList(v);}).catch(()=>{if(alive)setList(null);});
    if(shopId&&firebaseDB){
      _myRead(`shops/${shopId}/linkRequests/${uid}`).then(r=>{if(alive)setReq(r.ok?r.v:null);});
      _myRead(`global/shops/${shopId}/name`).then(r=>{if(alive)setShopName(typeof r.v==="string"?r.v:"");});
    }
    return()=>{alive=false;};
  },[uid,shopId,seq]);
  const linkedHere=shopId&&Array.isArray(list)&&list.some(l=>l.shopId===shopId&&l.ok);
  const numValue=num!==null?num:myLinkRequestNumberDefault(profile,list);
  const apply=async()=>{
    setMsg({});
    if(!normalizeMyDisplayName(profile.displayName)){setMsg({error:"先に下の「アカウント」で登録ネームを保存してください"});return;}
    const vErr=validateMyProfile({displayName:profile.displayName,number:numValue});
    if(vErr){setMsg({error:vErr});return;}
    setBusy("apply");
    try{await fbSet(`shops/${shopId}/linkRequests/${uid}`,buildLinkRequestRecord({displayName:profile.displayName,number:numValue},new Date().toISOString()));setMsg({ok:"申請しました。お店の管理者が承認するとリンクされます"});setNum(null);}
    catch(e){setMsg({error:isPermissionDeniedError(e)?"申請できませんでした（サーバー側の設定が未反映の可能性があります）":"申請できませんでした。通信状態を確認してもう一度お試しください"});}
    setBusy("");reload();
  };
  const cancel=async()=>{
    setBusy("cancel");setMsg({});
    try{await fbSet(`shops/${shopId}/linkRequests/${uid}`,null);setMsg({ok:"申請を取り消しました"});}
    catch{setMsg({error:"取り消せませんでした。もう一度お試しください"});}
    setBusy("");reload();
  };
  const unlink=async sid=>{
    if(!window.confirm("このお店とのリンクを解除しますか？"))return;
    setBusy("unlink:"+sid);setMsg({});
    const r=await myCallCF("unlinkStaff",{shopId:sid});
    setBusy("");
    setMsg(r.error?{error:r.error}:{ok:"リンクを解除しました"});reload();
  };
  return(
    <section style={MY_SECTION} data-my-section="links">
      <div style={MY_SECTION_TITLE}>勤務先のお店</div>
      {list===undefined&&<div style={{fontSize:14,color:"var(--c-text3)",marginBottom:12}}>読み込み中…</div>}
      {list===null&&<MyMessage error="リンクを読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/>}
      {Array.isArray(list)&&list.length===0&&<div style={{fontSize:14,color:"var(--c-text3)",lineHeight:1.8,marginBottom:12}}>まだどのお店ともリンクしていません。</div>}
      {Array.isArray(list)&&list.map(l=>(
        <div key={l.shopId} data-my-link={l.shopId} data-my-link-ok={l.ok?"1":"0"} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--c-border)"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)",overflowWrap:"anywhere"}}>{l.shopName}</div>
            <div style={{fontSize:13,color:l.ok?"var(--c-text2)":"var(--c-danger)",lineHeight:1.6,overflowWrap:"anywhere"}}>
              {l.ok?`登録名: ${l.name}`:(l.reason==="unread"?"状態を確認できませんでした":MY_LINK_INVALID_LABELS[l.reason])}
            </div>
          </div>
          <button data-my-action="unlink" disabled={busy==="unlink:"+l.shopId} onClick={()=>unlink(l.shopId)} style={{...AGray,padding:"8px 12px",fontSize:13,whiteSpace:"nowrap"}}>解除</button>
        </div>
      ))}

      {shopId&&!linkedHere&&Array.isArray(list)&&<div data-my-link-apply={req?"pending":"none"} style={{marginTop:16}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>{shopName||"このお店"}にリンクを申請</div>
        {req?(
          <>
            <div style={{fontSize:14,color:"var(--c-text2)",lineHeight:1.8,marginBottom:10}}>申請中です。お店の管理者の承認を待っています。</div>
            <div data-my-link-req-sent="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>送った内容: 登録ネーム「{req.displayName||""}」{req.number?` ／ 従業員番号「${req.number}」`:" ／ 従業員番号なし"}</div>
            <button data-my-action="cancelRequest" disabled={busy==="cancel"} onClick={cancel} style={AGray}>申請を取り消す</button>
          </>
        ):(
          <>
            <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.8,marginBottom:10}}>
              登録ネーム「{profile.displayName||"未設定"}」と下の従業員番号をお店の管理者に送ります。お店に登録されている名前・番号と一致すると、管理者が承認してリンクされます。
            </div>
            <MyField label="このお店の従業員番号（任意）" value={numValue} maxLength={MY_NUMBER_MAX} inputMode="numeric" data-my-input="linkNumber" hint={MY_LINK_NUMBER_HINT} onChange={e=>setNum(e.target.value)}/>
            <button data-my-action="apply" disabled={busy==="apply"||req===undefined} onClick={apply} style={{...AB,opacity:busy==="apply"?.6:1}}>{busy==="apply"?"申請中…":"申請する"}</button>
          </>
        )}
      </div>}
      {/* 掛け持ち先を足す方法（2026-10-05）。リンク済みのお店があっても出す（以前は0件のときだけで、2つ目のお店の足し方が分からなかった） */}
      {!shopId&&Array.isArray(list)&&<div data-my-link-howto="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.8,marginTop:list.length?12:4}}>
        {list.length?"掛け持ち先のお店を足すときは、":""}お店から受け取ったスタッフ用URLから開くと、そのお店にリンクを申請できます。お店から自分専用のURLをもらっている場合は、そのURLの設定から「マイシフトのアカウントに追加」で足せます。
      </div>}

      <MyMessage {...msg}/>
    </section>
  );
}

// ===== 画面の部品 =====
// 新規登録の名前の欄に薄く出す見本（2026-10-08 ユーザー指示）
const MY_DISPLAY_NAME_PLACEHOLDER="シフトに登録されている名前";
const MY_LABEL={fontSize:12,fontWeight:700,color:"var(--c-text3)",marginBottom:6,display:"block"};
const MY_SECTION={background:"var(--c-card)",border:"1px solid var(--c-border)",borderRadius:12,padding:"18px 16px",marginBottom:16};
const MY_SECTION_TITLE={fontSize:14,fontWeight:700,color:"var(--c-text)",marginBottom:14};
const MY_LINK_BTN={background:"none",border:"none",padding:"8px 0",color:"var(--c-text2)",fontSize:14,textDecoration:"underline",cursor:"pointer"};

function MyField({label,hint,...rest}){
  return(
    <label style={{display:"block",marginBottom:14}}>
      <span style={MY_LABEL}>{label}</span>
      <input {...rest} style={AI}/>
      {hint&&<span style={{display:"block",fontSize:12,color:"var(--c-text3)",marginTop:6,lineHeight:1.6}}>{hint}</span>}
    </label>
  );
}
// 処理の結果。error は赤、ok は通常の文字色（成功の色を増やさない＝アクセントは1色）
function MyMessage({error,ok}){
  if(!error&&!ok) return null;
  return <div role={error?"alert":"status"} data-my-msg={error?"error":"ok"} style={{fontSize:14,lineHeight:1.7,color:error?"var(--c-danger)":"var(--c-text2)",margin:"4px 0 14px"}}>{error||ok}</div>;
}

// 下部タブ。並びは MY_TABS（app-my-utils.js）。高さは MY_TAB_BAR_H（個別URLの提出タブが送信の帯をこの上に出す）
const MY_TAB_BAR_H=52;
function MyTabBar({tab,onTab,tabs=MY_TABS}){
  return(
    <nav style={{position:"fixed",left:0,right:0,bottom:0,background:"var(--c-card)",borderTop:"1px solid var(--c-border)",zIndex:50,paddingBottom:"env(safe-area-inset-bottom,0)"}}>
      <div style={{maxWidth:560,margin:"0 auto",display:"flex"}}>
        {tabs.map(t=>{const a=t.key===tab;return(
          <button key={t.key} data-my-tab={t.key} aria-current={a?"page":undefined} onClick={()=>onTab(t.key)}
            style={{flex:1,minHeight:MY_TAB_BAR_H,background:"none",border:"none",borderTop:`2px solid ${a?"var(--c-accent)":"transparent"}`,color:a?"var(--c-accent)":"var(--c-text3)",fontSize:14,fontWeight:a?700:600,cursor:"pointer"}}>
            {t.label}
          </button>
        );})}
      </div>
    </nav>
  );
}

function MyHeader({title,onClose}){
  return(
    <header style={{background:"var(--c-card)",borderBottom:"1px solid var(--c-border)",position:"sticky",top:0,zIndex:40}}>
      <div style={{maxWidth:560,margin:"0 auto",padding:"0 16px",minHeight:52,display:"flex",alignItems:"center",gap:12}}>
        {onClose&&<button data-my-close="1" onClick={onClose} style={{background:"none",border:"none",color:"var(--c-text2)",fontSize:14,fontWeight:600,cursor:"pointer",padding:"10px 0",whiteSpace:"nowrap"}}>← 提出画面</button>}
        <div style={{fontSize:17,fontWeight:700,color:"var(--c-text)",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
      </div>
    </header>
  );
}

// E1 の時点では中身が無い。使えないボタンは置かず、何が出る予定かだけを書く（E3・E5 が置き換える）
function MyEmptyState({children}){
  return <div data-my-empty="1" style={{padding:"32px 4px",fontSize:14,lineHeight:1.9,color:"var(--c-text3)"}}>{children}</div>;
}
// ===== マイシフト（2026-10-04・第2部 E3）=====
// 紐付いた店舗（readMyLinks の ok の行）ごとに periods・settings（企業設定を重ねる）・staff・プランと、表示する期間の subs を読む。
// subs は期間ごとの部分読み（orderByChild("periodId").equalTo）で、**店舗の subs 全件は読まない**。画面に出すのは本人の分だけ
// （ルール上は店舗全員分を読める＝画面の絞り込みで、ルールの保護ではない。計画書 E.4 の注意）。
// 書くのは users/{uid}/seen だけ（店舗のデータには一切書かない）。計算は app-my-utils.js の buildMyShiftDays 以下
async function readMyShiftShop(sid){
  const[pe,se,st,co,pl]=await Promise.all([_myRead(`shops/${sid}/periods`),_myRead(`shops/${sid}/settings`),_myRead(`shops/${sid}/staff`),
    _myRead(`shops/${sid}/company`),_myRead(`accounts/${sid}/plan`)]);
  if(!pe.ok||!se.ok||!st.ok)return{ok:false};
  const periods=Object.values(pe.v||{}).filter(p=>p&&p.id&&p.startDate&&p.endDate).sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)));
  const coLink=co.ok&&co.v&&typeof co.v==="object"?co.v:null;
  const settings=applyCompanySettings(se.v||makeSettings(sid),coLink?(coLink.settings||{}):null);
  // プランは App と同じ規則（dev は ?plan= の上書きが効く）。読めなければ Free とみなす＝公開済みの表示は出さない側に倒す
  const plan=DEV_PLAN_OVERRIDE||(pl.ok&&["free","pro","premium"].includes(pl.v)?pl.v:"free");
  // 賃金の法人設定（最低賃金・割増率・端数規則）。写しは auth != null で読める＝本人の給料の目安（E5）に月次賃金と同じ率・端数を使う
  const wageSettings=coLink&&coLink.settings&&coLink.settings.wageSettings&&typeof coLink.settings.wageSettings==="object"?coLink.settings.wageSettings:null;
  // 企業の写し（ヘルプ先の勤務の合算・2026-10-04 B）。連携していない店舗は null＝他店を読まない
  return{ok:true,periods,settings,staff:st.v||[],plan,wageSettings,companyLink:coLink};
}
// 同じ店舗を短い間に2回読まない（マイシフトの「自分のシフト」と「全員のシフト」は同時に開く）。読めたものだけを30秒覚える
const MY_SHOP_READ_TTL_MS=30000;
const _myShopReads=new Map(); // sid → {at, promise}
function readMyShiftShopShared(sid){
  const hit=_myShopReads.get(sid);
  if(hit&&Date.now()-hit.at<MY_SHOP_READ_TTL_MS)return hit.promise;
  const promise=readMyShiftShop(sid).then(v=>{if(!v||!v.ok)_myShopReads.delete(sid);return v;},e=>{_myShopReads.delete(sid);throw e;});
  _myShopReads.set(sid,{at:Date.now(),promise});
  return promise;
}
async function readMyPeriodSubs(sid,pid){
  try{
    const snap=await firebaseDB.ref(`shops/${sid}/subs`).orderByChild("periodId").equalTo(pid).once("value");
    return Object.values(snap.val()||{}).filter(s=>s&&s.id&&s.periodId===pid);
  }catch(e){console.warn("マイシフト: 提出の読み込みに失敗:",e&&e.code);return null;}
}

// 紐付いた店舗（readMyLinks の ok の行）ごとの periods・settings・staff・プランと、pick(期間の一覧) が返す期間の subs を読む。
// マイシフト（表示中の月と今日以降）と給料（締め期間を含む暦月と前後の週・E5）が共有する。読んだ期間は覚えておき、読み直さない。
// pending は「読み込み中の店舗か、pick の期間で subs をまだ読んでいないものがある」
function useMyShiftSources(me,pick){
  const[links,setLinks]=useState(undefined);   // undefined=読み込み中・null=読めない
  const[shops,setShops]=useState({});         // {sid: {ok,periods,settings,staff,plan,wageSettings}}
  const[subs,setSubs]=useState({});           // {"sid|pid": sub[] | null}
  const loadingRef=useRef(new Set());
  const key=me&&me.key;
  useEffect(()=>{
    if(!me)return;
    let alive=true;
    me.links().then(v=>{if(alive)setLinks(v);}).catch(()=>{if(alive)setLinks(null);});
    return()=>{alive=false;};
  },[key]);
  const okLinks=useMemo(()=>(Array.isArray(links)?links.filter(l=>l&&l.ok):[]),[links]);
  const badLinks=Array.isArray(links)?links.filter(l=>l&&!l.ok):[];
  useEffect(()=>{
    let alive=true;
    okLinks.forEach(l=>{
      if(shops[l.shopId]||loadingRef.current.has("shop:"+l.shopId))return;
      loadingRef.current.add("shop:"+l.shopId);
      readMyShiftShopShared(l.shopId).then(v=>{if(alive)setShops(p=>({...p,[l.shopId]:v}));},()=>{if(alive)setShops(p=>({...p,[l.shopId]:{ok:false}}));});
    });
    return()=>{alive=false;};
  },[okLinks,shops]);
  useEffect(()=>{
    okLinks.forEach(l=>{
      const sh=shops[l.shopId];
      if(!sh||!sh.ok)return;
      pick(sh.periods).forEach(p=>{
        const k=l.shopId+"|"+p.id;
        if(k in subs||loadingRef.current.has(k))return;
        loadingRef.current.add(k);
        readMyPeriodSubs(l.shopId,p.id).then(v=>setSubs(prev=>({...prev,[k]:v})));
      });
    });
  },[okLinks,shops,pick,subs]);
  const pending=links===undefined||okLinks.some(l=>{
    const sh=shops[l.shopId];
    if(!sh)return true;
    return sh.ok&&pick(sh.periods).some(p=>!((l.shopId+"|"+p.id) in subs));
  });
  return{links,okLinks,badLinks,shops,subs,pending};
}
// メールのアカウントの「全員のシフト」（2026-10-04）。有効な紐付け（readMyLinks の ok）の店舗の periods・settings・staff・プランを読み、
// 選んだ期間の subs だけを期間ごとの部分読みで読む（店舗の subs 全件は読まない・読んだ期間は覚えて読み直さない）。何も書かない。
// 戻り値 {shops: myAllShiftChoices に渡す店舗の配列（読めた店舗だけ・readMyLinks の並び）, subsFor, need, loading}
function useMyAllShiftSources(me){
  const[links,setLinks]=useState(undefined);
  const[shops,setShops]=useState({});
  const[subs,setSubs]=useState({});
  const startedRef=useRef(new Set());
  const key=me&&me.key;
  useEffect(()=>{
    if(!me)return;
    let alive=true;
    me.links().then(v=>{if(alive)setLinks(v);}).catch(()=>{if(alive)setLinks(null);});
    return()=>{alive=false;};
  },[key]);
  const okLinks=useMemo(()=>(Array.isArray(links)?links.filter(l=>l&&l.ok):[]),[links]);
  useEffect(()=>{
    let alive=true;
    okLinks.forEach(l=>{
      if(startedRef.current.has("shop:"+l.shopId))return;
      startedRef.current.add("shop:"+l.shopId);
      readMyShiftShopShared(l.shopId).then(v=>{if(alive)setShops(p=>({...p,[l.shopId]:v}));},()=>{if(alive)setShops(p=>({...p,[l.shopId]:{ok:false}}));});
    });
    return()=>{alive=false;};
  },[okLinks]);
  const need=useCallback((sid,pid)=>{
    const k=sid+"|"+pid;
    if(startedRef.current.has(k))return;
    startedRef.current.add(k);
    readMyPeriodSubs(sid,pid).then(v=>setSubs(p=>({...p,[k]:v})));
  },[]);
  const list=useMemo(()=>okLinks.map(l=>{const sh=shops[l.shopId];return sh&&sh.ok?{shopId:l.shopId,shopName:l.shopName,name:l.name,periods:sh.periods,settings:sh.settings,staff:sh.staff,plan:sh.plan,companyLink:sh.companyLink||null}:null;}).filter(Boolean),[okLinks,shops]);
  const subsFor=useCallback((sid,pid)=>subs[sid+"|"+pid],[subs]);
  const loading=links===undefined||okLinks.some(l=>!shops[l.shopId]);
  return{shops:list,subsFor,need,loading};
}
// 店舗の読めた期間の subs（{期間ID: sub[]}）。subs が null（読めなかった）の期間は入れない
function mySubsByPeriodOf(sid,sh,subs){
  const out={};
  ((sh&&sh.periods)||[]).forEach(p=>{const v=subs[sid+"|"+p.id];if(Array.isArray(v))out[p.id]=v;});
  return out;
}

// ヘルプ先の勤務（2026-10-04 B）の材料。紐付いた店舗ごとに、企業の写しの連携店舗（同じ法人）の settings・staff・periods を読み、
// その人の登録がある店舗（samePersonRegistrations）だけ、範囲（rangeOf(店舗)＝{from,to}）にかかる期間の subs を期間ごとの部分読みで読む
// （店舗の subs 全件は読まない・企業に連携していない店舗では何も読まない・書き込みなし・30秒覚える）。
// 範囲に公開済みの期間が無い店舗も読まない（ヘルプ勤務を出すのは所属店舗が公開済みの期間だけ）。
// 戻り値 {state:{sid:{companyLink, otherShops, failed, rangeKey}}, pending（読み込み中の店舗がある）}
function useMyHelperSources(okLinks,shops,rangeOf,enabled){
  const[st,setSt]=useState({});
  const plans=okLinks.map(l=>{
    const sh=shops[l.shopId];
    if(!enabled||!sh||!sh.ok)return null;
    const link=sh.companyLink;
    const r=rangeOf(sh);
    const ids=link&&link.shops&&typeof link.shops==="object"?Object.keys(link.shops).filter(id=>id&&id!==l.shopId):[];
    const pubs=r?myPeriodsInRange(sh.periods,r.from,r.to).filter(p=>isPeriodPublished(p)):[];
    if(!r||!ids.length||!pubs.length)return{sid:l.shopId,none:true,rangeKey:"none"};
    return{sid:l.shopId,name:l.name,link,range:r,rangeKey:r.from+"|"+r.to};
  }).filter(Boolean);
  const key=plans.map(p=>p.sid+":"+(p.name||"")+":"+p.rangeKey).join(",");
  useEffect(()=>{
    if(!key||!firebaseDB)return;
    let alive=true;
    plans.forEach(pl=>{
      if(pl.none){setSt(p=>p[pl.sid]&&p[pl.sid].rangeKey==="none"?p:{...p,[pl.sid]:{companyLink:null,otherShops:{},failed:false,rangeKey:"none"}});return;}
      (async()=>{
        const link=pl.link;
        const ents=link.shopEntities&&typeof link.shopEntities==="object"?link.shopEntities:{};
        const myEnt=typeof link.entityId==="string"?link.entityId:null;
        const ids=Object.keys(link.shops).filter(id=>id&&id!==pl.sid&&!(myEnt&&typeof ents[id]==="string"&&ents[id]!==myEnt));
        const metas=await Promise.all(ids.map(id=>readMyHelperShop(id).then(v=>[id,v],()=>[id,{ok:false}])));
        const nameOf=id=>typeof link.shops[id]==="string"&&link.shops[id]?link.shops[id]:id;
        const pre={};
        metas.forEach(([id,v])=>{pre[id]=v.ok?otherShopDataOf({name:nameOf(id),settings:v.settings,staff:v.staff,periods:v.periods}):otherShopDataOf({name:nameOf(id),loadFailed:true});});
        const home=shops[pl.sid];
        const regs=samePersonRegistrations({shopId:pl.sid,name:pl.name,settings:home&&home.settings,people:link.people||null,
          otherShops:helperShopsOf(link,pre,pl.sid),entityId:myEnt});
        const regShops=new Set(regs.map(r=>r.shopId));
        const rows=await Promise.all(metas.map(async([id,v])=>{
          if(!v.ok||!regShops.has(id))return[id,pre[id]];
          const ps=Object.values(v.periods||{}).filter(q=>q&&q.id&&q.startDate&&q.endDate&&q.startDate<=pl.range.to&&pl.range.from<=q.endDate);
          const lists=await Promise.all(ps.map(q=>readMyHelperSubs(id,q.id).catch(()=>({ok:false}))));
          const subs={};
          lists.forEach(r=>{if(r.ok)r.list.forEach(x=>{subs[x.id]=x;});});
          return[id,otherShopDataOf({name:nameOf(id),settings:v.settings,subs,staff:v.staff,periods:v.periods,loadFailed:lists.some(r=>!r.ok)})];
        }));
        if(alive)setSt(p=>({...p,[pl.sid]:{companyLink:link,otherShops:Object.fromEntries(rows),failed:false,rangeKey:pl.rangeKey}}));
      })().catch(e=>{console.warn("ヘルプ先の勤務の読み込みに失敗:",e&&e.code);if(alive)setSt(p=>({...p,[pl.sid]:{companyLink:null,otherShops:{},failed:true,rangeKey:pl.rangeKey}}));});
    });
    return()=>{alive=false;};
  },[key]);
  const pending=plans.some(pl=>!st[pl.sid]||st[pl.sid].rangeKey!==pl.rangeKey);
  return{state:st,pending};
}
// 期間の一覧の日付の範囲（最初の開始日〜最後の終了日）。無ければ null
function myRangeOfPeriods(ps){
  const list=(ps||[]).filter(p=>p&&p.startDate&&p.endDate);
  if(!list.length)return null;
  return{from:list.map(p=>p.startDate).sort()[0],to:list.map(p=>p.endDate).sort().slice(-1)[0]};
}
// 紐付いた店舗ごとのヘルプ勤務（myHelperDaysOf）と、読めていない他店があるか
function myHelperByHomeOf(okLinks,shops,subs,helper,o){
  const x=o||{};const out={};
  okLinks.forEach(l=>{
    const sh=shops[l.shopId];const hs=helper.state[l.shopId];
    if(!sh||!sh.ok||!hs)return;
    const hd=myHelperDaysOf({shopId:l.shopId,name:l.name,periods:sh.periods,subsByPeriod:mySubsByPeriodOf(l.shopId,sh,subs),settings:sh.settings,staff:sh.staff,
      todayStr:x.todayStr,premium:x.premium,companyLink:hs.companyLink,otherShops:hs.otherShops,overrides:x.overrides});
    out[l.shopId]={...hd,unread:hd.unread||!!hs.failed};
  });
  return out;
}

// ===== 本人のデータ（2026-10-04・第2部 E4）=====
// users/{uid}/workplaces・shifts・overrides を1回読み、書いたら手元の状態を合わせる（購読しない＝本人の端末からしか書かれない）。
// MyView が1つ持ち、マイシフトと設定タブが共有する。書くのは users/{uid}/ の下だけ（店舗のデータには書かない）。
// 引数は本人の基点（users/{uid} か staffPageData/{pageToken}・2026-10-04）。個別URLは別の端末からも書かれうるが、開き直しで読み直す
// workplaces は update（E5 が同じレコードに pay を足すので set() で消さない）、shifts・overrides は1件ずつの set。
const myRand=n=>{const a=new Uint8Array(n);(window.crypto||window.msCrypto).getRandomValues(a);return Array.from(a);};
function myWriteError(e){return isPermissionDeniedError(e)?"保存できませんでした（サーバー側の設定が未反映の可能性があります）":"保存できませんでした。通信状態を確認してもう一度お試しください";}
function useMyPersonal(base){
  const[d,setD]=useState({state:"loading",workplaces:{},shifts:{},overrides:{}});
  useEffect(()=>{
    if(!base||!firebaseDB)return;
    let alive=true;
    Promise.all(["workplaces","shifts","overrides"].map(k=>_myRead(`${base}/${k}`))).then(([w,s,o])=>{
      if(!alive)return;
      const ok=w.ok&&s.ok&&o.ok;
      setD({state:ok?"ok":"error",workplaces:(w.ok&&w.v)||{},shifts:(s.ok&&s.v)||{},overrides:(o.ok&&o.v)||{}});
    });
    return()=>{alive=false;};
  },[base]);
  // patch は {"workplaces/x": …} の形（base からの相対パス・null で削除）。成功したら手元の状態にも同じ形で当てる
  const apply=async patch=>{
    try{await fbUpd(base,patch);}
    catch(e){console.warn("マイシフト: 保存に失敗:",e&&e.code);return{error:myWriteError(e)};}
    setD(prev=>{
      const next={...prev,workplaces:{...prev.workplaces},shifts:{...prev.shifts},overrides:{...prev.overrides}};
      Object.entries(patch).forEach(([k,v])=>{
        const parts=k.split("/");const top=parts[0];
        if(parts.length===2){if(v==null)delete next[top][parts[1]];else next[top][parts[1]]=v;}
        else if(parts.length===3&&top==="overrides"){
          const inner={...(next.overrides[parts[1]]||{})};
          if(v==null)delete inner[parts[2]];else inner[parts[2]]=v;
          if(Object.keys(inner).length)next.overrides[parts[1]]=inner;else delete next.overrides[parts[1]];
        }else if(parts.length===3&&top==="workplaces"){
          const r={...(next.workplaces[parts[1]]||{})};if(v==null)delete r[parts[2]];else r[parts[2]]=v;next.workplaces[parts[1]]=r;
        }
      });
      return next;
    });
    return{ok:true};
  };
  return{
    ...d,
    // 勤務先の名前と色。フィールド単位の update（pay など他のフィールドを消さない）
    saveWorkplace:(id,fields)=>{const p={};Object.entries(fields).forEach(([k,v])=>{p[`workplaces/${id}/${k}`]=v;});return apply(p);},
    // 勤務先を消す。手入力の勤務先はそのシフトも、リンク解除済みの店舗はその実績の上書きも一緒に消す
    deleteWorkplace:(id,o)=>{
      const p={[`workplaces/${id}`]:null};
      (o&&o.shiftIds||[]).forEach(s=>{p[`shifts/${s}`]=null;});
      if(o&&o.overridesShopId)p[`overrides/${o.overridesShopId}`]=null;
      return apply(p);
    },
    saveShift:(id,rec)=>apply({[`shifts/${id}`]:rec}),
    deleteShift:id=>apply({[`shifts/${id}`]:null}),
    saveOverride:(sid,date,rec)=>apply({[`overrides/${sid}/${date}`]:rec}),
    newWorkplaceId:()=>genMyRecordId("m_",8,myRand),
    newShiftId:()=>genMyRecordId("h_",10,myRand),
  };
}
// .ics をダウンロードさせる（iPhone の Safari は text/calendar を開くとカレンダーへの追加を案内する）
function myDownloadIcs(text,fileName){
  const blob=new Blob([text],{type:"text/calendar;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=fileName;document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

// 時刻は時と分の2列ホイールで1分刻み（2026-10-05 ユーザー指示。以前は15分刻みのプルダウン）。0:00〜30:00＝24時超え表記を含む。
// 空のときに開くと defaultValue の位置から始まる。値は保存時に検証する
function MyTimeInput({label,value,onChange,name,defaultValue}){
  const parsed=parseMyClockInput(value);
  return(
    <div style={{marginBottom:12}}>
      <span style={MY_LABEL}>{label}</span>
      <TimeWheelField name={name} value={parsed||""} options={MY_TIME_WHEEL_VALUES} onChange={onChange} title={label}
        fmt={v=>fmtMyClock(_myClockMin(v))} defaultValue={defaultValue} style={{...AI,display:"block",cursor:"pointer"}}/>
    </div>
  );
}
// 休憩（分）は0〜180分の15分刻みのプルダウンだけ。空は 0分。今の値が刻みに無ければ足す（myBreakSelectOptions）
function MyMinutesInput({label,value,onChange,name}){
  const n=parseMyMinutesInput(value);
  const opts=myBreakSelectOptions(value);
  return(
    <label style={{display:"block",marginBottom:12}}>
      <span style={MY_LABEL}>{label}</span>
      <select data-my-select={name} value={String(n==null?0:n)} onChange={e=>onChange(e.target.value)} style={AI}>
        {opts.map(t=><option key={t} value={String(t)}>{t}分</option>)}
      </select>
    </label>
  );
}
// 開始・終了・休憩の3欄と、日をまたぐ入力の言い直し（「26:00 にする」）
function MyTimesFields({f,set,err}){
  return(
    <>
      <MyTimeInput label="開始" name="start" value={f.start} onChange={v=>set("start",v)} defaultValue="09:00"/>
      <MyTimeInput label="終了" name="end" value={f.end} onChange={v=>set("end",v)}
        defaultValue={_myClockMin(f.start)!=null?myClockStr(Math.min(MY_CLOCK_MAX_MIN,_myClockMin(f.start)+60)):"18:00"}/>
      <MyMinutesInput label="休憩（分）" name="breakMin" value={f.breakMin} onChange={v=>set("breakMin",v)}/>
      {err&&err.error&&<MyMessage error={err.error}/>}
      {err&&err.suggestEnd&&<button data-my-action="useSuggestEnd" onClick={()=>set("end",err.suggestEnd)} style={{...AGray,marginBottom:12}}>終了を {fmtMyClock(_myClockMin(err.suggestEnd))} にする</button>}
    </>
  );
}
const _myClockMin=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||""));return m?(+m[1])*60+(+m[2]):null;};
const _myInputOfMin=min=>min==null?"":myClockStr(min);

// 手入力のシフトの追加・編集。manualList は手入力の勤務先（myWorkplaceList の kind "manual"）
function MyManualShiftForm({personal,manualList,date,editing,onDone}){
  const init=editing?{workplaceId:editing.workplaceId,date:editing.date,start:_myInputOfMin(editing.startMin),end:_myInputOfMin(editing.endMin),breakMin:String(editing.breakMin||0),memo:editing.memo||""}
    :{workplaceId:(manualList[0]||{}).id||"",date,start:"",end:"",breakMin:"",memo:""};
  const[f,setF]=useState(init);
  const[err,setErr]=useState(null);
  const[busy,setBusy]=useState(false);
  const set=(k,v)=>{setF(p=>({...p,[k]:v}));setErr(null);};
  const ids=manualList.map(w=>w.id);
  const save=async(input)=>{
    const x=input||f;
    const e=validateMyShiftInput(x,{workplaceIds:ids});
    if(e){setErr(e);return;}
    const rec=buildMyShiftRecord(x);
    if(myShiftDuplicateOf(personal.shifts,rec,editing&&editing.shiftId)){setErr({error:"同じ日・同じ時間のシフトが既にあります"});return;}
    setBusy(true);
    const r=await personal.saveShift(editing?editing.shiftId:personal.newShiftId(),rec);
    setBusy(false);
    if(r.error){setErr({error:r.error});return;}
    onDone(editing?"シフトを直しました":"シフトを追加しました");
  };
  const hist=f.workplaceId?myShiftHistoryCandidates(personal.shifts,f.workplaceId,5):[];
  return(
    <div data-my-manual-form={editing?"edit":"add"} style={{borderTop:"1px solid var(--c-border)",paddingTop:12,marginTop:8}}>
      <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)",marginBottom:10}}>{editing?"シフトを直す":"シフトを追加"}</div>
      <label style={{display:"block",marginBottom:12}}>
        <span style={MY_LABEL}>勤務先</span>
        <select data-my-select="workplace" value={f.workplaceId} onChange={e=>set("workplaceId",e.target.value)} style={AI}>
          {manualList.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      {!editing&&hist.length>0&&<div data-my-history="1" style={{marginBottom:12}}>
        <div style={MY_LABEL}>履歴から追加（{myFmtDate(f.date)}に入ります）</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {hist.map(h=><button key={h.label} data-my-history-pick={`${h.start}-${h.end}-${h.breakMin}`} disabled={busy}
            onClick={()=>save({...f,start:h.start,end:h.end,breakMin:String(h.breakMin)})}
            style={{...AGray,padding:"8px 12px",fontSize:14,fontVariantNumeric:"tabular-nums"}}>{h.label}</button>)}
        </div>
      </div>}
      <MyField label="日付" type="date" value={f.date} data-my-input="date" onChange={e=>set("date",e.target.value)}/>
      <MyTimesFields f={f} set={set} err={err}/>
      <MyField label="メモ（任意）" value={f.memo} maxLength={MY_SHIFT_MEMO_MAX} data-my-input="memo" onChange={e=>set("memo",e.target.value)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button data-my-action="saveManual" disabled={busy} onClick={()=>save()} style={{...AB,opacity:busy?.6:1}}>{busy?"保存中…":"保存"}</button>
        <button data-my-action="cancelManual" onClick={()=>onDone(null)} style={AGray}>やめる</button>
      </div>
    </div>
  );
}
// 公開済みのシフトへの実績の上書き。公開内容と同じ値で保存すると上書きを消す
// 2026-10-04 ユーザー指示: 本人が入れた時間は**給料計算にだけ**使う。シフトの表示（カレンダー・日付の詳細・次のシフト・.ics・全員の表）は
// 管理者が公開した時間のまま。入力欄の初期値は、実績があればその値、無ければ公開の時間
function MyOverrideForm({personal,entry,onDone}){
  const cur=entry.overridden&&entry.actual?entry.actual:entry.sched||entry;
  const[f,setF]=useState({start:_myInputOfMin(cur.startMin),end:_myInputOfMin(cur.endMin),breakMin:String(cur.breakMin||0)});
  const[err,setErr]=useState(null);
  const[busy,setBusy]=useState(false);
  const set=(k,v)=>{setF(p=>({...p,[k]:v}));setErr(null);};
  const save=async()=>{
    const r=planMyOverride(f,entry.sched);
    if(r.error){setErr(r);return;}
    setBusy(true);
    const w=await personal.saveOverride(entry.shopId,entry.date,r.remove?null:r.record);
    setBusy(false);
    if(w.error){setErr({error:w.error});return;}
    onDone(r.remove?"実績を消しました（給料は公開された時間で計算します）":"実績を保存しました（給料の計算にだけ使います）");
  };
  return(
    <div data-my-override-form="1" style={{borderTop:"1px solid var(--c-border)",paddingTop:12,marginTop:8}}>
      <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)",marginBottom:4}}>給料計算に使う実際の時間</div>
      <div data-my-override-note="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>
        公開された時間: {fmtMyRange(entry.sched)}{entry.sched.breakMin>0?`（休憩${entry.sched.breakMin}分）`:""}。入れた時間は給料の見込みの計算にだけ使います。シフトの表示は公開された時間のままで、お店には送られません。
      </div>
      <MyTimesFields f={f} set={set} err={err}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button data-my-action="saveOverride" disabled={busy} onClick={save} style={{...AB,opacity:busy?.6:1}}>{busy?"保存中…":"保存"}</button>
        <button data-my-action="cancelOverride" onClick={()=>onDone(null)} style={AGray}>やめる</button>
      </div>
    </div>
  );
}

// お店が出したシフトは公開でも「確定」と出す（2026-10-05 ユーザー指示「提出だけが未確定なので、公開ではなく確定に合わせる」）
const MY_KIND_LABEL={published:"確定",confirmed:"確定",submitted:"提出済み（未確定）",manual:"手入力"};
// 開いている編集欄を entry に結びつける鍵（entry は読み込みのたびに作り直されるので参照では比べない）
function myEntryKey(e){return`${e.kind}|${e.shiftId||e.shopId||""}|${e.periodId||""}|${e.date}`;}
function myEntryState(e){return e.kind==="submitted"?"submitted":e.kind==="manual"?"manual":e.confirmed?"confirmed":"published";}
function myFmtDate(ds){const d=pd(ds);return isNaN(d)?ds:`${d.getMonth()+1}/${d.getDate()}(${WD[d.getDay()]})`;}

// 日付の詳細の1件。actions は E4 の操作（実績の入力・手入力の編集と削除）。Premium でないとき（canEdit=false）は
// 追加・編集を出さず、消すこと（実績の上書きを戻す・手入力のシフトを削除）だけを出す＝入れたデータは表示し、自分で消せる
function MyShiftEntryRow({e,changed,actions}){
  const grey=e.kind==="submitted";
  const state=myEntryState(e);
  const small={...AGray,padding:"6px 12px",fontSize:13,whiteSpace:"nowrap"};
  return(
    <div data-my-entry={state} data-my-entry-shop={e.shopId||e.workplaceId} data-my-entry-date={e.date} data-my-entry-overridden={e.overridden?"1":undefined}
      style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 0",borderTop:"1px solid var(--c-border)"}}>
      <span aria-hidden="true" style={{flex:"0 0 auto",width:10,height:10,borderRadius:5,marginTop:6,background:grey?"var(--c-text4)":e.color}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
          <span data-my-entry-time="1" style={{fontSize:17,fontWeight:700,color:grey?"var(--c-text3)":"var(--c-text)",fontVariantNumeric:"tabular-nums"}}>{fmtMyRange(e)||"時間未定"}</span>
          <span style={{fontSize:12,fontWeight:700,color:grey?"var(--c-text3)":"var(--c-text2)"}}>{MY_KIND_LABEL[state]}</span>
          {changed&&<span data-my-entry-changed="1" style={{fontSize:12,fontWeight:700,color:"var(--c-accent)"}}>変更あり</span>}
        </div>
        <div style={{fontSize:13,color:grey?"var(--c-text3)":"var(--c-text2)",lineHeight:1.6,overflowWrap:"anywhere"}}>
          {e.shopName}
          {!grey&&e.breakMin>0?` ／ 休憩${e.breakMin}分`:""}
          {!grey&&(e.segments||[]).filter(g=>g.extra).map(g=>` ／ 追加 ${fmtMyClock(g.startMin)}〜${fmtMyClock(g.endMin)}`).join("")}
        </div>
        {e.helper&&<div data-my-entry-helper={e.homeShopId} style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.6}}>ヘルプ勤務（{e.homeShopName||"所属店舗"}のシフト表）。給料は{e.homeShopName||"所属店舗"}の分として計算します</div>}
        {e.overridden&&e.actual&&<div data-my-entry-actual="1" style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.6}}>給料計算の実績 {fmtMyRange(e.actual)}{e.actual.breakMin>0?`（休憩${e.actual.breakMin}分）`:""}</div>}
        {!grey&&e.differs&&e.hope&&<div data-my-entry-hope="1" style={{fontSize:12,color:"var(--c-text3)"}}>希望 {fmtMyRange(e.hope)}</div>}
        {e.memo&&<div data-my-entry-memo="1" style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.6,overflowWrap:"anywhere"}}>{e.memo}</div>}
        {actions&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
          {e.kind==="published"&&actions.canEdit&&<button data-my-action="editOverride" onClick={actions.editOverride} style={small}>{e.overridden?"給料計算の実績を直す":"給料計算の実績を入力"}</button>}
          {e.kind==="published"&&e.overridden&&<button data-my-action="resetOverride" disabled={actions.busy} onClick={actions.resetOverride} style={small}>実績を消す</button>}
          {e.kind==="manual"&&actions.canEdit&&<button data-my-action="editManual" onClick={actions.editManual} style={small}>直す</button>}
          {e.kind==="manual"&&<button data-my-action="deleteManual" disabled={actions.busy} onClick={actions.deleteManual} style={small}>削除</button>}
        </div>}
      </div>
    </div>
  );
}

// TimeTree などのアプリで見るときの案内（折りたたみ。手順は端末ごと・事実の出どころは MY_ICS_APP_GUIDE の上の注記）
function MyIcsAppGuide(){
  const plat=myIcsPlatformOf(typeof navigator!=="undefined"?navigator.userAgent:"",typeof navigator!=="undefined"?navigator.maxTouchPoints:0);
  const G=MY_ICS_APP_GUIDE;
  return(
    <details data-my-ics-apps={plat} style={{marginTop:10,fontSize:13,color:"var(--c-text2)",lineHeight:1.7}}>
      <summary style={{cursor:"pointer",color:"var(--c-text2)",fontWeight:600,minHeight:32,display:"flex",alignItems:"center"}}>{G.title}</summary>
      <div style={{padding:"6px 0 2px"}}>
        <div style={{marginBottom:6}}>{G.intro}</div>
        <ol data-my-ics-steps="1" style={{margin:"0 0 6px",paddingLeft:20}}>{G.steps[plat].map((t,i)=><li key={i} style={{marginBottom:4,overflowWrap:"anywhere"}}>{t}</li>)}</ol>
        <div style={{color:"var(--c-text3)"}}>{G.note}</div>
      </div>
    </details>
  );
}
// ホーム画面から開いているか（iOS は navigator.standalone、ほかは display-mode）
function myIsStandalone(){
  try{return navigator.standalone===true||(typeof matchMedia==="function"&&matchMedia("(display-mode: standalone)").matches);}catch{return false;}
}
// カレンダーへ取り込む前の確認（文言と出す条件は app-my-utils.js の myCalendarPromptOf。ここは表示と操作だけ）
function MyCalendarPrompt({action,prompt,onProceed,onClose}){
  const panelRef=useRef(null);
  const[skip,setSkip]=useState(false);
  const[copy,setCopy]=useState("");
  const href=typeof location!=="undefined"?location.href:"";
  const remember=()=>{if(skip&&!prompt.required)ls(MY_CAL_PROMPT_LS,{...(lg(MY_CAL_PROMPT_LS,{})||{}),[myCalendarPromptKey(action,prompt)]:true});};
  const close=()=>{remember();onClose();};
  const closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{
    const prev=document.activeElement;
    if(panelRef.current)panelRef.current.focus();
    const onKey=ev=>{if(ev.key==="Escape"){ev.preventDefault();closeRef.current();}};
    document.addEventListener("keydown",onKey);
    return()=>{document.removeEventListener("keydown",onKey);try{if(prev&&prev.focus)prev.focus();}catch{/* 戻せないときは何もしない */}};
  },[]);
  const copyUrl=async()=>{
    try{await navigator.clipboard.writeText(href);setCopy("ok");}catch{setCopy("manual");}
  };
  const proceedLabel=prompt.required?"このまま書き出す":"書き出す";
  const titleId="my-cal-prompt-title";
  return(
    <div data-my-cal-overlay="1" onClick={close} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} data-my-cal-prompt={prompt.kind} data-my-cal-prompt-action={action}
        onClick={ev=>ev.stopPropagation()}
        style={{background:"var(--c-card)",borderRadius:12,padding:"18px 16px",width:"100%",maxWidth:420,maxHeight:"calc(100vh - 32px)",overflowY:"auto",outline:"none",
          boxShadow:"0 8px 24px var(--c-shadow)",color:"var(--c-text)",fontSize:14,lineHeight:1.7}}>
        <div id={titleId} style={{fontSize:16,fontWeight:700,marginBottom:8,overflowWrap:"anywhere"}}>{prompt.title}</div>
        {prompt.lead&&<div style={{color:"var(--c-text2)",marginBottom:8,overflowWrap:"anywhere"}}>{prompt.lead}</div>}
        {prompt.steps.length>0&&<ol data-my-cal-steps="1" style={{margin:"0 0 10px",paddingLeft:20,color:"var(--c-text2)"}}>
          {prompt.steps.map((t,i)=><li key={i} style={{marginBottom:4,overflowWrap:"anywhere"}}>{t}</li>)}
        </ol>}
        {copy==="ok"&&<div data-my-cal-copied="1" style={{fontSize:13,color:"var(--c-text2)",marginBottom:8}}>URL をコピーしました</div>}
        {copy==="manual"&&<div style={{marginBottom:8}}>
          <div style={{fontSize:13,color:"var(--c-text2)",marginBottom:4}}>コピーできませんでした。下の URL を長押ししてコピーしてください</div>
          <input data-my-input="calUrl" readOnly value={href} onFocus={ev=>ev.target.select()} style={{...AI,fontSize:16}}/>
        </div>}
        <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:6}}>
          {prompt.openLabel&&<button data-my-action="calOpenExternal" onClick={()=>{const u=myExternalBrowserUrl(href);if(u)location.href=u;}} style={{...AB,minHeight:44}}>{prompt.openLabel}</button>}
          {prompt.kind==="inApp"||prompt.kind==="iosOther"?<button data-my-action="calCopyUrl" onClick={copyUrl} style={{...AGray,minHeight:44}}>URL をコピー</button>:null}
          <button data-my-action="calProceed" onClick={()=>{remember();onProceed();}} style={prompt.required?{...AGray,minHeight:44}:{...AB,minHeight:44}}>{proceedLabel}</button>
          <button data-my-action="calClose" onClick={close} style={{...MY_LINK_BTN,minHeight:44,alignSelf:"center"}}>閉じる</button>
        </div>
        {!prompt.required&&<label style={{display:"flex",alignItems:"center",gap:8,marginTop:6,fontSize:13,color:"var(--c-text3)",cursor:"pointer",minHeight:44}}>
          <input type="checkbox" data-my-input="calSkip" checked={skip} onChange={ev=>setSkip(ev.target.checked)} style={{width:18,height:18,fontSize:16}}/>
          次から表示しない
        </label>}
      </div>
    </div>
  );
}
function MyShiftTab({me,onGoSettings,personal}){
  const base=me&&me.base;
  const P=personal||{state:"ok",workplaces:{},shifts:{},overrides:{}};
  const todayStr=fd(new Date());
  const[ym,setYm]=useState(todayStr.slice(0,7));
  const[sel,setSel]=useState(todayStr);
  const[seen,setSeen]=useState(undefined);     // {base}/seen（undefined=読み込み中・null=読めない）
  const baselineRef=useRef(new Set());
  useEffect(()=>{
    if(!base)return;
    let alive=true;
    _myRead(`${base}/seen`).then(r=>{if(alive)setSeen(r.ok?(r.v||{}):null);});
    return()=>{alive=false;};
  },[base]);
  // 表示中の月と今日以降にかかる期間の subs だけを読む（読んだ期間は覚えておき、月を戻っても読み直さない）
  const pick=useCallback(ps=>myShiftPeriodsToRead(ps,ym,todayStr),[ym,todayStr]);
  const{links,okLinks,badLinks,shops,subs}=useMyShiftSources(me,pick);
  const premium=myShiftPremiumOf(okLinks.map(l=>shops[l.shopId]&&shops[l.shopId].plan));
  // 勤務先の名前と色（E4）。Shifty の店舗は本人が付けた名前・色（無ければ店舗名と既定の色）、手入力の勤務先はその記録
  const wpList=useMemo(()=>myWorkplaceList(okLinks,P.workplaces),[okLinks,P.workplaces]);
  const manualList=wpList.filter(w=>w.kind==="manual");
  // ヘルプ先の勤務（2026-10-04 B）: 所属店舗が公開済みの期間の、PDF のシフト表どおりのヘルプ勤務。ヘルプ先の状態には関係しない
  const helper=useMyHelperSources(okLinks,shops,sh=>myRangeOfPeriods(pick(sh.periods)),premium);
  const helperByHome=useMemo(()=>myHelperByHomeOf(okLinks,shops,subs,helper,{todayStr,premium,overrides:P.overrides}),[okLinks,shops,subs,helper.state,todayStr,premium,P.overrides]);
  const helperUnread=Object.values(helperByHome).some(h=>h&&h.unread);
  const{entries,publishedKeys}=useMemo(()=>{
    const all=[];const keys=[];
    const helpers=[];
    okLinks.forEach(l=>{
      const sh=shops[l.shopId];
      if(!sh||!sh.ok)return;
      const w=wpList.find(x=>x.id===l.shopId)||{};
      const subsByPeriod=mySubsByPeriodOf(l.shopId,sh,subs);
      sh.periods.forEach(p=>{if(subsByPeriod[p.id]&&premium&&isPeriodPublished(p))keys.push(myShiftSeenKey(l.shopId,p.id));});
      all.push(...buildMyShiftDays({shopId:l.shopId,shopName:w.name||l.shopName,color:w.color||myWorkplaceColor(l.shopId,0),name:l.name,periods:sh.periods,
        subsByPeriod,settings:sh.settings,staff:sh.staff,todayStr,premium,overrides:(P.overrides||{})[l.shopId]}));
      const hd=helperByHome[l.shopId];
      if(hd)helpers.push(...myHelperShiftEntries(hd,{homeShopName:w.name||l.shopName,
        colorOf:sid=>{const x=wpList.find(v=>v.id===sid);return x?x.color:MY_WORKPLACE_COLORS[(okLinks.length+Object.keys(hd.byDate).length)%MY_WORKPLACE_COLORS.length];}}));
    });
    const merged=myMergeHelperEntries(all,helpers);
    merged.push(...buildMyManualDays(wpList,P.shifts));
    merged.sort(myEntryOrder);
    return{entries:merged,publishedKeys:keys};
  },[okLinks,shops,subs,premium,todayStr,wpList,P.shifts,P.overrides,helperByHome]);
  const fps=useMemo(()=>myPublishedFingerprints(entries,publishedKeys),[entries,publishedKeys]);
  const seenOf=k=>{const[sid,pid]=k.split("|");return seen&&seen[sid]?seen[sid][pid]:undefined;};
  // 初めて見る公開は「変更あり」にせず、今の内容を見たものとして記録する（前回の内容が無いと比べられないため）
  const writeSeen=(keys,label)=>{
    const now=new Date().toISOString();
    const patch={};
    keys.forEach(k=>{const[sid,pid]=k.split("|");patch[k]={sid,pid,rec:buildMySeenRecord(fps[k],now)};});
    setSeen(prev=>{const next={...(prev||{})};Object.values(patch).forEach(({sid,pid,rec})=>{next[sid]={...(next[sid]||{}),[pid]:rec};});return next;});
    Object.values(patch).forEach(({sid,pid,rec})=>{
      fbSet(`${base}/seen/${sid}/${pid}`,rec).catch(e=>console.warn(`マイシフト: ${label}の記録に失敗:`,e&&e.code));
    });
  };
  useEffect(()=>{
    if(!seen||!base)return; // 読めない（null）間は書かない（既にある記録を上書きしないため）
    const fresh=Object.keys(fps).filter(k=>seenOf(k)===undefined&&!baselineRef.current.has(k));
    if(!fresh.length)return;
    fresh.forEach(k=>baselineRef.current.add(k));
    writeSeen(fresh,"初回の表示");
  },[fps,seen,base]);
  const changed=useMemo(()=>{
    const out=[];
    Object.keys(fps).forEach(k=>{const d=myChangedDates(seenOf(k),fps[k]);if(d&&d.length)out.push({key:k,dates:d});});
    return out;
  },[fps,seen]);
  const changedSet=new Set(changed.flatMap(c=>c.dates.map(d=>c.key+"|"+d)));
  const isChanged=e=>e.kind==="published"&&changedSet.has(myShiftSeenKey(e.shopId,e.periodId)+"|"+e.date);
  const byDate=useMemo(()=>{const m={};entries.forEach(e=>{(m[e.date]=m[e.date]||[]).push(e);});return m;},[entries]);
  const next=nextMyShift(entries,todayStr);
  const grid=myMonthGrid(ym);
  const shopName=sid=>{const w=wpList.find(x=>x.id===sid);return w?w.name:"";};
  const loadingAny=links===undefined||okLinks.some(l=>!shops[l.shopId])||P.state==="loading";
  // E4 の操作（手入力・実績の入力・.ics）は Premium のときだけ。本人のデータが読めないときも止める（重複の判定ができないため）
  const canEdit=premium&&P.state==="ok";
  const[form,setForm]=useState(null); // {type:"add"} | {type:"editManual",key} | {type:"override",key}（key は myEntryKey）
  const[dayMsg,setDayMsg]=useState({});
  const[busy,setBusy]=useState("");
  const[icsMsg,setIcsMsg]=useState({});
  useEffect(()=>{setForm(null);setDayMsg({});},[sel]);
  useEffect(()=>{setIcsMsg({});},[ym]);
  const formDone=msg=>{setForm(null);setDayMsg(msg?{ok:msg}:{});};
  const resetOverride=async e=>{
    setBusy("ov");setDayMsg({});
    const r=await P.saveOverride(e.shopId,e.date,null);
    setBusy("");setDayMsg(r.error?{error:r.error}:{ok:"実績を消しました（給料は公開された時間で計算します）"});
  };
  const deleteManual=async e=>{
    if(!window.confirm(`${myFmtDate(e.date)} ${e.shopName} ${fmtMyRange(e)} のシフトを削除しますか？`))return;
    setBusy("del");setDayMsg({});
    const r=await P.deleteShift(e.shiftId);
    setBusy("");setDayMsg(r.error?{error:r.error}:{ok:"シフトを削除しました"});
  };
  // カレンダーへ取り込む前に、この端末・ブラウザで追加の操作が要るときだけ確認を出す（myCalendarPromptOf）
  const[calPrompt,setCalPrompt]=useState(null); // {action, prompt, run}
  const calEnv=()=>myCalendarEnvOf({ua:navigator.userAgent,maxTouchPoints:navigator.maxTouchPoints,standalone:myIsStandalone()});
  const withCalPrompt=(action,run)=>{
    const p=myCalendarPromptOf(calEnv(),action,{needsLogin:/^#\/me(\/|$)/.test(location.hash)});
    if(!myCalendarPromptShown(p,action,lg(MY_CAL_PROMPT_LS,{})||{})){run(false);return;}
    setCalPrompt({action,prompt:p,run});
  };
  const writeIcs=prompted=>{
    const list=myIcsEntriesForMonth(entries,ym);
    const{text,count}=buildMyIcs(list,{nowIso:new Date().toISOString()});
    myDownloadIcs(text,`shifty-${ym}.ics`);
    // 渡し方は全端末で同じ（a[download]＋blob。iOS 27 の Safari ではこれで「n件の予定 / すべて追加」の画面が直接出ることをシミュレーターで確認済み。
    // ホーム画面から開いた状態でも同じ画面が出る）。端末ごとに変えるのは書き出した後の案内だけ。確認を出したときは手順を見せたので案内を重ねない
    const env=calEnv();
    const tail=prompted?"":MY_ICS_HINTS[env.platform]+(env.platform==="ios"&&env.standalone?MY_ICS_STANDALONE_NOTE:"");
    setIcsMsg({ok:`${count}件のシフトを書き出しました。${tail}`});
  };
  const downloadIcs=()=>{
    if(!myIcsEntriesForMonth(entries,ym).length){setIcsMsg({error:"この月に取り込めるシフトがありません（公開済みと手入力のシフトだけが入ります）"});return;}
    withCalPrompt("ics",writeIcs);
  };

  if(links===null)return <MyEmptyState><MyMessage error="お店とのリンクを読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/></MyEmptyState>;
  // リンクと本人のデータを読み終えるまでは、カレンダーと下の案内（申請しました・リンクの案内）のどちらを出すかが決まらない。
  // 決まる前にカレンダーを描くと、登録の直後（リンクがまだ無い）にカレンダーが一瞬出てから「申請しました」に切り替わる（2026-10-08 ユーザー報告）
  if(links===undefined||(!okLinks.length&&P.state==="loading"))return <MyEmptyState><div data-my-loading="1">読み込み中…</div></MyEmptyState>;
  const hasManual=manualList.length>0||Object.keys(P.shifts||{}).length>0;
  // 登録と同時に送ったリンクの申請（myAutoLinkRequest）。承認されるまで「申請しました」を出す
  const linkReq=(()=>{try{const v=JSON.parse(ssGet(SS_MY_LINK_REQ,null)||"null");return v&&v.shopId?v:null;}catch{return null;}})();
  if(Array.isArray(links)&&!okLinks.length&&P.state!=="loading"&&!hasManual)return(
    <MyEmptyState>
      {badLinks.length>0&&<div data-my-bad-links="1" style={{marginBottom:12}}>{badLinks.map(l=><div key={l.shopId} style={{color:"var(--c-danger)",fontSize:14}}>{l.shopName}: {l.reason==="unread"?"状態を確認できませんでした":MY_LINK_INVALID_LABELS[l.reason]}</div>)}</div>}
      {linkReq?<div data-my-link-requested={linkReq.shopId}>
        {linkReq.name||"お店"}にリンクを申請しました。お店の管理者が承認すると、ここに提出した希望とシフトが月のカレンダーで表示されます。
      </div>:<>
        勤務先の店舗とアカウントのリンクが済むと、ここに提出した希望と公開されたシフトが月のカレンダーで表示されます。
        {onGoSettings&&<button data-my-action="goLinks" onClick={onGoSettings} style={{...MY_LINK_BTN,display:"block",marginTop:8}}>設定でお店とリンクする</button>}
      </>}
    </MyEmptyState>
  );
  const selEntries=byDate[sel]||[];
  const navBtn={background:"none",border:"1px solid var(--c-border2)",borderRadius:8,minWidth:44,minHeight:40,fontSize:18,color:"var(--c-text2)",cursor:"pointer"};
  return(
    <div data-my-shift="1">
      {/* 次のシフト（今日以降で最も近い公開済みの出勤） */}
      <section style={{...MY_SECTION,padding:"14px 16px"}} data-my-next={next?next.date:"none"}>
        <div style={MY_LABEL}>次のシフト</div>
        {next?(
          <div>
            <div style={{fontSize:20,fontWeight:700,color:"var(--c-text)",fontVariantNumeric:"tabular-nums"}}>{myFmtDate(next.date)} {fmtMyRange(next)}</div>
            <div style={{fontSize:13,color:"var(--c-text2)",marginTop:2,overflowWrap:"anywhere"}}>{next.shopName} ／ {MY_KIND_LABEL[myEntryState(next)]}{isChanged(next)?" ／ 変更あり":""}</div>
          </div>
        ):(
          <div style={{fontSize:14,color:"var(--c-text3)",lineHeight:1.7}}>{loadingAny?"読み込み中…":premium?"公開されている次のシフトはまだありません。":"お店がシフトを公開すると、ここに次の出勤が出ます。"}</div>
        )}
      </section>

      {changed.length>0&&(
        <section data-my-changed="1" style={{...MY_SECTION,padding:"14px 16px",borderColor:"var(--c-accent)"}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>公開後にシフトが変更されました</div>
          {changed.map(c=>{const[sid]=c.key.split("|");return(
            <div key={c.key} data-my-changed-key={c.key} style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.7,overflowWrap:"anywhere"}}>{shopName(sid)}: {c.dates.map(myFmtDate).join("・")}</div>
          );})}
          <button data-my-action="seenChanges" onClick={()=>writeSeen(changed.map(c=>c.key),"確認")} style={{...AGray,marginTop:10}}>確認した</button>
        </section>
      )}

      {badLinks.length>0&&<div data-my-bad-links="1" style={{fontSize:13,color:"var(--c-danger)",lineHeight:1.7,marginBottom:12}}>
        {badLinks.map(l=><div key={l.shopId}>{l.shopName}: {l.reason==="unread"?"状態を確認できませんでした":MY_LINK_INVALID_LABELS[l.reason]}</div>)}
      </div>}
      {helperUnread&&<div data-my-helper-note="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:12}}>
        ほかのお店でのヘルプ勤務の一部を読み込めませんでした。カレンダーに出ていない勤務があるかもしれません
      </div>}
      {!premium&&!loadingAny&&<div data-my-premium-note="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:12}}>
        お店がプレミアムプランのとき、公開されたシフトが確定した時間で表示されます。いまは提出した希望だけを表示しています。
        手入力のシフトの追加・実績の入力・カレンダーへの取り込みも、プレミアムプランのお店とリンクしている間に使えます（入れたシフトは表示されます）。
      </div>}
      {P.state==="error"&&<div data-my-personal-error="1" style={{marginBottom:12}}><MyMessage error="手入力のシフトと実績を読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/></div>}

      <section style={{...MY_SECTION,padding:"12px 8px 8px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 4px 10px"}}>
          <button data-my-month-nav="prev" aria-label="前の月" onClick={()=>setYm(m=>myShiftMonth(m,-1))} style={navBtn}>‹</button>
          <div data-my-month={ym} style={{fontSize:16,fontWeight:700,color:"var(--c-text)"}}>{Number(ym.slice(0,4))}年{Number(ym.slice(5,7))}月</div>
          <button data-my-month-nav="next" aria-label="次の月" onClick={()=>setYm(m=>myShiftMonth(m,1))} style={navBtn}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",textAlign:"center",fontSize:12,color:"var(--c-text3)",paddingBottom:4}}>
          {WD.map((w,i)=><div key={w} style={{color:i===0?"var(--c-danger)":"var(--c-text3)"}}>{w}</div>)}
        </div>
        {grid.map((w,wi)=>(
          <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))"}}>
            {w.map(c=>{
              const es=byDate[c.date]||[];
              const isSel=c.date===sel;const isToday=c.date===todayStr;
              const ch=es.some(isChanged);
              return(
                <button key={c.date} data-my-cal-day={c.date} data-my-cal-kinds={es.map(myEntryState).join(",")} aria-pressed={isSel}
                  onClick={()=>setSel(c.date)}
                  style={{minWidth:0,minHeight:52,padding:"4px 0",background:"none",border:"none",borderRadius:8,cursor:"pointer",
                    boxShadow:isSel?"inset 0 0 0 2px var(--c-accent)":"none",opacity:c.inMonth?1:.4,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <span style={{fontSize:14,fontWeight:isToday?800:500,color:"var(--c-text)",textDecoration:isToday?"underline":"none",fontVariantNumeric:"tabular-nums"}}>{Number(c.date.slice(8))}</span>
                  <span style={{display:"flex",gap:3,justifyContent:"center",minHeight:6}}>
                    {es.slice(0,3).map((e,i)=><span key={i} data-my-dot={myEntryState(e)} style={{width:6,height:6,borderRadius:3,background:e.kind==="submitted"?"var(--c-text4)":e.color}}/>)}
                  </span>
                  {ch&&<span data-my-cal-changed="1" style={{fontSize:9,fontWeight:700,color:"var(--c-accent)",lineHeight:1}}>変更</span>}
                </button>
              );
            })}
          </div>
        ))}
      </section>

      {canEdit&&<div style={{padding:"0 4px 12px"}}>
        <button data-my-action="ics" onClick={downloadIcs} style={{...AGray,width:"100%"}}>この月のシフトをカレンダーに取り込む（.ics）</button>
        <MyMessage {...icsMsg}/>
      </div>}
      {calPrompt&&<MyCalendarPrompt action={calPrompt.action} prompt={calPrompt.prompt}
        onProceed={()=>{const r=calPrompt.run;setCalPrompt(null);r(true);}} onClose={()=>setCalPrompt(null)}/>}

      <section style={{...MY_SECTION,padding:"14px 16px"}} data-my-day={sel}>
        <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)"}}>{myFmtDate(sel)}</div>
        {selEntries.length?selEntries.map((e,i)=>{
          const canTouch=canEdit||e.overridden||e.kind==="manual";
          const actions=e.kind!=="submitted"&&canTouch&&P.state==="ok"?{canEdit,busy:!!busy,
            editOverride:()=>{setDayMsg({});setForm({type:"override",key:myEntryKey(e)});},resetOverride:()=>resetOverride(e),
            editManual:()=>{setDayMsg({});setForm({type:"editManual",key:myEntryKey(e)});},deleteManual:()=>deleteManual(e)}:null;
          const open=!!form&&form.key===myEntryKey(e);
          return(
            <div key={myEntryKey(e)+"|"+i}>
              <MyShiftEntryRow e={e} changed={isChanged(e)} actions={open?null:actions}/>
              {open&&form.type==="override"&&<MyOverrideForm personal={P} entry={e} onDone={formDone}/>}
              {open&&form.type==="editManual"&&<MyManualShiftForm personal={P} manualList={manualList} date={sel} editing={e} onDone={formDone}/>}
            </div>
          );
        }):<div style={{fontSize:14,color:"var(--c-text3)",paddingTop:8}}>{loadingAny?"読み込み中…":"シフトはありません"}</div>}
        {form&&form.type==="add"&&<MyManualShiftForm personal={P} manualList={manualList} date={sel} onDone={formDone}/>}
        <MyMessage {...dayMsg}/>
        {canEdit&&!form&&(manualList.length?(
          <button data-my-action="addManual" onClick={()=>{setDayMsg({});setForm({type:"add"});}} style={{...AGray,marginTop:10}}>＋ ほかの勤務先のシフトを追加</button>
        ):(
          <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginTop:10}}>
            Shifty を使っていないお店で働いているときは、設定で勤務先を追加するとシフトを入れられます。
            {onGoSettings&&<button data-my-action="goWorkplaces" onClick={onGoSettings} style={{...MY_LINK_BTN,display:"block"}}>勤務先を追加する</button>}
          </div>
        ))}
      </section>
      {wpList.filter(w=>w.linked||w.kind==="manual").length>1&&<div data-my-legend="1" style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:12,color:"var(--c-text3)",padding:"0 4px"}}>
        {wpList.filter(w=>w.linked||w.kind==="manual").map(w=><span key={w.id} style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:4,background:w.color}}/>{w.name}</span>)}
      </div>}
      {/* 「TimeTree などのアプリで見るには」はマイシフトの一番下（2026-10-04 ユーザー指示）。書き出しのボタンはカレンダーの下のまま */}
      {canEdit&&<div data-my-ics-apps-wrap="1" style={{padding:"4px 4px 0"}}><MyIcsAppGuide/></div>}
    </div>
  );
}
// ===== 設定タブ → 勤務先（2026-10-04・第2部 E4）=====
// Shifty の店舗（紐付いた店舗）と手入力の勤務先の一覧・追加・名前と色の変更・削除。
// E5 はこの編集欄（MyWorkplaceEditor）に給料設定（workplaces/{id}.pay）を足す。
// 紐付いた店舗のプラン（Premium の判定）は readMyShiftShop と同じ規則で読む
async function readMyLinksWithPlans(me){
  const links=await me.links();
  if(!Array.isArray(links))return{links,plans:[]};
  const plans=await Promise.all(links.filter(l=>l&&l.ok).map(l=>_myRead(`accounts/${l.shopId}/plan`).then(r=>DEV_PLAN_OVERRIDE||(r.ok&&["free","pro","premium"].includes(r.v)?r.v:"free"))));
  return{links,plans};
}
function MyColorPicker({value,onChange}){
  return(
    <div role="radiogroup" aria-label="色" style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
      {MY_WORKPLACE_COLORS.map(c=>{const on=c===value;return(
        <button key={c} role="radio" aria-checked={on} aria-label={`色 ${c}`} data-my-color={c} onClick={()=>onChange(c)}
          style={{width:40,height:40,borderRadius:20,background:c,border:"none",cursor:"pointer",boxShadow:on?"0 0 0 3px var(--c-card),0 0 0 5px var(--c-text)":"none"}}/>
      );})}
    </div>
  );
}
// ===== 会社設定の賃金（2026-10-04・第2部 E6）=====
// CF getMyPay が、紐付いた店舗の賃金マスタ（shops/{sid}/private/pay/{登録名}）のうち本人の分だけを返す（名前は渡さない＝staffLinks が正）。
// 会社設定があれば時給・月給・手当・交通費はそれを使い、本人の画面では変更できない。締日・給料日は賃金マスタに無いので本人が決める。
// CF が使えない（未デプロイ・通信・dev は Spark で CF が無い）ときは本人の設定にフォールバックし、その旨を出す。
// 結果は uid と店舗ごとに覚える（読み込みのたびに呼ばない）。失敗は覚えない（次に開いたときにやり直す）
const _myCompanyPayCache=new Map();
function readMyCompanyPay(uid,sid){
  const k=uid+"|"+sid;
  if(!_myCompanyPayCache.has(k)){
    const pr=myCallCF("getMyPay",{shopId:sid}).then(myCompanyPayOf,()=>myCompanyPayOf({error:"failed"}));
    _myCompanyPayCache.set(k,pr);
    pr.then(v=>{if(v.state!=="ok")_myCompanyPayCache.delete(k);});
  }
  return _myCompanyPayCache.get(k);
}
// {shopId: {state:"ok"|"error", pay, homeShopId, homeShopName}}。読み込み中の店舗はキーが無い
function useMyCompanyPays(me,okLinks){
  const[m,setM]=useState({});
  const ids=(okLinks||[]).map(l=>l.shopId).join(",");
  // 個別URLは暗証番号で開いたときに賃金が届く（me.payKey が変わる）ので、それも読み直しの鍵にする
  const key=me?`${me.key}|${me.payKey||""}`:"";
  useEffect(()=>{
    if(!me||!ids)return;
    let alive=true;
    setM({});
    ids.split(",").forEach(sid=>{me.companyPay(sid).then(v=>{if(alive)setM(p=>p[sid]===v?p:{...p,[sid]:v});});});
    return()=>{alive=false;};
  },[key,ids]);
  return m;
}

// ===== 給料設定（2026-10-04・第2部 E5）=====
// 締日・給料日（当月／翌月・日・土日祝の扱い）・時給／日給・交通費。手入力の勤務先は深夜25%・1日8時間超25%のオン／オフ。
// 保存は workplaces/{id}/pay（勤務先の名前・色と同じ update）。会社が賃金を登録していれば（E6・company.pay）時給と交通費は入力させない
const MY_PAY_DAY_OPTIONS=(()=>{const a=[];for(let d=1;d<=MY_PAY_END_DAY;d++)a.push({value:String(d),label:myPayDayLabel(d)});return a;})();
const MY_SELECT={...AI,minHeight:44};
function MySelect({label,value,onChange,options,name,style}){
  return(
    <label style={{display:"block",marginBottom:14,minWidth:0,...(style||{})}}>
      <span style={MY_LABEL}>{label}</span>
      <select data-my-input={name} value={value} onChange={e=>onChange(e.target.value)} style={MY_SELECT}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function MyCheck({label,checked,onChange,name}){
  return(
    <label style={{display:"flex",alignItems:"center",gap:10,minHeight:44,fontSize:15,color:"var(--c-text)",cursor:"pointer"}}>
      <input type="checkbox" data-my-input={name} checked={checked} onChange={e=>onChange(e.target.checked)} style={{width:20,height:20,fontSize:16}}/>
      {label}
    </label>
  );
}
// 会社が登録した賃金の固定表示（E6）。変更はできない
function MyCompanyPayView({pay}){
  if(!pay)return null;
  const v=normalizePayVersion(pay);
  const row=(k,val)=><div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"4px 0",fontSize:14}}><span style={{color:"var(--c-text3)"}}>{k}</span><span style={{color:"var(--c-text)",fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{val}</span></div>;
  return(
    <div data-my-company-pay={v.payType} style={{border:"1px solid var(--c-border2)",borderRadius:10,padding:"10px 12px",marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:"var(--c-text2)",marginBottom:4}}>会社設定（お店が登録した賃金・変更できません）</div>
      {row(v.payType==="hourly"?"時給":"月給（基本給）",fmtMyYen(v.base))}
      {v.payType==="monthly"&&(v.allowances||[]).map((a,i)=><React.Fragment key={i}>{row(a.name||"手当",fmtMyYen(a.amount))}</React.Fragment>)}
      {v.payType==="monthly"&&v.fixedOt&&v.fixedOt.hours>0&&row("固定残業",`${v.fixedOt.hours}時間・${fmtMyYen(v.fixedOt.amount)}`)}
      {row("交通費",v.commute&&v.commute.amount>0?`${fmtMyYen(v.commute.amount)}／${v.commute.per==="day"?"日":"月"}`:"なし")}
      {v.effectiveFrom&&row("適用開始",v.effectiveFrom)}
    </div>
  );
}
function MyPayFields({kind,f,set,company,shopCal=null}){
  const cp=company&&company.pay;
  return(
    <div data-my-pay-fields={kind}>
      {/* お店が締日・給料日を登録していれば固定表示（本人の設定より優先・2026-10-05） */}
      {shopCal?<MyShopCalendarView cal={shopCal}/>:<div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:"0 12px"}}>
        <MySelect label="締日" name="closingDay" value={f.closingDay} onChange={v=>set({closingDay:v})} options={MY_PAY_DAY_OPTIONS}/>
        <MySelect label="給料日が土日祝なら" name="holidayRule" value={f.holidayRule} onChange={v=>set({holidayRule:v})}
          options={MY_PAY_HOLIDAY_RULES.map(k=>({value:k,label:MY_PAY_HOLIDAY_RULE_LABELS[k]}))}/>
        <MySelect label="給料日の月" name="payMonthOffset" value={f.payMonthOffset} onChange={v=>set({payMonthOffset:v})}
          options={[0,1,2].map(k=>({value:String(k),label:MY_PAY_OFFSET_LABELS[k]}))}/>
        <MySelect label="給料日" name="payDay" value={f.payDay} onChange={v=>set({payDay:v})} options={MY_PAY_DAY_OPTIONS}/>
      </div>}
      {cp?<MyCompanyPayView pay={cp}/>:(
        <>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,2fr) minmax(0,3fr)",gap:"0 12px"}}>
            <MySelect label="給与" name="wageType" value={f.wageType} onChange={v=>set({wageType:v})}
              options={MY_PAY_WAGE_TYPES.map(k=>({value:k,label:MY_PAY_WAGE_TYPE_LABELS[k]}))}/>
            <MyField label={`${MY_PAY_WAGE_TYPE_LABELS[f.wageType]||"時給"}（円）`} value={f.rate} inputMode="numeric" data-my-input="rate" placeholder="例 1200"
              onChange={e=>set({rate:e.target.value})}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,3fr) minmax(0,2fr)",gap:"0 12px"}}>
            <MyField label="交通費（円・任意）" value={f.commuteAmount} inputMode="numeric" data-my-input="commuteAmount" placeholder="例 500"
              onChange={e=>set({commuteAmount:e.target.value})}/>
            <MySelect label="交通費の単位" name="commutePer" value={f.commutePer} onChange={v=>set({commutePer:v})}
              options={[{value:"day",label:"1日あたり"},{value:"month",label:"1か月あたり"}]}/>
          </div>
        </>
      )}
      {kind==="manual"&&(f.wageType==="hourly")&&<div style={{marginBottom:10}}>
        <MyCheck label="深夜（22時〜5時）に25%を足す" name="night" checked={f.night} onChange={v=>set({night:v})}/>
        <MyCheck label="1日8時間を超えた分に25%を足す" name="over8" checked={f.over8} onChange={v=>set({over8:v})}/>
      </div>}
      {kind==="shifty"&&!cp&&<div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>
        時間外・深夜・法定休日の割増は、お店の労働時間制と割増率で計算します（日給は割増を含めません）。
      </div>}
    </div>
  );
}
// 一覧に出す給料設定の要約
function myPaySummaryText(pay,company,shopCal=null){
  const p=myPayOf(pay);
  const cp=company&&company.pay?normalizePayVersion(company.pay):null;
  const sc=normalizePayCalendar(shopCal);
  if(!p&&!cp&&!sc)return"";
  const parts=[];
  if(sc)parts.push(`${myPayDayLabel(sc.closingDay)}締め・${MY_PAY_OFFSET_LABELS[sc.payMonthOffset]}${myPayDayLabel(sc.payDay)}払い（お店の登録）`);
  else if(p)parts.push(`${myPayDayLabel(p.closingDay)}締め・${MY_PAY_OFFSET_LABELS[p.payMonthOffset]}${myPayDayLabel(p.payDay)}払い`);
  if(cp)parts.push(`会社設定 ${cp.payType==="hourly"?"時給":"月給"}${fmtMyYen(cp.base)}`);
  else if(p&&p.rate>0)parts.push(`${MY_PAY_WAGE_TYPE_LABELS[p.wageType]}${fmtMyYen(p.rate)}`);
  return parts.join("・");
}
function MyWorkplaceEditor({w,personal,isNew,list,onDone,company,payLocked=false,shopCal=null}){
  const[f,setF]=useState({name:w?(w.kind==="shifty"?(w.rec&&w.rec.name)||"":w.name):"",color:w?w.color:myNextWorkplaceColor(list)});
  const hadPay=!!(w&&w.rec&&myPayOf(w.rec.pay));
  const[payOpen,setPayOpen]=useState(hadPay);
  const[pf,setPf]=useState(()=>myPayFormOf(w&&w.rec?w.rec.pay:null));
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);
  const kind=w?w.kind:"manual";
  const save=async(o)=>{
    const removePay=!!(o&&o.removePay);
    const e=validateMyWorkplaceInput(f,kind);
    if(e){setErr(e);return;}
    const ctx={kind,companyPay:!!(company&&company.pay)};
    if(payOpen&&!removePay&&!payLocked){const e2=validateMyPayInput(pf,ctx);if(e2){setErr(e2);return;}}
    setBusy(true);
    const id=w?w.id:personal.newWorkplaceId();
    const patch=buildMyWorkplacePatch(f,w||{kind:"manual"});
    // Shifty の店舗の記録がまだ無くても、ルールが要る kind・shopId・color は上の patch に入っている
    if(payLocked){/* 給料の設定に触らない（見えていない値を書き換えない） */}
    else if(removePay)patch.pay=null;
    else if(payOpen)patch.pay=buildMyPayRecord(pf,ctx,new Date().toISOString());
    const r=await personal.saveWorkplace(id,patch);
    setBusy(false);
    if(r.error){setErr(r.error);return;}
    onDone(removePay?"給料の設定を消しました":isNew?"勤務先を追加しました":"保存しました");
  };
  return(
    <div data-my-wp-editor={isNew?"new":w.id} style={{padding:"12px 0 4px"}}>
      <MyField label="名前" value={f.name} maxLength={MY_WORKPLACE_NAME_MAX} data-my-input="wpName" placeholder={kind==="shifty"?w.shopName:"例 カフェ（駅前）"}
        hint={kind==="shifty"?"空欄ならお店の名前で表示します":null} onChange={e=>{setF({...f,name:e.target.value});setErr("");}}/>
      <div style={MY_LABEL}>色</div>
      <MyColorPicker value={f.color} onChange={c=>{setF({...f,color:c});setErr("");}}/>
      {payLocked?<div data-my-pay-section="locked" style={{borderTop:"1px solid var(--c-border)",paddingTop:12,marginTop:4,marginBottom:12,fontSize:13,color:"var(--c-text3)",lineHeight:1.7}}>
        給料の設定は、給料タブで暗証番号を入れると表示されます。
      </div>:<div style={{borderTop:"1px solid var(--c-border)",paddingTop:12,marginTop:4}} data-my-pay-section={payOpen?"open":"closed"}>
        <div style={{...MY_SECTION_TITLE,marginBottom:8}}>給料</div>
        {company&&company.state==="error"&&<div data-my-company-pay-error="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>会社の賃金設定を確認できませんでした。本人の設定で計算します。</div>}
        {company&&company.state==="ok"&&!company.pay&&company.homeShopId&&<div data-my-company-pay-home="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>
          賃金は所属店舗{company.homeShopName?`（${company.homeShopName}）`:""}で設定されています。所属店舗とリンクすると、そちらで会社設定が出ます。このお店の分は本人の設定で計算します。
        </div>}
        {payOpen?(
          <MyPayFields kind={kind} f={pf} set={v=>{setPf(p=>({...p,...v}));setErr("");}} company={company} shopCal={shopCal}/>
        ):(
          <div>
            {company&&company.pay&&<MyCompanyPayView pay={company.pay}/>}
            {shopCal?<MyShopCalendarView cal={shopCal}/>:<div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:8}}>締日と給料日を入れると、給料タブで支給月ごとの見込みが出ます。</div>}
            <button data-my-action="openPay" onClick={()=>{setPayOpen(true);setErr("");}} style={{...AGray,marginBottom:12}}>給料を設定する</button>
          </div>
        )}
      </div>}
      <MyMessage error={err}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button data-my-action="saveWorkplace" disabled={busy} onClick={()=>save()} style={{...AB,opacity:busy?.6:1}}>{busy?"保存中…":isNew?"追加":"保存"}</button>
        <button data-my-action="cancelWorkplace" onClick={()=>onDone(null)} style={AGray}>やめる</button>
        {hadPay&&!payLocked&&<button data-my-action="removePay" disabled={busy} onClick={()=>save({removePay:true})} style={MY_LINK_BTN}>給料の設定を消す</button>}
      </div>
    </div>
  );
}
// payLocked: 個別URLで暗証番号を入れていない間は給料の設定（時給・交通費・締日）を出さない（2026-10-04）
// 紐付いた店舗ごとの、その人の従業員番号（{shopId: 番号}・無ければキーなし）。店舗の settings は readMyShiftShopShared で読む（書き込みなし）
function useMyStaffNumbers(okLinks){
  const[m,setM]=useState({});
  const key=(okLinks||[]).map(l=>l.shopId+"|"+l.name).join(",");
  useEffect(()=>{
    let alive=true;
    (okLinks||[]).forEach(l=>{
      readMyShiftShopShared(l.shopId).then(v=>{
        const n=v&&v.ok?myStaffNumberOf(v.settings,l.name):"";
        if(alive)setM(p=>(p[l.shopId]||"")===n?p:{...p,[l.shopId]:n});
      },()=>{});
    });
    return()=>{alive=false;};
  },[key]);
  return m;
}
// 紐付いた店舗ごとの、お店が登録した締日・給料日（{shopId: normalizePayCalendar の値}・無ければキーなし・2026-10-05）
function useMyShopPayCalendars(okLinks){
  const[m,setM]=useState({});
  const key=(okLinks||[]).map(l=>l.shopId).join(",");
  useEffect(()=>{
    let alive=true;
    (okLinks||[]).forEach(l=>{
      readMyShiftShopShared(l.shopId).then(v=>{
        const c=v&&v.ok?normalizePayCalendar(v.settings&&v.settings.payCalendar):null;
        if(alive)setM(p=>{if(JSON.stringify(p[l.shopId]||null)===JSON.stringify(c))return p;const n={...p};if(c)n[l.shopId]=c;else delete n[l.shopId];return n;});
      },()=>{});
    });
    return()=>{alive=false;};
  },[key]);
  return m;
}
function MyShopCalendarView({cal}){
  return(
    <div data-my-shop-calendar="1" style={{border:"1px solid var(--c-border2)",borderRadius:10,padding:"10px 12px",marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:"var(--c-text2)",marginBottom:4}}>締日・給料日（お店の登録・変更できません）</div>
      <div style={{fontSize:14,color:"var(--c-text)"}}>{payCalendarText(cal)}</div>
    </div>
  );
}
function MyWorkplacesSection({me,personal,payLocked=false}){
  const P=personal;
  const[lp,setLp]=useState(undefined); // {links,plans}
  const[edit,setEdit]=useState(null);  // 勤務先ID | "new"
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState("");
  useEffect(()=>{
    let alive=true;
    readMyLinksWithPlans(me).then(v=>{if(alive)setLp(v);},()=>{if(alive)setLp({links:null,plans:[]});});
    return()=>{alive=false;};
  },[me.key]);
  const okLinks=lp&&Array.isArray(lp.links)?lp.links.filter(l=>l&&l.ok):[];
  const list=myWorkplaceList(okLinks,P.workplaces);
  // その店舗での従業員番号（店舗ごとに違う・2026-10-04）。店舗の settings を読む（マイシフトと同じ読み込みを共有する）
  const numbers=useMyStaffNumbers(okLinks);
  // お店が登録した締日・給料日（2026-10-05）。登録があれば本人の締日・給料日の欄の代わりに固定表示する
  const shopCals=useMyShopPayCalendars(okLinks);
  // 会社が登録した賃金（E6・getMyPay）。勤務先の編集で「会社設定」として固定表示する
  const companyPays=useMyCompanyPays(payLocked?null:me,okLinks);
  const premium=!!lp&&myShiftPremiumOf(lp.plans);
  const canEdit=premium&&P.state==="ok";
  const done=m=>{setEdit(null);setMsg(m?{ok:m}:{});};
  const remove=async w=>{
    if(w.kind==="manual"){
      const ids=Object.entries(P.shifts||{}).filter(([,s])=>s&&s.workplaceId===w.id).map(([id])=>id);
      if(!window.confirm(`「${w.name}」を削除しますか？${ids.length?`この勤務先のシフト${ids.length}件も一緒に削除されます。`:"この勤務先のシフトはありません。"}`))return;
      setBusy(w.id);setMsg({});
      const r=await P.deleteWorkplace(w.id,{shiftIds:ids});
      setBusy("");setMsg(r.error?{error:r.error}:{ok:"勤務先を削除しました"});
    }else{
      const n=Object.keys((P.overrides||{})[w.id]||{}).length;
      if(!window.confirm(`リンクが外れたお店「${w.name}」の設定を削除しますか？${n?`入力した実績${n}件も一緒に削除されます。`:""}`))return;
      setBusy(w.id);setMsg({});
      const r=await P.deleteWorkplace(w.id,{overridesShopId:w.id});
      setBusy("");setMsg(r.error?{error:r.error}:{ok:"削除しました"});
    }
  };
  const kindLabel=w=>w.kind==="manual"?"手入力の勤務先":w.linked?"Shifty のお店":"リンク解除済みのお店";
  return(
    <section style={MY_SECTION} data-my-section="workplaces">
      <div style={MY_SECTION_TITLE}>勤務先</div>
      <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>カレンダーに出す名前と色です。Shifty を使っていないお店も追加すると、マイシフトでシフトを入れられます。</div>
      {(lp===undefined||P.state==="loading")&&<div style={{fontSize:14,color:"var(--c-text3)"}}>読み込み中…</div>}
      {P.state==="error"&&<MyMessage error="勤務先を読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/>}
      {lp&&lp.links===null&&<MyMessage error="お店とのリンクを読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/>}
      {lp!==undefined&&P.state!=="loading"&&list.length===0&&<div style={{fontSize:14,color:"var(--c-text3)",marginBottom:8}}>まだ勤務先がありません。</div>}
      {lp!==undefined&&P.state!=="loading"&&list.map(w=>(
        <div key={w.id} data-my-wp={w.id} data-my-wp-kind={w.kind} data-my-wp-linked={w.linked?"1":"0"} style={{borderTop:"1px solid var(--c-border)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0"}}>
            <span aria-hidden="true" data-my-wp-dot="1" style={{flex:"0 0 auto",width:12,height:12,borderRadius:6,background:w.color}}/>
            <div style={{flex:1,minWidth:0}}>
              <div data-my-wp-name="1" style={{fontSize:15,fontWeight:700,color:"var(--c-text)",overflowWrap:"anywhere"}}>{w.name}
                {w.kind==="shifty"&&w.linked&&numbers[w.id]&&<span data-my-wp-number={numbers[w.id]} style={{fontSize:13,fontWeight:400,color:"var(--c-text2)",marginLeft:8,whiteSpace:"nowrap"}}>従業員番号 {numbers[w.id]}</span>}
              </div>
              <div style={{fontSize:12,color:"var(--c-text3)"}}>{kindLabel(w)}{w.kind==="shifty"&&w.linked&&w.name!==w.shopName?`（${w.shopName}）`:""}</div>
              {!payLocked&&(()=>{const t=myPaySummaryText(w.rec&&w.rec.pay,companyPays[w.id],w.kind==="shifty"&&w.linked?shopCals[w.id]:null);return t?<div data-my-wp-pay="1" style={{fontSize:12,color:"var(--c-text3)",overflowWrap:"anywhere"}}>{t}</div>:null;})()}
            </div>
            {canEdit&&edit!==w.id&&(w.kind==="manual"||w.linked)&&<button data-my-action="editWorkplace" onClick={()=>{setMsg({});setEdit(w.id);}} style={{...AGray,padding:"8px 12px",fontSize:13,whiteSpace:"nowrap"}}>編集</button>}
            {(w.kind==="manual"||!w.linked)&&P.state==="ok"&&edit!==w.id&&<button data-my-action="deleteWorkplace" disabled={busy===w.id} onClick={()=>remove(w)} style={{...AGray,padding:"8px 12px",fontSize:13,whiteSpace:"nowrap"}}>削除</button>}
          </div>
          {edit===w.id&&<MyWorkplaceEditor w={w} personal={P} list={list} onDone={done} company={w.kind==="shifty"?companyPays[w.id]:null} payLocked={payLocked}
            shopCal={w.kind==="shifty"&&w.linked?shopCals[w.id]||null:null}/>}
        </div>
      ))}
      {edit==="new"&&<div style={{borderTop:"1px solid var(--c-border)"}}><MyWorkplaceEditor w={null} isNew personal={P} list={list} onDone={done} payLocked={payLocked}/></div>}
      <MyMessage {...msg}/>
      {canEdit&&edit!=="new"&&<button data-my-action="addWorkplace" onClick={()=>{setMsg({});setEdit("new");}} style={{...AGray,marginTop:10}}>＋ 勤務先を追加</button>}
      {lp!==undefined&&!premium&&P.state!=="loading"&&<div data-my-wp-premium-note="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginTop:10}}>
        勤務先の追加と編集は、プレミアムプランのお店とリンクしている間に使えます。入れた勤務先とシフトは表示され、削除はいつでもできます。
      </div>}
    </section>
  );
}

// ===== 給料（2026-10-04・第2部 E5）=====
// 支給月ごとの見込み（目安）。計算は app-my-utils.js の myPayMonthFor 以下（Shifty の店舗は月次賃金ページと同じ関数）。
// 読むのは本人のセッションが読めるものだけ（紐付いた店舗の periods・settings・写し・本人に関係する期間の subs と、users/{uid} の下）。
// 書くのは users/{uid}/goals（月間目標）と users/{uid}/actuals/{支給月}/{勤務先}（振込額）だけ（店舗のデータには書かない）
function useMyPayExtras(base){
  const[d,setD]=useState({state:"loading",goal:0,received:{}});
  useEffect(()=>{
    if(!base||!firebaseDB)return;
    let alive=true;
    Promise.all([_myRead(`${base}/goals`),_myRead(`${base}/actuals`)]).then(([g,a])=>{
      if(!alive)return;
      setD({state:g.ok&&a.ok?"ok":"error",goal:g.ok?myGoalOf(g.v):0,received:(a.ok&&a.v&&typeof a.v==="object")?a.v:{}});
    });
    return()=>{alive=false;};
  },[base]);
  const write=async patch=>{
    try{await fbUpd(base,patch);return{ok:true};}
    catch(e){console.warn("給料: 保存に失敗:",e&&e.code);return{error:myWriteError(e)};}
  };
  return{...d,
    saveGoal:async v=>{
      const r=parseMyGoalInput(v);
      if(r.error)return r;
      const res=await write({goals:r.remove?null:{monthly:r.value,updatedAt:new Date().toISOString()}});
      if(res.ok)setD(p=>({...p,goal:r.remove?0:r.value}));
      return res;
    },
    // これまでの給料の一括入力（2026-10-04）。patch は planMyReceivedBulk が作った「変えたセルだけ」（"actuals/{ym}/{wid}": 円|null）。1回の update で書く
    saveReceivedBulk:async patch=>{
      const keys=Object.keys(patch||{});
      if(!keys.length)return{ok:true};
      const res=await write(patch);
      if(res.ok)setD(p=>{
        const rc={...p.received};
        keys.forEach(k=>{const[,ym,wid]=k.split("/");const m={...(rc[ym]||{})};if(patch[k]==null)delete m[wid];else m[wid]=patch[k];if(Object.keys(m).length)rc[ym]=m;else delete rc[ym];});
        return{...p,received:rc};
      });
      return res;
    },
    saveReceived:async(ym,wid,v)=>{
      const r=parseMyReceivedInput(v);
      if(r.error)return r;
      const res=await write({[`actuals/${ym}/${wid}`]:r.remove?null:r.value});
      if(res.ok)setD(p=>{
        const rc={...p.received};const m={...(rc[ym]||{})};
        if(r.remove)delete m[wid];else m[wid]=r.value;
        if(Object.keys(m).length)rc[ym]=m;else delete rc[ym];
        return{...p,received:rc};
      });
      return res;
    }};
}
// 目標に対する進捗の弧（2026-10-05 改め）。下地（100%の線）の上に、これからの見込みまでを下地より濃いグレー、
// 確定分をアクセントで重ねる。中央は確定分の割合、その下に見込みを含めた割合
function MyGoalRing({progress,projected=null,size=112}){
  const r=size/2-8,c=2*Math.PI*r;
  const v=progress==null?0:progress;
  const pv=projected==null?v:Math.max(v,projected);
  const arc=(x,stroke)=>x>0&&<circle cx={size/2} cy={size/2} r={r} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="butt"
    strokeDasharray={`${c*Math.min(1,x)} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>;
  const showP=progress!=null&&pv>v;
  return(
    <svg data-my-goal-ring={progress==null?"none":Math.round(v*100)} data-my-goal-projected={progress==null?"none":Math.round(pv*100)} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={progress==null?"目標は未設定":`確定分は目標の${Math.round(v*100)}%・見込みを含めると${Math.round(pv*100)}%`} style={{flex:"0 0 auto"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--c-border)" strokeWidth="10"/>
      {showP&&<g data-my-goal-arc="projected">{arc(pv,"var(--c-text4)")}</g>}
      {v>0&&<g data-my-goal-arc="confirmed">{arc(v,"var(--c-accent)")}</g>}
      <text x="50%" y={showP?"44%":"50%"} textAnchor="middle" dominantBaseline="central" style={{fontSize:20,fontWeight:700,fill:"var(--c-text)",fontVariantNumeric:"tabular-nums"}}>
        {progress==null?"—":`${Math.round(v*100)}%`}
      </text>
      {showP&&<text x="50%" y="63%" textAnchor="middle" dominantBaseline="central" style={{fontSize:11,fill:"var(--c-text3)",fontVariantNumeric:"tabular-nums"}}>見込み {Math.round(pv*100)}%</text>}
    </svg>
  );
}
// 合計・確定分・見込み・勤務時間と、目標を設定したときのグラフ（月と年で同じ表示・2026-10-05）。
// data＝{total, confirmedTotal, projectedTotal, workMin, hasAmount, partial}、summary＝myPaySummaryOf／myPayYearGoalOf の戻り値
function MyPaySummaryBody({data,summary}){
  const ring=summary.showRing;
  const sub={fontWeight:ring?400:700,color:"var(--c-text)",fontSize:ring?13:16};
  return(
    <div style={{display:"flex",gap:16,alignItems:"center"}}>
      {ring&&<MyGoalRing progress={summary.progress} projected={summary.projectedProgress}/>}
      <div style={{flex:1,minWidth:0}}>
        <div style={MY_LABEL}>合計（目安）</div>
        <div data-my-pay-total={data.total} style={{fontSize:ring?24:30,fontWeight:700,color:"var(--c-text)",fontVariantNumeric:"tabular-nums",lineHeight:1.2}}>{data.hasAmount?(data.partial?"＋":"")+fmtMyYen(data.total):"—"}</div>
        <div style={{display:"grid",gridTemplateColumns:ring?"1fr":"repeat(2,minmax(0,1fr))",columnGap:12,fontSize:13,color:"var(--c-text2)",marginTop:6,lineHeight:1.8,fontVariantNumeric:"tabular-nums"}}>
          <div data-my-pay-confirmed={data.confirmedTotal}>{ring&&<span aria-hidden="true" style={{display:"inline-block",width:8,height:8,borderRadius:4,background:"var(--c-accent)",marginRight:5}}/>}確定分（今日まで）{ring?" ":<br/>}<span style={sub}>{data.hasAmount?fmtMyYen(data.confirmedTotal):"—"}</span></div>
          <div data-my-pay-projected={data.projectedTotal}>{ring&&<span aria-hidden="true" style={{display:"inline-block",width:8,height:8,borderRadius:4,background:"var(--c-text4)",marginRight:5}}/>}これからの見込み{ring?" ":<br/>}<span style={sub}>{data.hasAmount?fmtMyYen(data.projectedTotal):"—"}</span></div>
        </div>
        <div data-my-pay-workmin={data.workMin} style={{fontSize:13,color:"var(--c-text2)",marginTop:4,fontVariantNumeric:"tabular-nums"}}>勤務時間 {fmtMin(data.workMin)||"0:00"}</div>
      </div>
    </div>
  );
}
const _myYmLabel=ym=>`${Number(String(ym).slice(0,4))}年${Number(String(ym).slice(5,7))}月`;
const _myMd=ds=>{const d=pd(ds);return isNaN(d)?ds:`${d.getMonth()+1}/${d.getDate()}`;};
const MY_PAY_ITEM_LABELS={base:"基本",ot:"時間外",over60:"月60時間超",night:"深夜",holiday:"法定休日",allowances:"手当",commute:"交通費",deduction:"欠勤・遅刻早退の控除"};
function MyPayRowDetail({row}){
  const a=row.amounts,t=a.minutes;
  const mins={base:t.workMin,ot:t.otMin,over60:t.over60Min,night:t.nightMin,holiday:t.legalHolidayMin,deduction:t.absentMin};
  const srcLabel=row.wage.source==="company"?"会社設定":row.wage.source==="self"?"本人の設定":"未設定";
  const kindLabel=row.wage.payType==="monthly"?"月給":row.wage.payType==="daily"?"日給":row.wage.payType==="hourly"?"時給":"";
  return(
    <div data-my-pay-detail={row.id} style={{padding:"8px 0 4px",fontSize:13,color:"var(--c-text2)"}}>
      <div style={{lineHeight:1.7}}>締め期間 {_myMd(row.plan.from)}〜{_myMd(row.plan.to)} ／ 給料日 {_myMd(row.plan.payDate)}</div>
      <div style={{lineHeight:1.7,marginBottom:6}}>{srcLabel}{kindLabel?`（${kindLabel}${row.wage.payType==="daily"?` ${fmtMyYen(row.wage.rate)}`:row.wage.version?` ${fmtMyYen(row.wage.version.base)}`:""}）`:""}{row.wage.payType==="daily"?` ／ 出勤${t.workDays}日`:""}</div>
      {a.items&&MY_PAY_ITEM_KEYS.filter(k=>a.items[k]>0||k==="base").map(k=>(
        <div key={k} data-my-pay-item={k} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"3px 0",borderTop:"1px solid var(--c-border)"}}>
          <span>{MY_PAY_ITEM_LABELS[k]}{mins[k]>0&&row.wage.payType!=="daily"?<span style={{color:"var(--c-text3)"}}> {fmtMin(mins[k])}</span>:null}</span>
          <span style={{fontVariantNumeric:"tabular-nums",color:"var(--c-text)"}}>{k==="deduction"?"−":""}{fmtMyYen(a.items[k])}</span>
        </div>
      ))}
      {!a.items&&<div style={{color:"var(--c-text3)"}}>勤務時間 {fmtMin(t.workMin)}（時間外 {fmtMin(t.otMin)}・深夜 {fmtMin(t.nightMin)}）</div>}
      {row.notes.length>0&&<ul data-my-pay-notes={row.id} style={{margin:"6px 0 0",paddingLeft:18,color:"var(--c-text3)",lineHeight:1.7}}>{row.notes.map((n,i)=><li key={i}>{n}</li>)}</ul>}
    </div>
  );
}
function MyReceivedInput({ym,wid,value,onSave,disabled}){
  const[v,setV]=useState(value>0?String(value):"");
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState(false);
  useEffect(()=>{setV(value>0?String(value):"");setMsg({});},[ym,wid,value]);
  const save=async()=>{setBusy(true);setMsg({});const r=await onSave(ym,wid,v);setBusy(false);setMsg(r.error?{error:r.error}:{ok:"保存しました"});};
  return(
    <div data-my-received={wid} style={{marginTop:8}}>
      <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
        <label style={{flex:1,minWidth:0}}>
          <span style={MY_LABEL}>振込額（給与明細の手取り・任意）</span>
          <input data-my-input="received" value={v} inputMode="numeric" disabled={disabled} onChange={e=>{setV(e.target.value);setMsg({});}} placeholder="例 98000" style={AI}/>
        </label>
        {!disabled&&<button data-my-action="saveReceived" disabled={busy} onClick={save} style={{...AGray,minHeight:44,whiteSpace:"nowrap"}}>保存</button>}
      </div>
      <MyMessage {...msg}/>
    </div>
  );
}
// これまでの給料をまとめて入力（年の表示から・2026-10-04 ユーザー指示「引き継ぎ用に今までの給料を一括で入力」）。
// その年の支給月（1〜12月）×勤務先の振込額。勤務先が2つ以上なら上のプルダウンで切り替える（入れた値は切り替えても残る）。
// 保存は変えたセルだけ（planMyReceivedBulk）。入っていた金額を消したセルがあるときは件数を確認してから消す
function MyReceivedBulkForm({year,workplaces,received,onSave,onDone}){
  const wids=workplaces.map(w=>w.id);
  const[form,setForm]=useState(()=>myReceivedBulkForm(received,year,wids));
  const[wid,setWid]=useState(wids[0]||"");
  const[msg,setMsg]=useState({});
  const[bad,setBad]=useState(null);
  const[busy,setBusy]=useState(false);
  const set=(ym,v)=>{setForm(f=>({...f,[wid]:{...(f[wid]||{}),[ym]:v}}));setMsg({});setBad(null);};
  const save=async()=>{
    const r=planMyReceivedBulk(received,form);
    if(r.error){setBad({ym:r.ym,wid:r.wid});if(r.wid!==wid)setWid(r.wid);setMsg({error:`${Number(r.ym.slice(5))}月: ${r.error}`});return;}
    if(!r.writes&&!r.removes){setMsg({ok:"変更はありません"});return;}
    if(r.removes&&!window.confirm(`入っていた振込額を${r.removes}件消します。よろしいですか？`))return;
    setBusy(true);
    const w=await onSave(r.patch);
    setBusy(false);
    if(w.error){setMsg({error:w.error});return;}
    onDone(`${year}年の振込額を保存しました（${r.writes}件${r.removes?`・消したもの${r.removes}件`:""}）`);
  };
  const cur=form[wid]||{};
  return(
    <section data-my-bulk={year} style={{...MY_SECTION,padding:"14px 16px"}}>
      <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)",marginBottom:4}}>{year}年 これまでの給料（振込額）</div>
      <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>給与明細の手取り（振込額）を支給月ごとに入れます。空欄の月は変えません。入っている金額を消したときは、保存の前に確認します。</div>
      {workplaces.length>1&&<label style={{display:"block",marginBottom:10}}>
        <span style={MY_LABEL}>勤務先</span>
        <select data-my-bulk-wp="1" value={wid} onChange={e=>setWid(e.target.value)} style={AI}>
          {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>}
      {workplaces.length===1&&<div style={{fontSize:14,fontWeight:700,color:"var(--c-text2)",marginBottom:8,overflowWrap:"anywhere"}}>{workplaces[0].name}</div>}
      {myPayYearMonths(year).map(ym=>(
        <label key={ym} style={{display:"grid",gridTemplateColumns:"44px minmax(0,1fr)",gap:8,alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:14,color:"var(--c-text2)"}}>{Number(ym.slice(5))}月</span>
          <input data-my-bulk-month={ym} value={cur[ym]||""} inputMode="numeric" placeholder="円" onChange={e=>set(ym,e.target.value)}
            aria-invalid={bad&&bad.ym===ym&&bad.wid===wid?"true":undefined} style={{...AI,...(bad&&bad.ym===ym&&bad.wid===wid?{borderColor:"var(--c-danger)"}:{})}}/>
        </label>
      ))}
      <MyMessage {...msg}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:4}}>
        <button data-my-action="saveBulk" disabled={busy} onClick={save} style={{...AB,opacity:busy?.6:1}}>{busy?"保存中…":"まとめて保存"}</button>
        <button data-my-action="cancelBulk" onClick={()=>onDone(null)} style={AGray}>やめる</button>
      </div>
    </section>
  );
}
function MyPayTab({me,personal,onGoSettings}){
  const P=personal||{state:"ok",workplaces:{},shifts:{},overrides:{}};
  const todayStr=fd(new Date());
  const X=useMyPayExtras(me&&me.base);
  const[view,setView]=useState("month");     // month | year
  const[payYm,setPayYm]=useState(null);
  const[year,setYear]=useState(Number(todayStr.slice(0,4)));
  const[open,setOpen]=useState({});
  const[bulk,setBulk]=useState(false);   // 年の表示の「これまでの給料をまとめて入力」
  const[bulkMsg,setBulkMsg]=useState({});
  useEffect(()=>{setBulk(false);setBulkMsg({});},[year,view]);
  // 勤務先ごとの給料設定（Shifty の店舗・手入力の勤務先）。未設定の勤務先は MY_PAY_DEFAULT で振り分ける。
  // お店が締日・給料日を登録していれば（settings.payCalendar・2026-10-05）そちらを優先する＝読む範囲にも入れる
  const[shopCals,setShopCals]=useState({});
  const ownPays=useMemo(()=>[...Object.values(P.workplaces||{}).map(r=>r&&myPayOf(r.pay)),...Object.values(shopCals)],[P.workplaces,shopCals]);
  useEffect(()=>{if(payYm===null&&P.state!=="loading")setPayYm(myDefaultPayMonth(ownPays.filter(Boolean).length?ownPays:[MY_PAY_DEFAULT],todayStr));},[payYm,P.state,ownPays,todayStr]);
  const ym=payYm||myDefaultPayMonth([MY_PAY_DEFAULT],todayStr);
  // 読む日の範囲（表示中の支給月、年の表示なら12か月分）。全勤務先の設定と既定の振り分けの両方を含める
  const range=useMemo(()=>{
    const months=view==="year"?myPayYearMonths(year):[ym];
    const pays=[...ownPays.filter(Boolean),MY_PAY_DEFAULT];
    return myPayReadRange(months.flatMap(m=>pays.map(p=>myPayPlanOf(m,p,null))));
  },[view,year,ym,ownPays]);
  const pick=useCallback(ps=>range?myPeriodsInRange(ps,range.from,range.to):[],[range&&range.from,range&&range.to]);
  const{links,okLinks,badLinks,shops,subs,pending}=useMyShiftSources(me,pick);
  const premium=myShiftPremiumOf(okLinks.map(l=>shops[l.shopId]&&shops[l.shopId].plan));
  useEffect(()=>{
    const m={};
    okLinks.forEach(l=>{const sh=shops[l.shopId];const c=sh&&sh.ok?normalizePayCalendar(sh.settings&&sh.settings.payCalendar):null;if(c)m[l.shopId]=c;});
    setShopCals(p=>JSON.stringify(p)===JSON.stringify(m)?p:m);
  },[okLinks,shops]);
  const wpList=useMemo(()=>myWorkplaceList(okLinks,P.workplaces),[okLinks,P.workplaces]);
  // 会社が登録した賃金（E6・getMyPay）。読み込み中の店舗は計算を待つ（本人の設定で一度出してから変わらないように）
  const companyPays=useMyCompanyPays(me,okLinks);
  // ヘルプ先の勤務（2026-10-04 B「ヘルプ先の勤務も計算に入れて」）: 所属店舗の行に入れ、賃金は所属店舗の設定で計算する。
  // 時間は管理者画面の合算（P3.6）・月次賃金ページと同じ規則（行き先の店の設定で引いた実働・自店と重なる勤務は足さない）。
  // ヘルプ先にも紐付いていれば、寄せた日をヘルプ先の行から外す（二重に数えない）
  const helper=useMyHelperSources(okLinks,shops,()=>range,premium);
  const helperByHome=useMemo(()=>myHelperByHomeOf(okLinks,shops,subs,helper,{todayStr,premium,overrides:P.overrides}),[okLinks,shops,subs,helper.state,todayStr,premium,P.overrides]);
  const workplaces=useMemo(()=>{
    const manualDays=buildMyManualDays(wpList,P.shifts);
    const moved=myMovedHelperDates(helperByHome);
    const homeOfMoved=sid=>{const h=Object.entries(helperByHome).find(([,hd])=>Object.values(hd.byDate||{}).some(rows=>rows.some(r=>r.shopId===sid)));
      if(!h)return"";const w=wpList.find(v=>v.id===h[0]);return w?w.name:"";};
    return wpList.filter(w=>w.kind==="manual"||w.linked).map(w=>{
      const base={id:w.id,kind:w.kind,name:w.name,color:w.color,pay:myPayOf(w.rec&&w.rec.pay)};
      if(w.kind==="manual")return{...base,manualEntries:manualDays.filter(e=>e.workplaceId===w.id)};
      const l=okLinks.find(x=>x.shopId===w.id);const sh=shops[w.id];
      if(!l||!sh||!sh.ok)return null;
      // お店の締日・給料日が本人の設定より優先（2026-10-05）
      base.pay=myPayWithShopCalendar(base.pay,sh.settings&&sh.settings.payCalendar);
      const hd=helperByHome[w.id];
      const src={name:l.name,periods:sh.periods,subsByPeriod:mySubsByPeriodOf(w.id,sh,subs),settings:sh.settings,staff:sh.staff,todayStr,premium,
        overrides:(P.overrides||{})[w.id],helperDays:hd?hd.byDate:null,movedDates:moved[w.id]||[]};
      const info=myShiftyDayInfo(src);
      const cache=new Map();
      const monthSettingsOf=m=>{if(!cache.has(m))cache.set(m,myMonthSettingsOf(src,m));return cache.get(m);};
      const cp=companyPays[w.id];
      const companyNote=cp&&cp.state==="error"?"会社の賃金設定を確認できませんでした（本人の設定で計算しています）"
        :cp&&cp.state==="ok"&&!cp.pay&&cp.homeShopId?`賃金は所属店舗${cp.homeShopName?`（${cp.homeShopName}）`:""}で設定されています（このお店の分は本人の設定で計算しています）`:"";
      return{...base,companyPay:cp&&cp.state==="ok"?cp.pay:null,companyNote,shifty:{name:l.name,info,monthSettingsOf,wageSettings:sh.wageSettings||null,
        helperUnread:!!(hd&&hd.unread),homeShopName:(moved[w.id]||[]).length?homeOfMoved(w.id):""}};
    }).filter(Boolean);
  },[wpList,okLinks,shops,subs,premium,todayStr,P.shifts,P.overrides,companyPays,helperByHome]);
  const month=useMemo(()=>premium&&view==="month"?myPayMonthFor({payYm:ym,workplaces,todayStr}):null,[premium,view,ym,workplaces,todayStr]);
  const yearMonths=useMemo(()=>premium&&view==="year"?myPayYearMonths(year).map(m=>myPayMonthFor({payYm:m,workplaces,todayStr})):null,
    [premium,view,year,workplaces,todayStr]);
  const yearRows=useMemo(()=>yearMonths?myPayYearSummary(yearMonths,X.received):null,[yearMonths,X.received]);
  // 年の勤務先ごとの収入（2026-10-05）と、年の目標（月間目標×12）のグラフ
  const yearByWp=useMemo(()=>yearMonths?myPayYearByWorkplace(yearMonths,X.received):null,[yearMonths,X.received]);
  const yearGoal=myPayYearGoalOf(yearRows,X.goal);
  const loading=pending||helper.pending||P.state==="loading"||X.state==="loading"||okLinks.some(l=>!companyPays[l.shopId]);
  const canEdit=premium&&X.state==="ok";
  const navBtn={background:"none",border:"1px solid var(--c-border2)",borderRadius:8,minWidth:44,minHeight:40,fontSize:18,color:"var(--c-text2)",cursor:"pointer"};
  const segBtn=a=>({flex:1,minHeight:40,background:a?"var(--c-card)":"none",border:"none",borderRadius:8,fontSize:14,fontWeight:a?700:600,
    color:a?"var(--c-text)":"var(--c-text3)",boxShadow:a?"0 0 0 1px var(--c-border2)":"none",cursor:"pointer"});

  if(links===null)return <MyEmptyState><MyMessage error="お店とのリンクを読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/></MyEmptyState>;
  if(Array.isArray(links)&&!okLinks.length)return(
    <MyEmptyState>
      <div data-my-pay-empty="nolink">給料の見込みは、Shifty を使っているお店とアカウントをリンクすると使えます（お店がプレミアムプランのとき）。</div>
      {onGoSettings&&<button data-my-action="goLinks" onClick={onGoSettings} style={{...MY_LINK_BTN,display:"block",marginTop:8}}>設定でお店とリンクする</button>}
    </MyEmptyState>
  );
  const anyEstimate=month&&month.rows.some(r=>r.estimate);
  const summary=myPaySummaryOf(month,X.goal);
  return(
    <div data-my-pay="1" data-my-pay-view={view}>
      {badLinks.length>0&&<div data-my-bad-links="1" style={{fontSize:13,color:"var(--c-danger)",lineHeight:1.7,marginBottom:12}}>
        {badLinks.map(l=><div key={l.shopId}>{l.shopName}: {l.reason==="unread"?"状態を確認できませんでした":MY_LINK_INVALID_LABELS[l.reason]}</div>)}
      </div>}
      <div role="tablist" style={{display:"flex",gap:4,background:"var(--c-input)",borderRadius:10,padding:4,marginBottom:14}}>
        {[["month","月"],["year","年"]].map(([k,l])=><button key={k} role="tab" aria-selected={view===k} data-my-pay-tab={k} onClick={()=>setView(k)} style={segBtn(view===k)}>{l}</button>)}
      </div>
      {!premium&&!loading&&<div data-my-pay-premium-note="1" style={{...MY_SECTION,fontSize:14,color:"var(--c-text2)",lineHeight:1.8}}>
        給料の見込みは、プレミアムプランのお店とリンクしている間に使えます。入力した給料設定と振込額は残っていて、下で確認できます。
      </div>}
      {X.state==="error"&&<MyMessage error="月間目標と振込額を読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/>}

      {view==="month"&&<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <button data-my-pay-nav="prev" aria-label="前の支給月" onClick={()=>setPayYm(myShiftMonth(ym,-1))} style={navBtn}>‹</button>
          <div data-my-pay-month={ym} style={{fontSize:16,fontWeight:700,color:"var(--c-text)"}}>{_myYmLabel(ym)}の支給</div>
          <button data-my-pay-nav="next" aria-label="次の支給月" onClick={()=>setPayYm(myShiftMonth(ym,1))} style={navBtn}>›</button>
        </div>
        {premium&&<section style={{...MY_SECTION,padding:"16px"}} data-my-pay-summary={month&&month.hasAmount?"amount":"none"} data-my-pay-goal={summary.showRing?"set":"none"}>
          {loading?<div style={{fontSize:14,color:"var(--c-text3)"}}>読み込み中…</div>:month&&(
            // 月間目標は任意（2026-10-04 ユーザー指示）。目標を設定したときだけ円グラフを出し、無ければ合計・確定分・見込みだけを大きく出す
            <MyPaySummaryBody data={month} summary={summary}/>
          )}
          {!loading&&month&&summary.missingWage.length>0&&<div data-my-pay-nowage={summary.allMissing?"all":"some"} style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.7,marginTop:10,paddingTop:10,borderTop:"1px solid var(--c-border)"}}>
            {summary.allMissing?"時給（日給）が未設定のため、金額を計算できません。勤務時間だけを表示しています。"
              :`${summary.missingWage.join("・")}の時給（日給）が未設定のため、その分は合計に入っていません。`}
            {onGoSettings&&canEdit&&<button data-my-action="goWage" onClick={onGoSettings} style={{...MY_LINK_BTN,display:"block",padding:"4px 0 0",fontSize:13}}>設定で時給を入れる</button>}
          </div>}
          {!loading&&<div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginTop:10}}>
            {summary.showRing?`月間目標 ${fmtMyYen(X.goal)} に対する割合です（オレンジが確定分、グレーがこれからの見込みまで）。`:<>月間目標（任意）を設定すると、確定分の進み具合がグラフで出ます。{onGoSettings&&<button data-my-action="goGoal" onClick={onGoSettings} style={{...MY_LINK_BTN,padding:"0 0 0 4px",fontSize:12}}>設定する</button>}</>}
          </div>}
        </section>}
        {premium&&!loading&&month&&<div data-my-pay-estimate="1" style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,margin:"-6px 4px 12px"}}>
          金額は公開されたシフトから計算した目安です。お店の給与計算（打刻の実績・所定の登録・社会保険や税）とは違うことがあります。グレー表示（未公開）のシフトは含めていません。
          {anyEstimate&&" 締日が月末でない勤務先は、月60時間超などの月単位の割増が給与明細とずれることがあります。"}
        </div>}
        {(premium?(month&&!loading?month.rows:[]):wpList.filter(w=>w.kind==="manual"||w.linked).map(w=>({id:w.id,name:w.name,color:w.color,readonly:true}))).map(r=>(
          <section key={r.id} data-my-pay-row={r.id} style={{...MY_SECTION,padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span aria-hidden="true" style={{flex:"0 0 auto",width:10,height:10,borderRadius:5,background:r.color}}/>
              <div style={{flex:1,minWidth:0,fontSize:15,fontWeight:700,color:"var(--c-text)",overflowWrap:"anywhere"}}>{r.name}</div>
              {r.amounts&&<div data-my-pay-row-total={r.amounts.total==null?"none":r.amounts.total} style={{fontSize:16,fontWeight:700,color:"var(--c-text)",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{r.amounts.total==null?"—":(r.partial?"＋":"")+fmtMyYen(r.amounts.total)}</div>}
            </div>
            {r.amounts&&<>
              <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginTop:2,fontVariantNumeric:"tabular-nums"}}>
                {_myMd(r.plan.from)}〜{_myMd(r.plan.to)}の勤務 ／ {_myMd(r.plan.payDate)}払い ／ {fmtMin(r.amounts.minutes.workMin)||"0:00"}
                {r.amounts.total!=null&&` ／ 確定 ${fmtMyYen(r.amounts.confirmedTotal)}`}{r.estimate&&" ／ 目安"}
                {r.amounts.total==null&&<span data-my-pay-row-nowage="1"> ／ 時給が未設定</span>}
              </div>
              <button data-my-action="payDetail" aria-expanded={!!open[r.id]} onClick={()=>setOpen(o=>({...o,[r.id]:!o[r.id]}))} style={{...MY_LINK_BTN,padding:"6px 0"}}>{open[r.id]?"内訳を閉じる":"内訳"}</button>
              {open[r.id]&&<MyPayRowDetail row={r}/>}
            </>}
            {X.state==="ok"&&<MyReceivedInput ym={ym} wid={r.id} value={((X.received||{})[ym]||{})[r.id]||0} onSave={X.saveReceived} disabled={!canEdit}/>}
          </section>
        ))}
        {premium&&!loading&&month&&!month.rows.length&&<MyEmptyState>この支給月に計算できる勤務先がありません。</MyEmptyState>}
      </>}

      {view==="year"&&<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <button data-my-pay-nav="prevYear" aria-label="前の年" onClick={()=>setYear(y=>y-1)} style={navBtn}>‹</button>
          <div data-my-pay-year={year} style={{fontSize:16,fontWeight:700,color:"var(--c-text)"}}>{year}年の支給</div>
          <button data-my-pay-nav="nextYear" aria-label="次の年" onClick={()=>setYear(y=>y+1)} style={navBtn}>›</button>
        </div>
        {premium&&<section style={{...MY_SECTION,padding:"16px"}} data-my-pay-year-summary={yearRows&&yearRows.hasAmount?"amount":"none"} data-my-pay-goal={yearGoal.showRing?"set":"none"}>
          {loading?<div style={{fontSize:14,color:"var(--c-text3)"}}>読み込み中…</div>:yearRows&&<MyPaySummaryBody data={yearRows} summary={yearGoal}/>}
          {!loading&&<div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginTop:10}}>
            {yearGoal.showRing?`年間の目標（月間目標 ${fmtMyYen(X.goal)} × ${MY_PAY_YEAR_GOAL_MONTHS} ＝ ${fmtMyYen(yearGoal.goal)}）に対する割合です（オレンジが確定分、グレーがこれからの見込みまで）。`
              :<>月間目標（任意）を設定すると、年間（×{MY_PAY_YEAR_GOAL_MONTHS}）の進み具合がグラフで出ます。{onGoSettings&&<button data-my-action="goGoalYear" onClick={onGoSettings} style={{...MY_LINK_BTN,padding:"0 0 0 4px",fontSize:12}}>設定する</button>}</>}
          </div>}
        </section>}
        {/* 勤務先ごとの年間の収入（2026-10-05 ユーザー指示「月のように勤務先別の収入を出す」）。内訳は支給月ごと */}
        {premium&&!loading&&yearByWp&&yearByWp.map(w=>(
          <section key={w.id} data-my-pay-year-wp={w.id} style={{...MY_SECTION,padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span aria-hidden="true" style={{flex:"0 0 auto",width:10,height:10,borderRadius:5,background:w.color}}/>
              <div style={{flex:1,minWidth:0,fontSize:15,fontWeight:700,color:"var(--c-text)",overflowWrap:"anywhere"}}>{w.name}</div>
              <div data-my-pay-year-wp-total={w.total==null?"none":w.total} style={{fontSize:16,fontWeight:700,color:"var(--c-text)",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{w.total==null?"—":(w.partial?"＋":"")+fmtMyYen(w.total)}</div>
            </div>
            <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginTop:2,fontVariantNumeric:"tabular-nums"}}>
              {fmtMin(w.workMin)||"0:00"}
              {w.total!=null&&` ／ 確定 ${fmtMyYen(w.confirmedTotal)}`}
              {w.hasReceived&&` ／ 振込額 ${fmtMyYen(w.received)}`}
              {w.total==null&&<span data-my-pay-year-wp-nowage="1"> ／ 時給が未設定</span>}
            </div>
            <button data-my-action="payYearWpDetail" aria-expanded={!!open["y:"+w.id]} onClick={()=>setOpen(o=>({...o,["y:"+w.id]:!o["y:"+w.id]}))} style={{...MY_LINK_BTN,padding:"6px 0"}}>{open["y:"+w.id]?"内訳を閉じる":"内訳"}</button>
            {open["y:"+w.id]&&<div data-my-pay-year-wp-detail={w.id} style={{fontSize:13,color:"var(--c-text2)",padding:"4px 0"}}>
              {w.months.filter(m=>m.total||m.workMin).length?w.months.filter(m=>m.total||m.workMin).map(m=>(
                <button key={m.payYm} data-my-pay-year-wp-month={m.payYm} onClick={()=>{setPayYm(m.payYm);setView("month");}}
                  style={{display:"flex",justifyContent:"space-between",gap:12,width:"100%",background:"none",border:"none",borderTop:"1px solid var(--c-border)",padding:"6px 0",fontSize:13,color:"var(--c-text2)",cursor:"pointer",textAlign:"left"}}>
                  <span>{Number(m.payYm.slice(5))}月支給 <span style={{color:"var(--c-text3)"}}>{fmtMin(m.workMin)||"0:00"}</span></span>
                  <span style={{fontVariantNumeric:"tabular-nums",color:"var(--c-text)"}}>{m.total==null?"—":fmtMyYen(m.total)}</span>
                </button>
              )):<div style={{color:"var(--c-text3)"}}>この年の勤務はありません。</div>}
            </div>}
          </section>
        ))}
        <section style={{...MY_SECTION,padding:"6px 16px"}} data-my-pay-yeartable="1">
          {loading&&premium?<div style={{fontSize:14,color:"var(--c-text3)",padding:"10px 0"}}>読み込み中…</div>:(()=>{
            const rows=yearRows?yearRows.rows:myPayYearMonths(year).map(m=>({payYm:m,total:null,workMin:null,received:myReceivedSum(X.received,m),hasReceived:!!(X.received||{})[m]}));
            const cell={fontVariantNumeric:"tabular-nums",textAlign:"right",whiteSpace:"nowrap"};
            return(<>
              <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.3fr)",gap:8,fontSize:12,color:"var(--c-text3)",padding:"8px 0"}}>
                <span>支給月</span><span style={{textAlign:"right"}}>見込み（目安）</span><span style={{textAlign:"right"}}>振込額</span>
              </div>
              {rows.map(r=>(
                <button key={r.payYm} data-my-pay-year-row={r.payYm} onClick={()=>{setPayYm(r.payYm);setView("month");}}
                  style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.3fr)",gap:8,width:"100%",background:"none",border:"none",
                    borderTop:"1px solid var(--c-border)",padding:"10px 0",fontSize:14,color:"var(--c-text)",cursor:"pointer",textAlign:"left"}}>
                  <span>{Number(r.payYm.slice(5))}月</span>
                  <span style={cell} data-my-pay-year-total={r.total==null?"none":r.total}>{r.total==null||(!r.total&&!r.workMin)?"—":fmtMyYen(r.total)}</span>
                  <span style={{...cell,color:r.hasReceived?"var(--c-text)":"var(--c-text4)"}}>{r.hasReceived?fmtMyYen(r.received):"—"}</span>
                </button>
              ))}
              <div data-my-pay-year-sum="1" style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.3fr)",gap:8,borderTop:"2px solid var(--c-border2)",padding:"10px 0",fontSize:15,fontWeight:700,color:"var(--c-text)"}}>
                <span>年間</span>
                <span style={cell} data-my-pay-year-sumtotal={yearRows?yearRows.total:"none"}>{yearRows?fmtMyYen(yearRows.total):"—"}</span>
                <span style={cell} data-my-pay-year-sumreceived={yearRows?yearRows.received:myPayYearMonths(year).reduce((a,m)=>a+myReceivedSum(X.received,m),0)}>{fmtMyYen(yearRows?yearRows.received:myPayYearMonths(year).reduce((a,m)=>a+myReceivedSum(X.received,m),0))}</span>
              </div>
            </>);
          })()}
        </section>
        {yearRows&&<div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,padding:"0 4px"}}>勤務時間の合計 {fmtMin(yearRows.workMin)||"0:00"}。金額は目安です（月の表示と同じ計算）。</div>}
        {/* 引き継ぎ用（2026-10-04）: Shifty を使う前の月も含めて、受け取った給料（振込額）を年単位でまとめて入れる。振込額の列と年間の合計に入る */}
        <MyMessage {...bulkMsg}/>
        {X.state==="ok"&&canEdit&&!bulk&&(()=>{const wps=wpList.filter(w=>w.kind==="manual"||w.linked);return wps.length?(
          <button data-my-action="openBulk" onClick={()=>{setBulkMsg({});setBulk(true);}} style={{...AGray,width:"100%",marginTop:12}}>これまでの給料をまとめて入力</button>
        ):(
          <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginTop:12}}>給料をまとめて入れるには、先に勤務先を登録してください。
            {onGoSettings&&<button data-my-action="goWorkplaces" onClick={onGoSettings} style={{...MY_LINK_BTN,display:"block"}}>勤務先を追加する</button>}</div>
        );})()}
        {bulk&&<div style={{marginTop:12}}><MyReceivedBulkForm key={year} year={year} workplaces={wpList.filter(w=>w.kind==="manual"||w.linked)} received={X.received}
          onSave={X.saveReceivedBulk} onDone={m=>{setBulk(false);setBulkMsg(m?{ok:m}:{});}}/></div>}
      </>}
    </div>
  );
}
// 設定タブ → 月間目標（E5）。給料タブの円グラフの基準。Premium のお店とリンクしている間だけ変えられる
function MyGoalSection({me}){
  const X=useMyPayExtras(me.base);
  const[lp,setLp]=useState(undefined);
  const[v,setV]=useState("");
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState(false);
  const touched=useRef(false);
  useEffect(()=>{let alive=true;readMyLinksWithPlans(me).then(x=>{if(alive)setLp(x);},()=>{if(alive)setLp({links:null,plans:[]});});return()=>{alive=false;};},[me.key]);
  useEffect(()=>{if(!touched.current)setV(X.goal>0?String(X.goal):"");},[X.goal]);
  const premium=!!lp&&myShiftPremiumOf(lp.plans);
  const save=async()=>{setBusy(true);setMsg({});const r=await X.saveGoal(v);setBusy(false);if(r.error){setMsg({error:r.error});return;}touched.current=false;setMsg({ok:"保存しました"});};
  return(
    <section style={MY_SECTION} data-my-section="goal">
      <div style={MY_SECTION_TITLE}>月間目標</div>
      <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>給料タブで、支給月ごとの確定分が目標の何%かを表示します。空欄にすると目標を消します。</div>
      {X.state==="error"&&<MyMessage error="目標を読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/>}
      <MyField label="1か月の目標（円）" value={v} inputMode="numeric" data-my-input="goal" placeholder="例 120000" disabled={!premium||X.state!=="ok"}
        onChange={e=>{touched.current=true;setV(e.target.value);setMsg({});}}/>
      <MyMessage {...msg}/>
      {premium&&X.state==="ok"&&<button data-my-action="saveGoal" disabled={busy} onClick={save} style={{...AB,opacity:busy?.6:1}}>{busy?"保存中…":"保存"}</button>}
      {lp!==undefined&&!premium&&<div data-my-goal-premium-note="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7}}>目標の変更は、プレミアムプランのお店とリンクしている間に使えます。</div>}
    </section>
  );
}

function MySettingsTab({staffUser,me,profile,profileState,initialError,onProfile,shopId,personal}){
  const[name,setName]=useState(profile.displayName);
  const[num,setNum]=useState(profile.number);
  const[pMsg,setPMsg]=useState(()=>initialError?{error:initialError}:{});
  const[busy,setBusy]=useState("");
  const[pw,setPw]=useState({current:"",next:"",next2:""});
  const[pwOpen,setPwOpen]=useState(false);
  const[pwMsg,setPwMsg]=useState({});
  const[resetMsg,setResetMsg]=useState({});
  // 読み込みが後から返ったら入力欄に反映する（まだ何も打っていないときだけ）
  const touched=useRef(false);
  useEffect(()=>{if(!touched.current){setName(profile.displayName);setNum(profile.number);}},[profile.displayName,profile.number]);

  const saveProfile=async()=>{
    setBusy("profile");setPMsg({});
    const r=await mySaveProfile(staffUser.uid,{displayName:name,number:num});
    setBusy("");
    if(r.error){setPMsg({error:r.error});return;}
    touched.current=false;
    onProfile(r.profile);
    setName(r.profile.displayName);setNum(r.profile.number||"");
    setPMsg({ok:"保存しました"});
  };
  const changePw=async()=>{
    setBusy("pw");setPwMsg({});
    const r=await myChangePassword(pw);
    setBusy("");
    if(r.error){setPwMsg({error:r.error});return;}
    setPw({current:"",next:"",next2:""});setPwOpen(false);setPwMsg({ok:r.ok});
  };
  const sendReset=async()=>{
    setBusy("reset");setResetMsg({});
    const r=await mySendReset(staffUser.email);
    setBusy("");
    setResetMsg(r.error?{error:r.error}:{ok:r.ok});
  };
  return(
    <div>
      <MyLinksSection staffUser={staffUser} profile={profile} shopId={shopId}/>
      {personal&&<MyWorkplacesSection me={me} personal={personal}/>}
      <MyGoalSection me={me}/>
      <MyPushSection base={me&&me.base}/>
      <section style={MY_SECTION} data-my-section="profile">
        <div style={MY_SECTION_TITLE}>アカウント</div>
        {profileState==="error"&&<MyMessage error="登録ネームを読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/>}
        <MyField label="登録ネーム" value={name} maxLength={MY_DISPLAY_NAME_MAX} autoComplete="name" data-my-input="displayName"
          onChange={e=>{touched.current=true;setName(e.target.value);}} hint="お店に登録されている名前と同じにしてください"/>
        <MyField label="従業員番号（任意）" value={num} maxLength={MY_NUMBER_MAX} inputMode="numeric" data-my-input="number" hint={MY_PROFILE_NUMBER_HINT}
          onChange={e=>{touched.current=true;setNum(e.target.value);}}/>
        <MyMessage {...pMsg}/>
        <button data-my-action="saveProfile" disabled={busy==="profile"} onClick={saveProfile} style={{...AB,opacity:busy==="profile"?.6:1}}>{busy==="profile"?"保存中…":"保存"}</button>
      </section>

      <section style={MY_SECTION} data-my-section="login">
        <div style={MY_SECTION_TITLE}>ログイン情報</div>
        <div style={MY_LABEL}>メールアドレス</div>
        <div data-my-email="1" style={{fontSize:16,color:"var(--c-text)",marginBottom:16,wordBreak:"break-all"}}>{staffUser.email||"（不明）"}</div>
        {pwOpen?(
          <div>
            <MyField label="現在のパスワード" type="password" autoComplete="current-password" value={pw.current} data-my-input="pwCurrent" onChange={e=>setPw({...pw,current:e.target.value})}/>
            <MyField label="新しいパスワード" type="password" autoComplete="new-password" value={pw.next} data-my-input="pwNext" hint={NEW_PASSWORD_HINT} onChange={e=>setPw({...pw,next:e.target.value})}/>
            <MyField label="新しいパスワード（確認）" type="password" autoComplete="new-password" value={pw.next2} data-my-input="pwNext2" onChange={e=>setPw({...pw,next2:e.target.value})}/>
            <MyMessage {...pwMsg}/>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <button data-my-action="changePassword" disabled={busy==="pw"} onClick={changePw} style={{...AB,opacity:busy==="pw"?.6:1}}>{busy==="pw"?"変更中…":"パスワードを変更"}</button>
              <button onClick={()=>{setPwOpen(false);setPwMsg({});setPw({current:"",next:"",next2:""});}} style={AGray}>やめる</button>
            </div>
          </div>
        ):(
          <div>
            <MyMessage {...pwMsg}/>
            <button data-my-action="openPassword" onClick={()=>{setPwOpen(true);setPwMsg({});}} style={AGray}>パスワードを変更</button>
          </div>
        )}
        <div style={{marginTop:18,paddingTop:14,borderTop:"1px solid var(--c-border)"}}>
          <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:4}}>現在のパスワードが分からないときは、登録したメールアドレスに再設定のメールを送れます。</div>
          <MyMessage {...resetMsg}/>
          <button data-my-action="sendReset" disabled={busy==="reset"} onClick={sendReset} style={MY_LINK_BTN}>{busy==="reset"?"送信中…":"再設定のメールを送る"}</button>
        </div>
      </section>

      <button data-my-action="logout" onClick={()=>{setBusy("logout");myLogout();}} disabled={busy==="logout"} style={{...AGray,width:"100%"}}>ログアウト</button>
      <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginTop:10}}>ログアウトしても、URL からのシフトの提出はこれまでどおりできます。</div>
      {/* 一番下に、この画面を開き直すURL（2026-10-04）。アカウントの入口は #/me で、ログインすればどの端末でも同じ画面になる。
          お店ごとの個別URL（#/m/）はアカウントとは別の入口なので、ここには出さない */}
      <section style={{...MY_SECTION,marginTop:16}} data-my-section="accountUrl">
        <div style={MY_SECTION_TITLE}>この画面のURL</div>
        <MyPageUrlBox url={buildMyAccountUrl(myPageBaseUrl())} note="このURLを開いてログインすると、どの端末でもこの画面になります。"/>
      </section>
    </div>
  );
}

// 未ログインのときの登録・ログイン・パスワード再設定
function MyAuthScreen({shopId,onClose}){
  const[mode,setMode]=useState("login"); // login | register | reset
  const[f,setF]=useState({displayName:"",number:"",email:"",password:"",password2:""});
  const[msg,setMsg]=useState(()=>{const n=ssGet(SS_MY_NOTICE,null);return n?{error:n}:{};});
  const[busy,setBusy]=useState(false);
  const[block,setBlock]=useState(null);
  const[checked,setChecked]=useState(false);
  // 新規登録はメール確認つき（EmailLinkSendBox）。メールリンクが使えない（Firebase の設定前）ときだけ従来の欄（classic）に切り替える
  const[classic,setClassic]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  useEffect(()=>{ssSave(SS_MY_NOTICE,null);},[]);
  useEffect(()=>{
    let alive=true;
    myBlockReason(shopId).then(b=>{if(alive){setBlock(b);setChecked(true);}}).catch(()=>{if(alive)setChecked(true);});
    return()=>{alive=false;};
  },[shopId]);
  const go=m=>{setMode(m);setMsg({});};
  const submit=async()=>{
    setBusy(true);setMsg({});
    let r;
    if(mode==="register") r=await myRegister(f,shopId);
    else if(mode==="login") r=await myLogin(f,shopId);
    else r=await mySendReset(f.email);
    if(r&&r.pending) return; // 再読み込み中
    setBusy(false);
    if(!r){setMsg({error:"処理に失敗しました。もう一度お試しください"});return;}
    if(r.error){setMsg({error:r.error});return;}
    if(r.ok){setMsg({ok:r.ok});return;}
    if(r.user) window.dispatchEvent(new CustomEvent("shifty:staffAccount",{detail:{user:r.user,profile:r.profile,profileError:r.profileError,draft:r.draft}}));
  };
  const onKey=e=>{if(e.key==="Enter"&&!busy)submit();};
  const blocked=block&&block.code!=="unknown";
  return(
    <div style={{minHeight:"100vh",background:"var(--c-bg)"}}>
      <MyHeader title="マイシフト" onClose={onClose}/>
      <div style={{maxWidth:420,margin:"0 auto",padding:"24px 16px 40px"}}>
        <p style={{fontSize:14,lineHeight:1.8,color:"var(--c-text2)",marginBottom:20}}>
          自分のシフトと給料の見込みを確認できます。アカウントは任意で、シフトの提出には必要ありません。
        </p>
        {blocked?(
          <div data-my-blocked={block.code} style={MY_SECTION}><MyMessage error={block.message}/></div>
        ):(
          <section style={MY_SECTION} data-my-auth={mode}>
            {mode!=="reset"&&<div role="tablist" style={{display:"flex",gap:20,borderBottom:"1px solid var(--c-border)",marginBottom:18}}>
              {[["login","ログイン"],["register","新規登録"]].map(([k,l])=>{const a=mode===k;return(
                <button key={k} role="tab" aria-selected={a} data-my-mode={k} onClick={()=>go(k)}
                  style={{background:"none",border:"none",borderBottom:`2px solid ${a?"var(--c-accent)":"transparent"}`,marginBottom:-1,padding:"10px 0",fontSize:15,fontWeight:a?700:600,color:a?"var(--c-text)":"var(--c-text3)",cursor:"pointer"}}>{l}</button>
              );})}
            </div>}
            {mode==="reset"&&<div style={MY_SECTION_TITLE}>パスワードの再設定</div>}
            {mode==="register"&&!classic?<EmailLinkSendBox kind="staff" hash={window.location.hash} initialEmail={f.email}
              onFallback={em=>{set("email",em);setClassic(true);setMsg({});}}/>:<>
            {mode==="register"&&<div data-email-link-fallback="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:12}}>確認メールを送れないため、この画面で登録します。</div>}
            {mode==="register"&&<>
              <MyField label="登録ネーム" value={f.displayName} maxLength={MY_DISPLAY_NAME_MAX} autoComplete="name" data-my-input="displayName" placeholder={MY_DISPLAY_NAME_PLACEHOLDER} onChange={e=>set("displayName",e.target.value)} hint="お店に登録されている名前と同じにしてください"/>
              <MyField label="従業員番号（任意）" value={f.number} maxLength={MY_NUMBER_MAX} inputMode="numeric" data-my-input="number" hint={MY_PROFILE_NUMBER_HINT} onChange={e=>set("number",e.target.value)}/>
            </>}
            <MyField label="メールアドレス" type="email" autoComplete="email" value={f.email} data-my-input="email" onChange={e=>set("email",e.target.value)} onKeyDown={onKey}/>
            {mode!=="reset"&&<MyField label="パスワード" type="password" autoComplete={mode==="register"?"new-password":"current-password"} value={f.password} data-my-input="password"
              hint={mode==="register"?NEW_PASSWORD_HINT:null} onChange={e=>set("password",e.target.value)} onKeyDown={onKey}/>}
            {mode==="register"&&<MyField label="パスワード（確認）" type="password" autoComplete="new-password" value={f.password2} data-my-input="password2" onChange={e=>set("password2",e.target.value)} onKeyDown={onKey}/>}
            <MyMessage {...msg}/>
            <button data-my-action="submit" disabled={busy||!checked} onClick={submit} style={{...AB,width:"100%",padding:"13px 18px",fontSize:15,opacity:busy||!checked?.6:1}}>
              {busy?"処理中…":mode==="register"?"アカウントを作成":mode==="login"?"ログイン":"再設定のメールを送る"}
            </button>
            {mode==="login"&&<button data-my-mode="reset" onClick={()=>go("reset")} style={{...MY_LINK_BTN,marginTop:10}}>パスワードを忘れた場合</button>}
            {mode==="reset"&&<button data-my-mode="login" onClick={()=>go("login")} style={{...MY_LINK_BTN,marginTop:10}}>ログインに戻る</button>}
            </>}
          </section>
        )}
        {/* 個別URL（ログイン不要）をなくした人の入口（2026-10-04）。アカウントのパスワードの再設定とは別 */}
        <details data-my-recover-details="1" style={{...MY_SECTION,marginTop:16}}>
          <summary style={{cursor:"pointer",fontSize:14,fontWeight:600,color:"var(--c-text2)",minHeight:32,display:"flex",alignItems:"center"}}>自分専用のURLをなくした場合</summary>
          <div style={{marginTop:10}}><MyPageRecoverBox inAuth/></div>
        </details>
      </div>
    </div>
  );
}

// メールのアカウントのマイシフト（2026-10-04）: 「自分のシフト」と「全員のシフト」（個別URLと同じ部品）。全員のシフトの店舗は
// 有効な紐付けのある全店舗のうち、公開済みの期間が直近3ヶ月にある店舗（myAllShiftChoices）。既定は募集URLから開いたときはその店舗、
// それ以外は公開済みの最新の期間が最も新しい店舗。選べる期間が1つも無い間は「全員のシフト」の切り替えを出さない
function MyAccountShiftPager({me,personal,shopId,onGoSettings}){
  const src=useMyAllShiftSources(me);
  const todayStr=fd(new Date());
  // ヘルプ先の店舗（公開済みか確定済みの期間・2026-10-05）。提出は src の部分読み（need）がそのまま読む
  // この端末で開いた個別URLの店舗のうち、紐付けの無い店舗も並べる（2026-10-05）。紐付けを読み終えてから読む（二重に読まない）
  const knownShops=useMyKnownPageShops(src.loading?null:"",src.loading?null:src.shops.map(x=>x.shopId));
  const ownShops=useMemo(()=>src.loading?src.shops:[...src.shops,...knownShops],[src.loading,src.shops,knownShops]);
  const helpDest=useMyHelpDestShops(ownShops);
  const choices=useMemo(()=>myAllShiftChoices({shops:[...ownShops,...helpDest],preferredShopId:shopId,todayStr}),[ownShops,helpDest,shopId,todayStr]);
  const panes=[{key:"mine",label:"自分のシフト",node:<MyShiftTab me={me} personal={personal} onGoSettings={onGoSettings}/>}];
  if(choices.shops.length)panes.push({key:"all",label:"全員のシフト",node:<MyAllShiftPane choices={choices} subsFor={src.subsFor} onNeed={src.need}/>});
  return <MyShiftPager panes={panes}/>;
}
// 入口。staffUser が null なら登録・ログイン、あれば下部タブ
function MyView({staffUser,onStaffUser,shopId,onClose}){
  const[tab,setTab]=useState("shift");
  const[profile,setProfile]=useState({displayName:"",number:""});
  const[profileState,setProfileState]=useState("loading"); // loading | ok | error
  // 登録はできたがプロフィールを書けなかったとき（ルール未反映など）の理由。設定タブに出し、入力した値を欄に残して保存し直せるようにする
  const[saveError,setSaveError]=useState(null);
  const draftRef=useRef(null);
  // 登録の直後（MyAuthScreen から）。uid は変わらないので再読み込みはせず、その場で切り替える
  useEffect(()=>{
    const h=e=>{
      const d=e.detail||{};
      if(!d.user) return;
      if(d.profile){draftRef.current=null;setProfile(myProfileOf(d.profile));setProfileState("ok");setSaveError(null);}
      else if(d.profileError){draftRef.current=myProfileOf(d.draft);setProfile(draftRef.current);setSaveError(d.profileError);}
      setTab(d.profileError?"settings":"shift");
      onStaffUser(d.user);
    };
    window.addEventListener("shifty:staffAccount",h);
    return()=>window.removeEventListener("shifty:staffAccount",h);
  },[onStaffUser]);
  const uid=staffUser&&staffUser.uid;
  const me=useMemo(()=>myAccountSubject(uid),[uid]);
  // 本人の勤務先・手入力のシフト・実績の上書き（E4）。マイシフトと設定タブが共有する
  const personal=useMyPersonal(me&&me.base);
  useEffect(()=>{
    if(!uid||!firebaseDB) return;
    let alive=true;
    firebaseDB.ref(`users/${uid}/profile`).once("value")
      .then(s=>{
        if(!alive)return;
        const v=s.val();
        // まだ書けていない（登録直後に保存が拒否された）なら、読めた空の値で入力を消さない
        if(!v&&draftRef.current){setProfileState("ok");return;}
        setProfile(myProfileOf(v));setProfileState("ok");
      })
      .catch(e=>{if(!alive)return;console.warn("プロフィールの読み込みに失敗:",e&&e.code);setProfileState("error");});
    return()=>{alive=false;};
  },[uid]);
  if(!staffUser) return <MyAuthScreen shopId={shopId} onClose={onClose}/>;
  const label=(MY_TABS.find(t=>t.key===tab)||MY_TABS[0]).label;
  return(
    <div data-my-view="1" style={{minHeight:"100vh",background:"var(--c-bg)"}}>
      <MyHeader title={label} onClose={onClose}/>
      <main style={{maxWidth:560,margin:"0 auto",padding:"16px 16px 96px"}}>
        {profile.displayName&&<div style={{fontSize:13,color:"var(--c-text3)",marginBottom:4}} data-my-who="1">{profile.displayName} さん</div>}
        {tab==="shift"&&<MyAccountShiftPager me={me} personal={personal} shopId={shopId} onGoSettings={()=>setTab("settings")}/>}
        {tab==="pay"&&<MyPayTab me={me} personal={personal} onGoSettings={()=>setTab("settings")}/>}
        {tab==="settings"&&<MySettingsTab staffUser={staffUser} me={me} profile={profile} profileState={profileState} initialError={saveError} shopId={shopId} personal={personal}
          onProfile={p=>{draftRef.current=null;setSaveError(null);setProfile(myProfileOf(p));setProfileState("ok");}}/>}
      </main>
      <MyTabBar tab={tab} onTab={setTab}/>
    </div>
  );
}

// ============================================================
// スタッフ個別URL（2026-10-04・ユーザーの仕様変更）
// ============================================================
// 募集URL（#/s/<token>）の画面から本人が申請 → その場で個別URL（#/m/<pageToken>）を表示し「承認待ち」。管理者がスタッフタブで
// 「スタッフ一覧のどの名前か」を選んで承認すると有効になり、どの端末で開いても同じスタッフの画面（ログイン不要）。
// 本人のデータは staffPageData/{pageToken}（users/{uid} と同じ形）に置き、画面はアカウントと同じ部品を「本人」（subject）を替えて使う。
// **pageToken を知っている人は誰でもこの画面と本人のデータを読める**（capability。ログインが無い以上、ルールで本人を見分けられない）。
// 給料は画面上の鍵（暗証番号）で伏せ、会社が登録した賃金だけは Cloud Functions が暗証番号を照合してから返す（P4）。
const MY_PAGES_LS="ots_myPages_v1"; // この端末で作った個別URL {shopId: {token, displayName}}（募集URLの画面で見せ直すため）
// この端末で開けた（承認済みで使えた）個別URL {shopId: {token, at}}（2026-10-04）。管理者が発行した URL を開いたときもここに入る。
// 募集URLの画面の「マイシフト」は、ここと MY_PAGES_LS の token のうち、いま使えるものがあれば個別URLの画面を重ねる（myPickOpenablePage）
const MY_PAGE_KNOWN_LS="ots_myPageKnown_v1";
function rememberKnownMyPage(shopId,token){
  if(!shopId||!isMyPageToken(token))return;
  try{
    const m=lg(MY_PAGE_KNOWN_LS,{})||{};
    if(m[shopId]&&m[shopId].token===token)return;
    ls(MY_PAGE_KNOWN_LS,{...m,[shopId]:{token,at:new Date().toISOString()}});
  }catch(e){console.warn("個別URLを覚えられませんでした:",e);}
}
// 「マイシフト」を押したときに重ねる個別URL。{token,name}|null。読めない・遅いとき（3秒）は null＝従来の画面
async function findOpenableMyPage(shopId,staffList){
  if(!shopId||!firebaseDB)return null;
  const cands=myPageOpenCandidates(lg(MY_PAGE_KNOWN_LS,{})||{},lg(MY_PAGES_LS,{})||{},shopId);
  if(!cands.length)return null;
  const read=Promise.all(cands.map(t=>firebaseDB.ref(`shops/${shopId}/staffPages/${t}`).once("value").then(s=>[t,s.val()],()=>[t,null])));
  const timeout=new Promise(r=>setTimeout(()=>r(null),3000));
  const rows=await Promise.race([read,timeout]);
  if(!rows)return null;
  return myPickOpenablePage(cands,Object.fromEntries(rows),staffList,shopId);
}
// 個別URLの本人。links() は承認された1店舗だけ（名前は staffPages の name が正）
function myPageSubject(o){
  const x=o||{};
  return{kind:"page",key:"p:"+x.token,payKey:x.pay&&x.pay.key||"",base:`staffPageData/${x.token}`,
    links:()=>Promise.resolve([{shopId:x.shopId,shopName:x.shopName||"",ok:true,name:x.name,personId:null,method:"page",at:x.approvedAt||""}]),
    companyPay:sid=>Promise.resolve(x.pay&&x.pay.byShop&&x.pay.byShop[sid]?x.pay.byShop[sid]:{state:"error",error:"locked",pay:null})};
}
function myPageBaseUrl(){return`${window.location.origin}${window.location.pathname}`;}
// コピー。clipboard API が無い・拒否される環境（http の LAN アドレス等）は、選択してコピーする旧方式に落とす
async function myCopyText(text){
  try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}}catch{/* 下の方式に落とす */}
  try{
    const ta=document.createElement("textarea");ta.value=text;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.top="-1000px";ta.style.fontSize="16px";
    document.body.appendChild(ta);ta.select();const ok=document.execCommand("copy");document.body.removeChild(ta);return!!ok;
  }catch{return false;}
}
// 個別URLの表示（URL・コピー・共有）。共有は Web Share API がある端末だけ
function MyPageUrlBox({url,note}){
  const[msg,setMsg]=useState("");
  const canShare=typeof navigator!=="undefined"&&typeof navigator.share==="function";
  return(
    <div data-my-page-url={url} style={{marginBottom:12}}>
      <div style={{fontSize:13,color:"var(--c-text)",background:"var(--c-input)",border:"1px solid var(--c-border)",borderRadius:8,padding:"10px 12px",
        wordBreak:"break-all",lineHeight:1.6,fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace"}}>{url}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
        <button data-my-action="copyPageUrl" onClick={async()=>setMsg(await myCopyText(url)?"コピーしました":"コピーできませんでした。URLを長押ししてコピーしてください")} style={AGray}>URLをコピー</button>
        {canShare&&<button data-my-action="sharePageUrl" onClick={()=>navigator.share({title:"Shifty",url}).catch(()=>{})} style={AGray}>共有</button>}
      </div>
      {msg&&<div role="status" data-my-copy-msg="1" style={{fontSize:13,color:"var(--c-text2)",marginTop:6}}>{msg}</div>}
      {note&&<div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginTop:6}}>{note}</div>}
    </div>
  );
}
const MY_PAGE_URL_NOTE="このURLを開くと、どの端末でもあなたのシフトの画面になります。ブックマークかホーム画面に追加しておいてください。ほかの人には教えないでください（URLを知っている人は誰でもこの画面を見られます）。";

// 募集URLの画面から開く登録（申請）。名前と任意の従業員番号を送り、その場で個別URLを出す（承認されるまで「承認待ち」）
function MyPageRegister({shopId,shopName,initialName,onClose}){
  const remembered=(lg(MY_PAGES_LS,{})||{})[shopId]||null;
  const[f,setF]=useState({displayName:initialName||"",number:""});
  const[made,setMade]=useState(remembered&&isMyPageToken(remembered.token)?remembered:null);
  const[status,setStatus]=useState(undefined); // 作った個別URLの状態（undefined=読み込み中・null=見つからない）
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!made||!firebaseDB)return;
    let alive=true;
    firebaseDB.ref(`shops/${shopId}/staffPages/${made.token}/status`).once("value").then(s=>{if(alive)setStatus(s.val()||null);},()=>{if(alive)setStatus(null);});
    return()=>{alive=false;};
  },[made&&made.token,shopId]);
  const submit=async()=>{
    setMsg({});
    if(DEMO_MODE){setMsg({error:MY_BLOCK_MESSAGES.demo});return;}
    if(!firebaseDB||!shopId){setMsg({error:"お店を読み込めませんでした。もう一度お試しください"});return;}
    const r=buildMyPageRequest(f,new Date().toISOString());
    if(r.error){setMsg({error:r.error});return;}
    setBusy(true);
    const token=genMyPageToken(myRand);
    try{
      // 先に逆引きを作る（作成後は書き換えられない＝URL を別の店舗へ付け替えられない）。次に申請の記録（pending だけ書ける）
      await fbSet(`staffPageTokens/${token}`,{shopId,at:r.rec.requestedAt});
      await fbSet(`shops/${shopId}/staffPages/${token}`,r.rec);
    }catch(e){
      setBusy(false);
      setMsg({error:isPermissionDeniedError(e)?"申請できませんでした（サーバー側の設定が未反映の可能性があります）":"申請できませんでした。通信状態を確認してもう一度お試しください"});
      return;
    }
    const rec={token,displayName:r.rec.displayName};
    ls(MY_PAGES_LS,{...(lg(MY_PAGES_LS,{})||{}),[shopId]:rec});
    setBusy(false);setMade(rec);setStatus("pending");
  };
  const url=made?buildMyPageUrl(myPageBaseUrl(),made.token):"";
  return(
    <div data-my-page-register="1" style={{minHeight:"100vh",background:"var(--c-bg)"}}>
      <MyHeader title="自分専用のURL" onClose={onClose}/>
      <div style={{maxWidth:480,margin:"0 auto",padding:"20px 16px 40px"}}>
        {made?(
          <section style={MY_SECTION} data-my-page-made={status||"unknown"}>
            <div style={MY_SECTION_TITLE}>{made.displayName} さんの個別URL{shopName?`（${shopName}）`:""}</div>
            <div style={{fontSize:14,lineHeight:1.8,color:"var(--c-text2)",marginBottom:12}}>
              {status==="approved"?"承認されています。このURLから自分のシフトを見て、提出できます。"
                :status==="pending"?"お店の管理者の承認を待っています。承認されると、このURLで自分のシフトを見て提出できるようになります。それまでは、これまでどおりこの画面から提出できます。"
                :status===undefined?"状態を確認しています…":(MY_PAGE_STATE_MESSAGES[status]||"このURLは使えません。もう一度作り直してください。")}
            </div>
            <MyPageUrlBox url={url} note={MY_PAGE_URL_NOTE}/>
            {status==="approved"&&<a data-my-action="openPage" href={url} style={{...AB,display:"inline-block",textDecoration:"none"}}>開く</a>}
            {(status==="rejected"||status==="revoked"||status===null)&&<button data-my-action="remakePage" onClick={()=>{setMade(null);setStatus(undefined);}} style={{...AGray,marginTop:8}}>作り直す</button>}
          </section>
        ):(
          <section style={MY_SECTION} data-my-page-form="1">
            <p style={{fontSize:14,lineHeight:1.8,color:"var(--c-text2)",marginBottom:16}}>
              自分専用のURLを作ると、次からは名前を入れずに提出でき、自分のシフトとお店のシフト表をいつでも見られます。お店の管理者の承認が必要です。作らなくても、これまでどおり提出できます。
            </p>
            <MyField label="名前（お店に登録されている名前）" value={f.displayName} maxLength={MY_DISPLAY_NAME_MAX} autoComplete="name" data-my-input="pageDisplayName" placeholder={MY_DISPLAY_NAME_PLACEHOLDER}
              onChange={e=>setF({...f,displayName:e.target.value})}/>
            <MyField label="従業員番号（任意）" value={f.number} maxLength={MY_NUMBER_MAX} inputMode="numeric" data-my-input="pageNumber"
              onChange={e=>setF({...f,number:e.target.value})}/>
            <MyMessage {...msg}/>
            <button data-my-action="requestPage" disabled={busy} onClick={submit} style={{...AB,width:"100%",padding:"13px 18px",fontSize:15,opacity:busy?.6:1}}>{busy?"作成中…":"個別URLを作って申請する"}</button>
          </section>
        )}
      </div>
    </div>
  );
}

// 管理者側（スタッフタブ）: 個別URLの申請。スタッフ一覧のどの名前に結び付けるかを選んで承認する（候補は従業員番号・名前の一致）。
// スタッフ一覧に無い人は、先にスタッフを追加してから承認する（ここでは追加しない＝プランの人数上限・別名の規則はスタッフの追加の経路が持つ）
function StaffPageRequestsCard({links,staffList,staffNumbers,mirrorPeople,shopId,tt}){
  const[busy,setBusy]=useState("");
  const[pick,setPick]=useState({}); // {token: 選んだ名前}
  if(!links||!links.enabled)return null;
  const{withCand,unmatched}=splitStaffPageRequests(links.pages,{shopId,staff:staffList,staffNumbers,mirrorPeople});
  const all=[...withCand,...unmatched].sort((a,b)=>String(a.req.requestedAt||"").localeCompare(String(b.req.requestedAt||"")));
  if(!all.length)return null;
  const names=myStaffNamesOf(staffList);
  const taken=approvedStaffPagesByName(links.pages);
  const who=r=>`${r.displayName||"（名前なし）"}${r.number?`（従業員番号 ${r.number}）`:""}`;
  const when=r=>{const d=new Date(r.requestedAt);return Number.isFinite(d.getTime())?`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")} に申請`:"";};
  const act=async(kind,token,name)=>{
    if(kind==="approve"&&taken[name]&&!window.confirm(`「${name}」さんには承認済みの個別URLがあります。新しいURLを承認すると、前のURLは使えなくなります。承認しますか？`))return;
    setBusy(token);
    const r=await links.pageAct(kind,token,name);
    setBusy("");
    tt(r.error?`▲ ${r.error}`:kind==="approve"?`✓ 「${name}」さんの個別URLを承認しました`:"申請を却下しました");
  };
  const row={padding:"12px 0",borderTop:"1px solid var(--c-border)"};
  const btn={...AGray,padding:"7px 12px",fontSize:13};
  return(
    <AC title="個別URLの申請">
      <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginBottom:6}}>スタッフがシフト募集URLの画面から自分専用のURLを申請しています。承認すると、そのURLで本人のシフトの閲覧と提出ができます（ログインは不要）。</div>
      {all.map(({token,req,cands})=>{
        const sel=pick[token]!==undefined?pick[token]:(cands.find(c=>!taken[c.name])||cands[0]||{}).name||"";
        return(
          <div key={token} data-page-request={token} style={row}>
            <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)"}}>{who(req)}</div>
            <div style={{fontSize:12,color:"var(--c-text4)",marginBottom:6}}>{when(req)}</div>
            {cands.length>0&&<div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginBottom:6}}>
              候補: {cands.map(c=>`${c.name}（${c.methods.map(m=>MY_LINK_METHOD_LABELS[m]).join("・")}${taken[c.name]?"・承認済みのURLあり":""}）`).join("、")}
            </div>}
            {!cands.length&&<div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginBottom:6}}>登録名・従業員番号のどちらとも一致しません。下でスタッフを選ぶか、スタッフ一覧に追加してから承認してください。</div>}
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <select data-page-request-name={token} value={sel} onChange={e=>setPick(p=>({...p,[token]:e.target.value}))} style={{...AI,width:"auto",flex:"1 1 160px",minWidth:0}}>
                <option value="">スタッフを選ぶ</option>
                {names.map(n=><option key={n} value={n}>{n}{taken[n]?"（承認済みのURLあり）":""}</option>)}
              </select>
              <button data-page-approve={token} disabled={busy===token||!sel} onClick={()=>act("approve",token,sel)} style={{...AB,padding:"7px 14px",fontSize:13,opacity:busy===token||!sel?.6:1}}>承認</button>
              <button data-page-reject={token} disabled={busy===token} onClick={()=>act("reject",token)} style={btn}>却下</button>
            </div>
          </div>
        );
      })}
    </AC>
  );
}
// 管理者側（スタッフの編集モーダルの中）: スタッフ専用のURL（個別URL）の発行・再表示・再発行・取り消し・暗証番号のリセット（2026-10-04 ユーザー指示
// 「個人リンクコードは新規登録に繋がる URL の方が助かる」）。発行すると承認済みの URL がその場でできる＝本人は開くだけで自分の画面に入る
// （名前・番号・メール・パスワード・コードの入力なし・承認待ちなし）。書くのは App の staffPageAct（オーナーが staffPages を直接書く・CF なし）。
// 1つの名前に承認済みは1つ: 発行済みの人には URL を出し直し、「新しいURLを発行」は確認つきの別操作（古い URL は使えなくなる）
function StaffPageEditSection({links,name,tt}){
  const[busy,setBusy]=useState(false);
  if(!links||!links.enabled)return null;
  const cur=approvedStaffPagesByName(links.pages)[name];
  const issue=async again=>{
    if(again&&!window.confirm(`「${name}」さんに新しいURLを発行しますか？いまのURLは使えなくなります（URLが漏れた・端末を替えたときに使います）。`))return;
    setBusy(true);
    const r=await links.pageAct("issue",null,name);
    setBusy(false);
    tt(r.error?`▲ ${r.error}`:again?"新しいURLを発行しました（前のURLは使えなくなりました）":"専用のURLを発行しました");
  };
  const act=async(kind,confirmMsg,okMsg)=>{
    if(!window.confirm(confirmMsg))return;
    setBusy(true);
    const r=await links.pageAct(kind,cur.token);
    setBusy(false);
    tt(r.error?`▲ ${r.error}`:okMsg);
  };
  if(!cur)return(
    <div data-staff-page="none">
      <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginBottom:8}}>
        このスタッフ専用のURLを発行して本人に送ると、本人はURLを開くだけで自分のシフトの確認と提出ができます（名前やパスワードの入力は不要）。本人がシフト募集URLの画面から申請したときは、スタッフタブの「個別URLの申請」に出ます。
      </div>
      <button data-staff-page-action="issue" disabled={busy} onClick={()=>issue(false)} style={{...AB,opacity:busy?.6:1}}>{busy?"発行中…":"このスタッフ専用のURLを発行"}</button>
    </div>
  );
  const d=new Date(cur.rec.approvedAt);
  return(
    <div data-staff-page="approved" data-staff-page-token={cur.token}>
      <div style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.7,marginBottom:6}}>
        専用のURLを発行済み{Number.isFinite(d.getTime())?`（${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}）`:""}。本人にこのURLを送ってください。
      </div>
      <MyPageUrlBox url={buildMyPageUrl(myPageBaseUrl(),cur.token)}/>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button data-staff-page-action="reissue" disabled={busy} onClick={()=>issue(true)} style={{...AGray,opacity:busy?.6:1}}>新しいURLを発行</button>
        <button data-staff-page-action="revoke" disabled={busy} onClick={()=>act("revoke",`「${name}」さんとの連携を解除しますか？解除すると専用のURLは使えなくなります。`,"連携を解除しました")} style={{...AGray,opacity:busy?.6:1}}>連携解除</button>
        <button data-staff-page-action="resetPin" disabled={busy} onClick={()=>act("resetPin",`「${name}」さんの給料の暗証番号をリセットしますか？本人が次に給料タブを開いたときに、新しい番号を決め直します。`,"暗証番号をリセットしました")} style={{...AGray,opacity:busy?.6:1}}>暗証番号をリセット</button>
      </div>
      <div style={{fontSize:11,color:"var(--c-text4)",lineHeight:1.6,marginTop:6}}>「新しいURLを発行」すると、いまのURLは使えなくなります。</div>
    </div>
  );
}

// ---- 本人のカレンダーと全員のシフト表の切り替え（P3）----
// 横スクロール（CSS scroll-snap）で2つの表示を切り替える。どちらを見ているかは上のタブで分かり、タブを押しても切り替わる
// （スワイプに気づかない人・スクリーンリーダー用）。**ピンチで拡大している間は横スクロールを止める**（拡大した表を左右に動かそうとして
// 隣の表示へ移ってしまわないように。visualViewport.scale で判定する）
function useMyPinchZoomed(){
  const[z,setZ]=useState(false);
  useEffect(()=>{
    const vv=typeof window!=="undefined"?window.visualViewport:null;
    if(!vv)return;
    const on=()=>setZ((vv.scale||1)>1.01);
    on();
    vv.addEventListener("resize",on);vv.addEventListener("scroll",on);
    return()=>{vv.removeEventListener("resize",on);vv.removeEventListener("scroll",on);};
  },[]);
  return z;
}
// 表示が1つ（全員のシフトに出せる期間が無い）ときは切り替えのタブを出さない。木の形（track と section）は同じなので、
// 読み込みの後で「全員のシフト」が足されても「自分のシフト」は作り直されない（表示中の月などの状態が残る）
function MyShiftPager({panes}){
  const ref=useRef(null);
  const[active0,setActive]=useState(0);
  const active=Math.min(active0,Math.max(0,panes.length-1));
  const zoomed=useMyPinchZoomed();
  const single=panes.length<2;
  const go=i=>{const el=ref.current;if(!el)return;el.scrollTo({left:i*el.clientWidth,behavior:"smooth"});setActive(i);};
  const onScroll=()=>{const el=ref.current;if(!el||!el.clientWidth)return;const i=Math.round(el.scrollLeft/el.clientWidth);if(i!==active&&i>=0&&i<panes.length)setActive(i);};
  return(
    <div data-my-pager={panes[active]&&panes[active].key} data-my-pager-locked={zoomed?"1":"0"} data-my-pager-count={panes.length}>
      {!single&&<div role="tablist" aria-label="表示の切り替え" style={{display:"flex",gap:4,background:"var(--c-input)",borderRadius:10,padding:4,marginBottom:12}}>
        {panes.map((p,i)=>{const a=i===active;return(
          <button key={p.key} role="tab" aria-selected={a} aria-controls={`my-pane-${p.key}`} data-my-pager-tab={p.key} onClick={()=>go(i)}
            style={{flex:1,minHeight:40,background:a?"var(--c-card)":"none",border:"none",borderRadius:8,fontSize:14,fontWeight:a?700:600,
              color:a?"var(--c-text)":"var(--c-text3)",boxShadow:a?"0 0 0 1px var(--c-border2)":"none",cursor:"pointer"}}>{p.label}</button>
        );})}
      </div>}
      <div ref={ref} data-my-pager-track="1" onScroll={onScroll}
        style={{display:"flex",alignItems:"flex-start",overflowX:zoomed||single?"hidden":"auto",overflowY:"visible",scrollSnapType:"x mandatory",
          scrollbarWidth:"none",WebkitOverflowScrolling:"touch",overscrollBehaviorX:"contain"}}>
        {panes.map((p,i)=>(
          <section key={p.key} id={`my-pane-${p.key}`} role={single?undefined:"tabpanel"} aria-label={p.label} data-my-pane={p.key} aria-hidden={i!==active}
            style={{flex:"0 0 100%",minWidth:0,scrollSnapAlign:"start",scrollSnapStop:"always",boxSizing:"border-box"}}>
            {p.node}
          </section>
        ))}
      </div>
    </div>
  );
}
// 全員のシフト（2026-10-04・2026-10-05 改め）。期間だけをプルダウンで選び、店舗の切り替えは無い（2026-10-05 ユーザー指示）。
// 先頭に所属店舗（myAllShiftChoices の既定の店舗）の表、その下に同じ期間（日付が重なる期間）のヘルプ先（公開済みか確定済み）と、
// Shifty を使っている別の店舗（紐付いた店舗・この端末で開いた個別URLの店舗）の表を縦に並べる（myAllShiftStack）。
// 選択肢は公開済みかつ直近3ヶ月だけで、既定は今日を含む期間（無ければ今日より前に始まった最も新しい期間）。選択肢が無ければ呼び出し側がこの表示ごと出さない。
// choices＝myAllShiftChoices の戻り値、subsFor(sid,pid)＝その期間の提出（undefined＝読み込み中・null＝読めない）、onNeed(sid,pid)＝読み込みの依頼
function myPeriodOptionLabel(p){return p.label||periodRangeLabel(p.startDate,p.endDate);}
function MyAllShiftPane({choices,subsFor,onNeed}){
  const[periodId,setPeriodId]=useState(null);
  const st=myAllShiftStack(choices,{periodId});
  if(!st)return null;
  const lab={...MY_LABEL,marginBottom:4};
  const many=st.blocks.length>1;
  return(
    <div data-my-all-pane="1" data-my-all-shop-sel={st.primary.shopId} data-my-all-period-sel={st.period.id} data-my-all-blocks={st.blocks.length}>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>
        <label style={{flex:"1 1 160px",minWidth:0}}><span style={lab}>期間</span>
          <select data-my-all-period="1" value={st.period.id} onChange={e=>setPeriodId(e.target.value)} style={{...AI,padding:"9px 10px"}}>
            {st.primary.options.map(p=><option key={p.id} value={p.id}>{myPeriodOptionLabel(p)}</option>)}
          </select></label>
      </div>
      {st.blocks.map(b=><MyAllShiftBlock key={b.shop.shopId+"|"+b.period.id} block={b} base={st.period} showShop={many} subsFor={subsFor} onNeed={onNeed}/>)}
    </div>
  );
}
// 全員のシフトの1店舗ぶん（店舗名の見出しと表）。base＝先頭の店舗で選んだ期間（期間の切り方が違う店舗だけ、その店舗の期間名を見出しに添える）
function MyAllShiftBlock({block,base,showShop,subsFor,onNeed}){
  const{shop,period,primary}=block;
  const sid=shop.shopId,pid=period.id;
  useEffect(()=>{if(sid&&pid&&onNeed)onNeed(sid,pid);},[sid,pid,onNeed]);
  const subs=subsFor(sid,pid);
  const sameRange=period.startDate===base.startDate&&period.endDate===base.endDate;
  return(
    <section data-my-all-block={sid} data-my-all-block-period={pid} data-my-all-helpdest={shop.helpDest?"1":"0"}
      style={primary?{}:{borderTop:"1px solid var(--c-border)",marginTop:18,paddingTop:14}}>
      {showShop&&<div data-my-all-block-title="1" style={{fontSize:15,fontWeight:700,color:"var(--c-text)",lineHeight:1.5,marginBottom:4,overflowWrap:"anywhere"}}>
        {(shop.shopName||sid)+(shop.helpDest?"（ヘルプ先）":"")}
        {!sameRange&&<span style={{fontSize:13,fontWeight:600,color:"var(--c-text3)"}}>{" ／ "+myPeriodOptionLabel(period)}</span>}
      </div>}
      {subs===undefined?<div data-my-all-loading="1" style={{fontSize:14,color:"var(--c-text3)",padding:"16px 4px"}}>読み込み中…</div>
        :subs===null?<MyMessage error="このお店のシフトを読み込めませんでした。時間をおいてもう一度開いてください"/>
        :<MyAllShiftTable period={period} staff={shop.staff} settings={shop.settings} subs={subs} plan={shop.plan} me={shop.name} shopId={sid} shopName={shop.shopName} helpDest={shop.helpDest}/>}
    </section>
  );
}
// 他店の略称（昼夜の人数で、他店へのヘルプの帯を数えないため。シフト作成タブの abbrToShop と同じ形）。
// 企業の写し（shops/{sid}/company.shops）の他店の settings/shopAbbrs だけを読む（auth != null で読める・書き込みなし）。読めた結果は覚える
const _myAbbrReads=new Map(); // sid → promise
function readMyOtherShopAbbrs(sid){
  if(_myAbbrReads.has(sid))return _myAbbrReads.get(sid);
  const pr=_myRead(`shops/${sid}/company/shops`).then(async co=>{
    const ids=co.ok&&co.v&&typeof co.v==="object"?Object.keys(co.v).filter(id=>id&&id!==sid):[];
    const rows=await Promise.all(ids.map(id=>_myRead(`shops/${id}/settings/shopAbbrs`).then(r=>[id,co.v[id],r.ok?r.v:null])));
    const m={};
    rows.forEach(([id,name,ab])=>Object.values(ab&&typeof ab==="object"?ab:{}).forEach(a=>{if(typeof a==="string"&&a&&!m[a])m[a]={id,name:name||id};}));
    return m;
  }).catch(()=>{_myAbbrReads.delete(sid);return{};});
  _myAbbrReads.set(sid,pr);
  return pr;
}
// 全員のシフト表の、他店でのヘルプ勤務（H2・2026-10-04）の材料。PDF（シフト作成タブの companyData）と同じ otherShopDataOf の形にする。
// 企業に連携していない店舗（shops/{sid}/company が無い）では他店を何も読まない。連携店舗（写しの法人が分かれば同じ法人だけ）ごとに
// settings・staff・periods と、**表示中の期間の日付にかかる期間の subs だけ**を期間ごとの部分読み（orderByChild("periodId")）で読む
// （店舗の subs 全件は読まない＝PDF とはここだけ違う）。どれも auth != null で読める。読めたものだけ30秒覚える。書き込みなし。
// 戻り値: null＝読み込み中（表はヘルプなしで先に出す）／{companyLink, otherShops, failed}。読めなかった他店は loadFailed（helperPersonOf の unread になる）
const _myHelperReads=new Map(); // key → {at, promise}
function _myHelperCached(key,fn){
  const hit=_myHelperReads.get(key);
  if(hit&&Date.now()-hit.at<MY_SHOP_READ_TTL_MS)return hit.promise;
  const promise=fn().then(v=>{if(!v||v.ok===false)_myHelperReads.delete(key);return v;},e=>{_myHelperReads.delete(key);throw e;});
  _myHelperReads.set(key,{at:Date.now(),promise});
  return promise;
}
function readMyHelperShop(sid){
  return _myHelperCached("shop:"+sid,async()=>{
    const[se,st,pe]=await Promise.all([_myRead(`shops/${sid}/settings`),_myRead(`shops/${sid}/staff`),_myRead(`shops/${sid}/periods`)]);
    if(!se.ok||!st.ok||!pe.ok)return{ok:false};
    return{ok:true,settings:se.v,staff:st.v,periods:pe.v};
  });
}
function readMyHelperSubs(sid,pid){
  return _myHelperCached("subs:"+sid+"|"+pid,()=>readMyPeriodSubs(sid,pid).then(v=>v===null?{ok:false}:{ok:true,list:v}));
}
function useMyHelperShops(shopId,period){
  const[st,setSt]=useState(null);
  const key=shopId&&period?[shopId,period.id,period.startDate,period.endDate].join("|"):"";
  useEffect(()=>{
    setSt(null);
    if(!key||!firebaseDB)return;
    let alive=true;
    (async()=>{
      const co=await _myHelperCached("company:"+shopId,()=>_myRead(`shops/${shopId}/company`));
      const link=co&&co.ok&&co.v&&typeof co.v==="object"?co.v:null;
      const shopsMap=link&&link.shops&&typeof link.shops==="object"?link.shops:null;
      if(!shopsMap){if(alive)setSt({companyLink:null,otherShops:{},failed:!(co&&co.ok)});return;}
      const ents=link.shopEntities&&typeof link.shopEntities==="object"?link.shopEntities:{};
      const myEnt=typeof link.entityId==="string"?link.entityId:null;
      const ids=Object.keys(shopsMap).filter(id=>id&&id!==shopId&&!(myEnt&&typeof ents[id]==="string"&&ents[id]!==myEnt));
      const rows=await Promise.all(ids.map(async id=>{
        const nm=typeof shopsMap[id]==="string"&&shopsMap[id]?shopsMap[id]:id;
        const sh=await readMyHelperShop(id).catch(()=>({ok:false}));
        if(!sh.ok)return[id,otherShopDataOf({name:nm,loadFailed:true})];
        const ps=Object.values(sh.periods||{}).filter(q=>q&&q.id&&q.startDate&&q.endDate&&q.startDate<=period.endDate&&period.startDate<=q.endDate);
        const lists=await Promise.all(ps.map(q=>readMyHelperSubs(id,q.id).catch(()=>({ok:false}))));
        const subs={};
        lists.forEach(r=>{if(r.ok)r.list.forEach(s=>{subs[s.id]=s;});});
        return[id,otherShopDataOf({name:nm,settings:sh.settings,subs,staff:sh.staff,periods:sh.periods,loadFailed:lists.some(r=>!r.ok)})];
      }));
      if(alive)setSt({companyLink:link,otherShops:Object.fromEntries(rows),failed:false});
    })().catch(e=>{console.warn("全員のシフト: 他店の読み込みに失敗:",e&&e.code);if(alive)setSt({companyLink:null,otherShops:{},failed:true});});
    return()=>{alive=false;};
  },[key]);
  return st;
}
// 全員のシフトのヘルプ先の店舗（2026-10-05 ユーザー指示）。自分の店舗（bases=[{shopId,name,settings,plan}]）ごとに企業の写しを読み、
// 連携店舗（同じ法人）の settings・staff・periods を読んで、同じ人の登録がある店舗（myHelpDestRegs）を返す。
// 提出はここでは読まない（選んだ期間だけを呼び出し側が部分読みする）。企業に連携していない店舗では他店を読まない。書き込みなし・30秒覚える。
// 戻り値: myAllShiftChoices に足す店舗の配列 [{shopId, shopName, name（その店舗での登録名）, periods, settings（企業設定を重ねた）, staff, plan（自分の店舗のプラン）, helpDest:true,
//   baseShopId（どの自分の店舗のヘルプ先か＝myAllShiftStack がその店舗の直後に並べる）}]
function useMyHelpDestShops(bases){
  const[st,setSt]=useState({}); // 自分の店舗ID → 配列
  const list=Array.isArray(bases)?bases.filter(b=>b&&b.shopId&&b.name):[];
  const key=list.map(b=>b.shopId+":"+b.name+":"+(b.plan||"")).join(",");
  const listRef=useRef(list);listRef.current=list;
  useEffect(()=>{
    if(!key||!firebaseDB)return;
    let alive=true;
    listRef.current.forEach(b=>{
      (async()=>{
        const co=await _myHelperCached("company:"+b.shopId,()=>_myRead(`shops/${b.shopId}/company`));
        const link=co&&co.ok&&co.v&&typeof co.v==="object"?co.v:null;
        const shopsMap=link&&link.shops&&typeof link.shops==="object"?link.shops:null;
        if(!shopsMap){if(alive)setSt(p=>({...p,[b.shopId]:[]}));return;}
        const ids=Object.keys(shopsMap).filter(id=>id&&id!==b.shopId);
        const metas=new Map(await Promise.all(ids.map(id=>readMyHelperShop(id).then(v=>[id,v],()=>[id,{ok:false}]))));
        const nameOf=id=>typeof shopsMap[id]==="string"&&shopsMap[id]?shopsMap[id]:id;
        const pre={};
        metas.forEach((v,id)=>{if(v.ok)pre[id]=otherShopDataOf({name:nameOf(id),settings:v.settings,staff:v.staff,periods:v.periods});});
        const regs=myHelpDestRegs({shopId:b.shopId,name:b.name,settings:b.settings,companyLink:link,otherShops:pre});
        const rows=regs.map(r=>{
          const v=metas.get(r.shopId);
          const periods=Object.values(v.periods||{}).filter(q=>q&&q.id&&q.startDate&&q.endDate).sort((a,c)=>String(a.startDate).localeCompare(String(c.startDate)));
          return{shopId:r.shopId,shopName:nameOf(r.shopId),name:r.name,periods,settings:applyCompanySettings(v.settings||makeSettings(r.shopId),link.settings||{}),
            staff:v.staff||[],plan:b.plan,helpDest:true,baseShopId:b.shopId};
        });
        if(alive)setSt(p=>({...p,[b.shopId]:rows}));
      })().catch(e=>{console.warn("全員のシフト: ヘルプ先の読み込みに失敗:",e&&e.code);if(alive)setSt(p=>({...p,[b.shopId]:[]}));});
    });
    return()=>{alive=false;};
  },[key]);
  return useMemo(()=>{
    const own=new Set(list.map(b=>b.shopId));
    const seen=new Set();
    return list.flatMap(b=>st[b.shopId]||[]).filter(r=>!own.has(r.shopId)&&!seen.has(r.shopId)&&!!seen.add(r.shopId));
  },[key,st]);
}
// 全員のシフトに並べる「Shifty を使っている別の店舗」のうち、この端末で開けた・作った個別URLの店舗（2026-10-05 ユーザー指示）。
// 店舗ごとに staffPages/{token}（token を知っていれば読める）と periods・settings・staff・プラン・店舗名を読み、承認済みで名前がスタッフ一覧に
// ある個別URL（resolveMyPage の ok）の店舗だけを返す。exclude（いま開いている店舗）と skip（紐付けで既に並べる店舗）は読まない。書き込みなし。
// 戻り値: myAllShiftChoices に渡す店舗の配列 [{shopId, shopName, name, periods, settings, staff, plan}]
function useMyKnownPageShops(exclude,skip){
  const[rows,setRows]=useState([]);
  const skipKey=(Array.isArray(skip)?skip:[]).slice().sort().join(",");
  useEffect(()=>{
    if(exclude===null||exclude===undefined||!firebaseDB){setRows(p=>p.length?[]:p);return;}
    const skipSet=new Set(skipKey?skipKey.split(","):[]);
    const cands=myKnownPageShops(lg(MY_PAGE_KNOWN_LS,{})||{},lg(MY_PAGES_LS,{})||{},exclude||"").filter(c=>!skipSet.has(c.shopId));
    if(!cands.length){setRows(p=>p.length?[]:p);return;}
    let alive=true;
    Promise.all(cands.map(async c=>{
      const sh=await readMyShiftShopShared(c.shopId).catch(()=>({ok:false}));
      if(!sh||!sh.ok)return null;
      for(const t of c.tokens){
        const r=await _myRead(`shops/${c.shopId}/staffPages/${t}`);
        const pg=resolveMyPage(t,{shopId:c.shopId},r.ok?r.v:null,sh.staff);
        if(pg.state!=="ok")continue;
        const nm=await _myRead(`global/shops/${c.shopId}/name`);
        return{shopId:c.shopId,shopName:nm.ok&&typeof nm.v==="string"&&nm.v?nm.v:c.shopId,name:pg.name,periods:sh.periods,settings:sh.settings,staff:sh.staff,plan:sh.plan};
      }
      return null;
    })).then(v=>{if(alive)setRows(v.filter(Boolean));},e=>{console.warn("全員のシフト: 別の店舗の読み込みに失敗:",e&&e.code);if(alive)setRows([]);});
    return()=>{alive=false;};
  },[exclude,skipKey]);
  return rows;
}
// 選んだ期間の提出だけを部分読みする（読んだ期間は覚えて読み直さない・書き込みなし）。subsFor(sid,pid): undefined＝読み込み中・null＝読めない
function useMyPeriodSubsLoader(){
  const[subs,setSubs]=useState({});
  const startedRef=useRef(new Set());
  const need=useCallback((sid,pid)=>{
    const k=sid+"|"+pid;
    if(startedRef.current.has(k))return;
    startedRef.current.add(k);
    readMyPeriodSubs(sid,pid).then(v=>setSubs(p=>({...p,[k]:v})));
  },[]);
  const subsFor=useCallback((sid,pid)=>subs[sid+"|"+pid],[subs]);
  return{subsFor,need};
}
// 全員のシフト表（公開済みだけ）。**PDF のシフト表と同じ HTML**（buildMyShiftSheet → app-utils.js の shiftTableHtmlOf）を、
// 比率を保ったまま画面の横幅に合わせて縮める（transform: scale・横スクロール 0・細部はピンチで拡大）。
// 色は PDF と同じ固定色（白地・黒文字）なので、ダーク表示でも紙と同じ見た目になる
function MyAllShiftTable({period,staff,settings,subs,plan,me,shopId,shopName,helpDest=false}){
  const boxRef=useRef(null),sheetRef=useRef(null);
  const[width,setWidth]=useState(0);
  const[nat,setNat]=useState(null); // 表の本来の大きさ {w,h}
  const[abbrs,setAbbrs]=useState({});
  useEffect(()=>{
    const el=boxRef.current;if(!el)return;
    const upd=()=>setWidth(el.clientWidth);
    upd();
    if(typeof ResizeObserver==="function"){const ro=new ResizeObserver(upd);ro.observe(el);return()=>ro.disconnect();}
    window.addEventListener("resize",upd);return()=>window.removeEventListener("resize",upd);
  },[]);
  const todayStr=fd(new Date());
  const premium=featureEnabled("myShift",{plan});
  // 他店でのヘルプ勤務（H2）。読み終えるまではヘルプなしの表を出し、読めたら差し替える（表が空のまま止まらない）
  const helpers=useMyHelperShops(premium&&(isPeriodPublished(period)||isPeriodConfirmed(period))?shopId:null,period);
  const t=useMemo(()=>buildMyShiftSheet({period,staff,settings,subs,todayStr,premium,me,shopName,abbrToShop:abbrs,shopId,helpers,helpDest}),
    [period,staff,settings,subs,todayStr,premium,me,shopName,abbrs,shopId,helpers,helpDest]);
  const helperState=!helpers?"loading":(helpers.failed||t.helperUnread)?"partial":helpers.companyLink?"ok":"none";
  // 他店の略称は昼夜の人数を出す店舗のときだけ読む
  useEffect(()=>{
    if(!t.headcount||!shopId||!firebaseDB)return;
    let alive=true;
    readMyOtherShopAbbrs(shopId).then(m=>{if(alive&&Object.keys(m).length)setAbbrs(m);});
    return()=>{alive=false;};
  },[t.headcount,shopId]);
  // transform は配置の大きさを変えないので、本来の大きさは表を描いたあと1回測れば足りる（文字の読み込みで変わったときだけ測り直す）
  React.useLayoutEffect(()=>{
    const el=sheetRef.current;
    if(!el){setNat(null);return;}
    const upd=()=>setNat(p=>{const w=el.offsetWidth,h=el.offsetHeight;return p&&p.w===w&&p.h===h?p:{w,h};});
    upd();
    if(typeof ResizeObserver==="function"){const ro=new ResizeObserver(upd);ro.observe(el);return()=>ro.disconnect();}
  },[t.html]);
  const sc=nat?myShiftSheetScale(width,nat.w):1;
  // 期間なし・Premium でない・未公開は何も出さない（選択肢を公開済みに絞った MyAllShiftPane からは来ない。案内文は出さない＝ユーザー指示）
  return(
    <div ref={boxRef} data-my-all="1" data-my-all-helpers={helperState} style={{width:"100%",minWidth:0}}>
      {t.state==="ok"&&<div data-my-all-state="ok">
        <div style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.6,marginBottom:8}}>
          {/* 提出だけが未確定なので、店舗が出したシフトは公開でも「確定」と表示する（2026-10-05 ユーザー指示） */}
          {helpDest?"ヘルプ先 ／ ":""}確定{(()=>{const d=new Date(t.shownAt);return t.shownAt&&Number.isFinite(d.getTime())?`（${d.getMonth()+1}/${d.getDate()}）`:"";})()}
        </div>
        {helperState==="partial"&&<div data-my-all-helper-note="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.6,marginBottom:8}}>
          ほかのお店でのヘルプ勤務の一部を読み込めませんでした。表に出ていない勤務があるかもしれません
        </div>}
        <div data-my-sheet-frame="1" style={{width:"100%",height:nat?Math.ceil(nat.h*sc):0,overflow:"hidden"}}>
          <div ref={sheetRef} data-my-sheet="1" data-my-sheet-scale={Math.round(sc*1000)/1000}
            style={{width:"max-content",transform:`scale(${sc})`,transformOrigin:"0 0",background:"#fff",color:"#000",visibility:nat?"visible":"hidden"}}
            dangerouslySetInnerHTML={{__html:t.html}}/>
        </div>
      </div>}
    </div>
  );
}

// 個別URLの画面の状態（承認待ち・却下・取り消し・見つからない）
function MyPageStatusScreen({state,shopName,token,onClose=null}){
  const url=isMyPageToken(token)?buildMyPageUrl(myPageBaseUrl(),token):"";
  return(
    <div data-my-page-state={state} style={{minHeight:"100vh",background:"var(--c-bg)"}}>
      <MyHeader title={shopName||"Shifty"} onClose={onClose}/>
      <div style={{maxWidth:480,margin:"0 auto",padding:"24px 16px 40px"}}>
        <section style={MY_SECTION}>
          <div style={MY_SECTION_TITLE}>{state==="pending"?"承認待ち":state==="loading"?"読み込み中…":"このURLは使えません"}</div>
          {state!=="loading"&&<div data-my-page-message="1" style={{fontSize:14,lineHeight:1.8,color:"var(--c-text2)",marginBottom:state==="pending"?14:0}}>{MY_PAGE_STATE_MESSAGES[state]||MY_PAGE_STATE_MESSAGES.missing}</div>}
          {state==="pending"&&url&&<MyPageUrlBox url={url} note="承認されるまでは、お店から受け取ったシフト募集のURLから提出できます。"/>}
        </section>
      </div>
    </div>
  );
}
// ---- 給料の暗証番号（P4）----
// 照合・保存は Cloud Functions myPagePin だけ（ハッシュと試行回数は staffPagePins＝クライアントから読み書きできない）。
// 開いた状態は MyPageView のメモリにだけ持つ（再読み込み・10分操作なしで伏せ直す）。CF が使えない（dev は Spark・未デプロイ）ときは開かない
function myPinErrorText(r){return r&&r.error?String(r.error):"";}
function MyPinField({label,value,onChange,name,onKeyDown}){
  return <MyField label={label} type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={value} data-my-input={name}
    onChange={e=>onChange(e.target.value)} onKeyDown={onKeyDown}/>;
}
function MyPagePayGate({token,onUnlock}){
  const[st,setSt]=useState(undefined); // undefined=確認中・{hasPin,waitSec}・{error}
  const[f,setF]=useState({pin:"",pin2:""});
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState(false);
  const[seq,setSeq]=useState(0);
  useEffect(()=>{
    let alive=true;setSt(undefined);
    myCallCF("myPagePin",{token,action:"status"}).then(r=>{if(alive)setSt(r&&r.ok?{hasPin:!!r.hasPin,waitSec:Number(r.waitSec)||0}:{error:myPinErrorText(r)||"failed"});});
    return()=>{alive=false;};
  },[token,seq]);
  const submit=async()=>{
    setMsg({});
    const setting=st&&!st.hasPin;
    const e=validateMyPagePinInput(f.pin,setting?f.pin2:undefined);
    if(e){setMsg({error:e});return;}
    setBusy(true);
    const r=await myCallCF("myPagePin",{token,action:setting?"set":"verify",pin:normalizeMyPagePin(f.pin)});
    setBusy(false);
    if(!r||r.error||!r.ok){setMsg({error:myPinErrorText(r)||"開けませんでした。もう一度お試しください"});setF({pin:"",pin2:""});return;}
    onUnlock(r);
  };
  const onKey=e=>{if(e.key==="Enter"&&!busy)submit();};
  return(
    <section style={MY_SECTION} data-my-pin-gate={st===undefined?"loading":st.error?"error":st.hasPin?"verify":"set"}>
      <div style={MY_SECTION_TITLE}>給料は暗証番号で開きます</div>
      {st===undefined&&<div style={{fontSize:14,color:"var(--c-text3)"}}>確認しています…</div>}
      {st&&st.error&&<>
        <MyMessage error="暗証番号を確認できませんでした（サーバー側の設定が未反映か、通信できません）。時間をおいてもう一度お試しください"/>
        <button data-my-action="retryPin" onClick={()=>setSeq(x=>x+1)} style={AGray}>もう一度</button>
      </>}
      {st&&!st.error&&<>
        <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:12}}>
          {st.hasPin?"自分で決めた4桁の暗証番号を入れてください。忘れたときはお店の管理者にリセットしてもらえます。"
            :"給料の見込みを見るための4桁の暗証番号を決めてください。このURLを知っている人に給料を見られないようにするためのものです。"}
        </div>
        <MyPinField label={st.hasPin?"暗証番号":"暗証番号（4桁の数字）"} name="pin" value={f.pin} onChange={v=>setF({...f,pin:v})} onKeyDown={onKey}/>
        {!st.hasPin&&<MyPinField label="暗証番号（確認）" name="pin2" value={f.pin2} onChange={v=>setF({...f,pin2:v})} onKeyDown={onKey}/>}
        <MyMessage {...msg}/>
        <button data-my-action="submitPin" disabled={busy} onClick={submit} style={{...AB,width:"100%",opacity:busy?.6:1}}>{busy?"確認中…":st.hasPin?"開く":"決めて開く"}</button>
      </>}
    </section>
  );
}
function MyPagePinChange({token}){
  const[f,setF]=useState({cur:"",pin:"",pin2:""});
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState(false);
  const submit=async()=>{
    setMsg({});
    const e=(isValidMyPagePin(f.cur)?null:"いまの暗証番号を入れてください")||validateMyPagePinInput(f.pin,f.pin2);
    if(e){setMsg({error:e});return;}
    setBusy(true);
    const r=await myCallCF("myPagePin",{token,action:"set",currentPin:normalizeMyPagePin(f.cur),pin:normalizeMyPagePin(f.pin)});
    setBusy(false);
    setF({cur:"",pin:"",pin2:""});
    setMsg(r&&r.ok?{ok:"暗証番号を変更しました"}:{error:myPinErrorText(r)||"変更できませんでした"});
  };
  return(
    <section style={MY_SECTION} data-my-section="pin">
      <div style={MY_SECTION_TITLE}>給料の暗証番号</div>
      <MyPinField label="いまの暗証番号" name="pinCur" value={f.cur} onChange={v=>setF({...f,cur:v})}/>
      <MyPinField label="新しい暗証番号" name="pinNew" value={f.pin} onChange={v=>setF({...f,pin:v})}/>
      <MyPinField label="新しい暗証番号（確認）" name="pinNew2" value={f.pin2} onChange={v=>setF({...f,pin2:v})}/>
      <MyMessage {...msg}/>
      <button data-my-action="changePin" disabled={busy} onClick={submit} style={{...AGray,opacity:busy?.6:1}}>{busy?"変更中…":"暗証番号を変更"}</button>
    </section>
  );
}
// ---- 自分専用のURLをなくしたとき（2026-10-08 ユーザー指示「URLをなくしたとき用のメールアドレスをアカウント登録で解決・統一」）----
// 以前は個別URLにメールアドレスを任意で登録し、なくしたら CF recoverPageUrl でURLを送り直していた（setPageEmail・recoverPageUrl）。
// いまはマイシフトのアカウント（メール＋パスワード）に一本化した: 個別URLのお店をアカウントに追加しておけば（MyPageAccountLinkBox・CF linkStaffPage）、
// URLをなくしてもアカウントでログインして見られる。追加していない人はお店の管理者にURLを再発行してもらう。
// CF・ルール・保存済みのアドレス（CF 専用の置き場）は残してある（クライアントから呼ばなくなっただけ）
const MY_PAGE_LOST_NOTE="アカウントに追加しておけば、URLをなくしてもメールアドレスとパスワードでログインして見られます。";
// マイシフトのアカウントの画面（#/me）を開く。search を変えて開き直す（App は起動時の URL で一度だけ画面を決めるため、ハッシュだけ変えても描き替わらない）
function myOpenAccountScreen(){
  const u=buildMyAccountUrl(myPageBaseUrl());
  const same=window.location.search==="?openExternalBrowser=1";
  window.location.assign(u);
  if(same)window.location.reload();
}
// 個別URLの設定タブの案内（以前のメールアドレスの欄の位置）。追加の操作はすぐ上の「マイシフトのアカウントに追加」
function MyPageLostNote(){
  return(
    <section style={MY_SECTION} data-my-section="pageLost">
      <div style={MY_SECTION_TITLE}>URLをなくしたときのために</div>
      <div data-my-page-lost-note="1" style={{fontSize:14,color:"var(--c-text2)",lineHeight:1.8}}>{MY_PAGE_LOST_NOTE}上の「マイシフトのアカウントに追加」から追加できます。</div>
    </section>
  );
}
// URLをなくした人への案内（募集URLの画面・マイシフトのログイン画面）。inAuth: マイシフトのログイン画面の中（ログインはその画面の上でできる）
function MyPageRecoverBox({inAuth=false}){
  return(
    <div data-my-page-recover="1">
      <div style={{fontSize:14,color:"var(--c-text2)",lineHeight:1.8,marginBottom:inAuth?0:12}}>
        自分専用のURLのお店をマイシフトのアカウントに追加済みなら、{inAuth?"この画面の上からログインしてください":"マイシフト（アカウントの画面）からログインしてください"}。
        追加していない場合は、お店の管理者にURLの再発行を頼んでください。
      </div>
      {!inAuth&&<button data-my-action="openAccount" onClick={myOpenAccountScreen} style={{...AB,width:"100%"}}>マイシフトにログインする</button>}
    </div>
  );
}
function MyPageRecoverScreen({onClose}){
  return(
    <div data-my-page-recover-screen="1" style={{minHeight:"100vh",background:"var(--c-bg)"}}>
      <MyHeader title="自分専用のURLをなくした場合" onClose={onClose}/>
      <div style={{maxWidth:480,margin:"0 auto",padding:"20px 16px 40px"}}><section style={MY_SECTION}><MyPageRecoverBox/></section></div>
    </div>
  );
}

// 個別URLの設定タブ: 勤務先・月間目標（暗証番号で給料を開いている間だけ）・**一番下に個別URL**（2026-10-04 ユーザー指示
// 「設定の1番下に個別URLを表示。管理者画面でのみ変更可能」）。URL は表示・コピー・共有だけで、本人の画面からは変更も再発行もできない
// 専用URLのお店をメールのアカウント（マイシフト）に追加する（2026-10-05 ユーザー指示「スタッフ専用のURLのお店をアカウントに増やせるように」）。
// CF linkStaffPage が URL の承認と名前を確かめてリンクする（管理者の再承認なし）。暗証番号を決めている URL は番号を入れてから。
// 個別URLで入れた本人のデータ（手入力の勤務先・給料設定・目標・振込額）はアカウントへ持ち込まない（ユーザー決定）＝お店だけを足す
const SS_MY_PAGE_LINK_INTENT="ss_myPageLinkIntent";
function MyPageAccountLinkBox({token,shopId,shopName,name,staffUser,onLogin}){
  const uid=staffUser&&staffUser.uid;
  const[links,setLinks]=useState(undefined);
  const[pinSt,setPinSt]=useState(undefined); // undefined=確認中・{hasPin}・{error}
  const[pin,setPin]=useState("");
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState(false);
  const[seq,setSeq]=useState(0);
  useEffect(()=>{
    if(!uid)return;
    let alive=true;setLinks(undefined);
    readMyLinks(uid).then(v=>{if(alive)setLinks(v);}).catch(()=>{if(alive)setLinks(null);});
    return()=>{alive=false;};
  },[uid,seq]);
  const state=myPageAccountLinkState({staffUser,links,shopId,name});
  useEffect(()=>{
    if(state!=="ready")return;
    let alive=true;
    myCallCF("myPagePin",{token,action:"status"}).then(r=>{if(alive)setPinSt(r&&r.ok?{hasPin:!!r.hasPin}:{error:true});});
    return()=>{alive=false;};
  },[state,token]);
  const add=async()=>{
    setMsg({});
    const p=normalizeMyPagePin(pin);
    if(pinSt&&pinSt.hasPin&&!/^[0-9]{4}$/.test(p)){setMsg({error:"このURLの暗証番号（4桁の数字）を入れてください"});return;}
    setBusy(true);
    const r=await myCallCF("linkStaffPage",pinSt&&pinSt.hasPin?{token,pin:p}:{token});
    setBusy(false);setPin("");
    if(!r||r.error||!r.ok){setMsg({error:(r&&r.error)||"追加できませんでした。時間をおいてもう一度お試しください"});return;}
    setMsg({ok:r.already?"このお店は既にアカウントに追加されています":`${shopName||"このお店"}をマイシフトのアカウントに追加しました`});
    setSeq(x=>x+1);
  };
  return(
    <section style={MY_SECTION} data-my-section="pageAccount" data-my-page-account={state}>
      <div style={MY_SECTION_TITLE}>マイシフトのアカウントに追加</div>
      {state==="login"&&<>
        <div style={{fontSize:14,color:"var(--c-text2)",lineHeight:1.8,marginBottom:12}}>
          メールアドレスで登録したマイシフトのアカウントにこのお店を追加すると、掛け持ち先のお店と一緒にシフトと給料を見られます。このURLもそのまま使えます。
        </div>
        <button data-my-action="pageAccountLogin" onClick={onLogin} style={{...AB,width:"100%"}}>ログイン・登録して追加する</button>
      </>}
      {state==="loading"&&<div style={{fontSize:14,color:"var(--c-text3)"}}>確認しています…</div>}
      {state==="unread"&&<>
        <MyMessage error="アカウントのリンクを確認できませんでした。時間をおいてもう一度お試しください"/>
        <button data-my-action="retryPageAccount" onClick={()=>setSeq(x=>x+1)} style={AGray}>もう一度</button>
      </>}
      {state==="linked"&&<div data-my-page-account-linked="1" style={{fontSize:14,color:"var(--c-text2)",lineHeight:1.8}}>
        このお店はマイシフトのアカウント{staffUser.email?`（${staffUser.email}）`:""}に追加済みです。<a href="#/me" style={{color:"var(--c-accent)"}}>アカウントのマイシフトを開く</a>
      </div>}
      {state==="other"&&<MyMessage error={`ログイン中のアカウントは、このお店の別の名前とリンクしています。アカウントの設定の「勤務先のお店」で解除してから追加してください`}/>}
      {state==="ready"&&<>
        <div style={{fontSize:14,color:"var(--c-text2)",lineHeight:1.8,marginBottom:12}}>
          ログイン中のアカウント{staffUser.email?`（${staffUser.email}）`:""}に、{shopName}の「{name}」さんとして追加します。お店の管理者の承認はこのURLで済んでいるので、すぐに追加されます。
          このURLで入れた勤務先・給料の設定などはアカウントには移りません。
        </div>
        {pinSt===undefined&&<div style={{fontSize:13,color:"var(--c-text3)",marginBottom:10}}>確認しています…</div>}
        {pinSt&&pinSt.hasPin&&<MyPinField label="このURLの暗証番号" name="pageAccountPin" value={pin} onChange={setPin} onKeyDown={e=>{if(e.key==="Enter"&&!busy)add();}}/>}
        <MyMessage {...msg}/>
        <button data-my-action="addPageToAccount" disabled={busy||pinSt===undefined} onClick={add} style={{...AB,width:"100%",opacity:busy||pinSt===undefined?.6:1}}>{busy?"追加しています…":"このお店をアカウントに追加"}</button>
      </>}
      {state!=="ready"&&msg.ok&&<MyMessage {...msg}/>}
    </section>
  );
}
function MyPageSettingsTab({me,personal,page,shopId,shopName,token,payUnlocked,staffUser,onAccountLogin}){
  return(
    <div>
      <MyWorkplacesSection me={me} personal={personal} payLocked={!payUnlocked}/>
      {payUnlocked&&<MyGoalSection me={me}/>}
      {payUnlocked&&<MyPagePinChange token={token}/>}
      {!payUnlocked&&<div data-my-pin-note="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,padding:"0 4px",marginBottom:16}}>月間目標と暗証番号の変更は、給料タブで暗証番号を入れると表示されます。</div>}
      <MyPushSection base={me&&me.base}/>
      <MyPageAccountLinkBox token={token} shopId={shopId} shopName={shopName} name={page.name} staffUser={staffUser} onLogin={onAccountLogin}/>
      {/* 個別URLは設定の一番下に置く（2026-10-04 ユーザー指示）。なくしたときの案内はその上（以前のメールアドレスの欄の位置） */}
      <MyPageLostNote/>
      <section style={MY_SECTION} data-my-section="page">
        <div style={MY_SECTION_TITLE}>あなたの個別URL</div>
        <div style={{fontSize:14,color:"var(--c-text2)",lineHeight:1.8,marginBottom:10}}>{shopName}の「{page.name}」さんのページです。</div>
        <MyPageUrlBox url={buildMyPageUrl(myPageBaseUrl(),token)} note={MY_PAGE_URL_NOTE}/>
        <div data-my-page-url-admin="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7}}>URLの変更はお店の管理者に依頼してください。</div>
      </section>
    </div>
  );
}
// 個別URLの入口。App が Phase1 で店舗を購読済み（periods・settings・staff・subs）。承認の状態は staffPages/{token} を購読して決める
// onClose: 募集URLの画面の「マイシフト」から重ねて開いたとき（2026-10-04）だけ。個別URLを直接開いたときは閉じる先が無いので null
function MyPageView({token,boot,shopId,shopName,periods,settings,staffList,subs,plan,syncStatus,onSub,onDeleteSub,onClose=null,staffUser=null}){
  const[rec,setRec]=useState(undefined); // shops/{sid}/staffPages/{token}（undefined=読み込み中・null=無い）
  // アカウントに追加するためにログインして戻ってきた（再読み込み）ときは設定タブから始める（MyPageAccountLinkBox）
  const[tab,setTab]=useState(()=>ssGet(SS_MY_PAGE_LINK_INTENT,null)===token?"settings":"shift");
  const[authOpen,setAuthOpen]=useState(false);
  useEffect(()=>{if(ssGet(SS_MY_PAGE_LINK_INTENT,null)===token&&staffUser)ssSave(SS_MY_PAGE_LINK_INTENT,null);},[token,staffUser]);
  // ログインの画面で登録が再読み込みなしで済んだとき（匿名 uid への連結）も、再読み込みして App にアカウントを読み直させる
  useEffect(()=>{
    if(!authOpen)return;
    const h=()=>location.reload();
    window.addEventListener("shifty:staffAccount",h);
    return()=>window.removeEventListener("shifty:staffAccount",h);
  },[authOpen]);
  const[pay,setPay]=useState(null);      // 暗証番号で開いた給料（P4）: {key, byShop}
  useEffect(()=>{
    if(!shopId||!isMyPageToken(token)||!firebaseDB)return;
    const r=firebaseDB.ref(`shops/${shopId}/staffPages/${token}`);
    const cb=r.on("value",s=>setRec(s.val()||null),e=>{console.warn("個別URLの読み込みに失敗:",e&&e.code);setRec(null);});
    return()=>r.off("value",cb);
  },[shopId,token]);
  const page=useMemo(()=>resolveMyPage(token,shopId?{shopId}:null,rec,staffList),[token,shopId,rec,staffList]);
  // 使えた個別URLはこの端末に覚える（募集URLの画面の「マイシフト」から、次はこの画面に入れるように）
  useEffect(()=>{if(page.state==="ok"&&shopId)rememberKnownMyPage(shopId,token);},[page.state,shopId,token]);
  const me=useMemo(()=>page.state==="ok"?myPageSubject({token,shopId,shopName,name:page.name,approvedAt:page.approvedAt,pay}):null,
    [page.state,page.name,token,shopId,shopName,pay]);
  const personal=useMyPersonal(me&&me.base);
  // 開いた給料は10分操作が無ければ伏せ直す（賃金閲覧パスコードと同じ PAY_UNLOCK_IDLE_MS）。URL の承認状態が変わったときも伏せる
  useEffect(()=>{
    if(!pay)return;
    let t=setTimeout(()=>setPay(null),PAY_UNLOCK_IDLE_MS);
    const bump=()=>{clearTimeout(t);t=setTimeout(()=>setPay(null),PAY_UNLOCK_IDLE_MS);};
    window.addEventListener("pointerdown",bump);window.addEventListener("keydown",bump);
    return()=>{clearTimeout(t);window.removeEventListener("pointerdown",bump);window.removeEventListener("keydown",bump);};
  },[pay]);
  useEffect(()=>{if(page.state!=="ok")setPay(null);},[page.state]);
  // 全員のシフト（2026-10-04 改め）: 公開済みかつ直近3ヶ月の期間から選ぶ。提出は App の購読（直近3ヶ月の期間ごとの部分購読＋最新の期間）を
  // そのまま使う＝選択肢と同じ窓なので追加の読み込みは無い（店舗の subs 全件は読まない）。未公開の期間は選択肢にも出さない
  const todayStr=fd(new Date());
  // この端末で開いた別の店舗の個別URL（2026-10-05・Shifty を使っている別の店舗も同じ画面に縦に並べる）
  const knownShops=useMyKnownPageShops(page.state==="ok"?shopId:null,[]);
  const homeShops=useMemo(()=>shopId&&page.state==="ok"?[{shopId,shopName,name:page.name,periods,settings,staff:staffList,plan},...knownShops]:[],
    [shopId,shopName,page.state,page.name,periods,settings,staffList,plan,knownShops]);
  // ヘルプ先の店舗（公開済みか確定済みの期間・2026-10-05）。その提出は選んだ期間だけを部分読みする（自分の店舗は App の購読をそのまま使う）
  const helpDest=useMyHelpDestShops(homeShops);
  const allChoices=useMemo(()=>myAllShiftChoices({shops:[...homeShops,...helpDest],todayStr}),[homeShops,helpDest,todayStr]);
  const helpSubs=useMyPeriodSubsLoader();
  const allSubsFor=useCallback((sid,pid)=>sid===shopId?(Array.isArray(subs)?subs:[]).filter(s=>s&&s.periodId===pid):helpSubs.subsFor(sid,pid),[subs,shopId,helpSubs.subsFor]);
  const allNeed=useCallback((sid,pid)=>{if(sid!==shopId)helpSubs.need(sid,pid);},[shopId,helpSubs.need]);
  const unlockPay=r=>setPay({key:String(Date.now()),byShop:{[shopId]:myCompanyPayOf(r)}});
  if(!boot)return <MyPageStatusScreen state="loading" token={token} onClose={onClose}/>;
  if(boot.state!=="shop")return <MyPageStatusScreen state={boot.state==="invalid"?"invalid":"missing"} token={token} onClose={onClose}/>;
  if(rec===undefined)return <MyPageStatusScreen state="loading" shopName={shopName} token={token} onClose={onClose}/>;
  if(page.state!=="ok")return <MyPageStatusScreen state={page.state} shopName={shopName} token={token} onClose={onClose}/>;
  if(authOpen)return <MyAuthScreen shopId={shopId} onClose={()=>{ssSave(SS_MY_PAGE_LINK_INTENT,null);setAuthOpen(false);}}/>;
  const tabs=MY_PAGE_TABS;
  const label=(tabs.find(t=>t.key===tab)||tabs[0]).label;
  // 提出（P2）: 最新の期間へ、承認された名前で。募集URLと同じ StaffView・同じ提出の処理（App の staffOnSub）を通す。
  // 確定済みの期間は StaffView が止め、ルールも拒否する。StaffView は自前のヘッダー（お店・期間）と送信の帯を持つので、外側の枠は付けない
  if(tab==="submit"){
    const latest=myLatestPeriodOf(periods);
    return(
      <div data-my-view="page" data-my-page-name={page.name} data-my-page-tab="submit" style={{minHeight:"100vh",background:"var(--c-bg)"}}>
        {latest?<StaffView periods={periods} ap={latest} apid={latest.id} setApid={()=>{}} shopId={shopId} settings={settings} subs={subs} staffList={staffList} plan={plan}
          urlLocked onSub={onSub} onDeleteSub={onDeleteSub} shopName={shopName} fixedName={page.name} bottomOffset={MY_TAB_BAR_H}/>
          :<main style={{maxWidth:560,margin:"0 auto",padding:"16px 16px 96px"}}><MyEmptyState>提出できる期間がまだありません。お店がシフトの募集を始めると、ここから提出できます。</MyEmptyState></main>}
        <MyTabBar tab={tab} onTab={setTab} tabs={tabs}/>
      </div>
    );
  }
  return(
    <div data-my-view="page" data-my-page-name={page.name} style={{minHeight:"100vh",background:"var(--c-bg)"}}>
      <MyHeader title={label} onClose={onClose}/>
      {syncStatus==="offline"&&<div style={{background:"var(--c-input)",color:"var(--c-text2)",fontSize:12,textAlign:"center",padding:"4px 8px"}}>オフライン（再接続中…）</div>}
      <main style={{maxWidth:560,margin:"0 auto",padding:"16px 16px 96px"}}>
        <div style={{fontSize:13,color:"var(--c-text3)",marginBottom:4}} data-my-who="1">{page.name} さん ／ {shopName}</div>
        {tab==="shift"&&<MyShiftPager panes={[
          {key:"mine",label:"自分のシフト",node:<MyShiftTab me={me} personal={personal}/>},
          ...(allChoices.shops.length?[{key:"all",label:"全員のシフト",node:<MyAllShiftPane choices={allChoices} subsFor={allSubsFor} onNeed={allNeed}/>}]:[]),
        ]}/>}
        {tab==="pay"&&(pay?<div data-my-pay-unlocked="1">
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
            <button data-my-action="lockPay" onClick={()=>setPay(null)} style={{...AGray,padding:"6px 12px",fontSize:13}}>給料を閉じる</button>
          </div>
          <MyPayTab me={me} personal={personal} onGoSettings={()=>setTab("settings")}/>
        </div>:<MyPagePayGate token={token} onUnlock={unlockPay}/>)}
        {tab==="settings"&&<MyPageSettingsTab me={me} personal={personal} page={page} shopId={shopId} shopName={shopName} token={token} payUnlocked={!!pay}
          staffUser={staffUser} onAccountLogin={()=>{ssSave(SS_MY_PAGE_LINK_INTENT,token);setAuthOpen(true);}}/>}
      </main>
      <MyTabBar tab={tab} onTab={setTab} tabs={tabs}/>
    </div>
  );
}

// ===== 通知（Web Push・2026-10-08）=====
// 置き場と規則は app-my-utils.js の「通知」の節。送るのは Cloud Functions（functions/notify.js）。
// Service Worker（リポジトリ直下の sw.js・push と notificationclick だけ。ファイルのキャッシュはしない）は、
// 通知を有効にする操作のときにだけ登録する（開いただけでは登録しない＝既存の ?v= の版数管理に何も足さない）。
const PUSH_SW_URL="sw.js";
function pushEnvOf(){
  const has=k=>{try{return typeof window[k]!=="undefined";}catch{return false;}};
  let permission="default";
  try{if(has("Notification"))permission=window.Notification.permission;}catch{/* 読めなければ default */}
  return{secure:!!window.isSecureContext,hasSW:!!(typeof navigator!=="undefined"&&navigator.serviceWorker),hasPush:has("PushManager"),
    hasNotification:has("Notification"),ios:!!HOME_IOS,standalone:isStandaloneLaunch(),permission};
}
function pushSameKey(a,b){
  try{
    const x=new Uint8Array(a),y=new Uint8Array(b);
    return x.length===y.length&&x.every((v,i)=>v===y[i]);
  }catch{return false;}
}
// いまの端末の購読（Service Worker を登録していなければ null）
async function pushCurrentSubscription(){
  const reg=await navigator.serviceWorker.getRegistration("./");
  if(!reg||!reg.pushManager)return null;
  return reg.pushManager.getSubscription();
}
// 購読を作る（あれば使い回す）。鍵を替えた後の古い購読は subscribe が拒否するので、鍵が違えば作り直す
async function pushSubscribe(){
  const reg=await navigator.serviceWorker.register(PUSH_SW_URL,{scope:"./"});
  const ready=await navigator.serviceWorker.ready;
  const r=ready&&ready.pushManager?ready:reg;
  const opts={userVisibleOnly:true,applicationServerKey:pushUrlBase64ToBytes(PUSH_VAPID_PUBLIC_KEY)};
  let sub=await r.pushManager.getSubscription();
  if(sub){
    const cur=sub.options&&sub.options.applicationServerKey;
    if(cur&&!pushSameKey(cur,opts.applicationServerKey)){try{await sub.unsubscribe();}catch{/* 作り直しで上書きされる */}sub=null;}
  }
  return sub||r.pushManager.subscribe(opts);
}
// base: staffPageData/{token} | users/{uid} | shops/{sid}/private。uid は管理者の端末だけ（記録に入れ、CF が owners と照合する）
function PushOptInBody({base,uid=null,audience}){
  const env=useMemo(pushEnvOf,[]);
  const sup=pushSupportOf(env);
  const[st,setSt]=useState("checking"); // checking | on | off
  const[busy,setBusy]=useState(false);
  const[msg,setMsg]=useState({});
  const keyRef=useRef("");
  useEffect(()=>{
    let alive=true;
    if(!env.hasSW||!env.hasPush||!base||!firebaseDB){setSt("off");return()=>{alive=false;};}
    (async()=>{
      try{
        const sub=await pushCurrentSubscription();
        const key=sub?pushKeyOfEndpoint(sub.endpoint,sha256HexOfBytes):"";
        keyRef.current=key;
        if(!key){if(alive)setSt("off");return;}
        const v=(await firebaseDB.ref(`${base}/push/${key}`).once("value")).val();
        // 管理者の記録は uid がいまの端末の uid と同じときだけ「受け取り中」（ログインし直して uid が替わると CF が送らない）
        if(alive)setSt(v&&(!uid||v.uid===uid)?"on":"off");
      }catch{if(alive)setSt("off");}
    })();
    return()=>{alive=false;};
  },[base,uid,env]);
  const enable=async()=>{
    setBusy(true);setMsg({});
    try{
      const perm=await window.Notification.requestPermission();
      if(perm!=="granted"){setMsg({error:perm==="denied"?"通知が許可されませんでした。端末（ブラウザ）の設定で、このサイトの通知を許可してください。":"通知が許可されませんでした。"});return;}
      const sub=await pushSubscribe();
      const json=sub&&typeof sub.toJSON==="function"?sub.toJSON():sub;
      const key=pushKeyOfEndpoint(json&&json.endpoint,sha256HexOfBytes);
      const rec=pushRecordOf(json,{at:new Date().toISOString(),uid:uid||"",ua:navigator.userAgent||""});
      if(!key||!rec){setMsg({error:"この端末の通知の情報を読み取れませんでした。"});return;}
      await fbSet(`${base}/push/${key}`,rec);
      keyRef.current=key;setSt("on");setMsg({ok:"この端末で通知を受け取ります。"});
    }catch(e){
      setMsg({error:isPermissionDeniedError(e)?"保存できませんでした（サーバー側の設定が未反映の可能性があります）。":`通知を有効にできませんでした（${(e&&e.message)||e}）。`});
    }finally{setBusy(false);}
  };
  const disable=async()=>{
    setBusy(true);setMsg({});
    try{
      if(keyRef.current&&firebaseDB)await firebaseDB.ref(`${base}/push/${keyRef.current}`).remove();
      setSt("off");setMsg({ok:"この端末への通知を止めました。"});
    }catch(e){
      setMsg({error:isPermissionDeniedError(e)?"止められませんでした（サーバー側の設定が未反映の可能性があります）。":`止められませんでした（${(e&&e.message)||e}）。`});
    }finally{setBusy(false);}
  };
  const blocked=sup.state==="unsupported"||sup.state==="ios-home";
  return(
    <div data-push-state={st} data-push-support={sup.state}>
      <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>{PUSH_DESCRIPTIONS[audience]||PUSH_DESCRIPTIONS.staff}</div>
      {sup.message&&st!=="on"&&<div data-push-hint={sup.state} style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.7,marginBottom:10}}>{sup.message}</div>}
      <MyMessage {...msg}/>
      {st==="checking"&&<div style={{fontSize:13,color:"var(--c-text3)"}}>確認しています…</div>}
      {st==="on"&&<div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <span data-push-on="1" style={{fontSize:14,fontWeight:700,color:"var(--c-text)"}}>この端末で受け取り中</span>
        <button data-push-action="off" disabled={busy} onClick={disable} style={{...AGray,opacity:busy?.6:1}}>{busy?"処理中…":"通知を止める"}</button>
      </div>}
      {st==="off"&&!blocked&&<button data-push-action="on" disabled={busy||sup.state==="denied"} onClick={enable}
        style={{...AB,opacity:busy||sup.state==="denied"?.6:1}}>{busy?"設定しています…":"通知を受け取る（この端末）"}</button>}
    </div>
  );
}
// スタッフ（マイシフトのアカウント・個別URL）の設定タブ
function MyPushSection({base}){
  if(!base)return null;
  return(
    <section style={MY_SECTION} data-my-section="push">
      <div style={MY_SECTION_TITLE}>通知</div>
      <PushOptInBody base={base} audience="staff"/>
    </section>
  );
}
// 管理者の設定タブ。この店舗のオーナーの端末だけ（閲覧専用・デモでは出さない）
function AdminPushCard({shopId,ownerReadOnly}){
  const uid=firebaseAuth&&firebaseAuth.currentUser?firebaseAuth.currentUser.uid:"";
  if(!shopId||shopId==="default"||ownerReadOnly||DEMO_MODE||!firebaseDB||!uid)return null;
  return(
    <AC title="通知（この端末）">
      <div data-admin-push="1"><PushOptInBody base={`shops/${shopId}/private`} uid={uid} audience="admin"/></div>
    </AC>
  );
}
