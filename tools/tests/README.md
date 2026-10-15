# اختبارات Yardova
الاختبارات هون (جوّا `tools/` عشان ما تشغّل بناء التطبيق عند كل رفع).
- التشغيل: `npm i jsdom` بمجلد منفصل، ثم من جذر المستودع:
  - `node tools/tests/phase1_worker.test.js`
  - `NODE_PATH=<مجلد node_modules> node tools/tests/phase1_admin.test.js`
  - `NODE_PATH=<مجلد node_modules> node tools/tests/phase1_site.test.js`
