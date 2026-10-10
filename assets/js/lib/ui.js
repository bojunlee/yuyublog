// 公開網站共用介面：頁首、頁尾、手機選單、進場動畫、toast、燈箱、卡片

import { CATS, esc, icon, img, fmtDate, postDate, placeLine, prefersReducedMotion } from "./util.js";
import { isDemo, getProfile } from "./data.js";
import { initFonts } from "./fonts.js";

document.documentElement.classList.add("js");
initFonts();

export const BRAND_MARK = `<svg class="brand__mark" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 21c5-8 16-10 25-3l6-6v18l-6-6c-9 7-20 5-25-3z"/>
  <path d="M16 15.5c1.8 3 1.8 7 0 10"/>
  <circle cx="10.5" cy="19.5" r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="7" cy="9" r="1.6"/><circle cx="11.5" cy="5.5" r="1"/>
</svg>`;

const NAV = [
  { href: "./", key: "home", zh: "首頁", en: "Home" },
  { href: "posts.html", key: "posts", zh: "文章", en: "Stories" },
  { href: "footprints.html", key: "footprints", zh: "旅行足跡", en: "Footprints" },
  { href: "about.html", key: "about", zh: "關於魚魚", en: "About" }
];

export function brandHtml(tag = "a") {
  const attrs = tag === "a" ? ' href="./"' : "";
  return `<${tag} class="brand"${attrs}>${BRAND_MARK}<span class="brand__text"><span class="brand__zh">魚魚出去玩</span><span class="brand__en">Yuyu goes out</span></span></${tag}>`;
}

// ── 頁首 / 手機選單 ───────────────────────────
function mountHeader(page) {
  const header = document.getElementById("site-header");
  if (!header) return;
  const links = NAV.map(n => `<a href="${n.href}"${n.key === page ? ' aria-current="page"' : ""}>${n.zh}</a>`).join("");
  header.className = "site-header";
  header.innerHTML = `<div class="container site-header__inner">
      ${brandHtml()}
      <nav class="site-nav" aria-label="主要導覽">${links}</nav>
      <div class="header-actions">
        <a class="icon-btn" href="posts.html#search" aria-label="搜尋文章">${icon("search")}</a>
        <button class="icon-btn menu-btn" type="button" aria-label="開啟選單" aria-expanded="false" aria-controls="mobile-nav">${icon("menu")}</button>
      </div>
    </div>`;

  const panel = document.createElement("div");
  panel.className = "mobile-nav";
  panel.id = "mobile-nav";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "選單");
  panel.innerHTML = `
    <button class="icon-btn mobile-nav__close" type="button" aria-label="關閉選單">${icon("close")}</button>
    <nav aria-label="主要導覽"><ul>${NAV.map(n =>
      `<li><a href="${n.href}"${n.key === page ? ' aria-current="page"' : ""}>${n.zh}<span>${n.en}</span></a></li>`).join("")}</ul></nav>
    <div class="mobile-nav__foot"><p class="hand">世界那麼大，我想一個地方一個地方去看看。</p></div>`;
  document.body.appendChild(panel);

  const btn = header.querySelector(".menu-btn");
  const closeBtn = panel.querySelector(".mobile-nav__close");
  const setOpen = open => {
    panel.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
    btn.setAttribute("aria-expanded", String(open));
    panel.inert = !open;
    if (open) closeBtn.focus(); else btn.focus({ preventScroll: true });
  };
  panel.inert = true;
  btn.addEventListener("click", () => setOpen(true));
  closeBtn.addEventListener("click", () => setOpen(false));
  panel.addEventListener("keydown", e => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Tab") trapFocus(e, panel);
  });

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

