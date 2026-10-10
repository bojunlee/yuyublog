// 測試前準備：讀本機 Supabase 連線資訊、清空資料、建立測試管理員與一般帳號
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { ENV_FILE } from "./helpers.js";

export default async function globalSetup() {
  let out;
  try {
    out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("本機 Supabase 沒有在執行，請先執行：npx supabase start");
  }
  const kv = Object.fromEntries(out.split(/\r?\n/).map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
  const env = {
    url: kv.API_URL,
    anon: kv.ANON_KEY || kv.PUBLISHABLE_KEY,
    service: kv.SERVICE_ROLE_KEY || kv.SECRET_KEY,
    admin: { email: "yuyu@yuyublog.test", password: crypto.randomBytes(12).toString("base64url") },
    stranger: { email: "stranger@yuyublog.test", password: crypto.randomBytes(12).toString("base64url") }
  };
  if (!env.url || !env.anon || !env.service) throw new Error("讀不到本機 Supabase 的金鑰：\n" + out);

  const h = { apikey: env.service, Authorization: `Bearer ${env.service}`, "Content-Type": "application/json" };

  // 清掉舊的測試帳號、文章、照片
  const users = await (await fetch(`${env.url}/auth/v1/admin/users?per_page=200`, { headers: h })).json();
  for (const u of users.users || []) {
    if (u.email && u.email.endsWith("@yuyublog.test")) await fetch(`${env.url}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: h });
  }
  await fetch(`${env.url}/rest/v1/posts?id=not.is.null`, { method: "DELETE", headers: h });
  await fetch(`${env.url}/rest/v1/profile?id=eq.1`, {
    method: "PATCH", headers: h,
    body: JSON.stringify({ avatar: null, hero_image: null, intro: "大家好，我是魚魚！", bio: "", philosophy: "", favorites: [], wishlist: [], socials: {} })
  });

  // 建立帳號（email 已驗證），並把魚魚加入管理員名單
  for (const who of [env.admin, env.stranger]) {
    const r = await fetch(`${env.url}/auth/v1/admin/users`, {
      method: "POST", headers: h, body: JSON.stringify({ email: who.email, password: who.password, email_confirm: true })
    });
    if (!r.ok) throw new Error("建立測試帳號失敗：" + (await r.text()));
  }
  const a = await fetch(`${env.url}/rest/v1/admins`, {
    method: "POST", headers: { ...h, Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ email: env.admin.email })
  });
  if (!a.ok) throw new Error("加入管理員失敗：" + (await a.text()));

  fs.writeFileSync(ENV_FILE, JSON.stringify(env, null, 2));
}
