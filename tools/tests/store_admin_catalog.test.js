// اختبارات صفحة أدمن المتجر: الكتالوج (شجرة مجلدات ومنتجات، صور، ترتيب، حذف)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/store_admin_catalog.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/store-admin.html"), "utf8").replace(/<script src="[^"]+"><\/script>\s*/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = []; let authCb = null, serverFail = null, confirmAnswer = true, canvasCalls = [], webpOK = true, bigImage = false;
// سيرفر مصطنع بنفس القواعد الأساسية
let NODES = [], seq = 0;
const out = () => ({ ok: true, nodes: NODES.map(n => ({ ...n })), max: { depth: 4, nodes: 300 } });
const sorted = (pid) => NODES.filter(n => n.parentId === pid).sort((a, b) => a.sort - b.sort);
let METHODS_DB = [], methodsFail = null;
const fill = (pr) => { const o = []; for (let i = 0; i < 10; i++) o.push(pr[i] === null || pr[i] === undefined || pr[i] === "" ? o[i - 1] : pr[i]); return o; };
function server(body) {
  if (body.action === "payments_get") return { st: 200, j: { ok: true, methods: METHODS_DB.map(m => ({ ...m })), updatedAt: METHODS_DB.length ? 1792000000000 : 0 } };
  if (body.action === "payments_save") { if (methodsFail) return { st: 400, j: { ok: false, error: "bad_rate", message: methodsFail } }; METHODS_DB = body.methods.map((m, i) => ({ ...m, id: m.id || "m" + (i + 1) + "x" })); return { st: 200, j: { ok: true, methods: METHODS_DB.map(m => ({ ...m })), updatedAt: 1792000000001 } }; }
  if (serverFail) return { st: serverFail, j: { ok: false, error: "server_error", message: serverFail === 400 ? "أقصى عمق 4 مستويات." : undefined } };
  if (body.action === "list") return { st: 200, j: out() };
  if (body.action === "save") {
    if (body.id) { const n = NODES.find(x => x.id === body.id); Object.assign(n, { name: body.name, enabled: body.enabled }); if (body.prices) n.prices = fill(body.prices); if (body.image !== undefined) { n.hasImage = !!body.image; n.imageUrl = body.image ? "/store/img/" + n.id + "?v=" + (++seq) : ""; } }
    else { const sibs = sorted(body.parentId); NODES.push({ id: "n" + (++seq), parentId: body.parentId, type: body.type, name: body.name, prices: body.type === "item" ? fill(body.prices) : [], enabled: body.enabled, sort: sibs.length + 1, hasImage: !!body.image, imageUrl: body.image ? "/store/img/n" + seq + "?v=1" : "" }); }
    return { st: 200, j: out() };
  }
  if (body.action === "delete") { if (NODES.some(x => x.parentId === body.id)) return { st: 400, j: { ok: false, error: "has_children", message: "المجلد مش فاضي. احذف اللي جواته أول." } }; NODES = NODES.filter(x => x.id !== body.id); return { st: 200, j: out() }; }
  if (body.action === "reorder") { const n = NODES.find(x => x.id === body.id); const s = sorted(n.parentId), i = s.indexOf(n), j = body.dir === "up" ? i - 1 : i + 1; if (s[j]) { const t = s[i].sort; s[i].sort = s[j].sort; s[j].sort = t; } return { st: 200, j: out() }; }
  return { st: 400, j: { ok: false } };
}
const dom = new JSDOM(html, { url: "https://example.test/store-admin.html", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  const auth = () => ({ currentUser: { uid: ADMIN, email: "a@x.com", getIdToken: async () => "TOKEN" }, onAuthStateChanged(cb) { authCb = cb; }, signInWithPopup() { return Promise.resolve(); }, signOut() {} });
  auth.GoogleAuthProvider = function () {}; w.firebase = { initializeApp() {}, auth };
  w.confirm = () => confirmAnswer;
  w.fetch = async (url, o) => { const body = JSON.parse(o.body); calls.push({ url: String(url), auth: o.headers.Authorization, body }); const r = server(body); return { ok: r.st < 400, status: r.st, json: async () => r.j }; };
  w.createImageBitmap = async () => ({ width: 1000, height: 500 });
  w.HTMLCanvasElement.prototype.getContext = function () { const cv = this; return { drawImage() { canvasCalls.push({ w: cv.width, h: cv.height }); } }; };
  w.HTMLCanvasElement.prototype.toDataURL = function (type, q) { if (bigImage) return "data:image/webp;base64," + "A".repeat(250000); if (type === "image/webp" && !webpOK) return "data:image/png;base64,PNGFALLBACK"; return "data:" + type + ";base64,SMALL" + (q || ""); };
} });
const d = dom.window.document, $ = id => d.getElementById(id);
const rows = () => [...d.querySelectorAll("#list .row")];
const names = () => rows().map(r => r.querySelector(".nm").firstChild.textContent);
const crumbs = () => $("crumbs").textContent.replace(/\s+/g, "");
const addNode = async (kind, name, price, extra) => { $(kind === "folder" ? "btnAddFolder" : "btnAddItem").click(); $("edName").value = name; if (kind === "item") $("edPrice").value = price === undefined ? "" : price; if (extra) extra(); $("edSave").click(); await sleep(60); };
const lastSave = () => calls.filter(c => c.body.action === "save").pop();
(async () => {
  await sleep(100); authCb({ uid: ADMIN, email: "a@x.com" }); await sleep(120);
  ok(/الكتالوج/.test(d.querySelector("#tabs .tab").textContent) && crumbs() === "الرئيسية" && /فاضي/.test($("emptyNote").textContent) && calls[0].body.action === "list" && calls[0].auth === "Bearer TOKEN", "after sign-in the catalog loads (with the admin token) and starts empty");
  ok($("btnAddFolder") && $("btnAddItem") && $("editor").hidden, "there are 'add folder' and 'add product' buttons, and the editor is closed");

  /* ---- add a folder ---- */
  $("btnAddFolder").click(); ok(!$("editor").hidden && /مجلد جديد/.test($("edTitle").textContent) && $("edPriceBox").hidden, "'add folder' opens the editor (a folder has no price)");
  $("edSave").click(); await sleep(30); ok(/اكتب اسم/.test($("edMsg").textContent) && !calls.some(c => c.body.action === "save"), "saving without a name is refused on the screen");
  $("edCancel").click(); ok($("editor").hidden, "cancel closes it");
  await addNode("folder", "PUBG");
  ok(lastSave().body.type === "folder" && lastSave().body.parentId === "" && lastSave().body.name === "PUBG" && !("prices" in lastSave().body) && lastSave().body.enabled === true && !("image" in lastSave().body), "a root folder is saved (no image sent when none chosen)");
  ok($("editor").hidden && names().join() === "PUBG" && /📁/.test(rows()[0].querySelector(".thumb").textContent) && /مجلد · 0 عنصر/.test(rows()[0].textContent), "it appears in the list with a folder icon");

  /* ---- go inside, nest ---- */
  rows()[0].querySelector(".info").click();
  ok(crumbs() === "الرئيسية›PUBG" && /هالمجلد فاضي/.test($("emptyNote").textContent), "opening a folder shows the path and an empty-folder note");
  await addNode("folder", "فوري"); ok(lastSave().body.parentId === NODES.find(n => n.name === "PUBG").id, "a folder added inside is saved under the open folder");
  rows()[0].querySelector(".info").click(); ok(crumbs() === "الرئيسية›PUBG›فوري", "the path grows (PUBG > فوري)");
  $("btnAddItem").click(); ok(!$("edPriceBox").hidden && /VIP 1/.test($("edPriceBox").textContent) && /\$ دولار/.test($("edPriceBox").textContent) && $("edVip").querySelectorAll("input").length === 9 && $("edVip2").placeholder === "نفس السابق" && $("edVip10"), "a product editor asks for the VIP 1 price in dollars and has nine optional boxes for VIP 2 to 10");
  $("edName").value = "no price"; $("edSave").click(); await sleep(30); ok(/اكتب سعر VIP 1/.test($("edMsg").textContent) && !calls.some(c => c.body.action === "save" && c.body.name === "no price"), "saving a product without the VIP 1 price is refused on the screen"); $("edCancel").click();
  await addNode("item", "60 UC", 0.92); await addNode("item", "325 UC", 4.4);
  await addNode("item", "660 UC", 9.26, () => { $("edVip2").value = "9.1"; $("edVip10").value = "8.3"; });
  ok(lastSave().body.prices.length === 10 && lastSave().body.prices.join() === "9.26,9.1,,,,,,,,8.3" && lastSave().body.type === "item" && !("price" in lastSave().body), "ten prices are sent (empty boxes are empty, the server fills them)");
  ok(names().join("|") === "60 UC|325 UC|660 UC" && /منتج · \$0\.92/.test(rows()[0].textContent) && /\$4\.40/.test(rows()[1].textContent) && /\$9\.26/.test(rows()[2].textContent) && /VIP 10: \$8\.30/.test(rows()[2].textContent) && !/VIP 10/.test(rows()[0].textContent) && /📄/.test(rows()[0].querySelector(".thumb").textContent), "products show dollars, and the VIP 10 price when it is lower");

  /* ---- order ---- */
  ok(rows()[0].querySelector('[data-act="up"]').disabled && !rows()[0].querySelector('[data-act="down"]').disabled && rows()[2].querySelector('[data-act="down"]').disabled, "the first row cannot go up and the last cannot go down");
  rows()[2].querySelector('[data-act="up"]').click(); await sleep(60);
  ok(names().join("|") === "60 UC|660 UC|325 UC" && calls.filter(c => c.body.action === "reorder").pop().body.dir === "up", "▲ moves a product up");
  rows()[0].querySelector('[data-act="down"]').click(); await sleep(60); ok(names().join("|") === "660 UC|60 UC|325 UC", "▼ moves it down");

  /* ---- edit ---- */
  rows()[1].querySelector('[data-act="edit"]').click();
  ok(!$("editor").hidden && /تعديل المنتج/.test($("edTitle").textContent) && $("edName").value === "60 UC" && $("edPrice").value === "0.92" && $("edEnabled").checked === true && $("edVip2").value === "" && !$("edVipBox").open, "✏️ opens the editor filled with the product (VIP boxes empty when they follow the price before)");
  $("edPrice").value = "0.95"; $("edEnabled").checked = false; $("edSave").click(); await sleep(60);
  ok(lastSave().body.id && lastSave().body.prices[0] === 0.95 && lastSave().body.enabled === false && !("type" in lastSave().body) && !("image" in lastSave().body), "saving sends only what is editable (no type, no image if untouched)");
  ok(/مخفي/.test(rows()[1].textContent) && /\$0\.95/.test(rows()[1].textContent), "a hidden product is marked 'مخفي'");
  rows()[0].querySelector('[data-act="edit"]').click(); ok($("edPrice").value === "9.26" && $("edVip2").value === "9.1" && $("edVip3").value === "" && $("edVip10").value === "8.3" && $("edVipBox").open, "a product with different VIP prices opens with them filled (and the VIP section open)"); $("edCancel").click();
  rows()[1].querySelector(".info").click(); ok(!$("editor").hidden && $("edName").value === "60 UC", "tapping a product opens it for editing");
  $("edCancel").click();

  /* ---- images ---- */
  dom.window.watermarkUrl = async (src) => src;          // العلامة المائية إلها اختبار لحالها (store_admin_wm)
  const pickFile = (type) => { const input = $("edFile"); const f = new dom.window.File(["x"], "a." + type.split("/")[1], { type }); Object.defineProperty(input, "files", { value: [f], configurable: true }); input.dispatchEvent(new dom.window.Event("change")); };
  rows()[0].querySelector('[data-act="edit"]').click(); canvasCalls = [];
  pickFile("image/png"); await sleep(60);
  ok(canvasCalls[0].w === 400 && canvasCalls[0].h === 200 && $("edPv").querySelector("img") && /^data:image\/webp/.test($("edPv").querySelector("img").src), "a chosen picture is shrunk to at most 400px (keeping its shape), compressed as WebP and previewed");
  $("edSave").click(); await sleep(60);
  ok(/^data:image\/webp/.test(lastSave().body.image) && rows()[0].querySelector("img.thumb") && rows()[0].querySelector("img.thumb").getAttribute("src").startsWith("https://postback.ly-ad.de/store/img/"), "saving sends the compressed image and the row then shows it as a thumbnail");
  rows()[0].querySelector('[data-act="edit"]').click(); ok(!!$("edPv").querySelector("img"), "editing a product with an image shows it");
  $("edImgDel").click(); ok(!$("edPv").querySelector("img") && /لا صورة/.test($("edPv").textContent), "'delete image' clears the preview");
  $("edSave").click(); await sleep(60); ok(lastSave().body.image === "" && !rows()[0].querySelector("img.thumb"), "and saving sends an empty image (removes it)");
  rows()[0].querySelector('[data-act="edit"]').click(); webpOK = false; pickFile("image/jpeg"); await sleep(60);
  ok(/^data:image\/png/.test($("edPv").querySelector("img").src), "a browser without WebP falls back to PNG");
  webpOK = true; bigImage = true; pickFile("image/png"); await sleep(60);
  ok(/كبيرة كتير/.test($("edMsg").textContent) && $("edFile").value === "", "a picture that stays too big after shrinking is refused with a message");
  bigImage = false; pickFile("text/plain"); await sleep(40); ok(/اختار صورة/.test($("edMsg").textContent), "a file that is not a picture is refused");
  $("edCancel").click();

  /* ---- delete ---- */
  const before = calls.length; confirmAnswer = false; rows()[0].querySelector('[data-act="del"]').click(); await sleep(40);
  ok(calls.length === before && names().length === 3, "delete asks first; cancelling does nothing");
  confirmAnswer = true; rows()[2].querySelector('[data-act="del"]').click(); await sleep(60);
  ok(names().join("|") === "660 UC|60 UC" && calls.pop().body.action === "delete", "confirming deletes the product");

  /* ---- breadcrumb ---- */
  d.querySelector("#crumbs [data-go]").click();
  ok(crumbs() === "الرئيسية" && names().join() === "PUBG", "'الرئيسية' in the path goes back to the top");
  d.querySelector('#list [data-act="del"]').click(); await sleep(60);
  ok(/مش فاضي/.test($("listMsg").textContent) && names().join() === "PUBG", "deleting a folder that has things inside shows the server's message and keeps it");

  /* ---- safety and errors ---- */
  await addNode("folder", "<img src=x onerror=alert(1)>");
  ok(d.querySelector("#list img[src=x]") === null && names().some(n => n === "<img src=x onerror=alert(1)>"), "names are shown as plain text");
  rows()[0].querySelector(".info").click(); serverFail = 400; await addNode("folder", "L2");
  ok(/أقصى عمق/.test($("edMsg").textContent) && !$("editor").hidden, "a server refusal (like the depth limit) is shown inside the editor");
  $("edCancel").click(); serverFail = 500; rows().length && d.querySelector("#crumbs [data-go]").click();
  await addNode("folder", "x"); ok(/صار خطأ/.test($("edMsg").textContent) && !$("edSave").disabled, "a server error is shown and the save button works again");
  /* ---- payment methods tab ---- */
  serverFail = null; $("editor").hidden = true;
  const pmBefore = calls.length; $("tabPayments").click(); await sleep(80);
  ok(!$("viewPayments").hidden && $("viewCatalog").hidden && $("tabPayments").classList.contains("active") && !$("tabCatalog").classList.contains("active") && calls.slice(pmBefore).some(c => c.body.action === "payments_get") && /ما في طرق دفع/.test($("pmEmpty").textContent), "the payment tab opens, loads the settings, and explains there are none yet");
  const rowsPm = () => [...d.querySelectorAll("#pmList .pm")];
  const setPm = (i, f, v) => { const x = rowsPm()[i].querySelector(`[data-f="${f}"]`); if (x.type === "checkbox") { x.checked = v; } else x.value = v; x.dispatchEvent(new dom.window.Event("input", { bubbles: true })); };
  $("btnAddMethod").click(); ok(rowsPm().length === 1 && rowsPm()[0].querySelector('[data-f="decimals"]').value === "2" && rowsPm()[0].querySelector('[data-f="enabled"]').checked, "adding a method gives a new row (2 decimals, enabled)");
  setPm(0, "name", "شام كاش"); setPm(0, "currency", "ل.س"); setPm(0, "rate", "142.5"); setPm(0, "decimals", "0");
  ok(/1\$ = 143 ل\.س/.test(rowsPm()[0].querySelector(".prev").textContent), "a live preview shows what $1 becomes (rounded the way the store will show it)");
  $("btnAddMethod").click(); setPm(1, "name", "USDT"); setPm(1, "currency", "USDT"); setPm(1, "rate", "1"); setPm(1, "feePct", "1.5");
  ok(/1\$ = 1\.02 USDT/.test(rowsPm()[1].querySelector(".prev").textContent), "the extra percentage is included in the preview");
  const sv0 = calls.length; $("btnSaveMethods").click(); await sleep(80);
  const sv = calls.slice(sv0).find(c => c.body.action === "payments_save").body.methods;
  ok(sv.length === 2 && sv[0].name === "شام كاش" && sv[0].rate === 142.5 && sv[0].decimals === 0 && sv[0].feePct === 0 && sv[1].feePct === 1.5 && sv[1].decimals === 2 && sv.every(m => m.enabled === true) && /انحفظ/.test($("pmMsg").textContent) && rowsPm().length === 2, "saving sends numbers (not text) for every method, and the row list refreshes from the server's answer");
  ok(METHODS_DB[0].id === "m1x" && sv[0].id === undefined, "new methods are sent without an id (the server gives one)");
  setPm(0, "rate", "145"); $("btnSaveMethods").click(); await sleep(60);
  ok(calls.filter(c => c.body.action === "payments_save").pop().body.methods[0].id === "m1x" && METHODS_DB[0].rate === 145, "saving again keeps the ids and updates the rate (the quick way to follow the market)");
  setPm(1, "enabled", false); $("btnSaveMethods").click(); await sleep(60); ok(METHODS_DB[1].enabled === false, "a method can be switched off");
  rowsPm()[1].querySelector('[data-pm="up"]').click(); ok(rowsPm()[0].querySelector('[data-f="name"]').value === "USDT" && rowsPm()[0].querySelector('[data-pm="up"]').disabled && rowsPm()[1].querySelector('[data-pm="down"]').disabled, "▲ moves a method up (the first cannot go up, the last cannot go down)");
  confirmAnswer = false; rowsPm()[0].querySelector('[data-pm="del"]').click(); ok(rowsPm().length === 2, "deleting asks first");
  confirmAnswer = true; rowsPm()[0].querySelector('[data-pm="del"]').click(); ok(rowsPm().length === 1 && rowsPm()[0].querySelector('[data-f="name"]').value === "شام كاش", "confirming deletes it");
  methodsFail = "سعر الصرف لازم يكون رقم أكبر من 0."; $("btnSaveMethods").click(); await sleep(60);
  ok(/سعر الصرف/.test($("pmMsg").textContent) && !$("btnSaveMethods").disabled, "a server refusal is shown and the button works again"); methodsFail = null;
  for (let i = 0; i < 8; i++) $("btnAddMethod").click(); ok(rowsPm().length === 8 && /الحد الأقصى 8/.test($("pmMsg").textContent), "no more than 8 methods");
  $("tabCatalog").click(); ok(!$("viewCatalog").hidden && $("viewPayments").hidden && names().length > 0, "back to the catalog tab");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
