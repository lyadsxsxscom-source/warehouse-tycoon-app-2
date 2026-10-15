// اختبارات المرحلة A (التطبيق 2.11): شاشة البداية، الهوية، وسحب شام كاش بالدولار فقط
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/stage_a_app.test.js
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WWW = path.join(__dirname, "../../www");
const RAW = fs.readFileSync(path.join(WWW, "index.html"), "utf8");
const I18N = fs.readFileSync(path.join(WWW, "i18n.js"), "utf8");
const STATE = { points: 260, totalPointsEarned: 260, balanceUsd: 0, workersRented: 0, adsWatched: 0, activeDays: 1, lastWithdrawAt: 0, boostUntil: 0, tasks: [], shelves: [], daily: { streak: 0, lastClaim: "", rewards: [10, 10, 20, 10, 10, 10, 60] }, referral: { code: "ABC123", invited: 0, active: 0, earnings: 0, referred: false, rewarded: false, canEnter: false, progress: { days: 1, ads: 0 }, cfg: { inviteeBonus: 50, inviterReward: 150, commissionPct: 5, requiredDays: 3, requiredAds: 10, windowHours: 72 } } };
function open(opts = {}) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e.message).slice(0, 140)));
  const html = RAW.replace(/<script src="https?:[^"]*"><\/script>/g, "").replace('<script src="i18n.js"></script>', () => "<script>" + I18N + "</script>");
  const h = { authCb: null, calls: [], stateDelay: opts.stateDelay || 0, failFirst: !!opts.failFirst, n: 0 };
  const dom = new JSDOM(html, { url: "https://example.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    try { w.localStorage.setItem("lang", opts.lang || "ar"); } catch (e) {}
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLElement.prototype.scrollIntoView = function () {};
    const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
    const fsf = () => ({ collection() { return q; } }); fsf.FieldValue = { increment: x => x };
    w.firebase = { initializeApp() {}, apps: [], auth() { return { onAuthStateChanged(cb) { h.authCb = cb; }, currentUser: null, signOut() {} }; }, firestore: fsf };
    w.firebase.auth.GoogleAuthProvider = function () {};
    w.fetch = async (url, o) => { h.calls.push(String(url)); if (!String(url).endsWith("/game/state")) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      h.n++; if (h.stateDelay) await sleep(h.stateDelay); if (h.failFirst && h.n === 1) throw new Error("offline");
      return { ok: true, status: 200, json: async () => ({ ok: true, state: STATE }) }; };
  } });
  h.w = dom.window; h.d = dom.window.document; h.errors = errors; h.ev = c => dom.window.eval(c);
  h.user = { uid: "u1", getIdToken: async () => "tok", displayName: "Tester", email: "t@x.com", photoURL: "" };
  return h;
}
const pct = h => parseInt(h.d.getElementById("bootPct").textContent, 10);
(async () => {
  /* ---- static checks ---- */
  ok(/const APP_VERSION = "2\.11"/.test(RAW), "app version is 2.11");
  const css = RAW.slice(RAW.indexOf("<style"), RAW.indexOf("</style>"));
  ok(/--bg:#0F3B33/.test(css) && /--amber:#F4C21F/.test(css) && !/#E3A83B|#E4572E|#14110D|rgba\(227,\s*168,\s*59/.test(css), "stylesheet uses the Yardova palette and no old orange/brown colours are left");
  ok(/#bootScreen/.test(css) && /id="bootScreen"/.test(RAW) && /id="bootBar"/.test(RAW), "loading screen markup and style exist");

  /* ---- 1) normal start: bar creeps, reaches 100% only when the server answers ---- */
  { const h = open({ stateDelay: 900 });
    await sleep(500);
    const el = h.d.getElementById("bootScreen");
    ok(el && !el.classList.contains("hide"), "loading screen is shown at start");
    ok(pct(h) > 0 && pct(h) <= 38, "while the login state is unknown the bar creeps but stays under 40% (" + pct(h) + "%)");
    ok(h.d.getElementById("bootSub").textContent === "لعبة إدارة مستودع" && h.d.getElementById("bootMsg").textContent === "عم نحمّل مستودعك…", "texts are shown in Arabic");
    h.authCb(h.user);
    await sleep(300);
    ok(pct(h) >= 40 && pct(h) < 93 && !el.classList.contains("hide"), "after login it moves on but not past ~92% while the server hasn't answered (" + pct(h) + "%)");
    await sleep(1000);
    ok(h.ev("boot.p") === 100, "when the server data arrives the bar reaches 100%");
    await sleep(500);
    ok(h.d.getElementById("bootScreen") === null || h.d.getElementById("bootScreen").classList.contains("hide"), "then the loading screen disappears");
    await sleep(600); ok(h.d.getElementById("bootScreen") === null, "and is removed from the page");
    ok(!h.d.getElementById("loginGate").classList.contains("show"), "the login gate is not shown for a logged-in player");
    // Sham Cash: dollars only
    h.ev("PRICING = { usdToSyp: 138, btcUsd: 84000, ethUsd: 2600, minWithdrawUsd: 5 }; setWdCoin('shamcash')");
    const note = h.d.getElementById("wdSypNote").textContent;
    ok(note === "التحويل عبر شام كاش بالدولار." && !/ل\.س|138|الليرة/.test(note), "Sham Cash screen says dollars only; no lira and no exchange rate: " + note);
    h.ev("setWdCoin('usdt')"); ok(h.d.getElementById("wdSypNote").textContent === "", "other coins show no note");
    ok(h.errors.length === 0, "no script errors during a normal start " + JSON.stringify(h.errors.slice(0, 2)));
  }
  /* ---- 2) logged-out player: no waiting for the server ---- */
  { const h = open(); await sleep(250); h.authCb(null); await sleep(120);
    ok(h.ev("boot.p") === 100 && h.d.getElementById("loginGate").classList.contains("show"), "logged-out: the bar completes at once and the login gate is shown");
    await sleep(900); ok(h.d.getElementById("bootScreen") === null, "logged-out: loading screen is gone");
  }
  /* ---- 3) first request fails, then retry works ---- */
  { const h = open({ failFirst: true }); await sleep(200); h.authCb(h.user); await sleep(500);
    const retry = h.d.getElementById("bootRetry");
    ok(retry.style.display === "inline-block" && /تعذّر الاتصال بالسيرفر/.test(h.d.getElementById("bootMsg").textContent), "failed load: the reason and a retry button are shown");
    ok(pct(h) < 100 && !h.d.getElementById("bootScreen").classList.contains("hide"), "failed load: the screen stays (never reaches 100%)");
    retry.click(); await sleep(900);
    ok(h.ev("boot.p") === 100 && h.ev("boot.done") === true && h.calls.filter(u => u.endsWith("/game/state")).length === 2, "retry asks the server again and then completes");
  }
  /* ---- 4) slow network message, then give-up with retry ---- */
  { const h = open({ stateDelay: 60000 }); await sleep(200); h.authCb(h.user);
    h.ev("boot.t0 = Date.now() - 10000"); await sleep(300);
    ok(h.d.getElementById("bootMsg").textContent === "الشبكة ضعيفة، عم نحاول نكمّل…", "after 9 seconds: 'weak network' message");
    h.ev("boot.t0 = Date.now() - 31000"); await sleep(300);
    ok(h.d.getElementById("bootRetry").style.display === "inline-block", "after 30 seconds: a retry button appears");
  }
  /* ---- 5) Turkish and English ---- */
  { const h = open({ lang: "tr" }); await sleep(250);
    ok(h.d.getElementById("bootSub").textContent === "Depo yönetim oyunu" && h.d.getElementById("bootMsg").textContent === "Deponun yükleniyor…" && h.d.getElementById("bootRetry").textContent === "Tekrar dene", "Turkish texts on the loading screen"); }
  { const h = open({ lang: "en" }); await sleep(250);
    ok(h.d.getElementById("bootSub").textContent === "Warehouse management game" && h.d.getElementById("bootMsg").textContent === "Loading your warehouse…", "English texts on the loading screen");
    h.ev("PRICING = { usdToSyp: 138, minWithdrawUsd: 5 }; setWdCoin('shamcash')"); await sleep(120); ok(/US dollars/.test(h.d.getElementById("wdSypNote").textContent), "English Sham Cash note: " + h.d.getElementById("wdSypNote").textContent);
    h.w.I18N.setLang("tr"); h.ev("setWdCoin('usdt'); setWdCoin('shamcash')"); await sleep(120); ok(/dolar/.test(h.d.getElementById("wdSypNote").textContent), "Turkish Sham Cash note: " + h.d.getElementById("wdSypNote").textContent); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
