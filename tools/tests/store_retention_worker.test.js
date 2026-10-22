// اختبارات السيرفر: تنظيف صور الإيصالات بعد 90 يوم (سياسة الخصوصية): بيمسح الصورة بس، وبيحتفظ بالطلب ورقم العملية
// التشغيل: node tools/tests/store_retention_worker.test.js
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
  const sweep = vm.runInContext("storeRetentionSweep", c);
  const mkOrder = (id, status, ageDays, o) => put("storeOrders/" + id, { uid: "u1", code: "D-" + id, kind: "topup", status, createdAt: NOW - ageDays * DAY, updatedAt: NOW - ageDays * DAY, proof: { ref: "TX-" + id, hasImage: true, submittedAt: NOW - ageDays * DAY, late: false }, ...o });
  const mkProof = (id) => put("storeProofs/" + id, { data: PNG, ver: NOW });
  const hasProof = (id) => store.has("storeProofs/" + id), img = (id) => get("storeOrders/" + id).proof.hasImage;
  let r;
  /* ---- A) what is removed and what is kept ---- */
  for (const [id, st, age] of [["old1", "done", 100], ["old2", "rejected", 95], ["old3", "cancelled", 120], ["old4", "refunded", 200], ["old5", "payment_submitted", 150], ["old6", "awaiting_payment", 91], ["new1", "done", 10], ["new2", "payment_submitted", 1], ["edge1", "done", 89], ["edge2", "done", 91]]) { mkOrder(id, st, age); mkProof(id); }
  mkOrder("noimg", "done", 100, { proof: { ref: "TX-noimg", hasImage: false, submittedAt: NOW - 100 * DAY } }); put("storeOrders/noproof", { uid: "u1", code: "T-1", kind: "order", status: "done", createdAt: NOW - 300 * DAY, updatedAt: NOW - 300 * DAY });
  mkOrder("other", "done", 100, { uid: "u2" }); mkProof("other");
  const n = await sweep(env, NOW);
  ok(n === 8, "8 receipt pictures were removed (the 6 old ones in any final or stale state, the one at 91 days, and another customer's old one): " + n);
  for (const id of ["old1", "old2", "old3", "old4", "old5", "old6", "edge2", "other"]) ok(!hasProof(id) && img(id) === false, "an old receipt picture is deleted and the order says it has none: " + id + " (" + get("storeOrders/" + id).status + ")");
  for (const id of ["new1", "new2", "edge1"]) ok(hasProof(id) && img(id) === true, "a recent one is kept: " + id + " (the boundary: 89 days kept, 91 days removed)");
  ok(get("storeOrders/old1").proof.ref === "TX-old1" && get("storeOrders/old1").proof.purgedAt === NOW && get("storeOrders/old1").status === "done" && get("storeOrders/old1").code === "D-old1" && get("storeOrders/old1").uid === "u1", "the order itself, its payment reference and its owner are kept (for bookkeeping); only the picture goes, and the date is noted");
  ok(!hasProof("noimg") && get("storeOrders/noimg").proof.ref === "TX-noimg" && get("storeOrders/noproof").status === "done", "orders that never had a picture or a proof are untouched");
  /* ---- B) running it again, running it by hand, and the daily job ---- */
  ok(await sweep(env, NOW) === 0, "running it again removes nothing (and costs nothing)");
  mkOrder("late1", "done", 200); mkProof("late1"); r = await adm({ action: "retention_run" }); ok(r.status === 200 && r.json.purged === 1 && !hasProof("late1"), "you can run it by hand from the admin (it reports how many)");
  ok((await adm({ action: "retention_run" }, "u1")).status === 401 && (await adm({ action: "retention_run" }, null)).status === 401, "only the admin can");
  mkOrder("late2", "done", 300); mkProof("late2"); const waits = [];
  await W.scheduled({}, env, { waitUntil: p => waits.push(p) }); await Promise.all(waits);
  ok(!hasProof("late2") && img("late2") === false, "the daily scheduled job runs the clean-up on its own (this is what actually protects you)");
  mkOrder("fail1", "done", 400); mkProof("fail1"); const realRun = c.fsRunQuery; c.fsRunQuery = async () => { throw new Error("db down"); }; const waits2 = [];
  let threw = false; try { await W.scheduled({}, env, { waitUntil: p => waits2.push(p) }); await Promise.all(waits2); } catch (e) { threw = true; } c.fsRunQuery = realRun;
  ok(!threw && hasProof("fail1"), "if the database is down the job fails quietly and nothing is lost (it simply runs again tomorrow)");
  /* ---- C) it never touches anything else ---- */
  ok(store.has("storeOrders/new1") && [...store.keys()].filter(k => k.startsWith("storeProofs/")).length === 4, "recent orders and their pictures are all still there (new1, new2, edge1, and fail1 which could not be cleaned)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
