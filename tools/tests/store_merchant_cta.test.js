// اختبارات الصفحة العامة (4ج): قسم "هل أنت تاجر؟ تواصل معنا" برسالة جاهزة ومعرّف الحساب
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_merchant_cta.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html0 = fs.readFileSync(path.join(__dirname, "../../site/store/index.html"), "utf8");
const privacy = fs.readFileSync(path.join(__dirname, "../../docs/privacy.html"), "utf8");
const html = html0.replace(/<script src="[^"]+"><\/script>\s*/g, "");
function open(opts = {}) {
  const h = { meMode: "ok", scrolled: [], authCb: null, customer: opts.customer || { id: "uid-123", name: "Ali", email: "ali@x.com", vip: 1, spentUsd: 0, progressUsd: 0, sizeUsd: 200, remainingUsd: 200, nextVip: 2, createdAt: 1 } };
  h.dom = new JSDOM(html, { url: "https://yardova.ly-ad.de/store/", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
    w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function (o) { h.scrolled.push({ id: this.id, o }); };
    w.fetch = async (url) => { if (String(url).endsWith("/store/me")) { if (h.meMode === "fail") return { ok: false, status: 500, json: async () => ({ ok: false }) }; return { ok: true, status: 200, json: async () => ({ ok: true, customer: h.customer }) }; } return { ok: true, status: 200, json: async () => ({ ok: true, items: [], methods: [] }) }; };
    const auth = () => ({ onAuthStateChanged(cb) { h.authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() { return Promise.resolve(); } });
    auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth };
  } });
  h.w = h.dom.window; h.d = h.w.document; h.$ = id => h.d.getElementById(id);
  h.user = () => ({ uid: "uid-123", getIdToken: async () => "TOKEN" });
  h.msg = (id) => decodeURIComponent(h.$(id).href.split("?text=")[1]);
  return h;
}
(async () => {
  const h = open(); await sleep(80); const $ = h.$;
  /* ---- the section ---- */
  ok(/هل أنت تاجر؟ تواصل معنا/.test($("mcTitle").textContent) && /أسعار الجملة/.test($("merchantCta").textContent) && /حجم صرفك الشهري/.test($("merchantCta").textContent), "the end of the page asks 'Are you a merchant? Contact us' and explains what he gets");
  const order = [...h.d.body.children].map(x => x.id || x.tagName); ok(order.indexOf("merchantCta") > order.indexOf("app") && order.indexOf("merchantCta") < order.indexOf("FOOTER"), "it sits after the catalog and before the footer");
  ok($("ctaTg").href.startsWith("https://t.me/IBRAHEEM932?text=") && $("ctaWa").href.startsWith("https://wa.me/963932867131?text="), "a Telegram button and a WhatsApp button, with your contact details");
  ok(privacy.includes("https://t.me/IBRAHEEM932") && privacy.includes("https://wa.me/963932867131"), "they are the same contact details as the privacy page");
  ok($("ctaTg").target === "_blank" && /noopener/.test($("ctaTg").rel) && $("ctaWa").target === "_blank" && /noopener/.test($("ctaWa").rel), "they open in a new tab safely");

  /* ---- signed out ---- */
  ok(h.msg("ctaTg") === "مرحباً، أنا تاجر وبدي أسعار الجملة بمتجر ياردوفا.\nصرفي الشهري المتوقع بالدولار: " && h.msg("ctaWa") === h.msg("ctaTg"), "signed out: a ready message with a line for his expected monthly spending, the same on both buttons");
  ok(!/معرّف حسابي/.test(h.msg("ctaTg")) && !$("ctaHint").hidden && /سجّل دخول/.test($("ctaHint").textContent), "no account id, and a hint to sign in first");

  /* ---- signed in ---- */
  h.authCb(h.user()); await sleep(80);
  ok(h.msg("ctaTg") === "مرحباً، أنا تاجر وبدي أسعار الجملة بمتجر ياردوفا.\nمعرّف حسابي: uid-123\nالإيميل: ali@x.com\nصرفي الشهري المتوقع بالدولار: " && h.msg("ctaWa") === h.msg("ctaTg") && $("ctaHint").hidden, "signed in: the message carries his account id and email (so you know which account to move), and the hint disappears");
  h.authCb(null); await sleep(30); ok(!/معرّف حسابي/.test(h.msg("ctaTg")) && !$("ctaHint").hidden, "signing out removes them again");
  h.customer = { id: "uid-9", name: "Second", email: "s@x.com", vip: 1, spentUsd: 0, progressUsd: 0, sizeUsd: 200, remainingUsd: 200, nextVip: 2, createdAt: 1 }; h.authCb({ ...h.user(), uid: "uid-9" }); await sleep(80); ok(/معرّف حسابي: uid-9/.test(h.msg("ctaTg")) && !/uid-123/.test(h.msg("ctaTg")), "another person signing in gets his own id, never the previous one");
  { const e = open({ customer: { id: "u-1", name: "A", email: "a+b&c d@x.com", vip: 1, spentUsd: 0, progressUsd: 0, sizeUsd: 200, remainingUsd: 200, nextVip: 2, createdAt: 1 } }); await sleep(60); e.authCb(e.user()); await sleep(80);
    ok(e.$("ctaTg").href.includes("%2B") && e.$("ctaTg").href.includes("%26") && !e.$("ctaTg").href.includes("a+b&c") && /الإيميل: a\+b&c d@x\.com/.test(e.msg("ctaTg")) && e.msg("ctaWa").split("\n").length === 4, "special characters in an email are encoded in the link and come out unchanged in the message"); }
  { const e = open(); await sleep(60); e.meMode = "fail"; e.authCb(e.user()); await sleep(80); ok(!/معرّف حسابي/.test(e.msg("ctaTg")) && !e.$("ctaHint").hidden, "if the account could not be loaded there is no id (and the hint stays)"); }

  /* ---- shortcut from the side panel ---- */
  { const e = open(); await sleep(60); e.$("btnMenu").click(); ok(!e.$("btnMerchant"), "signed out, the side panel has no merchant shortcut");
    e.$("btnCloseDrawer").click(); e.authCb(e.user()); await sleep(80); e.$("btnMenu").click();
    ok(e.$("btnMerchant") && /هل أنت تاجر/.test(e.$("btnMerchant").textContent), "signed in, the panel has a '🏪 هل أنت تاجر؟' button");
    e.$("btnMerchant").click(); ok(e.$("drawer").hidden && e.scrolled.some(s => s.id === "merchantCta") && e.d.activeElement === e.$("ctaTg"), "it closes the panel, scrolls to the contact section and puts focus on the first button"); }
  ok(!/innerHTML|document\.write|eval\(/.test(html0), "still no raw HTML insertion");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
