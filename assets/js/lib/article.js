// 文章內容排版：公開文章頁與後台「預覽」共用同一份，確保看到的就是發布後的樣子

import { CATS, esc, icon, img, fmtDate, postDate, readingMinutes, renderBody, countryName, figureHtml } from "./util.js";

function money(n, currency) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  try {
    return new Intl.NumberFormat("zh-TW", { style: "currency", currency: currency || "TWD", maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${currency || ""} ${v.toLocaleString("zh-TW")}`;
  }
}

export function hasDetails(d = {}) {
  const r = d.restaurant || {};
  return Boolean(
    (r.name || r.address || r.hours || r.price || r.tips) ||
    (d.cost && (d.cost.items || []).some(i => i.label || i.amount)) ||
    (d.itinerary || []).some(i => i.title || i.text) ||
    (d.transport && d.transport.trim())
  );
}

export function detailsHtml(d = {}) {
  const out = [];
  const r = d.restaurant || {};
  if (r.name || r.address || r.hours || r.price || r.tips) {
    const q = encodeURIComponent([r.name, r.address].filter(Boolean).join(" "));
    out.push(`<section class="info-card" aria-labelledby="info-rest">
      <h3 id="info-rest">${icon("store")}餐廳資訊</h3>
      <dl>
        ${r.name ? `<div><dt>店名</dt><dd>${esc(r.name)}</dd></div>` : ""}
        ${r.address ? `<div><dt>地址</dt><dd>${esc(r.address)}</dd></div>` : ""}
        ${r.hours ? `<div><dt>營業時間</dt><dd>${esc(r.hours)}</dd></div>` : ""}
        ${r.price ? `<div><dt>價位</dt><dd>${esc(r.price)}</dd></div>` : ""}
        ${r.tips ? `<div><dt>小提醒</dt><dd>${esc(r.tips)}</dd></div>` : ""}
      </dl>
      ${q ? `<a class="map-link" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener noreferrer">${icon("pin")}在 Google 地圖開啟</a>` : ""}
    </section>`);
  }
  const cost = d.cost || {};
  const items = (cost.items || []).filter(i => i.label || i.amount);
  if (items.length) {
    const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    out.push(`<section class="info-card" aria-labelledby="info-cost">
      <h3 id="info-cost">${icon("wallet")}旅遊花費</h3>
      <ul class="cost-list">${items.map(i => `<li><span>${esc(i.label)}</span><span>${money(i.amount, cost.currency)}</span></li>`).join("")}</ul>
      <div class="total"><span>合計</span><b>${money(total, cost.currency)}</b></div>
      ${cost.note ? `<p style="margin-top:var(--s-3);font-size:var(--t-xs);color:var(--muted)">${esc(cost.note)}</p>` : ""}
    </section>`);
  }
  const iti = (d.itinerary || []).filter(i => i.title || i.text);
  if (iti.length) {
    out.push(`<section class="info-card" aria-labelledby="info-iti">
      <h3 id="info-iti">${icon("route")}行程</h3>
      <ol class="timeline">${iti.map(i => `<li>${i.title ? `<b>${esc(i.title)}</b>` : ""}${esc(i.text || "")}</li>`).join("")}</ol>
    </section>`);
  }
  if (d.transport && d.transport.trim()) {
    out.push(`<section class="info-card" aria-labelledby="info-tr">
      <h3 id="info-tr">${icon("bus")}交通方式</h3>
      <p style="font-size:var(--t-sm);line-height:1.8">${esc(d.transport).replace(/\n/g, "<br>")}</p>
    </section>`);
  }
  return out.join("");
}

// 文章主體（封面 → 標題 → 內文 → 照片集）
export function articleHtml(p) {
  const cat = CATS[p.category] || CATS.travel;
  const photos = p.photos || [];
  const { html: body, used } = renderBody(p.body, photos, p.title);
  const rest = photos.map((ph, i) => ({ ph, i })).filter(({ i }) => !used.has(i));
  const date = postDate(p);
  const where = [countryName(p.country_code), p.city, p.place].filter(Boolean).join(" · ");
  const aside = hasDetails(p.details) ? detailsHtml(p.details) : "";

  return `
  <div class="article-hero">
    <div class="article-hero__media">${img(p.cover, { sizes: "100vw", alt: (p.cover && p.cover.caption) || [p.title, countryName(p.country_code), p.city].filter(Boolean).join("・"), eager: true })}</div>
  </div>
  <header class="article-head container">
    <div class="article-head__card">
      <nav class="breadcrumb" aria-label="麵包屑"><a href="./">首頁</a><span aria-hidden="true">/</span><a href="posts.html?cat=${esc(p.category)}">${cat.label}</a></nav>
      <span class="cat-tag cat-tag--${esc(p.category)}">${cat.label} · ${cat.en}</span>
      <h1 id="article-title">${esc(p.title || "（未命名）")}</h1>
      <div class="article-meta">
        ${where ? `<span>${icon("pin")}${esc(where)}</span>` : ""}
        ${date ? `<span>${icon("calendar")}<time datetime="${esc(date)}">${fmtDate(date)}</time></span>` : ""}
        <span>${icon("clock")}約 ${readingMinutes(p.body)} 分鐘閱讀</span>
        <span id="views"${p.views > 0 ? "" : " hidden"}>${icon("eye")}<span id="view-n">${Number(p.views || 0).toLocaleString("zh-TW")}</span> 人看過</span>
      </div>
    </div>
    ${p.excerpt ? `<p class="standfirst">${esc(p.excerpt)}</p>` : ""}
  </header>

  <div class="container">
    <div class="article-layout${aside ? "" : " no-aside"}">
      <div class="prose" id="prose">${body || '<p style="color:var(--muted)">（這篇還沒有內文）</p>'}</div>
      ${aside ? `<aside class="aside" aria-label="旅行小抄">${aside}</aside>` : ""}
    </div>
    ${rest.length ? `<section class="gallery" aria-labelledby="gallery-title" style="max-width:1080px;margin-inline:auto">
      <div class="gallery__head"><h2 id="gallery-title">更多照片</h2><span class="eyebrow">${rest.length} photos</span></div>
      <div class="gallery__track" id="gallery-track" tabindex="0" aria-label="照片輪播，可左右滑動">
        ${rest.map(({ ph, i }) => `<figure class="gallery__item">
          <button type="button" data-photo="${i}" aria-label="放大照片${ph.caption ? "：" + esc(ph.caption) : ""}">${img(ph, { sizes: "(min-width: 600px) 420px, 78vw", alt: ph.caption || `${p.title}（第 ${i + 1} 張照片）`, small: true })}</button>
          ${ph.caption ? `<figcaption>${esc(ph.caption)}</figcaption>` : ""}
        </figure>`).join("")}
      </div>
      <div class="gallery__dots" id="gallery-dots" aria-hidden="true">${rest.map((_, i) => `<span class="${i === 0 ? "on" : ""}"></span>`).join("")}</div>
    </section>` : ""}
  </div>`;
}

// 互動：點照片開燈箱、輪播圓點
export function bindArticle(root, p, openLightbox) {
  const photos = p.photos || [];
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-photo]");
    if (!b) return;
    openLightbox(photos, Number(b.dataset.photo));
  });
  const track = root.querySelector("#gallery-track");
  const dots = root.querySelectorAll("#gallery-dots span");
  if (track && dots.length) {
    track.addEventListener("scroll", () => {
      const max = track.scrollWidth - track.clientWidth;
      const i = max > 0 ? Math.round((track.scrollLeft / max) * (dots.length - 1)) : 0;
      dots.forEach((d, k) => d.classList.toggle("on", k === i));
    }, { passive: true });
  }
}

export { figureHtml };
