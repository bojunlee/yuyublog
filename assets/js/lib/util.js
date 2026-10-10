// 共用小工具：分類、國家、日期、圖片、內文排版

export const SITE_NAME = "魚魚出去玩";

export const CATS = {
  travel: { label: "旅遊", en: "Explore" },
  food:   { label: "美食", en: "Eat" },
  stay:   { label: "度假", en: "Stay" },
  life:   { label: "生活", en: "Life" }
};
export const CAT_KEYS = Object.keys(CATS);

// 細線圖示（24×24，stroke 1.5），跟著文字顏色
const ICON_PATHS = {
  travel: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  food: '<path d="M7 3v8m-2.5-8v5a2.5 2.5 0 0 0 5 0V3M7 11v10"/><path d="M17 21V3c-2.2 1.2-3.5 3.6-3.5 7v3H17"/>',
  stay: '<path d="M12 21v-9"/><path d="M12 12c-1-3.5-4-5-8-4.5 2.2 1 3.5 2.5 4 4.5"/><path d="M12 12c1-3.5 4-5 8-4.5-2.2 1-3.5 2.5-4 4.5"/><path d="M12 12c0-3.5-1.5-6.5-4.5-8M12 12c0-3.5 1.5-6.5 4.5-8"/><path d="M5 21h14"/>',
  life: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.6.9.6 1.6 0 2.5m3.5-2.5c-.6.9.6 1.6 0 2.5"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4m8-4v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.2 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  share: '<path d="M12 15V3.5m0 0L8 7.5m4-4 4 4"/><path d="M6 11H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 19 11h-1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  back: '<path d="M20 12H5m5-5-5 5 5 5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  plane: '<path d="M10.5 13.5 4 11l1.5-1.5 7 .5 4-4c1-1 2.6-1.3 3.1-.8s.2 2.1-.8 3.1l-4 4 .5 7L14 20.5l-2.5-6.5-3 3v2.5L7 21l-1-3-3-1 1.5-1.5H7z"/>',
  wallet: '<rect x="3.5" y="6" width="17" height="13" rx="2"/><path d="M3.5 10h17M16 14.5h1.5"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16"/>',
  bus: '<rect x="4.5" y="3.5" width="15" height="14" rx="2.5"/><path d="M4.5 11h15M8 17.5V20m8-2.5V20M8 14.5h.01M16 14.5h.01"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.8h.01"/>',
  facebook: '<path d="M14 21v-7.5h2.6l.4-3H14V8.7c0-.9.3-1.5 1.6-1.5H17V4.6A20 20 0 0 0 14.8 4.5C12.6 4.5 11 5.8 11 8.3v2.2H8.5v3H11V21"/>',
  threads: '<path d="M16.5 11.3c-.3-2.6-2-3.9-4.4-3.9-2.6 0-4.1 1.8-4.1 1.8m8.5 2.1c-3.6-.6-7.2 0-7.2 2.8 0 1.6 1.4 2.5 3 2.4 2.8-.1 4.2-2.3 4.2-5.2m0 0c2.4.9 3.7 2.6 3.2 4.9-.6 2.7-3.2 4.3-6.9 4.3-4.9 0-8.1-3.2-8.1-8.5S7 3.5 12 3.5c3.7 0 6.1 1.7 7.1 4.6"/>',
  youtube: '<rect x="3" y="5.5" width="18" height="13" rx="3.5"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5z"/>'
};

