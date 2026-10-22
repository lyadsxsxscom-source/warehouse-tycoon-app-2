// اختبارات السيرفر: حذف حساب المتجر (8): بدون رصيد فوراً، ومع رصيد طلب سحب (R-1001)، إخفاء الهوية، إلغاء الطلب، رفض/تنفيذ من الأدمن، وإكمال حذف انقطع
// التشغيل: node tools/tests/store_delete_worker.test.js
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
  const del = (op, extra, token = "u1") => callApi("/store/deleteMe", { op, ...extra }, token);
  const request = (extra, token = "u1") => del("request", { confirm: true, reqId: rid(), ...extra }, token);
  let failCommitOn = null; const baseCommit = c.fsCommit; c.fsCommit = async (e, ws) => { if (failCommitOn && ws.some(w => w.update && w.update.name.includes(failCommitOn))) { failCommitOn = null; throw new Error("boom"); } return baseCommit(e, ws); };
  put("storeNodes/i60", { parentId: "", type: "item", name: "60 UC", enabled: true, sort: 1, prices: P10([0.92]) });
  put("config/storePayments", { methods: [{ id: "sham", name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0, enabled: true, instructions: "", account: "0932" }], updatedAt: 1 });
  const mkO = (id, uid, status, o) => put("storeOrders/" + id, { code: "T-" + id, kind: "order", uid, name: "Ali Salem", email: "ali@x.com", itemId: "i60", itemName: "60 UC", itemPath: "60 UC", playerId: "5123456789", vip: 1, priceUsd: 0.92, status, createdAt: NOW - DAY, updatedAt: NOW - DAY, events: [], ...o });
  const dump = () => JSON.stringify([...store.entries()].filter(([k]) => /^(storeOrders|storeLedger|storeSpendLog|storeVipLog|storeProofs|storeCustomers|storeRate)\//.test(k)).map(([k, v]) => [k, c.fieldsToObj(v.fields)]));
  let r;

  /* ---- A) sign-in and the account ---- */
  ok((await callApi("/store/deleteMe", { op: "check" }, null)).status === 401, "needs sign-in");
  r = await del("check"); ok(r.status === 400 && r.json.error === "no_account", "someone with no store account has nothing to delete");
  mkC("u1", { balanceUsd: 0 }); mkC("u2", { balanceUsd: 25, spentUsd: 80 }); mkC("u3", { balanceUsd: 5 }); TOKS.u3 = { sub: "u3", name: "Three", email: "three@x.com" };
  r = await del("nothing"); ok(r.status === 400 && r.json.error === "bad_request", "an unknown operation is refused");

  /* ---- B) what blocks a deletion ---- */
  mkO("p1", "u1", "processing"); mkO("p2", "u1", "done"); mkO("p3", "u1", "rejected"); put("storeOrders/t1", { code: "D-t1", kind: "topup", uid: "u1", status: "awaiting_payment", createdAt: NOW, expiresAt: NOW + 1800000, priceUsd: 10, events: [] }); put("storeOrders/t2", { code: "D-t2", kind: "topup", uid: "u1", status: "awaiting_payment", createdAt: NOW - 2 * DAY, expiresAt: NOW - 2 * DAY, priceUsd: 10, events: [] }); put("storeOrders/t3", { code: "D-t3", kind: "topup", uid: "u1", status: "payment_submitted", createdAt: NOW, priceUsd: 10, events: [] }); put("storeOrders/t4", { code: "D-t4", kind: "topup", uid: "u1", status: "done", createdAt: NOW, priceUsd: 10, events: [] });
  r = await del("check"); ok(r.status === 200 && r.json.balanceUsd === 0 && r.json.openOrders.sort().join() === "D-t1,D-t3,T-p1" && r.json.closing === null && r.json.canDelete === false, "the check lists what is still open (a paid order in progress, an unpaid deposit, a deposit waiting for you); finished or expired ones do not count; deletion is not allowed yet");
  r = await request({}); ok(r.status === 400 && r.json.error === "has_open" && /T-p1/.test(r.json.message) && /D-t1/.test(r.json.message) && store.has("storeCustomers/u1"), "requesting deletion with open orders is refused with their codes, and nothing is deleted");
  r = await del("request", { reqId: rid() }); ok(r.status === 400 && r.json.error === "confirm_required", "the customer must confirm that it is permanent");
  r = await del("request", { confirm: "yes", reqId: rid() }); ok(r.status === 400 && r.json.error === "confirm_required", "only a real 'true' counts as confirmation");
  r = await del("request", { confirm: true, reqId: "short" }); ok(r.status === 400 && r.json.error === "bad_request", "a bad request id is refused");
  for (const k of ["storeOrders/p1", "storeOrders/t1", "storeOrders/t3"]) store.delete(k);

  /* ---- C) no balance: deleted at once, and made anonymous ---- */
  put("players/u1", { points: 777, balanceUsd: 12.34, shelves: [] }); put("storeProofs/p2", { data: PNG, ver: NOW }); put("storeOrders/p2", { ...get("storeOrders/p2"), proof: { ref: "TX-SECRET", hasImage: true, submittedAt: NOW } });
  put("storeLedger/l1", { uid: "u1", type: "topup", amountUsd: 10, balanceAfter: 10, ref: "D-t4", note: "", at: NOW - DAY, by: "admin" }); put("storeLedger/l2", { uid: "u1", type: "order", amountUsd: -0.92, balanceAfter: 9.08, ref: "T-p2", note: "60 UC", at: NOW - DAY, by: "customer" });
  put("storeSpendLog/s1", { uid: "u1", deltaUsd: 0.92, spentAfter: 0.92, note: "طلب T-p2", at: NOW, by: "order" }); put("storeVipLog/v1", { uid: "u1", action: "set", level: 5, at: NOW, by: "admin" }); put("storeRate/validate_u1", { start: NOW, n: 3 });
  put("storeLedger/lU2", { uid: "u2", type: "topup", amountUsd: 25, balanceAfter: 25, ref: "D-x", note: "", at: NOW, by: "admin" }); mkO("o2a", "u2", "done", { name: "Omar", email: "omar@x.com", playerId: "777" });
  const before = { u2orders: JSON.stringify(get("storeOrders/o2a")), u2ledger: JSON.stringify(get("storeLedger/lU2")), player: JSON.stringify(get("players/u1")) };
  r = await request({}); ok(r.status === 200 && r.json.deleted === true, "with no balance and nothing open, the account is deleted at once");
  ok(!store.has("storeCustomers/u1") && !store.has("storeRate/validate_u1") && !store.has("storeProofs/p2"), "the customer record, his check-allowance record and his receipt picture are gone");
  const po = get("storeOrders/p2"), tag = po.uid; ok(/^deleted-[0-9a-f]{12}$/.test(tag) && po.name === "حساب محذوف" && po.email === "" && po.playerId === "" && po.proof.ref === "" && po.proof.hasImage === false && po.code === "T-p2" && po.priceUsd === 0.92 && po.itemName === "60 UC" && po.status === "done" && po.createdAt === NOW - DAY && po.deletedAt > 0, "his orders stay as anonymous bookkeeping records: no name, email, Player ID or payment reference; code, product, price, status and dates are kept");
  ok(get("storeLedger/l1").uid === tag && get("storeLedger/l1").amountUsd === 10 && get("storeLedger/l2").uid === tag && get("storeLedger/l2").amountUsd === -0.92 && get("storeLedger/l2").ref === "T-p2" && get("storeSpendLog/s1").uid === tag && get("storeSpendLog/s1").deltaUsd === 0.92 && get("storeVipLog/v1").uid === tag, "the ledger, spending log and VIP log are kept with the amounts but under the anonymous tag");
  ok(!JSON.stringify([...store.entries()].filter(([k]) => /^store/.test(k)).map(([k, v]) => c.fieldsToObj(v.fields))).match(/ali@x\.com|Ali Salem|5123456789|TX-SECRET/), "nothing in any store record still carries his email, name, Player ID or payment reference");
  ok(!JSON.stringify([...store.keys()].filter(k => /^store/.test(k))).includes("u1") || ![...store.keys()].some(k => /^store(Orders|Ledger|SpendLog|VipLog)\//.test(k) && c.fieldsToObj(store.get(k).fields).uid === "u1"), "no record points to his account id any more");
  ok(JSON.stringify(get("storeOrders/o2a")) === before.u2orders && JSON.stringify(get("storeLedger/lU2")) === before.u2ledger && store.has("storeCustomers/u2"), "another customer's orders, ledger and account are untouched");
  ok(JSON.stringify(get("players/u1")) === before.player, "his GAME account is untouched (points and the game's own balance)");
  ok(tag !== (await vm.runInContext("storeDelTag", c)("u2")) && !tag.includes("u1"), "the anonymous tag is different for every customer and does not reveal the account id");
  mkC("u1", { balanceUsd: 0.004 }); r = await request({}, "u1"); ok(r.status === 200 && r.json.deleted === true && !store.has("storeCustomers/u1"), "a balance under one cent counts as zero (no refund request for dust)");
  r = await del("check"); ok(r.status === 400 && r.json.error === "no_account", "after deletion the account no longer exists (signing in again would create a new empty one)");

  /* ---- D) with a balance: a refund request that holds the money ---- */
  mkO("q1", "u2", "done", { name: "Omar", email: "omar@x.com", playerId: "777" });
  r = await request({}, "u2"); ok(r.status === 400 && r.json.error === "payout_required" && get("storeCustomers/u2").balanceUsd === 25, "with a balance he must say how to receive it; nothing moves without it");
  for (const [m, a, label] of [["", "0932111222", "no method"], ["شام كاش", "", "no account"], ["x", "0932111222", "a one-letter method"], ["شام كاش", "12", "a two-digit account"]]) { r = await request({ payoutMethod: m, payoutAccount: a }, "u2"); ok(r.status === 400 && r.json.error === "payout_required", "refused: " + label); }
  const reqId = rid(); const pushes0 = pushes.length;
  r = await del("request", { confirm: true, reqId, payoutMethod: "<b>شام كاش</b>", payoutAccount: "0932 111 222" }, "u2"); const rq = r.json.request;
  ok(r.status === 200 && rq.kind === "refund" && rq.code === "R-1001" && rq.status === "processing" && rq.priceUsd === 25 && rq.payout.method === "شام كاش" && rq.payout.account === "0932 111 222" && rq.itemName === "طلب سحب الرصيد وحذف الحساب" && !("uid" in rq), "a refund request R-1001 for the whole balance ($25) with the way to receive it (cleaned); the customer's view has no admin fields");
  const cu = get("storeCustomers/u2"); ok(cu.balanceUsd === 0 && cu.closing.code === "R-1001" && cu.closing.amountUsd === 25 && cu.closing.orderId === rq.id && cu.closing.requestedAt > 0, "his balance is now held in the request (balance $0), and the account is marked as closing");
  const hold = [...store.keys()].filter(k => k.startsWith("storeLedger/")).map(k => get(k)).filter(x => x.uid === "u2" && x.type === "payout_hold"); ok(hold.length === 1 && hold[0].amountUsd === -25 && hold[0].balanceAfter === 0 && hold[0].ref === "R-1001" && hold[0].note === "شام كاش", "the ledger records the hold");
  ok(pushes.slice(pushes0).some(x => x.uid === ADMIN && x.type === "store_refund_request" && x.params.code === "R-1001" && x.params.amount === "25.00" && x.params.method === "شام كاش"), "YOU get a push: the request code, the amount and the method");
  const dupe = await del("request", { confirm: true, reqId, payoutMethod: "x", payoutAccount: "y" }, "u2"); ok(dupe.json.duplicate === true && dupe.json.request.code === "R-1001" && [...store.keys()].filter(k => k.startsWith("storeOrders/") && get(k).kind === "refund").length === 1 && get("storeCustomers/u2").balanceUsd === 0, "pressing twice (same request id) gives the same request: one request, nothing held twice");
  r = await request({ payoutMethod: "USDT", payoutAccount: "0xabc123" }, "u2"); ok(r.status === 400 && r.json.error === "already_closing" && /R-1001/.test(r.json.message), "a second request is refused while the first is pending");
  r = await del("check", {}, "u2"); ok(r.json.closing.code === "R-1001" && r.json.closing.amountUsd === 25 && r.json.canDelete === false && r.json.openOrders.length === 0, "the check reports the pending request (and the request itself is not counted as an open order)");
  const me = (await callApi("/store/me", {}, "u2")).json.customer; ok(me.closing && me.closing.code === "R-1001" && me.closing.amountUsd === 25 && me.balanceUsd === 0, "/store/me tells the page the account is closing");
  put("storeNodes/i60", { parentId: "", type: "item", name: "60 UC", enabled: true, sort: 1, prices: P10([0.92]) });
  r = await callApi("/store/order", { itemId: "i60", playerId: "123456789", reqId: rid() }, "u2"); ok(r.status === 400 && r.json.error === "account_closing" && /R-1001/.test(r.json.message), "a closing account cannot place orders");
  r = await callApi("/store/topup", { amountUsd: 10, methodId: "sham", reqId: rid() }, "u2"); ok(r.status === 400 && r.json.error === "account_closing", "nor start deposits");
  r = await callApi("/store/quote", { itemId: "i60" }, "u2"); ok(r.status === 200, "but he can still look at prices");
  r = await callApi("/store/orders", {}, "u2"); ok(r.json.orders.some(o => o.kind === "refund" && o.code === "R-1001" && o.payout.account === "0932 111 222"), "his request appears in his own list");

  /* ---- E) changing his mind ---- */
  r = await del("cancel", {}, "u2"); ok(r.status === 200 && r.json.balanceUsd === 25 && get("storeCustomers/u2").balanceUsd === 25 && get("storeCustomers/u2").closing === null && get("storeOrders/" + rq.id).status === "cancelled", "cancelling returns the whole balance, reopens the account and cancels the request");
  const back = [...store.keys()].filter(k => k.startsWith("storeLedger/")).map(k => get(k)).filter(x => x.uid === "u2" && x.type === "payout_return"); ok(back.length === 1 && back[0].amountUsd === 25 && back[0].balanceAfter === 25, "(logged in the ledger)");
  r = await del("cancel", {}, "u2"); ok(r.status === 400 && r.json.error === "not_closing", "cancelling when there is no request is refused");
  r = await callApi("/store/order", { itemId: "i60", playerId: "123456789", reqId: rid() }, "u2"); ok(r.status === 200, "after cancelling he can order again"); const ordId = r.json.order.id;
  r = await request({ payoutMethod: "USDT", payoutAccount: "0xabc123" }, "u2"); ok(r.status === 400 && r.json.error === "has_open" && /T-/.test(r.json.message) && get("storeCustomers/u2").balanceUsd === 24.08, "an order still in progress blocks a new request (and nothing is held)");
  await adm({ action: "order_done", id: ordId });
  const rq2 = (await request({ payoutMethod: "USDT BEP20", payoutAccount: "0xabc123def" }, "u2")).json.request; ok(rq2 && rq2.code === "R-1002" && rq2.priceUsd === 24.08 && get("storeCustomers/u2").balanceUsd === 0, "once it is delivered, a new request goes through with a new number (R-1002) for what is left ($24.08)");
  r = await del("cancel", {}, "u2"); ok(r.status === 200 && r.json.balanceUsd === 24.08, "(cancelled again: the balance is back)");

  /* ---- F) you handle the request ---- */
  const rq4 = (await request({ payoutMethod: "شام كاش", payoutAccount: "0932111222" }, "u2")).json.request; const bal4 = 25 - 0.92;
  r = await adm({ action: "orders_list", kind: "refund" }); ok(r.status === 200 && r.json.orders.length >= 1 && r.json.orders.every(o => o.kind === "refund") && r.json.orders.find(o => o.id === rq4.id).payout.method === "شام كاش" && r.json.orders.find(o => o.id === rq4.id).name === "Omar" && r.json.orders.find(o => o.id === rq4.id).email === "omar@x.com", "the admin list can show only refund requests, with the customer and where to send the money");
  r = await adm({ action: "orders_list", status: "waiting" }); ok(r.json.orders.some(o => o.id === rq4.id) && r.json.waiting >= 1, "a pending request counts as 'waiting for you'");
  r = await adm({ action: "order_refund", id: rq4.id }); ok(r.status === 400 && r.json.error === "bad_status", "'refund' does not apply to a refund request");
  r = await adm({ action: "order_reject", id: rq4.id }); ok(r.status === 400 && r.json.error === "reason_required", "rejecting needs a reason");
  r = await adm({ action: "order_reject", id: rq4.id, reason: "<b>unclear</b> account" }); ok(r.status === 200 && r.json.order.status === "rejected" && r.json.order.rejectReason === "unclear account" && get("storeCustomers/u2").balanceUsd === r4x(bal4) && get("storeCustomers/u2").closing === null, "rejecting returns the balance, reopens the account and keeps the reason");
  function r4x(x) { return Math.round(x * 10000) / 10000; }
  ok(pushes.some(x => x.uid === "u2" && x.type === "store_rejected" && x.params.reason === "unclear account" && x.params.item === "طلب سحب الرصيد وحذف الحساب"), "the customer is notified with the reason");
  ok([...store.keys()].map(k => k.startsWith("storeLedger/") ? get(k) : null).filter(Boolean).some(x => x.uid === "u2" && x.type === "payout_return" && x.ref === rq4.code && x.note === "unclear account"), "(and the ledger shows the money returning)");
  r = await adm({ action: "order_reject", id: rq4.id, reason: "again" }); ok(r.status === 400, "rejecting twice is refused");
  const rq5 = (await request({ payoutMethod: "شام كاش", payoutAccount: "0932111222" }, "u2")).json.request; const heldAmount = rq5.priceUsd; put("storeOrders/o2b", { ...get("storeOrders/o2a"), name: "Omar", email: "omar@x.com", playerId: "777" }); put("storeProofs/o2b", { data: PNG, ver: NOW }); put("storeProofs/o2a", { data: PNG, ver: NOW });
  const p0 = pushes.length; r = await adm({ action: "order_done", id: rq5.id, note: "sent 24.08 via Sham Cash" });
  ok(r.status === 200 && !r.json.warning && r.json.order.status === "done" && r.json.order.adminNote === "sent 24.08 via Sham Cash" && r.json.order.finalizePending === false && r.json.order.priceUsd === heldAmount && r.json.order.code === rq5.code, "marking it done (you sent the money): done, with your note");
  ok(pushes.slice(p0).some(x => x.uid === "u2" && x.type === "store_payout_done" && x.params.code === rq5.code && x.params.amount === heldAmount.toFixed(2)), "the customer is told his balance was sent and the account deleted (sent BEFORE the account is anonymised)");
  const fin = get("storeOrders/" + rq5.id); ok(!store.has("storeCustomers/u2") && fin.status === "done" && /^deleted-/.test(fin.uid) && fin.name === "حساب محذوف" && fin.email === "" && fin.payout.method === "" && fin.payout.account === "" && fin.priceUsd === heldAmount && fin.finalizePending === false, "his account is deleted; the request itself is kept as an anonymous record (the amount and the code stay, the payout details are wiped)");
  ok(!store.has("storeProofs/o2a") && !store.has("storeProofs/o2b") && get("storeOrders/o2a").name === "حساب محذوف" && get("storeOrders/o2b").playerId === "", "all his other orders and receipt pictures were anonymised and removed too");
  ok(!dump().match(/omar@x\.com|0932 ?111 ?222|"Omar"|"777"/), "no store record still holds his email, name, Player ID or payout account");
  r = await adm({ action: "order_done", id: rq5.id }); ok(r.status === 400, "marking it done twice is refused");

  /* ---- G) the deletion that was interrupted can be finished ---- */
  mkC("u4", { balanceUsd: 8 }); TOKS.u4 = { sub: "u4", name: "Four", email: "four@x.com" }; mkO("w1", "u4", "done", { name: "Four", email: "four@x.com", playerId: "444" }); put("storeLedger/lw", { uid: "u4", type: "topup", amountUsd: 8, balanceAfter: 8, ref: "D-w", note: "", at: NOW, by: "admin" });
  const rq6 = (await request({ payoutMethod: "USDT", payoutAccount: "0xabcdef" }, "u4")).json.request;
  failCommitOn = "storeLedger/"; r = await adm({ action: "order_done", id: rq6.id });
  ok(r.status === 200 && /إكمال الحذف/.test(r.json.warning) && r.json.order.status === "done" && r.json.order.finalizePending === true && store.has("storeCustomers/u4") && get("storeOrders/" + rq6.id).uid === "u4", "if the clean-up breaks half way you are told, the request stays 'done' and marked unfinished, and nothing needed to retry is lost (it still has the original account id)");
  ok((await adm({ action: "order_finish_deletion", id: rq6.id }, "u1")).status === 401, "only the admin can finish it");
  r = await adm({ action: "order_finish_deletion", id: rq6.id }); ok(r.status === 200 && r.json.order.finalizePending === false && !store.has("storeCustomers/u4") && get("storeLedger/lw").uid.startsWith("deleted-") && get("storeOrders/w1").name === "حساب محذوف", "finishing completes the deletion");
  r = await adm({ action: "order_finish_deletion", id: rq6.id }); ok(r.status === 400 && r.json.error === "bad_status", "finishing twice is refused"); r = await adm({ action: "order_finish_deletion", id: "ghost" }); ok(r.status === 404, "(unknown)"); r = await adm({ action: "order_finish_deletion", id: "p2" }); ok(r.status === 400, "(an ordinary order has nothing to finish)");

  /* ---- H) two things at the same moment ---- */
  mkC("u5", { balanceUsd: 12 }); TOKS.u5 = { sub: "u5", name: "Five", email: "five@x.com" }; injectConflictOn = "storeCustomers/u5"; r = await request({ payoutMethod: "شام كاش", payoutAccount: "0932000111" }, "u5");
  ok(r.status === 200 && r.json.request.priceUsd === 12 && get("storeCustomers/u5").balanceUsd === 0 && [...store.keys()].filter(k => k.startsWith("storeOrders/") && get(k).uid === "u5" && get(k).kind === "refund").length === 1, "if his record changes at the same moment, the request retries and holds the money once");
  ok(!(await callApi("/store/deleteMe", { op: "request", confirm: true, reqId: rid() }, "u5")).json.deleted, "(a second request is not an immediate delete)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
