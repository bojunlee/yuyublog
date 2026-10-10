// 量 Hero 文字後面的背景亮度，算出白字的最差對比：node scripts/hero-contrast.mjs [網址]
import { chromium, webkit, devices } from "@playwright/test";
import { PNG } from "pngjs";
const base = process.argv[2] || "http://127.0.0.1:5520/";
const lum = (r, g, b) => { const f = v => (v /= 255) <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
const sel = { "標題": ".hero__title", "標語": ".hero__tagline", "小標": ".hero__kicker", "手寫小語": ".hero__note", "數字列": ".hero__strip" };
for (const [label, type, opts] of [["桌機", chromium, { viewport: { width: 1440, height: 900 } }], ["iPhone", webkit, devices["iPhone 14"]]]) {
  const b = await type.launch(); const ctx = await b.newContext(opts);
  await ctx.route("**/assets/js/config.js", r => r.fulfill({ contentType: "text/javascript", body: 'export default { supabaseUrl: "", supabaseAnonKey: "" };' }));
  const p = await ctx.newPage(); await p.goto(base, { waitUntil: "networkidle" }); await p.waitForTimeout(2500);
  const boxes = {}; for (const [k, s] of Object.entries(sel)) { const el = p.locator(s).first(); if (await el.isVisible()) boxes[k] = await el.boundingBox(); }
  await p.addStyleTag({ content: ".hero__inner, .site-header, .demo-ribbon, .hero__credit { visibility: hidden !important }" });
  const png = PNG.sync.read(await p.screenshot({ scale: "css" }));     // 只留背景（含暗色遮罩）
  const out = [];
  for (const [k, bx] of Object.entries(boxes)) {
    const ls = [];
    for (let y = Math.max(0, bx.y | 0); y < Math.min(png.height, (bx.y + bx.height) | 0); y += 3)
      for (let x = Math.max(0, bx.x | 0); x < Math.min(png.width, (bx.x + bx.width) | 0); x += 3) { const i = (y * png.width + x) * 4; ls.push(lum(png.data[i], png.data[i + 1], png.data[i + 2])); }
    ls.sort((a, c) => a - c); const p90 = ls[Math.floor(ls.length * .9)], max = ls[ls.length - 1];
    const cr = l => (1.05 / (l + .05)).toFixed(1);
    out.push(`${k}: 較亮處(90%)對比 ${cr(p90)}:1，最亮處 ${cr(max)}:1`);
  }
  console.log(`\n${label}\n  ` + out.join("\n  ")); await b.close();
}
