// Native Calculator:Herblore/Flask decanting: Wiki golden arithmetic, live-price conventions and DOM route.
// NODE_PATH=/workspace/ge-dom-tests/node_modules node tests/flask-decanting.test.cjs
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const C = require('../calculators.js'), prices = require('../live-prices.js');
const D = JSON.parse(fs.readFileSync(path.join(base, 'data/calc/flask-decanting.json'), 'utf8'));
const G = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-flask-decanting-golden.json'), 'utf8'));
const tick = () => new Promise(r => setTimeout(r, 10));

/* ---- source data ---- */
assert.equal(D.path, '/w/Calculator:Herblore/Flask_decanting'); assert.equal(C.nativeFor(D.path).slug, 'flask-decanting');
assert.equal(D.source.pageRevision, 37202169); assert.equal(D.source.rowTemplateRevision, 37202166);
assert.equal(D.rows.length, 86); assert.equal(G.rows.length, 86);
assert.deepEqual(D.columns.map(c => [c.dose, c.vials, c.flasks]), [[1, 6, 1], [2, 3, 1], [3, 4, 2], [4, 3, 2]]);
for (const c of D.columns) assert.equal(c.dose * c.vials, 6 * c.flasks, 'doses conserved: six-dose flasks');
const ids = new Set([D.flask.id]);
D.rows.forEach((r, i) => {
  assert.equal(G.rows[i].flask, r.flask, 'row order matches Wiki rendering');
  assert.equal(r.f6.n, r.flask + ' (6)');
  for (const d of [1, 2, 3, 4]) assert.equal(r['v' + d].n, `${r.vial} (${d})`);
  for (const it of [r.f6, r.v1, r.v2, r.v3, r.v4]) { assert.ok(Number.isSafeInteger(it.id) && it.id > 0); assert.ok(!ids.has(it.id), 'unique id ' + it.n); ids.add(it.id); }
});
assert.equal(D.flask.n, 'Potion flask'); assert.equal(D.flask.id, 23191);

/* ---- Wiki golden: every one of the 344 cells, same guide-price revision the Wiki rendered with ---- */
let cells = 0;
D.rows.forEach((r, i) => D.columns.forEach((c, j) => { assert.equal(C.guideProfit(C.flaskModel(D, r, c), n => G.guide[n]), G.rows[i].values[j], `${r.flask} ${c.key}`); cells++; }));
assert.equal(cells, 344);
// hand-checked example (Agility flask, 3 (4)s): 2 x flask(6) - 3 x potion(4) - 2 x Potion flask
{ const g = G.guide; assert.equal(2 * g['Agility flask (6)'] - 3 * g['Agility potion (4)'] - 2 * g['Potion flask'], G.rows[1].values[3]); }

