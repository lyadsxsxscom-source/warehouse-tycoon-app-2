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
