'use strict';
/* Drop & Clue Helper - unofficial fan-made RS3 companion. All data is local (data/*.json). */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const cache = {};
const get = async p => cache[p] ??= fetch(p).then(r => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); });
const view = $('#view');
const RANK = ['Always', 'Common', 'Uncommon', 'Rare', 'Very rare'];
const TIERS = ['beginner', 'easy', 'medium', 'hard', 'elite', 'master', 'cs_week', 'unknown'];
const TYPE_LABEL = {emote: 'Emote', anagram: 'Anagram', coordinate: 'Coordinate', cryptic: 'Cryptic', simple: 'Simple', map: 'Map',
  scan: 'Scan', compass: 'Compass', cs_week: 'CS Week', cipher: 'Cipher'};
const cap = s => s === 'cs_week' || s === 'cs week' ? 'CS Week' : s ? s[0].toUpperCase() + s.slice(1) : s;
let ICONS = {}, EMOTES = {}, MTHUMB = {}, SRCPICS = {};

const PH = (glyph, size = 32) => `<span class="ph" style="width:${size}px;height:${size}px" title="No picture on the RS3 wiki">${glyph}</span>`;
function icon(item) {
  const f = ICONS[item] || GICONS[item] || IICONS[item];
  return f ? `<img class="ico" loading="lazy" src="${esc(f)}" alt="">` : PH('✦');
}
function mthumb(name, size = 36) {
  const f = MTHUMB[name];
  return f ? `<img class="ico" style="width:${size}px;height:${size}px" loading="lazy" src="${esc(f)}" alt="">` : PH('☗', size);
}
function emoteIcon(e) { const f = EMOTES[e]; return f ? `<img class="ico" loading="lazy" src="${esc(f)}" alt="">` : PH('✋'); }
function itemLink(item) { return `<a href="#items/${encodeURIComponent(item)}" class="item">${icon(item)}<span>${esc(item)}</span></a>`; }
function fmtP(p) {
  if (p == null) return '';
  if (p >= 1) return '100%';
  const pct = p * 100;
  return (pct >= 1 ? pct.toFixed(1) : pct >= 0.1 ? pct.toFixed(2) : pct.toPrecision(2)) + '%';
}
function rarityCell(raw, p, rank) {
  const cls = rank == null ? '' : 'r' + Math.min(rank, 4);
  const pct = p != null && p < 1 ? `<div class="note">${fmtP(p)}</div>` : '';
  return `<span class="${cls}">${esc(raw || '?')}</span>${pct}`;
}
/* ---------- reference pictures (from the wiki, shown with the text they belong to; tap to enlarge) ---------- */
function fig(p, cls = '') {
  if (!p) return '';
  const [src, cap, w, h, kind] = p;
  return `<figure class="ref ${kind || ''} ${cls}"><img class="refimg" loading="lazy" decoding="async" src="${esc(src)}" ${w ? `width="${w}" height="${h}"` : ''} alt="${esc(cap)}" data-cap="${esc(cap)}" onerror="this.closest('figure').remove()">${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`;
}
function gallery(list, cls = '') {
  list = (list || []).filter(Boolean);
  if (!list.length) return '';
  return `<div class="refs ${list.length > 1 ? 'multi' : 'single'} ${cls}">${list.map(p => fig(p)).join('')}</div>`;
}
const lb = document.createElement('div'); lb.id = 'lightbox'; lb.hidden = true;
lb.innerHTML = '<img alt=""><div class="lbcap"></div><div class="lbhint">Tap anywhere to close</div>';
document.body.appendChild(lb);
lb.onclick = () => { lb.hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.hidden = true; });
document.addEventListener('click', e => {
  const im = e.target.closest && e.target.closest('img.refimg');
  if (!im) return;
  e.preventDefault(); e.stopPropagation();
  lb.querySelector('img').src = im.currentSrc || im.src; lb.querySelector('.lbcap').textContent = im.dataset.cap || ''; lb.hidden = false;
}, true);
function coordStr(c, plane) { return c ? `${c[0]}, ${c[1]}${plane ? ` (floor ${plane})` : ''}` : ''; }

/* ---------- tabs / routing ---------- */
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { location.hash = b.dataset.tab; });
function setTab(t) { document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); }
async function route() {
  const [tab, ...rest] = (location.hash.slice(1) || 'drops').split('/');
  const arg = rest.length ? decodeURIComponent(rest.join('/')) : '';
  setTab(tab);
  try {
    if (tab === 'items') await itemsView(arg);
    else if (tab === 'clues') await cluesView(arg);
    else if (tab === 'about') await aboutView();
    else if (tab === 'quests') await questsView(arg);
    else if (tab === 'map') await mapTab(arg);
    else await dropsView(arg);
  } catch (e) { view.innerHTML = `<div class="panel">Could not load data: ${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------- search helper ---------- */
function searchBox(id, ph, val = '') {
  return `<div class="row"><input id="${id}" type="search" placeholder="${esc(ph)}" value="${esc(val)}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`;
}
function score(name, q, pre) {
  const n = pre ?? norm(name); if (!q) return 1;
  if (n === q) return 1000; if (n.startsWith(q)) return 500 - n.length;
  const i = n.indexOf(q); if (i >= 0) return 300 - i - n.length / 10;
  const toks = q.split(' '); if (toks.every(t => n.includes(t))) return 100 - n.length / 10;
  return -1;
}

async function loadThumbs() { const mons = await get('data/monsters.json'); if (!Object.keys(MTHUMB).length) mons.forEach(m => { if (m[6]) MTHUMB[m[0]] = m[6]; }); return mons; }
/* ---------- monsters ---------- */
async function dropsView(name) {
  const mons = await loadThumbs();
  if (name) return monsterView(name, mons);
  view.innerHTML = `<div class="panel"><h2>Find a monster</h2>
    ${searchBox('q', 'e.g. abyssal demon, kalphite, cockatrice…', sessionStorage.mq || '')}
    <div class="note" style="margin-top:6px">${mons.length.toLocaleString()} monsters with drop tables in this offline copy.</div>
    <div id="res" class="list"></div></div>`;
  const q = $('#q'), out = $('#res');
  const draw = () => {
    sessionStorage.mq = q.value; const nq = norm(q.value);
    const hits = (nq ? mons.map(m => [score(m[0], nq), m]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]).map(x => x[1])
      : [...mons].sort((a, b) => b[4] - a[4])).slice(0, 60);
    out.innerHTML = (nq ? '' : '<div class="note">Largest drop tables:</div>') + hits.map(m =>
      `<a class="hit" href="#drops/${encodeURIComponent(m[0])}">${mthumb(m[0])}<span>${esc(m[0])}</span>
       <span class="meta">${m[1] ? 'Lvl ' + esc(m[1]) : ''}${m[2] ? ' · Slayer ' + esc(m[2]) : ''} · ${m[4]} drops</span></a>`).join('');
  };
  q.oninput = draw; draw(); q.focus();
}
const SORTS = {likely: 'Most likely first', rarest: 'Rarest first', name: 'Name A–Z', table: 'Drop table group'};
async function monsterView(name, mons) {
  const m = mons.find(x => x[0] === name);
  if (!m) { view.innerHTML = `<div class="panel">No drop data for ${esc(name)} in this copy. <a href="#drops">Back</a></div>`; return; }
  const [shard, travel] = await Promise.all([get(`data/m/${m[5]}.json`), get('data/travel.json')]);
  const d = shard[name];
  let sort = localStorage.dsort || 'likely', filt = '';
  const kv = [['Combat', d.combat], ['Life points', d.lifepoints], ['Slayer level', d.slayer_level], ['Members', d.members],
    ['Weakness', d.weakness], ['Aggressive', d.aggressive], ['Examine', d.examine]].filter(x => x[1]);
  view.innerHTML = `<div class="row" style="margin-bottom:10px"><a class="btn ghost" href="#drops">← Monsters</a></div>
  <div class="panel"><div class="row" style="gap:16px;align-items:flex-start">
    ${d.big ? fig(d.big, 'hero') : d.img ? `<img src="${esc(d.img)}" alt="" style="max-height:96px;max-width:96px">` : PH('☗', 96)}
    <div style="flex:1;min-width:220px"><h2>${esc(name)}</h2><div class="kv">${kv.map(([k, v]) => `<b>${k}</b><span>${esc(v)}</span>`).join('')}</div>
    ${d.rare_drop_table ? '<div class="note" style="margin-top:6px">Also has access to the rare drop table.</div>' : ''}</div></div></div>
  <div class="panel"><h2>Drops</h2>
    <div class="row"><input id="f" type="search" placeholder="Filter drops…" style="flex:1 1 180px">
    <select id="s">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div style="overflow-x:auto;margin-top:8px"><table><thead><tr><th data-k="name">Item</th><th data-k="qty" class="hide-sm">Qty</th><th data-k="likely">Rarity</th><th data-k="table" class="hide-sm">Table</th></tr></thead><tbody id="tb"></tbody></table></div>
    <div class="note" style="margin-top:6px">Colours: <span class="r0">always</span> · <span class="r1">common</span> · <span class="r2">uncommon</span> · <span class="r3">rare</span> · <span class="r4">very rare</span>. Tap an item to see every monster that drops it.</div>
  </div>
  <div class="panel"><h2>Where to find it &amp; how to get there</h2><div id="locs"></div></div>`;
  const tb = $('#tb');
  const draw = () => {
    let rows = d.drops.filter(r => !filt || norm(r[0]).includes(filt) || norm(r[5]).includes(filt));
    const pv = r => r[3] ?? (r[4] != null ? [1, 0.1, 0.02, 0.003, 0.0003, 0][r[4]] : -1);
    if (sort === 'likely') rows.sort((a, b) => pv(b) - pv(a));
    if (sort === 'rarest') rows.sort((a, b) => (pv(a) < 0 ? 9 : pv(a)) - (pv(b) < 0 ? 9 : pv(b)));
    if (sort === 'name') rows.sort((a, b) => a[0].localeCompare(b[0]));
    document.querySelectorAll('th').forEach(th => th.classList.toggle('sorted', th.dataset.k === sort || (sort === 'rarest' && th.dataset.k === 'likely')));
    let lastT = null;
    tb.innerHTML = rows.map(r => {
      const grp = sort === 'table' && r[5] !== lastT ? `<tr><td colspan="4" style="font-family:var(--head);color:var(--gold);padding-top:12px">${esc(r[5] || 'Drops')}</td></tr>` : '';
      lastT = r[5];
      const notes = [r[7] && 'Alt. rates: ' + r[7], r[6], r[8] && 'Version: ' + r[8]].filter(Boolean).join(' ');
      return grp + `<tr><td>${itemLink(r[0])}${notes ? `<div class="note">${esc(notes)}</div>` : ''}<div class="note" style="display:none" data-sm>${esc(r[1])}</div></td>
        <td class="hide-sm">${esc(r[1])}</td><td class="num">${rarityCell(r[2], r[3], r[4])}</td><td class="hide-sm note">${esc(r[5])}</td></tr>`;
    }).join('');
    if (matchMedia('(max-width:760px)').matches) tb.querySelectorAll('[data-sm]').forEach(e => { if (e.textContent && e.textContent !== '1') { e.style.display = ''; e.textContent = 'Qty ' + e.textContent; } });
  };
  $('#f').oninput = e => { filt = norm(e.target.value); draw(); };
  $('#s').onchange = e => { sort = localStorage.dsort = e.target.value; draw(); };
  document.querySelectorAll('th').forEach(th => th.onclick = () => {
    const k = th.dataset.k; sort = k === 'likely' ? (sort === 'likely' ? 'rarest' : 'likely') : k === 'qty' ? sort : k;
    $('#s').value = sort; localStorage.dsort = sort; draw(); });
  draw();
  $('#locs').innerHTML = (d.ml || []).length ? d.ml.map(mlBlock).join('') : d.locs.length ? d.locs.map(l => locBlock(l, travel)).join('') : '<div class="note">The wiki copy lists no spawn locations for this monster (it may be an instance, boss arena or event).</div>';
}
function travelBlock(title, travel, open) {
  const t = travel.locations[title]; if (!t) return '';
  const parts = [];
  const top = [t.pic, t.entrance && [...t.entrance.slice(0, 4), 'entrance'], t.map_pic && [...t.map_pic.slice(0, 4), 'map']].filter(Boolean);
  if (top.length) parts.push(gallery(top));
  if (t.summary) parts.push(`<div class="pre">${esc(t.summary)}</div>`);
  if (t.location) parts.push(`<div><b class="pill">Area</b> ${esc(t.location)}</div>`);
  if (t.map_coords) parts.push(`<div><b class="pill">Map point</b> ${coordStr(t.map_coords)} <span class="note">(the wiki's map marker for this place, usually the area or entrance)</span></div>`);
  if (t.nearest_lodestones) {
    const lp = t.nearest_lodestones.map(l => (travel.lodestones.find(x => x.name === l.name) || {}).pic).filter(Boolean).slice(0, 1);
    parts.push(`<div><b class="pill">Nearest lodestones</b> ${t.nearest_lodestones.map(l => `${esc(l.name)} (${l.tiles} tiles)`).join(', ')} <span class="note">straight-line, not a walking route</span>${gallery(lp, 'small')}</div>`);
  }
  if (t.teleport) parts.push(`<div><b class="pill">Teleports</b><div class="pre">${esc(t.teleport)}</div></div>`);
  (t.getting_there || []).forEach(g => parts.push(`<div><b class="pill">${esc(g.heading)}</b>${gallery(g.pics)}<div class="pre">${esc(g.text)}</div></div>`));
  return `<details ${open ? 'open' : ''}><summary>How to get to ${esc(title)}</summary><div style="display:grid;gap:8px;margin-top:6px">${parts.join('')}</div></details>`;
}
/* "Step 1 - Start here" (surface map with pin) -> overview -> "Step 2+ - Get inside" */
function startSteps(l) {
  if (!l || !(l.start_here || l.start_overview || (l.get_inside || []).length)) return '';
  let n = 1; const out = [];
  if (l.start_here || l.start_overview) {
    out.push(`<div class="sstep"><div class="sstep-h"><span class="snum">Step ${n++}</span> Start here${l.start_here && l.start_here.entrance_name ? ` — ${esc(l.start_here.entrance_name)}` : ''}</div>
      ${gallery([l.start_here && l.start_here.pic, l.start_overview].filter(Boolean))}
      ${l.start_here && l.start_here.coords ? `<div class="note">World map point: ${coordStr(l.start_here.coords)}</div>` : ''}</div>`);
  }
  (l.get_inside || []).forEach((g, i) => out.push(`<div class="sstep"><div class="sstep-h"><span class="snum">Step ${n++}</span> ${i === 0 ? 'Get inside' : 'Then'}</div>${gallery([g.pic].filter(Boolean))}${g.text ? `<div class="pre">${esc(g.text)}</div>` : ''}</div>`));
  return `<div class="ssteps">${out.join('')}</div>`;
}
function mlBlock(l) {
  const P = l.place || {};
  const parts = [];
  if (l.requirements) parts.push(`<div class="note">Requirements: ${esc(l.requirements)}</div>`);
  if (l.text) parts.push(`<div class="pre">${esc(l.text)}</div>`);
  if (P.summary) parts.push(`<div class="pre">${esc(P.summary)}</div>`);
  if (P.location && P.location !== l.name) parts.push(`<div><b class="pill">Area</b> ${esc(P.location)}</div>`);
  if ((l.teleports || []).length) parts.push(`<div><b class="pill">Nearest teleports</b>${gallery(l.teleports.map(t => t.pic).filter(Boolean), 'small')}
    <div class="note">${l.teleports.map(t => `${t.icon ? `<img class="ico" src="${esc(t.icon)}" alt="" style="width:20px;height:20px">` : ''}${esc(t.name)}${t.code ? ' (' + esc(t.code) + ')' : ''}${t.tiles ? ` · ${t.tiles} tiles` : ''}${t.kind ? ` <span class="tag">${esc(t.kind)}</span>` : ''}`).join('<br>')}</div></div>`);
  if (P.teleport) parts.push(`<div><b class="pill">Teleports</b><div class="pre">${esc(P.teleport)}</div></div>`);
  (P.getting_there || []).forEach(g => parts.push(`<div><b class="pill">${esc(g.heading || 'Getting there')}</b>${gallery(g.pics)}<div class="pre">${esc(g.text)}</div></div>`));
  return `<div style="padding:10px 0;border-bottom:1px solid #ffffff12">
    <div class="row"><b style="font-family:var(--head);color:var(--gold2)">${esc(l.name || 'Unknown location')}</b>
    ${l.levels ? `<span class="tag">Lvl ${esc(l.levels)}</span>` : ''}${l.members ? '<span class="tag">Members</span>' : ''}${l.spawns ? `<span class="tag">${l.spawns} spawns</span>` : ''}</div>
    ${startSteps(l)}${gallery(l.pics)}
    <div style="display:grid;gap:8px;margin-top:4px">${parts.join('')}</div></div>`;
}
function locBlock(l, travel) {
  return `<div style="padding:8px 0;border-bottom:1px solid #ffffff12">
    <div class="row"><b style="font-family:var(--head);color:var(--gold2)">${esc(l.loc || 'Unknown location')}</b>
    ${l.levels ? `<span class="tag">Lvl ${esc(l.levels)}</span>` : ''}${l.members ? '<span class="tag">Members</span>' : ''}${l.spawns ? `<span class="tag">${l.spawns} spawns</span>` : ''}</div>
    ${l.coords ? `<div class="note">Spawn coordinates: ${coordStr(l.coords, l.plane)}${l.mapID && l.mapID !== '28' ? ` · separate map area (map ${esc(l.mapID)})` : ''}</div>` : ''}
    ${l.requirements ? `<div class="note">Requirements: ${esc(l.requirements)}</div>` : ''}
    ${(l.links || []).map((x, i) => travelBlock(x, travel, i === 0)).join('')}
  </div>`;
}

