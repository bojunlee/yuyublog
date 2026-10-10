// 測試共用工具：讀取本機 Supabase 連線資訊、用 service_role 直接檢查資料庫
// service_role key 只存在這個本機測試程式裡，絕不會出現在網站檔案中。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ENV_FILE = path.join(here, ".local-test-env.json");

export function testEnv() {
  return JSON.parse(fs.readFileSync(ENV_FILE, "utf8"));
}

// 讓網站讀到本機 Supabase 的設定（不改動真正的 config.js）
export async function useLocalConfig(page) {
  const env = testEnv();
  await page.route("**/assets/js/config.js", route => route.fulfill({
    contentType: "text/javascript",
    body: `export default { supabaseUrl: ${JSON.stringify(env.url)}, supabaseAnonKey: ${JSON.stringify(env.anon)} };`
  }));
}

export async function rest(pathname, { method = "GET", key = "service", token, body, headers = {} } = {}) {
  const env = testEnv();
  const apikey = key === "service" ? env.service : env.anon;
  const res = await fetch(`${env.url}${pathname}`, {
    method,
    headers: {
      apikey,
      Authorization: `Bearer ${token || apikey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

export async function signIn(email, password) {
  const env = testEnv();
  const res = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("sign in failed: " + JSON.stringify(json));
  return json.access_token;
}

export async function storageExists(objectPath) {
  const env = testEnv();
  const res = await fetch(`${env.url}/storage/v1/object/public/photos/${objectPath}`, { method: "HEAD" });
  return res.status === 200;
}

// 在瀏覽器裡畫一張測試照片（不需要下載任何檔案）
export async function makePhoto(page, { w = 4032, h = 3024, label = "TEST", hue = 200 } = {}) {
  const b64 = await page.evaluate(async ({ w, h, label, hue }) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `hsl(${hue} 70% 70%)`);
    grad.addColorStop(1, `hsl(${(hue + 40) % 360} 60% 35%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {                 // 加點雜訊，讓檔案大小像真的照片
      g.fillStyle = `hsla(${(hue + i) % 360} 60% 60% / .25)`;
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 20 + Math.random() * 120, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#fff";
    g.font = `bold ${Math.round(h / 8)}px sans-serif`;
    g.fillText(label, w / 12, h / 2);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, { w, h, label, hue });
  return { name: `${label.toLowerCase()}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") };
}
