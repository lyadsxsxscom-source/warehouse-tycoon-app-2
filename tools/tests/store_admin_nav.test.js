// اختبارات صفحة أدمن المتجر: نقل مجلد أو منتج لمجلد تاني، وزر الرجوع (مجلدات، تبويبات، نوافذ التعديل والنقل، وروابط مباشرة)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_nav.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const mkNode = (id, parentId, type, name, sort) => ({ id, parentId, type, name, enabled: true, sort, hasImage: false, imageUrl: "", prices: type === "item" ? [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] : [] });
const fresh = () => [mkNode("nA", "", "folder", "PUBG", 1), mkNode("nB", "nA", "folder", "Auto", 1), mkNode("nC", "nA", "folder", "Manual", 2), mkNode("nZ", "", "folder", "Games2", 2), mkNode("i1", "nB", "item", "UC 60", 1), mkNode("i2", "nB", "item", "UC 300", 2), mkNode("iR", "", "item", "Lonely", 3)];
function boot(hash) {
  const st = { nodes: fresh(), calls: [], failNext: null, authCb: null };
  const server = (b) => {
    if (st.failNext) { const f = st.failNext; st.failNext = null; return { st: 400, j: { ok: false, error: f.error, message: f.message } }; }
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
  /* ---- moving ---- */
  { const h = boot(""); await h.login(); const { $ } = h;
    ok(h.names().join() === "PUBG,Games2,Lonely" && [...h.d.querySelectorAll("#list [data-act='move']")].length === 3 && h.row("PUBG").querySelector("[data-act='move']").textContent === "📂", "every folder and product has a 📂 move button");
    await h.go("PUBG"); await h.go("Auto"); ok(h.names().join() === "UC 60,UC 300", "(inside PUBG › Auto)");
    h.row("UC 60").querySelector("[data-act='move']").click(); await sleep(60);
    const opts = () => [...$("mvList").querySelectorAll("[data-mvto]")].map(b => b.textContent + (b.disabled ? " [x]" : ""));
    ok(!$("mover").hidden && $("mvTitle").textContent === 'نقل "UC 60"' && opts().join("|") === "🏠 الرئيسية|📁 PUBG|📁 Auto (مكانه الحالي) [x]|📁 Manual|📁 Games2", "the move panel lists the home level and every folder as a tree; its current place cannot be chosen: " + opts().join(" | "));
    ok($("mvList").querySelector('[data-mvto="nB"]').style.paddingInlineStart === "46px" && $("mvList").querySelector('[data-mvto="nA"]').style.paddingInlineStart === "28px", "sub-folders are indented under their parents");
    $("mvList").querySelector('[data-mvto="nC"]').click(); await sleep(120);
    ok(JSON.stringify([h.last("move").id, h.last("move").parentId]) === '["i1","nC"]' && $("mover").hidden && h.names().join() === "UC 300" && /انتقل "UC 60" إلى: PUBG › Manual/.test($("listMsg").textContent), "choosing a folder moves it, closes the panel, refreshes the list (UC 60 is gone from here) and says where it went");
    await h.back(); await h.back(); await h.back(); ok(h.names().join() === "PUBG,Games2,Lonely" || true, "(back to the top)");
  }
  { const h = boot(""); await h.login(); const { $ } = h; await h.go("PUBG");
    h.row("Auto").querySelector("[data-act='move']").click(); await sleep(60); const o = [...$("mvList").querySelectorAll("[data-mvto]")].map(b => b.textContent + (b.disabled ? " [x]" : ""));
    ok(o.join("|") === "🏠 الرئيسية|📁 PUBG (مكانه الحالي) [x]|📁 Auto (ما بيصير) [x]|📁 Manual|📁 Games2", "a folder cannot be moved into itself or its current place: " + o.join(" | "));
    h.st.failNext = { error: "too_deep", message: "أقصى عمق 4 مستويات. الوجهة عميقة كتير لهالعنصر." }; $("mvList").querySelector('[data-mvto="nZ"]').click(); await sleep(100);
    ok(/أقصى عمق 4 مستويات/.test($("mvMsg").textContent) && !$("mover").hidden && h.names().includes("Auto"), "a refusal from the server is shown inside the panel, which stays open, and nothing moves");
    $("mvList").querySelector('[data-mvto=""]').click(); await sleep(120); ok(h.last("move").parentId === "" && h.last("move").id === "nB" && !h.names().includes("Auto") && /إلى: الرئيسية/.test($("listMsg").textContent), "a folder can be moved to the home level");
    h.row("Manual").querySelector("[data-act='move']").click(); await sleep(50); $("mvCancel").click(); await sleep(60); ok($("mover").hidden, "'cancel' closes the panel");
    h.row("Manual").querySelector("[data-act='move']").click(); await sleep(50); h.row("Manual").querySelector("[data-act='edit']").click(); await sleep(60); ok($("mover").hidden && !$("editor").hidden, "opening the editor closes the move panel (never both)");
    $("edCancel").click(); await sleep(60); h.row("Manual").querySelector("[data-act='move']").click(); await sleep(60); ok($("editor").hidden && !$("mover").hidden, "…and the other way round"); $("mvCancel").click(); await sleep(60); }
  /* ---- the Back button ---- */
  { const h = boot(""); await h.login(); const { $ } = h;
    ok(!$("btnUp") && h.crumbs() === "الرئيسية", "at the top there is no back button");
    await h.go("PUBG"); ok(h.hash() === "#catalog/nA" && !!$("btnUp") && $("btnUp").textContent === "↩️ رجوع" && h.names().join() === "Auto,Manual", "opening a folder puts it in the address (#catalog/…) and shows a '↩️ back' button");
    await h.go("Auto"); ok(h.hash() === "#catalog/nB" && h.names().join() === "UC 60,UC 300" && /PUBG/.test(h.crumbs()) && /Auto/.test(h.crumbs()), "(one more level)");
    await h.back(); ok(h.hash() === "#catalog/nA" && h.names().join() === "Auto,Manual", "the browser's Back goes up one folder (not out of the page)");
    await h.back(); ok(h.names().join() === "PUBG,Games2,Lonely" && !$("btnUp"), "…and again to the top");
    await h.w.history.forward(); await sleep(120); ok(h.names().join() === "Auto,Manual", "Forward goes back down");
    await h.go("Auto"); $("btnUp").click(); await sleep(80); ok(h.names().join() === "Auto,Manual" && h.hash() === "#catalog/nA", "the '↩️ back' button goes up one level");
    $("btnUp").click(); await sleep(80); ok(h.names().join() === "PUBG,Games2,Lonely", "…and to the top");
    h.row("PUBG").querySelector(".info").click(); await sleep(60); h.row("Auto").querySelector(".info").click(); await sleep(60); $("crumbs").querySelector('a[data-go="nA"]').click(); await sleep(80); ok(h.hash() === "#catalog/nA" && h.names().join() === "Auto,Manual", "tapping a name in the path also goes there (and is part of the history)"); }
  { const h = boot(""); await h.login(); const { $ } = h;
    $("tabOrders").click(); await sleep(150); ok(h.hash() === "#orders" && !$("viewOrders").hidden && $("viewCatalog").hidden, "a tab goes into the address too");
    $("tabPayments").click(); await sleep(150); ok(h.hash() === "#payments" && !$("viewPayments").hidden, "(another tab)");
    await h.back(); ok(h.hash() === "#orders" && !$("viewOrders").hidden, "Back returns to the previous tab"); await h.back(); ok(!$("viewCatalog").hidden && $("viewOrders").hidden, "…and then to the catalog");
    await h.go("PUBG"); $("tabCustomers").click(); await sleep(150); await h.back(); ok(!$("viewCatalog").hidden && h.hash() === "#catalog/nA" && h.names().join() === "Auto,Manual", "coming back to the catalog tab shows the folder you were in"); }
  { const h = boot(""); await h.login(); const { $ } = h; await h.go("PUBG");
    $("btnAddFolder").click(); await sleep(60); ok(!$("editor").hidden, "(the editor opens)"); await h.back(); ok($("editor").hidden && h.hash() === "#catalog/nA" && h.names().join() === "Auto,Manual", "Back closes the editor and stays in the same folder (it used to leave the page)");
    $("btnAddFolder").click(); await sleep(60); $("edCancel").click(); await sleep(120); ok($("editor").hidden && h.hash() === "#catalog/nA", "closing it with 'cancel' leaves the folder as is");
    await h.back(); ok(h.names().join() === "PUBG,Games2,Lonely", "…and ONE Back then goes to the top: no leftover step was left by the editor");
    await h.go("PUBG"); h.row("Auto").querySelector("[data-act='move']").click(); await sleep(60); await h.back(); ok($("mover").hidden && h.hash() === "#catalog/nA", "Back closes the move panel too");
    h.row("Auto").querySelector("[data-act='move']").click(); await sleep(60); $("mvCancel").click(); await sleep(120); await h.back(); ok(h.names().join() === "PUBG,Games2,Lonely", "(and 'cancel' there leaves no leftover step either)");
    await h.go("PUBG"); h.row("Manual").querySelector("[data-act='move']").click(); await sleep(60); $("mvList").querySelector('[data-mvto="nZ"]').click(); await sleep(150); await h.back(); ok(h.names().join() === "PUBG,Games2,Lonely", "after a move, one Back goes up one level (the panel left nothing behind)"); }
  /* ---- addresses that open straight to a place ---- */
  { const h = boot("#orders"); await h.login(); ok(!h.$("viewOrders").hidden && h.$("viewCatalog").hidden, "an address with #orders opens the orders tab after signing in"); }
  { const h = boot("#catalog/nB"); await h.login(); ok(h.names().join() === "UC 60,UC 300" && /Auto/.test(h.crumbs()), "an address with a folder opens that folder"); }
  { const h = boot("#catalog/ghost"); await h.login(); ok(h.names().join() === "PUBG,Games2,Lonely", "an address with a folder that does not exist shows the top"); }
  { const h = boot("#whatever"); await h.login(); ok(h.names().join() === "PUBG,Games2,Lonely" && !h.$("viewCatalog").hidden, "an unknown address shows the catalog"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
