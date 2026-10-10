import { CATS, esc, icon, img, countryName, placeLine } from "../lib/util.js";
import { getProfile, listPosts, featuredPost, allPlaces, recentPhotos } from "../lib/data.js";
import { initPage, cardHtml, skeletonCards, stateHtml, reveal, stagger, railProgress, socialLinks } from "../lib/ui.js";
import { worldMapSvg } from "../lib/map.js";

initPage("home");

const $ = id => document.getElementById(id);
const U = (id, w) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
const stock = id => ({ url: U(id, 2000), thumb: U(id, 800), w: 2000, h: 1333 });
const ARROW = icon("arrow", "ic--arrow");
const WORLD = 195;

// 還沒有魚魚自己的照片時使用的預設圖（Unsplash License）
const DEFAULT_HERO = { ...stock("1570077188670-e3a8d69ac5ff"), credit: "Unsplash" };
const DEFAULT_CAT = {
  travel: stock("1476514525535-07fb3b4ae5f1"),
  food: stock("1504674900247-0877df9cc836"),
  stay: stock("1566073771259-6a8506099945"),
  life: stock("1495474472287-4d71bcdd2085")
};

// ── 主視覺 ──────────────────────────────────
const hero = $("hero");
// 預設大圖直接寫在 index.html（瀏覽器一開始就下載，首屏最快）；魚魚在後台換了大圖才替換
const sameImage = (a, b) => String(a || "").split("?")[0] === String(b || "").split("?")[0];
function showHero(ph) {
  let el = $("hero-media").querySelector("img");
  if (!el || !sameImage(el.currentSrc || el.src, ph.url)) {
    $("hero-media").innerHTML = img(ph, { sizes: "100vw", alt: ph.caption || "魚魚的旅行照片", eager: true });
    el = $("hero-media").querySelector("img");
    $("hero-credit").textContent = ph.credit ? `Photo · ${ph.credit}` : "";
  }
  const ready = () => requestAnimationFrame(() => hero.classList.add("is-ready"));
  if (!el || el.complete) ready();
  else { el.addEventListener("load", ready, { once: true }); el.addEventListener("error", ready, { once: true }); }
  setTimeout(ready, 2500);     // 網路很慢時文字也不要一直藏著
}

const profileP = getProfile().catch(() => ({}));
const placesP = allPlaces().catch(() => null);

async function loadHero() {
  showHero(DEFAULT_HERO);                       // 不等資料庫，先讓預設大圖與標題進場
  const pf = await profileP;
  if (pf.hero_image && pf.hero_image.url) showHero(pf.hero_image);
  if (pf.tagline) $("hero-tagline").textContent = pf.tagline;
  if (pf.hero_note) $("hero-note").innerHTML = `${esc(pf.hero_note)} ${icon("heart")}`;
  if (pf.philosophy) $("closing-quote").textContent = pf.philosophy;
}

// ── 分類 ───────────────────────────────────
function renderCats(places) {
  const list = places || [];
  $("cats").innerHTML = Object.entries(CATS).map(([k, c], i) => {
    const own = list.filter(p => p.category === k);
    const cover = (own.find(p => p.cover && p.cover.url) || {}).cover || DEFAULT_CAT[k];
    return `<a class="cat-tile" href="posts.html?cat=${k}">
      ${img(cover, { sizes: "(min-width: 900px) 25vw, (min-width: 640px) 50vw, 44vw", alt: "", small: true })}
      <span class="cat-tile__no" aria-hidden="true">0${i + 1}</span>
      <span class="cat-tile__body">
        ${icon(k, "ic--cat")}
        <span class="cat-tile__en">${c.en}</span>
        <span class="cat-tile__zh">${c.label}<small>${own.length} 篇</small></span>
        <span class="cat-tile__go" aria-hidden="true">看文章 ${icon("arrow")}</span>
      </span></a>`;
  }).join("");
  stagger($("cats"));
  reveal($("cats"));
  railProgress($("cats"), $("cats-progress"));
}

