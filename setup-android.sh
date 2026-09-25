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
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import com.unity3d.services.banners.BannerView;
import com.unity3d.services.banners.UnityBannerSize;
import com.unity3d.services.banners.BannerErrorInfo;

@CapacitorPlugin(name = "UnityAdsPlugin")
public class UnityAdsPlugin extends Plugin {
    private boolean adReady = false;
    private String currentAdUnitId = null;
    private BannerView bannerView = null;

    @PluginMethod
    public void showBanner(PluginCall call) {
        final String placementId = call.getString("placementId", "Banner_Android");
        final int bottomOffset = call.getInt("bottomOffset", 0);
        getActivity().runOnUiThread(() -> {
            try {
                float density = getContext().getResources().getDisplayMetrics().density;
                if (bannerView == null) {
                    bannerView = new BannerView(getActivity(), placementId, new UnityBannerSize(320, 50));
                    // بدون @Override عمداً: حتى يترجم الكود مع أي إصدار 4.x من Unity Ads
                    bannerView.setListener(new BannerView.IListener() {
                        public void onBannerLoaded(BannerView v) { sendBannerEvent("loaded", ""); }
                        public void onBannerShown(BannerView v) { sendBannerEvent("shown", ""); }
                        public void onBannerClick(BannerView v) {}
                        public void onBannerFailedToLoad(BannerView v, BannerErrorInfo err) {
                            sendBannerEvent("failed", err != null ? (err.errorCode + ": " + err.errorMessage) : "unknown");
                        }
                        public void onBannerLeftApplication(BannerView v) {}
                    });
                    FrameLayout.LayoutParams newLp = new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                        Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
                    ViewGroup root = getActivity().findViewById(android.R.id.content);
                    root.addView(bannerView, newLp);
                    bannerView.load();
                }
                FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) bannerView.getLayoutParams();
                lp.bottomMargin = Math.round(bottomOffset * density);
                bannerView.setLayoutParams(lp);
                bannerView.setVisibility(View.VISIBLE);
                bannerView.bringToFront();
                call.resolve();
            } catch (Exception e) {
                call.reject("banner_failed: " + e.getMessage());
            }
        });
    }

    private void sendBannerEvent(String status, String message) {
        JSObject data = new JSObject();
        data.put("status", status);
        data.put("message", message);
        notifyListeners("bannerEvent", data);
    }

    @PluginMethod
    public void hideBanner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (bannerView != null) bannerView.setVisibility(View.GONE);
            call.resolve();
        });
    }

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

# 9) إضافة مكتبة AdGem SDK (v4.0.3 — متوافقة مع compileSdk 34 الحالي، لا تحتاج ترقية أدوات البناء)
if ! grep -q "com.adgem:adgem-android" android/app/build.gradle; then
  sed -i "/dependencies {/a\\    implementation 'com.adgem:adgem-android:4.0.3'" android/app/build.gradle
  echo "✓ أضيفت مكتبة AdGem SDK"
fi

# 10) كتابة بلجن Capacitor مخصص لجدار عروض AdGem
cat > android/app/src/main/java/com/warehousetycoon/app/AdGemPlugin.java << 'EOF'
package com.warehousetycoon.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.adgem.android.AdGem;
import com.adgem.android.OfferwallCallback;
import com.adgem.android.PlayerMetadata;

@CapacitorPlugin(name = "AdGemPlugin")
public class AdGemPlugin extends Plugin {
    private OfferwallCallback callback;

    @PluginMethod
    public void initialize(PluginCall call) {
        callback = new OfferwallCallback() {
            @Override public void onOfferwallLoadingStarted() {}
            @Override public void onOfferwallLoadingFinished() {}
            @Override public void onOfferwallLoadingFailed(String error) {
                JSObject ret = new JSObject();
                ret.put("error", error);
                notifyListeners("offerwallFailed", ret);
            }
            @Override public void onOfferwallRewardReceived(int amount) {
                JSObject ret = new JSObject();
                ret.put("amount", amount);
                notifyListeners("offerwallReward", ret);
            }
            @Override public void onOfferwallClosed() {
                notifyListeners("offerwallClosed", new JSObject());
            }
        };
        AdGem.get().registerOfferwallCallback(callback);
        call.resolve();
    }

