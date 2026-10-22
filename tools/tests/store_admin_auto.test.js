// اختبارات صفحة أدمن المتجر: التنفيذ التلقائي (بطاقة الطلب: حالة الأتمتة والتكلفة والربح، زر نفّذ الآن وتحقق، تأكيد التفعيل، ودليل الـwebhook)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_auto.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2"; const NOW = Date.now();
const calls = []; let authCb = null, confirmAnswer = true, confirms = [], clip = [], failNext = null, outcome = { outcome: "sent", reason: "" };
let CFG = { enabled: false, minMarginPct: 5, dailyCapUsd: 100 };
const base = (id, code, o) => ({ id, kind: "order", code, status: "processing", itemName: "60 UC", itemPath: "PUBG › 60 UC", name: "Ali", email: "ali@x.com", uid: "u1", vip: 1, priceUsd: 0.96, playerId: "5123456789", createdAt: NOW - 600000, events: [], supplierOrderId: "", costUsd: 0, auto: null, ...o });
let ORDERS = [
  base("a1", "T-1001", {}),
  base("a2", "T-1002", { supplierOrderId: "ord-9002", auto: { state: "sent", reason: "", supplierMsg: "", supplierStatus: "processing", costUsd: 0.875, at: NOW - 60000, tries: 1 } }),
  base("a3", "T-1003", { status: "done", doneAt: NOW, supplierOrderId: "ord-9003", costUsd: 0.875, auto: { state: "done", reason: "", supplierMsg: "", supplierStatus: "completed", costUsd: 0.875, at: NOW - 600000, tries: 1 } }),
  base("a4", "T-1004", { status: "rejected", rejectReason: "x", auto: { state: "refunded", reason: "", supplierMsg: "Invalid player id", supplierStatus: "", costUsd: 0.875, at: NOW - 600000, tries: 1 } }),
  base("a5", "T-1005", { auto: { state: "manual", reason: "الهامش 3.1% أقل من حدّك (5%).", supplierMsg: "", supplierStatus: "", costUsd: 0, at: NOW - 60000, tries: 1 } }),
  base("a6", "T-1006", { auto: { state: "retry", reason: "تعذّر الاتصال بـFazerCards (500).", supplierMsg: "", supplierStatus: "", costUsd: 0.875, at: NOW - 60000, tries: 2 } }),
  base("a7", "T-1007", { status: "done", doneAt: NOW, costUsd: 0, auto: null }),
  base("a8", "T-1008", { status: "done", doneAt: NOW, costUsd: 0.5, auto: null }),
  { id: "d1", kind: "topup", code: "D-1001", status: "payment_submitted", itemName: "إيداع رصيد", itemPath: "إيداع رصيد", name: "Ali", email: "ali@x.com", uid: "u1", vip: 1, priceUsd: 10, playerId: "", method: { id: "sham", name: "شام كاش", currency: "ل.س", decimals: 0, account: "0932", instructions: "" }, amount: 1425, createdAt: NOW - 600000, quoteEndsAt: NOW + 600000, events: [], proof: { ref: "X", hasImage: false, submittedAt: NOW } },
];
function server(b) {
  if (failNext) { const f = failNext; failNext = null; return { st: 400, j: { ok: false, error: "x", message: f } }; }
  if (b.action === "orders_list") return { st: 200, j: { ok: true, orders: ORDERS.map(o => JSON.parse(JSON.stringify(o))), counts: { processing: 4, payment_submitted: 1, awaiting_payment: 0, done: 3 }, total: ORDERS.length } };
  if (b.action === "order_auto_run" || b.action === "order_auto_sync") { const o = ORDERS.find(x => x.id === b.id); if (outcome.outcome === "sent") { o.supplierOrderId = "ord-9100"; o.auto = { state: "sent", reason: "", supplierMsg: "", supplierStatus: "processing", costUsd: 0.875, at: NOW, tries: 1 }; } return { st: 200, j: { ok: true, outcome: outcome.outcome, reason: outcome.reason, order: o } }; }
  if (b.action === "supplier_get") return { st: 200, j: { ok: true, hasKey: true, hasWebhookSecret: outcome.hook === true, webhookUrl: "https://postback.example/supplier/fazer/webhook", todayUsd: 12.5, todayCount: 14, cfg: CFG, configured: true, updatedAt: 1 } };
  if (b.action === "supplier_save") { CFG = b.cfg; return { st: 200, j: { ok: true, cfg: CFG, configured: true, hasKey: true } }; }
  return { st: 200, j: { ok: true, nodes: [], methods: [], cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10 }, sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], customers: [], orders: [], counts: {}, total: 0 } };
}
const dom = new JSDOM(html, { url: "https://example.test/store-admin.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
  auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth };
  w.confirm = (m) => { confirms.push(m); return confirmAnswer; };
  Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t) => { clip.push(t); } }, configurable: true });
  w.fetch = async (url, o) => { const body = JSON.parse(o.body); calls.push({ auth: o.headers.Authorization, body }); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const last = a => calls.filter(c => c.body.action === a).pop();
const card = id => d.querySelector(`[data-ord="${id}"]`), btn = (id, act) => card(id).querySelector(`[data-oact="${act}"]`), line = id => { const n = card(id).querySelector(`[data-auto="${id}"]`); return n ? n.textContent : null; };
const click = async (el) => { el.click(); await sleep(120); };
(async () => {
  await sleep(100); authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(150);
  $("tabOrders").click(); await sleep(250); $("ordFilter").value = "all"; $("ordFilter").dispatchEvent(new dom.window.Event("change")); await sleep(250);
  /* ---- what each order shows ---- */
  ok(line("a1") === null, "an ordinary order (never touched by the automation) shows no automation line");
  ok(line("a2") === "🤖 أُرسل لـFazerCards ord-9002 · التكلفة $0.875 · الربح $0.085 (8.9%) · بانتظار تأكيدهم", "sent: 'sent to FazerCards (their order number), the cost, the profit and its percentage, waiting for their confirmation': " + line("a2"));
  ok(line("a3") === "🤖 نُفّذ تلقائياً عبر FazerCards ord-9003 · التكلفة $0.875 · الربح $0.085 (8.9%)", "done automatically: cost and profit shown");
  ok(line("a4") === "↩️ استُرجع تلقائياً للزبون · رد FazerCards: Invalid player id", "refunded automatically: and what FazerCards said");
  ok(line("a5") === "✋ يحتاج تنفيذك: الهامش 3.1% أقل من حدّك (5%)." && card("a5").querySelector('[data-auto="a5"]').classList.contains("late"), "held for you: the reason, highlighted");
  ok(line("a6") === "⏳ إعادة محاولة (2): تعذّر الاتصال بـFazerCards (500).", "retrying: how many tries and why");
  ok(line("a7") === null && line("a8") === "التكلفة $0.50 · الربح $0.46", "an order delivered by hand shows cost and profit only if a cost was recorded");
  /* ---- buttons ---- */
  ok(btn("a1", "autorun").textContent === "🤖 نفّذ تلقائياً الآن" && !btn("a1", "autosync") && btn("a1", "done") && btn("a1", "reject"), "an order not yet sent: '🤖 run automatically now' next to the usual buttons");
  ok(btn("a5", "autorun") && btn("a6", "autorun"), "held and retrying orders can be run again by hand");
  ok(btn("a2", "autosync").textContent === "🔄 تحقق من FazerCards" && !btn("a2", "autorun"), "a sent order: '🔄 check FazerCards' instead (never a second send)");
  ok(!btn("a3", "autorun") && !btn("a3", "autosync") && !btn("a4", "autorun") && !card("d1").querySelector('[data-oact="autorun"]'), "finished orders and deposits have no automation buttons");
  /* run now */
  confirmAnswer = false; const n0 = calls.length; await click(btn("a1", "autorun")); ok(calls.length === n0 && /تنفيذ T-1001 تلقائياً هلق عند FazerCards؟ \(بيصرف من رصيدك عندهم، ضمن حماياتك\)/.test(confirms[confirms.length - 1]), "'run now' asks first and says it spends from your balance there; no means nothing happens");
  confirmAnswer = true; await click(btn("a1", "autorun")); ok(last("order_auto_run").body.id === "a1" && /T-1001: انبعت لـFazerCards ✓ \(بانتظار تأكيدهم\)/.test($("ordMsg").textContent) && !!btn("a1", "autosync") && !btn("a1", "autorun") && /أُرسل لـFazerCards ord-9100/.test(line("a1")), "confirming sends it; the message says it went, the list refreshes and the card now shows the sent state with the check button");
  outcome = { outcome: "manual", reason: "رصيدك عند FazerCards (0.5$) ما بيكفي (التكلفة 0.875$). اشحنه." }; await click(btn("a5", "autorun")); ok(/T-1005: رصيدك عند FazerCards \(0\.5\$\) ما بيكفي/.test($("ordMsg").textContent), "when a safety check stops it, the exact reason is shown");
  for (const [o, re] of [[{ outcome: "not_linked" }, /هالمنتج مو مربوط مع FazerCards/], [{ outcome: "busy" }, /عم يتنفّذ هلق/], [{ outcome: "refunded" }, /رفضه المورّد وانرجع المبلغ للزبون/], [{ outcome: "done" }, /تم التنفيذ ✓/], [{ outcome: "processing" }, /لسا قيد التنفيذ عندهم/], [{ outcome: "closed" }, /الطلب منتهي/]]) { outcome = { reason: "", ...o }; await click(btn("a6", "autorun")); ok(re.test($("ordMsg").textContent), "outcome '" + o.outcome + "' is explained in plain words"); }
  outcome = { outcome: "processing", reason: "" }; await click(btn("a2", "autosync")); ok(last("order_auto_sync").body.id === "a2" && /لسا قيد التنفيذ عندهم/.test($("ordMsg").textContent), "'check FazerCards' asks about that order and shows the answer (no confirmation needed: it only reads)");
  failNext = "تعذّر الاتصال"; await click(btn("a2", "autosync")); ok(/تعذّر الاتصال/.test($("ordMsg").textContent), "an error is shown");
  /* ---- the settings ---- */
  $("tabSupplier").click(); await sleep(300);
  ok(/اليوم انصرف تلقائياً: \$12\.50 من سقف \$100\.00 \(14 طلب\)/.test($("spToday").textContent), "the settings show today's automatic spending against the cap");
  ok($("spHookUrl").textContent === "https://postback.example/supplier/fazer/webhook" && /مو مضاف/.test($("spHookState").textContent) && /FAZER_WEBHOOK_SECRET/.test($("spHook").textContent) && /Send test event/.test($("spHook").textContent) && /لا تبعت السر لأي حدا، ولا لي/.test($("spHook").textContent), "the webhook guide: the exact address to give FazerCards, whether the secret is set, the name to use at Cloudflare, the test step, and the warning never to send the secret");
  await click($("btnCopyHook")); ok(clip.join() === "https://postback.example/supplier/fazer/webhook" && /اننسخ العنوان/.test($("spMsg").textContent), "the address can be copied");
  outcome = { outcome: "sent", hook: true }; $("tabCatalog").click(); $("tabSupplier").click(); await sleep(300); ok(/موجود ✅/.test($("spHookState").textContent), "once the secret exists it says so");
  confirms.length = 0; confirmAnswer = false; $("spEnabled").checked = true; $("spMargin").value = "5"; $("spCap").value = "100"; await click($("btnSpSave"));
  ok(/كل طلب شراء لمنتج مربوط بيتنفّذ لحاله وبيصرف من رصيدك عند FazerCards، ضمن حماياتك \(هامش 5%، سقف 100\$ باليوم\)/.test(confirms[confirms.length - 1]) && !calls.some(c => c.body.action === "supplier_save") && $("spEnabled").checked === false, "turning it ON asks first, with your own limits in the question; saying no leaves it OFF and saves nothing");
  confirmAnswer = true; $("spEnabled").checked = true; await click($("btnSpSave")); ok(last("supplier_save").body.cfg.enabled === true && /التنفيذ التلقائي شغّال/.test($("spMsg").textContent), "confirming saves it and says it is on");
  confirms.length = 0; $("spMargin").value = "6"; await click($("btnSpSave")); ok(confirms.length === 0 && last("supplier_save").body.cfg.minMarginPct === 6, "changing a limit while it is already on does not ask again");
  $("spEnabled").checked = false; await click($("btnSpSave")); ok(last("supplier_save").body.cfg.enabled === false && /مطفّى/.test($("spMsg").textContent) && confirms.length === 0, "turning it off needs no question");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
