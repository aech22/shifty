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
//   MyShiftTab / MyPayTab … E1 では中身が無いことを伝える空の状態だけ（E3・E5 が埋める）
//   MySettingsTab … アカウント（登録ネーム・従業員番号・メール・パスワード・ログアウト）
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
    return{error:myAuthErrorMessage(e,"register")};
  }
  setStaffAccountMark(u.uid);
  const cur=firebaseAuth.currentUser||u;
  const pr=await mySaveProfile(cur.uid,f,{fresh:true});
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

// ===== 画面の部品 =====
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

// 下部タブ。並びは MY_TABS（app-my-utils.js）
function MyTabBar({tab,onTab}){
  return(
    <nav style={{position:"fixed",left:0,right:0,bottom:0,background:"var(--c-card)",borderTop:"1px solid var(--c-border)",zIndex:50,paddingBottom:"env(safe-area-inset-bottom,0)"}}>
      <div style={{maxWidth:560,margin:"0 auto",display:"flex"}}>
        {MY_TABS.map(t=>{const a=t.key===tab;return(
          <button key={t.key} data-my-tab={t.key} aria-current={a?"page":undefined} onClick={()=>onTab(t.key)}
            style={{flex:1,minHeight:52,background:"none",border:"none",borderTop:`2px solid ${a?"var(--c-accent)":"transparent"}`,color:a?"var(--c-accent)":"var(--c-text3)",fontSize:14,fontWeight:a?700:600,cursor:"pointer"}}>
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
function MyShiftTab(){
  return <MyEmptyState>勤務先の店舗とアカウントのリンクが済むと、ここに提出した希望と確定したシフトが月のカレンダーで表示されます。</MyEmptyState>;
}
function MyPayTab(){
  return <MyEmptyState>勤務先の店舗とアカウントのリンクが済み、シフトが確定すると、ここに今月の給料の見込みが表示されます。</MyEmptyState>;
}

function MySettingsTab({staffUser,profile,profileState,initialError,onProfile}){
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
      <section style={MY_SECTION} data-my-section="profile">
        <div style={MY_SECTION_TITLE}>アカウント</div>
        {profileState==="error"&&<MyMessage error="登録ネームを読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/>}
        <MyField label="登録ネーム" value={name} maxLength={MY_DISPLAY_NAME_MAX} autoComplete="name" data-my-input="displayName"
          onChange={e=>{touched.current=true;setName(e.target.value);}} hint="お店に登録されている名前と同じにしてください"/>
        <MyField label="従業員番号（任意）" value={num} maxLength={MY_NUMBER_MAX} inputMode="numeric" data-my-input="number"
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
            <MyField label="新しいパスワード" type="password" autoComplete="new-password" value={pw.next} data-my-input="pwNext" hint={`${MY_PASSWORD_MIN}文字以上`} onChange={e=>setPw({...pw,next:e.target.value})}/>
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
            {mode==="register"&&<>
              <MyField label="登録ネーム" value={f.displayName} maxLength={MY_DISPLAY_NAME_MAX} autoComplete="name" data-my-input="displayName" onChange={e=>set("displayName",e.target.value)} hint="お店に登録されている名前と同じにしてください"/>
              <MyField label="従業員番号（任意）" value={f.number} maxLength={MY_NUMBER_MAX} inputMode="numeric" data-my-input="number" onChange={e=>set("number",e.target.value)}/>
            </>}
            <MyField label="メールアドレス" type="email" autoComplete="email" value={f.email} data-my-input="email" onChange={e=>set("email",e.target.value)} onKeyDown={onKey}/>
            {mode!=="reset"&&<MyField label="パスワード" type="password" autoComplete={mode==="register"?"new-password":"current-password"} value={f.password} data-my-input="password"
              hint={mode==="register"?`${MY_PASSWORD_MIN}文字以上`:null} onChange={e=>set("password",e.target.value)} onKeyDown={onKey}/>}
            {mode==="register"&&<MyField label="パスワード（確認）" type="password" autoComplete="new-password" value={f.password2} data-my-input="password2" onChange={e=>set("password2",e.target.value)} onKeyDown={onKey}/>}
            <MyMessage {...msg}/>
            <button data-my-action="submit" disabled={busy||!checked} onClick={submit} style={{...AB,width:"100%",padding:"13px 18px",fontSize:15,opacity:busy||!checked?.6:1}}>
              {busy?"処理中…":mode==="register"?"アカウントを作成":mode==="login"?"ログイン":"再設定のメールを送る"}
            </button>
            {mode==="login"&&<button data-my-mode="reset" onClick={()=>go("reset")} style={{...MY_LINK_BTN,marginTop:10}}>パスワードを忘れた場合</button>}
            {mode==="reset"&&<button data-my-mode="login" onClick={()=>go("login")} style={{...MY_LINK_BTN,marginTop:10}}>ログインに戻る</button>}
          </section>
        )}
      </div>
    </div>
  );
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
        {tab==="shift"&&<MyShiftTab/>}
        {tab==="pay"&&<MyPayTab/>}
        {tab==="settings"&&<MySettingsTab staffUser={staffUser} profile={profile} profileState={profileState} initialError={saveError}
          onProfile={p=>{draftRef.current=null;setSaveError(null);setProfile(myProfileOf(p));setProfileState("ok");}}/>}
      </main>
      <MyTabBar tab={tab} onTab={setTab}/>
    </div>
  );
}
