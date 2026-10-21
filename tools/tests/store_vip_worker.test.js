// اختبارات السيرفر: مستويات VIP حسب الصرف (4ب-1): الحساب، الضبط من الأدمن، قائمة الزباين، تعديل الصرف اليدوي والسجل
// التشغيل: node tools/tests/store_vip_worker.test.js
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
  c.fsCommit = async (e, ws) => {
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
  const TOKS = { admin: { sub: ADMIN }, other: { sub: "other" }, u1: { sub: "u1", name: "Ali", email: "ali@x.com" } };
  c.verifyFirebaseToken = async (t) => TOKS[t] || null;
  const adm = async (body, token = "admin") => { const r = await W.fetch(new Request("https://x/admin/store", { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json() }; };
  const me = async (t) => { const r = await W.fetch(new Request("https://x/store/me", { method: "POST", headers: { Authorization: "Bearer " + t }, body: "{}" }), env, { waitUntil: p => p }); return (await r.json()).customer; };
  const mkC = (uid, o) => put("storeCustomers/" + uid, { name: uid, email: uid + "@x.com", spentUsd: 0, createdAt: 1, lastSeenAt: 1, ...o });
  const info = (sizes, spent) => c.storeVipInfo(sizes, spent);
  const D = [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000];
  let r;

  /* ---- A) the calculation ---- */
  let x = info(D, 0); ok(x.vip === 1 && x.progressUsd === 0 && x.sizeUsd === 200 && x.remainingUsd === 200 && x.nextVip === 2, "nothing spent: VIP 1, 0 of 200, 200 to go");
  x = info(D, 199.99); ok(x.vip === 1 && x.progressUsd === 199.99 && x.remainingUsd === 0.01, "199.99 spent: still VIP 1");
  x = info(D, 200); ok(x.vip === 2 && x.progressUsd === 0 && x.sizeUsd === 300 && x.nextVip === 3, "exactly 200: VIP 2 starts (progress 0 of 300)");
  x = info(D, 250); ok(x.vip === 2 && x.progressUsd === 50 && x.sizeUsd === 300 && x.remainingUsd === 250, "THE EXAMPLE: VIP 1 = 200, spent 250 -> VIP 2 with progress 50 (of 300, 250 to go)");
  x = info(D, 500); ok(x.vip === 3 && x.progressUsd === 0, "500 = 200 + 300: VIP 3");
  x = info(D, 1499.5); ok(x.vip === 4 && x.progressUsd === 499.5 && x.sizeUsd === 800, "1499.5: VIP 4 with 499.5 progress");
  x = info(D, 21000); ok(x.vip === 10 && x.sizeUsd === null && x.nextVip === null && x.remainingUsd === 0 && x.progressUsd === 0, "21,000 (the total of all nine levels): the top level, nothing left to climb");
  x = info(D, 1e9); ok(x.vip === 10, "never above VIP 10");
  ok(info(D, -5).vip === 1 && info(D, "abc").vip === 1 && info(D, null).spentUsd === 0, "bad spending values count as zero");
  ok(info([100, 100, 100, 100, 100, 100, 100, 100, 100], 0.1 + 0.2 + 99.7).vip === 2, "decimal dust (0.1 + 0.2 + 99.7) does not break the level");

  /* ---- B) the sizes (admin) ---- */
  ok((await adm({ action: "vip_get" }, "other")).status === 401 && (await adm({ action: "customers_list" }, null)).status === 401, "VIP settings and the customers list are admin-only");
  r = await adm({ action: "vip_get" }); ok(r.json.configured === false && r.json.sizes.join() === D.join() && r.json.updatedAt === 0, "before you set them the example numbers are used and the screen is told they are not configured");
  for (const [arr, label] of [[[1, 2, 3], "too few"], [[...D, 1], "too many"], [[200, 0, 1, 1, 1, 1, 1, 1, 1], "a zero"], [[200, -1, 1, 1, 1, 1, 1, 1, 1], "negative"], [[200, "x", 1, 1, 1, 1, 1, 1, 1], "text"], [[1e8, 1, 1, 1, 1, 1, 1, 1, 1], "huge"], ["nope", "not a list"]]) {
    r = await adm({ action: "vip_save", sizes: arr }); ok(r.status === 400 && r.json.error === "bad_vip", "refused level sizes: " + label);
  }
  r = await adm({ action: "vip_save", sizes: [100, 150.456, 200, 300, 400, 500, 600, 700, 800] }); ok(r.status === 200 && r.json.configured && r.json.sizes[1] === 150.46 && r.json.updatedAt > 0, "level sizes are saved (rounded to cents)");
  r = await adm({ action: "vip_get" }); ok(r.json.configured === true && r.json.sizes[0] === 100, "and read back");

  /* ---- C) customers see their level from the current sizes ---- */
  let me1 = await me("u1"); ok(me1.vip === 1 && me1.sizeUsd === 100, "a new customer starts at VIP 1 with the new size (100)");
  mkC("u1", { spentUsd: 250 }); me1 = await me("u1");
  ok(me1.vip === 2 && me1.progressUsd === 150 && me1.sizeUsd === 150.46 && me1.remainingUsd === 0.46, "an existing customer (250 spent) is worked out with the current sizes 100 / 150.46: VIP 2, progress 150 of 150.46 (nothing stored that can go stale)");
  await adm({ action: "vip_save", sizes: D }); me1 = await me("u1"); ok(me1.vip === 2 && me1.progressUsd === 50 && me1.sizeUsd === 300, "back to 200: spent 250 = VIP 2, progress 50 of 300");

  /* ---- D) the customers list ---- */
  for (const k of [...store.keys()]) if (k.startsWith("storeCustomers/")) store.delete(k);
  mkC("c1", { name: "Sara Ahmad", email: "sara@x.com", spentUsd: 0, lastSeenAt: 100 }); mkC("c2", { name: "Omar", email: "omar@trade.com", spentUsd: 250, lastSeenAt: 300 }); mkC("c3", { name: "Lina", email: "lina@x.com", spentUsd: 21000, lastSeenAt: 200 });
  r = await adm({ action: "customers_list" });
  ok(r.status === 200 && r.json.total === 3 && r.json.customers.map(x => x.name).join() === "Omar,Lina,Sara Ahmad", "the list is newest visit first, with the total count");
  const om = r.json.customers[0]; ok(om.vip === 2 && om.progressUsd === 50 && om.sizeUsd === 300 && om.spentUsd === 250 && om.email === "omar@trade.com" && om.lastSeenAt === 300, "each customer shows level, progress and spending");
  ok(r.json.customers[1].vip === 10 && r.json.customers[1].sizeUsd === null, "a customer at the top level has no next target");
  r = await adm({ action: "customers_list", q: "TRADE" }); ok(r.json.customers.length === 1 && r.json.customers[0].name === "Omar" && r.json.total === 3, "search finds by email (not case sensitive)");
  r = await adm({ action: "customers_list", q: "sara" }); ok(r.json.customers.length === 1, "or by name");
  r = await adm({ action: "customers_list", q: "nobody" }); ok(r.json.customers.length === 0 && r.json.total === 3, "no match gives an empty list");
  ok(!JSON.stringify((await adm({ action: "customers_list" })).json).includes("token"), "nothing secret in the list");

  /* ---- E) manual spending ---- */
  const spend = async (uid, d, note) => { const x = await adm({ action: "customer_spend", uid, deltaUsd: d, note }); await new Promise(res => setTimeout(res, 3)); return x; };
  r = await spend("c1", 120, "first order at the shop"); ok(r.status === 200 && r.json.customer.spentUsd === 120 && r.json.customer.vip === 1 && r.json.customer.progressUsd === 120 && get("storeCustomers/c1").spentUsd === 120, "adding spending updates the customer and shows the new progress");
  r = await spend("c1", 80.005, "more"); ok(r.json.customer.spentUsd === 200.01 && r.json.customer.vip === 2 && r.json.customer.progressUsd === 0.01, "crossing 200 makes VIP 2 (amounts are rounded to cents)");
  r = await spend("c1", -50, "refund"); ok(r.json.customer.spentUsd === 150.01 && r.json.customer.vip === 1, "a negative amount (a correction) can bring the level back down");
  r = await spend("c1", -99999, "oops"); ok(r.json.customer.spentUsd === 0 && r.json.customer.vip === 1, "spending can never go below zero");
  for (const [d, label] of [[0, "zero"], ["abc", "text"], [NaN, "NaN"], [2e6, "huge"], [-2e6, "huge negative"], [null, "empty"]]) { r = await spend("c1", d); ok(r.status === 400 && r.json.error === "bad_delta", "refused amount: " + label); }
  r = await spend("ghost", 5); ok(r.status === 404, "an unknown customer is a 404"); ok((await spend("a/b", 5)).status === 400 && (await spend("", 5)).status === 400, "bad ids are refused");
  ok(!store.has("storeCustomers/ghost") && [...store.keys()].filter(k => k.startsWith("storeSpendLog/")).every(k => get(k).uid !== "ghost"), "a refused change creates and logs nothing");
  ok((await adm({ action: "customer_spend", uid: "c1", deltaUsd: 5 }, "other")).status === 401, "only the admin can change spending");
  r = await adm({ action: "customer_log", uid: "c1" });
  ok(r.json.log.length === 4 && r.json.log[0].deltaUsd === -99999 && r.json.log[0].spentAfter === 0 && r.json.log.map(x => x.note).sort().join("|") === "first order at the shop|more|oops|refund" && r.json.log.every(x => x.at > 0), "every change is logged (amount, result, note, time), newest first");
  r = await adm({ action: "customer_log", uid: "c2" }); ok(r.json.log.length === 0, "another customer's log is separate");
  put("storeCustomers/c9", { name: "x", email: "", spentUsd: 10, createdAt: 1, lastSeenAt: 1 });
  let bumped = false; const realCommit = c.fsCommit; c.fsCommit = async (e, ws) => { if (!bumped && ws.some(w => w.update && w.update.name.endsWith("storeCustomers/c9") && w.currentDocument && w.currentDocument.updateTime)) { bumped = true; put("storeCustomers/c9", { name: "x", email: "", spentUsd: 15, createdAt: 1, lastSeenAt: 1 }); } return realCommit(e, ws); };
  r = await spend("c9", 5, "race"); ok(r.status === 200 && r.json.customer.spentUsd === 20 && get("storeCustomers/c9").spentUsd === 20, "if another change lands at the same moment, the amount is re-read and added on top (nothing lost)");
  c.fsCommit = realCommit;
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
