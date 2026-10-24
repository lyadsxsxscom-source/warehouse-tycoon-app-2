// اختبارات السيرفر: أداة الأسعار (حساب أسعار VIP 1..10 من تكلفة FazerCards: هامش متدرّج، حدّ أدنى، تقريب، معاينة وتطبيق)
// التشغيل: node tools/tests/store_prices_worker.test.js
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
  env.FAZER_API_KEY = "KEY"; const sup = { calls: [], offers: {}, fail: new Set() };
  c.fetch = async (url, opts) => {
    const u = String(url).replace("https://api.fzr.cards/api/v2", ""); sup.calls.push(u); const m = /^\/topups\/offers\?category_id=(.+)$/.exec(u);
    if (m) { const cat = decodeURIComponent(m[1]); if (sup.fail.has(cat)) return { ok: false, status: 500, json: async () => ({ ok: false, error: "down" }) }; const o = sup.offers[cat]; if (!o) return { ok: false, status: 404, json: async () => ({ ok: false, error: "nf" }) };
      return { ok: true, status: 200, json: async () => ({ ok: true, category_id: cat, name: "Cat " + cat, offers: o.map(x => ({ offer_id: x[0], name: x[0], price_usd: String(x[1]) })), fields: [{ key: "player_id", label: "Player ID", type: "text" }] }) }; }
    return { ok: false, status: 404, json: async () => ({ ok: false }) };
  };
  const F = (n) => vm.runInContext(n, c), node = (id) => get("storeNodes/" + id);
  const link = (cat, off, cost) => ({ provider: "fazercards", categoryId: cat, offerId: off, playerField: "player_id", categoryName: "C", validateCategoryId: "", offerName: off, costUsd: cost });
  const reset = () => { sup.calls.length = 0; sup.fail = new Set(); sup.offers = { cat_a: [["o60", 0.875], ["o660", 8.6329]], cat_w: [["w60", 0.5]], cat_bad: [["z", 0]], cat_gone: [["other", 1]] };
    put("config/storeSupplier", { enabled: false, minMarginPct: 5, dailyCapUsd: 100, updatedAt: 1 });
    put("storeNodes/nA", { parentId: "", type: "folder", name: "PUBG", enabled: true, sort: 1 }); put("storeNodes/nB", { parentId: "nA", type: "folder", name: "تلقائي", enabled: true, sort: 1 });
    put("storeNodes/i60", { parentId: "nB", type: "item", name: "UC 60", enabled: true, sort: 1, prices: P10([0.99, 0.98, 0.98, 0.97, 0.96, 0.96, 0.95, 0.94, 0.92, 0.9]), supplier: link("cat_a", "o60", 0.86) });
    put("storeNodes/i660", { parentId: "nB", type: "item", name: "UC 660", enabled: true, sort: 2, prices: P10([9.9]), supplier: link("cat_a", "o660", 8.7) });
    put("storeNodes/iW", { parentId: "nA", type: "item", name: "WOW 60", enabled: true, sort: 3, prices: P10([0.7, 0.6]), supplier: link("cat_w", "w60", 0.5) });
    put("storeNodes/iGone", { parentId: "nA", type: "item", name: "Gone", enabled: true, sort: 4, prices: P10([2]), supplier: link("cat_gone", "missing", 1) });
    put("storeNodes/iErr", { parentId: "nA", type: "item", name: "Err", enabled: true, sort: 5, prices: P10([2]), supplier: link("cat_err", "x", 1) }); sup.fail.add("cat_err");
    put("storeNodes/iBad", { parentId: "nA", type: "item", name: "Bad", enabled: true, sort: 6, prices: P10([2]), supplier: link("cat_bad", "z", 1) });
    put("storeNodes/iPlain", { parentId: "nA", type: "item", name: "Manual", enabled: true, sort: 7, prices: P10([3, 2.5]) });
    put("storeNodes/iOff", { parentId: "nA", type: "item", name: "Hidden", enabled: false, sort: 8, prices: P10([1.5]), supplier: link("cat_w", "w60", 0.5) }); };
  const body = (o) => ({ m1: 10, m10: 5, step: 0.01, ...o });
  let r;

  /* ---- A) the arithmetic ---- */
  const prop = F("storeProposePrices"); const P = prop(0.875, 10, 5, 0.01, 5);
  ok(JSON.stringify(P) === JSON.stringify([0.98, 0.97, 0.97, 0.96, 0.95, 0.95, 0.94, 0.94, 0.93, 0.93]), "cost $0.875, margin 10% at VIP1 down to 5% at VIP10, rounded up to the cent: " + P.join(" "));
  ok((0.93 - 0.875) / 0.93 * 100 > 5 && (0.98 - 0.875) / 0.98 * 100 > 10, "(VIP10 keeps over 5% and VIP1 over 10%: " + (((0.93 - 0.875) / 0.93) * 100).toFixed(1) + "% and " + (((0.98 - 0.875) / 0.98) * 100).toFixed(1) + "%)");
  ok(JSON.stringify(prop(0.875, 10, 5, 0.05, 5)) === JSON.stringify([1, 1, 1, 1, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95]), "rounding up to 5 cents");
  ok(JSON.stringify(prop(0.875, 10, 5, 0.1, 5)) === JSON.stringify([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), "rounding up to 10 cents");
  ok(prop(0.875, 5, 5, 0.01, 5).every(x => x === 0.93), "the same margin at both ends gives one price for every level");
  let bad = 0, worst = 0; const rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
  for (let t = 0; t < 4000; t++) { const cost = Math.round((0.05 + rnd() * rnd() * 400) * 10000) / 10000, min = 1 + Math.floor(rnd() * 8), m10 = min + Math.floor(rnd() * 8), m1 = m10 + Math.floor(rnd() * 20), step = [0.01, 0.05, 0.1][Math.floor(rnd() * 3)]; const p = prop(cost, m1, m10, step, min);
    for (let k = 0; k < 10; k++) { const want = Math.max(m1 + (m10 - m1) * k / 9, min), exact = cost / (1 - want / 100), margin = (p[k] - cost) / p[k] * 100; if (!(p[k] > 0) || (k && p[k] > p[k - 1]) || margin + 1e-9 < Math.min(want, 90) || p[k] - exact > step + 1e-6 || margin + 1e-9 < min) bad++; worst = Math.max(worst, p[k] - exact); } }
  ok(bad === 0, "4000 random cases (any cost, margins, rounding): the prices never go up with the VIP level, never fall under the target or under the minimum margin, and never overshoot by more than one rounding step (worst overshoot " + worst.toFixed(4) + ")");

  /* ---- B) the settings are checked ---- */
  reset();
  for (const [o, re, label] of [[{ m10: 3 }, /هامش VIP 10 \(3%\) أقل من حدّك الأدنى \(5%\)/, "VIP10 margin under your minimum"], [{ m1: 4 }, /هامش VIP 1 لازم يكون أكبر/, "VIP1 below VIP10"], [{ m1: 95 }, /أرقام بين 0 و90/, "absurd margin"], [{ m1: "x" }, /أرقام/, "not a number"], [{ m10: 0 }, /أرقام/, "zero margin"], [{ step: 0.07 }, /خطوة التقريب/, "unknown rounding step"]]) {
    r = await adm({ action: "prices_preview", ...body(o) }); ok(r.status === 400 && re.test(r.json.message), "refused: " + label); }
  put("config/storeSupplier", { enabled: false, minMarginPct: 2, dailyCapUsd: 100, updatedAt: 1 }); r = await adm({ action: "prices_preview", ...body({ m10: 3 }) }); ok(r.status === 200 && r.json.minMarginPct === 2, "the minimum comes from your automatic-fulfillment setting (here 2%, so 3% is allowed)"); put("config/storeSupplier", { enabled: false, minMarginPct: 5, dailyCapUsd: 100, updatedAt: 1 });
  ok((await adm({ action: "prices_preview", ...body() }, "u1")).status === 401 && (await adm({ action: "prices_apply", ...body(), ids: ["i60"] }, null)).status === 401, "both actions are admin-only");
  delete env.FAZER_API_KEY; r = await adm({ action: "prices_preview", ...body() }); ok(r.status === 400 && r.json.error === "no_key", "without the FazerCards key it says so"); env.FAZER_API_KEY = "KEY";

  /* ---- C) the preview ---- */
  reset(); r = await adm({ action: "prices_preview", ...body() }); const it = (id) => r.json.items.find(x => x.id === id);
  ok(r.status === 200 && r.json.minMarginPct === 5 && r.json.items.length === 7 && !it("iPlain"), "it lists the 7 products linked to FazerCards (the manual one is left out; hidden ones are included)");
  ok(it("i60").status === "ok" && it("i60").costUsd === 0.875 && it("i60").oldCostUsd === 0.86 && it("i60").path === "PUBG › تلقائي" && JSON.stringify(it("i60").proposed) === JSON.stringify(P) && it("i60").current[0] === 0.99 && it("i60").current[9] === 0.9, "each line has the CURRENT cost from FazerCards (0.875, not the old 0.86), its folder path, the proposed prices and today's prices");
  ok(it("i660").costUsd === 8.6329 && it("i660").proposed.every((x, k) => (x - 8.6329) / x * 100 >= 5 + 1e-9 && (k === 0 || x <= it("i660").proposed[k - 1])), "a second product of the same category uses its own cost (and the category is asked for only once)");
  ok(sup.calls.filter(x => /cat_a/.test(x)).length === 1, "(one request per category: " + sup.calls.length + " in all)");
  ok(it("iGone").status === "missing_offer" && it("iErr").status === "category_error" && it("iBad").status === "bad_cost" && it("iGone").proposed.length === 0, "a product whose offer disappeared, one whose category cannot be reached, and one with a zero cost are flagged, with no prices proposed");
  ok(r.json.items.map(x => x.path + "|" + x.name).join() === [...r.json.items.map(x => x.path + "|" + x.name)].sort((a, b) => a.localeCompare(b)).join(), "the list is sorted by folder then name");
  ok(node("i60").prices[0] === 0.99 && node("i60").supplier.costUsd === 0.86, "the preview changed nothing");

  /* ---- D) applying ---- */
  reset(); const before = { plain: JSON.stringify(node("iPlain")), w: JSON.stringify(node("iW")), off: JSON.stringify(node("iOff")), gone: JSON.stringify(node("iGone")) };
  r = await adm({ action: "prices_apply", ...body(), ids: ["i60", "i660", "iGone", "iErr", "iBad", "iPlain", "ghost", "iW"] });
  ok(r.status === 200 && r.json.applied === 3 && JSON.stringify(r.json.skipped.map(x => x.id + ":" + x.reason).sort()) === JSON.stringify(["iBad:bad_cost", "iErr:category_error", "iGone:missing_offer", "iPlain:not_linked", "ghost:not_linked"].sort()), "it applies the 3 good ones and reports why each of the others was skipped");
  ok(JSON.stringify(node("i60").prices) === JSON.stringify(P) && node("i60").supplier.costUsd === 0.875 && node("i60").supplier.offerId === "o60" && node("i60").supplier.categoryId === "cat_a" && node("i60").name === "UC 60" && node("i60").parentId === "nB" && node("i60").enabled === true, "the prices of UC 60 are the proposed ones, the stored cost is refreshed, and nothing else about the product changed");
  ok(node("iW").prices.every((x, k) => (x - 0.5) / x * 100 >= 5) && JSON.stringify(node("iW")) !== before.w, "the third product too");
  ok(JSON.stringify(node("iPlain")) === before.plain && JSON.stringify(node("iOff")) === before.off && JSON.stringify(node("iGone")) === before.gone, "the manual one, the one not selected and the flagged one are exactly as before");
  const again = await adm({ action: "prices_apply", ...body(), ids: ["i60"] }); ok(again.json.applied === 1 && JSON.stringify(node("i60").prices) === JSON.stringify(P), "applying twice gives the same result");
  r = await adm({ action: "prices_apply", ...body(), ids: [] }); ok(r.status === 400, "nothing selected is refused"); r = await adm({ action: "prices_apply", ...body({ m10: 3 }), ids: ["i60"] }); ok(r.status === 400 && r.json.error === "margin_below_min", "the margin check applies when saving too (a changed page cannot slip a low margin in)");
  r = await adm({ action: "prices_apply", ...body(), ids: Array.from({ length: 401 }, (_, i) => "n" + i) }); ok(r.status === 400, "an absurd selection (401) is refused");
  /* what customers see */
  put("config/storeVip", { sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], updatedAt: 1 }); mkC("v1", { balanceUsd: 5, spentUsd: 0 }); mkC("v10", { balanceUsd: 5, spentUsd: 20000 }); TOKS.v1 = { sub: "v1", name: "v1", email: "v1@x.com" }; TOKS.v10 = { sub: "v10", name: "v10", email: "v10@x.com" };
  const pr = async (uid) => (await callApi("/store/prices", {}, uid)).json; const p1 = await pr("v1"), p10 = await pr("v10"); const priceOf = (j, id) => (j.prices || j.items || {})[id] !== undefined ? (j.prices || j.items)[id] : null;
  ok(JSON.stringify(p1).includes("0.98") && JSON.stringify(p10).includes("0.93"), "a VIP 1 customer sees $0.98 for UC 60 and a VIP 10 customer sees $0.93");
  /* the automatic fulfillment gate agrees with these prices */
  put("config/storeSupplier", { enabled: true, minMarginPct: 5, dailyCapUsd: 100, updatedAt: 1 }); F("FZR_CACHE = { me: null, plans: null, offers: {} }"); F("FZR_FAST_POLL_MS = []");
  const call0 = c.fetch; c.fetch = async (url, opts) => { const u = String(url).replace("https://api.fzr.cards/api/v2", ""); if (u === "/me") return { ok: true, status: 200, json: async () => ({ ok: true, login: "p", plan: "gold", planExpiresAt: new Date(NOW + 20 * DAY).toISOString(), planAutoRenew: true, subscriptionActive: true }) }; if (u === "/balance") return { ok: true, status: 200, json: async () => ({ ok: true, balance: "50", currency: "USD" }) }; if (u === "/topups/order") return { ok: true, status: 200, json: async () => ({ ok: true, order: { id: "ord-1", kind: "topup", status: "processing" } }) }; return call0(url, opts); };
  const w = []; const o10 = await W.fetch(new Request("https://x/store/order", { method: "POST", headers: { Authorization: "Bearer v10" }, body: JSON.stringify({ itemId: "i60", playerId: "5123456789", reqId: rid() }) }), env, { waitUntil: p => w.push(p) }); const oj = await o10.json(); await Promise.all(w); const od = get("storeOrders/" + oj.order.id);
  ok(od.priceUsd === 0.93 && od.auto && od.auto.state === "sent", "a VIP 10 order at the new price ($0.93 against a $0.875 cost = 5.9%) passes the automatic-fulfillment margin check and is sent (before this, $0.90 was held at 2.8%)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e); process.exit(1); });
