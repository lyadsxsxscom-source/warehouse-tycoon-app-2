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

# 6) إضافة مكتبات Credential Manager (سبب الانهيار الفوري بدونها)
if ! grep -q "androidx.credentials:credentials" android/app/build.gradle; then
  sed -i "/dependencies {/a\\    implementation 'androidx.credentials:credentials:1.2.2'\\n    implementation 'androidx.credentials:credentials-play-services-auth:1.2.2'\\n    implementation 'com.google.android.libraries.identity.googleid:googleid:1.1.1'\\n    implementation 'com.google.android.gms:play-services-auth:21.2.0'" android/app/build.gradle
  echo "✓ مكتبات Credential Manager أُضيفت"
fi

# 7) إضافة Unity Ads SDK مباشرة (بدون LevelPlay) لملف android/app/build.gradle
if ! grep -q "com.unity3d.ads:unity-ads" android/app/build.gradle; then
  sed -i "/dependencies {/a\\    implementation 'com.unity3d.ads:unity-ads:4.+'" android/app/build.gradle
  echo "✓ أضيفت مكتبة Unity Ads SDK"
fi

# 8) كتابة بلجن Capacitor مخصص لعرض إعلانات Unity Ads
mkdir -p android/app/src/main/java/com/warehousetycoon/app
cat > android/app/src/main/java/com/warehousetycoon/app/UnityAdsPlugin.java << 'EOF'
package com.warehousetycoon.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.unity3d.ads.IUnityAdsInitializationListener;
import com.unity3d.ads.IUnityAdsLoadListener;
import com.unity3d.ads.IUnityAdsShowListener;
import com.unity3d.ads.UnityAds;
import com.unity3d.ads.UnityAdsShowOptions;

@CapacitorPlugin(name = "UnityAdsPlugin")
public class UnityAdsPlugin extends Plugin {
    private boolean adReady = false;
    private String currentAdUnitId = null;

    @PluginMethod
    public void initialize(PluginCall call) {
        String gameId = call.getString("gameId");
        boolean testMode = Boolean.TRUE.equals(call.getBoolean("testMode", true));
        UnityAds.initialize(getContext(), gameId, testMode, new IUnityAdsInitializationListener() {
            @Override
            public void onInitializationComplete() { call.resolve(); }
            @Override
            public void onInitializationFailed(UnityAds.UnityAdsInitializationError error, String message) {
                call.reject("init_failed: " + message);
            }
        });
    }

    @PluginMethod
    public void load(PluginCall call) {
        String adUnitId = call.getString("adUnitId");
        currentAdUnitId = adUnitId;
        UnityAds.load(adUnitId, new IUnityAdsLoadListener() {
            @Override
            public void onUnityAdsAdLoaded(String placementId) {
                adReady = true;
                call.resolve();
            }
            @Override
            public void onUnityAdsFailedToLoad(String placementId, UnityAds.UnityAdsLoadError error, String message) {
                adReady = false;
                call.reject("load_failed: " + message);
            }
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (!adReady || currentAdUnitId == null) { call.reject("ad_not_ready"); return; }
        UnityAds.show(getActivity(), currentAdUnitId, new UnityAdsShowOptions(), new IUnityAdsShowListener() {
            @Override
            public void onUnityAdsShowFailure(String placementId, UnityAds.UnityAdsShowError error, String message) {
                adReady = false; call.reject("show_failed: " + message);
            }
            @Override
            public void onUnityAdsShowStart(String placementId) {}
            @Override
            public void onUnityAdsShowClick(String placementId) {}
            @Override
            public void onUnityAdsShowComplete(String placementId, UnityAds.UnityAdsShowCompletionState state) {
                adReady = false;
                JSObject ret = new JSObject();
                ret.put("completed", state == UnityAds.UnityAdsShowCompletionState.COMPLETED);
                call.resolve(ret);
            }
        });
    }
}
EOF
echo "✓ UnityAdsPlugin.java تمت كتابته"

# 9) تسجيل البلجن جوّا MainActivity.java
cat > android/app/src/main/java/com/warehousetycoon/app/MainActivity.java << 'EOF'
package com.warehousetycoon.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UnityAdsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
EOF
echo "✓ MainActivity.java عُدّل لتسجيل UnityAdsPlugin"
