// اختبارات السيرفر: قاعدة التاجر (4ب-2): نقل يدوي لمستوى مع رقم وعد وفترة اختبار، تثبيت، رجوع، تمديد، إلغاء، سجل
// التشغيل: node tools/tests/store_merchant_worker.test.js
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
  c.fsCommit = async (e, ws) => {
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
  const TOKS = { admin: { sub: ADMIN }, other: { sub: "other" }, m1: { sub: "m1", name: "Trader", email: "t@x.com" } };
  c.verifyFirebaseToken = async (t) => TOKS[t] || null;
  const adm = async (body, token = "admin") => { const r = await W.fetch(new Request("https://x/admin/store", { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json() }; };
  const me = async (t) => { const r = await W.fetch(new Request("https://x/store/me", { method: "POST", headers: { Authorization: "Bearer " + t }, body: "{}" }), env, { waitUntil: p => p }); return (await r.json()).customer; };
  const mkC = (uid, o) => put("storeCustomers/" + uid, { name: uid, email: uid + "@x.com", spentUsd: 0, createdAt: 1, lastSeenAt: 1, ...o });
  const DAY = 86400000, D = [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000];
  const cust = async (uid) => (await adm({ action: "customers_list", q: uid })).json.customers.find(x => x.id === uid);
  const set = (uid, level, targetUsd, extra) => adm({ action: "merchant_set", uid, level, targetUsd, ...extra });
  const spend = async (uid, d, note) => { const x = await adm({ action: "customer_spend", uid, deltaUsd: d, note }); await new Promise(res => setTimeout(res, 3)); return x; };
  const raw = (uid) => get("storeCustomers/" + uid);
  const age = (uid, ms) => { const d = raw(uid), m = d.merchant; put("storeCustomers/" + uid, { ...d, merchant: { ...m, startedAt: m.startedAt - ms, endsAt: m.endsAt - ms } }); };   // نرجّع الزمن للوراء
  let r;

  /* ---- A) the state rules (pure) ---- */
  const st = (m, spent, now) => c.storeMerchantState(m, spent, now);
  const M = { status: "trial", level: 5, targetUsd: 1000, baseSpent: 100, startedAt: 0, endsAt: 60 * DAY, prevLevel: 1 };
  let x = st(M, 100, 10 * DAY); ok(x.status === "trial" && x.floor === 5 && x.windowSpent === 0 && x.remaining === 1000 && x.daysLeft === 50, "just moved: trial, level 5 held, nothing spent in the window, 50 days left");
  x = st(M, 700, 30 * DAY); ok(x.status === "trial" && x.windowSpent === 600 && x.remaining === 400, "spending counts from the moment of the move (700 - 100 = 600 of 1000)");
  x = st(M, 1100, 30 * DAY); ok(x.status === "locked" && x.floor === 5 && x.remaining === 0, "the promised total reached inside the window: locked");
  x = st(M, 600, 61 * DAY); ok(x.status === "expired" && x.floor === 1 && x.windowSpent === 500 && x.remaining === 500, "the window ended without reaching it: expired, back to the level he had before (1)");
  x = st(M, 5000, 61 * DAY); ok(x.status === "expired", "reaching the amount AFTER the window does not count");
  x = st({ ...M, status: "locked" }, 0, 999 * DAY); ok(x.status === "locked" && x.floor === 5, "locked stays locked whatever happens later");
  x = st({ ...M, status: "cancelled" }, 5000, 5 * DAY); ok(x.status === "cancelled" && x.floor === 1, "cancelled: back to the previous level");
  ok(st(null, 5, 1).status === "none" && st({}, 5, 1).floor === 0, "no merchant move: nothing special");
  x = st(M, 100, 60 * DAY); ok(x.status === "trial", "the last moment of the window still counts as inside");
  const w = c.storeVipWithFloor; let v = w(D, 250, 5); ok(v.vip === 5 && v.progressUsd === 250 && v.sizeUsd === 3000 && v.nextVip === 6 && v.remainingUsd === 2750, "a level held by a merchant move: the bar is his total spending against the total needed to reach the NEXT level (250 of 3,000)");
  v = w(D, 1500, 5); ok(v.vip === 5 && v.progressUsd === 1500 && v.sizeUsd === 3000 && v.remainingUsd === 1500, "it grows with his spending (1500 of 3,000)");
  v = w(D, 100, 10); ok(v.vip === 10 && v.sizeUsd === null && v.nextVip === null, "moved to the top level");
  ok(w(D, 5000, 2).vip === c.storeVipInfo(D, 5000).vip, "a move to a level the customer already has does nothing to his numbers");

  /* ---- B) moving a customer ---- */
  mkC("c1", { spentUsd: 250 }); const t0 = Date.now();
  r = await set("c1", 5, 1000, { note: "<b>wholesale</b> trader" });
  const cu = r.json.customer; const mm = cu.merchant;
  ok(r.status === 200 && cu.vip === 5 && cu.autoVip === 2 && mm.status === "trial" && mm.level === 5 && mm.targetUsd === 1000 && mm.windowSpentUsd === 0 && mm.remainingUsd === 1000 && mm.daysLeft === 60 && mm.prevLevel === 2 && !/[<>]/.test(mm.note) && Math.abs(mm.endsAt - (t0 + 60 * DAY)) < 5000, "moved to VIP 5 with a promise of $1000: 60 days by default, he was VIP 2 before, notes are cleaned");
  ok(raw("c1").merchant.baseSpent === 250, "the spending at the moment of the move (250) is remembered as the starting point");
  const l1 = (await adm({ action: "customer_log", uid: "c1" })).json.vipLog; ok(l1.length === 1 && l1[0].action === "set" && l1[0].level === 5 && l1[0].targetUsd === 1000 && l1[0].days === 60 && l1[0].prevLevel === 2 && l1[0].by === "admin", "the move is logged (who, what, the promise, the previous level)");
  r = await set("c1", 6, 1000, { trialDays: 30 }); mkC("c1", raw("c1"));
  ok(r.json.customer.merchant.level === 6 && r.json.customer.merchant.prevLevel === 2 && r.json.customer.merchant.daysLeft === 30, "changing the level during a trial keeps the ORIGINAL previous level (2) and takes the new number of days");
  for (const [b, code, label] of [[{ level: 1 }, "bad_level", "level 1"], [{ level: 11 }, "bad_level", "level 11"], [{ level: 5.5 }, "bad_level", "a fraction"], [{ level: "x" }, "bad_level", "text"], [{ targetUsd: 0 }, "bad_target", "zero target"], [{ targetUsd: -5 }, "bad_target", "negative target"], [{ targetUsd: "abc" }, "bad_target", "text target"], [{ targetUsd: 2e7 }, "bad_target", "huge target"], [{ trialDays: 0 }, "bad_days", "0 days"], [{ trialDays: 400 }, "bad_days", "400 days"], [{ trialDays: 2.5 }, "bad_days", "2.5 days"]]) {
    r = await adm({ action: "merchant_set", uid: "c1", level: 7, targetUsd: 500, trialDays: 10, ...b }); ok(r.status === 400 && r.json.error === code, "refused move: " + label);
  }
  mkC("c2", { spentUsd: 1500 }); r = await set("c2", 4, 100); ok(r.status === 400 && r.json.error === "bad_level" && /VIP 4/.test(r.json.message), "a level he already has (1500 spent = VIP 4) or lower is refused");
  r = await adm({ action: "merchant_set", uid: "ghost", level: 5, targetUsd: 100 }); ok(r.status === 404, "an unknown customer is a 404"); ok((await adm({ action: "merchant_set", uid: "a/b", level: 5, targetUsd: 100 })).status === 400, "a bad id is refused");
  ok((await adm({ action: "merchant_set", uid: "c2", level: 5, targetUsd: 100 }, "other")).status === 401 && (await adm({ action: "merchant_cancel", uid: "c2" }, null)).status === 401, "only the admin can move customers");

  /* ---- C) what he sees and what the admin sees ---- */
  mkC("m1", { spentUsd: 40 }); await set("m1", 5, 600);
  let mine = await me("m1");
  ok(mine.vip === 5 && mine.merchant.status === "trial" && mine.merchant.targetUsd === 600 && mine.merchant.windowSpentUsd === 0 && mine.merchant.remainingUsd === 600 && mine.merchant.daysLeft === 60 && !("autoVip" in mine) && !("prevLevel" in mine.merchant) && !("note" in mine.merchant), "the customer sees his level, the promise, what is left and the days; never the admin's notes or previous level");
  ok(mine.progressUsd === 40 && mine.sizeUsd === 3000 && mine.nextVip === 6 && mine.remainingUsd === 2960, "his bar counts his spending toward VIP 6 (40 of 3,000)");
  const adminView = await cust("m1"); ok(adminView.autoVip === 1 && adminView.merchant.prevLevel === 1 && adminView.merchant.startedAt > 0 && adminView.vip === 5, "the admin also sees his automatic level and the previous level");
  r = await adm({ action: "customers_list" }); ok(r.json.customers.find(x => x.id === "m1").merchant.status === "trial", "the customers list carries the merchant state");

  /* ---- D) reaching the promise locks him ---- */
  await spend("m1", 300, "order 1"); mine = await me("m1"); ok(mine.merchant.status === "trial" && mine.merchant.windowSpentUsd === 300 && mine.merchant.remainingUsd === 300, "partial spending shows progress toward the promise (300 of 600)");
  r = await spend("m1", 300, "order 2"); ok(r.json.customer.merchant.status === "locked" && r.json.customer.vip === 5 && r.json.customer.merchant.remainingUsd === 0, "the spending that reaches the promise locks him at VIP 5 at once");
  ok((await adm({ action: "customer_log", uid: "m1" })).json.vipLog.some(l => l.action === "auto_lock" && l.by === "auto" && l.level === 5), "the automatic lock is logged");
  await spend("m1", -500, "correction"); const afterCorr = await me("m1"); ok(afterCorr.merchant.status === "locked" && afterCorr.vip === 5, "once locked, a later correction or lower spending changes nothing");
  mkC("m1", { ...raw("m1"), merchant: { ...raw("m1").merchant, endsAt: Date.now() - 365 * DAY } }); ok((await me("m1")).vip === 5, "and time passing changes nothing either");

  /* ---- E) the window ends without the promise ---- */
  mkC("c3", { spentUsd: 100 }); await set("c3", 6, 2000); await spend("c3", 300, "some orders");
  age("c3", 61 * DAY);
  let c3 = await cust("c3"); ok(c3.merchant.status === "expired" && c3.vip === 2 && c3.autoVip === 2 && c3.merchant.windowSpentUsd === 300 && c3.merchant.remainingUsd === 1700, "after 61 days with 300 of 2000: expired; he goes back to what his spending gives (400 spent = VIP 2), the admin sees how far he got");
  mkC("c4", { spentUsd: 0 }); await set("c4", 5, 1000); r = await spend("c4", 900, "close but not there"); age("c4", 61 * DAY);
  let c4 = await cust("c4"); ok(c4.vip === 3 && c4.merchant.status === "expired", "900 spent (= VIP 3 by himself) is KEPT after the window: he returns to the higher of his old level and what he earned");
  mkC("c5", { spentUsd: 500 }); await set("c5", 7, 5000); age("c5", 61 * DAY); ok((await cust("c5")).vip === 3, "a customer who was VIP 3 returns to VIP 3, not lower");
  mkC("c6", { spentUsd: 0 }); await set("c6", 5, 1000, { trialDays: 5 }); await spend("c6", 1000, "late"); ok((await cust("c6")).merchant.status === "locked", "(reached in time)");
  mkC("c7", { spentUsd: 0 }); await set("c7", 5, 1000, { trialDays: 5 }); age("c7", 6 * DAY); await spend("c7", 1000, "too late"); ok((await cust("c7")).merchant.status === "expired" && (await cust("c7")).vip === 4, "spending that reaches the promise after the window ended does not lock him (he keeps what the spending gives)");
  const meExp = await me("m1"); mkC("m2", { spentUsd: 0, merchant: { status: "trial", level: 5, targetUsd: 100, baseSpent: 0, startedAt: 1, endsAt: 2, prevLevel: 1, note: "private" } });
  put("storeCustomers/m2", { ...get("storeCustomers/m2"), email: "m2@x.com" }); TOKS.m2 = { sub: "m2", email: "m2@x.com" }; const m2me = await me("m2"); ok(m2me.vip === 1 && !m2me.merchant, "an expired merchant sees nothing special (back to his normal level)");

  /* ---- F) flexibility: extend, lock now, cancel ---- */
  r = await adm({ action: "merchant_extend", uid: "c3", days: 30 }); const e3 = r.json.customer;
  ok(r.status === 200 && e3.merchant.status === "trial" && e3.vip === 6 && e3.merchant.daysLeft === 30 && e3.merchant.windowSpentUsd === 300, "extending an expired move starts a new window from now and gives back the level (VIP 6), counting what he already spent");
  r = await adm({ action: "merchant_extend", uid: "c3", days: 15 }); ok(r.json.customer.merchant.daysLeft === 45, "extending an active trial adds days to its end (30 + 15)");
  for (const dd of [0, 400, 1.5, "x", null]) { r = await adm({ action: "merchant_extend", uid: "c3", days: dd }); ok(r.status === 400 && r.json.error === "bad_days", "refused extension: " + dd); }
  r = await adm({ action: "merchant_extend", uid: "c1".replace("c1", "c8"), days: 5 }); ok(r.status === 404, "(unknown customer)");
  mkC("c8", { spentUsd: 10 }); r = await adm({ action: "merchant_extend", uid: "c8", days: 5 }); ok(r.status === 400 && r.json.error === "no_merchant", "extending a customer who was never moved is refused");
  r = await adm({ action: "merchant_extend", uid: "m1", days: 5 }); ok(r.status === 400 && r.json.error === "already_locked", "a locked merchant cannot be extended");
  r = await adm({ action: "merchant_lock", uid: "c3", note: "good conditions, approved" }); ok(r.json.customer.merchant.status === "locked" && r.json.customer.vip === 6, "'lock now' approves him by hand (e.g. hard circumstances) without reaching the number");
  r = await adm({ action: "merchant_lock", uid: "c3" }); ok(r.status === 400 && r.json.error === "already_locked", "locking twice is refused");
  mkC("c9", { spentUsd: 100 }); await set("c9", 5, 800); r = await adm({ action: "merchant_cancel", uid: "c9", note: "changed his mind" }); const k9 = r.json.customer;
  ok(k9.merchant.status === "cancelled" && k9.vip === 1 && k9.merchant.prevLevel === 1, "cancel returns him to his previous level at once");
  r = await adm({ action: "merchant_cancel", uid: "c9" }); ok(r.status === 400 && r.json.error === "cancelled", "cancelling twice is refused");
  r = await adm({ action: "merchant_lock", uid: "c9" }); ok(r.status === 400 && r.json.error === "cancelled", "a cancelled move cannot be locked or extended (make a new move)");
  r = await adm({ action: "merchant_cancel", uid: "c8" }); ok(r.status === 400 && r.json.error === "no_merchant", "cancelling a customer who was never moved is refused");
  r = await adm({ action: "merchant_cancel", uid: "m1" }); ok(r.json.customer.merchant.status === "cancelled" && r.json.customer.vip === 3 || r.json.customer.vip >= 1, "a locked merchant can also be cancelled by the admin");
  r = await set("c9", 5, 500); ok(r.status === 200 && r.json.customer.merchant.status === "trial" && r.json.customer.merchant.prevLevel === 1, "after a cancellation a new move can be made");
  mkC("c10", { spentUsd: 0 }); await set("c10", 5, 100); await spend("c10", 100, "reach"); r = await set("c10", 7, 3000); ok(r.json.customer.merchant.prevLevel === 5 && r.json.customer.merchant.level === 7, "moving a LOCKED merchant higher: if he fails the new promise he returns to his locked level (5), not below");
  const lg = (await adm({ action: "customer_log", uid: "c3" })).json.vipLog; ok(lg.map(l => l.action).sort().join() === "extend,extend,lock,set", "every action is logged: set, extend, extend, lock");
  ok(lg.find(l => l.action === "lock").note === "good conditions, approved" && lg.find(l => l.action === "extend").days > 0, "with its note and the days");

  /* ---- G) nothing else changed ---- */
  mkC("p1", { spentUsd: 250 }); ok((await me("m1")).id === "m1" && (await cust("p1")).vip === 2 && !(await cust("p1")).merchant, "an ordinary customer is unaffected (VIP 2, no merchant info)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
