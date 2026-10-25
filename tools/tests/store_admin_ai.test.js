// اختبارات صفحة أدمن المتجر: صندوق رابط الذكاء الاصطناعي (الحالة، الإنشاء والتجديد، النسخ، الإلغاء، السجل، ومراجعة المخفي والموافقة)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_ai.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const mkNode = (id, parentId, type, name, sort) => ({ id, parentId, type, name, enabled: true, sort, hasImage: false, imageUrl: "", prices: type === "item" ? [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] : [] });
const fresh = () => [mkNode("nA", "", "folder", "PUBG", 1), mkNode("nB", "nA", "folder", "Auto", 1), mkNode("nC", "nA", "folder", "Manual", 2), mkNode("nZ", "", "folder", "Games2", 2), mkNode("i1", "nB", "item", "UC 60", 1), mkNode("i2", "nB", "item", "UC 300", 2), mkNode("iR", "", "item", "Lonely", 3)];
function boot(hash) {
  const st = { nodes: fresh(), calls: [], failNext: null, authCb: null, aiFail: false, ai: { exists: false, active: false, maxCreates: 150 }, log: [], pending: [] };
  const server = (b) => {
    if (st.failNext) { const f = st.failNext; st.failNext = null; return { st: 400, j: { ok: false, error: f.error, message: f.message } }; }
    if (b.action === "ai_link_status") return { st: 200, j: { ok: true, ...st.ai } };
    if (b.action === "ai_link_create") { if (st.aiFail) return { st: 400, j: { ok: false, error: "bad_request", message: "المدة: ساعة أو 6 أو 24." } }; st.ai = { exists: true, active: true, revoked: false, expired: false, expiresAt: Date.now() + b.hours * 3600000, createdAt: Date.now(), hours: b.hours, creates: 0, maxCreates: 150, calls: 0, lastUsedAt: 0 }; return { st: 200, j: { ok: true, url: "https://api.example.test/ai/mcp/" + "ab12".repeat(12), expiresAt: st.ai.expiresAt, hours: b.hours } }; }
    if (b.action === "ai_link_revoke") { st.ai = { ...st.ai, active: false, revoked: true }; return { st: 200, j: { ok: true } }; }
    if (b.action === "ai_link_log") return { st: 200, j: { ok: true, log: st.log } };
    if (b.action === "ai_pending") return { st: 200, j: { ok: true, pending: st.pending.map(p => ({ ...p })) } };
    if (b.action === "ai_enable") { const ids = b.all ? st.pending.map(p => p.id) : b.ids; st.pending = st.pending.filter(p => !ids.includes(p.id)); return { st: 200, j: { ok: true, enabled: ids.length } }; }
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
  const h = boot(""); await h.login(); const { $, st } = h; let asked = []; h.w.confirm = (m) => { asked.push(m); return true; };
  let copied = null; Object.defineProperty(h.w.navigator, "clipboard", { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  ok(!!$("aiBox") && /🤖 رابط الذكاء الاصطناعي/.test($("aiBox").textContent) && /ما تلصقه بالمحادثة/.test($("aiBox").textContent) && /مخفي/.test($("aiBox").textContent), "the catalog tab has a '🤖 AI link' box that explains it and warns not to paste the link in the chat");
  ok($("aiState").textContent === "⚪ ما في رابط" && $("btnAiRevoke").hidden && $("aiUrlBox").hidden && $("aiPendingBox").hidden && [...$("aiHours").options].map(o => o.value).join() === "1,6,24" && $("aiHours").value === "6", "at first: 'no link', no revoke button, no URL, nothing pending, and the duration choice is 1 / 6 / 24 hours (6 selected)");
  /* creating */
  asked = []; $("aiHours").value = "24"; $("btnAiCreate").click(); await sleep(250); const cr = st.calls.find(c => c.action === "ai_link_create");
  ok(cr && cr.hours === 24 && asked.length === 0 && $("aiUrlBox").hidden === false && $("aiUrl").value === "https://api.example.test/ai/mcp/" + "ab12".repeat(12) && $("aiUrl").readOnly && /مرة وحدة بس/.test($("aiUrlBox").textContent), "creating asks for the chosen duration, shows the URL once (read-only) with the 'one time only' warning, and asks nothing when there was no link before");
  ok(/^🟢 فعّال · ينتهي بعد 23 س (59|58) د · 0 عملية · أضاف 0 من 150$/.test($("aiState").textContent) && !$("btnAiRevoke").hidden, "the status shows 'active', the time left (about 24 hours), the use and the quota; the revoke button appears: " + $("aiState").textContent);
  $("btnAiCopy").click(); await sleep(100); ok(copied === $("aiUrl").value && /اننسخ ✓/.test($("aiMsg").textContent), "'copy' puts the URL on the clipboard and confirms");
  Object.defineProperty(h.w.navigator, "clipboard", { value: { writeText: async () => { throw new Error("no"); } }, configurable: true }); $("btnAiCopy").click(); await sleep(100); ok(/اضغط مطوّلاً على الرابط وانسخه/.test($("aiMsg").textContent), "if copying is blocked it tells you to copy by hand");
  /* renewing asks first */
  asked = []; $("aiHours").value = "1"; $("btnAiCreate").click(); await sleep(250); ok(/الرابط الحالي رح يتوقف/.test(asked[0]) && st.calls.filter(c => c.action === "ai_link_create").length === 2 && /ينتهي بعد (0 س 59|1 س 0) د/.test($("aiState").textContent), "renewing while a link is active asks first ('the current one will stop'), then makes the new one (1 hour)");
  h.w.confirm = () => false; const n0 = st.calls.length; $("btnAiCreate").click(); await sleep(100); ok(st.calls.length === n0, "saying no to that question sends nothing"); h.w.confirm = () => true;
  st.aiFail = true; st.ai = { ...st.ai, active: false, expired: true }; await h.w.eval("loadAi()"); await sleep(100); $("btnAiCreate").click(); await sleep(200); ok(/المدة: ساعة أو 6 أو 24/.test($("aiMsg").textContent) && !$("btnAiCreate").disabled, "a refusal from the server is shown and the button works again"); st.aiFail = false;
  ok($("aiState").textContent === "🟠 انتهت مدته" && $("btnAiRevoke").hidden, "an expired link shows 'expired' and no revoke button");
  /* revoking */
  $("btnAiCreate").click(); await sleep(250); asked = []; h.w.confirm = (m) => { asked.push(m); return true; }; $("btnAiRevoke").click(); await sleep(250);
  ok(/إلغاء الرابط؟ بيتوقف فوراً/.test(asked[0]) && st.calls.some(c => c.action === "ai_link_revoke") && $("aiState").textContent === "⛔ ملغى" && $("aiUrl").value === "" && $("aiUrlBox").hidden && /انلغى ✓/.test($("aiMsg").textContent) && $("btnAiRevoke").hidden, "revoking asks first, then shows 'revoked', clears and hides the URL, and hides the revoke button");
  /* log */
  st.log = [{ at: new Date(2026, 9, 24, 14, 5).getTime(), tool: "create_items", summary: '{"parentId":"n1","items":[{"name":"110"}]}', ok: true }, { at: new Date(2026, 9, 24, 14, 6).getTime(), tool: "create_folder", summary: "{} → وصلت حد 150", ok: false }];
  $("aiLogBox").open = true; $("aiLogBox").dispatchEvent(new h.w.Event("toggle")); await sleep(200); const lines = [...$("aiLog").children].map(x => x.textContent);
  ok(lines.length === 2 && /^✅ 14:05 · create_items · /.test(lines[0]) && /^❌ 14:06 · create_folder · /.test(lines[1]), "opening the log lists the operations with time, tool and a ✅/❌ mark: " + lines.join(" | "));
  st.log = []; $("aiLogBox").open = false; $("aiLogBox").dispatchEvent(new h.w.Event("toggle")); $("aiLogBox").open = true; $("aiLogBox").dispatchEvent(new h.w.Event("toggle")); await sleep(150); ok($("aiLog").textContent === "ما في عمليات بعد.", "an empty log says so");
  /* pending approval */
  st.pending = [{ id: "p1", type: "folder", name: "Free Fire", path: "", note: "" }, { id: "p2", type: "item", name: "110 ماسة", path: "Free Fire", note: "", costUsd: 0.979, vip1: 1.22, vip10: 1.03, offerName: "Diamonds 110" }, { id: "p3", type: "item", name: "<img src=x onerror=alert(1)>", path: "Free Fire", note: "", costUsd: 1.663, vip1: 2.08, vip10: 1.85, offerName: "W" }];
  await h.w.eval("loadAi()"); await sleep(200); const rows = [...$("aiPending").querySelectorAll("label")];
  ok(!$("aiPendingBox").hidden && /⏳ بانتظار موافقتك \(3\)/.test($("aiPendingTitle").textContent) && rows.length === 3 && /^📁 Free Fire$/.test(rows[0].textContent) && /^💎 Free Fire › 110 ماسة · تكلفة 0\.979\$ · VIP1 1\.22\$ · VIP10 1\.03\$$/.test(rows[1].textContent), "items waiting for approval are listed with their path, cost and VIP1 / VIP10 prices");
  ok(!$("aiPending").querySelector("img") && rows[2].textContent.includes("<img src=x onerror=alert(1)>"), "names are shown as plain text (nothing can run)");
  $("btnAiEnableSel").click(); await sleep(100); ok(/اختار شي أول/.test($("aiMsg").textContent) && !st.calls.some(c => c.action === "ai_enable"), "approving with nothing selected only asks you to choose");
  rows[1].querySelector("input").checked = true; $("btnAiEnableSel").click(); await sleep(300); const en = st.calls.find(c => c.action === "ai_enable");
  ok(en && JSON.stringify(en.ids) === '["p2"]' && /تم تفعيل 1 ✓/.test($("aiMsg").textContent) && $("aiPending").querySelectorAll("label").length === 2 && /\(2\)/.test($("aiPendingTitle").textContent) && st.calls.filter(c => c.action === "list").length >= 2, "approving the selected one sends just its id, confirms, refreshes the waiting list (2 left) and reloads the catalog");
  h.w.confirm = () => false; const n1 = st.calls.length; $("btnAiEnableAll").click(); await sleep(100); ok(st.calls.length === n1, "'approve all' asks first (no = nothing sent)"); asked = []; h.w.confirm = (m) => { asked.push(m); return true; };
  $("btnAiEnableAll").click(); await sleep(300); ok(/تفعيل كل اللي بانتظار الموافقة \(2\)/.test(asked[0]) && st.calls.filter(c => c.action === "ai_enable").pop().all === true && $("aiPendingBox").hidden && /تم تفعيل 2 ✓/.test($("aiMsg").textContent), "'approve all' says how many, then approves all and hides the list");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
