// اختبارات صفحة المتجر للزبون: إيداع USDT بالتأكيد التلقائي (ملاحظة المبلغ بالضبط، رقم العملية، متابعة حالة التحقق، والرجوع للمراجعة اليدوية)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_chain_ui.test.js
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
      if (u === "/store/topup" && h.topupFn) { const o2 = h.topupFn(body); h.orders = [o2, ...h.orders]; return R({ ok: true, order: o2 }); }
      if (u === "/store/topup") { const o2 = mkTop({ priceUsd: body.amountUsd, amount: body.methodId === "sham" ? Math.round(body.amountUsd * 142.5) : Math.round(body.amountUsd * 1.015 * 100) / 100, method: { ...METHOD, id: body.methodId, name: body.methodId === "sham" ? "شام كاش" : "USDT" } }); h.orders = [o2, ...h.orders]; return R({ ok: true, order: o2 }); }
      if (u === "/store/order/proof") { const o2 = h.orders.find(x => x.id === body.orderId); Object.assign(o2, { status: "payment_submitted", proof: { ref: body.ref || "", hasImage: !!body.image, submittedAt: Date.now(), late: false } }); if (h.proofHook) h.proofHook(o2, body); return R({ ok: true, order: o2 }); }
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
const AUTO = { id: "usdtb", name: "USDT BEP20", currency: "USDT", decimals: 4, account: "0x" + "ab".repeat(20), instructions: "", autoVerify: "bep20" };
const mkAuto = (o) => (b) => mkTop({ priceUsd: b.amountUsd, amount: 10.0137, method: { ...AUTO, ...(o || {}) } });
const openDeposit = async (h, mid) => { h.$("btnTopup").click(); await sleep(250); const pick = h.d.querySelector(`#osBody [data-mid="${mid}"]`); if (pick) pick.click(); await sleep(50); h.$("tqSubmit").click(); await sleep(250); };
(async () => {
  const mk = async (opts) => { const h = open(opts); await sleep(60); await h.signIn(); h.w.__chainPollMs = 80; return h; };
  /* ---- before sending: what to do ---- */
  { const h = await mk(); h.topupFn = mkAuto(); await openDeposit(h, "usdt"); const $ = h.$;
    ok($("osPayAmount") && $("osPayAmount").textContent === "10.0137 USDT" && $("osAccount").textContent === "0x" + "ab".repeat(20), "the screen shows the exact amount with four decimals (10.0137 USDT) and the address to pay");
    const note = $("osAutoNote"); ok(note && /⛓ تأكيد تلقائي على شبكة BEP20: حوّل 10\.0137 USDT بالضبط \(بكل الأرقام العشرية الأربعة، مو أقل ولا أكتر\) وعلى هالشبكة بس/.test(note.textContent) && /رسوم السحب/.test(note.textContent) && /خلال دقيقة تقريباً/.test(note.textContent) && note.querySelector("b").textContent === "10.0137 USDT", "a clear note: the exact amount (in bold), only on that network, paste the transaction number afterwards, and add the withdrawal fee if sending from an exchange");
    ok(/بعد التحويل: الصق رقم العملية \(TXID\)/.test(h.d.querySelector('label[for="osRef"]').textContent) && $("osRef").placeholder === "رقم العملية TXID (0x…)" && /صورة الإيصال \(اختياري\)/.test(h.d.querySelector('label[for="osFile"]').textContent), "the form asks for the transaction number first (with a hint of its shape) and makes the picture optional");
    h.topupFn = mkAuto({ autoVerify: "trc20", name: "USDT TRC20", account: "T" + "A".repeat(33) }); h.key("Escape"); await sleep(50); h.orders.forEach(o => { o.status = "cancelled"; }); await openDeposit(h, "usdt"); ok($("osRef").placeholder === "رقم العملية TXID (64 خانة)" && /TRC20/.test($("osAutoNote").textContent), "on TRC20 the note and the hint say TRC20 and a 64-character number"); h.key("Escape"); }
  { const h = await mk(); await openDeposit(h, "sham"); const $ = h.$; ok(!$("osAutoNote") && /بعد التحويل: أرسل الإيصال/.test(h.d.querySelector('label[for="osRef"]').textContent), "a normal method looks exactly as before (no automatic note, 'send the receipt')"); h.key("Escape"); }
  /* ---- sending the number and watching it ---- */
  { const h = await mk(); h.topupFn = mkAuto(); h.proofHook = (o) => { o.chain = { state: "pending", confirmations: 4, need: 10 }; }; await openDeposit(h, "usdt"); const $ = h.$; const tx = "0x" + "1".repeat(64);
    h.type($("osRef"), tx); $("osSend").click(); await sleep(150);
    ok(h.last("/store/order/proof").body.ref === tx && /وصلنا رقم العملية ✅ عم نتحقق من الشبكة/.test($("osMsg").textContent || $("osOk") && $("osOk").textContent || h.d.getElementById("osheet").textContent) && /عم نتحقق من الشبكة\.\.\. التأكيدات 4 من 10/.test($("osChain").textContent) && /وصلنا رقم العملية \(0x1111111111…\)/.test($("osChain").textContent), "after sending, it says it is checking the network and shows the progress ('4 of 10 confirmations') with the start of the number");
    const n0 = h.count("/store/orders"); await sleep(300); ok(h.count("/store/orders") > n0, "it keeps asking for the status while waiting (a few times a second here; every 5 seconds in real life)");
    const dep = h.orders[0]; dep.chain = { state: "pending", confirmations: 8, need: 10 }; await sleep(250); ok(/التأكيدات 8 من 10/.test($("osChain").textContent), "the progress updates by itself (8 of 10)");
    dep.status = "done"; dep.chain = { state: "ok", confirmations: 11, need: 10 }; h.balance = 10; await sleep(300); ok($("osFinal") && $("osFinal").textContent === "تم شحن رصيدك ✅" && !$("osChain"), "when the network confirms, the screen turns into 'your balance was topped up ✅' by itself, with no button pressed");
    const n1 = h.count("/store/orders"); await sleep(400); ok(h.count("/store/orders") === n1, "and it stops asking (no endless polling)"); h.key("Escape"); }
  { const h = await mk(); h.topupFn = mkAuto(); h.proofHook = (o) => { o.chain = { state: "manual", confirmations: 0, need: 0 }; }; await openDeposit(h, "usdt"); const $ = h.$; h.type($("osRef"), "0x" + "2".repeat(64)); $("osSend").click(); await sleep(150);
    ok(/ما قدرنا نأكد الدفع تلقائياً\. الإدارة رح تراجعه وتبلّغك \(وبتقدر تصحّح رقم العملية تحت\)/.test($("osChain").textContent), "if it cannot confirm, the customer is told the admin will review it (and may correct the number)");
    const n = h.count("/store/orders"); await sleep(400); ok(h.count("/store/orders") === n, "no polling after it was handed to you"); h.key("Escape"); }
  { const h = await mk(); h.topupFn = mkAuto(); h.proofHook = (o) => { o.chain = { state: "retry", confirmations: 0, need: 0 }; }; await openDeposit(h, "usdt"); const $ = h.$; h.type($("osRef"), "0x" + "3".repeat(64)); $("osSend").click(); await sleep(150); ok(/عم نحاول نتصل بالشبكة/.test($("osChain").textContent), "if the network service is unreachable: 'trying to connect'"); h.key("Escape"); }
  { const h = await mk(); h.topupFn = mkAuto(); h.proofHook = () => {}; await openDeposit(h, "usdt"); const $ = h.$; h.type($("osRef"), "0x" + "4".repeat(64)); $("osSend").click(); await sleep(150); ok(/عم نتحقق من الشبكة\.\.\.$/.test($("osChain").textContent.trim()) || /عم نتحقق من الشبكة/.test($("osChain").textContent), "before the first result it simply says it is checking");
    h.key("Escape"); await sleep(60); const n = h.count("/store/orders"); await sleep(400); ok(h.count("/store/orders") === n, "closing the window stops the polling"); }
  { const h = await mk(); h.topupFn = mkAuto(); h.proofHook = (o) => { o.chain = { state: "pending", confirmations: 1, need: 10 }; }; await openDeposit(h, "usdt"); const $ = h.$; h.type($("osRef"), "0x" + "5".repeat(64)); $("osSend").click(); await sleep(150); const a = h.count("/store/orders"); await sleep(2500); const b = h.count("/store/orders") - a; ok(b <= 16 && b >= 10, "if it never finishes, the polling gives up after 15 tries (here " + b + " calls) instead of running forever"); h.key("Escape"); }
  { const h = await mk(); await openDeposit(h, "sham"); const $ = h.$; h.type($("osRef"), "TX123"); $("osSend").click(); await sleep(150); ok(/وصلنا إيصالك ✅ رح نراجعه ونبلّغك/.test(h.d.getElementById("osheet").textContent) && !$("osChain") && !!$("osWaiting"), "a normal method after sending: the old wording and no polling"); const n = h.count("/store/orders"); await sleep(300); ok(h.count("/store/orders") === n, "(no polling)"); h.key("Escape"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
