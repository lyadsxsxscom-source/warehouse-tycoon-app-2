// اختبارات صفحة أدمن المتجر: حقل ملاحظة المجلد/المنتج (بالمحرّر، يتحمّل، يتبعت، وعلامة بالقائمة)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_note.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const mkNode = (id, parentId, type, name, sort) => ({ id, parentId, type, name, enabled: true, sort, hasImage: false, imageUrl: "", prices: type === "item" ? [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] : [] });
const fresh = () => [{ ...mkNode("nA", "", "folder", "PUBG", 1), note: "لحسابات MENA فقط." }, mkNode("nB", "nA", "folder", "Auto", 1), mkNode("nC", "nA", "folder", "Manual", 2), mkNode("nZ", "", "folder", "Games2", 2), mkNode("i1", "nB", "item", "UC 60", 1), mkNode("i2", "nB", "item", "UC 300", 2), mkNode("iR", "", "item", "Lonely", 3)];
function boot(hash) {
  const st = { nodes: fresh(), calls: [], failNext: null, authCb: null };
  const server = (b) => {
    if (st.failNext) { const f = st.failNext; st.failNext = null; return { st: 400, j: { ok: false, error: f.error, message: f.message } }; }
    if (b.action === "list") return { st: 200, j: { ok: true, nodes: st.nodes.map(n => ({ ...n })) } };
    if (b.action === "save") { const n = b.id ? st.nodes.find(x => x.id === b.id) : null; if (n) { n.name = b.name; if (b.note !== undefined) n.note = b.note; } else st.nodes.push({ ...mkNode("n" + (st.nodes.length + 1), b.parentId || "", b.type, b.name, 50), note: b.note || "" }); return { st: 200, j: { ok: true, nodes: st.nodes.map(x => ({ ...x })) } }; }
    if (b.action === "move") { const n = st.nodes.find(x => x.id === b.id); n.parentId = b.parentId || ""; n.sort = 99; return { st: 200, j: { ok: true, nodes: st.nodes.map(x => ({ ...x })) } }; }
    return { st: 200, j: { ok: true, nodes: st.nodes, methods: [], cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: 200 }, sizes: [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000], customers: [], orders: [], counts: {}, total: 0, hasKey: true, cfg2: {} } };
  };
  const dom = new JSDOM(html, { url: "https://example.test/store-admin.html" + (hash || ""), runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
    const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { st.authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
    auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth }; w.confirm = () => true;
    w.fetch = async (url, o) => { const body = JSON.parse(o.body); st.calls.push(body); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
  } });
  const d = dom.window.document, $ = id => d.getElementById(id), w = dom.window;
  const h = { st, dom, d, $, w, names: () => [...d.querySelectorAll("#list [data-row] .nm")].map(x => x.firstChild.textContent), crumbs: () => $("crumbs").textContent.replace(/\s+/g, " ").trim(),
    row: (name) => [...d.querySelectorAll("#list [data-row]")].find(r => r.querySelector(".nm").firstChild.textContent === name), last: a => st.calls.filter(c => c.action === a).pop(),
    go: async (name) => { h.row(name).querySelector(".info").click(); await sleep(60); }, back: async () => { w.history.back(); await sleep(120); }, hash: () => w.location.hash,
    login: async () => { await sleep(100); st.authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(250); } };
  return h;
}
(async () => {
  const h = boot(""); await h.login(); const { $ } = h;
  ok(!!$("edNote") && $("edNote").tagName === "TEXTAREA" && $("edNote").maxLength === 400 && /ملاحظة للزبون \(اختياري\)/.test(h.d.querySelector('label[for="edNote"]').textContent), "the editor has a 'note for the customer (optional)' box, up to 400 characters");
  const mark = (name) => h.row(name).querySelector('[data-note]');
  ok(mark("PUBG") && /📝 ملاحظة/.test(mark("PUBG").textContent) && mark("PUBG").title === "لحسابات MENA فقط." && !mark("Games2"), "a folder that has a note shows a small 📝 mark in the list (and not the ones without)");
  h.row("PUBG").querySelector("[data-act='edit']").click(); await sleep(60); ok($("edNote").value === "لحسابات MENA فقط.", "editing a folder loads its note");
  $("edNote").value = "  لحسابات MENA فقط. بعد الإرسال ما بيمكن الإلغاء.  "; $("edSave").click(); await sleep(150); const sv = h.last("save");
  ok(sv.id === "nA" && sv.note === "لحسابات MENA فقط. بعد الإرسال ما بيمكن الإلغاء." && $("editor").hidden && mark("PUBG").title.endsWith("ما بيمكن الإلغاء."), "saving sends the note (trimmed) and the list updates");
  h.row("Games2").querySelector("[data-act='edit']").click(); await sleep(60); ok($("edNote").value === "", "a folder without a note opens with an empty box"); $("edCancel").click(); await sleep(80);
  $("btnAddFolder").click(); await sleep(60); ok($("edNote").value === "", "a new folder starts with no note (even right after editing another)"); $("edName").value = "Free Fire"; $("edNote").value = "ملاحظة جديدة"; $("edSave").click(); await sleep(150); ok(h.last("save").note === "ملاحظة جديدة" && h.last("save").type === "folder" && !!mark("Free Fire"), "a new folder is created with its note");
  h.row("PUBG").querySelector("[data-act='edit']").click(); await sleep(60); $("edNote").value = ""; $("edSave").click(); await sleep(150); ok(h.last("save").note === "" && !mark("PUBG"), "clearing the box removes the note (and the mark)");
  await h.go("Games2"); $("btnAddItem").click(); await sleep(60); $("edName").value = "Item"; $("edPrice").value = "1"; $("edNote").value = "للمنتج"; $("edSave").click(); await sleep(150); ok(h.last("save").note === "للمنتج" && h.last("save").type === "item", "a product can have a note too");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
