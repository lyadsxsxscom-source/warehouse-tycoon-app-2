// اختبار صفحة الشروط: بند الحسابات غير النشطة بالتلات لغات
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/terms_page.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DOCS = path.join(__dirname, "../../docs");
const html = fs.readFileSync(path.join(DOCS, "terms.html"), "utf8").replace(/<script src="i18n.js"><\/script>/, () => "<script>" + fs.readFileSync(path.join(DOCS, "i18n.js"), "utf8") + "</script>");
async function page(lang) { const dom = new JSDOM(html, { url: "https://example.test/terms.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) { try { w.localStorage.setItem("lang", lang); } catch (e) {} } }); await sleep(300); return dom.window.document; }
(async () => {
  for (const [lang, re] of [["ar", /الحسابات غير النشطة/], ["tr", /Etkin olmayan hesaplar/], ["en", /Inactive accounts/]]) {
    const d = await page(lang);
    const p = [...d.querySelectorAll("p")].find(x => re.test(x.textContent));
    ok(!!p, `${lang}: the inactive-accounts clause is in the terms`);
    if (lang !== "ar") ok(p && !/[\u0600-\u06FF]/.test(p.textContent), `${lang}: it is fully translated (no Arabic left)`);
    const h2 = [...d.querySelectorAll("h2")].map(h => h.textContent);
    ok(h2.length >= 9, `${lang}: the other sections are still there (${h2.length} headings)`);
  }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
