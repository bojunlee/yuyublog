// 產生「加入主畫面」用的 PNG 圖示（iPhone 不支援 SVG 圖示）
// 用法：node scripts/make-icons.mjs
import { chromium } from "@playwright/test";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1b2630"/>
<g transform="translate(6 6) scale(.7)"><g fill="none" stroke="#f0b48f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
<path d="M5 21c5-7.5 15-9.5 23.5-3l5.5-5.5v17l-5.5-5.5C20 30.5 10 28.5 5 21z"/><path d="M16 15.8c1.6 2.8 1.6 6.6 0 9.4"/></g>
<circle cx="11" cy="19.8" r="1.4" fill="#f0b48f"/></g></svg>`;

const browser = await chromium.launch();
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `assets/img/icon-${size}.png` });
  await page.close();
}
await browser.close();
console.log("icons written");
