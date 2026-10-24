// اختبارات السيرفر: ملاحظة اختيارية على المجلد أو المنتج (بتظهر للزبون)
// التشغيل: node tools/tests/store_note_worker.test.js
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
  const node = (id) => get("storeNodes/" + id);
  const pub = async () => (await (await W.fetch(new Request("https://x/store/catalog"), env, { waitUntil: p => p })).json()).items;
  let r, fid, iid;
  /* ---- creating with a note ---- */
  r = await adm({ action: "save", type: "folder", name: "Free Fire", note: "  لحسابات سيرفر MENA فقط.   بعد الإرسال ما بيمكن الإلغاء.  " }); fid = r.json.nodes.find(x => x.name === "Free Fire").id;
  ok(r.status === 200 && node(fid).note === "لحسابات سيرفر MENA فقط. بعد الإرسال ما بيمكن الإلغاء." && r.json.nodes.find(x => x.id === fid).note === node(fid).note, "a folder is saved with its note (spaces tidied) and the admin list carries it");
  r = await adm({ action: "save", type: "item", parentId: fid, name: "100 جوهرة", prices: P10([0.97, 0.94]) }); iid = r.json.nodes.find(x => x.name === "100 جوهرة").id; ok(node(iid).note === "" && r.json.nodes.find(x => x.id === iid).note === "", "a product created without a note has an empty one");
  r = await adm({ action: "save", type: "folder", name: "NoNote" }); ok(node(r.json.nodes.find(x => x.name === "NoNote").id).note === "", "(same for a folder)");
  /* ---- customers see it ---- */
  let cat = await pub(); const ff = cat.find(x => x.name === "Free Fire"); ok(ff.note === "لحسابات سيرفر MENA فقط. بعد الإرسال ما بيمكن الإلغاء." && ff.children[0].name === "100 جوهرة" && ff.children[0].note === "", "customers get the folder's note with the catalog (and an empty one for the product)");
  /* ---- editing ---- */
  r = await adm({ action: "save", id: fid, name: "Free Fire", enabled: true }); ok(node(fid).note.startsWith("لحسابات"), "saving without sending a note keeps the existing one");
  r = await adm({ action: "save", id: iid, name: "100 جوهرة", enabled: true, prices: P10([0.97, 0.94]), note: "البونص مرة وحدة." }); ok(node(iid).note === "البونص مرة وحدة." && (await pub()).find(x => x.name === "Free Fire").children[0].note === "البونص مرة وحدة.", "a product can have its own note");
  r = await adm({ action: "save", id: fid, name: "Free Fire", enabled: true, note: "" }); ok(node(fid).note === "" && (await pub()).find(x => x.name === "Free Fire").note === "", "an empty note removes it");
  /* ---- safety and limits ---- */
  r = await adm({ action: "save", id: fid, name: "Free Fire", enabled: true, note: "<b>مهم</b> <img src=x onerror=alert(1)> سطر\nتاني <script>alert(1)</script>" }); ok(!/[<>]/.test(node(fid).note) && !/<|>/.test(JSON.stringify((await pub()).find(x => x.name === "Free Fire").note)) && /مهم/.test(node(fid).note) && /سطر تاني/.test(node(fid).note), "tags are stripped and line breaks become spaces: the note is plain text only: " + node(fid).note);
  r = await adm({ action: "save", id: fid, name: "Free Fire", enabled: true, note: "أ".repeat(1000) }); ok(node(fid).note.length === 400, "a note is cut at 400 characters");
  r = await adm({ action: "save", id: fid, name: "Free Fire", enabled: true, note: null }); ok(node(fid).note === "", "null counts as empty");
  ok((await adm({ action: "save", id: fid, name: "x", note: "hack" }, "u1")).status === 401 && node(fid).note === "", "only the admin can set notes");
  /* ---- the note does not disturb anything else ---- */
  r = await adm({ action: "save", id: iid, name: "100 جوهرة", enabled: true, prices: P10([0.97, 0.94]), note: "ملاحظة" }); cat = await pub(); const it = cat.find(x => x.name === "Free Fire").children[0]; ok(it.priceUsd === 0.97 && !("prices" in it) && !("supplier" in it) && !("sort" in it), "customers still get no VIP prices, links or internal fields with it");
  r = await adm({ action: "move", id: iid, parentId: "" }); ok(node(iid).note === "ملاحظة", "moving a product keeps its note");
  put("storeNodes/old", { parentId: "", type: "item", name: "Old", enabled: true, sort: 9, prices: P10([1]), imageVer: 0, createdAt: 1, updatedAt: 1 }); cat = await pub(); ok(cat.find(x => x.name === "Old").note === "", "a product saved before notes existed shows an empty note");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e); process.exit(1); });
