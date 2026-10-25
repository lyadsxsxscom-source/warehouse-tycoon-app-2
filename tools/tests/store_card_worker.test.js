// اختبارات السيرفر: البطاقات الإلكترونية (منتجات يدوية بدون Player ID): الطلب، كود البطاقة للزبون، الأدمن، ورابط الذكاء الاصطناعي
// التشغيل: node tools/tests/store_card_worker.test.js
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
  put("storeNodes/iGP", { parentId: "", type: "item", name: "Google Play 10$", enabled: true, sort: 4, prices: P10([10.92, 10.8, 10.7, 10.6, 10.5, 10.4, 10.3, 10.2, 10.15, 10.14]), noPlayer: true, card: { provider: "fazercards", categoryId: "google_play_us", cardId: "10_usd", name: "10 USD", costUsd: 9.8324 } });
  setup();

  /* ---- A) quote and public catalog ---- */
  r = await callC("/store/quote", { itemId: "iGP" }, "u1"); ok(r.status === 200 && r.json.quote.noPlayer === true && r.json.quote.zone === false, "the quote of a gift card says no Player ID is needed");
  r = await callC("/store/quote", { itemId: "i60" }, "u1"); ok(r.json.quote.noPlayer === false, "a normal product still needs the Player ID");
  r = await callC("/store/validate-id", { itemId: "iGP", playerId: "12345" }, "u1"); ok(r.status === 200 && r.json.supported === false, "no ID check for a gift card");

  /* ---- B) ordering a card: no Player ID, balance taken, never auto-sent ---- */
  const b0 = bal("u1"); sup.calls.length = 0;
  r = await callC("/store/order", { itemId: "iGP", reqId: rid() }, "u1"); id = r.json.order.id;
  ok(r.status === 200 && ord(id).playerId === "" && ord(id).noPlayer === true && r.json.order.noPlayer === true && bal("u1") === Math.round((b0 - 10.92) * 10000) / 10000, "a gift card is bought without a Player ID and the price leaves the balance");
  ok(!posts().length && ord(id).status === "processing" && !ord(id).auto, "it is never sent to FazerCards automatically (manual)");
  r = await callC("/store/order", { itemId: "iGP", playerId: "junk<b>", reqId: rid() }, "u1"); ok(r.status === 200 && ord(r.json.order.id).playerId === "", "a stray Player ID sent by a tampered page is ignored");
  const id2 = r.json.order.id;

  /* ---- C) the admin delivers the code ---- */
  let av = (await adm({ action: "orders_list" })).json.orders.find(x => x.id === id); ok(av.noPlayer === true && av.delivery === "", "the admin sees it is a gift card and no code is out yet");
  let mine = (await callC("/store/orders", {}, "u1")).json.orders.find(x => x.id === id); ok(mine.delivery === "", "before it is done the customer sees no code");
  r = await adm({ action: "order_done", id, note: "", delivery: "  ABCD-EFGH-1234<script>  " }); ok(r.status === 200 && ord(id).status === "done" && ord(id).delivery === "ABCD-EFGH-1234script", "done with a code: the code is stored (trimmed, with markup symbols removed)");
  mine = (await callC("/store/orders", {}, "u1")).json.orders.find(x => x.id === id); ok(mine.delivery === "ABCD-EFGH-1234script", "the customer sees his code in 'My orders'");
  const other = (await callC("/store/orders", {}, "u2")).json.orders; ok(!other.some(x => x.delivery), "another customer never sees it");
  const p = pushes.filter(x => x.uid === "u1" && x.type === "store_done").pop(); ok(p && p.params.card === true && !JSON.stringify(p.params).includes("ABCD"), "the notification says the code is ready, without putting the code in the notification");
  ok(/طلباتي/.test(PUSH_TEXT.store_done.ar(p.params)[1]), "(Arabic text points to 'My orders')");
  r = await adm({ action: "order_done", id: id2, note: "", delivery: "   " }); ok(r.status === 400 && ord(id2).status === "processing", "an empty code is refused");
  put("storeOrders/tp1", { kind: "topup", code: "D-1", uid: "u1", status: "payment_submitted", priceUsd: 5, createdAt: NOW, updatedAt: NOW, events: [] });
  r = await adm({ action: "order_done", id: "tp1", delivery: "X" }); ok(r.status === 400 && get("storeOrders/tp1").status === "payment_submitted", "a code can only go on a purchase, not on a deposit");
  r = await adm({ action: "order_reject", id: id2, reason: "ما في مخزون" }); ok(r.status === 200 && ord(id2).status === "rejected", "a card order can be rejected (refund as usual)");

  /* ---- D) the AI link can add manual gift cards ---- */
  setCfg({ minMarginPct: 3 }); const aiTool = F("aiTool"), doc = { creates: 0 };
  sup.routes["GET /giftcards/cards?category_id=google_play_us"] = { body: { ok: true, offers: [{ card_id: "5_usd", name: "5 USD", price_usd: "4.9162", stock: 10 }, { card_id: "10_usd", name: "10 USD", price_usd: "9.8324", stock: 10 }] } };
  put("storeNodes/fGP", { parentId: "", type: "folder", name: "Google Play", enabled: false, sort: 9, ai: true });
  let x = await aiTool(env, doc, "fazercards_offers", { categoryId: "google_play_us", section: "giftcards" }); ok(x.manual === true && x.offers.length === 2 && x.offers[1].offerId === "10_usd" && x.offers[1].priceUsd === 9.8324, "the AI link reads gift-card prices");
  x = await aiTool(env, doc, "create_items", { section: "giftcards", parentId: "fGP", m1: 10, m10: 3, items: [{ name: "5$", categoryId: "google_play_us", offerId: "5_usd" }, { name: "10$", categoryId: "google_play_us", offerId: "10_usd" }] });
  const n5 = get("storeNodes/" + x.created[0].id); ok(x.created.length === 2 && x.manual === true && n5.noPlayer === true && n5.card.cardId === "5_usd" && !n5.supplier && n5.enabled === false && n5.prices.length === 10, "it creates hidden manual products: no Player ID, card info kept for the admin, no automatic link");
  x = await aiTool(env, doc, "create_items", { section: "giftcards", parentId: "fGP", m1: 10, m10: 3, items: [{ name: "5$", categoryId: "google_play_us", offerId: "5_usd" }] }); ok(x.created.length === 0 && x.skipped.length === 1, "adding the same card twice is skipped");
  let th = null; try { await aiTool(env, doc, "create_items", { section: "giftcards", parentId: "fGP", m1: 10, m10: 3, items: [{ name: "7$", categoryId: "google_play_us", offerId: "7_usd" }] }); } catch (e) { th = e; } ok(th && th.code === "no_offer", "an unknown card is refused");
  const lc = await aiTool(env, doc, "list_catalog", { parentId: "fGP" }); ok(lc.children.every(c => c.manualCard === true && c.costUsd > 0), "the catalog list shows them as manual cards with their cost");

  /* ---- E) admin can mark any product as a card ---- */
  r = await adm({ action: "save", id: "iPlain", name: "Manual item", prices: [2], noPlayer: true }); ok(r.status === 200 && get("storeNodes/iPlain").noPlayer === true, "the admin can turn a product into a gift card (no Player ID)");
  r = await adm({ action: "save", id: "iPlain", name: "Manual item", prices: [2] }); ok(get("storeNodes/iPlain").noPlayer === true, "saving without the box leaves it as it was");
  r = await adm({ action: "save", id: "iPlain", name: "Manual item", prices: [2], noPlayer: false }); ok(get("storeNodes/iPlain").noPlayer === false, "and back");

  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
