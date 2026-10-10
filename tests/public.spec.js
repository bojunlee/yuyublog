// 公開網站：連上本機資料庫後的實際行為（載入、分頁、篩選、搜尋、空狀態、錯誤狀態）
import { test, expect } from "@playwright/test";
import { useLocalConfig, rest, testEnv } from "./helpers.js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

test.describe.configure({ mode: "serial" });

const CATS = ["travel", "food", "stay", "life"];
let ids = [];
let photo;

test.beforeAll(async () => {
  const env = testEnv();
  // 用 service_role 上傳一張測試照片當封面
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await fetch(`${env.url}/storage/v1/object/photos/test/cover.png`, {
    method: "POST", headers: { apikey: env.service, Authorization: `Bearer ${env.service}`, "Content-Type": "image/png", "x-upsert": "true" }, body: png
  });
  const url = `${env.url}/storage/v1/object/public/photos/test/cover.png`;
  photo = { path: "test/cover.png", url, thumb: url, w: 1200, h: 800, caption: "測試照片" };
  await rest("/rest/v1/posts?title=like.*seed*", { method: "DELETE" });
  const rows = Array.from({ length: 12 }, (_, i) => ({
    title: `seed 文章 ${String(i + 1).padStart(2, "0")}`,
    excerpt: `第 ${i + 1} 篇的摘要`,
    body: i === 0 ? "第一段\n\n[照片 1]\n\n## 小標\n\n- 清單一\n- 清單二" : "內文",
    category: CATS[i % 4],
    country_code: ["JP", "TW", "GR", "FR"][i % 4],
    city: ["京都", "台北", "聖托里尼", "巴黎"][i % 4],
    status: "published",
    cover: photo,
    photos: [photo, { ...photo, caption: "第二張" }],
    featured: i === 3,
    visited_on: `2025-0${(i % 9) + 1}-10`
  }));
  // 依序新增，讓 published_at 有先後順序
  for (const r of rows) ids.push((await rest("/rest/v1/posts", { method: "POST", body: r })).json[0].id);
});

test.afterAll(async () => {
  await rest(`/rest/v1/posts?id=in.(${ids.join(",")})`, { method: "DELETE" });
});

test.beforeEach(async ({ page }) => { await useLocalConfig(page); });

test("首頁從資料庫讀取：精選、最新文章、統計，沒有示範標記", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".demo-ribbon")).toHaveCount(0);
  await expect(page.locator("#feature .feature__title")).toHaveText("seed 文章 04");
  await expect(page.locator("#latest-list .card").first()).toBeVisible();
  await expect(page.locator('[data-stat="posts"]')).toHaveText("12");
  await expect(page.locator('[data-stat="countries"]')).toHaveText("4");
  await expect(page.locator(".cat-tile")).toHaveCount(4);
});

test("文章列表：載入更多、分類切換、搜尋、空狀態", async ({ page }) => {
  await page.goto("/posts.html");
  await expect(page.locator("#results .card")).toHaveCount(9);
  await expect(page.locator("#list-status")).toContainText("共 12 篇");
  await page.getByRole("button", { name: "載入更多文章" }).click();
  await expect(page.locator("#results .card")).toHaveCount(12);
  await expect(page.locator("#load-more")).toContainText("已經是全部了");

  await page.locator('.chip[data-cat="food"]').click();
  await expect(page).toHaveURL(/cat=food/);
  await expect(page.locator("#results .card")).toHaveCount(3);
  await expect(page.locator("#list-title")).toHaveText("美食的文章");

  await page.locator("#search").fill("找不到的東西xyz");
  await expect(page.getByText("找不到「找不到的東西xyz」相關的文章")).toBeVisible();
  await page.getByRole("button", { name: "看全部文章" }).click();
  await expect(page.locator("#results .card")).toHaveCount(9);

  await page.locator("#search").fill("聖托里尼");
  await expect(page.locator("#results .card")).toHaveCount(3);
  await page.goto("/posts.html?country=FR");
  await expect(page.locator("#results .card")).toHaveCount(3);
});

