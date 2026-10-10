// 客觀檢測：Google Lighthouse（手機模擬：慢速 4G、CPU 降速）＋ axe-core 無障礙掃描
// 用法：先 npm run dev，再 node scripts/audit.mjs
import { chromium, devices } from "@playwright/test";
import lighthouse from "lighthouse";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:5500";
const PAGES = [
  ["首頁", "/"], ["文章列表", "/posts.html"], ["文章", "/post.html?id=demo-santorini"],
  ["旅行足跡", "/footprints.html"], ["關於", "/about.html"], ["後台", "/admin/"]
];
fs.mkdirSync("tests/audit", { recursive: true });

const PORT = 9333;
const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
const rows = [];
for (const [name, path] of PAGES) {
  const r = await lighthouse(BASE + path, { port: PORT, output: "json", logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"] });
  const { categories: c, audits: a } = r.lhr;
  fs.writeFileSync(`tests/audit/lh-${encodeURIComponent(name)}.json`, r.report);
  const fails = Object.values(a).filter(x => x.score !== null && x.score < 0.9 && x.scoreDisplayMode === "binary").map(x => x.id);
  rows.push({ name, perf: c.performance.score, a11y: c.accessibility.score, bp: c["best-practices"].score, seo: c.seo.score,
    fcp: a["first-contentful-paint"].displayValue, lcp: a["largest-contentful-paint"].displayValue,
    tbt: a["total-blocking-time"].displayValue, cls: a["cumulative-layout-shift"].displayValue,
    kb: Math.round(a["total-byte-weight"].numericValue / 1024), req: (a["network-requests"].details?.items || []).length, fails });
}

// axe：用 iPhone 尺寸、等內容載入、所有淡入動畫顯示後再掃
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const axeOut = [];
for (const [name, path] of PAGES) {
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelectorAll(".reveal").forEach(e => e.classList.add("is-in")));
  await page.waitForTimeout(800);
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  for (const v of res.violations) axeOut.push({ page: name, id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes[0]?.target.join(" ") });
  await page.close();
}
await browser.close();

const pct = x => String(Math.round(x * 100)).padStart(3);
console.log("頁面      效能 無障礙 實作 SEO |  FCP    LCP    TBT   CLS  |  KB   請求 | 未通過項目");
for (const r of rows) console.log(`${r.name.padEnd(6, "　")} ${pct(r.perf)}  ${pct(r.a11y)}  ${pct(r.bp)} ${pct(r.seo)} | ${r.fcp.padEnd(6)} ${r.lcp.padEnd(6)} ${r.tbt.padEnd(6)} ${r.cls.padEnd(5)}| ${String(r.kb).padStart(5)} ${String(r.req).padStart(4)} | ${r.fails.join(", ")}`);
console.log("\naxe 無障礙問題（WCAG 2.1 AA）：", axeOut.length ? "" : "無");
for (const v of axeOut) console.log(`- [${v.page}] ${v.impact} ${v.id} ×${v.n}：${v.help}｜例：${v.sample}`);
fs.writeFileSync("tests/audit/summary.json", JSON.stringify({ rows, axe: axeOut }, null, 2));
