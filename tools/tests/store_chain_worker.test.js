// اختبارات السيرفر: تأكيد إيداع USDT تلقائياً من البلوكتشين (BEP20 + TRC20): مبلغ مميّز، التحقق، الحماية من سرقة رقم العملية، السقف، والمتابعة
// التشغيل: node tools/tests/store_chain_worker.test.js
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
  const nodeCrypto = require("crypto");
  const BSC_USDT = "0x55d398326f99059ff775485246999027b3197955", TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", BEP = "0x" + "ab".repeat(20), OTHER = "0x" + "cd".repeat(20);
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const makeTron = (hex20) => { const payload = Buffer.from("41" + hex20, "hex"), sum = nodeCrypto.createHash("sha256").update(nodeCrypto.createHash("sha256").update(payload).digest()).digest().slice(0, 4), full = Buffer.concat([payload, sum]); let n = BigInt("0x" + full.toString("hex")), out = ""; while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; } return out; };
  const TRON_ME_HEX = "11".repeat(20), TRON_ME = makeTron(TRON_ME_HEX), TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", TRON_USDT_HEX = "a614f803b6fd780986a42c78ec9c7f77e6ded13c";
  const chain = { down: new Set(), receipts: {}, latest: 110, blocks: {}, tron: {}, tronDown: false, calls: [] };
  const jres = (o, st) => ({ ok: (st || 200) < 400, status: st || 200, json: async () => o });
  c.fetch = async (url, opts) => {
    const u = String(url), body = opts && opts.body ? JSON.parse(opts.body) : null; chain.calls.push({ u, method: body && body.method, body, headers: (opts && opts.headers) || {} });
    if (u.startsWith("https://bsc-dataseed")) { if (chain.down.has(u) || chain.down.has("*")) throw new Error("down"); const m = body.method, p = body.params; let result = null;
      if (m === "eth_getTransactionReceipt") result = chain.receipts[p[0]] || null; else if (m === "eth_blockNumber") result = "0x" + chain.latest.toString(16); else if (m === "eth_getBlockByNumber") result = chain.blocks[p[0]] || { timestamp: "0x" + Math.floor(Date.now() / 1000).toString(16) };
      return jres({ jsonrpc: "2.0", id: 1, result }); }
    if (u.endsWith("/walletsolidity/gettransactioninfobyid")) { if (chain.tronDown) return jres({}, 500); return jres(chain.tron[body.value] || {}); }
    return jres({ ok: false }, 404);
  };
  const reset = () => { chain.down = new Set(); chain.receipts = {}; chain.latest = 110; chain.blocks = {}; chain.tron = {}; chain.tronDown = false; chain.calls.length = 0; vm.runInContext("CHAIN_FAST_MS = []", c); };
  const pad = (a) => "0x" + "0".repeat(24) + a.replace(/^0x/, "").toLowerCase();
  const u18 = (x) => "0x" + (BigInt(Math.round(x * 1e6)) * 10n ** 12n).toString(16).padStart(64, "0");
  const txh = (n) => "0x" + String(n).padStart(64, "0");
  const bscTx = (hash, to, amount, o) => { chain.receipts[hash] = { status: "0x1", blockNumber: "0x64", logs: [{ address: BSC_USDT, topics: ["0x" + TOPIC, pad("0x" + "ee".repeat(20)), pad(to)], data: u18(amount) }], ...(o || {}) }; };
  const tronTx = (id, amount, o) => { chain.tron[id] = { id, blockNumber: 70000000, blockTimeStamp: Date.now(), receipt: { result: "SUCCESS" }, log: [{ address: TRON_USDT_HEX, topics: [TOPIC, "0".repeat(24) + "22".repeat(20), "0".repeat(24) + TRON_ME_HEX], data: (BigInt(Math.round(amount * 1e6))).toString(16).padStart(64, "0") }], ...(o || {}) }; };
  const F = (n) => vm.runInContext(n, c), tid = (n) => String(n).padStart(64, "0");
  const waits = []; const callC = async (path, body, token) => { const r = await W.fetch(new Request("https://x" + path, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: JSON.stringify(body || {}) }), env, { waitUntil: p => waits.push(p) }); const out = { status: r.status, json: await r.json().catch(() => null) }; await Promise.all(waits.splice(0)); return out; };
  put("config/storeWallet", { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, updatedAt: 1 });
  put("config/storePayments", { methods: [
    { id: "usdtb", name: "USDT BEP20", currency: "USDT", rate: 1, decimals: 2, feePct: 0, enabled: true, instructions: "", account: BEP, autoVerify: "bep20" },
    { id: "usdtt", name: "USDT TRC20", currency: "USDT", rate: 1, decimals: 2, feePct: 0, enabled: true, instructions: "", account: TRON_ME, autoVerify: "trc20" },
    { id: "sham", name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0, enabled: true, instructions: "", account: "0932", autoVerify: "" }], updatedAt: 1 });
  for (const u of ["u1", "u2", "u4", "u5", "u6", "u7", "u8"]) { mkC(u, { balanceUsd: 0 }); TOKS[u] = TOKS[u] || { sub: u, name: u, email: u + "@x.com" }; }
  const dep = async (uid, amt, mid) => { const r = await callC("/store/topup", { amountUsd: amt, methodId: mid, reqId: rid() }, uid); return r; };
  const proof = (uid, id, ref) => callC("/store/order/proof", { orderId: id, ref }, uid);
  const ord = (id) => get("storeOrders/" + id), claim = (net, tx) => store.has("storeChainTx/" + net + "_" + tx);
  let r, id, p0;

  /* ---- A) the address helper (checks the last characters) ---- */
  const t2h = F("tronAddrToHex20");
  ok(await t2h(TRON_USDT) === TRON_USDT_HEX, "the TRON address of USDT converts to the known contract bytes (a614f8...ded13c)");
  ok(await t2h(TRON_ME) === TRON_ME_HEX, "a generated valid address converts back to its 20 bytes");
  ok(await t2h(TRON_ME.slice(0, -1) + (TRON_ME.slice(-1) === "A" ? "B" : "A")) === null && await t2h("0x" + "ab".repeat(20)) === null && await t2h("") === null && await t2h("T" + "1".repeat(33)) === null && await t2h(TRON_ME + "x") === null, "a mistyped last character, an Ethereum-style address, an empty value or a wrong length are all refused");

  /* ---- B) saving a payment method with automatic verification ---- */
  const base = [{ name: "USDT BEP20", currency: "USDT", rate: 1, decimals: 2, feePct: 0, enabled: true, instructions: "", account: BEP, autoVerify: "bep20" }];
  r = await adm({ action: "payments_save", methods: base }); ok(r.status === 200 && r.json.methods[0].autoVerify === "bep20" && r.json.methods[0].account === BEP, "a BEP20 method with a valid address is saved with its verification mode");
  for (const [patch, re, label] of [[{ currency: "USD" }, /لعملة USDT بس/, "not USDT"], [{ rate: 142.5 }, /سعر الصرف لازم يكون 1/, "rate not 1"], [{ account: "0x1234" }, /عنوان BEP20 لازم يبدأ بـ0x ويكون 42 خانة/, "short address"], [{ account: "TXYZ" }, /عنوان BEP20/, "a TRON address on BEP20"]]) { r = await adm({ action: "payments_save", methods: [{ ...base[0], ...patch }] }); ok(r.status === 400 && re.test(r.json.message), "refused: " + label); }
  r = await adm({ action: "payments_save", methods: [{ ...base[0], autoVerify: "trc20", account: TRON_ME }] }); ok(r.status === 200 && r.json.methods[0].autoVerify === "trc20", "a TRC20 method with a valid address is saved");
  r = await adm({ action: "payments_save", methods: [{ ...base[0], autoVerify: "trc20", account: TRON_ME.slice(0, -1) + (TRON_ME.slice(-1) === "A" ? "B" : "A") }] }); ok(r.status === 400 && /فشل فحص الخانات الأخيرة/.test(r.json.message), "a TRC20 address with a wrong last character is refused (so a typo can never send money to a dead address)");
  r = await adm({ action: "payments_save", methods: [{ ...base[0], autoVerify: "solana" }] }); ok(r.json.methods[0].autoVerify === "", "an unknown mode becomes 'no verification'");
  put("config/storePayments", { methods: [
    { id: "usdtb", name: "USDT BEP20", currency: "USDT", rate: 1, decimals: 2, feePct: 0, enabled: true, instructions: "", account: BEP, autoVerify: "bep20" }, { id: "usdtt", name: "USDT TRC20", currency: "USDT", rate: 1, decimals: 2, feePct: 0, enabled: true, instructions: "", account: TRON_ME, autoVerify: "trc20" }, { id: "sham", name: "شام كاش", currency: "ل.س", rate: 142.5, decimals: 0, feePct: 0, enabled: true, instructions: "", account: "0932", autoVerify: "" }], updatedAt: 1 });
  const cat = await (await W.fetch(new Request("https://x/store/catalog"), env, { waitUntil: p => p })).json(); ok(cat.methods.find(m => m.id === "usdtb").auto === true && cat.methods.find(m => m.id === "sham").auto === false && !JSON.stringify(cat.methods).includes(BEP), "the public catalog says which methods are automatic and never shows the address");
  /* the wallet cap */
  r = await adm({ action: "wallet_get" }); ok(r.json.cfg.autoCapUsd === 200, "the automatic-confirmation cap defaults to $200 (your decision)");
  for (const v of [0, -5, 1e6, "x"]) { r = await adm({ action: "wallet_save", cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: v } }); ok(r.status === 400, "refused cap: " + v); }
  r = await adm({ action: "wallet_save", cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: 150.555 } }); ok(r.json.cfg.autoCapUsd === 150.56, "a valid cap is saved (rounded to cents)"); await adm({ action: "wallet_save", cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: 200 } });

  /* ---- C) a unique small amount per open request ---- */
  reset(); const dd = [await dep("u1", 10, "usdtb"), await dep("u2", 10, "usdtb"), await dep("u4", 10, "usdtb")]; const amts = dd.map(x => x.json.order.amount);
  ok(dd.every(x => x.status === 200 && x.json.order.method.autoVerify === "bep20" && x.json.order.method.decimals === 4 && x.json.order.priceUsd === 10) && amts.every(a => a > 10 && a <= 10.0099 && Math.round(a * 10000) / 10000 === a) && new Set(amts).size === 3, "three $10 deposits get three DIFFERENT amounts between 10.0001 and 10.0099 (4 decimals): " + amts.join(", "));
  ok(ord(dd[0].json.order.id).autoVerify === "bep20" && ord(dd[0].json.order.id).amount === amts[0] && ord(dd[0].json.order.id).decimals === 4 && ord(dd[0].json.order.id).priceUsd === 10, "the order remembers its mode and the exact amount; it will credit $10 (the tail is not credited)");
  const manual0 = await dep("u5", 10, "sham"); ok(manual0.json.order.amount === 1425 && manual0.json.order.method.autoVerify === "", "a normal method has no tail and no automatic mode");
  const q = await callC("/store/topup/quote", { amountUsd: 10 }, "u5"); ok(q.json.quote.methods.find(m => m.id === "usdtb").amount === 10, "the quote (before creating) shows the plain amount");
  r = await callC("/store/order/cancel", { orderId: dd[0].json.order.id }, "u1"); ok(r.status === 200, "(one is cancelled)"); const again = await dep("u6", 10, "usdtb"); ok(again.status === 200 && !amts.slice(1).includes(again.json.order.amount), "a cancelled request frees its amount, and a new one never takes an amount that is still open");
  put("storeOrders/full1", { kind: "topup", status: "awaiting_payment", methodId: "usdtb", amount: 20.0001, createdAt: NOW }); for (let t = 1; t <= 99; t++) put("storeOrders/f" + t, { kind: "topup", status: t % 2 ? "awaiting_payment" : "payment_submitted", methodId: "usdtb", amount: Math.round((50 + t / 10000) * 10000) / 10000, createdAt: Date.now() });
  let busy = null; try { await F("storeChainTail")(env, { id: "usdtb" }, 50, Date.now()); } catch (e) { busy = e; } ok(busy && busy.code === "busy" && busy.status === 429, "if all 99 small amounts for one value are taken, it says 'busy, try later' instead of reusing one");
  for (let t = 1; t <= 99; t++) store.delete("storeOrders/f" + t); store.delete("storeOrders/full1");

  /* ---- D) BEP20: a good payment is confirmed by itself ---- */
  reset(); put("storeOrders/" + dd[1].json.order.id, { ...ord(dd[1].json.order.id), createdAt: Date.now() - 60000 }); id = dd[1].json.order.id; const A2 = amts[1]; bscTx(txh(1), BEP, A2); const bal0 = bal("u2"), pc = pushes.length;
  r = await proof("u2", id, txh(1).toUpperCase().replace("0X", "0x")); let o = ord(id);
  ok(r.status === 200 && o.status === "done" && o.chain.state === "ok" && o.chain.txid === txh(1) && o.chain.amount === A2 && o.chain.confirmations === 11 && bal("u2") === Math.round((bal0 + 10) * 10000) / 10000, "a correct BEP20 payment (right token, address, amount, 11 confirmations) is credited by itself: $10 added; the transaction number is normalised (case)");
  ok(ledger("u2").some(x => x.type === "topup" && x.by === "auto" && x.amountUsd === 10 && x.ref === o.code) && claim("bep20", txh(1)) && spent("u2") === 0 && pushes.slice(pc).some(x => x.uid === "u2" && x.type === "store_topup_done"), "the ledger says 'by auto', the transaction is claimed, no VIP spending is counted (a deposit is not spending) and the customer is told");
  ok(o.events.some(e => e.action === "done" && e.by === "auto" && /BEP20/.test(e.note)), "the history shows it was confirmed automatically");
  ok(chain.calls.every(x => !x.headers.Authorization && !x.headers["X-API-Key"]), "nothing secret was sent to the blockchain service (public data only)");
  const cust = (await callC("/store/orders", {}, "u2")).json.orders.find(x => x.id === id); ok(cust.chain && cust.chain.state === "ok" && !("txid" in cust.chain) && !("reason" in cust.chain) && !("chainInfo" in cust), "the customer sees only the state, never the details");

  /* ---- E) BEP20: what is NOT confirmed ---- */
  const closeOpen = (uid) => { for (const k of [...store.keys()]) if (k.startsWith("storeOrders/")) { const o = get(k); if (o.kind === "topup" && o.uid === uid && (o.status === "awaiting_payment" || o.status === "payment_submitted")) put(k, { ...o, status: "cancelled" }); } };
  const newDep = async (uid, amt, mid) => { closeOpen(uid); const x = await dep(uid, amt || 10, mid || "usdtb"); const oid = x.json.order.id; put("storeOrders/" + oid, { ...ord(oid), createdAt: Date.now() - 60000 }); return { id: oid, amount: x.json.order.amount }; };
  const expectManual = async (label, setup, re) => { reset(); const d = await newDep("u4"); setup(d); const b = bal("u4"); r = await proof("u4", d.id, txh(d.id.length * 7 + label.length)); const x = ord(d.id); ok(x.status === "payment_submitted" && x.chain && x.chain.state === "manual" && re.test(x.chain.reason) && bal("u4") === b, label); store.delete("storeOrders/" + d.id); return x; };
  const hh = (d, label) => txh(d.id.length * 7 + label.length);
  await expectManual("less than asked: held for you with both numbers", d => bscTx(hh(d, "less than asked: held for you with both numbers"), BEP, d.amount - 0.5), /المبلغ المحوّل .* يختلف عن المطلوب/);
  await expectManual("more than asked: held (never silently keeps the extra)", d => bscTx(hh(d, "more than asked: held (never silently keeps the extra)"), BEP, d.amount + 1), /يختلف عن المطلوب/);
  await expectManual("sent to another address: nothing for you", d => bscTx(hh(d, "sent to another address: nothing for you"), OTHER, d.amount), /ما في تحويل USDT \(BEP20\) لعنوانك/);
  await expectManual("a failed transaction", d => bscTx(hh(d, "a failed transaction"), BEP, d.amount, { status: "0x0" }), /العملية فشلت على الشبكة/);
  await expectManual("a FAKE token with the same Transfer event", d => { const k = hh(d, "a FAKE token with the same Transfer event"); bscTx(k, BEP, d.amount); chain.receipts[k].logs[0].address = "0x" + "99".repeat(20); }, /ما في تحويل USDT \(BEP20\) لعنوانك/);
  await expectManual("an NFT-style Transfer (4 topics) is ignored", d => { const k = hh(d, "an NFT-style Transfer (4 topics) is ignored"); bscTx(k, BEP, d.amount); chain.receipts[k].logs[0].topics.push(pad("0x01")); }, /ما في تحويل USDT/);
  await expectManual("a payment made BEFORE the request existed", d => { const k = hh(d, "a payment made BEFORE the request existed"); bscTx(k, BEP, d.amount); chain.blocks["0x64"] = { timestamp: "0x" + Math.floor((Date.now() - 3600000) / 1000).toString(16) }; }, /العملية أقدم من وقت طلب الإيداع/);
  await expectManual("a payment long after the 24-hour window", d => { const k = hh(d, "a payment long after the 24-hour window"); bscTx(k, BEP, d.amount); chain.blocks["0x64"] = { timestamp: "0x" + Math.floor((Date.now() + 3 * 86400000) / 1000).toString(16) }; }, /بعد مهلة الطلب/);
  reset(); let d1 = await newDep("u4"); r = await proof("u4", d1.id, "hello"); ok(ord(d1.id).chain.state === "manual" && /مو بصيغة BEP20 صحيحة/.test(ord(d1.id).chain.reason) && chain.calls.length === 0, "a transaction number in the wrong format is refused without calling the network"); r = await proof("u4", d1.id, "abc" + "0".repeat(61)); ok(/مو بصيغة BEP20/.test(ord(d1.id).chain.reason), "(a 64-hex number without the 0x prefix is also refused on BEP20)");
  reset(); const spyFrom = chain.calls.length; r = await callC("/store/order/proof", { orderId: d1.id, image: "data:image/png;base64,iVBORw0KGgo=" }, "u4"); ok(chain.calls.length === spyFrom, "an image-only receipt does not start a network check");
  put("storeOrders/" + d1.id, { ...ord(d1.id), status: "payment_submitted" });
  /* the cap */
  reset(); const big = await newDep("u4", 250); bscTx(txh(777), BEP, big.amount); r = await proof("u4", big.id, txh(777)); ok(ord(big.id).status === "payment_submitted" && /فوق سقف التأكيد التلقائي \(200\$\)/.test(ord(big.id).chain.reason) && !claim("bep20", txh(777)), "a $250 deposit is above the $200 cap: held for you, nothing credited, the transaction is not claimed");
  r = await adm({ action: "wallet_save", cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: 300 } }); r = await adm({ action: "order_chain_check", id: big.id }); ok(r.json.outcome === "done" && r.json.order.status === "done", "after you raise the cap, the 'check now' button confirms it"); await adm({ action: "wallet_save", cfg: { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: 200 } });

  /* ---- F) stealing someone else's transaction number ---- */
  reset(); const victim = await newDep("u5"), thief = await newDep("u6"); ok(victim.amount !== thief.amount, "two open requests of the same size never have the same amount");
  bscTx(txh(900), BEP, victim.amount); r = await proof("u6", thief.id, txh(900)); const th = ord(thief.id); ok(th.status === "payment_submitted" && th.chain.state === "manual" && /يختلف عن المطلوب/.test(th.chain.reason) && bal("u6") === 0 && !claim("bep20", txh(900)), "someone else's payment cannot be claimed by another request (the amount belongs to the victim's request)");
  r = await proof("u5", victim.id, txh(900)); ok(ord(victim.id).status === "done" && claim("bep20", txh(900)), "the rightful payer is credited");
  put("storeOrders/" + thief.id, { ...ord(thief.id), amount: victim.amount }); r = await proof("u6", thief.id, txh(900) + " "); r = await adm({ action: "order_chain_check", id: thief.id }); ok(ord(thief.id).status === "payment_submitted" && /انستعمل لطلب إيداع تاني/.test(ord(thief.id).chain.reason) && bal("u6") === 0, "even if the amount somehow matched, a transaction already used by another deposit is refused");
  /* two checks at the same moment credit once */
  reset(); const twin = await newDep("u7"); bscTx(txh(950), BEP, twin.amount); put("storeOrders/" + twin.id, { ...ord(twin.id), status: "payment_submitted", proof: { ref: txh(950), hasImage: false, submittedAt: Date.now() } }); const bT = bal("u7");
  const both = await Promise.all([F("storeChainVerifyOnce")(env, twin.id), F("storeChainVerifyOnce")(env, twin.id)]); ok(bal("u7") === Math.round((bT + 10) * 10000) / 10000 && ledger("u7").filter(x => x.type === "topup").length === 1, "two verifications at the same instant credit the deposit exactly once");
  /* several transfers in one transaction */
  reset(); const multi = await newDep("u8"); const mt = txh(960); bscTx(mt, BEP, multi.amount / 2); chain.receipts[mt].logs.push({ address: BSC_USDT, topics: ["0x" + TOPIC, pad("0x" + "ee".repeat(20)), pad(BEP)], data: u18(multi.amount / 2) }); put("storeOrders/" + multi.id, { ...ord(multi.id), status: "payment_submitted", proof: { ref: mt, hasImage: false, submittedAt: Date.now() } }); r = await F("storeChainVerifyOnce")(env, multi.id); ok(r.outcome === "done", "two transfers to your address in one transaction are added together");

  /* ---- G) waiting for confirmations, the network being down, the sweeper ---- */
  reset(); const w1 = await newDep("u4"); bscTx(txh(1001), BEP, w1.amount); chain.latest = 103; r = await proof("u4", w1.id, txh(1001)); let ow = ord(w1.id);
  ok(ow.status === "payment_submitted" && ow.chain.state === "pending" && ow.chain.confirmations === 4 && ow.chain.need === 10 && /التأكيدات 4 من 10/.test(ow.chain.reason), "too few confirmations: it waits and says '4 of 10'");
  const cw = (await callC("/store/orders", {}, "u4")).json.orders.find(x => x.id === w1.id); ok(cw.chain.state === "pending" && cw.chain.confirmations === 4 && cw.chain.need === 10, "the customer sees the progress (4 of 10)");
  chain.latest = 110; const swp = await F("storeChainSweep")(env); ok(swp.checked === 1 && swp.done === 1 && ord(w1.id).status === "done", "the 5-minute job finishes it once the confirmations arrive");
  reset(); const w2 = await newDep("u4"); r = await proof("u4", w2.id, txh(1002)); ok(ord(w2.id).chain.state === "pending" && /ما انلقت العملية على شبكة BEP20 بعد/.test(ord(w2.id).chain.reason), "a transaction the network does not know yet: waiting");
  vm.runInContext("CHAIN_FAST_MS = [1, 1]", c); chain.calls.length = 0; r = await proof("u4", w2.id, txh(1003)); ok(chain.calls.filter(x => x.method === "eth_getTransactionReceipt").length === 3, "right after a proof it re-checks a couple of times quickly (here 3 checks)"); vm.runInContext("CHAIN_FAST_MS = []", c);
  put("storeOrders/" + w2.id, { ...ord(w2.id), proof: { ...ord(w2.id).proof, submittedAt: Date.now() - 4 * 3600000 } }); r = await F("storeChainVerifyOnce")(env, w2.id); ok(ord(w2.id).chain.state === "manual" && /ما انلقت العملية على الشبكة خلال 3 ساعات/.test(ord(w2.id).chain.reason), "after 3 hours of not finding it, it stops waiting and tells you to check");
  reset(); const w3 = await newDep("u4"); bscTx(txh(1010), BEP, w3.amount); chain.down = new Set(["https://bsc-dataseed.bnbchain.org"]); r = await proof("u4", w3.id, txh(1010)); ok(ord(w3.id).status === "done" && chain.calls.some(x => x.u === "https://bsc-dataseed1.bnbchain.org"), "if the first public node is down it uses the next one");
  reset(); const w4 = await newDep("u4"); bscTx(txh(1011), BEP, w4.amount); chain.down = new Set(["*"]); r = await proof("u4", w4.id, txh(1011)); ok(ord(w4.id).status === "payment_submitted" && ord(w4.id).chain.state === "retry" && ord(w4.id).chain.tries === 1 && ledger("u4").filter(y => y.ref === ord(w4.id).code).length === 0, "if every node is down: 'retry' (nothing is credited, nothing is lost)");
  chain.down = new Set(); const sw2 = await F("storeChainSweep")(env); ok(ord(w4.id).status === "done" && sw2.done === 1, "…and the job finishes it as soon as the network is back");
  reset(); put("storeOrders/mm", { kind: "topup", code: "D-mm", uid: "u4", status: "payment_submitted", autoVerify: "bep20", methodAccount: BEP, amount: 10.0001, priceUsd: 10, createdAt: Date.now(), proof: { ref: txh(5), hasImage: false, submittedAt: Date.now() }, chain: { state: "manual", reason: "x" }, events: [] }); const s3 = await F("storeChainSweep")(env); ok(s3.checked === 0 && chain.calls.length === 0, "the job leaves orders already held for you alone");
  /* the cron */
  reset(); const w5 = await newDep("u4"); bscTx(txh(1020), BEP, w5.amount); put("storeOrders/" + w5.id, { ...ord(w5.id), status: "payment_submitted", proof: { ref: txh(1020), hasImage: false, submittedAt: Date.now() } }); const cw5 = []; await W.scheduled({ cron: "*/5 * * * *" }, env, { waitUntil: p => cw5.push(p) }); await Promise.all(cw5); ok(ord(w5.id).status === "done", "the 5-minute trigger runs the blockchain follow-up");

  /* ---- H) TRC20 ---- */
  reset(); const t1 = await newDep("u5", 10, "usdtt"); ok(t1.amount > 10 && t1.amount <= 10.0099, "(TRC20 deposit also gets a unique small amount)"); const T1 = tid(1);
  r = await proof("u5", t1.id, T1); ok(ord(t1.id).chain.state === "pending" && /ما انلقت العملية على شبكة TRC20/.test(ord(t1.id).chain.reason), "TRC20: an unknown or not-yet-confirmed transaction: waiting");
  tronTx(T1, t1.amount); r = await F("storeChainVerifyOnce")(env, t1.id); ok(r.outcome === "done" && ord(t1.id).status === "done" && claim("trc20", T1) && ord(t1.id).chain.network === "trc20", "TRC20: a confirmed USDT transfer to your address for the exact amount is credited");
  ok(chain.calls.some(x => x.u === "https://api.trongrid.io/walletsolidity/gettransactioninfobyid" && x.body.value === T1) && chain.calls.every(x => !x.headers["TRON-PRO-API-KEY"]), "it asked TRON's CONFIRMED-only endpoint (so a payment is never credited before it is final); no key was needed");
  env.TRONGRID_KEY = "KEY-123"; reset(); const t2 = await newDep("u5", 10, "usdtt"); tronTx(tid(2), t2.amount); r = await proof("u5", t2.id, "0x" + tid(2).toUpperCase()); ok(ord(t2.id).status === "done" && chain.calls.find(x => /gettransactioninfobyid/.test(x.u)).headers["TRON-PRO-API-KEY"] === "KEY-123", "an optional TronGrid key is sent when you add one; a 0x prefix and upper case in the number are tolerated"); delete env.TRONGRID_KEY;
  reset(); const t3 = await newDep("u5", 10, "usdtt"); tronTx(tid(3), t3.amount, { receipt: { result: "OUT_OF_ENERGY" } }); r = await proof("u5", t3.id, tid(3)); ok(ord(t3.id).chain.state === "manual" && /العملية فشلت/.test(ord(t3.id).chain.reason), "TRC20: a transaction that failed on the network is refused");
  reset(); const t4 = await newDep("u5", 10, "usdtt"); tronTx(tid(4), t4.amount); chain.tron[tid(4)].log[0].address = "41" + TRON_USDT_HEX; chain.tron[tid(4)].log[0].topics[0] = "0x" + TOPIC; r = await proof("u5", t4.id, tid(4)); ok(ord(t4.id).status === "done", "TRC20: addresses written with the 41 prefix and topics with 0x are understood");
  reset(); const t5 = await newDep("u5", 10, "usdtt"); tronTx(tid(5), t5.amount); chain.tron[tid(5)].log[0].address = "aa".repeat(20); r = await proof("u5", t5.id, tid(5)); ok(ord(t5.id).chain.state === "manual" && /ما في تحويل USDT \(TRC20\)/.test(ord(t5.id).chain.reason), "TRC20: a different token with the same event is refused");
  reset(); const t6 = await newDep("u5", 10, "usdtt"); tronTx(tid(6), t6.amount); chain.tron[tid(6)].log[0].topics[2] = "0".repeat(24) + "33".repeat(20); r = await proof("u5", t6.id, tid(6)); ok(ord(t6.id).chain.state === "manual" && /لعنوانك/.test(ord(t6.id).chain.reason), "TRC20: a transfer to another address is refused");
  reset(); const t7 = await newDep("u5", 10, "usdtt"); tronTx(tid(7), t7.amount - 0.01); r = await proof("u5", t7.id, tid(7)); ok(ord(t7.id).chain.state === "manual" && /يختلف عن المطلوب/.test(ord(t7.id).chain.reason), "TRC20: a different amount (even 1 cent) is held");
  reset(); const t8 = await newDep("u5", 10, "usdtt"); chain.tronDown = true; r = await proof("u5", t8.id, tid(8)); ok(ord(t8.id).chain.state === "retry", "TRC20: if TRON's service is down it retries later");
  reset(); const t9 = await newDep("u5", 10, "usdtt"); r = await proof("u5", t9.id, "xyz"); ok(ord(t9.id).chain.state === "manual" && /مو بصيغة TRC20 صحيحة \(64 خانة\)/.test(ord(t9.id).chain.reason), "TRC20: a wrong format is refused without calling anyone");
  ok(!claim("bep20", tid(1)) && claim("trc20", T1), "the two networks keep separate records of used transactions");

  /* ---- I) a new transaction number starts again; the admin buttons ---- */
  reset(); const n1 = await newDep("u8"); r = await proof("u8", n1.id, "bad"); ok(ord(n1.id).chain.state === "manual", "(a bad number first)"); bscTx(txh(1100), BEP, n1.amount); r = await proof("u8", n1.id, txh(1100)); ok(ord(n1.id).status === "done" && ord(n1.id).chain.state === "ok", "sending a corrected number starts the check again and succeeds");
  reset(); const n2 = await newDep("u8"); r = await proof("u8", n2.id, "bad"); ok((await adm({ action: "order_chain_check", id: n2.id }, "u1")).status === 401 && (await adm({ action: "order_chain_check", id: n2.id }, null)).status === 401, "the 'check now' button is admin-only"); r = await adm({ action: "order_chain_check", id: "ghost" }); ok(r.status === 404, "(unknown order)");
  r = await adm({ action: "order_chain_check", id: n2.id }); ok(r.status === 200 && r.json.outcome === "manual" && /مو بصيغة BEP20/.test(r.json.reason) && r.json.order.chainInfo.state === "manual", "the button reports the reason and the admin view carries the full details");
  r = await adm({ action: "order_done", id: n2.id, note: "checked by hand" }); ok(r.status === 200 && ord(n2.id).status === "done", "you can always confirm a held deposit by hand");
  const al = (await adm({ action: "orders_list", status: "all" })).json.orders.find(x => x.id === n2.id); ok(al.chainInfo && al.chainInfo.state === "manual" && al.method.autoVerify === "bep20", "the admin list carries the verification details and the mode");
  r = await F("storeChainVerifyOnce")(env, n2.id); ok(r.outcome === "not_open", "a finished deposit is never checked again");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e); process.exit(1); });
