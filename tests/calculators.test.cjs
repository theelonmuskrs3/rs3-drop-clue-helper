// Calculators tab + main G.E. tab: unit and JSDOM integration (not a layout/browser test).
// NODE_PATH=/workspace/ge-dom-tests/node_modules node tests/calculators.test.cjs
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const C = require('../calculators.js');
const prices = require('../live-prices.js');
const tick = () => new Promise(r => setTimeout(r, 10));

/* ---- unit: URL validation ---- */
const ok = ['https://runescape.wiki/w/Calculator:Herblore', 'Calculator:Cooking/Fish profit', 'https://runescape.wiki/w/Calculator:Smithing/Special#Top', 'https://runescape.wiki/w/Calculator%3AMagic%2FHumidify'];
for (const u of ok) assert.ok(C.parseCalculatorUrl(u), 'accept ' + u);
assert.equal(C.parseCalculatorUrl('Calculator:Cooking/Fish profit').path, '/w/Calculator:Cooking/Fish_profit');
const bad = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x', '/w/Calculator:X', '#calculators', 'http://127.0.0.1:8777/#ge',
  'http://runescape.wiki/w/Calculator:X', 'https://evil.example/w/Calculator:X', 'https://runescape.wiki.evil.example/w/Calculator:X', 'https://user@runescape.wiki/w/Calculator:X',
  'https://runescape.wiki:8443/w/Calculator:X', 'https://runescape.wiki/w/Herblore', 'https://runescape.wiki/w/Calculator:', 'https://runescape.wiki/w/Calculator:X?action=edit',
  'https://runescape.wiki/api.php?action=parse', 'https://runescape.wiki/w/Calculator:<img src=x onerror=alert(1)>', '', null, 42, {}];
for (const u of bad) assert.equal(C.parseCalculatorUrl(u), null, 'reject ' + String(u));
for (const p of ['javascript:alert(1)', '//evil.example/w/x', 'https://evil.example/w/x', '/w/x?action=edit', '/wiki/x', '', null]) assert.equal(C.safeWikiPath(p), null, 'unsafe path ' + p);

/* ---- unit: storage ---- */
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return {getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m}; };
let st = mem({mystats_v2: '{"Attack":99}', mystats_v2_bak: '{"Attack":99}'});
assert.equal(C.FAV_KEY, 'dch_calc_favorites_v1'); assert.ok(!/stats/i.test(C.FAV_KEY));
let r = C.toggle(st, {path: '/w/Calculator:Herblore', label: 'Herblore'}); assert.ok(r.ok && r.on);
r = C.toggle(st, {path: '/w/Calculator:Herblore', label: 'Herblore'}); assert.ok(r.ok && !r.on); assert.deepEqual(C.load(st), []);
C.toggle(st, {path: '/w/Calculator:Herblore', label: 'Herblore'});
assert.equal(st.m.get('mystats_v2'), '{"Attack":99}'); assert.equal(st.m.get('mystats_v2_bak'), '{"Attack":99}');
assert.deepEqual([...st.m.keys()].sort(), ['dch_calc_favorites_v1', 'mystats_v2', 'mystats_v2_bak']);
for (const raw of ['not json', '{"a":1}', '[1,null,"x",{"path":"javascript:alert(1)"},{"path":"https://evil.example/w/x"},{"path":"/w/A","label":"<b>"} ,{"path":"/w/A"}]'])
  { const s2 = mem({[C.FAV_KEY]: raw}); const f = C.load(s2); assert.ok(f.every(x => C.safeWikiPath(x.path))); }
assert.deepEqual(C.load(mem({[C.FAV_KEY]: '[{"path":"/w/A","label":"<b>"},{"path":"/w/A"}]'})), [{path: '/w/A', label: '<b>', custom: false}], 'dedupe; label kept as text (escaped at render)');
const broken = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }};
assert.deepEqual(C.load(broken), []); assert.equal(C.toggle(broken, {path: '/w/A', label: 'A'}).ok, false);

