// اختبارات صفحة أدمن المتجر: أداة الأسعار (هامش VIP1 وVIP10 والتقريب، المعاينة بالأرقام الحالية والجديدة، التحديد، والتطبيق)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_prices.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = []; let authCb = null, confirms = [], confirmAnswer = true, failNext = null, minMargin = 5, applyResult = { applied: 1, skipped: [] };
const P10 = (a) => Array.from({ length: 10 }, (_, i) => a[Math.min(i, a.length - 1)]);
const NEW60 = [0.98, 0.97, 0.97, 0.96, 0.95, 0.95, 0.94, 0.94, 0.93, 0.93];
const ITEMS = [
  { id: "i60", name: "UC 60", path: "PUBG › تلقائي", status: "ok", costUsd: 0.875, oldCostUsd: 0.86, current: P10([0.99, 0.98, 0.98, 0.97, 0.96, 0.96, 0.95, 0.94, 0.92, 0.9]), proposed: NEW60 },
  { id: "iSame", name: "UC 300", path: "PUBG › تلقائي", status: "ok", costUsd: 4.2, oldCostUsd: 4.2, current: P10([4.6, 4.5, 4.5, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4]), proposed: P10([4.6, 4.5, 4.5, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4]) },
  { id: "iUp", name: "WOW 60", path: "PUBG", status: "ok", costUsd: 0.5, oldCostUsd: 0.5, current: P10([0.5]), proposed: P10([0.56, 0.55, 0.55, 0.54, 0.54, 0.53, 0.53, 0.53, 0.53, 0.53]) },
  { id: "iGone", name: "Gone", path: "PUBG", status: "missing_offer", costUsd: 0, oldCostUsd: 1, current: P10([2]), proposed: [] },
  { id: "iErr", name: "Err", path: "PUBG", status: "category_error", costUsd: 0, oldCostUsd: 1, current: P10([2]), proposed: [] },
  { id: "iBad", name: "Bad", path: "PUBG", status: "bad_cost", costUsd: 0, oldCostUsd: 1, current: P10([2]), proposed: [] },
];
function server(b) {
  if (failNext) { const f = failNext; failNext = null; return { st: 400, j: { ok: false, error: f.error || "x", message: f.message } }; }
  if (b.action === "prices_preview") return { st: 200, j: { ok: true, minMarginPct: minMargin, params: { m1: b.m1, m10: b.m10, step: b.step }, items: ITEMS } };
  if (b.action === "prices_apply") return { st: 200, j: { ok: true, ...applyResult } };
  if (b.action === "supplier_get") return { st: 200, j: { ok: true, hasKey: true, hasWebhookSecret: false, webhookUrl: "https://x/supplier/fazer/webhook", todayUsd: 0, todayCount: 0, cfg: { enabled: false, minMarginPct: minMargin, dailyCapUsd: 100 }, configured: true, updatedAt: 1 } };
  return { st: 200, j: { ok: true, nodes: [], methods: [], cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: 200 }, sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], customers: [], orders: [], counts: {}, total: 0 } };
}
const dom = new JSDOM(html, { url: "https://example.test/store-admin.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
  auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth }; w.confirm = (m) => { confirms.push(m); return confirmAnswer; };
  w.fetch = async (url, o) => { const body = JSON.parse(o.body); calls.push({ auth: o.headers.Authorization, body }); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const last = a => calls.filter(c => c.body.action === a).pop(), count = a => calls.filter(c => c.body.action === a).length;
const row = id => d.querySelector(`[data-prrow="${id}"]`), click = async (el) => { el.click(); await sleep(150); };
(async () => {
  await sleep(100); authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(150);
  $("tabSupplier").click(); await sleep(350);
  /* ---- the form ---- */
  ok(/حساب الأسعار من التكلفة/.test($("viewSupplier").textContent) && /الهامش = \(سعر البيع − التكلفة\) ÷ سعر البيع/.test($("viewSupplier").textContent), "the FazerCards tab has a 'calculate prices from cost' box that explains what a margin means");
  ok($("prM1").value === "10" && $("prM10").value === "5" && $("prStep").value === "0.01" && [...$("prStep").options].map(o => o.textContent).join("|") === "لأقرب سنت|لأقرب 5 سنت|لأقرب 10 سنت" && $("prBox").hidden, "defaults: VIP 1 margin 10%, VIP 10 margin 5%, round up to the cent; nothing shown before a preview");
  /* ---- the preview ---- */
  await click($("btnPrPreview")); const pv = last("prices_preview").body;
  ok(pv.m1 === 10 && pv.m10 === 5 && pv.step === 0.01 && typeof pv.m1 === "number" && typeof pv.step === "number" && !$("prBox").hidden, "the preview sends the three settings as numbers and opens the list");
  ok($("prSummary").textContent === "6 منتج مربوط: 2 بتتغيّر أسعارهم، 1 بدون تغيير، 3 فيهم مشكلة. (الحد الأدنى للهامش: 5%)", "the summary counts what will change, what stays and what has a problem, and shows the minimum margin: " + $("prSummary").textContent);
  const r60 = row("i60"), txt = r60.textContent;
  ok(/UC 60/.test(txt) && /PUBG › تلقائي/.test(txt) && /التكلفة \$0\.875 \(كانت \$0\.86\)/.test(txt), "each product shows its name, folder, the current cost and what the cost used to be");
  ok(/حالياً: VIP 1 \$0\.99 \(11\.6%\) ← VIP 10 \$0\.90 \(2\.8%\) ⚠️ تحت الحد الأدنى/.test(txt) && r60.querySelector(".sm.bad"), "today's prices with their margins; VIP 10 at 2.8% is under the minimum, so it is flagged in red");
  ok(/الجديد: VIP 1 \$0\.98 \(10\.7%\) ← VIP 10 \$0\.93 \(5\.9%\) · ↓ أرخص/.test(txt) && r60.querySelector(".down"), "the new prices with their margins (10.7% and 5.9%) and a 'cheaper' mark");
  ok(/· ↑ أغلى/.test(row("iUp").textContent) && row("iUp").querySelector(".up") && /· بدون تغيير/.test(row("iSame").textContent), "a product that gets dearer is marked '↑ dearer'; one that would not change says so");
  const all = r60.querySelector("[data-prall]"); ok(all.hidden && all.children.length === 10, "the ten levels are hidden at first"); await click(r60.querySelector("[data-prtog]")); ok(!all.hidden && /VIP 1: \$0\.98 \(حالي \$0\.99\)/.test(all.children[0].textContent) && /VIP 10: \$0\.93 \(حالي \$0\.90\)/.test(all.children[9].textContent), "'all levels' shows every level with its current price next to the new one"); await click(r60.querySelector("[data-prtog]")); ok(all.hidden, "(and hides again)");
  for (const [id, re] of [["iGone", /الخيار ما عاد موجود عند FazerCards: أعد ربط المنتج/], ["iErr", /تعذّر الوصول لقسمه عند FazerCards/], ["iBad", /تكلفته عندهم صفر أو غير معروفة/]]) { const rw = row(id); ok(re.test(rw.querySelector("[data-prbad]").textContent) && rw.querySelector("[data-prsel]").disabled && !rw.querySelector("[data-prnew]"), id + ": the problem is explained, it cannot be selected, and no prices are shown"); }
  /* ---- selection ---- */
  const sel = (id) => row(id).querySelector("[data-prsel]");
  ok(sel("i60").checked && sel("iUp").checked && !sel("iSame").checked && $("btnPrApply").textContent === "✅ طبّق على المحدّد (2)", "by default it selects only the products that would change (2)");
  sel("iUp").checked = false; sel("iUp").dispatchEvent(new dom.window.Event("change", { bubbles: true })); await sleep(50); ok($("btnPrApply").textContent === "✅ طبّق على المحدّد (1)" && !$("btnPrApply").disabled, "unticking one updates the count");
  await click($("btnPrAll")); ok($("btnPrApply").textContent === "✅ طبّق على المحدّد (3)" && sel("i60").checked && sel("iSame").checked && !sel("iGone").checked, "'select all' picks the 3 that can be applied, never the problem ones");
  await click($("btnPrNone")); ok($("btnPrApply").textContent === "✅ طبّق على المحدّد (0)" && $("btnPrApply").disabled, "'select none' empties it and disables the button");
  sel("i60").checked = true; sel("i60").dispatchEvent(new dom.window.Event("change", { bubbles: true })); await sleep(50);
  /* ---- applying ---- */
  confirmAnswer = false; const n0 = count("prices_apply"); await click($("btnPrApply")); ok(count("prices_apply") === n0 && /تغيير أسعار 1 منتج \(كل مستويات VIP\)؟ بيتطبّق فوراً على المتجر\./.test(confirms[confirms.length - 1]) && /هامش VIP 1: 10% · هامش VIP 10: 5% · التقريب لأقرب 1 سنت/.test(confirms[confirms.length - 1]), "applying asks first (how many, and the margins and rounding used); 'no' changes nothing");
  $("prM1").value = "20"; confirmAnswer = true; const p0 = count("prices_preview"), l0 = count("list"); await click($("btnPrApply")); await sleep(300); const ap = last("prices_apply").body;
  ok(JSON.stringify(ap.ids) === '["i60"]' && ap.m1 === 10 && ap.m10 === 5 && ap.step === 0.01, "'yes' sends the selected ids and the SAME settings the preview used (editing a box after the preview does not change them)");
  ok(/انطبّقت أسعار 1 منتج ✓/.test($("prApplyMsg").textContent) && !/ما انطبّق/.test($("prApplyMsg").textContent), "it confirms how many were applied");
  ok(count("list") === l0 + 1 && count("prices_preview") === p0 + 1, "then the catalog is reloaded and the preview refreshed by itself");
  applyResult = { applied: 1, skipped: [{ id: "iGone", reason: "missing_offer" }, { id: "iErr", reason: "category_error" }] }; await click($("btnPrApply")); await sleep(300); ok(/انطبّقت أسعار 1 منتج ✓ · ما انطبّق 2 \(مشكلة بهالمنتجات\)/.test($("prApplyMsg").textContent), "when some were skipped on the server it says how many");
  /* ---- errors and other settings ---- */
  $("prM1").value = "12"; $("prM10").value = "3"; failNext = { error: "margin_below_min", message: "هامش VIP 10 (3%) أقل من حدّك الأدنى (5%) بإعدادات التنفيذ التلقائي. ارفعه أو عدّل الحد." }; await click($("btnPrPreview")); ok(/هامش VIP 10 \(3%\) أقل من حدّك الأدنى \(5%\)/.test($("prMsg").textContent) && !$("btnPrPreview").disabled, "a refused setting (margin under your minimum) is shown and the button works again");
  $("prM10").value = "6"; $("prStep").value = "0.05"; await click($("btnPrPreview")); ok(last("prices_preview").body.m1 === 12 && last("prices_preview").body.m10 === 6 && last("prices_preview").body.step === 0.05 && $("prMsg").textContent === "", "other settings are sent as typed (12%, 6%, 5 cents)");
  confirms.length = 0; await click($("btnPrApply")); ok(/لأقرب 5 سنت/.test(confirms[confirms.length - 1]), "(and the confirmation says 5 cents)");
  failNext = { error: "x", message: "تعذّر الاتصال" }; await click($("btnPrApply")); ok(/تعذّر الاتصال/.test($("prApplyMsg").textContent) && !$("btnPrApply").disabled, "an apply error is shown and the button works again");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
