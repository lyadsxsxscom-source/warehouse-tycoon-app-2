# يولّد صفحة Cratelo (3 لغات + ملفات البحث + الأيقونات) داخل مجلد site/
# التشغيل: python3 tools/site_build.py
import html, json, os, re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..", "site")
BASE = "https://cratelo.ly-ad.de"
DL = "https://postback.ly-ad.de/dl"
APKPURE = "https://apkpure.com/p/com.warehousetycoon.app"
SHOP = "https://lyadsxsxscom-source.github.io/warehouse-tycoon-app-2/"
PRIVACY = SHOP + "privacy.html"
TERMS = SHOP + "terms.html"
MAIL = "admin@ly-ad.de"
UPDATED = "2026-10-06"

TEAL, TEAL_D, YELLOW, INK, PAPER = (0x17, 0x56, 0x4A), (0x0F, 0x3B, 0x33), (0xF4, 0xC2, 0x1F), (0x10, 0x21, 0x1C), (0xF3, 0xF5, 0xEE)

LANGS = {
 "ar": dict(code="ar", dir="rtl", path="/", locale="ar_AR", name="العربية",
  title="Cratelo – لعبة إدارة مستودع للأندرويد",
  desc="لعبة مجانية للأندرويد: اكسب نقاطاً من المهام، استأجر عمّالاً يشغّلون مستودعك، واسحب رصيدك بـ USDT أو BTC أو ETH أو شام كاش.",
  skip="تخطّي إلى المحتوى", h1="مستودعك يشتغل حتى لو ما فتحت اللعبة",
  sub="Cratelo لعبة إدارة مستودع مجانية للأندرويد. تكسب نقاطاً من المهام والإعلانات، وتستأجر بها عمّالاً ينتجون رصيداً بالدولار. وعندما يصل رصيدك إلى الحد الأدنى تسحبه.",
  cta1="تحميل التطبيق (APK)", cta2="تحميل من ApkPure", small="مجاني. لأجهزة أندرويد فقط. للبالغين 18 سنة فأكثر.",
  how="كيف تلعب",
  steps=[("اكسب نقاطاً","أنجز المهام اليومية، وشاهد الإعلانات، أو جرّب عروض الشركاء من زر واحد داخل اللعبة."),
         ("استأجر عمّالاً","عامل يومي أو أسبوعي أو شهري. ينتج رصيداً بالدولار حتى لو كان التطبيق مغلقاً."),
         ("اسحب رصيدك","عندما يصل رصيدك إلى 20$ تقدر تسحبه بـ USDT أو BTC أو ETH أو عبر شام كاش.")],
  pay="الرصيد والسحب",
  pay_text="الرصيد محسوب بالدولار، وتعرضه بـ USDT أو BTC أو ETH بنفس القيمة. الحد الأدنى للسحب 20$، وسحب واحد كل 24 ساعة. تُراجَع طلبات السحب يدوياً قبل التحويل.",
  chips=["USDT (TRC20 وBEP20)","BTC","ETH","شام كاش"],
  warn="تنبيه: الرصيد يأتي من مهام وعروض شركاء الإعلانات، ولا يوجد أي ضمان للربح. توفّر العروض يختلف من بلد لآخر ومن وقت لآخر.",
  faq="أسئلة شائعة",
  faqs=[("هل Cratelo مجانية؟","نعم. التحميل واللعب مجانيان، وشراء النقاط اختياري تماماً."),
        ("كيف أثبّت التطبيق؟","التطبيق غير متوفر على Google Play حالياً. حمّل ملف APK ثم افتحه ووافق على السماح بالتثبيت من هذا المصدر. قد يظهر تحذير من Google Play Protect، وهذا طبيعي للتطبيقات من خارج المتجر."),
        ("هل يعمل على الآيفون؟","لا. التطبيق لأجهزة أندرويد فقط حالياً."),
        ("كم الحد الأدنى للسحب؟","20$، وبحد أقصى سحب واحد كل 24 ساعة."),
        ("ماذا تفعلون ببياناتي؟","نحفظ حساب Google الذي سجّلت به وتقدّمك في اللعبة، ولا نبيع بياناتك ولا نؤجّرها لأي طرف. التطبيق غير موجّه لمن هم دون 18 سنة. التفاصيل في سياسة الخصوصية.")],
  final="جاهز تبدأ؟", store="المتجر", privacy="سياسة الخصوصية", terms="شروط الاستخدام", contact="تواصل معنا", rights="جميع الحقوق محفوظة."),
 "tr": dict(code="tr", dir="ltr", path="/tr/", locale="tr_TR", name="Türkçe",
  title="Cratelo – Android için depo yönetimi oyunu",
  desc="Ücretsiz Android oyunu: görevlerle puan kazan, işçi kirala, deponu çalıştır ve bakiyeni USDT, BTC, ETH veya Sham Cash ile çek.",
  skip="İçeriğe geç", h1="Oyunu açmasan da deponun işçileri çalışır",
  sub="Cratelo, Android için ücretsiz bir depo yönetimi oyunudur. Görev ve reklamlarla puan kazanır, puanlarla işçi kiralarsın; işçiler dolar değerinde bakiye üretir. Alt limite ulaşınca bakiyeni çekebilirsin.",
  cta1="Uygulamayı indir (APK)", cta2="ApkPure'dan indir", small="Ücretsiz. Yalnızca Android. 18 yaş ve üzeri için.",
  how="Nasıl oynanır",
  steps=[("Puan kazan","Günlük görevleri tamamla, reklam izle ya da oyun içindeki tek bir düğmeyle ortak firmaların tekliflerini dene."),
         ("İşçi kirala","Günlük, haftalık veya aylık işçi. Uygulama kapalıyken bile dolar değerinde bakiye üretir."),
         ("Bakiyeni çek","Bakiyen 20$'a ulaşınca USDT, BTC, ETH veya Sham Cash ile çekebilirsin.")],
  pay="Bakiye ve çekim",
  pay_text="Bakiye dolar olarak hesaplanır; aynı değerle USDT, BTC veya ETH olarak görüntüleyebilirsin. Asgari çekim 20$, 24 saatte bir çekim hakkı vardır. Çekim talepleri transferden önce elle incelenir.",
  chips=["USDT (TRC20, BEP20)","BTC","ETH","Sham Cash"],
  warn="Uyarı: Bakiye, reklam ortaklarının görev ve tekliflerinden gelir; kazanç garantisi yoktur. Tekliflerin bulunması ülkeye ve zamana göre değişir.",
  faq="Sık sorulanlar",
  faqs=[("Cratelo ücretsiz mi?","Evet. İndirmek ve oynamak ücretsizdir; puan satın almak tamamen isteğe bağlıdır."),
        ("Nasıl kurarım?","Uygulama şu an Google Play'de yok. APK dosyasını indirip aç ve bu kaynaktan kuruluma izin ver. Google Play Protect uyarısı görebilirsin; mağaza dışı uygulamalarda bu normaldir."),
        ("iPhone'da çalışır mı?","Hayır. Şimdilik yalnızca Android cihazlar için."),
        ("Asgari çekim tutarı nedir?","20$; ve 24 saatte en fazla bir çekim."),
        ("Verilerim ne oluyor?","Giriş yaptığın Google hesabını ve oyun ilerlemeni saklarız; verilerini satmayız veya kiralamayız. Uygulama 18 yaş altına yönelik değildir. Ayrıntılar gizlilik politikasında.")],
  final="Başlamaya hazır mısın?", store="Mağaza", privacy="Gizlilik politikası", terms="Kullanım koşulları", contact="İletişim", rights="Tüm hakları saklıdır."),
 "en": dict(code="en", dir="ltr", path="/en/", locale="en_US", name="English",
  title="Cratelo – Idle warehouse game for Android",
  desc="Free Android game: earn points from tasks, hire workers to run your warehouse, and withdraw your balance in USDT, BTC, ETH or Sham Cash.",
  skip="Skip to content", h1="Your warehouse keeps working while the game is closed",
  sub="Cratelo is a free warehouse management game for Android. Earn points from tasks and ads, spend them on workers who produce a balance valued in dollars, and withdraw it once you reach the minimum.",
  cta1="Download the app (APK)", cta2="Get it on ApkPure", small="Free. Android only. For ages 18 and over.",
  how="How to play",
  steps=[("Earn points","Finish daily tasks, watch ads, or try partner offers from a single button inside the game."),
         ("Hire workers","Daily, weekly or monthly workers. They produce a dollar-valued balance even when the app is closed."),
         ("Withdraw","Once your balance reaches $20 you can withdraw in USDT, BTC, ETH or via Sham Cash.")],
  pay="Balance and withdrawals",
  pay_text="Your balance is counted in dollars and can be shown as USDT, BTC or ETH at the same value. The minimum withdrawal is $20, one withdrawal per 24 hours. Withdrawal requests are reviewed manually before transfer.",
  chips=["USDT (TRC20, BEP20)","BTC","ETH","Sham Cash"],
  warn="Please note: the balance comes from tasks and offers by advertising partners. Earnings are not guaranteed, and the availability of offers varies by country and over time.",
  faq="FAQ",
  faqs=[("Is Cratelo free?","Yes. Downloading and playing are free, and buying points is entirely optional."),
        ("How do I install it?","The app isn't on Google Play right now. Download the APK file, open it, and allow installation from this source. You may see a Google Play Protect warning, which is normal for apps from outside the store."),
        ("Does it work on iPhone?","No. For now it is only for Android devices."),
        ("What is the minimum withdrawal?","$20, with at most one withdrawal per 24 hours."),
        ("What do you do with my data?","We store the Google account you sign in with and your game progress. We don't sell or rent your data to anyone. The app is not intended for people under 18. Details are in the privacy policy.")],
  final="Ready to start?", store="Store", privacy="Privacy policy", terms="Terms of use", contact="Contact", rights="All rights reserved."),
}
ORDER = ["ar", "tr", "en"]

