// اختبارات السيرفر: الكتالوج السريع (كل العناصر بمستند واحد): تفعيل، قراءة وحدة، تحديث مع كل تعديل، حد 700، وإيقاف
// التشغيل: node tools/tests/store_snap_worker.test.js
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
  let injectConflictOn = null;
  c.fsCommit = async (e, ws) => {
    if (injectConflictOn && ws.some(w => w.update && w.update.name.endsWith(injectConflictOn))) { const mark = injectConflictOn; injectConflictOn = null; if (mark.endsWith("counters/store") || mark.endsWith("counters/deposit")) { const key = mark.replace(/^.*\//, "counters/"); const cur = store.get(key); const n = cur ? Number(c.fieldsToObj(cur.fields).n) + 1 : 1001; store.set(key, { fields: c.objToFields({ n }), t: String(++tick) }); } else { const key = mark; const cur = store.get(key); if (cur) store.set(key, { ...cur, t: String(++tick) }); } throw Object.assign(new Error("ABORTED"), { conflict: true }); }
    for (const w of ws) { if (w.delete) continue; const cur = store.get(nameToPath(w.update.name)), pre = w.currentDocument;
      if (pre && pre.exists === false && cur) throw Object.assign(new Error("ALREADY_EXISTS"), { conflict: true });
      if (pre && pre.exists === true && !cur) throw new Error("NOT_FOUND");
      if (pre && pre.updateTime && (!cur || cur.t !== pre.updateTime)) throw Object.assign(new Error("FAILED_PRECONDITION"), { conflict: true }); }
    for (const w of ws) { if (w.delete) { store.delete(nameToPath(w.delete)); continue; }
      const path = nameToPath(w.update.name), cur = store.get(path);
      store.set(path, { fields: w.updateMask ? { ...(cur ? cur.fields : {}), ...w.update.fields } : w.update.fields, t: String(++tick) }); }
    return {};
  };
  c.fsRunQuery = async (e, coll, field, limit, offset, filter) => { let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) })); if (filter) rows = rows.filter(r => filter.field.split(".").reduce((o, k) => (o == null ? o : o[k]), r.data) === filter.value); return rows.slice(0, limit); };
  const ADMIN = vm.runInContext("ADMIN_UID", c);
  const TOKS = { admin: { sub: ADMIN }, u1: { sub: "u1", name: "Ali", email: "ali@x.com" }, u2: { sub: "u2", name: "Omar", email: "omar@x.com" }, u3: { sub: "u3", email: "noacct@x.com" } };
  c.verifyFirebaseToken = async (t) => TOKS[t] || null;
  const callApi = async (path, body, token) => { const r = await W.fetch(new Request("https://x" + path, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const adm = (body, token = "admin") => callApi("/admin/store", body, token);
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const NOW = Date.now(), DAY = 86400000;
  const mkC = (uid, o) => put("storeCustomers/" + uid, { name: uid, email: uid + "@x.com", spentUsd: 0, balanceUsd: 0, createdAt: 1, lastSeenAt: 1, ...o });
  const bal = (uid) => get("storeCustomers/" + uid).balanceUsd, spent = (uid) => get("storeCustomers/" + uid).spentUsd;
  const ledger = (uid) => [...store.keys()].filter(k => k.startsWith("storeLedger/")).map(k => get(k)).filter(x => x.uid === uid).sort((a, b) => a.at - b.at);
  const pushes = []; let pushFails = false; c.sendPush = async (e, uid, type, params) => { if (pushFails) throw new Error("fcm down"); pushes.push({ uid, type, params }); };
  const PUSH_TEXT = vm.runInContext("PUSH_TEXT", c);
  let seqRid = 0; const rid = () => "req-" + String(++seqRid).padStart(8, "0");
  const P10 = (a) => Array.from({ length: 10 }, (_, i) => a[Math.min(i, a.length - 1)]);
  const F = (n) => vm.runInContext(n, c), SNAP = "config/storeCatalogSnap";
  const spy = { q: [], g: [] }; const realRun = c.fsRunQuery, realGet = c.fsGetDoc; c.fsRunQuery = async (...a) => { spy.q.push(a[1]); return realRun(...a); }; c.fsGetDoc = async (...a) => { spy.g.push(a[1]); return realGet(...a); };
  c.fetch = async (url) => { const u = String(url).replace("https://api.fzr.cards/api/v2", ""); const m = /^\/topups\/offers\?category_id=(.+)$/.exec(u); if (m) return { ok: true, status: 200, json: async () => ({ ok: true, category_id: m[1], name: "C", offers: [{ offer_id: "o60", name: "60", price_usd: "0.875" }], fields: [{ key: "player_id", label: "Player ID", type: "text" }] }) }; return { ok: false, status: 404, json: async () => ({}) }; };
  env.FAZER_API_KEY = "K";
  const docs = () => [...store.keys()].filter(k => k.startsWith("storeNodes/")).map(k => ({ id: k.slice(11), ...get(k) })).sort((a, b) => a.id.localeCompare(b.id));
  const snap = () => JSON.parse(get(SNAP).json).sort((a, b) => a.id.localeCompare(b.id));
  const same = () => JSON.stringify(docs()) === JSON.stringify(snap());
  const mk = (id, parentId, type, name, sort, o) => put("storeNodes/" + id, { parentId, type, name, enabled: true, sort, imageVer: 0, createdAt: 1, updatedAt: 1, note: "", ...(type === "item" ? { prices: P10([1, 0.9]) } : {}), ...(o || {}) });
  const reset = () => { for (const k of [...store.keys()]) if (k.startsWith("storeNodes/") || k === SNAP) store.delete(k); mk("nA", "", "folder", "PUBG", 1); mk("nB", "nA", "folder", "Auto", 1); mk("i1", "nB", "item", "UC 60", 1); mk("i2", "nB", "item", "UC 300", 2); mk("iR", "", "item", "Lonely", 2); };
  let r;

  /* ---- A) off: nothing changes ---- */
  reset(); r = await adm({ action: "catalog_snap_status" }); ok(r.status === 200 && r.json.enabled === false && r.json.count === 0 && r.json.limit === 300, "at first the fast catalog is off and the limit is the old 300");
  spy.q.length = 0; r = await adm({ action: "list" }); ok(r.json.nodes.length === 5 && r.json.max.nodes === 300 && spy.q.includes("storeNodes"), "(normal mode reads the items one by one, as before)");
  ok((await adm({ action: "catalog_snap_status" }, "u1")).status === 401 && (await adm({ action: "catalog_snap_rebuild" }, null)).status === 401 && (await adm({ action: "catalog_snap_disable" }, "u1")).status === 401, "all three actions are admin-only");

  /* ---- B) switching it on ---- */
  r = await adm({ action: "catalog_snap_rebuild" }); ok(r.status === 200 && r.json.enabled === true && r.json.count === 5 && r.json.bytes > 100 && r.json.limit === 700 && same(), "switching it on builds one document with all 5 items (identical to the items), and the limit becomes 700");
  spy.q.length = 0; spy.g.length = 0; r = await adm({ action: "list" }); ok(r.json.nodes.length === 5 && r.json.max.nodes === 700 && !spy.q.includes("storeNodes") && spy.g.filter(x => x === SNAP).length === 1, "listing now makes ONE read (the fast document) and none of the items");
  spy.q.length = 0; const wr = []; let pc = await W.fetch(new Request("https://x/store/catalog"), env, { waitUntil: p => wr.push(p) }); await Promise.all(wr); const cj = await pc.json(); ok(pc.status === 200 && cj.items[0].name === "PUBG" && !spy.q.includes("storeNodes"), "the public catalog reads no items either");
  r = await adm({ action: "catalog_snap_rebuild" }); ok(r.json.count === 5 && get(SNAP).ver === 2, "switching on again just rebuilds it (version 2)");

  /* ---- C) every change keeps it identical to the items ---- */
  const check = (label) => ok(same(), "after " + label + ": the fast document and the items are identical (" + snap().length + " items)");
  r = await adm({ action: "save", type: "folder", name: "Free Fire", note: "ملاحظة" }); const ff = r.json.nodes.find(x => x.name === "Free Fire").id; check("adding a folder with a note");
  r = await adm({ action: "save", type: "item", parentId: ff, name: "110", prices: P10([0.95, 0.9]), note: "x", image: PNG }); const it = r.json.nodes.find(x => x.name === "110").id; check("adding a product with prices and a picture"); ok(snap().find(x => x.id === it).imageVer > 0 && snap().find(x => x.id === it).prices[1] === 0.9, "(its picture version and prices are in it)");
  r = await adm({ action: "save", id: it, name: "110 جوهرة", enabled: false, prices: P10([0.96, 0.91]), note: "" }); check("editing a product (name, hidden, prices, note)"); ok(snap().find(x => x.id === it).name === "110 جوهرة" && snap().find(x => x.id === it).enabled === false, "(the edit is in it)");
  r = await adm({ action: "save", id: it, name: "110 جوهرة", enabled: true, prices: P10([0.96, 0.91]), image: null }); check("removing its picture"); ok(snap().find(x => x.id === it).imageVer === 0, "(picture version back to 0)");
  r = await adm({ action: "move", id: it, parentId: "nB" }); check("moving a product"); ok(snap().find(x => x.id === it).parentId === "nB", "(its new place is in it)");
  r = await adm({ action: "reorder", id: it, dir: "up" }); check("reordering");
  r = await adm({ action: "supplier_link", id: it, link: { provider: "fazercards", categoryId: "cat_a", offerId: "o60", playerField: "player_id", categoryName: "C", validateCategoryId: "", offerName: "60", costUsd: 0.875 } }); check("linking a product to FazerCards"); ok(snap().find(x => x.id === it).supplier.offerId === "o60", "(the link is in it)");
  r = await adm({ action: "prices_apply", m1: 10, m10: 5, step: 0.01, ids: [it] }); ok(r.json.applied === 1, "(applying prices from cost)"); check("applying prices from cost"); ok(snap().find(x => x.id === it).prices.length === 10 && snap().find(x => x.id === it).supplier.costUsd === 0.875, "(its new prices and cost are in it)");
  r = await adm({ action: "delete", id: it }); check("deleting a product"); ok(!snap().some(x => x.id === it), "(it is gone from it)");
  r = await adm({ action: "delete", id: "nA" }); ok(r.status === 400 && r.json.error === "has_children" && same(), "a refused change leaves it untouched");

  /* ---- D) what customers and orders use ---- */
  mkC("v1", { balanceUsd: 5 }); TOKS.v1 = { sub: "v1", name: "v1", email: "v1@x.com" }; spy.q.length = 0; const pr = (await callApi("/store/prices", {}, "v1")).json; ok(pr.ok !== false && !spy.q.includes("storeNodes"), "customers' price list reads no items one by one");
  const first = snap().find(x => x.type === "item" && x.enabled); const ord = await callApi("/store/order", { itemId: first.id, playerId: "123456789", reqId: rid() }, "v1"); ok(ord.status === 200 && ord.json.order.itemName === first.name, "an order is placed against an item that lives only in the fast document's view of the catalog");

  /* ---- E) many items: the limit is 700 ---- */
  reset(); for (let i = 0; i < 349; i++) mk("m" + i, "nB", "item", "Item " + i, 10 + i); r = await adm({ action: "catalog_snap_rebuild" }); ok(r.json.count === 354 && same(), "354 items are fine in the fast mode");
  r = await adm({ action: "save", type: "item", parentId: "nB", name: "more", prices: P10([1]) }); ok(r.status === 200 && r.json.nodes.length === 355 && same(), "and you can add more past the old limit of 300");
  r = await adm({ action: "catalog_snap_disable" }); ok(r.status === 409 && r.json.error === "too_many" && /الوضع القديم بيتحمّل 300/.test(r.json.message) && get(SNAP).enabled === true, "switching off is refused while there are more than 300 items (the old mode would lose some)");
  for (let i = 349; i < 700; i++) mk("m" + i, "nB", "item", "Item " + i, 10 + i); r = await adm({ action: "catalog_snap_rebuild" }); ok(r.status === 200 && r.json.count === 705 || r.status === 400, "(rebuilding with more than 700 is refused)");
  reset(); for (let i = 0; i < 694; i++) mk("m" + i, "nB", "item", "Item " + i, 10 + i); await adm({ action: "catalog_snap_rebuild" }); r = await adm({ action: "save", type: "item", parentId: "nB", name: "last", prices: P10([1]) }); ok(r.status === 200 && snap().length === 700, "700 items fit exactly"); r = await adm({ action: "save", type: "item", parentId: "nB", name: "one too many", prices: P10([1]) }); ok(r.status === 400 && r.json.error === "too_many" && /700/.test(r.json.message) && snap().length === 700, "the 701st is refused with the limit in the message");
  /* a too-big document is refused */
  reset(); mk("big", "", "item", "Big", 9, { note: "ا".repeat(950000) }); r = await adm({ action: "catalog_snap_rebuild" }); ok(r.status === 400 && r.json.error === "catalog_too_big" && !store.has(SNAP), "if the whole catalog would not fit one document, switching on is refused and nothing is changed");

  /* ---- F) two edits at the same moment ---- */
  reset(); await adm({ action: "catalog_snap_rebuild" }); const [r1, r2, r3] = await Promise.all([adm({ action: "save", type: "folder", name: "P1" }), adm({ action: "save", type: "folder", name: "P2" }), adm({ action: "save", type: "folder", name: "P3" })]);
  ok([r1, r2, r3].every(x => x.status === 200) && same() && ["P1", "P2", "P3"].every(n => snap().some(x => x.name === n)), "three edits at the same moment all land (a clash is retried) and the fast document stays identical to the items");

  /* ---- G) switching off ---- */
  reset(); await adm({ action: "catalog_snap_rebuild" }); r = await adm({ action: "catalog_snap_disable" }); ok(r.status === 200 && r.json.enabled === false && r.json.limit === 300, "switching off works when there are 300 or fewer");
  spy.q.length = 0; r = await adm({ action: "list" }); ok(spy.q.includes("storeNodes") && r.json.max.nodes === 300, "…and reading goes back to the items");
  r = await adm({ action: "save", type: "folder", name: "After off" }); ok(r.status === 200 && docs().some(x => x.name === "After off") && !snap().some(x => x.name === "After off"), "edits while it is off go to the items only");
  r = await adm({ action: "catalog_snap_rebuild" }); ok(snap().some(x => x.name === "After off") && same(), "switching on again picks up everything");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e); process.exit(1); });
