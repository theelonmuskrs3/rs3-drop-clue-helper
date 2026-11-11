// Native Calculator:Firemaking on the shared Wiki skill engine: Wiki goldens (template + form, every goal sentence) for every
// sub-category including the bonfire per-item variants, the Wiki's cost-only table (eltGenerator generate_NoProfitLoss: Unit cost,
// "Product cost" = unit cost x actions, XP cost / Milestones "Profit/XP"; Char without materials; Barbarian/Other without costs;
// Daemonheim valued in rusty coins), Incense Sticks on the profit table, the gadget's number field (Custom Boost), refused options,
// pictures, and the app screen (control IDs, live costs, untradeable fuel never free, missing/stale prices unavailable).
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const C = require('../calculators.js'), prices = require('../live-prices.js'), {compare} = require('./cooking-compare.cjs');
const J = f => JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
const D = J('data/calc/firemaking.json'), G = J('tests/fixtures-firemaking-golden.json'), F = J('tests/firemaking-form-cases.json');
const tick = () => new Promise(r => setTimeout(r, 10));
// 1. every golden cell and goal sentence (Wiki renders at pinned revisions; GE guide prices frozen in the fixture)
const cmp = compare(D, G);
assert.deepEqual(cmp.fails, []); assert.equal(cmp.cases, 27); assert.equal(cmp.messages, 27); assert.equal(cmp.npl, 513);
assert.ok(cmp.rows >= 527 && cmp.cells >= 5340, JSON.stringify(cmp));
for (const disp of D.catOrder) assert.ok(G.cases.some(c => c.args.disp === disp), 'golden for ' + disp);
// negative controls: the compare catches a Daemonheim cost taken from the materials, and beacon bonus XP being added
{ const bad = JSON.parse(JSON.stringify(D)); for (const it of bad.cats.Daemonheim.items) it.value += 1;
  assert.ok(compare(bad, {...G, cases: G.cases.filter(c => c.args.disp === 'Daemonheim')}).fails.length > 0);
  const bad2 = JSON.parse(JSON.stringify(D)); for (const it of bad2.cats.Other.items) if (it.bonus) it.xp += it.bonus;
  assert.ok(compare(bad2, {...G, cases: G.cases.filter(c => c.args.disp === 'Other')}).fails.length > 0); }
// 2. form: hand-derived gadget submissions (number field sent as typed; int strips commas)
for (const c of F.cases) { let st = C.skillFormDefaults(D.form); for (const [k, v] of c.actions) st = C.skillFormSet(D.form, st, k, v);
  const s = C.skillFormSubmission(D.form, st); assert.deepEqual(s.submission.filter(x => x[0] !== 'name'), c.expected, c.name); assert.deepEqual(s.errors, []); }
{ const p = D.form.params.find(x => x.name === 'custom'), E = 'Invalid number provided. Must be between 0 and 1600 and a multiple of 0.01';
  for (const v of ['0', '2.5', '0.01', '1600', '', '1e2']) assert.equal(C.skillFieldError(p, v), null, v);
  for (const v of ['2.555', '1600.01', '-1', 'abc', '1,5']) assert.equal(C.skillFieldError(p, v), E, v);
  let st = C.skillFormDefaults(D.form); st = C.skillFormSet(D.form, st, 'custom', '2.555'); assert.deepEqual(C.skillFormSubmission(D.form, st).errors, ['Custom Boost (%): ' + E]); }
