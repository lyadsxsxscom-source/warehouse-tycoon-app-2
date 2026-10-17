// اختبارات صفحة الأدمن: بطاقة بوت تلغرام (ربط البوت وفحص حالته)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/telegram_admin.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/admin.html"), "utf8").replace(/<script src="[^"]*"><\/script>/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2"; const calls = []; let mode = "ok";
const dom = new JSDOM(html, { url: "https://example.test/admin", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
  const fs_ = () => ({ collection() { return q; } }); fs_.FieldValue = { increment: x => x };
  w.firebase = { initializeApp() {}, apps: [], auth: () => ({ onAuthStateChanged(cb) { setTimeout(() => cb({ uid: ADMIN }), 0); }, currentUser: { uid: ADMIN, getIdToken: async () => "ADMTOKEN" }, signOut() {} }), firestore: fs_ };
  w.fetch = async (url, o) => { const body = o && o.body ? JSON.parse(o.body) : {}; calls.push({ url: String(url), auth: o && o.headers && o.headers.Authorization, body });
    const R = (j, st = 200) => ({ ok: st < 400, status: st, json: async () => j });
    if (String(url).endsWith("/admin/telegram")) {
      if (mode === "notoken") return R({ ok: false, error: "no_token", message: "x" }, 503);
      if (body.action === "setup") return R({ ok: true, setupOk: mode !== "setupfail", setupMessage: mode === "setupfail" ? "bad webhook url <b>x</b>" : "", username: "YardovaLoginBot", expectedUsername: "YardovaLoginBot", webhookUrl: "https://postback.ly-ad.de/telegram/webhook", webhookOk: mode !== "setupfail", pending: 0, lastError: "" });
      return R({ ok: true, setupOk: null, username: mode === "wrongbot" ? "OtherBot" : "YardovaLoginBot", expectedUsername: "YardovaLoginBot", webhookOk: mode !== "nohook", pending: 3, lastError: mode === "err" ? "Wrong response from the webhook: 401" : "" });
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
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
