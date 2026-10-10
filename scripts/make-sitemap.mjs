// 產生 sitemap.xml（固定頁面 + 所有已發布文章），讓搜尋引擎更快找到新文章
// 用法：node scripts/make-sitemap.mjs https://yourname.github.io/yuyublog/
// 會讀取 assets/js/config.js 的 Supabase 網址與公開 anon key（只讀已發布文章）
import fs from "node:fs";
import config from "../assets/js/config.js";

const site = (process.argv[2] || "").replace(/\/?$/, "/");
if (!/^https:\/\//.test(site)) {
  console.error("請提供網站網址，例如：node scripts/make-sitemap.mjs https://yourname.github.io/yuyublog/");
  process.exit(1);
}
const urls = ["", "posts.html", "footprints.html", "about.html"].map(p => ({ loc: site + p }));
if (config.supabaseUrl && config.supabaseAnonKey) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/posts?select=id,updated_at&status=eq.published&order=published_at.desc`, {
    headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` }
  });
  if (!res.ok) { console.error("讀取文章失敗：", res.status, await res.text()); process.exit(1); }
  for (const p of await res.json()) urls.push({ loc: `${site}post.html?id=${p.id}`, lastmod: p.updated_at.slice(0, 10) });
} else {
  console.warn("config.js 尚未設定 Supabase，只輸出固定頁面。");
}
const esc = s => s.replace(/&/g, "&amp;");
fs.writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`);
console.log(`sitemap.xml 已產生，共 ${urls.length} 個網址。記得把 robots.txt 最後一行改成：Sitemap: ${site}sitemap.xml`);
