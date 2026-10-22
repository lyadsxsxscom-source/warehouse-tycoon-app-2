// اختبارات صفحة أدمن المتجر: تأكيد إيداع USDT تلقائياً (خيار لكل طريقة دفع، سقف التأكيد، سطر نتيجة التحقق على بطاقة الإيداع، وزر "تحقق من البلوكتشين")
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_chain.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2"; const NOW = Date.now();
const calls = []; let authCb = null, outcome = { outcome: "done", reason: "" }, failNext = null;
let METHODS = [{ id: "usdtb", name: "USDT BEP20", currency: "USDT", rate: 1, decimals: 2, feePct: 0, enabled: true, instructions: "", account: "0x" + "ab".repeat(20), autoVerify: "bep20" }, { id: "sham", name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0, enabled: true, instructions: "", account: "0932", autoVerify: "" }];
let WALLET = { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: 200 };
const TX = "0x" + "9f".repeat(32);
const top = (id, code, o) => ({ id, kind: "topup", code, status: "payment_submitted", itemName: "إيداع رصيد", itemPath: "إيداع رصيد", name: "Ali", email: "ali@x.com", uid: "u1", vip: 1, priceUsd: 10, playerId: "", method: { id: "usdtb", name: "USDT BEP20", currency: "USDT", decimals: 4, account: "0x" + "ab".repeat(20), instructions: "", autoVerify: "bep20" }, amount: 10.0137, createdAt: NOW - 600000, quoteEndsAt: NOW + 600000, events: [], proof: { ref: TX, hasImage: false, submittedAt: NOW - 60000 }, chainInfo: null, ...o });
let ORDERS = [
  top("c1", "D-1001", { status: "done", chainInfo: { state: "ok", reason: "", txid: TX, network: "bep20", amount: 10.0137, confirmations: 11, tries: 1, at: NOW } }),
  top("c2", "D-1002", { chainInfo: { state: "pending", reason: "التأكيدات 4 من 10.", txid: TX, network: "bep20", amount: 0, confirmations: 4, tries: 1, at: NOW } }),
  top("c3", "D-1003", { chainInfo: { state: "retry", reason: "تعذّر الاتصال بالشبكة", txid: TX, network: "bep20", amount: 0, confirmations: 0, tries: 2, at: NOW } }),
  top("c4", "D-1004", { chainInfo: { state: "manual", reason: "المبلغ المحوّل 9.5 يختلف عن المطلوب 10.0137 (لازم بالضبط).", txid: TX, network: "bep20", amount: 9.5, confirmations: 11, tries: 1, at: NOW } }),
  top("c5", "D-1005", { method: { id: "sham", name: "شام كاش", currency: "ل.س", decimals: 0, account: "0932", instructions: "", autoVerify: "" }, amount: 1425, proof: { ref: "T123", hasImage: false, submittedAt: NOW } }),
  top("c6", "D-1006", { proof: { ref: "", hasImage: true, submittedAt: NOW } }),
];
function server(b) {
  if (failNext) { const f = failNext; failNext = null; return { st: 400, j: { ok: false, error: "x", message: f } }; }
  if (b.action === "orders_list") return { st: 200, j: { ok: true, orders: ORDERS.map(o => JSON.parse(JSON.stringify(o))), counts: { payment_submitted: 5, done: 1 }, total: ORDERS.length } };
  if (b.action === "order_chain_check") { const o = ORDERS.find(x => x.id === b.id); if (outcome.outcome === "done") { o.status = "done"; o.chainInfo = { state: "ok", reason: "", txid: TX, network: "bep20", amount: 10.0137, confirmations: 11, tries: 1, at: NOW }; } return { st: 200, j: { ok: true, outcome: outcome.outcome, reason: outcome.reason, order: o } }; }
  if (b.action === "payments_get") return { st: 200, j: { ok: true, methods: METHODS, updatedAt: 1 } };
  if (b.action === "payments_save") { METHODS = b.methods; return { st: 200, j: { ok: true, methods: METHODS, updatedAt: 2 } }; }
  if (b.action === "wallet_get") return { st: 200, j: { ok: true, cfg: WALLET, configured: true, updatedAt: 1 } };
  if (b.action === "wallet_save") { WALLET = b.cfg; return { st: 200, j: { ok: true, cfg: WALLET, configured: true, updatedAt: 2 } }; }
  return { st: 200, j: { ok: true, nodes: [], methods: [], cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10 }, sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], customers: [], orders: [], counts: {}, total: 0 } };
}
const dom = new JSDOM(html, { url: "https://example.test/store-admin.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
  auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth }; w.confirm = () => true;
  w.fetch = async (url, o) => { const body = JSON.parse(o.body); calls.push({ auth: o.headers.Authorization, body }); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const last = a => calls.filter(c => c.body.action === a).pop();
const card = id => d.querySelector(`[data-ord="${id}"]`), btn = (id, act) => card(id).querySelector(`[data-oact="${act}"]`), line = id => { const n = card(id).querySelector(`[data-chain="${id}"]`); return n ? n.textContent : null; };
const click = async (el) => { el.click(); await sleep(120); };
(async () => {
  await sleep(100); authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(150);
  /* ---- payment methods ---- */
  $("tabPayments").click(); await sleep(300); const rows = [...d.querySelectorAll("[data-pmrow]")], sel = (i) => rows[i].querySelector('select[data-f="autoVerify"]');
  ok(rows.length === 2 && [...sel(0).options].map(o => o.value + ":" + o.textContent).join("|") === ":بدون (تأكيد يدوي)|bep20:تلقائي من البلوكتشين: USDT BEP20|trc20:تلقائي من البلوكتشين: USDT TRC20" && sel(0).value === "bep20" && sel(1).value === "", "each payment method has a 'confirmation' choice: manual, BEP20 or TRC20 (the saved choice is selected)");
  ok(!!d.querySelector('[data-avnote="0"]') && /تأكيد تلقائي: الزبون بيحوّل مبلغ مميّز/.test(d.querySelector('[data-avnote="0"]').textContent) && /العملة لازم USDT وسعر الصرف 1/.test(d.querySelector('[data-avnote="0"]').textContent) && !d.querySelector('[data-avnote="1"]'), "an automatic method shows a short explanation (unique amount, USDT, rate 1, your own address); a normal one does not");
  sel(1).value = "trc20"; sel(1).dispatchEvent(new dom.window.Event("change", { bubbles: true })); await sleep(50); $("btnSaveMethods").click(); await sleep(200);
  ok(last("payments_save").body.methods[1].autoVerify === "trc20" && last("payments_save").body.methods[0].autoVerify === "bep20" && typeof last("payments_save").body.methods[0].decimals === "number", "choosing TRC20 and saving sends the mode as text (and decimals stay numbers)");
  failNext = '"USDT TRC20": عنوان TRC20 غير صحيح (فشل فحص الخانات الأخيرة). تأكد من نسخه كامل.'; $("btnSaveMethods").click(); await sleep(200); ok(/فشل فحص الخانات الأخيرة/.test($("pmMsg").textContent) && !$("btnSaveMethods").disabled, "a refusal from the server (a mistyped address) is shown and the button works again");
  /* ---- the cap ---- */
  ok($("wlChainCap").value === "200" && /سقف التأكيد التلقائي لإيداع USDT/.test(d.querySelector('label[for="wlChainCap"]').textContent), "the cap for automatic confirmation is on the wallet settings (200)");
  $("wlChainCap").value = "150"; $("btnSaveWallet").click(); await sleep(200); ok(last("wallet_save").body.cfg.autoCapUsd === 150 && typeof last("wallet_save").body.cfg.autoCapUsd === "number" && last("wallet_save").body.cfg.maxProcessing === 10, "saving sends the new cap as a number together with the other wallet settings");
  /* ---- the deposit cards ---- */
  $("tabOrders").click(); await sleep(250); $("ordFilter").value = "all"; $("ordFilter").dispatchEvent(new dom.window.Event("change")); await sleep(250);
  ok(line("c1") === "⛓ أُكّد تلقائياً من البلوكتشين BEP20 · 0x9f9f9f9f… · 10.0137 USDT · 11 تأكيد".replace("0x9f9f9f9f…", TX.slice(0, 10) + "…" + TX.slice(-6)), "confirmed: 'confirmed automatically from the blockchain', the shortened transaction number, the amount and the confirmations: " + line("c1"));
  ok(line("c2") === "⛓ بانتظار الشبكة: التأكيدات 4 من 10. · " + TX.slice(0, 10) + "…" + TX.slice(-6) && !card("c2").querySelector('[data-chain="c2"]').classList.contains("late"), "waiting for confirmations: shows the progress (not highlighted as a problem)");
  ok(/⛓ تعذّر الاتصال بالشبكة، إعادة محاولة \(2\)/.test(line("c3")), "network problem: how many retries");
  ok(/⛓ يحتاج مراجعتك: المبلغ المحوّل 9\.5 يختلف عن المطلوب 10\.0137 \(لازم بالضبط\)\./.test(line("c4")) && card("c4").querySelector('[data-chain="c4"]').classList.contains("late"), "held for you: the exact reason, highlighted");
  ok(line("c5") === null && line("c6") === null, "a normal method, and a deposit without a transaction number, show no blockchain line");
  ok(btn("c2", "chaincheck").textContent === "⛓ تحقق من البلوكتشين" && btn("c4", "chaincheck") && !btn("c1", "chaincheck") && !btn("c5", "chaincheck") && !btn("c6", "chaincheck"), "the 'check the blockchain' button appears only for automatic deposits waiting for you that have a transaction number");
  await click(btn("c4", "chaincheck")); ok(last("order_chain_check").body.id === "c4" && /D-1004: تم تأكيد الإيداع تلقائياً ✓/.test($("ordMsg").textContent) && /أُكّد تلقائياً/.test(line("c4")) && !btn("c4", "chaincheck"), "pressing it checks now; when it works the card turns green ('confirmed') and the button goes");
  for (const [o, re] of [[{ outcome: "pending" }, /لسا بانتظار الشبكة/], [{ outcome: "retry" }, /تعذّر الاتصال بالشبكة، جرّب بعد شوي/], [{ outcome: "manual", reason: "المبلغ المحوّل 9 يختلف" }, /D-1002: المبلغ المحوّل 9 يختلف/], [{ outcome: "closed" }, /الإيداع منتهي/], [{ outcome: "no_ref" }, /ما في رقم عملية/]]) { outcome = { reason: "", ...o }; await click(btn("c2", "chaincheck")); ok(re.test($("ordMsg").textContent), "outcome '" + o.outcome + "' is explained in plain words"); }
  failNext = "تعذّر الاتصال"; await click(btn("c2", "chaincheck")); ok(/تعذّر الاتصال/.test($("ordMsg").textContent), "an error is shown");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
