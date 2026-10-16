// اختبارات المرحلة E: التنزيل من الموقع الرسمي بس (زر التحديث الإجباري، مشاركة الدعوة، صفحة المتجر)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/stage_e_app.test.js
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, "../..");
const RAW = fs.readFileSync(path.join(ROOT, "www/index.html"), "utf8"), I18N = fs.readFileSync(path.join(ROOT, "www/i18n.js"), "utf8");
const SHOP = fs.readFileSync(path.join(ROOT, "docs/index.html"), "utf8"), SHOPI18N = fs.readFileSync(path.join(ROOT, "docs/i18n.js"), "utf8");
const STATE = { points: 260, totalPointsEarned: 400, balanceUsd: 0, workersRented: 1, adsWatched: 5, activeDays: 4, lastWithdrawAt: 0, boostUntil: 0, tasks: [], shelves: [], daily: { streak: 0, lastClaim: "", rewards: [10, 10, 20, 10, 10, 10, 60] }, referral: { code: "ABC123", invited: 0, active: 0, earnings: 0, referred: false, rewarded: false, canEnter: false, progress: { days: 4, ads: 5 }, cfg: { inviteeBonus: 50, inviterReward: 150, commissionPct: 5, requiredDays: 3, requiredAds: 10, windowHours: 72 } } };
function open(lang) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e.message).slice(0, 140)));
  const html = RAW.replace(/<script src="https?:[^"]*"><\/script>/g, "").replace('<script src="i18n.js"></script>', () => "<script>" + I18N + "</script>");
  const h = { authCb: null, opened: [], shared: [] };
  const dom = new JSDOM(html, { url: "https://example.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    try { w.localStorage.setItem("lang", lang); w.localStorage.setItem("guide_seen_v1", "1"); } catch (e) {}
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.open = (u) => h.opened.push(u);
    w.Capacitor = { Plugins: { Share: { share: async (o) => { h.shared.push(o); } } } };
    const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
    const fsf = () => ({ collection() { return q; } }); fsf.FieldValue = { increment: x => x };
    w.firebase = { initializeApp() {}, apps: [], auth() { return { onAuthStateChanged(cb) { h.authCb = cb; }, currentUser: null, signOut() {} }; }, firestore: fsf }; w.firebase.auth.GoogleAuthProvider = function () {};
    w.fetch = async (u) => ({ ok: true, status: 200, json: async () => (String(u).endsWith("/game/state") ? { ok: true, state: STATE } : { ok: true }) });
  } });
  h.w = dom.window; h.d = dom.window.document; h.errors = errors;
  return h;
}
(async () => {
  ok(!/postback\.ly-ad\.de\/dl/.test(RAW) && !/postback\.ly-ad\.de\/dl/.test(SHOP), "no link straight to the APK file is left in the app or the shop page");
  for (const [lang, expected] of [["ar", "https://yardova.ly-ad.de/?utm_source=app_update"], ["tr", "https://yardova.ly-ad.de/tr/?utm_source=app_update"], ["en", "https://yardova.ly-ad.de/en/?utm_source=app_update"]]) {
    const h = open(lang); await sleep(250);
    h.d.getElementById("btnForceUpdate").click();
    ok(h.opened.length === 1 && h.opened[0] === expected, `forced-update button (${lang}) opens the official website page in the player's language: ${h.opened[0]}`);
  }
  { const h = open("ar"); await sleep(250); h.authCb({ uid: "u1", getIdToken: async () => "t", displayName: "T", email: "t@x.com", photoURL: "" }); await sleep(600);
    h.d.getElementById("btnShareRef").click(); await sleep(150);
    const t = (h.shared[0] || {}).text || "";
    ok(/ABC123/.test(t) && t.includes("https://yardova.ly-ad.de/?utm_source=invite") && !/\/dl/.test(t), "the invite text sends friends to the official website (with the invite code): " + t.replace(/\n/g, " | "));
    ok(h.errors.length === 0, "no script errors " + JSON.stringify(h.errors.slice(0, 2))); }
  { const h = open("en"); await sleep(250); h.authCb({ uid: "u1", getIdToken: async () => "t", displayName: "T", email: "t@x.com", photoURL: "" }); await sleep(600); h.d.getElementById("btnShareRef").click(); await sleep(150);
    ok(((h.shared[0] || {}).text || "").includes("https://yardova.ly-ad.de/en/?utm_source=invite"), "English players share the English page"); }
  // update screen wording + translations
  { const h = open("en"); await sleep(250); const root = h.d.body.textContent.replace(/\s+/g, " ");
    ok(/Open the official download site/.test(root) && /Download it from our official website/.test(root), "forced-update screen wording in English"); }
  { const h = open("tr"); await sleep(250); const root = h.d.body.textContent.replace(/\s+/g, " ");
    ok(/Resmi indirme sitesini aç/.test(root) && /Resmi sitemizden indirip/.test(root), "forced-update screen wording in Turkish"); }
  { const h = open("ar"); await sleep(250); const root = h.d.body.textContent.replace(/\s+/g, " ");
    ok(/فتح موقع التحميل الرسمي/.test(root) && /حمّلها من موقعنا الرسمي/.test(root), "forced-update screen wording in Arabic"); }
  // shop page
  ok(/href="https:\/\/yardova\.ly-ad\.de\/\?utm_source=shop"/.test(SHOP) && /حمّل من الموقع الرسمي/.test(SHOP), "the shop page's download button opens the official website (tracked as 'shop')");
  ok(SHOPI18N.includes('"⬇ حمّل من الموقع الرسمي (Android)"') && SHOPI18N.includes("Download from the official website") && SHOPI18N.includes("Resmi siteden indir"), "the shop page button has Turkish and English texts");
  ok(!/GitHub'dan doğrudan APK|Direct APK file from GitHub/.test(SHOP), "the old 'direct APK from GitHub' note is gone from the shop page");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