export function trapFocus(e, root) {
  const f = [...root.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// ── 社群連結 ─────────────────────────────────
const SOCIAL_META = {
  instagram: { label: "Instagram", url: v => v.startsWith("http") ? v : `https://www.instagram.com/${v.replace(/^@/, "")}/` },
  threads:   { label: "Threads",   url: v => v.startsWith("http") ? v : `https://www.threads.net/@${v.replace(/^@/, "")}` },
  facebook:  { label: "Facebook",  url: v => v.startsWith("http") ? v : `https://www.facebook.com/${v}` },
  youtube:   { label: "YouTube",   url: v => v.startsWith("http") ? v : `https://www.youtube.com/@${v.replace(/^@/, "")}` },
  email:     { label: "Email",     url: v => `mailto:${v}` }
};
export function socialLinks(socials = {}) {
  return Object.entries(SOCIAL_META)
    .filter(([k]) => socials[k] && String(socials[k]).trim())
    .map(([k, m]) => {
      const href = m.url(String(socials[k]).trim());
      if (!/^(https:|mailto:)/.test(href)) return "";
      return `<a href="${esc(href)}" ${k === "email" ? "" : 'target="_blank" rel="noopener noreferrer"'} aria-label="${m.label}">${icon(k === "email" ? "mail" : k)}</a>`;
    }).join("");
}

// ── 頁尾 ─────────────────────────────────────
async function mountFooter() {
  const footer = document.getElementById("site-footer");
  if (!footer) return;
  footer.className = "site-footer";
  const year = new Date().getFullYear();
  const render = (pf = {}) => {
    const social = socialLinks(pf.socials);
    footer.innerHTML = `<div class="container">
      <div class="footer-top">
        <div class="footer-brand">
          ${brandHtml()}
          <p>${esc(pf.intro || "一個愛吃、愛玩、愛拍照的女生，用自己的雙腳收集世界。")}</p>
          <p class="footer-quote">${esc(pf.philosophy || "旅行不是逃避生活，而是讓生活更完整。")}</p>
        </div>
        <div class="footer-col"><h3>探索</h3><ul>
          <li><a href="posts.html">所有文章</a></li>
          <li><a href="footprints.html">旅行足跡</a></li>
          <li><a href="footprints.html#wishlist">願望清單</a></li>
          <li><a href="about.html">關於魚魚</a></li>
        </ul></div>
        <div class="footer-col"><h3>分類</h3><ul>
          ${Object.entries(CATS).map(([k, c]) => `<li><a href="posts.html?cat=${k}">${c.label}</a></li>`).join("")}
        </ul></div>
        <div class="footer-col"><h3>追蹤魚魚</h3>
          ${social ? `<div class="socials">${social}</div>` : `<p style="font-size:var(--t-sm)">社群帳號即將公開，敬請期待。</p>`}
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${year} 魚魚出去玩 Yuyu goes out · 文字與照片版權所有</span>
      </div>
    </div>`;
  };
  render();
  try { render(await getProfile()); } catch { /* 頁尾用預設文字就好 */ }
}

// ── 示範模式提示 ─────────────────────────────
function mountDemoRibbon() {
  if (!isDemo) return;
  let hidden = false;
  try { hidden = sessionStorage.getItem("demo-ribbon") === "off"; } catch { /* 無痕模式 */ }
  if (hidden) return;
  const el = document.createElement("div");
  el.className = "demo-ribbon";
  el.setAttribute("role", "note");
  el.innerHTML = `<span><b>示範內容</b>　尚未連接資料庫，畫面上的文章與照片僅供預覽設計</span>
    <button type="button" aria-label="關閉提示">${icon("close")}</button>`;
  el.querySelector("button").addEventListener("click", () => {
    el.remove();
    try { sessionStorage.setItem("demo-ribbon", "off"); } catch { /* 忽略 */ }
  });
  document.body.appendChild(el);
}

// ── 進場動畫 ─────────────────────────────────
let io = null;
export function reveal(root = document) {
  const els = root.querySelectorAll(".reveal:not(.is-in)");
  if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
    els.forEach(el => el.classList.add("is-in"));
    return;
  }
  if (!io) {
    io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  }
  els.forEach(el => io.observe(el));
}

// 同一組元素錯開進場（最多 4 層）
export function stagger(parent) {
  [...parent.children].forEach((el, i) => {
    el.classList.add("reveal");
    el.style.setProperty("--i", String(i % 4));
  });
}

// ── 手機橫向滑動列的進度條 ───────────────────
export function railProgress(rail, bar) {
  if (!rail || !bar) return;
  bar.innerHTML = "<i></i>";
  const thumb = bar.firstElementChild;
  const update = () => {
    const max = rail.scrollWidth - rail.clientWidth;
    const ratio = rail.scrollWidth ? rail.clientWidth / rail.scrollWidth : 1;
    bar.hidden = max <= 2;
    thumb.style.setProperty("--w", `${Math.max(ratio * 100, 12)}%`);
    const travel = bar.clientWidth * (1 - Math.max(ratio, 0.12));
    thumb.style.setProperty("--x", `${max > 0 ? (rail.scrollLeft / max) * travel : 0}px`);
  };
  rail.addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update, { passive: true });
  requestAnimationFrame(update);
}

// ── Toast ────────────────────────────────────
export function toast(msg, type = "ok") {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    wrap.setAttribute("aria-live", "polite");
    document.body.appendChild(wrap);
  }
  // 同時最多兩則，避免蓋住畫面
  while (wrap.children.length >= 2) wrap.firstElementChild.remove();
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add("is-leaving"); setTimeout(() => el.remove(), 320); }, type === "error" ? 5200 : 2600);
}

