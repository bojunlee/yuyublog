// 中文字型「用多少載多少」
// 中文字型完整檔案很大（Noto Serif TC 單一字重就 1 MB 以上），但每頁的標題和手寫句只用到幾百個字。
// 這裡會找出頁面上「標題字型」與「手寫字型」實際用到的字，只向 Google Fonts 要這些字（text= 參數），
// 通常只有幾十 KB。之後畫面上出現新的字（例如文章載入完成），會再補載缺少的字。
// 內文使用手機與電腦內建的中文字型（蘋方、思源黑體、微軟正黑體），不需要下載。

const FAMILIES = [
  { name: "Yuyu Serif", query: "Noto+Serif+TC:wght@700", weight: "700" },
  { name: "Yuyu Hand", query: "LXGW+WenKai+TC", weight: "400" }
];
const CHUNK = 180;                     // 每次最多要幾個字（網址長度限制）
const loaded = Object.fromEntries(FAMILIES.map(f => [f.name, new Set()]));

function collect() {
  const need = Object.fromEntries(FAMILIES.map(f => [f.name, new Set()]));
  const famOf = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue;
    const el = n.parentElement;
    if (!el || !text.trim()) continue;
    let fam = famOf.get(el);
    if (fam === undefined) {
      const ff = getComputedStyle(el).fontFamily;
      fam = FAMILIES.find(f => ff.includes(f.name))?.name || null;
      famOf.set(el, fam);
    }
    if (!fam) continue;
    for (const ch of text) if (ch.trim() && !loaded[fam].has(ch)) need[fam].add(ch);
  }
  return need;
}

async function load(family, chars) {
  const list = [...chars];
  list.forEach(c => loaded[family.name].add(c));       // 先標記，避免重複請求
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    try {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.query}&display=swap&text=${encodeURIComponent(chunk.join(""))}`)).text();
      const src = (css.match(/src:\s*url\(([^)]+)\)/) || [])[1];
      if (!src) throw new Error("no font");
      const face = new FontFace(family.name, `url(${src})`, {
        weight: family.weight,
        display: "swap",
        unicodeRange: chunk.map(c => `U+${c.codePointAt(0).toString(16)}`).join(",")
      });
      document.fonts.add(face);
      face.load().catch(() => {});
    } catch {
      chunk.forEach(c => loaded[family.name].delete(c));   // 失敗就讓下次再試；這段期間用系統字型顯示
    }
  }
}

function run() {
  const need = collect();
  for (const f of FAMILIES) if (need[f.name].size) load(f, need[f.name]);
}

export function initFonts() {
  if (!("FontFace" in window) || !document.fonts) return;
  run();
  let t;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(run, 200); })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
}
