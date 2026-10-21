// اختبارات الصفحة العامة للمتجر (4أ): اللوحة الجانبية، دخول Google، عرض الحساب، الخروج، لوحة المفاتيح
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_account.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html0 = fs.readFileSync(path.join(__dirname, "../../site/store/index.html"), "utf8");
const html = html0.replace(/<script src="[^"]+"><\/script>\s*/g, "");
const TREE = [{ id: "nA", type: "folder", name: "PUBG", priceUsd: 0, imageUrl: "", children: [{ id: "n1", type: "item", name: "60 UC", priceUsd: 0.92, imageUrl: "" }] }];
function open(opts = {}) {
  const h = { calls: [], signIn: 0, signOut: 0, signInError: null, meMode: "ok", authCb: null, customer: opts.customer || { id: "u1", name: "Ali Salem", email: "ali@x.com", vip: 1, spentUsd: 0, createdAt: 1 } };
  h.dom = new JSDOM(html, { url: "https://yardova.ly-ad.de/store/", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
    w.scrollTo = () => {};
    w.fetch = async (url, o) => { h.calls.push({ url: String(url), auth: o && o.headers && o.headers.Authorization });
      if (String(url).endsWith("/store/me")) { if (h.meMode === "fail") return { ok: false, status: 500, json: async () => ({ ok: false }) }; return { ok: true, status: 200, json: async () => ({ ok: true, customer: h.customer }) }; }
      return { ok: true, status: 200, json: async () => ({ ok: true, items: TREE, methods: [] }) }; };
    if (!opts.noFirebase) {
      const auth = () => ({ onAuthStateChanged(cb) { h.authCb = cb; }, signInWithPopup() { h.signIn++; return h.signInError ? Promise.reject(h.signInError) : Promise.resolve(); }, signOut() { h.signOut++; return Promise.resolve(); } });
      auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth };
    }
  } });
  h.w = h.dom.window; h.d = h.w.document; h.$ = id => h.d.getElementById(id);
  h.user = (name = "Ali") => ({ uid: "u1", displayName: name, getIdToken: async () => "TOKEN" });
  h.key = (k, extra = {}) => h.d.dispatchEvent(new h.w.KeyboardEvent("keydown", { key: k, bubbles: true, ...extra }));
  return h;
}
(async () => {
  { const h = open(); await sleep(80); const $ = h.$;
    /* ---- the button and the panel ---- */
    ok($("btnMenu").getAttribute("aria-label") === "حسابي" && $("btnMenu").getAttribute("aria-expanded") === "false" && $("btnMenu").getAttribute("aria-controls") === "drawer" && $("drawer").hidden && $("scrim").hidden, "a menu button in the header; the panel and the dark layer are closed at first");
    ok($("drawer").getAttribute("role") === "dialog" && $("drawer").getAttribute("aria-modal") === "true" && $("drawer").getAttribute("aria-labelledby") === "drTitle", "the panel is marked as a dialog for screen readers");
    $("btnMenu").click();
    ok(!$("drawer").hidden && !$("scrim").hidden && h.d.body.classList.contains("lock") && $("btnMenu").getAttribute("aria-expanded") === "true" && h.d.activeElement === $("btnCloseDrawer"), "opening shows the panel and the dark layer, locks the page scroll and moves focus into the panel");
    ok(/سجّل دخول/.test($("drBody").textContent) && $("btnGoogle") && /الدخول بحساب Google/.test($("btnGoogle").textContent) && /بيتعمل لك أول ما تدخل/.test($("drBody").textContent) && !h.calls.some(c => c.url.endsWith("/store/me")), "signed out: an invitation, a Google button, and a note that the account is created on first sign-in");

    /* ---- sign in ---- */
    $("btnGoogle").click(); await sleep(30); ok(h.signIn === 1 && $("btnGoogle").disabled, "the button starts Google sign-in (and cannot be pressed twice)");
    for (const [code, re, label] of [["auth/popup-closed-by-user", /سكّرت نافذة الدخول/, "closed the window"], ["auth/popup-blocked", /منع نافذة الدخول/, "blocked pop-up"], ["auth/network-request-failed", /ما في اتصال/, "no internet"], ["auth/whatever", /تعذّر الدخول/, "anything else"]]) {
      h.signInError = Object.assign(new Error("raw <b>x</b>"), { code }); h.$("btnGoogle") && (h.$("btnGoogle").disabled = false); h.$("btnGoogle").click(); await sleep(30);
      ok(re.test(h.$("accMsg").textContent) && !/raw/.test(h.$("accMsg").textContent) && h.$("accMsg").getAttribute("role") === "alert" && !h.$("btnGoogle").disabled, "sign-in error (" + label + ") shows a clear message and lets him try again");
    }
    h.signInError = null;
    h.authCb(h.user()); await sleep(80);
    const me = h.calls.filter(c => c.url.endsWith("/store/me")); ok(me.length === 1 && me[0].url === "https://postback.ly-ad.de/store/me" && me[0].auth === "Bearer TOKEN", "after signing in the page asks the server for the account with the sign-in token");
    ok($("accName").textContent === "Ali Salem" && $("accEmail").textContent === "ali@x.com" && $("accEmail").getAttribute("dir") === "ltr" && $("accVip").textContent === "VIP 1" && $("accSpent").textContent === "$0.00" && $("btnLogout"), "the panel shows name, email, VIP level, total spent and a sign-out button");

    /* ---- stays closed/open correctly ---- */
    $("btnCloseDrawer").click(); ok($("drawer").hidden && $("scrim").hidden && !h.d.body.classList.contains("lock") && $("btnMenu").getAttribute("aria-expanded") === "false" && h.d.activeElement === $("btnMenu"), "✕ closes it, unlocks scrolling and returns focus to the menu button");
    $("btnMenu").click(); h.$("scrim").click(); ok($("drawer").hidden, "tapping the dark layer closes it");
    $("btnMenu").click(); h.key("Escape"); ok($("drawer").hidden && h.d.activeElement === $("btnMenu"), "Escape closes it");
    $("btnMenu").click();
    /* ---- keyboard stays inside ---- */
    const btns = [...$("drawer").querySelectorAll("button")]; btns[btns.length - 1].focus(); h.key("Tab"); ok(h.d.activeElement === btns[0], "Tab from the last button goes back to the first (focus never leaves the panel)");
    h.key("Tab", { shiftKey: true }); ok(h.d.activeElement === btns[btns.length - 1], "Shift+Tab from the first goes to the last");

    /* ---- sign out ---- */
    $("btnLogout").click(); await sleep(30); ok(h.signOut === 1, "sign-out calls Firebase");
    h.authCb(null); await sleep(30); ok($("btnGoogle") && !$("accName") && !/Ali Salem/.test($("drBody").textContent), "after signing out the panel is the sign-in screen again, with nothing left of the account");
    $("btnCloseDrawer").click();
  }
  /* ---- values, safety, errors ---- */
  { const h = open({ customer: { id: "u2", name: "<img src=x onerror=alert(1)>Mr", email: "m@x.com", vip: 5, spentUsd: 1234.5, createdAt: 1 } }); await sleep(60);
    h.authCb(h.user()); await sleep(80); h.$("btnMenu").click();
    ok(h.$("accVip").textContent === "VIP 5" && h.$("accSpent").textContent === "$1,234.50", "VIP level and spending are formatted (VIP 5, $1,234.50)");
    ok(h.d.querySelector("#drBody img") === null && h.$("accName").textContent === "<img src=x onerror=alert(1)>Mr", "a name is plain text, never HTML"); }
  { const h = open(); await sleep(60); h.meMode = "fail"; h.authCb(h.user()); await sleep(80); h.$("btnMenu").click();
    ok(/تعذّر تحميل حسابك/.test(h.$("accMsg").textContent) && h.$("btnRetryAcc") && h.$("btnLogout"), "if the server fails: a message, a retry button and still a way to sign out");
    h.meMode = "ok"; h.$("btnRetryAcc").click(); await sleep(80); ok(h.$("accName") && h.$("accName").textContent === "Ali Salem", "retry loads the account"); }
  { const h = open(); await sleep(60); h.authCb(h.user()); await sleep(80);
    ok(h.calls.filter(c => c.url.endsWith("/store/me")).length === 1, "a visitor who is already signed in is recognised when the page opens");
    h.$("btnMenu").click(); ok(h.$("accName").textContent === "Ali Salem", "and the panel shows his account at once");
    h.customer = { id: "u3", name: "Second User", email: "s@x.com", vip: 1, spentUsd: 0, createdAt: 1 }; h.authCb(null); h.authCb({ ...h.user(), uid: "u3" }); await sleep(80);
    ok(h.$("accName").textContent === "Second User" && !/Ali Salem/.test(h.$("drBody").textContent), "when another person signs in nothing of the previous account is shown"); }
  /* ---- Firebase missing ---- */
  { const h = open({ noFirebase: true }); await sleep(100); h.$("btnMenu").click();
    ok(/تعذّر تحميل تسجيل الدخول/.test(h.$("accMsg").textContent) && !h.$("btnGoogle"), "if the sign-in library cannot load the panel says so");
    h.$("btnCloseDrawer").click(); ok(h.d.querySelectorAll("#catalog .card").length === 1, "and the store itself still works"); }
  /* ---- static ---- */
  ok(!/innerHTML|document\.write|eval\(/.test(html0) && /firebase-app-compat\.js/.test(html0) && /firebasejs\/10\.12\.2\//.test(html0) && /noindex/.test(html0), "no raw HTML insertion; Firebase 10.12.2 from Google; still hidden from search engines");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
