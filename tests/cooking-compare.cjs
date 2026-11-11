// Compare a native skill engine (Cooking, Fletching, ...) (RS3Calc.skillCalcRun/skillCalcCost) with the Wiki goldens, cell by cell. Exported for tests/cooking.test.cjs.
const fs = require('node:fs'), path = require('node:path'); const C = require('../calculators.js');
const base = path.resolve(__dirname, '..'), J = f => JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
const num = t => { if (t == null) return null; t = String(t).replace(/,/g, '').replace(/\u2212/g, '-').trim(); return t === '' || t === '-' ? null : Number(t); };
function qtyText(v) { let a = v; if (a > 100) a = Math.ceil(a); else if (!(a < 0.1)) a = Math.ceil(a * 100) / 100; return a; }
function compare(D, G, opt = {}) {
  const prices = G.prices, out = {cases: 0, rows: 0, cells: 0, fails: []};
  const all = [...G.cases.map(c => ({c, sub: Object.entries(c.args)})), ...(G.formCases || []).map(c => ({c, sub: c.submission}))];
  for (const {c, sub} of all) {
    out.cases++;
    const R = C.skillCalcRun(D, sub);
    const bad = m => out.fails.push(c.name + ': ' + m);
    if (c.error) { if (!R.error) bad('Wiki errors (' + c.error + ') but engine returned rows'); continue; }
    if (R.error) { bad('engine error ' + R.error); continue; }
    const head = c.head; const hx = h => head.indexOf(h);
    if (JSON.stringify(head.slice(0, -1)) !== JSON.stringify(R.headers.slice(0, -1)) || !/Members/.test(R.headers.at(-1))) bad('headers ' + JSON.stringify(head) + ' vs ' + JSON.stringify(R.headers));
    // the goal sentence the app shows must equal the Wiki's, character for character (bonus XP adds a separate note after it)
    { const ws = /^To train .*? experience is required\./.exec(c.message), as = C.skillCalcMessage(R); out.messages = (out.messages || 0) + 1;
      if (!ws || !(as === ws[0] || as.startsWith(ws[0] + ' ('))) bad('message: wiki "' + (ws && ws[0]) + '" vs app "' + as + '"');
      if (R.bonusXp > 0 && !as.endsWith(` (${R.bonusXp.toLocaleString('en-GB')} bonus XP available; ${R.actualRemaining.toLocaleString('en-GB')} XP to the goal in total.)`)) bad('bonus XP note ' + as); }
    const m = /from ([\d,]+) experience \(level (\d+)\) to ([\d,]+) experience \(level (\d+)\), ([\d,]+) experience is required/.exec(c.message);
    if (m) { const [cx, cl, gx, gl, rq] = [m[1], m[2], m[3], m[4], m[5]].map(num); if (cx !== R.currXp || cl !== R.currLv || gx !== R.goalXp || gl !== R.goalLv) bad('message ' + c.message + ' vs ' + [R.currXp, R.currLv, R.goalXp, R.goalLv]); out.msgRemaining = rq; if (rq !== R.remaining) bad('message experience required ' + rq + ' vs engine remaining ' + R.remaining); }
    if (c.rows.length !== R.rows.length) { bad('rows ' + c.rows.length + ' vs ' + R.rows.length); continue; }
    c.rows.forEach((w, i) => {
      out.rows++; const r = R.rows[i];
      // the Wiki dropped the members cell (targetElt past the row end): every other cell is still compared
      const noMember = w.ragged && r.memberCell === false && !r.truncated && w.cells.length === head.length - 1;
      if (r.memberCell === false && !noMember) bad(`row ${i} members cell: app drops it, wiki has ${w.cells.length} of ${head.length} cells`);
      if (!noMember && (w.ragged || r.truncated)) { out.cells++; if (!(w.ragged && r.truncated && w.cells.length === 2 && w.cells[1].t === (r.title || r.name))) bad(`row ${i} truncation: wiki ${w.cells.length} cells vs app truncated=${r.truncated}`); out.truncated = (out.truncated || 0) + 1; return; }
      void 0, cells = w.cells, T = h => cells[hx(h)] && cells[hx(h)].t, chk = (what, a, b) => { out.cells++; if (!(a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))))) bad(`row ${i} ${r.name} ${what}: wiki ${a} vs app ${b}`); };
      chk('class', (w.cls.find(x => x.startsWith('table-bg-')) || '').slice(9), r.cls);
      chk('name', T('Name'), [r.sLink, (r.title || r.name) + (r.multiplier ? ' \u00d7 ' + r.multiplier : ''), r.eLink].filter(Boolean).join(' '));
      if (hx('Level') >= 0) chk('level', num(T('Level')), r.level);
      chk('xp', num(T('XP')), r.unitExp);
      chk('needed', num(T('# needed')), r.needed);
      if (hx('# urns') >= 0) chk('urns', (s => s === -1000000000 ? 0 : s)(num(cells[hx('# urns')].s)), r.urnColumn ? r.urnsNeeded : null);
      if (noMember) out.noMemberCell = (out.noMemberCell || 0) + 1; else chk('members', num(cells[cells.length - 1].s), r.members ? 1 : 0);
      if (w.ragged) { out.ragged = (out.ragged || 0) + 1; }
      // the Wiki's gePrice is 0 for a name it has no price for; opt.missingAsZero reproduces that for golden comparison only
      const k = C.skillCalcCost(r, n => (n in prices ? prices[n] : opt.missingAsZero ? 0 : null));
      const money = (h, v) => { if (hx(h) < 0 || w.ragged) return; const cell = cells[hx(h)], s = num(cell.s); chk(h, s === -1000000000 ? 0 : s, v); };
      // generate_NoProfitLoss (Firemaking): Unit cost, "Product cost" (the Wiki's label for unit cost x actions) and cost per XP
      // (labelled "XP cost", or "Profit/XP" in Milestones); Barbarian/Other/Char have none of them
      if (r.layout === 'NoProfitLoss') { out.npl = (out.npl || 0) + 1; const xpH = hx('XP cost') >= 0 ? 'XP cost' : 'Profit/XP';
        if (r.costCols !== (hx('Unit cost') >= 0)) bad(`row ${i} cost columns: wiki ${hx('Unit cost') >= 0} vs app ${r.costCols}`);
        if (r.materialsCol !== (hx('Materials') >= 0)) bad(`row ${i} materials column: wiki ${hx('Materials') >= 0} vs app ${r.materialsCol}`);
        money('Unit cost', k.costEach); money('Product cost', k.costTotal); if (hx(xpH) >= 0) money(xpH, k.costEach === 0 ? 0 : k.costPerXp); }
      else if (D.cats && c.args && c.args.disp === 'Urns' || (c.submission && 0)) money('Cost', k.raw);
      else { money('Raw cost', k.raw); money('Product cost', k.prod); money('Profit/Loss', k.profit); if (hx('Profit/XP') >= 0 && !w.ragged) { const s = num(cells[hx('Profit/XP')].s); chk('Profit/XP', s === -1000000000 ? 0 : s, k.profitPerXp == null ? null : (k.profitEach === 0 ? 0 : k.profitPerXp)); } }
      // opt.redlinks: ingredient files missing on the Wiki (File:Koi Scales.png) render as a text link next to the name link, so the
      // golden parser reads the name twice; collapse only that adjacent pair, only for the names listed by the test
      if (w.mats) { const names = w.mats.names.filter((n, j, a) => !(opt.redlinks && opt.redlinks.includes(n) && j > 0 && a[j - 1] === n)); const mine = r.listed.map(l => l.name); chk('material names', names.join('|'), mine.join('|'));
        const qs = (w.mats.text.match(/(?:^|\s)([\d,]+(?:\.\d+)?)(?=\s)/g) || []).map(num); chk('material qty', qs.join('|'), r.listed.map(l => qtyText(l.qty * r.needed)).join('|')); }
    });
  }
  return out;
}
module.exports = {compare};
if (require.main === module) { const r = compare(J('data/calc/cooking.json'), J('tests/fixtures-cooking-golden.json')); console.log(JSON.stringify({cases: r.cases, rows: r.rows, cells: r.cells, ragged: r.ragged, fails: r.fails.length}), '\n' + r.fails.slice(0, 40).join('\n')); }