    @PluginMethod
    public void setPlayerId(PluginCall call) {
        String playerId = call.getString("playerId");
        PlayerMetadata player = PlayerMetadata.Builder.createWithPlayerId(playerId).build();
        AdGem.get().setPlayerMetaData(player);
        call.resolve();
    }

    @PluginMethod
    public void showOfferwall(PluginCall call) {
        getActivity().runOnUiThread(() -> AdGem.get().showOfferwall(getActivity()));
        call.resolve();
    }
}
EOF
echo "✓ AdGemPlugin.java تمت كتابته"

# 10.5) كتابة بلجن Capacitor مخصص لكشف VPN نشط (منع فتح جدار المهام تحت VPN لتجنّب حظر الحسابات)
cat > android/app/src/main/java/com/warehousetycoon/app/NetworkCheckPlugin.java << 'EOF'
package com.warehousetycoon.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NetworkCheckPlugin")
public class NetworkCheckPlugin extends Plugin {
    @PluginMethod
    public void isVpnActive(PluginCall call) {
        boolean vpnActive = false;
        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                Network activeNetwork = cm.getActiveNetwork();
                if (activeNetwork != null) {
                    NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
                    if (caps != null) {
                        vpnActive = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
                    }
                }
            }
        } catch (Exception e) {
            vpnActive = false;
        }
        JSObject ret = new JSObject();
        ret.put("vpnActive", vpnActive);
        call.resolve(ret);
    }
}
EOF
echo "✓ NetworkCheckPlugin.java تمت كتابته"

# 11) ملف إعدادات AdGem XML (يحدد App ID وسلوك جدار العروض)
mkdir -p android/app/src/main/res/xml
cat > android/app/src/main/res/xml/adgem_config.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adgem-configuration
    applicationId="33472"
    offerwallEnabled="true"
    lockOrientation="false" />
EOF
echo "✓ adgem_config.xml تمت كتابته"

# 12) تسجيل ملف الإعدادات بـAndroidManifest.xml (نحطه قبل </application> مباشرة، مكان آمن دايماً)
if ! grep -q "com.adgem.Config" android/app/src/main/AndroidManifest.xml; then
  sed -i '\|</application>|i\        <meta-data android:name="com.adgem.Config" android:resource="@xml/adgem_config" />' android/app/src/main/AndroidManifest.xml
  echo "✓ AndroidManifest.xml عُدّل"
fi

# 13) تسجيل البلجنز جوّا MainActivity.java (Unity Ads + AdGem)
cat > android/app/src/main/java/com/warehousetycoon/app/MainActivity.java << 'EOF'
package com.warehousetycoon.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UnityAdsPlugin.class);
        registerPlugin(AdGemPlugin.class);
        registerPlugin(NetworkCheckPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
EOF
echo "✓ MainActivity.java عُدّل لتسجيل UnityAdsPlugin وAdGemPlugin وNetworkCheckPlugin"

# 14) تعطيل النسخ الاحتياطي التلقائي لأندرويد (Auto Backup) — لمنع استرجاع جلسة تسجيل دخول من جهاز آخر
# مرتبط بنفس حساب Google على مستوى النظام، وتسريب حساب مستخدم لحساب آخر على جهاز مختلف
if grep -q 'android:allowBackup="true"' android/app/src/main/AndroidManifest.xml; then
  sed -i 's/android:allowBackup="true"/android:allowBackup="false"/' android/app/src/main/AndroidManifest.xml
else
  sed -i '\|<application|a\        android:allowBackup="false"' android/app/src/main/AndroidManifest.xml
fi
echo "✓ android:allowBackup تم تعطيله"
