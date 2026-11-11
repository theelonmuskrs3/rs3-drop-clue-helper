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
// GE guide price mock (api.weirdgloop.org/exchange): GUIDE_MOCK = {prices: {id: price}, ts, fail, calls}
let GUIDE_MOCK = null;
const GUIDE_URL = 'https://api.weirdgloop.org/exchange/history/rs/latest?id=';
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-flask-decanting-golden.json'), 'utf8'));
const byName = {}; for (const x of [D.flask, ...D.rows.flatMap(r => [r.f6, r.v1, r.v2, r.v3, r.v4])]) byName[x.n] = x.id;
const goldenGuide = () => Object.fromEntries(Object.entries(FX.guide).map(([n, v]) => [byName[n], v]));
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
    if (url.startsWith(GUIDE_URL)) {
      const G = GUIDE_MOCK || {fail: 404}; (G.calls = G.calls || []).push(url);
      if (G.fail) return {ok: false, status: G.fail, json: async () => ({})};
      const out = {}; for (const id of url.slice(GUIDE_URL.length).split('|')) if (G.prices[id] !== undefined) out[id] = {id: G.wrongId ? '1' : id, timestamp: G.ts || '2026-11-11T07:14:05.000Z', price: G.prices[id], volume: 0};
      return {ok: true, json: async () => out};
    }
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
  // Flask decanting uses ONLY the Wiki guide prices (owner 11 Nov 2026). The trade feed is deliberately different from the guide
  // prices ('full' feed: 30,000/29,000 flasks, 1,000/900 vials; 'varied': random), so any trade price leaking in is caught.
  const GG = () => ({prices: goldenGuide()});
  const exp = (c, sell, vial, fl, gross) => c.flasks * sell - c.vials * vial - c.flasks * fl - (gross ? 0 : c.flasks * Math.floor(sell / 50));
  const wikiCheck = (d, gross) => { const names = [...d.querySelectorAll('#fd-table tbody button.fd-name')].map(b => b.dataset.flask), rows = cellsOf(d); let n = 0;
    names.forEach((f, ri) => { const r = D.rows.find(x => x.flask === f), g = FX.rows.find(x => x.flask === f);
      D.columns.forEach((c, i) => { const sell = FX.guide[r.f6.n], want = gross ? g.values[i] : g.values[i] - c.flasks * Math.floor(sell / 50);
        assert.equal(val(rows[ri][i]), want, `${f} ${c.key} ${gross ? 'gross' : 'net'}`); n++; }); });
    return n; };
  const waitGuide = async d => { for (let i = 0; i < 100 && !/as of|unavailable/.test(d.querySelector('#fd-flask').textContent); i++) await tick(); };
  GUIDE_MOCK = GG();
  let {dom, w, d} = await screen('calculators/flask-decanting', {mystats_v2: '{"Attack":99}'});
  await waitGuide(d);
  assert.equal(d.querySelector('.tabs button.on').dataset.tab, 'calculators');
  assert.equal(d.querySelectorAll('#view iframe').length, 0);
  const tb = d.querySelector('#fd-table table'); assert.ok(tb.classList.contains('fd-wtable')); assert.ok(!tb.classList.contains('rtable'), 'not a phone-card table');
  assert.ok(d.querySelector('#fd-table').classList.contains('fd-scroll'));
  { const css = fs.readFileSync(path.join(base, 'neon.css'), 'utf8'); assert.match(css, /\.fd-scroll\{overflow-x:auto/); assert.match(css, /\.fd-wtable\{[^}]*min-width:600px/); }
  assert.equal(cellsOf(d).length, 86);
  assert.deepEqual([...d.querySelectorAll('#fd-table thead th')].map(t => t.textContent.replace(/[⇅▲▼]/g, '')), ['Flask', ...D.columns.map(c => c.label)]);
  assert.equal(d.querySelectorAll('#fd-table thead button.fd-sort').length, 5, 'every column header sorts');
  assert.ok([...d.querySelectorAll('#fd-table tbody tr th button.fd-name')].every(b => b.querySelector('img.calc-ico[src^="icons/"]')), 'potion picture + name first column');
  // no price choice: one compact label up front; Net by default = Wiki gross - per-flask tax, all 344 cells
  assert.equal(d.querySelector('select#fd-src'), null, 'no price dropdown'); assert.equal(d.querySelector('#fd-src').textContent, 'Wiki guide prices');
  assert.equal(d.querySelector('#fd-show').value, 'net'); assert.equal(wikiCheck(d, false), 344, '344 net cells from guide prices only');
  assert.ok(cellsOf(d).flat().every(td => td.querySelector('span.gpc')), 'coins icon on every profit cell');
  assert.equal(d.querySelectorAll('#fd-table td.fd-g').length, 0); assert.equal(d.querySelectorAll('#fd-table td.fd-unk').length, 0);
  d.querySelector('#fd-show').value = 'gross'; d.querySelector('#fd-show').dispatchEvent(new w.Event('change'));
  assert.equal(wikiCheck(d, true), 344, 'Gross = the Wiki calculator, 344/344'); assert.equal(w.localStorage.getItem('dch_calc_fd_show_v1'), 'gross');
  d.querySelector('#fd-show').value = 'net'; d.querySelector('#fd-show').dispatchEvent(new w.Event('change'));
  // Details: collapsed, below the table, says Wiki guide prices with their daily as-of time; no "latest trade" wording
  { const info = d.querySelector('details#fd-info'); assert.equal(info.open, false); assert.equal(info.querySelector('summary').textContent, 'Details & sources');
    const sec = d.querySelector('section.calc-native-panel'), kids = [...sec.children];
    for (const id of ['fd-status', 'fd-flask', 'fd-show-help', 'fd-src-what', 'fd-src-help']) assert.ok(info.contains(d.getElementById(id)), id + ' inside the closed Details');
    for (const id of ['fd-q', 'fd-show', 'fd-src', 'fd-count', 'fd-table']) assert.ok(!info.contains(d.getElementById(id)), id + ' up front');
    assert.ok(kids.indexOf(d.querySelector('#fd-table')) < kids.indexOf(info), 'Details below the table');
    assert.deepEqual(kids.filter(e => e.matches('p.note') && !e.hidden && e.id !== 'fd-count').map(e => e.id), [], 'no prose outside Details');
    assert.match(d.querySelector('#fd-src-what').textContent, /^Wiki guide prices: Jagex's official Grand Exchange guide price for every item, updated once a day/);
    assert.match(d.querySelector('#fd-flask').textContent, new RegExp('Empty potion flask: Buy ' + FX.guide['Potion flask'].toLocaleString('en-US') + ' gp \\(GE guide price, Nov 11, 2026, 2:14 AM ET\\)\\. GE guide prices \\(Jagex, via api\\.weirdgloop\\.org\\): as of Nov 11, 2026, 2:14 AM ET\\.'));
    assert.match(d.querySelector('#fd-status').textContent, /^86 of 86 potions · net profit .* · GE guide prices \(as the Wiki\)$/);
    assert.doesNotMatch(info.textContent, /latest recorded trade|Items prices|marked G/); assert.match(info.textContent, /How it is worked out/); assert.match(info.textContent, /CC BY-NC-SA 3\.0/);
    assert.equal(d.querySelector('#fd-count').textContent, '86 potions'); assert.equal(d.querySelector('#fd-alert').hidden, true); }
  // tap a potion: prices used, each labelled GE guide price with its date (no trade ages)
  d.querySelector('#fd-table button.fd-name').click();
  { const det = d.querySelector('#fd-table tr.fd-detail').textContent, r0 = D.rows.find(r => r.flask === d.querySelector('#fd-table button.fd-name').dataset.flask);
    assert.match(det, new RegExp('Sell 1 × ' + r0.f6.n.replace(/[()]/g, '\\$&') + ': ' + FX.guide[r0.f6.n].toLocaleString('en-US') + ' gp \\(est\\. tax')); assert.match(det, /GE guide price, Nov 11, 2026, 2:14 AM ET/); assert.doesNotMatch(det, /last trade|min ago/); }
  d.querySelector('#fd-table button.fd-name').click();
  // requests: only the calculator's own 431 item IDs, at most 100 per request; cached
  { const asked = GUIDE_MOCK.calls.flatMap(u => u.slice(GUIDE_URL.length).split('|')); assert.ok(GUIDE_MOCK.calls.every(u => u.slice(GUIDE_URL.length).split('|').length <= 100));
    assert.equal(new Set(asked).size, Object.keys(byName).length); }
  // header sort + favourites unchanged
  { const col = 2, sb = () => d.querySelectorAll('#fd-table thead button.fd-sort')[col + 1];
    sb().click(); let v = cellsOf(d).map(r => val(r[col])); assert.deepEqual(v, [...v].sort((a, b) => b - a));
    sb().click(); v = cellsOf(d).map(r => val(r[col])); assert.deepEqual(v, [...v].sort((a, b) => a - b));
    const nameB = () => d.querySelectorAll('#fd-table thead button.fd-sort')[0], nmz = () => [...d.querySelectorAll('#fd-table tbody button.fd-name')].map(b => b.dataset.flask), az = [...nmz()].sort((a, b) => a.localeCompare(b));
    nameB().click(); assert.deepEqual(nmz(), az); nameB().click(); assert.deepEqual(nmz(), [...az].reverse()); nameB().click(); assert.deepEqual(nmz(), az); }
  { const star = d.querySelector('#fd-star'); star.click(); assert.deepEqual(JSON.parse(w.localStorage.getItem(C.FAV_KEY)).map(f => f.path), [D.path]); assert.equal(w.localStorage.getItem('mystats_v2'), '{"Attack":99}'); }
  for (const a of d.querySelectorAll('#view a[target="_blank"]')) assert.equal(a.rel, 'noopener noreferrer');
  const savedGuide = w.localStorage.getItem('dch_ge_guide_cache_v1'); dom.window.close();
  // LEGACY saved "Items prices" choice (and varied, very different trade prices): ignored, still guide prices; the old key is left alone
  GUIDE_MOCK = GG();
  ({dom, w, d} = await screen('calculators/flask-decanting', {dch_calc_fd_src_v1: 'live', dch_calc_fd_show_v1: 'gross'}, 'varied')); await waitGuide(d);
  assert.equal(d.querySelector('#fd-show').value, 'gross', 'Net/Gross choice kept'); assert.equal(wikiCheck(d, true), 344, 'legacy live choice ignored: 344 Wiki cells');
  assert.equal(w.localStorage.getItem('dch_calc_fd_src_v1'), 'live', 'old key not deleted'); assert.equal(d.querySelectorAll('#fd-table td.fd-g').length, 0); dom.window.close();
  ({dom, w, d} = await screen('calculators/flask-decanting', {dch_calc_fd_src_v1: 'guide', dch_calc_fd_show_v1: 'bogus'})); await waitGuide(d);
  assert.equal(d.querySelector('#fd-show').value, 'net'); assert.equal(wikiCheck(d, false), 344); dom.window.close();
  // one item with no guide price: only its cell is —, never 0 (and no trade price substituted)
  GUIDE_MOCK = {prices: {...goldenGuide(), [D.rows[0].v1.id]: undefined}};
  ({dom, w, d} = await screen('calculators/flask-decanting')); await waitGuide(d);
  { const rows = cellsOf(d), i0 = [...d.querySelectorAll('#fd-table tbody button.fd-name')].findIndex(b => b.dataset.flask === D.rows[0].flask);
    assert.equal(rows[i0][0].textContent, '—'); assert.match(rows[i0][0].title, /No price: Aggression potion \(1\)/); assert.equal(d.querySelectorAll('#fd-table td.fd-unk').length, 1); }
  dom.window.close();
  // bad guide data is never used: 0, negative, fractional, text, null, or an answer for another ID
  for (const bad of [0, -5, 12.5, '900', null]) {
    GUIDE_MOCK = {prices: {...goldenGuide(), [D.rows[0].v1.id]: bad}};
    ({dom, w, d} = await screen('calculators/flask-decanting')); await waitGuide(d);
    assert.equal(d.querySelectorAll('#fd-table td.fd-unk').length, 1, 'bad guide price ' + bad + ' not used'); dom.window.close(); }
  GUIDE_MOCK = {prices: goldenGuide(), wrongId: true};
  ({dom, w, d} = await screen('calculators/flask-decanting')); for (let i = 0; i < 30; i++) await tick();
  assert.equal(d.querySelectorAll('#fd-table td.fd-unk').length, 344, 'answers labelled with another ID are not used'); dom.window.close();
  // refresh fails: the saved copy is used and said so; nothing saved: all —, never 0, alert
  { const old = JSON.parse(savedGuide); old.fetchedAt = Date.now() - 5 * 3600e3; GUIDE_MOCK = {fail: 503};
    ({dom, w, d} = await screen('calculators/flask-decanting', {dch_ge_guide_cache_v1: JSON.stringify(old)}));
    for (let i = 0; i < 50 && !/refresh failed/.test(d.querySelector('#fd-flask').textContent); i++) await tick();
    assert.match(d.querySelector('#fd-flask').textContent, /as of Nov 11, 2026, 2:14 AM ET \(saved copy; refresh failed\)/); assert.equal(wikiCheck(d, false), 344);
    assert.equal(d.querySelector('#fd-alert').textContent, 'GE guide prices could not be refreshed (using saved copy).'); dom.window.close(); }
  GUIDE_MOCK = {fail: 503};
  ({dom, w, d} = await screen('calculators/flask-decanting')); await waitGuide(d);
  assert.match(d.querySelector('#fd-flask').textContent, /GE guide prices unavailable \(HTTP 503\)/);
  { const tds = cellsOf(d).flat(); assert.equal(tds.length, 344); assert.ok(tds.every(td => td.textContent === '—'), 'never 0, no trade fallback'); }
  assert.equal(d.querySelector('#fd-alert').textContent, 'GE guide prices could not be loaded.'); dom.window.close();
  { const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8'); assert.match(html, /connect-src 'self' https:\/\/prices\.runescape\.wiki https:\/\/api\.weirdgloop\.org;/);
    const css = fs.readFileSync(path.join(base, 'neon.css'), 'utf8'); assert.match(css, /#fd-src,#fd-show\{max-width:100%;min-width:0\}/); }
  // decanting-only route + unknown slug unchanged
  GUIDE_MOCK = GG();
  ({dom, w, d} = await screen('calculators'));
  for (let i = 0; i < 50 && !d.querySelector('#fd-table tbody tr'); i++) await tick();
  assert.equal(w.location.hash, '#calculators/flask-decanting'); assert.deepEqual(C.NATIVE.map(n => n.slug), ['flask-decanting']); assert.equal(cellsOf(d).length, 86); dom.window.close();
  ({dom, w, d} = await screen('calculators/not-a-calc'));
  for (let i = 0; i < 50 && !d.querySelector('#fd-title'); i++) await tick();
  assert.equal(w.location.hash, '#calculators/flask-decanting'); dom.window.close();
  void exp;
  console.log('PASS flask decanting: 344/344 Wiki golden cells, dose conservation, exact IDs, per-flask floor tax; screen: Wiki guide prices only (no dropdown, legacy saved Items choice ignored, trade feed never used) -> Gross 344/344 = Wiki, Net = Wiki - per-flask tax; Net/Gross persists; gaps — never 0; bad/foreign guide data rejected; saved-copy and failure states');
})().catch(e => { console.error(e); process.exit(1); });
