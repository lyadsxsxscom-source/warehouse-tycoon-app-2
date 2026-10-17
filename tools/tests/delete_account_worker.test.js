// اختبارات السيرفر: حذف الحساب (بيحذف بيانات اللاعب، بيحتفظ بسجلات مالية مجهولة، وما بيمسّ لاعبين تانيين)
// التشغيل: node tools/tests/delete_account_worker.test.js
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
  const seed = () => {
    store.clear();
    put("players/u1", { points: 900, balanceUsd: 2, referralCode: "ABC123", activeDays: 5 }); put("players/u2", { points: 50, referralCode: "XYZ789" });
    put("pushTokens/u1", { token: "t1" }); put("pushTokens/u2", { token: "t2" });
    put("inbox/u1", { items: [{ id: "m", title: "x" }] }); put("inbox/u2", { items: [{ id: "m", title: "y" }] });
    put("referralCodes/ABC123", { uid: "u1" }); put("referralCodes/XYZ789", { uid: "u2" });
    put("withdrawRequests/w1", { uid: "u1", displayName: "Ahmad", email: "a@x.com", status: "done", amountUsd: 5, walletAddress: "0xabc", coin: "usdt" });
    put("withdrawRequests/w2", { uid: "u1", displayName: "Ahmad", email: "a@x.com", status: "rejected", amountUsd: 7, walletAddress: "0xdef" });
    put("withdrawRequests/w3", { uid: "u2", displayName: "Sara", email: "b@x.com", status: "done", amountUsd: 9, walletAddress: "0x999" });
    put("shopOrders/s1", { uid: "u1", displayName: "Ahmad", email: "a@x.com", status: "done", itemName: "PUBG", pricePoints: 700, fields: [{ key: "pid", label: "ID", value: "5123456789" }] });
    put("shopOrders/s2", { uid: "u2", displayName: "Sara", email: "b@x.com", status: "pending", itemName: "PUBG", pricePoints: 700, fields: [{ key: "pid", label: "ID", value: "777" }] });
    put("purchaseRequests/p1", { uid: "u1", displayName: "Ahmad", email: "a@x.com", status: "done", points: 1000, usd: 1.5, method: "shamcash", proofImage: "data:image/png;base64,AAAA", note: "تحويل من 0933" });
    put("purchaseRequests/p2", { uid: "u2", displayName: "Sara", email: "b@x.com", status: "done", points: 500, usd: 1, method: "shamcash", proofImage: "data:image/png;base64,BBBB", note: "" });
    put("mail/m1", { uid: "u1", code: "C1", points: 100 }); put("mail/m2", { uid: "u1", code: "C2", points: 200 }); put("mail/m3", { uid: "u2", code: "C3", points: 300 });
    fetchCalls.length = 0; authOk = true;
  };

  seed();
  ok((await call("", { confirm: true })).status === 401, "deleting an account needs a signed-in player");
  let r = await call("u1", {});
  ok(r.status === 400 && r.json.error === "confirm_required" && !!get("players/u1"), "without explicit confirmation nothing is deleted");
  r = await call("u1", { confirm: "yes" }); ok(r.status === 400 && !!get("players/u1"), "only confirm: true counts");

  // pending requests block the deletion
  put("withdrawRequests/w9", { uid: "u1", status: "pending", amountUsd: 5, email: "a@x.com" });
  r = await call("u1", { confirm: true });
  ok(r.status === 409 && r.json.error === "pending_requests" && !!get("players/u1") && get("withdrawRequests/w1").email === "a@x.com" && fetchCalls.length === 0, "a pending withdrawal blocks the deletion: nothing is touched");
  store.delete("withdrawRequests/w9");
  put("shopOrders/s9", { uid: "u1", status: "pending", itemName: "x", pricePoints: 1, fields: [] });
  r = await call("u1", { confirm: true }); ok(r.status === 409 && !!get("players/u1"), "a pending store order blocks the deletion");
  store.delete("shopOrders/s9");
  put("purchaseRequests/p9", { uid: "u1", status: "pending", points: 1, email: "a@x.com" });
  r = await call("u1", { confirm: true }); ok(r.status === 409 && !!get("players/u1"), "a pending points purchase blocks the deletion");
  store.delete("purchaseRequests/p9");

  // the real deletion
  r = await call("u1", { confirm: true });
  ok(r.status === 200 && r.json.ok && r.json.deleted === true && r.json.authDeleted === true, "a confirmed deletion succeeds");
  ok(!get("players/u1") && !get("pushTokens/u1") && !get("inbox/u1"), "the player's data, device and in-game mail are deleted");
  ok(!get("referralCodes/ABC123") && !get("mail/m1") && !get("mail/m2"), "his invite code and shipments are deleted");
  const w1 = get("withdrawRequests/w1"), w2 = get("withdrawRequests/w2");
  ok(w1 && w1.email === "" && w1.displayName === "" && w1.accountDeleted === true && w1.amountUsd === 5 && w1.walletAddress === "0xabc" && w1.status === "done" && w2.email === "", "withdrawal records stay for accounting but without name and email");
  const s1 = get("shopOrders/s1");
  ok(s1 && s1.email === "" && s1.displayName === "" && s1.fields.length === 0 && s1.pricePoints === 700 && s1.itemName === "PUBG", "store orders stay without the player's name, email and the details he typed");
  const p1 = get("purchaseRequests/p1");
  ok(p1 && p1.email === "" && p1.proofImage === "" && p1.note === "" && p1.points === 1000 && p1.usd === 1.5 && p1.accountDeleted === true, "purchase records stay without the payment receipt image, note, name and email");
  const call1 = fetchCalls.find(f => /accounts:delete/.test(f.url));
  ok(call1 && /projects\/proj\/accounts:delete/.test(call1.url) && call1.body.localId === "u1" && call1.auth === "Bearer tok:auth", "the login account itself is deleted through the identity API with its own permission scope");

  // other players are untouched
  ok(!!get("players/u2") && get("players/u2").points === 50 && !!get("pushTokens/u2") && !!get("inbox/u2") && !!get("referralCodes/XYZ789") && !!get("mail/m3"), "other players' data is untouched");
  ok(get("withdrawRequests/w3").email === "b@x.com" && get("shopOrders/s2").fields.length === 1 && get("purchaseRequests/p2").proofImage === "data:image/png;base64,BBBB", "other players' records keep their details");
  ok(fetchCalls.filter(f => /accounts:delete/.test(f.url)).length === 1 && fetchCalls.every(f => f.body.localId === "u1"), "only the requesting player's login account was targeted");

  // identity API failure: data is still deleted, the answer says the login account remains
  seed(); authOk = false;
  r = await call("u1", { confirm: true });
  ok(r.status === 200 && r.json.ok && r.json.authDeleted === false && !get("players/u1"), "if the login account cannot be deleted the data is still deleted and the reply says so");
  // idempotent
  seed(); await call("u1", { confirm: true }); r = await call("u1", { confirm: true });
  ok(r.status === 200 && r.json.ok, "deleting again is harmless");
  // the token for normal work is unchanged
  ok(await c.getGoogleAccessToken(env) === "tok:default", "the normal database/push token keeps its own scope");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
