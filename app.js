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
let ICONS = {}, EMOTES = {}, MTHUMB = {};

const PH = (glyph, size = 32) => `<span class="ph" style="width:${size}px;height:${size}px" title="Picture not downloaded yet">${glyph}</span>`;
function icon(item) {
  const f = ICONS[item];
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
function score(name, q) {
  const n = norm(name); if (!q) return 1;
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

/* ---------- items ---------- */
async function itemsView(name) {
  const [items] = await Promise.all([get('data/items.json'), loadThumbs()]);
  const names = Object.keys(items);
  if (name) {
    const src = items[name] || [];
    view.innerHTML = `<div class="row" style="margin-bottom:10px"><a class="btn ghost" href="#items">← Items</a></div>
    <div class="panel"><div class="row">${icon(name)}<h2 style="margin:0">${esc(name)}</h2></div>
    <div class="note" style="margin:6px 0 10px">Dropped by ${src.length} source${src.length === 1 ? '' : 's'}, best chance first.</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Dropped by</th><th>Qty</th><th>Rarity</th></tr></thead><tbody>
    ${src.map(s => `<tr><td>${s[5] ? `<a class="item" href="#drops/${encodeURIComponent(s[0])}">${mthumb(s[0], 32)}<span>${esc(s[0])}</span></a>` : `<span class="item">${PH('◆')}<span>${esc(s[0])} <span class="tag">other source</span></span></span>`}</td>
      <td>${esc(s[1])}</td><td class="num">${rarityCell(s[2], s[3], s[4])}</td></tr>`).join('')}</tbody></table></div></div>`;
    return;
  }
  view.innerHTML = `<div class="panel"><h2>Who drops it?</h2>${searchBox('q', 'e.g. abyssal whip, uncut dragonstone…', sessionStorage.iq || '')}
    <div class="note" style="margin-top:6px">${names.length.toLocaleString()} items appear in the drop tables.</div><div id="res" class="list"></div></div>`;
  const q = $('#q'), out = $('#res');
  const draw = () => {
    sessionStorage.iq = q.value; const nq = norm(q.value);
    if (!nq) { out.innerHTML = '<div class="note">Start typing an item name.</div>'; return; }
    const hits = names.map(n => [score(n, nq), n]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]).slice(0, 60);
    out.innerHTML = hits.map(([, n]) => `<a class="hit" href="#items/${encodeURIComponent(n)}">${icon(n)}<span>${esc(n)}</span><span class="meta">${items[n].length} source${items[n].length === 1 ? '' : 's'}</span></a>`).join('');
  };
  q.oninput = draw; draw(); q.focus();
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
async function questsView(name) {
  const qs = await get('data/quests.json');
  if (name) return questDetail(name, qs);
  const st = JSON.parse(sessionStorage.qf || '{"q":"","kind":"","mem":"","diff":""}');
  const diffs = [...new Set(qs.map(q => q[3]).filter(Boolean))].sort((a, b) => ['Novice', 'Intermediate', 'Experienced', 'Master', 'Grandmaster', 'Special'].indexOf(a) - ['Novice', 'Intermediate', 'Experienced', 'Master', 'Grandmaster', 'Special'].indexOf(b));
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  view.innerHTML = `<div class="panel"><h2>Quest helper</h2>${searchBox('q', 'Search quests…', st.q)}
    <div class="row" style="margin-top:8px">
      <select id="kind">${opt('', 'Quests & miniquests', st.kind)}${opt('quest', 'Quests', st.kind)}${opt('miniquest', 'Miniquests', st.kind)}</select>
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
  const [q, travel] = await Promise.all([get(`data/q/${row[10]}.json`), get('data/travel.json')]);
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
    <div class="row" style="margin-top:10px"><button class="btn ${done ? '' : 'ghost'}" id="qdone">${done ? '✓ Marked complete' : 'Mark quest complete'}</button></div></div></div></div>
  ${sec('Start', start)}${sec('Requirements', reqs)}
  ${sec('Items required', bulletList(q.items, true))}${sec('Recommended', bulletList(q.recommended, true))}${sec('Enemies to defeat', bulletList(q.kills))}
  ${q.steps && q.steps.length ? `<div class="panel"><h2>Walkthrough</h2>
    <div class="row"><div class="prog"><div id="bar"></div></div><span class="note" id="pct"></span>
    <label class="note"><input type="checkbox" id="hide"> Hide finished steps</label><button class="btn ghost" id="reset">Reset progress</button></div>
    <div class="note" style="margin:6px 0">${q.steps_source === 'quick guide' ? 'From the wiki quick guide.' : 'From the full wiki guide (no quick guide in this copy).'} Pictures are the wiki's own: images from the guide shown at the step they belong to, or the wiki picture of the place/NPC that step links to. Tap one to enlarge. Ticks are saved on this device only.</div>
    <div id="steps"></div></div>` : ''}
  ${(q.guide_pics || []).length ? `<div class="panel"><h2>More pictures from the wiki guide</h2><div class="note">These appear in the full wiki guide but don't clearly match one quick-guide step, so they are listed under the wiki's own section headings.</div>${q.guide_pics.map(g => `<h3 class="stepsec">${esc(g.sec)}</h3>${gallery(g.p)}`).join('')}</div>` : ''}
  ${sec('Rewards', bulletList(q.rewards))}`;
  $('#qdone').onclick = () => { if (qIsDone(name)) localStorage.removeItem(QDONE(name)); else localStorage.setItem(QDONE(name), '1'); questDetail(name, qs); };
  if (!q.steps || !q.steps.length) return;
  const prog = qProg(row[10]);
  const save = () => localStorage.setItem(QKEY(row[10]), JSON.stringify([...prog]));
  const hide = $('#hide'); hide.checked = localStorage.qhide === '1';
  const draw = () => {
    let last = null, n = 0;
    $('#steps').innerHTML = q.steps.map(s => {
      const ok = prog.has(s.id); n++;
      if (ok && hide.checked) return '';
      const h = s.sec !== last ? `<h3 class="stepsec">${esc(s.sec)}</h3>` : ''; last = s.sec;
      return h + `<div class="stepw ${ok ? 'done' : ''}">${s.p ? gallery(s.p, 'steppics') : ''}<label class="step ${ok ? 'done' : ''}"><input type="checkbox" data-id="${s.id}" ${ok ? 'checked' : ''}><span><span class="sn">${n}.</span> ${esc(s.t)}
        ${s.sub && s.sub.length ? `<ul class="blist">${s.sub.map(x => `<li style="margin-left:${(x.d - 1) * 16}px">${esc(x.t)}</li>`).join('')}</ul>` : ''}</span></label></div>`;
    }).join('');
    const pc = Math.round(100 * [...prog].filter(id => q.steps.some(s => s.id === id)).length / q.steps.length);
    $('#bar').style.width = pc + '%'; $('#pct').textContent = `${pc}% done`;
    $('#steps').querySelectorAll('input[data-id]').forEach(cb => cb.onchange = () => { cb.checked ? prog.add(cb.dataset.id) : prog.delete(cb.dataset.id); save(); draw(); });
  };
  hide.onchange = () => { localStorage.qhide = hide.checked ? '1' : '0'; draw(); };
  $('#reset').onclick = () => { if (confirm('Clear all ticks for this quest?')) { prog.clear(); save(); draw(); } };
  draw();
}

/* ---------- about ---------- */
async function aboutView() {
  const m = await get('data/meta.json');
  const cc = Object.entries(m.clue_counts).map(([t, o]) => `<tr><td>${esc(cap(t.replace('_', ' ')))}</td><td>${Object.entries(o).map(([k, v]) => `${TYPE_LABEL[k] || k} ${v}`).join(' · ')}</td></tr>`).join('');
  view.innerHTML = `<div class="panel parch"><h2>About this app</h2>
    <p><b>Made by Dev. Soy Yoda.</b></p>
    <p><b>Unofficial fan-made tool.</b> All images and game content are the property of Jagex Ltd. RuneScape is a trademark of Jagex Ltd.
    This is an unofficial, fan-made tool for personal use only. It is not affiliated with or endorsed by Jagex, and it is not for sale or for profit.</p>
    <p>Data and images come from the RuneScape Wiki (<a href="https://runescape.wiki" target="_blank" rel="noopener">runescape.wiki</a>), whose text is licensed
    <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener">CC BY-NC-SA 3.0</a>. This app re-uses an offline copy of that content, reformatted; mistakes in extraction are ours, not the wiki's.
    Font: Fira Sans (SIL Open Font License).</p></div>
  <div class="panel"><h2>What's inside</h2><div class="kv">
    <b>Built</b><span>${esc(m.built)}</span><b>Monsters</b><span>${m.monsters.toLocaleString()}</span><b>Drop entries</b><span>${m.drop_entries.toLocaleString()}</span>
    <b>Items</b><span>${m.items.toLocaleString()} (${m.icons.toLocaleString()} with icons)</span><b>Clues</b><span>${m.clues.toLocaleString()}</span><b>Travel pages</b><span>${m.locations.toLocaleString()}</span></div>
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
    LAUNCHER = j; const b = $('#updbtn'); b.hidden = false; b.onclick = checkUpdates;
    const p = document.getElementById('updpanel');
    if (p) { p.hidden = false; $('#updver').textContent = 'Installed version: ' + (j.current || 'unknown'); $('#updcheck').onclick = checkUpdates; }
  } catch (e) {}
}

/* ---------- boot ---------- */
(async () => {
  try { const ic = await get('data/icons.json'); ICONS = ic.items || ic; EMOTES = ic.emotes || {}; } catch (e) { ICONS = {}; }
  route(); detectLauncher();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
