# يولّد صفحة Yardova (3 لغات + ملفات البحث + الأيقونات) داخل مجلد site/
# التشغيل: python3 tools/site_build.py
import html, json, os, re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..", "site")
BASE = "https://yardova.ly-ad.de"
DL = "https://postback.ly-ad.de/dl"
APKPURE = "https://apkpure.com/p/com.warehousetycoon.app"
SHOP = "https://lyadsxsxscom-source.github.io/warehouse-tycoon-app-2/"
PRIVACY = SHOP + "privacy.html"
TERMS = SHOP + "terms.html"
MAIL = "admin@ly-ad.de"
UPDATED = "2026-10-07"
CERT_SHA256 = "D3:3E:3B:80:BE:09:96:1F:EA:26:BE:D0:88:2D:C5:44:3C:98:F8:E9:D0:77:12:B9:29:40:76:2C:B3:41:04:81"
REPO = "https://github.com/lyadsxsxscom-source/warehouse-tycoon-app-2"
RELEASE = REPO + "/releases/tag/latest"
API_RELEASE = "https://api.github.com/repos/lyadsxsxscom-source/warehouse-tycoon-app-2/releases/tags/latest"

TEAL, TEAL_D, YELLOW, INK, PAPER = (0x17, 0x56, 0x4A), (0x0F, 0x3B, 0x33), (0xF4, 0xC2, 0x1F), (0x10, 0x21, 0x1C), (0xF3, 0xF5, 0xEE)

LANGS = {
 "ar": dict(code="ar", dir="rtl", path="/", locale="ar_AR", name="العربية",
  title="Yardova – لعبة إدارة مستودع للأندرويد",
  desc="لعبة مجانية للأندرويد: اكسب نقاطاً من المهام، استأجر عمّالاً يشغّلون مستودعك، واسحب رصيدك بـ USDT أو BTC أو ETH أو شام كاش.",
  skip="تخطّي إلى المحتوى", h1="مستودعك يشتغل حتى لو ما فتحت اللعبة",
  sub="Yardova لعبة إدارة مستودع مجانية للأندرويد. تكسب نقاطاً من المهام والإعلانات، وتستأجر بها عمّالاً ينتجون رصيداً بالدولار. وعندما يصل رصيدك إلى الحد الأدنى تسحبه.",
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
  faqs=[("هل Yardova مجانية؟","نعم. التحميل واللعب مجانيان، وشراء النقاط اختياري تماماً."),
        ("كيف أثبّت التطبيق؟","التطبيق غير متوفر على Google Play حالياً. حمّل ملف APK ثم افتحه ووافق على السماح بالتثبيت من هذا المصدر. قد يظهر تحذير من Google Play Protect، وهذا طبيعي للتطبيقات من خارج المتجر."),
        ("هل يعمل على الآيفون؟","لا. التطبيق لأجهزة أندرويد فقط حالياً."),
        ("كم الحد الأدنى للسحب؟","20$، وبحد أقصى سحب واحد كل 24 ساعة."),
        ("ماذا تفعلون ببياناتي؟","نحفظ حساب Google الذي سجّلت به وتقدّمك في اللعبة، ولا نبيع بياناتك ولا نؤجّرها لأي طرف. التطبيق غير موجّه لمن هم دون 18 سنة. التفاصيل في سياسة الخصوصية.")],
  final="جاهز تبدأ؟", store="المتجر", privacy="سياسة الخصوصية", terms="شروط الاستخدام", contact="تواصل معنا", rights="جميع الحقوق محفوظة."),
 "tr": dict(code="tr", dir="ltr", path="/tr/", locale="tr_TR", name="Türkçe",
  title="Yardova – Android için depo yönetimi oyunu",
  desc="Ücretsiz Android oyunu: görevlerle puan kazan, işçi kirala, deponu çalıştır ve bakiyeni USDT, BTC, ETH veya Sham Cash ile çek.",
  skip="İçeriğe geç", h1="Oyunu açmasan da deponun işçileri çalışır",
  sub="Yardova, Android için ücretsiz bir depo yönetimi oyunudur. Görev ve reklamlarla puan kazanır, puanlarla işçi kiralarsın; işçiler dolar değerinde bakiye üretir. Alt limite ulaşınca bakiyeni çekebilirsin.",
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
  faqs=[("Yardova ücretsiz mi?","Evet. İndirmek ve oynamak ücretsizdir; puan satın almak tamamen isteğe bağlıdır."),
        ("Nasıl kurarım?","Uygulama şu an Google Play'de yok. APK dosyasını indirip aç ve bu kaynaktan kuruluma izin ver. Google Play Protect uyarısı görebilirsin; mağaza dışı uygulamalarda bu normaldir."),
        ("iPhone'da çalışır mı?","Hayır. Şimdilik yalnızca Android cihazlar için."),
        ("Asgari çekim tutarı nedir?","20$; ve 24 saatte en fazla bir çekim."),
        ("Verilerim ne oluyor?","Giriş yaptığın Google hesabını ve oyun ilerlemeni saklarız; verilerini satmayız veya kiralamayız. Uygulama 18 yaş altına yönelik değildir. Ayrıntılar gizlilik politikasında.")],
  final="Başlamaya hazır mısın?", store="Mağaza", privacy="Gizlilik politikası", terms="Kullanım koşulları", contact="İletişim", rights="Tüm hakları saklıdır."),
 "en": dict(code="en", dir="ltr", path="/en/", locale="en_US", name="English",
  title="Yardova – Idle warehouse game for Android",
  desc="Free Android game: earn points from tasks, hire workers to run your warehouse, and withdraw your balance in USDT, BTC, ETH or Sham Cash.",
  skip="Skip to content", h1="Your warehouse keeps working while the game is closed",
  sub="Yardova is a free warehouse management game for Android. Earn points from tasks and ads, spend them on workers who produce a balance valued in dollars, and withdraw it once you reach the minimum.",
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
  faqs=[("Is Yardova free?","Yes. Downloading and playing are free, and buying points is entirely optional."),
        ("How do I install it?","The app isn't on Google Play right now. Download the APK file, open it, and allow installation from this source. You may see a Google Play Protect warning, which is normal for apps from outside the store."),
        ("Does it work on iPhone?","No. For now it is only for Android devices."),
        ("What is the minimum withdrawal?","$20, with at most one withdrawal per 24 hours."),
        ("What do you do with my data?","We store the Google account you sign in with and your game progress. We don't sell or rent your data to anyone. The app is not intended for people under 18. Details are in the privacy policy.")],
  final="Ready to start?", store="Store", privacy="Privacy policy", terms="Terms of use", contact="Contact", rights="All rights reserved."),
}
ORDER = ["ar", "tr", "en"]

