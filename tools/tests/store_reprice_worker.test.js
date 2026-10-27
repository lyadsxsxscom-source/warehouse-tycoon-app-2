// اختبارات السيرفر: تحديث الأسعار تلقائياً من تكلفة FazerCards (كل ساعة) بنفس الهامش، وحماية القفزات الكبيرة
// التشغيل: node tools/tests/store_reprice_worker.test.js
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
  let r; setup();
  const PR = [11, 10.8, 10.6, 10.5, 10.4, 10.3, 10.2, 10.1, 10.05, 10.31];   // (آخر رقم أكبر من اللي قبله عمداً: لازم يطلع مرتّب نازل)
  const PR2 = [1.1, 1.09, 1.08, 1.07, 1.06, 1.05, 1.04, 1.04, 1.03, 1.03];
  put("storeNodes/rA", { parentId: "", type: "item", name: "A", enabled: true, sort: 20, prices: [...PR], supplier: { provider: "fazercards", categoryId: "catR", offerId: "oA", playerField: "player_id", costUsd: 10 } });
  put("storeNodes/rB", { parentId: "", type: "item", name: "B", enabled: false, sort: 21, prices: [...PR2], supplier: { provider: "fazercards", categoryId: "catR", offerId: "oB", playerField: "player_id", costUsd: 1 } });
  put("storeNodes/rG", { parentId: "", type: "item", name: "GP 10", enabled: true, sort: 22, noPlayer: true, prices: [10.91, 10.8, 10.7, 10.6, 10.5, 10.4, 10.3, 10.2, 10.15, 10.12], card: { provider: "fazercards", categoryId: "gp_us", cardId: "10_usd", name: "10 USD", costUsd: 9.8162 } });
  let cA = 10, cB = 1, cG = 9.8162;
  sup.routes["GET /topups/offers?category_id=catR"] = () => ({ body: { ok: true, category_id: "catR", name: "R", offers: [{ offer_id: "oA", name: "A", price_usd: String(cA) }, { offer_id: "oB", name: "B", price_usd: String(cB) }], fields: [{ key: "player_id" }] } });
  sup.routes["GET /giftcards/cards?category_id=gp_us"] = () => ({ body: { ok: true, offers: [{ card_id: "10_usd", name: "10 USD", price_usd: String(cG), stock: 9 }] } });
  const run = F("storeAutoReprice"), P = id => get("storeNodes/" + id).prices.map(Number), S = id => get("storeNodes/" + id).supplier;

  let x = await run(env); ok(x.changed === 0 && JSON.stringify(P("rA")) === JSON.stringify(PR), "nothing changed at FazerCards: prices stay exactly as they are");

  cA = 10.5; x = await run(env); const a1 = P("rA");
  ok(x.changed >= 1 && S("rA").costUsd === 10.5 && a1[0] === 11.55 && a1[1] === 11.34, "cost up 5%: every VIP price goes up 5% (11 → 11.55, 10.8 → 11.34): same margin");
  ok(a1.every((p, i) => i === 0 || p <= a1[i - 1]), "prices stay ordered (VIP 10 never above VIP 9)");
  ok(a1.every((p, i) => (p - 10.5) / p >= (Math.min(PR[i], i ? PR[i - 1] : 99) - 10) / Math.min(PR[i], i ? PR[i - 1] : 99) - 1e-9), "no level's margin goes down (rounding is upward)");

  cA = 10; x = await run(env); ok(JSON.stringify(P("rA").slice(0, 9)) === JSON.stringify(PR.slice(0, 9)) && S("rA").costUsd === 10, "cost back down: prices come back exactly (no creeping from rounding)");
  for (let i = 0; i < 6; i++) { cA = i % 2 ? 10 : 10.37; await run(env); } ok(JSON.stringify(P("rA").slice(0, 9)) === JSON.stringify(PR.slice(0, 9)), "after many ups and downs the prices still come back exactly");

  cB = 0.95; await run(env); ok(P("rB")[0] === 1.05 && S("rB").costUsd === 0.95, "cost down 5%: price goes down too (1.10 → 1.05), hidden products included");

  cG = 10.1; await run(env); const g = get("storeNodes/rG"); ok(g.card.costUsd === 10.1 && Number(g.prices[0]) === 11.23, "manual gift cards follow their FazerCards cost too");

  /* ---- big jump: held, not applied ---- */
  const before = P("rA"); cA = 13; x = await run(env);
  ok(x.held >= 1 && JSON.stringify(P("rA")) === JSON.stringify(before) && S("rA").costUsd === 10 && S("rA").priceHold.costUsd === 13, "a jump over 20% is NOT applied: prices stay, the item is marked for you to look at");
  r = await adm({ action: "list" }); ok(r.json.nodes.find(n => n.id === "rA").supplier.priceHold.costUsd === 13, "the admin sees the held jump");
  cA = 10; await run(env); ok(!S("rA").priceHold, "if FazerCards goes back, the mark clears by itself");
  cA = 13; await run(env); r = await adm({ action: "reprice_one", id: "rA" }); ok(r.status === 200 && S("rA").costUsd === 13 && P("rA")[0] === 14.3 && !S("rA").priceHold, "the admin button applies it on purpose (11 → 14.30) and clears the mark");

  /* ---- manual price edit becomes the new base ---- */
  r = await adm({ action: "save", id: "rA", name: "A", prices: [15, 14.8, 14.6, 14.4, 14.2, 14, 13.8, 13.6, 13.4, 13.4] }); ok(r.status === 200, "(admin sets prices by hand)");
  cA = 13.65; await run(env); ok(P("rA")[0] === 15.75 && P("rA")[9] === 14.07, "after a hand edit, the next change keeps YOUR new margins (15 → 15.75)");

  /* ---- errors don't break anything ---- */
  sup.routes["GET /topups/offers?category_id=catR"] = { status: 500, body: { ok: false } }; const keep = P("rA"); x = await run(env); ok(x.errors >= 1 && JSON.stringify(P("rA")) === JSON.stringify(keep), "if FazerCards fails, prices are left alone");
  delete env.FAZER_API_KEY; x = await run(env); ok(x.skipped === "no_key", "without the FazerCards key it does nothing");

  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
