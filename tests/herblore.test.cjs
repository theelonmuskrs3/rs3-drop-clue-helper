// Native Calculator:Herblore: Wiki golden rows (every row of 36 Wiki renders), engine edge cases, live-price conventions and DOM route.
// NODE_PATH=/workspace/ge-dom-tests/node_modules node tests/herblore.test.cjs
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const C = require('../calculators.js'), prices = require('../live-prices.js');
const D = JSON.parse(fs.readFileSync(path.join(base, 'data/calc/herblore.json'), 'utf8'));
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-herblore-golden.json'), 'utf8'));
const DEF = JSON.parse(fs.readFileSync(path.join(__dirname, 'herblore-defaults.json'), 'utf8'));
const tick = () => new Promise(r => setTimeout(r, 10));

/* ---- sources ---- */
assert.equal(D.path, '/w/Calculator:Herblore'); assert.equal(C.nativeFor(D.path), null, 'not offered (decanting-only)');
assert.equal(C.nativeFor('/w/Calculator:Herblore/Flask_decanting').slug, 'flask-decanting', 'Flask decanting mapping unchanged');
assert.deepEqual(Object.fromEntries(Object.entries(D.source).map(([k, v]) => [k, v.revid])), {
  'Calculator:Herblore': 37008978, 'Module:Skill calc/Herblore': 36813069, 'Module:Skill calc/Herblore/data': 37201040,
  'Module:Experience': 35948183, 'Module:Experience/data': 35392677, 'Module:GEIDs/data.json': 37236241});
assert.match(D.license, /CC BY-NC-SA 3\.0/);
assert.equal(FX.engineRevision, 36813069); assert.equal(FX.dataRevision, 37201040);
assert.equal(D.xp.length, 120); assert.equal(D.xp[98], 13034431); assert.equal(D.xp[119], 104273167);
assert.equal(D.ids['Vial'], 229); assert.equal(D.ids['Potion flask'], 23191); assert.equal(D.ids['Vial of water'], 227);
for (const [n, id] of Object.entries(D.ids)) assert.ok(Number.isSafeInteger(id) && id > 0, n);
// every Grand Exchange-priced item in the recipes has an exact item ID (the one exception the Wiki also cannot price)
{ const miss = new Set();
  const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (typeof o.name === 'string' && (o.price == null || o.price === 'gemw') && o.mats !== undefined | o.qty !== undefined) { const n = o.price_name || o.name; if (D.ids[n] == null) miss.add(n); } Object.values(o).forEach(walk); } };
  for (const c of [...D.data.all_categories_outside_daemonheim, 'overload_variants', 'grinding', 'telekinetic_grind', 'manual_filling', 'humidify', 'coconut']) walk(D.data[c]);
  assert.deepEqual([...miss].sort(), ['Sanguine matter', 'Vial (Dungeoneering)']); }   // not on the Grand Exchange: the Wiki prices them 0, the app shows them unavailable

