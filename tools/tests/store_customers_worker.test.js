// اختبارات السيرفر: حسابات زباين المتجر (4أ): /store/me بيعمل الحساب أول دخول ويرجّعه
// التشغيل: node tools/tests/store_customers_worker.test.js
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
  const TOKS = { a: { sub: "ua", name: "Ali Salem", email: "ali@x.com" }, b: { sub: "ub", email: "bana@x.com" }, c: { sub: "uc" }, evil: { sub: "ue", name: "<img src=x onerror=alert(1)>" + "N".repeat(100), email: "e@x.com" }, bad: { sub: "a/b", name: "x" } };
  c.verifyFirebaseToken = async (t) => TOKS[t] || null;
  const me = async (token, method = "POST") => { const r = await W.fetch(new Request("https://x/store/me", { method, headers: token ? { Authorization: "Bearer " + token } : {}, body: method === "POST" ? "{}" : undefined }), env, { waitUntil: p => p }); return { status: r.status, json: await r.json().catch(() => null), headers: r.headers }; };
  let r;

  /* ---- sign-in is required ---- */
  r = await me(null); ok(r.status === 401 && r.json.ok === false, "without a token: 401");
  r = await me("garbage"); ok(r.status === 401, "with a token that is not valid: 401");
  r = await me("bad"); ok(r.status === 401, "a user id with a slash is refused (cannot reach other documents)");
  ok(![...store.keys()].some(k => k.startsWith("storeCustomers/")), "nothing is stored by refused requests");

  /* ---- the first sign-in creates the account ---- */
  const t0 = Date.now(); r = await me("a");
  ok(r.status === 200 && r.json.ok && r.json.created === true && r.json.customer.id === "ua" && r.json.customer.name === "Ali Salem" && r.json.customer.email === "ali@x.com" && r.json.customer.vip === 1 && r.json.customer.spentUsd === 0 && r.json.customer.progressUsd === 0 && r.json.customer.sizeUsd === 200 && r.json.customer.createdAt >= t0, "the first call creates the account: name and email from the sign-in, VIP 1, nothing spent");
  const doc = get("storeCustomers/ua"); ok(doc && doc.name === "Ali Salem" && doc.spentUsd === 0 && !("vip" in doc) && doc.createdAt === r.json.customer.createdAt && doc.lastSeenAt >= t0, "and stores it under the same id as his game account");
  ok(!("lastSeenAt" in r.json.customer) && Object.keys(r.json.customer).sort().join() === "createdAt,email,id,name,nextVip,progressUsd,remainingUsd,sizeUsd,spentUsd,vip", "the answer contains only the fields the page needs");

  /* ---- the next sign-ins ---- */
  put("storeCustomers/ua", { ...get("storeCustomers/ua"), spentUsd: 250.456, lastSeenAt: 1 });
  r = await me("a");
  ok(r.json.created === false && r.json.customer.vip === 2 && r.json.customer.spentUsd === 250.46 && r.json.customer.progressUsd === 50.46 && r.json.customer.sizeUsd === 300 && r.json.customer.nextVip === 3 && r.json.customer.createdAt === doc.createdAt && get("storeCustomers/ua").lastSeenAt > 1 && get("storeCustomers/ua").spentUsd === 250.456, "next time it only refreshes 'last seen'; the level is worked out from the spending (250 spent = VIP 2, progress 50), and spending and creation date are never reset");
  put("storeCustomers/ua", { ...get("storeCustomers/ua"), name: "Chosen Name" }); r = await me("a"); ok(r.json.customer.name === "Chosen Name", "a name already saved is not overwritten by the sign-in provider");
  put("storeCustomers/ua", { ...get("storeCustomers/ua"), name: "", email: "" }); r = await me("a"); ok(r.json.customer.name === "Ali Salem" && r.json.customer.email === "ali@x.com", "an empty name or email is filled from the sign-in");

  /* ---- names ---- */
  r = await me("b"); ok(r.json.customer.name === "bana", "no name from the provider: the part of the email before @");
  r = await me("c"); ok(r.json.customer.name === "زبون" && r.json.customer.email === "", "no name and no email: a neutral name");
  r = await me("evil"); ok(!/[<>]/.test(r.json.customer.name) && r.json.customer.name.length <= 60, "HTML is stripped from names and they are limited to 60 characters");

  /* ---- separate accounts, game data untouched ---- */
  put("players/ub", { points: 777, balanceUsd: 5 }); await me("b");
  ok(get("storeCustomers/ub").name === "bana" && get("storeCustomers/ua").name === "Ali Salem" && get("players/ub").points === 777 && get("players/ub").balanceUsd === 5, "each user has his own account, and the game record is never touched");

  /* ---- two sign-ins at the same moment ---- */
  const [x, y] = await Promise.all([me("c").then(v => v), me("c")]);
  ok(x.status === 200 && y.status === 200 && [...store.keys()].filter(k => k === "storeCustomers/uc").length === 1, "two calls at once do not fail or create two accounts");

  /* ---- web access ---- */
  r = await me(null, "OPTIONS"); ok(r.status === 204 && /Authorization/.test(r.headers.get("Access-Control-Allow-Headers")) && r.headers.get("Access-Control-Allow-Origin") === "*", "the website can call it (CORS allows the Authorization header)");
  r = await W.fetch(new Request("https://x/store/me", { method: "GET" }), env, { waitUntil: p => p }); ok(r.status !== 200, "only POST is accepted");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
