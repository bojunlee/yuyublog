// 魚魚的後台：登入、文章管理、網站設定
// 所有寫入都經過 Supabase 的 RLS 檢查；前端只拿得到公開的 anon key。

import { getClient, isDemo } from "../lib/data.js";
import { CATS, esc, icon, countryOptions, countryName, fmtDate, debounce } from "../lib/util.js";
import { articleHtml, bindArticle } from "../lib/article.js";
import { BRAND_MARK, toast, openLightbox, trapFocus } from "../lib/ui.js";
import { uploadImage, removeImages, ImageError } from "./image.js";

const app = document.getElementById("app");
let sb = null;
let session = null;
let guard = null;          // 目前畫面有未儲存修改時的保護：{ hash, isDirty(), onLeave() }

// ── 共用 ─────────────────────────────────────
const countries = countryOptions();
const countrySelect = (value = "", placeholder = "選擇國家") => `
  <option value="">${placeholder}</option>
  <optgroup label="常用">${countries.popular.map(c => `<option value="${c.code}"${c.code === value ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</optgroup>
  <optgroup label="全部國家">${countries.rest.map(c => `<option value="${c.code}"${c.code === value ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</optgroup>`;

function errMsg(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "目前沒有網路連線，請連線後再試一次";
  const m = String((error && (error.message || error.error_description)) || error || "");
  if (error instanceof ImageError) return m;
  if (/invalid login credentials/i.test(m)) return "Email 或密碼不正確";
  if (/email not confirmed/i.test(m)) return "這個帳號的 email 還沒驗證";
  if (/rate limit|too many/i.test(m)) return "嘗試次數太多，請稍等幾分鐘再試";
  if (/jwt|expired|refresh token/i.test(m)) return "登入已過期，請重新登入";
  if (/row-level security|permission denied|not authorized/i.test(m)) return "沒有權限執行這個動作，請確認是用魚魚的帳號登入";
  if (/posts_publishable/.test(m)) return "發布前需要標題和封面照片";
  if (/value too long|check constraint/i.test(m)) return "有欄位的字數太多了，請縮短一點";
  if (/failed to fetch|networkerror|load failed|timeout|aborted|network/i.test(m)) return "連線失敗，請檢查網路後再試一次";
  return `發生錯誤：${m || "未知錯誤"}`;
}

function confirmDialog({ title, text = "", ok = "確定", cancel = "取消", danger = false }) {
  return new Promise(resolve => {
    const d = document.createElement("dialog");
    d.className = "adm-dialog";
    d.innerHTML = `<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ""}
      <div class="dialog-actions">
        <button class="btn btn--ghost" type="button" value="cancel">${esc(cancel)}</button>
        <button class="btn ${danger ? "btn--danger" : ""}" type="button" value="ok">${esc(ok)}</button>
      </div>`;
    document.body.appendChild(d);
    const done = v => { d.close(); d.remove(); resolve(v); };
    d.querySelectorAll("button").forEach(b => b.addEventListener("click", () => done(b.value === "ok")));
    d.addEventListener("cancel", e => { e.preventDefault(); done(false); });
    d.showModal();
    d.querySelector('[value="cancel"]').focus();
  });
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width:18px;height:18px;border-color:currentColor;border-top-color:transparent"></span>${label ? esc(label) : ""}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

function counter(input, out, max) {
  const upd = () => {
    const n = [...input.value].length;
    out.textContent = `${n} / ${max}`;
    out.classList.toggle("over", n > max);
  };
  input.addEventListener("input", upd);
  upd();
}

function autoGrow(ta) {
  const fit = () => { ta.style.height = "auto"; ta.style.height = Math.max(ta.scrollHeight + 2, 120) + "px"; };
  ta.addEventListener("input", fit);
  requestAnimationFrame(fit);
}

const timeAgo = iso => {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "剛剛";
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  return fmtDate(iso);
};

function topBar({ title = "", back = "", actions = "" } = {}) {
  return `<header class="adm-top">
    ${back ? `<a class="adm-link" href="${back}" data-nav>${icon("back")}<span>返回</span></a>` : `<a class="brand" href="#/posts" aria-label="後台首頁">${BRAND_MARK}<span class="brand__text"><span class="brand__zh">魚魚出去玩</span><span class="brand__en">studio</span></span></a>`}
    ${title ? `<span class="adm-top__title">${title}</span>` : ""}
    <div class="adm-top__actions">${actions}</div>
  </header>`;
}

function tabBar(active) {
  return `<nav class="adm-tabs" aria-label="後台選單">
    <a href="#/posts"${active === "posts" ? ' aria-current="page"' : ""}>${icon("menu")}文章</a>
    <a class="adm-fab" href="#/new" aria-label="寫新文章">${ic("plus")}</a>
    <a href="#/settings"${active === "settings" ? ' aria-current="page"' : ""}>${icon("store")}網站設定</a>
  </nav>`;
}

// util.js 沒有的圖示
const EXTRA_ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  trash: '<path d="M4.5 7h15M10 11v6m4-6v6M6 7l1 12.5h10L18 7M9.5 7V4.5h5V7"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  text: '<path d="M5 7V5h14v2M12 5v14m-3 0h6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5"/>',
  logout: '<path d="M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9"/>',
  retry: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>'
};
function ic(name) {
  if (!EXTRA_ICONS[name]) return icon(name);
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EXTRA_ICONS[name]}</svg>`;
}

// ── 未儲存保護 ───────────────────────────────
window.addEventListener("beforeunload", e => {
  if (guard && guard.isDirty()) { e.preventDefault(); e.returnValue = ""; }
});

window.addEventListener("hashchange", async () => {
  const target = location.hash;
  if (/access_token|type=recovery|error_description/.test(target)) return;   // 交給登入流程處理
  if (guard && guard.isDirty() && target !== guard.hash) {
    history.pushState(null, "", guard.hash);   // 先留在原頁
    const ok = await confirmDialog({
      title: "還沒儲存喔",
      text: "離開的話，這次的修改不會保留。",
      ok: "不儲存，離開", cancel: "繼續編輯", danger: true
    });
    if (!ok) return;
    const g = guard;
    guard = null;
    if (g.onLeave) await g.onLeave();
    location.hash = target;
    return;
  }
  if (guard && guard.onLeave && target !== guard.hash) await guard.onLeave();
  guard = null;
  route();
});

// ── 啟動與登入 ───────────────────────────────
function setupView() {
  app.innerHTML = `<div class="auth"><div class="auth__inner">
    <div class="auth__brand">${BRAND_MARK}<h1>後台尚未連線</h1></div>
    <div class="panel setup-card">
      <p style="margin-bottom:12px">網站還沒有接上 Supabase 資料庫，所以現在無法登入或發文。請網站管理者完成以下設定：</p>
      <ol>
        <li>依照 <code>docs/03-部署與維護.md</code> 建立 Supabase 專案並執行資料庫 SQL。</li>
        <li>把 Project URL 與 anon key 填進 <code>assets/js/config.js</code>。</li>
        <li>重新上傳網站，這一頁就會變成魚魚的登入畫面。</li>
      </ol>
    </div>
    <a class="btn btn--ghost" href="../">回到網站</a>
  </div></div>`;
}

function loginView(message = "") {
  guard = null;
  app.innerHTML = `<div class="auth">
    <div class="auth__inner">
      <div class="auth__brand">
        ${BRAND_MARK}
        <span class="script">Welcome back</span>
        <h1>嗨，魚魚！</h1>
        <p>登入一次之後，這支手機會記住妳，下次打開就能直接發文。</p>
      </div>
      <form class="panel" id="login-form" novalidate>
        ${message ? `<div class="err-box" role="alert">${esc(message)}</div>` : ""}
        <div class="field">
          <label for="email">Email</label>
          <input class="input" id="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" required>
        </div>
        <div class="field">
          <label for="password">密碼</label>
          <div class="pw-wrap">
            <input class="input" id="password" type="password" autocomplete="current-password" required minlength="8">
            <button type="button" id="pw-toggle" aria-pressed="false">顯示</button>
          </div>
        </div>
        <p class="err" id="login-err" role="alert" style="margin-top:10px"></p>
        <button class="btn btn--accent btn--block" id="login-btn" type="submit" style="margin-top:14px">登入</button>
        <div style="text-align:center;margin-top:8px"><button type="button" class="linkish" id="forgot">忘記密碼？</button></div>
      </form>
    </div>
    <p class="auth__foot"><a href="../">← 回到魚魚出去玩</a></p>
  </div>`;
  const $ = id => document.getElementById(id);
  $("pw-toggle").addEventListener("click", e => {
    const show = $("password").type === "password";
    $("password").type = show ? "text" : "password";
    e.currentTarget.textContent = show ? "隱藏" : "顯示";
    e.currentTarget.setAttribute("aria-pressed", String(show));
  });
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("email").value.trim();
    const password = $("password").value;
    $("login-err").textContent = "";
    if (!/^\S+@\S+\.\S+$/.test(email)) { $("login-err").textContent = "請輸入正確的 email"; $("email").focus(); return; }
    if (!password) { $("login-err").textContent = "請輸入密碼"; $("password").focus(); return; }
    setBusy($("login-btn"), true, "登入中");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    setBusy($("login-btn"), false);
    if (error) { $("login-err").textContent = errMsg(error); return; }
    $("password").value = "";
    await enter(data.session);
  });
  $("forgot").addEventListener("click", async () => {
    const email = $("email").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { $("login-err").textContent = "請先在上面填入妳的 email，再按「忘記密碼」"; $("email").focus(); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) { toast(errMsg(error), "error"); return; }
    toast("如果這是管理員帳號，信箱會收到重設密碼的信");
  });
  setTimeout(() => $("email").focus(), 50);
}

function resetView() {
  guard = null;
  app.innerHTML = `<div class="auth"><div class="auth__inner">
    <div class="auth__brand">${BRAND_MARK}<h1>設定新密碼</h1><p>請輸入至少 8 個字元的新密碼。</p></div>
    <form class="panel" id="reset-form" novalidate>
      <div class="field"><label for="pw1">新密碼</label><input class="input" id="pw1" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label for="pw2">再輸入一次</label><input class="input" id="pw2" type="password" autocomplete="new-password" minlength="8" required></div>
      <p class="err" id="reset-err" role="alert" style="margin-top:10px"></p>
      <button class="btn btn--accent btn--block" id="reset-btn" type="submit" style="margin-top:14px">更新密碼</button>
    </form></div></div>`;
  const $ = id => document.getElementById(id);
  $("reset-form").addEventListener("submit", async e => {
    e.preventDefault();
    const a = $("pw1").value, b = $("pw2").value;
    if (a.length < 8) { $("reset-err").textContent = "密碼至少要 8 個字元"; return; }
    if (a !== b) { $("reset-err").textContent = "兩次輸入的密碼不一樣"; return; }
    setBusy($("reset-btn"), true, "更新中");
    const { data, error } = await sb.auth.updateUser({ password: a });
    setBusy($("reset-btn"), false);
    if (error) { $("reset-err").textContent = errMsg(error); return; }
    toast("密碼已更新");
    history.replaceState(null, "", location.pathname + "#/posts");
    const { data: s } = await sb.auth.getSession();
    await enter(s.session || data.session);
  });
}

async function enter(s) {
  if (!s) return loginView();
  app.innerHTML = `<div class="adm-boot"><span class="spinner" aria-hidden="true"></span><span>確認權限中⋯</span></div>`;
  const { data: ok, error } = await sb.rpc("is_admin");
  if (error) {
    app.innerHTML = `<div class="auth"><div class="auth__inner"><div class="panel" style="text-align:center">
      <p class="err-box" role="alert">${esc(errMsg(error))}</p>
      <button class="btn btn--ghost" type="button" id="retry">${ic("retry")}再試一次</button></div></div></div>`;
    document.getElementById("retry").addEventListener("click", () => enter(s));
    return;
  }
  if (!ok) {
    await sb.auth.signOut();
    session = null;
    return loginView("這個帳號沒有管理權限。只有魚魚的帳號可以登入後台。");
  }
  session = s;
  if (!location.hash || /access_token|type=/.test(location.hash)) history.replaceState(null, "", location.pathname + "#/posts");
  route();
}

async function logout() {
  if (guard && guard.isDirty()) {
    const ok = await confirmDialog({ title: "還沒儲存喔", text: "登出的話，這次的修改不會保留。", ok: "仍要登出", danger: true });
    if (!ok) return;
  }
  if (guard && guard.onLeave) await guard.onLeave();
  guard = null;
  await sb.auth.signOut();
  session = null;
  toast("已登出");
  loginView();
}

function bindCommon() {
  const lo = document.getElementById("logout");
  if (lo) lo.addEventListener("click", logout);
}

// ── 路由 ─────────────────────────────────────
function route() {
  if (!session) return loginView();
  const [, view = "posts", id] = (location.hash || "#/posts").match(/^#\/?([a-z]*)\/?([^/?#]*)/) || [];
  window.scrollTo(0, 0);
  if (view === "new") return editorView(null);
  if (view === "edit" && id) return editorView(id);
  if (view === "settings") return settingsView();
  return listView();
}

// ── 文章列表 ─────────────────────────────────
let listFilter = "all";
let listQuery = "";

async function listView() {
  app.innerHTML = `${topBar({ actions: `<a class="adm-link" href="../" target="_blank" rel="noopener">${icon("globe")}<span>看網站</span></a>
      <button class="adm-link" type="button" id="logout" aria-label="登出">${ic("logout")}<span>登出</span></button>` })}
    <main class="adm-main">
      <div class="list-head"><div><h1 class="adm-h1">我的文章</h1><p class="adm-sub" id="list-sum">載入中⋯</p></div>
        <a class="btn btn--accent btn--sm" href="#/new">${ic("plus")}寫新文章</a></div>
      <div class="filters chips" role="group" aria-label="篩選">
        <button class="chip" type="button" data-f="all">全部 <small id="n-all"></small></button>
        <button class="chip" type="button" data-f="published">已發布 <small id="n-published"></small></button>
        <button class="chip" type="button" data-f="draft">草稿 <small id="n-draft"></small></button>
      </div>
      <div class="search-field adm-search">${icon("search")}<label class="sr-only" for="q">搜尋標題</label>
        <input id="q" type="search" placeholder="搜尋標題或地點" value="${esc(listQuery)}" enterkeyhint="search" autocomplete="off"></div>
      <ul class="post-list" id="list" aria-live="polite"><li class="adm-sub" style="padding:24px;text-align:center"><span class="spinner"></span></li></ul>
    </main>
    ${tabBar("posts")}`;
  bindCommon();
  const $ = id => document.getElementById(id);

  let posts = [];
  const draw = () => {
    const q = listQuery.trim().toLowerCase();
    const shown = posts.filter(p => listFilter === "all" || p.status === listFilter)
      .filter(p => !q || [p.title, p.city, p.place, countryName(p.country_code)].some(s => String(s || "").toLowerCase().includes(q)));
    document.querySelectorAll(".filters .chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === listFilter)));
    $("n-all").textContent = posts.length;
    $("n-published").textContent = posts.filter(p => p.status === "published").length;
    $("n-draft").textContent = posts.filter(p => p.status === "draft").length;
    if (!posts.length) {
      $("list").innerHTML = `<li class="panel" style="text-align:center;padding:40px 20px">
        <p style="font-family:var(--f-hand);font-size:1.3rem">還沒有文章，寫下第一篇旅行吧！</p>
        <a class="btn btn--accent" href="#/new" style="margin-top:16px">${ic("plus")}寫第一篇</a></li>`;
      return;
    }
    if (!shown.length) {
      $("list").innerHTML = `<li class="adm-sub" style="padding:32px;text-align:center">沒有符合的文章</li>`;
      return;
    }
    $("list").innerHTML = shown.map(p => {
      const c = CATS[p.category] || CATS.travel;
      const where = [countryName(p.country_code), p.city].filter(Boolean).join(" · ");
      return `<li class="post-item"><a href="#/edit/${p.id}">
        <div class="post-item__thumb">${p.cover && p.cover.thumb ? `<img src="${esc(p.cover.thumb)}" alt="" loading="lazy">` : ""}</div>
        <div class="post-item__body">
          <span class="post-item__title">${esc(p.title || "（未命名）")}</span>
          <span class="post-item__meta">
            <span class="status-pill status-pill--${p.status}">${p.status === "published" ? "已發布" : "草稿"}</span>
            ${p.featured ? '<span class="status-pill status-pill--feat">首頁精選</span>' : ""}
            <span>${c.label}</span>${where ? `<span>${esc(where)}</span>` : ""}
            <span>更新於 ${timeAgo(p.updated_at)}</span>
          </span>
        </div></a></li>`;
    }).join("");
  };

  document.querySelector(".filters").addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (!b) return;
    listFilter = b.dataset.f;
    draw();
  });
  $("q").addEventListener("input", debounce(e => { listQuery = e.target.value; draw(); }, 200));

  const load = async () => {
    const { data, error } = await sb.from("posts")
      .select("id,title,category,status,featured,cover,country_code,city,place,updated_at,published_at")
      .order("updated_at", { ascending: false });
    if (error) {
      $("list-sum").textContent = "";
      $("list").innerHTML = `<li class="panel" style="text-align:center"><p class="err-box" role="alert">${esc(errMsg(error))}</p>
        <button class="btn btn--ghost" type="button" id="retry">${ic("retry")}再試一次</button></li>`;
      $("retry").addEventListener("click", load);
      return;
    }
    posts = data || [];
    const pub = posts.filter(p => p.status === "published").length;
    $("list-sum").textContent = posts.length ? `共 ${posts.length} 篇，${pub} 篇已發布、${posts.length - pub} 篇草稿` : "目前沒有文章";
    draw();
  };
  load();
}

// ── 編輯器 ───────────────────────────────────
const BACKUP_PREFIX = "yuyu-backup:";
const readBackup = key => { try { return JSON.parse(localStorage.getItem(BACKUP_PREFIX + key) || "null"); } catch { return null; } };
const writeBackup = (key, data) => { try { localStorage.setItem(BACKUP_PREFIX + key, JSON.stringify({ savedAt: new Date().toISOString(), data })); } catch { /* 空間不足或無痕模式 */ } };
const clearBackup = key => { try { localStorage.removeItem(BACKUP_PREFIX + key); } catch { /* 忽略 */ } };

const cleanPhoto = p => ({ path: p.path, url: p.url, thumb: p.thumb, thumb_path: p.thumb_path || null, w: p.w, h: p.h, caption: (p.caption || "").trim().slice(0, 200) });

async function editorView(id) {
  app.innerHTML = `${topBar({ back: "#/posts", title: id ? "編輯文章" : "寫新文章" })}
    <main class="adm-main"><div class="panel" style="text-align:center;padding:48px"><span class="spinner"></span></div></main>`;

  let saved = null;               // 資料庫裡的版本
  if (id) {
    const { data, error } = await sb.from("posts").select("*").eq("id", id).maybeSingle();
    if (error || !data) {
      app.querySelector(".adm-main").innerHTML = `<div class="panel" style="text-align:center">
        <p class="err-box" role="alert">${esc(error ? errMsg(error) : "找不到這篇文章，可能已經被刪除。")}</p>
        <a class="btn btn--ghost" href="#/posts">回到文章列表</a></div>`;
      return;
    }
    saved = data;
  }

  // 編輯中的資料
  const s = {
    id: saved ? saved.id : null,
    status: saved ? saved.status : "draft",
    photos: (saved ? saved.photos || [] : []).map(p => ({ ...p, key: crypto.randomUUID(), state: "ready" })),
    coverIndex: 0,
    sessionUploads: [],          // 這次新上傳、還沒存進資料庫的照片
    uploading: 0
  };
  if (saved && saved.cover) {
    const i = s.photos.findIndex(p => p.path === saved.cover.path || p.url === saved.cover.url);
    s.coverIndex = i >= 0 ? i : 0;
  }
  const backupKey = s.id || "new";
  const d = saved ? saved.details || {} : {};
  const r = d.restaurant || {};
  const cost = d.cost || { currency: "TWD", items: [] };
  const today = new Date().toLocaleDateString("sv-SE");

  app.innerHTML = `${topBar({ back: "#/posts", title: id ? "編輯文章" : "寫新文章",
      actions: `<span id="status-pill"></span>
        <div class="menu" id="more-menu"${id ? "" : " hidden"}>
          <button class="icon-btn" type="button" id="more-btn" aria-haspopup="true" aria-expanded="false" aria-label="更多動作">${ic("dots")}</button>
          <div class="menu__panel" id="more-panel" hidden role="menu">
            <a role="menuitem" id="view-live" href="../post.html?id=${esc(id || "")}" target="_blank" rel="noopener">${ic("eye")}在網站上查看</a>
            <button role="menuitem" type="button" id="unpublish-btn">${ic("text")}取消發布（改回草稿）</button>
            <button role="menuitem" type="button" class="danger" id="delete-btn">${ic("trash")}刪除這篇文章</button>
          </div>
        </div>` })}
    <main class="adm-main">
      <div id="restore"></div>
      <div id="errors"></div>
      <form id="post-form" novalidate>

        <section class="panel" aria-labelledby="sec-photos">
          <h2 class="panel__title" id="sec-photos">照片 <small>第一張預設當封面，可以更換</small></h2>
          <div class="photos" id="photos"></div>
          <p class="hint" style="margin-top:10px">可以一次選很多張，會自動轉正、壓縮。點「內文」可以把照片放到文章裡的位置。</p>
        </section>

        <section class="panel" aria-labelledby="sec-basic">
          <h2 class="panel__title" id="sec-basic">基本資訊</h2>
          <div class="field">
            <label for="f-title">標題 <span class="count" id="c-title"></span></label>
            <input class="input" id="f-title" maxlength="120" placeholder="例如：京都｜穿和服散步清水寺" value="${esc(saved ? saved.title : "")}">
          </div>
          <div class="field">
            <span class="label" id="cat-label">分類</span>
            <div class="seg" role="radiogroup" aria-labelledby="cat-label">
              ${Object.entries(CATS).map(([k, c]) => `<label><input type="radio" name="category" value="${k}"${(saved ? saved.category : "travel") === k ? " checked" : ""}><span>${icon(k)}${c.label}</span></label>`).join("")}
            </div>
          </div>
          <div class="field">
            <label for="f-excerpt">摘要 <span class="count" id="c-excerpt"></span></label>
            <textarea class="input" id="f-excerpt" maxlength="300" style="min-height:96px" placeholder="一兩句話介紹這篇，會顯示在文章列表和分享預覽">${esc(saved ? saved.excerpt : "")}</textarea>
          </div>
        </section>

        <section class="panel" aria-labelledby="sec-place">
          <h2 class="panel__title" id="sec-place">地點與日期</h2>
          <div class="row2">
            <div class="field"><label for="f-country">國家</label><select class="input" id="f-country">${countrySelect(saved ? saved.country_code || "" : "")}</select></div>
            <div class="field"><label for="f-city">城市</label><input class="input" id="f-city" maxlength="60" placeholder="例如：京都" value="${esc(saved ? saved.city || "" : "")}"></div>
          </div>
          <div class="row2">
            <div class="field"><label for="f-place">景點 / 店名 / 區域</label><input class="input" id="f-place" maxlength="120" placeholder="例如：東山區" value="${esc(saved ? saved.place || "" : "")}"></div>
            <div class="field"><label for="f-date">去的日期</label><input class="input" id="f-date" type="date" value="${esc(saved ? saved.visited_on || "" : today)}"></div>
          </div>
        </section>

        <section class="panel" aria-labelledby="sec-body">
          <h2 class="panel__title" id="sec-body">內文 <small id="c-body"></small></h2>
          <div class="toolbar" role="toolbar" aria-label="內文格式">
            <button type="button" data-fmt="h2">小標題</button>
            <button type="button" data-fmt="quote">引言</button>
            <button type="button" data-fmt="list">清單</button>
            <button type="button" data-fmt="bold">粗體</button>
            <button type="button" data-fmt="photo">${ic("image")}放照片</button>
          </div>
          <div class="field" style="margin-top:10px">
            <label class="sr-only" for="f-body">內文</label>
            <textarea class="input input--body" id="f-body" maxlength="50000" placeholder="今天去了哪裡、吃了什麼、有什麼想推薦的⋯&#10;&#10;空一行就是新段落。">${esc(saved ? saved.body : "")}</textarea>
            <p class="hint">空一行 = 新段落；「## 」開頭 = 小標題；「- 」開頭 = 清單；[照片 2] = 在這裡放第 2 張照片。沒放進內文的照片會出現在文章最後的照片集。</p>
          </div>
        </section>

        <section class="panel" aria-labelledby="sec-more">
          <h2 class="panel__title" id="sec-more">更多資訊 <small>選填，有填才會顯示</small></h2>
          <details class="more" id="m-rest"${r.name || r.address ? " open" : ""}>
            <summary>${icon("store")}餐廳資訊 <span class="filled"></span></summary>
            <div class="more__body">
              <div class="row2">
                <div class="field"><label for="r-name">店名</label><input class="input" id="r-name" maxlength="80" value="${esc(r.name || "")}"></div>
                <div class="field"><label for="r-price">價位</label><input class="input" id="r-price" maxlength="60" placeholder="每人約 500 元" value="${esc(r.price || "")}"></div>
              </div>
              <div class="field"><label for="r-address">地址</label><input class="input" id="r-address" maxlength="160" value="${esc(r.address || "")}"></div>
              <div class="field"><label for="r-hours">營業時間</label><input class="input" id="r-hours" maxlength="80" placeholder="11:00–21:00（週一公休）" value="${esc(r.hours || "")}"></div>
              <div class="field"><label for="r-tips">小提醒</label><input class="input" id="r-tips" maxlength="160" placeholder="建議先訂位" value="${esc(r.tips || "")}"></div>
            </div>
          </details>
          <details class="more" id="m-cost"${(cost.items || []).length ? " open" : ""}>
            <summary>${icon("wallet")}旅遊花費 <span class="filled"></span></summary>
            <div class="more__body">
              <div class="field" style="max-width:200px"><label for="cost-cur">幣別</label>
                <select class="input" id="cost-cur">${["TWD", "JPY", "KRW", "USD", "EUR", "THB", "HKD", "CNY", "GBP", "AUD", "SGD", "VND", "PHP", "IDR", "MYR"].map(c => `<option${c === (cost.currency || "TWD") ? " selected" : ""}>${c}</option>`).join("")}</select></div>
              <div class="rows" id="cost-rows" style="margin-top:12px"></div>
              <button type="button" class="add-row" id="cost-add">＋ 加一項花費</button>
              <div class="field"><label for="cost-note">備註</label><input class="input" id="cost-note" maxlength="200" value="${esc(cost.note || "")}"></div>
            </div>
          </details>
          <details class="more" id="m-iti"${(d.itinerary || []).length ? " open" : ""}>
            <summary>${icon("route")}行程 <span class="filled"></span></summary>
            <div class="more__body"><div class="rows" id="iti-rows"></div><button type="button" class="add-row" id="iti-add">＋ 加一段行程</button></div>
          </details>
          <details class="more" id="m-tr"${d.transport ? " open" : ""}>
            <summary>${icon("bus")}交通方式 <span class="filled"></span></summary>
            <div class="more__body"><div class="field"><label class="sr-only" for="f-transport">交通方式</label>
              <textarea class="input" id="f-transport" maxlength="1000" style="min-height:90px" placeholder="怎麼去、要搭多久、有什麼要注意的">${esc(d.transport || "")}</textarea></div></div>
          </details>
        </section>

        <section class="panel">
          <label class="switch"><span><b>放在首頁「本期精選」</b><br><span class="hint">同時只會有一篇精選，打開會取代原本那篇</span></span>
            <input type="checkbox" id="f-featured"${saved && saved.featured ? " checked" : ""}></label>
        </section>
      </form>
    </main>
    <div class="actionbar">
      <p class="save-state" id="save-state" aria-live="polite"></p>
      <div class="actionbar__inner" id="actions"></div>
    </div>`;

  const $ = x => document.getElementById(x);
  const form = $("post-form");
  counter($("f-title"), $("c-title"), 120);
  counter($("f-excerpt"), $("c-excerpt"), 300);
  autoGrow($("f-body"));
  autoGrow($("f-excerpt"));
  const bodyCount = () => { $("c-body").textContent = `${[...$("f-body").value].length} 字`; };
  bodyCount();

  // ── 花費 / 行程 列 ──
  let costRows = (cost.items || []).map(i => ({ label: i.label || "", amount: i.amount ?? "" }));
  let itiRows = (d.itinerary || []).map(i => ({ title: i.title || "", text: i.text || "" }));
  const readRows = () => {
    costRows = [...$("cost-rows").querySelectorAll(".rowline")].map(el => ({ label: el.querySelector("[data-k=label]").value, amount: el.querySelector("[data-k=amount]").value }));
    itiRows = [...$("iti-rows").querySelectorAll(".rowline")].map(el => ({ title: el.querySelector("[data-k=title]").value, text: el.querySelector("[data-k=text]").value }));
  };
  const drawRows = () => {
    $("cost-rows").innerHTML = costRows.map((row, i) => `<div class="rowline rowline--cost">
      <input class="input" data-k="label" maxlength="60" placeholder="項目，例如機票" aria-label="花費項目 ${i + 1}" value="${esc(row.label)}">
      <input class="input" data-k="amount" inputmode="decimal" placeholder="金額" aria-label="金額 ${i + 1}" value="${esc(row.amount)}">
      <button class="icon-btn" type="button" data-del-cost="${i}" aria-label="刪除這項花費">${icon("close")}</button></div>`).join("");
    $("iti-rows").innerHTML = itiRows.map((row, i) => `<div class="rowline">
      <input class="input" data-k="title" maxlength="40" placeholder="Day 1 / 上午" aria-label="行程時間 ${i + 1}" value="${esc(row.title)}">
      <input class="input" data-k="text" maxlength="200" placeholder="去了哪裡、做了什麼" aria-label="行程內容 ${i + 1}" value="${esc(row.text)}">
      <button class="icon-btn" type="button" data-del-iti="${i}" aria-label="刪除這段行程">${icon("close")}</button></div>`).join("");
    markFilled();
  };
  drawRows();
  $("cost-add").addEventListener("click", () => { readRows(); costRows.push({ label: "", amount: "" }); drawRows(); $("cost-rows").lastElementChild.querySelector("input").focus(); changed(); });
  $("iti-add").addEventListener("click", () => { readRows(); itiRows.push({ title: `Day ${itiRows.length + 1}`, text: "" }); drawRows(); $("iti-rows").lastElementChild.querySelector("[data-k=text]").focus(); changed(); });
  form.addEventListener("click", e => {
    const dc = e.target.closest("[data-del-cost]");
    const di = e.target.closest("[data-del-iti]");
    if (dc) { readRows(); costRows.splice(+dc.dataset.delCost, 1); drawRows(); changed(); }
    if (di) { readRows(); itiRows.splice(+di.dataset.delIti, 1); drawRows(); changed(); }
  });

  function markFilled() {
    const v = collect();
    const det = v.details;
    const set = (sel, on) => { const el = document.querySelector(`${sel} .filled`); if (el) el.textContent = on ? "已填寫" : ""; };
    set("#m-rest", !!det.restaurant);
    set("#m-cost", !!det.cost);
    set("#m-iti", !!det.itinerary);
    set("#m-tr", !!det.transport);
  }

  // ── 收集表單資料 ──
  function collect() {
    readRows();
    const details = {};
    const rest = { name: $("r-name").value.trim(), address: $("r-address").value.trim(), hours: $("r-hours").value.trim(), price: $("r-price").value.trim(), tips: $("r-tips").value.trim() };
    if (Object.values(rest).some(Boolean)) details.restaurant = rest;
    const items = costRows.map(i => ({ label: i.label.trim(), amount: i.amount === "" ? null : Number(String(i.amount).replace(/[,\s]/g, "")) }))
      .filter(i => i.label || i.amount != null);
    if (items.length) details.cost = { currency: $("cost-cur").value, items, note: $("cost-note").value.trim() };
    const iti = itiRows.map(i => ({ title: i.title.trim(), text: i.text.trim() })).filter(i => i.text);
    if (iti.length) details.itinerary = iti;
    const tr = $("f-transport").value.trim();
    if (tr) details.transport = tr;
    const ready = s.photos.filter(p => p.state === "ready");
    const coverPhoto = s.photos[s.coverIndex] && s.photos[s.coverIndex].state === "ready" ? s.photos[s.coverIndex] : ready[0];
    return {
      title: $("f-title").value.trim(),
      excerpt: $("f-excerpt").value.trim(),
      body: $("f-body").value.replace(/\s+$/, ""),
      category: (form.querySelector("input[name=category]:checked") || {}).value || "travel",
      country_code: $("f-country").value || null,
      city: $("f-city").value.trim() || null,
      place: $("f-place").value.trim() || null,
      visited_on: $("f-date").value || null,
      photos: ready.map(cleanPhoto),
      cover: coverPhoto ? cleanPhoto(coverPhoto) : null,
      details,
      featured: $("f-featured").checked
    };
  }

  // ── 修改追蹤與本機備份 ──
  let snapshot = JSON.stringify(collect());
  const isDirty = () => JSON.stringify(collect()) !== snapshot || s.uploading > 0;
  const backup = debounce(() => {
    if (JSON.stringify(collect()) !== snapshot) writeBackup(backupKey, { ...collect(), coverIndex: s.coverIndex });
  }, 800);
  function changed() {
    bodyCount();
    const dirty = isDirty();
    $("save-state").textContent = s.uploading ? `照片上傳中（${s.uploading} 張）⋯` : dirty ? "有尚未儲存的修改（已自動備份在這支手機）" : (saved ? `已儲存 · ${timeAgo(saved.updated_at)}` : "");
    $("save-state").classList.toggle("is-dirty", dirty);
    if (dirty) backup();
  }
  form.addEventListener("input", changed);
  form.addEventListener("change", () => { markFilled(); changed(); });

  guard = {
    hash: location.hash,
    isDirty,
    onLeave: async () => {
      // 離開且沒存：把這次上傳但沒用到的照片刪掉，並清掉備份
      const unsaved = s.sessionUploads.filter(u => !(saved && (saved.photos || []).some(p => p.path === u.path)));
      if (unsaved.length) await removeImages(sb, unsaved);
      if (isDirty()) clearBackup(backupKey);
    }
  };

  // 有未儲存的備份 → 問要不要恢復
  const bk = readBackup(backupKey);
  if (bk && bk.data && (!saved || new Date(bk.savedAt) > new Date(saved.updated_at)) && JSON.stringify(bk.data) !== snapshot) {
    $("restore").innerHTML = `<div class="restore-box" role="status"><span>這篇在 ${timeAgo(bk.savedAt)} 有還沒儲存的修改，要恢復嗎？</span>
      <div><button class="btn btn--sm" type="button" id="do-restore">恢復修改</button><button class="btn btn--ghost btn--sm" type="button" id="no-restore">捨棄</button></div></div>`;
    $("do-restore").addEventListener("click", () => { applyData(bk.data); $("restore").innerHTML = ""; toast("已恢復未儲存的修改"); });
    $("no-restore").addEventListener("click", () => { clearBackup(backupKey); $("restore").innerHTML = ""; });
  }

  function applyData(v) {
    $("f-title").value = v.title || "";
    $("f-excerpt").value = v.excerpt || "";
    $("f-body").value = v.body || "";
    const radio = form.querySelector(`input[name=category][value="${v.category}"]`);
    if (radio) radio.checked = true;
    $("f-country").value = v.country_code || "";
    $("f-city").value = v.city || "";
    $("f-place").value = v.place || "";
    $("f-date").value = v.visited_on || "";
    $("f-featured").checked = !!v.featured;
    const det = v.details || {};
    const rr = det.restaurant || {};
    $("r-name").value = rr.name || ""; $("r-address").value = rr.address || ""; $("r-hours").value = rr.hours || "";
    $("r-price").value = rr.price || ""; $("r-tips").value = rr.tips || "";
    const cc = det.cost || {};
    $("cost-cur").value = cc.currency || "TWD";
    $("cost-note").value = cc.note || "";
    costRows = (cc.items || []).map(i => ({ label: i.label || "", amount: i.amount ?? "" }));
    itiRows = (det.itinerary || []).map(i => ({ title: i.title || "", text: i.text || "" }));
    $("f-transport").value = det.transport || "";
    s.photos = (v.photos || []).map(p => ({ ...p, key: crypto.randomUUID(), state: "ready" }));
    s.coverIndex = Math.min(v.coverIndex || 0, Math.max(0, s.photos.length - 1));
    drawRows();
    renderPhotos();
    $("f-body").dispatchEvent(new Event("input"));
    changed();
  }

  // ── 照片 ──
  let caret = null;   // 內文游標位置（插入照片用）
  $("f-body").addEventListener("blur", () => { caret = $("f-body").selectionStart; });

  function renderPhotos() {
    const box = $("photos");
    box.innerHTML = s.photos.map((p, i) => {
      const src = p.state === "ready" ? p.thumb || p.url : p.localUrl;
      const isCover = i === s.coverIndex && p.state === "ready";
      return `<div class="ph" data-key="${p.key}">
        <div class="ph__img">
          ${src ? `<img src="${esc(src)}" alt="第 ${i + 1} 張照片">` : ""}
          ${isCover ? '<span class="ph__badge">封面</span>' : ""}
          <span class="ph__no" aria-hidden="true">${i + 1}</span>
          ${p.state === "processing" ? '<div class="ph__state"><span class="spinner"></span>壓縮、上傳中⋯</div>' : ""}
          ${p.state === "error" ? `<div class="ph__state is-error"><b>上傳失敗</b><span>${esc(p.error || "")}</span>
            ${p.file ? `<button class="btn btn--sm btn--ghost" type="button" data-act="retry">${ic("retry")}重試</button>` : ""}</div>` : ""}
        </div>
        ${p.state === "ready" ? `<input class="input ph__caption" data-act="caption" maxlength="200" placeholder="照片說明（選填）" aria-label="第 ${i + 1} 張照片說明" value="${esc(p.caption || "")}">` : ""}
        <div class="ph__tools">
          <button type="button" data-act="left" aria-label="往前移" ${i === 0 ? "disabled" : ""}>${ic("left")}</button>
          ${p.state === "ready" ? `<button type="button" data-act="cover" aria-label="設為封面" ${isCover ? "disabled" : ""}>${ic("star")}封面</button>
          <button type="button" data-act="insert" aria-label="把第 ${i + 1} 張放進內文">${ic("text")}內文</button>`
          : '<button type="button" disabled></button><button type="button" disabled></button>'}
          <button type="button" class="danger" data-act="remove" aria-label="移除第 ${i + 1} 張照片">${ic("trash")}</button>
        </div>
      </div>`;
    }).join("") + `<label class="add-photo" id="add-photo">
        ${ic("image")}<b>加入照片</b><span class="hint">從相簿選或直接拍照</span>
        <input type="file" id="f-files" accept="image/*" multiple>
      </label>`;
    $("f-files").addEventListener("change", e => { addFiles([...e.target.files]); e.target.value = ""; });
  }

  // 照片順序改變時，內文的 [照片 N] 也要跟著改
  function remapBody(mapIndex) {
    const ta = $("f-body");
    ta.value = ta.value.replace(/\[照片\s*(\d+)\]\n?/g, (m, n) => {
      const ni = mapIndex(parseInt(n, 10) - 1);
      return ni == null ? "" : `[照片 ${ni + 1}]${m.endsWith("\n") ? "\n" : ""}`;
    });
  }

  function move(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= s.photos.length) return;
    [s.photos[i], s.photos[j]] = [s.photos[j], s.photos[i]];
    if (s.coverIndex === i) s.coverIndex = j; else if (s.coverIndex === j) s.coverIndex = i;
    remapBody(k => (k === i ? j : k === j ? i : k));
    renderPhotos();
    changed();
  }

  $("photos").addEventListener("click", async e => {
    const b = e.target.closest("[data-act]");
    if (!b || b.dataset.act === "caption") return;
    const key = b.closest(".ph").dataset.key;
    const i = s.photos.findIndex(p => p.key === key);
    const p = s.photos[i];
    switch (b.dataset.act) {
      case "left": move(i, -1); break;
      case "cover": s.coverIndex = i; renderPhotos(); changed(); break;
      case "insert": insertPhotoToken(i); break;
      case "retry": if (p.file) { p.state = "processing"; p.error = ""; renderPhotos(); queueUpload(p); } break;
      case "remove": {
        const used = new RegExp(`\\[照片\\s*${i + 1}\\]`).test($("f-body").value);
        const ok = p.state !== "ready" || await confirmDialog({ title: "移除這張照片？", text: used ? "內文裡放這張照片的位置也會一起拿掉。" : "", ok: "移除", danger: true });
        if (!ok) return;
        s.photos.splice(i, 1);
        if (s.coverIndex === i) s.coverIndex = 0; else if (s.coverIndex > i) s.coverIndex--;
        remapBody(k => (k === i ? null : k > i ? k - 1 : k));
        // 這次才上傳、還沒存過的，直接從空間刪掉；存過的等按儲存才刪
        const fresh = s.sessionUploads.findIndex(u => u.path === p.path);
        if (fresh >= 0 && !(saved && (saved.photos || []).some(x => x.path === p.path))) {
          removeImages(sb, [p]);
          s.sessionUploads.splice(fresh, 1);
        }
        if (p.localUrl) URL.revokeObjectURL(p.localUrl);
        renderPhotos();
        changed();
        break;
      }
    }
  });
  $("photos").addEventListener("input", e => {
    if (e.target.dataset.act !== "caption") return;
    const p = s.photos.find(x => x.key === e.target.closest(".ph").dataset.key);
    if (p) p.caption = e.target.value;
  });

  // 拖放（電腦）
  form.addEventListener("dragover", e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); $("add-photo").classList.add("is-drag"); } });
  form.addEventListener("dragleave", () => $("add-photo") && $("add-photo").classList.remove("is-drag"));
  form.addEventListener("drop", e => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    $("add-photo").classList.remove("is-drag");
    addFiles([...e.dataTransfer.files]);
  });

  const queue = [];
  let active = 0;
  function queueUpload(p) { queue.push(p); pump(); }
  function pump() {
    while (active < 2 && queue.length) {
      const p = queue.shift();
      active++;
      uploadImage(sb, p.file, "posts").then(res => {
        Object.assign(p, res, { state: "ready", caption: p.caption || "" });
        s.sessionUploads.push(res);
        delete p.file;
        if (p.localUrl) { URL.revokeObjectURL(p.localUrl); delete p.localUrl; }
      }).catch(err => {
        p.state = "error";
        p.error = errMsg(err);
      }).finally(() => {
        active--;
        s.uploading--;
        // 照片可能在上傳時被移除
        if (!s.photos.includes(p) && p.state === "ready") removeImages(sb, [p]);
        renderPhotos();
        changed();
        if (!s.uploading) {
          const failed = s.photos.filter(x => x.state === "error").length;
          if (failed) toast(`有 ${failed} 張照片上傳失敗，可以按「重試」`, "error");
        }
        pump();
      });
    }
  }
  function addFiles(files) {
    const imgs = files.filter(f => !f.type || f.type.startsWith("image/"));
    if (imgs.length < files.length) toast("只能上傳照片檔", "error");
    if (!imgs.length) return;
    if (s.photos.length + imgs.length > 40) { toast("一篇最多 40 張照片", "error"); return; }
    for (const f of imgs) {
      const p = { key: crypto.randomUUID(), state: "processing", file: f, localUrl: URL.createObjectURL(f), caption: "" };
      s.photos.push(p);
      s.uploading++;
      queueUpload(p);
    }
    renderPhotos();
    changed();
  }

  // ── 內文工具列 ──
  function insertPhotoToken(i) {
    const ta = $("f-body");
    const pos = caret ?? ta.value.length;
    const before = ta.value.slice(0, pos).replace(/\s+$/, "");
    const after = ta.value.slice(pos).replace(/^\s+/, "");
    const token = `[照片 ${i + 1}]`;
    ta.value = (before ? before + "\n\n" : "") + token + (after ? "\n\n" + after : "\n\n");
    caret = (before ? before.length + 2 : 0) + token.length + 2;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    toast(`已把第 ${i + 1} 張照片放進內文`);
  }
  document.querySelector(".toolbar").addEventListener("click", async e => {
    const b = e.target.closest("[data-fmt]");
    if (!b) return;
    const ta = $("f-body");
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    const lineStart = ta.value.lastIndexOf("\n", start - 1) + 1;
    const prefix = { h2: "## ", quote: "> ", list: "- " }[b.dataset.fmt];
    if (b.dataset.fmt === "photo") {
      const ready = s.photos.map((p, i) => ({ p, i })).filter(x => x.p.state === "ready");
      if (!ready.length) { toast("先在上面加入照片，再放進內文", "error"); return; }
      caret = start;
      const n = await pickPhoto(ready);
      if (n != null) insertPhotoToken(n);
      return;
    }
    if (b.dataset.fmt === "bold") {
      const text = sel || "重點";
      ta.setRangeText(`**${text}**`, start, end, "end");
      if (!sel) ta.setSelectionRange(start + 2, start + 2 + text.length);
    } else {
      ta.setRangeText(prefix, lineStart, lineStart, "end");
    }
    ta.focus();
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });

  function pickPhoto(ready) {
    return new Promise(resolve => {
      const dlg = document.createElement("dialog");
      dlg.className = "adm-dialog";
      dlg.innerHTML = `<h2>要放哪一張？</h2>
        <div class="photos" style="grid-template-columns:repeat(3,1fr);margin-top:14px">${ready.map(({ p, i }) =>
          `<button type="button" class="ph" data-i="${i}" style="cursor:pointer"><div class="ph__img"><img src="${esc(p.thumb || p.url)}" alt="第 ${i + 1} 張"><span class="ph__no">${i + 1}</span></div></button>`).join("")}</div>
        <div class="dialog-actions" style="grid-template-columns:1fr"><button class="btn btn--ghost" type="button" value="cancel">取消</button></div>`;
      document.body.appendChild(dlg);
      const done = v => { dlg.close(); dlg.remove(); resolve(v); };
      dlg.addEventListener("click", e => {
        const b = e.target.closest("[data-i]");
        if (b) done(+b.dataset.i);
        else if (e.target.closest("[value=cancel]")) done(null);
      });
      dlg.addEventListener("cancel", e => { e.preventDefault(); done(null); });
      dlg.showModal();
    });
  }

  // ── 驗證 ──
  function validate(v, publish) {
    const errs = [];
    form.querySelectorAll("[aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
    if (publish && !v.title) errs.push({ el: "f-title", msg: "請填寫標題" });
    if (!publish && !v.title && !v.body && !v.photos.length) errs.push({ el: "f-title", msg: "至少寫個標題、內文或加一張照片，才能存草稿" });
    if (publish && !v.cover) errs.push({ el: "add-photo", msg: "發布前請至少加入一張照片當封面" });
    if ([...v.title].length > 120) errs.push({ el: "f-title", msg: "標題最多 120 字" });
    if ([...v.excerpt].length > 300) errs.push({ el: "f-excerpt", msg: "摘要最多 300 字" });
    const badCost = (v.details.cost ? v.details.cost.items : []).some(i => i.amount != null && !Number.isFinite(i.amount));
    if (badCost) errs.push({ el: "cost-rows", msg: "花費的金額只能填數字" });
    if (s.uploading) errs.push({ el: "photos", msg: "照片還在上傳，請等一下再儲存" });
    if (s.photos.some(p => p.state === "error")) errs.push({ el: "photos", msg: "有照片上傳失敗，請按「重試」或移除" });
    $("errors").innerHTML = errs.length ? `<div class="err-box" role="alert" tabindex="-1" id="err-box"><b>還差一點點：</b><ul>${errs.map(e => `<li>${esc(e.msg)}</li>`).join("")}</ul></div>` : "";
    errs.forEach(e => { const el = $(e.el); if (el && el.matches("input, textarea, select")) el.setAttribute("aria-invalid", "true"); });
    if (errs.length) {
      if (errs[0].el === "cost-rows") $("m-cost").open = true;
      const first = $(errs[0].el);
      $("err-box").focus({ preventScroll: true });
      (first || $("err-box")).scrollIntoView({ behavior: "smooth", block: "center" });
      if (first && first.matches("input, textarea")) setTimeout(() => first.focus({ preventScroll: true }), 300);
    }
    return !errs.length;
  }

  // ── 儲存 ──
  let saving = false;
  async function save(status, btn) {
    if (saving) return;
    const v = collect();
    if (!validate(v, status === "published")) return;
    saving = true;
    setBusy(btn, true, status === "published" ? "發布中" : "儲存中");
    const row = { ...v, status };
    const q = s.id
      ? sb.from("posts").update(row).eq("id", s.id).select().single()
      : sb.from("posts").insert(row).select().single();
    const { data, error } = await q;
    saving = false;
    setBusy(btn, false);
    if (error) { toast(errMsg(error), "error"); return; }

    // 存檔成功後，才刪掉被移除的舊照片
    const keep = new Set(data.photos.map(p => p.path));
    const gone = (saved ? saved.photos || [] : []).filter(p => !keep.has(p.path));
    if (gone.length) removeImages(sb, gone);
    const wasNew = !s.id;
    const wasPublished = s.status === "published";
    saved = data;
    s.id = data.id;
    s.status = data.status;
    s.sessionUploads = [];
    clearBackup(backupKey);
    if (wasNew) clearBackup("new");
    snapshot = JSON.stringify(collect());
    if (wasNew) {
      history.replaceState(null, "", `#/edit/${data.id}`);
      guard.hash = location.hash;
      $("more-menu").hidden = false;
      $("view-live").href = `../post.html?id=${data.id}`;
      document.querySelector(".adm-top__title").textContent = "編輯文章";
    }
    renderActions();
    changed();
    toast(status === "published" ? (wasPublished ? "文章已更新！" : "發布成功！網站上已經看得到了") : (wasPublished ? "已取消發布，改回草稿" : "草稿已儲存"));
  }

  function renderActions() {
    const pub = s.status === "published";
    $("status-pill").innerHTML = s.id ? `<span class="status-pill status-pill--${s.status}">${pub ? "已發布" : "草稿"}</span>` : "";
    $("unpublish-btn").hidden = !pub;
    $("actions").className = `actionbar__inner${pub ? " two" : ""}`;
    $("actions").innerHTML = `
      <button class="btn btn--ghost btn--icon" type="button" id="preview-btn" aria-label="預覽">${ic("eye")}</button>
      ${pub ? "" : `<button class="btn btn--ghost" type="button" id="draft-btn">存草稿</button>`}
      <button class="btn btn--accent" type="button" id="publish-btn">${pub ? "儲存更新" : "發布"}</button>`;
    $("preview-btn").addEventListener("click", preview);
    if ($("draft-btn")) $("draft-btn").addEventListener("click", e => save("draft", e.currentTarget));
    $("publish-btn").addEventListener("click", e => save("published", e.currentTarget));
  }

  // ── 更多選單：取消發布 / 刪除 ──
  const moreBtn = $("more-btn"), morePanel = $("more-panel");
  const setMenu = open => { morePanel.hidden = !open; moreBtn.setAttribute("aria-expanded", String(open)); };
  moreBtn.addEventListener("click", () => setMenu(morePanel.hidden));
  document.addEventListener("click", e => { if (!e.target.closest("#more-menu")) setMenu(false); });
  $("unpublish-btn").addEventListener("click", async () => {
    setMenu(false);
    const ok = await confirmDialog({ title: "取消發布這篇？", text: "文章會改回草稿，訪客就看不到了。之後可以再發布。", ok: "改回草稿" });
    if (ok) save("draft", null);
  });
  $("delete-btn").addEventListener("click", async () => {
    setMenu(false);
    const ok = await confirmDialog({ title: "確定要刪除嗎？", text: `「${collect().title || "未命名"}」和裡面的照片都會永久刪除，無法復原。`, ok: "永久刪除", danger: true });
    if (!ok) return;
    const { error } = await sb.from("posts").delete().eq("id", s.id);
    if (error) { toast(errMsg(error), "error"); return; }
    await removeImages(sb, [...(saved.photos || []), ...s.sessionUploads]);
    clearBackup(backupKey);
    guard = null;
    toast("文章已刪除");
    location.hash = "#/posts";
  });

  // ── 預覽 ──
  function preview() {
    const v = collect();
    const post = { ...v, id: s.id || "preview", status: s.status, published_at: saved && saved.published_at, updated_at: new Date().toISOString() };
    const ov = document.createElement("div");
    ov.className = "preview";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "文章預覽");
    ov.innerHTML = `<div class="preview__bar"><span>預覽：發布後的樣子</span><button class="btn btn--light btn--sm" type="button" id="close-preview">關閉預覽</button></div>
      <article>${articleHtml(post)}</article><div class="preview__end"></div>`;
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    bindArticle(ov, post, openLightbox);
    const close = () => { ov.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); $("preview-btn").focus(); };
    const onKey = e => { if (e.key === "Escape" && !document.getElementById("lightbox")?.classList.contains("is-open")) close(); if (e.key === "Tab") trapFocus(e, ov); };
    document.addEventListener("keydown", onKey);
    ov.querySelector("#close-preview").addEventListener("click", close);
    ov.querySelector("#close-preview").focus();
  }

  renderPhotos();
  renderActions();
  changed();
  // 新文章自動把游標放在標題；如果使用者已經點了別的欄位，就不要搶走焦點
  if (!id) setTimeout(() => { if (!form.contains(document.activeElement)) $("f-title").focus({ preventScroll: true }); }, 100);
}

