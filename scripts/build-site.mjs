// 把「已發布的文章」預先產生成完整內容的靜態網頁，並更新 SEO 相關檔案。
// 為什麼需要：文章原本是瀏覽器載入後才用 JavaScript 畫出來，Google 看得到，
// 但 LINE / Facebook 的預覽、多數 AI 爬蟲不執行 JavaScript，只會看到空殼。
//
// 產生內容（只會寫入有變動的檔案，所以沒有新文章時不會產生 commit）：
//   p/<文章編號>.html   每篇文章一個靜態頁：專屬標題、說明、分享圖、結構化資料、完整內文
//   sitemap.xml         固定頁面 + 所有文章
//   llms.txt            給 AI 讀的網站摘要與文章清單
//   robots.txt          Sitemap 網址
//   index / about / posts / footprints.html   只更新 canonical、og:url 與結構化資料
//
// 用法：node scripts/build-site.mjs https://bojunlee.github.io/yuyublog/ [--out=資料夾]
//   --out  輸出到別的資料夾（測試用，不動專案檔案）
// 環境變數 SUPABASE_URL、SUPABASE_ANON_KEY 可覆蓋 config.js（測試用）

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../assets/js/config.js";
import { articleHtml } from "../assets/js/lib/article.js";
import { CATS, esc, countryName, postDate, placeLine } from "../assets/js/lib/util.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const SITE = (args.find(a => /^https?:\/\//.test(a)) || process.env.SITE || "").replace(/\/?$/, "/");
const outArg = (args.find(a => a.startsWith("--out=")) || "").slice(6);
const OUT = outArg ? path.resolve(outArg) : ROOT;
const SB_URL = process.env.SUPABASE_URL || config.supabaseUrl;
const SB_KEY = process.env.SUPABASE_ANON_KEY || config.supabaseAnonKey;

