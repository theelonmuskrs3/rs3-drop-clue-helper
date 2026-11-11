// Native Calculator:Fletching on the shared Wiki skill engine: Wiki goldens (template + form), form semantics (portable/brooch
// toggles, the fixed "No effect" field), refused options, pictures, and the app screen (control IDs, live math with products made
// several at a time, portable ingredient discount, partial totals never shown as profit, number fields never rebuilt on blur).
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const C = require('../calculators.js'), prices = require('../live-prices.js'), {compare} = require('./cooking-compare.cjs');
const J = f => JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
const D = J('data/calc/fletching.json'), G = J('tests/fixtures-fletching-golden.json'), F = J('tests/fletching-form-cases.json');
const tick = () => new Promise(r => setTimeout(r, 10));
// 1. every golden cell (Wiki renders at pinned revisions; GE guide prices frozen in the fixture)
const cmp = compare(D, G);
assert.deepEqual(cmp.fails, []); assert.equal(cmp.cases, 32); assert.ok(cmp.rows >= 1003 && cmp.cells >= 11756, JSON.stringify(cmp));
// 2. form: hand-derived gadget submissions
for (const c of F.cases) { let st = C.skillFormDefaults(D.form); for (const [k, v] of c.actions) st = C.skillFormSet(D.form, st, k, v);
  const s = C.skillFormSubmission(D.form, st); assert.deepEqual(s.submission.filter(x => x[0] !== 'name'), c.expected, c.name); assert.deepEqual(s.errors, []); }
{ const st = C.skillFormDefaults(D.form); assert.equal(st.disabled.brooch, true); assert.equal(st.disabled.brooch_no_effect, false); assert.equal(st.disabled.bxpnum, true);
  assert.throws(() => C.skillFormSet(D.form, st, 'brooch', true), /hidden/); assert.throws(() => C.skillFormSet(D.form, st, 'disp', 'Arrows - Martial'), /not an option/); }
// 3. options this skill's Wiki module never reads for Fletching are refused, never guessed
const B = Object.entries({currToggle: 'Level', current: '1', goalToggle: 'Level', goal: '99', skill: 'Fletching', disp: 'Arrows'});
for (const extra of [['torstol', '5'], ['aura', 'x'], ['testing', 'active'], ['abyss', 'Yes']]) assert.match(C.skillCalcRun(D, [...B, extra]).error, /not supported/i, extra[0]);
assert.ok(C.skillCalcRun(D, B.map(([k, v]) => [k, k === 'disp' ? 'Urns' : v])).error);
assert.ok(C.skillCalcRun(J('data/calc/cooking.json'), [...Object.entries({currToggle: 'Level', current: '1', goalToggle: 'Level', goal: '99', skill: 'Cooking', disp: 'Fish'}), ['portable', 'Yes']]).error, 'portable stays refused for Cooking');
// engine facts the screen relies on
{ const R = C.skillCalcRun(D, [...B, ['portable', 'Yes'], ['brooch', 'true']]); const r = R.rows.find(x => x.name === 'Bronze arrow');
  assert.equal(r.multiplier, 15); assert.equal(r.product.units, 15); assert.equal(r.matReduction, 0.2); assert.ok(Math.abs(R.pctBoost - 0.1) < 1e-12);
  const k = C.skillCalcCost(r, () => 1000); assert.equal(k.rawEach, 30000 * 0.8); assert.equal(k.prodEach, 15000);
  const S = C.skillCalcRun(D, B.map(([a, v]) => [a, a === 'disp' ? 'Bolts' : v])); const bk = S.rows.find(x => x.name === 'Bakriminel bolts');
  assert.ok(bk.listed.every(l => l.unpriced === 'wiki'), 'mcount 0: the Wiki prices no ingredient');
  const M = C.skillCalcRun(D, B.map(([a, v]) => [a, a === 'disp' ? 'Miscellaneous' : v])).rows.find(x => x.name === 'Blisterwood orb');
  assert.ok(M.listed.every(l => l.unpriced === 'untradeable')); }
