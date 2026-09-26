// =====================================================================
// تعدد اللغات للموقع: العربية (الأصل) + التركية + الإنجليزية
// نفس محرك التطبيق. نصوص طرق الدفع يلي بتنضاف من الأدمن بتنترجم من حقولها (name_tr, desc_en...)
// =====================================================================
(function(){
  // [تركي, إنجليزي]
  const EXACT = {
  "مستودع الأرباح — التحميل والشحن": [
    "Kazanç Deposu — İndir ve Yükle",
    "Profit Warehouse — Download & Top-up"
  ],
  "مستودع الأرباح": [
    "Kazanç Deposu",
    "Profit Warehouse"
  ],
  "لعبة إدارة مستودع idle — وظّف عمّالك، اجمع النقاط، وشاهد المحفظة تتراكم وحدها.": [
    "Idle depo yönetim oyunu — işçilerini çalıştır, puan topla ve cüzdanının kendiliğinden dolmasını izle.",
    "An idle warehouse game — hire workers, collect points and watch your wallet grow on its own."
  ],
  "⬇ تحميل آخر نسخة (Android)": [
    "⬇ Son sürümü indir (Android)",
    "⬇ Download latest version (Android)"
  ],
  "ملف APK مباشر من GitHub — فعّل \"مصادر غير معروفة\" عند التثبيت": [
    "GitHub'dan doğrudan APK dosyası — kurulumda \"Bilinmeyen kaynaklar\"ı etkinleştir",
    "Direct APK file from GitHub — enable \"Unknown sources\" when installing"
  ],
  "كيف تلعب": [
    "Nasıl oynanır",
    "How to play"
  ],
  "اجمع نقاط، افتح رفوف، ووظّف عمّال ينتجون لك عملة تتراكم بالمحفظة تلقائياً.": [
    "Puan topla, raf aç ve senin için kripto üreten işçiler kirala; kripto otomatik olarak cüzdanında birikir.",
    "Collect points, unlock shelves and hire workers who produce coins that pile up in your wallet automatically."
  ],
  "شاهد إعلان أو أكمل عرض واكسب نقاط": [
    "Reklam izle veya bir teklifi tamamla ve puan kazan",
    "Watch an ad or complete an offer to earn points"
  ],
  "افتح رف واستأجر عامل عليه": [
    "Bir raf aç ve ona işçi kirala",
    "Unlock a shelf and hire a worker on it"
  ],
  "العامل ينتج عملة تلقائياً طول مدة عقده": [
    "İşçi, sözleşmesi boyunca otomatik olarak kripto üretir",
    "The worker produces coins automatically for its whole contract"
  ],
  "العملة تتجمّع بالمحفظة — اختر BTC أو ETH": [
    "Kripto cüzdanda birikir — BTC veya ETH seç",
    "Coins collect in your wallet — choose BTC or ETH"
  ],
  "اشحن نقاط": [
    "Puan yükle",
    "Top up points"
  ],
  "1000 نقطة = 1$. سجّل دخول بنفس حساب جوجل يلي بتستخدمه داخل اللعبة، عشان نقدر نبعتلك نقاطك تلقائياً بصندوق \"البريد\" داخل التطبيق فور تأكيد التحويل.": [
    "1000 puan = 1$. Oyunda kullandığın Google hesabıyla giriş yap; ödeme onaylanır onaylanmaz puanlarını uygulamadaki \"Posta\" kutusuna otomatik gönderelim.",
    "1000 points = $1. Sign in with the same Google account you use in the game so we can send your points automatically to the in-app \"Mail\" box once your transfer is confirmed."
  ],
  "لازم تسجّل دخول أول عشان تقدر تشتري نقاط.": [
    "Puan satın alabilmek için önce giriş yapmalısın.",
    "You need to sign in first to buy points."
  ],
  "تسجيل الدخول عبر Google": [
    "Google ile giriş yap",
    "Sign in with Google"
  ],
  "تسجيل خروج": [
    "Çıkış yap",
    "Sign out"
  ],
  "💳 شراء نقاط الآن": [
    "💳 Şimdi puan satın al",
    "💳 Buy points now"
  ],
  "طرق الدفع المتاحة": [
    "Kullanılabilir ödeme yöntemleri",
    "Available payment methods"
  ],
  "تواصل معنا": [
    "Bize ulaşın",
    "Contact us"
  ],
  "للشحن، أو أي مشكلة بالتطبيق، أو اقتراح.": [
    "Yükleme, uygulamayla ilgili bir sorun veya öneri için.",
    "For top-ups, any app issue, or suggestions."
  ],
  "💬 واتساب": [
    "💬 WhatsApp",
    "💬 WhatsApp"
  ],
  "✈️ تيليجرام": [
    "✈️ Telegram",
    "✈️ Telegram"
  ],
  "لعبة عرض توضيحي قبل الإطلاق الرسمي — الأسعار وطرق الدفع قابلة للتغيير.": [
    "Resmi lansman öncesi demo oyun — fiyatlar ve ödeme yöntemleri değişebilir.",
    "Demo game before the official launch — prices and payment methods may change."
  ],
  "سياسة الخصوصية": [
    "Gizlilik politikası",
    "Privacy policy"
  ],
  "شروط الاستخدام": [
    "Kullanım şartları",
    "Terms of use"
  ],
  "شعارات Binance وTether عبر Wikimedia Commons (CC BY-SA 4.0) — ملك لأصحابها.": [
    "Binance ve Tether logoları Wikimedia Commons üzerinden (CC BY-SA 4.0) — sahiplerine aittir.",
    "Binance and Tether logos via Wikimedia Commons (CC BY-SA 4.0) — property of their owners."
  ],
  "اختر الباقة": [
    "Paketi seç",
    "Choose a package"
  ],
  "‹ رجوع": [
    "‹ Geri",
    "‹ Back"
  ],
  "المبلغ المطلوب": [
    "Ödenecek tutar",
    "Amount due"
  ],
  "📎 اضغط لرفع صورة إشعار التحويل": [
    "📎 Ödeme dekontunun fotoğrafını yüklemek için dokun",
    "📎 Tap to upload a screenshot of your transfer receipt"
  ],
  "إرسال الطلب": [
    "Talebi gönder",
    "Send request"
  ],
  "وصلنا طلبك!": [
    "Talebini aldık!",
    "We got your request!"
  ],
  "رح توصلك النقاط خلال 24 ساعة عبر صندوق \"البريد\" داخل التطبيق.": [
    "Puanların 24 saat içinde uygulamadaki \"Posta\" kutusuna gelecek.",
    "Your points will arrive within 24 hours in the in-app \"Mail\" box."
  ],
  "شكراً على صبرك 🙏": [
    "Sabrın için teşekkürler 🙏",
    "Thanks for your patience 🙏"
  ],
  "ملاحظة (اختياري) — مثلاً اسمك بتطبيق التحويل": [
    "Not (isteğe bağlı) — örneğin ödeme uygulamasındaki adın",
    "Note (optional) — e.g. your name in the payment app"
  ],
  "تحويل فوري بالدولار": [
    "Dolarla anında transfer",
    "Instant transfer in USD"
  ],
  "الحساب": [
    "Hesap",
    "Account"
  ],
  "رقم حساب Kazawallet": [
    "Kazawallet hesap numarası",
    "Kazawallet account number"
  ],
  "دولار أو ليرة سورية": [
    "Dolar veya Suriye lirası",
    "USD or Syrian pounds"
  ],
  "بالدولار": [
    "Dolar ile",
    "In USD"
  ],
  "رمز ShamCash (دولار)": [
    "ShamCash kodu (dolar)",
    "ShamCash code (USD)"
  ],
  "بالليرة السورية": [
    "Suriye lirası ile",
    "In Syrian pounds"
  ],
  "رمز ShamCash (ليرة)": [
    "ShamCash kodu (lira)",
    "ShamCash code (SYP)"
  ],
  "سرياتيل كاش / أقرب إليك": [
    "Syriatel Cash / Aqrab Elik",
    "Syriatel Cash / Aqrab Elik"
  ],
  "تحويل بالليرة السورية": [
    "Suriye lirası ile transfer",
    "Transfer in Syrian pounds"
  ],
  "رقم سرياتيل كاش / أقرب إليك": [
    "Syriatel Cash / Aqrab Elik numarası",
    "Syriatel Cash / Aqrab Elik number"
  ],
  "تحويل فوري بمعرّف بينانس": [
    "Binance ID ile anında transfer",
    "Instant transfer via Binance ID"
  ],
  "المعرّف": [
    "Kimlik (ID)",
    "ID"
  ],
  "USDT (كريبتو)": [
    "USDT (kripto)",
    "USDT (crypto)"
  ],
  "اختر طريقة الدفع": [
    "Ödeme yöntemini seç",
    "Choose a payment method"
  ],
  "سعر الصرف غير محدّث — تواصل معنا مباشرة لتأكيد المبلغ": [
    "Döviz kuru güncel değil — tutarı onaylamak için bizimle doğrudan iletişime geç",
    "Exchange rate isn't up to date — contact us directly to confirm the amount"
  ],
  "أتمم التحويل": [
    "Transferi tamamla",
    "Complete the transfer"
  ],
  "الملف المرفوع لازم يكون صورة فقط.": [
    "Yüklenen dosya yalnızca resim olmalı.",
    "The uploaded file must be an image."
  ],
  "حجم الصورة كبير جداً (الحد الأقصى 8MB).": [
    "Resim çok büyük (en fazla 8MB).",
    "The image is too large (max 8MB)."
  ],
  "لازم تسجّل دخول أول.": [
    "Önce giriş yapmalısın.",
    "Please sign in first."
  ],
  "ارفع صورة إشعار التحويل أول.": [
    "Önce dekont fotoğrafını yükle.",
    "Upload the receipt screenshot first."
  ],
  "جاري إرسال الطلب...": [
    "Talep gönderiliyor...",
    "Sending request..."
  ],
  "سياسة الخصوصية — مستودع الأرباح": [
    "Gizlilik Politikası — Kazanç Deposu",
    "Privacy Policy — Profit Warehouse"
  ],
  "🔒 سياسة الخصوصية": [
    "🔒 Gizlilik Politikası",
    "🔒 Privacy Policy"
  ],
  "مستودع الأرباح — لعبة إدارة مستودع": [
    "Kazanç Deposu — Depo yönetim oyunu",
    "Profit Warehouse — A warehouse management game"
  ],
  "هاي السياسة بتشرحلك شو معلومات بنجمعها لما تستخدم تطبيق \"مستودع الأرباح\" وموقعنا المرتبط فيه، وكيف بنستخدمها، ومين ممكن يشوفها. باستخدامك للتطبيق أو الموقع، معناها موافق على هاي السياسة.": [
    "Bu politika, \"Kazanç Deposu\" uygulamasını ve bağlı web sitemizi kullandığında hangi bilgileri topladığımızı, bunları nasıl kullandığımızı ve kimlerin görebileceğini açıklar. Uygulamayı veya siteyi kullanarak bu politikayı kabul etmiş olursun.",
    "This policy explains what information we collect when you use the \"Profit Warehouse\" app and its website, how we use it, and who can see it. By using the app or the website, you agree to this policy."
  ],
  "1. المعلومات يلي بنجمعها": [
    "1. Topladığımız bilgiler",
    "1. Information we collect"
  ],
  "معلومات حساب جوجل:": [
    "Google hesap bilgileri:",
    "Google account information:"
  ],
  "لما تسجّل دخول بحساب Google، بناخد اسمك، بريدك الإلكتروني، وصورة حسابك (إذا موجودة) — عشان نحفظ تقدمك بالعبة ونربطه فيك.": [
    "Google hesabınla giriş yaptığında adını, e-posta adresini ve profil fotoğrafını (varsa) alırız — oyundaki ilerlemeni kaydetmek ve sana bağlamak için.",
    "When you sign in with Google, we receive your name, email address and profile photo (if any) — to save your game progress and link it to you."
  ],
  "بيانات اللعبة:": [
    "Oyun verileri:",
    "Game data:"
  ],
  "نقاطك، رصيد محفظتك (BTC/ETH)، الرفوف والعمال يلي عندك، وسجل نشاطك بالتطبيق.": [
    "Puanların, cüzdan bakiyen (BTC/ETH), sahip olduğun raflar ve işçiler ile uygulamadaki etkinlik geçmişin.",
    "Your points, wallet balance (BTC/ETH), your shelves and workers, and your in-app activity history."
  ],
  "طلبات الشراء:": [
    "Satın alma talepleri:",
    "Purchase requests:"
  ],
  "لما تشتري نقاط، بنجمع طريقة الدفع يلي اخترتها، المبلغ، وصورة إثبات التحويل يلي بترفعها (لمراجعتها يدوياً وتأكيد عملية الشراء).": [
    "Puan satın aldığında seçtiğin ödeme yöntemini, tutarı ve yüklediğin ödeme dekontu görüntüsünü toplarız (manuel inceleme ve satın alma onayı için).",
    "When you buy points, we collect the payment method you chose, the amount, and the transfer receipt image you upload (to review it manually and confirm the purchase)."
  ],
  "طلبات السحب:": [
    "Çekim talepleri:",
    "Withdrawal requests:"
  ],
  "عنوان محفظة Binance يلي بتزوّدنا فيه، المبلغ، والشبكة المختارة.": [
    "Bize verdiğin Binance cüzdan adresi, tutar ve seçilen ağ.",
    "The Binance wallet address you provide, the amount, and the selected network."
  ],
  "معلومات تقنية:": [
    "Teknik bilgiler:",
    "Technical information:"
  ],
  "شبكات الإعلانات وجدران المهام المدمجة بالتطبيق (متل Unity Ads وOfferwall.me وشبكات مشابهة) ممكن تجمع معرّفات إعلانية لجهازك بشكل مستقل، عشان تعرض إعلانات وتتحقق من إكمال المهام. هاي الشبكات إلها سياسات خصوصية خاصة فيها منفصلة عن سياستنا.": [
    "Uygulamaya entegre reklam ağları ve görev duvarları (Unity Ads, Offerwall.me ve benzerleri gibi), reklam göstermek ve görevlerin tamamlandığını doğrulamak için cihazının reklam kimliklerini bağımsız olarak toplayabilir. Bu ağların bizimkinden ayrı kendi gizlilik politikaları vardır.",
    "Ad networks and offerwalls integrated into the app (such as Unity Ads, Offerwall.me and similar networks) may independently collect your device's advertising identifiers to show ads and verify completed tasks. These networks have their own privacy policies, separate from ours."
  ],
  "2. كيف بنستخدم المعلومات": [
    "2. Bilgileri nasıl kullanırız",
    "2. How we use the information"
  ],
  "حفظ تقدمك بالعبة ومزامنته بين الأجهزة": [
    "Oyundaki ilerlemeni kaydetmek ve cihazlar arasında senkronize etmek",
    "Saving your game progress and syncing it across devices"
  ],
  "مراجعة وتأكيد عمليات الشراء والسحب يدوياً": [
    "Satın alma ve çekim işlemlerini manuel olarak incelemek ve onaylamak",
    "Manually reviewing and confirming purchases and withdrawals"
  ],
  "التواصل معك بخصوص طلباتك (عبر إيميل تلقائي أو واتساب/تيليجرام إذا تواصلت إنت أول)": [
    "Taleplerin hakkında seninle iletişim kurmak (otomatik e-posta ile veya önce sen yazdıysan WhatsApp/Telegram üzerinden)",
    "Contacting you about your requests (by automatic email, or WhatsApp/Telegram if you contacted us first)"
  ],
  "تحسين اللعبة ومنع الاحتيال أو إساءة الاستخدام": [
    "Oyunu geliştirmek ve dolandırıcılığı ya da kötüye kullanımı önlemek",
    "Improving the game and preventing fraud or abuse"
  ],
  "3. مين بيشوف معلوماتك": [
    "3. Bilgilerini kim görebilir",
    "3. Who can see your information"
  ],
  "ما منبيع ولا منأجّر معلوماتك لأي طرف ثالث. بيانات حسابك محفوظة بخدمة Google Firebase (قاعدة بيانات مؤمّنة)، وما يقدر يوصلها غير حسابك إنت أو المشرف المسؤول عن مراجعة طلبات الشراء والسحب.": [
    "Bilgilerini hiçbir üçüncü tarafa satmaz veya kiralamayız. Hesap verilerin Google Firebase'de (güvenli bir veritabanı) saklanır ve yalnızca senin hesabın ile satın alma ve çekim taleplerini inceleyen yönetici erişebilir.",
    "We never sell or rent your information to any third party. Your account data is stored in Google Firebase (a secured database) and can only be accessed by your own account or the administrator who reviews purchase and withdrawal requests."
  ],
  "4. أمان البيانات": [
    "4. Veri güvenliği",
    "4. Data security"
  ],
  "بياناتك محمية بقواعد وصول صارمة — كل حساب يقدر يوصل بس لبياناته الخاصة. مع هيك، ولا نظام إلكتروني آمن 100%، فمنشجعك تحافظ على سرية حسابك.": [
    "Verilerin sıkı erişim kurallarıyla korunur — her hesap yalnızca kendi verilerine erişebilir. Yine de hiçbir elektronik sistem %100 güvenli değildir, bu yüzden hesabını gizli tutmanı öneririz.",
    "Your data is protected by strict access rules — each account can only access its own data. Still, no electronic system is 100% secure, so we encourage you to keep your account private."
  ],
  "5. حقوقك": [
    "5. Hakların",
    "5. Your rights"
  ],
  "تقدر تطلب حذف حسابك وبياناتك بالكامل بالتواصل معنا مباشرة (تفاصيل التواصل تحت). بعد الحذف، ما رح نقدر نسترجع تقدمك بالعبة.": [
    "Bizimle doğrudan iletişime geçerek hesabının ve verilerinin tamamen silinmesini isteyebilirsin (iletişim bilgileri aşağıda). Silindikten sonra oyundaki ilerlemeni geri getiremeyiz.",
    "You can request full deletion of your account and data by contacting us directly (contact details below). After deletion, we cannot restore your game progress."
  ],
  "6. الأطفال": [
    "6. Çocuklar",
    "6. Children"
  ],
  "هاد التطبيق مو موجّه للأطفال تحت 18 سنة، لأنه فيه عمليات تتعلق بعملات مشفرة حقيقية. ما نجمع معلومات بشكل مقصود من أي شخص تحت هالعمر.": [
    "Bu uygulama gerçek kripto paralarla ilgili işlemler içerdiği için 18 yaş altındaki çocuklara yönelik değildir. Bu yaşın altındaki kimseden bilerek bilgi toplamayız.",
    "This app is not intended for children under 18, as it involves real cryptocurrency transactions. We do not knowingly collect information from anyone under this age."
  ],
  "7. تغييرات على السياسة": [
    "7. Politika değişiklikleri",
    "7. Changes to this policy"
  ],
  "ممكن نحدّث هاي السياسة من وقت لوقت. أي تعديل جوهري رح نعلن عنه داخل التطبيق أو الموقع.": [
    "Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişiklikleri uygulama veya site içinde duyururuz.",
    "We may update this policy from time to time. Any significant change will be announced in the app or on the website."
  ],
  "8. تواصل معنا": [
    "8. Bize ulaşın",
    "8. Contact us"
  ],
  "لأي سؤال بخصوص خصوصيتك أو بياناتك:": [
    "Gizliliğin veya verilerinle ilgili her soru için:",
    "For any question about your privacy or data:"
  ],
  "واتساب:": [
    "WhatsApp:",
    "WhatsApp:"
  ],
  "تيليجرام:": [
    "Telegram:",
    "Telegram:"
  ],
  "آخر تحديث: سبتمبر 2026": [
    "Son güncelleme: Eylül 2026",
    "Last updated: September 2026"
  ],
  "شروط الاستخدام — مستودع الأرباح": [
    "Kullanım Şartları — Kazanç Deposu",
    "Terms of Use — Profit Warehouse"
  ],
  "📜 شروط الاستخدام": [
    "📜 Kullanım Şartları",
    "📜 Terms of Use"
  ],
  "باستخدامك تطبيق \"مستودع الأرباح\" أو الموقع المرتبط فيه، معناها موافق على هاي الشروط. إذا ما موافق، ما تستخدم التطبيق.": [
    "\"Kazanç Deposu\" uygulamasını veya bağlı web sitesini kullanarak bu şartları kabul etmiş olursun. Kabul etmiyorsan uygulamayı kullanma.",
    "By using the \"Profit Warehouse\" app or its website, you agree to these terms. If you don't agree, please don't use the app."
  ],
  "1. طبيعة الخدمة": [
    "1. Hizmetin niteliği",
    "1. Nature of the service"
  ],
  "\"مستودع الأرباح\" لعبة idle مجانية: تكسب نقاط داخل اللعبة (من الإعلانات، المهام، أو الشراء)، وتستخدمها لاستئجار عمال ينتجون رصيد بعملة BTC أو ETH داخل محفظتك بالتطبيق، وتقدر تطلب سحب هالرصيد لمحفظة Binance خاصتك.": [
    "\"Kazanç Deposu\" ücretsiz bir idle oyundur: oyun içinde puan kazanırsın (reklamlardan, görevlerden veya satın alarak) ve bunları uygulamadaki cüzdanında BTC veya ETH bakiyesi üreten işçileri kiralamak için kullanırsın; bu bakiyenin kendi Binance cüzdanına çekilmesini talep edebilirsin.",
    "\"Profit Warehouse\" is a free idle game: you earn in-game points (from ads, tasks or purchases) and use them to hire workers who produce a BTC or ETH balance in your in-app wallet, which you can request to withdraw to your own Binance wallet."
  ],
  "2. الحساب": [
    "2. Hesap",
    "2. Account"
  ],
  "لازم تسجّل دخول بحساب Google حقيقي وتحت ملكيتك أنت": [
    "Sana ait gerçek bir Google hesabıyla giriş yapmalısın",
    "You must sign in with a real Google account that you own"
  ],
  "إنت المسؤول عن سرية حسابك وأي نشاط يصير فيه": [
    "Hesabının gizliliğinden ve içinde gerçekleşen her etkinlikten sen sorumlusun",
    "You are responsible for keeping your account secure and for any activity in it"
  ],
  "حساب واحد لكل شخص — الحسابات المتعددة لنفس الشخص بهدف استغلال النظام ممنوعة": [
    "Kişi başına bir hesap — sistemi istismar etmek için aynı kişinin birden fazla hesabı yasaktır",
    "One account per person — multiple accounts by the same person to exploit the system are prohibited"
  ],
  "3. الشراء": [
    "3. Satın alma",
    "3. Purchases"
  ],
  "شراء النقاط بيتم عبر تحويل يدوي (Kazawallet، ShamCash، سرياتيل كاش، Binance Pay، أو USDT) ومراجعة يدوية من فريقنا": [
    "Puan satın alma manuel transferle (Kazawallet, ShamCash, Syriatel Cash, Binance Pay veya USDT) ve ekibimizin manuel incelemesiyle yapılır",
    "Points are bought by manual transfer (Kazawallet, ShamCash, Syriatel Cash, Binance Pay or USDT) and reviewed manually by our team"
  ],
  "لازم ترفع صورة إثبات تحويل حقيقية وصحيحة — إثبات مزوّر بيلغي الطلب ويُعرّض حسابك للإيقاف": [
    "Gerçek ve doğru bir ödeme dekontu yüklemelisin — sahte dekont talebi iptal eder ve hesabının askıya alınmasına yol açabilir",
    "You must upload a real, valid transfer receipt — a fake receipt cancels the request and may get your account suspended"
  ],
  "مدة المراجعة عادة حتى 24 ساعة": [
    "İnceleme genellikle 24 saate kadar sürer",
    "Review usually takes up to 24 hours"
  ],
  "المبالغ المدفوعة غير قابلة للاسترجاع بعد تأكيد الطلب وتفعيل النقاط": [
    "Talep onaylanıp puanlar etkinleştirildikten sonra ödenen tutarlar iade edilmez",
    "Payments are non-refundable once the request is confirmed and the points are activated"
  ],
  "4. السحب": [
    "4. Çekim",
    "4. Withdrawals"
  ],
  "في حد أدنى للسحب (معروض داخل التطبيق، قابل للتغيير)": [
    "Minimum çekim tutarı vardır (uygulamada gösterilir, değişebilir)",
    "There is a minimum withdrawal amount (shown in the app, subject to change)"
  ],
  "مسموح طلب سحب واحد كل 24 ساعة": [
    "24 saatte yalnızca bir çekim talebine izin verilir",
    "One withdrawal request is allowed every 24 hours"
  ],
  "لازم تتأكد إن عنوان المحفظة والشبكة يلي بتزوّدنا فيهم صحيحين — إحنا مو مسؤولين عن أي خسارة بسبب عنوان أو شبكة غلط منك": [
    "Verdiğin cüzdan adresinin ve ağın doğru olduğundan emin olmalısın — senin hatalı adres veya ağ girmenden kaynaklanan kayıplardan sorumlu değiliz",
    "Make sure the wallet address and network you provide are correct — we are not responsible for any loss caused by a wrong address or network on your side"
  ],
  "طلبات السحب بتتم مراجعتها وإرسالها يدوياً خلال 24 ساعة": [
    "Çekim talepleri 24 saat içinde manuel olarak incelenir ve gönderilir",
    "Withdrawal requests are reviewed and sent manually within 24 hours"
  ],
  "5. إخلاء مسؤولية مهم": [
    "5. Önemli sorumluluk reddi",
    "5. Important disclaimer"
  ],
  "قيمة العملات المشفرة (BTC/ETH) متقلبة وبتتغير باستمرار. القيمة بالدولار يلي بتشوفها داخل اللعبة تقريبية وبتُحدَّث يدوياً من طرفنا — مو سعر سوق لحظي. إحنا ما نضمن أي ربح، وما نتحمل مسؤولية أي خسارة ناتجة عن تقلب الأسعار أو تأخير بالتحديث.": [
    "Kripto paraların (BTC/ETH) değeri dalgalıdır ve sürekli değişir. Oyunda gördüğün dolar değeri yaklaşıktır ve tarafımızdan manuel olarak güncellenir — anlık piyasa fiyatı değildir. Hiçbir kazanç garanti etmeyiz ve fiyat dalgalanmaları ya da güncelleme gecikmelerinden doğan kayıplardan sorumlu değiliz.",
    "The value of cryptocurrencies (BTC/ETH) is volatile and changes constantly. The dollar value you see in the game is approximate and updated manually by us — it is not a live market price. We don't guarantee any profit and are not liable for any loss caused by price swings or update delays."
  ],
  "6. الاستخدام المحظور": [
    "6. Yasaklı kullanım",
    "6. Prohibited use"
  ],
  "استغلال ثغرات تقنية بالتطبيق للحصول على نقاط أو رصيد بشكل غير مشروع": [
    "Haksız yere puan veya bakiye elde etmek için uygulamadaki teknik açıkları istismar etmek",
    "Exploiting technical bugs in the app to obtain points or balance illegitimately"
  ],
  "استخدام برامج آلية (bots) لمشاهدة الإعلانات أو إكمال المهام": [
    "Reklam izlemek veya görev tamamlamak için otomatik programlar (bot) kullanmak",
    "Using automated programs (bots) to watch ads or complete tasks"
  ],
  "تقديم إثباتات دفع مزوّرة": [
    "Sahte ödeme dekontu sunmak",
    "Submitting fake payment receipts"
  ],
  "أي محاولة اختراق أو تعطيل للتطبيق أو قاعدة البيانات": [
    "Uygulamayı veya veritabanını hacklemeye ya da bozmaya yönelik her türlü girişim",
    "Any attempt to hack or disrupt the app or the database"
  ],
  "مخالفة أي من هاي البنود بتعرّض حسابك للإيقاف الدائم وإلغاء أي رصيد فيه.": [
    "Bu maddelerden herhangi birinin ihlali, hesabının kalıcı olarak kapatılmasına ve içindeki tüm bakiyenin iptaline yol açar.",
    "Violating any of these terms may lead to permanent suspension of your account and cancellation of any balance in it."
  ],
  "7. التعديلات على اللعبة": [
    "7. Oyundaki değişiklikler",
    "7. Changes to the game"
  ],
  "نحتفظ بحقنا نعدّل أسعار الباقات، معدلات إنتاج العمال، طرق الدفع، أو أي جزء من اقتصاد اللعبة بأي وقت، بهدف تحسين الخدمة أو الحفاظ على استدامتها.": [
    "Hizmeti iyileştirmek veya sürdürülebilirliğini korumak amacıyla paket fiyatlarını, işçi üretim oranlarını, ödeme yöntemlerini veya oyun ekonomisinin herhangi bir bölümünü istediğimiz zaman değiştirme hakkımızı saklı tutarız.",
    "We reserve the right to change package prices, worker production rates, payment methods or any part of the game economy at any time, to improve the service or keep it sustainable."
  ],
  "8. إنهاء الخدمة": [
    "8. Hizmetin sona erdirilmesi",
    "8. Termination"
  ],
  "نقدر نوقف أو نحذف أي حساب يخالف هاي الشروط، بدون إشعار مسبق بحالات الاحتيال أو إساءة الاستخدام الواضحة.": [
    "Bu şartları ihlal eden herhangi bir hesabı, açık dolandırıcılık veya kötüye kullanım durumlarında önceden bildirimde bulunmadan askıya alabilir veya silebiliriz.",
    "We may suspend or delete any account that violates these terms, without prior notice in clear cases of fraud or abuse."
  ],
  "9. تواصل معنا": [
    "9. Bize ulaşın",
    "9. Contact us"
  ]
};

  const PATTERNS = [
  [
    "تعذّر تسجيل الدخول: {0}",
    "Giriş yapılamadı: {0}",
    "Sign-in failed: {0}"
  ],
  [
    "تعذّر إرسال الطلب: {0}",
    "Talep gönderilemedi: {0}",
    "Couldn't send request: {0}"
  ],
  [
    "{0} نقطة",
    "{0} puan",
    "{0} points"
  ],
  [
    "{0} ل.س",
    "{0} SYP",
    "{0} SYP"
  ],
  [
    "شبكة {0}",
    "{0} ağı",
    "{0} network"
  ],
  [
    "عنوان USDT — {0}",
    "USDT adresi — {0}",
    "USDT address — {0}"
  ]
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

  const ORIGINAL_TITLE = document.title;
  function translateTitle(){ document.title = translate(ORIGINAL_TITLE); }

  window.I18N = {
    t: translate,
    // ترجمات ديناميكية (مثلاً طرق الدفع من الأدمن): {نص_عربي: [تركي, إنجليزي]}
    addEntries(map){
      Object.keys(map || {}).forEach(k => {
        const v = map[k];
        if(k && Array.isArray(v) && (v[0] || v[1])) EXACT[k.replace(/\s+/g, " ").trim()] = [v[0] || k, v[1] || k];
      });
      translateTree(document.body);
    },
    get lang(){ return lang; },
    langs: LANGS,
    setLang(l){
      if(!LANGS[l]) return;
      lang = l;
      try{ localStorage.setItem("lang", l); }catch(e){}
      applyDirection();
      translateTitle();
      translateTree(document.body);
      renderSwitcher();
      document.dispatchEvent(new CustomEvent("langchange", { detail: l }));
    },
  };

  // الرسائل المنبثقة كمان بتتترجم
  const origAlert = window.alert.bind(window);
  window.alert = (msg) => origAlert(translate(String(msg)));

  // شريط اختيار اللغة أعلى الصفحة
  function renderSwitcher(){
    let bar = document.getElementById("langSwitch");
    if(!bar){
      bar = document.createElement("div");
      bar.id = "langSwitch";
      bar.setAttribute("translate", "no");
      bar.style.cssText = "position:fixed; top:10px; left:10px; z-index:50; display:flex; gap:4px; background:#1F1B14ee; border:1px solid #332C1F; border-radius:20px; padding:4px; font-family:'Cairo',sans-serif;";
      document.body.appendChild(bar);
    }
    bar.innerHTML = Object.keys(LANGS).map(l =>
      `<button data-l="${l}" style="border:none; cursor:pointer; border-radius:16px; padding:3px 10px; font-size:12px; font-family:inherit; font-weight:700; background:${l === lang ? '#E3A83B' : 'transparent'}; color:${l === lang ? '#2a1a08' : '#EFE6D2'};">${l === 'ar' ? 'ع' : l.toUpperCase()}</button>`
    ).join("");
    bar.querySelectorAll("button").forEach(b => b.onclick = () => window.I18N.setLang(b.dataset.l));
  }

  applyDirection();
  document.addEventListener("DOMContentLoaded", () => {
    translateTitle();
    renderSwitcher();
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
