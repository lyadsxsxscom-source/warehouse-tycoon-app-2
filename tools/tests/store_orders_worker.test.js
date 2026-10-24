// اختبارات السيرفر: طلبات المتجر من الرصيد (6ب): سعر بمستوى VIP، شراء بيخصم فوراً، رفض بيرجّع، تنفيذ بيحسب الصرف وVIP، استرجاع، إشعارات
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
  put("storeNodes/nP", { parentId: "", type: "folder", name: "PUBG", enabled: true, sort: 1 });
  put("storeNodes/nF", { parentId: "nP", type: "folder", name: "فوري", enabled: true, sort: 1 });
  put("storeNodes/i60", { parentId: "nF", type: "item", name: "60 UC", enabled: true, sort: 1, prices: P10([0.92, 0.9, 0.88, 0.86, 0.84, 0.82, 0.8, 0.78, 0.76, 0.74]) });
  put("storeNodes/i660", { parentId: "nF", type: "item", name: "660 UC", enabled: true, sort: 2, prices: P10([9.26]) });
  put("storeNodes/iPrec", { parentId: "nF", type: "item", name: "precise", enabled: true, sort: 3, prices: P10([0.8663]) });
  put("storeNodes/iHid", { parentId: "nF", type: "item", name: "hidden", enabled: false, sort: 4, prices: P10([1]) });
  put("storeNodes/iNo", { parentId: "nF", type: "item", name: "no usd price", enabled: true, sort: 5, price: 150 });
  put("storeNodes/nOff", { parentId: "", type: "folder", name: "off", enabled: false, sort: 2 });
  put("storeNodes/iUnder", { parentId: "nOff", type: "item", name: "under off", enabled: true, sort: 1, prices: P10([1]) });
  put("storeNodes/iOne", { parentId: "", type: "item", name: "edge", enabled: true, sort: 9, prices: P10([1]) });
  mkC("u1", { balanceUsd: 10 }); mkC("u2", { balanceUsd: 0 });
  TOKS.u3 = { sub: "u3", email: "noacct@x.com" };
  const quote = (itemId, token = "u1") => callApi("/store/quote", { itemId }, token);
  const order = (itemId, playerId, token = "u1", reqId) => callApi("/store/order", { itemId, playerId, reqId: reqId || rid() }, token);
  const myOrders = async (t) => (await callApi("/store/orders", {}, t)).json.orders;
  let r;

  /* ---- A) sign-in ---- */
  for (const path of ["/store/quote", "/store/order", "/store/orders", "/store/prices", "/store/order/proof", "/store/order/cancel"]) { r = await callApi(path, {}, null); ok(r.status === 401, path + " needs sign-in"); }
  ok((await adm({ action: "orders_list" }, "u1")).status === 401 && (await adm({ action: "order_done", id: "x" }, "u1")).status === 401 && (await adm({ action: "order_reject", id: "x", reason: "r" }, null)).status === 401, "customers cannot use the admin actions");
  r = await callApi("/store/quote", { itemId: "i60" }, "u3"); ok(r.status === 400 && r.json.error === "no_account", "someone who never opened a store account is told to open it first");

  /* ---- B) the quote ---- */
  r = await quote("i60"); const q = r.json.quote;
  ok(r.status === 200 && q.itemId === "i60" && q.name === "60 UC" && q.vip === 1 && q.priceUsd === 0.92 && q.balanceUsd === 10 && q.enough === true && q.shortUsd === 0 && !("methods" in q), "a quote: his level price, his balance, and whether it is enough (no payment methods: he pays from the balance)");
  r = await quote("i660", "u2"); ok(r.json.quote.enough === false && r.json.quote.shortUsd === 9.26 && r.json.quote.balanceUsd === 0, "with no balance it says how much is missing ($9.26)");
  mkC("u2", { balanceUsd: 0, spentUsd: 1000 }); r = await quote("i60", "u2"); ok(r.json.quote.vip === 4 && r.json.quote.priceUsd === 0.86, "the price follows his VIP level (1000 spent = VIP 4 = 0.86)");
  mkC("u2", { balanceUsd: 0, merchant: { status: "trial", level: 7, targetUsd: 500, baseSpent: 0, startedAt: NOW, endsAt: NOW + 30 * DAY, prevLevel: 1 } }); r = await quote("i60", "u2"); ok(r.json.quote.vip === 7 && r.json.quote.priceUsd === 0.8, "a merchant on a trial gets his merchant level price (VIP 7 = 0.8)"); mkC("u2", { balanceUsd: 0 });
  for (const [id, label] of [["iHid", "a hidden item"], ["iNo", "an item with no dollar price"], ["iUnder", "an item under a hidden folder"], ["nF", "a folder"], ["ghost", "an unknown id"], ["", "no id"]]) { r = await quote(id); ok(r.status === 404 && r.json.error === "no_item", "no quote for " + label); }
  r = await callApi("/store/prices", {}, "u1"); ok(r.json.vip === 1 && r.json.prices.i60 === 0.92 && r.json.prices.iPrec === 0.8663 && !("iHid" in r.json.prices) && !("iNo" in r.json.prices) && !("iUnder" in r.json.prices) && !("nF" in r.json.prices), "the price list at his level: visible priced items only");
  mkC("u2", { balanceUsd: 0, spentUsd: 1000 }); r = await callApi("/store/prices", {}, "u2"); ok(r.json.vip === 4 && r.json.prices.i60 === 0.86 && r.json.prices.i660 === 9.26, "at VIP 4 the same items have the VIP 4 price"); mkC("u2", { balanceUsd: 0 });
  ok((await callApi("/store/prices", {}, "u3")).json.error === "no_account", "(prices need an account)");

  /* ---- C) buying from the balance ---- */
  const nBefore = ledger("u1").length; r = await order("i60", "123456789"); const o1 = r.json.order;
  ok(r.status === 200 && /^o[0-9a-f]{20}$/.test(o1.id) && o1.kind === "order" && o1.code === "T-1001" && o1.status === "processing" && o1.itemName === "60 UC" && o1.itemPath === "PUBG › فوري › 60 UC" && o1.playerId === "123456789" && o1.vip === 1 && o1.priceUsd === 0.92 && r.json.balanceUsd === 9.08, "an order: code T-1001, 'processing' at once, the product path, his ID, the price at his level, and the new balance");
  ok(bal("u1") === 9.08 && !("uid" in o1) && !("adminNote" in o1) && o1.proof === null && o1.method.id === "" && o1.amount === 0, "the price left his balance at the same moment; the customer's view has no admin fields and no payment details");
  const l1 = ledger("u1"); ok(l1.length === nBefore + 1 && l1[l1.length - 1].type === "order" && l1[l1.length - 1].amountUsd === -0.92 && l1[l1.length - 1].balanceAfter === 9.08 && l1[l1.length - 1].ref === "T-1001" && l1[l1.length - 1].note === "60 UC", "the ledger records it (amount, balance after, the order code)");
  ok(get("storeOrders/" + o1.id).uid === "u1" && get("storeOrders/" + o1.id).events[0].action === "created" && get("counters/store").n === 1001 && get("storeCustomers/u1").spentUsd === 0, "the stored order has a history; the counter moved; spending (for VIP) is NOT counted until you deliver");
  r = await order("iPrec", "ID-77 #a"); ok(r.json.order.code === "T-1002" && bal("u1") === 8.2137 && r.json.balanceUsd === 8.2137, "4-decimal prices are kept exactly ($9.08 - $0.8663 = $8.2137) (letters, digits, spaces and # are fine in an ID)");
  r = await order("iOne", "99999", "u1"); r = await order("iOne", "99998", "u1"); ok(bal("u1") === 6.2137, "(two more orders)");
  for (const [pid, label] of [["12", "too short"], ["", "empty"], ["<script>alert(1)</script>", "HTML"], ["a".repeat(41), "too long"], ["id!!", "symbols"], ["12\n34", "a line break"]]) { const bb = bal("u1"); r = await order("iOne", pid); ok(r.status === 400 && r.json.error === "bad_player" && bal("u1") === bb, "refused Player ID: " + label + " (balance untouched)"); }
  r = await order("iOne", "١٢٣٤٥٦"); ok(r.status === 200, "digits in other scripts are accepted"); mkC("u1", { balanceUsd: 10 });
  r = await order("iHid", "12345"); ok(r.status === 404 && bal("u1") === 10, "an order for a hidden item is refused");
  for (const bad of ["", "short", "has space in it!", "x".repeat(65)]) { r = await callApi("/store/order", { itemId: "iOne", playerId: "12345", reqId: bad }, "u1"); ok(r.status === 400 && r.json.error === "bad_request", "refused request id: " + JSON.stringify(bad.slice(0, 10))); }
  /* not enough balance */
  mkC("u2", { balanceUsd: 3.5 }); const lenU2 = ledger("u2").length; r = await order("i660", "55555", "u2");
  ok(r.status === 400 && r.json.error === "insufficient_balance" && r.json.balanceUsd === 3.5 && r.json.priceUsd === 9.26 && r.json.shortUsd === 5.76 && /اشحن رصيدك/.test(r.json.message) && bal("u2") === 3.5 && ledger("u2").length === lenU2, "not enough balance: a clear answer with the balance, the price and how much is missing ($5.76); nothing is created or deducted");
  mkC("u2", { balanceUsd: 0.92 }); r = await order("i60", "55555", "u2"); ok(r.status === 200 && bal("u2") === 0 && r.json.balanceUsd === 0, "a balance exactly equal to the price is enough (and goes to 0)");
  mkC("u2", { balanceUsd: 0.1 + 0.2 + 0.62 }); r = await order("i60", "55556", "u2"); ok(r.status === 200, "decimal dust in the balance (0.1 + 0.2 + 0.62) does not make an exact balance fail");
  /* double tap */
  mkC("u1", { balanceUsd: 10 }); const nb = get("counters/store").n, same = rid(); const a1 = await order("iOne", "99999", "u1", same), a2 = await order("iOne", "99999", "u1", same);
  ok(a1.json.order.id === a2.json.order.id && a2.json.duplicate === true && a1.json.order.code === a2.json.order.code && get("counters/store").n === nb + 1 && bal("u1") === 9, "sending the same request twice (a double tap, a retry) gives the same order, one number, and charges ONCE");
  const b1 = await order("iOne", "99999", "u2", same); ok(b1.status === 400 || b1.json.order.id !== a1.json.order.id, "another customer with the same request id gets his own order (or his own error), never the same order");
  /* limit of open orders */
  r = await adm({ action: "wallet_save", cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 3 } });
  mkC("u4", { balanceUsd: 100 }); TOKS.u4 = { sub: "u4", name: "Lim", email: "l@x.com" }; const lim = []; for (let i = 0; i < 3; i++) lim.push((await order("iOne", "1000" + i, "u4")).json.order);
  r = await order("iOne", "10009", "u4"); ok(r.status === 400 && r.json.error === "too_many_open" && /3/.test(r.json.message) && bal("u4") === 97, "at most the configured number of orders in progress (3 here), and the refused one costs nothing");
  await adm({ action: "order_done", id: lim[0].id }); r = await order("iOne", "10010", "u4"); ok(r.status === 200, "when you deliver one, a place frees up"); await adm({ action: "wallet_save", cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10 } });
  /* same moment */
  mkC("u1", { balanceUsd: 10 }); injectConflictOn = "counters/store"; const nb2 = get("counters/store").n; r = await order("iOne", "77777", "u1");
  ok(r.status === 200 && r.json.order.code === "T-" + (nb2 + 2) && [...store.keys()].filter(k => k.startsWith("storeOrders/") && get(k).code === r.json.order.code).length === 1 && bal("u1") === 9, "if another order takes the number first, ours retries and gets the next one (one order, charged once)");
  injectConflictOn = "storeCustomers/u1"; r = await order("iOne", "77778", "u1"); ok(r.status === 200 && bal("u1") === 8, "if his balance changes at the same moment it retries and charges once");

  /* ---- D) my orders, cancel, proof ---- */
  const mine = await myOrders("u1"); ok(mine.length >= 4 && mine.every((x, i, a) => i === 0 || a[i - 1].createdAt >= x.createdAt) && mine.every(x => x.kind === "order") && !(await myOrders("u2")).some(x => x.id === o1.id), "my orders: newest first, only my own");
  r = await callApi("/store/order/cancel", { orderId: o1.id }, "u1"); ok(r.status === 400 && r.json.error === "bad_status" && /قيد التنفيذ/.test(r.json.message) && get("storeOrders/" + o1.id).status === "processing" && bal("u1") === 8, "a paid order cannot be cancelled by the customer (the admin decides)");
  r = await callApi("/store/order/proof", { orderId: o1.id, ref: "x" }, "u1"); ok(r.status === 400 && r.json.error === "bad_status", "and there is no payment proof for it (already paid from the balance)");
  r = await callApi("/store/order/cancel", { orderId: o1.id }, "u2"); ok(r.status === 404, "nobody else can touch it");

  /* ---- E) the admin list ---- */
  r = await adm({ action: "orders_list" }); const L = r.json;
  ok(r.status === 200 && L.total >= 8 && L.counts.processing >= 8 && L.waiting === L.counts.processing && L.kinds.order >= 8 && L.orders.every((x, i, a) => i === 0 || a[i - 1].createdAt >= x.createdAt), "the admin list: every order newest first, a count per status, and how many are waiting for you");
  const ad = L.orders.find(x => x.id === o1.id); ok(ad.uid === "u1" && ad.name === "Ali" && ad.email === "ali@x.com" && Array.isArray(ad.events) && ad.adminNote === "" && ad.kind === "order", "the admin sees who, the history and the kind");
  r = await adm({ action: "orders_list", status: "waiting" }); ok(r.json.orders.every(x => x.status === "processing" || x.status === "payment_submitted") && r.json.orders.length === L.waiting, "'waiting' = paid orders to deliver and payments to confirm");
  r = await adm({ action: "orders_list", status: "processing" }); ok(r.json.orders.length === L.counts.processing, "filter by status");
  r = await adm({ action: "orders_list", status: "open" }); ok(r.json.orders.length >= L.counts.processing, "'open' includes orders in progress");
  r = await adm({ action: "orders_list", kind: "topup" }); ok(r.json.orders.length === 0, "filter by kind (no deposits yet)");
  r = await adm({ action: "orders_list", q: "T-1002" }); ok(r.json.orders.length === 1 && r.json.orders[0].code === "T-1002", "search by order code");
  r = await adm({ action: "orders_list", q: "ID-77" }); ok(r.json.orders.length === 1, "by Player ID"); r = await adm({ action: "orders_list", q: "60 UC" }); ok(r.json.orders.length >= 1, "by product"); r = await adm({ action: "orders_list", q: "ALI@x" }); ok(r.json.orders.length >= 3, "by email, any case");

  /* ---- F) delivering ---- */
  const done = (id, note, token = "admin") => adm({ action: "order_done", id, note }, token);
  const bUser = bal("u1"); const spentBefore = spent("u1"); r = await done(o1.id, "sent to the player");
  ok(r.status === 200 && r.json.order.status === "done" && r.json.order.adminNote === "sent to the player" && r.json.order.doneAt >= NOW && r.json.order.events.slice(-1)[0].action === "done", "marking delivered: status, time, your note, history");
  ok(spent("u1") === r2(spentBefore + 0.92) && bal("u1") === bUser, "now the price counts as his SPENDING (for VIP), and his balance is not touched again");
  function r2(x) { return Math.round(x * 100) / 100; }
  const sl = [...store.keys()].filter(k => k.startsWith("storeSpendLog/")).map(k => get(k)).filter(x => x.uid === "u1"); ok(sl.length === 1 && sl[0].deltaUsd === 0.92 && sl[0].note === "طلب T-1001" && sl[0].by === "order", "the spending is logged with the order code");
  r = await done(o1.id); ok(r.status === 400 && r.json.error === "bad_status" && spent("u1") === r2(spentBefore + 0.92), "delivering twice is refused and never counts twice");
  r = await done("ghost"); ok(r.status === 404, "(unknown order)"); r = await done("a/b"); ok(r.status === 400, "(bad id)"); ok((await done(o1.id, "", "u1")).status === 401, "(customers cannot)");
  mkC("m1", { balanceUsd: 20, spentUsd: 0, merchant: { status: "trial", level: 5, targetUsd: 2, baseSpent: 0, startedAt: NOW, endsAt: NOW + 30 * DAY, prevLevel: 1 } }); TOKS.m1 = { sub: "m1", name: "Trader", email: "t@x.com" };
  const mo = (await order("i660", "70707", "m1")).json.order; ok(mo.vip === 5 && mo.priceUsd === 9.26 && bal("m1") === 10.74 && get("storeCustomers/m1").merchant.status === "trial", "a merchant buys at his merchant price (VIP 5); still a trial until delivery");
  await done(mo.id); ok(get("storeCustomers/m1").merchant.status === "locked" && spent("m1") === 9.26 && [...store.keys()].some(k => k.startsWith("storeVipLog/") && get(k).uid === "m1" && get(k).action === "auto_lock"), "a delivered order that reaches a merchant's promise locks him automatically");
  const cc = (await order("iOne", "80808", "u1")).json.order; const cc0 = spent("u1"); injectConflictOn = "storeCustomers/u1"; r = await done(cc.id); ok(r.status === 200 && spent("u1") === r2(cc0 + 1) && get("storeOrders/" + cc.id).status === "done", "if the customer record changes at the same moment, it retries and counts once");
  const gone = (await order("iOne", "90909", "u1")).json.order; const savedC = get("storeCustomers/u1"); store.delete("storeCustomers/u1"); r = await done(gone.id);
  ok(r.status === 404 && r.json.error === "no_customer" && get("storeOrders/" + gone.id).status === "processing", "if his account no longer exists the order is not marked done (nothing half-done)"); put("storeCustomers/u1", savedC);

  /* ---- G) rejecting: the money goes back ---- */
  mkC("u5", { balanceUsd: 5 }); TOKS.u5 = { sub: "u5", name: "Five", email: "f@x.com" }; const rj = (await order("i60", "11122", "u5")).json.order; ok(bal("u5") === 4.08, "(he bought: $5 - $0.92)");
  r = await adm({ action: "order_reject", id: rj.id }); ok(r.status === 400 && r.json.error === "reason_required" && bal("u5") === 4.08, "a reason is required (and nothing moves without it)");
  r = await adm({ action: "order_reject", id: rj.id, reason: "<b>wrong ID</b> sorry" }); ok(r.status === 200 && r.json.order.status === "rejected" && r.json.order.rejectReason === "wrong ID sorry", "rejecting stores the (cleaned) reason");
  ok(bal("u5") === 5 && spent("u5") === 0, "and his $0.92 is back on his balance at once; no spending counted");
  const lr = ledger("u5"); ok(lr.map(x => x.type).join() === "order,order_refund" && lr[1].amountUsd === 0.92 && lr[1].balanceAfter === 5 && lr[1].ref === rj.code && lr[1].note === "wrong ID sorry", "the ledger shows the purchase and the refund, with the reason");
  r = await myOrders("u5"); ok(r[0].status === "rejected" && r[0].rejectReason === "wrong ID sorry", "the customer sees the reason");
  r = await adm({ action: "order_reject", id: rj.id, reason: "again" }); ok(r.status === 400 && bal("u5") === 5, "rejecting twice is refused and never refunds twice");
  r = await done(rj.id); ok(r.status === 400, "a rejected order cannot be delivered");
  r = await adm({ action: "order_reject", id: o1.id, reason: "x" }); ok(r.status === 400 && bal("u1") === bUser - 0 || r.status === 400, "a delivered order cannot be rejected (use refund)");
  const rj2 = (await order("i60", "11123", "u5")).json.order; injectConflictOn = "storeCustomers/u5"; r = await adm({ action: "order_reject", id: rj2.id, reason: "x" }); ok(r.status === 200 && bal("u5") === 5, "a same-moment change on his record: it retries and refunds once");

  /* ---- H) refund after delivery ---- */
  mkC("u6", { balanceUsd: 5, spentUsd: 195 }); TOKS.u6 = { sub: "u6", name: "Six", email: "s@x.com" }; const rf = (await order("iOne", "13131", "u6")).json.order; await done(rf.id);
  ok(spent("u6") === 196 && bal("u6") === 4, "(he bought and you delivered: spent 196, balance 4)");
  r = await adm({ action: "order_refund", id: rf.id, note: "wrong ID, refunded to balance" }); ok(r.status === 200 && r.json.order.status === "refunded" && spent("u6") === 195 && bal("u6") === 5, "a refund returns the price to his balance and takes it off his spending");
  ok(ledger("u6").map(x => x.type).join() === "order,refund" && ledger("u6")[1].amountUsd === 1 && ledger("u6")[1].ref === rf.code, "and is logged");
  r = await adm({ action: "order_refund", id: rf.id }); ok(r.status === 400 && bal("u6") === 5, "refunding twice is refused"); r = await adm({ action: "order_refund", id: rj.id }); ok(r.status === 400, "only a delivered order can be refunded");
  /* legacy orders (first version, paid per order) keep working */
  put("storeOrders/oLegacy", { code: "T-0900", uid: "u6", name: "Six", email: "s@x.com", itemName: "old", priceUsd: 2, status: "payment_submitted", createdAt: NOW, events: [], proof: { ref: "x", submittedAt: NOW } }); const sp = spent("u6"), bl = bal("u6");
  r = await done("oLegacy"); ok(r.status === 200 && spent("u6") === sp + 2 && bal("u6") === bl, "an order from the first version (paid per order) can still be delivered: it counts as spending, the balance is untouched");
  put("storeOrders/oLegacy2", { code: "T-0901", uid: "u6", name: "Six", email: "s@x.com", itemName: "old", priceUsd: 2, status: "awaiting_payment", createdAt: NOW, events: [] }); r = await adm({ action: "order_reject", id: "oLegacy2", reason: "never paid" }); ok(r.status === 200 && bal("u6") === bl, "and a rejected one refunds nothing (it was never paid from the balance)");

  /* ---- I) notifications ---- */
  { const p0 = pushes.length; mkC("u7", { balanceUsd: 5 }); TOKS.u7 = { sub: "u7", name: "Seven", email: "se@x.com" };
    const n1 = (await order("iOne", "35353", "u7")).json.order; await done(n1.id);
    const d1 = pushes.slice(p0).find(x => x.uid === "u7" && x.type === "store_done"); ok(d1 && d1.params.code === n1.code && d1.params.item === "edge", "delivering sends the customer a push with the code and the product");
    const n2 = (await order("iOne", "36363", "u7")).json.order; await adm({ action: "order_reject", id: n2.id, reason: "no stock" });
    const d2 = pushes.slice(p0).find(x => x.uid === "u7" && x.type === "store_rejected"); ok(d2 && d2.params.reason === "no stock", "rejecting sends it with the reason");
    await adm({ action: "order_refund", id: n1.id, note: "wrong ID" }); ok(pushes.slice(p0).some(x => x.uid === "u7" && x.type === "store_refunded" && x.params.note === "wrong ID"), "a refund sends one too");
    const before2 = pushes.length; await done(n2.id); await adm({ action: "order_refund", id: n2.id }); ok(pushes.length === before2, "refused admin actions send nothing");
    pushFails = true; const n3 = (await order("iOne", "37373", "u7")).json.order; r = await done(n3.id); pushFails = false; ok(r.status === 200 && get("storeOrders/" + n3.id).status === "done", "if the notification service is down the order is still delivered"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
