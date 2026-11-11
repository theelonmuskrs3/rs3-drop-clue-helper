// Money tab accuracy: the app's own estimate code (app.js mmCalc/mmLive), run on the real 878-method data.
// 1) Wiki golden: priced with the Wiki's own GE snapshot (data/prices.json, Module:GEPrices 21 Oct 2026) the estimate
//    reproduces the Wiki guide's own profit figure (pw) — even when every trade is days old (no 15-minute cut-off).
// 2) Policy: latest trade any age; no trade -> GE guide price (G); Wiki fixed values untaxed; Coins 1 gp untaxed;
//    unpriceable -> no estimate (never 0) and the Wiki figure is the labelled basis; no Wiki figure -> none.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), vm = require('node:vm');
const base = path.resolve(__dirname, '..');
const P = require('../live-prices.js');
const app = fs.readFileSync(path.join(base, 'app.js'), 'utf8');
const extract = (a, b) => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a)));
const X = JSON.parse(fs.readFileSync(path.join(base, 'data/money.json')));
const S = JSON.parse(fs.readFileSync(path.join(base, 'data/prices.json')));
const models = {};
for (let i = 0; i < X.stats.shards; i++) for (const p of JSON.parse(fs.readFileSync(path.join(base, `data/mm/${i}.json`))).p) for (const m of p.m) models[m.id] = m;
assert.equal(Object.keys(models).length, 878);
function ctx(book, guide = {}) {
  const c = {LIVE: {book}, RS3Prices: P, GUIDE: {prices: guide}, fdAge: t => 'AGE' + t, MM: {models}, Number, Date, Math, Map, Set, Object, String, Infinity};
  vm.createContext(c); vm.runInContext(extract('let MM_LC = null;', 'async function mmLoadModels') + ';this.MM_WIKI_NONE=MM_WIKI_NONE;', c); c.MM_GE = 'Oct 21, 2026'; return c;
}
const T = Date.now(), OLD = T / 1000 - 5 * 86400;
// 1) Wiki golden on the Wiki's own snapshot prices, 5-day-old trade times
{ const names = Object.keys(S.prices), b = new P.PriceBook();
  b.setMapping(names.map((n, i) => ({id: i + 1, name: n})));
  const data = {}; names.forEach((n, i) => { data[i + 1] = {high: S.prices[n], low: S.prices[n], highTime: OLD, lowTime: OLD}; });
  b.setLatest({data}, T);
  const c = ctx(b); let est = 0, eq = 0, near = 0; const off = [], nearL = [];
  for (const r of X.rows) { const m = models[r.id], e = c.mmCalc(m); if (!e.complete) continue; est++;
    const tol = 1 + (m.inp.length + m.out.length) * 2 * (m.at ? 60 / m.at : 1);
    if (r.pw != null && Math.abs(e.profit - r.pw) <= tol) eq++; else if (r.pw != null && Math.abs(e.profit - r.pw) <= Math.max(tol, Math.abs(r.pw) * 0.001)) { near++; nearL.push([r.id, Math.round(e.profit), r.pw, models[r.id].inp.concat(models[r.id].out).some(l => l.d)]); } else off.push([r.id, Math.round(e.profit), r.pw]); }
  console.log(`Wiki golden: ${est} methods estimable on Wiki snapshot prices (trades 5 days old); ${eq} equal the Wiki guide's own profit figure (±rounding), ${near} within 0.1% (Wiki rounds quantities), differ more: ${off.length}`, off.slice(0, 8)); if (process.env.MM_NEAR) console.log(nearL);
  assert.ok(est >= 700, 'old trades are used (Items-tab policy), not cut off at 15 min');
  assert.equal(off.length, 0, 'every estimable method within 0.1% of the Wiki figure'); assert.ok(eq >= 725, 'exact (±rounding) for nearly all');
  assert.ok((eq + near) / est >= 0.9, 'estimate reproduces the Wiki figure for the large majority');
  // named goldens: Wiki figure reproduced exactly
  for (const id of ['adding-herbs-to-incense-sticks-spirit-weed', 'big-game-hunter-tier-1-dinosaurs', 'cleansing-the-gate-of-elidinis']) {
    const e = c.mmCalc(models[id]); assert.ok(e.complete, id); assert.ok(Math.abs(e.profit - models[id].pw) <= Math.abs(models[id].pw) * 0.001, id + ' ' + e.profit + ' vs Wiki ' + models[id].pw); }
  const bg = c.mmCalc(models['big-game-hunter-tier-1-dinosaurs']); assert.ok(bg.nW >= 4, 'Wiki fixed values for untradeable outputs');
  assert.equal(c.mmCalc(models['adding-herbs-to-incense-sticks-spirit-weed']).oldest, OLD);
}
// 2) policy on a small book
{ const b = new P.PriceBook(); b.setMapping([{id: 1, name: 'Input'}, {id: 2, name: 'Output'}, {id: 3, name: 'Beer'}, {id: 4, name: 'Nolive'}, {id: 29492, name: 'Bond'}]);
  b.setLatest({data: {1: {high: 120, highTime: OLD, low: 90, lowTime: OLD}, 2: {high: 250, highTime: OLD, low: 200, lowTime: OLD}, 3: {high: 2, highTime: OLD, low: 1, lowTime: OLD}}}, T);
  const c = ctx(b, {4: {price: 1000, timestamp: '2026-11-11T07:14:00.000Z'}});
  const m = {wf: 'c', tg: [], inp: [{n: 'Input', q: 2}], out: [{n: 'Output', q: 3}]};
  let e = c.mmCalc(m); assert.equal(e.complete, true); assert.equal(e.profit, 3 * (200 - 4) - 240); assert.equal(e.tax, 12); assert.equal(e.oldest, OLD);
  e = c.mmCalc({...m, out: [{n: 'Nolive', q: 3}]}); assert.equal(e.profit, 3 * (1000 - 20) - 240, 'no trade: GE guide price, taxed'); assert.equal(e.nG, 1);
  e = c.mmCalc({...m, out: [{n: 'Untradeable thing', q: 2, v: 5000}]}); assert.equal(e.profit, 10000 - 240, 'Wiki value untaxed, as the Wiki'); assert.equal(e.nW, 1);
  e = c.mmCalc({...m, out: [{n: 'Coins', q: 300}]}); assert.equal(e.profit, 60); assert.equal(e.tax, 0);
  e = c.mmCalc({...m, out: [{n: 'Bond', q: 1}]}); assert.equal(e.complete, false, 'Bond has no trade here and no guide: no estimate');
  e = c.mmCalc({...m, inp: [{n: 'beer', q: 10}]}); assert.equal(e.cost, 20, 'same name, other capitalisation only');
  e = c.mmCalc({...m, out: [{n: 'Snake hidee', q: 1}]}); assert.equal(e.complete, false); assert.equal(e.profit, null); assert.match(e.why, /Snake hidee \(not a Grand Exchange item\)/);
  e = c.mmCalc({...m, out: [{n: 'Nothing', q: 1, cv: 1}]}); assert.equal(e.complete, false);
  e = c.mmCalc({...m, tg: ['pp']}); assert.match(e.why, /no complete item formula/);
  e = c.mmCalc({...m, g: 'rec', run: 1, at: 3}); assert.equal(e.profit, (3 * (200 - 4) - 240) * 20, 'per hour of activity');
  assert.equal(c.mmCalc({...m, g: 'rec', run: 1}).complete, false);
  c.MM.models = {a: m, w: {...m, tg: ['pp']}, n: {...m, tg: ['pp']}};
  assert.equal(c.mmLive({id: 'a', tg: []}).basis, 'est');
  assert.equal(c.mmLive({id: 'w', pw: 777, tg: []}).basis, 'wiki'); assert.equal(c.mmLive({id: 'w', pw: 777, tg: []}).value, 777);
  assert.equal(c.mmLive({id: 'n', tg: []}).basis, 'none'); assert.equal(c.mmLive({id: 'n', tg: []}).value, null);
  b.setMapping([{id: 1, name: 'Input'}]); c.MM.calc = null; b.mapping = new Map(); assert.match(c.mmCalc(m).why, /loading/);
}
// 2b) the nine without a parsed Wiki figure: seven use the figure the Wiki page renders (revision recorded), two are sourced 'no figure'
{ const b = new P.PriceBook(); b.setMapping([{id: 1, name: 'X'}]); const c = ctx(b);
  const want = {'killing-abyssal-lords': 8253884, 'killing-elite-profane-scabarites-afk': 9758092, 'making-large-historic-component-crates': 8661720, 'mining-animica-dark-animica': 1628698, 'mining-animica-light-animica': 1708310, 'mining-banite': 4860447, 'mining-concentrated-coal-rocks': 2429140};
  for (const r of X.rows.filter(r => r.pw == null)) { const e = c.mmLive(r);
    if (want[r.id]) { assert.equal(e.basis, 'wiki', r.id); assert.equal(e.value, want[r.id], r.id); assert.match(e.wiki.label, /Wiki page figure, GE prices Nov 11, 2026, after tax/); }
    else { assert.equal(e.basis, 'none', r.id); assert.ok(c.MM_WIKI_NONE[r.id], r.id + ' has a sourced reason'); } }
  assert.equal(X.rows.filter(r => r.pw == null).length, 9); }
