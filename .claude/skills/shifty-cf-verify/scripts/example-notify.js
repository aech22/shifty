// 通知（Web Push・2026-10-08）の Cloud Functions を本物の functions/index.js で回す。
//   notifyNewPeriod（periods の onCreate）・notifyStaffSubmit（subs の onWrite）・notifyDeadlines（毎日12時の schedule）
// web-push はスタブ（endpoint に "GONE" を含むと 410、"FAIL" を含むと 500 を返す）。
// 確かめること: 4種の通知の宛先と本文・送らない側（未承認・名前の消えた人・非表示・提出済み・管理者の編集・owners から外れた端末・デモ）・
// 同じ端末へ1回だけ・410 の購読を消す・500 では消さず他の宛先は送る・秘密鍵が無ければ1件も送らない。
// 使い方: node example-notify.js            （このファイルの2つ上の worktree の functions/index.js を読む）
//         SHIFTY_CF_INDEX=/path/index.js node example-notify.js   （反証: 通知を足す前の index.js では最初の項目で落ちる）
"use strict";
const path = require("path");
const { loadFunctions, makeChecker } = require("./cf-harness.js");

const INDEX = process.env.SHIFTY_CF_INDEX || path.join(__dirname, "..", "..", "..", "..", "functions", "index.js");
const check = makeChecker();

const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const TODAY = jstToday();
const tok = c => c.repeat(24);
const key = c => c.repeat(32);
const rec = (endpoint, extra = {}) => ({ endpoint, keys: { p256dh: "BPk", auth: "au" }, at: "2026-10-08T00:00:00Z", ...extra });
const EP = n => `https://push.example/${n}`;

const p2 = { id: "p2", label: "10月後半", startDate: addDays(TODAY, 3), endDate: addDays(TODAY, 18), deadlineDate: addDays(TODAY, 1), urlToken: "u2" };
const p3 = { id: "p3", label: "10月前半", startDate: addDays(TODAY, 2), endDate: addDays(TODAY, 16), deadlineDate: TODAY, urlToken: "u3" };
const p4 = { id: "p4", label: "11月前半", startDate: addDays(TODAY, 20), endDate: addDays(TODAY, 34), urlToken: "u4" };
const p5 = { id: "p5", label: "11月後半", startDate: addDays(TODAY, 35), endDate: addDays(TODAY, 50), urlToken: "u5", submission: { at: "x", byUid: "own1" } };