// 3. engine facts from the Wiki module, and options the Firemaking form never sends are refused, never guessed
const B = Object.entries({currToggle: 'Level', current: '1', goalToggle: 'Level', goal: '99', skill: 'Firemaking', disp: 'Bonfire'});
const run = o => C.skillCalcRun(D, [...B.filter(([k]) => !(k in o)), ...Object.entries(o)]);
for (const extra of [['dxp', '1'], ['workroom', 'Yes'], ['brooch', 'true'], ['amuletOfOfferings', 'Yes'], ['abyss', 'Yes'], ['torstol', '5']]) assert.match(run({[extra[0]]: extra[1]}).error, /not supported/i, extra[0]);
{ const r = run({outfit: '1'}), r2 = run({outfit: '2'}), rp = run({portable: 'Yes'});
  assert.ok(Math.abs(r.pctBoost - 0.02) < 1e-12); assert.ok(Math.abs(r2.pctBoost - 0.05) < 1e-12); assert.ok(Math.abs(rp.pctBoost - 0.15) < 1e-12);
  const o = run({disp: 'Other'}); assert.equal(o.layout, 'NoProfitLoss'); assert.equal(o.rows.find(x => x.title === 'River Salve beacon').unitExp, 216.2, 'beacon bonus XP is not added (as on the Wiki)');
  assert.ok(o.rows.every(x => !x.costCols && x.materialsCol)); assert.ok(run({disp: 'Barbarian'}).rows.every(x => !x.costCols));
  const ch = run({disp: 'Char'}); assert.ok(ch.rows.every(x => !x.materialsCol && !x.costCols)); assert.deepEqual(ch.headers.slice(0, -1), ['', 'Name', 'Level', 'XP', '# needed']);
  const dh = run({disp: 'Daemonheim'}).rows[0], k = C.skillCalcCost(dh, () => null); assert.equal(k.costEach, 225); assert.equal(k.currency, 'rusty'); assert.equal(k.costTotal, 225 * dh.needed);
  const inc = run({disp: 'Incense Sticks (scratch + ashing)'}); assert.equal(inc.layout, 'ProfitLoss'); assert.equal(inc.headers[9], 'Profit/XP');
  const bon = run({}).rows.find(x => x.name === 'Logs'), kb = C.skillCalcCost(bon, (n, role) => (role === 'product' ? null : 1000));
  assert.equal(kb.costEach, 1000); assert.equal(kb.costPerXp, 20, 'a missing product price never blocks a cost-only row'); }
