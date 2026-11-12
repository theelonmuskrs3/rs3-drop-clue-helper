// Potion making (Calculator:Herblore/Potions, "Making from clean herbs"): Wiki golden arithmetic for every row, tax, missing
// prices, the DOM route beside Flask decanting, and Flask decanting rendering exactly as before.
// NODE_PATH=/workspace/ge-dom-tests/node_modules node tests/herblore-potions.test.cjs [path/to/previous/app.js]
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const C = require('../calculators.js'), prices = require('../live-prices.js');
const D = JSON.parse(fs.readFileSync(path.join(base, 'data/calc/herblore-potions.json'), 'utf8'));
const G = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-herblore-potions-golden.json'), 'utf8'));
const FD = JSON.parse(fs.readFileSync(path.join(base, 'data/calc/flask-decanting.json'), 'utf8'));
const FDG = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-flask-decanting-golden.json'), 'utf8'));
const IMG = JSON.parse(fs.readFileSync(path.join(base, 'data/calc/images.json'), 'utf8')).items;
const tick = () => new Promise(r => setTimeout(r, 10));
const near = (a, b, m) => assert.ok(Math.abs(a - Number(b)) < 1e-6, `${m}: ${a} vs Wiki ${b}`);
const guide = it => G.guide[it.n] ?? null;

/* ---- source data ---- */
assert.equal(D.path, '/w/Calculator:Herblore/Potions'); assert.equal(D.section, 'Making from clean herbs');
assert.equal(D.source.pageRevision, 36771106); assert.equal(D.source.rowModuleRevision, 36714215);
assert.equal(D.rows.length, 74); assert.equal(G.rows.length, 74);
const items = D.rows.flatMap(r => [r.pot, r.vial, r.sec, ...r.herb, ...r.unf]);
for (const it of items) { if (!it.nv) assert.ok(Number.isSafeInteger(it.id) && it.id > 0, 'GE id ' + it.n); assert.ok(IMG[it.img || it.n], 'official Wiki icon for ' + (it.img || it.n)); }
for (const it of items) if (!it.nv) assert.ok(Number.isSafeInteger(G.guide[it.n]) && G.guide[it.n] > 0, 'guide price in fixture ' + it.n);
// alternate secondaries are separate rows, as on the Wiki
assert.deepEqual(D.rows.filter(r => r.pot.n === 'Magic potion (3)').map(r => r.sec.n), ['White bead', 'Yellow bead', 'Black bead', 'Red bead']);
assert.deepEqual(D.rows.filter(r => r.pot.n === 'Runecrafting potion (3)').map(r => r.sec.n), ['Summerdown wool', 'Springsheared wool', 'Winterwold wool', 'Fallfaced wool']);