function data() {
  return {
    global: { shops: {
      s1: { id: "s1", name: "三ビル店" },
      s2: { id: "s2", name: "東通り店" },
      "demo-toriMatsu-v1": { id: "demo-toriMatsu-v1", name: "とり松" },
    } },
    shops: {
      s1: {
        staff: ["田中", "佐藤", "鈴木", "高橋", "__spacer__1"],
        settings: { staffAliases: { "佐藤": ["さとう"] }, staffHidden: { "高橋": true } },
        periods: { p3, p4, p5 },
        staffPages: {
          [tok("A")]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "x", approvedAt: "x" },
          [tok("B")]: { status: "approved", name: "佐藤", displayName: "佐藤", requestedAt: "x", approvedAt: "x" },
          [tok("C")]: { status: "pending", displayName: "鈴木", requestedAt: "x" },
          [tok("D")]: { status: "approved", name: "退職者", displayName: "退職者", requestedAt: "x", approvedAt: "x" },
          [tok("H")]: { status: "approved", name: "高橋", displayName: "高橋", requestedAt: "x", approvedAt: "x" },
        },
        staffLinks: { uid1: { name: "鈴木", method: "name", at: "x" }, uid2: { name: "田中", method: "page", at: "x" } },
        owners: { own1: "KEY", own2: "KEY" },
        private: { adminKey: "KEY", push: {
          [key("6")]: rec(EP("ADM1"), { uid: "own1" }),
          [key("7")]: rec(EP("ADM_OLD"), { uid: "exowner" }),
          [key("8")]: rec(EP("ADM_GONE"), { uid: "own2" }),
        } },
        subs: {
          sA: { id: "sA", periodId: "p3", staffName: "田中", submittedAt: "x", shifts: {} },
          sB: { id: "sB", periodId: "p3", staffName: "さとう", submittedAt: "x", shifts: {} },
          sG: { id: "sG", periodId: "p3", staffName: "鈴木", submittedAt: "x", source: "grid", shifts: {} },
          sX: { id: "sX", periodId: "p4", staffName: "鈴木", submittedAt: "x", shifts: {} },
        },
        company: { id: "co1", name: "鶏グループ", deadlines: { [`${p4.startDate}_${p4.endDate}`]: TODAY, [`${p5.startDate}_${p5.endDate}`]: TODAY }, shops: { s1: "三ビル店" } },
      },
      s2: {
        staff: ["山田"],
        periods: { q1: { id: "q1", label: "来月", startDate: addDays(TODAY, 1), endDate: addDays(TODAY, 15) } },
        owners: { o2: "K2" },
        private: { push: { [key("9")]: rec(EP("ADM_S2"), { uid: "o2" }) } },
        company: { id: "co1", monthlyDeadlineDays: [Number(TODAY.slice(8))] },
      },
      "demo-toriMatsu-v1": {
        staff: ["デモ"], periods: { d1: { id: "d1", label: "デモ", startDate: addDays(TODAY, 1), endDate: addDays(TODAY, 10), deadlineDate: TODAY } },
        staffPages: { [tok("Z")]: { status: "approved", name: "デモ" } },
        owners: { od: "K" }, private: { push: { [key("a")]: rec(EP("ADM_DEMO"), { uid: "od" }) } },
      },
    },
    staffPageData: {
      [tok("A")]: { push: { [key("1")]: rec(EP("A")) } },
      [tok("B")]: { push: { [key("2")]: rec(EP("B")), [key("f")]: rec(EP("B_FAIL")) } },
      [tok("C")]: { push: { [key("c")]: rec(EP("C")) } },
      [tok("D")]: { push: { [key("d")]: rec(EP("D")) } },
      [tok("H")]: { push: { [key("e")]: rec(EP("H")) } },
      [tok("Z")]: { push: { [key("b")]: rec(EP("DEMO")) } },
    },
    users: {
      uid1: { push: { [key("3")]: rec(EP("U1")), "not-a-key": rec(EP("U1_BADKEY")) } },
      uid2: { push: { [key("4")]: rec(EP("A")), [key("5")]: rec(EP("U2_GONE")) } },
    },
  };
}

function load(opts = {}) {
  const sent = [];
  const webpush = {
    setVapidDetails(subject, pub, priv) { webpush.vapid = { subject, pub, priv }; },
    sendNotification: async (sub, payload) => {
      if (/GONE/.test(sub.endpoint)) { const e = new Error("gone"); e.statusCode = 410; throw e; }
      if (/FAIL/.test(sub.endpoint)) { const e = new Error("server"); e.statusCode = 500; throw e; }
      sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) });
      return { statusCode: 201 };
    },
  };
  if (opts.noKey) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = "test-private-key";
  const h = loadFunctions({ indexPath: INDEX, data: opts.data || data(), webpush });
  return { h, sent, webpush };
}
const snapOf = v => ({ val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))) });
const changeOf = (b, a) => ({ before: snapOf(b), after: snapOf(a) });
const eps = sent => sent.map(s => s.endpoint.replace(EP(""), "")).sort();
const quiet = async fn => {
  const o = { log: console.log, warn: console.warn };
  const logs = [];
  console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push("WARN " + a.join(" "));
  try { return await fn(); } finally { console.log = o.log; console.warn = o.warn; }
};

