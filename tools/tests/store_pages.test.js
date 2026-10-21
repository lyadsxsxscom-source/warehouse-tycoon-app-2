// اختبارات: صفحتين المتجر الفاضيتين (الخطوة 0): الصفحة العامة site/store وصفحة الأدمن docs/store-admin.html
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_pages.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, "../..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

/* ---- الصفحة العامة ---- */
const pubHtml = read("site/store/index.html");
const pub = new JSDOM(pubHtml).window.document;
ok(pub.documentElement.lang === "ar" && pub.documentElement.dir === "rtl", "public page: Arabic, right-to-left");
ok(/Yardova/.test(pub.title) && /متجر/.test(pub.title), "public page: has a proper title");
ok(/noindex/.test(pub.querySelector('meta[name="robots"]').content), "public page: kept out of search engines until it is ready");
ok(!!pub.getElementById("catalog") && !!pub.getElementById("crumbs"), "public page: has the catalog area and the path bar");
ok([...pub.querySelectorAll("a")].some(a => a.getAttribute("href") === "/"), "public page: has a way back to the site");
const pubScripts = [...pub.querySelectorAll("script")]; ok(pubScripts.length === 1 && !pubScripts[0].src && pub.querySelectorAll("form, input, [onclick]").length === 0, "public page: one inline script only (no external scripts), no forms");
ok(!/undefined|null|\[object/.test(pub.querySelector("main").textContent), "public page: no leftover template text");
ok(!/\/store/.test(read("site/index.html")) && !/\/store/.test(read("site/sitemap.xml")), "public page: not linked from the home page and not in the sitemap");
ok(/href="\/icon-192\.png"/.test(pubHtml) && fs.existsSync(path.join(ROOT, "site/icon-192.png")) && fs.existsSync(path.join(ROOT, "site/favicon.ico")), "public page: its icons exist");

/* ---- صفحة الأدمن ---- */
const admHtml = read("docs/store-admin.html");
ok(/noindex/.test(admHtml), "admin page: kept out of search engines");
const scripts = [...admHtml.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
ok(scripts.length === 2 && scripts.every(s => s.startsWith("https://www.gstatic.com/firebasejs/10.12.2/")), "admin page: only loads the two Firebase scripts (no Firestore yet)");
ok(!/onclick=|eval\(|innerHTML/.test(admHtml), "admin page: no inline handlers or risky HTML insertion");

const events = { signIn: 0, signOut: 0, signInFail: false }; let authCb = null;
function open() {
  return new JSDOM(admHtml, { runScripts: "dangerously", url: "https://example.test/store-admin.html", pretendToBeVisual: true, beforeParse(w) {
    const auth = () => ({ onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { events.signIn++; return events.signInFail ? Promise.reject(new Error("popup closed <b>x</b>")) : Promise.resolve(); }, signOut() { events.signOut++; return Promise.resolve(); } });
    auth.GoogleAuthProvider = function () {};
    w.firebase = { initializeApp() {}, auth };
    // الصفحة تحمّل سكربتات Firebase من الشبكة: ما منحمّلها بالاختبار
  } });
}
const html2 = admHtml.replace(/<script src="[^"]+"><\/script>\s*/g, "");
const dom = new JSDOM(html2, { runScripts: "dangerously", url: "https://example.test/store-admin.html", pretendToBeVisual: true, beforeParse(w) {
  const auth = () => ({ currentUser: { getIdToken: async () => "T" }, onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { events.signIn++; return events.signInFail ? Promise.reject(new Error("popup closed <b>x</b>")) : Promise.resolve(); }, signOut() { events.signOut++; return Promise.resolve(); } });
  auth.GoogleAuthProvider = function () {};
  w.firebase = { initializeApp() {}, auth };
  w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, nodes: [], max: {} }) });
} });
const d = dom.window.document, $ = id => d.getElementById(id), vis = id => $(id).style.display !== "none";
(async () => {
  await sleep(100);
  authCb(null);
  ok(vis("gate") && !vis("panel") && /دخول/.test($("btnLogin").textContent), "admin page: signed out -> only the sign-in screen");
  $("btnLogin").click(); await sleep(30); ok(events.signIn === 1, "admin page: the button starts Google sign-in");
  events.signInFail = true; $("btnLogin").click(); await sleep(50);
  ok(/تعذّر الدخول/.test($("gateMsg").textContent) && $("gateMsg").querySelector("b") === null, "admin page: a failed sign-in shows the reason as plain text");
  authCb({ uid: "someone-else", email: "x@x.com" }); await sleep(20);
  ok(vis("gate") && !vis("panel") && /مو مشرف/.test($("gateMsg").textContent) && events.signOut === 1, "admin page: a signed-in non-admin is refused and signed out");
  authCb({ uid: "09DZoXtB6afGTGHtFghiUx5t71N2", email: "admin@x.com" }); await sleep(20);
  ok(!vis("gate") && vis("panel") && $("who").textContent === "admin@x.com", "admin page: the admin sees the panel with his email");
  await sleep(50); const tabsNow = [...d.querySelectorAll("#tabs .tab")]; ok(tabsNow.length === 2 && /الكتالوج/.test(tabsNow[0].textContent) && /طرق الدفع/.test(tabsNow[1].textContent) && /فاضي/.test($("emptyNote").textContent), "admin page: the catalog and payment-methods tabs, the catalog empty at first");
  $("btnLogout").click(); await sleep(20); ok(events.signOut === 2, "admin page: sign out works");
  authCb(null); ok(vis("gate") && !vis("panel"), "admin page: after signing out the panel is hidden again");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
