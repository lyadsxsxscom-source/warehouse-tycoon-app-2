// اختبارات السيرفر: التنفيذ التلقائي عند FazerCards (7ج): الحمايات، الإرسال بمفتاح تكرار، الإتمام بالإشعار أو السؤال، الاسترجاع التلقائي، الحالات المجهولة، المراقبة، والـsweeper
// التشغيل: node tools/tests/store_autofulfill_worker.test.js
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

  /* ---- A) off by default: nothing changes ---- */
  setup({ cfg: { enabled: false } }); r = await buy(); id = r.json.order.id;
  ok(r.status === 200 && ord(id).status === "processing" && !ord(id).auto && sup.calls.length === 0, "with the automatic fulfillment OFF a purchase behaves exactly as before: in progress, no marker, FazerCards is not contacted");
  put("config/storeSupplier", { enabled: false, minMarginPct: 5, dailyCapUsd: 100, updatedAt: 1 }); put("storeOrders/" + id, { ...ord(id), status: "done" });

  /* ---- B) on: the order is sent safely ---- */
  setup(); const before = bal("u1"); r = await buy(); id = r.json.order.id; const o1 = ord(id);
  ok(r.status === 200 && r.json.order.status === "processing" && !("auto" in r.json.order) && !("supplierOrderId" in r.json.order) && !("costUsd" in r.json.order), "the customer's answer is unchanged (still 'in progress') and shows nothing about the supplier");
  const pc = posts(); ok(pc.length === 1 && pc[0].headers["X-API-Key"] === KEY && pc[0].headers["Idempotency-Key"] === "ys-" + id && pc[0].body.category_id === "cat_pubgm_1" && pc[0].body.offer_id === "offer_60uc" && pc[0].body.fields.player_id === "5123456789", "one order was sent to FazerCards: the right category, offer and Player ID, with a FIXED idempotency key made from our order id (so a retry can never deliver twice)");
  ok(sup.calls.filter(x => x.method === "GET").map(x => x.url.replace("https://api.fzr.cards/api/v2", "")).join() === "/me,/topups/offers?category_id=cat_pubgm_1,/balance", "before sending it checked the subscription, the current cost and the balance (and nothing else: no plan price needed far from renewal)");
  ok(o1.status === "processing" && o1.supplierOrderId === "ord-9002" && o1.auto.state === "sent" && o1.auto.costUsd === 0.875 && o1.auto.supplierStatus === "processing" && o1.events.some(e => e.action === "sent" && e.by === "auto" && /ord-9002/.test(e.note)) && bal("u1") === Math.round((before - 0.96) * 10000) / 10000, "the order stays in progress, remembers FazerCards' order number and cost, and the customer's balance was already charged once");
  ok(dayDoc().spentUsd === 0.875 && dayDoc().count === 1, "today's automatic spending is recorded ($0.875, one order)");
  ok(!pushes.some(x => x.uid === "u1") && !pushes.some(x => x.type === "store_supplier_issue"), "nobody is notified yet (nothing needs attention)");
  const adminView = (await adm({ action: "orders_list" })).json.orders.find(x => x.id === id); ok(adminView.auto.state === "sent" && adminView.supplierOrderId === "ord-9002" && adminView.auto.costUsd === 0.875, "the admin sees the automation state, FazerCards' order number and the cost");
  const myList = (await callC("/store/orders", {}, "u1")).json.orders.find(x => x.id === id); ok(!("auto" in myList) && !("supplierOrderId" in myList) && !("costUsd" in myList), "the customer's own list never shows supplier details");
  const sentId = id;

  /* ---- C) FazerCards says 'completed' (webhook) ---- */
  r = await hook(ev("ord-9002", "completed"), { sig: "sha256=bad" }); ok(r.status === 401 && ord(sentId).status === "processing", "a webhook with a wrong signature is refused and changes nothing");
  r = await hook("not json{{"); ok(r.status === 400, "an unreadable webhook is refused");
  r = await hook({ event: "order.status_changed", data: { order_id: "ord-9002", status: "completed" } }); ok(r.status === 400, "a webhook without an event id is refused");
  const noSec = env.FAZER_WEBHOOK_SECRET; delete env.FAZER_WEBHOOK_SECRET; r = await hook(ev("ord-9002", "completed")); env.FAZER_WEBHOOK_SECRET = noSec; ok(r.status === 503, "without the webhook secret configured it answers 'not configured' (never accepts anything)");
  r = await hook(ev("ord-9002", "completed")); ok(r.status === 200 && ord(sentId).status === "processing" && sup.calls.some(x => x.url.endsWith("/orders/ord-9002")), "a correctly signed 'completed' is NOT trusted by itself: it asks FazerCards' own API, which still says in progress, so nothing changes");
  const spent0 = spent("u1"); sup.routes["GET /orders/ord-9002"] = { body: { ok: true, order: { id: "ord-9002", status: "completed" } } };
  const done1 = ev("ord-9002", "completed"); r = await hook(done1); const od = ord(sentId);
  ok(r.status === 200 && od.status === "done" && od.costUsd === 0.875 && od.auto.state === "done" && od.events.some(e => e.action === "done" && e.by === "auto") && spent("u1") === Math.round((spent0 + 0.96) * 10000) / 10000, "when FazerCards' API confirms 'completed' the order is done, the price counts as spending (VIP), and the cost is kept for profit");
  ok(pushes.some(x => x.uid === "u1" && x.type === "store_done" && x.params.code === od.code), "the customer is told it was delivered");
  ok(ledger("u1").every(x => x.by !== "auto" || x.type !== "order_refund"), "no refund was made");
  const nPush = pushes.length; r = await hook(done1); ok(r.status === 200 && r.json.duplicate === true && pushes.length === nPush && ord(sentId).status === "done", "the same event again (FazerCards retries) is recognised and ignored: no second notification");
  r = await hook(ev("ord-9999", "completed")); ok(r.status === 200, "an order we do not know is acknowledged and ignored (so FazerCards does not keep retrying)");
  r = await hook(ev("ord-9002", "processing", "order.created")); ok(r.status === 200 && ord(sentId).status === "done", "other event types are acknowledged and ignored");
  const adm2 = await adm({ action: "order_refund", id: sentId, note: "customer asked" }); ok(adm2.status === 200 && ord(sentId).status === "refunded" && ord(sentId).costUsd === 0.875, "an automatically delivered order can still be refunded by you afterwards (and keeps its cost record)");

  /* ---- D) FazerCards says 'failed' or 'refund': automatic refund ---- */
  for (const [bad, sid] of [["failed", "ord-9100"], ["refund", "ord-9101"]]) {
    setup(); sup.routes["POST /topups/order"] = () => ({ body: { ok: true, order: { id: sid, kind: "topup", status: "processing" } } }); const b0 = bal("u2"), sp0 = spent("u2"), day0 = (dayDoc() || {}).spentUsd || 0; r = await buy("u2"); id = r.json.order.id;
    sup.routes["GET /orders/" + sid] = { body: { ok: true, order: { id: sid, status: bad } } }; const p0 = pushes.length; r = await hook(ev(sid, bad)); const o = ord(id);
    ok(r.status === 200 && o.status === "rejected" && o.rejectReason === vm.runInContext("STORE_AUTO_FAIL_REASON", c) && o.auto.state === "refunded" && o.auto.supplierStatus === bad && bal("u2") === b0 && spent("u2") === sp0, "FazerCards says '" + bad + "': the customer is refunded in full automatically, the order is rejected with a clear reason, and no spending is counted");
    ok(ledger("u2").some(x => x.type === "order_refund" && x.by === "auto" && x.amountUsd === 0.96 && x.ref === o.code) && pushes.slice(p0).some(x => x.uid === "u2" && x.type === "store_rejected" && x.params.reason === o.rejectReason), "the refund is in the ledger (by 'auto') and the customer is told why");
    ok(Math.round(((dayDoc() || {}).spentUsd - day0) * 10000) === 0, "today's automatic spending went back down (that money was never spent)"); }

  /* ---- E) instant completion ---- */
  setup({ initialStatus: "completed" }); r = await buy("u2"); id = r.json.order.id; ok(ord(id).status === "done" && ord(id).auto.state === "done" && ord(id).costUsd === 0.875 && pushes.some(x => x.type === "store_done" && x.params.code === ord(id).code), "if FazerCards answers 'completed' straight away the order is finished at once");

  /* ---- F) what FazerCards refuses ---- */
  setup(); sup.routes["POST /topups/order"] = () => ({ status: 400, body: { ok: false, error: "Invalid player id" } }); const b1 = bal("u2"), sp1 = spent("u2"), d1 = (dayDoc() || {}).spentUsd || 0; r = await buy("u2"); id = r.json.order.id;
  ok(ord(id).status === "rejected" && ord(id).auto.state === "refunded" && /Invalid player id/.test(ord(id).auto.supplierMsg) && bal("u2") === b1 && spent("u2") === sp1 && Math.round((((dayDoc() || {}).spentUsd || 0) - d1) * 10000) === 0 && ord(id).rejectReason === vm.runInContext("STORE_AUTO_FAIL_REASON", c) && !/Invalid player id/.test(ord(id).rejectReason), "a clear refusal (e.g. wrong Player ID on their side) = automatic refund; the supplier's own words are kept for you but are NOT shown to the customer");
  for (const [st, body, label] of [[400, { ok: false, error: "Insufficient balance" }, "not enough balance"], [409, { ok: false, error: "Subscription inactive", code: "subscription_inactive" }, "subscription problem"], [403, { ok: false, error: "forbidden" }, "403"], [401, { ok: false, error: "bad key" }, "401"]]) {
    setup(); sup.routes["POST /topups/order"] = () => ({ status: st, body }); const bb = bal("u2"), d2 = (dayDoc() || {}).spentUsd || 0, p0 = pushes.length; r = await buy("u2"); id = r.json.order.id;
    ok(ord(id).status === "processing" && ord(id).auto.state === "manual" && ord(id).auto.reason.length > 5 && bal("u2") === Math.round((bb - 0.96) * 10000) / 10000 && Math.round((((dayDoc() || {}).spentUsd || 0) - d2) * 10000) === 0, "a problem on YOUR side (" + label + "): NOT refunded to the customer, held for you with a reason, and the reserved daily amount is released");
    ok(pushes.slice(p0).filter(x => x.uid === ADMIN && x.type === "store_supplier_issue" && x.params.code === ord(id).code).length === 1, "you get exactly one alert for it"); }

  /* ---- G) uncertain outcomes are never refunded and are retried with the SAME key ---- */
  for (const [mode, label] of [["429", "429 too many requests"], ["500", "a 500 error"], ["network", "no network"]]) {
    setup(); if (mode === "network") { sup.routes["POST /topups/order"] = () => { throw new Error("x"); }; } else sup.routes["POST /topups/order"] = () => ({ status: Number(mode), body: { ok: false, error: "try later" } });
    const bn = bal("u2"), d3 = (dayDoc() || {}).spentUsd || 0, p0 = pushes.length; r = await buy("u2"); id = r.json.order.id; const o = ord(id);
    ok(o.status === "processing" && o.auto.state === "retry" && o.auto.tries === 1 && bal("u2") === Math.round((bn - 0.96) * 10000) / 10000 && !pushes.slice(p0).some(x => x.type === "store_rejected"), "after " + label + " the result is unknown: no refund, state 'retry' (nobody is bothered yet)");
    ok(Math.round((((dayDoc() || {}).spentUsd || 0) - d3) * 10000) === Math.round(0.875 * 10000), "(the daily amount stays reserved, because the order may exist at FazerCards)");
    sup.routes["POST /topups/order"] = () => ({ body: { ok: true, order: { id: "ord-9300", kind: "topup", status: "processing" } } }); sup.calls.length = 0; const sw = await F("storeAutoSweep")(env, Date.now());
    const sent = ord(id); ok(sw.retried === 1 && sent.auto.state === "sent" && sent.supplierOrderId === "ord-9300" && posts().length === 1 && posts()[0].headers["Idempotency-Key"] === "ys-" + id, "the 5-minute job retried it with the SAME idempotency key and it was sent (tries counted)"); }
  setup(); sup.routes["POST /topups/order"] = () => ({ status: 500, body: { ok: false, error: "down" } }); r = await buy("u2"); id = r.json.order.id; const pAlert = pushes.length;
  for (let i = 0; i < 6; i++) { await F("storeAutoSweep")(env, Date.now()); } const stuck = ord(id);
  ok(stuck.auto.state === "manual" && /تحقق من لوحتهم قبل ما تنفّذه يدوياً/.test(stuck.auto.reason) && pushes.slice(pAlert).filter(x => x.type === "store_supplier_issue" && /لوحتهم/.test(x.params.reason)).length === 1 && stuck.status === "processing", "after 6 failed attempts it stops retrying, holds the order for you, and tells you ONCE to check FazerCards' panel before delivering by hand (so you never deliver twice)");

  /* ---- H) the safety gates ---- */
  const held = async (o, re, label, pid) => { setup(o); const bb = bal("u2"); const r0 = await buy("u2", "i60", pid); const id0 = r0.json.order.id, x = ord(id0); ok(x.status === "processing" && x.auto && x.auto.state === "manual" && re.test(x.auto.reason) && posts().length === 0 && bal("u2") === Math.round((bb - 0.96) * 10000) / 10000, label); return id0; };
  await held({ me: { subscriptionActive: false } }, /اشتراك FazerCards غير فعّال/, "an inactive FazerCards subscription: held, nothing is sent");
  await held({ cost: 0.93 }, /الهامش 3\.1% أقل من حدّك \(5%\)/, "a margin below your limit (cost $0.93 against a $0.96 sale = 3.1% < 5%): held, nothing is sent");
  setup({ cost: 0.9 }); r = await buy("u2"); ok(ord(r.json.order.id).auto.state === "sent", "(a 6.3% margin passes)");
  put("storeCustomers/u2", { ...get("storeCustomers/u2"), vip: 1 });
  await held({ balance: 0.5 }, /رصيدك عند FazerCards \(0\.5\$\) ما بيكفي/, "not enough balance at FazerCards: held with the numbers");
  await held({ balance: 10.5, me: { planExpiresAt: iso(NOW + 3 * DAY) } }, /الاشتراك بيتجدد قريباً \(9\.99\$\)/, "renewal is close and the order would leave less than the subscription price: held (your renewal money is protected)");
  setup({ balance: 10.5, me: { planExpiresAt: iso(NOW + 3 * DAY) } }); r = await buy("u2"); ok(ord(r.json.order.id).auto.state === "manual", "(and a second purchase in the same situation is held too)");
  setup({ balance: 10.5, me: { planExpiresAt: iso(NOW + 3 * DAY), planAutoRenew: false } }); r = await buy("u2"); ok(ord(r.json.order.id).auto.state === "sent", "but if auto-renew is OFF there is nothing to protect and it goes through");
  setup({ balance: 10.5, me: { planExpiresAt: iso(NOW + 30 * DAY) } }); r = await buy("u2"); ok(ord(r.json.order.id).auto.state === "sent" && !sup.calls.some(x => /subscription\/plans/.test(x.url)), "far from renewal the reserve does not apply (and the plan price is not even requested)");
  setup(); sup.routes["GET /topups/offers?category_id=cat_pubgm_1"] = { body: { ok: true, category_id: "cat_pubgm_1", name: "PUBG", offers: [{ offer_id: "other", name: "x", price_usd: "1" }], fields: [] } }; r = await buy("u2"); ok(/الخيار ما عاد موجود عند FazerCards/.test(ord(r.json.order.id).auto.reason) && ord(r.json.order.id).auto.state === "manual", "an offer that disappeared from FazerCards: held");
  resetCache(); delete env.FAZER_API_KEY; setCfg({}); r = await buy("u2"); ok(ord(r.json.order.id).auto.state === "manual" && /مفتاح FazerCards مو مضاف/.test(ord(r.json.order.id).auto.reason), "no API key: held"); env.FAZER_API_KEY = KEY;
  setup(); r = await buy("u2", "iPlain"); ok(!ord(r.json.order.id).auto && sup.calls.length === 0, "an item that is not linked to FazerCards is simply left for you (no marker, no calls)");
  /* the daily cap */
  setup({ cfg: { dailyCapUsd: 1 } }); put("storeSupplierDay/" + new Date(Date.now()).toISOString().slice(0, 10), { spentUsd: 0, count: 0 }); r = await buy("u2"); const c1 = ord(r.json.order.id); r = await buy("u2"); const c2 = ord(r.json.order.id);
  ok(c1.auto.state === "sent" && c2.auto.state === "manual" && /السقف اليومي \(1\$\) ما بيكفي لهالطلب \(انصرف اليوم 0\.875\$\)/.test(c2.auto.reason) && dayDoc().spentUsd === 0.875 && posts().length === 1, "the daily cap: the first order goes ($0.875 of $1), the second would pass the cap so it is held (and the total stays $0.875)");
  const sg = (await adm({ action: "supplier_get" })).json; ok(sg.todayUsd === 0.875 && sg.todayCount === 1 && sg.hasWebhookSecret === true && sg.webhookUrl === "https://x/supplier/fazer/webhook", "the settings screen can show today's automatic spending and the webhook address to give FazerCards");
  setup({ cfg: { dailyCapUsd: 100 } }); put("storeSupplierDay/" + new Date(Date.now()).toISOString().slice(0, 10), { spentUsd: 0, count: 0 });
  /* a bad Player ID format at engine level */
  setup(); put("storeOrders/odd", { kind: "order", code: "T-odd", uid: "u2", itemId: "i60", itemName: "60 UC", playerId: "<b>x</b>", vip: 1, priceUsd: 0.96, status: "processing", createdAt: NOW, events: [] }); const ro = await F("storeAutoFulfill")(env, "odd"); ok(ro.outcome === "manual" && /معرّف اللاعب بصيغة غير مقبولة/.test(ro.reason) && posts().length === 0, "a Player ID in a strange format is never sent");

  /* ---- I) nothing is sent twice ---- */
  setup(); sup.calls.length = 0; put("storeOrders/dbl", { kind: "order", code: "T-dbl", uid: "u2", itemId: "i60", itemName: "60 UC", playerId: "5123456789", vip: 1, priceUsd: 0.96, status: "processing", createdAt: NOW, events: [] });
  const both = await Promise.all([F("storeAutoFulfill")(env, "dbl"), F("storeAutoFulfill")(env, "dbl")]); ok(posts().length === 1 && both.map(x => x.outcome).sort().join() !== "", "two engines racing for the same order: only ONE request reaches FazerCards");
  const again = await F("storeAutoFulfill")(env, "dbl"); ok(posts().length === 1 && again.outcome === "sent", "running it again for an order already sent does nothing");
  ok((await adm({ action: "order_done", id: "dbl" })).status === 200 && ord("dbl").status === "done", "you can still mark it done by hand"); sup.routes["GET /orders/ord-9002"] = { body: { ok: true, order: { id: "ord-9002", status: "completed" } } }; const sp2 = spent("u2");
  r = await hook(ev("ord-9002", "completed")); ok(spent("u2") === sp2 && ord("dbl").status === "done", "and a later 'completed' from FazerCards does not count it a second time");

  /* ---- J) admin buttons ---- */
  setup({ cfg: { enabled: false } }); r = await buy("u2"); id = r.json.order.id; ok(!ord(id).auto, "(with automation off the order waits)");
  ok((await adm({ action: "order_auto_run", id }, "u1")).status === 401 && (await adm({ action: "order_auto_sync", id }, null)).status === 401, "both buttons are admin-only"); r = await adm({ action: "order_auto_run", id: "ghost" }); ok(r.status === 404, "(unknown order)");
  r = await adm({ action: "order_auto_run", id }); ok(r.status === 200 && r.json.outcome === "sent" && r.json.order.auto.state === "sent" && r.json.order.supplierOrderId === "ord-9002" && posts().length === 1, "'run automatically now' works even when the switch is off (you pressed it on purpose) and goes through the same safety checks");
  r = await adm({ action: "order_auto_sync", id }); ok(r.status === 200 && r.json.outcome === "processing", "'check FazerCards' asks for the status (still in progress)");
  sup.routes["GET /orders/ord-9002"] = { body: { ok: true, order: { id: "ord-9002", status: "completed" } } }; r = await adm({ action: "order_auto_sync", id }); ok(r.json.outcome === "done" && r.json.order.status === "done", "…and finishes the order when FazerCards says completed");
  r = await adm({ action: "order_auto_sync", id }); ok(r.json.outcome === "closed", "(an already finished order is left alone)");
  put("storeOrders/np", { kind: "order", code: "T-np", uid: "u2", itemId: "i60", itemName: "x", playerId: "5123456789", vip: 1, priceUsd: 0.96, status: "processing", createdAt: NOW, events: [] }); r = await adm({ action: "order_auto_sync", id: "np" }); ok(r.json.outcome === "no_supplier_order", "an order that was never sent has nothing to check");
  setup({ me: { subscriptionActive: false } }); put("storeOrders/h1", { kind: "order", code: "T-h1", uid: "u2", itemId: "i60", itemName: "x", playerId: "5123456789", vip: 1, priceUsd: 0.96, status: "processing", createdAt: NOW, events: [] }); r = await adm({ action: "order_auto_run", id: "h1" }); ok(r.json.outcome === "manual" && /غير فعّال/.test(r.json.reason) && r.json.order.auto.reason === r.json.reason, "pressing it when a safety check fails tells you which one");
  resetCache(); sup.routes["GET /me"] = okMe(); r = await adm({ action: "order_auto_run", id: "h1" }); ok(r.json.outcome === "sent", "after you fix the problem, pressing it again sends the order");

  /* ---- K) the 5-minute job ---- */
  setup(); sup.routes["POST /topups/order"] = () => ({ body: { ok: true, order: { id: "ord-9400", kind: "topup", status: "processing" } } }); r = await buy("u2"); id = r.json.order.id;
  put("storeOrders/" + id, { ...ord(id), auto: { ...ord(id).auto, at: Date.now() - 5 * 60000 } }); sup.routes["GET /orders/ord-9400"] = { body: { ok: true, order: { id: "ord-9400", status: "completed" } } };
  let sw = await F("storeAutoSweep")(env, Date.now()); ok(sw.synced >= 1 && ord(id).status === "done", "the job asks FazerCards about orders that have been in progress for a while and finishes them (this is the safety net if a webhook is lost)");
  setup(); sup.routes["POST /topups/order"] = () => ({ body: { ok: true, order: { id: "ord-9500", kind: "topup", status: "processing" } } }); r = await buy("u2"); id = r.json.order.id; sup.routes["GET /orders/ord-9500"] = { body: { ok: true, order: { id: "ord-9500", status: "processing" } } };
  put("storeOrders/" + id, { ...ord(id), auto: { ...ord(id).auto, at: Date.now() - 100 * 60000 } }); const pl2 = pushes.length; sw = await F("storeAutoSweep")(env, Date.now()); sw = await F("storeAutoSweep")(env, Date.now());
  ok(pushes.slice(pl2).filter(x => x.type === "store_supplier_issue" && /متأخر عند FazerCards/.test(x.params.reason) && x.params.code === ord(id).code).length === 1 && ord(id).auto.lateAlerted === true && ord(id).status === "processing", "an order stuck for 90+ minutes gets ONE 'late at FazerCards' alert (a second run does not repeat it) and stays untouched");
  /* the master switch controls NEW sending only: an order you sent by hand is still followed up */
  setup({ cfg: { enabled: false } }); sup.routes["POST /topups/order"] = () => ({ body: { ok: true, order: { id: "ord-9600", kind: "topup", status: "processing" } } }); r = await buy("u2"); id = r.json.order.id; ok(!ord(id).auto, "(switch OFF: the new purchase is left alone)");
  const plain = (await buy("u2")).json.order.id; r = await adm({ action: "order_auto_run", id }); ok(r.json.outcome === "sent" && ord(id).auto.state === "sent", "(you send one by hand with the button)");
  put("storeOrders/" + id, { ...ord(id), auto: { ...ord(id).auto, at: Date.now() - 5 * 60000 } }); sup.routes["GET /orders/ord-9600"] = { body: { ok: true, order: { id: "ord-9600", status: "completed" } } }; sup.calls.length = 0;
  sw = await F("storeAutoSweep")(env, Date.now()); ok(ord(id).status === "done" && ord(id).auto.state === "done" && ord(id).costUsd === 0.875 && pushes.some(x => x.type === "store_done" && x.params.code === ord(id).code), "with the switch OFF the 5-minute job still finishes an order that was already sent (no need to press 'check'), and tells the customer");
  ok(posts().length === 0 && !ord(plain).auto && ord(plain).status === "processing", "…but it never starts anything new: the other purchase is untouched and nothing was sent");
  put("storeOrders/" + plain, { ...ord(plain), auto: { state: "manual", reason: "x", at: Date.now() - 600000, tries: 1 } }); sw = await F("storeAutoSweep")(env, Date.now()); ok(posts().length === 0 && ord(plain).auto.state === "manual", "an order held for you is not sent by the job either");
  delete env.FAZER_API_KEY; ok((await F("storeAutoSweep")(env, Date.now())).skipped === true, "with no key the job does nothing"); env.FAZER_API_KEY = KEY; setCfg({});

  /* ---- L) the daily watch on your FazerCards account ---- */
  const watch = async (o) => { setup(o); const p0 = pushes.length; const w = await F("storeSupplierWatch")(env, Date.now()); return { w, msgs: pushes.slice(p0).filter(x => x.uid === ADMIN && x.type === "store_supplier_issue" && x.params.code === "FazerCards").map(x => x.params.reason) }; };
  let w = await watch({}); ok(w.msgs.length === 0, "a healthy account (gold, 20 days left, $11.42): no alerts");
  w = await watch({ me: { subscriptionActive: false } }); ok(w.msgs.length === 1 && /غير فعّال/.test(w.msgs[0]), "inactive subscription: alert");
  w = await watch({ me: { planExpiresAt: iso(NOW + 2 * DAY), planAutoRenew: false } }); ok(w.msgs.some(m => /بينتهي خلال [123] يوم وما فيه تجديد تلقائي/.test(m)), "about to end with no auto-renew: alert");
  w = await watch({ balance: 5.5, me: { planExpiresAt: iso(NOW + 2 * DAY) } }); ok(w.msgs.some(m => /بيتجدد خلال [123] يوم، ورصيدك \(5\.5\$\) أقل من سعر الخطة \(9\.99\$\)/.test(m)), "renewing soon but the balance is below the plan price: alert with both numbers");
  w = await watch({ balance: 3 }); ok(w.msgs.some(m => /رصيدك عند FazerCards منخفض: 3\$/.test(m)), "a low balance (under $5): alert");
  delete env.FAZER_API_KEY; ok((await F("storeSupplierWatch")(env, Date.now())).skipped === true, "without a key it does nothing"); env.FAZER_API_KEY = KEY;
  /* ---- M) which job runs when ---- */
  setup(); put("storeOrders/oldp", { kind: "topup", code: "D-old", uid: "u2", status: "done", createdAt: NOW - 200 * DAY, updatedAt: NOW - 200 * DAY, priceUsd: 5, proof: { ref: "TX", hasImage: true, submittedAt: NOW - 200 * DAY }, events: [] }); put("storeProofs/oldp", { data: PNG, ver: NOW });
  const w5 = []; await W.scheduled({ cron: "*/5 * * * *" }, env, { waitUntil: p => w5.push(p) }); await Promise.all(w5); ok(store.has("storeProofs/oldp"), "the 5-minute trigger only runs the FazerCards follow-up (it does not run the daily clean-up)");
  const wd = []; sup.calls.length = 0; await W.scheduled({ cron: "30 3 * * *" }, env, { waitUntil: p => wd.push(p) }); await Promise.all(wd); ok(!store.has("storeProofs/oldp") && sup.calls.some(x => /\/me$/.test(x.url)), "the daily trigger runs the clean-up and the subscription watch");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
