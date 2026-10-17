// اختبارات صفحة الأدمن: بطاقة بوت تلغرام (ربط البوت وفحص حالته)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/telegram_admin.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/admin.html"), "utf8").replace(/<script src="[^"]*"><\/script>/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2"; const calls = []; let mode = "ok";
let chan = { name: "@YardovaGame", canCheck: true, required: false, note: "" }, cbOk = true;
const dom = new JSDOM(html, { url: "https://example.test/admin", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
  const fs_ = () => ({ collection() { return q; } }); fs_.FieldValue = { increment: x => x };
  w.firebase = { initializeApp() {}, apps: [], auth: () => ({ onAuthStateChanged(cb) { setTimeout(() => cb({ uid: ADMIN }), 0); }, currentUser: { uid: ADMIN, getIdToken: async () => "ADMTOKEN" }, signOut() {} }), firestore: fs_ };
  w.fetch = async (url, o) => { const body = o && o.body ? JSON.parse(o.body) : {}; calls.push({ url: String(url), auth: o && o.headers && o.headers.Authorization, body });
    const R = (j, st = 200) => ({ ok: st < 400, status: st, json: async () => j });
    if (String(url).endsWith("/admin/telegram")) {
      if (body.action === "require") { if (body.value && !chan.canCheck) return R({ ok: false, error: "bot_not_admin", message: "\u0636\u064a\u0641 \u0627\u0644\u0628\u0648\u062a \u0643\u0623\u062f\u0645\u0646 \u0628\u0642\u0646\u0627\u0629 @YardovaGame \u0623\u0648\u0644\u060c \u0648\u0628\u0639\u062f\u064a\u0646 \u0641\u0639\u0651\u0644 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0637." }, 400); chan.required = body.value === true; }
      if (mode === "notoken") return R({ ok: false, error: "no_token", message: "x" }, 503);
      if (body.action === "setup") return R({ ok: true, setupOk: mode !== "setupfail", setupMessage: mode === "setupfail" ? "bad webhook url <b>x</b>" : "", username: "YardovaLoginBot", expectedUsername: "YardovaLoginBot", webhookUrl: "https://postback.ly-ad.de/telegram/webhook", webhookOk: mode !== "setupfail", pending: 0, lastError: "", callbacksOk: true, channel: { ...chan } });
      return R({ ok: true, setupOk: null, username: mode === "wrongbot" ? "OtherBot" : "YardovaLoginBot", expectedUsername: "YardovaLoginBot", webhookOk: mode !== "nohook", pending: 3, lastError: mode === "err" ? "Wrong response from the webhook: 401" : "", callbacksOk: cbOk, channel: { ...chan } });
    }
    return R({ ok: true, orders: [], items: [], settings: {} }); };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
(async () => {
  await sleep(500); $("tabMessages").click(); await sleep(300);
  ok(!!$("btnTgSetup") && !!$("btnTgStatus") && /TELEGRAM_BOT_TOKEN/.test($("btnTgSetup").closest(".card").textContent) && /ما بيظهر هون أبداً/.test($("btnTgSetup").closest(".card").textContent), "the Messages tab has a Telegram bot card that explains the steps and says the token is never shown");
  $("btnTgStatus").click(); await sleep(200);
  const c1 = calls.filter(c => c.url.endsWith("/admin/telegram")).pop();
  ok(c1.body.action === "status" && c1.auth === "Bearer ADMTOKEN" && /@YardovaLoginBot/.test($("tgAdminOut").textContent) && /مربوط بالسيرفر/.test($("tgAdminOut").textContent) && /رسائل معلّقة عند تلغرام: 3/.test($("tgAdminOut").textContent), "'Check status' shows the bot, the server link and pending messages");
  mode = "nohook"; $("btnTgStatus").click(); await sleep(200); ok(/⚠️ مو مربوط بالسيرفر/.test($("tgAdminOut").textContent), "a bot that is not connected is flagged");
  mode = "wrongbot"; $("btnTgStatus").click(); await sleep(200); ok(/المتوقع @YardovaLoginBot/.test($("tgAdminOut").textContent), "a token of a different bot is flagged");
  mode = "err"; $("btnTgStatus").click(); await sleep(200); ok(/آخر خطأ من تلغرام: Wrong response/.test($("tgAdminOut").textContent), "Telegram's last delivery error is shown");
  mode = "ok"; $("btnTgSetup").click(); await sleep(200);
  ok(calls.filter(c => c.url.endsWith("/admin/telegram")).pop().body.action === "setup" && /تم الربط للتو/.test($("tgAdminOut").textContent), "'Connect the bot' sends setup and confirms");
  mode = "setupfail"; $("btnTgSetup").click(); await sleep(200);
  ok(/فشل الربط/.test($("tgAdminOut").textContent) && d.querySelector("#tgAdminOut b") === null && /<b>x<\/b>/.test($("tgAdminOut").textContent), "a failure message from Telegram is shown as plain text");
  mode = "notoken"; $("btnTgStatus").click(); await sleep(200);
  ok(/التوكن مو مضاف بعد/.test($("tgAdminOut").textContent) && /Cloudflare/.test($("tgAdminOut").textContent), "without the token secret the admin gets the exact instruction");
  /* ---- the channel requirement switch ---- */
  mode = "ok"; chan = { name: "@YardovaGame", canCheck: true, required: false, note: "" }; cbOk = true;
  const tgOut = () => $("tgAdminOut").textContent, tgBtn = () => $("btnTgRequire");
  const lastTg = () => calls.filter(c => c.url.endsWith("/admin/telegram")).pop();
  $("btnTgStatus").click(); await sleep(200);
  ok(/\u0627\u0644\u0628\u0648\u062a \u0623\u062f\u0645\u0646 \u0628\u0642\u0646\u0627\u0629 @YardovaGame/.test(tgOut()) && /\u0627\u0634\u062a\u0631\u0627\u0637 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u0628\u0627\u0644\u0642\u0646\u0627\u0629: \u0645\u0648\u0642\u0648\u0641/.test(tgOut()), "the status says the bot is an admin of the channel and the requirement is OFF");
  ok(!tgBtn().disabled && /\u062a\u0641\u0639\u064a\u0644 \u0627\u0634\u062a\u0631\u0627\u0637 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643/.test(tgBtn().textContent), "the switch button is enabled and offers to turn it on");
  tgBtn().click(); await sleep(250);
  ok(lastTg().body.action === "require" && lastTg().body.value === true && lastTg().auth === "Bearer ADMTOKEN", "turning it on sends require: true with the admin token");
  ok(/\u0627\u0634\u062a\u0631\u0627\u0637 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u0628\u0627\u0644\u0642\u0646\u0627\u0629: \u0634\u063a\u0651\u0627\u0644/.test(tgOut()) && /\u0625\u064a\u0642\u0627\u0641/.test(tgBtn().textContent), "afterwards it says ON and the button now offers to turn it off");
  tgBtn().click(); await sleep(250);
  ok(lastTg().body.value === false && /\u0645\u0648\u0642\u0648\u0641/.test(tgOut()), "pressing again turns it off");
  chan.canCheck = false; chan.note = "Bad Request: chat not found"; $("btnTgStatus").click(); await sleep(200);
  ok(/\u0627\u0644\u0628\u0648\u062a \u0645\u0648 \u0623\u062f\u0645\u0646 \u0628\u0642\u0646\u0627\u0629 @YardovaGame/.test(tgOut()) && /chat not found/.test(tgOut()), "if the bot is not an admin of the channel the status warns and shows Telegram's reason");
  tgBtn().click(); await sleep(250);
  ok(/\u062a\u0639\u0630\u0651\u0631/.test(tgOut()) && /\u0636\u064a\u0641 \u0627\u0644\u0628\u0648\u062a \u0643\u0623\u062f\u0645\u0646/.test(tgOut()), "trying to switch it on then shows the server's instruction to add the bot as admin");
  chan.canCheck = true; cbOk = false; $("btnTgStatus").click(); await sleep(200);
  ok(/\u0627\u0636\u063a\u0637 "\u0631\u0628\u0637 \u0627\u0644\u0628\u0648\u062a \u0628\u0627\u0644\u0633\u064a\u0631\u0641\u0631" \u0643\u0645\u0627\u0646 \u0645\u0631\u0629/.test(tgOut()), "an old bot link that does not receive button clicks is flagged: press 'link the bot' again");
  ok(/\u0644\u0627\u0634\u062a\u0631\u0627\u0637 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u0628\u0627\u0644\u0642\u0646\u0627\u0629/.test($("btnTgSetup").closest(".card").textContent), "the card's instructions include the extra step for the channel requirement");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
