// اختبارات المرحلة B (التطبيق 2.11): إشعار ضعف الاتصال، الإرشادات، زر تلغرام
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/stage_b_app.test.js
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WWW = path.join(__dirname, "../../www");
const RAW = fs.readFileSync(path.join(WWW, "index.html"), "utf8"), I18N = fs.readFileSync(path.join(WWW, "i18n.js"), "utf8");
const baseState = (o = {}) => ({ points: 260, totalPointsEarned: 260, balanceUsd: 0, workersRented: 0, adsWatched: 0, activeDays: 1, lastWithdrawAt: 0, boostUntil: 0, tasks: [], shelves: [], daily: { streak: 0, lastClaim: "", rewards: [10, 10, 20, 10, 10, 10, 60] }, referral: { code: "ABC123", invited: 0, active: 0, earnings: 0, referred: false, rewarded: false, canEnter: false, progress: { days: 1, ads: 0 }, cfg: { inviteeBonus: 50, inviterReward: 150, commissionPct: 5, requiredDays: 3, requiredAds: 10, windowHours: 72 } }, ...o });
function open(opts = {}) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e.message).slice(0, 140)));
  const html = RAW.replace(/<script src="https?:[^"]*"><\/script>/g, "").replace('<script src="i18n.js"></script>', () => "<script>" + I18N + "</script>");
  const h = { authCb: null, calls: [], mode: "ok", opened: [], state: opts.state || baseState() };
  const dom = new JSDOM(html, { url: "https://example.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    try { w.localStorage.setItem("lang", opts.lang || "ar"); if (opts.seen) w.localStorage.setItem("guide_seen_v1", "1"); } catch (e) {}
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.open = (u) => { h.opened.push(["window.open", u]); };
    if (opts.native) w.Capacitor = { Plugins: { Browser: { open: ({ url }) => h.opened.push(["native", url]) } } };
    const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
    const fsf = () => ({ collection() { return q; } }); fsf.FieldValue = { increment: x => x };
    w.firebase = { initializeApp() {}, apps: [], auth() { return { onAuthStateChanged(cb) { h.authCb = cb; }, currentUser: null, signOut() {} }; }, firestore: fsf };
    w.firebase.auth.GoogleAuthProvider = function () {};
    w.fetch = async (url) => { h.calls.push(String(url));
      if (h.mode === "fail") throw new Error("offline");
      if (String(url).endsWith("/game/state")) return { ok: true, status: 200, json: async () => ({ ok: true, state: h.state }) };
      if (String(url).endsWith("/today")) return { ok: true, status: 200, json: async () => ({ today: "2026-10-16" }) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  } });
  h.w = dom.window; h.d = dom.window.document; h.errors = errors; h.ev = c => dom.window.eval(c);
  h.user = { uid: "u1", getIdToken: async () => "tok", displayName: "T", email: "t@x.com", photoURL: "" };
  h.login = async () => { h.authCb(h.user); await sleep(450); };
  return h;
}
const shown = h => h.d.getElementById("guideOverlay").classList.contains("show");
const body = h => [...h.d.querySelectorAll("#guideBody p")].map(p => p.textContent);
(async () => {
  /* ---- buttons in the profile page ---- */
  { const h = open(); await sleep(200);
    ok(!!h.d.getElementById("btnGuide") && !!h.d.getElementById("btnTelegram") && /الإرشادات/.test(h.d.getElementById("btnGuide").textContent) && /تلغرام/.test(h.d.getElementById("btnTelegram").textContent), "profile page has the Guide and Telegram buttons");
    h.d.getElementById("btnTelegram").click(); ok(h.opened.length === 1 && h.opened[0][1] === "https://t.me/YardovaGame", "Telegram button opens the channel link (browser): " + JSON.stringify(h.opened));
  }
  { const h = open({ native: true }); await sleep(200); h.d.getElementById("btnTelegram").click(); ok(h.opened[0][0] === "native" && h.opened[0][1] === "https://t.me/YardovaGame", "inside the app it uses the native browser plugin"); }

  /* ---- guide: opened from the button, 5 steps ---- */
  { const h = open({ seen: true }); await h.login();
    ok(!shown(h), "an old player (flag set) is not interrupted by the guide");
    h.d.getElementById("btnGuide").click(); ok(shown(h), "the Guide button opens the guide");
    const titles = []; let guard = 0;
    while (guard++ < 8) { titles.push(h.d.getElementById("guideTitle").textContent); if (h.d.getElementById("guideNext").textContent === "ابدأ اللعب") break; h.d.getElementById("guideNext").click(); }
    ok(titles.length === 5 && titles[0] === "أهلاً بك في Yardova" && titles[3] === "اسحب رصيدك" && titles[4] === "ادعُ أصحابك وتابعنا", "five steps in order: " + titles.join(" | "));
    ok(h.d.querySelectorAll("#guideDots i").length === 5 && h.d.querySelectorAll("#guideDots i.on").length === 1, "progress dots: 5, one active");
    ok(h.d.getElementById("guideTg").style.display === "block" && h.d.getElementById("guideSkip").style.display === "none", "last step: Telegram button visible, Skip hidden");
    h.d.getElementById("guideTg").click(); ok(h.opened.some(o => o[1] === "https://t.me/YardovaGame"), "the Telegram button inside the guide opens the channel");
    h.d.getElementById("guideNext").click(); ok(!shown(h) && h.ev("localStorage.getItem('guide_seen_v1')") === "1", "'Start playing' closes the guide and remembers it");
    h.d.getElementById("btnGuide").click(); ok(shown(h) && h.d.getElementById("guideTitle").textContent === "أهلاً بك في Yardova", "it can be reopened from the profile page and starts from step 1");
    h.d.getElementById("guideSkip").click(); ok(!shown(h), "Skip closes it");
  }
  /* ---- step 4 shows the live withdrawal numbers ---- */
  { const h = open({ seen: true }); await h.login();
    h.ev("PRICING = { usdToSyp: 0, btcUsd: 1, ethUsd: 1, minWithdrawUsd: 5, firstWithdrawUsd: 1, firstWithdrawDays: 7, firstWithdrawAds: 35 }; srvLastWithdrawAt = 0; openGuide(); guideIdx = 3; renderGuide()");
    let p = body(h);
    ok(p.length === 3 && /5\$/.test(p[0]) && /1\$ بعد 7 أيام نشاط و35 إعلان/.test(p[1]) && /ضمان للربح/.test(p[2]), "withdraw step: minimum 5$, first withdrawal 1$ after 7 days and 35 ads, and the honesty line: " + p.join(" / "));
    h.ev("PRICING.firstWithdrawUsd = 0; renderGuide()"); p = body(h);
    ok(p.length === 2 && !/أول سحب/.test(p.join("")), "the first-withdrawal sentence disappears when the experiment is off");
    h.ev("PRICING.firstWithdrawUsd = 1; srvLastWithdrawAt = Date.now(); renderGuide()"); p = body(h);
    ok(p.length === 2, "and for a player who already withdrew once");
  }
  /* ---- automatic guide for brand-new players only ---- */
  { const h = open(); await h.login(); await sleep(1100);
    ok(shown(h), "a brand-new player sees the guide automatically after the game loads");
    h.d.getElementById("guideSkip").click();
    ok(h.ev("localStorage.getItem('guide_seen_v1')") === "1", "closing it remembers it");
  }
  { const h = open({ state: baseState({ activeDays: 6, workersRented: 3, adsWatched: 40, totalPointsEarned: 900 }) }); await h.login(); await sleep(1100); ok(!shown(h), "an existing player is not shown the guide automatically"); }
  { const h = open({ seen: true }); await h.login(); await sleep(1100); ok(!shown(h), "a new player who already saw it is not shown it again"); }

  /* ---- translations ---- */
  { const h = open({ lang: "tr", seen: true }); await h.login();
    h.ev("PRICING = { usdToSyp: 0, btcUsd: 1, ethUsd: 1, minWithdrawUsd: 5, firstWithdrawUsd: 1, firstWithdrawDays: 7, firstWithdrawAds: 35 }; openGuide()");
    ok(h.d.getElementById("guideTitle").textContent === "Yardova'ya hoş geldin" && h.d.getElementById("guideNext").textContent === "İleri", "Turkish: first step");
    h.ev("guideIdx = 3; renderGuide()"); const p = body(h);
    ok(/Asgari çekim 5\$/.test(p[0]) && /İlk çekim 1\$ olabilir: 7 aktif gün ve 35 reklamdan sonra/.test(p[1]) && /kâr garantisi yoktur/.test(p[2]), "Turkish: withdraw step with the live numbers: " + p.join(" / "));
  }
  { const h = open({ lang: "en", seen: true }); await h.login();
    h.ev("PRICING = { usdToSyp: 0, btcUsd: 1, ethUsd: 1, minWithdrawUsd: 5, firstWithdrawUsd: 1, firstWithdrawDays: 7, firstWithdrawAds: 35 }; openGuide(); guideIdx = 3; renderGuide()"); const p = body(h);
    ok(/minimum withdrawal is \$5/.test(p[0]) && /first withdrawal can be \$1, after 7 active days and 35 ads/.test(p[1]) && /no guarantee of profit/.test(p[2]), "English: withdraw step with the live numbers: " + p.join(" / "));
    h.ev("guideIdx = 4; renderGuide()"); ok(h.d.getElementById("guideTg").textContent === "✈️ Our Telegram channel" && h.d.getElementById("guideNext").textContent === "Start playing", "English: last step buttons");
  }

  /* ---- weak connection notice ---- */
  { const h = open({ seen: true }); await h.login();
    const el = h.d.getElementById("netNotice");
    ok(!el.classList.contains("show"), "no notice while the connection is fine");
    h.mode = "fail";
    try { await h.ev("gameApi('state')"); } catch (e) {} await sleep(30);
    ok(!el.classList.contains("show"), "one failed request alone does not alarm the player");
    try { await h.ev("gameApi('state')"); } catch (e) {} await sleep(30);
    ok(el.classList.contains("show") && h.d.getElementById("netTitle").textContent === "الاتصال ضعيف" && /ما عم نقدر نتزامن/.test(h.d.getElementById("netText").textContent), "after two failures the notice appears in the middle of the screen");
    ok(/#netNotice\{[^}]*pointer-events:none/.test(RAW) && /#netNotice\{[^}]*align-items:center/.test(RAW), "the notice is centered and never blocks taps");
    h.mode = "ok"; const before = h.calls.filter(u => u.endsWith("/game/state")).length;
    h.ev("net.lastOk = 0"); await h.ev("netPing()"); await sleep(120);
    ok(!el.classList.contains("show"), "when the connection returns the notice disappears by itself");
    ok(h.calls.filter(u => u.endsWith("/game/state")).length === before + 1, "and the numbers are refreshed from the server");
    // offline / online events
    h.w.dispatchEvent(new h.w.Event("offline")); ok(el.classList.contains("show"), "the phone going offline shows the notice immediately");
    h.w.dispatchEvent(new h.w.Event("online")); await sleep(200); ok(!el.classList.contains("show"), "coming back online hides it");
    // ping is cheap and conditional
    const n0 = h.calls.filter(u => u.endsWith("/today")).length; h.ev("net.lastOk = Date.now()"); await h.ev("netPing()");
    ok(h.calls.filter(u => u.endsWith("/today")).length === n0, "no extra ping when a request succeeded in the last 15 seconds");
    ok(h.errors.length === 0, "no script errors " + JSON.stringify(h.errors.slice(0, 2)));
  }
  { const h = open(); await sleep(150); h.mode = "fail";
    h.ev("netFail(); netFail(); netFail()"); ok(!h.d.getElementById("netNotice").classList.contains("show"), "no notice during the first loading (the loading screen handles it)");
  }
  { const h = open({ seen: true }); await sleep(150); h.authCb(null); await sleep(150); h.ev("net.lastOk = 0"); const n = h.calls.length; await h.ev("netPing()"); ok(h.calls.length === n, "logged-out players don't ping the server"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
