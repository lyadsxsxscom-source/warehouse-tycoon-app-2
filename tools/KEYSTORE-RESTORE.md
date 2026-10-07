# استرجاع نسخة مفتاح التوقيع

الملف: `yardova-keystore-backup.enc` (مشفّر AES-256). تحتاج كلمة السر يلي حطيتها بالسر `KEYSTORE_BACKUP_PASSPHRASE` وقت النسخ.

## من الكمبيوتر (Linux أو Mac أو WSL أو Termux)

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in yardova-keystore-backup.enc -out bundle.tar.gz
tar -xzf bundle.tar.gz
```

بتطلع عندك ملفين:
- `release.keystore`: مفتاح التوقيع نفسه
- `credentials.txt`: كلمة سر المفتاح والاسم المستعار (alias) والبصمات

## بعد الاسترجاع (لو ضاع السر من GitHub)
1. `base64 -w0 release.keystore` (على Mac: `base64 -i release.keystore`) وانسخ الناتج.
2. بمستودع GitHub: Settings > Secrets and variables > Actions، حدّث:
   - `RELEASE_KEYSTORE_BASE64` = الناتج
   - `RELEASE_KEYSTORE_PASSWORD` = من credentials.txt
   - `RELEASE_KEY_ALIAS` = من credentials.txt
3. تأكد إنه SHA-256 للشهادة بـcredentials.txt هو `D3:3E:3B:80:BE:09:96:1F:EA:26:BE:D0:88:2D:C5:44:3C:98:F8:E9:D0:77:12:B9:29:40:76:2C:B3:41:04:81`.

## مهم
- احفظ كلمة سر النسخة بمكانين على الأقل (ورقة + ملاحظات/مدير كلمات سر). بدونها النسخة ما بتنفتح.
- احفظ النسخة المشفّرة بمكانين مختلفين (إيميل + Drive أو فلاشة).
