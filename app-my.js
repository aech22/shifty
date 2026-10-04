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
//   MySettingsTab … 勤務先のお店（E2: 紐付けの一覧・申請・個人リンクコード）とアカウント（登録ネーム・従業員番号・メール・パスワード・ログアウト）
//   StaffLinkRequestsCard / StaffLinkEditSection … 管理者側（スタッフタブ）の申請の提案・未リンクの申請・コードの発行と解除（E2）
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
        <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7}}>登録名・従業員番号のどちらとも一致しません。本人に登録ネームを直して申請し直してもらうか、スタッフの「編集」から個人リンクコードを発行してください。</div>
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

// 管理者側（スタッフの編集モーダルの中）: その人の紐付けの状態・解除・個人リンクコードの発行
function StaffLinkEditSection({links,name,tt}){
  const[busy,setBusy]=useState(false);
  const[issued,setIssued]=useState(null); // {name,code,expiry}
  if(!links||!links.enabled)return null;
  const linked=staffLinksByName(links.map)[name];
  const issue=async()=>{
    setBusy(true);
    const r=await links.call("issueStaffLinkCode",{name});
    setBusy(false);
    if(r.error){tt(`▲ ${r.error}`);return;}
    setIssued({name,code:r.code,expiry:r.expiry});
  };
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
  const cur=issued&&issued.name===name?issued:null;
  return(
    <div data-staff-link="none">
      <div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginBottom:8}}>本人がマイシフトの設定でこのコードを入れると、承認なしでリンクされます。24時間有効・1回限りです。</div>
      {cur&&<div data-staff-link-code={cur.code} style={{marginBottom:10}}>
        <div style={{fontSize:24,fontWeight:700,letterSpacing:4,color:"var(--c-text)",fontVariantNumeric:"tabular-nums"}}>{cur.code}</div>
        <div data-staff-link-expiry="1" style={{fontSize:12,color:"var(--c-text3)"}}>有効期限: {fmtLinkCodeExpiry(cur.expiry)}</div>
      </div>}
      <button data-staff-link-action="issue" disabled={busy} onClick={issue} style={{...AGray,opacity:busy?.6:1}}>{cur?"コードを発行し直す":"個人リンクコードを発行"}</button>
      {cur&&<div style={{fontSize:11,color:"var(--c-text4)",marginTop:6}}>発行し直すと、前のコードは使えなくなります。</div>}
    </div>
  );
}

