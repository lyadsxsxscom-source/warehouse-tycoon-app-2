// اختبارات السيرفر: كتالوج المتجر (شجرة مجلدات ومنتجات) بأسعار دولار لكل مستوى VIP (1..10) وطرق دفع بسعر صرف
// التشغيل: node tools/tests/store_catalog_worker.test.js
const vm = require("vm"), fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
function load(extra) {
  const src = fs.readFileSync(path.join(__dirname, "../../worker/worker.js"), "utf8").replace("export default {", "const __worker = {");
  const ctx = vm.createContext({ console, Request, Response, Headers, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout, Math, Date, JSON, Object, Array, Number, String, Promise, Error, Map, Set, Uint8Array, atob, btoa, fetch: () => { throw new Error("no net"); }, ...extra });
  vm.runInContext(src, ctx); return ctx;
}
const env = { FIREBASE_SA: JSON.stringify({ project_id: "proj" }), PENDING_CREDITS: { get: async () => null, put: async () => {} } };
(async () => {
  const c = load(); const store = new Map(); let tick = 1; const fetchCalls = []; let authOk = true;
  const nameToPath = n => n.split("/documents/")[1];
  c.getGoogleAccessToken = async (e, scope) => "tok:" + (scope ? "auth" : "default");
  c.fsGetDoc = async (e, p) => { const d = store.get(p); return d ? { exists: true, data: c.fieldsToObj(d.fields), updateTime: d.t } : { exists: false, data: null, updateTime: null }; };
  c.fsCommit = async (e, ws) => { for (const w of ws) {
    if (w.delete) { store.delete(nameToPath(w.delete)); continue; }
    const path = nameToPath(w.update.name), cur = store.get(path);
    const fields = w.updateMask ? { ...(cur ? cur.fields : {}), ...w.update.fields } : w.update.fields;
    store.set(path, { fields, t: String(++tick) });
  } return {}; };
  c.fsRunQuery = async (e, coll, field, limit, offset, filter) => {
    let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) }));
    if (filter) rows = rows.filter(r => filter.field.split(".").reduce((o, k) => (o == null ? o : o[k]), r.data) === filter.value);
    return rows.slice(0, limit);
  };
  c.fetch = async (url, o) => { fetchCalls.push({ url: String(url), auth: o.headers.Authorization, body: JSON.parse(o.body) }); return { ok: authOk, status: authOk ? 200 : 403, text: async () => "denied", json: async () => ({}) }; };
  c.verifyFirebaseToken = async (t) => ({ u1: { sub: "u1", email: "a@x.com" }, u2: { sub: "u2", email: "b@x.com" } }[t] || null);
  const W = vm.runInContext("__worker", c);
  const call = async (token, body) => { const r = await W.fetch(new Request("https://x/game/deleteAccount", { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json() }; };
  const put = (p, o) => store.set(p, { fields: c.objToFields(o), t: String(++tick) });
  const get = (p) => { const d = store.get(p); return d ? c.fieldsToObj(d.fields) : null; };
  c.fsCommit = async (e, ws) => {
    for (const w of ws) { if (w.delete) continue; const cur = store.get(nameToPath(w.update.name)), pre = w.currentDocument;
      if (pre && pre.exists === false && cur) throw Object.assign(new Error("ALREADY_EXISTS"), { conflict: true });
      if (pre && pre.exists === true && !cur) throw new Error("NOT_FOUND"); }
    for (const w of ws) { if (w.delete) { store.delete(nameToPath(w.delete)); continue; }
      const path = nameToPath(w.update.name), cur = store.get(path);
      store.set(path, { fields: w.updateMask ? { ...(cur ? cur.fields : {}), ...w.update.fields } : w.update.fields, t: String(++tick) }); }
    return {};
  };
  c.fsRunQuery = async (e, coll, field, limit) => [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) })).slice(0, limit);
  const ADMIN = vm.runInContext("ADMIN_UID", c);
  c.verifyFirebaseToken = async (t) => t === "admin" ? { sub: ADMIN } : (t === "other" ? { sub: "other" } : null);
  const adm = async (body, token = "admin") => { const r = await W.fetch(new Request("https://x/admin/store", { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json() }; };
  const pub = async (path, method = "GET") => W.fetch(new Request("https://x" + path, { method }), env, { waitUntil: p => p });
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const nodesOf = (r) => r.json.nodes;
  const byName = (r, n) => nodesOf(r).find(x => x.name === n);
  const item = (parentId, name, prices, extra) => adm({ action: "save", type: "item", parentId, name, prices, ...extra });
  let r;

  /* ---- A) admin only ---- */
  ok((await adm({ action: "list" }, null)).status === 401 && (await adm({ action: "list" }, "other")).status === 401 && (await adm({ action: "payments_get" }, "other")).status === 401, "the catalog and payment settings are admin-only");
  r = await adm({ action: "list" }); ok(r.status === 200 && r.json.nodes.length === 0 && r.json.max.depth === 4 && r.json.max.nodes === 300, "an empty catalog by default, with the limits");

  /* ---- B) folders, nesting, products ---- */
  r = await adm({ action: "save", type: "folder", parentId: "", name: "PUBG" }); const pubg = byName(r, "PUBG");
  ok(r.status === 200 && pubg.type === "folder" && pubg.parentId === "" && pubg.enabled === true && pubg.sort === 1 && /^n/.test(pubg.id) && !pubg.hasImage && pubg.prices.length === 0, "a root folder is created (enabled, first, no image, no prices)");
  r = await adm({ action: "save", type: "folder", name: "Free Fire" }); ok(byName(r, "Free Fire").sort === 2, "the second root folder comes after the first");
  r = await adm({ action: "save", type: "folder", parentId: pubg.id, name: "فوري" }); const fawri = byName(r, "فوري"); ok(fawri.parentId === pubg.id && fawri.sort === 1, "a folder inside a folder (PUBG > فوري)");
  r = await item(fawri.id, "60 UC", [0.92]); const uc60 = byName(r, "60 UC");
  ok(r.status === 200 && uc60.type === "item" && uc60.parentId === fawri.id && uc60.prices.length === 10 && uc60.prices.every(x => x === 0.92), "a product with only the VIP 1 price: every other level gets the same price");
  r = await item(fawri.id, "325 UC", [4.4]); r = await item(fawri.id, "660 UC", [9.26, 9.1, 9, 8.9, 8.8, 8.7, 8.6, 8.5, 8.4, 8.3]);
  ok(["60 UC", "325 UC", "660 UC"].map(n => byName(r, n).sort).join() === "1,2,3" && byName(r, "660 UC").prices.join() === "9.26,9.1,9,8.9,8.8,8.7,8.6,8.5,8.4,8.3", "products keep their order, and all ten VIP prices are stored");

  /* ---- C) validation of names and parents ---- */
  const bad = async (body, code) => { const x = await item(fawri.id, "x", [1], body); return x.status === 400 && x.json.error === code; };
  ok(await bad({ name: "   " }, "bad_name") && await bad({ name: "<b></b>" }, "bad_name"), "a name is required");
  r = await item(fawri.id, "<script>alert(1)</script>سعر", [1]); ok(!nodesOf(r).some(x => /[<>]/.test(x.name)), "HTML in names is stripped");
  r = await item(fawri.id, "x".repeat(100), [1]); ok(nodesOf(r).some(x => x.name === "x".repeat(60)), "names are limited to 60 characters");
  ok(await bad({ type: "thing" }, "bad_type") && await bad({ parentId: "nope" }, "bad_parent") && await bad({ parentId: uc60.id }, "bad_parent"), "type must be folder or product; the parent must be an existing folder");
  let chain = pubg.id; for (let lvl = 2; lvl <= 4; lvl++) { const x = await adm({ action: "save", type: "folder", parentId: chain, name: "L" + lvl }); chain = byName(x, "L" + lvl).id; }
  r = await adm({ action: "save", type: "folder", parentId: chain, name: "L5" }); ok(r.status === 400 && r.json.error === "too_deep", "nesting is limited to 4 levels");
  r = await item(chain, "deep", [1]); ok(r.status === 400 && r.json.error === "too_deep", "also for products");

  /* ---- D) VIP prices ---- */
  const pr = async (prices) => { const x = await item(fawri.id, "p", prices); return x; };
  r = await pr(undefined); ok(r.status === 400 && r.json.error === "bad_price" && /VIP 1/.test(r.json.message), "a product needs a VIP 1 price");
  r = await pr([]); ok(r.status === 400 && /VIP 1/.test(r.json.message), "an empty list is refused");
  r = await pr(["", 1]); ok(r.status === 400 && /VIP 1/.test(r.json.message), "VIP 1 cannot be blank");
  for (const badv of [0, -1, "abc", 1e7]) { r = await pr([badv]); ok(r.status === 400 && r.json.error === "bad_price", "refused VIP 1 price: " + badv); }
  r = await pr([5, 3, 4]); ok(r.status === 400 && r.json.error === "bad_vip_order" && /VIP 3/.test(r.json.message) && /VIP 2/.test(r.json.message), "a higher VIP level can never cost more than the level before it");
  r = await pr([5, 0]); ok(r.status === 400 && /VIP 2/.test(r.json.message), "a zero price for a level is refused");
  r = await pr([5, "", 4, null, "", 3]); const pp = byName(r, "p").prices; ok(r.status === 200 && pp.join() === "5,5,4,4,4,3,3,3,3,3", "blank levels take the price of the level before");
  r = await item(fawri.id, "q", [1.23456789]); ok(byName(r, "q").prices[0] === 1.2346, "prices keep up to 4 decimals");
  r = await item(fawri.id, "r", [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 999]); ok(r.status === 200 && byName(r, "r").prices.length === 10, "only ten levels are kept");
  r = await adm({ action: "save", type: "folder", parentId: fawri.id, name: "folder with prices", prices: [5] }); ok(r.status === 200 && byName(r, "folder with prices").prices.length === 0, "a folder has no prices (they are ignored)");

  /* ---- E) editing ---- */
  r = await adm({ action: "save", id: uc60.id, name: "60 UC (فوري)", prices: [0.95, 0.9], enabled: false, type: "folder", parentId: "" });
  const e60 = byName(r, "60 UC (فوري)"); ok(e60 && e60.prices[0] === 0.95 && e60.prices[1] === 0.9 && e60.prices[2] === 0.9 && e60.enabled === false && e60.type === "item" && e60.parentId === fawri.id, "editing changes name, prices and visibility only; type and place cannot be changed");
  r = await adm({ action: "save", id: uc60.id, name: "60 UC (فوري)", enabled: true }); ok(r.status === 400 && r.json.error === "bad_price", "editing a product without prices is refused");
  r = await adm({ action: "save", id: "ghost", name: "x", prices: [1] }); ok(r.status === 404, "editing an unknown item is a 404");
  put("storeNodes/legacy1", { parentId: fawri.id, type: "item", name: "old first-version product", price: 150, enabled: true, sort: 99, imageVer: 0 });
  r = await adm({ action: "list" }); ok(byName(r, "old first-version product").prices.length === 0, "a product from the first version (priced in SYP) shows no USD price until you set one");
  store.delete("storeNodes/legacy1");
  await adm({ action: "save", id: uc60.id, name: "60 UC", prices: [0.92], enabled: true });

  /* ---- F) images ---- */
  r = await adm({ action: "save", id: uc60.id, name: "60 UC", prices: [0.92], enabled: true, image: PNG }); const withImg = byName(r, "60 UC");
  ok(withImg.hasImage && /^\/store\/img\/n[^?]+\?v=\d+$/.test(withImg.imageUrl), "an image can be added (the list gives a short image link)");
  const ir = await pub(withImg.imageUrl.split("?")[0]); const buf = Buffer.from(await ir.arrayBuffer());
  ok(ir.status === 200 && ir.headers.get("Content-Type") === "image/png" && /immutable/.test(ir.headers.get("Cache-Control")) && ir.headers.get("X-Content-Type-Options") === "nosniff" && buf.equals(Buffer.from(PNG.split(",")[1], "base64")), "the image link serves the real image bytes with caching, publicly");
  const ver1 = withImg.imageUrl;
  for (const [img, label] of [["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "SVG"], ["data:image/png;base64,@@@", "not base64"], ["http://x/y.png", "a web link"], ["data:image/png;base64," + "A".repeat(290000), "too big"], [123, "not text"]]) {
    r = await adm({ action: "save", id: uc60.id, name: "60 UC", prices: [0.92], image: img }); ok(r.status === 400 && r.json.error === "bad_image", "rejected image: " + label);
  }
  ok(byName(await adm({ action: "list" }), "60 UC").imageUrl === ver1, "a refused image leaves the old one untouched");
  await new Promise(res => setTimeout(res, 5));
  r = await adm({ action: "save", id: uc60.id, name: "60 UC", prices: [0.92], image: PNG.replace("image/png", "image/webp") }); ok(byName(r, "60 UC").imageUrl !== ver1, "replacing the image changes the link");
  r = await adm({ action: "save", id: uc60.id, name: "60 UC 2", prices: [0.92] }); ok(byName(r, "60 UC 2").hasImage, "editing without touching the image keeps it");
  r = await adm({ action: "save", id: uc60.id, name: "60 UC", prices: [0.92], image: "" }); ok(!byName(r, "60 UC").hasImage && !store.has("storeImages/" + uc60.id), "an empty image removes it");
  ok((await pub("/store/img/" + uc60.id)).status === 404 && (await pub("/store/img/ghost")).status === 404 && (await pub("/store/img/")).status === 404, "a removed or unknown image is a 404");
  ok(!JSON.stringify(nodesOf(await adm({ action: "list" }))).includes("base64"), "lists never carry image data");

  /* ---- G) order ---- */
  const idOf = (r, n) => byName(r, n).id; const kidsOf = (r, pid) => nodesOf(r).filter(x => x.parentId === pid).map(x => x.name);
  r = await adm({ action: "list" }); const first3 = kidsOf(r, fawri.id).slice(0, 3).join("|");
  r = await adm({ action: "reorder", id: idOf(r, "325 UC"), dir: "up" }); ok(kidsOf(r, fawri.id).slice(0, 3).join("|") === "325 UC|60 UC|660 UC", "moving a product up swaps it with the one above (was " + first3 + ")");
  r = await adm({ action: "reorder", id: idOf(r, "325 UC"), dir: "up" }); ok(kidsOf(r, fawri.id)[0] === "325 UC", "the top one cannot move up");
  r = await adm({ action: "reorder", id: idOf(r, "325 UC"), dir: "down" }); ok(kidsOf(r, fawri.id).slice(0, 2).join("|") === "60 UC|325 UC", "moving down works");
  ok(kidsOf(r, "").join("|") === "PUBG|Free Fire", "other folders keep their order");
  ok((await adm({ action: "reorder", id: "ghost", dir: "up" })).status === 400 && (await adm({ action: "reorder", id: pubg.id, dir: "left" })).status === 400, "bad reorder requests are refused");

  /* ---- H) deleting ---- */
  r = await adm({ action: "delete", id: fawri.id }); ok(r.status === 400 && r.json.error === "has_children", "a folder with things inside cannot be deleted");
  const id325 = byName(await adm({ action: "list" }), "325 UC").id; put("storeImages/" + id325, { data: PNG, ver: 1 });
  r = await adm({ action: "delete", id: id325 }); ok(r.status === 200 && !nodesOf(r).some(x => x.id === id325) && !store.has("storeImages/" + id325), "a product is deleted together with its image data");
  ok((await adm({ action: "delete", id: "ghost" })).status === 404, "deleting an unknown item is a 404");

  /* ---- I) payment methods ---- */
  r = await adm({ action: "payments_get" }); ok(r.status === 200 && Array.isArray(r.json.methods) && r.json.methods.length === 0 && r.json.updatedAt === 0, "no payment methods at first");
  const M = (o) => ({ name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0, enabled: true, ...o });
  const save = (methods) => adm({ action: "payments_save", methods });
  r = await save([M({}), M({ name: "USDT", currency: "USDT", rate: 1, decimals: 2, feePct: 1.5 }), M({ name: "مخفية", rate: 10, enabled: false })]);
  ok(r.status === 200 && r.json.methods.length === 3 && r.json.methods.every(m => /^m[A-Za-z0-9_-]+$/.test(m.id)) && new Set(r.json.methods.map(m => m.id)).size === 3 && r.json.updatedAt > 0, "methods are saved, each with its own id");
  const mIds = r.json.methods.map(m => m.id);
  r = await save(r.json.methods.slice().reverse()); ok(r.json.methods.map(m => m.id).join() === mIds.slice().reverse().join(), "ids are kept when you save again (and order follows the list)");
  r = await adm({ action: "payments_get" }); ok(r.json.methods.length === 3 && r.json.methods[1].feePct === 1.5 && r.json.methods[2].rate === 142.5, "they can be read back");
  const bm = async (m, code, msg) => { const x = await save([M(m)]); return x.status === 400 && x.json.error === code && (!msg || msg.test(x.json.message)); };
  ok(await bm({ name: " " }, "bad_method", /اكتب اسم/) && await bm({ currency: "" }, "bad_method", /رمز العملة/), "a method needs a name and a currency symbol");
  ok(await bm({ rate: 0 }, "bad_rate") && await bm({ rate: -5 }, "bad_rate") && await bm({ rate: "x" }, "bad_rate") && await bm({ rate: 1e10 }, "bad_rate"), "the exchange rate must be a number above 0");
  ok(await bm({ decimals: 5 }, "bad_method") && await bm({ decimals: 1.5 }, "bad_method") && await bm({ feePct: 51 }, "bad_method") && await bm({ feePct: -1 }, "bad_method"), "decimals (0 to 4) and the extra percentage (0 to 50) are checked");
  r = await save(Array.from({ length: 9 }, (_, i) => M({ name: "m" + i }))); ok(r.status === 400 && r.json.error === "bad_methods", "at most 8 methods");
  r = await save([M({ id: "same" }), M({ id: "same", name: "two" })]); ok(r.json.methods[0].id === "same" && r.json.methods[1].id !== "same", "two methods can never share an id");
  r = await save([M({ name: "<b>x</b>شام", currency: "<i>$</i>" })]); ok(!/[<>]/.test(r.json.methods[0].name + r.json.methods[0].currency), "HTML is stripped from method names");
  r = await save([M({ rate: "142.123456789" })]); ok(r.json.methods[0].rate === 142.123457, "the rate keeps 6 decimals");
  await save([M({}), M({ name: "USDT", currency: "USDT", rate: 1, decimals: 2, feePct: 1.5 }), M({ name: "مخفية", currency: "x", rate: 10, enabled: false })]);

  /* ---- J) the public catalog ---- */
  for (const k of [...store.keys()]) if (k.startsWith("storeNodes/") || k.startsWith("storeImages/")) store.delete(k);
  const mk = async (parentId, type, name, prices, enabled = true) => byName(await adm({ action: "save", type, parentId, name, prices, enabled }), name);
  const A = await mk("", "folder", "A"), A1 = await mk(A.id, "folder", "A-instant"), I1 = await mk(A1.id, "item", "I1", [1, 0.9, 0.8]), I2 = await mk(A1.id, "item", "I2", [2], false), I3 = await mk(A1.id, "item", "I3", [3]);
  const B = await mk("", "folder", "B (all hidden inside)"), B1 = await mk(B.id, "item", "hidden item", [5], false);
  const C = await mk("", "folder", "C disabled", undefined, false), C1 = await mk(C.id, "item", "under disabled folder", [7]);
  const E = await mk("", "folder", "E empty");
  put("storeNodes/unpriced", { parentId: A1.id, type: "item", name: "no usd price", price: 150, enabled: true, sort: 50, imageVer: 0 });
  await adm({ action: "save", id: I1.id, name: "I1", prices: [1, 0.9, 0.8], image: PNG });
  let cat = await pub("/store/catalog"); let cj = await cat.json();
  ok(cat.status === 200 && cj.ok && /max-age=60/.test(cat.headers.get("Cache-Control")) && cat.headers.get("Access-Control-Allow-Origin") === "*", "the public catalog works without sign-in and can be cached for a minute");
  ok(cj.items.length === 1 && cj.items[0].name === "A" && cj.items[0].children[0].children.map(x => x.name).join() === "I1,I3", "only enabled and priced products show; hidden products, folders with nothing visible, disabled folders (and what is in them), empty folders, and products with no USD price are all hidden");
  const leaf = cj.items[0].children[0].children[0];
  ok(leaf.priceUsd === 1 && !("prices" in leaf) && !("price" in leaf) && /^\/store\/img\/n/.test(leaf.imageUrl) && !("enabled" in leaf) && !("sort" in leaf), "the public price is the VIP 1 price only; the other VIP prices are never sent to the public");
  ok(cj.methods.length === 2 && cj.methods[0].name === "شام كاش" && cj.methods[0].rate === 142.5 && cj.methods[1].feePct === 1.5 && !cj.methods.some(m => m.name === "مخفية") && !("enabled" in cj.methods[0]), "the catalog carries the ENABLED payment methods with their rate, decimals and extra percentage");
  ok((await (await pub("/store/catalog", "POST")).json()).items.length === 1, "also works as POST");
  ok(cj.wallet && cj.wallet.pointsPerUsd === 1000 && Object.keys(cj.wallet).join() === "pointsPerUsd", "the public catalog also tells the page the points rate (1000 per dollar by default), and nothing else about the wallet");
  await adm({ action: "save", id: I2.id, name: "I2", prices: [2], enabled: true });
  cj = await (await pub("/store/catalog")).json(); ok(cj.items[0].children[0].children.map(x => x.name).join() === "I1,I2,I3", "turning a product on makes it appear in its place");
  await save([]); cj = await (await pub("/store/catalog")).json(); ok(Array.isArray(cj.methods) && cj.methods.length === 0, "with no methods the list is empty (the page then shows dollars only)");

  /* ---- K) overall size limit ---- */
  for (const k of [...store.keys()]) if (k.startsWith("storeNodes/")) store.delete(k);
  for (let i = 0; i < 300; i++) put("storeNodes/x" + i, { parentId: "", type: "item", name: "x" + i, prices: [1], enabled: true, sort: i, imageVer: 0 });
  r = await item("", "one too many", [1]); ok(r.status === 400 && r.json.error === "too_many", "the catalog is limited to 300 entries");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