export function icon(name, cls = "") {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ""}</svg>`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

// ── 國家 ──────────────────────────────────────
// ISO 3166-1 兩碼 → 三位數字碼（世界地圖資料用數字碼）
export const ISO_NUM = Object.fromEntries((
  "AF004 AL008 DZ012 AD020 AO024 AG028 AR032 AM051 AU036 AT040 AZ031 BS044 BH048 BD050 BB052 " +
  "BY112 BE056 BZ084 BJ204 BT064 BO068 BA070 BW072 BR076 BN096 BG100 BF854 BI108 CV132 KH116 " +
  "CM120 CA124 CF140 TD148 CL152 CN156 CO170 KM174 CG178 CD180 CR188 CI384 HR191 CU192 CY196 " +
  "CZ203 DK208 DJ262 DM212 DO214 EC218 EG818 SV222 GQ226 ER232 EE233 SZ748 ET231 FJ242 FI246 " +
  "FR250 GA266 GM270 GE268 DE276 GH288 GR300 GL304 GD308 GT320 GN324 GW624 GY328 HT332 HN340 " +
  "HK344 HU348 IS352 IN356 ID360 IR364 IQ368 IE372 IL376 IT380 JM388 JP392 JO400 KZ398 KE404 " +
  "KI296 KP408 KR410 KW414 KG417 LA418 LV428 LB422 LS426 LR430 LY434 LI438 LT440 LU442 MO446 " +
  "MG450 MW454 MY458 MV462 ML466 MT470 MH584 MR478 MU480 MX484 FM583 MD498 MC492 MN496 ME499 " +
  "MA504 MZ508 MM104 NA516 NR520 NP524 NL528 NC540 NZ554 NI558 NE562 NG566 MK807 NO578 OM512 " +
  "PK586 PW585 PS275 PA591 PG598 PY600 PE604 PH608 PL616 PT620 PR630 QA634 RO642 RU643 RW646 " +
  "KN659 LC662 VC670 WS882 SM674 ST678 SA682 SN686 RS688 SC690 SL694 SG702 SK703 SI705 SB090 " +
  "SO706 ZA710 SS728 ES724 LK144 SD729 SR740 SE752 CH756 SY760 TW158 TJ762 TZ834 TH764 TL626 " +
  "TG768 TO776 TT780 TN788 TR792 TM795 TV798 UG800 UA804 AE784 GB826 US840 UY858 UZ860 VU548 " +
  "VA336 VE862 VN704 EH732 YE887 ZM894 ZW716 PF258 GU316 FK238 TF260 AQ010 XK000"
).split(" ").map(s => [s.slice(0, 2), s.slice(2)]));

export const POPULAR_COUNTRIES = ["TW", "JP", "KR", "TH", "VN", "SG", "MY", "ID", "PH", "HK", "MO", "CN",
  "US", "CA", "AU", "NZ", "FR", "IT", "GB", "ES", "DE", "CH", "GR", "TR", "IS", "MV"];

const regionNames = (() => {
  try { return new Intl.DisplayNames(["zh-Hant-TW", "zh-TW"], { type: "region" }); }
  catch { return null; }
})();

export function countryName(code) {
  if (!code) return "";
  if (code === "TW") return "台灣";
  if (code === "XK") return "科索沃";
  try { return (regionNames && regionNames.of(code)) || code; } catch { return code; }
}

export function countryOptions() {
  const all = Object.keys(ISO_NUM).filter(c => !["AQ", "TF"].includes(c));
  const rest = all.filter(c => !POPULAR_COUNTRIES.includes(c))
    .sort((a, b) => countryName(a).localeCompare(countryName(b), "zh-Hant-TW"));
  return { popular: POPULAR_COUNTRIES.map(c => ({ code: c, name: countryName(c) })),
           rest: rest.map(c => ({ code: c, name: countryName(c) })) };
}

export function placeLine(p) {
  return [countryName(p.country_code), p.city].filter(Boolean).join(" · ");
}

// ── 日期 ──────────────────────────────────────
export function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return `${y}.${m}.${day}`;
}
export function postDate(p) { return p.visited_on || (p.published_at || "").slice(0, 10); }

export function readingMinutes(text) {
  const chars = String(text || "").replace(/\s/g, "").length;
  return Math.max(1, Math.round(chars / 400));     // 中文約每分鐘 400 字
}

// ── 圖片 ──────────────────────────────────────
// 照片物件：{ url, thumb, w, h, caption }；url 為大圖（約 2000px），thumb 為小圖（約 800px）
export function srcset(ph) {
  if (!ph) return "";
  return ph.thumb && ph.thumb !== ph.url ? `${ph.thumb} 800w, ${ph.url} 2000w` : "";
}

export function img(ph, { sizes = "100vw", alt = "", cls = "", eager = false, small = false } = {}) {
  if (!ph || !ph.url) return `<div class="img-missing ${cls}" role="img" aria-label="${esc(alt || "沒有照片")}"></div>`;
  const ss = srcset(ph);
  const src = small && ph.thumb ? ph.thumb : ph.url;
  const dims = ph.w && ph.h ? ` width="${ph.w}" height="${ph.h}"` : "";
  return `<img class="${cls}" src="${esc(src)}"${ss ? ` srcset="${esc(ss)}" sizes="${esc(sizes)}"` : ""}${dims} alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

// ── 內文排版 ──────────────────────────────────
// 支援：空行分段、## 小標、### 小小標、> 引言、- 清單、**粗體**、[文字](https://網址)、單獨一行的 [照片 N]
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) =>
      `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
}

export function figureHtml(ph, n, { sizes = "(min-width: 900px) 860px, 100vw", altBase = "" } = {}) {
  return `<figure class="art-figure${ph.w && ph.h && ph.h > ph.w ? " is-portrait" : ""}">
    <button type="button" class="art-figure__btn" data-photo="${n}" aria-label="放大第 ${n + 1} 張照片">
      ${img(ph, { sizes, alt: ph.caption || (altBase ? `${altBase}（第 ${n + 1} 張照片）` : "") })}
    </button>
    ${ph.caption ? `<figcaption>${esc(ph.caption)}</figcaption>` : ""}
  </figure>`;
}

export function renderBody(text, photos = [], altBase = "") {
  const used = new Set();
  const out = [];
  const blocks = String(text || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const raw of blocks) {
    const b = raw.trim();
    if (!b) continue;
    const lines = b.split("\n");
    // 一個區塊裡可能有好幾行 [照片 N]
    if (lines.every(l => /^\[照片\s*\d+\]$/.test(l.trim()))) {
      for (const l of lines) {
        const n = parseInt(l.replace(/\D/g, ""), 10) - 1;
        if (photos[n]) { used.add(n); out.push(figureHtml(photos[n], n, { altBase })); }
      }
      continue;
    }
    if (/^###\s/.test(b)) { out.push(`<h3>${inline(b.replace(/^###\s+/, ""))}</h3>`); continue; }
    if (/^##\s/.test(b)) { out.push(`<h2>${inline(b.replace(/^##\s+/, ""))}</h2>`); continue; }
    if (lines.every(l => /^>\s?/.test(l))) {
      out.push(`<blockquote><p>${lines.map(l => inline(l.replace(/^>\s?/, ""))).join("<br>")}</p></blockquote>`);
      continue;
    }
    if (lines.every(l => /^[-・•]\s/.test(l))) {
      out.push(`<ul>${lines.map(l => `<li>${inline(l.replace(/^[-・•]\s+/, ""))}</li>`).join("")}</ul>`);
      continue;
    }
    out.push(`<p>${lines.map(inline).join("<br>")}</p>`);
  }
  return { html: out.join("\n"), used };
}

// ── 網址參數 ──────────────────────────────────
export function getParam(k) { return new URLSearchParams(location.search).get(k); }

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
