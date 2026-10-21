// اختبارات صفحة الزبون (6د): شريط الرصيد و$/نقاط، شراء من الرصيد، إيداع الرصيد (مبلغ وطريقة دفع وإيصال)، طلباتي، الأسعار الشخصية
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_orders_ui.test.js
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
  const h = { calls: [], authCb: null, copied: "", canvas: [], big: false, confirmAnswer: true, balance: opts.balance === undefined ? 12.5 : opts.balance, orders: opts.orders || [], prices: opts.prices || { n1: 0.92, n2: 9.26 }, vip: opts.vip || 1, fail: {}, quotes: 0 };
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
      if (u === "/store/me") return R({ ok: true, customer: { id: "u1", name: "Ali", email: "ali@x.com", vip: h.vip, spentUsd: 0, balanceUsd: h.balance, progressUsd: 0, sizeUsd: 200, remainingUsd: 200, nextVip: 2, createdAt: 1 }, wallet: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000 } });
      if (u === "/store/prices") return R({ ok: true, vip: h.vip, prices: h.prices });
      if (u === "/store/quote") { h.quotes++; const p = h.prices[body.itemId]; return R({ ok: true, quote: { itemId: body.itemId, name: "60 UC", vip: h.vip, priceUsd: p, balanceUsd: h.balance, enough: h.balance + 1e-9 >= p, shortUsd: Math.max(0, Math.round((p - h.balance) * 10000) / 10000) } }); }
      if (u === "/store/orders") return R({ ok: true, orders: h.orders });
      if (u === "/store/order") { const p = h.prices[body.itemId]; if (h.balance + 1e-9 < p) return R({ ok: false, error: "insufficient_balance", message: "رصيدك " + h.balance + "$ وسعر الطلب " + p + "$. اشحن رصيدك أول.", balanceUsd: h.balance, priceUsd: p, shortUsd: Math.round((p - h.balance) * 10000) / 10000 }, 400); h.balance = Math.round((h.balance - p) * 10000) / 10000; const o2 = mkOrder({ playerId: body.playerId, itemId: body.itemId, priceUsd: p }); h.orders = [o2, ...h.orders]; return R({ ok: true, order: o2, balanceUsd: h.balance }); }
      if (u === "/store/topup/quote") { const a = body.amountUsd; return R({ ok: true, quote: { amountUsd: a, validMinutes: 30, minUsd: 5, maxUsd: 1000, methods: [{ id: "sham", name: "شام كاش", currency: "ل.س", decimals: 0, amount: Math.round(a * 142.5) }, { id: "usdt", name: "USDT", currency: "USDT", decimals: 2, amount: Math.round(a * 1.015 * 100) / 100 }] } }); }
      if (u === "/store/topup") { const o2 = mkTop({ priceUsd: body.amountUsd, amount: body.methodId === "sham" ? Math.round(body.amountUsd * 142.5) : Math.round(body.amountUsd * 1.015 * 100) / 100, method: { ...METHOD, id: body.methodId, name: body.methodId === "sham" ? "شام كاش" : "USDT" } }); h.orders = [o2, ...h.orders]; return R({ ok: true, order: o2 }); }
      if (u === "/store/order/proof") { const o2 = h.orders.find(x => x.id === body.orderId); Object.assign(o2, { status: "payment_submitted", proof: { ref: body.ref || "", hasImage: !!body.image, submittedAt: Date.now(), late: false } }); return R({ ok: true, order: o2 }); }
      if (u === "/store/order/cancel") { const o2 = h.orders.find(x => x.id === body.orderId); o2.status = "cancelled"; return R({ ok: true, order: o2 }); }
      return R({ ok: false }, 404);
    };
    const auth = () => ({ onAuthStateChanged(cb) { h.authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() { return Promise.resolve(); } });
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
(async () => {
  /* ---- where the balance sits ---- */
  { const h = open(); await sleep(60); await h.signIn(); const bar = h.$("walletBar"), tag = h.d.querySelector(".tag");
    ok(tag.contains(bar) && bar.nextElementSibling.tagName === "H1" && bar.nextElementSibling.textContent === "Yardova Card" && !h.d.querySelector("main #walletBar"), "the balance is a slim line inside the title box, directly above the title 'Yardova Card' (not a big box in the page)");
    ok(/ستايل|/.test("") && h.$("walAlt").textContent === "12,500 نقطة" && h.d.querySelectorAll("#walletBar button").length === 3 && ![...h.d.querySelectorAll("#walletBar button")].some(b => b.textContent.length > 6), "one line: the balance, a short '➕ شحن' button and the '$ | نقاط' switch (no long labels)");
    ok(/\.wallet\{[^}]*font-size:\.9rem/.test(html0) && !/\.wallet\{[^}]*border:3px/.test(html0), "styled small and without a box of its own"); }
  /* ---- signed out ---- */
  { const h = open(); await sleep(100); const $ = h.$;
    ok(h.d.querySelectorAll("button.order-btn").length === 2 && !/الطلب قريباً/.test(h.d.querySelector("main").textContent), "every product card has an 'اطلب' button");
    h.orderBtn("n1").focus(); h.orderBtn("n1").click(); await sleep(50);
    ok(!$("drawer").hidden && $("osheet").hidden && /سجّل دخول عشان تطلب/.test($("accMsg").textContent) && !h.calls.some(c => c.u === "/store/quote"), "signed out: the order button opens the sign-in panel and asks nothing from the server");
    $("btnCloseDrawer").click();

    /* ---- signed in: the wallet bar and personal prices ---- */
    h.vip = 4; h.prices = { n1: 0.86, n2: 9.26 }; await h.signIn();
    ok(h.last("/store/prices").auth === "Bearer TOKEN" && h.$("walAmount").textContent === "$12.50" && h.$("walAlt").textContent === "12,500 نقطة" && !!h.$("btnTopup") && /➕ شحن/.test(h.$("btnTopup").textContent) && h.$("btnTopup").getAttribute("aria-label") === "شحن الرصيد", "signed in: a slim top line shows his balance ($12.50, and 12,500 points next to it) and a small 'top up' button (read aloud as 'شحن الرصيد')");
    const c1 = h.d.querySelector('[data-item="n1"]'), c2 = h.d.querySelector('[data-item="n2"]');
    ok(/\$0\.86/.test(c1.querySelector(".pr").textContent) && /860 نقطة/.test(c1.querySelector(".pr small").textContent) && /سعرك VIP 4/.test(c1.textContent) && !/سعرك VIP/.test(c2.textContent), "a card shows HIS price (VIP 4: $0.86 = 860 points) with a note; an item with the same price has no note");
    h.unit("pts").click(); await sleep(30);
    ok(h.$("walAmount").textContent === "12,500 نقطة" && h.$("walAlt").textContent === "$12.50" && /^860 نقطة/.test(c1.querySelector(".pr").textContent) === false, "(old card nodes are replaced when the unit changes)");
    const c1b = h.d.querySelector('[data-item="n1"]'); ok(/^860 نقطة/.test(c1b.querySelector(".pr").textContent) && /\$0\.86/.test(c1b.querySelector(".pr small").textContent) && h.w.localStorage.getItem("store_unit") === "pts", "switching to points changes the balance and every price (and is remembered)");
    h.unit("usd").click(); await sleep(30);
    h.authCb(null); await sleep(60); ok(!h.$("walAmount") && !h.$("btnTopup") && !!h.unit("usd") && /\$?0\.92/.test(h.d.querySelector('[data-item="n1"] .pr').textContent) && !/سعرك VIP/.test(h.d.querySelector("main").textContent), "signing out removes the balance and the personal prices (the switch stays)");
    h.vip = 1; h.prices = { n1: 0.92, n2: 9.26 }; await h.signIn();

    /* ---- buying from the balance ---- */
    h.orderBtn("n1").focus(); h.orderBtn("n1").click(); await sleep(150);
    ok(!$("osheet").hidden && !$("scrim2").hidden && lock(h) && $("osTitle").textContent === "اطلب: 60 UC" && h.last("/store/quote").body.itemId === "n1" && h.last("/store/quote").auth === "Bearer TOKEN", "signed in: the sheet opens, asks the server for the price at his level and his balance, and locks page scrolling");
    ok(/سعرك حسب مستواك VIP 1: \$0\.92/.test($("osPrice").textContent) && /رصيدك: \$12\.50/.test($("osBal").textContent) && /بعد الشراء: \$11\.58/.test($("osAfter").textContent) && !h.d.querySelector("#osBody [data-mid]") && !$("osAmount") && $("osPid") && /ما في استرجاع إذا كان غلط/.test($("osPidHint").textContent), "it shows the price, his balance and the balance after buying; no payment methods (he pays from the balance); a Player ID box with the no-refund warning");
    h.unit("pts").click(); await sleep(20); ok(/920 نقطة/.test($("osPrice").textContent) && /12,500 نقطة/.test($("osBal").textContent) && /11,580 نقطة/.test($("osAfter").textContent), "switching to points while the sheet is open converts what it shows"); h.unit("usd").click(); await sleep(20);
    const nOrd = () => h.count("/store/order");
    h.type($("osPid"), "12"); $("osSubmit").click(); await sleep(20); ok(/معرّف اللاعب .* بشكل صحيح/.test($("osMsg").textContent) && nOrd() === 0, "a short Player ID is refused on the screen, nothing is sent");
    h.type($("osPid"), "<b>12</b>34"); $("osSubmit").click(); await sleep(20); ok(nOrd() === 0, "so is an ID with symbols");
    h.fail["/store/order"] = { error: "too_many_open", message: "عندك 10 طلبات قيد التنفيذ. استنى لحد ما ننفّذهم قبل ما تطلب غيرهم." };
    h.type($("osPid"), "5123456789"); $("osSubmit").click(); await sleep(80);
    ok(/عندك 10 طلبات قيد التنفيذ/.test($("osMsg").textContent) && !$("osSubmit").disabled && $("osPid").value === "5123456789", "a refusal from the server is shown, the button works again and his ID is still there");
    const rid1 = h.last("/store/order").body.reqId;
    $("osSubmit").click(); $("osSubmit") && $("osSubmit").click(); await sleep(150);
    const sent = h.calls.filter(c => c.u === "/store/order"), b1 = sent[1].body;
    ok(sent.length === 2 && b1.itemId === "n1" && b1.playerId === "5123456789" && !("methodId" in b1) && /^r[0-9a-f]{24}$/.test(b1.reqId) && b1.reqId === rid1, "pressing it twice quickly sends ONE request (no payment method in it); a retry after an error reuses the same request id (so he can never be charged twice)");
    ok($("osTitle").textContent === "طلبك T-1001" && $("osStatus").textContent === "قيد التنفيذ" && /تم طلبك ✅ قيد التنفيذ/.test($("osFinal").textContent) && /Player ID: 5123456789/.test($("osBody").textContent) && /السعر: \$0\.92 · انخصم من رصيدك/.test($("osBody").textContent) && /رصيدك هلق: \$11\.58/.test($("osNewBal").textContent), "after buying: the order code, 'in progress', the price that left his balance and the new balance");
    ok(!$("osRef") && !$("osSend") && !$("osCancel") && !$("osPayAmount") && !$("osAccount"), "no payment form, no account to pay and no cancel (it is already paid from the balance)");
    ok($("walAmount").textContent === "$11.58" && $("walAlt").textContent === "11,580 نقطة", "the balance in the top bar is already updated");
    $("osDone").click(); ok($("osheet").hidden && !lock(h) && h.d.activeElement === h.orderBtn("n1"), "closing returns focus to the button he pressed and unlocks scrolling");

    /* ---- not enough balance ---- */
    h.balance = 0.5; await h.refreshNow?.(); h.orderBtn("n2").click(); await sleep(150);
    ok(/ناقصك \$8\.76/.test($("osShort").textContent) && $("osShort").getAttribute("role") === "alert" && !$("osSubmit") && !!$("osTopup") && /رصيدك: \$0\.50/.test($("osBal").textContent) && !$("osAfter"), "with a short balance: 'you are $8.76 short', no confirm button, and a 'top up' button instead");
    $("osTopup").click(); await sleep(150);
    ok($("osTitle").textContent === "شحن الرصيد" && $("tqAmount").value === "9" && /= 9,000 نقطة/.test($("tqPts").textContent) && h.last("/store/topup/quote").body.amountUsd === 9, "the top-up opens with the missing amount rounded up ($8.76 becomes $9)");
    h.key("Escape");
  }
  /* ---- a tiny shortfall rounds up to the minimum deposit; an order that loses the race ---- */
  { const h = open({ balance: 9 }); await sleep(60); await h.signIn(); h.orderBtn("n2").click(); await sleep(120); ok(/ناقصك \$0\.26/.test(h.$("osShort").textContent), "(short by $0.26)"); h.$("osTopup").click(); await sleep(120); ok(h.$("tqAmount").value === "5", "a tiny shortfall opens the deposit at the minimum ($5), never below it"); h.key("Escape");
    h.balance = 12; h.orderBtn("n1").click(); await sleep(120); h.type(h.$("osPid"), "5123456789"); h.balance = 0.1; h.$("osSubmit").click(); await sleep(120);
    ok(/اشحن رصيدك أول/.test(h.$("osMsg").textContent) && /ناقصك/.test(h.$("osShort").textContent) && !h.$("osSubmit") && !!h.$("osTopup") && h.$("walAmount").textContent === "$0.10", "if his balance dropped while the sheet was open, the server's answer switches the sheet to 'top up' and updates the top bar"); h.key("Escape"); }

  /* ---- topping up ---- */
  { const h = open({ balance: 3 }); await sleep(60); await h.signIn(); const $ = h.$;
    h.$("btnTopup").focus(); h.$("btnTopup").click(); await sleep(150);
    ok(!$("osheet").hidden && $("osTitle").textContent === "شحن الرصيد" && $("tqAmount").value === "10" && /= 10,000 نقطة/.test($("tqPts").textContent) && lock(h) && /استرجاعه نقداً بيتم بطلب وبقرار الإدارة/.test($("osBody").textContent), "'top up' opens the sheet at $10, shows the equivalent in points, and says cash refunds are by request");
    ok([...$("osBody").querySelectorAll("[data-preset]")].map(b => b.textContent).join("|") === "$10|$25|$50|$100", "ready amounts: $10, $25, $50, $100");
    ok(h.last("/store/topup/quote").body.amountUsd === 10 && h.last("/store/topup/quote").auth === "Bearer TOKEN", "it asks the server for the amount to transfer");
    const chips = [...$("osBody").querySelectorAll("[data-mid]")];
    ok(chips.map(c => c.textContent).join("|") === "شام كاش|USDT" && chips[0].getAttribute("aria-checked") === "true" && $("tqAmountDue").textContent === "1,425 ل.س", "payment methods as buttons, the first selected, with exactly what he must transfer (1,425 ل.س)");
    chips[1].click(); ok($("tqAmountDue").textContent === "10.15 USDT" && $("osBody").querySelectorAll("[data-mid]")[1].getAttribute("aria-checked") === "true", "another method changes the amount (10.15 USDT)"); $("osBody").querySelectorAll("[data-mid]")[0].click();
    const q0 = h.count("/store/topup/quote"); h.type($("tqAmount"), "2"); await sleep(450);
    ok(/من \$5\.00 لـ\$1,000\.00/.test($("tqRange").textContent) && !$("tqSubmit") && h.count("/store/topup/quote") === q0 && /= 2,000 نقطة/.test($("tqPts").textContent), "an amount below the minimum: a range warning, no confirm button, nothing asked from the server");
    h.type($("tqAmount"), "2000"); await sleep(450); ok(/من \$5\.00 لـ\$1,000\.00/.test($("tqRange").textContent), "and above the maximum");
    h.type($("tqAmount"), "7"); h.type($("tqAmount"), "75"); await sleep(450); ok(h.count("/store/topup/quote") === q0 + 1 && h.last("/store/topup/quote").body.amountUsd === 75 && $("tqAmountDue").textContent === "10,688 ل.س" && $("tqAmount").value === "75", "typing waits a moment and asks once (75 x 142.5 = 10,688 ل.س); his typing is never interrupted");
    $("osBody").querySelector('[data-preset="25"]').click(); await sleep(120); ok($("tqAmount").value === "25" && h.last("/store/topup/quote").body.amountUsd === 25 && $("tqAmountDue").textContent === "3,563 ل.س", "a ready amount fills the box and recalculates ($25 = 3,563 ل.س)");
    h.unit("pts").click(); await sleep(20); ok($("tqAmount").value === "25" && $("osTitle").textContent === "شحن الرصيد" && /= 25,000 نقطة/.test($("tqPts").textContent), "switching the unit does not reset the sheet"); h.unit("usd").click(); await sleep(20);
    h.fail["/store/topup"] = { error: "too_many_open", message: "عندك 3 إيداعات مفتوحة. خلّصهم أو ألغي واحد قبل ما تعمل غيرهم." }; $("tqSubmit").click(); await sleep(80);
    ok(/عندك 3 إيداعات مفتوحة/.test($("osMsg").textContent) && !$("tqSubmit").disabled && $("tqAmount").value === "25", "a refusal is shown and nothing is lost");
    const rid1 = h.last("/store/topup").body.reqId; $("tqSubmit").click(); $("tqSubmit") && $("tqSubmit").click(); await sleep(150); const tsent = h.calls.filter(c => c.u === "/store/topup");
    ok(tsent.length === 2 && tsent[1].body.amountUsd === 25 && tsent[1].body.methodId === "sham" && tsent[1].body.reqId === rid1 && typeof tsent[1].body.amountUsd === "number", "pressing it twice sends ONE request; a retry reuses the same request id");

    /* ---- the payment step ---- */
    ok($("osTitle").textContent === "إيداعك D-1001" && /بيزيد رصيدك: \$25\.00/.test($("osBody").textContent) && /المبلغ المطلوب: 3,563 ل\.س \(عبر شام كاش\)/.test($("osBody").textContent) && $("osStatus").textContent === "بانتظار الدفع" && !/Player ID/.test($("osBody").textContent), "after confirming: 'your deposit D-1001', what it adds to his balance and what to transfer; no Player ID");
    ok($("osPayAmount").textContent === "3,563 ل.س" && $("osAccount").textContent === "0932000000" && /حوّل وانسخ رقم العملية <b>x<\/b>/.test($("osInstr").textContent) && $("osInstr").querySelector("b") === null && /السعر مضمون لمدة 30 دقيقة/.test($("osTimer").textContent) && /واذكر رقم الإيداع D-1001/.test($("osBody").textContent), "the exact amount, the account, your instructions as plain text, a price countdown, and a reminder to mention the deposit code");
    $("osBody").querySelector("[data-copy]").click(); await sleep(30); ok(h.copied === "0932000000" && /تم النسخ/.test($("osBody").querySelector("[data-copy]").textContent), "the copy button copies the account");
    h.clipFail = true; $("osBody").querySelector("[data-copy]").click(); await sleep(30); h.clipFail = false; ok(/انسخ يدوياً|تم النسخ/.test($("osBody").querySelector("[data-copy]").textContent), "if the phone refuses to copy it says so (no crash)");
    /* proof */
    const np = () => h.count("/store/order/proof");
    $("osSend").click(); await sleep(20); ok(/اكتب رقم العملية أو ارفق صورة الإيصال/.test($("osMsg").textContent) && np() === 0, "sending with nothing is refused on the screen");
    h.type($("osRef"), "TX-998877"); h.pick(h.file("text/plain")); await sleep(40); ok(/اختار صورة/.test($("osMsg").textContent) && !$("osPreview"), "a file that is not a picture is refused");
    h.big = true; h.pick(h.file("image/png")); await sleep(40); ok(/كبيرة كتير/.test($("osMsg").textContent), "a picture that stays too big after shrinking is refused");
    h.big = false; h.canvas = []; h.pick(h.file("image/jpeg")); await sleep(60); ok(h.canvas[0].w === 1000 && h.canvas[0].h === 750 && $("osPreview") && /^data:image\/webp/.test($("osPreview").src) && $("osRef").value === "TX-998877", "a receipt picture is shrunk (1600x1200 becomes 1000x750), compressed and previewed, and his reference is kept");
    $("osImgDel").click(); ok(!$("osPreview"), "'delete picture' removes it"); h.pick(h.file("image/png")); await sleep(60); $("osSend").click(); await sleep(120); const pb = h.last("/store/order/proof").body;
    ok(pb.orderId === "d1" && pb.ref === "TX-998877" && /^data:image\/webp/.test(pb.image) && h.last("/store/order/proof").auth === "Bearer TOKEN", "sending: the deposit, the reference and the picture, with his token");
    ok($("osStatus").textContent === "دفعك قيد المراجعة" && /وصلنا دفعك \(TX-998877\)/.test($("osWaiting").textContent) && /وصلنا إيصالك/.test($("osMsg").textContent) && !$("osCancel") && !!$("osRef"), "then: 'payment under review' with his reference, a thank-you, no cancel button, and he can still add another receipt");
    h.balance = 28; h.orders[0].status = "done"; $("osRefresh").click(); await sleep(150);
    ok($("osStatus").textContent === "تم التنفيذ ✅" && /تم شحن رصيدك ✅/.test($("osFinal").textContent) && !$("osRef") && h.$("walAmount").textContent === "$28.00", "when you confirm the deposit, a refresh shows 'balance topped up' and the top bar already shows the new balance ($28)");
    h.key("Escape"); ok($("osheet").hidden && !lock(h) && h.d.activeElement === h.$("btnTopup"), "Escape closes the sheet and returns focus to the button he pressed");
    /* cancel an unpaid deposit */
    h.$("btnTopup").click(); await sleep(150); h.$("tqSubmit").click(); await sleep(150);
    h.confirmAnswer = false; h.$("osCancel").click(); await sleep(30); ok(!h.calls.some(c => c.u === "/store/order/cancel"), "'cancel the deposit' asks first");
    h.confirmAnswer = true; h.$("osCancel").click(); await sleep(100); ok(h.last("/store/order/cancel").body.orderId === "d1" || h.last("/store/order/cancel").body.orderId.length > 0, "confirming cancels it"); ok(h.$("osStatus").textContent === "ملغى" && /ألغيت هالإيداع/.test(h.$("osFinal").textContent), "and says so");
  }
  /* ---- deposit edge cases ---- */
  { const h = open(); await sleep(60); await h.signIn(); h.$("btnTopup").click(); await sleep(150); h.fail["/store/topup/quote"] = { error: "bad_amount", message: "مبلغ الإيداع من 5$ لـ1000$.", keep: true }; h.type(h.$("tqAmount"), "30"); await sleep(450);
    ok(/مبلغ الإيداع من 5\$ لـ1000\$/.test(h.$("osMsg").textContent) && /ما في طرق دفع متاحة/.test(h.$("tqNoMethods").textContent) && !h.$("tqSubmit"), "if the quote fails the sheet says so and offers no confirm button"); h.key("Escape"); }
  { const h = open(); await sleep(60); await h.signIn(); h.$("btnTopup").click(); await sleep(150); const f = [...h.$("osheet").querySelectorAll("button, input")]; f[f.length - 1].focus(); h.key("Tab"); ok(h.$("osheet").contains(h.d.activeElement), "Tab never leaves the sheet"); h.key("Tab", { shiftKey: true }); ok(h.$("osheet").contains(h.d.activeElement), "nor does Shift+Tab"); h.$("scrim2").click(); ok(h.$("osheet").hidden, "tapping the dark layer closes it"); }
  { const h = open(); await sleep(60); await h.signIn(); h.$("btnTopup").click(); await sleep(150); h.authCb(null); await sleep(40); ok(h.$("osheet").hidden && !h.$("btnTopup"), "signing out while the sheet is open closes it and removes the balance"); }
  { const h = open(); await sleep(60); h.$ && h.d.querySelector(".cta"); h.unit("pts").click(); await sleep(20); h.orderBtn("n1").click(); await sleep(30); ok(!h.$("drawer").hidden && /سجّل دخول عشان تطلب/.test(h.$("accMsg").textContent), "signed out, points mode: the order button still asks him to sign in"); }

  /* ---- my orders ---- */
  { const h = open({ orders: [mkOrder(), mkTop({ id: "d2", code: "D-1002", status: "done", priceUsd: 50 }), mkOrder({ id: "o3", code: "T-0999", status: "rejected", rejectReason: "wrong ID" }), mkTop({ id: "d4", code: "D-1000", status: "expired" }), mkOrder({ id: "o5", code: "T-0998", status: "done", itemName: "660 UC", priceUsd: 9.26 })] }); await sleep(60); await h.signIn(); h.$("btnMenu").click();
    const rows = [...h.d.querySelectorAll("#myOrders .myrow")];
    ok(rows.length === 5 && /T-1001/.test(rows[0].textContent) && /قيد التنفيذ/.test(rows[0].textContent) && /60 UC · \$0\.92/.test(rows[0].textContent) && /D-1002/.test(rows[1].textContent) && /إيداع رصيد · \$50\.00/.test(rows[1].textContent) && /تم التنفيذ/.test(rows[1].textContent) && /مرفوض/.test(rows[2].textContent) && /انتهت صلاحيته/.test(rows[3].textContent), "the side panel lists 'my orders' (purchases and deposits) with code, state and amount");
    ok(h.$("accBalance").textContent === "$12.50" && !!h.$("btnDrTopup"), "the panel also shows the balance and a 'top up' button");
    h.$("btnRefreshOrders").click(); await sleep(100);
    h.d.querySelectorAll("#myOrders .myrow")[2].click(); await sleep(60); ok(h.$("drawer").hidden && !h.$("osheet").hidden && /انرفض طلبك\. السبب: wrong ID ورجع المبلغ لرصيدك/.test(h.$("osFinal").textContent), "tapping a rejected order shows the reason and that the money went back to his balance");
    h.$("osDone").click(); h.$("btnMenu").click(); h.d.querySelectorAll("#myOrders .myrow")[1].click(); await sleep(60); ok(/تم شحن رصيدك/.test(h.$("osFinal").textContent) && !h.$("osRef"), "a confirmed deposit says 'balance topped up'");
    h.$("osDone").click(); h.$("btnMenu").click(); h.d.querySelectorAll("#myOrders .myrow")[3].click(); await sleep(60); ok(/انتهت صلاحية هالإيداع/.test(h.$("osFinal").textContent), "an expired deposit says why");
    h.$("osDone").click(); h.$("btnMenu").click(); h.d.querySelectorAll("#myOrders .myrow")[0].click(); await sleep(60); ok(/قيد التنفيذ/.test(h.$("osFinal").textContent) && !h.$("osSend") && !h.$("osCancel"), "an order in progress shows its state, with nothing to pay or cancel");
    h.$("osDone").click(); h.orders = [mkTop({ id: "d9", code: "D-0990" })]; h.$("btnMenu").click(); h.$("btnRefreshOrders").click(); await sleep(100); h.d.querySelectorAll("#myOrders .myrow")[0].click(); await sleep(60); ok(!!h.$("osPayAmount") && !!h.$("osSend") && !!h.$("osCancel"), "an unpaid deposit opens the payment instructions again, so he can pay later"); h.key("Escape"); }
  { const h = open(); await sleep(60); await h.signIn(); h.$("btnMenu").click(); ok(/ما عندك طلبات بعد/.test(h.$("myEmpty").textContent), "no orders yet says so"); }
  { const h = open(); await sleep(60); h.fail["/store/orders"] = { error: "x", message: "x", keep: true, status: 500 }; await h.signIn(); h.$("btnMenu").click(); ok(/تعذّر تحميل طلباتك/.test(h.$("myError").textContent), "a failure loading orders is shown"); delete h.fail["/store/orders"]; h.$("btnRefreshOrders").click(); await sleep(100); ok(!!h.$("myEmpty"), "and 🔄 reloads them"); }
  { const h = open(); await sleep(60); await h.signIn(); h.fail["/store/quote"] = { error: "no_item", message: "هالمنتج مو متوفر هلق.", status: 404 }; h.orderBtn("n1").click(); await sleep(100); ok(/هالمنتج مو متوفر هلق/.test(h.$("osError").textContent) && h.$("osError").getAttribute("role") === "alert", "if the product is no longer available the sheet says so"); h.$("osDone").click(); ok(h.$("osheet").hidden, "and closes"); }
  ok(!/innerHTML|document\.write|eval\(/.test(html0), "no raw HTML insertion anywhere");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
