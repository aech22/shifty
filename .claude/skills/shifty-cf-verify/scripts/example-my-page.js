// 実例: スタッフ個別URL（2026-10-04）の Cloud Function myPagePin（給料の暗証番号と会社が登録した賃金）を本物のまま実行する。
// 許可側（番号を決める・照合して本人の賃金が返る・変更・管理者のリセット後に決め直す）と拒否側（未認証・形・見つからない・承認待ち・取り消し・
// 名前がスタッフ一覧に無い・デモ店舗・番号の誤り・5回で15分止まる・止まっている間は正しい番号でも開かない）を1項目ずつ通す。
// 他人の賃金は取れない（名前を渡しても無視される）。番号は平文で保存しない。照合が通るまで賃金を返さない。
// あわせて purgeInactiveShops が店舗をアーカイブするときに個別URLの逆引き・本人のデータ・暗証番号を消すことを見る。
// 反証: SHIFTY_CF_INDEX に 73942db の functions/index.js を渡すと落ちる（関数が無い）。
"use strict";
const { loadFunctions, callFn, callRun, makeChecker } = require("./cf-harness.js");

const INDEX = process.env.SHIFTY_CF_INDEX || undefined;
const T = "A".repeat(24), TP = "P".repeat(24), TR = "R".repeat(24), TG = "G".repeat(24), TD = "D".repeat(24), T9 = "Z".repeat(24);
const anon = uid => ({ auth: { uid, token: { firebase: { sign_in_provider: "anonymous" } } } });
const PAY_TANAKA = { payType: "hourly", base: 1300, effectiveFrom: "2026-04-01", commute: { amount: 3000, per: "month" }, updatedAt: "x" };
const base = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S9: { id: "S9", name: "古い店" }, "demo-toriMatsu-v1": { id: "demo-toriMatsu-v1", name: "デモ" } } },
  shops: {
    S1: { owners: { OWN: "K" }, staff: ["田中", "佐藤"], lastActivity: new Date().toISOString(),
      staffPages: { [T]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "a", approvedAt: "2026-10-01T00:00:00.000Z" },
        [TP]: { status: "pending", displayName: "佐藤", requestedAt: "a" }, [TR]: { status: "revoked", name: "佐藤", displayName: "佐藤", requestedAt: "a", approvedAt: "a" },
        [TG]: { status: "approved", name: "退職者", displayName: "退職者", requestedAt: "a", approvedAt: "a" } },
      private: { pay: { "田中": PAY_TANAKA, "佐藤": { payType: "monthly", base: 250000, effectiveFrom: "2026-01-01" } } } },
    "demo-toriMatsu-v1": { owners: {}, staff: ["田中"], staffPages: { [TD]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "a", approvedAt: "a" } } },
    S9: { owners: { OWN: "K" }, staff: ["鈴木"], lastActivity: "2024-01-01T00:00:00.000Z",
      staffPages: { [T9]: { status: "approved", name: "鈴木", displayName: "鈴木", requestedAt: "a", approvedAt: "a" } } },
  },
  staffPageTokens: { [T]: { shopId: "S1", at: "a" }, [TP]: { shopId: "S1", at: "a" }, [TR]: { shopId: "S1", at: "a" }, [TG]: { shopId: "S1", at: "a" },
    [TD]: { shopId: "demo-toriMatsu-v1", at: "a" }, [T9]: { shopId: "S9", at: "a" } },
  staffPageData: { [T9]: { goals: { monthly: 100000 } }, [T]: { goals: { monthly: 50000 } } },
  staffPagePins: { [T9]: { hash: "0".repeat(64), salt: "s", setAt: "a", fails: 0, lockedUntil: 0 } },
  accounts: { S1: { plan: "premium" } },
});
const check = makeChecker();

