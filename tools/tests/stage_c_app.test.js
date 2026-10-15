// اختبارات المرحلة C (التطبيق): رسائل Yardova بالبريد، النقطة الحمراء، المقروء، وخيار "أخبار وتحديثات"
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/stage_c_app.test.js
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WWW = path.join(__dirname, "../../www");
const RAW = fs.readFileSync(path.join(WWW, "index.html"), "utf8"), I18N = fs.readFileSync(path.join(WWW, "i18n.js"), "utf8");
const STATE = { points: 260, totalPointsEarned: 400, balanceUsd: 0, workersRented: 1, adsWatched: 5, activeDays: 4, lastWithdrawAt: 0, boostUntil: 0, tasks: [], shelves: [], daily: { streak: 0, lastClaim: "", rewards: [10, 10, 20, 10, 10, 10, 60] }, referral: { code: "ABC123", invited: 0, active: 0, earnings: 0, referred: false, rewarded: false, canEnter: false, progress: { days: 4, ads: 5 }, cfg: { inviteeBonus: 50, inviterReward: 150, commissionPct: 5, requiredDays: 3, requiredAds: 10, windowHours: 72 } } };
const NOW = Date.now();
const MSGS = [
  { id: "m3", title: "نسخة جديدة", body: "سطر أول\nسطر ثاني", createdAt: NOW - 3600000 },
  { id: "m2", title: "<img src=x onerror=alert(1)>", body: "<b>غامق</b>", createdAt: NOW - 2 * 86400000 },
  { id: "m1", title: "قديمة", body: "نص", createdAt: NOW - 9 * 86400000 } ];