// 本人側（設定タブ）: 紐付いた店舗・申請・コードの入力
function MyLinksSection({staffUser,profile,shopId}){
  const uid=staffUser.uid;
  const[list,setList]=useState(undefined); // undefined=読み込み中・null=読めない
  const[req,setReq]=useState(undefined);   // 開いている店舗への自分の申請（null=無い）
  const[shopName,setShopName]=useState("");
  const[code,setCode]=useState("");
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState("");
  const[seq,setSeq]=useState(0);
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
  const apply=async()=>{
    setMsg({});
    if(!normalizeMyDisplayName(profile.displayName)){setMsg({error:"先に下の「アカウント」で登録ネームを保存してください"});return;}
    setBusy("apply");
    try{await fbSet(`shops/${shopId}/linkRequests/${uid}`,buildLinkRequestRecord(profile,new Date().toISOString()));setMsg({ok:"申請しました。お店の管理者が承認するとリンクされます"});}
    catch(e){setMsg({error:isPermissionDeniedError(e)?"申請できませんでした（サーバー側の設定が未反映の可能性があります）":"申請できませんでした。通信状態を確認してもう一度お試しください"});}
    setBusy("");reload();
  };
  const cancel=async()=>{
    setBusy("cancel");setMsg({});
    try{await fbSet(`shops/${shopId}/linkRequests/${uid}`,null);setMsg({ok:"申請を取り消しました"});}
    catch{setMsg({error:"取り消せませんでした。もう一度お試しください"});}
    setBusy("");reload();
  };
  const redeem=async()=>{
    setMsg({});
    const c=normalizeLinkCode(code);
    if(!isValidLinkCode(c)){setMsg({error:`コードは${MY_LINK_CODE_LEN}文字の英数字です`});return;}
    setBusy("code");
    const r=await myCallCF("redeemStaffLinkCode",{code:c});
    setBusy("");
    if(r.error){setMsg({error:r.error});return;}
    setCode("");setMsg({ok:`「${r.name||""}」としてリンクしました`});reload();
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
            <button data-my-action="cancelRequest" disabled={busy==="cancel"} onClick={cancel} style={AGray}>申請を取り消す</button>
          </>
        ):(
          <>
            <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.8,marginBottom:10}}>
              登録ネーム「{profile.displayName||"未設定"}」{profile.number?`と従業員番号「${profile.number}」`:""}をお店の管理者に送ります。お店に登録されている名前・番号と一致すると、管理者が承認してリンクされます。
            </div>
            <button data-my-action="apply" disabled={busy==="apply"||req===undefined} onClick={apply} style={{...AB,opacity:busy==="apply"?.6:1}}>{busy==="apply"?"申請中…":"申請する"}</button>
          </>
        )}
      </div>}
      {!shopId&&Array.isArray(list)&&list.length===0&&<div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.8,marginTop:4}}>お店から受け取ったスタッフ用URLから開くと、そのお店にリンクを申請できます。</div>}

      <div style={{marginTop:18,paddingTop:14,borderTop:"1px solid var(--c-border)"}}>
        <MyField label="個人リンクコード" value={code} maxLength={12} autoComplete="off" autoCapitalize="characters" data-my-input="linkCode"
          onChange={e=>setCode(e.target.value)} hint="お店の管理者から受け取った8文字のコード。入れるとすぐにリンクされます（24時間有効）"/>
        <button data-my-action="redeem" disabled={busy==="code"} onClick={redeem} style={{...AGray,opacity:busy==="code"?.6:1}}>{busy==="code"?"確認中…":"コードでリンク"}</button>
      </div>
      <MyMessage {...msg}/>
    </section>
  );
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
  return{ok:true,periods,settings,staff:st.v||[],plan};
}
async function readMyPeriodSubs(sid,pid){
  try{
    const snap=await firebaseDB.ref(`shops/${sid}/subs`).orderByChild("periodId").equalTo(pid).once("value");
    return Object.values(snap.val()||{}).filter(s=>s&&s.id&&s.periodId===pid);
  }catch(e){console.warn("マイシフト: 提出の読み込みに失敗:",e&&e.code);return null;}
}

