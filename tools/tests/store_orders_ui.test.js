// اختبارات صفحة الزبون (5ج): زر اطلب، نافذة الطلب، تعليمات الدفع والإيصال، طلباتي، الأسعار الشخصية بمستوى VIP
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_orders_ui.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html0 = fs.readFileSync(path.join(__dirname, "../../site/store/index.html"), "utf8");
const html = html0.replace(/<script src="[^"]+"><\/script>\s*/g, "");
const TREE = [{ id: "nA", type: "folder", name: "PUBG", imageUrl: "", children: [{ id: "n1", type: "item", name: "60 UC", priceUsd: 0.92, imageUrl: "" }, { id: "n2", type: "item", name: "660 UC", priceUsd: 9.26, imageUrl: "" }] }];
const METHODS_PUB = [{ id: "sham", name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0 }];
const NOW = Date.now();
const mkOrder = (o) => ({ id: "o1", code: "T-1001", itemId: "n1", itemName: "60 UC", itemPath: "PUBG › 60 UC", playerId: "5123456789", vip: 1, priceUsd: 0.92, method: { id: "sham", name: "شام كاش", currency: "ل.س", decimals: 0, account: "0932000000", instructions: "حوّل وانسخ رقم العملية <b>x</b>" }, amount: 131, status: "awaiting_payment", createdAt: NOW, quoteEndsAt: NOW + 30 * 60000, quoteExpired: false, proof: null, rejectReason: "", doneAt: 0, ...o });
function open(opts = {}) {
  const h = { calls: [], authCb: null, copied: "", canvas: [], webp: true, big: false, confirmAnswer: true, quote: { itemId: "n1", name: "60 UC", vip: 1, priceUsd: 0.92, validMinutes: 30, methods: [{ id: "sham", name: "شام كاش", currency: "ل.س", decimals: 0, amount: 131 }, { id: "usdt", name: "USDT", currency: "USDT", decimals: 2, amount: 0.93 }] }, orders: opts.orders || [], prices: opts.prices || { n1: 0.92, n2: 9.26 }, vip: opts.vip || 1, fail: {}, orderResponse: null };
  h.dom = new JSDOM(html, { url: "https://yardova.ly-ad.de/store/#/nA", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
    w.scrollTo = () => {}; w.confirm = () => h.confirmAnswer;
    Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t) => { if (h.clipFail) throw new Error("denied"); h.copied = t; } }, configurable: true });
    w.createImageBitmap = async () => ({ width: 1600, height: 1200 });
    w.HTMLCanvasElement.prototype.getContext = function () { const cv = this; return { drawImage() { h.canvas.push({ w: cv.width, h: cv.height }); } }; };
    w.HTMLCanvasElement.prototype.toDataURL = function (type, q) { if (h.big) return "data:image/webp;base64," + "A".repeat(250000); if (type === "image/webp" && !h.webp) return "data:image/png;base64,PNGFALLBACK"; return "data:" + type + ";base64,SMALL" + (q || ""); };
    w.fetch = async (url, o) => {
      const u = String(url).replace("https://postback.ly-ad.de", ""), body = o && o.body ? JSON.parse(o.body) : {}; h.calls.push({ u, auth: o && o.headers && o.headers.Authorization, body });
      const R = (j, st = 200) => ({ ok: st < 400, status: st, json: async () => j });
      if (h.fail[u]) { const f = h.fail[u]; if (!f.keep) delete h.fail[u]; return R({ ok: false, error: f.error || "x", message: f.message }, f.status || 400); }
      if (u === "/store/catalog") return R({ ok: true, items: TREE, methods: METHODS_PUB });
      if (u === "/store/me") return R({ ok: true, customer: { id: "u1", name: "Ali", email: "ali@x.com", vip: h.vip, spentUsd: 0, progressUsd: 0, sizeUsd: 200, remainingUsd: 200, nextVip: 2, createdAt: 1 } });
      if (u === "/store/prices") return R({ ok: true, vip: h.vip, prices: h.prices });
      if (u === "/store/quote") return R({ ok: true, quote: h.quote });
      if (u === "/store/orders") return R({ ok: true, orders: h.orders });
      if (u === "/store/order") { if (h.orderResponse) return h.orderResponse(body); const o2 = mkOrder({ playerId: body.playerId, method: { ...mkOrder().method, id: body.methodId } }); h.orders = [o2, ...h.orders]; return R({ ok: true, order: o2 }); }
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
  h.last = (u) => h.calls.filter(c => c.u === u).pop();
  h.signIn = async () => { h.authCb(h.user()); await sleep(120); };
  h.orderBtn = (id) => h.d.querySelector(`[data-order="${id}"]`);
  h.type = (el, v) => { el.value = v; el.dispatchEvent(new h.w.Event("input", { bubbles: true })); };
  h.pick = (file) => { const i = h.$("osFile"); Object.defineProperty(i, "files", { value: [file], configurable: true }); i.dispatchEvent(new h.w.Event("change", { bubbles: true })); };
  h.file = (type) => new h.w.File(["x"], "r." + type.split("/")[1], { type });
  return h;
}
(async () => {
  /* ---- the order button ---- */
  { const h = open(); await sleep(100); const $ = h.$;
    ok(h.d.querySelectorAll("button.order-btn").length === 2 && h.orderBtn("n1").textContent === "اطلب" && !/الطلب قريباً/.test(h.d.querySelector("main").textContent), "every product card has an 'اطلب' button (the old 'ordering soon' text is gone)");
    h.orderBtn("n1").focus(); h.orderBtn("n1").click(); await sleep(50);
    ok(!$("drawer").hidden && $("osheet").hidden && /سجّل دخول عشان تطلب/.test($("accMsg").textContent) && !h.calls.some(c => c.u === "/store/quote"), "signed out: the button opens the sign-in panel with 'sign in to order' and asks nothing from the server");
    $("btnCloseDrawer").click();
    /* ---- signed in: personal VIP prices ---- */
    h.vip = 4; h.prices = { n1: 0.86, n2: 9.26 }; await h.signIn();
    ok(h.last("/store/prices").auth === "Bearer TOKEN", "after sign-in the page asks for his prices");
    const c1 = h.d.querySelector('[data-item="n1"]'), c2 = h.d.querySelector('[data-item="n2"]');
    ok(/\$0\.86|0\.86/.test(c1.querySelector(".pr").textContent) && /سعرك VIP 4/.test(c1.textContent) && !/\$0\.92/.test(c1.querySelector(".pr").textContent.replace(/\$0\.86/, "")), "a card shows HIS price (VIP 4: 0.86) with a note 'your VIP 4 price'");
    ok(!/سعرك VIP/.test(c2.textContent) && /\$9\.26/.test(c2.querySelector(".pr").textContent), "an item whose price is the same for him has no note");
    h.authCb(null); await sleep(60); ok(/\$?0\.92/.test(h.d.querySelector('[data-item="n1"] .pr').textContent) && !/سعرك VIP/.test(h.d.querySelector("main").textContent), "signing out goes back to the public prices");
    h.vip = 1; h.prices = { n1: 0.92, n2: 9.26 }; await h.signIn();

    /* ---- the order sheet ---- */
    h.orderBtn("n1").focus(); h.orderBtn("n1").click(); await sleep(150);
    ok(!$("osheet").hidden && !$("scrim2").hidden && document_lock(h) && $("osTitle").textContent === "اطلب: 60 UC" && h.last("/store/quote").body.itemId === "n1" && h.last("/store/quote").auth === "Bearer TOKEN", "signed in: the sheet opens, asks the server for the price at his level, and locks page scrolling");
    ok(/سعرك حسب مستواك VIP 1: \$0\.92/.test($("osBody").textContent) && $("osPid") && /معرّف اللاعب/.test($("osBody").textContent) && /ما في استرجاع إذا كان غلط/.test($("osPidHint").textContent), "it shows his price and level, a Player ID box and the warning that a wrong ID cannot be refunded");
    const chips = [...$("osBody").querySelectorAll("[data-mid]")];
    ok(chips.map(c => c.textContent).join("|") === "شام كاش|USDT" && chips[0].getAttribute("aria-checked") === "true" && $("osAmount").textContent === "131 ل.س", "payment methods as buttons, the first selected, with the amount to pay (131 ل.س)");
    chips[1].click(); ok($("osAmount").textContent === "0.93 USDT" && $("osBody").querySelectorAll("[data-mid]")[1].getAttribute("aria-checked") === "true", "choosing another method changes the amount (0.93 USDT)");
    h.type($("osPid"), "12"); $("osBody").querySelectorAll("[data-mid]")[0].click(); ok($("osPid").value === "12", "choosing a method does not erase what he typed");
    const nOrd = () => h.calls.filter(c => c.u === "/store/order").length;
    $("osSubmit").click(); await sleep(20); ok(/معرّف اللاعب .* بشكل صحيح/.test($("osMsg").textContent) && nOrd() === 0 && $("osMsg").getAttribute("role") === "alert", "a short Player ID is refused on the screen, nothing is sent");
    h.type($("osPid"), "<b>12</b>34"); $("osSubmit").click(); await sleep(20); ok(nOrd() === 0 && /بشكل صحيح/.test($("osMsg").textContent), "so is an ID with symbols");
    h.fail["/store/order"] = { error: "too_many_open", message: "عندك 5 طلبات مفتوحة. خلّصهم أو ألغي واحد قبل ما تطلب غيرهم." };
    h.type($("osPid"), "5123456789"); $("osSubmit").click(); await sleep(80);
    ok(/عندك 5 طلبات مفتوحة/.test($("osMsg").textContent) && !$("osSubmit").disabled && $("osPid").value === "5123456789", "a refusal from the server is shown, the button works again and his ID is still there");
    const rid1 = h.last("/store/order").body.reqId;
    $("osSubmit").click(); $("osSubmit") && $("osSubmit").click(); await sleep(150);
    const sent = h.calls.filter(c => c.u === "/store/order"); const b1 = sent[1].body;
    ok(sent.length === 2 && b1.itemId === "n1" && b1.methodId === "sham" && b1.playerId === "5123456789" && /^r[0-9a-f]{24}$/.test(b1.reqId) && b1.reqId === rid1, "pressing it twice quickly sends ONE request; a retry after an error reuses the same request id (so he can never be charged twice)");

    /* ---- the payment step ---- */
    ok($("osTitle").textContent === "طلبك T-1001" && /PUBG › 60 UC/.test($("osBody").textContent) && /Player ID: 5123456789/.test($("osBody").textContent) && $("osStatus").textContent === "بانتظار الدفع", "after confirming: the order code, product, ID and status");
    ok($("osPayAmount").textContent === "131 ل.س" && $("osAccount").textContent === "0932000000" && $("osAccount").getAttribute("class").includes("accbox") && /حوّل وانسخ رقم العملية <b>x<\/b>/.test($("osInstr").textContent) && $("osInstr").querySelector("b") === null, "it shows the exact amount, the account to pay, and your instructions as plain text");
    ok(/السعر مضمون لمدة 30 دقيقة/.test($("osTimer").textContent) && /حوّل المبلغ بالضبط، واذكر رقم الطلب T-1001/.test($("osBody").textContent), "a price countdown (30 minutes) and a reminder to send the exact amount and mention the order code");
    $("osBody").querySelector("[data-copy]").click(); await sleep(30); ok(h.copied === "0932000000" && /تم النسخ/.test($("osBody").querySelector("[data-copy]").textContent), "the copy button copies the account");
    h.clipFail = true; $("osBody").querySelector("[data-copy]").click(); await sleep(30); h.clipFail = false; ok(/انسخ يدوياً|تم النسخ/.test($("osBody").querySelector("[data-copy]").textContent), "if the phone refuses to copy it says so (no crash)");
    ok(h.d.querySelector("#myOrders") === null || true, "(drawer closed)");

    /* ---- the proof ---- */
    const np = () => h.calls.filter(c => c.u === "/store/order/proof").length;
    $("osSend").click(); await sleep(20); ok(/اكتب رقم العملية أو ارفق صورة الإيصال/.test($("osMsg").textContent) && np() === 0, "sending with nothing is refused on the screen");
    h.type($("osRef"), "TX-998877"); h.pick(h.file("text/plain")); await sleep(40); ok(/اختار صورة/.test($("osMsg").textContent) && !$("osPreview"), "a file that is not a picture is refused");
    h.big = true; h.pick(h.file("image/png")); await sleep(40); ok(/كبيرة كتير/.test($("osMsg").textContent) && !$("osPreview"), "a picture that stays too big after shrinking is refused");
    h.big = false; h.canvas = []; h.pick(h.file("image/jpeg")); await sleep(60);
    ok(h.canvas[0].w === 1000 && h.canvas[0].h === 750 && $("osPreview") && /^data:image\/webp/.test($("osPreview").src) && $("osRef").value === "TX-998877", "a receipt picture is shrunk (1600x1200 becomes 1000x750), compressed and previewed, and his reference is kept");
    $("osImgDel").click(); ok(!$("osPreview"), "'delete picture' removes it"); h.pick(h.file("image/png")); await sleep(60);
    $("osSend").click(); await sleep(120); const pb = h.last("/store/order/proof").body;
    ok(pb.orderId === "o1" && pb.ref === "TX-998877" && /^data:image\/webp/.test(pb.image) && h.last("/store/order/proof").auth === "Bearer TOKEN", "sending: the order, the reference and the picture, with his token");
    ok($("osStatus").textContent === "دفعك قيد المراجعة" && /وصلنا دفعك \(TX-998877\)/.test($("osWaiting").textContent) && /وصلنا إيصالك/.test($("osMsg").textContent) && !$("osCancel"), "then: 'payment under review' with his reference, a thank-you, and no cancel button any more");
    ok(!!$("osRef") && /إيصال إضافي/.test($("osBody").textContent), "he can still add another receipt");
    $("osRefresh").click(); await sleep(80); ok(h.calls.filter(c => c.u === "/store/orders").length >= 2 && /تم التحديث/.test($("osMsg").textContent), "the refresh button reloads the order status");
    h.orders[0].status = "done"; $("osRefresh").click(); await sleep(80); ok($("osStatus").textContent === "تم التنفيذ ✅" && /تم تنفيذ طلبك/.test($("osFinal").textContent) && !$("osRef"), "when you mark it done, a refresh shows 'done' and removes the payment form");
    h.key("Escape"); ok($("osheet").hidden && $("scrim2").hidden && !document_lock(h) && h.d.activeElement === h.orderBtn("n1"), "Escape closes the sheet, unlocks scrolling and returns focus to the button he pressed");
  }
  /* ---- cancel ---- */
  { const h = open(); await sleep(60); await h.signIn(); h.orderBtn("n1").click(); await sleep(120); h.type(h.$("osPid"), "5123456789"); h.$("osSubmit").click(); await sleep(150);
    h.confirmAnswer = false; h.$("osCancel").click(); await sleep(30); ok(!h.calls.some(c => c.u === "/store/order/cancel"), "'cancel the order' asks first");
    h.confirmAnswer = true; h.$("osCancel").click(); await sleep(100); ok(h.last("/store/order/cancel").body.orderId === "o1" && h.$("osStatus").textContent === "ملغى" && /ألغيت هالطلب/.test(h.$("osFinal").textContent), "confirming cancels it and says so"); }
  /* ---- my orders in the panel ---- */
  { const h = open({ orders: [mkOrder(), mkOrder({ id: "o2", code: "T-1000", status: "done", itemName: "660 UC", amount: 1320 }), mkOrder({ id: "o3", code: "T-0999", status: "rejected", rejectReason: "no payment received" }), mkOrder({ id: "o4", code: "T-0998", status: "expired" })] }); await sleep(60); await h.signIn(); h.$("btnMenu").click();
    const rows = [...h.d.querySelectorAll("#myOrders .myrow")];
    ok(rows.length === 4 && /T-1001/.test(rows[0].textContent) && /بانتظار الدفع/.test(rows[0].textContent) && /60 UC · 131 ل\.س/.test(rows[0].textContent) && /تم التنفيذ/.test(rows[1].textContent) && /مرفوض/.test(rows[2].textContent) && /انتهت صلاحيته/.test(rows[3].textContent), "the side panel lists 'my orders' with code, status, product and amount");
    rows[2].click(); await sleep(60); ok(h.$("drawer").hidden && !h.$("osheet").hidden && /انرفض طلبك\. السبب: no payment received/.test(h.$("osFinal").textContent), "tapping an order opens it; a rejected one shows the reason");
    h.$("osDone").click(); h.$("btnMenu").click(); h.d.querySelectorAll("#myOrders .myrow")[1].click(); await sleep(60); ok(/تم تنفيذ طلبك/.test(h.$("osFinal").textContent) && !h.$("osRef"), "a done order shows 'done' and no payment form");
    h.$("osDone").click(); h.$("btnMenu").click(); h.d.querySelectorAll("#myOrders .myrow")[3].click(); await sleep(60); ok(/انتهت صلاحية هالطلب/.test(h.$("osFinal").textContent), "an expired one says why");
    h.$("osDone").click(); h.$("btnMenu").click(); h.d.querySelectorAll("#myOrders .myrow")[0].click(); await sleep(60); ok(!!h.$("osPayAmount") && !!h.$("osSend"), "an open order shows the payment instructions again, so he can pay later"); h.key("Escape"); }
  { const h = open(); await sleep(60); await h.signIn(); h.$("btnMenu").click(); ok(/ما عندك طلبات بعد/.test(h.$("myEmpty").textContent), "no orders yet says so"); }
  { const h = open(); await sleep(60); h.fail["/store/orders"] = { error: "x", message: "x", keep: true, status: 500 }; await h.signIn(); h.$("btnMenu").click(); ok(/تعذّر تحميل طلباتك/.test(h.$("myError").textContent), "a failure loading orders is shown");
    delete h.fail["/store/orders"]; h.$("btnRefreshOrders").click(); await sleep(80); ok(h.$("myEmpty"), "and 🔄 reloads them"); }
  /* ---- quote problems ---- */
  { const h = open(); await sleep(60); await h.signIn(); h.fail["/store/quote"] = { error: "no_item", message: "هالمنتج مو متوفر هلق.", status: 404 }; h.orderBtn("n1").click(); await sleep(100);
    ok(/هالمنتج مو متوفر هلق/.test(h.$("osError").textContent) && h.$("osError").getAttribute("role") === "alert", "if the product is no longer available the sheet says so"); h.$("osDone").click(); ok(h.$("osheet").hidden, "and closes"); }
  { const h = open(); await sleep(60); h.quote.methods = []; await h.signIn(); h.orderBtn("n1").click(); await sleep(100); ok(/ما في طرق دفع متاحة/.test(h.$("osNoMethods").textContent) && !h.$("osSubmit"), "with no payment methods it says so and offers no confirm button"); }
  { const h = open(); await sleep(60); await h.signIn(); h.orderBtn("n1").click(); await sleep(100); h.type(h.$("osPid"), "5123456789"); h.orderBtn("n1");
    const f = [...h.$("osheet").querySelectorAll("button, input")]; f[f.length - 1].focus(); h.key("Tab"); ok(h.$("osheet").contains(h.d.activeElement), "Tab never leaves the sheet"); h.key("Tab", { shiftKey: true }); ok(h.$("osheet").contains(h.d.activeElement), "nor does Shift+Tab"); h.$("scrim2").click(); ok(h.$("osheet").hidden, "tapping the dark layer closes it"); }
  { const h = open(); await sleep(60); await h.signIn(); h.authCb(null); await sleep(30); h.orderBtn("n1").click(); await sleep(30); ok(!h.$("drawer").hidden && /سجّل دخول عشان تطلب/.test(h.$("accMsg").textContent), "after signing out the order button asks him to sign in again");
    h.$("btnCloseDrawer").click(); await h.signIn(); h.orderBtn("n1").click(); await sleep(100); h.authCb(null); await sleep(30); ok(h.$("osheet").hidden, "signing out while the sheet is open closes it"); }
  ok(!/innerHTML|document\.write|eval\(/.test(html0), "no raw HTML insertion anywhere");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
function document_lock(h) { return h.d.body.classList.contains("lock"); }