CSS = r"""
:root{
  --teal:#17564A; --teal-d:#0F3B33; --tape:#F4C21F; --ink:#10211C; --paper:#F3F5EE; --steel:#9BB5AB; --line:#C9D4CC; --muted:#4A5E57; --panel:#FFFFFF;
  --f-stencil:"Big Shoulders Stencil Display","Big Shoulders Display",Impact,"Arial Narrow",sans-serif;
  --f-head:"Reem Kufi","Big Shoulders Display","Segoe UI",Tahoma,sans-serif;
  --f-body:"IBM Plex Sans Arabic","IBM Plex Sans","Segoe UI",Tahoma,Arial,sans-serif;
}
@media (prefers-color-scheme: dark){
  :root{ --paper:#0E1B17; --panel:#16302A; --ink:#EAF0EC; --line:#2A4A42; --muted:#A8BDB5; --steel:#6E9387; }
}
html[lang="tr"],html[lang="en"]{ --f-head:"Big Shoulders Display","Segoe UI",Arial,sans-serif; --f-body:"IBM Plex Sans","Segoe UI",Arial,sans-serif; }
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--f-body);font-size:17px;line-height:1.75}
a{color:inherit}
:focus-visible{outline:3px solid var(--tape);outline-offset:3px;border-radius:4px}
.skip{position:absolute;inset-inline-start:12px;top:-60px;background:var(--tape);color:#10211C;padding:8px 14px;font-weight:600;z-index:10}
.skip:focus{top:12px}
.wrap{width:min(1080px,100% - 40px);margin-inline:auto}

/* header */
.top{background:var(--teal-d);color:#F3F5EE}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:12px}
.brand{font-family:var(--f-stencil);font-weight:800;font-size:1.55rem;letter-spacing:.12em;text-decoration:none;direction:ltr}
.langs{display:flex;gap:6px;margin:0;padding:0;list-style:none}
.langs a{display:block;padding:4px 12px;border:1.5px solid #5E8A7E;border-radius:999px;text-decoration:none;font-size:.9rem}
.langs a[aria-current="page"]{background:var(--tape);color:#10211C;border-color:var(--tape);font-weight:600}

/* hero: باب حاوية بحبال مضلّعة */
.door{position:relative;background:var(--teal);color:#F3F5EE;overflow:hidden;
  background-image:repeating-linear-gradient(90deg,rgba(0,0,0,.16) 0 3px,rgba(0,0,0,0) 3px 26px)}
.door::before,.door::after{content:"";display:block;height:14px;
  background:repeating-linear-gradient(-45deg,var(--tape) 0 16px,#10211C 16px 32px)}
.door .in{padding-block:clamp(36px,8vw,84px) clamp(40px,8vw,88px)}
.mark{font-family:var(--f-stencil);font-weight:800;font-size:clamp(3.4rem,19vw,10.5rem);line-height:.9;letter-spacing:.04em;margin:0 0 clamp(20px,4vw,40px);direction:ltr;text-align:start;color:#F3F5EE}
html[dir="rtl"] .mark{text-align:end}
.tag{background:var(--paper);color:var(--ink);max-width:640px;padding:clamp(20px,4vw,34px);border:2px solid #10211C;box-shadow:8px 8px 0 #10211C;transform:rotate(-1deg);margin-inline-end:auto}
html[dir="rtl"] .tag{transform:rotate(1deg)}
.tag h1{font-family:var(--f-head);font-weight:700;font-size:clamp(1.55rem,4.6vw,2.35rem);line-height:1.25;margin:0 0 12px}
.tag p{margin:0 0 20px;color:var(--ink)}
.btns{display:flex;flex-wrap:wrap;gap:12px}
.btn{display:inline-block;padding:13px 22px;border:2px solid #10211C;font-weight:600;text-decoration:none;font-size:1rem;line-height:1.3}
.btn.main{background:var(--tape);color:#10211C;box-shadow:4px 4px 0 #10211C}
.btn.main:hover{transform:translate(-1px,-1px);box-shadow:5px 5px 0 #10211C}
.btn.main:active{transform:translate(3px,3px);box-shadow:1px 1px 0 #10211C}
.btn.alt{background:transparent;color:var(--ink);border-color:var(--ink)}
.btn.alt:hover{background:var(--ink);color:var(--paper)}
.small{margin:16px 0 0;font-size:.9rem;color:var(--muted)}

/* sections */
section{padding-block:clamp(36px,6vw,64px)}
h2{font-family:var(--f-head);font-weight:700;font-size:clamp(1.5rem,4vw,2rem);line-height:1.25;margin:0 0 24px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);margin:0;padding:0;list-style:none;border:2px solid var(--ink)}
.steps li{padding:22px 20px;border-inline-start:2px dashed var(--steel)}
.steps li:first-child{border-inline-start:0}
.steps .n{font-family:var(--f-stencil);font-weight:800;font-size:3.2rem;line-height:1;color:var(--teal);direction:ltr}
@media (prefers-color-scheme: dark){ .steps .n{color:var(--tape)} }
.steps h3{font-family:var(--f-head);font-size:1.2rem;margin:8px 0 6px}
.steps p{margin:0;color:var(--muted)}
.pay{background:var(--panel);border:2px solid var(--ink);padding:clamp(20px,4vw,32px)}
.pay p{margin:0 0 16px;max-width:68ch}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 20px;padding:0;list-style:none}
.chips li{border:2px solid var(--teal);color:var(--teal);padding:3px 14px;font-weight:600;direction:ltr}
@media (prefers-color-scheme: dark){ .chips li{border-color:var(--tape);color:var(--tape)} }
.warn{margin:0;padding:12px 16px;border-inline-start:6px solid var(--tape);background:rgba(244,194,31,.16);font-size:.95rem}
details{border-bottom:2px solid var(--line)}
summary{cursor:pointer;padding:16px 4px;font-weight:600;font-size:1.05rem;list-style:none;display:flex;justify-content:space-between;gap:12px}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";font-family:var(--f-stencil);font-size:1.6rem;line-height:1;flex:none}
details[open] summary::after{content:"–"}
details p{margin:0 4px 18px;max-width:68ch;color:var(--muted)}
.final{background:var(--teal);color:#F3F5EE;text-align:center}
.final::before,.final::after{content:"";display:block;height:14px;background:repeating-linear-gradient(-45deg,var(--tape) 0 16px,#10211C 16px 32px)}
.final .in{padding-block:clamp(32px,6vw,56px)}
.final h2{margin-bottom:18px}
.final .btns{justify-content:center}
.final .btn.alt{color:#F3F5EE;border-color:#F3F5EE}
footer{background:var(--teal-d);color:#D6E2DC;padding-block:26px;font-size:.92rem}
footer .wrap{display:flex;flex-wrap:wrap;gap:10px 22px;justify-content:space-between;align-items:center}
footer ul{display:flex;flex-wrap:wrap;gap:8px 20px;margin:0;padding:0;list-style:none}
footer a{text-underline-offset:3px}
@media (max-width:760px){
  .steps{grid-template-columns:1fr}
  .steps li{border-inline-start:0;border-top:2px dashed var(--steel)}
  .steps li:first-child{border-top:0}
  .tag{box-shadow:5px 5px 0 #10211C}
}
@media (prefers-reduced-motion:no-preference){
  .tag{animation:drop .7s cubic-bezier(.2,.9,.3,1.2) both}
  @keyframes drop{from{opacity:0;transform:translateY(-26px) rotate(-5deg)}}
}
"""

