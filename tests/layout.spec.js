// 版面檢查：各種螢幕尺寸不能出現水平捲動，並留下截圖給人看
import { test, expect } from "@playwright/test";
import fs from "node:fs";

const PAGES = [
  ["home", "/"],
  ["posts", "/posts.html"],
  ["post", "/post.html?id=demo-santorini"],
  ["footprints", "/footprints.html"],
  ["about", "/about.html"],
  ["admin-setup", "/admin/"],
  ["404", "/404.html"]
];

// 這裡刻意不接資料庫，用示範內容檢查設計（把 config.js 換成空白設定，強制示範模式）
test.beforeEach(async ({ page }) => {
  await page.route("**/assets/js/config.js", route => route.fulfill({
    contentType: "text/javascript", body: 'export default { supabaseUrl: "", supabaseAnonKey: "" };'
  }));
});

for (const [name, url] of PAGES) {
  test(`${name}：沒有水平捲動`, async ({ page }, info) => {
    await page.goto(url);
    await page.waitForLoadState("networkidle").catch(() => {});
    // 讓所有淡入元素都顯示，再截全頁
    await page.evaluate(() => document.querySelectorAll(".reveal").forEach(el => el.classList.add("is-in")));
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      return [...document.querySelectorAll("body *")]
        .filter(el => { const r = el.getBoundingClientRect(); return r.width && r.right > w + 1 && getComputedStyle(el).position !== "fixed"; })
        .filter(el => !el.closest(".chips, .gallery__track, .lightbox, .toolbar, .filters, .hero__credit, .mobile-nav"))
        // 被 overflow:hidden 裁掉的（主視覺放大進場），或在可左右滑動的列裡的（手機滑動列）不算
        .filter(el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { if (/hidden|clip|auto|scroll/.test(getComputedStyle(a).overflowX)) return false; } return true; })
        .filter(el => getComputedStyle(el).visibility !== "hidden")
        .slice(0, 5).map(el => `${el.tagName}.${el.className}`);
    });
    expect(overflow, "超出畫面寬度的元素").toEqual([]);
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    fs.mkdirSync("tests/screenshots", { recursive: true });
    await page.screenshot({ path: `tests/screenshots/${info.project.name}-layout-${name}.png`, fullPage: true });
  });
}

test("手機選單：開啟、鍵盤關閉、焦點回到按鈕", async ({ page, isMobile }) => {
  test.skip(!isMobile, "只有手機有選單按鈕");
  await page.goto("/");
  const btn = page.getByRole("button", { name: "開啟選單" });
  await btn.click();
  const nav = page.getByRole("dialog", { name: "選單" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: /旅行足跡/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(btn).toBeFocused();
});

test("觸控目標至少 40px", async ({ page, isMobile }) => {
  test.skip(!isMobile, "手機才檢查");
  await page.goto("/posts.html");
  await page.locator(".chip").first().waitFor();
  const small = await page.evaluate(() => [...document.querySelectorAll("button, .chip, .btn, .icon-btn")]
    .filter(el => el.offsetParent)
    .map(el => ({ el: el.textContent.trim().slice(0, 12) || el.getAttribute("aria-label"), h: el.getBoundingClientRect().height }))
    .filter(x => x.h < 40));
  expect(small).toEqual([]);
});
