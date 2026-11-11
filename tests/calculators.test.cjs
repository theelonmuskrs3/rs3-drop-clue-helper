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
  assert.equal(d.querySelector('#live-price-banner, .live-price-banner'), null, 'calculators tab has no price banner');
  // native-first: in-app calculators are the primary content and open inside the app; everything else is an explicit "not in the app yet" list
  const nativeRows = D.calculators.filter(c => C.nativeFor(c.path));
  assert.ok(nativeRows.length >= 2);
  const cards = [...d.querySelectorAll('#calc-native .calc-card')];
  assert.equal(cards.length, nativeRows.length, 'one card per in-app calculator');
  for (const c of cards) { const a = c.querySelector('a.calc-card-main'); assert.match(a.getAttribute('href'), /^#calculators\/[a-z-]+$/); assert.equal(a.target, '', 'in-app card opens in the app, not a new tab'); assert.match(c.textContent, /In app · live prices/); }
  assert.equal(d.querySelectorAll('#calc-native .calc-wiki-only').length, 0);
  assert.equal(d.querySelectorAll('#calc-list .calc-in-app').length, 0, 'no fake native status in the upcoming list');
  assert.equal(d.querySelectorAll('#calc-list .calc-item').length, D.calculators.length - nativeRows.length);
  assert.equal(d.querySelectorAll('#calc-native .calc-star, #calc-list .calc-star').length, D.calculators.length, 'every catalog entry listed exactly once');
  assert.equal(d.querySelector('#calc-upcoming').open, false, 'upcoming list collapsed by default');
  for (const a of d.querySelectorAll('#view a[href]')) {
    if (a.getAttribute('href').startsWith('#calculators/')) { assert.equal(a.target, ''); continue; }
    assert.match(a.href, /^https:\/\/runescape\.wiki\/w\//); assert.equal(a.target, '_blank'); assert.equal(a.rel, 'noopener noreferrer'); assert.ok(a.classList.contains('calc-src'), 'Wiki links are secondary source links');
  }
  assert.match(d.querySelector('#calc-count').textContent, new RegExp(`^${nativeRows.length} in the app · ${D.calculators.length - nativeRows.length} not in the app yet`));
  // skill picker: Herblore tile shows the in-app Herblore calculators first
  const tile = [...d.querySelectorAll('#calc-tiles .calc-tile')].find(b => b.dataset.g === 'Artisan skills|Herblore'); assert.ok(tile && /in app/.test(tile.textContent));
  tile.click(); assert.ok(d.querySelectorAll('#calc-native .calc-card').length >= 2); assert.ok([...d.querySelectorAll('#calc-list .calc-group')].every(g => g.dataset.g === 'Artisan skills|Herblore'));
  assert.equal(d.querySelector('#calc-tiles .calc-tile[aria-pressed="true"]').dataset.g, 'Artisan skills|Herblore');
  d.querySelector('#calc-tiles .calc-tile[data-g=""]').click(); assert.equal(d.querySelectorAll('#calc-native .calc-card').length, nativeRows.length);
  const q = d.querySelector('#calc-q'); q.value = 'herblore'; q.dispatchEvent(new w.Event('input'));
  const n = d.querySelectorAll('#calc-list .calc-item').length; assert.ok(n > 0 && n < D.calculators.length); assert.ok(d.querySelector('#calc-upcoming').open, 'search opens matching upcoming groups');
  q.value = 'zzzz-no-match'; q.dispatchEvent(new w.Event('input')); assert.match(d.querySelector('#calc-list').textContent, /No calculators match/);
  q.value = ''; q.dispatchEvent(new w.Event('input'));
  const sec = d.querySelector('#calc-sec'); sec.value = 'Combat skills'; sec.dispatchEvent(new w.Event('change'));
  assert.ok([...d.querySelectorAll('.calc-group > summary small')].every(s => s.textContent === 'Combat skills')); sec.value = ''; sec.dispatchEvent(new w.Event('change'));
  // star (a not-yet-built calculator): its favourite says so and keeps only a source link
  const first = d.querySelector('#calc-list .calc-star'); const p = first.dataset.path;
  assert.equal(first.getAttribute('aria-pressed'), 'false'); assert.match(first.getAttribute('aria-label'), /^Save .+ to favourites$/);
  first.click();
  const same = [...d.querySelectorAll('#calc-list .calc-star')].filter(b => b.dataset.path === p);
  assert.ok(same.every(b => b.getAttribute('aria-pressed') === 'true' && b.textContent === '★'));
  assert.match(first.getAttribute('aria-label'), /^Remove .+ from favourites$/);
  const favLink = d.querySelector('#calc-fav-list a.calc-src'); assert.equal(favLink.href, C.wikiUrl(p), 'favourite keeps its Wiki source');
  assert.match(d.querySelector('#calc-fav-list').textContent, /Not in the app yet/);
  assert.match(d.querySelector('#calc-msg').textContent, /^Saved /);
  assert.deepEqual(JSON.parse(w.localStorage.getItem(C.FAV_KEY)).map(f => f.path), [p]);
  assert.equal(w.localStorage.getItem('mystats_v2'), '{"Attack":99}', 'saved stats untouched');
  // custom URL
  const url = d.querySelector('#calc-url'), add = d.querySelector('#calc-add');
  for (const v of ['javascript:alert(1)', 'http://127.0.0.1:8777/#calculators', '/w/Calculator:Herblore', 'https://evil.example/w/Calculator:X', 'https://runescape.wiki/w/Herblore']) {
    url.value = v; add.click(); assert.match(d.querySelector('#calc-msg').textContent, /^Not saved/, v);
  }
  assert.equal(JSON.parse(w.localStorage.getItem(C.FAV_KEY)).length, 1);
  url.value = 'https://runescape.wiki/w/Calculator:Some_new_calculator'; add.click();
  assert.equal(url.value, ''); assert.equal(d.querySelectorAll('#calc-fav-list li').length, 2);
  url.value = 'Calculator:Some new calculator'; add.click(); assert.match(d.querySelector('#calc-msg').textContent, /already a favourite/);
  const nstar = d.querySelector('#calc-native .calc-star'); nstar.click();
  const nfav = [...d.querySelectorAll('#calc-fav-list a.calc-open')]; assert.equal(nfav.length, 1); assert.match(nfav[0].getAttribute('href'), /^#calculators\//); assert.equal(nfav[0].target, '');
  nstar.click(); assert.equal(d.querySelectorAll('#calc-fav-list a.calc-open').length, 0);
  const stored = w.localStorage.getItem(C.FAV_KEY); dom.window.close();
  // persistence across reload
  ({dom, w, d} = await screen('calculators', {[C.FAV_KEY]: stored, mystats_v2: '{"Attack":99}'}));
  assert.equal(d.querySelectorAll('#calc-fav-list li').length, 2);
  assert.ok([...d.querySelectorAll('#calc-list .calc-star')].filter(b => b.dataset.path === p).every(b => b.getAttribute('aria-pressed') === 'true'));
  d.querySelector('#calc-fav-list .calc-unfav').click();
  assert.equal(d.querySelectorAll('#calc-fav-list li').length, 1);
  assert.ok([...d.querySelectorAll('#calc-list .calc-star')].filter(b => b.dataset.path === p).every(b => b.getAttribute('aria-pressed') === 'false'));
  assert.equal(JSON.parse(w.localStorage.getItem(C.FAV_KEY)).length, 1); assert.equal(w.localStorage.getItem('mystats_v2'), '{"Attack":99}');
  dom.window.close();
  // hostile stored favourites render as text, never as script/other-origin links
  ({dom, w, d} = await screen('calculators', {[C.FAV_KEY]: JSON.stringify([{path: 'javascript:alert(1)', label: 'x'}, {path: '/w/Calculator:X', label: '<img src=x onerror=alert(1)>'}])}));
  assert.equal(d.querySelectorAll('#calc-fav-list li').length, 1); assert.equal(d.querySelector('#calc-fav-list img'), null);
  assert.match(d.querySelector('#calc-fav-list').textContent, /<img src=x/); dom.window.close();
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
  console.log('PASS calculators: URL validation, independent favourites key, add/remove/persist/reopen, hostile storage, a11y, no framing; G.E. main tab + #items/~ge alias; 10-tab nav (Easter eggs under Items, About in footer) + CSS');
})().catch(e => { console.error(e); process.exit(1); });
