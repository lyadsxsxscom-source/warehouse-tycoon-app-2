// =====================================================================
// Warehouse Tycoon — Cloudflare Worker (morning-lake-dfd1)
// السيرفر هو المرجع الوحيد لاقتصاد اللعبة: النقاط، المحفظة، الرفوف، العمال، المهام، السحب.
// ⚠️ لا تحط أي مفتاح سري بهالملف (المستودع عام). المفاتيح كلها Secrets بـ Cloudflare:
//    FIREBASE_SA       — مفتاح حساب الخدمة (JSON كامل)
//    OFFERWALL_SECRET  — المفتاح السري لـ Offerwall.me (postback + توقيع الهوية)
// والـ binding: PENDING_CREDITS (KV)
// =====================================================================

const OFFERWALL_PUBLIC_KEY = "lO3dCGRok7Q77hZ6FPFTikHdwx9mZs";
const FIREBASE_PROJECT_ID = "warehouse-tycoon-a3f83";
const ADMIN_UID = "09DZoXtB6afGTGHtFghiUx5t71N2";
const APK_SOURCE_URL = "https://github.com/lyadsxsxscom-source/warehouse-tycoon-app-2/releases/download/latest-debug/app-debug.apk";

// ===== ثوابت اللعبة (نفس قيم التطبيق الافتراضية؛ الأدمن بيعدّلها من gameConfig) =====
const DURATIONS = { day: 86400, week: 604800, month: 2592000 };
const SHELF_COUNT = 6;
const DEFAULT_SHELF_COST = [0, 0, 120, 350, 800, 1600];
const DEFAULT_WORKERS = {
  btc_day:   { cost: 100,  rate: 0.0000000000164400 },
  btc_week:  { cost: 600,  rate: 0.0000000000140915 },
  btc_month: { cost: 2000, rate: 0.0000000000109600 },
  eth_day:   { cost: 100,  rate: 0.0000000005217516 },
  eth_week:  { cost: 600,  rate: 0.0000000004472157 },
  eth_month: { cost: 2000, rate: 0.0000000003478344 },
};
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
function creditWrite(env, uid, pts, extra = {}) {
  const t = [
    { fieldPath: "points", increment: { doubleValue: pts } },
    { fieldPath: "totalPointsEarned", increment: { doubleValue: pts } },
  ];
  for (const [f, v] of Object.entries(extra)) t.push({ fieldPath: f, increment: Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v } });
  return { update: { name: docName(env, "players/" + uid), fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: t };
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

function newTasks() {
  return [
    { id: "watch3", label: "شاهد 3 إعلانات",     reward: 30, progress: 0, target: 3, claimed: false },
    { id: "rent1",  label: "استأجر عامل واحد",   reward: 40, progress: 0, target: 1, claimed: false },
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
let cachedGoogleToken = null;
async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleToken && cachedGoogleToken.exp > now + 60) return cachedGoogleToken.token;
  if (!env.FIREBASE_SA) throw new Error("FIREBASE_SA secret is missing");
  const sa = JSON.parse(env.FIREBASE_SA);
  const header = strToB64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = strToB64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
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
  cachedGoogleToken = { token: j.access_token, exp: now + (j.expires_in || 3600) };
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
  const [game, pricing] = await Promise.all([fsGetDoc(env, "config/gameConfig"), fsGetDoc(env, "config/pricing")]);
  const value = { game: game.data || {}, pricing: pricing.data || {} };
  cachedConfig = { at: Date.now(), value };
  return value;
}
function shelfCost(cfg, id) {
  const arr = cfg.game.shelfUnlockCost;
  return Array.isArray(arr) && typeof arr[id] === "number" ? arr[id] : DEFAULT_SHELF_COST[id];
}
function workerSpec(cfg, coin, kind) {
  const key = coin + "_" + kind;
  const def = DEFAULT_WORKERS[key];
  const custom = (cfg.game.workers || {})[key] || {};
  const cost = typeof custom.cost === "number" ? custom.cost : def.cost;
  let rate = def.rate;
  const price = coin === "btc" ? cfg.pricing.btcUsd : cfg.pricing.ethUsd;
  if (typeof custom.usdPerDuration === "number" && price > 0) rate = custom.usdPerDuration / price / DURATIONS[kind];
  return { cost, rate, seconds: DURATIONS[kind] };
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
function normalizePlayer(raw, now, today) {
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
  p.wallet = { btc: Number((p.wallet || {}).btc) || 0, eth: Number((p.wallet || {}).eth) || 0 };
  p.adsWatched = Number(p.adsWatched) || 0;
  p.workersRented = Number(p.workersRented) || 0;
  p.adsToday = Number(p.adsToday) || 0;
  p.lastAdAt = Number(p.lastAdAt) || 0;
  p.lastWithdrawAt = Number(p.lastWithdrawAt) || 0;
  p.boostFrom = Number(p.boostFrom) || 0;
  p.boostUntil = Number(p.boostUntil) || 0;
  if (!p.lastSettleAt) p.lastSettleAt = now; // لاعب قديم: الحساب السيرفري بيبلّش من هلق
  if (p.dailyDate !== today || !Array.isArray(p.tasks)) {
    p.tasks = newTasks();
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
      if (w.coin === "btc" || w.coin === "eth") p.wallet[w.coin] += gain;
    }
  }
  p.lastSettleAt = now;
}
function publicState(p, now, cfg) {
  return {
    points: p.points, totalPointsEarned: p.totalPointsEarned, wallet: p.wallet,
    shelves: p.shelves, tasks: p.tasks, dailyDate: p.dailyDate,
    adsWatched: p.adsWatched, workersRented: p.workersRented,
    boostUntil: p.boostUntil, lastWithdrawAt: p.lastWithdrawAt, serverNow: now,
    serverToday: todaySyria(now),
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
async function mutatePlayer(env, uid, fn) {
  const path = "players/" + uid;
  for (let attempt = 0; attempt < 4; attempt++) {
    const doc = await fsGetDoc(env, path);
    const now = Date.now();
    const p = normalizePlayer(doc.data, now, todaySyria(now));
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
    ar: (p) => ["تم إرسال سحبك ✅", `انبعت ${p.amount} ${p.coin} لمحفظتك.`],
    tr: (p) => ["Çekimin gönderildi ✅", `${p.amount} ${p.coin} cüzdanına gönderildi.`],
    en: (p) => ["Withdrawal sent ✅", `${p.amount} ${p.coin} was sent to your wallet.`],
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
// نوع الإشعار ← مفتاح الإعداد يلي بيقدر المستخدم يطفيه من التطبيق
const PUSH_PREF = { offerwall: "offerwall", withdraw_ok: "orders", withdraw_rejected: "orders", topup: "orders", topup_rejected: "orders", referral: "offerwall" };

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
        if (total > 0) { p.points += total; p.totalPointsEarned += total; }
        const today = todaySyria(now);
        if (p.lastActiveDate !== today) p.activeDays += 1;
        p.lastActiveDate = today;
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
      const coin = body.coin, kind = body.kind;
      if (!["btc", "eth"].includes(coin) || typeof kind !== "string" || !Object.hasOwn(DURATIONS, kind)) throw new ApiError("bad_worker", "نوع عامل غير صحيح.");
      return mutatePlayer(env, uid, (p, now) => {
        const s = p.shelves[id];
        if (!s || !s.unlocked) throw new ApiError("bad_shelf", "هذا الرف مقفول.");
        if (s.worker && s.worker.expiresAt > now) throw new ApiError("busy_shelf", "هذا العامل شغّال حالياً.");
        const spec = workerSpec(cfg, coin, kind);
        if (p.points < spec.cost) throw new ApiError("not_enough_points", "نقاط غير كافية.");
        p.points -= spec.cost;
        s.worker = { kind, coin, rate: spec.rate, startAt: now, expiresAt: now + spec.seconds * 1000 };
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
      });
    }

    case "adReward": {
      return mutatePlayer(env, uid, (p, now) => {
        if (now - p.lastAdAt < AD_MIN_INTERVAL_MS) throw new ApiError("too_fast", "استنى شوي قبل الإعلان الجاي.");
        if (p.adsToday >= AD_DAILY_LIMIT) throw new ApiError("daily_limit", "وصلت للحد اليومي لمكافآت الإعلانات.");
        p.points += AD_REWARD_POINTS;
        p.totalPointsEarned += AD_REWARD_POINTS;
        p.adsWatched += 1;
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
      const network = String(body.network || "").slice(0, 40);
      if (!["btc", "eth"].includes(coin)) throw new ApiError("bad_coin", "عملة غير صحيحة.");
      const NETWORKS = { btc: ["BTC", "BEP20"], eth: ["ERC20", "BEP20"] }; // نفس الخيارات بالتطبيق
      if (!NETWORKS[coin].includes(network)) throw new ApiError("bad_network", "الشبكة ما بتناسب العملة المختارة.");
      if (!address || address.length > 200) throw new ApiError("bad_address", "حط عنوان محفظة صحيح.");
      if (!Number.isFinite(amount) || !(amount > 0)) throw new ApiError("bad_amount", "حط مبلغ صحيح.");
      return mutatePlayer(env, uid, (p, now) => {
        if (amount > p.wallet[coin]) throw new ApiError("not_enough_balance", "المبلغ أكبر من رصيدك المتاح.");
        const minUsd = cfg.pricing.minWithdrawUsd > 0 ? cfg.pricing.minWithdrawUsd : 20;
        const price = coin === "btc" ? cfg.pricing.btcUsd : cfg.pricing.ethUsd;
        if (price > 0 && amount * price < minUsd) throw new ApiError("below_min", `الحد الأدنى للسحب ${minUsd}$.`);
        if (now - p.lastWithdrawAt < WITHDRAW_COOLDOWN_MS) {
          const h = Math.ceil((WITHDRAW_COOLDOWN_MS - (now - p.lastWithdrawAt)) / 3600000);
          throw new ApiError("cooldown", `تقدر تسحب مرة كل 24 ساعة بس — جرّب بعد حوالي ${h} ساعة.`);
        }
        p.wallet[coin] -= amount;
        p.lastWithdrawAt = now;
        const request = {
          uid, displayName: user.name || "", email: user.email || "",
          coin, network, amount, walletAddress: address,
          totalPointsEarnedSnapshot: p.totalPointsEarned,
          workersRentedSnapshot: p.workersRented,
          adsWatchedSnapshot: p.adsWatched,
          status: "pending", createdAt: now,
        };
        return {
          writes: [{
            update: { name: docName(env, "withdrawRequests/" + randomId()), fields: objToFields(request) },
            currentDocument: { exists: false },
          }, statsWrite(env, todaySyria(now), { withdraws: 1 })],
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
        return { writes, result: { awarded: award } };
      });
    }

    case "registerPush": {
      const token = String(body.token || "");
      if (!token || token.length > 4096) throw new ApiError("bad_token", "رمز إشعارات غير صالح.");
      const lang = ["ar", "tr", "en"].includes(body.lang) ? body.lang : "ar";
      const prefs = { offerwall: body.prefs?.offerwall !== false, orders: body.prefs?.orders !== false };
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

async function handleGame(request, env, action) {
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
    creditWrite(env, uid, amount),
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
    ctx.waitUntil(sendPush(env, req.data.uid, type, { amount: Number(req.data.amount).toFixed(8).replace(/0+$/, "").replace(/\.$/, ""), coin: String(req.data.coin || "").toUpperCase() }));
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

async function handleDownload() {
  const resp = await fetch(APK_SOURCE_URL, { redirect: "follow" });
  if (!resp.ok) return new Response("تعذّر تحميل الملف حالياً (" + resp.status + ")", { status: 502 });
  const headers = new Headers();
  headers.set("Content-Type", "application/vnd.android.package-archive");
  headers.set("Content-Disposition", 'attachment; filename="warehouse-tycoon.apk"');
  headers.set("Cache-Control", "no-store");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(resp.body, { status: 200, headers });
}

async function handleSelftest(env) {
  // عام عن قصد (لتفحصه من المتصفح)، بس بدون أي تفاصيل داخلية أو أسرار
  try {
    await fsGetDoc(env, "config/appVersion");
    return jsonResponse({ ok: true, workerVersion: "sec-2" }, 200);
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
    if (url.pathname === "/ow2") return handleOffersWallsPostback(request, env, ctx);
    if (url.pathname === "/admin/notify" && request.method === "POST") return handleAdminNotify(request, env, ctx);
    if (url.pathname === "/today" && request.method === "GET") return jsonResponse({ today: todaySyria() }, 200);
    if (url.pathname === "/selftest" && request.method === "GET") return handleSelftest(env);
    if (url.pathname === "/dl" && request.method === "GET") return handleDownload();
    return new Response("Not found", { status: 404 });
  },
};
