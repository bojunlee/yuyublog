// 後台完整流程：在 iPhone / Android 模擬環境用真的本機 Supabase 測試
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { testEnv, useLocalConfig, rest, makePhoto, storageExists } from "./helpers.js";

test.describe.configure({ mode: "serial" });

const shot = async (page, name, info) => {
  fs.mkdirSync("tests/screenshots", { recursive: true });
  await page.screenshot({ path: `tests/screenshots/${info.project.name}-${name}.png`, fullPage: false });
};

async function login(page, email, password) {
  await page.goto("/admin/");
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "登入", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await useLocalConfig(page);
  page.on("dialog", d => d.accept());           // beforeunload
});

test("登入：密碼錯誤與非管理員帳號都會被擋下", async ({ page }, info) => {
  const env = testEnv();
  await login(page, env.admin.email, "wrong-password-123");
  await expect(page.locator("#login-err")).toHaveText("Email 或密碼不正確");
  await shot(page, "01-login-error", info);

  await login(page, env.stranger.email, env.stranger.password);
  await expect(page.locator(".err-box")).toContainText("沒有管理權限");
});

test("發文完整流程：上傳照片 → 草稿 → 預覽 → 發布 → 修改 → 取消發布 → 刪除", async ({ page, browser }, info) => {
  const env = testEnv();
  const tag = info.project.name;
  const title = `京都清水寺的傍晚（${tag}）`;

  await login(page, env.admin.email, env.admin.password);
  await expect(page.getByRole("heading", { name: "我的文章" })).toBeVisible();
  await shot(page, "02-post-list-empty", info);

  // 新增文章（用底部中間的 + 按鈕，手機上的主要入口）
  await page.getByRole("link", { name: "寫新文章" }).last().click();
  await expect(page.locator(".adm-top__title")).toHaveText("寫新文章");

  // 上傳兩張照片：一張橫的大照片、一張直的
  const p1 = await makePhoto(page, { w: 4032, h: 3024, label: "LANDSCAPE", hue: 20 });
  const p2 = await makePhoto(page, { w: 3024, h: 4032, label: "PORTRAIT", hue: 200 });
  await page.locator("#f-files").setInputFiles([p1, p2]);
  await expect(page.locator(".ph__caption")).toHaveCount(2, { timeout: 45_000 });
  await expect(page.locator(".ph__state")).toHaveCount(0);
  await shot(page, "03-photos-uploaded", info);

  await page.locator("#f-title").fill(title);
  await page.locator(".seg label", { hasText: "美食" }).click();
  await page.locator("#f-excerpt").fill("穿和服散步到八坂塔，傍晚的光線超級美。");
  await page.locator("#f-country").selectOption("JP");
  await page.locator("#f-city").fill("京都");
  await page.locator("#f-place").fill("東山區");
  await page.locator("#f-date").fill("2025-08-20");
  await page.locator(".ph__caption").nth(1).fill("直拍的八坂塔");

  // 第 2 張設為封面；第 1 張放進內文
  await page.locator(".ph").nth(1).getByRole("button", { name: "設為封面" }).click();
  await expect(page.locator(".ph").nth(1).locator(".ph__badge")).toHaveText("封面");
  await page.locator("#f-body").fill("早上七點的清水寺幾乎沒有人。");
  await page.locator(".ph").nth(0).getByRole("button", { name: /放進內文/ }).click();
  await expect(page.locator("#f-body")).toHaveValue(/\[照片 1\]/);
  await page.locator("#f-body").press("End");
  await page.locator("#f-body").pressSequentially("## 和服體驗\n\n和服店就在附近。");

  // 選填：餐廳資訊、花費
  await page.locator("#m-rest summary").click();
  await page.locator("#r-name").fill("示範湯豆腐");
  await page.locator("#r-address").fill("京都市東山區");
  await page.locator("#m-cost summary").click();
  await page.locator("#cost-add").click();
  await page.locator("#cost-rows [data-k=label]").fill("和服租借");
  await page.locator("#cost-rows [data-k=amount]").fill("abc");

  // 存草稿：金額錯誤會被擋下
  await page.getByRole("button", { name: "存草稿" }).click();
  await expect(page.locator("#err-box")).toContainText("花費的金額只能填數字");
  await page.locator("#cost-rows [data-k=amount]").fill("4500");
  await page.locator("#cost-cur").selectOption("JPY");
  await page.getByRole("button", { name: "存草稿" }).click();
  await expect(page.getByText("草稿已儲存")).toBeVisible();
  await expect(page).toHaveURL(/#\/edit\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop();
  await shot(page, "04-draft-saved", info);

  // 資料庫內容正確
  let row = (await rest(`/rest/v1/posts?id=eq.${id}`)).json[0];
  expect(row.status).toBe("draft");
  expect(row.title).toBe(title);
  expect(row.category).toBe("food");
  expect(row.country_code).toBe("JP");
  expect(row.photos).toHaveLength(2);
  expect(row.cover.path).toBe(row.photos[1].path);
  expect(row.photos[1].caption).toBe("直拍的八坂塔");
  expect(Math.max(row.photos[0].w, row.photos[0].h)).toBe(2000);        // 4032px 已壓到 2000px
  expect(row.photos[1].h).toBeGreaterThan(row.photos[1].w);              // 直拍照片沒有躺下
  expect(row.body).toContain("[照片 1]");
  expect(row.details.restaurant.name).toBe("示範湯豆腐");
  expect(row.details.cost).toEqual({ currency: "JPY", items: [{ label: "和服租借", amount: 4500 }], note: "" });
  for (const p of row.photos) {
    expect(await storageExists(p.path)).toBe(true);
    expect(await storageExists(p.thumb_path)).toBe(true);
  }

  // 草稿：訪客看不到
  expect((await rest(`/rest/v1/posts?id=eq.${id}`, { key: "anon" })).json).toEqual([]);

  // 預覽
  await page.getByRole("button", { name: "預覽" }).click();
  const pv = page.getByRole("dialog", { name: "文章預覽" });
  await expect(pv.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(pv.getByText("示範湯豆腐")).toBeVisible();
  await shot(page, "05-preview", info);
  await pv.getByRole("button", { name: "關閉預覽" }).click();
  await expect(pv).toHaveCount(0);

  // 發布
  await page.getByRole("button", { name: "發布", exact: true }).click();
  await expect(page.getByText("發布成功")).toBeVisible();
  row = (await rest(`/rest/v1/posts?id=eq.${id}`)).json[0];
  expect(row.status).toBe("published");
  expect(row.published_at).not.toBeNull();

  // 公開網站（全新的訪客瀏覽器）立刻看得到
  const visitor = await browser.newContext({ ...info.project.use });
  const vp = await visitor.newPage();
  await useLocalConfig(vp);
  await vp.goto(`/post.html?id=${id}`);
  await expect(vp.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(vp.locator(".prose figure")).toHaveCount(1);
  await expect(vp.locator(".gallery figcaption")).toHaveText("直拍的八坂塔");
  await expect(vp.getByText("餐廳資訊")).toBeVisible();
  await expect(vp.locator(".cost-list")).toContainText("和服租借");
  await vp.screenshot({ path: `tests/screenshots/${tag}-06-public-post.png` });
  await vp.goto("/posts.html?q=京都");
  await expect(vp.locator(".card__title", { hasText: title })).toBeVisible();
  await vp.goto("/posts.html?cat=travel");
  await expect(vp.locator(".card__title", { hasText: title })).toHaveCount(0);

  // 修改標題、移除第 1 張照片
  const removed = row.photos[0];
  await page.locator("#f-title").fill(title + "（更新）");
  await page.locator(".ph").nth(0).getByRole("button", { name: /移除第 1 張/ }).click();
  await page.getByRole("button", { name: "移除", exact: true }).click();
  await expect(page.locator(".ph__caption")).toHaveCount(1);
  await expect(page.locator("#f-body")).not.toHaveValue(/\[照片 1\]/);
  await page.getByRole("button", { name: "儲存更新" }).click();
  await expect(page.getByText("文章已更新")).toBeVisible();
  row = (await rest(`/rest/v1/posts?id=eq.${id}`)).json[0];
  expect(row.title).toBe(title + "（更新）");
  expect(row.photos).toHaveLength(1);
  await expect.poll(() => storageExists(removed.path)).toBe(false);
  await vp.goto(`/post.html?id=${id}`);
  await expect(vp.getByRole("heading", { level: 1 })).toHaveText(title + "（更新）");

  // 取消發布
  await page.getByRole("button", { name: "更多動作" }).click();
  await page.getByRole("menuitem", { name: /取消發布/ }).click();
  await page.getByRole("button", { name: "改回草稿" }).click();
  await expect(page.getByText("已取消發布，改回草稿")).toBeVisible();
  expect((await rest(`/rest/v1/posts?id=eq.${id}`, { key: "anon" })).json).toEqual([]);
  await vp.goto(`/post.html?id=${id}`);
  await expect(vp.getByRole("heading", { name: "找不到這篇文章" })).toBeVisible();

  // 刪除
  await page.getByRole("button", { name: "更多動作" }).click();
  await page.getByRole("menuitem", { name: /刪除這篇文章/ }).click();
  await page.getByRole("button", { name: "永久刪除" }).click();
  await expect(page.getByText("文章已刪除")).toBeVisible();
  await expect(page.getByRole("heading", { name: "我的文章" })).toBeVisible();
  expect((await rest(`/rest/v1/posts?id=eq.${id}`)).json).toEqual([]);
  for (const p of row.photos) await expect.poll(() => storageExists(p.path)).toBe(false);

  await visitor.close();
});

test("沒存檔就離開會提醒；重新整理後可以恢復未儲存的內容", async ({ page }, info) => {
  const env = testEnv();
  await login(page, env.admin.email, env.admin.password);
  await page.getByRole("link", { name: "寫新文章" }).last().click();
  await page.locator("#f-title").fill("還沒存的標題");
  await expect(page.locator("#save-state")).toContainText("尚未儲存");

  await page.getByRole("link", { name: "返回" }).click();
  await expect(page.getByRole("dialog")).toContainText("還沒儲存喔");
  await shot(page, "07-unsaved-guard", info);
  await page.getByRole("button", { name: "繼續編輯" }).click();
  await expect(page.locator("#f-title")).toHaveValue("還沒存的標題");

  await page.waitForTimeout(1000);                                     // 等自動備份
  await page.reload();
  await expect(page.locator(".restore-box")).toBeVisible();
  await page.getByRole("button", { name: "恢復修改" }).click();
  await expect(page.locator("#f-title")).toHaveValue("還沒存的標題");

  await page.getByRole("link", { name: "返回" }).click();
  await page.getByRole("button", { name: "不儲存，離開" }).click();
  await expect(page.getByRole("heading", { name: "我的文章" })).toBeVisible();
});

test("發布前的檢查：沒有標題或照片不能發布", async ({ page }) => {
  const env = testEnv();
  await login(page, env.admin.email, env.admin.password);
  await page.getByRole("link", { name: "寫新文章" }).last().click();
  await page.locator("#f-body").fill("只有內文");
  await page.getByRole("button", { name: "發布", exact: true }).click();
  await expect(page.locator("#err-box")).toContainText("請填寫標題");
  await expect(page.locator("#err-box")).toContainText("至少加入一張照片");
  await expect(page.locator("#f-title")).toHaveAttribute("aria-invalid", "true");
});

test("網站設定：換照片、改自我介紹、願望清單，公開網站馬上更新", async ({ page, browser }, info) => {
  const env = testEnv();
  await login(page, env.admin.email, env.admin.password);
  await page.getByRole("link", { name: "網站設定" }).click();
  await expect(page.locator(".adm-top__title")).toHaveText("網站設定");

  const avatar = await makePhoto(page, { w: 1200, h: 1500, label: "YUYU", hue: 330 });
  await page.locator("#avatar-file").setInputFiles(avatar);
  await expect(page.getByText("照片上傳好了")).toBeVisible({ timeout: 30_000 });
  const intro = `我是魚魚，正在測試 ${info.project.name}`;
  await page.locator("#p-intro").fill(intro);
  await page.locator("#fav-in").fill("清晨的海");
  await page.locator("#fav-add").click();
  await page.locator("#so-instagram").fill("@yuyu.goes.out");
  await page.locator("#wish-add").click();
  await page.locator("#wish-rows select").last().selectOption("IS");
  await page.locator("#wish-rows [data-k=note]").last().fill("看一次極光");
  await shot(page, "08-settings", info);
  await page.getByRole("button", { name: "儲存設定" }).click();
  await expect(page.getByText("設定已儲存")).toBeVisible();

  const pf = (await rest("/rest/v1/profile?id=eq.1")).json[0];
  expect(pf.intro).toBe(intro);
  expect(pf.favorites).toContain("清晨的海");
  expect(pf.wishlist.at(-1)).toMatchObject({ country_code: "IS", note: "看一次極光" });
  expect(await storageExists(pf.avatar.path)).toBe(true);

  const visitor = await browser.newContext({ ...info.project.use });
  const vp = await visitor.newPage();
  await useLocalConfig(vp);
  await vp.goto("/about.html");
  await expect(vp.locator("#about-intro")).toHaveText(intro);
  await expect(vp.locator("#about-favs")).toContainText("清晨的海");
  await expect(vp.locator("#about-photo img")).toHaveAttribute("src", /\/photos\/site\//);
  await expect(vp.locator('#about-socials a[aria-label="Instagram"]')).toHaveAttribute("href", "https://www.instagram.com/yuyu.goes.out/");
  await vp.goto("/footprints.html");
  await expect(vp.locator("#wish-cards")).toContainText("看一次極光");
  await visitor.close();
});

test("登出後回到登入畫面，後台資料讀不到", async ({ page }) => {
  const env = testEnv();
  await login(page, env.admin.email, env.admin.password);
  await expect(page.getByRole("heading", { name: "我的文章" })).toBeVisible();
  await page.getByRole("button", { name: "登出" }).click();
  await expect(page.getByRole("heading", { name: "嗨，魚魚！" })).toBeVisible();
  await page.goto("/admin/#/settings");
  await expect(page.getByRole("heading", { name: "嗨，魚魚！" })).toBeVisible();
});
