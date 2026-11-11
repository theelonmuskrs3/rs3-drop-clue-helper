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
// 4. the app screen: not offered (owner decision 2026-11-11, decanting-only). The engine goldens above still run; the old
//    #calculators/crafting route goes to Flask decanting and this screen is never rendered (tests/calculators.test.cjs). The screen
//    test that ran before is in git history (26bc8a6d1).
assert.equal(C.nativeBySlug('crafting'), null, 'crafting is not offered in the app');
console.log(`PASS crafting engine: ${cmp.cases} Wiki golden cases (${cmp.rows} rows, ${cmp.cells} cells), ${F.cases.length} gadget form sequences, refused options; not offered in the app (decanting-only)`);
