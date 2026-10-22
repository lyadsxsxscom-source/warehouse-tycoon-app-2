// اختبارات صفحة أدمن المتجر: طلبات سحب الرصيد وحذف الحساب (بطاقة الطلب، نسخ الحساب، تنفيذ/رفض، إكمال حذف ناقص، شارة "قيد الحذف" عند الزبون)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_refunds.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2"; const NOW = Date.now();
const calls = []; let authCb = null, confirmAnswer = true, confirms = [], failNext = null, clip = [], clipFail = false;
let ORDERS = [
  { id: "r1", kind: "refund", code: "R-1001", status: "processing", itemName: "طلب سحب الرصيد وحذف الحساب", itemPath: "طلب سحب الرصيد وحذف الحساب", name: "Omar Ali", email: "omar@x.com", uid: "u2", vip: 3, priceUsd: 24.08, playerId: "", payout: { method: "شام كاش", account: "0932 111 222" }, finalizePending: false, createdAt: NOW - 3600000, events: [{ at: NOW - 3600000, action: "created", by: "customer", note: "" }] },
  { id: "r2", kind: "refund", code: "R-1002", status: "done", itemName: "طلب سحب الرصيد وحذف الحساب", itemPath: "طلب سحب الرصيد وحذف الحساب", name: "Sam", email: "sam@x.com", uid: "u3", vip: 1, priceUsd: 8, playerId: "", payout: { method: "USDT", account: "0xabcdef" }, finalizePending: true, createdAt: NOW - 7200000, doneAt: NOW - 3600000, events: [] },
  { id: "r3", kind: "refund", code: "R-1003", status: "done", itemName: "طلب سحب الرصيد وحذف الحساب", itemPath: "طلب سحب الرصيد وحذف الحساب", name: "حساب محذوف", email: "", uid: "deleted-abc123abc123", vip: 1, priceUsd: 5, playerId: "", payout: { method: "", account: "" }, finalizePending: false, createdAt: NOW - 9000000, doneAt: NOW - 8000000, events: [] },
  { id: "o1", kind: "order", code: "T-1001", status: "processing", itemName: "60 UC", itemPath: "PUBG › 60 UC", name: "Ali", email: "ali@x.com", uid: "u1", vip: 1, priceUsd: 0.92, playerId: "5123456789", createdAt: NOW - 600000, events: [] },
];
let CUST = [{ id: "u2", name: "Omar Ali", email: "omar@x.com", vip: 3, autoVip: 3, balanceUsd: 0, spentUsd: 80, sizeUsd: 300, progressUsd: 10, remainingUsd: 290, nextVip: 4, merchant: null, lastSeenAt: NOW, closing: { code: "R-1001", amountUsd: 24.08, requestedAt: NOW - 3600000 } }, { id: "u9", name: "Nora", email: "nora@x.com", vip: 1, autoVip: 1, balanceUsd: 5, spentUsd: 0, sizeUsd: 200, progressUsd: 0, remainingUsd: 200, nextVip: 2, merchant: null, lastSeenAt: NOW }];
function server(b) {
  if (failNext) { const f = failNext; failNext = null; return { st: 400, j: { ok: false, error: "x", message: f } }; }
  if (b.action === "orders_list") { const list = ORDERS.filter(o => (!b.kind || b.kind === "all" || o.kind === b.kind) && (!b.status || b.status === "all" || (b.status === "waiting" ? ["payment_submitted", "processing"].includes(o.status) : o.status === b.status))); return { st: 200, j: { ok: true, orders: list.map(o => JSON.parse(JSON.stringify(o))), counts: { processing: ORDERS.filter(o => o.status === "processing").length, payment_submitted: 0, awaiting_payment: 0, done: 2 }, total: ORDERS.length } }; }
  if (b.action === "order_done" || b.action === "order_reject") { const o = ORDERS.find(x => x.id === b.id); o.status = b.action === "order_done" ? "done" : "rejected"; if (b.action === "order_reject") o.rejectReason = b.reason; if (b.id === "r1" && b.action === "order_done") { o.finalizePending = true; return { st: 200, j: { ok: true, warning: "انبعت الرصيد لكن تعذّر إكمال حذف الحساب. اضغط 🧹 إكمال الحذف.", order: o } }; } return { st: 200, j: { ok: true, order: o } }; }
  if (b.action === "order_finish_deletion") { const o = ORDERS.find(x => x.id === b.id); o.finalizePending = false; o.name = "حساب محذوف"; o.email = ""; o.payout = { method: "", account: "" }; return { st: 200, j: { ok: true, order: o } }; }
  if (b.action === "customers_list") return { st: 200, j: { ok: true, customers: CUST, total: CUST.length, sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000] } };
  return { st: 200, j: { ok: true, nodes: [], methods: [], cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10 }, sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], customers: [], orders: [], counts: {}, total: 0 } };
}
const dom = new JSDOM(html, { url: "https://example.test/store-admin.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
  auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth };
  w.confirm = (m) => { confirms.push(m); return confirmAnswer; };
  Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t) => { if (clipFail) throw new Error("no"); clip.push(t); } }, configurable: true });
  w.fetch = async (url, o) => { const body = JSON.parse(o.body); calls.push({ auth: o.headers.Authorization, body }); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const last = a => calls.filter(c => c.body.action === a).pop();
const card = id => d.querySelector(`[data-ord="${id}"]`), btn = (id, act) => card(id).querySelector(`[data-oact="${act}"]`);
const click = async (el) => { el.click(); await sleep(90); };
(async () => {
  await sleep(100); authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(150);
  $("tabOrders").click(); await sleep(200);
  /* ---- the filter ---- */
  ok([...$("ordKind").options].map(o => o.value + ":" + o.textContent).join("|") === "all:الكل|order:طلبات شراء|topup:إيداعات|refund:سحب أرصدة", "the kind filter has 'balance withdrawals': " + [...$("ordKind").options].map(o => o.textContent).join(", "));
  $("ordFilter").value = "all"; $("ordKind").value = "refund"; $("ordKind").dispatchEvent(new dom.window.Event("change")); await sleep(200);
  ok(last("orders_list").body.kind === "refund" && d.querySelectorAll("#ordList .ord").length === 3 && !card("o1"), "choosing it asks for refund requests only");
  /* ---- the card ---- */
  const c1 = card("r1");
  ok(/R-1001/.test(c1.textContent) && /💸 طلب سحب الرصيد وحذف الحساب/.test(c1.textContent) && c1.querySelector(".pill").textContent === "بانتظار إرسال الرصيد" && /المبلغ المطلوب إرساله: \$24\.08 \(محجوز من رصيده\)/.test(c1.textContent) && /الزبون: Omar Ali · omar@x\.com · VIP 3/.test(c1.textContent) && !/Player ID/.test(c1.textContent), "a request shows its title, 'waiting for you to send', the amount held, the customer (and no Player ID line)");
  ok(/الاستلام: شام كاش · 0932 111 222/.test(c1.querySelector("[data-payout]").textContent) && c1.querySelector("[data-payout] bdi").textContent === "0932 111 222", "it shows where to send the money (the account number in its own isolated element so it never scrambles)");
  ok(btn("r1", "done").textContent === "✅ تم إرسال الرصيد وحذف الحساب" && btn("r1", "reject").textContent === "❌ رفض (بيرجع الرصيد)" && btn("r1", "copy").textContent === "📋 نسخ الحساب" && !btn("r1", "refund") && !btn("r1", "finish") && btn("r1", "events"), "buttons: copy the account, 'I sent it and delete the account', 'reject (the balance goes back)'; no 'refund'");
  /* ---- copy ---- */
  await click(btn("r1", "copy")); ok(clip.join() === "0932 111 222" && /اننسخ الحساب/.test($("ordMsg").textContent), "copying puts the account number on the clipboard (so you can paste it into Sham Cash)");
  clipFail = true; await click(btn("r1", "copy")); ok(/تعذّر النسخ/.test($("ordMsg").textContent) && /0932 111 222/.test($("ordMsg").textContent), "if copying is blocked, the number is shown so you can copy it by hand"); clipFail = false;
  /* ---- done ---- */
  await click(btn("r1", "done")); const f = card("r1").querySelector("form"); ok(!!f, "'done' opens a small form (note is optional)");
  confirmAnswer = false; f.querySelector('[data-f="note"]').value = "sent 24.08 via Sham Cash"; f.dispatchEvent(new dom.window.Event("submit", { cancelable: true })); await sleep(80);
  ok(/تأكد إنك أرسلت \$24\.08 للزبون على: شام كاش · 0932 111 222/.test(confirms[confirms.length - 1]) && /بينحذف حسابه نهائياً/.test(confirms[confirms.length - 1]) && /الاسم والإيميل والإيصالات/.test(confirms[confirms.length - 1]) && !calls.some(c => c.body.action === "order_done"), "before anything happens it asks: 'make sure you sent $24.08 to Sham Cash 0932 111 222; the account will be deleted for good'; saying no does nothing");
  confirmAnswer = true; f.dispatchEvent(new dom.window.Event("submit", { cancelable: true })); await sleep(250);
  ok(last("order_done").body.id === "r1" && last("order_done").body.note === "sent 24.08 via Sham Cash" && last("orders_list"), "confirming sends 'done' with your note and refreshes the list");
  ok(/تعذّر إكمال حذف الحساب/.test($("ordMsg").textContent) && $("ordMsg").style.color !== "", "if the server says the deletion did not finish, you see that warning");
  ok(!!card("r1").querySelector('[data-unfinished="r1"]') && btn("r1", "finish") && /إكمال حذف الحساب/.test(btn("r1", "finish").textContent) && !btn("r1", "done"), "and the request now shows 'sent, but deleting the account did not finish' with a '🧹 finish' button instead of 'done'");
  /* ---- finish an unfinished deletion ---- */
  confirmAnswer = false; const nF = calls.length; await click(btn("r2", "finish")); ok(calls.length === nF && /إكمال حذف حساب R-1002/.test(confirms[confirms.length - 1]), "'finish' asks first");
  confirmAnswer = true; await click(btn("r2", "finish")); await sleep(150); ok(last("order_finish_deletion").body.id === "r2" && /اكتمل حذف الحساب/.test($("ordMsg").textContent) && !card("r2").querySelector("[data-unfinished]") && /حساب محذوف/.test(card("r2").textContent) && !btn("r2", "finish"), "confirming finishes it: the card turns into an anonymous record and the button goes");
  const nE = calls.length; await click(btn("r3", "events")); ok(calls.length === nE, "(the history opens without calling the server)");
  ok(!btn("r3", "done") && !btn("r3", "reject") && !btn("r3", "refund") && !btn("r3", "finish") && /حساب محذوف/.test(card("r3").textContent) && !card("r3").querySelector("[data-payout]"), "a finished, anonymous request has no action buttons and no payout details");
  /* ---- reject ---- */
  ORDERS.push({ id: "r4", kind: "refund", code: "R-1004", status: "processing", itemName: "طلب سحب الرصيد وحذف الحساب", itemPath: "طلب سحب الرصيد وحذف الحساب", name: "Lina", email: "lina@x.com", uid: "u7", vip: 1, priceUsd: 12, playerId: "", payout: { method: "USDT BEP20", account: "0xfeedbeef" }, finalizePending: false, createdAt: NOW, events: [] });
  await click($("btnOrdRefresh")); await click(btn("r4", "reject")); const f4 = card("r4").querySelector("form"); ok(/سبب الرفض/.test(f4.querySelector('[data-f="note"]').placeholder), "'reject' asks for a reason (it reaches the customer)");
  f4.dispatchEvent(new dom.window.Event("submit", { cancelable: true })); await sleep(80); ok(/اكتب سبب الرفض/.test(f4.querySelector('[data-f="err"]').textContent) && !calls.some(c => c.body.action === "order_reject"), "no reason: refused on the screen");
  confirmAnswer = false; f4.querySelector('[data-f="note"]').value = "account number is wrong"; f4.dispatchEvent(new dom.window.Event("submit", { cancelable: true })); await sleep(80);
  ok(/رفض R-1004؟ بيرجع \$12\.00 لرصيد الزبون وبينفتح حسابه/.test(confirms[confirms.length - 1]) && !calls.some(c => c.body.action === "order_reject"), "it asks: the $12.00 goes back to his balance and his account reopens");
  confirmAnswer = true; f4.dispatchEvent(new dom.window.Event("submit", { cancelable: true })); await sleep(250);
  ok(last("order_reject").body.id === "r4" && last("order_reject").body.reason === "account number is wrong" && card("r4").textContent.includes("سبب الرفض: account number is wrong") && !btn("r4", "done"), "rejecting sends the reason; the card shows it and loses its buttons");
  /* ---- a normal order is unchanged ---- */
  $("ordKind").value = "all"; $("ordKind").dispatchEvent(new dom.window.Event("change")); await sleep(200);
  ok(/Player ID: 5123456789/.test(card("o1").textContent) && btn("o1", "done").textContent === "✅ تم التنفيذ" && btn("o1", "reject").textContent === "❌ رفض" && !btn("o1", "copy") && card("o1").querySelector(".pill").textContent === "قيد التنفيذ", "an ordinary purchase looks and works exactly as before (Player ID, 'done', 'reject', no copy button, 'in progress')");
  /* ---- customers ---- */
  $("tabCustomers").click(); await sleep(250); const cl = d.querySelector('[data-closing="u2"]');
  ok(cl && /⏳ قيد الحذف: طلب سحب R-1001 بمبلغ \$24\.08/.test(cl.textContent) && /راجعه بتبويب الطلبات/.test(cl.textContent) && !d.querySelector('[data-closing="u9"]'), "the customers tab marks a closing account with its request and amount (and only that one)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