// ===== 本人のデータ（2026-10-04・第2部 E4）=====
// users/{uid}/workplaces・shifts・overrides を1回読み、書いたら手元の状態を合わせる（購読しない＝本人の端末からしか書かれない）。
// MyView が1つ持ち、マイシフトと設定タブが共有する。書くのは users/{uid}/ の下だけ（店舗のデータには書かない）。
// workplaces は update（E5 が同じレコードに pay を足すので set() で消さない）、shifts・overrides は1件ずつの set。
const myRand=n=>{const a=new Uint8Array(n);(window.crypto||window.msCrypto).getRandomValues(a);return Array.from(a);};
function myWriteError(e){return isPermissionDeniedError(e)?"保存できませんでした（サーバー側の設定が未反映の可能性があります）":"保存できませんでした。通信状態を確認してもう一度お試しください";}
function useMyPersonal(uid){
  const[d,setD]=useState({state:"loading",workplaces:{},shifts:{},overrides:{}});
  useEffect(()=>{
    if(!uid||!firebaseDB)return;
    let alive=true;
    Promise.all(["workplaces","shifts","overrides"].map(k=>_myRead(`users/${uid}/${k}`))).then(([w,s,o])=>{
      if(!alive)return;
      const ok=w.ok&&s.ok&&o.ok;
      setD({state:ok?"ok":"error",workplaces:(w.ok&&w.v)||{},shifts:(s.ok&&s.v)||{},overrides:(o.ok&&o.v)||{}});
    });
    return()=>{alive=false;};
  },[uid]);
  // patch は {"workplaces/x": …} の形（users/{uid} からの相対パス・null で削除）。成功したら手元の状態にも同じ形で当てる
  const apply=async patch=>{
    try{await fbUpd(`users/${uid}`,patch);}
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

// 時刻の入力: 直接入力（"930"・"17:30"・"26:00"）と5分刻みの選択。値は入力の文字列のまま持ち、保存時に検証する
function MyTimeInput({label,value,onChange,name}){
  const parsed=parseMyClockInput(value);
  const sel=parsed&&MY_TIME_OPTIONS.some(o=>o.value===parsed)?parsed:"";
  return(
    <label style={{display:"block",marginBottom:12}}>
      <span style={MY_LABEL}>{label}</span>
      <span style={{display:"flex",gap:8}}>
        <input data-my-input={name} value={value} inputMode="numeric" autoComplete="off" placeholder="例 9:30" onChange={e=>onChange(e.target.value)}
          style={{...AI,flex:"1 1 auto",minWidth:0}}/>
        <select data-my-select={name} aria-label={`${label}を選ぶ`} value={sel} onChange={e=>{if(e.target.value)onChange(e.target.value);}}
          style={{...AI,flex:"0 0 112px",width:112,padding:"11px 8px"}}>
          <option value="">選ぶ</option>
          {MY_TIME_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </span>
    </label>
  );
}
function MyMinutesInput({label,value,onChange,name}){
  const n=parseMyMinutesInput(value);
  const sel=n!=null&&MY_BREAK_OPTIONS.includes(n)&&String(value).trim()!==""?String(n):"";
  return(
    <label style={{display:"block",marginBottom:12}}>
      <span style={MY_LABEL}>{label}</span>
      <span style={{display:"flex",gap:8}}>
        <input data-my-input={name} value={value} inputMode="numeric" autoComplete="off" placeholder="0" onChange={e=>onChange(e.target.value)}
          style={{...AI,flex:"1 1 auto",minWidth:0}}/>
        <select data-my-select={name} aria-label={`${label}を選ぶ`} value={sel} onChange={e=>{if(e.target.value!=="")onChange(e.target.value);}}
          style={{...AI,flex:"0 0 112px",width:112,padding:"11px 8px"}}>
          <option value="">選ぶ</option>
          {MY_BREAK_OPTIONS.map(t=><option key={t} value={String(t)}>{t}分</option>)}
        </select>
      </span>
    </label>
  );
}
// 開始・終了・休憩の3欄と、日をまたぐ入力の言い直し（「26:00 にする」）
function MyTimesFields({f,set,err}){
  return(
    <>
      <MyTimeInput label="開始" name="start" value={f.start} onChange={v=>set("start",v)}/>
      <MyTimeInput label="終了" name="end" value={f.end} onChange={v=>set("end",v)}/>
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
function MyOverrideForm({personal,entry,onDone}){
  const[f,setF]=useState({start:_myInputOfMin(entry.startMin),end:_myInputOfMin(entry.endMin),breakMin:String(entry.breakMin||0)});
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
    onDone(r.remove?"公開された時間に戻しました":"実績を保存しました");
  };
  return(
    <div data-my-override-form="1" style={{borderTop:"1px solid var(--c-border)",paddingTop:12,marginTop:8}}>
      <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)",marginBottom:4}}>実際に働いた時間</div>
      <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:10}}>
        公開された時間: {fmtMyRange(entry.sched)}{entry.sched.breakMin>0?`（休憩${entry.sched.breakMin}分）`:""}。入れた時間はあなたの画面と給料の見込みにだけ使われ、お店には送られません。
      </div>
      <MyTimesFields f={f} set={set} err={err}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button data-my-action="saveOverride" disabled={busy} onClick={save} style={{...AB,opacity:busy?.6:1}}>{busy?"保存中…":"保存"}</button>
        <button data-my-action="cancelOverride" onClick={()=>onDone(null)} style={AGray}>やめる</button>
      </div>
    </div>
  );
}

const MY_KIND_LABEL={published:"公開",confirmed:"確定",submitted:"提出済み（未確定）",manual:"手入力"};
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
          {e.overridden&&<span data-my-entry-actual="1" style={{fontSize:12,fontWeight:700,color:"var(--c-text)"}}>実績</span>}
          {changed&&<span data-my-entry-changed="1" style={{fontSize:12,fontWeight:700,color:"var(--c-accent)"}}>変更あり</span>}
        </div>
        <div style={{fontSize:13,color:grey?"var(--c-text3)":"var(--c-text2)",lineHeight:1.6,overflowWrap:"anywhere"}}>
          {e.shopName}
          {!grey&&e.breakMin>0?` ／ 休憩${e.breakMin}分`:""}
          {!grey&&(e.segments||[]).filter(g=>g.extra).map(g=>` ／ 追加 ${fmtMyClock(g.startMin)}〜${fmtMyClock(g.endMin)}`).join("")}
        </div>
        {e.overridden&&<div data-my-entry-sched="1" style={{fontSize:12,color:"var(--c-text3)"}}>公開 {fmtMyRange(e.sched)}{e.sched.breakMin>0?`（休憩${e.sched.breakMin}分）`:""}</div>}
        {!grey&&e.differs&&e.hope&&<div data-my-entry-hope="1" style={{fontSize:12,color:"var(--c-text3)"}}>希望 {fmtMyRange(e.hope)}</div>}
        {e.memo&&<div data-my-entry-memo="1" style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.6,overflowWrap:"anywhere"}}>{e.memo}</div>}
        {actions&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
          {e.kind==="published"&&actions.canEdit&&<button data-my-action="editOverride" onClick={actions.editOverride} style={small}>{e.overridden?"実績を直す":"実績を入力"}</button>}
          {e.kind==="published"&&e.overridden&&<button data-my-action="resetOverride" disabled={actions.busy} onClick={actions.resetOverride} style={small}>公開の時間に戻す</button>}
          {e.kind==="manual"&&actions.canEdit&&<button data-my-action="editManual" onClick={actions.editManual} style={small}>直す</button>}
          {e.kind==="manual"&&<button data-my-action="deleteManual" disabled={actions.busy} onClick={actions.deleteManual} style={small}>削除</button>}
        </div>}
      </div>
    </div>
  );
}

