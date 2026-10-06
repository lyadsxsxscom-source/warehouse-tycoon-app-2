# صفحة Cratelo (cratelo.ly-ad.de)

- المصدر: `tools/site_build.py` بيولّد مجلد `site/` (3 لغات + sitemap + robots + أيقونات + صورة المشاركة).
- بعد أي تعديل بالنصوص: `python3 tools/site_build.py` ثم commit.
- النشر: Cloudflare Pages، مربوط بالمستودع، Build output directory = `site`، بدون build command.
- تعديلات `site/` و`tools/` ما بتعمل بناء APK (مستثناة بالـworkflow).
