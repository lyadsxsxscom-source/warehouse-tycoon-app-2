// اختبارات السيرفر: تقليل قراءات Firestore (عدّاد طلبات الأدمن بالعدّ، المتابعة التلقائية بقراءة المحتاج بس، وكاش الكتالوج دقيقة)
// التشغيل: node tools/tests/store_reads_worker.test.js
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
    if (filter) rows = rows.filter(r => filter.field.split(".").reduce((o, k) => (o == null ? o : o[k]), r.data) === filter.value);
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
  c.fsRunQuery = async (e, coll, field, limit, offset, filter) => { let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) })); if (filter) rows = rows.filter(r => filter.field.split(".").reduce((o, k) => (o == null ? o : o[k]), r.data) === filter.value); return rows.slice(0, limit); };
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
  const F = (n) => vm.runInContext(n, c);
  const spy = { queries: [], aggs: [], fetches: [] }; const realRun = c.fsRunQuery; c.fsRunQuery = async (...a) => { spy.queries.push({ coll: a[1], filter: a[5] ? { ...a[5] } : null }); return realRun(...a); };
  c.getGoogleAccessToken = async () => "T"; if (!env.FIREBASE_PROJECT_ID && !env.FIREBASE_PROJECT) env.FIREBASE_PROJECT_ID = "p";
  let aggFail = false;
  c.fetch = async (url, opts) => { const u = String(url); spy.fetches.push(u);
    if (u.endsWith(":runAggregationQuery")) { const b = JSON.parse(opts.body); spy.aggs.push(b); if (aggFail) return { ok: false, status: 500, json: async () => ({}), text: async () => "x" }; const f = b.structuredAggregationQuery.structuredQuery.where && b.structuredAggregationQuery.structuredQuery.where.fieldFilter; const want = f && (f.value.stringValue);
      const n = [...store.entries()].filter(([k, v]) => k.startsWith("storeOrders/") && (!f || c.fieldsToObj(v.fields)[f.field.fieldPath] === want)).length; return { ok: true, status: 200, json: async () => ([{ result: { aggregateFields: { n: { integerValue: String(n) } } } }]) }; }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" }; };
  const mkO = (id, o) => put("storeOrders/" + id, { kind: "order", code: id, uid: "u1", itemId: "i", itemName: "x", playerId: "123456789", vip: 1, priceUsd: 1, createdAt: NOW, events: [], ...o });
  let r;

  /* ---- A) the order badge counts without reading ---- */
  for (let i = 0; i < 40; i++) mkO("p" + i, { status: i < 7 ? "payment_submitted" : i < 19 ? "processing" : "done" });
  spy.queries.length = 0; spy.aggs.length = 0; r = await adm({ action: "orders_badge" });
  ok(r.status === 200 && r.json.counts.payment_submitted === 7 && r.json.counts.processing === 12 && r.json.waiting === 19, "the badge answers with the right counts (7 + 12 = 19 waiting) out of 40 orders");
  ok(spy.aggs.length === 3 && spy.aggs.every(b => b.structuredAggregationQuery.aggregations[0].count && b.structuredAggregationQuery.structuredQuery.from[0].collectionId === "storeOrders") && spy.queries.length === 0, "it used three COUNT queries and read no order documents at all (before, every check read all the orders)");
  ok(JSON.stringify(spy.aggs.map(b => b.structuredAggregationQuery.structuredQuery.where.fieldFilter.value.stringValue).sort()) === '["payment_submitted","processing","quote_requested"]', "(one count for each waiting state, price requests included)");
  ok((await adm({ action: "orders_badge" }, "u1")).status === 401 && (await adm({ action: "orders_badge" }, null)).status === 401, "the badge is admin-only");
  aggFail = true; spy.queries.length = 0; r = await adm({ action: "orders_badge" }); ok(r.status === 200 && r.json.counts.payment_submitted === 7 && r.json.counts.processing === 12 && spy.queries.length === 3 && spy.queries.every(q => q.filter && q.filter.field === "status"), "if the count service is unavailable it falls back to a filtered read (still only that status, never all orders)"); aggFail = false;
  const full = (await adm({ action: "orders_list", status: "waiting" })).json; ok(full.waiting === 19 && full.total === 40, "(the full orders screen is unchanged: it still lists everything when you open it)");

  /* ---- B) the follow-up jobs read only what needs following ---- */
  for (const k of [...store.keys()]) if (k.startsWith("storeOrders/")) store.delete(k);
  for (let i = 0; i < 60; i++) mkO("old" + i, { status: "processing" });                 // 60 ordinary orders waiting for you (no automation)
  mkO("s1", { status: "processing", auto: { state: "sent", at: 1, supplierOrderId: "ord-1" } }); mkO("r1", { status: "processing", auto: { state: "retry", at: 1, tries: 1 } }); mkO("m1", { status: "processing", auto: { state: "manual", at: 1 } }); mkO("d1", { status: "done", auto: { state: "sent" } });
  put("config/storeSupplier", { enabled: true, minMarginPct: 5, dailyCapUsd: 100, updatedAt: 1 }); env.FAZER_API_KEY = "K";
  const dep = (id, o) => put("storeOrders/" + id, { kind: "topup", code: id, uid: "u1", status: "payment_submitted", autoVerify: "bep20", amount: 10.0001, priceUsd: 10, createdAt: NOW, proof: { ref: "0x" + "1".repeat(64), submittedAt: NOW }, events: [], ...o });
  for (let i = 0; i < 50; i++) dep("w" + i, { status: "done" }); dep("c1", { chain: { state: "pending" } }); dep("c2", { chain: { state: "retry" } }); dep("c3", { chain: { state: "manual" } }); dep("c4", {});
  const seen = []; const origSync = F("storeAutoSync"), origFul = F("storeAutoFulfill"); c.storeAutoSync = async (e, id) => { seen.push("sync:" + id); return {}; }; c.storeAutoFulfill = async (e, id) => { seen.push("fulfill:" + id); return {}; };
  spy.queries.length = 0; await F("storeAutoSweep")(env, Date.now() + 10 * 60000);
  ok(spy.queries.filter(q => q.coll === "storeOrders").map(q => q.filter.field + "=" + q.filter.value).join() === "auto.state=sent,auto.state=retry,auto.state=sending" && !spy.queries.some(q => q.filter && q.filter.field === "status"), "the automatic-fulfillment job asks only for orders in the sent / retry / sending states (3 small queries), never for every order in progress");
  ok(seen.sort().join() === "fulfill:r1,sync:s1", "…and still follows exactly the right two: the one sent (to ask FazerCards) and the one to retry; not the 60 ordinary ones, not the held one, not the finished one"); delete c.storeAutoSync; delete c.storeAutoFulfill;
  const ver = []; c.storeChainVerifyOnce = async (e, id) => { ver.push(id); return { outcome: "pending" }; };
  spy.queries.length = 0; await F("storeChainSweep")(env, { full: false }); ok(spy.queries.map(q => q.filter.field + "=" + q.filter.value).join() === "chain.state=pending,chain.state=retry" && ver.sort().join() === "c1,c2", "the deposit job (the frequent run) asks only for deposits whose check is pending or retrying: it follows c1 and c2, leaves the held one (c3) and reads none of the 50 finished ones");
  ver.length = 0; spy.queries.length = 0; await F("storeChainSweep")(env, { full: true }); ok(spy.queries.some(q => q.filter.field === "status" && q.filter.value === "payment_submitted") && ver.sort().join() === "c1,c2,c4", "the hourly full run also catches a deposit that has a transaction number but no check state yet (c4)");
  ver.length = 0; await F("storeChainSweep")(env); ok(ver.includes("c4"), "(and so does a direct call)"); delete c.storeChainVerifyOnce;

  /* ---- C) the public catalog is cached for a minute ---- */
  put("storeNodes/nA", { parentId: "", type: "folder", name: "PUBG", enabled: true, sort: 1, note: "" }); put("storeNodes/i1", { parentId: "nA", type: "item", name: "60 UC", enabled: true, sort: 1, prices: P10([1]), note: "" });
  const cache = new Map(); const puts = []; c.caches = { default: { match: async (k) => { const v = cache.get(k.url); return v ? v.clone() : undefined; }, put: async (k, v) => { puts.push(k.url); cache.set(k.url, v); }, delete: async (k) => cache.delete(k.url) } };
  const waits = []; const getCat = (method) => W.fetch(new Request("https://x/store/catalog", { method }), env, { waitUntil: p => waits.push(p) });
  spy.queries.length = 0; let a = await getCat("GET"); await Promise.all(waits.splice(0)); const j1 = await a.json(); const q1 = spy.queries.length;
  ok(a.status === 200 && j1.items[0].name === "PUBG" && q1 >= 1 && JSON.stringify(puts) === JSON.stringify(["https://x/store/catalog", "https://x/store/catalog?stale=1"]) && a.headers.get("Access-Control-Allow-Origin") === "*" && /max-age=60/.test(a.headers.get("Cache-Control")), "the first catalog request reads the database and stores the answer twice (a one-minute copy and a one-day spare), with its open-access and one-minute headers");
  spy.queries.length = 0; a = await getCat("GET"); const j2 = await a.json(); ok(spy.queries.length === 0 && j2.items[0].name === "PUBG" && a.headers.get("Access-Control-Allow-Origin") === "*", "the next requests are answered from the cache without reading the database at all");
  spy.queries.length = 0; a = await getCat("POST"); ok(a.status === 200 && spy.queries.length >= 1 && puts.length === 2, "a POST is never served from or put in the cache");
  ok(/s-maxage=60/.test(cache.get("https://x/store/catalog").headers.get("Cache-Control")) && /max-age=30/.test(cache.get("https://x/store/catalog").headers.get("Cache-Control")) && /max-age=86400/.test(cache.get("https://x/store/catalog?stale=1").headers.get("Cache-Control")), "the shared copy lives 5 minutes (browsers re-ask after 1), and the spare copy lives a day");
  /* an admin change clears the fresh copy at once, and keeps the spare */
  spy.queries.length = 0; a = await getCat("GET"); await Promise.all(waits.splice(0)); ok(spy.queries.length === 0 && cache.has("https://x/store/catalog"), "(still cached)");
  r = await adm({ action: "save", id: "i1", name: "60 UC (new)", enabled: true, prices: P10([1]) }); ok(r.status === 200 && !cache.has("https://x/store/catalog") && cache.has("https://x/store/catalog?stale=1"), "saving a product clears the fresh catalog copy right away (the spare stays for outages)");
  a = await getCat("GET"); await Promise.all(waits.splice(0)); const jn = await a.json(); ok(jn.items[0].children[0].name === "60 UC (new)" && cache.has("https://x/store/catalog"), "the next visitor sees the change at once and refills the copy");
  for (const act of [{ action: "reorder", id: "i1", dir: "up" }, { action: "move", id: "i1", parentId: "" }, { action: "delete", id: "i1" }]) { cache.set("https://x/store/catalog", new Response("{}")); r = await adm(act); ok(r.status === 200 && !cache.has("https://x/store/catalog"), act.action + " clears it too"); }
  cache.set("https://x/store/catalog", new Response("{}")); r = await adm({ action: "list" }); ok(r.status === 200 && cache.has("https://x/store/catalog"), "reading (list) leaves the cache alone"); r = await adm({ action: "save", id: "ghost", name: "x", prices: P10([1]) }); ok(r.status === 404 && cache.has("https://x/store/catalog"), "a refused change leaves it alone too");
  put("storeNodes/i1", { parentId: "nA", type: "item", name: "60 UC", enabled: true, sort: 1, prices: P10([1]), note: "" }); cache.clear(); await getCat("GET"); await Promise.all(waits.splice(0));        // refill both copies
  /* the database goes down (for example the daily limit is reached) */
  const origRun = c.fsRunQuery; cache.delete("https://x/store/catalog"); c.fsRunQuery = async () => { throw new Error("quota"); };
  a = await getCat("GET"); await Promise.all(waits.splice(0)); const j3 = await a.json(); ok(a.status === 200 && j3.items[0].name === "PUBG" && a.headers.get("X-Catalog-Stale") === "1" && a.headers.get("Cache-Control") === "no-store", "when the database fails and the one-minute copy has expired, the shop still shows the last saved catalog (for up to a day), marked stale");
  cache.clear(); puts.length = 0; a = await getCat("GET"); await Promise.all(waits.splice(0)); const j4 = await a.json(); ok(a.status === 503 && j4.error === "unavailable" && /مشغول مؤقتاً/.test(j4.message) && puts.length === 0, "with no saved copy at all, it answers a clear 'busy' (503), and an error answer is never cached"); c.fsRunQuery = origRun;
  c.caches = { default: { match: async () => { throw new Error("cache down"); }, put: async () => { throw new Error("cache down"); } } }; a = await getCat("GET"); await Promise.all(waits.splice(0)); ok(a.status === 200 && (await a.json()).items[0].name === "PUBG", "if the cache itself fails, the catalog is still served from the database");
  delete c.caches; a = await getCat("GET"); ok(a.status === 200, "(and without any cache available)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e); process.exit(1); });
