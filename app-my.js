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
  return{ok:true,periods,settings,staff:st.v||[],plan,wageSettings};
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
      readMyShiftShop(l.shopId).then(v=>{if(alive)setShops(p=>({...p,[l.shopId]:v}));},()=>{if(alive)setShops(p=>({...p,[l.shopId]:{ok:false}}));});
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
// 店舗の読めた期間の subs（{期間ID: sub[]}）。subs が null（読めなかった）の期間は入れない
function mySubsByPeriodOf(sid,sh,subs){
  const out={};
  ((sh&&sh.periods)||[]).forEach(p=>{const v=subs[sid+"|"+p.id];if(Array.isArray(v))out[p.id]=v;});
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
  const{entries,publishedKeys}=useMemo(()=>{
    const all=[];const keys=[];
    okLinks.forEach(l=>{
      const sh=shops[l.shopId];
      if(!sh||!sh.ok)return;
      const w=wpList.find(x=>x.id===l.shopId)||{};
      const subsByPeriod=mySubsByPeriodOf(l.shopId,sh,subs);
      sh.periods.forEach(p=>{if(subsByPeriod[p.id]&&premium&&isPeriodPublished(p))keys.push(myShiftSeenKey(l.shopId,p.id));});
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
    // 渡し方は全端末で同じ（a[download]＋blob。iOS 27 の Safari ではこれで「n件の予定 / すべて追加」の画面が直接出ることをシミュレーターで確認済み）。
    // 端末ごとに変えるのは書き出した後の案内だけ（Google カレンダーはスマホのアプリで .ics を開けない等）
    const plat=myIcsPlatformOf(navigator.userAgent,navigator.maxTouchPoints);
    setIcsMsg({ok:`${count}件のシフトを書き出しました。${MY_ICS_HINTS[plat]}`});
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
              {canEdit&&!open&&myGoogleCalendarLinks(e).map((g,j)=>(
                <a key={j} data-my-gcal={e.date} href={g.url} target="_blank" rel="noopener noreferrer" style={{...MY_LINK_BTN,display:"inline-block",fontSize:13,color:"var(--c-text3)",padding:"2px 0 6px",marginRight:14}}>
                  {g.extra?"Google カレンダーに追加（追加の勤務）":"Google カレンダーに追加"}
                </a>
              ))}
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
function MyPayFields({kind,f,set,company}){
  const cp=company&&company.pay;
  return(
    <div data-my-pay-fields={kind}>
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:"0 12px"}}>
        <MySelect label="締日" name="closingDay" value={f.closingDay} onChange={v=>set({closingDay:v})} options={MY_PAY_DAY_OPTIONS}/>
        <MySelect label="給料日が土日祝なら" name="holidayRule" value={f.holidayRule} onChange={v=>set({holidayRule:v})}
          options={MY_PAY_HOLIDAY_RULES.map(k=>({value:k,label:MY_PAY_HOLIDAY_RULE_LABELS[k]}))}/>
        <MySelect label="給料日の月" name="payMonthOffset" value={f.payMonthOffset} onChange={v=>set({payMonthOffset:v})}
          options={[0,1,2].map(k=>({value:String(k),label:MY_PAY_OFFSET_LABELS[k]}))}/>
        <MySelect label="給料日" name="payDay" value={f.payDay} onChange={v=>set({payDay:v})} options={MY_PAY_DAY_OPTIONS}/>
      </div>
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
function myPaySummaryText(pay,company){
  const p=myPayOf(pay);
  const cp=company&&company.pay?normalizePayVersion(company.pay):null;
  if(!p&&!cp)return"";
  const parts=[];
  if(p)parts.push(`${myPayDayLabel(p.closingDay)}締め・${MY_PAY_OFFSET_LABELS[p.payMonthOffset]}${myPayDayLabel(p.payDay)}払い`);
  if(cp)parts.push(`会社設定 ${cp.payType==="hourly"?"時給":"月給"}${fmtMyYen(cp.base)}`);
  else if(p&&p.rate>0)parts.push(`${MY_PAY_WAGE_TYPE_LABELS[p.wageType]}${fmtMyYen(p.rate)}`);
  return parts.join("・");
}
function MyWorkplaceEditor({w,personal,isNew,list,onDone,company,payLocked=false}){
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
          <MyPayFields kind={kind} f={pf} set={v=>{setPf(p=>({...p,...v}));setErr("");}} company={company}/>
        ):(
          <div>
            {company&&company.pay&&<MyCompanyPayView pay={company.pay}/>}
            <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginBottom:8}}>締日と給料日を入れると、給料タブで支給月ごとの見込みが出ます。</div>
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
              <div data-my-wp-name="1" style={{fontSize:15,fontWeight:700,color:"var(--c-text)",overflowWrap:"anywhere"}}>{w.name}</div>
              <div style={{fontSize:12,color:"var(--c-text3)"}}>{kindLabel(w)}{w.kind==="shifty"&&w.linked&&w.name!==w.shopName?`（${w.shopName}）`:""}</div>
              {!payLocked&&(()=>{const t=myPaySummaryText(w.rec&&w.rec.pay,companyPays[w.id]);return t?<div data-my-wp-pay="1" style={{fontSize:12,color:"var(--c-text3)",overflowWrap:"anywhere"}}>{t}</div>:null;})()}
            </div>
            {canEdit&&edit!==w.id&&(w.kind==="manual"||w.linked)&&<button data-my-action="editWorkplace" onClick={()=>{setMsg({});setEdit(w.id);}} style={{...AGray,padding:"8px 12px",fontSize:13,whiteSpace:"nowrap"}}>編集</button>}
            {(w.kind==="manual"||!w.linked)&&P.state==="ok"&&edit!==w.id&&<button data-my-action="deleteWorkplace" disabled={busy===w.id} onClick={()=>remove(w)} style={{...AGray,padding:"8px 12px",fontSize:13,whiteSpace:"nowrap"}}>削除</button>}
          </div>
          {edit===w.id&&<MyWorkplaceEditor w={w} personal={P} list={list} onDone={done} company={w.kind==="shifty"?companyPays[w.id]:null} payLocked={payLocked}/>}
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
// 月間目標に対する進捗の弧（1つの弧。アクセント1色＋中立色の下地）
function MyGoalRing({progress,size=112}){
  const r=size/2-8,c=2*Math.PI*r;
  const v=progress==null?0:progress;
  return(
    <svg data-my-goal-ring={progress==null?"none":Math.round(v*100)} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={progress==null?"目標は未設定":`目標の${Math.round(v*100)}%`} style={{flex:"0 0 auto"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--c-border)" strokeWidth="10"/>
      {v>0&&<circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--c-accent)" strokeWidth="10" strokeLinecap="butt"
        strokeDasharray={`${c*v} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{fontSize:20,fontWeight:700,fill:"var(--c-text)",fontVariantNumeric:"tabular-nums"}}>
        {progress==null?"—":`${Math.round(v*100)}%`}
      </text>
    </svg>
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
function MyPayTab({me,personal,onGoSettings}){
  const P=personal||{state:"ok",workplaces:{},shifts:{},overrides:{}};
  const todayStr=fd(new Date());
  const X=useMyPayExtras(me&&me.base);
  const[view,setView]=useState("month");     // month | year
  const[payYm,setPayYm]=useState(null);
  const[year,setYear]=useState(Number(todayStr.slice(0,4)));
  const[open,setOpen]=useState({});
  // 勤務先ごとの給料設定（Shifty の店舗・手入力の勤務先）。未設定の勤務先は MY_PAY_DEFAULT で振り分ける
  const ownPays=useMemo(()=>Object.values(P.workplaces||{}).map(r=>r&&myPayOf(r.pay)),[P.workplaces]);
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
  const wpList=useMemo(()=>myWorkplaceList(okLinks,P.workplaces),[okLinks,P.workplaces]);
  // 会社が登録した賃金（E6・getMyPay）。読み込み中の店舗は計算を待つ（本人の設定で一度出してから変わらないように）
  const companyPays=useMyCompanyPays(me,okLinks);
  const workplaces=useMemo(()=>{
    const manualDays=buildMyManualDays(wpList,P.shifts);
    return wpList.filter(w=>w.kind==="manual"||w.linked).map(w=>{
      const base={id:w.id,kind:w.kind,name:w.name,color:w.color,pay:myPayOf(w.rec&&w.rec.pay)};
      if(w.kind==="manual")return{...base,manualEntries:manualDays.filter(e=>e.workplaceId===w.id)};
      const l=okLinks.find(x=>x.shopId===w.id);const sh=shops[w.id];
      if(!l||!sh||!sh.ok)return null;
      const src={name:l.name,periods:sh.periods,subsByPeriod:mySubsByPeriodOf(w.id,sh,subs),settings:sh.settings,staff:sh.staff,todayStr,premium,
        overrides:(P.overrides||{})[w.id]};
      const info=myShiftyDayInfo(src);
      const cache=new Map();
      const monthSettingsOf=m=>{if(!cache.has(m))cache.set(m,myMonthSettingsOf(src,m));return cache.get(m);};
      const cp=companyPays[w.id];
      const companyNote=cp&&cp.state==="error"?"会社の賃金設定を確認できませんでした（本人の設定で計算しています）"
        :cp&&cp.state==="ok"&&!cp.pay&&cp.homeShopId?`賃金は所属店舗${cp.homeShopName?`（${cp.homeShopName}）`:""}で設定されています（このお店の分は本人の設定で計算しています）`:"";
      return{...base,companyPay:cp&&cp.state==="ok"?cp.pay:null,companyNote,shifty:{name:l.name,info,monthSettingsOf,wageSettings:sh.wageSettings||null}};
    }).filter(Boolean);
  },[wpList,okLinks,shops,subs,premium,todayStr,P.shifts,P.overrides,companyPays]);
  const month=useMemo(()=>premium&&view==="month"?myPayMonthFor({payYm:ym,workplaces,todayStr}):null,[premium,view,ym,workplaces,todayStr]);
  const yearRows=useMemo(()=>premium&&view==="year"?myPayYearSummary(myPayYearMonths(year).map(m=>myPayMonthFor({payYm:m,workplaces,todayStr})),X.received):null,
    [premium,view,year,workplaces,todayStr,X.received]);
  const loading=pending||P.state==="loading"||X.state==="loading"||okLinks.some(l=>!companyPays[l.shopId]);
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
  const progress=month?myGoalProgress(month.confirmedTotal,X.goal):null;
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
        {premium&&<section style={{...MY_SECTION,padding:"16px"}} data-my-pay-summary={month&&month.hasAmount?"amount":"none"}>
          {loading?<div style={{fontSize:14,color:"var(--c-text3)"}}>読み込み中…</div>:month&&(
            <div style={{display:"flex",gap:16,alignItems:"center"}}>
              <MyGoalRing progress={progress}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={MY_LABEL}>合計（目安）</div>
                <div data-my-pay-total={month.total} style={{fontSize:24,fontWeight:700,color:"var(--c-text)",fontVariantNumeric:"tabular-nums",lineHeight:1.2}}>{month.hasAmount?fmtMyYen(month.total):"—"}</div>
                <div style={{fontSize:13,color:"var(--c-text2)",marginTop:6,lineHeight:1.8,fontVariantNumeric:"tabular-nums"}}>
                  <div data-my-pay-confirmed={month.confirmedTotal}>確定分（今日まで）{month.hasAmount?fmtMyYen(month.confirmedTotal):"—"}</div>
                  <div data-my-pay-projected={month.projectedTotal}>これからの見込み {month.hasAmount?fmtMyYen(month.projectedTotal):"—"}</div>
                  <div data-my-pay-workmin={month.workMin}>勤務時間 {fmtMin(month.workMin)||"0:00"}</div>
                </div>
              </div>
            </div>
          )}
          {!loading&&<div style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7,marginTop:10}}>
            {X.goal>0?`月間目標 ${fmtMyYen(X.goal)} に対する確定分の割合です。`:<>月間目標を設定すると、確定分の進み具合が出ます。{onGoSettings&&<button data-my-action="goGoal" onClick={onGoSettings} style={{...MY_LINK_BTN,padding:"0 0 0 4px",fontSize:12}}>設定する</button>}</>}
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
              {r.amounts&&<div data-my-pay-row-total={r.amounts.total==null?"none":r.amounts.total} style={{fontSize:16,fontWeight:700,color:"var(--c-text)",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{r.amounts.total==null?"—":fmtMyYen(r.amounts.total)}</div>}
            </div>
            {r.amounts&&<>
              <div style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,marginTop:2,fontVariantNumeric:"tabular-nums"}}>
                {_myMd(r.plan.from)}〜{_myMd(r.plan.to)}の勤務 ／ {_myMd(r.plan.payDate)}払い ／ {fmtMin(r.amounts.minutes.workMin)||"0:00"}
                {r.amounts.total!=null&&` ／ 確定 ${fmtMyYen(r.amounts.confirmedTotal)}`}{r.estimate&&" ／ 目安"}
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
        {tab==="shift"&&<MyShiftTab me={me} personal={personal} onGoSettings={()=>setTab("settings")}/>}
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
            <MyField label="名前（お店に登録されている名前）" value={f.displayName} maxLength={MY_DISPLAY_NAME_MAX} autoComplete="name" data-my-input="pageDisplayName"
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
// 管理者側（スタッフの編集モーダルの中）: その人の承認済みの個別URL・取り消し・暗証番号のリセット
function StaffPageEditSection({links,name,tt}){
  const[busy,setBusy]=useState(false);
  if(!links||!links.enabled)return null;
  const cur=approvedStaffPagesByName(links.pages)[name];
  if(!cur)return(
    <div data-staff-page="none" style={{fontSize:12,color:"var(--c-text3)",lineHeight:1.7}}>個別URLはありません。本人がシフト募集URLの画面から申請すると、スタッフタブの「個別URLの申請」に出ます。</div>
  );
  const act=async(kind,confirmMsg,okMsg)=>{
    if(!window.confirm(confirmMsg))return;
    setBusy(true);
    const r=await links.pageAct(kind,cur.token);
    setBusy(false);
    tt(r.error?`▲ ${r.error}`:okMsg);
  };
  const d=new Date(cur.rec.approvedAt);
  return(
    <div data-staff-page="approved" data-staff-page-token={cur.token}>
      <div style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.7,marginBottom:6}}>
        個別URLを承認済み{Number.isFinite(d.getTime())?`（${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}）`:""}
      </div>
      <MyPageUrlBox url={buildMyPageUrl(myPageBaseUrl(),cur.token)}/>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button data-staff-page-action="revoke" disabled={busy} onClick={()=>act("revoke",`「${name}」さんの個別URLを取り消しますか？取り消すとそのURLは使えなくなります（本人がもう一度申請できます）。`,"個別URLを取り消しました")} style={{...AGray,opacity:busy?.6:1}}>個別URLを取り消す</button>
        <button data-staff-page-action="resetPin" disabled={busy} onClick={()=>act("resetPin",`「${name}」さんの給料の暗証番号をリセットしますか？本人が次に給料タブを開いたときに、新しい番号を決め直します。`,"暗証番号をリセットしました")} style={{...AGray,opacity:busy?.6:1}}>暗証番号をリセット</button>
      </div>
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
function MyShiftPager({panes}){
  const ref=useRef(null);
  const[active,setActive]=useState(0);
  const zoomed=useMyPinchZoomed();
  const go=i=>{const el=ref.current;if(!el)return;el.scrollTo({left:i*el.clientWidth,behavior:"smooth"});setActive(i);};
  const onScroll=()=>{const el=ref.current;if(!el||!el.clientWidth)return;const i=Math.round(el.scrollLeft/el.clientWidth);if(i!==active&&i>=0&&i<panes.length)setActive(i);};
  return(
    <div data-my-pager={panes[active]&&panes[active].key} data-my-pager-locked={zoomed?"1":"0"}>
      <div role="tablist" aria-label="表示の切り替え" style={{display:"flex",gap:4,background:"var(--c-input)",borderRadius:10,padding:4,marginBottom:12}}>
        {panes.map((p,i)=>{const a=i===active;return(
          <button key={p.key} role="tab" aria-selected={a} aria-controls={`my-pane-${p.key}`} data-my-pager-tab={p.key} onClick={()=>go(i)}
            style={{flex:1,minHeight:40,background:a?"var(--c-card)":"none",border:"none",borderRadius:8,fontSize:14,fontWeight:a?700:600,
              color:a?"var(--c-text)":"var(--c-text3)",boxShadow:a?"0 0 0 1px var(--c-border2)":"none",cursor:"pointer"}}>{p.label}</button>
        );})}
      </div>
      <div ref={ref} data-my-pager-track="1" onScroll={onScroll}
        style={{display:"flex",alignItems:"flex-start",overflowX:zoomed?"hidden":"auto",overflowY:"visible",scrollSnapType:"x mandatory",
          scrollbarWidth:"none",WebkitOverflowScrolling:"touch",overscrollBehaviorX:"contain"}}>
        {panes.map((p,i)=>(
          <section key={p.key} id={`my-pane-${p.key}`} role="tabpanel" aria-label={p.label} data-my-pane={p.key} aria-hidden={i!==active}
            style={{flex:"0 0 100%",minWidth:0,scrollSnapAlign:"start",scrollSnapStop:"always",boxSizing:"border-box"}}>
            {p.node}
          </section>
        ))}
      </div>
    </div>
  );
}
// 最新期間の全員のシフト表（公開済みだけ）。横幅に収める（横スクロール 0）。文字の大きさは人数と日数から決まる
function MyAllShiftTable({period,staff,settings,subs,plan,me}){
  const ref=useRef(null);
  const[width,setWidth]=useState(0);
  useEffect(()=>{
    const el=ref.current;if(!el)return;
    const upd=()=>setWidth(el.clientWidth);
    upd();
    if(typeof ResizeObserver==="function"){const ro=new ResizeObserver(upd);ro.observe(el);return()=>ro.disconnect();}
    window.addEventListener("resize",upd);return()=>window.removeEventListener("resize",upd);
  },[]);
  const todayStr=fd(new Date());
  const t=useMemo(()=>buildMyStaffTable({period,staff,settings,subs,todayStr,premium:featureEnabled("myShift",{plan}),me}),[period,staff,settings,subs,todayStr,plan,me]);
  // 列の幅の合計が表の幅を超えると table-layout:fixed は表を広げるので、表の外枠（左右 1px ずつ）を引いた幅で割る
  const L=myStaffTableLayout({width:Math.max(0,width-2),cols:t.cols||[],maxChars:t.maxChars});
  let body=null;
  if(t.state==="noPeriod")body=<MyEmptyState>まだ期間がありません。</MyEmptyState>;
  else if(t.state==="premium")body=<MyEmptyState><span data-my-all-state="premium">全員のシフト表は、お店がプレミアムプランのときに表示されます。</span></MyEmptyState>;
  else if(t.state==="unpublished")body=<MyEmptyState><span data-my-all-state="unpublished">{t.period.label||"最新の期間"}のシフトは、まだ公開されていません。お店が公開すると、全員のシフト表がここに出ます。</span></MyEmptyState>;
  else if(width>0){
    const cell={overflow:"hidden",whiteSpace:"nowrap",textAlign:"center",padding:"0 1px",borderRight:"1px solid var(--c-border)",lineHeight:1.2};
    const pd2=ds=>{const d=pd(ds);return{day:d.getDate(),wd:WD[d.getDay()],sun:d.getDay()===0,sat:d.getDay()===6};};
    body=(
      <div data-my-all-state="ok">
        <div style={{fontSize:13,color:"var(--c-text2)",lineHeight:1.6,marginBottom:8}}>
          {t.period.label} ／ {t.confirmed?"確定":"公開"}{(()=>{const d=new Date(t.publishedAt);return Number.isFinite(d.getTime())?`（${d.getMonth()+1}/${d.getDate()} 公開）`:"";})()}
          <span style={{display:"block",fontSize:12,color:"var(--c-text3)"}}>細かいところは2本の指で拡大して見てください。</span>
        </div>
        {/* 罫線は separate＋border-box（collapse だと外枠の半分が幅の外に出て、横幅を 1px 超える） */}
        <table data-my-all-table="1" data-my-all-font={L.fontPx} style={{tableLayout:"fixed",width:"100%",boxSizing:"border-box",borderCollapse:"separate",borderSpacing:0,fontSize:L.fontPx,fontVariantNumeric:"tabular-nums",
          border:"1px solid var(--c-border2)",background:"var(--c-card)",color:"var(--c-text)"}}>
          <colgroup>
            <col style={{width:L.dateW}}/>
            {t.cols.map((c,i)=><col key={i} style={{width:c.spacer?L.spacerW:L.colW}}/>)}
          </colgroup>
          <thead>
            <tr>
              <th style={{...cell,fontSize:Math.min(11,L.headFontPx+2),fontWeight:600,color:"var(--c-text3)",borderBottom:"1px solid var(--c-border2)"}}>日</th>
              {t.cols.map((c,i)=>c.spacer?<th key={i} style={{borderBottom:"1px solid var(--c-border2)",background:"var(--c-input)"}}/>:(
                <th key={i} data-my-all-col={c.name} data-my-all-me={c.me?"1":undefined} title={c.name}
                  style={{...cell,verticalAlign:"top",padding:"2px 0",fontSize:L.headFontPx,fontWeight:c.me?800:600,borderBottom:"1px solid var(--c-border2)",
                    background:c.me?"var(--c-input)":"none",writingMode:"vertical-rl",textOrientation:"upright",height:Math.ceil(L.headFontPx*Math.min(6,c.name.length)+6),letterSpacing:0}}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map(r=>{const d=pd2(r.date);const red=d.sun||r.holiday;return(
              <tr key={r.date} data-my-all-row={r.date} style={{height:L.rowH}}>
                <td style={{...cell,borderTop:"1px solid var(--c-border)",fontSize:Math.min(11,L.fontPx+2),color:red?"var(--c-danger)":"var(--c-text2)",fontWeight:600}}>{d.day}<br/><span style={{fontWeight:400}}>{d.wd}</span></td>
                {r.cells.map((c,i)=>t.cols[i].spacer?<td key={i} style={{background:"var(--c-input)",borderTop:"1px solid var(--c-border)"}}/>:(
                  <td key={i} data-my-all-cell={c?(c.work?"work":"leave"):"none"}
                    style={{...cell,borderTop:"1px solid var(--c-border)",background:t.cols[i].me?"var(--c-input)":"none",color:c&&!c.work?"var(--c-text3)":"var(--c-text)",fontWeight:c&&c.work?600:400}}>
                    {c?<>{c.top}<br/>{c.bottom}</>:null}
                  </td>
                ))}
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    );
  }
  return <div ref={ref} data-my-all="1" style={{width:"100%",minWidth:0}}>{body}</div>;
}

// 個別URLの画面の状態（承認待ち・却下・取り消し・見つからない）
function MyPageStatusScreen({state,shopName,token}){
  const url=isMyPageToken(token)?buildMyPageUrl(myPageBaseUrl(),token):"";
  return(
    <div data-my-page-state={state} style={{minHeight:"100vh",background:"var(--c-bg)"}}>
      <MyHeader title={shopName||"Shifty"}/>
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
// 個別URLの設定タブ: このページ（名前・お店・URL）・勤務先・月間目標（暗証番号で給料を開いている間だけ）
function MyPageSettingsTab({me,personal,page,shopName,token,payUnlocked}){
  return(
    <div>
      <section style={MY_SECTION} data-my-section="page">
        <div style={MY_SECTION_TITLE}>このページ</div>
        <div style={{fontSize:14,color:"var(--c-text2)",lineHeight:1.8,marginBottom:10}}>{shopName}の「{page.name}」さんのページです。</div>
        <MyPageUrlBox url={buildMyPageUrl(myPageBaseUrl(),token)} note={MY_PAGE_URL_NOTE}/>
      </section>
      <MyWorkplacesSection me={me} personal={personal} payLocked={!payUnlocked}/>
      {payUnlocked&&<MyGoalSection me={me}/>}
      {payUnlocked&&<MyPagePinChange token={token}/>}
      {!payUnlocked&&<div data-my-pin-note="1" style={{fontSize:13,color:"var(--c-text3)",lineHeight:1.7,padding:"0 4px"}}>月間目標と暗証番号の変更は、給料タブで暗証番号を入れると表示されます。</div>}
    </div>
  );
}
// 個別URLの入口。App が Phase1 で店舗を購読済み（periods・settings・staff・subs）。承認の状態は staffPages/{token} を購読して決める
function MyPageView({token,boot,shopId,shopName,periods,settings,staffList,subs,plan,syncStatus,onSub,onDeleteSub}){
  const[rec,setRec]=useState(undefined); // shops/{sid}/staffPages/{token}（undefined=読み込み中・null=無い）
  const[tab,setTab]=useState("shift");
  const[pay,setPay]=useState(null);      // 暗証番号で開いた給料（P4）: {key, byShop}
  useEffect(()=>{
    if(!shopId||!isMyPageToken(token)||!firebaseDB)return;
    const r=firebaseDB.ref(`shops/${shopId}/staffPages/${token}`);
    const cb=r.on("value",s=>setRec(s.val()||null),e=>{console.warn("個別URLの読み込みに失敗:",e&&e.code);setRec(null);});
    return()=>r.off("value",cb);
  },[shopId,token]);
  const page=useMemo(()=>resolveMyPage(token,shopId?{shopId}:null,rec,staffList),[token,shopId,rec,staffList]);
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
  const unlockPay=r=>setPay({key:String(Date.now()),byShop:{[shopId]:myCompanyPayOf(r)}});
  if(!boot)return <MyPageStatusScreen state="loading" token={token}/>;
  if(boot.state!=="shop")return <MyPageStatusScreen state={boot.state==="invalid"?"invalid":"missing"} token={token}/>;
  if(rec===undefined)return <MyPageStatusScreen state="loading" shopName={shopName} token={token}/>;
  if(page.state!=="ok")return <MyPageStatusScreen state={page.state} shopName={shopName} token={token}/>;
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
      <MyHeader title={label}/>
      {syncStatus==="offline"&&<div style={{background:"var(--c-input)",color:"var(--c-text2)",fontSize:12,textAlign:"center",padding:"4px 8px"}}>オフライン（再接続中…）</div>}
      <main style={{maxWidth:560,margin:"0 auto",padding:"16px 16px 96px"}}>
        <div style={{fontSize:13,color:"var(--c-text3)",marginBottom:4}} data-my-who="1">{page.name} さん ／ {shopName}</div>
        {tab==="shift"&&<MyShiftPager panes={[
          {key:"mine",label:"自分のシフト",node:<MyShiftTab me={me} personal={personal}/>},
          {key:"all",label:"全員のシフト",node:<MyAllShiftTable period={myLatestPeriodOf(periods)} staff={staffList} settings={settings} subs={subs} plan={plan} me={page.name}/>},
        ]}/>}
        {tab==="pay"&&(pay?<div data-my-pay-unlocked="1">
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
            <button data-my-action="lockPay" onClick={()=>setPay(null)} style={{...AGray,padding:"6px 12px",fontSize:13}}>給料を閉じる</button>
          </div>
          <MyPayTab me={me} personal={personal}/>
        </div>:<MyPagePayGate token={token} onUnlock={unlockPay}/>)}
        {tab==="settings"&&<MyPageSettingsTab me={me} personal={personal} page={page} shopName={shopName} token={token} payUnlocked={!!pay}/>}
      </main>
      <MyTabBar tab={tab} onTab={setTab} tabs={tabs}/>
    </div>
  );
}
