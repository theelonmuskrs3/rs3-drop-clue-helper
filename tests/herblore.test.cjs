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
assert.equal(D.path, '/w/Calculator:Herblore'); assert.equal(C.nativeFor(D.path).slug, 'herblore'); assert.equal(C.nativeBySlug('herblore').data, 'data/calc/herblore.json');
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

/* ---- DOM ---- */
const NAMES = Object.keys(D.ids);
async function screen(hash, store = {}, feed = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), {url: 'http://127.0.0.1:8777/index.html#' + hash, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, errors = [];
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
  w.scrollTo = () => {}; w.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  Object.defineProperty(w.navigator, 'serviceWorker', {value: {register() { return Promise.resolve(); }}});
  w.AbortController = AbortController; w.TextEncoder = TextEncoder;
  w.fetch = async url => {
    url = String(url);
    if (url.startsWith(prices.BASE)) {
      if (feed.hang) return new Promise(() => {});
      const ts = Date.now() / 1000 - 30;
      if (url.endsWith('/mapping')) return {ok: true, json: async () => NAMES.map(n => ({id: D.ids[n], name: n}))};
      const data = {}; for (const n of NAMES) data[D.ids[n]] = {high: 1000, low: 900, highTime: ts, lowTime: ts};
      for (const [n, row] of Object.entries(feed.over || {})) { if (row === null) delete data[D.ids[n]]; else data[D.ids[n]] = {highTime: ts, lowTime: ts, ...row}; }
      return {ok: true, json: async () => ({data})};
    }
    try { return {ok: true, json: async () => JSON.parse(fs.readFileSync(path.resolve(base, url.split('?')[0]), 'utf8'))}; }
    catch { return {ok: false, status: 404, json: async () => ({})}; }
  };
  w.addEventListener('error', e => errors.push(e.error));
  for (const f of ['live-prices.js', 'calculators.js', 'map.js']) w.eval(fs.readFileSync(path.join(base, f), 'utf8'));
  w.eval(fs.readFileSync(path.join(base, 'app.js'), 'utf8') + '\nwindow.__t = {book: LIVE.book, refresh: refreshPriceView, hbDefaults, hbArgs, HB_FIELDS, HB_GROUPS, HB_HELP, HB_KEY};');
  for (let i = 0; i < (feed.hang ? 30 : 300); i++) { await tick(); if (w.document.querySelector('#live-price-status')?.textContent.includes('Last successful') && w.document.querySelector('#hb-table table, #calc-list')) break; }
  await tick();
  assert.deepEqual(errors, [], hash + ' runtime errors');
  return {dom, w, d: w.document};
}
const rowsOf = d => [...d.querySelectorAll('#hb-table tbody tr')];
const rowNamed = (d, name) => rowsOf(d).find(tr => tr.querySelector('th .calc-name').textContent === name);
const set = (d, w, k, v) => { const el = d.querySelector('#hb-' + k); assert.ok(el, 'field ' + k); if (el.type === 'checkbox') el.checked = v === 'true'; else el.value = v; el.dispatchEvent(new w.Event('change', {bubbles: true})); };
(async () => {
  let {dom, w, d} = await screen('calculators/herblore', {mystats_v2: '{"Herblore":50}'});
  assert.equal(d.querySelector('.tabs button.on').dataset.tab, 'calculators'); assert.ok(d.querySelector('.live-price-banner'));
  assert.equal(d.querySelectorAll('#view iframe').length, 0);
  // the app's form is the Wiki form: same fields in the same order, types, labels, defaults, options, help text, and the same
  // sections (switch / selector, then its group under the Wiki's group label). Source: tests/herblore-form-fields.json,
  // recorded from Calculator:Herblore rev 37008978 by tools/herblore_fields.py.
  { const WF = JSON.parse(fs.readFileSync(path.join(__dirname, 'herblore-form-fields.json'), 'utf8')).fields, T = w.__t;
    const wiki = WF.filter(f => !['hs', 'hidden', 'group'].includes(f.type)), app = JSON.parse(JSON.stringify(T.HB_FIELDS));   // plain copy out of the page's realm
    assert.deepEqual(app.map(f => f[0]), wiki.map(f => f.param), 'field order');
    const TY = {toggleswitch: 'switch', check: 'chk', togglebutton: 'chk', buttonselect: 'sel', select: 'sel', int: 'int', number: 'num', fixed: 'fixed'};
    const GROUP = {cats: 'category_group', xp: 'experience_boost_group', outfit: 'outfit_piece_group', saving: 'cost_saving_group', decant: 'decanting_group', prep: 'material_replacement_group', show: 'column_opts_group', filter: 'level_range_group'};
    for (const f of app) { const x = wiki.find(y => y.param === f[0]);
      assert.equal(f[2], TY[x.type], 'type ' + f[0]); assert.equal(f[1], x.label, 'label ' + f[0]); assert.equal(f[4], x.default, 'default ' + f[0]);
      if (x.options) assert.deepEqual(f[3], x.options, 'options ' + f[0]);
      assert.equal(T.HB_GROUPS[f[5]] ? GROUP[f[5]] : undefined, x.group, 'section of ' + f[0]);
      if (f[2] !== 'fixed') assert.equal(T.HB_HELP[f[0]], x.help, 'help ' + f[0]); }
    for (const [g, wg] of Object.entries(GROUP)) assert.equal(T.HB_GROUPS[g][0], WF.find(y => y.param === wg).label, 'group label ' + g);
    const appDef = T.hbDefaults();   // and the defaults equal the submission the golden renders used
    for (const [k, v] of Object.entries(DEF)) if (k in appDef) assert.equal(appDef[k], v, 'default ' + k);
    assert.deepEqual(Object.keys(DEF).filter(k => !(k in appDef)).sort(), ['desert_pantheon', 'wisdom'], 'only the two hidden Wiki fields are not offered'); }
  // Wiki form click sequences (tests/herblore-form-cases.json): the Wiki rendered exactly what MediaWiki:Gadget-calc-core.js
  // submits after these clicks (emulated in tools/herblore_form.py, which refuses clicks on hidden controls). The same clicks
  // are replayed on this screen (every control must be on screen when clicked), then the app's values are compared with the
  // Wiki render and the table's columns with the Wiki's.
  { const FC = JSON.parse(fs.readFileSync(path.join(__dirname, 'herblore-form-cases.json'), 'utf8')); assert.equal(FX.gadgetRevision, 37082305); assert.equal(FX.formRevision, 37008978);
    const appHead = () => [...d.querySelectorAll('#hb-table thead th')].map(th => th.textContent).map(h => /^(Net|Gross) profit$/.test(h) ? 'Profit/Loss' : h);
    for (const fc of FC.cases) {
      const cs = FX.formCases.find(c => c.name === fc.name); assert.ok(cs, fc.name);
      d.querySelector('#hb-reset').click();
      for (const [k, v] of [...FC.display, ...fc.actions]) set(d, w, k, v);
      const args = w.__t.hbArgs(JSON.parse(w.localStorage.getItem(w.__t.HB_KEY)));
      if (fc.expectDifferent) { const keep = JSON.stringify(stats); assert.throws(() => compareCase(cs, args), /AssertionError|unmatched|quantity|XP|number|cost|order/, fc.name + ' is a Wiki gadget quirk the app does not copy'); Object.assign(stats, JSON.parse(keep)); continue; }
      compareCase(cs, args);
      assert.deepEqual(appHead(), cs.head, fc.name + ' columns');
      assert.equal(d.querySelector('#hb-msg').textContent, cs.message, fc.name + ' message');
    }
    stats.formCases = FC.cases.length;
    d.querySelector('#hb-reset').click(); }
  const g0 = FX.cases.find(c => c.name === 'standard-default');
  assert.equal(d.querySelector('#hb-msg').textContent, g0.message, 'goal message identical to the Wiki');
  assert.equal(rowsOf(d).length, g0.rows.length);
  assert.deepEqual([...d.querySelectorAll('#hb-table thead th')].map(t => t.textContent), ['Lvl', 'Recipe', 'XP', 'Number', 'Materials', 'Total cost', 'Cost/XP', 'Total value', 'Net profit', 'Profit/XP']);
  // Attack potion (3): live Buy 1,000 per ingredient, Sell 900 per potion, tax floor(900/50)=18 each
  { const w0 = g0.rows.find(r => r.recipe === 'Attack potion (3)'), tr = rowNamed(d, 'Attack potion (3)'), td = [...tr.querySelectorAll('td')];
    assert.equal(td[0].textContent, '1'); assert.ok(td[0].classList.contains('hb-lv-green'));
    assert.equal(td[2].textContent, w0.number.toLocaleString('en-GB'));
    const cost = w0.mats.reduce((t, [, q]) => t + Math.ceil(1000 * q), 0), val = w0.products.reduce((t, [, q]) => t + Math.ceil(900 * q), 0), tax = Math.ceil(w0.products.reduce((t, [, q]) => t + 18 * q, 0));
    assert.equal(td[4].textContent, cost.toLocaleString() + ' gp'); assert.equal(td[6].textContent, val.toLocaleString() + ' gp');
    assert.match(td[7].textContent, new RegExp('^−' + (cost - val + tax).toLocaleString() + ' gp' + 'gross −' + (cost - val).toLocaleString() + ' gp · tax ' + tax.toLocaleString() + ' gp$'));
    for (const [n, q] of w0.mats) assert.ok(td[3].textContent.includes(`${n} × ${q.toLocaleString('en-GB')}`), n);
    const det = tr.querySelector('details'); assert.match(det.textContent, /Guam potion \(unfinished\) — Buy 1,000 gp each/); assert.match(det.textContent, /Attack potion \(3\) — Sell 900 gp each · est\. tax 18 gp/); }
  // Wiki-calculated value (Module:Calcvalue) ingredient: unavailable, never 0
  { const tr = rowNamed(d, 'Super adrenaline potion (3)'); assert.ok(tr); const td = [...tr.querySelectorAll('td')];
    assert.match(td[4].textContent, /^Unavailable/); assert.match(td[4].textContent, /Wiki calculated value/); assert.match(td[7].textContent, /^Unavailable/); assert.doesNotMatch(td[7].textContent, /\b0 gp/); }
  // untradeable product valued at 0 as on the Wiki, labelled
  { const tr = rowNamed(d, 'Adrenaline renewal potion (4)'); const det = tr.querySelector('details'); assert.match(det.textContent, /Adrenaline renewal potion \(4\) — Sell untradeable, no market price: valued at 0 as on the Wiki \(not free/);
    assert.match(tr.querySelectorAll('td')[6].textContent, /excludes untradeable Adrenaline renewal potion \(4\) \(no market price, not free\)/);
    assert.doesNotMatch(tr.querySelectorAll('td')[7].textContent, /\b0 gp/); }
  // a profit that leaves out an untradeable item's value is neutral and labelled, never shown as a gain or a loss
  set(d, w, 'category_choice', 'Outside Daemonheim');
  { const part = rowsOf(d).filter(tr => tr.querySelector('.calc-val.partial')); assert.ok(part.length >= 1, 'partial rows: ' + part.length); stats.partialRows = part.length;
    for (const tr of part) { const pc = tr.querySelectorAll('td')[7]; assert.equal(pc.querySelector('.calc-val.gain, .calc-val.loss'), null); assert.match(pc.textContent, /Partial, not a market profit: excludes untradeable .+ \(no market price, not free\)/); }
    const coloured = rowsOf(d).filter(tr => tr.querySelector('.calc-val.gain, .calc-val.loss')); assert.ok(coloured.length > 10);
    for (const tr of coloured) assert.doesNotMatch(tr.querySelectorAll('td')[7].textContent, /Partial|untradeable/, 'a coloured profit has every price'); }
  set(d, w, 'category_choice', 'Single');

  // gross/net, search, sort
  set(d, w, 'show', 'gross'); d.querySelector('#hb-show').value = 'gross'; d.querySelector('#hb-show').dispatchEvent(new w.Event('change'));
  assert.equal([...d.querySelectorAll('#hb-table thead th')][8].textContent, 'Gross profit');
  const q = d.querySelector('#hb-q'); q.value = 'super antifire'; q.dispatchEvent(new w.Event('input'));
  assert.ok(rowsOf(d).length >= 1 && rowsOf(d).every(tr => /super antifire/i.test(tr.textContent))); assert.match(d.querySelector('#hb-count').textContent, new RegExp(`^${rowsOf(d).length} of ${g0.rows.length} recipes`));
  q.value = ''; q.dispatchEvent(new w.Event('input'));
  const so = d.querySelector('#hb-sort'); so.value = 'profit'; so.dispatchEvent(new w.Event('change'));
  { const vals = rowsOf(d).map(tr => tr.querySelectorAll('td')[7]).map(td => /^Unavailable/.test(td.textContent) ? null : Number(td.querySelector('.calc-val').textContent.replace(/[^\d−]/g, '').replace('−', '-')));
    const firstNull = vals.indexOf(null); assert.ok(firstNull > 0 && vals.slice(firstNull).every(v => v === null), 'unavailable after computable');
    for (let i = 1; i < firstNull; i++) assert.ok(vals[i - 1] >= vals[i], 'sorted by profit'); }
  so.value = ''; so.dispatchEvent(new w.Event('change'));
  // options: category, boosts, hidden-field fallback, persistence under its own key
  set(d, w, 'category', 'Clean herbs'); set(d, w, 'curr_level', '50'); set(d, w, 'target_level', '60');
  { const g = FX.cases.find(c => c.name === 'herbs-50-60'); assert.equal(d.querySelector('#hb-msg').textContent, g.message); assert.equal(rowsOf(d).length, g.rows.length);
    assert.deepEqual(rowsOf(d).map(tr => tr.querySelectorAll('td')[2].textContent), g.rows.map(r => r.number ? r.number.toLocaleString('en-GB') : '-')); }
  assert.equal(d.querySelector('#hb-portable'), null, 'Cost saving is switched off: its fields are not shown'); set(d, w, 'cost_saving', 'true');
  assert.equal(d.querySelector('fieldset[data-g="saving"] legend').textContent, 'Cost saving'); assert.equal(d.querySelector('#hb-brooch_no_effect output').textContent, 'No effect');
  set(d, w, 'portable', 'true'); assert.equal(d.querySelector('#hb-brooch_no_effect'), null); assert.ok(d.querySelector('#hb-brooch'), 'brooch shown with portable well');
  set(d, w, 'brooch', 'true'); set(d, w, 'portable', 'false'); assert.equal(d.querySelector('#hb-brooch'), null, 'brooch hidden again');
  const saved = JSON.parse(w.localStorage.getItem('dch_calc_herblore_v1')); assert.equal(saved.category, 'Clean herbs'); assert.equal(saved.brooch, 'true');
  assert.equal(saved.cost_saving, 'true'); assert.ok(d.querySelector('#hb-brooch_no_effect'), 'No effect shown again');
  assert.equal(w.localStorage.getItem('mystats_v2'), '{"Herblore":50}', 'saved stats untouched');
  // favourite from the native page
  const star = d.querySelector('#hb-star'); star.click(); assert.deepEqual(JSON.parse(w.localStorage.getItem(C.FAV_KEY)).map(f => f.path), [D.path]);
  for (const a of d.querySelectorAll('#view a[target="_blank"]')) assert.equal(a.rel, 'noopener noreferrer');
  const favs = w.localStorage.getItem(C.FAV_KEY), hb = w.localStorage.getItem('dch_calc_herblore_v1'); dom.window.close();
  // reload: options restored, Prices used stays open across the registered live-price refresh
  ({dom, w, d} = await screen('calculators/herblore', {dch_calc_herblore_v1: hb}));
  assert.equal(d.querySelector('#hb-category').value, 'Clean herbs'); assert.equal(rowsOf(d).length, 24);
  { const det = () => rowNamed(d, 'Clean guam').querySelector('details'); det().open = true;
    const ts = Date.now() / 1000 - 5, data = JSON.parse(JSON.stringify(w.__t.book.data)); data[D.ids['Clean guam']] = {high: 1200, low: 1111, highTime: ts, lowTime: ts};
    w.__t.book.setLatest({data}, Date.now()); w.__t.refresh();
    assert.ok(det().open); assert.match(det().textContent, /Clean guam — Sell 1,111 gp each · est\. tax 22 gp/); }
  dom.window.close();
  // directory: Herblore In app, favourite opens the native route; Flask decanting unchanged
  ({dom, w, d} = await screen('calculators', {[C.FAV_KEY]: favs}));
  { const nat = [...d.querySelectorAll('#calc-native a.calc-card-main')].map(a => a.getAttribute('href')).sort(); assert.deepEqual(nat, ['#calculators/cooking', '#calculators/flask-decanting', '#calculators/fletching', '#calculators/herblore']);
    assert.equal(d.querySelectorAll('#calc-upcoming .calc-in-app').length, 0); assert.ok(d.querySelectorAll('#calc-upcoming .calc-item').length > 100);
    assert.equal(d.querySelector('#calc-fav-list a.calc-open').getAttribute('href'), '#calculators/herblore'); }
  dom.window.close();
  // missing and stale prices: that recipe unavailable, never 0
  ({dom, w, d} = await screen('calculators/herblore', {}, {over: {'Guam potion (unfinished)': null, 'Eye of newt': {high: 1000, low: 900, highTime: Date.now() / 1000 - 7200}}}));
  { const td = [...rowNamed(d, 'Attack potion (3)').querySelectorAll('td')]; assert.match(td[4].textContent, /^Unavailable/); assert.match(td[7].textContent, /^Unavailable/);
    const det = rowNamed(d, 'Attack potion (3)').querySelector('details').textContent; assert.match(det, /Guam potion \(unfinished\) — Buy unavailable \(/); assert.match(det, /Eye of newt — Buy unavailable \(/); }
  // Daemonheim: rusty coins, not priced; XP and actions still shown
  set(d, w, 'category_choice', 'Dungeoneering');
  { const g = FX.cases.find(c => c.name === 'dungeoneering'); assert.equal(rowsOf(d).length, g.rows.length);
    assert.ok(rowsOf(d).every(tr => /^Unavailable/.test(tr.querySelectorAll('td')[4].textContent))); assert.match(rowsOf(d)[0].querySelector('details').textContent, /rusty coins/); }
  // burner only: no products or profit columns (as on the Wiki); production time and step columns
  set(d, w, 'category_choice', 'Single'); set(d, w, 'category', 'Deployable herb burner');
  assert.deepEqual([...d.querySelectorAll('#hb-table thead th')].map(t => t.textContent), ['Lvl', 'Recipe', 'XP', 'Number', 'Materials', 'Total cost', 'Cost/XP']);
  set(d, w, 'category', 'Standard potions'); set(d, w, 'show_opts', 'Change columns'); set(d, w, 'show_production_time', 'true'); set(d, w, 'raw_material_replacement_mode', 'Potions and herbs'); set(d, w, 'herb_potion_from', 'Grimy herbs'); set(d, w, 'step_mode', 'Quantity'); set(d, w, 'product_mode', 'Price');
  { const heads = [...d.querySelectorAll('#hb-table thead th')].map(t => t.textContent); assert.deepEqual(heads.slice(4, 6), ['Time', 'Steps']); assert.ok(heads.includes('Products'));
    const tr = rowNamed(d, 'Attack potion (3)'), td = tr.querySelectorAll('td'); assert.match(td[3].textContent, /days?, .*seconds$/); assert.match(td[4].textContent, /^Clean guam × .*Guam potion \(unfinished\) × /); assert.match(td[5].textContent, /Grimy guam × /); }
  dom.window.close();
  // "Profitable" product decanting follows the profit basis on screen: net per dose after the per-item tax, or gross
  { const lowOf = {'Attack potion (1)': 10, 'Attack potion (2)': 20, 'Attack potion (3)': 149, 'Attack potion (4)': 200};   // gross/dose: 4 best (50); net/dose 49 vs 49 -> Wiki tie rule keeps 3
    const over = Object.fromEntries(Object.entries(lowOf).map(([n, low]) => [n, {high: low + 1, low}]));
    ({dom, w, d} = await screen('calculators/herblore', {dch_calc_herblore_v1: JSON.stringify({product_decant_type: 'Profitable', product_mode: 'Quantity'})}, {over}));
    const prod = () => rowNamed(d, 'Attack potion (3)').querySelectorAll('td')[6].textContent;
    assert.match(prod(), /^Attack potion \(3\) × /, 'net basis keeps 3-dose');
    d.querySelector('#hb-show').value = 'gross'; d.querySelector('#hb-show').dispatchEvent(new w.Event('change'));
    assert.match(prod(), /^Attack potion \(4\) × /, 'gross basis picks 4-dose (as the Wiki rule would on these prices)');
    dom.window.close();
    // one candidate without a price: choice undetermined -> totals unavailable, warning shown
    delete over['Attack potion (2)'];
    ({dom, w, d} = await screen('calculators/herblore', {dch_calc_herblore_v1: JSON.stringify({product_decant_type: 'Profitable'})}, {over: {...over, 'Attack potion (2)': null}}));
    const tr = rowNamed(d, 'Attack potion (3)'), td = tr.querySelectorAll('td');
    assert.match(tr.querySelector('th').textContent, /Profitable choice undetermined \(totals unavailable\), no live price for: Attack potion \(2\)/);
    for (const i of [4, 6, 7]) { assert.match(td[i].textContent, /^Unavailable/); assert.match(td[i].textContent, /Profitable choice undetermined: no price for Attack potion \(2\)/); }
    dom.window.close(); }
  // browser spot-check script (checklist "completion run"): same controls, tags and Wiki form values
  ({dom, w, d} = await screen('calculators/herblore', {}));
  { const on = g => !!d.querySelector(`fieldset[data-g="${g}"]`);
    const check = name => { const c = FX.formCases.find(x => x.name === name); assert.equal(d.querySelector('#hb-msg').textContent, c.message, name);
      for (const wr of c.rows.filter(r => /^(Attack potion \(3\)|Strength potion \(3\)|Antipoison \(3\)|Prayer potion \(3\)|Super attack \(3\))$/.test(r.recipe))) {
        const td = rowNamed(d, wr.recipe).querySelectorAll('td'); assert.equal(td[1].textContent, wr.xpText, name + ' ' + wr.recipe); assert.equal(td[2].textContent, wr.number.toLocaleString('en-GB'), name + ' ' + wr.recipe); } };
    for (const [k, v] of [['curr_level', '30'], ['target_level', '50'], ['experience_boost', 'true'], ['inspire', 'true'], ['wise', 'Wise 4'], ['avatar', '6'], ['torsol', '4'], ['pulse_core', 'Buff and equipped'], ['bxp', 'true'], ['bxp_amount', '100000'], ['cinder_core', 'Buff and equipped']]) set(d, w, k, v);
    assert.ok(on('xp')); check('spot-boosts-bxp');
    set(d, w, 'bxp', 'false'); assert.equal(d.querySelector('#hb-bxp_amount'), null);
    set(d, w, 'experience_boost', 'false'); assert.ok(!on('xp')); assert.equal(d.querySelector('#hb-inspire'), null); { const g = FX.cases.find(c => c.name === 'standard-default'); for (const n of ['Attack potion (3)', 'Prayer potion (3)', 'Super attack (3)']) assert.equal(rowNamed(d, n).querySelectorAll('td')[1].textContent, g.rows.find(r => r.recipe === n).xpText, 'boosts off: Wiki base XP ' + n); }   // switched off: nothing from the section counts
    set(d, w, 'experience_boost', 'true'); assert.equal(d.querySelector('#hb-wise').value, 'Wise 4', 'values kept while switched off');
    d.querySelector('#hb-reset').click();
    for (const [k, v] of [['curr_level', '30'], ['target_level', '50'], ['experience_boost', 'true'], ['bik_scripture', 'Flicking and switching every minute'], ['dxp', 'true'], ['outfit_piece', 'true'], ['outfit', '5'], ['modified_mask', 'true'], ['cost_saving', 'true'], ['portable', 'true'], ['brooch', 'true'], ['show_opts', 'Change columns'], ['product_mode', 'Quantity']]) set(d, w, k, v);
    assert.ok(on('xp') && on('outfit') && on('saving') && on('show') && !on('filter')); check('spot-dxp-outfit-brooch');
    const c = FX.formCases.find(x => x.name === 'spot-dxp-outfit-brooch'), ap = c.rows.find(r => r.recipe === 'Attack potion (3)');
    assert.equal(rowNamed(d, 'Attack potion (3)').querySelectorAll('td')[6].textContent.trim(), `Attack potion (3) × ${ap.products[0][1].toLocaleString('en-GB')}`);
    set(d, w, 'portable', 'false'); assert.equal(d.querySelector('#hb-brooch'), null); assert.ok(d.querySelector('#hb-brooch_no_effect')); }
  dom.window.close();
  // before the price list arrives: 'live prices loading', never 0
  ({dom, w, d} = await screen('calculators/herblore', {}, {hang: true}));
  { const td = [...rowNamed(d, 'Attack potion (3)').querySelectorAll('td')]; assert.match(td[4].textContent, /^Unavailable/); assert.match(td[4].textContent, /live prices loading/); }
  dom.window.close();
  // typing in number fields never rebuilds the form (same node, value and focus through input and blur); section switches,
  // selects and checkboxes rebuild it only when they show or hide fields, and focus returns to the control used
  ({dom, w, d} = await screen('calculators/herblore', {}));
  { const typeIn = (el, text) => { el.focus(); el.value = ''; for (const ch of text) { el.value += ch; el.dispatchEvent(new w.Event('input', {bubbles: true})); } };
    const tl = d.querySelector('#hb-target_level'), cl = d.querySelector('#hb-curr_level');
    typeIn(tl, '85'); assert.equal(d.querySelector('#hb-target_level'), tl, 'same node while typing'); assert.equal(d.activeElement, tl); assert.equal(tl.value, '85');
    tl.dispatchEvent(new w.Event('change', {bubbles: true})); cl.focus(); assert.equal(d.querySelector('#hb-target_level'), tl, 'same node after blur/change'); assert.equal(d.activeElement, cl, 'focus moved on, not lost');
    typeIn(cl, '50'); cl.dispatchEvent(new w.Event('change', {bubbles: true})); assert.equal(d.querySelector('#hb-curr_level'), cl); assert.equal(d.activeElement, cl);
    assert.match(d.querySelector('#hb-msg').textContent, /\(level 50\) to .* \(level 85\)/);
    typeIn(tl, '130'); assert.equal(tl.value, '130', 'incomplete/out-of-range typing is left alone'); tl.dispatchEvent(new w.Event('change', {bubbles: true})); assert.equal(tl.value, '120', 'clamped to the Wiki range on change'); assert.equal(d.querySelector('#hb-target_level'), tl);
    // rapid switch / checkbox / select toggling; number fields that stay on screen keep their node
    const sw = () => d.querySelector('#hb-experience_boost');
    for (let i = 0; i < 6; i++) { const e = sw(); e.focus(); e.checked = !e.checked; e.dispatchEvent(new w.Event('change', {bubbles: true})); assert.equal(d.activeElement && d.activeElement.id, 'hb-experience_boost', 'focus back on the switch ' + i); }
    assert.equal(d.querySelector('#hb-target_level'), tl, 'goal fields untouched by section switches');
    set(d, w, 'experience_boost', 'true'); const bx = () => d.querySelector('#hb-bxp');
    for (let i = 0; i < 5; i++) { const e = bx(); e.focus(); e.checked = !e.checked; e.dispatchEvent(new w.Event('change', {bubbles: true})); assert.equal(d.activeElement && d.activeElement.id, 'hb-bxp'); assert.equal(!!d.querySelector('#hb-bxp_amount'), i % 2 === 0); }
    const ba = d.querySelector('#hb-bxp_amount'); typeIn(ba, '50000'); assert.equal(d.querySelector('#hb-bxp_amount'), ba); ba.dispatchEvent(new w.Event('change', {bubbles: true}));
    const ax = d.querySelector('#hb-add_xp_boost'); ax.focus(); assert.equal(d.querySelector('#hb-bxp_amount'), ba, 'BXP amount kept after moving to the next field'); assert.equal(ba.value, '50000');
    typeIn(ax, '12.5'); ax.dispatchEvent(new w.Event('change', {bubbles: true})); assert.equal(d.querySelector('#hb-add_xp_boost'), ax);
    const wise = d.querySelector('#hb-wise'); wise.focus(); wise.value = 'Wise 2'; wise.dispatchEvent(new w.Event('change', {bubbles: true})); assert.equal(d.querySelector('#hb-wise'), wise, 'a select that shows/hides nothing keeps its node'); assert.equal(d.activeElement, wise);
    const saved = JSON.parse(w.localStorage.getItem(w.__t.HB_KEY)); assert.deepEqual([saved.target_level, saved.curr_level, saved.bxp_amount, saved.add_xp_boost, saved.wise], ['120', '50', '50000', '12.5', 'Wise 2']);
    // column options: item pictures and the cost / profit columns follow the Wiki's switches
    assert.ok(d.querySelector('#hb-table img.calc-ico, #hb-table img.calc-li-ico'));
    set(d, w, 'show_opts', 'Change columns'); set(d, w, 'show_item_image', 'false'); assert.equal(d.querySelector('#hb-table img'), null, 'no item pictures');
    set(d, w, 'show_cost', 'false'); set(d, w, 'show_profit', 'false');
    assert.deepEqual([...d.querySelectorAll('#hb-table thead th')].map(t => t.textContent), ['Lvl', 'Recipe', 'XP', 'Number', 'Materials']);
    set(d, w, 'show_opts', 'Default'); assert.ok(d.querySelector('#hb-table img'), 'Default display: Wiki default columns again'); assert.ok([...d.querySelectorAll('#hb-table thead th')].some(t => t.textContent === 'Total cost'));
    // the Wiki's help text sits behind a "?" next to its field
    assert.match(d.querySelector('#hb-category_choice').closest('.hb-ctl').querySelector('.hb-help').textContent, /"Common potions" includes standard, combination, bomb, powerburst potions/); }
  dom.window.close();
  // options saved before the section switches existed: the sections holding a changed option are switched on
  ({dom, w, d} = await screen('calculators/herblore', {dch_calc_herblore_v1: JSON.stringify({dxp: 'true', factory: '3', mat_mode: 'Price', recipe_level_start: '40'})}));
  { assert.equal(d.querySelector('#hb-experience_boost').checked, true); assert.equal(d.querySelector('#hb-dxp').checked, true); assert.equal(d.querySelector('#hb-outfit_piece').checked, true);
    assert.equal(d.querySelector('#hb-cost_saving').checked, false); assert.equal(d.querySelector('#hb-show_opts').value, 'Both'); assert.equal(d.querySelector('#hb-recipe_level_start').value, '40'); }
  dom.window.close();
  const T = templateStats; console.log(`PASS herblore: template renders ${T.rows} rows in ${T.cases} cases (${T.pricedRows} every cost/profit cell, ${T.unpricedRows} quantities-only or undetermined-choice totals unavailable, ${T.flagged} flagged dose choices, ${T.flaggedMatched} flagged-but-same); ${stats.formCases - 1} Wiki form click-sequence renders match (${stats.rows - T.rows} rows) + 1 gadget quirk confirmed different; all: ${stats.rows} Wiki rows in ${stats.cases} renders (${stats.pricedRows} with every cost/profit cell, ${stats.unpricedRows} quantities-only where the Wiki uses its own calculated or Daemonheim values, ${stats.flagged} flagged Wiki-only dose choices), ${stats.lines} item lines; edge cases; live buy-high/sell-low, per-item tax, missing/stale/loading unavailable, untradeable 0 labelled, rusty coins unavailable; DOM options, persistence, favourites, directory 2 in app; ${stats.partialRows} partial (untradeable) profits neutral; Wiki form fields/sections/help; number fields kept across typing/blur/rapid toggles; column options; old saved options migrate to section switches`);
})().catch(e => { console.error(e); process.exit(1); });
