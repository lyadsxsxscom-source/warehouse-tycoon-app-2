// اختبارات صفحة أدمن المتجر: تبويب الاقتراحات، وكود البطاقة الإلكترونية عند التنفيذ، وخيار 🎫 بمحرر المنتج
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_suggest.test.js
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
  const h = boot(""); h.st.sugs = [{ id: "s1", name: "Genshin Impact", kind: "game", note: "كريستال", custName: "Ali", email: "a@b.c", status: "new", createdAt: Date.now() }, { id: "s2", name: "Tango", kind: "app", note: "", custName: "Sara", email: "", status: "done", createdAt: Date.now() - 1000 }];
  const now = Date.now(); h.st.orders = [{ id: "o1", kind: "order", code: "Y-1", status: "processing", name: "Ali", email: "", uid: "u1", itemName: "Google Play 10$", itemPath: "x", playerId: "", zoneId: "", noPlayer: true, delivery: "", priceUsd: 10.91, vip: 1, createdAt: now, updatedAt: now, events: [] }, { id: "o2", kind: "order", code: "Y-2", status: "processing", name: "Ali", email: "", uid: "u1", itemName: "60 UC", itemPath: "x", playerId: "5123", zoneId: "", noPlayer: false, delivery: "", priceUsd: 1, vip: 1, createdAt: now, updatedAt: now, events: [] }];
  await h.login(); const { $, st, d } = h;
  ok(!!$("tabSuggest") && /الاقتراحات/.test($("tabSuggest").textContent), "there is a '💡 Suggestions' tab");
  $("tabSuggest").click(); await sleep(150);
  ok(!$("viewSuggest").hidden && $("viewCatalog").hidden && h.hash() === "#suggest", "it opens its own view (with its own address)");
  const cards = () => [...d.querySelectorAll("#sugList [data-sid]")];
  ok(cards().length === 2 && /🎮 Genshin Impact/.test(cards()[0].textContent) && /كريستال/.test(cards()[0].textContent) && /Ali/.test(cards()[0].textContent) && /📱 Tango ✔/.test(cards()[1].textContent), "suggestions show type, name, note, customer; seen ones are marked ✔");
  ok($("sugBadge").textContent === "1" && !$("sugBadge").hidden, "the tab shows how many are new");
  cards()[0].querySelector('[data-sact="done"]').click(); await sleep(120); ok(st.sugs[0].status === "done" && $("sugBadge").hidden, "'✔ seen' marks it and the badge goes away");
  cards()[1].querySelector('[data-sact="del"]').click(); await sleep(120); ok(st.sugs.length === 1 && cards().length === 1, "delete removes it");
  st.sugs = []; await h.w.eval("loadSuggestions()"); await sleep(80); ok(/ما في اقتراحات/.test($("sugList").textContent), "empty list says so");

  $("tabOrders").click(); await sleep(200);
  const ord = id => d.querySelector('[data-ord="' + id + '"]');
  ok(/🎫 بطاقة إلكترونية/.test(ord("o1").textContent) && !/Player ID/.test(ord("o1").textContent) && /Player ID: 5123/.test(ord("o2").textContent), "a gift-card order is marked 🎫 (no Player ID line); normal orders unchanged");
  ord("o1").querySelector('[data-oact="done"]').click(); await sleep(50);
  const code = ord("o1").querySelector('[data-f="delivery"]'); ok(!!code && /كود البطاقة/.test(code.placeholder), "confirming a gift card asks for the card code");
  ord("o1").querySelector("form button[type=submit]").click(); await sleep(80); ok(!st.calls.some(c => c.action === "order_done") && /كود البطاقة/.test(ord("o1").textContent), "without the code it does not confirm");
  code.value = " AB12-CD34 "; ord("o1").querySelector("form button[type=submit]").click(); await sleep(150);
  const dn = h.last("order_done"); ok(dn && dn.id === "o1" && dn.delivery === "AB12-CD34", "with the code it confirms and sends the code");
  ord("o2").querySelector('[data-oact="done"]').click(); await sleep(50); ok(!ord("o2").querySelector('[data-f="delivery"]'), "a normal order asks for no code");

  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
