// 世界地圖（Natural Earth 公有領域資料，不需要 API 金鑰）：旅行足跡頁與首頁共用

import { esc, countryName, ISO_NUM } from "./util.js";

const MAP_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json";
const D3_GEO = "https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm";
const TOPOJSON = "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
export const W = 960, H = 500;

let loading = null;
export function loadWorld() {
  if (!loading) {
    loading = Promise.all([
      import(D3_GEO), import(TOPOJSON),
      fetch(MAP_URL).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    ]).catch(e => { loading = null; throw e; });
  }
  return loading;
}

export const numToCode = Object.fromEntries(Object.entries(ISO_NUM).map(([a, n]) => [n, a]));

// 回傳 <svg> 字串；interactive 時去過／想去的國家可以用鍵盤聚焦
export async function worldMapSvg({ visited = new Set(), wish = new Set(), counts = {}, interactive = false, label = "" } = {}) {
  const [geo, topo, world] = await loadWorld();
  const features = topo.feature(world, world.objects.countries).features
    .filter(f => f.properties.name !== "Antarctica");
  const projection = geo.geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], { type: "FeatureCollection", features });
  const path = geo.geoPath(projection);

  const dots = [];
  const shapes = features.map(f => {
    const code = numToCode[f.id] || "";
    const cls = visited.has(code) ? "is-visited" : wish.has(code) ? "is-wish" : "";
    const name = code ? `${countryName(code)}${cls === "is-visited" ? `，${counts[code] || 0} 篇文章` : cls === "is-wish" ? "，想去" : ""}` : f.properties.name;
    const d = path(f);
    if (!d) return "";
    const focus = interactive && cls ? ` tabindex="0" role="button" aria-label="${esc(name)}"` : "";
    // 太小的國家（新加坡、馬爾地夫⋯）加一個點，才看得到
    if (cls && path.area(f) < 12) {
      const [x, y] = path.centroid(f);
      dots.push(`<circle class="country ${cls}" data-code="${code}" data-label="${esc(name)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" stroke-width="1.5"${focus}></circle>`);
    }
    return `<path class="country ${cls}" data-code="${code}" data-label="${esc(name)}" d="${d}"${focus}></path>`;
  }).join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label || `世界地圖：去過 ${visited.size} 個國家，想去 ${wish.size} 個國家`)}">
    <path class="sphere" d="${path({ type: "Sphere" })}" fill="none" stroke-width=".8"></path>
    <g>${shapes}</g><g>${dots.join("")}</g></svg>`;
}
