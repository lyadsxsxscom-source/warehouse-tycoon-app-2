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
  ok(/id="mailTabs"/.test(RAW) && /data-mtab="msgs"/.test(RAW) && /data-mtab="ships"/.test(RAW) && /id="mailPaneMsgs"/.test(RAW) && /id="mailPaneShips"/.test(RAW) && /data-notif="news"/.test(RAW), "mail screen has two tabs (Messages, Shipments) with a page each, and settings has the 'news' switch");
  ok(/\.mail-tabs\{display:flex/.test(RAW), "the two tabs sit side by side in one row");
  const vis = (h, id) => h.d.getElementById(id).style.display !== "none";
  { const h = open(); await h.login();
    const call = h.calls.find(c => c.u.endsWith("/game/inbox"));
    ok(!!call && call.body.lang === "ar", "after the game loads the app asks for the inbox with the player's language");
    ok(h.dot(), "the red dot on the mail icon shows for unread messages even when there are no shipments");
    h.mailTab(); await sleep(300);
    const tabs = [...h.d.querySelectorAll("#mailTabs .mail-tab")];
    ok(tabs.length === 2 && tabs[0].parentElement === tabs[1].parentElement && tabs[0].textContent.trim() === "الرسائل" && tabs[1].textContent.trim() === "الشحنات", "two tabs in the same row: Messages and Shipments");
    ok(h.d.querySelector("#screen-mail h3").textContent.trim() === "البريد", "the 'البريد' title stays on top");
    ok(tabs[0].classList.contains("active") && vis(h, "mailPaneMsgs") && !vis(h, "mailPaneShips"), "with unread messages the Messages page opens first and the Shipments page is hidden");
    ok(h.d.getElementById("tabDotMsgs").classList.contains("show") && !h.d.getElementById("tabDotShips").classList.contains("show"), "the Messages tab has a red dot, the Shipments tab doesn't");
    const items = [...h.d.querySelectorAll("#inboxList .mail-item")];
    ok(items.length === 3 && items[0].querySelector(".mtitle").textContent.startsWith("نسخة جديدة") && items[2].querySelector(".mtitle").textContent === "قديمة", "three messages, newest first");
    ok(items[0].classList.contains("unread") && items[1].classList.contains("unread") && !items[2].classList.contains("unread"), "the two newer messages are highlighted as unread, the old one is not");
    ok(items[0].querySelector(".new-badge").textContent === "جديد" && !items[2].querySelector(".new-badge"), "unread messages have a 'new' badge");
    ok(h.d.querySelector("#inboxList img") === null && /<img/.test(items[1].querySelector(".mtitle").textContent) && /<b>/.test(items[1].querySelector(".mmsg").textContent), "message text is shown as plain text (no HTML is executed)");
    ok(items[0].querySelector(".mmsg").textContent === "سطر أول\nسطر ثاني" && items[0].querySelector(".mmsg").style.whiteSpace === "pre-line", "line breaks in a message are kept");
    ok(!vis(h, "inboxEmpty") || h.d.getElementById("inboxEmpty").style.display === "none", "the 'no messages' text is hidden when there are messages");
    ok(h.n("/game/inboxRead") === 0, "not marked as read immediately (so the player sees what is new)");
    await sleep(1700);
    ok(h.n("/game/inboxRead") === 1 && !h.dot() && !h.d.getElementById("tabDotMsgs").classList.contains("show"), "after a moment the messages are marked as read and both red dots go away");
    ok(h.d.querySelectorAll("#inboxList .mail-item.unread").length === 2, "the highlight stays during this visit");
    tabs[1].click(); ok(tabs[1].classList.contains("active") && vis(h, "mailPaneShips") && !vis(h, "mailPaneMsgs"), "tapping Shipments shows the Shipments page and hides the messages");
    tabs[0].click(); ok(vis(h, "mailPaneMsgs") && !vis(h, "mailPaneShips"), "tapping Messages brings them back");
    await sleep(1700); ok(h.n("/game/inboxRead") === 1, "nothing is marked again (nothing unread)");
    const before = h.n("/game/inbox"); h.d.dispatchEvent(new h.w.Event("visibilitychange")); await sleep(100);
    ok(h.n("/game/inbox") === before + 1, "coming back to the app reloads the messages");
    ok(h.errors.length === 0, "no script errors " + JSON.stringify(h.errors.slice(0, 2)));
  }
  // messages are only marked as read while the Messages page is showing
  { const h = open(); await h.login(); h.mailTab(); await sleep(300);
    h.d.querySelector('.mail-tab[data-mtab="ships"]').click(); await sleep(1800);
    ok(h.n("/game/inboxRead") === 0 && h.dot(), "if the player moves to Shipments within a second, the messages are NOT marked as read");
    h.d.querySelector('.mail-tab[data-mtab="msgs"]').click(); await sleep(1800);
    ok(h.n("/game/inboxRead") === 1 && !h.dot(), "they are marked as read once the Messages page is shown");
  }
  // only a new shipment: the Shipments page opens first
  { const h = open({ inbox: { messages: MSGS.slice(2), unread: 0, readAt: NOW } }); await h.login();
    h.ev("renderMail([{ id: 'a', data: { read: false, createdAt: Date.now(), message: 'm', code: 'C', claimed: false } }])");
    h.mailTab(); await sleep(300);
    ok(vis(h, "mailPaneShips") && !vis(h, "mailPaneMsgs") && h.d.getElementById("tabDotShips").classList.contains("show") && !h.d.getElementById("tabDotMsgs").classList.contains("show"), "with only an unread shipment the Shipments page opens first and its tab has the dot");
    ok(h.dot(), "the mail icon dot shows for an unread shipment alone");
    h.ev("renderMail([])"); ok(!h.dot() && /ما في شحنات لسا/.test(h.d.getElementById("mailList").textContent), "no shipments and no unread messages: no dot, clear text on the Shipments page");
    h.ev("INBOX.unread = 1; updateMailDot()"); ok(h.dot(), "the icon dot follows both sources");
  }
  { const h = open({ inbox: { messages: [], unread: 0, readAt: NOW } }); await h.login(); h.mailTab(); await sleep(300);
    ok(vis(h, "mailPaneMsgs") && h.d.getElementById("inboxEmpty").style.display === "block" && /ما في رسائل لسا/.test(h.d.getElementById("inboxEmpty").textContent) && !h.dot(), "no messages: a clear 'no messages yet' text and no dot");
  }
  { const h = open(); h.inboxFails = true; await h.login(); h.mailTab(); await sleep(300); ok(!h.dot() && h.d.getElementById("inboxEmpty").style.display !== "none" && vis(h, "mailPaneMsgs") && h.errors.length === 0, "if loading the inbox fails nothing breaks and the page shows the empty text"); }
  { const h = open({ lang: "tr" }); await h.login(); h.mailTab(); await sleep(300);
    ok(h.calls.find(c => c.u.endsWith("/game/inbox")).body.lang === "tr", "the language sent to the server follows the app language");
    const t = [...h.d.querySelectorAll("#mailTabs .mail-tab")].map(b => b.textContent.trim());
    ok(t[0] === "Mesajlar" && t[1] === "Yüklemeler" && h.d.querySelector("#inboxList .new-badge").textContent === "Yeni", "Turkish tab labels and badge: " + t.join(" | ")); }
  { const h = open({ lang: "en" }); await h.login(); h.mailTab(); await sleep(300);
    const t = [...h.d.querySelectorAll("#mailTabs .mail-tab")].map(b => b.textContent.trim());
    ok(t[0] === "Messages" && t[1] === "Top-ups" && h.d.querySelector("#inboxList .new-badge").textContent === "New", "English tab labels and badge: " + t.join(" | ")); }
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