/* ---- Wiki golden: every row, every numeric column (Wiki-rendered data-sort-values at the same guide-price revision) ---- */
let n = 0;
D.rows.forEach((r, i) => {
  const e = C.potionProfit(r, guide), g = G.rows[i];
  assert.equal(g.pot, r.pot.txt || r.pot.n); assert.equal(Number(g.lv), r.lv); assert.equal(Number(g.xp), r.xp);
  near(r.herb[0].nv ? 0 : e.herbs[0], g.herb, r.pot.n + ' herb price'); near(!r.unf.length || r.unf[0].nv ? 0 : e.unfs[0], g.unf, r.pot.n + ' unf price');
  near(r.sec.nv ? 0 : e.secTotal, g.sec, r.pot.n + ' sec price'); near(r.pot.nv ? 0 : e.potTotal, g.ge, r.pot.n + ' GE price');
  near(e.gross, g.profit, r.pot.n + ' profit'); near(e.perXp, g.perXp, r.pot.n + ' profit/XP'); near(e.soc, g.soc, r.pot.n + ' SoC'); near(e.socPerXp, g.socPerXp, r.pot.n + ' SoC/XP');
  n += 8;
});
assert.equal(n, 74 * 8);
// hand-checked rows (formula of Module:Herb calc row, numbers from the Wiki rendering in the fixture)
const row = (pot, sec) => D.rows.find(r => r.pot.n === pot && (!sec || r.sec.n === sec));
const W = pot => G.rows[D.rows.indexOf(row(pot))];
{ const r = row('Attack potion (3)'), g = G.guide, e = C.potionProfit(r, guide);
  assert.equal(r.vial.n, 'Vial of water'); assert.equal(e.gross, g['Attack potion (3)'] - g['Vial of water'] - g['Clean guam'] - g['Eye of newt']);
  near(e.soc, g['Attack potion (3)'] - g['Vial of water'] - 0.9 * g['Clean guam'] - 0.9 * g['Eye of newt'], 'Attack SoC'); near(e.gross, W('Attack potion (3)').profit, 'Attack'); }
{ const r = row('Guam tar'), g = G.guide, e = C.potionProfit(r, guide);   // 15 tar, 15 swamp tar, SoC no effect, vial still counted (as on the Wiki)
  assert.equal(r.pot.q, 15); assert.equal(r.sec.q, 15); assert.equal(r.soc, 1); assert.deepEqual(r.unf, []);
  assert.equal(e.gross, 15 * g['Guam tar'] - g['Vial of water'] - g['Clean guam'] - 15 * g['Swamp tar']); assert.equal(e.soc, e.gross); near(e.gross, W('Guam tar').profit, 'Guam tar'); }
{ const r = row('Antipoison+ (4)'), g = G.guide, e = C.potionProfit(r, guide);   // coconut milk base
  assert.equal(r.vial.n, 'Coconut milk'); assert.ok(r.vial.ref); assert.equal(e.gross, g['Antipoison+ (4)'] - g['Coconut milk'] - g['Clean toadflax'] - g['Yew roots']); near(e.gross, W('Antipoison+ (4)').profit, 'Antipoison+'); }
{ const r = row('Guthix balance (3)'); assert.equal(r.vial.n, 'Restore potion (3)'); assert.equal(r.herb[0].n, 'Garlic'); near(C.potionProfit(r, guide).gross, W('Guthix balance (3)').profit, 'Guthix balance'); }
{ const r = row('Sanfew serum (3)'), g = G.guide, e = C.potionProfit(r, guide);   // hand-written Wiki row: Super restore (3) base, no vial
  assert.ok(r.manual); assert.equal(e.gross, g['Sanfew serum (3)'] - g['Super restore (3)'] - g['Unicorn horn dust'] - g['Nail beast nails']); assert.equal(e.soc, e.gross); near(e.gross, W('Sanfew serum (3)').profit, 'Sanfew'); }
{ const r = row('Weapon poison++ (3)'), e = C.potionProfit(r, guide);   // N/A herb and unfinished: 0 gp, as on the Wiki
  assert.ok(r.herb[0].nv && r.unf[0].nv); assert.equal(e.herbs[0], null); assert.equal(e.gross, G.guide['Weapon poison++ (3)'] - G.guide['Coconut milk'] - G.guide['Poison ivy berries']); near(e.gross, W('Weapon poison++ (3)').profit, 'WP++'); }
{ const r = row('Shrink-me-quick'), e = C.potionProfit(r, guide);   // untradeable potion: GE price N/A -> loss of the ingredients, as on the Wiki
  assert.ok(r.pot.nv && r.sec.nv); assert.equal(r.soc, 3); assert.equal(e.gross, -(G.guide['Vial of water'] + G.guide['Clean tarromin'])); assert.ok(e.gross < 0); near(e.soc, W('Shrink-me-quick').soc, 'SMQ SoC'); }
const losses = D.rows.filter(r => C.potionProfit(r, guide).gross < 0).length, gains = D.rows.filter(r => C.potionProfit(r, guide).gross >= 0).length;
assert.ok(losses > 0 && gains > 0); assert.equal(losses + gains, 74);

/* ---- missing price: never 0; tax ---- */
{ const r = row('Attack potion (3)'), e = C.potionProfit(r, it => it.n === 'Eye of newt' ? null : guide(it));
  assert.equal(e.gross, null); assert.equal(e.soc, null); assert.equal(e.perXp, null); assert.deepEqual(e.unknown, ['Eye of newt']); }
{ const e = C.potionProfit(row('Attack potion (3)'), it => it.n === 'Vial of water' ? null : guide(it)); assert.equal(e.gross, null); }
{ const e = C.potionProfit(row('Attack potion (3)'), it => it.n === 'Guam potion (unfinished)' ? null : guide(it)); assert.notEqual(e.gross, null, 'unfinished price is display only'); }
assert.equal(prices.sellingTax(1074, 1), 21); assert.equal(prices.sellingTax(49, 1), 0);

