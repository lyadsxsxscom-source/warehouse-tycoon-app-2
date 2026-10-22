// اختبارات صفحتي الخصوصية والشروط للمتجر + روابطهم (الفوتر، سطر الموافقة عند الدخول) + اللوغو جنب الصورة
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_legal.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const root = path.join(__dirname, "../..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const pages = { privacy: read("site/store/privacy/index.html"), terms: read("site/store/terms/index.html") };
const storeHtml = read("site/store/index.html"), gameTerms = read("docs/privacy.html");
const text = h => new JSDOM(h).window.document.body.textContent.replace(/\s+/g, " ");
const doc = h => new JSDOM(h).window.document;
(async () => {
  /* ---- both pages ---- */
  for (const [name, h] of Object.entries(pages)) {
    const d = doc(h), t = text(h);
    ok(d.documentElement.lang === "ar" && d.documentElement.dir === "rtl" && /noindex/.test(d.querySelector('meta[name="robots"]').content) && /Yardova Card/.test(d.title) && d.querySelectorAll("h1").length === 1 && !d.querySelector("script"), name + ": Arabic, right-to-left, hidden from search engines until launch, one title, and no scripts at all");
    ok(d.querySelector('a[href="/store/"]') && d.querySelector('a[href="https://t.me/IBRAHEEM932"]') && d.querySelector('a[href="https://wa.me/963932867131"]') && gameTerms.includes("https://t.me/IBRAHEEM932") && gameTerms.includes("https://wa.me/963932867131"), name + ": a way back to the store and your contact details (the same ones as the game's privacy page)");
    ok([...d.querySelectorAll('a[target="_blank"]')].every(a => /noopener/.test(a.rel)) && /آخر تحديث: 22 تشرين الأول 2026/.test(t), name + ": external links open safely and the page shows when it was last updated");
    ok(d.querySelectorAll("h2").length >= 8 && /\d\)/.test(d.querySelector("h2").textContent), name + ": organised in numbered sections");
  }
  const P = text(pages.privacy), T = text(pages.terms);
  /* ---- the privacy policy says what the system really does ---- */
  ok(/اسمك وإيميلك ومعرّف حسابك من Google/.test(P) && /رصيدك بالدولار وسجل حركاته/.test(P) && /معرّف اللاعب \(Player ID\)/.test(P) && /صورة الإيصال/.test(P), "privacy: lists what is collected (Google name, email and id; balance and its history; orders with the Player ID; deposits with the receipt picture)");
  ok(/الإدارة فقط/.test(P) && /Google Firebase/.test(P) && /Cloudflare/.test(P) && /FazerCards/.test(P) && /ما منشاركه اسمك ولا إيميلك/.test(P) && /ما منبيع بياناتك/.test(P), "privacy: says who sees it (only you, Google Firebase, Cloudflare, and FazerCards which gets only the Player ID and the product, never the name or email); no selling");
  ok(/ما في إعلانات ولا أدوات تتبّع/.test(P) && /بيتخزّن بمتصفحك فقط/.test(P), "privacy: no ads or tracking, and the display choice stays in the browser");
  ok(/بتنحذف تلقائياً بعد 90 يوم/.test(P) && /منحتفظ فيها للمحاسبة/.test(P) && /لحد ما تحذف حسابك/.test(P), "privacy: retention: receipt pictures deleted after 90 days (the clean-up job does exactly that), records kept for bookkeeping");
  ok(/ما بنخزّنه/.test(P) && /اسم اللاعب/.test(P), "privacy: the player's name is shown but not stored (true: the ID check answer is never saved)");
  ok(/بالتواصل معنا/.test(P) && !/زر "احذف حسابي"|زر احذف حسابي/.test(P), "privacy: deletion is by contacting you (the delete button does not exist yet, so the page does not promise it)");
  ok(/18 سنة وأكتر/.test(P) && /18 سنة أو أكتر/.test(T), "both pages say 18 or older");
  /* ---- the terms match your decisions ---- */
  ok(/ما في استرجاع/.test(T) && /ID غلط/.test(T), "terms: no refund for a wrong Player ID");
  ok(/صالح 30 دقيقة/.test(T) && /بيتأكّد يدوياً/.test(T), "terms: a deposit's exchange rate is valid for 30 minutes and deposits are confirmed by hand");
  ok(/بطلبك وبقرار الإدارة/.test(T) && /النقاط وحدة عرض فقط/.test(T) && /1000 نقطة = 1\$/.test(T), "terms: unused balance is refunded in cash by request and your decision; points are only a display unit (1000 = $1)");
  ok(/بينخصم من رصيدك فوراً/.test(T) && /بيرجع المبلغ لرصيدك/.test(T), "terms: the price leaves the balance at once; a failed or refused order returns it");
  ok(/على مسؤوليتك/.test(T) && /تعلّق حسابات/.test(T) && /غير تابع/.test(T), "terms: third-party top-up risk is the customer's, and the store is not affiliated with the games");
  ok(/تعليق حسابك أو رفض أو عكس أي طلب أو إيداع/.test(T) && /VIP/.test(T) && /فترة اختبار/.test(T), "terms: you may suspend, refuse or reverse; VIP and merchant levels are explained");
  ok(!/innerHTML|<script/.test(pages.privacy + pages.terms), "no scripts in either page");
  /* ---- links from the store ---- */
  const d = new JSDOM(storeHtml.replace(/<script src="[^"]+"><\/script>\s*/g, ""), { url: "https://yardova.ly-ad.de/store/", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) { w.scrollTo = () => {}; w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, items: [], methods: [] }) }); const auth = () => ({ onAuthStateChanged(cb) { cb(null); }, signInWithPopup() { return Promise.resolve(); }, signOut() { return Promise.resolve(); } }); auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth }; } });
  await sleep(100); const D = d.window.document;
  const fl = [...D.querySelectorAll("footer a")]; ok(fl.map(a => a.getAttribute("href")).join() === "/store/terms/,/store/privacy/" && /الشروط/.test(fl[0].textContent) && /الخصوصية/.test(fl[1].textContent), "the footer links to the terms and the privacy policy");
  D.getElementById("btnMenu").click(); const c = D.getElementById("consent");
  ok(c && /بالدخول بتوافق على الشروط وسياسة الخصوصية، وإنك 18 سنة أو أكتر/.test(c.textContent) && c.querySelector('a[href="/store/terms/"]').target === "_blank" && c.querySelector('a[href="/store/privacy/"]').target === "_blank" && /noopener/.test(c.querySelector("a").rel) && D.getElementById("btnGoogle"), "next to the Google button: 'by signing in you agree to the terms and the privacy policy, and that you are 18 or older' with both links (they open in a new tab)");
  ok(fs.existsSync(path.join(root, "site/store/privacy/index.html")) && fs.existsSync(path.join(root, "site/store/terms/index.html")), "both pages exist at /store/privacy/ and /store/terms/");
  /* ---- the logo beside the picture ---- */
  ok(/\.card \.pic\{[^}]*direction:ltr[^}]*\}/.test(storeHtml) && /\.card \.pic \.art\{[^}]*flex:1/.test(storeHtml) && /\.card \.pic \.brand\{[^}]*writing-mode:vertical-rl[^}]*transform:rotate\(180deg\)/.test(storeHtml) && !/\.card \.pic \.brand\{[^}]*position:absolute/.test(storeHtml), "the 'Yardova Card' logo is a vertical strip on the side of the picture, reading bottom to top, and never floats over it");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
