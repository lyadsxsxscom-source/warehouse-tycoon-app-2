// اختبارات أدمن المتجر: طلبات "السعر عند التواصل" (عرض الإيميل والتواصل، تحديد السعر، التنفيذ بدون كود) وخيار 💬 بمحرر المنتج
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_quote.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const mkNode = (id, parentId, type, name, sort) => ({ id, parentId, type, name, enabled: true, sort, hasImage: false, imageUrl: "", prices: type === "item" ? [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] : [] });
const fresh = () => [mkNode("nA", "", "folder", "PUBG", 1), mkNode("nB", "nA", "folder", "Auto", 1), mkNode("nC", "nA", "folder", "Manual", 2), mkNode("nZ", "", "folder", "Games2", 2), mkNode("i1", "nB", "item", "UC 60", 1), mkNode("i2", "nB", "item", "UC 300", 2), mkNode("iR", "", "item", "Lonely", 3)];
function boot(hash) {
  const st = { sugs: [], orders: [], saved: null, nodes: fresh(), calls: [], failNext: null, authCb: null, aiFail: false, ai: { exists: false, active: false, maxCreates: 150 }, log: [], pending: [] };
  const server = (b) => {
    if (st.failNext) { const f = st.failNext; st.failNext = null; return { st: 400, j: { ok: false, error: f.error, message: f.message } }; }
    if (b.action === "ai_link_status") return { st: 200, j: { ok: true, ...st.ai } };
    if (b.action === "ai_link_create") { if (st.aiFail) return { st: 400, j: { ok: false, error: "bad_request", message: "المدة: ساعة أو 6 أو 24." } }; st.ai = { exists: true, active: true, revoked: false, expired: false, expiresAt: Date.now() + b.hours * 3600000, createdAt: Date.now(), hours: b.hours, creates: 0, maxCreates: 150, calls: 0, lastUsedAt: 0 }; return { st: 200, j: { ok: true, url: "https://api.example.test/ai/mcp/" + "ab12".repeat(12), expiresAt: st.ai.expiresAt, hours: b.hours } }; }
    if (b.action === "ai_link_revoke") { st.ai = { ...st.ai, active: false, revoked: true }; return { st: 200, j: { ok: true } }; }
    if (b.action === "ai_link_log") return { st: 200, j: { ok: true, log: st.log } };
    if (b.action === "ai_pending") return { st: 200, j: { ok: true, pending: st.pending.map(p => ({ ...p })) } };
    if (b.action === "ai_enable") { const ids = b.all ? st.pending.map(p => p.id) : b.ids; st.pending = st.pending.filter(p => !ids.includes(p.id)); return { st: 200, j: { ok: true, enabled: ids.length } }; }
    if (b.action === "quote_price") { const o = st.orders.find(x => x.id === b.id); o.status = "quote_offered"; o.priceUsd = b.priceUsd; return { st: 200, j: { ok: true } }; }
    if (b.action === "suggestions_list") return { st: 200, j: { ok: true, newCount: st.sugs.filter(s => s.status === "new").length, suggestions: st.sugs.map(s => ({ ...s })) } };
    if (b.action === "suggestion_set") { st.sugs.find(s => s.id === b.id).status = b.status; return { st: 200, j: { ok: true } }; }
    if (b.action === "suggestion_delete") { st.sugs = st.sugs.filter(s => s.id !== b.id); return { st: 200, j: { ok: true } }; }
    if (b.action === "orders_list") return { st: 200, j: { ok: true, orders: st.orders.map(o => ({ ...o })), counts: {}, kinds: {}, waiting: 0, total: st.orders.length } };
    if (b.action === "order_done") { const o = st.orders.find(x => x.id === b.id); o.status = "done"; o.delivery = b.delivery || ""; return { st: 200, j: { ok: true } }; }
    if (b.action === "save") { st.saved = b; return { st: 200, j: { ok: true, nodes: st.nodes.map(n => ({ ...n })) } }; }
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
  const h = boot(""), now = Date.now(), Q = (id, status, price, paid) => ({ id, kind: "order", code: "T-" + id, status, name: "Ali", email: "", uid: "u1", itemName: "500 جوهرة", itemPath: "كلاش › 500 جوهرة", playerId: "", zoneId: "", noPlayer: true, delivery: "", quote: { email: "me@gmail.com", app: id === "q1" ? "whatsapp" : "telegram", contact: id === "q1" ? "+963 944 123456" : "@ibrahim", note: "حساب تركي", paid }, priceUsd: price, vip: 1, createdAt: now, updatedAt: now, events: [] });
  h.st.orders = [Q("q1", "quote_requested", 0, false), Q("q2", "processing", 6, true)];
  await h.login(); const { $, st, d } = h;
  $("tabOrders").click(); await sleep(200);
  const ord = id => d.querySelector('[data-ord="' + id + '"]');
  ok(/بانتظار سعرك/.test(ord("q1").textContent) && /me@gmail\.com/.test(ord("q1").textContent) && /حساب تركي/.test(ord("q1").textContent) && /لسا ما حددته/.test(ord("q1").textContent), "a request shows its status, the account email, the customer's note and 'no price yet'");
  const wa = ord("q1").querySelector('[data-quote] a'); ok(wa && wa.getAttribute("href") === "https://wa.me/963944123456" && wa.getAttribute("target") === "_blank", "the WhatsApp number is a link that opens the chat");
  ok(ord("q2").querySelector('[data-quote] a').getAttribute("href") === "https://t.me/ibrahim", "a Telegram @username links to t.me");
  ok(!!ord("q1").querySelector('[data-qprice]') && /حدد السعر/.test(ord("q1").textContent) && !ord("q1").querySelector('[data-oact="done"]'), "a request has a price box and '💲 set price' (no 'done' yet)");
  ord("q1").querySelector('[data-oact="qprice"]').click(); await sleep(80); ok(!h.last("quote_price") && /اكتب السعر/.test($("ordMsg").textContent), "an empty price is stopped");
  ord("q1").querySelector('[data-qprice]').value = "5.5"; ord("q1").querySelector('[data-oact="qprice"]').click(); await sleep(200);
  ok(h.last("quote_price").id === "q1" && h.last("quote_price").priceUsd === 5.5 && /انبعت السعر/.test($("ordMsg").textContent), "setting the price sends it");
  ok(/بانتظار موافقة الزبون/.test(ord("q1").textContent) && /غيّر السعر/.test(ord("q1").textContent), "then it waits for the customer, and the price can still be changed");
  ord("q2").querySelector('[data-oact="done"]').click(); await sleep(50); ok(!ord("q2").querySelector('[data-f="delivery"]'), "completing a paid request asks for no card code");

  /* editor */
  $("tabCatalog").click(); await sleep(150); $("btnAddItem").click(); await sleep(60);
  ok(!$("edQuoteRow").hidden && !$("edQuote").checked, "the product editor has '💬 price on request'");
  $("edName").value = "500 جوهرة"; $("edPrice").value = ""; $("edSave").click(); await sleep(80); ok(/السعر عند التواصل/.test($("edMsg").textContent) && !h.st.saved, "no price and not marked: asks for a price (or the mark)");
  $("edQuote").checked = true; $("edSave").click(); await sleep(120); ok(h.st.saved && h.st.saved.quote === true && h.st.saved.prices[0] === "", "marked: saves without a price");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
