// 資料存取層：公開網站只透過這裡讀資料。
// 有設定 Supabase → 讀資料庫；沒設定 → 讀示範內容（畫面會標示）。

import config from "../config.js";
import { DEMO_POSTS, DEMO_PROFILE } from "./demo.js";

export const SUPABASE_ESM = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
export const isDemo = !config.supabaseUrl || !config.supabaseAnonKey;

// 公開網站列表只拿需要的欄位，不拿內文和所有照片
const LIST_COLS = "id,title,excerpt,category,country_code,city,place,visited_on,cover,published_at,featured,likes";

let clientPromise = null;
export function getClient({ timeout = 15000 } = {}) {
  if (isDemo) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import(SUPABASE_ESM).then(({ createClient }) =>
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        global: {
          // 網路卡住時不要永遠轉圈圈
          fetch: (url, opts = {}) => fetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(timeout) })
        }
      }));
  }
  return clientPromise;
}

export class DataError extends Error {}

function fail(error) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const e = new DataError(offline ? "目前沒有網路連線" : "資料載入失敗，請稍後再試");
  e.cause = error;
  return e;
}

// PostgREST 的 or() 篩選語法用逗號與括號分隔，先把使用者輸入的特殊字元拿掉
function cleanQuery(q) {
  return String(q || "").replace(/[,()*%\\:"'.]/g, " ").trim().slice(0, 40);
}

function byNewest(a, b) {
  return String(b.published_at || "").localeCompare(String(a.published_at || ""));
}

// ── 文章列表 ─────────────────────────────────
export async function listPosts({ category = "", q = "", country = "", page = 0, pageSize = 9 } = {}) {
  const query = cleanQuery(q);
  if (isDemo) {
    let items = DEMO_POSTS.slice().sort(byNewest);
    if (category) items = items.filter(p => p.category === category);
    if (country) items = items.filter(p => p.country_code === country);
    if (query) {
      const k = query.toLowerCase();
      items = items.filter(p => [p.title, p.excerpt, p.body, p.city, p.place]
        .some(s => String(s || "").toLowerCase().includes(k)));
    }
    return { items: items.slice(page * pageSize, (page + 1) * pageSize), total: items.length };
  }
  const sb = await getClient();
  let r = sb.from("posts").select(LIST_COLS, { count: "exact" })
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  if (category) r = r.eq("category", category);
  if (country) r = r.eq("country_code", country);
  if (query) {
    const like = `%${query}%`;
    r = r.or(`title.ilike.${like},excerpt.ilike.${like},body.ilike.${like},city.ilike.${like},place.ilike.${like}`);
  }
  const { data, error, count } = await r;
  if (error) throw fail(error);
  return { items: data || [], total: count || 0 };
}

export async function featuredPost() {
  if (isDemo) return DEMO_POSTS.find(p => p.featured) || DEMO_POSTS[0] || null;
  const sb = await getClient();
  const { data, error } = await sb.from("posts").select(LIST_COLS)
    .eq("status", "published").eq("featured", true).limit(1).maybeSingle();
  if (error) throw fail(error);
  return data;
}

// 足跡與分類統計用：所有已發布文章的地點與分類（欄位很少，量大也很輕）
export async function allPlaces() {
  if (isDemo) return DEMO_POSTS.map(({ id, title, category, country_code, city, visited_on, cover, published_at }) =>
    ({ id, title, category, country_code, city, visited_on, cover, published_at }));
  const sb = await getClient();
  const { data, error } = await sb.from("posts")
    .select("id,title,category,country_code,city,visited_on,cover,published_at")
    .eq("status", "published")
    .order("visited_on", { ascending: false, nullsFirst: false });
  if (error) throw fail(error);
  return data || [];
}

// 首頁「照片日記」：最近幾篇文章裡的照片，優先挑不是封面的，避免和文章卡片重複
export async function recentPhotos(limit = 8) {
  let posts;
  if (isDemo) {
    posts = DEMO_POSTS.slice().sort(byNewest).slice(0, 8);
  } else {
    const sb = await getClient();
    const { data, error } = await sb.from("posts").select("id,title,city,country_code,cover,photos")
      .eq("status", "published").order("published_at", { ascending: false }).limit(8);
    if (error) throw fail(error);
    posts = data || [];
  }
  const out = [];
  const seen = new Set();
  const take = (ph, p) => {
    if (!ph || !ph.url || seen.has(ph.url) || out.length >= limit) return;
    seen.add(ph.url);
    out.push({ ...ph, post: { id: p.id, title: p.title, city: p.city, country_code: p.country_code } });
  };
  for (let round = 0; round < 3; round++) {
    for (const p of posts) take((p.photos || []).filter(ph => ph && (!p.cover || ph.url !== p.cover.url))[round], p);
  }
  for (const p of posts) take(p.cover, p);
  return out;
}

// ── 單篇文章 ─────────────────────────────────
export async function getPost(id) {
  if (!id) return null;
  if (isDemo) return DEMO_POSTS.find(p => p.id === id) || null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await getClient();
  // 管理員登入狀態下可以讀到草稿（RLS 決定），用來預覽
  const { data, error } = await sb.from("posts").select("*").eq("id", id).maybeSingle();
  if (error) throw fail(error);
  return data;
}

export async function relatedPosts(post, n = 3) {
  if (isDemo) {
    const others = DEMO_POSTS.filter(p => p.id !== post.id);
    const score = p => (p.country_code === post.country_code ? 2 : 0) + (p.category === post.category ? 1 : 0);
    return others.sort((a, b) => score(b) - score(a) || byNewest(a, b)).slice(0, n);
  }
  const sb = await getClient();
  const pick = async (col, val) => {
    if (!val) return [];
    const { data } = await sb.from("posts").select(LIST_COLS).eq("status", "published")
      .eq(col, val).neq("id", post.id).order("published_at", { ascending: false }).limit(n);
    return data || [];
  };
  const [sameCountry, sameCat] = await Promise.all([pick("country_code", post.country_code), pick("category", post.category)]);
  const seen = new Set();
  let list = [...sameCountry, ...sameCat].filter(p => !seen.has(p.id) && seen.add(p.id));
  if (list.length < n) {
    const { data } = await sb.from("posts").select(LIST_COLS).eq("status", "published")
      .neq("id", post.id).order("published_at", { ascending: false }).limit(n + 3);
    list = list.concat((data || []).filter(p => !seen.has(p.id) && seen.add(p.id)));
  }
  return list.slice(0, n);
}

// 記一次閱讀。魚魚自己登入時不算；草稿不算（資料庫只會對已發布文章 +1）
// 回傳最新人數，沒有計到（或資料庫還沒更新）回傳 null
export async function viewPost(id) {
  if (isDemo) return null;
  const sb = await getClient();
  const { data: { session } } = await sb.auth.getSession();
  if (session) return null;
  const { data, error } = await sb.rpc("view_post", { pid: id });
  return error ? null : data;
}

export async function likePost(id, delta) {
  if (isDemo) return null;
  const sb = await getClient();
  const { data, error } = await sb.rpc("like_post", { pid: id, delta });
  if (error) throw fail(error);
  return data;
}

// ── 個人資料 ─────────────────────────────────
let profileCache = null;
export async function getProfile() {
  if (isDemo) return DEMO_PROFILE;
  if (profileCache) return profileCache;
  const sb = await getClient();
  const { data, error } = await sb.from("profile").select("*").eq("id", 1).maybeSingle();
  if (error) throw fail(error);
  profileCache = data || {};
  return profileCache;
}
