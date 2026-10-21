// اختبارات السيرفر: محفظة المتجر (6أ): رصيد دولار، تحويل نقاط ↔ دولار، إعدادات الأدمن، تعديل الرصيد، السجل
// التشغيل: node tools/tests/store_wallet_worker.test.js
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
    if (injectConflictOn && ws.some(w => w.update && w.update.name.endsWith(injectConflictOn))) { const mark = injectConflictOn; injectConflictOn = null; const key = mark; const cur = store.get(key); if (cur) store.set(key, { ...cur, t: String(++tick) }); throw Object.assign(new Error("ABORTED"), { conflict: true }); }
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
  const TOKS = { admin: { sub: ADMIN }, u1: { sub: "u1", name: "Ali", email: "ali@x.com" }, u2: { sub: "u2", name: "Omar", email: "omar@x.com" }, u3: { sub: "u3", name: "NoGame", email: "ng@x.com" }, u4: { sub: "u4", name: "NoAcct", email: "na@x.com" }, u5: { sub: "u5", name: "Susp", email: "s@x.com" } };
  c.verifyFirebaseToken = async (t) => TOKS[t] || null;
  const callApi = async (path, body, token) => { const r = await W.fetch(new Request("https://x" + path, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const adm = (body, token = "admin") => callApi("/admin/store", body, token);
  const mkC = (uid, o) => put("storeCustomers/" + uid, { name: uid, email: uid + "@x.com", spentUsd: 0, balanceUsd: 0, createdAt: 1, lastSeenAt: 1, ...o });
  const mkP = (uid, o) => put("players/" + uid, { points: 0, activeDays: 10, firstSeenDate: "2026-01-01", shelves: Array.from({ length: 6 }, (_, i) => ({ id: i, unlocked: i < 2, worker: null })), ...o });      // مثل لاعب موجود فعلاً (بدون هيك اللعبة بتعتبره جديد وبتعطيه نقاط البداية)
  let seq = 0; const rid = () => "req-" + String(++seq).padStart(8, "0");
  const conv = (direction, amountUsd, token = "u1", reqId) => callApi("/store/convert", { direction, amountUsd, reqId: reqId || rid() }, token);
  const bal = (uid) => get("storeCustomers/" + uid).balanceUsd, pts = (uid) => get("players/" + uid).points;
  const ledger = (uid) => [...store.keys()].filter(k => k.startsWith("storeLedger/")).map(k => get(k)).filter(x => x.uid === uid);
  const DAY = 86400000;
  let r;

  /* ---- A) the settings ---- */
  ok((await adm({ action: "wallet_get" }, "u1")).status === 401 && (await adm({ action: "wallet_save", cfg: {} }, null)).status === 401, "wallet settings are admin-only");
  r = await adm({ action: "wallet_get" }); ok(r.json.configured === false && r.json.cfg.pointsPerUsdSell === 925 && r.json.cfg.pointsPerUsdBuy === 700 && r.json.cfg.minConvertUsd === 1 && r.json.cfg.weeklyCapUsd === 5 && r.json.cfg.minActiveDays === 3 && r.json.cfg.minTopupUsd === 5 && r.json.cfg.maxTopupUsd === 1000 && r.json.cfg.maxProcessing === 10, "before you set them: safe example values (700 buy, 925 sell, $1 minimum, $5 a week, 3 active days...)");
  const good = { pointsPerUsdSell: 900, pointsPerUsdBuy: 700, minConvertUsd: 1, weeklyCapUsd: 10, minActiveDays: 3, minTopupUsd: 5, maxTopupUsd: 500, maxProcessing: 10 };
  for (const [patch, label] of [[{ pointsPerUsdSell: 0 }, "sell rate 0"], [{ pointsPerUsdBuy: "x" }, "buy rate text"], [{ pointsPerUsdBuy: 950, pointsPerUsdSell: 900 }, "BUY RATE ABOVE SELL RATE (a guaranteed profit loop)"], [{ minConvertUsd: 0 }, "min convert 0"], [{ minConvertUsd: 5000 }, "min convert huge"], [{ weeklyCapUsd: -1 }, "negative cap"], [{ minActiveDays: 1.5 }, "fractional days"], [{ minActiveDays: 400 }, "400 days"], [{ minTopupUsd: 0 }, "min top-up 0"], [{ maxTopupUsd: 2 }, "max below min"], [{ maxProcessing: 0 }, "0 open orders"], [{ maxProcessing: 500 }, "500 open orders"]]) {
    r = await adm({ action: "wallet_save", cfg: { ...good, ...patch } }); ok(r.status === 400 && r.json.error === "bad_wallet", "refused: " + label);
  }
  r = await adm({ action: "wallet_save", cfg: { ...good, pointsPerUsdBuy: 900 } }); ok(r.status === 200, "buy rate equal to the sell rate is allowed (a pure swap, no profit)");
  r = await adm({ action: "wallet_save", cfg: { ...good, minConvertUsd: 0.015, weeklyCapUsd: 0 } }); ok(r.status === 200 && r.json.cfg.minConvertUsd === 0.02 && r.json.cfg.weeklyCapUsd === 0 && r.json.configured === true && r.json.updatedAt > 0, "saved (rounded to cents; weekly cap 0 means no cap)");
  r = await adm({ action: "wallet_save", cfg: good }); ok((await adm({ action: "wallet_get" })).json.cfg.pointsPerUsdSell === 900, "saved and read back");

  /* ---- B) what the page learns about his wallet ---- */
  const me = async (t) => (await callApi("/store/me", {}, t)).json;
  mkC("u1", {}); let m = await me("u1");
  ok(m.customer.balanceUsd === 0 && m.wallet.pointsPerUsdSell === 900 && m.wallet.pointsPerUsdBuy === 700 && m.wallet.weeklyCapUsd === 10 && m.wallet.weeklyLeftUsd === 10 && m.wallet.weeklyUsedUsd === 0 && m.wallet.game.has === false && m.wallet.game.points === 0, "/store/me carries the balance, the current rates and limits, and says he has no game account yet");
  mkP("u1", { points: 5000.9, activeDays: 10 }); m = await me("u1"); ok(m.wallet.game.has === true && m.wallet.game.points === 5000 && m.wallet.game.activeDays === 10, "with a game account it shows his points (whole numbers) and active days");

  /* ---- C) points -> dollars ---- */
  mkP("u1", { points: 5000, activeDays: 10, totalPointsEarned: 7777, adsWatched: 12 });
  r = await conv("points_to_usd", 2);
  ok(r.status === 200 && r.json.result.direction === "points_to_usd" && r.json.result.amountUsd === 2 && r.json.result.points === -1800 && r.json.result.balanceUsd === 2 && r.json.result.pointsBalance === 3200 && bal("u1") === 2 && pts("u1") === 3200, "$2 costs 1,800 points at 900 per dollar: balance $2, points 3,200");
  ok(get("players/u1").totalPointsEarned === 7777 && get("players/u1").adsWatched === 12, "the game's other numbers (points earned, ads) are never touched");
  const lg = ledger("u1"); ok(lg.length === 1 && lg[0].type === "points_to_usd" && lg[0].amountUsd === 2 && lg[0].points === -1800 && lg[0].balanceAfter === 2 && lg[0].by === "customer" && lg[0].at > 0, "the ledger records it (amount, points, balance after, who, when)");
  m = await me("u1"); ok(m.wallet.weeklyUsedUsd === 2 && m.wallet.weeklyLeftUsd === 8 && m.wallet.windowEndsAt > Date.now() + 6 * DAY, "the weekly allowance now shows $2 used, $8 left, and when the week ends");
  r = await conv("points_to_usd", 1.01); ok(r.json.result.points === -Math.ceil(1.01 * 900 - 1e-9) && r.json.result.points === -909 && bal("u1") === 3.01, "points are rounded UP in your favour (1.01 x 900 = 909)");
  mkP("u1", { points: 100, activeDays: 10 }); r = await conv("points_to_usd", 1); ok(r.status === 400 && r.json.error === "not_enough_points" && /900/.test(r.json.message) && /100/.test(r.json.message) && bal("u1") === 3.01 && pts("u1") === 100, "not enough points: refused, nothing changes");
  mkP("u1", { points: 50000, activeDays: 2 }); r = await conv("points_to_usd", 1); ok(r.status === 400 && r.json.error === "not_active_enough" && /3/.test(r.json.message), "fewer active days than required: refused");
  mkP("u1", { points: 50000, activeDays: 10 });
  r = await conv("points_to_usd", 7); ok(r.status === 400 && r.json.error === "weekly_cap" && /10/.test(r.json.message) && /6\.99/.test(r.json.message), "over the weekly cap: refused with what is left ($6.99)");
  r = await conv("points_to_usd", 6.99); ok(r.status === 200 && bal("u1") === 10, "exactly the amount left is allowed");
  r = await conv("points_to_usd", 1); ok(r.status === 400 && r.json.error === "weekly_cap", "then the week is used up");
  const g0 = get("storeCustomers/u1"); put("storeCustomers/u1", { ...g0, p2uWindowStart: Date.now() - 8 * DAY }); r = await conv("points_to_usd", 1); ok(r.status === 200 && get("storeCustomers/u1").p2uWindowUsd === 1 && get("storeCustomers/u1").p2uWindowStart > Date.now() - 5000, "after 7 days a fresh week starts");
  await adm({ action: "wallet_save", cfg: { ...good, weeklyCapUsd: 0 } }); r = await conv("points_to_usd", 20); ok(r.status === 200, "with the cap set to 0 there is no weekly limit"); await adm({ action: "wallet_save", cfg: good });
  await adm({ action: "wallet_save", cfg: { ...good, minActiveDays: 0 } }); mkP("u1", { points: 50000, activeDays: 0 }); r = await conv("points_to_usd", 1); ok(r.status === 200 || r.json.error === "weekly_cap", "with 0 required days the rule is off"); await adm({ action: "wallet_save", cfg: good });
  const b0 = bal("u1"), p0 = pts("u1");
  for (const [d, a, label, code] of [["points_to_usd", 0.5, "below the minimum", "bad_amount"], ["points_to_usd", 20000, "above the maximum", "bad_amount"], ["points_to_usd", "abc", "text", "bad_amount"], ["points_to_usd", null, "empty", "bad_amount"], ["sideways", 5, "an unknown direction", "bad_request"]]) { r = await conv(d, a); ok(r.status === 400 && r.json.error === code, "refused: " + label); }
  for (const bad of ["", "short", "has space in it!", "x".repeat(65)]) { r = await callApi("/store/convert", { direction: "points_to_usd", amountUsd: 1, reqId: bad }, "u1"); ok(r.status === 400 && r.json.error === "bad_request", "refused request id: " + JSON.stringify(bad.slice(0, 10))); }
  ok(bal("u1") === b0 && pts("u1") === p0, "none of those changed anything");

  /* ---- D) dollars -> points ---- */
  mkC("u2", { balanceUsd: 10 }); mkP("u2", { points: 100, activeDays: 0, totalPointsEarned: 50 });
  r = await conv("usd_to_points", 3, "u2"); ok(r.status === 200 && r.json.result.points === 2100 && r.json.result.amountUsd === -3 && r.json.result.balanceUsd === 7 && r.json.result.pointsBalance === 2200 && bal("u2") === 7 && pts("u2") === 2200, "$3 buys 2,100 points at 700 per dollar: balance $7, points 2,200");
  ok(get("players/u2").totalPointsEarned === 50, "bought points do not count as points earned by playing");
  ok(r.status === 200 && ledger("u2")[0].type === "usd_to_points" && ledger("u2")[0].amountUsd === -3 && ledger("u2")[0].points === 2100, "and it is in the ledger");
  r = await conv("usd_to_points", 20, "u2"); ok(r.status === 400 && r.json.error === "insufficient_balance" && bal("u2") === 7 && pts("u2") === 2200, "not enough balance: refused, nothing changes");
  r = await conv("usd_to_points", 1.5, "u2"); ok(r.status === 200 && r.json.result.points === 1050, "$1.5 gives 1,050 points");
  await adm({ action: "wallet_save", cfg: { ...good, pointsPerUsdBuy: 1, minConvertUsd: 0.01 } }); r = await conv("usd_to_points", 0.01, "u2"); ok(r.status === 400 && r.json.error === "bad_amount" && /ولا نقطة/.test(r.json.message), "an amount too small to buy a single point is refused"); await adm({ action: "wallet_save", cfg: good });
  ok(r.status === 400 && true, "(setup)");
  /* the loop loses money for the customer */
  mkC("u6", { balanceUsd: 1 }); TOKS.u6 = { sub: "u6", name: "Loop", email: "l@x.com" }; mkP("u6", { points: 0, activeDays: 10 });
  await conv("usd_to_points", 1, "u6"); const back = await conv("points_to_usd", 1, "u6"); ok(back.status === 400 && back.json.error === "not_enough_points", "round trip: $1 buys 700 points, and 700 points cannot buy back $1 (900 needed): no profit loop");

  /* ---- E) pressing twice ---- */
  mkC("u2", { balanceUsd: 100 }); mkP("u2", { points: 0, activeDays: 10 }); const same = rid(); const pb = pts("u2");
  const a1 = await conv("usd_to_points", 5, "u2", same), a2 = await conv("usd_to_points", 5, "u2", same);
  ok(a1.status === 200 && a2.status === 200 && a2.json.duplicate === true && pts("u2") === pb + 3500 && bal("u2") === 95 && ledger("u2").filter(x => x.ref === same).length === 1 && a2.json.result.points === 3500, "the same request sent twice (a double tap or a retry) is applied once");
  r = await conv("usd_to_points", 5, "u2"); ok(bal("u2") === 90, "a new request is a new conversion");
  mkC("u1", { ...get("storeCustomers/u1"), balanceUsd: 100 }); const x1 = await conv("usd_to_points", 5, "u1", same); ok(x1.status === 200 && !x1.json.duplicate, "another customer with the same request id gets his own conversion");

  /* ---- F) accounts that cannot convert ---- */
  mkC("u3", { balanceUsd: 10 }); r = await conv("usd_to_points", 1, "u3"); ok(r.status === 400 && r.json.error === "no_game" && !store.has("players/u3"), "a customer who never opened the game cannot convert, and no game account is created behind his back");
  mkP("u4", { points: 5000, activeDays: 10 }); r = await conv("points_to_usd", 1, "u4"); ok(r.status === 400 && r.json.error === "no_account" && !store.has("storeCustomers/u4") && pts("u4") === 5000, "a player with no store account is told to open it first and loses nothing");
  mkC("u5", { balanceUsd: 10 }); mkP("u5", { points: 5000, activeDays: 10, suspended: true }); r = await conv("usd_to_points", 1, "u5"); ok(r.status === 403 && r.json.error === "account_suspended" && bal("u5") === 10, "a suspended game account cannot convert");
  ok((await callApi("/store/convert", { direction: "usd_to_points", amountUsd: 1, reqId: rid() }, null)).status === 401, "signing in is required");

  /* ---- G) two changes at the same moment ---- */
  mkC("u2", { balanceUsd: 50 }); mkP("u2", { points: 0, activeDays: 10 }); injectConflictOn = "storeCustomers/u2";
  r = await conv("usd_to_points", 10, "u2"); ok(r.status === 200 && bal("u2") === 40 && pts("u2") === 7000 && ledger("u2").filter(x => x.amountUsd === -10).length >= 1, "if the balance changes at the same moment, it retries and applies once");

  /* ---- H) the admin changes a balance ---- */
  mkC("c1", {}); const adj = (uid, d, note, tk = "admin") => adm({ action: "customer_balance", uid, deltaUsd: d, note }, tk);
  r = await adj("c1", 50, "deposit by Sham Cash"); ok(r.status === 200 && r.json.customer.balanceUsd === 50 && bal("c1") === 50, "adding balance by hand (a deposit that happened outside the site)");
  r = await adj("c1", -20.505, "correction"); ok(r.json.customer.balanceUsd === 29.5 || r.json.customer.balanceUsd === 29.49, "a negative amount takes it off (rounded to cents)"); mkC("c1", { balanceUsd: 30 });
  r = await adj("c1", -100, "too much"); ok(r.status === 400 && r.json.error === "insufficient_balance" && bal("c1") === 30, "the balance can never go below zero");
  for (const [d, label] of [[0, "zero"], ["abc", "text"], [null, "empty"], [200000, "huge"], [-200000, "huge negative"]]) { r = await adj("c1", d); ok(r.status === 400 && r.json.error === "bad_delta", "refused amount: " + label); }
  ok((await adj("ghost", 5)).status === 404 && (await adj("a/b", 5)).status === 400 && (await adj("c1", 5, "", "u1")).status === 401, "unknown customer, bad id, and non-admins are refused");
  r = await adm({ action: "customer_ledger", uid: "c1" }); ok(r.json.ledger.length === 2 && r.json.ledger[0].type === "adjust" && r.json.ledger[0].by === "admin" && r.json.ledger.map(x => x.note).sort().join("|") === "correction|deposit by Sham Cash", "every change is in the customer's ledger (type, amount, note, who)");
  r = await adm({ action: "customer_ledger", uid: "u1" }); ok(r.json.ledger.length >= 3 && r.json.ledger.some(x => x.type === "points_to_usd" && x.points < 0) && r.json.ledger.some(x => x.type === "usd_to_points"), "his conversions show in the same ledger, with the points");
  r = await adm({ action: "customers_list", q: "c1" }); ok(r.json.customers[0].balanceUsd === 30, "the customers list shows each balance");

  /* ---- I) never mixed with the game's withdrawable balance ---- */
  mkC("u8", { balanceUsd: 20 }); TOKS.u8 = { sub: "u8", name: "Eight", email: "e@x.com" }; mkP("u8", { points: 5000, balanceUsd: 12.34 });
  await conv("usd_to_points", 5, "u8"); await conv("points_to_usd", 1, "u8");
  ok(get("players/u8").balanceUsd === 12.34 && bal("u8") === 16, "converting never touches the game's own (withdrawable) dollar balance: it stays $12.34, the store balance moves on its own");
  ok([...store.keys()].filter(k => k.startsWith("players/")).every(k => !Object.keys(get(k)).includes("storeBalanceUsd")), "and no game account gets any store balance field");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
