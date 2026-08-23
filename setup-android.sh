#!/bin/bash
# يشتغل بعد "npx cap add android" مباشرة، يجهّز ملفات جوجل الخاصة بأندرويد
set -e

# 1) نسخ google-services.json (لازم يكون موجود بجذر المشروع، حمّلناه من Firebase)
if [ -f "google-services.json" ]; then
  cp google-services.json android/app/google-services.json
  echo "✓ google-services.json نُسخ"
else
  echo "⚠ google-services.json غير موجود بجذر المشروع — تسجيل الدخول ما راح يشتغل بدونه"
fi

# 2) نسخ الـ keystore الثابت (بدل واحد عشوائي يتغيّر كل بناء)
cp debug.keystore android/app/debug.keystore
echo "✓ debug.keystore نُسخ"

# 3) إضافة Google Services Gradle plugin لملف android/build.gradle
if ! grep -q "com.google.gms:google-services" android/build.gradle; then
  sed -i "/dependencies {/a\\        classpath 'com.google.gms:google-services:4.4.2'" android/build.gradle
  echo "✓ classpath أُضيف لـ android/build.gradle"
fi

# 4) تفعيل الـ plugin بملف android/app/build.gradle
if ! grep -q "com.google.gms.google-services" android/app/build.gradle; then
  echo "apply plugin: 'com.google.gms.google-services'" >> android/app/build.gradle
  echo "✓ plugin فُعّل بـ android/app/build.gradle"
fi

# 5) ربط signingConfig الديبج بالـ keystore الثابت (بدل الافتراضي العشوائي بكل بيئة)
if ! grep -q "signingConfigs" android/app/build.gradle; then
  sed -i "/android {/a\\    signingConfigs {\\n        debug {\\n            storeFile file('debug.keystore')\\n            storePassword 'android'\\n            keyAlias 'androiddebugkey'\\n            keyPassword 'android'\\n        }\\n    }" android/app/build.gradle
  sed -i "/buildTypes {/,/debug {/{/debug {/a\\            signingConfig signingConfigs.debug
  }" android/app/build.gradle
  echo "✓ signingConfig مربوط بالـ keystore الثابت"
fi

echo "تجهيز android/ خلص بنجاح."
