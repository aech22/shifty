// 実例: 専用URLのお店をメールのアカウントに追加する Cloud Function linkStaffPage（2026-10-05）を本物のまま実行する。
// 許可側（暗証番号なしの URL・暗証番号ありの URL・二度目は already・追加後に getMyPay で本人の賃金が取れる・保留中の申請が消える）と
// 拒否側（未認証・匿名・形・見つからない・承認待ち・取り消し・名前がスタッフ一覧に無い・デモ店舗・管理者の uid・企業の uid・
// 別の名前でリンク済み・その名前が別のアカウントとリンク済み・暗証番号なし・誤り・止まっている間）を1項目ずつ通す。
// 反証: SHIFTY_CF_INDEX に d781ac6 の functions/index.js を渡すと落ちる（関数が無い）。
"use strict";
const { loadFunctions, callFn, makeChecker } = require("./cf-harness.js");
const crypto = require("crypto");

const INDEX = process.env.SHIFTY_CF_INDEX || undefined;
const T = "A".repeat(24), TK = "K".repeat(24), TP = "P".repeat(24), TR = "R".repeat(24), TG = "G".repeat(24), TD = "D".repeat(24), TS = "S".repeat(24), TL = "L".repeat(24);
const mail = (uid, email = uid + "@ex.com") => ({ auth: { uid, token: { email, firebase: { sign_in_provider: "password" } } } });
const anon = uid => ({ auth: { uid, token: { firebase: { sign_in_provider: "anonymous" } } } });
const salt = "0123456789abcdef0123456789abcdef";
const pinHash = p => crypto.createHash("sha256").update(salt + p).digest("hex");
const PAY = { payType: "hourly", base: 1300, effectiveFrom: "2026-04-01", commute: { amount: 3000, per: "month" }, updatedAt: "x" };
const ap = n => ({ status: "approved", name: n, displayName: n, requestedAt: "a", approvedAt: "a" });
const base = () => ({
  global: { shops: { S1: { id: "S1", name: "B店" }, "demo-toriMatsu-v1": { id: "demo-toriMatsu-v1", name: "デモ" } } },
  shops: {
    S1: { owners: { OWN: "K" }, staff: ["田中", "佐藤", "鈴木", "高橋"],
      staffPages: { [T]: ap("田中"), [TK]: ap("佐藤"), [TP]: { status: "pending", displayName: "鈴木", requestedAt: "a" },
        [TR]: { ...ap("鈴木"), status: "revoked" }, [TG]: ap("退職者"), [TS]: ap("高橋"), [TL]: ap("鈴木") },
      staffLinks: { U9: { name: "高橋", method: "name", at: "a" } },
      linkRequests: { U1: { displayName: "田中", at: "a" } },
      private: { pay: { "田中": PAY } } },
    "demo-toriMatsu-v1": { owners: {}, staff: ["田中"], staffPages: { [TD]: ap("田中") } },
  },
  users: { U9: { links: { S1: { name: "高橋", at: "a" } } } },
  staffPageTokens: { [T]: { shopId: "S1", at: "a" }, [TK]: { shopId: "S1", at: "a" }, [TP]: { shopId: "S1", at: "a" }, [TR]: { shopId: "S1", at: "a" },
    [TG]: { shopId: "S1", at: "a" }, [TD]: { shopId: "demo-toriMatsu-v1", at: "a" }, [TS]: { shopId: "S1", at: "a" }, [TL]: { shopId: "S1", at: "a" } },
  staffPagePins: { [TK]: { hash: pinHash("4321"), salt, setAt: "b", fails: 0, lockedUntil: 0 }, [TL]: { hash: pinHash("5555"), salt, setAt: "b", fails: 0, lockedUntil: 0 } },
});
const check = makeChecker();

