// اختبارات السيرفر: متجر شحن الألعاب (عناصر الأدمن، الطلبات بالنقاط، التنفيذ والرفض مع إرجاع النقاط)
// التشغيل: node tools/tests/shop_worker.test.js
const vm = require("vm"), fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
function load(extra) {
  const src = fs.readFileSync(path.join(__dirname, "../../worker/worker.js"), "utf8").replace("export default {", "const __worker = {");
  const ctx = vm.createContext({ console, Request, Response, Headers, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout, Math, Date, JSON, Object, Array, Number, String, Promise, Error, Map, Set, Uint8Array, atob, btoa, fetch: () => { throw new Error("no net"); }, ...extra });
  vm.runInContext(src, ctx); return ctx;
}
const env = { FIREBASE_SA: JSON.stringify({ project_id: "proj" }), PENDING_CREDITS: { get: async () => null, put: async () => {} } };
(async () => {
  const c = load(); const store = new Map(); let tick = 1; const pushes = [];
  const nameToPath = n => n.split("/documents/")[1];
  c.getGoogleAccessToken = async () => "tok";
  c.fsGetDoc = async (e, p) => { const d = store.get(p); return d ? { exists: true, data: c.fieldsToObj(d.fields), updateTime: d.t } : { exists: false, data: null, updateTime: null }; };
  c.fsCommit = async (e, ws) => {
    for (const w of ws) {                                           // نفس قواعد قاعدة البيانات الحقيقية: الشروط المسبقة
      const cur = store.get(nameToPath(w.update.name)), pre = w.currentDocument;
      if (pre && pre.exists === false && cur) throw Object.assign(new Error("ALREADY_EXISTS"), { conflict: true });
      if (pre && pre.updateTime && (!cur || cur.t !== pre.updateTime)) throw Object.assign(new Error("FAILED_PRECONDITION"), { conflict: true });
    }
    for (const w of ws) {
      const path = nameToPath(w.update.name), cur = store.get(path);
      if (w.updateTransforms && !Object.keys(w.update.fields || {}).length) continue;            // عدّادات الإحصائيات: ما بتهمنا هون
      const fields = w.updateMask ? { ...(cur ? cur.fields : {}), ...w.update.fields } : w.update.fields;
      store.set(path, { fields, t: String(++tick) });
    }
    return {};
  };
  c.fsRunQuery = async (e, coll, field, limit, offset, filter) => {
    let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) }));
    if (filter) rows = rows.filter(r => filter.field.split(".").reduce((o, k) => (o == null ? o : o[k]), r.data) === filter.value);
    return rows.slice(0, limit);
  };
  const CFG = { game: { workers: {} }, pricing: { minWithdrawUsd: 5 }, shop: {} };
  c.loadConfig = async () => CFG;
  c.sendPush = async (e, uid, type, d) => { pushes.push({ uid, type, d }); };
  const ADMIN = vm.runInContext("ADMIN_UID", c);
  const TOK = { admin: { sub: ADMIN }, u1: { sub: "u1", name: "Ahmad", email: "a@x.com" }, u2: { sub: "u2", email: "b@x.com" }, u3: { sub: "u3", email: "c@x.com" } };
  c.verifyFirebaseToken = async (t) => TOK[t] || null;
  const W = vm.runInContext("__worker", c);
  const call = async (pathname, token, body) => { const r = await W.fetch(new Request("https://x" + pathname, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json() }; };
  const put = (p, o) => store.set(p, { fields: c.objToFields(o), t: String(++tick) });
  const get = (p) => { const d = store.get(p); return d ? c.fieldsToObj(d.fields) : null; };
  const NOW = Date.now();
  put("players/u1", { shelves: c.defaultShelves(), points: 5000, totalPointsEarned: 5000, activeDays: 5, adsWatched: 12, firstSeenAt: NOW });
  put("players/u2", { shelves: c.defaultShelves(), points: 100, totalPointsEarned: 100, activeDays: 5, firstSeenAt: NOW });
  put("players/u3", { shelves: c.defaultShelves(), points: 5000, totalPointsEarned: 5000, activeDays: 1, firstSeenAt: NOW });

  /* ---- A) admin saves the catalog (sanitised) ---- */
  ok((await call("/admin/shop", "u1", { action: "get" })).status === 401 && (await call("/admin/shop", "", { action: "get" })).status === 401, "the catalog editor is admin-only");
  let r = await call("/admin/shop", "admin", { action: "get" });
  ok(r.status === 200 && r.json.items.length === 0 && r.json.settings.minActiveDays === 3 && r.json.settings.maxPending === 3 && r.json.settings.maxPerWeek === 2, "an empty store by default, with safe default rules (3 active days, 3 pending orders)");
  const items = [
    { name: "  PUBG <b>60</b> شدة ", name_en: "PUBG 60 UC", desc: "شحن فوري", pricePoints: 700.9, fields: [{ key: "pid", label: "ID اللاعب", label_en: "Player ID", type: "id", required: true }, { key: "contact", label: "رقم التواصل", type: "phone", required: false }] },
    { name: "مخفي", pricePoints: 100, enabled: false },
    { name: "اشتراك", pricePoints: 1500, fields: [{ key: "mail", label: "البريد", type: "email" }, { label: "اسم", type: "weird" }, { key: "mail", label: "مكرر", type: "text" }, { label: "", type: "text" }] },
    { name: "", pricePoints: 5 }, { name: "بدون سعر" }, { name: "سعر سالب", pricePoints: -3 }, null, "x",
  ];
  r = await call("/admin/shop", "admin", { action: "save", items, settings: { minActiveDays: 2, maxPending: 3, maxPerWeek: 0 } });
  ok(r.status === 200 && r.json.items.length === 3 && r.json.dropped === 5, "invalid items are dropped, valid ones are saved");
  const saved = r.json.items;
  ok(saved[0].name === "PUBG 60 شدة" && !/[<>]/.test(saved[0].name) && saved[0].pricePoints === 700, "names are cleaned (no tags, no extra spaces) and the price is a whole number");
  ok(saved[0].fields.length === 2 && saved[0].fields[1].required === false && saved[0].id.startsWith("it_"), "fields are kept; an id is created for each item");
  ok(saved[2].fields.length === 2 && saved[2].fields[1].type === "text" && saved[2].fields[1].key === "f1", "duplicate and empty fields are dropped, unknown field types become text");
  ok(get("config/shop").items.length === 3 && get("config/shop").minActiveDays === 2, "the catalog and rules are stored in the database");
  CFG.shop = get("config/shop");
  ok((await call("/admin/shop", "admin", { action: "save", items: "no" })).status === 400 && (await call("/admin/shop", "admin", { action: "save", items: new Array(61).fill({ name: "x", pricePoints: 1 }) })).status === 400, "a wrong or oversized catalog is refused");
  const ID1 = saved[0].id, ID_OFF = saved[1].id, ID_MAIL = saved[2].id;

  /* ---- B) the player sees the store ---- */
  ok((await call("/game/shop", "", {})).status === 401, "the store needs a signed-in player");
  r = await call("/game/shop", "u1", { lang: "ar" });
  ok(r.status === 200 && r.json.shop.items.length === 2 && !r.json.shop.items.some(x => x.id === ID_OFF), "the player sees only the enabled items");
  ok(r.json.shop.items[0].fields[0].label === "ID اللاعب" && r.json.shop.items[0].fields[0].required === true && !("enabled" in r.json.shop.items[0]), "item fields come with labels and no admin-only data");
  r = await call("/game/shop", "u1", { lang: "en" });
  ok(r.json.shop.items[0].name === "PUBG 60 UC" && r.json.shop.items[0].fields[0].label === "Player ID" && r.json.shop.items[1].name === "اشتراك", "English names are used when given, otherwise the Arabic name");
  ok(r.json.shop.minActiveDays === 2 && r.json.shop.maxPending === 3 && r.json.orders.length === 0, "the player also gets the rules and an empty orders list");

  /* ---- C) placing orders ---- */
  const order = (token, itemId, fields, reqId) => call("/game/shopOrder", token, { itemId, fields, reqId });
  r = await order("u1", ID1, { pid: "5123456789", contact: "0933 123 456" }, "req-1");
  ok(r.status === 200 && r.json.ok && r.json.result.pricePoints === 700 && r.json.state.points === 4300, "a valid order spends exactly the item price and returns the new balance");
  let ord = get("shopOrders/" + r.json.result.orderId);
  ok(ord && ord.status === "pending" && ord.uid === "u1" && ord.pricePoints === 700 && ord.itemName === "PUBG 60 شدة" && ord.fields[0].value === "5123456789" && ord.fields[0].label === "ID اللاعب" && ord.email === "a@x.com", "the pending order records who, what, the price and the player's details");
  ok(ord.snapshot.activeDays === 5 && ord.snapshot.adsWatched === 12 && ord.snapshot.pointsAfter === 4300, "the order keeps a snapshot of the player's activity for the admin");
  const before = get("players/u1").points;
  r = await order("u1", ID1, { pid: "5123456789", contact: "0933 123 456" }, "req-1");
  ok(r.status === 409 && r.json.error === "duplicate_order" && get("players/u1").points === before, "sending the same request twice (double tap) is refused and charges nothing");
  r = await order("u1", ID1, { contact: "0933123456" }, "req-2");
  ok(r.status === 400 && r.json.error === "bad_field" && /ID اللاعب/.test(r.json.message) && get("players/u1").points === before, "a missing required field is refused with its name and no points are spent");
  r = await order("u1", ID1, { pid: "1", contact: "abc" }, "req-3");
  ok(r.status === 400 && r.json.error === "bad_field" && get("players/u1").points === before, "a wrong phone number is refused");
  r = await order("u1", ID_MAIL, { mail: "not-an-email", f1: "x" }, "req-4");
  ok(r.status === 400 && /بريد/.test(r.json.message), "a wrong email is refused");
  r = await order("u1", ID1, { pid: "9<script>9", contact: "" }, "req-5");
  ok(r.status === 200 && get("shopOrders/" + r.json.result.orderId).fields[0].value === "9 9", "dangerous characters are removed from what the player typed; an optional field can stay empty");
  r = await order("u1", ID_OFF, {}, "req-6"); ok(r.status === 404 && r.json.error === "shop_item", "a hidden item cannot be ordered");
  r = await order("u1", "nope", {}, "req-7"); ok(r.status === 404, "an unknown item cannot be ordered");
  r = await order("u2", ID1, { pid: "1" }, "req-8"); ok(r.status === 400 && r.json.error === "not_enough_points" && get("players/u2").points === 100, "not enough points: refused, nothing taken");
  r = await order("u3", ID1, { pid: "1" }, "req-9"); ok(r.status === 400 && r.json.error === "shop_locked" && get("players/u3").points === 5000, "a player with too few active days cannot order yet");
  r = await order("u1", ID1, { pid: "77" }, "req-10"); ok(r.status === 200, "a third pending order is accepted");
  r = await order("u1", ID1, { pid: "78" }, "req-11");
  ok(r.status === 400 && r.json.error === "too_many_pending", "more than 3 pending orders at once is refused");
  ok(get("players/u1").points === 5000 - 700 * 3, "points were taken only for the three accepted orders");

  /* ---- D) the player's own orders only ---- */
  r = await call("/game/shop", "u1", { lang: "ar" });
  ok(r.json.orders.length === 3 && r.json.orders.every(o => o.status === "pending") && r.json.orders[0].fields[0].label === "ID اللاعب", "the player sees his own 3 pending orders with the details he typed");
  r = await call("/game/shop", "u2", {}); ok(r.json.orders.length === 0, "another player sees none of them");

  /* ---- E) the admin queue ---- */
  ok((await call("/admin/shop-orders", "u1", { action: "list" })).status === 401, "the orders queue is admin-only");
  r = await call("/admin/shop-orders", "admin", { action: "list", status: "pending" });
  ok(r.json.orders.length === 3 && r.json.orders[0].email === "a@x.com" && r.json.orders[0].displayName === "Ahmad" && r.json.orders[0].snapshot.activeDays === 5, "the admin sees pending orders with the player's email, name and activity");
  const o1 = r.json.orders[0].id, o2 = r.json.orders[1].id, o3 = r.json.orders[2].id;
  pushes.length = 0;
  r = await call("/admin/shop-orders", "admin", { action: "resolve", orderId: o1, decision: "done", note: "تم الشحن" });
  ok(r.status === 200 && get("shopOrders/" + o1).status === "done" && get("shopOrders/" + o1).note === "تم الشحن" && get("players/u1").points === 5000 - 2100, "marking an order done keeps the points spent");
  const msgs = get("inbox/u1").items;
  const doneMsg = msgs.find(m => /تم تنفيذ/.test(m.title));
  ok(doneMsg && /PUBG 60/.test(doneMsg.body) && /تم الشحن/.test(doneMsg.body) && doneMsg.title_en && doneMsg.title_tr, "the player gets a mail message in all three languages with the admin's note");
  ok(pushes.length === 1 && pushes[0].type === "shop_done" && pushes[0].uid === "u1", "and a push notification");
  const pts = get("players/u1").points;
  r = await call("/admin/shop-orders", "admin", { action: "resolve", orderId: o2, decision: "rejected", note: "الـID غلط" });
  ok(r.status === 200 && get("shopOrders/" + o2).status === "rejected" && get("players/u1").points === pts + 700, "rejecting an order gives the points back");
  const rejMsg = get("inbox/u1").items.find(m => /انرفض/.test(m.title));
  ok(rejMsg && /رجعنالك 700/.test(rejMsg.body) && /الـID غلط/.test(rejMsg.body) && pushes[1].type === "shop_rejected", "the refund message says how many points came back and why");
  r = await call("/admin/shop-orders", "admin", { action: "resolve", orderId: o2, decision: "rejected" });
  ok(r.status === 409 && r.json.error === "already_resolved" && get("players/u1").points === pts + 700, "rejecting twice does NOT refund twice");
  r = await call("/admin/shop-orders", "admin", { action: "resolve", orderId: o1, decision: "done" }); ok(r.status === 409, "an order that is already done cannot be resolved again");
  r = await call("/admin/shop-orders", "admin", { action: "resolve", orderId: o1, decision: "rejected" }); ok(r.status === 409 && get("players/u1").points === pts + 700, "a done order cannot be rejected later (no refund)");
  ok((await call("/admin/shop-orders", "admin", { action: "resolve", orderId: "missing", decision: "done" })).status === 404, "an unknown order is not found");
  ok((await call("/admin/shop-orders", "admin", { action: "resolve", orderId: o3, decision: "maybe" })).status === 400, "an unknown decision is refused");
  ok((await call("/admin/shop-orders", "u1", { action: "resolve", orderId: o3, decision: "done" })).status === 401, "a player cannot resolve orders");
  put("players/u1", { ...get("players/u1"), points: 0 });
  r = await call("/admin/shop-orders", "admin", { action: "resolve", orderId: o3, decision: "rejected" });
  ok(r.status === 200 && get("players/u1").points === 700, "the refund works even if the player already spent his other points");
  r = await call("/admin/shop-orders", "admin", { action: "list", status: "done" }); ok(r.json.orders.length === 1 && r.json.orders[0].id === o1, "the admin can list done orders");
  r = await call("/game/shop", "u1", { lang: "ar" });
  ok(["done", "rejected", "rejected"].every(s => r.json.orders.some(o => o.status === s)) && r.json.orders.find(o => o.status === "rejected" && o.note === "الـID غلط"), "the player sees the new status and the admin's note");
  r = await order("u1", ID1, { pid: "1" }, "req-12"); ok(r.status === 200, "after orders are resolved the player can order again");

  /* ---- E2) weekly cap ---- */
  r = await call("/admin/shop", "admin", { action: "save", items: [{ name: "x", pricePoints: 5 }], settings: { minActiveDays: 1, maxPending: 5, maxPerWeek: 999 } });
  ok(r.json.settings.maxPerWeek === 50, "the weekly cap is limited to 50");
  r = await call("/admin/shop", "admin", { action: "save", items: [{ name: "x", pricePoints: 5 }], settings: { maxPerWeek: -4 } }); ok(r.json.settings.maxPerWeek === 0, "a negative cap means unlimited (0)");
  r = await call("/admin/shop", "admin", { action: "save", items: [{ name: "x", pricePoints: 5 }], settings: {} }); ok(r.json.settings.maxPerWeek === 2, "without a value the cap defaults to 2 per week");
  r = await call("/admin/shop", "admin", { action: "save", items: items.slice(0, 1), settings: { minActiveDays: 0, maxPending: 10, maxPerWeek: 2 } });
  CFG.shop = get("config/shop"); let CAPITEM = r.json.items[0].id; TOK.u4 = { sub: "u4", name: "Dan", email: "d@x.com" };
  put("players/u4", { shelves: c.defaultShelves(), points: 20000, totalPointsEarned: 20000, activeDays: 5, adsWatched: 5, firstSeenAt: NOW });
  r = await order("u4", CAPITEM, { pid: "1" }, "cap-1"); ok(r.status === 200, "cap 2/week: first order accepted");
  r = await order("u4", CAPITEM, { pid: "2" }, "cap-2"); ok(r.status === 200, "cap 2/week: second order accepted");
  r = await order("u4", CAPITEM, { pid: "3" }, "cap-3");
  ok(r.status === 400 && r.json.error === "weekly_cap" && /\(2\)/.test(r.json.message) && /7 يوم/.test(r.json.message), "the third order within a week is refused, saying the limit and how many days to wait");
  r = await call("/game/shop", "u4", {}); ok(r.json.shop.maxPerWeek === 2 && r.json.shop.weeklyUsed === 2, "the player is told the weekly limit and how much he used");
  const u4orders = [...store.keys()].filter(k => k.startsWith("shopOrders/")).map(k => ({ id: k.split("/")[1], ...get(k) })).filter(o => o.uid === "u4");
  await call("/admin/shop-orders", "admin", { action: "resolve", orderId: u4orders[0].id, decision: "rejected", note: "x" });
  r = await call("/game/shop", "u4", {}); ok(r.json.shop.weeklyUsed === 1, "a rejected (refunded) order does not count against the cap");
  r = await order("u4", CAPITEM, { pid: "3" }, "cap-4"); ok(r.status === 200, "so after a rejection he can order again");
  for (const o of [...store.keys()].filter(k => k.startsWith("shopOrders/"))) { const d0 = get(o); if (d0.uid === "u4") put(o, { ...d0, createdAt: Date.now() - 5 * 86400000 }); }
  r = await order("u4", CAPITEM, { pid: "4" }, "cap-5"); ok(r.status === 400 && /2 يوم/.test(r.json.message), "with orders from 5 days ago the message says to wait about 2 more days");
  for (const o of [...store.keys()].filter(k => k.startsWith("shopOrders/"))) { const d0 = get(o); if (d0.uid === "u4") put(o, { ...d0, createdAt: Date.now() - 8 * 86400000 }); }
  r = await order("u4", CAPITEM, { pid: "5" }, "cap-6"); ok(r.status === 200, "orders older than 7 days do not count");
  r = await call("/admin/shop", "admin", { action: "save", items: items.slice(0, 1), settings: { minActiveDays: 0, maxPending: 10, maxPerWeek: 0 } }); CFG.shop = get("config/shop"); CAPITEM = r.json.items[0].id;
  for (let k = 0; k < 4; k++) { r = await order("u4", CAPITEM, { pid: "u" + k }, "cap-u" + k); if (r.status !== 200) break; }
  ok(r.status === 200, "with the cap set to 0 there is no weekly limit");

  /* ---- F) an empty store ---- */
  CFG.shop = {}; r = await call("/game/shop", "u1", {}); ok(r.status === 200 && r.json.shop.items.length === 0, "with no items the store list is simply empty");
  r = await order("u1", ID1, { pid: "1" }, "req-13"); ok(r.status === 404, "ordering from an empty store fails cleanly");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
