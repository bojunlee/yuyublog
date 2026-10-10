// 找出手機上「很短的文字卻換行」的元素：node scripts/find-wraps.mjs [網址] [寬度]
import { webkit, devices } from "@playwright/test";
const base = process.argv[2] || "http://127.0.0.1:5520";
const width = Number(process.argv[3] || 390);
const pages = ["/", "/posts.html", "/post.html?id=demo-santorini", "/footprints.html", "/about.html"];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices["iPhone 14"], viewport: { width, height: 844 } });
await ctx.route("**/assets/js/config.js", r => r.fulfill({ contentType: "text/javascript", body: 'export default { supabaseUrl: "", supabaseAnonKey: "" };' }));
for (const p of pages) {
  const page = await ctx.newPage();
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelectorAll(".reveal").forEach(e => e.classList.add("is-in")));
  await page.waitForTimeout(600);
  const found = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest("svg, .demo-ribbon, .mobile-nav, script, style")) continue;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())) continue;
      const text = el.textContent.trim();
      const len = [...text].length;
      if (!len || len > 22 || el.children.length > 3) continue;       // 只看短文字
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
      const r = el.getBoundingClientRect();
      if (r.height > lh * 1.6 && r.width > 0) out.push(`${el.tagName}.${(el.className || "").toString().split(" ")[0]} 「${text}」 ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  });
  console.log(`\n${p}（${found.length}）`); found.slice(0, 25).forEach(x => console.log("  " + x));
  await page.close();
}
await b.close();
