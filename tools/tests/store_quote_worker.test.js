// اختبارات السيرفر: منتجات "السعر عند التواصل" (كلاش أوف كلانس): الطلب بدون خصم، الأدمن بيحدد السعر، الزبون بيوافق وبيدفع، الإلغاء والرفض
// التشغيل: node tools/tests/store_quote_worker.test.js
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
  let r, id; setup();
  const setBal = (uid, v) => put("storeCustomers/" + uid, { ...get("storeCustomers/" + uid), balanceUsd: v });
  r = await adm({ action: "save", type: "item", name: "500 جوهرة", prices: [""], quote: true }); ok(r.status === 200, "the admin can add a product with no price when it's 'price on request'");
  const qid = r.json.nodes.find(n => n.name === "500 جوهرة").id; ok(r.json.nodes.find(n => n.id === qid).quote === true, "it is marked as price-on-request");
  r = await adm({ action: "save", type: "item", name: "No price", prices: [""] }); ok(r.status === 400, "a normal product still needs a price");
  const cat = await (await W.fetch(new Request("https://x/store/catalog"), env, { waitUntil() {} })).json(); const flat = []; const walk = a => a.forEach(n => { flat.push(n); if (n.children) walk(n.children); }); walk(cat.items || []);
  ok(flat.some(n => n.id === qid && n.quote === true && n.priceUsd === 0), "the public catalog shows it (no price, marked)");
  r = await callC("/store/prices", {}, "u1"); ok(r.json.prices[qid] === undefined, "no VIP price is given for it");
  r = await callC("/store/quote", { itemId: qid }, "u1"); ok(r.json.quote.quoteMode === true && r.json.quote.enough === true, "the quote says 'price on request'");

  /* ---- request ---- */
  const b0 = bal("u1");
  r = await callC("/store/order", { itemId: qid, reqId: rid(), email: "bad", contactApp: "whatsapp", contact: "+963999" }, "u1"); ok(r.status === 400 && r.json.error === "bad_email", "a bad email is refused");
  r = await callC("/store/order", { itemId: qid, reqId: rid(), email: "a@b.com", contactApp: "sms", contact: "+963999111" }, "u1"); ok(r.status === 400 && r.json.error === "bad_contact", "the app must be WhatsApp or Telegram");
  r = await callC("/store/order", { itemId: qid, reqId: rid(), email: "a@b.com", contactApp: "whatsapp", contact: "abc" }, "u1"); ok(r.status === 400 && r.json.error === "bad_contact", "a WhatsApp number must be a number");
  r = await callC("/store/order", { itemId: qid, reqId: rid(), email: " Me@Gmail.com ", contactApp: "whatsapp", contact: "+963 944 123456", note: "حساب تركي" }, "u1"); id = r.json.order.id;
  ok(r.status === 200 && ord(id).status === "quote_requested" && ord(id).priceUsd === 0 && ord(id).quote.email === "me@gmail.com" && ord(id).quote.app === "whatsapp" && ord(id).quote.note === "حساب تركي" && bal("u1") === b0, "a request is saved (email lower-cased) and NOTHING is taken from the balance");
  ok(r.json.order.quote.email === "me@gmail.com" && r.json.order.quote.paid === false, "the customer sees their request");
  r = await callC("/store/order", { itemId: qid, reqId: rid(), email: "x@y.co", contactApp: "telegram", contact: "@my_user" }, "u1"); ok(r.status === 200, "Telegram with @username works");
  const id2 = r.json.order.id;
  sup.calls.length = 0; ok(!posts().length, "nothing is sent to FazerCards");

  /* ---- accept before price ---- */
  r = await callC("/store/order/accept", { orderId: id, priceUsd: 0 }, "u1"); ok(r.status === 400 && /لسا/.test(r.json.message), "accepting before a price is set is refused");

  /* ---- admin sets price ---- */
  let l = (await adm({ action: "orders_list", status: "waiting" })).json; ok(l.orders.some(o => o.id === id && o.quote.contact === "+963 944 123456"), "the admin sees it in 'waiting' with the contact");
  r = await adm({ action: "quote_price", id, priceUsd: 0 }); ok(r.status === 400, "a zero price is refused");
  r = await adm({ action: "quote_price", id, priceUsd: 5.555 }); ok(r.status === 200 && ord(id).status === "quote_offered" && ord(id).priceUsd === 5.56, "setting the price (rounded to cents) makes it 'offered'");
  const p = pushes.filter(x => x.uid === "u1" && x.type === "store_quote").pop(); ok(p && p.params.price === "5.56", "the customer gets a notification with the price");
  r = await adm({ action: "quote_price", id, priceUsd: 6 }); ok(ord(id).priceUsd === 6, "the admin can change it while waiting");
  r = await callC("/store/order/accept", { orderId: id, priceUsd: 5.56 }, "u1"); ok(r.status === 409 && r.json.error === "price_changed" && bal("u1") === b0, "accepting an old price is refused (the price changed)");
  r = await callC("/store/order/accept", { orderId: id, priceUsd: 6 }, "u2"); ok(r.status === 404, "another customer can't accept it");

  /* ---- not enough balance ---- */
  setBal("u1", 2); r = await callC("/store/order/accept", { orderId: id, priceUsd: 6 }, "u1"); ok(r.status === 400 && r.json.error === "insufficient_balance" && r.json.shortUsd === 4 && ord(id).status === "quote_offered", "not enough balance: refused, says how much is missing");
  setBal("u1", 50); r = await callC("/store/order/accept", { orderId: id, priceUsd: 6 }, "u1");
  ok(r.status === 200 && ord(id).status === "processing" && bal("u1") === 44 && r.json.balanceUsd === 44 && r.json.order.quote.paid === true, "accept: 6$ leaves the balance, the order is now processing");
  r = await callC("/store/order/accept", { orderId: id, priceUsd: 6 }, "u1"); ok(r.status === 400 && bal("u1") === 44, "accepting twice does not pay twice");
  r = await adm({ action: "order_done", id, note: "" }); ok(r.status === 200 && ord(id).status === "done", "the admin completes it as usual");

  /* ---- reject / cancel before paying ---- */
  r = await adm({ action: "order_reject", id: id2, reason: "ما في عرض" }); ok(r.status === 200 && ord(id2).status === "rejected" && bal("u1") === 44, "rejecting an unpaid request returns nothing (nothing was taken)");
  r = await callC("/store/order", { itemId: qid, reqId: rid(), email: "a@b.com", contactApp: "telegram", contact: "+905551112233" }, "u1"); const id3 = r.json.order.id;
  await adm({ action: "quote_price", id: id3, priceUsd: 3 }); r = await callC("/store/order/cancel", { orderId: id3 }, "u1"); ok(r.status === 200 && ord(id3).status === "cancelled" && bal("u1") === 44, "the customer can cancel before paying");
  r = await adm({ action: "quote_price", id: id3, priceUsd: 3 }); ok(r.status === 400, "a cancelled request can't get a price");

  /* ---- paid then rejected: refunded ---- */
  r = await callC("/store/order", { itemId: qid, reqId: rid(), email: "a@b.com", contactApp: "telegram", contact: "@abcd1" }, "u1"); const id4 = r.json.order.id;
  await adm({ action: "quote_price", id: id4, priceUsd: 4 }); await callC("/store/order/accept", { orderId: id4, priceUsd: 4 }, "u1"); ok(bal("u1") === 40, "(paid 4$)");
  r = await adm({ action: "order_reject", id: id4, reason: "تعذّر" }); ok(r.status === 200 && bal("u1") === 44, "rejecting after paying gives the money back");

  /* ---- limit ---- */
  for (let i = 0; i < 5; i++) await callC("/store/order", { itemId: qid, reqId: rid(), email: "a@b.com", contactApp: "telegram", contact: "@abcd" + i }, "u2");
  r = await callC("/store/order", { itemId: qid, reqId: rid(), email: "a@b.com", contactApp: "telegram", contact: "@abcdz" }, "u2"); ok(r.status === 400 && r.json.error === "too_many_open", "at most 5 open price requests per customer");
  r = await adm({ action: "orders_badge" }); ok(r.json.counts.quote_requested >= 5, "the admin badge counts requests waiting for a price");

  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