(async () => {
  const h = loadFunctions({ indexPath: INDEX, data: base() });
  const f = h.fns.myPagePin;
  const call = (data, ctx = anon("dev1")) => callFn(f, data, ctx);
  let r = await call({ token: T, action: "status" });
  check("status: まだ番号が無い", r.ok && r.res.hasPin === false, r);
  r = await call({ token: T, action: "verify", pin: "1234" });
  check("拒否: 番号を決める前の照合", !r.ok && r.code === "failed-precondition", r);
  r = await call({ token: T, action: "set", pin: "12a4" });
  check("拒否: 4桁の数字でない番号", !r.ok && r.code === "invalid-argument", r);
  r = await call({ token: T, action: "set", pin: "1234", name: "佐藤" });
  check("番号を決めると本人（田中）の賃金が返る（名前を渡しても佐藤の分は取れない）", r.ok && r.res.ok && r.res.name === "田中" && r.res.pay.base === 1300 && !JSON.stringify(r.res).includes("250000"), r);
  const rec = h.db.get(`staffPagePins/${T}`);
  check("番号は平文で保存しない（SHA-256 の16進・塩・設定日時）", !!rec && /^[0-9a-f]{64}$/.test(rec.hash) && rec.salt.length >= 16 && !JSON.stringify(rec).includes("1234") && typeof rec.setAt === "string", rec);
  r = await call({ token: T, action: "status" }, anon("dev2"));
  check("status: 別の端末からも番号ありになる", r.ok && r.res.hasPin === true && r.res.waitSec === 0, r);
  r = await call({ token: T, action: "verify", pin: "1234" }, anon("dev2"));
  check("照合: 正しい番号なら賃金が返る", r.ok && r.res.pay && r.res.pay.base === 1300 && r.res.shopId === "S1", r);
  r = await call({ token: T, action: "verify", pin: "0000" });
  check("拒否: 誤った番号は賃金を返さず、残り回数を言う", !r.ok && r.code === "permission-denied" && /残り4回/.test(r.msg) && h.db.get(`staffPagePins/${T}/fails`) === 1, r);
  for (let i = 0; i < 3; i++) await call({ token: T, action: "verify", pin: "0000" });
  r = await call({ token: T, action: "verify", pin: "0000" });
  check("5回の誤りで15分止まる", !r.ok && /15分後/.test(r.msg) && h.db.get(`staffPagePins/${T}/lockedUntil`) > Date.now() + 14 * 60 * 1000, r);
  r = await call({ token: T, action: "verify", pin: "1234" });
  check("止まっている間は正しい番号でも開かない", !r.ok && r.code === "resource-exhausted", r);
  r = await call({ token: T, action: "status" });
  check("status: 待ち時間を返す", r.ok && r.res.waitSec > 800, r);
  h.db.put(`staffPagePins/${T}/lockedUntil`, Date.now() - 1);
  r = await call({ token: T, action: "verify", pin: "1234" });
  check("待ち時間が過ぎれば正しい番号で開く", r.ok && r.res.pay.base === 1300, r);
  r = await call({ token: T, action: "set", pin: "5678" });
  check("拒否: 番号の変更はいまの番号が要る", !r.ok && r.code === "permission-denied", r);
  r = await call({ token: T, action: "set", pin: "5678", currentPin: "1234" });
  check("変更: いまの番号が正しければ新しい番号になる", r.ok && r.res.ok, r);
  r = await call({ token: T, action: "verify", pin: "1234" });
  check("変更の後は前の番号では開かない", !r.ok && r.code === "permission-denied", r);
  h.db.put(`shops/S1/staffPages/${T}/pinResetAt`, new Date(Date.now() + 1000).toISOString());
  r = await call({ token: T, action: "status" });
  check("管理者のリセット（pinResetAt）の後は番号なしになる", r.ok && r.res.hasPin === false, r);
  r = await call({ token: T, action: "set", pin: "4321" });
  check("リセットの後はいまの番号なしで決め直せる", r.ok && r.res.pay.base === 1300, r);

  const before = JSON.stringify(h.db.get(""));
  r = await call({ token: T, action: "status" }, {});
  check("拒否: 未認証", !r.ok && r.code === "unauthenticated", r);
  r = await call({ token: "short", action: "status" });
  check("拒否: URL の形", !r.ok && r.code === "invalid-argument", r);
  r = await call({ token: T + "/", action: "status" });
  check("拒否: URL の形（末尾のスラッシュ）", !r.ok && r.code === "invalid-argument", r);
  r = await call({ token: [T], action: "status" });
  check("拒否: URL が配列", !r.ok && r.code === "invalid-argument", r);
  r = await call({ token: "Q".repeat(24), action: "status" });
  check("拒否: 見つからない URL", !r.ok && r.code === "not-found", r);
  r = await call({ token: TP, action: "set", pin: "1111" });
  check("拒否: 承認待ちの URL", !r.ok && r.code === "permission-denied", r);
  r = await call({ token: TR, action: "set", pin: "1111" });
  check("拒否: 取り消された URL（佐藤の賃金は返らない）", !r.ok && r.code === "permission-denied", r);
  r = await call({ token: TG, action: "set", pin: "1111" });
  check("拒否: 名前がスタッフ一覧に無い（改名・削除の後）", !r.ok && r.code === "failed-precondition", r);
  r = await call({ token: TD, action: "status" });
  check("拒否: デモ店舗", !r.ok && r.code === "permission-denied", r);
  r = await call({ token: T, action: "remove" });
  check("拒否: 知らない操作", !r.ok && r.code === "invalid-argument", r);
  check("拒否では何も書かない", JSON.stringify(h.db.get("")) === before);

  // purgeInactiveShops: 1年未更新の店舗（S9）をアーカイブするとき、店舗の外にある個別URLの記録も消す。S1 のものは残す
  r = await callRun(h.fns.purgeInactiveShops);
  check("purge: アーカイブした店舗の逆引き・本人のデータ・暗証番号を消す", r.ok && h.db.get(`staffPageTokens/${T9}`) == null && h.db.get(`staffPageData/${T9}`) == null && h.db.get(`staffPagePins/${T9}`) == null, [h.db.get(`staffPageTokens/${T9}`), h.db.get(`staffPageData/${T9}`), h.db.get(`staffPagePins/${T9}`)]);
  check("purge: 他の店舗の個別URLは残す", !!h.db.get(`staffPageTokens/${T}`) && !!h.db.get(`staffPageData/${T}`) && !!h.db.get(`staffPagePins/${T}`) && !!h.db.get(`archived/shops/S9`));
  check.done();
})().catch(e => { console.error(e); process.exit(1); });
