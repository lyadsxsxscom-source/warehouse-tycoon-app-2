// اختبارات السيرفر: بوت المتجر على تلغرام وقناته (ربط الحساب، الإشعارات، النشر بالقناة، أزرار البوت)
// التشغيل: node tools/tests/store_tgbot_worker.test.js
const vm = require("vm"), fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
function load(extra) {
  const src = fs.readFileSync(path.join(__dirname, "../../worker/worker.js"), "utf8").replace("export default {", "const __worker = {");
  const ctx = vm.createContext({ console, Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout, Math, Date, JSON, Object, Array, Number, String, Promise, Error, Map, Set, Uint8Array, atob, btoa, fetch: () => { throw new Error("no net"); }, ...extra });
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
  const TOKEN = "123:ABCDEF"; env.STORE_BOT_TOKEN = TOKEN;
  const tg = []; const realFetch = globalThis.fetch;
  const tgMock = async (url, init) => { const u = String(url); if (u.startsWith("https://api.telegram.org/")) { const m = u.split("/bot" + TOKEN + "/")[1]; const body = JSON.parse(init.body || "{}"); tg.push({ m, body }); if (m === "getMe") return new Response(JSON.stringify({ ok: true, result: { username: "YardovaCardBot", id: 9 } })); if (m === "getWebhookInfo") return new Response(JSON.stringify({ ok: true, result: { url: "https://x/store/telegram/webhook" } })); return new Response(JSON.stringify({ ok: true, result: {} })); } return realFetch ? realFetch(url, init) : new Response("{}"); };
  const withTg = (fn) => async (...a) => { const old = c.fetch; c.fetch = tgMock; try { return await fn(...a); } finally { c.fetch = old; } };
  c.fetch = tgMock;
  const sign = async (obj) => { const p = new URLSearchParams(obj); const data = [...p.entries()].map(([k, v]) => k + "=" + v).sort().join("\n");
    const sk = await crypto.subtle.importKey("raw", new TextEncoder().encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const secret = await crypto.subtle.sign("HMAC", sk, new TextEncoder().encode(TOKEN));
    const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
    p.set("hash", [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("")); return p.toString(); };
  const initOk = await sign({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 555, first_name: "إبراهيم" }), query_id: "q1" });

  /* ---- A) ربط الحساب من جوا تلغرام ---- */
  r = await callC("/store/tg/link", { initData: initOk }, "u1");
  ok(r.status === 200 && get("storeCustomers/u1").tgChatId === "555", "opening the store inside Telegram links the account to that chat");
  r = await callC("/store/tg/link", { initData: initOk.replace(/hash=[a-f0-9]+/, "hash=" + "0".repeat(64)) }, "u2");
  ok(r.status === 400 && !get("storeCustomers/u2").tgChatId, "a forged signature is refused");
  const old = await sign({ auth_date: String(Math.floor(Date.now() / 1000) - 200000), user: JSON.stringify({ id: 777, first_name: "X" }) });
  r = await callC("/store/tg/link", { initData: old }, "u2"); ok(r.status === 400, "an old signature is refused");
  const init2 = await sign({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 555, first_name: "إبراهيم" }), query_id: "q2" });
  r = await callC("/store/tg/link", { initData: init2 }, "u2");
  ok(r.status === 200 && get("storeCustomers/u2").tgChatId === "555" && !get("storeCustomers/u1").tgChatId, "the same Telegram account moves to the newest customer (never two accounts on one chat)");
  await callC("/store/tg/link", { initData: initOk }, "u1");

  /* ---- A2) الدخول جوا تلغرام ---- */
  c.tgMintCustomToken = async (env2, uid, claims) => "TOKEN:" + uid + ":" + (claims && claims.tgName || "");
  const sess = (init) => W.fetch(new Request("https://x/store/tg/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: init }) }), env, {});
  let sr = await sess(initOk); let sj = await sr.json();
  ok(sr.status === 200 && sj.customToken === "TOKEN:u1:إبراهيم", "inside Telegram the customer signs in to HIS OWN account (the one already linked), not a new one");
  sr = await sess("hash=" + "0".repeat(64)); ok(sr.status === 400, "a forged signature gets no session");
  const fresh = await sign({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 4242, first_name: "زبون" }) });
  sj = await (await sess(fresh)).json(); ok(sj.ok && sj.customToken === "TOKEN:tg_4242:زبون", "a new Telegram customer gets an account of his own");

  /* ---- B) إشعار الزبون ---- */
  tg.length = 0; await F("storeNotify")(env, "u1", "store_done", { code: "Y-5", item: "660 شدة" });
  const n1 = tg.find(x => x.m === "sendMessage");
  ok(n1 && String(n1.body.chat_id) === "555" && /تم تنفيذ طلبك Y-5/.test(n1.body.text) && /660 شدة/.test(n1.body.text), "when an order is done the customer gets a Telegram message");
  ok(n1.body.reply_markup.inline_keyboard[0][0].web_app.url === "https://yardova.ly-ad.de/store/", "the message carries the 'open store' button (the store itself, not a second store)");
  tg.length = 0; await F("storeNotify")(env, "u1", "store_quote", { code: "T-9", item: "500 جوهرة", price: "6.00" });
  ok(/سعر طلبك T-9 جاهز: 6.00\$/.test(tg[0].body.text), "and when you set a price for a contact order");
  tg.length = 0; await F("storeNotify")(env, "u2", "store_done", { code: "Y-6", item: "x" }); ok(!tg.length, "a customer who never opened Telegram gets nothing (no error)");

  /* ---- C) النشر بالقناة ---- */
  const o = { kind: "order", code: "Y-7", uid: "u1", itemName: "100 ماسة", createdAt: Date.now() - 5 * 60000 };
  tg.length = 0; await F("stPostOrderToChannel")(env, o); ok(!tg.length, "nothing is posted while auto-posting is off");
  r = await adm({ action: "tg_save", channel: "@YardovaCard", autoPost: true }); ok(r.status === 200 && r.json.channel === "@YardovaCard" && r.json.autoPost === true, "the admin saves the channel and turns posting on");
  r = await adm({ action: "tg_save", channel: "YardovaCard" }); ok(r.status === 400, "a channel name without @ is refused");
  tg.length = 0; await F("stPostOrderToChannel")(env, o);
  const post = tg.find(x => x.m === "sendMessage");
  ok(post && post.body.chat_id === "@YardovaCard" && /طلب تنفّذ/.test(post.body.text) && /100 ماسة/.test(post.body.text) && /5 دقيقة/.test(post.body.text), "a completed order is posted with the product and how long it took");
  ok(!/u1|555|@|إبراهيم/.test(post.body.text.replace("@YardovaCard", "")), "the post never shows anything about the customer");

  /* ---- D) أزرار البوت ---- */
  const tgHook = async (update) => W.fetch(new Request("https://x/store/telegram/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": await c.hmacHex(TOKEN, "yardova:store:webhook") }, body: JSON.stringify(update) }), env, {});
  tg.length = 0; let res = await tgHook({ message: { chat: { id: 555, type: "private" }, from: { id: 555, first_name: "إ" }, text: "/start" } });
  ok(res.status === 200 && /Yardova Card/.test(tg[0].body.text) && tg[0].body.reply_markup.inline_keyboard[0][0].web_app, "/start sends the welcome with the store button");
  tg.length = 0; await tgHook({ callback_query: { id: "1", data: "bal", message: { chat: { id: 555 } } } });
  ok(tg.some(x => x.m === "answerCallbackQuery") && /رصيدك/.test((tg.find(x => x.m === "sendMessage") || {}).body.text || ""), "'my balance' answers with the balance");
  tg.length = 0; await tgHook({ callback_query: { id: "2", data: "ord", message: { chat: { id: 999 } } } });
  ok(/ما قدرنا نعرف حسابك/.test(tg.find(x => x.m === "sendMessage").body.text), "an unknown chat is told to open the store and sign in once");
  const bad = await W.fetch(new Request("https://x/store/telegram/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "wrong" }, body: "{}" }), env, {});
  ok(bad.status === 401, "a webhook call without the right secret is refused");

  /* ---- E) بدون توكن: المتجر بيضل شغال ---- */
  delete env.STORE_BOT_TOKEN; tg.length = 0;
  await F("storeNotify")(env, "u1", "store_done", { code: "Y-8", item: "x" }); await F("stPostOrderToChannel")(env, o);
  ok(!tg.length, "with no bot token nothing is sent and nothing breaks");
  r = await adm({ action: "tg_status" }); ok(r.status === 200 && r.json.hasBot === false, "the admin is told the token is missing");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