/* ---- live conventions: buy high, sell low, per-flask floor tax, missing/stale never 0 ---- */
const now = 1_800_000_000_000, t = now / 1000 - 60;
function book(over = {}) {
  const b = new prices.PriceBook();
  const r = D.rows[1];
  b.setMapping([D.flask, r.f6, r.v1, r.v2, r.v3, r.v4].map(x => ({id: x.id, name: x.n})));
  const row = (high, low, time = t) => ({high, low, highTime: time, lowTime: time});
  b.setLatest({data: {[D.flask.id]: row(15000, 14000), [r.f6.id]: row(30000, 29999), [r.v1.id]: row(1000, 900), [r.v2.id]: row(2000, 1900), [r.v3.id]: row(3000, 2900), [r.v4.id]: row(4000, 3900), ...over}}, now);
  return b;
}
{
  const b = book(), r = D.rows[1];
  const e = D.columns.map(c => b.estimate(C.flaskModel(D, r, c), now));
  assert.ok(e.every(x => x.complete));
  assert.deepEqual([e[0].cost, e[0].revenue, e[0].tax], [6 * 1000 + 15000, 29999, Math.floor(29999 / 50)]);
  assert.equal(e[0].grossProfit, 29999 - 21000); assert.equal(e[0].profit, 29999 - 599 - 21000);
  assert.deepEqual([e[2].cost, e[2].revenue, e[2].tax], [4 * 3000 + 2 * 15000, 2 * 29999, 2 * 599], 'tax floored per flask, then x2');
  assert.deepEqual([e[3].cost, e[3].revenue], [3 * 4000 + 2 * 15000, 59998]);
  assert.equal(e[1].cost, 3 * 2000 + 15000);
  // sell price below 50 gp: no tax
  const low = book({[r.f6.id]: {high: 60, low: 49, highTime: t, lowTime: t}}).estimate(C.flaskModel(D, r, D.columns[0]), now);
  assert.equal(low.tax, 0); assert.equal(low.profit, low.grossProfit);
  // missing / stale / offline -> unavailable, not zero
  const miss = book({[D.flask.id]: {high: null, low: 14000, highTime: null, lowTime: t}}).estimate(C.flaskModel(D, r, D.columns[0]), now);
  assert.equal(miss.complete, false); assert.equal(miss.profit, null); assert.deepEqual(miss.missing, ['Potion flask']);
  const stale = book({[r.v1.id]: {high: 1000, low: 900, highTime: t - 3600, lowTime: t}}).estimate(C.flaskModel(D, r, D.columns[0]), now);
  assert.equal(stale.complete, false); assert.equal(stale.profit, null);
  const off = book(); off.online = false; assert.equal(off.estimate(C.flaskModel(D, r, D.columns[0]), now).profit, null);
  // exact IDs, not names: an ambiguous duplicate name does not change the result
  const amb = book(); amb.setMapping([...amb.mapping.values()].map(x => ({id: x.id, name: x.name})).concat([{id: 999999, name: r.v1.n}]));
  assert.equal(amb.resolve(r.v1.n), null); assert.equal(amb.estimate(C.flaskModel(D, r, D.columns[0]), now).complete, true);
}

