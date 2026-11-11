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
      // 'stale'/'varied': every trade 11 hours old (as most RS3 flask trades are), the normal case on the live API
      const ts = Date.now() / 1000 - (feed === 'stale' || feed === 'varied' ? 11 * 3600 : 30);
      if (url.endsWith('/mapping')) return {ok: true, json: async () => items.map(x => ({id: x.id, name: x.n}))};
      const data = {}; for (const x of items) data[x.id] = {high: 1000, low: 900, highTime: ts, lowTime: ts};
      for (const r of D.rows) data[r.f6.id] = {high: 30000, low: 29000, highTime: ts, lowTime: ts};
      if (feed === 'varied') for (const x of items) { const hi = 37 + (x.id * 7919) % 40000; data[x.id] = {high: hi, low: Math.max(1, hi - (x.id % 113)), highTime: ts - (x.id % 50) * 3600, lowTime: ts - (x.id % 7) * 3600}; }
      if (feed === 'noflask') delete data[D.flask.id];
      if (feed === 'partial') delete data[D.rows[0].v1.id];
      return {ok: true, json: async () => ({data})};
    }
    try { return {ok: true, json: async () => JSON.parse(fs.readFileSync(path.resolve(base, url.split('?')[0]), 'utf8'))}; }
    catch { return {ok: false, status: 404, json: async () => ({})}; }
  };
  w.addEventListener('error', e => errors.push(e.error));
  for (const f of ['live-prices.js', 'calculators.js', 'map.js']) w.eval(fs.readFileSync(path.join(base, f), 'utf8'));
  // Same hook as live-price-dom.test.cjs: expose the app's own book and registered refresh callback to the test.
  w.eval(fs.readFileSync(path.join(base, 'app.js'), 'utf8') + '\nwindow.__t = {book: LIVE.book, refresh: refreshPriceView, quoteContents};');
  for (let i = 0; i < (feed === 'hang' ? 30 : 200); i++) { await tick(); if (w.document.querySelector('#live-price-status')?.textContent.includes('Last successful') && w.document.querySelector('#fd-table table')) break; }
  await tick();
  assert.deepEqual(errors, [], hash + ' runtime errors');
  return {dom, w, d: w.document};
}
const cellsOf = d => [...d.querySelectorAll('#fd-table tbody tr:not(.fd-detail)')].map(tr => [...tr.querySelectorAll('td')]);
const val = td => { const t = td.textContent.trim(); return t === '—' ? null : (t.startsWith('−') ? -1 : 1) * Number(t.replace(/[−,]/g, '')); };
(async () => {
  let {dom, w, d} = await screen('calculators/flask-decanting', {mystats_v2: '{"Attack":99}'});
  assert.equal(d.querySelector('.tabs button.on').dataset.tab, 'calculators');
  assert.ok(d.querySelector('.live-price-banner'), 'shared live-price banner and status');
  assert.equal(d.querySelectorAll('#view iframe').length, 0);
  // one compact Wiki-style table at every width: never turned into phone cards, scrolls inside its own box
  const tb = d.querySelector('#fd-table table'); assert.ok(tb.classList.contains('fd-wtable')); assert.ok(!tb.classList.contains('rtable'), 'not a phone-card table');
  assert.ok(d.querySelector('#fd-table').classList.contains('fd-scroll'));
  { const css = fs.readFileSync(path.join(base, 'neon.css'), 'utf8'); assert.match(css, /\.fd-scroll\{overflow-x:auto/); assert.match(css, /\.fd-wtable\{[^}]*min-width:600px/); }
  assert.equal(cellsOf(d).length, 86);
  assert.deepEqual([...d.querySelectorAll('#fd-table thead th')].map(t => t.textContent.replace(/[⇅▲▼]/g, '')), ['Flask', ...D.columns.map(c => c.label)]);
  assert.equal(d.querySelectorAll('#fd-table thead button.fd-sort').length, 5, 'every column header sorts');
  assert.ok([...d.querySelectorAll('#fd-table tbody tr th button.fd-name')].every(b => b.querySelector('img.calc-ico[src^="icons/"]')), 'potion picture + name first column');
  assert.equal(d.querySelectorAll('.calc-unavail').length, 0, 'no Unavailable panels'); assert.doesNotMatch(d.querySelector('#fd-table').textContent, /Unavailable/);
  // every one of the 344 cells is a number from the same prices: net = flasks x (sell - floor(sell/50)) - vials x buy - flasks x flask buy
  const exp = (c, sell, vial, fl, gross) => c.flasks * sell - c.vials * vial - c.flasks * fl - (gross ? 0 : c.flasks * Math.floor(sell / 50));
  { const cs = cellsOf(d); let n = 0; cs.forEach(r => r.forEach((td, i) => { assert.equal(val(td), exp(D.columns[i], 29000, 1000, 1000)); n++; })); assert.equal(n, 344); }
  assert.equal(cellsOf(d)[0][0].textContent, '21,420'); assert.equal(cellsOf(d)[0][2].textContent, '50,840');
  assert.match(cellsOf(d)[0][0].title, /Gross 22,000 gp · tax 580 gp · net 21,420 gp/);
  { const s = d.querySelector('#fd-show'); assert.deepEqual([...s.options].map(o => o.textContent), ['Net profit', 'Gross profit']); assert.equal(s.getAttribute('aria-describedby'), 'fd-show-help'); assert.equal(d.querySelector('#fd-show-help').textContent, 'Net profit: after the estimated 2% Grand Exchange tax. Gross profit: before tax.'); }
  d.querySelector('#fd-show').value = 'gross'; d.querySelector('#fd-show').dispatchEvent(new w.Event('change'));
  assert.equal(cellsOf(d)[0][0].textContent, '22,000'); assert.match(d.querySelector('#fd-count').textContent, /gross profit \(before tax\)/);
  d.querySelector('#fd-show').value = 'net'; d.querySelector('#fd-show').dispatchEvent(new w.Event('change'));
  const q = d.querySelector('#fd-q'); q.value = 'super restore'; q.dispatchEvent(new w.Event('input'));
  assert.equal(cellsOf(d).length, 1); assert.match(d.querySelector('#fd-count').textContent, /^1 of 86/);
  q.value = ''; q.dispatchEvent(new w.Event('input'));
  // tap a potion name: one compact row with the prices used and their trade times
  d.querySelector('#fd-table button.fd-name').click();
  { const det = d.querySelector('#fd-table tr.fd-detail'); assert.ok(det); assert.equal(d.querySelector('#fd-table button.fd-name').getAttribute('aria-expanded'), 'true');
    assert.match(det.textContent, /Sell 1 × Aggression flask \(6\): 29,000 gp \(est\. tax 580 gp each\)/); assert.match(det.textContent, /Buy 1 × Potion flask: 1,000 gp/); assert.match(det.textContent, /min ago/); }
  d.querySelector('#fd-table button.fd-name').click(); assert.equal(d.querySelectorAll('#fd-table tr.fd-detail').length, 0);
  // favourite from the native page, independent key, stats untouched
  const star = d.querySelector('#fd-star'); assert.equal(star.getAttribute('aria-pressed'), 'false'); star.click();
  assert.equal(star.getAttribute('aria-pressed'), 'true'); assert.deepEqual(JSON.parse(w.localStorage.getItem(C.FAV_KEY)).map(f => f.path), [D.path]);
  assert.equal(w.localStorage.getItem('mystats_v2'), '{"Attack":99}');
  for (const a of d.querySelectorAll('#view a[target="_blank"]')) assert.equal(a.rel, 'noopener noreferrer');
  const favs = w.localStorage.getItem(C.FAV_KEY); dom.window.close();
  // decanting-only (owner decision 2026-11-11): #calculators is this calculator; its favourite survives the stale-favourite prune
  ({dom, w, d} = await screen('calculators', {[C.FAV_KEY]: favs}));
  for (let i = 0; i < 50 && !d.querySelector('#fd-table tbody tr'); i++) await tick();
  assert.equal(w.location.hash, '#calculators/flask-decanting'); assert.deepEqual(C.NATIVE.map(n => n.slug), ['flask-decanting']);
  assert.equal(cellsOf(d).length, 86); assert.equal(d.querySelector('#view a[href="#calculators"]'), null, 'no "All calculators" link');
  assert.equal(d.querySelectorAll('#calc-native, #calc-upcoming').length, 0); assert.equal(d.querySelector('#fd-star').getAttribute('aria-pressed'), 'true');
  assert.equal(w.localStorage.getItem(C.FAV_KEY), favs);
  dom.window.close();
  // THE USER'S CASE: every trade 11 hours old (normal on the live API). Same as the Items tab: the prices are shown with their
  // age, not rejected, so all 344 cells are numbers; the Items tab's own quote for the same item shows the same price.
  ({dom, w, d} = await screen('calculators/flask-decanting', {}, 'stale'));
  { let n = 0; cellsOf(d).forEach(r => r.forEach((td, i) => { assert.equal(val(td), exp(D.columns[i], 29000, 1000, 1000)); n++; })); assert.equal(n, 344, '344 numeric cells with 11-hour-old prices');
    assert.doesNotMatch(d.querySelector('#fd-table').textContent, /Unavailable|stale/i);
    assert.match(d.querySelector('#fd-flask').textContent, /Empty potion flask: Buy 1,000 gp \(last trade 11 h ago\)/);
    assert.match(cellsOf(d)[0][0].title, /oldest price 11 h ago/);
    const r0 = D.rows[0]; assert.match(w.__t.quoteContents(r0.f6.n, 'sell'), /Sell 29,000 gp · stale/, 'Items tab shows this same 11-hour-old quote'); }
  dom.window.close();
  // varied prices per item and trade times hours/days old: every cell equals the formula on the Items tab's quote values
  ({dom, w, d} = await screen('calculators/flask-decanting', {}, 'varied'));
  { const book = w.__t.book, P = (it, side) => book.quote(it.id, side).value; let n = 0;
    const rows = cellsOf(d), names = [...d.querySelectorAll('#fd-table tbody button.fd-name')].map(b => b.dataset.flask);
    names.forEach((f, ri) => { const r = D.rows.find(x => x.flask === f); D.columns.forEach((c, i) => {
      const sell = P(r.f6, 'sell'), e = c.flasks * (sell - Math.floor(sell / 50)) - c.vials * P(r['v' + c.dose], 'buy') - c.flasks * P(D.flask, 'buy');
      assert.equal(val(rows[ri][i]), e, f + ' ' + c.key); n++; }); });
    assert.equal(n, 344);
    // header sort: best first, then lowest first, then back to potion name; ties/unknown last
    const col = 2, sb = () => d.querySelectorAll('#fd-table thead button.fd-sort')[col + 1];
    sb().click(); let v = cellsOf(d).map(r => val(r[col])); assert.deepEqual(v, [...v].sort((a, b) => b - a)); assert.equal(d.querySelectorAll('#fd-table thead th')[col + 1].getAttribute('aria-sort'), 'descending');
    sb().click(); v = cellsOf(d).map(r => val(r[col])); assert.deepEqual(v, [...v].sort((a, b) => a - b)); assert.equal(d.querySelectorAll('#fd-table thead th')[col + 1].getAttribute('aria-sort'), 'ascending');
    assert.deepEqual(JSON.parse(w.localStorage.getItem('dch_calc_fd_sort_v1')), {k: D.columns[col].key, d: 'asc'});
    d.querySelectorAll('#fd-table thead button.fd-sort')[0].click(); const nm = [...d.querySelectorAll('#fd-table tbody button.fd-name')].map(b => b.dataset.flask);
    assert.deepEqual(nm, [...nm].sort((a, b) => a.localeCompare(b))); }
  dom.window.close();
  // a refresh keeps an opened price row open and shows the new quote
  ({dom, w, d} = await screen('calculators/flask-decanting'));
  { const SA = D.rows.find(r => r.flask === 'Super antifire flask');
    [...d.querySelectorAll('#fd-table button.fd-name')].find(b => b.dataset.flask === SA.flask).click();
    const ts = Date.now() / 1000 - 5, data = JSON.parse(JSON.stringify(w.__t.book.data));
    data[SA.f6.id] = {high: 46000, low: 45221, highTime: ts, lowTime: ts};
    w.__t.book.setLatest({data}, Date.now()); w.__t.refresh();
    const det = d.querySelector('#fd-table tr.fd-detail'); assert.ok(det, 'still open after price refresh');
    assert.match(det.textContent, /Sell 1 × Super antifire flask \(6\): 45,221 gp \(est\. tax 904 gp each\)/, 'updated quote shown'); }
  dom.window.close();
  // an item with no recorded trade price: only the cells that need it are unknown (—), never 0; others stay numbers
  ({dom, w, d} = await screen('calculators/flask-decanting', {}, 'partial'));
  { const rows = cellsOf(d), i0 = [...d.querySelectorAll('#fd-table tbody button.fd-name')].findIndex(b => b.dataset.flask === D.rows[0].flask);
    assert.equal(rows[i0][0].textContent, '—'); assert.match(rows[i0][0].title, /No recorded trade price: Aggression potion \(1\)/);
    assert.ok(rows[i0].slice(1).every(td => val(td) != null)); assert.equal(rows.flat().filter(td => td.textContent === '—').length, 1); }
  dom.window.close();
  // missing empty-flask price: every result unknown (—), never 0, one short line instead of repeated panels
  ({dom, w, d} = await screen('calculators/flask-decanting', {}, 'noflask'));
  assert.match(d.querySelector('#fd-flask').textContent, /Empty potion flask: no recorded trade price yet/);
  { const tds = cellsOf(d).flat(); assert.equal(tds.length, 344); assert.ok(tds.every(td => td.textContent === '—' && /Potion flask/.test(td.title))); }
  dom.window.close();
  // before the price list arrives: unknown (—), never 0
  ({dom, w, d} = await screen('calculators/flask-decanting', {}, 'hang'));
  { const tds = cellsOf(d).flat(); assert.equal(tds.length, 344); assert.ok(tds.every(td => td.textContent === '—')); assert.match(d.querySelector('#fd-flask').textContent, /Loading prices/); }
  dom.window.close();
  // unknown slug goes to Flask decanting (the only calculator)
  ({dom, w, d} = await screen('calculators/not-a-calc'));
  for (let i = 0; i < 50 && !d.querySelector('#fd-title'); i++) await tick();
  assert.equal(w.location.hash, '#calculators/flask-decanting'); assert.ok(d.querySelector('#fd-title')); dom.window.close();
  console.log('PASS flask decanting: 344/344 Wiki golden cells, dose conservation, exact IDs, per-flask floor tax; screen: Items-tab prices incl. 11-hour-old trades -> 344/344 numeric cells (fresh, stale, varied), partial/no-flask/loading unknown (—) never 0, Wiki-style table (no phone cards), header sort, price rows, net/gross, favourites, decanting-only #calculators');
})().catch(e => { console.error(e); process.exit(1); });
