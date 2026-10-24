// اختبارات السيرفر: الدخول عبر تلغرام (بوت، رمز تأكيد، مشاركة الرقم، توكن الدخول، الربط، الحماية)
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

  /* ---- A) admin setup ---- */
  ok((await post("/admin/telegram", "u1", { action: "status" })).status === 401, "bot setup is admin-only");
  let r = await post("/admin/telegram", "admin", { action: "setup" });
  const sw = tgCalls.find(t => t.method === "setWebhook");
  ok(r.json.ok && r.json.setupOk === true && r.json.username === "YardovaLoginBot" && r.json.webhookOk === true, "setup connects the bot to the server and reports its username and webhook state");
  ok(sw && sw.body.url === "https://x/telegram/webhook" && sw.body.secret_token === WEBHOOK_SECRET && JSON.stringify(sw.body.allowed_updates) === '["message","callback_query"]' && sw.body.drop_pending_updates === true, "the webhook is registered with a secret derived from the bot token, for messages and button clicks");
  ok(!/123456:TESTTOKEN/.test(r.text) && !r.text.includes(WEBHOOK_SECRET), "neither the bot token nor the webhook secret is ever returned");
  tgCalls.length = 0; r = await post("/admin/telegram", "admin", { action: "status" });
  ok(r.json.ok && r.json.setupOk === null && !tgCalls.some(t => t.method === "setWebhook"), "'status' only reads, it never changes the webhook");
  const keep = env.TELEGRAM_BOT_TOKEN; delete env.TELEGRAM_BOT_TOKEN;
  r = await post("/admin/telegram", "admin", { action: "setup" }); ok(r.status === 503 && r.json.error === "no_token", "without the token secret the admin gets a clear error");
  r = await start("login"); ok(r.status === 503 && r.json.error === "no_token", "players cannot start Telegram login before the token is configured");
  env.TELEGRAM_BOT_TOKEN = keep;

  /* ---- B) starting a login ---- */
  let s = await start("login");
  ok(s.status === 200 && s.json.ok && /^[A-Za-z0-9_-]{22}$/.test(s.json.nonce) && /^\d{6}$/.test(s.json.code) && s.json.pollSecret.length >= 30, "start returns a session id, a 6-digit code and a private poll secret");
  ok(s.json.botUrl === "https://t.me/YardovaLoginBot?start=" + s.json.nonce && s.json.expiresIn === 300, "and the link that opens the bot with that session");
  const sd = get("tgSessions/" + s.json.nonce);
  ok(sd.status === "started" && sd.mode === "login" && sd.pollHash === nodeCrypto.createHash("sha256").update(s.json.pollSecret).digest("hex") && !JSON.stringify(sd).includes(s.json.pollSecret), "the poll secret is stored only as a hash");
  ok((await start("link")).status === 401, "linking requires an existing signed-in player");
  const ls = await start("link", "u1"); ok(ls.status === 200 && get("tgSessions/" + ls.json.nonce).uid === "u1" && get("tgSessions/" + ls.json.nonce).mode === "link", "a link session remembers which player asked");
  kv.clear(); for (let i = 0; i < 30; i++) await start("login"); r = await start("login");
  ok(r.status === 429 && r.json.error === "rate_limited", "too many starts from one address are refused (SMS-bombing style abuse)"); kv.clear();

  /* ---- C) webhook security ---- */
  tgCalls.length = 0;
  s = await start("login");
  ok((await hook(upd(1, 777, "/start " + s.json.nonce), null)).status === 401 && (await hook(upd(1, 777, "/start " + s.json.nonce), "wrong")).status === 401 && sentCount() === 0 && get("tgSessions/" + s.json.nonce).status === "started", "a webhook call without the right secret is refused and does nothing");
  ok((await post("/telegram/webhook", "", "not json", { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET })).status === 200, "garbage from Telegram never produces an error (always 200)");
  await hook(upd(1, 777, "/start " + s.json.nonce, { bot: true })); await hook(upd(1, 777, "/start " + s.json.nonce, {}, "group"));
  ok(sentCount() === 0 && get("tgSessions/" + s.json.nonce).status === "started", "bots and group chats are ignored");
  await hook(upd(1, 777, "/start")); ok(/افتح لعبة Yardova/.test(lastSent().text), "/start without a session just explains what to do");
  await hook(upd(1, 777, "/start nonexistent_nonce_value_123")); ok(/انتهت صلاحية/.test(lastSent().text), "an unknown or old session link says it expired");

  /* ---- D) the full new-player flow ---- */
  tgCalls.length = 0;
  await hook(upd(1, 777, "/start " + s.json.nonce));
  ok(lastSent().chat_id === 777 && /الرمز المكوّن من 6 أرقام/.test(lastSent().text) && get("tgSessions/" + s.json.nonce).status === "awaiting_code" && get("tgSessions/" + s.json.nonce).tgUserId === 777, "the bot asks for the code shown in the game and remembers the Telegram user");
  r = await poll(s); ok(r.json.status === "waiting" && r.json.step === "enter_code", "the app is told to wait for the code step");
  r = await post("/auth/telegram/poll", "", { nonce: s.json.nonce, pollSecret: "wrong-secret-wrong-secret-wrong" }); ok(r.status === 404, "polling with a wrong poll secret is refused");
  await hook(upd(1, 777, "hello")); ok(/6 أرقام/.test(lastSent().text), "random text just repeats the question");
  const wrong = s.json.code === "123456" ? "654321" : "123456";
  await hook(upd(1, 777, wrong)); ok(/الرمز غلط/.test(lastSent().text) && get("tgSessions/" + s.json.nonce).attempts === 1, "a wrong code is counted and refused");
  await hook(upd(1, 777, s.json.code));
  ok(get("tgSessions/" + s.json.nonce).status === "awaiting_contact" && lastSent().reply_markup.keyboard[0][0].request_contact === true && /شارك رقمي/.test(lastSent().reply_markup.keyboard[0][0].text), "the right code unlocks the 'share my number' button");
  r = await poll(s); ok(r.json.step === "share_contact", "the app is told to wait for the number step");
  await hook(upd(1, 777, null, { contact: { phone_number: "+963933000111", user_id: 555, first_name: "Other" } }));
  ok(/رقمك أنت/.test(lastSent().text) && get("tgSessions/" + s.json.nonce).status === "awaiting_contact", "someone else's contact card is refused (must be your own number)");
  tgCalls.length = 0;
  await hook(upd(1, 777, null, { contact: { phone_number: "+963933000111", user_id: 777, first_name: "Ali" } }));
  const vs = get("tgSessions/" + s.json.nonce);
  ok(vs.status === "verified" && /^[0-9a-f]{64}$/.test(vs.phoneHash) && !JSON.stringify(vs).includes("963933000111") && lastSent().reply_markup.remove_keyboard === true, "sharing your own number verifies the session and stores only a hash, never the number");
  r = await poll(s);
  ok(r.status === 200 && r.json.status === "verified" && r.json.isNew === true && typeof r.json.customToken === "string", "the app receives a sign-in token");
  const jwt = verifyJwt(r.json.customToken);
  ok(jwt.okSig && jwt.header.alg === "RS256" && jwt.payload.uid === "tg_777" && jwt.payload.iss === "sa@proj.iam.gserviceaccount.com" && jwt.payload.sub === jwt.payload.iss && jwt.payload.aud === "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit" && jwt.payload.exp - jwt.payload.iat <= 3600 && jwt.payload.claims.tg === true && jwt.payload.claims.tgName === "Ali", "it is a valid Firebase custom token signed with the service account, for a Telegram-based player id");
  ok(get("players/tg_777").tgLinked === true && get("players/tg_777").tgUserId === 777 && get("players/tg_777").displayName === "Ali" && get("tgAccounts/777").uid === "tg_777" && get("phoneHashes/" + vs.phoneHash).uid === "tg_777", "the new player and both lookups (Telegram id, phone hash) are created");
  r = await poll(s); ok(r.json.status === "expired" && !r.json.customToken, "the same session can never produce a second token");

  /* ---- E) returning and same-phone players ---- */
  put("players/tg_777", { ...get("players/tg_777"), points: 500 });
  let s2 = await start("login"); await converse(s2, 777, "963933000111"); r = await poll(s2);
  ok(r.json.status === "verified" && r.json.isNew === false && verifyJwt(r.json.customToken).payload.uid === "tg_777" && get("players/tg_777").points === 500, "a returning player gets a token for the SAME account and his progress is untouched");
  let s3 = await start("login"); await converse(s3, 888, "963933000111"); r = await poll(s3);
  ok(r.json.status === "verified" && r.json.isNew === false && verifyJwt(r.json.customToken).payload.uid === "tg_777" && get("tgAccounts/888").uid === "tg_777" && !get("players/tg_888"), "the same phone number from a different Telegram account opens the same game account (one account per number)");

  /* ---- F) linking Telegram to an existing Google player ---- */
  put("players/u1", { points: 900, activeDays: 4, shelves: c.defaultShelves(), totalPointsEarned: 900 });
  let l = await start("link", "u1"); await converse(l, 999, "963944555666");
  ok((await poll(l, "")).status === 401, "reading a link result needs the player's sign-in");
  r = await poll(l, "u2"); ok(r.status === 403 && get("tgSessions/" + l.json.nonce).status === "verified", "another player cannot collect the link, and the session stays usable");
  r = await poll(l, "u1");
  ok(r.json.status === "linked" && get("players/u1").tgLinked === true && get("players/u1").tgUserId === 999 && get("players/u1").points === 900 && get("tgAccounts/999").uid === "u1", "linking marks the Google player as linked and keeps his progress");
  let s4 = await start("login"); await converse(s4, 999, "963944555666"); r = await poll(s4);
  ok(verifyJwt(r.json.customToken).payload.uid === "u1" && r.json.isNew === false, "afterwards 'sign in with Telegram' opens his Google account (no duplicate)");
  put("players/u2", { points: 10, shelves: c.defaultShelves(), totalPointsEarned: 10 });
  let l2 = await start("link", "u2"); await converse(l2, 999, "963944555666"); r = await poll(l2, "u2");
  ok(r.json.status === "failed" && r.json.reason === "taken" && !get("players/u2").tgLinked, "a Telegram account already linked to another player cannot be linked again");
  let l3 = await start("link", "u1"); await converse(l3, 1000, "963900000001"); r = await poll(l3, "u1");
  ok(r.json.status === "failed" && r.json.reason === "already_linked" && get("players/u1").tgUserId === 999, "a player cannot swap to a different Telegram account");

  /* ---- G) expiry, attempts, languages ---- */
  let e1 = await start("login"); put("tgSessions/" + e1.json.nonce, { ...get("tgSessions/" + e1.json.nonce), createdAt: Date.now() - 6 * 60 * 1000 });
  tgCalls.length = 0; await hook(upd(1, 700, "/start " + e1.json.nonce)); ok(/انتهت صلاحية/.test(lastSent().text) && get("tgSessions/" + e1.json.nonce).status === "started", "a session older than 5 minutes cannot be used");
  ok((await poll(e1)).json.status === "expired", "and the app is told it expired");
  let a1 = await start("login"); await hook(upd(1, 701, "/start " + a1.json.nonce));
  const bad = a1.json.code === "111111" ? "222222" : "111111";
  for (let i = 0; i < 4; i++) await hook(upd(1, 701, bad)); ok(/الرمز غلط/.test(lastSent().text), "four wrong codes are still allowed");
  await hook(upd(1, 701, bad)); ok(/محاولات كتير/.test(lastSent().text) && get("tgSessions/" + a1.json.nonce).status === "failed", "the fifth wrong code kills the session");
  await hook(upd(1, 701, a1.json.code)); ok(get("tgSessions/" + a1.json.nonce).status === "failed", "even the right code is useless after that");
  ok((await poll(a1)).json.status === "failed", "the app is told it failed");
  let t1 = await start("login"); await hook(upd(1, 702, "/start " + t1.json.nonce, { lang: "tr" })); ok(/6 haneli/.test(lastSent().text), "Turkish Telegram users get Turkish messages");
  let t2 = await start("login"); await hook(upd(1, 703, "/start " + t2.json.nonce, { lang: "en" })); ok(/6-digit/.test(lastSent().text), "English Telegram users get English messages");
  await hook(upd(1, 704, null, { contact: { phone_number: "+1", user_id: 704 } })); ok(/انتهت صلاحية/.test(lastSent().text), "a number shared with no active session is refused politely");

  /* ---- H) game integration ---- */
  put("players/tg_777", { ...get("players/tg_777"), displayName: "" });
  r = await post("/game/state", "tg777", {});
  ok(r.json.ok && r.json.state.tgLinked === true && get("players/tg_777").displayName === "Ali", "the game state tells the app Telegram is linked, and the player's name comes from Telegram");
  put("players/u2", { ...get("players/u2"), tgLinked: false });
  ok((await post("/game/state", "u2", {})).json.state.tgLinked === false, "players without a link are told so (the app can offer 'link Telegram')");

  /* ---- I) deleting an account removes the Telegram link ---- */
  authCalls.length = 0;
  const ph777 = get("tgAccounts/777").phoneHash;
  r = await post("/game/deleteAccount", "tg777", { confirm: true });
  ok(r.json.ok && !get("players/tg_777") && !get("tgAccounts/777") && !get("phoneHashes/" + ph777), "deleting a Telegram player removes his account, the Telegram lookup and the phone hash");
  ok(![...store.keys()].some(k => k.startsWith("tgSessions/") && get(k).tgUserId === 777) && authCalls.some(a => /accounts:delete/.test(a.url) && a.body.localId === "tg_777"), "his old sessions are removed and the login account is deleted");
  ok(!!get("tgAccounts/999") && !!get("players/u1"), "other players' Telegram links are untouched");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
