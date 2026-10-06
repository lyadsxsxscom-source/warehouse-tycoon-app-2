# هوية Yardova: صندوق أصفر بحرف Y على جدار حاوية خضراء (يُستخدم للتطبيق والموقع)
from PIL import Image, ImageDraw, ImageFont
TEAL, TEAL_D, YEL, INK = (0x17, 0x56, 0x4A), (0x0F, 0x3B, 0x33), (0xF4, 0xC2, 0x1F), (0x10, 0x21, 0x1C)
POP = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
SS = 2  # تنعيم الحواف (رسم بحجم مضاعف ثم تصغير)

def corrugation(size):
    im = Image.new("RGB", (size, size), TEAL); d = ImageDraw.Draw(im); step = max(4, round(size * 26 / 512)); w = max(1, round(size * 3 / 512))
    for x in range(0, size, step): d.line((x, 0, x, size), fill=TEAL_D, width=w)
    return im

def crate(size, width_frac, fg=None):
    """يرجّع صورة RGBA بحجم size فيها الصندوق بالنص بعرض width_frac من العرض (خلفية شفافة)."""
    S = size * SS; im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cw = S * width_frac; ch = cw * 288 / 336
    L, R = (S - cw) / 2, (S + cw) / 2; T, B = (S - ch) / 2, (S + ch) / 2
    k = cw / 336  # مقياس نسبةً للتصميم الأصلي (512)
    d.rectangle((L, T, R, B), fill=YEL, outline=INK, width=max(2, round(16 * k)))
    for y in (T + 44 * k, B - 44 * k): d.line((L, y, R, y), fill=INK, width=max(2, round(10 * k)))
    f = ImageFont.truetype(POP, round(190 * k)); bb = d.textbbox((0, 0), "Y", font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((L + R) / 2 - w / 2 - bb[0], (T + B) / 2 - h / 2 - bb[1]), "Y", font=f, fill=INK)
    return im.resize((size, size), Image.LANCZOS)

def full_icon(size, width_frac=0.656):
    im = corrugation(size).convert("RGBA"); im.alpha_composite(crate(size, width_frac)); return im.convert("RGB")

def foreground(size, width_frac=0.60):  # للأيقونة التكيّفية: داخل المنطقة الآمنة (66%)
    return crate(size, width_frac)

def splash(size=2732, width_frac=0.30):
    im = corrugation(size).convert("RGBA"); im.alpha_composite(crate(size, width_frac)); return im.convert("RGB")

def stat_icon(size=96):  # أيقونة شريط الإشعارات: صندوق أبيض (الحرف والألواح مقصوصة)
    S = size * 4; m = Image.new("L", (S, S), 0); d = ImageDraw.Draw(m)
    L, T, R, B = S * 0.08, S * 0.18, S * 0.92, S * 0.82
    d.rounded_rectangle((L, T, R, B), radius=S * 0.05, fill=255)
    for y in (T + (B - T) * 0.22, B - (B - T) * 0.22): d.line((L, y, R, y), fill=0, width=round(S * 0.035))
    f = ImageFont.truetype(POP, round(S * 0.40)); bb = d.textbbox((0, 0), "Y", font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((L + R) / 2 - w / 2 - bb[0], (T + B) / 2 - h / 2 - bb[1]), "Y", font=f, fill=0)
    m = m.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (255, 255, 255, 0)); out.putalpha(m); return out