if (!/^https:\/\//.test(SITE)) { console.error("請提供網站網址，例如：node scripts/build-site.mjs https://bojunlee.github.io/yuyublog/"); process.exit(1); }
if (!SB_URL || !SB_KEY) { console.error("config.js 尚未設定 Supabase，無法讀取文章。"); process.exit(1); }

// ── 讀資料（失敗就整個停止，不會動到任何現有檔案）──────────
async function get(query) {
  const res = await fetch(`${SB_URL}/rest/v1/${query}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) { console.error(`讀取資料庫失敗：${res.status} ${await res.text()}`); process.exit(1); }
  return res.json();
}
const posts = await get("posts?select=*&status=eq.published&order=published_at.desc&limit=1000");
const [profile = {}] = await get("profile?select=*&id=eq.1");

// ── 小工具 ────────────────────────────────────────────
const urlOf = id => `${SITE}p/${id}.html`;
const plain = s => String(s || "").replace(/\[照片\s*\d+\]|[#>*]|^- /gm, "").replace(/\s+/g, " ").trim();
const clip = (s, n) => { const a = [...s]; return a.length > n ? a.slice(0, n - 1).join("") + "…" : s; };
const attr = esc;
const json = o => JSON.stringify(o).replace(/</g, "\\u003c");
const written = [];
function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return;
  fs.writeFileSync(file, content);
  written.push(rel);
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

function socialUrls(s = {}) {
  const v = k => String(s[k] || "").trim();
  const out = [];
  if (v("instagram")) out.push(v("instagram").startsWith("http") ? v("instagram") : `https://www.instagram.com/${v("instagram").replace(/^@/, "")}/`);
  if (v("threads")) out.push(v("threads").startsWith("http") ? v("threads") : `https://www.threads.net/@${v("threads").replace(/^@/, "")}`);
  if (v("facebook")) out.push(v("facebook").startsWith("http") ? v("facebook") : `https://www.facebook.com/${v("facebook")}`);
  if (v("youtube")) out.push(v("youtube").startsWith("http") ? v("youtube") : `https://www.youtube.com/@${v("youtube").replace(/^@/, "")}`);
  // 去掉分享連結常帶的追蹤參數（?xtok=…、?igsh=… 等）
  return out.filter(u => u.startsWith("https://")).map(u => { try { const x = new URL(u); x.search = ""; x.hash = ""; return x.href; } catch { return u; } });
}

const nick = profile.nickname || "魚魚";
const person = {
  "@type": "Person", "@id": `${SITE}about.html#person`, name: nick, alternateName: profile.full_name || undefined,
  description: profile.intro || undefined, url: `${SITE}about.html`,
  image: profile.avatar && profile.avatar.url ? profile.avatar.url : undefined,
  sameAs: socialUrls(profile.socials).length ? socialUrls(profile.socials) : undefined
};
const website = { "@type": "WebSite", "@id": `${SITE}#website`, name: "魚魚出去玩", alternateName: "Yuyu goes out", url: SITE, inLanguage: "zh-Hant-TW",
  description: profile.tagline || "吃美食、看風景，收集世界的溫柔。", publisher: { "@id": `${SITE}about.html#person` } };

// ── 1. 每篇文章的靜態頁 ────────────────────────────────
const tpl = read("post.html");
function postPage(p) {
  const cat = CATS[p.category] || CATS.travel;
  const url = urlOf(p.id);
  const desc = clip(plain(p.excerpt || p.body), 120);
  const image = p.cover && p.cover.url;
  const date = postDate(p);
  const where = placeLine(p);
  const ld = [
    {
      "@context": "https://schema.org", "@type": "BlogPosting", headline: clip(p.title, 110), description: desc,
      image: [image, ...(p.photos || []).map(x => x.url)].filter(Boolean).slice(0, 5),
      datePublished: p.published_at, dateModified: p.updated_at || p.published_at, inLanguage: "zh-Hant-TW",
      mainEntityOfPage: { "@type": "WebPage", "@id": url }, url,
      articleSection: cat.label, keywords: [cat.label, countryName(p.country_code), p.city].filter(Boolean).join(","),
      contentLocation: where ? { "@type": "Place", name: where } : undefined,
      author: { "@id": `${SITE}about.html#person` },
      publisher: { "@type": "Organization", name: "魚魚出去玩", logo: { "@type": "ImageObject", url: `${SITE}assets/img/icon-512.png` } }
    },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "首頁", item: SITE },
      { "@type": "ListItem", position: 2, name: "文章", item: `${SITE}posts.html` },
      { "@type": "ListItem", position: 3, name: p.title, item: url } ] },
    { "@context": "https://schema.org", ...person }
  ];
  const head = [
    `<title>${attr(p.title)}｜魚魚出去玩</title>`,
    `<meta name="description" content="${attr(desc)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="魚魚出去玩">`,
    `<meta property="og:locale" content="zh_TW">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${attr(p.title)}">`,
    `<meta property="og:description" content="${attr(desc)}">`,
    image ? `<meta property="og:image" content="${attr(image)}">` : "",
    image && p.cover.w && p.cover.h ? `<meta property="og:image:width" content="${p.cover.w}"><meta property="og:image:height" content="${p.cover.h}">` : "",
    `<meta property="article:published_time" content="${attr(p.published_at)}">`,
    `<meta property="article:modified_time" content="${attr(p.updated_at || p.published_at)}">`,
    `<meta property="article:section" content="${attr(cat.label)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${attr(p.title)}">`,
    `<meta name="twitter:description" content="${attr(desc)}">`,
    image ? `<meta name="twitter:image" content="${attr(image)}">` : "",
    `<script type="application/ld+json">${json(ld)}</script>`
  ].filter(Boolean).join("\n");

  let h = tpl;
  h = h.replace(/<title>[\s\S]*?<\/title>\n?/, "")
       .replace(/<meta name="description"[^>]*>\n?/, "")
       .replace(/<meta property="og:[^>]*>\n?/g, "")
       .replace(/<meta name="twitter:card"[^>]*>\n?/, "");
  h = h.replace(/(<meta name="viewport"[^>]*>)/, `$1\n<base href="../">`);        // 讓 CSS、JS、連結都從網站根目錄算起
  h = h.replace(/(<meta name="theme-color"[^>]*>)/, `$1\n${head}`);
  h = h.replace(/<article id="article"[\s\S]*?<\/article>/,
    `<article id="article" aria-labelledby="article-title" data-prerendered="1" data-updated="${attr(p.updated_at)}">\n${articleHtml(p)}\n</article>`);
  h = h.replace("<body>", `<body data-post-id="${attr(p.id)}">`);
  h = h.replace('href="#main"', `href="${url}#main"`);                              // 有 base 時 #main 會跑到首頁，所以用完整網址
  h = h.replace('<header id="site-header" class="site-header"></header>',
    `<header id="site-header" class="site-header"><nav aria-label="主要導覽"><a href="./">首頁</a> <a href="posts.html">文章</a> <a href="footprints.html">旅行足跡</a> <a href="about.html">關於魚魚</a></nav></header>`);
  return h;
}
for (const p of posts) write(`p/${p.id}.html`, postPage(p));