test("網路失敗時顯示錯誤狀態，可以重試", async ({ page }) => {
  let fail = true;
  await page.route("**/rest/v1/posts**", route => fail ? route.abort("failed") : route.fallback());
  await page.goto("/posts.html");
  await expect(page.getByRole("heading", { name: "文章載入失敗" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "再試一次" }).click();
  await expect(page.locator("#results .card")).toHaveCount(9);
});

test("文章頁：照片、燈箱、喜歡、分享、相關文章", async ({ page }) => {
  await page.goto(`/post.html?id=${ids[0]}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("seed 文章 01");
  await expect(page.locator(".prose h2")).toHaveText("小標");
  await expect(page.locator(".prose li")).toHaveCount(2);
  await expect(page.locator(".gallery figcaption")).toHaveText("第二張");

  await page.locator(".prose .art-figure__btn").click();
  const lb = page.getByRole("dialog", { name: "照片" });
  await expect(lb).toBeVisible();
  await expect(lb.locator(".lightbox__count")).toHaveText("1 / 2");
  await page.keyboard.press("Escape");
  await expect(lb).toBeHidden();

  await page.locator("#like-btn").click();
  await expect(page.locator("#like-btn")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await rest(`/rest/v1/posts?id=eq.${ids[0]}&select=likes`)).json[0].likes).toBe(1);
  await page.reload();
  await expect(page.locator("#like-btn")).toHaveAttribute("aria-pressed", "true");   // 記得按過
  await page.locator("#like-btn").click();
  await expect.poll(async () => (await rest(`/rest/v1/posts?id=eq.${ids[0]}&select=likes`)).json[0].likes).toBe(0);

  await expect(page.locator("#related .card")).toHaveCount(3);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "seed 文章 01");
});

test("閱讀人數：顯示在文章頁，同一瀏覽器重複打開不重複計算", async ({ page }) => {
  await rest(`/rest/v1/rpc/view_post`, { method: "POST", body: { pid: ids[1] } });          // 先有 1 人看過
  await page.goto(`/post.html?id=${ids[1]}`);
  await expect(page.locator("#views")).toBeVisible();
  await expect(page.locator("#view-n")).toHaveText("2");                                      // 加上這次
  await expect.poll(async () => (await rest(`/rest/v1/posts?id=eq.${ids[1]}&select=views`)).json[0].views).toBe(2);
  await page.reload();
  await expect(page.locator("#view-n")).toHaveText("2");                                      // 重新整理不再 +1
  await expect.poll(async () => (await rest(`/rest/v1/posts?id=eq.${ids[1]}&select=views`)).json[0].views).toBe(2);
});

// 靜態文章頁：產生 → 原始 HTML 就有完整內容 → 瀏覽器接手後互動正常 → 取消發布後被移除
test("SEO：預先產生的文章靜態頁，內容完整且能正常互動", async ({ page }) => {
  const env = testEnv();
  const out = path.resolve("tests/results/site-build");
  fs.rmSync(out, { recursive: true, force: true });
  const run = () => execFileSync("node", ["scripts/build-site.mjs", "https://example.test/blog/", `--out=${out}`],
    { env: { ...process.env, SUPABASE_URL: env.url, SUPABASE_ANON_KEY: env.anon }, encoding: "utf8" });
  run();

  const file = path.join(out, "p", `${ids[0]}.html`);
  const html = fs.readFileSync(file, "utf8");
  const text = html.replace(/<(script|style)[\s\S]*?<\/>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  expect(html).toContain("<title>seed 文章 01｜魚魚出去玩</title>");
  expect(html).toContain(`<link rel="canonical" href="https://example.test/blog/p/${ids[0]}.html">`);
  expect(html).toContain('<meta property="og:title" content="seed 文章 01">');
  expect(html).toContain(`og:image" content="${env.url}/storage/v1/object/public/photos/test/cover.png"`);
  expect(html).toMatch(/<h1 id="article-title">seed 文章 01<\/h1>/);
  expect(html).toContain('"@type":"BlogPosting"');
  expect(html).toContain("<base href=\"../\">");
  expect(text).toContain("第一段");                 // 內文在原始 HTML 裡，不需要 JavaScript

  // 其他輸出
  expect(fs.readFileSync(path.join(out, "sitemap.xml"), "utf8")).toContain(`https://example.test/blog/p/${ids[0]}.html`);
  expect(fs.readFileSync(path.join(out, "llms.txt"), "utf8")).toContain("seed 文章 01");
  expect(fs.readFileSync(path.join(out, "index.html"), "utf8")).toContain('"@type":"WebSite"');
  const before = fs.readFileSync(path.join(out, "sitemap.xml"), "utf8");
  expect(run()).toContain("沒有任何變動");          // 沒有新文章 → 不產生變動（不會有多餘的 commit）
  expect(fs.readFileSync(path.join(out, "sitemap.xml"), "utf8")).toBe(before);

  // 瀏覽器載入這個靜態頁：沿用預先產生的內容、互動功能仍然運作
  // 不用 page.route 攔截：Chromium 會把「攔截產生的頁面」當成來源不明而擋掉對本機資料庫的請求，所以真的把檔案放進伺服器目錄
  const served = path.resolve("p", `${ids[0]}.html`);
  fs.mkdirSync(path.dirname(served), { recursive: true });
  fs.writeFileSync(served, html);
  try {
    await checkStaticPage(page);
  } finally {
    fs.rmSync(served, { force: true });
    try { fs.rmdirSync(path.dirname(served)); } catch { /* 資料夾裡還有別的檔案就保留 */ }
  }

  // 取消發布後重新產生：靜態頁、sitemap、llms.txt 都要移除這篇
  await rest(`/rest/v1/posts?id=eq.${ids[0]}`, { method: "PATCH", body: { status: "draft" } });
  expect(run()).toContain("已移除");
  expect(fs.existsSync(file)).toBe(false);
  expect(fs.readFileSync(path.join(out, "sitemap.xml"), "utf8")).not.toContain(ids[0]);
  expect(fs.readFileSync(path.join(out, "llms.txt"), "utf8")).not.toContain("seed 文章 01");
  await rest(`/rest/v1/posts?id=eq.${ids[0]}`, { method: "PATCH", body: { status: "published" } });
});

async function checkStaticPage(page) {
  await page.goto(`/p/${ids[0]}.html`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("seed 文章 01");
  await expect(page.locator("#after-article")).toBeVisible();
  await expect(page.locator("article#article[data-prerendered]")).toHaveCount(1);   // 沒有被重畫
  await expect(page.locator("#related .card")).toHaveCount(3);                        // 相關文章仍由 JS 補上
  await expect(page.locator("a.btn", { hasText: "返回文章列表" })).toHaveAttribute("href", /posts\.html/);
  await page.locator("#like-btn").click();
  await expect.poll(async () => (await rest(`/rest/v1/posts?id=eq.${ids[0]}&select=likes`)).json[0].likes).toBe(1);
  await page.locator("#like-btn").click();                                             // 還原
  await expect.poll(async () => (await rest(`/rest/v1/posts?id=eq.${ids[0]}&select=likes`)).json[0].likes).toBe(0);
}

test("不存在的文章顯示找不到", async ({ page }) => {
  await page.goto("/post.html?id=00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "找不到這篇文章" })).toBeVisible();
});

test("旅行足跡：地圖標出去過的國家，點國家放大並顯示資訊", async ({ page }) => {
  await page.goto("/footprints.html");
  await expect(page.locator(".xmap")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.country.is-visited[data-code="JP"]').first()).toBeAttached();
  await expect(page.locator(".country-group")).toHaveCount(4);
  await expect(page.locator(".xmap__route")).toBeAttached();          // 4 個國家 → 有旅行路線
  const before = await page.locator(".xmap").getAttribute("viewBox");
  await page.locator('.country.is-visited[data-code="GR"]').first().dispatchEvent("click");
  await expect(page.locator("#country-GR")).toHaveClass(/is-active/);
  await expect(page.locator(".xmap-panel")).toContainText("希臘");
  await expect(page.locator(".xmap-panel")).toContainText("3 篇故事");
  await expect.poll(() => page.locator(".xmap").getAttribute("viewBox")).not.toBe(before);   // 有放大過去
  await page.locator(".xmap-panel [data-open]").click();
  await expect(page.locator("#country-GR")).toBeInViewport();
});

test("旅行足跡：手機上圖釘點擊範圍夠大，可用圖釘或國家按鈕選擇", async ({ page, isMobile }) => {
  await page.goto("/footprints.html");
  await expect(page.locator(".xmap")).toBeVisible({ timeout: 30_000 });
  await page.locator(".map-wrap").scrollIntoViewIfNeeded();
  for (const code of ["JP", "TW", "GR", "FR"]) {
    const box = await page.locator(`.pin[data-code="${code}"] .pin__hit`).boundingBox();
    expect(box.width, `${code} 圖釘點擊範圍`).toBeGreaterThanOrEqual(40);
  }
  await page.locator('.pin[data-code="JP"]').click({ force: true });
  await expect(page.locator(".xmap-panel")).toContainText("日本");
  await page.locator('.xmap-chip[data-code="FR"]').click();
  await expect(page.locator(".xmap-panel")).toContainText("法國");
  await expect(page.locator('.xmap-chip[data-code="FR"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator(".xmap-panel [data-close]").click();
  await expect(page.locator(".xmap-panel")).toBeHidden();
  if (isMobile) {
    // 手機一開始就放大到去過的國家，不是整個世界
    const w = Number((await page.locator(".xmap").getAttribute("viewBox")).split(" ")[2]);
    expect(w).toBeLessThan(900);
  }
});

test("減少動態效果：內容不需要動畫也立即可見", async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await useLocalConfig(page);
  await page.goto("/");
  const hidden = await page.evaluate(() => [...document.querySelectorAll(".reveal, .hero-line")]
    .filter(el => getComputedStyle(el).opacity !== "1").length);
  expect(hidden).toBe(0);
  await ctx.close();
});

test("沒有任何文章時的空狀態", async ({ page }) => {
  await rest(`/rest/v1/posts?id=in.(${ids.join(",")})`, { method: "PATCH", body: { status: "draft", featured: false } });
  await page.goto("/");
  await expect(page.getByText("魚魚正在整理第一篇旅行筆記")).toBeVisible();
  await page.goto("/posts.html");
  await expect(page.getByText("這個分類還沒有文章")).toBeVisible();
  await page.goto("/footprints.html");
  await expect(page.getByText("第一枚印章還沒蓋上")).toBeVisible();
  await rest(`/rest/v1/posts?id=in.(${ids.join(",")})`, { method: "PATCH", body: { status: "published" } });
});
