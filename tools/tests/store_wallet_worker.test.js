// اختبارات السيرفر: محفظة المتجر (6أ): رصيد دولار، إعدادات الأدمن، تعديل الرصيد، السجل
// التشغيل: node tools/tests/store_wallet_worker.test.js
const vm = require("vm"), fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
function load(extra) {
  const src = fs.readFileSync(path.join(__dirname, "../../worker/worker.js"), "utf8").replace("export default {", "const __worker = {");
  const ctx = vm.createContext({ console, Request, Response, Headers, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout, Math, Date, JSON, Object, Array, Number, String, Promise, Error, Map, Set, Uint8Array, atob, btoa, fetch: () => { throw new Error("no net"); }, ...extra });
  vm.runInContext(src, ctx); return ctx;
}
const env = { FIREBASE_SA: JSON.stringify({ project_id: "proj" }), PENDING_CREDITS: { get: async () => null, put: async () => {} } };
(async () => {
  const c = load(); const store = new Map(); let tick = 1; const fetchCalls = []; let authOk = true;
  const nameToPath = n => n.split("/documents/")[1];
  c.getGoogleAccessToken = async (e, scope) => "tok:" + (scope ? "auth" : "default");
  c.fsGetDoc = async (e, p) => { const d = store.get(p); return d ? { exists: true, data: c.fieldsToObj(d.fields), updateTime: d.t } : { exists: false, data: null, updateTime: null }; };
  c.fsCommit = async (e, ws) => { for (const w of ws) {
    if (w.delete) { store.delete(nameToPath(w.delete)); continue; }
    const path = nameToPath(w.update.name), cur = store.get(path);
    const fields = w.updateMask ? { ...(cur ? cur.fields : {}), ...w.update.fields } : w.update.fields;
    store.set(path, { fields, t: String(++tick) });
  } return {}; };
  c.fsRunQuery = async (e, coll, field, limit, offset, filter) => {
    let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) }));
    if (filter) rows = rows.filter(r => r.data[filter.field] === filter.value);
    return rows.slice(0, limit);
  };
  c.fetch = async (url, o) => { fetchCalls.push({ url: String(url), auth: o.headers.Authorization, body: JSON.parse(o.body) }); return { ok: authOk, status: authOk ? 200 : 403, text: async () => "denied", json: async () => ({}) }; };
  c.verifyFirebaseToken = async (t) => ({ u1: { sub: "u1", email: "a@x.com" }, u2: { sub: "u2", email: "b@x.com" } }[t] || null);
  const W = vm.runInContext("__worker", c);
  const call = async (token, body) => { const r = await W.fetch(new Request("https://x/game/deleteAccount", { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json() }; };
  const put = (p, o) => store.set(p, { fields: c.objToFields(o), t: String(++tick) });
  const get = (p) => { const d = store.get(p); return d ? c.fieldsToObj(d.fields) : null; };
  let injectConflictOn = null;
  c.fsCommit = async (e, ws) => {
    if (injectConflictOn && ws.some(w => w.update && w.update.name.endsWith(injectConflictOn))) { const mark = injectConflictOn; injectConflictOn = null; const key = mark; const cur = store.get(key); if (cur) store.set(key, { ...cur, t: String(++tick) }); throw Object.assign(new Error("ABORTED"), { conflict: true }); }
    for (const w of ws) { if (w.delete) continue; const cur = store.get(nameToPath(w.update.name)), pre = w.currentDocument;
      if (pre && pre.exists === false && cur) throw Object.assign(new Error("ALREADY_EXISTS"), { conflict: true });
      if (pre && pre.exists === true && !cur) throw new Error("NOT_FOUND");
      if (pre && pre.updateTime && (!cur || cur.t !== pre.updateTime)) throw Object.assign(new Error("FAILED_PRECONDITION"), { conflict: true }); }
    for (const w of ws) { if (w.delete) { store.delete(nameToPath(w.delete)); continue; }
      const path = nameToPath(w.update.name), cur = store.get(path);
      store.set(path, { fields: w.updateMask ? { ...(cur ? cur.fields : {}), ...w.update.fields } : w.update.fields, t: String(++tick) }); }
    return {};
  };
  c.fsRunQuery = async (e, coll, field, limit, offset, filter) => { let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) })); if (filter) rows = rows.filter(r => r.data[filter.field] === filter.value); return rows.slice(0, limit); };
  const ADMIN = vm.runInContext("ADMIN_UID", c);
  const TOKS = { admin: { sub: ADMIN }, u1: { sub: "u1", name: "Ali", email: "ali@x.com" }, u2: { sub: "u2", name: "Omar", email: "omar@x.com" }, u3: { sub: "u3", name: "NoGame", email: "ng@x.com" }, u4: { sub: "u4", name: "NoAcct", email: "na@x.com" }, u5: { sub: "u5", name: "Susp", email: "s@x.com" } };
  c.verifyFirebaseToken = async (t) => TOKS[t] || null;
  const callApi = async (path, body, token) => { const r = await W.fetch(new Request("https://x" + path, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const adm = (body, token = "admin") => callApi("/admin/store", body, token);
  const mkC = (uid, o) => put("storeCustomers/" + uid, { name: uid, email: uid + "@x.com", spentUsd: 0, balanceUsd: 0, createdAt: 1, lastSeenAt: 1, ...o });
  const mkP = (uid, o) => put("players/" + uid, { points: 0, activeDays: 10, firstSeenDate: "2026-01-01", shelves: Array.from({ length: 6 }, (_, i) => ({ id: i, unlocked: i < 2, worker: null })), ...o });      // مثل لاعب موجود فعلاً (بدون هيك اللعبة بتعتبره جديد وبتعطيه نقاط البداية)
  let seq = 0; const rid = () => "req-" + String(++seq).padStart(8, "0");
  const conv = (direction, amountUsd, token = "u1", reqId) => callApi("/store/convert", { direction, amountUsd, reqId: reqId || rid() }, token);
  const bal = (uid) => get("storeCustomers/" + uid).balanceUsd, pts = (uid) => get("players/" + uid).points;
  const ledger = (uid) => [...store.keys()].filter(k => k.startsWith("storeLedger/")).map(k => get(k)).filter(x => x.uid === uid);
  const DAY = 86400000;
  let r;

  /* ---- A) the settings ---- */
  ok((await adm({ action: "wallet_get" }, "u1")).status === 401 && (await adm({ action: "wallet_save", cfg: {} }, null)).status === 401, "wallet settings are admin-only");
  r = await adm({ action: "wallet_get" }); ok(r.json.configured === false && r.json.cfg.pointsPerUsdSell === 925 && r.json.cfg.pointsPerUsdBuy === 700 && r.json.cfg.minConvertUsd === 1 && r.json.cfg.weeklyCapUsd === 5 && r.json.cfg.minActiveDays === 3 && r.json.cfg.minTopupUsd === 5 && r.json.cfg.maxTopupUsd === 1000 && r.json.cfg.maxProcessing === 10, "before you set them: safe example values (700 buy, 925 sell, $1 minimum, $5 a week, 3 active days...)");
  const good = { pointsPerUsdSell: 900, pointsPerUsdBuy: 700, minConvertUsd: 1, weeklyCapUsd: 10, minActiveDays: 3, minTopupUsd: 5, maxTopupUsd: 500, maxProcessing: 10 };
  for (const [patch, label] of [[{ pointsPerUsdSell: 0 }, "sell rate 0"], [{ pointsPerUsdBuy: "x" }, "buy rate text"], [{ pointsPerUsdBuy: 950, pointsPerUsdSell: 900 }, "BUY RATE ABOVE SELL RATE (a guaranteed profit loop)"], [{ minConvertUsd: 0 }, "min convert 0"], [{ minConvertUsd: 5000 }, "min convert huge"], [{ weeklyCapUsd: -1 }, "negative cap"], [{ minActiveDays: 1.5 }, "fractional days"], [{ minActiveDays: 400 }, "400 days"], [{ minTopupUsd: 0 }, "min top-up 0"], [{ maxTopupUsd: 2 }, "max below min"], [{ maxProcessing: 0 }, "0 open orders"], [{ maxProcessing: 500 }, "500 open orders"]]) {
    r = await adm({ action: "wallet_save", cfg: { ...good, ...patch } }); ok(r.status === 400 && r.json.error === "bad_wallet", "refused: " + label);
  }
  r = await adm({ action: "wallet_save", cfg: { ...good, pointsPerUsdBuy: 900 } }); ok(r.status === 200, "buy rate equal to the sell rate is allowed (a pure swap, no profit)");
  r = await adm({ action: "wallet_save", cfg: { ...good, minConvertUsd: 0.015, weeklyCapUsd: 0 } }); ok(r.status === 200 && r.json.cfg.minConvertUsd === 0.02 && r.json.cfg.weeklyCapUsd === 0 && r.json.configured === true && r.json.updatedAt > 0, "saved (rounded to cents; weekly cap 0 means no cap)");
  r = await adm({ action: "wallet_save", cfg: good }); ok((await adm({ action: "wallet_get" })).json.cfg.pointsPerUsdSell === 900, "saved and read back");

  /* ---- B) what the page learns about his wallet ---- */
  const me = async (t) => (await callApi("/store/me", {}, t)).json;
  mkC("u1", {}); let m = await me("u1");
  ok(m.customer.balanceUsd === 0 && m.wallet.pointsPerUsdSell === 900 && m.wallet.pointsPerUsdBuy === 700 && m.wallet.weeklyCapUsd === 10 && m.wallet.weeklyLeftUsd === 10 && m.wallet.weeklyUsedUsd === 0 && m.wallet.game.has === false && m.wallet.game.points === 0, "/store/me carries the balance, the current rates and limits, and says he has no game account yet");
  mkP("u1", { points: 5000.9, activeDays: 10 }); m = await me("u1"); ok(m.wallet.game.has === true && m.wallet.game.points === 5000 && m.wallet.game.activeDays === 10, "with a game account it shows his points (whole numbers) and active days");

  /* ---- H) the admin changes a balance ---- */
  mkC("c1", {}); const adj = (uid, d, note, tk = "admin") => adm({ action: "customer_balance", uid, deltaUsd: d, note }, tk);
  r = await adj("c1", 50, "deposit by Sham Cash"); ok(r.status === 200 && r.json.customer.balanceUsd === 50 && bal("c1") === 50, "adding balance by hand (a deposit that happened outside the site)");
  r = await adj("c1", -20.505, "correction"); ok(r.json.customer.balanceUsd === 29.5 || r.json.customer.balanceUsd === 29.49, "a negative amount takes it off (rounded to cents)"); mkC("c1", { balanceUsd: 30 });
  r = await adj("c1", -100, "too much"); ok(r.status === 400 && r.json.error === "insufficient_balance" && bal("c1") === 30, "the balance can never go below zero");
  for (const [d, label] of [[0, "zero"], ["abc", "text"], [null, "empty"], [200000, "huge"], [-200000, "huge negative"]]) { r = await adj("c1", d); ok(r.status === 400 && r.json.error === "bad_delta", "refused amount: " + label); }
  ok((await adj("ghost", 5)).status === 404 && (await adj("a/b", 5)).status === 400 && (await adj("c1", 5, "", "u1")).status === 401, "unknown customer, bad id, and non-admins are refused");
  r = await adm({ action: "customer_ledger", uid: "c1" }); ok(r.json.ledger.length === 2 && r.json.ledger[0].type === "adjust" && r.json.ledger[0].by === "admin" && r.json.ledger.map(x => x.note).sort().join("|") === "correction|deposit by Sham Cash", "every change is in the customer's ledger (type, amount, note, who)");
    r = await adm({ action: "customers_list", q: "c1" }); ok(r.json.customers[0].balanceUsd === 30, "the customers list shows each balance");

  ok((await callApi("/store/convert", { direction: "usd_to_points", amountUsd: 1, reqId: "req-00000001" }, "u1")).status !== 200, "there is no conversion with the game's points any more (that endpoint was removed)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