/* ---- DOM ---- */
async function screen(hash, store = {}, feed = 'full') {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), {url: 'http://127.0.0.1:8777/index.html#' + hash, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, errors = [];
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
  w.scrollTo = () => {}; w.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  Object.defineProperty(w.navigator, 'serviceWorker', {value: {register() { return Promise.resolve(); }}});
  w.AbortController = AbortController; w.TextEncoder = TextEncoder;
  const items = [D.flask, ...D.rows.flatMap(r => [r.f6, r.v1, r.v2, r.v3, r.v4])];
  w.fetch = async url => {
    url = String(url);
    if (url.startsWith(prices.BASE)) {
      if (feed === 'hang') return new Promise(() => {});
      const ts = Date.now() / 1000 - 30;
      if (url.endsWith('/mapping')) return {ok: true, json: async () => items.map(x => ({id: x.id, name: x.n}))};
      const data = {}; for (const x of items) data[x.id] = {high: 1000, low: 900, highTime: ts, lowTime: ts};
      for (const r of D.rows) data[r.f6.id] = {high: 30000, low: 29000, highTime: ts, lowTime: ts};
      if (feed === 'noflask') delete data[D.flask.id];
      return {ok: true, json: async () => ({data})};
    }
    try { return {ok: true, json: async () => JSON.parse(fs.readFileSync(path.resolve(base, url.split('?')[0]), 'utf8'))}; }
    catch { return {ok: false, status: 404, json: async () => ({})}; }
  };
  w.addEventListener('error', e => errors.push(e.error));
  for (const f of ['live-prices.js', 'calculators.js', 'map.js']) w.eval(fs.readFileSync(path.join(base, f), 'utf8'));
  // Same hook as live-price-dom.test.cjs: expose the app's own book and registered refresh callback to the test.
  w.eval(fs.readFileSync(path.join(base, 'app.js'), 'utf8') + '\nwindow.__t = {book: LIVE.book, refresh: refreshPriceView};');
  for (let i = 0; i < (feed === 'hang' ? 30 : 200); i++) { await tick(); if (w.document.querySelector('#live-price-status')?.textContent.includes('Last successful') && w.document.querySelector('#fd-table table')) break; }
  await tick();
  assert.deepEqual(errors, [], hash + ' runtime errors');
  return {dom, w, d: w.document};
}
(async () => {
  let {dom, w, d} = await screen('calculators/flask-decanting', {mystats_v2: '{"Attack":99}'});
  assert.equal(d.querySelector('.tabs button.on').dataset.tab, 'calculators');
  assert.ok(d.querySelector('.live-price-banner'), 'shared live-price banner and status');
  assert.equal(d.querySelectorAll('#view iframe').length, 0);
  assert.equal(d.querySelectorAll('#fd-table tbody tr').length, 86);
  assert.deepEqual([...d.querySelectorAll('#fd-table thead th')].map(t => t.textContent), ['Flask', ...D.columns.map(c => c.label)]);
  // first row Aggression: net for 6 (1)s = 29000 - floor(29000/50) - 6*1000 - 1000
  const firstCells = [...d.querySelectorAll('#fd-table tbody tr')[0].querySelectorAll('td')];
  assert.match(firstCells[0].textContent, new RegExp((29000 - 580 - 7000).toLocaleString()));
  assert.match(firstCells[0].textContent, /gross 22,000 gp · tax 580 gp/);
  assert.match(firstCells[2].textContent, new RegExp((58000 - 1160 - 6000).toLocaleString()));
  d.querySelector('#fd-show').value = 'gross'; d.querySelector('#fd-show').dispatchEvent(new w.Event('change'));
  assert.match(d.querySelectorAll('#fd-table tbody tr')[0].querySelector('td').textContent, /^22,000 gp/);
  const q = d.querySelector('#fd-q'); q.value = 'super restore'; q.dispatchEvent(new w.Event('input'));
  assert.equal(d.querySelectorAll('#fd-table tbody tr').length, 1); assert.match(d.querySelector('#fd-count').textContent, /^1 of 86/);
  q.value = ''; q.dispatchEvent(new w.Event('input'));
  const det = d.querySelector('#fd-table details'); det.open = true; w.__redraw = null;
  assert.match(det.textContent, /Aggression flask \(6\) — Sell 29,000 gp · est\. tax 580 gp · net 28,420 gp/); assert.match(det.textContent, /Potion flask — Buy 1,000 gp/);
  // favourite from the native page, independent key, stats untouched
  const star = d.querySelector('#fd-star'); assert.equal(star.getAttribute('aria-pressed'), 'false'); star.click();
  assert.equal(star.getAttribute('aria-pressed'), 'true'); assert.deepEqual(JSON.parse(w.localStorage.getItem(C.FAV_KEY)).map(f => f.path), [D.path]);
  assert.equal(w.localStorage.getItem('mystats_v2'), '{"Attack":99}');
  for (const a of d.querySelectorAll('#view a[target="_blank"]')) assert.equal(a.rel, 'noopener noreferrer');
  const favs = w.localStorage.getItem(C.FAV_KEY); dom.window.close();
  // directory: exact native mapping, favourites reopen in app, everything else Wiki-only
  ({dom, w, d} = await screen('calculators', {[C.FAV_KEY]: favs}));
  // running native coverage: Flask decanting + Herblore (tests/CALCULATOR_COVERAGE.md); Flask decanting's link is unchanged
  const nat = [...d.querySelectorAll('#calc-native a.calc-card-main')]; assert.equal(nat.length, C.NATIVE.length); assert.equal(C.NATIVE.length, 2);
  const fdLink = nat.find(a => a.getAttribute('href') === '#calculators/flask-decanting'); assert.ok(fdLink);
  assert.ok(fdLink.closest('li').textContent.includes('Decanting flasks for profit'));
  assert.equal(d.querySelectorAll('#calc-native .calc-card').length, 2); assert.ok(!nat.some(a => a.target));
  assert.ok(d.querySelectorAll('#calc-upcoming .calc-item').length > 100); assert.equal(d.querySelectorAll('#calc-upcoming .calc-in-app').length, 0);
  assert.equal(d.querySelector('#calc-fav-list a.calc-open').getAttribute('href'), '#calculators/flask-decanting');
  dom.window.close();
  // missing empty-flask price: every result unavailable, never 0
  ({dom, w, d} = await screen('calculators/flask-decanting', {}, 'noflask'));
  assert.match(d.querySelector('#fd-flask').textContent, /unavailable/);
  const tds = [...d.querySelectorAll('#fd-table tbody td')]; assert.equal(tds.length, 344);
  assert.ok(tds.every(td => /^Unavailable/.test(td.textContent) && /Potion flask/.test(td.textContent)));
  assert.ok(!tds.some(td => /\b0 gp/.test(td.textContent)));
  dom.window.close();
  // "Prices used" stays open across the registered live-price refresh (bindPriceView -> LIVE.subscribe(refreshPriceView) -> priceDraws), filter and sort
  ({dom, w, d} = await screen('calculators/flask-decanting'));
  { const SA = D.rows.find(r => r.flask === 'Super antifire flask');
    const det = () => d.querySelector('#fd-table details[data-flask="Super antifire flask"]');
    det().open = true;
    assert.match(det().textContent, /Super antifire flask \(6\) — Sell 29,000 gp/);
    const ts = Date.now() / 1000 - 5, data = JSON.parse(JSON.stringify(w.__t.book.data));
    data[SA.f6.id] = {high: 46000, low: 45221, highTime: ts, lowTime: ts};
    w.__t.book.setLatest({data}, Date.now());
    w.__t.refresh();
    assert.ok(det() && det().open, 'details still open after price refresh (table was rebuilt)');
    assert.match(det().textContent, /Super antifire flask \(6\) — Sell 45,221 gp · est\. tax 904 gp · net 44,317 gp/, 'updated quote shown');
    const q = d.querySelector('#fd-q'); q.value = 'antifire'; q.dispatchEvent(new w.Event('input'));
    assert.match(d.querySelector('#fd-count').textContent, /^2 of 86/); assert.ok(det().open, 'open after filter');
    const so = d.querySelector('#fd-sort'); so.value = 'd3'; so.dispatchEvent(new w.Event('change'));
    assert.ok(det().open, 'open after sort');
    assert.equal(d.querySelectorAll('#fd-table details[open]').length, 1, 'only the opened row is open'); }
  dom.window.close();
  // before the price list arrives: 'loading', not 'not found', and never 0
  ({dom, w, d} = await screen('calculators/flask-decanting', {}, 'hang'));
  { const cells = [...d.querySelectorAll('#fd-table tbody td')]; assert.equal(cells.length, 344);
    assert.ok(cells.every(td => /^Unavailable/.test(td.textContent) && /live prices loading/.test(td.textContent) && !/not found/.test(td.textContent)));
    assert.match(d.querySelector('#fd-flask').textContent, /live prices loading/); }
  dom.window.close();
  // unknown native slug falls back to the directory
  ({dom, w, d} = await screen('calculators/not-a-calc'));
  for (let i = 0; i < 50 && w.location.hash !== '#calculators'; i++) await tick();
  assert.equal(w.location.hash, '#calculators'); dom.window.close();
  console.log('PASS flask decanting: 344/344 Wiki golden cells, dose conservation, exact IDs, buy-high/sell-low, per-flask floor tax, <50 gp, missing/stale/offline unavailable, DOM route, favourites, directory mapping');
})().catch(e => { console.error(e); process.exit(1); });
