// اختبارات أدمن المتجر: تبويب FazerCards بالمجلدات (تصفّح، مسار، تنبيهات المجلد، بحث بالاسم)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_spfolders.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = []; let authCb = null, hasKey = false, statusMode = "ok", failNext = null, confirmAnswer = true;
let CFG = { enabled: false, minMarginPct: 5, dailyCapUsd: 100 }, configured = false;
const P = (a) => Array.from({ length: 10 }, (_, i) => a[Math.min(i, a.length - 1)]);
const LN = (id, parent, name, cost, p1) => ({ id, parentId: parent, type: "item", name, prices: P([p1, p1]), enabled: true, supplier: cost === null ? null : { provider: "fazercards", categoryId: "cat_pubgm_1", offerId: "o_" + id, playerField: "player_id", offerName: name, costUsd: cost } });
let NODES = [
  { id: "fG", parentId: "", type: "folder", name: "شحن العاب", prices: [], enabled: true, supplier: null },
  { id: "fA", parentId: "", type: "folder", name: "شحن تطبيقات", prices: [], enabled: true, supplier: null },
  { id: "fP", parentId: "fG", type: "folder", name: "ببجي", prices: [], enabled: true, supplier: null },
  { id: "fF", parentId: "fG", type: "folder", name: "فري فاير", prices: [], enabled: true, supplier: null },
  LN("p60", "fP", "60 UC", 0.88, 1.0), LN("p660", "fP", "660 UC", 8.76, 9.74), LN("f100", "fF", "100 ماسة", 0.91, 1.02), LN("fx", "fF", "عضوية", null, 2),
  { ...LN("b5", "fA", "بيغو 5", 0.09, 0.11), supplier: { provider: "fazercards", categoryId: "c", offerId: "b5", playerField: "player_id", offerName: "5", costUsd: 0.09, priceHold: { costUsd: 0.2, at: 1 } } },
  LN("top", "", "منتج بالجذر", 1, 1.2),
];
const CATS = [{ categoryId: "cat_pubgm_1", name: "PUBG Mobile" }, { categoryId: "cat_ff", name: "Free Fire" }, { categoryId: "cat_pubgm_auto", name: "PUBG Mobile (Auto)" }, { categoryId: "cat_ml", name: "Mobile Legends" }];
let OFFERS = { cat_pubgm_1: { name: "PUBG Mobile", offers: [{ offerId: "offer_60uc", name: "60 UC", priceUsd: 0.9 }, { offerId: "offer_660uc", name: "660 UC", priceUsd: 8.76 }, { offerId: "offer_325uc", name: "325 UC", priceUsd: 4.38 }], fields: [{ key: "player_id", label: "Player ID", type: "text" }] }, cat_ff: { name: "Free Fire", offers: [], fields: [{ key: "uid", label: "UID", type: "text" }] }, cat_pubgm_auto: { name: "PUBG Mobile (Auto)", offers: [{ offerId: "a_60", name: "60 UC auto", priceUsd: 0.875 }], fields: [{ key: "player_id", label: "Player ID", type: "text" }] }, cat_ml: { name: "Mobile Legends", offers: [{ offerId: "ml_86", name: "86 Diamonds", priceUsd: 1.2 }], fields: [{ key: "user_id", label: "User ID", type: "text" }, { key: "zone", label: "Zone", type: "text" }] } };
function server(b) {
  if (failNext) { const f = failNext; failNext = null; return { st: 502, j: { ok: false, error: "supplier_error", message: f } }; }
  if (b.action === "supplier_get") return { st: 200, j: { ok: true, hasKey, cfg: CFG, configured, updatedAt: 0 } };
  if (b.action === "supplier_save") { CFG = b.cfg; configured = true; return { st: 200, j: { ok: true, cfg: CFG, configured: true, hasKey } }; }
  if (b.action === "supplier_status") { if (statusMode === "nokey") return { st: 400, j: { ok: false, error: "no_key", message: "مفتاح FazerCards مو مضاف." } }; if (statusMode === "inactive") return { st: 200, j: { ok: true, status: { login: "partner1", plan: "none", planExpiresAt: "", planAutoRenew: false, subscriptionActive: false, balanceUsd: 6.62, currency: "USD" } } }; if (statusMode === "expiring") return { st: 200, j: { ok: true, status: { login: "partner1", plan: "gold", planExpiresAt: new Date(Date.now() + 2 * 86400000).toISOString(), planAutoRenew: false, subscriptionActive: true, balanceUsd: null, currency: "USD" } } }; return { st: 200, j: { ok: true, status: { login: "partner1", plan: "gold", planExpiresAt: new Date(Date.now() + 20 * 86400000).toISOString(), planAutoRenew: true, subscriptionActive: true, balanceUsd: 6.62, currency: "USD" } } }; }
  if (b.action === "supplier_categories") { const q = (b.q || "").toLowerCase(); return { st: 200, j: { ok: true, categories: CATS.filter(c => !q || c.name.toLowerCase().includes(q)) } }; }
  if (b.action === "supplier_offers") { const o = OFFERS[b.categoryId]; if (!o) return { st: 502, j: { ok: false, error: "supplier_error", message: "FazerCards: category not found" } }; return { st: 200, j: { ok: true, categoryId: b.categoryId, ...o } }; }
  if (b.action === "supplier_validators") return { st: 200, j: { ok: true, validators: [{ categoryId: "pubg_mobile", name: "PUBG Mobile" }, { categoryId: "free_fire", name: "Free Fire" }] } };
  if (b.action === "supplier_search") { if (b.q === "boom") return { st: 502, j: { ok: false, error: "supplier_error", message: "FazerCards: down" } }; const q = (b.q || "").toLowerCase(); const ALL = [{ section: "topups", id: "cat_pubgm_1", name: "PUBG Mobile" }, { section: "giftcards", id: "gc_xena", name: "Xena Coins" }, { section: "manual", id: "ms_xena", name: "Xena Live" }]; return { st: 200, j: { ok: true, results: ALL.filter(x => x.name.toLowerCase().includes(q)), errors: q === "partial" ? { giftcards: "FazerCards: الخدمة غير مفعّلة بخطتك." } : {} } }; }
  if (b.action === "supplier_section_offers") { if (b.id === "ms_empty") return { st: 200, j: { ok: true, offers: [] } }; return { st: 200, j: { ok: true, offers: [{ id: "m1", name: "Express", priceUsd: 25, note: "تسليم خلال 60 دقيقة" }, { id: "m2", name: "Slow", priceUsd: 20.5, note: "" }] } }; }
  if (b.action === "reprice_one") { const n = NODES.find(x => x.id === b.id); const o = (OFFERS[n.supplier.categoryId] || { offers: [] }).offers.find(x => x.offerId === n.supplier.offerId); if (o && o.priceUsd !== n.supplier.costUsd) { const f = o.priceUsd / n.supplier.costUsd; n.prices = n.prices.map(v => Math.ceil(v * f * 100 - 1e-6) / 100); n.supplier.costUsd = o.priceUsd; } return { st: 200, j: { ok: true, nodes: NODES.map(x => JSON.parse(JSON.stringify(x))), max: {} } }; }
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
  $("tabSupplier").click(); await sleep(250);
  const fold = id => d.querySelector('#spItems [data-spf="' + id + '"]'), names = () => [...d.querySelectorAll("#spItems .sprow .nm")].map(x => x.textContent);
  ok(!!fold("fG") && !!fold("fA") && !fold("fP") && JSON.stringify(names()) === JSON.stringify(["منتج بالجذر"]), "top level: its folders and the products sitting directly there");
  ok(/4 منتج/.test(fold("fG").textContent) && /⚠️ 1/.test(fold("fG").textContent) && /⚠️ 1/.test(fold("fA").textContent), "each folder counts all products inside (sub-folders too) and how many need a look (unlinked / price jump held)");
  await click(fold("fG")); ok(!!fold("fP") && !!fold("fF") && !names().length && $("spHere").textContent === "شحن العاب", "inside a folder: its sub-folders");
  await click(fold("fP")); ok(JSON.stringify(names()) === JSON.stringify(["60 UC", "660 UC"]) && /🏠 الكل.*شحن العاب.*ببجي/.test($("spNav").textContent), "deeper: the products, with the path on top");
  await click(d.querySelector('#spNav [data-spf="fG"]')); ok(!!fold("fP") && $("spHere").textContent === "شحن العاب", "tapping a step of the path goes back there");
  await click(d.querySelector('#spNav [data-spf=""]')); ok(!!fold("fG") && !$("spHere"), "'🏠 All' goes to the top");
  $("spFind").value = "660"; $("spFind").dispatchEvent(new dom.window.Event("input")); await sleep(50);
  ok(JSON.stringify(names()) === JSON.stringify(["شحن العاب › ببجي › 660 UC"]) && !fold("fG") && /نتايج البحث/.test($("spNav").textContent), "search by name lists matching products from any folder, with their full path");
  $("spFind").value = "zzz"; $("spFind").dispatchEvent(new dom.window.Event("input")); await sleep(50); ok(!!$("spNoFind"), "no match says so");
  $("spFind").value = ""; $("spFind").dispatchEvent(new dom.window.Event("input")); await sleep(50); ok(!!fold("fG"), "clearing the search goes back to the folders");
  await click(fold("fG")); await click(fold("fF")); await click(d.querySelector('[data-sp="fx"] [data-spact="choose"]')); ok(!!d.querySelector('[data-chooser="fx"]') && $("spHere").textContent === "فري فاير", "linking from inside a folder works and stays in the folder");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
