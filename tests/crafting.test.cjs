// Native Calculator:Crafting on the shared Wiki skill engine: Wiki goldens (template + form, every goal sentence), form semantics
// (portable/brooch toggles, Amulet of offerings), refused options, pictures, and the app screen (control IDs, live math,
// portable ingredient discount, partial totals never shown as profit, Dungeoneering Armour columns, number fields kept).
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const C = require('../calculators.js'), prices = require('../live-prices.js'), {compare} = require('./cooking-compare.cjs');
const J = f => JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
const D = J('data/calc/crafting.json'), G = J('tests/fixtures-crafting-golden.json'), F = J('tests/crafting-form-cases.json');
const tick = () => new Promise(r => setTimeout(r, 10));
// 1. every golden cell and goal sentence (Wiki renders at pinned revisions; GE guide prices frozen in the fixture).
// Wiki quirks reproduced: "Dungeoneering Armour" matches the Lua pattern "Dungeoneering - " (no cost columns, and the members
// cell is dropped because targetElt 11 is past the row end); File:Koi Scales.png is a red link on the Wiki (name read twice).
const cmp = compare(D, G, {redlinks: ['Koi Scales']});
assert.deepEqual(cmp.fails, []); assert.equal(cmp.cases, 24); assert.equal(cmp.messages, 24); assert.equal(cmp.noMemberCell, 120);
assert.ok(cmp.rows >= 1755 && cmp.cells >= 20220, JSON.stringify(cmp));
// 2. form: hand-derived gadget submissions
for (const c of F.cases) { let st = C.skillFormDefaults(D.form); for (const [k, v] of c.actions) st = C.skillFormSet(D.form, st, k, v);
  const s = C.skillFormSubmission(D.form, st); assert.deepEqual(s.submission.filter(x => x[0] !== 'name'), c.expected, c.name); assert.deepEqual(s.errors, []); }
{ const st = C.skillFormDefaults(D.form); assert.equal(st.disabled.brooch, true); assert.equal(st.disabled.brooch_no_effect, false); assert.equal(st.disabled.bxpnum, true);
  assert.throws(() => C.skillFormSet(D.form, st, 'brooch', true), /hidden/); assert.throws(() => C.skillFormSet(D.form, st, 'disp', 'Urns'), /not an option/); }
// 3. options the Crafting module never reads are refused, never guessed
const B = Object.entries({currToggle: 'Level', current: '1', goalToggle: 'Level', goal: '99', skill: 'Crafting', disp: 'Pottery'});
for (const extra of [['dxp', '1'], ['workroom', 'Yes'], ['torstol', '5'], ['testing', 'active'], ['abyss', 'Yes']]) assert.match(C.skillCalcRun(D, [...B, extra]).error, /not supported/i, extra[0]);
{ const pot = o => C.skillCalcRun(D, [...B, ...Object.entries(o)]);
  const r0 = pot({}).rows.find(x => x.name === 'Empty pot'), rp = pot({portable: 'Yes'}).rows.find(x => x.name === 'Empty pot');
  const rb = pot({portable: 'Yes', brooch: 'true'}), ra = pot({amuletOfOfferings: 'Yes'}), rall = pot({portable: 'Yes', amuletOfOfferings: 'Yes', avatar: '6', outfit: '5', custom: '7'});
  assert.equal(r0.matReduction, 0); assert.equal(rp.matReduction, 0.1); assert.equal(rb.rows.find(x => x.name === 'Empty pot').matReduction, 0.2);
  assert.ok(Math.abs(rb.pctBoost - 0.10) < 1e-12); assert.ok(Math.abs(ra.pctBoost - 0.03) < 1e-12); assert.ok(Math.abs(rall.pctBoost - (0.06 + 0.06 + 0.10 + 0.07 + 0.03)) < 1e-12);
  assert.equal(C.skillCalcCost(rp, () => 1000).rawEach, 900);
  assert.ok(C.skillCalcRun(J('data/calc/fletching.json'), Object.entries({currToggle: 'Level', current: '1', goalToggle: 'Level', goal: '99', skill: 'Fletching', disp: 'Arrows', amuletOfOfferings: 'Yes'})).error, 'Amulet of offerings stays refused for Fletching');
  const misc = C.skillCalcRun(D, B.map(([k, v]) => [k, k === 'disp' ? 'Miscellaneous' : v])).rows.find(x => x.name === "Reefwalker's cape");
  assert.ok(misc.listed.every(l => l.unpriced === 'untradeable')); assert.equal(misc.product, null); }
