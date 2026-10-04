// 実例: スタッフ個別URLの「URLをなくしたとき用のメールアドレス」（2026-10-04）の Cloud Functions setPageEmail・recoverPageUrl を本物のまま実行する。
// nodemailer はハーネスのモック（送ろうとしたメールを h.mails に積む）。確かめること:
//  - 登録: 有効な個別URL（承認済み・名前がスタッフ一覧にある）だけ。控えのメールがそのアドレスに1通・本文に本番ドメインの個別URLと店舗名
//  - クライアントへ返すのは「登録済みか」と伏せたアドレスだけ（生のアドレス・逆引きのキーを返さない）
//  - 送り直し: 登録済みのアドレスにだけ届く・結果の文言は登録の有無に関係なく同じ・画面（戻り値）に URL を出さない・他人のアドレスには送らない
//  - 回数の制限（同じ URL の登録・同じアドレスの送り直し・同じ呼び出し元）・トランザクションで数える
//  - 管理者が発行し直したら、登録済みのアドレスは新しい URL に引き継ぐ（送り直しで届くのは新しい URL・古い URL は送らない）
//  - 取り消されて後継の無い URL・名前が消えた URL は送らない／登録できない・デモ店舗・未認証・形の誤りは拒否
//  - 削除で記録と逆引きが消える。purgeInactiveShops が店舗のアーカイブで記録と逆引きを消す
// 反証: SHIFTY_CF_INDEX に 64b6e76 の functions/index.js を渡すと落ちる（関数が無い）。
"use strict";
const { loadFunctions, callFn, callRun, makeChecker } = require("./cf-harness.js");

const INDEX = process.env.SHIFTY_CF_INDEX || undefined;
const T = "A".repeat(24), TP = "P".repeat(24), TR = "R".repeat(24), TG = "G".repeat(24), TD = "D".repeat(24), T9 = "Z".repeat(24), TN = "N".repeat(24), TS = "S".repeat(24);
const anon = uid => ({ auth: { uid, token: { firebase: { sign_in_provider: "anonymous" } } } });
const base = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S9: { id: "S9", name: "古い店" }, "demo-toriMatsu-v1": { id: "demo-toriMatsu-v1", name: "デモ" } } },
  shops: {
    S1: { owners: { OWN: "K" }, staff: ["田中", "佐藤", "鈴木"], lastActivity: new Date().toISOString(),
      staffPages: { [T]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "a", approvedAt: "2026-10-01T00:00:00.000Z" },
        [TS]: { status: "approved", name: "鈴木", displayName: "鈴木", requestedAt: "a", approvedAt: "2026-10-01T00:00:00.000Z" },
        [TP]: { status: "pending", displayName: "佐藤", requestedAt: "a" }, [TR]: { status: "revoked", name: "佐藤", displayName: "佐藤", requestedAt: "a", approvedAt: "a" },
        [TG]: { status: "approved", name: "退職者", displayName: "退職者", requestedAt: "a", approvedAt: "a" } } },
    "demo-toriMatsu-v1": { owners: {}, staff: ["田中"], staffPages: { [TD]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "a", approvedAt: "a" } } },
    S9: { owners: { OWN: "K" }, staff: ["鈴木"], lastActivity: "2024-01-01T00:00:00.000Z",
      staffPages: { [T9]: { status: "approved", name: "鈴木", displayName: "鈴木", requestedAt: "a", approvedAt: "a" } } },
  },
  staffPageTokens: { [T]: { shopId: "S1", at: "a" }, [TS]: { shopId: "S1", at: "a" }, [TP]: { shopId: "S1", at: "a" }, [TR]: { shopId: "S1", at: "a" }, [TG]: { shopId: "S1", at: "a" },
    [TD]: { shopId: "demo-toriMatsu-v1", at: "a" }, [T9]: { shopId: "S9", at: "a" } },
});
const check = makeChecker();
const allText = h => JSON.stringify(h.db.get(""));

