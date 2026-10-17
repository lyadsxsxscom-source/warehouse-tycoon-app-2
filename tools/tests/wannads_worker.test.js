// اختبارات السيرفر: استلام نقاط جدار المهام Wannads (التوقيع، الإضافة مرة وحدة، السحب العكسي، الرد "OK")
// التشغيل: node tools/tests/wannads_worker.test.js
const vm = require("vm"), fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
function load(extra) {
  const src = fs.readFileSync(path.join(__dirname, "../../worker/worker.js"), "utf8").replace("export default {", "const __worker = {");
  const ctx = vm.createContext({ console, Request, Response, Headers, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout, Math, Date, JSON, Object, Array, Number, String, Promise, Error, Map, Set, Uint8Array, atob, btoa, fetch: () => { throw new Error("no net"); }, ...extra });
  vm.runInContext(src, ctx); return ctx;
}
const crypto2 = require("crypto");
const md5 = s => crypto2.createHash("md5").update(s).digest("hex");
const SECRET = "wannads-test-secret", GOOD_IP = "3.22.177.178";
(async () => {
  const c = load(); const credits = [], reversals = [], pushes = []; let creditResult = true, reverseResult = "reversed";
  c.md5Hex = async (x) => md5(x);                 // Node ما عنده MD5 بالـWebCrypto (Cloudflare عنده)، فبنستعمل مكتبة Node بنفس النتيجة
  c.creditOfferOnce = async (e, provider, tx, uid, amount) => { credits.push({ provider, tx, uid, amount }); return creditResult; };
  c.reverseOfferOnce = async (e, provider, tx, uid) => { reversals.push({ provider, tx, uid }); return reverseResult; };
  c.sendPush = async (e, uid, type, d) => { pushes.push({ uid, type, d }); };
  const W = vm.runInContext("__worker", c);
  const ctx = { waitUntil: p => p };
  const E = (x) => ({ WANNADS_SECRET: SECRET, FIREBASE_SA: "{}", PENDING_CREDITS: { get: async () => null, put: async () => {} }, ...x });
  const url = (o, secret = SECRET) => {
    const p = { user_id: "uid1", transaction_id: "tx-1", reward: "250", status: "credited", ...o };
    const sig = o.signature !== undefined ? o.signature : md5(p.user_id + p.transaction_id + p.reward + secret);
    return "https://postback.ly-ad.de/wannads?" + new URLSearchParams({ ...p, signature: sig }).toString();
  };
  const hit = async (u, env = E(), ip = GOOD_IP, method = "GET") => { const r = await W.fetch(new Request(u, { method, headers: ip ? { "CF-Connecting-IP": ip } : {} }), env, ctx); return { status: r.status, text: await r.text() }; };
  const reset = () => { credits.length = 0; reversals.length = 0; pushes.length = 0; creditResult = true; reverseResult = "reversed"; };

  let r = await hit(url({}));
  ok(r.status === 200 && r.text === "OK", "a valid completed offer is answered with exactly OK (what Wannads expects)");
  ok(credits.length === 1 && credits[0].provider === "wannads" && credits[0].tx === "tx-1" && credits[0].uid === "uid1" && credits[0].amount === 250, "the player gets 250 points once, recorded under provider wannads with the transaction id");
  ok(pushes.length === 1 && pushes[0].uid === "uid1" && pushes[0].type === "offerwall" && pushes[0].d.points === 250, "the player gets the 'you got points' notification");

  reset(); creditResult = false; r = await hit(url({}));
  ok(r.status === 200 && r.text === "OK" && pushes.length === 0, "the same transaction sent again (their retries) is answered OK, but no points and no notification");

  reset(); r = await hit(url({ signature: "0".repeat(32) }));
  ok(r.status === 403 && credits.length === 0, "a wrong signature is refused and nothing is credited");
  r = await hit(url({}, "another-secret"));
  ok(r.status === 403 && credits.length === 0, "a signature made with another secret is refused");
  const good = new URL(url({})); good.searchParams.set("reward", "99999");
  r = await hit(good.toString());
  ok(r.status === 403 && credits.length === 0, "changing the reward after signing (tampering) is refused");
  const noSig = new URL(url({})); noSig.searchParams.delete("signature");
  r = await hit(noSig.toString()); ok(r.status === 400, "a call without a signature is refused");
  r = await hit(url({ user_id: "a/b" })); ok(r.status === 400, "a user id with a slash is refused");
  r = await hit(url({}), E({ WANNADS_SECRET: "" })); ok(r.status === 503 && credits.length === 0, "if the secret is not configured on the server nothing is accepted");
  r = await hit(url({}), E(), GOOD_IP, "POST"); ok(r.status === 405, "only GET is accepted");

  reset(); r = await hit(url({ status: "1" }));
  ok(r.text === "OK" && credits.length === 1, "status 1 (accounts migrated from their old system) also credits");

  reset(); r = await hit(url({ status: "rejected", reward: "-250" }));
  ok(r.status === 200 && r.text === "OK" && credits.length === 0 && reversals.length === 1 && reversals[0].provider === "wannads" && reversals[0].tx === "tx-1" && reversals[0].uid === "uid1", "a rejected offer (negative reward) takes back the original points of the same transaction, once");
  reset(); r = await hit(url({ status: "2", reward: "250" }));
  ok(r.text === "OK" && reversals.length === 1, "status 2 (old system) also reverses");
  reset(); reverseResult = "duplicate"; r = await hit(url({ status: "rejected", reward: "-250" }));
  ok(r.status === 200 && r.text === "OK", "a repeated reversal is answered OK");
  reset(); reverseResult = "not_found"; r = await hit(url({ status: "rejected", reward: "-250" }));
  ok(r.status === 200 && r.text === "OK", "a reversal for a transaction we never credited is answered OK (nothing to take back)");
  reset(); reverseResult = "busy"; r = await hit(url({ status: "rejected", reward: "-250" }));
  ok(r.status === 503, "if the database is busy the reversal gets an error so Wannads retries");

  reset(); r = await hit(url({ status: "pending" }));
  ok(r.status === 200 && r.text === "OK" && credits.length === 0 && reversals.length === 0, "an unknown status is answered OK and ignored");
  for (const bad of ["0", "-5", "abc", "99999999"]) { reset(); r = await hit(url({ reward: bad })); ok(r.status === 200 && r.text === "OK" && credits.length === 0, `an invalid reward (${bad}) is answered OK but never credited`); }

  reset(); r = await hit(url({}), E(), "8.8.8.8");
  ok(r.status === 200 && credits.length === 1, "from an unexpected IP it is still accepted by default (the signature is the protection), only logged");
  reset(); r = await hit(url({}), E({ WANNADS_ENFORCE_IP: "1" }), "8.8.8.8");
  ok(r.status === 403 && credits.length === 0, "with IP enforcement on, an unexpected IP is refused");
  reset(); r = await hit(url({}), E({ WANNADS_ENFORCE_IP: "1" }), GOOD_IP);
  ok(r.status === 200 && credits.length === 1, "with IP enforcement on, their IP works");
  reset(); r = await hit(url({}), E({ WANNADS_ENFORCE_IP: "1", WANNADS_IPS: "1.2.3.4, 5.6.7.8" }), "5.6.7.8");
  ok(r.status === 200 && credits.length === 1, "their IP list can be changed from the settings without a new deploy");

  reset(); r = await W.fetch(new Request("https://postback.ly-ad.de/ow2?x=1"), E(), ctx);
  ok((await r.text()) !== "OK" && credits.length === 0, "the other task walls' addresses are untouched");
  console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.log("CRASH", e); process.exit(1); });