# ===== نصوص الصفحات الجديدة (من نحن + التحقق من الملف) =====
LANGS["ar"].update(about="من نحن", verify="التحقق من الملف", verify_hint="تحقق من الملف قبل التثبيت",
  about_title="من نحن – Yardova", about_desc="من يقف وراء Yardova، وكيف تعمل اللعبة مالياً، وكيف تُسحب أرصدة اللاعبين، وكيف تتواصل معنا.", about_h1="من نحن",
  verify_title="التحقق من ملف Yardova قبل التثبيت", verify_desc="خطوات بسيطة تتأكد فيها أنك حمّلت ملف Yardova الأصلي: مصادر التحميل، وبصمة الملف SHA-256، والفحص على VirusTotal، وأذونات التطبيق.", verify_h1="تحقق من الملف قبل ما تثبّته")
LANGS["tr"].update(about="Hakkımızda", verify="Dosya doğrulama", verify_hint="Kurmadan önce dosyayı doğrula",
  about_title="Hakkımızda – Yardova", about_desc="Yardova'nın arkasında kim var, oyun nasıl gelir elde ediyor, oyuncu bakiyeleri nasıl çekiliyor ve bize nasıl ulaşırsın.", about_h1="Hakkımızda",
  verify_title="Yardova dosyasını kurmadan önce doğrula", verify_desc="Orijinal Yardova dosyasını indirdiğinden emin olmak için basit adımlar: indirme kaynakları, SHA-256 parmak izi, VirusTotal taraması ve uygulama izinleri.", verify_h1="Kurmadan önce dosyayı doğrula")
LANGS["en"].update(about="About", verify="Verify the file", verify_hint="Verify the file before installing",
  about_title="About – Yardova", about_desc="Who is behind Yardova, how the game makes money, how player balances are withdrawn, and how to reach us.", about_h1="About",
  verify_title="Verify the Yardova file before installing", verify_desc="Simple steps to make sure you downloaded the genuine Yardova file: download sources, the SHA-256 fingerprint, a VirusTotal scan and the app's permissions.", verify_h1="Verify the file before you install it")

