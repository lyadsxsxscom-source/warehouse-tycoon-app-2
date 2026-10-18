// اختبارات التطبيق: شاشة "حسابك معلّق" (عدم نشاط): رسالة، زر تلغرام، تسجيل خروج، وما بتطلع لأخطاء تانية
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/suspended_app.test.js
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WWW = path.join(__dirname, "../../www");
const RAW = fs.readFileSync(path.join(WWW, "index.html"), "utf8"), I18N = fs.readFileSync(path.join(WWW, "i18n.js"), "utf8");
const STATE = { points: 260, totalPointsEarned: 400, balanceUsd: 1.5, workersRented: 1, adsWatched: 5, activeDays: 4, lastWithdrawAt: 0, boostUntil: 0, tasks: [], shelves: [], daily: { streak: 0, lastClaim: "", rewards: [10, 10, 20, 10, 10, 10, 60] }, referral: { code: "ABC123", invited: 0, active: 0, earnings: 0, referred: false, rewarded: false, canEnter: false, progress: { days: 4, ads: 5 }, cfg: { inviteeBonus: 50, inviterReward: 150, commissionPct: 5, requiredDays: 3, requiredAds: 10, windowHours: 72 } } };
function open(opts = {}) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e.message).slice(0, 140)));
  const html = RAW.replace(/<script src="https?:[^"]*"><\/script>/g, "").replace('<script src="i18n.js"></script>', () => "<script>" + I18N + "</script>");
  const h = { authCb: null, calls: [], signedOut: 0, nativeOut: 0, alerted: "", delResponse: null, delDelay: 0, suspended: !!opts.suspended, opened: [] };
  const dom = new JSDOM(html, { url: "https://example.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    try { w.localStorage.setItem("lang", opts.lang || "ar"); w.localStorage.setItem("guide_seen_v1", "1"); } catch (e) {}
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLElement.prototype.scrollIntoView = function () {}; w.open = (u) => { h.opened.push(u); }; w.alert = m => { h.alerted = m; };
    if (opts.native) w.Capacitor = { Plugins: { FirebaseAuthentication: { signOut: async () => { h.nativeOut++; } } } };
    const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
    const fsf = () => ({ collection() { return q; } }); fsf.FieldValue = { increment: x => x };
    w.firebase = { initializeApp() {}, apps: [], auth() { return { onAuthStateChanged(cb) { h.authCb = cb; }, currentUser: null, signOut() { h.signedOut++; if (h.authCb) h.authCb(null); return Promise.resolve(); } }; }, firestore: fsf };
    w.firebase.auth.GoogleAuthProvider = function () {};
    const R = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
    w.fetch = async (url, o) => { const u = String(url); let body = {}; try { body = JSON.parse(o.body); } catch (e) {} h.calls.push({ u, body });
      const SUSP = R({ ok: false, error: "account_suspended", message: "حسابك معلّق بسبب عدم النشاط. تواصل معنا على تلغرام عشان نفكّ التعليق." }, 403);
      if (h.suspended && (u.endsWith("/game/state") || u.endsWith("/game/adReward"))) return SUSP;
      if (u.endsWith("/game/adReward") && h.adError) return R({ ok: false, error: "too_fast", message: "استنى شوي قبل الإعلان الجاي." }, 400);
      if (u.endsWith("/game/state")) return R({ ok: true, state: STATE });
      if (u.endsWith("/game/deleteAccount")) { if (h.delDelay) await sleep(h.delDelay); if (h.delResponse) return h.delResponse(); return R({ ok: true, deleted: true, authDeleted: true }); }
      return R({ ok: true }); };
  } });
  h.w = dom.window; h.d = dom.window.document; h.errors = errors; h.ev = c => dom.window.eval(c);
  h.user = { uid: "u1", getIdToken: async () => "tok", displayName: "T", email: "t@x.com", photoURL: "" };
  h.login = async () => { h.authCb(h.user); await sleep(550); };
  h.n = (suffix) => h.calls.filter(c => c.u.endsWith(suffix)).length;
  return h;
}
const $ = (h, id) => h.d.getElementById(id);
(async () => {
  ok(/const GATES = \['loginGate','forceUpdateGate','vpnGate','suspendedGate'\]/.test(RAW), "the suspended screen is a full-screen gate (the back button cannot close it)");
  { const h = open({ suspended: true }); await h.login(); await sleep(1100);
    const g = $(h, "suspendedGate");
    ok(g.classList.contains("show") && /حسابك معلّق/.test(g.textContent) && /بسبب عدم النشاط/.test($(h, "suspendedMsg").textContent), "a suspended player sees the 'account suspended' screen with the server's reason");
    ok(h.d.getElementById("bootScreen") === null || h.d.getElementById("bootScreen").classList.contains("hide"), "the loading screen does not hang behind it");
    ok(/تواصل معنا على تلغرام/.test($(h, "btnSuspTelegram").textContent), "there is a clear 'contact us on Telegram' button");
    $(h, "btnSuspTelegram").click(); ok(h.opened.length === 1 && h.opened[0] === "https://t.me/YardovaGame", "it opens the Telegram channel");
    $(h, "btnSuspLogout").click(); await sleep(300);
    ok(h.signedOut >= 1 && !g.classList.contains("show") && $(h, "loginGate").classList.contains("show"), "'Sign out' signs out, closes the screen and returns to the login screen");
    ok(h.errors.length === 0, "no script errors " + JSON.stringify(h.errors.slice(0, 2))); }
  { const h = open(); await h.login(); await sleep(300);
    ok(!$(h, "suspendedGate").classList.contains("show"), "a normal player never sees it");
    h.suspended = true; let err = null; try { await h.ev("gameApi('adReward')"); } catch (e) { err = e; }
    ok($(h, "suspendedGate").classList.contains("show") && err && err.code === "account_suspended" , "if the account gets suspended while playing, the next action shows the screen"); }
  { const h = open(); await h.login(); await sleep(300); h.adError = true; let err = null; try { await h.ev("gameApi('adReward')"); } catch (e) { err = e; }
    ok(err && err.code === "too_fast" && !$(h, "suspendedGate").classList.contains("show"), "other server errors do not show the suspended screen"); }
  { const h = open({ suspended: true, lang: "tr" }); await h.login(); await sleep(900);
    ok(/Hesabın askıya alındı/.test($(h, "suspendedGate").textContent) && /Telegram/.test($(h, "suspendedMsg").textContent) && /Bize Telegram'dan ulaş/.test($(h, "btnSuspTelegram").textContent), "Turkish texts"); }
  { const h = open({ suspended: true, lang: "en" }); await h.login(); await sleep(900);
    ok(/Your account is suspended/.test($(h, "suspendedGate").textContent) && /suspended due to inactivity/.test($(h, "suspendedMsg").textContent) && /Contact us on Telegram/.test($(h, "btnSuspTelegram").textContent), "English texts"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
