// 首頁設計檢查用截圖：node scripts/shoot-home.mjs [網址]
// 會先捲過整頁讓延遲載入的照片出現，再截桌機與手機全頁
import { chromium, webkit, devices } from "@playwright/test";
import fs from "node:fs";

const url = process.argv[2] || "http://127.0.0.1:5500/";
fs.mkdirSync("tests/screenshots", { recursive: true });

async function shoot(browserType, opts, name) {
  const browser = await browserType.launch();
  const page = await browser.newPage(opts);
  await page.goto(url, { waitUntil: "networkidle" });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(120); }
  await page.waitForTimeout(1500);
  await page.evaluate(() => { scrollTo(0, 0); document.querySelectorAll(".reveal").forEach(e => e.classList.add("is-in")); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `tests/screenshots/home-${name}.png`, fullPage: true });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(name, "page height", height, "px");
  await browser.close();
}

await shoot(chromium, { viewport: { width: 1440, height: 900 } }, "desktop");
await shoot(webkit, { ...devices["iPhone 14"] }, "iphone14");