function open(opts = {}) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e.message).slice(0, 140)));
  const html = RAW.replace(/<script src="https?:[^"]*"><\/script>/g, "").replace('<script src="i18n.js"></script>', () => "<script>" + I18N + "</script>");
  const h = { authCb: null, calls: [], inbox: opts.inbox || { messages: MSGS, unread: 2, readAt: NOW - 3 * 86400000 }, inboxFails: false };
  const dom = new JSDOM(html, { url: "https://example.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    try { w.localStorage.setItem("lang", opts.lang || "ar"); w.localStorage.setItem("guide_seen_v1", "1"); } catch (e) {}
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLElement.prototype.scrollIntoView = function () {};
    if (opts.push) w.Capacitor = { Plugins: { FirebaseMessaging: { requestPermissions: async () => ({ receive: "granted" }), getToken: async () => ({ token: "DEV" }), addListener() {}, removeAllListeners() {} } } };
    const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
    const fsf = () => ({ collection() { return q; } }); fsf.FieldValue = { increment: x => x };
    w.firebase = { initializeApp() {}, apps: [], auth() { return { onAuthStateChanged(cb) { h.authCb = cb; }, currentUser: null, signOut() {} }; }, firestore: fsf };
    w.firebase.auth.GoogleAuthProvider = function () {};
    w.fetch = async (url, o) => { const u = String(url); let body = {}; try { body = JSON.parse(o.body); } catch (e) {} h.calls.push({ u, body });
      if (u.endsWith("/game/inbox")) { if (h.inboxFails) throw new Error("offline"); return { ok: true, status: 200, json: async () => ({ ok: true, inbox: h.inbox }) }; }
      if (u.endsWith("/game/state") || u.endsWith("/game/inboxRead") || u.endsWith("/game/registerPush")) return { ok: true, status: 200, json: async () => ({ ok: true, state: STATE }) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  } });
  h.w = dom.window; h.d = dom.window.document; h.errors = errors; h.ev = c => dom.window.eval(c);
  h.user = { uid: "u1", getIdToken: async () => "tok", displayName: "T", email: "t@x.com", photoURL: "" };
  h.login = async () => { h.authCb(h.user); await sleep(550); };
  h.n = (suffix) => h.calls.filter(c => c.u.endsWith(suffix)).length;
  h.mailTab = () => h.d.querySelector('.navbtn[data-screen="mail"]').click();
  h.dot = () => h.d.getElementById("mailDot").classList.contains("show");
  return h;
}
(async () => {
  ok(/id="inboxBox"/.test(RAW) && /id="inboxList"/.test(RAW) && /data-notif="news"/.test(RAW), "mail screen has the inbox section and settings has the 'news' switch");
  { const h = open(); await h.login();
    const call = h.calls.find(c => c.u.endsWith("/game/inbox"));
    ok(!!call && call.body.lang === "ar", "after the game loads the app asks for the inbox with the player's language");
    ok(h.dot(), "the red dot shows for unread messages even when there are no shipments");
    h.mailTab(); await sleep(250);
    ok(h.d.getElementById("inboxBox").style.display === "block", "the mail tab shows the messages section");
    const items = [...h.d.querySelectorAll("#inboxList .mail-item")];
    ok(items.length === 3 && items[0].querySelector(".mtitle").textContent.startsWith("نسخة جديدة") && items[2].querySelector(".mtitle").textContent === "قديمة", "three messages, newest first");
    ok(items[0].classList.contains("unread") && items[1].classList.contains("unread") && !items[2].classList.contains("unread"), "the two newer messages are highlighted as unread, the old one is not");
    ok(items[0].querySelector(".new-badge").textContent === "جديد" && !items[2].querySelector(".new-badge"), "unread messages have a 'new' badge");
    ok(h.d.querySelector("#inboxList img") === null && /<img/.test(items[1].querySelector(".mtitle").textContent) && /<b>/.test(items[1].querySelector(".mmsg").textContent), "message text is shown as plain text (no HTML is executed)");
    ok(items[0].querySelector(".mmsg").textContent === "سطر أول\nسطر ثاني" && items[0].querySelector(".mmsg").style.whiteSpace === "pre-line", "line breaks in a message are kept");
    ok(h.n("/game/inboxRead") === 0, "not marked as read immediately (so the player sees what is new)");
    await sleep(1700);
    ok(h.n("/game/inboxRead") === 1 && !h.dot(), "after a moment the messages are marked as read and the red dot goes away");
    ok(h.d.querySelectorAll("#inboxList .mail-item.unread").length === 2, "the highlight stays during this visit");
    h.mailTab(); await sleep(1800); ok(h.n("/game/inboxRead") === 1, "opening the tab again does not mark again (nothing unread)");
    const before = h.n("/game/inbox"); h.d.dispatchEvent(new h.w.Event("visibilitychange")); await sleep(100);
    ok(h.n("/game/inbox") === before + 1, "coming back to the app reloads the messages");
    ok(h.errors.length === 0, "no script errors " + JSON.stringify(h.errors.slice(0, 2)));
  }
  { const h = open({ inbox: { messages: [], unread: 0, readAt: NOW } }); await h.login(); h.mailTab(); await sleep(250);
    ok(h.d.getElementById("inboxBox").style.display === "none" && !h.dot(), "no messages: the section is hidden and there is no dot"); }
  { const h = open({ inbox: { messages: [], unread: 0, readAt: NOW } }); await h.login();
    h.ev("renderMail([{ id: 'a', data: { read: false, createdAt: Date.now(), message: 'm', code: 'C', claimed: false } }])"); ok(h.dot(), "an unread top-up shipment alone also shows the dot");
    h.ev("renderMail([])"); ok(!h.dot() && /ما في شحنات لسا/.test(h.d.getElementById("mailList").textContent), "no shipments and no messages: no dot, clear text");
    h.ev("INBOX.unread = 1; updateMailDot()"); ok(h.dot(), "the dot follows both sources"); }
  { const h = open(); h.inboxFails = true; await h.login(); h.mailTab(); await sleep(300); ok(!h.dot() && h.d.getElementById("inboxBox").style.display !== "block" && h.errors.length === 0, "if loading the inbox fails nothing breaks and nothing is shown"); }
  { const h = open({ lang: "tr" }); await h.login(); h.mailTab(); await sleep(300);
    ok(h.calls.find(c => c.u.endsWith("/game/inbox")).body.lang === "tr", "the language sent to the server follows the app language");
    ok(h.d.querySelector("#inboxBox h3").textContent === "Yardova'dan mesajlar" && h.d.querySelector("#inboxList .new-badge").textContent === "Yeni", "Turkish headings and badge"); }
  { const h = open({ lang: "en" }); await h.login(); h.mailTab(); await sleep(300);
    ok(h.d.querySelector("#inboxBox h3").textContent === "Messages from Yardova" && h.d.querySelector("#inboxList .new-badge").textContent === "New", "English headings and badge"); }
  // the news switch is part of the push registration
  { const h = open({ push: true }); await h.login(); await sleep(200);
    h.d.getElementById("btnNotifSettings").click();
    const sw = h.d.querySelector('input[data-notif="news"]'); ok(!!sw && /أخبار وتحديثات/.test(sw.closest(".option").textContent), "the 'news & updates' option is in the notification settings");
    sw.checked = false; sw.dispatchEvent(new h.w.Event("change")); await sleep(300);
    const reg = h.calls.filter(c => c.u.endsWith("/game/registerPush")).pop();
    ok(reg && reg.body.token === "DEV" && reg.body.prefs.news === false && reg.body.prefs.orders === true, "turning it off re-registers the device with news: false: " + JSON.stringify(reg && reg.body.prefs));
    sw.checked = true; sw.dispatchEvent(new h.w.Event("change")); await sleep(300);
    ok(h.calls.filter(c => c.u.endsWith("/game/registerPush")).pop().body.prefs.news === true, "turning it back on registers news: true");
  }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
