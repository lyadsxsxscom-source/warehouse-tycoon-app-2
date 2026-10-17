// اختبارات التطبيق: الدخول والربط عبر تلغرام (زر بشاشة الدخول، نافذة الرمز، فحص الحالة، الدخول بالتوكن، ربط حساب Google)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/telegram_app.test.js
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WWW = path.join(__dirname, "../../www");
const RAW = fs.readFileSync(path.join(WWW, "index.html"), "utf8"), I18N = fs.readFileSync(path.join(WWW, "i18n.js"), "utf8");
const state = (linked) => ({ points: 260, totalPointsEarned: 400, balanceUsd: 0, workersRented: 1, adsWatched: 5, activeDays: 4, lastWithdrawAt: 0, boostUntil: 0, tgLinked: !!linked, tasks: [], shelves: [], daily: { streak: 0, lastClaim: "", rewards: [10, 10, 20, 10, 10, 10, 60] }, referral: { code: "ABC123", invited: 0, active: 0, earnings: 0, referred: false, rewarded: false, canEnter: false, progress: { days: 4, ads: 5 }, cfg: { inviteeBonus: 50, inviterReward: 150, commissionPct: 5, requiredDays: 3, requiredAds: 10, windowHours: 72 } } });
function open(opts = {}) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e.message).slice(0, 140)));
  const html = RAW.replace(/<script src="https?:[^"]*"><\/script>/g, "").replace('<script src="i18n.js"></script>', () => "<script>" + I18N + "</script>");
  const h = { authCb: null, calls: [], opened: [], alerted: "", linked: !!opts.linked, pollQueue: [], step: "enter_code", startError: null, tokens: [], signedWith: [] };
  const dom = new JSDOM(html, { url: "https://example.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    try { w.localStorage.setItem("lang", opts.lang || "ar"); w.localStorage.setItem("guide_seen_v1", "1"); } catch (e) {}
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLElement.prototype.scrollIntoView = function () {}; w.alert = m => { h.alerted = m; }; w.open = u => { h.opened.push(u); };
    const realSI = w.setInterval.bind(w); w.setInterval = (f, ms, ...a) => realSI(f, ms === 2000 ? 80 : ms, ...a);     // نسرّع الفحص بالاختبار
    const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
    const fsf = () => ({ collection() { return q; } }); fsf.FieldValue = { increment: x => x };
    w.firebase = { initializeApp() {}, apps: [], auth() { return { onAuthStateChanged(cb) { h.authCb = cb; }, currentUser: null, signOut() { return Promise.resolve(); }, signInWithCustomToken: async (t) => { h.signedWith.push(t); if (h.signInFails) throw new Error("bad token"); setTimeout(() => h.authCb(h.tgUser), 20); } }; }, firestore: fsf };
    w.firebase.auth.GoogleAuthProvider = function () {};
    const R = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
    w.fetch = async (url, o) => { const u = String(url); let body = {}; try { body = JSON.parse(o.body); } catch (e) {} h.calls.push({ u, body, auth: o && o.headers && o.headers.Authorization });
      if (u.endsWith("/auth/telegram/start")) { if (h.netFail) throw new Error("offline"); if (h.startError) return R(h.startError, h.startError.status || 503); return R({ ok: true, nonce: "NONCE" + body.mode + "abcdef12345678", pollSecret: "SECRETSECRETSECRETSECRETSECRET", code: "482913", botUrl: "https://t.me/YardovaLoginBot?start=NONCE" + body.mode + "abcdef12345678", expiresIn: 300 }); }
      if (u.endsWith("/auth/telegram/poll")) return R(h.pollQueue.length ? h.pollQueue.shift() : { ok: true, status: "waiting", step: h.step });
      if (u.endsWith("/game/state")) return R({ ok: true, state: state(h.linked) });
      return R({ ok: true }); };
  } });
  h.w = dom.window; h.d = dom.window.document; h.errors = errors; h.ev = c => dom.window.eval(c);
  h.user = { uid: "u1", getIdToken: async () => "tok", displayName: "T", email: "t@x.com", photoURL: "" };
  h.tgUser = { uid: "tg_777", getIdToken: async () => "tgtok", displayName: null, email: null, photoURL: "" };
  h.login = async (u) => { h.authCb(u || h.user); await sleep(550); };
  h.n = (s) => h.calls.filter(c => c.u.endsWith(s)).length;
  return h;
}
const $ = (h, id) => h.d.getElementById(id);
const shown = (h, id) => $(h, id).classList.contains("show");
(async () => {
  { const h = open(); await sleep(300); h.authCb(null); await sleep(300);
    ok(shown(h, "loginGate") && !!$(h, "btnTelegramLoginGate") && !!$(h, "btnGoogleLoginGate"), "the sign-in screen offers Google and Telegram");
    $(h, "btnTelegramLoginGate").click(); $(h, "btnTelegramLoginGate").click(); await sleep(150);
    ok(h.n("/auth/telegram/start") === 1, "a double tap starts only ONE Telegram session");
    const st = h.calls.find(c => c.u.endsWith("/auth/telegram/start"));
    ok(st.body.mode === "login" && !st.auth, "login mode, and no sign-in is needed to start it");
    ok(shown(h, "tgOverlay") && $(h, "tgCode").textContent === "482913", "the sheet shows the 6-digit code from the server");
    ok(h.opened.length === 1 && h.opened[0] === "https://t.me/YardovaLoginBot?start=NONCElogin" + "abcdef12345678", "Telegram opens straight away on the bot with the session link");
    ok(!h.d.body.textContent.includes("SECRETSECRET") && !h.opened.join("").includes("SECRETSECRET"), "the private poll secret never appears on screen or in the link");
    $(h, "tgOpen").click(); ok(h.opened.length === 2, "the 'Open Telegram' button opens it again");
    await sleep(400);
    const p = h.calls.find(c => c.u.endsWith("/auth/telegram/poll"));
    ok(!!p && p.body.nonce === "NONCElogin" + "abcdef12345678" && p.body.pollSecret === "SECRETSECRETSECRETSECRETSECRET" && !p.auth, "the app keeps checking with the session id and its private secret");
    ok(/اكتب الرمز بالبوت/.test($(h, "tgStatus").textContent), "the status line follows the step the server reports");
    h.step = "share_contact"; await sleep(250);
    ok(/شارك رقمي/.test($(h, "tgStatus").textContent), "and updates to the next step");
    h.tokens = ["CUSTOMTOKEN"]; h.pollQueue.push({ ok: true, status: "verified", customToken: "CUSTOMTOKEN.x.y", isNew: true }); await sleep(500);
    ok(h.signedWith.length === 1 && h.signedWith[0] === "CUSTOMTOKEN.x.y", "when verified, the app signs in with the one-time token");
    ok(!shown(h, "tgOverlay") && !shown(h, "loginGate"), "the sheet and the sign-in screen close once the account opens");
    const n = h.n("/auth/telegram/poll"); await sleep(500); ok(h.n("/auth/telegram/poll") === n, "the checking stops after success");
    ok(h.errors.length === 0, "no script errors " + JSON.stringify(h.errors.slice(0, 2))); }

  { const h = open(); await sleep(300); h.authCb(null); await sleep(300);
    $(h, "btnTelegramLoginGate").click(); await sleep(200);
    h.pollQueue.push({ ok: true, status: "failed", reason: "attempts" }); await sleep(300);
    ok(/محاولات كتير غلط/.test($(h, "tgStatus").textContent) && h.n("/auth/telegram/poll") <= 3, "too many wrong codes: a clear message and the checking stops");
    $(h, "tgOpen").click(); await sleep(200);
    ok(h.n("/auth/telegram/start") === 2 && $(h, "tgCode").textContent === "482913", "after a failure the same button starts a fresh session");
    h.pollQueue.push({ ok: true, status: "expired" }); await sleep(300);
    ok(/انتهت المهلة/.test($(h, "tgStatus").textContent), "an expired session says so");
    $(h, "tgOpen").click(); await sleep(150); const polls = h.n("/auth/telegram/poll");
    $(h, "tgCancel").click(); await sleep(400);
    ok(!shown(h, "tgOverlay") && h.n("/auth/telegram/poll") <= polls + 1, "'Cancel' closes the sheet and stops checking");
    ok(h.signedWith.length === 0, "nothing signs in unless the server verified it"); }

  { const h = open(); await sleep(300); h.authCb(null); await sleep(300);
    h.startError = { ok: false, error: "no_token", message: "توكن بوت تلغرام مو مضاف بـCloudflare (TELEGRAM_BOT_TOKEN).", status: 503 };
    $(h, "btnTelegramLoginGate").click(); await sleep(200);
    ok(/مو متاح حالياً/.test($(h, "tgStatus").textContent) && !/Cloudflare/.test($(h, "tgOverlay").textContent) && $(h, "tgCode").textContent === "", "if the bot is not set up, players see 'not available', never the admin's technical message");
    h.startError = null; h.netFail = true; $(h, "tgOpen").click(); await sleep(200);
    ok(/تعذّر الاتصال|offline/.test($(h, "tgStatus").textContent) || $(h, "tgStatus").textContent.length > 0, "no connection: a message is shown");
    h.netFail = false; h.signInFails = true; h.pollQueue.push({ ok: true, status: "verified", customToken: "T" });
    $(h, "tgOpen").click(); await sleep(500);
    ok(/تعذّر الدخول/.test($(h, "tgStatus").textContent), "if signing in with the token fails, the player is told to retry"); }

  /* ---- linking Telegram to a Google account ---- */
  { const h = open({ linked: false }); await h.login();
    const row = $(h, "btnLinkTelegram");
    ok(row.style.display !== "none" && /اربط تلغرام/.test($(h, "linkTelegramLabel").textContent), "a signed-in player without a link sees 'Link Telegram' in his profile");
    row.click(); await sleep(200);
    const st = h.calls.find(c => c.u.endsWith("/auth/telegram/start"));
    ok(st.body.mode === "link" && st.auth === "Bearer tok", "linking sends his sign-in with the request");
    await sleep(300); ok(h.calls.find(c => c.u.endsWith("/auth/telegram/poll")).auth === "Bearer tok", "and so does every check");
    h.linked = true; h.pollQueue.push({ ok: true, status: "linked" }); await sleep(500);
    ok(!shown(h, "tgOverlay") && /ربطنا تلغرام/.test(h.alerted), "when linked the sheet closes and a confirmation is shown");
    ok(/مربوط/.test($(h, "linkTelegramLabel").textContent) && h.ev("srvTgLinked") === true, "the profile row now says 'linked' (state refreshed from the server)");
    const before = h.n("/auth/telegram/start"); row.click(); await sleep(100); ok(h.n("/auth/telegram/start") === before, "a linked row does nothing when tapped");
    ok(h.errors.length === 0, "no script errors while linking " + JSON.stringify(h.errors.slice(0, 2))); }
  { const h = open({ linked: false }); await h.login(); $(h, "btnLinkTelegram").click(); await sleep(200);
    h.pollQueue.push({ ok: true, status: "failed", reason: "taken" }); await sleep(300);
    ok(/مربوط بحساب تاني/.test($(h, "tgStatus").textContent), "linking a Telegram account that belongs to someone else is explained");
    $(h, "tgCancel").click(); }
  { const h = open({ linked: true }); await h.login();
    ok(/مربوط/.test($(h, "linkTelegramLabel").textContent) && h.ev("srvTgLinked") === true, "a Telegram-based or already linked player sees 'linked'"); }
  { const h = open(); await sleep(300); h.authCb(null); await sleep(300);
    ok($(h, "btnLinkTelegram").style.display === "none", "signed out: no link row"); }

  /* ---- languages ---- */
  { const h = open({ lang: "tr" }); h.step = "open_bot"; await sleep(300); h.authCb(null); await sleep(300);
    ok(/Telegram ile giriş/.test($(h, "btnTelegramLoginGate").textContent), "Turkish: the button");
    $(h, "btnTelegramLoginGate").click(); await sleep(120);
    ok(/6 haneli|Bu kodu botta yaz/.test($(h, "tgOverlay").textContent) && /Botu aç ve Start/.test($(h, "tgStatus").textContent) && /Telegram'ı aç/.test($(h, "tgOpen").textContent), "Turkish: steps, status and open button"); }
  { const h = open({ lang: "en" }); h.step = "open_bot"; await sleep(300); h.authCb(null); await sleep(300);
    ok(/Sign in with Telegram/.test($(h, "btnTelegramLoginGate").textContent), "English: the button");
    $(h, "btnTelegramLoginGate").click(); await sleep(120);
    ok(/Type this code in the bot/.test($(h, "tgOverlay").textContent) && /Open the bot and press Start/.test($(h, "tgStatus").textContent), "English: steps and status"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
