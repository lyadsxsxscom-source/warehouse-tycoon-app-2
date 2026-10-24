// اختبارات السيرفر: اشتراط الاشتراك بقناة Yardova قبل التحقق بالبوت (بزر اشتراك + زر "اشتركت"، تفعيل من الأدمن)
// التشغيل: node tools/tests/telegram_worker.test.js
const vm = require("vm"), fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
function load(extra) {
  const src = fs.readFileSync(path.join(__dirname, "../../worker/worker.js"), "utf8").replace("export default {", "const __worker = {");
  const ctx = vm.createContext({ console, Request, Response, Headers, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout, Math, Date, JSON, Object, Array, Number, String, Promise, Error, Map, Set, Uint8Array, atob, btoa, fetch: () => { throw new Error("no net"); }, ...extra });
  vm.runInContext(src, ctx); return ctx;
}
const nodeCrypto = require("crypto");
const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const kv = new Map();
const env = { FIREBASE_SA: JSON.stringify({ project_id: "proj", client_email: "sa@proj.iam.gserviceaccount.com", private_key: privateKey }), TELEGRAM_BOT_TOKEN: "123456:TESTTOKEN",
  PENDING_CREDITS: { get: async k => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } } };
const hmac = (key, msg) => nodeCrypto.createHmac("sha256", key).update(msg).digest("hex");
const WEBHOOK_SECRET = hmac(env.TELEGRAM_BOT_TOKEN, "yardova:webhook");
(async () => {
  const c = load(); const store = new Map(); let tick = 1; const tgCalls = [], authCalls = [];
  const nameToPath = n => n.split("/documents/")[1];
  c.getGoogleAccessToken = async (e, scope) => "tok";
  c.fsGetDoc = async (e, p) => { const d = store.get(p); return d ? { exists: true, data: c.fieldsToObj(d.fields), updateTime: d.t } : { exists: false, data: null, updateTime: null }; };
  c.fsCommit = async (e, ws) => {
    for (const w of ws) { if (w.delete) continue; const cur = store.get(nameToPath(w.update.name)), pre = w.currentDocument;
      if (pre && pre.exists === false && cur) throw Object.assign(new Error("ALREADY_EXISTS"), { conflict: true });
      if (pre && pre.updateTime && (!cur || cur.t !== pre.updateTime)) throw Object.assign(new Error("FAILED_PRECONDITION"), { conflict: true }); }
    for (const w of ws) { if (w.delete) { store.delete(nameToPath(w.delete)); continue; }
      const path = nameToPath(w.update.name), cur = store.get(path);
      if (w.updateTransforms && !Object.keys(w.update.fields || {}).length) continue;
      store.set(path, { fields: w.updateMask ? { ...(cur ? cur.fields : {}), ...w.update.fields } : w.update.fields, t: String(++tick) }); }
    return {};
  };
  c.fsRunQuery = async (e, coll, field, limit, offset, filter) => {
    let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) }));
    if (filter) rows = rows.filter(r => filter.field.split(".").reduce((o, k) => (o == null ? o : o[k]), r.data) === filter.value);
    return rows.slice(0, limit);
  };
  c.fetch = async (url, o) => {
    const u = String(url), body = o && o.body ? JSON.parse(o.body) : {};
    if (u.startsWith("https://api.telegram.org/")) { const method = u.split("/").pop(); tgCalls.push({ method, body });
      if (method === "getMe") return { ok: true, json: async () => ({ ok: true, result: { username: "YardovaLoginBot" } }) };
      if (method === "getWebhookInfo") return { ok: true, json: async () => ({ ok: true, result: { url: "https://x/telegram/webhook", pending_update_count: 0 } }) };
      return { ok: true, json: async () => ({ ok: true, result: {} }) }; }
    authCalls.push({ url: u, body }); return { ok: true, status: 200, text: async () => "", json: async () => ({}) };
  };
  c.loadConfig = async () => ({ game: { workers: {} }, pricing: { minWithdrawUsd: 5 }, shop: {} });
  const ADMIN = vm.runInContext("ADMIN_UID", c);
  const TOK = { admin: { sub: ADMIN }, u1: { sub: "u1", name: "Ahmad", email: "a@x.com" }, u2: { sub: "u2", email: "b@x.com" }, tg777: { sub: "tg_777", tgName: "Ali" } };
  c.verifyFirebaseToken = async (t) => TOK[t] || null;
  const W = vm.runInContext("__worker", c);
  const post = async (pathname, token, body, headers) => { const r = await W.fetch(new Request("https://x" + pathname, { method: "POST", headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(headers || {}) }, body: typeof body === "string" ? body : JSON.stringify(body || {}) }), env, { waitUntil: p => p }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, json: j, text: t }; };
  const hook = (update, secret = WEBHOOK_SECRET) => post("/telegram/webhook", "", update, secret === null ? {} : { "X-Telegram-Bot-Api-Secret-Token": secret });
  const put = (p, o) => store.set(p, { fields: c.objToFields(o), t: String(++tick) });
  const get = (p) => { const d = store.get(p); return d ? c.fieldsToObj(d.fields) : null; };
  const upd = (id, from, text, extra = {}, chatType = "private") => ({ update_id: 1, message: { message_id: 1, from: { id: from, first_name: "Ali", language_code: extra.lang || "ar", is_bot: !!extra.bot }, chat: { id: from, type: chatType }, ...(text != null ? { text } : {}), ...(extra.contact ? { contact: extra.contact } : {}) } });
  const lastSent = () => { const m = tgCalls.filter(t => t.method === "sendMessage"); return m[m.length - 1] ? m[m.length - 1].body : null; };
  const sentCount = () => tgCalls.filter(t => t.method === "sendMessage").length;
  const start = async (mode, token) => { const r = await post("/auth/telegram/start", token || "", { mode }); return r; };
  // a full successful bot conversation for telegram user `id` (phone digits `phone`)
  const converse = async (s, id, phone, lang) => { await hook(upd(1, id, "/start " + s.json.nonce, { lang })); await hook(upd(1, id, s.json.code, { lang })); return hook(upd(1, id, null, { lang, contact: { phone_number: "+" + phone, user_id: id, first_name: "Ali" } })); };
  const poll = (s, token, secret) => post("/auth/telegram/poll", token || "", { nonce: s.json.nonce, pollSecret: secret || s.json.pollSecret });
  const verifyJwt = (jwt) => { const [h, p, sg] = jwt.split("."); const okSig = nodeCrypto.verify("RSA-SHA256", Buffer.from(h + "." + p), publicKey, Buffer.from(sg, "base64url")); return { okSig, header: JSON.parse(Buffer.from(h, "base64url")), payload: JSON.parse(Buffer.from(p, "base64url")) }; };
  const R = j => ({ ok: true, json: async () => j });
  const members = new Map(); let chatFail = false, webhookAllowed = ["message", "callback_query"]; members.set(999, { status: "administrator" });
  c.fetch = async (url, o) => {
    const u = String(url), bd = o && o.body ? JSON.parse(o.body) : {};
    if (u.startsWith("https://api.telegram.org/")) { const method = u.split("/").pop(); tgCalls.push({ method, body: bd });
      if (method === "getMe") return R({ ok: true, result: { id: 999, username: "YardovaLoginBot" } });
      if (method === "getWebhookInfo") return R({ ok: true, result: { url: "https://x/telegram/webhook", pending_update_count: 0, allowed_updates: webhookAllowed } });
      if (method === "getChatMember") { if (chatFail) return R({ ok: false, description: "Bad Request: chat not found" }); const m = members.get(bd.user_id) || { status: "left" }; return R({ ok: true, result: m }); }
      return R({ ok: true, result: {} }); }
    authCalls.push({ url: u, body: bd }); return { ok: true, status: 200, text: async () => "", json: async () => ({}) };
  };
  const cb = (from, data, id = "cbq1") => ({ update_id: 2, callback_query: { id, from: { id: from, first_name: "Ali", language_code: "ar", is_bot: false }, message: { message_id: 5, chat: { id: from, type: "private" } }, data } });
  const calls = (m) => tgCalls.filter(t => t.method === m);
  const lastAnswer = () => { const a = calls("answerCallbackQuery"); return a[a.length - 1] ? a[a.length - 1].body : null; };
  const status = (s) => get("tgSessions/" + s.json.nonce).status;
  const kb = (m) => (m && m.reply_markup && m.reply_markup.inline_keyboard) || [];

  /* ---- A) admin switch ---- */
  ok((await post("/admin/telegram", "u1", { action: "require", value: true })).status === 401, "only the admin can switch the channel requirement");
  let r = await post("/admin/telegram", "admin", { action: "status" });
  ok(r.json.channel.name === "@YardovaGame" && r.json.channel.canCheck === true && r.json.channel.required === false && r.json.callbacksOk === true, "status shows the channel, that the bot is admin there, that the requirement is OFF by default and that button clicks are registered");
  webhookAllowed = ["message"]; r = await post("/admin/telegram", "admin", { action: "status" });
  ok(r.json.callbacksOk === false, "an old webhook registration (messages only) is flagged so the admin knows to press 'link the bot' again");
  webhookAllowed = ["message", "callback_query"];
  members.set(999, { status: "left" });
  r = await post("/admin/telegram", "admin", { action: "require", value: true });
  ok(r.status === 400 && r.json.error === "bot_not_admin" && /@YardovaGame/.test(r.json.message) && !(get("config/tgAuth") || {}).requireChannel, "the requirement cannot be switched on while the bot is not an admin of the channel");
  members.set(999, { status: "administrator" });
  r = await post("/admin/telegram", "admin", { action: "require", value: true });
  ok(r.status === 200 && r.json.channel.required === true && get("config/tgAuth").requireChannel === true, "once the bot is admin the requirement can be switched on and is stored");

  /* ---- B) a player who has not joined ---- */
  let s = await start("login"); tgCalls.length = 0;
  await hook(upd(1, 111, "/start " + s.json.nonce));
  let m = lastSent();
  ok(status(s) === "awaiting_sub" && /مشترك بقناة/.test(m.text), "a player who is not in the channel is asked to join first (not asked for the code yet)");
  ok(kb(m)[0][0].url === "https://t.me/YardovaGame" && kb(m)[1][0].callback_data === "sub:" + s.json.nonce, "the message has a button to open the channel and a '✅ I joined' button");
  r = await poll(s); ok(r.json.status === "waiting" && r.json.step === "subscribe", "the game is told the current step is 'subscribe'");
  await hook(upd(1, 111, s.json.code));
  ok(status(s) === "awaiting_sub" && /مشترك بقناة/.test(lastSent().text), "typing the code too early does not skip the subscription");
  await hook(cb(222, "sub:" + s.json.nonce, "stranger"));
  ok(status(s) === "awaiting_sub" && lastAnswer().show_alert === true, "another Telegram user cannot press the button of someone else's session");
  await hook(cb(111, "sub:" + s.json.nonce, "c2"));
  ok(status(s) === "awaiting_sub" && lastAnswer().callback_query_id === "c2" && lastAnswer().show_alert === true && /لسا ما لقيناك/.test(lastAnswer().text), "pressing '✅ I joined' without joining shows an alert and nothing moves");
  members.set(111, { status: "member" }); tgCalls.length = 0;
  await hook(cb(111, "sub:" + s.json.nonce, "c3"));
  ok(status(s) === "awaiting_code" && !lastAnswer().show_alert && /الرمز المكوّن من 6 أرقام/.test(lastSent().text), "after joining, '✅ I joined' moves on and asks for the 6-digit code");
  await hook(upd(1, 111, s.json.code));
  await hook(upd(1, 111, null, { contact: { phone_number: "+963991110001", user_id: 111 } }));
  r = await poll(s);
  ok(r.json.status === "verified" && typeof r.json.customToken === "string", "the rest of the login (code, phone) still works and the player signs in");

  /* ---- C) text fallback (no button press) ---- */
  s = await start("login"); await hook(upd(1, 112, "/start " + s.json.nonce));
  ok(status(s) === "awaiting_sub", "second player: asked to join");
  members.set(112, { status: "creator" }); await hook(upd(1, 112, "تم"));
  ok(status(s) === "awaiting_code" && /الرمز/.test(lastSent().text), "typing any message after joining also continues (even if the button is missed)");
  members.set(112, { status: "left" });

  /* ---- D) which memberships count ---- */
  for (const [id, mem, expectSub] of [[120, { status: "member" }, false], [121, { status: "administrator" }, false], [122, { status: "creator" }, false], [123, { status: "restricted", is_member: true }, false], [124, { status: "left" }, true], [125, { status: "kicked" }, true], [126, { status: "restricted", is_member: false }, true]]) {
    members.set(id, mem); const t = await start("login"); await hook(upd(1, id, "/start " + t.json.nonce));
    ok((status(t) === "awaiting_sub") === expectSub, `membership "${mem.status}${mem.is_member !== undefined ? " (is_member " + mem.is_member + ")" : ""}" ${expectSub ? "must join first" : "passes"}`);
  }

  /* ---- E) fail-open when the channel cannot be checked ---- */
  chatFail = true; s = await start("login"); await hook(upd(1, 130, "/start " + s.json.nonce));
  ok(status(s) === "awaiting_code", "if Telegram cannot check the channel (bot removed as admin) players are NOT locked out");
  chatFail = false;

  /* ---- F) languages and expiry ---- */
  s = await start("login"); await hook(upd(1, 140, "/start " + s.json.nonce, { lang: "tr" }));
  m = lastSent(); ok(/abone olmalısın/.test(m.text) && kb(m)[0][0].text === "📢 Kanala katıl" && kb(m)[1][0].text === "✅ Katıldım", "Turkish player: Turkish text and buttons");
  s = await start("login"); await hook(upd(1, 141, "/start " + s.json.nonce, { lang: "en" }));
  m = lastSent(); ok(/join the official Yardova channel/.test(m.text) && kb(m)[1][0].text === "✅ I joined", "English player: English text and buttons");
  const old = get("tgSessions/" + s.json.nonce); put("tgSessions/" + s.json.nonce, { ...old, createdAt: Date.now() - 6 * 60 * 1000 });
  await hook(cb(141, "sub:" + s.json.nonce, "late")); ok(lastAnswer().callback_query_id === "late" && lastAnswer().show_alert === true && /انتهت صلاحية/.test(lastAnswer().text), "pressing the button after the session expired shows 'expired'");
  await hook(cb(141, "garbage", "bad")); ok(lastAnswer().callback_query_id === "bad" && !lastAnswer().text, "an unknown button is answered silently");

  /* ---- G) switched off ---- */
  r = await post("/admin/telegram", "admin", { action: "require", value: false });
  ok(r.status === 200 && r.json.channel.required === false, "the requirement can be switched off");
  s = await start("login"); tgCalls.length = 0; await hook(upd(1, 150, "/start " + s.json.nonce));
  ok(status(s) === "awaiting_code" && calls("getChatMember").length === 0, "with the requirement off the old flow is unchanged and the channel is not even checked");
  r = await post("/admin/telegram", "admin", { action: "setup" });
  ok(JSON.stringify(calls("setWebhook").pop().body.allowed_updates) === '["message","callback_query"]', "linking the bot registers button clicks as well");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
