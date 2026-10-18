// اختبار صفحة الخصوصية: فقرة حذف الحساب وطلبات المتجر بالعربي والتركي والإنجليزي، والرابط الداخلي #delete-account
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/privacy_page.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DOCS = path.join(__dirname, "../../docs");
const html = fs.readFileSync(path.join(DOCS, "privacy.html"), "utf8").replace(/<script src="i18n.js"><\/script>/, () => "<script>" + fs.readFileSync(path.join(DOCS, "i18n.js"), "utf8") + "</script>");
async function page(lang) {
  const dom = new JSDOM(html, { url: "https://example.test/privacy.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) { try { w.localStorage.setItem("lang", lang); } catch (e) {} } });
  await sleep(300); return dom.window.document;
}
(async () => {
  const ar = await page("ar");
  ok(!!ar.getElementById("delete-account") && /حذف حسابي/.test(ar.getElementById("delete-account").textContent), "Arabic: section 5 explains deleting the account from the app, and has the #delete-account anchor");
  ok(/بنحتفظ بسجلات السحب والشراء وطلبات المتجر/.test(ar.body.textContent) && /طلبات متجر الألعاب والخدمات/.test(ar.body.textContent), "Arabic: what is kept, and the store orders data, are described");
  ok(/قيد المراجعة/.test(ar.body.textContent), "Arabic: it says deletion waits for pending requests");
  ok(/بصمة مشفّرة من عنوان المحفظة/.test(ar.body.textContent), "Arabic: the wallet fingerprint (multiple accounts check) is disclosed");
  ok(/الدخول عبر تلغرام:/.test(ar.body.textContent) && /بصمة مشفّرة من رقم هاتفك/.test(ar.body.textContent) && /ربط تلغرام وبصمة رقم الهاتف/.test(ar.body.textContent), "Arabic: Telegram sign-in data (id, first name, hashed phone) and its deletion are described");
  for (const [lang, a, b, c] of [["tr", /Hesabımı sil/, /muhasebe ve dolandırıcılığı önleme/, /mağazası siparişleri/], ["en", /Delete my account/, /accounting and fraud prevention/, /store orders/]]) {
    const d = await page(lang);
    const sec = [...d.querySelectorAll("h2")].find(h => /5\./.test(h.textContent));
    const txt = d.body.textContent.replace(/\s+/g, " ");
    ok(/encrypted fingerprint|şifrelenmiş bir parmak izi/.test(txt), `${lang}: the wallet fingerprint disclosure is translated`);
    ok(a.test(txt) && b.test(txt) && c.test(txt), `${lang}: deletion path, retention and store-order texts are translated`);
    const newBits = [d.getElementById("delete-account"), ...[...d.querySelectorAll("#delete-account ~ p, #delete-account ~ ul li")]].filter(Boolean).map(e => e.textContent).join(" ");
    ok(newBits.length > 200 && !/[\u0600-\u06FF]/.test(newBits), `${lang}: the whole new rights section has no leftover Arabic`);
    const tg = [...d.querySelectorAll("p")].find(p => /Telegram/.test(p.textContent) && /fingerprint|iz/.test(p.textContent));
    ok(tg && !/[\u0600-\u06FF]/.test(tg.textContent) && /Telegram bağlantısı ve telefon numarası izi|The Telegram link and the phone-number fingerprint/.test(d.body.textContent), `${lang}: the Telegram sign-in paragraph and the deletion item are fully translated`);
    const orders = [...d.querySelectorAll("p")].find(p => /store orders|mağazası siparişleri/.test(p.textContent));
    ok(orders && !/[\u0600-\u06FF]/.test(orders.textContent), `${lang}: the store-orders paragraph is fully translated`);
  }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
