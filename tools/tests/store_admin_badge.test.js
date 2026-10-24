// اختبارات صفحة أدمن المتجر: عدّاد الطلبات الخفيف (عدّ بدل قراءة، كل دقيقتين، وما بيشتغل والتبويب مخفي)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_badge.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const mkNode = (id, parentId, type, name, sort) => ({ id, parentId, type, name, enabled: true, sort, hasImage: false, imageUrl: "", prices: type === "item" ? [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] : [] });
const fresh = () => [mkNode("nA", "", "folder", "PUBG", 1), mkNode("nB", "nA", "folder", "Auto", 1), mkNode("nC", "nA", "folder", "Manual", 2), mkNode("nZ", "", "folder", "Games2", 2), mkNode("i1", "nB", "item", "UC 60", 1), mkNode("i2", "nB", "item", "UC 300", 2), mkNode("iR", "", "item", "Lonely", 3)];
function boot(hash) {
  const st = { nodes: fresh(), calls: [], failNext: null, authCb: null, badge: [2, 3], intervals: [] };
  const server = (b) => {
    if (st.failNext) { const f = st.failNext; st.failNext = null; return { st: 400, j: { ok: false, error: f.error, message: f.message } }; }
    if (b.action === "orders_badge") return { st: 200, j: { ok: true, counts: { payment_submitted: st.badge[0], processing: st.badge[1] }, waiting: st.badge[0] + st.badge[1] } };
    if (b.action === "list") return { st: 200, j: { ok: true, nodes: st.nodes.map(n => ({ ...n })) } };
    if (b.action === "move") { const n = st.nodes.find(x => x.id === b.id); n.parentId = b.parentId || ""; n.sort = 99; return { st: 200, j: { ok: true, nodes: st.nodes.map(x => ({ ...x })) } }; }
    return { st: 200, j: { ok: true, nodes: st.nodes, methods: [], cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: 200 }, sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], customers: [], orders: [], counts: {}, total: 0, hasKey: true, cfg2: {} } };
  };
  const dom = new JSDOM(html, { url: "https://example.test/store-admin.html" + (hash || ""), runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
    const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { st.authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
    auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth }; w.confirm = () => true; const si = w.setInterval.bind(w); w.setInterval = (fn, ms) => { st.intervals.push({ fn, ms }); return si(fn, 3600000); };
    w.fetch = async (url, o) => { const body = JSON.parse(o.body); st.calls.push(body); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
  } });
  const d = dom.window.document, $ = id => d.getElementById(id), w = dom.window;
  const h = { st, dom, d, $, w, names: () => [...d.querySelectorAll("#list [data-row] .nm")].map(x => x.textContent), crumbs: () => $("crumbs").textContent.replace(/\s+/g, " ").trim(),
    row: (name) => [...d.querySelectorAll("#list [data-row]")].find(r => r.querySelector(".nm").textContent === name), last: a => st.calls.filter(c => c.action === a).pop(),
    go: async (name) => { h.row(name).querySelector(".info").click(); await sleep(60); }, back: async () => { w.history.back(); await sleep(120); }, hash: () => w.location.hash,
    login: async () => { await sleep(100); st.authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(250); } };
  return h;
}
(async () => {
  const h = boot(""); await h.login(); const { $, st } = h; const n = (a) => st.calls.filter(c => c.action === a).length, badge = () => $("ordBadge");
  ok(n("orders_badge") === 1 && n("orders_list") === 0 && badge().textContent === "5" && !badge().hidden, "after signing in the orders badge asks the light 'count' action (not the full orders list) and shows 2 + 3 = 5");
  const iv = st.intervals.find(x => x.fn.toString().includes("refreshOrderBadge")); ok(iv && iv.ms === 120000 && !st.intervals.some(x => x.ms === 60000), "it refreshes every 2 minutes (it used to be every minute)");
  st.badge = [0, 0]; await iv.fn(); await sleep(100); ok(n("orders_badge") === 2 && badge().hidden, "a refresh updates the number (and hides the badge when nothing waits)");
  Object.defineProperty(h.d, "hidden", { value: true, configurable: true }); const before = st.calls.length; st.badge = [4, 4]; await iv.fn(); await sleep(60); ok(st.calls.length === before && badge().hidden, "while the page is in the background (tab hidden) it asks nothing: an admin tab left open overnight costs nothing");
  Object.defineProperty(h.d, "hidden", { value: false, configurable: true }); h.d.dispatchEvent(new h.w.Event("visibilitychange")); await sleep(120); ok(n("orders_badge") === 3 && badge().textContent === "8", "coming back to the tab refreshes the number at once");
  st.failNext = { error: "x", message: "down" }; await iv.fn(); await sleep(80); ok(badge().textContent === "8", "a failed refresh changes nothing and shows no error");
  $("tabOrders").click(); await sleep(200); ok(n("orders_list") === 1, "the full orders list is still loaded when you open the orders tab (only then)");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
