// اختبارات صفحة أدمن المتجر: تبويب الطلبات (طلبات من الرصيد + إيداعات) وإعدادات المحفظة وحقول تعليمات الدفع
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_orders.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = [], intervals = []; let authCb = null, failNext = null, confirmAnswer = true, confirmTexts = [], proofImage = "data:image/png;base64,iVBORw0KGgo=";
const NOW = Date.now();
const SHAM = { id: "sham", name: "شام كاش", currency: "ل.س", decimals: 0, account: "0932", instructions: "" };
const mk = (id, code, kind, status, o) => ({ id, code, kind, status, itemId: kind === "topup" ? "" : "i1", itemName: kind === "topup" ? "إيداع رصيد" : "60 UC", itemPath: kind === "topup" ? "إيداع رصيد" : "PUBG › فوري › 60 UC", playerId: kind === "topup" ? "" : "5123456789", vip: 1, priceUsd: kind === "topup" ? 100 : 0.92, method: kind === "topup" ? SHAM : { id: "", name: "", currency: "", decimals: 0, account: "", instructions: "" }, amount: kind === "topup" ? 14250 : 0, createdAt: NOW - 3600000, quoteEndsAt: NOW - 1800000, quoteExpired: false, proof: null, rejectReason: "", doneAt: 0, uid: "u-" + id, name: "Ali " + id, email: id + "@x.com", adminNote: "", events: [{ at: NOW - 3600000, action: "created", by: "customer", note: "" }], ...o });
let ORD = [
  mk("o1", "T-1005", "order", "processing", { createdAt: NOW - 1000 }),
  mk("o2", "D-1003", "topup", "payment_submitted", { createdAt: NOW - 2000, proof: { ref: "TX-998877", hasImage: true, submittedAt: NOW - 600000, late: false } }),
  mk("o3", "D-1002", "topup", "payment_submitted", { createdAt: NOW - 3000, name: "<img src=x onerror=alert(1)>", proof: { ref: "<b>0xhash</b>", hasImage: false, submittedAt: NOW - 100000, late: true }, method: { id: "usdt", name: "USDT", currency: "USDT", decimals: 2, account: "0xabc", instructions: "" }, amount: 101.5 }),
  mk("o4", "D-1001", "topup", "awaiting_payment", { createdAt: NOW - 4000 }),
  mk("o5", "T-1003", "order", "done", { createdAt: NOW - 5000, doneAt: NOW - 1000, adminNote: "sent" }),
  mk("o6", "T-1002", "order", "rejected", { createdAt: NOW - 6000, rejectReason: "wrong ID" }),
  mk("o7", "D-1000", "topup", "done", { createdAt: NOW - 7000, doneAt: NOW - 500 }),
];
const counts = () => { const c = {}; ORD.forEach(o => { c[o.status] = (c[o.status] || 0) + 1; }); return c; };
let METHODS = [{ id: "sham", name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0, enabled: true, account: "0932000000", instructions: "حوّل وانسخ الرقم" }];
let WCFG = { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10 }, wconfigured = false;
function server(b) {
  if (failNext) { const f = failNext; failNext = null; return { st: 400, j: { ok: false, error: "x", message: f } }; }
  if (b.action === "orders_badge") { const c = counts(); return { st: 200, j: { ok: true, counts: { payment_submitted: c.payment_submitted || 0, processing: c.processing || 0 }, waiting: (c.payment_submitted || 0) + (c.processing || 0) } }; }
  if (b.action === "orders_list") {
    const q = (b.q || "").toLowerCase(), st = b.status, kd = b.kind || "all"; const OPEN = ["payment_submitted", "awaiting_payment", "processing"];
    let rows = ORD.filter(o => (kd === "all" || o.kind === kd) && (st === "all" || (st === "open" ? OPEN.includes(o.status) : st === "waiting" ? ["payment_submitted", "processing"].includes(o.status) : o.status === st)));
    if (q) rows = rows.filter(o => (o.code + o.name + o.email + o.playerId + o.itemName).toLowerCase().includes(q));
    const c = counts(); return { st: 200, j: { ok: true, counts: c, waiting: (c.payment_submitted || 0) + (c.processing || 0), total: ORD.length, orders: rows.map(o => JSON.parse(JSON.stringify(o))) } };
  }
  if (b.action === "order_proof") return { st: 200, j: { ok: true, image: b.id === "o2" ? proofImage : "" } };
  if (b.action === "order_done") { const o = ORD.find(x => x.id === b.id); o.status = "done"; o.doneAt = Date.now(); o.adminNote = b.note || ""; return { st: 200, j: { ok: true } }; }
  if (b.action === "order_reject") { const o = ORD.find(x => x.id === b.id); o.status = "rejected"; o.rejectReason = b.reason; return { st: 200, j: { ok: true } }; }
  if (b.action === "order_refund") { const o = ORD.find(x => x.id === b.id); o.status = "refunded"; return { st: 200, j: { ok: true } }; }
  if (b.action === "payments_get") return { st: 200, j: { ok: true, methods: METHODS.map(m => ({ ...m })), updatedAt: 1 } };
  if (b.action === "payments_save") { METHODS = b.methods.map(m => ({ ...m, id: m.id || "mx" })); return { st: 200, j: { ok: true, methods: METHODS, updatedAt: 2 } }; }
  if (b.action === "wallet_get") return { st: 200, j: { ok: true, cfg: WCFG, configured: wconfigured, updatedAt: 0 } };
  if (b.action === "wallet_save") { WCFG = b.cfg; wconfigured = true; return { st: 200, j: { ok: true, cfg: WCFG, configured: true, updatedAt: 1 } }; }
  return { st: 200, j: { ok: true, nodes: [], sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], customers: [], total: 0, max: {} } };
}
const dom = new JSDOM(html, { url: "https://example.test/store-admin.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
  auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth };
  w.confirm = (t) => { confirmTexts.push(t); return confirmAnswer; };
  const realSet = w.setInterval.bind(w); w.setInterval = (fn, ms) => { intervals.push({ fn, ms }); return realSet(() => {}, 1e9); };
  w.fetch = async (url, o) => { const body = JSON.parse(o.body); calls.push({ auth: o.headers.Authorization, body }); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const card = id => d.querySelector(`[data-ord="${id}"]`), codes = () => [...d.querySelectorAll("#ordList .ord .code")].map(x => x.textContent);
const last = a => calls.filter(c => c.body.action === a).pop();
const submit = f => f.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
const setSel = async (id, v) => { $(id).value = v; $(id).dispatchEvent(new dom.window.Event("change")); await sleep(80); };
(async () => {
  await sleep(100); authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(150);
  ok(!$("ordBadge").hidden && $("ordBadge").textContent === "3" && calls.some(c => c.body.action === "orders_badge") && !calls.some(c => c.body.action === "orders_list"), "right after signing in the tab shows a red number: 3 things are waiting for you (2 payments to confirm + 1 order to deliver), from the light count action (the full list is not loaded yet)");
  ok(intervals.some(i => i.ms === 120000) && !intervals.some(i => i.ms === 60000), "the red number refreshes itself every two minutes"); const bc = calls.length; intervals.find(i => i.ms === 120000).fn(); await sleep(60); ok(calls.length > bc && last("orders_badge") && !calls.slice(bc).some(c => c.body.action === "orders_list"), "(and only by counting, not by loading the orders)");
  $("tabOrders").click(); await sleep(150);
  ok(!$("viewOrders").hidden && $("viewCatalog").hidden && $("tabOrders").classList.contains("active") && $("ordFilter").value === "waiting" && codes().join() === "T-1005,D-1003,D-1002", "the tab opens on 'waiting for you': paid orders to deliver and payments to confirm, newest first");
  const lab = [...$("ordFilter").options].map(o => o.textContent).join("|");
  ok(/بانتظارك \(دفع مرسل \+ قيد التنفيذ\) \(3\)/.test(lab) && /قيد التنفيذ \(مدفوعة من الرصيد\) \(1\)/.test(lab) && /إيداعات: دفع مرسل \(2\)/.test(lab) && /كل المفتوحة \(4\)/.test(lab) && /كل الطلبات \(7\)/.test(lab) && /منفّذة \(2\)/.test(lab) && /مرفوضة \(1\)/.test(lab), "the filter shows how many are in each state");
  await setSel("ordKind", "topup"); ok(last("orders_list").body.kind === "topup" && codes().join() === "D-1003,D-1002", "the kind filter shows only deposits"); await setSel("ordKind", "order"); ok(codes().join() === "T-1005", "or only purchases"); await setSel("ordKind", "all");

  /* ---- an order paid from the balance ---- */
  const c1 = card("o1").textContent;
  ok(/T-1005/.test(c1) && /قيد التنفيذ/.test(card("o1").querySelector(".pill").textContent) && /PUBG › فوري › 60 UC/.test(c1) && /Player ID: 5123456789/.test(c1) && /الزبون: Ali o1 · o1@x\.com · VIP 1/.test(c1) && /السعر: \$0\.92 · انخصم من رصيده/.test(c1) && !/الإيصال/.test(c1) && !/لسا ما أرسل دفع/.test(c1), "an order in progress: code, state, product path, Player ID, customer with VIP, and 'the price was taken from his balance' (no proof, nothing to wait for)");
  ok(!!card("o1").querySelector('[data-oact="done"]') && /تم التنفيذ/.test(card("o1").querySelector('[data-oact="done"]').textContent) && !!card("o1").querySelector('[data-oact="reject"]') && !card("o1").querySelector('[data-oact="refund"]') && !card("o1").querySelector('[data-oact="proof"]'), "it offers 'delivered' and 'reject' only");
  /* ---- a deposit ---- */
  const c2 = card("o2").textContent;
  ok(/📥 إيداع رصيد/.test(c2) && !/Player ID/.test(c2) && /الإيداع: \$100\.00 · المطلوب: 14,250 ل\.س عبر شام كاش/.test(c2) && /الإيصال: TX-998877 · فيه صورة/.test(c2) && /الزبون: Ali o2/.test(c2), "a deposit: marked 📥, no Player ID, the dollar amount and what he must transfer in his currency, and the proof reference");
  ok(/المطلوب: 101\.50 USDT عبر USDT/.test(card("o3").textContent) && /⚠️ متأخر/.test(card("o3").textContent) && !/⚠️ متأخر/.test(c2), "another method keeps its own decimals; a payment that arrived after the price window is flagged 'late'");
  ok(card("o3").querySelector("img") === null && card("o3").querySelector("b") === null && /الزبون: <img src=x onerror=alert\(1\)> ·/.test(card("o3").textContent) && /الإيصال: <b>0xhash<\/b>/.test(card("o3").textContent), "names and references are shown as plain text");
  ok(!!card("o2").querySelector('[data-oact="done"]') && /تأكيد الإيداع/.test(card("o2").querySelector('[data-oact="done"]').textContent), "a deposit's button says 'confirm the deposit'");
  card("o2").querySelector('[data-oact="proof"]').click(); await sleep(80);
  ok(card("o2").querySelector("img.proof") && card("o2").querySelector("img.proof").src === proofImage && last("order_proof").body.id === "o2" && last("order_proof").auth === "Bearer TOKEN", "'🧾 عرض الإيصال' loads the receipt picture (with the admin token)"); card("o2").querySelector('[data-oact="proof"]').click(); ok(!card("o2").querySelector("img.proof"), "pressing again hides it");
  proofImage = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="; card("o2").querySelector('[data-oact="proof"]').click(); await sleep(80); ok(!card("o2").querySelector("img.proof") && /ما في صورة/.test($("ordMsg").textContent), "a picture that is not PNG, JPEG or WebP is never shown"); proofImage = "data:image/png;base64,iVBORw0KGgo=";

  /* ---- confirming a deposit ---- */
  card("o2").querySelector('[data-oact="done"]').click(); let f = card("o2").querySelector("form"); f.querySelector('[data-f="note"]').value = "received by Sham Cash";
  confirmAnswer = false; const c0 = calls.length; submit(f); await sleep(40); ok(calls.length === c0 && /تأكيد إيداع D-1003؟ بيزيد \$100\.00 لرصيد الزبون/.test(confirmTexts.pop()), "confirming a deposit asks first and says it ADDS $100 to his balance");
  confirmAnswer = true; submit(card("o2").querySelector("form")); await sleep(150);
  ok(last("order_done").body.id === "o2" && last("order_done").body.note === "received by Sham Cash" && !card("o2") && $("ordBadge").textContent === "2", "it sends the note, the deposit leaves the 'waiting' list and the red number drops to 2");
  /* ---- delivering an order ---- */
  card("o1").querySelector('[data-oact="done"]').click(); submit(card("o1").querySelector("form")); await sleep(40);
  ok(/تأكيد تنفيذ T-1005؟ بيتحسب \$0\.92 بصرف الزبون \(VIP\)/.test(confirmTexts.pop()) && last("order_done").body.id === "o1" && !card("o1") && $("ordBadge").textContent === "1", "delivering an order says it counts as his SPENDING (for VIP), and the red number drops to 1");
  /* ---- reject ---- */
  await setSel("ordFilter", "open"); ok(codes().join() === "D-1002,D-1001", "(the open ones now: two deposits)");
  card("o3").querySelector('[data-oact="reject"]').click(); let rf = card("o3").querySelector("form"); const c1n = calls.length; submit(rf); await sleep(30); ok(/اكتب سبب الرفض/.test(rf.querySelector('[data-f="err"]').textContent) && calls.length === c1n, "rejecting without a reason is refused on the screen");
  rf.querySelector('[data-f="note"]').value = "no payment received"; submit(rf); await sleep(40); ok(/^رفض D-1002؟$/.test(confirmTexts.pop()) && last("order_reject").body.reason === "no payment received", "rejecting a deposit sends the reason (no money to return)");
  /* an order's rejection returns the money: use a fresh in-progress order */
  ORD.unshift(mk("o8", "T-1006", "order", "processing", { createdAt: NOW })); await setSel("ordFilter", "waiting"); card("o8").querySelector('[data-oact="reject"]').click(); rf = card("o8").querySelector("form"); rf.querySelector('[data-f="note"]').value = "wrong ID"; submit(rf); await sleep(40);
  ok(/رفض T-1006؟ بيرجع \$0\.92 لرصيد الزبون/.test(confirmTexts.pop()) && last("order_reject").body.id === "o8", "rejecting a paid ORDER says the money goes back to his balance");
  await setSel("ordFilter", "open"); failNext = "هالطلب مو مفتوح (الحالة: done)."; card("o4").querySelector('[data-oact="done"]').click(); submit(card("o4").querySelector("form")); await sleep(80); ok(/مو مفتوح/.test(card("o4").querySelector('form [data-f="err"]').textContent), "a refusal from the server is shown inside the form");
  card("o4").querySelector('[data-oact="done"]').click(); ok(!card("o4").querySelector("form"), "pressing the button again closes the form");

  /* ---- refund ---- */
  await setSel("ordFilter", "done");
  ok(!!card("o5").querySelector('[data-oact="refund"]') && /^↩️ استرجاع$/.test(card("o5").querySelector('[data-oact="refund"]').textContent) && /استرجاع الإيداع/.test(card("o7").querySelector('[data-oact="refund"]').textContent) && !card("o5").querySelector('[data-oact="done"]'), "a delivered order and a confirmed deposit each offer a refund (worded differently)");
  card("o5").querySelector('[data-oact="refund"]').click(); submit(card("o5").querySelector("form")); await sleep(40); ok(/استرجاع T-1003؟ بيرجع \$0\.92 لرصيد الزبون وبيتنقص من صرفه/.test(confirmTexts.pop()) && last("order_refund").body.id === "o5", "refunding an order says: money back to his balance and off his spending");
  card("o7").querySelector('[data-oact="refund"]').click(); submit(card("o7").querySelector("form")); await sleep(40); ok(/استرجاع إيداع D-1000؟ بيتنقص \$100\.00 من رصيد الزبون/.test(confirmTexts.pop()) && last("order_refund").body.id === "o7", "refunding a deposit says it TAKES $100 off his balance");

  /* ---- search, history, empty ---- */
  await setSel("ordFilter", "all"); $("ordSearch").value = "5123456789"; $("ordSearch").dispatchEvent(new dom.window.Event("input")); await sleep(450);
  ok(last("orders_list").body.q === "5123456789" && codes().every(c => c.startsWith("T-")) && codes().length >= 2, "searching waits a moment, then asks the server (orders with that Player ID)");
  $("ordSearch").value = "zzz"; $("ordSearch").dispatchEvent(new dom.window.Event("input")); await sleep(450); ok(!!$("ordEmpty") && /ما في طلبات/.test($("ordEmpty").textContent), "no match says so");
  $("ordSearch").value = ""; $("ordSearch").dispatchEvent(new dom.window.Event("input")); await sleep(450);
  card("o4").querySelector('[data-oact="events"]').click(); ok(/أُنشئ \(الزبون\)/.test(d.querySelector('[data-ev="o4"]').textContent), "'📜 السجل' lists what happened, in words"); card("o4").querySelector('[data-oact="events"]').click(); ok(d.querySelector('[data-ev="o4"]').textContent === "", "pressing again hides it");
  ok(/لسا ما أرسل دفع/.test(card("o4").textContent) && /سبب الرفض: wrong ID/.test(card("o6").textContent) && /ملاحظتك: sent/.test(card("o5").textContent), "unpaid deposits say so; the rejection reason and your note are shown");
  const rc = calls.length; $("btnOrdRefresh").click(); await sleep(80); ok(calls.length > rc, "the refresh button reloads the list");

  /* ---- wallet settings + payment methods ---- */
  $("tabPayments").click(); await sleep(150);
  ok($("wlPoints").value === "1000" && $("wlMin").value === "5" && $("wlMax").value === "1000" && $("wlProc").value === "10" && /هاي أرقام مثال/.test($("wlMsg").textContent) && /نقاط اللعبة/.test($("viewPayments").textContent) && /لإيداع الرصيد بس/.test($("viewPayments").textContent), "the wallet settings show the current values, say they are example numbers, and explain that points are a display unit and payment methods are for deposits");
  $("wlPoints").value = "500"; $("wlMin").value = "10"; $("btnSaveWallet").click(); await sleep(80);
  ok(last("wallet_save").body.cfg.pointsPerUsd === 500 && last("wallet_save").body.cfg.minTopupUsd === 10 && last("wallet_save").body.cfg.maxTopupUsd === 1000 && last("wallet_save").body.cfg.maxProcessing === 10 && typeof last("wallet_save").body.cfg.pointsPerUsd === "number" && /انحفظ/.test($("wlMsg").textContent), "saving sends the four numbers and confirms");
  failNext = "أقل إيداع من 1$ لـ10,000$."; $("btnSaveWallet").click(); await sleep(60); ok(/أقل إيداع/.test($("wlMsg").textContent) && !$("btnSaveWallet").disabled, "a server refusal is shown and the button works again");
  const row = d.querySelector("#pmList .pm"); ok(row.querySelector('[data-f="account"]').value === "0932000000" && row.querySelector('[data-f="instructions"]').value === "حوّل وانسخ الرقم" && row.querySelector('[data-f="account"]').getAttribute("dir") === "ltr" && /تعليمات للزبون/.test(row.textContent) && /بيظهر للزبون/.test(row.textContent), "each payment method has the account/address and the instructions fields");
  const acc = row.querySelector('[data-f="account"]'); acc.value = "  0999111222  "; acc.dispatchEvent(new dom.window.Event("input", { bubbles: true })); $("btnSaveMethods").click(); await sleep(100);
  ok(last("payments_save").body.methods[0].account === "0999111222" && last("payments_save").body.methods[0].instructions === "حوّل وانسخ الرقم", "saving sends both (trimmed)");
  $("btnAddMethod").click(); const nr = [...d.querySelectorAll("#pmList .pm")].pop(); ok(nr.querySelector('[data-f="account"]').value === "" && nr.querySelector('[data-f="instructions"]').value === "", "a new method starts with them empty");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