def esc(s): return html.escape(s, quote=True)

def head(L):
    t = LANGS[L]
    url = BASE + t["path"]
    alt = "".join(f'<link rel="alternate" hreflang="{c}" href="{BASE}{LANGS[c]["path"]}">\n' for c in ORDER)
    alt += f'<link rel="alternate" hreflang="x-default" href="{BASE}/">\n'
    other = "".join(f'<meta property="og:locale:alternate" content="{LANGS[c]["locale"]}">\n' for c in ORDER if c != L)
    ld = {"@context": "https://schema.org", "@type": "SoftwareApplication", "name": "Cratelo",
          "operatingSystem": "Android", "applicationCategory": "GameApplication", "url": url,
          "description": t["desc"], "inLanguage": t["code"], "image": BASE + "/og.png", "downloadUrl": DL,
          "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
          "contentRating": "18+"}
    return f'''<!DOCTYPE html>
<html lang="{t["code"]}" dir="{t["dir"]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(t["title"])}</title>
<meta name="description" content="{esc(t["desc"])}">
<link rel="canonical" href="{url}">
{alt}<meta name="theme-color" content="#0F3B33">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Cratelo">
<meta property="og:title" content="{esc(t["title"])}">
<meta property="og:description" content="{esc(t["desc"])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Cratelo">
<meta property="og:locale" content="{t["locale"]}">
{other}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(t["title"])}">
<meta name="twitter:description" content="{esc(t["desc"])}">
<meta name="twitter:image" content="{BASE}/og.png">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@800&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Reem+Kufi:wght@700&family=IBM+Plex+Sans+Arabic:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
'''