(async () => {
  // ===== 1. 新しい期間 =====
  {
    const { h, sent, webpush } = load();
    check("通知の関数が3つある（notifyNewPeriod / notifyStaffSubmit / notifyDeadlines）",
      ["notifyNewPeriod", "notifyStaffSubmit", "notifyDeadlines"].every(k => typeof h.fns[k] === "function"));
    if (typeof h.fns.notifyNewPeriod !== "function") return check.done();
    h.db.put("shops/s1/periods/p2", p2);
    await quiet(() => h.fns.notifyNewPeriod(snapOf(p2), { params: { shopId: "s1", periodId: "p2" } }));
    check("新しい期間: 承認済みの個別URL（田中・佐藤）とアカウント（鈴木）へ送り、同じ端末（A）は1回だけ",
      JSON.stringify(eps(sent)) === JSON.stringify(["A", "B", "U1"]), eps(sent));
    check("新しい期間: 申請中（C）・名前がスタッフ一覧に無い（D）・非表示（高橋）・形の違うキーには送らない",
      !eps(sent).some(e => ["C", "D", "H", "U1_BADKEY"].includes(e)));
    const a = sent.find(s => s.endpoint === EP("A"));
    check("新しい期間: 本文は「{店舗名}：{期間名}のシフト提出が始まりました」・タイトルは Shifty",
      a && a.body === "三ビル店：10月後半のシフト提出が始まりました" && a.title === "Shifty", a);
    check("新しい期間: 個別URLの人は #/m/<token>、アカウントの人は #/me を開く",
      a && a.url === `https://shiftyshifty.app/#/m/${tok("A")}` && (sent.find(s => s.endpoint === EP("U1")) || {}).url === "https://shiftyshifty.app/#/me", sent);
    check("410 が返った購読（users/uid2 の U2_GONE）は消す", h.db.get(`users/uid2/push/${key("5")}`) === undefined);
    check("500 が返った購読（B_FAIL）は消さない・他の宛先は送れている",
      h.db.get(`staffPageData/${tok("B")}/push/${key("f")}`) !== undefined && eps(sent).includes("B"));
    check("VAPID は公開鍵と subject と秘密鍵（環境変数）で設定する",
      webpush.vapid && webpush.vapid.priv === "test-private-key" && /^https:\/\/shiftyshifty\.app/.test(webpush.vapid.subject) && webpush.vapid.pub.length === 87, webpush.vapid);
  }
  {
    const { h, sent } = load();
    const past = { id: "pp", label: "先月", startDate: addDays(TODAY, -40), endDate: addDays(TODAY, -25) };
    await quiet(() => h.fns.notifyNewPeriod(snapOf(past), { params: { shopId: "s1", periodId: "pp" } }));
    const demo = { id: "d2", label: "デモ", startDate: addDays(TODAY, 1), endDate: addDays(TODAY, 10) };
    await quiet(() => h.fns.notifyNewPeriod(snapOf(demo), { params: { shopId: "demo-toriMatsu-v1", periodId: "d2" } }));
    check("新しい期間: 終わった期間を後から作ったとき・デモ店舗では送らない", sent.length === 0, eps(sent));
  }
  {
    const { h, sent } = load({ noKey: true });
    await quiet(() => h.fns.notifyNewPeriod(snapOf(p2), { params: { shopId: "s1", periodId: "p2" } }));
    check("秘密鍵（VAPID_PRIVATE_KEY）が無ければ1件も送らず、購読も消さない",
      sent.length === 0 && h.db.get(`users/uid2/push/${key("5")}`) !== undefined);
  }

  // ===== 3. 提出（管理者向け）=====
  const sub = (o = {}) => ({ id: "n1", periodId: "p3", staffName: "田中", submittedAt: "2026-10-08T03:00:00.000Z", shifts: { [p3.startDate]: { status: "work", start: "09:00", end: "17:00" } }, comment: "", ...o });
  {
    const { h, sent } = load();
    await quiet(() => h.fns.notifyStaffSubmit(changeOf(null, sub()), { params: { shopId: "s1", subId: "n1" } }));
    check("提出（初回）: owners にいる端末（ADM1）へ送り、owners から外れた端末（ADM_OLD）には送らない",
      JSON.stringify(eps(sent)) === JSON.stringify(["ADM1"]), eps(sent));
    check("提出（初回）: 本文は「{店舗名}：{名前}さんがシフトを提出しました（{期間名}）」・開く先は #/admin",
      sent[0] && sent[0].body === "三ビル店：田中さんがシフトを提出しました（10月前半）" && sent[0].url === "https://shiftyshifty.app/#/admin", sent[0]);
    check("提出（初回）: 410 の管理者の購読（ADM_GONE）は消す", h.db.get(`shops/s1/private/push/${key("8")}`) === undefined);
  }
  {
    const { h, sent } = load();
    const run = (b, a) => quiet(() => h.fns.notifyStaffSubmit(changeOf(b, a), { params: { shopId: "s1", subId: "n1" } }));
    await run(null, sub({ staffName: "さとう" }));
    check("提出: 別名で出した提出は登録名で知らせる", sent.length === 1 && /佐藤さんがシフトを提出しました/.test(sent[0].body), sent);
    sent.length = 0;
    await run(sub({ source: "grid", submittedAt: "2026-10-01T00:00:00.000Z", shifts: {} }), sub());
    check("提出: 管理者の下書き（source:grid）の上にスタッフが初めて出した提出は知らせる", sent.length === 1, sent);
    sent.length = 0;
    await run(sub({ updatedAt: "2026-10-08T05:00:00.000Z", isUpdated: true }), sub({ updatedAt: "2026-10-08T06:00:00.000Z", isUpdated: true }));
    check("提出: 再提出（updatedAt が新しくなり isUpdated）は「再提出しました」", sent.length === 1 && /さんがシフトを再提出しました/.test(sent[0].body), sent);
    sent.length = 0;
    await run(sub({ updatedAt: "2026-10-08T05:00:00.000Z", isUpdated: true }), sub({ updatedAt: "2026-10-08T05:00:00.000Z", isUpdated: true, shifts: { [p3.startDate]: { status: "work", start: "10:00", end: "17:00", adjustedStart: "10:00" } } }));
    await run(sub(), sub({ shifts: { [p3.startDate]: { status: "work", start: "09:00", end: "17:00", adminRest: true } } }));
    await run(null, sub({ source: "grid", staffName: "鈴木" }));
    await run(sub(), null);
    await run(sub({ updatedAt: "2026-10-08T06:00:00.000Z", isUpdated: true }), sub({ updatedAt: "2026-10-08T05:00:00.000Z", isUpdated: true }));
    check("提出: 管理者の編集（updatedAt を変えない）・管理者の下書きの作成・削除・古い updatedAt の書き戻しでは送らない", sent.length === 0, sent);
    await quiet(() => h.fns.notifyStaffSubmit(changeOf(null, sub()), { params: { shopId: "demo-toriMatsu-v1", subId: "n1" } }));
    check("提出: デモ店舗では送らない", sent.length === 0, sent);
  }

  // ===== 2・4. 締切日の12時 =====
  {
    const { h, sent } = load();
    const r = await quiet(() => h.fns.notifyDeadlines({}));
    const staff = sent.filter(s => /提出締切日です/.test(s.body) && !/企業へ/.test(s.body));
    const admin = sent.filter(s => /企業へのシフト提出締切日です/.test(s.body));
    check("締切日（スタッフ）: まだ提出していない人（鈴木・アカウント）だけ。田中は提出済み・佐藤は別名で提出済み・高橋は非表示・下書きは提出ではない",
      JSON.stringify(eps(staff)) === JSON.stringify(["U1"]), eps(staff));
    check("締切日（スタッフ）: 本文は「{店舗名}：今日は{期間名}の提出締切日です」",
      staff[0] && staff[0].body === "三ビル店：今日は10月前半の提出締切日です" && staff[0].url === "https://shiftyshifty.app/#/me", staff[0]);
    check("企業の締切（日付指定）: 今日が締切で未提出の期間（11月前半）だけ管理者へ。提出済みの期間（11月後半）は送らない",
      admin.filter(s => s.endpoint === EP("ADM1")).length === 1 && admin.some(s => s.body === "三ビル店：11月前半の企業へのシフト提出締切日です"), admin);
    check("企業の締切（毎月の固定日）: 別の店舗（東通り店）の管理者へも送る",
      admin.some(s => s.endpoint === EP("ADM_S2") && s.body === "東通り店：来月の企業へのシフト提出締切日です"), admin);
    check("締切: デモ店舗には送らない・期間の無い日に余計な宛先へ送らない",
      !sent.some(s => /DEMO/.test(s.endpoint)) && sent.length === 3, eps(sent));
    check("締切: 関数は完走する", r === null, r);
  }

  check.done();
})();