ABOUT = {
"ar": f"""
<h2>من وراء Yardova؟</h2>
<p>Yardova مشروع مستقل يطوّره شخص واحد، وما وراءه شركة كبيرة. ولهذا نشرنا الكود المصدري للتطبيق والسيرفر علناً حتى يقدر أي شخص يراجعه: <a href="{REPO}" rel="noopener">الكود المصدري على GitHub</a>.</p>
<p>للتواصل أو للإبلاغ عن مشكلة: <a href="mailto:{MAIL}">{MAIL}</a></p>
<h2>كيف تكسب اللعبة؟</h2>
<p>اللعبة مجانية. يأتي دخلنا من شركاء إعلانات وعروض (إعلانات الفيديو وجدران المهام). جزء من هذا الدخل يرجع للاعبين على شكل رصيد قابل للسحب، والباقي يغطي تشغيل اللعبة.</p>
<p class="note">لا يوجد أي ضمان للربح. توفّر العروض يختلف من بلد لآخر ومن وقت لآخر، وقد يتوقف أي شريك فجأة.</p>
<h2>السحب</h2>
<ul>
<li>الحد الأدنى 20$، وسحب واحد كل 24 ساعة.</li>
<li>كل طلب يُراجَع يدوياً قبل التحويل، عادةً خلال 24 ساعة.</li>
<li>طرق السحب: <bdi dir="ltr">USDT (TRC20, BEP20)</bdi>، <bdi dir="ltr">BTC</bdi>، <bdi dir="ltr">ETH</bdi>، وشام كاش.</li>
<li>إذا رُفض طلبك، يرجع المبلغ إلى رصيدك في التطبيق.</li>
</ul>
<h2>خصوصيتك</h2>
<p>لا نبيع بياناتك ولا نؤجّرها. نخزّن فقط حساب Google الذي سجّلت به وتقدّمك في اللعبة. التفاصيل في <a href="{PRIVACY}" rel="noopener">سياسة الخصوصية</a> و<a href="{TERMS}" rel="noopener">شروط الاستخدام</a>.</p>
<h2>ما يجب أن تعرفه</h2>
<ul>
<li>اللعبة للبالغين 18 سنة فأكثر.</li>
<li>غير متوفرة على Google Play حالياً، وتُثبَّت من ملف APK. لذلك جهّزنا <a href="%%VERIFY%%">دليل التحقق من الملف</a>.</li>
<li>غير متوفرة على الآيفون.</li>
</ul>""",
"tr": f"""
<h2>Yardova'nın arkasında kim var?</h2>
<p>Yardova, tek bir kişi tarafından geliştirilen bağımsız bir projedir; arkasında büyük bir şirket yoktur. Bu yüzden uygulamanın ve sunucunun kaynak kodunu herkes inceleyebilsin diye açık yayınladık: <a href="{REPO}" rel="noopener">GitHub'daki kaynak kod</a>.</p>
<p>İletişim veya sorun bildirmek için: <a href="mailto:{MAIL}">{MAIL}</a></p>
<h2>Oyun nasıl gelir elde ediyor?</h2>
<p>Oyun ücretsizdir. Gelirimiz reklam ve teklif ortaklarından (video reklamlar ve görev duvarları) gelir. Bu gelirin bir kısmı oyunculara çekilebilir bakiye olarak döner, kalanı oyunun işletme giderlerini karşılar.</p>
<p class="note">Kazanç garantisi yoktur. Tekliflerin bulunması ülkeye ve zamana göre değişir; bir ortak aniden durabilir.</p>
<h2>Çekim</h2>
<ul>
<li>Asgari tutar 20$, 24 saatte en fazla bir çekim.</li>
<li>Her talep transferden önce elle incelenir, genellikle 24 saat içinde.</li>
<li>Yöntemler: USDT (TRC20 ve BEP20), BTC, ETH ve Sham Cash.</li>
<li>Bir talep reddedilirse tutar uygulamadaki bakiyene geri döner.</li>
</ul>
<h2>Gizliliğin</h2>
<p>Verilerini satmaz veya kiralamayız. Yalnızca giriş yaptığın Google hesabını ve oyun ilerlemeni saklarız. Ayrıntılar <a href="{PRIVACY}" rel="noopener">gizlilik politikası</a> ve <a href="{TERMS}" rel="noopener">kullanım koşulları</a> sayfalarında.</p>
<h2>Bilmen gerekenler</h2>
<ul>
<li>Oyun 18 yaş ve üzeri içindir.</li>
<li>Şu an Google Play'de yok, APK dosyasıyla kurulur. Bu yüzden bir <a href="%%VERIFY%%">dosya doğrulama rehberi</a> hazırladık.</li>
<li>iPhone için mevcut değil.</li>
</ul>""",
"en": f"""
<h2>Who is behind Yardova?</h2>
<p>Yardova is an independent project built by a single person; there is no large company behind it. That's why we published the source code of the app and the server openly, so anyone can review it: <a href="{REPO}" rel="noopener">source code on GitHub</a>.</p>
<p>To get in touch or report a problem: <a href="mailto:{MAIL}">{MAIL}</a></p>
<h2>How does the game make money?</h2>
<p>The game is free. Our income comes from advertising and offer partners (video ads and task walls). Part of that income returns to players as a withdrawable balance, and the rest covers the cost of running the game.</p>
<p class="note">Earnings are not guaranteed. The availability of offers varies by country and over time, and a partner can stop suddenly.</p>
<h2>Withdrawals</h2>
<ul>
<li>Minimum $20, and one withdrawal per 24 hours.</li>
<li>Every request is reviewed manually before transfer, usually within 24 hours.</li>
<li>Methods: USDT (TRC20 and BEP20), BTC, ETH and Sham Cash.</li>
<li>If a request is rejected, the amount returns to your balance in the app.</li>
</ul>
<h2>Your privacy</h2>
<p>We don't sell or rent your data. We only store the Google account you sign in with and your game progress. Details are in the <a href="{PRIVACY}" rel="noopener">privacy policy</a> and the <a href="{TERMS}" rel="noopener">terms of use</a>.</p>
<h2>Good to know</h2>
<ul>
<li>The game is for ages 18 and over.</li>
<li>It isn't on Google Play right now and is installed from an APK file. That's why we prepared a <a href="%%VERIFY%%">file verification guide</a>.</li>
<li>It isn't available on iPhone.</li>
</ul>""",
}

