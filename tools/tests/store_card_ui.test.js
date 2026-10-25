// اختبارات صفحة الزبون: البطاقات الإلكترونية (بدون Player ID، الكود بيظهر بطلباتي)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_card_ui.test.js
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
  const h = { calls: [], authCb: null, copied: "", canvas: [], big: false, confirmAnswer: true, balance: opts.balance === undefined ? 12.5 : opts.balance, orders: opts.orders || [], prices: opts.prices || { n1: 0.92, n2: 9.26 }, vip: opts.vip || 1, fail: {}, quotes: 0, validateFn: () => ({ supported: false }), validateDelay: 0 };
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
      if (u === "/store/quote") { h.quotes++; const p = h.prices[body.itemId]; return R({ ok: true, quote: { itemId: body.itemId, zone: body.itemId === "n2", noPlayer: body.itemId === "n1", name: "60 UC", vip: h.vip, priceUsd: p, balanceUsd: h.balance, enough: h.balance + 1e-9 >= p, shortUsd: Math.max(0, Math.round((p - h.balance) * 10000) / 10000) } }); }
      if (u === "/store/validate-id") { if (h.validateDelay) await sleep(h.validateDelay(body)); return R({ ok: true, ...h.validateFn(body) }); }
      if (u === "/store/orders") return R({ ok: true, orders: h.orders });
      if (u === "/store/order") { const p = h.prices[body.itemId]; if (h.balance + 1e-9 < p) return R({ ok: false, error: "insufficient_balance", message: "رصيدك " + h.balance + "$ وسعر الطلب " + p + "$. اشحن رصيدك أول.", balanceUsd: h.balance, priceUsd: p, shortUsd: Math.round((p - h.balance) * 10000) / 10000 }, 400); h.balance = Math.round((h.balance - p) * 10000) / 10000; const o2 = mkOrder({ playerId: body.playerId, itemId: body.itemId, priceUsd: p }); if (body.playerId === undefined) { o2.noPlayer = true; o2.playerId = ""; } h.orders = [o2, ...h.orders]; return R({ ok: true, order: o2, balanceUsd: h.balance }); }
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
(async () => {
  { const h = open({ balance: 50 }); await sleep(60); await h.signIn(); const $ = h.$;
    h.orderBtn("n1").click(); await sleep(150);
    ok(!$("osPid") && !$("osZone") && /بطاقة إلكترونية/.test($("osCardHint").textContent) && /طلباتي/.test($("osCardHint").textContent), "a gift card asks for no Player ID and says the code arrives in 'My orders'");
    const nO = h.count("/store/order"), nV = h.count("/store/validate-id"); $("osSubmit").click(); await sleep(150);
    const lo = h.last("/store/order"); ok(h.count("/store/order") === nO + 1 && !("playerId" in lo.body) && h.count("/store/validate-id") === nV, "buying sends no Player ID and no ID check");
    ok(/قيد التنفيذ/.test($("osFinal").textContent) && /الكود/.test($("osFinal").textContent) && !$("osCode"), "while processing: it says the code will show here, no code yet");
    h.orders[0].noPlayer = true; h.orders[0].status = "done"; h.orders[0].delivery = "ABCD-EFGH-1234"; $("osRefresh").click(); await sleep(150);
    ok($("osCode") && $("osCode").textContent === "ABCD-EFGH-1234" && /كود البطاقة/.test($("osFinal").textContent) && $("osCopyCode").dataset.copy === "ABCD-EFGH-1234", "when done the code shows with a copy button");
    ok(/بطاقة إلكترونية/.test(h.d.body.textContent) && !/Player ID: undefined/.test(h.d.body.textContent), "the summary says gift card, not an empty Player ID");
    h.key("Escape"); await sleep(30); h.orderBtn("n2").click(); await sleep(150); ok(!!$("osPid") && !$("osCardHint"), "a normal product still asks for the Player ID");
  }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
