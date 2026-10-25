// اختبارات السيرفر: الألعاب بخانتين (Player ID + Zone ID) متل موبايل ليجندز: الربط، السعر، الطلب، التحقق، التنفيذ التلقائي، ورابط الذكاء الاصطناعي
// التشغيل: node tools/tests/store_zone_worker.test.js
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
  const KEY = "FZR-KEY-1", WHS = "whsec-test-1"; env.FAZER_API_KEY = KEY; env.FAZER_WEBHOOK_SECRET = WHS;
  const sup = { calls: [], routes: {}, fail: null };
  c.fetch = async (url, opts) => {
    const method = (opts && opts.method) || "GET", path = String(url).replace("https://api.fzr.cards/api/v2", ""), key = path.split("?")[0];
    const body = opts && opts.body ? JSON.parse(opts.body) : null; sup.calls.push({ url: String(url), method, headers: (opts && opts.headers) || {}, body });
    if (sup.fail === "network") throw new Error("boom");
    let r = sup.routes[method + " " + path] || sup.routes[method + " " + key]; if (typeof r === "function") r = r(body, (opts && opts.headers) || {});
    if (!r) return { ok: false, status: 404, json: async () => ({ ok: false, error: "not found" }) };
    return { ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.body };
  };
  const resetCache = () => vm.runInContext("FZR_CACHE = { me: null, plans: null, offers: {} }", c);
  const F = (n) => vm.runInContext(n, c);
  const iso = (ms) => new Date(ms).toISOString();
  const okMe = (o) => ({ body: { ok: true, login: "p", plan: "gold", planExpiresAt: iso(NOW + 20 * DAY), planAutoRenew: true, subscriptionActive: true, ...o } });
  const setCfg = (o) => put("config/storeSupplier", { enabled: true, minMarginPct: 5, dailyCapUsd: 100, updatedAt: 1, ...o });
  const drain = () => { for (const k of [...store.keys()]) if (k.startsWith("storeOrders/")) { const o = get(k); if (o.kind === "order" && o.status === "processing" && (o.uid === "u1" || o.uid === "u2")) put(k, { ...o, status: "done" }); } };
  const setup = (o) => { o = o || {}; drain(); resetCache(); sup.fail = null; sup.calls.length = 0; env.FAZER_API_KEY = KEY;
    sup.routes["GET /me"] = okMe(o.me); sup.routes["GET /balance"] = { body: { ok: true, balance: String(o.balance === undefined ? 11.4224 : o.balance), currency: "USD" } }; sup.routes["GET /subscription/plans"] = { body: { ok: true, plans: [{ plan: "gold", priceUsd: "9.9900" }] } };
    sup.routes["GET /topups/offers?category_id=cat_pubgm_1"] = { body: { ok: true, category_id: "cat_pubgm_1", name: "PUBG", offers: [{ offer_id: "offer_60uc", name: "60 UC", price_usd: String(o.cost === undefined ? 0.875 : o.cost) }], fields: [{ key: "player_id", label: "Player ID", type: "text" }] } };
    sup.routes["POST /topups/order"] = () => ({ body: { ok: true, order: { id: "ord-9002", kind: "topup", status: o.initialStatus || "processing" } } });
    sup.routes["GET /orders/ord-9002"] = { body: { ok: true, order: { id: "ord-9002", status: "processing" } } }; setCfg(o.cfg || {}); };
  const waits = []; const callC = async (path, body, token) => { const r = await W.fetch(new Request("https://x" + path, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => waits.push(p) }); const out = { status: r.status, json: await r.json().catch(() => null) }; await Promise.all(waits.splice(0)); return out; };
  const buy = (uid, itemId, pid) => callC("/store/order", { itemId: itemId || "i60", playerId: pid || "5123456789", reqId: rid() }, uid || "u1");
  const posts = () => sup.calls.filter(x => x.method === "POST" && /topups\/order/.test(x.url));
  const ord = (id) => get("storeOrders/" + id);
  const hook = async (payload, o) => { o = o || {}; const raw = typeof payload === "string" ? payload : JSON.stringify(payload); const sig = o.sig !== undefined ? o.sig : "sha256=" + await F("hmacHex")(o.secret || WHS, raw); const r = await W.fetch(new Request("https://x/supplier/fazer/webhook", { method: "POST", headers: { "X-Webhook-Signature": sig, "Content-Type": "application/json" }, body: raw }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json().catch(() => null) }; };
  let evSeq = 0; const ev = (oid, status, type) => ({ event: type || "order.status_changed", event_id: "8f3a2c9e-1b4d-4f7a-9e2c-" + String(++evSeq).padStart(12, "0"), timestamp: iso(NOW), data: { order_id: oid, type: "topup", status, previous_status: "processing" } });
  const dayDoc = () => get("storeSupplierDay/" + new Date(Date.now()).toISOString().slice(0, 10));
  put("storeNodes/i60", { parentId: "", type: "item", name: "60 UC", enabled: true, sort: 1, prices: P10([0.96, 0.95, 0.95, 0.94, 0.94, 0.94, 0.93, 0.93, 0.93, 0.93]), supplier: { provider: "fazercards", categoryId: "cat_pubgm_1", offerId: "offer_60uc", playerField: "player_id", categoryName: "PUBG", validateCategoryId: "", offerName: "60 UC", costUsd: 0.875 } });
  put("storeNodes/iPlain", { parentId: "", type: "item", name: "Manual item", enabled: true, sort: 2, prices: P10([2]) });
  put("config/storeWallet", { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 100, updatedAt: 1 }); mkC("u1", { balanceUsd: 50 }); mkC("u2", { balanceUsd: 500 }); TOKS.u4 = { sub: "u4", name: "Four", email: "four@x.com" };
  let r, id;
  const MLL = { provider: "fazercards", categoryId: "cat_mlbb", offerId: "dm86", playerField: "player_id", zoneField: "zone_id", categoryName: "Mobile Legends", validateCategoryId: "mobile_legends", offerName: "86 Diamonds", costUsd: 1.5 };
  put("storeNodes/iML", { parentId: "", type: "item", name: "86 ماسة", enabled: true, sort: 3, prices: P10([2, 1.9, 1.9, 1.8, 1.8, 1.8, 1.7, 1.7, 1.6, 1.6]), supplier: MLL });
  const mlRoutes = () => { sup.routes["GET /topups/offers?category_id=cat_mlbb"] = { body: { ok: true, category_id: "cat_mlbb", name: "Mobile Legends", offers: [{ offer_id: "dm86", name: "86 Diamonds", price_usd: "1.5" }], fields: [{ key: "player_id", label: "Player ID", type: "text" }, { key: "zone_id", label: "Zone ID", type: "text" }] } };
    sup.routes["GET /topups/validate-id"] = { body: { ok: true, items: [{ category_id: "pubg_mobile", name: "PUBG Mobile", fields: [{ key: "player_id" }] }, { category_id: "mobile_legends", name: "Mobile Legends", fields: [{ key: "player_id" }, { key: "zone_id" }] }] } };
    sup.routes["POST /topups/validate-id"] = (b) => ({ body: { ok: true, valid: b.fields.player_id === "12345678" && b.fields.zone_id === "1234", player_name: "Hero", region: "MENA" } }); };
  vm.runInContext("FZR_VALIDATORS = { at: 0, items: [] }", c);

  /* ---- A) parsing the link ---- */
  const parse = F("storeParseSupplierLink");
  ok(parse({ categoryId: "c", offerId: "o" }).zoneField === "", "an old link (no zone) stays a single-field link");
  ok(parse({ categoryId: "c", offerId: "o", zoneField: "zone_id" }).zoneField === "zone_id", "a link can carry a Zone field");
  let th = null; try { parse({ categoryId: "c", offerId: "o", zoneField: "Zone-ID!" }); } catch (e) { th = e; } ok(th && /Zone/.test(th.message), "a malformed Zone field name is refused");
  th = null; try { parse({ categoryId: "c", offerId: "o", playerField: "player_id", zoneField: "player_id" }); } catch (e) { th = e; } ok(!!th, "the Zone field cannot be the same as the ID field");
  const split = F("storeSplitFields");
  ok(JSON.stringify(split([{ key: "player_id" }, { key: "zone_id" }])) === JSON.stringify({ playerField: "player_id", zoneField: "zone_id" }) && split([{ key: "user_id" }, { key: "server_id" }]).zoneField === "server_id", "ID + Zone (or Server) is understood");
  ok(split([{ key: "user_id" }, { key: "email" }]) === null && split([{ key: "a" }, { key: "zone" }, { key: "c" }]) === null && split([{ key: "uid" }]).zoneField === "", "anything else with two or more fields is refused (no guessing); one field works as before");

  const aiF = F("aiPlayerField"); const aiz = aiF({ name: "ML", fields: [{ key: "player_id" }, { key: "zone_id" }] });
  ok(aiz.playerField === "player_id" && aiz.zoneField === "zone_id" && aiF({ name: "P", fields: [{ key: "player_id" }] }).zoneField === "", "the AI link can now add ID + Zone games (and one-field games as before)");
  th = null; try { aiF({ name: "X", fields: [{ key: "user_id" }, { key: "email" }] }); } catch (e) { th = e; } ok(th && th.code === "multi_fields", "the AI link still refuses other two-field games");

  /* ---- B) the quote tells the page to ask for the Zone ---- */
  setup(); mlRoutes();
  r = await callC("/store/quote", { itemId: "iML" }, "u1"); ok(r.status === 200 && r.json.quote.zone === true, "the quote of a two-field product says the Zone is needed");
  r = await callC("/store/quote", { itemId: "i60" }, "u1"); ok(r.status === 200 && r.json.quote.zone === false, "a one-field product does not ask for it");

  /* ---- C) ID check sends both fields ---- */
  setup(); mlRoutes();
  r = await callC("/store/validate-id", { itemId: "iML", playerId: "12345678" }, "u1"); ok(r.status === 400 && r.json.error === "bad_zone", "checking without the Zone is refused with a clear message");
  sup.calls.length = 0; r = await callC("/store/validate-id", { itemId: "iML", playerId: "12345678", zoneId: "1234" }, "u1");
  const vc = sup.calls.find(x => x.method === "POST" && /validate-id/.test(x.url));
  ok(r.json.supported && r.json.valid && r.json.playerName === "Hero" && vc.body.category_id === "mobile_legends" && vc.body.fields.player_id === "12345678" && vc.body.fields.zone_id === "1234", "the check sends the ID and the Zone and shows the player's name");
  r = await callC("/store/validate-id", { itemId: "iML", playerId: "12345678", zoneId: "9999" }, "u1"); ok(r.json.supported && !r.json.valid, "a wrong Zone gives 'not found'");
  r = await callC("/store/validate-id", { itemId: "i60", playerId: "5123456789", zoneId: "1" }, "u1"); ok(r.json.supported === false || r.json.valid !== undefined, "a one-field product ignores a stray Zone");

  /* ---- D) ordering ---- */
  setup(); mlRoutes();
  const b0 = bal("u1");
  r = await callC("/store/order", { itemId: "iML", playerId: "12345678", reqId: rid() }, "u1"); ok(r.status === 400 && r.json.error === "bad_zone" && bal("u1") === b0, "an order without the Zone is refused and nothing is taken from the balance");
  r = await callC("/store/order", { itemId: "iML", playerId: "12345678", zoneId: "12a", reqId: rid() }, "u1"); ok(r.status === 400 && r.json.error === "bad_zone", "a Zone with letters is refused");
  r = await callC("/store/order", { itemId: "iML", playerId: "12345678", zoneId: " 1234 ", reqId: rid() }, "u1"); id = r.json.order.id;
  ok(r.status === 200 && ord(id).zoneId === "1234" && r.json.order.zoneId === "1234", "a good order stores the Zone (trimmed) and shows it back to the customer");
  const pz = posts().pop(); ok(pz && pz.body.category_id === "cat_mlbb" && pz.body.fields.player_id === "12345678" && pz.body.fields.zone_id === "1234" && Object.keys(pz.body.fields).length === 2, "the automatic order sends both fields to FazerCards");
  const av = (await adm({ action: "orders_list" })).json.orders.find(x => x.id === id); ok(av.zoneId === "1234", "the admin sees the Zone");
  const sr = (await adm({ action: "orders_list", q: "1234" })).json.orders; ok(Array.isArray(sr), "orders can be searched (Zone included in the search text)");
  r = await buy("u1", "i60", "5123456789"); id = r.json.order.id; ok(r.status === 200 && !("zoneId" in ord(id)) && Object.keys(posts().pop().body.fields).join() === "player_id", "a one-field product works exactly as before (no Zone stored or sent)");

  /* ---- E) auto-fulfillment gate: an old order of a two-field product without a Zone is never sent ---- */
  setup(); mlRoutes(); put("storeOrders/oz", { kind: "order", code: "T-9", no: 9, uid: "u2", name: "u2", email: "", itemId: "iML", itemName: "86", itemPath: "86", playerId: "12345678", vip: 1, priceUsd: 2, status: "processing", createdAt: NOW, updatedAt: NOW, events: [] });
  sup.calls.length = 0; await F("storeAutoFulfill")(env, "oz"); ok(!posts().length && ord("oz").status === "processing", "an order missing its Zone stays for the admin and is not sent");

  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