/* ---- Wiki golden: every row of every case, at the Wiki's own guide prices (Module:GEPrices/data.json revision FX.gePricesRevision) ---- */
const UNKNOWN = new Set(['calcvalue', 'dung']);   // Wiki-computed values the app cannot reproduce (shown as unavailable in the app)
const methodOf = l => String(l.price || 'gemw').toLowerCase();
const guide = (n, m) => m === 'gemw' ? (FX.prices[n] ?? 0) : m === 'no' ? 0 : UNKNOWN.has(m) ? null : Number(m);
const g14 = x => Number(Number(x).toPrecision(14));
const sorted = a => [...a].sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
const dur = ticks => { let t = Math.ceil(ticks * 0.6); const p = [[86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']].map(([s, u]) => { const k = Math.floor(t / s); t -= k * s; return k ? `${k.toLocaleString('en-GB')} ${u}${k === 1 ? '' : 's'}` : null; }).filter(Boolean); return p.length > 1 ? p.slice(0, -1).join(', ') + ' and ' + p[p.length - 1] : p[0]; };
const stats = {cases: 0, rows: 0, pricedRows: 0, unpricedRows: 0, flagged: 0, flaggedMatched: 0, lines: 0};
function compareCase(cs, args) {
  stats.cases++;
  const res = C.herbloreRun(D, args, (n, m) => guide(n, m));
  assert.equal(res.rows.length, cs.rows.length, cs.name + ' row count');
  assert.equal(`To train Herblore from ${res.currXp.toLocaleString('en-GB')} experience (level ${res.currLevel}) to ${res.targetXp.toLocaleString('en-GB')} experience (level ${res.targetLevel}), ${res.remaining.toLocaleString('en-GB')} experience is required.`, cs.message, cs.name);
  assert.equal(cs.head.includes('Products'), !res.hideProducts && (args.product_mode || 'Hidden') !== 'Hidden', cs.name + ' products column'); assert.equal(cs.head.includes('Total value'), !res.hideProducts && args.show_profit !== 'false', cs.name + ' profit columns');
  const pool = new Map(); for (const r of res.rows) { const k = r.level + '|' + r.item_alias + r.recipe_idx; if (!pool.has(k)) pool.set(k, []); pool.get(k).push(r); }
  const order = []; for (const r of res.rows) order.push(r.level + '|' + r.item_alias + r.recipe_idx);
  assert.deepEqual(order, cs.rows.map(w => w.level + '|' + w.sort), cs.name + ' row order (level, recipe, recipe index)');
  const sig = a => JSON.stringify(a.map(x => x[0] ?? x.name).sort());
  for (const w of cs.rows) {
    stats.rows++;
    const g = pool.get(w.level + '|' + w.sort);
    let j = g.findIndex(r => sig(r.mats) === sig(w.mats) && g14(r.xp_per_iter) === g14(w.xp) && (!w.steps || sig(r.steps || []) === sig(w.steps)));
    if (j < 0) {   // only allowed where the Wiki chose a decanting dose by a value the app cannot price (Module:Calcvalue); the app flags these rows
      j = g.findIndex(r => r.choice_gaps.length && g14(r.xp_per_iter) === g14(w.xp));
      assert.ok(j >= 0, `${cs.name}: ${w.sort} unmatched`); const fr = g.splice(j, 1)[0]; stats.flagged++;
      const fc = C.herbloreCost(fr, l => guide(l.price_name, methodOf(l)));   // undetermined choice: totals unavailable, never a misleading number
      assert.deepEqual([fc.matTotal, fc.prodTotal, fc.profit, fc.costPerXp, fc.profitPerXp], [null, null, null, null, null], cs.name + ' flagged totals'); assert.ok(fc.undetermined.length); continue;
    }
    const r = g.splice(j, 1)[0];
    const where = `${cs.name}: ${w.recipe}`;
    const undetermined = r.choice_gaps.length > 0;   // a candidate had no price: even if the dose equals the Wiki's, totals are unavailable
    if (undetermined) stats.flaggedMatched++;
    assert.equal(g14(r.xp_per_iter), g14(w.xp), where + ' XP');
    assert.equal(Number((Math.round(r.xp_per_iter * 100) / 100)).toLocaleString('en-GB', {maximumFractionDigits: 2}), w.xpText, where + ' XP text');
    assert.equal(Math.round(r.needed_iterations), w.number, where + ' number');
    if ('ticks' in w) { assert.equal(r.tick, w.ticks, where + ' ticks'); assert.equal(r.tick ? dur(r.tick) : '-', w.timeText, where + ' time'); }
    assert.equal(w.colour[0], r.level > res.targetLevel ? 'table-bg-red' : r.level <= res.currLevel ? 'table-bg-green' : 'table-bg-yellow');
    const parts = [r.item_name + (r.item_multi > 1 ? ' × ' + r.item_multi : '')]; if (Number(r.improved) > 0) parts.push(`(Improved +${r.improved} recipe)`);
    for (const m of [r.method, ...(r.steps || []).map(s => s.method)]) if (m) parts.push(`(${m})`);
    assert.equal(parts.join('|'), w.recipe.replace('| × ', ' × '), where + ' recipe text');
    if (w.steps) assert.deepEqual((r.steps || []).map(s => [s.name, s.qty]), w.steps, where + ' steps (order and quantity)');
    const priced = ![...r.mats, ...r.products].some(l => UNKNOWN.has(methodOf(l)));
    const cost = C.herbloreCost(r, l => guide(l.price_name, methodOf(l)));
    const z = x => x === 0 ? null : x;
    const lines = (mine, wiki, what) => {
      assert.deepEqual(mine.map(l => l.name), wiki.map(l => l[0]).length === mine.length && sig(mine) === sig(wiki) ? (() => {   // order: exact, except equal-ranked items whose Wiki order is unspecified
        const ok = mine.map(l => l.name).join() === wiki.map(l => l[0]).join(); if (ok) return wiki.map(l => l[0]);
        const strip = n => n.replace(/ \(\d+\)$/, ''); assert.deepEqual(mine.map(l => strip(l.name)), wiki.map(l => strip(l[0])), where + ' ' + what + ' order'); return mine.map(l => l.name); })() : wiki.map(l => l[0]), where + ' ' + what);
      const byName = new Map(mine.map(l => [l.name, l]));
      for (const [n, q, c] of wiki) { const l = byName.get(n); stats.lines++; if (q !== null) assert.equal(l.qty, q, `${where} ${what} ${n} quantity`); if (priced && c !== null) assert.equal(z(l.cost), c, `${where} ${what} ${n} cost`); }
    };
    lines(r.mats, w.mats, 'materials');
    if (w.products) lines(r.products, w.products, 'products');
    if (priced && undetermined) { assert.equal(cost.matTotal, null, where); assert.equal(cost.profit, null, where); assert.ok(cost.undetermined.length); stats.unpricedRows++; }
    else if (priced) {
      stats.pricedRows++;
      if ('matTotal' in w) { assert.equal(z(cost.matTotal), w.matTotal, where + ' total cost'); assert.equal(cost.costPerXp ?? null, w.costPerXp, where + ' cost/XP'); }
      if ('prodTotal' in w) { assert.equal(z(cost.prodTotal), w.prodTotal, where + ' total value'); assert.equal(cost.profit ?? null, w.profit, where + ' profit'); assert.equal(cost.profitPerXp ?? null, w.profitPerXp, where + ' profit/XP'); }
    } else stats.unpricedRows++;
  }
  return res;
}
for (const cs of FX.cases) compareCase(cs, {...DEF, ...cs.args, ...FX.render});
assert.equal(stats.cases, 39); assert.equal(stats.rows, 2978); assert.ok(stats.flagged <= 13, 'flagged rows: ' + stats.flagged); assert.ok(stats.pricedRows > 2400);
const templateStats = {...stats};

/* ---- licences and attribution on every Herblore artifact ---- */
for (const [f, txt] of [['data/calc/herblore.json', D.license], ['tests/fixtures-herblore-golden.json', FX.license]]) assert.match(txt, /RuneScape Wiki.*CC BY-NC-SA 3\.0/, f);
assert.match(JSON.parse(fs.readFileSync(path.join(__dirname, 'herblore-form-cases.json'), 'utf8')).source, /CC BY-NC-SA 3\.0/);
for (const f of ['tools/calc_herblore.py', 'tools/herblore_form.py', 'tools/lua_data_sandbox.py']) assert.match(fs.readFileSync(path.join(base, f), 'utf8'), /RuneScape Wiki|Wiki/, f);
assert.match(fs.readFileSync(path.join(base, 'app.js'), 'utf8'), /Module:Skill calc\/Herblore \(revision \$\{rev\('Module:Skill calc\/Herblore'\)\}\).*CC BY-NC-SA 3\.0/);

/* ---- engine edge cases ---- */
{ const run = a => C.herbloreRun(D, {...DEF, ...a}, () => 0);
  assert.ok(run({curr_level: '0'}).error); assert.ok(run({curr_toggle: 'Experience', curr_xp: '200000001'}).error); assert.ok(run({target_level: '50.5'}).error);
  const z = run({curr_level: '99', target_level: '50'}); assert.equal(z.remaining, 0);
  assert.ok(z.rows.every(r => r.needed_iterations === 0), 'goal already met: no actions, quantities for one action');
  const one = z.rows.find(r => r.item_name === 'Attack potion (3)'); assert.deepEqual(one.mats.map(m => [m.name, m.qty]), [['Guam potion (unfinished)', 1], ['Eye of newt', 1]]);
  // hidden-field rule: brooch counts only with a portable well (the Wiki form hides it otherwise)
  const a1 = run({portable: 'false', brooch: 'true'}), a0 = run({});
  assert.deepEqual(a1.rows.map(r => r.products.map(p => p.qty)), a0.rows.map(r => r.products.map(p => p.qty)), 'brooch alone changes nothing');
  // Wiki XP stacking: ceil to 0.1 per category; DXP disables desert pantheon / knowledge bomb
  const kb = run({knowledge_bomb: 'Superior', dxp: 'true', category: 'Clean herbs'}).rows[0], dx = run({dxp: 'true', category: 'Clean herbs'}).rows[0];
  assert.equal(kb.xp_per_iter, dx.xp_per_iter); assert.equal(dx.xp_per_iter, 5);
  // "Most profitable primal fruit" with one fruit unpriced: every row using the chosen pulp/fruit is undetermined
  const PF = Object.values(D.data.primal_pulp).map(p => p.mats[0].name);
  const pr = C.herbloreRun(D, {...DEF, category_choice: 'All', raw_material_replacement_mode: 'Most ingredients', primal_pulp_from: 'Most profitable primal fruit', herb_potion_from: 'Keep original'}, n => n === PF[1] ? null : 100);
  const note = pr.notes.find(n => n.pulp); assert.deepEqual(note.unpriced, [PF[1]]);
  const uses = pr.rows.filter(r => (r.steps || []).some(x => x.name === note.pulp) || r.mats.some(m => m.name === note.fruit || m.name === note.pulp));
  assert.ok(uses.length > 0); for (const r of uses) { assert.ok(r.choice_gaps.includes(PF[1])); assert.equal(C.herbloreCost(r, () => 1).matTotal, null); }
}

/* ---- DOM: not offered (owner decision 2026-11-11, decanting-only). The engine goldens and edge cases above still run; the old
   #calculators/herblore route goes to Flask decanting and this screen is never rendered (tests/calculators.test.cjs). The
   screen test that ran before is in git history (26bc8a6d1). ---- */
assert.equal(C.nativeBySlug('herblore'), null, 'herblore is not offered in the app');
{ const T = templateStats; console.log(`PASS herblore engine: template renders ${T.rows} rows in ${T.cases} cases (${T.pricedRows} every cost/profit cell, ${T.unpricedRows} quantities-only or undetermined-choice totals unavailable); all: ${stats.rows} Wiki rows in ${stats.cases} renders, ${stats.lines} item lines; edge cases; not offered in the app (decanting-only)`); }
