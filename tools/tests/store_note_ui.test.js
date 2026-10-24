// اختبارات صفحة المتجر للزبون: ملاحظة المجلد (بأول صفحة المجلد وعلى شاشة الطلب)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_note_ui.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html0 = fs.readFileSync(path.join(__dirname, "../../site/store/index.html"), "utf8");
const html = html0.replace(/<script src="[^"]+"><\/script>\s*/g, "");
const NOTE = "لحسابات سيرفر MENA فقط. بعد الإرسال ما بيمكن الإلغاء.";
const TREE = [
  { id: "nA", type: "folder", name: "PUBG", imageUrl: "", note: NOTE, children: [{ id: "n1", type: "item", name: "60 UC", priceUsd: 0.92, imageUrl: "", note: "" }, { id: "n2", type: "item", name: "660 UC", priceUsd: 9.26, imageUrl: "", note: "البونص مرة وحدة." }, { id: "nS", type: "folder", name: "Sub", imageUrl: "", note: "", children: [{ id: "n3", type: "item", name: "Deep", priceUsd: 3, imageUrl: "", note: "" }] }] },
  { id: "nX", type: "folder", name: "Plain", imageUrl: "", children: [{ id: "n4", type: "item", name: "NoNote", priceUsd: 2, imageUrl: "" }] },
  { id: "nE", type: "folder", name: "Evil", imageUrl: "", note: "<img src=x onerror=alert(1)> <b>خطر</b>", children: [{ id: "n5", type: "item", name: "Evil item", priceUsd: 1, imageUrl: "" }] }];
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
(async () => {
  const mk = async (hash) => { const h = open({}); await sleep(60); await h.signIn(); await sleep(150); h.w.location.hash = hash; await sleep(150); return h; };
  /* ---- the folder page ---- */
  { const h = await mk("#/nA"); const n = h.$("folderNote");
    ok(n && n.classList.contains("notebox") && n.textContent === "ℹ️ " + NOTE && n.getAttribute("role") === "note" && n.closest("#catalog"), "a folder with a note shows it in a box at the top of its page");
    ok(!!h.d.querySelector('[data-item="n1"], [data-order="n1"]') && h.$("catalog").innerHTML.indexOf("folderNote") < h.$("catalog").innerHTML.indexOf("60 UC"), "(above its products)");
    h.w.location.hash = "#/nA/x"; await sleep(60); h.w.location.hash = "#/nS"; await sleep(150); ok(!h.$("folderNote"), "a sub-folder without a note shows none (the parent's note is not repeated there)");
    h.w.location.hash = "#/nX"; await sleep(150); ok(!h.$("folderNote"), "a folder without a note shows no box");
    h.w.location.hash = "#/"; await sleep(150); ok(!h.$("folderNote"), "the top of the shop shows no box");
    h.w.location.hash = "#/n2"; await sleep(150); ok(!!h.$("folderNote") && h.$("folderNote").textContent === "ℹ️ " + NOTE, "an address that points at a product shows its folder with the folder's note"); }
  /* ---- plain text only ---- */
  { const h = await mk("#/nE"); const n = h.$("folderNote"); ok(n && n.textContent === "ℹ️ <img src=x onerror=alert(1)> <b>خطر</b>" && !n.querySelector("img, b, script"), "a note is shown as plain text: no tag in it can run or style anything"); }
  /* ---- the order screen ---- */
  { const h = await mk("#/nA"); h.orderBtn("n1").click(); await sleep(250); const n = h.$("osNote");
    ok(n && n.textContent === "ℹ️ " + NOTE && n.closest("#osBody") && n.getAttribute("role") === "note", "the order screen of a product shows the nearest note: here its folder's");
    ok(h.$("osBody").innerHTML.indexOf("osNote") < h.$("osBody").innerHTML.indexOf("osPid"), "(above the Player ID box, so it is read before paying)");
    h.key("Escape"); await sleep(150); h.orderBtn("n2").click(); await sleep(250); ok(h.$("osNote").textContent === "ℹ️ البونص مرة وحدة.", "a product with its own note shows that one instead of the folder's");
    h.key("Escape"); await sleep(150); }
  { const h = await mk("#/nS"); h.orderBtn("n3").click(); await sleep(250); ok(!!h.$("osNote") && h.$("osNote").textContent === "ℹ️ " + NOTE, "a product in a sub-folder with no note uses the nearest note above it (the grandparent's)"); h.key("Escape"); await sleep(100); }
  { const h = await mk("#/nX"); h.orderBtn("n4").click(); await sleep(250); ok(!h.$("osNote") && !!h.$("osPid"), "no note anywhere: nothing extra on the order screen"); h.key("Escape"); await sleep(100); }
  { const h = await mk("#/nE"); h.orderBtn("n5").click(); await sleep(250); ok(h.$("osNote").textContent === "ℹ️ <img src=x onerror=alert(1)> <b>خطر</b>" && !h.$("osNote").querySelector("img, b"), "(plain text on the order screen too)"); h.key("Escape"); await sleep(100); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
