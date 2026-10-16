# يبني نسخة الويب (PWA للآيفون وأي متصفح) من www/ إلى site/play/ بدون ما يلمس تطبيق الأندرويد.
# التعديلات بتنحط وقت البناء بس: ما في إعلانات (إعلانات Unity أصلية بالأندرويد)، وما في إشعارات دفع، وتلميح التثبيت لـSafari.
import os, re, json, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(HERE, "..", "www")
SITE = os.path.join(HERE, "..", "site")
OUT = os.path.join(SITE, "play")
DOCS = os.path.join(HERE, "..", "docs")
PAGES_BASE = "/warehouse-tycoon-app-2/play/"      # عنوان GitHub Pages (بديل لما الدومين ما بيفتح عند بعض الشبكات)

HEAD_ADD = '''<meta name="robots" content="noindex">
<meta name="theme-color" content="#0F3B33">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Yardova">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" href="/favicon.ico">
'''

WEB_JS = r'''<script>
// ===== نسخة الويب (آيفون وأي متصفح) =====
(function(){
  try{
    var L = (window.I18N && I18N.lang) || 'ar';
    var T = {
      ar: { hint: 'لتثبيتها كتطبيق: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».', close: 'إغلاق' },
      tr: { hint: 'Uygulama olarak kurmak için: Paylaş düğmesine, sonra «Ana Ekrana Ekle»ye dokun.', close: 'Kapat' },
      en: { hint: 'To install it as an app: tap the Share button, then “Add to Home Screen”.', close: 'Close' }
    }[L] || null;
    if(!T) T = { hint: 'To install it as an app: tap the Share button, then “Add to Home Screen”.', close: 'Close' };
    // 1) ما في إعلانات بالويب (الإعلانات أصلية بالأندرويد)
    var ad = document.getElementById('optAd'); if(ad) ad.style.display = 'none';
    // 2) إعدادات إشعارات الدفع مو متوفرة بالويب
    var n = document.getElementById('btnNotifSettings'); if(n){ var r = n.closest('.stat-row') || n; r.style.display = 'none'; }
    // 3) تلميح التثبيت على الشاشة الرئيسية (آيفون/آيباد، Safari، مو مثبّتة بعد)
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    var standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    var closed = false; try{ closed = localStorage.getItem('ios_hint_closed') === '1'; }catch(e){}
    if(isIOS && !standalone && !closed){
      var b = document.createElement('div'); b.id = 'iosHint';
      b.style.cssText = 'position:fixed;left:10px;right:10px;bottom:calc(92px + env(safe-area-inset-bottom));z-index:35;background:#14302A;border:2px solid #F4C21F;border-radius:4px;box-shadow:4px 4px 0 #000;padding:10px 12px;display:flex;gap:10px;align-items:center;font-size:12px;line-height:1.7;color:#F3F5EE;';
      var t = document.createElement('div'); t.style.flex = '1'; t.textContent = T.hint;
      var x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', T.close);
      x.style.cssText = 'background:transparent;border:0;color:#F4C21F;font-size:22px;line-height:1;cursor:pointer;';
      x.onclick = function(){ b.remove(); try{ localStorage.setItem('ios_hint_closed', '1'); }catch(e){} };
      b.appendChild(t); b.appendChild(x); document.body.appendChild(b);
    }
    // 4) خدمة التخزين المؤقت (بتخلّي التطبيق يفتح أسرع)
    if('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function(){});
  }catch(e){}
})();
</script>
</body>'''

MANIFEST = {
    "name": "Yardova", "short_name": "Yardova", "description": "لعبة إدارة مستودع مجانية",
    "start_url": "/play/", "scope": "/play/", "display": "standalone", "orientation": "portrait",
    "background_color": "#0F3B33", "theme_color": "#0F3B33", "lang": "ar", "dir": "rtl",
    "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"}],
}

SW = '''// خدمة تخزين مؤقت بسيطة: الشبكة أولاً، وإذا انقطعت بنرجع للمخزّن (للملفات من نفس الموقع بس)
const V = 'yardova-play-1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll(['./', 'i18n.js', 'manifest.webmanifest']).catch(() => {}))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if(e.request.method !== 'GET' || u.origin !== location.origin) return;     // طلبات السيرفر وفايربيس ما بتنخزّن أبداً
  e.respondWith(fetch(e.request).then(r => { if(r.ok){ const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request)));
});
'''

def build_one(out, start, icon_prefix, icons_dir=None):
    """out: مجلد الإخراج. start: مسار البداية. icon_prefix: مسار الأيقونات بالمنفستو. icons_dir: إذا الأيقونات لازم تنسخ جنب الصفحة."""
    html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
    assert html.count('<meta name="viewport" content="width=device-width, initial-scale=1.0">') == 1
    html = html.replace('<meta name="viewport" content="width=device-width, initial-scale=1.0">',
                        '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n' + (HEAD_ADD if icons_dir is None else HEAD_ADD.replace('"/apple-touch-icon.png"', '"apple-touch-icon.png"').replace('"/favicon.ico"', '"icon-192.png"')))
    assert html.count("</body>") == 1
    html = html.replace("</body>", WEB_JS)
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)
    shutil.copy(os.path.join(WWW, "i18n.js"), os.path.join(out, "i18n.js"))
    man = dict(MANIFEST); man["start_url"] = start; man["scope"] = start
    man["icons"] = [{"src": icon_prefix + "icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": icon_prefix + "icon-512.png", "sizes": "512x512", "type": "image/png"}]
    open(os.path.join(out, "manifest.webmanifest"), "w", encoding="utf-8").write(json.dumps(man, ensure_ascii=False, indent=2))
    open(os.path.join(out, "sw.js"), "w", encoding="utf-8").write(SW)
    if icons_dir:
        for f in ("icon-192.png", "icon-512.png", "apple-touch-icon.png"): shutil.copy(os.path.join(icons_dir, f), os.path.join(out, f))
    print("web version written to", os.path.relpath(out, os.path.join(HERE, "..")), ":", sorted(os.listdir(out)))

def build():
    build_one(OUT, "/play/", "/")                                                   # yardova.ly-ad.de/play/
    build_one(os.path.join(DOCS, "play"), PAGES_BASE, "", icons_dir=SITE)            # lyadsxsxscom-source.github.io/warehouse-tycoon-app-2/play/

if __name__ == "__main__":
    build()
