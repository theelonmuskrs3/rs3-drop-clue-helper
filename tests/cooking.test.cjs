// Native Calculator:Cooking: Wiki goldens (template + form), form semantics, unsupported/invalid input, and the app screen.
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const C = require('../calculators.js'), prices = require('../live-prices.js'), {compare} = require('./cooking-compare.cjs');
const J = f => JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
const D = J('data/calc/cooking.json'), G = J('tests/fixtures-cooking-golden.json'), F = J('tests/cooking-form-cases.json');
const tick = () => new Promise(r => setTimeout(r, 10));
// 1. every golden cell
const cmp = compare(D, G);
assert.deepEqual(cmp.fails, []); assert.equal(cmp.cases, 66); assert.ok(cmp.rows >= 2899 && cmp.cells >= 34000, JSON.stringify(cmp));
// 2. form: hand-derived gadget submissions
for (const c of F.cases) { let st = C.skillFormDefaults(D.form); for (const [k, v] of c.actions) st = C.skillFormSet(D.form, st, k, v);
  const s = C.skillFormSubmission(D.form, st); assert.deepEqual(s.submission.filter(x => x[0] !== 'name'), c.expected, c.name); assert.deepEqual(s.errors, []); }
{ let st = C.skillFormDefaults(D.form); assert.equal(st.disabled.bxpnum, true); assert.throws(() => C.skillFormSet(D.form, st, 'bxpnum', '5'), /hidden/);
  assert.throws(() => C.skillFormSet(D.form, st, 'disp', 'Harvest'), /not an option/);
  for (const [k, v, ok] of [['goal', 'abc', false], ['goal', '2.5', false], ['custom', '1601', false], ['custom', '1600', true], ['current', '200,000,000', true], ['current', '200000001', false], ['goal', '', false]]) {
    const s2 = C.skillFormSubmission(D.form, C.skillFormSet(D.form, C.skillFormDefaults(D.form), k, v)); assert.equal(s2.errors.length === 0, ok, k + '=' + v); } }
// 3. unsupported mechanics / bad input are refused, never guessed
const B = Object.entries({currToggle: 'Level', current: '1', goalToggle: 'Level', goal: '99', skill: 'Cooking', disp: 'Fish'});
for (const extra of [['dxp', '1'], ['aura', 'x'], ['testing', 'active']]) assert.match(C.skillCalcRun(D, [...B, extra]).error, /not supported|not in this app|unsupported/i, extra[0]);
assert.ok(C.skillCalcRun(D, B.map(([k, v]) => [k, k === 'skill' ? 'Fletching' : v])).error);
assert.ok(C.skillCalcRun(D, B.map(([k, v]) => [k, k === 'disp' ? 'Harvest' : v])).error);
assert.ok(C.skillCalcRun(D, B.map(([k, v]) => [k, k === 'goal' ? 'x' : v])).error);
// 3b. every picture the engine can show (all sub-categories) has an official Wiki file in data/calc/images.json
{ const I = J('data/calc/images.json').items, miss = new Set();
  for (const disp of D.catOrder) for (const r of C.skillCalcRun(D, B.map(([k, v]) => [k, k === 'disp' ? disp : v])).rows) {
    for (const n of [r.item.icon || r.item.image || r.name, ...r.listed.map(l => l.image || l.name)]) if (!I[n]) miss.add(n); }
  assert.deepEqual([...miss], [], 'cooking names without a Wiki picture'); }
