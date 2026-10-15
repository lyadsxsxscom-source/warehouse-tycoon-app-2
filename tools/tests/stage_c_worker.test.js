// اختبارات المرحلة C (السيرفر): بريد اللاعب (رسائل الأدمن للكل وللفرد)، علامة المقروء، تفضيل "الأخبار"
// التشغيل: node tools/tests/stage_c_worker.test.js
const vm = require("vm"), fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const src = fs.readFileSync(path.join(__dirname, "../../worker/worker.js"), "utf8").replace("export default {", "const __worker = {");
const c = vm.createContext({ console: { log() {}, error() {}, warn() {} }, Request, Response, Headers, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout, Math, Date, JSON, Object, Array, Number, String, Promise, Error, Map, Set, Uint8Array, atob, btoa, fetch: async () => ({ ok: true, text: async () => "" }) });
vm.runInContext(src, c);
const env = { FIREBASE_SA: JSON.stringify({ project_id: "proj" }), PENDING_CREDITS: { get: async () => null, put: async () => {} } };
const store = new Map(); let tick = 1; const np = n => n.split("/documents/")[1];
c.fsGetDoc = async (e, p) => { const d = store.get(p); return d ? { exists: true, data: c.fieldsToObj(d.fields), updateTime: d.t } : { exists: false, data: null, updateTime: null }; };
c.fsCommit = async (e, ws) => { for (const w of ws) if (w.update) store.set(np(w.update.name), { fields: w.update.fields, t: String(++tick) }); return {}; };
c.fsRunQuery = async (e, coll, f, limit, offset) => [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) })).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(offset || 0, (offset || 0) + limit);
c.loadConfig = async () => ({ game: { workers: {} }, pricing: { btcUsd: 84000, ethUsd: 2600, minWithdrawUsd: 5, usdToSyp: 138 } });
c.getGoogleAccessToken = async () => "tok";
const ADMIN = vm.runInContext("ADMIN_UID", c);
c.verifyFirebaseToken = async (t) => t === "admin" ? { sub: ADMIN } : /^u\d$/.test(t) ? { sub: t, name: "N", email: t + "@x.com" } : null;
const W = vm.runInContext("__worker", c);
const call = (p, method, token, body) => W.fetch(new Request("https://x" + p, { method, headers: token ? { Authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
const put = (p, o) => store.set(p, { fields: c.objToFields(o), t: String(++tick) });
const get = p => c.fieldsToObj(store.get(p).fields);
const T0 = Date.now() - 10 * 86400000;
(async () => {
  put("config/broadcasts", { items: [
    { id: "b1", title: "نسخة جديدة", body: "نزّلوها من الموقع", title_tr: "Yeni sürüm", body_tr: "Siteden indirin", title_en: "New version", body_en: "Download it from the site", createdAt: T0 + 3000 },
    { id: "b2", title: "صيانة", body: "بكرا", createdAt: T0 + 1000 } ] });
  put("inbox/u1", { items: [{ id: "d1", title: "تعويض", body: "أضفنا لك نقاط", createdAt: T0 + 2000 }] });
  put("inbox/u2", { items: [{ id: "d2", title: "رسالة لغيرك", body: "سرّية", createdAt: T0 + 2500 }] });
  put("players/u1", { points: 5, shelves: [{ id: 0, unlocked: true, worker: null }], inboxReadAt: T0 + 1500, firstSeenAt: T0, firstSeenDate: "x", activeDays: 3 });
  const inbox = async (tok, lang) => { const r = await call("/game/inbox", "POST", tok, lang ? { lang } : {}); return { r, j: await r.json() }; };

  let { r, j } = await inbox("u1", "ar");
  ok(r.status === 200 && j.ok && j.inbox.messages.map(m => m.id).join() === "b1,d1,b2", "inbox merges broadcast and personal messages, newest first");
  ok(j.inbox.unread === 2 && j.inbox.readAt === T0 + 1500, "unread = messages newer than the last-read time (2)");
  ok(!JSON.stringify(j).includes("سرّية") && !j.inbox.messages.some(m => m.id === "d2"), "another player's personal message is never returned");
  ok(j.inbox.messages[0].title === "نسخة جديدة" && j.inbox.messages[1].body === "أضفنا لك نقاط", "Arabic texts by default");
  ({ j } = await inbox("u1", "tr")); ok(j.inbox.messages[0].title === "Yeni sürüm" && j.inbox.messages[1].title === "تعويض", "Turkish text when available, Arabic fallback when not");
  ({ j } = await inbox("u1", "en")); ok(j.inbox.messages[0].body === "Download it from the site", "English text when available");
  ({ j } = await inbox("u1", "xx")); ok(j.inbox.messages[0].title === "نسخة جديدة", "an unknown language falls back to Arabic");
  r = await call("/game/inbox", "POST", "", {}); ok(r.status === 401, "anonymous requests are refused");
  r = await call("/game/inbox", "POST", "bad", {}); ok(r.status === 401, "invalid tokens are refused");
  // a player without a document yet: nothing counts as unread
  ({ j } = await inbox("u3", "ar")); ok(j.ok && j.inbox.unread === 0 && j.inbox.messages.length === 2, "a brand-new player sees the broadcasts but none is 'unread'");
  // mark as read
  r = await call("/game/inboxRead", "POST", "u1", {}); j = await r.json();
  ok(r.status === 200 && j.ok && get("players/u1").inboxReadAt > T0 + 3000, "marking as read stores the time on the player");
  ({ j } = await inbox("u1", "ar")); ok(j.inbox.unread === 0, "nothing is unread afterwards");
  // new + existing players get a default read marker
  const nowT = Date.now();
  put("players/u4", { points: 5, shelves: [{ id: 0, unlocked: true, worker: null }], firstSeenAt: T0, firstSeenDate: "x" });
  await call("/game/registerPush", "POST", "u4", { token: "tok-4", lang: "tr", prefs: { news: false } });
  ok(get("players/u4").inboxReadAt >= nowT, "an existing player without a marker gets 'now' (old messages are not suddenly unread)");
  const pt = get("pushTokens/u4"); ok(pt.prefs.news === false && pt.prefs.orders === true && pt.prefs.offerwall === true && pt.lang === "tr", "the 'news' preference is saved with the push registration");
  await call("/game/registerPush", "POST", "u2", { token: "tok-2" }); ok(get("pushTokens/u2").prefs.news === true, "news defaults to on");

  // admin -> inbox
  put("pushTokens/u1", { token: "dev-u1", lang: "ar", prefs: {}, updatedAt: 1 });
  const adm = (b) => call("/admin/message", "POST", "admin", b).then(r => r.json());
  j = await adm({ action: "send", target: "one", uid: "u5", title: "عنوان", body: "نص", title_tr: "Başlık", body_tr: "Metin" });
  ok(j.ok && j.inbox === true && j.sent === 0 && get("inbox/u5").items[0].title_tr === "Başlık", "a personal message for a player with no push device is saved in his inbox with its translations");
  ({ j } = await inbox("u5", "tr")); ok(j.inbox.messages.length >= 2 && j.inbox.messages.some(m => m.title === "Başlık"), "and that player can read it (Turkish version)");
  put("players/u5", { points: 5, shelves: [{ id: 0, unlocked: true, worker: null }], inboxReadAt: 1, firstSeenAt: 1, firstSeenDate: "x" });
  let first = await adm({ action: "send", target: "all", title: "للكل", body: "رسالة عامة", offset: 0, expected: 2 });
  const afterFirst = get("config/broadcasts").items.length;
  const second = await adm({ action: "send", target: "all", title: "للكل", body: "رسالة عامة", offset: 30, id: first.id });
  ok(first.ok && get("config/broadcasts").items[0].id === first.id && get("config/broadcasts").items.length === afterFirst && afterFirst === 3, "a broadcast is stored once (first batch only), at the top, with the other broadcasts kept");
  ({ j } = await inbox("u5", "ar")); ok(j.inbox.unread >= 1 && j.inbox.messages[0].title === "للكل", "the broadcast shows as unread for a player");
  // keeps only the newest 20
  for (let i = 0; i < 25; i++) await adm({ action: "send", target: "all", title: "رسالة " + i, body: "x", offset: 0, expected: 1 });
  ok(get("config/broadcasts").items.length === 20 && get("config/broadcasts").items[0].title === "رسالة 24", "the broadcast list keeps the newest 20");
  ok(c.fieldsToObj(store.get("adminMessages/" + first.id).fields).target === "all", "the admin log still records it");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