VERIFY = {
"ar": f"""
<p>لأن Yardova غير موجودة على Google Play حالياً، يجب أن تتأكد أنك تثبّت الملف الأصلي. هذه أربع خطوات تأخذ دقيقتين.</p>
<div class="step"><div class="n" aria-hidden="true">1</div><h2>حمّل من مصادرنا فقط</h2>
<ul>
<li>زر التحميل في هذا الموقع: <a href="{DL}" rel="noopener" dir="ltr">postback.ly-ad.de/dl</a></li>
<li><a href="{RELEASE}" rel="noopener">صفحة الإصدار على GitHub</a></li>
<li><a href="{APKPURE}" rel="noopener">صفحة التطبيق على ApkPure</a> (قد تتأخر عن آخر إصدار، فبصمتها قد تختلف)</li>
</ul>
<p>أي رابط آخر (قناة أو موقع أو شخص أرسل لك الملف) تعامل معه كغير موثوق.</p></div>
<div class="step"><div class="n" aria-hidden="true">2</div><h2>قارن بصمة الملف (SHA-256)</h2>
<p>هذه آخر نسخة منشورة على GitHub، وتُقرأ مباشرة من هناك:</p>
<div id="live" class="live" data-fail="تعذّر جلب البصمة الآن. افتح صفحة الإصدار على GitHub وانسخها من هناك." data-copied="تم النسخ ✓">
<dl><dt>التاريخ</dt><dd id="v-date">…</dd><dt>الحجم</dt><dd id="v-size">…</dd><dt>SHA-256</dt><dd><code id="v-hash" class="hash">…</code></dd></dl>
<button type="button" class="btn alt" id="v-copy">نسخ البصمة</button>
</div>
<p>لحساب بصمة الملف الذي حمّلته: على الجوال، نزّل تطبيقاً لحساب بصمة الملفات (ابحث عن "hash checker") واختر SHA-256 ثم اختر الملف. أو من Termux: <code>sha256sum yardova.apk</code>. يجب أن تتطابق القيمتان حرفاً بحرف. إذا اختلفت ولو بحرف واحد، لا تثبّت الملف.</p>
<p class="note">البصمة تتغير مع كل تحديث للتطبيق.</p>
<h3>شهادة التوقيع</h3>
<p>الملف موقّع بمفتاحنا الخاص، وبصمة الشهادة (SHA-256) ثابتة ولا تتغير مع التحديثات:</p>
<code class="hash">{CERT_SHA256}</code>
<p>للتحقق منها من الكمبيوتر: <code>apksigner verify --print-certs yardova.apk</code> أو <code>keytool -printcert -jarfile yardova.apk</code>. سيظهر اسم صاحب الشهادة "Warehouse Tycoon"، وهو الاسم السابق للتطبيق. وبعد التثبيت، يرفض أندرويد أي تحديث موقّع بشهادة مختلفة.</p></div>
<div class="step"><div class="n" aria-hidden="true">3</div><h2>افحصه على VirusTotal</h2>
<p><a id="vt" href="https://www.virustotal.com/" rel="noopener">ابحث عن البصمة على VirusTotal</a>. إذا لم تظهر نتيجة، افتح الموقع وارفع الملف وانتظر الفحص.</p>
<p>قد تظهر تحذيرات من محرك أو اثنين، فهذه شائعة مع التطبيقات من خارج المتجر. المهم ألا تظهر عشرات التحذيرات.</p></div>
<div class="step"><div class="n" aria-hidden="true">4</div><h2>راجع الأذونات</h2>
<p>التطبيق يطلب فقط:</p>
<ul>
<li>الإنترنت وحالة الشبكة (ليعمل أونلاين)</li>
<li>الإشعارات (تنبيه عند انتهاء عاملك أو تأكيد سحبك)</li>
<li>معرّف الإعلانات وخدمات الإعلانات (لشبكات الإعلانات داخل اللعبة)</li>
<li>أذونات تقنية تتبع مكتبات الإعلانات والإشعارات (التشغيل في الخلفية وإعادة جدولة الإشعارات بعد إعادة تشغيل الجهاز)</li>
</ul>
<p>ولا يطلب: الكاميرا ولا الميكروفون ولا الموقع ولا جهات الاتصال ولا الرسائل ولا الملفات.</p></div>
<h2>عن تحذير Play Protect</h2>
<p>قد يظهر تحذير مثل "تطبيق غير معروف". هذا لأن التطبيق من خارج المتجر، وليس بالضرورة لأن فيه فيروساً. اختر "مزيد من التفاصيل" ثم "تثبيت على أي حال" فقط إذا تطابقت البصمة.</p>
<p>إذا شككت في أي شيء، راسلنا قبل التثبيت: <a href="mailto:{MAIL}">{MAIL}</a></p>""",
"tr": f"""
<p>Yardova şu an Google Play'de olmadığı için, kurduğun dosyanın orijinal olduğundan emin olmalısın. İşte iki dakikanı alan dört adım.</p>
<div class="step"><div class="n" aria-hidden="true">1</div><h2>Yalnızca kaynaklarımızdan indir</h2>
<ul>
<li>Bu sitedeki indirme düğmesi (<a href="{DL}" rel="noopener">postback.ly-ad.de/dl</a>)</li>
<li><a href="{RELEASE}" rel="noopener">GitHub sürüm sayfası</a></li>
<li><a href="{APKPURE}" rel="noopener">ApkPure uygulama sayfası</a> (son sürümün gerisinde kalabilir, parmak izi farklı olabilir)</li>
</ul>
<p>Başka her bağlantıyı (bir kanal, bir site ya da dosyayı sana gönderen biri) güvenilmez say.</p></div>
<div class="step"><div class="n" aria-hidden="true">2</div><h2>Dosyanın parmak izini (SHA-256) karşılaştır</h2>
<p>Bu, GitHub'da yayımlanan son sürümdür ve doğrudan oradan okunur:</p>
<div id="live" class="live" data-fail="Parmak izi şu an alınamadı. GitHub sürüm sayfasını açıp oradan kopyala." data-copied="Kopyalandı ✓">
<dl><dt>Tarih</dt><dd id="v-date">…</dd><dt>Boyut</dt><dd id="v-size">…</dd><dt>SHA-256</dt><dd><code id="v-hash" class="hash">…</code></dd></dl>
<button type="button" class="btn alt" id="v-copy">Parmak izini kopyala</button>
</div>
<p>İndirdiğin dosyanın parmak izini hesaplamak için telefonda bir dosya parmak izi uygulaması kur ("hash checker" ara), SHA-256'yı seç ve dosyayı göster. Ya da Termux'ta: <code>sha256sum yardova.apk</code>. İki değer harfi harfine aynı olmalı. Bir harf bile farklıysa dosyayı kurma.</p>
<p class="note">Parmak izi uygulamanın her güncellemesinde değişir.</p>
<h3>İmza sertifikası</h3>
<p>Dosya kendi özel anahtarımızla imzalanır ve sertifika parmak izi (SHA-256) güncellemelerde değişmez:</p>
<code class="hash">{CERT_SHA256}</code>
<p>Bilgisayardan doğrulamak için: <code>apksigner verify --print-certs yardova.apk</code> veya <code>keytool -printcert -jarfile yardova.apk</code>. Sertifika sahibi adı "Warehouse Tycoon" görünür; bu uygulamanın eski adıdır. Kurulumdan sonra Android, farklı bir sertifikayla imzalanmış güncellemeleri reddeder.</p></div>
<div class="step"><div class="n" aria-hidden="true">3</div><h2>VirusTotal'da tara</h2>
<p><a id="vt" href="https://www.virustotal.com/" rel="noopener">Parmak izini VirusTotal'da ara</a>. Sonuç çıkmazsa siteyi açıp dosyayı yükle ve taramayı bekle.</p>
<p>Bir iki motordan uyarı gelebilir; mağaza dışı uygulamalarda bu yaygındır. Önemli olan onlarca uyarı çıkmamasıdır.</p></div>
<div class="step"><div class="n" aria-hidden="true">4</div><h2>İzinlere bak</h2>
<p>Uygulama yalnızca şunları ister:</p>
<ul>
<li>İnternet ve ağ durumu (çevrimiçi çalışmak için)</li>
<li>Bildirimler (işçin bittiğinde veya çekimin onaylandığında haber vermek için)</li>
<li>Reklam kimliği ve reklam hizmetleri (oyun içindeki reklam ağları için)</li>
<li>Reklam ve bildirim kütüphanelerine bağlı teknik izinler (arka planda çalışma ve cihaz yeniden başlayınca bildirimleri yeniden planlama)</li>
</ul>
<p>Kamera, mikrofon, konum, kişiler, mesajlar veya dosyalar istemez.</p></div>
<h2>Play Protect uyarısı hakkında</h2>
<p>"Bilinmeyen uygulama" gibi bir uyarı görebilirsin. Bunun nedeni uygulamanın mağaza dışından gelmesidir; mutlaka virüs olduğu anlamına gelmez. "Daha fazla ayrıntı" ve ardından "Yine de yükle" seçeneğini yalnızca parmak izi eşleştiyse kullan.</p>
<p>Herhangi bir şüphen varsa kurmadan önce bize yaz: <a href="mailto:{MAIL}">{MAIL}</a></p>""",
"en": f"""
<p>Because Yardova isn't on Google Play right now, you should make sure you're installing the genuine file. These are four steps that take two minutes.</p>
<div class="step"><div class="n" aria-hidden="true">1</div><h2>Download only from our sources</h2>
<ul>
<li>The download button on this site (<a href="{DL}" rel="noopener">postback.ly-ad.de/dl</a>)</li>
<li>The <a href="{RELEASE}" rel="noopener">release page on GitHub</a></li>
<li>The <a href="{APKPURE}" rel="noopener">app page on ApkPure</a> (it may lag behind the latest version, so its fingerprint can differ)</li>
</ul>
<p>Treat any other link (a channel, a site, or someone who sent you the file) as untrusted.</p></div>
<div class="step"><div class="n" aria-hidden="true">2</div><h2>Compare the file's fingerprint (SHA-256)</h2>
<p>This is the latest version published on GitHub, read directly from there:</p>
<div id="live" class="live" data-fail="Couldn't fetch the fingerprint right now. Open the GitHub release page and copy it from there." data-copied="Copied ✓">
<dl><dt>Date</dt><dd id="v-date">…</dd><dt>Size</dt><dd id="v-size">…</dd><dt>SHA-256</dt><dd><code id="v-hash" class="hash">…</code></dd></dl>
<button type="button" class="btn alt" id="v-copy">Copy fingerprint</button>
</div>
<p>To compute the fingerprint of the file you downloaded: on your phone, install a file-hash app (search "hash checker"), choose SHA-256 and pick the file. Or in Termux: <code>sha256sum yardova.apk</code>. The two values must match character for character. If they differ by even one character, don't install the file.</p>
<p class="note">The fingerprint changes with every app update.</p>
<h3>Signing certificate</h3>
<p>The file is signed with our own private key, and the certificate fingerprint (SHA-256) stays the same across updates:</p>
<code class="hash">{CERT_SHA256}</code>
<p>To check it from a computer: <code>apksigner verify --print-certs yardova.apk</code> or <code>keytool -printcert -jarfile yardova.apk</code>. The certificate owner shows as "Warehouse Tycoon", which is the app's previous name. After installation, Android rejects any update signed with a different certificate.</p></div>
<div class="step"><div class="n" aria-hidden="true">3</div><h2>Scan it on VirusTotal</h2>
<p><a id="vt" href="https://www.virustotal.com/" rel="noopener">Search the fingerprint on VirusTotal</a>. If nothing shows up, open the site, upload the file and wait for the scan.</p>
<p>One or two engines may flag it, which is common for apps from outside the store. What matters is that dozens of warnings don't appear.</p></div>
<div class="step"><div class="n" aria-hidden="true">4</div><h2>Review the permissions</h2>
<p>The app only asks for:</p>
<ul>
<li>Internet and network state (to work online)</li>
<li>Notifications (to tell you when your worker finishes or a withdrawal is confirmed)</li>
<li>Advertising ID and ad services (for the ad networks inside the game)</li>
<li>Technical permissions that belong to the ad and notification libraries (background operation and rescheduling notifications after a device restart)</li>
</ul>
<p>It does not ask for the camera, microphone, location, contacts, messages or files.</p></div>
<h2>About the Play Protect warning</h2>
<p>You may see a warning such as "unknown app". That's because the app comes from outside the store, not necessarily because it contains a virus. Choose "More details" and then "Install anyway" only if the fingerprint matched.</p>
<p>If you doubt anything, write to us before installing: <a href="mailto:{MAIL}">{MAIL}</a></p>""",
}

