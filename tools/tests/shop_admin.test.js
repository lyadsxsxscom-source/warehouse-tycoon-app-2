// اختبارات صفحة الأدمن: تبويب "شحن الألعاب" (عناصر المتجر + طلبات اللاعبين)
// التشغيل: NODE_PATH=<مجلد node_modules فيه jsdom> node tools/tests/shop_admin.test.js
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = fs.readFileSync(path.join(__dirname, "../../docs/admin.html"), "utf8").replace(/<script src="[^"]*"><\/script>/g, "");
const ADMIN = "09DZoXtB6afGTGHtFghiUx5t71N2";
const calls = []; let confirmAnswer = true, promptAnswer = "";
let serverItems = [], serverSettings = { minActiveDays: 3, maxPending: 3 };
let orders = [
  { id: "o1", uid: "u1", displayName: "Ahmad <b>X</b>", email: "a@x.com", itemName: "PUBG <img src=x onerror=alert(1)>", pricePoints: 700, fields: [{ key: "pid", label: "ID اللاعب", value: "5123456789" }, { key: "phone", label: "رقم التواصل", value: "0933123456" }], status: "pending", createdAt: Date.now() - 3600000, snapshot: { activeDays: 5, adsWatched: 12, totalPointsEarned: 5260, withdrawCount: 1 } },
  { id: "o2", uid: "u2", displayName: "Sara", email: "s@x.com", itemName: "اشتراك", pricePoints: 1500, fields: [], status: "pending", createdAt: Date.now() - 1800000, snapshot: {} },
];
let failSave = false;
const dom = new JSDOM(html, { url: "https://example.test/admin", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) {
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.confirm = () => confirmAnswer; w.prompt = () => promptAnswer; w.HTMLElement.prototype.scrollIntoView = () => {};
  const q = { orderBy() { return q; }, limit() { return q; }, where() { return q; }, onSnapshot() { return () => {}; }, get: async () => ({ exists: false, data: () => ({}), docs: [], forEach() {} }), doc() { return q; } };
  const fs_ = () => ({ collection() { return q; } }); fs_.FieldValue = { increment: x => x };
  w.firebase = { initializeApp() {}, apps: [], auth: () => ({ onAuthStateChanged(cb) { setTimeout(() => cb({ uid: ADMIN }), 0); }, currentUser: { uid: ADMIN, getIdToken: async () => "ADMTOKEN" }, signOut() {} }), firestore: fs_ };
  w.fetch = async (url, o) => {
    const body = o && o.body ? JSON.parse(o.body) : {}; calls.push({ url: String(url), auth: o && o.headers && o.headers.Authorization, body });
    const R = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
    if (String(url).endsWith("/admin/shop")) {
      if (body.action === "get") return R({ ok: true, items: serverItems, settings: serverSettings });
      if (body.action === "save") {
        if (failSave) return R({ ok: false, error: "bad_items", message: "قائمة العناصر غير صحيحة" }, 400);
        let n = 0; serverItems = body.items.filter(x => x.name && x.pricePoints >= 1).map(x => ({ ...x, id: x.id || "it_" + (++n) })); serverSettings = body.settings;
        return R({ ok: true, items: serverItems, settings: serverSettings, dropped: body.items.length - serverItems.length });
      }
    }
    if (String(url).endsWith("/admin/shop-orders")) {
      if (body.action === "list") return R({ ok: true, orders: orders.filter(x => body.status === "all" || x.status === body.status) });
      if (body.action === "resolve") { const x = orders.find(z => z.id === body.orderId); if (!x || x.status !== "pending") return R({ ok: false, error: "already_resolved", message: "هالطلب انحسم من قبل." }, 409); x.status = body.decision; x.note = body.note; return R({ ok: true, status: body.decision }); }
    }
    return R({ ok: false }, 400);
  };
} });
const w = dom.window, d = w.document;
const $ = id => d.getElementById(id);
const shopCalls = (u) => calls.filter(c => c.url.endsWith(u));
const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event("input", { bubbles: true })); };
(async () => {
  await sleep(500);
  ok(!!$("tabShop") && !!$("viewShop") && /شحن الألعاب/.test($("tabShop").textContent), "the admin has the 'Game top-ups' tab (separate from the existing store tab)");
  ok(shopCalls("/admin/shop-orders").some(c => c.body.action === "list" && c.body.status === "pending" && c.auth === "Bearer ADMTOKEN") && $("shopBadge").textContent === "2", "right after sign-in the tab badge shows the 2 pending orders");
  $("tabShop").click(); await sleep(300);
  ok(shopCalls("/admin/shop").some(c => c.body.action === "get" && c.auth === "Bearer ADMTOKEN"), "opening the tab loads the store with the admin token");
  ok(/المتجر فاضي/.test($("shopItemsBody").textContent) && $("shopMinDays").value === "3" && $("shopMaxPending").value === "3", "the store starts empty and shows the default rules");
  // pending orders
  const cards = [...d.querySelectorAll("#shopOrdersList > div")];
  ok(cards.length === 2 && /5123456789/.test(cards[0].textContent) && /0933123456/.test(cards[0].textContent) && /a@x\.com/.test(cards[0].textContent) && /700/.test(cards[0].textContent), "each order shows the item, price, player email and the details he typed");
  ok(/أيام نشاط: 5/.test(cards[0].textContent) && /إعلانات: 12/.test(cards[0].textContent), "and the player's activity (to judge fraud)");
  ok(d.querySelector("#shopOrdersList img") === null && d.querySelector("#shopOrdersList b b") === null && /<img/.test(cards[0].textContent), "names typed by players are shown as text, never as HTML");
  ok(d.querySelectorAll("#shopOrdersList button[data-decision]").length === 4, "every pending order has 'done' and 'reject' buttons");

  // adding an item: required validation
  $("btnShopAdd").click();
  ok(/اسم العنصر/.test($("shopMsg").textContent) && shopCalls("/admin/shop").filter(c => c.body.action === "save").length === 0, "an item without a name is refused");
  type("shopName", "PUBG 60 شدة"); $("btnShopAdd").click();
  ok(/السعر/.test($("shopMsg").textContent), "an item without a valid price is refused");
  type("shopPrice", "0"); $("btnShopAdd").click(); ok(/السعر/.test($("shopMsg").textContent), "a zero price is refused");
  // a real item: the player ID is selected by default, add phone (optional) and a custom ID label
  type("shopPrice", "700"); type("shopDesc", "شحن فوري");
  ok($("shopUse_pid").checked && !$("shopUse_email").checked && !$("shopUse_phone").checked && $("shopLabel_pid").value === "ID اللاعب", "the form starts with 'player ID' selected and the others off");
  $("shopUse_phone").checked = true; $("shopReq_phone").checked = false;
  type("shopLabel_pid", "ID PUBG");
  $("btnShopAdd").click();
  ok(/PUBG 60/.test($("shopItemsBody").textContent) && /ID PUBG/.test($("shopItemsBody").textContent) && /رقم التواصل/.test($("shopItemsBody").textContent), "the item appears in the list with the fields it asks for");
  ok(/غير محفوظة/.test($("shopDirty").textContent) && shopCalls("/admin/shop").filter(c => c.body.action === "save").length === 0, "it is marked 'unsaved' and NOT sent to the server yet");
  ok($("shopName").value === "" && $("shopPrice").value === "", "the form is cleared for the next item");
  // a second item with an email field and translations
  type("shopName", "اشتراك ChatGPT"); type("shopPrice", "9000"); type("shopNameEn", "ChatGPT subscription");
  $("shopUse_pid").checked = false; $("shopUse_email").checked = true; $("btnShopAdd").click();
  // edit the first one
  d.querySelector('button[data-shop-act="edit"][data-i="0"]').click();
  ok($("shopName").value === "PUBG 60 شدة" && $("shopPrice").value === "700" && $("shopLabel_pid").value === "ID PUBG" && $("shopUse_phone").checked && !$("shopReq_phone").checked && /تعديل/.test($("shopFormTitle").textContent), "editing loads the item into the form with its fields");
  type("shopPrice", "720"); $("btnShopAdd").click();
  ok(/720/.test($("shopItemsBody").children[0].textContent) && $("shopItemsBody").children.length === 2 && $("btnShopCancel").style.display === "none", "updating changes the price without adding a duplicate");
  // reorder + hide
  d.querySelector('button[data-shop-act="down"][data-i="0"]').click();
  ok(/ChatGPT/.test($("shopItemsBody").children[0].textContent) && /PUBG/.test($("shopItemsBody").children[1].textContent), "items can be moved");
  const vis = d.querySelector('input[data-shop-vis="0"]'); vis.checked = false; vis.dispatchEvent(new w.Event("change", { bubbles: true }));
  // save everything
  type("shopMinDays", "5"); type("shopMaxPending", "2");
  $("btnShopSave").click(); await sleep(250);
  const save = shopCalls("/admin/shop").find(c => c.body.action === "save");
  ok(!!save && save.body.items.length === 2 && save.body.settings.minActiveDays === 5 && save.body.settings.maxPending === 2, "saving sends all items and the rules in one call");
  const pubg = save.body.items.find(x => /PUBG/.test(x.name)), gpt = save.body.items.find(x => /ChatGPT/.test(x.name));
  ok(pubg.pricePoints === 720 && pubg.enabled === true && pubg.fields.length === 2 && pubg.fields[0].key === "pid" && pubg.fields[0].type === "id" && pubg.fields[0].label === "ID PUBG" && pubg.fields[0].required === true && pubg.fields[1].key === "phone" && pubg.fields[1].required === false && pubg.fields[1].label_tr === "İletişim numarası" && pubg.fields[1].label_en === "Contact number", "the item has the right fields: custom ID label, optional phone with built-in Turkish and English labels");
  ok(pubg.fields[0].label_tr === "ID PUBG" && pubg.fields[0].label_en === "ID PUBG", "a custom label is used as is for Turkish and English");
  ok(gpt.enabled === false && gpt.fields.length === 1 && gpt.fields[0].type === "email" && gpt.name_en === "ChatGPT subscription" && gpt.pricePoints === 9000, "the hidden item and its email field and English name are saved");
  ok(/انحفظ/.test($("shopMsg").textContent) && $("shopDirty").textContent === "", "a clear 'saved' message and the unsaved mark disappears");
  // delete
  confirmAnswer = false; d.querySelector('button[data-shop-act="del"][data-i="1"]').click(); ok($("shopItemsBody").children.length === 2, "delete asks first, and cancelling keeps the item");
  confirmAnswer = true; d.querySelector('button[data-shop-act="del"][data-i="1"]').click(); ok($("shopItemsBody").children.length === 1 && /غير محفوظة/.test($("shopDirty").textContent), "confirming removes it from the list (still needs saving)");
  failSave = true; $("btnShopSave").click(); await sleep(200); ok(/تعذّر الحفظ/.test($("shopMsg").textContent) && /غير صحيحة/.test($("shopMsg").textContent), "a server error is shown clearly");
  failSave = false;

  // resolving orders
  promptAnswer = null; d.querySelector('button[data-order="o1"][data-decision="done"]').click(); await sleep(100);
  ok(shopCalls("/admin/shop-orders").filter(c => c.body.action === "resolve").length === 0, "cancelling the note box does nothing");
  promptAnswer = "تم الشحن، دخّل اللعبة"; d.querySelector('button[data-order="o1"][data-decision="done"]').click(); await sleep(300);
  const r1 = shopCalls("/admin/shop-orders").find(c => c.body.action === "resolve");
  ok(r1 && r1.body.orderId === "o1" && r1.body.decision === "done" && r1.body.note === "تم الشحن، دخّل اللعبة", "'done' is sent with the admin's note");
  ok(d.querySelectorAll("#shopOrdersList > div").length === 1 && $("shopBadge").textContent === "1" && /انبعت إشعار/.test($("shopOrdersMsg").textContent), "the order leaves the pending list and the badge goes down");
  promptAnswer = "ID غلط"; d.querySelector('button[data-order="o2"][data-decision="rejected"]').click(); await sleep(300);
  const r2 = shopCalls("/admin/shop-orders").filter(c => c.body.action === "resolve")[1];
  ok(r2 && r2.body.decision === "rejected" && r2.body.note === "ID غلط" && /رجعت النقاط/.test($("shopOrdersMsg").textContent) && $("shopBadge").textContent === "", "'reject' is sent and the message says the points were returned");
  $("shopOrdersStatus").value = "done"; $("shopOrdersStatus").dispatchEvent(new w.Event("change")); await sleep(250);
  ok(shopCalls("/admin/shop-orders").some(c => c.body.action === "list" && c.body.status === "done") && /تم ✅/.test($("shopOrdersList").textContent) && /تم الشحن، دخّل اللعبة/.test($("shopOrdersList").textContent) && d.querySelectorAll("#shopOrdersList button[data-decision]").length === 0, "the done list shows the note and has no action buttons");
  ok(!w.__errs, "no script errors");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
