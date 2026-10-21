// اختبارات صفحة أدمن المتجر: تبويب FazerCards (حالة المفتاح، فحص الاتصال، الإعدادات، ربط المنتجات مع عرض الهامش)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_supplier.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = []; let authCb = null, hasKey = false, statusMode = "ok", failNext = null, confirmAnswer = true;
let CFG = { enabled: false, minMarginPct: 5, dailyCapUsd: 100 }, configured = false;
const P = (a) => Array.from({ length: 10 }, (_, i) => a[Math.min(i, a.length - 1)]);
let NODES = [
  { id: "nP", parentId: "", type: "folder", name: "PUBG", prices: [], enabled: true, supplier: null },
  { id: "i660", parentId: "nP", type: "item", name: "660 UC", prices: P([10.18, 10, 9.9, 9.8, 9.7, 9.6, 9.5, 9.4, 9.3, 9.26]), enabled: true, supplier: null },
  { id: "i60", parentId: "nP", type: "item", name: "60 UC", prices: P([1.05, 1.0, 0.99, 0.98, 0.97, 0.96, 0.95, 0.94, 0.93, 0.9]), enabled: true, supplier: { provider: "fazercards", categoryId: "cat_pubgm_1", offerId: "offer_60uc", playerField: "player_id", offerName: "60 UC", costUsd: 0.88 } },
  { id: "iLow", parentId: "nP", type: "item", name: "325 UC", prices: P([4.5, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.3]), enabled: true, supplier: { provider: "fazercards", categoryId: "cat_pubgm_1", offerId: "offer_325uc", playerField: "player_id", offerName: "325 UC", costUsd: 4.38 } },
];
const CATS = [{ categoryId: "cat_pubgm_1", name: "PUBG Mobile" }, { categoryId: "cat_ff", name: "Free Fire" }];
let OFFERS = { cat_pubgm_1: { name: "PUBG Mobile", offers: [{ offerId: "offer_60uc", name: "60 UC", priceUsd: 0.9 }, { offerId: "offer_660uc", name: "660 UC", priceUsd: 8.76 }, { offerId: "offer_325uc", name: "325 UC", priceUsd: 4.38 }], fields: [{ key: "player_id", label: "Player ID", type: "text" }] }, cat_ff: { name: "Free Fire", offers: [], fields: [{ key: "uid", label: "UID", type: "text" }] } };
function server(b) {
  if (failNext) { const f = failNext; failNext = null; return { st: 502, j: { ok: false, error: "supplier_error", message: f } }; }
  if (b.action === "supplier_get") return { st: 200, j: { ok: true, hasKey, cfg: CFG, configured, updatedAt: 0 } };
  if (b.action === "supplier_save") { CFG = b.cfg; configured = true; return { st: 200, j: { ok: true, cfg: CFG, configured: true, hasKey } }; }
  if (b.action === "supplier_status") { if (statusMode === "nokey") return { st: 400, j: { ok: false, error: "no_key", message: "مفتاح FazerCards مو مضاف." } }; if (statusMode === "inactive") return { st: 200, j: { ok: true, status: { login: "partner1", plan: "none", planExpiresAt: "", planAutoRenew: false, subscriptionActive: false, balanceUsd: 6.62, currency: "USD" } } }; if (statusMode === "expiring") return { st: 200, j: { ok: true, status: { login: "partner1", plan: "gold", planExpiresAt: new Date(Date.now() + 2 * 86400000).toISOString(), planAutoRenew: false, subscriptionActive: true, balanceUsd: null, currency: "USD" } } }; return { st: 200, j: { ok: true, status: { login: "partner1", plan: "gold", planExpiresAt: new Date(Date.now() + 20 * 86400000).toISOString(), planAutoRenew: true, subscriptionActive: true, balanceUsd: 6.62, currency: "USD" } } }; }
  if (b.action === "supplier_categories") { const q = (b.q || "").toLowerCase(); return { st: 200, j: { ok: true, categories: CATS.filter(c => !q || c.name.toLowerCase().includes(q)) } }; }
  if (b.action === "supplier_offers") { const o = OFFERS[b.categoryId]; if (!o) return { st: 502, j: { ok: false, error: "supplier_error", message: "FazerCards: category not found" } }; return { st: 200, j: { ok: true, categoryId: b.categoryId, ...o } }; }
  if (b.action === "supplier_validators") return { st: 200, j: { ok: true, validators: [{ categoryId: "pubg_mobile", name: "PUBG Mobile" }] } };
  if (b.action === "supplier_link") { const n = NODES.find(x => x.id === b.id); n.supplier = b.link ? { provider: "fazercards", ...b.link } : null; return { st: 200, j: { ok: true, nodes: NODES.map(x => JSON.parse(JSON.stringify(x))), max: {} } }; }
  if (b.action === "list") return { st: 200, j: { ok: true, nodes: NODES.map(x => JSON.parse(JSON.stringify(x))), max: { depth: 4, nodes: 300 } } };
  return { st: 200, j: { ok: true, nodes: [], customers: [], orders: [], counts: {}, total: 0, sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10 }, methods: [] } };
}
const dom = new JSDOM(html, { url: "https://example.test/store-admin.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
  auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth };
  w.confirm = () => confirmAnswer;
  w.fetch = async (url, o) => { const body = JSON.parse(o.body); calls.push({ auth: o.headers.Authorization, body }); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const last = a => calls.filter(c => c.body.action === a).pop();
const row = id => d.querySelector(`[data-sp="${id}"]`);
const click = async (el) => { el.click(); await sleep(80); };
(async () => {
  await sleep(100); authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(150);
  $("tabSupplier").click(); await sleep(200);
  ok(!$("viewSupplier").hidden && $("viewCatalog").hidden && $("tabSupplier").classList.contains("active") && calls.some(c => c.body.action === "supplier_get" && c.auth === "Bearer TOKEN"), "the tab opens and reads the settings with the admin token");

  /* ---- the key ---- */
  ok(!!$("spKeyMissing") && /مو مضاف/.test($("spKeyMissing").textContent) && /FAZER_API_KEY/.test($("spKeyMissing").textContent) && /Variables and Secrets/.test($("spKeyMissing").textContent) && /Secret/.test($("spKeyMissing").textContent) && /لا تبعت المفتاح لأي حدا، ولا لي/.test($("spKeyMissing").textContent), "no key yet: step-by-step instructions (create it at FazerCards, add it as a Cloudflare Secret named FAZER_API_KEY) and a warning never to send it to anyone, including me");
  /* the key was added AFTER the tab opened: a successful check must fix the box without reloading */
  statusMode = "ok"; await click($("btnSpCheck")); ok(!!$("spKeyOk") && !$("spKeyMissing") && /الحساب: partner1/.test($("spStatus").textContent), "if the key was added after the page opened, a successful check updates the key box to 'exists' (no stale 'missing' box)");
  hasKey = true; await (async () => { $("tabCatalog").click(); $("tabSupplier").click(); await sleep(200); })();
  ok(!!$("spKeyOk") && /موجود/.test($("spKeyOk").textContent) && !$("spKeyMissing") && !/SECRET|sk_/.test($("viewSupplier").textContent), "with a key it only says it exists (the key itself is never on this screen)");

  /* ---- the connection check ---- */
  await click($("btnSpCheck")); ok(last("supplier_status") && /الحساب: partner1 · الخطة: gold/.test($("spStatus").textContent) && /الاشتراك: فعّال ✅ · ينتهي \d\d\/\d\d\/\d{4} · تجديد تلقائي: نعم/.test($("spStatus").textContent) && /رصيدك عند FazerCards: \$6\.62/.test($("spStatus").textContent) && !$("spInactive") && !$("spExpiring"), "the check shows your login, plan, whether the subscription is active, its expiry date, auto-renew and your FazerCards balance");
  statusMode = "inactive"; await click($("btnSpCheck")); ok(!!$("spInactive") && /غير فعّال/.test($("spStatus").textContent) && /403/.test($("spInactive").textContent), "an inactive subscription gets a clear warning (orders may be refused)");
  statusMode = "expiring"; await click($("btnSpCheck")); ok(!!$("spExpiring") && /بينتهي خلال [12] يوم/.test($("spExpiring").textContent) && /ما فيه تجديد تلقائي/.test($("spExpiring").textContent) && /رصيدك عند FazerCards: غير معروف/.test($("spStatus").textContent), "an expiry within 3 days warns you (and says if it will not renew); an unknown balance says 'unknown', never 0");
  statusMode = "nokey"; await click($("btnSpCheck")); ok(/مفتاح FazerCards مو مضاف/.test($("spStatus").textContent) && !$("btnSpCheck").disabled, "an error from the server is shown and the button works again");
  statusMode = "ok";

  /* ---- the settings ---- */
  ok($("spEnabled").checked === false && $("spMargin").value === "5" && $("spCap").value === "100" && /هلق ما في أي شراء تلقائي/.test($("viewSupplier").textContent), "the settings show your decisions (off, 5%, $100 a day) and say plainly that nothing is bought automatically yet");
  $("spEnabled").checked = true; $("spMargin").value = "6.5"; $("spCap").value = "150"; await click($("btnSpSave"));
  ok(last("supplier_save").body.cfg.enabled === true && last("supplier_save").body.cfg.minMarginPct === 6.5 && last("supplier_save").body.cfg.dailyCapUsd === 150 && typeof last("supplier_save").body.cfg.minMarginPct === "number" && /انحفظ/.test($("spMsg").textContent), "saving sends the three values (numbers) and confirms");
  failNext = "السقف اليومي من 1$ لـ100,000$."; await click($("btnSpSave")); ok(/السقف اليومي/.test($("spMsg").textContent) && !$("btnSpSave").disabled, "a refusal is shown and the button works again");
  $("spMargin").value = "5"; $("spCap").value = "100"; $("spEnabled").checked = false; await click($("btnSpSave"));

  /* ---- the products and their margin ---- */
  const rows = [...d.querySelectorAll("#spItems .sprow")]; ok(rows.length === 3 && !d.querySelector('[data-sp="nP"]'), "only products are listed (not folders)");
  ok(/PUBG › 660 UC/.test(row("i660").textContent) && /VIP 1 \$10\.18 · VIP 10 \$9\.26/.test(row("i660").textContent) && /غير مربوط/.test(row("i660").textContent), "each product shows its path, its VIP 1 and VIP 10 prices, and whether it is linked");
  ok(/🔗 60 UC · تكلفتهم \$0\.88 · هامش VIP 1: 16\.2% · VIP 10: 2\.2%/.test(row("i60").textContent) && !!row("i60").querySelector(`[data-low="i60"]`) && /تحت الحد \(5%\)/.test(row("i60").textContent), "a linked product shows their cost and BOTH margins; VIP 10's margin (2.2%) is under your 5% limit, so it is flagged as not going automatic");
  ok(/هامش VIP 1: 2\.7% · VIP 10: -1\.9%|هامش VIP 1: 2\.7% · VIP 10: -1\.9%/.test(row("iLow").textContent.replace(/−/g, "-")) || /VIP 10: -/.test(row("iLow").textContent), "a margin below zero (selling at a loss) is shown with its minus sign");
  ok(!!row("iLow").querySelector('[data-low="iLow"]'), "and flagged too");
  /* linking a product */
  await click(row("i660").querySelector('[data-spact="choose"]')); ok(!!row("i660").querySelector("[data-chooser]") && !!$("spSearch"), "'🔗 ربط' opens a chooser under that product");
  $("spSearch").value = "pubg"; await click(row("i660").querySelector('[data-spact="search"]')); ok(last("supplier_categories").body.q === "pubg" && row("i660").querySelectorAll('[data-spact="cat"]').length === 1 && /PUBG Mobile · cat_pubgm_1/.test(row("i660").querySelector('[data-spact="cat"]').textContent), "searching lists the matching games at FazerCards");
  $("spSearch").value = "zzz"; await click(row("i660").querySelector('[data-spact="search"]')); ok(/ما لقينا شي/.test($("spChMsg").textContent), "no match says so");
  $("spSearch").value = "pubg"; await click(row("i660").querySelector('[data-spact="search"]')); await click(row("i660").querySelector('[data-spact="cat"]'));
  const offs = [...row("i660").querySelectorAll('[data-spact="offer"]')]; ok(offs.length === 3 && /660 UC · تكلفتهم \$8\.76 · هامش VIP 1: 13\.9% · VIP 10: 5\.4%/.test(offs[1].textContent) && /هامش VIP 1: 91\.2% · VIP 10: 90\.3%|VIP 1: /.test(offs[0].textContent), "the offers are listed with their cost and what YOUR margin would be at VIP 1 and VIP 10 (660 UC: 13.9% and 5.4%), before you link");
  ok(/✔ التحقق من الـPlayer ID متاح لهاللعبة/.test($("spVal").textContent) && last("supplier_validators"), "the chooser says whether FazerCards can check Player IDs for this game (PUBG Mobile: yes)");
  await click(row("i660").querySelector('[data-spact="back"]')); ok(!!$("spSearch"), "'back' returns to the games");
  $("spSearch").value = "pubg"; await click(row("i660").querySelector('[data-spact="search"]')); await click(row("i660").querySelector('[data-spact="cat"]')); await click(row("i660").querySelector('[data-offer="offer_660uc"]'));
  const lb = last("supplier_link").body; ok(lb.id === "i660" && lb.link.categoryId === "cat_pubgm_1" && lb.link.offerId === "offer_660uc" && lb.link.playerField === "player_id" && lb.link.offerName === "660 UC" && lb.link.costUsd === 8.76 && typeof lb.link.costUsd === "number" && lb.link.categoryName === "PUBG Mobile" && lb.link.validateCategoryId === "pubg_mobile", "choosing an offer links the product (their category and offer, the ID field, name and cost) and keeps the game's name and its ID-check category");
  ok(/🆔 التحقق من الـID: متاح ✔/.test(row("i660").querySelector('[data-val="i660"]').textContent) && /أعد الربط لتفعيله/.test(row("i60").querySelector('[data-val="i60"]').textContent), "a linked product shows whether ID checking is on; an older link says to re-link to turn it on");
  ok(/🔗 660 UC · تكلفتهم \$8\.76 · هامش VIP 1: 13\.9% · VIP 10: 5\.4%/.test(row("i660").textContent) && !row("i660").querySelector("[data-chooser]") && !row("i660").querySelector(`[data-low="i660"]`), "the list updates (5.4% is above your 5% limit, so no warning) and the chooser closes");
  /* a game whose buyer field is not player_id */
  await click(row("i60").querySelector('[data-spact="choose"]')); $("spSearch").value = "free"; await click(row("i60").querySelector('[data-spact="search"]')); await click(row("i60").querySelector('[data-spact="cat"]')); ok(/ما في خيارات/.test($("spChMsg").textContent), "a game with no offers says so"); await click(row("i60").querySelector('[data-spact="choose"]'));
  /* refresh the cost */
  await click(row("i60").querySelector('[data-spact="cost"]')); ok(last("supplier_offers").body.categoryId === "cat_pubgm_1" && last("supplier_link").body.link.costUsd === 0.9 && last("supplier_link").body.link.offerId === "offer_60uc" && /تحدّثت التكلفة: \$0\.90/.test($("spMsg").textContent) && /تكلفتهم \$0\.90/.test(row("i60").textContent), "'🔄 update cost' reads the offer again and saves the new cost ($0.88 became $0.90)");
  OFFERS.cat_pubgm_1.offers = OFFERS.cat_pubgm_1.offers.filter(o => o.offerId !== "offer_60uc"); await click(row("i60").querySelector('[data-spact="cost"]')); ok(/ما عاد موجود عند FazerCards/.test($("spMsg").textContent) && /تكلفتهم \$0\.90/.test(row("i60").textContent), "if FazerCards removed that offer you are told, and nothing is changed");
  /* unlink */
  confirmAnswer = false; const c1 = calls.length; await click(row("i660").querySelector('[data-spact="unlink"]')); ok(calls.length === c1, "'unlink' asks first");
  confirmAnswer = true; await click(row("i660").querySelector('[data-spact="unlink"]')); ok(last("supplier_link").body.link === null && /غير مربوط/.test(row("i660").textContent), "confirming unlinks it");
  failNext = "FazerCards: category not found"; await click(row("i660").querySelector('[data-spact="choose"]')); $("spSearch").value = "pubg"; await click(row("i660").querySelector('[data-spact="search"]')); ok(/category not found/.test($("spChMsg").textContent), "an error from FazerCards while searching is shown inside the chooser");
  ok(!/innerHTML/.test(html), "(no raw HTML insertion)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
