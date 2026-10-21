// اختبارات السيرفر: متجر الشدات الخطوة 1 (شجرة مجلدات ومنتجات: إنشاء، تحقق، صور، ترتيب، حذف، الكتالوج العام)
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
    if (filter) rows = rows.filter(r => r.data[filter.field] === filter.value);
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
  const pub = async (path, method = "GET") => { const r = await W.fetch(new Request("https://x" + path, { method }), env, { waitUntil: p => p }); return r; };
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const nodesOf = (r) => r.json.nodes;
  const byName = (r, n) => nodesOf(r).find(x => x.name === n);
  let r;

  /* ---- A) admin only ---- */
  ok((await adm({ action: "list" }, null)).status === 401 && (await adm({ action: "list" }, "other")).status === 401, "the catalog admin endpoint is admin-only");
  r = await adm({ action: "list" }); ok(r.status === 200 && r.json.nodes.length === 0 && r.json.max.depth === 4 && r.json.max.nodes === 300, "an empty catalog by default, with the limits");

  /* ---- B) folders, nesting, products ---- */
  r = await adm({ action: "save", type: "folder", parentId: "", name: "PUBG" }); const pubg = byName(r, "PUBG");
  ok(r.status === 200 && pubg && pubg.type === "folder" && pubg.parentId === "" && pubg.enabled === true && pubg.sort === 1 && /^n/.test(pubg.id) && !pubg.hasImage && pubg.imageUrl === "", "a root folder is created (enabled, first in order, no image)");
  r = await adm({ action: "save", type: "folder", name: "Free Fire" }); ok(byName(r, "Free Fire").sort === 2, "the second root folder comes after the first");
  r = await adm({ action: "save", type: "folder", parentId: pubg.id, name: "فوري" }); const fawri = byName(r, "فوري");
  ok(fawri && fawri.parentId === pubg.id && fawri.sort === 1, "a folder inside a folder (PUBG > فوري)");
  r = await adm({ action: "save", type: "item", parentId: fawri.id, name: "60 UC", price: 150 }); const uc60 = byName(r, "60 UC");
  ok(uc60 && uc60.type === "item" && uc60.price === 150 && uc60.parentId === fawri.id, "a product inside it, with a price in SYP");
  r = await adm({ action: "save", type: "item", parentId: fawri.id, name: "325 UC", price: 750 }); r = await adm({ action: "save", type: "item", parentId: fawri.id, name: "660 UC", price: 1450 });
  ok(["60 UC", "325 UC", "660 UC"].map(n => byName(r, n).sort).join() === "1,2,3", "products keep the order they were added");

  /* ---- C) validation ---- */
  const bad = async (body, code) => { const x = await adm({ action: "save", type: "item", parentId: fawri.id, name: "x", price: 1, ...body }); return x.status === 400 && x.json.error === code; };
  ok(await bad({ name: "   " }, "bad_name") && await bad({ name: "<b></b>" }, "bad_name"), "a name is required (spaces or empty HTML do not count)");
  r = await adm({ action: "save", type: "item", parentId: fawri.id, name: "<script>alert(1)</script>سعر", price: 1 }); ok(!nodesOf(r).some(x => /[<>]/.test(x.name)), "HTML in names is stripped");
  r = await adm({ action: "save", type: "item", parentId: fawri.id, name: "x".repeat(100), price: 1 }); ok(nodesOf(r).some(x => x.name === "x".repeat(60)), "names are limited to 60 characters");
  ok(await bad({ price: -1 }, "bad_price") && await bad({ price: "abc" }, "bad_price") && await bad({ price: 1e9 }, "bad_price"), "a price must be a number between 0 and 100,000,000");
  r = await adm({ action: "save", type: "item", parentId: fawri.id, name: "كسر", price: "99.6" }); ok(byName(r, "كسر").price === 100, "prices are rounded to whole pounds");
  ok(await bad({ type: "thing" }, "bad_type") && await bad({ parentId: "nope" }, "bad_parent") && await bad({ parentId: uc60.id }, "bad_parent"), "type must be folder or product; the parent must exist and be a folder (nothing can go inside a product)");
  let chain = pubg.id; for (let lvl = 2; lvl <= 4; lvl++) { const x = await adm({ action: "save", type: "folder", parentId: chain, name: "L" + lvl }); chain = byName(x, "L" + lvl).id; }
  r = await adm({ action: "save", type: "folder", parentId: chain, name: "L5" }); ok(r.status === 400 && r.json.error === "too_deep", "nesting is limited to 4 levels");
  r = await adm({ action: "save", type: "item", parentId: chain, name: "deep item" }); ok(r.status === 400 && r.json.error === "too_deep", "also for products");

  /* ---- D) editing ---- */
  r = await adm({ action: "save", id: uc60.id, name: "60 UC (فوري)", price: 160, enabled: false, type: "folder", parentId: "" });
  const e60 = byName(r, "60 UC (فوري)"); ok(e60 && e60.price === 160 && e60.enabled === false && e60.type === "item" && e60.parentId === fawri.id, "editing changes name, price and visibility only; type and place cannot be changed");
  r = await adm({ action: "save", id: "ghost", name: "x" }); ok(r.status === 404, "editing an unknown item is a 404");

  /* ---- E) images ---- */
  r = await adm({ action: "save", id: uc60.id, name: "60 UC", price: 150, enabled: true, image: PNG }); const withImg = byName(r, "60 UC");
  ok(withImg.hasImage && /^\/store\/img\/n[^?]+\?v=\d+$/.test(withImg.imageUrl), "an image can be added (the list gives a short image link, not the image itself)");
  const ir = await pub(withImg.imageUrl.split("?")[0]); const buf = Buffer.from(await ir.arrayBuffer());
  ok(ir.status === 200 && ir.headers.get("Content-Type") === "image/png" && /immutable/.test(ir.headers.get("Cache-Control")) && ir.headers.get("X-Content-Type-Options") === "nosniff" && buf.equals(Buffer.from(PNG.split(",")[1], "base64")), "the image link serves the real image bytes with caching, publicly");
  const ver1 = withImg.imageUrl;
  for (const [img, label] of [["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "SVG (can run scripts)"], ["data:image/png;base64,@@@", "not base64"], ["http://x/y.png", "a web link"], ["data:image/png;base64," + "A".repeat(290000), "too big"], [123, "not text"]]) {
    r = await adm({ action: "save", id: uc60.id, name: "60 UC", price: 150, image: img }); ok(r.status === 400 && r.json.error === "bad_image", "rejected image: " + label);
  }
  ok(byName(await adm({ action: "list" }), "60 UC").imageUrl === ver1, "a refused image leaves the old one untouched");
  await new Promise(res => setTimeout(res, 5));
  r = await adm({ action: "save", id: uc60.id, name: "60 UC", price: 150, image: PNG.replace("image/png", "image/webp") }); ok(byName(r, "60 UC").imageUrl !== ver1, "replacing the image changes the link (so browsers load the new one)");
  r = await adm({ action: "save", id: uc60.id, name: "60 UC 2", price: 150 }); ok(byName(r, "60 UC 2").hasImage, "editing without touching the image keeps it");
  r = await adm({ action: "save", id: uc60.id, name: "60 UC", price: 150, image: "" }); ok(!byName(r, "60 UC").hasImage && !store.has("storeImages/" + uc60.id), "an empty image removes it (and its stored data)");
  ok((await pub("/store/img/" + uc60.id)).status === 404 && (await pub("/store/img/ghost")).status === 404 && (await pub("/store/img/")).status === 404, "a removed or unknown image is a 404");
  ok(!JSON.stringify(nodesOf(await adm({ action: "list" }))).includes("base64"), "lists never carry image data");

  /* ---- F) order ---- */
  r = await adm({ action: "reorder", id: byName(await adm({ action: "list" }), "660 UC").id, dir: "up" });
  const order = (r, pid) => nodesOf(r).filter(x => x.parentId === pid).map(x => x.name);
  ok(order(r, fawri.id).slice(0, 3).join("|") === "60 UC|660 UC|325 UC", "moving a product up swaps it with the one above");
  r = await adm({ action: "reorder", id: byName(r, "60 UC").id, dir: "up" }); ok(order(r, fawri.id)[0] === "60 UC", "the top one cannot move up (nothing happens)");
  r = await adm({ action: "reorder", id: byName(r, "60 UC").id, dir: "down" }); ok(order(r, fawri.id).slice(0, 2).join("|") === "660 UC|60 UC", "moving down works");
  ok(order(r, "").join("|") === "PUBG|Free Fire", "other folders keep their order");
  ok((await adm({ action: "reorder", id: "ghost", dir: "up" })).status === 400 && (await adm({ action: "reorder", id: pubg.id, dir: "left" })).status === 400, "bad reorder requests are refused");

  /* ---- G) deleting ---- */
  r = await adm({ action: "delete", id: fawri.id }); ok(r.status === 400 && r.json.error === "has_children", "a folder with things inside cannot be deleted");
  put("storeImages/" + byName(await adm({ action: "list" }), "325 UC").id, { data: PNG, ver: 1 });
  const id325 = byName(await adm({ action: "list" }), "325 UC").id;
  r = await adm({ action: "delete", id: id325 }); ok(r.status === 200 && !nodesOf(r).some(x => x.id === id325) && !store.has("storeImages/" + id325), "a product is deleted together with its image data");
  ok((await adm({ action: "delete", id: "ghost" })).status === 404, "deleting an unknown item is a 404");

  /* ---- H) the public catalog ---- */
  for (const k of [...store.keys()]) if (k.startsWith("storeNodes/") || k.startsWith("storeImages/")) store.delete(k);
  const mk = async (parentId, type, name, price, enabled = true) => byName(await adm({ action: "save", type, parentId, name, price, enabled }), name);
  const A = await mk("", "folder", "A"), A1 = await mk(A.id, "folder", "A-instant"), I1 = await mk(A1.id, "item", "I1", 100), I2 = await mk(A1.id, "item", "I2", 200, false), I3 = await mk(A1.id, "item", "I3", 300);
  const B = await mk("", "folder", "B (all hidden inside)"), B1 = await mk(B.id, "item", "hidden item", 5, false);
  const C = await mk("", "folder", "C disabled", 0, false), C1 = await mk(C.id, "item", "under disabled folder", 7);
  const E = await mk("", "folder", "E empty");
  await adm({ action: "save", id: I1.id, name: "I1", price: 100, image: PNG });
  let cat = await pub("/store/catalog"); let cj = await cat.json();
  ok(cat.status === 200 && cj.ok && /max-age=60/.test(cat.headers.get("Cache-Control")) && cat.headers.get("Access-Control-Allow-Origin") === "*", "the public catalog works without sign-in, can be cached for a minute and is readable from the website");
  ok(cj.items.length === 1 && cj.items[0].name === "A" && cj.items[0].children[0].name === "A-instant" && cj.items[0].children[0].children.map(x => x.name).join() === "I1,I3", "only enabled products show; disabled products, folders with nothing visible, disabled folders (and what is under them) and empty folders are hidden");
  const leaf = cj.items[0].children[0].children[0];
  ok(leaf.price === 100 && /^\/store\/img\/n/.test(leaf.imageUrl) && cj.items[0].children[0].children[1].imageUrl === "" && !("enabled" in leaf) && !("sort" in leaf) && !("parentId" in leaf), "each product shows name, price and image link only (no admin fields)");
  ok((await (await pub("/store/catalog", "POST")).json()).items.length === 1, "also works as POST");
  await adm({ action: "save", id: I2.id, name: "I2", price: 200, enabled: true });
  cj = await (await pub("/store/catalog")).json(); ok(cj.items[0].children[0].children.map(x => x.name).join() === "I1,I2,I3", "turning a product on makes it appear in its place");
  ok(cj.items.every(x => x.type === "folder"), "top level items are folders here");
  /* ---- I) overall size limit ---- */
  for (const k of [...store.keys()]) if (k.startsWith("storeNodes/")) store.delete(k);
  for (let i = 0; i < 300; i++) put("storeNodes/x" + i, { parentId: "", type: "item", name: "x" + i, price: 1, enabled: true, sort: i, imageVer: 0 });
  r = await adm({ action: "save", type: "item", parentId: "", name: "one too many", price: 1 }); ok(r.status === 400 && r.json.error === "too_many", "the catalog is limited to 300 entries");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
