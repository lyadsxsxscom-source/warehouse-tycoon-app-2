// اختبارات السيرفر: علامة "هالمحفظة مستخدمة بحساب تاني" (فهرس البصمات، التطبيع، إعادة الفهرسة، الحذف)
// التشغيل: node tools/tests/wallet_flag_worker.test.js
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
  c.fsCommit = async (e, ws) => { for (const w of ws) {
    if (w.delete) { store.delete(nameToPath(w.delete)); continue; }
    const path = nameToPath(w.update.name), cur = store.get(path), pre = w.currentDocument;
    if (pre && pre.exists === false && cur) throw Object.assign(new Error("ALREADY_EXISTS"), { conflict: true });
    if (w.updateTransforms) {
      if (path.startsWith("analytics/")) continue;
      const fields = { ...(cur ? cur.fields : {}), ...w.update.fields };
      for (const t of w.updateTransforms) if (t.appendMissingElements) { const have = ((fields[t.fieldPath] || {}).arrayValue || {}).values || []; const add = t.appendMissingElements.values.filter(v => !have.some(h => h.stringValue === v.stringValue)); fields[t.fieldPath] = { arrayValue: { values: [...have, ...add] } }; }
      store.set(path, { fields, t: String(++tick) }); continue;
    }
    store.set(path, { fields: w.updateMask ? { ...(cur ? cur.fields : {}), ...w.update.fields } : w.update.fields, t: String(++tick) });
  } return {}; };
  c.loadConfig = async () => ({ game: { workers: {} }, pricing: { minWithdrawUsd: 5 }, shop: {} });
  const ADMIN = vm.runInContext("ADMIN_UID", c);
  const TOKS = { admin: { sub: ADMIN } }; for (let n = 1; n <= 14; n++) TOKS["u" + n] = { sub: "u" + n, name: "User" + n, email: "u" + n + "@x.com" };
  c.verifyFirebaseToken = async (t) => TOKS[t] || null;
  const sha = (x) => require("crypto").createHash("sha256").update(x).digest("hex");
  const NOW = Date.now();
  const mkPlayer = (n) => put("players/u" + n, { shelves: c.defaultShelves(), points: 100, totalPointsEarned: 3000, balanceUsd: 50, activeDays: 8, adsWatched: 40, firstSeenAt: NOW, lastWithdrawAt: 0 });
  for (let n = 1; n <= 14; n++) mkPlayer(n);
  const call2 = (token, body, path) => W.fetch(new Request("https://x" + path, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => p }).then(async r => ({ status: r.status, json: await r.json() }));
  const call3 = call2;
  const reqsOf = (uid) => [...store.keys()].filter(k => k.startsWith("withdrawRequests/")).map(k => ({ id: k.split("/")[1], ...get(k) })).filter(r => r.uid === uid);
  const idxOf = (addr) => get("walletIndex/" + sha("wallet|" + addr).slice(0, 40));
  const A = "TXyzAbc123456789012345678901234567";
  let r;
  const doWd = async (n, address, coin, network) => { put("players/u" + n, { ...get("players/u" + n), lastWithdrawAt: 0, balanceUsd: 50 }); return call3("u" + n, { coin: coin || "usdt", network: network || "TRC20", address, amount: 6 }, "/game/withdraw"); };

  /* ---- A) first use ---- */
  r = await doWd(1, A);
  ok(r.status === 200, "a normal withdrawal request is accepted");
  let q1 = reqsOf("u1")[0];
  ok(q1 && q1.walletAddress === A && !q1.walletShared && !(q1.walletOtherUids && q1.walletOtherUids.length), "the first account to use a wallet gets no flag");
  const idx1 = idxOf(A);
  ok(idx1 && idx1.uids.length === 1 && idx1.uids[0] === "u1", "the wallet fingerprint index records that account");
  ok(![...store.keys()].some(k => k.includes(A)) && [...store.keys()].filter(k => k.startsWith("walletIndex/")).every(k => /^walletIndex\/[0-9a-f]{40}$/.test(k)), "the index stores a hash fingerprint, never the wallet address itself");

  /* ---- B) a second account on the same wallet ---- */
  r = await doWd(2, A);
  const q2 = reqsOf("u2")[0];
  ok(r.status === 200 && q2.walletShared === true && JSON.stringify(q2.walletOtherUids) === '["u1"]', "a second account using the same wallet is flagged, with the other account's id");
  ok(idxOf(A).uids.length === 2, "the index now lists both accounts");
  ok(!reqsOf("u1")[0].walletShared, "the first request is not flagged retroactively (the admin's re-index does that)");
  r = await doWd(3, A);
  ok(JSON.stringify(reqsOf("u3")[0].walletOtherUids.sort()) === '["u1","u2"]', "a third account sees both earlier accounts");

  /* ---- C) what counts as the same wallet ---- */
  const HEX = "0xabcdef0123456789abcdef0123456789abcdef01";
  await doWd(4, HEX, "usdt", "BEP20"); r = await doWd(5, "  0xAbCdEf0123456789aBcDeF0123456789AbCdEf01 \n", "usdt", "BEP20");
  ok(reqsOf("u5")[0].walletShared === true && reqsOf("u5")[0].walletOtherUids[0] === "u4", "an 0x address is the same wallet whatever the letter case and spaces");
  await doWd(6, "TXyzAbc" + "1".repeat(27)); r = await doWd(7, "txyzabc" + "1".repeat(27));
  ok(!reqsOf("u7")[0].walletShared, "TRON/BTC style addresses are case-sensitive, so a different case is a different wallet");
  await doWd(8, "0933123456", "shamcash", "SHAMCASH"); await doWd(9, "0933123456", "shamcash", "SHAMCASH");
  ok(reqsOf("u9")[0].walletShared === true, "a shared Sham Cash account number is flagged too");
  await doWd(10, "TOwnReuse1234567890123456789012345"); put("players/u10", { ...get("players/u10"), lastWithdrawAt: 0 }); await doWd(10, "TOwnReuse1234567890123456789012345");
  ok(reqsOf("u10").length === 2 && reqsOf("u10").every(x => !x.walletShared), "an account re-using its OWN wallet is never flagged");
  for (let n = 1; n <= 14; n++) mkPlayer(n);
  const B = "TManyAccounts12345678901234567890123"; for (let n = 1; n <= 8; n++) await doWd(n, B);
  const last8 = reqsOf("u8").find(x => x.walletAddress === B);
  ok(last8.walletOtherUids.length === 5 && last8.walletShared === true, "the list of other accounts is capped at 5");

  /* ---- D) admin re-index of old requests ---- */
  for (const k of [...store.keys()]) if (k.startsWith("withdrawRequests/") || k.startsWith("walletIndex/")) store.delete(k);
  const X = "TLegacyShared1234567890123456789012", Y = "TLegacySingle1234567890123456789012";
  put("withdrawRequests/l1", { uid: "ua", walletAddress: X, status: "fulfilled", createdAt: 1 }); put("withdrawRequests/l2", { uid: "ub", walletAddress: " " + X, status: "pending", createdAt: 2 });
  put("withdrawRequests/l3", { uid: "uc", walletAddress: Y, status: "fulfilled", createdAt: 3 }); put("withdrawRequests/l4", { uid: "ud", walletAddress: X, status: "fulfilled", createdAt: 4, accountDeleted: true });
  put("withdrawRequests/l5", { uid: "ue", walletAddress: "TStale12345678901234567890123456789", status: "fulfilled", createdAt: 5, walletShared: true, walletOtherUids: ["gone"] });
  ok((await call2("u1", {}, "/admin/wallet-reindex")).status === 401, "only the admin can re-index");
  r = await call2("admin", {}, "/admin/wallet-reindex");
  ok(r.status === 200 && r.json.requests === 4 && r.json.wallets === 3 && r.json.sharedWallets === 1 && r.json.flaggedRequests === 2 && r.json.capped === false, "re-index reads the old requests: 4 live ones, 3 wallets, 1 shared wallet, 2 flagged requests (deleted accounts are ignored): " + JSON.stringify(r.json));
  ok(get("withdrawRequests/l1").walletShared === true && get("withdrawRequests/l1").walletOtherUids[0] === "ub" && get("withdrawRequests/l2").walletOtherUids[0] === "ua" && get("withdrawRequests/l3").walletShared === false, "old requests are flagged with the other account, a wallet used once is not");
  ok(get("withdrawRequests/l5").walletShared === false && get("withdrawRequests/l5").walletOtherUids.length === 0, "a stale flag (the other account is gone) is cleared");
  ok(get("withdrawRequests/l4").walletShared === undefined, "requests of deleted accounts are left alone");
  ok(idxOf(X).uids.sort().join() === "ua,ub", "the index is rebuilt (without the deleted account)");
  const again = await call2("admin", {}, "/admin/wallet-reindex"); ok(again.json.flaggedRequests === 2 && again.json.wallets === 3, "running it again gives the same result");

  /* ---- E) deleting an account cleans the index ---- */
  for (const k of [...store.keys()]) if (k.startsWith("withdrawRequests/") || k.startsWith("walletIndex/") || k.startsWith("players/u")) store.delete(k);
  for (let n = 1; n <= 4; n++) mkPlayer(n);
  await doWd(1, A); await doWd(2, A); await doWd(4, "TOnlyMine12345678901234567890123456");
  for (const q of [...reqsOf("u1"), ...reqsOf("u4")]) put("withdrawRequests/" + q.id, { ...q, status: "fulfilled" });
  c.fetch = async (url, o) => { fetchCalls.push({ url: String(url) }); return { ok: true, status: 200, text: async () => "", json: async () => ({}) }; };
  r = await call2("u1", { confirm: true }, "/game/deleteAccount");
  ok(r.status === 200 && r.json.ok, "the account with a flagged wallet can be deleted");
  ok(idxOf(A).uids.join() === "u2" && !reqsOf("u1")[0].walletOtherUids.length && reqsOf("u1")[0].email === "" , "it is removed from the wallet index and its own request keeps no reference to other accounts");
  r = await call2("u4", { confirm: true }, "/game/deleteAccount");
  ok(r.status === 200 && !idxOf("TOnlyMine12345678901234567890123456"), "a wallet that only the deleted account used disappears from the index completely");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
