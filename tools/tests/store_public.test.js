// اختبارات الصفحة العامة للمتجر (الخطوة 2): بتعرض الشجرة (أقسام بصور ← منتجات بأسعارها)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_public.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../site/store/index.html"), "utf8");
const TREE = [
  { id: "nA", type: "folder", name: "PUBG", price: 0, imageUrl: "/store/img/nA?v=1", children: [
    { id: "nB", type: "folder", name: "فوري", price: 0, imageUrl: "", children: [
      { id: "n1", type: "item", name: "60 UC", priceUsd: 0.92, imageUrl: "/store/img/n1?v=2" },
      { id: "n2", type: "item", name: "660 UC", priceUsd: 8.76, imageUrl: "" } ] },
    { id: "nC", type: "item", name: "بطاقة داخل PUBG", priceUsd: 50, imageUrl: "" } ] },
  { id: "nD", type: "folder", name: "<img src=x onerror=alert(1)>", price: 0, imageUrl: "https://evil.example/x.png", children: [{ id: "n3", type: "item", name: "x", priceUsd: 1, imageUrl: "javascript:alert(1)" }] },
  { id: "nE", type: "item", name: "منتج بالرئيسية", priceUsd: 1, imageUrl: "" },
];
const METHODS = [{ id: "sham", name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0 }, { id: "usdt", name: "USDT", currency: "USDT", rate: 1, decimals: 2, feePct: 1.5 }];
function open(opts = {}) {
  const calls = []; let mode = opts.mode || "ok", tree = opts.tree || TREE; const methods = opts.methods === undefined ? METHODS : opts.methods;
  const dom = new JSDOM(html, { url: "https://yardova.ly-ad.de/store/", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
    w.scrollTo = () => {};
    if (opts.blockedStorage) Object.defineProperty(w, "localStorage", { get() { throw new Error("blocked"); } }); else if (opts.saved) w.localStorage.setItem("store_method", opts.saved);
    w.fetch = async (url) => { calls.push(String(url)); if (opts.delay) await new Promise(r => setTimeout(r, opts.delay)); if (mode === "net") throw new Error("offline"); if (mode === "bad") return { ok: true, status: 200, json: async () => ({ ok: false }) }; return { ok: true, status: 200, json: async () => ({ ok: true, items: tree, methods }) }; };
  } });
  return { dom, d: dom.window.document, w: dom.window, calls, setMode: m => { mode = m; }, setTree: t => { tree = t; } };
}
const cards = (d) => [...d.querySelectorAll("#catalog .card")];
const nm = (c) => c.querySelector(".nm").textContent;
const crumbs = (d) => d.getElementById("crumbs").textContent.replace(/\s+/g, "");
(async () => {
  /* ---- loading, home ---- */
  { const h = open({ delay: 150 }); await sleep(30);
    ok(h.d.getElementById("loading") && h.d.querySelectorAll("#loading .skel").length === 4, "while loading it shows placeholders");
    await sleep(300); const d = h.d;
    ok(h.calls[0] === "https://postback.ly-ad.de/store/catalog", "it reads the public catalog from the server");
    ok(crumbs(d) === "الرئيسية" && d.querySelector("#crumbs b") && cards(d).length === 3, "home: the path shows 'الرئيسية' and every top-level entry is a card");
    ok(nm(cards(d)[0]) === "PUBG" && cards(d)[0].tagName === "BUTTON" && cards(d)[0].querySelector("img").getAttribute("src") === "https://postback.ly-ad.de/store/img/nA?v=1", "a folder is a tappable card with its picture");
    ok(nm(cards(d)[2]) === "منتج بالرئيسية" && /الطلب قريباً/.test(cards(d)[2].textContent) && cards(d)[2].tagName === "DIV", "a product at the top says ordering is coming");
    const chips = [...d.querySelectorAll("#methods .chip")];
    ok(!d.getElementById("methods").hidden && chips.map(c => c.textContent).join("|") === "شام كاش|USDT" && chips[0].getAttribute("aria-pressed") === "true" && chips[1].getAttribute("aria-pressed") === "false", "the payment methods are shown as buttons, the first one selected");
    ok(/143 ل\.س/.test(cards(d)[2].querySelector(".pr").textContent) && /\$1\.00/.test(cards(d)[2].querySelector(".pr small").textContent), "prices are shown in the selected method's currency (dollar price x rate), with the dollar price underneath");
    chips[1].click(); await sleep(30);
    ok(d.querySelectorAll("#methods .chip")[1].getAttribute("aria-pressed") === "true" && /1\.02 USDT/.test(cards(d)[2].querySelector(".pr").textContent) && h.w.location.hash === "", "choosing another method changes every price at once (the extra percentage is included and 1.015 rounds to 1.02) without leaving the page");
    ok(h.w.localStorage.getItem("store_method") === "usdt", "his choice is remembered");
    d.querySelectorAll("#methods .chip")[0].click(); await sleep(30);

    /* ---- navigate ---- */
    cards(d)[0].click(); await sleep(30);
    ok(h.w.location.hash === "#/nA" && crumbs(d) === "الرئيسية›PUBG" && cards(d).map(nm).join("|") === "فوري|بطاقة داخل PUBG" && /7,125 ل\.س/.test(cards(d)[1].textContent), "opening a folder shows its path and what is inside; prices keep the chosen method");
    ok(h.d.title.startsWith("PUBG |"), "the page title follows the folder");
    cards(d)[0].click(); await sleep(30);
    ok(crumbs(d) === "الرئيسية›PUBG›فوري" && cards(d).map(nm).join("|") === "60 UC|660 UC", "a folder inside a folder (PUBG > فوري)");
    ok(/131 ل\.س/.test(cards(d)[0].textContent) && /\$0\.92/.test(cards(d)[0].textContent) && /1,248 ل\.س/.test(cards(d)[1].textContent) && /\$8\.76/.test(cards(d)[1].textContent) && cards(d)[0].querySelector("img") && !cards(d)[1].querySelector("img") && /🎮/.test(cards(d)[1].querySelector(".pic").textContent), "products show picture (or a placeholder), the converted price and the dollar price (0.92 x 142.5 = 131, 8.76 x 142.5 = 1,248)");
    d.querySelector('#crumbs a[href="#/nA"]').click(); await sleep(30); ok(crumbs(d) === "الرئيسية›PUBG", "tapping a name in the path goes back to that folder");
    d.querySelector('#crumbs a[href="#"]').click(); await sleep(30); ok(crumbs(d) === "الرئيسية" && cards(d).length === 3, "'الرئيسية' goes back to the top");
    h.w.location.hash = "#/zzz"; await sleep(30); ok(d.getElementById("noteMsg") && /مو موجود/.test(d.getElementById("noteMsg").textContent) && cards(d).length === 3, "a link to something that no longer exists shows a note and the home page");
    h.w.location.hash = "#/n1"; await sleep(30); ok(cards(d).map(nm).join("|") === "60 UC|660 UC" && crumbs(d) === "الرئيسية›PUBG›فوري", "a link to a product shows the folder it is in");
    h.w.location.hash = ""; await sleep(30);

    /* ---- images and safety ---- */
    const im = cards(d)[0].querySelector("img"); im.dispatchEvent(new h.w.Event("error"));
    ok(!cards(d)[0].querySelector("img") && /📁/.test(cards(d)[0].querySelector(".pic").textContent), "a picture that fails to load is replaced by an icon");
    const evil = cards(d)[1];
    ok(d.querySelector("#catalog img[src=x]") === null && nm(evil) === "<img src=x onerror=alert(1)>" && !evil.querySelector("img"), "names are plain text, and a picture from another website is never loaded");
    evil.click(); await sleep(30); ok(!d.querySelector("#catalog img") && /🎮/.test(cards(d)[0].querySelector(".pic").textContent), "a javascript: picture link is ignored too");
  }
  /* ---- payment methods: remembered, none, invalid, blocked storage ---- */
  { const h = open({ saved: "usdt" }); await sleep(100); ok(h.d.querySelectorAll("#methods .chip")[1].getAttribute("aria-pressed") === "true" && /1\.02 USDT/.test(cards(h.d)[2].textContent), "a returning visitor gets his last method"); }
  { const h = open({ saved: "gone" }); await sleep(100); ok(h.d.querySelectorAll("#methods .chip")[0].getAttribute("aria-pressed") === "true", "a remembered method that no longer exists falls back to the first"); }
  { const h = open({ methods: [] }); await sleep(100); const pr = cards(h.d)[2].querySelector(".pr");
    ok(h.d.getElementById("methods").hidden && pr.textContent === "$1.00" && !pr.querySelector("small"), "with no payment methods the prices are simply in dollars"); }
  { const h = open({ methods: [{ id: "a", name: "ok", currency: "x", rate: 2, decimals: 0, feePct: 0 }, { id: "b", name: "no rate", currency: "x", rate: 0, decimals: 0 }, { id: "c", name: "no currency", currency: "", rate: 3, decimals: 0 }, null] }); await sleep(100);
    ok([...h.d.querySelectorAll("#methods .chip")].map(c => c.textContent).join() === "ok", "a method with a bad rate or no currency symbol is ignored"); }
  { const h = open({ blockedStorage: true }); await sleep(100); h.d.querySelectorAll("#methods .chip")[1].click(); await sleep(30);
    ok(/1\.02 USDT/.test(cards(h.d)[2].textContent), "if the phone blocks storage the store still works"); }
  /* ---- empty and errors ---- */
  { const h = open({ tree: [] }); await sleep(100); ok(/ما في منتجات هلق/.test(h.d.getElementById("emptyNote").textContent) && crumbs(h.d) === "الرئيسية", "an empty store says so"); }
  { const h = open({ mode: "net" }); await sleep(100);
    ok(h.d.getElementById("errState") && /تعذّر تحميل المتجر/.test(h.d.getElementById("errState").textContent) && h.d.getElementById("btnRetry"), "no connection: a clear message with a retry button");
    h.setMode("ok"); h.d.getElementById("btnRetry").click(); await sleep(100); ok(cards(h.d).length === 3 && !h.d.getElementById("errState"), "retry loads the store"); }
  { const h = open({ mode: "bad" }); await sleep(100); ok(h.d.getElementById("errState"), "a bad answer from the server is an error state, not a blank page"); }
  /* ---- static ---- */
  ok(!/innerHTML|document\.write|eval\(/.test(html) && /noindex/.test(html), "the page never inserts HTML, and stays hidden from search engines until you decide to launch");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