(async () => {
  const h = loadFunctions({ indexPath: INDEX, data: base() });
  const f = h.fns.linkStaffPage;
  check("linkStaffPage が export されている", typeof f !== "undefined");
  const call = (data, ctx) => callFn(f, data, ctx);
  const before = JSON.stringify(h.db.get(""));
  let r = await call({ token: T }, {});
  check("拒否: 未認証", !r.ok && r.code === "unauthenticated", r);
  r = await call({ token: T }, anon("A1"));
  check("拒否: 匿名（メールのある認証だけ）", !r.ok && r.code === "failed-precondition", r);
  r = await call({ token: "bad/" }, mail("U1"));
  check("拒否: URL の形", !r.ok && r.code === "invalid-argument", r);
  r = await call({ token: "Q".repeat(24) }, mail("U1"));
  check("拒否: 見つからない URL", !r.ok && r.code === "not-found", r);
  r = await call({ token: TP }, mail("U1"));
  check("拒否: 承認待ち", !r.ok && r.code === "permission-denied", r);
  r = await call({ token: TR }, mail("U1"));
  check("拒否: 取り消された URL", !r.ok && r.code === "permission-denied", r);
  r = await call({ token: TG }, mail("U1"));
  check("拒否: 名前がスタッフ一覧に無い", !r.ok && r.code === "failed-precondition", r);
  r = await call({ token: TD }, mail("U1"));
  check("拒否: デモ店舗", !r.ok && r.code === "permission-denied", r);
  r = await call({ token: T }, mail("OWN"));
  check("拒否: 店舗の管理者の uid", !r.ok && r.code === "failed-precondition", r);
  r = await call({ token: T }, mail("company_C1"));
  check("拒否: 企業ログインの uid", !r.ok && r.code === "failed-precondition", r);
  r = await call({ token: TS }, mail("U1"));
  check("拒否: その名前は別のアカウントとリンク済み", !r.ok && r.code === "failed-precondition" && /別のアカウント/.test(r.msg), r);
  r = await call({ token: TK }, mail("U2"));
  check("拒否: 暗証番号を決めている URL に番号なし（試行回数は減らない）", !r.ok && r.code === "failed-precondition" && h.db.get(`staffPagePins/${TK}/fails`) === 0, r);
  check("拒否では何も書かない", JSON.stringify(h.db.get("")) === before);

  r = await call({ token: T, name: "佐藤" }, mail("U1"));
  check("暗証番号の無い URL は即時にリンク（名前は URL の承認済みの名前・渡した名前は無視）", r.ok && r.res.ok && r.res.name === "田中", r);
  const sl = h.db.get("shops/S1/staffLinks/U1"), ul = h.db.get("users/U1/links/S1");
  check("staffLinks と users/links を method page で書く", sl && sl.name === "田中" && sl.method === "page" && ul && ul.name === "田中", [sl, ul]);
  check("保留中の申請を消す", h.db.get("shops/S1/linkRequests/U1") == null);
  r = await call({ token: T }, mail("U1"));
  check("二度目は already（書き直さない）", r.ok && r.res.already === true && h.db.get("shops/S1/staffLinks/U1/at") === sl.at, r);
  r = await call({ token: TK }, mail("U1"));
  check("拒否: このお店には別の名前でリンク済み", !r.ok && r.code === "failed-precondition" && /田中/.test(r.msg), r);
  r = await callFn(h.fns.getMyPay, { shopId: "S1" }, mail("U1"));
  check("追加後は getMyPay で本人（田中）の賃金が取れる", r.ok && r.res.pay && r.res.pay.base === 1300, r);

  r = await call({ token: TK, pin: "0000" }, mail("U2"));
  check("拒否: 暗証番号の誤りは数える", !r.ok && r.code === "permission-denied" && h.db.get(`staffPagePins/${TK}/fails`) === 1 && h.db.get("shops/S1/staffLinks/U2") == null, r);
  r = await call({ token: TK, pin: "4321" }, mail("U2"));
  check("正しい暗証番号ならリンク（試行回数を戻す）", r.ok && r.res.name === "佐藤" && h.db.get("shops/S1/staffLinks/U2/method") === "page" && h.db.get(`staffPagePins/${TK}/fails`) === 0, r);
  for (let i = 0; i < 5; i++) await call({ token: TL, pin: "0000" }, mail("U3"));
  r = await call({ token: TL, pin: "5555" }, mail("U3"));
  check("5回の誤りの後は正しい番号でも止まる（リンクしない）", !r.ok && r.code === "resource-exhausted" && h.db.get("shops/S1/staffLinks/U3") == null && h.db.get(`staffPagePins/${TL}/lockedUntil`) > Date.now(), r);
  check.done();
})().catch(e => { console.error(e); process.exit(1); });
