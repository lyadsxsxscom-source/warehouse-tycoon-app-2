// اختبارات السيرفر: طلبات المتجر (5أ): عرض السعر، إنشاء الطلب، إيصال الدفع، إلغاء، إجراءات الأدمن (تنفيذ، رفض، استرجاع)، الصرف وVIP
// التشغيل: node tools/tests/store_orders_worker.test.js
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
    if (injectConflictOn && ws.some(w => w.update && w.update.name.endsWith(injectConflictOn))) { const mark = injectConflictOn; injectConflictOn = null; if (mark.endsWith("counters/store")) { const cur = store.get("counters/store"); const n = cur ? Number(c.fieldsToObj(cur.fields).n) + 1 : 1001; store.set("counters/store", { fields: c.objToFields({ n }), t: String(++tick) }); } else { const cur = store.get(mark.replace(/^.*\/databases\/\(default\)\/documents\//, "")); if (cur) store.set(mark, { ...cur, t: String(++tick) }); } throw Object.assign(new Error("ABORTED"), { conflict: true }); }
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
  const mkC = (uid, o) => put("storeCustomers/" + uid, { name: uid, email: uid + "@x.com", spentUsd: 0, createdAt: 1, lastSeenAt: 1, ...o });
  const P10 = (a) => Array.from({ length: 10 }, (_, i) => a[Math.min(i, a.length - 1)]);
  put("storeNodes/nP", { parentId: "", type: "folder", name: "PUBG", enabled: true, sort: 1 });
  put("storeNodes/nF", { parentId: "nP", type: "folder", name: "فوري", enabled: true, sort: 1 });
  put("storeNodes/i60", { parentId: "nF", type: "item", name: "60 UC", enabled: true, sort: 1, prices: P10([0.92, 0.9, 0.88, 0.86, 0.84, 0.82, 0.8, 0.78, 0.76, 0.74]) });
  put("storeNodes/i660", { parentId: "nF", type: "item", name: "660 UC", enabled: true, sort: 2, prices: P10([9.26]) });
  put("storeNodes/iHid", { parentId: "nF", type: "item", name: "hidden", enabled: false, sort: 3, prices: P10([1]) });
  put("storeNodes/iNo", { parentId: "nF", type: "item", name: "no usd price", enabled: true, sort: 4, price: 150 });
  put("storeNodes/nOff", { parentId: "", type: "folder", name: "off", enabled: false, sort: 2 });
  put("storeNodes/iUnder", { parentId: "nOff", type: "item", name: "under off", enabled: true, sort: 1, prices: P10([1]) });
  put("storeNodes/iOne", { parentId: "", type: "item", name: "edge", enabled: true, sort: 9, prices: P10([1]) });
  const METHODS = [{ id: "sham", name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0, enabled: true, instructions: "حوّل وانسخ رقم العملية", account: "0932000000" }, { id: "usdt", name: "USDT", currency: "USDT", rate: 1, decimals: 2, feePct: 1.5, enabled: true, instructions: "BEP20 فقط", account: "0xabc" }, { id: "off", name: "off", currency: "x", rate: 2, decimals: 0, feePct: 0, enabled: false }];
  put("config/storePayments", { methods: METHODS, updatedAt: 1 });
  mkC("u1", {}); mkC("u2", {});
  const quote = (itemId, token = "u1") => callApi("/store/quote", { itemId }, token);
  let seqRid = 0; const rid = () => "req-" + String(++seqRid).padStart(8, "0");
  const order = (itemId, methodId, playerId, token = "u1", reqId) => callApi("/store/order", { itemId, methodId, playerId, reqId: reqId || rid() }, token);
  let r;

  /* ---- A) sign-in is required ---- */
  for (const path of ["/store/quote", "/store/order", "/store/orders", "/store/prices", "/store/order/proof", "/store/order/cancel"]) { r = await callApi(path, {}, null); ok(r.status === 401, path + " needs sign-in"); }
  ok((await callApi("/store/orders", {}, "garbage")).status === 401, "a bad token is refused");
  ok((await adm({ action: "orders_list" }, "u1")).status === 401 && (await adm({ action: "order_done", id: "x" }, "u1")).status === 401 && (await adm({ action: "order_proof", id: "x" }, null)).status === 401, "customers cannot use the admin actions");
  r = await callApi("/store/quote", { itemId: "i60" }, "u3"); ok(r.status === 400 && r.json.error === "no_account", "someone who never opened a store account is told to open it first");

  /* ---- B) the quote ---- */
  r = await quote("i60"); const q = r.json.quote;
  ok(r.status === 200 && q.itemId === "i60" && q.name === "60 UC" && q.vip === 1 && q.priceUsd === 0.92 && q.validMinutes === 30, "a quote: the item, his VIP level, the dollar price and how long it is valid");
  ok(q.methods.length === 2 && q.methods[0].id === "sham" && q.methods[0].amount === 131 && q.methods[1].amount === 0.93 && !q.methods.some(m => m.id === "off") && !("instructions" in q.methods[0]), "the price in every ENABLED method (0.92 x 142.5 = 131; 0.92 x 1.015 = 0.93); a disabled method is not offered; no payment details yet");
  r = await quote("iOne"); ok(r.json.quote.methods[1].amount === 1.02 && r.json.quote.methods[0].amount === 143, "rounding is the same as the store page (1 x 1.015 = 1.02, 142.5 = 143)");
  mkC("u2", { spentUsd: 1000 }); r = await quote("i60", "u2"); ok(r.json.quote.vip === 4 && r.json.quote.priceUsd === 0.86, "the price follows his VIP level (1000 spent = VIP 4 = 0.86)");
  mkC("u2", { spentUsd: 0, merchant: { status: "trial", level: 7, targetUsd: 500, baseSpent: 0, startedAt: NOW, endsAt: NOW + 30 * DAY, prevLevel: 1 } }); r = await quote("i60", "u2"); ok(r.json.quote.vip === 7 && r.json.quote.priceUsd === 0.8, "a merchant on a trial gets his merchant level price (VIP 7 = 0.8)");
  mkC("u2", { spentUsd: 0 });
  for (const [id, label] of [["iHid", "a hidden item"], ["iNo", "an item with no dollar price"], ["iUnder", "an item under a hidden folder"], ["nF", "a folder"], ["ghost", "an unknown id"], ["", "no id"]]) { r = await quote(id); ok(r.status === 404 && r.json.error === "no_item", "no quote for " + label); }

  /* ---- B2) all prices at his level ---- */
  r = await callApi("/store/prices", {}, "u1"); ok(r.status === 200 && r.json.vip === 1 && r.json.prices.i60 === 0.92 && r.json.prices.i660 === 9.26 && r.json.prices.iOne === 1, "the price list at his level (VIP 1)");
  ok(!("iHid" in r.json.prices) && !("iNo" in r.json.prices) && !("iUnder" in r.json.prices) && !("nF" in r.json.prices), "hidden, unpriced and under-a-hidden-folder items and folders are never in it");
  mkC("u2", { spentUsd: 1000 }); r = await callApi("/store/prices", {}, "u2"); ok(r.json.vip === 4 && r.json.prices.i60 === 0.86 && r.json.prices.i660 === 9.26, "at VIP 4 the same items have the VIP 4 price (0.86; an item with one price stays the same)"); mkC("u2", { spentUsd: 0 });
  ok((await callApi("/store/prices", {}, null)).status === 401 && (await callApi("/store/prices", {}, "u3")).json.error === "no_account", "it needs a signed-in customer with an account");
  /* ---- C) placing an order ---- */
  r = await order("i60", "sham", "123456789"); const o1 = r.json.order;
  ok(r.status === 200 && /^o[0-9a-f]{20}$/.test(o1.id) && o1.code === "T-1001" && o1.status === "awaiting_payment" && o1.itemName === "60 UC" && o1.itemPath === "PUBG › فوري › 60 UC" && o1.playerId === "123456789" && o1.vip === 1 && o1.priceUsd === 0.92 && o1.amount === 131, "an order: code T-1001, awaiting payment, the item and its path, the Player ID, his level, the dollar price and the amount to pay");
  ok(o1.method.id === "sham" && o1.method.currency === "ل.س" && o1.method.account === "0932000000" && o1.method.instructions === "حوّل وانسخ رقم العملية" && o1.proof === null && o1.quoteEndsAt > NOW + 29 * 60000 && o1.quoteEndsAt < NOW + 31 * 60000 && o1.quoteExpired === false, "it carries the payment account and instructions, no proof yet, and a 30-minute price window");
  ok(!("uid" in o1) && !("adminNote" in o1) && !("events" in o1), "the customer's view has no admin fields");
  const raw1 = get("storeOrders/" + o1.id); ok(raw1.uid === "u1" && raw1.name === "Ali" && raw1.email === "ali@x.com" && raw1.rate === 142.5 && raw1.methodName === "شام كاش" && raw1.events[0].action === "created" && get("counters/store").n === 1001, "the stored order keeps the exchange rate and a history; the counter moved");
  r = await order("i60", "usdt", "ID-77 #a"); ok(r.json.order.code === "T-1002" && r.json.order.amount === 0.93 && r.json.order.playerId === "ID-77 #a", "the next order is T-1002 (letters, digits, spaces and # are fine in an ID)");
  put("config/storePayments", { methods: METHODS.map(m => m.id === "sham" ? { ...m, rate: 200 } : m), updatedAt: 2 });
  r = await callApi("/store/orders", {}, "u1"); ok(r.json.orders.find(x => x.code === "T-1001").amount === 131, "changing the exchange rate later does not change an existing order");
  r = await order("i60", "sham", "55555"); ok(r.json.order.amount === 184, "a new order uses the new rate (0.92 x 200 = 184)");
  put("config/storePayments", { methods: METHODS, updatedAt: 3 });
  for (const [pid, label] of [["12", "too short"], ["", "empty"], ["<script>alert(1)</script>", "HTML"], ["a".repeat(41), "too long"], ["id!!", "symbols"], ["12\n34", "a line break"]]) { r = await order("i60", "sham", pid); ok(r.status === 400 && r.json.error === "bad_player", "refused Player ID: " + label); }
  r = await order("i60", "sham", "١٢٣٤٥٦"); ok(r.status === 200, "digits in other scripts are accepted (a player may type Arabic digits)");
  for (const [m, label] of [["", "none"], ["ghost", "unknown"], ["off", "disabled"]]) { r = await order("i60", m, "12345"); ok(r.status === 400 && r.json.error === "no_method", "refused payment method: " + label); }
  r = await order("iHid", "sham", "12345"); ok(r.status === 404, "an order for a hidden item is refused");
  for (const bad of ["", "short", "has space in it!", "x".repeat(65)]) { r = await callApi("/store/order", { itemId: "i60", methodId: "sham", playerId: "12345", reqId: bad }, "u1"); ok(r.status === 400 && r.json.error === "bad_request", "refused request id: " + JSON.stringify(bad.slice(0, 12))); }
  const nBefore = get("counters/store").n, same = rid(); const a1 = await order("iOne", "sham", "99999", "u1", same), a2 = await order("iOne", "sham", "99999", "u1", same);
  ok(a1.json.order.id === a2.json.order.id && a2.json.duplicate === true && a1.json.order.code === a2.json.order.code && get("counters/store").n === nBefore + 1, "sending the same request twice (a double tap, a retry) gives the same order and uses one number");
  const b1 = await order("iOne", "sham", "99999", "u2", same); ok(b1.status === 200 && b1.json.order.id !== a1.json.order.id && !b1.json.duplicate, "another customer with the same request id gets his own order");
  r = await callApi("/store/orders", {}, "u2"); ok(r.json.orders.length === 1 && r.json.orders[0].code === b1.json.order.code, "and each sees only his own orders");
  /* open-order limit */
  mkC("u4", {}); TOKS.u4 = { sub: "u4", name: "Lim", email: "l@x.com" };
  const lim = []; for (let i = 0; i < 5; i++) lim.push((await order("iOne", "sham", "1000" + i, "u4")).json.order);
  r = await order("iOne", "sham", "10009", "u4"); ok(r.status === 400 && r.json.error === "too_many_open" && /5/.test(r.json.message), "at most 5 open orders per customer");
  await callApi("/store/order/cancel", { orderId: lim[0].id }, "u4"); r = await order("iOne", "sham", "10009", "u4"); ok(r.status === 200, "cancelling one frees a place");
  put("storeOrders/" + lim[1].id, { ...get("storeOrders/" + lim[1].id), createdAt: NOW - 25 * 3600 * 1000 }); r = await order("iOne", "sham", "10010", "u4"); ok(r.status === 200, "an order that expired (24h without payment) does not count either");
  /* two orders at the same moment */
  injectConflictOn = "counters/store"; const nb = get("counters/store").n; r = await order("iOne", "sham", "77777", "u2");
  ok(r.status === 200 && r.json.order.code === "T-" + (nb + 2) && [...store.keys()].filter(k => k.startsWith("storeOrders/") && get(k).code === r.json.order.code).length === 1, "if another order takes the number first, ours retries and gets the next one (one order, no duplicates)");

  /* ---- D) my orders ---- */
  r = await callApi("/store/orders", {}, "u1"); ok(r.json.orders.length >= 3 && r.json.orders.every((x, i, a) => i === 0 || a[i - 1].createdAt >= x.createdAt) && r.json.orders[0].method.account, "my orders: newest first, with the payment details");

  /* ---- E) payment proof ---- */
  const pf = (orderId, body, token = "u1") => callApi("/store/order/proof", { orderId, ...body }, token);
  r = await pf(o1.id, {}); ok(r.status === 400 && r.json.error === "bad_proof", "a proof needs a reference or a picture");
  r = await pf(o1.id, { ref: "   " }); ok(r.status === 400 && r.json.error === "bad_proof", "blank text is not a reference");
  for (const [img, label] of [["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "SVG"], ["http://x/y.png", "a web link"], ["data:image/png;base64," + "A".repeat(290000), "too big"], ["data:image/png;base64,@@@", "not base64"], [123, "not text"]]) { r = await pf(o1.id, { ref: "TX1", image: img }); ok(r.status === 400 && r.json.error === "bad_image", "refused picture: " + label); }
  ok(get("storeOrders/" + o1.id).status === "awaiting_payment" && !store.has("storeProofs/" + o1.id), "a refused proof changes nothing");
  r = await pf(o1.id, { ref: "<b>TX-123</b> 456", image: PNG }); const o1p = r.json.order;
  ok(r.status === 200 && o1p.status === "payment_submitted" && o1p.proof.ref === "TX-123 456" && o1p.proof.hasImage === true && o1p.proof.late === false && o1p.proof.submittedAt >= NOW, "a proof with a reference (cleaned) and a picture: now 'payment submitted', on time");
  ok(get("storeProofs/" + o1.id).data === PNG && !JSON.stringify((await callApi("/store/orders", {}, "u1")).json).includes("base64"), "the picture is stored privately and never appears in the customer's lists");
  r = await pf(o1.id, { ref: "TX-NEW" }); ok(r.status === 200 && r.json.order.proof.ref === "TX-NEW" && r.json.order.proof.hasImage === true && get("storeProofs/" + o1.id).data === PNG, "sending the reference again replaces it and keeps the earlier picture");
  r = await callApi("/store/order/cancel", { orderId: o1.id }, "u1"); ok(r.status === 400 && r.json.error === "bad_status", "after sending the payment he cannot cancel (the admin decides)");
  r = await pf(o1.id, { ref: "x" }, "u2"); ok(r.status === 404, "nobody can send a proof for someone else's order");
  const late = (await order("iOne", "usdt", "31313", "u2")).json.order; put("storeOrders/" + late.id, { ...get("storeOrders/" + late.id), expiresAt: NOW - 60000 });
  r = await pf(late.id, { ref: "TX-late" }, "u2"); ok(r.status === 200 && r.json.order.proof.late === true, "a proof after the 30-minute price window is accepted but flagged 'late'");
  const old = (await order("iOne", "usdt", "41414", "u2")).json.order; put("storeOrders/" + old.id, { ...get("storeOrders/" + old.id), createdAt: NOW - 25 * 3600 * 1000, expiresAt: NOW - 24 * 3600 * 1000 });
  r = await pf(old.id, { ref: "TX-old" }, "u2"); ok(r.status === 400 && /انتهت صلاحية/.test(r.json.message), "after 24 hours an unpaid order has expired and takes no proof");
  r = await callApi("/store/orders", {}, "u2"); ok(r.json.orders.find(x => x.id === old.id).status === "expired", "it is listed as expired");

  /* ---- F) cancelling ---- */
  const cn = (await order("iOne", "sham", "51515", "u2")).json.order;
  r = await callApi("/store/order/cancel", { orderId: cn.id }, "u1"); ok(r.status === 404, "nobody can cancel someone else's order");
  r = await callApi("/store/order/cancel", { orderId: cn.id }, "u2"); ok(r.status === 200 && r.json.order.status === "cancelled" && get("storeOrders/" + cn.id).events.slice(-1)[0].action === "cancelled", "a customer can cancel an order he has not paid");
  r = await callApi("/store/order/cancel", { orderId: cn.id }, "u2"); ok(r.status === 400 && r.json.error === "bad_status", "cancelling twice is refused");
  r = await pf(cn.id, { ref: "x" }, "u2"); ok(r.status === 400 && r.json.error === "bad_status", "a cancelled order takes no proof");
  ok((await callApi("/store/order/cancel", { orderId: "a/b" }, "u2")).status === 400 && (await callApi("/store/order/cancel", {}, "u2")).status === 400 && (await callApi("/store/order/cancel", { orderId: "ghost" }, "u2")).status === 404, "bad or unknown order ids are refused");

  /* ---- G) the admin list ---- */
  r = await adm({ action: "orders_list" }); const L = r.json;
  ok(r.status === 200 && L.total > 5 && L.counts.payment_submitted >= 2 && L.counts.awaiting_payment >= 1 && L.counts.cancelled >= 1 && L.counts.expired >= 1 && L.orders.every((x, i, a) => i === 0 || a[i - 1].createdAt >= x.createdAt), "the admin list: every order newest first, with a count for each status");
  const ad = L.orders.find(x => x.id === o1.id); ok(ad.uid === "u1" && ad.name === "Ali" && ad.email === "ali@x.com" && ad.proof.ref === "TX-NEW" && Array.isArray(ad.events) && ad.events.length >= 2 && ad.adminNote === "", "the admin sees who, the proof and the history");
  r = await adm({ action: "orders_list", status: "payment_submitted" }); ok(r.json.orders.length === L.counts.payment_submitted && r.json.orders.every(x => x.status === "payment_submitted"), "filter by status");
  r = await adm({ action: "orders_list", status: "open" }); ok(r.json.orders.every(x => x.status === "payment_submitted" || x.status === "awaiting_payment") && r.json.orders.length === (L.counts.payment_submitted + L.counts.awaiting_payment), "'open' means waiting for payment or waiting for you");
  r = await adm({ action: "orders_list", q: "T-1002" }); ok(r.json.orders.length === 1 && r.json.orders[0].code === "T-1002", "search by order code");
  r = await adm({ action: "orders_list", q: "OMAR@x" }); ok(r.json.orders.length >= 1 && r.json.orders.every(x => x.email === "omar@x.com"), "by email (not case sensitive)");
  r = await adm({ action: "orders_list", q: "ID-77" }); ok(r.json.orders.length === 1, "by Player ID"); r = await adm({ action: "orders_list", q: "60 uc" }); ok(r.json.orders.length >= 3, "by product name");
  r = await adm({ action: "orders_list", q: "u2" }); ok(r.json.orders.length >= 3, "by account id");
  r = await adm({ action: "order_proof", id: o1.id }); ok(r.json.image === PNG, "the admin can fetch the receipt picture"); r = await adm({ action: "order_proof", id: late.id }); ok(r.json.image === "", "an order with no picture gives an empty answer"); ok((await adm({ action: "order_proof", id: "a/b" })).status === 400, "(bad id)");

  /* ---- H) done ---- */
  const done = (id, note, token = "admin") => adm({ action: "order_done", id, note }, token);
  mkC("u1", { spentUsd: 100 }); r = await done(o1.id, "sent to the player");
  ok(r.status === 200 && r.json.order.status === "done" && r.json.order.adminNote === "sent to the player" && r.json.order.doneAt >= NOW && r.json.order.events.slice(-1)[0].action === "done", "marking done: status, time, your note, history");
  ok(get("storeCustomers/u1").spentUsd === 100.92, "and the dollar price (0.92) is added to his spending");
  const sl = [...store.keys()].filter(k => k.startsWith("storeSpendLog/")).map(k => get(k)).filter(x => x.uid === "u1"); ok(sl.length === 1 && sl[0].deltaUsd === 0.92 && sl[0].note === "طلب T-1001" && sl[0].by === "order", "the spending is logged with the order code");
  r = await done(o1.id); ok(r.status === 400 && r.json.error === "bad_status" && get("storeCustomers/u1").spentUsd === 100.92, "marking done twice is refused and never counts twice");
  const aw = (await order("i660", "usdt", "88888", "u1")).json.order; r = await done(aw.id, "paid outside the site"); ok(r.status === 200 && get("storeCustomers/u1").spentUsd === 110.18, "an order still 'awaiting payment' can be marked done (e.g. he paid you by phone): 100.92 + 9.26");
  const ex2 = (await order("iOne", "sham", "60606", "u2")).json.order; put("storeOrders/" + ex2.id, { ...get("storeOrders/" + ex2.id), createdAt: NOW - 30 * 3600 * 1000 }); r = await done(ex2.id, "late but paid"); ok(r.status === 200 && r.json.order.status === "done", "an expired order can still be marked done by the admin");
  r = await done("ghost"); ok(r.status === 404, "(unknown order)"); r = await done("a/b"); ok(r.status === 400, "(bad id)");
  /* done by a trial merchant reaching the promise */
  mkC("m1", { spentUsd: 0, merchant: { status: "trial", level: 5, targetUsd: 2, baseSpent: 0, startedAt: NOW, endsAt: NOW + 30 * DAY, prevLevel: 1 } }); TOKS.m1 = { sub: "m1", name: "Trader", email: "t@x.com" };
  const mo = (await order("i660", "sham", "70707", "m1")).json.order; ok(mo.vip === 5 && mo.priceUsd === 9.26, "(a merchant orders at his merchant price, VIP 5)");
  r = await done(mo.id); ok(get("storeCustomers/m1").merchant.status === "locked" && get("storeCustomers/m1").spentUsd === 9.26 && [...store.keys()].some(k => k.startsWith("storeVipLog/") && get(k).uid === "m1" && get(k).action === "auto_lock"), "a delivered order that reaches a merchant's promise locks him automatically");
  /* a customer record changing at the same moment */
  const cc = (await order("iOne", "sham", "80808", "u2")).json.order; const cc0 = get("storeCustomers/u2").spentUsd; injectConflictOn = "storeCustomers/u2";
  r = await done(cc.id); ok(r.status === 200 && get("storeCustomers/u2").spentUsd === r2(cc0 + 1) && get("storeOrders/" + cc.id).status === "done", "if the customer record changes at the same moment, it retries and counts once");
  const gone = (await order("iOne", "sham", "90909", "u2")).json.order; store.delete("storeCustomers/u2"); r = await done(gone.id);
  ok(r.status === 404 && r.json.error === "no_customer" && get("storeOrders/" + gone.id).status === "awaiting_payment", "if his account no longer exists the order is not marked done (nothing half-done)"); mkC("u2", { spentUsd: 0 });

  /* ---- I) reject ---- */
  const rj = (await order("iOne", "sham", "11122", "u2")).json.order; await pf(rj.id, { ref: "bad ref" }, "u2");
  r = await adm({ action: "order_reject", id: rj.id }); ok(r.status === 400 && r.json.error === "reason_required", "a reason is required");
  r = await adm({ action: "order_reject", id: rj.id, reason: "<b>no payment</b> received" }); ok(r.status === 200 && r.json.order.status === "rejected" && r.json.order.rejectReason === "no payment received", "rejecting stores the (cleaned) reason");
  ok(get("storeCustomers/u2").spentUsd === 0, "and changes no spending"); r = await callApi("/store/orders", {}, "u2"); ok(r.json.orders.find(x => x.id === rj.id).rejectReason === "no payment received" && r.json.orders.find(x => x.id === rj.id).status === "rejected", "the customer sees the reason");
  r = await adm({ action: "order_reject", id: rj.id, reason: "again" }); ok(r.status === 400 && r.json.error === "bad_status", "rejecting twice is refused");
  r = await adm({ action: "order_done", id: rj.id }); ok(r.status === 400, "a rejected order cannot be marked done");
  r = await adm({ action: "order_reject", id: o1.id, reason: "x" }); ok(r.status === 400, "a done order cannot be rejected (use refund)");

  /* ---- J) refund ---- */
  const before = get("storeCustomers/u1").spentUsd; r = await adm({ action: "order_refund", id: o1.id, note: "wrong ID, refunded by hand" });
  ok(r.status === 200 && r.json.order.status === "refunded" && get("storeCustomers/u1").spentUsd === r2(before - 0.92), "a refund marks it refunded and takes the price back off his spending");
  ok([...store.keys()].map(k => k.startsWith("storeSpendLog/") ? get(k) : null).filter(Boolean).some(x => x.uid === "u1" && x.deltaUsd === -0.92 && x.note === "مرتجع T-1001"), "the refund is logged with the order code");
  r = await adm({ action: "order_refund", id: o1.id }); ok(r.status === 400, "refunding twice is refused"); r = await adm({ action: "order_refund", id: rj.id }); ok(r.status === 400, "only a done order can be refunded");
  mkC("u5", { spentUsd: 0.5 }); TOKS.u5 = { sub: "u5", email: "u5@x.com" }; const lo = (await order("iOne", "sham", "13131", "u5")).json.order; await done(lo.id); put("storeCustomers/u5", { ...get("storeCustomers/u5"), spentUsd: 0.4 }); await adm({ action: "order_refund", id: lo.id });
  ok(get("storeCustomers/u5").spentUsd === 0, "spending never goes below zero");
  function r2(x) { return Math.round(x * 100) / 100; }

  /* ---- K) the payment details ---- */
  r = await adm({ action: "payments_save", methods: [{ ...METHODS[0], instructions: "<b>حوّل</b> " + "x".repeat(400), account: "A".repeat(200) }] });
  ok(r.status === 200 && r.json.methods[0].instructions.length === 300 && !/[<>]/.test(r.json.methods[0].instructions) && r.json.methods[0].account.length === 120, "instructions (up to 300) and the account (up to 120) are cleaned and limited");
  r = await adm({ action: "payments_get" }); ok(r.json.methods[0].instructions.startsWith("حوّل") && r.json.methods[0].account.startsWith("AAA"), "the admin can read them back");
  r = await W.fetch(new Request("https://x/store/catalog"), env, { waitUntil: p => p }); const cj = await r.json(); ok(cj.methods.length === 1 && !("instructions" in cj.methods[0]) && !("account" in cj.methods[0]), "the public catalog never shows them (only the order does)");
  put("config/storePayments", { methods: METHODS, updatedAt: 9 });
  const noinfo = await adm({ action: "payments_save", methods: [{ name: "x", currency: "y", rate: 3 }] }); ok(noinfo.json.methods[0].instructions === "" && noinfo.json.methods[0].account === "", "a method saved without them has empty ones");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
