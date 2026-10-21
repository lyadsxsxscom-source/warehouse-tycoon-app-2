// اختبارات صفحة أدمن المتجر: قاعدة التاجر (نقل، تمديد، تثبيت، إلغاء، تصفية، سجل)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_merchants.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = []; let authCb = null, failNext = null, confirmAnswer = true;
const NOW = Date.now(), DAY = 86400000;
const base = (id, name, spent, auto, o) => ({ id, name, email: id + "@x.com", spentUsd: spent, createdAt: 1, lastSeenAt: NOW, vip: auto, autoVip: auto, progressUsd: 50, sizeUsd: 300, remainingUsd: 250, nextVip: auto + 1, ...o });
let CUSTS = [
  base("plain", "Plain Customer", 250, 2),
  base("tr", "Trial Trader", 350, 2, { vip: 5, progressUsd: 350, sizeUsd: 3000, remainingUsd: 2650, nextVip: 6, merchant: { status: "trial", level: 5, targetUsd: 1000, windowSpentUsd: 350, remainingUsd: 650, endsAt: NOW + 40 * DAY, daysLeft: 40, prevLevel: 2, startedAt: NOW - 20 * DAY, note: "<b>wholesale</b> trader" } }),
  base("lk", "Locked Trader", 1200, 4, { vip: 5, merchant: { status: "locked", level: 5, targetUsd: 1000, windowSpentUsd: 1000, remainingUsd: 0, endsAt: NOW - 5 * DAY, daysLeft: 0, prevLevel: 2, startedAt: NOW - 70 * DAY, note: "" } }),
  base("ex", "Expired Trader", 400, 2, { merchant: { status: "expired", level: 5, targetUsd: 1000, windowSpentUsd: 300, remainingUsd: 700, endsAt: NOW - 3 * DAY, daysLeft: 0, prevLevel: 2, startedAt: NOW - 63 * DAY, note: "" } }),
  base("cn", "Cancelled Trader", 100, 1, { merchant: { status: "cancelled", level: 5, targetUsd: 500, windowSpentUsd: 0, remainingUsd: 500, endsAt: NOW + DAY, daysLeft: 0, prevLevel: 1, startedAt: NOW - DAY, note: "" } }),
];
const VLOG = { tr: [{ action: "set", level: 5, targetUsd: 1000, days: 60, prevLevel: 2, note: "agreed", at: NOW - 20 * DAY, by: "admin" }, { action: "auto_lock", level: 5, targetUsd: 1000, at: NOW - 2 * DAY, by: "auto" }] };
function server(b) {
  if (failNext) { const f = failNext; failNext = null; return { st: 400, j: { ok: false, error: "x", message: f } }; }
  if (b.action === "vip_get") return { st: 200, j: { ok: true, sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], configured: true, updatedAt: 1 } };
  if (b.action === "customers_list") return { st: 200, j: { ok: true, total: CUSTS.length, customers: CUSTS.map(c => JSON.parse(JSON.stringify(c))) } };
  const c = CUSTS.find(x => x.id === b.uid);
  if (b.action === "merchant_set") { c.vip = b.level; c.merchant = { status: "trial", level: b.level, targetUsd: b.targetUsd, windowSpentUsd: 0, remainingUsd: b.targetUsd, endsAt: NOW + b.trialDays * DAY, daysLeft: b.trialDays, prevLevel: c.autoVip, startedAt: NOW, note: b.note || "" }; return { st: 200, j: { ok: true } }; }
  if (b.action === "merchant_extend") { c.merchant.status = "trial"; c.merchant.daysLeft = b.days; c.merchant.endsAt = NOW + b.days * DAY; c.vip = c.merchant.level; return { st: 200, j: { ok: true } }; }
  if (b.action === "merchant_lock") { c.merchant.status = "locked"; c.vip = c.merchant.level; return { st: 200, j: { ok: true } }; }
  if (b.action === "merchant_cancel") { c.merchant.status = "cancelled"; c.vip = c.autoVip; return { st: 200, j: { ok: true } }; }
  if (b.action === "customer_log") return { st: 200, j: { ok: true, log: [{ deltaUsd: 100, spentAfter: 350, note: "order", at: NOW - 10 * DAY }], vipLog: VLOG[b.uid] || [] } };
  return { st: 400, j: { ok: false } };
}
const dom = new JSDOM(html, { url: "https://example.test/store-admin.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
  auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth };
  w.confirm = () => confirmAnswer;
  w.fetch = async (url, o) => { const body = JSON.parse(o.body); calls.push({ body }); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const card = id => d.querySelector(`[data-cust="${id}"]`), mer = id => d.querySelector(`[data-mer="${id}"]`);
const btn = (id, act) => card(id).querySelector(`button[data-act="${act}"]`);
const last = a => calls.filter(c => c.body.action === a).pop();
const submit = (form) => form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
(async () => {
  await sleep(100); authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(100); $("tabCustomers").click(); await sleep(200);

  /* ---- states ---- */
  ok(card("plain") && !mer("plain") && btn("plain", "mset") && /نقل تاجر/.test(btn("plain", "mset").textContent), "an ordinary customer has a '🏪 نقل تاجر' button and no merchant box");
  const tr = mer("tr");
  ok(/تاجر · فترة اختبار · VIP 5 حتى \d\d\/\d\d\/\d{4} \(باقي 40 يوم\) · صرف \$350\.00 من وعده \$1,000\.00 · باقي \$650\.00/.test(tr.textContent) && card("tr").querySelector(".vb").textContent === "VIP 5" && /تلقائي: VIP 2/.test(card("tr").textContent), "a trial merchant: level 5 held, dates, days left, what he spent of his promise, what is left, and his automatic level (VIP 2)");
  ok(/ملاحظة: <b>wholesale<\/b> trader/.test(tr.textContent) && tr.querySelector("b") === null, "the admin's note is shown as plain text");
  ok(!!tr.querySelector('[data-act="mext"]') && !!tr.querySelector('[data-act="mlock"]') && !!tr.querySelector('[data-act="mcancel"]'), "a trial offers: extend, lock now, cancel");
  ok(/تاجر · مثبّت · VIP 5 · وعد \$1,000\.00/.test(mer("lk").textContent) && !mer("lk").querySelector('[data-act="mext"]') && !mer("lk").querySelector('[data-act="mlock"]') && !!mer("lk").querySelector('[data-act="mcancel"]') && !card("lk").textContent.includes("تلقائي: VIP 4") === false, "a locked merchant: shown as locked, only 'cancel' is offered");
  ok(/انتهت فترة التاجر · VIP 5: وصل \$300\.00 من \$1,000\.00 · رجع لـVIP 2/.test(mer("ex").textContent) && !!mer("ex").querySelector('[data-act="mext"]') && !!mer("ex").querySelector('[data-act="mlock"]') && !mer("ex").querySelector('[data-act="mcancel"]') && mer("ex").classList.contains("expired"), "an expired merchant: how far he got and the level he went back to, with extend and lock-now (flexibility)");
  ok(/النقل ملغى · VIP 5 · رجع لـVIP 1/.test(mer("cn").textContent) && !mer("cn").querySelector("button"), "a cancelled move: shown, with no buttons");

  /* ---- move a customer ---- */
  btn("plain", "mset").click(); const f = card("plain").querySelector("form"); const q = n => f.querySelector(`[data-f="${n}"]`);
  ok(!!f && [...q("level").options].map(o => o.value).join() === "2,3,4,5,6,7,8,9,10" && q("level").value === "5" && q("days").value === "60" && q("target").value === "", "the form: levels 2 to 10 (5 selected), 60 days, and an empty promise");
  const pre = calls.length; submit(f); await sleep(30); ok(/اكتب رقم الوعد/.test(q("err").textContent) && calls.length === pre, "without a promised total nothing is sent");
  q("target").value = "0"; submit(f); await sleep(30); ok(/اكتب رقم الوعد/.test(q("err").textContent) && calls.length === pre, "zero is refused too");
  failNext = "الزبون أصلاً بمستوى VIP 4. اختار مستوى أعلى."; q("target").value = "1000"; submit(f); await sleep(60); ok(/أصلاً بمستوى VIP 4/.test(card("plain").querySelector("form [data-f=err]").textContent), "a server refusal is shown inside the form");
  const f2 = card("plain").querySelector("form"); f2.querySelector('[data-f="level"]').value = "6"; f2.querySelector('[data-f="target"]').value = "1500"; f2.querySelector('[data-f="days"]').value = "45"; f2.querySelector('[data-f="note"]').value = "he promised 1500"; submit(f2); await sleep(120);
  const mv = last("merchant_set").body; ok(mv.uid === "plain" && mv.level === 6 && mv.targetUsd === 1500 && mv.trialDays === 45 && mv.note === "he promised 1500" && typeof mv.level === "number" && typeof mv.targetUsd === "number", "sending: customer, level, the promise and days as numbers, and the note");
  ok(mer("plain") && /فترة اختبار · VIP 6/.test(mer("plain").textContent) && card("plain").querySelector(".vb").textContent === "VIP 6" && !card("plain").querySelector("form"), "the list refreshes with the new merchant state and the form closes");
  btn("ex", "mext").click(); btn("ex", "mext").click(); ok(!card("ex").querySelector("form"), "pressing the same button again closes the form");

  /* ---- extend ---- */
  btn("ex", "mext").click(); const fe = card("ex").querySelector("form"); ok(fe.dataset.merchantForm === "extend" && fe.querySelector('[data-f="days"]').value === "30" && !fe.querySelector('[data-f="level"]'), "extend asks only for days (30 by default) and a note");
  fe.querySelector('[data-f="days"]').value = "20"; fe.querySelector('[data-f="note"]').value = "hard month"; submit(fe); await sleep(120);
  ok(last("merchant_extend").body.uid === "ex" && last("merchant_extend").body.days === 20 && last("merchant_extend").body.note === "hard month" && /فترة اختبار/.test(mer("ex").textContent) && card("ex").querySelector(".vb").textContent === "VIP 5", "extending an expired merchant sends the days and brings him back to a trial (his level returns)");

  /* ---- lock and cancel ---- */
  const c0 = calls.length; confirmAnswer = false; mer("tr").querySelector('[data-act="mlock"]').click(); await sleep(30); ok(calls.length === c0, "'lock now' asks first; cancelling does nothing");
  confirmAnswer = true; mer("tr").querySelector('[data-act="mlock"]').click(); await sleep(120); ok(last("merchant_lock").body.uid === "tr" && /تاجر · مثبّت/.test(mer("tr").textContent) && !mer("tr").querySelector('[data-act="mlock"]'), "locking by hand sends the request and the box becomes 'locked'");
  confirmAnswer = false; mer("tr").querySelector('[data-act="mcancel"]').click(); await sleep(30); ok(calls.filter(c => c.body.action === "merchant_cancel").length === 0, "cancelling the move also asks first");
  confirmAnswer = true; mer("tr").querySelector('[data-act="mcancel"]').click(); await sleep(120); ok(last("merchant_cancel").body.uid === "tr" && /النقل ملغى/.test(mer("tr").textContent) && card("tr").querySelector(".vb").textContent === "VIP 2", "cancelling returns him to his automatic level at once");
  failNext = "النقل ملغى. اعمل نقل جديد."; mer("plain").querySelector('[data-act="mlock"]').click(); await sleep(80); ok(/اعمل نقل جديد/.test($("custMsg").textContent), "a server refusal on these buttons is shown above the list");

  /* ---- filter ---- */
  const shown = () => [...d.querySelectorAll("#custList .cust")].map(x => x.dataset.cust).sort().join();
  $("custFilter").value = "merchants"; $("custFilter").dispatchEvent(new dom.window.Event("change")); ok(shown() === "cn,ex,lk,plain,tr", "filter 'merchants': everyone who has a merchant record");
  $("custFilter").value = "locked"; $("custFilter").dispatchEvent(new dom.window.Event("change")); ok(shown() === "lk", "filter 'locked merchants' (the one cancelled above is not among them)");
  $("custFilter").value = "trial"; $("custFilter").dispatchEvent(new dom.window.Event("change")); ok(shown() === "ex,plain", "filter 'trial merchants'");
  $("custFilter").value = "expired"; $("custFilter").dispatchEvent(new dom.window.Event("change")); ok(shown() === "", "filter 'expired' with none shows the empty note"); ok(!!$("custEmpty"), "(empty note)");
  $("custFilter").value = "all"; $("custFilter").dispatchEvent(new dom.window.Event("change")); ok(shown() === "cn,ex,lk,plain,tr", "'all customers' shows everyone again");

  /* ---- log ---- */
  btn("tr", "log").click(); await sleep(80); const lines = [...d.querySelector('[data-box="tr"]').children].map(x => x.textContent);
  ok(lines.length === 3 && /تثبيت تلقائي \(وصل للرقم\) 5 · وعد \$1,000\.00/.test(lines[0]) && /\+\$100\.00 ← \$350\.00 · order/.test(lines[1]) && /نقل لـVIP 5 · وعد \$1,000\.00 · 60 يوم · agreed/.test(lines[2]), "the log mixes spending changes and merchant actions, newest first, in plain words (move, automatic lock...)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