// 3b. every picture the engine can show has an official Wiki file
{ const I = J('data/calc/images.json').items, miss = new Set();
  for (const disp of D.catOrder) for (const r of C.skillCalcRun(D, B.map(([k, v]) => [k, k === 'disp' ? disp : v])).rows)
    for (const n of [r.item.icon || r.item.image || r.name, ...r.listed.map(l => l.image || l.name)]) if (!I[n] || !/^icons\//.test(I[n].src)) miss.add(n);
  assert.deepEqual([...miss], [], 'fletching names without a Wiki picture'); }
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
  for (let i = 0; i < 300; i++) { await tick(); if (w.document.querySelector('#live-price-status')?.textContent.includes('Last successful') && w.document.querySelector('#fl-table table')) break; }
  await tick(); assert.deepEqual(errors, [], hash + ' runtime errors');
  return {dom, w, d: w.document};
}
const rows = d => [...d.querySelectorAll('#fl-table tbody tr')];
const row = (d, n) => rows(d).find(tr => tr.querySelector('th .calc-name').textContent === n);
const set = (d, w, k, v) => { const el = d.querySelector('#fl-' + k); assert.ok(el, 'field ' + k); if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', {bubbles: true})); };
(async () => {
  let {dom, w, d} = await screen('calculators/fletching');
  assert.ok(d.querySelector('#fl-title')); assert.equal(d.querySelector('#fl-title').textContent, 'Fletching calculator');
  // Wiki form order, labels and defaults (Calculator:Fletching jcConfig); the brooch note is the Wiki's fixed field
  assert.deepEqual([...d.querySelectorAll('#fl-form [data-k], #fl-form .hb-fixed')].map(e => e.id), ['fl-currToggle', 'fl-current', 'fl-goalToggle', 'fl-goal', 'fl-avatar', 'fl-outfit', 'fl-custom', 'fl-portable', 'fl-workroom', 'fl-disp', 'fl-bxp', 'fl-brooch_no_effect', 'fl-dxp']);
  assert.equal(d.querySelector('#fl-brooch_no_effect').textContent, 'Brooch of the GodsNo effect');
  assert.equal(d.querySelector('#fl-currToggle').value, 'Experience'); assert.equal(d.querySelector('#fl-goal').value, '2'); assert.equal(d.querySelector('#fl-disp').value, 'Arrows');
  assert.deepEqual([...d.querySelectorAll('#fl-table thead th')].map(th => th.textContent), ['Level', 'Name', 'XP', '# needed', 'Materials', 'Raw cost', 'Product cost', 'Profit/Loss', 'Profit/XP']);
  assert.match(d.querySelector('#fl-msg').textContent, /^To train Fletching from 1 experience \(level 1\) to 83 experience \(level 2\), 82 experience is required\.$/);
  set(d, w, 'currToggle', 'Level'); set(d, w, 'goal', '99');
  const R0 = C.skillCalcRun(D, Object.entries({currToggle: 'Level', current: '1', goalToggle: 'Level', goal: '99', avatar: '0', outfit: '0', custom: '0', portable: 'No', workroom: 'No', disp: 'Arrows', skill: 'Fletching', bxp: '0', brooch_no_effect: 'No effect', dxp: '0'}));
  { const r = R0.rows.find(x => x.name === 'Bronze arrow'), tr = row(d, 'Bronze arrow × 15'), td = tr.querySelectorAll('td');
    // live: Buy 1000 each for 15 arrowheads + 15 shafts; Sell 900 x 15 arrows; tax floor(900 x 2%) = 18 per arrow
    assert.equal(td[4].textContent, (30000 * r.needed).toLocaleString('en-GB') + ' gp');
    assert.equal(td[5].textContent, (13500 * r.needed).toLocaleString('en-GB') + ' gp');
    assert.match(td[6].textContent, new RegExp('^−' + ((30000 - 13500 + 270) * r.needed).toLocaleString('en-GB') + ' gptax ' + (270 * r.needed).toLocaleString('en-GB') + ' gp'));
    assert.ok(tr.querySelector('.calc-val.loss')); assert.ok(tr.querySelector('th img.calc-ico[src^="icons/"]')); }
  // portable: +10% XP, brooch shown instead of the "No effect" note; ingredients -10% (-20% with the brooch)
  set(d, w, 'portable', 'Yes'); assert.equal(d.querySelector('#fl-brooch_no_effect'), null); assert.ok(d.querySelector('#fl-brooch'));
  assert.equal(d.activeElement && d.activeElement.id === 'fl-portable' || d.activeElement === d.body, true);
  { const r = C.skillCalcRun(D, Object.entries({currToggle: 'Level', current: '1', goalToggle: 'Level', goal: '99', portable: 'Yes', disp: 'Arrows', skill: 'Fletching', brooch: 'true'})).rows.find(x => x.name === 'Bronze arrow');
    set(d, w, 'brooch', true); assert.equal(row(d, 'Bronze arrow × 15').querySelectorAll('td')[4].textContent, (24000 * r.needed).toLocaleString('en-GB') + ' gp'); }
  set(d, w, 'brooch', false); set(d, w, 'portable', 'No');
  // partial totals: untradeable (Blisterwood) and not priced by the Wiki (Bakriminel bolts, mcount 0) are neutral, never green profit
  set(d, w, 'disp', 'Miscellaneous');
  { const t = row(d, 'Blisterwood orb'); assert.match(t.textContent, /Partial, not a market profit: excludes untradeable Blisterwood logs/); assert.equal(t.querySelector('.calc-val.gain'), null); assert.ok(t.querySelector('.calc-val.partial')); }
  set(d, w, 'disp', 'Bolts');
  { const t = row(d, 'Bakriminel bolt × 10'); assert.match(t.textContent, /Partial, not a market profit: excludes Bakriminel bolt tips, Bakriminel bolt shafts \(not priced by the Wiki for this recipe, not free\)/);
    assert.equal(t.querySelector('.calc-val.gain'), null); assert.equal(t.querySelectorAll('.calc-val.partial').length, 2); }
  // Dungeoneering: no cost columns, as on the Wiki
  set(d, w, 'disp', 'Dungeoneering - Bows'); assert.deepEqual([...d.querySelectorAll('#fl-table thead th')].map(th => th.textContent), ['Level', 'Name', 'XP', '# needed', 'Materials']);
  set(d, w, 'disp', 'Arrows');
  // number fields are never rebuilt: typing, blur ("change") and moving to another number field keep the same elements and caret
  { const cur = d.querySelector('#fl-current'), goal = d.querySelector('#fl-goal');
    goal.focus(); goal.value = ''; for (const ch of '80') { goal.value += ch; goal.dispatchEvent(new w.Event('input', {bubbles: true})); }
    goal.dispatchEvent(new w.Event('change', {bubbles: true})); cur.focus();   // blur of goal fires change, focus lands in current
    for (const ch of '50') { cur.value = cur.value === '1' ? ch : cur.value + ch; cur.dispatchEvent(new w.Event('input', {bubbles: true})); }
    cur.dispatchEvent(new w.Event('change', {bubbles: true}));
    assert.ok(cur.isConnected && goal.isConnected, 'number fields kept'); assert.equal(d.querySelector('#fl-current'), cur); assert.equal(d.activeElement, cur);
    assert.equal(cur.value, '50'); assert.equal(goal.value, '80'); assert.match(d.querySelector('#fl-msg').textContent, /\(level 50\) to .*\(level 80\)/); }
  // rapid toggles: bxp on/off/on reveals bxpnum, typing 50000 key by key, then a select change and the value stays
  { for (const v of [true, false, true]) set(d, w, 'bxp', v); const bx = d.querySelector('#fl-bxpnum'); assert.ok(bx); bx.focus(); bx.value = '';
    for (const ch of '50000') { bx.value += ch; bx.dispatchEvent(new w.Event('input', {bubbles: true})); }
    assert.equal(d.querySelector('#fl-bxpnum'), bx); set(d, w, 'workroom', 'Yes'); assert.equal(d.querySelector('#fl-bxpnum'), bx, 'non-toggling select keeps fields');
    assert.equal(bx.value, '50000'); assert.match(d.querySelector('#fl-msg').textContent, /With 50,000 bonus XP/);
    bx.value = '5x'; bx.dispatchEvent(new w.Event('input', {bubbles: true})); assert.equal(bx.getAttribute('aria-invalid'), 'true'); assert.match(d.querySelector('#fl-bxpnum-r').textContent, /Invalid integer/i);
    bx.value = '50000'; bx.dispatchEvent(new w.Event('input', {bubbles: true})); assert.equal(bx.getAttribute('aria-invalid'), 'false'); }
  // favourite + persistence
  d.querySelector('#fl-star').click(); assert.ok(C.load(w.localStorage).some(f => f.path === '/w/Calculator:Fletching'));
  const store = {[C.FAV_KEY]: w.localStorage.getItem(C.FAV_KEY), dch_calc_fletching_v1: w.localStorage.getItem('dch_calc_fletching_v1')}; dom.window.close();
  ({dom, w, d} = await screen('calculators/fletching', store));
  assert.equal(d.querySelector('#fl-workroom').value, 'Yes'); assert.equal(d.querySelector('#fl-bxpnum').value, '50000'); assert.equal(d.querySelector('#fl-current').value, '50');
  dom.window.close();
  // missing / stale prices are unavailable, never 0
  ({dom, w, d} = await screen('calculators/fletching', {dch_calc_fletching_v1: JSON.stringify({actions: [['currToggle', 'Level'], ['goal', '99']]})}, {over: {'Bronze arrowheads': null}}));
  assert.match(row(d, 'Bronze arrow × 15').textContent, /Unavailable/); dom.window.close();
  ({dom, w, d} = await screen('calculators/fletching', {}, {age: 3600})); assert.match(row(d, 'Bronze arrow × 15').textContent, /Unavailable/); dom.window.close();
  console.log(`PASS fletching: ${cmp.cases} Wiki golden cases (${cmp.rows} rows, ${cmp.cells} cells), ${F.cases.length} gadget form sequences, refused options, pictures, screen: Wiki form order/IDs/defaults/headers, live buy/sell/tax with × 15 products, portable/brooch discount, partial untradeable + Wiki-unpriced neutral, Dungeoneering columns, number fields kept across typing/blur/rapid toggles, inline hint, favourite, persistence, missing/stale unavailable`);
})().catch(e => { console.error(e); process.exit(1); });