// 3b. every picture the engine can show has an official Wiki file (Koi Scales: the Wiki's own page redirect to File:Koi scales.png)
{ const I = J('data/calc/images.json').items, miss = new Set();
  for (const disp of D.catOrder) for (const r of C.skillCalcRun(D, B.map(([k, v]) => [k, k === 'disp' ? disp : v])).rows)
    for (const n of [r.item.icon || r.item.image || r.name, ...r.listed.map(l => l.image || l.name)]) if (!I[n] || !/^icons\//.test(I[n].src)) miss.add(n);
  assert.deepEqual([...miss], [], 'crafting names without a Wiki picture'); assert.equal(I['Koi Scales'].file, 'File:Koi scales.png'); }
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
  for (let i = 0; i < 300; i++) { await tick(); if (w.document.querySelector('#live-price-status')?.textContent.includes('Last successful') && w.document.querySelector('#cr-table table')) break; }
  await tick(); assert.deepEqual(errors, [], hash + ' runtime errors');
  return {dom, w, d: w.document};
}
const rows = d => [...d.querySelectorAll('#cr-table tbody tr')];
const row = (d, n) => rows(d).find(tr => tr.querySelector('th .calc-name').textContent === n);
const set = (d, w, k, v) => { const el = d.querySelector('#cr-' + k); assert.ok(el, 'field ' + k); if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', {bubbles: true})); };
const cells = tr => [...tr.querySelectorAll('td')].map(t => t.textContent);
(async () => {
  let {dom, w, d} = await screen('calculators/crafting');
  assert.equal(d.querySelector('#cr-title').textContent, 'Crafting calculator');
  // Wiki form order, labels and defaults (Calculator:Crafting rev 37211361 jcConfig)
  assert.deepEqual([...d.querySelectorAll('#cr-form [data-k], #cr-form .hb-fixed')].map(e => e.id), ['cr-currToggle', 'cr-current', 'cr-goalToggle', 'cr-goal', 'cr-avatar', 'cr-outfit', 'cr-amuletOfOfferings', 'cr-portable', 'cr-brooch_no_effect', 'cr-custom', 'cr-disp', 'cr-bxp']);
  assert.equal(d.querySelector('#cr-currToggle').value, 'Experience'); assert.equal(d.querySelector('#cr-goal').value, '2'); assert.equal(d.querySelector('#cr-disp').value, 'Armour');
  assert.equal(d.querySelector('#cr-amuletOfOfferings').value, 'No'); assert.deepEqual([...d.querySelectorAll('#cr-disp option')].map(o => o.value), D.form.params.find(p => p.name === 'disp').range.split(/\s*,\s*/));
  assert.deepEqual([...d.querySelectorAll('#cr-table thead th')].map(th => th.textContent), ['Level', 'Name', 'XP', '# needed', 'Materials', 'Raw cost', 'Product cost', 'Profit/Loss', 'Profit/XP']);
  assert.equal(d.querySelector('#cr-msg').textContent, 'To train Crafting from 1 experience (level 1) to 83 experience (level 2), 82 experience is required.');
  set(d, w, 'currToggle', 'Level'); set(d, w, 'goal', '99'); set(d, w, 'disp', 'Pottery');
  const run = o => C.skillCalcRun(D, Object.entries({currToggle: 'Level', current: '1', goalToggle: 'Level', goal: '99', avatar: '0', outfit: '0', amuletOfOfferings: 'No', portable: 'No', brooch_no_effect: 'No effect', custom: '0', disp: 'Pottery', skill: 'Crafting', bxp: '0', ...o})).rows.find(x => x.name === 'Empty pot');
  { const r = run({}), td = cells(row(d, 'Empty pot'));
    // live: Buy 1000 for 1 Soft clay; Sell 900 for the pot; tax floor(900 x 2%) = 18
    assert.equal(td[1], String(r.unitExp)); assert.equal(td[2], r.needed.toLocaleString('en-GB'));
    assert.equal(td[4], (1000 * r.needed).toLocaleString('en-GB') + ' gp'); assert.equal(td[5], (900 * r.needed).toLocaleString('en-GB') + ' gp');
    assert.match(td[6], new RegExp('^−' + ((1000 - 900 + 18) * r.needed).toLocaleString('en-GB') + ' gptax ' + (18 * r.needed).toLocaleString('en-GB') + ' gp'));
    assert.ok(row(d, 'Empty pot').querySelector('.calc-val.loss')); assert.ok(row(d, 'Empty pot').querySelector('th img.calc-ico[src^="icons/"]')); }
  // Amulet of offerings: +3% after the other boosts
  set(d, w, 'amuletOfOfferings', 'Yes'); { const r = run({amuletOfOfferings: 'Yes'}); assert.equal(cells(row(d, 'Empty pot'))[1], String(r.unitExp)); assert.equal(cells(row(d, 'Empty pot'))[2], r.needed.toLocaleString('en-GB')); }
  set(d, w, 'amuletOfOfferings', 'No');
  // portable: +10% XP, brooch shown instead of the "No effect" note; ingredients -10% (-20% with the brooch) in every sub-category
  set(d, w, 'portable', 'Yes'); assert.equal(d.querySelector('#cr-brooch_no_effect'), null); assert.ok(d.querySelector('#cr-brooch'));
  { const r = run({portable: 'Yes', brooch_no_effect: undefined}); assert.equal(cells(row(d, 'Empty pot'))[4], (900 * r.needed).toLocaleString('en-GB') + ' gp');
    set(d, w, 'brooch', true); assert.equal(cells(row(d, 'Empty pot'))[4], (800 * r.needed).toLocaleString('en-GB') + ' gp'); }
  set(d, w, 'brooch', false); set(d, w, 'portable', 'No'); assert.ok(d.querySelector('#cr-brooch_no_effect'));
  // partial totals: an untradeable product (Ball of black wool) is neutral, never a gain or a loss
  set(d, w, 'disp', 'Miscellaneous');
  { const t = row(d, 'Ball of black wool'); assert.match(t.textContent, /Partial, not a market profit: excludes untradeable Ball of black wool/); assert.equal(t.querySelector('.calc-val.gain, .calc-val.loss'), null); assert.ok(t.querySelector('.calc-val.partial')); }
  // Dungeoneering Armour: no cost columns, as on the Wiki
  set(d, w, 'disp', 'Dungeoneering Armour'); assert.deepEqual([...d.querySelectorAll('#cr-table thead th')].map(th => th.textContent), ['Level', 'Name', 'XP', '# needed', 'Materials']);
  set(d, w, 'disp', 'Pottery');
  // number fields are never rebuilt across typing, blur and moving to another number field
  { const cur = d.querySelector('#cr-current'), goal = d.querySelector('#cr-goal');
    goal.focus(); goal.value = ''; for (const ch of '80') { goal.value += ch; goal.dispatchEvent(new w.Event('input', {bubbles: true})); }
    goal.dispatchEvent(new w.Event('change', {bubbles: true})); cur.focus();
    for (const ch of '50') { cur.value = cur.value === '1' ? ch : cur.value + ch; cur.dispatchEvent(new w.Event('input', {bubbles: true})); }
    cur.dispatchEvent(new w.Event('change', {bubbles: true}));
    assert.equal(d.querySelector('#cr-current'), cur); assert.equal(d.activeElement, cur); assert.equal(cur.value, '50'); assert.equal(goal.value, '80'); }
  // bonus XP: the Wiki's goal sentence plus the total as a note; Goal Level above 120 noted, never clamped
  { for (const v of [true, false, true]) set(d, w, 'bxp', v); const bx = d.querySelector('#cr-bxpnum'); bx.focus(); bx.value = '';
    for (const ch of '50000') { bx.value += ch; bx.dispatchEvent(new w.Event('input', {bubbles: true})); }
    assert.equal(d.querySelector('#cr-bxpnum'), bx); set(d, w, 'avatar', '3'); assert.equal(d.querySelector('#cr-bxpnum'), bx);
    assert.equal(d.querySelector('#cr-msg').textContent, 'To train Crafting from 101,333 experience (level 50) to 1,986,068 experience (level 80), 1,834,735 experience is required. (50,000 bonus XP available; 1,884,735 XP to the goal in total.)'); }
  set(d, w, 'goal', '130'); assert.equal(d.querySelector('#cr-goal-r').textContent, 'Above 120 the Wiki reads this as experience: 130 XP, not level 130'); set(d, w, 'goal', '80');
  // favourite + persistence
  d.querySelector('#cr-star').click(); assert.ok(C.load(w.localStorage).some(f => f.path === '/w/Calculator:Crafting'));
  const store = {[C.FAV_KEY]: w.localStorage.getItem(C.FAV_KEY), dch_calc_crafting_v1: w.localStorage.getItem('dch_calc_crafting_v1')}; dom.window.close();
  ({dom, w, d} = await screen('calculators/crafting', store));
  assert.equal(d.querySelector('#cr-avatar').value, '3'); assert.equal(d.querySelector('#cr-bxpnum').value, '50000'); assert.equal(d.querySelector('#cr-current').value, '50'); assert.equal(d.querySelector('#cr-disp').value, 'Pottery');
  dom.window.close();
  // missing / stale prices are unavailable, never 0
  const st0 = {dch_calc_crafting_v1: JSON.stringify({actions: [['currToggle', 'Level'], ['goal', '99'], ['disp', 'Pottery']]})};
  ({dom, w, d} = await screen('calculators/crafting', st0, {over: {'Soft clay': null}})); assert.match(row(d, 'Empty pot').textContent, /Unavailable/); dom.window.close();
  ({dom, w, d} = await screen('calculators/crafting', st0, {age: 3600})); assert.match(row(d, 'Empty pot').textContent, /Unavailable/); dom.window.close();
  console.log(`PASS crafting: ${cmp.cases} Wiki golden cases (${cmp.rows} rows, ${cmp.cells} cells, ${cmp.messages} goal sentences, ${cmp.noMemberCell} rows without the Wiki's members cell), ${F.cases.length} gadget form sequences, refused options, pictures, screen: Wiki form order/IDs/defaults/headers, live buy/sell/tax, amulet +3%, portable/brooch discount, partial neutral, Dungeoneering Armour columns, number fields kept, BXP sentence, Level>120 note, favourite, persistence, missing/stale unavailable`);
})().catch(e => { console.error(e); process.exit(1); });
