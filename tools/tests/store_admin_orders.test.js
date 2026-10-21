// اختبارات صفحة أدمن المتجر: تبويب الطلبات (قائمة، فلاتر، بحث، إيصال، تنفيذ، رفض، استرجاع) وحقول تعليمات الدفع
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_orders.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = [], intervals = []; let authCb = null, failNext = null, confirmAnswer = true, confirmTexts = [], proofImage = "data:image/png;base64,iVBORw0KGgo=";
const NOW = Date.now();
const mk = (id, code, status, o) => ({ id, code, status, itemId: "i1", itemName: "60 UC", itemPath: "PUBG › فوري › 60 UC", playerId: "5123456789", vip: 1, priceUsd: 0.92, method: { id: "sham", name: "شام كاش", currency: "ل.س", decimals: 0, account: "0932", instructions: "" }, amount: 131, createdAt: NOW - 3600000, quoteEndsAt: NOW - 1800000, quoteExpired: false, proof: null, rejectReason: "", doneAt: 0, uid: "u-" + id, name: "Ali " + id, email: id + "@x.com", adminNote: "", events: [{ at: NOW - 3600000, action: "created", by: "customer", note: "" }], ...o });
let ORD = [
  mk("o1", "T-1005", "payment_submitted", { proof: { ref: "TX-998877", hasImage: true, submittedAt: NOW - 600000, late: false }, events: [{ at: NOW - 3600000, action: "created", by: "customer", note: "" }, { at: NOW - 600000, action: "proof", by: "customer", note: "" }] }),
  mk("o2", "T-1004", "payment_submitted", { name: "<img src=x onerror=alert(1)>", playerId: "77<b>1</b>", method: { id: "usdt", name: "USDT", currency: "USDT", decimals: 2, account: "0xabc", instructions: "" }, amount: 0.93, proof: { ref: "<b>0xhash</b>", hasImage: false, submittedAt: NOW - 100000, late: true } }),
  mk("o3", "T-1003", "awaiting_payment", {}),
  mk("o4", "T-1002", "done", { doneAt: NOW - 1000, adminNote: "sent" }),
  mk("o5", "T-1001", "rejected", { rejectReason: "no payment received" }),
];
const counts = () => { const c = {}; ORD.forEach(o => { c[o.status] = (c[o.status] || 0) + 1; }); return c; };
let METHODS = [{ id: "sham", name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0, enabled: true, account: "0932000000", instructions: "حوّل وانسخ الرقم" }];
function server(b) {
  if (failNext) { const f = failNext; failNext = null; return { st: 400, j: { ok: false, error: "x", message: f } }; }
  if (b.action === "orders_list") { const q = (b.q || "").toLowerCase(); let rows = ORD.filter(o => b.status === "all" || (b.status === "open" ? ["payment_submitted", "awaiting_payment"].includes(o.status) : o.status === b.status)); if (q) rows = rows.filter(o => (o.code + o.name + o.email + o.playerId + o.itemName).toLowerCase().includes(q)); return { st: 200, j: { ok: true, counts: counts(), total: ORD.length, orders: rows.map(o => JSON.parse(JSON.stringify(o))) } }; }
  if (b.action === "order_proof") return { st: 200, j: { ok: true, image: b.id === "o1" ? proofImage : "" } };
  if (b.action === "order_done") { const o = ORD.find(x => x.id === b.id); o.status = "done"; o.doneAt = Date.now(); o.adminNote = b.note || ""; return { st: 200, j: { ok: true } }; }
  if (b.action === "order_reject") { const o = ORD.find(x => x.id === b.id); o.status = "rejected"; o.rejectReason = b.reason; return { st: 200, j: { ok: true } }; }
  if (b.action === "order_refund") { const o = ORD.find(x => x.id === b.id); o.status = "refunded"; return { st: 200, j: { ok: true } }; }
  if (b.action === "payments_get") return { st: 200, j: { ok: true, methods: METHODS.map(m => ({ ...m })), updatedAt: 1 } };
  if (b.action === "payments_save") { METHODS = b.methods.map(m => ({ ...m, id: m.id || "mx" })); return { st: 200, j: { ok: true, methods: METHODS, updatedAt: 2 } }; }
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
const setFilter = async v => { $("ordFilter").value = v; $("ordFilter").dispatchEvent(new dom.window.Event("change")); await sleep(80); };
(async () => {
  await sleep(100); authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(150);
  ok(!$("ordBadge").hidden && $("ordBadge").textContent === "2" && calls.some(c => c.body.action === "orders_list" && c.body.status === "payment_submitted"), "right after signing in the tab shows a red number: 2 payments are waiting for you");
  ok(intervals.some(i => i.ms === 60000), "the red number refreshes itself every minute"); const bc = calls.length; intervals.find(i => i.ms === 60000).fn(); await sleep(60); ok(calls.length > bc && calls[calls.length - 1].body.action === "orders_list" && calls[calls.length - 1].body.status === "payment_submitted", "(and that refresh asks only for the payments waiting for you)");
  $("tabOrders").click(); await sleep(150);
  ok(!$("viewOrders").hidden && $("viewCatalog").hidden && $("tabOrders").classList.contains("active") && $("ordFilter").value === "payment_submitted" && codes().join() === "T-1005,T-1004", "the tab opens on 'payment sent' (the ones waiting for you), newest first");
  ok([...$("ordFilter").options].map(o => o.textContent).join("|").includes("دفع مرسل (بانتظارك) (2)") && /كل المفتوحة \(3\)/.test($("ordFilter").textContent) && /كل الطلبات \(5\)/.test($("ordFilter").textContent) && /منفّذة \(1\)/.test($("ordFilter").textContent), "the filter shows how many orders are in each state");

  /* ---- an order card ---- */
  const c1 = card("o1").textContent;
  ok(/T-1005/.test(c1) && /دفع مرسل/.test(card("o1").querySelector(".pill").textContent) && /PUBG › فوري › 60 UC/.test(c1) && /Player ID: 5123456789/.test(c1) && /الزبون: Ali o1 · o1@x\.com · VIP 1/.test(c1) && /السعر: \$0\.92 · المطلوب: 131 ل\.س عبر شام كاش/.test(c1) && /الإيصال: TX-998877 · فيه صورة/.test(c1), "a card shows the code, state, product path, Player ID, customer with VIP, the dollar price, the amount to pay in his currency, and the proof reference");
  ok(/USDT/.test(card("o2").textContent) && /المطلوب: 0\.93 USDT عبر USDT/.test(card("o2").textContent), "another method keeps its own decimals (0.93 USDT)");
  ok(/⚠️ متأخر/.test(card("o2").textContent) && !/⚠️ متأخر/.test(card("o1").textContent), "a payment that arrived after the 30-minute price window is flagged 'late'");
  ok(card("o2").querySelector("img") === null && card("o2").querySelector("b") === null && /الزبون: <img src=x onerror=alert\(1\)> ·/.test(card("o2").textContent) && /77<b>1<\/b>/.test(card("o2").textContent) && /الإيصال: <b>0xhash<\/b>/.test(card("o2").textContent), "names, IDs and references are shown as plain text");

  /* ---- receipt picture ---- */
  card("o1").querySelector('[data-oact="proof"]').click(); await sleep(80);
  ok(card("o1").querySelector("img.proof") && card("o1").querySelector("img.proof").src === proofImage && last("order_proof").body.id === "o1" && last("order_proof").auth === "Bearer TOKEN", "'🧾 عرض الإيصال' loads the receipt picture for that order (with the admin token)");
  card("o1").querySelector('[data-oact="proof"]').click(); ok(!card("o1").querySelector("img.proof"), "pressing again hides it");
  ok(!card("o2").querySelector('[data-oact="proof"]'), "an order without a picture has no receipt button");
  proofImage = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="; card("o1").querySelector('[data-oact="proof"]').click(); await sleep(80); ok(!card("o1").querySelector("img.proof") && /ما في صورة/.test($("ordMsg").textContent), "a picture that is not PNG, JPEG or WebP is never shown"); proofImage = "data:image/png;base64,iVBORw0KGgo=";

  /* ---- done ---- */
  const done = card("o1").querySelector('[data-oact="done"]'); ok(!!done && !!card("o1").querySelector('[data-oact="reject"]') && !card("o1").querySelector('[data-oact="refund"]'), "an open order offers 'done' and 'reject' (not refund)");
  done.click(); const f = card("o1").querySelector("form"); f.querySelector('[data-f="note"]').value = "sent to the player";
  confirmAnswer = false; const c0 = calls.length; submit(f); await sleep(40); ok(calls.length === c0 && /تأكيد تنفيذ T-1005/.test(confirmTexts.pop()), "confirming asks first and says what will happen to his spending ($0.92)");
  confirmAnswer = true; submit(card("o1").querySelector("form")); await sleep(150);
  ok(last("order_done").body.id === "o1" && last("order_done").body.note === "sent to the player" && !card("o1") && codes().join() === "T-1004" && $("ordBadge").textContent === "1", "marking done sends the note, the order leaves the 'waiting' list and the red number drops to 1");
  await setFilter("done"); ok(codes().join() === "T-1005,T-1002" && /منفّذ/.test(card("o1").querySelector(".pill").textContent) && !!card("o1").querySelector('[data-oact="refund"]') && !card("o1").querySelector('[data-oact="done"]'), "it now shows under 'done' with a refund button only");

  /* ---- reject ---- */
  await setFilter("payment_submitted"); card("o2").querySelector('[data-oact="reject"]').click(); const rf = card("o2").querySelector("form"); const c1n = calls.length;
  submit(rf); await sleep(30); ok(/اكتب سبب الرفض/.test(rf.querySelector('[data-f="err"]').textContent) && calls.length === c1n, "rejecting without a reason is refused on the screen");
  rf.querySelector('[data-f="note"]').value = "no payment received"; submit(rf); await sleep(150);
  ok(last("order_reject").body.id === "o2" && last("order_reject").body.reason === "no payment received" && !card("o2") && $("ordBadge").hidden, "rejecting sends the reason and the red number disappears when nothing is waiting");
  await setFilter("open"); failNext = "هالطلب مو مفتوح (الحالة: done)."; card("o3").querySelector('[data-oact="done"]').click(); const ef = card("o3").querySelector("form"); submit(ef); await sleep(80); ok(/مو مفتوح/.test(card("o3").querySelector('form [data-f="err"]').textContent), "a refusal from the server is shown inside the form");
  card("o3").querySelector('[data-oact="done"]').click(); ok(!card("o3").querySelector("form"), "pressing the button again closes the form");

  /* ---- refund ---- */
  await setFilter("done"); card("o1").querySelector('[data-oact="refund"]').click(); submit(card("o1").querySelector("form")); await sleep(150);
  ok(/استرجاع T-1005/.test(confirmTexts.pop()) && last("order_refund").body.id === "o1" && await setFilter("refunded") === undefined && codes().join() === "T-1005", "a refund asks first, sends the request and the order moves to 'refunded'");

  /* ---- search, history, empty ---- */
  await setFilter("all"); $("ordSearch").value = "5123456789"; $("ordSearch").dispatchEvent(new dom.window.Event("input")); await sleep(450);
  ok(last("orders_list").body.q === "5123456789" && codes().length === 4 && !codes().includes("T-1004"), "searching waits a moment, then asks the server (the 4 orders with that Player ID)");
  $("ordSearch").value = "zzz"; $("ordSearch").dispatchEvent(new dom.window.Event("input")); await sleep(450); ok(!!$("ordEmpty") && /ما في طلبات/.test($("ordEmpty").textContent), "no match says so");
  $("ordSearch").value = ""; $("ordSearch").dispatchEvent(new dom.window.Event("input")); await sleep(450);
  card("o3").querySelector('[data-oact="events"]').click(); ok(/أُنشئ \(الزبون\)/.test(d.querySelector('[data-ev="o3"]').textContent), "'📜 السجل' lists what happened, in words"); card("o3").querySelector('[data-oact="events"]').click(); ok(d.querySelector('[data-ev="o3"]').textContent === "", "pressing again hides it");
  ok(/لسا ما أرسل دفع/.test(card("o3").textContent) && /سبب الرفض: no payment received/.test(card("o5").textContent) && /ملاحظتك: sent/.test(card("o4").textContent), "unpaid orders say so; the rejection reason and your note are shown");
  const rc = calls.length; $("btnOrdRefresh").click(); await sleep(80); ok(calls.length > rc && last("orders_list"), "the refresh button reloads the list");

  /* ---- payment methods: account and instructions ---- */
  $("tabPayments").click(); await sleep(120);
  const row = d.querySelector("#pmList .pm"); ok(row.querySelector('[data-f="account"]').value === "0932000000" && row.querySelector('[data-f="instructions"]').value === "حوّل وانسخ الرقم" && row.querySelector('[data-f="account"]').getAttribute("dir") === "ltr" && /تعليمات للزبون/.test(row.textContent) && /بيظهر للزبون/.test(row.textContent), "each payment method has the account/address and the instructions fields");
  const acc = row.querySelector('[data-f="account"]'); acc.value = "  0999111222  "; acc.dispatchEvent(new dom.window.Event("input", { bubbles: true })); $("btnSaveMethods").click(); await sleep(100);
  ok(last("payments_save").body.methods[0].account === "0999111222" && last("payments_save").body.methods[0].instructions === "حوّل وانسخ الرقم", "saving sends both (trimmed)");
  $("btnAddMethod").click(); const nr = [...d.querySelectorAll("#pmList .pm")].pop(); ok(nr.querySelector('[data-f="account"]').value === "" && nr.querySelector('[data-f="instructions"]').value === "", "a new method starts with them empty");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