// 3) UI wording, coins icon, Items default
assert.doesNotMatch(app, /Live estimate incomplete \/ unavailable|not live-ranked/);
assert.match(app, /Wiki figure, GE prices/);
assert.match(fs.readFileSync(path.join(base, 'neon.css'), 'utf8'), /\.gpc::before\{content:"";[^}]*background:url\(icons\/1c41f66de5ec\.webp\)/);
{ const css = fs.readFileSync(path.join(base, 'neon.css'), 'utf8'); assert.match(css, /\.gp::before\{content:"";[^}]*1c41f66de5ec/); assert.match(css, /\.gp \.gpc::before\{content:none\}/, 'no second coin inside an amount already styled .gp');
  // every app place that nests the shared amount inside .gp relies on that rule
  assert.ok((app.match(/class="gp"[^>]*>\$\{(mmGpH|gpH)\(/g) || []).length >= 2); }
assert.ok(fs.existsSync(path.join(base, 'icons/1c41f66de5ec.webp')), 'Wiki Coins icon asset is in the app');
assert.match(app, /if \(name === '~all' \|\| !name\) return allView\(\);\n  if \(name === '~search'\) name = '';/);
assert.match(app, /b\('#items\/~search', 'Search · rarity · prices', 'search'\)/);
console.log('PASS money accuracy: Wiki golden, price policy, labelled Wiki fallback, coins icon, Items default');
