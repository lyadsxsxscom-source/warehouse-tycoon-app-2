// اختبارات السيرفر: سياسة عدم النشاط (تصنيف الحسابات، خطة بدون تنفيذ، تذكير 15 / تحذير 35 / تنفيذ 60 مع مهلة، تعليق أو حذف، حدود الأمان، حظر الحساب المعلّق، فكّ التعليق)
// التشغيل: node tools/tests/inactivity_worker.test.js
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
  c.fsCommit = async (e, ws) => { for (const w of ws) {
    if (w.delete) { store.delete(nameToPath(w.delete)); continue; }
    const path = nameToPath(w.update.name), cur = store.get(path), pre = w.currentDocument;
    if (pre && pre.exists === false && cur) throw Object.assign(new Error("ALREADY_EXISTS"), { conflict: true });
    if (pre && pre.exists === true && !cur) throw new Error("NOT_FOUND");                       // مثل Firestore: ما بنعيد إنشاء مستند انحذف
    if (w.updateTransforms) { if (path.startsWith("analytics/")) continue;
      const fields = { ...(cur ? cur.fields : {}), ...w.update.fields };
      for (const t of w.updateTransforms) if (t.appendMissingElements) { const have = ((fields[t.fieldPath] || {}).arrayValue || {}).values || []; fields[t.fieldPath] = { arrayValue: { values: [...have, ...t.appendMissingElements.values.filter(v => !have.some(h => h.stringValue === v.stringValue))] } }; }
      store.set(path, { fields, t: String(++tick) }); continue; }
    store.set(path, { fields: w.updateMask ? { ...(cur ? cur.fields : {}), ...w.update.fields } : w.update.fields, t: String(++tick) });
  } return {}; };
  c.fsRunQuery = async (e, coll, field, limit, offset, filter) => {
    let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) }));
    if (filter) rows = rows.filter(r => { const v = r.data[filter.field]; if (filter.op === "LESS_THAN_OR_EQUAL") return typeof v === "string" && v <= filter.value; return v === filter.value; });
    return rows.slice(0, limit);
  };
  fetchCalls.length = 0; c.fetch = async (url, o) => { fetchCalls.push({ url: String(url), body: o && o.body ? JSON.parse(o.body) : {} }); return { ok: true, status: 200, text: async () => "", json: async () => ({}) }; };
  const pushes = []; c.sendPush = async (e, uid, type, params) => { pushes.push({ uid, type, params }); };
  c.loadConfig = async () => ({ game: { workers: {} }, pricing: { minWithdrawUsd: 5 }, shop: {} });
  const ADMIN = vm.runInContext("ADMIN_UID", c);
  const TOKS = { admin: { sub: ADMIN }, other: { sub: "other", email: "o@x.com" } };
  c.verifyFirebaseToken = async (t) => TOKS[t] || (t && t.startsWith("p:") ? { sub: t.slice(2), email: t.slice(2) + "@x.com" } : null);
  const call2 = (token, body, path) => W.fetch(new Request("https://x" + path, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }).then(async r => ({ status: r.status, json: await r.json() }));
  const adm = (body) => call2("admin", body, "/admin/inactivity");
  const today = () => c.todaySyria(Date.now()), ago = (n) => c.shiftDate(today(), -n);
  const NOW = Date.now(), DAY = 86400000;
  const mk = (uid, o) => put("players/" + uid, { shelves: c.defaultShelves(), points: 300, totalPointsEarned: 400, balanceUsd: 0, activeDays: 4, adsWatched: 0, email: uid + "@x.com", displayName: "N" + uid, firstSeenAt: NOW, ...o });
  const runCron = async () => { let pr; await W.scheduled({}, env, { waitUntil: p => { pr = p; } }); await pr; };
  let r;

  /* ---- A) which accounts count ---- */
  const cls = async (uid) => c.classifyAccount(env, uid, get("players/" + uid));
  mk("c1", { earnedActive: true }); mk("c2", { adsWatched: 3 }); mk("c3", { balanceUsd: 1.2 }); mk("c4", { withdrawCount: 1 }); mk("c5", {}); mk("c6", {}); mk("c7", {});
  put("offerTx/wannads_t1", { provider: "wannads", uid: "c5", originalReward: 100 }); put("redeemCodes/CODE9", { used: true, usedBy: "c6", points: 50 });
  ok((await cls("c1")).counted && (await cls("c2")).counted && (await cls("c3")).counted && (await cls("c4")).counted, "earning from activity, watching ads, having a balance or withdrawals makes an account 'counted'");
  ok((await cls("c5")).counted === true && /جدار المهام/.test((await cls("c5")).reason), "an old account that earned from the task wall counts (found in the offer records)");
  ok((await cls("c6")).counted === true && /شحن نقاط/.test((await cls("c6")).reason), "an account that charged points with a code counts");
  r = await cls("c7"); ok(r.counted === false && /المكافأة اليومية/.test(r.reason), "points only from the daily reward and the starting gift do NOT count");

  /* ---- B) the flag is set when points are really earned ---- */
  mk("f1", { lastAdAt: 0 }); r = await call2("p:f1", {}, "/game/adReward");
  ok(r.status === 200 && get("players/f1").earnedActive === true, "watching an ad marks the account as earning from activity");
  mk("f2", {}); put("redeemCodes/CODEA", { used: false, points: 50 }); r = await call2("p:f2", { code: "CODEA" }, "/game/redeem");
  ok(r.status === 200 && get("players/f2").earnedActive === true, "redeeming a points code marks it (charged points)");
  mk("f3", { dailyDate: c.todaySyria(Date.now()), tasks: [{ id: "t1", reward: 10, target: 1, progress: 1, claimed: false }] }); r = await call2("p:f3", { taskId: "t1" }, "/game/claimTask");
  ok(r.status === 200 && get("players/f3").earnedActive === true, "claiming a task reward marks it");
  mk("f4", {}); await c.creditOfferOnce(env, "wannads", "txF4", "f4", 100);
  ok(get("players/f4").earnedActive === true, "a task-wall credit marks it");
  mk("f5", {}); r = await call2("p:f5", {}, "/game/claimDaily");
  ok(!get("players/f5").earnedActive, "the daily reward alone does NOT mark it");

  /* ---- C) the dry-run plan ---- */
  for (const k of [...store.keys()]) if (k.startsWith("players/") || k.startsWith("inbox/")) store.delete(k);
  mk("a", { lastActiveDate: ago(10) });                                                    // نشط قريب
  mk("b", { lastActiveDate: ago(16) });                                                    // تذكير
  mk("c", { lastActiveDate: ago(36) });                                                    // تحذير (غير محسوب)
  mk("d", { lastActiveDate: ago(61), earnedActive: true });                                // 61 يوم بدون تحذير سابق ← تحذير أول مو تنفيذ
  mk("e", { lastActiveDate: ago(61), earnedActive: true, balanceUsd: 4, inactivityStage: "warn", inactivityWarnedAt: NOW - 8 * DAY });   // محسوب ← تعليق
  mk("f", { lastActiveDate: ago(61), inactivityStage: "warn", inactivityWarnedAt: NOW - 8 * DAY });                                      // غير محسوب ← حذف
  mk("g", { lastActiveDate: ago(61), earnedActive: true, inactivityStage: "warn", inactivityWarnedAt: NOW - 3 * DAY });                 // المهلة ما خلصت
  mk("h", { lastActiveDate: ago(20), inactivityStage: "remind", inactivityRemindedAt: NOW - 4 * DAY });                                 // انذكّر قبل
  mk("i", { lastActiveDate: ago(40), inactivityStage: "warn", inactivityWarnedAt: NOW - 2 * DAY });                                     // انحذّر قبل
  mk("j", { lastActiveDate: ago(90), suspended: true });                                    // معلّق أصلاً
  mk("k", {});                                                                              // ما عنده تاريخ نشاط
  ok((await call2("other", { action: "dryrun" }, "/admin/inactivity")).status === 401 && (await call2("", { action: "get" }, "/admin/inactivity")).status === 401, "the policy screens are admin-only");
  r = await adm({ action: "get" });
  ok(r.json.config.enabled === false && r.json.config.remindDays === 15 && r.json.config.warnDays === 35 && r.json.config.actionDays === 60 && r.json.config.graceDays === 7 && r.json.config.maxActions === 20, "defaults: OFF, 15 / 35 / 60 days, 7 days grace, at most 20 actions per run");
  r = await adm({ action: "dryrun" });
  const act = (uid) => (r.json.plan.find(x => x.uid === uid) || {}).action;
  ok(r.status === 200 && act("a") === undefined && act("b") === "remind" && act("c") === "warn" && act("d") === "warn" && act("e") === "suspend" && act("f") === "delete", "plan: 10 days nothing, 16 days remind, 36 days warn, 61 days never warned = warn first, warned + counted = suspend, warned + not counted = delete");
  ok(act("g") === undefined && act("h") === undefined && act("i") === undefined && act("j") === undefined && act("k") === undefined, "no action while the grace period runs, for already reminded or warned players, already suspended ones, or players without an activity date");
  const pe = r.json.plan.find(x => x.uid === "e"), pf = r.json.plan.find(x => x.uid === "f");
  ok(pe.counted === true && pe.idleDays === 61 && pe.email === "e@x.com" && pf.counted === false && /المكافأة اليومية/.test(pf.reason), "each planned row says the idle days, whether the account counts, and why");
  ok(store.has("players/f") && !pushes.length && !fetchCalls.length, "a dry run changes nothing and sends nothing");

  /* ---- D) it does nothing while switched off ---- */
  await runCron(); ok(!pushes.length && store.has("players/f") && !get("players/e").suspended, "the daily job does nothing while the policy is OFF");
  r = await adm({ action: "save", config: { enabled: true, remindDays: 0, warnDays: 0, actionDays: 0, graceDays: 999, maxActions: 5000 } });
  ok(r.json.config.enabled === true && r.json.config.remindDays === 1 && r.json.config.warnDays === 2 && r.json.config.actionDays === 3 && r.json.config.graceDays === 60 && r.json.config.maxActions === 200, "saving keeps the days in order (reminder < warning < action) and within limits");
  await adm({ action: "save", config: { enabled: true } });
  r = await adm({ action: "get" }); ok(r.json.config.remindDays === 15 && r.json.config.warnDays === 35 && r.json.config.actionDays === 60, "missing values go back to 15 / 35 / 60");
  r = await adm({ action: "run" }); ok(r.status === 400 && r.json.error === "confirm_required", "a manual run needs explicit confirmation");

  /* ---- E) a real run ---- */
  mk("p1", { lastActiveDate: ago(61), pendingTest: true }); put("withdrawRequests/wp1", { uid: "p1", status: "pending", amountUsd: 5, walletAddress: "TPending123456789012345678901234567" });
  await runCron();
  ok(get("players/e").suspended === true && get("players/e").suspendedReason === "inactivity" && get("players/e").balanceUsd === 4 && get("players/e").email === "e@x.com", "a counted account is SUSPENDED (kept, balance untouched)");
  ok(pushes.some(x => x.uid === "e" && x.type === "inactive_suspend"), "and gets a suspension notification");
  ok(!get("players/f") && get("inbox/f") === null, "a not-counted account is DELETED with its data");
  ok(fetchCalls.some(f => /accounts:delete/.test(f.url) && f.body.localId === "f"), "including its login account");
  ok(!!get("players/p1") && get("withdrawRequests/wp1").status === "pending", "an account with a pending request is skipped (never deleted)");
  const logs = [...store.keys()].filter(k => k.startsWith("inactivityLog/")).map(k => get(k));
  ok(logs.some(l => l.uid === "e" && l.action === "suspend" && l.counted === true) && logs.some(l => l.uid === "f" && l.action === "delete" && l.counted === false) && !logs.some(l => l.uid === "p1"), "every suspension and deletion is logged with the reason");
  const pb = pushes.find(x => x.uid === "b" && x.type === "inactive_remind");
  ok(pb && pb.params.days === 16 && get("players/b").inactivityStage === "remind" && get("players/b").inactivityRemindedAt > 0, "the 16-day player got a reminder and is marked");
  const mb = get("inbox/b").items[0]; ok(/اشتقنالك/.test(mb.title) && mb.title_tr && mb.title_en && /16/.test(mb.body), "the reminder is also in-game mail in three languages");
  const pc = pushes.find(x => x.uid === "c" && x.type === "inactive_warn");
  ok(pc && pc.params.counted === false && pc.params.left === 24 && get("players/c").inactivityStage === "warn", "the 36-day not-counted player got a warning saying deletion in 24 days");
  const pd = pushes.find(x => x.uid === "d" && x.type === "inactive_warn");
  ok(pd && pd.params.counted === true && pd.params.left === 7 && !get("players/d").suspended && get("players/d").inactivityStage === "warn", "a 61-day player never warned gets a warning with the 7-day grace, not an immediate suspension");
  ok(!pushes.some(x => x.uid === "a" || x.uid === "g" || x.uid === "h" || x.uid === "i"), "nobody else was contacted");
  ok(!get("players/g").suspended && get("players/g").inactivityStage === "warn", "a player still inside the grace period is untouched");
  r = await adm({ action: "get" }); ok(r.json.lastRunAt > 0 && /"suspend":1/.test(r.json.lastRunSummary) && /"delete":1/.test(r.json.lastRunSummary), "the admin can see the last run's summary");
  const before = pushes.length, logsN = logs.length; await runCron();
  ok(pushes.length === before && [...store.keys()].filter(k => k.startsWith("inactivityLog/")).length === logsN, "running again repeats nothing (no double reminders or actions)");

  /* ---- F) safety limit ---- */
  for (const n of [1, 2, 3, 4]) mk("m" + n, { lastActiveDate: ago(70), earnedActive: true, inactivityStage: "warn", inactivityWarnedAt: NOW - 10 * DAY });
  await adm({ action: "save", config: { enabled: true, maxActions: 2 } }); await runCron();
  ok(["m1", "m2", "m3", "m4"].filter(u => get("players/" + u).suspended === true).length === 2, "at most maxActions (2) suspensions/deletions per run");
  await runCron(); ok(["m1", "m2", "m3", "m4"].filter(u => get("players/" + u).suspended === true).length === 4, "the rest are handled by the next run");
  await adm({ action: "save", config: { enabled: true } });

  /* ---- G) a suspended account ---- */
  r = await call2("p:e", {}, "/game/state");
  ok(r.status === 403 && r.json.error === "account_suspended" && /معلّق/.test(r.json.message), "a suspended player cannot play: he gets a clear 'suspended, contact us' answer");
  r = await call2("p:e", { coin: "usdt", network: "TRC20", address: "TX123456789012345678901234567890123", amount: 6 }, "/game/withdraw"); ok(r.status === 403, "nor withdraw");
  r = await call2("p:e", { confirm: true }, "/game/deleteAccount"); ok(r.status === 200 && !get("players/e"), "but he can still delete his own account");
  let raised = null; try { await c.mutatePlayer(env, "j", () => {}); } catch (e) { raised = e; }
  ok(raised && raised.code === "account_suspended", "the player update function itself refuses suspended accounts");
  await vm.runInContext("mutatePlayerAdmin", c)(env, "j", (p) => { p.points += 7; }); ok(get("players/j").points === 307, "admin-side corrections (refunds) still work on a suspended account");
  r = await adm({ action: "suspended" }); ok(r.json.players.some(x => x.uid === "j") && r.json.players.some(x => x.uid === "m1" && x.email === "m1@x.com"), "the admin sees the suspended accounts with email and idle days");
  r = await adm({ action: "unsuspend", uid: "j" });
  ok(r.status === 200 && get("players/j").suspended === false && get("players/j").lastActiveDate === today() && !get("players/j").inactivityStage, "lifting a suspension clears the flags and restarts the idle clock");
  r = await call2("p:j", {}, "/game/state"); ok(r.status === 200, "the player can play again");
  await runCron(); ok(!get("players/j").suspended && !pushes.some(x => x.uid === "j"), "and the next run does not bother him");
  r = await adm({ action: "unsuspend", uid: "ghost" }); ok(r.status === 500 && !store.has("players/ghost"), "unsuspending an account that does not exist creates nothing");

  /* ---- H) coming back ---- */
  r = await call2("p:c", {}, "/game/state");
  ok(r.status === 200 && !get("players/c").inactivityStage && get("players/c").inactivityWarnedAt === 0 && get("players/c").lastActiveDate === today(), "a warned player who opens the game is cleared (no stale warning counts later)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
