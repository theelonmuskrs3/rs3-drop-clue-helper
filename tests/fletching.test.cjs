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
// 1b. the goal sentence: every golden case above already matches the Wiki's text (compare); edge cases by the Lua formula
{ assert.equal(cmp.messages, 32);
  const M = o => C.skillCalcMessage(C.skillCalcRun(D, Object.entries({currToggle: 'Level', current: '1', goalToggle: 'Level', goal: '80', skill: 'Fletching', disp: 'Arrows', ...o})));
  assert.equal(M({current: '60', goal: '50', bxp: '1', bxpnum: '50000'}), 'To train Fletching from 273,742 experience (level 60) to 101,333 experience (level 50), 0 experience is required. (50,000 bonus XP available; 0 XP to the goal in total.)');
  assert.equal(M({bxp: '1', bxpnum: '99999999'}), 'To train Fletching from 0 experience (level 1) to 1,986,068 experience (level 80), 993,034 experience is required. (99,999,999 bonus XP available; 1,986,068 XP to the goal in total.)', 'bonus XP covers at most half');
  assert.equal(M({bxp: '1', bxpnum: '0'}), 'To train Fletching from 0 experience (level 1) to 1,986,068 experience (level 80), 1,986,068 experience is required.');
  assert.equal(M({bxp: '0', bxpnum: '50000'}), 'To train Fletching from 0 experience (level 1) to 1,986,068 experience (level 80), 1,986,068 experience is required.');
  // Goal "Level" above 120 is experience on the Wiki (live render 2026-11-11: "...to 130 experience (level 2), 130 experience is required.")
  assert.equal(M({goal: '130'}), 'To train Fletching from 0 experience (level 1) to 130 experience (level 2), 130 experience is required.'); }
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
// 4. the app screen: not offered (owner decision 2026-11-11, decanting-only). The engine goldens above still run; the old
//    #calculators/fletching route goes to Flask decanting and this screen is never rendered (tests/calculators.test.cjs). The screen
//    test that ran before is in git history (26bc8a6d1).
assert.equal(C.nativeBySlug('fletching'), null, 'fletching is not offered in the app');
console.log(`PASS fletching engine: ${cmp.cases} Wiki golden cases (${cmp.rows} rows, ${cmp.cells} cells), ${F.cases.length} gadget form sequences, refused options; not offered in the app (decanting-only)`);
