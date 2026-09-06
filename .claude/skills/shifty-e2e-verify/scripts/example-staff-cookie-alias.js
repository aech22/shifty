// バグチェック#112 の実ブラウザ回帰テスト。
// 「別名で提出 → 管理者が別名登録 → 別端末からの再提出で staffName が登録名へ正規化」された後、
// 端末A（Cookie にはまだ別名が入っている）で開いたときに提出済み画面が復元されるか。
// app-main.js を読み込まないので Firebase へは1バイトも出ない。
//
// 実行: node verify-112.js            → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<修正前の配信物> node verify-112.js → EXIT=1（落ちないなら何も検証していない）
"use strict";
const { openHarness } = require(require("node:path").join(__dirname, "mount-component.js"));

const ROOT = process.env.SHIFTY_ROOT || undefined;

const PERIOD = `{id:"p1",urlToken:"t1",shopId:"s1",label:"2026年10月前半",startDate:"2026-10-01",endDate:"2026-10-03",deadlineDate:"2026-09-28",createdAt:"2026-09-01T00:00:00.000Z"}`;
// 別端末からの再提出で staffName は既に登録名「田中」へ正規化されている。
// 管理者は adjustedStart と メモを入れている（引き継ぎの確認用）。出勤は2日。
const SUB_A = `{id:"A",periodId:"p1",shopId:"s1",staffName:"田中",comment:"よろしくお願いします",submittedAt:"2026-09-20T00:00:00.000Z",
  shifts:{"2026-10-01":{status:"work",start:"10:00",end:"18:00",adjustedStart:"09:00",adjustedStartNote:"研修"},
          "2026-10-02":{status:"work",start:"11:00",end:"19:00"},
          "2026-10-03":{status:"holiday"}}}`;

async function run(label, cookieName, aliases) {
  const h = await openHarness({
    root: ROOT,
    waitFor: "#root button",
    jsx: `
      // 端末Aの Cookie。提出した当時の表記のまま1年残っている。
      setCookie(ckStaffKey("s1","p1"), ${JSON.stringify(cookieName)}, 365);
      function Harness(){
        return <StaffView periods={[${PERIOD}]} ap={${PERIOD}} apid="p1" setApid={()=>{}}
          shopId="s1" settings={{shopId:"s1",candidates:[],staffAliases:${aliases}}}
          subs={[${SUB_A}]} staffList={["田中","鈴木"]}
          onSub={s=>{window.__submitted=s;return Promise.resolve();}}
          onDeleteSub={()=>{}} shopName="テスト店" plan="premium"/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
    `,
  });
  const text = await h.evaluate(() => document.body.innerText);
  const out = {
    label,
    restored: text.includes("提出完了！"),
    workDays: (text.match(/出勤予定：(\d+)日/) || [])[1] || null,
    comment: text.includes("よろしくお願いします"),
    errors: h.errors.length,
  };
  await h.close();
  return out;
}

(async () => {
  const A = `{"田中":["たなか"]}`;
  const rows = [];
  // 本件: Cookie は別名、sub は正規化済みの登録名
  rows.push(await run("【本件】Cookie=別名「たなか」／sub=登録名「田中」", "たなか", A));
  // 非回帰: Cookie も sub も登録名（別名を使っていない普通の利用）
  rows.push(await run("【非回帰】Cookie=登録名「田中」／sub=登録名「田中」", "田中", A));
  // 非回帰: 別名を一切登録していない店舗
  rows.push(await run("【非回帰】別名の登録が無い店舗（Cookie=「田中」）", "田中", `{}`));
  // 対照: 他人の名前が Cookie に入っている（復元してはいけない）
  rows.push(await run("【対照】Cookie=「鈴木」（提出していない人・復元しないのが正しい）", "鈴木", A));

  for (const r of rows) {
    console.log(r.label);
    console.log(`   提出済み画面の復元 = ${r.restored ? "する" : "しない（空フォーム）"}` +
      ` / 出勤予定 = ${r.workDays ?? "—"}日 / コメント復元 = ${r.comment ? "あり" : "なし"} / エラー = ${r.errors}件`);
  }
  const pass =
    rows[0].restored && rows[0].workDays === "2" && rows[0].comment &&
    rows[1].restored && rows[1].workDays === "2" &&
    rows[2].restored && rows[2].workDays === "2" &&
    !rows[3].restored &&
    rows.every(r => r.errors === 0);
  console.log("\nallPass =", pass);
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
