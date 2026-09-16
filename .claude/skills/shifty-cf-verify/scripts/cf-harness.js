// Shifty の Cloud Functions を「本物のまま」Nodeで実行するためのハーネス。
// firebase-functions / firebase-admin / stripe / nodemailer をモックへ差し替えて
// functions/index.js を読み込み、エクスポートされたハンドラを直接呼べるようにする。
//
// 使う側が触るのは loadFunctions / callFn / callHttp / callRun の4つだけ。
// 依存パッケージは無い（node の標準機能のみ）。
"use strict";
const Module = require("module");
const path = require("path");

// 読み込む index.js の既定の場所。**メインのリポジトリを直に指している**ので、
// git worktree で隔離して編集しているときに既定のまま使うと、編集していない方の
// functions/index.js を検証して全項目パスする（自分の変更を一度も実行しない緑）。
// worktree 側を見たいときは loadFunctions({indexPath:"<worktree>/functions/index.js"}) を渡す。
const REPO = "/Users/hiroshi/Documents/Claude Code/シフト作成アプリーshifty";

class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

// ---------------------------------------------------------------------------
// firebase-functions のモック。
// 実際の定義は functions.region(..).runWith(..).https.onCall(fn) のように
// 任意の順で連結するので、「何を呼んでもチェーンが続き、onCall/onRequest/onRun
// だけは受け取った関数をそのまま返す」Proxy にする（新しい書き方が増えても壊れない）。
// ---------------------------------------------------------------------------
function makeFunctionsMock() {
  const chain = () => new Proxy(function () {}, {
    get(_t, p) {
      if (p === "HttpsError") return HttpsError;
      if (p === "onCall" || p === "onRequest" || p === "onRun") return fn => fn;
      return chain();
    },
    apply() { return chain(); },
  });
  return chain();
}

// ---------------------------------------------------------------------------
// Realtime Database のモック（メモリ上のプレーンオブジェクト）。
// functions/index.js が実際に使っている API だけを実装する:
//   ref(path) → once("value") / set / update / remove / push / orderByChild().equalTo()
//   snapshot  → val / exists / numChildren / forEach / child / key
// ---------------------------------------------------------------------------
function makeDb(initial) {
  let store = clone(initial || {});
  const seg = p => String(p).split("/").filter(s => s !== "");
  const getAt = p => seg(p).reduce((o, k) => (o == null || typeof o !== "object" ? undefined : o[k]), store);
  const setAt = (p, v) => {
    const s = seg(p);
    if (s.length === 0) { store = v == null ? {} : clone(v); return; }
    let o = store;
    for (const k of s.slice(0, -1)) {
      if (typeof o[k] !== "object" || o[k] === null) o[k] = {};
      o = o[k];
    }
    const last = s[s.length - 1];
    if (v === null || v === undefined) delete o[last]; else o[last] = clone(v);
  };

  let pushSeq = 0;
  const snapshot = (p, value) => {
    const v = value === undefined ? getAt(p) : value;
    const norm = v === undefined ? null : v;
    return {
      key: seg(p).slice(-1)[0] || null,
      val: () => clone(norm),
      exists: () => norm !== null,
      numChildren: () => (norm && typeof norm === "object" ? Object.keys(norm).length : 0),
      child: k => snapshot(`${p}/${k}`),
      hasChild: k => getAt(`${p}/${k}`) !== undefined,
      forEach: cb => {
        if (!norm || typeof norm !== "object") return false;
        for (const [k, cv] of Object.entries(norm)) {
          if (cb(snapshot(`${p}/${k}`, cv)) === true) return true;
        }
        return false;
      },
    };
  };

  const makeRef = (p, filter) => ({
    key: seg(p).slice(-1)[0] || null,
    once: async () => {
      if (!filter) return snapshot(p);
      const all = getAt(p);
      const out = {};
      if (all && typeof all === "object") {
        for (const [k, v] of Object.entries(all)) {
          if (v && typeof v === "object" && v[filter.field] === filter.value) out[k] = v;
        }
      }
      return snapshot(p, out);
    },
    set: async v => { setAt(p, v); },
    remove: async () => { setAt(p, null); },
    // update は「キーに / を含められる」「値が null なら削除」の2点が set と違う
    update: async obj => {
      for (const [k, v] of Object.entries(obj || {})) setAt(`${p}/${k}`, v);
    },
    push: v => {
      const key = `-Nsim${String(++pushSeq).padStart(4, "0")}`;
      if (v !== undefined) setAt(`${p}/${key}`, v);
      return { key, ...makeRef(`${p}/${key}`) };
    },
    orderByChild: field => ({
      equalTo: value => makeRef(p, { field, value }),
    }),
  });

  return {
    ref: p => makeRef(p),
    // テスト側から中身を読み書きするためのヘルパー（本物のAPIには無い）
    get: p => clone(getAt(p)),
    put: (p, v) => setAt(p, v),
    dump: () => clone(store),
    reset: next => { store = clone(next || {}); },
  };
}