function MyShiftTab({staffUser,onGoSettings,personal}){
  const uid=staffUser&&staffUser.uid;
  const P=personal||{state:"ok",workplaces:{},shifts:{},overrides:{}};
  const todayStr=fd(new Date());
  const[ym,setYm]=useState(todayStr.slice(0,7));
  const[sel,setSel]=useState(todayStr);
  const[links,setLinks]=useState(undefined);   // undefined=読み込み中・null=読めない
  const[shops,setShops]=useState({});         // {sid: {ok,periods,settings,staff,plan}}
  const[subs,setSubs]=useState({});           // {"sid|pid": sub[] | null}
  const[seen,setSeen]=useState(undefined);     // users/{uid}/seen（undefined=読み込み中・null=読めない）
  const loadingRef=useRef(new Set());
  const baselineRef=useRef(new Set());
  useEffect(()=>{
    if(!uid)return;
    let alive=true;
    readMyLinks(uid).then(v=>{if(alive)setLinks(v);}).catch(()=>{if(alive)setLinks(null);});
    _myRead(`users/${uid}/seen`).then(r=>{if(alive)setSeen(r.ok?(r.v||{}):null);});
    return()=>{alive=false;};
  },[uid]);
  const okLinks=useMemo(()=>(Array.isArray(links)?links.filter(l=>l&&l.ok):[]),[links]);
  const badLinks=Array.isArray(links)?links.filter(l=>l&&!l.ok):[];
  useEffect(()=>{
    let alive=true;
    okLinks.forEach(l=>{
      if(shops[l.shopId]||loadingRef.current.has("shop:"+l.shopId))return;
      loadingRef.current.add("shop:"+l.shopId);
      readMyShiftShop(l.shopId).then(v=>{if(alive)setShops(p=>({...p,[l.shopId]:v}));},()=>{if(alive)setShops(p=>({...p,[l.shopId]:{ok:false}}));});
    });
    return()=>{alive=false;};
  },[okLinks,shops]);
  // 表示中の月と今日以降にかかる期間の subs だけを読む（読んだ期間は覚えておき、月を戻っても読み直さない）
  useEffect(()=>{
    okLinks.forEach(l=>{
      const sh=shops[l.shopId];
      if(!sh||!sh.ok)return;
      myShiftPeriodsToRead(sh.periods,ym,todayStr).forEach(p=>{
        const k=l.shopId+"|"+p.id;
        if(k in subs||loadingRef.current.has(k))return;
        loadingRef.current.add(k);
        readMyPeriodSubs(l.shopId,p.id).then(v=>setSubs(prev=>({...prev,[k]:v})));
      });
    });
  },[okLinks,shops,ym,todayStr,subs]);
  const premium=myShiftPremiumOf(okLinks.map(l=>shops[l.shopId]&&shops[l.shopId].plan));
  // 勤務先の名前と色（E4）。Shifty の店舗は本人が付けた名前・色（無ければ店舗名と既定の色）、手入力の勤務先はその記録
  const wpList=useMemo(()=>myWorkplaceList(okLinks,P.workplaces),[okLinks,P.workplaces]);
  const manualList=wpList.filter(w=>w.kind==="manual");
  const{entries,publishedKeys}=useMemo(()=>{
    const all=[];const keys=[];
    okLinks.forEach(l=>{
      const sh=shops[l.shopId];
      if(!sh||!sh.ok)return;
      const w=wpList.find(x=>x.id===l.shopId)||{};
      const subsByPeriod={};
      sh.periods.forEach(p=>{const v=subs[l.shopId+"|"+p.id];if(Array.isArray(v)){subsByPeriod[p.id]=v;if(premium&&isPeriodPublished(p))keys.push(myShiftSeenKey(l.shopId,p.id));}});
      all.push(...buildMyShiftDays({shopId:l.shopId,shopName:w.name||l.shopName,color:w.color||myWorkplaceColor(l.shopId,0),name:l.name,periods:sh.periods,
        subsByPeriod,settings:sh.settings,staff:sh.staff,todayStr,premium,overrides:(P.overrides||{})[l.shopId]}));
    });
    all.push(...buildMyManualDays(wpList,P.shifts));
    all.sort(myEntryOrder);
    return{entries:all,publishedKeys:keys};
  },[okLinks,shops,subs,premium,todayStr,wpList,P.shifts,P.overrides]);
  const fps=useMemo(()=>myPublishedFingerprints(entries,publishedKeys),[entries,publishedKeys]);
  const seenOf=k=>{const[sid,pid]=k.split("|");return seen&&seen[sid]?seen[sid][pid]:undefined;};
  // 初めて見る公開は「変更あり」にせず、今の内容を見たものとして記録する（前回の内容が無いと比べられないため）
  const writeSeen=(keys,label)=>{
    const now=new Date().toISOString();
    const patch={};
    keys.forEach(k=>{const[sid,pid]=k.split("|");patch[k]={sid,pid,rec:buildMySeenRecord(fps[k],now)};});
    setSeen(prev=>{const next={...(prev||{})};Object.values(patch).forEach(({sid,pid,rec})=>{next[sid]={...(next[sid]||{}),[pid]:rec};});return next;});
    Object.values(patch).forEach(({sid,pid,rec})=>{
      fbSet(`users/${uid}/seen/${sid}/${pid}`,rec).catch(e=>console.warn(`マイシフト: ${label}の記録に失敗:`,e&&e.code));
    });
  };
  useEffect(()=>{
    if(!seen||!uid)return; // 読めない（null）間は書かない（既にある記録を上書きしないため）
    const fresh=Object.keys(fps).filter(k=>seenOf(k)===undefined&&!baselineRef.current.has(k));
    if(!fresh.length)return;
    fresh.forEach(k=>baselineRef.current.add(k));
    writeSeen(fresh,"初回の表示");
  },[fps,seen,uid]);
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
    setBusy("");setDayMsg(r.error?{error:r.error}:{ok:"公開された時間に戻しました"});
  };
  const deleteManual=async e=>{
    if(!window.confirm(`${myFmtDate(e.date)} ${e.shopName} ${fmtMyRange(e)} のシフトを削除しますか？`))return;
    setBusy("del");setDayMsg({});
    const r=await P.deleteShift(e.shiftId);
    setBusy("");setDayMsg(r.error?{error:r.error}:{ok:"シフトを削除しました"});
  };
  const downloadIcs=()=>{
    const list=myIcsEntriesForMonth(entries,ym);
    if(!list.length){setIcsMsg({error:"この月に取り込めるシフトがありません（公開済みと手入力のシフトだけが入ります）"});return;}
    const{text,count}=buildMyIcs(list,{nowIso:new Date().toISOString()});
    myDownloadIcs(text,`shifty-${ym}.ics`);
    setIcsMsg({ok:`${count}件のシフトを書き出しました。開くとカレンダーに追加できます`});
  };

  if(links===null)return <MyEmptyState><MyMessage error="お店とのリンクを読み込めませんでした（サーバー側の設定が未反映の可能性があります）"/></MyEmptyState>;
  const hasManual=manualList.length>0||Object.keys(P.shifts||{}).length>0;
  if(Array.isArray(links)&&!okLinks.length&&P.state!=="loading"&&!hasManual)return(
    <MyEmptyState>
      {badLinks.length>0&&<div data-my-bad-links="1" style={{marginBottom:12}}>{badLinks.map(l=><div key={l.shopId} style={{color:"var(--c-danger)",fontSize:14}}>{l.shopName}: {l.reason==="unread"?"状態を確認できませんでした":MY_LINK_INVALID_LABELS[l.reason]}</div>)}</div>}
      勤務先の店舗とアカウントのリンクが済むと、ここに提出した希望と公開されたシフトが月のカレンダーで表示されます。
      {onGoSettings&&<button data-my-action="goLinks" onClick={onGoSettings} style={{...MY_LINK_BTN,display:"block",marginTop:8}}>設定でお店とリンクする</button>}
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
    </div>
  );
}
// ===== 設定タブ → 勤務先（2026-10-04・第2部 E4）=====
// Shifty の店舗（紐付いた店舗）と手入力の勤務先の一覧・追加・名前と色の変更・削除。
// E5 はこの編集欄（MyWorkplaceEditor）に給料設定（workplaces/{id}.pay）を足す。
// 紐付いた店舗のプラン（Premium の判定）は readMyShiftShop と同じ規則で読む
async function readMyLinksWithPlans(uid){
  const links=await readMyLinks(uid);
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
function MyWorkplaceEditor({w,personal,isNew,list,onDone}){
  const[f,setF]=useState({name:w?(w.kind==="shifty"?(w.rec&&w.rec.name)||"":w.name):"",color:w?w.color:myNextWorkplaceColor(list)});
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);
  const kind=w?w.kind:"manual";
  const save=async()=>{
    const e=validateMyWorkplaceInput(f,kind);
    if(e){setErr(e);return;}
    setBusy(true);
    const id=w?w.id:personal.newWorkplaceId();
    const r=await personal.saveWorkplace(id,buildMyWorkplacePatch(f,w||{kind:"manual"}));
    setBusy(false);
    if(r.error){setErr(r.error);return;}
    onDone(isNew?"勤務先を追加しました":"保存しました");
  };
  return(
    <div data-my-wp-editor={isNew?"new":w.id} style={{padding:"12px 0 4px"}}>
      <MyField label="名前" value={f.name} maxLength={MY_WORKPLACE_NAME_MAX} data-my-input="wpName" placeholder={kind==="shifty"?w.shopName:"例 カフェ（駅前）"}
        hint={kind==="shifty"?"空欄ならお店の名前で表示します":null} onChange={e=>{setF({...f,name:e.target.value});setErr("");}}/>
      <div style={MY_LABEL}>色</div>
      <MyColorPicker value={f.color} onChange={c=>{setF({...f,color:c});setErr("");}}/>
      <MyMessage error={err}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button data-my-action="saveWorkplace" disabled={busy} onClick={save} style={{...AB,opacity:busy?.6:1}}>{busy?"保存中…":isNew?"追加":"保存"}</button>
        <button data-my-action="cancelWorkplace" onClick={()=>onDone(null)} style={AGray}>やめる</button>
      </div>
    </div>
  );
}
function MyWorkplacesSection({staffUser,personal}){
  const uid=staffUser.uid;
  const P=personal;
  const[lp,setLp]=useState(undefined); // {links,plans}
  const[edit,setEdit]=useState(null);  // 勤務先ID | "new"
  const[msg,setMsg]=useState({});
  const[busy,setBusy]=useState("");
  useEffect(()=>{
    let alive=true;
    readMyLinksWithPlans(uid).then(v=>{if(alive)setLp(v);},()=>{if(alive)setLp({links:null,plans:[]});});
    return()=>{alive=false;};
  },[uid]);
  const okLinks=lp&&Array.isArray(lp.links)?lp.links.filter(l=>l&&l.ok):[];
  const list=myWorkplaceList(okLinks,P.workplaces);
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
              <div data-my-wp-name="1" style={{fontSize:15,fontWeight:700,color:"var(--c-text)",overflowWrap:"anywhere"}}>{w.name}</div>
              <div style={{fontSize:12,color:"var(--c-text3)"}}>{kindLabel(w)}{w.kind==="shifty"&&w.linked&&w.name!==w.shopName?`（${w.shopName}）`:""}</div>
            </div>
            {canEdit&&edit!==w.id&&(w.kind==="manual"||w.linked)&&<button data-my-action="editWorkplace" onClick={()=>{setMsg({});setEdit(w.id);}} style={{...AGray,padding:"8px 12px",fontSize:13,whiteSpace:"nowrap"}}>編集</button>}
            {(w.kind==="manual"||!w.linked)&&P.state==="ok"&&edit!==w.id&&<button data-my-action="deleteWorkplace" disabled={busy===w.id} onClick={()=>remove(w)} style={{...AGray,padding:"8px 12px",fontSize:13,whiteSpace:"nowrap"}}>削除</button>}
          </div>
          {edit===w.id&&<MyWorkplaceEditor w={w} personal={P} list={list} onDone={done}/>}
        </div>
      ))}
      {edit==="new"&&<div style={{borderTop:"1px solid var(--c-border)"}}><MyWorkplaceEditor w={null} isNew personal={P} list={list} onDone={done}/></div>}
      <MyMessage {...msg}/>
      {canEdit&&edit!=="new"&&<button data-my-action="addWorkplace" onClick={()=>{setMsg({});setEdit("new");}} style={{...AGray,marginTop:10}}>＋ 勤務先を追加</button>}
      {lp!==undefined&&!premium&&P.state!=="loading"&&<div data-my-wp-premium-note="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginTop:10}}>
        勤務先の追加と編集は、プレミアムプランのお店とリンクしている間に使えます。入れた勤務先とシフトは表示され、削除はいつでもできます。
      </div>}
    </section>
  );
}

function MyPayTab(){
  return <MyEmptyState>勤務先の店舗とアカウントのリンクが済み、シフトが確定すると、ここに今月の給料の見込みが表示されます。</MyEmptyState>;
}

function MySettingsTab({staffUser,profile,profileState,initialError,onProfile,shopId,personal}){
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
      {personal&&<MyWorkplacesSection staffUser={staffUser} personal={personal}/>}
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
  // 本人の勤務先・手入力のシフト・実績の上書き（E4）。マイシフトと設定タブが共有する
  const personal=useMyPersonal(uid);
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
        {tab==="shift"&&<MyShiftTab staffUser={staffUser} personal={personal} onGoSettings={()=>setTab("settings")}/>}
        {tab==="pay"&&<MyPayTab/>}
        {tab==="settings"&&<MySettingsTab staffUser={staffUser} profile={profile} profileState={profileState} initialError={saveError} shopId={shopId} personal={personal}
          onProfile={p=>{draftRef.current=null;setSaveError(null);setProfile(myProfileOf(p));setProfileState("ok");}}/>}
      </main>
      <MyTabBar tab={tab} onTab={setTab}/>
    </div>
  );
}
