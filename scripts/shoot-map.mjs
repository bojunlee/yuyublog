// 旅行足跡地圖檢查截圖：node scripts/shoot-map.mjs
import { chromium, webkit, devices } from "@playwright/test";
import fs from "node:fs";

const url = process.argv[2] || "http://127.0.0.1:5500/footprints.html";
fs.mkdirSync("tests/screenshots", { recursive: true });

async function shoot(type, opts, name) {
  const browser = await type.launch();
  const page = await browser.newPage(opts);
  await page.goto(url, { waitUntil: "networkidle" });
  const stage = page.locator(".xmap-stage");
  await stage.waitFor({ timeout: 30000 });
  await page.locator(".map-wrap").scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, -70));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `tests/screenshots/map-${name}-1-playing.png` });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `tests/screenshots/map-${name}-2-done.png` });
  const hit = await page.locator('.pin[data-code="JP"] .pin__hit').boundingBox();
  console.log(name, "JP pin tap area", hit && `${hit.width.toFixed(0)}x${hit.height.toFixed(0)}px`);
  await page.locator('.pin[data-code="JP"]').click({ force: true });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector(".map-wrap").scrollIntoView({ block: "start" }));
  await page.evaluate(() => scrollBy(0, -70));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tests/screenshots/map-${name}-3-selected.png` });
  await browser.close();
}

await shoot(chromium, { viewport: { width: 1440, height: 900 } }, "desktop");
await shoot(webkit, { ...devices["iPhone 14"] }, "iphone14");
