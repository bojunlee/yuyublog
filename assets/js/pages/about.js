import { esc, img, renderBody } from "../lib/util.js";
import { getProfile, allPlaces } from "../lib/data.js";
import { initPage, socialLinks, reveal, stagger, toast } from "../lib/ui.js";

initPage("about");

const $ = id => document.getElementById(id);

async function init() {
  let pf;
  try {
    pf = await getProfile();
  } catch (e) {
    toast(e.message, "error");
    pf = {};
  }
  const nick = pf.nickname || "魚魚";
  $("about-name").innerHTML = `我是${esc(nick)}<small>${esc(pf.full_name || "榆芳")} · 夢想是環遊世界</small>`;
  $("about-intro").textContent = pf.intro || "";
  $("about-photo").innerHTML = pf.avatar && pf.avatar.url
    ? img(pf.avatar, { sizes: "(min-width: 900px) 45vw, 92vw", alt: `${nick}的照片`, eager: true })
    : `<div class="monogram" aria-hidden="true">魚</div>`;
  const social = socialLinks(pf.socials);
  $("about-socials").innerHTML = social;
  $("about-socials").hidden = !social;

  const bio = renderBody(pf.bio || "").html;
  $("about-bio").innerHTML = bio || `<p>${esc(pf.intro || "")}</p>`;
  if (pf.philosophy) $("about-philosophy").textContent = pf.philosophy;
  const favs = pf.favorites || [];
  $("about-favs").innerHTML = favs.map(f => `<li>${esc(f)}</li>`).join("");
  $("about-favs").hidden = !favs.length;
  stagger($("about-favs"));
  reveal();

  try {
    const places = await allPlaces();
    const countries = new Set(places.map(p => p.country_code).filter(Boolean));
    const cities = new Set(places.filter(p => p.city).map(p => `${p.country_code}|${p.city}`));
    $("about-stats").innerHTML = `
      <div class="stat"><b>${countries.size}</b><span>個國家</span></div>
      <div class="stat"><b>${cities.size}</b><span>座城市</span></div>
      <div class="stat"><b>${places.length}</b><span>篇故事</span></div>`;
  } catch { $("about-stats").innerHTML = ""; }
}

init();
