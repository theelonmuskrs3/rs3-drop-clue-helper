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
assert.deepEqual(cmp.fails, []); assert.equal(cmp.cases, 66); assert.equal(cmp.messages, 66, "every golden goal sentence (incl. bonus XP over half, goal below current, Level>120) matches the Wiki text"); assert.ok(cmp.rows >= 2899 && cmp.cells >= 34000, JSON.stringify(cmp));
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
// 4. the app screen: not offered (owner decision 2026-11-11, decanting-only). The engine goldens above still run; the old
//    #calculators/cooking route goes to Flask decanting and this screen is never rendered (tests/calculators.test.cjs). The screen
//    test that ran before is in git history (26bc8a6d1).
assert.equal(C.nativeBySlug('cooking'), null, 'cooking is not offered in the app');
console.log(`PASS cooking engine: ${cmp.cases} Wiki golden cases (${cmp.rows} rows, ${cmp.cells} cells), ${F.cases.length} gadget form sequences, refused options; not offered in the app (decanting-only)`);
