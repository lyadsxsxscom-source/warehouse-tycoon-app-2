// اختبارات صفحة المتجر للزبون: حذف الحساب (بدون رصيد فوراً، ومع رصيد طلب سحب، إلغاء الطلب، شارة "قيد الحذف"، ومنع الطلبات أثناء ذلك)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_delete_ui.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html0 = fs.readFileSync(path.join(__dirname, "../../site/store/index.html"), "utf8");
const html = html0.replace(/<script src="[^"]+"><\/script>\s*/g, "");
const TREE = [{ id: "nA", type: "folder", name: "PUBG", imageUrl: "", children: [{ id: "n1", type: "item", name: "60 UC", priceUsd: 0.92, imageUrl: "" }, { id: "n2", type: "item", name: "660 UC", priceUsd: 9.26, imageUrl: "" }] }];
const NOW = Date.now();
const METHOD = { id: "sham", name: "شام كاش", currency: "ل.س", decimals: 0, account: "0932000000", instructions: "حوّل وانسخ رقم العملية <b>x</b>" };
const mkOrder = (o) => ({ id: "o1", kind: "order", code: "T-1001", itemId: "n1", itemName: "60 UC", itemPath: "PUBG › 60 UC", playerId: "5123456789", vip: 1, priceUsd: 0.92, method: { id: "", name: "", currency: "", decimals: 0, account: "", instructions: "" }, amount: 0, status: "processing", createdAt: NOW, quoteEndsAt: 0, quoteExpired: false, proof: null, rejectReason: "", doneAt: 0, ...o });
const mkTop = (o) => ({ id: "d1", kind: "topup", code: "D-1001", itemId: "", itemName: "إيداع رصيد", itemPath: "إيداع رصيد", playerId: "", vip: 1, priceUsd: 10, method: METHOD, amount: 1425, status: "awaiting_payment", createdAt: NOW, quoteEndsAt: NOW + 30 * 60000, quoteExpired: false, proof: null, rejectReason: "", doneAt: 0, ...o });
function open(opts = {}) {
  const h = { calls: [], authCb: null, copied: "", canvas: [], big: false, confirmAnswer: true, balance: opts.balance === undefined ? 12.5 : opts.balance, orders: opts.orders || [], prices: opts.prices || { n1: 0.92, n2: 9.26 }, vip: opts.vip || 1, fail: {}, quotes: 0, validateFn: () => ({ supported: false }), validateDelay: 0, closing: opts.closing || null, delCalls: [], deleteFn: opts.deleteFn || (() => ({ balanceUsd: 12.5, openOrders: [], closing: null, canDelete: true })), signedOut: 0 };
  h.dom = new JSDOM(html, { url: "https://yardova.ly-ad.de/store/#/nA", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
    w.scrollTo = () => {}; w.confirm = () => h.confirmAnswer;
    Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t) => { if (h.clipFail) throw new Error("denied"); h.copied = t; } }, configurable: true });
    w.createImageBitmap = async () => ({ width: 1600, height: 1200 });
    w.HTMLCanvasElement.prototype.getContext = function () { const cv = this; return { drawImage() { h.canvas.push({ w: cv.width, h: cv.height }); } }; };
    w.HTMLCanvasElement.prototype.toDataURL = function (type, q) { if (h.big) return "data:image/webp;base64," + "A".repeat(250000); return "data:" + type + ";base64,SMALL" + (q || ""); };
    w.fetch = async (url, o) => {
      const u = String(url).replace("https://postback.ly-ad.de", ""), body = o && o.body ? JSON.parse(o.body) : {}; h.calls.push({ u, auth: o && o.headers && o.headers.Authorization, body });
      const R = (j, st = 200) => ({ ok: st < 400, status: st, json: async () => j });
      if (h.fail[u]) { const f = h.fail[u]; if (!f.keep) delete h.fail[u]; return R({ ok: false, error: f.error || "x", message: f.message, ...(f.extra || {}) }, f.status || 400); }
      if (u === "/store/catalog") return R({ ok: true, items: TREE, methods: [], wallet: { pointsPerUsd: 1000 } });
      if (u === "/store/me") return R({ ok: true, customer: { id: "u1", name: "Ali", email: "ali@x.com", vip: h.vip, spentUsd: 0, balanceUsd: h.balance, ...(h.closing ? { closing: h.closing } : {}), progressUsd: 0, sizeUsd: 200, remainingUsd: 200, nextVip: 2, createdAt: 1 }, wallet: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000 } });
      if (u === "/store/prices") return R({ ok: true, vip: h.vip, prices: h.prices });
      if (u === "/store/quote") { h.quotes++; const p = h.prices[body.itemId]; return R({ ok: true, quote: { itemId: body.itemId, name: "60 UC", vip: h.vip, priceUsd: p, balanceUsd: h.balance, enough: h.balance + 1e-9 >= p, shortUsd: Math.max(0, Math.round((p - h.balance) * 10000) / 10000) } }); }
      if (u === "/store/validate-id") { if (h.validateDelay) await sleep(h.validateDelay(body)); return R({ ok: true, ...h.validateFn(body) }); }
      if (u === "/store/deleteMe") { h.delCalls.push({ ...body, auth: o.headers.Authorization }); return R({ ok: true, ...h.deleteFn(body, h) }); }
      if (u === "/store/orders") return R({ ok: true, orders: h.orders });
      if (u === "/store/order") { const p = h.prices[body.itemId]; if (h.balance + 1e-9 < p) return R({ ok: false, error: "insufficient_balance", message: "رصيدك " + h.balance + "$ وسعر الطلب " + p + "$. اشحن رصيدك أول.", balanceUsd: h.balance, priceUsd: p, shortUsd: Math.round((p - h.balance) * 10000) / 10000 }, 400); h.balance = Math.round((h.balance - p) * 10000) / 10000; const o2 = mkOrder({ playerId: body.playerId, itemId: body.itemId, priceUsd: p }); h.orders = [o2, ...h.orders]; return R({ ok: true, order: o2, balanceUsd: h.balance }); }
      if (u === "/store/topup/quote") { const a = body.amountUsd; return R({ ok: true, quote: { amountUsd: a, validMinutes: 30, minUsd: 5, maxUsd: 1000, methods: [{ id: "sham", name: "شام كاش", currency: "ل.س", decimals: 0, amount: Math.round(a * 142.5) }, { id: "usdt", name: "USDT", currency: "USDT", decimals: 2, amount: Math.round(a * 1.015 * 100) / 100 }] } }); }
      if (u === "/store/topup") { const o2 = mkTop({ priceUsd: body.amountUsd, amount: body.methodId === "sham" ? Math.round(body.amountUsd * 142.5) : Math.round(body.amountUsd * 1.015 * 100) / 100, method: { ...METHOD, id: body.methodId, name: body.methodId === "sham" ? "شام كاش" : "USDT" } }); h.orders = [o2, ...h.orders]; return R({ ok: true, order: o2 }); }
      if (u === "/store/order/proof") { const o2 = h.orders.find(x => x.id === body.orderId); Object.assign(o2, { status: "payment_submitted", proof: { ref: body.ref || "", hasImage: !!body.image, submittedAt: Date.now(), late: false } }); return R({ ok: true, order: o2 }); }
      if (u === "/store/order/cancel") { const o2 = h.orders.find(x => x.id === body.orderId); o2.status = "cancelled"; return R({ ok: true, order: o2 }); }
      return R({ ok: false }, 404);
    };
    const auth = () => ({ onAuthStateChanged(cb) { h.authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() { h.signedOut++; return Promise.resolve(); } });
    auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth };
  } });
  h.w = h.dom.window; h.d = h.w.document; h.$ = id => h.d.getElementById(id);
  h.user = () => ({ uid: "u1", getIdToken: async () => "TOKEN" });
  h.key = (k, extra = {}) => h.d.dispatchEvent(new h.w.KeyboardEvent("keydown", { key: k, bubbles: true, ...extra }));
  h.last = (u) => h.calls.filter(c => c.u === u).pop(); h.count = (u) => h.calls.filter(c => c.u === u).length;
  h.signIn = async () => { h.authCb(h.user()); await sleep(150); };
  h.orderBtn = (id) => h.d.querySelector(`[data-order="${id}"]`);
  h.type = (el, v) => { el.value = v; el.dispatchEvent(new h.w.Event("input", { bubbles: true })); };
  h.pick = (file) => { const i = h.$("osFile"); Object.defineProperty(i, "files", { value: [file], configurable: true }); i.dispatchEvent(new h.w.Event("change", { bubbles: true })); };
  h.file = (type) => new h.w.File(["x"], "r." + type.split("/")[1], { type });
  h.unit = (u) => h.d.querySelector(`#walletBar [data-unit="${u}"]`);
  return h;
}
const lock = (h) => h.d.body.classList.contains("lock");
const refundOrder = (o) => ({ id: "rq1", kind: "refund", code: "R-1001", itemId: "", itemName: "طلب سحب الرصيد وحذف الحساب", itemPath: "طلب سحب الرصيد وحذف الحساب", playerId: "", vip: 1, priceUsd: 12.5, payout: { method: "شام كاش", account: "0932 111 222" }, status: "processing", createdAt: NOW, expiresAt: 0, events: [], ...o });
const del = (h) => h.d.getElementById("btnDelete");
(async () => {
  /* ---- the button ---- */
  { const h = open(); await sleep(60); ok(!h.$("btnDelete"), "signed out: no delete button"); await h.signIn(); h.$("btnMenu").click(); await sleep(50);
    ok(!!del(h) && del(h).textContent === "🗑️ احذف حسابي بالمتجر" && !h.$("closingBox") && del(h).parentElement === h.$("drBody"), "signed in: a '🗑️ delete my account' button in the account panel, and no closing banner"); }
  /* ---- the form, with a balance ---- */
  { const h = open(); await sleep(60); await h.signIn(); h.$("btnMenu").click(); await sleep(50); del(h).click(); await sleep(150); const $ = h.$;
    ok(h.last("/store/deleteMe").body.op === "check" && h.last("/store/deleteMe").auth === "Bearer TOKEN" && h.$("drawer").hidden && !h.$("osheet").hidden && $("osTitle").textContent === "حذف حسابي بالمتجر", "opening it asks the server what blocks deletion, closes the panel and shows the form");
    ok(/الحذف نهائي وما بيتراجع عنه/.test($("delWarn").textContent) && [...$("delList").children].map(x => x.textContent).join("|") === "بينمسح اسمك وإيميلك ومعرّفات اللاعب وصور الإيصالات.|سجلات الطلبات والمبالغ بتضل بدون اسم (للمحاسبة).|حسابك باللعبة ما بيتأثر.|إذا دخلت المتجر بعدين بيتعمل لك حساب جديد فاضي.", "it says plainly what is deleted, what stays anonymous, that the game account is untouched, and that signing in again makes an empty new account");
    ok($("delBal").textContent === "رصيدك: $12.50 (12,500 نقطة)" && $("osDelMethod") && $("osDelAcct").getAttribute("dir") === "ltr" && $("osDelOk") && $("osDelGo").textContent === "إرسال طلب السحب وحذف الحساب", "with a balance: it shows it (dollars and points), asks how to receive it, and the button says 'send the withdrawal request and delete the account'");
    $("osDelGo").click(); await sleep(50); ok(/اكتب طريقة استلام رصيدك وحسابك/.test($("osMsg").textContent) && h.count("/store/deleteMe") === 1, "pressing it with no method and account is refused on screen (nothing sent)");
    h.type($("osDelMethod"), "  شام كاش "); h.type($("osDelAcct"), " 0932 111 222 "); $("osDelGo").click(); await sleep(50); ok(/أكّد إنك فاهم إنه الحذف نهائي/.test($("osMsg").textContent) && h.count("/store/deleteMe") === 1 && $("osDelMethod").value === "  شام كاش ", "without ticking 'I understand it is permanent' it is refused (and what he typed is kept)");
    $("osDelOk").checked = true; $("osDelOk").dispatchEvent(new h.w.Event("change", { bubbles: true })); h.deleteFn = (b) => b.op === "request" ? { request: refundOrder({}) } : { balanceUsd: 12.5, openOrders: [], closing: null }; h.closing = { code: "R-1001", amountUsd: 12.5, requestedAt: NOW };
    $("osDelGo").click(); await sleep(200); const rq = h.delCalls.filter(x => x.op === "request").pop();
    ok(rq && rq.confirm === true && /^[A-Za-z0-9_-]{8,64}$/.test(rq.reqId) && rq.payoutMethod === "شام كاش" && rq.payoutAccount === "0932 111 222" && rq.auth === "Bearer TOKEN", "the request carries the confirmation, a request id, and the method and account (trimmed)");
    ok($("osTitle").textContent === "طلب سحب الرصيد R-1001" && $("rfAmount").textContent === "المبلغ: $12.50" && /الاستلام: شام كاش · /.test($("osBody").textContent) && $("rfAcct").textContent === "0932 111 222" && $("rfAcct").tagName === "BDI" && $("osStatus").textContent === "بانتظار إرسال رصيدك" && /بنرسل رصيدك على الحساب اللي كتبته، وبعدها بينحذف حسابك/.test($("osFinal").textContent) && $("osCancelClose") && $("osDone"), "then it shows the request: R-1001, the amount, where it will be sent (the account in its own isolated element), 'waiting for your balance to be sent', what happens next, and a cancel button");
    await sleep(200); h.$("btnMenu").click(); await sleep(50); h.$("osDone") && 0;
  }
  /* ---- the double press and a failed attempt keep one request id ---- */
  { const h = open(); await sleep(60); await h.signIn(); h.$("btnMenu").click(); await sleep(50); del(h).click(); await sleep(150); const $ = h.$;
    h.type($("osDelMethod"), "USDT BEP20"); h.type($("osDelAcct"), "0xabc123def"); $("osDelOk").checked = true; $("osDelOk").dispatchEvent(new h.w.Event("change", { bubbles: true }));
    h.fail["/store/deleteMe"] = { error: "has_open", message: "عندك طلبات مفتوحة (T-1001). استنى لحد ما تخلص قبل ما تحذف حسابك.", status: 400 }; $("osDelGo").click(); await sleep(150);
    ok(/عندك طلبات مفتوحة \(T-1001\)/.test($("osMsg").textContent) && !$("osDelGo").disabled && $("osDelMethod").value === "USDT BEP20", "a refusal from the server is shown, the button works again and his input is kept");
    h.deleteFn = (b) => b.op === "request" ? { request: refundOrder({ payout: { method: "USDT BEP20", account: "0xabc123def" } }) } : {}; $("osDelGo").click(); await sleep(200);
    const ids = h.calls.filter(c => c.u === "/store/deleteMe" && c.body.op === "request").map(c => c.body.reqId); ok(ids.length === 2 && ids[0] === ids[1], "the retry uses the SAME request id (so pressing twice can never create two requests)"); }
  /* ---- the closing banner and the blocks ---- */
  { const h = open({ closing: { code: "R-1001", amountUsd: 12.5, requestedAt: NOW }, orders: [refundOrder({})], balance: 0 }); await sleep(60); await h.signIn(); h.$("btnMenu").click(); await sleep(80); const $ = h.$;
    ok($("closingBox") && /⏳ حسابك قيد الحذف/.test($("closingBox").textContent) && /طلب سحب رصيدك R-1001 \(\$12\.50\) بانتظار الإرسال/.test($("closingBox").textContent) && /ما بتقدر تعمل طلبات أو إيداعات لحد ما ينتهي/.test($("closingBox").textContent) && $("btnCancelClose") && !del(h), "a closing account shows the banner with the request, the amount and what it means, a cancel button, and no delete button");
    ok(/R-1001/.test($("myOrders").textContent) && /بانتظار إرسال رصيدك/.test($("myOrders").textContent) && /\$12\.50/.test($("myOrders").textContent), "the request is in his orders list (status 'waiting for your balance to be sent', and the amount)");
    h.$("btnCloseDrawer").click(); await sleep(30); const q0 = h.count("/store/quote"); h.orderBtn("n1").click(); await sleep(150);
    ok(h.count("/store/quote") === q0 && !$("osheet").hidden && /حسابك قيد الحذف \(طلب R-1001\)/.test($("osError").textContent) && /بتقدر تلغي طلب الحذف من ☰/.test($("osError").textContent), "pressing 'order' on a closing account explains why it cannot (no price request is made)"); $("osDone").click(); await sleep(30);
    h.$("btnMenu").click(); await sleep(50); h.$("btnDrTopup").click(); await sleep(150); ok(/حسابك قيد الحذف/.test($("osError").textContent) && h.count("/store/topup/quote") === 0, "and the same for a deposit"); $("osDone").click(); await sleep(30);
    h.$("btnMenu").click(); await sleep(50); h.d.querySelector('[data-oid="rq1"]').click(); await sleep(100); ok($("osTitle").textContent === "طلب سحب الرصيد R-1001" && $("osCancelClose") && $("rfAcct").textContent === "0932 111 222", "opening the request from the list shows the same request view"); $("osDone").click(); await sleep(30);
    /* cancelling from the panel */
    h.$("btnMenu").click(); await sleep(50); h.confirmAnswer = false; const n0 = h.count("/store/deleteMe"); $("btnCancelClose").click(); await sleep(80); ok(h.count("/store/deleteMe") === n0, "'cancel the deletion' asks first; saying no does nothing");
    h.confirmAnswer = true; h.fail["/store/deleteMe"] = { error: "bad_status", message: "ما بتقدر تلغي الطلب هلق (تم التعامل معه).", status: 400 }; $("btnCancelClose").click(); await sleep(150); ok(/ما بتقدر تلغي الطلب هلق/.test($("closeMsg").textContent) && $("closingBox"), "a refusal is shown inside the banner and the banner stays");
    h.deleteFn = (b) => b.op === "cancel" ? { balanceUsd: 12.5 } : {}; h.closing = null; h.balance = 12.5; $("btnCancelClose").click(); await sleep(250);
    ok(h.last("/store/deleteMe").body.op === "cancel" && !h.$("closingBox") && !!del(h) && h.$("accBalance").textContent === "$12.50", "cancelling reloads the account: the banner is gone, the delete button is back and the balance is back"); }
  /* ---- cancelling from the request view ---- */
  { const h = open({ closing: { code: "R-1001", amountUsd: 12.5, requestedAt: NOW }, orders: [refundOrder({})], balance: 0 }); await sleep(60); await h.signIn(); h.$("btnMenu").click(); await sleep(80); h.d.querySelector('[data-oid="rq1"]').click(); await sleep(100); const $ = h.$;
    h.deleteFn = (b) => ({ balanceUsd: 12.5 }); h.closing = null; h.balance = 12.5; $("osCancelClose").click(); await sleep(250);
    ok($("osStatus").textContent === "ملغي" || /ألغيت طلب الحذف، ورجع رصيدك لحسابك/.test($("osFinal").textContent), "cancelling from the request view updates it: 'you cancelled the deletion and your balance is back'"); ok(!$("osCancelClose"), "(and the cancel button goes)"); }
  /* ---- no balance: deleted at once ---- */
  { const h = open({ balance: 0, deleteFn: (b) => b.op === "request" ? { deleted: true } : { balanceUsd: 0, openOrders: [], closing: null } }); await sleep(60); await h.signIn(); h.$("btnMenu").click(); await sleep(50); del(h).click(); await sleep(150); const $ = h.$;
    ok(!$("osDelMethod") && !$("osDelAcct") && !$("delBal") && $("osDelGo").textContent === "احذف حسابي نهائياً", "with no balance there is no method or account to fill; the button says 'delete my account for good'");
    $("osDelOk").checked = true; $("osDelOk").dispatchEvent(new h.w.Event("change", { bubbles: true })); $("osDelGo").click(); await sleep(200);
    ok($("osTitle").textContent === "تم" && /انحذف حسابك بالمتجر/.test($("delDone").textContent) && h.delCalls.filter(x => x.op === "request").pop().payoutMethod === "" && h.signedOut === 0, "done: a confirmation is shown first (he is not signed out until he presses OK)");
    $("osDelFinish").click(); await sleep(100); ok(h.signedOut === 1 && $("osheet").hidden, "pressing OK signs him out and closes the sheet"); }
  /* ---- open orders block it ---- */
  { const h = open({ deleteFn: () => ({ balanceUsd: 12.5, openOrders: ["T-1001", "D-1002"], closing: null, canDelete: false }) }); await sleep(60); await h.signIn(); h.$("btnMenu").click(); await sleep(50); del(h).click(); await sleep(150); const $ = h.$;
    ok(/عندك طلبات مفتوحة \(T-1001، D-1002\)/.test($("delOpen").textContent) && !$("osDelGo") && !$("osDelOk") && $("osDone"), "with open orders it lists them and offers no delete button, only 'OK'"); $("osDone").click(); await sleep(30); ok($("osheet").hidden, "(closes)"); }
  /* ---- the server cannot be reached ---- */
  { const h = open(); await sleep(60); await h.signIn(); h.$("btnMenu").click(); await sleep(50); h.fail["/store/deleteMe"] = { error: "x", message: "تعذّر الاتصال. جرّب بعد شوي.", status: 502 }; del(h).click(); await sleep(150);
    ok(/تعذّر الاتصال/.test(h.$("osError").textContent) && h.$("osDone"), "if the check fails the sheet says so (nothing is deleted)"); }
  /* ---- the points display ---- */
  { const h = open(); await sleep(60); await h.signIn(); h.unit("pts").click(); await sleep(30); h.$("btnMenu").click(); await sleep(50); del(h).click(); await sleep(150);
    ok(h.$("delBal").textContent === "رصيدك: 12,500 نقطة ($12.50)", "with the points display on, the balance line shows points first"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
