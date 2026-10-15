// اختبارات الموقع: أرقام السحب حيّة (من إعدادات الأدمن) مع قيم احتياطية، وما في 20$ مكتوبة بإيدنا
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/phase1_site.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SITE = path.join(__dirname, "../../site");
const PAGES = { "ar-home": "index.html", "tr-home": "tr/index.html", "en-home": "en/index.html", "ar-about": "about/index.html", "tr-about": "tr/about/index.html", "en-about": "en/about/index.html" };
async function open(file, cfgResponse) {
  const calls = [];
  const dom = new JSDOM(fs.readFileSync(path.join(SITE, file), "utf8"), { url: "https://yardova.ly-ad.de/", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
    w.fetch = async (url, o) => { calls.push(String(url)); if (String(url).endsWith("/public-config")) { if (cfgResponse === "fail") throw new Error("offline"); return { ok: true, json: async () => cfgResponse }; } return { ok: true, json: async () => ({}) }; };
  } });
  await sleep(60); return { w: dom.window, d: dom.window.document, calls };
}
const nums = d => Object.fromEntries(["min", "f", "d", "a"].map(k => [k, [...d.querySelectorAll(`[data-cfg="${k}"]`)].map(e => e.textContent)]));
(async () => {
  for (const [name, file] of Object.entries(PAGES)) {
    const raw = fs.readFileSync(path.join(SITE, file), "utf8");
    ok(!/\$20|20\$|20 USD|20 dolar/.test(raw), `${name}: no hard-coded $20 left in the page`);
    const { d, calls } = await open(file, "fail");
    const n = nums(d);
    ok(n.min.length >= 1 && n.min.every(x => x === "5") && n.f.every(x => x === "1") && n.d.every(x => x === "7") && n.a.every(x => x === "35"), `${name}: offline fallback shows today's values (5 / 1 / 7 / 35)`);
    ok(d.querySelectorAll("[data-cfg-first]").length >= 1 && [...d.querySelectorAll("[data-cfg-first]")].every(e => !e.hidden), `${name}: the first-withdrawal sentence is visible when the config can't be loaded`);
    ok(calls.some(u => u === "https://postback.ly-ad.de/public-config"), `${name}: the page asks the server for the live numbers`);
  }
  for (const [name, file] of Object.entries(PAGES)) {
    const { d } = await open(file, { ok: true, minWithdrawUsd: 10, firstWithdrawUsd: 2, firstWithdrawDays: 3, firstWithdrawAds: 20 });
    const n = nums(d);
    ok(n.min.every(x => x === "10") && n.f.every(x => x === "2") && n.d.every(x => x === "3") && n.a.every(x => x === "20"), `${name}: live numbers replace the fallback (10 / 2 / 3 / 20)`);
    ok([...d.querySelectorAll("[data-cfg-first]")].every(e => !e.hidden), `${name}: first-withdrawal sentence stays visible when it is enabled`);
  }
  for (const [label, cfg] of [["disabled (0)", { ok: true, minWithdrawUsd: 5, firstWithdrawUsd: 0, firstWithdrawDays: 0, firstWithdrawAds: 0 }], ["not lower than the minimum", { ok: true, minWithdrawUsd: 5, firstWithdrawUsd: 5, firstWithdrawDays: 7, firstWithdrawAds: 35 }]]) {
    const { d } = await open("index.html", cfg);
    ok([...d.querySelectorAll("[data-cfg-first]")].length >= 1 && [...d.querySelectorAll("[data-cfg-first]")].every(e => e.hidden), `home: first-withdrawal sentence is hidden when the experiment is ${label}`);
    ok(nums(d).min.every(x => x === "5"), `home: the normal minimum is still shown (${label})`);
  }
  { const { d } = await open("index.html", { ok: false }); ok(nums(d).min.every(x => x === "5"), "a failed server answer keeps the fallback"); }
  { const { d } = await open("index.html", { ok: true, minWithdrawUsd: "abc", firstWithdrawUsd: 1, firstWithdrawDays: 7, firstWithdrawAds: 35 }); ok(nums(d).min.every(x => x === "5"), "a garbage value is ignored instead of being printed"); }
  { const raw = fs.readFileSync(path.join(SITE, "index.html"), "utf8"); ok(/كم الحد الأدنى للسحب/.test(raw) && /أول سحب بتقدر تعمله بـ/.test(raw) && /مرة وحدة لكل لاعب/.test(raw), "Arabic FAQ explains the first-withdrawal system"); }
  { const raw = fs.readFileSync(path.join(SITE, "tr/index.html"), "utf8"), en = fs.readFileSync(path.join(SITE, "en/index.html"), "utf8"); ok(/İlk çekimini/.test(raw) && /Your first withdrawal can be as low as/.test(en), "Turkish and English FAQ explain it too"); }
  { const { calls } = await open("index.html", { ok: true, minWithdrawUsd: 5, firstWithdrawUsd: 1, firstWithdrawDays: 7, firstWithdrawAds: 35 }); ok(calls.some(u => u.endsWith("/hit")) , "the anonymous visit counter still runs"); }
  { const { calls } = await open("verify/index.html", "fail"); ok(!calls.some(u => u.endsWith("/public-config")), "the verify page does not load the config (nothing to fill)"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