/* ---------- items: search + rarity + GE prices, "My stats" gear finder, best sets (all numbers from the wiki copy) ---------- */
let GICONS = {};
const WIKI = p => 'https://runescape.wiki/w/' + encodeURIComponent(String(p).replace(/ /g, '_'));
const gp = n => n == null ? '' : Math.round(n).toLocaleString() + ' gp';
const SLOT_LABEL = {head: 'Head', neck: 'Neck', cape: 'Cape', body: 'Body', legs: 'Legs', hands: 'Hands', feet: 'Feet', ring: 'Ring', ammo: 'Ammo', pocket: 'Pocket',
  aura: 'Aura', sigil: 'Sigil', main: 'Main-hand', off: 'Off-hand (shield)', offw: 'Off-hand weapon', '2h': 'Two-handed'};
const SLOT_ORDER = ['2h', 'main', 'offw', 'off', 'head', 'body', 'legs', 'hands', 'feet', 'neck', 'cape', 'ring', 'ammo', 'pocket', 'aura', 'sigil'];
const STYLES = {melee: 'Melee', ranged: 'Ranged', magic: 'Magic', necromancy: 'Necromancy'};
const STYLE_BONUS = {melee: 'strength', ranged: 'ranged', magic: 'magic', necromancy: 'necromancy'};
const MAIN_SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged', 'Magic', 'Necromancy', 'Constitution', 'Prayer'];
const WEAPON = new Set(['main', '2h', 'offw', 'ammo']);
/* wiki Infobox Item 'restriction' values for gear that only works inside a minigame or quest, or that is gone from the game */
const RESTRICTED = new Set(['minigame', 'quest', 'removed', 'beta']);
const RST_LABEL = {minigame: 'minigame only', quest: 'quest only', removed: 'removed from game', beta: 'beta only', dungeoneering: 'Daemonheim only', limited: 'limited time', th: 'Treasure Hunter', cache: 'Guthixian Cache', special: 'special'};
let IDATA = null, IICONS = {};
/* data/iall.json = every item page of the RS3 wiki copy (Infobox Item, every version; Infobox Skin cosmetic overrides):
   rows [name, icon, GE price, flag bits, wiki page if different]; full infobox details in data/i/<row/ch>.json, loaded when an item is opened */
