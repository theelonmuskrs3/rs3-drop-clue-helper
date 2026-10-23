'use strict';
/* Map tab: global search for any place / entrance / NPC / object with wiki-stated coordinates.
   Pins are drawn only at coordinates written on the RS3 wiki page (see "How found" on every entry).
   Map pictures are the RS3 wiki's own map tiles (data/map/tiles.json lists the 8x8 tile packs in maptiles/). */
const MT = {idx: null, tiles: null, packs: {}, rows: null};
const MTYPES = [['ent', 'Entrances'], ['dun', 'Dungeons'], ['lad', 'Ladders/Stairs'], ['npc', 'NPCs'], ['obj', 'Objects'], ['shop', 'Shops'],
  ['bank', 'Banks'], ['tele', 'Teleports/Lodestones'], ['place', 'Places'], ['other', 'Other']];
const MGL = {npc: '☺', obj: '⬢', shop: '⚖', bank: '⛁', dun: '⛫', ent: '⛩', lad: '☰', tele: '✧', place: '⌂', other: '◆'};
const MTL = Object.fromEntries(MTYPES);
async function mapData() {
  if (!MT.idx) {
    const [ix, tl] = await Promise.all([get('data/map/index.json'), get('data/map/tiles.json')]);
    MT.idx = ix; MT.tiles = tl;
    MT.rows = ix.rows.map(r => { const n = norm(r[0]), al = r[3] ? r[3].split('|').map(norm) : []; return {r, n, al, a: al.join(' '), toks: n.split(' ')}; });
  }
  return MT.idx;
}
const lev1 = (a, b) => {   // edit distance <= 1 ?
  if (a === b) return true; const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
  return e + (la - i) + (lb - j) <= 1;
};
function fastScore(n, q) {
  if (n === q) return 1000; if (n.startsWith(q)) return 500 - n.length;
  const i = n.indexOf(q); if (i >= 0) return 300 - i - n.length / 10;
  return -1;
}
function tokIndex() {
  if (MT.inv) return MT.inv;
  const inv = new Map();
  MT.rows.forEach((o, i) => { for (const w of new Set(o.a ? o.toks.concat(o.a.split(' ')) : o.toks)) { if (!w) continue; let a = inv.get(w); if (!a) inv.set(w, a = []); a.push(i); } });
  return (MT.inv = inv);
}
function msearch(nq, t) {
  const qt = nq.split(' ').filter(Boolean), out = new Map();
  const bonus = r => (r[2] & 4 ? 2 : 0) - (r[2] & 8 ? 1 : 0) - (r[2] & 16 ? 40 : 0);
  MT.rows.forEach(o => {
    if (t && o.r[1] !== t) return;
    let s = fastScore(o.n, nq);
    if (s < 900 && o.al.length) for (const a of o.al) { const v = a === nq ? 950 : a.startsWith(nq) ? 400 : a.includes(nq) ? 250 : -1; if (v > s) s = v; }
    if (s >= 0) out.set(o.r, s + bonus(o.r));
  });
  // word match: every query word is the start of a word in the name/aliases, or one typo away (words of 4+ letters)
  const inv = tokIndex(); let set = null; const typos = new Map();
  for (const q of qt) {
    const hit = new Set();
    for (const [w, ids] of inv) {
      let ok = w.startsWith(q), typo = false;
      if (!ok && q.length >= 4 && (out.size < 25 || qt.length > 1)) { ok = Math.abs(w.length - q.length) <= 1 ? lev1(q, w) : w.length > q.length && lev1(q, w.slice(0, q.length)); typo = ok; }
      if (ok) for (const i of ids) { if (!set || set.has(i)) { hit.add(i); if (typo) typos.set(i, (typos.get(i) || 0) + 1); } }
    }
    set = hit; if (!set.size) break;
  }
  for (const i of set || []) {
    const o = MT.rows[i]; if (t && o.r[1] !== t || out.has(o.r)) continue;
    out.set(o.r, (typos.has(i) ? 60 - 10 * typos.get(i) : 100) - o.n.length / 10 + bonus(o.r));
  }
  return [...out].sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
const nearestLode = (x, y) => {
  let best = null;
  for (const [n, lx, ly] of MT.idx.meta.lodestones) { const d = Math.hypot(lx - x, ly - y); if (!best || d < best[1]) best = [n, d]; }
  return best && `${esc(best[0])} (${Math.round(best[1])} tiles, straight-line)`;
};

async function mapTab(arg) {
  await mapData();
  const idp = (arg || '').split('?')[0];
  if (/^\d+$/.test(idp)) return mapEntry(+idp);
  const st = JSON.parse(sessionStorage.mapq || '{"q":"","t":""}');
  const rows = MT.idx.rows, meta = MT.idx.meta;
  const withC = rows.filter(r => r[2] & 1).length;
  view.innerHTML = `<div class="panel"><h2>Map search</h2>
    ${searchBox('q', 'Any place, entrance, dungeon, ladder, NPC, shop, bank, lodestone…', st.q)}
    <div class="chips" id="chips"><button data-t="" class="${st.t ? '' : 'on'}">All</button>${MTYPES.map(([k, l]) => `<button data-t="${k}" class="${st.t === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="note" id="cnt" style="margin-top:6px"></div>
    <div id="res" class="list"></div></div>
    <div class="panel"><h2>World map</h2><div class="note" style="margin-bottom:6px">The RS3 wiki's surface map. Gold dots are the search results above that have a surface point; tap one to open it. Drag to move, pinch or scroll to zoom.</div><div id="wmap"></div></div>
    <div class="note" style="margin:0 4px 12px">${rows.length.toLocaleString()} searchable entries · ${withC.toLocaleString()} with map coordinates written on the RS3 wiki. Coordinates and pictures come only from the wiki; nothing is estimated.</div>`;
  const q = $('#q'), out = $('#res');
  const wm = new TileView($('#wmap'), {map: '28', plane: 0, x: 3200, y: 3300, k: 0.5, height: 420, lodes: true});
  let tmr;
  const draw = () => {
    const s = {q: q.value, t: (document.querySelector('#chips .on') || {}).dataset?.t || ''}; sessionStorage.mapq = JSON.stringify(s);
    const nq = norm(s.q), qt = nq ? nq.split(' ') : [];
    let hits;
    if (nq) hits = msearch(nq, s.t);
    else hits = s.t ? rows.filter(r => r[1] === s.t && !(r[2] & 8)) : [];
    $('#cnt').textContent = nq || s.t ? `${hits.length.toLocaleString()} match${hits.length === 1 ? '' : 'es'}${hits.length > 80 ? ' (showing 80)' : ''}` : 'Type a name, or pick a type.';
    out.innerHTML = hits.slice(0, 80).map(r => {
      const where = r[5] != null ? `${r[2] & 2 ? '' : 'start '}${r[5]}, ${r[6]}` : r[2] & 1 ? 'separate map area' : 'no map coordinates on the wiki';
      return `<a class="hit" href="#map/${r[4]}${r[2] & 8 ? '?row=' + encodeURIComponent(r[0]) : ''}">${r[7] ? `<img class="ico" loading="lazy" decoding="async" src="mapimg/${r[7]}.webp" alt="" onerror="this.outerHTML='<span class=&quot;ph&quot; title=&quot;No picture on the RS3 wiki&quot;>${MGL[r[1]] || '◆'}</span>'">` : `<span class="ph" title="No picture on the RS3 wiki">${MGL[r[1]] || '◆'}</span>`}<span>${esc(r[0])}${r[2] & 16 ? ' <span class="tag">removed</span>' : ''}</span><span class="meta"><span class="mtype t-${r[1]}">${esc(MTL[r[1]] || r[1])}</span> ${esc(where)}</span></a>`;
    }).join('');
    const wp = hits.filter(r => r[5] != null).slice(0, 400).map(r => ({x: r[5], y: r[6], id: r[4], name: r[0], row: r[2] & 8 ? r[0] : null}));
    wm.setPins(wp);
    if (wp.length && wp.length <= 40 && nq) {   // frame the matches
      const xs = wp.map(p => p.x), ys = wp.map(p => p.y), sp = Math.max(40, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      wm.cx = (Math.min(...xs) + Math.max(...xs)) / 2 + .5; wm.cy = (Math.min(...ys) + Math.max(...ys)) / 2 + .5; wm.k = Math.max(0.25, Math.min(4, wm.W / sp / 1.4)); wm.draw();
    }
  };
  wm.onPin = p => { location.hash = `map/${p.id}${p.row ? '?row=' + encodeURIComponent(p.row) : ''}`; };
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(draw, 90); };
  $('#chips').onclick = e => { const b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x === b)); draw(); };
  draw(); q.focus();
}

function mapLink(t) { return `<a href="https://runescape.wiki/w/${encodeURIComponent(t.replace(/ /g, '_'))}" target="_blank" rel="noopener">${esc(t)} on the RS3 wiki ↗</a>`; }
async function mapEntry(id) {
  const meta = MT.idx.meta;
  const rowSel = (location.hash.split('?row=')[1] || '');
  const rowName = rowSel ? decodeURIComponent(rowSel) : '';
  const e = (await get(`data/map/s/${Math.floor(id / meta.shard)}.json`))[id];
  if (!e) { view.innerHTML = `<div class="panel">Not found. <a href="#map">Back</a></div>`; return; }
  let groups = e.g || [];
  let title = e.n, sub = '';
  if (rowName) {
    const lab = rowName.slice(e.n.length + 2, -1);
    const gs = groups.filter(g => g.label && g.label.slice(0, 80) === lab);
    if (gs.length) { groups = gs; title = rowName; sub = lab; }
  }
  // Step 1: the surface point. Own surface pin first, else the wiki-linked way in.
  const sg = groups.find(g => g.surf);
  let start = null;
  if (sg) start = {x: sg.pts[0][0], y: sg.pts[0][1], plane: sg.pts[0][2], how: sg.how, label: sg.label || title, own: true, poly: sg.area ? sg.pts : null};
  else { const s = groups.map(g => g.start).find(Boolean) || (!rowName && e.start); if (s) start = {x: s.x, y: s.y, plane: 0, how: s.how, label: s.label, poly: s.area || null, coarse: s.coarse}; }
  const surfPts = groups.filter(g => g.surf && !g.area).flatMap(g => g.pts);
  const polys = groups.filter(g => g.surf && g.area).map(g => g.pts);
  const inside = groups.filter(g => !g.surf);
  const kv = [['Type', MTL[e.t] || e.t], ['Area', e.loc], ['Members', e.mem], ['Examine', e.ex]].filter(x => x[1]);
  const steps = [];
  let n = 1;
  if (start) {
    steps.push(`<div class="sstep"><div class="sstep-h"><span class="snum">Step ${n++}</span> Start here${start.label ? ` — ${esc(start.label)}` : ''}</div>
      <div class="mapwrap" id="m0"></div>
      ${start.coarse ? `<div class="note">The wiki gives no surface point for ${esc(title)} itself, so this is the surface point the wiki gives for the place its infobox names (see How found).</div>` : ''}
      <div class="kv" style="margin-top:6px"><b>${start.poly ? 'Area outline (wiki)' : 'World map point'}</b><span>${start.poly ? start.poly.map(p => p[0] + ', ' + p[1]).join(' · ') : coordStr([start.x, start.y], start.plane)}</span>
      <b>Nearest lodestone</b><span>${nearestLode(start.x, start.y)}</span>
      <b>How found</b><span class="pre">${esc(start.how)}</span>${surfPts.length > 1 ? `<b>Wiki pins</b><span>${surfPts.length.toLocaleString()} on the surface map (all shown)</span>` : ''}</div></div>`);
  } else {
    steps.push(`<div class="sstep"><div class="sstep-h"><span class="snum">Step ${n++}</span> Start here</div><div class="note">${groups.length ? 'The wiki gives this spot only on a separate map area (shown below) and does not link a surface entrance this app could follow, so no surface pin is shown.' : 'No map coordinates on the wiki for this page, so no pin is shown.'} Check the text below or ${mapLink(e.page)}.</div></div>`);
  }
  inside.forEach((g, i) => {
    const pl = [...new Set(g.pts.map(p => p[2]))];
    steps.push(`<div class="sstep"><div class="sstep-h"><span class="snum">Step ${n++}</span> ${start ? 'Then inside' : 'Exact spot'}: ${esc(g.mapn)}${g.label ? ` — ${esc(g.label)}` : ''}</div>
      <div class="mapwrap" id="mi${i}"></div>
      <div class="kv" style="margin-top:6px"><b>Coordinates</b><span>${g.pts.slice(0, 6).map(p => coordStr(p, p[2])).join(' · ')}${g.npts > 6 ? ` · +${(g.npts - 6).toLocaleString()} more` : ''}</span>
      <b>Map</b><span>${esc(g.mapn)} (wiki map ${esc(g.map)}${pl.length === 1 && pl[0] ? `, floor ${pl[0]}` : ''})</span>
      ${g.req ? `<b>Requirements</b><span class="pre">${esc(g.req)}</span>` : ''}${g.lvls ? `<b>Levels</b><span>${esc(g.lvls)}</span>` : ''}
      <b>How found</b><span class="pre">${esc(g.how)}</span>${g.start ? `<b>Surface way in</b><span class="pre">${esc(g.start.label)} at ${coordStr([g.start.x, g.start.y])} — ${esc(g.start.how)}</span>` : ''}</div></div>`);
  });
  const others = groups.filter(g => g.surf);
  const locList = others.length > 1 || (others.length && (others[0].req || others[0].lvls)) ? `<div class="panel"><h2>Wiki locations on the surface map</h2>${others.map(g => `<div class="mloc"><b>${esc(g.label || g.sec || e.n)}</b>${g.lvls ? ` <span class="tag">Lvl ${esc(g.lvls)}</span>` : ''}${g.mem ? ` <span class="tag">Members: ${esc(g.mem)}</span>` : ''}
    <div class="note">${g.area ? 'Area outline corners: ' : ''}${g.pts.slice(0, 8).map(p => coordStr(p, p[2])).join(' · ')}${g.npts > 8 ? ` · +${(g.npts - 8).toLocaleString()} more` : ''}</div>
    ${g.req ? `<div class="note">Requirements: ${esc(g.req)}</div>` : ''}<div class="note">How found: ${esc(g.how)}</div></div>`).join('')}</div>` : '';
  view.innerHTML = `<div class="row" style="margin-bottom:10px"><a class="btn ghost" href="#map">← Map search</a></div>
  <div class="panel"><div class="row" style="gap:16px;align-items:flex-start">
    ${e.img ? fig([e.img[0], e.img[1] + (e.imgw && /^(infobox (owner|location)|related page)/.test(e.imgw) ? ' · picture from ' + (e.imgw.match(/'([^']+)'/) || [, 'a related page'])[1] : '')], 'hero') : PH(MGL[e.t] || '⌖', 96)}
    <div style="flex:1;min-width:220px"><h2>${esc(title)}</h2>${e.rm ? '<div class="note" style="color:#ef6b6b;margin-bottom:6px">The wiki marks this as removed or past content, so it may no longer be in the game.</div>' : ''}${e.d ? `<div class="pre">${esc(e.d)}</div>` : ''}
    <div class="kv" style="margin-top:8px">${kv.map(([k, v]) => `<b>${k}</b><span>${esc(v)}</span>`).join('')}</div>
    <div style="margin-top:8px">${mapLink(e.page)}</div></div></div></div>
  <div class="panel"><h2>How to get there</h2><div class="ssteps">${steps.join('')}</div>
    ${(e.gt || []).map(g => `<div style="margin-top:8px"><b class="pill">${esc(g.heading)}</b><div class="pre">${esc(g.text)}</div></div>`).join('')}
    <div class="note" style="margin-top:8px">Pins sit only at coordinates the RS3 wiki states. Map pictures are the wiki's own map tiles. Text is quoted from the wiki page.</div></div>
  ${locList}`;
  if (start) {
    let vx = start.x, vy = start.y, k = 4;
    if (start.poly) {   // frame the wiki's outline (view only; the outline itself is the marker)
      const xs = start.poly.map(p => p[0]), ys = start.poly.map(p => p[1]);
      vx = (Math.min(...xs) + Math.max(...xs)) / 2; vy = (Math.min(...ys) + Math.max(...ys)) / 2;
      k = Math.max(0.5, Math.min(8, 200 / Math.max(10, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))));
    }
    const v = new TileView($('#m0'), {map: '28', plane: start.plane || 0, x: vx, y: vy, k, height: 300, lodes: true});
    const pp = start.poly ? [] : [{x: start.x, y: start.y, main: true, name: start.label}];
    v.setPins([...pp, ...surfPts.filter(p => p[0] !== start.x || p[1] !== start.y).map(p => ({x: p[0], y: p[1]}))], start.poly && !polys.includes(start.poly) ? [...polys, start.poly] : polys);
    if (start.poly) v.areaLabel = [start.poly[0][0], Math.max(...start.poly.map(p => p[1])), start.label];
  }
  inside.forEach((g, i) => {
    const p0 = g.pts[0];
    const v = new TileView($('#mi' + i), {map: g.tm || g.map, plane: p0[2] || 0, x: p0[0], y: p0[1], k: 4, height: 260, zooms: [1, 2], floors: false});
    v.setPins([{x: p0[0], y: p0[1], main: true, name: g.label || title}, ...g.pts.slice(1).filter(p => p[2] === p0[2]).map(p => ({x: p[0], y: p[1]}))], g.area ? [g.pts] : []);
  });
}

/* ---------- pan/zoom viewer over the wiki's map tiles ---------- */
async function tilePack(map, z, plane, bx, by) {
  const key = `${map}/${z}/${plane}/${bx}_${by}`;
  if (MT.packs[key]) return MT.packs[key];
  const avail = (MT.tiles.packs[`${map}/${z}/${plane}`] || []);
  if (!MT.tiles.set) MT.tiles.set = {};
  const sk = `${map}/${z}/${plane}`;
  if (!MT.tiles.set[sk]) MT.tiles.set[sk] = new Set(avail.map(a => a[0] + '_' + a[1]));
  if (!MT.tiles.set[sk].has(bx + '_' + by)) return (MT.packs[key] = Promise.resolve({}));
  return (MT.packs[key] = fetch(`maptiles/${key}.bin`).then(r => r.ok ? r.arrayBuffer() : null).then(buf => {
    if (!buf) return {};
    const hl = new DataView(buf).getUint32(0, true);
    const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
    const o = {};
    for (const [tx, ty, off, len] of hdr) o[tx + '_' + ty] = {blob: new Blob([new Uint8Array(buf, 4 + hl + off, len)], {type: 'image/webp'}), img: null};
    return o;
  }).catch(() => { delete MT.packs[key]; return {}; }));
}
class TileView {
  constructor(el, o) {
    this.o = o; this.map = String(o.map); this.plane = o.plane || 0; this.cx = o.x + .5; this.cy = o.y + .5; this.k = o.k || 2;
    this.zooms = o.zooms || (MT.idx.meta.surface.zooms); this.pins = []; this.polys = [];
    el.classList.add('tview');
    el.innerHTML = `<canvas></canvas><div class="tv-ctl"><button data-a="in" title="Zoom in">+</button><button data-a="out" title="Zoom out">−</button>
      ${o.x != null ? '<button data-a="home" title="Back to the pin">Pin</button>' : ''}${o.floors !== false ? `<select title="Floor">${[0, 1, 2, 3].map(p => `<option value="${p}" ${p === this.plane ? 'selected' : ''}>Floor ${p}</option>`).join('')}</select>` : ''}
      <button data-a="big" title="Bigger map">⤢</button></div><div class="tv-tip"></div>`;
    this.el = el; this.cv = el.querySelector('canvas'); this.ctx = this.cv.getContext('2d'); this.h = o.height || 300;
    this.home = [this.cx, this.cy, this.k];
    el.querySelector('.tv-ctl').onclick = ev => {
      const a = ev.target.dataset && ev.target.dataset.a; if (!a) return;
      if (a === 'in') this.zoomAt(2, this.W / 2, this.H / 2); if (a === 'out') this.zoomAt(.5, this.W / 2, this.H / 2);
      if (a === 'home') { [this.cx, this.cy, this.k] = this.home; this.draw(); }
      if (a === 'big') { el.classList.toggle('big'); this.resize(); }
    };
    const sel = el.querySelector('select'); if (sel) sel.onchange = () => { this.plane = +sel.value; this.draw(); };
    const pts = new Map(); let moved = false, last = null, pinch = null;
    this.cv.addEventListener('pointerdown', ev => { this.cv.setPointerCapture(ev.pointerId); pts.set(ev.pointerId, [ev.offsetX, ev.offsetY]); moved = false; last = [ev.offsetX, ev.offsetY];
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    this.cv.addEventListener('pointermove', ev => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); this.zoomAt(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = d; moved = true; return; }
      const dx = ev.offsetX - last[0], dy = ev.offsetY - last[1]; if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      this.cx -= dx / this.k; this.cy += dy / this.k; last = [ev.offsetX, ev.offsetY]; this.draw();
    });
    const up = ev => { pts.delete(ev.pointerId); if (pts.size < 2) pinch = null; if (pts.size === 1) last = [...pts.values()][0];
      if (!moved && ev.type === 'pointerup') this.click(ev.offsetX, ev.offsetY); };
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    this.cv.addEventListener('wheel', ev => { ev.preventDefault(); this.zoomAt(ev.deltaY < 0 ? 1.25 : .8, ev.offsetX, ev.offsetY); }, {passive: false});
    this.cv.addEventListener('dblclick', ev => this.zoomAt(2, ev.offsetX, ev.offsetY));
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el);
    this.resize();
  }
  resize() {
    const r = this.el.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.W = Math.max(200, r.width); this.H = this.el.classList.contains('big') ? Math.max(this.h, innerHeight * .75) : this.h;
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px'; this.cv.width = this.W * dpr; this.cv.height = this.H * dpr; this.dpr = dpr; this.draw();
  }
  zoomAt(f, sx, sy) {
    const nk = Math.min(32, Math.max(0.125, this.k * f)); const gx = this.cx + (sx - this.W / 2) / this.k, gy = this.cy - (sy - this.H / 2) / this.k;
    this.k = nk; this.cx = gx - (sx - this.W / 2) / nk; this.cy = gy + (sy - this.H / 2) / nk; this.draw();
  }
  setPins(p, polys) { this.pins = p || []; this.polys = polys || []; this.draw(); }
  S(x, y) { return [(x - this.cx) * this.k + this.W / 2, this.H / 2 - (y - this.cy) * this.k]; }
  click(sx, sy) {
    if (!this.onPin) return;
    let best = null, bd = 14;
    for (const p of this.pins) { const [px, py] = this.S(p.x + .5, p.y + .5); const d = Math.hypot(px - sx, py - sy); if (d < bd) { bd = d; best = p; } }
    if (best) this.onPin(best);
  }
  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this._draw(); });
  }
  _draw() {
    const c = this.ctx, W = this.W, H = this.H; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#0e0e0e'; c.fillRect(0, 0, W, H); c.imageSmoothingEnabled = this.k < 8;
    let zs = this.zooms.filter(z => MT.tiles.packs[`${this.map}/${z}/${this.plane}`]); if (!zs.length) zs = this.zooms;
    let z = zs[0];
    for (const zz of zs) if (2 ** zz <= this.k * 1.01 || zz === zs[0]) z = zz;
    if (2 ** z < this.k / 1.5 && zs.includes(z + 1)) z = z + 1;
    const s = 2 ** z, tg = 256 / s;           // game tiles per map tile
    const x0 = this.cx - W / 2 / this.k, x1 = this.cx + W / 2 / this.k, y0 = this.cy - H / 2 / this.k, y1 = this.cy + H / 2 / this.k;
    const need = [];
    for (let tx = Math.floor(x0 / tg); tx <= Math.floor(x1 / tg); tx++) for (let ty = Math.floor(y0 / tg); ty <= Math.floor(y1 / tg); ty++) need.push([tx, ty]);
    if (need.length > 400) return;
    let pending = 0;
    for (const [tx, ty] of need) {
      const pk = MT.packs[`${this.map}/${z}/${this.plane}/${tx >> 3}_${ty >> 3}`];
      const [sx, sy] = this.S(tx * tg, (ty + 1) * tg), sz = tg * this.k;
      if (pk && pk.done) {
        const t = pk.done[tx + '_' + ty];
        if (t && t.img) c.drawImage(t.img, sx, sy, sz + .5, sz + .5);
        else if (t && !t.loading) { t.loading = true; (window.createImageBitmap ? createImageBitmap(t.blob) : new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = URL.createObjectURL(t.blob); })).then(im => { t.img = im; this.draw(); }).catch(() => {}); }
      } else if (!pk || !pk.wait) {
        pending++;
        const p = tilePack(this.map, z, this.plane, tx >> 3, ty >> 3);
        const holder = MT.packs[`${this.map}/${z}/${this.plane}/${tx >> 3}_${ty >> 3}`];
        holder.wait = true; p.then(o => { holder.done = o; this.draw(); });
      }
    }
    // area outlines, then pins (gold dots), then the main pin
    c.lineWidth = 2; c.strokeStyle = '#f2c66d'; c.fillStyle = '#f2c66d22';
    for (const poly of this.polys) { if (poly[0] && poly[0][2] && poly[0][2] !== this.plane) continue; c.beginPath(); poly.forEach((p, i) => { const [a, b] = this.S(p[0] + .5, p[1] + .5); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.closePath(); c.fill(); c.stroke(); }
    if (this.o.lodes && this.k < 6) {
      c.font = '600 11px ' + getComputedStyle(document.body).fontFamily; c.textAlign = 'center';
      for (const [n, lx, ly] of MT.idx.meta.lodestones) { const [a, b] = this.S(lx + .5, ly + .5); if (a < -40 || a > W + 40 || b < -20 || b > H + 20) continue;
        c.fillStyle = '#f5f5f5'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(a, b, 3.5, 0, 7); c.fill(); c.stroke();
        if (this.k >= 0.4) { c.lineWidth = 3; c.strokeText(n.replace(' lodestone', ''), a, b + 14); c.fillText(n.replace(' lodestone', ''), a, b + 14); } }
    }
    if (this.areaLabel) { const [ax, ay, t] = this.areaLabel; const [a, b] = this.S(ax, ay + 1); c.font = '600 13px ' + getComputedStyle(document.body).fontFamily; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(t, a, b - 6); c.fillStyle = '#f2c66d'; c.fillText(t, a, b - 6); }
    let main = null;
    for (const p of this.pins) {
      if (p.main) { main = p; continue; }
      const [a, b] = this.S(p.x + .5, p.y + .5); if (a < -8 || a > W + 8 || b < -8 || b > H + 8) continue;
      c.fillStyle = '#f2c66d'; c.strokeStyle = '#7a1a1a'; c.lineWidth = 2; c.beginPath(); c.arc(a, b, this.onPin ? 5 : 4, 0, 7); c.fill(); c.stroke();
    }
    if (main) {
      const [a, b] = this.S(main.x + .5, main.y + .5), r = 7;
      c.lineWidth = 3; c.strokeStyle = '#ffd700'; c.beginPath(); c.arc(a, b, r * 2.2, 0, 7); c.stroke();
      c.fillStyle = '#c81e1e'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(a, b); c.lineTo(a - r, b - r * 2.2); c.lineTo(a + r, b - r * 2.2); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#d4af37'; c.strokeStyle = '#781414'; c.lineWidth = 3; c.beginPath(); c.arc(a, b - r * 2.3, r * 1.3, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#c81e1e'; c.beginPath(); c.arc(a, b - r * 2.3, r * .45, 0, 7); c.fill();
      if (main.name) {
        const t = main.name.length > 40 ? main.name.slice(0, 39) + '…' : main.name;
        c.font = '600 13px ' + getComputedStyle(document.body).fontFamily; const tw = c.measureText(t).width; const lx = Math.min(Math.max(a, tw / 2 + 8), W - tw / 2 - 8), ly = b - r * 4.4 - 6;
        c.fillStyle = '#121212e6'; c.strokeStyle = '#f2c66d'; c.lineWidth = 1; c.beginPath(); (c.roundRect ? c.roundRect(lx - tw / 2 - 6, ly - 11, tw + 12, 21, 6) : c.rect(lx - tw / 2 - 6, ly - 11, tw + 12, 21)); c.fill(); c.stroke();
        c.fillStyle = '#f2c66d'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, lx, ly); c.textBaseline = 'alphabetic';
      }
    }
    c.fillStyle = '#121212cc'; c.fillRect(0, H - 18, 128, 18); c.fillStyle = '#bdbdbd'; c.font = '11px ' + getComputedStyle(document.body).fontFamily; c.textAlign = 'left';
    c.fillText(`${Math.floor(this.cx)}, ${Math.floor(this.cy)} · floor ${this.plane}`, 6, H - 5);
  }
}