function clone(v) {
  if (v === null || typeof v !== "object") return v;
  return JSON.parse(JSON.stringify(v));
}

// ---------------------------------------------------------------------------
// functions/index.js を読み込む。
// data: 初期のDB内容（プレーンオブジェクト）
// stripe / mail / verifyIdToken: 必要な検証だけ差し替える
// env: functions/index.js がモジュール読み込み時に読む **環境変数**（process.env 経由のものだけ）。
//      ソース直書きの const（PURGE_OLD_PERIODS_DRY_RUN など）はここでは変えられない。
//      その挙動を試すには indexPath に書き換えた写しを渡す。
// ---------------------------------------------------------------------------
function loadFunctions(opts = {}) {
  const indexPath = opts.indexPath || path.join(REPO, "functions", "index.js");
  const db = makeDb(opts.data);
  const mails = [];
  const customTokens = [];
  const stripeStub = opts.stripe || new Proxy({}, {
    get() { throw new Error("stripe を使う関数を呼ぶなら loadFunctions({stripe:...}) でスタブを渡す"); },
  });
  const auth = {
    createCustomToken: async (uid, claims) => { customTokens.push({ uid, claims }); return `tok_${uid}`; },
    verifyIdToken: opts.verifyIdToken || (async () => { throw new Error("verifyIdToken を使うなら loadFunctions({verifyIdToken:...}) を渡す"); }),
  };
  const adminMock = {
    apps: [], initializeApp() {}, database: () => db,
    auth: () => auth,
    credential: { applicationDefault: () => ({}) },
  };
  const nodemailerMock = {
    createTransport: () => ({ sendMail: async m => { mails.push(m); return { messageId: `sim-${mails.length}` }; } }),
  };

  const savedEnv = {};
  for (const [k, v] of Object.entries(opts.env || {})) { savedEnv[k] = process.env[k]; process.env[k] = v; }

  const origLoad = Module._load;
  Module._load = function (req, parent, isMain) {
    if (req === "firebase-functions") return makeFunctionsMock();
    if (req === "firebase-admin") return adminMock;
    if (req === "stripe") return () => stripeStub;
    if (req === "nodemailer") return nodemailerMock;
    return origLoad(req, parent, isMain);
  };
  let fns;
  try {
    delete require.cache[require.resolve(indexPath)]; // 毎回まっさらに読み直す（DBの束縛も作り直す）
    fns = require(indexPath);
  } finally {
    Module._load = origLoad;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
  return { fns, db, mails, customTokens, HttpsError };
}

// ---------------------------------------------------------------------------
// 呼び出しヘルパー。例外は投げずに結果オブジェクトで返す（判定を1行で書けるように）
// ---------------------------------------------------------------------------
async function callFn(handler, data, { uid, provider = "google.com", auth } = {}) {
  const context = auth !== undefined
    ? { auth }
    : (uid ? { auth: { uid, token: { firebase: { sign_in_provider: provider } } } } : {});
  try { return { ok: true, res: await handler(data, context) }; }
  catch (e) { return { ok: false, code: e && e.code, msg: e && e.message }; }
}

async function callHttp(handler, { method = "POST", body = {}, headers = {}, rawBody, query = {} } = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const out = { status: null, body: null, headers: {} };
  let done;
  const finished = new Promise(r => { done = r; });
  const res = {
    set: (k, v) => { out.headers[k] = v; return res; },
    status: c => { out.status = c; return res; },
    json: v => { out.body = v; done(); return res; },
    send: v => { out.body = v; done(); return res; },
    end: () => { done(); return res; },
  };
  const req = { method, body, rawBody: rawBody || Buffer.from(JSON.stringify(body)), headers: lower, query };
  try {
    await Promise.race([Promise.resolve(handler(req, res)).then(() => finished), finished]);
    return out;
  } catch (e) { return { ...out, thrown: (e && e.message) || String(e) }; }
}

async function callRun(handler, context = {}) {
  try { return { ok: true, res: await handler(context) }; }
  catch (e) { return { ok: false, msg: (e && e.message) || String(e) }; }
}

// 小さな assert（結果を集計して最後に pass/fail を出す）
function makeChecker() {
  const state = { pass: 0, fail: 0 };
  const check = (name, cond, extra = "") => {
    if (cond) { state.pass++; console.log(`  ok  ${name}`); }
    else { state.fail++; console.log(`  NG  ${name} ${typeof extra === "string" ? extra : JSON.stringify(extra)}`); }
  };
  check.done = () => {
    console.log(`\npass ${state.pass} / fail ${state.fail}`);
    process.exit(state.fail ? 1 : 0);
  };
  return check;
}

module.exports = { loadFunctions, callFn, callHttp, callRun, makeChecker, HttpsError, REPO };
