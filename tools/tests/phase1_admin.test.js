// اختبارات صفحة الأدمن: تبويب الرسائل (إشعار للكل أو للاعب واحد) + تبويب اللاعبين (فحص سريع)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/phase1_admin.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/admin.html"), "utf8").replace(/<script src="[^"]*"><\/script>/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = []; let confirmAnswer = true;
const PLAYERS = [
  { uid: "u-sara", email: "sara@gmail.com", name: "Sara", firstSeenDate: "2026-10-08", firstSeenAt: Date.now() - 2 * 86400000, lastActiveDate: "2026-10-12", activeDays: 3, adsWatched: 4, workersRented: 1, offerPoints: 0, withdrawCount: 0, withdrawUsd: 0, balanceUsd: 0.2 },
  { uid: "u-ahmad", email: "ahmad@gmail.com", name: "Ahmad", firstSeenDate: "legacy", firstSeenAt: 0, lastActiveDate: "2026-10-11", activeDays: 15, adsWatched: 0, workersRented: 7, offerPoints: 0, withdrawCount: 0, withdrawUsd: 0, balanceUsd: 0.5 },
];
let batchPlan = [30, 30, 5];
const dom = new JSDOM(html, { url: "https://example.test/admin", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.confirm = () => confirmAnswer;
  const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
  const fs_ = () => ({ collection() { return q; } }); fs_.FieldValue = { increment: x => x };
  w.firebase = { initializeApp() {}, apps: [], auth: () => ({ onAuthStateChanged(cb) { setTimeout(() => cb({ uid: ADMIN }), 0); }, currentUser: { uid: ADMIN, getIdToken: async () => "ADMTOKEN" }, signOut() {} }), firestore: fs_ }; w.firebase.auth.GoogleAuthProvider = function () {};
  let sendIdx = 0;
  w.fetch = async (url, o) => {
    const body = o && o.body ? JSON.parse(o.body) : {}; calls.push({ url, auth: o && o.headers && o.headers.Authorization, body });
    const R = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
    if (String(url).endsWith("/admin/players")) return R({ ok: true, players: PLAYERS, now: Date.now() });
    if (String(url).endsWith("/admin/message")) {
      if (body.action === "list") return R({ ok: true, messages: [
        { id: "m1", title: "<img src=x onerror=alert(1)>", body: "x", target: "all", toEmail: "", createdAt: Date.now() - 3600000, status: "done", sent: 8, failed: 1, recipients: 9 },
        { id: "m2", title: "تحديث", body: "y", target: "one", toEmail: "sara@gmail.com", createdAt: Date.now() - 7200000, status: "done", sent: 1, failed: 0, recipients: 1 } ] });
      if (body.action === "preview") return R({ ok: true, recipients: body.target === "one" ? (body.uid === "u-ahmad" ? 0 : 1) : 65 });
      if (body.action === "send" && body.target === "one") return R(body.uid === "u-ahmad" ? { ok: false, error: "no_token", message: "هالجهاز ما سجّل إشعارات" } : { ok: true, id: "one1abc", sent: 1, failed: 0, done: true }, body.uid === "u-ahmad" ? 409 : 200);
      if (body.action === "send" && body.target === "all") { const n = batchPlan[sendIdx++]; return R({ ok: true, id: "all1abcd", processed: n, sent: n - (sendIdx === 1 ? 1 : 0), failed: sendIdx === 1 ? 1 : 0, done: n < 30 }); }
      if (body.action === "finish") return R({ ok: true });
    }
    return R({ ok: false }, 400);
  };
} });
const w = dom.window, d = w.document;
const msgCalls = () => calls.filter(c => String(c.url).endsWith("/admin/message"));
(async () => {
  await sleep(400);
  ok(!!d.getElementById("tabMessages") && !!d.getElementById("viewMessages"), "admin has the Messages tab");
  d.getElementById("tabMessages").click(); await sleep(250);
  ok(msgCalls().some(c => c.body.action === "list" && c.auth === "Bearer ADMTOKEN"), "opening the tab loads the log with the admin token");
  const rows = [...d.querySelectorAll("#msgLog tr")].map(r => r.textContent.replace(/\s+/g, " "));
  ok(rows.length === 2 && /8 \/ 1/.test(rows[0]) && /sara@gmail\.com/.test(rows[1]), "the log shows recipients and delivered/failed counts");
  ok(!d.querySelector("#msgLog img") && /<img/.test(d.getElementById("msgLog").textContent), "a message title containing HTML is shown as plain text");
  ok(calls.some(c => String(c.url).endsWith("/admin/players")), "the player list is loaded so one player can be picked");

  // validation: nothing sent without a title/body
  const before = msgCalls().length;
  d.getElementById("btnMsgSend").click(); await sleep(50);
  ok(msgCalls().length === before && /اكتب العنوان والنص/.test(d.getElementById("msgStatus").textContent), "empty message is not sent");

  // single player
  const tgt = d.getElementById("msgTarget"); tgt.value = "one"; tgt.dispatchEvent(new w.Event("change"));
  ok(d.getElementById("msgOneBox").style.display === "block", "choosing 'one player' shows the search box");
  d.getElementById("msgTitle").value = "مرحبا"; d.getElementById("msgBody").value = "نص الرسالة";
  d.getElementById("btnMsgSend").click(); await sleep(50);
  ok(/اختر لاعب/.test(d.getElementById("msgStatus").textContent), "sending to one player without choosing one is refused");
  const s = d.getElementById("msgSearch"); s.value = "SARA"; s.dispatchEvent(new w.Event("input"));
  const found = d.querySelectorAll("#msgMatches button"); ok(found.length === 1 && /sara@gmail\.com/.test(found[0].textContent), "search finds the player by email (case-insensitive)");
  found[0].click();
  ok(/المستلم: sara@gmail\.com/.test(d.getElementById("msgChosen").textContent), "the chosen player is shown");
  d.getElementById("btnMsgPreview").click(); await sleep(60);
  ok(/جهاز اللاعب مسجّل/.test(d.getElementById("msgPreview").textContent), "preview says the player's device is registered");
  d.getElementById("msgTitleTr").value = "Merhaba"; d.getElementById("msgBodyTr").value = "Metin";
  d.getElementById("btnMsgSend").click(); await sleep(120);
  const sendOne = msgCalls().find(c => c.body.action === "send" && c.body.target === "one");
  ok(sendOne && sendOne.body.uid === "u-sara" && sendOne.body.email === "sara@gmail.com" && sendOne.body.title === "مرحبا" && sendOne.body.title_tr === "Merhaba" && sendOne.body.body_tr === "Metin", "the message, the optional translations and the player are sent");
  ok(/انرسلت/.test(d.getElementById("msgStatus").textContent) && !d.getElementById("btnMsgSend").disabled, "success is shown and the button is re-enabled");
  // a player without a registered device
  const s2 = d.getElementById("msgSearch"); s2.value = "ahmad"; s2.dispatchEvent(new w.Event("input")); d.querySelector("#msgMatches button").click();
  d.getElementById("btnMsgSend").click(); await sleep(120);
  ok(/ما سجّل إشعارات/.test(d.getElementById("msgStatus").textContent), "the server's reason is shown when the player has no registered device");

  // everyone: cancelled
  tgt.value = "all"; tgt.dispatchEvent(new w.Event("change")); confirmAnswer = false;
  const n0 = msgCalls().filter(c => c.body.action === "send").length;
  d.getElementById("btnMsgSend").click(); await sleep(120);
  ok(msgCalls().filter(c => c.body.action === "send").length === n0 && /انلغى/.test(d.getElementById("msgStatus").textContent), "declining the confirmation sends nothing");
  // everyone: confirmed, 3 batches
  confirmAnswer = true; d.getElementById("btnMsgSend").click(); await sleep(300);
  const sends = msgCalls().filter(c => c.body.action === "send" && c.body.target === "all");
  ok(sends.length === 3 && sends.map(c => c.body.offset).join() === "0,30,60", "broadcast goes in 3 batches with offsets 0, 30, 60");
  ok(sends[0].body.id === null && sends[1].body.id === "all1abcd" && sends[2].body.id === "all1abcd" && sends.every(c => c.body.expected === 65), "the log id from the first batch is reused");
  const fin = msgCalls().find(c => c.body.action === "finish");
  ok(fin && fin.body.id === "all1abcd" && fin.body.sent === 64 && fin.body.failed === 1 && fin.body.recipients === 65, "finish reports the totals (64 delivered, 1 failed of 65)");
  ok(/خلصنا/.test(d.getElementById("msgStatus").textContent) && /64/.test(d.getElementById("msgStatus").textContent), "the final result is shown");

  // players tab still works
  d.getElementById("tabPlayers").click(); await sleep(200);
  ok(d.querySelectorAll("#playersTable tr").length === 2 && /sara@gmail\.com/.test(d.getElementById("playersTable").textContent), "the Players tab still lists players");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
