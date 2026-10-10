// 端對端測試：本機 Supabase（npx supabase start）+ 靜態網站
// 執行：npm test
import { defineConfig, devices } from "@playwright/test";

const PORT = 5510;

export default defineConfig({
  testDir: "./tests",
  outputDir: "./tests/results",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,                       // 共用同一個本機資料庫，依序執行比較穩定
  reporter: [["list"], ["html", { outputFolder: "tests/report", open: "never" }]],
  globalSetup: "./tests/global-setup.js",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: `python -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
    stdout: "ignore",
    stderr: "ignore"
  },
  projects: [
    { name: "security", testMatch: /security\.spec\.js/ },
    { name: "iphone-14", use: { ...devices["iPhone 14"] }, testMatch: /(admin|public)\.spec\.js/ },
    { name: "pixel-7", use: { ...devices["Pixel 7"] }, testMatch: /(admin|public)\.spec\.js/ },
    { name: "iphone-se", use: { ...devices["iPhone SE"] }, testMatch: /layout\.spec\.js/ },
    { name: "galaxy-s9", use: { ...devices["Galaxy S9+"] }, testMatch: /layout\.spec\.js/ },
    { name: "ipad", use: { ...devices["iPad (gen 7)"] }, testMatch: /layout\.spec\.js/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testMatch: /(public|layout)\.spec\.js/ }
  ]
});