// 4. the app screen
const NAMES = Object.keys(D.ids);
async function screen(hash, store = {}, feed = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), {url: 'http://127.0.0.1:8777/index.html#' + hash, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, errors = [];
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
  w.scrollTo = () => {}; w.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  Object.defineProperty(w.navigator, 'serviceWorker', {value: {register() { return Promise.resolve(); }}});
  w.AbortController = AbortController; w.TextEncoder = TextEncoder;
  w.fetch = async url => { url = String(url);
    if (url.startsWith(prices.BASE)) { const ts = Date.now() / 1000 - (feed.age || 30);
      if (url.endsWith('/mapping')) return {ok: true, json: async () => NAMES.map(n => ({id: D.ids[n], name: n}))};
      const data = {}; for (const n of NAMES) data[D.ids[n]] = {high: 1000, low: 900, highTime: ts, lowTime: ts};
      for (const [n, row] of Object.entries(feed.over || {})) { if (row === null) delete data[D.ids[n]]; else data[D.ids[n]] = {highTime: ts, lowTime: ts, ...row}; }
      return {ok: true, json: async () => ({data})}; }
    try { return {ok: true, json: async () => JSON.parse(fs.readFileSync(path.resolve(base, url.split('?')[0]), 'utf8'))}; } catch { return {ok: false, status: 404, json: async () => ({})}; } };
  w.addEventListener('error', e => errors.push(e.error));
  for (const f of ['live-prices.js', 'calculators.js', 'map.js']) w.eval(fs.readFileSync(path.join(base, f), 'utf8'));
  w.eval(fs.readFileSync(path.join(base, 'app.js'), 'utf8'));
  for (let i = 0; i < 300; i++) { await tick(); if (w.document.querySelector('#live-price-status')?.textContent.includes('Last successful') && w.document.querySelector('#ck-table table')) break; }
  await tick(); assert.deepEqual(errors, [], hash + ' runtime errors');
  return {dom, w, d: w.document};
}
const rows = d => [...d.querySelectorAll('#ck-table tbody tr')];
const row = (d, n) => rows(d).find(tr => tr.querySelector('th .calc-name').textContent === n);
const set = (d, w, k, v) => { const el = d.querySelector('#ck-' + k); assert.ok(el, 'field ' + k); if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', {bubbles: true})); };
(async () => {
  let {dom, w, d} = await screen('calculators/cooking');
  assert.equal(d.querySelectorAll('#view iframe').length, 0); assert.ok(d.querySelector('#ck-title'));
  // defaults = the Wiki form defaults; message as the Wiki's
  const g0 = G.formCases[0]; assert.equal(d.querySelector('#ck-msg').textContent, /To train .*? experience is required\./.exec(g0.message)[0]);
  assert.equal(rows(d).length, g0.rows.length); assert.equal(d.querySelector('#ck-disp').value, 'Meat'); assert.equal(d.querySelector('#ck-bxpnum'), null);
  // controls present (Wiki labels), ids stable
  assert.deepEqual([...d.querySelectorAll('#ck-form [data-k]')].map(e => e.id), ['ck-currToggle', 'ck-current', 'ck-goalToggle', 'ck-goal', 'ck-avatar', 'ck-outfit', 'ck-custom', 'ck-extra', 'ck-disp', 'ck-urn', 'ck-urnEnhancer', 'ck-bxp']);
  set(d, w, 'disp', 'Fish'); set(d, w, 'currToggle', 'Level'); set(d, w, 'goal', '99');
  const R = C.skillCalcRun(D, C.skillFormSubmission(D.form, (() => { let s = C.skillFormDefaults(D.form); for (const [k, v] of [['disp', 'Fish'], ['currToggle', 'Level'], ['goal', '99']]) s = C.skillFormSet(D.form, s, k, v); return s; })()).submission);
  assert.equal(rows(d).length, R.rows.length);
  { const sh = R.rows.find(r => r.name === 'Shrimps'), tr = row(d, 'Shrimps'), td = tr.querySelectorAll('td');
    // live: buy 1000 each raw shrimps, sell 900 each, tax floor(900 x 2%) = 18 per item
    assert.equal(td[4].textContent, (1000 * sh.needed).toLocaleString('en-GB') + ' gp');
    assert.equal(td[5].textContent, (900 * sh.needed).toLocaleString('en-GB') + ' gp');
    assert.match(td[6].textContent, new RegExp('^−' + ((100 + 18) * sh.needed).toLocaleString('en-GB') + ' gptax ' + (18 * sh.needed).toLocaleString('en-GB') + ' gp'));
    assert.ok(tr.querySelector('.calc-prices summary')); assert.equal(tr.querySelector('.calc-prices').open, false); }
  // pictures (data/calc/images.json, official Wiki files): every row and ingredient line in the screen
  assert.ok(rows(d).every(tr => tr.querySelector('th img.calc-ico[src^="icons/"]')), 'row pictures');
  assert.ok([...d.querySelectorAll('#ck-table .hb-list li')].every(li => li.querySelector('img.calc-li-ico[src^="icons/"]')), 'ingredient pictures');
  // untradeable (Wiki mtrade/trade 0): 0 as on the Wiki, explicitly flagged, not free
  assert.match(row(d, 'Karambwanji').textContent, /excludes untradeable Raw karambwanji, Karambwanji \(product\)/);
  // gross toggle
  d.querySelector('#ck-show').value = 'gross'; d.querySelector('#ck-show').dispatchEvent(new w.Event('change')); assert.match(row(d, 'Shrimps').textContent, /before tax/);
  // search + sort
  d.querySelector('#ck-q').value = 'shark'; d.querySelector('#ck-q').dispatchEvent(new w.Event('input'));
  assert.ok(rows(d).length >= 2 && rows(d).every(tr => /shark/i.test(tr.textContent))); d.querySelector('#ck-q').value = ''; d.querySelector('#ck-q').dispatchEvent(new w.Event('input'));
  d.querySelector('#ck-sort').value = 'xp'; d.querySelector('#ck-sort').dispatchEvent(new w.Event('change'));
  { const xs = rows(d).map(tr => Number(tr.querySelectorAll('td')[1].textContent.replace(/,/g, ''))); assert.deepEqual(xs, [...xs].sort((a, b) => b - a)); }
  // bxp reveals bxpnum (Wiki toggle); invalid goal stops the run with the Wiki's message
  set(d, w, 'bxp', true); assert.ok(d.querySelector('#ck-bxpnum')); set(d, w, 'bxpnum', '50000'); assert.match(d.querySelector('#ck-msg').textContent, /With 50,000 bonus XP/);
  set(d, w, 'goal', 'abc'); assert.match(d.querySelector('#ck-msg').textContent, /Invalid integer provided/); assert.equal(rows(d).length, 0);
  set(d, w, 'goal', '99');
  // urn column
  set(d, w, 'urn', 'Strong'); assert.ok([...d.querySelectorAll('#ck-table thead th')].some(th => th.textContent === '# urns'));
  // favourites star (exact route)
  d.querySelector('#ck-star').click(); assert.ok(C.load(w.localStorage).some(f => f.path === '/w/Calculator:Cooking'));
  const store = {[C.FAV_KEY]: w.localStorage.getItem(C.FAV_KEY), dch_calc_cooking_v1: w.localStorage.getItem('dch_calc_cooking_v1')}; dom.window.close();
  // persistence: options survive a reload
  ({dom, w, d} = await screen('calculators/cooking', store));
  assert.equal(d.querySelector('#ck-disp').value, 'Fish'); assert.equal(d.querySelector('#ck-urn').value, 'Strong'); assert.equal(d.querySelector('#ck-bxpnum').value, '50000');
  // All: urns have no values on the Wiki -> none here either
  set(d, w, 'urn', 'None'); set(d, w, 'disp', 'All'); assert.ok(rows(d).some(tr => /without values/.test(tr.textContent)));
  set(d, w, 'disp', 'Dungeoneering'); assert.ok(![...d.querySelectorAll('#ck-table thead th')].some(th => th.textContent === 'Raw cost'));
  set(d, w, 'disp', 'Urns'); assert.deepEqual([...d.querySelectorAll('#ck-table thead th')].map(th => th.textContent), ['Name', 'XP', '# needed', 'Cost']);
  dom.window.close();
  // missing / stale prices are unavailable, never 0
  ({dom, w, d} = await screen('calculators/cooking', {dch_calc_cooking_v1: JSON.stringify({actions: [['disp', 'Fish']]})}, {over: {'Raw shrimps': null}}));
  { const t = row(d, 'Shrimps').textContent; assert.match(t, /Unavailable/); assert.doesNotMatch(row(d, 'Shrimps').querySelectorAll('td')[4].textContent, /^0$/); }
  dom.window.close();
  ({dom, w, d} = await screen('calculators/cooking', {dch_calc_cooking_v1: JSON.stringify({actions: [['disp', 'Fish']]})}, {age: 3600}));
  assert.ok(rows(d).length > 0); assert.match(row(d, 'Shrimps').textContent, /Unavailable/);
  dom.window.close();
  // hostile saved state is ignored safely
  ({dom, w, d} = await screen('calculators/cooking', {dch_calc_cooking_v1: '{"actions":[["disp","<img src=x onerror=alert(1)>"],["__proto__","x"],["goal",{"a":1}]]}'}));
  assert.equal(d.querySelector('#ck-disp').value, 'Meat'); assert.equal(d.querySelectorAll('#view img[src="x"]').length, 0); dom.window.close();
  // pictures: every row and ingredient shows its Wiki picture
  console.log(`PASS cooking: ${cmp.cases} Wiki golden cases (${cmp.rows} rows, ${cmp.cells} cells incl. truncated urn rows), ${F.cases.length} gadget form sequences, invalid/unsupported refused, screen: defaults/message, live buy/sell/tax, untradeable flagged, search/sort/gross, bxp toggle, urns, favourite, persistence, missing/stale unavailable, hostile storage`);
})().catch(e => { console.error(e); process.exit(1); });
