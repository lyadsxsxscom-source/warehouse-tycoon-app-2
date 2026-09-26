// =====================================================================
// تعدد اللغات: العربية (الأصل) + التركية + الإنجليزية
// الفكرة: التطبيق مكتوب بالعربي، وهالملف بيترجم أي نص بيظهر بالشاشة لحظة ما يظهر.
// لإضافة نص جديد: ضيفه بقاموس EXACT (نص ثابت) أو PATTERNS (نص فيه أرقام/متغيرات بمكان {0} {1}).
// =====================================================================
(function(){
  // [تركي, إنجليزي]
  const EXACT = {
    "مستودع الأرباح": ["Kazanç Deposu", "Profit Warehouse"],
    "سجّل دخولك عشان تبدأ وتحفظ تقدمك": ["Başlamak ve ilerlemeni kaydetmek için giriş yap", "Sign in to start and save your progress"],
    "تسجيل الدخول عبر Google": ["Google ile giriş yap", "Sign in with Google"],
    "تسجيل الدخول عبر Google لحفظ التقدم": ["İlerlemeni kaydetmek için Google ile giriş yap", "Sign in with Google to save progress"],
    "تسجيل الخروج": ["Çıkış yap", "Sign out"],
    "تحديث مطلوب": ["Güncelleme gerekli", "Update required"],
    "صار في نسخة جديدة من التطبيق فيها إصلاحات مهمة. لازم تحدّث عشان تكمل اللعب.": ["Uygulamanın önemli düzeltmeler içeren yeni bir sürümü var. Oynamaya devam etmek için güncellemelisin.", "A new version with important fixes is available. Please update to keep playing."],
    "⬇ تحميل آخر نسخة": ["⬇ Son sürümü indir", "⬇ Download latest version"],
    "فعّل VPN مكتشف": ["VPN algılandı", "VPN detected"],
    "VPN مكتشف": ["VPN algılandı", "VPN detected"],
    "لازم تطفي أي تطبيق VPN عشان تقدر تستخدم جدار المهام والعروض.": ["Görev duvarını ve teklifleri kullanabilmek için tüm VPN uygulamalarını kapatmalısın.", "You need to turn off any VPN app to use the offerwall and offers."],
    "استخدام VPN بيعرّض حسابك لخطر الحظر من شبكات العروض — هاد إجراء حماية لحسابك إنت.": ["VPN kullanmak hesabını teklif ağları tarafından engellenme riskine sokar — bu, hesabını korumak için bir önlemdir.", "Using a VPN puts your account at risk of being banned by offer networks — this protects your account."],
    "🔄 تحققت، جرب مرة تانية": ["🔄 Kapattım, tekrar kontrol et", "🔄 Done, check again"],
    "ت": ["P", "P"],
    "النقاط": ["Puanlar", "Points"],
    "لشراء الرفوف والعمال": ["Raf ve işçi almak için", "To buy shelves and workers"],
    "المحفظة": ["Cüzdan", "Wallet"],
    "الرفوف والعمال": ["Raflar ve İşçiler", "Shelves & Workers"],
    "اضغط رف فارغ لاستئجار عامل · العملة تتجمّع تلقائياً بالمحفظة": ["İşçi kiralamak için boş bir rafa dokun · Kripto otomatik olarak cüzdanda birikir", "Tap an empty shelf to hire a worker · Coins collect automatically in your wallet"],
    "كسب نقاط": ["Puan Kazan", "Earn Points"],
    "مهام اليوم": ["Günün Görevleri", "Today's Tasks"],
    "استرداد كود شحن": ["Yükleme Kodu Kullan", "Redeem a Top-up Code"],
    "اكتب الكود اللي حصلت عليه من الوكيل": ["Bayiden aldığın kodu yaz", "Enter the code you got from the reseller"],
    "استرداد": ["Kullan", "Redeem"],
    "لشراء نقاط بفلوس حقيقية، زور موقعنا الرسمي واحصل على كود استرداد، وفعّله من الأعلى.": ["Gerçek parayla puan almak için resmi sitemizi ziyaret et, bir kod al ve yukarıdan etkinleştir.", "To buy points with real money, visit our official website, get a redeem code and activate it above."],
    "زيارة موقعنا للشحن والتحميل": ["Yükleme ve indirme için sitemizi ziyaret et", "Visit our website to top up & download"],
    "الرصيد القابل للسحب": ["Çekilebilir bakiye", "Withdrawable balance"],
    "الشبكة": ["Ağ", "Network"],
    "عنوان محفظة باينانس (بنفس العملة والشبكة المختارة)": ["Binance cüzdan adresi (seçilen coin ve ağ ile aynı)", "Binance wallet address (same coin and network as selected)"],
    "المبلغ": ["Miktar", "Amount"],
    "طلب سحب": ["Çekim talebi", "Request withdrawal"],
    "سجل السحوبات": ["Çekim geçmişi", "Withdrawal history"],
    "لا يوجد سحوبات سابقة": ["Önceki çekim yok", "No previous withdrawals"],
    "لاعب مجهول (بدون تسجيل)": ["Anonim oyuncu (giriş yapılmadı)", "Guest player (not signed in)"],
    "إجمالي النقاط المكتسبة": ["Toplam kazanılan puan", "Total points earned"],
    "عدد العمال المستأجرين": ["Kiralanan işçi sayısı", "Workers hired"],
    "الرفوف المفتوحة": ["Açık raflar", "Unlocked shelves"],
    "الإعلانات المشاهدة": ["İzlenen reklamlar", "Ads watched"],
    "الإعدادات": ["Ayarlar", "Settings"],
    "الإشعارات": ["Bildirimler", "Notifications"],
    "اللغة": ["Dil", "Language"],
    "سياسة الخصوصية وشروط الاستخدام": ["Gizlilik politikası ve kullanım şartları", "Privacy policy & terms of use"],
    "البريد": ["Posta", "Mail"],
    "سجّل دخول عشان تشوف رسائلك.": ["Mesajlarını görmek için giriş yap.", "Sign in to see your messages."],
    "عرض توضيحي: النقاط تُكسب من الإعلان/جدار المهام خلف زر واحد، وتُصرف على الرفوف والعمال. العملة ينتجها العمال تلقائياً وتتراكم مباشرة بالمحفظة، وتقدر تختار BTC أو ETH.": ["Nasıl çalışır: Puanlar reklam/görev duvarından tek bir düğmeyle kazanılır ve raflar ile işçilere harcanır. İşçiler kriptoyu otomatik üretir ve doğrudan cüzdanında birikir; BTC veya ETH seçebilirsin.", "How it works: Points are earned from ads/the offerwall behind one button and spent on shelves and workers. Workers produce coins automatically straight into your wallet, and you can choose BTC or ETH."],
    "الرئيسية": ["Ana Sayfa", "Home"],
    "المتجر": ["Mağaza", "Store"],
    "السحب": ["Çekim", "Withdraw"],
    "الملف": ["Profil", "Profile"],
    "استئجار عامل": ["İşçi kirala", "Hire a worker"],
    "— رف": ["— Raf", "— Shelf"],
    "يوم واحد": ["1 gün", "1 day"],
    "أسبوع": ["1 hafta", "1 week"],
    "شهر": ["1 ay", "1 month"],
    "إلغاء": ["İptal", "Cancel"],
    "مشاهدة إعلان": ["Reklam izle", "Watch an ad"],
    "فوري + مضاعفة إنتاج 60 ثانية": ["Anında + 60 saniye 2x üretim", "Instant + 2x production for 60s"],
    "جدار المهام": ["Görev Duvarı", "Offerwall"],
    "مهام وعروض متنوعة — كل عرض بمكافأته الخاصة": ["Çeşitli görev ve teklifler — her birinin kendi ödülü var", "Various tasks and offers — each with its own reward"],
    "افتح": ["Aç", "Open"],
    "إغلاق": ["Kapat", "Close"],
    "انتهاء مدة العامل": ["İşçi süresi bitti", "Worker finished"],
    "لما يخلص عامل شغله وبدو تجديد": ["Bir işçinin süresi dolup yenilenmesi gerektiğinde", "When a worker's time is up and needs renewing"],
    "مهام اليوم الجديدة": ["Yeni günlük görevler", "New daily tasks"],
    "كل يوم الساعة 9 الصبح": ["Her gün sabah 9'da", "Every day at 9 AM"],
    "تذكير فتح رف جديد": ["Yeni raf hatırlatması", "New shelf reminder"],
    "لما تكفي نقاطك لفتح الرف الجاي": ["Puanın bir sonraki rafı açmaya yettiğinde", "When you have enough points for the next shelf"],
    "نقاط جدار المهام": ["Görev duvarı puanları", "Offerwall points"],
    "لما توصلك نقاط من العروض": ["Tekliflerden puan geldiğinde", "When you receive points from offers"],
    "طلبات السحب والشحن": ["Çekim ve yükleme talepleri", "Withdrawals & top-ups"],
    "لما ينقبل أو ينرفض طلب سحب، أو توصل شحنة": ["Bir çekim onaylandığında veya reddedildiğinde ya da yükleme geldiğinde", "When a withdrawal is approved or rejected, or a top-up arrives"],
    "مثال: GAME-100COINS-X92B": ["Örnek: GAME-100COINS-X92B", "Example: GAME-100COINS-X92B"],
    "مثال: bc1q... أو 0x...": ["Örnek: bc1q... veya 0x...", "Example: bc1q... or 0x..."],
    "عامل بيتكوين يومي": ["Günlük Bitcoin işçisi", "Daily Bitcoin worker"],
    "عامل بيتكوين أسبوعي": ["Haftalık Bitcoin işçisi", "Weekly Bitcoin worker"],
    "عامل بيتكوين شهري": ["Aylık Bitcoin işçisi", "Monthly Bitcoin worker"],
    "عامل إيثيريوم يومي": ["Günlük Ethereum işçisi", "Daily Ethereum worker"],
    "عامل إيثيريوم أسبوعي": ["Haftalık Ethereum işçisi", "Weekly Ethereum worker"],
    "عامل إيثيريوم شهري": ["Aylık Ethereum işçisi", "Monthly Ethereum worker"],
    "العامل": ["İşçi", "The worker"],
    "عملة": ["coin", "coin"],
    "تسجيل الدخول اليوم": ["Bugün giriş yap", "Log in today"],
    "شاهد 3 إعلانات": ["3 reklam izle", "Watch 3 ads"],
    "استأجر عامل واحد": ["1 işçi kirala", "Hire 1 worker"],
    "تم ✓": ["Tamam ✓", "Done ✓"],
    "✓ تم الاسترداد": ["✓ Kullanıldı", "✓ Redeemed"],
    "₿ Bitcoin (الأصلية)": ["₿ Bitcoin (yerel ağ)", "₿ Bitcoin (native)"],
    "₿ بيتكوين": ["₿ Bitcoin", "₿ Bitcoin"],
    "Ξ إيثيريوم": ["Ξ Ethereum", "Ξ Ethereum"],
    "انتهت المدة": ["Süre doldu", "Time's up"],
    "اضغط للتجديد": ["Yenilemek için dokun", "Tap to renew"],
    "استأجر عامل": ["İşçi kirala", "Hire worker"],
    "نقاط غير كافية لفتح هذا الرف.": ["Bu rafı açmak için yeterli puan yok.", "Not enough points to unlock this shelf."],
    "تم فتح رف جديد!": ["Yeni raf açıldı!", "New shelf unlocked!"],
    "هذا العامل شغّال حالياً.": ["Bu işçi şu anda çalışıyor.", "This worker is currently working."],
    "نقاط غير كافية.": ["Yeterli puan yok.", "Not enough points."],
    "عم نستأجر العامل...": ["İşçi kiralanıyor...", "Hiring worker..."],
    "عرض": ["Teklif", "Offer"],
    "لازم تسجّل دخول أول قبل ما تفتح هالعرض، حتى توصلك نقاطك صح.": ["Puanlarının doğru gelmesi için bu teklifi açmadan önce giriş yapmalısın.", "Please sign in before opening this offer so your points are credited correctly."],
    "✓ تم الإرسال": ["✓ Gönderildi", "✓ Sent"],
    "✕ مرفوض (استرجع الرصيد)": ["✕ Reddedildi (bakiye iade edildi)", "✕ Rejected (balance refunded)"],
    "⏳ قيد المراجعة": ["⏳ İnceleniyor", "⏳ Under review"],
    "لازم تسجّل دخول أول.": ["Önce giriş yapmalısın.", "Please sign in first."],
    "حط عنوان المحفظة.": ["Cüzdan adresini gir.", "Enter the wallet address."],
    "حط مبلغ صحيح.": ["Geçerli bir miktar gir.", "Enter a valid amount."],
    "المبلغ أكبر من رصيدك المتاح.": ["Miktar kullanılabilir bakiyenden fazla.", "The amount exceeds your available balance."],
    "تم إرسال طلب السحب، رح تتم مراجعته خلال 24 ساعة.": ["Çekim talebin gönderildi, 24 saat içinde incelenecek.", "Withdrawal request sent; it will be reviewed within 24 hours."],
    "ما وصل token من تسجيل الدخول الأصلي": ["Giriş anahtarı alınamadı", "No sign-in token received"],
    "تم تحميل تقدمك المحفوظ!": ["Kayıtlı ilerlemen yüklendi!", "Your saved progress has been loaded!"],
    "أهلاً! بدأنا لك تقدم جديد.": ["Hoş geldin! Senin için yeni bir oyun başlattık.", "Welcome! We started a new game for you."],
    "تعذّر الاتصال بالسيرفر، تأكد من الإنترنت وجرّب كمان مرة.": ["Sunucuya bağlanılamadı, internetini kontrol edip tekrar dene.", "Couldn't reach the server. Check your internet and try again."],
    "صار خطأ، جرّب كمان مرة.": ["Bir hata oluştu, tekrar dene.", "Something went wrong, please try again."],
    "اكتب الكود أول.": ["Önce kodu yaz.", "Enter the code first."],
    "جاري الاسترداد...": ["Kullanılıyor...", "Redeeming..."],
    "ما في رسائل لسا.": ["Henüz mesaj yok.", "No messages yet."],
    "جاري التحميل...": ["Yükleniyor...", "Loading..."],
    "انتهت مدة العامل ⏰": ["İşçinin süresi doldu ⏰", "Worker's time is up ⏰"],
    "مهام اليوم جاهزة 🎁": ["Günün görevleri hazır 🎁", "Today's tasks are ready 🎁"],
    "استلم مكافأة تسجيل الدخول وكمّل مهام اليوم.": ["Giriş ödülünü al ve günün görevlerini tamamla.", "Claim your login reward and complete today's tasks."],
    "رف جديد بانتظارك 📦": ["Yeni bir raf seni bekliyor 📦", "A new shelf is waiting for you 📦"],
    "لازم تسمح للتطبيق بالإشعارات من إعدادات الجوال.": ["Telefon ayarlarından uygulamaya bildirim izni vermelisin.", "Please allow notifications for the app in your phone settings."],
    "+2 نقطة، ومضاعفة الإنتاج ×2 لمدة 60 ثانية!": ["+2 puan ve 60 saniye boyunca 2x üretim!", "+2 points and 2x production for 60 seconds!"],
    "ما تم إكمال مشاهدة الإعلان بالكامل.": ["Reklam sonuna kadar izlenmedi.", "The ad wasn't watched to the end."],
    "تعذّر عرض الإعلان، حاول لاحقاً.": ["Reklam gösterilemedi, daha sonra tekrar dene.", "Couldn't show the ad, try again later."],
    "الإعلان لسا يتحمّل، جرب بعد شوي.": ["Reklam hâlâ yükleniyor, biraz sonra dene.", "The ad is still loading, try again shortly."],
    "لازم تسجّل دخول أول قبل ما تفتح جدار المهام (من صفحة الملف الشخصي)، حتى توصلك نقاطك صح.": ["Puanlarının doğru gelmesi için görev duvarını açmadan önce (Profil sayfasından) giriş yapmalısın.", "Please sign in (from the Profile page) before opening the offerwall so your points are credited correctly."],
    "عم نجهّز جدار المهام...": ["Görev duvarı hazırlanıyor...", "Preparing the offerwall..."],
    "تعذّر فتح جدار المهام حالياً، جرب بعد شوي.": ["Görev duvarı şu anda açılamadı, biraz sonra dene.", "Couldn't open the offerwall right now, try again shortly."],
    // رسائل السيرفر
    "انتهت جلستك، سجّل دخول من جديد.": ["Oturumun sona erdi, tekrar giriş yap.", "Your session expired, please sign in again."],
    "رف غير موجود.": ["Raf bulunamadı.", "Shelf not found."],
    "هذا الرف مفتوح أصلاً.": ["Bu raf zaten açık.", "This shelf is already unlocked."],
    "نوع عامل غير صحيح.": ["Geçersiz işçi türü.", "Invalid worker type."],
    "هذا الرف مقفول.": ["Bu raf kilitli.", "This shelf is locked."],
    "مهمة غير موجودة.": ["Görev bulunamadı.", "Task not found."],
    "استلمت هالمكافأة من قبل.": ["Bu ödülü zaten aldın.", "You already claimed this reward."],
    "المهمة لسا ما خلصت.": ["Görev henüz tamamlanmadı.", "The task isn't completed yet."],
    "استنى شوي قبل الإعلان الجاي.": ["Sonraki reklamdan önce biraz bekle.", "Please wait a bit before the next ad."],
    "وصلت للحد اليومي لمكافآت الإعلانات.": ["Günlük reklam ödülü sınırına ulaştın.", "You've reached the daily ad reward limit."],
    "عملة غير صحيحة.": ["Geçersiz coin.", "Invalid coin."],
    "حط عنوان محفظة صحيح.": ["Geçerli bir cüzdan adresi gir.", "Enter a valid wallet address."],
    "رسالة غير صحيحة.": ["Geçersiz mesaj.", "Invalid message."],
    "هذا الكود غير موجود.": ["Bu kod mevcut değil.", "This code doesn't exist."],
    "هذا الكود مستخدم من قبل.": ["Bu kod daha önce kullanılmış.", "This code has already been used."],
    "هذا الكود غير صالح.": ["Bu kod geçersiz.", "This code is invalid."],
    "تم استرداد هذا الكود مسبقاً.": ["Bu kod daha önce kullanılmış.", "This code has already been redeemed."],
    "السيرفر مشغول، جرّب كمان مرة.": ["Sunucu meşgul, tekrar dene.", "The server is busy, please try again."],
    "صار خطأ بالسيرفر، جرّب بعد شوي.": ["Sunucuda bir hata oluştu, biraz sonra dene.", "A server error occurred, try again shortly."],
    "عملية غير معروفة.": ["Bilinmeyen işlem.", "Unknown action."],
  };

  // نصوص فيها أرقام أو أسماء متغيرة: {0} {1} {2}
  const PATTERNS = [
    ["+{0} نقطة!", "+{0} puan!", "+{0} points!"],
    ["الحد الأدنى للسحب {0} — مرة وحدة كل 24 ساعة", "Minimum çekim {0} — 24 saatte bir kez", "Minimum withdrawal {0} — once every 24 hours"],
    ["الحد الأدنى للسحب {0}$.", "Minimum çekim {0}$.", "Minimum withdrawal is ${0}."],
    ["الحد الأدنى للسحب {0} {1}.", "Minimum çekim {0} {1}.", "Minimum withdrawal is {0} {1}."],
    ["{0}ي {1}س متبقي", "{0}g {1}sa kaldı", "{0}d {1}h left"],
    ["{0}س {1}د متبقي", "{0}sa {1}dk kaldı", "{0}h {1}m left"],
    ["{0}د متبقي", "{0}dk kaldı", "{0}m left"],
    ["{0}ث متبقي", "{0}sn kaldı", "{0}s left"],
    ["+{0}/ثانية {1} {2}", "+{0}/sn {1} {2}", "+{0}/sec {1} {2}"],
    ["+{0}/ثانية {1}", "+{0}/sn {1}", "+{0}/sec {1}"],
    ["+{0}/ثانية", "+{0}/sn", "+{0}/sec"],
    ["إنتاج {0} {1}/ث", "Üretim {0} {1}/sn", "Output {0} {1}/s"],
    ["فتح: {0} نقطة", "Aç: {0} puan", "Unlock: {0} points"],
    ["{0} نقطة", "{0} puan", "{0} points"],
    ["تم استئجار {0}!", "{0} kiralandı!", "{0} hired!"],
    ["تقدر تسحب مرة كل 24 ساعة بس — جرّب بعد حوالي {0} ساعة.", "24 saatte yalnızca bir kez çekim yapabilirsin — yaklaşık {0} saat sonra dene.", "You can withdraw only once every 24 hours — try again in about {0} hours."],
    ["وصلتك {0} نقطة! 🎉", "{0} puan kazandın! 🎉", "You received {0} points! 🎉"],
    ["✓ تم الاسترداد! +{0} نقطة", "✓ Kullanıldı! +{0} puan", "✓ Redeemed! +{0} points"],
    ["✓ تم استرداد {0} نقطة من البريد!", "✓ Postadan {0} puan alındı!", "✓ Claimed {0} points from mail!"],
    ["تعذّر تحميل البريد: {0}", "Posta yüklenemedi: {0}", "Couldn't load mail: {0}"],
    ["{0} خلّص شغله، جدّده ليرجع ينتج.", "{0} işini bitirdi, üretmeye devam etmesi için yenile.", "{0} finished working — renew it to keep producing."],
    ["عندك {0} نقطة، بتكفي تفتح رف جديد وتزيد إنتاجك.", "{0} puanın var, yeni bir raf açıp üretimini artırabilirsin.", "You have {0} points — enough to unlock a new shelf and boost production."],
    ["تعذّر إرسال الطلب: {0}", "Talep gönderilemedi: {0}", "Couldn't send request: {0}"],
    ["تعذّر تسجيل الدخول: {0}", "Giriş yapılamadı: {0}", "Sign-in failed: {0}"],
    ["تعذّر تحميل تقدمك: {0}", "İlerlemen yüklenemedi: {0}", "Couldn't load your progress: {0}"],
    ["تعذّر الاسترداد: {0}", "Kod kullanılamadı: {0}", "Redeem failed: {0}"],
    ["حالة الشريط الإعلاني: {0}", "Banner durumu: {0}", "Banner status: {0}"],
    ["تم تأكيد شحنتك بـ {0} نقطة! اضغط \"استرداد\" تحت لتفعيلها.", "{0} puanlık yüklemen onaylandı! Etkinleştirmek için aşağıdaki \"Kullan\" düğmesine bas.", "Your {0}-point top-up is confirmed! Tap \"Redeem\" below to activate it."],
    ["₿ {0}", "₿ {0}", "₿ {0}"],
    ["Ξ {0}", "Ξ {0}", "Ξ {0}"],
    ["{0} ({1}/{2})", "{0} ({1}/{2})", "{0} ({1}/{2})"],
  ];

  const LANGS = { ar: { name: "العربية", dir: "rtl" }, tr: { name: "Türkçe", dir: "ltr" }, en: { name: "English", dir: "ltr" } };
  const IDX = { tr: 0, en: 1 };
  const ARABIC = /[\u0600-\u06FF]/;

  function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  const COMPILED = PATTERNS.map(([ar, tr, en]) => {
    const parts = ar.split(/\{\d\}/);
    const order = (ar.match(/\{(\d)\}/g) || []).map(x => Number(x[1]));
    const re = new RegExp("^" + parts.map(escapeRe).join("(.+?)") + "$");
    return { re, order, out: { tr, en } };
  });

  function detectLang(){
    try{ const saved = localStorage.getItem("lang"); if(saved && LANGS[saved]) return saved; }catch(e){}
    const dev = (navigator.language || "ar").toLowerCase();
    if(dev.startsWith("ar")) return "ar";
    if(dev.startsWith("tr")) return "tr";
    return "en";
  }
  let lang = detectLang();

  function translate(text){
    if(lang === "ar" || !text || !ARABIC.test(text)) return text;
    const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = m[2].replace(/\s+/g, " ");
    if(Object.prototype.hasOwnProperty.call(EXACT, core)) return m[1] + EXACT[core][IDX[lang]] + m[3];
    for(const p of COMPILED){
      const mm = core.match(p.re);
      if(!mm) continue;
      let out = p.out[lang];
      p.order.forEach((n, i) => { out = out.replace("{" + n + "}", translate(mm[i + 1])); });
      return m[1] + out + m[3];
    }
    return text;
  }

  function isSkipped(node){
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !el || !!el.closest("[translate='no'], script, style");
  }
  function translateTextNode(node){
    if(isSkipped(node)) return;
    let src;
    if(node.__i18nOut !== undefined && node.nodeValue === node.__i18nOut) src = node.__i18nSrc;
    else { src = node.nodeValue; node.__i18nSrc = src; }
    const out = translate(src);
    node.__i18nOut = out;
    if(node.nodeValue !== out) node.nodeValue = out;
  }
  function translateAttr(el, attr){
    const key = "__i18n_" + attr;
    const cur = el.getAttribute(attr);
    if(cur === null) return;
    if(el[key + "Out"] === undefined || cur !== el[key + "Out"]) el[key + "Src"] = cur;
    const out = translate(el[key + "Src"]);
    el[key + "Out"] = out;
    if(cur !== out) el.setAttribute(attr, out);
  }
  function translateTree(root){
    if(!root) return;
    if(root.nodeType === 3){ translateTextNode(root); return; }
    if(root.nodeType !== 1 || isSkipped(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; const nodes = [];
    while((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(translateTextNode);
    const els = root.querySelectorAll ? root.querySelectorAll("[placeholder]") : [];
    els.forEach(el => translateAttr(el, "placeholder"));
    if(root.hasAttribute && root.hasAttribute("placeholder")) translateAttr(root, "placeholder");
  }

  function applyDirection(){
    document.documentElement.lang = lang;
    document.documentElement.dir = LANGS[lang].dir;
  }

  window.I18N = {
    t: translate,
    get lang(){ return lang; },
    langs: LANGS,
    setLang(l){
      if(!LANGS[l]) return;
      lang = l;
      try{ localStorage.setItem("lang", l); }catch(e){}
      applyDirection();
      translateTree(document.body);
      document.dispatchEvent(new CustomEvent("langchange", { detail: l }));
    },
  };

  // الرسائل المنبثقة كمان بتتترجم
  const origAlert = window.alert.bind(window);
  window.alert = (msg) => origAlert(translate(String(msg)));

  applyDirection();
  document.addEventListener("DOMContentLoaded", () => {
    translateTree(document.body);
    new MutationObserver(muts => {
      for(const mu of muts){
        if(mu.type === "characterData") translateTextNode(mu.target);
        else if(mu.type === "attributes") translateAttr(mu.target, "placeholder");
        else mu.addedNodes.forEach(translateTree);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder"] });
  });
})();
