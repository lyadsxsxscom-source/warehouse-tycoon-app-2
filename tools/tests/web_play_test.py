# اختبار نسخة الويب (/play): بتشتغل بدون إعلانات، تلميح تثبيت للآيفون، منفستو، وتسجيل Google بالـpopup
# التشغيل: python3 tools/tests/web_play_test.py   (بيحتاج playwright وChromium)
import json, os, subprocess, sys, threading, http.server, socketserver, functools, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
fails = 0
def ok(c, m):
    global fails
    if not c: fails += 1; print("FAIL:", m)
    else: print("ok:", m)

# server for site/
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
Handler = functools.partial(Quiet, directory=os.path.join(ROOT, "site"))
class Q(socketserver.TCPServer): allow_reuse_address = True
srv = Q(("127.0.0.1", 0), Handler); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}"

STATE = {"points":260,"totalPointsEarned":260,"balanceUsd":0,"workersRented":0,"adsWatched":0,"activeDays":2,"lastWithdrawAt":0,"boostUntil":0,"tasks":[],"shelves":[],
  "daily":{"streak":0,"lastClaim":"","rewards":[10,10,20,10,10,10,60]},
  "referral":{"code":"ABC123","invited":0,"active":0,"earnings":0,"referred":False,"rewarded":False,"canEnter":False,"progress":{"days":2,"ads":0},"cfg":{"inviteeBonus":50,"inviterReward":150,"commissionPct":5,"requiredDays":3,"requiredAds":10,"windowHours":72}}}