// ── 卡片 ─────────────────────────────────────
export function cardHtml(p, { variant = "", sizes = "(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw", eager = false, excerpt = true } = {}) {
  const cat = CATS[p.category] || CATS.travel;
  const where = placeLine(p);
  const href = `post.html?id=${encodeURIComponent(p.id)}`;
  return `<article class="card ${variant ? "card--" + variant : ""}">
    <div class="card__media">
      ${img(p.cover, { sizes, alt: "", eager })}
      ${variant === "h" ? "" : `<span class="cat-tag cat-tag--chip cat-tag--${esc(p.category)}">${cat.label}</span>`}
    </div>
    <div class="card__body">
      ${variant === "h" ? `<span class="cat-tag cat-tag--${esc(p.category)}">${cat.label}</span>` : ""}
      <h3 class="card__title"><a href="${href}">${esc(p.title || "（未命名）")}</a></h3>
      ${excerpt && p.excerpt ? `<p class="card__excerpt">${esc(p.excerpt)}</p>` : ""}
      <div class="card__meta">
        ${where ? `<span>${icon("pin")}${esc(where)}</span>` : ""}
        ${postDate(p) ? `<span><time datetime="${esc(postDate(p))}">${fmtDate(postDate(p))}</time></span>` : ""}
        ${p.likes ? `<span aria-label="${p.likes} 人喜歡">${icon("heart")}${p.likes}</span>` : ""}
      </div>
    </div>
  </article>`;
}

export function skeletonCards(n = 3) {
  return Array.from({ length: n }, () => `<div class="card skeleton-card" aria-hidden="true">
    <div class="card__media skeleton"></div>
    <div><div class="skeleton skeleton-line w40"></div><div class="skeleton skeleton-line w80"></div><div class="skeleton skeleton-line w60"></div></div>
  </div>`).join("");
}

export function stateHtml({ kind = "empty", title, text, action = "" }) {
  const ic = kind === "error" ? "globe" : "search";
  return `<div class="state" role="${kind === "error" ? "alert" : "status"}">
    ${icon(ic, "state__icon")}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}${action}</div>`;
}

// ── 燈箱 ─────────────────────────────────────
export function openLightbox(photos, start = 0) {
  let box = document.getElementById("lightbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "lightbox";
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "照片");
    document.body.appendChild(box);
  }
  const opener = document.activeElement;
  box.innerHTML = `
    <div class="lightbox__bar"><span class="lightbox__count" aria-live="polite"></span>
      <button class="icon-btn" type="button" data-close aria-label="關閉">${icon("close")}</button></div>
    <div class="lightbox__track" tabindex="-1">${photos.map((ph, i) => `
      <figure class="lightbox__slide">
        <img src="${esc(ph.url)}" alt="${esc(ph.caption || `第 ${i + 1} 張照片`)}" ${Math.abs(i - start) > 1 ? 'loading="lazy"' : ""} decoding="async">
        ${ph.caption ? `<figcaption>${esc(ph.caption)}</figcaption>` : "<figcaption></figcaption>"}
      </figure>`).join("")}</div>
    <div class="lightbox__nav">
      <button class="icon-btn" type="button" data-prev aria-label="上一張">${icon("back")}</button>
      <button class="icon-btn" type="button" data-next aria-label="下一張">${icon("arrow")}</button>
    </div>`;
  box.hidden = false;
  document.body.style.overflow = "hidden";
  const track = box.querySelector(".lightbox__track");
  const count = box.querySelector(".lightbox__count");
  const current = () => Math.round(track.scrollLeft / track.clientWidth);
  const go = i => track.scrollTo({ left: Math.max(0, Math.min(photos.length - 1, i)) * track.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  const update = () => { count.textContent = `${current() + 1} / ${photos.length}`; };
  requestAnimationFrame(() => {
    track.scrollLeft = start * track.clientWidth;
    update();
    box.classList.add("is-open");
    box.querySelector("[data-close]").focus();
  });
  track.addEventListener("scroll", update, { passive: true });
  const close = () => {
    box.classList.remove("is-open");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    setTimeout(() => { box.hidden = true; box.innerHTML = ""; }, 200);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  };
  const onKey = e => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") go(current() + 1);
    else if (e.key === "ArrowLeft") go(current() - 1);
    else if (e.key === "Tab") trapFocus(e, box);
  };
  document.addEventListener("keydown", onKey);
  box.querySelector("[data-close]").addEventListener("click", close);
  box.querySelector("[data-prev]").addEventListener("click", () => go(current() - 1));
  box.querySelector("[data-next]").addEventListener("click", () => go(current() + 1));
}

// ── 初始化 ───────────────────────────────────
export function initPage(page) {
  mountHeader(page);
  mountFooter();
  mountDemoRibbon();
  reveal();
}
