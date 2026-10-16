// اختبارات الموقع: أرقام السحب حيّة (من إعدادات الأدمن) مع قيم احتياطية، وما في 20$ مكتوبة بإيدنا
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/phase1_site.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SITE = path.join(__dirname, "../../site");
const PAGES = { "ar-home": "index.html", "tr-home": "tr/index.html", "en-home": "en/index.html", "ar-about": "about/index.html", "tr-about": "tr/about/index.html", "en-about": "en/about/index.html" };
async function open(file, cfgResponse, ua) {
  const calls = [];
  const dom = new JSDOM(fs.readFileSync(path.join(SITE, file), "utf8"), { url: "https://yardova.ly-ad.de/", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
    if (ua) Object.defineProperty(w.navigator, "userAgent", { get: () => ua });
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
  /* ---- iPhone: the web version instead of the APK ---- */
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
  const disp = (d, w, sel) => { const e = d.querySelector(sel); return e ? w.getComputedStyle(e).display : "missing"; };
  for (const [name, file] of [["ar-home", "index.html"], ["tr-home", "tr/index.html"], ["en-home", "en/index.html"]]) {
    const raw = fs.readFileSync(path.join(SITE, file), "utf8");
    ok((raw.match(/class="btn main ios-play" href="\/play\/"/g) || []).length === 2 && (raw.match(/class="btn main btn-apk"/g) || []).length === 2 && /class="small ios-line"><a href="\/play\/"/.test(raw), `${name}: two iPhone buttons (top and bottom), two APK buttons and a small iPhone line, all pointing to /play/`);
    const ip = await open(file, "fail", IPHONE);
    ok(ip.d.documentElement.classList.contains("is-ios") && disp(ip.d, ip.w, ".btn-apk") === "none" && disp(ip.d, ip.w, ".ios-play") === "inline-block" && disp(ip.d, ip.w, ".small-apk") === "none" && disp(ip.d, ip.w, ".small-ios") === "block" && disp(ip.d, ip.w, ".ios-line") === "none", `${name}: on an iPhone the APK button is hidden and the 'play in the browser' button is the main one`);
    const an = await open(file, "fail", ANDROID);
    ok(!an.d.documentElement.classList.contains("is-ios") && disp(an.d, an.w, ".btn-apk") !== "none" && disp(an.d, an.w, ".ios-play") === "none" && disp(an.d, an.w, ".small-ios") === "none" && disp(an.d, an.w, ".ios-line") !== "none", `${name}: on Android nothing changes except a small line for iPhone users under the download button`);
  }
  for (const [name, file, frag] of [["ar-about", "about/index.html", "على الآيفون"], ["tr-about", "tr/about/index.html", "iPhone'da"], ["en-about", "en/about/index.html", "On iPhone"]]) {
    const raw = fs.readFileSync(path.join(SITE, file), "utf8");
    ok(raw.includes(frag) && /href="\/play\/"/.test(raw) && raw.includes("yardova.ly-ad.de/play"), `${name}: mentions the iPhone web version with the link`);
  }
  { const sm = fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8"); ok(!/\/play/.test(sm), "the web game is not added to the sitemap (it is noindex)"); }
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