VERIFY_JS = r"""
(function(){
  var box=document.getElementById('live'); if(!box) return;
  var lang=document.documentElement.lang||'en';
  function fail(){ box.insertAdjacentHTML('beforeend','<p class="note">'+box.getAttribute('data-fail')+' <a href="__RELEASE__" rel="noopener">GitHub</a></p>'); }
  fetch('__API__',{headers:{Accept:'application/vnd.github+json'}}).then(function(r){ if(!r.ok) throw 0; return r.json(); }).then(function(d){
    var a=(d.assets||[]).filter(function(x){return x.name==='yardova.apk';})[0]; if(!a) throw 0;
    var h=String(a.digest||'').replace(/^sha256:/,''); if(!/^[0-9a-f]{64}$/.test(h)) throw 0;
    document.getElementById('v-hash').textContent=h;
    document.getElementById('v-size').textContent=(a.size/1e6).toFixed(1)+' MB ('+a.size.toLocaleString('en-US')+' bytes)';
    document.getElementById('v-date').textContent=new Date(a.updated_at).toLocaleDateString(lang==='ar'?'ar':lang==='tr'?'tr-TR':'en-GB',{year:'numeric',month:'long',day:'numeric'});
    document.getElementById('vt').href='https://www.virustotal.com/gui/file/'+h;
    var b=document.getElementById('v-copy'), t=b.textContent;
    b.addEventListener('click',function(){ (navigator.clipboard?navigator.clipboard.writeText(h):Promise.reject()).then(function(){ b.textContent=box.getAttribute('data-copied'); setTimeout(function(){b.textContent=t;},1800); }).catch(function(){}); });
  }).catch(function(){ ['v-hash','v-size','v-date'].forEach(function(i){ document.getElementById(i).textContent='-'; }); document.getElementById('v-copy').hidden=true; fail(); });
})();
"""


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
[hidden]{display:none!important}
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
@media (max-width:480px){
  .top .wrap{flex-wrap:wrap;row-gap:8px}
  .langs{flex-wrap:wrap;gap:5px}
  .langs a{padding:3px 10px;font-size:.85rem}
  .brand{font-size:1.35rem}
}
@media (max-width:760px){
  .steps{grid-template-columns:1fr}
  .steps li{border-inline-start:0;border-top:2px dashed var(--steel)}
  .steps li:first-child{border-top:0}
  .tag{box-shadow:5px 5px 0 #10211C}
}
/* صفحات داخلية (من نحن / التحقق) */
.pagehead{position:relative;background:var(--teal);color:#F3F5EE;background-image:repeating-linear-gradient(90deg,rgba(0,0,0,.16) 0 3px,rgba(0,0,0,0) 3px 26px)}
.pagehead::before,.pagehead::after{content:"";display:block;height:14px;background:repeating-linear-gradient(-45deg,var(--tape) 0 16px,#10211C 16px 32px)}
.pagehead h1{font-family:var(--f-head);font-weight:700;font-size:clamp(1.9rem,6vw,3rem);line-height:1.2;margin:0;padding-block:clamp(26px,5vw,44px)}
.prose{max-width:780px;padding-block:clamp(28px,5vw,48px)}
.prose h2{margin:34px 0 12px}
.prose h2:first-child{margin-top:0}
.prose p,.prose li{max-width:68ch}
.prose ul{padding-inline-start:1.3em;margin:0 0 16px}
.prose li{margin-bottom:6px}
.prose a{text-underline-offset:3px}
.note{margin:14px 0;padding:12px 16px;border-inline-start:6px solid var(--tape);background:rgba(244,194,31,.16);font-size:.95rem}
.step{position:relative;border:2px solid var(--ink);background:var(--panel);padding:20px clamp(16px,3vw,26px);margin:0 0 20px}
.step .n{font-family:var(--f-stencil);font-weight:800;font-size:2.8rem;line-height:1;color:var(--teal);direction:ltr}
.step h2{margin:6px 0 12px;font-size:1.3rem}
.step h3{font-family:var(--f-head);font-size:1.1rem;margin:22px 0 8px}
@media (prefers-color-scheme: dark){ .step .n{color:var(--tape)} }
.live dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0 0 14px}
.live dt{font-weight:600}
.live dd{margin:0;min-width:0}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em;direction:ltr;unicode-bidi:isolate}
.hash{display:block;background:rgba(127,127,127,.14);border:1px solid var(--line);padding:8px 10px;word-break:break-all;text-align:left}
@media (prefers-reduced-motion:no-preference){
  .tag{animation:drop .7s cubic-bezier(.2,.9,.3,1.2) both}
  @keyframes drop{from{opacity:0;transform:translateY(-26px) rotate(-5deg)}}
}
"""

def esc(s): return html.escape(s, quote=True)

def path_of(L, key):
    base = LANGS[L]["path"]
    return base if key == "home" else base + key + "/"

def meta_of(L, key):
    t = LANGS[L]
    if key == "about": return t["about_title"], t["about_desc"]
    if key == "verify": return t["verify_title"], t["verify_desc"]
    return t["title"], t["desc"]

def head(L, key="home"):
    t = LANGS[L]
    ttl, dsc = meta_of(L, key)
    url = BASE + path_of(L, key)
    alt = "".join(f'<link rel="alternate" hreflang="{c}" href="{BASE}{path_of(c, key)}">\n' for c in ORDER)
    alt += f'<link rel="alternate" hreflang="x-default" href="{BASE}{path_of("ar", key)}">\n'
    other = "".join(f'<meta property="og:locale:alternate" content="{LANGS[c]["locale"]}">\n' for c in ORDER if c != L)
    ld = {"@context": "https://schema.org", "@type": "SoftwareApplication", "name": "Yardova",
          "operatingSystem": "Android", "applicationCategory": "GameApplication", "url": url,
          "description": dsc, "inLanguage": t["code"], "image": BASE + "/og.png", "downloadUrl": DL,
          "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
          "contentRating": "18+"}
    if key != "home":
        ld = {"@context": "https://schema.org", "@type": "AboutPage" if key == "about" else "WebPage", "name": ttl,
              "description": dsc, "url": url, "inLanguage": t["code"],
              "isPartOf": {"@type": "WebSite", "name": "Yardova", "url": BASE}}
    return f'''<!DOCTYPE html>
<html lang="{t["code"]}" dir="{t["dir"]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(ttl)}</title>
<meta name="description" content="{esc(dsc)}">
<link rel="canonical" href="{url}">
{alt}<meta name="theme-color" content="#0F3B33">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Yardova">
<meta property="og:title" content="{esc(ttl)}">
<meta property="og:description" content="{esc(dsc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Yardova">
<meta property="og:locale" content="{t["locale"]}">
{other}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(ttl)}">
<meta name="twitter:description" content="{esc(dsc)}">
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

def langs_nav(L, key):
    return "".join(
        f'<li><a href="{path_of(c, key)}" hreflang="{c}" lang="{c}"{" aria-current=\"page\"" if c == L else ""}>{esc(LANGS[c]["name"])}</a></li>' for c in ORDER)

def topbar(L, key):
    return f'''<a class="skip" href="#main">{esc(LANGS[L]["skip"])}</a>
<header class="top"><div class="wrap">
  <a class="brand" href="{LANGS[L]["path"]}" aria-label="Yardova">YARDOVA</a>
  <nav aria-label="Languages"><ul class="langs">{langs_nav(L, key)}</ul></nav>
</div></header>'''

def footer(L):
    t = LANGS[L]
    return f'''<footer><div class="wrap">
  <ul>
    <li><a href="{path_of(L, "about")}">{esc(t["about"])}</a></li>
    <li><a href="{path_of(L, "verify")}">{esc(t["verify"])}</a></li>
    <li><a href="{SHOP}" rel="noopener">{esc(t["store"])}</a></li>
    <li><a href="{PRIVACY}" rel="noopener">{esc(t["privacy"])}</a></li>
    <li><a href="{TERMS}" rel="noopener">{esc(t["terms"])}</a></li>
    <li><a href="mailto:{MAIL}">{esc(t["contact"])}: {MAIL}</a></li>
  </ul>
  <span>© 2026 Yardova. {esc(t["rights"])}</span>
</div></footer>'''

def inner_page(L, key):
    t = LANGS[L]
    body = (ABOUT if key == "about" else VERIFY)[L].replace("%%VERIFY%%", path_of(L, "verify"))
    h1 = t["about_h1"] if key == "about" else t["verify_h1"]
    script = ""
    if key == "verify":
        script = "<script>" + VERIFY_JS.replace("__API__", API_RELEASE).replace("__RELEASE__", RELEASE) + "</script>"
    return head(L, key) + f'''<body>
{topbar(L, key)}
<main id="main">
  <div class="pagehead"><div class="wrap"><h1>{esc(h1)}</h1></div></div>
  <div class="wrap prose">{body}</div>
</main>
{footer(L)}
{script}
</body>
</html>
'''

def page(L):
    t = LANGS[L]
    langs = "".join(
        f'<li><a href="{LANGS[c]["path"]}" hreflang="{c}" lang="{c}"{" aria-current=\"page\"" if c == L else ""}>{esc(LANGS[c]["name"])}</a></li>' for c in ORDER)
    steps = "".join(f'<li><div class="n" aria-hidden="true">{i+1}</div><h3>{esc(h)}</h3><p>{esc(p)}</p></li>' for i, (h, p) in enumerate(t["steps"]))
    chips = "".join(f"<li>{esc(c)}</li>" for c in t["chips"])
    faqs = "".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in t["faqs"])
    return head(L) + f'''<body>
{topbar(L, "home")}
<main id="main">
  <div class="door"><div class="wrap in">
    <p class="mark" aria-hidden="true">YARDOVA</p>
    <div class="tag">
      <h1>{esc(t["h1"])}</h1>
      <p>{esc(t["sub"])}</p>
      <div class="btns">
        <a class="btn main" href="{DL}" rel="noopener">{esc(t["cta1"])}</a>
        <a class="btn alt" href="{APKPURE}" rel="noopener">{esc(t["cta2"])}</a>
      </div>
      <p class="small">{esc(t["small"])}</p>
      <p class="small"><a href="{path_of(L, "verify")}">{esc(t["verify_hint"])}</a></p>
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
{footer(L)}
</body>
</html>
'''

def write(path, data, mode="w"):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, mode, **({} if "b" in mode else {"encoding": "utf-8"})) as f: f.write(data)

def make_assets():
    # أيقونة الموقع = نفس أيقونة التطبيق (صندوق أصفر بحرف Y على جدار حاوية)
    import sys; sys.path.insert(0, os.path.dirname(__file__))
    import brand_icon
    for name, size in (("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)):
        brand_icon.full_icon(size).save(os.path.join(ROOT, name))
    brand_icon.full_icon(64).save(os.path.join(ROOT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
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
    text = "YARDOVA"; tw = d.textlength(text, font=big)
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
    KEYS = ["home", "about", "verify"]
    for L in ORDER:
        for key in KEYS:
            out = (path_of(L, key).lstrip("/") + "index.html")
            write(out, page(L) if key == "home" else inner_page(L, key))
    urls = "".join(
        f'  <url>\n    <loc>{BASE}{path_of(L, key)}</loc>\n    <lastmod>{UPDATED}</lastmod>\n' +
        "".join(f'    <xhtml:link rel="alternate" hreflang="{c}" href="{BASE}{path_of(c, key)}"/>\n' for c in ORDER) +
        f'    <xhtml:link rel="alternate" hreflang="x-default" href="{BASE}{path_of("ar", key)}"/>\n  </url>\n' for key in KEYS for L in ORDER)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n{urls}</urlset>\n')
    write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n")
    write("_headers", "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n\n/*.png\n  Cache-Control: public, max-age=604800\n\n/favicon.ico\n  Cache-Control: public, max-age=604800\n")
    make_assets()
    print("site generated:", sorted(os.listdir(ROOT)))

if __name__ == "__main__":
    main()
