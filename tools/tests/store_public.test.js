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
    if (opts.blockedStorage) Object.defineProperty(w, "localStorage", { get() { throw new Error("blocked"); } }); else if (opts.saved) w.localStorage.setItem("store_unit", opts.saved);
    w.fetch = async (url) => { calls.push(String(url)); if (opts.delay) await new Promise(r => setTimeout(r, opts.delay)); if (mode === "net") throw new Error("offline"); if (mode === "bad") return { ok: true, status: 200, json: async () => ({ ok: false }) }; return { ok: true, status: 200, json: async () => ({ ok: true, items: tree, methods, ...(opts.wallet ? { wallet: opts.wallet } : {}) }) }; };
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
    ok(nm(cards(d)[2]) === "منتج بالرئيسية" && cards(d)[2].tagName === "DIV" && cards(d)[2].querySelector("button.order-btn") && cards(d)[2].querySelector("button.order-btn").textContent === "اطلب" && cards(d)[2].querySelector("button.order-btn").dataset.order === "nE", "a product at the top has an 'اطلب' (order) button");
    const seg = [...d.querySelectorAll("#walletBar [data-unit]")];
    ok(seg.map(c => c.textContent).join("|") === "$ دولار|نقاط" && seg[0].getAttribute("aria-pressed") === "true" && seg[1].getAttribute("aria-pressed") === "false" && !d.getElementById("btnTopup") && !d.getElementById("methods"), "signed out: the top bar has a '$ / points' switch (dollars selected) and no balance or payment-method chips");
    ok(/\$1\.00/.test(cards(d)[2].querySelector(".pr").textContent.split("1,000")[0]) && /1,000 نقطة/.test(cards(d)[2].querySelector(".pr small").textContent), "prices are in dollars with the points underneath ($1.00 and 1,000 points)");
    seg[1].click(); await sleep(30);
    ok(d.querySelectorAll("#walletBar [data-unit]")[1].getAttribute("aria-pressed") === "true" && /^1,000 نقطة/.test(cards(d)[2].querySelector(".pr").textContent) && /\$1\.00/.test(cards(d)[2].querySelector(".pr small").textContent) && h.w.location.hash === "", "switching to points shows every price in points (dollars underneath) without leaving the page");
    ok(h.w.localStorage.getItem("store_unit") === "pts", "his choice is remembered");
    d.querySelectorAll("#walletBar [data-unit]")[0].click(); await sleep(30);

    /* ---- navigate ---- */
    cards(d)[0].click(); await sleep(30);
    ok(h.w.location.hash === "#/nA" && crumbs(d) === "الرئيسية›PUBG" && cards(d).map(nm).join("|") === "فوري|بطاقة داخل PUBG" && /\$50\.00/.test(cards(d)[1].textContent) && /50,000 نقطة/.test(cards(d)[1].textContent), "opening a folder shows its path and what is inside; prices keep the chosen unit");
    ok(h.d.title.startsWith("PUBG |"), "the page title follows the folder");
    cards(d)[0].click(); await sleep(30);
    ok(crumbs(d) === "الرئيسية›PUBG›فوري" && cards(d).map(nm).join("|") === "60 UC|660 UC", "a folder inside a folder (PUBG > فوري)");
    ok(/\$0\.92/.test(cards(d)[0].querySelector(".pr").textContent) && /920 نقطة/.test(cards(d)[0].textContent) && /\$8\.76/.test(cards(d)[1].querySelector(".pr").textContent) && /8,760 نقطة/.test(cards(d)[1].textContent) && cards(d)[0].querySelector("img") && !cards(d)[1].querySelector("img") && /🎮/.test(cards(d)[1].querySelector(".pic").textContent), "products show picture (or a placeholder), the dollar price and the points (0.92 = 920, 8.76 = 8,760)");
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
  /* ---- the unit: remembered, rate from the server, blocked storage ---- */
  { const h = open({ saved: "pts" }); await sleep(100); ok(h.d.querySelectorAll("#walletBar [data-unit]")[1].getAttribute("aria-pressed") === "true" && /^1,000 نقطة/.test(cards(h.d)[2].querySelector(".pr").textContent), "a returning visitor gets his last choice (points)"); }
  { const h = open({ saved: "gone" }); await sleep(100); ok(h.d.querySelectorAll("#walletBar [data-unit]")[0].getAttribute("aria-pressed") === "true", "an unknown remembered value falls back to dollars"); }
  { const h = open({ wallet: { pointsPerUsd: 500 } }); await sleep(100); ok(/500 نقطة/.test(cards(h.d)[2].querySelector(".pr small").textContent), "the points rate comes from the server (500 points = $1 here)"); }
  { const h = open({ wallet: { pointsPerUsd: "x" } }); await sleep(100); ok(/1,000 نقطة/.test(cards(h.d)[2].querySelector(".pr small").textContent), "a bad rate from the server is ignored (1000 stays)"); }
  { const h = open({ blockedStorage: true }); await sleep(100); h.d.querySelectorAll("#walletBar [data-unit]")[1].click(); await sleep(30);
    ok(/^1,000 نقطة/.test(cards(h.d)[2].querySelector(".pr").textContent), "if the phone blocks storage the switch still works"); }
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
