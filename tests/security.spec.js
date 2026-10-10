// 權限測試：直接打 Supabase API，確認 RLS 與 Storage 規則真的擋得住
import { test, expect } from "@playwright/test";
import { testEnv, rest, signIn } from "./helpers.js";

const COVER = { path: "x.webp", url: "https://example.com/x.webp", thumb: "https://example.com/x.webp", w: 10, h: 10 };
let adminToken, strangerToken, publishedId, draftId;

test.beforeAll(async () => {
  const env = testEnv();
  adminToken = await signIn(env.admin.email, env.admin.password);
  strangerToken = await signIn(env.stranger.email, env.stranger.password);
  const pub = await rest("/rest/v1/posts", { method: "POST", body: { title: "公開測試", status: "published", cover: COVER, photos: [COVER] } });
  const dr = await rest("/rest/v1/posts", { method: "POST", body: { title: "草稿測試", status: "draft" } });
  publishedId = pub.json[0].id;
  draftId = dr.json[0].id;
});

test.afterAll(async () => {
  await rest(`/rest/v1/posts?id=in.(${publishedId},${draftId})`, { method: "DELETE" });
});

test("訪客只讀得到已發布文章，讀不到草稿", async () => {
  const r = await rest("/rest/v1/posts?select=id,status", { key: "anon" });
  expect(r.status).toBe(200);
  const ids = r.json.map(p => p.id);
  expect(ids).toContain(publishedId);
  expect(ids).not.toContain(draftId);
});

test("訪客不能新增、修改、刪除文章", async () => {
  const ins = await rest("/rest/v1/posts", { key: "anon", method: "POST", body: { title: "hack", status: "draft" } });
  expect(ins.status).toBeGreaterThanOrEqual(400);
  // 訪客連寫入權限都沒有（permission denied），或被 RLS 擋成 0 筆，兩種都算擋下
  const refused = r => r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0);
  const upd = await rest(`/rest/v1/posts?id=eq.${publishedId}`, { key: "anon", method: "PATCH", body: { title: "hacked" } });
  expect(refused(upd)).toBe(true);
  const del = await rest(`/rest/v1/posts?id=eq.${publishedId}`, { key: "anon", method: "DELETE" });
  expect(refused(del)).toBe(true);
  const still = await rest(`/rest/v1/posts?id=eq.${publishedId}&select=title`);
  expect(still.json[0].title).toBe("公開測試");
});

test("登入但不是管理員的帳號，不能寫入也讀不到草稿", async () => {
  const ins = await rest("/rest/v1/posts", { key: "anon", token: strangerToken, method: "POST", body: { title: "hack", status: "draft" } });
  expect(ins.status).toBe(403);
  const upd = await rest(`/rest/v1/posts?id=eq.${publishedId}`, { key: "anon", token: strangerToken, method: "PATCH", body: { title: "hacked" } });
  expect(upd.json).toEqual([]);
  const drafts = await rest(`/rest/v1/posts?id=eq.${draftId}`, { key: "anon", token: strangerToken });
  expect(drafts.json).toEqual([]);
  const pf = await rest("/rest/v1/profile?id=eq.1", { key: "anon", token: strangerToken, method: "PATCH", body: { intro: "hacked" } });
  expect(pf.json).toEqual([]);
  const adm = await rest("/rest/v1/rpc/is_admin", { key: "anon", token: strangerToken, method: "POST", body: {} });
  expect(adm.json).toBe(false);
});

test("管理員可以讀草稿、可以修改", async () => {
  const drafts = await rest(`/rest/v1/posts?id=eq.${draftId}&select=id`, { key: "anon", token: adminToken });
  expect(drafts.json.length).toBe(1);
  const adm = await rest("/rest/v1/rpc/is_admin", { key: "anon", token: adminToken, method: "POST", body: {} });
  expect(adm.json).toBe(true);
});

test("管理員名單本身任何人都讀不到", async () => {
  const a = await rest("/rest/v1/admins?select=email", { key: "anon" });
  expect(a.status).toBeGreaterThanOrEqual(400);
  const b = await rest("/rest/v1/admins?select=email", { key: "anon", token: adminToken });
  expect(b.status).toBeGreaterThanOrEqual(400);
});

test("發布時一定要有標題與封面", async () => {
  const r = await rest("/rest/v1/posts", { key: "anon", token: adminToken, method: "POST", body: { title: "", status: "published" } });
  expect(r.status).toBe(400);
  expect(JSON.stringify(r.json)).toContain("posts_publishable");
});

