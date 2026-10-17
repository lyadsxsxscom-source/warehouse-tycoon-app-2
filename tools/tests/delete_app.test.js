// اختبارات التطبيق: زر "حذف حسابي" (صف بالإعدادات، نافذة تأكيد بخطوتين، طلب السيرفر، تسجيل الخروج)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/delete_app.test.js
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WWW = path.join(__dirname, "../../www");
const RAW = fs.readFileSync(path.join(WWW, "index.html"), "utf8"), I18N = fs.readFileSync(path.join(WWW, "i18n.js"), "utf8");
const STATE = { points: 260, totalPointsEarned: 400, balanceUsd: 1.5, workersRented: 1, adsWatched: 5, activeDays: 4, lastWithdrawAt: 0, boostUntil: 0, tasks: [], shelves: [], daily: { streak: 0, lastClaim: "", rewards: [10, 10, 20, 10, 10, 10, 60] }, referral: { code: "ABC123", invited: 0, active: 0, earnings: 0, referred: false, rewarded: false, canEnter: false, progress: { days: 4, ads: 5 }, cfg: { inviteeBonus: 50, inviterReward: 150, commissionPct: 5, requiredDays: 3, requiredAds: 10, windowHours: 72 } } };
function open(opts = {}) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e.message).slice(0, 140)));
  const html = RAW.replace(/<script src="https?:[^"]*"><\/script>/g, "").replace('<script src="i18n.js"></script>', () => "<script>" + I18N + "</script>");
  const h = { authCb: null, calls: [], signedOut: 0, nativeOut: 0, alerted: "", delResponse: null, delDelay: 0 };
  const dom = new JSDOM(html, { url: "https://example.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    try { w.localStorage.setItem("lang", opts.lang || "ar"); w.localStorage.setItem("guide_seen_v1", "1"); } catch (e) {}
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLElement.prototype.scrollIntoView = function () {}; w.alert = m => { h.alerted = m; };
    if (opts.native) w.Capacitor = { Plugins: { FirebaseAuthentication: { signOut: async () => { h.nativeOut++; } } } };
    const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
    const fsf = () => ({ collection() { return q; } }); fsf.FieldValue = { increment: x => x };
    w.firebase = { initializeApp() {}, apps: [], auth() { return { onAuthStateChanged(cb) { h.authCb = cb; }, currentUser: null, signOut() { h.signedOut++; if (h.authCb) h.authCb(null); return Promise.resolve(); } }; }, firestore: fsf };
    w.firebase.auth.GoogleAuthProvider = function () {};
    const R = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
    w.fetch = async (url, o) => { const u = String(url); let body = {}; try { body = JSON.parse(o.body); } catch (e) {} h.calls.push({ u, body });
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
  { const h = open(); await sleep(300); h.authCb(null); await sleep(200);
    ok($(h, "btnDeleteAccount").style.display === "none", "signed out: there is no delete button"); 
    await h.login();
    ok($(h, "btnDeleteAccount").style.display !== "none" && /حذف حسابي/.test($(h, "btnDeleteAccount").textContent), "signed in: the 'delete my account' row appears in Settings");
    $(h, "btnDeleteAccount").click();
    ok($(h, "deleteOverlay").classList.contains("show") && /حذف حسابك نهائياً/.test($(h, "deleteTitle").textContent), "tapping it opens a warning sheet");
    ok(/رصيدك الحالي \(1\.50\$ و260 نقطة\) رح يضيع/.test($(h, "deleteLoss").textContent), "the sheet says exactly what the player will lose (his balance and points)");
    ok(/بنحتفظ بسجلات السحب والشراء/.test($(h, "deleteOverlay").textContent), "and what is kept (anonymised records)");
    ok($(h, "deleteGo").disabled, "the red button is disabled until the player ticks 'I understand'");
    $(h, "deleteGo").click(); await sleep(50); ok(h.n("/game/deleteAccount") === 0, "pressing a disabled button sends nothing");
    $(h, "deleteAck").checked = true; $(h, "deleteAck").dispatchEvent(new h.w.Event("change")); ok(!$(h, "deleteGo").disabled, "ticking the box enables the button");
    $(h, "deleteCancel").click(); ok(!$(h, "deleteOverlay").classList.contains("show") && h.n("/game/deleteAccount") === 0 && h.signedOut === 0, "'Cancel' closes the sheet and changes nothing");
    $(h, "btnDeleteAccount").click(); ok($(h, "deleteAck").checked === false && $(h, "deleteGo").disabled, "opening it again starts unticked (a fresh, deliberate decision)");
    ok(h.errors.length === 0, "no script errors " + JSON.stringify(h.errors.slice(0, 2))); }

  { const h = open({ native: true }); await h.login(); h.d.querySelector('.navbtn[data-screen="store"]').click();
    $(h, "btnDeleteAccount").click(); $(h, "deleteAck").checked = true; $(h, "deleteAck").dispatchEvent(new h.w.Event("change"));
    h.delDelay = 150; $(h, "deleteGo").click(); $(h, "deleteGo").click(); await sleep(40);
    ok(/جاري الحذف/.test($(h, "deleteGo").textContent) && $(h, "deleteGo").disabled, "while deleting, the button says so and is disabled");
    await sleep(500);
    const dels = h.calls.filter(c => c.u.endsWith("/game/deleteAccount"));
    ok(dels.length === 1 && dels[0].body.confirm === true, "a double tap sends ONE request, with confirm: true");
    ok(h.signedOut >= 1 && h.nativeOut === 1, "after the server deletes the account the app signs the player out (web and native login)");
    ok(!$(h, "deleteOverlay").classList.contains("show") && /انحذف حسابك/.test(h.alerted), "the sheet closes and a goodbye message is shown");
    ok(h.w.localStorage.getItem("guide_seen_v1") === null && h.w.localStorage.getItem("lang") === "ar", "the welcome-guide flag is cleared (a new account sees it) while the language setting stays");
    ok($(h, "loginGate").classList.contains("show") && $(h, "screen-home").classList.contains("active"), "the player lands on the sign-in screen, home tab");
    ok(h.errors.length === 0, "no script errors after deleting " + JSON.stringify(h.errors.slice(0, 2))); }

  { const h = open(); await h.login(); $(h, "btnDeleteAccount").click(); $(h, "deleteAck").checked = true; $(h, "deleteAck").dispatchEvent(new h.w.Event("change"));
    h.delResponse = () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: "pending_requests", message: "عندك طلب (سحب أو شراء أو شحن) قيد المراجعة. استنى لينتهي قبل ما تحذف حسابك." }) });
    $(h, "deleteGo").click(); await sleep(250);
    ok($(h, "deleteOverlay").classList.contains("show") && /قيد المراجعة/.test($(h, "deleteHint").textContent) && !$(h, "deleteGo").disabled && h.signedOut === 0, "a pending request: the reason is shown, the player stays signed in and can retry later");
    h.delResponse = () => { throw new Error("offline"); };
    $(h, "deleteGo").click(); await sleep(250);
    ok(/تعذّر الاتصال/.test($(h, "deleteHint").textContent) && h.signedOut === 0, "no connection: a clear message and nothing is lost"); }

  { const h = open({ lang: "tr" }); await h.login(); $(h, "btnDeleteAccount").click();
    ok(/Hesabımı sil/.test($(h, "btnDeleteAccount").textContent) && /kalıcı olarak silinsin/.test($(h, "deleteTitle").textContent) && /Mevcut bakiyen \(1\.50\$ ve 260 puan\) kaybolacak/.test($(h, "deleteLoss").textContent) && /anlıyorum/.test($(h, "deleteOverlay").textContent) && /Hesabımı kalıcı olarak sil/.test($(h, "deleteGo").textContent), "Turkish texts"); 
    $(h, "deleteAck").checked = true; $(h, "deleteAck").dispatchEvent(new h.w.Event("change")); $(h, "deleteGo").click(); await sleep(400);
    ok(/Hesabın silindi/.test(h.alerted), "Turkish goodbye message"); }
  { const h = open({ lang: "en" }); await h.login(); $(h, "btnDeleteAccount").click();
    ok(/Delete my account/.test($(h, "btnDeleteAccount").textContent) && /Your current balance \(1\.50\$ and 260 points\) will be lost/.test($(h, "deleteLoss").textContent) && /permanent and cannot be undone/.test($(h, "deleteOverlay").textContent), "English texts"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
