// =====================================================================
// Yardova — Cloudflare Worker (morning-lake-dfd1)
// السيرفر هو المرجع الوحيد لاقتصاد اللعبة: النقاط، المحفظة، الرفوف، العمال، المهام، السحب.
// ⚠️ لا تحط أي مفتاح سري بهالملف (المستودع عام). المفاتيح كلها Secrets بـ Cloudflare:
//    FIREBASE_SA       — مفتاح حساب الخدمة (JSON كامل)
//    OFFERWALL_SECRET  — المفتاح السري لـ Offerwall.me (postback + توقيع الهوية)
// والـ binding: PENDING_CREDITS (KV)
// =====================================================================

const OFFERWALL_PUBLIC_KEY = "lO3dCGRok7Q77hZ6FPFTikHdwx9mZs";
const FIREBASE_PROJECT_ID = "warehouse-tycoon-a3f83";
const ADMIN_UID = "09DZoXtB6afGTGHtFghiUx5t71N2";
const APK_SOURCE_URL = "https://github.com/lyadsxsxscom-source/warehouse-tycoon-app-2/releases/download/latest/yardova.apk";

// ===== ثوابت اللعبة (نفس قيم التطبيق الافتراضية؛ الأدمن بيعدّلها من gameConfig) =====
const DURATIONS = { day: 86400, week: 604800, month: 2592000 };
const SHELF_COUNT = 6;
const DEFAULT_SHELF_COST = [0, 0, 120, 350, 800, 1600];
// 3 عمال فقط (يومي/أسبوعي/شهري)، وإنتاجهم بالدولار (usd = قيمة إنتاج كامل المدة)
const DEFAULT_WORKERS = {
  day:   { cost: 25,  usd: 0.0278 },
  week:  { cost: 250, usd: 0.2778 },
  month: { cost: 600, usd: 0.6667 },
};
// طرق السحب: العملة ← الشبكات المسموحة (شام كاش بدون شبكة)
const COIN_NETWORKS = { usdt: ["TRC20", "BEP20"], btc: ["BTC", "BEP20"], eth: ["ERC20", "BEP20"], shamcash: ["SHAMCASH"] };
const STARTING_POINTS = 260;
const AD_REWARD_POINTS = 2;
const AD_MIN_INTERVAL_MS = 25000;   // أقل فاصل بين مكافأتين إعلان
const AD_DAILY_LIMIT = 40;          // أقصى عدد مكافآت إعلان باليوم
const BOOST_MS = 60000;             // مضاعفة الإنتاج ×2 بعد كل إعلان
const WITHDRAW_COOLDOWN_MS = 86400000;

// ===== المكافأة اليومية + الإحالة (القيم الافتراضية؛ الأدمن بيعدّلها من gameConfig.daily و gameConfig.referral) =====
const DEFAULT_DAILY_REWARDS = [10, 15, 20, 25, 30, 40, 60];
const DEFAULT_REFERRAL = {
  inviteeBonus: 50,     // هدية فورية للاعب الجديد لما يكتب كود
  inviterReward: 150,   // مكافأة الداعي لما المدعو يصير نشط
  requiredDays: 3,      // شرط النشاط: كم يوم مختلف فتح فيه اللعبة
  requiredAds: 10,      // شرط النشاط: كم إعلان حضر
  commissionPct: 10,    // نسبة دائمة من نقاط جدار المهام تبع المدعو
  windowHours: 48,      // المدة المسموحة لكتابة كود بعد أول دخول
};
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // بدون O/0 و I/1 لتجنّب اللخبطة
function dailyRewards(cfg) {
  const arr = cfg.game.daily && cfg.game.daily.rewards;
  return Array.isArray(arr) && arr.length === 7 && arr.every(n => typeof n === "number" && n >= 0) ? arr : DEFAULT_DAILY_REWARDS;
}
// إعدادات الإعلانات والمهام اليومية (الأدمن بيعدّلها من gameConfig.ads و gameConfig.tasks)
const DEFAULT_TASK_REWARDS = { watch3: 30, rent1: 40 };
function adsCfg(cfg) {
  const c = (cfg && cfg.game && cfg.game.ads) || {};
  const pts = Number(c.rewardPoints);
  const lim = Number(c.dailyLimit);
  return {
    rewardPoints: Number.isFinite(pts) && pts >= 0 && pts <= 1000 ? pts : AD_REWARD_POINTS,
    dailyLimit: Number.isFinite(lim) && lim >= 0 && lim <= 1000 ? Math.floor(lim) : AD_DAILY_LIMIT,
  };
}
function taskRewards(cfg) {
  const c = (cfg && cfg.game && cfg.game.tasks) || {};
  const out = { ...DEFAULT_TASK_REWARDS };
  for (const k of Object.keys(out)) {
    const v = Number(c[k]);
    if (Number.isFinite(v) && v >= 0 && v <= 10000) out[k] = v;
  }
  return out;
}
function referralCfg(cfg) {
  const r = { ...DEFAULT_REFERRAL };
  const c = cfg.game.referral || {};
  for (const k of Object.keys(r)) if (typeof c[k] === "number" && c[k] >= 0) r[k] = c[k];
  r.commissionPct = Math.min(r.commissionPct, 50);
  return r;
}
function newRefCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, x => REF_ALPHABET[x % REF_ALPHABET.length]).join("");
}
// إضافة ذرّية لنقاط لاعب تاني (الداعي) بدون ما نقرأ مستنده
function creditWrite(env, uid, pts, extra = {}, setFields = {}) {
  const t = [
    { fieldPath: "points", increment: { doubleValue: pts } },
    { fieldPath: "totalPointsEarned", increment: { doubleValue: pts } },
  ];
  for (const [f, v] of Object.entries(extra)) t.push({ fieldPath: f, increment: Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v } });
  return { update: { name: docName(env, "players/" + uid), fields: objToFields(setFields) }, updateMask: { fieldPaths: Object.keys(setFields) }, updateTransforms: t };
}
// إذا المدعو وصل لشرط النشاط: مكافأة الداعي (مرة وحدة بس)
function referralRewardWrites(env, cfg, p, today) {
  if (!p.referredBy || p.referralRewarded) return [];
  const r = referralCfg(cfg);
  if (p.activeDays < r.requiredDays || p.adsWatched < r.requiredAds) return [];
  p.referralRewarded = true;
  return [
    creditWrite(env, p.referredBy, r.inviterReward, { referralActive: 1, referralEarnings: r.inviterReward }),
    statsWrite(env, today, { referralsActivated: 1 }),
  ];
}

function newTasks(cfg) {
  const r = taskRewards(cfg);
  return [
    { id: "watch3", label: "شاهد 3 إعلانات",     reward: r.watch3, progress: 0, target: 3, claimed: false },
    { id: "rent1",  label: "استأجر عامل واحد",   reward: r.rent1,  progress: 0, target: 1, claimed: false },
  ];
}

// ===== أدوات عامة =====
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...corsHeaders() } });
}
class ApiError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
function todaySyria(now = Date.now()) {
  const d = new Date(now + 3 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
async function md5Hex(str) {
  const buf = await crypto.subtle.digest("MD5", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
function bytesToB64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function strToB64url(str) { return bytesToB64url(new TextEncoder().encode(str)); }
function randomId() {
  return crypto.randomUUID().replace(/-/g, ""); // عشوائي بدون انحياز
}

// ===== صلاحية الـWorker على Firestore =====
let cachedGoogleTokens = {};
const DEFAULT_GOOGLE_SCOPE = "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging";
async function getGoogleAccessToken(env, scope = DEFAULT_GOOGLE_SCOPE) {
  const now = Math.floor(Date.now() / 1000);
  const cached = cachedGoogleTokens[scope];
  if (cached && cached.exp > now + 60) return cached.token;
  if (!env.FIREBASE_SA) throw new Error("FIREBASE_SA secret is missing");
  const sa = JSON.parse(env.FIREBASE_SA);
  const header = strToB64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = strToB64url(JSON.stringify({
    iss: sa.client_email, scope,
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(header + "." + claim));
  const jwt = header + "." + claim + "." + bytesToB64url(new Uint8Array(sig));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + jwt,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("google token failed: " + JSON.stringify(j));
  cachedGoogleTokens[scope] = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}
function projectId(env) { return JSON.parse(env.FIREBASE_SA).project_id; }
function docName(env, path) { return `projects/${projectId(env)}/databases/(default)/documents/${path}`; }
function fsUrl(env, suffix) { return `https://firestore.googleapis.com/v1/projects/${projectId(env)}/databases/(default)/documents${suffix}`; }

// تحويل القيم بين JavaScript وصيغة Firestore REST
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  const fields = {};
  for (const [k, val] of Object.entries(v)) if (val !== undefined) fields[k] = toFs(val);
  return { mapValue: { fields } };
}
function fromFs(val) {
  if (!val) return null;
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("stringValue" in val) return val.stringValue;
  if ("timestampValue" in val) return Date.parse(val.timestampValue);
  if ("arrayValue" in val) return (val.arrayValue.values || []).map(fromFs);
  if ("mapValue" in val) return fieldsToObj(val.mapValue.fields || {});
  return null;
}
function fieldsToObj(fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields || {})) o[k] = fromFs(v);
  return o;
}
function objToFields(obj) { return toFs(obj).mapValue.fields; }

async function fsGetDoc(env, path) {
  const token = await getGoogleAccessToken(env);
  const r = await fetch(fsUrl(env, "/" + path), { headers: { Authorization: "Bearer " + token } });
  if (r.status === 404) return { exists: false, data: null, updateTime: null };
  if (!r.ok) throw new Error("fsGet " + r.status + ": " + (await r.text()));
  const j = await r.json();
  return { exists: true, data: fieldsToObj(j.fields), updateTime: j.updateTime };
}
async function fsCommit(env, writes) {
  const token = await getGoogleAccessToken(env);
  const r = await fetch(fsUrl(env, ":commit"), {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ writes }),
  });
  if (!r.ok) {
    const text = await r.text();
    const err = new Error("fsCommit " + r.status + ": " + text);
    err.conflict = r.status === 409 || text.includes("FAILED_PRECONDITION") || text.includes("ABORTED");
    throw err;
  }
  return r.json();
}

// استعلام بسيط: آخر N مستند من مجموعة، مرتبة حسب حقل تنازلياً
async function fsRunQuery(env, collectionId, orderField, limit, offset, filter) {
  const token = await getGoogleAccessToken(env);
  const sq = { from: [{ collectionId }], limit };
  if (filter) sq.where = { fieldFilter: { field: { fieldPath: filter.field }, op: filter.op || "EQUAL", value: toFs(filter.value) } };   // فلتر واحد (مساواة) ما بيحتاج فهرس
  if (orderField) sq.orderBy = [{ field: { fieldPath: orderField }, direction: "DESCENDING" }];   // بدون ترتيب = كل المستندات (حتى يلي ما فيها حقل الترتيب)
  if (offset > 0) sq.offset = offset;
  const r = await fetch(fsUrl(env, ":runQuery"), {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: sq }),
  });
  if (!r.ok) throw new Error("fsQuery " + r.status + ": " + (await r.text()));
  const rows = await r.json();
  return rows.filter(x => x.document).map(x => ({ id: x.document.name.split("/").pop(), data: fieldsToObj(x.document.fields || {}) }));
}

// عدّ المستندات بدون قراءتها (Firestore بتحاسب قراءة وحدة لكل 1000 مستند). إذا فشل بنرجع لقراءة محدودة.
async function fsCount(env, collectionId, filter) {
  try {
    const token = await getGoogleAccessToken(env), sq = { from: [{ collectionId }] };
    if (filter) sq.where = { fieldFilter: { field: { fieldPath: filter.field }, op: "EQUAL", value: toFs(filter.value) } };
    const r = await fetch(fsUrl(env, ":runAggregationQuery"), { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: sq, aggregations: [{ alias: "n", count: {} }] } }) });
    if (!r.ok) throw new Error("fsCount " + r.status);
    const rows = await r.json(), f = rows[0] && rows[0].result && rows[0].result.aggregateFields && rows[0].result.aggregateFields.n;
    return Number(f && f.integerValue) || 0;
  } catch (e) { return (await fsRunQuery(env, collectionId, null, 200, 0, filter)).length; }
}
// استعلامات صغيرة بالحالة (بدل قراءة كل الطلبات): بتجمع نتائج كل حالة من الحالات المطلوبة
async function storeOrdersByState(env, field, states, limit) {
  const out = new Map(); for (const st of states) for (const r of await fsRunQuery(env, "storeOrders", null, limit, 0, { field, value: st })) out.set(r.id, r);
  return [...out.values()];
}

// ===== الإحصائيات اليومية (analytics/{اليوم}) =====
// عدّادات ذرّية (increment + appendMissingElements)، ما بتتعارض مع حفظ اللاعب ولا بتحتاج قراءة.
// uids = مين فات اليوم، newUids = مين أول يوم إله اليوم → منهن بتنحسب DAU/MAU والاحتفاظ D1/D7 بصفحة الأدمن.
function statsWrite(env, day, incs = {}, arrays = {}) {
  const updateTransforms = [];
  for (const [f, v] of Object.entries(incs)) {
    updateTransforms.push({ fieldPath: f, increment: Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v } });
  }
  for (const [f, vals] of Object.entries(arrays)) {
    if (vals && vals.length) updateTransforms.push({ fieldPath: f, appendMissingElements: { values: vals.map(x => ({ stringValue: String(x) })) } });
  }
  return { update: { name: docName(env, "analytics/" + day), fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms };
}

// إعدادات الأدمن (مع ذاكرة مؤقتة دقيقة وحدة)
let cachedConfig = null;
async function loadConfig(env) {
  if (cachedConfig && cachedConfig.at > Date.now() - 60000) return cachedConfig.value;
  const [game, pricing, shop] = await Promise.all([fsGetDoc(env, "config/gameConfig"), fsGetDoc(env, "config/pricing"), fsGetDoc(env, "config/shop")]);
  const value = { game: game.data || {}, pricing: pricing.data || {}, shop: shop.data || {} };
  cachedConfig = { at: Date.now(), value };
  return value;
}
function shelfCost(cfg, id) {
  const arr = cfg.game.shelfUnlockCost;
  return Array.isArray(arr) && typeof arr[id] === "number" ? arr[id] : DEFAULT_SHELF_COST[id];
}
function workerSpec(cfg, kind) {
  const def = DEFAULT_WORKERS[kind];
  const ws = (cfg.game && cfg.game.workers) || {};
  const custom = ws[kind] || ws["btc_" + kind] || {}; // الصيغة الجديدة أو القديمة (btc_day...) اللي كان الأدمن يحفظها
  const cost = typeof custom.cost === "number" ? custom.cost : def.cost;
  const usd = typeof custom.usdPerDuration === "number" ? custom.usdPerDuration : def.usd;
  return { cost, rateUsd: usd / DURATIONS[kind], seconds: DURATIONS[kind] };
}
// سعر العملة بالدولار (USDT وشام كاش = 1، والباقي من سعر الأدمن؛ 0 = غير مضبوط)
function coinPriceUsd(cfg, coin) {
  if (coin === "usdt" || coin === "shamcash") return 1;
  const v = Number(coin === "btc" ? (cfg.pricing || {}).btcUsd : (cfg.pricing || {}).ethUsd);
  return v > 0 ? v : 0;
}

// ===== التحقق من هوية المستخدم (توكن Firebase) =====
let cachedJwks = null; // مفاتيح جوجل العامة لتوقيع التوكن (بتنجدد كل ساعة)
async function getJwks() {
  if (cachedJwks && cachedJwks.at > Date.now() - 3600000) return cachedJwks.value;
  const value = await (await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")).json();
  cachedJwks = { at: Date.now(), value };
  return value;
}
async function verifyFirebaseToken(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch (e) { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== "https://securetoken.google.com/" + FIREBASE_PROJECT_ID) return null;
  const SKEW = 60; // سماحية فرق الساعة (ثانية)
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) return null;
  if (!Number.isFinite(payload.exp) || payload.exp < now) return null;
  if (!Number.isFinite(payload.iat) || payload.iat > now + SKEW) return null;
  if (!Number.isFinite(payload.auth_time) || payload.auth_time > now + SKEW) return null;
  const jwks = await getJwks();
  let jwk = jwks.keys.find(k => k.kid === header.kid);
  if (!jwk) { cachedJwks = null; jwk = (await getJwks()).keys.find(k => k.kid === header.kid); } // جوجل بدّلت مفاتيحها
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(h + "." + p));
  return ok ? payload : null;
}
async function requireUser(request) {
  const auth = request.headers.get("Authorization") || "";
  const user = await verifyFirebaseToken(auth.replace("Bearer ", "")).catch(() => null);
  if (!user) throw new ApiError("unauthorized", "انتهت جلستك، سجّل دخول من جديد.", 401);
  return user;
}

// ===== حالة اللاعب =====
function defaultShelves() {
  return Array.from({ length: SHELF_COUNT }, (_, i) => ({ id: i, unlocked: i < 2, worker: null }));
}
function normalizePlayer(raw, now, today, cfg) {
  const p = raw ? { ...raw } : {};
  if (!Array.isArray(p.shelves)) {
    // لاعب جديد (أو مستند انعمل من postback قبل أول فتح): نعطيه البداية
    p.points = STARTING_POINTS + (Number(p.points) || 0);
    p.totalPointsEarned = STARTING_POINTS + (Number(p.totalPointsEarned) || 0);
    p.shelves = defaultShelves();
    p.firstSeenDate = today;
    p.firstSeenAt = now;
  }
  if (!p.firstSeenDate) p.firstSeenDate = "legacy"; // لاعب قديم قبل نظام الإحصائيات
  p.firstSeenAt = Number(p.firstSeenAt) || 0;
  p.activeDays = Number(p.activeDays) || 0;
  p.inboxReadAt = Number(p.inboxReadAt) || now;   // رسائل البريد قبل هالوقت بتعتبر مقروءة (اللاعب الجديد ما بيشوف قديم كأنه جديد)
  p.dailyStreak = Number(p.dailyStreak) || 0;
  p.lastDailyClaim = p.lastDailyClaim || "";
  p.referredBy = p.referredBy || "";
  p.referralRewarded = !!p.referralRewarded;
  p.referralCode = p.referralCode || "";
  p.referralCount = Number(p.referralCount) || 0;
  p.referralActive = Number(p.referralActive) || 0;
  p.referralEarnings = Number(p.referralEarnings) || 0;
  const byId = {};
  p.shelves.forEach(s => { if (s && typeof s.id === "number") byId[s.id] = s; });
  p.shelves = Array.from({ length: SHELF_COUNT }, (_, i) => {
    const s = byId[i] || { id: i, unlocked: i < 2, worker: null };
    return { id: i, unlocked: !!s.unlocked, worker: s.worker || null };
  });
  p.points = Number(p.points) || 0;
  p.totalPointsEarned = Number(p.totalPointsEarned) || 0;
  // رصيد موحّد بالدولار: أي رصيد قديم (BTC/ETH) بينتقل للدولار بسعر الأدمن (وبيرجع ينتقل لو الأدمن/نسخة قديمة زادت بالقديم)
  p.balanceUsd = Number(p.balanceUsd) || 0;
  const lw = p.wallet || {}, keep = {};
  for (const c of ["btc", "eth"]) {
    const amt = Number(lw[c]) || 0;
    if (!amt) continue;
    const pr = coinPriceUsd(cfg, c);
    if (pr > 0) p.balanceUsd += amt * pr; else keep[c] = amt; // بدون سعر: منتركه محفوظ لحد ما ينضبط السعر
  }
  if (Object.keys(keep).length) p.wallet = keep; else delete p.wallet;
  // عمال قديمين إنتاجهم بعملة → بنحوّلهم لإنتاج بالدولار (rate بالدولار/ثانية)
  p.shelves.forEach(sh => {
    const w = sh.worker;
    if (!w || w.unit === "usd") return;
    const pr = coinPriceUsd(cfg, w.coin);
    if (pr > 0) { w.rate = (Number(w.rate) || 0) * pr; w.unit = "usd"; delete w.coin; }
  });
  p.adsWatched = Number(p.adsWatched) || 0;
  p.workersRented = Number(p.workersRented) || 0;
  p.adsToday = Number(p.adsToday) || 0;
  p.lastAdAt = Number(p.lastAdAt) || 0;
  p.lastWithdrawAt = Number(p.lastWithdrawAt) || 0;
  p.boostFrom = Number(p.boostFrom) || 0;
  p.boostUntil = Number(p.boostUntil) || 0;
  if (!p.lastSettleAt) p.lastSettleAt = now; // لاعب قديم: الحساب السيرفري بيبلّش من هلق
  if (p.dailyDate !== today || !Array.isArray(p.tasks)) {
    p.tasks = newTasks(cfg);
    p.dailyDate = today;
    p.adsToday = 0;
  }
  return p;
}
// إنتاج العمال من آخر تسوية لهلق (بيشتغل حتى والتطبيق مسكّر)
function settle(p, now) {
  const from = p.lastSettleAt;
  if (now > from) {
    for (const s of p.shelves) {
      const w = s.worker;
      if (!w || !w.rate || !w.expiresAt) continue;
      const segStart = Math.max(Number(w.startAt) || 0, from);
      const segEnd = Math.min(w.expiresAt, now);
      if (segEnd <= segStart) continue;
      let gain = w.rate * (segEnd - segStart) / 1000;
      const bs = Math.max(segStart, p.boostFrom), be = Math.min(segEnd, p.boostUntil);
      if (be > bs) gain += w.rate * (be - bs) / 1000;
      if (w.unit === "usd") p.balanceUsd += gain;
    }
  }
  p.lastSettleAt = now;
}
// شكل العامل للتطبيق: rateUsd (إنتاج بالدولار/ثانية) للنسخ الجديدة، وcoin + rate (إنتاج بالـBTC/ثانية) كمان للنسخ القديمة (2.2) حتى ما ينكسر عرضها
function shelfForClient(sh, cfg) {
  const w = sh.worker;
  if (!w || w.unit !== "usd") return sh;
  const usd = Number(w.rate) || 0;
  const bp = cfg ? coinPriceUsd(cfg, "btc") : 0;
  return { id: sh.id, unlocked: sh.unlocked, worker: { kind: w.kind, coin: "btc", rate: bp > 0 ? usd / bp : 0, rateUsd: usd, startAt: w.startAt, expiresAt: w.expiresAt } };
}
function publicState(p, now, cfg) {
  return {
    points: p.points, totalPointsEarned: p.totalPointsEarned, balanceUsd: p.balanceUsd,
    wallet: { btc: cfg && coinPriceUsd(cfg, "btc") > 0 ? p.balanceUsd / coinPriceUsd(cfg, "btc") : 0, eth: 0 }, // للنسخ القديمة من التطبيق
    shelves: p.shelves.map(sh => shelfForClient(sh, cfg)), tasks: p.tasks, dailyDate: p.dailyDate,
    adsWatched: p.adsWatched, workersRented: p.workersRented, activeDays: p.activeDays,
    boostUntil: p.boostUntil, lastWithdrawAt: p.lastWithdrawAt, serverNow: now, tgLinked: !!p.tgLinked,
    serverToday: todaySyria(now),
    ads: cfg ? adsCfg(cfg) : { rewardPoints: AD_REWARD_POINTS, dailyLimit: AD_DAILY_LIMIT },
    daily: { streak: p.dailyStreak, lastClaim: p.lastDailyClaim, rewards: cfg ? dailyRewards(cfg) : DEFAULT_DAILY_REWARDS },
    referral: (() => {
      const r = cfg ? referralCfg(cfg) : DEFAULT_REFERRAL;
      return {
        code: p.referralCode, invited: p.referralCount, active: p.referralActive, earnings: p.referralEarnings,
        referred: !!p.referredBy, rewarded: p.referralRewarded,
        canEnter: !p.referredBy && p.firstSeenAt > 0 && now - p.firstSeenAt < r.windowHours * 3600000,
        progress: { days: p.activeDays, ads: p.adsWatched },
        cfg: r,
      };
    })(),
  };
}

// تعديل مستند اللاعب بشكل ذرّي (لو حدا تاني عدّله بنفس اللحظة، منعيد المحاولة)
const mutatePlayerAdmin = (env, uid, fn) => mutatePlayer(env, uid, fn, { allowSuspended: true });   // عمليات الأدمن (إرجاع نقاط...) ما بتنمنع على حساب معلّق
async function mutatePlayer(env, uid, fn, opts = {}) {
  const path = "players/" + uid;
  for (let attempt = 0; attempt < 4; attempt++) {
    const doc = await fsGetDoc(env, path);
    const now = Date.now();
    const cfg = await loadConfig(env);
    const p = normalizePlayer(doc.data, now, todaySyria(now), cfg);
    if (p.suspended === true && !opts.allowSuspended) throw new ApiError("account_suspended", "حسابك معلّق بسبب عدم النشاط. تواصل معنا على تلغرام عشان نفكّ التعليق.", 403);
    settle(p, now);
    const extra = (await fn(p, now)) || {};
    p.updatedAt = now;
    const writes = [{
      update: { name: docName(env, path), fields: objToFields(p) },
      currentDocument: doc.exists ? { updateTime: doc.updateTime } : { exists: false },
    }, ...(extra.writes || [])];
    try {
      await fsCommit(env, writes);
      if (extra.after) await extra.after();
      return { p, now, result: extra.result };
    } catch (e) {
      if (e.conflict && attempt < 3) continue;
      throw e;
    }
  }
  throw new ApiError("busy", "السيرفر مشغول، جرّب كمان مرة.", 503);
}

// ===== إشعارات السيرفر (Firebase Cloud Messaging) =====
const PUSH_TEXT = {
  offerwall: {
    ar: (p) => ["وصلتك نقاط! 🎉", `انضافلك ${p.points} نقطة من جدار المهام.`],
    tr: (p) => ["Puan kazandın! 🎉", `Görev duvarından ${p.points} puan eklendi.`],
    en: (p) => ["You got points! 🎉", `${p.points} points were added from the offerwall.`],
  },
  withdraw_ok: {
    ar: (p) => p.method === "shamcash" ? ["تم تحويل سحبك ✅", `انحوّل لك ${p.amount} ${p.currency === "SYP" ? "ل.س" : "$"} على شام كاش.`] : ["تم إرسال سحبك ✅", `انبعت ${p.amount} ${p.coin} لمحفظتك.`],
    tr: (p) => p.method === "shamcash" ? ["Çekimin gönderildi ✅", `${p.amount} ${p.currency === "SYP" ? "SYP" : "USD"} Sham Cash hesabına gönderildi.`] : ["Çekimin gönderildi ✅", `${p.amount} ${p.coin} cüzdanına gönderildi.`],
    en: (p) => p.method === "shamcash" ? ["Withdrawal sent ✅", `${p.amount} ${p.currency === "SYP" ? "SYP" : "USD"} was sent to your Sham Cash account.`] : ["Withdrawal sent ✅", `${p.amount} ${p.coin} was sent to your wallet.`],
  },
  withdraw_rejected: {
    ar: () => ["طلب السحب انرفض", "رجعنالك الرصيد لمحفظتك بالتطبيق."],
    tr: () => ["Çekim talebin reddedildi", "Bakiye uygulamadaki cüzdanına iade edildi."],
    en: () => ["Withdrawal rejected", "The balance was returned to your in-app wallet."],
  },
  topup: {
    ar: (p) => ["وصلتك شحنتك 📬", `${p.points} نقطة بانتظارك بصندوق البريد.`],
    tr: (p) => ["Yüklemen geldi 📬", `${p.points} puan Posta kutunda seni bekliyor.`],
    en: (p) => ["Your top-up arrived 📬", `${p.points} points are waiting in your Mail box.`],
  },
  topup_rejected: {
    ar: () => ["طلب الشحن انرفض", "ما قدرنا نأكد التحويل. تواصل معنا إذا في غلط."],
    tr: () => ["Yükleme talebin reddedildi", "Transferi doğrulayamadık. Bir hata olduğunu düşünüyorsan bize ulaş."],
    en: () => ["Top-up request rejected", "We couldn't verify the transfer. Contact us if you think this is a mistake."],
  },
  referral: {
    ar: (p) => ["صاحبك صار لاعب نشط! 🤝", `انضافلك ${p.points} نقطة مكافأة الدعوة.`],
    tr: (p) => ["Arkadaşın aktif oyuncu oldu! 🤝", `Davet ödülü olarak ${p.points} puan eklendi.`],
    en: (p) => ["Your friend is now an active player! 🤝", `${p.points} referral reward points were added.`],
  },
};
for (const t of ["withdraw_ok", "withdraw_rejected"]) for (const l of ["ar", "tr", "en"]) { const f = PUSH_TEXT[t][l]; PUSH_TEXT[t][l] = (p) => { const r = f(p); return p.code ? [r[0], r[1] + "\n" + ({ ar: "رقم الطلب", tr: "Talep no", en: "Request no" })[l] + ": " + p.code] : r; }; }
PUSH_TEXT.store_proof = {       // للأدمن: زبون أرسل دفع
  ar: (p) => ["📦 دفع جديد بانتظارك", `${p.code} · ${p.item} · ${p.amount}${p.late ? " · ⚠️ متأخر" : ""}`],
  tr: (p) => ["📦 Yeni ödeme seni bekliyor", `${p.code} · ${p.item} · ${p.amount}${p.late ? " · ⚠️ geç" : ""}`],
  en: (p) => ["📦 New payment waiting for you", `${p.code} · ${p.item} · ${p.amount}${p.late ? " · ⚠️ late" : ""}`],
};
PUSH_TEXT.store_done = {
  ar: (p) => ["تم تنفيذ طلبك ✅", `طلبك ${p.code} (${p.item}) تنفّذ. تأكد من حسابك باللعبة.`],
  tr: (p) => ["Siparişin tamamlandı ✅", `${p.code} (${p.item}) siparişin tamamlandı. Oyun hesabını kontrol et.`],
  en: (p) => ["Your order is done ✅", `Your order ${p.code} (${p.item}) is complete. Check your game account.`],
};
PUSH_TEXT.store_topup_done = {
  ar: (p) => ["تم شحن رصيدك ✅", `${p.code}: انضاف $${p.amount} لرصيدك.`],
  tr: (p) => ["Bakiyen yüklendi ✅", `${p.code}: bakiyene $${p.amount} eklendi.`],
  en: (p) => ["Your balance was topped up ✅", `${p.code}: $${p.amount} was added to your balance.`],
};
PUSH_TEXT.store_refund_request = {       // للأدمن: زبون طلب يسحب رصيده ويحذف حسابه
  ar: (p) => ["💸 طلب سحب رصيد جديد", `${p.code} · $${p.amount} · ${p.method}`],
  tr: (p) => ["💸 Yeni bakiye çekme talebi", `${p.code} · $${p.amount} · ${p.method}`],
  en: (p) => ["💸 New balance withdrawal request", `${p.code} · $${p.amount} · ${p.method}`],
};
PUSH_TEXT.store_supplier_issue = {        // للأدمن: التنفيذ التلقائي يحتاج تدخلك، أو مشكلة باشتراك/رصيد FazerCards
  ar: (p) => ["⚠️ FazerCards: يحتاج تدخل", `${p.code} · ${p.reason}`],
  tr: (p) => ["⚠️ FazerCards: müdahale gerekli", `${p.code} · ${p.reason}`],
  en: (p) => ["⚠️ FazerCards: needs attention", `${p.code} · ${p.reason}`],
};
PUSH_TEXT.store_payout_done = {
  ar: (p) => ["تم إرسال رصيدك ✅", `${p.code}: أُرسل $${p.amount} وتم حذف حسابك بالمتجر.`],
  tr: (p) => ["Bakiyen gönderildi ✅", `${p.code}: $${p.amount} gönderildi ve mağaza hesabın silindi.`],
  en: (p) => ["Your balance was sent ✅", `${p.code}: $${p.amount} was sent and your store account was deleted.`],
};
PUSH_TEXT.store_rejected = {
  ar: (p) => ["طلبك انرفض", `${p.code} (${p.item}): ${p.reason}`],
  tr: (p) => ["Siparişin reddedildi", `${p.code} (${p.item}): ${p.reason}`],
  en: (p) => ["Your order was declined", `${p.code} (${p.item}): ${p.reason}`],
};
PUSH_TEXT.store_refunded = {
  ar: (p) => ["تم استرجاع طلبك", `طلبك ${p.code} (${p.item}) انسترجع.${p.note ? " " + p.note : ""}`],
  tr: (p) => ["Siparişin iade edildi", `${p.code} (${p.item}) siparişin iade edildi.${p.note ? " " + p.note : ""}`],
  en: (p) => ["Your order was refunded", `Your order ${p.code} (${p.item}) was refunded.${p.note ? " " + p.note : ""}`],
};
PUSH_TEXT.inactive_remind = {
  ar: (p) => ["اشتقنالك! 👋", `صرلك ${p.days} يوم ما فتحت Yardova. ارجع وكمّل لعبك.`],
  tr: (p) => ["Seni özledik! 👋", `${p.days} gündür Yardova'yı açmadın. Dön ve oynamaya devam et.`],
  en: (p) => ["We miss you! 👋", `You haven't opened Yardova for ${p.days} days. Come back and keep playing.`],
};
PUSH_TEXT.inactive_warn = {
  ar: (p) => ["تنبيه: حسابك غير نشط", p.counted ? `إذا ما رجعت خلال ${p.left} يوم، رح نعلّق حسابك (بيضل محفوظ ورصيدك آمن).` : `إذا ما رجعت خلال ${p.left} يوم، رح ينحذف حسابك.`],
  tr: (p) => ["Uyarı: hesabın etkin değil", p.counted ? `${p.left} gün içinde dönmezsen hesabını askıya alacağız (saklı kalır, bakiyen güvende).` : `${p.left} gün içinde dönmezsen hesabın silinecek.`],
  en: (p) => ["Heads-up: your account is inactive", p.counted ? `If you don't come back within ${p.left} days, we'll suspend your account (it stays saved and your balance is safe).` : `If you don't come back within ${p.left} days, your account will be deleted.`],
};
PUSH_TEXT.inactive_suspend = {
  ar: () => ["تم تعليق حسابك", "بسبب عدم النشاط. تواصل معنا على تلغرام لفكّ التعليق."],
  tr: () => ["Hesabın askıya alındı", "Etkinlik olmadığı için. Askıyı kaldırmak için bizimle Telegram'da iletişime geç."],
  en: () => ["Your account was suspended", "Due to inactivity. Contact us on Telegram to lift the suspension."],
};
PUSH_TEXT.shop_done = {
  ar: (p) => ["تم تنفيذ طلبك ✅", `تم تنفيذ طلب «${p.item}». شوف بريدك داخل اللعبة.`],
  tr: (p) => ["Siparişin tamamlandı ✅", `«${p.item}» siparişin tamamlandı. Oyun içi postana bak.`],
  en: (p) => ["Your order is done ✅", `Your order “${p.item}” is complete. Check your in-game mail.`],
};
PUSH_TEXT.shop_rejected = {
  ar: (p) => ["انرفض طلبك", `رجعنالك ${p.points} نقطة. شوف بريدك داخل اللعبة.`],
  tr: (p) => ["Siparişin reddedildi", `${p.points} puan iade edildi. Oyun içi postana bak.`],
  en: (p) => ["Your order was declined", `${p.points} points were refunded. Check your in-game mail.`],
};
// نوع الإشعار ← مفتاح الإعداد يلي بيقدر المستخدم يطفيه من التطبيق
const PUSH_PREF = { offerwall: "offerwall", withdraw_ok: "orders", withdraw_rejected: "orders", topup: "orders", topup_rejected: "orders", referral: "offerwall", shop_done: "orders", shop_rejected: "orders", store_proof: "orders", store_supplier_issue: "orders", store_refund_request: "orders", store_payout_done: "orders", store_topup_done: "orders", store_done: "orders", store_rejected: "orders", store_refunded: "orders", inactive_remind: "news", inactive_warn: "news", inactive_suspend: "news" };

