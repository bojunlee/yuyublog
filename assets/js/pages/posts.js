import { CATS, esc, icon, countryName, debounce } from "../lib/util.js";
import { listPosts, allPlaces } from "../lib/data.js";
import { initPage, cardHtml, skeletonCards, stateHtml, reveal } from "../lib/ui.js";

initPage("posts");

const $ = id => document.getElementById(id);
const PAGE_SIZE = 9;
const params = new URLSearchParams(location.search);
const state = {
  cat: CATS[params.get("cat")] ? params.get("cat") : "",
  q: (params.get("q") || "").slice(0, 40),
  country: /^[A-Z]{2}$/.test(params.get("country") || "") ? params.get("country") : "",
  page: 0,
  total: 0,
  items: []
};
let requestId = 0;

// ── 分類切換 ────────────────────────────────
let counts = {};
function renderChips() {
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const chip = (key, label, ic, n) => `<button class="chip" type="button" data-cat="${key}" aria-pressed="${state.cat === key}">
      ${ic ? icon(ic) : ""}${label}${n != null ? `<small>${n}</small>` : ""}</button>`;
  $("cat-chips").innerHTML = chip("", "全部", "", all || null) +
    Object.entries(CATS).map(([k, c]) => chip(k, c.label, k, counts[k] ?? null)).join("");
}
$("cat-chips").addEventListener("click", e => {
  const b = e.target.closest(".chip");
  if (!b || b.dataset.cat === state.cat) return;
  state.cat = b.dataset.cat;
  renderChips();
  load(true);
});

allPlaces().then(list => {
  counts = Object.fromEntries(Object.keys(CATS).map(k => [k, list.filter(p => p.category === k).length]));
  renderChips();
}).catch(() => {});
renderChips();

// ── 搜尋 ───────────────────────────────────
const input = $("search");
input.value = state.q;
$("search-clear").hidden = !state.q;
const runSearch = debounce(() => {
  const v = input.value.trim();
  if (v === state.q) return;
  state.q = v;
  load(true);
}, 350);
input.addEventListener("input", () => { $("search-clear").hidden = !input.value; runSearch(); });
$("search-form").addEventListener("submit", e => { e.preventDefault(); input.blur(); state.q = input.value.trim(); load(true); });
$("search-clear").addEventListener("click", () => { input.value = ""; $("search-clear").hidden = true; state.q = ""; load(true); input.focus(); });
if (location.hash === "#search") setTimeout(() => input.focus(), 50);

function syncUrl() {
  const p = new URLSearchParams();
  if (state.cat) p.set("cat", state.cat);
  if (state.country) p.set("country", state.country);
  if (state.q) p.set("q", state.q);
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  const bits = [state.cat && CATS[state.cat].label, state.country && countryName(state.country)].filter(Boolean);
  $("list-title").textContent = bits.length ? `${bits.join("・")}的文章` : "所有文章";
  document.title = `${$("list-title").textContent}｜魚魚出去玩`;
}

// ── 載入 ───────────────────────────────────
function renderStatus() {
  const filters = [];
  if (state.country) filters.push(countryName(state.country));
  if (state.q) filters.push(`「${esc(state.q)}」`);
  const hasFilter = state.cat || state.q || state.country;
  $("list-status").innerHTML = `<span>${filters.length ? filters.join("・") + "，" : ""}共 ${state.total} 篇</span>
    ${hasFilter ? `<button type="button" id="clear-all">清除篩選</button>` : ""}`;
  if (hasFilter) $("clear-all").addEventListener("click", clearAll);
}

function clearAll() {
  Object.assign(state, { cat: "", q: "", country: "" });
  input.value = "";
  $("search-clear").hidden = true;
  renderChips();
  load(true);
}

async function load(reset) {
  const id = ++requestId;
  const box = $("results");
  if (reset) {
    state.page = 0;
    state.items = [];
    syncUrl();
    box.setAttribute("aria-busy", "true");
    box.innerHTML = skeletonCards(6);
    $("load-more").innerHTML = "";
    $("list-status").textContent = "載入中⋯";
  } else {
    $("load-more").innerHTML = `<button class="btn btn--ghost" type="button" disabled>載入中⋯</button>`;
  }
  try {
    const { items, total } = await listPosts({ category: state.cat, q: state.q, country: state.country, page: state.page, pageSize: PAGE_SIZE });
    if (id !== requestId) return;               // 已經有更新的查詢
    state.total = total;
    box.removeAttribute("aria-busy");
    renderStatus();
    if (reset && !items.length) {
      box.innerHTML = "";
      $("load-more").innerHTML = stateHtml({
        title: state.q ? `找不到「${state.q}」相關的文章` : "這個分類還沒有文章",
        text: state.q ? "換個關鍵字試試看，例如城市、國家或餐廳名稱。" : "魚魚正在努力出去玩，很快就會更新！",
        action: '<button class="btn btn--ghost" type="button" id="empty-clear">看全部文章</button>'
      });
      $("empty-clear").addEventListener("click", clearAll);
      return;
    }
    const start = state.items.length;
    state.items = state.items.concat(items);
    const html = items.map((p, i) => cardHtml(p, { eager: reset && i < 3 })).join("");
    if (reset) box.innerHTML = html; else box.insertAdjacentHTML("beforeend", html);
    const fresh = [...box.children].slice(start);
    fresh.forEach((el, i) => { el.classList.add("reveal"); el.style.setProperty("--i", String(i % 3)); });
    reveal(box);
    if (!reset && fresh[0]) fresh[0].querySelector("a").focus({ preventScroll: true });

    const shown = state.items.length;
    $("load-more").innerHTML = shown < total
      ? `<button class="btn btn--ghost" type="button" id="more-btn">載入更多文章</button><span>已顯示 ${shown} / ${total} 篇</span>`
      : (total > PAGE_SIZE ? `<span>— 已經是全部了 —</span>` : "");
    if ($("more-btn")) $("more-btn").addEventListener("click", () => { state.page++; load(false); });
  } catch (e) {
    if (id !== requestId) return;
    box.removeAttribute("aria-busy");
    $("list-status").textContent = "";
    if (reset) box.innerHTML = "";
    $("load-more").innerHTML = stateHtml({ kind: "error", title: "文章載入失敗", text: e.message,
      action: '<button class="btn btn--ghost" type="button" id="retry-btn">再試一次</button>' });
    $("retry-btn").addEventListener("click", () => load(reset));
  }
}

load(true);
