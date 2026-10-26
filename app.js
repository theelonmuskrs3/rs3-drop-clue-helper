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
/* safe JSON reads: storage is user-editable, so anything that is not the expected shape is ignored (never crash, never trust) */
const sjson = (st, k, dflt) => { try { const o = JSON.parse(st.getItem(k) || 'null'); return o && typeof o === 'object' && !Array.isArray(o) ? Object.assign({}, dflt, Object.fromEntries(Object.entries(o).filter(([a]) => a !== '__proto__' && a in dflt))) : dflt; } catch (e) { return dflt; } };
/* images that fail to load: remove a broken reference picture, or swap a missing map icon for its glyph (replaces inline onerror attributes so the page can run under a strict Content-Security-Policy) */
// no browser/WebView autofill history for the search or level boxes
document.addEventListener('focusin', e => { const t = e.target; if (t && t.tagName === 'INPUT') t.setAttribute('autocomplete', 'off'); });
document.addEventListener('error', e => {
  const i = e.target; if (!i || i.tagName !== 'IMG') return;
  if (i.classList.contains('refimg')) { const f = i.closest('figure'); if (f) f.remove(); }
  else if (i.dataset && i.dataset.ph !== undefined) { const sp = document.createElement('span'); sp.className = 'ph'; sp.title = 'No picture on the RS3 wiki'; sp.textContent = i.dataset.ph; i.replaceWith(sp); }
}, true);
/* ---------- reference pictures (from the wiki, shown with the text they belong to; tap to enlarge) ---------- */
function fig(p, cls = '') {
  if (!p) return '';
  const [src, cap, w, h, kind] = p;
  return `<figure class="ref ${kind || ''} ${cls}"><img class="refimg" loading="lazy" decoding="async" src="${esc(src)}" ${w ? `width="${w}" height="${h}"` : ''} alt="${esc(cap)}" data-cap="${esc(cap)}">${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`;
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
function imapBtn(c, plane, mapID, label) {   // interactive wiki-tile map for a spawn point (mounted on tap)
  if (!c || c.length < 2) return '';
  return `<div class="imapbox"><button class="btn ghost" data-imap="${+c[0]},${+c[1]},${+plane || 0},${esc(String(mapID || '28'))}" data-lab="${esc(label || '')}">🗺 Open interactive map</button><div class="imap" hidden></div></div>`;
}
async function mountImap(b) {
  const host = b.nextElementSibling; if (!host) return;
  if (!host.hidden) { host.hidden = true; b.textContent = '🗺 Open interactive map'; return; }
  const [x, y, pl, mp] = b.dataset.imap.split(','); host.hidden = false; b.textContent = '🗺 Hide interactive map';
  if (host.dataset.m) return; host.dataset.m = 1;
  try {
    await mapData();
    const surf = mp === '28';
    if (!surf && !MT.tiles.packs[`${mp}/${(MT.idx.meta.surface.zooms || [1])[0]}/${pl}`] && !Object.keys(MT.tiles.packs).some(k => k.startsWith(mp + '/'))) { host.innerHTML = '<div class="note">The wiki has no map tiles for this area.</div>'; return; }
    const v = new TileView(host, surf ? {map: '28', plane: +pl, x: +x, y: +y, k: 2, height: 300} : {map: mp, plane: +pl, x: +x, y: +y, k: 4, height: 300, zooms: [1, 2], floors: false});
    v.setPins([{x: +x, y: +y, main: true, name: b.dataset.lab || 'Spawn'}]);
  } catch (e) { host.innerHTML = '<div class="note">Map could not load.</div>'; }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-imap]'); if (b) mountImap(b); });
function coordStr(c, plane) { return c ? `${c[0]}, ${c[1]}${plane ? ` (floor ${plane})` : ''}` : ''; }

/* ---------- tabs / routing ---------- */
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { location.hash = b.dataset.tab; });
function setTab(t) { document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); }
async function route() {
  const [tab, ...rest] = (location.hash.slice(1) || 'drops').split('/');
  let arg = ''; try { arg = rest.length ? decodeURIComponent(rest.join('/')) : ''; } catch (_) { arg = rest.join('/'); }
  setTab(tab); document.body.classList.toggle('intrain', tab === 'train');
  try {
    if (tab === 'items') await itemsView(arg);
    else if (tab === 'clues') await cluesView(arg);
    else if (tab === 'about') await aboutView();
    else if (tab === 'quests') await questsView(arg);
    else if (tab === 'secrets') await secretsView(arg);
    else if (tab === 'train') await trainView(arg);
    else if (tab === 'map') await mapTab(arg);
    else await dropsView(arg);
  } catch (e) { view.innerHTML = `<div class="panel">Could not load data: ${esc(e.message)}</div>`; }
  if (!(tab === 'secrets' && arg)) window.scrollTo(0, 0);
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
  $('#locs').innerHTML = (d.ml || []).length ? d.ml.map(l => mlBlock(l, d.locs)).join('') : d.locs.length ? d.locs.map(l => locBlock(l, travel)).join('') : '<div class="note">The wiki copy lists no spawn locations for this monster (it may be an instance, boss arena or event).</div>';
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
function mlBlock(l, locs) {
  const P = l.place || {};
  const sp = (locs || []).find(z => z.coords && z.loc === l.name);
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
    ${sp ? `<div class="note">Spawn coordinates: ${coordStr(sp.coords, sp.plane)}${sp.mapID && sp.mapID !== '28' ? ` · separate map area (map ${esc(sp.mapID)})` : ''}</div>${imapBtn(sp.coords, sp.plane, sp.mapID, l.name)}` : ''}
    <div style="display:grid;gap:8px;margin-top:4px">${parts.join('')}</div></div>`;
}
function locBlock(l, travel) {
  return `<div style="padding:8px 0;border-bottom:1px solid #ffffff12">
    <div class="row"><b style="font-family:var(--head);color:var(--gold2)">${esc(l.loc || 'Unknown location')}</b>
    ${l.levels ? `<span class="tag">Lvl ${esc(l.levels)}</span>` : ''}${l.members ? '<span class="tag">Members</span>' : ''}${l.spawns ? `<span class="tag">${l.spawns} spawns</span>` : ''}</div>
    ${l.coords ? `<div class="note">Spawn coordinates: ${coordStr(l.coords, l.plane)}${l.mapID && l.mapID !== '28' ? ` · separate map area (map ${esc(l.mapID)})` : ''}</div>${imapBtn(l.coords, l.plane, l.mapID, l.loc)}` : ''}
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
  return `<div class="row subnav">${b('#items', 'Search · rarity · prices', 'search')}${b('#items/~stats', 'My stats → gear', 'stats')}${b('#items/~sets', 'Best sets (wiki)', 'sets')}${b('#items/~obtain', 'Obtainable · worth money · cosmetics', 'obtain')}${b('#items/~disc', 'Discontinued', 'disc')}${b('#items/~all', '🔎 Search all items', 'all')}</div>`;
}

/* ----- stats storage ----- */
/* Levels are saved only in this device's own localStorage (key below); nothing is sent anywhere. A device with nothing saved starts at the
   neutral RS3 starting levels: every skill 1, Constitution 10 (wiki: Constitution starts at level 10). */
const STATS_KEY = 'mystats_v2';
function neutralStats() { const o = {}; for (const k of new Set([...SKORDER, ...MAIN_SKILLS])) o[k] = 1; o.Constitution = 10; return o; }
/* validate saved levels: integer, 1..skill max (wiki). Skills missing from storage fall back to the neutral start. Returns null if nothing usable. */
function cleanStats(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = neutralStats(); let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (!/^[A-Za-z' ]{2,24}$/.test(k) || k === '__proto__') continue;
    const x = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d{1,4}\s*$/.test(v) ? +v : NaN;
    if (!Number.isFinite(x)) continue;
    out[k] = Math.max(1, Math.min(skMax(k), Math.floor(x))); n++;
  }
  return n ? out : null;
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
let STATS_SAVED = false;   /* true once this device has saved levels */
function loadStats() {
  for (const key of [STATS_KEY, STATS_KEY + '_bak']) {
    const raw = lsGet(key); if (!raw) continue;
    let o = null; try { o = JSON.parse(raw); } catch (e) {}
    const c = cleanStats(o && o.levels ? o.levels : o);
    if (c) { STATS_SAVED = true; return c; }
    try { localStorage.setItem(key + '_corrupt', raw.slice(0, 4000)); } catch (e) {}   /* keep the bad value for inspection, never crash */
  }
  try { localStorage.removeItem('mystats'); } catch (e) {}
  return neutralStats();
}
/* saving: debounced after each change, and flushed right away on blur / tab hidden / page hide / close so nothing typed is lost */
let _stSave = null, _stDirty = null, _stBind = false;
function statsFlush() {
  clearTimeout(_stSave); _stSave = null;
  if (!_stDirty) return true;
  const s = _stDirty; _stDirty = null;
  const j = JSON.stringify({v: 2, t: Date.now(), levels: s});
  try { localStorage.setItem(STATS_KEY, j); localStorage.setItem(STATS_KEY + '_bak', j); STATS_SAVED = true; welcomeBanner(); statsBadge(true); return true; }
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
/* first-run prompt: shown only while this device has no saved levels (and until dismissed) */
function welcomeBanner() {
  let b = document.getElementById('welcome');
  const dismissed = lsGet('dch-welcome') === '1';
  if (STATS_SAVED || dismissed) { if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('div'); b.id = 'welcome'; b.className = 'welcome'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Welcome');
  b.innerHTML = '<span><b>Welcome!</b> Enter your own skill levels so the gear and quest helpers fit <i>your</i> account. They are saved only on this device; nothing is sent anywhere.</span><a class="btn" href="#items/~stats">Enter my levels</a><button class="btn ghost" type="button" id="welx" aria-label="Dismiss">Later</button>';
  const m = document.getElementById('view'); m.parentNode.insertBefore(b, m);
  document.getElementById('welx').onclick = () => { try { localStorage.setItem('dch-welcome', '1'); } catch (e) {} b.remove(); };
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
    <div class="row" style="margin-top:8px"><button class="btn ghost" data-all="1">All 1</button><button class="btn ghost" data-all="max">All max</button><button class="btn ghost" data-all="start" title="Every skill 1, Constitution 10 (the RS3 starting levels)">Reset to starting levels</button><span id="stsaved" class="stsaved on idle" aria-live="polite">Saved ✓</span>
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
  const opt = sjson(sessionStorage, 'gearopt', {style: 'melee', mode: 'pvm', slot: '', sort: 'tier', hideDung: true, hideRec: true, hideRst: true, trade: false, more: 0});
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
      ? `Picks come from the wiki's <a href="${WIKI(recPage)}" target="_blank" rel="noopener noreferrer">${esc(recPage)}</a> tables: for each slot, the highest-tier entry whose requirements you meet. A slot the wiki table has nothing for at your levels falls back to a stat rule (marked). Two-handed and main-hand + off-hand are shown side by side; use one or the other.`
      : `Head, body and legs: the piece with the most PvP damage reduction you can wear, worked out with the wiki's Armour page formula. Other slots: the wiki has no PvP-specific picks, so the PvM pick or the stat rule is shown, and it says so.`}</div>
      <div style="overflow-x:auto"><table><thead><tr><th>Slot</th><th>Item</th><th>Tier</th><th>Stats (wiki)</th><th>Price</th><th>Why</th></tr></thead><tbody>
      ${bs.map(x => `<tr><td>${esc(SLOT_LABEL[x.slot])}</td><td><a class="item" href="#items/${encodeURIComponent(x.g.n)}">${icon(x.g.n)}<span>${esc(x.g.n)}</span></a></td><td class="num">${x.g.tier ?? ''}</td>
        <td>${esc(keyStat(x.g, st))}</td><td class="num">${priceTag(D, x.g.n)}</td><td class="why">${esc(x.why)}${x.src ? ` <a class="note" href="${WIKI(x.src)}" target="_blank" rel="noopener noreferrer">[wiki]</a>` : ''}${x.note ? `<div class="note">${esc(x.note).replace(/\n/g, '<br>')}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="note">Nothing to show.</td></tr>'}
      </tbody></table></div><div class="note" style="margin-top:6px">Total GE value of the listed pieces: ${gp(total)} (untradeables count as 0; both weapon options are included). Prices as of ${esc(D.pr.date)} (${esc(geDateET(D))}).</div>
      ${opt.mode === 'pvp' ? `<div class="quotes">${q.filter(x => /PvP/.test(x.text) || x.page === 'Player versus player').map(x => `<blockquote>“${esc(x.text)}” <a href="${WIKI(x.page)}" target="_blank" rel="noopener noreferrer">— ${esc(x.page)}</a></blockquote>`).join('')}
        <div class="note">PvP-type armour sets on the wiki's Armour page: ${D.gd.armour_sets.filter(s => s.type === 'PvP' && s.styles.includes(STYLES[st])).map(s => `<a href="${WIKI(s.set)}" target="_blank" rel="noopener noreferrer">${esc(s.set)}</a> (level ${s.level})${lv(S, 'Defence') >= s.level ? ' ✓' : ''}`).join(', ') || 'none for this style'}. ✓ = your Defence is at least that level.</div></div>`
      : `<div class="quotes">${q.filter(x => x.page === 'Recommended equipment for PvM').map(x => `<blockquote>“${esc(x.text)}” <a href="${WIKI(x.page)}" target="_blank" rel="noopener noreferrer">— ${esc(x.page)}</a></blockquote>`).join('')}</div>`}`;
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
  view.querySelectorAll('button[data-all]').forEach(b => b.onclick = () => { const a = b.dataset.all; if (a === 'start' && !confirm('Reset all your levels to the starting levels (every skill 1, Constitution 10)? This replaces the levels saved on this device.')) return; view.querySelectorAll('input[data-sk]').forEach(i => { const k = i.dataset.sk, v = a === 'max' ? skMax(k) : a === 'start' ? (k === 'Constitution' ? 10 : 1) : +a; i.value = v; S[k] = v; }); saveStats(S); statsFlush(); totals(); draw(); });
  draw();
}
async function setsView() {
  const D = await itemData(); const S = loadStats();
  const opt = sjson(sessionStorage, 'setopt', {style: 'melee', type: ''}); { const pf = loadPrefs(); if (pf.style) opt.style = pf.style; }
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
    $('#out').innerHTML = `<h3>Wiki recommended PvM equipment</h3><div class="note">From <a href="${WIKI(rec.page)}" target="_blank" rel="noopener noreferrer">${esc(rec.page)}</a>, in the wiki's order (lowest tier first). ✓ = you meet the item's requirements with your saved levels; ✗ = you don't yet; ? = the item page has no stats in the copy.</div>
      ${Object.entries(tabs).map(([t, rows]) => `<details ${/Weapons|Armour/.test(t) ? 'open' : ''}><summary>${esc(t)} <span class="note">(${rows.length})</span></summary><div style="overflow-x:auto"><table><thead><tr><th>Tier</th><th>Items</th><th>Price</th><th>Notes (wiki)</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td class="num">${r.tier ?? (r.style_bonus != null ? `bonus ${r.style_bonus}` : '')}${r.tier_note ? '*' : ''}</td>
          <td>${r.items.map(n => { const o = ok(n); return `<div><a class="item" href="#items/${encodeURIComponent(n)}">${icon(n)}<span>${esc(n)}</span></a> ${o == null ? '<span class="note">?</span>' : o ? '<span class="ok">✓</span>' : '<span class="no">✗</span>'}</div>`; }).join('')}</td>
          <td class="num">${r.items.map(n => `<div>${priceTag(D, n)}</div>`).join('')}</td><td class="note">${esc(r.note).replace(/\n/g, '<br>')}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}
      <h3 style="margin-top:14px">Armour sets by type (wiki Armour page)</h3><div class="chips" id="typ"><button data-v="">All types</button>${types.map(t => `<button data-v="${t}">${t}</button>`).join('')}</div>
      <div class="note" style="margin:6px 0">${esc((D.gd.pvp_quotes.find(x => /^In general players should choose/.test(x.text)) || {}).text || '')}</div>
      <div style="overflow-x:auto"><table><thead><tr><th>Set</th><th>Level</th><th>Type</th><th>Styles</th><th>You</th></tr></thead><tbody>
      ${sets.map(s => `<tr><td><a href="${WIKI(s.set)}" target="_blank" rel="noopener noreferrer">${esc(s.set)}</a>${s.note ? ` <span class="note">${esc(s.note)}</span>` : ''}</td><td class="num">${s.level ?? ''}</td><td>${esc(s.type)}</td><td>${esc(s.styles.join(', '))}</td>
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
  if (name === '~disc') return discView();
  if (name === '~all') return allView();
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
    <div id="wtg"></div>
    ${d ? `<h3>Item info <a class="note" href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">[wiki: ${esc(page)}]</a></h3>${infoTable(d)}${obtainNote(d)}` : `<div class="note" style="margin-top:6px"><a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">Open “${esc(page)}” on the RS3 wiki</a></div>`}
    ${g ? `<h3>Equipment stats <a class="note" href="${WIKI(g.p)}" target="_blank" rel="noopener noreferrer">[wiki: ${esc(g.p)}]</a></h3>${statTable(g)}` : ''}
    ${src.length ? `<h3>Drops</h3><div class="note" style="margin:6px 0 10px">Dropped by ${src.length} source${src.length === 1 ? '' : 's'}, best chance first.</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Dropped by</th><th>Qty</th><th>Rarity</th></tr></thead><tbody>
    ${src.map(s => `<tr><td>${s[5] ? `<a class="item" href="#drops/${encodeURIComponent(s[0])}">${mthumb(s[0], 32)}<span>${esc(s[0])}</span></a>` : `<span class="item">${SRCPICS[s[0]] ? `<img class="ico" style="width:32px;height:32px" loading="lazy" src="${esc(SRCPICS[s[0]])}" alt="">` : PH('◆')}<span>${esc(s[0])} <span class="tag">other source</span></span></span>`}</td>
      <td>${esc(s[1])}</td><td class="num">${rarityCell(s[2], s[3], s[4])}</td></tr>`).join('')}</tbody></table></div>` : '<div class="note" style="margin-top:8px">Not in any drop table in the wiki copy.</div>'}</div>`;
    fillWtg($('#wtg'), D, name, page, src).catch(e => { const w = $('#wtg'); if (w) w.innerHTML = `<div class="note">Could not load source data: ${esc(e.message)}</div>`; });
    return;
  }
  const o = sjson(sessionStorage, 'iopt', {q: '', rar: '', show: 'all', slot: '', sort: 'match', tr: '', mem: '', fl: ''});
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
  const o = sjson(sessionStorage, 'obopt', {mode: 'money', cat: '', q: '', tr: '', mem: '', eq: '', hol: '', rar: '', only: '', sort: ''});
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
  const how = r[2] ? `<blockquote class="obhow">“${esc(r[2])}”<cite>— RS3 wiki, <a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">${esc(page)}</a> (${esc(OB_SRC[r[3]] || r[3] + ' section')})</cite></blockquote>` : '<div class="note">The wiki page has no intro text; see the wiki link.</div>';
  const kv = [];
  if (x.sh) kv.push(['Sold by', x.sh.map(s => `${esc(s[0])}${s[1] ? ` (${/^\d+$/.test(s[1]) ? (+s[1]).toLocaleString() : esc(s[1])}${s[2] ? ' ' + esc(s[2]) : /^\d+$/.test(s[1]) ? ' coins' : ''})` : ''}`).join(', ') + (x.nsh > x.sh.length ? ` +${x.nsh - x.sh.length} more` : '')]);
  if (x.dr) kv.push(['Dropped by', x.dr.map(d => `${esc(d[0])}${d[1] ? ` <span class="${d[2] != null ? 'r' + Math.min(d[2], 4) : ''}">(${esc(d[1])})</span>` : ''}`).join(', ') + (x.nd > x.dr.length ? ` +${x.nd - x.dr.length} more` : '')]);
  if (x.rc) kv.push(['Made with', esc(x.rc) + (x.rf ? ` at ${esc(x.rf)}` : '')]);
  if (x.rq2) kv.push(['To wear', esc(x.rq2)]);
  return `<div class="obcard ${r[1] & OB.bits.dragon ? 'drg' : ''}">${obPic(x, n)}<div class="obbody"><div class="obtitle"><a href="#items/${encodeURIComponent(n)}">${esc(n)}</a>${b ? rarTag(b[0]) : ''}</div>
    <div class="obprice">${v != null ? `<span class="gp">${gp(v)}</span>` : f & F.untr ? '<span class="untr">Untradeable</span>' : '<span class="note">no GE price</span>'}${fl ? ` <span class="note">${fl}</span>` : ''}</div>
    <div class="obtags">${tags.join('')}</div>${x.why ? discNote(x) : ''}${gStat(x.g)}${how}${kv.length ? `<div class="kv obkv">${kv.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('')}</div>` : ''}
    <div class="note"><a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">Open on the RS3 wiki ↗</a></div></div></div>`;
}

/* ---------- Discontinued: items the RS3 wiki itself marks discontinued / currently unobtainable / deleted / removed (data/obdisc.json) ----------
   These are the entries left out of Obtainable. Release / removal dates, the marker template and "re-released" are quoted from the wiki page's own infobox. */
const WGRP = w => /unobtainable/i.test(w) ? 'unob' : /discontinued/i.test(w) ? 'disc' : 'del';
const WGLAB = {unob: 'Unobtainable', disc: 'Discontinued', del: 'Deleted / removed / hidden'};
const MONTHS = {january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11};
function relDate(t) {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(t || ''); if (m && MONTHS[m[2].toLowerCase()] != null) return Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  const y = /\b(\d{4})\b/.exec(t || ''); return y ? Date.UTC(+y[1], 0, 1) : 0;
}
function discNote(x) {
  const g = WGRP(x.why), L = [];
  L.push(`<span class="tag warn">${esc(WGLAB[g])}</span> <span class="note">wiki marker: “${esc(x.why)}”</span>`);
  const kv = [];
  if (x.rel) kv.push(['Released', esc(x.rel)]);
  if (x.rem) kv.push(['Removed', esc(x.rem)]);
  if (x.rr) kv.push(['Re-released', x.rr === 'yes' ? 'yes, at some point (wiki infobox)' : x.rr === 'no' ? 'no (wiki infobox)' : esc(x.rr)]);
  if (x.rs) kv.push(['Wiki restriction', esc(x.rs)]);
  return `<div class="obdisc">${L.join('')}${kv.length ? `<div class="kv obkv">${kv.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('')}</div>` : ''}</div>`;
}
async function discView() {
  const [D, OB] = await Promise.all([itemData(), get('data/obdisc.json')]);
  const B = OB.bits, F = D.FL;
  const o = sjson(sessionStorage, 'dcopt', {q: '', cat: '', g: '', pr: '', tr: '', mem: '', eq: '', hol: '', rar: '', sort: 'price'});
  const name = r => D.ia.rows[r[0]][0];
  const cnt = {}; OB.rows.forEach(r => { for (const [c] of OB.cats) if (r[1] & B[c]) cnt[c] = (cnt[c] || 0) + 1; });
  const nPrice = OB.rows.filter(r => D.ia.rows[r[0]][2] != null).length, nRel = OB.rows.filter(r => r[4].rel).length, nRem = OB.rows.filter(r => r[4].rem).length;
  const gc = {unob: 0, disc: 0, del: 0}; OB.rows.forEach(r => { gc[WGRP(r[4].why)]++; });
  const pics = OB.rows.filter(r => r[4].pic && D.ia.rows[r[0]][2] != null).sort((a, b) => D.ia.rows[b[0]][2] - D.ia.rows[a[0]][2]).slice(0, 3);
  OB.rows.forEach(r => { r[5] = relDate(r[4].rel); r[6] = relDate(r[4].rem); });
  view.innerHTML = `${subnav('disc')}<div class="panel obpanel"><div class="obhero"><div class="obhpics">${pics.map(r => obPic(r[4], name(r), 'obhpic')).join('')}</div><div><h2>Discontinued items</h2>
    <div class="note">${OB.rows.length.toLocaleString()} items and cosmetics the RS3 wiki itself marks gone: ${gc.unob.toLocaleString()} “unobtainable”, ${gc.disc.toLocaleString()} “discontinued”, ${gc.del.toLocaleString()} deleted / removed / hidden or with a removal date. Partyhats, Santa hats, Halloween masks, holiday and event items live here. They are the entries left out of Obtainable. ${nRel.toLocaleString()} have a release date and ${nRem.toLocaleString()} a removal date on the wiki; ${nPrice.toLocaleString()} have a Grand Exchange price (${esc(D.pr.date)}). Everything shown is the wiki's own wording (${esc(OB.snap)} copy).</div></div></div>
    ${searchBox('q', 'Search discontinued items, e.g. red partyhat, santa, h\'ween mask, easter…', o.q)}
    <div class="chips" id="cat"><button data-v="">All categories</button>${OB.cats.map(([c, l]) => `<button data-v="${c}">${esc(l)} <span class="cnt">${(cnt[c] || 0).toLocaleString()}</span></button>`).join('')}</div>
    <div class="chips" id="rar"><button data-v="">Any rarity</button>${RANK.map((r, i) => `<button data-v="${i}" class="r${i}">${r}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px">
    <select id="g"><option value="">Any wiki marker</option><option value="unob">Unobtainable</option><option value="disc">Discontinued</option><option value="del">Deleted / removed / hidden</option></select>
    <select id="pr"><option value="">With or without a GE price</option><option value="yes">Has a GE price</option><option value="no">No GE price</option></select>
    <select id="tr"><option value="">Tradeable or not</option><option value="trade">Tradeable (GE)</option><option value="untr">Untradeable</option></select>
    <select id="mem"><option value="">Members &amp; free</option><option value="mem">Members</option><option value="f2p">Free-to-play</option></select>
    <select id="eq"><option value="">Equipable or not</option><option value="equip">Equipable / wearable</option></select>
    <select id="hol"><option value="">Holiday &amp; normal</option><option value="holiday">Holiday / event items only</option></select>
    <select id="sort"><option value="price">GE price, high → low</option><option value="pricel">GE price, low → high</option><option value="name">Name A–Z</option><option value="rare">Rarest drop first</option><option value="reln">Released: newest first</option><option value="relo">Released: oldest first</option><option value="remn">Removed: newest first</option></select></div>
    <div id="obres"></div></div>`;
  const q = $('#q'), out = $('#obres');
  ['g', 'pr', 'tr', 'mem', 'eq', 'hol', 'sort'].forEach(k => { $('#' + k).value = o[k]; });
  const best = r => { const b = D.best[name(r)]; return b ? b[0] : null; };
  let lim = 48;
  const draw = () => {
    o.q = q.value; sessionStorage.dcopt = JSON.stringify(o);
    document.querySelectorAll('#cat button').forEach(b => b.classList.toggle('on', b.dataset.v === o.cat));
    document.querySelectorAll('#rar button').forEach(b => b.classList.toggle('on', b.dataset.v === String(o.rar)));
    const nq = norm(q.value);
    let L = [];
    for (const r of OB.rows) {
      const ir = D.ia.rows[r[0]], n = ir[0], f = ir[3], x = r[4];
      if (o.cat && !(r[1] & B[o.cat])) continue;
      if (o.g && WGRP(x.why) !== o.g) continue;
      if (o.pr === 'yes' && ir[2] == null) continue;
      if (o.pr === 'no' && ir[2] != null) continue;
      if (o.tr === 'trade' && !(f & F.trade || ir[2] != null)) continue;
      if (o.tr === 'untr' && !(f & F.untr)) continue;
      if (o.mem && !(f & F[o.mem])) continue;
      if (o.eq && !(f & F.equip)) continue;
      if (o.hol === 'holiday' && !(f & F.holiday || r[1] & B.event)) continue;
      if (o.rar !== '' && best(r) !== +o.rar) continue;
      let s = 0;
      if (nq) { s = score(n, nq); if (s < 0) { if (!norm(ir[4] || '').includes(nq) && !norm(r[2]).includes(nq)) continue; s = -50; } }
      L.push([s, r]);
    }
    const P = r => D.ia.rows[r[0]][2];
    const tie = (a, b) => (b[4].pic ? 1 : 0) - (a[4].pic ? 1 : 0) || name(a).localeCompare(name(b));
    const cmp = {price: (a, b) => (P(b) ?? -1) - (P(a) ?? -1) || tie(a, b), pricel: (a, b) => (P(a) ?? 1e15) - (P(b) ?? 1e15) || tie(a, b), name: (a, b) => name(a).localeCompare(name(b)),
      rare: (a, b) => (best(b) ?? -1) - (best(a) ?? -1) || (P(b) ?? -1) - (P(a) ?? -1) || tie(a, b),
      reln: (a, b) => b[5] - a[5] || tie(a, b), relo: (a, b) => (a[5] || 9e15) - (b[5] || 9e15) || tie(a, b), remn: (a, b) => b[6] - a[6] || tie(a, b)}[o.sort] || ((a, b) => tie(a, b));
    L.sort((a, b) => (nq ? b[0] - a[0] : 0) || cmp(a[1], b[1]));
    const tradeN = L.filter(([, r]) => P(r) != null).length;
    if (!L.length) { out.innerHTML = '<div class="obempty"><div><b>No discontinued items match.</b><div class="note">Try another word or loosen a filter. To look through every item of the wiki use “Search all items”.</div></div></div>'; return; }
    out.innerHTML = `<div class="note" style="margin:8px 0">${L.length.toLocaleString()} item${L.length === 1 ? '' : 's'} (${tradeN.toLocaleString()} with a GE price${tradeN ? `, GE ${esc(D.pr.date)}` : ''})${L.length > lim ? `, showing ${lim}` : ''}.</div>
      <div class="obgrid">${L.slice(0, lim).map(([, r]) => obCard(D, OB, r)).join('')}</div>${L.length > lim ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="more">Show more</button></div>' : ''}`;
    const m = $('#more'); if (m) m.onclick = () => { lim += 96; draw(); };
  };
  let tmr = null;
  q.oninput = () => { clearTimeout(tmr); lim = 48; tmr = setTimeout(draw, 150); };
  const reset = () => { lim = 48; draw(); };
  document.querySelectorAll('#cat button').forEach(b => b.onclick = () => { o.cat = o.cat === b.dataset.v ? '' : b.dataset.v; reset(); });
  document.querySelectorAll('#rar button').forEach(b => b.onclick = () => { o.rar = b.dataset.v; reset(); });
  ['g', 'pr', 'tr', 'mem', 'eq', 'hol', 'sort'].forEach(k => { $('#' + k).onchange = e => { o[k] = e.target.value; reset(); }; });
  draw();
}

/* ---------- Search all items: ignores every filter, category and section; searches all rows of data/iall.json (every wiki item entry) ---------- */
async function allView() {
  const D = await itemData();
  const rows = D.ia.rows, TOT = rows.length;
  if (!D.nameN) { D.nameN = rows.map(r => norm(r[0])); D.nameC = D.nameN.map(n => n.replace(/ /g, '')); D.pageN = rows.map(r => r[4] ? norm(r[4]) : ''); }
  const F = D.FL;
  let sq = ''; try { sq = sessionStorage.alq || ''; } catch (e) {}
  view.innerHTML = `${subnav('all')}<div class="panel"><h2>Search all items</h2>
    ${searchBox('q', 'Any item, any state: e.g. red partyhat, h\'ween mask, abyssal whip, a quest item, a Daemonheim item…', sq)}
    <div class="row" style="margin-top:6px"><button class="btn ghost" id="clr">Clear</button><span class="note">No filters apply here: every one of the ${TOT.toLocaleString()} entries of the RS3 wiki item list is searched, including Daemonheim-only, quest-only, discontinued, cosmetic-override, untradeable and no-GE-price items. Names, the wiki page title and the wiki's own redirects (alternative names) are matched.</span></div>
    <div class="note" id="cnt" style="margin:8px 0"></div><div id="res" class="list"></div><div id="more"></div></div>`;
  const q = $('#q'), out = $('#res'), cnt = $('#cnt'), more = $('#more');
  let hits = [], lim = 60, seq = 0;
  const run = async () => {
    const my = ++seq, nq = norm(q.value); try { sessionStorage.alq = q.value; } catch (e) {}
    lim = 60;
    if (!nq) { hits = []; cnt.textContent = `Type to search all ${TOT.toLocaleString()} items.`; out.innerHTML = ''; more.innerHTML = ''; return; }
    const qc = nq.replace(/ /g, ''), tk = nq.split(' ').filter(Boolean), M = new Map(), N = D.nameN, PN = D.pageN;
    const has = (s, t) => s.includes(t);
    for (let i = 0; i < TOT; i++) {
      const n = N[i]; let sc = -1;
      if (n === nq) sc = 1000;
      else if (n.startsWith(nq)) sc = 800 - n.length / 100;
      else {
        let ok = true, ws = 0;
        for (const t of tk) { const k = n.indexOf(t); if (k < 0) { ok = false; break; } if (k === 0 || n[k - 1] === ' ') ws++; }
        if (ok) sc = 300 + ws * 20 - n.length / 100;
        else if (qc.length >= 4 && D.nameC[i].includes(qc)) sc = 200 - n.length / 100;
        else if (PN[i]) { ok = tk.every(t => has(PN[i], t)); if (ok) sc = 150 - PN[i].length / 100; }
      }
      if (sc >= 0) M.set(i, sc);
    }
    if (nq.length >= 2) {   // the wiki's redirects ("h'ween mask", "phat", misspellings) from the alias shard of the first letter
      const c0 = nq[0]; let A = D.alias[c0];
      if (A === undefined) { try { A = D.alias[c0] = await get(`data/ia/${c0}.json`); } catch (e) { A = D.alias[c0] = []; } if (my !== seq) return; }
      if (A) for (const [a, ids] of A) { if (!tk.every(t => a.includes(t))) continue; const sc = (a === nq ? 700 : a.startsWith(nq) ? 450 : 100) - a.length / 100; for (const i of ids) if (!M.has(i) || M.get(i) < sc) M.set(i, sc); }
    }
    hits = [...M.entries()].sort((a, b) => b[1] - a[1] || N[a[0]].localeCompare(N[b[0]]) || a[0] - b[0]).map(h => h[0]);
    draw();
  };
  const rowTags = r => { const f = r[3], t = [];
    if (f & F.override) t.push('Cosmetic override'); if (f & F.holiday) t.push('Holiday item'); if (f & F.disc) t.push('Discontinued'); else if (f & F.limited) t.push('Limited time');
    if (f & F.quest) t.push('Quest item'); if (f & F.removed) t.push('Removed from game'); return t.map(x => `<span class="tag">${x}</span>`).join(''); };
  const draw = () => {
    cnt.textContent = hits.length ? `${hits.length.toLocaleString()} of ${TOT.toLocaleString()} entries match${hits.length > lim ? ` · showing ${lim}` : ''}.` : `No entries match in all ${TOT.toLocaleString()} items.`;
    out.innerHTML = hits.slice(0, lim).map(i => {
      const r = rows[i], n = r[0], pg = r[4] || n;
      const pic = r[1] ? `<img class="ico" loading="lazy" decoding="async" src="${esc(r[1])}.webp" alt="">` : PH('✦');
      const price = r[2] != null ? `<span class="gp">${gp(r[2])}</span>` : r[3] & F.untr ? '<span class="untr">Untradeable</span>' : '<span class="note">no GE price</span>';
      return `<div class="allrow"><a class="hit" href="#items/${encodeURIComponent(n)}">${pic}<span>${esc(n)}${pg !== n ? ` <span class="note">(wiki page: ${esc(pg)})</span>` : ''}${rowTags(r)}</span><span class="meta">${price}</span></a><a class="allwiki" href="${WIKI(pg)}" target="_blank" rel="noopener noreferrer" title="Open on the RS3 wiki">wiki ↗</a></div>`;
    }).join('');
    more.innerHTML = hits.length > lim ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="mb">Show more</button></div>' : '';
    const mb = $('#mb'); if (mb) mb.onclick = () => { lim += 100; draw(); };
  };
  let tmr = null;
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(run, 120); };
  $('#clr').onclick = () => { q.value = ''; run(); q.focus(); };
  run(); q.focus();
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
  const st = sjson(sessionStorage, 'cq', {q: '', tier: '', type: ''});
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
const qProg = id => { try { const a = JSON.parse(localStorage.getItem(QKEY(id)) || '[]'); return new Set(Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.length < 64) : []); } catch (e) { return new Set(); } };
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
  const st = sjson(sessionStorage, 'qf', {q: '', kind: '', mem: '', diff: ''});
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
  ${isH ? `<div class="panel"><h2>All ${q.index.length} tasks</h2><div class="note">The wiki's own 25th Anniversary task list (tap a task to jump to its steps). Listed in order of the year they celebrate, 2001 to 2025. You can do them in any order. A tick means that task's steps are all ticked below.</div><div id="hidx" class="hidx"></div></div>` : ''}
  ${sec('Start', start)}${sec('Requirements', reqs)}
  ${sec('Items required', bulletList(q.items, true))}${sec('Recommended', bulletList(q.recommended, true))}${sec('Enemies to defeat', bulletList(q.kills))}
  ${q.steps && q.steps.length ? `<div class="panel"><h2>Walkthrough</h2>
    <div class="row"><div class="prog"><div id="bar"></div></div><span class="note" id="pct"></span>
    <label class="note"><input type="checkbox" id="hide"> Hide finished steps</label><button class="btn ghost" id="reset">Reset progress</button></div>
    <div class="note" style="margin:6px 0">${isH ? "Built only from the wiki: the 25th Anniversary task list page (task text, items, requirements) and the wiki's Hans transcript for the dialogue menus where you must pick a specific option (marked \u201cChoose option\u201d). The wiki has no separate walkthrough page for these tasks, so each one is: do what the task says, then the pop-up confirms it. Pictures are the wiki's own NPC and place pictures. Ticks are saved on this device only." : q.steps_source === 'quick guide' ? 'From the wiki quick guide.' : 'From the full wiki guide (no quick guide in this copy).'} Pictures are the wiki's own: images from the guide shown at the step they belong to, or the wiki picture of the place/NPC that step links to. Tap one to enlarge. Ticks are saved on this device only.</div>
    <div id="steps"></div></div>` : ''}
  ${(q.guide_pics || []).length ? `<div class="panel"><h2>More pictures from the wiki guide</h2><div class="note">These appear in the full wiki guide but don't clearly match one quick-guide step, so they are listed under the wiki's own section headings.</div>${q.guide_pics.map(g => `<h3 class="stepsec">${esc(g.sec)}</h3>${gallery(g.p)}`).join('')}</div>` : ''}
  ${sec('Rewards', bulletList(q.rewards) + (isH ? '<div class="note" style="margin-top:6px">The wiki lists no separate reward per task: the reward comes after all tasks are done and you speak to Hans again.</div>' : ''))}
  ${isH ? `<div class="panel"><h2>Wiki pages</h2><ul class="blist">${q.wiki_links.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join('')}</ul></div>` : ''}`;
  $('#qdone').onclick = () => { if (qIsDone(name)) localStorage.removeItem(QDONE(name)); else localStorage.setItem(QDONE(name), '1'); questDetail(name, qs); };
  if (!q.steps || !q.steps.length) return;
  const prog = qProg(row[10]);
  const save = () => localStorage.setItem(QKEY(row[10]), JSON.stringify([...prog]));
  const hide = $('#hide'); hide.checked = localStorage.qhide === '1';
  /* Render every step ONCE, then tick/untick in place. (Re-building the whole list on each tick re-created every picture, which made the
     page jump to a different place and flicker, worst on phones. Step ids are unchanged, so saved ticks keep working.) */
  const secOf = new Map(); q.steps.forEach(x => { if (!secOf.has(x.sec)) secOf.set(x.sec, []); secOf.get(x.sec).push(x); });
  const idxHtml = () => [...q.index].sort((a, b) => a.year - b.year).map(t => { const dn = secOf.get(`Task ${t.order} of 25: ${t.year} – ${t.name}`).every(x => prog.has(x.id)); return `<a class="hit ${dn ? 'qs-done' : ''}" data-go="${t.do}" href="#"><span class="${dn ? 'qs-done' : 'qs-none'}">${dn ? '✓ ' : ''}${t.order}. ${t.year} – ${esc(t.name)}</span><span class="meta">${esc(t.task)}</span></a>`; }).join('');
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
      else $('#hidx').querySelectorAll('a[data-go]').forEach(a => { const t = q.index.find(x => x.do === a.dataset.go); const dn = secOf.get(`Task ${t.order} of 25: ${t.year} \u2013 ${t.name}`).every(x => prog.has(x.id)); a.classList.toggle('qs-done', dn); const sp = a.firstElementChild; sp.className = dn ? 'qs-done' : 'qs-none'; sp.textContent = `${dn ? '\u2713 ' : ''}${t.order}. ${t.year} \u2013 ${t.name}`; });
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
/* ---------- Secrets: easter eggs & hidden interactions the RS3 wiki documents as still possible (data/secrets.json) ---------- */
const SEC = {kind: '', rw: false, quick: false};
const SEC_KL = {item: 'Item', title: 'Title', pet: 'Pet', cosmetic: 'Cosmetic', emote: 'Emote', none: 'Just for fun'};
function secReward(w) {
  const src = w.ic || w.ip;
  const img = src ? `<img class="ico" loading="lazy" src="${esc(src)}" alt="">` : PH('✦', 28);
  const nm = w.i ? `<a href="#items/${encodeURIComponent(w.i)}">${esc(w.n)}</a>` : `<span>${esc(w.n)}</span>`;
  const price = w.k !== 'item' || !w.i ? '' : w.ge != null ? `<span class="gp">${gp(w.ge)}</span>` : w.tr === 2 ? '<span class="untr">Untradeable</span>' : '<span class="note">no GE price</span>';
  return `<div class="wrow secrw">${img}${nm}<span class="tag">${SEC_KL[w.k] || w.k}</span>${price}</div>`;
}
function secMap(r, m) {
  const p = m.pins[0], o = {map: m.map, plane: m.plane || 0, x: p[0], y: p[1], pins: m.pins, label: m.l};
  return `<div class="wcard"><div class="wc-h"><b>${esc(m.l)}</b>${m.pins.length > 1 ? `<span class="tag">${m.pins.length} pins</span>` : ''}</div>
    <div class="note">Wiki coordinates: ${m.pins.slice(0, 6).map(c => coordStr(c, m.plane)).join(' · ')}${m.pins.length > 6 ? ` · +${m.pins.length - 6} more` : ''}${m.map !== '28' ? ` · map ${esc(m.map)}` : ''}</div>
    <div class="row wacts">${mmBtn(o, 'Find on map')}</div></div>`;
}
function secCard(r) {
  const tags = r.k.map(k => `<span class="tag">${SEC_KL[k]}</span>`).join('') + (r.x ? '<span class="tag warn">Ended</span>' : '') + (!r.rq.length ? '<span class="tag">No requirements</span>' : '') + (r.m ? '<span class="tag">Map pin</span>' : '');
  const img = r.p ? `<img class="secpic" loading="lazy" src="secimg/${esc(r.p)}.webp" alt="">` : PH('✦', 64);
  const rw = r.rw.length ? `<div class="wsec"><h4>Reward${r.rw.length === 1 ? '' : 's'}</h4>${r.rw.map(secReward).join('')}</div>` : '<div class="note secnorw">No reward. It is just for fun.</div>';
  const rq = r.rq.length ? `<div class="wsec"><h4>Requirements</h4><div class="secreq">${r.rq.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>` : '<div class="wsec"><h4>Requirements</h4><div class="note">None stated on the wiki.</div></div>';
  const list = r.l ? `<div class="tscroll"><table><thead><tr>${r.l.h.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${r.l.rows.map(x => `<tr>${x.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  return `<details class="sec${r.x ? ' secpast' : ''}" id="sec-${esc(r.id)}" data-id="${esc(r.id)}"><summary><div class="secpicw">${img}</div>
    <div class="sectxt"><b class="sect">${esc(r.t)}</b><span class="secd">${esc(r.d)}</span><span class="sectags">${tags}</span></div></summary>
    <div class="secbody">${rq}${rw}
      <div class="wsec"><h4>${r.x ? 'How it worked' : 'Steps'}</h4><ol class="secsteps">${r.s.map(s => `<li>${esc(s)}</li>`).join('')}</ol>${list}${r.tip ? `<div class="note">${esc(r.tip)}</div>` : ''}</div>
      ${r.m ? `<div class="wsec"><h4>Find on map</h4>${r.m.map(m => secMap(r, m)).join('')}<div class="note">Pins sit only at coordinates the RS3 wiki gives.</div></div>` : ''}
      <div class="note"><a href="${WIKI(r.w)}" target="_blank" rel="noopener noreferrer">Open on the RS3 wiki ↗</a></div></div></details>`;
}
async function secretsView(arg) {
  const S = await get('data/secrets.json'), all = S.rows, cur = all.filter(r => !r.x);
  const hay = all.map(r => norm([r.t, r.d, r.rq.join(' '), r.rw.map(w => w.n).join(' '), r.s.join(' '), r.l ? r.l.rows.map(x => x.join(' ')).join(' ') : '', r.k.map(k => SEC_KL[k]).join(' '), (r.m || []).map(m => m.l).join(' ')].join(' ')));
  const cnt = k => cur.filter(r => r.k.includes(k)).length;
  view.innerHTML = `<div class="panel"><h2>Secrets &amp; easter eggs</h2>
    <div class="note">${cur.length} hidden interactions the RS3 wiki documents as still possible in the game today, ${cur.filter(r => r.rw.length).length} of them give a reward. Open one for requirements and numbered steps. Pins sit only where the wiki gives coordinates.</div>
    ${searchBox('sq', 'Search secrets, rewards, quests… e.g. title, pet, candle', sessionStorage.sq || '')}
    <div class="chips" id="skind"><button data-v=""${!SEC.kind ? ' class="on"' : ''}>All</button>${S.kinds.filter(([k]) => cnt(k)).map(([k, l]) => `<button data-v="${k}"${SEC.kind === k ? ' class="on"' : ''}>${esc(l)}<span class="cnt">${cnt(k)}</span></button>`).join('')}</div>
    <div class="chips" id="sflag"><button data-v="rw"${SEC.rw ? ' class="on"' : ''}>Gives a reward</button><button data-v="quick"${SEC.quick ? ' class="on"' : ''}>Quick (no requirements)</button></div>
    <div id="sres"></div></div>`;
  const q = $('#sq'), out = $('#sres');
  const draw = () => {
    sessionStorage.sq = q.value; const nq = norm(q.value), toks = nq ? nq.split(' ') : [];
    const ok = (r, i) => (!SEC.kind || r.k.includes(SEC.kind)) && (!SEC.rw || r.rw.length) && (!SEC.quick || !r.rq.length) && toks.every(t => hay[i].includes(t));
    const pick = past => all.map((r, i) => [r, i]).filter(([r, i]) => !!r.x === past && ok(r, i)).map(([r, i]) => [nq ? score(r.t, nq) : 0, r])
      .sort((a, b) => b[0] - a[0]).map(x => x[1]);
    const A = pick(false), P = pick(true);
    out.innerHTML = `<div class="note" style="margin:8px 0">${A.length} of ${cur.length} shown.</div>
      ${A.length ? `<div class="secgrid">${A.map(secCard).join('')}</div>` : '<div class="obempty"><div><b>No secret matches.</b><div class="note">Try another word or clear a filter.</div></div></div>'}
      ${P.length ? `<details class="secgone"><summary>No longer possible <span class="note">(${P.length}, documented on the wiki as ended or removed)</span></summary><div class="secgrid">${P.map(secCard).join('')}</div></details>` : ''}`;
  };
  let tmr = null;
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(draw, 150); };
  document.querySelectorAll('#skind button').forEach(b => b.onclick = () => { SEC.kind = SEC.kind === b.dataset.v ? '' : b.dataset.v; document.querySelectorAll('#skind button').forEach(x => x.classList.toggle('on', x.dataset.v === SEC.kind)); draw(); });
  document.querySelectorAll('#sflag button').forEach(b => b.onclick = () => { const k = b.dataset.v === 'rw' ? 'rw' : 'quick'; SEC[k] = !SEC[k]; b.classList.toggle('on', SEC[k]); draw(); });
  if (arg) { sessionStorage.sq = ''; q.value = ''; SEC.kind = ''; SEC.rw = SEC.quick = false; document.querySelectorAll('#skind button,#sflag button').forEach(x => x.classList.toggle('on', x.dataset.v === '')); }
  draw();
  if (arg) { const d = document.getElementById('sec-' + arg); if (d) { const g = d.closest('.secgone'); if (g) g.open = true; d.open = true; d.scrollIntoView({block: 'start'}); } }
}
/* ---------- Training: RS3 wiki skill training guides, one card per recommended method (data/train.json + data/t/<Skill>.json) ---------- */
const TR = {q: '', mem: '', cheap: false, profit: false, afk: false, fit: false, gk: {}};
const TR_TAG = {afk: 'AFK', cheap: 'Cheap', profit: 'Profit'};
const TR_KIND = {f2p: 'Free-to-play', p2p: 'Members', both: 'Free-to-play & members'};
const trXp = (T, sk, lv) => { const t = (sk.el ? T.xp.e : T.xp.n); return t[Math.max(1, Math.min(t.length, lv)) - 1]; };
const trRange = c => c.lo == null ? '' : c.hi > c.lo ? `Levels ${c.lo}–${c.hi}` : `Level ${c.lo}+`;
const trAbbr = n => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 2 : 0).replace(/\.?0+$/, '') + 'm' : n >= 1e3 ? (n / 1e3).toFixed(n % 1e3 ? 1 : 0).replace(/\.0$/, '') + 'k' : String(n);
const trWiki = (g, c) => c.a ? g.u + '#' + encodeURIComponent(c.a.replace(/ /g, '_')) : g.u;
function trFit(c, lvl) { return !!c.m && c.lo != null && lvl >= c.lo && lvl <= (c.hi > c.lo ? c.hi : 999); }
function trOk(c, g, nq) {
  if (TR.mem === 'f2p' && g.k === 'p2p') return false;
  if (TR.mem === 'p2p' && g.k === 'f2p') return false;
  if (TR.cheap && !(c.tg || []).includes('cheap')) return false;
  if (TR.profit && !(c.tg || []).includes('profit')) return false;
  if (TR.afk && !(c.tg || []).includes('afk')) return false;
  if (nq) { const h = norm(c.t + ' ' + c.g + ' ' + (c.it || []).map(x => x[0]).join(' ') + ' ' + (c.rq || []).map(x => x[0]).join(' ') + ' ' + (c.q || []).join(' ') + ' ' + (c._tx || '')); if (!nq.split(' ').every(t => h.includes(t))) return false; }
  return true;
}
const trPhone = () => matchMedia('(max-width:640px)').matches;
function trCard(c, g, skn, lvl, T) {
  const fit = trFit(c, lvl), ph = trPhone();
  const tags = [g.k === 'f2p' ? 'F2P' : g.k === 'both' ? 'F2P & members' : 'Members'].concat((c.tg || []).map(t => TR_TAG[t])).map(t => `<span class="tag">${esc(t)}</span>`).join('')
    + (fit ? '<span class="tag fit">Fits your level</span>' : '') + (c.mp ? '<span class="tag">Map pin</span>' : '') + (c.pt ? '<span class="tag warn">Partly on wiki</span>' : '');
  const pic = c.p ? `<img class="secpic" loading="lazy" src="${esc(c.p)}" alt="">` : (SKICONS[skn] ? `<img class="secpic skic" loading="lazy" src="${esc(SKICONS[skn])}" alt="">` : PH('✦', 40));
  const rate = c.xph ? `<span class="trx">${c.xph[1] > c.xph[0] ? trAbbr(c.xph[0]) + '–' + trAbbr(c.xph[1]) : trAbbr(c.xph[0])} xp/hr <i>(wiki)</i></span>` : '';
  const have = loadStats() || {};
  const rq = (c.rq || []).map(([s, l]) => { const h = have[s]; const ok = h != null && h >= l; return `<span class="tag ${h == null ? '' : ok ? 'ok' : 'no'}">${h != null ? (ok ? '✓ ' : '✗ ') : ''}${l} ${esc(s)}</span>`; }).join('')
    + (c.q || []).map(q => `<a class="tag" href="#quests/${encodeURIComponent(q)}">Quest: ${esc(q)}</a>`).join('');
  const its = c.it || [];
  const items = its.map(([n, ge, ic]) => `<a class="trit" href="#items/${encodeURIComponent(n)}">${ic ? `<img class="ico" loading="lazy" src="${esc(ic)}" alt="">` : PH('✦', 28)}<span>${esc(n)}</span>${ge ? `<b class="gp">${gp(ge)}</b>` : ''}</a>`).join('');
  const peek = its.slice(0, 5).map(([n, , ic]) => ic ? `<img class="ico" loading="lazy" src="${esc(ic)}" alt="">` : '').join('');
  const cn = (c.cn || []).length ? `<ul class="trcn">${c.cn.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '';
  const cost1 = c.m && (c.cn || []).length ? `<span class="trcs">Cost: ${esc(c.cn[0].length > 90 ? c.cn[0].slice(0, 88) + '…' : c.cn[0])}</span>` : '';
  const words = c.h.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const stepsOpen = !ph && words < 220 ? ' open' : (ph && words < 45 ? ' open' : '');
  const rangeTxt = trRange(c);
  return `<details class="sec tcard${fit ? ' fit' : ''}"><summary><div class="secpicw">${pic}</div>
    <div class="sectxt"><b class="sect">${esc(c.t)}</b><span class="secd">${[rangeTxt, rate].filter(Boolean).join(' · ')}</span>${cost1}<span class="sectags">${tags}</span></div></summary>
    <div class="secbody">
      <div class="trmeta">${tags}</div>
      ${c.m ? `<div class="wsec"><h4>Requirements</h4>${rq ? `<div class="secreq">${rq}</div>` : '<div class="note">The wiki lists no skill or quest requirement for this method.</div>'}</div>` : ''}
      ${items ? `<details class="trsub"${!ph && its.length <= 8 ? ' open' : ''}><summary>Items &amp; prices <span class="cnt">${its.length}</span><span class="trpeek">${peek}</span></summary><div class="tritems">${items}</div></details>` : ''}
      ${c.m && (cn || c.xph) ? `<div class="wsec"><h4>Costs &amp; experience</h4>${c.xph ? `<div class="note">Experience stated on the wiki: ${c.xph[1] > c.xph[0] ? c.xph[0].toLocaleString() + ' to ' + c.xph[1].toLocaleString() : c.xph[0].toLocaleString()} xp per hour.</div>` : ''}${cn}</div>` : ''}
      <details class="trsub trsteps"${stepsOpen}><summary>${c.m ? 'Instructions from the wiki' : 'Wiki text'} <span class="cnt">${words} words</span></summary><div class="trbody">${c.h}</div></details>
      <div class="note trsrcl"><a href="${esc(trWiki(g, c))}" target="_blank" rel="noopener noreferrer">${esc(g.t)} on the RS3 wiki ↗</a>${c.pt ? ' · part of this section is a live wiki table, not shown here' : ''}</div></div></details>`;
}
function trFilters(id) {
  const on = (k, v) => ' class="on"';
  return `<div class="chips" id="${id}m"><button data-v=""${!TR.mem ? ' class="on"' : ''}>All</button><button data-v="f2p"${TR.mem === 'f2p' ? ' class="on"' : ''}>Free-to-play</button><button data-v="p2p"${TR.mem === 'p2p' ? ' class="on"' : ''}>Members</button></div>
    <div class="chips" id="${id}f"><button data-v="cheap"${TR.cheap ? ' class="on"' : ''}>Cheap</button><button data-v="profit"${TR.profit ? ' class="on"' : ''}>Profitable</button><button data-v="afk"${TR.afk ? ' class="on"' : ''}>AFK</button><button data-v="fit"${TR.fit ? ' class="on"' : ''}>Fits my level</button></div>
    <div class="note">Cheap, Profitable and AFK match the wiki's own words in that method's text. They are hints, not a ranking.</div>`;
}
function trBindFilters(id, draw) {
  document.querySelectorAll(`#${id}m button`).forEach(b => b.onclick = () => { TR.mem = b.dataset.v; document.querySelectorAll(`#${id}m button`).forEach(x => x.classList.toggle('on', x.dataset.v === TR.mem)); draw(); });
  document.querySelectorAll(`#${id}f button`).forEach(b => b.onclick = () => { const k = b.dataset.v; TR[k] = !TR[k]; b.classList.toggle('on', TR[k]); draw(); });
}
async function trainView(arg) {
  const T = await get('data/train.json'), [skn, gk] = (arg || '').split('/');
  const sk = T.skills.find(s => s.n === skn);
  if (sk) return trainSkill(T, sk, gk);
  const stats = STATS_SAVED ? loadStats() || {} : {}, tot = T.skills.reduce((a, s) => a + s.m, 0);
  view.innerHTML = `<div class="panel"><h2>Training guides</h2>
    <div class="note">Every skill's training guide from the RS3 wiki, split into its recommended methods with requirements, items, costs, experience and the wiki's own steps. ${T.skills.length} skills · ${tot.toLocaleString()} sections. Each links back to the exact wiki page.</div>
    ${searchBox('trq', 'Search every guide… e.g. yew, crystal, AFK, Slayer', TR.q)}
    ${trFilters('trh')}
    <div id="trres"></div></div>
    <div class="panel"><h3>Sources</h3><div class="note">All text, numbers and pictures come from these RS3 wiki pages (CC BY-NC-SA 3.0). Nothing is written by this app; a method whose text depends on a live wiki table links to the wiki for it.</div>
      <details class="thv"><summary>${T.src.length} wiki guide pages</summary><ul class="trsrc">${T.src.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a></li>`).join('')}<li><a href="${WIKI('Skill training guides')}" target="_blank" rel="noopener noreferrer">Skill training guides ↗</a></li><li><a href="${WIKI('Experience')}" target="_blank" rel="noopener noreferrer">Experience (XP table) ↗</a></li></ul></details></div>`;
  const q = $('#trq'), out = $('#trres'); let all = null, tmr = null;
  const draw = async () => {
    TR.q = q.value; const nq = norm(q.value), active = nq || TR.mem || TR.cheap || TR.profit || TR.afk || TR.fit;
    if (!active) {
      out.innerHTML = `<div class="trgrid">${T.skills.map(s => `<a class="trtile" href="#train/${encodeURIComponent(s.n)}">${SKICONS[s.n] ? `<img src="${esc(SKICONS[s.n])}" alt="" width="32" height="32">` : ''}<b>${esc(s.n)}</b><span class="note">${stats[s.n] ? 'Your level ' + stats[s.n] + ' · ' : ''}${s.m} sections · ${[...new Set(s.g.map(g => g[0] === 'f2p' ? 'Free-to-play' : g[0] === 'both' ? 'Free-to-play &amp; members' : 'Members'))].join(' · ')}</span></a>`).join('')}</div>`;
      return;
    }
    out.innerHTML = '<div class="note">Searching…</div>';
    if (!all) all = await Promise.all(T.skills.map(s => get(`data/t/${s.n}.json`).then(d => [s, d.g])));
    const rows = [];
    for (const [s, gs] of all) for (const g of gs) for (const c of g.c) { if (TR.fit && !trFit(c, stats[s.n] || 1)) continue; if (!c.m && !nq) continue; if (trOk(c, g, nq)) rows.push([nq ? score(c.t, nq) : 0, s, g, c]); }
    rows.sort((a, b) => b[0] - a[0]);
    const show = rows.slice(0, 60);
    out.innerHTML = `<div class="note" style="margin:8px 0">${rows.length.toLocaleString()} matching sections${rows.length > 60 ? ' (first 60 shown, narrow the search)' : ''}.</div>${show.length ? `<div class="trlist">${show.map(([, s, g, c]) => `<div class="trsk"><a href="#train/${encodeURIComponent(s.n)}/${g.k}">${esc(s.n)} guide</a>${trCard(c, g, s.n, stats[s.n] || 1)}</div>`).join('')}</div>` : '<div class="obempty"><div><b>No method matches.</b><div class="note">Try another word or clear a filter.</div></div></div>'}`;
  };
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(draw, 200); };
  trBindFilters('trh', draw); draw();
}
async function trainSkill(T, sk, gk) {
  const D = await get(`data/t/${sk.n}.json`), stats = loadStats() || {}, lvl = stats[sk.n] || 1, cap = sk.cap;
  let gi = D.g.findIndex(g => g.k === gk); if (gi < 0) { const pk = TR.gk[sk.n] || 'p2p'; D.g.forEach((g, i) => { if (g.k === pk && (gi < 0 || g.c.length > D.g[gi].c.length)) gi = i; }); } if (gi < 0) gi = 0;
  const gtab = D.g.length > 1 ? `<div class="chips" id="trg">${D.g.map((g, i) => `<button data-i="${i}"${i === gi ? ' class="on"' : ''}>${esc(g.t.replace(/ training$/i, ''))}<span class="cnt">${g.c.length}</span></button>`).join('')}</div>` : '';
  view.innerHTML = `<div class="trbar" id="trbar"><a class="btn mini ghost" href="#train">← Skills</a><b class="trbn">${esc(sk.n)}</b><select id="trjump" aria-label="Jump to a level range or section"><option value="">Jump to…</option></select><button type="button" class="btn mini ghost" id="trtop" aria-label="Back to top">↑ Top</button></div>
    <div class="panel trpanel"><div class="trhead">${SKICONS[sk.n] ? `<img src="${esc(SKICONS[sk.n])}" alt="" width="40" height="40">` : ''}<div><h2>${esc(sk.n)} training</h2>
      <div class="note">Your level on this device: <b>${lvl}</b>${stats[sk.n] ? '' : ' (not saved yet)'} · <a href="#items/~stats">edit my levels</a></div></div></div>
    <div class="note">From <span id="trsrc"></span>.</div>${gtab}
    <details class="trhow"><summary>How to read these sections</summary><div class="note">Tap a section to open it. Items are the ones the wiki links in that section; prices are Grand Exchange prices in this app, and tapping an item shows where to get it. ✓/✗ compares a requirement with the levels saved on this device. Costs and xp/hr are quoted from the wiki text; rates vary with boosts and play style.</div></details></div>
    <div class="panel" id="trcalc"></div>
    <div class="panel trpanel"><div class="row"><input id="trq2" type="search" placeholder="Search this guide…" value="${esc(TR.q)}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>${trFilters('trs')}<div id="trout"></div></div>
    <button type="button" class="trtopb" id="trtopb" aria-label="Back to top">↑</button>`;
  const q = $('#trq2'), out = $('#trout'), calc = $('#trcalc');
  let g = D.g[gi], tmr = null;
  const drawCalc = () => {
    const cur = Math.max(1, Math.min(cap + 20, +($('#trc1') || {value: lvl}).value || lvl)), tg = Math.max(2, Math.min(sk.el ? 150 : 120, +($('#trc2') || {value: Math.min(cap, Math.max(lvl + 1, 99))}).value || 99));
    const a = trXp(T, sk, cur), b = trXp(T, sk, tg), need = Math.max(0, b - a);
    const plan = [];
    if (need > 0) for (const c of g.c) {
      if (!c.m || !c.xph || c.lo == null) continue;
      const lo = Math.max(cur, c.lo), hi = Math.min(tg, c.hi > c.lo ? c.hi : tg); if (hi <= lo) continue;
      const xp = trXp(T, sk, hi) - trXp(T, sk, lo); if (xp <= 0) continue;
      plan.push([lo, hi, c, xp]);
    }
    plan.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const hrs = (xp, r) => { const h = xp / r; return h < 1 ? Math.round(h * 60) + ' min' : (h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString()) + ' h'; };
    $('#trcalcout').innerHTML = `<div class="kv"><b>XP at level ${cur}</b><span>${a.toLocaleString()}</span><b>XP at level ${tg}</b><span>${b.toLocaleString()}</span><b>XP needed</b><span><b class="gp">${need.toLocaleString()}</b>${tg > cap ? ' <span class="note">(past the normal level ' + cap + ' cap: virtual levels)</span>' : ''}</span></div>
      ${plan.length ? `<details class="trsub"${trPhone() ? '' : ' open'}><summary>Plan by wiki method <span class="cnt">${plan.length}</span></summary><ol class="trplan">${plan.map(([lo, hi, c, xp]) => `<li><b>Levels ${lo}–${hi}</b> <span>${esc(c.t)}</span><i>${xp.toLocaleString()} xp · about ${c.xph[1] > c.xph[0] ? hrs(xp, c.xph[1]) + ' to ' + hrs(xp, c.xph[0]) : hrs(xp, c.xph[0])}</i></li>`).join('')}</ol></details>
      <div class="note">Estimated: XP between those levels (wiki XP table) ÷ the xp/hour the wiki states. Methods overlap, so use one per level range.</div>` : '<div class="note">This guide states no hourly rate for methods in that range.</div>'}`;
  };
  calc.innerHTML = `<h3>XP to a target level</h3><div class="row trcalcrow"><label>From level <input id="trc1" type="number" inputmode="numeric" min="1" max="${cap + 20}" value="${lvl}"></label><label>To level <input id="trc2" type="number" inputmode="numeric" min="2" max="${sk.el ? 150 : 120}" value="${Math.min(cap, Math.max(lvl + 1, 99))}"></label></div><div id="trcalcout"></div>
    <div class="note">XP table from the wiki's Experience page (${sk.el ? 'elite skill curve' : 'standard curve'}). Your saved level is only read, never changed.</div>`;
  const drawList = () => {
    TR.q = q.value; const nq = norm(q.value), act = nq || TR.mem || TR.cheap || TR.profit || TR.afk || TR.fit;
    const groups = []; let n = 0, firstFit = false;
    for (const c of g.c) {
      if (TR.fit && !trFit(c, lvl)) continue;
      if (!trOk(c, g, nq)) continue;
      let G = groups[groups.length - 1]; if (!G || G.t !== c.g) groups.push(G = {t: c.g, cs: []});
      G.cs.push(c); n++;
      if (STATS_SAVED && stats[sk.n] && trFit(c, lvl)) { firstFit = true; G.fit = true; }
    }
    let openIdx = groups.findIndex(G => G.fit); if (openIdx < 0) openIdx = groups.findIndex(G => G.cs.some(c => c.m)); if (openIdx < 0) openIdx = 0;
    const rng = G => { const m = G.cs.filter(c => c.m && c.lo != null); if (!m.length) return ''; const lo = Math.min(...m.map(c => c.lo)), hi = Math.max(...m.map(c => c.hi)); return lo === hi ? 'level ' + lo : 'levels ' + lo + '–' + hi; };
    const h = groups.map((G, i) => `<details class="trgrp" id="trgrp${i}"${act || i === openIdx ? ' open' : ''}><summary><b>${esc(G.t)}</b><span class="cnt">${G.cs.length}</span>${rng(G) ? `<span class="trgr">${rng(G)}</span>` : ''}${G.fit ? '<span class="tag fit">Fits your level</span>' : ''}</summary><div class="trgb">${G.cs.map(c => trCard(c, g, sk.n, lvl, T)).join('')}</div></details>`).join('');
    out.innerHTML = `<div class="note trcount">${n} of ${g.c.length} sections shown.${D.g.length > 1 && (TR.mem === 'f2p' && g.k === 'p2p' || TR.mem === 'p2p' && g.k === 'f2p') ? ' This guide is hidden by the Free-to-play / Members filter.' : ''}${act ? '' : ' Only one group is open to keep the page short; open the others below or use “Jump to”.'}</div>${h || '<div class="obempty"><div><b>Nothing matches.</b><div class="note">Clear a filter or the search.</div></div></div>'}${firstFit ? '<div class="note">Sections marked “Fits your level” include level ' + lvl + '.</div>' : ''}`;
    const jump = $('#trjump'); if (jump) { jump.innerHTML = '<option value="">Jump to…</option>' + groups.map((G, i) => `<option value="${i}">${esc(G.t)}${rng(G) ? ' (' + rng(G) + ')' : ''}</option>`).join(''); }
  };
  const setG = i => {
    gi = i; g = D.g[i]; TR.gk[sk.n] = g.k;
    $('#trsrc').innerHTML = `<a href="${esc(g.u)}" target="_blank" rel="noopener noreferrer">${esc(g.t)} ↗</a>`;
    document.querySelectorAll('#trg button').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
    drawCalc(); drawList();
  };
  document.querySelectorAll('#trg button').forEach(b => b.onclick = () => setG(+b.dataset.i));
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(drawList, 150); };
  trBindFilters('trs', drawList);
  ['trc1', 'trc2'].forEach(id => $('#' + id).oninput = drawCalc);
  const toTop = () => window.scrollTo(0, 0);
  $('#trtop').onclick = toTop; $('#trtopb').onclick = toTop;
  $('#trjump').onchange = e => { const el = document.getElementById('trgrp' + e.target.value); if (!el) return; el.open = true; el.scrollIntoView({block: 'start'}); e.target.value = ''; };
  setG(gi);
}
window.addEventListener('scroll', () => { const b = document.getElementById('trtopb'); if (b) b.classList.toggle('on', window.scrollY > 700); }, {passive: true});
async function aboutView() {
  const m = await get('data/meta.json');
  const cc = Object.entries(m.clue_counts).map(([t, o]) => `<tr><td>${esc(cap(t.replace('_', ' ')))}</td><td>${Object.entries(o).map(([k, v]) => `${TYPE_LABEL[k] || k} ${v}`).join(' · ')}</td></tr>`).join('');
  view.innerHTML = `<div class="panel parch"><h2>About this app</h2>
    <p><b>Made by <span class="nx-poison" data-text="Dev. Soy Yoda">Dev. Soy Yoda</span>.</b></p>
    <p><b>Unofficial fan-made tool.</b> All images and game content are the property of Jagex Ltd. RuneScape is a trademark of Jagex Ltd.
    This is an unofficial, fan-made tool for personal use only. It is not affiliated with or endorsed by Jagex, and it is not for sale or for profit.</p>
    <p>Data and images come from the RuneScape Wiki (<a href="https://runescape.wiki" target="_blank" rel="noopener noreferrer">runescape.wiki</a>), whose text is licensed
    <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 3.0</a>. This app re-uses an offline copy of that content, reformatted; mistakes in extraction are ours, not the wiki's.
    Fonts: Cinzel, Cinzel Decorative, Orbitron, Rajdhani, Inter and Fira Sans (SIL Open Font License).</p></div>
  <div class="panel"><h2>What's inside</h2><div class="kv">
    <b>Built</b><span>${esc(m.built)}</span><b>Monsters</b><span>${m.monsters.toLocaleString()}</span><b>Drop entries</b><span>${m.drop_entries.toLocaleString()}</span>
    <b>Items</b><span>${m.items.toLocaleString()} (${m.icons.toLocaleString()} with icons)</span><b>Clues</b><span>${m.clues.toLocaleString()}</span><b>Travel pages</b><span>${m.locations.toLocaleString()}</span>
    ${m.gear ? `<b>Gear</b><span>${m.gear.items.toLocaleString()} items · ${m.gear.with_stats.toLocaleString()} with stats · ${m.gear.with_requirements.toLocaleString()} with requirements · ${m.gear.with_price.toLocaleString()} with a GE price</span>` : ''}
    ${m.secrets ? `<b>Secrets</b><span>${m.secrets.entries} easter eggs and hidden interactions still possible today · ${m.secrets.with_reward} give a reward · ${m.secrets.with_map} with map pins (${m.secrets.pins} pins) · ${m.secrets.past} ended ones listed separately</span>` : ''}
    ${m.training ? `<b>Training</b><span>${m.training.skills} skills · ${m.training.guides} wiki guides · ${m.training.cards.toLocaleString()} sections · ${m.training.cost.toLocaleString()} with costs or item prices · ${m.training.xph.toLocaleString()} with a stated xp/hour · ${m.training.maps} with map pins · ${m.training.pics.toLocaleString()} with a wiki picture</span>` : ''}
    ${m.ge ? `<b>GE prices</b><span>${m.ge.prices.toLocaleString()} items, as of ${esc(m.ge.date)} (${esc(m.ge.source)})</span>` : ''}</div>
    <div class="note" style="margin-top:8px">Rarity bands follow the wiki's drop tables (Module:DropsLine): Always, Common ≥ 1/16, Uncommon ≥ 1/64, Rare ≥ 1/256, Very rare below that.</div>
    <table style="margin-top:10px"><thead><tr><th>Tier</th><th>Clue types</th></tr></thead><tbody>${cc}</tbody></table></div>
  <div class="panel"><h2>Known gaps</h2><ul>
    <li>Pictures come from the wiki pages themselves: ${(m.coverage.quest_pictures_total || 0).toLocaleString()} quest pictures (steps, start NPCs and places) and location maps, entrances and teleports for monsters. A step the wiki shows no picture for gets the place or NPC picture it mentions, where the wiki has one. ${m.qpic_not_on_wiki ? `${m.qpic_not_on_wiki.toLocaleString()} picture names that quest pages mention do not exist as files on the wiki itself (mostly NPC chatheads), so nothing can be shown for those.` : ''}</li>
    <li>${m.spawn_maps ? `${m.spawn_maps.with_tiles.toLocaleString()} of ${m.spawn_maps.with_coords.toLocaleString()} monster spawn locations open an interactive map (drag, zoom, floors) built from the wiki's own map tiles, with the wiki's spawn point marked.` : ''} The wiki gives one spawn coordinate per place, so the other map layers the wiki can show (extra markers, routes, filters) are not reproduced, and the location pictures still show the wiki's red spawn dots.</li>
    ${m.icons_missing_names && m.icons_missing_names.length ? `<li>${m.icons_missing_names.length.toLocaleString()} item names have no icon because they are not single wiki items (for example “Nothing equipped…” rows), and ${m.icons_variant.toLocaleString()} names use the first variant icon of their wiki disambiguation page.${m.monster_images_missing_names && m.monster_images_missing_names.length ? ` The wiki has no picture for ${m.monster_images_missing_names.map(esc).join(' and ')}.` : ''}</li>` : ''}
    ${m.missing_location_pages ? `<li>${m.missing_location_pages} place pages were not in the copy yet, so some “how to get there” notes are missing.</li>` : ''}
    ${m.missing_clue_pages && m.missing_clue_pages.length ? `<li>Not yet in the copy: ${esc(m.missing_clue_pages.join(', '))}.</li>` : ''}
    ${m.clue_pages_not_on_wiki && m.clue_pages_not_on_wiki.length ? `<li>These clue pages do not exist on the RS3 wiki, so there is nothing to copy: ${esc(m.clue_pages_not_on_wiki.join(', '))}. The wiki's own Cryptic, Scan and Compass clue pages are included.</li>` : ''}
    <li>Nearest lodestone is a straight-line distance on the main map, not a walking route: the wiki publishes no walking-route data to compute one from.</li>
    <li>The gear finder only knows the requirements in an item's wiki infobox (skill levels, and the wiki's extra requirement text where it has some). Quest and unlock requirements that the wiki only describes in an item's page text are not checked.</li>
    <li>Obtainable follows the wiki's own markers. Items from pages the wiki marks only as a whole (not per item) may sit under Items › Discontinued instead; a few promo items can still be listed.</li></ul></div>
  <div class="panel" id="privpanel"><h2>Privacy &amp; security</h2><ul>
    <li><b>Your levels and progress stay on your device.</b> They are saved in this browser or window only (local storage) and are never sent anywhere. Every device starts fresh and keeps its own.</li>
    <li>No accounts, no tracking, no analytics, no ads, no cookies, no third-party scripts or fonts. The app only loads its own files.</li>
    <li>Clearing this site's data (or uninstalling) erases your saved levels and ticks. They are not backed up for you.</li>
    <li>Strict Content-Security-Policy; links to other sites open without sending a referrer. The Windows program checks every downloaded file against a SHA-256 list before it installs it.</li>
    <li>The Windows program is not code-signed, so Windows SmartScreen may warn on first run (More info → Run anyway). Only download it from the links on this page.</li></ul>
    <div class="row" style="margin-top:8px"><button class="btn sub" id="showsha">Show app version &amp; Windows download checksum</button></div>
    <div class="note" id="shaout" style="margin-top:6px;word-break:break-all"></div></div>
  <div class="panel"><h2>Pictures offline</h2><div class="note">Quest, place and entrance pictures load when you open them and are then kept for offline use. To keep every picture on this device now (best on Wi-Fi), tap below.</div>
    <div class="row" style="margin-top:8px"><button class="btn" id="saveall">Save all pictures for offline</button><span class="note" id="saveprog"></span></div></div>
  <div class="panel" id="updpanel" hidden><h2>Updates</h2><div class="note">This Windows program can update itself from the live app in one click. Only changed files are downloaded and each one is checked before it replaces the old copy.</div>
    <div class="row" style="margin-top:8px"><button class="btn" id="updcheck">Check for updates</button><span class="note" id="updver"></span></div></div>
  <div class="panel"><h2>Share with a clan mate</h2><div class="kv">
    <b>Web app</b><span><a href="${SHARE_URL}" target="_blank" rel="noopener noreferrer">${SHARE_URL.replace('https://', '')}</a> <button class="btn sub nx-copy" data-copy="${SHARE_URL}">Copy</button></span>
    <b>Windows program</b><span><a href="${SHARE_PC}" rel="noopener noreferrer">${SHARE_PC.replace('https://', '')}</a> <button class="btn sub nx-copy" data-copy="${SHARE_PC}">Copy</button></span>
    <b>Backup links</b><span><a href="https://theelonmuskrs3.github.io/dch/" target="_blank" rel="noopener noreferrer">theelonmuskrs3.github.io/dch</a><br><a href="https://theelonmuskrs3.github.io/dch/pc/" rel="noopener noreferrer">theelonmuskrs3.github.io/dch/pc</a></span></div>
    <div class="note" style="margin-top:8px">The web app opens in any browser (phone or PC) and can be installed from there. The Windows program is the same app in its own window, with one-click updates.</div></div>
  <div class="panel"><h2>Install</h2><ul>
    <li>Windows (Edge or Chrome): open the app, then use the install icon in the address bar, or menu → Apps → Install.</li>
    <li>Android (Chrome): menu → Add to Home screen / Install app.</li>
    <li>iPhone or iPad (Safari): Share → Add to Home Screen.</li>
    <li>After the first full load it works offline.</li></ul></div>`;
  if (LAUNCHER) { $('#updpanel').hidden = false; $('#updver').textContent = 'Installed version: ' + (LAUNCHER.current || 'unknown'); $('#updcheck').onclick = checkUpdates; }
  $('#showsha').onclick = async () => {
    const out = $('#shaout'); out.textContent = 'Loading…';
    try {
      const u = await (await fetch('update.json', {cache: 'no-store'})).json();
      out.textContent = 'App version ' + String(u.version || '?') + (u.bundle && u.bundle.sha256 ? ' · app bundle SHA-256 ' + String(u.bundle.sha256) : '') + '. The Windows program download page lists the SHA-256 of DropClueHelper-Windows.zip; compare it with certutil -hashfile <file> SHA256.';
    } catch (_) { out.textContent = 'Could not load the version info (offline?).'; }
  };
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
  loadStats(); welcomeBanner();
  route(); detectLauncher();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

/* ---------- Where to get it: shops, drops, recipes, rewards, spawns, availability for every item (data/src, built from the RS3 wiki by extract_sources.py + build_sources.py) ----------
   Per-page shard rec: s shops [shop, owner, location, stock, sells, buys, currency, members(1/0/-1), historical, shopMapId, ownerMapId, [map,x,y,plane] (wiki coordinates), 'T' = rotating (Thalmund)],
   p ground spawns, r recipes, w reward-type sources, q quest rewards, h availability history, x wiki note, dm {drop source: map entry id}, t Thalmund flag. */
const fnv1a = s => { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
let SSUM = null;
const sumData = () => SSUM || (SSUM = get('data/src/sum.json').catch(() => ({})));
const srcOf = async page => { try { return (await get(`data/src/${fnv1a(page) % 256}.json`))[page] || null; } catch (_) { return null; } };
const SMONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtD = t => { const d = new Date(t); return `${d.getUTCDate()} ${SMONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const mod = (a, n) => ((a % n) + n) % n;
const memTag = m => m === 1 ? '<span class="tag">Members</span>' : m === 0 ? '<span class="tag">Free-to-play</span>' : '';
const money = (v, c) => v == null ? '<span class="note">not listed</span>' : `<span class="gp">${Number(v).toLocaleString()} ${esc(c || 'gp')}</span>`;
const mmBtn = (o, label = 'Show on map') => `<button class="btn mini" data-mm="${esc(JSON.stringify(o))}" data-t="${esc(label)}">${esc(label)}</button>`;

/* Thalmund's Wares rotation, ported from the wiki's Module:Rotations/Thalmund (starts 14 February 2024, a new stock every 7 days) */
function thalDates(T, page, now = Date.now()) {
  const t0 = Date.UTC(T.start[0], T.start[1] - 1, T.start[2]), day = 86400000;
  const days = Math.floor((now - t0) / day), cur = Math.floor(days / 7), first = Math.floor((days - 1) / 7) + 1;
  const hit = idx => T.slots.flatMap((sl, si) => {
    const i = idx + sl.o, e = sl.q ? sl.i.find(x => x[1] === sl.q[mod(i, sl.q.length)]) : sl.i[mod(i, sl.i.length)];
    return e && e[0] === page ? [si] : [];
  });
  const rows = [];
  for (let i = first, guard = 0; rows.length < 5 && guard < 3000; i++, guard++) { const h = hit(i); if (h.length) rows.push({d: t0 + i * 7 * day, slots: h}); }
  return {now: hit(cur).length ? {d: t0 + cur * 7 * day, slots: hit(cur)} : null, rows, T};
}
function thalHtml(T, page) {
  const R = thalDates(T, page), sl = i => esc((T.slots[i].t || '').replace(/^Slot \d+:\s*/, ''));
  return `<div class="wsec"><h4>Upcoming available dates</h4>
    <div class="note">Thalmund’s Wares restocks every 7 days (new stock from 00:00 UTC on Wednesdays, counted from 14 February 2024 by the wiki’s rotation module). ${R.now ? `<b class="r0">In stock this week</b> (since ${fmtD(R.now.d)}, slot ${R.now.slots.map(i => i + 1).join(', ')}).` : 'Not in stock this week.'}</div>
    ${R.rows.length ? `<div class="tscroll"><table><thead><tr><th>Available from</th><th>Slot</th></tr></thead><tbody>${R.rows.map(r => `<tr><td>${fmtD(r.d)}</td><td>${r.slots.map(i => `${i + 1} <span class="note">(${sl(i)})</span>`).join(', ')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="note">No further appearance found in the rotation.</div>'}</div>`;
}
function shopCard(s) {
  const [shop, owner, loc, stock, sell, buy, cur, mem, hist, sid, oid, pin, rot] = s;
  const pinO = pin ? {map: pin[0], x: pin[1], y: pin[2], plane: pin[3] || 0, pins: [[pin[1], pin[2]]], label: `Start here — ${shop}`} : null;
  return `<div class="wcard${hist ? ' hist' : ''}"><div class="wc-h"><b>${esc(shop)}</b>${memTag(mem)}${rot ? '<span class="tag">Rotating stock</span>' : ''}${hist ? '<span class="tag warn">Discontinued shop stock (wiki marks historical)</span>' : ''}</div>
    <div class="kv"><b>Seller</b><span>${owner ? (oid != null ? `<a href="#map/${oid}">${esc(owner)}</a>` : esc(owner)) : '<span class="note">not stated</span>'}</span>
    <b>Shop</b><span>${sid != null ? `<a href="#map/${sid}">${esc(shop)}</a>` : esc(shop)}</span>
    <b>Location</b><span>${loc ? esc(loc) : '<span class="note">not stated</span>'}</span>
    <b>Stock</b><span>${stock !== '' && stock != null ? esc(stock) : '<span class="note">not stated</span>'}</span>
    <b>Sold at</b><span>${money(sell, cur)}</span><b>Bought at</b><span>${money(buy, cur)}</span>
    ${pin ? `<b>Wiki coordinates</b><span>${coordStr([pin[1], pin[2]], pin[3])}${pin[0] !== 28 ? ` · map ${pin[0]}` : ''}</span>` : ''}</div>
    <div class="row wacts">${sid != null ? `<a class="btn mini" href="#map/${sid}">Open in Map tab</a>` : ''}${pinO ? mmBtn(pinO) : ''}${!sid && !pinO ? '<span class="note">The wiki gives no map location for this shop.</span>' : ''}</div></div>`;
}
function spawnCard(p) {
  const [loc, mem, req, map, plane, xy, text] = p;
  const o = xy && xy.length ? {map, plane: plane || 0, x: xy[0][0], y: xy[0][1], pins: xy, label: `Ground spawn${loc ? ' — ' + loc : ''}`} : null;
  return `<div class="wcard"><div class="wc-h"><b>${esc(loc || 'Ground spawn')}</b>${memTag(mem)}${xy && xy.length ? `<span class="tag">${xy.length} spawn${xy.length === 1 ? '' : 's'}</span>` : ''}</div>
    ${text ? `<div class="pre">${esc(text)}</div>` : ''}${req && req !== 'none' ? `<div class="note">Requirements: ${esc(req)}</div>` : ''}
    ${o ? `<div class="note">Wiki coordinates: ${xy.slice(0, 5).map(c => coordStr(c, plane)).join(' · ')}${xy.length > 5 ? ` · +${xy.length - 5} more` : ''}</div><div class="row wacts">${mmBtn(o)}</div>` : '<div class="note">No coordinates on the wiki.</div>'}</div>`;
}
/* Thieving rows: v = [source, version, level, level range, wiki type, qty, rarity, rarity note, xp, tool]; data/src/thv.json: source -> {t, l: [[loc, mem(1/0/-1), requirements, map, plane, [[x,y]..], dropversion]]} (wiki coordinates only) */
const tvNorm = x => String(x || '').toLowerCase().replace(/(ing|s)$/, '').trim();
function thvLocs(I, ver) {
  const all = I.l || [], nv = String(ver || '').toLowerCase().trim();
  const hit = all.filter(l => !l[6] || (nv && (l[6].toLowerCase() === nv || tvNorm(l[6]) === tvNorm(nv))));
  return hit.length ? hit : all;
}
function thvLocCard(l, src) {
  const [loc, mem, req, map, plane, xy] = l;
  const o = xy && xy.length ? {map, plane: plane || 0, x: xy[0][0], y: xy[0][1], pins: xy, label: `Thieve — ${src}${loc ? ' — ' + loc : ''}`} : null;
  return `<div class="wcard wloc"><div class="wc-h"><b>${esc(loc || 'Wiki map location')}</b>${memTag(mem)}${xy && xy.length ? `<span class="tag">${xy.length} pin${xy.length === 1 ? '' : 's'}</span>` : ''}</div>
    ${req ? `<div class="note">Requirements: ${esc(req)}</div>` : ''}
    ${o ? `<div class="note">Wiki coordinates: ${xy.slice(0, 4).map(c => coordStr(c, plane)).join(' · ')}${xy.length > 4 ? ` · +${xy.length - 4} more` : ''}${map !== 28 ? ` · map ${esc(map)}` : ''}</div><div class="row wacts">${mmBtn(o, 'Find on map')}</div>` : '<div class="note">No coordinates on the wiki.</div>'}</div>`;
}
function thvRow(v, TH) {
  const [src, ver, lv, lr, ty, qty, rar, note, xp, tool] = v, I = TH[src] || {t: '', l: []}, ls = thvLocs(I, ver);
  const lvl = lv != null ? `Thieving ${lv}` : lr ? `Thieving ${lr[0]}–${lr[1]}` : 'Thieving level not stated';
  const lvFull = lv != null ? `Thieving level ${lv}` : lr ? `Thieving level ${lr[0]}–${lr[1]} (varies by version or room; see the wiki page)` : 'Thieving level <span class="note">not stated on the wiki</span>';
  const reqs = [...new Set(ls.map(l => l[2]).filter(Boolean))];
  const mems = new Set(ls.map(l => l[1]).filter(m => m === 0 || m === 1)), mem = mems.size === 1 ? [...mems][0] : -1;
  const pins = ls.filter(l => l[5] && l[5].length).length;
  return `<details class="thv"><summary><span class="tag thv-t">Thieve</span><b>${esc(src)}</b><span class="note">${[ty, lvl, qty ? 'qty ' + qty : '', rar].filter(Boolean).map(esc).join(' · ')}</span>${pins ? '<span class="tag">Map pin</span>' : ''}</summary>
    <div class="thv-b"><div class="kv"><b>Source</b><span><a href="${WIKI(src)}" target="_blank" rel="noopener noreferrer">${esc(src)} ↗</a>${memTag(mem)}</span>
      ${ty ? `<b>Method</b><span>${esc(ty)}</span>` : ''}${ver ? `<b>Version</b><span>${esc(ver)}</span>` : ''}
      <b>Requires</b><span>${lvFull}${reqs.map(r => `<br>${esc(r)}`).join('')}${tool ? `<br>Tool: ${esc(tool)}` : ''}</span>
      <b>Quantity</b><span>${qty ? esc(qty) : '<span class="note">not stated</span>'}</span><b>Chance</b><span>${rar ? esc(rar) : '<span class="note">not stated</span>'}</span>
      ${xp ? `<b>XP</b><span>${esc(xp)} Thieving xp per success</span>` : ''}${note ? `<b>Note</b><span>${esc(note)}</span>` : ''}</div>
      ${ls.length ? `<div class="thv-loc"><b>Where (${ls.length} location${ls.length === 1 ? '' : 's'} on the wiki)</b>${ls.slice(0, 3).map(l => thvLocCard(l, src)).join('')}${ls.length > 3 ? `<details><summary>Show all ${ls.length} locations</summary>${ls.slice(3).map(l => thvLocCard(l, src)).join('')}</details>` : ''}</div>` : '<div class="note">The wiki gives no location for this source.</div>'}</div></details>`;
}
function recipeCard(r, D) {
  const [m, mem, sk, mats, fac, tool, quest, page, ticks, outs] = r;
  return `<div class="wcard"><div class="wc-h"><b>${esc(m || 'Creation')}</b>${memTag(mem)}</div><div class="kv">
    ${sk && sk.length ? `<b>Skills</b><span>${sk.map(x => `${esc(x[0])} ${esc(x[1])}${x[2] ? ` <span class="note">(${esc(x[2])} xp)</span>` : ''}`).join(', ')}</span>` : ''}
    ${mats && mats.length ? `<b>Materials</b><span data-nosrc>${mats.map(x => `${x[2] ? itemLink(x[0]) : esc(x[0])} <span class="note">× ${esc(x[1])}</span>`).join('<br>')}</span>` : ''}
    ${fac ? `<b>Facility</b><span>${esc(fac)}</span>` : ''}${tool ? `<b>Tools</b><span>${esc(tool)}</span>` : ''}${quest ? `<b>Quest</b><span>${esc(quest)}</span>` : ''}
    ${ticks ? `<b>Time</b><span>${esc(ticks)} ticks</span>` : ''}${outs && outs.length > 1 ? `<b>Produces</b><span>${outs.map(x => `${esc(x[0])} × ${esc(x[1])}`).join(', ')}</span>` : ''}</div>
    ${page ? `<div class="note"><a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">Recipe on the RS3 wiki: ${esc(page)} ↗</a></div>` : ''}</div>`;
}
function availRows(H) {
  const now = Date.now();
  return H.map(h => {
    const a = relDate(h[0]), b = h[1] && !/^(no|n\/a)$/i.test(h[1]) ? relDate(h[1]) + 86400000 : 0;
    const st = a && a > now ? '<span class="tag">Upcoming</span>' : a && (!b || b > now) && /^(no|n\/a)$/i.test(h[1] || 'no') ? '<span class="tag">Available (no end date)</span>' : a && b > now ? '<span class="tag r0t">Available now</span>' : '';
    return `<tr><td>${esc(h[0] || '?')}</td><td>${esc(h[1] || '—')}${h[2] ? ` <span class="note">${esc(h[2])}</span>` : ''}</td><td>${esc(h[3] && !/^no$/i.test(h[3]) ? h[3] : '—')}${h[4] ? ` <span class="note">${esc(h[4])}</span>` : ''} ${st}</td></tr>`;
  }).join('');
}
function mapActionFor(S, TH) {
  const sh = (S.s || []).find(s => !s[8] && String(s[3]).trim() !== '0' && (s[9] != null || s[11])) || (S.s || []).find(s => s[9] != null || s[11]);
  if (sh) return sh[9] != null ? `<a class="btn mini" href="#map/${sh[9]}">Open map</a>` : mmBtn({map: sh[11][0], x: sh[11][1], y: sh[11][2], plane: sh[11][3] || 0, pins: [[sh[11][1], sh[11][2]]], label: `Start here — ${sh[0]}`}, 'Open map');
  const sp = (S.p || []).find(p => p[5] && p[5].length);
  if (sp) return mmBtn({map: sp[3], plane: sp[4] || 0, x: sp[5][0][0], y: sp[5][0][1], pins: sp[5], label: `Ground spawn — ${sp[0]}`}, 'Open map');
  const dm = S.dm && Object.values(S.dm)[0];
  if (dm == null && S.v && TH) for (const v of S.v) { const l = thvLocs(TH[v[0]] || {}, v[1]).find(x => x[5] && x[5].length); if (l) return mmBtn({map: l[3], plane: l[4] || 0, x: l[5][0][0], y: l[5][0][1], pins: l[5], label: `Thieve — ${v[0]}${l[0] ? ' — ' + l[0] : ''}`}, 'Open map'); }
  return dm != null ? `<a class="btn mini" href="#map/${dm}">Open map</a>` : '';
}
async function fillWtg(el, D, name, page, drops) {
  const [S0, SM] = await Promise.all([srcOf(page).then(x => x || (page !== name ? srcOf(name) : null)), sumData()]);
  if (!el.isConnected) return;
  const S = S0 || {}, sum = SM[page] || SM[name] || '';
  const sec = [];
  const TH = S.v && S.v.length ? await get('data/src/thv.json').catch(() => ({})) : {};
  if (!el.isConnected) return;
  const eggs = await get('data/secrets.json').then(d => d.rows.filter(r => !r.x && r.rw.some(w => w.i === name))).catch(() => []);
  const hasAny = eggs.length || (S.s && S.s.length) || (S.p && S.p.length) || (S.r && S.r.length) || (S.w && S.w.length) || (S.v && S.v.length) || (S.q && S.q.length) || (S.h && S.h.length) || (drops && drops.length);
  if (S.s && S.s.length) {
    const cur = S.s.filter(s => !s[8]), old = S.s.filter(s => s[8]), all = [...cur, ...old];
    sec.push(`<div class="wsec"><h4>Shops <span class="note">(${(S.sn || all.length).toLocaleString()})</span></h4>
      ${all.slice(0, 5).map(shopCard).join('')}${all.length > 5 ? `<details><summary>+${(S.sn || all.length) - 5} more shop${(S.sn || all.length) - 5 === 1 ? '' : 's'}</summary>${all.slice(5).map(shopCard).join('')}</details>` : ''}
      ${S.sn > all.length ? `<div class="note">Showing ${all.length} of ${S.sn} shops; see the wiki page for the rest.</div>` : ''}</div>`);
    if (S.t) { try { sec.push(thalHtml(await get('data/src/thal.json'), page)); } catch (_) {} }
  }
  if (drops && drops.length) {
    const top = drops.slice(0, 8);
    sec.push(`<div class="wsec"><h4>Monster &amp; other drops <span class="note">(${drops.length.toLocaleString()} sources, best chance first; full table below)</span></h4>
      ${top.map(s => `<div class="wrow">${s[5] ? `<a class="item" href="#drops/${encodeURIComponent(s[0])}">${mthumb(s[0], 28)}<span>${esc(s[0])}</span></a>` : `<span class="item"><span>${esc(s[0])}</span></span>`}
        <span class="note">${s[1] ? 'qty ' + esc(s[1]) + ' · ' : ''}${esc(s[2] || '')}</span>${S.dm && S.dm[s[0]] != null ? `<a class="btn mini" href="#map/${S.dm[s[0]]}">Open map</a>` : ''}</div>`).join('')}</div>`);
  }
  if (S.v && S.v.length) {
    const vn = S.vn || S.v.length, nsrc = new Set(S.v.map(v => v[0])).size;
    sec.push(`<div class="wsec"><h4>Thieving <span class="note">(${vn.toLocaleString()} drop${vn === 1 ? '' : 's'} from ${nsrc} source${nsrc === 1 ? '' : 's'}, lowest level first)</span></h4>
      ${S.v.slice(0, 6).map(v => thvRow(v, TH)).join('')}${S.v.length > 6 ? `<details class="thvmore"><summary>Show all ${S.v.length} thieving sources</summary>${S.v.slice(6).map(v => thvRow(v, TH)).join('')}</details>` : ''}
      ${vn > S.v.length ? `<div class="note">+${vn - S.v.length} more on the wiki.</div>` : ''}</div>`);
  }
  if (S.w && S.w.length) sec.push(`<div class="wsec"><h4>Rewards &amp; other sources <span class="note">(${(S.wn || S.w.length).toLocaleString()})</span></h4>
    ${S.w.map(w => `<div class="wrow"><a href="${WIKI(w[0])}" target="_blank" rel="noopener noreferrer">${esc(w[0])}</a><span class="tag">${esc(w[1])}</span>
      <span class="note">${[w[2], w[3] ? 'qty ' + w[3] : '', w[4]].filter(Boolean).map(esc).join(' · ')}</span>${w[6] != null ? `<a class="btn mini" href="#map/${w[6]}">Open map</a>` : ''}</div>`).join('')}
    ${S.wn > S.w.length ? `<div class="note">+${S.wn - S.w.length} more on the wiki.</div>` : ''}</div>`);
  if (S.r && S.r.length) sec.push(`<div class="wsec"><h4>Creation <span class="note">(${(S.rn || S.r.length).toLocaleString()} recipe${(S.rn || S.r.length) === 1 ? '' : 's'})</span></h4>${S.r.map(r => recipeCard(r, D)).join('')}${S.rn > S.r.length ? `<div class="note">+${S.rn - S.r.length} more recipes on the wiki.</div>` : ''}</div>`);
  if (S.p && S.p.length) sec.push(`<div class="wsec"><h4>Ground spawns <span class="note">(${(S.pn || S.p.length).toLocaleString()} places)</span></h4>${S.p.map(spawnCard).join('')}${S.pn > S.p.length ? `<div class="note">+${S.pn - S.p.length} more places on the wiki.</div>` : ''}</div>`);
  if (S.q && S.q.length) sec.push(`<div class="wsec"><h4>Quest rewards</h4>${S.q.map(q => `<div class="wrow"><a href="#quests/${encodeURIComponent(q[0])}">${esc(q[0])}</a><span class="note">${esc(q[1])}</span></div>`).join('')}${S.qn > S.q.length ? `<div class="note">+${S.qn - S.q.length} more quests.</div>` : ''}</div>`);
  if (S.h && S.h.length) sec.push(`<div class="wsec"><h4>Availability history <span class="note">(release-history table on the wiki page)</span></h4><div class="tscroll"><table><thead><tr><th>Start</th><th>End</th><th>Event / content</th></tr></thead><tbody>${availRows(S.h)}</tbody></table></div>${S.hn > S.h.length ? `<div class="note">+${S.hn - S.h.length} older rows on the wiki.</div>` : ''}</div>`);
  if (S.x) sec.push(`<div class="wsec"><blockquote class="obhow">“${esc(S.x)}${S.x.length >= 360 ? '…' : ''}”<cite>— RS3 wiki, <a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">${esc(page)}</a> (page introduction)</cite></blockquote></div>`);
  if (eggs.length) sec.push(`<div class="wsec"><h4>Easter egg reward</h4>${eggs.map(r => `<div class="wrow"><a href="#secrets/${esc(r.id)}">${esc(r.t)}</a><span class="tag">Secret</span><span class="note">${esc(r.rq.length ? 'has requirements, see steps' : 'no requirements')}</span></div>`).join('')}<div class="note">A hidden interaction the RS3 wiki documents. Open it in the Secrets tab for the steps.</div></div>`);
  const act = mapActionFor(S, TH);
  el.innerHTML = `<h3>Where to get it</h3><div class="wtg">
    ${sum ? `<div class="wsum wrow"><b>${esc(sum)}</b>${act}</div>` : ''}
    ${sec.length ? sec.join('') : ''}
    ${!hasAny && !S.x ? `<div class="note wnone">The RS3 wiki has no source data for this item: no shop, drop, recipe, ground spawn, reward or availability entry was found for it. <a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">Check the wiki page ↗</a></div>` : ''}
    <div class="note">Built from the RS3 wiki’s shop, drop, recipe, spawn and rotation data. Map pins sit only at coordinates the wiki states.</div></div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('button[data-mm]'); if (!b) return;
  const host = b.closest('.wcard,.wsum,.trbody') || b.parentElement;
  let box = host.querySelector(':scope > .mmbox');
  if (box) { box.remove(); b.textContent = b.dataset.t; return; }
  box = document.createElement('div'); box.className = 'mmbox mapwrap'; host.appendChild(box); b.textContent = 'Hide map';
  try { await miniMap(box, JSON.parse(b.dataset.mm)); } catch (err) { box.innerHTML = `<div class="note">Could not load the map: ${esc(err.message)}</div>`; }
});

/* a one-line source summary on every item card (search hits, Obtainable, Discontinued, gear / best-set / clue / quest / monster-drop item links) */
let decoT = 0;
async function decorateCards() {
  const els = [...view.querySelectorAll('a.hit[href^="#items/"],a.item[href^="#items/"],.obtitle>a[href^="#items/"]')].filter(a => !a.dataset.sd && !a.closest('[data-nosrc]'));
  if (!els.length) return;
  els.forEach(a => { a.dataset.sd = '1'; });
  const S = await sumData();
  for (const a of els) {
    let n; try { n = decodeURIComponent(a.getAttribute('href').slice(7)); } catch (_) { continue; }
    const s = S[n]; if (s === undefined || !a.isConnected) continue;
    const el = document.createElement('small'); el.className = 'srcline' + (s ? '' : ' none');
    el.textContent = s || 'No source data on the RS3 wiki';
    if (a.classList.contains('hit')) a.appendChild(el);
    else if (a.parentElement.classList.contains('obtitle')) a.parentElement.after(el);
    else (a.querySelector('span') || a).appendChild(el);
  }
}
new MutationObserver(() => { if (!decoT) decoT = setTimeout(() => { decoT = 0; decorateCards(); }, 60); }).observe(view, {childList: true, subtree: true});
