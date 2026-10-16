// اختبارات المرحلة D (التطبيق): رسومات العمال والرفوف وعناوين الأقسام
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/stage_d_app.test.js
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WWW = path.join(__dirname, "../../www");
const RAW = fs.readFileSync(path.join(WWW, "index.html"), "utf8"), I18N = fs.readFileSync(path.join(WWW, "i18n.js"), "utf8");
function open(lang = "ar") {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errors.push(String(e.message).slice(0, 140)));
  const html = RAW.replace(/<script src="https?:[^"]*"><\/script>/g, "").replace('<script src="i18n.js"></script>', () => "<script>" + I18N + "</script>");
  const dom = new JSDOM(html, { url: "https://example.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    try { w.localStorage.setItem("lang", lang); w.localStorage.setItem("guide_seen_v1", "1"); } catch (e) {}
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
    const fsf = () => ({ collection() { return q; } }); fsf.FieldValue = { increment: x => x };
    w.firebase = { initializeApp() {}, apps: [], auth() { return { onAuthStateChanged() {}, currentUser: null, signOut() {} }; }, firestore: fsf }; w.firebase.auth.GoogleAuthProvider = function () {};
    w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  } });
  return { w: dom.window, d: dom.window.document, errors, ev: c => dom.window.eval(c) };
}
(async () => {
  const h = open(); await sleep(250);
  const now = "Date.now()";
  h.ev(`shelves = [
    { id: 0, unlocked: false, worker: null },
    { id: 1, unlocked: true, worker: null },
    { id: 2, unlocked: true, worker: { kind: 'day', expiresAt: ${now} + 3600000 } },
    { id: 3, unlocked: true, worker: { kind: 'week', expiresAt: ${now} + 3600000 } },
    { id: 4, unlocked: true, worker: { kind: 'month', expiresAt: ${now} + 3600000 } },
    { id: 5, unlocked: true, worker: { kind: 'day', expiresAt: ${now} - 1000 } } ]; render()`);
  const cells = [...h.d.querySelectorAll("#grid > .shelf, .grid > .shelf")];
  ok(cells.length === 6, "six shelves are drawn");
  const [locked, empty, day, week, month, expired] = cells; const svg = c => (c.querySelector(".emoji svg") || {}).outerHTML || "";
  ok(locked.classList.contains("locked") && /class="art"/.test(svg(locked)) && /rect x="22" y="28"/.test(svg(locked)) && /فتح:/.test(locked.textContent), "locked shelf: crate with a padlock, cost kept");
  ok(!locked.querySelector("circle") && !/M12 5v14M5 12h14/.test(empty.innerHTML) && /#F4C21F/.test(svg(empty)) && /استأجر عامل/.test(empty.textContent), "empty slot: dashed crate with a yellow plus, label kept");
  ok(day.classList.contains("working") && /#F3F5EE/.test(svg(day)) && /عامل يومي/.test(day.textContent), "daily worker: white helmet");
  ok(/#ef8a2c/.test(svg(week)) && /عامل أسبوعي/.test(week.textContent), "weekly worker: orange helmet");
  ok(/#4aa3c4/.test(svg(month)) && /عامل شهري/.test(month.textContent), "monthly worker: blue helmet");
  ok([day, week, month].every(c => /#F4C21F/.test(svg(c)) && c.querySelector(".timer")), "workers wear the yellow vest and show the remaining time");
  ok(expired.classList.contains("expired") && /class="art sleepy"/.test(svg(expired)) && />Zz</.test(svg(expired)) && /انتهت المدة/.test(expired.textContent) && /اضغط للتجديد/.test(expired.textContent), "expired shelf: sleepy worker (Zz) with the renew hint");
  ok(!cells.some(c => /M20 14\.8A8\.2/.test(c.innerHTML) || /circle cx="12" cy="7" r="3"/.test(c.innerHTML)), "the old line icons (moon, stick figure) are gone");
  ok(/\.shelf \.emoji svg\.art\{width:46px/.test(RAW) && /\.shelf\.expired \.art\{[^}]*grayscale/.test(RAW), "art is sized and the expired one is greyed");
  ok(/\.screen h3::after\{[^}]*background:var\(--amber\)/.test(RAW), "section headings get the yellow tape underline");
  ok(Buffer.byteLength(RAW) < 330 * 1024, "the page is still light (" + Math.round(Buffer.byteLength(RAW) / 1024) + " KB, no image files added)");
  // other language: texts translated, art unchanged
  const t = open("en"); await sleep(250);
  t.ev(`shelves = [ { id: 0, unlocked: true, worker: { kind: 'week', expiresAt: Date.now() + 3600000 } }, { id: 1, unlocked: true, worker: null } ]; render()`); await sleep(150);
  const tc = [...t.d.querySelectorAll(".grid > .shelf")];
  ok(/Weekly worker/i.test(tc[0].textContent) && /#ef8a2c/.test(tc[0].innerHTML) && /Hire worker/i.test(tc[1].textContent), "English labels with the same illustrations: " + tc[0].textContent.replace(/\s+/g, " ").trim().slice(0, 40));
  ok(h.errors.length === 0 && t.errors.length === 0, "no script errors " + JSON.stringify(h.errors.concat(t.errors).slice(0, 2)));
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
