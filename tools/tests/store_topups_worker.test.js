// اختبارات السيرفر: إيداع الرصيد (6ب): عرض المبلغ بعملة طريقة الدفع، طلب الإيداع، الإيصال، الإلغاء، تأكيد الأدمن (بيزيد الرصيد)، الرفض، الاسترجاع
// التشغيل: node tools/tests/store_topups_worker.test.js
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
  const METHODS = [{ id: "sham", name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0, enabled: true, instructions: "حوّل وانسخ رقم العملية", account: "0932000000" }, { id: "usdt", name: "USDT", currency: "USDT", rate: 1, decimals: 2, feePct: 1.5, enabled: true, instructions: "BEP20 فقط", account: "0xabc" }, { id: "off", name: "off", currency: "x", rate: 2, decimals: 0, feePct: 0, enabled: false }];
  put("config/storePayments", { methods: METHODS, updatedAt: 1 });
  mkC("u1", { balanceUsd: 0 }); mkC("u2", { balanceUsd: 0 });
  const tq = (amountUsd, token = "u1") => callApi("/store/topup/quote", { amountUsd }, token);
  const topup = (amountUsd, methodId, token = "u1", reqId) => callApi("/store/topup", { amountUsd, methodId, reqId: reqId || rid() }, token);
  const pf = (orderId, body, token = "u1") => callApi("/store/order/proof", { orderId, ...body }, token);
  const myOrders = async (t) => (await callApi("/store/orders", {}, t)).json.orders;
  const done = (id, note, token = "admin") => adm({ action: "order_done", id, note }, token);
  const mkU = (uid) => { mkC(uid, {}); TOKS[uid] = { sub: uid, name: uid, email: uid + "@x.com" }; };
  let r;

  /* ---- A) sign-in ---- */
  for (const path of ["/store/topup/quote", "/store/topup"]) { r = await callApi(path, {}, null); ok(r.status === 401, path + " needs sign-in"); }
  r = await callApi("/store/topup/quote", { amountUsd: 10 }, "u3"); ok(r.status === 200, "a quote needs no account (just a sign-in)"); r = await topup(10, "sham", "u3"); ok(r.status === 400 && r.json.error === "no_account", "but to deposit he must have opened his store account");

  /* ---- B) the deposit quote ---- */
  r = await tq(10); const q = r.json.quote;
  ok(r.status === 200 && q.amountUsd === 10 && q.minUsd === 5 && q.maxUsd === 1000 && q.validMinutes === 30 && q.methods.length === 2 && q.methods[0].id === "sham" && q.methods[0].amount === 1425 && q.methods[1].amount === 10.15 && !q.methods.some(m => m.id === "off") && !("instructions" in q.methods[0]), "the amount in each ENABLED method (10 x 142.5 = 1,425; 10 x 1.015 = 10.15); a disabled method is not offered; no payment details yet");
  r = await tq(5); ok(r.json.quote.methods[0].amount === 713 && r.json.quote.methods[1].amount === 5.08, "rounding is the same as the store page (712.5 becomes 713; 5.075 becomes 5.08)");
  for (const [a, label] of [[4.99, "below the minimum"], [1001, "above the maximum"], [0, "zero"], [-5, "negative"], ["abc", "text"], [null, "empty"]]) { r = await tq(a); ok(r.status === 400 && r.json.error === "bad_amount" && /5/.test(r.json.message), "refused amount: " + label); }
  r = await tq(1000); ok(r.status === 200, "the maximum is allowed"); r = await tq(5); ok(r.status === 200, "and so is the minimum");
  await adm({ action: "wallet_save", cfg: { pointsPerUsd: 1000, minTopupUsd: 20, maxTopupUsd: 100, maxProcessing: 10 } }); r = await tq(10); ok(r.status === 400 && /20/.test(r.json.message) && /100/.test(r.json.message), "the limits come from the wallet settings (now 20 to 100)"); await adm({ action: "wallet_save", cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10 } });

  /* ---- C) asking to deposit ---- */
  r = await topup(100, "sham"); const o1 = r.json.order;
  ok(r.status === 200 && /^o[0-9a-f]{20}$/.test(o1.id) && o1.kind === "topup" && o1.code === "D-1001" && o1.status === "awaiting_payment" && o1.itemName === "إيداع رصيد" && o1.playerId === "" && o1.priceUsd === 100 && o1.amount === 14250 && o1.method.id === "sham" && o1.method.currency === "ل.س" && o1.method.account === "0932000000" && o1.method.instructions === "حوّل وانسخ رقم العملية" && o1.proof === null && o1.quoteEndsAt > NOW + 29 * 60000 && o1.quoteExpired === false, "a deposit request: code D-1001, awaiting payment, $100, the exact amount to transfer (14,250 ل.س), the account and instructions, a 30-minute price window");
  ok(!("uid" in o1) && !("adminNote" in o1) && bal("u1") === 0 && get("counters/deposit").n === 1001 && get("storeOrders/" + o1.id).rate === 142.5 && !store.has("counters/store"), "nothing is added to his balance yet; the deposits have their own numbering (D-); the rate is kept with the request");
  r = await topup(20, "usdt"); ok(r.json.order.code === "D-1002" && r.json.order.amount === 20.3, "the next deposit is D-1002 (20 x 1.015 = 20.30 USDT)");
  put("config/storePayments", { methods: METHODS.map(m => m.id === "sham" ? { ...m, rate: 200 } : m), updatedAt: 2 }); ok((await myOrders("u1")).find(x => x.code === "D-1001").amount === 14250, "changing the exchange rate later does not change an existing request"); r = await topup(5, "sham"); ok(r.json.order.amount === 1000, "a new request uses the new rate (5 x 200)"); put("config/storePayments", { methods: METHODS, updatedAt: 3 });
  for (const [m, label] of [["", "none"], ["ghost", "unknown"], ["off", "disabled"]]) { r = await topup(10, m); ok(r.status === 400 && r.json.error === "no_method", "refused payment method: " + label); }
  r = await topup(2, "sham"); ok(r.status === 400 && r.json.error === "bad_amount", "a deposit below the minimum is refused");
  for (const bad of ["", "short", "has space in it!", "x".repeat(65)]) { r = await callApi("/store/topup", { amountUsd: 10, methodId: "sham", reqId: bad }, "u1"); ok(r.status === 400 && r.json.error === "bad_request", "refused request id: " + JSON.stringify(bad.slice(0, 10))); }
  const nb = get("counters/deposit").n, same = rid(); const a1 = await topup(10, "sham", "u2", same), a2 = await topup(10, "sham", "u2", same);
  ok(a1.json.order.id === a2.json.order.id && a2.json.duplicate === true && get("counters/deposit").n === nb + 1, "the same request sent twice gives the same deposit and one number");
  /* the limit of open deposits */
  mkC("u4", {}); TOKS.u4 = { sub: "u4", name: "Lim", email: "l@x.com" }; const lim = []; for (let i = 0; i < 3; i++) lim.push((await topup(10, "sham", "u4")).json.order);
  r = await topup(10, "sham", "u4"); ok(r.status === 400 && r.json.error === "too_many_open" && /3/.test(r.json.message), "at most 3 open deposits per customer");
  await callApi("/store/order/cancel", { orderId: lim[0].id }, "u4"); r = await topup(10, "sham", "u4"); ok(r.status === 200, "cancelling one frees a place");
  put("storeOrders/" + lim[1].id, { ...get("storeOrders/" + lim[1].id), createdAt: NOW - 25 * 3600 * 1000 }); r = await topup(10, "sham", "u4"); ok(r.status === 200, "a deposit that expired (24h) does not count either");
  injectConflictOn = "counters/deposit"; const nb2 = get("counters/deposit").n; r = await topup(10, "sham", "u2"); ok(r.status === 200 && r.json.order.code === "D-" + (nb2 + 2) && [...store.keys()].filter(k => k.startsWith("storeOrders/") && get(k).code === r.json.order.code).length === 1, "if another request takes the number first, ours retries and gets the next one (no duplicates)");
  const lst = await myOrders("u1"); ok(lst.length >= 3 && lst.every(x => x.kind === "topup") && lst[0].createdAt >= lst[lst.length - 1].createdAt && !(await myOrders("u2")).some(x => x.id === o1.id), "my orders lists my deposits, newest first, only mine");

  /* ---- D) the payment proof ---- */
  r = await pf(o1.id, {}); ok(r.status === 400 && r.json.error === "bad_proof", "a proof needs a reference or a picture"); r = await pf(o1.id, { ref: "   " }); ok(r.status === 400 && r.json.error === "bad_proof", "blank text is not a reference");
  for (const [img, label] of [["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "SVG"], ["http://x/y.png", "a web link"], ["data:image/png;base64," + "A".repeat(290000), "too big"], ["data:image/png;base64,@@@", "not base64"], [123, "not text"]]) { r = await pf(o1.id, { ref: "TX1", image: img }); ok(r.status === 400 && r.json.error === "bad_image", "refused picture: " + label); }
  ok(get("storeOrders/" + o1.id).status === "awaiting_payment" && !store.has("storeProofs/" + o1.id), "a refused proof changes nothing");
  r = await pf(o1.id, { ref: "<b>TX-123</b> 456", image: PNG }); const p1 = r.json.order;
  ok(r.status === 200 && p1.status === "payment_submitted" && p1.proof.ref === "TX-123 456" && p1.proof.hasImage === true && p1.proof.late === false && get("storeProofs/" + o1.id).data === PNG && !JSON.stringify(await myOrders("u1")).includes("base64"), "a proof (reference cleaned, picture stored privately and never in his lists): 'payment submitted', on time");
  ok(pushes.some(x => x.uid === ADMIN && x.type === "store_proof" && x.params.code === "D-1001" && x.params.item === "إيداع رصيد" && x.params.amount === "14,250 ل.س" && x.params.late === false), "YOU get a push: the deposit code, the amount in his currency");
  r = await pf(o1.id, { ref: "TX-NEW" }); ok(r.json.order.proof.ref === "TX-NEW" && r.json.order.proof.hasImage === true && get("storeProofs/" + o1.id).data === PNG, "sending the reference again replaces it and keeps the earlier picture");
  r = await callApi("/store/order/cancel", { orderId: o1.id }, "u1"); ok(r.status === 400 && r.json.error === "bad_status", "after sending the payment he cannot cancel");
  r = await pf(o1.id, { ref: "x" }, "u2"); ok(r.status === 404, "nobody can send a proof for someone else's deposit");
  const late = (await topup(10, "usdt", "u2")).json.order; put("storeOrders/" + late.id, { ...get("storeOrders/" + late.id), expiresAt: NOW - 60000 }); r = await pf(late.id, { ref: "TX-late" }, "u2"); ok(r.status === 200 && r.json.order.proof.late === true && pushes.some(x => x.params && x.params.code === late.code && x.params.late === true), "a proof after the 30-minute window is accepted but flagged 'late' (and so is your push)");
  mkU("u10"); const old = (await topup(10, "usdt", "u10")).json.order; put("storeOrders/" + old.id, { ...get("storeOrders/" + old.id), createdAt: NOW - 25 * 3600 * 1000, expiresAt: NOW - 24 * 3600 * 1000 }); r = await pf(old.id, { ref: "TX-old" }, "u10"); ok(r.status === 400 && /انتهت صلاحية/.test(r.json.message), "after 24 hours an unpaid deposit has expired and takes no proof"); ok((await myOrders("u10")).find(x => x.id === old.id).status === "expired", "it is listed as expired");
  mkC("u8", {}); TOKS.u8 = { sub: "u8", name: "Eight", email: "e@x.com" }; const pn = (await topup(10, "sham", "u8")).json.order; pushFails = true; r = await pf(pn.id, { ref: "TX-push-fail" }, "u8"); pushFails = false; ok(r.status === 200, "if the notification service is down the proof is still accepted");
  const refused = pushes.length; await pf(pn.id, {}, "u8"); await pf("ghost", { ref: "x" }, "u8"); await pf(pn.id, { ref: "x", image: "http://x/y.png" }, "u8"); ok(pushes.length === refused, "a refused proof sends you no notification");

  /* ---- E) cancelling ---- */
  mkU("u11"); const cn = (await topup(10, "sham", "u11")).json.order;
  r = await callApi("/store/order/cancel", { orderId: cn.id }, "u1"); ok(r.status === 404, "nobody can cancel someone else's deposit");
  r = await callApi("/store/order/cancel", { orderId: cn.id }, "u11"); ok(r.status === 200 && r.json.order.status === "cancelled", "a customer can cancel a deposit he has not paid");
  r = await callApi("/store/order/cancel", { orderId: cn.id }, "u11"); ok(r.status === 400 && r.json.error === "bad_status", "cancelling twice is refused"); r = await pf(cn.id, { ref: "x" }, "u11"); ok(r.status === 400, "a cancelled deposit takes no proof");

  /* ---- F) you confirm the deposit ---- */
  mkC("u1", { balanceUsd: 3, spentUsd: 0 }); const sp0 = spent("u1");
  r = await done(o1.id, "received by Sham Cash");
  ok(r.status === 200 && r.json.order.status === "done" && r.json.order.adminNote === "received by Sham Cash" && r.json.order.events.slice(-1)[0].action === "done", "confirming: status done, your note, history");
  ok(bal("u1") === 103 && spent("u1") === sp0, "the $100 is added to his balance ($3 + $100), and it is NOT counted as spending (VIP follows what he buys, not what he deposits)");
  const lg = ledger("u1"); ok(lg.length === 1 && lg[0].type === "topup" && lg[0].amountUsd === 100 && lg[0].balanceAfter === 103 && lg[0].ref === "D-1001" && lg[0].by === "admin", "the ledger records it with the deposit code");
  ok(pushes.some(x => x.uid === "u1" && x.type === "store_topup_done" && x.params.code === "D-1001" && x.params.amount === 100), "the customer gets a push: his balance was topped up");
  r = await done(o1.id); ok(r.status === 400 && r.json.error === "bad_status" && bal("u1") === 103, "confirming twice is refused and never credits twice");
  const aw = (await topup(7.5, "usdt", "u1")).json.order; r = await done(aw.id, "paid by phone"); ok(r.status === 200 && bal("u1") === 110.5, "a deposit still 'awaiting payment' can be confirmed (e.g. he paid you in person): 103 + 7.5");
  const ex = (await topup(10, "sham", "u1")).json.order; put("storeOrders/" + ex.id, { ...get("storeOrders/" + ex.id), createdAt: NOW - 30 * 3600 * 1000 }); r = await done(ex.id, "late but paid"); ok(r.status === 200 && bal("u1") === 120.5, "an expired deposit can still be confirmed by you");
  r = await done("ghost"); ok(r.status === 404, "(unknown)"); ok((await done(o1.id, "", "u1")).status === 401, "(customers cannot)");
  const cc = (await topup(5, "sham", "u1")).json.order; injectConflictOn = "storeCustomers/u1"; const bc = bal("u1"); r = await done(cc.id); ok(r.status === 200 && bal("u1") === r4(bc + 5), "if his record changes at the same moment, it retries and credits once");
  function r4(x) { return Math.round(x * 10000) / 10000; }
  const gone = (await topup(5, "sham", "u1")).json.order; const savedC = get("storeCustomers/u1"); store.delete("storeCustomers/u1"); r = await done(gone.id); ok(r.status === 404 && r.json.error === "no_customer" && get("storeOrders/" + gone.id).status === "awaiting_payment", "if his account no longer exists nothing is credited and the deposit stays open"); put("storeCustomers/u1", savedC);
  /* a merchant's deposit is never spending */
  mkC("m1", { balanceUsd: 0, merchant: { status: "trial", level: 5, targetUsd: 50, baseSpent: 0, startedAt: NOW, endsAt: NOW + 30 * DAY, prevLevel: 1 } }); TOKS.m1 = { sub: "m1", name: "T", email: "t@x.com" }; const md = (await topup(500, "sham", "m1")).json.order; await done(md.id);
  ok(bal("m1") === 500 && get("storeCustomers/m1").merchant.status === "trial" && spent("m1") === 0, "a trial merchant depositing $500 does NOT reach his promise (the promise is about buying, not depositing)");

  /* ---- G) rejecting ---- */
  mkU("u12"); const rj = (await topup(10, "sham", "u12")).json.order; await pf(rj.id, { ref: "bad ref" }, "u12"); const b2 = bal("u12");
  r = await adm({ action: "order_reject", id: rj.id }); ok(r.status === 400 && r.json.error === "reason_required", "a reason is required");
  r = await adm({ action: "order_reject", id: rj.id, reason: "<b>no payment</b> received" }); ok(r.status === 200 && r.json.order.status === "rejected" && r.json.order.rejectReason === "no payment received" && bal("u12") === b2, "rejecting stores the reason and moves no money");
  ok(pushes.some(x => x.uid === "u12" && x.type === "store_rejected" && x.params.reason === "no payment received" && x.params.item === "إيداع رصيد"), "and the customer gets a push with the reason");
  r = await adm({ action: "order_reject", id: rj.id, reason: "again" }); ok(r.status === 400, "rejecting twice is refused"); r = await done(rj.id); ok(r.status === 400, "a rejected deposit cannot be confirmed");

  /* ---- H) refunding a confirmed deposit ---- */
  mkC("u9", { balanceUsd: 0 }); TOKS.u9 = { sub: "u9", name: "Nine", email: "n@x.com" }; const rd = (await topup(50, "sham", "u9")).json.order; await done(rd.id); ok(bal("u9") === 50, "(deposited $50)");
  mkC("u9", { balanceUsd: 30 }); r = await adm({ action: "order_refund", id: rd.id }); ok(r.status === 400 && r.json.error === "insufficient_balance" && /30/.test(r.json.message) && get("storeOrders/" + rd.id).status === "done" && bal("u9") === 30, "if he already spent part of it, the refund is refused with his balance shown, and nothing changes (you can adjust his balance by hand instead)");
  mkC("u9", { balanceUsd: 50 }); r = await adm({ action: "order_refund", id: rd.id, note: "cash back" }); ok(r.status === 200 && r.json.order.status === "refunded" && bal("u9") === 0, "with the balance intact, a refund takes the deposit back off it");
  ok(ledger("u9").map(x => x.type).join() === "topup,topup_refund" && ledger("u9")[1].amountUsd === -50, "and is logged"); r = await adm({ action: "order_refund", id: rd.id }); ok(r.status === 400, "refunding twice is refused"); r = await adm({ action: "order_refund", id: rj.id }); ok(r.status === 400, "only a confirmed deposit can be refunded");

  /* ---- I) the admin list ---- */
  r = await adm({ action: "orders_list", kind: "topup" }); ok(r.json.orders.length > 5 && r.json.orders.every(x => x.kind === "topup") && r.json.kinds.topup >= 1, "the list can show only deposits");
  r = await adm({ action: "orders_list", status: "waiting" }); ok(r.json.orders.every(x => x.status === "payment_submitted" || x.status === "processing") && r.json.waiting === r.json.orders.length, "'waiting' counts the payments you must confirm");
  r = await adm({ action: "orders_list", q: "D-1001" }); ok(r.json.orders.length === 1 && r.json.orders[0].proof.ref === "TX-NEW", "search by deposit code");

  /* ---- J) the payment details ---- */
  r = await adm({ action: "payments_save", methods: [{ ...METHODS[0], instructions: "<b>حوّل</b> " + "x".repeat(400), account: "A".repeat(200) }] });
  ok(r.status === 200 && r.json.methods[0].instructions.length === 300 && !/[<>]/.test(r.json.methods[0].instructions) && r.json.methods[0].account.length === 120, "instructions (up to 300) and the account (up to 120) are cleaned and limited");
  r = await adm({ action: "payments_get" }); ok(r.json.methods[0].instructions.startsWith("حوّل") && r.json.methods[0].account.startsWith("AAA"), "the admin can read them back");
  r = await W.fetch(new Request("https://x/store/catalog"), env, { waitUntil: p => p }); const cj = await r.json(); ok(cj.methods.length === 1 && !("instructions" in cj.methods[0]) && !("account" in cj.methods[0]), "the public catalog never shows them (only a deposit request does)");
  put("config/storePayments", { methods: METHODS, updatedAt: 9 });
  const noinfo = await adm({ action: "payments_save", methods: [{ name: "x", currency: "y", rate: 3 }] }); ok(noinfo.json.methods[0].instructions === "" && noinfo.json.methods[0].account === "", "a method saved without them has empty ones");
  const T = (t, l, p) => PUSH_TEXT[t][l](p);
  ok(["ar", "tr", "en"].every(l => { const x = T("store_topup_done", l, { code: "D-1", amount: 100 }); return x[0] && x[1].includes("D-1") && x[1].includes("100"); }) && vm.runInContext("PUSH_PREF.store_topup_done", c) === "orders", "the 'balance topped up' notification exists in Arabic, Turkish and English and follows the 'orders' setting");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
