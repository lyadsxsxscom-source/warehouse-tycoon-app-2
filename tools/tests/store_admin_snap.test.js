// اختبارات صفحة أدمن المتجر: صندوق الكتالوج السريع (الحالة، التفعيل، الإيقاف، التحذير قرب الحد)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_snap.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const mkNode = (id, parentId, type, name, sort) => ({ id, parentId, type, name, enabled: true, sort, hasImage: false, imageUrl: "", prices: type === "item" ? [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] : [] });
const fresh = () => [mkNode("nA", "", "folder", "PUBG", 1), mkNode("nB", "nA", "folder", "Auto", 1), mkNode("nC", "nA", "folder", "Manual", 2), mkNode("nZ", "", "folder", "Games2", 2), mkNode("i1", "nB", "item", "UC 60", 1), mkNode("i2", "nB", "item", "UC 300", 2), mkNode("iR", "", "item", "Lonely", 3)];
function boot(hash) {
  const st = { nodes: fresh(), calls: [], failNext: null, authCb: null, snap: { enabled: false, count: 0, bytes: 0, updatedAt: 0, limit: 300 }, snapFail: false };
  const server = (b) => {
    if (st.failNext) { const f = st.failNext; st.failNext = null; return { st: 400, j: { ok: false, error: f.error, message: f.message } }; }
    if (b.action === "catalog_snap_status") return { st: 200, j: { ok: true, ...st.snap } };
    if (b.action === "catalog_snap_rebuild") { if (st.snapFail) return { st: 400, j: { ok: false, error: "catalog_too_big", message: "الكتالوج كبير كتير عن الحد (حجم النص)." } }; st.snap = { enabled: true, count: st.nodes.length, bytes: 48000, updatedAt: 1, limit: 700 }; return { st: 200, j: { ok: true, ...st.snap } }; }
    if (b.action === "catalog_snap_disable") { if (st.snapFail) return { st: 409, j: { ok: false, error: "too_many", message: "عندك 400 عنصر. الوضع القديم بيتحمّل 300 بس: قلّل العناصر أول." } }; st.snap = { enabled: false, count: st.snap.count, bytes: 0, updatedAt: 1, limit: 300 }; return { st: 200, j: { ok: true, ...st.snap } }; }
    if (b.action === "list") return { st: 200, j: { ok: true, nodes: st.nodes.map(n => ({ ...n })) } };
    if (b.action === "move") { const n = st.nodes.find(x => x.id === b.id); n.parentId = b.parentId || ""; n.sort = 99; return { st: 200, j: { ok: true, nodes: st.nodes.map(x => ({ ...x })) } }; }
    return { st: 200, j: { ok: true, nodes: st.nodes, methods: [], cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: 200 }, sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], customers: [], orders: [], counts: {}, total: 0, hasKey: true, cfg2: {} } };
  };
  const dom = new JSDOM(html, { url: "https://example.test/store-admin.html" + (hash || ""), runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
    const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { st.authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
    auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth }; w.confirm = () => true;
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
  const h = boot(""); await h.login(); const { $, st } = h; let asked = [];
  h.w.confirm = (m) => { asked.push(m); return true; };
  ok(!!$("snapBox") && /⚡ الكتالوج السريع/.test($("snapBox").textContent) && /بقراءة وحدة بدل مئات/.test($("snapBox").textContent), "the catalog tab has a '⚡ fast catalog' box that explains what it does");
  ok($("snapState").textContent === "⚪ مطفّأ · الحد 300" && $("btnSnapOn").textContent === "⚡ تفعيل" && $("btnSnapOff").hidden, "it starts off: 'off · limit 300', with an 'enable' button and no 'stop' button");
  $("btnSnapOn").click(); await sleep(250);
  ok(st.calls.some(c => c.action === "catalog_snap_rebuild") && /✅ مفعّل · 7 عنصر · 47 KB من حوالي 900 KB · الحد 700/.test($("snapState").textContent) && $("btnSnapOn").textContent === "🔄 إعادة بناء" && !$("btnSnapOff").hidden && /تم ✓ \(7 عنصر\)/.test($("snapMsg").textContent) && !$("btnSnapOn").disabled, "enabling shows: 'on · 7 items · 47 KB of about 900 KB · limit 700', switches the buttons to 'rebuild' and 'stop', and confirms");
  ok(st.calls.filter(c => c.action === "list").length >= 2, "(the catalog list is reloaded afterwards)");
  asked = []; $("btnSnapOff").click(); await sleep(250); ok(/إيقاف الكتالوج السريع؟ المتجر بيرجع يقرا العناصر وحدة وحدة/.test(asked[0]) && /مطفّأ · الحد 300/.test($("snapState").textContent) && /انوقف ✓/.test($("snapMsg").textContent) && $("btnSnapOff").hidden, "stopping asks first, then shows 'off · limit 300'");
  h.w.confirm = () => false; $("btnSnapOn").click(); await sleep(200); const n = st.calls.length; $("btnSnapOff").hidden = false; $("btnSnapOff").click(); await sleep(100); ok(st.calls.length === n, "saying no to the stop question sends nothing");
  st.snapFail = true; $("btnSnapOn").click(); await sleep(200); ok(/الكتالوج كبير كتير عن الحد/.test($("snapMsg").textContent) && !$("btnSnapOn").disabled, "a refusal when enabling is shown and the button works again");
  h.w.confirm = () => true; $("btnSnapOff").hidden = false; $("btnSnapOff").click(); await sleep(200); ok(/عندك 400 عنصر\. الوضع القديم بيتحمّل 300 بس/.test($("snapMsg").textContent) && !$("btnSnapOff").disabled, "a refusal when stopping (too many items) is shown too");
  /* near the limit and still off */
  st.snapFail = false; st.snap = { enabled: false, count: 0, bytes: 0, updatedAt: 0, limit: 300 }; for (let i = 0; i < 250; i++) st.nodes.push({ id: "x" + i, parentId: "nZ", type: "item", name: "i" + i, enabled: true, sort: i, hasImage: false, imageUrl: "", prices: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] });
  $("tabOrders").click(); await sleep(100); $("tabCatalog").click(); await sleep(100); await h.w.eval("loadCatalog().then(loadSnap)"); await sleep(250);
  ok(/⚠️ قربت من الحد \(257\): فعّله/.test($("snapState").textContent), "when the shop has 250+ items and the fast catalog is still off, it warns that the limit is near: " + $("snapState").textContent);
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