INIT = """
window.__authCb=null; window.__popup=0;
const q={orderBy(){return q},limit(){return q},where(){return q},onSnapshot(){return ()=>{}},get:async()=>({exists:false,data:()=>({}),docs:[],forEach(){}}),doc(){return q}};
const fsf=()=>({collection(){return q}}); fsf.FieldValue={increment:x=>x};
window.firebase={initializeApp(){},apps:[],auth(){return{onAuthStateChanged(cb){window.__authCb=cb},currentUser:null,signOut(){},signInWithPopup(){window.__popup++;return window.__popupFail?Promise.reject({code:window.__popupFail,message:'x'}):Promise.resolve()}}},firestore:fsf};
window.firebase.auth.GoogleAuthProvider=function(){};
window.fetch=async(u)=>({ok:true,status:200,json:async()=>(String(u).endsWith('/game/state')?{ok:true,state:%s}:{ok:true})});
try{localStorage.setItem('lang','%s'); localStorage.setItem('guide_seen_v1','1');}catch(e){}
"""
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
USER = "{uid:'u1',getIdToken:async()=>'t',displayName:'Friend',email:'f@x.com',photoURL:''}"

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    def page(ua=None, lang="ar", w=390, h=844):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, user_agent=ua, has_touch=bool(ua))
        pg = ctx.new_page(); pg.route("**/gstatic.com/**", lambda r: r.abort())
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
        pg.add_init_script(INIT % (json.dumps(STATE), lang)); return pg, errs, ctx
    # ---- static files
    html = open(os.path.join(ROOT, "site/play/index.html"), encoding="utf-8").read()
    ok('viewport-fit=cover' in html and 'rel="manifest" href="manifest.webmanifest"' in html and 'rel="apple-touch-icon"' in html and 'name="robots" content="noindex"' in html, "page has the viewport, manifest, apple icon and noindex tags")
    ok('apple-mobile-web-app-capable' not in html and 'mobile-web-app-capable' not in html, "the page does NOT ask iOS to run it as a standalone web app (Google popup sign-in breaks there)")
    man = json.load(open(os.path.join(ROOT, "site/play/manifest.webmanifest"), encoding="utf-8"))
    ok(man["display"] == "browser" and man["start_url"] == "/play/" and man["scope"] == "/play/" and man["name"] == "Yardova" and len(man["icons"]) == 2, "manifest: a shortcut that opens in the browser (display: browser), named Yardova, under /play/")
    pg0, _, c0 = page()
    for ic in man["icons"]:
        r = pg0.request.get(BASE + ic["src"]); ok(r.status == 200 and "image" in r.headers.get("content-type", ""), "manifest icon " + ic["src"] + " is served")
    ok(pg0.request.get(BASE + "/apple-touch-icon.png").status == 200 and pg0.request.get(BASE + "/play/sw.js").status == 200, "apple-touch icon and service worker are served")
    c0.close()
    # ---- iPhone Safari (emulated): login gate, popup sign-in, home, no ads, install hint
    pg, errs, ctx = page(IPHONE_UA)
    pg.goto(BASE + "/play/"); pg.wait_for_timeout(900)
    pg.evaluate("window.__authCb && window.__authCb(null)"); pg.wait_for_timeout(700)
    ok(pg.is_visible("#btnGoogleLoginGate"), "logged-out: the Google sign-in button is shown")
    pg.click("#btnGoogleLoginGate"); pg.wait_for_timeout(200)
    ok(pg.evaluate("window.__popup") == 1, "tapping it uses the web popup sign-in (no native plugin needed)")
    msgs = pg.evaluate("""[webAuthMessage({code:'auth/popup-closed-by-user'}), webAuthMessage({code:'auth/unauthorized-domain'}), webAuthMessage({code:'auth/network-request-failed', message:'net down'})]""")
    ok("Safari" in msgs[0] and "منع التتبع" in msgs[0] and "النطاق" not in msgs[0], "a closed Google window gets the iPhone advice (turn off cross-site tracking prevention), not a wrong blame on the domain")
    ok("Authorized" in msgs[1] or "مضاف" in msgs[1], "a really unauthorized domain gets its own message")
    ok(msgs[2].endswith("net down") and msgs[2].startswith("تعذّر تسجيل الدخول"), "other errors show their own text")
    # the real sign-in button shows the new, accurate message (not the old "preview domain" blame)
    pg.evaluate("window.alert = function(m){ window.__alerted = m; }; window.__popupFail = 'auth/popup-closed-by-user'; 0"); pg.click("#btnGoogleLoginGate"); pg.wait_for_timeout(300)
    al = pg.evaluate("window.__alerted || ''")
    ok("Safari" in al and "منع التتبع" in al and "غير مصرّح" not in al, "when the Google window closes, the player sees the iPhone advice, not the old wrong domain message")
    pg.evaluate("window.__popupFail = 'auth/unauthorized-domain'; window.__alerted = ''; 0"); pg.click("#btnGoogleLoginGate"); pg.wait_for_timeout(300)
    ok("Authorized" in pg.evaluate("window.__alerted || ''") or "مضاف" in pg.evaluate("window.__alerted || ''"), "a really unauthorized domain gets its own message")
    pg.evaluate("window.__popupFail = ''; 0")
    pg.evaluate(f"window.__authCb({USER})"); pg.wait_for_timeout(3000)
    ok(pg.evaluate("!!document.querySelector('.navbtn.active')") and pg.is_visible(".bottomnav"), "after login the game opens with its navigation")
    pg.click("#btnEarn"); pg.wait_for_timeout(300)
    ok(not pg.is_visible("#optAd") and pg.is_visible("#optOfferwall"), "in the earn menu the ads option is hidden and the task wall stays")
    pg.click("#closeEarn")
    ok(pg.is_visible("#iosHint") and "إضافة إلى الشاشة الرئيسية" in pg.inner_text("#iosHint"), "iPhone Safari: the 'Add to Home Screen' shortcut hint is shown")
    pg.screenshot(path="/tmp/play_iphone.png")
    pg.click("#iosHint button"); pg.wait_for_timeout(100)
    ok(not pg.is_visible("#iosHint") and pg.evaluate("localStorage.getItem('ios_hint_closed')") == "1", "the hint can be closed and stays closed")
    pg.reload(); pg.wait_for_timeout(900); pg.evaluate(f"window.__authCb({USER})"); pg.wait_for_timeout(2500)
    ok(pg.query_selector("#iosHint") is None, "after closing it is not shown again")
    ok(not pg.evaluate("(function(){var n=document.getElementById('btnNotifSettings');return n && n.closest('.stat-row').style.display!=='none'})()"), "push-notification settings are hidden on the web")
    ok(len(errs) == 0, "no script errors on the iPhone page " + json.dumps(errs[:2])); ctx.close()
    # ---- language of the hint
    for lang, frag in [("en", "Add to Home Screen"), ("tr", "Ana Ekrana Ekle")]:
        pg, errs, ctx = page(IPHONE_UA, lang); pg.goto(BASE + "/play/"); pg.wait_for_timeout(900); pg.evaluate(f"window.__authCb({USER})"); pg.wait_for_timeout(2500)
        ok(pg.is_visible("#iosHint") and frag in pg.inner_text("#iosHint"), f"the install hint speaks {lang}"); ctx.close()
    # ---- installed (standalone) and desktop: no hint
    ctx = b.new_context(viewport={"width": 390, "height": 844}, user_agent=IPHONE_UA); pg = ctx.new_page(); pg.route("**/gstatic.com/**", lambda r: r.abort())
    pg.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});" + INIT % (json.dumps(STATE), "ar")); pg.goto(BASE + "/play/"); pg.wait_for_timeout(900); pg.evaluate(f"window.__authCb({USER})"); pg.wait_for_timeout(2500)
    ok(pg.query_selector("#iosHint") is None, "already installed (standalone): no shortcut hint"); ctx.close()
    # ---- an old standalone icon at the login gate: explain how to fix it; logged-in: no warning
    ctx = b.new_context(viewport={"width": 390, "height": 844}, user_agent=IPHONE_UA); pg = ctx.new_page(); pg.route("**/gstatic.com/**", lambda r: r.abort())
    pg.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});" + INIT % (json.dumps(STATE), "ar")); pg.goto(BASE + "/play/"); pg.wait_for_timeout(900); pg.evaluate("window.__authCb(null)"); pg.wait_for_timeout(2200)
    ok(pg.is_visible("#standaloneWarn") and "Safari" in pg.inner_text("#standaloneWarn") and "احذف هالأيقونة" in pg.inner_text("#standaloneWarn"), "old standalone icon + login screen: a clear note says to delete the icon and open it in Safari")
    pg.evaluate(f"window.__authCb({USER})"); pg.wait_for_timeout(3000)
    ok(pg.query_selector("#standaloneWarn") is None, "once logged in the note disappears"); ctx.close()
    pg, errs, ctx = page(IPHONE_UA, "en"); pg.goto(BASE + "/play/"); pg.wait_for_timeout(900); pg.evaluate("window.__authCb(null)"); pg.wait_for_timeout(1500)
    ok(pg.query_selector("#standaloneWarn") is None, "in normal Safari (not standalone) the note is never shown"); ctx.close()
    pg, errs, ctx = page(None, "ar", 1000, 800); pg.goto(BASE + "/play/"); pg.wait_for_timeout(900); pg.evaluate(f"window.__authCb({USER})"); pg.wait_for_timeout(2500)
    ok(pg.query_selector("#iosHint") is None and not pg.is_visible("#optAd") if pg.query_selector("#optAd") else True, "desktop browser: no iOS hint, still no ads option"); ctx.close()
    # ---- the GitHub Pages copy (a second address that works on networks where the custom domain doesn't)
    Handler2 = functools.partial(Quiet, directory=os.path.join(ROOT, "docs"))
    srv2 = Q(("127.0.0.1", 0), Handler2); threading.Thread(target=srv2.serve_forever, daemon=True).start(); BASE2 = f"http://127.0.0.1:{srv2.server_address[1]}"
    pg, errs, ctx = page(IPHONE_UA); pg.goto(BASE2 + "/play/"); pg.wait_for_timeout(900)
    pg.evaluate("window.__authCb && window.__authCb(null)"); pg.wait_for_timeout(600); pg.click("#btnGoogleLoginGate"); pg.wait_for_timeout(200)
    ok(pg.evaluate("window.__popup") == 1, "GitHub Pages copy: Google popup sign-in works")
    pg.evaluate(f"window.__authCb({USER})"); pg.wait_for_timeout(2500)
    ok(pg.is_visible(".bottomnav") and pg.is_visible("#iosHint") and not (pg.query_selector("#optAd") and pg.is_visible("#optAd")), "GitHub Pages copy: game opens, install hint shown, no ads option")
    man2 = json.load(open(os.path.join(ROOT, "docs/play/manifest.webmanifest"), encoding="utf-8"))
    ok(man2["scope"] == "/warehouse-tycoon-app-2/play/" and all(pg.request.get(BASE2 + "/play/" + i["src"]).status == 200 for i in man2["icons"]) and pg.request.get(BASE2 + "/play/apple-touch-icon.png").status == 200, "GitHub Pages copy: manifest scope is its own folder and the icons are next to the page")
    ok(len(errs) == 0, "GitHub Pages copy: no script errors " + json.dumps(errs[:2])); ctx.close()
    b.close()

