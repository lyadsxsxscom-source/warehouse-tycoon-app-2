// اختبارات السيرفر: رابط الذكاء الاصطناعي (MCP): إدارة الرابط، البروتوكول، الأدوات المحدودة، المخفي لحد الموافقة، السجل، والأمان
// التشغيل: node tools/tests/store_ai_worker.test.js
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
  const F = (n) => vm.runInContext(n, c), AIDOC = "config/storeAi", NOWMS = () => Date.now();
  let cost = { cat_ff: { o110: 0.979, oweek: 1.663 } };
  c.fetch = async (url) => { const u = String(url).replace("https://api.fzr.cards/api/v2", ""); const j = (o) => ({ ok: true, status: 200, json: async () => o });
    if (u.startsWith("/topups?limit=100")) return j({ items: [{ category_id: "cat_ff", name: "Free Fire (EU)" }, { category_id: "cat_multi", name: "Two Fields Game" }, { category_id: "cat_pubg", name: "PUBG Mobile" }], meta: { has_more: false } });
    if (u.startsWith("/giftcards?limit=100")) return j({ items: [{ category_id: "gc1", name: "Free Fire Gift Card" }], meta: { has_more: false } });
    if (u === "/manual-services") return j({ items: [] });
    if (u === "/topups/validate-id") return j({ items: [{ category_id: "v_ff", name: "Free Fire", fields: [{ key: "player_id" }] }] });
    let m = /^\/topups\/offers\?category_id=(.+)$/.exec(u);
    if (m && m[1] === "cat_ff") return j({ name: "Free Fire (EU)", offers: [{ offer_id: "o110", name: "Diamonds 110", price_usd: String(cost.cat_ff.o110) }, { offer_id: "oweek", name: "Weekly Membership", price_usd: String(cost.cat_ff.oweek) }], fields: [{ key: "player_id", label: "Player ID", type: "text" }] });
    if (m && m[1] === "cat_multi") return j({ name: "Two Fields Game", offers: [{ offer_id: "m1", name: "Pack", price_usd: "1.0" }], fields: [{ key: "user_id", label: "ID", type: "text" }, { key: "email", label: "Email", type: "text" }] });
    return { ok: false, status: 404, json: async () => ({}) }; };
  env.FAZER_API_KEY = "K"; put("config/storeSupplier", { enabled: false, minMarginPct: 5, dailyCapUsd: 100, updatedAt: 1 });
  const docs = () => [...store.keys()].filter(k => k.startsWith("storeNodes/")).map(k => ({ id: k.slice(11), ...get(k) })).sort((a, b) => a.id.localeCompare(b.id));
  const node = (id) => get("storeNodes/" + id);
  const mk = (id, parentId, type, name, sort, o) => put("storeNodes/" + id, { parentId, type, name, enabled: true, sort, imageVer: 0, createdAt: 1, updatedAt: 1, note: "", ...(type === "item" ? { prices: P10([1, 0.9]) } : {}), ...(o || {}) });
  const reset = () => { for (const k of [...store.keys()]) if (k.startsWith("storeNodes/") || k === AIDOC || k === "config/storeCatalogSnap" || k.startsWith("storeAiLog/")) store.delete(k); mk("nA", "", "folder", "Manual folder", 1); mk("iA", "nA", "item", "Manual item", 1); F("AI_RATE").clear(); };
  const mcp = async (method, body, tok, rawBody) => { const res = await W.fetch(new Request("https://x/ai/mcp/" + tok, { method: method, headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: method === "POST" ? (rawBody !== undefined ? rawBody : JSON.stringify(body)) : undefined }), env, { waitUntil: p => p }); const t = await res.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} return { status: res.status, json: j, text: t, headers: res.headers }; };
  let TOKEN = "", r;
  const rpc = (m, p, id) => mcp("POST", { jsonrpc: "2.0", id: id === undefined ? 1 : id, method: m, params: p }, TOKEN);
  const tool = async (name, args) => { const x = await rpc("tools/call", { name, arguments: args }); const rs = x.json.result; return { isError: rs.isError, text: rs.content[0].text, data: rs.isError ? null : JSON.parse(rs.content[0].text) }; };
  const newLink = async (hours) => { const x = await adm({ action: "ai_link_create", hours: hours || 6 }); TOKEN = x.json.url.split("/").pop(); return x; };

  /* ---- A) managing the link (admin) ---- */
  reset(); r = await adm({ action: "ai_link_status" }); ok(r.status === 200 && r.json.exists === false && r.json.active === false && r.json.maxCreates === 150, "at first there is no link");
  r = await adm({ action: "ai_link_create", hours: 3 }); ok(r.status === 400, "only 1, 6 or 24 hours are accepted");
  const t0 = NOWMS(); r = await adm({ action: "ai_link_create", hours: 6 }); TOKEN = r.json.url.split("/").pop();
  ok(r.status === 200 && /^https:\/\/x\/ai\/mcp\/[0-9a-f]{48}$/.test(r.json.url) && Math.abs(r.json.expiresAt - (t0 + 6 * 3600000)) < 5000 && r.json.hours === 6, "creating a link gives a secret URL with a 48-character token that expires in 6 hours");
  const sd = get(AIDOC); ok(sd.tokenHash === await F("sha256Hex")(TOKEN) && !JSON.stringify(sd).includes(TOKEN) && sd.creates === 0, "only the hash of the token is stored (never the token itself)");
  r = await adm({ action: "ai_link_status" }); ok(r.json.active === true && r.json.creates === 0 && r.json.calls === 0 && !JSON.stringify(r.json).includes(TOKEN) && !("tokenHash" in r.json), "the status shows time left and use, never the token or its hash");
  ok((await adm({ action: "ai_link_create", hours: 6 }, "u1")).status === 401 && (await adm({ action: "ai_link_status" }, null)).status === 401 && (await adm({ action: "ai_link_revoke" }, "u1")).status === 401 && (await adm({ action: "ai_link_log" }, null)).status === 401 && (await adm({ action: "ai_pending" }, "u1")).status === 401 && (await adm({ action: "ai_enable", all: true }, "u1")).status === 401, "all the link actions are admin-only");
  const old = TOKEN; await newLink(24); ok(old !== TOKEN && (await mcp("POST", { jsonrpc: "2.0", id: 1, method: "ping" }, old)).status === 404 && (await rpc("ping")).status === 200, "renewing makes a new link and the old one stops working at once");
  r = await adm({ action: "ai_link_revoke" }); ok(r.status === 200, "(revoke)"); let x = await rpc("ping"); ok(x.status === 403 && /انلغى/.test(x.json.error.message), "a revoked link answers 403 'revoked'"); r = await adm({ action: "ai_link_status" }); ok(r.json.active === false && r.json.revoked === true, "…and the status says so");
  await newLink(1); put(AIDOC, { ...get(AIDOC), expiresAt: NOWMS() - 1000 }); x = await rpc("ping"); ok(x.status === 403 && /انتهت مدة الرابط/.test(x.json.error.message), "an expired link answers 403 'expired'"); r = await adm({ action: "ai_link_status" }); ok(r.json.active === false && r.json.expired === true, "…and the status says so");
  for (const bad of ["", "abc", "0".repeat(48), "g".repeat(48), "A".repeat(48), "0".repeat(47)]) { x = await mcp("POST", { jsonrpc: "2.0", id: 1, method: "ping" }, bad); if (x.status !== 404) { ok(false, "a wrong token must answer 404: " + JSON.stringify(bad)); } }
  ok(true, "wrong or malformed tokens all answer 404 and reveal nothing");
  await newLink(6);

  /* ---- B) the protocol ---- */
  x = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }); ok(x.status === 200 && x.json.jsonrpc === "2.0" && x.json.id === 1 && x.json.result.protocolVersion === "2025-06-18" && x.json.result.capabilities.tools && x.json.result.serverInfo.name === "yardova-store" && /HIDDEN/.test(x.json.result.instructions) && /cannot delete/.test(x.json.result.instructions), "initialize answers with the protocol version, tools capability, server name and the working rules");
  x = await rpc("initialize", { protocolVersion: "1999-01-01" }); ok(x.json.result.protocolVersion === "2025-03-26", "an unknown protocol version gets the default one");
  x = await mcp("POST", { jsonrpc: "2.0", method: "notifications/initialized" }, TOKEN); ok(x.status === 202 && x.text === "", "the 'initialized' notice gets 202 with no body");
  x = await rpc("ping", {}, 7); ok(x.json.id === 7 && JSON.stringify(x.json.result) === "{}", "ping works (and echoes the id)");
  x = await rpc("tools/list"); const names = x.json.result.tools.map(t => t.name); ok(names.join() === "list_catalog,fazercards_search,fazercards_offers,fazercards_validators,create_folder,create_items,update_node,set_prices,move_node" && x.json.result.tools.every(t => t.inputSchema.type === "object" && t.description.length > 30), "tools/list returns the nine tools, each with a description and a schema");
  ok(!names.some(n => /delete|remove|wallet|balance|order|customer|payment|confirm|refund|key|setting|supplier_save/.test(n)), "there is no tool to delete, or to touch money, orders, customers, payments, keys or settings");
  x = await rpc("nope"); ok(x.json.error.code === -32601, "an unknown method answers 'method not found'"); x = await rpc("tools/call", { name: "wallet_save", arguments: {} }); ok(x.json.error.code === -32602, "an admin action called as a tool is rejected (only the nine exist)"); x = await rpc("tools/call", { name: "delete", arguments: { id: "nA" } }); ok(x.json.error.code === -32602 && !!node("nA"), "'delete' does not exist");
  x = await mcp("POST", null, TOKEN, "{not json"); ok(x.status === 400 && x.json.error.code === -32700, "broken JSON answers 400 'parse error'"); x = await mcp("POST", null, TOKEN, JSON.stringify({ hello: 1 })); ok(x.json.error.code === -32600, "a message that is not JSON-RPC is rejected");
  x = await mcp("POST", [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 2, method: "ping" }], TOKEN); ok(Array.isArray(x.json) && x.json.length === 2 && x.json[1].id === 2, "a batch is answered as a batch (notifications get no reply)");
  x = await mcp("POST", null, TOKEN, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(210000) } })); ok(x.status === 413, "a request over 200 KB is refused");
  x = await mcp("GET", null, TOKEN); ok(x.status === 405 && /POST/.test(x.headers.get("Allow")), "GET answers 405 (there is no streaming channel)"); x = await mcp("OPTIONS", null, TOKEN); ok(x.status === 204 && x.headers.get("Access-Control-Allow-Origin") === "*", "OPTIONS answers for browsers"); x = await mcp("DELETE", null, TOKEN); ok(x.status === 200, "DELETE (closing a session) is accepted");
  ok(x.headers.get("Cache-Control") === "no-store", "nothing is cached");
  F("AI_RATE").clear(); let last; for (let i = 0; i < 121; i++) last = await rpc("ping"); ok(last.status === 429 && /طلبات كتير/.test(last.json.error.message), "more than 120 requests in a minute are slowed down (429)"); F("AI_RATE").clear();

  /* ---- C) reading ---- */
  reset(); await newLink(6); const lc = await tool("list_catalog", {}); ok(!lc.isError && lc.data.total === 2 && lc.data.limit === 300 && lc.data.children.length === 1 && lc.data.children[0].name === "Manual folder" && lc.data.children[0].type === "folder" && lc.data.children[0].children === 1 && lc.data.children[0].ai === false && lc.data.children[0].visible === true, "list_catalog shows the top level, with the totals and whether each node is AI-created");
  const lc2 = await tool("list_catalog", { parentId: "nA" }); ok(lc2.data.children[0].name === "Manual item" && lc2.data.children[0].vip1 === 1 && lc2.data.children[0].vip10 === 0.9 && lc2.data.path === "(top level)".replace("(top level)", "Manual folder") || /Manual folder/.test(lc2.data.path), "…and the products inside a folder, with their VIP1 and VIP10 prices");
  ok((await tool("list_catalog", { parentId: "ghost" })).isError, "an unknown folder is an error");
  const fs = await tool("fazercards_search", { query: "free fire" }); ok(fs.data.results.some(x => x.categoryId === "cat_ff" && x.canAutomate === true && x.section === "topups") && fs.data.results.some(x => x.section === "giftcards" && x.canAutomate === false), "fazercards_search finds the game and says which results can be automated");
  const fo = await tool("fazercards_offers", { categoryId: "cat_ff" }); ok(fo.data.offers.length === 2 && fo.data.offers[0].offerId === "o110" && fo.data.offers[0].priceUsd === 0.979 && fo.data.fields[0].key === "player_id", "fazercards_offers lists packages with their cost and the player field"); ok((await tool("fazercards_offers", { categoryId: "bad id!" })).isError, "(a malformed category is refused)");
  const fv = await tool("fazercards_validators", { query: "free fire" }); ok(fv.data.results[0].categoryId === "v_ff", "fazercards_validators finds the player-check id");

  /* ---- D) creating (everything hidden) ---- */
  r = await adm({ action: "catalog_snap_rebuild" }); ok(r.json.enabled === true, "(the fast catalog is on for these tests, like in production)");
  const cf = await tool("create_folder", { name: "  Free Fire  ", note: "ملاحظة" }); const ffId = cf.data.id; ok(!cf.isError && cf.data.visible === false && cf.data.existing === false && node(ffId).enabled === false && node(ffId).ai === true && node(ffId).name === "Free Fire" && node(ffId).parentId === "" && node(ffId).note === "ملاحظة", "create_folder makes a HIDDEN folder marked as AI-created");
  const cf2 = await tool("create_folder", { name: "Free Fire" }); ok(cf2.data.id === ffId && cf2.data.existing === true && docs().filter(x => x.name === "Free Fire").length === 1, "the same name under the same parent returns the existing folder (no duplicates)");
  const cf3 = await tool("create_folder", { name: "Diamonds", parentId: ffId }); ok(!cf3.isError && node(cf3.data.id).parentId === ffId, "a folder inside a folder"); ok((await tool("create_folder", { name: "x", parentId: "ghost" })).isError && (await tool("create_folder", { name: "  " })).isError, "(bad parent and empty names are refused)");
  const ci = await tool("create_items", { parentId: cf3.data.id, items: [{ name: "110 ماسة", categoryId: "cat_ff", offerId: "o110" }, { name: "عضوية أسبوعية", categoryId: "cat_ff", offerId: "oweek", note: "فوري + يومي", validateCategoryId: "v_ff" }], m1: 20, m10: 10 });
  ok(!ci.isError && ci.data.created.length === 2 && ci.data.hidden === true, "create_items creates the products");
  const w = ci.data.created[1], wn = node(w.id); ok(w.costUsd === 1.663 && w.vip1 === 2.08 && w.vip10 === 1.85 && w.marginVip10 === 10.1 && wn.prices.length === 10 && wn.prices[0] === 2.08 && wn.prices[9] === 1.85 && wn.prices.every((p, i, a) => i === 0 || p <= a[i - 1]), "prices come from the cost with the margins given (cost 1.663 → VIP1 2.08, VIP10 1.85), never rising with the level");
  ok(wn.enabled === false && wn.ai === true && wn.type === "item" && wn.note === "فوري + يومي" && wn.supplier.provider === "fazercards" && wn.supplier.categoryId === "cat_ff" && wn.supplier.offerId === "oweek" && wn.supplier.playerField === "player_id" && wn.supplier.categoryName === "Free Fire (EU)" && wn.supplier.validateCategoryId === "v_ff" && wn.supplier.offerName === "Weekly Membership" && wn.supplier.costUsd === 1.663, "each product is hidden, AI-marked, linked to its offer with the player field, the check id and the cost");
  ok(node(ci.data.created[0].id).supplier.validateCategoryId === "" && node(ci.data.created[0].id).sort === 1 && node(w.id).sort === 2, "(the check id is optional; products keep the order they were given)");
  const snapList = JSON.parse(get("config/storeCatalogSnap").json).sort((a, b) => a.id.localeCompare(b.id)); ok(JSON.stringify(docs()) === JSON.stringify(snapList), "the fast catalog stays identical to the items after all this");
  const again = await tool("create_items", { parentId: cf3.data.id, items: [{ name: "110 ماسة", categoryId: "cat_ff", offerId: "o110" }, { name: "عضوية أسبوعية", categoryId: "cat_ff", offerId: "oweek" }], m1: 20, m10: 10 }); ok(!again.isError && again.data.created.length === 0 && again.data.skipped.length === 2 && docs().filter(x => x.type === "item").length === 3, "sending the same products again creates nothing (safe to retry)");
  /* refusals */
  const bad = async (args, re, label) => { const y = await tool("create_items", { parentId: cf3.data.id, m1: 20, m10: 10, ...args }); ok(y.isError && re.test(y.text), label + ": " + y.text.slice(0, 70)); };
  await bad({ items: [{ name: "X", categoryId: "cat_ff", offerId: "nope" }] }, /العرض nope مو موجود/, "an offer that does not exist"); await bad({ items: [{ name: "X", categoryId: "cat_multi", offerId: "m1" }] }, /بيدعم الـID وحده/, "a game needing two player fields that are not ID + Zone"); await bad({ items: [{ name: "X", categoryId: "cat_ff", offerId: "o110" }], m10: 2 }, /ما بتنزل|أقل|الحد الأدنى|margin|VIP 10/, "a VIP10 margin under the owner's minimum"); await bad({ items: [{ name: "X", categoryId: "cat_ff", offerId: "o110" }], m1: 5, m10: 10 }, /VIP 1/, "VIP1 margin lower than VIP10"); await bad({ items: [] }, /من 1 لـ25/, "no products"); await bad({ items: Array.from({ length: 26 }, (_, i) => ({ name: "P" + i, categoryId: "cat_ff", offerId: "o110" })) }, /من 1 لـ25/, "more than 25 at once"); await bad({ items: [{ name: "", categoryId: "cat_ff", offerId: "o110" }] }, /name وcategoryId وofferId/, "a product without a name"); await bad({ items: [{ name: "X", categoryId: "cat_ff", offerId: "o110" }], parentId: "iA" }, /مو مجلد|مو موجود/, "a product as the parent");
  ok(docs().filter(x => x.type === "item").length === 3, "…and none of the refused calls created anything");
  r = await adm({ action: "list" }); ok(r.json.nodes.find(n => n.id === w.id).ai === true && r.json.nodes.find(n => n.id === "iA").ai === false, "the admin list marks which nodes are AI-created");

  /* ---- E) customers never see them ---- */
  const wr = []; const pc = await W.fetch(new Request("https://x/store/catalog"), env, { waitUntil: p => wr.push(p) }); const cj = await pc.json(); ok(!JSON.stringify(cj).includes("Free Fire") && !JSON.stringify(cj).includes("ماسة"), "the public catalog does not show anything the AI created");
  mkC("v1", { balanceUsd: 5 }); TOKS.v1 = { sub: "v1", name: "v1", email: "v1@x.com" }; const ord = await callApi("/store/order", { itemId: w.id, playerId: "123456789", reqId: rid() }, "v1"); ok(ord.status >= 400 && !get("storeOrders/" + (ord.json.order && ord.json.order.id)), "a customer cannot order a hidden AI product");

  /* ---- F) editing only what the AI made and is still hidden ---- */
  let u = await tool("update_node", { id: w.id, name: "عضوية أسبوعية (7 أيام)", note: "" }); ok(!u.isError && node(w.id).name === "عضوية أسبوعية (7 أيام)" && node(w.id).note === "" && node(w.id).enabled === false, "update_node changes the name and note of an AI product");
  for (const id of ["iA", "nA"]) { u = await tool("update_node", { id, name: "hacked" }); ok(u.isError && /مو من إضافتي/.test(u.text) && node(id).name !== "hacked", "a node the owner made cannot be edited: " + id); }
  u = await tool("update_node", { id: "ghost", name: "x" }); ok(u.isError, "(unknown id)"); u = await tool("update_node", { id: w.id, name: " " }); ok(u.isError && node(w.id).name === "عضوية أسبوعية (7 أيام)", "(empty name refused)");
  cost.cat_ff.oweek = 1.8; let sp = await tool("set_prices", { ids: [w.id], m1: 20, m10: 10 }); ok(!sp.isError && sp.data.applied === 1 && node(w.id).prices[0] === 2.25 && node(w.id).prices[9] === 2 && node(w.id).supplier.costUsd === 1.8, "set_prices recomputes from the new cost (1.80 → VIP1 2.25, VIP10 2.00) and keeps the link updated");
  sp = await tool("set_prices", { ids: ["iA"], m1: 20, m10: 10 }); ok(sp.isError && /مو من إضافتي/.test(sp.text) && JSON.stringify(node("iA").prices) === JSON.stringify(P10([1, 0.9])), "prices of the owner's products cannot be changed by the AI"); sp = await tool("set_prices", { ids: [w.id], m1: 20, m10: 1 }); ok(sp.isError, "(and the minimum margin is enforced here too)");
  let mv = await tool("move_node", { id: w.id, parentId: ffId }); ok(!mv.isError && node(w.id).parentId === ffId && JSON.stringify(JSON.parse(get("config/storeCatalogSnap").json).find(x => x.id === w.id).parentId) === JSON.stringify(ffId), "move_node moves an AI product (and the fast catalog follows)"); mv = await tool("move_node", { id: ffId, parentId: cf3.data.id }); ok(mv.isError && /جواته/.test(mv.text), "a folder cannot go inside itself"); mv = await tool("move_node", { id: "iA", parentId: ffId }); ok(mv.isError && /مو من إضافتي/.test(mv.text), "the owner's products cannot be moved");

  /* ---- G) approval in the admin ---- */
  const pend = await adm({ action: "ai_pending" }); ok(pend.status === 200 && pend.json.pending.length === 4 && pend.json.pending.some(p => p.id === w.id && p.path === "Free Fire" && p.vip1 === 2.25 && p.vip10 === 2 && p.costUsd === 1.8 && p.offerName === "Weekly Membership") && !pend.json.pending.some(p => p.id === "iA"), "the admin sees what waits for approval, with paths, cost and prices (not the owner's own nodes)");
  r = await adm({ action: "ai_enable", ids: [w.id] }); ok(r.status === 200 && r.json.enabled === 2 && node(w.id).enabled === true && node(w.id).ai === false && node(ffId).enabled === true && node(ffId).ai === false, "approving one product also approves its hidden folder (2 nodes), and both stop being AI-editable");
  ok(node(cf3.data.id).enabled === false && node(ci.data.created[0].id).enabled === false, "(siblings and sub-folders stay hidden)");
  const wr2 = []; const pc2 = await W.fetch(new Request("https://x/store/catalog"), env, { waitUntil: p => wr2.push(p) }); const cj2 = await pc2.json(); ok(JSON.stringify(cj2).includes("عضوية أسبوعية (7 أيام)") && !JSON.stringify(cj2).includes("110 ماسة"), "now customers see exactly the approved product (the cached copy was cleared)");
  u = await tool("update_node", { id: w.id, name: "later" }); ok(u.isError && /مو من إضافتي/.test(u.text), "after approval the AI can no longer touch it");
  r = await adm({ action: "ai_enable", ids: [w.id] }); ok(r.status === 404, "approving something already approved (or not pending) is refused"); r = await adm({ action: "ai_enable", ids: [] }); ok(r.status === 400, "(and so is an empty choice)"); r = await adm({ action: "ai_enable", ids: ["iA"] }); ok(r.status === 404 && node("iA").enabled === true, "the owner's own nodes are never touched by it");
  mk("hid", "", "item", "Hidden by the owner", 9, { enabled: false }); await adm({ action: "catalog_snap_rebuild" }); r = await adm({ action: "ai_enable", all: true }); ok(r.status === 200 && r.json.enabled === 2 && node("hid").enabled === false && docs().filter(n => n.ai === true).length === 0, "'approve all' approves the remaining 2 AI nodes and leaves what the owner hid alone");
  ok(JSON.stringify(docs()) === JSON.stringify(JSON.parse(get("config/storeCatalogSnap").json).sort((a, b) => a.id.localeCompare(b.id))), "the fast catalog is identical to the items after the approvals too");

  /* ---- H) limits, log, counters ---- */
  reset(); await newLink(6); put(AIDOC, { ...get(AIDOC), creates: 149 }); let q = await tool("create_folder", { name: "F149" }); ok(!q.isError && get(AIDOC).creates === 150, "the 150th creation is allowed"); q = await tool("create_folder", { name: "F150" }); ok(q.isError && /حد 150/.test(q.text) && !docs().some(n => n.name === "F150"), "the 151st is refused with a clear message (the owner renews the link)");
  q = await tool("create_items", { items: [{ name: "a", categoryId: "cat_ff", offerId: "o110" }], m1: 20, m10: 10 }); ok(q.isError && /حد 150/.test(q.text), "the quota applies to products as well"); const before = get(AIDOC).creates; await newLink(6); ok(get(AIDOC).creates === 0 && before === 150, "renewing the link resets the quota");
  put(AIDOC, { ...get(AIDOC), creates: 0 }); for (let i = 0; i < 299; i++) mk("f" + i, "nA", "item", "I" + i, 10 + i); await adm({ action: "catalog_snap_disable" }).catch(() => 0); store.delete("config/storeCatalogSnap"); q = await tool("create_folder", { name: "over limit" }); ok(q.isError && /وصل الكتالوج للحد/.test(q.text), "at the catalog's item limit (300 in the old mode) creation is refused");
  r = await adm({ action: "ai_link_log" }); const lg = r.json.log; ok(lg.length >= 3 && lg[0].at >= lg[lg.length - 1].at && lg.some(e => e.tool === "create_folder" && e.ok === false && /حد 150/.test(e.summary)) && lg.some(e => e.tool === "create_folder" && e.ok === true), "the log lists the calls newest first, with failures marked");
  ok(!JSON.stringify(lg).includes(TOKEN) && !JSON.stringify([...store.entries()].filter(([k]) => k.startsWith("storeAiLog/"))).includes(TOKEN), "the token never appears in the log");
  r = await adm({ action: "ai_link_status" }); ok(r.json.calls === 1 && r.json.lastUsedAt > 0, "the status counts the calls since the last renewal and shows the last use");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e); process.exit(1); });
