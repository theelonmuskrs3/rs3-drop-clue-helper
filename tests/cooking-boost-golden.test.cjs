// Wiki renders for the bonusGenerator quirk the port keeps (tests/fixtures-cooking-boost-golden.json): XP each and # needed per row.
const assert = require('assert'), path = require('path');
const C = require('../calculators.js'), D = require('../data/calc/cooking.json'), G = require('./fixtures-cooking-boost-golden.json');
const n = t => Number(String(t).replace(/,/g, ''));
let cells = 0;
for (const c of G.cases) {
  const R = C.skillCalcRun(D, Object.entries(c.args)); assert.ok(!R.error, c.name + ': ' + R.error);
  assert.equal(R.rows.length, c.rows.length, c.name + ' rows');
  c.rows.forEach((w, i) => { if (w.ragged) return; assert.equal(R.rows[i].unitExp, n(w.xp), c.name + ' xp ' + w.name); assert.equal(R.rows[i].needed, n(w.needed), c.name + ' needed ' + w.name); cells += 2; });
}
console.log('cooking boost goldens:', G.cases.length, 'Wiki renders,', cells, 'cells match');
