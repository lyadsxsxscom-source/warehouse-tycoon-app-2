# يولّد أيقونة التطبيق وشاشة البداية وأيقونات الإشعارات داخل resources/
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import brand_icon as B
R = os.path.join(os.path.dirname(__file__), "..", "resources")
B.full_icon(1024).save(os.path.join(R, "icon.png"), optimize=True)
B.foreground(1024).save(os.path.join(R, "icon-foreground.png"), optimize=True)
B.corrugation(1024).save(os.path.join(R, "icon-background.png"), optimize=True)
B.full_icon(512).convert("RGBA").save(os.path.join(R, "icon-512-playstore.png"), optimize=True)
B.splash(2732).save(os.path.join(R, "splash.png"), optimize=True)
B.full_icon(256).save(os.path.join(R, "notif", "ic_notif_large.png"), optimize=True)
B.stat_icon(96).save(os.path.join(R, "notif", "ic_stat_notify.png"), optimize=True)
print("app icons written")
