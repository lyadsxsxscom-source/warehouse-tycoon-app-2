// اختبار قراءة الصفحة العامة للمتجر: التباين (WCAG) بالوضع الفاتح والداكن، والخط، وأحجام الكتابة
// التشغيل: node tools/tests/store_contrast.test.js
const fs = require("fs"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok:", m); };
const html = fs.readFileSync(path.join(__dirname, "../../site/store/index.html"), "utf8");
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const vars = (block) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2]]));
const light = vars(css.match(/:root\{([\s\S]*?)\n\}/)[1]);
const dark = { ...light, ...vars(css.match(/prefers-color-scheme: dark\)\{\s*:root\{([\s\S]*?)\}\s*\}/)[1]) };
const lum = (hex) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
for (const [mode, v] of [["light", light], ["dark", dark]]) {
  const chk = (fg, bg, min, what) => { const r = ratio(v[fg], v[bg]); ok(r >= min, `${mode}: ${what} (${v[fg]} on ${v[bg]}) contrast ${r.toFixed(1)} >= ${min}`); };
  chk("ink", "paper", 7, "main text on the page"); chk("ink", "panel", 7, "text on cards and the title box"); chk("ink", "pic", 4.5, "text over picture area");
  chk("muted", "paper", 4.5, "secondary text on the page"); chk("muted", "panel", 4.5, "secondary text on cards");
  chk("link", "paper", 4.5, "links and path");
  chk("edge", "paper", 3, "card borders against the page"); chk("edge", "panel", 3, "card borders against the card");
}
const fixed = (fg, bg, min, what) => { const r = ratio(fg, bg); ok(r >= min, `${what} (${fg} on ${bg}) contrast ${r.toFixed(1)} >= ${min}`); };
fixed("#10211C", light.tape || "#F4C21F", 7, "price badge and selected button (dark text on yellow)");
fixed("#F4F8F5", light["teal-d"], 7, "header text on the dark green bar");
fixed("#8FC2B3", light["teal-d"], 3, "'back to the site' button border");
fixed("#8FC2B3", light["teal-d"], 3, "menu button border");
fixed("#10211C", light.tape || "#F4C21F", 7, "VIP badge and the sign-in button (dark text on yellow)");
fixed("#F4F8F5", "#113F35", 7, "the 'Yardova Card' badge text on the badge (dark translucent, blended over the lightest part of the frame gradient)");
ok(/\.card \.pic \.brand\{[^}]*font-family:var\(--f-stencil\)/.test(css) && /background:radial-gradient\([^)]*#1F7A68/.test(css) && /\.card \.pic \.brand\{[^}]*flex:0 0 22px/.test(css), "the frame uses the brand colours, the stencil brand font, and a 22px strip beside the picture");
ok(!/Reem|Kufi/.test(html), "the decorative display font is not used any more");
ok(/--f-text:"IBM Plex Sans Arabic"/.test(css) && /\.card \.nm\{font-family:var\(--f-text\)/.test(css) && /\.tag h1\{font-family:var\(--f-stencil\)/.test(css) && /<h1 dir="ltr">Yardova Card<\/h1>/.test(html), "product names use the readable Arabic font; the title is the Latin brand name 'Yardova Card' in the brand font");
ok(/IBM\+Plex\+Sans\+Arabic:wght@400;600;700/.test(html), "the bold weight of the readable font is loaded");
const px = (re, unit = "rem") => parseFloat((css.match(re) || [])[1]);
ok(parseFloat(css.match(/body\{[^}]*font-size:(\d+)px/)[1]) >= 18, "body text is at least 18px");
ok(px(/\.card \.nm\{[^}]*font-size:([\d.]+)rem/) >= 1.1 && px(/\.crumbs\{[^}]*font-size:([\d.]+)rem/) >= 1 && px(/\.card \.pr small\{[^}]*font-size:([\d.]+)rem/) >= 0.8 && px(/footer\{[^}]*font-size:([\d.]+)rem/) >= 1, "names, the path, small prices and the footer are not tiny");
ok(/border:3px solid var\(--edge\)/.test(css) && /box-shadow:5px 5px 0 var\(--shadow\)/.test(css), "cards have a clear border and shadow in both modes");
console.log(fails ? "FAILS " + fails : "ALL PASSED"); process.exit(fails ? 1 : 0);
