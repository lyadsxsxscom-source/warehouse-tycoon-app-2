// اختبارات صفحة أدمن المتجر: تبويب "الزباين وVIP" (مستويات VIP، قائمة الزباين، التقدّم، تعديل الصرف، السجل)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_customers.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = []; let confirmAnswerC = true, confirmTextsC = []; let authCb = null, SIZES = [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], configured = false, vipFail = null, spendFail = null, logMode = "ok";
const info = (spent) => { let rest = spent, lv = 1; for (const z of SIZES) { if (rest + 1e-9 >= z) { rest -= z; lv++; } else break; } const max = lv > 9; return { vip: lv, progressUsd: max ? 0 : rest, sizeUsd: max ? null : SIZES[lv - 1], remainingUsd: max ? 0 : SIZES[lv - 1] - rest, nextVip: max ? null : lv + 1 }; };
let CUSTS = [{ id: "c1", name: "Sara", email: "sara@x.com", spentUsd: 250, balanceUsd: 12.5, createdAt: 1, lastSeenAt: 1792000000000 }, { id: "c2", name: "<img src=x onerror=alert(1)>", email: "", spentUsd: 21000, balanceUsd: 0, createdAt: 1, lastSeenAt: 0 }];
let LEDGER = [], balFail = null;
const view = () => CUSTS.map(c => ({ ...c, ...info(c.spentUsd) }));
function server(b) {
  if (b.action === "wallet_get") return { st: 200, j: { ok: true, cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10 }, configured: true, updatedAt: 1 } };
  if (b.action === "customer_balance") { if (balFail) return { st: 400, j: { ok: false, error: "insufficient_balance", message: balFail } }; const c = CUSTS.find(x => x.id === b.uid); c.balanceUsd = Math.round((c.balanceUsd + b.deltaUsd) * 10000) / 10000; return { st: 200, j: { ok: true } }; }
  if (b.action === "customer_ledger") return { st: 200, j: { ok: true, ledger: LEDGER } };
  if (b.action === "vip_get") return { st: 200, j: { ok: true, sizes: SIZES, configured, updatedAt: 0 } };
  if (b.action === "vip_save") { if (vipFail) return { st: 400, j: { ok: false, error: "bad_vip", message: vipFail } }; SIZES = b.sizes; configured = true; return { st: 200, j: { ok: true, sizes: SIZES, configured: true, updatedAt: 1 } }; }
  if (b.action === "customers_list") { const q = (b.q || "").toLowerCase(); return { st: 200, j: { ok: true, total: CUSTS.length, customers: view().filter(c => !q || (c.name + " " + c.email).toLowerCase().includes(q)) } }; }
  if (b.action === "customer_spend") { if (spendFail) return { st: 400, j: { ok: false, error: "bad_delta", message: spendFail } }; const c = CUSTS.find(x => x.id === b.uid); c.spentUsd = Math.max(0, c.spentUsd + b.deltaUsd); return { st: 200, j: { ok: true } }; }
  if (b.action === "customer_log") { if (logMode === "fail") return { st: 500, j: { ok: false } }; return { st: 200, j: { ok: true, log: logMode === "empty" ? [] : [{ deltaUsd: 100, spentAfter: 350, note: "<b>order</b>", at: 1792000100000 }, { deltaUsd: -20.5, spentAfter: 250, note: "", at: 1792000000000 }] } }; }
  return { st: 400, j: { ok: false } };
}
const dom = new JSDOM(html, { url: "https://example.test/store-admin.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  w.confirm = (t) => { confirmTextsC.push(t); return confirmAnswerC; };
  const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
  auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth };
  w.fetch = async (url, o) => { const body = JSON.parse(o.body); calls.push({ auth: o.headers.Authorization, body }); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const submit0 = f => f.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
const last = (a) => calls.filter(c => c.body.action === a).pop();
const cards = () => [...d.querySelectorAll("#custList .cust")];
const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event("input", { bubbles: true })); };
(async () => {
  await sleep(100); authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(120);
  const c0 = calls.length; $("tabCustomers").click(); await sleep(150);
  ok(!$("viewCustomers").hidden && $("viewCatalog").hidden && $("viewPayments").hidden && $("tabCustomers").classList.contains("active") && calls.slice(c0).some(c => c.body.action === "vip_get" && c.auth === "Bearer TOKEN") && calls.slice(c0).some(c => c.body.action === "customers_list"), "the tab opens and loads the VIP levels and the customers (with the admin token)");

  /* ---- VIP levels ---- */
  const inputs = () => [...d.querySelectorAll("#vipRows input")];
  ok(inputs().length === 9 && inputs().map(i => i.value).join() === "200,300,500,800,1200,2000,3000,5000,8000" && /هاي أرقام مثال/.test($("vipNote").textContent), "nine level sizes are shown (VIP 1 to 9) and the screen says they are example numbers");
  ok(/بيبدأ VIP 2 عند إجمالي صرف \$200\.00/.test(d.querySelector('[data-cum="0"]').textContent) && /VIP 3 عند إجمالي صرف \$500\.00/.test(d.querySelector('[data-cum="1"]').textContent) && /VIP 10 عند إجمالي صرف \$21,000\.00/.test(d.querySelector('[data-cum="8"]').textContent), "under each level the running total is shown (VIP 2 starts at $200, VIP 3 at $500 ... VIP 10 at $21,000)");
  typeIn(inputs()[0], "250"); ok(/\$250\.00/.test(d.querySelector('[data-cum="0"]').textContent) && /\$550\.00/.test(d.querySelector('[data-cum="1"]').textContent), "editing a size updates every running total live");
  vipFail = "المبلغ لإكمال VIP 3 لازم يكون رقم أكبر من 0."; $("btnSaveVip").click(); await sleep(60); ok(/VIP 3/.test($("vipMsg").textContent) && !$("btnSaveVip").disabled, "a server refusal is shown and the button works again"); vipFail = null;
  const l0 = calls.length; $("btnSaveVip").click(); await sleep(100);
  ok(last("vip_save").body.sizes.join() === "250,300,500,800,1200,2000,3000,5000,8000" && last("vip_save").body.sizes.every(x => typeof x === "number") && /انحفظ/.test($("vipMsg").textContent) && $("vipNote").textContent === "" && calls.slice(l0).some(c => c.body.action === "customers_list"), "saving sends nine numbers, confirms, and reloads the customers (their levels are recalculated)");
  typeIn(inputs()[0], "200"); $("btnSaveVip").click(); await sleep(80);

  /* ---- customers ---- */
  const sara = cards()[0];
  ok($("custCount").textContent === "(2)" && cards().length === 2 && /Sara/.test(sara.textContent) && sara.querySelector(".em").textContent === "sara@x.com" && sara.querySelector(".vb").textContent === "VIP 2", "the list shows each customer with name, email, level and the total count");
  ok(/تقدّمه \$50\.00 من \$300\.00 · باقي \$250\.00 لـVIP 3/.test(sara.textContent) && sara.querySelector(".fill").style.width === "16.7%" && /إجمالي الصرف \$250\.00/.test(sara.textContent) && /آخر زيارة: \d/.test(sara.textContent), "THE EXAMPLE: spent 250 with VIP 1 = 200 shows VIP 2, progress $50 of $300, $250 to VIP 3, a bar at 16.7%, the total and the last visit");
  const top = cards()[1]; ok(/أعلى مستوى/.test(top.textContent) && top.querySelector(".fill").style.width === "100%" && top.querySelector(".vb").textContent === "VIP 10" && /آخر زيارة: —/.test(top.textContent), "a customer at the top level says so, with a full bar and a dash when never seen");
  ok(top.querySelector("img") === null && top.querySelector(".nm").textContent === "<img src=x onerror=alert(1)>" && top.querySelector(".em").textContent === "c2", "names are plain text; a missing email shows the id");

  /* ---- search ---- */
  const s0 = calls.length; typeIn($("custSearch"), "sar"); typeIn($("custSearch"), "sara"); await sleep(450);
  ok(calls.slice(s0).filter(c => c.body.action === "customers_list").length === 1 && last("customers_list").body.q === "sara" && cards().length === 1, "typing waits a moment, then searches once");
  typeIn($("custSearch"), "nobody"); await sleep(450); ok($("custEmpty") && /ما في زباين/.test($("custEmpty").textContent), "no match says so"); typeIn($("custSearch"), ""); await sleep(450); ok(cards().length === 2, "clearing the search shows everyone");

  /* ---- manual spending ---- */
  const btn = (id, act) => d.querySelector(`[data-cust="${id}"] button[data-act="${act}"]`);
  btn("c1", "spend").click(); const form = d.querySelector('[data-cust="c1"] form');
  ok(!!form && form.querySelector('[data-f="delta"]') && form.querySelector('[data-f="note"]'), "'➕ تعديل الصرف' opens a small form (amount and note)");
  const pre = calls.length; form.dispatchEvent(new dom.window.Event("submit", { cancelable: true })); await sleep(30);
  ok(/اكتب مبلغ/.test(form.querySelector('[data-f="err"]').textContent) && calls.length === pre, "an empty amount is refused on the screen");
  form.querySelector('[data-f="delta"]').value = "0"; form.dispatchEvent(new dom.window.Event("submit", { cancelable: true })); await sleep(30); ok(/اكتب مبلغ/.test(form.querySelector('[data-f="err"]').textContent) && calls.length === pre, "so is zero");
  spendFail = "اكتب مبلغ (موجب أو سالب) أكبر من 0 وأقل من مليون."; form.querySelector('[data-f="delta"]').value = "5"; form.dispatchEvent(new dom.window.Event("submit", { cancelable: true })); await sleep(60);
  ok(/أقل من مليون/.test(d.querySelector('[data-cust="c1"] form [data-f="err"]').textContent), "a server refusal is shown inside the form"); spendFail = null;
  form.querySelector('[data-f="delta"]').value = "100"; form.querySelector('[data-f="note"]').value = "order at the shop"; form.dispatchEvent(new dom.window.Event("submit", { cancelable: true })); await sleep(120);
  ok(last("customer_spend").body.uid === "c1" && last("customer_spend").body.deltaUsd === 100 && last("customer_spend").body.note === "order at the shop" && typeof last("customer_spend").body.deltaUsd === "number", "applying sends the customer, the amount as a number and the note");
  ok(/VIP 2/.test(cards()[0].querySelector(".vb").textContent) && /تقدّمه \$150\.00 من \$300\.00/.test(cards()[0].textContent) && !d.querySelector('[data-cust="c1"] form'), "the list refreshes: 350 spent = VIP 2 with $150 progress, and the form closes");
  btn("c1", "spend").click(); btn("c1", "spend").click(); ok(!d.querySelector('[data-cust="c1"] form'), "pressing the button again closes the form");

  /* ---- log ---- */
  btn("c1", "log").click(); await sleep(80);
  const box = d.querySelector('[data-box="c1"]'); ok(box.children.length === 2 && /\+\$100\.00 ← \$350\.00 · <b>order<\/b>/.test(box.children[0].textContent) && /-\$20\.50 ← \$250\.00/.test(box.children[1].textContent) && box.querySelector("b") === null, "'📜 السجل' lists the changes (amount, result, note) as plain text");
  btn("c1", "log").click(); ok(box.textContent === "", "pressing again hides it");
  logMode = "empty"; btn("c1", "log").click(); await sleep(60); ok(/ما في تعديلات/.test(box.textContent), "an empty log says so"); btn("c1", "log").click();
  logMode = "fail"; btn("c1", "log").click(); await sleep(60); ok(/تعذّر/.test(box.textContent), "a failure is shown");
  /* ---- balance (in dollars and points) ---- */
  logMode = "ok"; await sleep(50);
  ok(/الرصيد \$12\.50 \(12,500 نقطة\)/.test(cards()[0].querySelector('[data-bal]').textContent) && /الرصيد \$0\.00 \(0 نقطة\)/.test(cards()[1].querySelector('[data-bal]').textContent), "each customer shows his balance in dollars and in points (1000 points = $1)");
  const balBtn = (id) => d.querySelector(`[data-cust="${id}"] button[data-act="bal"]`);
  balBtn("c1").click(); let bf = d.querySelector('[data-cust="c1"] form[data-balance-form]');
  ok(!!bf && /سالب/.test(bf.querySelector('[data-f="delta"]').placeholder) && bf.querySelector('[data-f="delta"]').step === "0.0001", "'💵 تعديل الرصيد' opens a form (amount in dollars; negative means a cash refund or a correction)");
  const pre2 = calls.length; submit0(bf); await sleep(30); ok(/اكتب مبلغ/.test(bf.querySelector('[data-f="err"]').textContent) && calls.length === pre2, "an empty amount is refused on the screen");
  bf.querySelector('[data-f="delta"]').value = "0"; submit0(bf); await sleep(30); ok(/اكتب مبلغ/.test(bf.querySelector('[data-f="err"]').textContent) && calls.length === pre2, "so is zero");
  bf.querySelector('[data-f="delta"]').value = "-5.5"; bf.querySelector('[data-f="note"]').value = "cash refund"; confirmAnswerC = false; submit0(bf); await sleep(30);
  ok(calls.length === pre2 && /خصم \$5\.50 من رصيد الزبون/.test(confirmTextsC.pop()), "a deduction asks first (and says 'from his balance')");
  confirmAnswerC = true; submit0(bf); await sleep(120); const bp = last("customer_balance").body;
  ok(bp.uid === "c1" && bp.deltaUsd === -5.5 && typeof bp.deltaUsd === "number" && bp.note === "cash refund" && /الرصيد \$7\.00 \(7,000 نقطة\)/.test(cards()[0].querySelector('[data-bal]').textContent) && !d.querySelector('[data-cust="c1"] form[data-balance-form]'), "applying sends the amount (as a number) and the note, the list refreshes ($7.00 = 7,000 points) and the form closes");
  balBtn("c1").click(); bf = d.querySelector('[data-cust="c1"] form[data-balance-form]'); balFail = "رصيد الزبون ما بيكفي لهالخصم."; bf.querySelector('[data-f="delta"]').value = "-500"; submit0(bf); await sleep(80);
  ok(/ما بيكفي/.test(d.querySelector('[data-cust="c1"] form[data-balance-form] [data-f="err"]').textContent), "a refusal from the server is shown inside the form"); balFail = null;
  balBtn("c1").click(); ok(!d.querySelector('[data-cust="c1"] form[data-balance-form]'), "pressing the button again closes the form");
  LEDGER = [{ type: "topup", amountUsd: 100, balanceAfter: 112.5, ref: "D-1001", note: "", at: 1792000200000, by: "admin" }, { type: "order", amountUsd: -0.9234, balanceAfter: 12.5, ref: "T-1001", note: "60 UC", at: 1792000100000, by: "customer" }]; d.querySelector('[data-box="c1"]').textContent = "";
  d.querySelector('[data-cust="c1"] button[data-act="log"]').click(); await sleep(100); const lines = [...d.querySelector('[data-box="c1"]').children].map(x => x.textContent);
  ok(lines.some(x => /💵 إيداع \+\$100\.00 ← رصيد \$112\.50 · D-1001/.test(x)) && lines.some(x => /💵 شراء -\$0\.9234 ← رصيد \$12\.50 · T-1001 · 60 UC/.test(x)), "the history now also lists his balance movements in plain words (deposit, purchase...), with 4-decimal amounts kept");
  $("tabCatalog").click(); ok(!$("viewCatalog").hidden && $("viewCustomers").hidden, "back to the catalog tab");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