(async () => {
  const h = loadFunctions({ indexPath: INDEX, data: base() });
  const setF = (data, ctx = anon("dev1")) => callFn(h.fns.setPageEmail, data, ctx);
  const recF = (data, ctx = anon("dev9")) => callFn(h.fns.recoverPageUrl, data, ctx);
  let r = await setF({ token: T, action: "status" });
  check("状態: まだ登録なし", r.ok && r.res.registered === false && r.res.masked === "", r);
  r = await setF({ token: T, action: "set", email: "  Tanaka@Example.com " });
  check("登録: 伏せたアドレスだけを返す（生のアドレスを返さない）", r.ok && r.res.registered === true && r.res.masked === "t***@example.com" && !JSON.stringify(r.res).includes("tanaka@"), r);
  const rec = h.db.get(`staffPageEmails/${T}`);
  check("登録: 正規化したアドレスと逆引きを CF 専用の場所に置く", rec && rec.email === "tanaka@example.com" && /^[0-9a-f]{64}$/.test(rec.key) && h.db.get(`staffPageEmailIndex/${rec.key}/${T}`) === true, rec);
  check("登録: 控えを1通・そのアドレスへ・本番ドメインの個別URLと店舗名", h.mails.length === 1 && h.mails[0].to === "tanaka@example.com"
    && h.mails[0].text.includes(`https://shiftyshifty.app/?openExternalBrowser=1#/m/${T}`) && h.mails[0].text.includes("A店") && /心当たりが無い/.test(h.mails[0].text), h.mails);
  r = await setF({ token: T, action: "status" }, anon("other-device"));
  check("状態: 別の端末からも登録済み（伏せたアドレス）", r.ok && r.res.registered && r.res.masked === "t***@example.com", r);

  // 送り直し
  const nMail = h.mails.length;
  r = await recF({ email: "TANAKA@example.com" });
  check("送り直し: 結果は決まった文言・URL を返さない", r.ok && r.res.ok === true && /登録されているアドレスであれば/.test(r.res.message) && !JSON.stringify(r.res).includes("#/m/"), r);
  check("送り直し: 登録したアドレスにだけ1通・いまの URL", h.mails.length === nMail + 1 && h.mails[nMail].to === "tanaka@example.com" && h.mails[nMail].text.includes(`#/m/${T}`), h.mails.slice(nMail));
  const r2 = await recF({ email: "nobody@example.com" }, anon("dev8"));
  check("送り直し: 登録の無いアドレスでも結果は同じ・メールは送らない", r2.ok && JSON.stringify(r2.res) === JSON.stringify(r.res) && h.mails.length === nMail + 1, r2);
  // 他人の個別URLは届かない（鈴木に別のアドレス、田中のアドレスで送り直しても鈴木の URL は入らない）
  await setF({ token: TS, action: "set", email: "suzuki@example.com" }, anon("dev2"));
  const nm2 = h.mails.length;
  await recF({ email: "tanaka@example.com" }, anon("dev7"));
  check("送り直し: 他人の URL を混ぜない", h.mails.length === nm2 + 1 && !h.mails[nm2].text.includes(TS) && h.mails[nm2].text.includes(T), h.mails[nm2] && h.mails[nm2].text);

  // 回数の制限
  for (let i = 0; i < 3; i++) await recF({ email: "limit@example.com" }, anon("u" + i));
  r = await recF({ email: "limit@example.com" }, anon("u9"));
  check("制限: 同じアドレスの送り直しは1時間に3回まで（登録の有無に関係なく数える）", !r.ok && r.code === "resource-exhausted", r);
  for (let i = 0; i < 5; i++) await recF({ email: `x${i}@example.com` }, anon("same-caller"));
  r = await recF({ email: "x9@example.com" }, anon("same-caller"));
  check("制限: 同じ呼び出し元の送り直しは1時間に5回まで", !r.ok && r.code === "resource-exhausted", r);
  const h2 = loadFunctions({ indexPath: INDEX, data: base() });
  for (let i = 0; i < 5; i++) await callFn(h2.fns.setPageEmail, { token: T, action: "set", email: `t${i}@example.com` }, anon("c" + i));
  r = await callFn(h2.fns.setPageEmail, { token: T, action: "set", email: "t9@example.com" }, anon("c9"));
  check("制限: 同じ URL の登録（控えの送信）は1時間に5回まで", !r.ok && r.code === "resource-exhausted" && h2.mails.length === 5, [r, h2.mails.length]);
  check("制限: 回数の記録も CF 専用の場所", !!h2.db.get(`staffPageEmailRate/setToken_${T}`));

  // 管理者が発行し直す（田中の T を revoked にして TN を承認済み）→ 登録は TN に引き継ぐ
  h.db.put(`shops/S1/staffPages/${T}/status`, "revoked");
  h.db.put(`shops/S1/staffPages/${TN}`, { status: "approved", name: "田中", displayName: "田中", requestedAt: "b", approvedAt: "2026-10-03T00:00:00.000Z" });
  h.db.put(`staffPageTokens/${TN}`, { shopId: "S1", at: "b" });
  const nm3 = h.mails.length;
  await recF({ email: "tanaka@example.com" }, anon("dev6"));
  check("再発行: 送り直しで届くのは新しい URL（古い URL は送らない）", h.mails.length === nm3 + 1 && h.mails[nm3].text.includes(`#/m/${TN}`) && !h.mails[nm3].text.includes(`#/m/${T}`), h.mails[nm3] && h.mails[nm3].text);
  check("再発行: 記録と逆引きが新しい URL に移る", !h.db.get(`staffPageEmails/${T}`) && h.db.get(`staffPageEmails/${TN}`).email === "tanaka@example.com"
    && h.db.get(`staffPageEmailIndex/${rec.key}/${TN}`) === true && !h.db.get(`staffPageEmailIndex/${rec.key}/${T}`));
  r = await setF({ token: TN, action: "status" });
  check("再発行: 新しい URL の画面で登録済みと出る", r.ok && r.res.registered && r.res.masked === "t***@example.com", r);
  // 状態を見たときにも引き継ぐ（送り直しより先に新しい URL を開いた場合）
  const h3 = loadFunctions({ indexPath: INDEX, data: base() });
  await callFn(h3.fns.setPageEmail, { token: T, action: "set", email: "tanaka@example.com" }, anon("d"));
  h3.db.put(`shops/S1/staffPages/${T}/status`, "revoked");
  h3.db.put(`shops/S1/staffPages/${TN}`, { status: "approved", name: "田中", displayName: "田中", requestedAt: "b", approvedAt: "2026-10-03T00:00:00.000Z" });
  h3.db.put(`staffPageTokens/${TN}`, { shopId: "S1", at: "b" });
  r = await callFn(h3.fns.setPageEmail, { token: TN, action: "status" }, anon("d"));
  check("再発行: 新しい URL の状態を見た時点で引き継ぐ", r.ok && r.res.registered && h3.db.get(`staffPageEmails/${TN}`) && !h3.db.get(`staffPageEmails/${T}`), r);
  // 取り消されて後継の無い URL は送らない（鈴木の TS を取り消す）
  h.db.put(`shops/S1/staffPages/${TS}/status`, "revoked");
  const nm4 = h.mails.length;
  r = await recF({ email: "suzuki@example.com" }, anon("dev5"));
  check("取り消し: 後継の無い URL は送らない（結果の文言は同じ）", r.ok && /登録されているアドレスであれば/.test(r.res.message) && h.mails.length === nm4, r);

  // 削除
  r = await setF({ token: TN, action: "remove" });
  check("削除: 記録と逆引きが消える", r.ok && r.res.registered === false && !h.db.get(`staffPageEmails/${TN}`) && !h.db.get(`staffPageEmailIndex/${rec.key}/${TN}`), r);

  // 拒否側（何も書かない・送らない）
  const before = allText(h), mBefore = h.mails.length;
  r = await callFn(h.fns.setPageEmail, { token: TN, action: "status" }, {});
  check("拒否: 未認証（登録）", !r.ok && r.code === "unauthenticated", r);
  r = await callFn(h.fns.recoverPageUrl, { email: "tanaka@example.com" }, {});
  check("拒否: 未認証（送り直し）", !r.ok && r.code === "unauthenticated", r);
  r = await setF({ token: "bad", action: "status" });
  check("拒否: URL の形", !r.ok && r.code === "invalid-argument", r);
  r = await setF({ token: "Q".repeat(24), action: "status" });
  check("拒否: 見つからない URL", !r.ok && r.code === "not-found", r);
  r = await setF({ token: TP, action: "set", email: "p@example.com" });
  check("拒否: 承認待ちの URL には登録できない", !r.ok && r.code === "permission-denied", r);
  r = await setF({ token: TR, action: "set", email: "p@example.com" });
  check("拒否: 取り消された URL には登録できない", !r.ok && r.code === "permission-denied", r);
  r = await setF({ token: TG, action: "set", email: "p@example.com" });
  check("拒否: 名前がスタッフ一覧に無い URL", !r.ok && r.code === "failed-precondition", r);
  r = await setF({ token: TD, action: "set", email: "p@example.com" });
  check("拒否: デモ店舗", !r.ok && r.code === "permission-denied", r);
  r = await setF({ token: T9, action: "set", email: "a@b.co\nBcc: x@y.z" });
  check("拒否: 改行を含むアドレス（ヘッダの差し込み）", !r.ok && r.code === "invalid-argument", r);
  r = await recF({ email: "not-an-email" });
  check("拒否: 送り直しのアドレスの形", !r.ok && r.code === "invalid-argument", r);
  r = await setF({ token: T9, action: "unknown" });
  check("拒否: 知らない操作", !r.ok && r.code === "invalid-argument", r);
  check("拒否では何も書かない・送らない", allText(h) === before && h.mails.length === mBefore);

  // purgeInactiveShops: 1年未更新の S9 をアーカイブするとき、記録と逆引きを消す。S1 のものは残す
  await setF({ token: T9, action: "set", email: "old@example.com" }, anon("p1"));
  const k9 = h.db.get(`staffPageEmails/${T9}`).key;
  await setF({ token: TN, action: "set", email: "tanaka@example.com" }, anon("p2"));
  r = await callRun(h.fns.purgeInactiveShops);
  check("purge: アーカイブした店舗の記録と逆引きを消す", r.ok && !h.db.get(`staffPageEmails/${T9}`) && !h.db.get(`staffPageEmailIndex/${k9}/${T9}`), r);
  check("purge: 他の店舗の記録は残す", !!h.db.get(`staffPageEmails/${TN}`));
  check.done();
})().catch(e => { console.error(e); process.exit(1); });
