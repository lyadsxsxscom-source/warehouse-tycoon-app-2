// اختبارات السيرفر للمرحلة الأولى: قائمة اللاعبين الكاملة، إعدادات السحب العامة، رسائل الأدمن
// التشغيل: node tools/tests/phase1_worker.test.js
const vm = require("vm"), fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
function load(extra) {
  const src = fs.readFileSync(path.join(__dirname, "../../worker/worker.js"), "utf8").replace("export default {", "const __worker = {");
  const ctx = vm.createContext({ console, Request, Response, Headers, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout, Math, Date, JSON, Object, Array, Number, String, Promise, Error, Map, Set, Uint8Array, atob, btoa, fetch: () => { throw new Error("no net"); }, ...extra });
  vm.runInContext(src, ctx); return ctx;
}
const env = { FIREBASE_SA: JSON.stringify({ project_id: "proj" }), PENDING_CREDITS: { get: async () => null, put: async () => {} } };

(async () => {
  /* ---- A) the real query builder: ordering is optional, offset is passed ---- */
  {
    const c = load(); const sent = [];
    c.getGoogleAccessToken = async () => "t";
    c.fetch = async (url, o) => { sent.push(JSON.parse(o.body).structuredQuery); return { ok: true, json: async () => [] }; };
    await c.fsRunQuery(env, "players", null, 800);
    await c.fsRunQuery(env, "offerTx", "createdAt", 1000);
    await c.fsRunQuery(env, "pushTokens", "__name__", 30, 60);
    ok(!sent[0].orderBy && sent[0].limit === 800 && !("offset" in sent[0]), "no ordering requested -> Firestore returns every document, even those missing the sort field");
    ok(sent[1].orderBy[0].field.fieldPath === "createdAt" && sent[1].orderBy[0].direction === "DESCENDING", "ordered queries still work as before");
    ok(sent[2].offset === 60 && sent[2].limit === 30, "offset and limit are sent for batching");
  }

  /* ---- shared mock database ---- */
  const c = load(); const store = new Map(); let tick = 1;
  const nameToPath = n => n.split("/documents/")[1];
  c.fsGetDoc = async (e, p) => { const d = store.get(p); return d ? { exists: true, data: c.fieldsToObj(d.fields), updateTime: d.t } : { exists: false, data: null, updateTime: null }; };
  c.fsCommit = async (e, ws) => { for (const w of ws) if (w.update) store.set(nameToPath(w.update.name), { fields: w.update.fields, t: String(++tick) }); return {}; };
  c.fsRunQuery = async (e, coll, field, limit, offset) => {
    let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) }));
    const key = r => field === "__name__" ? r.id : (Number(r.data[field]) || 0);
    if (field) rows.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
    else rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));          // بدون ترتيب: Firestore بيرجّع حسب اسم المستند تصاعدي
    return rows.slice(offset || 0, (offset || 0) + limit);
  };
  let CFG = { game: { workers: {} }, pricing: { minWithdrawUsd: 5, firstWithdrawUsd: 1, firstWithdrawDays: 7, firstWithdrawAds: 35, btcUsd: 84000, usdToSyp: 138, secretNote: "x" } };
  let cfgReads = 0; c.loadConfig = async () => { cfgReads++; return CFG; };
  const ADMIN = vm.runInContext("ADMIN_UID", c);
  c.verifyFirebaseToken = async (t) => t === "admin" ? { sub: ADMIN } : t === "user" ? { sub: "u1" } : null;
  c.getGoogleAccessToken = async () => "tok";
  const W = vm.runInContext("__worker", c);
  const call = (pathname, method, token, body) => W.fetch(new Request("https://x" + pathname, { method, headers: token ? { Authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  const put = (p, o) => store.set(p, { fields: c.objToFields(o), t: String(++tick) });
  const NOW = Date.now();

  /* ---- B) players list includes old documents without the date field ---- */
  put("players/new1", { firstSeenDate: "2026-10-12", firstSeenAt: NOW - 1000, adsWatched: 0, activeDays: 1, email: "new@x.com" });
  put("players/old1", { adsWatched: 5, activeDays: 4 });                       // old document: no firstSeenAt at all
  put("players/old2", { firstSeenDate: "legacy", firstSeenAt: 0, activeDays: 9 });
  let j = await (await call("/admin/players", "POST", "admin", {})).json();
  ok(j.ok && j.players.length === 3, "players list returns all 3 documents, including the one without a first-seen date");
  ok(j.players[0].uid === "new1" && j.players.some(p => p.uid === "old1" && p.activeDays === 4), "newest player first; the old document is present");
  ok((await call("/admin/players", "POST", "user", {})).status === 401, "players list still admin-only");

  /* ---- C) public config ---- */
  let r = await call("/public-config", "GET", null);
  j = await r.json();
  ok(r.status === 200 && j.ok && j.minWithdrawUsd === 5 && j.firstWithdrawUsd === 1 && j.firstWithdrawDays === 7 && j.firstWithdrawAds === 35, "public config returns the live withdrawal numbers");
  ok(JSON.stringify(Object.keys(j).sort()) === JSON.stringify(["firstWithdrawAds", "firstWithdrawDays", "firstWithdrawUsd", "minWithdrawUsd", "ok"]), "only the five public fields are exposed (no prices, rates or other settings)");
  ok(r.headers.get("Access-Control-Allow-Origin") === "*" && /max-age/.test(r.headers.get("Cache-Control") || ""), "public config is readable from the website and cacheable");
  const before = cfgReads; await call("/public-config", "GET", null); ok(cfgReads === before, "a second request within a minute does not re-read the settings");
  ok((await call("/public-config", "POST", null)).status === 404, "only GET is served");

  /* ---- D) admin messages ---- */
  const fcm = []; let failTokens = new Set();
  c.fetch = async (url, o) => { const m = JSON.parse(o.body).message; fcm.push({ url, m }); return { ok: !failTokens.has(m.token), text: async () => "" }; };
  const tok = (uid, extra) => put("pushTokens/" + uid, { token: "dev-" + uid, lang: "ar", prefs: {}, updatedAt: NOW, ...extra });
  ok((await call("/admin/message", "POST", "", { action: "list" })).status === 401 && (await call("/admin/message", "POST", "user", { action: "list" })).status === 401, "messages are admin-only");
  tok("a1"); tok("a2", { lang: "tr" }); tok("a3", { prefs: { news: false } }); tok("a4", { lang: "en" });
  j = await (await call("/admin/message", "POST", "admin", { action: "preview", target: "all" })).json();
  ok(j.ok && j.recipients === 3, "preview counts devices that did not turn announcements off (3 of 4)");
  j = await (await call("/admin/message", "POST", "admin", { action: "preview", target: "one", uid: "a3" })).json();
  ok(j.recipients === 0, "preview for one player who turned announcements off = 0");
  j = await (await call("/admin/message", "POST", "admin", { action: "preview", target: "one", uid: "nobody" })).json();
  ok(j.recipients === 0, "preview for a player with no registered device = 0");
  r = await call("/admin/message", "POST", "admin", { action: "send", target: "all", title: "  ", body: "x", offset: 0 });
  ok(r.status === 400, "empty title is refused");

  fcm.length = 0;
  r = await call("/admin/message", "POST", "admin", { action: "send", target: "one", uid: "a2", email: "t@x.com", title: "مرحبا", body: "نص عربي", title_tr: "Merhaba", body_tr: "Türkçe metin" });
  j = await r.json();
  ok(j.ok && j.sent === 1 && j.failed === 0 && fcm.length === 1, "message to one player is sent");
  ok(fcm[0].url.includes("/projects/proj/messages:send") && fcm[0].m.token === "dev-a2" && fcm[0].m.notification.title === "Merhaba" && fcm[0].m.notification.body === "Türkçe metin" && fcm[0].m.data.type === "announcement", "the Turkish text is used for a Turkish-language device");
  const logOne = c.fieldsToObj(store.get("adminMessages/" + j.id).fields);
  ok(logOne.status === "done" && logOne.target === "one" && logOne.toEmail === "t@x.com" && logOne.sent === 1, "a log entry is saved for the single message");
  fcm.length = 0;
  await call("/admin/message", "POST", "admin", { action: "send", target: "one", uid: "a4", title: "Hi", body: "Only Arabic given" });
  ok(fcm.length === 1 && fcm[0].m.notification.title === "Hi", "a missing translation falls back to the main text");
  fcm.length = 0;
  r = await call("/admin/message", "POST", "admin", { action: "send", target: "one", uid: "a3", title: "x", body: "y" });
  j = await r.json(); ok(r.status === 200 && j.ok && j.sent === 0 && j.inbox === true && fcm.length === 0, "a player who turned announcements off gets no push, but the message is saved in his in-app inbox");
  r = await call("/admin/message", "POST", "admin", { action: "send", target: "one", uid: "ghost", title: "x", body: "y" });
  j = await r.json(); ok(r.status === 200 && j.inbox === true && j.sent === 0 && c.fieldsToObj(store.get("inbox/ghost").fields).items.length === 1, "a player without any registered device still gets the message in his inbox");
  fcm.length = 0;
  const longTitle = "ع".repeat(100); r = await call("/admin/message", "POST", "admin", { action: "send", target: "one", uid: "a1", title: longTitle, body: "line1\n\n   line2" });
  ok(fcm[0].m.notification.title.length === 60 && fcm[0].m.notification.body === "line1 line2", "title is cut to 60 characters and whitespace is normalised");

  // broadcast in batches
  for (const k of [...store.keys()]) if (k.startsWith("pushTokens/")) store.delete(k);
  for (let i = 0; i < 65; i++) tok("t" + String(i).padStart(3, "0"), i === 5 ? { prefs: { news: false } } : {});
  failTokens = new Set(["dev-t010", "dev-t020"]);
  fcm.length = 0;
  let offset = 0, id = null, sent = 0, failed = 0, calls = 0, done = false;
  while (!done && calls < 10) {
    j = await (await call("/admin/message", "POST", "admin", { action: "send", target: "all", title: "تحديث", body: "نسخة جديدة", offset, id, expected: 64 })).json();
    if (!j.ok) break; id = j.id; sent += j.sent; failed += j.failed; offset += j.processed; done = j.done; calls++;
  }
  ok(calls === 3 && done && offset === 65, "65 devices are processed in 3 batches of at most 30");
  const targets = fcm.map(x => x.m.token);
  ok(new Set(targets).size === targets.length && targets.length === 64 && !targets.includes("dev-t005"), "every device gets the message exactly once; the one who opted out is skipped");
  ok(sent === 62 && failed === 2, "delivered and failed counts are reported (62 + 2)");
  let logAll = c.fieldsToObj(store.get("adminMessages/" + id).fields);
  ok(logAll.status === "sending" && logAll.recipients === 64, "the log shows 'sending' until the admin page finishes");
  await call("/admin/message", "POST", "admin", { action: "finish", id, sent, failed, recipients: 64 });
  logAll = c.fieldsToObj(store.get("adminMessages/" + id).fields);
  ok(logAll.status === "done" && logAll.sent === 62 && logAll.failed === 2, "finish saves the final counts");
  j = await (await call("/admin/message", "POST", "admin", { action: "list" })).json();
  ok(j.ok && j.messages.length >= 3 && j.messages[0].createdAt >= j.messages[j.messages.length - 1].createdAt && j.messages.some(m => m.id === id && m.sent === 62), "the log list is returned newest first");
  r = await call("/admin/message", "POST", "admin", { action: "send", target: "all", title: "x", body: "y", offset: 30, id: "../bad" });
  ok(r.status === 400, "a continuation batch with a malformed id is refused");
  const qshapes = []; const realQuery = c.fsRunQuery; c.fsRunQuery = async (e, coll, field, limit, offset) => { qshapes.push([coll, field, limit, offset || 0]); return realQuery(e, coll, field, limit, offset); };
  await call("/admin/message", "POST", "admin", { action: "preview", target: "all" }); await call("/admin/message", "POST", "admin", { action: "send", target: "all", title: "x", body: "y", offset: 0, expected: 1 });
  ok(qshapes.filter(q => q[0] === "pushTokens").every(q => q[1] === null), "device lists are read in the default document order (no special ordering field)");
  c.fsRunQuery = async () => { throw new Error("fsQuery 400: Invalid argument"); };
  r = await call("/admin/message", "POST", "admin", { action: "preview", target: "all" }); j = await r.json();
  ok(r.status === 500 && /fsQuery 400/.test(j.message), "a server-side failure now tells the admin why instead of a bare 'failed': " + j.message);
  r = await call("/admin/players", "POST", "admin", {}); j = await r.json();
  ok(r.status === 500 && /خطأ بالسيرفر/.test(j.message), "the players list also reports the reason");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