/* ---- data ---- */
const D = JSON.parse(fs.readFileSync(path.join(base, 'data/calculators.json'), 'utf8'));
assert.equal(D.source, 'https://runescape.wiki/w/Calculators'); assert.ok(D.sourceRevision && D.sourceRevisionTimestamp);
assert.ok(D.calculators.length >= 150);
for (const c of D.calculators) { assert.ok(C.safeWikiPath(c.path), c.path); assert.ok(c.label && c.section && c.group && c.type, JSON.stringify(c)); }

/* ---- DOM ---- */
async function screen(hash, store = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), {url: 'http://127.0.0.1:8777/index.html#' + hash, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, errors = [], calls = [];
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
  w.scrollTo = () => {}; w.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  Object.defineProperty(w.navigator, 'serviceWorker', {value: {register() { return Promise.resolve(); }}});
  w.AbortController = AbortController; w.TextEncoder = TextEncoder;
  w.fetch = async url => {
    url = String(url); calls.push(url);
    if (url.startsWith(prices.BASE)) return {ok: true, json: async () => url.endsWith('/mapping') ? [] : {data: {}}};
    try { return {ok: true, json: async () => JSON.parse(fs.readFileSync(path.resolve(base, url.split('?')[0]), 'utf8'))}; }
    catch { return {ok: false, status: 404, json: async () => ({})}; }
  };
  w.addEventListener('error', e => errors.push(e.error));
  for (const f of ['live-prices.js', 'calculators.js', 'map.js', 'app.js']) w.eval(fs.readFileSync(path.join(base, f), 'utf8'));
  for (let i = 0; i < 100; i++) { await tick(); if (w.document.querySelector('#view .panel')) break; }
  await tick();
  assert.deepEqual(errors, [], hash + ' runtime errors');
  return {dom, w, d: w.document, calls};
}
(async () => {
  let {dom, w, d, calls} = await screen('calculators', {mystats_v2: '{"Attack":99}'});
  const tabs = [...d.querySelectorAll('.tabs button[data-tab]')];
  // Easter eggs moved under Items, About to the footer (user request 2026-11-11): 10 main tabs
  assert.equal(tabs.length, 10); assert.deepEqual(tabs.map(b => b.dataset.tab), ['drops', 'items', 'ge', 'char', 'clues', 'quests', 'train', 'money', 'calculators', 'map']);
  { const fa = d.querySelector('footer a.foot-about'); assert.ok(fa); assert.equal(fa.getAttribute('href'), '#about'); assert.ok(!fa.target); assert.match(d.querySelector('footer').textContent, /Dev\. Soy Yoda[\s\S]*property of Jagex[\s\S]*CC BY-NC-SA 3\.0/); }
  assert.equal(d.querySelector('.tabs button.on').dataset.tab, 'calculators'); assert.equal(d.querySelector('.tabs button[aria-current="page"]').dataset.tab, 'calculators');
  assert.equal(d.querySelector('button[data-tab="calculators"]').getAttribute('aria-label'), 'Calculators');
  assert.equal(d.querySelectorAll('#view iframe').length, 0, 'Wiki calculators are not framed (Wiki sends X-Frame-Options DENY)');
  assert.ok(!calls.some(u => /runescape\.wiki/.test(u) && !u.startsWith(prices.BASE)), 'no requests to runescape.wiki from the app');
  // Decanting-only (owner decision 2026-11-11): the Calculators tab is the Flask decanting calculator and nothing else
  const only = d => { assert.equal(w.location.hash, '#calculators/flask-decanting'); assert.ok(d.querySelector('#fd-title')); assert.equal(d.querySelector('#fd-title').textContent, 'Flask decanting');
    assert.equal(d.querySelectorAll('#calc-native, #calc-list, #calc-upcoming, #calc-tiles, #calc-q, #calc-url, #calc-fav-list').length, 0, 'no directory, Wiki-only list, picker, search or custom URL');
    assert.equal(d.querySelector('#view a[href="#calculators"]'), null, 'no "All calculators" link');
    for (const a of d.querySelectorAll('#view a[href^="#calculators/"]')) assert.equal(a.getAttribute('href'), '#calculators/flask-decanting');
    assert.doesNotMatch(d.querySelector('#view').textContent, /All calculators|not in the app yet|Herblore calculator|Cooking calculator|Fletching calculator|Crafting calculator/);
    assert.equal(d.querySelector('.tabs button.on').dataset.tab, 'calculators'); };
  only(d);
  assert.deepEqual(C.NATIVE.map(n => n.slug), ['flask-decanting']);
  for (const s of ['herblore', 'cooking', 'fletching', 'crafting', 'firemaking', 'runecrafting']) assert.equal(C.nativeBySlug(s), null, s + ' not offered');
  assert.equal(w.localStorage.getItem('mystats_v2'), '{"Attack":99}', 'saved stats untouched');
  dom.window.close();
  // every old calculator route lands on Flask decanting; the removed screens never run
  for (const h of ['calculators/herblore', 'calculators/cooking', 'calculators/fletching', 'calculators/crafting', 'calculators/firemaking', 'calculators/runecrafting', 'calculators/zzz', 'calculators/']) {
    ({dom, w, d} = await screen(h)); for (let i = 0; i < 50 && !d.querySelector('#fd-title'); i++) await tick();
    only(d); assert.equal(d.querySelectorAll('#hb-title, #ck-title, #fl-title, #cr-title, #hb-table, #ck-table, #fl-table, #cr-table').length, 0, h + ' removed screen not rendered'); dom.window.close(); }
  // stale favourites of removed calculators (and Wiki-only / custom ones) leave the calculator favourites list; nothing else is touched
  { const FD = '/w/Calculator:Herblore/Flask_decanting';
    const favs = [{path: '/w/Calculator:Herblore', label: 'Herblore'}, {path: FD, label: 'Flask decanting'}, {path: '/w/Calculator:Cooking', label: 'Cooking'},
      {path: '/w/Calculator:Some_new_calculator', label: 'Some new calculator', custom: true}, {path: '/w/Calculator:Smithing', label: 'Smithing'}];
    ({dom, w, d} = await screen('calculators', {[C.FAV_KEY]: JSON.stringify(favs), mystats_v2: '{"Attack":99}', mystats_v2_bak: '{"Attack":98}', other_key: 'keep'}));
    for (let i = 0; i < 50 && !d.querySelector('#fd-title'); i++) await tick(); only(d);
    assert.deepEqual(JSON.parse(w.localStorage.getItem(C.FAV_KEY)).map(f => f.path), [FD]);
    assert.equal(w.localStorage.getItem('mystats_v2'), '{"Attack":99}'); assert.equal(w.localStorage.getItem('mystats_v2_bak'), '{"Attack":98}'); assert.equal(w.localStorage.getItem('other_key'), 'keep');
    assert.equal(d.querySelector('#fd-star').getAttribute('aria-pressed'), 'true', 'Flask favourite kept'); dom.window.close();
    ({dom, w, d} = await screen('calculators/flask-decanting', {[C.FAV_KEY]: JSON.stringify([{path: FD, label: 'Flask decanting'}])}));
    assert.deepEqual(JSON.parse(w.localStorage.getItem(C.FAV_KEY)).map(f => f.path), [FD], 'nothing to prune: list unchanged'); dom.window.close();
    ({dom, w, d} = await screen('calculators', {[C.FAV_KEY]: 'not json'})); for (let i = 0; i < 50 && !d.querySelector('#fd-title'); i++) await tick(); only(d); dom.window.close(); }
  // G.E. main tab and old bookmark alias
  ({dom, w, d} = await screen('ge'));
  assert.equal(d.querySelector('.tabs button.on').dataset.tab, 'ge');
  assert.equal(d.querySelectorAll('#view iframe#ge-frame').length, 1); assert.ok(d.querySelector('#ge-fit') && d.querySelector('#ge-readable'));
  assert.equal(d.querySelector('#view .subnav'), null); assert.equal(d.querySelector('.live-price-banner'), null);
  dom.window.close();
  ({dom, w, d} = await screen('items/~ge'));
  for (let i = 0; i < 50 && w.location.hash !== '#ge'; i++) await tick();
  for (let i = 0; i < 50 && !d.querySelector('#ge-frame'); i++) await tick();
  assert.equal(w.location.hash, '#ge'); assert.equal(d.querySelector('.tabs button.on').dataset.tab, 'ge'); assert.equal(d.querySelectorAll('#ge-frame').length, 1);
  dom.window.close();
  ({dom, w, d} = await screen('items/~disc'));
  assert.equal(d.querySelector('#view .subnav a[href="#ge"]').textContent, 'Grand Exchange'); assert.doesNotMatch(d.querySelector('#view .subnav').textContent, /G\.E\./);
  assert.equal(d.querySelector('button[data-tab="ge"]').textContent.trim(), 'Grand Exchange'); assert.doesNotMatch(d.querySelector('.tabs').textContent, /G\.E\./); dom.window.close();
  // CSS: nav grid for 12 tabs, no sideways scroll container
  const css = fs.readFileSync(path.join(base, 'neon.css'), 'utf8'); const tail = css.slice(css.indexOf('/* ===== 10 main tabs'));
  assert.match(tail, /@media \(max-width:699px\)\{[^}]*repeat\(5,minmax\(0,1fr\)\)/); assert.match(tail, /@media \(min-width:700px\)\{[^}]*repeat\(5,minmax\(0,1fr\)\)[^}]*overflow:visible/); assert.match(tail, /@media \(min-width:1180px\)\{[^}]*repeat\(10,minmax\(0,1fr\)\)/);
  assert.match(tail, /\.tabs button\{white-space:normal;word-break:normal;overflow-wrap:normal/);
  { let x = await screen('secrets'); assert.equal(x.d.querySelector('.tabs button.on').dataset.tab, 'items'); assert.ok(x.d.querySelector('.subnav a.on[href="#secrets"]'));
    assert.match(x.d.querySelector('#view').textContent, /Easter Eggs/); x.dom.window.close();
    x = await screen('items'); assert.ok(x.d.querySelector('.subnav a[href="#secrets"]')); x.dom.window.close();
    x = await screen('about'); assert.equal(x.d.querySelectorAll('.tabs button.on').length, 0); assert.ok(x.d.querySelector('#view').textContent.length > 200); x.dom.window.close(); }
  console.log('PASS calculators: URL validation, independent favourites key, decanting-only tab (old routes redirect, stale favourites pruned, other storage untouched), a11y, no framing; G.E. main tab + #items/~ge alias; 10-tab nav (Easter eggs under Items, About in footer) + CSS');
})().catch(e => { console.error(e); process.exit(1); });

