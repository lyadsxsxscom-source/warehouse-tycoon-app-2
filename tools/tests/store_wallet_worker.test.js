// اختبارات السيرفر: محفظة المتجر (6): الإعدادات (النقاط وحدة عرض)، الرصيد، تعديل الرصيد، السجل
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
    if (injectConflictOn && ws.some(w => w.update && w.update.name.endsWith(injectConflictOn))) { const mark = injectConflictOn; injectConflictOn = null; if (mark.endsWith("counters/store") || mark.endsWith("counters/deposit")) { const key = mark.replace(/^.*\//, "counters/"); const cur = store.get(key); const n = cur ? Number(c.fieldsToObj(cur.fields).n) + 1 : 1001; store.set(key, { fields: c.objToFields({ n }), t: String(++tick) }); } else { const key = mark; const cur = store.get(key); if (cur) store.set(key, { ...cur, t: String(++tick) }); } throw Object.assign(new Error("ABORTED"), { conflict: true }); }
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
  const TOKS = { admin: { sub: ADMIN }, u1: { sub: "u1", name: "Ali", email: "ali@x.com" }, u2: { sub: "u2", name: "Omar", email: "omar@x.com" }, u3: { sub: "u3", email: "noacct@x.com" } };
  c.verifyFirebaseToken = async (t) => TOKS[t] || null;
  const callApi = async (path, body, token) => { const r = await W.fetch(new Request("https://x" + path, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const adm = (body, token = "admin") => callApi("/admin/store", body, token);
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const NOW = Date.now(), DAY = 86400000;
  const mkC = (uid, o) => put("storeCustomers/" + uid, { name: uid, email: uid + "@x.com", spentUsd: 0, balanceUsd: 0, createdAt: 1, lastSeenAt: 1, ...o });
  const bal = (uid) => get("storeCustomers/" + uid).balanceUsd, spent = (uid) => get("storeCustomers/" + uid).spentUsd;
  const ledger = (uid) => [...store.keys()].filter(k => k.startsWith("storeLedger/")).map(k => get(k)).filter(x => x.uid === uid).sort((a, b) => a.at - b.at);
  const pushes = []; let pushFails = false; c.sendPush = async (e, uid, type, params) => { if (pushFails) throw new Error("fcm down"); pushes.push({ uid, type, params }); };
  const PUSH_TEXT = vm.runInContext("PUSH_TEXT", c);
  let seqRid = 0; const rid = () => "req-" + String(++seqRid).padStart(8, "0");
  const P10 = (a) => Array.from({ length: 10 }, (_, i) => a[Math.min(i, a.length - 1)]);
  let r;
  /* ---- A) the settings ---- */
  ok((await adm({ action: "wallet_get" }, "u1")).status === 401 && (await adm({ action: "wallet_save", cfg: {} }, null)).status === 401, "wallet settings are admin-only");
  r = await adm({ action: "wallet_get" }); ok(r.json.configured === false && r.json.cfg.pointsPerUsd === 1000 && r.json.cfg.minTopupUsd === 5 && r.json.cfg.maxTopupUsd === 1000 && r.json.cfg.maxProcessing === 10 && r.json.updatedAt === 0, "before you set them: 1000 points = $1, deposits from $5 to $1000, 10 open orders");
  const good = { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 500, maxProcessing: 10 };
  for (const [patch, label] of [[{ pointsPerUsd: 0 }, "0 points per dollar"], [{ pointsPerUsd: 12.5 }, "a fractional rate"], [{ pointsPerUsd: "x" }, "text"], [{ pointsPerUsd: 5e6 }, "a huge rate"], [{ minTopupUsd: 0 }, "min deposit 0"], [{ minTopupUsd: 50000 }, "min deposit huge"], [{ maxTopupUsd: 2 }, "max below min"], [{ maxTopupUsd: 1e6 }, "max huge"], [{ maxProcessing: 0 }, "0 open orders"], [{ maxProcessing: 1.5 }, "fractional open orders"], [{ maxProcessing: 500 }, "500 open orders"]]) {
    r = await adm({ action: "wallet_save", cfg: { ...good, ...patch } }); ok(r.status === 400 && r.json.error === "bad_wallet", "refused: " + label);
  }
  r = await adm({ action: "wallet_save", cfg: { ...good, minTopupUsd: 5.004, pointsPerUsd: 1000 } }); ok(r.status === 200 && r.json.cfg.minTopupUsd === 5 && r.json.configured === true && r.json.updatedAt > 0, "saved (amounts rounded to cents)");
  r = await adm({ action: "wallet_save", cfg: { ...good, pointsPerUsd: 500 } }); ok((await adm({ action: "wallet_get" })).json.cfg.pointsPerUsd === 500, "saved and read back"); await adm({ action: "wallet_save", cfg: good });

  /* ---- B) what the page learns ---- */
  mkC("u1", {}); const me = async (t) => (await callApi("/store/me", {}, t)).json; let m = await me("u1");
  ok(m.customer.balanceUsd === 0 && m.wallet.pointsPerUsd === 1000 && m.wallet.minTopupUsd === 5 && m.wallet.maxTopupUsd === 500 && Object.keys(m.wallet).sort().join() === "maxTopupUsd,minTopupUsd,pointsPerUsd", "/store/me carries the balance and the unit rate and the deposit limits (nothing about the game)");
  mkC("u1", { balanceUsd: 12.3456 }); m = await me("u1"); ok(m.customer.balanceUsd === 12.3456, "the balance keeps 4 decimals (prices like $0.8663 are never rounded away)");
  const b0 = await callApi("/store/me", {}, "u3"); ok(b0.json.customer.balanceUsd === 0, "a brand new customer starts at $0");

  /* ---- C) the admin changes a balance ---- */
  mkC("c1", {}); const adj = (uid, d, note, tk = "admin") => adm({ action: "customer_balance", uid, deltaUsd: d, note }, tk);
  r = await adj("c1", 50, "deposit by Sham Cash"); ok(r.status === 200 && r.json.customer.balanceUsd === 50 && bal("c1") === 50, "adding balance by hand (a deposit that happened outside the site)");
  r = await adj("c1", -20.5, "cash refund to the customer"); ok(r.json.customer.balanceUsd === 29.5 && bal("c1") === 29.5, "a negative amount takes it off (this is how you record a cash refund)");
  r = await adj("c1", 0.12345, "tiny"); ok(r.json.customer.balanceUsd === 29.6235 || r.json.customer.balanceUsd === 29.6234, "amounts keep 4 decimals");
  mkC("c1", { balanceUsd: 30 });
  r = await adj("c1", -100, "too much"); ok(r.status === 400 && r.json.error === "insufficient_balance" && bal("c1") === 30, "the balance can never go below zero");
  for (const [d, label] of [[0, "zero"], ["abc", "text"], [null, "empty"], [200000, "huge"], [-200000, "huge negative"]]) { r = await adj("c1", d); ok(r.status === 400 && r.json.error === "bad_delta", "refused amount: " + label); }
  ok((await adj("ghost", 5)).status === 404 && (await adj("a/b", 5)).status === 400 && (await adj("c1", 5, "", "u1")).status === 401, "unknown customer, bad id, and non-admins are refused");
  r = await adm({ action: "customer_ledger", uid: "c1" }); ok(r.json.ledger.length === 3 && r.json.ledger[0].type === "adjust" && r.json.ledger[0].by === "admin" && r.json.ledger.map(x => x.note).includes("cash refund to the customer") && r.json.ledger.every(x => !("points" in x)), "every change is in the customer's ledger (type, amount, balance after, note, who)");
  r = await adm({ action: "customers_list", q: "c1" }); ok(r.json.customers[0].balanceUsd === 30, "the customers list shows each balance");
  ok((await callApi("/store/convert", { direction: "usd_to_points", amountUsd: 1, reqId: "req-00000001" }, "u1")).status !== 200, "there is no conversion with the game's points (that was removed)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
