// اختبارات السيرفر: ربط FazerCards (7أ، قراءة فقط): إعدادات، فحص الاتصال، أقسام وخيارات، ربط المنتجات، والمفتاح ما بيتسرّب
// التشغيل: node tools/tests/store_supplier_worker.test.js
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
  const KEY = "SECRET-KEY-abc123";
  const sup = { calls: [], routes: {}, fail: null };
  c.fetch = async (url, opts) => {
    sup.calls.push({ url: String(url), method: opts && opts.method, headers: (opts && opts.headers) || {}, body: opts && opts.body });
    if (sup.fail === "network") throw new Error("boom");
    const path = String(url).replace("https://api.fzr.cards/api/v2", ""); const key = path.split("?")[0];
    const r = sup.routes[(opts && opts.method || "GET") + " " + key] || sup.routes[path] || sup.routes[key];
    if (!r) return { ok: false, status: 404, json: async () => ({ ok: false, error: "not found" }) };
    if (r.badJson) return { ok: true, status: 200, json: async () => { throw new Error("bad json"); } };
    return { ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.body };
  };
  const ENV = env; const keyOff = () => { delete ENV.FAZER_API_KEY; }, keyOn = () => { ENV.FAZER_API_KEY = KEY; };
  keyOff();
  let r;

  /* ---- A) admin only ---- */
  for (const a of ["supplier_get", "supplier_save", "supplier_status", "supplier_categories", "supplier_offers", "supplier_link"]) { r = await adm({ action: a }, "u1"); ok(r.status === 401, a + " is admin-only"); r = await adm({ action: a }, null); ok(r.status === 401, a + " needs sign-in"); }

  /* ---- B) the settings ---- */
  r = await adm({ action: "supplier_get" }); ok(r.status === 200 && r.json.hasKey === false && r.json.configured === false && r.json.cfg.enabled === false && r.json.cfg.minMarginPct === 5 && r.json.cfg.dailyCapUsd === 100 && r.json.updatedAt === 0, "defaults are your decisions: automatic execution OFF, 5% minimum margin, $100 a day; and it says no key is set yet");
  keyOn(); r = await adm({ action: "supplier_get" }); ok(r.json.hasKey === true && !JSON.stringify(r.json).includes(KEY), "with the key set it only says 'a key exists' (the key itself is never returned)");
  for (const [patch, label] of [[{ minMarginPct: -1 }, "negative margin"], [{ minMarginPct: 95 }, "margin above 90%"], [{ minMarginPct: "x" }, "text margin"], [{ dailyCapUsd: 0 }, "a cap of 0"], [{ dailyCapUsd: -5 }, "negative cap"], [{ dailyCapUsd: 1e7 }, "a huge cap"], [{ dailyCapUsd: "abc" }, "text cap"]]) { r = await adm({ action: "supplier_save", cfg: { enabled: true, minMarginPct: 5, dailyCapUsd: 100, ...patch } }); ok(r.status === 400 && r.json.error === "bad_supplier", "refused: " + label); }
  r = await adm({ action: "supplier_save", cfg: { enabled: "true", minMarginPct: 7.456, dailyCapUsd: 250.5 } }); ok(r.status === 200 && r.json.cfg.enabled === false && r.json.cfg.minMarginPct === 7.46 && r.json.cfg.dailyCapUsd === 250.5 && r.json.configured === true, "saved (amounts rounded to cents); only a real 'true' turns automation on, the text 'true' does not");
  r = await adm({ action: "supplier_save", cfg: { enabled: true, minMarginPct: 5, dailyCapUsd: 100 } }); r = await adm({ action: "supplier_get" }); ok(r.json.cfg.enabled === true && r.json.cfg.minMarginPct === 5 && r.json.cfg.dailyCapUsd === 100 && r.json.configured === true && r.json.updatedAt > 0, "saved and read back");

  /* ---- C) checking the connection ---- */
  keyOff(); r = await adm({ action: "supplier_status" }); ok(r.status === 400 && r.json.error === "no_key" && /FAZER_API_KEY/.test(r.json.message) && sup.calls.length === 0, "without a key it says how to add it and calls nobody");
  keyOn(); sup.routes["/me"] = { body: { ok: true, login: "partner1", email: "secret@x.com", plan: "gold", planExpiresAt: "2026-10-24T09:33:00.000Z", planAutoRenew: true, subscriptionActive: true, summary: { totalSpent: "9" } } }; sup.routes["/balance"] = { body: { ok: true, balance: "6.6200", currency: "USD" } };
  r = await adm({ action: "supplier_status" }); const st = r.json.status;
  ok(r.status === 200 && st.login === "partner1" && st.plan === "gold" && st.planExpiresAt === "2026-10-24T09:33:00.000Z" && st.planAutoRenew === true && st.subscriptionActive === true && st.balanceUsd === 6.62 && st.currency === "USD" && !("email" in st), "status: your login, plan, expiry date, whether it renews, whether the subscription is active, and the balance as a number (6.62)");
  const c0 = sup.calls[sup.calls.length - 2]; ok(sup.calls.slice(-2).map(x => x.url).join() === "https://api.fzr.cards/api/v2/me,https://api.fzr.cards/api/v2/balance" && sup.calls.slice(-2).every(x => x.headers["X-API-Key"] === KEY && x.method === "GET"), "it called only FazerCards' /me and /balance, with the key in the X-API-Key header");
  sup.routes["/me"].body = { ok: true, login: "p", plan: "none", subscriptionActive: false }; r = await adm({ action: "supplier_status" }); ok(r.json.status.subscriptionActive === false && r.json.status.planAutoRenew === false, "an inactive subscription is reported as inactive");
  sup.routes["/balance"] = { body: { ok: true, balance: "abc" } }; r = await adm({ action: "supplier_status" }); ok(r.json.status.balanceUsd === null, "a balance that is not a number comes back as 'unknown', never as 0");
  sup.routes["/balance"] = { body: { ok: true, balance: "6.6200", currency: "USD" } };
  for (const [st2, re, label] of [[401, /المفتاح غير صالح/, "401"], [403, /ما في اشتراك فعّال|غير مفعّلة بخطتك/, "403"], [429, /طلبات كتير/, "429"], [500, /خطأ 500/, "500"]]) { sup.routes["/me"] = { status: st2, body: { ok: false, error: "" } }; r = await adm({ action: "supplier_status" }); ok(r.status === 502 && r.json.error === "supplier_error" && re.test(r.json.message), "an answer of " + label + " is explained in plain words"); }
  sup.routes["/me"] = { status: 400, body: { ok: false, error: "<b>bad</b> thing happened " + KEY } }; r = await adm({ action: "supplier_status" }); ok(r.status === 502 && !/[<>]/.test(r.json.message) && /FazerCards: bad thing happened/.test(r.json.message), "the supplier's own message is shown cleaned of HTML");
  sup.routes["/me"] = { badJson: true }; r = await adm({ action: "supplier_status" }); ok(r.status === 200 || r.status === 502, "an unreadable answer does not crash it");
  sup.fail = "network"; r = await adm({ action: "supplier_status" }); sup.fail = null; ok(r.status === 502 && r.json.error === "supplier_unreachable", "a network failure says FazerCards could not be reached");
  sup.routes["/me"] = { body: { ok: true, login: "partner1", plan: "gold", subscriptionActive: true } };

  /* ---- D) categories and offers ---- */
  sup.routes["/topups?limit=100"] = { body: { ok: true, items: [{ category_id: "cat_pubgm_1", name: "PUBG Mobile" }, { category_id: "cat_ff", name: "<i>Free Fire</i>" }, { category_id: "bad id!", name: "x" }], meta: { has_more: true, next_cursor: "C2" } } };
  sup.routes["/topups?limit=100&cursor=C2"] = { body: { ok: true, items: [{ category_id: "cat_mlbb", name: "Mobile Legends" }], meta: { has_more: false, next_cursor: null } } };
  const n0 = sup.calls.length; r = await adm({ action: "supplier_categories" });
  ok(r.status === 200 && r.json.categories.map(x => x.categoryId).join() === "cat_pubgm_1,cat_ff,cat_mlbb" && r.json.categories[1].name === "Free Fire" && sup.calls.length === n0 + 2, "categories: it follows the pages, drops an invalid id, and cleans names");
  r = await adm({ action: "supplier_categories", q: "pubg" }); ok(r.json.categories.length === 1 && r.json.categories[0].categoryId === "cat_pubgm_1", "search by name (not case sensitive)");
  r = await adm({ action: "supplier_categories", q: "nothing" }); ok(r.json.categories.length === 0, "no match gives an empty list");
  sup.routes["/topups/offers?category_id=cat_pubgm_1"] = { body: { ok: true, category_id: "cat_pubgm_1", name: "PUBG Mobile", offers: [{ offer_id: "offer_60uc", name: "60 UC", price_usd: "0.8800" }, { offer_id: "offer_660uc", name: "660 UC", price_usd: "8.7600" }, { offer_id: "bad id", name: "x", price_usd: "1" }, { offer_id: "no_price", name: "x", price_usd: "abc" }], fields: [{ key: "player_id", label: "Player ID", type: "text" }] } };
  r = await adm({ action: "supplier_offers", categoryId: "cat_pubgm_1" }); ok(r.status === 200 && r.json.name === "PUBG Mobile" && r.json.offers.length === 2 && r.json.offers[1].offerId === "offer_660uc" && r.json.offers[1].priceUsd === 8.76 && r.json.fields[0].key === "player_id", "offers: id, name and price as a number; invalid ones are dropped; the buyer field (player_id) is reported");
  ok(sup.calls[sup.calls.length - 1].url === "https://api.fzr.cards/api/v2/topups/offers?category_id=cat_pubgm_1", "(the category id is sent encoded)");
  r = await adm({ action: "supplier_offers", categoryId: "bad id" }); ok(r.status === 400, "a bad category id is refused without calling anybody"); r = await adm({ action: "supplier_offers" }); ok(r.status === 400, "(and a missing one)");
  sup.routes["/topups/offers?category_id=gone"] = { status: 404, body: { ok: false, error: "category not found" } }; r = await adm({ action: "supplier_offers", categoryId: "gone" }); ok(r.status === 502 && /category not found/.test(r.json.message), "an unknown category from the supplier is shown");

  /* ---- E) linking products ---- */
  put("storeNodes/nP", { parentId: "", type: "folder", name: "PUBG", enabled: true, sort: 1 });
  put("storeNodes/i660", { parentId: "nP", type: "item", name: "660 UC", enabled: true, sort: 1, prices: P10([10.18, 10, 9.9, 9.8, 9.7, 9.6, 9.5, 9.4, 9.3, 9.26]) });
  put("storeNodes/i60", { parentId: "nP", type: "item", name: "60 UC", enabled: true, sort: 2, prices: P10([1.05]) });
  const link = (id, l, tk = "admin") => adm({ action: "supplier_link", id, link: l }, tk);
  r = await adm({ action: "list" }); ok(r.json.nodes.find(x => x.id === "i660").supplier === null && r.json.nodes.find(x => x.id === "nP").supplier === null, "before linking, items and folders show no link");
  r = await link("i660", { categoryId: "cat_pubgm_1", offerId: "offer_660uc", offerName: "<b>660 UC</b>", costUsd: 8.7600001 });
  const lk = r.json.nodes.find(x => x.id === "i660").supplier; ok(r.status === 200 && lk.provider === "fazercards" && lk.categoryId === "cat_pubgm_1" && lk.offerId === "offer_660uc" && lk.playerField === "player_id" && lk.offerName === "660 UC" && lk.costUsd === 8.76, "a product is linked to a FazerCards offer (the ID field defaults to player_id; the name is cleaned; the cost seen at that moment is kept)");
  ok(r.json.nodes.find(x => x.id === "i60").supplier === null, "other products are untouched");
  r = await adm({ action: "save", id: "i660", name: "660 UC edited", prices: [10.18, 10], enabled: true }); ok(r.status === 200 && r.json.nodes.find(x => x.id === "i660").supplier.offerId === "offer_660uc" && r.json.nodes.find(x => x.id === "i660").name === "660 UC edited", "editing the product (name, prices, visibility) NEVER removes the link");
  const pub = await (await W.fetch(new Request("https://x/store/catalog"), env, { waitUntil: p => p })).json(); ok(!JSON.stringify(pub).includes("fazercards") && !JSON.stringify(pub).includes("offer_660uc") && !JSON.stringify(pub).includes("cat_pubgm_1"), "the public catalog never shows the link, the offer or the supplier");
  for (const [l, label] of [[{ categoryId: "", offerId: "x" }, "no category"], [{ categoryId: "cat_x", offerId: "" }, "no offer"], [{ categoryId: "bad id", offerId: "x" }, "an invalid category id"], [{ categoryId: "c", offerId: "o", playerField: "Player ID!" }, "an invalid field name"], ["text", "text instead of an object"], [123, "a number"]]) { r = await link("i660", l); ok(r.status === 400 && r.json.error === "bad_supplier_link", "refused link: " + label); }
  ok((await adm({ action: "list" })).json.nodes.find(x => x.id === "i660").supplier.offerId === "offer_660uc", "a refused link changes nothing");
  r = await link("nP", { categoryId: "c", offerId: "o" }); ok(r.status === 400, "a folder cannot be linked"); r = await link("ghost", { categoryId: "c", offerId: "o" }); ok(r.status === 404, "an unknown product is a 404"); ok((await link("i660", { categoryId: "c", offerId: "o" }, "u1")).status === 401, "only the admin can link");
  r = await link("i660", { categoryId: "cat_pubgm_1", offerId: "offer_660uc", playerField: "uid" }); ok(r.json.nodes.find(x => x.id === "i660").supplier.playerField === "uid" && r.json.nodes.find(x => x.id === "i660").supplier.costUsd === 0, "the link can be changed (another field name; no cost given means 0)");
  r = await link("i660", null); ok(r.status === 200 && r.json.nodes.find(x => x.id === "i660").supplier === null, "unlinking removes it");

  /* ---- E2) the games FazerCards can check an ID for ---- */
  const resetVal = () => vm.runInContext("FZR_VALIDATORS = { at: 0, items: [] }", c);
  sup.routes["GET /topups/validate-id"] = { body: { ok: true, items: [{ category_id: "pubg_mobile", name: "PUBG Mobile", fields: [{ key: "player_id", label: "Player ID", type: "text" }] }, { category_id: "free_fire", name: "<b>Free Fire</b>", fields: [{ key: "uid", label: "UID", type: "text" }] }, { category_id: "bad id!", name: "x", fields: [] }] } };
  resetVal(); const nv0 = sup.calls.length; r = await adm({ action: "supplier_validators" });
  ok(r.status === 200 && r.json.validators.map(v => v.categoryId + ":" + v.name).join() === "pubg_mobile:PUBG Mobile,free_fire:Free Fire", "the list of games that support ID checking (invalid ids dropped, names cleaned)");
  r = await adm({ action: "supplier_validators" }); ok(sup.calls.length === nv0 + 1, "it is remembered for 10 minutes (the second request did not call FazerCards)");
  ok((await adm({ action: "supplier_validators" }, "u1")).status === 401, "admin-only");
  link2 = null;
  r = await adm({ action: "supplier_link", id: "i660", link: { categoryId: "cat_pubgm_1", offerId: "offer_660uc", categoryName: "<b>PUBG Mobile</b>", validateCategoryId: "pubg_mobile", costUsd: 8.76 } });
  ok(r.json.nodes.find(x => x.id === "i660").supplier.categoryName === "PUBG Mobile" && r.json.nodes.find(x => x.id === "i660").supplier.validateCategoryId === "pubg_mobile", "a link can also keep the game's name and the ID-check category");
  r = await adm({ action: "supplier_link", id: "i660", link: { categoryId: "cat_pubgm_1", offerId: "offer_660uc", validateCategoryId: "bad id!" } }); ok(r.status === 400 && r.json.error === "bad_supplier_link", "an invalid ID-check category is refused");

  /* ---- E3) a customer checks his Player ID before buying ---- */
  const vid = (itemId, playerId, tk = "u1") => callApi("/store/validate-id", { itemId, playerId }, tk);
  put("storeNodes/iFree", { parentId: "nP", type: "item", name: "Free diamonds", enabled: true, sort: 3, prices: P10([1]), supplier: { provider: "fazercards", categoryId: "cat_ff", offerId: "o_ff", playerField: "player_id", categoryName: "Free Fire", validateCategoryId: "", offerName: "d", costUsd: 0.5 } });
  put("storeNodes/iNoMatch", { parentId: "nP", type: "item", name: "Other game", enabled: true, sort: 4, prices: P10([1]), supplier: { provider: "fazercards", categoryId: "cat_x", offerId: "o_x", playerField: "player_id", categoryName: "Unknown Game", validateCategoryId: "", offerName: "d", costUsd: 0.5 } });
  put("storeNodes/iHidden", { parentId: "nP", type: "item", name: "hidden", enabled: false, sort: 5, prices: P10([1]), supplier: { provider: "fazercards", categoryId: "c", offerId: "o", playerField: "player_id", categoryName: "PUBG Mobile", validateCategoryId: "", offerName: "d", costUsd: 0.5 } });
  r = await callApi("/store/validate-id", { itemId: "i660", playerId: "123456789" }, null); ok(r.status === 401, "checking an ID needs a sign-in");
  r = await vid("ghost", "123456789"); ok(r.status === 404 && r.json.error === "no_item", "an unknown product is a 404"); r = await vid("iHidden", "123456789"); ok(r.status === 404, "so is a hidden one");
  const beforeUnlinked = sup.calls.length; r = await vid("i60", "123456789"); ok(r.status === 200 && r.json.supported === false && Object.keys(r.json).sort().join() === "ok,supported" && sup.calls.length === beforeUnlinked, "a product that is not linked: 'not supported' and FazerCards is not called (buying works as normal)");
  for (const [pid, label] of [["12", "too short"], ["", "empty"], ["<b>1234</b>", "HTML"], ["a".repeat(41), "too long"], ["12\n345", "a line break"]]) { const n = sup.calls.length; r = await vid("i660", pid); ok(r.status === 400 && r.json.error === "bad_player" && sup.calls.length === n, "refused Player ID: " + label + " (nobody is called)"); }
  sup.routes["POST /topups/validate-id"] = { body: { ok: true, category_id: "pubg_mobile", valid: true, player_name: "<i>Player Nick</i>", region: "EU" } };
  const nA = sup.calls.length; r = await vid("i660", "5123456789");
  ok(r.status === 200 && r.json.supported === true && r.json.available === true && r.json.valid === true && r.json.playerName === "Player Nick" && r.json.region === "EU" && Object.keys(r.json).sort().join() === "available,ok,playerName,region,supported,valid", "a valid ID: the player's name and region (cleaned), and nothing else");
  const post = sup.calls.slice(nA).find(x => x.method === "POST"); ok(post.url === "https://api.fzr.cards/api/v2/topups/validate-id" && post.headers["X-API-Key"] === KEY && JSON.parse(post.body).category_id === "pubg_mobile" && JSON.parse(post.body).fields.player_id === "5123456789", "what was sent: the ID-check category and the ID in the field the game expects, with the key in the header");
  sup.routes["POST /topups/validate-id"].body = { ok: true, valid: false }; r = await vid("i660", "5123456789"); ok(r.json.valid === false && r.json.playerName === "" && r.json.available === true, "an ID that does not exist: valid false");
  const nB = sup.calls.length; r = await vid("i660", "5123456789"); ok(sup.calls.slice(nB).filter(x => x.method === "GET").length === 0, "the list of supported games is not fetched again (remembered)");
  sup.routes["POST /topups/validate-id"].body = { ok: true, valid: true, player_name: "FF Player" }; const nC = sup.calls.length; r = await vid("iFree", "9988776655");
  ok(r.json.valid === true && r.json.playerName === "FF Player" && JSON.parse(sup.calls.slice(nC).find(x => x.method === "POST").body).category_id === "free_fire" && JSON.parse(sup.calls.slice(nC).find(x => x.method === "POST").body).fields.uid === "9988776655", "a game matched by NAME: and if the saved field name does not exist for that game, its own first field (uid) is used");
  /* smarter name matching: the top-up category name often has extras ("PUBG Mobile (Auto)") */
  put("storeNodes/iAuto", { parentId: "nP", type: "item", name: "auto", enabled: true, sort: 6, prices: P10([1]), supplier: { provider: "fazercards", categoryId: "cat_pubgm_auto", offerId: "o_a", playerField: "player_id", categoryName: "PUBG Mobile (Auto)", validateCategoryId: "", offerName: "d", costUsd: 0.5 } });
  put("storeNodes/iGlobal", { parentId: "nP", type: "item", name: "global", enabled: true, sort: 7, prices: P10([1]), supplier: { provider: "fazercards", categoryId: "cat_pubgm_g", offerId: "o_g", playerField: "player_id", categoryName: "PUBG Mobile Global (manual) UC", validateCategoryId: "", offerName: "d", costUsd: 0.5 } });
  sup.routes["POST /topups/validate-id"] = { body: { ok: true, valid: true, player_name: "Auto Nick" } };
  let nM = sup.calls.length; r = await vid("iAuto", "5123456789"); ok(r.json.supported === true && r.json.valid === true && JSON.parse(sup.calls.slice(nM).find(x => x.method === "POST").body).category_id === "pubg_mobile", "'PUBG Mobile (Auto)' is matched to the game 'PUBG Mobile' (the extra words in brackets do not matter)");
  nM = sup.calls.length; r = await vid("iGlobal", "5123456789"); ok(r.json.supported === true && JSON.parse(sup.calls.slice(nM).find(x => x.method === "POST").body).category_id === "pubg_mobile", "so is 'PUBG Mobile Global (manual) UC'");
  vm.runInContext("FZR_VALIDATORS = { at: Date.now(), items: [{ categoryId: 'a1', name: 'Game One', fields: ['player_id'] }, { categoryId: 'a2', name: 'Game Two', fields: ['player_id'] }] }", c);
  put("storeNodes/iAmb", { parentId: "nP", type: "item", name: "amb", enabled: true, sort: 8, prices: P10([1]), supplier: { provider: "fazercards", categoryId: "c", offerId: "o", playerField: "player_id", categoryName: "Game One Game Two Bundle", validateCategoryId: "", offerName: "d", costUsd: 0.5 } });
  r = await vid("iAmb", "5123456789"); ok(r.json.supported === false, "when two games fit equally well it does NOT guess (not supported)");
  vm.runInContext("FZR_VALIDATORS = { at: 0, items: [] }", c);
  const fm = vm.runInContext("fzrMatchValidator", c); const L2 = [{ categoryId: "p", name: "PUBG Mobile" }, { categoryId: "pl", name: "PUBG Mobile Lite" }];
  ok(fm(L2, "PUBG Mobile Lite").categoryId === "pl" && fm(L2, "PUBG Mobile (Auto)").categoryId === "p" && fm(L2, "pubg-mobile").categoryId === "p" && fm(L2, "Fortnite") === null && fm(L2, "") === null, "matching rules: the exact name wins ('Lite' stays 'Lite'), brackets and punctuation are ignored, unrelated or empty names match nothing");
  r = await vid("iNoMatch", "123456789"); ok(r.status === 200 && r.json.supported === false, "a game FazerCards cannot check: 'not supported'");
  for (const [st2, label] of [[403, "403 (inactive subscription)"], [500, "500"], [429, "429"]]) { sup.routes["POST /topups/validate-id"] = { status: st2, body: { ok: false, error: "x" } }; r = await vid("i660", "5123456789"); ok(r.status === 200 && r.json.supported === true && r.json.available === false && !("valid" in r.json), "if FazerCards answers " + label + " the customer is told 'cannot check right now' (never an error page, never a block)"); }
  sup.fail = "network"; r = await vid("i660", "5123456789"); sup.fail = null; ok(r.status === 200 && r.json.available === false, "a network failure is also just 'cannot check'");
  keyOff(); const nD = sup.calls.length; r = await vid("i660", "5123456789"); ok(r.json.supported === false && sup.calls.length === nD, "with no key nothing is checked and buying works as normal"); keyOn();
  sup.routes["POST /topups/validate-id"] = { body: { ok: true, valid: true, player_name: "N" } };
  /* the limit */
  mkRate = (uid) => { for (const k of [...store.keys()]) if (k.startsWith("storeRate/")) store.delete(k); };
  mkRate(); TOKS.u9 = { sub: "u9", email: "n@x.com" }; let lastOk = 0; for (let i = 0; i < 30; i++) { r = await vid("i660", "5123456789", "u9"); if (r.status === 200) lastOk++; }
  ok(lastOk === 30, "30 checks an hour are allowed"); r = await vid("i660", "5123456789", "u9"); ok(r.status === 429 && r.json.error === "rate_limited" && /جرّب بعد شوي/.test(r.json.message), "the 31st is refused (so nobody can use this to scan IDs)");
  r = await vid("i660", "5123456789", "u1"); ok(r.status === 200, "another customer is not affected");
  const rk = get("storeRate/validate_u9"); put("storeRate/validate_u9", { ...rk, start: Date.now() - 3700 * 1000 }); r = await vid("i660", "5123456789", "u9"); ok(r.status === 200 && get("storeRate/validate_u9").n === 1, "after an hour the count starts again");
  const nE = sup.calls.length; r = await vid("i660", "12", "u9"); ok(r.status === 400, "(a bad ID does not use up the allowance or call anybody)"); ok(get("storeRate/validate_u9").n === 1 && sup.calls.length === nE, "...");
  ok(!JSON.stringify(r.json).includes(KEY), "the key never appears in any answer");
  var link2;

  /* ---- E4) search across every section ---- */
  const resetCat = () => vm.runInContext("FZR_CATALOG = { at: 0, data: null }", c);
  sup.routes["/giftcards?limit=100"] = { body: { ok: true, items: [{ category_id: "gc_steam_1", name: "Steam USD" }, { category_id: "gc_xena", name: "<b>Xena</b> Coins" }], meta: { has_more: false } } };
  sup.routes["/manual-services"] = { body: { ok: true, items: [{ id: "ms_bigo", name: "Bigo Live", kind: "manual_transfer" }, { id: "ms_xena", name: "Xena Live", kind: "manual_transfer" }, { id: "bad id", name: "x" }] } };
  sup.routes["/giftcards/cards?category_id=gc_xena"] = { body: { ok: true, offers: [{ card_id: "x1", name: "1000 coins", price_usd: "1.1000", stock: 50 }, { card_id: "x2", name: "no price", price_usd: "abc" }] } };
  sup.routes["/manual-services/ms_xena/offers"] = { body: { ok: true, items: [{ id: "m1", name: "Express", price_usd: "25.0000", delivery_minutes: 60 }, { id: "m2", name: "Slow", price_usd: "20", delivery_minutes: 0 }] } };
  ok((await adm({ action: "supplier_search", q: "xena" }, "u1")).status === 401 && (await adm({ action: "supplier_section_offers", section: "manual", id: "ms_xena" }, null)).status === 401, "both are admin-only");
  resetCat(); let nS = sup.calls.length; r = await adm({ action: "supplier_search", q: "xena" });
  ok(r.status === 200 && r.json.results.map(x => x.section + ":" + x.id + ":" + x.name).join() === "giftcards:gc_xena:Xena Coins,manual:ms_xena:Xena Live" && Object.keys(r.json.errors).length === 0, "searching 'xena' finds it in every section where it exists and tells which section (gift cards and manual services here), cleaned names, invalid ids dropped");
  ok(sup.calls.length - nS === 4 && sup.calls.slice(nS).every(x => x.method === "GET"), "(it read the 3 section lists: 2 pages of top-ups, gift cards, manual services; reads only)");
  nS = sup.calls.length; r = await adm({ action: "supplier_search", q: "pubg" }); ok(r.json.results.length === 1 && r.json.results[0].section === "topups" && sup.calls.length === nS, "the lists are remembered for 10 minutes (a second search calls nobody); PUBG is found in game top-ups");
  r = await adm({ action: "supplier_search", q: "LIVE xena" }); ok(r.json.results.length === 1 && r.json.results[0].id === "ms_xena", "every word must match, in any order, any case ('LIVE xena' finds only 'Xena Live')");
  r = await adm({ action: "supplier_search", q: "live" }); ok(r.json.results.map(x => x.id).join() === "ms_bigo,ms_xena", "a shorter word finds more");
  r = await adm({ action: "supplier_search", q: "nothingatall" }); ok(r.status === 200 && r.json.results.length === 0, "no match gives an empty list");
  for (const bad of ["", "   ", "!!!"]) { r = await adm({ action: "supplier_search", q: bad }); ok(r.status === 400, "an empty search is refused: " + JSON.stringify(bad)); }
  /* a section unavailable (plan) must not hide the others, and is not remembered */
  resetCat(); sup.routes["/giftcards?limit=100"] = { status: 403, body: { ok: false, error: "disabled" } };
  r = await adm({ action: "supplier_search", q: "xena" }); ok(r.status === 200 && r.json.results.length === 1 && r.json.results[0].section === "manual" && /غير مفعّلة بخطتك/.test(r.json.errors.giftcards) && !r.json.errors.manual && !r.json.errors.topups, "if one section is unavailable (e.g. not in your plan) the others still work and you are told which one failed and why");
  sup.routes["/giftcards?limit=100"] = { body: { ok: true, items: [{ category_id: "gc_xena", name: "Xena Coins" }], meta: { has_more: false } } };
  r = await adm({ action: "supplier_search", q: "xena" }); ok(r.json.results.length === 2 && Object.keys(r.json.errors).length === 0, "an incomplete result is never remembered: once fixed, the missing section appears at once");
  resetCat(); sup.routes["/topups?limit=100"] = { status: 403, body: { ok: false } }; sup.routes["/giftcards?limit=100"] = { status: 403, body: { ok: false } }; sup.routes["/manual-services"] = { status: 403, body: { ok: false } };
  r = await adm({ action: "supplier_search", q: "xena" }); ok(r.status === 502 && r.json.error === "supplier_error", "if every section fails it is an error (not an empty list that looks like 'does not exist')");
  sup.routes["/topups?limit=100"] = { body: { ok: true, items: [{ category_id: "cat_pubgm_1", name: "PUBG Mobile" }], meta: { has_more: false } } }; sup.routes["/giftcards?limit=100"] = { body: { ok: true, items: [{ category_id: "gc_xena", name: "Xena Coins" }], meta: { has_more: false } } }; sup.routes["/manual-services"] = { body: { ok: true, items: [{ id: "ms_xena", name: "Xena Live" }] } }; resetCat();
  /* the packages and prices behind a result */
  r = await adm({ action: "supplier_section_offers", section: "giftcards", id: "gc_xena" }); ok(r.status === 200 && r.json.offers.length === 1 && r.json.offers[0].name === "1000 coins" && r.json.offers[0].priceUsd === 1.1 && r.json.offers[0].note === "مخزون 50", "gift cards: packages with their price and stock (one without a valid price is dropped)");
  r = await adm({ action: "supplier_section_offers", section: "manual", id: "ms_xena" }); ok(r.json.offers.map(o => o.name + ":" + o.priceUsd + ":" + o.note).join() === "Express:25:تسليم خلال 60 دقيقة,Slow:20:", "manual services: packages with price and delivery time");
  r = await adm({ action: "supplier_section_offers", section: "topups", id: "cat_pubgm_1" }); ok(r.json.offers.length === 2 && r.json.offers[1].priceUsd === 8.76, "game top-ups: the same packages and prices as when linking");
  for (const [sec, id] of [["steam", "x"], ["manual", "bad id"], ["", "x"], ["manual", ""]]) { const nB = sup.calls.length; r = await adm({ action: "supplier_section_offers", section: sec, id }); ok(r.status === 400 && sup.calls.length === nB, "refused without calling anybody: " + sec + "/" + id); }
  sup.routes["/manual-services/gone/offers"] = { status: 404, body: { ok: false, error: "not found" } }; r = await adm({ action: "supplier_section_offers", section: "manual", id: "gone" }); ok(r.status === 502 && /not found/.test(r.json.message), "an unknown id from FazerCards is shown");

  /* ---- F) the key never leaks and nobody else is called ---- */
  ok(sup.calls.every(x => x.url.startsWith("https://api.fzr.cards/api/v2/")) && sup.calls.every(x => x.method === "GET" || (x.method === "POST" && x.url.endsWith("/topups/validate-id"))), "everything sent to FazerCards went to its API and was read-only: reads, plus the ID check; nothing was ever bought or changed (no /topups/order call)");
  ok(!sup.calls.some(x => /\/topups\/order/.test(x.url)), "(and no order was ever placed)");
  ok(!JSON.stringify([...store.values()]).includes(KEY), "the key is not stored anywhere in the database");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