// Phone nav (user 2026-11-11): under 480px the 10 main tabs are the same 5 x 2 tiles as 480-699px (no third row; Calculators and
// Map no longer span), whole words only; tools/nav_fit_check.py checks the widths with Cinzel metrics.
{
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'neon.css'), 'utf8');
  const tail = css.slice(css.indexOf('/* ===== 10 main tabs'), css.indexOf('/* ===== Calculators tab'));
  const block = tail.slice(tail.indexOf('@media (max-width:479px){'), tail.indexOf('@media (max-width:360px){'));
  assert.ok(block.includes('.tabs{grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}'));
  assert.ok(block.includes('.tabs button{grid-column:auto;font-size:9px;letter-spacing:0'));
  assert.ok(block.includes('.tabs button .tl-short{display:inline}'), 'Calcs short label kept on phones');
  assert.ok(!/span [0-9]/.test(tail) && !/repeat\(12/.test(tail), 'no spanning tile / third row');
  assert.ok(!/data-tab=(calculators|map)\][^{]*\{[^}]*grid-column/.test(css), 'Calculators/Map never span');
  assert.ok(!/\.tabs button[^{]*\{[^}]*(word-break:break-all|overflow-wrap:anywhere)/.test(css), 'tab labels never break inside a word');
  assert.match(tail, /@media \(min-width:700px\)\{[^}]*repeat\(5,minmax\(0,1fr\)\)/); assert.match(tail, /@media \(min-width:1180px\)\{[^}]*repeat\(10,minmax\(0,1fr\)\)/);
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/<button data-tab="([a-z]+)"/g)].map(m => m[1]), ['drops', 'items', 'ge', 'char', 'clues', 'quests', 'train', 'money', 'calculators', 'map']);
  console.log('phone nav: 5 x 2 under 480px (no third row), whole words, Calcs short label');
}
