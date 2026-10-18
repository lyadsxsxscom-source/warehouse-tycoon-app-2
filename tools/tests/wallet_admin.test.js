// اختبارات صفحة الأدمن: علامة "هالمحفظة مستخدمة بحساب تاني" على طلبات السحب + زر فحص الطلبات القديمة
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/wallet_admin.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/admin.html"), "utf8").replace(/<script src="[^"]*"><\/script>/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = []; let reindexMode = "ok"; const playerGets = [];
const REQS = [
  { id: "r1", d: { status: "pending", coin: "usdt", network: "TRC20", amount: 6, amountUsd: 6, uid: "u2", displayName: "Sara", email: "s@x.com", walletAddress: "TXyzAbc", createdAt: 3, walletShared: true, walletOtherUids: ["u1", "gone"] } },
  { id: "r2", d: { status: "fulfilled", coin: "usdt", network: "TRC20", amount: 8, amountUsd: 8, uid: "u3", displayName: "Omar", email: "o@x.com", walletAddress: "TSolo", createdAt: 2, walletShared: false, walletOtherUids: [] } },
  { id: "r3", d: { status: "rejected", coin: "usdt", network: "TRC20", amount: 5, amountUsd: 5, uid: "u4", displayName: "Lina", email: "l@x.com", walletAddress: "TXyzAbc", createdAt: 1, walletShared: true, walletOtherUids: ["u1"] } },
];
const PLAYERS = { u1: { displayName: "Ahmad <img src=x onerror=alert(1)>", email: "a@x.com", activeDays: 12, totalPointsEarned: 5200.4, balanceUsd: 3.5 } };
const dom = new JSDOM(html, { url: "https://example.test/admin", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.confirm = () => true; w.HTMLElement.prototype.scrollIntoView = () => {};
  const snap = () => ({ empty: false, forEach(fn) { REQS.forEach(r => fn({ id: r.id, data: () => r.d })); } });
  const coll = (name) => { const o = { orderBy() { return o; }, limit() { return o; }, where() { return o; }, onSnapshot(cb) { if (name === "withdrawRequests") setTimeout(() => cb(snap()), 0); return () => {}; },
    get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {}, empty: true }),
    doc(id) { return { get: async () => {
      if (name === "players") { playerGets.push(id); return PLAYERS[id] ? { exists: true, data: () => PLAYERS[id] } : { exists: false, data: () => ({}) }; }
      if (name === "withdrawRequests") { const r = REQS.find(x => x.id === id); return r ? { exists: true, data: () => r.d } : { exists: false, data: () => ({}) }; }
      return { exists: false, data: () => ({}) }; } }; } }; return o; };
  const fs_ = () => ({ collection: coll }); fs_.FieldValue = { increment: x => x };
  w.firebase = { initializeApp() {}, apps: [], auth: () => ({ onAuthStateChanged(cb) { setTimeout(() => cb({ uid: ADMIN }), 0); }, currentUser: { uid: ADMIN, getIdToken: async () => "ADMTOKEN" }, signOut() {} }), firestore: fs_ };
  w.fetch = async (url, o) => { const body = o && o.body ? JSON.parse(o.body) : {}; calls.push({ url: String(url), auth: o && o.headers && o.headers.Authorization, body });
    const R = (j, st = 200) => ({ ok: st < 400, status: st, json: async () => j });
    if (String(url).endsWith("/admin/wallet-reindex")) { if (reindexMode === "fail") return R({ ok: false, error: "server_error" }, 500); return R({ ok: true, requests: 40, wallets: 31, sharedWallets: 2, flaggedRequests: 5, capped: reindexMode === "capped" }); }
    return R({ ok: true, orders: [], items: [], settings: {} }); };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
(async () => {
  await sleep(600); $("tabWithdraws").click(); await sleep(300);
  const cards = [...d.querySelectorAll("#withdrawsList .req-card")];
  ok(cards.length === 3, "the three requests are listed");
  const warn = id => d.querySelector(`#withdrawsList [data-walwho="${id}"]`);
  ok(warn("r1") && /هالمحفظة مستخدمة بحساب تاني \(2\)/.test(warn("r1").closest(".wal-warn").textContent), "a pending request whose wallet is shared shows the warning with the number of other accounts");
  ok(!warn("r2") && cards.find(c => /Omar/.test(c.textContent)).querySelector(".wal-warn") === null, "a request with its own wallet has no warning");
  ok(!!warn("r3"), "the warning also shows on old (rejected) requests, so history is visible");
  ok(/color:var\(--ember\)/.test(warn("r1").closest(".wal-warn").getAttribute("style")), "the warning is in the alert colour");
  ok(playerGets.length === 0 || playerGets.every(id => id !== "u1"), "nothing about the other accounts is loaded until the admin asks");

  /* ---- who? ---- */
  warn("r1").click(); await sleep(300);
  const box = d.querySelector('[data-walbox="r1"]');
  ok(/Ahmad/.test(box.textContent) && /a@x\.com/.test(box.textContent) && /أيام نشاط 12/.test(box.textContent) && /نقاط مكتسبة 5200/.test(box.textContent) && /\$3\.50/.test(box.textContent), "'who?' shows the other account: name, email, active days, points and balance");
  ok(/حساب محذوف/.test(box.textContent), "an account that no longer exists is shown as deleted");
  ok(box.querySelector("img") === null && /<img/.test(box.textContent), "player names are shown as plain text (no HTML runs)");
  const before = playerGets.length; warn("r1").click(); await sleep(50);
  ok(box.style.display === "none" && playerGets.length === before, "pressing again hides it without loading again");
  warn("r1").click(); await sleep(50); ok(box.style.display === "block", "and shows it again");

  /* ---- re-index button ---- */
  ok(!!$("btnWalletReindex") && $("btnWalletReindex").closest("#viewWithdraws") !== null, "the re-index button is at the top of the withdrawals tab");
  $("btnWalletReindex").click(); await sleep(250);
  const rc = calls.find(c => c.url.endsWith("/admin/wallet-reindex"));
  ok(rc && rc.auth === "Bearer ADMTOKEN" && /40 طلب، 31 محفظة، 2 محفظة مشتركة، 5 طلب معلّم/.test($("walletReindexOut").textContent) && !$("btnWalletReindex").disabled, "it calls the server with the admin token and reports the counts");
  reindexMode = "capped"; $("btnWalletReindex").click(); await sleep(250);
  ok(/آخر 1000 طلب/.test($("walletReindexOut").textContent), "if the server only scanned the last 1000 requests it says so");
  reindexMode = "fail"; $("btnWalletReindex").click(); await sleep(250);
  ok(/تعذّر/.test($("walletReindexOut").textContent) && !$("btnWalletReindex").disabled, "a server error is shown and the button works again");
  const actions = [...d.querySelectorAll("#withdrawsList .req-actions")]; ok(actions.length === 3 && actions.filter(a => a.style.display !== "none").length === 1 && d.querySelector('#withdrawsList button[data-wdact="fulfill"][data-id="r1"]') !== null, "the normal fulfil/reject buttons are still there, visible only for the pending request");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