// 3b. every picture the engine can show has an official Wiki file
{ const I = J('data/calc/images.json').items, miss = new Set();
  for (const disp of D.catOrder) for (const r of run({disp}).rows)
    for (const n of [r.item.icon || r.item.image || r.name, ...r.listed.map(l => l.image || l.name)]) if (!I[n] || !/^icons\//.test(I[n].src) || !fs.existsSync(path.join(base, I[n].src))) miss.add(n);
  assert.deepEqual([...miss], [], 'firemaking names without a Wiki picture');
  // the Wiki re-uploaded File:Elder longbow (unstrung).png on 2026-11-11 (MrBot); the app follows the current file
  assert.equal(I['Elder longbow (unstrung)'].sha1, '72277ac6be13d3c0866af1c8153109abf4922df4'); }
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
  for (let i = 0; i < 300; i++) { await tick(); if (w.document.querySelector('#live-price-status')?.textContent.includes('Last successful') && w.document.querySelector('#fm-table table')) break; }
  await tick(); assert.deepEqual(errors, [], hash + ' runtime errors');
  return {dom, w, d: w.document};
}
const rows = d => [...d.querySelectorAll('#fm-table tbody tr')];
const row = (d, n) => rows(d).find(tr => tr.querySelector('th .calc-name').textContent === n);
const set = (d, w, k, v) => { const el = d.querySelector('#fm-' + k); assert.ok(el, 'field ' + k); if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', {bubbles: true})); };
const cells = tr => [...tr.querySelectorAll('td')].map(t => t.textContent);
const heads = d => [...d.querySelectorAll('#fm-table thead th')].map(th => th.textContent);
(async () => {
  let {dom, w, d} = await screen('calculators/firemaking');
  assert.equal(d.querySelector('#fm-title').textContent, 'Firemaking calculator');
  // Wiki form order, labels and defaults (Calculator:Firemaking rev 37106768 jcConfig)
  assert.deepEqual([...d.querySelectorAll('#fm-form [data-k], #fm-form .hb-fixed')].map(e => e.id), ['fm-currToggle', 'fm-current', 'fm-goalToggle', 'fm-goal', 'fm-avatar', 'fm-outfit', 'fm-custom', 'fm-portable', 'fm-disp', 'fm-bxp']);
  assert.deepEqual([...d.querySelectorAll('#fm-form .hb-field > span, #fm-form .hb-chk')].map(e => e.textContent.trim()), D.form.params.filter(p => !['hs', 'hidden'].includes(p.type) && p.name !== 'bxpnum').map(p => p.label));
  assert.equal(d.querySelector('#fm-currToggle').value, 'Experience'); assert.equal(d.querySelector('#fm-goal').value, '2'); assert.equal(d.querySelector('#fm-disp').value, 'Bonfire'); assert.equal(d.querySelector('#fm-custom').value, '0');
  assert.equal(d.querySelector('#fm-custom').getAttribute('inputmode'), 'decimal');
  assert.deepEqual([...d.querySelectorAll('#fm-disp option')].map(o => o.value), D.form.params.find(p => p.name === 'disp').range.split(/\s*,\s*/));
  assert.deepEqual(heads(d), ['Level', 'Name', 'XP', '# needed', 'Materials', 'Unit cost', 'Product cost', 'XP cost']);
  assert.equal(d.querySelector('#fm-msg').textContent, 'To train Firemaking from 1 experience (level 1) to 83 experience (level 2), 82 experience is required.');
  // nothing is sold: no net/gross choice, cost sorts
  assert.equal(d.querySelector('#fm-show').hidden, true); assert.equal(d.querySelector('#fm-show-help').hidden, true);
  assert.deepEqual([...d.querySelectorAll('#fm-sort option')].map(o => o.textContent), ['Sort: as on the Wiki', 'Sort: lowest total cost', 'Sort: lowest cost/XP', 'Sort: most XP each', 'Sort: fewest actions']);
  set(d, w, 'currToggle', 'Level'); set(d, w, 'goal', '99');
  { const r = run({}).rows.find(x => x.name === 'Logs'), td = cells(row(d, 'Logs'));
    // live: Buy 1000 for 1 Logs per action
    assert.equal(td[1], String(r.unitExp)); assert.equal(td[2], r.needed.toLocaleString('en-GB'));
    assert.equal(td[4], '1,000 gp'); assert.equal(td[5], (1000 * r.needed).toLocaleString('en-GB') + ' gp'); assert.equal(td[6], '20 gp');
    assert.equal(row(d, 'Logs').querySelector('.calc-val.gain, .calc-val.loss'), null); assert.ok(row(d, 'Logs').querySelector('th img.calc-ico[src^="icons/"]'));
    assert.doesNotMatch(row(d, 'Logs').querySelector('details').textContent, /Sell|tax/); }
  // sort: lowest cost per XP first
  set(d, w, 'sort', 'pxp'); { const v = rows(d).map(tr => cells(tr)[6]).filter(t => /gp$/.test(t)).map(t => +t.replace(/[^\d.]/g, '')); assert.deepEqual(v, [...v].sort((a, b) => a - b)); } set(d, w, 'sort', '');
  // untradeable fuel: the Wiki shows "-" (0); the app marks it partial and not free, never a cost of 0
  { const t = row(d, 'Blisterwood logs'); assert.match(t.textContent, /Partial, not a market profit: excludes untradeable Blisterwood logs/); assert.equal(cells(t)[4].slice(0, 1), '-'); assert.equal(t.querySelector('.calc-val.gain, .calc-val.loss'), null); }
  // the gadget's number field: 2.5% accepted, 2.555 refused with the Wiki's message (table cleared, nothing guessed)
  { const cu = d.querySelector('#fm-custom'); cu.focus(); cu.value = '2.555'; cu.dispatchEvent(new w.Event('input', {bubbles: true}));
    assert.equal(d.querySelector('#fm-custom'), cu); assert.equal(cu.getAttribute('aria-invalid'), 'true'); assert.equal(d.querySelector('#fm-custom-r').textContent, 'Invalid number provided. Must be between 0 and 1600 and a multiple of 0.01');
    assert.equal(d.querySelector('#fm-msg').textContent, 'Custom Boost (%): Invalid number provided. Must be between 0 and 1600 and a multiple of 0.01'); assert.equal(rows(d).length, 0);
    cu.value = '2.5'; cu.dispatchEvent(new w.Event('input', {bubbles: true})); assert.equal(cells(row(d, 'Logs'))[1], String(run({custom: '2.5'}).rows.find(x => x.name === 'Logs').unitExp)); }
  set(d, w, 'custom', '0');
  set(d, w, 'portable', 'Yes'); set(d, w, 'outfit', '2'); assert.equal(cells(row(d, 'Logs'))[1], String(run({portable: 'Yes', outfit: '2'}).rows.find(x => x.name === 'Logs').unitExp)); set(d, w, 'portable', 'No'); set(d, w, 'outfit', '0');
  // per sub-category Wiki layouts
  set(d, w, 'disp', 'Milestones'); assert.deepEqual(heads(d), ['Level', 'Name', 'XP', '# needed', 'Materials', 'Unit cost', 'Product cost', 'Profit/XP']); assert.ok(row(d, 'Norma logs'));
  set(d, w, 'disp', 'Char'); assert.deepEqual(heads(d), ['Level', 'Name', 'XP', '# needed']);
  set(d, w, 'disp', 'Barbarian'); assert.deepEqual(heads(d), ['Level', 'Name', 'XP', '# needed', 'Materials']); assert.ok(row(d, 'Wooden pyre ship'));
  set(d, w, 'disp', 'Other'); assert.deepEqual(heads(d), ['Level', 'Name', 'XP', '# needed', 'Materials']); assert.equal(cells(row(d, 'River Salve beacon'))[1], '216.2');
  set(d, w, 'disp', 'Daemonheim'); { const td = cells(row(d, 'Tangle gum branches')); assert.equal(td[4], '225 rusty'); assert.match(td[6], /^9 rusty/); }
  set(d, w, 'disp', 'Standard'); assert.ok(row(d, 'Replace Dorgeshuun light orb'));
  set(d, w, 'disp', 'Incense Sticks (scratch + ashing)'); assert.deepEqual(heads(d), ['Level', 'Name', 'XP', '# needed', 'Materials', 'Raw cost', 'Product cost', 'Profit/Loss', 'Profit/XP']);
  assert.equal(d.querySelector('#fm-show').hidden, false); assert.equal(d.querySelector('#fm-show-help').hidden, false); assert.equal(d.querySelector('#fm-sort option[value="profit"]').textContent, 'Sort: most profit');
  set(d, w, 'disp', 'Bonfire');
  // bonus XP sentence, Level>120 note, favourite + persistence
  { set(d, w, 'bxp', true); const bx = d.querySelector('#fm-bxpnum'); bx.value = '50000'; bx.dispatchEvent(new w.Event('input', {bubbles: true}));
    assert.match(d.querySelector('#fm-msg').textContent, /^To train Firemaking from 0 experience \(level 1\) to 13,034,431 experience \(level 99\), 12,984,431 experience is required\. \(50,000 bonus XP available; 13,034,431 XP to the goal in total\.\)$/); }
  set(d, w, 'goal', '130'); assert.equal(d.querySelector('#fm-goal-r').textContent, 'Above 120 the Wiki reads this as experience: 130 XP, not level 130'); set(d, w, 'goal', '99');
  set(d, w, 'custom', '1.25');
  d.querySelector('#fm-star').click(); assert.ok(C.load(w.localStorage).some(f => f.path === '/w/Calculator:Firemaking'));
  const store = {[C.FAV_KEY]: w.localStorage.getItem(C.FAV_KEY), dch_calc_firemaking_v1: w.localStorage.getItem('dch_calc_firemaking_v1')}; dom.window.close();
  ({dom, w, d} = await screen('calculators/firemaking', store));
  assert.equal(d.querySelector('#fm-custom').value, '1.25'); assert.equal(d.querySelector('#fm-bxpnum').value, '50000'); assert.equal(d.querySelector('#fm-disp').value, 'Bonfire');
  d.querySelector('#fm-reset').click(); assert.equal(d.querySelector('#fm-custom').value, '0'); assert.equal(d.querySelector('#fm-currToggle').value, 'Experience');
  dom.window.close();
  // missing / stale prices are unavailable, never 0
  const st0 = {dch_calc_firemaking_v1: JSON.stringify({actions: [['currToggle', 'Level'], ['goal', '99']]})};
  ({dom, w, d} = await screen('calculators/firemaking', st0, {over: {Logs: null}})); assert.match(row(d, 'Logs').textContent, /Unavailable/); assert.doesNotMatch(row(d, 'Oak logs').textContent, /Unavailable/); dom.window.close();
  ({dom, w, d} = await screen('calculators/firemaking', st0, {age: 3600})); assert.match(row(d, 'Logs').textContent, /Unavailable/); dom.window.close();
  console.log(`PASS firemaking: ${cmp.cases} Wiki golden cases (${cmp.rows} rows, ${cmp.cells} cells, ${cmp.messages} goal sentences, ${cmp.npl} cost-only rows), ${F.cases.length} gadget form sequences, number field, refused options, pictures, screen: Wiki form order/IDs/labels/defaults, per-sub-category headers, live costs, untradeable never free, rusty coins, incense profit table, BXP sentence, Level>120 note, favourite, persistence, reset, missing/stale unavailable`);
})().catch(e => { console.error(e); process.exit(1); });