/* ---- Flask decanting arithmetic unchanged (its own golden, all 344 cells) ---- */
{ let cells = 0; FD.rows.forEach((r, i) => FD.columns.forEach((c, j) => { assert.equal(C.guideProfit(C.flaskModel(FD, r, c), x => FDG.guide[x]), FDG.rows[i].values[j]); cells++; })); assert.equal(cells, 344); }

/* ---- DOM ---- */
const GUIDE_URL = 'https://api.weirdgloop.org/exchange/history/rs/latest?id=';
const byId = {}; for (const x of [FD.flask, ...FD.rows.flatMap(r => [r.f6, r.v1, r.v2, r.v3, r.v4])]) byId[x.id] = FDG.guide[x.n];
for (const it of items) if (!it.nv) byId[it.id] = G.guide[it.n];   // potion fixture wins where both list an item
let MISSING = null;
async function screen(hash, store = {}, appFile = path.join(base, 'app.js')) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), {url: 'http://127.0.0.1:8777/index.html#' + hash, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, errors = [];
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
  w.scrollTo = () => {}; w.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  Object.defineProperty(w.navigator, 'serviceWorker', {value: {register() { return Promise.resolve(); }}});
  w.AbortController = AbortController; w.TextEncoder = TextEncoder;
  w.fetch = async url => {
    url = String(url);
    if (url.startsWith(GUIDE_URL)) { const out = {}; for (const id of url.slice(GUIDE_URL.length).split('|')) if (byId[id] !== undefined && String(id) !== String(MISSING)) out[id] = {id, timestamp: '2026-11-11T07:14:05.000Z', price: byId[id], volume: 0}; return {ok: true, json: async () => out}; }
    if (url.startsWith(prices.BASE)) return url.endsWith('/mapping') ? {ok: true, json: async () => []} : {ok: true, json: async () => ({data: {}})};
    try { return {ok: true, json: async () => JSON.parse(fs.readFileSync(path.resolve(base, url.split('?')[0]), 'utf8'))}; }
    catch { return {ok: false, status: 404, json: async () => ({})}; }
  };
  w.addEventListener('error', e => errors.push(e.error));
  for (const f of ['live-prices.js', 'calculators.js', 'map.js']) w.eval(fs.readFileSync(path.join(base, f), 'utf8'));
  w.eval(fs.readFileSync(appFile, 'utf8'));
  for (let i = 0; i < 200; i++) { await tick(); const s = w.document.querySelector('#pm-status, #fd-flask'); if (s && /as of/.test(s.textContent)) break; }
  await tick();
  assert.deepEqual(errors, [], hash + ' runtime errors');
  return {dom, w, d: w.document};
}
const num = t => { t = t.trim(); return t === '—' ? null : t === 'N/A' ? 'N/A' : (t.startsWith('−') ? -1 : 1) * Number(t.replace(/[−,]/g, '')); };
const r2 = v => Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-7) / 100;
(async () => {
  let {dom, w, d} = await screen('calculators/potion-making');
  assert.equal(w.location.hash, '#calculators/potion-making'); assert.equal(d.querySelector('#pm-title').textContent, 'Potion making');
  assert.equal(d.querySelector('.tabs button.on').dataset.tab, 'calculators');
  const nav = [...d.querySelectorAll('.calc-sub a')]; assert.deepEqual(nav.map(a => [a.getAttribute('href'), a.textContent, a.getAttribute('aria-current')]), [['#calculators/flask-decanting', 'Flask decanting', null], ['#calculators/potion-making', 'Potion making', 'page']]);
  assert.equal(d.querySelector('#pm-show').value, 'gross', 'gross (the Wiki figure) by default');
  assert.equal(d.querySelector('#pm-info').open, false, 'Details & sources collapsed');
  assert.deepEqual([...d.querySelectorAll('#pm-table thead th')].map(t => t.textContent.replace(/[⇅▲▼]/g, '').trim()),
    ['Potion', 'Level', 'XP', 'Herb', 'Herb price', 'Unfinished', 'Unf. price', 'Secondary', 'Sec. price', 'GE price', 'Profit', 'Profit per XP', 'Profit (SoC)', 'Profit/XP (SoC)']);
  const trs = [...d.querySelectorAll('#pm-table tbody tr:not(.fd-detail)')]; assert.equal(trs.length, 74, 'every Wiki row shown, losses included');
  trs.forEach((tr, i) => { const td = [...tr.querySelectorAll('td')].map(x => num(x.textContent.replace(/[¹²]/g, ''))), g = G.rows[i];
    assert.equal(td.length, 13);
    const txt = [...tr.querySelectorAll('td')].map(x => x.textContent.replace(/[¹²]/g, '').trim());
    assert.deepEqual([txt[9], txt[10], txt[11], txt[12]], [g.shown.profit, g.shown.perXp, g.shown.soc, g.shown.socPerXp], g.pot + ' DOM shows exactly what the Wiki shows');
    if (Number(g.profit) < 0) assert.ok(tr.querySelectorAll('td')[9].classList.contains('loss')); });
  assert.ok(trs.every(tr => tr.querySelector('th img.calc-ico')), 'official potion icon on every row');
  assert.equal(d.querySelectorAll('#pm-table td.pm-na').length > 0, true);
  // net: 2% tax on the potion(s) sold
  d.querySelector('#pm-show').value = 'net'; d.querySelector('#pm-show').dispatchEvent(new w.Event('change'));
  assert.equal(w.localStorage.getItem('dch_calc_pm_show_v1'), 'net');
  [...d.querySelectorAll('#pm-table tbody tr:not(.fd-detail)')].forEach((tr, i) => { const r = D.rows[i], e = C.potionProfit(r, guide), tax = r.pot.nv ? 0 : Math.floor(G.guide[r.pot.n] / 50) * (r.pot.q || 1);
    const td = [...tr.querySelectorAll('td')].map(x => num(x.textContent.replace(/[¹²]/g, ''))); assert.equal(td[9], e.gross - tax, r.pot.n + ' net'); assert.equal(td[11], r2(e.soc - tax)); });
  // expand a row: prices and the sum
  d.querySelector('#pm-table button.fd-name').click(); assert.match(d.querySelector('#pm-table .fd-detail').textContent, new RegExp('Vial of water[\\s\\S]*Guam[\\s\\S]*Eye of newt[\\s\\S]*not in the profit[\\s\\S]*= ' + W('Attack potion (3)').profit + ' gp gross'));
  // sort and search
  d.querySelector('#pm-table button.fd-sort[data-k="profit"]').click();
  const ps = [...d.querySelectorAll('#pm-table tbody tr:not(.fd-detail)')].map(tr => num(tr.querySelectorAll('td')[9].textContent)); assert.deepEqual(ps, [...ps].sort((a, b) => b - a));
  d.querySelector('#pm-q').value = 'wool'; d.querySelector('#pm-q').dispatchEvent(new w.Event('input'));
  assert.equal(d.querySelectorAll('#pm-table tbody tr:not(.fd-detail)').length, 4);
  dom.window.close();
  // missing guide price -> —, never 0
  MISSING = D.rows[0].sec.id; ({dom, w, d} = await screen('calculators/potion-making')); MISSING = null;
  { const first = [...d.querySelectorAll('#pm-table tbody tr:not(.fd-detail)')].filter(tr => /Eye of newt/.test(tr.textContent)); assert.ok(first.length >= 2);
    for (const tr of first) assert.equal(tr.querySelectorAll('td')[9].textContent.trim(), '—'); assert.match(d.querySelector('#pm-count').textContent, /missing guide price/); }
  dom.window.close();

  // Flask decanting: the panel renders exactly as on main; the only addition is the switch above it
  const prev = process.argv[2] || '/tmp/app-main.js';
  let a = await screen('calculators/flask-decanting'), b = await screen('calculators/flask-decanting', {}, prev);
  const panel = x => x.d.querySelector('section.calc-native-panel').outerHTML;
  assert.equal(panel(a), panel(b), 'Flask decanting panel byte-identical to main');
  assert.equal(a.d.querySelectorAll('#fd-table tbody tr:not(.fd-detail)').length, 86);
  assert.equal(a.d.querySelector('.calc-sub a[aria-current="page"]').getAttribute('href'), '#calculators/flask-decanting');
  a.d.querySelector('.calc-sub').remove(); assert.equal(a.d.querySelector('#view').innerHTML, b.d.querySelector('#view').innerHTML, 'view identical apart from the switch');
  a.dom.window.close(); b.dom.window.close();
  console.log('herblore-potions: OK (74 rows x 8 Wiki columns, DOM gross/net, missing price, Flask unchanged)');
})().catch(e => { console.error(e); process.exit(1); });