def page(L):
    t = LANGS[L]
    langs = "".join(
        f'<li><a href="{LANGS[c]["path"]}" hreflang="{c}" lang="{c}"{" aria-current=\"page\"" if c == L else ""}>{esc(LANGS[c]["name"])}</a></li>' for c in ORDER)
    steps = "".join(f'<li><div class="n" aria-hidden="true">{i+1}</div><h3>{esc(h)}</h3><p>{esc(p)}</p></li>' for i, (h, p) in enumerate(t["steps"]))
    chips = "".join(f"<li>{esc(c)}</li>" for c in t["chips"])
    faqs = "".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in t["faqs"])
    return head(L) + f'''<body>
<a class="skip" href="#main">{esc(t["skip"])}</a>
<header class="top"><div class="wrap">
  <a class="brand" href="{t["path"]}" aria-label="Cratelo">CRATELO</a>
  <nav aria-label="Languages"><ul class="langs">{langs}</ul></nav>
</div></header>
<main id="main">
  <div class="door"><div class="wrap in">
    <p class="mark" aria-hidden="true">CRATELO</p>
    <div class="tag">
      <h1>{esc(t["h1"])}</h1>
      <p>{esc(t["sub"])}</p>
      <div class="btns">
        <a class="btn main" href="{DL}" rel="noopener">{esc(t["cta1"])}</a>
        <a class="btn alt" href="{APKPURE}" rel="noopener">{esc(t["cta2"])}</a>
      </div>
      <p class="small">{esc(t["small"])}</p>
    </div>
  </div></div>
  <section><div class="wrap">
    <h2>{esc(t["how"])}</h2>
    <ol class="steps">{steps}</ol>
  </div></section>
  <section><div class="wrap">
    <div class="pay">
      <h2>{esc(t["pay"])}</h2>
      <p>{esc(t["pay_text"])}</p>
      <ul class="chips">{chips}</ul>
      <p class="warn">{esc(t["warn"])}</p>
    </div>
  </div></section>
  <section><div class="wrap">
    <h2>{esc(t["faq"])}</h2>
    {faqs}
  </div></section>
  <div class="final"><div class="wrap in">
    <h2>{esc(t["final"])}</h2>
    <div class="btns">
      <a class="btn main" href="{DL}" rel="noopener">{esc(t["cta1"])}</a>
      <a class="btn alt" href="{APKPURE}" rel="noopener">{esc(t["cta2"])}</a>
    </div>
  </div></div>
</main>
<footer><div class="wrap">
  <ul>
    <li><a href="{SHOP}" rel="noopener">{esc(t["store"])}</a></li>
    <li><a href="{PRIVACY}" rel="noopener">{esc(t["privacy"])}</a></li>
    <li><a href="{TERMS}" rel="noopener">{esc(t["terms"])}</a></li>
    <li><a href="mailto:{MAIL}">{esc(t["contact"])}: {MAIL}</a></li>
  </ul>
  <span>© 2026 Cratelo. {esc(t["rights"])}</span>
</div></footer>
</body>
</html>
'''