# ---- the service worker logic (network first, never caches other origins or non-GET)
js = r"""
const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(process.argv[2],'utf8'); const handlers={}; const store=new Map(); let fetched=[];
const caches={ open: async()=>({ put: async(k,v)=>store.set(k.url||k,v), addAll: async()=>{} }), keys: async()=>['old'], delete: async()=>true, match: async(r)=>store.get(r.url||r) };
const self={ location:{origin:'https://yardova.ly-ad.de'}, addEventListener:(n,f)=>handlers[n]=f, skipWaiting(){}, clients:{claim(){}} };
vm.runInNewContext(src,{ self, caches, fetch: async(r)=>{ fetched.push(r.url); if(global.OFFLINE) throw new Error('off'); return { ok:true, clone(){return this;} }; }, URL, Promise, location:self.location });
const run=async(url,method='GET')=>{ let res; handlers.fetch({ request:{url,method}, respondWith:p=>{res=p;} }); return res? await res.catch(e=>'ERR') : 'PASS'; };
(async()=>{
  const out={};
  out.otherOrigin = await run('https://api.example.com/x');
  out.post = await run('https://yardova.ly-ad.de/play/x','POST');
  out.same = (await run('https://yardova.ly-ad.de/play/i18n.js')) !== 'PASS';
  global.OFFLINE=true; out.offlineFallback = (await run('https://yardova.ly-ad.de/play/i18n.js')) !== 'ERR';
  console.log(JSON.stringify(out));
})();
"""
open("/tmp/sw_test.js", "w").write(js)
out = json.loads(subprocess.run(["node", "/tmp/sw_test.js", os.path.join(ROOT, "site/play/sw.js")], capture_output=True, text=True).stdout.strip().splitlines()[-1])
ok(out["otherOrigin"] == "PASS" and out["post"] == "PASS", "service worker ignores other sites (server, Firebase) and non-GET requests")
ok(out["same"] and out["offlineFallback"], "service worker answers same-site files, falling back to the cache when offline")
# the Android app files are untouched by the web build
diff = subprocess.run(["git", "-C", ROOT, "diff", "--stat", "--", "www"], capture_output=True, text=True).stdout.strip()
ok(diff == "", "the Android app's files (www/) are untouched")
print("ALL PASSED" if not fails else f"FAILS {fails}"); sys.exit(1 if fails else 0)
