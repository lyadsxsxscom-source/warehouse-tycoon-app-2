// اختبارات التطبيق: متجر شحن الألعاب والخدمات (قسم بشاشة المتجر، نافذة الطلب، طلباتي)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/shop_app.test.js
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WWW = path.join(__dirname, "../../www");
const RAW = fs.readFileSync(path.join(WWW, "index.html"), "utf8"), I18N = fs.readFileSync(path.join(WWW, "i18n.js"), "utf8");
const baseState = (points) => ({ points, totalPointsEarned: 9000, balanceUsd: 0, workersRented: 1, adsWatched: 5, activeDays: 4, lastWithdrawAt: 0, boostUntil: 0, tasks: [], shelves: [], daily: { streak: 0, lastClaim: "", rewards: [10, 10, 20, 10, 10, 10, 60] }, referral: { code: "ABC123", invited: 0, active: 0, earnings: 0, referred: false, rewarded: false, canEnter: false, progress: { days: 4, ads: 5 }, cfg: { inviteeBonus: 50, inviterReward: 150, commissionPct: 5, requiredDays: 3, requiredAds: 10, windowHours: 72 } } });
const ITEMS_AR = [
  { id: "it1", name: "PUBG 60 شدة", desc: "شحن فوري <b>x</b>", pricePoints: 700, fields: [{ key: "pid", label: "ID اللاعب", type: "id", required: true }, { key: "phone", label: "رقم التواصل", type: "phone", required: false }] },
  { id: "it2", name: "اشتراك", desc: "", pricePoints: 1500, fields: [{ key: "mail", label: "البريد الإلكتروني", type: "email", required: true }] },
];
const ITEMS_TR = [{ id: "it1", name: "PUBG 60 UC", desc: "", pricePoints: 700, fields: [{ key: "pid", label: "Oyuncu ID", type: "id", required: true }] }];
const ORDERS = [
  { id: "o1", itemName: "PUBG 60 شدة", pricePoints: 700, status: "pending", createdAt: Date.now() - 3600000, note: "", fields: [] },
  { id: "o2", itemName: "اشتراك", pricePoints: 1500, status: "done", createdAt: Date.now() - 86400000, note: "تم، شوف بريدك", fields: [] },
  { id: "o3", itemName: "PUBG 60 شدة", pricePoints: 700, status: "rejected", createdAt: Date.now() - 2 * 86400000, note: "ID غلط", fields: [] },
];
function open(opts = {}) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e.message).slice(0, 140)));
  const html = RAW.replace(/<script src="https?:[^"]*"><\/script>/g, "").replace('<script src="i18n.js"></script>', () => "<script>" + I18N + "</script>");
  const h = { authCb: null, calls: [], items: opts.items || ITEMS_AR, orders: opts.orders || [], minActiveDays: opts.minActiveDays == null ? 3 : opts.minActiveDays, points: opts.points == null ? 5000 : opts.points, orderResponse: null, delay: 0 };
  const dom = new JSDOM(html, { url: "https://example.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    try { w.localStorage.setItem("lang", opts.lang || "ar"); w.localStorage.setItem("guide_seen_v1", "1"); } catch (e) {}
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLElement.prototype.scrollIntoView = function () {}; w.alert = m => { h.alerted = m; };
    const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
    const fsf = () => ({ collection() { return q; } }); fsf.FieldValue = { increment: x => x };
    w.firebase = { initializeApp() {}, apps: [], auth() { return { onAuthStateChanged(cb) { h.authCb = cb; }, currentUser: null, signOut() {} }; }, firestore: fsf };
    w.firebase.auth.GoogleAuthProvider = function () {};
    const R = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
    w.fetch = async (url, o) => { const u = String(url); let body = {}; try { body = JSON.parse(o.body); } catch (e) {} h.calls.push({ u, body });
      if (u.endsWith("/game/state")) return R({ ok: true, state: baseState(h.points) });
      if (u.endsWith("/game/shop")) return R({ ok: true, shop: { items: h.items, minActiveDays: h.minActiveDays, maxPending: 3 }, orders: h.orders });
      if (u.endsWith("/game/shopOrder")) { if (h.delay) await sleep(h.delay); if (h.orderResponse) return h.orderResponse(body); h.points -= 700; return R({ ok: true, state: baseState(h.points), result: { orderId: "x", pricePoints: 700 } }); }
      return R({ ok: true }); };
  } });
  h.w = dom.window; h.d = dom.window.document; h.errors = errors; h.ev = c => dom.window.eval(c);
  h.user = { uid: "u1", getIdToken: async () => "tok", displayName: "T", email: "t@x.com", photoURL: "" };
  h.login = async () => { h.authCb(h.user); await sleep(550); };
  h.n = (suffix) => h.calls.filter(c => c.u.endsWith(suffix)).length;
  h.store = async () => { h.d.querySelector('.navbtn[data-screen="store"]').click(); await sleep(250); };
  h.type = (id, v) => { h.d.getElementById(id).value = v; };
  return h;
}
const $ = (h, id) => h.d.getElementById(id);
(async () => {
  { const h = open({ items: [], orders: [] }); await h.login(); await h.store();
    ok(h.n("/game/shop") === 1 && h.calls.find(c => c.u.endsWith("/game/shop")).body.lang === "ar", "opening the Store screen asks the server for the shop with the app language");
    ok($(h, "gameShopBox").style.display === "none", "an empty store (no items, no orders) shows nothing at all"); }
  { const h = open({ items: ITEMS_AR, orders: ORDERS }); await h.login(); await h.store();
    ok($(h, "gameShopBox").style.display === "block" && /شحن ألعاب وخدمات/.test($(h, "gameShopBox").textContent), "with items the 'game & service top-ups' section appears on the Store screen");
    const cards = [...h.d.querySelectorAll("#shopItems .shop-item")];
    ok(cards.length === 2 && /PUBG 60 شدة/.test(cards[0].textContent) && /700 نقطة/.test(cards[0].textContent) && /1500 نقطة/.test(cards[1].textContent), "each item shows its name and price in points");
    ok(h.d.querySelector("#shopItems img") === null && /<b>x<\/b>/.test(cards[0].textContent), "item text from the admin is shown as plain text (no HTML)");
    ok(cards.every(c => !c.querySelector("button").disabled), "players with enough active days can order");
    const rows = [...h.d.querySelectorAll("#shopOrdersList .shop-order")].map(r => r.textContent.replace(/\s+/g, " "));
    ok(rows.length === 3 && /قيد التنفيذ/.test(rows[0]) && /تم ✅/.test(rows[1]) && /تم، شوف بريدك/.test(rows[1]) && /مرفوض ❌/.test(rows[2]) && /ID غلط/.test(rows[2]), "'My orders' shows each order's status and the admin's note");
    ok(h.d.getElementById("shopOrdersBox").style.display === "block", "the orders box is visible when there are orders");

    /* ---- the order sheet ---- */
    cards[0].querySelector("button").click();
    ok($(h, "shopOverlay").classList.contains("show") && $(h, "shopTitle").textContent === "PUBG 60 شدة", "tapping 'order' opens the sheet with the item name");
    ok(/السعر: 700 نقطة · رصيدك: 5000 نقطة/.test($(h, "shopPriceLine").textContent), "the sheet shows the price and the player's balance");
    const pid = $(h, "shopF_pid"), phone = $(h, "shopF_phone");
    ok(pid && phone && pid.type === "text" && phone.type === "tel" && pid.getAttribute("dir") === "ltr" && /\*/.test(pid.previousSibling.textContent) && !/\*/.test(phone.previousSibling.textContent), "inputs follow what the admin asked for: required ID (marked *) and an optional phone");
    $(h, "shopSubmit").click(); await sleep(50);
    ok(/اكتب «ID اللاعب»/.test($(h, "shopHint").textContent) && h.n("/game/shopOrder") === 0, "submitting without the required ID shows its name and sends nothing");
    h.type("shopF_pid", "5123456789"); h.type("shopF_phone", "abc"); $(h, "shopSubmit").click(); await sleep(50);
    ok(/«رقم التواصل» مو رقم صحيح/.test($(h, "shopHint").textContent) && h.n("/game/shopOrder") === 0, "a wrong phone number is caught before sending");
    h.type("shopF_phone", ""); h.delay = 150;
    $(h, "shopSubmit").click(); $(h, "shopSubmit").click(); await sleep(40);
    ok(/جاري الإرسال/.test($(h, "shopSubmit").textContent) && $(h, "shopSubmit").disabled, "while sending, the button says so and is disabled");
    await sleep(500);
    const orderCalls = h.calls.filter(c => c.u.endsWith("/game/shopOrder"));
    ok(orderCalls.length === 1, "a double tap sends only ONE order");
    ok(orderCalls[0].body.itemId === "it1" && orderCalls[0].body.fields.pid === "5123456789" && orderCalls[0].body.fields.phone === "" && typeof orderCalls[0].body.reqId === "string" && orderCalls[0].body.reqId.length > 8, "the order carries the item id, what the player typed and a unique request id");
    ok(!$(h, "shopOverlay").classList.contains("show") && /انبعت طلبك/.test($(h, "shopMsg").textContent), "on success the sheet closes and a confirmation is shown");
    ok(h.ev("points") === 4300, "the player's points drop right away to the server's new balance");
    ok(h.n("/game/shop") === 2, "the orders list is refreshed after ordering");
    ok(h.errors.length === 0, "no script errors " + JSON.stringify(h.errors.slice(0, 2))); }

  { const h = open({ items: ITEMS_AR, minActiveDays: 7 }); await h.login(); await h.store();
    const b = h.d.querySelector("#shopItems .shop-item button"); const lock = h.d.querySelector("#shopItems .shop-lock");
    ok(b.disabled && lock && /بتتفتح بعد 7 أيام نشاط \(عندك 4\)/.test(lock.textContent), "a player with too few active days sees the button locked and why"); }
  { const h = open({ items: ITEMS_AR, points: 300 }); await h.login(); await h.store();
    h.d.querySelector("#shopItems .shop-item button").click(); h.type("shopF_pid", "1"); $(h, "shopSubmit").click(); await sleep(60);
    ok(/نقاطك ما بتكفي: محتاج 700 نقطة/.test($(h, "shopHint").textContent) && h.n("/game/shopOrder") === 0, "not enough points: a clear message, nothing is sent");
    $(h, "shopCancel").click(); ok(!$(h, "shopOverlay").classList.contains("show"), "'Cancel' closes the sheet"); }
  { const h = open({ items: ITEMS_AR }); await h.login(); await h.store();
    h.orderResponse = () => ({ ok: false, status: 400, json: async () => ({ ok: false, error: "too_many_pending", message: "عندك 3 طلبات قيد التنفيذ، استنى لتخلص قبل ما تطلب غيرها." }) });
    h.d.querySelector("#shopItems .shop-item button").click(); h.type("shopF_pid", "1"); $(h, "shopSubmit").click(); await sleep(150);
    ok($(h, "shopOverlay").classList.contains("show") && /3 طلبات قيد التنفيذ/.test($(h, "shopHint").textContent) && !$(h, "shopSubmit").disabled, "a server refusal is shown in the sheet and the player can try again");
    h.orderResponse = () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: "duplicate_order", message: "طلبك انبعت قبل، ما لازم تبعته مرة تانية." }) });
    $(h, "shopSubmit").click(); await sleep(150);
    ok(!$(h, "shopOverlay").classList.contains("show") && /انبعت طلبك/.test($(h, "shopMsg").textContent), "if the server says the order was already received (lost reply), it is treated as success"); }
  { const h = open({ items: ITEMS_AR }); h.authCb(null); await sleep(500);
    h.d.querySelector('.navbtn[data-screen="store"]').click(); await sleep(200);
    ok(h.n("/game/shop") === 0 && $(h, "gameShopBox").style.display === "none", "signed out: the store section stays hidden and nothing is requested"); }

  /* ---- languages ---- */
  { const h = open({ items: ITEMS_TR, orders: ORDERS, lang: "tr" }); await h.login(); await h.store();
    ok(h.calls.find(c => c.u.endsWith("/game/shop")).body.lang === "tr", "the app asks for Turkish names");
    ok(/Oyun ve Hizmet Yükleme/.test($(h, "gameShopBox").textContent) && /Sipariş ver/.test($(h, "shopItems").textContent) && /Siparişlerim/.test($(h, "shopOrdersBox").textContent), "Turkish: heading, button and 'My orders'");
    const rows = [...h.d.querySelectorAll("#shopOrdersList .shop-order")].map(r => r.textContent);
    ok(/İşlemde/.test(rows[0]) && /Tamamlandı/.test(rows[1]) && /Reddedildi/.test(rows[2]), "Turkish order statuses");
    h.d.querySelector("#shopItems .shop-item button").click(); $(h, "shopSubmit").click(); await sleep(60);
    ok(/Siparişi onayla/.test($(h, "shopSubmit").textContent) && /«Oyuncu ID» alanını doldur/.test($(h, "shopHint").textContent) && /Fiyat: 700 puan/.test($(h, "shopPriceLine").textContent), "Turkish sheet: button, validation message and price line"); }
  { const h = open({ items: ITEMS_TR, orders: ORDERS, lang: "en" }); await h.login(); await h.store();
    ok(/Game & Service Top-ups/.test($(h, "gameShopBox").textContent) && /Order/.test($(h, "shopItems").textContent) && /In progress/.test($(h, "shopOrdersList").textContent) && /Declined/.test($(h, "shopOrdersList").textContent), "English: heading, button and statuses");
    h.d.querySelector("#shopItems .shop-item button").click(); h.type("shopF_pid", "77"); $(h, "shopSubmit").click(); await sleep(250);
    ok(/Your order was sent/.test($(h, "shopMsg").textContent), "English confirmation after ordering"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