async function itemData() {
  if (IDATA) return IDATA;
  const [items, pr, gd, ia] = await Promise.all([get('data/items.json'), get('data/prices.json'), get('data/gear.json'), get('data/iall.json').catch(() => ({rows: [], fl: {}, ch: 250}))]);
  const gear = {}; gd.gear.forEach(g => { gear[g.n] = g; });
  const best = {};
  for (const [n, src] of Object.entries(items)) {
    let r = null, p = null;
    for (const s of src) { if (s[4] != null && s[4] <= 4 && (r == null || s[4] < r)) r = s[4]; if (s[3] != null && (p == null || s[3] > p)) p = s[3]; }
    best[n] = [r, p];
  }
  const row = {}, byPage = {};
  ia.rows.forEach((r, i) => { row[r[0]] = i; if (r[1]) IICONS[r[0]] = r[1] + '.webp'; const pg = r[4] || r[0]; if (byPage[pg] == null || pg === r[0]) byPage[pg] = i; });
  const names = [...new Set([...ia.rows.map(r => r[0]), ...Object.keys(items), ...Object.keys(gear), ...Object.keys(pr.prices)])];
  const tierN = {}; names.forEach(n => { tierN[n] = norm(n); });
  return IDATA = {items, pr, gd, gear, best, names, tierN, ia, row, byPage, FL: ia.fl || {}, alias: {}};
}
const rowOf = (D, n) => { const i = D.row[n] ?? D.byPage[n]; return i == null ? null : D.ia.rows[i]; };
const hasF = (D, n, k) => { const r = rowOf(D, n); return !!(r && D.FL[k] && (r[3] & D.FL[k])); };
const dropsOf = (D, n) => D.items[n] || (() => { const r = rowOf(D, n); return r && r[4] ? D.items[r[4]] : null; })();
function priceOf(D, n) { const v = D.pr.prices[n]; if (v != null) return v; const g = D.gear[n]; if (g && g.ge != null) return g.ge; const r = D.row[n] != null ? D.ia.rows[D.row[n]] : null; return r && r[2] != null ? r[2] : null; }
function tradeOf(D, n) {
  if (priceOf(D, n) != null) return true;
  const t = D.pr.tradeable[n]; if (t != null) return !!t;
  const g = D.gear[n]; if (g && g.trade != null) return g.trade;
  const r = D.row[n] != null ? D.ia.rows[D.row[n]] : null;
  return r ? (r[3] & D.FL.trade ? true : r[3] & D.FL.untr ? false : null) : null;
}
function geDateET(D) {
  const d = new Date(D.pr.ts * 1000);
  return d.toLocaleString('en-US', {timeZone: 'America/New_York', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'}) + ' ET';
}
function priceTag(D, n) {
  const v = priceOf(D, n), t = tradeOf(D, n);
  if (v != null) return `<span class="gp">${gp(v)}</span>`;
  if (t === false) return '<span class="untr">Untradeable</span>';
  return '<span class="note">no GE price</span>';
}
function rarTag(r) { return r == null ? '' : `<span class="rtag r${r}">${RANK[r]}</span>`; }
function subnav(on) {
  const b = (h, t, k) => `<a class="btn sub ${on === k ? 'on' : ''}" href="${h}">${t}</a>`;
  return `<div class="row subnav">${b('#items', 'Search · rarity · prices', 'search')}${b('#items/~stats', 'My stats → gear', 'stats')}${b('#items/~sets', 'Best sets (wiki)', 'sets')}${b('#items/~obtain', 'Obtainable · worth money · cosmetics', 'obtain')}</div>`;
}

/* ----- stats storage ----- */
/* stats are saved per device; v2 replaces older saved values once with the owner's levels (read from their in-game skills screenshot) */
const STATS_KEY = 'mystats_v2';
const DEFAULT_STATS = {Attack: 75, Constitution: 78, Mining: 58, Strength: 78, Agility: 38, Smithing: 54, Defence: 78, Herblore: 28, Fishing: 61, Ranged: 64, Thieving: 48, Cooking: 90,
  Prayer: 51, Crafting: 55, Firemaking: 42, Magic: 99, Fletching: 101, Woodcutting: 71, Runecrafting: 29, Slayer: 47, Farming: 11, Construction: 44, Hunter: 31, Summoning: 23,
  Dungeoneering: 43, Divination: 1, Invention: 1, Archaeology: 1, Necromancy: 2};
/* validate saved levels: integer, 1..skill max (wiki). Skills missing from storage fall back to the owner's levels. Returns null if nothing usable. */
function cleanStats(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {...DEFAULT_STATS}; let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (!/^[A-Za-z' ]{2,24}$/.test(k)) continue;
    const x = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d{1,4}\s*$/.test(v) ? +v : NaN;
    if (!Number.isFinite(x)) continue;
    out[k] = Math.max(1, Math.min(skMax(k), Math.floor(x))); n++;
  }
  return n ? out : null;
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
let STATS_SAVED = false;   /* true once the owner's own saved levels were found on this device */
function loadStats() {
  for (const key of [STATS_KEY, STATS_KEY + '_bak']) {
    const raw = lsGet(key); if (!raw) continue;
    let o = null; try { o = JSON.parse(raw); } catch (e) {}
    const c = cleanStats(o && o.levels ? o.levels : o);
    if (c) { STATS_SAVED = true; return c; }
    try { localStorage.setItem(key + '_corrupt', raw.slice(0, 4000)); } catch (e) {}   /* keep the bad value for inspection, never crash */
  }
  try { localStorage.removeItem('mystats'); } catch (e) {}
  return {...DEFAULT_STATS};
}
/* saving: debounced after each change, and flushed right away on blur / tab hidden / page hide / close so nothing typed is lost */
let _stSave = null, _stDirty = null, _stBind = false;
function statsFlush() {
  clearTimeout(_stSave); _stSave = null;
  if (!_stDirty) return true;
  const s = _stDirty; _stDirty = null;
  const j = JSON.stringify({v: 2, t: Date.now(), levels: s});
  try { localStorage.setItem(STATS_KEY, j); localStorage.setItem(STATS_KEY + '_bak', j); STATS_SAVED = true; statsBadge(true); return true; }
  catch (e) { statsBadge(false); return false; }
}
function saveStats(s) {
  _stDirty = {...s}; statsBadge(null);
  clearTimeout(_stSave); _stSave = setTimeout(statsFlush, 250);
  if (!_stBind) {
    _stBind = true;
    const f = () => { statsFlush(); };
    addEventListener('pagehide', f); addEventListener('beforeunload', f); addEventListener('blur', f);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') f(); });
    document.addEventListener('focusout', f);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  }
}
let _stBadgeT = 0;
function statsBadge(ok) {
  const b = document.getElementById('stsaved'); if (!b) return;
  clearTimeout(_stBadgeT);
  if (ok === null) { b.textContent = 'Saving…'; b.className = 'stsaved'; return; }
  if (ok) { b.textContent = 'Saved ✓'; b.className = 'stsaved on'; _stBadgeT = setTimeout(() => { b.className = 'stsaved on idle'; }, 1800); }
  else { b.textContent = 'Not saved (browser storage is blocked)'; b.className = 'stsaved on bad'; }
}
/* gear style + PvM/PvP choice are remembered across visits too */
function loadPrefs() { try { const o = JSON.parse(lsGet('gearprefs_v1') || '{}'); return {style: STYLES[o.style] ? o.style : null, mode: o.mode === 'pvp' || o.mode === 'pvm' ? o.mode : null}; } catch (e) { return {style: null, mode: null}; } }
function savePrefs(o) { try { localStorage.setItem('gearprefs_v1', JSON.stringify({style: o.style, mode: o.mode})); } catch (e) {} }
let SKICONS = {}, SKORDER = [], SKMAX = {};
const skMax = k => SKMAX[k] || 120;
/* wiki Combat level page: (13/10 × max(Att+Str, 2 Mag, 2 Rang, 2 Necr) + Def + Const + ⌊Pray/2⌋ + ⌊Summ/2⌋) / 4, rounded down */
function combatLevel(S) { return Math.floor((1.3 * Math.max(lv(S, 'Attack') + lv(S, 'Strength'), 2 * lv(S, 'Magic'), 2 * lv(S, 'Ranged'), 2 * lv(S, 'Necromancy')) + lv(S, 'Defence') + lv(S, 'Constitution') + Math.floor(lv(S, 'Prayer') / 2) + Math.floor(lv(S, 'Summoning') / 2)) / 4); }
function totalLevel(S) { return SKORDER.reduce((a, k) => a + lv(S, k), 0); }
const lv = (S, k) => +S[k] || 1;
function reqMet(g, S) { for (const [k, v] of Object.entries(g.req || {})) if (lv(S, k) < v) return false; return true; }
function reqText(g) {
  const r = Object.entries(g.req || {}).map(([k, v]) => `${v} ${k}`);
  if (g.req_other) r.push(g.req_other);
  return r.join(', ') || 'None listed';
}
function styleOk(g, st) { return g.cls === st || ((g.cls === 'hybrid' || g.cls === 'all' || g.cls === 'none') && !WEAPON.has(g.slot)); }
function keyStat(g, st) {
  if (WEAPON.has(g.slot) && g.damage != null) return `dmg ${g.damage}${g.accuracy != null ? ` · acc ${g.accuracy}` : ''}`;
  const b = g[STYLE_BONUS[st]]; const parts = [];
  if (g.armour != null) parts.push(`armour ${g.armour}`);
  if (b != null) parts.push(`+${b} ${STYLE_BONUS[st]}`);
  if (g.life != null) parts.push(`life ${g.life}`);
  if (g.prayer != null) parts.push(`prayer ${g.prayer}`);
  return parts.join(' · ');
}
const ruleSort = st => (a, b) => (b.tier ?? -1) - (a.tier ?? -1) || ((b.type || '').includes('power') - (a.type || '').includes('power'))
  || ((WEAPON.has(a.slot) ? (b.damage ?? 0) - (a.damage ?? 0) : (b[STYLE_BONUS[st]] ?? 0) - (a[STYLE_BONUS[st]] ?? 0))) || (b.armour ?? 0) - (a.armour ?? 0) || a.n.localeCompare(b.n);
function usable(D, S, st, opt) {
  return D.gd.gear.filter(g => styleOk(g, st) && reqMet(g, S) && (!opt.hideDung || !g.dung) && (!opt.hideRec || !g.recolour) && (!opt.hideRst || !RESTRICTED.has(g.rst)) && (!opt.trade || priceOf(D, g.n) != null));
}
/* PvP damage reduction, from the wiki Armour page (Damage reduction): head/body/legs only, by required level, slot and armour type */
const PVP_K = {head: 0.0375, body: 0.06, legs: 0.0525};
function pvpRed(g) {
  const k = PVP_K[g.slot]; const L = (g.req || {}).Defence; if (!k || !L) return null;
  const t = g.type || '';
  if (t === 'tank' || t === 'pvp') return k * L;
  if (t.includes('power') || t.includes('hybrid') || g.cls === 'hybrid' || g.cls === 'all') return k * L / 2;
  return null;
}
/* PvM: the wiki's Recommended equipment for PvM/<style> tables */
function recPicks(D, S, st, opt) {
  const rec = D.gd.recommended[st]; if (!rec) return {};
  const by = {};
  rec.rows.forEach(r => {
    if (/target specific|tank/i.test(r.tab)) return;
    r.items.forEach(n => {
      const g = D.gear[n]; if (!g || !g.slot || !reqMet(g, S) || g.req_other) return;
      if (opt.hideDung && g.dung) return;
      if (RESTRICTED.has(g.rst)) return;
      const key = [r.tier ?? g.tier ?? -1, r.style_bonus ?? g[STYLE_BONUS[st]] ?? 0, r.order];
      const cur = by[g.slot];
      if (!cur || key[0] > cur.key[0] || (key[0] === cur.key[0] && (key[1] > cur.key[1] || (key[1] === cur.key[1] && key[2] > cur.key[2])))) by[g.slot] = {g, r, key};
    });
  });
  return by;
}
function bestSet(D, S, st, mode, opt) {
  const pool = usable(D, S, st, {...opt, hideRec: true, hideRst: true}).filter(g => !g.req_other && g.slot);
  const rs = ruleSort(st);
  /* stat rule only uses items whose wiki infobox lists a skill requirement: items listed as 'requirements = None' are often quest, minigame
     or reward items (Thok's sword, Deathmatch/Crucible variants) whose tier would otherwise top every slot at level 1 */
  const hasReq = g => Object.keys(g.req || {}).length > 0;
  const rule = slot => pool.filter(g => g.slot === slot && hasReq(g)).sort(rs)[0];
  const rec = recPicks(D, S, st, opt);
  const out = [];
  const slots = ['2h', 'main', 'off', 'offw', 'head', 'body', 'legs', 'hands', 'feet', 'neck', 'cape', 'ring', 'ammo', 'pocket'];
  for (const slot of slots) {
    let pick = null, why = '', src = '';
    if (mode === 'pvp' && PVP_K[slot]) {
      const c = pool.filter(g => g.slot === slot && pvpRed(g) != null).sort((a, b) => pvpRed(b) - pvpRed(a) || (b.tier ?? 0) - (a.tier ?? 0) || (b[STYLE_BONUS[st]] ?? 0) - (a[STYLE_BONUS[st]] ?? 0));
      if (c[0]) { pick = c[0]; why = `Highest PvP damage reduction you can wear: ${pvpRed(pick).toFixed(2)}% (${pick.type} armour, Defence ${pick.req.Defence})`; src = 'Armour#Damage reduction'; }
    }
    if (!pick && rec[slot]) {
      pick = rec[slot].g; const r = rec[slot].r;
      why = `Wiki pick: highest ${r.tier != null ? 'tier' : 'entry'} you can wear in “${r.tab}”${r.tier != null ? ` (tier ${r.tier}${r.tier_note ? '*' : ''})` : ''}`;
      src = D.gd.recommended[st].page;
      if (mode === 'pvp') why += '. The wiki gives no PvP-specific pick for this slot, so this is the PvM pick';
    }
    if (!pick) {
      pick = rule(slot);
      if (pick) why = mode === 'pvp' && (slot === 'hands' || slot === 'feet' || slot === 'off') ? 'Stat rule (no PvP pick on the wiki; gloves, boots and shields do not reduce damage in PvP)' : 'Stat rule, not a wiki pick: highest tier, then power type, then damage/style bonus, then armour';
    }
    if (pick && !hasReq(pick)) why += '. The wiki lists no level requirement to wear it, but it has to be earned first (quest, minigame or reward); see its wiki page';
    if (pick) out.push({slot, g: pick, why, src, note: rec[slot] && pick === rec[slot].g ? rec[slot].r.note : ''});
  }
  return out;
}
function statInputs(S, extra) {
  const order = SKORDER.length ? SKORDER : [...MAIN_SKILLS, ...extra];
  const f = k => `<label class="sk" title="${k} (max ${skMax(k)})">${SKICONS[k] ? `<img src="${esc(SKICONS[k])}" alt="" width="27" height="27">` : `<span>${k.slice(0, 3)}</span>`}<input type="number" inputmode="numeric" min="1" max="${skMax(k)}" aria-label="${k} level" title="${k}" data-sk="${k}" value="${lv(S, k)}"></label>`;
  return `<div class="skgrid">${order.map(f).join('')}</div>
    <div class="sktot"><span title="Total level">Total level <b id="tot">${totalLevel(S)}</b></span><span title="Combat level (wiki formula)">Combat <b id="cmb">${combatLevel(S)}</b></span></div>
    <div class="row" style="margin-top:8px"><button class="btn ghost" data-all="1">All 1</button><button class="btn ghost" data-all="max">All max</button><button class="btn ghost" data-all="mine" title="Put back the levels from your skills screenshot">Reset to my defaults</button><span id="stsaved" class="stsaved on idle" aria-live="polite">Saved ✓</span>
    <span class="note">Saved automatically on this device only. Max level per skill is from each skill's RS3 wiki page.</span></div>`;
}
function gearRow(D, g, st, extra = '') {
  return `<tr><td><a class="item" href="#items/${encodeURIComponent(g.n)}">${icon(g.n)}<span>${esc(g.n)}</span></a>${g.dung ? ' <span class="tag">Daemonheim</span>' : ''}${g.rst && g.rst !== 'dungeoneering' ? ` <span class="tag">${esc(RST_LABEL[g.rst] || g.rst)}</span>` : ''}${g.type ? ` <span class="tag">${esc(g.type)}</span>` : ''}</td>
    <td>${esc(SLOT_LABEL[g.slot] || g.slot || '')}</td><td class="num">${g.tier ?? esc(g.tier_text || '')}</td><td>${esc(keyStat(g, st))}</td><td>${esc(reqText(g))}</td><td class="num">${priceTag(D, g.n)}</td>${extra}</tr>`;
}
async function statsView() {
  const D = await itemData();
  const S = loadStats();
  const pf = loadPrefs();
  const opt = Object.assign({style: 'melee', mode: 'pvm', slot: '', sort: 'tier', hideDung: true, hideRec: true, hideRst: true, trade: false, more: 0}, JSON.parse(sessionStorage.gearopt || '{}'));
  if (pf.style) opt.style = pf.style; if (pf.mode) opt.mode = pf.mode;
  const extraSk = [...new Set(D.gd.gear.flatMap(g => Object.keys(g.req || {})))].filter(k => !MAIN_SKILLS.includes(k)).sort();
  view.innerHTML = `${subnav('stats')}<div class="panel"><h2>Your levels</h2>${statInputs(S, extraSk)}</div>
    <div class="panel"><h2>Best set for your stats</h2><div class="chips" id="sty">${Object.entries(STYLES).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div>
    <div class="chips" id="mode"><button data-v="pvm">PvM</button><button data-v="pvp">PvP</button></div><div id="best"></div></div>
    <div class="panel"><h2>All gear you can wear</h2><div class="row">
      <select id="slot"><option value="">Every slot</option>${SLOT_ORDER.map(s => `<option value="${s}">${SLOT_LABEL[s]}</option>`).join('')}</select>
      <select id="sort"><option value="tier">Tier, high → low</option><option value="dmg">Damage / style bonus</option><option value="arm">Armour</option><option value="price">GE price, high → low</option><option value="pricel">GE price, low → high</option><option value="name">Name A–Z</option></select></div>
      <div class="row" style="margin-top:6px"><label class="chk"><input type="checkbox" id="hd"> Hide Daemonheim-only gear</label><label class="chk"><input type="checkbox" id="hs"> Hide minigame/quest-only and removed gear</label><label class="chk"><input type="checkbox" id="hr"> Hide recolours</label><label class="chk"><input type="checkbox" id="tr"> On the GE only</label></div>
      <div id="all"></div></div>`;
  const setChips = () => { document.querySelectorAll('#sty button').forEach(b => b.classList.toggle('on', b.dataset.v === opt.style)); document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.v === opt.mode)); };
  $('#slot').value = opt.slot; $('#sort').value = opt.sort; $('#hd').checked = opt.hideDung; $('#hr').checked = opt.hideRec; $('#hs').checked = opt.hideRst; $('#tr').checked = opt.trade;
  const draw = () => {
    sessionStorage.gearopt = JSON.stringify({...opt, more: 0}); savePrefs(opt); setChips();
    const st = opt.style, bs = bestSet(D, S, st, opt.mode, opt);
    const recPage = D.gd.recommended[st] && D.gd.recommended[st].page;
    const q = D.gd.pvp_quotes || [];
    const total = bs.reduce((a, x) => a + (priceOf(D, x.g.n) || 0), 0);
    $('#best').innerHTML = `<div class="note" style="margin:8px 0">${opt.mode === 'pvm'
      ? `Picks come from the wiki's <a href="${WIKI(recPage)}" target="_blank" rel="noopener">${esc(recPage)}</a> tables: for each slot, the highest-tier entry whose requirements you meet. A slot the wiki table has nothing for at your levels falls back to a stat rule (marked). Two-handed and main-hand + off-hand are shown side by side; use one or the other.`
      : `Head, body and legs: the piece with the most PvP damage reduction you can wear, worked out with the wiki's Armour page formula. Other slots: the wiki has no PvP-specific picks, so the PvM pick or the stat rule is shown, and it says so.`}</div>
      <div style="overflow-x:auto"><table><thead><tr><th>Slot</th><th>Item</th><th>Tier</th><th>Stats (wiki)</th><th>Price</th><th>Why</th></tr></thead><tbody>
      ${bs.map(x => `<tr><td>${esc(SLOT_LABEL[x.slot])}</td><td><a class="item" href="#items/${encodeURIComponent(x.g.n)}">${icon(x.g.n)}<span>${esc(x.g.n)}</span></a></td><td class="num">${x.g.tier ?? ''}</td>
        <td>${esc(keyStat(x.g, st))}</td><td class="num">${priceTag(D, x.g.n)}</td><td class="why">${esc(x.why)}${x.src ? ` <a class="note" href="${WIKI(x.src)}" target="_blank" rel="noopener">[wiki]</a>` : ''}${x.note ? `<div class="note">${esc(x.note).replace(/\n/g, '<br>')}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="note">Nothing to show.</td></tr>'}
      </tbody></table></div><div class="note" style="margin-top:6px">Total GE value of the listed pieces: ${gp(total)} (untradeables count as 0; both weapon options are included). Prices as of ${esc(D.pr.date)} (${esc(geDateET(D))}).</div>
      ${opt.mode === 'pvp' ? `<div class="quotes">${q.filter(x => /PvP/.test(x.text) || x.page === 'Player versus player').map(x => `<blockquote>“${esc(x.text)}” <a href="${WIKI(x.page)}" target="_blank" rel="noopener">— ${esc(x.page)}</a></blockquote>`).join('')}
        <div class="note">PvP-type armour sets on the wiki's Armour page: ${D.gd.armour_sets.filter(s => s.type === 'PvP' && s.styles.includes(STYLES[st])).map(s => `<a href="${WIKI(s.set)}" target="_blank" rel="noopener">${esc(s.set)}</a> (level ${s.level})${lv(S, 'Defence') >= s.level ? ' ✓' : ''}`).join(', ') || 'none for this style'}. ✓ = your Defence is at least that level.</div></div>`
      : `<div class="quotes">${q.filter(x => x.page === 'Recommended equipment for PvM').map(x => `<blockquote>“${esc(x.text)}” <a href="${WIKI(x.page)}" target="_blank" rel="noopener">— ${esc(x.page)}</a></blockquote>`).join('')}</div>`}`;
    let list = usable(D, S, st, opt).filter(g => !opt.slot || g.slot === opt.slot);
    const sb = STYLE_BONUS[st];
    const sorts = {tier: ruleSort(st), dmg: (a, b) => ((b.damage ?? b[sb] ?? -1) - (a.damage ?? a[sb] ?? -1)), arm: (a, b) => (b.armour ?? -1) - (a.armour ?? -1),
      price: (a, b) => (priceOf(D, b.n) ?? -1) - (priceOf(D, a.n) ?? -1), pricel: (a, b) => (priceOf(D, a.n) ?? 1e15) - (priceOf(D, b.n) ?? 1e15), name: (a, b) => a.n.localeCompare(b.n)};
    list.sort(sorts[opt.sort] || sorts.tier);
    const lim = 200 * (1 + opt.more);
    $('#all').innerHTML = `<div class="note" style="margin:6px 0">${list.length.toLocaleString()} ${STYLES[st]} items (weapons of that style plus armour/jewellery any style can wear) meet your levels. Requirements are the skill levels in each item's wiki infobox; anything else it needs (quests etc.) is listed too.</div>
      <div style="overflow-x:auto"><table><thead><tr><th>Item</th><th>Slot</th><th>Tier</th><th>Stats (wiki)</th><th>Requirements</th><th>Price</th></tr></thead><tbody>
      ${list.slice(0, lim).map(g => gearRow(D, g, st)).join('')}</tbody></table></div>${list.length > lim ? `<div class="row" style="margin-top:8px"><button class="btn ghost" id="more">Show more (${(list.length - lim).toLocaleString()} left)</button></div>` : ''}`;
    const m = $('#more'); if (m) m.onclick = () => { opt.more++; drawList(); };
  };
  const drawList = () => { const y = window.scrollY; draw(); window.scrollTo(0, y); };
  document.querySelectorAll('#sty button').forEach(b => b.onclick = () => { opt.style = b.dataset.v; opt.more = 0; draw(); });
  document.querySelectorAll('#mode button').forEach(b => b.onclick = () => { opt.mode = b.dataset.v; draw(); });
  $('#slot').onchange = e => { opt.slot = e.target.value; opt.more = 0; draw(); };
  $('#sort').onchange = e => { opt.sort = e.target.value; draw(); };
  $('#hd').onchange = e => { opt.hideDung = e.target.checked; draw(); };
  $('#hr').onchange = e => { opt.hideRec = e.target.checked; draw(); };
  $('#hs').onchange = e => { opt.hideRst = e.target.checked; draw(); };
  $('#tr').onchange = e => { opt.trade = e.target.checked; draw(); };
  const totals = () => { $('#tot').textContent = totalLevel(S); $('#cmb').textContent = combatLevel(S); };
  view.querySelectorAll('input[data-sk]').forEach(i => i.oninput = () => { const k = i.dataset.sk, v = Math.max(1, Math.min(skMax(k), parseInt(i.value, 10) || 1)); S[k] = v; saveStats(S); totals(); clearTimeout(i._t); i._t = setTimeout(draw, 250); });
  view.querySelectorAll('input[data-sk]').forEach(i => i.onchange = () => { const k = i.dataset.sk; if (S[k] != null) i.value = S[k]; statsFlush(); });
  { const b = $('#stsaved'); if (b) b.textContent = STATS_SAVED ? 'Saved ✓' : 'Auto-save on'; }
  view.querySelectorAll('button[data-all]').forEach(b => b.onclick = () => { const a = b.dataset.all; if (a === 'mine' && !confirm('Put all your levels back to your defaults (from your skills screenshot)? This replaces the levels saved on this device.')) return; view.querySelectorAll('input[data-sk]').forEach(i => { const k = i.dataset.sk, v = a === 'max' ? skMax(k) : a === 'mine' ? (DEFAULT_STATS[k] || 1) : +a; i.value = v; S[k] = v; }); saveStats(S); statsFlush(); totals(); draw(); });
  draw();
}
async function setsView() {
  const D = await itemData(); const S = loadStats();
  const opt = Object.assign({style: 'melee', type: ''}, JSON.parse(sessionStorage.setopt || '{}')); { const pf = loadPrefs(); if (pf.style) opt.style = pf.style; }
  view.innerHTML = `${subnav('sets')}<div class="panel"><h2>Best sets by style and tier</h2>
    <div class="chips" id="sty">${Object.entries(STYLES).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div><div id="out"></div></div>`;
  const draw = () => {
    sessionStorage.setopt = JSON.stringify(opt); { const pf = loadPrefs(); savePrefs({style: opt.style, mode: pf.mode || 'pvm'}); }
    document.querySelectorAll('#sty button').forEach(b => b.classList.toggle('on', b.dataset.v === opt.style));
    const rec = D.gd.recommended[opt.style];
    const tabs = {}; (rec ? rec.rows : []).forEach(r => { (tabs[r.sec + ' · ' + r.tab] ??= []).push(r); });
    const ok = n => { const g = D.gear[n]; return g ? reqMet(g, S) : null; };
    const types = ['Power', 'PvP', 'Tank', 'Hybrid', 'All'];
    const sets = D.gd.armour_sets.filter(s => s.styles.includes(STYLES[opt.style]) && (!opt.type || s.type === opt.type)).sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
    $('#out').innerHTML = `<h3>Wiki recommended PvM equipment</h3><div class="note">From <a href="${WIKI(rec.page)}" target="_blank" rel="noopener">${esc(rec.page)}</a>, in the wiki's order (lowest tier first). ✓ = you meet the item's requirements with your saved levels; ✗ = you don't yet; ? = the item page has no stats in the copy.</div>
      ${Object.entries(tabs).map(([t, rows]) => `<details ${/Weapons|Armour/.test(t) ? 'open' : ''}><summary>${esc(t)} <span class="note">(${rows.length})</span></summary><div style="overflow-x:auto"><table><thead><tr><th>Tier</th><th>Items</th><th>Price</th><th>Notes (wiki)</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td class="num">${r.tier ?? (r.style_bonus != null ? `bonus ${r.style_bonus}` : '')}${r.tier_note ? '*' : ''}</td>
          <td>${r.items.map(n => { const o = ok(n); return `<div><a class="item" href="#items/${encodeURIComponent(n)}">${icon(n)}<span>${esc(n)}</span></a> ${o == null ? '<span class="note">?</span>' : o ? '<span class="ok">✓</span>' : '<span class="no">✗</span>'}</div>`; }).join('')}</td>
          <td class="num">${r.items.map(n => `<div>${priceTag(D, n)}</div>`).join('')}</td><td class="note">${esc(r.note).replace(/\n/g, '<br>')}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}
      <h3 style="margin-top:14px">Armour sets by type (wiki Armour page)</h3><div class="chips" id="typ"><button data-v="">All types</button>${types.map(t => `<button data-v="${t}">${t}</button>`).join('')}</div>
      <div class="note" style="margin:6px 0">${esc((D.gd.pvp_quotes.find(x => /^In general players should choose/.test(x.text)) || {}).text || '')}</div>
      <div style="overflow-x:auto"><table><thead><tr><th>Set</th><th>Level</th><th>Type</th><th>Styles</th><th>You</th></tr></thead><tbody>
      ${sets.map(s => `<tr><td><a href="${WIKI(s.set)}" target="_blank" rel="noopener">${esc(s.set)}</a>${s.note ? ` <span class="note">${esc(s.note)}</span>` : ''}</td><td class="num">${s.level ?? ''}</td><td>${esc(s.type)}</td><td>${esc(s.styles.join(', '))}</td>
        <td>${s.level == null ? '' : lv(S, 'Defence') >= s.level ? '<span class="ok">✓</span>' : '<span class="no">✗</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="note">“You” compares the set's level with your saved Defence level.</div>`;
    document.querySelectorAll('#typ button').forEach(b => { b.classList.toggle('on', b.dataset.v === opt.type); b.onclick = () => { opt.type = b.dataset.v; draw(); }; });
  };
  document.querySelectorAll('#sty button').forEach(b => b.onclick = () => { opt.style = b.dataset.v; draw(); });
  draw();
}
function statTable(g) {
  const F = [['cls', 'Class'], ['slot', 'Slot'], ['tier', 'Tier'], ['type', 'Type'], ['damage', 'Damage'], ['accuracy', 'Accuracy'], ['style', 'Attack style'], ['speed', 'Speed'], ['attack_range', 'Range'],
    ['armour', 'Armour'], ['life', 'Life points'], ['prayer', 'Prayer'], ['strength', 'Strength'], ['ranged', 'Ranged'], ['magic', 'Magic'], ['necromancy', 'Necromancy'],
    ['damagetier', 'Damage tier'], ['accuracytier', 'Accuracy tier'], ['armourtier', 'Armour tier'], ['armourdamagetier', 'Armour damage tier'], ['pvmreduction', 'PvM reduction %'], ['pvpreduction', 'PvP reduction %'], ['degrades', 'Degrades'], ['release', 'Released']];
  return `<div class="kv">${F.filter(([k]) => g[k] != null && g[k] !== '').map(([k, l]) => `<b>${l}</b><span>${esc(k === 'slot' ? SLOT_LABEL[g.slot] || g.slot : g[k])}</span>`).join('')}<b>Requirements</b><span>${esc(reqText(g))}</span></div>
    ${g.v ? `<div class="note">Stats for the “${esc(g.v)}” version.</div>` : ''}${g.dung ? '<div class="note">Dungeoneering item (Daemonheim only).</div>' : ''}${g.rst && g.rst !== 'dungeoneering' ? `<div class="note">Wiki restriction: ${esc(RST_LABEL[g.rst] || g.rst)}.</div>` : ''}`;
}
const RST_ITEM = {limited: 'Limited time', microtransaction: 'Treasure Hunter / microtransaction', removed: 'Removed from the game', quest: 'Quest', minigame: 'Minigame', dungeoneering: 'Dungeoneering (Daemonheim)', cache: 'Guthixian Cache'};
const yesno = v => v === 1 ? 'Yes' : v === 0 ? 'No' : v === 'restricted' ? 'Restricted' : '';
function flagTags(D, n) {
  const r = rowOf(D, n); if (!r) return '';
  const F = D.FL, f = r[3], t = [];
  if (f & F.override) t.push('Cosmetic override');
  if (f & F.holiday) t.push('Holiday item');
  if (f & F.disc) t.push('Discontinued');
  else if (f & F.limited) t.push('Limited time');
  if (f & F.quest) t.push('Quest item');
  return t.map(x => `<span class="tag">${x}</span>`).join('');
}
async function itemDetail(D, name) {
  const i = D.row[name] ?? D.byPage[name]; if (i == null) return null;
  try { const sh = await get(`data/i/${Math.floor(i / D.ia.ch)}.json`); return sh[i % D.ia.ch] || null; } catch (e) { return null; }
}
function infoTable(d) {
  const F = [['v', 'Version'], ['release', 'Released'], ['removal', 'Removed'], ['members', 'Members'], ['tradeable', 'Tradeable'], ['equipable', 'Equipable'], ['stackable', 'Stackable'],
    ['noteable', 'Noteable'], ['lendable', 'Lendable'], ['edible', 'Edible'], ['quest', 'Quest item'], ['restriction', 'Restriction'], ['slot', 'Slot'], ['examine', 'Examine'], ['value', 'Value'],
    ['high', 'High alch'], ['low', 'Low alch'], ['limit', 'GE buy limit'], ['gecat', 'GE category'], ['weight', 'Weight'], ['kept', 'Kept on death'], ['destroy', 'Destroy'], ['id', 'Item ID']];
  const fmt = (k, v) => ['members', 'tradeable', 'equipable', 'stackable', 'noteable', 'lendable', 'edible'].includes(k) ? yesno(v) : k === 'restriction' ? (RST_ITEM[v] || v)
    : ['value', 'high', 'low'].includes(k) ? gp(v) : k === 'weight' ? v + ' kg' : v;
  const rows = F.filter(([k]) => d[k] != null && d[k] !== '' && fmt(k, d[k]) !== '').map(([k, l]) => `<b>${l}</b><span>${esc(fmt(k, d[k]))}</span>`);
  if (d.alch === false) rows.push('<b>Alchemy</b><span>Cannot be alchemised</span>');
  if (d.runecoins && d.runecoins.some(x => x)) rows.push(`<b>Solomon's price</b><span>${esc(d.runecoins.filter(x => x).join(' / '))}</span>`);
  return `<div class="kv">${rows.join('')}</div>`;
}
function obtainNote(d) {
  const out = [];
  if (d.unob) out.push(`The wiki notes this item may not currently be obtainable${d.unob.rereleased === 'yes' ? ' (it has been re-released at least once)' : d.unob.rereleased === 'no' ? ' (it has not been re-released)' : ''}.`);
  else if (d.disc) out.push('The wiki lists this as discontinued content.');
  if (d.holiday) out.push('In the wiki category “Holiday items”.');
  if (d.k === 'override') out.push('Cosmetic override (wardrobe appearance), not a bank item.');
  return out.length ? `<div class="note" style="margin-top:6px">${out.map(esc).join(' ')}</div>` : '';
}
async function itemsView(name) {
  if (name === '~stats') return statsView();
  if (name === '~sets') return setsView();
  if (name === '~obtain' || name === '~dragon') return obtainView(name === '~dragon' ? 'dragon' : null);
  const [D] = await Promise.all([itemData(), loadThumbs()]);
  const {items, best, gear} = D;
  const asof = `as of ${esc(D.pr.date)} (${esc(geDateET(D))})`;
  if (name) {
    const r = rowOf(D, name), d = await itemDetail(D, name);
    const src = dropsOf(D, name) || [], g = gear[name] || (r && r[4] ? gear[r[4]] : null), v = priceOf(D, name), t = tradeOf(D, name);
    const page = d ? d.p : g ? g.p : name;
    view.innerHTML = `<div class="row" style="margin-bottom:10px"><a class="btn ghost" href="#items">← Items</a></div>
    <div class="panel"><div class="row">${icon(name)}<h2 style="margin:0">${esc(name)}</h2>${best[name] ? rarTag(best[name][0]) : ''}${flagTags(D, name)}</div>
    <div class="price">${v != null ? `Grand Exchange: <span class="gp">${gp(v)}</span> <span class="note">${asof}${d && d.gename ? ` · GE entry “${esc(d.gename)}”` : ''}</span>` : t === false ? '<span class="untr">Untradeable</span> <span class="note">(wiki item infobox)</span>' : `<span class="note">No Grand Exchange price in the ${esc(D.pr.date)} data.</span>`}</div>
    ${d ? `<h3>Item info <a class="note" href="${WIKI(page)}" target="_blank" rel="noopener">[wiki: ${esc(page)}]</a></h3>${infoTable(d)}${obtainNote(d)}` : `<div class="note" style="margin-top:6px"><a href="${WIKI(page)}" target="_blank" rel="noopener">Open “${esc(page)}” on the RS3 wiki</a></div>`}
    ${g ? `<h3>Equipment stats <a class="note" href="${WIKI(g.p)}" target="_blank" rel="noopener">[wiki: ${esc(g.p)}]</a></h3>${statTable(g)}` : ''}
    ${src.length ? `<h3>Drops</h3><div class="note" style="margin:6px 0 10px">Dropped by ${src.length} source${src.length === 1 ? '' : 's'}, best chance first.</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Dropped by</th><th>Qty</th><th>Rarity</th></tr></thead><tbody>
    ${src.map(s => `<tr><td>${s[5] ? `<a class="item" href="#drops/${encodeURIComponent(s[0])}">${mthumb(s[0], 32)}<span>${esc(s[0])}</span></a>` : `<span class="item">${SRCPICS[s[0]] ? `<img class="ico" style="width:32px;height:32px" loading="lazy" src="${esc(SRCPICS[s[0]])}" alt="">` : PH('◆')}<span>${esc(s[0])} <span class="tag">other source</span></span></span>`}</td>
      <td>${esc(s[1])}</td><td class="num">${rarityCell(s[2], s[3], s[4])}</td></tr>`).join('')}</tbody></table></div>` : '<div class="note" style="margin-top:8px">Not in any drop table in the wiki copy.</div>'}</div>`;
    return;
  }
  const o = Object.assign({q: '', rar: '', show: 'all', slot: '', sort: 'match', tr: '', mem: '', fl: ''}, JSON.parse(sessionStorage.iopt || '{}'));
  if (sessionStorage.iq && !o.q) o.q = sessionStorage.iq;
  if (o.show === 'untr') { o.show = 'all'; o.tr = 'untr'; }
  const st = D.ia.stats || {};
  view.innerHTML = `${subnav('search')}<div class="panel"><h2>Find any item</h2>${searchBox('q', 'e.g. red partyhat, santa hat, abyssal whip…', o.q)}
    <div class="chips" id="rar"><button data-v="">Any rarity</button>${RANK.map((r, i) => `<button data-v="${i}" class="r${i}">${r}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><select id="show"><option value="all">All items</option><option value="drop">Dropped by something</option><option value="gear">Equipment (with stats)</option><option value="ge">On the Grand Exchange</option></select>
    <select id="tr"><option value="">Tradeable or not</option><option value="trade">Tradeable</option><option value="untr">Untradeable</option></select>
    <select id="mem"><option value="">Members &amp; free</option><option value="mem">Members</option><option value="f2p">Free-to-play</option></select>
    <select id="fl"><option value="">Any kind</option><option value="items">Items only (no cosmetic overrides)</option><option value="equip">Equipable</option><option value="quest">Quest items</option><option value="holiday">Holiday items (wiki category)</option><option value="disc">Discontinued / not currently obtainable</option><option value="limited">Limited time (wiki restriction)</option><option value="mtx">Treasure Hunter</option><option value="override">Cosmetic overrides</option></select>
    <select id="slot"><option value="">Any slot</option>${SLOT_ORDER.map(s => `<option value="${s}">${SLOT_LABEL[s]}</option>`).join('')}</select>
    <select id="sort"><option value="match">Best match</option><option value="name">Name A–Z</option><option value="price">GE price, high → low</option><option value="pricel">GE price, low → high</option><option value="common">Rarity, common first</option><option value="rare">Rarity, rarest first</option><option value="tier">Tier, high → low</option></select></div>
    <div class="note" style="margin-top:6px">${D.names.length.toLocaleString()} items: every item page of the RS3 wiki copy (${(st.items || 0).toLocaleString()} item infobox entries incl. versions, ${(st.overrides || 0).toLocaleString()} cosmetic overrides), ${Object.keys(items).length.toLocaleString()} in drop tables, ${D.gd.gear.length.toLocaleString()} equipment pieces with stats, ${Object.keys(D.pr.prices).length.toLocaleString()} with a GE price. Prices ${asof}, from the wiki's GE price data.
    Rarity is an item's best drop chance across all its sources, banded the way the wiki colours drop tables (Always; Common ≥ 1/16; Uncommon ≥ 1/64; Rare ≥ 1/256; Very rare below that).</div><div id="res" class="list"></div></div>`;
  const q = $('#q'), out = $('#res');
  ['show', 'tr', 'mem', 'fl', 'slot', 'sort'].forEach(k => { $('#' + k).value = o[k]; });
  const F = D.FL;
  const fl = n => { const r = rowOf(D, n); return r ? r[3] : 0; };
  const draw = () => {
    o.q = q.value; sessionStorage.iopt = JSON.stringify(o); sessionStorage.iq = q.value;
    document.querySelectorAll('#rar button').forEach(b => b.classList.toggle('on', b.dataset.v === String(o.rar)));
    const nq = norm(q.value);
    let hits = [];
    for (const n of D.names) { const s = nq ? score(n, nq, D.tierN[n]) : 0; if (s >= 0) hits.push([s, n]); }
    /* the wiki's own redirects (e.g. "h'ween mask", "phat", common misspellings) also find the item */
    if (nq.length >= 3) {
      const A = D.alias[nq[0]];
      if (A === undefined) { D.alias[nq[0]] = null; get(`data/ia/${nq[0]}.json`).then(x => { D.alias[nq[0]] = x; if (norm(q.value)[0] === nq[0]) draw(); }).catch(() => { D.alias[nq[0]] = []; }); }
      else if (A) {
        const seen = new Set(hits.map(h => h[1]));
        for (const [a, ids] of A) {
          if (!a.includes(nq) && !nq.split(' ').every(t => a.includes(t))) continue;
          const sc = score(a, nq, a) - 50;
          for (const i of ids) { const n = D.ia.rows[i][0]; if (!seen.has(n)) { seen.add(n); hits.push([sc, n]); } }
        }
      }
    }
    if (o.rar !== '') hits = hits.filter(([, n]) => best[n] && best[n][0] === +o.rar);
    if (o.show === 'drop') hits = hits.filter(([, n]) => dropsOf(D, n));
    else if (o.show === 'gear') hits = hits.filter(([, n]) => gear[n]);
    else if (o.show === 'ge') hits = hits.filter(([, n]) => priceOf(D, n) != null);
    if (o.tr === 'trade') hits = hits.filter(([, n]) => tradeOf(D, n) === true);
    else if (o.tr === 'untr') hits = hits.filter(([, n]) => tradeOf(D, n) === false);
    if (o.mem) hits = hits.filter(([, n]) => fl(n) & F[o.mem]);
    if (o.fl === 'items') hits = hits.filter(([, n]) => !(fl(n) & F.override));
    else if (o.fl === 'equip') hits = hits.filter(([, n]) => fl(n) & F.equip || gear[n]);
    else if (o.fl) hits = hits.filter(([, n]) => fl(n) & F[o.fl]);
    if (o.slot) hits = hits.filter(([, n]) => gear[n] && gear[n].slot === o.slot);
    const P = n => priceOf(D, n), B = n => best[n] ? best[n][1] : null;
    const so = {match: (a, b) => b[0] - a[0] || a[1].localeCompare(b[1]), name: (a, b) => a[1].localeCompare(b[1]), price: (a, b) => (P(b[1]) ?? -1) - (P(a[1]) ?? -1),
      pricel: (a, b) => (P(a[1]) ?? 1e15) - (P(b[1]) ?? 1e15), common: (a, b) => (B(b[1]) ?? -1) - (B(a[1]) ?? -1), rare: (a, b) => (B(a[1]) ?? 9) - (B(b[1]) ?? 9),
      tier: (a, b) => ((gear[b[1]] || {}).tier ?? -1) - ((gear[a[1]] || {}).tier ?? -1)};
    if (!nq && o.sort === 'match' && o.rar === '' && o.show === 'all' && !o.slot && !o.tr && !o.mem && !o.fl) { out.innerHTML = '<div class="note">Start typing an item name, or pick a rarity, filter or sort to browse.</div><div id="drgstrip"></div>'; dragonStrip(D, $('#drgstrip')); return; }
    hits.sort(so[o.sort] || so.match);
    const n0 = hits.length; hits = hits.slice(0, 100);
    out.innerHTML = `<div class="note">${n0.toLocaleString()} match${n0 === 1 ? '' : 'es'}${n0 > 100 ? ', showing the first 100' : ''}.</div>` + hits.map(([, n]) => {
      const g = gear[n], b = best[n], src = dropsOf(D, n);
      return `<a class="hit" href="#items/${encodeURIComponent(n)}">${icon(n)}<span>${esc(n)}${g && g.tier != null ? ` <span class="tag">T${g.tier}</span>` : ''}${g && g.slot ? ` <span class="tag">${esc(SLOT_LABEL[g.slot] || g.slot)}</span>` : ''}${flagTags(D, n)}</span>
        <span class="meta">${b ? rarTag(b[0]) : ''}${priceTag(D, n)}${src ? `<div>${src.length} source${src.length === 1 ? '' : 's'}</div>` : ''}</span></a>`;
    }).join('');
  };
  let tmr = null;
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(draw, 150); };
  document.querySelectorAll('#rar button').forEach(b => b.onclick = () => { o.rar = b.dataset.v; draw(); });
  ['show', 'tr', 'mem', 'fl', 'slot', 'sort'].forEach(k => { $('#' + k).onchange = e => { o[k] = e.target.value; draw(); }; });
  draw(); q.focus();
}

/* ---------- Obtainable: items the RS3 wiki does not mark discontinued / unobtainable / deleted (data/ob.json, from extract_obtainable.py) ----------
   rows [iall row, category bits, how-to-obtain text quoted from the wiki page, which part of the page it came from, extras{sh shops, dr drops, rc recipe skills, rf facility, rq2 wear reqs, only, pic, g dragon stats}] */
const obPic = (x, n, cls = 'obpic') => x && x.pic ? `<img class="${cls}" loading="lazy" src="obimg/${esc(x.pic)}.webp" alt="" title="${esc(n)} (picture: RS3 wiki)">` : `<span class="${cls} obico">${icon(n)}</span>`;
const DRAGON_FEATURE = ['Dragon platebody', 'Dragon full helm', 'Dragon kiteshield', 'Dragon claw', 'Dragon dagger', 'Dragon longsword', 'Dragon scimitar', 'Dragon battleaxe', 'Dragon platelegs', 'Dragon boots', 'Dragon gloves', 'Dragon chainbody', 'Dragon halberd', 'Dragon hatchet', 'Dragon pickaxe', 'Dragon mace'];
function dragonPick(D, rows, k = 8) {
  const by = {}; rows.forEach(r => { by[D.ia.rows[r[0]][0]] = r; });
  const L = DRAGON_FEATURE.map(n => by[n]).filter(r => r && r[4].pic);
  for (const r of rows) { if (L.length >= k) break; if (r[4].pic && !L.includes(r)) L.push(r); }
  return L.slice(0, k);
}
function gStat(g) {
  if (!g) return '';
  const t = [g.tier != null ? `T${g.tier}` : '', g.cls ? cap(g.cls) : '', g.slot ? SLOT_LABEL[g.slot] || g.slot : '', g.type ? cap(g.type) : '', g.damage != null ? `Damage ${g.damage}` : '', g.accuracy != null ? `Accuracy ${g.accuracy}` : '', g.armour != null ? `Armour ${g.armour}` : '', g.strength ? `Strength +${g.strength}` : ''].filter(Boolean);
  return t.length ? `<div class="obstat">${t.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : '';
}
async function dragonStrip(D, el) {
  if (!el) return;
  let dr; try { dr = await get('data/obdragon.json'); } catch (e) { return; }
  const L = dragonPick(D, dr.rows, 8); if (!L.length || !el.isConnected) return;
  el.innerHTML = `<div class="drgbox"><div class="drghead"><span class="drgt">${L[0] ? obPic(L[0][4], D.ia.rows[L[0][0]][0], "drgmini") : ""}Dragon gear</span><a class="btn sub" href="#items/~dragon">See all ${dr.rows.length} dragon items →</a></div>
    <div class="drgrow">${L.map(r => { const n = D.ia.rows[r[0]][0], v = priceOf(D, n); return `<a class="drgcard" href="#items/${encodeURIComponent(n)}">${obPic(r[4], n, 'drgpic')}<b>${esc(n)}</b>${gStat(r[4].g)}<span class="${v != null ? 'gp' : 'untr'}">${v != null ? gp(v) : 'no GE price'}</span></a>`; }).join('')}</div>
    <div class="note">Pictures, stats and prices from the RS3 wiki (GE ${esc(D.pr.date)}).</div></div>`;
}
async function obtainView(cat0) {
  const [D, OB] = await Promise.all([itemData(), get('data/ob.json')]);
  const B = OB.bits, CL = Object.fromEntries(OB.cats), F = D.FL;
  const COOL = B.cape | B.override | B.outfit | B.pet | B.event | B.achieve | B.dragon;
  const o = Object.assign({mode: 'money', cat: '', q: '', tr: '', mem: '', eq: '', hol: '', rar: '', only: '', sort: ''}, JSON.parse(sessionStorage.obopt || '{}'));
  if (cat0) { o.cat = cat0; o.mode = 'cool'; o.q = ''; }
  const st = OB.stats || {}, ex = st.excluded || {};
  const nEx = Object.entries(ex).filter(([k]) => !/^no GE price/.test(k)).reduce((a, [, v]) => a + v, 0);
  const dung = ex['Daemonheim-only'] || 0;
  const name = r => D.ia.rows[r[0]][0];
  const cnt = {}; OB.rows.forEach(r => { for (const [c] of OB.cats) if (r[1] & B[c]) cnt[c] = (cnt[c] || 0) + 1; });
  const dpick = dragonPick(D, OB.rows.filter(r => r[1] & B.dragon), 6);
  view.innerHTML = `${subnav('obtain')}<div class="panel obpanel"><div class="obhero"><div class="obhpics" title="Dragon gear pictures from the RS3 wiki">${dpick.slice(0, 3).map(r => obPic(r[4], name(r), 'obhpic')).join('')}</div><div><h2>Obtainable items</h2>
    <div class="note">${OB.rows.length.toLocaleString()} items and cosmetics you can still get, from the RS3 wiki copy (${esc(OB.snap)}). Left out: ${nEx.toLocaleString()} entries the wiki marks discontinued, currently unobtainable, deleted/removed, hidden, “Unobtainable items” or with a removal date, plus ${dung.toLocaleString()} Daemonheim-only items (they can't leave Daemonheim). Quest-only and minigame-only items are tagged and hidden unless you ask for them. “How to get it” is quoted from each item's wiki page.</div></div></div>
    <div class="chips obmode" id="mode"><button data-v="money">Worth money</button><button data-v="cool">Cosmetically cool</button></div>
    ${searchBox('q', 'Search obtainable items, e.g. veteran cape, dragon, pet, partyhat…', o.q)}
    <div class="chips" id="cat"><button data-v="">All categories</button>${OB.cats.map(([c, l]) => `<button data-v="${c}" class="${c === 'dragon' ? 'drgchip' : ''}">${esc(l)} <span class="cnt">${(cnt[c] || 0).toLocaleString()}</span></button>`).join('')}</div>
    <div class="chips" id="rar"><button data-v="">Any rarity</button>${RANK.map((r, i) => `<button data-v="${i}" class="r${i}">${r}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px">
    <select id="tr"><option value="">Tradeable or not</option><option value="trade">Tradeable (GE)</option><option value="untr">Untradeable</option></select>
    <select id="mem"><option value="">Members &amp; free</option><option value="mem">Members</option><option value="f2p">Free-to-play</option></select>
    <select id="eq"><option value="">Equipable or not</option><option value="equip">Equipable / wearable</option></select>
    <select id="hol"><option value="">Holiday &amp; normal</option><option value="holiday">Holiday / event items only</option><option value="noh">No holiday items</option></select>
    <select id="only"><option value="">Hide quest-only &amp; minigame-only</option><option value="show">Include quest-only &amp; minigame-only</option></select>
    <select id="sort"><option value="">Default for the mode</option><option value="price">GE price, high → low</option><option value="pricel">GE price, low → high</option><option value="name">Name A–Z</option><option value="rare">Rarest drop first</option></select></div>
    <div id="obres"></div></div>`;
  const q = $('#q'), out = $('#obres');
  ['tr', 'mem', 'eq', 'hol', 'only', 'sort'].forEach(k => { $('#' + k).value = o[k]; });
  const best = r => { const b = D.best[name(r)]; return b ? b[0] : null; };
  let lim = 48;
  const draw = () => {
    o.q = q.value; sessionStorage.obopt = JSON.stringify(o);
    document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.v === o.mode));
    document.querySelectorAll('#cat button').forEach(b => b.classList.toggle('on', b.dataset.v === o.cat));
    document.querySelectorAll('#rar button').forEach(b => b.classList.toggle('on', b.dataset.v === String(o.rar)));
    const nq = norm(q.value);
    let L = [];
    for (const r of OB.rows) {
      const ir = D.ia.rows[r[0]], n = ir[0], f = ir[3], x = r[4];
      if (o.mode === 'money' && !o.cat && ir[2] == null) continue;
      if (o.mode === 'cool' && !o.cat && !(r[1] & COOL)) continue;
      if (o.cat && !(r[1] & B[o.cat])) continue;
      if (x.only && o.only !== 'show') continue;
      if (o.tr === 'trade' && !(f & F.trade || ir[2] != null)) continue;
      if (o.tr === 'untr' && !(f & F.untr)) continue;
      if (o.mem && !(f & F[o.mem])) continue;
      if (o.eq && !(f & F.equip)) continue;
      if (o.hol === 'holiday' && !(f & F.holiday || r[1] & B.event)) continue;
      if (o.hol === 'noh' && (f & F.holiday)) continue;
      if (o.rar !== '' && best(r) !== +o.rar) continue;
      let s = 0;
      if (nq) { s = score(n, nq); if (s < 0) { if (!norm(r[2]).includes(nq)) continue; s = -50; } }
      L.push([s, r]);
    }
    const P = r => D.ia.rows[r[0]][2];
    const sort = o.sort || (o.mode === 'money' ? 'price' : 'pic');
    const cmp = {price: (a, b) => (P(b) ?? -1) - (P(a) ?? -1), pricel: (a, b) => (P(a) ?? 1e15) - (P(b) ?? 1e15), name: (a, b) => name(a).localeCompare(name(b)),
      rare: (a, b) => (best(b) ?? -1) - (best(a) ?? -1) || (P(b) ?? -1) - (P(a) ?? -1),
      pic: (a, b) => (b[4].pic ? 1 : 0) - (a[4].pic ? 1 : 0) || (P(b) ?? -1) - (P(a) ?? -1) || name(a).localeCompare(name(b))}[sort];
    L.sort((a, b) => (nq ? b[0] - a[0] : 0) || cmp(a[1], b[1]));
    const tradeN = L.filter(([, r]) => P(r) != null).length;
    if (!L.length) {
      out.innerHTML = `<div class="obempty">${dpick.slice(0, 2).map(r => obPic(r[4], name(r), 'obhpic')).join('')}<div><b>No obtainable items match.</b><div class="note">Try another word, category or filter.</div></div></div>`; return;
    }
    out.innerHTML = `<div class="note" style="margin:8px 0">${L.length.toLocaleString()} item${L.length === 1 ? '' : 's'} (${tradeN.toLocaleString()} with a GE price${tradeN ? `, GE ${esc(D.pr.date)}` : ''})${L.length > lim ? `, showing ${lim}` : ''}.</div>
      <div class="obgrid">${L.slice(0, lim).map(([, r]) => obCard(D, OB, r)).join('')}</div>${L.length > lim ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="more">Show more</button></div>' : ''}`;
    const m = $('#more'); if (m) m.onclick = () => { lim += 96; draw(); };
  };
  let tmr = null;
  q.oninput = () => { clearTimeout(tmr); lim = 48; tmr = setTimeout(draw, 150); };
  const reset = () => { lim = 48; draw(); };
  document.querySelectorAll('#mode button').forEach(b => b.onclick = () => { o.mode = b.dataset.v; o.cat = ''; reset(); });
  document.querySelectorAll('#cat button').forEach(b => b.onclick = () => { o.cat = o.cat === b.dataset.v ? '' : b.dataset.v; reset(); });
  document.querySelectorAll('#rar button').forEach(b => b.onclick = () => { o.rar = b.dataset.v; reset(); });
  ['tr', 'mem', 'eq', 'hol', 'only', 'sort'].forEach(k => { $('#' + k).onchange = e => { o[k] = e.target.value; reset(); }; });
  draw();
}
const OB_SRC = {lead: 'page intro'};
function obCard(D, OB, r) {
  const ir = D.ia.rows[r[0]], n = ir[0], page = ir[4] || n, f = ir[3], F = D.FL, x = r[4], v = ir[2];
  const tags = OB.cats.filter(([c]) => r[1] & OB.bits[c]).map(([c, l]) => `<span class="tag ${c === 'dragon' ? 'drgtag' : ''}">${esc(l)}</span>`);
  if (x.only) tags.unshift(`<span class="tag warn">${x.only === 'quest' ? 'Quest only' : x.only === 'minigame' ? 'Minigame only' : 'Guthixian Cache only'}</span>`);
  if (f & F.holiday) tags.push('<span class="tag">Holiday item</span>');
  const fl = [f & F.mem ? 'Members' : f & F.f2p ? 'Free-to-play' : '', v != null || f & F.trade ? 'Tradeable' : ''].filter(Boolean).join(' · ');
  const b = D.best[n];
  const how = r[2] ? `<blockquote class="obhow">“${esc(r[2])}”<cite>— RS3 wiki, <a href="${WIKI(page)}" target="_blank" rel="noopener">${esc(page)}</a> (${esc(OB_SRC[r[3]] || r[3] + ' section')})</cite></blockquote>` : '<div class="note">The wiki page has no intro text; see the wiki link.</div>';
  const kv = [];
  if (x.sh) kv.push(['Sold by', x.sh.map(s => `${esc(s[0])}${s[1] ? ` (${/^\d+$/.test(s[1]) ? (+s[1]).toLocaleString() : esc(s[1])}${s[2] ? ' ' + esc(s[2]) : /^\d+$/.test(s[1]) ? ' coins' : ''})` : ''}`).join(', ') + (x.nsh > x.sh.length ? ` +${x.nsh - x.sh.length} more` : '')]);
  if (x.dr) kv.push(['Dropped by', x.dr.map(d => `${esc(d[0])}${d[1] ? ` <span class="${d[2] != null ? 'r' + Math.min(d[2], 4) : ''}">(${esc(d[1])})</span>` : ''}`).join(', ') + (x.nd > x.dr.length ? ` +${x.nd - x.dr.length} more` : '')]);
  if (x.rc) kv.push(['Made with', esc(x.rc) + (x.rf ? ` at ${esc(x.rf)}` : '')]);
  if (x.rq2) kv.push(['To wear', esc(x.rq2)]);
  return `<div class="obcard ${r[1] & OB.bits.dragon ? 'drg' : ''}">${obPic(x, n)}<div class="obbody"><div class="obtitle"><a href="#items/${encodeURIComponent(n)}">${esc(n)}</a>${b ? rarTag(b[0]) : ''}</div>
    <div class="obprice">${v != null ? `<span class="gp">${gp(v)}</span>` : f & F.untr ? '<span class="untr">Untradeable</span>' : '<span class="note">no GE price</span>'}${fl ? ` <span class="note">${fl}</span>` : ''}</div>
    <div class="obtags">${tags.join('')}</div>${gStat(x.g)}${how}${kv.length ? `<div class="kv obkv">${kv.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('')}</div>` : ''}
    <div class="note"><a href="${WIKI(page)}" target="_blank" rel="noopener">Open on the RS3 wiki ↗</a></div></div></div>`;
}

/* ---------- clues ---------- */
function coordKey(s) {
  // "22 degrees 30 minutes north, 03 degrees 01 minutes east" / "22.30N 03.01E" / "22 30 n 3 1 e"
  const m = norm(s).replace(/degrees?|minutes?/g, ' ').replace(/(\d)\s*(north|south|east|west|n|s|e|w)\b/g, '$1 $2').match(/\d+|north|south|east|west|\bn\b|\bs\b|\be\b|\bw\b/g);
  if (!m) return null;
  const nums = m.filter(x => /\d/.test(x)).map(Number), dirs = m.filter(x => !/\d/.test(x)).map(x => x[0]);
  if (nums.length !== 4 || dirs.length !== 2) return null;
  return `${nums[0]}.${nums[1]}${dirs[0]}${nums[2]}.${nums[3]}${dirs[1]}`;
}
const letters = s => norm(s).replace(/[^a-z]/g, '').split('').sort().join('');
function clueCard(c, travel) {
  const rows = [];
  const add = (k, v, pre) => { if (v) rows.push(`<b>${k}</b><span class="${pre ? 'pre' : ''}">${v}</span>`); };
  add('Solution', esc(c.solution), true);
  if (c.type === 'emote') add('Emote', [c.emote, c.emote2].filter(Boolean).map(e => `<span class="item">${emoteIcon(e)}<span>${esc(e)}</span></span>`).join(' then '));
  add('Location', esc(c.location), true);
  add(c.type === 'emote' && c.coords && c.coords.length > 2 ? 'Area corners' : 'Coordinates', c.coords ? c.coords.map(x => coordStr(x)).join(' · ') + (c.mapID && !['28', '-1'].includes(c.mapID) ? ` (map ${esc(c.mapID)})` : '') : '');
  add('Items', (c.items || []).map(itemLink).join('<br>'));
  add('Requirements', esc(c.requirements), true);
  add('Question', esc(c.question)); add('Answer', esc(c.answer));
  add('Puzzle', esc(c.puzzle)); add('Fight', esc(c.fight));
  add('Hidey-hole', c.hideyhole ? esc(c.hideyhole) + (c.hideyhole_coords ? ` at ${coordStr(c.hideyhole_coords[0])}` : '') : '');
  add('Search area', esc(c.area_hint), true);
  add('Travel', esc(c.travel), true);
  return `<div class="cluecard"><div class="row" style="margin-bottom:6px"><span class="tag">${esc(cap(c.tier.replace('_', ' ')))}</span><span class="tag">${esc(TYPE_LABEL[c.type] || c.type)}</span>${c.area ? `<span class="tag">${esc(c.area)}</span>` : ''}</div>
    <div class="cluehead">${c.pic ? `<img class="cluepic" loading="lazy" src="${esc(c.pic)}" alt="Clue location picture">` : `<span class="ph cluepic">No picture yet</span>`}<div>
    <h3 class="cluet">${esc(c.clue)}</h3>${c.text && c.text !== c.clue ? `<div class="quote">“${esc(c.text)}”</div>` : ''}</div></div>
    <div class="kv">${rows.join('')}</div>
    ${c.clueimg ? `<img class="clueimg" loading="lazy" src="${esc(c.clueimg)}" alt="Map clue image">` : ''}
    ${(c.links || []).slice(0, 1).map(x => travelBlock(x, travel, false)).join('')}</div>`;
}
async function cluesView(arg) {
  const [clues, travel, mech] = await Promise.all([get('data/clues.json'), get('data/travel.json'), get('data/mechanics.json')]);
  const tiers = TIERS.filter(t => clues.some(c => c.tier === t)), types = Object.keys(TYPE_LABEL).filter(t => clues.some(c => c.type === t));
  const st = JSON.parse(sessionStorage.cq || '{"q":"","tier":"","type":""}');
  if (arg) st.q = arg;
  view.innerHTML = `<div class="panel"><h2>Clue solver</h2>
    ${searchBox('q', 'Paste clue text, anagram letters, emote, NPC or coordinates (e.g. 22 30 N 3 01 E)', st.q)}
    <div class="row" style="margin-top:8px">
      <select id="tier"><option value="">All tiers</option>${tiers.map(t => `<option value="${t}" ${t === st.tier ? 'selected' : ''}>${esc(cap(t.replace('_', ' ')))}</option>`).join('')}</select>
      <select id="type"><option value="">All types</option>${types.map(t => `<option value="${t}" ${t === st.type ? 'selected' : ''}>${TYPE_LABEL[t]}</option>`).join('')}</select>
      <span class="note" id="cnt"></span></div></div>
    <div id="res"></div>
    ${Object.keys(mech).length ? `<div class="panel"><h2>Puzzles &amp; mechanics notes</h2>${Object.entries(mech).map(([k, v]) => `<details><summary>${esc(k)}</summary><div class="pre note" style="margin-top:6px">${esc(v.text)}</div></details>`).join('')}</div>` : ''}`;
  const q = $('#q'), out = $('#res');
  const draw = () => {
    const s = {q: q.value, tier: $('#tier').value, type: $('#type').value}; sessionStorage.cq = JSON.stringify(s);
    const nq = norm(s.q), ck = coordKey(s.q), lt = nq.length >= 5 ? letters(nq) : null;
    let hits = clues.filter(c => (!s.tier || c.tier === s.tier) && (!s.type || c.type === s.type))
      .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.type.localeCompare(b.type) || a.clue.localeCompare(b.clue));
    if (nq) {
      hits = hits.map(c => {
        const hay = norm([c.clue, c.text, c.solution, c.emote, c.location, c.area, c.npc].join(' '));
        let sc = -1;
        if (ck && c.type === 'coordinate' && coordKey(c.clue) === ck) sc = 1000;
        else if (norm(c.clue) === nq) sc = 900;
        else if (lt && c.type === 'anagram' && letters(c.clue) === lt) sc = 850;
        else if (hay.includes(nq)) sc = 500 - hay.indexOf(nq) / 100;
        else if (nq.split(' ').every(t => hay.includes(t))) sc = 200;
        return [sc, c];
      }).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    }
    $('#cnt').textContent = `${hits.length} clue${hits.length === 1 ? '' : 's'}${hits.length > 40 ? ' (showing 40)' : ''}`;
    out.innerHTML = hits.length ? `<div class="panel">${hits.slice(0, 40).map(c => clueCard(c, travel)).join('')}</div>` : '';
    out.querySelectorAll('img.cluepic').forEach(im => im.onclick = () => im.classList.toggle('big'));
  };
  let tmr; q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(draw, 120); };
  $('#tier').onchange = draw; $('#type').onchange = draw; draw(); q.focus();
}


/* ---------- quests ---------- */
const QKEY = id => 'qprog:' + id, QDONE = t => 'qdone:' + t;
const qProg = id => new Set(JSON.parse(localStorage.getItem(QKEY(id)) || '[]'));
const qIsDone = t => localStorage.getItem(QDONE(t)) === '1';
function qIcon(f, size = 36) { return f ? `<img class="ico" style="width:${size}px;height:${size}px" loading="lazy" src="${esc(f)}" alt="">` : PH('❖', size); }
function bulletList(lst, withPics) {
  if (!lst || !lst.length) return '';
  return `<ul class="blist${withPics ? " pics" : ""}">${lst.map(r => `<li style="margin-left:${Math.max(0, r.d - 1) * 18}px">${withPics ? `<span class="item">${r.i ? `<img class="ico" loading="lazy" src="${esc(r.i)}" alt="">` : PH('✦')}<span>${esc(r.t)}</span></span>` : esc(r.t)}</li>`).join('')}</ul>`;
}
async function hansRow() {
  const h = await get('data/hans.json').catch(() => null);
  return h ? [h.title, 'tasks', '', 'Event', h.length, 0, h.icon, h.steps.length, 'wiki', 0, 'hans', 0] : null;
}
async function questsView(name) {
  let qs = await get('data/quests.json');
  const hr = await hansRow(); if (hr) qs = [hr, ...qs];
  if (name) return questDetail(name, qs);
  const st = JSON.parse(sessionStorage.qf || '{"q":"","kind":"","mem":"","diff":""}');
  const diffs = [...new Set(qs.map(q => q[3]).filter(Boolean))].sort((a, b) => ['Novice', 'Intermediate', 'Experienced', 'Master', 'Grandmaster', 'Special'].indexOf(a) - ['Novice', 'Intermediate', 'Experienced', 'Master', 'Grandmaster', 'Special'].indexOf(b));
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  view.innerHTML = `<div class="panel"><h2>Quest helper</h2>${searchBox('q', 'Search quests…', st.q)}
    <div class="row" style="margin-top:8px">
      <select id="kind">${opt('', 'Quests & miniquests', st.kind)}${opt('quest', 'Quests', st.kind)}${opt('miniquest', 'Miniquests', st.kind)}${opt('tasks', 'Anniversary task list', st.kind)}</select>
      <select id="mem">${opt('', 'Free & members', st.mem)}${opt('No', 'Free-to-play', st.mem)}${opt('Yes', 'Members', st.mem)}</select>
      <select id="diff">${opt('', 'Any difficulty', st.diff)}${diffs.map(d => opt(d, d, st.diff)).join('')}</select>
      <span class="note" id="cnt"></span></div></div><div class="panel"><div class="hint" style="margin-bottom:6px">Green = complete, yellow = in progress, red = not started (tracked on this device).</div><div id="res" class="list" style="margin-top:0"></div></div>`;
  const draw = () => {
    const s = {q: $('#q').value, kind: $('#kind').value, mem: $('#mem').value, diff: $('#diff').value}; sessionStorage.qf = JSON.stringify(s);
    const nq = norm(s.q);
    let hits = qs.filter(q => (!s.kind || q[1] === s.kind) && (!s.mem || q[2] === s.mem) && (!s.diff || q[3] === s.diff));
    hits = nq ? hits.map(q => [score(q[0], nq), q]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]).map(x => x[1]) : hits;
    $('#cnt').textContent = `${hits.length} of ${qs.length}`;
    $('#res').innerHTML = hits.map(q => {
      const done = qIsDone(q[0]), n = q[7], p = n ? qProg(q[10]).size : 0;
      const meta = q[9] ? '<span class="tag">page not downloaded yet</span>' : [q[3], q[4], q[2] === 'No' ? 'F2P' : q[2] === 'Yes' ? 'Members' : '', done ? '✓ done' : n ? `${Math.min(p, n)}/${n} steps` : ''].filter(Boolean).map(esc).join(' · ');
      const cls = done || (n && p >= n) ? 'qs-done' : p ? 'qs-prog' : 'qs-none';
      return `<a class="hit" href="#quests/${encodeURIComponent(q[0])}">${qIcon(q[6])}<span class="${cls}">${esc(q[0])}${q[1] === 'miniquest' ? ' <span class="tag">miniquest</span>' : ''}</span><span class="meta">${meta}</span></a>`;
    }).join('');
  };
  $('#q').oninput = draw; ['#kind', '#mem', '#diff'].forEach(id => $(id).onchange = draw); draw(); $('#q').focus();
}
async function questDetail(name, qs) {
  const row = qs.find(q => q[0] === name);
  if (!row) { view.innerHTML = `<div class="panel">${esc(name)} is not in this offline copy yet. <a href="#quests">Back to quests</a></div>`; return; }
  const [q, travel] = await Promise.all([get(row[10] === 'hans' ? 'data/hans.json' : `data/q/${row[10]}.json`), get('data/travel.json')]);
  const isH = row[10] === 'hans';
  const titles = new Set(qs.map(x => x[0]));
  const qlink = t => titles.has(t) ? `<a href="#quests/${encodeURIComponent(t)}">${esc(t)}</a>${qIsDone(t) ? ' <span class="r1">✓</span>' : ''}` : esc(t);
  const kv = [['Type', cap(q.kind)], ['Members', q.members], ['Difficulty', q.difficulty], ['Length', q.length], ['Quest points', q.qp], ['Series', q.series], ['Released', q.release]].filter(x => x[1]);
  const sec = (h, body) => body ? `<div class="panel"><h2>${h}</h2>${body}</div>` : '';
  const pre = (q.prereq_quests || []).length || (q.prereq_other || []).length ? `<div><b class="pill">Quests</b><ul class="blist">${(q.prereq_quests || []).map(t => `<li>${qlink(t)}</li>`).join('')}${(q.prereq_other || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '';
  const full = (q.prereq_full || []).length ? `<details><summary>Full prerequisite chain (${q.prereq_full.length})</summary><ul class="blist">${q.prereq_full.map(t => `<li>${qlink(t)}</li>`).join('')}</ul></details>` : '';
  const reqs = pre + (q.requirements ? `<div><b class="pill">Skills &amp; other</b>${bulletList(q.requirements)}</div>` : '') + (q.ironman ? `<div><b class="pill">Ironman</b>${bulletList(q.ironman)}</div>` : '') + full;
  const start = q.start || q.start_coords || q.start_pics || q.start_steps ? `${startSteps(q.start_steps)}${gallery(q.start_pics)}<div class="pre">${esc(q.start || '')}</div>
    ${q.start_coords ? `<div style="margin-top:6px"><b class="pill">Start point</b> ${coordStr(q.start_coords, q.start_plane)}</div>` : ''}
    ${q.start_lodestones ? `<div style="margin-top:6px"><b class="pill">Nearest lodestones</b> ${q.start_lodestones.map(l => `${esc(l.name)} (${l.tiles} tiles)`).join(', ')} <span class="note">straight-line</span></div>` : ''}
    ${(q.start_links || []).map((x, i) => travelBlock(x, travel, i === 0)).join('')}` : '';
  const done = qIsDone(name);
  view.innerHTML = `<div class="row" style="margin-bottom:10px"><a class="btn ghost" href="#quests">← Quests</a></div>
  <div class="panel">${q.image ? `<div class="qhero">${fig(q.image, 'hero')}</div>` : ''}<div class="row" style="gap:14px;align-items:flex-start">${qIcon(q.icon, 48)}<div style="flex:1;min-width:220px"><h2>${esc(name)}</h2>
    <div class="kv">${kv.map(([k, v]) => `<b>${k}</b><span>${esc(v)}</span>`).join('')}</div>
    ${q.stub ? '<div class="note" style="margin-top:6px">This quest page was not in the offline copy yet. Only its prerequisites are known; rebuild after the download finishes.</div>' : ''}
    <div class="row" style="margin-top:10px"><button class="btn ${done ? '' : 'ghost'}" id="qdone">${done ? '✓ Marked complete' : isH ? 'Mark task list complete' : 'Mark quest complete'}</button></div></div></div></div>
  ${isH ? `<div class="panel"><h2>All ${q.index.length} tasks</h2><div class="note">The wiki's own 25th Anniversary task list (tap a task to jump to its steps). Do them in any order; the route number is the wiki's recommended order. A tick means that task's steps are all ticked below.</div><div id="hidx" class="hidx"></div></div>` : ''}
  ${sec('Start', start)}${sec('Requirements', reqs)}
  ${sec('Items required', bulletList(q.items, true))}${sec('Recommended', bulletList(q.recommended, true))}${sec('Enemies to defeat', bulletList(q.kills))}
  ${q.steps && q.steps.length ? `<div class="panel"><h2>Walkthrough</h2>
    <div class="row"><div class="prog"><div id="bar"></div></div><span class="note" id="pct"></span>
    <label class="note"><input type="checkbox" id="hide"> Hide finished steps</label><button class="btn ghost" id="reset">Reset progress</button></div>
    <div class="note" style="margin:6px 0">${isH ? "Built only from the wiki: the 25th Anniversary task list page (task text, items, requirements) and the wiki's Hans transcript for the dialogue menus where you must pick a specific option (marked \u201cChoose option\u201d). The wiki has no separate walkthrough page for these tasks, so each one is: do what the task says, then the pop-up confirms it. Pictures are the wiki's own NPC and place pictures. Ticks are saved on this device only." : q.steps_source === 'quick guide' ? 'From the wiki quick guide.' : 'From the full wiki guide (no quick guide in this copy).'} Pictures are the wiki's own: images from the guide shown at the step they belong to, or the wiki picture of the place/NPC that step links to. Tap one to enlarge. Ticks are saved on this device only.</div>
    <div id="steps"></div></div>` : ''}
  ${(q.guide_pics || []).length ? `<div class="panel"><h2>More pictures from the wiki guide</h2><div class="note">These appear in the full wiki guide but don't clearly match one quick-guide step, so they are listed under the wiki's own section headings.</div>${q.guide_pics.map(g => `<h3 class="stepsec">${esc(g.sec)}</h3>${gallery(g.p)}`).join('')}</div>` : ''}
  ${sec('Rewards', bulletList(q.rewards) + (isH ? '<div class="note" style="margin-top:6px">The wiki lists no separate reward per task: the reward comes after all tasks are done and you speak to Hans again.</div>' : ''))}
  ${isH ? `<div class="panel"><h2>Wiki pages</h2><ul class="blist">${q.wiki_links.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul></div>` : ''}`;
  $('#qdone').onclick = () => { if (qIsDone(name)) localStorage.removeItem(QDONE(name)); else localStorage.setItem(QDONE(name), '1'); questDetail(name, qs); };
  if (!q.steps || !q.steps.length) return;
  const prog = qProg(row[10]);
  const save = () => localStorage.setItem(QKEY(row[10]), JSON.stringify([...prog]));
  const hide = $('#hide'); hide.checked = localStorage.qhide === '1';
  /* Render every step ONCE, then tick/untick in place. (Re-building the whole list on each tick re-created every picture, which made the
     page jump to a different place and flicker, worst on phones. Step ids are unchanged, so saved ticks keep working.) */
  const secOf = new Map(); q.steps.forEach(x => { if (!secOf.has(x.sec)) secOf.set(x.sec, []); secOf.get(x.sec).push(x); });
  const idxHtml = () => [...q.index].sort((a, b) => a.order - b.order).map(t => { const dn = secOf.get(`Route stop ${t.order} of 25: ${t.year} – ${t.name}`).every(x => prog.has(x.id)); return `<a class="hit ${dn ? 'qs-done' : ''}" data-go="${t.do}" href="#"><span class="${dn ? 'qs-done' : 'qs-none'}">${dn ? '✓ ' : ''}${t.order}. ${t.year} – ${esc(t.name)}</span><span class="meta">${esc(t.task)}</span></a>`; }).join('');
  const bindIdx = () => $('#hidx').querySelectorAll('a[data-go]').forEach(a => a.onclick = e => {
    e.preventDefault(); if (hide.checked) { hide.checked = false; localStorage.qhide = '0'; refresh(); }
    const t = q.steps.find(x => x.id === a.dataset.go); const el = document.getElementById('hs-' + (q.steps.find(x => x.sec === t.sec) || t).id);
    if (!el) return;
    $('#steps').querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager');
    const go = () => { const hh = (document.querySelector('.top') || {}).offsetHeight || 0; window.scrollTo({top: el.getBoundingClientRect().top + window.scrollY - hh - 8, behavior: 'instant'}); };
    go(); let n = 0; const iv = setInterval(() => { go(); if (++n > 12) clearInterval(iv); }, 120);
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(ev => window.addEventListener(ev, () => clearInterval(iv), {once: true, passive: true}));
  });
  const refresh = () => {
    const hs = hide.checked; let last = null;
    $('#steps').querySelectorAll('.stepw').forEach(w => {
      const ok = prog.has(w.dataset.id), cb = w.querySelector('input'); cb.checked = ok;
      w.classList.toggle('done', ok); w.querySelector('label.step').classList.toggle('done', ok); w.hidden = ok && hs;
    });
    $('#steps').querySelectorAll('h3.stepsec').forEach(h => { h.hidden = hs && (secOf.get(h.dataset.sec) || []).every(x => prog.has(x.id)); });
    const pc = Math.round(100 * q.steps.filter(x => prog.has(x.id)).length / q.steps.length);
    $('#bar').style.width = pc + '%'; $('#pct').textContent = `${pc}% done`;
    if (isH && $('#hidx')) {
      if (!$('#hidx').children.length) { $('#hidx').innerHTML = idxHtml(); bindIdx(); }
      else $('#hidx').querySelectorAll('a[data-go]').forEach(a => { const t = q.index.find(x => x.do === a.dataset.go); const dn = secOf.get(`Route stop ${t.order} of 25: ${t.year} \u2013 ${t.name}`).every(x => prog.has(x.id)); a.classList.toggle('qs-done', dn); const sp = a.firstElementChild; sp.className = dn ? 'qs-done' : 'qs-none'; sp.textContent = `${dn ? '\u2713 ' : ''}${t.order}. ${t.year} \u2013 ${t.name}`; });
    }
  };
  const draw = () => {
    let last = null, n = 0;
    $('#steps').innerHTML = q.steps.map(s => {
      const ok = prog.has(s.id); n++;
      const h = s.sec !== last ? `<h3 class="stepsec" id="hs-${s.id}" data-sec="${esc(s.sec)}">${esc(s.sec)}</h3>` : ''; last = s.sec;
      return h + `<div class="stepw ${ok ? 'done' : ''} ${s.choice ? 'choice' : ''}" data-id="${s.id}">${s.p ? gallery(s.p, 'steppics') : ''}<label class="step ${ok ? 'done' : ''}"><input type="checkbox" data-id="${s.id}" ${ok ? 'checked' : ''}><span><span class="sn">${n}.</span> ${s.choice ? '<span class="chtag">Choose option</span> ' : ''}${esc(s.t)}
        ${s.sub && s.sub.length ? `<ul class="blist">${s.sub.map(x => `<li style="margin-left:${(x.d - 1) * 16}px">${esc(x.t)}</li>`).join('')}</ul>` : ''}</span></label></div>`;
    }).join('');
    $('#steps').onchange = e => { const cb = e.target; if (!cb.matches || !cb.matches('input[data-id]')) return; cb.checked ? prog.add(cb.dataset.id) : prog.delete(cb.dataset.id); save(); refresh(); };
    refresh();
  };
  hide.onchange = () => { localStorage.qhide = hide.checked ? '1' : '0'; refresh(); };
  $('#reset').onclick = () => { if (confirm('Clear all ticks for this quest?')) { prog.clear(); save(); refresh(); } };
  draw();
}

/* ---------- about ---------- */
async function aboutView() {
  const m = await get('data/meta.json');
  const cc = Object.entries(m.clue_counts).map(([t, o]) => `<tr><td>${esc(cap(t.replace('_', ' ')))}</td><td>${Object.entries(o).map(([k, v]) => `${TYPE_LABEL[k] || k} ${v}`).join(' · ')}</td></tr>`).join('');
  view.innerHTML = `<div class="panel parch"><h2>About this app</h2>
    <p><b>Made by <span class="nx-poison" data-text="Dev. Soy Yoda">Dev. Soy Yoda</span>.</b></p>
    <p><b>Unofficial fan-made tool.</b> All images and game content are the property of Jagex Ltd. RuneScape is a trademark of Jagex Ltd.
    This is an unofficial, fan-made tool for personal use only. It is not affiliated with or endorsed by Jagex, and it is not for sale or for profit.</p>
    <p>Data and images come from the RuneScape Wiki (<a href="https://runescape.wiki" target="_blank" rel="noopener">runescape.wiki</a>), whose text is licensed
    <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener">CC BY-NC-SA 3.0</a>. This app re-uses an offline copy of that content, reformatted; mistakes in extraction are ours, not the wiki's.
    Fonts: Cinzel, Cinzel Decorative, Orbitron, Rajdhani, Inter and Fira Sans (SIL Open Font License).</p></div>
  <div class="panel"><h2>What's inside</h2><div class="kv">
    <b>Built</b><span>${esc(m.built)}</span><b>Monsters</b><span>${m.monsters.toLocaleString()}</span><b>Drop entries</b><span>${m.drop_entries.toLocaleString()}</span>
    <b>Items</b><span>${m.items.toLocaleString()} (${m.icons.toLocaleString()} with icons)</span><b>Clues</b><span>${m.clues.toLocaleString()}</span><b>Travel pages</b><span>${m.locations.toLocaleString()}</span>
    ${m.gear ? `<b>Gear</b><span>${m.gear.items.toLocaleString()} items · ${m.gear.with_stats.toLocaleString()} with stats · ${m.gear.with_requirements.toLocaleString()} with requirements · ${m.gear.with_price.toLocaleString()} with a GE price</span>` : ''}
    ${m.ge ? `<b>GE prices</b><span>${m.ge.prices.toLocaleString()} items, as of ${esc(m.ge.date)} (${esc(m.ge.source)})</span>` : ''}</div>
    <div class="note" style="margin-top:8px">Rarity bands follow the wiki's drop tables (Module:DropsLine): Always, Common ≥ 1/16, Uncommon ≥ 1/64, Rare ≥ 1/256, Very rare below that.</div>
    <table style="margin-top:10px"><thead><tr><th>Tier</th><th>Clue types</th></tr></thead><tbody>${cc}</tbody></table></div>
  <div class="panel"><h2>Known gaps</h2><ul>
    <li>Pictures come from the wiki pages themselves: ${(m.coverage.quest_pictures_total || 0).toLocaleString()} quest pictures (steps, start NPCs and places) and location maps, entrances and teleports for monsters. Steps the wiki shows no picture for get the place or NPC they mention, where the wiki has one.</li>
    <li>Wiki map views are interactive on the wiki; here they are still pictures (red dots mark spawns).</li>
    <li>${m.icons_missing.toLocaleString()} item icons and ${m.monster_images_missing} monster pictures were not downloaded yet; they show as a “?” box.</li>
    <li>${m.missing_location_pages} place pages were not in the copy yet, so some “how to get there” notes are missing.</li>
    <li>Not yet in the copy: ${esc(m.missing_clue_pages.join(', '))}.</li>
    <li>Nearest lodestone is a straight-line distance on the main map, not a walking route.</li></ul></div>
  <div class="panel"><h2>Pictures offline</h2><div class="note">Quest, place and entrance pictures load when you open them and are then kept for offline use. To keep every picture on this device now (best on Wi-Fi), tap below.</div>
    <div class="row" style="margin-top:8px"><button class="btn" id="saveall">Save all pictures for offline</button><span class="note" id="saveprog"></span></div></div>
  <div class="panel" id="updpanel" hidden><h2>Updates</h2><div class="note">This Windows program can update itself from the live app in one click. Only changed files are downloaded and each one is checked before it replaces the old copy.</div>
    <div class="row" style="margin-top:8px"><button class="btn" id="updcheck">Check for updates</button><span class="note" id="updver"></span></div></div>
  <div class="panel"><h2>Share with a clan mate</h2><div class="kv">
    <b>Web app</b><span><a href="${SHARE_URL}" target="_blank" rel="noopener">${SHARE_URL.replace('https://', '')}</a> <button class="btn sub nx-copy" data-copy="${SHARE_URL}">Copy</button></span>
    <b>Windows program</b><span><a href="${SHARE_PC}" rel="noopener">${SHARE_PC.replace('https://', '')}</a> <button class="btn sub nx-copy" data-copy="${SHARE_PC}">Copy</button></span>
    <b>Backup links</b><span><a href="https://theelonmuskrs3.github.io/dch/" target="_blank" rel="noopener">theelonmuskrs3.github.io/dch</a><br><a href="https://theelonmuskrs3.github.io/dch/pc/" rel="noopener">theelonmuskrs3.github.io/dch/pc</a></span></div>
    <div class="note" style="margin-top:8px">The web app opens in any browser (phone or PC) and can be installed from there. The Windows program is the same app in its own window, with one-click updates.</div></div>
  <div class="panel"><h2>Install</h2><ul>
    <li>Windows (Edge or Chrome): open the app, then use the install icon in the address bar, or menu → Apps → Install.</li>
    <li>Android (Chrome): menu → Add to Home screen / Install app.</li>
    <li>iPhone or iPad (Safari): Share → Add to Home Screen.</li>
    <li>After the first full load it works offline.</li></ul></div>`;
  if (LAUNCHER) { $('#updpanel').hidden = false; $('#updver').textContent = 'Installed version: ' + (LAUNCHER.current || 'unknown'); $('#updcheck').onclick = checkUpdates; }
  $('#saveall').onclick = async () => {
    const btn = $('#saveall'), out = $('#saveprog'); btn.disabled = true;
    try {
      const pc = await (await fetch('precache.json', {cache: 'no-store'})).json();
      const c = await caches.open('dch-' + pc.version); const list = pc.extra || []; let done = 0;
      out.textContent = `0 / ${list.length} (${pc.extra_mb} MB)`;
      for (let i = 0; i < list.length; i += 12) {
        await Promise.all(list.slice(i, i + 12).map(async f => { if (!(await c.match(f))) await c.add(f).catch(() => {}); }));
        done = Math.min(list.length, i + 12); out.textContent = `${done} / ${list.length} saved`;
      }
      out.textContent = `All ${list.length} pictures saved for offline use.`;
    } catch (e) { out.textContent = 'Could not save: ' + e.message; btn.disabled = false; }
  };
}

/* ---------- share link + install-as-app (header buttons) ---------- */
const SHARE_URL = 'https://is.gd/rs3dch', SHARE_PC = 'https://is.gd/rs3dchpc';
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
  try { const x = document.createElement('textarea'); x.value = t; x.style.position = 'fixed'; x.style.opacity = '0'; document.body.appendChild(x); x.select(); const ok = document.execCommand('copy'); x.remove(); return ok; } catch (e) { return false; }
}
function toast(msg) {
  let t = document.getElementById('nx-toast');
  if (!t) { t = document.createElement('div'); t.id = 'nx-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('on'), 3200);
}
let INSTALL_EVT = null;
(function initShare() {
  const sh = document.getElementById('nx-share');
  if (sh) sh.onclick = async () => {
    const data = {title: 'Drop & Clue Helper (unofficial RS3 fan tool)', text: 'RS3 drops, items, clues, quests and map from the RuneScape Wiki. Made by Dev. Soy Yoda.', url: SHARE_URL};
    if (navigator.share && matchMedia('(pointer:coarse)').matches) { try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    toast((await copyText(SHARE_URL)) ? 'Link copied: ' + SHARE_URL.replace('https://', '') + ' (send it to your clan mate)' : 'Share this link: ' + SHARE_URL);
  };
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('.nx-copy'); if (!b) return;
    toast((await copyText(b.dataset.copy)) ? 'Copied: ' + b.dataset.copy.replace('https://', '') : b.dataset.copy);
  });
  const ib = document.getElementById('nx-install');
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL_EVT = e; if (ib && !LAUNCHER) ib.hidden = false; });
  window.addEventListener('appinstalled', () => { INSTALL_EVT = null; if (ib) ib.hidden = true; toast('Installed. Open it from your apps or home screen.'); });
  if (ib) ib.onclick = async () => {
    if (!INSTALL_EVT) return; INSTALL_EVT.prompt();
    try { await INSTALL_EVT.userChoice; } catch (e) {} INSTALL_EVT = null; ib.hidden = true;
  };
  // inside the Windows program (frameless launcher) the download/install buttons are pointless
  if (typeof window.dchWin === 'function') { const dl = document.getElementById('nx-dl'); if (dl) dl.hidden = true; }
})();

/* ---------- one-click updater (only inside the Windows launcher) ---------- */
let LAUNCHER = null;
function updDialog(html) {
  let d = document.getElementById('upddlg');
  if (!d) { d = document.createElement('div'); d.id = 'upddlg'; d.innerHTML = '<div class="box"></div>'; document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target === d && !d.dataset.busy) d.hidden = true; }); }
  d.hidden = false; d.querySelector('.box').innerHTML = html; return d;
}
const mb = b => (b / 1e6 < 0.1 && b > 0 ? '<0.1' : (b / 1e6).toFixed(1)) + ' MB';
async function checkUpdates() {
  const d = updDialog('<h3>Check for updates</h3><div class="updmsg">Checking the live app…</div>');
  let r;
  try { r = await (await fetch('/__update/check', {cache: 'no-store'})).json(); } catch (e) { r = {error: e.message}; }
  const close = '<button class="btn ghost" id="updclose">Close</button>';
  if (r.error) updDialog(`<h3>Check for updates</h3><div class="updmsg">Couldn't check right now: ${esc(r.error)}<br>Make sure you're online and try again.</div><div class="row">${close}</div>`);
  else if (r.up_to_date) updDialog(`<h3>Up to date</h3><div class="updmsg">You have the latest version (<b>${esc(r.latest)}</b>).</div><div class="row">${close}</div>`);
  else {
    const n = r.changed_count + (r.removed_count || 0);
    updDialog(`<h3>Update available</h3><div class="updmsg">Update available: <b>${n.toLocaleString()} file${n === 1 ? '' : 's'}, ${mb(r.bytes)}</b><br><span class="note">${r.current === r.latest ? 'Some files differ from the live version; this repairs them.' : `Installed ${esc(r.current)} → latest ${esc(r.latest)}`}</span></div>
      <div class="row"><button class="btn" id="updnow">Update now</button>${close}</div>`);
    $('#updnow').onclick = applyUpdate;
  }
  const c = document.getElementById('updclose'); if (c) c.onclick = () => { d.hidden = true; };
}
async function applyUpdate() {
  const d = updDialog('<h3>Updating…</h3><div class="updmsg" id="updtxt">Starting…</div><div class="updbar"><i id="updfill"></i></div><div class="note">Keep this window open.</div>');
  d.dataset.busy = '1';
  const tick = setInterval(async () => {
    try {
      const p = await (await fetch('/__update/progress', {cache: 'no-store'})).json();
      if (p.phase === 'download') { $('#updtxt').textContent = `Downloading ${p.done.toLocaleString()} / ${p.total.toLocaleString()} files (${mb(p.bytes)} of ${mb(p.total_bytes)})`;
        $('#updfill').style.width = (p.total_bytes ? 100 * p.bytes / p.total_bytes : 100 * p.done / Math.max(1, p.total)) + '%'; }
      else if (p.phase === 'install') { $('#updtxt').textContent = 'Installing…'; $('#updfill').style.width = '100%'; }
      else if (p.phase === 'checking') $('#updtxt').textContent = 'Checking files…';
    } catch (e) {}
  }, 500);
  let r;
  try { r = await (await fetch('/__update/apply', {method: 'POST', cache: 'no-store'})).json(); } catch (e) { r = {ok: false, error: e.message}; }
  clearInterval(tick); delete d.dataset.busy;
  if (!r.ok) { updDialog(`<h3>Update failed</h3><div class="updmsg">${esc(r.error || 'Unknown error')}<br>Your current version was left as it was.</div><div class="row"><button class="btn ghost" id="updclose">Close</button></div>`);
    $('#updclose').onclick = () => { document.getElementById('upddlg').hidden = true; }; return; }
  updDialog(`<h3>Updated</h3><div class="updmsg">Now on <b>${esc(r.version)}</b>. Reloading…</div>`);
  // drop the old service worker and its caches so every new file is used
  try { for (const g of await navigator.serviceWorker?.getRegistrations?.() || []) await g.unregister(); } catch (e) {}
  try { for (const k of await caches.keys()) if (k.startsWith('dch-')) await caches.delete(k); } catch (e) {}
  setTimeout(() => location.reload(), 600);
}
async function detectLauncher() {
  try {
    const r = await fetch('/__update/info', {cache: 'no-store'});
    if (!r.ok) return;
    const j = await r.json(); if (!j.launcher) return;
    LAUNCHER = j; document.documentElement.classList.add('nx-launcher'); const dl = $('#nx-dl'); if (dl) dl.hidden = true; const ib = $('#nx-install'); if (ib) ib.hidden = true; const b = $('#updbtn'); b.hidden = false; b.onclick = checkUpdates;
    const p = document.getElementById('updpanel');
    if (p) { p.hidden = false; $('#updver').textContent = 'Installed version: ' + (j.current || 'unknown'); $('#updcheck').onclick = checkUpdates; }
  } catch (e) {}
}

/* ---------- boot ---------- */
(async () => {
  try { const ic = await get('data/icons.json'); ICONS = ic.items || ic; EMOTES = ic.emotes || {}; GICONS = ic.gear || {}; SKICONS = ic.skills || {}; SKORDER = ic.skill_order || []; SKMAX = ic.skill_max || {}; SRCPICS = ic.sources || {}; } catch (e) { ICONS = {}; }
  route(); detectLauncher();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
