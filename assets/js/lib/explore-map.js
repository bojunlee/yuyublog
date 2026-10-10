// 旅行足跡頁的互動地圖
// - 手機：一開始就放大到魚魚的足跡；每個國家有固定 44px 的圖釘點擊範圍，不受縮放影響
// - 縮放：按鈕、雙指縮放、拖曳移動（單指上下滑仍然是捲動頁面）
// - 動畫：進入畫面時依「實際造訪順序」畫出旅行路線，國家依序上色、圖釘彈出；只有最新一站會輕微脈動
// - prefers-reduced-motion：直接顯示完成狀態

import { esc, icon, img, countryName, fmtDate, prefersReducedMotion } from "./util.js";
import { loadWorld, numToCode, W, H } from "./map.js";

const ROUTE_MS = 2600;      // 路線畫完的總時間
const ZOOM_MS = 650;
const MIN_W = 70;           // 最多放大到可視寬度 70 單位（約一個小國家）

const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function createExploreMap(root, { places = [], wishes = [], onSelect = () => {}, onOpenCountry = () => {} } = {}) {
  const [geo, topo, world] = await loadWorld();
  const features = topo.feature(world, world.objects.countries).features.filter(f => f.properties.name !== "Antarctica");
  const projection = geo.geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], { type: "FeatureCollection", features });
  const path = geo.geoPath(projection);
  const byCode = new Map(features.map(f => [numToCode[f.id], f]).filter(([c]) => c));

  // 多塊領土的國家（法國、美國⋯）用面積最大的那塊當代表位置
  const mainPart = f => {
    if (f.geometry.type !== "MultiPolygon") return f;
    let best = f, area = -1;
    for (const coordinates of f.geometry.coordinates) {
      const g = { type: "Feature", geometry: { type: "Polygon", coordinates } };
      const a = path.area(g);
      if (a > area) { area = a; best = g; }
    }
    return best;
  };

  // ── 整理資料 ──
  const info = new Map();
  for (const p of places) {
    if (!p.country_code || !byCode.has(p.country_code)) continue;
    const c = info.get(p.country_code) || { code: p.country_code, posts: [], first: "9999", cities: new Set() };
    c.posts.push(p);
    const d = p.visited_on || (p.published_at || "").slice(0, 10) || "9999";
    if (d < c.first) c.first = d;
    if (p.city) c.cities.add(p.city);
    info.set(p.country_code, c);
  }
  const order = [...info.values()].sort((a, b) => a.first.localeCompare(b.first)).map(c => c.code);
  const wishMap = new Map(wishes.filter(w => w.country_code && byCode.has(w.country_code) && !info.has(w.country_code)).map(w => [w.country_code, w]));
  const anchor = code => path.centroid(mainPart(byCode.get(code)));
  const bounds = code => path.bounds(mainPart(byCode.get(code)));
  const step = order.length > 1 ? ROUTE_MS / (order.length - 1) : 0;
  const delayOf = code => (order.indexOf(code) >= 0 ? order.indexOf(code) * step : 0);

  // ── 旅行路線：依造訪順序連成弧線 ──
  const pts = order.map(anchor);
  let route = "";
  pts.forEach(([x, y], i) => {
    if (i === 0) { route = `M${x.toFixed(1)} ${y.toFixed(1)}`; return; }
    const [px, py] = pts[i - 1];
    const mx = (px + x) / 2, my = (py + y) / 2;
    const dx = x - px, dy = y - py;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }                 // 弧線一律往上拱
    const bend = Math.min(len * .22, 60);
    route += ` Q${(mx + nx * bend).toFixed(1)} ${(my + ny * bend).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const latest = order[order.length - 1];
  const shapes = features.map(f => {
    const code = numToCode[f.id] || "";
    const d = path(f);
    if (!d) return "";
    const cls = info.has(code) ? "is-visited" : wishMap.has(code) ? "is-wish" : "";
    const label = code ? countryName(code) : f.properties.name;
    return `<path class="country ${cls}" data-code="${cls ? code : ""}" data-label="${esc(label)}" style="--d:${delayOf(code)}ms" d="${d}"></path>`;
  }).join("");

  const pin = (code, kind) => {
    const [x, y] = anchor(code);
    const n = kind === "visited" ? info.get(code).posts.length : 0;
    const label = kind === "visited" ? `${countryName(code)}，${n} 篇文章` : `${countryName(code)}，想去`;
    return `<g class="pin pin--${kind}${code === latest ? " is-latest" : ""}" data-code="${code}" data-label="${esc(label)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"
        tabindex="0" role="button" aria-label="${esc(label)}">
      <g class="pin__s"><circle class="pin__hit" r="22"></circle><g class="pin__pop" style="--d:${delayOf(code)}ms">
        ${code === latest ? '<circle class="pin__pulse" r="7"></circle>' : ""}
        <circle class="pin__dot" r="${kind === "visited" ? 6 : 5.5}"></circle>
      </g></g></g>`;
  };

  root.innerHTML = `
    <div class="xmap-stage" tabindex="-1">
      <svg class="xmap" viewBox="0 0 ${W} ${H}" role="group" aria-label="世界地圖：去過 ${info.size} 個國家，想去 ${wishMap.size} 個國家。可以用圖釘按鈕選國家。">
        <path class="sphere" d="${path({ type: "Sphere" })}"></path>
        <g class="xmap__land">${shapes}</g>
        ${order.length > 1 ? `<path class="xmap__route" d="${route}"></path>` : ""}
        <g class="xmap__pins">${[...wishMap.keys()].map(c => pin(c, "wish")).join("")}${order.map(c => pin(c, "visited")).join("")}</g>
      </svg>
      <div class="xmap-tools" role="group" aria-label="地圖縮放">
        <button type="button" class="xmap-btn" data-zoom="in" aria-label="放大">＋</button>
        <button type="button" class="xmap-btn" data-zoom="out" aria-label="縮小">－</button>
        <button type="button" class="xmap-btn" data-zoom="mine" aria-label="看我的足跡">${icon("pin")}</button>
        <button type="button" class="xmap-btn" data-zoom="world" aria-label="看全世界">${icon("globe")}</button>
      </div>
      <p class="xmap-hint" aria-hidden="true">${matchMedia("(pointer: coarse)").matches ? "雙指縮放・左右拖曳・點圖釘看故事" : "拖曳移動・雙擊放大・點圖釘看故事"}</p>
      <div class="map-tip" aria-hidden="true"></div>
    </div>
    <div class="xmap-panel" hidden aria-live="polite"></div>
    ${info.size || wishMap.size ? `<div class="xmap-chips chips" role="group" aria-label="快速選擇國家">
      ${[...info.values()].sort((a, b) => b.posts.length - a.posts.length).map(c =>
        `<button type="button" class="chip xmap-chip" data-code="${c.code}" aria-pressed="false"><i class="dot"></i>${esc(countryName(c.code))}<small>${c.posts.length}</small></button>`).join("")}
      ${[...wishMap.keys()].map(c => `<button type="button" class="chip xmap-chip is-wish" data-code="${c}" aria-pressed="false"><i class="dot"></i>${esc(countryName(c))}<small>想去</small></button>`).join("")}
    </div>` : ""}`;

  const stage = root.querySelector(".xmap-stage");
  const svg = root.querySelector("svg");
  const panel = root.querySelector(".xmap-panel");
  const tip = root.querySelector(".map-tip");
  const routeEl = root.querySelector(".xmap__route");

  // ── 視野（viewBox）與縮放 ──
  let vb = { x: 0, y: 0, w: W, h: H };
  const aspect = () => { const r = svg.getBoundingClientRect(); return r.width ? r.height / r.width : H / W; };
  const worldW = () => Math.max(W, H / aspect());
  const clampVb = v => {
    const maxW = worldW();
    const w = Math.min(Math.max(v.w, MIN_W), maxW);
    const h = w * aspect();
    const cx = Math.min(Math.max(v.x + v.w / 2, 0), W);
    const cy = Math.min(Math.max(v.y + v.h / 2, 0), H);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };
  function apply(v) {
    vb = clampVb(v);
    svg.setAttribute("viewBox", `${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.w.toFixed(2)} ${vb.h.toFixed(2)}`);
    const k = vb.w / (svg.clientWidth || W);
    svg.style.setProperty("--k", k.toFixed(4));
    stage.classList.toggle("is-zoomed", vb.w < worldW() * .92);
  }
  let anim = 0;
  function animateTo(target) {
    cancelAnimationFrame(anim);
    const to = clampVb(target);
    if (prefersReducedMotion()) { apply(to); return; }
    const from = { ...vb };
    const t0 = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - t0) / ZOOM_MS), e = ease(t);
      apply({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
      if (t < 1) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  }
  const fitBox = ([[x0, y0], [x1, y1]], pad = .25, minW = MIN_W) => {
    const a = aspect();
    let w = Math.max((x1 - x0) * (1 + pad * 2), minW), h = Math.max((y1 - y0) * (1 + pad * 2), minW * a);
    if (h / w > a) w = h / a;
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w * a / 2, w, h: w * a };
  };
  const worldView = () => { const w = worldW(); return { x: W / 2 - w / 2, y: H / 2 - w * aspect() / 2, w, h: w * aspect() }; };
  const mineView = () => {
    // 只框去過的國家；想去的國家用下方按鈕或縮小就看得到
    const codes = info.size ? [...info.keys()] : [...wishMap.keys()];
    if (!codes.length) return worldView();
    const bs = codes.map(bounds);
    return fitBox([[Math.min(...bs.map(b => b[0][0])), Math.min(...bs.map(b => b[0][1]))], [Math.max(...bs.map(b => b[1][0])), Math.max(...bs.map(b => b[1][1]))]], .12, 180);
  };
  const isPhone = () => matchMedia("(max-width: 640px)").matches;
  const homeView = () => (isPhone() ? mineView() : worldView());
  apply(homeView());
  addEventListener("resize", () => apply(vb), { passive: true });

  const zoomBy = (f, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => {
    const w = vb.w * f, h = vb.h * f;
    return { x: cx - (cx - vb.x) * f, y: cy - (cy - vb.y) * f, w, h };
  };
  root.querySelector(".xmap-tools").addEventListener("click", e => {
    const b = e.target.closest("[data-zoom]");
    if (!b) return;
    const z = b.dataset.zoom;
    if (z === "in") animateTo(zoomBy(.6));
    if (z === "out") animateTo(zoomBy(1 / .6));
    if (z === "mine") animateTo(mineView());
    if (z === "world") animateTo(worldView());
  });

  // ── 選擇國家：放大過去 + 下方資訊卡 ──
  let selected = null;
  function select(code, { zoom = true } = {}) {
    if (!code || (!info.has(code) && !wishMap.has(code))) return;
    selected = code;
    root.querySelectorAll(".is-active").forEach(el => el.classList.remove("is-active"));
    root.querySelectorAll(`[data-code="${code}"]`).forEach(el => el.classList.add("is-active"));
    root.querySelectorAll(".xmap-chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.code === code)));
    if (zoom) animateTo(fitBox(bounds(code), .9, isPhone() ? 160 : 220));
    const c = info.get(code);
    if (c) {
      const list = c.posts.slice().sort((a, b) => String(b.visited_on || "").localeCompare(String(a.visited_on || "")));
      panel.innerHTML = `<div class="xmap-panel__head">
          <div><span class="eyebrow">Been there · ${fmtDate(c.first)}</span><h3>${esc(countryName(code))}</h3>
            <p>${c.posts.length} 篇故事${c.cities.size ? `・${esc([...c.cities].join("、"))}` : ""}</p></div>
          <button type="button" class="icon-btn" data-close aria-label="關閉">${icon("close")}</button></div>
        <ul class="xmap-panel__posts">${list.slice(0, 3).map(p => `<li><a href="post.html?id=${encodeURIComponent(p.id)}">
          <span class="thumb">${img(p.cover, { sizes: "64px", alt: "", small: true })}</span>
          <span><b>${esc(p.title)}</b><small>${esc(p.city || "")}${p.visited_on ? ` · ${fmtDate(p.visited_on)}` : ""}</small></span></a></li>`).join("")}</ul>
        <button type="button" class="btn btn--ghost btn--sm" data-open>看${esc(countryName(code))}的全部故事 ${icon("arrow")}</button>`;
    } else {
      const w = wishMap.get(code);
      panel.innerHTML = `<div class="xmap-panel__head">
          <div><span class="eyebrow is-wish">Next destination</span><h3>${esc(countryName(code))}${w.city ? `・${esc(w.city)}` : ""}</h3>
            <p>${esc(w.note || "下一站想去的地方")}</p></div>
          <button type="button" class="icon-btn" data-close aria-label="關閉">${icon("close")}</button></div>`;
    }
    panel.hidden = false;
    onSelect(code);
  }
  function clear() {
    selected = null;
    panel.hidden = true;
    root.querySelectorAll(".is-active").forEach(el => el.classList.remove("is-active"));
    root.querySelectorAll(".xmap-chip").forEach(b => b.setAttribute("aria-pressed", "false"));
    animateTo(homeView());
    onSelect(null);
  }
  panel.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) clear();
    if (e.target.closest("[data-open]")) onOpenCountry(selected);
  });
  root.querySelector(".xmap-chips")?.addEventListener("click", e => {
    const b = e.target.closest(".xmap-chip");
    if (b) b.dataset.code === selected ? clear() : select(b.dataset.code);
  });

  // ── 拖曳、雙指縮放、點擊 ──
  const pointers = new Map();
  let drag = null, moved = false;
  const toUser = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    return [vb.x + (cx - r.left) / r.width * vb.w, vb.y + (cy - r.top) / r.height * vb.h];
  };
  svg.addEventListener("pointerdown", e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    drag = { vb: { ...vb }, start: [...pointers.values()].map(p => ({ ...p })) };
    cancelAnimationFrame(anim);
  });
  svg.addEventListener("pointermove", e => {
    // 滑鼠移過時顯示國名
    const hit = e.target.closest("[data-label]");
    if (e.pointerType === "mouse" && !pointers.size) {
      if (hit && hit.dataset.code) {
        const r = stage.getBoundingClientRect();
        tip.textContent = hit.dataset.label;
        tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
        tip.classList.add("on");
      } else tip.classList.remove("on");
    }
    if (!pointers.has(e.pointerId) || !drag) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = [...pointers.values()];
    const r = svg.getBoundingClientRect();
    const s = drag.vb.w / r.width;
    if (now.length === 1 && drag.start.length === 1) {
      const dx = now[0].x - drag.start[0].x, dy = now[0].y - drag.start[0].y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      // 觸控時只處理左右拖曳（上下交給頁面捲動）；滑鼠可以任意拖
      if (moved && (e.pointerType === "mouse" || stage.classList.contains("is-zoomed"))) {
        if (e.pointerType !== "mouse") svg.setPointerCapture?.(e.pointerId);
        apply({ ...drag.vb, x: drag.vb.x - dx * s, y: e.pointerType === "mouse" ? drag.vb.y - dy * s : drag.vb.y });
      }
    } else if (now.length === 2 && drag.start.length === 2) {
      moved = true;
      const d0 = Math.hypot(drag.start[0].x - drag.start[1].x, drag.start[0].y - drag.start[1].y) || 1;
      const d1 = Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y) || 1;
      const f = d0 / d1;
      const m0 = [(drag.start[0].x + drag.start[1].x) / 2, (drag.start[0].y + drag.start[1].y) / 2];
      const m1 = [(now[0].x + now[1].x) / 2, (now[0].y + now[1].y) / 2];
      const ux = drag.vb.x + (m0[0] - r.left) * s, uy = drag.vb.y + (m0[1] - r.top) * s;
      const w = drag.vb.w * f, h = drag.vb.h * f;
      apply({ x: ux - (m1[0] - r.left) / r.width * w, y: uy - (m1[1] - r.top) / r.height * h, w, h });
    }
  });
  const end = e => {
    pointers.delete(e.pointerId);
    drag = pointers.size ? { vb: { ...vb }, start: [...pointers.values()].map(p => ({ ...p })) } : null;
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") tip.classList.remove("on"); });
  svg.addEventListener("click", e => {
    if (moved) { moved = false; return; }                 // 剛剛是拖曳，不算點擊
    const t = e.target.closest("[data-code]");
    if (t && t.dataset.code) (t.dataset.code === selected ? clear() : select(t.dataset.code));
  });
  svg.addEventListener("dblclick", e => { e.preventDefault(); const [ux, uy] = toUser(e.clientX, e.clientY); animateTo(zoomBy(.5, ux, uy)); });
  svg.addEventListener("keydown", e => {
    const t = e.target.closest(".pin");
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(t.dataset.code); }
  });
  stage.addEventListener("keydown", e => {
    if (e.key === "+" || e.key === "=") animateTo(zoomBy(.6));
    if (e.key === "-") animateTo(zoomBy(1 / .6));
    if (e.key === "Escape" && selected) clear();
  });

  // ── 進場動畫：捲到地圖時才播放一次 ──
  function finish() { svg.classList.add("is-played", "is-done"); }
  function play() {
    if (prefersReducedMotion() || !order.length) { finish(); return; }
    if (routeEl) {
      const len = routeEl.getTotalLength();
      routeEl.style.strokeDasharray = `${len} ${len}`;
      routeEl.style.strokeDashoffset = String(len);
      routeEl.getBoundingClientRect();                       // 強制套用起始狀態
      routeEl.style.transition = `stroke-dashoffset ${ROUTE_MS}ms cubic-bezier(.45,.05,.35,1)`;
      routeEl.style.strokeDashoffset = "0";
    }
    svg.classList.add("is-played");
    setTimeout(() => svg.classList.add("is-done"), ROUTE_MS + 900);
  }
  if ("IntersectionObserver" in window && !prefersReducedMotion()) {
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); play(); } }, { threshold: .35 });
    io.observe(svg);
  } else finish();

  return { select, clear };
}
