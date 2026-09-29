// P6a（賃金マスタ）のセキュリティルールを dev（thirty-dev-b6958）で REST 実測する（2026-09-30）。
// 新しい匿名uid A（＝オーナーでない端末）と、管理コードで owners に自己登録した匿名uid B（＝オーナー）で
// shops/{標準テスト店舗}/private/pay・private/payCode と companies/*/private/payCode を叩き、401/200 を比べる。
// 使い捨てデータ（pay/__probe・payCode）と B の owners 登録は検証の中で消す。本番では実行しない。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/probe-rules-pay.js .claude/skills/shifty-e2e-verify/.secrets.local → ALL_OK true
const fs=require("fs");
const KEY="AIzaSyAR4TJRJytLge7jgei4xbKXHwUfU-nWEd0", DB="https://thirty-dev-b6958-default-rtdb.firebaseio.com";
const sec=fs.readFileSync(process.argv[2],"utf8");
const code=(sec.match(/SHIFTY_TEST_ADMIN_CODE=(.+)/)||[])[1].trim().replace(/^["']|["']$/g,"");
const SID="eb6AfsQv4JAht+cX*xP7fuDa";
if(!code.startsWith(SID+"."))throw new Error("管理コードの形が想定外");
const ADMIN=code.slice(SID.length+1);
const enc=p=>p.split("/").map(encodeURIComponent).join("/").replace(/\*/g,"%2A");
async function anon(){const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({returnSecureToken:true})});const j=await r.json();return{tok:j.idToken,uid:j.localId};}
async function req(m,p,tok,body){const r=await fetch(`${DB}/${enc(p)}.json?auth=${tok}`,{method:m,headers:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});return r.status;}
(async()=>{
  const A=await anon(), B=await anon(), R=[];
  const S=`shops/${SID}`;
  const t=async(label,m,p,who,body,expect)=>{const s=await req(m,p,who.tok,body);R.push({label,status:s,expect,ok:s===expect});};
  // B をオーナーに（正規の管理コード方式）
  await t("B owners 自己登録(管理コード)","PUT",`${S}/owners/${B.uid}`,B,ADMIN,200);
  // 既存値の退避（オーナーで読む）
  const before=await (await fetch(`${DB}/${enc(S+"/private/payCode")}.json?auth=${B.tok}`)).json();
  const beforePay=await (await fetch(`${DB}/${enc(S+"/private/pay/__probe")}.json?auth=${B.tok}`)).json();
  R.push({label:"事前の payCode/pay/__probe",value:{payCode:before===null?null:"exists",probe:beforePay}});
  const good={payType:"hourly",base:1231,effectiveFrom:"2026-10-01"};
  const hash="a".repeat(64);
  // 非オーナー
  await t("A 非オーナー pay 読み","GET",`${S}/private/pay`,A,undefined,401);
  await t("A 非オーナー pay 書き","PUT",`${S}/private/pay/__probe`,A,good,401);
  await t("A 非オーナー payCode 読み","GET",`${S}/private/payCode`,A,undefined,401);
  await t("A 非オーナー payCode 書き","PUT",`${S}/private/payCode`,A,{hash,salt:"s"},401);
  await t("A settings は従来どおり読める(賃金は無い)","GET",`${S}/settings/staffNumbers`,A,undefined,200);
  // オーナー
  await t("B オーナー pay 書き","PUT",`${S}/private/pay/__probe`,B,good,200);
  await t("B オーナー pay 読み","GET",`${S}/private/pay/__probe`,B,undefined,200);
  await t("B オーナー pay 形の不正(payType欠落)","PUT",`${S}/private/pay/__probe2`,B,{base:1},401);
  await t("B オーナー pay 形の不正(payType=weekly)","PUT",`${S}/private/pay/__probe2`,B,{payType:"weekly",base:1},401);
  await t("B オーナー pay update(PATCH)","PATCH",`${S}/private/pay`,B,{__probe:{...good,base:1300}},200);
  await t("B オーナー pay 削除","DELETE",`${S}/private/pay/__probe`,B,undefined,200);
  if(before===null){
    await t("B オーナー payCode 書き","PUT",`${S}/private/payCode`,B,{hash,salt:"s",updatedAt:"t"},200);
    await t("A 非オーナー payCode 読み(書いた後)","GET",`${S}/private/payCode`,A,undefined,401);
    await t("B オーナー payCode 形の不正(hash短い)","PUT",`${S}/private/payCode`,B,{hash:"ab",salt:"s"},401);
    await t("B オーナー payCode 削除(復元)","DELETE",`${S}/private/payCode`,B,undefined,200);
  } else R.push({label:"payCode は既存のため書き込み検証を省略"});
  await t("A 企業の private/payCode 読み","GET",`companies/-probe/private/payCode`,A,undefined,401);
  await t("A 企業の private/passwordHash 読み(従来どおり閉)","GET",`companies/-probe/private/passwordHash`,A,undefined,401);
  // 後始末
  await t("B owners 自己登録の削除","DELETE",`${S}/owners/${B.uid}`,B,undefined,200);
  const afterA=await req("GET",`${S}/private/pay/__probe`,A.tok);
  R.push({label:"後始末の確認(Bはもう非オーナー→401)",status:await req("GET",`${S}/private`,B.tok),expect:401});
  console.log(JSON.stringify(R,null,1));
  console.log("ALL_OK",R.filter(r=>"expect" in r).every(r=>r.status===r.expect));
})();
