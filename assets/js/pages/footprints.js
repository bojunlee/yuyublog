import { esc, icon, countryName, prefersReducedMotion } from "../lib/util.js";
import { createExploreMap } from "../lib/explore-map.js";
import { allPlaces, getProfile } from "../lib/data.js";
import { initPage, cardHtml, stateHtml, reveal, stagger } from "../lib/ui.js";

initPage("footprints");

const $ = id => document.getElementById(id);

let places = [];
let wishes = [];

function groupByCountry(list) {
  const map = new Map();
  for (const p of list) {
    const key = p.country_code || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  // 文章多的國家排前面
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || countryName(a[0]).localeCompare(countryName(b[0]), "zh-Hant"));
}

function renderStats() {
  const countries = new Set(places.map(p => p.country_code).filter(Boolean));
  const cities = new Set(places.filter(p => p.city).map(p => `${p.country_code}|${p.city}`));
  $("fp-stats").innerHTML = [
    [countries.size, "個國家"], [cities.size, "座城市"], [places.length, "篇故事"], [wishes.length, "個願望"]
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
}

function renderCountries() {
  const box = $("countries");
  const groups = groupByCountry(places).filter(([code]) => code);
  if (!groups.length) {
    box.innerHTML = stateHtml({ title: "第一枚印章還沒蓋上", text: "魚魚發布第一篇有標示國家的文章後，這裡就會出現她的足跡。" });
    return;
  }
  box.innerHTML = groups.map(([code, list]) => {
    const cities = new Map();
    for (const p of list) {
      const c = p.city || "其他地方";
      if (!cities.has(c)) cities.set(c, []);
      cities.get(c).push(p);
    }
    return `<div class="country-group" id="country-${code}">
      <div class="country-group__head"><h3>${esc(countryName(code))}</h3><span>${list.length} stories</span></div>
      ${[...cities.entries()].map(([city, ps]) => `<div class="city">
        <h4>${icon("pin")}${esc(city)}</h4>
        <ul>${ps.map(p => `<li>${cardHtml(p, { variant: "h", excerpt: false, sizes: "112px" })}</li>`).join("")}</ul>
      </div>`).join("")}
      <a class="text-link" style="margin-top:var(--s-4)" href="posts.html?country=${code}">看${esc(countryName(code))}的所有文章 ${icon("arrow")}</a>
    </div>`;
  }).join("");
  stagger(box);
  reveal(box);
}

function renderWishes() {
  const visited = new Set(places.map(p => p.country_code));
  $("wish-cards").innerHTML = wishes.length
    ? wishes.map((w, i) => `<li class="wish-card reveal" style="--i:${i % 4}">
        <span class="n">${String(i + 1).padStart(2, "0")}</span>
        <b>${esc([countryName(w.country_code), w.city].filter(Boolean).join("・"))}${visited.has(w.country_code) ? ' <small style="font-family:var(--f-sans);font-size:var(--t-xs);color:var(--ocean);letter-spacing:.1em">去過了，還想再去</small>' : ""}</b>
        <p>${esc(w.note || "")}</p></li>`).join("")
    : `<li class="wish-card"><span class="n">01</span><b>還在想下一站⋯</b><p>魚魚正在整理她的願望清單。</p></li>`;
  reveal($("wish-cards"));
}

// 地圖上選了國家：下方列表同步標示（不自動捲走，讓使用者留在地圖上）
function markCountry(code) {
  document.querySelectorAll(".country-group.is-active").forEach(el => el.classList.remove("is-active"));
  if (code) document.getElementById(`country-${code}`)?.classList.add("is-active");
}
function openCountry(code) {
  const target = document.getElementById(`country-${code}`) || $("wishlist");
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

async function drawMap() {
  const wrap = $("map-wrap");
  try {
    await createExploreMap(wrap, { places, wishes, onSelect: markCountry, onOpenCountry: openCountry });
  } catch {
    wrap.innerHTML = `<div class="map-fallback">地圖暫時無法載入（可能是網路問題），下方仍可依國家瀏覽魚魚的足跡。</div>`;
  }
}

async function init() {
  $("countries").innerHTML = '<p style="color:var(--muted)">載入中⋯</p>';
  try {
    const [pl, pf] = await Promise.all([allPlaces(), getProfile().catch(() => ({}))]);
    places = pl;
    wishes = (pf && pf.wishlist) || [];
  } catch (e) {
    $("countries").innerHTML = stateHtml({ kind: "error", title: "足跡載入失敗", text: e.message,
      action: '<button class="btn btn--ghost" type="button" id="retry">再試一次</button>' });
    $("retry").addEventListener("click", init);
    $("map-wrap").innerHTML = `<div class="map-fallback">資料載入失敗，地圖無法顯示。</div>`;
    return;
  }
  renderStats();
  renderCountries();
  renderWishes();
  drawMap();
  if (location.hash === "#wishlist") setTimeout(() => $("wishlist").scrollIntoView(), 100);
}

init();
