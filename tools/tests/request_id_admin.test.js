// اختبارات صفحة الأدمن: رقم تعريف الطلب على كل بطاقة (سحب، شراء، متجر) وصندوق بحث لكل قائمة
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/request_id_admin.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/admin.html"), "utf8").replace(/<script src="[^"]*"><\/script>/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const snapCbs = {};
const DATA = {
  withdrawRequests: [
    { id: "w1doc", d: { status: "pending", coin: "usdt", network: "TRC20", amount: 6, amountUsd: 6, uid: "u1", displayName: "Sara", email: "sara@x.com", walletAddress: "TAbc", createdAt: 3, reqCode: "W-1001", reqNo: 1001 } },
    { id: "abcdef123", d: { status: "fulfilled", coin: "usdt", network: "TRC20", amount: 8, amountUsd: 8, uid: "u2", displayName: "Omar", email: "omar@x.com", walletAddress: "TDef", createdAt: 2 } },
    { id: "w3doc", d: { status: "pending", coin: "usdt", network: "BEP20", amount: 7, amountUsd: 7, uid: "u3", displayName: "Lina", email: "lina@x.com", walletAddress: "0xabc", createdAt: 1, reqCode: "W-1002<img src=x>" } },
  ],
  purchaseRequests: [
    { id: "pqrstu999", d: { status: "pending", points: 1000, usd: 1.5, method: "shamcash", uid: "u1", displayName: "Sara", email: "sara@x.com", createdAt: 3 } },
    { id: "pa1b2c3d4", d: { status: "fulfilled", points: 500, usd: 1, method: "shamcash", uid: "u4", displayName: "Dan", email: "dan@x.com", createdAt: 2 } },
  ],
};
const ORDERS = [{ id: "o1", reqCode: "S-1001", uid: "u1", displayName: "Sara", email: "sara@x.com", itemName: "PUBG 60 شدة", pricePoints: 700, fields: [], status: "pending", createdAt: Date.now(), snapshot: {} }, { id: "abcdefgh1234", reqCode: "S-ABCDE", uid: "u2", displayName: "Omar", email: "omar@x.com", itemName: "قديم", pricePoints: 50, fields: [], status: "pending", createdAt: Date.now() - 1000, snapshot: {} }];
const dom = new JSDOM(html, { url: "https://example.test/admin", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.confirm = () => true; w.HTMLElement.prototype.scrollIntoView = () => {};
  const mkSnap = (name) => ({ empty: false, forEach(fn) { DATA[name].forEach(r => fn({ id: r.id, data: () => r.d })); } });
  const coll = (name) => { const o = { orderBy() { return o; }, limit() { return o; }, where() { return o; }, onSnapshot(cb) { if (DATA[name]) { snapCbs[name] = () => cb(mkSnap(name)); setTimeout(snapCbs[name], 0); } return () => {}; },
    get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {}, empty: true }), doc() { return { get: async () => ({ exists: false, data: () => ({}) }) }; } }; return o; };
  const fs_ = () => ({ collection: coll }); fs_.FieldValue = { increment: x => x };
  w.firebase = { initializeApp() {}, apps: [], auth: () => ({ onAuthStateChanged(cb) { setTimeout(() => cb({ uid: ADMIN }), 0); }, currentUser: { uid: ADMIN, getIdToken: async () => "ADMTOKEN" }, signOut() {} }), firestore: fs_ };
  w.fetch = async (url, o) => { const body = o && o.body ? JSON.parse(o.body) : {}; const R = (j, st = 200) => ({ ok: st < 400, status: st, json: async () => j });
    if (String(url).endsWith("/admin/shop-orders")) return R({ ok: true, orders: ORDERS });
    return R({ ok: true, items: [], settings: {}, orders: [] }); };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const shown = (listId) => [...d.querySelectorAll("#" + listId + " > .req-card, #" + listId + " > div")].filter(c => c.style.display !== "none" && !c.classList.contains("empty-note"));
const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new dom.window.Event("input", { bubbles: true })); };
(async () => {
  await sleep(600);
  /* ---- withdrawals ---- */
  $("tabWithdraws").click(); await sleep(300);
  const wcards = [...d.querySelectorAll("#withdrawsList .req-card")];
  ok(wcards.length === 3, "three withdrawal requests are listed");
  ok(/رقم الطلب: W-1001/.test(wcards[0].textContent), "a new request shows its number W-1001");
  ok(/رقم الطلب: W-ABCDE/.test(wcards[1].textContent), "an old request without a number shows a derived one (W-ABCDE)");
  ok(wcards[2].querySelector("img") === null && /W-1002<img src=x>/.test(wcards[2].textContent), "a number is always shown as plain text");
  ok(/user-select:all/.test(wcards[0].querySelector(".req-id b").getAttribute("style")), "the number is easy to select and copy");
  type("wdSearch", "w-1001"); ok(shown("withdrawsList").length === 1 && /sara@x\.com/.test(shown("withdrawsList")[0].textContent), "searching by number finds that request (not case sensitive)");
  type("wdSearch", "omar"); ok(shown("withdrawsList").length === 1 && /W-ABCDE/.test(shown("withdrawsList")[0].textContent), "searching by name or email works");
  type("wdSearch", "zzz"); ok(shown("withdrawsList").length === 0, "no match shows nothing");
  snapCbs.withdrawRequests(); await sleep(50);
  ok(shown("withdrawsList").length === 0, "the search stays applied when the list refreshes live");
  type("wdSearch", ""); ok(shown("withdrawsList").length === 3, "clearing the search shows everything again");

  /* ---- purchases ---- */
  $("tabRequests") && $("tabRequests").click(); await sleep(200);
  const pcards = [...d.querySelectorAll("#requestsList .req-card")];
  ok(pcards.length === 2 && /رقم الطلب: P-PQRST/.test(pcards[0].textContent) && /رقم الطلب: P-PA1B2/.test(pcards[1].textContent), "purchase requests show a derived number (P-xxxxx)");
  type("reqSearch", "p-pa1b2"); ok(shown("requestsList").length === 1 && /dan@x\.com/.test(shown("requestsList")[0].textContent), "and can be searched by it");
  type("reqSearch", "");

  /* ---- store orders ---- */
  $("tabShop").click(); await sleep(400);
  const ocards = [...d.querySelectorAll("#shopOrdersList > div")];
  ok(ocards.length === 2 && /PUBG 60 شدة\s*S-1001/.test(ocards[0].textContent) && /قديم\s*S-ABCDE/.test(ocards[1].textContent), "store orders show their number next to the item name");
  type("shopSearch", "S-1001"); ok(shown("shopOrdersList").length === 1 && /sara@x\.com/.test(shown("shopOrdersList")[0].textContent), "and are searchable by it");
  type("shopSearch", "xyz"); ok(shown("shopOrdersList").length === 0, "no match shows nothing");
  type("shopSearch", "");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
