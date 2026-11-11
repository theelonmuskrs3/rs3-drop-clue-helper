// Money tab: every method is listed by default (no hidden "no profit" methods), with truthful profit / loss / no-figure labels.
// A) The 134 methods hidden before (11 Nov 2026 capture): on the Wiki's own GE prices ("GE guide (as the Wiki)") each one shows
//    the profit/hr its Wiki guide page renders (fixture: page, revision, figure); methods without a complete formula show that
//    page figure, labelled. Losses stay losses.
// B) DOM: count line sums to 878 (profit + loss + break even + no single figure); "Only profitable" is opt-in; profit sort puts
//    losses after profits and no-figure methods last; the Prices choice persists.
// NODE_PATH=/workspace/ge-dom-tests/node_modules node tests/money-show-all.test.cjs
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), vm = require('node:vm');
const base = path.resolve(__dirname, '..'), P = require('../live-prices.js');
const app = fs.readFileSync(path.join(base, 'app.js'), 'utf8');
const extract = (a, b) => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a)));
const X = JSON.parse(fs.readFileSync(path.join(base, 'data/money.json'))), F = require('./fixtures-money-hidden.json');
const models = {}; for (let i = 0; i < X.stats.shards; i++) for (const p of JSON.parse(fs.readFileSync(path.join(base, `data/mm/${i}.json`))).p) for (const m of p.m) models[m.id] = m;
const names = Object.keys(F.guide), TS = '2026-11-11T07:14:05Z', now = Date.now() / 1000;
const mapping = names.map((n, i) => ({id: i + 1, name: n})), guide = {}; names.forEach((n, i) => { guide[i + 1] = {price: F.guide[n], timestamp: TS}; });
assert.equal(F.methods.length, 134); assert.equal(new Set(F.methods.map(m => m.id)).size, 134);
// A) every previously hidden method, Wiki basis
{ const b = new P.PriceBook(); b.setMapping(mapping); b.setLatest({data: {}}, Date.now());
  const c = {LIVE: {book: b}, RS3Prices: P, GUIDE: {prices: guide}, fdAge: t => '', MM: {models, src: 'guide'}, Number, Date, Math, Map, Set, Object, String, Infinity, Array};
  vm.createContext(c); vm.runInContext(extract('let MM_LC = null;', 'async function mmLoadModels') + ';this.MM_WIKI_RENDER=MM_WIKI_RENDER;', c); c.MM_GE = 'Oct 21, 2026';
  const rows = new Map(X.rows.map(r => [r.id, r])); let eq = 0, near = 0, est = 0, page = 0;
  for (const m of F.methods) {
    const e = c.mmLive(rows.get(m.id)); assert.ok(e.value != null, m.id + ' has a figure');
    assert.equal(Math.sign(Math.round(e.value)), Math.sign(m.wiki), m.id + ': same sign as the Wiki page (a loss stays a loss)');
    const d = Math.abs(e.value - m.wiki);
    if (d <= Math.max(2, Math.abs(m.wiki) * 0.005)) eq++; else { assert.ok(m.note && d <= Math.abs(m.wiki) * 0.04, `${m.id}: ${Math.round(e.value)} vs Wiki page ${m.wiki}`); near++; }
    if (e.basis === 'est') est++; else { assert.equal(e.basis, 'wiki'); page++; assert.deepEqual([...c.MM_WIKI_RENDER[m.id]], [m.wiki, m.rev], m.id + ': page figure + revision'); assert.match(e.wiki.label, /^Wiki page figure, GE prices Nov 11, 2026, after tax$/); }
  }
  assert.equal(eq + near, 134); assert.equal(near, 2);
  const pos = F.methods.filter(m => m.wiki > 0).length;
  console.log(`A: 134 previously hidden methods: ${eq} equal their Wiki page figure, ${near} within 4% (noted); ${est} by Wiki formula on Wiki GE prices, ${page} by Wiki page figure; per the Wiki ${pos} profit, ${134 - pos} loss`);
}
// B) DOM semantics
(async () => {
  const {JSDOM} = require('jsdom');
  const tick = () => new Promise(r => setTimeout(r, 10));
  const store = {};
  async function screen() {
    const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), {url: 'http://127.0.0.1:8809/index.html#money', runScripts: 'outside-only', pretendToBeVisual: true});
    const w = dom.window, errors = [];
    w.scrollTo = () => {}; w.matchMedia = () => ({matches: false, addEventListener(){}, removeEventListener(){}});
    Object.defineProperty(w.navigator, 'serviceWorker', {value: {register(){ return Promise.resolve(); }}});
    for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
    w.AbortController = AbortController; w.TextEncoder = TextEncoder; w.RS3Prices = P;
    const latest = {}; mapping.forEach(m => { latest[m.id] = {high: F.guide[m.name], low: F.guide[m.name], highTime: now - 60, lowTime: now - 60}; });
    let guideCalls = 0;
    w.fetch = async url => { url = String(url);
      if (url.startsWith(P.BASE)) return {ok: true, json: async () => url.endsWith('/mapping') ? mapping : {data: latest}};
      if (url.includes('api.weirdgloop.org')) { guideCalls++; const ids = decodeURIComponent(url.split('id=')[1]).split('|'); const o = {}; for (const i of ids) if (guide[i]) o[i] = {id: i, ...guide[i]}; return {ok: true, json: async () => o}; }
      const rel = url.split('?')[0]; try { return {ok: true, json: async () => JSON.parse(fs.readFileSync(path.resolve(base, rel), 'utf8'))}; } catch { return {ok: false, status: 404, json: async () => ({})}; } };
    w.addEventListener('error', e => errors.push(e.error));
    for (const f of ['live-prices.js', 'map.js', 'calculators.js']) w.eval(fs.readFileSync(path.join(base, f), 'utf8'));
    w.eval(fs.readFileSync(path.join(base, 'app.js'), 'utf8') + '\nwindow.__t={MM,mmLive};');
    for (let i = 0; i < 600; i++) { await tick(); const t = w.document.querySelector('#mmcount'); if (t && /profit/.test(t.textContent) && w.__t.MM.calc && [...w.__t.MM.calc.values()].some(e => e.basis === 'est')) break; }
    assert.deepEqual(errors, []);
    return {dom, w, d: w.document, gc: () => guideCalls};
  }
  const kinds = t => { const m = t.match(/(\d[\d,]*) of (\d[\d,]*) methods · all 878: (\d+) profit, (\d+) loss(?:, (\d+) break even)?, (\d+) no single figure/); assert.ok(m, t); return m.slice(1).map(x => +String(x || 0).replace(/,/g, '')); };
  let {dom, w, d, gc} = await screen();
  let [shown, all, pos, neg, zero, none] = kinds(d.querySelector('#mmcount').textContent);
  assert.equal(all, 878); assert.equal(shown, 878, 'every method listed by default'); assert.equal(pos + neg + zero + none, 878);
  assert.ok(neg > 0 && none === 2, 'losses and the 2 no-figure methods are listed, not hidden');
  assert.equal(d.querySelector('#mmc button.on .cnt').textContent, '878', 'All category counts every method');
  assert.ok(!/hidden/.test(d.querySelector('#mmcount').textContent));
  // sort: profit desc, then losses, then no single figure; all 878 rendered when paged out
  for (let b; (b = d.querySelector('#mmmore'));) b.click();
  const vals = [...d.querySelectorAll('.mmcard')].map(c => w.__t.mmLive(w.__t.MM.idx.rows.find(r => r.id === c.dataset.id)).value);
  assert.equal(vals.length, 878);
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] == null || (vals[i - 1] != null && vals[i - 1] >= vals[i]), 'sorted at ' + i);
  const ids = new Set([...d.querySelectorAll('.mmcard')].map(c => c.dataset.id)); for (const m of F.methods) assert.ok(ids.has(m.id), m.id + ' listed');
  const lossCard = [...d.querySelectorAll('.mmcard')].find(c => c.querySelector('.mmp.mmneg')); assert.match(lossCard.textContent, /−[\d,]+ gp.*loss/);
  assert.ok([...d.querySelectorAll('.mmcard .mmnone')].length === 2);
  // Only profitable: opt-in
  d.querySelector('#mmf button[data-v="hl"]').click();
  [shown] = kinds(d.querySelector('#mmcount').textContent); assert.equal(shown, pos);
  assert.ok(![...d.querySelectorAll('.mmcard')].some(c => c.querySelector('.mmneg, .mmnone')));
  d.querySelector('#mmf button[data-v="hl"]').click(); assert.equal(kinds(d.querySelector('#mmcount').textContent)[0], 878);
  // Prices: GE guide (as the Wiki) — every previously hidden method equals its Wiki page sign; persists across reload
  const sel = d.querySelector('#mmsrc'); sel.value = 'guide'; sel.dispatchEvent(new w.Event('change'));
  for (let i = 0; i < 300 && (gc() < 1 || /loading GE guide/.test(d.querySelector('#mmcount').textContent)); i++) await tick();
  for (const m of F.methods) assert.equal(Math.sign(Math.round(w.__t.mmLive(w.__t.MM.idx.rows.find(r => r.id === m.id)).value)), Math.sign(m.wiki), 'guide mode ' + m.id);
  const gk = kinds(d.querySelector('#mmcount').textContent); assert.equal(gk[2] + gk[3] + gk[4] + gk[5], 878);
  assert.ok([...d.querySelectorAll('.mmcard .price-age')].some(x => /^GE guide prices \(as the Wiki\), /.test(x.textContent)), 'guide-mode estimates labelled');
  store.dch_mm_price_src_v1 = w.localStorage.getItem('dch_mm_price_src_v1'); assert.equal(store.dch_mm_price_src_v1, 'guide');
  dom.window.close();
  ({dom, w, d} = await screen()); assert.equal(d.querySelector('#mmsrc').value, 'guide'); dom.window.close();
  console.log(`B: default lists 878/878 (${pos} profit, ${neg} loss, ${zero} break even, ${none} no single figure on the fixture prices); Only profitable -> ${pos}; sort profit > loss > none; GE guide mode ${gk.slice(2).join('/')} and persists`);
})().catch(e => { console.error(e); process.exit(1); });
