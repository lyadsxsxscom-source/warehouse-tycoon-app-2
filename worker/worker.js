// =====================================================================
// Warehouse Tycoon — Cloudflare Worker (morning-lake-dfd1)
// السيرفر هو المرجع الوحيد لاقتصاد اللعبة: النقاط، المحفظة، الرفوف، العمال، المهام، السحب.
// ⚠️ لا تحط أي مفتاح سري بهالملف (المستودع عام). المفاتيح كلها Secrets بـ Cloudflare:
//    FIREBASE_SA       — مفتاح حساب الخدمة (JSON كامل)
//    OFFERWALL_SECRET  — المفتاح السري لـ Offerwall.me (postback + توقيع الهوية)
// والـ binding: PENDING_CREDITS (KV)
// =====================================================================

const OFFERWALL_PUBLIC_KEY = "DVi4ShFau6GZOWTjPSDyIbYatdimPk";
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

function newTasks() {
  return [
    { id: "login",  label: "تسجيل الدخول اليوم", reward: 20, done: true, claimed: false },
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
function randomId(len = 20) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map(b => chars[b % chars.length]).join("");
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
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore",
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
async function verifyFirebaseToken(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== "https://securetoken.google.com/" + FIREBASE_PROJECT_ID) return null;
  if (!payload.sub || payload.exp < now) return null;
  const jwks = await (await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")).json();
  const jwk = jwks.keys.find(k => k.kid === header.kid);
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
  }
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
function publicState(p, now) {
  return {
    points: p.points, totalPointsEarned: p.totalPointsEarned, wallet: p.wallet,
    shelves: p.shelves, tasks: p.tasks, dailyDate: p.dailyDate,
    adsWatched: p.adsWatched, workersRented: p.workersRented,
    boostUntil: p.boostUntil, lastWithdrawAt: p.lastWithdrawAt, serverNow: now,
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
      return mutatePlayer(env, uid, (p) => {
        const total = pending.reduce((sum, c) => sum + (Number(c.reward) || 0), 0);
        if (total > 0) { p.points += total; p.totalPointsEarned += total; }
        return {
          result: { credited: total },
          after: pending.length ? () => env.PENDING_CREDITS.delete(key) : null,
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
      if (!["btc", "eth"].includes(coin) || !DURATIONS[kind]) throw new ApiError("bad_worker", "نوع عامل غير صحيح.");
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
      });
    }

    case "withdraw": {
      const coin = body.coin;
      const amount = Number(body.amount);
      const address = String(body.address || "").trim();
      const network = String(body.network || "").slice(0, 40);
      if (!["btc", "eth"].includes(coin)) throw new ApiError("bad_coin", "عملة غير صحيحة.");
      if (!address || address.length > 200) throw new ApiError("bad_address", "حط عنوان محفظة صحيح.");
      if (!(amount > 0)) throw new ApiError("bad_amount", "حط مبلغ صحيح.");
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
          }],
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
    return jsonResponse({ ok: true, state: publicState(p, now), result: result || null }, 200);
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

async function handlePostback(request, env) {
  const params = new URLSearchParams(await request.text());
  const subId = params.get("subId") || "";
  const transId = params.get("transId") || "";
  const reward = params.get("reward") || "0";
  const status = params.get("status") || "";
  const signature = params.get("signature") || "";
  console.info({ message: "Postback received", subId, transId, reward, status });

  if (!subId || !transId || !signature) return new Response("Missing fields", { status: 400 });
  if (subId.includes("/") || subId.length > 128) return new Response("Bad subId", { status: 400 });
  const expectedSig = await md5Hex(subId + transId + reward + env.OFFERWALL_SECRET);
  if (expectedSig !== signature) {
    console.warn({ message: "Invalid signature", subId, transId });
    return new Response("Invalid signature", { status: 403 });
  }
  if (status !== "1") return new Response("OK - not approved", { status: 200 });

  const doneKey = "done:" + transId;
  if (await env.PENDING_CREDITS.get(doneKey)) return new Response("OK - duplicate", { status: 200 });

  const amount = parseFloat(reward) || 0;
  if (amount > 0) {
    // إضافة ذرّية مباشرة لرصيد اللاعب (بدون ما تمر بالجوال)
    await fsCommit(env, [{
      update: { name: docName(env, "players/" + subId), fields: {} },
      updateMask: { fieldPaths: [] },
      updateTransforms: [
        { fieldPath: "points", increment: { doubleValue: amount } },
        { fieldPath: "totalPointsEarned", increment: { doubleValue: amount } },
      ],
    }]);
  }
  await env.PENDING_CREDITS.put(doneKey, "1", { expirationTtl: 60 * 60 * 24 * 180 });
  return new Response("OK", { status: 200 });
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
  try {
    const doc = await fsGetDoc(env, "config/appVersion");
    return jsonResponse({ ok: true, firestore: "connected", offerwallSecret: !!env.OFFERWALL_SECRET, appVersionDocExists: doc.exists }, 200);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e.message || e) }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    if (url.pathname === "/" && request.method === "POST") return handlePostback(request, env);
    if (url.pathname === "/sign" && request.method === "POST") return handleSign(request, env);
    if (url.pathname.startsWith("/game/") && request.method === "POST") return handleGame(request, env, url.pathname.slice(6));
    if (url.pathname === "/today" && request.method === "GET") return jsonResponse({ today: todaySyria() }, 200);
    if (url.pathname === "/selftest" && request.method === "GET") return handleSelftest(env);
    if (url.pathname === "/dl" && request.method === "GET") return handleDownload();
    return new Response("Not found", { status: 404 });
  },
};