// ── 封面故事與最新文章 ────────────────────────
async function loadStories() {
  const box = $("latest-list");
  box.innerHTML = `<div class="grid-cards">${skeletonCards(3)}</div>`;
  try {
    const [feat, { items }] = await Promise.all([featuredPost(), listPosts({ pageSize: 8 })]);
    if (feat) {
      $("feature-sec").hidden = false;
      const c = CATS[feat.category] || CATS.travel;
      const where = placeLine(feat);
      $("feature").innerHTML = `<article class="feature reveal">
        <div class="feature__media">${img(feat.cover, { sizes: "(min-width: 900px) 64vw, 100vw", alt: "" })}</div>
        <div class="feature__body">
          <span class="feature__no">Cover Story · No.01</span>
          <span class="cat-tag cat-tag--${esc(feat.category)}">${c.label} · ${c.en}</span>
          <h3 class="feature__title"><a href="post.html?id=${encodeURIComponent(feat.id)}">${esc(feat.title)}</a></h3>
          ${feat.excerpt ? `<p class="feature__excerpt">${esc(feat.excerpt)}</p>` : ""}
          ${where ? `<div class="card__meta"><span>${icon("pin")}${esc(where)}</span></div>` : ""}
          <span class="text-link" aria-hidden="true">閱讀全文 ${ARROW}</span>
        </div></article>`;
      reveal($("feature"));
    }
    const rest = items.filter(p => !feat || p.id !== feat.id).slice(0, 7);
    if (!rest.length && !feat) {
      box.innerHTML = stateHtml({ title: "魚魚正在整理第一篇旅行筆記", text: "很快就會在這裡跟大家分享，先去認識一下魚魚吧！",
        action: '<a class="btn btn--ghost" href="about.html">認識魚魚</a>' });
      return;
    }
    box.innerHTML = rest.length
      ? `<div class="latest-grid m-rail" id="latest-grid">${rest.map((p, i) =>
          cardHtml(p, { sizes: i === 0 ? "(min-width: 900px) 60vw, 80vw" : "(min-width: 900px) 30vw, 80vw" })).join("")}</div>`
      : "";
    if ($("latest-grid")) {
      stagger($("latest-grid"));
      railProgress($("latest-grid"), $("latest-progress"));
    }
    reveal(box);
  } catch (e) {
    box.innerHTML = stateHtml({ kind: "error", title: "文章暫時載入不了", text: e.message,
      action: '<button class="btn btn--ghost" type="button" id="retry">再試一次</button>' });
    $("retry").addEventListener("click", loadStories);
  }
}

// ── 照片日記 ─────────────────────────────────
async function loadDiary() {
  let photos = [];
  try { photos = await recentPhotos(8); } catch { /* 這一區是加分項，失敗就不顯示 */ }
  if (photos.length < 3) return;
  $("diary").hidden = false;
  const grid = $("diary-grid");
  grid.innerHTML = photos.map((ph, i) => {
    const where = [ph.post.city, countryName(ph.post.country_code)].filter(Boolean).join(" · ");
    return `<a class="diary-item${i >= 5 ? " diary-item--extra" : ""}" href="post.html?id=${encodeURIComponent(ph.post.id)}">
      ${img(ph, { sizes: i === 0 ? "(min-width: 900px) 50vw, 80vw" : "(min-width: 900px) 25vw, 64vw", alt: ph.caption || ph.post.title, small: i !== 0 })}
      <span class="diary-item__cap">${where ? `<b>${esc(where)}</b>` : ""}${esc(ph.caption || ph.post.title)}</span>
    </a>`;
  }).join("");
  // 桌機拼貼只放 5 張，其餘留給手機滑動列
  const desktop = matchMedia("(min-width: 641px)");
  const fit = () => grid.querySelectorAll(".diary-item--extra").forEach(el => { el.hidden = desktop.matches; });
  fit();
  desktop.addEventListener("change", fit);
  stagger(grid);
  reveal(grid);
  railProgress(grid, $("diary-progress"));
}

// ── 關於魚魚（拍立得拼貼）＋ 足跡 ─────────────
function polaroid(cls, ph, caption, fallback = "") {
  return `<figure class="polaroid ${cls}">
    ${ph && ph.url ? img(ph, { sizes: "(min-width: 900px) 320px, 60vw", alt: "", small: true }) : `<div class="monogram">${fallback}</div>`}
    <figcaption>${esc(caption)}</figcaption></figure>`;
}

