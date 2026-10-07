// 提出状況一覧（SmModal・app-staff.js）の「未提出」に、スタッフタブで非表示にした人を出さない（2026-10-08 ユーザー指示）の回帰テスト。
// 部品だけを実ブラウザにマウントする（app-main.js を読まない＝Firebase へは1バイトも出ない）。
//  A: 非表示（true＝全期間）の佐藤は未提出に出ない・非表示でない鈴木は出る・提出済みの田中は出ない
//  B: 非表示の範囲が11月からの佐藤は、10月の期間では未提出に出る（期間で判定する＝visibleStaffList と同じ）
//  C: 提出が1件も無い期間の「未提出：…」の行でも、非表示の人は出ない
//  D: スタッフ画面（StaffView）のヘッダーの「提出状況」から開いた一覧でも同じ（呼び出し元が settings を渡している）
//  E: 期限付き削除で残した人（keepStaff）は従来どおり未提出に出る（#110 の非回帰）
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-smmodal-hidden.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<修正前の配信物> node ... → EXIT≠0（A・C・D で佐藤が未提出に出る）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
// 既定はこのスクリプトが置かれたチェックアウト（mount-component.js の REPO_ROOT は本体のパスに固定）
const ROOT = process.env.SHIFTY_ROOT || path.resolve(__dirname, "..", "..", "..", "..");

const PERIOD = `{id:"p1",urlToken:"t1",shopId:"s1",label:"2026年10月前半",startDate:"2026-10-01",endDate:"2026-10-03",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z",keepStaff:[{name:"高橋",index:3}]}`;
const SUB_TANAKA = `{id:"sub1",periodId:"p1",shopId:"s1",staffName:"田中",comment:"",submittedAt:"2026-09-20T00:00:00.000Z",shifts:{"2026-10-01":{status:"work",start:"10:00",end:"18:00"}}}`;
const STAFF = `["田中","佐藤","鈴木"]`;

async function mountModal(hidden, subs) {
  const h = await openHarness({
    root: ROOT, viewport: { width: 375, height: 812 }, waitFor: "#root > *",
    jsx: `
      function Harness(){
        return <SmModal subs={${subs}} periods={[${PERIOD}]} apid="p1" onClose={()=>{}} staffList={${STAFF}} plan="premium"
          staffAliases={{}} settings={{shopId:"s1",candidates:[],staffHidden:${hidden}}} onDeleteSub={()=>{}} onEditSub={()=>{}} myName={null}/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
    `,
  });
  return h;
}
// 「未提出（n名）」の下のチップ、または「未提出：a、b」の行から名前を取る
const notSubmitted = h => h.evaluate(() => {
  const t = document.body.innerText;
  const line = t.match(/未提出：([^\n]*)/);
  if (line) return { kind: "line", names: line[1].split("、").map(s => s.trim()).filter(Boolean) };
  const head = [...document.querySelectorAll("div")].find(d => /^未提出（\d+名）$/.test(d.innerText.trim()));
  if (!head) return { kind: "none", names: [] };
  const box = head.nextElementSibling;
  return { kind: "chips", count: Number(head.innerText.match(/\d+/)[0]), names: [...box.querySelectorAll("span")].map(s => s.innerText.trim()) };
});
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

(async () => {
  const R = {}, V = {};
  for (const [key, hidden, subs, expect] of [
    ["A", `{"佐藤":true}`, `[${SUB_TANAKA}]`, ["鈴木", "高橋"]],
    ["B", `{"佐藤":[{from:"2026-11-01",to:null}]}`, `[${SUB_TANAKA}]`, ["佐藤", "鈴木", "高橋"]],
    ["C", `{"佐藤":true}`, `[]`, ["田中", "鈴木", "高橋"]],
  ]) {
    const h = await mountModal(hidden, subs);
    try {
      const ns = await notSubmitted(h);
      R[key] = { ns, errors: h.errors.slice() };
      V[key] = same(ns.names, expect) && (ns.kind !== "chips" || ns.count === expect.length) && R[key].errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // D: StaffView から開く
  {
    const h = await openHarness({
      root: ROOT, viewport: { width: 375, height: 812 }, waitFor: "#root button",
      jsx: `
        function Harness(){
          return <StaffView periods={[${PERIOD}]} ap={${PERIOD}} apid="p1" setApid={()=>{}}
            shopId="s1" settings={{shopId:"s1",candidates:[],staffAliases:{},staffHidden:{"佐藤":true}}}
            subs={[${SUB_TANAKA}]} staffList={${STAFF}}
            onSub={()=>Promise.resolve()} onDeleteSub={()=>{}} shopName="テスト店" plan="premium"/>;
        }
        ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
      `,
    });
    try {
      const opened = await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /提出状況/.test(x.innerText)); if (!b) return false; b.click(); return true; });
      await h.page.waitForTimeout(400);
      const ns = await notSubmitted(h);
      R.D = { opened, ns, errors: h.errors.slice() };
      V.D = opened && same(ns.names, ["鈴木", "高橋"]) && R.D.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  V.E_keepStaffStillListed = R.A.ns.names.includes("高橋") && R.D.ns.names.includes("高橋");
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: { allPass, ...V }, R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
