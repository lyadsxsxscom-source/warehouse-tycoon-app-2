// اختبارات السيرفر: نقل مجلد أو منتج لمجلد تاني بالكتالوج (مع حماية من الدوران والعمق الزائد)
// التشغيل: node tools/tests/store_move_worker.test.js
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
  c.fsRunQuery = async (e, coll, field, limit, offset, filter) => { let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + "/")).map(([k, v]) => ({ id: k.slice(coll.length + 1), data: c.fieldsToObj(v.fields) })); if (filter) rows = rows.filter(r => r.data[filter.field] === filter.value); return rows.slice(0, limit); };
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
  const node = (id) => get("storeNodes/" + id), F = (n) => vm.runInContext(n, c);
  const pub = async () => (await (await W.fetch(new Request("https://x/store/catalog"), env, { waitUntil: p => p })).json()).items;
  const mk = (id, parentId, type, name, sort, o) => put("storeNodes/" + id, { parentId, type, name, enabled: true, sort, imageVer: 0, createdAt: 1, updatedAt: 1, ...(type === "item" ? { prices: P10([1, 0.9]) } : {}), ...(o || {}) });
  const reset = () => { for (const k of [...store.keys()]) if (k.startsWith("storeNodes/")) store.delete(k);
    mk("nA", "", "folder", "PUBG", 1); mk("nB", "nA", "folder", "Auto", 1); mk("nC", "nA", "folder", "Manual", 2); mk("nZ", "", "folder", "Games2", 2);
    mk("i1", "nB", "item", "UC 60", 1, { supplier: { provider: "fazercards", categoryId: "c", offerId: "o", playerField: "player_id", categoryName: "", validateCategoryId: "", offerName: "", costUsd: 0.875 } }); mk("i2", "nB", "item", "UC 300", 2); mk("i3", "nC", "item", "Old", 1, { enabled: false });
    mk("iRoot", "", "item", "Lonely", 3); };
  let r; const mv = (id, parentId, tok) => adm({ action: "move", id, parentId }, tok);
  const names = (list) => list.map(x => x.name).join();

  /* ---- moving a product ---- */
  reset(); const before = JSON.stringify(node("i1")); r = await mv("i1", "nC");
  ok(r.status === 200 && node("i1").parentId === "nC" && node("i1").sort === 2 && r.json.nodes.find(x => x.id === "i1").parentId === "nC", "a product moves to another folder and goes to the END of its list (after the one already there)");
  const after = node("i1"); ok(after.name === "UC 60" && JSON.stringify(after.prices) === JSON.stringify(P10([1, 0.9])) && after.supplier.offerId === "o" && after.supplier.costUsd === 0.875 && after.enabled === true && after.createdAt === 1, "its name, prices, FazerCards link and settings are untouched");
  ok(node("i2").parentId === "nB" && node("i3").parentId === "nC" && node("i3").sort === 1 && node("nB").parentId === "nA", "nothing else moved");
  let cat = await pub(); const nc = cat[0].children.find(x => x.name === "Manual"); ok(names(nc.children) === "UC 60", "customers see it in its new place at once (disabled ones stay hidden)");
  r = await mv("i1", ""); ok(r.status === 200 && node("i1").parentId === "" && node("i1").sort === 4, "a product can move to the home level");
  ok((await pub()).map(x => x.name).join() === "PUBG,Lonely,UC 60", "…and appears there for customers (an empty folder like Games2 stays hidden, as always)");
  r = await mv("i3", "nB"); ok(r.status === 200 && node("i3").parentId === "nB" && node("i3").enabled === false, "a hidden product moves too and stays hidden");
  r = await mv("i1", ""); ok(r.status === 200 && node("i1").sort === 4, "moving to where it already is changes nothing");
  const wr = [...store.keys()].length; r = await mv("iRoot", ""); ok(r.status === 200 && [...store.keys()].length === wr, "(no writes for a move to the same place)");

  /* ---- moving a folder ---- */
  reset(); r = await mv("nB", "nZ"); ok(r.status === 200 && node("nB").parentId === "nZ" && node("i1").parentId === "nB" && node("i2").parentId === "nB", "a folder moves with everything inside it (its products still belong to it)");
  cat = await pub(); const z = cat.find(x => x.name === "Games2"); ok(z.children[0].name === "Auto" && names(z.children[0].children) === "UC 60,UC 300", "customers see the whole folder under its new parent");
  r = await mv("nB", ""); ok(node("nB").parentId === "" && node("nB").sort === 4, "a folder can move to the home level");

  /* ---- what is refused ---- */
  reset();
  for (const [id, to, re, label] of [["nA", "nA", /لجوّا نفسه/, "a folder into itself"], ["nA", "nB", /لجوّا نفسه أو لجوّا مجلد فرعي/, "a folder into its own sub-folder"]]) { r = await mv(id, to); ok(r.status === 400 && r.json.error === "bad_move" && re.test(r.json.message) && node(id).parentId === "", "refused: " + label); }
  mk("nD", "nB", "folder", "Deep", 3); r = await mv("nA", "nD"); ok(r.status === 400 && r.json.error === "bad_move" && node("nA").parentId === "", "refused: a folder into its own grand-child");
  r = await mv("i1", "i2"); ok(r.status === 400 && r.json.error === "bad_parent" && /لازم تكون مجلد/.test(r.json.message) && node("i1").parentId === "nB", "refused: a product as the destination");
  r = await mv("i1", "ghost"); ok(r.status === 404, "refused: a destination that does not exist"); r = await mv("ghost", "nC"); ok(r.status === 404, "refused: a product that does not exist");
  r = await mv("i1", "bad id!"); ok(r.status === 404 && node("i1").parentId === "nB", "refused: a malformed destination (it simply does not exist)"); r = await mv("", "nC"); ok(r.status === 404, "refused: no product given");
  ok((await mv("i1", "nC", "u1")).status === 401 && (await mv("i1", "nC", null)).status === 401 && node("i1").parentId === "nB", "only the admin can move things");
  /* depth: 4 levels at most */
  reset(); mk("d1", "", "folder", "L1", 5); mk("d2", "d1", "folder", "L2", 1); mk("d3", "d2", "folder", "L3", 1); mk("d3x", "", "folder", "Wide", 6); mk("d3y", "d3x", "folder", "Sub", 1); mk("d3z", "d3y", "item", "Leaf", 1);
  r = await mv("d3x", "d3"); ok(r.status === 400 && r.json.error === "too_deep" && /أقصى عمق 4 مستويات/.test(r.json.message) && node("d3x").parentId === "", "a folder that would end up 5 levels deep is refused (3 levels above + itself + a sub-folder + a product)");
  r = await mv("d3y", "d3"); ok(r.status === 400 && r.json.error === "too_deep", "a folder with a product inside, put under level 3, would be 5 levels: refused"); r = await mv("d3y", "d2"); ok(r.status === 200 && node("d3y").parentId === "d2", "put under level 2 it is exactly 4 levels, which is fine");
  r = await mv("iRoot", "d3"); ok(r.status === 200, "a product at level 4 is fine"); mk("d4", "d3", "folder", "L4", 3); r = await mv("iRoot", "d4"); ok(r.status === 400 && r.json.error === "too_deep", "…but not at level 5");

  /* ---- ordering afterwards ---- */
  reset(); await mv("i1", "nC"); r = await adm({ action: "reorder", id: "i1", dir: "up" }); ok(r.status === 200 && node("i1").sort === 1 && node("i3").sort === 2, "after a move, the up/down arrows work in the new place");
  /* orders are not affected */
  put("storeOrders/o9", { kind: "order", code: "T-9", uid: "u1", itemId: "i2", itemName: "UC 300", itemPath: "PUBG › Auto", priceUsd: 2, status: "done", createdAt: 1 }); await mv("i2", "nZ"); ok(get("storeOrders/o9").itemPath === "PUBG › Auto" && get("storeOrders/o9").itemId === "i2", "old orders keep the path they were bought under");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e); process.exit(1); });