async function sendPush(env, uid, type, params) {
  try {
    const doc = await fsGetDoc(env, "pushTokens/" + uid);
    if (!doc.exists || !doc.data.token) return;
    const prefs = doc.data.prefs || {};
    if (prefs[PUSH_PREF[type]] === false) return;
    const lang = ["ar", "tr", "en"].includes(doc.data.lang) ? doc.data.lang : "ar";
    const [title, body] = PUSH_TEXT[type][lang](params || {});
    const token = await getGoogleAccessToken(env);
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId(env)}/messages:send`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ message: {
        token: doc.data.token,
        notification: { title, body },
        data: { type },
        android: { priority: "high", notification: { icon: "ic_stat_notify", color: "#E3A83B" } },
      } }),
    });
    if (!r.ok) console.warn({ message: "push failed", uid, type, status: r.status, body: await r.text() });
  } catch (e) {
    console.warn({ message: "push error", uid, type, error: String(e.message || e) });
  }
}

// ===== عمليات اللعبة =====
async function gameAction(action, body, user, env) {
  const uid = user.sub;
  const cfg = await loadConfig(env);

  switch (action) {
    case "state": {
      // نقاط جدار المهام المعلّقة من النظام القديم (لو في) بتنضاف مرة وحدة
      const key = "pending:" + uid;
      const raw = await env.PENDING_CREDITS.get(key);
      const pending = raw ? JSON.parse(raw) : [];
      // نقاط النظام القديم: بتنضاف مرة وحدة بس بفضل مستند pendingClaims بنفس الـcommit (KV مو قفل)
      const claimPath = raw ? "pendingClaims/" + (await sha256Hex(uid + "|" + raw)).slice(0, 40) : null;
      return mutatePlayer(env, uid, async (p, now) => {
        let total = 0;
        const claimWrites = [];
        if (claimPath && !(await fsGetDoc(env, claimPath)).exists) {
          total = pending.reduce((sum, c) => { const n = Number(c.reward); return sum + (Number.isFinite(n) && n > 0 ? n : 0); }, 0);
          claimWrites.push({ update: { name: docName(env, claimPath), fields: objToFields({ uid, amount: total, type: "legacy_pending", createdAt: now }) }, currentDocument: { exists: false } });
        }
        if (total > 0) { p.points += total; p.totalPointsEarned += total; p.earnedActive = true; }
        const today = todaySyria(now);
        if (p.lastActiveDate !== today) p.activeDays += 1;
        p.lastActiveDate = today;
        if (p.inactivityStage) { p.inactivityStage = ""; p.inactivityWarnedAt = 0; p.inactivityRemindedAt = 0; }   // رجع للعبة: بنلغي تحذيرات عدم النشاط
        if (user.email && p.email !== user.email) p.email = String(user.email).slice(0, 120);
        if (user.name && p.displayName !== user.name) p.displayName = String(user.name).slice(0, 80);
  else if (!user.name && user.tgName && !p.displayName) p.displayName = String(user.tgName).slice(0, 80);
        const writes = [statsWrite(env, today, { opens: 1 }, { uids: [uid], newUids: p.firstSeenDate === today ? [uid] : [] }), ...claimWrites];
        if (!p.referralCode) {
          // كود دعوة فريد: مستند referralCodes/{الكود} لازم يكون جديد، ولو صار تكرار بتنعاد المحاولة بكود تاني
          p.referralCode = newRefCode();
          writes.push({ update: { name: docName(env, "referralCodes/" + p.referralCode), fields: objToFields({ uid, createdAt: now }) }, currentDocument: { exists: false } });
        }
        const refWrites = referralRewardWrites(env, cfg, p, today);
        writes.push(...refWrites);
        return {
          writes,
          result: { credited: total },
          after: async () => {
            if (pending.length) await env.PENDING_CREDITS.delete(key).catch(() => {}); // تنظيف بس، الحماية بـ Firestore
            if (refWrites.length) await sendPush(env, p.referredBy, "referral", { points: referralCfg(cfg).inviterReward });
          },
        };
      });
    }

    case "unlockShelf": {
      const id = Number(body.shelfId);
      return mutatePlayer(env, uid, (p) => {
        const s = p.shelves[id];
        if (!s) throw new ApiError("bad_shelf", "رف غير موجود.");
        if (s.unlocked) throw new ApiError("already_unlocked", "هذا الرف مفتوح أصلاً.");
        const cost = shelfCost(cfg, id);
        if (p.points < cost) throw new ApiError("not_enough_points", "نقاط غير كافية لفتح هذا الرف.");
        p.points -= cost;
        s.unlocked = true;
      });
    }

    case "rent": {
      const id = Number(body.shelfId);
      const kind = body.kind; // العملة ما عادت جزء من العامل (النسخ القديمة ممكن تبعتها، منتجاهلها)
      if (typeof kind !== "string" || !Object.hasOwn(DURATIONS, kind)) throw new ApiError("bad_worker", "نوع عامل غير صحيح.");
      return mutatePlayer(env, uid, (p, now) => {
        const s = p.shelves[id];
        if (!s || !s.unlocked) throw new ApiError("bad_shelf", "هذا الرف مقفول.");
        if (s.worker && s.worker.expiresAt > now) throw new ApiError("busy_shelf", "هذا العامل شغّال حالياً.");
        const spec = workerSpec(cfg, kind);
        if (p.points < spec.cost) throw new ApiError("not_enough_points", "نقاط غير كافية.");
        p.points -= spec.cost;
        s.worker = { kind, unit: "usd", rate: spec.rateUsd, startAt: now, expiresAt: now + spec.seconds * 1000 };
        p.workersRented += 1;
        const t = p.tasks.find(x => x.id === "rent1");
        if (t) t.progress = Math.min(t.target || 1, (Number(t.progress) || 0) + 1);
        return { writes: [statsWrite(env, todaySyria(now), { rents: 1 })] };
      });
    }

    case "claimTask": {
      return mutatePlayer(env, uid, (p) => {
        const t = p.tasks.find(x => x.id === body.taskId);
        if (!t) throw new ApiError("bad_task", "مهمة غير موجودة.");
        if (t.claimed) throw new ApiError("already_claimed", "استلمت هالمكافأة من قبل.");
        const done = t.target ? (Number(t.progress) || 0) >= t.target : !!t.done;
        if (!done) throw new ApiError("not_done", "المهمة لسا ما خلصت.");
        t.claimed = true;
        p.points += t.reward;
        p.totalPointsEarned += t.reward;
        p.earnedActive = true;
      });
    }

    case "adReward": {
      return mutatePlayer(env, uid, (p, now) => {
        if (now - p.lastAdAt < AD_MIN_INTERVAL_MS) throw new ApiError("too_fast", "استنى شوي قبل الإعلان الجاي.");
        const ads = adsCfg(cfg);
        if (p.adsToday >= ads.dailyLimit) throw new ApiError("daily_limit", "وصلت للحد اليومي لمكافآت الإعلانات.");
        p.points += ads.rewardPoints;
        p.totalPointsEarned += ads.rewardPoints;
        p.adsWatched += 1;
        p.earnedActive = true;
        p.adsToday += 1;
        p.lastAdAt = now;
        p.boostFrom = now;
        p.boostUntil = now + BOOST_MS;
        const t = p.tasks.find(x => x.id === "watch3");
        if (t) t.progress = Math.min(t.target || 3, (Number(t.progress) || 0) + 1);
        const today = todaySyria(now);
        const refWrites = referralRewardWrites(env, cfg, p, today);
        return {
          writes: [statsWrite(env, today, { ads: 1 }), ...refWrites],
          after: refWrites.length ? () => sendPush(env, p.referredBy, "referral", { points: referralCfg(cfg).inviterReward }) : null,
        };
      });
    }

    case "withdraw": {
      const coin = body.coin;
      const amount = Number(body.amount);
      const address = String(body.address || "").trim();
      if (typeof coin !== "string" || !Object.hasOwn(COIN_NETWORKS, coin)) throw new ApiError("bad_coin", "عملة غير صحيحة.");
      const network = String(body.network || (coin === "shamcash" ? "SHAMCASH" : "")).slice(0, 40);
      if (!COIN_NETWORKS[coin].includes(network)) throw new ApiError("bad_network", "الشبكة ما بتناسب العملة المختارة."); // نفس الخيارات بالتطبيق
      if (!address || address.length > 200) throw new ApiError("bad_address", coin === "shamcash" ? "حط رقم حساب شام كاش." : "حط عنوان محفظة صحيح.");
      if (!Number.isFinite(amount) || !(amount > 0)) throw new ApiError("bad_amount", "حط مبلغ صحيح.");
      const price = coinPriceUsd(cfg, coin);
      if (!(price > 0)) throw new ApiError("no_price", "سعر هالعملة مو مضبوط حالياً، جرّب بعد شوي.");
      const amountUsd = amount * price; // USDT وشام كاش: المبلغ بالدولار نفسه
      return mutatePlayer(env, uid, async (p, now) => {
        if (amountUsd > p.balanceUsd * (1 + 1e-9) + 1e-9) throw new ApiError("not_enough_balance", "المبلغ أكبر من رصيدك المتاح.");
        const pr = cfg.pricing || {};
        const normalMin = pr.minWithdrawUsd > 0 ? pr.minWithdrawUsd : 20;
        let minUsd = normalMin;
        // أول سحب بحد أدنى أقل (تجربة): بيتفتح بعد أيام نشاط وعدد إعلانات معيّن، والسحبات اللي بعدها بالحد العادي
        const firstMin = Number(pr.firstWithdrawUsd) || 0;
        if (firstMin > 0 && firstMin < normalMin && !(p.lastWithdrawAt > 0)) {
          const needDays = Number(pr.firstWithdrawDays) || 0, needAds = Number(pr.firstWithdrawAds) || 0;
          if (p.activeDays >= needDays && p.adsWatched >= needAds) minUsd = firstMin;
          else if (amountUsd < normalMin) throw new ApiError("first_locked", `أول سحب بـ${firstMin}$ بيتفتح بعد ${needDays} أيام نشاط و${needAds} إعلان (عندك ${p.activeDays} يوم و${p.adsWatched} إعلان). قبل هيك الحد الأدنى ${normalMin}$.`);
        }
        if (amountUsd < minUsd) throw new ApiError("below_min", `الحد الأدنى للسحب ${minUsd}$.`);
        // سقف الصرف اليومي بينطبق بس على السحبات المخفّضة (أقل من الحد العادي)، عشان ما نعلّق السحبات العادية
        const reduced = amountUsd < normalMin - 1e-9;
        const cap = Number(pr.dailyPayoutCapUsd) || 0;
        if (cap > 0 && reduced) {
          const day = await fsGetDoc(env, "analytics/" + todaySyria(now));
          const used = Number(day.exists && day.data ? day.data.reducedWithdrawUsd : 0) || 0;
          if (used + amountUsd > cap + 1e-9) throw new ApiError("daily_cap", "خلص سقف سحب اليوم للسحبات الصغيرة، جرّب بكرا.");
        }
        if (now - p.lastWithdrawAt < WITHDRAW_COOLDOWN_MS) {
          const h = Math.ceil((WITHDRAW_COOLDOWN_MS - (now - p.lastWithdrawAt)) / 3600000);
          throw new ApiError("cooldown", `تقدر تسحب مرة كل 24 ساعة بس — جرّب بعد حوالي ${h} ساعة.`);
        }
        p.balanceUsd = Math.max(0, p.balanceUsd - amountUsd);
        p.lastWithdrawAt = now;
        p.withdrawCount = (Number(p.withdrawCount) || 0) + 1;
        const request = {
          uid, displayName: user.name || "", email: user.email || "",
          coin, network, amount, amountUsd, priceUsd: price, walletAddress: address,
          totalPointsEarnedSnapshot: p.totalPointsEarned,
          workersRentedSnapshot: p.workersRented,
          adsWatchedSnapshot: p.adsWatched,
          status: "pending", createdAt: now,
        };
        // هل نفس المحفظة استُخدمت بحساب تاني؟ (علامة للأدمن بس)
        const wKey = await walletKey(address);
        const widx = await fsGetDoc(env, "walletIndex/" + wKey);
        const others = widx.exists && widx.data && Array.isArray(widx.data.uids) ? widx.data.uids.filter(u => u && u !== uid).slice(0, 5) : [];
        if (others.length) { request.walletShared = true; request.walletOtherUids = others; }
        const ctr = await nextRequestNo(env, "withdraw");
        request.reqNo = ctr.no; request.reqCode = "W-" + ctr.no;
        return {
          result: { reqCode: request.reqCode },
          after: () => notifyRequestReceived(env, uid, { kind: "withdraw", code: request.reqCode, label: coin === "shamcash" ? `${amountUsd.toFixed(2)}$ (شام كاش)` : `${amount} ${String(coin).toUpperCase()}${network ? " (" + network + ")" : ""}` }),
          writes: [ctr.write, {
            update: { name: docName(env, "withdrawRequests/" + randomId()), fields: objToFields(request) },
            currentDocument: { exists: false },
          }, { update: { name: docName(env, "walletIndex/" + wKey), fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: "uids", appendMissingElements: { values: [{ stringValue: uid }] } }] }, statsWrite(env, todaySyria(now), { withdraws: 1, withdrawUsd: Math.round(amountUsd * 100) / 100, ...(reduced ? { reducedWithdrawUsd: Math.round(amountUsd * 100) / 100 } : {}) })],
        };
      });
    }

    case "redeem": {
      const code = String(body.code || "").trim().toUpperCase();
      const mailId = body.mailId ? String(body.mailId) : null;
      if (!code || code.length > 64 || code.includes("/")) throw new ApiError("bad_code", "اكتب الكود أول.");
      if (mailId && (mailId.length > 128 || mailId.includes("/"))) throw new ApiError("bad_mail", "رسالة غير صحيحة.");
      return mutatePlayer(env, uid, async (p, now) => {
        const codeDoc = await fsGetDoc(env, "redeemCodes/" + code);
        if (!codeDoc.exists) throw new ApiError("code_not_found", "هذا الكود غير موجود.");
        if (codeDoc.data.used) throw new ApiError("code_used", "هذا الكود مستخدم من قبل.");
        const award = Number(codeDoc.data.points) || 0;
        if (award <= 0) throw new ApiError("bad_code", "هذا الكود غير صالح.");
        const writes = [{
          update: { name: docName(env, "redeemCodes/" + code), fields: objToFields({ used: true, usedBy: uid, usedAt: now }) },
          updateMask: { fieldPaths: ["used", "usedBy", "usedAt"] },
          currentDocument: { updateTime: codeDoc.updateTime },
        }];
        if (mailId) {
          const mail = await fsGetDoc(env, "mail/" + mailId);
          if (!mail.exists || mail.data.uid !== uid) throw new ApiError("bad_mail", "رسالة غير صحيحة.");
          writes.push({
            update: { name: docName(env, "mail/" + mailId), fields: objToFields({ claimed: true, read: true, claimedAt: now }) },
            updateMask: { fieldPaths: ["claimed", "read", "claimedAt"] },
            currentDocument: { updateTime: mail.updateTime },
          });
        }
        p.points += award;
        p.totalPointsEarned += award;
        p.earnedActive = true;
        return { writes, result: { awarded: award } };
      });
    }

    case "shopOrder": {
      const item = shopItemsFrom(cfg).find(x => x.id === String(body.itemId || ""));
      if (!item || !item.enabled) throw new ApiError("shop_item", "هذا العنصر مو متوفر حالياً.", 404);
      const sent = body.fields && typeof body.fields === "object" ? body.fields : {};
      const values = item.fields.map(f => ({ key: f.key, label: f.label, value: validateShopField(f, sent[f.key]) }));
      const reqId = validId(String(body.reqId || ""), 64) || randomId();
      const orderId = (await sha256Hex(uid + "|" + reqId)).slice(0, 32);
      const st = shopSettings(cfg);
      return mutatePlayer(env, uid, async (p, now) => {
        if ((await fsGetDoc(env, "shopOrders/" + orderId)).exists) throw new ApiError("duplicate_order", "طلبك انبعت قبل، ما لازم تبعته مرة تانية.", 409);
        if (p.activeDays < st.minActiveDays) throw new ApiError("shop_locked", `هالخدمة بتتفتح بعد ${st.minActiveDays} أيام نشاط (عندك ${p.activeDays}).`);
        if (p.points < item.pricePoints) throw new ApiError("not_enough_points", "نقاط غير كافية.");
        const mine = await fsRunQuery(env, "shopOrders", null, 50, 0, { field: "uid", value: uid });
        if (mine.filter(o => o.data.status === "pending").length >= st.maxPending) throw new ApiError("too_many_pending", `عندك ${st.maxPending} طلبات قيد التنفيذ، استنى لتخلص قبل ما تطلب غيرها.`);
        // سقف أسبوعي (آخر 7 أيام؛ الطلبات المرفوضة ما بتنحسب لأنه نقاطها رجعت)
        const WEEK = 7 * 86400000, recent = mine.filter(o => o.data.status !== "rejected" && Number(o.data.createdAt) >= now - WEEK);
        if (st.maxPerWeek > 0 && recent.length >= st.maxPerWeek) {
          const days = Math.max(1, Math.ceil((Math.min(...recent.map(o => Number(o.data.createdAt))) + WEEK - now) / 86400000));
          throw new ApiError("weekly_cap", `وصلت لحد الطلبات الأسبوعي (${st.maxPerWeek}). تقدر تطلب كمان بعد حوالي ${days} يوم.`);
        }
        p.points -= item.pricePoints;
        const order = {
          uid, displayName: user.name || "", email: user.email || "",
          itemId: item.id, itemName: item.name, itemNameTr: item.name_tr || "", itemNameEn: item.name_en || "",
          pricePoints: item.pricePoints, fields: values, status: "pending", createdAt: now,
          snapshot: { activeDays: p.activeDays, adsWatched: p.adsWatched, totalPointsEarned: p.totalPointsEarned, workersRented: p.workersRented, withdrawCount: Number(p.withdrawCount) || 0, pointsAfter: p.points },
        };
        const ctr = await nextRequestNo(env, "shop");
        order.reqNo = ctr.no; order.reqCode = "S-" + ctr.no;
        return {
          writes: [
            ctr.write,
            { update: { name: docName(env, "shopOrders/" + orderId), fields: objToFields(order) }, currentDocument: { exists: false } },
            statsWrite(env, todaySyria(now), { shopOrders: 1, shopPoints: item.pricePoints }),
          ],
          result: { orderId, pricePoints: item.pricePoints, reqCode: order.reqCode },
          after: () => notifyRequestReceived(env, uid, { kind: "shop", code: order.reqCode, names: { ar: item.name, tr: item.name_tr || item.name, en: item.name_en || item.name } }),
        };
      });
    }

    case "inboxRead":
      return mutatePlayer(env, uid, (p, now) => { p.inboxReadAt = now; });

    case "registerPush": {
      const token = String(body.token || "");
      if (!token || token.length > 4096) throw new ApiError("bad_token", "رمز إشعارات غير صالح.");
      const lang = ["ar", "tr", "en"].includes(body.lang) ? body.lang : "ar";
      const prefs = { offerwall: body.prefs?.offerwall !== false, orders: body.prefs?.orders !== false, news: body.prefs?.news !== false };
      await fsCommit(env, [{
        update: { name: docName(env, "pushTokens/" + uid), fields: objToFields({ token, lang, prefs, updatedAt: Date.now() }) },
      }]);
      return mutatePlayer(env, uid, () => {});
    }

    case "claimDaily": {
      return mutatePlayer(env, uid, (p, now) => {
        const today = todaySyria(now);
        if (p.lastDailyClaim === today) throw new ApiError("daily_claimed", "استلمت مكافأة اليوم، ارجع بكرا!");
        const yesterday = todaySyria(now - 86400000);
        p.dailyStreak = p.lastDailyClaim === yesterday ? (p.dailyStreak % 7) + 1 : 1;
        p.lastDailyClaim = today;
        const reward = dailyRewards(cfg)[p.dailyStreak - 1];
        p.points += reward;
        p.totalPointsEarned += reward;
        return { writes: [statsWrite(env, today, { dailyClaims: 1 })], result: { reward, streak: p.dailyStreak } };
      });
    }

    case "applyReferral": {
      const code = String(body.code || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(code)) throw new ApiError("bad_ref_code", "كود الدعوة غير صحيح.");
      const codeDoc = await fsGetDoc(env, "referralCodes/" + code);
      if (!codeDoc.exists) throw new ApiError("ref_not_found", "كود الدعوة غير موجود.");
      const inviter = codeDoc.data.uid;
      if (inviter === uid) throw new ApiError("ref_self", "ما فيك تستخدم كودك إنت.");
      const r = referralCfg(cfg);
      return mutatePlayer(env, uid, (p, now) => {
        if (p.referredBy) throw new ApiError("ref_already", "استخدمت كود دعوة من قبل.");
        if (!(p.firstSeenAt > 0 && now - p.firstSeenAt < r.windowHours * 3600000)) throw new ApiError("ref_expired", "كود الدعوة بينكتب بس بأول يومين من التسجيل.");
        p.referredBy = inviter;
        p.referredAt = now;
        p.points += r.inviteeBonus;
        p.totalPointsEarned += r.inviteeBonus;
        const today = todaySyria(now);
        return {
          writes: [
            creditWrite(env, inviter, 0, { referralCount: 1 }),
            statsWrite(env, today, { referrals: 1 }),
            ...referralRewardWrites(env, cfg, p, today),
          ],
          result: { bonus: r.inviteeBonus },
        };
      });
    }

    default:
      throw new ApiError("not_found", "عملية غير معروفة.", 404);
  }
}

// ===== بريد اللاعب: رسائل الأدمن (للكل بمستند وحيد، والفردية بمستند لكل لاعب) =====
const INBOX_MAX = 20;
async function appendInbox(env, docPath, item) {
  const cur = await fsGetDoc(env, docPath);
  const items = cur.exists && Array.isArray(cur.data.items) ? cur.data.items : [];
  await fsCommit(env, [{ update: { name: docName(env, docPath), fields: objToFields({ items: [item, ...items].slice(0, INBOX_MAX), updatedAt: Date.now() }) } }]);
}
async function handleInbox(request, env) {
  try {
    const user = await requireUser(request);
    let body = {}; try { body = await request.json(); } catch (e) {}
    const lang = ["ar", "tr", "en"].includes(body.lang) ? body.lang : "ar";
    const [me, bc, mine] = await Promise.all([fsGetDoc(env, "players/" + user.sub), fsGetDoc(env, "config/broadcasts"), fsGetDoc(env, "inbox/" + user.sub)]);
    const readAt = me.exists ? (Number(me.data.inboxReadAt) || 0) : Date.now();
    const raw = [...(bc.exists && Array.isArray(bc.data.items) ? bc.data.items : []), ...(mine.exists && Array.isArray(mine.data.items) ? mine.data.items : [])];
    const messages = raw.map(m => ({ id: String(m.id || ""), title: String(m["title_" + lang] || m.title || ""), body: String(m["body_" + lang] || m.body || ""), createdAt: Number(m.createdAt) || 0 }))
      .filter(m => m.title || m.body).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
    return jsonResponse({ ok: true, inbox: { messages, unread: messages.filter(m => m.createdAt > readAt).length, readAt } }, 200);
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    console.error({ message: "inbox error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error", message: "صار خطأ بالسيرفر، جرّب بعد شوي." }, 500);
  }
}

async function handleGame(request, env, action) {
  if (action === "inbox") return handleInbox(request, env);
  if (action === "shop") return handleShopList(request, env);
  if (action === "deleteAccount") return handleDeleteAccount(request, env);
  try {
    const user = await requireUser(request);
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const { p, now, result } = await gameAction(action, body, user, env);
    return jsonResponse({ ok: true, state: publicState(p, now, await loadConfig(env)), result: result || null }, 200);
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    console.error({ message: "game error", action, error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error", message: "صار خطأ بالسيرفر، جرّب بعد شوي." }, 500);
  }
}

// ===== جدار المهام: رابط موقّع + postback =====
async function handleSign(request, env) {
  const user = await verifyFirebaseToken((request.headers.get("Authorization") || "").replace("Bearer ", "")).catch(() => null);
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);
  const uid = user.sub;
  const expires = String(Math.floor(Date.now() / 1000) + 3600);
  const msg = "offerwall-user-v1\n" + OFFERWALL_PUBLIC_KEY + "\n" + uid + "\n" + expires;
  const sig = await hmacHex(env.OFFERWALL_SECRET, msg);
  const url = "https://offerwall.me/offerwall/" + encodeURIComponent(OFFERWALL_PUBLIC_KEY) + "/" + encodeURIComponent(uid) +
    "?identityExpires=" + expires + "&identitySignature=" + sig;
  return jsonResponse({ url }, 200);
}

// ===== جدران المهام: تسجيل دائم لكل عملية بـ Firestore (offerTx) =====
// مهم: KV مو قفل مالي (ممكن طلبين بنفس اللحظة يمرقوا الاثنين). الحماية الحقيقية هون:
// مستند offerTx/{المزوّد_بصمة_رقم_العملية} بينكتب بنفس الـcommit يلي بيضيف النقاط، بشرط إنه ما يكون موجود.
// إذا وصل نفس الطلب مرتين، الـcommit التاني بيفشل كله (ولا نقطة بتنضاف) → بنعتبره مكرر.
// والسحب العكسي بيخصم المبلغ الأصلي المسجّل عندنا، مو المبلغ يلي بيبعته المزوّد بلحظتها.
const MAX_OFFER_REWARD = 100000; // أقصى نقاط لعرض واحد (~166$ على سعر 600 نقطة = 1$)
function validReward(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= MAX_OFFER_REWARD ? n : null;
}
function validId(v, max = 128) {
  return typeof v === "string" && v.length > 0 && v.length <= max && !v.includes("/") ? v : null;
}
function safeEqual(a, b) { // مقارنة توقيع بوقت ثابت
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function sha256Hex(str) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}
async function offerTxPath(provider, txId) {
  return "offerTx/" + provider + "_" + (await sha256Hex(txId)).slice(0, 40);
}
function isAlreadyExists(e) {
  return /ALREADY_EXISTS/.test(String(e && e.message)) || (e && e.conflict);
}
// مين الداعي وقديش عمولته (بتنحفظ بسجل العملية لحتى تنعكس بالضبط لو العرض انسحب)
async function commissionInfo(env, uid, amount) {
  try {
    const doc = await fsGetDoc(env, "players/" + uid);
    const inviter = doc.exists && doc.data.referredBy;
    if (!inviter) return { inviter: "", commission: 0 };
    const pct = referralCfg(await loadConfig(env)).commissionPct;
    return { inviter, commission: Math.round(amount * pct) / 100 };
  } catch (e) {
    console.warn({ message: "commission lookup failed", error: String(e.message || e) });
    return { inviter: "", commission: 0 };
  }
}

// إضافة نقاط عرض مرة وحدة بس. بترجع true إذا انضافت، false إذا كانت مكررة.
async function creditOfferOnce(env, provider, txId, uid, amount) {
  const path = await offerTxPath(provider, txId);
  const { inviter, commission } = await commissionInfo(env, uid, amount);
  const writes = [
    {
      update: { name: docName(env, path), fields: objToFields({
        provider, transactionId: txId, uid, originalReward: amount,
        inviter, commission, status: "credited", createdAt: Date.now(),
      }) },
      currentDocument: { exists: false },
    },
    creditWrite(env, uid, amount, {}, { earnedActive: true }),
    statsWrite(env, todaySyria(), { offers: 1, offerPoints: amount }),
  ];
  if (inviter && commission) writes.push(creditWrite(env, inviter, commission, { referralEarnings: commission }));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fsCommit(env, writes);
      return true;
    } catch (e) {
      if (!isAlreadyExists(e)) throw e;
      // تأكد إنه فعلاً مكرر (مو تعارض عابر): إذا السجل موجود → مكرر، وإلا منعيد المحاولة
      if ((await fsGetDoc(env, path)).exists) return false;
    }
  }
  throw new Error("offer credit busy");
}

// سحب عكسي: بيخصم المبلغ الأصلي المسجّل مرة وحدة بس (مع عمولة الداعي).
// الرصيد ممكن يصير بالسالب عن قصد: إذا الغشاش صرف النقاط قبل السحب، ما لازم يطلع رابح.
async function reverseOfferOnce(env, provider, txId, uid) {
  const path = await offerTxPath(provider, txId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const doc = await fsGetDoc(env, path);
    if (!doc.exists) return "not_found";
    const t = doc.data;
    if (t.status === "reversed") return "duplicate";
    if (t.uid !== uid) return "uid_mismatch";
    const amt = Number(t.originalReward) || 0;
    const now = Date.now();
    const writes = [
      {
        update: { name: docName(env, path), fields: objToFields({ status: "reversed", reversedAt: now }) },
        updateMask: { fieldPaths: ["status", "reversedAt"] },
        currentDocument: { updateTime: doc.updateTime },
      },
      creditWrite(env, uid, -amt, { reversedPoints: amt }),
      statsWrite(env, todaySyria(), { reversals: 1, offerPoints: -amt }),
    ];
    const c = Number(t.commission) || 0;
    if (t.inviter && c) writes.push(creditWrite(env, t.inviter, -c, { referralEarnings: -c }));
    try {
      await fsCommit(env, writes);
      return "reversed";
    } catch (e) {
      if (e.conflict && attempt < 3) continue;
      throw e;
    }
  }
  return "busy";
}

// ===== جدار المهام الأول: Offerwall.me (توقيع MD5 حسب مواصفاتهم الرسمية) =====
async function handlePostback(request, env, ctx) {
  const params = new URLSearchParams(await request.text());
  const subId = validId(params.get("subId") || "");
  const transId = validId(params.get("transId") || "", 200);
  const reward = params.get("reward") || "";
  const status = params.get("status") || "";
  const signature = (params.get("signature") || "").toLowerCase();
  if (!subId || !transId || !signature) return new Response("Missing fields", { status: 400 });
  const expectedSig = await md5Hex(subId + transId + reward + env.OFFERWALL_SECRET);
  if (!safeEqual(expectedSig, signature)) {
    console.warn({ message: "Offerwall invalid signature" });
    return new Response("Invalid signature", { status: 403 });
  }
  if (status !== "1") return new Response("OK - not approved", { status: 200 });
  const amount = validReward(reward);
  if (!amount) {
    console.warn({ message: "Offerwall invalid reward", reward });
    return new Response("OK - invalid reward", { status: 200 });
  }
  // عمليات قديمة انحسبت قبل نظام offerTx (كانت متسجلة بـ KV)
  if (await env.PENDING_CREDITS.get("done:" + transId)) return new Response("OK - duplicate", { status: 200 });

  const credited = await creditOfferOnce(env, "offerwall", transId, subId, amount);
  console.info({ message: "Offerwall postback", credited, amount });
  if (credited) ctx.waitUntil(sendPush(env, subId, "offerwall", { points: Math.floor(amount) }));
  return new Response(credited ? "OK" : "OK - duplicate", { status: 200 });
}

// ===== جدار المهام التاني: OffersWalls (site.offerswalls.com) =====
// التوقيع: HMAC-SHA256 على الرابط الكامل لحد "&signature=" بالمفتاح السري (Secret: OFFERSWALLS_SECRET)
const OW2_REVERSAL_STATES = ["RECONCILED", "REJECTED", "REVERSED", "CHARGEBACK", "CANCELLED"];
async function handleOffersWallsPostback(request, env, ctx) {
  const raw = request.url;
  const cut = raw.indexOf("&signature=");
  if (cut < 0 || !env.OFFERSWALLS_SECRET) return new Response("missing signature", { status: 403 });
  const params = new URL(raw).searchParams;
  const signature = (params.get("signature") || "").toLowerCase();
  const expected = await hmacHex(env.OFFERSWALLS_SECRET, raw.slice(0, cut));
  if (!safeEqual(signature, expected)) {
    console.warn({ message: "OffersWalls invalid signature" });
    return new Response("invalid signature", { status: 403 });
  }
  const uid = validId(params.get("user_id") || "");
  const tx = validId(params.get("tx") || "", 200);
  const status = (params.get("status") || "").toLowerCase();
  const state = (params.get("offer_state") || "").toUpperCase();
  if (!uid || !tx) return new Response("bad request", { status: 400 });

  const reversal = status === "rejected" || OW2_REVERSAL_STATES.includes(state);
  const approved = !reversal && status === "approved";
  if (!approved && !reversal) return new Response("ok - ignored", { status: 200 });

  if (approved) {
    const amount = validReward(params.get("reward"));
    if (!amount) {
      console.warn({ message: "OffersWalls invalid reward" });
      return new Response("ok - invalid reward", { status: 200 });
    }
    if (await env.PENDING_CREDITS.get("ow2:" + tx + ":ok")) return new Response("duplicate", { status: 200 }); // عملية قديمة
    const credited = await creditOfferOnce(env, "offerswalls", tx, uid, amount);
    console.info({ message: "OffersWalls credit", credited, amount });
    if (credited) ctx.waitUntil(sendPush(env, uid, "offerwall", { points: Math.floor(amount) }));
    return new Response(credited ? "ok" : "duplicate", { status: 200 });
  }

  // سحب عكسي
  let result = await reverseOfferOnce(env, "offerswalls", tx, uid);
  if (result === "not_found") {
    // عملية قديمة انضافت قبل نظام offerTx: منعكسها مرة وحدة (قفل KV هون لأنه ما عنا سجل أصلي)
    const okKey = "ow2:" + tx + ":ok", revKey = "ow2:" + tx + ":rev";
    const amount = validReward(Math.abs(Number(params.get("reward"))));
    if (amount && (await env.PENDING_CREDITS.get(okKey)) && !(await env.PENDING_CREDITS.get(revKey))) {
      // القفل الحقيقي: مستند offerLegacyReversal بنفس الـcommit يلي بيخصم (مرة وحدة بس)
      const markerPath = "offerLegacyReversal/" + (await sha256Hex("offerswalls|" + tx)).slice(0, 40);
      try {
        await fsCommit(env, [
          { update: { name: docName(env, markerPath), fields: objToFields({ uid, amount, createdAt: Date.now() }) }, currentDocument: { exists: false } },
          creditWrite(env, uid, -amount, { reversedPoints: amount }),
          statsWrite(env, todaySyria(), { reversals: 1, offerPoints: -amount }),
        ]);
        result = "reversed_legacy";
        await env.PENDING_CREDITS.put(revKey, "1", { expirationTtl: 60 * 60 * 24 * 180 }).catch(() => {});
      } catch (e) {
        if (!isAlreadyExists(e)) throw e;
        result = "duplicate";
      }
    }
  }
  console.info({ message: "OffersWalls reversal", result });
  return new Response("ok", { status: 200 });
}

// ===== جدار المهام التالت: Wannads =====
// الرابط يلي بنحطه بلوحتهم: https://postback.ly-ad.de/wannads?user_id={user_id}&transaction_id={transaction_id}&reward={reward}&status={status}&signature={signature}
// التوقيع: MD5(user_id + transaction_id + reward + SECRET). الـSECRET هو "Secret" بتفاصيل التطبيق (مو الـAPI Secret) ومحفوظ بـCloudflare باسم WANNADS_SECRET.
// الحالة: "credited" أو 1 = إضافة، "rejected" أو 2 = سحب عكسي (نفس رقم العملية). الرد لازم يكون "OK" بالضبط، وأي رد تاني بيعتبروه فاشل وبيعيدوا الإرسال حتى 5 مرات.
// عنوان IP تبعهم 3.22.177.178: بنسجّل التحذير إذا اختلف، وما بنمنع إلا إذا فعّلنا WANNADS_ENFORCE_IP=1 (التوقيع السري هو الحماية الأساسية).
const WANNADS_IPS = ["3.22.177.178"];
async function handleWannadsPostback(request, env, ctx) {
  if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
  if (!env.WANNADS_SECRET) return new Response("not configured", { status: 503 });
  const params = new URL(request.url).searchParams;
  const uid = validId(params.get("user_id") || "");
  const tx = validId(params.get("transaction_id") || "", 200);
  const rewardRaw = params.get("reward") || "";
  const status = (params.get("status") || "").toLowerCase();
  const signature = (params.get("signature") || "").toLowerCase();
  if (!uid || !tx || !signature) return new Response("Missing fields", { status: 400 });
  const expected = await md5Hex(uid + tx + rewardRaw + env.WANNADS_SECRET);
  if (!safeEqual(expected, signature)) {
    console.warn({ message: "Wannads invalid signature" });
    return new Response("Invalid signature", { status: 403 });
  }
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const allowed = env.WANNADS_IPS ? String(env.WANNADS_IPS).split(",").map(x => x.trim()).filter(Boolean) : WANNADS_IPS;
  if (!allowed.includes(ip)) {
    console.warn({ message: "Wannads postback from unexpected IP", ip });
    if (env.WANNADS_ENFORCE_IP === "1") return new Response("forbidden", { status: 403 });
  }
  const credit = status === "credited" || status === "1";
  const reject = status === "rejected" || status === "2";
  if (!credit && !reject) return new Response("OK", { status: 200 });
  if (credit) {
    const amount = validReward(rewardRaw);
    if (!amount) {
      console.warn({ message: "Wannads invalid reward", reward: rewardRaw });
      return new Response("OK", { status: 200 });          // "OK" عشان ما يعيدوا الإرسال لعملية ما منقدر نقبلها
    }
    const credited = await creditOfferOnce(env, "wannads", tx, uid, amount);
    console.info({ message: "Wannads credit", credited, amount });
    if (credited) ctx.waitUntil(sendPush(env, uid, "offerwall", { points: Math.floor(amount) }));
    return new Response("OK", { status: 200 });
  }
  const result = await reverseOfferOnce(env, "wannads", tx, uid);
  console.info({ message: "Wannads reversal", result });
  if (result === "busy") return new Response("busy", { status: 503 });   // بيعيدوا المحاولة
  return new Response("OK", { status: 200 });
}

// ===== متجر الشدات (الخطوة 1): شجرة مجلدات ومنتجات =====
// storeNodes/{id}: { parentId ("" = الجذر), type: folder|item, name, price (ل.س), enabled, sort, imageVer }، والصورة بمستند لحاله storeImages/{id} (حتى ما تنقل الصور مع كل قراءة).
// الأدمن بيبني الشجرة (/admin/store)، والصفحة العامة بتقرأ الشجرة المفعّلة بس (/store/catalog) والصور (/store/img/{id}).
const STORE_MAX_DEPTH = 4, STORE_MAX_NODES = 300, STORE_IMG_MAX = 280000, STORE_NOTE_MAX = 400;
const STORE_VIP_LEVELS = 10;
function storePricesOf(n) { return Array.isArray(n.prices) ? n.prices.map(Number).filter(x => Number.isFinite(x) && x > 0) : []; }
// أسعار VIP 1..10 بالدولار: VIP 1 لازم يكون موجود، والباقي إذا ترك فاضي بياخد سعر المستوى اللي قبله، والمستوى الأعلى ما بيكون أغلى
function storeParsePrices(raw) {
  if (!Array.isArray(raw)) throw new ApiError("bad_price", "اكتب سعر VIP 1 (السعر الأساسي).");
  const out = [];
  for (let i = 0; i < STORE_VIP_LEVELS; i++) {
    const v = raw[i], blank = v === undefined || v === null || v === "";
    if (blank) { if (i === 0) throw new ApiError("bad_price", "اكتب سعر VIP 1 (السعر الأساسي)."); out.push(out[i - 1]); continue; }
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 1000000) throw new ApiError("bad_price", `سعر VIP ${i + 1} لازم يكون رقم أكبر من 0 بالدولار.`);
    const r = Math.round(n * 10000) / 10000;
    if (i > 0 && r > out[i - 1]) throw new ApiError("bad_vip_order", `سعر VIP ${i + 1} لازم يكون أقل من سعر VIP ${i} أو يساويه.`);
    out.push(r);
  }
  return out;
}
function storeNodeOut(n) {
  return { supplier: n.type === "item" && n.supplier && n.supplier.offerId ? { provider: "fazercards", categoryId: String(n.supplier.categoryId || ""), offerId: String(n.supplier.offerId || ""), playerField: String(n.supplier.playerField || "player_id"), categoryName: String(n.supplier.categoryName || ""), validateCategoryId: String(n.supplier.validateCategoryId || ""), offerName: String(n.supplier.offerName || ""), costUsd: Number(n.supplier.costUsd) || 0 } : null, id: n.id, parentId: String(n.parentId || ""), type: n.type === "item" ? "item" : "folder", name: String(n.name || ""), prices: n.type === "item" ? storePricesOf(n) : [], enabled: n.enabled !== false, sort: Number(n.sort) || 0, hasImage: Number(n.imageVer) > 0, imageUrl: Number(n.imageVer) > 0 ? "/store/img/" + n.id + "?v=" + Number(n.imageVer) : "", note: String(n.note || "") };
}
async function storeAllNodes(env) { return (await fsRunQuery(env, "storeNodes", null, STORE_MAX_NODES + 50, 0)).map(r => ({ id: r.id, ...r.data })); }
function storeSorted(list) { return [...list].sort((a, b) => ((Number(a.sort) || 0) - (Number(b.sort) || 0)) || a.id.localeCompare(b.id)); }
function storeDepth(nodes, id) { const by = new Map(nodes.map(n => [n.id, n])); let d = 0, cur = id; while (cur && d < 12) { d++; const n = by.get(cur); cur = n ? String(n.parentId || "") : ""; } return d; }
function storeTree(nodes) {
  const kids = new Map();
  for (const n of nodes) { if (n.enabled === false) continue; const k = String(n.parentId || ""); if (!kids.has(k)) kids.set(k, []); kids.get(k).push(n); }
  const build = (pid) => storeSorted(kids.get(pid) || []).map(n => {
    const o = storeNodeOut(n); delete o.parentId; delete o.enabled; delete o.sort; delete o.hasImage; delete o.prices; delete o.supplier;
    if (n.type === "item") { const pr = storePricesOf(n); if (!pr.length) return null; o.priceUsd = pr[0]; return o; }      // السعر العام = VIP 1، وأسعار VIP الباقية ما بتنعرض للعامة
    const children = build(n.id); return children.length ? { ...o, children } : null;      // مجلد فاضي ما بينعرض بالصفحة العامة
  }).filter(Boolean);
  return build("");
}
// طرق الدفع: كل طريقة إلها سعر صرف (وحدات من عملتها لكل 1 دولار) + نسبة إضافية اختيارية. بتتغيّر من الأدمن لما السعر يتقلّب، والصفحة العامة بتحسب منه.
async function storeLoadMethods(env) { const d = await fsGetDoc(env, "config/storePayments"); return d.exists && d.data && Array.isArray(d.data.methods) ? d.data.methods : []; }
function storeParseMethods(raw) {
  if (!Array.isArray(raw) || raw.length > 8) throw new ApiError("bad_methods", "الحد الأقصى 8 طرق دفع.");
  const seen = new Set();
  return raw.map((m, i) => {
    m = m || {};
    const name = cleanText(m.name, 30), currency = cleanText(m.currency, 8);
    if (!name) throw new ApiError("bad_method", `طريقة الدفع رقم ${i + 1}: اكتب اسم.`);
    if (!currency) throw new ApiError("bad_method", `"${name}": اكتب رمز العملة (مثلاً ل.س أو USDT).`);
    const rate = Number(m.rate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000000) throw new ApiError("bad_rate", `"${name}": سعر الصرف لازم يكون رقم أكبر من 0.`);
    const decimals = m.decimals === undefined || m.decimals === "" ? 2 : Number(m.decimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) throw new ApiError("bad_method", `"${name}": عدد الخانات العشرية من 0 لـ4.`);
    const feePct = m.feePct === undefined || m.feePct === "" || m.feePct === null ? 0 : Number(m.feePct);
    if (!Number.isFinite(feePct) || feePct < 0 || feePct > 50) throw new ApiError("bad_method", `"${name}": النسبة الإضافية من 0 لـ50.`);
    const instructions = cleanText(m.instructions, 300), account = cleanText(m.account, 120);
    const autoVerify = m.autoVerify === "bep20" || m.autoVerify === "trc20" ? m.autoVerify : "";
    if (autoVerify) {
      if (currency.toUpperCase() !== "USDT") throw new ApiError("bad_method", `"${name}": التحقق التلقائي من البلوكتشين لعملة USDT بس.`);
      if (Math.abs(rate - 1) > 1e-9) throw new ApiError("bad_rate", `"${name}": للتحقق التلقائي سعر الصرف لازم يكون 1 (USDT = 1$).`);
      if (autoVerify === "bep20" && !/^0x[0-9a-fA-F]{40}$/.test(account)) throw new ApiError("bad_method", `"${name}": عنوان BEP20 لازم يبدأ بـ0x ويكون 42 خانة.`);
      if (autoVerify === "trc20" && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(account)) throw new ApiError("bad_method", `"${name}": عنوان TRC20 لازم يبدأ بحرف T ويكون 34 خانة.`);
    }
    let id = typeof m.id === "string" && /^[a-z0-9_-]{1,24}$/.test(m.id) ? m.id : "m" + randomId().slice(0, 8);
    while (seen.has(id)) id = "m" + randomId().slice(0, 8);
    seen.add(id);
    return { id, name, currency, rate: Math.round(rate * 1000000) / 1000000, decimals, feePct: Math.round(feePct * 100) / 100, enabled: m.enabled !== false, instructions, account, autoVerify };
  });
}
async function handleStoreCatalog(env) {
  const tree = storeTree(await storeAllNodes(env));
  const methods = (await storeLoadMethods(env)).filter(m => m.enabled !== false).map(m => ({ id: m.id, name: m.name, currency: m.currency, rate: m.rate, decimals: m.decimals, feePct: m.feePct, auto: !!m.autoVerify }));
  const { cfg: wcfg } = await storeLoadWallet(env);
  const r = jsonResponse({ ok: true, items: tree, methods, wallet: { pointsPerUsd: wcfg.pointsPerUsd } }, 200); r.headers.set("Cache-Control", "public, max-age=60"); return r;
}
// الكتالوج (نفسه لكل الزوار) بينخزّن بكاش Cloudflare دقيقة: ما بيقرا من Firestore إلا مرة بالدقيقة بدل كل زيارة
async function storeCatalogCached(request, env, ctx) {
  if (request.method !== "GET" || typeof caches === "undefined" || !caches.default) return handleStoreCatalog(env);
  const origin = new URL(request.url).origin, key = new Request(origin + "/store/catalog", { method: "GET" }), keyStale = new Request(origin + "/store/catalog?stale=1", { method: "GET" });
  try { const hit = await caches.default.match(key); if (hit) return hit; } catch (e) { /* بنكمّل بدون كاش */ }
  try {
    const res = await handleStoreCatalog(env);
    if (res.status === 200) { try { const stale = new Response(res.clone().body, res); stale.headers.set("Cache-Control", "public, max-age=86400"); const fresh = new Response(res.clone().body, res); fresh.headers.set("Cache-Control", "public, max-age=60, s-maxage=300"); ctx.waitUntil(Promise.all([caches.default.put(key, fresh), caches.default.put(keyStale, stale)]).catch(() => {})); } catch (e) { /* مو مهم */ } }
    return res;
  } catch (e) {
    // قاعدة البيانات واقفة (مثلاً وصلت الحد اليومي): بنعرض آخر كتالوج انحفظ (لحد يوم) ليضل المتجر قابل للتصفّح
    try { const old = await caches.default.match(keyStale); if (old) { const r2 = new Response(old.body, old); r2.headers.set("X-Catalog-Stale", "1"); r2.headers.set("Cache-Control", "no-store"); return r2; } } catch (e2) { /* ولا نسخة قديمة */ }
    return jsonResponse({ ok: false, error: "unavailable", message: "المتجر مشغول مؤقتاً. جرّب بعد شوي." }, 503);
  }
}
async function handleStoreImage(env, id) {
  const d = id ? await fsGetDoc(env, "storeImages/" + id) : { exists: false };
  const m = d.exists && d.data ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(d.data.data || "")) : null;
  if (!m) return new Response("Not found", { status: 404, headers: corsHeaders() });
  const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  return new Response(bin, { status: 200, headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=604800, immutable", "X-Content-Type-Options": "nosniff", ...corsHeaders() } });
}
// ===== تغيير حالة طلب (تنفيذ / رفض مع استرجاع / مرتجع): نفس المنطق للأدمن وللتنفيذ التلقائي (by = "admin" | "auto") =====
async function storeOrderAction(env, action, id, note, by, extra) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const od = await fsGetDoc(env, "storeOrders/" + id);
        if (!od.exists) throw new ApiError("not_found", "هالطلب مو موجود.", 404);
        const o = od.data, now2 = Date.now(), kind = o.kind === "order" || o.kind === "topup" || o.kind === "refund" ? o.kind : "legacy", price = Number(o.priceUsd) || 0;
        const open = o.status === "awaiting_payment" || o.status === "payment_submitted" || o.status === "processing";
        const cd = await fsGetDoc(env, "storeCustomers/" + o.uid), bal = cd.exists ? r4(Number(cd.data.balanceUsd) || 0) : 0, led = [];
        let upd, custUpd = null, plan = null;
        const ledger = (type, amt, newBal) => led.push({ update: { name: docName(env, "storeLedger/" + randomId()), fields: objToFields({ uid: o.uid, type, amountUsd: r4(amt), balanceAfter: newBal, ref: String(o.code || ""), note, at: now2, by }) }, currentDocument: { exists: false } });
        if (action === "order_done") {
          if (!open || (kind === "order" && o.status !== "processing")) throw new ApiError("bad_status", "هالطلب مو مفتوح (الحالة: " + o.status + ").");
          upd = { status: "done", doneAt: now2, adminNote: note, updatedAt: now2, events: storeEvent(o, "done", by, note, now2), ...(extra || {}) };
          if (!cd.exists) throw new ApiError("no_customer", "حساب الزبون مو موجود.", 404);
          if (kind === "refund") { upd.finalizePending = true; }                    // الرصيد انرسل: بعد الحفظ بينحذف الحساب
          else if (kind === "topup") { const nb = r4(bal + price); custUpd = { balanceUsd: nb }; ledger("topup", price, nb); }
          else { plan = storeSpendPlan(env, o.uid, cd.data, price, "طلب " + o.code, "order", now2); custUpd = { ...plan.upd }; }
        } else if (action === "order_reject") {
          if (!open) throw new ApiError("bad_status", "هالطلب مو مفتوح (الحالة: " + o.status + ").");
          upd = { status: "rejected", rejectReason: note, updatedAt: now2, events: storeEvent(o, "rejected", by, note, now2), ...(extra || {}) };
          if (kind === "order") { if (!cd.exists) throw new ApiError("no_customer", "حساب الزبون مو موجود.", 404); const nb = r4(bal + price); custUpd = { balanceUsd: nb }; ledger("order_refund", price, nb); }       // الرفض بيرجّع المبلغ لرصيده
          if (kind === "refund") { if (!cd.exists) throw new ApiError("no_customer", "حساب الزبون مو موجود.", 404); const nb = r4(bal + price); custUpd = { balanceUsd: nb, closing: null }; ledger("payout_return", price, nb); }       // رفض طلب السحب: الرصيد بيرجع وبينفتح الحساب
        } else {
          if (kind === "refund") throw new ApiError("bad_status", "طلب السحب ما بينرجّع.");
          if (o.status !== "done") throw new ApiError("bad_status", "بتقدر ترجّع طلب منفّذ بس.");
          upd = { status: "refunded", adminNote: note, updatedAt: now2, events: storeEvent(o, "refunded", by, note, now2) };
          if (!cd.exists) throw new ApiError("no_customer", "حساب الزبون مو موجود.", 404);
          if (kind === "topup") { if (bal + 1e-9 < price) throw new ApiError("insufficient_balance", "الزبون صرف جزء من هالإيداع (رصيده " + bal + "$)، ما بتقدر ترجّعه كامل. عدّل رصيده يدوياً إذا بدك."); const nb = r4(bal - price); custUpd = { balanceUsd: nb }; ledger("topup_refund", -price, nb); }
          else if (kind === "order") { plan = storeSpendPlan(env, o.uid, cd.data, -price, "مرتجع " + o.code, "order", now2); const nb = r4(bal + price); custUpd = { ...plan.upd, balanceUsd: nb }; ledger("refund", price, nb); }
          else { plan = storeSpendPlan(env, o.uid, cd.data, -price, "مرتجع " + o.code, "order", now2); custUpd = { ...plan.upd }; }
        }
        const writes = [{ update: { name: docName(env, "storeOrders/" + id), fields: objToFields(upd) }, updateMask: { fieldPaths: Object.keys(upd) }, currentDocument: { updateTime: od.updateTime } }];
        if (custUpd) writes.push({ update: { name: docName(env, "storeCustomers/" + o.uid), fields: objToFields(custUpd) }, updateMask: { fieldPaths: Object.keys(custUpd) }, currentDocument: { updateTime: cd.updateTime } });
        if (plan) writes.push(...plan.writes);
        writes.push(...led);
        try {
          await fsCommit(env, writes);
          const np = { code: String(o.code || ""), item: String(o.itemName || "") };
          let warning = "";
          if (action === "order_done" && kind === "refund") {
            await storeNotify(env, o.uid, "store_payout_done", { code: np.code, amount: price.toFixed(2) });
            try { await storeAnonymizeCustomer(env, o.uid, id); upd.finalizePending = false; upd.uid = ""; upd.name = "حساب محذوف"; upd.email = ""; upd.payout = { method: "", account: "" }; }
            catch (e) { console.error({ message: "store deletion incomplete", code: np.code, error: String(e && e.message || e) }); warning = "انبعت الرصيد لكن تعذّر إكمال حذف الحساب. اضغط 🧹 إكمال الحذف."; }
          }
          else if (action === "order_done") await storeNotify(env, o.uid, kind === "topup" ? "store_topup_done" : "store_done", kind === "topup" ? { ...np, amount: price } : np);
          else if (action === "order_reject") await storeNotify(env, o.uid, "store_rejected", { ...np, reason: note });
          else await storeNotify(env, o.uid, "store_refunded", { ...np, note });
          return { warning, order: storeOrderOut(id, { ...o, ...upd }, now2, true) };
        } catch (e) { if (!e.conflict || attempt === 2) throw e; }
      }
  throw new ApiError("conflict", "تعارض لحظي. جرّب كمان مرة.", 409);
}
async function storeCatalogPurge(request) {
  if (typeof caches === "undefined" || !caches.default) return;
  try { await caches.default.delete(new Request(new URL(request.url).origin + "/store/catalog", { method: "GET" })); } catch (e) { /* مو مهم */ }
}
async function handleAdminStore(request, env) {            // غلاف: بعد أي تعديل على الكتالوج بنمسح نسخة الكاش الطازجة (حتى يبين التعديل فوراً)
  let act = ""; try { act = String((await request.clone().json()).action || ""); } catch (e) { /* بدون جسم */ }
  const res = await handleAdminStoreInner(request, env);
  if (res.status === 200 && ["save", "delete", "move", "reorder", "supplier_link", "prices_apply"].includes(act)) await storeCatalogPurge(request);
  return res;
}
async function handleAdminStoreInner(request, env) {
  if (!(await adminOnly(request))) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let b = {}; try { b = await request.json(); } catch (e) {}
  try {
    // الكتالوج (حتى 350 مستند) بيتحمّل بس للإجراءات اللي بتحتاجه. قبل هيك كل إجراء (حتى عدّاد الطلبات كل دقيقة) كان يقراه كله.
    const nodes = ["list", "prices_preview", "prices_apply", "supplier_link", "save", "delete", "move", "reorder"].includes(b.action) ? await storeAllNodes(env) : [];
    const out = (list) => jsonResponse({ ok: true, nodes: storeSorted(list).map(storeNodeOut), max: { depth: STORE_MAX_DEPTH, nodes: STORE_MAX_NODES } }, 200);
    if (b.action === "list") return out(nodes);
    if (b.action === "vip_get") { const v = await storeLoadVipSizes(env); return jsonResponse({ ok: true, ...v }, 200); }
    if (b.action === "vip_save") {
      const sizes = storeParseVipSizes(b.sizes), at = Date.now();
      await fsCommit(env, [{ update: { name: docName(env, "config/storeVip"), fields: objToFields({ sizes, updatedAt: at }) } }]);
      return jsonResponse({ ok: true, sizes, configured: true, updatedAt: at }, 200);
    }
    if (b.action === "customers_list") {
      const { sizes } = await storeLoadVipSizes(env), q = cleanText(b.q, 60).toLowerCase();
      let rows = (await fsRunQuery(env, "storeCustomers", null, 500, 0)).map(r => ({ ...storeCustomerOut(r.id, r.data, sizes, { admin: true }), lastSeenAt: Number(r.data.lastSeenAt) || 0 }));
      const total = rows.length;
      if (q) rows = rows.filter(x => (x.name + " " + x.email + " " + x.id).toLowerCase().includes(q));      // بالاسم أو الإيميل أو المعرّف (رسالة التاجر بتحمل المعرّف)
      rows.sort((a, c2) => c2.lastSeenAt - a.lastSeenAt || a.id.localeCompare(c2.id));
      return jsonResponse({ ok: true, total, customers: rows.slice(0, 200) }, 200);
    }
    if (b.action === "customer_spend") {         // تعديل يدوي للصرف (للتصحيح، أو لمبيعات صارت خارج النظام)؛ بينسجّل
      const uid = validId(String(b.uid || "")); const delta = Number(b.deltaUsd);
      if (!uid) throw new ApiError("bad_request", "طلب غلط.");
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1000000) throw new ApiError("bad_delta", "اكتب مبلغ (موجب أو سالب) أكبر من 0 وأقل من مليون.");
      const note = cleanText(b.note, 120), { sizes } = await storeLoadVipSizes(env);
      for (let attempt = 0; attempt < 3; attempt++) {
        const cur = await fsGetDoc(env, "storeCustomers/" + uid);
        if (!cur.exists) throw new ApiError("not_found", "هالزبون مو موجود.", 404);
        const plan = storeSpendPlan(env, uid, cur.data, delta, note, "admin", Date.now());
        try {
          await fsCommit(env, [{ update: { name: docName(env, "storeCustomers/" + uid), fields: objToFields(plan.upd) }, updateMask: { fieldPaths: Object.keys(plan.upd) }, currentDocument: { updateTime: cur.updateTime } }, ...plan.writes]);
          return jsonResponse({ ok: true, customer: storeCustomerOut(uid, { ...cur.data, ...plan.upd }, sizes, { admin: true }) }, 200);
        } catch (e) { if (!e.conflict || attempt === 2) throw e; }
      }
    }
    if (b.action === "orders_badge") {            // عدّاد الطلبات بالأدمن (بيتحدّث كل دقيقتين): عدّ بدون قراءة المستندات
      const [a, p] = await Promise.all([fsCount(env, "storeOrders", { field: "status", value: "payment_submitted" }), fsCount(env, "storeOrders", { field: "status", value: "processing" })]);
      return jsonResponse({ ok: true, counts: { payment_submitted: a, processing: p }, waiting: a + p }, 200);
    }
    if (b.action === "orders_list") {
      const now2 = Date.now(), q = cleanText(b.q, 60).toLowerCase(), st = String(b.status || "all"), kd = String(b.kind || "all");
      const all = (await fsRunQuery(env, "storeOrders", null, 500, 0)).map(r => storeOrderOut(r.id, r.data, now2, true)).sort((a, c2) => c2.createdAt - a.createdAt);
      const counts = {}; for (const o of all) counts[o.status] = (counts[o.status] || 0) + 1;
      const kinds = {}; for (const o of all) if (["payment_submitted", "awaiting_payment", "processing"].includes(o.status)) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
      const waiting = all.filter(o => o.status === "payment_submitted").length + all.filter(o => o.status === "processing").length;
      let rows = all.filter(o => (kd === "all" || o.kind === kd) && (st === "all" || (st === "open" ? ["payment_submitted", "awaiting_payment", "processing"].includes(o.status) : st === "waiting" ? (o.status === "payment_submitted" || o.status === "processing") : o.status === st)));
      if (q) rows = rows.filter(o => (o.code + " " + o.name + " " + o.email + " " + o.playerId + " " + o.itemName + " " + o.uid).toLowerCase().includes(q));
      return jsonResponse({ ok: true, counts, kinds, waiting, total: all.length, orders: rows.slice(0, 200) }, 200);
    }
    if (b.action === "order_proof") {
      const id = validId(String(b.id || "")); if (!id) throw new ApiError("bad_request", "طلب غلط.");
      const d = await fsGetDoc(env, "storeProofs/" + id);
      return jsonResponse({ ok: true, image: d.exists && d.data ? String(d.data.data || "") : "" }, 200);
    }
    if (["order_done", "order_reject", "order_refund"].includes(b.action)) {
      const id = validId(String(b.id || "")); if (!id) throw new ApiError("bad_request", "طلب غلط.");
      const note = cleanText(b.action === "order_reject" ? b.reason : b.note, 200);
      if (b.action === "order_reject" && !note) throw new ApiError("reason_required", "اكتب سبب الرفض (بيوصل للزبون).");
      if (b.action === "order_done") await storeChainLockForManual(env, id, b.force === true);
      const r = await storeOrderAction(env, b.action, id, note, "admin");
      return jsonResponse({ ok: true, ...(r.warning ? { warning: r.warning } : {}), order: r.order }, 200);
    }

    if (b.action === "order_auto_run" || b.action === "order_auto_sync") {            // تنفيذ تلقائي يدوي الآن / سؤال FazerCards عن الحالة
      const id = validId(String(b.id || "")); if (!id) throw new ApiError("bad_request", "طلب غلط.");
      const r = b.action === "order_auto_run" ? await storeAutoFulfill(env, id, { force: true }) : await storeAutoSync(env, id);
      const fresh = await fsGetDoc(env, "storeOrders/" + id); if (!fresh.exists) throw new ApiError("not_found", "هالطلب مو موجود.", 404);
      return jsonResponse({ ok: true, outcome: r.outcome, reason: r.reason || "", order: storeOrderOut(id, fresh.data, Date.now(), true) }, 200);
    }
    if (b.action === "chain_backfill") return jsonResponse({ ok: true, locked: await storeChainBackfill(env) }, 200);
    if (b.action === "order_chain_check") {                    // تحقق يدوي الآن من البلوكتشين لإيداع USDT
      const id = validId(String(b.id || "")); if (!id) throw new ApiError("bad_request", "طلب غلط.");
      const r = await storeChainVerifyOnce(env, id), fresh = await fsGetDoc(env, "storeOrders/" + id); if (!fresh.exists) throw new ApiError("not_found", "هالطلب مو موجود.", 404);
      return jsonResponse({ ok: true, outcome: r.outcome, reason: r.reason || "", order: storeOrderOut(id, fresh.data, Date.now(), true) }, 200);
    }
    if (b.action === "order_finish_deletion") {
      const id = validId(String(b.id || "")); if (!id) throw new ApiError("bad_request", "طلب غلط.");
      const od = await fsGetDoc(env, "storeOrders/" + id);
      if (!od.exists) throw new ApiError("not_found", "هالطلب مو موجود.", 404);
      if (od.data.kind !== "refund" || od.data.status !== "done" || od.data.finalizePending !== true || !od.data.uid) throw new ApiError("bad_status", "ما في حذف ناقص لهالطلب.");
      await storeAnonymizeCustomer(env, od.data.uid, id);
      const fresh = await fsGetDoc(env, "storeOrders/" + id);
      return jsonResponse({ ok: true, order: storeOrderOut(id, fresh.data, Date.now(), true) }, 200);
    }
    if (b.action === "retention_run") return jsonResponse({ ok: true, purged: await storeRetentionSweep(env) }, 200);
    if (b.action === "supplier_get") {
      const w = await storeLoadSupplier(env), dd = await fsGetDoc(env, "storeSupplierDay/" + storeDayKey(Date.now()));
      return jsonResponse({ ok: true, hasKey: !!env.FAZER_API_KEY, hasWebhookSecret: !!env.FAZER_WEBHOOK_SECRET, webhookUrl: new URL(request.url).origin + "/supplier/fazer/webhook", todayUsd: dd.exists ? r4(Number(dd.data.spentUsd) || 0) : 0, todayCount: dd.exists ? Number(dd.data.count) || 0 : 0, ...w }, 200);
    }
    if (b.action === "supplier_save") {
      const cfg = storeParseSupplier(b.cfg), at = Date.now();
      await fsCommit(env, [{ update: { name: docName(env, "config/storeSupplier"), fields: objToFields({ ...cfg, updatedAt: at }) } }]);
      return jsonResponse({ ok: true, cfg, configured: true, updatedAt: at, hasKey: !!env.FAZER_API_KEY }, 200);
    }
    if (b.action === "supplier_status") return jsonResponse({ ok: true, status: await storeSupplierStatus(env) }, 200);
    if (b.action === "supplier_categories") return jsonResponse({ ok: true, categories: await storeSupplierCategories(env, b.q) }, 200);
    if (b.action === "supplier_offers") {
      const cid = String(b.categoryId || ""); if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(cid)) throw new ApiError("bad_request", "طلب غلط.");
      return jsonResponse({ ok: true, ...(await storeSupplierOffers(env, cid)) }, 200);
    }
    if (b.action === "supplier_validators") return jsonResponse({ ok: true, validators: (await storeSupplierValidators(env)).map(v => ({ categoryId: v.categoryId, name: v.name })) }, 200);
    if (b.action === "supplier_search") return jsonResponse({ ok: true, ...(await storeSupplierSearch(env, b.q)) }, 200);
    if (b.action === "supplier_section_offers") return jsonResponse({ ok: true, offers: await storeSupplierSectionOffers(env, String(b.section || ""), String(b.id || "")) }, 200);
    if (b.action === "prices_preview" || b.action === "prices_apply") {            // أداة الأسعار: معاينة، ثم تطبيق على المحدّد (السيرفر بيعيد الحساب بتكلفة FazerCards الحالية ولا بيصدّق أرقام الواجهة)
      const { cfg: sc } = await storeLoadSupplier(env), params = storePriceParams(b, sc.minMarginPct);
      if (b.action === "prices_preview") return jsonResponse({ ok: true, minMarginPct: sc.minMarginPct, params, items: await storePricePlan(env, nodes, params, sc.minMarginPct, null) }, 200);
      const ids = Array.isArray(b.ids) ? b.ids.map(x => String(x || "")).filter(Boolean) : []; if (!ids.length || ids.length > 400) throw new ApiError("bad_request", "اختار منتجات (حتى 400).");
      const plan = await storePricePlan(env, nodes, params, sc.minMarginPct, new Set(ids)), at = Date.now(), skipped = [], writes = [];
      for (const id of ids) if (!plan.some(x => x.id === id)) skipped.push({ id, reason: "not_linked" });
      for (const it of plan) {
        if (it.status !== "ok") { skipped.push({ id: it.id, reason: it.status }); continue; }
        const node = nodes.find(n => n.id === it.id), prices = storeParsePrices(it.proposed);
        writes.push({ update: { name: docName(env, "storeNodes/" + it.id), fields: objToFields({ prices, supplier: { ...node.supplier, costUsd: it.costUsd }, updatedAt: at }) }, updateMask: { fieldPaths: ["prices", "supplier", "updatedAt"] }, currentDocument: { exists: true } });
      }
      if (writes.length) await fsCommit(env, writes);
      return jsonResponse({ ok: true, applied: writes.length, skipped }, 200);
    }
    if (b.action === "supplier_link") {            // ربط منتج بخيار عند FazerCards (أو فك الربط)؛ بره محرّر المنتج حتى ما ينمسح بالغلط
      const it = nodes.find(n => n.id === String(b.id || ""));
      if (!it) throw new ApiError("not_found", "هالمنتج مو موجود.", 404);
      if (it.type !== "item") throw new ApiError("bad_request", "الربط للمنتجات بس (مو للمجلدات).");
      const link = storeParseSupplierLink(b.link === undefined ? null : b.link);
      await fsCommit(env, [{ update: { name: docName(env, "storeNodes/" + it.id), fields: objToFields({ supplier: link, updatedAt: Date.now() }) }, updateMask: { fieldPaths: ["supplier", "updatedAt"] }, currentDocument: { exists: true } }]);
      return out(await storeAllNodes(env));
    }
    if (b.action === "wallet_get") { const w = await storeLoadWallet(env); return jsonResponse({ ok: true, ...w }, 200); }
    if (b.action === "wallet_save") {
      const cfg = storeParseWallet(b.cfg), at = Date.now();
      await fsCommit(env, [{ update: { name: docName(env, "config/storeWallet"), fields: objToFields({ ...cfg, updatedAt: at }) } }]);
      return jsonResponse({ ok: true, cfg, configured: true, updatedAt: at }, 200);
    }
    if (b.action === "customer_balance") {         // تعديل يدوي لرصيد الزبون (إيداع صار خارج النظام، أو تصحيح)؛ بينسجّل
      const uid = validId(String(b.uid || "")); const delta = Number(b.deltaUsd);
      if (!uid) throw new ApiError("bad_request", "طلب غلط.");
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000) throw new ApiError("bad_delta", "اكتب مبلغ (موجب أو سالب) أكبر من 0 وأقل من 100,000.");
      const note = cleanText(b.note, 120), { sizes } = await storeLoadVipSizes(env);
      for (let attempt = 0; attempt < 3; attempt++) {
        const cur = await fsGetDoc(env, "storeCustomers/" + uid);
        if (!cur.exists) throw new ApiError("not_found", "هالزبون مو موجود.", 404);
        const after = r4((Number(cur.data.balanceUsd) || 0) + delta), at = Date.now();
        if (after < 0) throw new ApiError("insufficient_balance", "رصيد الزبون ما بيكفي لهالخصم.");
        try {
          await fsCommit(env, [
            { update: { name: docName(env, "storeCustomers/" + uid), fields: objToFields({ balanceUsd: after }) }, updateMask: { fieldPaths: ["balanceUsd"] }, currentDocument: { updateTime: cur.updateTime } },
            { update: { name: docName(env, "storeLedger/" + randomId()), fields: objToFields({ uid, type: "adjust", amountUsd: r4(delta), balanceAfter: after, ref: "", note, at, by: "admin" }) }, currentDocument: { exists: false } },
          ]);
          return jsonResponse({ ok: true, customer: storeCustomerOut(uid, { ...cur.data, balanceUsd: after }, sizes, { admin: true }) }, 200);
        } catch (e) { if (!e.conflict || attempt === 2) throw e; }
      }
    }
    if (b.action === "customer_ledger") {
      const uid = validId(String(b.uid || "")); if (!uid) throw new ApiError("bad_request", "طلب غلط.");
      const rows = (await fsRunQuery(env, "storeLedger", null, 200, 0, { field: "uid", value: uid })).map(r => ({ type: String(r.data.type || ""), amountUsd: Number(r.data.amountUsd) || 0, balanceAfter: Number(r.data.balanceAfter) || 0, ref: String(r.data.ref || ""), note: String(r.data.note || ""), at: Number(r.data.at) || 0, by: String(r.data.by || "") })).sort((a, c2) => c2.at - a.at);
      return jsonResponse({ ok: true, ledger: rows }, 200);
    }
    if (b.action === "customer_log") {
      const uid = validId(String(b.uid || "")); if (!uid) throw new ApiError("bad_request", "طلب غلط.");
      const rows = (await fsRunQuery(env, "storeSpendLog", null, 200, 0, { field: "uid", value: uid })).map(r => ({ deltaUsd: Number(r.data.deltaUsd) || 0, spentAfter: Number(r.data.spentAfter) || 0, note: String(r.data.note || ""), at: Number(r.data.at) || 0 })).sort((a, c2) => c2.at - a.at);
      const vrows = (await fsRunQuery(env, "storeVipLog", null, 200, 0, { field: "uid", value: uid })).map(r => ({ action: String(r.data.action || ""), level: Number(r.data.level) || 0, targetUsd: Number(r.data.targetUsd) || 0, days: Number(r.data.days) || 0, prevLevel: Number(r.data.prevLevel) || 0, note: String(r.data.note || ""), at: Number(r.data.at) || 0, by: String(r.data.by || "") })).sort((a, c2) => c2.at - a.at);
      return jsonResponse({ ok: true, log: rows, vipLog: vrows }, 200);
    }
    if (["merchant_set", "merchant_extend", "merchant_lock", "merchant_cancel"].includes(b.action)) {
      const uid = validId(String(b.uid || "")); if (!uid) throw new ApiError("bad_request", "طلب غلط.");
      const { sizes } = await storeLoadVipSizes(env), note = cleanText(b.note, 120);
      for (let attempt = 0; attempt < 3; attempt++) {
        const cur = await fsGetDoc(env, "storeCustomers/" + uid);
        if (!cur.exists) throw new ApiError("not_found", "هالزبون مو موجود.", 404);
        const d = cur.data, m = d.merchant, now = Date.now(), spent = Number(d.spentUsd) || 0, ms = storeMerchantState(m, spent, now);
        let merchant, log;
        if (b.action === "merchant_set") {
          const level = Number(b.level), target = Number(b.targetUsd), days = b.trialDays === undefined || b.trialDays === "" || b.trialDays === null ? 60 : Number(b.trialDays);
          if (!Number.isInteger(level) || level < 2 || level > 10) throw new ApiError("bad_level", "المستوى من 2 لـ10.");
          if (!Number.isFinite(target) || target <= 0 || target > 10000000) throw new ApiError("bad_target", "اكتب رقم الوعد (مجموع الصرف بالدولار) أكبر من 0.");
          if (!Number.isInteger(days) || days < 1 || days > 365) throw new ApiError("bad_days", "مدة الاختبار من 1 لـ365 يوم.");
          const effective = Math.max(storeVipInfo(sizes, spent).vip, ms.floor);
          if (level <= effective) throw new ApiError("bad_level", `الزبون أصلاً بمستوى VIP ${effective}. اختار مستوى أعلى.`);
          const prevLevel = ms.status === "trial" ? (Number(m.prevLevel) || 1) : ms.status === "locked" ? Number(m.level) : effective;
          merchant = { status: "trial", level, targetUsd: r2(target), baseSpent: spent, startedAt: now, endsAt: now + days * 86400000, prevLevel, note };
          log = { action: "set", level, targetUsd: r2(target), days, prevLevel, note };
        } else {
          if (!m || !m.status) throw new ApiError("no_merchant", "ما في نقل تاجر لهالزبون.");
          if (b.action === "merchant_extend") {
            const days = Number(b.days);
            if (!Number.isInteger(days) || days < 1 || days > 365) throw new ApiError("bad_days", "التمديد من 1 لـ365 يوم.");
            if (ms.status === "locked") throw new ApiError("already_locked", "الزبون مثبّت أصلاً.");
            if (ms.status === "cancelled") throw new ApiError("cancelled", "النقل ملغى. اعمل نقل جديد.");
            const endsAt = Math.max(now, Number(m.endsAt) || 0) + days * 86400000;
            merchant = { ...m, status: "trial", endsAt };
            if (storeMerchantState(merchant, spent, now).status === "locked") merchant = { ...merchant, status: "locked", lockedAt: now };     // وصل الرقم أصلاً
            log = { action: "extend", level: Number(m.level) || 0, targetUsd: Number(m.targetUsd) || 0, days, note };
          } else if (b.action === "merchant_lock") {
            if (ms.status === "locked") throw new ApiError("already_locked", "الزبون مثبّت أصلاً.");
            if (ms.status === "cancelled") throw new ApiError("cancelled", "النقل ملغى. اعمل نقل جديد.");
            merchant = { ...m, status: "locked", lockedAt: now };
            log = { action: "lock", level: Number(m.level) || 0, targetUsd: Number(m.targetUsd) || 0, note };
          } else {
            if (ms.status === "cancelled") throw new ApiError("cancelled", "النقل ملغى أصلاً.");
            merchant = { ...m, status: "cancelled", cancelledAt: now };
            log = { action: "cancel", level: Number(m.level) || 0, targetUsd: Number(m.targetUsd) || 0, prevLevel: Number(m.prevLevel) || 1, note };
          }
        }
        try {
          await fsCommit(env, [
            { update: { name: docName(env, "storeCustomers/" + uid), fields: objToFields({ merchant }) }, updateMask: { fieldPaths: ["merchant"] }, currentDocument: { updateTime: cur.updateTime } },
            { update: { name: docName(env, "storeVipLog/" + randomId()), fields: objToFields({ uid, ...log, at: now, by: "admin" }) }, currentDocument: { exists: false } },
          ]);
          return jsonResponse({ ok: true, customer: storeCustomerOut(uid, { ...d, merchant }, sizes, { admin: true }) }, 200);
        } catch (e) { if (!e.conflict || attempt === 2) throw e; }
      }
    }
    if (b.action === "payments_get") { const d = await fsGetDoc(env, "config/storePayments"); return jsonResponse({ ok: true, methods: await storeLoadMethods(env), updatedAt: d.exists && d.data ? Number(d.data.updatedAt) || 0 : 0 }, 200); }
    if (b.action === "payments_save") {
      const methods = storeParseMethods(b.methods), at = Date.now();
      for (const m of methods) if (m.autoVerify === "trc20" && !(await tronAddrToHex20(m.account))) throw new ApiError("bad_method", `"${m.name}": عنوان TRC20 غير صحيح (فشل فحص الخانات الأخيرة). تأكد من نسخه كامل.`);
      await fsCommit(env, [{ update: { name: docName(env, "config/storePayments"), fields: objToFields({ methods, updatedAt: at }) } }]);
      return jsonResponse({ ok: true, methods, updatedAt: at }, 200);
    }
    const now = Date.now();
    if (b.action === "save") {
      const existing = b.id ? nodes.find(n => n.id === validId(String(b.id))) : null;
      if (b.id && !existing) throw new ApiError("not_found", "هالعنصر مو موجود.", 404);
      const name = cleanText(b.name, 60); if (!name) throw new ApiError("bad_name", "اكتب اسم.");
      const enabled = b.enabled !== false, note = b.note === undefined ? undefined : cleanText(b.note, STORE_NOTE_MAX);       // ملاحظة اختيارية بتظهر للزبون (مجلد أو منتج)
      let image; // undefined = ما منغيّر، "" = منحذف، data URL = منحط
      if (b.image !== undefined) {
        if (b.image === "" || b.image === null) image = "";
        else if (typeof b.image === "string" && b.image.length <= STORE_IMG_MAX && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.image)) image = b.image;
        else throw new ApiError("bad_image", "الصورة لازم تكون PNG أو JPEG أو WebP وحجمها صغير.");
      }
      const kind = existing ? existing.type : (b.type === "item" ? "item" : b.type === "folder" ? "folder" : null);
      if (!kind) throw new ApiError("bad_type", "النوع لازم مجلد أو منتج.");
      const prices = kind === "item" ? storeParsePrices(b.prices) : null;
      let id, writes = [], node;
      if (existing) {
        id = existing.id; node = { name, enabled, updatedAt: now, ...(prices ? { prices } : {}), ...(note !== undefined ? { note } : {}) };
        writes.push({ update: { name: docName(env, "storeNodes/" + id), fields: objToFields(node) }, updateMask: { fieldPaths: Object.keys(node) }, currentDocument: { exists: true } });
      } else {
        const type = kind;
        const parentId = b.parentId ? validId(String(b.parentId)) : "";
        if (b.parentId && !parentId) throw new ApiError("bad_parent", "المجلد الأب غلط.");
        if (parentId) { const par = nodes.find(n => n.id === parentId); if (!par || par.type !== "folder") throw new ApiError("bad_parent", "لازم تضيف داخل مجلد."); if (storeDepth(nodes, parentId) + 1 > STORE_MAX_DEPTH) throw new ApiError("too_deep", `أقصى عمق ${STORE_MAX_DEPTH} مستويات.`); }
        if (nodes.length >= STORE_MAX_NODES) throw new ApiError("too_many", `وصلت للحد الأقصى (${STORE_MAX_NODES} عنصر).`);
        const sibs = nodes.filter(n => String(n.parentId || "") === parentId);
        id = "n" + randomId().slice(0, 12);
        node = { parentId, type, name, enabled, note: note || "", ...(prices ? { prices } : {}), sort: sibs.length ? Math.max(...sibs.map(n => Number(n.sort) || 0)) + 1 : 1, imageVer: 0, createdAt: now, updatedAt: now };
        writes.push({ update: { name: docName(env, "storeNodes/" + id), fields: objToFields(node) }, currentDocument: { exists: false } });
      }
      if (image !== undefined) {
        const ver = image ? now : 0;
        writes.push({ update: { name: docName(env, "storeNodes/" + id), fields: objToFields({ imageVer: ver }) }, updateMask: { fieldPaths: ["imageVer"] } });
        writes.push(image ? { update: { name: docName(env, "storeImages/" + id), fields: objToFields({ data: image, ver }) } } : { delete: docName(env, "storeImages/" + id) });
      }
      await fsCommit(env, writes);
      return out(await storeAllNodes(env));
    }
    if (b.action === "delete") {
      const id = validId(String(b.id || "")); const n = nodes.find(x => x.id === id);
      if (!n) throw new ApiError("not_found", "هالعنصر مو موجود.", 404);
      if (nodes.some(x => String(x.parentId || "") === id)) throw new ApiError("has_children", "المجلد مش فاضي. احذف اللي جواته أول.");
      await fsCommit(env, [{ delete: docName(env, "storeNodes/" + id) }, { delete: docName(env, "storeImages/" + id) }]);
      return out(nodes.filter(x => x.id !== id));
    }
    if (b.action === "move") {                    // نقل مجلد أو منتج لمجلد تاني (أو للرئيسية)
      const id = validId(String(b.id || "")), n = nodes.find(x => x.id === id); if (!n) throw new ApiError("not_found", "هالعنصر مو موجود.", 404);
      const parentId = b.parentId ? validId(String(b.parentId)) : ""; if (b.parentId && !parentId) throw new ApiError("bad_parent", "الوجهة غلط.");
      if (parentId) { const par = nodes.find(x => x.id === parentId); if (!par) throw new ApiError("not_found", "المجلد الوجهة مو موجود.", 404); if (par.type !== "folder") throw new ApiError("bad_parent", "الوجهة لازم تكون مجلد."); }
      if (String(n.parentId || "") === parentId) return out(nodes);
      const by = new Map(nodes.map(x => [x.id, x]));
      for (let cur = parentId, d = 0; cur && d < 20; d++) { if (cur === id) throw new ApiError("bad_move", "ما بتقدر تنقل مجلد لجوّا نفسه أو لجوّا مجلد فرعي منه."); cur = String((by.get(cur) || {}).parentId || ""); }
      const kids = new Map(); for (const x of nodes) { const k = String(x.parentId || ""); if (!kids.has(k)) kids.set(k, []); kids.get(k).push(x.id); }
      const height = (nid, g) => g > 12 ? 1 : 1 + Math.max(0, ...(kids.get(nid) || []).map(c => height(c, g + 1)));
      if ((parentId ? storeDepth(nodes, parentId) : 0) + height(id, 0) > STORE_MAX_DEPTH) throw new ApiError("too_deep", `أقصى عمق ${STORE_MAX_DEPTH} مستويات. الوجهة عميقة كتير لهالعنصر.`);
      const sibs = nodes.filter(x => String(x.parentId || "") === parentId);
      await fsCommit(env, [{ update: { name: docName(env, "storeNodes/" + id), fields: objToFields({ parentId, sort: sibs.length ? Math.max(...sibs.map(x => Number(x.sort) || 0)) + 1 : 1, updatedAt: Date.now() }) }, updateMask: { fieldPaths: ["parentId", "sort", "updatedAt"] }, currentDocument: { exists: true } }]);
      return out(await storeAllNodes(env));
    }
    if (b.action === "reorder") {
      const id = validId(String(b.id || "")); const n = nodes.find(x => x.id === id);
      if (!n || (b.dir !== "up" && b.dir !== "down")) throw new ApiError("bad_request", "طلب غلط.");
      const sibs = storeSorted(nodes.filter(x => String(x.parentId || "") === String(n.parentId || "")));
      const i = sibs.findIndex(x => x.id === id), j = b.dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= sibs.length) return out(nodes);
      const order = sibs.map(x => x.id); [order[i], order[j]] = [order[j], order[i]];
      const writes = order.map((oid, k) => ({ update: { name: docName(env, "storeNodes/" + oid), fields: objToFields({ sort: k + 1 }) }, updateMask: { fieldPaths: ["sort"] }, currentDocument: { exists: true } }));
      await fsCommit(env, writes);
      return out(await storeAllNodes(env));
    }
    throw new ApiError("bad_action", "طلب غلط.");
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    console.error({ message: "admin store error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}

// ===== حسابات زباين المتجر (الخطوة 4أ) =====
// storeCustomers/{uid}: نفس معرّف حساب Firebase تبع اللعبة (يعني لاعب ياردوفا بيدخل بحسابه لاحقاً ويدفع بنقاطه).
// الدخول بيعمل الحساب أول مرة. vip وspentUsd هلق ثابتين (1 و0)؛ منظام VIP بيجي بالخطوة 4ب.
const STORE_VIP_DEFAULT_SIZES = [200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000];   // أرقام مثال لحد ما الأدمن يضبطها
const r2 = (x) => Math.round(x * 100) / 100;
// المستوى بيتحسب من إجمالي الصرف: sizes[i] = المبلغ اللازم لإكمال المستوى i+1. مثال: الأول 200 ← صرف 250 = VIP 2 وتقدمه 50
function storeVipInfo(sizes, spentUsd) {
  const spent = Math.max(0, Number(spentUsd) || 0); let rest = spent, level = 1;
  for (let i = 0; i < sizes.length; i++) { if (rest + 1e-9 >= sizes[i]) { rest -= sizes[i]; level++; } else break; }
  const max = level > sizes.length;
  return { vip: level, spentUsd: r2(spent), progressUsd: max ? 0 : r2(Math.max(0, rest)), sizeUsd: max ? null : sizes[level - 1], remainingUsd: max ? 0 : r2(Math.max(0, sizes[level - 1] - rest)), nextVip: max ? null : level + 1 };
}
async function storeLoadVipSizes(env) { const d = await fsGetDoc(env, "config/storeVip"); const z = d.exists && d.data && Array.isArray(d.data.sizes) ? d.data.sizes.map(Number) : null; return z && z.length === 9 && z.every(x => x > 0) ? { sizes: z, configured: true, updatedAt: Number(d.data.updatedAt) || 0 } : { sizes: STORE_VIP_DEFAULT_SIZES, configured: false, updatedAt: 0 }; }
function storeParseVipSizes(raw) {
  if (!Array.isArray(raw) || raw.length !== 9) throw new ApiError("bad_vip", "لازم 9 مبالغ (من VIP 1 لـVIP 9).");
  return raw.map((v, i) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 10000000) throw new ApiError("bad_vip", `المبلغ لإكمال VIP ${i + 1} لازم يكون رقم أكبر من 0.`);
    return r2(n);
  });
}
// ===== قاعدة التاجر: نقل يدوي لمستوى أعلى مع رقم وعد (مجموع) وفترة اختبار (60 يوم افتراضياً) =====
// وصل الرقم خلال الفترة ← بيثبت. خلصت الفترة بدون ما يوصل ← بيرجع للأعلى بين مستواه قبل النقل ومستواه حسب صرفه (ما بيخسر اللي كسبه).
// merchant: { status: trial|locked|cancelled, level, targetUsd, baseSpent, startedAt, endsAt, prevLevel, lockedAt?, note }
function storeMerchantState(m, spent, now) {
  if (!m || !m.status) return { status: "none", floor: 0 };
  const level = Number(m.level) || 0, prev = Number(m.prevLevel) || 1, target = Number(m.targetUsd) || 0, endsAt = Number(m.endsAt) || 0;
  const win = Math.max(0, r2((Number(spent) || 0) - (Number(m.baseSpent) || 0))), left = Math.max(0, r2(target - win));
  if (m.status === "locked") return { status: "locked", floor: level, windowSpent: win, remaining: 0, daysLeft: 0 };
  if (m.status === "cancelled") return { status: "cancelled", floor: prev, windowSpent: win, remaining: left, daysLeft: 0 };
  if (now <= endsAt) return win + 1e-9 >= target ? { status: "locked", floor: level, windowSpent: win, remaining: 0, daysLeft: 0 } : { status: "trial", floor: level, windowSpent: win, remaining: left, daysLeft: Math.max(1, Math.ceil((endsAt - now) / 86400000)) };
  return { status: "expired", floor: prev, windowSpent: win, remaining: left, daysLeft: 0 };
}
function storeVipWithFloor(sizes, spentUsd, floor) {
  const base = storeVipInfo(sizes, spentUsd);
  if (!(floor > base.vip)) return base;
  // مستوى ممسوك بنقل يدوي (أعلى من اللي بيعطيه صرفه): التقدّم للمستوى الجاي بيتحسب من إجمالي الصرف مقابل المبلغ التراكمي اللي بيوصّل للمستوى الجاي
  const spent = Math.max(0, Number(spentUsd) || 0), max = floor > sizes.length, thr = max ? 0 : sizes.slice(0, floor).reduce((a, b) => a + b, 0);
  return { vip: floor, spentUsd: r2(spent), progressUsd: max ? 0 : r2(Math.min(spent, thr)), sizeUsd: max ? null : r2(thr), remainingUsd: max ? 0 : r2(Math.max(0, thr - spent)), nextVip: max ? null : floor + 1 };
}
function storeCustomerOut(uid, c, sizes, opts = {}) {
  const now = opts.now || Date.now(), sz = sizes || STORE_VIP_DEFAULT_SIZES, ms = storeMerchantState(c.merchant, c.spentUsd, now);
  const out = { id: uid, name: String(c.name || ""), email: String(c.email || ""), createdAt: Number(c.createdAt) || 0, balanceUsd: r4(Number(c.balanceUsd) || 0), ...storeVipWithFloor(sz, c.spentUsd, ms.floor) };
  if (c.closing && c.closing.code) out.closing = { code: String(c.closing.code), amountUsd: r4(Number(c.closing.amountUsd) || 0), requestedAt: Number(c.closing.requestedAt) || 0 };
  if (opts.admin) out.autoVip = storeVipInfo(sz, c.spentUsd).vip;      // للأدمن بس: مستواه لو ما في نقل يدوي
  const m = c.merchant;
  if (ms.status !== "none" && (opts.admin || ms.status === "trial" || ms.status === "locked")) {
    out.merchant = { status: ms.status, level: Number(m.level) || 0, targetUsd: Number(m.targetUsd) || 0, windowSpentUsd: ms.windowSpent, remainingUsd: ms.remaining, endsAt: Number(m.endsAt) || 0, daysLeft: ms.daysLeft };
    if (opts.admin) Object.assign(out.merchant, { prevLevel: Number(m.prevLevel) || 1, startedAt: Number(m.startedAt) || 0, note: String(m.note || "") });
  }
  return out;
}
// خطة تعديل الصرف: بترجّع الحقول الجديدة + كتابات السجل (وبتثبّت التاجر إذا وصل لرقمه خلال فترته)
function storeSpendPlan(env, uid, cur, delta, note, by, at) {
  const after = Math.max(0, r2((Number(cur.spentUsd) || 0) + delta)), upd = { spentUsd: after }, m = cur.merchant, writes = [];
  if (m && m.status === "trial" && at <= Number(m.endsAt) && after - (Number(m.baseSpent) || 0) + 1e-9 >= Number(m.targetUsd)) {
    upd.merchant = { ...m, status: "locked", lockedAt: at };
    writes.push({ update: { name: docName(env, "storeVipLog/" + randomId()), fields: objToFields({ uid, action: "auto_lock", level: Number(m.level) || 0, targetUsd: Number(m.targetUsd) || 0, at, by: "auto" }) }, currentDocument: { exists: false } });
  }
  writes.push({ update: { name: docName(env, "storeSpendLog/" + randomId()), fields: objToFields({ uid, deltaUsd: r2(delta), spentAfter: after, note, at, by }) }, currentDocument: { exists: false } });
  return { after, upd, writes };
}
// ===== محفظة المتجر (الخطوة 6): رصيد دولار منفصل عن رصيد اللعبة =====
// storeCustomers/{uid}.balanceUsd (4 خانات عشرية). "النقاط" وحدة عرض بس: pointsPerUsd نقطة = 1$ (المخزّن والمخصوم دولار). كل حركة بتنسجّل بـstoreLedger.
const STORE_WALLET_DEFAULTS = { pointsPerUsd: 1000, minTopupUsd: 5, maxTopupUsd: 1000, maxProcessing: 10, autoCapUsd: 200 };
const r4 = (x) => Math.round(x * 10000) / 10000;
function storeParseWallet(o) {
  o = o || {}; const num = (v, d) => (v === undefined || v === "" || v === null ? d : Number(v));
  const w = { pointsPerUsd: num(o.pointsPerUsd, STORE_WALLET_DEFAULTS.pointsPerUsd), minTopupUsd: num(o.minTopupUsd, STORE_WALLET_DEFAULTS.minTopupUsd), maxTopupUsd: num(o.maxTopupUsd, STORE_WALLET_DEFAULTS.maxTopupUsd), maxProcessing: num(o.maxProcessing, STORE_WALLET_DEFAULTS.maxProcessing), autoCapUsd: num(o.autoCapUsd, STORE_WALLET_DEFAULTS.autoCapUsd) };
  const bad = (m) => { throw new ApiError("bad_wallet", m); };
  if (!Number.isInteger(w.pointsPerUsd) || w.pointsPerUsd < 1 || w.pointsPerUsd > 1000000) bad("عدد النقاط لكل 1$ لازم يكون رقم صحيح بين 1 ومليون.");
  if (!Number.isFinite(w.minTopupUsd) || w.minTopupUsd < 1 || w.minTopupUsd > 10000) bad("أقل إيداع من 1$ لـ10,000$.");
  if (!Number.isFinite(w.maxTopupUsd) || w.maxTopupUsd < w.minTopupUsd || w.maxTopupUsd > 100000) bad("أعلى إيداع لازم يكون أكبر من أقل إيداع (وأقل من 100,000$).");
  if (!Number.isInteger(w.maxProcessing) || w.maxProcessing < 1 || w.maxProcessing > 100) bad("عدد الطلبات المفتوحة من 1 لـ100.");
  if (!Number.isFinite(w.autoCapUsd) || w.autoCapUsd < 1 || w.autoCapUsd > 100000) bad("سقف التأكيد التلقائي للإيداع من 1$ لـ100,000$.");
  w.minTopupUsd = r2(w.minTopupUsd); w.maxTopupUsd = r2(w.maxTopupUsd); w.autoCapUsd = r2(w.autoCapUsd);
  return w;
}
async function storeLoadWallet(env) {
  const d = await fsGetDoc(env, "config/storeWallet");
  if (d.exists && d.data) { try { return { cfg: storeParseWallet(d.data), configured: true, updatedAt: Number(d.data.updatedAt) || 0 }; } catch (e) {} }
  return { cfg: { ...STORE_WALLET_DEFAULTS }, configured: false, updatedAt: 0 };
}
const storeWalletView = (cfg) => ({ pointsPerUsd: cfg.pointsPerUsd, minTopupUsd: cfg.minTopupUsd, maxTopupUsd: cfg.maxTopupUsd });
// ===== مورّد التنفيذ: FazerCards (الخطوة 7أ: قراءة فقط، بدون أي طلب شراء) =====
// المفتاح secret بـCloudflare اسمه FAZER_API_KEY (مو بالكود ولا بالأدمن، وما بيرجع بأي جواب أبداً). الإعدادات بـconfig/storeSupplier.
const FZR_BASE = "https://api.fzr.cards/api/v2";
const STORE_SUPPLIER_DEFAULTS = { enabled: false, minMarginPct: 5, dailyCapUsd: 100 };
function storeParseSupplier(o) {
  o = o || {}; const num = (v, d) => (v === undefined || v === "" || v === null ? d : Number(v));
  const w = { enabled: o.enabled === true, minMarginPct: num(o.minMarginPct, STORE_SUPPLIER_DEFAULTS.minMarginPct), dailyCapUsd: num(o.dailyCapUsd, STORE_SUPPLIER_DEFAULTS.dailyCapUsd) };
  if (!Number.isFinite(w.minMarginPct) || w.minMarginPct < 0 || w.minMarginPct > 90) throw new ApiError("bad_supplier", "أقل هامش ربح من 0% لـ90%.");
  if (!Number.isFinite(w.dailyCapUsd) || w.dailyCapUsd < 1 || w.dailyCapUsd > 100000) throw new ApiError("bad_supplier", "السقف اليومي من 1$ لـ100,000$ (لإيقاف التنفيذ التلقائي طفّي الخيار).");
  w.minMarginPct = r2(w.minMarginPct); w.dailyCapUsd = r2(w.dailyCapUsd);
  return w;
}
async function storeLoadSupplier(env) {
  const d = await fsGetDoc(env, "config/storeSupplier");
  if (d.exists && d.data) { try { return { cfg: storeParseSupplier(d.data), configured: true, updatedAt: Number(d.data.updatedAt) || 0 }; } catch (e) {} }
  return { cfg: { ...STORE_SUPPLIER_DEFAULTS }, configured: false, updatedAt: 0 };
}
async function fzrCall(env, method, path, body, headers) {
  if (!env.FAZER_API_KEY) throw new ApiError("no_key", "مفتاح FazerCards مو مضاف. أضفه كـSecret باسم FAZER_API_KEY بـCloudflare.", 400);
  let res, j = {};
  try {
    res = await fetch(FZR_BASE + path, { method, headers: { "X-API-Key": env.FAZER_API_KEY, "Content-Type": "application/json", ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined, signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
  } catch (e) { const er = new ApiError("supplier_unreachable", "تعذّر الوصول لـFazerCards. جرّب بعد شوي.", 502); er.supplierStatus = 0; er.supplierMsg = ""; throw er; }
  try { j = await res.json(); } catch (e) {}
  if (!res.ok || j.ok === false) {
    const st = res.status, why = st === 401 ? "المفتاح غير صالح." : st === 403 ? "الخدمة غير مفعّلة بخطتك أو الحساب محظور (ممكن لأنه ما في اشتراك فعّال)." : st === 429 ? "طلبات كتير، جرّب بعد شوي." : cleanText(j.error || "", 160) || "خطأ " + st;
    const er = new ApiError("supplier_error", "FazerCards: " + why, 502); er.supplierStatus = st; er.supplierMsg = cleanText((j.error || "") + " " + (j.code || ""), 200); throw er;
  }
  return j;
}
const fzrNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
async function storeSupplierStatus(env) {
  const me = await fzrCall(env, "GET", "/me"), bal = await fzrCall(env, "GET", "/balance");
  return { login: cleanText(me.login, 60), plan: cleanText(me.plan, 20), planExpiresAt: cleanText(me.planExpiresAt, 40), planAutoRenew: me.planAutoRenew === true, subscriptionActive: me.subscriptionActive === true, balanceUsd: fzrNum(bal.balance), currency: cleanText(bal.currency, 8) || "USD" };
}
async function storeSupplierCategories(env, q) {
  const out = []; let cursor = "";
  for (let i = 0; i < 6; i++) {
    const j = await fzrCall(env, "GET", "/topups?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    for (const it of Array.isArray(j.items) ? j.items : []) { const id = String(it.category_id || ""); if (/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) out.push({ categoryId: id, name: cleanText(it.name, 80) }); }
    cursor = j.meta && j.meta.has_more && j.meta.next_cursor ? String(j.meta.next_cursor) : ""; if (!cursor) break;
  }
  const f = cleanText(q, 60).toLowerCase();
  return (f ? out.filter(c => (c.name + " " + c.categoryId).toLowerCase().includes(f)) : out).slice(0, 100);
}
async function storeSupplierOffers(env, categoryId) {
  const j = await fzrCall(env, "GET", "/topups/offers?category_id=" + encodeURIComponent(categoryId));
  return { categoryId, name: cleanText(j.name, 80), offers: (Array.isArray(j.offers) ? j.offers : []).map(o => ({ offerId: String(o.offer_id || ""), name: cleanText(o.name, 80), priceUsd: fzrNum(o.price_usd) })).filter(o => /^[A-Za-z0-9_.:-]{1,80}$/.test(o.offerId) && o.priceUsd !== null), fields: (Array.isArray(j.fields) ? j.fields : []).map(f => ({ key: cleanText(f.key, 30), label: cleanText(f.label, 60), type: cleanText(f.type, 20) })) };
}
// ===== التحقق من الـPlayer ID قبل الشراء (الخطوة 7ب): قراءة بس، ما بيخصم شي =====
// FazerCards عندها لائحة ألعاب بتدعم التحقق (category_id مختلف عن قسم الشحن)، فبنطابقها بالاسم (أو بمعرّف محفوظ مع الربط).
let FZR_VALIDATORS = { at: 0, items: [] };
async function storeSupplierValidators(env) {
  if (Date.now() - FZR_VALIDATORS.at < 600000 && FZR_VALIDATORS.items.length) return FZR_VALIDATORS.items;
  const j = await fzrCall(env, "GET", "/topups/validate-id");
  const items = (Array.isArray(j.items) ? j.items : []).map(x => ({ categoryId: String(x.category_id || ""), name: cleanText(x.name, 80), fields: (Array.isArray(x.fields) ? x.fields : []).map(f => cleanText(f.key, 30)).filter(Boolean) })).filter(x => /^[A-Za-z0-9_.:-]{1,80}$/.test(x.categoryId));
  FZR_VALIDATORS = { at: Date.now(), items }; return items;
}
const fzrNorm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// مطابقة اسم قسم الشحن (مثل "PUBG Mobile (Auto)") مع لعبة بلائحة التحقق (مثل "PUBG Mobile"): نفس الاسم أول، وإلا الأدق اللي موجود جوّا الاسم؛ وإذا غامض ما منخمّن
function fzrMatchValidator(items, name) {
  const n = fzrNorm(name); if (!n) return null;
  const exact = items.find(v => fzrNorm(v.name) === n); if (exact) return exact;
  const cands = items.filter(v => { const vn = fzrNorm(v.name); return vn && (n.includes(vn) || vn.includes(n)); }).sort((a, b) => fzrNorm(b.name).length - fzrNorm(a.name).length);
  if (!cands.length) return null;
  if (cands.length > 1 && fzrNorm(cands[0].name).length === fzrNorm(cands[1].name).length) return null;
  return cands[0];
}
function storeFindValidator(items, link) {
  if (link.validateCategoryId) return items.find(v => v.categoryId === link.validateCategoryId) || null;
  return fzrMatchValidator(items, link.categoryName);
}
async function storeRateHit(env, uid, name, max, windowSec) {
  const path = "storeRate/" + name + "_" + uid, now = Date.now(), d = await fsGetDoc(env, path);
  let start = d.exists ? Number(d.data.start) || 0 : 0, n = d.exists ? Number(d.data.n) || 0 : 0;
  if (!start || now - start > windowSec * 1000) { start = now; n = 0; }
  if (n >= max) throw new ApiError("rate_limited", "عملت تحقق كتير. جرّب بعد شوي.", 429);
  await fsCommit(env, [{ update: { name: docName(env, path), fields: objToFields({ start, n: n + 1 }) } }]);
}
// ===== بحث شامل بكل أقسام FazerCards (شحن ألعاب، بطاقات هدايا، خدمات يدوية): قراءة بس =====
let FZR_CATALOG = { at: 0, data: null };
async function fzrCategoryPages(env, base) {
  const out = []; let cursor = "";
  for (let i = 0; i < 6; i++) {
    const j = await fzrCall(env, "GET", base + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    for (const it of Array.isArray(j.items) ? j.items : []) { const id = String(it.category_id || ""); if (/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) out.push({ id, name: cleanText(it.name, 80) }); }
    cursor = j.meta && j.meta.has_more && j.meta.next_cursor ? String(j.meta.next_cursor) : ""; if (!cursor) break;
  }
  return out;
}
async function storeSupplierCatalog(env) {
  if (FZR_CATALOG.data && Date.now() - FZR_CATALOG.at < 600000) return FZR_CATALOG.data;
  const data = { topups: [], giftcards: [], manual: [], errors: {} };
  const tasks = [
    ["topups", async () => fzrCategoryPages(env, "/topups?limit=100")],
    ["giftcards", async () => fzrCategoryPages(env, "/giftcards?limit=100")],
    ["manual", async () => { const j = await fzrCall(env, "GET", "/manual-services"); return (Array.isArray(j.items) ? j.items : []).map(it => ({ id: String(it.id || ""), name: cleanText(it.name, 80) })).filter(x => /^[A-Za-z0-9_.:-]{1,80}$/.test(x.id)); }],
  ];
  let firstErr = null;
  for (const [k, fn] of tasks) { try { data[k] = await fn(); } catch (e) { data.errors[k] = e instanceof ApiError ? e.message : "خطأ"; firstErr = firstErr || e; } }
  if (Object.keys(data.errors).length === 3) throw firstErr;
  if (!Object.keys(data.errors).length) FZR_CATALOG = { at: Date.now(), data };            // ما منحفظ نتيجة ناقصة (حتى لو انصلحت الخطة تظهر الأقسام فوراً)
  return data;
}
async function storeSupplierSearch(env, q) {
  const cat = await storeSupplierCatalog(env), words = fzrNorm(q).split(" ").filter(Boolean);
  if (!words.length) throw new ApiError("bad_request", "اكتب اسم التطبيق أو اللعبة.");
  const results = [];
  for (const sec of ["topups", "giftcards", "manual"]) for (const it of cat[sec]) { const n = fzrNorm(it.name); if (words.every(w => n.includes(w))) results.push({ section: sec, id: it.id, name: it.name }); }
  return { results: results.slice(0, 60), errors: cat.errors };
}
async function storeSupplierSectionOffers(env, section, id) {
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) throw new ApiError("bad_request", "طلب غلط.");
  if (section === "topups") { const o = await storeSupplierOffers(env, id); return o.offers.map(x => ({ id: x.offerId, name: x.name, priceUsd: x.priceUsd, note: "" })); }
  if (section === "giftcards") { const j = await fzrCall(env, "GET", "/giftcards/cards?category_id=" + encodeURIComponent(id)); return (Array.isArray(j.offers) ? j.offers : []).map(x => ({ id: String(x.card_id || ""), name: cleanText(x.name, 80), priceUsd: fzrNum(x.price_usd), note: x.stock !== undefined ? "مخزون " + (Number(x.stock) || 0) : "" })).filter(x => x.id && x.priceUsd !== null); }
  if (section === "manual") { const j = await fzrCall(env, "GET", "/manual-services/" + encodeURIComponent(id) + "/offers"); return (Array.isArray(j.items) ? j.items : []).map(x => ({ id: String(x.id || ""), name: cleanText(x.name, 80), priceUsd: fzrNum(x.price_usd), note: Number(x.delivery_minutes) > 0 ? "تسليم خلال " + Number(x.delivery_minutes) + " دقيقة" : "" })).filter(x => x.id && x.priceUsd !== null); }
  throw new ApiError("bad_request", "طلب غلط.");
}
function storeParseSupplierLink(raw) {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") throw new ApiError("bad_supplier_link", "رابط FazerCards غلط.");
  const idRe = /^[A-Za-z0-9_.:-]{1,80}$/, categoryId = String(raw.categoryId || ""), offerId = String(raw.offerId || ""), playerField = raw.playerField === undefined || raw.playerField === "" ? "player_id" : String(raw.playerField);
  if (!idRe.test(categoryId) || !idRe.test(offerId)) throw new ApiError("bad_supplier_link", "اختار القسم والخيار من FazerCards.");
  if (!/^[a-z_]{1,30}$/.test(playerField)) throw new ApiError("bad_supplier_link", "اسم حقل الـID غلط.");
  const costUsd = raw.costUsd === undefined || raw.costUsd === null ? 0 : Number(raw.costUsd);
  const vid = raw.validateCategoryId === undefined || raw.validateCategoryId === null || raw.validateCategoryId === "" ? "" : String(raw.validateCategoryId);
  if (vid && !idRe.test(vid)) throw new ApiError("bad_supplier_link", "معرّف التحقق غلط.");
  return { provider: "fazercards", categoryId, offerId, playerField, categoryName: cleanText(raw.categoryName, 80), validateCategoryId: vid, offerName: cleanText(raw.offerName, 80), costUsd: Number.isFinite(costUsd) && costUsd >= 0 && costUsd < 100000 ? r4(costUsd) : 0 };
}
// ===== التنفيذ التلقائي عند FazerCards (الخطوة 7ج) =====
// الطلب بيبقى "قيد التنفيذ"، والسيرفر بيمرّ على حمايات (اشتراك فعّال، هامش، سقف يومي، رصيد + حجز تجديد الاشتراك)، فإذا كلها تمام بيبعت لـFazerCards بمفتاح تكرار ثابت (ما بيتنفّذ مرتين).
// النتيجة: completed ← تم التنفيذ (والصرف بينحسب)، failed/refund ← استرجاع تلقائي لرصيد الزبون. أي شك أو انقطاع ← بيضل للأدمن (ما في استرجاع تلقائي لحالة مجهولة).
const FZR_FAIL_STATUSES = ["failed", "refund", "refunded", "cancelled", "canceled", "rejected"];
const FZR_RENEW_WINDOW_MS = 7 * 86400000, FZR_LOW_BALANCE_USD = 5, STORE_AUTO_FAIL_REASON = "تعذّر تنفيذ الطلب عند المورّد (غالباً بسبب معرّف اللاعب). أُرجع المبلغ لرصيدك.";
class AutoGate extends Error { constructor(msg) { super(msg); this.gate = true; } }
let FZR_CACHE = { me: null, plans: null, offers: {} };
async function fzrMeCached(env) { const c = FZR_CACHE.me; if (c && Date.now() - c.at < 300000) return c.v; const me = await fzrCall(env, "GET", "/me"); const v = { plan: cleanText(me.plan, 20), planExpiresAt: Date.parse(me.planExpiresAt) || 0, planAutoRenew: me.planAutoRenew === true, subscriptionActive: me.subscriptionActive === true }; FZR_CACHE.me = { at: Date.now(), v }; return v; }
async function fzrPlanPrice(env, plan) { let c = FZR_CACHE.plans; if (!c || Date.now() - c.at > 3600000) { const j = await fzrCall(env, "GET", "/subscription/plans"); c = FZR_CACHE.plans = { at: Date.now(), v: (Array.isArray(j.plans) ? j.plans : []).map(x => ({ plan: String(x.plan || ""), priceUsd: Number(x.priceUsd) || 0 })) }; } const f = c.v.find(x => x.plan === plan); return f ? f.priceUsd : 0; }
async function fzrOffersCached(env, categoryId) { const c = FZR_CACHE.offers[categoryId]; if (c && Date.now() - c.at < 300000) return c.v; const v = (await storeSupplierOffers(env, categoryId)).offers; FZR_CACHE.offers[categoryId] = { at: Date.now(), v }; return v; }
const storeDayKey = (now) => new Date(now).toISOString().slice(0, 10);
const ctEq = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function storeAutoAlert(env, o, id, reason) {
  const au = o.auto || {}; if (au.alertedReason === reason) return false;
  await storeNotify(env, ADMIN_UID, "store_supplier_issue", { code: String(o.code || id), reason }); return true;
}
async function storeAutoSetState(env, id, mutate, attempts) {
  for (let i = 0; i < (attempts || 3); i++) {
    const od = await fsGetDoc(env, "storeOrders/" + id); if (!od.exists) return null;
    const upd = mutate(od.data); if (!upd) return od.data;
    try { await fsCommit(env, [{ update: { name: docName(env, "storeOrders/" + id), fields: objToFields(upd) }, updateMask: { fieldPaths: Object.keys(upd) }, currentDocument: { updateTime: od.updateTime } }]); return { ...od.data, ...upd }; }
    catch (e) { if (!e.conflict || i === (attempts || 3) - 1) throw e; }
  }
  return null;
}
async function storeAutoReleaseCap(env, now, cost) {
  try { const day = storeDayKey(now), dd = await fsGetDoc(env, "storeSupplierDay/" + day); if (!dd.exists) return; await fsCommit(env, [{ update: { name: docName(env, "storeSupplierDay/" + day), fields: objToFields({ spentUsd: r4(Math.max(0, (Number(dd.data.spentUsd) || 0) - cost)), count: Math.max(0, (Number(dd.data.count) || 0) - 1) }) }, updateMask: { fieldPaths: ["spentUsd", "count"] }, currentDocument: { updateTime: dd.updateTime } }]); } catch (e) { /* مو مهم */ }
}
async function storeAutoGates(env, cfg, o, link) {
  if (!env.FAZER_API_KEY) throw new AutoGate("مفتاح FazerCards مو مضاف.");
  if (!/^[\p{L}\p{N}_#@.\- ]{3,40}$/u.test(String(o.playerId || ""))) throw new AutoGate("معرّف اللاعب بصيغة غير مقبولة.");
  const me = await fzrMeCached(env); if (!me.subscriptionActive) throw new AutoGate("اشتراك FazerCards غير فعّال.");
  const offer = (await fzrOffersCached(env, link.categoryId)).find(x => x.offerId === link.offerId); if (!offer) throw new AutoGate("الخيار ما عاد موجود عند FazerCards.");
  const cost = offer.priceUsd, price = Number(o.priceUsd) || 0; if (!(cost > 0) || !(price > 0)) throw new AutoGate("سعر غير معروف.");
  const margin = (price - cost) / price * 100; if (margin + 1e-9 < cfg.minMarginPct) throw new AutoGate("الهامش " + margin.toFixed(1) + "% أقل من حدّك (" + cfg.minMarginPct + "%): بيع " + price + "$ مقابل تكلفة " + cost + "$.");
  const bal = Number((await fzrCall(env, "GET", "/balance")).balance); if (!Number.isFinite(bal)) throw new AutoGate("رصيدك عند FazerCards غير معروف.");
  const now = Date.now(), reserve = me.planAutoRenew && me.planExpiresAt && me.planExpiresAt - now <= FZR_RENEW_WINDOW_MS ? await fzrPlanPrice(env, me.plan) : 0;       // قريب التجديد: ما بنمسّ مبلغ الاشتراك
  if (bal + 1e-9 < cost) throw new AutoGate("رصيدك عند FazerCards (" + bal + "$) ما بيكفي (التكلفة " + cost + "$). اشحنه.");
  if (bal - cost + 1e-9 < reserve) throw new AutoGate("الاشتراك بيتجدد قريباً (" + reserve + "$): التنفيذ بيخلّي رصيدك تحت المبلغ المحجوز. اشحن رصيدك عند FazerCards.");
  return { cost, bal };
}
async function storeAutoGateFail(env, id, od, e, now, counted) {
  let state, reason;
  if (e && e.gate) { state = "manual"; reason = e.message; }
  else if (e && (e.supplierStatus === 401 || e.supplierStatus === 403)) { state = "manual"; reason = "مفتاح FazerCards غير صالح أو الاشتراك/الخدمة غير مفعّلة."; }
  else if (e && e.supplierStatus !== undefined) { state = "retry"; reason = "تعذّر الاتصال بـFazerCards (" + (e.supplierStatus || "شبكة") + ")."; }
  else throw e;
  const au = od.data.auto || {}, tries = (Number(au.tries) || 0) + (state === "retry" && !counted ? 1 : 0);
  if (state === "retry" && tries >= 6) { state = "manual"; reason = "تعذّر الاتصال بـFazerCards عدة مرات. ما نعرف إذا الطلب وصل لهم: تحقق من لوحتهم قبل ما تنفّذه يدوياً."; }
  const alert = state === "manual" ? await storeAutoAlert(env, od.data, id, reason) : false;
  const next = await storeAutoSetState(env, id, o => (o.status === "processing" && !["sent", "done", "refunded"].includes((o.auto || {}).state)) ? { auto: { ...(o.auto || {}), state, reason, at: now, tries, ...(alert ? { alertedReason: reason } : {}) }, updatedAt: now } : null);
  return { outcome: state, reason, order: next };
}
async function storeAutoApplyStatus(env, id, status, supplierOrderId, now) {
  status = String(status || "").toLowerCase();
  const od = await fsGetDoc(env, "storeOrders/" + id); if (!od.exists || od.data.status !== "processing") return { outcome: "closed" };
  const au = od.data.auto || {};
  try {
    if (status === "completed") {
      const r = await storeOrderAction(env, "order_done", id, "FazerCards " + supplierOrderId, "auto", { costUsd: r4(Number(au.costUsd) || 0), auto: { ...au, state: "done", doneAt: now } });
      return { outcome: "done", order: r.order };
    }
    if (FZR_FAIL_STATUSES.includes(status)) {
      const r = await storeOrderAction(env, "order_reject", id, STORE_AUTO_FAIL_REASON, "auto", { auto: { ...au, state: "refunded", supplierStatus: status, doneAt: now } });
      await storeAutoReleaseCap(env, Number(au.at) || now, Number(au.costUsd) || 0);
      return { outcome: "refunded", order: r.order };
    }
  } catch (e) { if (e instanceof ApiError && (e.code === "bad_status" || e.code === "conflict")) return { outcome: "closed" }; throw e; }
  await storeAutoSetState(env, id, o => ({ auto: { ...(o.auto || {}), supplierStatus: status } }));
  return { outcome: "processing" };
}
async function storeAutoFulfill(env, id, opts) {
  opts = opts || {}; const now = Date.now(), { cfg } = await storeLoadSupplier(env);
  if (!cfg.enabled && !opts.force) return { outcome: "disabled" };
  const od = await fsGetDoc(env, "storeOrders/" + id); if (!od.exists) return { outcome: "missing" };
  const o = od.data; if (o.kind !== "order" || o.status !== "processing") return { outcome: "not_open" };
  const au = o.auto || {};
  if (["sent", "done", "refunded"].includes(au.state)) return { outcome: au.state };
  if (au.state === "sending" && now - (Number(au.at) || 0) < 120000 && !opts.force) return { outcome: "busy" };
  const nodes = await storeAllNodes(env), item = nodes.find(n => n.id === o.itemId), link = item && item.supplier && item.supplier.offerId ? item.supplier : null;
  if (!link) return { outcome: "not_linked" };
  let g; try { g = await storeAutoGates(env, cfg, o, link); } catch (e) { return await storeAutoGateFail(env, id, od, e, now); }
  const day = storeDayKey(now), dd = await fsGetDoc(env, "storeSupplierDay/" + day), spent = dd.exists ? Number(dd.data.spentUsd) || 0 : 0;
  if (spent + g.cost > cfg.dailyCapUsd + 1e-9) return await storeAutoGateFail(env, id, od, new AutoGate("السقف اليومي (" + cfg.dailyCapUsd + "$) ما بيكفي لهالطلب (انصرف اليوم " + r4(spent) + "$)."), now);
  const mark = { auto: { ...au, state: "sending", at: now, costUsd: g.cost, tries: (Number(au.tries) || 0) + 1, reason: "" }, updatedAt: now };
  try {
    await fsCommit(env, [{ update: { name: docName(env, "storeOrders/" + id), fields: objToFields(mark) }, updateMask: { fieldPaths: Object.keys(mark) }, currentDocument: { updateTime: od.updateTime } },
      { update: { name: docName(env, "storeSupplierDay/" + day), fields: objToFields({ spentUsd: r4(spent + g.cost), count: (dd.exists ? Number(dd.data.count) || 0 : 0) + 1 }) }, ...(dd.exists ? { updateMask: { fieldPaths: ["spentUsd", "count"] }, currentDocument: { updateTime: dd.updateTime } } : { currentDocument: { exists: false } }) }]);
  } catch (e) { if (e.conflict) return { outcome: "busy" }; throw e; }
  let j;
  try { j = await fzrCall(env, "POST", "/topups/order", { category_id: link.categoryId, offer_id: link.offerId, fields: { [link.playerField || "player_id"]: String(o.playerId) } }, { "Idempotency-Key": "ys-" + id }); }
  catch (e) {
    if (!(e && e.supplierStatus !== undefined)) throw e;
    const st = e.supplierStatus, msg = String(e.supplierMsg || ""), ours = /balance|fund|insufficient|subscription|plan|limit|rate|api.?key|forbidden|unauthori|blocked|disabled/i.test(msg);
    if ((st === 400 || st === 409 || st === 422) && !ours) {                  // رفض واضح: ما انخلق طلب عندهم ← استرجاع تلقائي
      const r = await storeOrderAction(env, "order_reject", id, STORE_AUTO_FAIL_REASON, "auto", { auto: { ...mark.auto, state: "refunded", supplierMsg: msg, doneAt: now } });
      await storeAutoReleaseCap(env, now, g.cost); return { outcome: "refunded", order: r.order };
    }
    if (st === 401 || st === 403 || ((st === 400 || st === 409 || st === 422) && ours)) {     // مشكلتنا (رصيد/اشتراك/مفتاح): بيضل للأدمن
      await storeAutoReleaseCap(env, now, g.cost);
      return await storeAutoGateFail(env, id, { data: { ...o, auto: mark.auto } }, Object.assign(new Error(msg), { supplierStatus: st === 401 || st === 403 ? st : 403 }), now, true);
    }
    return await storeAutoGateFail(env, id, { data: { ...o, auto: mark.auto } }, e, now, true);   // انقطاع/خطأ مؤقت: retry بنفس المفتاح (ما بيتكرر)
  }
  const so = String((j.order && j.order.id) || ""), stNow = String((j.order && j.order.status) || "processing");
  if (!/^ord-\d+$/.test(so)) return await storeAutoGateFail(env, id, { data: { ...o, auto: mark.auto } }, Object.assign(new Error("bad"), { supplierStatus: 0 }), now, true);
  const sent = await storeAutoSetState(env, id, o2 => o2.status === "processing" ? { supplierOrderId: so, auto: { ...(o2.auto || {}), state: "sent", at: now, supplierOrderId: so, supplierStatus: stNow, costUsd: g.cost, reason: "" }, events: storeEvent(o2, "sent", "auto", "FazerCards " + so, now), updatedAt: now } : null, 4);
  const applied = await storeAutoApplyStatus(env, id, stNow, so, now);
  return { outcome: applied.outcome === "processing" ? "sent" : applied.outcome, supplierOrderId: so, order: applied.order || sent };
}
async function storeAutoSync(env, id) {
  const od = await fsGetDoc(env, "storeOrders/" + id); if (!od.exists) return { outcome: "missing" };
  if (od.data.status !== "processing") return { outcome: "closed" };
  const so = String(od.data.supplierOrderId || ""); if (!/^ord-\d+$/.test(so)) return { outcome: "no_supplier_order" };
  const j = await fzrCall(env, "GET", "/orders/" + so);
  return await storeAutoApplyStatus(env, id, j.order && j.order.status, so, Date.now());
}
async function storeAutoSweep(env, now) {
  now = now || Date.now(); if (!env.FAZER_API_KEY) return { skipped: true };       // المتابعة مو مربوطة بالمفتاح العام: أي طلب انبعت فعلاً لازم يكتمل (المفتاح العام بيتحكم بالإرسال الجديد بس)
  const rows = (await storeOrdersByState(env, "auto.state", ["sent", "retry", "sending"], 100)).filter(r => r.data.kind === "order" && r.data.status === "processing"), stats = { retried: 0, synced: 0, late: 0, errors: 0 };
  for (const r of rows.slice(0, 25)) {
    const au = r.data.auto, age = now - (Number(au.at) || 0);
    try {
      if (au.state === "retry" || (au.state === "sending" && age > 120000)) { await storeAutoFulfill(env, r.id, { retry: true, force: true }); stats.retried++; }
      else if (au.state === "sent" && age > 120000) {
        await storeAutoSync(env, r.id); stats.synced++;
        if (age > 90 * 60000 && !au.lateAlerted) { const fresh = await fsGetDoc(env, "storeOrders/" + r.id); if (fresh.exists && fresh.data.status === "processing") { await storeNotify(env, ADMIN_UID, "store_supplier_issue", { code: String(r.data.code || r.id), reason: "الطلب متأخر عند FazerCards (" + Math.round(age / 60000) + " دقيقة). تحقق من لوحتهم." }); await storeAutoSetState(env, r.id, o => ({ auto: { ...(o.auto || {}), lateAlerted: true } })); stats.late++; } }
      }
    } catch (e) { stats.errors++; console.warn({ message: "auto sweep item failed", id: r.id, error: String(e && e.message || e) }); }
  }
  return stats;
}
// مراقبة يومية: اشتراك FazerCards ورصيدك عندهم (تنبيه للأدمن قبل ما توقف الخدمة)
async function storeSupplierWatch(env, now) {
  now = now || Date.now(); if (!env.FAZER_API_KEY) return { skipped: true };
  const me = await fzrCall(env, "GET", "/me"), bal = Number((await fzrCall(env, "GET", "/balance")).balance), alerts = [];
  const exp = Date.parse(me.planExpiresAt) || 0, days = exp ? Math.ceil((exp - now) / 86400000) : null, price = me.subscriptionActive ? await fzrPlanPrice(env, cleanText(me.plan, 20)) : 0;
  if (me.subscriptionActive !== true) alerts.push("اشتراك FazerCards غير فعّال: التنفيذ التلقائي والطلب عندهم متوقف.");
  else if (days !== null && days <= 3 && me.planAutoRenew !== true) alerts.push("اشتراك FazerCards بينتهي خلال " + Math.max(0, days) + " يوم وما فيه تجديد تلقائي.");
  else if (days !== null && days <= 3 && Number.isFinite(bal) && bal < price) alerts.push("اشتراك FazerCards بيتجدد خلال " + Math.max(0, days) + " يوم، ورصيدك (" + bal + "$) أقل من سعر الخطة (" + price + "$). اشحن رصيدك.");
  if (Number.isFinite(bal) && bal < FZR_LOW_BALANCE_USD) alerts.push("رصيدك عند FazerCards منخفض: " + bal + "$.");
  for (const reason of alerts) await storeNotify(env, ADMIN_UID, "store_supplier_issue", { code: "FazerCards", reason });
  return { alerts, balance: bal, days };
}
async function handleFazerWebhook(request, env) {
  const raw = await request.text();
  if (!env.FAZER_WEBHOOK_SECRET) return jsonResponse({ ok: false, error: "not_configured" }, 503);
  const expected = "sha256=" + await hmacHex(env.FAZER_WEBHOOK_SECRET, raw);
  if (!ctEq(request.headers.get("X-Webhook-Signature") || "", expected)) return jsonResponse({ ok: false, error: "bad_signature" }, 401);
  let ev; try { ev = JSON.parse(raw); } catch (e) { return jsonResponse({ ok: false, error: "bad_json" }, 400); }
  const eid = String(ev.event_id || ""), oid = String(ev.data && ev.data.order_id || "");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(eid)) return jsonResponse({ ok: false, error: "bad_event" }, 400);
  try { await fsCommit(env, [{ update: { name: docName(env, "storeSupplierEvents/" + eid), fields: objToFields({ at: Date.now(), event: cleanText(ev.event, 40), orderId: cleanText(oid, 30) }) }, currentDocument: { exists: false } }]); }
  catch (e) { if (e.conflict) return jsonResponse({ ok: true, duplicate: true }, 200); throw e; }
  if (ev.event === "order.status_changed" && /^ord-\d+$/.test(oid)) {
    try { const rows = await fsRunQuery(env, "storeOrders", null, 5, 0, { field: "supplierOrderId", value: oid }); if (rows.length === 1) await storeAutoSync(env, rows[0].id); }
    catch (e) { console.warn({ message: "fazer webhook sync failed", oid, error: String(e && e.message || e) }); }          // الـsweeper بيلحقها
  }
  return jsonResponse({ ok: true }, 200);
}
// ===== تأكيد إيداع USDT تلقائياً من البلوكتشين العلني (BEP20 / TRC20) =====
// الزبون بيدفع لعنوانك مبلغ مميّز (آخر خانات عشرية فريدة لكل طلب مفتوح) وبيلصق رقم العملية (TXID). السيرفر بيقرا الشبكة العلنية بس
// (ما في مفاتيح ولا وصول لأي محفظة): نجاح العملية، عقد USDT الحقيقي، عنوانك، المبلغ بالضبط، عدد التأكيدات، والوقت. أي شك = بيضل لإيدك.
const CHAIN_NET = {
  bep20: { label: "BEP20", contract: "0x55d398326f99059ff775485246999027b3197955", minConf: 10 },
  trc20: { label: "TRC20", contractHex: "a614f803b6fd780986a42c78ec9c7f77e6ded13c", minConf: 0 },
};
const CHAIN_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BSC_RPCS = ["https://bsc-dataseed.bnbchain.org", "https://bsc-dataseed1.bnbchain.org", "https://bsc-dataseed2.bnbchain.org"];
const CHAIN_CLAIM_WINDOW_MS = 24 * 3600000, CHAIN_SKEW_MS = 60000, CHAIN_PENDING_TIMEOUT_MS = 3 * 3600000;
let CHAIN_FAST_MS = [10000, 10000];
const chainSleep = (ms) => new Promise(r => setTimeout(r, ms));
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
async function tronAddrToHex20(addr) {                    // عنوان TRON (T...) ← 20 بايت hex، مع فحص الخانات الأخيرة (checksum)
  addr = String(addr || ""); if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return null;
  let n = 0n; for (const ch of addr) n = n * 58n + BigInt(B58.indexOf(ch));
  const hex = n.toString(16).padStart(50, "0"); if (hex.length !== 50) return null;
  const payload = hex.slice(0, 42), check = hex.slice(42), bytes = Uint8Array.from(payload.match(/../g).map(h => parseInt(h, 16)));
  const h1 = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), h2 = new Uint8Array(await crypto.subtle.digest("SHA-256", h1));
  if ([...h2.slice(0, 4)].map(b => b.toString(16).padStart(2, "0")).join("") !== check || payload.slice(0, 2) !== "41") return null;
  return payload.slice(2);
}
function chainTxid(network, ref) {
  let t = String(ref || "").trim().toLowerCase();
  if (network === "bep20") return /^0x[0-9a-f]{64}$/.test(t) ? t : null;
  t = t.replace(/^0x/, ""); return /^[0-9a-f]{64}$/.test(t) ? t : null;
}
async function bscRpc(env, method, params) {
  const urls = env.BSC_RPC_URL ? [String(env.BSC_RPC_URL), ...BSC_RPCS] : BSC_RPCS; let last = null;
  for (const u of urls) {
    try {
      const res = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
      const j = await res.json(); if (!res.ok || j.error) { last = new Error(String(j.error && j.error.message || res.status)); continue; }
      return j.result;
    } catch (e) { last = e; }
  }
  throw new ApiError("chain_unreachable", "تعذّر الوصول لشبكة BNB Chain.", 502);
}
const chainNorm = (x) => String(x || "").replace(/^0x/i, "").toLowerCase();
async function chainBep20(env, tx, addr) {
  const rc = await bscRpc(env, "eth_getTransactionReceipt", [tx]);
  if (!rc) return { state: "pending", reason: "ما انلقت العملية على شبكة BEP20 بعد." };
  if (rc.status !== "0x1") return { state: "fail", reason: "العملية فشلت على الشبكة." };
  const want = chainNorm(addr); let total = 0n;
  for (const l of Array.isArray(rc.logs) ? rc.logs : []) {
    if (String(l.address || "").toLowerCase() === CHAIN_NET.bep20.contract && Array.isArray(l.topics) && l.topics.length === 3 && chainNorm(l.topics[0]) === CHAIN_TOPIC && chainNorm(l.topics[2]).length === 64 && chainNorm(l.topics[2]).endsWith(want)) { try { total += BigInt(l.data); } catch (e) {} }
  }
  if (total === 0n) return { state: "fail", reason: "ما في تحويل USDT (BEP20) لعنوانك بهالعملية." };
  const amount = Number(total / 10n ** 12n) / 1e6, bn = parseInt(rc.blockNumber, 16), latest = parseInt(await bscRpc(env, "eth_blockNumber", []), 16), conf = latest - bn + 1;
  if (!(conf >= CHAIN_NET.bep20.minConf)) return { state: "pending", reason: "التأكيدات " + Math.max(0, conf) + " من " + CHAIN_NET.bep20.minConf + ".", confirmations: Math.max(0, conf), amount };
  const blk = await bscRpc(env, "eth_getBlockByNumber", [rc.blockNumber, false]);
  return { state: "ok", amount, confirmations: conf, timeMs: (parseInt(blk && blk.timestamp, 16) || 0) * 1000 };
}
async function chainTrc20(env, tx, addr20) {
  const res = await fetch((env.TRON_API_URL ? String(env.TRON_API_URL) : "https://api.trongrid.io") + "/walletsolidity/gettransactioninfobyid", { method: "POST", headers: { "Content-Type": "application/json", ...(env.TRONGRID_KEY ? { "TRON-PRO-API-KEY": String(env.TRONGRID_KEY) } : {}) }, body: JSON.stringify({ value: tx }), signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }).catch(() => null);
  if (!res || !res.ok) throw new ApiError("chain_unreachable", "تعذّر الوصول لشبكة TRON.", 502);
  const j = await res.json().catch(() => null); if (!j || typeof j !== "object") throw new ApiError("chain_unreachable", "رد غير مفهوم من شبكة TRON.", 502);
  if (!j.id) return { state: "pending", reason: "ما انلقت العملية على شبكة TRC20 بعد (أو ما انثبّتت)." };       // نقطة solidity ما بترجّع غير العمليات المثبّتة نهائياً
  if (!j.receipt || j.receipt.result !== "SUCCESS" || (j.result && j.result !== "SUCCESS")) return { state: "fail", reason: "العملية فشلت على الشبكة." };
  let total = 0n;
  for (const l of Array.isArray(j.log) ? j.log : []) {
    let a = chainNorm(l.address); if (a.length === 42 && a.startsWith("41")) a = a.slice(2);
    if (a === CHAIN_NET.trc20.contractHex && Array.isArray(l.topics) && l.topics.length === 3 && chainNorm(l.topics[0]) === CHAIN_TOPIC && chainNorm(l.topics[2]).length === 64 && chainNorm(l.topics[2]).endsWith(addr20)) { try { total += BigInt("0x" + chainNorm(l.data)); } catch (e) {} }
  }
  if (total === 0n) return { state: "fail", reason: "ما في تحويل USDT (TRC20) لعنوانك بهالعملية." };
  return { state: "ok", amount: Number(total) / 1e6, confirmations: 0, timeMs: Number(j.blockTimeStamp) || 0 };
}
async function storeChainTail(env, method, base, now) {            // رقم مميّز صغير (0.0001 لـ0.0099) لكل طلب مفتوح: بيربط الدفعة بالطلب
  const rows = await fsRunQuery(env, "storeOrders", null, 500, 0, { field: "methodId", value: method.id });
  const used = new Set(rows.filter(r => r.data.kind === "topup" && (r.data.status === "awaiting_payment" || r.data.status === "payment_submitted") && now - Number(r.data.createdAt) <= CHAIN_CLAIM_WINDOW_MS).map(r => Math.round(Number(r.data.amount) * 10000)));
  const b = Math.round(base * 10000), start = crypto.getRandomValues(new Uint8Array(1))[0] % 99;
  for (let k = 0; k < 99; k++) { const t = 1 + ((start + k) % 99); if (!used.has(b + t)) return { amount: (b + t) / 10000, tail: t }; }
  throw new ApiError("busy", "الإيداعات المفتوحة بهالمبلغ كتير هلق. جرّب بعد شوي.", 429);
}
async function storeChainVerifyOnce(env, id) {
  const now = Date.now(), od = await fsGetDoc(env, "storeOrders/" + id);
  if (!od.exists) return { outcome: "missing" };
  const o = od.data; if (o.kind !== "topup" || o.status !== "payment_submitted") return { outcome: "not_open" };
  const net = CHAIN_NET[o.autoVerify]; if (!net) return { outcome: "not_auto" };
  const ref = String((o.proof && o.proof.ref) || ""); if (!ref.trim()) return { outcome: "no_ref" };
  const ch = o.chain || {}, submittedAt = Number(o.proof && o.proof.submittedAt) || now, tx = chainTxid(o.autoVerify, ref);
  const set = (patch) => storeAutoSetState(env, id, x => x.status === "payment_submitted" ? { chain: { ...(x.chain || {}), ...patch, at: now }, updatedAt: now } : null);
  const manual = async (reason, extra) => { await set({ state: "manual", reason, ...(extra || {}) }); return { outcome: "manual", reason }; };
  if (!tx) return await manual("رقم العملية مو بصيغة " + net.label + " صحيحة (" + (o.autoVerify === "bep20" ? "0x ثم 64 خانة" : "64 خانة") + ").", { txid: "", network: o.autoVerify });
  if (now - Number(o.createdAt) > CHAIN_CLAIM_WINDOW_MS) return await manual("الطلب أقدم من 24 ساعة.", { txid: tx, network: o.autoVerify });
  const addr = o.autoVerify === "bep20" ? (/^0x[0-9a-fA-F]{40}$/.test(String(o.methodAccount || "")) ? String(o.methodAccount).toLowerCase() : null) : await tronAddrToHex20(o.methodAccount);
  if (!addr) return await manual("عنوان الاستلام بإعدادات طريقة الدفع غير صالح.", { txid: tx, network: o.autoVerify });
  let res;
  try { res = o.autoVerify === "bep20" ? await chainBep20(env, tx, addr) : await chainTrc20(env, tx, addr); }
  catch (e) {
    if (!(e instanceof ApiError) || e.code !== "chain_unreachable") throw e;
    if (now - submittedAt > CHAIN_PENDING_TIMEOUT_MS) return await manual("تعذّر الوصول لشبكة البلوكتشين لفترة طويلة.", { txid: tx, network: o.autoVerify });
    await set({ state: "retry", reason: "تعذّر الاتصال بالشبكة، رح نعيد المحاولة.", tries: (Number(ch.tries) || 0) + 1, txid: tx, network: o.autoVerify }); return { outcome: "retry" };
  }
  if (res.state === "pending") {
    if (now - submittedAt > CHAIN_PENDING_TIMEOUT_MS) return await manual("ما انلقت العملية على الشبكة خلال 3 ساعات: تأكد من الرقم والشبكة (" + net.label + ").", { txid: tx, network: o.autoVerify });
    await set({ state: "pending", reason: res.reason, confirmations: res.confirmations || 0, need: net.minConf, tries: (Number(ch.tries) || 0) + 1, txid: tx, network: o.autoVerify }); return { outcome: "pending" };
  }
  if (res.state === "fail") return await manual(res.reason, { txid: tx, network: o.autoVerify });
  const { cfg: wc } = await storeLoadWallet(env), expected = Number(o.amount), got = res.amount, created = Number(o.createdAt) || 0;
  const why = Math.abs(got - expected) > 0.00005 ? "المبلغ المحوّل " + got + " يختلف عن المطلوب " + expected + " (لازم بالضبط)."
    : res.timeMs < created - CHAIN_SKEW_MS ? "العملية أقدم من وقت طلب الإيداع."
    : res.timeMs > created + CHAIN_CLAIM_WINDOW_MS ? "العملية بعد مهلة الطلب (24 ساعة)."
    : Number(o.priceUsd) > wc.autoCapUsd ? "الإيداع (" + o.priceUsd + "$) فوق سقف التأكيد التلقائي (" + wc.autoCapUsd + "$): راجعه يدوياً." : "";
  if (why) return await manual(why, { txid: tx, network: o.autoVerify, amount: got, confirmations: res.confirmations });
  const cl0 = await storeChainClaimTx(env, id, { ...o, amount: got }, "auto");
  if (!cl0.ok) return await manual("رقم العملية هاد انستعمل لطلب إيداع تاني.", { txid: tx, network: o.autoVerify, amount: got });
  try {
    const r = await storeOrderAction(env, "order_done", id, "تحقق تلقائي من البلوكتشين (" + net.label + ")", "auto", { chain: { ...ch, state: "ok", reason: "", txid: tx, network: o.autoVerify, amount: got, confirmations: res.confirmations, need: net.minConf, at: now } });
    return { outcome: "done", order: r.order };
  } catch (e) { if (e instanceof ApiError && (e.code === "bad_status" || e.code === "conflict")) return { outcome: "closed" }; throw e; }
}
const chainClaimPath = (net, tx) => "storeChainTx/" + net + "_" + tx;
async function storeChainClaimTx(env, id, o, by) {          // يحجز رقم العملية لهالإيداع (مرة وحدة بس): بيرجع {ok:true} أو {ok:false, otherId}
  const tx = chainTxid(o.autoVerify, o.proof && o.proof.ref); if (!tx) return { ok: true, tx: "" };
  try { await fsCommit(env, [{ update: { name: docName(env, chainClaimPath(o.autoVerify, tx)), fields: objToFields({ orderId: id, uid: o.uid, amount: Number(o.amount) || 0, network: o.autoVerify, by, at: Date.now() }) }, currentDocument: { exists: false } }]); return { ok: true, tx }; }
  catch (e) { if (!e.conflict) throw e; const cl = await fsGetDoc(env, chainClaimPath(o.autoVerify, tx)); return cl.exists && cl.data.orderId !== id ? { ok: false, tx, otherId: String(cl.data.orderId || "") } : { ok: true, tx }; }
}
// تأكيد يدوي من الأدمن لإيداع USDT تلقائي: بنقفل رقم عمليته حتى ما حدا يستعمله لإيداع تاني (وبنحذّرك إذا كان مستعمل قبل)
async function storeChainLockForManual(env, id, force) {
  const od = await fsGetDoc(env, "storeOrders/" + id); if (!od.exists) return;
  const o = od.data; if (o.kind !== "topup" || !o.autoVerify) return;
  const r = await storeChainClaimTx(env, id, o, "admin");
  if (!r.ok && !force) { const other = await fsGetDoc(env, "storeOrders/" + r.otherId); throw new ApiError("txid_used", "رقم العملية هاد استُعمل قبل بإيداع " + (other.exists ? String(other.data.code || "ثاني") : "ثاني") + ". إذا متأكد إنها دفعة جديدة، أكّد مرة تانية.", 409); }
}
async function storeChainBackfill(env) {                    // يقفل أرقام عمليات الإيداعات المؤكدة سابقاً (آمن لو تكرر)
  const rows = await fsRunQuery(env, "storeOrders", null, 500, 0, { field: "status", value: "done" }); let locked = 0;
  for (const r of rows) { const o = r.data; if (o.kind !== "topup" || !o.autoVerify) continue; const tx = chainTxid(o.autoVerify, o.proof && o.proof.ref); if (!tx) continue;
    try { await fsCommit(env, [{ update: { name: docName(env, chainClaimPath(o.autoVerify, tx)), fields: objToFields({ orderId: r.id, uid: o.uid, amount: Number(o.amount) || 0, network: o.autoVerify, by: "backfill", at: Date.now() }) }, currentDocument: { exists: false } }]); locked++; } catch (e) { if (!e.conflict) throw e; } }
  return locked;
}
async function storeChainVerify(env, id, opts) {
  let r = await storeChainVerifyOnce(env, id);
  if (opts && opts.fast) for (const ms of CHAIN_FAST_MS) { if (r.outcome !== "pending" && r.outcome !== "retry") break; await chainSleep(ms); r = await storeChainVerifyOnce(env, id); }
  return r;
}
async function storeChainSweep(env, opts) {
  const full = !opts || opts.full !== false;                  // الفحص الشامل (طلبات إلها رقم عملية بدون حالة تحقق) مرة بالساعة بالـcron، وكل مرة لو انطلب مباشرة
  const found = new Map(); for (const r of await storeOrdersByState(env, "chain.state", ["pending", "retry"], 100)) found.set(r.id, r);
  if (full) for (const r of await fsRunQuery(env, "storeOrders", null, 300, 0, { field: "status", value: "payment_submitted" })) if (!r.data.chain) found.set(r.id, r);
  const rows = [...found.values()].filter(r => r.data.kind === "topup" && r.data.status === "payment_submitted" && r.data.autoVerify && r.data.proof && r.data.proof.ref), stats = { checked: 0, done: 0, errors: 0 };
  for (const r of rows.slice(0, 20)) { try { const x = await storeChainVerifyOnce(env, r.id); stats.checked++; if (x.outcome === "done") stats.done++; } catch (e) { stats.errors++; console.warn({ message: "chain sweep item failed", id: r.id, error: String(e && e.message || e) }); } }
  return stats;
}
// ===== أداة الأسعار: حساب أسعار VIP 1..10 لكل المنتجات المربوطة من تكلفة FazerCards الحالية =====
// الهامش = (سعر البيع − التكلفة) ÷ سعر البيع (نفس تعريف حماية التنفيذ التلقائي). السعر بيقرّب لفوق لأقرب خطوة، ودايماً ≥ حدّ الهامش الأدنى، وبينزل تدريجياً من VIP1 لـ10.
const STORE_PRICE_STEPS = [0.01, 0.05, 0.1];
function storeProposePrices(cost, m1, m10, step, minMargin) {
  const ceilS = (x) => Math.round(Math.ceil(x / step - 1e-9) * step * 10000) / 10000, floor = ceilS(cost / (1 - minMargin / 100)), out = [];
  for (let k = 0; k < STORE_VIP_LEVELS; k++) {
    const m = m1 + (m10 - m1) * k / (STORE_VIP_LEVELS - 1);
    let p = Math.max(ceilS(cost / (1 - m / 100)), floor); if (k > 0) p = Math.min(p, out[k - 1]); out.push(p);
  }
  return out;
}
function storePriceParams(b, minMargin) {
  const m1 = Number(b.m1), m10 = Number(b.m10), step = Number(b.step);
  if (!Number.isFinite(m1) || !Number.isFinite(m10) || m10 <= 0 || m1 >= 90) throw new ApiError("bad_margin", "هوامش الربح لازم تكون أرقام بين 0 و90%.");
  if (m1 < m10) throw new ApiError("bad_margin", "هامش VIP 1 لازم يكون أكبر من أو يساوي هامش VIP 10.");
  if (m10 + 1e-9 < minMargin) throw new ApiError("margin_below_min", "هامش VIP 10 (" + m10 + "%) أقل من حدّك الأدنى (" + minMargin + "%) بإعدادات التنفيذ التلقائي. ارفعه أو عدّل الحد.");
  if (!STORE_PRICE_STEPS.includes(step)) throw new ApiError("bad_step", "خطوة التقريب غير مقبولة.");
  return { m1, m10, step };
}
async function storePricePlan(env, nodes, params, minMargin, onlyIds) {
  if (!env.FAZER_API_KEY) throw new ApiError("no_key", "مفتاح FazerCards مو مضاف.");
  const by = new Map(nodes.map(n => [n.id, n])), pathOf = (n) => { const names = []; let cur = String(n.parentId || ""), d = 0; while (cur && d++ < 12) { const q = by.get(cur); if (!q) break; names.unshift(String(q.name || "")); cur = String(q.parentId || ""); } return names.join(" › "); };
  const items = nodes.filter(n => n.type === "item" && n.supplier && n.supplier.offerId && (!onlyIds || onlyIds.has(n.id)));
  const cats = new Map();
  for (const n of items) { const c = String(n.supplier.categoryId || ""); if (cats.has(c)) continue; try { cats.set(c, { offers: (await storeSupplierOffers(env, c)).offers }); } catch (e) { cats.set(c, { error: true }); } }
  return items.map(n => {
    const cat = cats.get(String(n.supplier.categoryId || "")), base = { id: n.id, name: String(n.name || ""), path: pathOf(n), current: Array.isArray(n.prices) ? n.prices.map(Number) : [], oldCostUsd: Number(n.supplier.costUsd) || 0 };
    if (!cat || cat.error) return { ...base, status: "category_error", costUsd: 0, proposed: [] };
    const offer = cat.offers.find(o => o.offerId === n.supplier.offerId); if (!offer) return { ...base, status: "missing_offer", costUsd: 0, proposed: [] };
    if (!(offer.priceUsd > 0)) return { ...base, status: "bad_cost", costUsd: 0, proposed: [] };
    return { ...base, status: "ok", costUsd: offer.priceUsd, proposed: storeProposePrices(offer.priceUsd, params.m1, params.m10, params.step, minMargin) };
  }).sort((a, b) => (a.path + "|" + a.name).localeCompare(b.path + "|" + b.name));
}
async function handleStoreMe(request, env) {
  try {
    const user = await requireUser(request);
    const uid = validId(String(user.sub || ""));
    if (!uid) throw new ApiError("unauthorized", "تسجيل الدخول مطلوب.", 401);
    const now = Date.now(), path = "storeCustomers/" + uid, { sizes } = await storeLoadVipSizes(env), { cfg: wcfg } = await storeLoadWallet(env);
    const name = cleanText(user.name || (user.email ? String(user.email).split("@")[0] : ""), 60) || "زبون";
    const email = cleanText(user.email || "", 120);
    let cur = await fsGetDoc(env, path);
    if (!cur.exists) {
      const c = { name, email, spentUsd: 0, balanceUsd: 0, createdAt: now, lastSeenAt: now };
      try {
        await fsCommit(env, [{ update: { name: docName(env, path), fields: objToFields(c) }, currentDocument: { exists: false } }]);
        return jsonResponse({ ok: true, created: true, customer: storeCustomerOut(uid, c, sizes), wallet: storeWalletView(wcfg) }, 200);
      } catch (e) { if (!e.conflict) throw e; cur = await fsGetDoc(env, path); }          // طلبين بنفس اللحظة: التاني بيقرأ اللي انعمل
    }
    const upd = { lastSeenAt: now };
    if (!cur.data.name && name) upd.name = name;
    if (!cur.data.email && email) upd.email = email;
    await fsCommit(env, [{ update: { name: docName(env, path), fields: objToFields(upd) }, updateMask: { fieldPaths: Object.keys(upd) }, currentDocument: { exists: true } }]);
    return jsonResponse({ ok: true, created: false, customer: storeCustomerOut(uid, { ...cur.data, ...upd }, sizes), wallet: storeWalletView(wcfg) }, 200);
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    console.error({ message: "store me error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}

// ===== طلبات المتجر (الخطوة 5أ): دفع يدوي (رقم عملية و/أو صورة إيصال) والأدمن بيأكّد وبينفّذ =====
// حالات: awaiting_payment ← payment_submitted ← done (أو rejected / cancelled / refunded). وبعد 24 ساعة بدون دفع بتصير "expired" (محسوبة بس).
// السعر بيتحسب بالسيرفر حسب مستوى الزبون وطريقة الدفع، وبينحفظ بالطلب. الصرف وVIP بيتحسبوا لما الأدمن يضغط "تم التنفيذ".
const STORE_QUOTE_MIN = 30, STORE_ORDER_TTL_MS = 24 * 3600 * 1000, STORE_MAX_OPEN_TOPUPS = 3;
const storeRound = (x, d) => Math.round(Number((x * Math.pow(10, d)).toPrecision(12))) / Math.pow(10, d);
function storeVisibleItem(nodes, id) {
  const by = new Map(nodes.map(n => [n.id, n])), n = by.get(id);
  if (!n || n.type !== "item" || n.enabled === false || !storePricesOf(n).length) return null;
  let p = String(n.parentId || ""), g = 0;
  while (p && g++ < 12) { const pn = by.get(p); if (!pn || pn.enabled === false) return null; p = String(pn.parentId || ""); }
  return n;
}
function storeItemPath(nodes, id) { const by = new Map(nodes.map(n => [n.id, n])), out = []; let c = by.get(id), g = 0; while (c && g++ < 12) { out.unshift(String(c.name || "")); c = by.get(String(c.parentId || "")); } return out.join(" › "); }
function storeQuoteFor(item, vip, methods) {
  const pr = storePricesOf(item), priceUsd = pr[Math.min(vip, pr.length) - 1];
  return { priceUsd, methods: methods.filter(m => m.enabled !== false).map(m => ({ id: m.id, name: m.name, currency: m.currency, decimals: m.decimals, amount: storeRound(priceUsd * m.rate * (1 + (Number(m.feePct) || 0) / 100), m.decimals) })) };
}
function storeClosingCheck(data) { if (data && data.closing && data.closing.code) throw new ApiError("account_closing", "حسابك قيد الحذف (طلب " + data.closing.code + "). ما بتقدر تعمل طلبات أو إيداعات جديدة. بتقدر تلغي طلب الحذف من لوحة الحساب."); }
async function storeCustomerCtx(env, uid, forWrite) {
  const cur = await fsGetDoc(env, "storeCustomers/" + uid);
  if (!cur.exists) throw new ApiError("no_account", "افتح حسابك أول (من ☰) وجرّب كمان مرة.");
  if (forWrite) storeClosingCheck(cur.data);
  const { sizes } = await storeLoadVipSizes(env);
  return { cur, vip: storeCustomerOut(uid, cur.data, sizes).vip };
}
function storeOrderOut(id, o, now, admin) {
  const kind = o.kind === "order" || o.kind === "topup" || o.kind === "refund" ? o.kind : "legacy";
  const expired = o.status === "awaiting_payment" && now > Number(o.createdAt) + STORE_ORDER_TTL_MS, status = expired ? "expired" : o.status, pr = o.proof;
  const out = { id, kind, code: String(o.code || ""), itemId: String(o.itemId || ""), itemName: String(o.itemName || ""), itemPath: String(o.itemPath || ""), playerId: String(o.playerId || ""), vip: Number(o.vip) || 1, priceUsd: Number(o.priceUsd) || 0,
    method: { id: String(o.methodId || ""), name: String(o.methodName || ""), currency: String(o.currency || ""), decimals: Number(o.decimals) || 0, account: String(o.methodAccount || ""), instructions: String(o.methodInstructions || ""), autoVerify: String(o.autoVerify || "") },
    chain: o.chain && o.chain.state ? { state: String(o.chain.state), confirmations: Number(o.chain.confirmations) || 0, need: Number(o.chain.need) || 0 } : null,
    amount: Number(o.amount) || 0, status, createdAt: Number(o.createdAt) || 0, quoteEndsAt: Number(o.expiresAt) || 0, quoteExpired: status === "awaiting_payment" && now > Number(o.expiresAt),
    payout: kind === "refund" ? { method: String((o.payout && o.payout.method) || ""), account: String((o.payout && o.payout.account) || "") } : null, finalizePending: o.finalizePending === true, proof: pr && pr.submittedAt ? { ref: String(pr.ref || ""), hasImage: !!pr.hasImage, submittedAt: Number(pr.submittedAt) || 0, late: !!pr.late } : null, rejectReason: String(o.rejectReason || ""), doneAt: Number(o.doneAt) || 0 };
  if (admin) Object.assign(out, { uid: String(o.uid || ""), name: String(o.name || ""), email: String(o.email || ""), adminNote: String(o.adminNote || ""), events: Array.isArray(o.events) ? o.events : [], chainInfo: o.chain && o.chain.state ? { state: String(o.chain.state), reason: String(o.chain.reason || ""), txid: String(o.chain.txid || ""), network: String(o.chain.network || ""), amount: Number(o.chain.amount) || 0, confirmations: Number(o.chain.confirmations) || 0, tries: Number(o.chain.tries) || 0, at: Number(o.chain.at) || 0 } : null, supplierOrderId: String(o.supplierOrderId || ""), costUsd: Number(o.costUsd) || 0, auto: o.auto && o.auto.state ? { state: String(o.auto.state), reason: String(o.auto.reason || ""), supplierMsg: String(o.auto.supplierMsg || ""), supplierStatus: String(o.auto.supplierStatus || ""), costUsd: Number(o.auto.costUsd) || 0, at: Number(o.auto.at) || 0, tries: Number(o.auto.tries) || 0 } : null });
  return out;
}
const storeEvent = (o, action, by, note, at) => [...(Array.isArray(o.events) ? o.events : []), { at, action, by, note: note || "" }].slice(-20);
async function storeNotify(env, uid, type, params) { try { await sendPush(env, uid, type, params); } catch (e) { console.warn({ message: "store notify failed", type, error: String(e.message || e) }); } }
const storeAmountText = (o) => Number(o.amount).toLocaleString("en-US", { minimumFractionDigits: Number(o.decimals) || 0, maximumFractionDigits: Number(o.decimals) || 0 }) + " " + String(o.currency || "");
// ===== حذف حساب المتجر (الخطوة 8): بدون رصيد بينحذف فوراً، ومع رصيد بيتحوّل لطلب سحب (R-1001) والأدمن بيرسل الرصيد ثم بينحذف الحساب =====
// الحذف = مسح الاسم والإيميل ومعرّفات اللاعب والإيصالات، وتحويل سجلات الطلبات والمبالغ لسجلات بدون اسم (للمحاسبة). حساب Firebase وحساب اللعبة ما بيتأثروا.
const storeDelTag = async (uid) => "deleted-" + (await sha256Hex("store-del|" + uid)).slice(0, 12);
async function storeOpenOrderCodes(env, uid, now) {
  const rows = await fsRunQuery(env, "storeOrders", null, 500, 0, { field: "uid", value: uid });
  return rows.map(r => storeOrderOut(r.id, r.data, now, false)).filter(o => (o.kind === "order" && o.status === "processing") || ((o.kind === "topup" || o.kind === "legacy") && (o.status === "awaiting_payment" || o.status === "payment_submitted"))).map(o => o.code);
}
async function storeAnonymizeCustomer(env, uid, keepOrderId) {
  const tag = await storeDelTag(uid), now = Date.now();
  const flush = async (writes) => { for (let i = 0; i < writes.length; i += 200) await fsCommit(env, writes.slice(i, i + 200)); };
  for (const coll of ["storeOrders", "storeLedger", "storeSpendLog", "storeVipLog"]) {
    for (let round = 0; round < 30; round++) {
      const rows = (await fsRunQuery(env, coll, null, 400, 0, { field: "uid", value: uid })).filter(r => !(coll === "storeOrders" && r.id === keepOrderId));
      if (!rows.length) break;
      const writes = [];
      for (const r of rows) {
        if (coll === "storeOrders") {
          const upd = { uid: tag, name: "حساب محذوف", email: "", playerId: "", deletedAt: now }; if (r.data.proof) upd.proof = { ...r.data.proof, ref: "", hasImage: false }; if (r.data.payout) upd.payout = { method: "", account: "" };
          writes.push({ delete: docName(env, "storeProofs/" + r.id) }, { update: { name: docName(env, "storeOrders/" + r.id), fields: objToFields(upd) }, updateMask: { fieldPaths: Object.keys(upd) } });
        } else writes.push({ update: { name: docName(env, coll + "/" + r.id), fields: objToFields({ uid: tag }) }, updateMask: { fieldPaths: ["uid"] } });
      }
      await flush(writes);
    }
  }
  if (keepOrderId) {                                                  // آخر شي: طلب السحب نفسه (حتى لو انقطع الحذف نقدر نعيد المحاولة بالمعرّف الأصلي)
    const od = await fsGetDoc(env, "storeOrders/" + keepOrderId);
    if (od.exists) { const upd = { uid: tag, name: "حساب محذوف", email: "", playerId: "", deletedAt: now, payout: { method: "", account: "" }, finalizePending: false }; await fsCommit(env, [{ update: { name: docName(env, "storeOrders/" + keepOrderId), fields: objToFields(upd) }, updateMask: { fieldPaths: Object.keys(upd) } }]); }
  }
  await fsCommit(env, [{ delete: docName(env, "storeCustomers/" + uid) }, { delete: docName(env, "storeRate/validate_" + uid) }]);
}
async function handleStoreOrderApi(request, env, action, ctx) {
  try {
    const user = await requireUser(request);
    const uid = validId(String(user.sub || "")); if (!uid) throw new ApiError("unauthorized", "تسجيل الدخول مطلوب.", 401);
    let b = {}; try { b = await request.json(); } catch (e) {}
    const now = Date.now();
    if (action === "quote") {                      // سعر منتج بمستوى الزبون + رصيده
      const nodes = await storeAllNodes(env), item = storeVisibleItem(nodes, String(b.itemId || ""));
      if (!item) throw new ApiError("no_item", "هالمنتج مو متوفر هلق.", 404);
      const { cur, vip } = await storeCustomerCtx(env, uid), pr = storePricesOf(item), priceUsd = pr[Math.min(vip, pr.length) - 1], bal = r4(Number(cur.data.balanceUsd) || 0);
      return jsonResponse({ ok: true, quote: { itemId: item.id, name: String(item.name), vip, priceUsd, balanceUsd: bal, enough: bal + 1e-9 >= priceUsd, shortUsd: r4(Math.max(0, priceUsd - bal)) } }, 200);
    }
    if (action === "order") {                      // شراء من الرصيد: بيخصم فوراً، والأدمن بينفّذ
      const nodes = await storeAllNodes(env), item = storeVisibleItem(nodes, String(b.itemId || ""));
      if (!item) throw new ApiError("no_item", "هالمنتج مو متوفر هلق.", 404);
      const playerId = String(b.playerId == null ? "" : b.playerId).trim();
      if (playerId.length < 3 || playerId.length > 40 || !/^[\p{L}\p{N}_#@.\- ]+$/u.test(playerId)) throw new ApiError("bad_player", "اكتب معرّف اللاعب (Player ID) بشكل صحيح (3 لـ40 خانة، أرقام وأحرف).");
      const reqId = String(b.reqId || ""); if (!/^[A-Za-z0-9_-]{8,64}$/.test(reqId)) throw new ApiError("bad_request", "طلب غلط.");
      const id = "o" + (await sha256Hex(uid + "|" + reqId)).slice(0, 20), dup = await fsGetDoc(env, "storeOrders/" + id);
      if (dup.exists) { if (dup.data.uid !== uid) throw new ApiError("bad_request", "طلب غلط."); return jsonResponse({ ok: true, duplicate: true, order: storeOrderOut(id, dup.data, now, false) }, 200); }
      const { cfg } = await storeLoadWallet(env), mine = await fsRunQuery(env, "storeOrders", null, 200, 0, { field: "uid", value: uid });
      if (mine.filter(r => r.data.kind === "order" && r.data.status === "processing").length >= cfg.maxProcessing) throw new ApiError("too_many_open", `عندك ${cfg.maxProcessing} طلبات قيد التنفيذ. استنى لحد ما ننفّذهم قبل ما تطلب غيرهم.`);
      const u = storeUserName(user), { sizes } = await storeLoadVipSizes(env);
      for (let attempt = 0; attempt < 3; attempt++) {
        const cd = await fsGetDoc(env, "storeCustomers/" + uid);
        if (!cd.exists) throw new ApiError("no_account", "افتح حسابك أول (من ☰) وجرّب كمان مرة.");
        storeClosingCheck(cd.data);
        const vip = storeCustomerOut(uid, cd.data, sizes).vip, pr = storePricesOf(item), priceUsd = pr[Math.min(vip, pr.length) - 1], bal = r4(Number(cd.data.balanceUsd) || 0);
        if (bal + 1e-9 < priceUsd) return jsonResponse({ ok: false, error: "insufficient_balance", message: `رصيدك ${bal}$ وسعر الطلب ${priceUsd}$. اشحن رصيدك أول.`, balanceUsd: bal, priceUsd, shortUsd: r4(priceUsd - bal) }, 400);
        const ctr = await nextRequestNo(env, "store"), code = "T-" + ctr.no, newBal = r4(bal - priceUsd);
        const order = { kind: "order", code, no: ctr.no, uid, name: u.name, email: u.email, itemId: item.id, itemName: String(item.name), itemPath: storeItemPath(nodes, item.id), playerId, vip, priceUsd, status: "processing", createdAt: now, updatedAt: now, events: [{ at: now, action: "created", by: "customer", note: "" }] };
        try {
          await fsCommit(env, [ctr.write, { update: { name: docName(env, "storeOrders/" + id), fields: objToFields(order) }, currentDocument: { exists: false } },
            { update: { name: docName(env, "storeCustomers/" + uid), fields: objToFields({ balanceUsd: newBal }) }, updateMask: { fieldPaths: ["balanceUsd"] }, currentDocument: { updateTime: cd.updateTime } },
            { update: { name: docName(env, "storeLedger/" + randomId()), fields: objToFields({ uid, type: "order", amountUsd: -priceUsd, balanceAfter: newBal, ref: code, note: String(item.name), at: now, by: "customer" }) }, currentDocument: { exists: false } }]);
          if (ctx && ctx.waitUntil) ctx.waitUntil(storeAutoFulfill(env, id).catch(e2 => console.warn({ message: "auto fulfill failed", id, error: String(e2 && e2.message || e2) })));   // التنفيذ التلقائي بالخلفية (ما بيأخّر ردّ الزبون)
          return jsonResponse({ ok: true, order: storeOrderOut(id, order, now, false), balanceUsd: newBal }, 200);
        } catch (e) {
          if (!e.conflict || attempt === 2) throw e;
          const again = await fsGetDoc(env, "storeOrders/" + id); if (again.exists && again.data.uid === uid) return jsonResponse({ ok: true, duplicate: true, order: storeOrderOut(id, again.data, now, false) }, 200);
        }
      }
    }
    if (action === "topup_quote" || action === "topup") {          // إيداع رصيد: نفس نظام الإيصال، المبلغ بالدولار
      const { cfg } = await storeLoadWallet(env), amountUsd = r2(Number(b.amountUsd));
      if (!Number.isFinite(amountUsd) || amountUsd < cfg.minTopupUsd || amountUsd > cfg.maxTopupUsd) throw new ApiError("bad_amount", `مبلغ الإيداع من ${cfg.minTopupUsd}$ لـ${cfg.maxTopupUsd}$.`);
      const methods = await storeLoadMethods(env), qm = storeQuoteFor({ prices: [amountUsd] }, 1, methods);
      if (action === "topup_quote") return jsonResponse({ ok: true, quote: { amountUsd, validMinutes: STORE_QUOTE_MIN, minUsd: cfg.minTopupUsd, maxUsd: cfg.maxTopupUsd, methods: qm.methods } }, 200);
      const method = methods.find(m => m.id === String(b.methodId || "") && m.enabled !== false), am = method && qm.methods.find(m => m.id === method.id);
      if (!method) throw new ApiError("no_method", "اختار طريقة دفع.");
      const reqId = String(b.reqId || ""); if (!/^[A-Za-z0-9_-]{8,64}$/.test(reqId)) throw new ApiError("bad_request", "طلب غلط.");
      const { cur, vip } = await storeCustomerCtx(env, uid, true), id = "o" + (await sha256Hex(uid + "|" + reqId)).slice(0, 20), dup = await fsGetDoc(env, "storeOrders/" + id);
      if (dup.exists) { if (dup.data.uid !== uid) throw new ApiError("bad_request", "طلب غلط."); return jsonResponse({ ok: true, duplicate: true, order: storeOrderOut(id, dup.data, now, false) }, 200); }
      const mine = await fsRunQuery(env, "storeOrders", null, 200, 0, { field: "uid", value: uid });
      if (mine.filter(r => r.data.kind === "topup" && (r.data.status === "payment_submitted" || storeOrderOut(r.id, r.data, now, false).status === "awaiting_payment")).length >= STORE_MAX_OPEN_TOPUPS) throw new ApiError("too_many_open", `عندك ${STORE_MAX_OPEN_TOPUPS} إيداعات مفتوحة. خلّصهم أو ألغي واحد قبل ما تعمل غيرهم.`);
      const u = storeUserName(user);
      for (let attempt = 0; attempt < 3; attempt++) {
        const ctr = await nextRequestNo(env, "deposit"), code = "D-" + ctr.no;
        const tailed = method.autoVerify ? await storeChainTail(env, method, am.amount, now) : null;
        const order = { kind: "topup", code, no: ctr.no, uid, name: u.name, email: u.email, itemId: "", itemName: "إيداع رصيد", itemPath: "إيداع رصيد", playerId: "", vip, priceUsd: amountUsd, methodId: method.id, methodName: method.name, currency: method.currency, decimals: tailed ? 4 : method.decimals, autoVerify: method.autoVerify || "", rate: method.rate, feePct: Number(method.feePct) || 0, amount: tailed ? tailed.amount : am.amount, methodAccount: String(method.account || ""), methodInstructions: String(method.instructions || ""), status: "awaiting_payment", createdAt: now, expiresAt: now + STORE_QUOTE_MIN * 60000, updatedAt: now, events: [{ at: now, action: "created", by: "customer", note: "" }] };
        try {
          await fsCommit(env, [ctr.write, { update: { name: docName(env, "storeOrders/" + id), fields: objToFields(order) }, currentDocument: { exists: false } }]);
          return jsonResponse({ ok: true, order: storeOrderOut(id, order, now, false) }, 200);
        } catch (e) {
          if (!e.conflict || attempt === 2) throw e;
          const again = await fsGetDoc(env, "storeOrders/" + id); if (again.exists && again.data.uid === uid) return jsonResponse({ ok: true, duplicate: true, order: storeOrderOut(id, again.data, now, false) }, 200);
        }
      }
    }
    if (action === "validate") {
      const nodes = await storeAllNodes(env), item = storeVisibleItem(nodes, String(b.itemId || ""));
      if (!item) throw new ApiError("no_item", "هالمنتج مو متوفر هلق.", 404);
      const link = item.supplier && item.supplier.offerId ? item.supplier : null;
      if (!link || !env.FAZER_API_KEY) return jsonResponse({ ok: true, supported: false }, 200);          // المنتج مو مربوط: ما في تحقق (الشراء عادي)
      const playerId = String(b.playerId == null ? "" : b.playerId).trim();
      if (playerId.length < 3 || playerId.length > 40 || !/^[\p{L}\p{N}_#@.\- ]+$/u.test(playerId)) throw new ApiError("bad_player", "اكتب معرّف اللاعب (Player ID) بشكل صحيح (3 لـ40 خانة، أرقام وأحرف).");
      await storeRateHit(env, uid, "validate", 30, 3600);
      try {
        const v = storeFindValidator(await storeSupplierValidators(env), link);
        if (!v) return jsonResponse({ ok: true, supported: false }, 200);
        const key = v.fields.includes(link.playerField) ? link.playerField : (v.fields[0] || "player_id");
        const j = await fzrCall(env, "POST", "/topups/validate-id", { category_id: v.categoryId, fields: { [key]: playerId } });
        return jsonResponse({ ok: true, supported: true, available: true, valid: j.valid === true, playerName: cleanText(j.player_name, 60), region: cleanText(j.region, 20) }, 200);
      } catch (e) {
        if (e instanceof ApiError && (e.code === "supplier_error" || e.code === "supplier_unreachable")) return jsonResponse({ ok: true, supported: true, available: false }, 200);     // المورّد مو متاح: ما منمنع الشراء
        throw e;
      }
    }
    if (action === "delete") {
      const op = String(b.op || ""), cd0 = await fsGetDoc(env, "storeCustomers/" + uid);
      if (!cd0.exists) throw new ApiError("no_account", "ما في حساب متجر لهالمستخدم.");
      const bal = r4(Number(cd0.data.balanceUsd) || 0);
      if (op === "check") {
        const openOrders = await storeOpenOrderCodes(env, uid, now), cl = cd0.data.closing && cd0.data.closing.code ? { code: String(cd0.data.closing.code), amountUsd: r4(Number(cd0.data.closing.amountUsd) || 0) } : null;
        return jsonResponse({ ok: true, balanceUsd: bal, openOrders, closing: cl, canDelete: !openOrders.length && !cl }, 200);
      }
      if (op === "cancel") {
        for (let attempt = 0; attempt < 3; attempt++) {
          const cd = await fsGetDoc(env, "storeCustomers/" + uid), cl = cd.data && cd.data.closing;
          if (!cl || !cl.code) throw new ApiError("not_closing", "ما في طلب حذف لإلغائه.");
          const od = await fsGetDoc(env, "storeOrders/" + String(cl.orderId || ""));
          if (!od.exists || od.data.uid !== uid || od.data.status !== "processing") throw new ApiError("bad_status", "ما بتقدر تلغي الطلب هلق (تم التعامل معه).");
          const back = r4(Number(cl.amountUsd) || 0), nb = r4((Number(cd.data.balanceUsd) || 0) + back);
          const upd = { status: "cancelled", updatedAt: now, events: storeEvent(od.data, "cancelled", "customer", "", now) };
          try {
            await fsCommit(env, [
              { update: { name: docName(env, "storeOrders/" + cl.orderId), fields: objToFields(upd) }, updateMask: { fieldPaths: Object.keys(upd) }, currentDocument: { updateTime: od.updateTime } },
              { update: { name: docName(env, "storeCustomers/" + uid), fields: objToFields({ balanceUsd: nb, closing: null }) }, updateMask: { fieldPaths: ["balanceUsd", "closing"] }, currentDocument: { updateTime: cd.updateTime } },
              { update: { name: docName(env, "storeLedger/" + randomId()), fields: objToFields({ uid, type: "payout_return", amountUsd: back, balanceAfter: nb, ref: String(cl.code), note: "ألغى طلب الحذف", at: now, by: "customer" }) }, currentDocument: { exists: false } }]);
            return jsonResponse({ ok: true, balanceUsd: nb }, 200);
          } catch (e) { if (!e.conflict || attempt === 2) throw e; }
        }
      }
      if (op === "request") {
        if (b.confirm !== true) throw new ApiError("confirm_required", "أكّد إنك فاهم إنه الحذف نهائي.");
        const reqId = String(b.reqId || ""); if (!/^[A-Za-z0-9_-]{8,64}$/.test(reqId)) throw new ApiError("bad_request", "طلب غلط.");
        const id = "o" + (await sha256Hex(uid + "|del|" + reqId)).slice(0, 20), dup = await fsGetDoc(env, "storeOrders/" + id);
        if (dup.exists) { if (dup.data.uid !== uid) throw new ApiError("bad_request", "طلب غلط."); return jsonResponse({ ok: true, duplicate: true, request: storeOrderOut(id, dup.data, now, false) }, 200); }
        if (cd0.data.closing && cd0.data.closing.code) throw new ApiError("already_closing", "عندك طلب حذف قيد المراجعة (" + cd0.data.closing.code + ").");
        const open = await storeOpenOrderCodes(env, uid, now);
        if (open.length) throw new ApiError("has_open", "عندك طلبات مفتوحة (" + open.slice(0, 5).join("، ") + "). استنى لحد ما تخلص قبل ما تحذف حسابك.");
        if (bal < 0.01) { await storeAnonymizeCustomer(env, uid, ""); return jsonResponse({ ok: true, deleted: true }, 200); }
        const method = cleanText(b.payoutMethod, 40), account = cleanText(b.payoutAccount, 120);
        if (method.length < 2 || account.length < 3) throw new ApiError("payout_required", "عندك رصيد: اكتب طريقة استلامه (مثلاً شام كاش أو USDT) وحسابك.");
        const u = storeUserName(user), { sizes } = await storeLoadVipSizes(env);
        for (let attempt = 0; attempt < 3; attempt++) {
          const cd = await fsGetDoc(env, "storeCustomers/" + uid), cur = r4(Number(cd.data.balanceUsd) || 0);
          if (cur < 0.01) throw new ApiError("bad_status", "رصيدك تغيّر. جرّب كمان مرة.");
          const ctr = await nextRequestNo(env, "refund"), code = "R-" + ctr.no, vip = storeCustomerOut(uid, cd.data, sizes).vip;
          const order = { kind: "refund", code, no: ctr.no, uid, name: u.name, email: u.email, itemId: "", itemName: "طلب سحب الرصيد وحذف الحساب", itemPath: "طلب سحب الرصيد وحذف الحساب", playerId: "", vip, priceUsd: cur, payout: { method, account }, status: "processing", createdAt: now, updatedAt: now, events: [{ at: now, action: "created", by: "customer", note: "" }] };
          try {
            await fsCommit(env, [ctr.write, { update: { name: docName(env, "storeOrders/" + id), fields: objToFields(order) }, currentDocument: { exists: false } },
              { update: { name: docName(env, "storeCustomers/" + uid), fields: objToFields({ balanceUsd: 0, closing: { orderId: id, code, amountUsd: cur, requestedAt: now } }) }, updateMask: { fieldPaths: ["balanceUsd", "closing"] }, currentDocument: { updateTime: cd.updateTime } },
              { update: { name: docName(env, "storeLedger/" + randomId()), fields: objToFields({ uid, type: "payout_hold", amountUsd: -cur, balanceAfter: 0, ref: code, note: method, at: now, by: "customer" }) }, currentDocument: { exists: false } }]);
            await storeNotify(env, ADMIN_UID, "store_refund_request", { code, amount: cur.toFixed(2), method });
            return jsonResponse({ ok: true, request: storeOrderOut(id, order, now, false) }, 200);
          } catch (e) { if (!e.conflict || attempt === 2) throw e; const again = await fsGetDoc(env, "storeOrders/" + id); if (again.exists && again.data.uid === uid) return jsonResponse({ ok: true, duplicate: true, request: storeOrderOut(id, again.data, now, false) }, 200); }
        }
      }
      throw new ApiError("bad_request", "طلب غلط.");
    }
    if (action === "prices") {            // أسعار كل المنتجات الظاهرة بمستوى VIP تبع الزبون (بتتحسب بالسيرفر)
      const nodes = await storeAllNodes(env), { vip } = await storeCustomerCtx(env, uid), prices = {};
      for (const n of nodes) { const it = storeVisibleItem(nodes, n.id); if (it) { const pr = storePricesOf(it); prices[it.id] = pr[Math.min(vip, pr.length) - 1]; } }
      return jsonResponse({ ok: true, vip, prices }, 200);
    }
    if (action === "orders") {
      const rows = (await fsRunQuery(env, "storeOrders", null, 200, 0, { field: "uid", value: uid })).sort((a, c2) => (Number(c2.data.createdAt) || 0) - (Number(a.data.createdAt) || 0)).slice(0, 30);
      return jsonResponse({ ok: true, orders: rows.map(r => storeOrderOut(r.id, r.data, now, false)) }, 200);
    }
    if (action === "proof" || action === "cancel") {
      const id = validId(String(b.orderId || "")); if (!id) throw new ApiError("bad_request", "طلب غلط.");
      const od = await fsGetDoc(env, "storeOrders/" + id);
      if (!od.exists || od.data.uid !== uid) throw new ApiError("not_found", "هالطلب مو موجود.", 404);
      const o = od.data, view = storeOrderOut(id, o, now, false);
      if (action === "cancel") {
        if (view.kind === "order") throw new ApiError("bad_status", "طلبك قيد التنفيذ. تواصل معنا إذا في مشكلة.");
        if (view.status !== "awaiting_payment") throw new ApiError("bad_status", "بتقدر تلغي قبل ما ترسل الدفع بس.");
        const upd = { status: "cancelled", updatedAt: now, events: storeEvent(o, "cancelled", "customer", "", now) };
        await fsCommit(env, [{ update: { name: docName(env, "storeOrders/" + id), fields: objToFields(upd) }, updateMask: { fieldPaths: Object.keys(upd) }, currentDocument: { updateTime: od.updateTime } }]);
        return jsonResponse({ ok: true, order: storeOrderOut(id, { ...o, ...upd }, now, false) }, 200);
      }
      if (view.status !== "awaiting_payment" && view.status !== "payment_submitted") throw new ApiError("bad_status", view.status === "expired" ? "انتهت صلاحية الطلب. اعمل طلب جديد." : "هالطلب مو بحالة بتسمح بإرسال دفع.");
      const ref = cleanText(b.ref, 120); let image = "";
      if (b.image !== undefined && b.image !== "" && b.image !== null) { if (typeof b.image === "string" && b.image.length <= STORE_IMG_MAX && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.image)) image = b.image; else throw new ApiError("bad_image", "الصورة لازم تكون PNG أو JPEG أو WebP وحجمها صغير."); }
      if (o.autoVerify && ref) { const tx = chainTxid(o.autoVerify, ref); if (tx) { const cl = await fsGetDoc(env, chainClaimPath(o.autoVerify, tx)); if (cl.exists && cl.data.orderId !== id) throw new ApiError("txid_used", "رقم العملية هاد استُعمل قبل بإيداع ثاني. كل تحويل إله رقم عملية خاص فيه: حوّل مبلغ جديد واستعمل رقمه.", 400); } }
      const hadImage = !!(o.proof && o.proof.hasImage);
      if (!ref && !image && !hadImage) throw new ApiError("bad_proof", "اكتب رقم العملية أو ارفق صورة الإيصال.");
      const proof = { ref: ref || (o.proof && o.proof.ref) || "", hasImage: !!image || hadImage, submittedAt: now, late: now > Number(o.expiresAt) };
      const upd = { status: "payment_submitted", proof, updatedAt: now, events: storeEvent(o, "proof", "customer", proof.late ? "late" : "", now) };
      if (ref && ref !== String((o.proof && o.proof.ref) || "")) upd.chain = null;                              // رقم عملية جديد: التحقق من الصفر
      const writes = [{ update: { name: docName(env, "storeOrders/" + id), fields: objToFields(upd) }, updateMask: { fieldPaths: Object.keys(upd) }, currentDocument: { updateTime: od.updateTime } }];
      if (image) writes.push({ update: { name: docName(env, "storeProofs/" + id), fields: objToFields({ data: image, ver: now }) } });
      await fsCommit(env, writes);
      await storeNotify(env, ADMIN_UID, "store_proof", { code: o.code, item: o.itemName, amount: storeAmountText(o), late: proof.late, player: o.playerId });
      if (o.autoVerify && proof.ref && ctx && ctx.waitUntil) ctx.waitUntil(storeChainVerify(env, id, { fast: true }).catch(e2 => console.warn({ message: "chain verify failed", id, error: String(e2 && e2.message || e2) })));
      return jsonResponse({ ok: true, order: storeOrderOut(id, { ...o, ...upd }, now, false) }, 200);
    }
    throw new ApiError("bad_action", "طلب غلط.", 404);
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    console.error({ message: "store order error", action, error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}
function storeUserName(user) { return { name: cleanText(user.name || (user.email ? String(user.email).split("@")[0] : ""), 60) || "زبون", email: cleanText(user.email || "", 120) }; }

// ===== تنظيف صور الإيصالات: بتنحذف بعد 90 يوم من آخر تحديث للطلب (حسب سياسة الخصوصية) =====
// بنحتفظ بالطلب ورقم العملية (للمحاسبة)، وبنمسح الصورة بس. بيشتغل يومياً مع الـcron، وبتقدر تشغّله من الأدمن.
const STORE_PROOF_RETENTION_MS = 90 * 86400000;
async function storeRetentionSweep(env, now) {
  now = now || Date.now(); const cutoff = now - STORE_PROOF_RETENTION_MS; let purged = 0;
  for (const st of ["done", "rejected", "cancelled", "refunded", "payment_submitted", "awaiting_payment"]) {
    const rows = (await fsRunQuery(env, "storeOrders", null, 500, 0, { field: "status", value: st })).filter(r => r.data.proof && r.data.proof.hasImage && (Number(r.data.updatedAt) || Number(r.data.createdAt) || now) < cutoff);
    for (let i = 0; i < rows.length; i += 100) {
      const writes = [];
      for (const r of rows.slice(i, i + 100)) {
        writes.push({ delete: docName(env, "storeProofs/" + r.id) });
        writes.push({ update: { name: docName(env, "storeOrders/" + r.id), fields: objToFields({ proof: { ...r.data.proof, hasImage: false, purgedAt: now } }) }, updateMask: { fieldPaths: ["proof"] } });
      }
      await fsCommit(env, writes); purged += writes.length / 2;
    }
  }
  return purged;
}
// ===== رقم تعريف الطلب =====
// كل طلب جديد بياخد رقم تسلسلي: W-1001 للسحب، S-1001 لطلبات المتجر (والشراء P-xxxxx مشتق من معرّف المستند). الطلبات القديمة بدون رقم بتاخد رمز مشتق من معرّفها.
const REQ_WORD = { ar: "رقم الطلب", tr: "Talep no", en: "Request no" };
function reqCodeFallback(prefix, id) { return prefix + "-" + String(id || "").slice(0, 5).toUpperCase(); }
function reqCodeOf(prefix, id, data) { return (data && data.reqCode) || reqCodeFallback(prefix, id); }
async function nextRequestNo(env, name) {          // بيتكتب بنفس الـcommit تبع الطلب، فإذا تضارب طلبين بيعيد المحاولة برقم جديد (ما بيتكرر رقم)
  const d = await fsGetDoc(env, "counters/" + name);
  const no = (d.exists && Number(d.data.n) > 1000 ? Number(d.data.n) : 1000) + 1;
  return { no, write: { update: { name: docName(env, "counters/" + name), fields: objToFields({ n: no }) }, currentDocument: d.exists ? { updateTime: d.updateTime } : { exists: false } } };
}
async function notifyRequestReceived(env, uid, info) {      // رسالة بريد داخل اللعبة بتأكيد الاستلام مع الرقم (ما بتفشّل الطلب إذا فشلت)
  try {
    const w = REQ_WORD, c = info.code;
    const T = info.kind === "withdraw"
      ? { ar: ["استلمنا طلب سحبك ✅", `${w.ar}: ${c}\nالمبلغ: ${info.label}\nرح نراجعه ونبلّغك. احتفظ بالرقم إذا احتجت تتواصل معنا.`], tr: ["Çekim talebini aldık ✅", `${w.tr}: ${c}\nTutar: ${info.label}\nİnceleyip sana haber vereceğiz. Bize ulaşman gerekirse numarayı sakla.`], en: ["We received your withdrawal request ✅", `${w.en}: ${c}\nAmount: ${info.label}\nWe'll review it and let you know. Keep the number in case you need to contact us.`] }
      : { ar: ["استلمنا طلبك ✅", `${w.ar}: ${c}\n«${info.names.ar}»\nرح ننفّذه ونبلّغك. احتفظ بالرقم إذا احتجت تتواصل معنا.`], tr: ["Siparişini aldık ✅", `${w.tr}: ${c}\n«${info.names.tr}»\nİşleme alıp sana haber vereceğiz. Bize ulaşman gerekirse numarayı sakla.`], en: ["We received your order ✅", `${w.en}: ${c}\n“${info.names.en}”\nWe'll process it and let you know. Keep the number in case you need to contact us.`] };
    await appendInbox(env, "inbox/" + uid, { id: randomId(), title: T.ar[0], body: T.ar[1], title_tr: T.tr[0], body_tr: T.tr[1], title_en: T.en[0], body_en: T.en[1], createdAt: Date.now() });
  } catch (e) { console.warn({ message: "request received notice failed", error: String(e.message || e) }); }
}
async function notifyWithdrawResult(env, uid, type, params) {   // بريد داخل اللعبة + إشعار، كلاهما فيهم رقم الطلب
  try {
    const t = l => PUSH_TEXT[type][l](params);
    await appendInbox(env, "inbox/" + uid, { id: randomId(), title: t("ar")[0], body: t("ar")[1], title_tr: t("tr")[0], body_tr: t("tr")[1], title_en: t("en")[0], body_en: t("en")[1], createdAt: Date.now() });
  } catch (e) { console.warn({ message: "withdraw result inbox failed", error: String(e.message || e) }); }
  await sendPush(env, uid, type, params);
}

