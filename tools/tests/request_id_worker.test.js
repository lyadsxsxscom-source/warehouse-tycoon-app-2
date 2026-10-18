// اختبارات السيرفر: رقم تعريف الطلب (W-1001 للسحب، S-1001 للمتجر): تسلسل، ما بيستهلك رقم عند الفشل، تضارب، رسالة استلام، رسائل النتيجة، الطلبات القديمة
// التشغيل: node tools/tests/request_id_worker.test.js
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
  let injectConflict = false;
  c.fsCommit = async (e, ws) => {
    if (injectConflict && ws.some(w => w.update && w.update.name.endsWith("counters/withdraw"))) {            // تضارب مصطنع: طلب تاني أخد الرقم قبلنا
      injectConflict = false; const cur = store.get("counters/withdraw"); const n = Number(c.fieldsToObj(cur.fields).n) + 1;
      store.set("counters/withdraw", { fields: c.objToFields({ n }), t: String(++tick) }); throw Object.assign(new Error("ABORTED"), { conflict: true });
    }
    for (const w of ws) { if (w.delete) continue; const cur = store.get(nameToPath(w.update.name)), pre = w.currentDocument;
      if (pre && pre.exists === false && cur) throw Object.assign(new Error("ALREADY_EXISTS"), { conflict: true });
      if (pre && pre.updateTime && (!cur || cur.t !== pre.updateTime)) throw Object.assign(new Error("FAILED_PRECONDITION"), { conflict: true }); }
    for (const w of ws) { if (w.delete) { store.delete(nameToPath(w.delete)); continue; }
      const path = nameToPath(w.update.name), cur = store.get(path);
      if (w.updateTransforms) { if (path.startsWith("analytics/")) continue;
        const fields = { ...(cur ? cur.fields : {}), ...w.update.fields };
        for (const t of w.updateTransforms) if (t.appendMissingElements) { const have = ((fields[t.fieldPath] || {}).arrayValue || {}).values || []; fields[t.fieldPath] = { arrayValue: { values: [...have, ...t.appendMissingElements.values.filter(v => !have.some(h => h.stringValue === v.stringValue))] } }; }
        store.set(path, { fields, t: String(++tick) }); continue; }
      store.set(path, { fields: w.updateMask ? { ...(cur ? cur.fields : {}), ...w.update.fields } : w.update.fields, t: String(++tick) }); }
    return {};
  };
  c.fsRunQuery = async (e, coll, field, limit, offset, filter) => {
    let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) }));
    if (filter) rows = rows.filter(r => r.data[filter.field] === filter.value); return rows.slice(0, limit);
  };
  fetchCalls.length = 0; c.fetch = async (url, o) => { fetchCalls.push({ url: String(url) }); return { ok: true, status: 200, text: async () => "", json: async () => ({}) }; };
  const pushes = []; c.sendPush = async (e, uid, type, params) => { pushes.push({ uid, type, params }); };
  const CFG = { game: { workers: {} }, pricing: { minWithdrawUsd: 5 }, shop: {} }; c.loadConfig = async () => CFG;
  const ADMIN = vm.runInContext("ADMIN_UID", c); const PUSH_TEXT = vm.runInContext("PUSH_TEXT", c);
  c.verifyFirebaseToken = async (t) => t === "admin" ? { sub: ADMIN } : (t && t.startsWith("p:") ? { sub: t.slice(2), name: "N" + t.slice(2), email: t.slice(2) + "@x.com" } : null);
  const post = async (token, body, path) => { const waits = []; const r = await W.fetch(new Request("https://x" + path, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => waits.push(p) }); await Promise.all(waits); return { status: r.status, json: await r.json() }; };
  const NOW = Date.now();
  const mk = (uid, o) => put("players/" + uid, { shelves: c.defaultShelves(), points: 20000, totalPointsEarned: 20000, balanceUsd: 50, activeDays: 8, adsWatched: 40, firstSeenAt: NOW, lastWithdrawAt: 0, ...o });
  const ids = (coll, uid) => [...store.keys()].filter(k => k.startsWith(coll + "/")).map(k => ({ id: k.split("/")[1], ...get(k) })).filter(x => !uid || x.uid === uid);
  const wd = async (n, amount = 6, addr) => { mk("w" + n, { ...(get("players/w" + n) || {}), lastWithdrawAt: 0, balanceUsd: get("players/w" + n) ? Math.max(get("players/w" + n).balanceUsd, 50) : 50 }); return post("p:w" + n, { coin: "usdt", network: "TRC20", address: addr || ("TAddr" + n + "123456789012345678901234567"), amount }, "/game/withdraw"); };
  const inbox = (uid) => (get("inbox/" + uid) || { items: [] }).items;
  let r;

  /* ---- A) withdrawals get a sequential number ---- */
  r = await wd(1);
  const q1 = ids("withdrawRequests", "w1")[0];
  ok(r.status === 200 && q1.reqNo === 1001 && q1.reqCode === "W-1001" && r.json.result.reqCode === "W-1001", "the first withdrawal request gets number W-1001 (also returned to the app)");
  r = await wd(2); ok(ids("withdrawRequests", "w2")[0].reqCode === "W-1002" && get("counters/withdraw").n === 1002, "the next one gets W-1002 and the counter moves");
  const rc = inbox("w1").find(m => /استلمنا طلب سحبك/.test(m.title));
  ok(rc && /رقم الطلب: W-1001/.test(rc.body) && /6 USDT \(TRC20\)/.test(rc.body) && rc.title_tr && /Talep no: W-1001/.test(rc.body_tr) && /Request no: W-1001/.test(rc.body_en), "the player gets an in-game mail at once with the number, the amount and the network, in three languages");

  /* ---- B) refused requests do not use a number ---- */
  r = await wd(3, 5000); ok(r.status === 400 && r.json.error === "not_enough_balance" && get("counters/withdraw").n === 1002, "a refused withdrawal (not enough balance) does not consume a number");
  r = await wd(3, 1); ok(r.status === 400 && get("counters/withdraw").n === 1002, "nor one below the minimum");
  r = await wd(4); ok(ids("withdrawRequests", "w4")[0].reqCode === "W-1003", "so the next real request is W-1003 (no gaps)");

  /* ---- C) two requests at the same moment never share a number ---- */
  injectConflict = true; r = await wd(5);
  const q5 = ids("withdrawRequests", "w5");
  ok(r.status === 200 && q5.length === 1 && q5[0].reqNo === 1005 && get("counters/withdraw").n === 1005, "if another request takes the number first, ours retries and gets the next one (W-1005)");
  ok(get("players/w5").balanceUsd === 44 && ids("withdrawRequests").length === 4, "and only ONE request was created and the balance was charged once");
  const allCodes = ids("withdrawRequests").map(x => x.reqCode); ok(new Set(allCodes).size === allCodes.length, "all numbers are unique");

  /* ---- D) store orders have their own sequence ---- */
  put("config/shop", { items: [{ id: "it1", name: "PUBG 60 شدة", name_en: "PUBG 60 UC", pricePoints: 700, fields: [{ key: "pid", label: "ID", type: "id", required: true }], enabled: true, sort: 0 }], minActiveDays: 0, maxPending: 9, maxPerWeek: 0 });
  CFG.shop = get("config/shop"); mk("s1"); mk("s2");
  r = await post("p:s1", { itemId: "it1", fields: { pid: "123" }, reqId: "r1" }, "/game/shopOrder");
  ok(r.status === 200 && r.json.result.reqCode === "S-1001" && ids("shopOrders", "s1")[0].reqCode === "S-1001" && ids("shopOrders", "s1")[0].reqNo === 1001, "the first store order gets S-1001 (separate from withdrawals)");
  r = await post("p:s2", { itemId: "it1", fields: { pid: "9" }, reqId: "r2" }, "/game/shopOrder"); ok(r.json.result.reqCode === "S-1002", "then S-1002");
  const so = inbox("s1").find(m => /استلمنا طلبك/.test(m.title));
  ok(so && /رقم الطلب: S-1001/.test(so.body) && /PUBG 60 شدة/.test(so.body) && /PUBG 60 UC/.test(so.body_en) && /Request no: S-1001/.test(so.body_en), "the in-game mail confirms the order with its number and the item name in each language");
  r = await post("p:s1", { itemId: "it1", fields: {}, reqId: "r3" }, "/game/shopOrder"); ok(r.status === 400 && get("counters/shop").n === 1002, "a refused store order (missing field) does not consume a number");

  /* ---- E) the admin sees the number; old orders get a derived one ---- */
  put("shopOrders/abcdefgh1234", { uid: "s2", displayName: "Old", email: "o@x.com", itemId: "it1", itemName: "قديم", pricePoints: 100, fields: [], status: "pending", createdAt: 5 });
  r = await post("admin", { action: "list", status: "pending" }, "/admin/shop-orders");
  const row1 = r.json.orders.find(x => x.uid === "s1"), rowOld = r.json.orders.find(x => x.id === "abcdefgh1234");
  ok(row1.reqCode === "S-1001" && rowOld.reqCode === "S-ABCDE", "the admin list has each order's number; an order from before the feature gets a derived one (S-ABCDE)");
  r = await post("admin", { action: "resolve", orderId: ids("shopOrders", "s1")[0].id, decision: "done", note: "تم" }, "/admin/shop-orders");
  const dm = inbox("s1").find(m => /تم تنفيذ/.test(m.title)); ok(dm && /رقم الطلب: S-1001/.test(dm.body) && /Request no: S-1001/.test(dm.body_en) && /Talep no: S-1001/.test(dm.body_tr), "the 'done' message repeats the number in all three languages");
  r = await post("admin", { action: "resolve", orderId: "abcdefgh1234", decision: "rejected", note: "x" }, "/admin/shop-orders");
  ok(inbox("s2").some(m => /انرفض/.test(m.title) && /رقم الطلب: S-ABCDE/.test(m.body)), "the 'declined' message uses the derived number for an old order");

  /* ---- F) withdrawal results carry the number ---- */
  const idW1 = ids("withdrawRequests", "w1")[0].id; pushes.length = 0;
  r = await post("admin", { requestId: idW1, action: "fulfill" }, "/admin/withdraw");
  const wm = inbox("w1").find(m => /تم إرسال سحبك/.test(m.title));
  ok(r.status === 200 && wm && /رقم الطلب: W-1001/.test(wm.body) && /Request no: W-1001/.test(wm.body_en), "when a withdrawal is paid the player gets an in-game mail (and a push) with its number");
  ok(pushes.some(x => x.type === "withdraw_ok" && x.params.code === "W-1001"), "the push carries the number too");
  const idW2 = ids("withdrawRequests", "w2")[0].id; const bal = get("players/w2").balanceUsd;
  r = await post("admin", { requestId: idW2, action: "reject" }, "/admin/withdraw");
  ok(r.status === 200 && get("players/w2").balanceUsd === bal + 6 && inbox("w2").some(m => /انرفض/.test(m.title) && /رقم الطلب: W-1002/.test(m.body)), "a rejected withdrawal refunds and tells the player the number");
  put("withdrawRequests/zzzzzlegacy", { uid: "w1", displayName: "L", email: "l@x.com", coin: "usdt", network: "TRC20", amount: 6, amountUsd: 6, walletAddress: "TLegacy12345678901234567890123456", status: "pending", createdAt: 1 });
  r = await post("admin", { requestId: "zzzzzlegacy", action: "fulfill" }, "/admin/withdraw");
  ok(inbox("w1").some(m => /تم إرسال سحبك/.test(m.title) && /رقم الطلب: W-ZZZZZ/.test(m.body)), "an old withdrawal without a number is answered with a derived one (W-ZZZZZ)");
  pushes.length = 0; r = await post("admin", { type: "withdraw_ok", requestId: idW1 }, "/admin/notify"); ok(pushes.some(x => x.params.code === "W-1001"), "re-sending the notification from the admin keeps the number");
  ok(PUSH_TEXT.withdraw_ok.ar({ amount: "6", coin: "USDT", code: "W-1001" })[1].endsWith("رقم الطلب: W-1001") && !/رقم الطلب/.test(PUSH_TEXT.withdraw_ok.ar({ amount: "6", coin: "USDT" })[1]), "the notification text adds the number only when there is one");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