// ── 網站設定（個人資料） ──────────────────────
async function settingsView() {
  app.innerHTML = `${topBar({ back: "#/posts", title: "網站設定", actions: `<a class="adm-link" href="../about.html" target="_blank" rel="noopener">${icon("globe")}<span>看網站</span></a>` })}
    <main class="adm-main"><div class="panel" style="text-align:center;padding:48px"><span class="spinner"></span></div></main>`;
  bindCommon();
  const { data: pf, error } = await sb.from("profile").select("*").eq("id", 1).maybeSingle();
  const main = app.querySelector(".adm-main");
  if (error || !pf) {
    main.innerHTML = `<div class="panel" style="text-align:center"><p class="err-box" role="alert">${esc(error ? errMsg(error) : "找不到個人資料，請確認資料庫已初始化。")}</p>
      <button class="btn btn--ghost" type="button" id="retry">${ic("retry")}再試一次</button></div>`;
    document.getElementById("retry").addEventListener("click", settingsView);
    return;
  }
  let saved = pf;
  const st = {
    avatar: pf.avatar, hero: pf.hero_image,
    favorites: [...(pf.favorites || [])],
    wishlist: (pf.wishlist || []).map(w => ({ ...w })),
    uploads: []
  };
  const so = pf.socials || {};

  main.innerHTML = `<h1 class="sr-only">網站設定</h1><p class="adm-sub">這裡的內容會出現在首頁、關於魚魚和頁尾。</p>
    <div id="errors" style="margin-top:14px"></div>
    <form id="pf-form" novalidate style="margin-top:14px">
      <section class="panel" aria-labelledby="s-photo">
        <h2 class="panel__title" id="s-photo">照片</h2>
        <div class="field"><span class="label">我的照片（關於魚魚）</span>
          <div class="single-img"><div class="single-img__preview" id="avatar-prev"></div>
            <div class="single-img__actions"><label class="btn btn--ghost btn--sm file-btn">換照片<input type="file" accept="image/*" id="avatar-file" aria-label="選擇我的照片"></label>
            <button class="btn btn--ghost btn--sm" type="button" id="avatar-clear">移除</button></div></div></div>
        <div class="field"><span class="label">首頁大圖</span>
          <div class="single-img single-img--wide"><div class="single-img__preview" id="hero-prev"></div>
            <div class="single-img__actions"><label class="btn btn--ghost btn--sm file-btn">換首頁大圖<input type="file" accept="image/*" id="hero-file" aria-label="選擇首頁大圖"></label>
            <button class="btn btn--ghost btn--sm" type="button" id="hero-clear">用預設圖片</button></div>
            <p class="hint">建議用橫向、天空或風景比較多的照片，文字會壓在左下角。</p></div></div>
      </section>

      <section class="panel" aria-labelledby="s-intro">
        <h2 class="panel__title" id="s-intro">自我介紹</h2>
        <div class="row2">
          <div class="field"><label for="p-nick">暱稱</label><input class="input" id="p-nick" maxlength="20" value="${esc(pf.nickname)}"></div>
          <div class="field"><label for="p-name">本名</label><input class="input" id="p-name" maxlength="20" value="${esc(pf.full_name)}"></div>
        </div>
        <div class="field"><label for="p-tagline">首頁標語 <span class="count" id="c-tagline"></span></label><input class="input" id="p-tagline" maxlength="60" value="${esc(pf.tagline)}"></div>
        <div class="field"><label for="p-note">首頁手寫小語 <span class="count" id="c-note"></span></label><input class="input" id="p-note" maxlength="40" value="${esc(pf.hero_note)}"></div>
        <div class="field"><label for="p-intro">簡短介紹 <span class="count" id="c-intro"></span></label><textarea class="input" id="p-intro" maxlength="300" style="min-height:100px">${esc(pf.intro)}</textarea>
          <p class="hint">出現在首頁「關於魚魚」與頁尾。</p></div>
        <div class="field"><label for="p-bio">我的故事 <span class="count" id="c-bio"></span></label><textarea class="input" id="p-bio" maxlength="4000" style="min-height:180px">${esc(pf.bio)}</textarea>
          <p class="hint">出現在「關於魚魚」頁。空一行就是新段落。</p></div>
        <div class="field"><label for="p-ph">旅行理念 <span class="count" id="c-ph"></span></label><input class="input" id="p-ph" maxlength="1000" value="${esc(pf.philosophy)}" placeholder="旅行不是逃避生活，而是讓生活更完整。"></div>
        <div class="field"><span class="label">喜歡的事物</span>
          <div class="tags" id="fav-tags"></div>
          <div class="tag-add"><label class="sr-only" for="fav-in">新增喜歡的事物</label><input class="input" id="fav-in" maxlength="20" placeholder="例如：日落、手沖咖啡" enterkeyhint="done">
            <button class="btn btn--ghost btn--sm" type="button" id="fav-add">新增</button></div></div>
      </section>

      <section class="panel" aria-labelledby="s-social">
        <h2 class="panel__title" id="s-social">社群連結 <small>沒填的不會顯示</small></h2>
        ${[["instagram", "Instagram 帳號", "@yuyu.goes.out"], ["threads", "Threads 帳號", "@yuyu.goes.out"], ["facebook", "Facebook 網址或帳號", ""], ["youtube", "YouTube 頻道", "@yuyu"], ["email", "聯絡 Email", "hello@example.com"]].map(([k, l, ph]) =>
          `<div class="field"><label for="so-${k}">${l}</label><input class="input" id="so-${k}" maxlength="120" autocapitalize="off" spellcheck="false" ${k === "email" ? 'type="email" inputmode="email"' : ""} placeholder="${ph}" value="${esc(so[k] || "")}"></div>`).join("")}
      </section>

      <section class="panel" aria-labelledby="s-wish">
        <h2 class="panel__title" id="s-wish">下一站想去 <small>顯示在首頁與旅行足跡</small></h2>
        <div class="rows" id="wish-rows"></div>
        <button type="button" class="add-row" id="wish-add">＋ 加一個想去的地方</button>
      </section>
    </form>
    <div class="actionbar"><p class="save-state" id="save-state" aria-live="polite"></p>
      <div class="actionbar__inner" style="grid-template-columns:1fr"><button class="btn btn--accent" type="button" id="pf-save">儲存設定</button></div></div>`;

  const $ = x => document.getElementById(x);
  const form = $("pf-form");
  counter($("p-tagline"), $("c-tagline"), 60);
  counter($("p-note"), $("c-note"), 40);
  counter($("p-intro"), $("c-intro"), 300);
  counter($("p-bio"), $("c-bio"), 4000);
  counter($("p-ph"), $("c-ph"), 1000);
  autoGrow($("p-bio"));

  const drawImg = (el, ph, fallback) => { el.innerHTML = ph && ph.url ? `<img src="${esc(ph.thumb || ph.url)}" alt="">` : `<div class="monogram" style="font-size:2rem">${fallback}</div>`; };
  const drawImgs = () => { drawImg($("avatar-prev"), st.avatar, "魚"); drawImg($("hero-prev"), st.hero, "預設"); };
  drawImgs();

  const drawFavs = () => {
    $("fav-tags").innerHTML = st.favorites.length ? st.favorites.map((f, i) => `<span class="tag">${esc(f)}<button type="button" data-fav="${i}" aria-label="移除 ${esc(f)}">${icon("close")}</button></span>`).join("")
      : '<span class="hint">還沒有，加幾個吧</span>';
  };
  drawFavs();
  const addFav = () => {
    const v = $("fav-in").value.trim();
    if (!v) return;
    if (st.favorites.length >= 12) { toast("最多 12 個", "error"); return; }
    if (!st.favorites.includes(v)) st.favorites.push(v);
    $("fav-in").value = "";
    drawFavs();
    changed();
  };
  $("fav-add").addEventListener("click", addFav);
  $("fav-in").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addFav(); } });
  $("fav-tags").addEventListener("click", e => { const b = e.target.closest("[data-fav]"); if (b) { st.favorites.splice(+b.dataset.fav, 1); drawFavs(); changed(); } });

  const readWish = () => {
    st.wishlist = [...$("wish-rows").querySelectorAll(".wish-row")].map(el => ({
      country_code: el.querySelector("select").value, city: el.querySelector("[data-k=city]").value.trim(), note: el.querySelector("[data-k=note]").value.trim()
    }));
  };
  const drawWish = () => {
    $("wish-rows").innerHTML = st.wishlist.map((w, i) => `<div class="wish-row panel" style="padding:12px;background:var(--paper)">
      <div class="row2"><div class="field"><label for="w-c${i}">國家</label><select class="input" id="w-c${i}">${countrySelect(w.country_code || "")}</select></div>
        <div class="field"><label for="w-city${i}">城市（選填）</label><input class="input" id="w-city${i}" data-k="city" maxlength="40" value="${esc(w.city || "")}"></div></div>
      <div class="field"><label for="w-n${i}">想做什麼</label><input class="input" id="w-n${i}" data-k="note" maxlength="60" placeholder="例如：看一次極光" value="${esc(w.note || "")}"></div>
      <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end">
        <button class="btn btn--ghost btn--sm" type="button" data-wup="${i}" ${i === 0 ? "disabled" : ""} aria-label="往上移">${ic("left")}往上</button>
        <button class="btn btn--ghost btn--sm" type="button" data-wdel="${i}">${ic("trash")}刪除</button></div></div>`).join("");
  };
  drawWish();
  $("wish-add").addEventListener("click", () => { readWish(); st.wishlist.push({ country_code: "", city: "", note: "" }); drawWish(); $("wish-rows").lastElementChild.querySelector("select").focus(); changed(); });
  $("wish-rows").addEventListener("click", e => {
    const up = e.target.closest("[data-wup]"), del = e.target.closest("[data-wdel]");
    if (!up && !del) return;
    readWish();
    if (up) { const i = +up.dataset.wup; [st.wishlist[i - 1], st.wishlist[i]] = [st.wishlist[i], st.wishlist[i - 1]]; }
    if (del) st.wishlist.splice(+del.dataset.wdel, 1);
    drawWish();
    changed();
  });

  async function pickImage(input, kind) {
    const f = input.files[0];
    input.value = "";
    if (!f) return;
    const prev = kind === "avatar" ? $("avatar-prev") : $("hero-prev");
    prev.insertAdjacentHTML("beforeend", '<div class="ph__state"><span class="spinner"></span>上傳中⋯</div>');
    try {
      const res = await uploadImage(sb, f, "site", kind === "avatar" ? { large: 1400, small: 600 } : { large: 2400, small: 1000 });
      st.uploads.push(res);
      if (kind === "avatar") st.avatar = res; else st.hero = res;
      toast("照片上傳好了，記得按「儲存設定」");
    } catch (err) { toast(errMsg(err), "error"); }
    drawImgs();
    changed();
  }
  $("avatar-file").addEventListener("change", e => pickImage(e.target, "avatar"));
  $("hero-file").addEventListener("change", e => pickImage(e.target, "hero"));
  $("avatar-clear").addEventListener("click", () => { st.avatar = null; drawImgs(); changed(); });
  $("hero-clear").addEventListener("click", () => { st.hero = null; drawImgs(); changed(); });

  function collect() {
    readWish();
    const socials = {};
    for (const k of ["instagram", "threads", "facebook", "youtube", "email"]) { const v = $(`so-${k}`).value.trim(); if (v) socials[k] = v; }
    return {
      nickname: $("p-nick").value.trim() || "魚魚",
      full_name: $("p-name").value.trim() || "榆芳",
      tagline: $("p-tagline").value.trim(),
      hero_note: $("p-note").value.trim(),
      intro: $("p-intro").value.trim(),
      bio: $("p-bio").value.trim(),
      philosophy: $("p-ph").value.trim(),
      favorites: st.favorites,
      socials,
      wishlist: st.wishlist.filter(w => w.country_code),
      avatar: st.avatar ? cleanPhoto(st.avatar) : null,
      hero_image: st.hero ? cleanPhoto(st.hero) : null
    };
  }
  let snapshot = JSON.stringify(collect());
  const isDirty = () => JSON.stringify(collect()) !== snapshot;
  function changed() {
    const dirty = isDirty();
    $("save-state").textContent = dirty ? "有尚未儲存的修改" : "";
    $("save-state").classList.toggle("is-dirty", dirty);
  }
  form.addEventListener("input", changed);
  form.addEventListener("change", changed);
  guard = {
    hash: location.hash || "#/settings",
    isDirty,
    onLeave: async () => {
      const used = new Set([saved.avatar && saved.avatar.path, saved.hero_image && saved.hero_image.path]);
      const orphan = st.uploads.filter(u => !used.has(u.path));
      if (orphan.length) await removeImages(sb, orphan);
      st.uploads = [];
    }
  };

  $("pf-save").addEventListener("click", async e => {
    const v = collect();
    const errs = [];
    if (v.socials.email && !/^\S+@\S+\.\S+$/.test(v.socials.email)) errs.push("聯絡 Email 格式不正確");
    if (st.wishlist.some(w => !w.country_code && (w.city || w.note))) errs.push("願望清單有一項沒選國家");
    $("errors").innerHTML = errs.length ? `<div class="err-box" role="alert"><ul>${errs.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
    if (errs.length) { $("errors").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const btn = e.currentTarget;
    setBusy(btn, true, "儲存中");
    const { data, error } = await sb.from("profile").update({ ...v, updated_at: new Date().toISOString() }).eq("id", 1).select().single();
    setBusy(btn, false);
    if (error) { toast(errMsg(error), "error"); return; }
    // 換掉的舊照片與沒用到的新照片清掉
    const used = new Set([data.avatar && data.avatar.path, data.hero_image && data.hero_image.path].filter(Boolean));
    const old = [saved.avatar, saved.hero_image].filter(p => p && p.path && !used.has(p.path));
    const unused = st.uploads.filter(u => !used.has(u.path));
    if (old.length || unused.length) removeImages(sb, [...old, ...unused]);
    st.uploads = [];
    saved = data;
    snapshot = JSON.stringify(collect());
    changed();
    toast("設定已儲存，網站已更新");
  });
}

// ── 啟動 ─────────────────────────────────────
async function boot() {
  if (isDemo) return setupView();
  try {
    sb = await getClient({ timeout: 90000 });
  } catch {
    app.innerHTML = `<div class="auth"><div class="auth__inner"><div class="panel" style="text-align:center">
      <p class="err-box" role="alert">後台程式載入失敗，請檢查網路後重新整理。</p>
      <button class="btn btn--ghost" type="button" onclick="location.reload()">重新整理</button></div></div></div>`;
    return;
  }
  let recovering = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") { recovering = true; resetView(); }
    if (event === "SIGNED_OUT" && session) { session = null; loginView("登入已過期，請重新登入"); }
  });
  const { data, error } = await sb.auth.getSession();
  if (recovering) return;
  if (error || !data.session) return loginView();
  await enter(data.session);
}

boot();