async function loadPersonal() {
  const [pf, places] = await Promise.all([profileP, placesP]);
  const list = places || [];
  const nick = pf.nickname || "魚魚";
  const countries = new Set(list.map(p => p.country_code).filter(Boolean));
  const cities = new Set(list.filter(p => p.city).map(p => `${p.country_code}|${p.city}`));

  // 統計
  document.querySelectorAll("[data-stat]").forEach(el => {
    el.textContent = places ? { countries: countries.size, cities: cities.size, posts: list.length }[el.dataset.stat] : "—";
  });

  // 拍立得：魚魚的照片 + 最近兩趟旅行
  const trips = list.filter(p => p.cover && p.cover.url);
  const a = trips[0], b = trips.find(p => a && p.country_code !== a.country_code) || trips[1];
  const label = p => (p ? p.city || countryName(p.country_code) || "旅途中" : "");
  $("about-collage").innerHTML =
    (a ? polaroid("polaroid--a", a.cover, label(a)) : "") +
    polaroid("polaroid--main", pf.avatar, `${nick} ♡`, "魚") +
    (b ? polaroid("polaroid--b", b.cover, label(b)) : "") +
    `<span class="collage__note"><svg viewBox="0 0 44 36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M42 30C30 32 14 26 6 8"/><path d="m3 14 3-6 6 3"/></svg>這是我！</span>`;
  $("about-intro").textContent = pf.intro || "";
  $("about-quote").textContent = pf.philosophy || "旅行不是逃避生活，而是讓生活更完整。";
  const fav = (pf.favorites || [])[0];
  $("about-facts").innerHTML = `
    <div><dt>夢想</dt><dd>環遊世界</dd></div>
    <div><dt>足跡</dt><dd>${countries.size} 個國家</dd></div>
    <div><dt>最喜歡</dt><dd>${esc(fav || "清晨的海")}</dd></div>`;
  const ig = pf.socials && pf.socials.instagram;
  if (ig) {
    const links = socialLinks({ instagram: ig });
    const href = (links.match(/href="([^"]+)"/) || [])[1];
    if (href) $("about-actions").insertAdjacentHTML("beforeend",
      `<a class="btn btn--ghost" href="${href}" target="_blank" rel="noopener noreferrer">${icon("instagram")}追蹤 Instagram</a>`);
  }

  // 足跡數字與環遊世界進度
  $("voyage-stats").innerHTML = `
    <div class="stat"><b>${countries.size}</b><span>個國家</span></div>
    <div class="stat"><b>${cities.size}</b><span>座城市</span></div>
    <div class="stat"><b>${list.length}</b><span>篇故事</span></div>`;
  const pct = Math.min(100, (countries.size / WORLD) * 100);
  $("globe-progress").innerHTML = `
    <div class="globe-progress__bar" role="progressbar" aria-label="環遊世界進度" aria-valuemin="0" aria-valuemax="${WORLD}" aria-valuenow="${countries.size}"><i></i></div>
    <div class="globe-progress__label"><span>環遊世界進度</span><span>${countries.size} / ${WORLD} 國 · ${pct.toFixed(1)}%</span></div>`;
  // 進到畫面時才把進度條拉長
  const bar = $("globe-progress").querySelector("i");
  const grow = () => bar.style.setProperty("--p", `${Math.max(pct, countries.size ? 1.5 : 0)}%`);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { grow(); io.disconnect(); } });
    io.observe(bar);
  } else grow();

  // 願望郵票
  const wishes = (pf.wishlist || []).slice(0, 5);
  $("wish-list").innerHTML = wishes.length
    ? wishes.map((w, i) => `<li class="stamp-card">
        <span class="stamp-card__seal" aria-hidden="true">NEXT<br>STOP</span>
        <span class="n">${String(i + 1).padStart(2, "0")}</span>
        <b>${esc(countryName(w.country_code))}</b>
        ${w.city ? `<span>${esc(w.city)}</span>` : ""}
        ${w.note ? `<p>${esc(w.note)}</p>` : ""}
      </li>`).join("")
    : `<li class="stamp-card"><span class="n">01</span><b>還在想⋯</b><p>願望清單整理中</p></li>`;
  stagger($("wish-list"));
  reveal($("wish-list"));
  railProgress($("wish-list"), $("wish-progress"));

  // 小地圖：捲到附近才載入（地圖資料約 250 KB）
  const visited = countries;
  const wish = new Set(wishes.map(w => w.country_code).filter(c => c && !visited.has(c)));
  const drawMap = async () => {
    try {
      $("mini-map").innerHTML = await worldMapSvg({ visited, wish, label: `世界地圖：去過 ${visited.size} 個國家，想去 ${wish.size} 個國家` });
    } catch {
      $("mini-map").innerHTML = `<div class="mini-map__ph">地圖暫時無法載入</div>`;
    }
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); drawMap(); } }, { rootMargin: "600px 0px" });
    io.observe($("voyage"));
  } else drawMap();
}

loadHero();
placesP.then(renderCats);
loadStories();
loadDiary();
loadPersonal();