// 已取消發布或刪除的文章，移除它的靜態頁
const keep = new Set(posts.map(p => `${p.id}.html`));
const pdir = path.join(OUT, "p");
if (fs.existsSync(pdir)) for (const f of fs.readdirSync(pdir)) {
  if (f.endsWith(".html") && !keep.has(f)) { fs.unlinkSync(path.join(pdir, f)); written.push(`p/${f}（已移除）`); }
}

// ── 2. 固定頁面：canonical、og:url、結構化資料 ───────────
function stamp(file, canonical, ld) {
  let h = read(file);
  h = h.replace(/<link rel="canonical"[^>]*>\n?/g, "").replace(/<meta property="og:url"[^>]*>\n?/g, "")
       .replace(/<script type="application\/ld\+json" id="site-ld">[\s\S]*?<\/script>\n?/g, "");
  let add = `<link rel="canonical" href="${canonical}">\n<meta property="og:url" content="${canonical}">`;
  if (ld) add += `\n<script type="application/ld+json" id="site-ld">${json({ "@context": "https://schema.org", "@graph": ld })}</script>`;
  h = h.replace(/(<meta name="theme-color"[^>]*>)/, `$1\n${add}`);
  write(file, h);
}
stamp("index.html", SITE, [website, person]);
stamp("about.html", `${SITE}about.html`, [website, { "@type": "ProfilePage", "@id": `${SITE}about.html`, url: `${SITE}about.html`, name: `關於${nick}`, mainEntity: { "@id": `${SITE}about.html#person` } }, person]);
stamp("posts.html", `${SITE}posts.html`, null);
stamp("footprints.html", `${SITE}footprints.html`, null);

// ── 3. sitemap / llms.txt / robots.txt ───────────────
const urls = ["", "posts.html", "footprints.html", "about.html"].map(p => ({ loc: SITE + p }))
  .concat(posts.map(p => ({ loc: urlOf(p.id), lastmod: String(p.updated_at || p.published_at).slice(0, 10) })));
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`);

const llmsPosts = posts.map(p => `- [${p.title}](${urlOf(p.id)})${p.excerpt ? `：${clip(plain(p.excerpt), 100)}` : ""}`);
write("llms.txt", `# 魚魚出去玩

> ${profile.tagline || "吃美食、看風景，收集世界的溫柔。"}${nick}（${profile.full_name || "榆芳"}）的個人旅遊與生活網站，內容包含國內外旅遊景點、美食餐廳與咖啡廳、度假住宿，以及日常生活紀錄。夢想是環遊世界。所有文字與照片皆為作者原創。

## 網站
- [首頁](${SITE}): 精選文章與最新內容
- [所有文章](${SITE}posts.html): 依分類（旅遊、美食、度假、生活）瀏覽與搜尋
- [旅行足跡](${SITE}footprints.html): 去過的國家與城市，以及想去的地方
- [關於${nick}](${SITE}about.html): 作者介紹與旅行理念

## 文章
${llmsPosts.length ? llmsPosts.join("\n") : "- （尚無已發布的文章）"}
`);

const robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8").replace(/^#?\s*Sitemap:.*$/m, `Sitemap: ${SITE}sitemap.xml`);
write("robots.txt", robots);

console.log(written.length ? `已更新 ${written.length} 個檔案：\n  ${written.join("\n  ")}` : "沒有任何變動。");
console.log(`（已發布文章 ${posts.length} 篇，網址 ${SITE}）`);