// ===== علامة "هالمحفظة مستخدمة بحساب تاني" (حماية من الحسابات المتعددة؛ علامة بس، ما بنمنع السحب) =====
// فهرس walletIndex/{بصمة العنوان}.uids = الحسابات يلي طلبت سحب لهالعنوان. العنوان نفسه ما بينحفظ هون، بس بصمته.
function normalizeWallet(a) { const t = String(a || "").trim().replace(/\s+/g, ""); return /^0x[0-9a-fA-F]{40}$/.test(t) ? t.toLowerCase() : t; }
async function walletKey(a) { return (await sha256Hex("wallet|" + normalizeWallet(a))).slice(0, 40); }
// الأدمن: يبني الفهرس من طلبات السحب القديمة ويعلّم الطلبات يلي محفظتها مشتركة (بيشتغل مرة وحدة بعد التفعيل، وآمن يتكرر)
async function handleAdminWalletReindex(request, env) {
  if (!(await adminOnly(request))) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  try {
    const rows = (await fsRunQuery(env, "withdrawRequests", "createdAt", 1000)).filter(r => !r.data.accountDeleted && r.data.uid && r.data.walletAddress && !String(r.data.uid).includes("/"));
    const byKey = new Map();
    for (const r of rows) { r.k = await walletKey(r.data.walletAddress); if (!byKey.has(r.k)) byKey.set(r.k, new Set()); byKey.get(r.k).add(String(r.data.uid)); }
    const writes = [];
    for (const [k, set] of byKey) writes.push({ update: { name: docName(env, "walletIndex/" + k), fields: objToFields({ uids: [...set] }) } });
    let flagged = 0;
    for (const r of rows) {
      const set = byKey.get(r.k), others = [...set].filter(u => u !== String(r.data.uid)).slice(0, 5), shared = others.length > 0;
      if (shared) flagged++;
      writes.push({ update: { name: docName(env, "withdrawRequests/" + r.id), fields: objToFields({ walletShared: shared, walletOtherUids: others }) }, updateMask: { fieldPaths: ["walletShared", "walletOtherUids"] } });
    }
    for (let i = 0; i < writes.length; i += 400) await fsCommit(env, writes.slice(i, i + 400));
    return jsonResponse({ ok: true, requests: rows.length, wallets: byKey.size, sharedWallets: [...byKey.values()].filter(x => x.size > 1).length, flaggedRequests: flagged, capped: rows.length >= 1000 }, 200);
  } catch (e) {
    console.error({ message: "wallet reindex error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}

// ===== سياسة عدم النشاط =====
// 15 يوم تذكير ← 35 يوم تحذير ← 60 يوم تنفيذ (بعد مهلة بعد التحذير): الحساب "المحسوب" (كسب نقاط من نشاط أو شحن نقاط أو عنده رصيد) بيتعلّق، وغير المحسوب (نقاطه من المكافأة اليومية بس) بينحذف.
// مطفية افتراضياً. الأدمن بيجرّب "بدون تنفيذ" وبعدين بيفعّلها. المهمة بتشتغل يومياً (cron) وفيها حد أقصى للإجراءات بكل مرة.
const INACT_DEFAULTS = { enabled: false, remindDays: 15, warnDays: 35, actionDays: 60, graceDays: 7, maxActions: 20 };
function inactivityNorm(o) {
  const n = (v, d, lo, hi) => { const k = Number(v); return Number.isFinite(k) ? Math.min(hi, Math.max(lo, Math.floor(k))) : d; };
  o = o || {};
  const remindDays = n(o.remindDays, INACT_DEFAULTS.remindDays, 1, 365);
  const warnDays = Math.max(remindDays + 1, n(o.warnDays, INACT_DEFAULTS.warnDays, 1, 365));
  const actionDays = Math.max(warnDays + 1, n(o.actionDays, INACT_DEFAULTS.actionDays, 1, 730));
  return { enabled: o.enabled === true, remindDays, warnDays, actionDays, graceDays: n(o.graceDays, INACT_DEFAULTS.graceDays, 1, 60), maxActions: n(o.maxActions, INACT_DEFAULTS.maxActions, 1, 200) };
}
function dayNum(d) { const [y, m, dd] = String(d || "").split("-").map(Number); return Math.floor(Date.UTC(y, (m || 1) - 1, dd || 1) / 86400000); }
function shiftDate(d, days) { return new Date((dayNum(d) + days) * 86400000).toISOString().slice(0, 10); }
// حساب "محسوب"؟ كسب نقاط من نشاط، أو شحن نقاط، أو عنده رصيد أو سحوبات. المكافأة اليومية وهدية البداية وحدها ما بتحسب.
async function classifyAccount(env, uid, p) {
  if (p.earnedActive === true) return { counted: true, reason: "كسب نقاط من نشاط أو شحن نقاط" };
  if (Number(p.balanceUsd) > 0.0001) return { counted: true, reason: "عنده رصيد" };
  if (Number(p.withdrawCount) > 0) return { counted: true, reason: "عنده سحوبات" };
  if (Number(p.adsWatched) > 0) return { counted: true, reason: "شاهد إعلانات" };
  const [ot, rc] = await Promise.all([fsRunQuery(env, "offerTx", null, 1, 0, { field: "uid", value: uid }), fsRunQuery(env, "redeemCodes", null, 1, 0, { field: "usedBy", value: uid })]);
  if (ot.length) return { counted: true, reason: "كسب من جدار المهام" };
  if (rc.length) return { counted: true, reason: "شحن نقاط بكود" };
  return { counted: false, reason: "نقاطه من المكافأة اليومية وهدية البداية بس" };
}
async function inactivityNotify(env, uid, kind, params) {
  const T = kind === "remind"
    ? { ar: ["اشتقنالك! 👋", `صرلك ${params.days} يوم ما فتحت Yardova. ارجع وكمّل لعبك.`], tr: ["Seni özledik! 👋", `${params.days} gündür Yardova'yı açmadın. Dön ve oynamaya devam et.`], en: ["We miss you! 👋", `You haven't opened Yardova for ${params.days} days. Come back and keep playing.`] }
    : { ar: ["تنبيه: حسابك غير نشط", params.counted ? `إذا ما رجعت خلال ${params.left} يوم، رح نعلّق حسابك (بيضل محفوظ ورصيدك آمن).` : `إذا ما رجعت خلال ${params.left} يوم، رح ينحذف حسابك.`], tr: ["Uyarı: hesabın etkin değil", params.counted ? `${params.left} gün içinde dönmezsen hesabını askıya alacağız (saklı kalır, bakiyen güvende).` : `${params.left} gün içinde dönmezsen hesabın silinecek.`], en: ["Heads-up: your account is inactive", params.counted ? `If you don't come back within ${params.left} days, we'll suspend your account (it stays saved and your balance is safe).` : `If you don't come back within ${params.left} days, your account will be deleted.`] };
  try { await appendInbox(env, "inbox/" + uid, { id: randomId(), title: T.ar[0], body: T.ar[1], title_tr: T.tr[0], body_tr: T.tr[1], title_en: T.en[0], body_en: T.en[1], createdAt: Date.now() }); }
  catch (e) { console.warn({ message: "inactivity inbox failed", error: String(e.message || e) }); }
  await sendPush(env, uid, "inactive_" + kind, params);
}
async function runInactivity(env, { dryRun = false, now = Date.now() } = {}) {
  const cfg = inactivityNorm((await fsGetDoc(env, "config/inactivity")).data);
  if (!dryRun && !cfg.enabled) return { ok: true, skipped: "disabled", config: cfg };
  const today = todaySyria(now), cutoff = shiftDate(today, -cfg.remindDays);
  const rows = await fsRunQuery(env, "players", null, 500, 0, { field: "lastActiveDate", op: "LESS_THAN_OR_EQUAL", value: cutoff });
  const plan = [];
  for (const r of rows) {
    const p = r.data, uid = r.id;
    if (!uid || uid.includes("/") || p.suspended === true || p.accountDeleted) continue;
    const idle = dayNum(today) - dayNum(p.lastActiveDate);
    if (!Number.isFinite(idle) || idle < cfg.remindDays) continue;
    const warnedAt = Number(p.inactivityWarnedAt) || 0;
    let action = null;
    if (idle >= cfg.actionDays && warnedAt && now - warnedAt >= cfg.graceDays * 86400000) action = "act";
    else if (idle >= cfg.warnDays && p.inactivityStage !== "warn") action = "warn";
    else if (!p.inactivityStage) action = "remind";
    if (!action) continue;
    const cls = idle >= cfg.warnDays ? await classifyAccount(env, uid, p) : null;
    if (action === "act") action = cls.counted ? "suspend" : "delete";
    plan.push({ uid, email: String(p.email || ""), name: String(p.displayName || ""), idleDays: idle, action, counted: cls ? cls.counted : null, reason: cls ? cls.reason : "" });
  }
  if (dryRun) return { ok: true, config: cfg, candidates: rows.length, capped: rows.length >= 500, plan };
  const done = { remind: 0, warn: 0, suspend: 0, delete: 0, skipped: 0 }; let actions = 0;
  for (const it of plan) {
    try {
      const path = "players/" + it.uid;
      if (it.action === "remind" || it.action === "warn") {
        const left = Math.max(cfg.graceDays, cfg.actionDays - it.idleDays);
        await inactivityNotify(env, it.uid, it.action, { days: it.idleDays, left, counted: it.counted === true });
        const f = it.action === "remind" ? { inactivityStage: "remind", inactivityRemindedAt: now } : { inactivityStage: "warn", inactivityWarnedAt: now };
        await fsCommit(env, [{ update: { name: docName(env, path), fields: objToFields(f) }, updateMask: { fieldPaths: Object.keys(f) }, currentDocument: { exists: true } }]);
        done[it.action]++; continue;
      }
      if (actions >= cfg.maxActions) { done.skipped++; continue; }
      actions++;
      if (it.action === "suspend") {
        const f = { suspended: true, suspendedAt: now, suspendedReason: "inactivity" };
        await fsCommit(env, [{ update: { name: docName(env, path), fields: objToFields(f) }, updateMask: { fieldPaths: Object.keys(f) }, currentDocument: { exists: true } }]);
        await sendPush(env, it.uid, "inactive_suspend", {});
      } else {
        await deleteAccountCore(env, it.uid);
      }
      await fsCommit(env, [{ update: { name: docName(env, "inactivityLog/" + randomId()), fields: objToFields({ uid: it.uid, action: it.action, idleDays: it.idleDays, counted: it.counted === true, reason: it.reason, at: now }) }, currentDocument: { exists: false } }]);
      done[it.action]++;
    } catch (e) { done.skipped++; console.warn({ message: "inactivity step failed", action: it.action, error: String(e.message || e) }); }
  }
  await fsCommit(env, [{ update: { name: docName(env, "config/inactivity"), fields: objToFields({ lastRunAt: now, lastRunSummary: JSON.stringify(done) }) }, updateMask: { fieldPaths: ["lastRunAt", "lastRunSummary"] } }]);
  return { ok: true, config: cfg, candidates: rows.length, done };
}
async function handleAdminInactivity(request, env) {
  if (!(await adminOnly(request))) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let b = {}; try { b = await request.json(); } catch (e) {}
  try {
    if (b.action === "get") { const d = await fsGetDoc(env, "config/inactivity"); const x = d.exists && d.data ? d.data : {}; return jsonResponse({ ok: true, config: inactivityNorm(x), lastRunAt: Number(x.lastRunAt) || 0, lastRunSummary: String(x.lastRunSummary || "") }, 200); }
    if (b.action === "save") {
      const cfg = inactivityNorm(b.config);
      await fsCommit(env, [{ update: { name: docName(env, "config/inactivity"), fields: objToFields({ ...cfg, updatedAt: Date.now() }) }, updateMask: { fieldPaths: [...Object.keys(cfg), "updatedAt"] } }]);
      return jsonResponse({ ok: true, config: cfg }, 200);
    }
    if (b.action === "dryrun") { const r = await runInactivity(env, { dryRun: true }); return jsonResponse({ ...r, plan: r.plan.slice(0, 300), planTotal: r.plan.length }, 200); }
    if (b.action === "run") { if (b.confirm !== true) return jsonResponse({ ok: false, error: "confirm_required" }, 400); return jsonResponse(await runInactivity(env, { dryRun: false }), 200); }
    if (b.action === "suspended") {
      const rows = await fsRunQuery(env, "players", null, 200, 0, { field: "suspended", value: true });
      const today = todaySyria();
      return jsonResponse({ ok: true, players: rows.map(r => ({ uid: r.id, email: String(r.data.email || ""), name: String(r.data.displayName || ""), suspendedAt: Number(r.data.suspendedAt) || 0, idleDays: dayNum(today) - dayNum(r.data.lastActiveDate), balanceUsd: Number(r.data.balanceUsd) || 0 })) }, 200);
    }
    if (b.action === "unsuspend") {
      const uid = validId(String(b.uid || ""));
      if (!uid) return jsonResponse({ ok: false, error: "bad_request" }, 400);
      const f = { suspended: false, inactivityStage: "", inactivityWarnedAt: 0, inactivityRemindedAt: 0, lastActiveDate: todaySyria() };
      await fsCommit(env, [{ update: { name: docName(env, "players/" + uid), fields: objToFields(f) }, updateMask: { fieldPaths: Object.keys(f) }, currentDocument: { exists: true } }]);
      return jsonResponse({ ok: true }, 200);
    }
    return jsonResponse({ ok: false, error: "bad_action" }, 400);
  } catch (e) {
    console.error({ message: "admin inactivity error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}

// ===== حذف الحساب (بطلب اللاعب من التطبيق) =====
// بنحذف: بيانات اللاعب، جهاز الإشعارات، البريد الداخلي، كود الدعوة، شحنات البريد، وحساب الدخول نفسه.
// بنحتفظ بسجلات السحب والشراء والطلبات (المبلغ والتاريخ والمحفظة) لأغراض محاسبية ومنع الاحتيال، بس بنمسح منها الاسم والبريد والإيصال والتفاصيل.
const AUTH_ADMIN_SCOPE = "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform";
async function deleteAuthUser(env, uid) {
  const token = await getGoogleAccessToken(env, AUTH_ADMIN_SCOPE);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId(env)}/accounts:delete`, {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ localId: uid }),
  });
  if (!r.ok) console.warn({ message: "auth user delete failed", status: r.status, body: String(await r.text()).slice(0, 200) });
  return r.ok;
}
async function deleteAccountCore(env, uid) {
    const [wds, orders, purchases, mails, player] = await Promise.all([
      fsRunQuery(env, "withdrawRequests", null, 200, 0, { field: "uid", value: uid }),
      fsRunQuery(env, "shopOrders", null, 200, 0, { field: "uid", value: uid }),
      fsRunQuery(env, "purchaseRequests", null, 200, 0, { field: "uid", value: uid }),
      fsRunQuery(env, "mail", null, 200, 0, { field: "uid", value: uid }),
      fsGetDoc(env, "players/" + uid),
    ]);
    if ([...wds, ...orders, ...purchases].some(r => r.data.status === "pending")) {
      throw new ApiError("pending_requests", "عندك طلب (سحب أو شراء أو شحن) قيد المراجعة. استنى لينتهي قبل ما تحذف حسابك.", 409);
    }
    const code = player.exists && player.data.referralCode ? String(player.data.referralCode) : "";
    const tgId = player.exists && /^[0-9]{1,20}$/.test(String(player.data.tgUserId || "")) ? String(player.data.tgUserId) : "";
    const phoneH = player.exists && /^[0-9a-f]{64}$/.test(String(player.data.phoneHash || "")) ? String(player.data.phoneHash) : "";
    const tgSessions = tgId ? await fsRunQuery(env, "tgSessions", null, 50, 0, { field: "tgUserId", value: Number(tgId) }) : [];
    const walletWrites = [];
    for (const k of new Set(await Promise.all(wds.filter(r => r.data.walletAddress).map(r => walletKey(r.data.walletAddress))))) {
      const idx = await fsGetDoc(env, "walletIndex/" + k);
      if (!idx.exists || !Array.isArray(idx.data.uids)) continue;
      const rest = idx.data.uids.filter(u => u !== uid);
      walletWrites.push(rest.length ? { update: { name: docName(env, "walletIndex/" + k), fields: objToFields({ uids: rest }) }, updateMask: { fieldPaths: ["uids"] } } : { delete: docName(env, "walletIndex/" + k) });
    }
    const blank = (coll, rows, fields) => rows.map(r => ({
      update: { name: docName(env, coll + "/" + r.id), fields: objToFields({ ...fields, accountDeleted: true }) },
      updateMask: { fieldPaths: [...Object.keys(fields), "accountDeleted"] },
    }));
    const writes = [
      ...blank("withdrawRequests", wds, { displayName: "", email: "", walletOtherUids: [] }),
      ...walletWrites,
      ...blank("shopOrders", orders, { displayName: "", email: "", fields: [] }),
      ...blank("purchaseRequests", purchases, { displayName: "", email: "", proofImage: "", note: "" }),
      ...mails.map(r => ({ delete: docName(env, "mail/" + r.id) })),
      { delete: docName(env, "players/" + uid) }, { delete: docName(env, "pushTokens/" + uid) }, { delete: docName(env, "inbox/" + uid) },
    ];
    if (code && !code.includes("/")) writes.push({ delete: docName(env, "referralCodes/" + code) });
    if (tgId) writes.push({ delete: docName(env, "tgAccounts/" + tgId) }, ...tgSessions.map(r => ({ delete: docName(env, "tgSessions/" + r.id) })));
    if (phoneH) writes.push({ delete: docName(env, "phoneHashes/" + phoneH) });
    for (let i = 0; i < writes.length; i += 400) await fsCommit(env, writes.slice(i, i + 400));
    let authDeleted = false;
    try { authDeleted = await deleteAuthUser(env, uid); } catch (e) { console.warn({ message: "auth user delete error", error: String(e.message || e) }); }
    console.info({ message: "account deleted", authDeleted });
    return { authDeleted };
}
async function handleDeleteAccount(request, env) {
  try {
    const user = await requireUser(request);
    let body = {}; try { body = await request.json(); } catch (e) {}
    if (body.confirm !== true) throw new ApiError("confirm_required", "أكّد الحذف أول.", 400);
    const r = await deleteAccountCore(env, user.sub);
    const authDeleted = r.authDeleted;
    return jsonResponse({ ok: true, deleted: true, authDeleted }, 200);
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    console.error({ message: "delete account error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error", message: "صار خطأ بالسيرفر، جرّب بعد شوي." }, 500);
  }
}

// ===== الدخول عبر تلغرام (رقم الهاتف) =====
// الفكرة: اللاعب بيفتح بوت تلغرام، بيكتب رمز بيشوفه باللعبة (حماية من الاحتيال)، وبيشارك رقمه بزر تلغرام (تلغرام بتتحقق إنه رقمه هو).
// السيرفر بيحوّل الرقم لبصمة مشفّرة (ما بنخزّن الرقم نفسه) وبيعطي التطبيق "توكن دخول مخصص" من فايربيس. حساب واحد لكل حساب تلغرام ولكل رقم.
// الحالات: started ← awaiting_code ← awaiting_contact ← verified ← used
const TG_TTL = 5 * 60 * 1000, TG_MAX_ATTEMPTS = 5;
const TG_TEXT = {
  welcome: { ar: "👋 أهلاً! افتح لعبة Yardova واضغط «الدخول عبر تلغرام».", tr: "👋 Merhaba! Yardova oyununu aç ve «Telegram ile giriş»e dokun.", en: "👋 Hi! Open the Yardova game and tap “Sign in with Telegram”." },
  expired: { ar: "انتهت صلاحية الطلب. ارجع للعبة وجرّب من جديد.", tr: "İstek süresi doldu. Oyuna dön ve yeniden dene.", en: "This request expired. Go back to the game and try again." },
  ask_code: { ar: "للتأكيد، اكتب الرمز المكوّن من 6 أرقام الظاهر على شاشة اللعبة.", tr: "Onaylamak için oyun ekranında görünen 6 haneli kodu yaz.", en: "To confirm, type the 6-digit code shown on the game screen." },
  wrong_code: { ar: "الرمز غلط. جرّب كمان مرة.", tr: "Kod yanlış. Tekrar dene.", en: "Wrong code. Try again." },
  too_many: { ar: "محاولات كتير. ارجع للعبة وابدأ من جديد.", tr: "Çok fazla deneme. Oyuna dön ve baştan başla.", en: "Too many attempts. Go back to the game and start over." },
  ask_contact: { ar: "تمام ✅ هلق اضغط الزر تحت لمشاركة رقمك. تلغرام بتتحقق منه، وما بنخزّن الرقم نفسه.", tr: "Tamam ✅ Şimdi numaranı paylaşmak için aşağıdaki düğmeye dokun. Telegram doğrular; numaranın kendisini saklamayız.", en: "OK ✅ Now tap the button below to share your number. Telegram verifies it, and we do not store the number itself." },
  button: { ar: "📱 شارك رقمي", tr: "📱 Numaramı paylaş", en: "📱 Share my number" },
  not_yours: { ar: "لازم تشارك رقمك أنت. استعمل الزر تحت.", tr: "Kendi numaranı paylaşmalısın. Aşağıdaki düğmeyi kullan.", en: "You must share your own number. Use the button below." },
  done: { ar: "✅ تم التحقق! ارجع للعبة.", tr: "✅ Doğrulandı! Oyuna dön.", en: "✅ Verified! Go back to the game." },
  ask_sub: { ar: "قبل ما نكمّل، لازم تكون مشترك بقناة Yardova الرسمية. اشترك وبعدين اضغط «✅ اشتركت».", tr: "Devam etmeden önce resmi Yardova kanalına abone olmalısın. Abone ol ve «✅ Katıldım»a dokun.", en: "Before we continue, you need to join the official Yardova channel. Join it, then tap “✅ I joined”." },
  not_subscribed: { ar: "لسا ما لقيناك مشترك بالقناة. اشترك وجرّب كمان مرة.", tr: "Henüz kanala abone olmadığını görüyoruz. Abone ol ve tekrar dene.", en: "We can't see you in the channel yet. Join it and try again." },
  btn_channel: { ar: "📢 اشترك بالقناة", tr: "📢 Kanala katıl", en: "📢 Join the channel" },
  btn_joined: { ar: "✅ اشتركت", tr: "✅ Katıldım", en: "✅ I joined" },
};
function tgBotName(env) { return env.TELEGRAM_BOT_USERNAME || "YardovaLoginBot"; }
function tgToken(env) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new ApiError("no_token", "توكن بوت تلغرام مو مضاف بـCloudflare (TELEGRAM_BOT_TOKEN).", 503);
  return env.TELEGRAM_BOT_TOKEN;
}
function tgKey(env, label) { return hmacHex(tgToken(env), "yardova:" + label); }
async function tgApi(env, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${tgToken(env)}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) });
  return r.json().catch(() => ({ ok: false }));
}
function tgLang(from) { const l = String((from && from.language_code) || "").slice(0, 2); return l === "tr" || l === "en" ? l : "ar"; }
function tgSay(env, chatId, lang, key, extra) {
  return tgApi(env, "sendMessage", { chat_id: chatId, text: TG_TEXT[key][lang] || TG_TEXT[key].ar, ...(extra || {}) }).catch(e => console.warn({ message: "telegram send failed", error: String(e.message || e) }));
}
function b64urlRandom(n) { return bytesToB64url(crypto.getRandomValues(new Uint8Array(n))); }
async function tgRateLimit(env, request) {
  const kv = env.PENDING_CREDITS; if (!kv) return;
  const key = "tgrl:" + (request.headers.get("CF-Connecting-IP") || "x");
  const n = Number(await kv.get(key)) || 0;
  if (n >= 30) throw new ApiError("rate_limited", "محاولات كتير، جرّب بعد شوي.", 429);
  await kv.put(key, String(n + 1), { expirationTtl: 3600 });
}
async function tgMintCustomToken(env, uid, claims) {
  const sa = JSON.parse(env.FIREBASE_SA); const now = Math.floor(Date.now() / 1000);
  const header = strToB64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = strToB64url(JSON.stringify({ iss: sa.client_email, sub: sa.client_email, aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit", iat: now, exp: now + 3000, uid, claims }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(header + "." + payload));
  return header + "." + payload + "." + bytesToB64url(new Uint8Array(sig));
}
// ===== اشتراط الاشتراك بقناة Yardova قبل التحقق (بيتفعّل من بطاقة بوت تلغرام بالأدمن) =====
// لازم البوت يكون أدمن بالقناة حتى يقدر يفحص الأعضاء. إذا تعذّر الفحص (مثلاً شالوه من الأدمن) ما منقفل الدخول عالناس، بنسجّل تحذير وبيطلع بالأدمن.
function tgChannel(env) { return env.TELEGRAM_CHANNEL || "@YardovaGame"; }
async function tgAuthConfig(env) { const d = await fsGetDoc(env, "config/tgAuth"); return d.exists && d.data ? d.data : {}; }
async function tgIsChannelMember(env, userId) {
  try {
    const r = await tgApi(env, "getChatMember", { chat_id: tgChannel(env), user_id: userId });
    if (!r || !r.ok || !r.result) { console.warn({ message: "channel check failed", description: String((r && r.description) || "") }); return null; }
    const st = r.result.status;
    return st === "creator" || st === "administrator" || st === "member" || (st === "restricted" && r.result.is_member === true);
  } catch (e) { console.warn({ message: "channel check error", error: String(e.message || e) }); return null; }
}
function tgSubKeyboard(env, lang, nonce) {
  return { inline_keyboard: [
    [{ text: TG_TEXT.btn_channel[lang] || TG_TEXT.btn_channel.ar, url: "https://t.me/" + tgChannel(env).replace(/^@/, "") }],
    [{ text: TG_TEXT.btn_joined[lang] || TG_TEXT.btn_joined.ar, callback_data: "sub:" + nonce }],
  ] };
}
async function tgChannelStatus(env, botId) {
  const out = { name: tgChannel(env), canCheck: false, botStatus: "", note: "" };
  try {
    const r = await tgApi(env, "getChatMember", { chat_id: out.name, user_id: botId });
    if (r && r.ok && r.result) { out.botStatus = String(r.result.status || ""); out.canCheck = out.botStatus === "administrator" || out.botStatus === "creator"; }
    else out.note = String((r && r.description) || "");
  } catch (e) { out.note = String(e.message || e); }
  return out;
}
async function processTelegramCallback(env, cq) {
  const answer = (text, alert) => tgApi(env, "answerCallbackQuery", { callback_query_id: cq.id, ...(text ? { text, show_alert: !!alert } : {}) }).catch(() => {});
  const from = cq.from, data = String(cq.data || ""), chatId = cq.message && cq.message.chat && cq.message.chat.id;
  if (!from || from.is_bot || !chatId || !data.startsWith("sub:")) return answer();
  const lang = tgLang(from), nonce = data.slice(4);
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(nonce)) return answer();
  const doc = await fsGetDoc(env, "tgSessions/" + nonce);
  const live = doc.exists && Date.now() - Number(doc.data.createdAt) <= TG_TTL && doc.data.status === "awaiting_sub" && Number(doc.data.tgUserId) === Number(from.id);
  if (!live) return answer(TG_TEXT.expired[lang] || TG_TEXT.expired.ar, true);
  if ((await tgIsChannelMember(env, from.id)) === false) return answer(TG_TEXT.not_subscribed[lang] || TG_TEXT.not_subscribed.ar, true);
  await fsCommit(env, [{ update: { name: docName(env, "tgSessions/" + nonce), fields: objToFields({ status: "awaiting_code" }) }, updateMask: { fieldPaths: ["status"] } }]);
  await answer();
  return tgSay(env, chatId, lang, "ask_code");
}
// تلغرام ← السيرفر
async function handleTelegramWebhook(request, env) {
  try {
    const secret = await tgKey(env, "webhook");
    if (!safeEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "", secret)) return new Response("forbidden", { status: 401 });
    let update; try { update = await request.json(); } catch (e) { return new Response("ok", { status: 200 }); }
    await processTelegramUpdate(env, update);
  } catch (e) { console.error({ message: "telegram webhook error", error: String(e.message || e) }); }
  return new Response("ok", { status: 200 });                       // دايماً 200 حتى ما تعيد تلغرام الإرسال
}
async function processTelegramUpdate(env, update) {
  if (update && update.callback_query) return processTelegramCallback(env, update.callback_query);
  const msg = update && update.message;
  if (!msg || !msg.chat || msg.chat.type !== "private" || !msg.from || msg.from.is_bot) return;
  const chatId = msg.chat.id, from = msg.from, lang = tgLang(from), now = Date.now();
  const text = typeof msg.text === "string" ? msg.text.trim() : "";
  const say = (key, extra) => tgSay(env, chatId, lang, key, extra);
  if (text.startsWith("/start")) {
    const nonce = text.split(/\s+/)[1] || "";
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(nonce)) return say("welcome");
    const doc = await fsGetDoc(env, "tgSessions/" + nonce);
    if (!doc.exists || now - Number(doc.data.createdAt) > TG_TTL || !["started", "awaiting_sub", "awaiting_code", "awaiting_contact"].includes(doc.data.status)) return say("expired");
    const needSub = (await tgAuthConfig(env)).requireChannel === true && (await tgIsChannelMember(env, from.id)) === false;
    await fsCommit(env, [{ update: { name: docName(env, "tgSessions/" + nonce), fields: objToFields({ chatId, tgUserId: from.id, tgName: cleanText(from.first_name, 40), lang, status: needSub ? "awaiting_sub" : "awaiting_code", attempts: 0 }) }, updateMask: { fieldPaths: ["chatId", "tgUserId", "tgName", "lang", "status", "attempts"] } }]);
    return needSub ? say("ask_sub", { reply_markup: tgSubKeyboard(env, lang, nonce) }) : say("ask_code");
  }
  const rows = await fsRunQuery(env, "tgSessions", null, 20, 0, { field: "chatId", value: chatId });
  const live = rows.filter(r => now - Number(r.data.createdAt) <= TG_TTL && ["awaiting_sub", "awaiting_code", "awaiting_contact"].includes(r.data.status)).sort((a, b) => Number(b.data.createdAt) - Number(a.data.createdAt))[0];
  if (!live) return say(msg.contact || /^\d{6}$/.test(text) ? "expired" : "welcome");
  const path = "tgSessions/" + live.id, upd = (obj) => fsCommit(env, [{ update: { name: docName(env, path), fields: objToFields(obj) }, updateMask: { fieldPaths: Object.keys(obj) } }]);
  if (live.data.status === "awaiting_sub") {
    if ((await tgIsChannelMember(env, from.id)) === false) return say("ask_sub", { reply_markup: tgSubKeyboard(env, lang, live.id) });
    await upd({ status: "awaiting_code" }); return say("ask_code");
  }
  if (live.data.status === "awaiting_code") {
    if (!/^\d{6}$/.test(text)) return say("ask_code");
    if (safeEqual(text, String(live.data.code))) { await upd({ status: "awaiting_contact" }); return say("ask_contact", { reply_markup: { keyboard: [[{ text: TG_TEXT.button[lang] || TG_TEXT.button.ar, request_contact: true }]], one_time_keyboard: true, resize_keyboard: true } }); }
    const attempts = (Number(live.data.attempts) || 0) + 1;
    if (attempts >= TG_MAX_ATTEMPTS) { await upd({ status: "failed", attempts }); return say("too_many"); }
    await upd({ attempts }); return say("wrong_code");
  }
  if (live.data.status === "awaiting_contact") {
    const c = msg.contact;
    if (!c) return say("ask_contact");
    if (Number(c.user_id) !== Number(from.id)) return say("not_yours");      // لازم يكون رقمه هو مو جهة اتصال مُحوّلة
    const digits = String(c.phone_number || "").replace(/\D/g, "");
    if (digits.length < 6 || digits.length > 16) return say("not_yours");
    const phoneHash = await hmacHex(await tgKey(env, "phone"), digits);
    await upd({ status: "verified", phoneHash });
    return say("done", { reply_markup: { remove_keyboard: true } });
  }
}
// التطبيق ← السيرفر
async function handleTelegramStart(request, env) {
  try {
    let body = {}; try { body = await request.json(); } catch (e) {}
    const mode = body.mode === "link" ? "link" : "login";
    const uid = mode === "link" ? (await requireUser(request)).sub : "";
    tgToken(env);
    await tgRateLimit(env, request);
    const nonce = b64urlRandom(16), pollSecret = b64urlRandom(24);
    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    await fsCommit(env, [{ update: { name: docName(env, "tgSessions/" + nonce), fields: objToFields({ pollHash: await sha256Hex(pollSecret), code, mode, uid, status: "started", createdAt: Date.now(), attempts: 0 }) }, currentDocument: { exists: false } }]);
    return jsonResponse({ ok: true, nonce, pollSecret, code, botUrl: `https://t.me/${tgBotName(env)}?start=${nonce}`, expiresIn: TG_TTL / 1000 }, 200);
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    console.error({ message: "telegram start error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error", message: "صار خطأ بالسيرفر، جرّب بعد شوي." }, 500);
  }
}
async function handleTelegramPoll(request, env) {
  try {
    let b = {}; try { b = await request.json(); } catch (e) {}
    const nonce = String(b.nonce || ""), pollSecret = String(b.pollSecret || "");
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(nonce) || !pollSecret) throw new ApiError("bad_request", "طلب غير صحيح.", 400);
    const path = "tgSessions/" + nonce, doc = await fsGetDoc(env, path);
    if (!doc.exists || !safeEqual(await sha256Hex(pollSecret), String(doc.data.pollHash || ""))) throw new ApiError("not_found", "الجلسة غير موجودة.", 404);
    const sess = doc.data, now = Date.now();
    if (now - Number(sess.createdAt) > TG_TTL || sess.status === "used") return jsonResponse({ ok: true, status: "expired" }, 200);
    if (sess.status === "failed") return jsonResponse({ ok: true, status: "failed", reason: "attempts" }, 200);
    if (sess.status !== "verified") return jsonResponse({ ok: true, status: "waiting", step: { started: "open_bot", awaiting_sub: "subscribe", awaiting_code: "enter_code", awaiting_contact: "share_contact" }[sess.status] || "open_bot" }, 200);
    if (sess.mode === "link") { const user = await requireUser(request); if (user.sub !== sess.uid) throw new ApiError("forbidden", "هالطلب مو لحسابك.", 403); }
    // بنستهلك الجلسة مرة وحدة بس (الأول بيربح لو انبعتوا طلبين مع بعض)
    await fsCommit(env, [{ update: { name: docName(env, path), fields: objToFields({ status: "used", phoneHash: "", usedAt: now }) }, updateMask: { fieldPaths: ["status", "phoneHash", "usedAt"] }, currentDocument: { updateTime: doc.updateTime } }]);
    const tgId = String(Math.floor(Number(sess.tgUserId))), phoneHash = String(sess.phoneHash || ""), name = String(sess.tgName || "");
    const [acc, ph] = await Promise.all([fsGetDoc(env, "tgAccounts/" + tgId), fsGetDoc(env, "phoneHashes/" + phoneHash)]);
    const link = (uid) => ([
      { update: { name: docName(env, "tgAccounts/" + tgId), fields: objToFields({ uid, phoneHash, linkedAt: now }) } },
      { update: { name: docName(env, "phoneHashes/" + phoneHash), fields: objToFields({ uid, tgUserId: tgId, linkedAt: now }) } },
    ]);
    if (sess.mode === "link") {
      const uid = String(sess.uid), me = await fsGetDoc(env, "players/" + uid);
      if (acc.exists && acc.data.uid !== uid) return jsonResponse({ ok: true, status: "failed", reason: "taken" }, 200);
      if (ph.exists && ph.data.uid !== uid) return jsonResponse({ ok: true, status: "failed", reason: "phone_taken" }, 200);
      if (me.exists && me.data.tgUserId && String(me.data.tgUserId) !== tgId) return jsonResponse({ ok: true, status: "failed", reason: "already_linked" }, 200);
      await fsCommit(env, [...link(uid), { update: { name: docName(env, "players/" + uid), fields: objToFields({ tgLinked: true, tgUserId: Number(tgId), phoneHash }) }, updateMask: { fieldPaths: ["tgLinked", "tgUserId", "phoneHash"] } }]);
      return jsonResponse({ ok: true, status: "linked" }, 200);
    }
    let uid = acc.exists ? String(acc.data.uid) : ph.exists ? String(ph.data.uid) : "", isNew = false;
    if (!uid) {
      uid = "tg_" + tgId; isNew = true;
      try { await fsCommit(env, [{ update: { name: docName(env, "players/" + uid), fields: objToFields({ tgLinked: true, tgUserId: Number(tgId), phoneHash, displayName: name }) }, currentDocument: { exists: false } }]); }
      catch (e) { if (!e.conflict) throw e; }                              // انعمل بنفس اللحظة: ما في مشكلة
    }
    await fsCommit(env, link(uid));
    const customToken = await tgMintCustomToken(env, uid, { tg: true, tgName: name });
    return jsonResponse({ ok: true, status: "verified", customToken, isNew }, 200);
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    if (e && e.conflict) return jsonResponse({ ok: true, status: "waiting", step: "open_bot" }, 200);
    console.error({ message: "telegram poll error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error", message: "صار خطأ بالسيرفر، جرّب بعد شوي." }, 500);
  }
}
// الأدمن: ربط البوت بالسيرفر (مرة وحدة) وفحص حالته. التوكن ما بيظهر لأي حدا، بيضل بـCloudflare.
async function handleAdminTelegram(request, env) {
  if (!(await adminOnly(request))) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let b = {}; try { b = await request.json(); } catch (e) {}
  try {
    tgToken(env);
    if (!["setup", "status", "require"].includes(b.action)) return jsonResponse({ ok: false, error: "bad_action" }, 400);
    const hookUrl = new URL(request.url).origin + "/telegram/webhook";
    let setRes = null;
    if (b.action === "setup") setRes = await tgApi(env, "setWebhook", { url: hookUrl, secret_token: await tgKey(env, "webhook"), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
    const [me, info] = await Promise.all([tgApi(env, "getMe", {}), tgApi(env, "getWebhookInfo", {})]);
    const wh = (info && info.result) || {};
    const channel = await tgChannelStatus(env, me && me.result ? me.result.id : 0);
    if (b.action === "require") {
      const want = b.value === true;
      if (want && !channel.canCheck) return jsonResponse({ ok: false, error: "bot_not_admin", message: "ضيف البوت كأدمن بقناة " + channel.name + " أول، وبعدين فعّل الاشتراط." }, 400);
      await fsCommit(env, [{ update: { name: docName(env, "config/tgAuth"), fields: objToFields({ requireChannel: want, updatedAt: Date.now() }) }, updateMask: { fieldPaths: ["requireChannel", "updatedAt"] } }]);
    }
    const cfg = await tgAuthConfig(env);
    return jsonResponse({ ok: true, setupOk: setRes ? !!setRes.ok : null, setupMessage: setRes && !setRes.ok ? String(setRes.description || "") : "", username: me && me.result ? me.result.username || "" : "", expectedUsername: tgBotName(env), webhookUrl: wh.url || "", webhookOk: wh.url === hookUrl, pending: wh.pending_update_count || 0, lastError: wh.last_error_message || "", callbacksOk: Array.isArray(wh.allowed_updates) ? wh.allowed_updates.includes("callback_query") : null, channel: { ...channel, required: cfg.requireChannel === true } }, 200);
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    console.error({ message: "admin telegram error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}

// ===== متجر شحن الألعاب (طلبات يدوية بالنقاط، الأدمن بيعبّي العناصر وبينفّذ الطلبات) =====
// العناصر محفوظة بـconfig/shop. اللاعب بيطلب فبتنخصم نقاطه وبينعمل طلب "pending". الأدمن بينفّذه يدوياً وبيأكّد (done) أو بيرفضه (rejected) فبترجع النقاط.
const SHOP_MAX_ITEMS = 60, SHOP_MAX_FIELDS = 5, SHOP_FIELD_TYPES = ["id", "email", "phone", "text"];
function cleanText(v, max) { return String(v == null ? "" : v).replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function locText(o, base, lang) { return String((lang !== "ar" && o[base + "_" + lang]) || o[base] || ""); }
function sanitizeShopItem(x, idx) {
  if (!x || typeof x !== "object") return null;
  const name = cleanText(x.name, 80);
  const price = Math.floor(Number(x.pricePoints));
  if (!name || !Number.isFinite(price) || price < 1 || price > 10000000) return null;
  const fields = [];
  for (const f of (Array.isArray(x.fields) ? x.fields : []).slice(0, SHOP_MAX_FIELDS)) {
    const label = cleanText(f && f.label, 60);
    if (!label) continue;
    const key = /^[a-z0-9_]{1,24}$/.test(String((f && f.key) || "")) ? String(f.key) : "f" + fields.length;
    if (fields.some(g => g.key === key)) continue;
    fields.push({ key, label, label_tr: cleanText(f.label_tr, 60), label_en: cleanText(f.label_en, 60), type: SHOP_FIELD_TYPES.includes(f.type) ? f.type : "text", required: f.required !== false });
  }
  return {
    id: /^[A-Za-z0-9_-]{1,40}$/.test(String(x.id || "")) ? String(x.id) : "it_" + randomId().slice(0, 10),
    name, name_tr: cleanText(x.name_tr, 80), name_en: cleanText(x.name_en, 80),
    desc: cleanText(x.desc, 300), desc_tr: cleanText(x.desc_tr, 300), desc_en: cleanText(x.desc_en, 300),
    pricePoints: price, fields, enabled: x.enabled !== false, sort: Number.isFinite(Number(x.sort)) ? Number(x.sort) : idx,
  };
}
function shopItemsFrom(cfg) {
  const raw = cfg && cfg.shop && Array.isArray(cfg.shop.items) ? cfg.shop.items : [];
  return raw.map(sanitizeShopItem).filter(Boolean);
}
function shopSettings(cfg) {
  const sh = (cfg && cfg.shop) || {};
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : d; };
  return { minActiveDays: num(sh.minActiveDays, 3, 0, 60), maxPending: num(sh.maxPending, 3, 1, 20), maxPerWeek: num(sh.maxPerWeek, 2, 0, 50) };   // maxPerWeek: 0 = بدون حد
}
function validateShopField(def, raw) {
  const v = cleanText(raw, 120);
  if (!v) { if (def.required) throw new ApiError("bad_field", `اكتب «${def.label}».`); return ""; }
  if (def.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new ApiError("bad_field", `«${def.label}» مو بريد إلكتروني صحيح.`);
  if (def.type === "phone" && !/^\+?[0-9][0-9 ()-]{5,19}$/.test(v)) throw new ApiError("bad_field", `«${def.label}» مو رقم صحيح.`);
  return v;
}
function adminOnly(request) {
  return verifyFirebaseToken((request.headers.get("Authorization") || "").replace("Bearer ", "")).then(u => (u && u.sub === ADMIN_UID ? u : null)).catch(() => null);
}
async function handleShopList(request, env) {
  try {
    const user = await requireUser(request);
    let body = {}; try { body = await request.json(); } catch (e) {}
    const lang = ["ar", "tr", "en"].includes(body.lang) ? body.lang : "ar";
    const cfg = await loadConfig(env);
    const st = shopSettings(cfg);
    const items = shopItemsFrom(cfg).filter(x => x.enabled).sort((a, b) => a.sort - b.sort).map(x => ({
      id: x.id, name: locText(x, "name", lang), desc: locText(x, "desc", lang), pricePoints: x.pricePoints,
      fields: x.fields.map(f => ({ key: f.key, label: locText(f, "label", lang), type: f.type, required: f.required })),
    }));
    const rows = await fsRunQuery(env, "shopOrders", null, 50, 0, { field: "uid", value: user.sub });
    const orders = rows.map(r => ({
      id: r.id, itemName: locText({ name: r.data.itemName, name_tr: r.data.itemNameTr, name_en: r.data.itemNameEn }, "name", lang),
      pricePoints: Number(r.data.pricePoints) || 0, status: String(r.data.status || "pending"), createdAt: Number(r.data.createdAt) || 0,
      note: String(r.data.note || ""), fields: Array.isArray(r.data.fields) ? r.data.fields.map(f => ({ label: String(f.label || ""), value: String(f.value || "") })) : [],
    })).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    const weeklyUsed = rows.filter(r => r.data.status !== "rejected" && Number(r.data.createdAt) >= Date.now() - 7 * 86400000).length;
    return jsonResponse({ ok: true, shop: { items, minActiveDays: st.minActiveDays, maxPending: st.maxPending, maxPerWeek: st.maxPerWeek, weeklyUsed }, orders }, 200);
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    console.error({ message: "shop list error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error", message: "صار خطأ بالسيرفر، جرّب بعد شوي." }, 500);
  }
}
// الأدمن: قراءة وحفظ عناصر المتجر وإعداداته (كل العناصر بدفعة وحدة)
async function handleAdminShop(request, env) {
  if (!(await adminOnly(request))) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let b; try { b = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: "bad_json" }, 400); }
  try {
    if (b.action === "get") {
      const doc = await fsGetDoc(env, "config/shop");
      const cfg = { shop: doc.data || {} };
      return jsonResponse({ ok: true, items: shopItemsFrom(cfg), settings: shopSettings(cfg) }, 200);
    }
    if (b.action === "save") {
      if (!Array.isArray(b.items) || b.items.length > SHOP_MAX_ITEMS) return jsonResponse({ ok: false, error: "bad_items", message: "قائمة العناصر غير صحيحة (الحد الأقصى " + SHOP_MAX_ITEMS + ")." }, 400);
      const seen = new Set(); const items = [];
      b.items.forEach((x, i) => { const it = sanitizeShopItem(x, i); if (it && !seen.has(it.id)) { seen.add(it.id); items.push(it); } });
      const st = shopSettings({ shop: b.settings || {} });
      await fsCommit(env, [{ update: { name: docName(env, "config/shop"), fields: objToFields({ items, minActiveDays: st.minActiveDays, maxPending: st.maxPending, maxPerWeek: st.maxPerWeek, updatedAt: Date.now() }) } }]);
      cachedConfig = null;
      return jsonResponse({ ok: true, items, settings: st, dropped: b.items.length - items.length }, 200);
    }
    return jsonResponse({ ok: false, error: "bad_action" }, 400);
  } catch (e) {
    console.error({ message: "admin shop error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}
async function notifyShopResult(env, order, kind, note) {
  const names = { ar: order.itemName || "", tr: order.itemNameTr || order.itemName || "", en: order.itemNameEn || order.itemName || "" };
  const n = (note ? "\n" + note : "") + (order.reqCode ? "\n" + REQ_WORD.ar + ": " + order.reqCode : "");
  const nTr = (note ? "\n" + note : "") + (order.reqCode ? "\n" + REQ_WORD.tr + ": " + order.reqCode : ""), nEn = (note ? "\n" + note : "") + (order.reqCode ? "\n" + REQ_WORD.en + ": " + order.reqCode : "");
  const pts = Number(order.pricePoints) || 0;
  const T = kind === "done"
    ? { ar: ["تم تنفيذ طلبك ✅", `تم تنفيذ طلب «${names.ar}».${n}`], tr: ["Siparişin tamamlandı ✅", `«${names.tr}» siparişin tamamlandı.${nTr}`], en: ["Your order is done ✅", `Your order “${names.en}” is complete.${nEn}`] }
    : { ar: ["انرفض طلبك", `طلب «${names.ar}» انرفض ورجعنالك ${pts} نقطة.${n}`], tr: ["Siparişin reddedildi", `«${names.tr}» siparişin reddedildi, ${pts} puan iade edildi.${nTr}`], en: ["Your order was declined", `Your order “${names.en}” was declined and ${pts} points were refunded.${nEn}`] };
  try {
    await appendInbox(env, "inbox/" + order.uid, { id: randomId(), title: T.ar[0], body: T.ar[1], title_tr: T.tr[0], body_tr: T.tr[1], title_en: T.en[0], body_en: T.en[1], createdAt: Date.now() });
  } catch (e) { console.warn({ message: "shop inbox failed", error: String(e.message || e) }); }
  await sendPush(env, order.uid, kind === "done" ? "shop_done" : "shop_rejected", { item: names.ar, points: pts });
}
// الأدمن: قائمة الطلبات وتنفيذها أو رفضها (الرفض بيرجّع النقاط بنفس العملية)
async function handleAdminShopOrders(request, env) {
  if (!(await adminOnly(request))) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let b; try { b = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: "bad_json" }, 400); }
  try {
    if (b.action === "list") {
      const status = ["pending", "done", "rejected"].includes(b.status) ? b.status : "all";
      const rows = status === "all" ? await fsRunQuery(env, "shopOrders", "createdAt", 100) : await fsRunQuery(env, "shopOrders", null, 200, 0, { field: "status", value: status });
      const orders = rows.map(r => ({
        id: r.id, reqCode: reqCodeOf("S", r.id, r.data), uid: String(r.data.uid || ""), displayName: String(r.data.displayName || ""), email: String(r.data.email || ""),
        itemId: String(r.data.itemId || ""), itemName: String(r.data.itemName || ""), pricePoints: Number(r.data.pricePoints) || 0,
        fields: Array.isArray(r.data.fields) ? r.data.fields : [], status: String(r.data.status || "pending"), createdAt: Number(r.data.createdAt) || 0,
        resolvedAt: Number(r.data.resolvedAt) || 0, note: String(r.data.note || ""), snapshot: r.data.snapshot || {},
      })).sort((a, c) => (status === "pending" ? a.createdAt - c.createdAt : c.createdAt - a.createdAt));
      return jsonResponse({ ok: true, orders }, 200);
    }
    if (b.action === "resolve") {
      const id = validId(String(b.orderId || ""), 64);
      const decision = b.decision === "done" || b.decision === "rejected" ? b.decision : null;
      if (!id || !decision) return jsonResponse({ ok: false, error: "bad_request" }, 400);
      const note = cleanText(b.note, 200);
      const path = "shopOrders/" + id;
      const first = await fsGetDoc(env, path);
      if (!first.exists) return jsonResponse({ ok: false, error: "not_found" }, 404);
      const resolveWrite = (doc, now) => ({
        update: { name: docName(env, path), fields: objToFields({ status: decision, note, resolvedAt: now }) },
        updateMask: { fieldPaths: ["status", "note", "resolvedAt"] },
        currentDocument: { updateTime: doc.updateTime },
      });
      let order = first.data;
      if (decision === "rejected") {
        const uid = String(first.data.uid || "");
        if (!uid || uid.includes("/")) return jsonResponse({ ok: false, error: "bad_order" }, 400);
        await mutatePlayerAdmin(env, uid, async (p, now) => {
          const cur = await fsGetDoc(env, path);                                    // نقرأه من جديد بكل محاولة (حتى ما ينرجّع مرتين)
          if (!cur.exists || cur.data.status !== "pending") throw new ApiError("already_resolved", "هالطلب انحسم من قبل.", 409);
          order = cur.data;
          const pts = Number(cur.data.pricePoints) || 0;
          p.points += pts;
          return { writes: [resolveWrite(cur, now), statsWrite(env, todaySyria(now), { shopRefunds: 1, shopRefundPoints: pts })] };
        });
      } else {
        if (first.data.status !== "pending") return jsonResponse({ ok: false, error: "already_resolved", message: "هالطلب انحسم من قبل." }, 409);
        await fsCommit(env, [resolveWrite(first, Date.now()), statsWrite(env, todaySyria(), { shopDone: 1 })]);
      }
      await notifyShopResult(env, { ...order, reqCode: reqCodeOf("S", id, order) }, decision, note);
      return jsonResponse({ ok: true, status: decision }, 200);
    }
    return jsonResponse({ ok: false, error: "bad_action" }, 400);
  } catch (e) {
    if (e instanceof ApiError) return jsonResponse({ ok: false, error: e.code, message: e.message }, e.status);
    console.error({ message: "admin shop orders error", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}

// الأدمن بيطلب إرسال إشعار بعد ما يوافق/يرفض طلب سحب أو يأكد شحنة
async function handleAdminNotify(request, env, ctx) {
  const user = await verifyFirebaseToken((request.headers.get("Authorization") || "").replace("Bearer ", "")).catch(() => null);
  if (!user || user.sub !== ADMIN_UID) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const type = body.type;
  if (type === "withdraw_ok" || type === "withdraw_rejected") {
    const id = String(body.requestId || "");
    if (!id || id.includes("/")) return jsonResponse({ ok: false, error: "bad_request" }, 400);
    const req = await fsGetDoc(env, "withdrawRequests/" + id);
    if (!req.exists) return jsonResponse({ ok: false, error: "not_found" }, 404);
    ctx.waitUntil(sendPush(env, req.data.uid, type, { amount: Number(req.data.amount).toFixed(8).replace(/0+$/, "").replace(/\.$/, ""), coin: String(req.data.coin || "").toUpperCase(), code: reqCodeOf("W", id, req.data) }));
    return jsonResponse({ ok: true }, 200);
  }
  if (type === "topup" || type === "topup_rejected") {
    const uid = String(body.uid || "");
    if (!uid || uid.includes("/")) return jsonResponse({ ok: false, error: "bad_request" }, 400);
    ctx.waitUntil(sendPush(env, uid, type, { points: Number(body.points) || 0 }));
    return jsonResponse({ ok: true }, 200);
  }
  return jsonResponse({ ok: false, error: "bad_type" }, 400);
}

// الأدمن بيعالج طلب سحب: إرسال (مع تفاصيل شام كاش) أو رفض مع إرجاع الرصيد بشكل ذرّي (ما بيتكرر الإرجاع)
function refundUsdOf(r, cfg) {
  if (Number(r.amountUsd) > 0) return Number(r.amountUsd);
  return (Number(r.amount) || 0) * coinPriceUsd(cfg, r.coin); // طلبات قديمة: بسعر الأدمن الحالي
}
async function handleAdminWithdraw(request, env, ctx) {
  const user = await verifyFirebaseToken((request.headers.get("Authorization") || "").replace("Bearer ", "")).catch(() => null);
  if (!user || user.sub !== ADMIN_UID) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const id = String(body.requestId || "");
  const action = body.action;
  if (!id || id.includes("/") || !["fulfill", "reject"].includes(action)) return jsonResponse({ ok: false, error: "bad_request" }, 400);
  const path = "withdrawRequests/" + id;
  const req = await fsGetDoc(env, path);
  if (!req.exists) return jsonResponse({ ok: false, error: "not_found" }, 404);
  if (req.data.status !== "pending") return jsonResponse({ ok: false, error: "already_processed" }, 409);
  const now = Date.now();
  const pushAmount = (v) => Number(v).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  try {
    if (action === "fulfill") {
      const patch = { status: "fulfilled", reviewedAt: now, reviewedBy: user.sub };
      let params = { amount: pushAmount(req.data.amount), coin: String(req.data.coin || "").toUpperCase() };
      if (req.data.coin === "shamcash") {
        const cur = body.payoutCurrency === "SYP" ? "SYP" : body.payoutCurrency === "USD" ? "USD" : null;
        const amt = Number(body.payoutAmount);
        if (!cur || !Number.isFinite(amt) || !(amt > 0)) return jsonResponse({ ok: false, error: "bad_payout" }, 400);
        patch.payoutCurrency = cur; patch.payoutAmount = amt;
        params = { method: "shamcash", currency: cur, amount: cur === "SYP" ? String(Math.round(amt)) : String(amt) };
      }
      await fsCommit(env, [{
        update: { name: docName(env, path), fields: objToFields(patch) },
        updateMask: { fieldPaths: Object.keys(patch) },
        currentDocument: { updateTime: req.updateTime },
      }]);
      ctx.waitUntil(notifyWithdrawResult(env, req.data.uid, "withdraw_ok", { ...params, code: reqCodeOf("W", id, req.data) }));
    } else {
      const cfg = await loadConfig(env);
      const refund = refundUsdOf(req.data, cfg);
      if (!(refund > 0)) return jsonResponse({ ok: false, error: "no_refund_value" }, 400);
      const patch = { status: "rejected", reviewedAt: now, reviewedBy: user.sub, refundedUsd: refund };
      await mutatePlayerAdmin(env, req.data.uid, (p) => {
        p.balanceUsd += refund;
        return { writes: [{
          update: { name: docName(env, path), fields: objToFields(patch) },
          updateMask: { fieldPaths: Object.keys(patch) },
          currentDocument: { updateTime: req.updateTime },
        }] };
      });
      ctx.waitUntil(notifyWithdrawResult(env, req.data.uid, "withdraw_rejected", { code: reqCodeOf("W", id, req.data) }));
    }
  } catch (e) {
    console.error({ message: "admin withdraw failed", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: e.conflict ? "conflict" : "failed" }, 500);
  }
  return jsonResponse({ ok: true }, 200);
}

// ===== سجل أخطاء التطبيق (بيوصل للأدمن مع إيميل اللاعب) =====
const ERR_DAILY_CAP = 40;       // أقصى عدد تقارير لكل لاعب باليوم
const ERR_LIST_LIMIT = 150;
function cleanStr(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max) : ""; }
async function handleReportError(request, env) {
  const user = await verifyFirebaseToken((request.headers.get("Authorization") || "").replace("Bearer ", "")).catch(() => null);
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const message = cleanStr(body.message, 400).trim();
  if (!message) return jsonResponse({ ok: false, error: "bad_request" }, 400);
  const stack = cleanStr(body.stack, 2000);
  const source = ["js", "promise", "api"].includes(body.source) ? body.source : "js";
  const appVersion = cleanStr(body.version, 20), screen = cleanStr(body.screen, 30), device = cleanStr(body.device, 80);
  const now = Date.now(), uid = user.sub;
  try {
    const capKey = "err:" + uid + ":" + todaySyria(now);
    const used = Number(await env.PENDING_CREDITS.get(capKey)) || 0;
    if (used >= ERR_DAILY_CAP) return jsonResponse({ ok: true, limited: true }, 200);
    await env.PENDING_CREDITS.put(capKey, String(used + 1), { expirationTtl: 60 * 60 * 48 }).catch(() => {});
    const firstLine = (stack.split("\n")[1] || stack.split("\n")[0] || "").trim();
    const id = (await sha256Hex(uid + "|" + appVersion + "|" + message.slice(0, 200) + "|" + firstLine)).slice(0, 32);
    const path = "clientErrors/" + id;
    const cur = await fsGetDoc(env, path);
    const doc = cur.exists
      ? { ...cur.data, count: (Number(cur.data.count) || 1) + 1, lastAt: now, screen, device, status: "open" }
      : { uid, email: user.email || "", name: user.name || "", message, stack, source, appVersion, screen, device, count: 1, firstAt: now, lastAt: now, status: "open" };
    await fsCommit(env, [{ update: { name: docName(env, path), fields: objToFields(doc) } }]);
  } catch (e) {
    console.warn({ message: "report error failed", error: String(e.message || e) });
  }
  return jsonResponse({ ok: true }, 200);
}
async function handleAdminErrors(request, env) {
  const user = await verifyFirebaseToken((request.headers.get("Authorization") || "").replace("Bearer ", "")).catch(() => null);
  if (!user || user.sub !== ADMIN_UID) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  try {
    if (body.action === "list") {
      const rows = await fsRunQuery(env, "clientErrors", "lastAt", ERR_LIST_LIMIT);
      return jsonResponse({ ok: true, errors: rows.map(r => ({ id: r.id, ...r.data })) }, 200);
    }
    if (body.action === "delete") {
      const id = String(body.id || "");
      if (!id || id.includes("/")) return jsonResponse({ ok: false, error: "bad_request" }, 400);
      await fsCommit(env, [{ delete: docName(env, "clientErrors/" + id) }]);
      return jsonResponse({ ok: true }, 200);
    }
    if (body.action === "clear") {
      const rows = await fsRunQuery(env, "clientErrors", "lastAt", ERR_LIST_LIMIT);
      if (rows.length) await fsCommit(env, rows.map(r => ({ delete: docName(env, "clientErrors/" + r.id) })));
      return jsonResponse({ ok: true, deleted: rows.length }, 200);
    }
  } catch (e) {
    console.error({ message: "admin errors failed", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "failed" }, 500);
  }
  return jsonResponse({ ok: false, error: "bad_request" }, 400);
}

// ===== عدّاد زيارات الموقع وتحميلات الملف (مجهول: بدون كوكيز، وبدون تخزين عنوان IP) =====
// الزيارة بتنحسب بصفحة الموقع (POST /hit)، والتحميل بيتحسب هون بالسيرفر لما حدا يطلب /dl.
// منع العدّ المكرر: بصمة SHA-256 (IP + المتصفح + اليوم) بتنخزن بذاكرة Cache API 25 ساعة بس، وما بترجع لعنوان IP.
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|curl|wget|python|httpclient|headless|lighthouse|pingdom|uptime|monitor|scan|okhttp|axios|node-fetch/i;
const HIT_PAGES = ["home", "about", "verify"];
const HIT_LANGS = ["ar", "tr", "en"];
const HIT_DAILY_CAP = 60;   // أقصى مشاهدات تنحسب لنفس الزائر باليوم (حماية من التضخيم)
function optedOut(request) {   // المتصفح طلب "عدم التتبع" أو Global Privacy Control
  return request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1";
}
function isoDaySyria(now = Date.now()) { return new Date(now + 3 * 3600 * 1000).toISOString().slice(0, 10); }
function trafficWrite(env, day, incs) {
  const updateTransforms = Object.entries(incs).map(([f, v]) => ({ fieldPath: f, increment: { integerValue: String(v) } }));
  return { update: { name: docName(env, "siteTraffic/" + day), fields: { day: { stringValue: day } } }, updateMask: { fieldPaths: ["day"] }, updateTransforms };
}
function cleanKey(v, max = 20) { return String(v || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, max); }
function classifySource(refHost, utm) {
  const u = cleanKey(utm);
  if (u) return "utm_" + u;
  const h = String(refHost || "").toLowerCase().replace(/^www\./, "").slice(0, 80);
  if (!h) return "direct";
  if (h === "ly-ad.de" || h.endsWith(".ly-ad.de")) return "internal";
  if (/(^|\.)google\./.test(h)) return "google";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(h)) return "facebook";
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(h)) return "whatsapp";
  if (/(^|\.)(t\.me|telegram\.org|telegram\.me)$/.test(h)) return "telegram";
  if (/(^|\.)(twitter\.com|t\.co|x\.com)$/.test(h)) return "x";
  if (/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|yandex\.[a-z]+)$/.test(h)) return "search_other";
  if (/(^|\.)apkpure\.com$/.test(h)) return "apkpure";
  if (/(^|\.)github\.com$/.test(h)) return "github";
  return "other";
}
async function visitorHash(request, day) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = request.headers.get("User-Agent") || "";
  return (await sha256Hex([ip, ua, day, "yardova-traffic-v1"].join("|"))).slice(0, 24);
}
async function cacheFirstSeen(key) {   // true = أول مرة نشوفه اليوم
  try {
    const cache = caches.default, req = new Request("https://dedupe.invalid/" + key);
    if (await cache.match(req)) return false;
    await cache.put(req, new Response("1", { headers: { "Cache-Control": "max-age=90000" } }));
    return true;
  } catch (e) { return true; }
}
async function cacheBump(key, cap) {    // true = لسا تحت السقف (وبنزيد العدّاد)
  try {
    const cache = caches.default, req = new Request("https://dedupe.invalid/" + key);
    const hit = await cache.match(req); const n = hit ? Number(await hit.text()) || 0 : 0;
    if (n >= cap) return false;
    await cache.put(req, new Response(String(n + 1), { headers: { "Cache-Control": "max-age=90000" } }));
    return true;
  } catch (e) { return true; }
}
async function handleHit(request, env, ctx) {
  const ok = () => new Response(null, { status: 204, headers: corsHeaders() });
  const ua = request.headers.get("User-Agent") || "";
  if (!ua || BOT_UA.test(ua) || optedOut(request)) return ok();
  let b = {};
  try { b = JSON.parse(await request.text()); } catch (e) { return ok(); }
  if (!HIT_PAGES.includes(b.p) || !HIT_LANGS.includes(b.l)) return ok();
  const day = isoDaySyria(), hash = await visitorHash(request, day);
  if (!(await cacheBump("c-" + day + "-" + hash, HIT_DAILY_CAP))) return ok();
  const incs = { views: 1, ["p_" + b.p]: 1, ["l_" + b.l]: 1 };
  const src = classifySource(typeof b.r === "string" ? b.r : "", typeof b.u === "string" ? b.u : "");
  if (src !== "internal") incs["s_" + src] = 1;
  if (await cacheFirstSeen("v-" + day + "-" + hash)) incs.visitors = 1;
  ctx.waitUntil(fsCommit(env, [trafficWrite(env, day, incs)]).catch(e => console.warn({ message: "hit failed", error: String(e.message || e) })));
  return ok();
}
async function countDownload(request, url, env, ctx) {
  const ua = request.headers.get("User-Agent") || "";
  if (request.method !== "GET" || !ua || BOT_UA.test(ua) || optedOut(request)) return;
  const range = request.headers.get("Range");
  if (range && !/^bytes=0-/.test(range)) return;   // استكمال تحميل مو تحميل جديد
  const day = isoDaySyria(), hash = await visitorHash(request, day);
  const src = cleanKey(url.searchParams.get("src"), 12) || "other";
  const incs = { downloads: 1, ["d_" + src]: 1 };
  if (await cacheFirstSeen("d-" + day + "-" + hash)) incs.downloadsUnique = 1;
  ctx.waitUntil(fsCommit(env, [trafficWrite(env, day, incs)]).catch(e => console.warn({ message: "download count failed", error: String(e.message || e) })));
}
async function handleAdminTraffic(request, env) {
  const user = await verifyFirebaseToken((request.headers.get("Authorization") || "").replace("Bearer ", "")).catch(() => null);
  if (!user || user.sub !== ADMIN_UID) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const days = Math.min(60, Math.max(1, Number(body.days) || 30));
  try {
    const rows = await fsRunQuery(env, "siteTraffic", "day", days);
    return jsonResponse({ ok: true, rows: rows.map(r => ({ id: r.id, ...r.data })) }, 200);
  } catch (e) {
    console.error({ message: "admin traffic failed", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "failed" }, 500);
  }
}

// أرقام السحب العامة (بتنقرا من إعدادات الأدمن) عشان الموقع يعرضها بدون ما نكتبها بإيدنا
let PUBCFG = { t: 0, v: null };
async function handlePublicConfig(env) {
  try {
    const now = Date.now();
    if (!PUBCFG.v || now - PUBCFG.t > 60000) {
      const cfg = await loadConfig(env), pr = cfg.pricing || {};
      PUBCFG = { t: now, v: { ok: true, minWithdrawUsd: pr.minWithdrawUsd > 0 ? pr.minWithdrawUsd : 20, firstWithdrawUsd: Number(pr.firstWithdrawUsd) || 0, firstWithdrawDays: Number(pr.firstWithdrawDays) || 0, firstWithdrawAds: Number(pr.firstWithdrawAds) || 0 } };
    }
    return new Response(JSON.stringify(PUBCFG.v), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=120", ...corsHeaders() } });
  } catch (e) {
    console.error({ message: "public config failed", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "failed" }, 503);
  }
}

// رسائل الأدمن: إشعار لكل اللاعبين أو للاعب واحد (بدفعات صغيرة عشان حد الطلبات الفرعية بالـWorker)
const MSG_BATCH = 30;
const msgText = (s, max) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
async function fcmSendRaw(env, deviceToken, title, body, id) {
  const token = await getGoogleAccessToken(env);
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId(env)}/messages:send`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      token: deviceToken,
      notification: { title, body },
      data: { type: "announcement", id: String(id || "") },
      android: { priority: "high", notification: { icon: "ic_stat_notify", color: "#E3A83B" } },
    } }),
  });
  return r.ok;
}
async function handleAdminMessage(request, env) {
  const user = await verifyFirebaseToken((request.headers.get("Authorization") || "").replace("Bearer ", "")).catch(() => null);
  if (!user || user.sub !== ADMIN_UID) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  let b; try { b = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: "bad_json" }, 400); }
  const action = String(b.action || "");
  const wantsNews = d => d && d.token && (d.prefs || {}).news !== false;
  try {
    if (action === "list") {
      const rows = await fsRunQuery(env, "adminMessages", "createdAt", 20);
      return jsonResponse({ ok: true, messages: rows.map(r => ({ id: r.id, title: r.data.title || "", body: r.data.body || "", target: r.data.target || "", toEmail: r.data.toEmail || "", createdAt: Number(r.data.createdAt) || 0, status: r.data.status || "", sent: Number(r.data.sent) || 0, failed: Number(r.data.failed) || 0, recipients: Number(r.data.recipients) || 0 })) }, 200);
    }
    if (action === "preview") {
      if (b.target === "one") {
        const d = await fsGetDoc(env, "pushTokens/" + msgText(b.uid, 128));
        return jsonResponse({ ok: true, recipients: d.exists && wantsNews(d.data) ? 1 : 0 }, 200);
      }
      const rows = await fsRunQuery(env, "pushTokens", null, 500);
      return jsonResponse({ ok: true, recipients: rows.filter(r => wantsNews(r.data)).length }, 200);
    }
    if (action === "send" || action === "finish") {
      const idOk = v => /^[a-z0-9]{6,40}$/.test(String(v || ""));
      if (action === "finish") {
        if (!idOk(b.id)) return jsonResponse({ ok: false, error: "bad_id" }, 400);
        const cur = await fsGetDoc(env, "adminMessages/" + b.id);
        if (!cur.exists) return jsonResponse({ ok: false, error: "not_found" }, 404);
        const merged = { ...cur.data, status: "done", sent: Math.max(0, Number(b.sent) || 0), failed: Math.max(0, Number(b.failed) || 0), recipients: Math.max(0, Number(b.recipients) || 0), finishedAt: Date.now() };
        await fsCommit(env, [{ update: { name: docName(env, "adminMessages/" + b.id), fields: objToFields(merged) } }]);
        return jsonResponse({ ok: true }, 200);
      }
      const msg = { title: msgText(b.title, 60), body: msgText(b.body, 240) };
      for (const k of ["tr", "en"]) { msg["title_" + k] = msgText(b["title_" + k], 60); msg["body_" + k] = msgText(b["body_" + k], 240); }
      if (!msg.title || !msg.body) return jsonResponse({ ok: false, error: "empty", message: "العنوان والنص مطلوبين." }, 400);
      const pick = (d) => { const lang = ["ar", "tr", "en"].includes(d.lang) ? d.lang : "ar"; return [msg["title_" + lang] || msg.title, msg["body_" + lang] || msg.body]; };
      const mkItem = (id) => ({ id, title: msg.title, body: msg.body, title_tr: msg.title_tr, body_tr: msg.body_tr, title_en: msg.title_en, body_en: msg.body_en, createdAt: Date.now() });
      const sendGroup = async (rows, id) => {
        let sent = 0, failed = 0;
        for (let i = 0; i < rows.length; i += 10) {
          const res = await Promise.all(rows.slice(i, i + 10).map(async r => {
            if (!wantsNews(r.data)) return null;
            const [t, bd] = pick(r.data);
            return fcmSendRaw(env, r.data.token, t, bd, id).catch(() => false);
          }));
          for (const x of res) { if (x === true) sent++; else if (x === false) failed++; }
        }
        return { sent, failed };
      };
      if (b.target === "one") {
        const uid = msgText(b.uid, 128);
        if (!uid) return jsonResponse({ ok: false, error: "no_uid", message: "اختر لاعب." }, 400);
        const d = await fsGetDoc(env, "pushTokens/" + uid);
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        await appendInbox(env, "inbox/" + uid, mkItem(id));               // بالبريد داخل اللعبة دايماً (من 2.11)
        let sent = 0, failed = 0;
        if (d.exists && wantsNews(d.data)) ({ sent, failed } = await sendGroup([{ id: uid, data: d.data }], id));   // وإشعار إذا عنده جهاز مسجّل
        await fsCommit(env, [{ update: { name: docName(env, "adminMessages/" + id), fields: objToFields({ id, title: msg.title, body: msg.body, target: "one", uid, toEmail: msgText(b.email, 120), createdAt: Date.now(), status: "done", sent, failed, recipients: 1, finishedAt: Date.now() }) } }]);
        return jsonResponse({ ok: true, id, sent, failed, inbox: true, done: true }, 200);
      }
      if (b.target !== "all") return jsonResponse({ ok: false, error: "bad_target" }, 400);
      const offset = Math.max(0, parseInt(b.offset, 10) || 0);
      let id = b.id;
      if (offset === 0) {
        id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        await appendInbox(env, "config/broadcasts", mkItem(id));         // رسالة لكل اللاعبين: مرة وحدة بأول دفعة
        await fsCommit(env, [{ update: { name: docName(env, "adminMessages/" + id), fields: objToFields({ id, title: msg.title, body: msg.body, target: "all", createdAt: Date.now(), status: "sending", sent: 0, failed: 0, recipients: Math.max(0, Number(b.expected) || 0) }) } }]);
      } else if (!idOk(id)) return jsonResponse({ ok: false, error: "bad_id" }, 400);
      const rows = await fsRunQuery(env, "pushTokens", null, MSG_BATCH, offset);
      const { sent, failed } = await sendGroup(rows, id);
      return jsonResponse({ ok: true, id, processed: rows.length, sent, failed, done: rows.length < MSG_BATCH }, 200);
    }
    return jsonResponse({ ok: false, error: "bad_action" }, 400);
  } catch (e) {
    console.error({ message: "admin message failed", action, error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "failed", message: "خطأ بالسيرفر: " + String(e.message || e).replace(/\s+/g, " ").slice(0, 300) }, 500);
  }
}

// قائمة اللاعبين للأدمن: بيانات اللاعب + نقاط جدار المهام (من سجل العمليات) + عدد السحوبات
async function handleAdminPlayers(request, env) {
  const user = await verifyFirebaseToken((request.headers.get("Authorization") || "").replace("Bearer ", "")).catch(() => null);
  if (!user || user.sub !== ADMIN_UID) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  try {
    const [players, offers, wds] = await Promise.all([
      fsRunQuery(env, "players", null, 800),
      fsRunQuery(env, "offerTx", "createdAt", 1000),
      fsRunQuery(env, "withdrawRequests", "createdAt", 500),
    ]);
    const offerPts = {}, wd = {}, wdMail = {};
    for (const o of offers) { const d = o.data; if (d.uid && d.status === "credited") offerPts[d.uid] = (offerPts[d.uid] || 0) + (Number(d.originalReward) || 0); }
    for (const w of wds) { const d = w.data; if (!d.uid) continue; const x = wd[d.uid] = wd[d.uid] || { count: 0, usd: 0 }; x.count++; x.usd += Number(d.amountUsd) || (Number(d.amount) * Number(d.priceUsd)) || 0; if (d.email && !wdMail[d.uid]) wdMail[d.uid] = { email: d.email, name: d.displayName || "" }; }
    players.sort((a, b) => (Number(b.data.firstSeenAt) || 0) - (Number(a.data.firstSeenAt) || 0));
    const out = players.map(r => {
      const p = r.data, uid = r.id;
      return {
        uid, email: p.email || (wdMail[uid] && wdMail[uid].email) || "", name: p.displayName || (wdMail[uid] && wdMail[uid].name) || "",
        firstSeenDate: p.firstSeenDate || "", firstSeenAt: Number(p.firstSeenAt) || 0, lastActiveDate: p.lastActiveDate || "",
        activeDays: Number(p.activeDays) || 0, adsWatched: Number(p.adsWatched) || 0, workersRented: Number(p.workersRented) || 0,
        totalPointsEarned: Math.round(Number(p.totalPointsEarned) || 0), balanceUsd: Math.round((Number(p.balanceUsd) || 0) * 1000) / 1000,
        offerPoints: Math.round(offerPts[uid] || 0), withdrawCount: (wd[uid] && wd[uid].count) || 0, withdrawUsd: Math.round(((wd[uid] && wd[uid].usd) || 0) * 100) / 100,
        referred: !!p.referredBy,
      };
    });
    return jsonResponse({ ok: true, players: out, now: Date.now() }, 200);
  } catch (e) {
    console.error({ message: "admin players failed", error: String(e.message || e) });
    return jsonResponse({ ok: false, error: "failed", message: "خطأ بالسيرفر: " + String(e.message || e).replace(/\s+/g, " ").slice(0, 300) }, 500);
  }
}

async function handleDownload(request, env, ctx) {
  const resp = await fetch(APK_SOURCE_URL, { redirect: "follow" });
  if (!resp.ok) return new Response("تعذّر تحميل الملف حالياً (" + resp.status + ")", { status: 502 });
  const headers = new Headers();
  headers.set("Content-Type", "application/vnd.android.package-archive");
  headers.set("Content-Disposition", 'attachment; filename="yardova.apk"');
  headers.set("Cache-Control", "no-store");
  headers.set("Access-Control-Allow-Origin", "*");
  if (request) ctx.waitUntil(countDownload(request, new URL(request.url), env, ctx));
  return new Response(resp.body, { status: 200, headers });
}

async function handleSelftest(env) {
  // عام عن قصد (لتفحصه من المتصفح)، بس بدون أي تفاصيل داخلية أو أسرار
  try {
    await fsGetDoc(env, "config/appVersion");
    return jsonResponse({ ok: true, workerVersion: "inbox-1" }, 200);
  } catch (e) {
    console.error({ message: "selftest failed", error: String(e.message || e) });
    return jsonResponse({ ok: false }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    if (url.pathname === "/" && request.method === "POST") return handlePostback(request, env, ctx);
    if (url.pathname === "/sign" && request.method === "POST") return handleSign(request, env);
    if (url.pathname.startsWith("/game/") && request.method === "POST") return handleGame(request, env, url.pathname.slice(6));
    if (url.pathname === "/telegram/webhook" && request.method === "POST") return handleTelegramWebhook(request, env);
    if (url.pathname === "/auth/telegram/start" && request.method === "POST") return handleTelegramStart(request, env);
    if (url.pathname === "/auth/telegram/poll" && request.method === "POST") return handleTelegramPoll(request, env);
    if (url.pathname === "/admin/telegram" && request.method === "POST") return handleAdminTelegram(request, env);
    if (url.pathname === "/ow2") return handleOffersWallsPostback(request, env, ctx);
    if (url.pathname === "/wannads") return handleWannadsPostback(request, env, ctx);
    if (url.pathname === "/admin/notify" && request.method === "POST") return handleAdminNotify(request, env, ctx);
    if (url.pathname === "/admin/withdraw" && request.method === "POST") return handleAdminWithdraw(request, env, ctx);
    if (url.pathname === "/report-error" && request.method === "POST") return handleReportError(request, env);
    if (url.pathname === "/admin/errors" && request.method === "POST") return handleAdminErrors(request, env);
    if (url.pathname === "/today" && request.method === "GET") return jsonResponse({ today: todaySyria() }, 200);
    if (url.pathname === "/selftest" && request.method === "GET") return handleSelftest(env);
    if (url.pathname === "/dl" && request.method === "GET") return handleDownload(request, env, ctx);
    if (url.pathname === "/hit" && request.method === "POST") return handleHit(request, env, ctx);
    if (url.pathname === "/admin/traffic" && request.method === "POST") return handleAdminTraffic(request, env);
    if (url.pathname === "/admin/players" && request.method === "POST") return handleAdminPlayers(request, env);
    if (url.pathname === "/admin/message" && request.method === "POST") return handleAdminMessage(request, env);
    if (url.pathname === "/admin/shop" && request.method === "POST") return handleAdminShop(request, env);
    if (url.pathname === "/admin/store" && request.method === "POST") return handleAdminStore(request, env);
    if (url.pathname === "/store/me" && request.method === "POST") return handleStoreMe(request, env);
    if (request.method === "POST" && ["/store/quote", "/store/order", "/store/orders", "/store/prices", "/store/validate-id", "/store/topup/quote", "/store/topup", "/store/deleteMe", "/store/order/proof", "/store/order/cancel"].includes(url.pathname)) return handleStoreOrderApi(request, env, url.pathname === "/store/order/proof" ? "proof" : url.pathname === "/store/order/cancel" ? "cancel" : url.pathname === "/store/topup/quote" ? "topup_quote" : url.pathname === "/store/validate-id" ? "validate" : url.pathname === "/store/deleteMe" ? "delete" : url.pathname.slice(7), ctx);
    if (url.pathname === "/supplier/fazer/webhook" && request.method === "POST") return handleFazerWebhook(request, env);
    if (url.pathname === "/store/catalog" && (request.method === "GET" || request.method === "POST")) return storeCatalogCached(request, env, ctx);
    if (url.pathname.startsWith("/store/img/") && request.method === "GET") return handleStoreImage(env, validId(url.pathname.slice(11)));
    if (url.pathname === "/admin/inactivity" && request.method === "POST") return handleAdminInactivity(request, env);
    if (url.pathname === "/admin/wallet-reindex" && request.method === "POST") return handleAdminWalletReindex(request, env);
    if (url.pathname === "/admin/shop-orders" && request.method === "POST") return handleAdminShopOrders(request, env);
    if (url.pathname === "/public-config" && request.method === "GET") return handlePublicConfig(env);
    return new Response("Not found", { status: 404 });
  },
  // مهمة يومية (cron): تذكير، تحذير، وتنفيذ سياسة عدم النشاط إذا الأدمن فعّلها
  async scheduled(event, env, ctx) {
    if (event && event.cron === "*/5 * * * *") {         // كل 5 دقايق: متابعة طلبات FazerCards (إعادة المحاولة بنفس المفتاح + سؤال عن الحالة + تنبيه التأخير)
      ctx.waitUntil(storeAutoSweep(env).then(r => console.info({ message: "auto sweep", ...r })).catch(e => console.error({ message: "auto sweep failed", error: String(e && e.message || e) })));
      ctx.waitUntil(storeChainSweep(env, { full: new Date().getUTCMinutes() < 5 }).then(r => console.info({ message: "chain sweep", ...r })).catch(e => console.error({ message: "chain sweep failed", error: String(e && e.message || e) })));
      return;
    }
    ctx.waitUntil(storeChainBackfill(env).then(n => console.info({ message: "chain backfill", locked: n })).catch(e => console.error({ message: "chain backfill failed", error: String(e && e.message || e) })));
    ctx.waitUntil(storeSupplierWatch(env).then(r => console.info({ message: "supplier watch", ...r })).catch(e => console.error({ message: "supplier watch failed", error: String(e && e.message || e) })));
    ctx.waitUntil(storeRetentionSweep(env).then(n => console.info({ message: "store receipts retention", purged: n })).catch(e => console.error({ message: "store receipts retention failed", error: String(e && e.message || e) })));
    ctx.waitUntil(runInactivity(env, { dryRun: false }).then(r => console.info({ message: "inactivity run", ...r, plan: undefined })).catch(e => console.error({ message: "inactivity run failed", error: String(e.message || e) })));
  },
};
