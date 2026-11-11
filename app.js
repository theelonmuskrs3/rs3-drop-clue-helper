'use strict';
/* Unofficial RS3 companion: local wiki copy plus explicitly labeled live RS3 trade prices. */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const cache = {};
const get = async p => cache[p] ??= fetch(p).then(r => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); });
const view = $('#view');
const LIVE = RS3Prices.createService();
let priceUnsubscribe = null, priceDraws = [];
const RANK = ['Always', 'Common', 'Uncommon', 'Rare', 'Very rare'];
const TIERS = ['beginner', 'easy', 'medium', 'hard', 'elite', 'master', 'cs_week', 'unknown'];
const TYPE_LABEL = {emote: 'Emote', anagram: 'Anagram', coordinate: 'Coordinate', cryptic: 'Cryptic', simple: 'Simple', map: 'Map',
  scan: 'Scan', compass: 'Compass', cs_week: 'CS Week', cipher: 'Cipher'};
const cap = s => s === 'cs_week' || s === 'cs week' ? 'CS Week' : s ? s[0].toUpperCase() + s.slice(1) : s;
let ICONS = {}, EMOTES = {}, MTHUMB = {}, SRCPICS = {};

/* no official picture for this one: show no picture slot at all (never a made-up placeholder). The hidden marker lets checks/img_check.py count them. */
const PH = () => '<i class="noimg" aria-hidden="true"></i>';
const DOSES = [' (4)', ' (3)', ' (2)', ' (1)', ' (6)', ' (5)'];
function iconFile(item) {
  let f = ICONS[item] || GICONS[item] || IICONS[item];
  for (let i = 0; !f && i < DOSES.length; i++) f = ICONS[item + DOSES[i]] || GICONS[item + DOSES[i]] || IICONS[item + DOSES[i]];
  return f;
}
function icon(item) {
  const f = iconFile(item);
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

/* Responsive presentation for every app-owned table, including async wiki HTML.
 * Keep original nodes/content/events, colspan/rowspan and real header associations.
 * Phone cards label each value; desktop remains a table. Never touch iframe DOM.
 */
let responsiveTableId = 0;
function prepareAppTable(table) {
  if (!view.contains(table)) return;
  table.classList.add('rtable');
  const rows = [...table.rows].filter(r => r.closest('table') === table);
  const top = [];
  for (const row of rows) {
    if ((table.tHead && row.parentElement === table.tHead) || (!table.tHead && row.cells.length && [...row.cells].every(c => c.tagName === 'TH'))) top.push(row);
    else break;
  }
  const grid = [], headers = [];
  let columns = 0;
  top.forEach((row, ri) => {
    row.classList.add('rtable-head');
    grid[ri] ||= []; let ci = 0;
    for (const cell of row.cells) {
      while (grid[ri][ci]) ci++;
      if (!cell.id) cell.id = 'rtable-h-' + (++responsiveTableId);
      if (!cell.hasAttribute('scope')) cell.scope = 'col';
      for (let y = ri; y < ri + cell.rowSpan; y++) {
        grid[y] ||= [];
        for (let x = ci; x < ci + cell.colSpan; x++) grid[y][x] = cell;
      }
      ci += cell.colSpan; columns = Math.max(columns, ci);
    }
  });
  for (let ci = 0; ci < columns; ci++) headers[ci] = [...new Set(grid.flatMap(r => r[ci] ? [r[ci]] : []))];
  const occupied = [];
  rows.filter(r => !top.includes(r)).forEach((row, ri) => {
    occupied[ri] ||= []; let ci = 0;
    for (const cell of row.cells) {
      while (occupied[ri][ci]) ci++;
      const hs = [...new Set(headers.slice(ci, ci + cell.colSpan).flat())];
      const label = hs.map(h => (h.dataset.shortLabel || h.textContent).trim().replace(/\s+/g, ' ')).filter(Boolean).join(' / ');
      if (cell.dataset.cellLabel !== label) cell.dataset.cellLabel = label;
      if (hs.length && !cell.hasAttribute('headers')) cell.setAttribute('headers', hs.map(h => h.id).join(' '));
      if (cell.tagName === 'TH' && !cell.hasAttribute('scope')) cell.scope = 'row';
      cell.classList.toggle('rtable-span', cell.colSpan > 1);
      if (cell.rowSpan > 1) cell.dataset.rowSpanNote = 'Applies to ' + cell.rowSpan + ' rows';
      for (let y = ri; y < ri + cell.rowSpan; y++) {
        occupied[y] ||= [];
        for (let x = ci; x < ci + cell.colSpan; x++) occupied[y][x] = cell;
      }
      ci += cell.colSpan; columns = Math.max(columns, ci);
    }
  });
  table.classList.toggle('rtable-wide', columns >= 5);
  table.classList.toggle('rtable-many', columns >= 8);
  table.classList.toggle('rtable-sortable', !!table.querySelector('th[data-k], th button, th a'));
  if (table.parentElement && table.parentElement.children.length === 1) table.parentElement.classList.add('rtable-wrap');
}
function prepareAppTables(root = view) { root.querySelectorAll('table').forEach(prepareAppTable); }
const responsiveTables = new MutationObserver(records => {
  const tables = new Set();
  for (const record of records) {
    if (record.target.nodeType === 1 && record.target.matches('table,thead,tbody,tfoot,tr')) {
      const t = record.target.closest('table'); if (t) tables.add(t);
    }
    for (const node of record.addedNodes) if (node.nodeType === 1) {
      if (node.matches('table')) tables.add(node);
      node.querySelectorAll('table').forEach(t => tables.add(t));
    }
  }
  tables.forEach(prepareAppTable);
});
responsiveTables.observe(view, {childList:true, subtree:true});

/* ---------- tabs / routing ---------- */
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { location.hash = b.dataset.tab; });
/* Easter eggs live under Items (route #secrets kept for links); About is linked from the footer, not a main tab. */
const TAB_HOME = {secrets: 'items'};
function setTab(t) { t = TAB_HOME[t] || t; document.querySelectorAll('.tabs button').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); }
let geCleanup = null;
async function route() {
  if (geCleanup) { geCleanup(); geCleanup = null; }
  if (priceUnsubscribe) { priceUnsubscribe(); priceUnsubscribe = null; }
  priceDraws = [];
  const [tab, ...rest] = (location.hash.slice(1) || 'drops').split('/');
  let arg = ''; try { arg = rest.length ? decodeURIComponent(rest.join('/')) : ''; } catch (_) { arg = rest.join('/'); }
  setTab(tab); document.body.classList.toggle('intrain', tab === 'train' || tab === 'money');
  try {
    if (tab === 'items') await itemsView(arg);
    else if (tab === 'char') await charView(arg);
    else if (tab === 'clues') await cluesView(arg);
    else if (tab === 'about') await aboutView();
    else if (tab === 'quests') await questsView(arg);
    else if (tab === 'secrets') await secretsView(arg);
    else if (tab === 'train') await trainView(arg);
    else if (tab === 'money') await moneyView(arg);
    else if (tab === 'map') await mapTab(arg);
    else if (tab === 'ge') geView();
    else if (tab === 'calculators') await calcView(arg);
    else await dropsView(arg);
  } catch (e) { view.innerHTML = `<div class="panel">Could not load data: ${esc(e.message)}</div>`; }
  if ((['items', 'char', 'train', 'money', 'secrets'].includes(tab) && !(tab === 'items' && arg === '~ge')) || (tab === 'calculators' && RS3Calc.nativeBySlug(arg))) bindPriceView();
  prepareAppTables();
  if (!(tab === 'secrets' && arg)) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------- search helper ---------- */
function searchBox(id, ph, val = '') {
  if (window.matchMedia && matchMedia('(max-width:420px)').matches && ph.length > 28) { const c = ph.slice(0, 27); ph = c.slice(0, Math.max(c.lastIndexOf(' '), 10)).replace(/[,:;\s]+$/, '') + '…'; }
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
  return IDATA = {items, pr, gd, gear, best, names, tierN, ia, row, byPage, FL: ia.fl || {}, alias: {}, gi: new Map()};
}
const rowOf = (D, n) => { const i = D.row[n] ?? D.byPage[n]; return i == null ? null : D.ia.rows[i]; };
const hasF = (D, n, k) => { const r = rowOf(D, n); return !!(r && D.FL[k] && (r[3] & D.FL[k])); };
const dropsOf = (D, n) => D.items[n] || (() => { const r = rowOf(D, n); return r && r[4] ? D.items[r[4]] : null; })();
function snapshotPriceOf(D, n) { const v = D.pr.prices[n]; if (v != null) return v; const g = D.gear[n]; if (g && g.ge != null) return g.ge; const r = D.row[n] != null ? D.ia.rows[D.row[n]] : null; return r && r[2] != null ? r[2] : null; }
// A numeric live price never falls back to a guide snapshot. Unknown/stale sorts last.
function priceOf(D, n, side = 'buy') { return LIVE.book.number(n, side); }
const priceCompare = (a, b, asc = false) => a == null ? (b == null ? 0 : 1) : b == null ? -1 : asc ? a - b : b - a;
const priceTime = ts => ts ? new Date(ts * 1000).toLocaleString('en-US', {timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'}) + ' ET' : 'no trade timestamp';
function quoteContents(n, side, snapshot, date, showGraph = false) {
  const now = Date.now(), q = LIVE.book.quote(n, side, now), label = side === 'buy' ? 'Buy' : 'Sell';
  const time = priceTime(q.time);
  const guide = snapshot != null && Number.isFinite(snapshot) ? `<small class="price-age">Guide snapshot: ${gp(snapshot)} · ${esc(date)}</small>` : '';
  const graph = showGraph && q.id && side === 'buy' ? `<a class="price-age" href="https://prices.runescape.wiki/rs/item/${q.id}" target="_blank" rel="noopener noreferrer">Source prices &amp; graph ↗</a>` : '';
  const sale = side === 'sell' && q.live ? LIVE.book.sale(n, now) : null;
  const taxLine = sale ? `<small class="price-tax">Est. 2% tax ${gp(sale.tax)} · Net ${gp(sale.net)}</small>` : '';
  if (q.live) return `<span class="gp" title="RuneScape Wiki Prices; ${esc(time)}">${label} ${gp(q.value)}</span>${taxLine}<small class="price-age">Observed ${esc(time)}</small>${guide}${graph}`;
  const observed = q.value != null ? `${label} ${gp(q.value)} · ${q.status} · ${time}` : `${label}: ${q.status === 'unmapped' ? 'no exact RS3 mapping' : 'no current quote'}`;
  return `<span class="note">${esc(observed)}</span>${guide}${graph}`;
}
function livePriceTag(n, side = 'buy', snapshot = null, date = '', showGraph = false) {
  return `<span class="live-price" data-live-item="${esc(n)}" data-live-side="${side}"${showGraph ? ' data-live-graph="true"' : ''}${snapshot != null ? ` data-guide="${snapshot}" data-guide-date="${esc(date)}"` : ''}>${quoteContents(n, side, snapshot, date, showGraph)}</span>`;
}
function watchPriceDraw(fn, root) {
  priceDraws.push(() => {
    if (root && !root.isConnected) return;
    const details = new Map(root ? [...root.querySelectorAll('details')].map((e, i) => [e.dataset.id || e.id || 'index:' + i, e.open]) : []);
    fn();
    if (root) [...root.querySelectorAll('details')].forEach((e, i) => { const key = e.dataset.id || e.id || 'index:' + i; if (details.has(key)) e.open = details.get(key); });
  });
}
function refreshPriceView() {
  for (const fn of priceDraws) fn();
  view.querySelectorAll('[data-live-item]').forEach(e => {
    e.innerHTML = quoteContents(e.dataset.liveItem, e.dataset.liveSide, e.hasAttribute('data-guide') ? +e.dataset.guide : null, e.dataset.guideDate || 'wiki copy', e.dataset.liveGraph === 'true');
  });
  view.querySelectorAll('[data-mm-estimate]').forEach(e => { const m = MM.models && MM.models[e.dataset.mmEstimate]; if (m) e.innerHTML = mmEstimateHTML(m); });
  const status = $('#live-price-status');
  if (status) status.textContent = LIVE.book.online === false ? 'Offline — cached observations and guide snapshots are not live; live ranking is unavailable.'
    : LIVE.book.connected ? `Last successful price fetch: ${priceTime(LIVE.book.fetchedAt / 1000)}. Trade quotes older than 15 minutes are excluded from live totals/rankings.`
    : 'Live source unavailable or loading — snapshots and cached observations are not ranked as live.';
}
function bindPriceView() {
  view.insertAdjacentHTML('afterbegin', `<aside class="live-price-banner"><b>RuneScape Wiki Prices — trade data supplied by Jagex</b><div>Buy/high = acquisition cost (no buyer tax). Sell/low = gross; net deducts estimated 2% tax, rounded down per item (Bond exempt). Money ranks net profit. Observed trades are not guaranteed offers; degradation and unlisted costs excluded. Wiki rates/prose remain snapshots.</div><div id="live-price-status" role="status"></div><a href="https://prices.runescape.wiki/rs/" target="_blank" rel="noopener noreferrer">Price source &amp; graphs ↗</a></aside>`);
  priceUnsubscribe = LIVE.subscribe(refreshPriceView);
  // Initial values already rendered; update tags/status but avoid resetting any inputs or open panels.
  refreshPriceView();
}

function tradeOf(D, n) {
  if (snapshotPriceOf(D, n) != null || LIVE.book.resolve(n) != null) return true;
  const t = D.pr.tradeable[n]; if (t != null) return !!t;
  const g = D.gear[n]; if (g && g.trade != null) return g.trade;
  const r = D.row[n] != null ? D.ia.rows[D.row[n]] : null;
  return r ? (r[3] & D.FL.trade ? true : r[3] & D.FL.untr ? false : null) : null;
}
function geDateET(D) {
  const d = new Date(D.pr.ts * 1000);
  return d.toLocaleString('en-US', {timeZone: 'America/New_York', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'}) + ' ET';
}
function priceTag(D, n, side = 'buy', showGraph = false) {
  if (tradeOf(D, n) === false) return '<span class="untr">Untradeable</span>';
  return livePriceTag(n, side, snapshotPriceOf(D, n), geDateET(D), showGraph);
}

function rarTag(r) { return r == null ? '' : `<span class="rtag r${r}">${RANK[r]}</span>`; }
function subnav(on) {
  const b = (h, t, k) => `<a class="btn sub ${on === k ? 'on' : ''}" href="${h}">${t}</a>`;
  return `<div class="row subnav">${b('#items', 'Search · rarity · prices', 'search')}${b('#items/~obtain', 'Obtainable · worth money · cosmetics', 'obtain')}${b('#items/~disc', 'Discontinued', 'disc')}${b('#items/~all', '🔎 Search all items', 'all')}${b('#secrets', 'Easter eggs', 'secrets')}<a class="btn sub" href="#ge">Grand Exchange</a><a class="btn sub chlink" href="#char" title="Your levels now live in the Character tab">Edit my stats → Character</a></div>`;
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
    out[k] = Math.max(k === 'Constitution' ? 10 : 1, Math.min(skMax(k), Math.floor(x))); n++;
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
  b.innerHTML = '<span><b>Welcome!</b> Enter your own skill levels so the gear and quest helpers fit <i>your</i> account. They are saved only on this device; nothing is sent anywhere.</span><a class="btn" href="#char">Enter my levels</a><button class="btn ghost" type="button" id="welx" aria-label="Dismiss">Later</button>';
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
  return D.gd.gear.filter(g => styleOk(g, st) && reqMet(g, S) && (!opt.hideDung || !g.dung) && (!opt.hideRec || !g.recolour) && (!opt.hideRst || !RESTRICTED.has(g.rst)) && (!opt.trade || tradeOf(D, g.n) === true));
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
function gearRow(D, g, st, extra = '') {
  return `<tr><td><a class="item" href="#items/${encodeURIComponent(g.n)}">${icon(g.n)}<span>${esc(g.n)}</span></a>${g.dung ? ' <span class="tag">Daemonheim</span>' : ''}${g.rst && g.rst !== 'dungeoneering' ? ` <span class="tag">${esc(RST_LABEL[g.rst] || g.rst)}</span>` : ''}${g.type ? ` <span class="tag">${esc(g.type)}</span>` : ''}</td>
    <td>${esc(SLOT_LABEL[g.slot] || g.slot || '')}</td><td class="num">${g.tier ?? esc(g.tier_text || '')}</td><td>${esc(keyStat(g, st))}</td><td>${esc(reqText(g))}</td><td class="num">${priceTag(D, g.n)}</td>${extra}</tr>`;
}
/* Character tab: 'Best set for my stats' + 'All gear I can wear' (moved here from the Items tab). S is the Character tab's live levels object; the returned draw() re-runs both when a level changes. */
function gearHub(D, S, mount) {
  const pf = loadPrefs();
  const opt = sjson(sessionStorage, 'gearopt', {style: 'melee', mode: 'pvm', slot: '', sort: 'tier', hideDung: true, hideRec: true, hideRst: true, trade: false, more: 0});
  if (pf.style) opt.style = pf.style; if (pf.mode) opt.mode = pf.mode;
  mount.innerHTML = `<div class="chbox"><h3>Best set for your stats</h3><div class="chips" id="sty">${Object.entries(STYLES).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div>
    <div class="chips" id="mode"><button data-v="pvm">PvM</button><button data-v="pvp">PvP</button></div><div id="best"></div></div>
    <div class="chbox"><h3>All gear you can wear</h3><div class="row">
      <select id="slot"><option value="">Every slot</option>${SLOT_ORDER.map(s => `<option value="${s}">${SLOT_LABEL[s]}</option>`).join('')}</select>
      <select id="sort"><option value="tier">Tier, high → low</option><option value="dmg">Damage / style bonus</option><option value="arm">Armour</option><option value="price">Observed Buy, high → low</option><option value="pricel">Observed Buy, low → high</option><option value="name">Name A–Z</option></select></div>
      <div class="row" style="margin-top:6px"><label class="chk"><input type="checkbox" id="hd"> Hide Daemonheim-only gear</label><label class="chk"><input type="checkbox" id="hs"> Hide minigame/quest-only and removed gear</label><label class="chk"><input type="checkbox" id="hr"> Hide recolours</label><label class="chk"><input type="checkbox" id="tr"> On the GE only</label></div>
      <div id="all"></div></div>`;
  const setChips = () => { document.querySelectorAll('#sty button').forEach(b => b.classList.toggle('on', b.dataset.v === opt.style)); document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.v === opt.mode)); };
  $('#slot').value = opt.slot; $('#sort').value = opt.sort; $('#hd').checked = opt.hideDung; $('#hr').checked = opt.hideRec; $('#hs').checked = opt.hideRst; $('#tr').checked = opt.trade;
  const draw = () => {
    sessionStorage.gearopt = JSON.stringify({...opt, more: 0}); savePrefs(opt); setChips();
    const st = opt.style, bs = bestSet(D, S, st, opt.mode, opt);
    const recPage = D.gd.recommended[st] && D.gd.recommended[st].page;
    const q = D.gd.pvp_quotes || [];
    const total = LIVE.book.total(bs.map(x => ({n: x.g.n, q: 1})), 'buy');
    $('#best').innerHTML = `<div class="note" style="margin:8px 0">${opt.mode === 'pvm'
      ? `Picks come from the wiki's <a href="${WIKI(recPage)}" target="_blank" rel="noopener noreferrer">${esc(recPage)}</a> tables: for each slot, the highest-tier entry whose requirements you meet. A slot the wiki table has nothing for at your levels falls back to a stat rule (marked). Two-handed and main-hand + off-hand are shown side by side; use one or the other.`
      : `Head, body and legs: the piece with the most PvP damage reduction you can wear, worked out with the wiki's Armour page formula. Other slots: the wiki has no PvP-specific picks, so the PvM pick or the stat rule is shown, and it says so.`}</div>
      <div style="overflow-x:auto"><table><thead><tr><th>Slot</th><th>Item</th><th>Tier</th><th>Stats (wiki)</th><th>Price</th><th>Why</th></tr></thead><tbody>
      ${bs.map(x => `<tr><td>${esc(SLOT_LABEL[x.slot])}</td><td><a class="item" href="#items/${encodeURIComponent(x.g.n)}">${icon(x.g.n)}<span>${esc(x.g.n)}</span></a></td><td class="num">${x.g.tier ?? ''}</td>
        <td>${esc(keyStat(x.g, st))}</td><td class="num">${priceTag(D, x.g.n)}</td><td class="why">${esc(x.why)}${x.src ? ` <a class="note" href="${WIKI(x.src)}" target="_blank" rel="noopener noreferrer">[wiki]</a>` : ''}${x.note ? `<div class="note">${esc(x.note).replace(/\n/g, '<br>')}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="note">Nothing to show.</td></tr>'}
      </tbody></table></div><div class="note" style="margin-top:6px">Observed buy total of all listed alternatives: ${total.complete ? gp(total.value) : 'Incomplete — unavailable/stale/untradeable: ' + esc(total.missing.join(', '))}. Both weapon alternatives are included, not a single loadout. Picks still follow wiki tiers/stats, not a value-for-money rule.</div>
      ${opt.mode === 'pvp' ? `<div class="quotes">${q.filter(x => /PvP/.test(x.text) || x.page === 'Player versus player').map(x => `<blockquote>“${esc(x.text)}” <a href="${WIKI(x.page)}" target="_blank" rel="noopener noreferrer">— ${esc(x.page)}</a></blockquote>`).join('')}
        <div class="note">PvP-type armour sets on the wiki's Armour page: ${D.gd.armour_sets.filter(s => s.type === 'PvP' && s.styles.includes(STYLES[st])).map(s => `<a href="${WIKI(s.set)}" target="_blank" rel="noopener noreferrer">${esc(s.set)}</a> (level ${s.level})${lv(S, 'Defence') >= s.level ? ' ✓' : ''}`).join(', ') || 'none for this style'}. ✓ = your Defence is at least that level.</div></div>`
      : `<div class="quotes">${q.filter(x => x.page === 'Recommended equipment for PvM').map(x => `<blockquote>“${esc(x.text)}” <a href="${WIKI(x.page)}" target="_blank" rel="noopener noreferrer">— ${esc(x.page)}</a></blockquote>`).join('')}</div>`}`;
    let list = usable(D, S, st, opt).filter(g => !opt.slot || g.slot === opt.slot);
    const sb = STYLE_BONUS[st];
    const sorts = {tier: ruleSort(st), dmg: (a, b) => ((b.damage ?? b[sb] ?? -1) - (a.damage ?? a[sb] ?? -1)), arm: (a, b) => (b.armour ?? -1) - (a.armour ?? -1),
      price: (a, b) => priceCompare(priceOf(D, a.n), priceOf(D, b.n)), pricel: (a, b) => priceCompare(priceOf(D, a.n), priceOf(D, b.n), true), name: (a, b) => a.n.localeCompare(b.n)};
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
  watchPriceDraw(draw, mount);
  draw();
  return draw;
}
function wikiSetsHub(D, S, mount) {
  const opt = sjson(sessionStorage, 'setopt', {style: 'melee', type: ''}); { const pf = loadPrefs(); if (pf.style) opt.style = pf.style; }
  mount.innerHTML = `<div class="chbox"><h3>Best sets by style and tier</h3>
    <div class="chips" id="wsty">${Object.entries(STYLES).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div><div id="wsout"></div></div>`;
  const draw = () => {
    sessionStorage.setopt = JSON.stringify(opt); { const pf = loadPrefs(); savePrefs({style: opt.style, mode: pf.mode || 'pvm'}); }
    document.querySelectorAll('#wsty button').forEach(b => b.classList.toggle('on', b.dataset.v === opt.style));
    const rec = D.gd.recommended[opt.style];
    const tabs = {}; (rec ? rec.rows : []).forEach(r => { (tabs[r.sec + ' · ' + r.tab] ??= []).push(r); });
    const ok = n => { const g = D.gear[n]; return g ? reqMet(g, S) : null; };
    const types = ['Power', 'PvP', 'Tank', 'Hybrid', 'All'];
    const sets = D.gd.armour_sets.filter(s => s.styles.includes(STYLES[opt.style]) && (!opt.type || s.type === opt.type)).sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
    $('#wsout').innerHTML = `<h3>Wiki recommended PvM equipment</h3><div class="note">From <a href="${WIKI(rec.page)}" target="_blank" rel="noopener noreferrer">${esc(rec.page)}</a>, in the wiki's order (lowest tier first). ✓ = you meet the item's requirements with your saved levels; ✗ = you don't yet; ? = the item page has no stats in the copy.</div>
      ${Object.entries(tabs).map(([t, rows]) => `<details ${/Weapons|Armour/.test(t) ? 'open' : ''}><summary>${esc(t)} <span class="note">(${rows.length})</span></summary><div style="overflow-x:auto"><table><thead><tr><th>Tier</th><th>Items</th><th>Price</th><th>Notes (wiki)</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td class="num">${r.tier ?? (r.style_bonus != null ? `bonus ${r.style_bonus}` : '')}${r.tier_note ? '*' : ''}</td>
          <td>${r.items.map(n => { const o = ok(n); return `<div><a class="item" href="#items/${encodeURIComponent(n)}">${icon(n)}<span>${esc(n)}</span></a> ${o == null ? '<span class="note">?</span>' : o ? '<span class="ok">✓</span>' : '<span class="no">✗</span>'}</div>`; }).join('')}</td>
          <td class="num">${r.items.map(n => `<div>${priceTag(D, n)}</div>`).join('')}</td><td class="note">${esc(r.note).replace(/\n/g, '<br>')}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}
      <h3 style="margin-top:14px">Armour sets by type (wiki Armour page)</h3><div class="chips" id="wstyp"><button data-v="">All types</button>${types.map(t => `<button data-v="${t}">${t}</button>`).join('')}</div>
      <div class="note" style="margin:6px 0">${esc((D.gd.pvp_quotes.find(x => /^In general players should choose/.test(x.text)) || {}).text || '')}</div>
      <div style="overflow-x:auto"><table><thead><tr><th>Set</th><th>Level</th><th>Type</th><th>Styles</th><th>You</th></tr></thead><tbody>
      ${sets.map(s => `<tr><td><a href="${WIKI(s.set)}" target="_blank" rel="noopener noreferrer">${esc(s.set)}</a>${s.note ? ` <span class="note">${esc(s.note)}</span>` : ''}</td><td class="num">${s.level ?? ''}</td><td>${esc(s.type)}</td><td>${esc(s.styles.join(', '))}</td>
        <td>${s.level == null ? '' : lv(S, 'Defence') >= s.level ? '<span class="ok">✓</span>' : '<span class="no">✗</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="note">“You” compares the set's level with your saved Defence level.</div>`;
    document.querySelectorAll('#wstyp button').forEach(b => { b.classList.toggle('on', b.dataset.v === opt.type); b.onclick = () => { opt.type = b.dataset.v; draw(); }; });
  };
  document.querySelectorAll('#wsty button').forEach(b => b.onclick = () => { opt.style = b.dataset.v; draw(); });
  draw();
  return draw;
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
/* Requirements block on item pages: the wiki equipment infobox/Equipment table skill levels (checked against this device's saved levels) plus the wiki's own requirement sentences from the item page */
function itemReqBlock(g, d, page) {
  const have = STATS_SAVED ? loadStats() || {} : null, ch = [];
  const lvl = k => have ? lv(have, k) : null;
  if (g) for (const [k, v] of Object.entries(g.req || {})) {
    const L = lvl(k), cls = L == null ? '' : L >= v ? ' ok' : ' no';
    ch.push(`<span class="tag rq${cls}" title="${L == null ? 'Save your levels in the Character tab to check this' : `Your ${esc(k)}: ${L}`}">${L == null ? '' : L >= v ? '✓ ' : '✗ '}${v} ${esc(k)}</span>`);
  }
  if (g && g.req_other) ch.push(`<span class="tag rq">${esc(g.req_other)}</span>`);
  const qs = d && d.rqq ? d.rqq : [];
  for (const q of qs) { const dn = qIsDone(q); ch.push(`<a class="tag rq${dn ? ' ok' : ''}" href="#quests/${encodeURIComponent(q)}">${dn ? '✓ ' : ''}Quest: ${esc(q)}</a>`); }
  const txt = d && d.rq ? `<div class="note rqt">From the wiki (<a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">${esc(page)}</a>): “${esc(d.rq)}”</div>` : '';
  if (!ch.length && !txt) return g ? '<h3>Requirements</h3><div class="note">The wiki lists no skill requirement for this item.</div>' : '';
  return `<h3>Requirements</h3><div class="rqrow">${ch.join('')}</div>${have ? '' : (ch.some(c => c.includes('rq"') || c.includes('rq ')) && g && Object.keys(g.req || {}).length ? '<div class="note">Save your levels in the Character tab to see ✓ / ✗ for each skill.</div>' : '')}${txt}`;
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
/* ---------- Character tab: my levels (moved here from Items → My stats), total/combat level, "what can I do now" ----------
   Storage is unchanged: same localStorage keys (mystats_v2 + _bak), per device, never sent anywhere. Skill groups are the wiki's Skills page
   ("Skill types": Combat, Artisan, Gathering, Support; Invention is the elite skill). The XP numbers are the wiki's experience formula
   (level 99 = 13,034,431 xp, 110 = 38,737,661, 120 = 104,273,167 on the wiki's Experience page); Invention has its own curve, so it gets no XP bar. */
const CH_GROUPS = [['Combat', ['Attack', 'Strength', 'Defence', 'Constitution', 'Ranged', 'Prayer', 'Magic', 'Necromancy', 'Summoning']],
  ['Gathering', ['Mining', 'Woodcutting', 'Fishing', 'Hunter', 'Farming', 'Divination', 'Archaeology']],
  ['Artisan', ['Smithing', 'Crafting', 'Fletching', 'Herblore', 'Cooking', 'Firemaking', 'Runecrafting', 'Construction']],
  ['Support', ['Agility', 'Thieving', 'Slayer', 'Dungeoneering']], ['Elite', ['Invention']]];
const xpAt = L => { let t = 0; for (let i = 1; i < L; i++) t += Math.floor(i + 300 * Math.pow(2, i / 7)); return Math.floor(t / 4); };
const skMin = k => k === 'Constitution' ? 10 : 1;
function chGo(kind) {
  const S = loadStats();
  if (kind === 'wear' || kind === 'sets') { try { sessionStorage.gfopt = JSON.stringify({...GF_DEF, wear: true, view: kind === 'sets' ? 'sets' : 'items'}); sessionStorage.removeItem('iopt'); sessionStorage.removeItem('iq'); } catch (e) {} location.hash = '#items'; }
  else if (kind === 'train') { TR.fit = true; location.hash = '#train'; }
  else if (kind === 'money') { MM.fit = 'ok'; location.hash = '#money'; }
  else if (kind === 'quest') { try { sessionStorage.qf = JSON.stringify({q: '', kind: 'quest', mem: '', diff: '', st: 'todo'}); } catch (e) {} location.hash = '#quests'; }
  return S;
}
const CH_ICO = {
  wear: '<path d="M8 1.5l5.6 3.25v6.5L8 14.5l-5.6-3.25v-6.5z"/><path d="M8 5v6M5.4 6.5h5.2"/>',
  sets: '<path d="M2.5 3.5h11l-1 3.2-2 .8V14h-5V7.5l-2-.8z"/>',
  train: '<path d="M2 13.5h12M3 10.5l3.2-3.2 2.4 2.2L13 4.8M9.8 4.5H13v3.2"/>',
  money: '<circle cx="8" cy="8" r="6.3"/><path d="M8 4v8M10.2 6c-.4-1-4.2-1.2-4.2.9 0 2.1 4.2 1 4.2 3.1 0 2-3.800 1.900-4.300.6"/>',
  quest: '<path d="M8 1.5l5.5 2v4c0 3.4-2.4 5.9-5.5 7-3.1-1.1-5.5-3.6-5.5-7v-4z"/><path d="M5.6 8l1.7 1.7 3.2-3.4"/>'};
async function charView(sub) {
  const S = loadStats(), BASE = {...S};
  let undo = null;
  /* skills: the original My stats interface (3-column grid, wiki skill icon + level input, in-game order), restored from the Items tab */
  const tile = k => `<label class="sk" data-k="${esc(k)}" title="${esc(k)} (max ${skMax(k)})">${SKICONS[k] ? `<img src="${esc(SKICONS[k])}" alt="" width="27" height="27">` : `<span>${esc(k.slice(0, 3))}</span>`}<input type="number" inputmode="numeric" min="${skMin(k)}" max="${skMax(k)}" aria-label="${esc(k)} level (${skMin(k)} to ${skMax(k)})" title="${esc(k)}" data-sk="${esc(k)}" value="${lv(S, k)}"></label>`;
  const maxTot = SKORDER.reduce((a, k) => a + skMax(k), 0);
  const tiles = [['wear', 'Gear I can wear', 'Items filtered to your levels'], ['sets', 'Full sets I can wear', 'Whole armour sets that fit'], ['train', 'Training that fits me', 'Training guides for your levels'], ['money', 'Money making that fits', 'Methods that fit your levels'], ['quest', 'Quests to do', 'Quests you have not finished']];
  view.innerHTML = `<section class="panel chhero"><div class="chhead"><div class="chdds" aria-hidden="true"><span class="chglow"></span><img src="brand/dds.webp" width="64" height="58" alt="" decoding="async"></div>
      <div class="chtitle"><h2>My Character</h2><div class="chsub">Your levels fit the gear, money, training and quest helpers to <i>your</i> account.</div></div></div>
    <div class="chbig"><div class="chn tot"><span class="chl">Total level</span><b class="chv" id="tot">${totalLevel(S)}</b><span class="chm">of ${maxTot.toLocaleString()}</span></div>
      <div class="chn cmb"><span class="chl">Combat level</span><b class="chv" id="cmb">${combatLevel(S)}</b><span class="chm">wiki formula</span></div>
      <div class="chn"><span class="chl">Skills at 99+</span><b class="chv" id="n99">0</b><span class="chm" id="nmx">0 maxed</span></div>
      <div class="chn"><span class="chl">Quests done</span><b class="chv" id="nq">–</b><span class="chm" id="nqm">tracked here</span></div></div>
    <div class="chpriv"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 7.5h9V14h-9zM5.2 7.5V5.2a2.8 2.8 0 015.6 0v2.3"/></svg><span>Private: saved automatically in this browser on this device only, never sent anywhere. Each device keeps its own levels.${STATS_SAVED ? '' : ' <b>Nothing saved yet:</b> tap + or type a level to start.'}</span></div></section>
  <section class="panel chsk"><h2>Skills</h2>
    <div class="chtools"><button type="button" class="btn ghost" data-all="1">All 1</button><button type="button" class="btn ghost" data-all="99">All 99</button><button type="button" class="btn ghost" data-all="max">All max</button><button type="button" class="btn ghost" data-all="start" title="Every skill 1, Constitution 10 (the RS3 starting levels)">Starting levels</button><button type="button" class="btn" id="chundo" hidden>Undo</button></div>
    <div class="skgrid">${SKORDER.map(tile).join('')}<div class="sksavecell"><span id="stsaved" class="stsaved on idle" role="status" aria-live="polite">${STATS_SAVED ? 'Saved ✓' : 'Auto-save on'}</span></div></div>
    <div class="sktot"><span title="Total level">Total level <b id="tot2">${totalLevel(S)}</b></span><span title="Combat level (wiki formula)">Combat <b id="cmb2">${combatLevel(S)}</b></span></div>
    <div class="note chnote">Each skill's top level is from its RS3 wiki page. Type a level in a skill; hover it to see the wiki XP for that level.</div></section>
  <section class="panel chnow"><h2>What can I do now</h2><div class="chtiles">${tiles.map(([k, t, d]) => `<button type="button" class="chgo" data-go="${k}"><svg viewBox="0 0 16 16" aria-hidden="true">${CH_ICO[k]}</svg><span class="chgt"><b>${t}</b><small>${d}</small></span><span class="chgc" id="chgc-${k}"></span></button>`).join('')}</div>
    <div class="note chnote">These open the other tabs already filtered to your saved levels. ${STATS_SAVED ? '' : 'Until you save your levels they use every skill at 1 (Constitution 10).'}</div></section>
  <section class="panel chgear"><h2>Gear for my levels</h2>
    <details class="chsec" id="chg1"><summary><b>Best set &amp; all gear I can wear</b><span class="note">picked from the wiki's recommended tables</span></summary><div id="chgm" class="chmount"><div class="note">Opening…</div></div></details>
    <details class="chsec" id="chg2"${sub === 'sets' ? ' open' : ''}><summary><b>Wiki recommended sets</b><span class="note">by style and tier</span></summary><div id="chwm" class="chmount"><div class="note">Opening…</div></div></details></section>`;
  const grid = k => document.querySelector(`.sk[data-k="${CSS.escape(k)}"]`);
  const pulse = (el, cls = 'pulse') => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el._pt); el._pt = setTimeout(() => el.classList.remove(cls), 600); };
  const barOf = (k, L) => {
    const M = skMax(k), goal = L < 99 ? 99 : M;
    if (k === 'Invention') return {p: Math.min(1, L / goal), t: `${k} level ${L}. Invention has its own XP curve, so the bar is level ÷ ${goal}.`};
    const x = xpAt(L), g = xpAt(goal);
    return {p: Math.min(1, x / g), t: `${k} level ${L} starts at ${x.toLocaleString()} XP (wiki XP table). Level ${goal} = ${g.toLocaleString()} XP.${L >= M ? ' Top level reached.' : ''}`};
  };
  const paint = k => {
    const t = grid(k); if (!t) return; const L = lv(S, k), M = skMax(k), b = barOf(k, L);
    t.classList.toggle('l99', L >= 99); t.classList.toggle('lmax', L >= M); t.title = b.t;
    const inp = t.querySelector('input'); if (document.activeElement !== inp) inp.value = L;
  };
  let questN = null;
  const hero = (bump) => {
    const set = (id, v) => { const e = document.getElementById(id); if (e && e.textContent !== String(v)) { e.textContent = v; if (bump) pulse(e.parentNode, 'bump'); } };
    set('tot', totalLevel(S)); set('cmb', combatLevel(S)); set('tot2', totalLevel(S)); set('cmb2', combatLevel(S));
    const n99 = SKORDER.filter(k => lv(S, k) >= 99).length, nmx = SKORDER.filter(k => lv(S, k) >= skMax(k)).length;
    set('n99', n99); const m = document.getElementById('nmx'); if (m) m.textContent = `${nmx} at top level`;
    document.querySelector('.chhero').classList.toggle('chmaxed', nmx === SKORDER.length && nmx > 0);
  };
  let hubT = 0, hubs = [], cntT = 0;
  const later = () => { clearTimeout(hubT); hubT = setTimeout(() => { hubs.forEach(f => f()); }, 250); clearTimeout(cntT); cntT = setTimeout(fillCounts, 300); };
  const setLv = (k, v, up) => {
    v = Math.max(skMin(k), Math.min(skMax(k), Math.floor(v))); if (!Number.isFinite(v) || v === S[k]) return false;
    const was = lv(S, k); S[k] = v; saveStats(S); paint(k); hero(true); later();
    if (up === undefined ? v > was : up) pulse(grid(k));
    return true;
  };
  const applyAll = fn => { undo = {...S}; for (const k of SKORDER) S[k] = Math.max(skMin(k), Math.min(skMax(k), fn(k))); saveStats(S); statsFlush(); SKORDER.forEach(paint); hero(true); later(); const u = document.getElementById('chundo'); u.hidden = false; };
  view.querySelectorAll('.sk').forEach(t => {
    const k = t.dataset.k, inp = t.querySelector('input');
    inp.oninput = () => { const v = parseInt(inp.value, 10); if (Number.isFinite(v)) setLv(k, v); };
    inp.onchange = () => { const v = parseInt(inp.value, 10); setLv(k, Number.isFinite(v) ? v : lv(S, k)); inp.value = lv(S, k); statsFlush(); };
    inp.onfocus = () => { try { inp.select(); } catch (e) {} };
  });
  view.querySelectorAll('button[data-all]').forEach(b => b.onclick = () => { const a = b.dataset.all; applyAll(k => a === 'max' ? skMax(k) : a === 'start' ? skMin(k) === 10 ? 10 : 1 : Math.min(+a, skMax(k))); });
  document.getElementById('chundo').onclick = () => { if (!undo) return; const u = undo; undo = null; for (const k of SKORDER) S[k] = u[k]; saveStats(S); statsFlush(); SKORDER.forEach(paint); hero(true); later(); document.getElementById('chundo').hidden = true; };
  view.querySelectorAll('.chgo').forEach(b => b.onclick = () => { statsFlush(); chGo(b.dataset.go); });
  SKORDER.forEach(paint); hero(false);
  const sb = document.getElementById('stsaved'); if (sb) { sb.textContent = STATS_SAVED ? 'Saved ✓' : 'Auto-save on'; }
  /* the wiki sets / gear hubs render only when opened (they are large) */
  let D = null;
  const lazy = (id, mountId, build) => { const d = document.getElementById(id); let done = false; const go = async () => { if (done || !d.open) return; done = true; D = D || await itemData(); hubs.push(build(D, S, document.getElementById(mountId))); }; d.addEventListener('toggle', go); go(); };
  lazy('chg1', 'chgm', gearHub); lazy('chg2', 'chwm', wikiSetsHub);
  async function fillCounts() {
    try {
      D = D || await itemData();
      const c = (k, t) => { const e = document.getElementById('chgc-' + k); if (e) e.textContent = t; };
      c('wear', D.gd.gear.filter(g => reqMet(g, S)).length.toLocaleString());
      try { const sets = await gearSets(D); const r = setsWear(sets, S); c('sets', `${r.full.length.toLocaleString()}${r.almost.length ? ` +${r.almost.length}` : ''}`); } catch (e) { c('sets', ''); }
      if (!questN) { const qs = await get('data/quests.json'); questN = qs.filter(q => q[1] === 'quest'); }
      const done = questN.filter(q => qIsDone(q[0])).length;
      document.getElementById('nq').textContent = done; document.getElementById('nqm').textContent = `of ${questN.length} quests`;
      c('quest', (questN.length - done).toLocaleString());
    } catch (e) {}
  }
  fillCounts();
  if (sub === 'sets') { const e = document.getElementById('chg2'); if (e) e.scrollIntoView({block: 'start'}); }
}

/* ---------- Full armour sets (Items → Sets view) ----------
   A set is exactly what the RS3 wiki groups: a row of a class page's ArmourOverviewTable (Melee/Ranged/Magic/Necromancy/Hybrid armour) or a Grand Exchange
   "armour set" item (ItemExchange page, its Set contents list); the two are merged only when their piece lists are identical. Nothing is paired by name.
   "Torva armour#80"-style piece names: the wiki row points at one tier variant of a page; it counts as a known piece only when the gear data holds that exact variant. */
let GSETS = null;
const SET_SLOTS = ['head', 'body', 'legs', 'hands', 'feet', 'cape', 'neck', 'ring', 'ammo', 'main', '2h', 'off', 'offw', 'pocket', 'aura'];
async function gearSets(D) {
  if (GSETS) return GSETS;
  const J = await get('data/gsets.json');
  const base = n => n.replace(/#.*$/, '').trim(), sfx = n => { const m = n.match(/#(.*)$/); return m ? m[1] : undefined; };
  const mk = raw => {
    const n = base(raw), v = sfx(raw), g = D.gear[n] || null, exact = !!g && (v === undefined || String(g.v) === v);
    return {n, v, g: exact ? g : null, gi: exact ? gearInfo(D, n) : null, variant: v !== undefined && !exact, known: D.row[n] != null || !!g, get price() { return exact || v === undefined ? priceOf(D, n) : null; }, get tr() { return exact || v === undefined ? tradeOf(D, n) : false; }};
  };
  const uniq = ps => { const s = new Set(); return ps.filter(p => { const k = p.n + '#' + (p.v ?? ''); if (s.has(k)) return false; s.add(k); return true; }); };
  const keyOf = ps => ps.map(p => p.n + (p.variant ? '#' + p.v : '')).sort().join('|');
  const out = [], byKey = new Map();
  const finish = s => {
    s.ps = uniq(s.ps).sort((a, b) => SET_SLOTS.indexOf(a.g ? a.g.slot : 'zz') - SET_SLOTS.indexOf(b.g ? b.g.slot : 'zz'));
    const rs = s.ps.filter(p => p.g); if (!rs.length) return null;
    s.slots = new Set(rs.map(p => GF_SLOTKEY[p.g.slot]).filter(Boolean)); s.nslot = s.slots.size;
    s.req = {}; for (const p of rs) for (const [k, v] of Object.entries(p.g.req || {})) s.req[k] = Math.max(s.req[k] || 0, v);
    const ts = rs.map(p => p.g.tier).filter(t => t != null);
    if (s.t == null) s.t = ts.length ? Math.max(...ts) : null;
    s.miss = s.ps.length - rs.length;
    Object.defineProperty(s, 'sum', {get: () => s.ps.every(p => p.tr === true && !p.variant) ? LIVE.book.total(s.ps.map(p => ({n: p.n, q: 1})), 'buy').value : null});
    Object.defineProperty(s, 'gePrice', {get: () => s.geN ? priceOf(D, s.geN) : null});
    s.qn = norm(s.n + ' ' + s.ps.map(p => p.n).join(' '));
    return s;
  };
  for (const r of J.cls) {
    const m = r.n.match(/^(.*?)#(.*)$/), lab = m ? m[2].trim() : '';
    const s = {n: m ? m[1].trim() : r.n, lab, c: r.c, sec: r.sec, note: r.note, page: r.page, ps: r.p.map(mk), geN: null, src: 'class', t: lab && /\d/.test(lab) ? parseInt(lab.replace(/\D/g, ''), 10) : null};
    if (s.t === 1 && /^\d+$/.test(lab)) s.t = null;
    const f = finish(s); if (!f) continue; out.push(f);
    if (!s.ps.some(p => p.variant)) { const k = keyOf(s.ps); if (!byKey.has(k)) byKey.set(k, f); }
  }
  for (const e of J.ge) {
    const ps = e.p.map(mk), k = keyOf(ps), hit = byKey.get(k);
    if (hit && !hit.geN) { hit.geN = e.n; continue; }
    const s = {n: e.n.replace(/ set\b/i, ' set'), lab: '', c: 'none', sec: '', note: '', page: '', ps, geN: e.n, src: 'ge', t: null};
    const cls = new Set(ps.map(p => p.gi && p.gi.c).filter(c => c && c !== 'none' && c !== 'unc'));
    s.c = cls.size === 1 ? [...cls][0] : cls.size > 1 ? 'mixed' : ps.some(p => p.gi && p.gi.c === 'none') ? 'none' : 'unc';
    const f = finish(s); if (f) out.push(f);
  }
  /* two wiki entries may share a name but list different pieces (class page vs GE set item): label which is which so they never look like duplicates */
  const cnt = {}; out.forEach(s => { const k = s.n.toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; });
  out.forEach(s => { if (cnt[s.n.toLowerCase()] > 1) s.n += s.src === 'ge' ? ' (GE set item)' : ' (class page)'; });
  return GSETS = out;
}
/* one set against my levels: full = every known piece wearable; almost = nothing is more than 5 levels away */
function setWear(s, S) {
  const def = {}; let full = true;
  for (const p of s.ps) { if (!p.g) continue; if (!reqMet(p.g, S)) full = false; for (const [k, v] of Object.entries(p.g.req || {})) { const d = v - lv(S, k); if (d > 0) def[k] = Math.max(def[k] || 0, d); } }
  const mx = Math.max(0, ...Object.values(def));
  return {full, almost: !full && mx <= 5, def};
}
function setsWear(sets, S) { const r = {full: [], almost: []}; for (const s of sets) { const w = setWear(s, S); if (w.full) r.full.push(s); else if (w.almost) r.almost.push(s); } return r; }
function setPass(s, f, S, x, skip) {   /* x = {nq, dragon, best, rar} */
  if (skip !== 'c' && f.cls && s.c !== f.cls) return false;
  if (skip !== 's' && f.slot && !GF_SLOTSET[f.slot].some(sl => s.ps.some(p => p.g && p.g.slot === sl))) return false;
  if (skip !== 't' && (f.tmin || f.tmax)) { if (s.t == null || (f.tmin && s.t < +f.tmin) || (f.tmax && s.t > +f.tmax)) return false; }
  if (skip !== 'w' && f.wear) { const w = setWear(s, S); if (!w.full && !w.almost) return false; }
  if (x.nq && !x.nq.split(' ').every(t => s.qn.includes(t))) return false;
  if (x.dragon && !s.ps.some(p => x.dragon.has(p.n))) return false;
  if (x.rar !== '' && !s.ps.some(p => x.best[p.n] && x.best[p.n][0] === +x.rar)) return false;
  return true;
}
const gpp = n => n != null ? Math.round(n).toLocaleString() + " gp" : "";
function setCard(D, s, S) {
  const w = setWear(s, S), cl = GF_CLS.find(c => c[0] === s.c), cname = cl ? cl[1] : s.c === 'mixed' ? 'Mixed' : cap(s.c);
  const reqs = Object.entries(s.req).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const ok = lv(S, k) >= v; return `<span class="gsq ${ok ? 'ok' : 'no'}">${SKICONS[k] ? `<img src="${esc(SKICONS[k])}" alt="" width="16" height="16">` : ''}${esc(k)} ${v} ${ok ? '✓' : '✗ you ' + lv(S, k)}</span>`; }).join('');
  const label = s.lab ? `${s.n} · ${/^\d+$/.test(s.lab) ? 'tier ' + s.lab : s.lab.toLowerCase()}` : s.n;
  const pics = s.ps.map(p => p.known ? `<a class="gsp" href="#items/${encodeURIComponent(p.n)}" title="${esc(p.n)}${p.g ? ' · ' + (SLOT_LABEL[p.g.slot] || '') : ''}">${icon(p.n)}</a>` : `<span class="gsp gsp0" title="${esc(p.n)} (not in the wiki item data)">?</span>`).join('');
  const rows = s.ps.map(p => {
    const rq = p.g ? Object.entries(p.g.req || {}).map(([k, v]) => `<span class="${lv(S, k) >= v ? 'ok' : 'no'}">${esc(k)} ${v}</span>`).join(' ') : '';
    const pr = p.g ? (p.tr === true ? priceTag(D, p.n) : p.tr === false ? 'untradeable' : '') : '';
    return `<div class="gsr"><a class="item" href="${p.known ? '#items/' + encodeURIComponent(p.n) : WIKI(p.n)}"${p.known ? '' : ' target="_blank" rel="noopener noreferrer"'}>${icon(p.n)}<span>${esc(p.n)}</span></a>
      <span class="gsl">${p.g ? esc(SLOT_LABEL[p.g.slot] || '') : ''}${p.g && p.g.tier != null ? ` · T${p.g.tier}` : ''}</span><span class="gsc">${rq}</span><span class="gsg">${pr}</span>
      ${p.known ? `<a class="gsw" href="#items/${encodeURIComponent(p.n)}">Where to get it ›</a>` : '<span class="note">not in the wiki gear data</span>'}
      ${p.variant ? '<span class="note gsv">this tier variant is not in the gear data: check the item page</span>' : ''}</div>`;
  }).join('');
  const pr = [s.sum != null ? `<span title="Sum of fresh observed buy prices">Observed buy total <b>${gpp(s.sum)}</b></span>` : `<span class="note">${s.ps.some(p => p.tr === false) ? 'Not all pieces are tradeable' : 'Incomplete buy total (missing or stale quotes)'}</span>`,
    s.gePrice != null ? `<span title="The set item on the Grand Exchange: ${esc(s.geN)}">Set observed buy <b>${gpp(s.gePrice)}</b></span>` : ''].filter(Boolean).join('');
  const state = w.full ? '<span class="tag fit">Wearable now</span>' : w.almost ? `<span class="tag warn">Almost: ${Object.entries(w.def).map(([k, d]) => `${esc(k)} +${d}`).join(', ')}</span>` : '';
  return `<article class="gset${w.full ? ' gfull' : ''}"><div class="gsh"><div class="gsn"><b>${esc(label)}</b> <span class="tag">${esc(cname)}</span>${s.t != null ? ` <span class="tag">T${s.t}</span>` : ''} ${state}</div><div class="gsm">${pr}</div></div>
    <div class="gspics">${pics}<span class="gsk">${[...s.slots].map(k => (GF_SLOT.find(x => x[0] === k) || [])[1]).filter(Boolean).join(' · ')} <i>(${s.nslot} of ${s.ps.length} pieces)</i></span></div>
    <div class="gsrq">${reqs || '<span class="note">No level requirements listed</span>'}</div>
    ${s.miss ? `<div class="gsmiss">⚠ ${s.miss} piece${s.miss === 1 ? '' : 's'} not in the wiki gear data (stats, requirements and price unknown): ${s.ps.filter(p => !p.g).map(p => esc(p.n)).join(', ')}</div>` : ''}
    <details class="gsd"><summary>${s.ps.length} pieces and where to get them</summary>${rows}${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
    <div class="note">Source: ${s.src === 'class' ? `<a href="${WIKI(s.page)}" target="_blank" rel="noopener noreferrer">wiki ${esc(s.page)}</a>${s.geN ? ` + <a class="item" href="#items/${encodeURIComponent(s.geN)}">${esc(s.geN)}</a> (GE set)` : ''}` : `<a href="#items/${encodeURIComponent(s.geN)}">${esc(s.geN)}</a> (Grand Exchange set item)`}</div></details></article>`;
}

/* The source owns search, prices and graphs; never proxy or restyle its document. */
function geView() {
  view.innerHTML = `<section class="panel ge-panel" aria-labelledby="ge-title">
    <div class="ge-heading"><h2 id="ge-title">Grand Exchange</h2>
      <a class="btn sub ge-source" href="https://prices.runescape.wiki/rs/" target="_blank" rel="noopener noreferrer">Open RuneScape Wiki Prices ↗</a></div>
    <p class="note ge-attribution">RuneScape Wiki Prices — trade data supplied by Jagex</p>
    <p class="note">The live source below provides its own search, graphs and price updates. Last-trade prices can be old; check the source timestamps. This is a community-operated website, not Jagex's official G.E. website.</p>
    <p class="note ge-status" id="ge-status" role="status" aria-live="polite"></p>
    <div class="row ge-view-controls"><button class="btn sub on" id="ge-fit" type="button" aria-pressed="true">Fit overview</button><button class="btn sub" id="ge-readable" type="button" aria-pressed="false">Readable size</button></div>
    <p class="note" id="ge-fit-note" role="status"></p>
    <div class="ge-viewport" id="ge-viewport"><iframe class="ge-frame" id="ge-frame" title="RuneScape Wiki live Grand Exchange search, prices and graphs" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <p class="note">Internet required. The source may take a moment to load. If it stays blank or does not work here, use the open-source link above. Embedded content and controls belong to the source.</p>
  </section>`;
  const frame = $('#ge-frame'), status = $('#ge-status'), host = $('#ge-viewport');
  let fit = true;
  const layout = () => {
    if (host.isConnected === false) return;
    const width = host.clientWidth || host.getBoundingClientRect().width;
    if (!width) return;
    // Ordinary parent-side iframe scaling, left anchored. Never inspect/inject the
    // source document. Fit scales its native 1024px viewport, not a cropped table.
    const sourceWidth = fit ? Math.max(1024, width) : width;
    const scale = width / sourceWidth;
    const height = Math.max(440, Math.min(900, Math.round(window.innerHeight * .78)));
    frame.style.width = sourceWidth + 'px';
    frame.style.height = Math.ceil(height / scale) + 'px';
    frame.style.transform = `scale(${scale})`;
    host.style.height = Math.ceil(Math.ceil(height / scale) * scale) + 'px';
    host.dataset.sourceWidth = sourceWidth; host.dataset.sourceScale = scale;
    $('#ge-fit-note').textContent = fit
      ? `Source overview: ${Math.round(scale * 100)}% size. The full source viewport is scaled without app-side cropping; text may be small. Source tables can still have their own scrolling. Use Readable size or open the source for normal text.`
      : 'Normal source text size. The source may require its own horizontal scrolling; Fit overview scales the full source viewport down.';
    $('#ge-fit').setAttribute('aria-pressed', String(fit)); $('#ge-readable').setAttribute('aria-pressed', String(!fit));
    $('#ge-fit').classList.toggle('on', fit); $('#ge-readable').classList.toggle('on', !fit);
  };
  $('#ge-fit').onclick = () => { fit = true; layout(); };
  $('#ge-readable').onclick = () => { fit = false; layout(); };
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout);
  if (resize) resize.observe(host);
  window.addEventListener('resize', layout);
  layout();
  const update = () => {
    const offline = navigator.onLine === false;
    status.textContent = offline
      ? 'Offline: live G.E. requires internet. Reconnect to load current source data; any content still visible may be out of date.'
      : 'Online connection detected — source availability is not guaranteed. Prices and their timestamps are shown by the source.';
    if (!offline && !frame.getAttribute('src')) frame.src = 'https://prices.runescape.wiki/rs/';
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  geCleanup = () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
    window.removeEventListener('resize', layout); if (resize) resize.disconnect();
  };
  update();
}

/* Calculators: a directory of the RuneScape Wiki's calculators, opened on the Wiki in a new tab. The Wiki sends
   X-Frame-Options: DENY and frame-ancestors 'none', so its calculators cannot be embedded; we never proxy or inject.
   Favourites are saved only on this device under their own key (RS3Calc.FAV_KEY), separate from saved stats. */
const CALC_LS = (() => { try { return window.localStorage; } catch (e) { return null; } })();
/* Native calculators (see RS3Calc.NATIVE). Formulas are the Wiki's own, checked against Wiki output in tests;
   prices come from the shared live service (never from the embedded Grand Exchange frame). */
async function nativeCalcView(n) {
  if (n.slug === 'flask-decanting') return flaskDecantView(n);
  if (n.slug === 'herblore') return herbloreView(n);
  if (n.slug === 'cooking') return cookingView(n);
  if (n.slug === 'fletching') return fletchingView(n);
  if (n.slug === 'crafting') return craftingView(n);
  if (n.slug === 'firemaking') return firemakingView(n);
  location.replace('#calculators');
}
const QUOTE_WHY = {missing: 'no recent trade price', stale: 'price is stale', offline: 'offline', unavailable: 'live source unavailable', unmapped: 'not found in the price source'};
/* Before the first item list arrives every item is 'unmapped'; say it is loading rather than 'not found'. */
const quoteWhy = st => st === 'unmapped' && !LIVE.book.mapping.size ? 'live prices loading' : QUOTE_WHY[st] || st;
async function flaskDecantView(n) {
  const D = await get(n.data);
  const cols = D.columns, label = 'Decanting flasks for profit';
  view.innerHTML = `<div class="row subnav"><a class="btn sub" href="#calculators">← All calculators</a></div>
  <section class="panel calc-native-panel" aria-labelledby="fd-title">
    <div class="ge-heading calc-heading"><h2 id="fd-title">Flask decanting</h2>
      <div class="calc-native-actions"><button class="calc-star" type="button" id="fd-star"></button>
      <a class="btn sub calc-source" href="${esc(RS3Calc.wikiUrl(D.path))}" target="_blank" rel="noopener noreferrer">Wiki calculator ↗</a></div></div>
    <p class="note">Profit or loss from buying potions in vials and empty potion flasks, decanting them into six-dose flasks and selling the flasks. Same potions and decanting options as the RuneScape Wiki <a href="${esc(RS3Calc.wikiUrl(D.path))}" target="_blank" rel="noopener noreferrer">Flask decanting</a> calculator (revision ${esc(D.source.pageRevision)}), using live prices instead of the Wiki's guide prices, so results differ from the Wiki page.</p>
    <ul class="note calc-assume">
      <li>Vials and empty potion flasks are bought at the live Buy (high) price; six-dose flasks are sold at the live Sell (low) price.</li>
      <li>Net profit deducts the estimated 2% Grand Exchange tax on each flask sold, rounded down per flask. There is no tax on buying.</li>
      <li>Each result is for one decanting batch: 6 (1)s or 3 (2)s make 1 flask; 4 (3)s or 3 (4)s make 2 flasks.</li>
      <li>Leftover empty vials are not counted, as on the Wiki.</li>
      <li>Potion flasks can be hard to buy on the Grand Exchange, and potion prices right after an update may not buy or sell at market price (Wiki note).</li>
      <li>A price that is missing or older than 15 minutes makes that result unavailable; it is never treated as 0.</li></ul>
    <p class="note" id="fd-flask" role="status"></p>
    <div class="row calc-filters">
      <input id="fd-q" type="search" placeholder="Search potions" aria-label="Search potions" autocomplete="off" autocapitalize="off" spellcheck="false">
      <select id="fd-show" aria-label="Show" aria-describedby="fd-show-help"><option value="net">Net profit</option><option value="gross">Gross profit</option></select><small class="calc-sub calc-show-help" id="fd-show-help">Net profit: after the estimated 2% Grand Exchange tax. Gross profit: before tax.</small>
      <select id="fd-sort" aria-label="Sort"><option value="">Sort: potion name</option>${cols.map(c => `<option value="${esc(c.key)}">Sort: best ${esc(c.label.replace('Decanting ', ''))}</option>`).join('')}</select></div>
    <p class="note" id="fd-count" role="status" aria-live="polite"></p>
    <div id="fd-table"></div>
    <p class="note">Formula and potion list: RuneScape Wiki, <a href="${esc(RS3Calc.wikiUrl(D.path))}" target="_blank" rel="noopener noreferrer">Calculator:Herblore/Flask decanting</a> and its row template (revisions ${esc(D.source.pageRevision)} / ${esc(D.source.rowTemplateRevision)}), CC BY-NC-SA 3.0. Item IDs: Module:GEIDs (revision ${esc(D.source.itemIdsRevision)}).</p>
  </section>`;
  const star = $('#fd-star');
  const drawStar = () => { const on = RS3Calc.has(RS3Calc.load(CALC_LS), D.path); star.classList.toggle('on', on); star.setAttribute('aria-pressed', String(on)); star.textContent = on ? '★' : '☆';
    star.setAttribute('aria-label', `${on ? 'Remove' : 'Save'} ${label} ${on ? 'from' : 'to'} favourites`); star.title = on ? 'Remove from favourites' : 'Save to favourites'; };
  star.onclick = () => { RS3Calc.toggle(CALC_LS, {path: D.path, label}); drawStar(); };
  drawStar();
  const q = $('#fd-q'), show = $('#fd-show'), sort = $('#fd-sort');
  const why = (item, side) => { const x = LIVE.book.quote(item.id, side); return x.live ? null : `${item.n}: ${quoteWhy(x.status)}`; };
  const quoteLine = (item, side) => { const x = side === 'sell' ? LIVE.book.sale(item.id) : LIVE.book.quote(item.id, 'buy');
    return `<li>${liIco(item.n)}${esc(item.n)} — ${side === 'sell' ? 'Sell' : 'Buy'} ${x.live ? `${esc(gp(x.value))}${side === 'sell' ? ` · est. tax ${esc(gp(x.tax))} · net ${esc(gp(x.net))}` : ''}` : `<span class="calc-unavail">unavailable (${esc(quoteWhy(x.status))})</span>`}</li>`; };
  const draw = () => {
    const fq = LIVE.book.quote(D.flask.id, 'buy');
    $('#fd-flask').textContent = fq.live ? `Empty potion flask: Buy ${gp(fq.value)} each (live).` : `Empty potion flask: live Buy price unavailable (${quoteWhy(fq.status)}), so every result below is unavailable.`;
    const key = show.value === 'gross' ? 'grossProfit' : 'profit', nq = norm(q.value);
    let rows = D.rows.map(r => ({r, e: cols.map(c => {
      const m = RS3Calc.flaskModel(D, r, c), est = LIVE.book.estimate(m);
      const reasons = est.complete ? [] : [...m.inp.map(l => why(l, 'buy')), ...m.out.map(l => why(l, 'sell'))].filter(Boolean);
      return {est, reasons: reasons.length ? reasons : est.missing};
    })})).filter(x => !nq || norm(x.r.flask + ' ' + x.r.vial).includes(nq));
    const ci = cols.findIndex(c => c.key === sort.value);
    if (ci >= 0) rows.sort((a, b) => { const x = a.e[ci].est.complete ? a.e[ci].est[key] : null, y = b.e[ci].est.complete ? b.e[ci].est[key] : null;
      return x == null && y == null ? a.r.flask.localeCompare(b.r.flask) : x == null ? 1 : y == null ? -1 : y - x; });
    $('#fd-count').textContent = `${rows.length} of ${D.rows.length} potions · showing ${show.value === 'gross' ? 'gross profit (before tax)' : 'net profit (after estimated tax)'} per batch`;
    const cell = x => x.est.complete
      ? `<span class="calc-val ${x.est[key] < 0 ? 'loss' : 'gain'}">${x.est[key] < 0 ? '−' : ''}${esc(gp(Math.abs(x.est[key])))}</span><small class="calc-sub">${show.value === 'gross' ? `net ${esc(gp(x.est.profit))}` : `gross ${esc(gp(x.est.grossProfit))} · tax ${esc(gp(x.est.tax))}`}</small>`
      : `<span class="calc-unavail">Unavailable</span><small class="calc-sub">${esc(x.reasons.slice(0, 2).join('; '))}</small>`;
    const openRows = new Set([...document.querySelectorAll('#fd-table details[open]')].map(d => d.dataset.flask));
    $('#fd-table').innerHTML = rows.length ? `<table class="calc-table"><thead><tr><th scope="col">Flask</th>${cols.map(c => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(({r, e}) =>
      `<tr><th scope="row"><span class="calc-name-row">${calcIco(r.f6.n)}<span class="calc-name">${esc(r.flask)}</span></span><details class="calc-prices" data-flask="${esc(r.flask)}"${openRows.has(r.flask) ? ' open' : ''}><summary>Prices used</summary><ul>${quoteLine(r.f6, 'sell')}${[1, 2, 3, 4].map(d => quoteLine(r['v' + d], 'buy')).join('')}${quoteLine(D.flask, 'buy')}</ul></details></th>${e.map(x => `<td>${cell(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : '<p class="note">No potions match.</p>';
  };
  q.addEventListener('input', draw); show.onchange = draw; sort.onchange = draw;
  priceDraws.push(draw);
  draw();
}

/* Calculator:Herblore, native. The engine is the Wiki's own Module:Skill calc/Herblore, ported to RS3Calc.herbloreRun and
   checked row by row against Wiki renders (tests/herblore.test.cjs). Inputs are the Wiki form's own fields and values;
   an option only counts while it is shown (as on the Wiki form, where hidden fields fall back to their defaults).
   Prices: live Buy (high) for ingredients, live Sell (low) for products, estimated 2% tax per item sold. */
const HB_KEY = 'dch_calc_herblore_v1';
const HB_YN = ['false', 'true'];
const HB_CATS = [['herb', 'Clean herbs'], ['unfinished', 'Unfinished potions'], ['standard', 'Standard potions'], ['combinations', 'Combination potions'], ['overload_variants', 'Overload variants'], ['primal', 'Primal extract'], ['primal_pulp', 'Primal fruit pulp'], ['adrenaline', 'Adrenaline crystal'], ['juju_herb', 'Clean juju herbs'], ['juju_unfinished', 'Unfinished juju potions'], ['juju', 'Juju potions'], ['barbarian', 'Barbarian mix'], ['bomb', 'Bomb'], ['powerburst', 'Powerbursts'], ['tar', 'Tar'], ['burner', 'Deployable herb burner'], ['daemonheim_herb', 'Daemonheim - clean herbs'], ['daemonheim', 'Daemonheim - potions']];
const HB_DOSE = ['1', '2', '3', '4', '6'], HB_RESTRICT = ['Any', 'Max. 2', 'Max. 3', 'Min. 2', 'Min. 3', '2 or 3'];
/* [key, label, type, options|range, default, group, visible(state)] — labels, options and defaults from Calculator:Herblore's form */
const HB_FIELDS = [
  ['curr_toggle', 'Current', 'sel', ['Level', 'Experience'], 'Level', 'goal'],
  ['curr_level', 'Herblore level', 'int', [1, 120], '1', 'goal', s => s.curr_toggle === 'Level'],
  ['curr_xp', 'Herblore XP', 'int', [0, 200000000], '1', 'goal', s => s.curr_toggle === 'Experience'],
  ['target_toggle', 'Target', 'sel', ['Level', 'Experience'], 'Level', 'goal'],
  ['target_level', 'Target level', 'int', [1, 120], '120', 'goal', s => s.target_toggle === 'Level'],
  ['target_xp', 'Target XP', 'int', [0, 200000000], '13034431', 'goal', s => s.target_toggle === 'Experience'],
  ['category_choice', 'Skill subcategory choice', 'sel', ['Single', 'Multiple', 'Common potions', 'Dungeoneering', 'Outside Daemonheim', 'All'], 'Single', 'recipes'],
  ['category', 'Skill subcategory', 'sel', HB_CATS.map(c => c[1]), 'Standard potions', 'recipes', s => s.category_choice === 'Single'],
  ...HB_CATS.map(([c, l]) => ['categories_' + c, l, 'chk', HB_YN, c === 'standard' ? 'true' : 'false', 'cats']),
  ['experience_boost', 'Experience boost', 'switch', HB_YN, 'false', 'xpsw'],
  ['bik_scripture', 'Scripture of Bik', 'sel', ['None', 'Flicking and switching every minute', 'Always activated'], 'None', 'xp'],
  ['inspire', 'Inspire Genius', 'chk', HB_YN, 'false', 'xp'],
  ['avatar', 'Clan avatar bonus (%)', 'sel', ['None', '3', '4', '5', '6'], 'None', 'xp'],
  ['wise', 'Wise', 'sel', ['None', 'Wise 1', 'Wise 2', 'Wise 3', 'Wise 4'], 'None', 'xp'],
  ['torsol', 'Torstol incense sticks potency level', 'sel', ['None', '1', '2', '3', '4'], 'None', 'xp'],
  ['pulse_core', 'Advanced pulse core', 'sel', ['None', 'Buff only', 'Equipped', 'Buff and equipped'], 'None', 'xp'],
  ['knowledge_bomb', 'Small knowledge bomb', 'sel', ['None', 'Small/Medium/Large/Huge/Prime Gaming', 'Superior'], 'None', 'xp'],
  ['perfect_juju', 'Perfect juju herblore potion / Perfect plus potion', 'sel', ['None', 'Perfect juju herblore potion', 'Perfect plus potion'], 'None', 'xp'],
  ['meilyr_hour', 'Meilyr Hour', 'chk', HB_YN, 'false', 'xp'],
  ['raf', 'Recruit a Friend', 'chk', HB_YN, 'false', 'xp'],
  ['dxp', 'Double XP Live', 'chk', HB_YN, 'false', 'xp'],
  ['add_xp_boost', 'Additional XP boost (%)', 'num', [0, 1600], '0', 'xp'],
  ['bxp', 'Bonus Experience', 'switch', HB_YN, 'false', 'xp'],
  ['bxp_amount', 'Amount of BXP', 'int', [0, 200000000], '0', 'xp', s => s.bxp === 'true'],
  ['cinder_core', 'Cinder core', 'sel', ['None', 'Buff only', 'Equipped', 'Buff and equipped'], 'None', 'xp', s => s.bxp === 'true'],
  ['outfit_piece', 'Outfit pieces', 'switch', HB_YN, 'false', 'outfitsw'],
  ['outfit', "Botanist's outfit pieces", 'sel', ['None', '1', '2', '3', '4', '5'], 'None', 'outfit'],
  ['modified_mask_off', "Modified botanist's mask", 'fixed', null, 'None', 'outfit', s => s.outfit === 'None'],
  ['modified_mask', "Modified botanist's mask", 'chk', HB_YN, 'false', 'outfit', s => s.outfit !== 'None'],
  ['factory', 'Factory outfit pieces', 'sel', ['None', '3', '5'], 'None', 'outfit'],   // the Wiki form also lists it under Cost saving, but the gadget lays it out (and switches it) with Outfit pieces
  ['cost_saving', 'Cost saving', 'switch', HB_YN, 'false', 'savingsw'],
  ['portable', 'Portable well', 'chk', HB_YN, 'false', 'saving'],
  ['brooch_no_effect', 'Brooch of the Gods', 'fixed', null, 'No effect', 'saving', s => s.portable !== 'true'],
  ['brooch', 'Brooch of the Gods', 'chk', HB_YN, 'false', 'saving', s => s.portable === 'true'],
  ['botanist_amulet', "Botanist's amulet", 'chk', HB_YN, 'false', 'saving'],
  ['morytania_4', 'Morytania legs 4', 'chk', HB_YN, 'false', 'saving'],
  ['desert_4', 'Desert amulet 4', 'chk', HB_YN, 'false', 'saving'],
  ['envenomed', 'Envenomed perk', 'chk', HB_YN, 'false', 'saving'],
  ['soc', 'Scroll of cleansing', 'chk', HB_YN, 'false', 'saving'],
  ['potion_decanting', 'Potion decanting', 'switch', HB_YN, 'false', 'decantsw'],
  ['product_decant_type', 'Decanting product to', 'sel', ['None', 'Fixed', 'Profitable'], 'None', 'decant'],
  ['product_decant_dose_fixed', 'Dose', 'sel', HB_DOSE, '3', 'decant', s => s.product_decant_type === 'Fixed'],
  ['product_decant_dose_restriction', 'Restriction (Dose)', 'sel', HB_RESTRICT, 'Any', 'decant', s => s.product_decant_type === 'Profitable'],
  ['material_decant_type', 'Decanting material from', 'sel', ['None', 'Fixed', 'Profitable'], 'None', 'decant'],
  ['material_decant_dose_fixed', 'Dose', 'sel', HB_DOSE, '3', 'decant', s => s.material_decant_type === 'Fixed'],
  ['material_decant_dose_restriction', 'Restriction (Dose)', 'sel', HB_RESTRICT, 'Any', 'decant', s => s.material_decant_type === 'Profitable'],
  ['raw_material_replacement_mode', 'Ingredient preparation', 'sel', ['Original only', 'Potions and herbs', 'Most ingredients'], 'Original only', 'prepsw'],
  ['herb_potion_from', 'Potions and herbs', 'sel', ['Keep original', 'Tradable potions', 'Unfinished potions', 'Clean herbs', 'Grimy herbs'], 'Keep original', 'prep', s => s.raw_material_replacement_mode !== 'Original only'],
  ['use_ingredient_set', 'Ingredient set', 'sel', ['Avoid', 'Replace', 'Add'], 'Avoid', 'prep', s => s.raw_material_replacement_mode !== 'Original only'],
  ['cape99', 'Herblore cape', 'chk', HB_YN, 'false', 'prep', s => s.raw_material_replacement_mode !== 'Original only'],
  ['cape120', 'Herblore master cape', 'chk', HB_YN, 'false', 'prep', s => s.raw_material_replacement_mode !== 'Original only'],
  ['primal_extract_from', 'Primal extract', 'sel', ['Keep original', 'Regular portion', 'Improved yield +1', 'Improved yield +2'], 'Keep original', 'prep', s => s.raw_material_replacement_mode === 'Most ingredients'],
  ['primal_pulp_from', 'Primal fruit pulp', 'sel', ['Keep original', 'Most yield per primal fruit', 'Most profitable primal fruit', 'Avocado', 'Carambola', 'Ciku', 'Dragonfruit', 'Golden dragonfruit', 'Guarana', 'Lychee', 'Mango'], 'Keep original', 'prep', s => s.raw_material_replacement_mode === 'Most ingredients'],
  ['adrenaline_from', 'Adrenaline crystal', 'sel', ['Keep original', 'Charging inert'], 'Keep original', 'prep', s => s.raw_material_replacement_mode === 'Most ingredients'],
  ['ground_from', 'Ground ingredients', 'sel', ['Keep original', 'Manual grinding', 'Telekinetic Grind'], 'Keep original', 'prep', s => s.raw_material_replacement_mode === 'Most ingredients'],
  ['water_from', 'Vials of water', 'sel', ['Keep original', 'Manual filling', 'Humidify'], 'Keep original', 'prep', s => s.raw_material_replacement_mode === 'Most ingredients'],
  ['coconut_from', 'Coconut milk', 'sel', ['Keep original', 'Opened coconut', 'Whole coconut'], 'Keep original', 'prep', s => s.raw_material_replacement_mode === 'Most ingredients'],
  ['show_opts', 'Display customization', 'sel', ['Default', 'Change columns', 'Filter recipes', 'Both'], 'Default', 'showsw'],
  ['show_currency_image', 'Show currency image', 'chk', HB_YN, 'true', 'show'],
  ['show_item_image', 'Show item image', 'chk', HB_YN, 'true', 'show'],
  ['show_production_time', 'Show production time', 'chk', HB_YN, 'false', 'show'],
  ['show_cost', 'Show cost', 'chk', HB_YN, 'true', 'show'],
  ['show_profit', 'Show profit', 'chk', HB_YN, 'true', 'show'],
  ['step_mode', 'Step display', 'sel', ['Hidden', 'Total', 'Item', 'Quantity'], 'Hidden', 'show', s => s.raw_material_replacement_mode !== 'Original only'],
  ['mat_mode', 'Material display', 'sel', ['Item', 'Quantity', 'Price'], 'Quantity', 'show'],
  ['product_mode', 'Product display', 'sel', ['Hidden', 'Item', 'Quantity', 'Price'], 'Hidden', 'show'],
  ['recipe_level_start', 'Level from', 'int', [1, 120], '1', 'filter'],
  ['recipe_level_end', 'Level to', 'int', [1, 120], '120', 'filter'],
  ['recipe_level_filter', 'Level options', 'sel', ['Original recipe', 'Ingredients', 'Both'], 'Original recipe', 'filter'],
  ['ingredient_level_filter', 'Level of ingredient recipes', 'sel', ['Herbs', 'Unfinished', 'Standard potions', 'Tradable', 'Untradable', 'Every recipe'], 'Herbs', 'filter', s => s.recipe_level_filter !== 'Original recipe'],
  ['recipe_product_tradability', 'Tradability of products', 'sel', ['All', 'Tradable', 'Untradable'], 'All', 'filter'],
  ['recipe_material_tradability', 'Tradability of ingredients', 'sel', ['All', 'All tradable', 'Some tradable', 'All untradable'], 'All', 'filter'],
];
/* The Wiki form's sections, in its order: a switch or selector field (group '<g>sw' or top level) followed by the group it
   reveals, under the Wiki's own group label. A group switched off sends none of its fields (the Wiki gadget disables them),
   so the calculation uses their defaults; the values are kept and come back when the section is switched on again. */
const HB_GROUPS = {cats: ['Skill subcategory multiple choice', s => s.category_choice === 'Multiple'], xp: ['Experience boost', s => s.experience_boost === 'true'],
  outfit: ['Outfit pieces', s => s.outfit_piece === 'true'], saving: ['Cost saving', s => s.cost_saving === 'true'], decant: ['Decanting options', s => s.potion_decanting === 'true'],
  prep: ['Preparation options', s => s.raw_material_replacement_mode !== 'Original only'], show: ['Column options', s => s.show_opts === 'Change columns' || s.show_opts === 'Both'],
  filter: ['Filter options', s => s.show_opts === 'Filter recipes' || s.show_opts === 'Both']};
/* The Wiki form's help text for each field (Calculator:Herblore, CC BY-NC-SA 3.0), shown behind a "?" as on the Wiki. */
const HB_HELP = {"category_choice": "\"Common potions\" includes standard, combination, bomb, powerburst potions. \"Outside Daemonheim\" and \"All\" does not include deployable herb burner.", "categories_overload_variants": "Selecting it and \"Combination potions\" together will duplicate all recipes in this subcategory.", "bik_scripture": "Only accounts for XP boost in average. Has lower priority than Brooch of the Gods.", "wise": "Only accounts for XP boost but not drain rate of divine charges.", "pulse_core": "Only accounts for XP boost but not level boosts.", "knowledge_bomb": "Only accounts for XP boost. Disabled if Double XP Live is active.", "perfect_juju": "5% additional Herblore XP when making combination potions.", "meilyr_hour": "20% more Herblore XP from making combination potions.", "dxp": "Only accounts for XP boost for members, which is 100% XP boost.", "cinder_core": "Only accounts for bonus XP burn rate boost from cinder core but no additional effects.", "modified_mask": "5% chance of making duplicate potions.", "factory": "3 pieces: 10% chance to make a 4 dose potion instead of 3 dose potion. 5 pieces: Extra herb cleaning experience.", "portable": "Doubles the portable well effect from 5% to 10%.", "brooch": "Doubles the portable well effect from 5% to 10%.", "botanist_amulet": "5% chance to brew a 4-dose potion instead of a 3-dose potion. Has lower priority than Desert amulet 4.", "morytania_4": "20% chance of creating a 4-dose prayer renewal instead of 3-dose while mixing them in Morytania.", "desert_4": "20% chance to create a 4-dose super antifire instead of 3-dose, while in the desert.", "envenomed": "10% chance to make 4 doses instead of 3 doses when mixing weapon poison potions or antipoisons.", "soc": "10% chance to save an ingredient or one tick every single time you make a potion.", "product_decant_type": "Only handles decanting standard potions and juju potions.", "product_decant_dose_restriction": "Any: 1 – 4, Max. 2: 1 – 2, Max. 3: 1 – 3, Min. 2: 2 – 4, Min. 3: 3 – 4, 2 or 3: 2 – 3.", "material_decant_type": "Only handles decanting standard potions and juju potions.", "material_decant_dose_restriction": "Any: 1 – 4, Max. 2: 1 – 2, Max. 3: 1 – 3, Min. 2: 2 – 4, Min. 3: 3 – 4, 2 or 3: 2 – 3.", "use_ingredient_set": "Avoid: avoids using ingredient sets, Replace: replaces ingredients with ingredient sets, Add: adds ingredient sets as an alternative. Opening ingredient sets is not counted as one step.", "cape99": "Only accounts for instantly cleaning 28 grimy herbs on each action.", "cape120": "Only accounts for enabling the creation of overload, supreme overload, and elder overload potions in batches of five.", "primal_extract_from": "Regular portion: level 90 required, Improved yield +1: level 102 required, Improved yield +2: level 112 required.", "primal_pulp_from": "Most yield per primal fruit is always golden dragonfruit.", "ground_from": "Telekinetic Grind: assumes 26 available inventory spaces, one law runes and two astral runes are used per cast.", "water_from": "Humidify: assumes 27 vials are processed with one astral rune per cast.", "coconut_from": "Opened coconut, Whole coconut: Opening coconut is not counted as one step. Assumes 14 coconuts are processed every time.", "show_production_time": "Only accounts for the ticks to make multiple potions and ingredients, and rounds up to seconds.", "step_mode": "Total: shows the total number of steps, Item: shows items involved in the intermediate steps, Quantity: shows items and quantity involved in the intermediate steps.", "mat_mode": "Item: shows item names of materials, Quantity: shows item names and quantity of materials, Price: shows item names, quantity and price of materials.", "product_mode": "Item: shows item names of materials, Quantity: shows item names and quantity of materials, Price: shows item names, quantity and price of materials.", "recipe_level_filter": "Only filters the recipes to prepare ingredients or original products.", "ingredient_level_filter": "Herbs: filters cleaning herbs, Unfinished: filters mixing unfinished potions and above options, Standard potions: filters mixing standard potions and above options, Tradable: filters making tradable items and above options, Untradable: filters making untradable items and above options, Every recipe: filters every recipe.", "recipe_product_tradability": "Ignores the option if the category is in \"Daemonheim\". All: no filtering, Tradable: shows only tradable products, Untradable: shows only untradable products.", "recipe_material_tradability": "Ignores the option if the category is in \"Daemonheim\". All: no filtering, All tradable: shows only tradable ingredients, Some tradable: shows some tradable ingredients, All untradable: shows only untradable ingredients."};
const hbShown = (f, s) => (!HB_GROUPS[f[5]] || HB_GROUPS[f[5]][1](s)) && (!f[6] || f[6](s));
const hbInputs = HB_FIELDS.filter(f => f[2] !== 'fixed');
const hbDefaults = () => Object.fromEntries(hbInputs.map(f => [f[0], f[4]]));
function hbClean(f, v) {
  const [, , type, opt, def] = f; v = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  if (type === 'sel' || type === 'chk' || type === 'switch') return opt.includes(v) ? v : def;
  if (!/^\d+(\.\d+)?$/.test(v.replace(/,/g, ''))) return def;
  let n = Number(v.replace(/,/g, '')); if (type === 'int') n = Math.floor(n);
  return String(Math.min(opt[1], Math.max(opt[0], n)));
}
function hbLoad() { const d = hbDefaults(); let o = null; try { o = JSON.parse(CALC_LS && CALC_LS.getItem(HB_KEY) || 'null'); } catch (e) {}
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const f of hbInputs) if (typeof o[f[0]] === 'string') d[f[0]] = hbClean(f, o[f[0]]);
    // options saved before the app had the Wiki's section switches: switch on the sections that hold a changed option
    if (!('experience_boost' in o)) { const set = g => hbInputs.some(f => f[5] === g && d[f[0]] !== f[4]);
      for (const [g, k] of [['xp', 'experience_boost'], ['outfit', 'outfit_piece'], ['saving', 'cost_saving'], ['decant', 'potion_decanting']]) if (set(g)) d[k] = 'true';
      const c = set('show'), fl = set('filter'); d.show_opts = c && fl ? 'Both' : c ? 'Change columns' : fl ? 'Filter recipes' : 'Default'; } }
  return d; }
function hbSave(s) { try { CALC_LS && CALC_LS.setItem(HB_KEY, JSON.stringify(s)); } catch (e) {} }
/* The arguments the Wiki module receives: every field, with hidden ones at their defaults. */
const hbArgs = s => Object.fromEntries(hbInputs.map(f => [f[0], hbShown(f, s) ? s[f[0]] : f[4]]));
const hbFmt = n => Number(n).toLocaleString('en-GB', {maximumFractionDigits: 2});
const hbDur = ticks => { let t = Math.ceil(ticks * 0.6); const parts = [[86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']].map(([s, u]) => { const k = Math.floor(t / s); t -= k * s; return k ? `${k.toLocaleString('en-GB')} ${u}${k === 1 ? '' : 's'}` : null; }).filter(Boolean); return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0] || '0 seconds'; };

async function herbloreView(n) {
  const D = await get(n.data);
  const label = 'Potions needed to reach a goal', src = RS3Calc.wikiUrl(D.path);
  const rev = t => esc(D.source[t].revid);
  let st = hbLoad();
  view.innerHTML = `<div class="row subnav"><a class="btn sub" href="#calculators">← All calculators</a></div>
  <section class="panel calc-native-panel" aria-labelledby="hb-title">
    <div class="ge-heading calc-heading"><h2 id="hb-title">Herblore calculator</h2>
      <div class="calc-native-actions"><button class="calc-star" type="button" id="hb-star"></button>
      <a class="btn sub calc-source" href="${esc(src)}" target="_blank" rel="noopener noreferrer">Wiki calculator ↗</a></div></div>
    <p class="note">How many potions, herbs and other Herblore recipes you need to reach a level or XP goal, with their ingredients, products, cost and profit. Same recipes, options and formulas as the RuneScape Wiki <a href="${esc(src)}" target="_blank" rel="noopener noreferrer">Herblore calculator</a>, using live prices instead of the Wiki's guide prices, so costs and profits differ from the Wiki page.</p>
    <ul class="note calc-assume">
      <li>XP, number of actions, time, ingredient and product quantities follow the Wiki calculator exactly.</li>
      <li>Ingredients are bought at the live Buy (high) price and products are sold at the live Sell (low) price. Each item's cost is rounded up, as on the Wiki.</li>
      <li>Net profit deducts the estimated 2% Grand Exchange tax on each product sold (rounded down per item; Bonds are exempt). Gross profit is before tax.</li>
      <li>Items the Wiki marks as having no price (untradeable) count as 0 in the totals, as on the Wiki. They are not free: totals that include one say "excludes untradeable …", and such a profit is shown in a neutral colour as "Partial, not a market profit", never as a gain. Items the Wiki prices by its own calculated value, Daemonheim items in rusty coins, and any item without a Grand Exchange ID have no live price here, so the totals for those recipes are unavailable.</li>
      <li>A price that is missing or older than 15 minutes makes the totals for that recipe unavailable; it is never treated as 0.</li>
      <li>"Profitable" decanting and "Most profitable primal fruit" choose using live prices (the Wiki uses guide prices), so the dose or fruit chosen can differ from the Wiki. Products are compared on the profit basis shown (after estimated tax for Net, before tax for Gross). If any candidate has no live price, the choice is undetermined and that recipe's totals are unavailable.</li></ul>
    <form id="hb-form" class="hb-form" autocomplete="off" onsubmit="return false"></form>
    <div class="row hb-reset"><button class="btn sub" type="button" id="hb-reset">Reset all options</button></div>
    <p class="hb-msg" id="hb-msg" role="status"></p>
    <div class="row calc-filters">
      <input id="hb-q" type="search" placeholder="Search recipes or ingredients" aria-label="Search recipes or ingredients" autocomplete="off" autocapitalize="off" spellcheck="false">
      <select id="hb-show" aria-label="Profit shown" aria-describedby="hb-show-help"><option value="net">Net profit</option><option value="gross">Gross profit</option></select><small class="calc-sub calc-show-help" id="hb-show-help">Net profit: after the estimated 2% Grand Exchange tax. Gross profit: before tax.</small>
      <select id="hb-sort" aria-label="Sort"><option value="">Sort: level (as on the Wiki)</option><option value="profit">Sort: most profit</option><option value="pxp">Sort: best profit/XP</option><option value="cxp">Sort: lowest cost/XP</option><option value="xp">Sort: most XP each</option><option value="num">Sort: fewest actions</option></select></div>
    <p class="note" id="hb-count" role="status" aria-live="polite"></p>
    <div id="hb-table"></div>
    <p class="note">Formulas, recipes and form options: RuneScape Wiki <a href="${esc(src)}" target="_blank" rel="noopener noreferrer">Calculator:Herblore</a> (revision ${rev('Calculator:Herblore')}), Module:Skill calc/Herblore (revision ${rev('Module:Skill calc/Herblore')}) and Module:Skill calc/Herblore/data (revision ${rev('Module:Skill calc/Herblore/data')}); XP table Module:Experience/data (revision ${rev('Module:Experience/data')}); item IDs Module:GEIDs (revision ${rev('Module:GEIDs/data.json')}). CC BY-NC-SA 3.0.</p>
  </section>`;
  const star = $('#hb-star');
  const drawStar = () => { const on = RS3Calc.has(RS3Calc.load(CALC_LS), D.path); star.classList.toggle('on', on); star.setAttribute('aria-pressed', String(on)); star.textContent = on ? '★' : '☆';
    star.setAttribute('aria-label', `${on ? 'Remove' : 'Save'} ${label} ${on ? 'from' : 'to'} favourites`); star.title = on ? 'Remove from favourites' : 'Save to favourites'; };
  star.onclick = () => { RS3Calc.toggle(CALC_LS, {path: D.path, label}); drawStar(); };
  drawStar();

  const form = $('#hb-form');
  const help = k => HB_HELP[k] ? `<details class="hb-help"><summary aria-label="Help: ${esc(HB_FIELDS.find(f => f[0] === k)[1])}">?</summary><small>${esc(HB_HELP[k])}</small></details>` : '';
  const ctl0 = f => {
    const [k, l, type, opt] = f, id = 'hb-' + k, v = st[k];
    if (type === 'fixed') return `<div class="hb-fixed" id="${id}"><span>${esc(l)}</span><output>${esc(f[4])}</output></div>`;
    if (type === 'switch') return `<label class="hb-chk hb-switch" for="${id}"><input type="checkbox" role="switch" id="${id}" data-k="${k}"${v === 'true' ? ' checked' : ''}> ${esc(l)}</label>`;
    if (type === 'chk') return `<label class="hb-chk" for="${id}"><input type="checkbox" id="${id}" data-k="${k}"${v === 'true' ? ' checked' : ''}> ${esc(l)}${k === 'show_currency_image' ? ' <small class="calc-sub">(no effect here: this app shows prices as text)</small>' : ''}</label>`;
    if (type === 'sel') return `<label class="hb-field" for="${id}"><span>${esc(l)}</span><select id="${id}" data-k="${k}">${opt.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    return `<label class="hb-field" for="${id}"><span>${esc(l)}</span><input id="${id}" data-k="${k}" type="text" inputmode="${type === 'int' ? 'numeric' : 'decimal'}" value="${esc(v)}" aria-describedby="${id}-r"><small id="${id}-r" class="calc-sub">${esc(opt[0].toLocaleString())}–${esc(opt[1].toLocaleString())}</small></label>`;
  };
  const ctl = f => { const h = ctl0(f), x = help(f[0]); return x ? `<div class="hb-ctl">${h}${x}</div>` : h; };
  /* Wiki order: plain fields and section switches at the top level, each group right after the field that reveals it.
     The form is cut into fixed segments (runs of top-level fields, and each group); a segment is redrawn only when the set
     of fields it shows changes, so every other control keeps its node, value and focus. */
  const segs = []; for (const f of HB_FIELDS) { const g = HB_GROUPS[f[5]] ? f[5] : null, last = segs[segs.length - 1];
    if (last && last.g === g) last.fields.push(f); else segs.push({id: g || 'top-' + f[0], g, fields: [f]}); }
  const segKey = sg => sg.fields.filter(f => hbShown(f, st)).map(f => f[0]).join();
  const segHtml = sg => { const inner = sg.fields.filter(f => hbShown(f, st)).map(ctl).join('');
    return sg.g ? (inner ? `<fieldset class="hb-group" data-g="${sg.g}"><legend>${esc(HB_GROUPS[sg.g][0])}</legend><div class="hb-fields">${inner}</div></fieldset>` : '') : `<div class="hb-fields hb-top">${inner}</div>`; };
  const shownKey = () => segs.map(segKey).join('|');
  let drawnKey = '';
  const drawForm = full => {
    if (full || !form.querySelector('[data-seg]')) form.innerHTML = segs.map(sg => `<div class="hb-seg" data-seg="${sg.id}">${segHtml(sg)}</div>`).join('');
    else for (const sg of segs) { const el = form.querySelector(`[data-seg="${sg.id}"]`); if (el.dataset.k !== segKey(sg)) el.innerHTML = segHtml(sg); }
    for (const sg of segs) form.querySelector(`[data-seg="${sg.id}"]`).dataset.k = segKey(sg);
    drawnKey = shownKey();
  };
  /* Typing never rebuilds the form (a number field keeps its node, caret and focus); the form is rebuilt only when a choice
     shows or hides fields, and focus then returns to the control that was used. */
  const onChange = e => {
    const k = e.target.dataset.k; if (!k) return;
    const f = HB_FIELDS.find(x => x[0] === k), num = f[2] === 'int' || f[2] === 'num';
    const raw = f[2] === 'chk' || f[2] === 'switch' ? String(e.target.checked) : e.target.value;
    if (num && e.type === 'input') { const c = hbClean(f, raw); if (c !== raw.replace(/,/g, '').trim()) return; }   // wait for a complete number
    st[k] = hbClean(f, raw); hbSave(st);
    if (num && e.type === 'change' && e.target.value !== st[k]) e.target.value = st[k];
    if (shownKey() !== drawnKey) { const a = document.activeElement, foc = a && form.contains(a) ? a.id : null; drawForm(); const el = foc && document.getElementById(foc); if (el) el.focus(); }
    draw();
  };
  form.addEventListener('change', onChange); form.addEventListener('input', onChange);
  $('#hb-reset').onclick = () => { st = hbDefaults(); hbSave(st); drawForm(true); draw(); };

  const q = $('#hb-q'), show = $('#hb-show'), sort = $('#hb-sort');
  const methodOf = l => String(l.price || 'gemw').toLowerCase();
  const isNum = m => /^\d+(\.\d+)?$/.test(m.replace(/,/g, ''));
  /* One price per line: {v, kind, why}. v === null -> unavailable (never 0). */
  const linePrice = (l, role, rusty) => {
    const m = methodOf(l);
    if (rusty) return {v: null, why: 'Daemonheim price in rusty coins, not in this app'};
    if (m === 'no') return {v: 0, kind: 'untradeable'};
    if (m === 'gemw') {
      const id = D.ids[l.price_name]; if (id == null) return {v: null, why: 'no Grand Exchange item ID'};
      const x = role === 'product' ? LIVE.book.sale(id) : LIVE.book.quote(id, 'buy');
      return x.live ? {v: x.value, kind: 'live', tax: role === 'product' ? x.tax : 0, id} : {v: null, why: quoteWhy(x.status)};
    }
    if (isNum(m)) return {v: Number(m.replace(/,/g, '')), kind: 'fixed'};
    return {v: null, why: m === 'calcvalue' ? "Wiki calculated value, no live price" : m === 'dung' ? 'Daemonheim smuggler price, not in this app' : 'Wiki price method "' + m + '" not in this app'};
  };
  /* Price for the Wiki's own price-based choices. Products (side 'sell') compare what selling yields under the profit basis
     on screen: after the estimated per-item tax for Net, before it for Gross; ingredients compare the Buy price. */
  const choicePrice = (name, method, side) => {
    if (method === 'gemw') { const id = D.ids[name]; if (id == null) return null; if (side !== 'sell') { const x = LIVE.book.quote(id, 'buy'); return x.live ? x.value : null; }
      const x = LIVE.book.sale(id); return !x.live ? null : show.value === 'gross' ? x.value : x.net; }
    return isNum(method) ? Number(method.replace(/,/g, '')) : null;
  };
  const money = n => `${n < 0 ? '−' : ''}${gp(Math.abs(n))}`;
  const rowKey = r => [r.level, r.item_alias, r.recipe_idx, ...(r.steps || []).map(s => s.name), ...r.mats.map(m => m.name)].join('|');
  const draw = () => {
    const a = hbArgs(st);
    const res = RS3Calc.herbloreRun(D, a, choicePrice);   // re-run per view: "Profitable" choices follow the Net/Gross basis
    if (res.error) { $('#hb-msg').textContent = res.error; $('#hb-count').textContent = ''; $('#hb-table').innerHTML = ''; return; }
    $('#hb-msg').textContent = `To train Herblore from ${res.currXp.toLocaleString('en-GB')} experience (level ${res.currLevel}) to ${res.targetXp.toLocaleString('en-GB')} experience (level ${res.targetLevel}), ${res.remaining.toLocaleString('en-GB')} experience is required.`;
    const gross = show.value === 'gross';
    const showProducts = !res.hideProducts && a.product_mode !== 'Hidden', showProfit = !res.hideProducts && a.show_profit === 'true', showCost = a.show_cost === 'true', pics = a.show_item_image === 'true';
    const matMode = a.mat_mode, prodMode = res.hideProducts ? 'Hidden' : a.product_mode, stepMode = a.step_mode;
    const rows = res.rows.map(r => {
      const prices = new Map();
      const lp = (l, role) => { const p = linePrice(l, role, r.rusty); prices.set(role + ':' + l.name, p); return p.v; };
      const c = RS3Calc.herbloreCost(r, lp);
      let tax = null;
      if (c.prodTotal != null) tax = Math.ceil(r.products.reduce((t, l) => t + (prices.get('product:' + l.name).tax || 0) * l.qty, 0));
      const xpUsed = r.total_xp === 0 ? r.xp_per_iter : r.total_xp;
      const net = c.profit == null || tax == null ? null : c.profit - tax;
      const profit = gross ? c.profit : net;
      return {r, c, prices, tax, net, profit, perXp: profit != null && xpUsed > 0 ? Math.round(profit / xpUsed * 100) / 100 : null};
    });
    const nq = norm(q.value);
    let shown = nq ? rows.filter(x => norm([x.r.item_name, x.r.method, ...x.r.mats.map(m => m.name), ...x.r.products.map(p => p.name), ...(x.r.steps || []).map(s => s.name)].join(' ')).includes(nq)) : rows;
    const by = {profit: x => x.profit, pxp: x => x.perXp, cxp: x => x.c.costPerXp == null ? null : -x.c.costPerXp, xp: x => x.r.xp_per_iter, num: x => x.r.needed_iterations ? -x.r.needed_iterations : null}[sort.value];
    if (by) shown = [...shown].sort((x, y) => { const a1 = by(x), b1 = by(y); return a1 == null && b1 == null ? 0 : a1 == null ? 1 : b1 == null ? -1 : b1 - a1; });
    const priced = rows.filter(x => x.c.matTotal != null).length;
    $('#hb-count').textContent = `${shown.length} of ${rows.length} recipes · ${priced} with complete live costs · profit shown ${gross ? 'gross (before tax)' : 'net (after estimated tax)'}`;
    const open = new Set([...document.querySelectorAll('#hb-table details[open]')].map(d => d.dataset.row));
    const lvlCls = lv => lv > res.targetLevel ? 'hb-lv-red' : lv <= res.currLevel ? 'hb-lv-green' : 'hb-lv-yellow';
    const lineVal = (x, l, role) => { const p = x.prices.get(role + ':' + l.name); return p.v == null ? '<span class="calc-unavail">unavailable</span>' : p.kind === 'untradeable' ? 'untradeable: 0, not counted' : l.cost > 0 ? esc(gp(l.cost)) : '-'; };
    const list = (x, items, mode, role) => mode === 'Hidden' ? '' : items.length ? `<ul class="hb-list">${items.map(l => `<li>${pics ? liIco(l.name) : ''}<span class="hb-item">${esc(l.name)}</span>${mode !== 'Item' ? ` <span class="hb-qty">× ${esc(hbFmt(l.qty))}</span>` : ''}${mode === 'Price' && l.cost !== undefined ? ` <span class="hb-cost">${lineVal(x, l, role)}</span>` : ''}</li>`).join('')}</ul>` : '-';
    const steps = x => { const s = x.r.steps; if (stepMode === 'Hidden') return null; if (stepMode === 'Total') return String((s ? s.length : 0) + 1); return s && s.length ? `<ul class="hb-list">${s.map(l => `<li>${esc(l.name)}${stepMode === 'Quantity' ? ` × ${esc(hbFmt(l.qty))}` : ''}</li>`).join('')}</ul>` : '-'; };
    const why = (x, role, items) => [...new Set(items.map(l => x.prices.get(role + ':' + l.name)).filter(p => p && p.v == null).map(p => p.why))].join('; ');
    const priceLine = (x, l, role) => { const p = x.prices.get(role + ':' + l.name);
      return `<li>${pics ? liIco(l.name) : ''}${esc(l.name)} — ${role === 'product' ? 'Sell' : 'Buy'} ${p.v == null ? `<span class="calc-unavail">unavailable (${esc(p.why)})</span>` : p.kind === 'untradeable' ? 'untradeable, no market price: valued at 0 as on the Wiki (not free; its real cost/value is not in the totals)' : p.kind === 'fixed' ? `fixed Wiki value ${esc(gp(p.v))}` : `${esc(gp(p.v))} each${role === 'product' ? ` · est. tax ${esc(gp(p.tax))}` : ''}`}</li>`; };
    const recipe = x => { const r = x.r; let h = `<span class="calc-name-row">${pics ? calcIco(r.item_name) : ''}<span class="calc-name">${esc(r.item_name)}${r.item_multi > 1 ? ` × ${esc(String(r.item_multi))}` : ''}</span></span>`;
      if (Number(r.improved) > 0) h += `<small class="calc-sub">(Improved +${esc(String(r.improved))} recipe)</small>`;
      for (const m of [r.method, ...(r.steps || []).map(s => s.method)]) if (m) h += `<small class="calc-sub"><i>(${esc(m)})</i></small>`;
      if (r.choice_gaps && r.choice_gaps.length) h += `<small class="calc-sub hb-warn">Profitable choice undetermined (totals unavailable), no live price for: ${esc(r.choice_gaps.slice(0, 4).join(', '))}${r.choice_gaps.length > 4 ? '…' : ''}</small>`;
      const k = rowKey(r);
      h += `<details class="calc-prices" data-row="${esc(k)}"${open.has(k) ? ' open' : ''}><summary>Prices used</summary><ul>${r.mats.map(l => priceLine(x, l, 'mat')).join('')}${!res.hideProducts ? r.products.map(l => priceLine(x, l, 'product')).join('') : ''}</ul></details>`;
      return h; };
    const untr = (x, role, items) => items.filter(l => { const p = x.prices.get(role + ':' + l.name); return p && p.kind === 'untradeable'; }).map(l => l.name);
    const undet = x => x.c.undetermined ? `Profitable choice undetermined: no price for ${x.c.undetermined.slice(0, 3).join(', ')}${x.c.undetermined.length > 3 ? '…' : ''}` : '';
    const excl = names => names.length ? `<small class="calc-sub hb-excl">excludes untradeable ${esc(names.slice(0, 3).join(', '))}${names.length > 3 ? '…' : ''} (no market price, not free)</small>` : '';
    const total = (x, v, miss, names) => v == null ? `<span class="calc-unavail">Unavailable</span><small class="calc-sub">${esc(undet(x) || miss)}</small>` : (v > 0 ? esc(gp(v)) : '-') + excl(names);
    const profitCell = x => x.profit == null ? `<span class="calc-unavail">Unavailable</span><small class="calc-sub">${esc(undet(x) || why(x, 'mat', x.r.mats) || why(x, 'product', x.r.products))}</small>`
      : (ex => `<span class="calc-val ${ex.length ? 'partial' : x.profit < 0 ? 'loss' : 'gain'}">${esc(money(x.profit))}</span><small class="calc-sub">${gross ? `net ${esc(money(x.net))}` : `gross ${esc(money(x.c.profit))} · tax ${esc(gp(x.tax))}`}</small>${ex.length ? `<small class="calc-sub hb-excl">Partial, not a market profit: excludes untradeable ${esc(ex.slice(0, 3).join(', '))}${ex.length > 3 ? '…' : ''} (no market price, not free)</small>` : ''}`)([...untr(x, 'mat', x.r.mats), ...untr(x, 'product', x.r.products)]);
    const perXp = v => v == null ? '-' : `${v < 0 ? '−' : ''}${esc(Math.abs(v).toLocaleString('en-GB', {maximumFractionDigits: 2}))} gp`;
    const showTime = a.show_production_time === 'true';
    const head = ['Lvl', 'Recipe', 'XP', 'Number', ...(showTime ? ['Time'] : []), ...(stepMode !== 'Hidden' ? ['Steps'] : []), 'Materials', ...(showCost ? ['Total cost', 'Cost/XP'] : []), ...(showProducts ? ['Products'] : []), ...(showProfit ? ['Total value', gross ? 'Gross profit' : 'Net profit', 'Profit/XP'] : [])];
    $('#hb-table').innerHTML = shown.length ? `<table class="calc-table hb-table"><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${shown.map(x => {
      const r = x.r, st1 = steps(x);
      return `<tr><td class="${lvlCls(r.level)}">${esc(String(r.level))}</td><th scope="row">${recipe(x)}</th><td>${esc(hbFmt(r.xp_per_iter))}</td><td>${r.needed_iterations > 0 ? esc(Math.round(r.needed_iterations).toLocaleString('en-GB')) : '-'}</td>${showTime ? `<td>${r.tick ? esc(hbDur(r.tick)) : '-'}</td>` : ''}${st1 != null ? `<td>${st1}</td>` : ''}<td>${list(x, r.mats, matMode, 'mat')}</td>${showCost ? `<td>${total(x, x.c.matTotal, why(x, 'mat', r.mats), untr(x, 'mat', r.mats))}</td><td>${x.c.costPerXp == null ? '-' : perXp(x.c.costPerXp)}</td>` : ''}${showProducts ? `<td>${list(x, r.products, prodMode, 'product')}</td>` : ''}${showProfit ? `<td>${total(x, x.c.prodTotal, why(x, 'product', r.products), untr(x, 'product', r.products))}</td><td>${profitCell(x)}</td><td>${perXp(x.perXp)}</td>` : ''}</tr>`;
    }).join('')}</tbody></table>` : '<p class="note">No recipes match these options.</p>';
  };
  q.addEventListener('input', draw); show.onchange = draw; sort.onchange = draw;
  drawForm();
  priceDraws.push(draw);
  draw();
}

/* Calculator:Cooking, native. The Wiki's generic Module:Skill calc (with Cooking/data) is ported to RS3Calc.skillCalcRun and
   checked cell by cell against Wiki renders (tests/cooking.test.cjs); the form is the Wiki form, driven through the port of
   MediaWiki:Gadget-calc-core.js (hidden fields are not sent, invalid numbers stop the run as on the Wiki). */
function skLoad(D, KEY) { let st = RS3Calc.skillFormDefaults(D.form); let o = null; try { o = JSON.parse(CALC_LS && CALC_LS.getItem(KEY) || 'null'); } catch (e) {}
  if (o && typeof o === 'object' && Array.isArray(o.actions)) for (const [k, v] of o.actions.slice(0, 50)) { try { st = RS3Calc.skillFormSet(D.form, st, String(k), typeof v === 'boolean' ? v : String(v)); } catch (e) {} }
  return st; }
function skSave(D, st, KEY) { const def = RS3Calc.skillFormDefaults(D.form), actions = [];
  for (const p of D.form.params) if (p.type !== 'hidden' && p.type !== 'hs' && st.value[p.name] !== def.value[p.name]) actions.push([p.name, st.value[p.name]]);
  // replay order: toggling fields first so the fields they reveal can be set
  actions.sort((a, b) => (D.form.params.find(p => p.name === b[0]).rawtogs ? 1 : 0) - (D.form.params.find(p => p.name === a[0]).rawtogs ? 1 : 0));
  try { CALC_LS && CALC_LS.setItem(KEY, JSON.stringify({actions})); } catch (e) {} }
async function skillView(n, K) {
  const P = K.id;
  const D = await get(n.data); await calcImages();
  const label = K.skill + ' calculator', src = RS3Calc.wikiUrl(D.path), rev = t => esc(D.source[t].revid);
  let st = skLoad(D, K.key);
  view.innerHTML = `<div class="row subnav"><a class="btn sub" href="#calculators">← All calculators</a></div>
  <section class="panel calc-native-panel" aria-labelledby="${P}-title">
    <div class="ge-heading calc-heading"><h2 id="${P}-title">${esc(label)}</h2>
      <div class="calc-native-actions"><button class="calc-star" type="button" id="${P}-star"></button>
      <a class="btn sub calc-source" href="${esc(src)}" target="_blank" rel="noopener noreferrer">Wiki calculator ↗</a></div></div>
    ${K.intro(src)}
    <ul class="note calc-assume">${K.assume.map(t => `<li>${t}</li>`).join('')}</ul>
    <form id="${P}-form" class="hb-form" autocomplete="off" onsubmit="return false"></form>
    <div class="row hb-reset"><button class="btn sub" type="button" id="${P}-reset">Reset all options</button></div>
    <p class="hb-msg" id="${P}-msg" role="status"></p>
    <div class="row calc-filters">
      <input id="${P}-q" type="search" placeholder="Search recipes or ingredients" aria-label="Search recipes or ingredients" autocomplete="off" autocapitalize="off" spellcheck="false">
      <select id="${P}-show" aria-label="Profit shown" aria-describedby="${P}-show-help"><option value="net">Net profit</option><option value="gross">Gross profit</option></select><small class="calc-sub calc-show-help" id="${P}-show-help">Net profit: after the estimated 2% Grand Exchange tax. Gross profit: before tax.</small>
      <select id="${P}-sort" aria-label="Sort"><option value="">Sort: as on the Wiki</option><option value="profit">Sort: most profit</option><option value="pxp">Sort: best profit/XP</option><option value="xp">Sort: most XP each</option><option value="num">Sort: fewest actions</option></select></div>
    <p class="note" id="${P}-count" role="status" aria-live="polite"></p>
    <div id="${P}-table"></div>
    <p class="note">Formulas, ${K.noun} and form: RuneScape Wiki <a href="${esc(src)}" target="_blank" rel="noopener noreferrer">Calculator:${esc(K.skill)}</a> (revision ${rev('Calculator:' + K.skill)}), Module:Skill calc (revision ${rev('Module:Skill calc')}), Module:Skill calc/bonusGenerator (revision ${rev('Module:Skill calc/bonusGenerator')}), Module:Skill calc/eltGenerator (revision ${rev('Module:Skill calc/eltGenerator')}), Module:Skill calc/${esc(K.skill)}/data (revision ${rev('Module:Skill calc/' + K.skill + '/data')}); XP table Module:Experience/data (revision ${rev('Module:Experience/data')}); item IDs Module:GEIDs (revision ${rev('Module:GEIDs/data.json')}). CC BY-NC-SA 3.0.</p>
  </section>`;
  const star = $('#' + P + '-star');
  const drawStar = () => { const on = RS3Calc.has(RS3Calc.load(CALC_LS), D.path); star.classList.toggle('on', on); star.setAttribute('aria-pressed', String(on)); star.textContent = on ? '★' : '☆';
    star.setAttribute('aria-label', `${on ? 'Remove' : 'Save'} ${label} ${on ? 'from' : 'to'} favourites`); star.title = on ? 'Remove from favourites' : 'Save to favourites'; };
  star.onclick = () => { RS3Calc.toggle(CALC_LS, {path: D.path, label}); drawStar(); };
  drawStar();
  const form = $('#' + P + '-form');
  const ctl = p => { const id = P + '-' + p.name, v = st.value[p.name];
    if (p.type === 'check') return `<label class="hb-chk" for="${id}"><input type="checkbox" id="${id}" data-k="${esc(p.name)}"${v ? ' checked' : ''}> ${esc(p.label)}</label>`;
    if (p.type === 'fixed') return `<div class="hb-field hb-fixed" id="${id}"><span>${esc(p.label)}</span><output>${esc(p.def)}</output></div>`;
    if (p.type === 'select') return `<label class="hb-field" for="${id}"><span>${esc(p.label)}</span><select id="${id}" data-k="${esc(p.name)}">${p.range.split(/\s*,\s*/).map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    const err = RS3Calc.skillFieldError(p, v);
    return `<label class="hb-field" for="${id}"><span>${esc(p.label)}</span><input id="${id}" data-k="${esc(p.name)}" type="text" inputmode="${p.type === 'number' ? 'decimal' : 'numeric'}" value="${esc(v)}" aria-invalid="${err ? 'true' : 'false'}" aria-describedby="${id}-r"><small id="${id}-r" class="calc-sub${err ? ' hb-warn' : ''}">${esc(hintText(p, v))}</small></label>`; };
  const rangeText = p => p.range ? p.range.replace('-', '–') : '0 or more';
  /* Module:Skill calc reads Current/Goal as a level only when "Level" is chosen and the number is 120 or less; anything higher is
     taken as experience (Goal Level 130 = 130 XP, level 2). The app keeps that Wiki behaviour and says so; it never clamps. */
  const LVL_TOGGLE = {current: 'currToggle', goal: 'goalToggle'};
  const levelNote = (p, raw) => { const t = LVL_TOGGLE[p.name], n = +String(raw).split(',').join('');
    return t && st.value[t] === 'Level' && Number.isInteger(n) && n > 120 ? `Above 120 the Wiki reads this as experience: ${n.toLocaleString('en-GB')} XP, not level ${n}` : ''; };
  const hintText = (p, raw) => RS3Calc.skillFieldError(p, raw) || levelNote(p, raw) || rangeText(p);
  const shown = () => D.form.params.filter(p => p.type !== 'hidden' && p.type !== 'hs' && !st.disabled[p.name]);
  let shownKey = '';
  const drawForm = () => { const ps = shown(); shownKey = ps.map(p => p.name).join(); form.innerHTML = `<div class="hb-fields">${ps.map(ctl).join('')}</div>`; };
  /* The form is rebuilt only when the Wiki's toggles change which fields are shown (a select or check the user just set).
     Typing in a number field, or leaving it (its "change" on blur), never replaces any field element: a rebuild on blur
     would remove the field the user just clicked into. The hint under a number field is updated in place as you type. */
  const hint = (p, el) => { const err = RS3Calc.skillFieldError(p, el.value); el.setAttribute('aria-invalid', err ? 'true' : 'false');
    const sm = document.getElementById(el.id + '-r'); if (sm) { sm.textContent = hintText(p, el.value); sm.classList.toggle('hb-warn', !!err); } };
  const onChange = e => { const k = e.target.dataset.k; if (!k) return; const p = D.form.params.find(x => x.name === k);
    const v = p.type === 'check' ? e.target.checked : e.target.value;
    try { st = RS3Calc.skillFormSet(D.form, st, k, v); } catch (err) { return; }
    skSave(D, st, K.key);
    if (p.type === 'int' || p.type === 'number') hint(p, e.target);
    for (const [f, t] of Object.entries(LVL_TOGGLE)) if (k === t) { const el = document.getElementById(P + '-' + f); if (el) hint(D.form.params.find(x => x.name === f), el); }
    if (shown().map(x => x.name).join() !== shownKey) {
      const a = document.activeElement, foc = a && form.contains(a) ? a.id : '';
      drawForm(); const el = foc && document.getElementById(foc); if (el) el.focus(); }
    draw(); };
  form.addEventListener('change', onChange); form.addEventListener('input', onChange);
  $('#' + P + '-reset').onclick = () => { st = RS3Calc.skillFormDefaults(D.form); skSave(D, st, K.key); drawForm(); draw(); };
  const q = $('#' + P + '-q'), show = $('#' + P + '-show'), sort = $('#' + P + '-sort');
  const money = v => `${v < 0 ? '−' : ''}${gp(Math.abs(v))}`;
  const draw = () => {
    const {submission, errors} = RS3Calc.skillFormSubmission(D.form, st);
    if (errors.length) { $('#' + P + '-msg').textContent = errors.join(' · '); $('#' + P + '-count').textContent = ''; $('#' + P + '-table').innerHTML = ''; return; }
    const res = RS3Calc.skillCalcRun(D, submission);
    if (res.error) { $('#' + P + '-msg').textContent = res.error; $('#' + P + '-count').textContent = ''; $('#' + P + '-table').innerHTML = ''; return; }
    $('#' + P + '-msg').textContent = RS3Calc.skillCalcMessage(res);
    const gross = show.value === 'gross', urns = res.disp === 'Urns', costs = res.rows.length ? res.rows[0].costCols : true;
    // Wiki generate_NoProfitLoss tables (Firemaking outside incense) have only costs: nothing is sold, so there is no net/gross
    // profit choice and the profit sorts become "lowest cost" sorts
    const npl = res.layout === 'NoProfitLoss', helpEl = document.getElementById(P + '-show-help');
    show.hidden = npl; if (helpEl) helpEl.hidden = npl;
    for (const o of sort.options) { if (o.value === 'profit') o.textContent = npl ? 'Sort: lowest total cost' : 'Sort: most profit'; if (o.value === 'pxp') o.textContent = npl ? 'Sort: lowest cost/XP' : 'Sort: best profit/XP'; }
    const rows = res.rows.map(r => {
      const why = new Map(); let taxEach = 0;
      const lp = (name, role) => { const id = D.ids[name]; if (id == null) { why.set(name, 'no Grand Exchange item ID'); return null; }
        const x = role === 'product' ? LIVE.book.sale(id) : LIVE.book.quote(id, 'buy');
        if (!x.live) { why.set(name, quoteWhy(x.status)); return null; } if (role === 'product') taxEach = x.tax; return x.value; };
      const c = r.truncated ? null : RS3Calc.skillCalcCost(r, lp);
      const taxA = c && !c.currency && c.prodEach != null && r.product ? taxEach * ((r.product && r.product.units) || 1) * (r.brewing ? 2 : 1) : 0;
      const netEach = c && c.profitEach != null ? c.profitEach - taxA : null;
      const profitEach = gross ? (c && c.profitEach) : netEach;
      // never counted as free: untradeable lines and lines the Wiki does not price make the totals partial (shown neutral)
      const excl = [...r.listed.filter(l => !l.priced && !r.currency && l.unpriced !== 'wiki').map(l => l.name), ...(!npl && !r.product && !r.currency && !urns ? [r.name + ' (product)'] : [])];
      const unp = r.currency ? [] : r.listed.filter(l => l.unpriced === 'wiki').map(l => l.name);
      return {r, c, why, taxA, profitEach, profit: profitEach == null ? null : profitEach * r.needed, perXp: profitEach != null && r.unitExp ? profitEach / r.unitExp : null, excl, unp, partial: excl.length + unp.length > 0};
    });
    const nq = norm(q.value);
    let shown = nq ? rows.filter(x => norm([x.r.title || x.r.name, ...x.r.listed.map(l => l.name)].join(' ')).includes(nq)) : rows;
    const negc = v => v == null ? null : -v;
    const by = (npl ? {profit: x => negc(x.c && x.c.costTotal), pxp: x => negc(x.c && x.c.costPerXp)} : {profit: x => x.profit, pxp: x => x.perXp})[sort.value]
      || {xp: x => x.r.unitExp, num: x => x.r.needed ? -x.r.needed : null}[sort.value];
    if (by) shown = [...shown].sort((x, y) => { const a1 = by(x), b1 = by(y); return a1 == null && b1 == null ? 0 : a1 == null ? 1 : b1 == null ? -1 : b1 - a1; });
    const priced = rows.filter(x => x.c && x.c.raw != null).length;
    $('#' + P + '-count').textContent = `${shown.length} of ${rows.length} recipes · ${priced} with complete live costs${costs && !npl ? ` · profit shown ${gross ? 'gross (before tax)' : 'net (after estimated tax)'}` : ''}`;
    const cur = x => x.r.currency ? ` ${esc(x.r.currency)}` : '';
    const unav = x => `<span class="calc-unavail">Unavailable</span><small class="calc-sub">${esc([...new Set(x.why.values())].join('; '))}</small>`;
    // Totals that leave out an untradeable ingredient or product keep the Wiki's arithmetic (valued at 0) but are shown neutral,
    // never as a green profit: they are partial, non-market figures, not something you would earn.
    const list3 = a => esc(a.slice(0, 3).join(', ')) + (a.length > 3 ? '…' : '');
    const exclTag = x => x.partial ? `<small class="calc-sub hb-excl">Partial, not a market profit: excludes ${[x.excl.length ? `untradeable ${list3(x.excl)} (no market price, not free)` : '', x.unp.length ? `${list3(x.unp)} (not priced by the Wiki for this recipe, not free)` : ''].filter(Boolean).join('; ')}</small>` : '';
    const amt = (x, v) => v == null ? unav(x) : x.r.currency ? `${esc(Math.round(v).toLocaleString('en-GB'))}${cur(x)}` : esc(money(v));
    const qty = (l, r) => { let a = l.qty * r.needed; if (a > 100) a = Math.ceil(a); else if (!(a < 0.1)) a = Math.ceil(a * 100) / 100; return a.toLocaleString('en-GB'); };
    const priceLines = x => `<details class="calc-prices"><summary>Prices used</summary><ul>${x.r.listed.map(l => `<li>${liIco(l.image || l.name)}${esc(l.name)} — ${x.r.currency ? `Wiki value in ${esc(x.r.currency)}` : !l.priced ? (l.unpriced === 'wiki' ? 'not priced by the Wiki for this recipe: left out of the totals (not free)' : 'untradeable, not priced by the Wiki: valued at 0 (not free; not in the totals)') : x.why.has(l.name) ? `<span class="calc-unavail">unavailable (${esc(x.why.get(l.name))})</span>` : `Buy ${esc(gp(LIVE.book.quote(D.ids[l.name], 'buy').value))} each`}</li>`).join('')}${x.r.product && !npl ? `<li>${liIco(x.r.name)}${esc(x.r.name)} — ${x.why.has(x.r.name) ? `<span class="calc-unavail">unavailable (${esc(x.why.get(x.r.name))})</span>` : `Sell ${esc(gp(LIVE.book.sale(D.ids[x.r.name]).value))} each · est. tax ${esc(gp(LIVE.book.sale(D.ids[x.r.name]).tax))}${x.r.brewing ? ' · Brewing: 2 batches per action' : ''}`}</li>` : ''}</ul></details>`;
    // the Wiki's own column order and names (Module:Skill calc/elts); its picture and members columns are folded into the name cell
    // cost-only tables keep the Wiki's own labels: "Product cost" there is the Wiki's name for unit cost x actions, and the last
    // cost column is "XP cost" (Milestones: "Profit/XP"); Char has no materials column
    const nplCostHeads = res.headers.filter(h => ['Unit cost', 'Product cost', 'XP cost', 'Profit/XP'].includes(h));
    const head = urns ? ['Name', 'XP', '# needed', 'Cost'] : npl ? ['Level', 'Name', 'XP', '# needed', ...(res.headers.includes('Materials') ? ['Materials'] : []), ...(costs ? nplCostHeads : [])]
      : ['Level', 'Name', 'XP', '# needed', ...(res.urn ? ['# urns'] : []), 'Materials', ...(costs ? ['Raw cost', 'Product cost', 'Profit/Loss', 'Profit/XP'] : [])];
    const nplCost = (x, v, dec) => { if (v == null) return unav(x);
      if (x.partial && !(x.c.costEach > 0)) return `-${exclTag(x)}`;   // every ingredient untradeable: the Wiki shows "-" (0); not free
      const t = dec ? `${esc(v.toLocaleString('en-GB', {maximumFractionDigits: 2}))}${x.r.currency ? cur(x) : ' gp'}` : amt(x, v);
      return `<span class="calc-val${x.partial ? ' partial' : ''}">${t}</span>${x.partial ? '<small class="calc-sub hb-excl">partial</small>' : ''}`; };
    const lvCls = c => 'hb-lv-' + c;
    $('#' + P + '-table').innerHTML = shown.length ? `<table class="calc-table hb-table"><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${shown.map(x => { const r = x.r, nm = esc([r.sLink, (r.title || r.name) + (r.multiplier ? ' × ' + r.multiplier : ''), r.eLink].filter(Boolean).join(' ')), ico = calcIco(r.item.icon || r.item.image || r.name);
      if (r.truncated) return `<tr><td>-</td><th scope="row">${ico}<span class="calc-name">${nm}</span><small class="calc-sub hb-warn">The Wiki's "All" list shows this urn without values; choose the Urns sub-category.</small></th><td colspan="${head.length - 2}">-</td></tr>`;
      if (urns) return `<tr><th scope="row">${ico}<span class="calc-name">${nm}</span>${priceLines(x)}</th><td>${esc(r.unitExp.toLocaleString('en-GB'))}</td><td>${esc(r.needed.toLocaleString('en-GB'))}</td><td>${amt(x, x.c.raw)}</td></tr>`;
      const mats = r.listed.length ? `<ul class="hb-list">${r.listed.map(l => `<li>${liIco(l.image || l.name)}<span class="hb-item">${esc(l.name)}</span> <span class="hb-qty">× ${esc(qty(l, r))}</span></li>`).join('')}</ul>` : '-';
      if (npl) return `<tr><td class="${lvCls(r.cls)}">${esc(String(r.level))}</td><th scope="row">${ico}<span class="calc-name">${nm}</span>${r.members ? '<small class="calc-sub">Members</small>' : ''}${costs ? priceLines(x) : ''}</th><td>${esc(r.unitExp.toLocaleString('en-GB'))}</td><td>${r.needed > 0 ? esc(r.needed.toLocaleString('en-GB')) : '-'}</td>${head.includes('Materials') ? `<td>${mats}</td>` : ''}${costs ? `<td>${nplCost(x, x.c.costEach)}</td><td>${nplCost(x, x.c.costTotal)}${x.partial && x.c.costEach > 0 ? exclTag(x) : ''}</td><td>${x.c.costPerXp == null ? '-' : nplCost(x, x.c.costPerXp, true)}</td>` : ''}</tr>`;
      return `<tr><td class="${lvCls(r.cls)}">${esc(String(r.level))}</td><th scope="row">${ico}<span class="calc-name">${nm}</span>${r.members ? '<small class="calc-sub">Members</small>' : ''}${costs ? priceLines(x) : ''}</th><td>${esc(r.unitExp.toLocaleString('en-GB'))}</td><td>${r.needed > 0 ? esc(r.needed.toLocaleString('en-GB')) : '-'}</td>${res.urn ? `<td>${r.urnsNeeded ? esc(r.urnsNeeded.toLocaleString('en-GB')) : '-'}</td>` : ''}<td>${mats}</td>${costs ? `<td>${amt(x, x.c.raw)}</td><td>${amt(x, x.c.prod)}</td><td>${x.profit == null ? unav(x) : `<span class="calc-val ${x.partial ? 'partial' : x.profit < 0 ? 'loss' : 'gain'}">${amt(x, x.profit)}</span>${!r.currency && r.product ? `<small class="calc-sub">${gross ? 'before tax' : `tax ${esc(gp(x.taxA * r.needed))}`}</small>` : ''}`}${exclTag(x)}</td><td>${x.perXp == null ? '-' : `<span class="calc-val${x.partial ? ' partial' : ''}">${x.perXp < 0 ? '−' : ''}${esc(Math.abs(x.perXp).toLocaleString('en-GB', {maximumFractionDigits: 2}))}${r.currency ? cur(x) : ' gp'}</span>${x.partial ? '<small class="calc-sub hb-excl">partial</small>' : ''}`}</td>` : ''}</tr>`; }).join('')}</tbody></table>` : '<p class="note">No recipes match these options.</p>';
  };
  q.addEventListener('input', draw); show.onchange = draw; sort.onchange = draw;
  drawForm(); priceDraws.push(draw); draw();
}

/* Per-calculator texts for the shared Wiki skill calculator screen (skillView); everything else comes from the Wiki data file. */
const wikiCalcIntro = (skill, noun, src) => `<p class="note">How many of each ${esc(skill)} ${noun} you need to reach a level or XP goal, with ingredients, cost and profit. Same ${noun}s, options and formulas as the RuneScape Wiki <a href="${esc(src)}" target="_blank" rel="noopener noreferrer">${esc(skill)} calculator</a>, using live prices instead of the Wiki's guide prices, so costs and profits differ from the Wiki page.</p>`;
const SKILL_PRICE_NOTES = [
  'Net profit deducts the estimated 2% Grand Exchange tax per product sold (rounded down per item). Gross is before tax.',
  'Partial totals are never shown as profit: ingredients or products the Wiki does not price (untradeable, or left out of a recipe by the Wiki) count as 0, as on the Wiki, but they are not free, so those totals are marked "Partial, not a market profit" and shown in a neutral colour.',
  'A price that is missing or older than 15 minutes, or an item with no Grand Exchange ID, makes that recipe\'s totals unavailable; it is never treated as 0.'];
const COOKING_K = {id: 'ck', key: 'dch_calc_cooking_v1', skill: 'Cooking', noun: 'recipes',
  intro: src => wikiCalcIntro('Cooking', 'recipe', src),
  assume: ['XP, number of actions, urns and ingredient quantities follow the Wiki calculator exactly, including its quirks: the Bonfire method adds no XP, Portable Range adds 21% in every sub-category, and the avatar bonus does not apply to Urns.',
    'Ingredients are bought at the live Buy (high) price and products sold at the live Sell (low) price; each ingredient line is rounded down, as on the Wiki. Brewing sells two batches.',
    ...SKILL_PRICE_NOTES, 'Recipes priced in chimes show the Wiki\'s chime values, not coins.']};
const FLETCHING_K = {id: 'fl', key: 'dch_calc_fletching_v1', skill: 'Fletching', noun: 'items',
  intro: src => wikiCalcIntro('Fletching', 'item', src),
  assume: ['XP, number of actions and ingredient quantities follow the Wiki calculator exactly: Portable Fletcher +10% XP, Ranger\'s workroom +5%, Double Experience Weekend +100%, bonus XP halves the XP needed up to its amount.',
    'Items made several at a time (for example "Bronze arrow × 15") sell all of them per action, as on the Wiki; tax is per item sold.',
    'Ingredients are bought at the live Buy (high) price and products sold at the live Sell (low) price; each ingredient line is rounded down, as on the Wiki. At a Portable Fletcher, ingredients for Arrows, Bolts, Darts and Bows - Unstrung cost 10% less (20% with the Brooch of the Gods), as on the Wiki.',
    ...SKILL_PRICE_NOTES, 'Dungeoneering sub-categories show no costs, as on the Wiki.']};
const CRAFTING_K = {id: 'cr', key: 'dch_calc_crafting_v1', skill: 'Crafting', noun: 'items',
  intro: src => wikiCalcIntro('Crafting', 'item', src),
  assume: ['XP, number of actions and ingredient quantities follow the Wiki calculator exactly: Portable Crafter +10% XP, Amulet of offerings +3% (added after the other boosts), outfit and avatar bonuses as on the Wiki, bonus XP halves the XP needed up to its amount.',
    'Ingredients are bought at the live Buy (high) price and products sold at the live Sell (low) price; each ingredient line is rounded down, as on the Wiki. At a Portable Crafter, ingredients in every sub-category cost 10% less (20% with the Brooch of the Gods), as on the Wiki.',
    ...SKILL_PRICE_NOTES, 'Dungeoneering Armour shows no costs, as on the Wiki.']};
const cookingView = n => skillView(n, COOKING_K);
const fletchingView = n => skillView(n, FLETCHING_K);
const FIREMAKING_K = {id: 'fm', key: 'dch_calc_firemaking_v1', skill: 'Firemaking', noun: 'methods',
  intro: src => `<p class="note">How many logs, bones or other fuel you need for each Firemaking method to reach a level or XP goal, and what the fuel costs. Same methods (bonfire and per-item variants), options and formulas as the RuneScape Wiki <a href="${esc(src)}" target="_blank" rel="noopener noreferrer">Firemaking calculator</a>, using live prices instead of the Wiki's guide prices, so costs differ from the Wiki page.</p>`,
  assume: ['XP and number of actions follow the Wiki calculator exactly: Portable Brazier +15% XP, outfit bonus +2% (1 piece) or +5% (2 pieces), avatar and custom boosts added to the same percentage, bonus XP halves the XP needed up to its amount.',
    'As on the Wiki, the extra XP of beacons ("All Fired Up") and similar bonuses in the Other sub-category is not added: the Wiki module only adds it for items marked with a skill, and none are.',
    'Costs: fuel is bought at the live Buy (high) price, each ingredient line rounded down, as on the Wiki. "Unit cost" is per action; "Product cost" is the Wiki\'s name for the total (unit cost × number needed); "XP cost" (Milestones: "Profit/XP") is the cost per XP. Nothing is sold, so there is no profit or tax, except in Incense Sticks, which shows the Wiki\'s profit columns.',
    'Untradeable fuel (for example Blisterwood logs or Driftwood) has no market price: the Wiki shows "-", the app marks it as not free and shows no cost for it. Daemonheim branches show the Wiki\'s value in rusty coins, not coins.',
    'A price that is missing or older than 15 minutes, or an item with no Grand Exchange ID, makes that method\'s costs unavailable; it is never treated as 0. Barbarian, Other and Char show no costs, as on the Wiki.']};
const craftingView = n => skillView(n, CRAFTING_K);
const firemakingView = n => skillView(n, FIREMAKING_K);

/* Official RuneScape Wiki pictures for calculator items (data/calc/images.json, built by tools/calc_images.py): exact
   File:<item>.png or a file the Wiki itself redirects to. No picture -> no picture slot (never a stand-in). */
let CALC_IMG = null;
async function calcImages() { if (!CALC_IMG) { try { CALC_IMG = (await get('data/calc/images.json')).items || {}; } catch (e) { CALC_IMG = {}; } } return CALC_IMG; }
const liIco = name => { const r = CALC_IMG && CALC_IMG[name]; return r ? `<img class="calc-li-ico" src="${esc(r.src)}" width="20" height="20" alt="" loading="lazy" decoding="async">` : ''; };
const calcIco = name => { const r = CALC_IMG && CALC_IMG[name]; return r ? `<img class="calc-ico" src="${esc(r.src)}" width="32" height="32" alt="" loading="lazy" decoding="async" title="${esc(name)} (picture: RuneScape Wiki, ${esc(r.file)})">` : PH(); };
const CALC_OPEN_KEY = 'dch_calc_dir_open_v1';
async function calcView(arg) {
  const native = arg ? RS3Calc.nativeBySlug(arg) : null;
  if (arg && !native) { location.replace('#calculators'); return; }
  if (native) { await calcImages(); return nativeCalcView(native); }
  const [D, L] = await Promise.all([get('data/calculators.json'), get('data/calc/directory.json').catch(() => null)]);
  const rows = (D.calculators || []).map(c => ({...c, path: RS3Calc.safeWikiPath(c.path)})).filter(c => c.path);
  const sections = [...new Set(rows.map(r => r.section))];
  const types = [...new Set(rows.map(r => r.type))].sort();
  const rev = D.sourceRevisionTimestamp ? new Date(D.sourceRevisionTimestamp).toLocaleDateString('en-US', {timeZone: 'America/New_York', day: 'numeric', month: 'short', year: 'numeric'}) : '';
  /* Groups in the Wiki page's order (sections, then its "Fancy tiles" groups); each entry stays in its own catalog group. */
  const groupMeta = new Map();
  if (L) for (const s of L.sections) for (const g of s.groups) groupMeta.set(s.name + '|' + g.name, g);
  const groupOrder = [];
  if (L) for (const s of L.sections) for (const g of s.groups) groupOrder.push(s.name + '|' + g.name);
  for (const r of rows) { const k = r.section + '|' + r.group; if (!groupOrder.includes(k)) groupOrder.push(k); }
  const entryIcon = r => { const x = L && L.icons[r.section + '|' + r.group + '|' + (D.calculators.find(c => RS3Calc.safeWikiPath(c.path) === r.path && c.group === r.group) || {}).path];
    return x && x.img ? `<img class="calc-ico" src="${esc(x.img.src)}" width="32" height="32" alt="" loading="lazy" decoding="async">` : PH(); };
  const groupIcon = k => { const g = groupMeta.get(k); const src = g && (g.img ? g.img.src : g.skillIcon); return src ? `<img class="calc-gico" src="${esc(src)}" width="32" height="32" alt="" decoding="async">` : PH(); };
  let openSet; try { openSet = new Set(JSON.parse(CALC_LS && CALC_LS.getItem(CALC_OPEN_KEY) || '[]')); } catch (e) { openSet = new Set(); }
  const saveOpen = () => { try { CALC_LS && CALC_LS.setItem(CALC_OPEN_KEY, JSON.stringify([...openSet])); } catch (e) {} };
  const isNative = r => !!RS3Calc.nativeFor(r.path);
  const nNative = rows.filter(isNative).length;
  view.innerHTML = `<section class="panel calc-panel" aria-labelledby="calc-title">
    <div class="ge-heading calc-heading"><h2 id="calc-title">Calculators</h2></div>
    <p class="note">Calculators built into the app: the RuneScape Wiki's own formulas and options, checked against the Wiki's results, with live Grand Exchange prices. ${nNative} ${nNative === 1 ? 'is' : 'are'} ready now; more are being built skill by skill (listed under "Not in the app yet").</p>
    <section class="calc-favs" aria-labelledby="calc-fav-title"><h3 id="calc-fav-title">★ Favourite calculators</h3>
      <div id="calc-fav-list"></div>
      <div class="row calc-add"><label for="calc-url" class="calc-add-label">Save another Wiki calculator</label>
        <input id="calc-url" type="url" inputmode="url" placeholder="https://runescape.wiki/w/Calculator:…" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="btn sub" id="calc-add" type="button">Save</button></div>
      <p class="note" id="calc-msg" role="status" aria-live="polite"></p>
      <p class="note">Saved on this device only. Saving does not change your saved stats.</p></section>
    <h3 class="calc-pick-h" id="calc-pick-h">Choose a skill</h3>
    <nav class="calc-tiles" id="calc-tiles" aria-labelledby="calc-pick-h"></nav>
    <div class="row calc-filters">
      <input id="calc-q" type="search" placeholder="Search calculators" aria-label="Search calculators" autocomplete="off" autocapitalize="off" spellcheck="false">
      <select id="calc-sec" aria-label="Category"><option value="">All categories</option>${sections.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <select id="calc-type" aria-label="Calculator type"><option value="">All types</option>${types.map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
    <p class="note" id="calc-count" role="status" aria-live="polite"></p>
    <section aria-labelledby="calc-native-h"><h3 id="calc-native-h" class="calc-sec-h">In the app</h3><div id="calc-native"></div></section>
    <details class="calc-upcoming" id="calc-upcoming"><summary><span class="calc-group-name">Not in the app yet</span> <span class="calc-group-n" id="calc-up-n"></span></summary>
      <p class="note">Listed on the RuneScape Wiki <a class="calc-src" href="${esc(D.source)}" target="_blank" rel="noopener noreferrer">Calculators</a> page${rev ? ` (revision of ${esc(rev)})` : ''} and not rebuilt in the app yet. Each has a link to its Wiki page as the source; the Wiki does not allow its pages to be embedded.</p>
      <div class="row calc-expand"><button class="btn sub" type="button" id="calc-open-all">Expand all</button><button class="btn sub" type="button" id="calc-close-all">Collapse all</button></div>
      <div id="calc-list"></div></details>
    <p class="note">Calculator names, descriptions, groups and pictures: RuneScape Wiki${L ? ` (Calculators page revision ${esc(L.sourceRevision)})` : ''}, CC BY-NC-SA 3.0; RuneScape images © Jagex Ltd.</p>
  </section>`;
  const star = (c, on) => `<button class="calc-star${on ? ' on' : ''}" type="button" data-path="${esc(c.path)}" data-label="${esc(c.label)}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Save'} ${esc(c.label)} ${on ? 'from' : 'to'} favourites" title="${on ? 'Remove from favourites' : 'Save to favourites'}">${on ? '★' : '☆'}</button>`;
  const srcLink = (path, label) => `<a class="calc-src" href="${esc(RS3Calc.wikiUrl(path))}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span><span class="sr-only"> (opens RuneScape Wiki in a new tab)</span></a>`;
  const appHref = path => { const n = RS3Calc.nativeFor(path); return n ? '#calculators/' + n.slug : null; };
  let favs = RS3Calc.load(CALC_LS);
  const favIcon = path => { const r = rows.find(x => x.path === path); return r ? entryIcon(r) : PH(); };
  const drawFavs = () => {
    $('#calc-fav-list').innerHTML = favs.length
      ? `<ul class="calc-fav-ul">${favs.map(f => { const h = appHref(f.path);
          return `<li class="calc-fav">${h ? `<a class="calc-open" href="${esc(h)}">${favIcon(f.path)}<span>${esc(f.label)}</span></a><span class="tag calc-in-app">In app</span>`
            : `<span class="calc-fav-name">${favIcon(f.path)}<span>${esc(f.label)}</span></span><span class="tag calc-wiki-only">Not in the app yet</span>${srcLink(f.path, 'Wiki page')}`}<button class="btn sub calc-unfav" type="button" data-path="${esc(f.path)}" aria-label="Remove ${esc(f.label)} from favourites">Remove</button></li>`; }).join('')}</ul>`
      : '<p class="note">No favourites yet. Tap ☆ next to a calculator to save it here.</p>';
  };
  const q = $('#calc-q'), sec = $('#calc-sec'), typ = $('#calc-type');
  const gid = k => 'calc-g-' + k.replace(/[^A-Za-z0-9]+/g, '-');
  let pick = '';   // selected skill/group key ('' = all)
  const card = r => { const n = RS3Calc.nativeFor(r.path);
    return `<li class="calc-card">${star(r, RS3Calc.has(favs, r.path))}<a class="calc-open calc-card-main" href="#calculators/${esc(n.slug)}">${entryIcon(r)}<span class="calc-card-text"><span class="calc-card-title">${esc(r.label)}</span>${r.desc ? `<span class="calc-desc">${esc(r.desc)}</span>` : ''}</span><span class="calc-go" aria-hidden="true">Open ›</span></a>
      <div class="calc-card-meta"><span class="tag calc-in-app">In app · live prices</span> <span class="tag calc-type">${esc(r.type)}</span> <small class="calc-sub">Formulas: ${srcLink(r.path, 'Wiki source')}</small></div></li>`; };
  const drawList = () => {
    const n = norm(q.value), s = sec.value, t = typ.value, filtering = !!(n || t);
    const base = rows.filter(r => (!s || r.section === s) && (!t || r.type === t) && (!n || norm(`${r.label} ${r.page} ${r.group} ${r.desc}`).includes(n)));
    const hit = base.filter(r => !pick || r.section + '|' + r.group === pick);
    const groups = new Map(groupOrder.map(k => [k, []]));
    for (const r of base) groups.get(r.section + '|' + r.group).push(r);
    const used = [...groups.entries()].filter(([, g]) => g.length);
    let lastSec = null;
    $('#calc-tiles').innerHTML = `<button type="button" class="calc-tile" data-g="" aria-pressed="${!pick}"><span class="calc-tile-name">All</span><span class="calc-tile-n">${base.filter(isNative).length} in app</span></button>` + used.map(([k, g]) => { const [sn, gn] = k.split('|'); const head = sn !== lastSec ? `<span class="calc-tile-sec">${esc(sn)}</span>` : ''; lastSec = sn;
      const nn = g.filter(isNative).length;
      return `${head}<button type="button" class="calc-tile${nn ? ' has-native' : ''}" data-g="${esc(k)}" aria-pressed="${pick === k}">${groupIcon(k)}<span class="calc-tile-name">${esc(gn)}</span><span class="calc-tile-n">${nn ? `${nn} in app` : `${g.length} soon`}</span></button>`; }).join('');
    const nat = hit.filter(isNative), up = hit.filter(r => !isNative(r));
    $('#calc-count').textContent = `${nat.length} in the app · ${up.length} not in the app yet${pick ? ' · ' + pick.split('|')[1] : ''}`;
    const ng = new Map(groupOrder.map(k => [k, []])); for (const r of nat) ng.get(r.section + '|' + r.group).push(r);
    const nUsed = [...ng.entries()].filter(([, g]) => g.length);
    $('#calc-native').innerHTML = nUsed.length ? nUsed.map(([k, g]) => `<div class="calc-native-group"><h4 class="calc-ng-h">${groupIcon(k)}<span>${esc(k.split('|')[1])}</span></h4><ul class="calc-cards">${g.map(card).join('')}</ul></div>`).join('')
      : `<p class="note">${pick ? 'No calculator for ' + esc(pick.split('|')[1]) + ' is in the app yet; it is listed under "Not in the app yet".' : 'No in-app calculator matches.'}</p>`;
    const ug = new Map(groupOrder.map(k => [k, []])); for (const r of up) ug.get(r.section + '|' + r.group).push(r);
    const uUsed = [...ug.entries()].filter(([, g]) => g.length);
    $('#calc-up-n').textContent = String(up.length);
    if (filtering || pick) $('#calc-upcoming').open = up.length > 0 && (filtering || pick !== '');
    lastSec = null;
    $('#calc-list').innerHTML = uUsed.length ? uUsed.map(([k, g]) => { const [sn, gn] = k.split('|'); const head = sn !== lastSec ? `<h4 class="calc-sec-h">${esc(sn)}</h4>` : ''; lastSec = sn;
      const open = filtering || pick === k || openSet.has(k);
      return `${head}<details class="calc-group" id="${gid(k)}" data-g="${esc(k)}"${open ? ' open' : ''}><summary>${groupIcon(k)}<span class="calc-group-name">${esc(gn)}</span> <small>${esc(sn)}</small><span class="calc-group-n" aria-label="${g.length} calculators">${g.length}</span></summary><ul class="calc-ul">${g.map(r =>
        `<li class="calc-item">${star(r, RS3Calc.has(favs, r.path))}${entryIcon(r)}<div class="calc-body"><span class="calc-item-name">${esc(r.label)}</span> <span class="tag calc-type">${esc(r.type)}</span> <span class="tag calc-wiki-only">Not in the app yet</span>${r.desc ? `<div class="calc-desc">${esc(r.desc)}</div>` : ''}<small class="calc-sub">Source: ${srcLink(r.path, 'Wiki page')}</small></div></li>`).join('')}</ul></details>`; }).join('')
      : '<p class="note">No calculators match.</p>';
  };
  $('#calc-list').addEventListener('toggle', e => { const d = e.target; if (!d.matches || !d.matches('details.calc-group') || q.value || typ.value || pick) return; if (d.open) openSet.add(d.dataset.g); else openSet.delete(d.dataset.g); saveOpen(); }, true);
  $('#calc-tiles').addEventListener('click', e => { const b = e.target.closest('.calc-tile'); if (!b) return; pick = pick === b.dataset.g ? '' : b.dataset.g; drawList(); const g0 = b.dataset.g, nb = [...$('#calc-tiles').querySelectorAll('.calc-tile')].find(x => x.dataset.g === g0); if (nb) nb.focus({preventScroll: true}); });
  $('#calc-open-all').onclick = () => { document.querySelectorAll('#calc-list details.calc-group').forEach(d => { d.open = true; }); };
  $('#calc-close-all').onclick = () => { document.querySelectorAll('#calc-list details.calc-group').forEach(d => { d.open = false; }); };
  const refreshStars = () => document.querySelectorAll('#calc-list .calc-star, #calc-native .calc-star').forEach(b => {
    const on = RS3Calc.has(favs, b.dataset.path), label = b.dataset.label;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '★' : '☆';
    b.setAttribute('aria-label', `${on ? 'Remove' : 'Save'} ${label} ${on ? 'from' : 'to'} favourites`); b.title = on ? 'Remove from favourites' : 'Save to favourites';
  });
  const msg = t => { $('#calc-msg').textContent = t; };
  const toggleFav = (path, label) => {
    const r = RS3Calc.toggle(CALC_LS, {path, label});
    if (!r.ok) { msg('Could not save on this device (storage unavailable or full).'); return; }
    favs = r.favs; drawFavs(); refreshStars(); msg(r.on ? `Saved ${label} to favourites.` : `Removed ${label} from favourites.`);
  };
  for (const id of ['#calc-list', '#calc-native']) $(id).addEventListener('click', e => { const b = e.target.closest('.calc-star'); if (b) toggleFav(b.dataset.path, b.dataset.label); });
  $('#calc-fav-list').addEventListener('click', e => { const b = e.target.closest('.calc-unfav'); if (!b) return; const f = favs.find(x => x.path === b.dataset.path); if (f) toggleFav(f.path, f.label); });
  const add = () => {
    const u = $('#calc-url'), p = RS3Calc.parseCalculatorUrl(u.value);
    if (!p) { msg('Not saved: enter a RuneScape Wiki calculator link like https://runescape.wiki/w/Calculator:Herblore'); return; }
    if (RS3Calc.has(favs, p.path)) { msg(`${p.page} is already a favourite.`); return; }
    const known = rows.find(r => r.path === p.path);
    const r = RS3Calc.toggle(CALC_LS, {path: p.path, label: known ? known.label : p.page.replace(/^Calculator:/, ''), custom: !known});
    if (!r.ok) { msg('Could not save on this device (storage unavailable or full).'); return; }
    favs = r.favs; u.value = ''; drawFavs(); refreshStars(); msg(`Saved ${p.page} to favourites.`);
  };
  $('#calc-add').onclick = add;
  $('#calc-url').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  q.addEventListener('input', drawList); sec.onchange = drawList; typ.onchange = drawList;
  drawFavs(); drawList();
}

async function itemsView(name) {
  if (name === '~ge') { location.replace('#ge'); return; }   /* old bookmark: G.E. is its own main tab now */
  if (name === '~stats') { location.replace('#char'); return; }
  if (name === '~sets') { location.replace('#char/sets'); return; }
  if (name === '~obtain' || name === '~dragon') return obtainView(name === '~dragon' ? 'dragon' : null);
  if (name === '~disc') return discView();
  if (name === '~all') return allView();
  const [D] = await Promise.all([itemData(), loadThumbs()]);
  const {items, best, gear} = D;
  const asof = `as of ${esc(geDateET(D))}`;
  if (name) {
    const r = rowOf(D, name), d = await itemDetail(D, name);
    const src = dropsOf(D, name) || [], g = gear[name] || (r && r[4] ? gear[r[4]] : null), v = priceOf(D, name), t = tradeOf(D, name);
    const page = d ? d.p : g ? g.p : name;
    view.innerHTML = `<div class="row" style="margin-bottom:10px"><a class="btn ghost" href="#items">← Items</a></div>
    <div class="panel"><div class="row">${icon(name)}<h2 style="margin:0">${esc(name)}</h2>${best[name] ? rarTag(best[name][0]) : ''}${flagTags(D, name)}</div>
    <div class="price">${t === false ? '<span class="untr">Untradeable</span>' : `${priceTag(D, name, 'buy', true)} ${livePriceTag(name, 'sell')}<div class="note">Guide price is a separate snapshot, not either trade quote. ${d && d.gename ? `GE entry: ${esc(d.gename)}` : ''}</div>`}</div>
    ${itemReqBlock(g, d, page)}
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
  const gf = gfLoad(), GS = loadStats();
  let dragonSet = null; try { const dr = await get('data/obdragon.json'); dragonSet = new Set(dr.rows.map(r => D.ia.rows[r[0]][0])); } catch (e) {}
  if (sessionStorage.iq && !o.q) o.q = sessionStorage.iq;
  if (o.show === 'untr') { o.show = 'all'; o.tr = 'untr'; }
  const st = D.ia.stats || {};
  view.innerHTML = `${subnav('search')}<div class="panel"><h2>Find any item</h2>${searchBox('q', 'e.g. red partyhat, santa hat, abyssal whip…', o.q)}
    ${gfHTML(gf, !!dragonSet)}
    <div class="chips gvt" id="gvt" role="group" aria-label="Show items or full armour sets"><button type="button" data-v="items">Items <span class="cnt"></span></button><button type="button" data-v="sets">Sets <span class="cnt">…</span></button></div>
    <div class="chips" id="rar"><button data-v="">Any rarity</button>${RANK.map((r, i) => `<button data-v="${i}" class="r${i}">${r}</button>`).join('')}</div>
    <div class="row" id="isel" style="margin-top:8px"><select id="show"><option value="all">All items</option><option value="drop">Dropped by something</option><option value="gear">Equipment (with stats)</option><option value="ge">On the Grand Exchange</option></select>
    <select id="tr"><option value="">Tradeable or not</option><option value="trade">Tradeable</option><option value="untr">Untradeable</option></select>
    <select id="mem"><option value="">Members &amp; free</option><option value="mem">Members</option><option value="f2p">Free-to-play</option></select>
    <select id="fl"><option value="">Any kind</option><option value="items">Items only (no cosmetic overrides)</option><option value="equip">Equipable</option><option value="quest">Quest items</option><option value="holiday">Holiday items (wiki category)</option><option value="disc">Discontinued / not currently obtainable</option><option value="limited">Limited time (wiki restriction)</option><option value="mtx">Treasure Hunter</option><option value="override">Cosmetic overrides</option></select>
    <select id="sort"><option value="match">Best match</option><option value="name">Name A–Z</option><option value="price">Observed Sell, high → low</option><option value="pricel">Observed Sell, low → high</option><option value="common">Rarity, common first</option><option value="rare">Rarity, rarest first</option><option value="tier">Tier, high → low</option></select></div>
    <div class="note" style="margin-top:6px">${D.names.length.toLocaleString()} items: every item page of the RS3 wiki copy (${(st.items || 0).toLocaleString()} item infobox entries incl. versions, ${(st.overrides || 0).toLocaleString()} cosmetic overrides), ${Object.keys(items).length.toLocaleString()} in drop tables, ${D.gd.gear.length.toLocaleString()} equipment pieces with stats, ${Object.keys(D.pr.prices).length.toLocaleString()} with an offline guide-price snapshot. Guide snapshots ${asof}. Displayed Buy/Sell quotes and live-price sorting use the separate live source; unavailable/stale quotes sort last.
    Rarity is an item's best drop chance across all its sources, banded the way the wiki colours drop tables (Always; Common ≥ 1/16; Uncommon ≥ 1/64; Rare ≥ 1/256; Very rare below that).</div><div id="res" class="list"></div></div>`;
  const q = $('#q'), out = $('#res');
  ['show', 'tr', 'mem', 'fl', 'sort'].forEach(k => { $('#' + k).value = o[k]; });
  const F = D.FL;
  let lim = 24;
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
    else if (o.show === 'ge') hits = hits.filter(([, n]) => tradeOf(D, n) === true);
    if (o.tr === 'trade') hits = hits.filter(([, n]) => tradeOf(D, n) === true);
    else if (o.tr === 'untr') hits = hits.filter(([, n]) => tradeOf(D, n) === false);
    if (o.mem) hits = hits.filter(([, n]) => fl(n) & F[o.mem]);
    if (o.fl === 'items') hits = hits.filter(([, n]) => !(fl(n) & F.override));
    else if (o.fl === 'equip') hits = hits.filter(([, n]) => fl(n) & F.equip || gear[n]);
    else if (o.fl) hits = hits.filter(([, n]) => fl(n) & F[o.fl]);
    /* gear filter: dragon chip, then class / slot / tier / wearable; counts on every chip are taken from the list before its own group is applied */
    const nDr = dragonSet ? hits.filter(([, n]) => dragonSet.has(n)).length : 0;
    if (gf.dragon && dragonSet) hits = hits.filter(([, n]) => dragonSet.has(n));
    const gi = n => gearInfo(D, n);
    const sv = gf.view === 'sets';
    if (!sv) gfRefresh(hits.map(([, n]) => gi(n)), nDr);
    if (gfActive(gf)) hits = hits.filter(([, n]) => gfPass(gi(n), gf, GS));
    /* Sets view: whole armour sets, same class / slot / tier / wearable / dragon / rarity / search filters */
    const gvb = (v, t) => { const e = document.querySelector(`#gvt [data-v="${v}"] .cnt`); if (e) e.textContent = t; };
    document.querySelectorAll('#gvt button').forEach(b => b.classList.toggle('on', b.dataset.v === (sv ? 'sets' : 'items')));
    $('#isel').hidden = sv; document.getElementById('res').classList.toggle('gsets', sv);
    gvb('items', hits.length.toLocaleString());
    let sres = null;
    if (SETS) {
      const xx = {nq, dragon: gf.dragon && dragonSet ? dragonSet : null, best, rar: o.rar};
      const cc = {}, sc = {}; let wc = 0;
      for (const s of SETS) {
        if (setPass(s, gf, GS, xx, 'c')) cc[s.c] = (cc[s.c] || 0) + 1;
        if (setPass(s, gf, GS, xx, 's')) for (const sl of s.slots) sc[sl] = (sc[sl] || 0) + 1;
        if (setPass(s, {...gf, wear: false}, GS, xx, 'w')) { const w = setWear(s, GS); if (w.full || w.almost) wc++; }
      }
      const list = SETS.filter(s => setPass(s, gf, GS, xx));
      sres = {list, counts: {cc, sc, wc}};
      gvb('sets', list.length.toLocaleString());
    }
    if (sv) {
      if (!sres) { out.innerHTML = '<div class="note">Loading full sets…</div>'; return; }
      gfRefresh([], nDr, sres.counts);
      const L = sres.list.map(s => [s, setWear(s, GS)]);
      const price = s => s.gePrice ?? s.sum;
      L.sort((a, b) => (gf.wear ? (b[1].full - a[1].full) : 0) || (b[0].t ?? -1) - (a[0].t ?? -1) || priceCompare(price(a[0]), price(b[0])) || a[0].n.localeCompare(b[0].n));
      const nf = L.filter(x => x[1].full).length, na = L.filter(x => x[1].almost).length, n1 = L.length;
      out.innerHTML = `<div class="note">${n1.toLocaleString()} full set${n1 === 1 ? '' : 's'}${gf.wear ? `: ${nf} wearable now, ${na} almost there (within 5 levels)` : ''}${n1 > lim ? `, showing ${lim}` : ''}. Pieces are grouped the way the RS3 wiki's class pages and Grand Exchange set items list them; sorted by tier, then price. The Rarity filter, search and Dragon chip apply to a set's pieces.${nq || gfActive(gf) || o.rar !== '' || gf.dragon ? '' : ' Pick a class or tier to narrow it down.'}</div>` + (n1 ? '' : '<div class="note">No full set matches these filters. Try another class, a wider tier range, or turn off “Wearable with my stats”.</div>') + L.slice(0, lim).map(([s]) => setCard(D, s, GS)).join('') + (n1 > lim ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="more">Show more sets</button></div>' : '');
      const m = $('#more'); if (m) m.onclick = () => { lim += 24; draw(); };
      return;
    }
    const P = n => priceOf(D, n, 'sell'), B = n => best[n] ? best[n][1] : null;
    const so = {match: (a, b) => b[0] - a[0] || a[1].localeCompare(b[1]), name: (a, b) => a[1].localeCompare(b[1]), price: (a, b) => priceCompare(P(a[1]), P(b[1])),
      pricel: (a, b) => priceCompare(P(a[1]), P(b[1]), true), common: (a, b) => (B(b[1]) ?? -1) - (B(a[1]) ?? -1), rare: (a, b) => (B(a[1]) ?? 9) - (B(b[1]) ?? 9),
      tier: (a, b) => ((gear[b[1]] || {}).tier ?? -1) - ((gear[a[1]] || {}).tier ?? -1)};
    const none = !nq && !gfActive(gf) && !gf.dragon && o.rar === '' && o.show === 'all' && !o.tr && !o.mem && !o.fl;
    const tierD = (a, b) => ((gear[b[1]] || {}).tier ?? -1) - ((gear[a[1]] || {}).tier ?? -1);
    /* default order with no search text: tier first when a gear filter is on, then GE price, high to low */
    const dflt = (a, b) => (gfActive(gf) ? tierD(a, b) : 0) || priceCompare(P(a[1]), P(b[1])) || a[1].localeCompare(b[1]);
    hits.sort(!nq && o.sort === 'match' ? dflt : so[o.sort] || so.match);
    const n0 = hits.length; hits = hits.slice(0, lim);
    out.innerHTML = `<div class="note">${none ? 'No filter picked: sorting by fresh observed Sell quotes; stale/unavailable items are last, not live-valued. Type a name, or choose a class, slot, tier or other filter, to narrow it down. ' : ''}${n0.toLocaleString()} match${n0 === 1 ? '' : 'es'}${n0 > lim ? `, showing ${lim}` : ''}.</div>` + (n0 ? '' : '<div class="obempty"><div><b>No items match.</b><div class="note">Loosen a filter, or use “Clear gear filter”.</div></div></div>') + hits.map(([, n]) => {
      const g = gear[n], b = best[n], src = dropsOf(D, n), gv = gi(n), cl = gv && gv.c !== 'unc' && gv.c !== 'none' ? GF_CLS.find(c => c[0] === gv.c)[1] : '';
      return `<a class="hit" href="#items/${encodeURIComponent(n)}">${icon(n)}<span>${esc(n)}${g && g.tier != null ? ` <span class="tag">T${g.tier}</span>` : ''}${cl ? ` <span class="tag">${cl}</span>` : ''}${g && g.slot ? ` <span class="tag">${esc(SLOT_LABEL[g.slot] || g.slot)}</span>` : ''}${flagTags(D, n)}</span>
        <span class="meta">${b ? rarTag(b[0]) : ''}${priceTag(D, n, 'sell')}${src ? `<div>${src.length} source${src.length === 1 ? '' : 's'}</div>` : ''}</span></a>`;
    }).join('') + (n0 > lim ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="more">Show more</button></div>' : '');
    const m = $('#more'); if (m) m.onclick = () => { lim += 48; draw(); };
  };
  const redraw = () => { lim = 24; draw(); };
  const gfRefresh = gfBind(D, gf, GS, redraw);
  let SETS = null; gearSets(D).then(x => { SETS = x; if (document.body.contains(out)) draw(); }).catch(() => { gf.view = 'items'; });
  document.querySelectorAll('#gvt button').forEach(b => b.onclick = () => { gf.view = b.dataset.v; try { sessionStorage.gfopt = JSON.stringify(gf); } catch (e) {} redraw(); });
  let tmr = null;
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(redraw, 150); };
  document.querySelectorAll('#rar button').forEach(b => b.onclick = () => { o.rar = b.dataset.v; redraw(); });
  ['show', 'tr', 'mem', 'fl', 'sort'].forEach(k => { $('#' + k).onchange = e => { o[k] = e.target.value; redraw(); }; });
  watchPriceDraw(draw, out);
  draw(); q.focus();
}

/* ---------- Gear class filter (Items tab): class, slot, tier range, "wearable with my stats", all from the RS3 wiki's Infobox Bonuses (data/gear.json) ----------
   class = the wiki's own `class` field of Infobox Bonuses ("All" and "Hybrid" are both the wiki's Hybrid armour class); where that field is missing or "none" the
   wiki's Melee / Ranged / Magic / Necromancy / Hybrid armour class pages (ArmourOverviewTable) are the fallback (g.cc); nothing is guessed from an item name. */
const GF_CLS = [['melee', 'Melee'], ['ranged', 'Ranged'], ['magic', 'Magic'], ['necromancy', 'Necromancy'], ['hybrid', 'Hybrid'], ['none', 'No class'], ['unc', 'Unclassified']];
const GF_SLOT = [['head', 'Head', ['head']], ['body', 'Body', ['body']], ['legs', 'Legs', ['legs']], ['hands', 'Gloves', ['hands']], ['feet', 'Boots', ['feet']], ['cape', 'Cape', ['cape']],
  ['neck', 'Neck', ['neck']], ['ring', 'Ring', ['ring']], ['ammo', 'Ammo', ['ammo']], ['weapon', 'Weapon', ['main', '2h']], ['offw', 'Off-hand weapon', ['offw']], ['shield', 'Shield', ['off']],
  ['pocket', 'Pocket', ['pocket']], ['aura', 'Aura', ['aura']]];
const GF_SLOTSET = Object.fromEntries(GF_SLOT.map(([k, , ss]) => [k, ss])), GF_SLOTKEY = {}; GF_SLOT.forEach(([k, , ss]) => ss.forEach(x => { GF_SLOTKEY[x] = k; }));
const GF_TIERS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 92, 95, 99];
const GF_DEF = {cls: '', slot: '', tmin: '', tmax: '', wear: false, dragon: false, view: 'items', showz: false};
function gearInfo(D, n, pg) {
  let v = D.gi.get(n); if (v !== undefined) return v;
  const g = D.gear[n] || (pg ? D.gear[pg] : null) || (() => { const r = rowOf(D, n); return r && r[4] ? D.gear[r[4]] : null; })();
  if (g) {
    const k = g.cls === 'all' ? 'hybrid' : g.cls;
    const c = ['melee', 'ranged', 'magic', 'necromancy', 'hybrid'].includes(k) ? k : g.cc ? g.cc : k === 'none' ? 'none' : 'unc';
    v = {c, s: g.slot || null, t: g.tier ?? null, g};
  } else { const r = rowOf(D, n); v = r && (r[3] & D.FL.equip) && !(r[3] & D.FL.override) ? {c: 'unc', s: null, t: null, g: null} : null; }
  D.gi.set(n, v); return v;
}
const gfActive = f => !!(f.cls || f.slot || f.tmin || f.tmax || f.wear);
function gfPass(v, f, S, skip) {
  if (!v) return false;
  if (skip !== 'c' && f.cls && v.c !== f.cls) return false;
  if (skip !== 's' && f.slot && !GF_SLOTSET[f.slot].includes(v.s)) return false;
  if (skip !== 't' && (f.tmin || f.tmax)) { if (v.t == null || (f.tmin && v.t < +f.tmin) || (f.tmax && v.t > +f.tmax)) return false; }
  if (skip !== 'w' && f.wear && !(v.g && reqMet(v.g, S))) return false;
  return true;
}
function gfHTML(f, withDragon) {
  const tier = id => `<select id="${id}" aria-label="${id === 'gtmin' ? 'Lowest tier' : 'Highest tier'}"><option value="">${id === 'gtmin' ? 'Any' : 'Any'}</option>${GF_TIERS.map(t => `<option value="${t}">${t}</option>`).join('')}</select>`;
  return `<div class="gfq">${withDragon ? '<div class="chips gfc" id="gfset"><button type="button" id="gfd" class="drgchip" title="Dragon gear: the RS3 wiki items of the Dragon category">Dragon gear <span class="cnt"></span></button></div>' : ''}
    <details class="gfp" id="gfp"${gfActive(f) ? ' open' : ''}><summary><span>Gear filter</span><span class="gfs" id="gfs"></span></summary>
    <div class="gfl">Class</div><div class="chips gfc" id="gfc">${GF_CLS.map(([k, l]) => `<button type="button" data-k="${k}">${l} <span class="cnt"></span></button>`).join('')}</div>
    <div class="gfl">Slot</div><div class="chips gfc gfsl" id="gfsl">${GF_SLOT.map(([k, l]) => `<button type="button" data-k="${k}">${l} <span class="cnt"></span></button>`).join('')}</div><button type="button" class="gfz" id="gfz" hidden></button>
    <div class="gfr"><label>Tier ${tier('gtmin')} to ${tier('gtmax')}</label><label class="gfw"><input type="checkbox" id="gfw"> Wearable with my stats <span class="cnt" id="gfwc"></span></label><button type="button" class="btn ghost" id="gfx">Clear gear filter</button></div>
    <div class="note gfn" id="gfn"></div></details></div>`;
}
/* wires the panel; returns refresh(infos): updates every chip count (each count ignores its own group, so you see what a click would give) */
function gfBind(D, f, S, onChange, dragonSet) {
  const $$ = q => document.querySelectorAll(q);
  const save = () => { try { sessionStorage.gfopt = JSON.stringify(f); } catch (e) {} };
  $('#gtmin').value = f.tmin; $('#gtmax').value = f.tmax; $('#gfw').checked = !!f.wear;
  $$('#gfc button').forEach(b => b.onclick = () => { f.cls = f.cls === b.dataset.k ? '' : b.dataset.k; save(); onChange(); });
  $$('#gfsl button').forEach(b => b.onclick = () => { f.slot = f.slot === b.dataset.k ? '' : b.dataset.k; save(); onChange(); });
  $('#gtmin').onchange = e => { f.tmin = e.target.value; if (f.tmin && f.tmax && +f.tmin > +f.tmax) f.tmax = f.tmin; $('#gtmax').value = f.tmax; save(); onChange(); };
  $('#gtmax').onchange = e => { f.tmax = e.target.value; if (f.tmin && f.tmax && +f.tmin > +f.tmax) f.tmin = f.tmax; $('#gtmin').value = f.tmin; save(); onChange(); };
  $('#gfw').onchange = e => { f.wear = e.target.checked; save(); onChange(); };
  $('#gfx').onclick = () => { f.cls = f.slot = f.tmin = f.tmax = ''; f.wear = false; $('#gtmin').value = $('#gtmax').value = ''; $('#gfw').checked = false; save(); onChange(); };
  const gd = $('#gfd'); if (gd) gd.onclick = () => { f.dragon = !f.dragon; save(); onChange(); };
  const gz = $('#gfz'); if (gz) gz.onclick = () => { f.showz = !f.showz; save(); gzPaint(); };
  const gzPaint = () => { const sl = $('#gfsl'); const z = sl.querySelectorAll('button.zero').length; sl.classList.toggle('hz', !f.showz); if (gz) { gz.hidden = !z; gz.textContent = f.showz ? 'Hide empty slots' : `Show ${z} empty slot${z === 1 ? '' : 's'}`; gz.setAttribute('aria-expanded', f.showz ? 'true' : 'false'); } };
  return (infos, nDragon, custom) => {
    let cc = {}, sc = {}, wc = 0;
    if (custom) ({cc, sc, wc} = custom);
    else for (const v of infos) {
      if (!v) continue;
      if (gfPass(v, f, S, 'c')) cc[v.c] = (cc[v.c] || 0) + 1;
      if (v.s && gfPass(v, f, S, 's')) { const k = GF_SLOTKEY[v.s]; if (k) sc[k] = (sc[k] || 0) + 1; }
      if (v.g && reqMet(v.g, S) && gfPass(v, f, S, 'w')) wc++;
    }
    $$('#gfc button').forEach(b => { b.classList.toggle('on', f.cls === b.dataset.k); b.querySelector('.cnt').textContent = (cc[b.dataset.k] || 0).toLocaleString(); });
    $$('#gfsl button').forEach(b => { b.classList.toggle('on', f.slot === b.dataset.k); b.classList.toggle('zero', !sc[b.dataset.k] && f.slot !== b.dataset.k); b.querySelector('.cnt').textContent = (sc[b.dataset.k] || 0).toLocaleString(); });
    gzPaint();
    $('#gfwc').textContent = wc.toLocaleString();
    if (gd) { gd.classList.toggle('on', !!f.dragon); gd.querySelector('.cnt').textContent = (nDragon || 0).toLocaleString(); }
    const parts = [f.dragon ? 'Dragon gear' : '', f.cls ? (GF_CLS.find(c => c[0] === f.cls) || [])[1] : '', f.slot ? (GF_SLOT.find(c => c[0] === f.slot) || [])[1] : '',
      f.tmin || f.tmax ? `Tier ${f.tmin || 'any'}–${f.tmax || 'any'}` : '', f.wear ? 'Wearable' : ''].filter(Boolean);
    $('#gfs').textContent = parts.length ? parts.join(' · ') : 'any class, slot or tier';
    $('#gfn').innerHTML = `Class is the “class” field of each item's wiki equipment infobox (Hybrid = the wiki's “Hybrid” and “All” armour, which it treats as one class). “No class” = the wiki states class none (cosmetics, tools…). “Unclassified” = equipable items whose wiki page states no class. Where the infobox gives none, the wiki's own class pages (Melee, Ranged, Magic, Necromancy, Hybrid armour) are used. “Wearable” checks skill levels only (${STATS_SAVED ? 'your saved levels' : 'no levels saved on this device, so the starting levels; <a href="#items/~stats">enter yours</a>'}), not quests or unlocks.`;
  };
}
const gfLoad = () => ({...GF_DEF, ...sjson(sessionStorage, 'gfopt', GF_DEF)});

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
async function obtainView(cat0) {
  const [D, OB] = await Promise.all([itemData(), get('data/ob.json')]);
  const B = OB.bits, CL = Object.fromEntries(OB.cats), F = D.FL;
  const COOL = B.cape | B.override | B.outfit | B.pet | B.event | B.achieve | B.dragon;
  const o = sjson(sessionStorage, 'obopt', {mode: 'money', cat: '', q: '', tr: '', mem: '', eq: '', hol: '', rar: '', only: '', sort: ''});
  const gf = gfLoad(), GS = loadStats();
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
    ${gfHTML(gf, false)}
    <div class="chips" id="cat"><button data-v="">All categories</button>${OB.cats.map(([c, l]) => `<button data-v="${c}" class="${c === 'dragon' ? 'drgchip' : ''}">${esc(l)} <span class="cnt">${(cnt[c] || 0).toLocaleString()}</span></button>`).join('')}</div>
    <div class="chips" id="rar"><button data-v="">Any rarity</button>${RANK.map((r, i) => `<button data-v="${i}" class="r${i}">${r}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px">
    <select id="tr"><option value="">Tradeable or not</option><option value="trade">Tradeable (GE)</option><option value="untr">Untradeable</option></select>
    <select id="mem"><option value="">Members &amp; free</option><option value="mem">Members</option><option value="f2p">Free-to-play</option></select>
    <select id="eq"><option value="">Equipable or not</option><option value="equip">Equipable / wearable</option></select>
    <select id="hol"><option value="">Holiday &amp; normal</option><option value="holiday">Holiday / event items only</option><option value="noh">No holiday items</option></select>
    <select id="only"><option value="">Hide quest-only &amp; minigame-only</option><option value="show">Include quest-only &amp; minigame-only</option></select>
    <select id="sort"><option value="">Default for the mode</option><option value="price">Observed Sell, high → low</option><option value="pricel">Observed Sell, low → high</option><option value="name">Name A–Z</option><option value="rare">Rarest drop first</option></select></div>
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
      if (o.mode === 'money' && !o.cat && priceOf(D, n, 'sell') == null) continue;
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
    const gI = L.map(([, r]) => gearInfo(D, name(r), D.ia.rows[r[0]][4]));
    gfRefresh(gI);
    if (gfActive(gf)) L = L.filter((_, i) => gfPass(gI[i], gf, GS));
    const P = r => priceOf(D, D.ia.rows[r[0]][0], 'sell');
    const sort = o.sort || (o.mode === 'money' ? 'price' : 'pic');
    const cmp = {price: (a, b) => priceCompare(P(a), P(b)), pricel: (a, b) => priceCompare(P(a), P(b), true), name: (a, b) => name(a).localeCompare(name(b)),
      rare: (a, b) => (best(b) ?? -1) - (best(a) ?? -1) || priceCompare(P(a), P(b)),
      pic: (a, b) => (b[4].pic ? 1 : 0) - (a[4].pic ? 1 : 0) || priceCompare(P(a), P(b)) || name(a).localeCompare(name(b))}[sort];
    L.sort((a, b) => (nq ? b[0] - a[0] : 0) || cmp(a[1], b[1]));
    const tradeN = L.filter(([, r]) => P(r) != null).length;
    if (!L.length) {
      out.innerHTML = `<div class="obempty">${dpick.slice(0, 2).map(r => obPic(r[4], name(r), 'obhpic')).join('')}<div><b>No obtainable items match.</b><div class="note">Try another word, category or filter.</div></div></div>`; return;
    }
    out.innerHTML = `<div class="note" style="margin:8px 0">${L.length.toLocaleString()} item${L.length === 1 ? '' : 's'} (${tradeN.toLocaleString()} with fresh observed Sell quotes)${L.length > lim ? `, showing ${lim}` : ''}.</div>
      <div class="obgrid">${L.slice(0, lim).map(([, r]) => obCard(D, OB, r)).join('')}</div>${L.length > lim ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="more">Show more</button></div>' : ''}`;
    const m = $('#more'); if (m) m.onclick = () => { lim += 96; draw(); };
  };
  let tmr = null;
  q.oninput = () => { clearTimeout(tmr); lim = 48; tmr = setTimeout(draw, 150); };
  const reset = () => { lim = 48; draw(); };
  const gfRefresh = gfBind(D, gf, GS, reset);
  document.querySelectorAll('#mode button').forEach(b => b.onclick = () => { o.mode = b.dataset.v; o.cat = ''; reset(); });
  document.querySelectorAll('#cat button').forEach(b => b.onclick = () => { o.cat = o.cat === b.dataset.v ? '' : b.dataset.v; reset(); });
  document.querySelectorAll('#rar button').forEach(b => b.onclick = () => { o.rar = b.dataset.v; reset(); });
  ['tr', 'mem', 'eq', 'hol', 'only', 'sort'].forEach(k => { $('#' + k).onchange = e => { o[k] = e.target.value; reset(); }; });
  watchPriceDraw(draw, out);
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
    <div class="obprice">${priceTag(D, n, 'sell')}${fl ? ` <span class="note">${fl}</span>` : ''}</div>
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
  const gf = gfLoad(), GS = loadStats();
  const name = r => D.ia.rows[r[0]][0];
  const cnt = {}; OB.rows.forEach(r => { for (const [c] of OB.cats) if (r[1] & B[c]) cnt[c] = (cnt[c] || 0) + 1; });
  const nPrice = OB.rows.filter(r => D.ia.rows[r[0]][2] != null).length, nRel = OB.rows.filter(r => r[4].rel).length, nRem = OB.rows.filter(r => r[4].rem).length;
  const gc = {unob: 0, disc: 0, del: 0}; OB.rows.forEach(r => { gc[WGRP(r[4].why)]++; });
  const pics = OB.rows.filter(r => r[4].pic && D.ia.rows[r[0]][2] != null).sort((a, b) => D.ia.rows[b[0]][2] - D.ia.rows[a[0]][2]).slice(0, 3);
  OB.rows.forEach(r => { r[5] = relDate(r[4].rel); r[6] = relDate(r[4].rem); });
  view.innerHTML = `${subnav('disc')}<div class="panel obpanel"><div class="obhero"><div class="obhpics">${pics.map(r => obPic(r[4], name(r), 'obhpic')).join('')}</div><div><h2>Discontinued items</h2>
    <div class="note">${OB.rows.length.toLocaleString()} items and cosmetics the RS3 wiki itself marks gone: ${gc.unob.toLocaleString()} “unobtainable”, ${gc.disc.toLocaleString()} “discontinued”, ${gc.del.toLocaleString()} deleted / removed / hidden or with a removal date. Partyhats, Santa hats, Halloween masks, holiday and event items live here. They are the entries left out of Obtainable. ${nRel.toLocaleString()} have a release date and ${nRem.toLocaleString()} a removal date on the wiki; ${nPrice.toLocaleString()} have a guide-price snapshot (${esc(D.pr.date)}). Descriptions and guide snapshots use the wiki's wording (${esc(OB.snap)} copy).</div></div></div>
    ${searchBox('q', 'Search discontinued items, e.g. red partyhat, santa, h\'ween mask, easter…', o.q)}
    ${gfHTML(gf, false)}
    <div class="chips" id="cat"><button data-v="">All categories</button>${OB.cats.map(([c, l]) => `<button data-v="${c}">${esc(l)} <span class="cnt">${(cnt[c] || 0).toLocaleString()}</span></button>`).join('')}</div>
    <div class="chips" id="rar"><button data-v="">Any rarity</button>${RANK.map((r, i) => `<button data-v="${i}" class="r${i}">${r}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px">
    <select id="g"><option value="">Any wiki marker</option><option value="unob">Unobtainable</option><option value="disc">Discontinued</option><option value="del">Deleted / removed / hidden</option></select>
    <select id="pr"><option value="">Any Sell quote status</option><option value="yes">Fresh observed Sell quote</option><option value="no">No fresh Sell quote</option></select>
    <select id="tr"><option value="">Tradeable or not</option><option value="trade">Tradeable (GE)</option><option value="untr">Untradeable</option></select>
    <select id="mem"><option value="">Members &amp; free</option><option value="mem">Members</option><option value="f2p">Free-to-play</option></select>
    <select id="eq"><option value="">Equipable or not</option><option value="equip">Equipable / wearable</option></select>
    <select id="hol"><option value="">Holiday &amp; normal</option><option value="holiday">Holiday / event items only</option></select>
    <select id="sort"><option value="price">Observed Sell, high → low</option><option value="pricel">Observed Sell, low → high</option><option value="name">Name A–Z</option><option value="rare">Rarest drop first</option><option value="reln">Released: newest first</option><option value="relo">Released: oldest first</option><option value="remn">Removed: newest first</option></select></div>
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
      if (o.pr === 'yes' && priceOf(D, n, 'sell') == null) continue;
      if (o.pr === 'no' && priceOf(D, n, 'sell') != null) continue;
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
    const gI = L.map(([, r]) => gearInfo(D, name(r), D.ia.rows[r[0]][4]));
    gfRefresh(gI);
    if (gfActive(gf)) L = L.filter((_, i) => gfPass(gI[i], gf, GS));
    const P = r => priceOf(D, D.ia.rows[r[0]][0], 'sell');
    const tie = (a, b) => (b[4].pic ? 1 : 0) - (a[4].pic ? 1 : 0) || name(a).localeCompare(name(b));
    const cmp = {price: (a, b) => priceCompare(P(a), P(b)) || tie(a, b), pricel: (a, b) => priceCompare(P(a), P(b), true) || tie(a, b), name: (a, b) => name(a).localeCompare(name(b)),
      rare: (a, b) => (best(b) ?? -1) - (best(a) ?? -1) || priceCompare(P(a), P(b)) || tie(a, b),
      reln: (a, b) => b[5] - a[5] || tie(a, b), relo: (a, b) => (a[5] || 9e15) - (b[5] || 9e15) || tie(a, b), remn: (a, b) => b[6] - a[6] || tie(a, b)}[o.sort] || ((a, b) => tie(a, b));
    L.sort((a, b) => (nq ? b[0] - a[0] : 0) || cmp(a[1], b[1]));
    const tradeN = L.filter(([, r]) => P(r) != null).length;
    if (!L.length) { out.innerHTML = '<div class="obempty"><div><b>No discontinued items match.</b><div class="note">Try another word or loosen a filter. To look through every item of the wiki use “Search all items”.</div></div></div>'; return; }
    out.innerHTML = `<div class="note" style="margin:8px 0">${L.length.toLocaleString()} item${L.length === 1 ? '' : 's'} (${tradeN.toLocaleString()} with fresh observed Sell quotes)${L.length > lim ? `, showing ${lim}` : ''}.</div>
      <div class="obgrid">${L.slice(0, lim).map(([, r]) => obCard(D, OB, r)).join('')}</div>${L.length > lim ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="more">Show more</button></div>' : ''}`;
    const m = $('#more'); if (m) m.onclick = () => { lim += 96; draw(); };
  };
  let tmr = null;
  q.oninput = () => { clearTimeout(tmr); lim = 48; tmr = setTimeout(draw, 150); };
  const reset = () => { lim = 48; draw(); };
  const gfRefresh = gfBind(D, gf, GS, reset);
  document.querySelectorAll('#cat button').forEach(b => b.onclick = () => { o.cat = o.cat === b.dataset.v ? '' : b.dataset.v; reset(); });
  document.querySelectorAll('#rar button').forEach(b => b.onclick = () => { o.rar = b.dataset.v; reset(); });
  ['g', 'pr', 'tr', 'mem', 'eq', 'hol', 'sort'].forEach(k => { $('#' + k).onchange = e => { o[k] = e.target.value; reset(); }; });
  watchPriceDraw(draw, out);
  draw();
}

/* ---------- Search all items: ignores every filter, category and section; searches all rows of data/iall.json (every wiki item entry) ---------- */
async function allView() {
  const D = await itemData();
  const rows = D.ia.rows, TOT = rows.length;
  if (!D.nameN) { D.nameN = rows.map(r => norm(r[0])); D.nameC = D.nameN.map(n => n.replace(/ /g, '')); D.pageN = rows.map(r => r[4] ? norm(r[4]) : ''); }
  const F = D.FL;
  let sq = ''; try { sq = sessionStorage.alq || ''; } catch (e) {}
  const gf = gfLoad(), GS = loadStats();
  view.innerHTML = `${subnav('all')}<div class="panel"><h2>Search all items</h2>
    ${searchBox('q', 'Any item, any state: e.g. red partyhat, h\'ween mask, abyssal whip, a quest item, a Daemonheim item…', sq)}
    ${gfHTML(gf, false)}
    <div class="row" style="margin-top:6px"><button class="btn ghost" id="clr">Clear</button><span class="note">No section, category or other filter applies here (only the optional gear filter above narrows the list): every one of the ${TOT.toLocaleString()} entries of the RS3 wiki item list is searched, including Daemonheim-only, quest-only, discontinued, cosmetic-override, untradeable and no-GE-price items. Names, the wiki page title and the wiki's own redirects (alternative names) are matched.</span></div>
    <div class="note" id="cnt" style="margin:8px 0"></div><div id="res" class="list"></div><div id="more"></div></div>`;
  const q = $('#q'), out = $('#res'), cnt = $('#cnt'), more = $('#more');
  let hits = [], hitsAll = [], lim = 60, seq = 0;
  const gInfo = i => gearInfo(D, rows[i][0], rows[i][4]);
  const gfRefresh = gfBind(D, gf, GS, () => run());
  const run = async () => {
    const my = ++seq, nq = norm(q.value); try { sessionStorage.alq = q.value; } catch (e) {}
    lim = 60;
    if (!nq) {
      const ix = rows.map((_, i) => i);
      if (!gfActive(gf)) { hits = hitsAll = []; gfRefresh(ix.map(gInfo)); cnt.textContent = `Type to search all ${TOT.toLocaleString()} items, or open the gear filter to browse by class, slot or tier.`; out.innerHTML = ''; more.innerHTML = ''; return; }
      hitsAll = ix.filter(i => gInfo(i)).sort((a, b) => (gInfo(b).t ?? -1) - (gInfo(a).t ?? -1) || D.nameN[a].localeCompare(D.nameN[b]) || a - b);
      return draw();
    }
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
    hitsAll = [...M.entries()].sort((a, b) => b[1] - a[1] || N[a[0]].localeCompare(N[b[0]]) || a[0] - b[0]).map(h => h[0]);
    draw();
  };
  const rowTags = r => { const f = r[3], t = [];
    if (f & F.override) t.push('Cosmetic override'); if (f & F.holiday) t.push('Holiday item'); if (f & F.disc) t.push('Discontinued'); else if (f & F.limited) t.push('Limited time');
    if (f & F.quest) t.push('Quest item'); if (f & F.removed) t.push('Removed from game'); return t.map(x => `<span class="tag">${x}</span>`).join(''); };
  const draw = () => {
    const infos = hitsAll.map(gInfo); gfRefresh(infos);
    hits = gfActive(gf) ? hitsAll.filter((_, k) => gfPass(infos[k], gf, GS)) : hitsAll;
    cnt.textContent = hits.length ? `${hits.length.toLocaleString()} of ${TOT.toLocaleString()} entries match${hits.length > lim ? ` · showing ${lim}` : ''}.` : `No entries match in all ${TOT.toLocaleString()} items.`;
    out.innerHTML = hits.slice(0, lim).map(i => {
      const r = rows[i], n = r[0], pg = r[4] || n;
      const pic = r[1] ? `<img class="ico" loading="lazy" decoding="async" src="${esc(r[1])}.webp" alt="">` : PH('✦');
      const price = priceTag(D, r[0], 'sell');
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
  return `<ul class="blist${withPics ? " pics" : ""}">${lst.map(r => `<li style="margin-left:${Math.max(0, r.d - 1) * 18}px">${withPics ? `<span class="item">${r.i ? `<img class="ico" loading="lazy" src="${esc(r.i)}" alt="">` : ''}<span>${esc(r.t)}</span></span>` : esc(r.t)}</li>`).join('')}</ul>`;
}
async function hansRow() {
  const h = await get('data/hans.json').catch(() => null);
  return h ? [h.title, 'tasks', '', 'Event', h.length, 0, h.icon, h.steps.length, 'wiki', 0, 'hans', 0] : null;
}
const qState = q => { const n = q[7], p = n ? qProg(q[10]).size : 0; return qIsDone(q[0]) || (n && p >= n) ? 'done' : p ? 'prog' : 'none'; };
const qStat = (q, f) => !f || (f === 'todo' ? qState(q) !== 'done' : qState(q) === f);
async function questsView(name) {
  let qs = await get('data/quests.json');
  const hr = await hansRow(); if (hr) qs = [hr, ...qs];
  if (name) return questDetail(name, qs);
  const st = sjson(sessionStorage, 'qf', {q: '', kind: '', mem: '', diff: '', st: ''});
  const diffs = [...new Set(qs.map(q => q[3]).filter(Boolean))].sort((a, b) => ['Novice', 'Intermediate', 'Experienced', 'Master', 'Grandmaster', 'Special'].indexOf(a) - ['Novice', 'Intermediate', 'Experienced', 'Master', 'Grandmaster', 'Special'].indexOf(b));
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  view.innerHTML = `<div class="panel"><h2>Quest helper</h2>${searchBox('q', 'Search quests…', st.q)}
    <div class="row" style="margin-top:8px">
      <select id="kind">${opt('', 'Quests & miniquests', st.kind)}${opt('quest', 'Quests', st.kind)}${opt('miniquest', 'Miniquests', st.kind)}${opt('tasks', 'Anniversary task list', st.kind)}</select>
      <select id="mem">${opt('', 'Free & members', st.mem)}${opt('No', 'Free-to-play', st.mem)}${opt('Yes', 'Members', st.mem)}</select>
      <select id="diff">${opt('', 'Any difficulty', st.diff)}${diffs.map(d => opt(d, d, st.diff)).join('')}</select>
      <select id="qst">${opt('', 'Any status', st.st)}${opt('todo', 'Not finished', st.st)}${opt('prog', 'In progress', st.st)}${opt('done', 'Finished', st.st)}</select>
      <span class="note" id="cnt"></span></div></div><div class="panel"><div class="hint" style="margin-bottom:6px">Green = complete, yellow = in progress, red = not started (tracked on this device).</div><div id="res" class="list" style="margin-top:0"></div></div>`;
  const draw = () => {
    const s = {q: $('#q').value, kind: $('#kind').value, mem: $('#mem').value, diff: $('#diff').value, st: $('#qst').value}; sessionStorage.qf = JSON.stringify(s);
    const nq = norm(s.q);
    let hits = qs.filter(q => (!s.kind || q[1] === s.kind) && (!s.mem || q[2] === s.mem) && (!s.diff || q[3] === s.diff) && qStat(q, s.st));
    hits = nq ? hits.map(q => [score(q[0], nq), q]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]).map(x => x[1]) : hits;
    $('#cnt').textContent = `${hits.length} of ${qs.length}`;
    $('#res').innerHTML = hits.map(q => {
      const done = qIsDone(q[0]), n = q[7], p = n ? qProg(q[10]).size : 0;
      const meta = q[9] ? '<span class="tag">page not downloaded yet</span>' : [q[3], q[4], q[2] === 'No' ? 'F2P' : q[2] === 'Yes' ? 'Members' : '', done ? '✓ done' : n ? `${Math.min(p, n)}/${n} steps` : ''].filter(Boolean).map(esc).join(' · ');
      const cls = done || (n && p >= n) ? 'qs-done' : p ? 'qs-prog' : 'qs-none';
      return `<a class="hit" href="#quests/${encodeURIComponent(q[0])}">${qIcon(q[6])}<span class="${cls}">${esc(q[0])}${q[1] === 'miniquest' ? ' <span class="tag">miniquest</span>' : ''}</span><span class="meta">${meta}</span></a>`;
    }).join('');
  };
  $('#q').oninput = draw; ['#kind', '#mem', '#diff', '#qst'].forEach(id => $(id).onchange = draw); draw(); $('#q').focus();
}
async function questDetail(name, qs) {
  const row = qs.find(q => q[0] === name);
  if (!row) { view.innerHTML = `<div class="panel">${esc(name)} is not in this offline copy yet. <a href="#quests">Back to quests</a></div>`; return; }
  const [q, travel, qn] = await Promise.all([get(row[10] === 'hans' ? 'data/hans.json' : `data/q/${row[10]}.json`), get('data/travel.json'), row[10] === 'hans' ? null : get(`data/qn/${row[10]}.json`).catch(() => null)]);
  const isH = row[10] === 'hans';
  const qnE = qn && qn.n && qn.n.length ? qn.n.map((e, i) => ({...e, num: i + 1})) : [];
  const qnPin = qnE.filter(e => (e.p || []).length).length;
  const qnHtml = qnE.length ? `<div class="panel qnp"><details id="qnd"><summary><h2>NPCs on the map</h2><span class="note">${qnE.length} NPC${qnE.length === 1 ? '' : 's'} · ${qnPin} with a wiki map pin</span></summary>
    <div class="row qnbar">${qnPin ? `<button class="btn mini" id="qnall">📍 Show all quest pins</button><a class="btn mini ghost" href="#map/qn/${row[10]}">Open in Map tab</a>` : ''}</div>
    <div id="qnbox" class="mapwrap" hidden></div>
    <ul class="qnl" id="qnl">${qnRows(qnE, row[10])}</ul>
    <div class="note">In walkthrough order. Pins are the coordinates written on each NPC's own RS3 wiki page; where the wiki has none, the NPC is listed without a pin.</div></details></div>` : '';
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
  ${sec('Start', start)}${qnHtml}${sec('Requirements', reqs)}
  ${sec('Items required', bulletList(q.items, true))}${sec('Recommended', bulletList(q.recommended, true))}${sec('Enemies to defeat', bulletList(q.kills))}
  ${q.steps && q.steps.length ? `<div class="panel"><h2>Walkthrough</h2>
    <div class="row"><div class="prog"><div id="bar"></div></div><span class="note" id="pct"></span>
    <label class="note"><input type="checkbox" id="hide"> Hide finished steps</label><button class="btn ghost" id="reset">Reset progress</button></div>
    <div class="note" style="margin:6px 0">${isH ? "Built only from the wiki: the 25th Anniversary task list page (task text, items, requirements) and the wiki's Hans transcript for the dialogue menus where you must pick a specific option (marked \u201cChoose option\u201d). The wiki has no separate walkthrough page for these tasks, so each one is: do what the task says, then the pop-up confirms it. Pictures are the wiki's own NPC and place pictures. Ticks are saved on this device only." : q.steps_source === 'quick guide' ? 'From the wiki quick guide.' : 'From the full wiki guide (no quick guide in this copy).'} Pictures are the wiki's own: images from the guide shown at the step they belong to, or the wiki picture of the place/NPC that step links to. Tap one to enlarge. Ticks are saved on this device only.</div>
    <div id="steps"></div></div>` : ''}
  ${(q.guide_pics || []).length ? `<div class="panel"><h2>More pictures from the wiki guide</h2><div class="note">These appear in the full wiki guide but don't clearly match one quick-guide step, so they are listed under the wiki's own section headings.</div>${q.guide_pics.map(g => `<h3 class="stepsec">${esc(g.sec)}</h3>${gallery(g.p)}`).join('')}</div>` : ''}
  ${sec('Rewards', bulletList(q.rewards) + (isH ? '<div class="note" style="margin-top:6px">The wiki lists no separate reward per task: the reward comes after all tasks are done and you speak to Hans again.</div>' : ''))}
  ${isH ? `<div class="panel"><h2>Wiki pages</h2><ul class="blist">${q.wiki_links.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join('')}</ul></div>` : ''}`;
  if (qnE.length && $('#qnall')) {
    let ctl = null;
    const mark = n => document.querySelectorAll('#qnl .qnr').forEach(li => li.classList.toggle('sel', +li.dataset.n === n));
    $('#qnall').onclick = async () => {
      const box = $('#qnbox');
      if (box.dataset.on) { box.hidden = !box.hidden; return; }
      box.dataset.on = '1'; box.hidden = false; box.innerHTML = '<div class="note">Loading the map…</div>';
      try { ctl = await qnMap(box, qnE, {height: 250, onSel: mark}); } catch (err) { box.innerHTML = `<div class="note">Could not load the map: ${esc(err.message)}</div>`; }
    };
  }
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
/* ---------- Easter Eggs tab (route #secrets kept for old links): easter eggs & hidden interactions the RS3 wiki documents as still possible (data/secrets.json) ---------- */
const SEC = {kind: '', rw: false, quick: false};
const SEC_KL = {item: 'Item', title: 'Title', pet: 'Pet', cosmetic: 'Cosmetic', emote: 'Emote', none: 'Just for fun'};
function secReward(w) {
  const src = w.ic || w.ip;
  const img = src ? `<img class="ico" loading="lazy" src="${esc(src)}" alt="">` : PH('✦', 28);
  const nm = w.i ? `<a href="#items/${encodeURIComponent(w.i)}">${esc(w.n)}</a>` : `<span>${esc(w.n)}</span>`;
  const price = w.k !== 'item' || !w.i ? '' : w.tr === 2 ? '<span class="untr">Untradeable</span>' : livePriceTag(w.i, 'sell', w.ge, '21 Oct 2026 wiki copy');
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
  view.innerHTML = `${subnav('secrets')}<div class="panel"><h2>Easter Eggs &amp; hidden secrets</h2>
    <div class="note">${cur.length} hidden interactions the RS3 wiki documents as still possible in the game today, ${cur.filter(r => r.rw.length).length} of them give a reward. Open one for requirements and numbered steps. Pins sit only where the wiki gives coordinates.</div>
    ${searchBox('sq', 'Search easter eggs, rewards, quests… e.g. title, pet, candle', sessionStorage.sq || '')}
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
      ${A.length ? `<div class="secgrid">${A.map(secCard).join('')}</div>` : '<div class="obempty"><div><b>No easter egg matches.</b><div class="note">Try another word or clear a filter.</div></div></div>'}
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
const TR_TAG = {afk: 'AFK', cheap: 'Cheap (wiki snapshot)', profit: 'Profit (wiki snapshot)'};
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
  const items = its.map(([n, ge, ic]) => `<a class="trit" href="#items/${encodeURIComponent(n)}">${ic ? `<img class="ico" loading="lazy" src="${esc(ic)}" alt="">` : PH('✦', 28)}<span>${esc(n)}</span>${livePriceTag(n, 'buy', ge, '21 Oct 2026 wiki copy')}</a>`).join('');
  const peek = its.slice(0, 5).map(([n, , ic]) => ic ? `<img class="ico" loading="lazy" src="${esc(ic)}" alt="">` : '').join('');
  const cn = (c.cn || []).length ? `<ul class="trcn">${c.cn.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '';
  const cost1 = c.m && (c.cn || []).length ? `<span class="trcs">Wiki snapshot cost: ${esc(c.cn[0].length > 90 ? c.cn[0].slice(0, 88) + '…' : c.cn[0])}</span>` : '';
  const words = c.h.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const stepsOpen = !ph && words < 220 ? ' open' : (ph && words < 45 ? ' open' : '');
  const rangeTxt = trRange(c);
  return `<details class="sec tcard${fit ? ' fit' : ''}"><summary><div class="secpicw">${pic}</div>
    <div class="sectxt"><b class="sect">${esc(c.t)}</b><span class="secd">${[rangeTxt, rate].filter(Boolean).join(' · ')}</span>${cost1}<span class="sectags">${tags}</span></div></summary>
    <div class="secbody">
      <div class="trmeta">${tags}</div>
      ${c.m ? `<div class="wsec"><h4>Requirements</h4>${rq ? `<div class="secreq">${rq}</div>` : '<div class="note">The wiki lists no skill or quest requirement for this method.</div>'}</div>` : ''}
      ${items ? `<details class="trsub"${!ph && its.length <= 8 ? ' open' : ''}><summary>Items &amp; prices <span class="cnt">${its.length}</span><span class="trpeek">${peek}</span></summary><div class="tritems">${items}</div></details>` : ''}
      ${c.m && (cn || c.xph) ? `<div class="wsec"><h4>Wiki snapshot costs &amp; experience</h4><div class="note">No structured recipe quantities/yields here: total cost and profit cannot be safely repriced. Check the live item acquisition prices; wiki cost prose and XP are unchanged.</div>${c.xph ? `<div class="note">Experience stated on the wiki: ${c.xph[1] > c.xph[0] ? c.xph[0].toLocaleString() + ' to ' + c.xph[1].toLocaleString() : c.xph[0].toLocaleString()} xp per hour.</div>` : ''}${cn}</div>` : ''}
      <details class="trsub trsteps"${stepsOpen}><summary>${c.m ? 'Instructions from the wiki' : 'Wiki text'} <span class="cnt">${words} words</span></summary><div class="trbody">${c.h}</div></details>
      <div class="note trsrcl"><a href="${esc(trWiki(g, c))}" target="_blank" rel="noopener noreferrer">${esc(g.t)} on the RS3 wiki ↗</a>${c.pt ? ' · part of this section is a live wiki table, not shown here' : ''}</div></div></details>`;
}
function trFilters(id) {
  const on = (k, v) => ' class="on"';
  return `<div class="chips" id="${id}m"><button data-v=""${!TR.mem ? ' class="on"' : ''}>All</button><button data-v="f2p"${TR.mem === 'f2p' ? ' class="on"' : ''}>Free-to-play</button><button data-v="p2p"${TR.mem === 'p2p' ? ' class="on"' : ''}>Members</button></div>
    <div class="chips" id="${id}f"><button data-v="cheap"${TR.cheap ? ' class="on"' : ''}>Cheap (wiki snapshot)</button><button data-v="profit"${TR.profit ? ' class="on"' : ''}>Profitable (wiki snapshot)</button><button data-v="afk"${TR.afk ? ' class="on"' : ''}>AFK</button><button data-v="fit"${TR.fit ? ' class="on"' : ''}>Fits my level</button></div>
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
      <div class="note">Your level on this device: <b>${lvl}</b>${stats[sk.n] ? '' : ' (not saved yet)'} · <a href="#char">edit my levels</a></div></div></div>
    <div class="note">From <span id="trsrc"></span>.</div>${gtab}
    <details class="trhow"><summary>How to read these sections</summary><div class="note">Tap a section to open it. Items are the ones the wiki links in that section; prices are Grand Exchange prices in this app, and tapping an item shows where to get it. ✓/✗ compares a requirement with the levels saved on this device. Costs and xp/hr are snapshots quoted from the wiki text; no verified recipe quantities are available to recompute training totals. Item prices use fresh observed Buy quotes when available; rates vary with boosts and play style.</div></details></div>
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
/* ================= Money tab: every RS3 wiki "Money making guide" ================= */
const MM = {q: '', c: '', sk: '', mem: '', fit: '', sort: 'profit', minp: 0, afk: false, cmb: false, ob: false, norec: false, n: 20, idx: null, shards: {}};
const MM_CATS = [['', 'All'], ['pvm', 'PvM & bossing'], ['slay', 'Slayer'], ['mini', 'Minigames'], ['gath', 'Gathering'], ['proc', 'Processing & crafting'], ['coll', 'Collecting'], ['merch', 'Merching'], ['rec', 'Recurring'], ['oth', 'Other']];
const MM_SK = ['Attack','Defence','Strength','Constitution','Ranged','Prayer','Magic','Cooking','Woodcutting','Fletching','Fishing','Firemaking','Crafting','Smithing','Mining','Herblore','Agility','Thieving','Slayer','Farming','Runecrafting','Hunter','Construction','Summoning','Dungeoneering','Divination','Invention','Archaeology','Necromancy'];
const MM_MIN = [0, 50e3, 100e3, 250e3, 500e3, 1e6, 2e6, 5e6];
const MM_TAG = {afk: 'AFK / low effort', cmb: 'Needs combat', slay: 'Slayer', mini: 'Minigame', merch: 'Merching', rec: 'Recurring', ob: 'Wiki snapshot non-profitable / obsolete', pp: 'Partly parsed', nd: 'No steps on wiki', free: 'Free-form page'};
const MM_SUBS = {high: 'High-level combat', mid: 'Mid-level combat', low: 'Low-level combat', boss: 'Boss'};
const MM_INT = ['', 'Low intensity', 'Moderate intensity', 'High intensity'];
const mmCats = r => { const o = []; if (r.g === 'pvm') o.push('pvm'); else if (r.g !== 'oth' || true) o.push(r.g); if (r.tg.includes('slay')) o.push('slay'); if (r.tg.includes('mini')) o.push('mini'); if (r.tg.includes('merch')) o.push('merch'); return o; };
const mmWiki = pg => 'https://runescape.wiki/w/Money_making_guide/' + encodeURIComponent(String(pg).replace(/ /g, '_')).replace(/%2C/g, ',');
const mmGp = n => n == null ? '' : (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString() + ' gp';
function mmFit(r, S) {
  if (!STATS_SAVED || !S) return null;
  let gap = 0; for (const [s, l] of r.rl || []) { const h = +S[s] || 1; if (h < l) gap = Math.max(gap, l - h); }
  const q = (r.qq || []).some(x => !qIsDone(x));
  return !gap && !q ? 'ok' : gap <= 5 && !q ? 'close' : 'no';
}
const mmLvl = r => Math.max(0, ...(r.rl || []).map(x => x[1]));
function mmReqLine(r, S) {
  const parts = (r.rl || []).slice(0, 3).map(([s, l]) => { const h = STATS_SAVED && S ? (+S[s] || 1) : null; return `${h == null ? '' : h >= l ? '✓ ' : '✗ '}${l} ${s}`; });
  const more = (r.rl || []).length - parts.length; if (more > 0) parts.push('+' + more);
  if ((r.qq || []).length) parts.push(r.qq.length + (r.qq.length > 1 ? ' quests' : ' quest'));
  return parts.length ? 'Needs ' + parts.join(', ') : 'No skill or quest requirement stated';
}
function mmLive(r) { return LIVE.book.estimate(MM.models && MM.models[r.id]); }
async function mmLoadModels(X) {
  if (MM.models) return;
  const models = {};
  // Local shards only; remote prices use one shared bulk /latest request.
  await Promise.all([...new Set(X.rows.map(r => r.sh))].map(async i => {
    try { const sh = await mmShard(i); for (const [id, hit] of Object.entries(sh)) models[id] = hit[0]; } catch (_) { /* Missing shard is incomplete, never zero. */ }
  }));
  MM.models = models;
}

function mmOk(r, nq, S) {
  if (MM.c && !mmCats(r).includes(MM.c)) return false;
  if (MM.mem === 'f2p' && r.mem) return false;
  if (MM.mem === 'p2p' && !r.mem) return false;
  const live = mmLive(r);
  if (!MM.ob && !nq && (live.complete ? live.profit <= 0 : r.tg.includes('ob'))) return false;
  if (MM.afk && !r.tg.includes('afk')) return false;
  if (MM.cmb && !r.tg.includes('cmb')) return false;
  if (MM.norec && r.at) return false;
  if (MM.sk && !(r.xs || []).includes(MM.sk) && !(r.rl || []).some(x => x[0] === MM.sk)) return false;
  if (MM.minp && !(live.complete && live.profit >= MM.minp)) return false;
  if (MM.fit) { const f = mmFit(r, S); if (MM.fit === 'ok' && f !== 'ok') return false; if (MM.fit === 'close' && f !== 'ok' && f !== 'close') return false; if (MM.fit === 'no' && f !== 'no') return false; }
  if (nq) { const h = norm(r.t + ' ' + r.pg + ' ' + (r.xs || []).join(' ') + ' ' + (r.rl || []).map(x => x[0]).join(' ') + ' ' + (r.qq || []).join(' ') + ' ' + (r.io || []).join(' ') + ' ' + r.tg.map(t => MM_TAG[t] || '').join(' ')); if (!nq.split(' ').every(t => h.includes(t))) return false; }
  return true;
}
function mmSort(rows) {
  const k = MM.sort;
  rows.sort((a, b) => {
    if (k === 'name') return a.t.localeCompare(b.t);
    if (k === 'level') return mmLvl(a) - mmLvl(b) || a.t.localeCompare(b.t);
    return priceCompare(mmLive(a).profit, mmLive(b).profit) || a.t.localeCompare(b.t);
  });
  return rows;
}
function mmProfitTxt(r) {
  const e = mmLive(r);
  const live = e.complete ? `<span class="mmp${e.profit < 0 ? ' mmneg' : ''}">${mmGp(e.profit)}<i>/hr${r.at ? ' of activity' : ''} · live net estimate (est. 2% selling tax)</i></span>` : '<span class="mmnone">Live estimate incomplete / unavailable — not live-ranked</span>';
  const snap = r.pw == null ? '' : `<small class="price-age">Wiki guide snapshot ${esc(MM_GE)}: ${mmGp(r.pw)}/hr${r.at ? ' of activity' : ''}</small>`;
  return live + snap;
}

function mmCard(r, S, open) {
  const f = mmFit(r, S);
  const kind = r.mem ? 'Members' : 'Free-to-play';
  const cat = (MM_CATS.find(c => c[0] === r.g) || [0, 'Other'])[1];
  const tags = [kind, cat].concat(r.tg.filter(t => t !== 'rec' || r.g !== 'rec').map(t => MM_TAG[t]).filter(Boolean)).map(t => `<span class="tag${/Not profitable|Partly|No steps/.test(t) ? ' warn' : ''}">${esc(t)}</span>`).join('')
    + (f === 'ok' ? '<span class="tag fit">Fits your levels</span>' : f === 'close' ? '<span class="tag warn">Close to your levels</span>' : '');
  const pic = r.th ? `<img class="secpic" loading="lazy" src="${esc(r.th)}" alt="">` : PH('◈', 40);
  return `<details class="sec tcard mmcard${f === 'ok' ? ' fit' : ''}" data-id="${esc(r.id)}"${open ? ' open' : ''}><summary><div class="secpicw">${pic}</div>
    <div class="sectxt"><b class="sect">${esc(r.t)}</b><span class="secd">${mmProfitTxt(r)}</span><span class="mmreq">${esc(mmReqLine(r, S))}</span><span class="sectags">${tags}</span></div></summary>
    <div class="secbody"><div class="trmeta">${tags}</div><div class="mmdet"><div class="note">Loading…</div></div></div></details>`;
}
async function mmShard(i) {
  if (!MM.shards[i]) MM.shards[i] = get(`data/mm/${i}.json`).then(d => { const o = {}; for (const p of d.p) for (const m of p.m) o[m.id] = [m, p.pre]; return o; });
  return MM.shards[i];
}
/* Verified quantities: Buy/high supplies, Sell/low outputs; selling tax once per unit. */
function mmLinePrice(D, l, side = 'sell') {
  if (l.n === 'Coins' || l.n === 'coins') return [1, false];
  if (l.v != null || l.cv) return [null, true];
  const p = priceOf(D, l.n, side); return [p, p == null];
}
function mmEstimate(D, m) {
  const e = LIVE.book.estimate(m);
  return {...e, h: e.profit, out: e.revenue, inn: e.cost, miss: e.missing};
}
function mmEstimateHTML(m) {
  const e = LIVE.book.estimate(m);
  if (!e.complete) return `<h5>Live estimate unavailable</h5><p class="note">Live estimate incomplete / unavailable. No total or profit is fabricated. Missing/stale/unverified: ${esc(e.missing.slice(0, 8).join(', '))}${e.missing.length > 8 ? '…' : ''}. Excluded from live-profit filters.</p>`;
  const row = (label, value, cls = '') => `<div class="estimate-row ${cls}"><dt>${label}</dt><dd>${mmGp(value)}/hr</dd></div>`;
  return `<h5>Live estimate</h5><dl class="estimate-metrics">${row('Buy supplies', e.cost)}${row('Sell gross', e.revenue)}${row('Est. 2% tax', e.tax)}${row('Sell net', e.netRevenue)}${row('Profit gross', e.grossProfit)}${row('Profit net', e.profit, 'estimate-profit')}</dl><p class="price-age estimate-source">Source fetched ${esc(priceTime(LIVE.book.fetchedAt / 1000))}; individual trade times below.</p><p class="note">${m.at ? 'Per hour of activity, not passive clock-hour income. ' : ''}Buy/high costs; Sell/low returns. Tax rounded down per sold item; bonds exempt. Wiki quantities/rates are assumptions. Degradation and unlisted costs excluded.</p>`;
}

function mmReqChips(m, S) {
  const have = STATS_SAVED && S ? S : null;
  const chip = (e) => {
    const rec = e.i === 'r' ? ' <i>(recommended)</i>' : e.i === 'o' ? ' <i>(optional)</i>' : '';
    const nt = e.nt ? ` <i>${esc(e.nt)}</i>` : '';
    if (e.k === 's') {
      const h = have ? (+have[e.s] || 1) : null;
      const ok = h != null && MM_SK.includes(e.s) ? h >= e.l : null;
      return `<span class="tag mmrq ${ok == null || e.alt ? '' : ok ? 'ok' : 'no'}">${ok == null || e.alt ? '' : ok ? '✓ ' : '✗ '}${e.l} ${esc(e.s)}${rec}${nt}</span>`;
    }
    if (e.k === 'q') { const dn = qIsDone(e.q); return `<a class="tag mmrq ${e.alt ? '' : dn ? 'ok' : (have ? 'no' : '')}" href="#quests/${encodeURIComponent(e.q)}">${e.alt ? '' : dn ? '✓ ' : have ? '✗ ' : ''}Quest: ${esc(e.q)}${rec}${nt}</a>`; }
    if (e.k === 'i') {
      const ic = e.ic ? `<img class="ico" loading="lazy" src="${esc(e.ic)}" alt="">` : '';
      const lab = `${e.c > 1 ? e.c + ' × ' : ''}${esc(e.t || e.n)}${rec}${nt}`;
      return e.a ? `<a class="tag mmrq mmit" href="#items/${encodeURIComponent(e.n)}">${ic}${lab}</a>` : `<a class="tag mmrq mmit" href="${esc(e.u || WIKI(e.n))}" target="_blank" rel="noopener noreferrer">${lab} ↗</a>`;
    }
    return `<span class="tag mmrq mmoth">${e.h}${rec}</span>`;
  };
  return m.rq.map((e, i) => { const o = e.alt && m.rq[i - 1] && m.rq[i - 1].alt && !(e.k === 'o' && /^or /.test(e.h || '')) ? '<span class="mmor">or</span>' : ''; return o + chip(e); }).join('');
}
function mmLines(D, lines, title, noteExtra, side = 'sell') {
  if (!lines.length) return '';
  const noteId = 'mm-quantity-' + (++responsiveTableId);
  const rows = lines.map(l => {
    const [p, mi] = mmLinePrice(D, l, side);
    const ic = l.ic ? `<img class="ico" loading="lazy" src="${esc(l.ic)}" alt="">` : '';
    const nm = l.a ? `<a class="ti" href="#items/${encodeURIComponent(l.n)}">${esc(l.n)}</a>` : esc(l.n);
    const q = l.q >= 100 ? Math.round(l.q).toLocaleString() : +(+l.q).toFixed(2);
    const price = l.n === 'Coins' || l.n === 'coins' ? '1 gp (coin denomination)' : l.v != null ? `${Math.round(l.v).toLocaleString()} <i>wiki fixed-value snapshot; not live</i>` : l.cv ? '<i>Unverified wiki formula — not repriced</i>' : livePriceTag(l.n, side);
    return `<tr><td>${ic}${nm}${l.nt ? ` <i>${esc(l.nt)}</i>` : ''}${l.cv ? ' <i title="Unverified wiki calculation; excluded from live estimates.">(wiki calc)</i>' : ''}</td><td class="r">${q}</td><td class="r">${price}</td></tr>`;
  }).join('');
  return `<details class="trsub mmln"${lines.length <= 6 ? ' open' : ''}><summary>${title} <span class="cnt">${lines.length}</span></summary><p class="note mm-quantity-note" id="${noteId}">Wiki units per hour; per run for recurring methods.</p><div class="tscroll"><table class="tt"><thead><tr><th>Item</th><th scope="col" aria-describedby="${noteId}">Quantity</th><th scope="col">Price each</th></tr></thead><tbody>${rows}</tbody></table></div>${noteExtra || ''}</details>`;
}
async function mmFill(card, r, S) {
  const box = card.querySelector('.mmdet'); if (box.dataset.done) return; box.dataset.done = '1';
  const [sh, D] = await Promise.all([mmShard(r.sh), itemData()]);
  const hit = sh[r.id]; if (!hit) { box.innerHTML = '<div class="note">This method is missing from the data bundle.</div>'; return; }
  const [m, lead] = hit;
  const perk = m.pk != null;
  const dateNote = m.ts ? `guide last edited ${m.ts}` : '';
  /* profit blocks: wiki figure and app estimate stay separate */
  let wiki = '';
  if (m.pw == null) wiki = `<div class="mmfig"><b>Profit per hour <i>(wiki guide snapshot ${esc(MM_GE)})</i></b><span class="mmnone">Not stated — this guide's profit depends on a live wiki calculation that cannot be reproduced offline.</span></div>`;
  else if (m.run != null) wiki = `<div class="mmfig"><b>Profit per hour <i>(wiki guide snapshot ${esc(MM_GE)})</i></b><span><b class="gp">${mmGp(m.pw)}</b></span></div><div class="mmfig"><b>Each time you do it</b><span>${mmGp(m.run)} every ${esc(m.rt || '?')}, ${m.at} min of activity</span></div>`;
  else wiki = `<div class="mmfig"><b>Profit per hour <i>(wiki guide snapshot ${esc(MM_GE)})</i></b><span><b class="gp">${mmGp(m.pw)}</b></span></div>${perk ? `<div class="mmfig"><b>Profit per kill</b><span>${mmGp(m.pk)}${m.kph ? ` · ${m.kph} ${esc(m.kn || 'kills')}/hr` : ''}</span></div>` : ''}`;
  const estBlk = `<section class="mmest" data-mm-estimate="${esc(m.id)}" aria-label="Live price estimate">${mmEstimateHTML(m)}</section>`;
  const wnote = `<div class="note">Wiki figures and prose are guide snapshots (${esc(MM_GE)}${dateNote ? ', ' + esc(dateNote) : ''}), not live quotes. Net live estimates require complete structured quantities/rates, observed Buy for supplies and Sell for revenue. Missing/stale quotes, unresolved formulas/fixed values and partly parsed methods are not live-ranked. Estimated selling tax is deducted once per output item; unlisted costs remain excluded, not assumed zero.</div>`;
  /* requirements */
  const ph = trPhone();
  const reqs = m.rq.length ? `<div class="secreq mmreqs">${mmReqChips(m, S)}</div>${STATS_SAVED ? '' : '<div class="note">Save your levels (<a href="#char">Character tab</a>) to see ✓/✗ against them.</div>'}` : '<div class="note">The wiki lists no requirements for this method.</div>';
  /* xp */
  const xp = m.xp.length ? `<div class="kv">${m.xp.map(x => `<b><a href="#train/${encodeURIComponent(x.s)}">${esc(x.s)}</a></b><span>${x.h.toLocaleString()} xp/hr${x.pk ? ` <i>(${x.x} per kill)</i>` : ''}${x.nt ? ` <i>${esc(x.nt)}</i>` : ''}</span>`).join('')}</div>` : '';
  const items = (m.it || []).map(([n, ic]) => `<a class="trit" href="#items/${encodeURIComponent(n)}">${ic ? `<img class="ico" loading="lazy" src="${esc(ic)}" alt="">` : PH('✦', 28)}<span>${esc(n)}</span>${priceTag(D, n)}</a>`).join('');
  const pics = (m.pic || []);
  const hero = pics[0] ? `<img class="mmhero" loading="lazy" src="${esc(pics[0])}" alt="">` : '';
  const more = pics.length > 1 ? `<details class="trsub"><summary>More pictures <span class="cnt">${pics.length - 1}</span></summary><div class="mmpics">${pics.slice(1).map(p => `<img loading="lazy" src="${esc(p)}" alt="">`).join('')}</div></details>` : '';
  const rel = [];
  for (const q of m.qs || []) rel.push(`<a class="tag" href="#quests/${encodeURIComponent(q)}">Quest: ${esc(q)}</a>`);
  for (const t of m.ms || []) rel.push(`<a class="tag" href="#drops/${encodeURIComponent(t)}">Monster: ${esc(t)}</a>`);
  for (const s of new Set([...(m.xs || []), ...m.rq.filter(e => e.k === 's' && MM_SK.includes(e.s)).map(e => e.s)])) if (MM_SK.includes(s)) rel.push(`<a class="tag" href="#train/${encodeURIComponent(s)}">Training: ${esc(s)}</a>`);
  const wl = (m.wl || []).filter(n => !/^(Category|Map:)/.test(n) || true).slice(0, 8).map(n => `<a class="tag" href="${WIKI(n)}" target="_blank" rel="noopener noreferrer">${esc(n)} ↗</a>`).join('');
  const steps = [lead && lead.trim() ? `<details class="trsub"${ph ? '' : ' open'}><summary>Overview from the wiki</summary><div class="trbody">${lead}</div></details>` : '',
    m.pre ? `<div class="trbody">${m.pre}</div>` : '',
    m.h ? `<details class="trsub trsteps" open><summary>Step by step from the wiki</summary><div class="trbody">${m.h}${m.post ? m.post : ''}${m.nt ? `<ol class="mmnotes">${m.nt.map(n => `<li>${n}</li>`).join('')}</ol>` : ''}</div></details>` : (m.post ? `<div class="trbody">${m.post}</div>` : '<div class="note">The wiki has no step-by-step text for this method.</div>')].join('');
  const tg = m.tg.includes('pp') ? '<div class="note"><span class="tag warn">Partly parsed</span> A few wiki templates in this guide are interactive and are not shown; use the source link for the full page.</div>' : '';
  const ob = m.ob ? `<div class="note"><b>Other benefits:</b> ${m.ob}</div>` : '';
  box.innerHTML = `${hero}
    <div class="wsec"><h4>Profit</h4>${wiki}${estBlk}${wnote}</div>
    <div class="wsec"><h4>Requirements</h4>${reqs}${m.in ? '' : ''}</div>
    ${m.iy ? `<div class="note">${MM_INT[m.iy]} (wiki)${m.sub ? ' · ' + MM_SUBS[m.sub] : ''}${m.mem ? '' : ' · free-to-play'}</div>` : ''}
    ${xp ? `<div class="wsec"><h4>Experience</h4>${xp}</div>` : ''}${ob}
    ${mmLines(D, m.inp, 'Supplies used (Buy)', '', 'buy')}${mmLines(D, m.out, 'What you get (Sell)', '', 'sell')}
    ${items ? `<details class="trsub"><summary>Items mentioned <span class="cnt">${(m.it || []).length}</span></summary><div class="tritems">${items}</div></details>` : ''}
    ${steps}${more}${tg}
    ${rel.length ? `<details class="trsub"><summary>Related in this app <span class="cnt">${rel.length}</span></summary><div class="chips mmrel">${rel.join('')}</div></details>` : ''}
    ${wl ? `<details class="trsub"><summary>Wiki pages mentioned <span class="cnt">${(m.wl || []).length}</span></summary><div class="chips mmrel">${wl}</div></details>` : ''}
    <div class="mmsrc"><a class="btn mmsrcb" href="${esc(mmWiki(r.pg))}" target="_blank" rel="noopener noreferrer">Source: RS3 Wiki ↗</a><span class="note">${esc(m.pg || 'Money making guide/' + r.pg)}${m.ts ? ' · last edited ' + esc(m.ts) : ''} · text and numbers CC BY-NC-SA 3.0, from the RS3 Wiki</span> <a class="note" href="#money/${encodeURIComponent(r.id)}">Link to this method</a></div>`;
}
let MM_GE = '';
function mmBindCards(root, rows, S) {
  const by = {}; rows.forEach(r => by[r.id] = r);
  root.querySelectorAll('details.mmcard').forEach(c => { const go = () => { if (c.open) mmFill(c, by[c.dataset.id], S).catch(e => { c.querySelector('.mmdet').innerHTML = `<div class="note">Could not load: ${esc(e.message)}</div>`; delete c.querySelector('.mmdet').dataset.done; }); }; c.addEventListener('toggle', go); if (c.open) go(); });
}
async function moneyView(arg) {
  if (!MM.idx) { const d = await get('data/money.json'); MM.idx = d; MM_GE = Number.isNaN(Date.parse(d.ge_date)) ? d.ge_date : priceTime(Date.parse(d.ge_date) / 1000); }
  const X = MM.idx, S = loadStats() || {};
  await mmLoadModels(X);
  if (arg) {
    const r = X.rows.find(x => x.id === arg);
    if (!r) { view.innerHTML = `<div class="panel"><a class="btn mini ghost" href="#money">← Money</a><div class="obempty"><div><b>That money-making method is not in the guide list.</b></div></div></div>`; return; }
    view.innerHTML = `<div class="trbar"><a class="btn mini ghost" href="#money">← Money</a><b class="trbn">Money</b><span class="mmspc"></span><button type="button" class="btn mini ghost" id="trtop">↑ Top</button></div>
      <div class="panel trpanel">${mmCard(r, S, true)}</div><button type="button" class="trtopb" id="trtopb" aria-label="Back to top">↑</button>`;
    mmBindCards(view, [r], S); $('#trtop').onclick = $('#trtopb').onclick = () => window.scrollTo(0, 0); return;
  }
  const st = X.stats, skills = [...new Set(X.rows.flatMap(r => [...(r.xs || []), ...(r.rl || []).map(x => x[0])]))].filter(s => MM_SK.includes(s)).sort();
  const cnt = {}; for (const c of MM_CATS) cnt[c[0]] = c[0] ? X.rows.filter(r => !r.tg.includes('ob') && mmCats(r).includes(c[0])).length : X.rows.filter(r => !r.tg.includes('ob')).length;
  view.innerHTML = `<div class="trbar" id="mmbar"><b class="trbn">Money</b><select id="mmcatj" aria-label="Category">${MM_CATS.map(c => `<option value="${c[0]}"${MM.c === c[0] ? ' selected' : ''}>${esc(c[1])} (${cnt[c[0]]})</option>`).join('')}</select><button type="button" class="btn mini ghost" id="trtop" aria-label="Back to top">↑ Top</button></div>
    <div class="panel"><h2>Money making</h2>
    <div class="note">Every money-making guide on the RS3 wiki: ${st.methods.toLocaleString()} methods from ${st.pages} guide pages. Default sorting and minimum profit use complete fresh net live-price estimates only (Buy supplies, Sell outputs; estimated 2% selling tax deducted). Unverified/stale methods rank last and fail live-profit filters. Wiki figures (${esc(X.ge_date)}) remain guide snapshots; not every method can be recomputed.</div>
    ${searchBox('mmq', 'Search methods, e.g. dragons, herbs, AFK', MM.q)}
    <div class="chips" id="mmc">${MM_CATS.map(c => `<button data-v="${c[0]}"${MM.c === c[0] ? ' class="on"' : ''}>${esc(c[1])}<span class="cnt">${cnt[c[0]]}</span></button>`).join('')}</div>
    <div class="mmsel"><label>Skill<select id="mmsk"><option value="">Any skill</option>${skills.map(s => `<option${MM.sk === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label>Access<select id="mmmem"><option value="">F2P &amp; members</option><option value="f2p"${MM.mem === 'f2p' ? ' selected' : ''}>Free-to-play only</option><option value="p2p"${MM.mem === 'p2p' ? ' selected' : ''}>Members only</option></select></label>
      <label>My levels<select id="mmfit"><option value="">Any</option><option value="ok"${MM.fit === 'ok' ? ' selected' : ''}>Fits my levels</option><option value="close"${MM.fit === 'close' ? ' selected' : ''}>Fits or close (within 5)</option><option value="no"${MM.fit === 'no' ? ' selected' : ''}>Can't do yet</option></select></label>
      <label>Sort<select id="mmsort"><option value="profit">Net profit/hr (fresh live estimate)</option><option value="level"${MM.sort === 'level' ? ' selected' : ''}>Level needed</option><option value="name"${MM.sort === 'name' ? ' selected' : ''}>Name</option></select></label></div>
    <div class="mmrng"><label for="mmmin">Min net profit/hr (fresh live): <b id="mmminv">${MM.minp ? mmGp(MM.minp) : 'any'}</b></label><input id="mmmin" type="range" min="0" max="${MM_MIN.length - 1}" step="1" value="${Math.max(0, MM_MIN.indexOf(MM.minp))}"></div>
    <div class="chips" id="mmf"><button data-v="afk"${MM.afk ? ' class="on"' : ''}>AFK / low effort</button><button data-v="cmb"${MM.cmb ? ' class="on"' : ''}>Needs combat</button><button data-v="norec"${MM.norec ? ' class="on"' : ''}>Hide timed recurring</button><button data-v="ob"${MM.ob ? ' class="on"' : ''}>Show non-positive / wiki-obsolete methods</button></div>
    ${STATS_SAVED ? '' : '<div class="note">Tip: save your levels (<a href="#char">Character tab</a>) to use “Fits my levels” and to see ✓/✗ on requirements. They stay on this device.</div>'}
    <div id="mmres"></div></div>
    <div class="panel"><h3>Sources</h3><div class="note">All text, numbers and pictures come from these RS3 wiki pages (CC BY-NC-SA 3.0, <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener noreferrer">licence</a>). Guide text and pictures are unchanged; this app separately calculates labeled net live-price estimates where supported. Each method has its own “Source: RS3 Wiki” link.</div>
      <details class="thv"><summary>${st.pages} guide pages + ${st.list_pages} index pages</summary><ul class="trsrc">${X.src.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t.replace('Money making guide/', ''))} ↗</a></li>`).join('')}<li><a href="${WIKI('Money making guide')}" target="_blank" rel="noopener noreferrer">Money making guide (index) ↗</a></li><li><a href="${WIKI('Money making')}" target="_blank" rel="noopener noreferrer">Money making ↗</a></li></ul></details></div>
    <button type="button" class="trtopb" id="trtopb" aria-label="Back to top">↑</button>`;
  const out = $('#mmres'), q = $('#mmq'); let tmr = null;
  const draw = (keep) => {
    if (!keep) MM.n = 20;
    MM.q = q.value; const nq = norm(q.value);
    const rows = mmSort(X.rows.filter(r => mmOk(r, nq, S)));
    const show = rows.slice(0, MM.n);
    const hidden = X.rows.filter(r => r.tg.includes('ob')).length;
    out.innerHTML = `<div class="note trcount">${rows.length.toLocaleString()} of ${X.rows.length.toLocaleString()} methods${MM.ob || nq ? '' : ` (${hidden} not-profitable ones hidden)`}.${MM.sort === 'profit' ? ' Only complete fresh net estimates are live-ranked; incomplete methods are last.' : ''}</div>
      ${show.length ? `<div class="mmlist">${show.map(r => mmCard(r, S, false)).join('')}</div>` : '<div class="obempty"><div><b>No method matches.</b><div class="note">Clear a filter, lower the minimum profit, or change the search.</div></div></div>'}
      ${rows.length > show.length ? `<div class="mmmore"><button type="button" class="btn" id="mmmore">Show ${Math.min(20, rows.length - show.length)} more <span class="cnt">${rows.length - show.length} left</span></button></div>` : ''}`;
    mmBindCards(out, show, S);
    const mb = $('#mmmore'); if (mb) mb.onclick = () => { MM.n += 20; const y = window.scrollY; draw(true); window.scrollTo(0, y); };
    document.querySelectorAll('#mmc button').forEach(b => b.classList.toggle('on', b.dataset.v === MM.c));
    $('#mmcatj').value = MM.c;
  };
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(draw, 200); };
  document.querySelectorAll('#mmc button').forEach(b => b.onclick = () => { MM.c = b.dataset.v; draw(); });
  $('#mmcatj').onchange = e => { MM.c = e.target.value; draw(); };
  $('#mmsk').onchange = e => { MM.sk = e.target.value; draw(); };
  $('#mmmem').onchange = e => { MM.mem = e.target.value; draw(); };
  $('#mmfit').onchange = e => { MM.fit = e.target.value; draw(); };
  $('#mmsort').onchange = e => { MM.sort = e.target.value; draw(); };
  $('#mmmin').oninput = e => { MM.minp = MM_MIN[+e.target.value]; $('#mmminv').textContent = MM.minp ? mmGp(MM.minp) : 'any'; draw(); };
  document.querySelectorAll('#mmf button').forEach(b => b.onclick = () => { MM[b.dataset.v] = !MM[b.dataset.v]; b.classList.toggle('on', MM[b.dataset.v]); draw(); });
  $('#trtop').onclick = $('#trtopb').onclick = () => window.scrollTo(0, 0);
  watchPriceDraw(() => draw(true), out);
  draw();
}
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
    ${m.secrets ? `<b>Easter Eggs</b><span>${m.secrets.entries} easter eggs and hidden interactions still possible today · ${m.secrets.with_reward} give a reward · ${m.secrets.with_map} with map pins (${m.secrets.pins} pins) · ${m.secrets.past} ended ones listed separately</span>` : ''}
    ${m.training ? `<b>Training</b><span>${m.training.skills} skills · ${m.training.guides} wiki guides · ${m.training.cards.toLocaleString()} sections · ${m.training.cost.toLocaleString()} with costs or item prices · ${m.training.xph.toLocaleString()} with a stated xp/hour · ${m.training.maps} with map pins · ${m.training.pics.toLocaleString()} with a wiki picture</span>` : ''}
    ${m.money ? `<b>Money making</b><span>${m.money.methods.toLocaleString()} methods from ${m.money.pages.toLocaleString()} wiki guide pages (+ ${m.money.list_pages} list pages) · ${m.money.with_profit.toLocaleString()} with a wiki profit figure · ${m.money.with_req_parsed.toLocaleString()} with requirements parsed to levels · ${m.money.with_maps} with a map pin · ${m.money.with_pic.toLocaleString()} with a wiki picture · ${m.money.obsolete} marked not profitable on the wiki</span>` : ''}
    ${m.ge ? `<b>Offline GE guide snapshots</b><span>${m.ge.prices.toLocaleString()} items, as of ${esc(m.ge.date)} (${esc(m.ge.source)})</span>` : ''}</div>
    <div class="note" style="margin-top:8px">Rarity bands follow the wiki's drop tables (Module:DropsLine): Always, Common ≥ 1/16, Uncommon ≥ 1/64, Rare ≥ 1/256, Very rare below that.</div>
    <table style="margin-top:10px"><thead><tr><th>Tier</th><th>Clue types</th></tr></thead><tbody>${cc}</tbody></table></div>
  <div class="panel"><h2>Known gaps</h2><ul>
    ${m.money ? `<li>Money making: every guide page in Category:Money making guides is included, built only from the wiki. Profits shown “per the wiki” use the wiki's own formula on its Grand Exchange data (${esc((m.ge && m.ge.date) || '')}); fresh net estimates and live ranking are available only for complete structured formulas, using observed instant-buy supply costs and instant-sell revenue, deducting estimated 2% per-item selling tax but excluding degradation and unlisted costs; stale/incomplete methods are not live-ranked. Training cost prose remains a snapshot without verified quantities/yields. ${m.money.partly} guides have free-form layouts and are tagged “Partly parsed”; ${m.money.unresolved_templates} wiki templates could not be expanded and are shown as plain text; ${m.money.ge_missing_methods} methods use items with no GE price here; ${m.money.profit_not_stated} methods state no profit. “Find on map” appears only where the wiki gives coordinates (${m.money.with_maps} methods). Recurring methods (timed) show the wiki's per-hour-of-activity figure.</li>` : ''}
    <li>Pictures come from the wiki pages themselves: ${(m.coverage.quest_pictures_total || 0).toLocaleString()} quest pictures (steps, start NPCs and places) and location maps, entrances and teleports for monsters. A step the wiki shows no picture for gets the place or NPC picture it mentions, where the wiki has one. ${m.qpic_not_on_wiki ? `${m.qpic_not_on_wiki.toLocaleString()} picture names that quest pages mention do not exist as files on the wiki itself (mostly NPC chatheads), so nothing can be shown for those.` : ''}</li>
    <li>${m.spawn_maps ? `${m.spawn_maps.with_tiles.toLocaleString()} of ${m.spawn_maps.with_coords.toLocaleString()} monster spawn locations open an interactive map (drag, zoom, floors) built from the wiki's own map tiles, with the wiki's spawn point marked.` : ''} The wiki gives one spawn coordinate per place, so the other map layers the wiki can show (extra markers, routes, filters) are not reproduced, and the location pictures still show the wiki's red spawn dots.</li>
    ${m.icons_missing_names && m.icons_missing_names.length ? `<li>${m.icons_missing_names.length.toLocaleString()} item names have no icon because they are not single wiki items (for example “Nothing equipped…” rows), and ${m.icons_variant.toLocaleString()} names use the first variant icon of their wiki disambiguation page.${m.monster_images_missing_names && m.monster_images_missing_names.length ? ` The wiki has no picture for ${m.monster_images_missing_names.map(esc).join(' and ')}.` : ''}</li>` : ''}
    ${m.missing_location_pages ? `<li>${m.missing_location_pages} place pages were not in the copy yet, so some “how to get there” notes are missing.</li>` : ''}
    ${m.missing_clue_pages && m.missing_clue_pages.length ? `<li>Not yet in the copy: ${esc(m.missing_clue_pages.join(', '))}.</li>` : ''}
    ${m.clue_pages_not_on_wiki && m.clue_pages_not_on_wiki.length ? `<li>These clue pages do not exist on the RS3 wiki, so there is nothing to copy: ${esc(m.clue_pages_not_on_wiki.join(', '))}. The wiki's own Cryptic, Scan and Compass clue pages are included.</li>` : ''}
    <li>Nearest lodestone is a straight-line distance on the main map, not a walking route: the wiki publishes no walking-route data to compute one from.</li>
    <li>The gear finder only knows the requirements in an item's wiki infobox (skill levels, and the wiki's extra requirement text where it has some). Quest and unlock requirements that the wiki only describes in an item's page text are not checked.</li>
    <li>Item sources: every item lists the shops, drops, thieving, gathering, rewards, recipes (with a reverse “Used in”), spawns and quest rewards the wiki's data gives it, plus the wiki's own cleaned sentences labelled “From the wiki”. The wiki's dynamic lists (the “Drop sources”, “Shop locations” and “Uses material” boxes and the Disassembly tables) are generated by the wiki itself and are only included where their underlying data is in the copy. Items whose wiki page states no way to obtain them say so and link to the page.</li>
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
  d.hidden = false; const bx = d.querySelector('.box'); bx.className = 'box'; bx.innerHTML = html; return d;
}
/* Update progress UI: only a version (optional), a black/red bar and the percentage. No file counts, no sizes.
   The percentage is computed from real work (bytes / files done) and is held at 99% until the update is fully applied. */
function updProgressUI(ver, label) {
  const d = updDialog(`<h3>${esc(label || 'Updating…')}</h3>${ver ? `<div class="updver">Version <b>${esc(ver)}</b></div>` : ''}
    <div class="updpct" id="updpct" aria-hidden="true">0%</div>
    <div class="updbar" id="updbar" role="progressbar" aria-label="Update progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="updfill"></i></div>
    <div class="note" id="updnote">Keep this window open.</div>`);
  d.dataset.busy = '1'; d.querySelector('.box').classList.remove('patch');
  let shown = 0;
  const set = (pct, done) => {
    pct = done ? 100 : Math.max(shown, Math.min(99, Math.floor(pct || 0)));   // never goes backwards, never 100 before the update is applied
    shown = pct;
    const f = document.getElementById('updfill'); if (!f) return;
    f.style.width = pct + '%'; document.getElementById('updpct').textContent = pct + '%';
    document.getElementById('updbar').setAttribute('aria-valuenow', String(pct));
    d.classList.toggle('updfull', pct >= 100);
  };
  return {d, set, note: t => { const n = document.getElementById('updnote'); if (n) n.textContent = t; }};
}
/* Windows program: launcher progress (download 0-80% by bytes, install 80-99% by files) */
const exePct = p => {
  if (!p) return 0;
  if (p.phase === 'download') {
    const f = p.total_bytes > 0 ? p.bytes / p.total_bytes : p.total > 0 ? p.done / p.total : 0;
    return 80 * Math.max(0, Math.min(1, f));
  }
  if (p.phase === 'install') return 80 + 19 * Math.max(0, Math.min(1, p.total > 0 ? p.done / p.total : 0));
  return 0;
};
async function checkUpdates() {
  const d = updDialog('<h3>Check for updates</h3><div class="updmsg">Checking the live app…</div>');
  let r;
  try { r = await (await fetch('/__update/check', {cache: 'no-store'})).json(); } catch (e) { r = {error: e.message}; }
  const close = '<button class="btn ghost" id="updclose">Close</button>';
  if (r.error) updDialog(`<h3>Check for updates</h3><div class="updmsg">Couldn't check right now: ${esc(r.error)}<br>Make sure you're online and try again.</div><div class="row">${close}</div>`);
  else if (r.up_to_date) updDialog(`<h3>Up to date</h3><div class="updmsg">You have the latest version (<b>${esc(r.latest)}</b>).</div><div class="row">${close}</div>`);
  else {
    updDialog(`<h3>Update available</h3><div class="updmsg">${r.current === r.latest ? 'Some files differ from the live version; updating repairs them.' : `New version <b>${esc(r.latest)}</b>${r.current ? ` (installed ${esc(r.current)})` : ''}.`}</div>
      <div class="row"><button class="btn" id="updnow">Update now</button>${close}</div>`);
    $('#updnow').onclick = () => applyUpdate(r.latest);
  }
  const c = document.getElementById('updclose'); if (c) c.onclick = () => { d.hidden = true; };
}
async function applyUpdate(ver) {
  const ui = updProgressUI(typeof ver === 'string' ? ver : '', 'Updating…'), d = ui.d;
  const tick = setInterval(async () => {
    try {
      const p = await (await fetch('/__update/progress', {cache: 'no-store'})).json();
      if (p.phase === 'download' || p.phase === 'install') ui.set(exePct(p));
    } catch (e) {}
  }, 400);
  let r;
  try { r = await (await fetch('/__update/apply', {method: 'POST', cache: 'no-store'})).json(); } catch (e) { r = {ok: false, error: e.message}; }
  clearInterval(tick); delete d.dataset.busy;
  if (!r.ok) { updDialog(`<h3>Update failed</h3><div class="updmsg">${esc(r.error || 'Unknown error')}<br>Your current version was left as it was.</div><div class="row"><button class="btn ghost" id="updclose">Close</button></div>`);
    $('#updclose').onclick = () => { document.getElementById('upddlg').hidden = true; }; return; }
  // drop the old service worker and its caches so every new file is used
  try { for (const g of await navigator.serviceWorker?.getRegistrations?.() || []) await g.unregister(); } catch (e) {}
  try { for (const k of await caches.keys()) if (k.startsWith('dch-')) await caches.delete(k); } catch (e) {}
  try { localStorage.setItem('dch_updated', '1'); } catch (e) {}
  ui.set(100, true); ui.note('Updated. Restarting…');
  setTimeout(() => location.reload(), 1100);
}
async function detectLauncher() {
  try {
    const r = await fetch('/__update/info', {cache: 'no-store'});
    if (!r.ok) return;
    const j = await r.json(); if (!j.launcher) return;
    LAUNCHER = j; document.documentElement.classList.add('nx-launcher'); const dl = $('#nx-dl'); if (dl) dl.hidden = true; const ib = $('#nx-install'); if (ib) ib.hidden = true; const b = $('#updbtn'); b.hidden = false; b.onclick = checkUpdates;
    const p = document.getElementById('updpanel');
    if (p) { p.hidden = false; $('#updver').textContent = 'Installed version: ' + (j.current || 'unknown'); $('#updcheck').onclick = checkUpdates; launcherNote().then(h => { if (h && !p.querySelector('.patchlnc')) p.insertAdjacentHTML('beforeend', h); }); }
  } catch (e) {}
}

/* ---------- "New patch available" prompt ----------
   Windows program: a few seconds after launch it asks the launcher (/__update/check) and, if the live app has changed files, shows this card.
   Installed web app / browser: the service worker already serves fresh files on the next load, so the card only appears when this open session is older than the live app (update.json version differs) and offers a reload.
   Nothing is ever applied without a click on "Update now"; "Later" hides it for this session and the ⟳ Updates button stays. After an update the app shows one simple "Updated!" card (flag dch_updated), never patch notes. */
const semv = v => String(v || '0').split('.').map(x => parseInt(x, 10) || 0);
const semGt = (a, b) => { const x = semv(a), y = semv(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const fetchJ = async u => { try { const r = await fetch(u, {cache: 'no-store'}); return r.ok ? await r.json() : null; } catch (e) { return null; } };
function patchCard(o) {
  const d = updDialog(`<div class="patchhd"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1l1.8 4.2L14 7l-4.2 1.8L8 13l-1.8-4.2L2 7l4.2-1.8z"/></svg><span>${esc(o.kicker || 'New patch available')}</span></div>
    <h3>${esc(o.title)}</h3><div class="updmsg">${o.msg}</div>${o.notes || ''}${o.extra || ''}
    <div class="row">${o.now ? `<button class="btn" id="patchnow">${esc(o.nowLabel || 'Update now')}</button>` : ''}<button class="btn ghost" id="patchlater">${esc(o.laterLabel || 'Later')}</button></div>`);
  d.querySelector('.box').classList.add('patch');
  const b = d.querySelector('.box'); b.setAttribute('role', 'dialog'); b.setAttribute('aria-modal', 'true');
  $('#patchlater').onclick = () => { d.hidden = true; d.querySelector('.box').classList.remove('patch'); o.onLater && o.onLater(); };
  if (o.now) $('#patchnow').onclick = () => { d.querySelector('.box').classList.remove('patch'); o.now(); };
  return d;
}
/* Installed web app / browser: download the new version's files into a new cache (real progress = files done), then switch to it. */
async function reloadFresh(ver) {
  const ui = updProgressUI(typeof ver === 'string' ? ver : '', 'Updating…');
  let ok = true, keep = null;
  try {
    const pc = await (await fetch('precache.json', {cache: 'no-store'})).json();
    const files = pc.files || []; keep = 'dch-' + pc.version;
    if (!('caches' in window) || !files.length) throw new Error('nocache');
    const c = await caches.open(keep); let done = 0;
    for (let i = 0; i < files.length; i += 40) {
      await Promise.all(files.slice(i, i + 40).map(async f => { try { if (!(await c.match(f))) await c.add(new Request(f, {cache: 'reload'})); } catch (e) {} done++; }));
      ui.set(95 * done / files.length);
    }
  } catch (e) { ok = e && e.message === 'nocache'; }          // no cache support: nothing to download, just switch
  if (!ok) { updDialog('<h3>Update failed</h3><div class="updmsg">Couldn\u2019t download the new version. Check your connection and try again; nothing was changed.</div><div class="row"><button class="btn ghost" id="updclose">Close</button></div>');
    $('#updclose').onclick = () => { document.getElementById('upddlg').hidden = true; }; return; }
  try { for (const g of await navigator.serviceWorker?.getRegistrations?.() || []) await g.unregister(); } catch (e) {}
  try { for (const k of await caches.keys()) if (k.startsWith('dch-') && k !== keep) await caches.delete(k); } catch (e) {}
  try { localStorage.setItem('dch_updated', '1'); } catch (e) {}
  ui.set(100, true); ui.note('Updated. Restarting…');
  setTimeout(() => location.reload(), 1100);
}
const dlgOpen = () => { const d = document.getElementById('upddlg'); return d && !d.hidden; };
/* Windows program: optional newer launcher notice, from launcher.json that ships with the app (never replaces anything by itself) */
async function launcherNote() {
  if (!LAUNCHER) return '';
  const L = await fetchJ('launcher.json');
  if (!L || !L.latest || !semGt(L.latest, LAUNCHER.launcher_version)) return '';
  const url = /^https:\/\/github\.com\/theelonmuskrs3\/rs3-drop-clue-helper\//.test(L.url || '') ? L.url : '';
  return `<div class="note patchlnc">A newer Windows program (v${esc(L.latest)}, you have v${esc(LAUNCHER.launcher_version || '?')}) is available. Optional: the app itself updates without it.${url ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Download it</a>` : ''}</div>`;
}
let PATCH_BOOT = null;
async function exePatchCheck() {
  if (!LAUNCHER || dlgOpen()) return;
  let r; try { r = await (await fetch('/__update/check', {cache: 'no-store'})).json(); } catch (e) { return; }
  if (!r || r.error || r.up_to_date) return;
  const b = $('#updbtn'); if (b) b.classList.add('has');
  if (sessionStorage.patchLater === r.latest) return;
  patchCard({title: 'A new patch is ready', msg: `New version <b>${esc(r.latest)}</b>${r.current && r.current !== r.latest ? ` (you have ${esc(r.current)})` : ''}. Your saved levels and settings are kept.`,
    extra: await launcherNote(), now: () => applyUpdate(r.latest), onLater: () => { try { sessionStorage.patchLater = r.latest; } catch (e) {} }});
}
async function webPatchWatch() {
  if (LAUNCHER) return;
  const live = async () => { const u = await fetchJ('update.json'); return u && u.version; };
  PATCH_BOOT = await live(); if (!PATCH_BOOT) return;
  const chk = async () => {
    if (document.hidden || dlgOpen()) return;
    const v = await live(); if (!v || v === PATCH_BOOT || sessionStorage.patchLater === v) return;
    patchCard({title: 'A newer version is ready', msg: 'This window is running an older version. Reload to use the newest one; your saved levels and settings stay on this device.', now: () => reloadFresh(v), nowLabel: 'Update now', onLater: () => { try { sessionStorage.patchLater = v; } catch (e) {} }});
  };
  document.addEventListener('visibilitychange', chk); setInterval(chk, 20 * 60 * 1000);
}
/* After an update the user clicked has been fully applied (flag set just before the reload), show one simple "Updated!" card, once. Never on a first install, never with version text or notes. */
function updatedCard() {
  let on = false; try { on = localStorage.getItem('dch_updated') === '1'; localStorage.removeItem('dch_updated'); localStorage.removeItem('dch_wn_seen'); } catch (e) {}
  if (!on) return;
  const d = updDialog(`<div class="updone"><div class="uphat"><img src="brand/red-partyhat.webp" alt="" width="96" height="82" decoding="async"></div><h3>Updated!</h3><div class="updmsg">You\u2019re all set.</div><div class="row"><button class="btn" id="updgot">Got it</button></div></div>`);
  const b = d.querySelector('.box'); b.classList.add('patch', 'updonebox'); b.setAttribute('role', 'dialog'); b.setAttribute('aria-modal', 'true'); b.setAttribute('aria-label', 'Updated');
  const close = () => { d.hidden = true; b.classList.remove('patch', 'updonebox'); };
  $('#updgot').onclick = close; $('#updgot').focus();
}
async function patchBoot() { updatedCard(); webPatchWatch(); if (LAUNCHER) setTimeout(exePatchCheck, 4000); }

/* ---------- boot ---------- */
(async () => {
  try { const ic = await get('data/icons.json'); ICONS = ic.items || ic; EMOTES = ic.emotes || {}; GICONS = ic.gear || {}; SKICONS = ic.skills || {}; SKORDER = ic.skill_order || []; SKMAX = ic.skill_max || {}; SRCPICS = ic.sources || {}; } catch (e) { ICONS = {}; }
  loadStats(); welcomeBanner();
  route(); detectLauncher().then(patchBoot, patchBoot);
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
    <b>Shop sells at (wiki snapshot)</b><span>${money(sell, cur)}</span><b>Shop buys at (wiki snapshot)</b><span>${money(buy, cur)}</span>
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
function wRow(w) {
  return `<div class="wrow"><a href="${WIKI(w[0])}" target="_blank" rel="noopener noreferrer">${esc(w[0])}</a><span class="tag">${esc(w[1])}</span>
      <span class="note">${[w[2], w[3] ? 'qty ' + w[3] : '', w[4]].filter(Boolean).map(esc).join(' · ')}</span>${w[6] != null ? `<a class="btn mini" href="#map/${w[6]}">Open map</a>` : ''}</div>`;
}
const GATHER_K = /^(Mining|Woodcutting|Fishing|Hunter|Farming|Divination|Archaeology|Agility|Runecrafting|Smithing|Fletching|Herblore|Prayer|Crafting|Summoning|Skilling|Cooking|Firemaking|Construction|Dungeoneering|Thieving)$/i;
function fold(names, n = 10) {
  const l = names.map(x => `<span class="gl">${x}</span>`);
  return l.slice(0, n).join(' · ') + (l.length > n ? ` <details class="glmore"><summary>+${l.length - n} more</summary>${l.slice(n).join(' · ')}</details>` : '');
}
/* 'Sources at a glance': every way the app has data for, ordered Buy / Craft / Drop / Thieve / Gather / Reward / Spawn (nothing truncated) */
function glance(S, drops, SM) {
  const L = [];
  const shops = (S.s || []).filter(s => !s[8]);
  if (shops.length) { const u = []; const seen = new Set(); for (const s of shops) { const k = s[0]; if (seen.has(k)) continue; seen.add(k); u.push(`${esc(s[0])}${s[4] != null ? ` (${s[4].toLocaleString()} ${esc(s[6] || 'gp')})` : ''}`); } L.push(['Buy (shop snapshot)', `${seen.size} shop${seen.size === 1 ? '' : 's'}: ${fold(u)}`]); }
  if (S.r && S.r.length) L.push(['Craft', `${S.r.length} recipe${S.r.length === 1 ? '' : 's'}: ${fold(S.r.map(r => { const sk = r[2] && r[2][0]; return `${esc(r[0] || 'Creation')}${sk ? ` (${esc(sk[0])} ${esc(sk[1])})` : ''}`; }), 6)}`]);
  if (drops && drops.length) L.push(['Drop', `${drops.length.toLocaleString()} source${drops.length === 1 ? '' : 's'}: ${fold([...new Set(drops.map(d => esc(d[0])))], 10)}`]);
  if (S.v && S.v.length) { const u = [...new Set(S.v.map(v => v[0]))]; L.push(['Thieve', `${u.length} source${u.length === 1 ? '' : 's'}: ${fold(u.map(esc))}`]); }
  const w = S.w || [], g = w.filter(x => GATHER_K.test(x[1]) && x[1] !== 'Thieving'), rw = w.filter(x => !GATHER_K.test(x[1]));
  if (g.length) L.push(['Gather', `${g.length} source${g.length === 1 ? '' : 's'}: ${fold(g.map(x => `${esc(x[0])} <i>${esc(x[1])}</i>`))}`]);
  const rq = (S.q || []).map(q => `${esc(q[0])} <i>quest</i>`);
  if (rw.length || rq.length) L.push(['Reward', `${rw.length + rq.length} source${rw.length + rq.length === 1 ? '' : 's'}: ${fold([...rw.map(x => `${esc(x[0])} <i>${esc(x[1])}</i>`), ...rq])}`]);
  if (S.p && S.p.length) L.push(['Spawn', `${S.p.length} ground spawn${S.p.length === 1 ? '' : 's'}: ${fold(S.p.map(p => esc(p[0] || 'see item page')), 6)}`]);
  if (S.rel && S.rel.length) L.push(['See also', S.rel.map(n => `<a href="#items/${encodeURIComponent(n)}">${esc(n)}</a>${SM && SM[n] ? ` <span class="note">(${esc(SM[n])})</span>` : ''}`).join(' · ')]);
  if (!L.length && (S.sc || (S.tx || []).some(t => t[3] === 'o') || S.x)) L.push(['Wiki text', 'The wiki describes how to get this item in prose (see “From the wiki” below); it has no shop, drop or recipe table.']);
  return L.length ? `<div class="wsec glance"><h4>Sources at a glance</h4>${L.map(([k, v]) => `<div class="wrow"><span class="tag gk">${k}</span><span class="glv">${v}</span></div>`).join('')}</div>` : '';
}
function recipeCard(r, D, SM) {
  const [m, mem, sk, mats, fac, tool, quest, page, ticks, outs] = r;
  return `<div class="wcard"><div class="wc-h"><b>${esc(m || 'Creation')}</b>${memTag(mem)}</div><div class="kv">
    ${sk && sk.length ? `<b>Skills</b><span>${sk.map(x => `${esc(x[0])} ${esc(x[1])}${x[2] ? ` <span class="note">(${esc(x[2])} xp)</span>` : ''}`).join(', ')}</span>` : ''}
    ${mats && mats.length ? `<b>Materials</b><span data-nosrc>${mats.map(x => `${x[2] ? itemLink(x[0]) : esc(x[0])} <span class="note">× ${esc(x[1])}${x[2] && SM && SM[x[0]] ? ' — ' + esc(SM[x[0]]) : ''}</span>`).join('<br>')}</span>` : ''}
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
  const txo = (S.tx || []).filter(t => t[3] === 'o'), txu = (S.tx || []).filter(t => t[3] === 'u');
  const wikiTxt = !!(txo.length || S.sc || S.x || (S.rel && S.rel.length));
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
    ${S.w.slice(0, 14).map(wRow).join('')}${S.w.length > 14 ? `<details><summary>Show all ${S.w.length.toLocaleString()} rewards &amp; other sources</summary>${S.w.slice(14).map(wRow).join('')}</details>` : ''}</div>`);
  if (S.r && S.r.length) sec.push(`<div class="wsec"><h4>Creation <span class="note">(${(S.rn || S.r.length).toLocaleString()} recipe${(S.rn || S.r.length) === 1 ? '' : 's'})</span></h4>${S.r.slice(0, 4).map(r => recipeCard(r, D, SM)).join('')}${S.r.length > 4 ? `<details><summary>Show all ${S.r.length} recipes</summary>${S.r.slice(4).map(r => recipeCard(r, D, SM)).join('')}</details>` : ''}</div>`);
  if (S.p && S.p.length) sec.push(`<div class="wsec"><h4>Ground spawns <span class="note">(${(S.pn || S.p.length).toLocaleString()} places)</span></h4>${S.p.slice(0, 4).map(spawnCard).join('')}${S.p.length > 4 ? `<details><summary>Show all ${S.p.length} places</summary>${S.p.slice(4).map(spawnCard).join('')}</details>` : ''}</div>`);
  if (S.q && S.q.length) sec.push(`<div class="wsec"><h4>Quest rewards</h4>${S.q.map(q => `<div class="wrow"><a href="#quests/${encodeURIComponent(q[0])}">${esc(q[0])}</a><span class="note">${esc(q[1])}</span></div>`).join('')}${S.qn > S.q.length ? `<div class="note">+${S.qn - S.q.length} more quests.</div>` : ''}</div>`);
  if (S.h && S.h.length) sec.push(`<div class="wsec"><h4>Availability history <span class="note">(release-history table on the wiki page)</span></h4><div class="tscroll"><table><thead><tr><th>Start</th><th>End</th><th>Event / content</th></tr></thead><tbody>${availRows(S.h)}</tbody></table></div>${S.hn > S.h.length ? `<div class="note">+${S.hn - S.h.length} older rows on the wiki.</div>` : ''}</div>`);
  if (S.x) sec.push(`<div class="wsec"><blockquote class="obhow">“${esc(S.x)}${S.x.length >= 360 ? '…' : ''}”<cite>— RS3 wiki, <a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">${esc(page)}</a> (page introduction)</cite></blockquote></div>`);
  const wl = x => esc(x).replace(/\n/g, '<br>');
  if (txo.length || S.sc) {
    const more = S.sc && S.sc.length && (hasAny || txo.length) ? 1 : 0;
    sec.push(`<div class="wsec"><h4>From the wiki <span class="note">(RS3 wiki article text, cleaned; <a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">open the page ↗</a>)</span></h4>
      ${txo.map(t => `<blockquote class="obhow"><b>${esc(t[0])}</b><br>${wl(t[1])}<cite>— RS3 wiki, <a href="${WIKI(page)}${'#' + encodeURIComponent(t[0].replace(/ /g, '_'))}" target="_blank" rel="noopener noreferrer">${esc(page)} › ${esc(t[0])}</a>${t[2] ? ' (shortened; the page has more)' : ''}</cite></blockquote>`).join('')}
      ${S.sc && S.sc.length ? `<blockquote class="obhow"><b>Stated in the article</b><br>${S.sc.map(x => '• ' + esc(x)).join('<br>')}<cite>— RS3 wiki, <a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">${esc(page)}</a></cite></blockquote>` : ''}</div>`);
  }
  if (S.rel && S.rel.length && !(S.rel.length && sum.startsWith('See also'))) sec.push(`<div class="wsec"><h4>Related item pages <span class="note">(the wiki lists their sources under this item)</span></h4>${S.rel.map(n => `<div class="wrow">${itemLink(n)}<span class="note">${esc(SM[n] || 'see the item page')}</span></div>`).join('')}</div>`);
  if (S.nb && S.nb.length) sec.push(`<div class="wsec"><h4>Listed with <span class="note">(the wiki’s navigation boxes on this page; a hint where to look, not a stated method)</span></h4><div class="wrow">${S.nb.map(b => `<a href="${WIKI(b[1])}" target="_blank" rel="noopener noreferrer">${esc(b[0])} ↗</a>`).join(' · ')}</div></div>`);
  if (eggs.length) sec.push(`<div class="wsec"><h4>Easter egg reward</h4>${eggs.map(r => `<div class="wrow"><a href="#secrets/${esc(r.id)}">${esc(r.t)}</a><span class="tag">Easter egg</span><span class="note">${esc(r.rq.length ? 'has requirements, see steps' : 'no requirements')}</span></div>`).join('')}<div class="note">A hidden interaction the RS3 wiki documents. Open it in the Easter Eggs tab for the steps.</div></div>`);
  const act = mapActionFor(S, TH);
  const uRow = u => `<div class="wrow">${itemLink(u[0])}<span class="note">${[u[1] && u[2] != null ? `${u[1]} ${u[2]}` : '', u[3] ? 'members' : 'free-to-play'].filter(Boolean).map(esc).join(' · ')}</span></div>`;
  const usedIn = (S.u && S.u.length) || txu.length ? `<div class="wsec usedin"><h4>Used in <span class="note">(${S.u && S.u.length ? `${S.u.length.toLocaleString()} item${S.u.length === 1 ? '' : 's'} made with this, from the wiki’s creation recipes` : 'RS3 wiki text'})</span></h4>
      ${S.u ? S.u.slice(0, 8).map(uRow).join('') + (S.u.length > 8 ? `<details><summary>Show all ${S.u.length.toLocaleString()}</summary>${S.u.slice(8).map(uRow).join('')}</details>` : '') : ''}
      ${txu.map(t => `<blockquote class="obhow"><b>${esc(t[0])}</b><br>${wl(t[1])}<cite>— RS3 wiki, <a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">${esc(page)}</a></cite></blockquote>`).join('')}</div>` : '';
  el.innerHTML = `<h3>Where to get it</h3><div class="wtg">
    ${sum ? `<div class="wsum wrow"><b>${esc(sum)}</b>${act}</div>` : ''}
    ${glance(S, drops, SM)}
    ${sec.length ? sec.join('') : ''}
    ${usedIn}
    ${!hasAny && !wikiTxt ? `<div class="note wnone">The RS3 wiki documents no way to obtain this item: its page has no shop, drop, recipe, ground spawn, reward or availability entry and no sentence describing how to get it. <a href="${WIKI(page)}" target="_blank" rel="noopener noreferrer">Check the wiki page ↗</a></div>` : ''}
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
    el.textContent = s || 'No obtain method stated on the RS3 wiki';
    if (a.classList.contains('hit')) a.appendChild(el);
    else if (a.parentElement.classList.contains('obtitle')) a.parentElement.after(el);
    else (a.querySelector('span') || a).appendChild(el);
  }
}
new MutationObserver(() => { if (!decoT) decoT = setTimeout(() => { decoT = 0; decorateCards(); }, 60); }).observe(view, {childList: true, subtree: true});