def write(path, data, mode="w"):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, mode, **({} if "b" in mode else {"encoding": "utf-8"})) as f: f.write(data)

def make_assets():
    # أيقونة: صندوق خشبي (أصفر) على خلفية حاوية
    def icon(size):
        im = Image.new("RGB", (size, size), TEAL); d = ImageDraw.Draw(im); s = size / 512
        for x in range(0, size, int(26 * s) or 1): d.line((x, 0, x, size), fill=TEAL_D, width=max(1, int(3 * s)))
        L, T, R, B = [int(v * s) for v in (96, 120, 416, 400)]
        d.rectangle((L, T, R, B), fill=YELLOW, outline=INK, width=max(2, int(16 * s)))
        h = (B - T) // 3
        for k in (1, 2): d.line((L, T + h * k, R, T + h * k), fill=INK, width=max(2, int(12 * s)))
        d.line((L + int(16 * s), B - int(16 * s), R - int(16 * s), T + int(16 * s)), fill=INK, width=max(2, int(16 * s)))
        return im
    icon(512).save(os.path.join(ROOT, "icon-512.png"))
    icon(192).save(os.path.join(ROOT, "icon-192.png"))
    icon(180).save(os.path.join(ROOT, "apple-touch-icon.png"))
    icon(64).save(os.path.join(ROOT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    # صورة المشاركة 1200x630
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), TEAL); d = ImageDraw.Draw(im)
    for x in range(0, W, 26): d.line((x, 0, x, H), fill=TEAL_D, width=3)
    def tape(y0):
        for i in range(-2, W // 32 + 4):
            x = i * 32
            d.polygon([(x, y0 + 28), (x + 16, y0 + 28), (x + 44, y0), (x + 28, y0)], fill=YELLOW)
        d.rectangle((0, y0, W, y0 + 2), fill=INK); d.rectangle((0, y0 + 26, W, y0 + 28), fill=INK)
    tape(0); tape(H - 28)
    big = ImageFont.truetype("/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf", 210)
    sm = ImageFont.truetype("/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf", 44)
    text = "CRATELO"; tw = d.textlength(text, font=big)
    x0, y0 = (W - tw) / 2, 140
    d.text((x0, y0), text, font=big, fill=PAPER)
    bb = d.textbbox((x0, y0), text, font=big)
    cut = (bb[1] + bb[3]) // 2 + 6
    d.rectangle((0, cut, W, cut + 9), fill=TEAL)            # شقّ الاستنسل
    for x in range(0, W, 26): d.line((x, cut, x, cut + 9), fill=TEAL_D, width=3)
    sub = "Idle warehouse game for Android"; sw = d.textlength(sub, font=sm)
    d.text(((W - sw) / 2, 430), sub, font=sm, fill=YELLOW)
    im.save(os.path.join(ROOT, "og.png"), optimize=True)

def main():
    os.makedirs(ROOT, exist_ok=True)
    for L in ORDER:
        write("index.html" if L == "ar" else f"{L}/index.html", page(L))
    urls = "".join(
        f'  <url>\n    <loc>{BASE}{LANGS[L]["path"]}</loc>\n    <lastmod>{UPDATED}</lastmod>\n' +
        "".join(f'    <xhtml:link rel="alternate" hreflang="{c}" href="{BASE}{LANGS[c]["path"]}"/>\n' for c in ORDER) +
        f'    <xhtml:link rel="alternate" hreflang="x-default" href="{BASE}/"/>\n  </url>\n' for L in ORDER)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n{urls}</urlset>\n')
    write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n")
    write("_headers", "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n\n/*.png\n  Cache-Control: public, max-age=604800\n\n/favicon.ico\n  Cache-Control: public, max-age=604800\n")
    make_assets()
    print("site generated:", sorted(os.listdir(ROOT)))

if __name__ == "__main__":
    main()