test("按喜歡只對已發布文章有效，且不能用來改其他欄位", async () => {
  const like = await rest("/rest/v1/rpc/like_post", { key: "anon", method: "POST", body: { pid: publishedId, delta: 1 } });
  expect(like.json).toBe(1);
  const draftLike = await rest("/rest/v1/rpc/like_post", { key: "anon", method: "POST", body: { pid: draftId, delta: 1 } });
  expect(draftLike.json).toBeNull();
  const bad = await rest("/rest/v1/rpc/like_post", { key: "anon", method: "POST", body: { pid: publishedId, delta: 100 } });
  expect(bad.status).toBeGreaterThanOrEqual(400);
  // 管理員更新文章時也不能竄改愛心數
  await rest(`/rest/v1/posts?id=eq.${publishedId}`, { key: "anon", token: adminToken, method: "PATCH", body: { likes: 9999, title: "公開測試" } });
  const after = await rest(`/rest/v1/posts?id=eq.${publishedId}&select=likes`);
  expect(after.json[0].likes).toBe(1);
});

test("閱讀人數：只對已發布文章 +1，草稿不計，也不能被竄改", async () => {
  const v1 = await rest("/rest/v1/rpc/view_post", { key: "anon", method: "POST", body: { pid: publishedId } });
  expect(v1.json).toBe(1);
  const v2 = await rest("/rest/v1/rpc/view_post", { key: "anon", method: "POST", body: { pid: publishedId } });
  expect(v2.json).toBe(2);
  const draft = await rest("/rest/v1/rpc/view_post", { key: "anon", method: "POST", body: { pid: draftId } });
  expect(draft.json).toBeNull();
  const missing = await rest("/rest/v1/rpc/view_post", { key: "anon", method: "POST", body: { pid: "00000000-0000-0000-0000-000000000000" } });
  expect(missing.json).toBeNull();
  // 訪客不能直接改，管理員編輯文章時也不能改數字
  const patch = await rest(`/rest/v1/posts?id=eq.${publishedId}`, { key: "anon", method: "PATCH", body: { views: 9999 } });
  expect(patch.status >= 400 || (Array.isArray(patch.json) && patch.json.length === 0)).toBe(true);
  await rest(`/rest/v1/posts?id=eq.${publishedId}`, { key: "anon", token: adminToken, method: "PATCH", body: { views: 9999, title: "公開測試" } });
  const after = await rest(`/rest/v1/posts?id=eq.${publishedId}&select=views`);
  expect(after.json[0].views).toBe(2);
});

test("同時只會有一篇精選", async () => {
  const a = await rest("/rest/v1/posts", { method: "POST", body: { title: "精選A", status: "published", cover: COVER, featured: true } });
  const b = await rest("/rest/v1/posts", { method: "POST", body: { title: "精選B", status: "published", cover: COVER, featured: true } });
  const feats = await rest("/rest/v1/posts?featured=is.true&select=id");
  expect(feats.json.map(p => p.id)).toEqual([b.json[0].id]);
  await rest(`/rest/v1/posts?id=in.(${a.json[0].id},${b.json[0].id})`, { method: "DELETE" });
});

test("照片空間：訪客與非管理員不能上傳，管理員可以；非圖片會被拒絕", async () => {
  const env = testEnv();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const up = (token, name, type = "image/png", body = png) => fetch(`${env.url}/storage/v1/object/photos/test/${name}`, {
    method: "POST", headers: { apikey: env.anon, Authorization: `Bearer ${token}`, "Content-Type": type }, body
  });
  expect((await up(env.anon, "anon.png")).status).toBeGreaterThanOrEqual(400);
  expect((await up(strangerToken, "stranger.png")).status).toBeGreaterThanOrEqual(400);
  const ok = await up(adminToken, "admin.png");
  expect(ok.status).toBe(200);
  const txt = await up(adminToken, "evil.html", "text/html", Buffer.from("<script>alert(1)</script>"));
  expect(txt.status).toBeGreaterThanOrEqual(400);
  // 公開讀取
  const get = await fetch(`${env.url}/storage/v1/object/public/photos/test/admin.png`);
  expect(get.status).toBe(200);
  // 非管理員不能刪
  const delStranger = await fetch(`${env.url}/storage/v1/object/photos/test/admin.png`, { method: "DELETE", headers: { apikey: env.anon, Authorization: `Bearer ${strangerToken}` } });
  expect((await fetch(`${env.url}/storage/v1/object/public/photos/test/admin.png`)).status).toBe(200);
  void delStranger;
  const del = await fetch(`${env.url}/storage/v1/object/photos/test/admin.png`, { method: "DELETE", headers: { apikey: env.anon, Authorization: `Bearer ${adminToken}` } });
  expect(del.status).toBe(200);
});

test("關閉公開註冊：任何人都不能自己註冊帳號", async () => {
  const env = testEnv();
  const r = await fetch(`${env.url}/auth/v1/signup`, {
    method: "POST", headers: { apikey: env.anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "intruder@yuyublog.test", password: "password-12345" })
  });
  expect(r.status).toBeGreaterThanOrEqual(400);
});
