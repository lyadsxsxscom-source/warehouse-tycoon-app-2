// اختبارات صفحة الأدمن: بطاقة سياسة عدم النشاط بتبويب اللاعبين
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/inactivity_admin.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/admin.html"), "utf8").replace(/<script src="[^"]*"><\/script>/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = []; let confirmAnswer = true, mode = "ok";
let cfg = { enabled: false, remindDays: 15, warnDays: 35, actionDays: 60, graceDays: 7, maxActions: 20 };
let suspended = [{ uid: "s1", email: "s1@x.com", name: "Sam <b>X</b>", balanceUsd: 3.5, idleDays: 75 }];
const PLAN = [
  { uid: "a", email: "a@x.com", name: "Ali", idleDays: 16, action: "remind", counted: null, reason: "" },
  { uid: "b", email: "b@x.com", name: "Bana <img src=x onerror=alert(1)>", idleDays: 36, action: "warn", counted: false, reason: "نقاطه من المكافأة اليومية وهدية البداية بس" },
  { uid: "c", email: "c@x.com", name: "Cem", idleDays: 61, action: "suspend", counted: true, reason: "عنده رصيد" },
  { uid: "d", email: "d@x.com", name: "Dina", idleDays: 62, action: "delete", counted: false, reason: "نقاطه من المكافأة اليومية وهدية البداية بس" },
];
const dom = new JSDOM(html, { url: "https://example.test/admin", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.confirm = () => confirmAnswer; w.HTMLElement.prototype.scrollIntoView = () => {};
  const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
  const fs_ = () => ({ collection() { return q; } }); fs_.FieldValue = { increment: x => x };
  w.firebase = { initializeApp() {}, apps: [], auth: () => ({ onAuthStateChanged(cb) { setTimeout(() => cb({ uid: ADMIN }), 0); }, currentUser: { uid: ADMIN, getIdToken: async () => "ADMTOKEN" }, signOut() {} }), firestore: fs_ };
  w.fetch = async (url, o) => { const body = o && o.body ? JSON.parse(o.body) : {}; calls.push({ url: String(url), auth: o && o.headers && o.headers.Authorization, body });
    const R = (j, st = 200) => ({ ok: st < 400, status: st, json: async () => j });
    if (String(url).endsWith("/admin/inactivity")) {
      if (mode === "fail") return R({ ok: false, error: "server_error" }, 500);
      if (body.action === "get") return R({ ok: true, config: cfg, lastRunAt: 1792000000000, lastRunSummary: '{"remind":2,"warn":1,"suspend":0,"delete":0,"skipped":0}' });
      if (body.action === "save") { cfg = { ...body.config, remindDays: Math.max(1, body.config.remindDays), warnDays: Math.max(body.config.remindDays + 1, body.config.warnDays) }; return R({ ok: true, config: cfg }); }
      if (body.action === "dryrun") return R({ ok: true, config: cfg, candidates: mode === "empty" ? 3 : 40, capped: mode === "capped", plan: mode === "empty" ? [] : PLAN, planTotal: mode === "empty" ? 0 : PLAN.length });
      if (body.action === "run") return R(cfg.enabled ? { ok: true, done: { remind: 1, warn: 1, suspend: 1, delete: 1, skipped: 2 } } : { ok: true, skipped: "disabled" });
      if (body.action === "suspended") return R({ ok: true, players: suspended });
      if (body.action === "unsuspend") { suspended = suspended.filter(x => x.uid !== body.uid); return R({ ok: true }); }
    }
    return R({ ok: true, players: [], orders: [], items: [], settings: {} }); };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const type = (id, v) => { $(id).value = v; };
const last = (a) => calls.filter(c => c.url.endsWith("/admin/inactivity") && c.body.action === a).pop();
(async () => {
  await sleep(500); $("tabPlayers").click(); await sleep(400);
  ok(!!$("inactCard") && $("inactCard").closest("#viewPlayers") !== null, "the Players tab has the 'inactivity policy' card");
  ok(/المحسوب/.test($("inactCard").textContent) && /بدون تنفيذ/.test($("inactCard").textContent), "the card explains the counted / not-counted rule and the safe trial");
  ok($("inactEnabled").checked === false && $("inactRemind").value === "15" && $("inactWarn").value === "35" && $("inactAction").value === "60" && $("inactGrace").value === "7" && $("inactMax").value === "20", "opening the tab loads the settings: OFF, 15 / 35 / 60 days, 7 grace, 20 max");
  ok(last("get").auth === "Bearer ADMTOKEN" && /آخر تشغيل/.test($("inactMsg").textContent) && /"remind":2/.test($("inactMsg").textContent), "it shows the last run's summary");

  /* ---- save ---- */
  $("inactEnabled").checked = true; type("inactRemind", "10"); type("inactWarn", "5"); type("inactAction", "40"); type("inactGrace", "5"); type("inactMax", "10");
  $("btnInactSave").click(); await sleep(250);
  const sv = last("save");
  ok(sv.body.config.enabled === true && sv.body.config.remindDays === 10 && sv.body.config.warnDays === 5 && sv.body.config.actionDays === 40 && sv.body.config.graceDays === 5 && sv.body.config.maxActions === 10, "saving sends all the numbers and the switch");
  ok($("inactWarn").value === "11" && /انحفظ/.test($("inactMsg").textContent) && /مفعّلة/.test($("inactMsg").textContent), "the screen shows the values the server corrected (warning cannot come before the reminder)");

  /* ---- dry run ---- */
  $("btnInactDry").click(); await sleep(300);
  const rows = [...d.querySelectorAll("#inactOut tbody tr")];
  ok(last("dryrun") && rows.length === 4 && /هاي تجربة بس/.test($("inactMsg").textContent) && /40 حساب غايب، 4 منهم/.test($("inactMsg").textContent), "the dry run lists the planned actions and says nothing was changed");
  ok(/تذكير: 1 · تحذير: 1 · 🔒 تعليق: 1 · 🗑 حذف: 1/.test($("inactOut").textContent), "with a summary of how many of each action");
  ok(/✅/.test(rows[2].textContent) && /عنده رصيد/.test(rows[2].textContent) && /تعليق/.test(rows[2].textContent) && /❌/.test(rows[3].textContent) && /المكافأة اليومية/.test(rows[3].textContent) && /حذف/.test(rows[3].textContent), "each row shows whether the account counts, why, and what will happen (suspend or delete)");
  ok($("inactOut").querySelector("img") === null && /<img/.test($("inactOut").textContent), "player names are shown as plain text");
  mode = "capped"; $("btnInactDry").click(); await sleep(250); ok(/أول 500 حساب/.test($("inactOut").textContent), "if only the first 500 accounts were checked it says so");
  mode = "empty"; $("btnInactDry").click(); await sleep(250); ok(/ما في حسابات بتحتاج إجراء/.test($("inactOut").textContent), "an empty plan says so clearly");
  mode = "ok";

  /* ---- run now ---- */
  const runsBefore = calls.filter(c => c.body.action === "run").length;
  confirmAnswer = false; $("btnInactRun").click(); await sleep(150);
  ok(calls.filter(c => c.body.action === "run").length === runsBefore, "'run now' asks for confirmation first and cancelling does nothing");
  confirmAnswer = true; $("btnInactRun").click(); await sleep(250);
  ok(last("run").body.confirm === true && /تذكير 1، تحذير 1، تعليق 1، حذف 1، تخطّينا 2/.test($("inactMsg").textContent), "confirming runs it with confirm: true and reports what was done");
  cfg.enabled = false; $("btnInactRun").click(); await sleep(250); ok(/السياسة مطفية/.test($("inactMsg").textContent), "if the policy is OFF the screen says to switch it on first");

  /* ---- suspended accounts ---- */
  $("btnInactSusp").click(); await sleep(250);
  ok(/s1@x\.com/.test($("inactOut").textContent) && /\$3\.50/.test($("inactOut").textContent) && /75 يوم/.test($("inactOut").textContent) && $("inactOut").querySelector("b") === null, "the suspended list shows email, balance and idle days (names as plain text)");
  confirmAnswer = false; d.querySelector('[data-unsusp="s1"]').click(); await sleep(100);
  ok(!calls.some(c => c.body.action === "unsuspend"), "lifting a suspension asks first");
  confirmAnswer = true; d.querySelector('[data-unsusp="s1"]').click(); await sleep(350);
  ok(last("unsuspend").body.uid === "s1" && /ما في حسابات معلّقة/.test($("inactOut").textContent), "confirming lifts it and refreshes the list");

  /* ---- errors ---- */
  mode = "fail"; $("btnInactDry").click(); await sleep(250); ok(/تعذّرت التجربة/.test($("inactMsg").textContent), "a server error is shown");
  $("btnInactSave").click(); await sleep(250); ok(/تعذّر الحفظ/.test($("inactMsg").textContent), "also when saving");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
