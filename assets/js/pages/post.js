import { getParam, prefersReducedMotion } from "../lib/util.js";
import { getPost, relatedPosts, likePost, viewPost } from "../lib/data.js";
import { initPage, cardHtml, stateHtml, reveal, stagger, toast, openLightbox } from "../lib/ui.js";
import { articleHtml, bindArticle } from "../lib/article.js";

initPage("posts");

const $ = id => document.getElementById(id);
const id = getParam("id");
const article = $("article");

function setMeta(name, value, attr = "name") {
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, name); document.head.appendChild(el); }
  el.setAttribute("content", value);
}

function notFound(title, text) {
  article.removeAttribute("aria-busy");
  article.innerHTML = `<div class="container section">${stateHtml({ title, text,
    action: '<a class="btn btn--ghost" href="posts.html">回到文章列表</a>' })}</div>`;
  document.title = `${title}｜魚魚出去玩`;
  setMeta("robots", "noindex");
}

async function load() {
  let p;
  try {
    p = await getPost(id);
  } catch (e) {
    article.removeAttribute("aria-busy");
    article.innerHTML = `<div class="container section">${stateHtml({ kind: "error", title: "文章載入失敗", text: e.message,
      action: '<button class="btn btn--ghost" type="button" id="retry">再試一次</button>' })}</div>`;
    $("retry").addEventListener("click", () => location.reload());
    return;
  }
  if (!p) return notFound("找不到這篇文章", "可能已經被移除，或網址打錯了。");

  // SEO / 分享資訊
  const desc = (p.excerpt || p.body || "").replace(/\[照片\s*\d+\]|[#>*]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  document.title = `${p.title}｜魚魚出去玩`;
  setMeta("description", desc);
  setMeta("og:title", p.title, "property");
  setMeta("og:description", desc, "property");
  if (p.cover && p.cover.url) setMeta("og:image", p.cover.url, "property");
  const ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.textContent = JSON.stringify({
    "@context": "https://schema.org", "@type": "BlogPosting",
    headline: p.title, description: desc, image: p.cover ? [p.cover.url] : undefined,
    datePublished: p.published_at, dateModified: p.updated_at || p.published_at,
    author: { "@type": "Person", name: "魚魚（榆芳）" }
  });
  document.head.appendChild(ld);

  article.removeAttribute("aria-busy");
  article.innerHTML = articleHtml(p);
  if (p.status && p.status !== "published") {
    article.insertAdjacentHTML("afterbegin", `<div class="preview-bar" role="status">草稿預覽：這篇還沒發布，只有登入的魚魚看得到</div>`);
    setMeta("robots", "noindex");
  }
  bindArticle(article, p, openLightbox);
  [...article.querySelectorAll(".prose > *, .aside > *, .gallery")].forEach(el => el.classList.add("reveal"));
  reveal(article);
  $("after-article").hidden = false;

  setupBack();
  setupViews(p);
  setupLike(p);
  setupShare(p);
  loadRelated(p);
}

// 從列表進來就回到原本的位置與篩選；直接開網址就回文章列表
function setupBack() {
  const back = $("back-link");
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === location.origin && /posts\.html$/.test(ref.pathname)) {
      back.href = ref.pathname + ref.search;
      back.addEventListener("click", e => { if (history.length > 1) { e.preventDefault(); history.back(); } });
    }
  } catch { /* 用預設連結 */ }
}

// 同一個瀏覽器 6 小時內重複打開同一篇只算一次（避免重新整理刷數字）
function setupViews(p) {
  if (p.status && p.status !== "published") return;
  const show = n => {
    if (!(n > 0)) return;
    $("view-n").textContent = Number(n).toLocaleString("zh-TW");
    $("views").hidden = false;
  };
  show(p.views);
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem("viewed") || "{}"); } catch { /* 無痕模式 */ }
  if (Date.now() - (seen[p.id] || 0) < 6 * 3600 * 1000) return;
  viewPost(p.id).then(n => {
    if (n === null) return;
    show(n);
    seen[p.id] = Date.now();
    try { localStorage.setItem("viewed", JSON.stringify(seen)); } catch { /* 忽略 */ }
  }).catch(() => {});
}

function likedSet() {
  try { return new Set(JSON.parse(localStorage.getItem("liked") || "[]")); } catch { return new Set(); }
}
function saveLiked(s) {
  try { localStorage.setItem("liked", JSON.stringify([...s])); } catch { /* 無痕模式就不記 */ }
}

function setupLike(p) {
  const btn = $("like-btn");
  const n = $("like-n");
  if (p.status && p.status !== "published") { btn.hidden = true; return; }
  let likes = p.likes || 0;
  let busy = false;
  const render = on => {
    btn.setAttribute("aria-pressed", String(on));
    n.textContent = likes ? `· ${likes}` : "";
  };
  render(likedSet().has(p.id));
  btn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    const s = likedSet();
    const on = !s.has(p.id);
    const before = likes;
    likes = Math.max(0, likes + (on ? 1 : -1));
    render(on);                                  // 先更新畫面，失敗再還原
    if (on && !prefersReducedMotion()) { btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); }
    try {
      const fresh = await likePost(p.id, on ? 1 : -1);
      if (typeof fresh === "number") likes = fresh;
      on ? s.add(p.id) : s.delete(p.id);
      saveLiked(s);
      render(on);
    } catch (e) {
      likes = before;
      render(!on);
      toast(e.message || "沒有成功，請再試一次", "error");
    }
    busy = false;
  });
}

function setupShare(p) {
  const url = location.origin + location.pathname + `?id=${encodeURIComponent(p.id)}`;
  const menu = $("share-menu");
  const btn = $("share-btn");
  const panel = $("share-panel");
  panel.innerHTML = `
    <button type="button" role="menuitem" data-copy>複製連結</button>
    <a role="menuitem" href="https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">分享到 LINE</a>
    <a role="menuitem" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">分享到 Facebook</a>
    <a role="menuitem" href="https://www.threads.net/intent/post?text=${encodeURIComponent(p.title + " " + url)}" target="_blank" rel="noopener noreferrer">分享到 Threads</a>`;
  const setOpen = open => { menu.classList.toggle("is-open", open); btn.setAttribute("aria-expanded", String(open)); };
  btn.addEventListener("click", async () => {
    // 手機優先使用系統分享面板
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: p.title, text: p.excerpt || "", url }); } catch { /* 使用者取消 */ }
      return;
    }
    setOpen(!menu.classList.contains("is-open"));
    if (menu.classList.contains("is-open")) panel.querySelector("[role=menuitem]").focus();
  });
  panel.querySelector("[data-copy]").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(url); toast("連結已複製"); }
    catch { toast("無法自動複製，請長按網址列複製", "error"); }
    setOpen(false);
  });
  document.addEventListener("click", e => { if (!menu.contains(e.target)) setOpen(false); });
  menu.addEventListener("keydown", e => { if (e.key === "Escape") { setOpen(false); btn.focus(); } });
}

async function loadRelated(p) {
  const box = $("related");
  try {
    const list = await relatedPosts(p, 3);
    if (!list.length) { box.closest("section").hidden = true; return; }
    box.innerHTML = list.map(r => cardHtml(r)).join("");
    stagger(box);
    reveal(box);
  } catch {
    box.closest("section").hidden = true;
  }
}

// 閱讀進度
const bar = $("progress");
function progress() {
  const h = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
}
addEventListener("scroll", progress, { passive: true });

if (!id) notFound("找不到這篇文章", "網址少了文章編號。");
else load();
