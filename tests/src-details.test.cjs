// Circled source/explanatory copy is hidden in a closed "Details & sources" section
// and stays readable when opened. Filters, results, Fit/Readable controls and the
// G.E. embed stay visible. Dynamic timestamps/status still update while closed.
// Install jsdom outside this repo: npm install --prefix /workspace/ge-dom-tests jsdom@26
// NODE_PATH=/workspace/ge-dom-tests/node_modules node tests/src-details.test.cjs
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const vm = require('node:vm');
const base = path.resolve(__dirname, '..');
const api = require('../live-prices.js');
const appSrc = fs.readFileSync(path.join(base, 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(base, 'neon.css'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

{ // static: each circled block is a closed details, flask PR14 disclosure unchanged
  assert.match(appSrc, /<details class="src-info live-price-banner" id="live-price-info"><summary>Details &amp; sources<\/summary>/);
  assert.match(appSrc, /<details class="src-info" id="ge-info"><summary>Details &amp; sources<\/summary>/);
  assert.match(appSrc, /<details class="src-info" id="items-src-info"><summary>Details &amp; sources<\/summary>/);
  assert.match(appSrc, /id="items-src-status"/);
  assert.match(appSrc, /<details class="src-info" id="mm-src-info"><summary>Details &amp; sources<\/summary>/);
  assert.match(appSrc, /<details class="calc-assume-d fd-info" id="fd-info"><summary>Details &amp; sources<\/summary>/);
  assert.doesNotMatch(appSrc, /id="(live-price-info|ge-info|items-src-info|mm-src-info|fd-info)"[^>]*\sopen/);
  assert.match(appSrc, /Every skill's training guide from the RS3 wiki/);
  assert.match(appSrc, /Private: levels and quest ticks are saved in this browser on this device only/);
  assert.match(cssSrc, /\.src-info>summary\{cursor:pointer/);
}

{ // G.E.: circled intro + connection + source-overview notes are inside closed details;
  // Open source button, Fit/Readable and the embed stay outside; dynamic text still updates.
  const extract = (start, end) => appSrc.slice(appSrc.indexOf(start), appSrc.indexOf(end, appSrc.indexOf(start)));
  const ge = extract('function geView() {', '\n/* Calculators:');
  const nav = extract('function subnav(on) {', '\n/* ----- stats');
  const handlers = new Map();
  const frame = {style:{}, getAttribute: () => frame.url, set src(v) { frame.url = v; }};
  const status = {}, host = {clientWidth: 320, style:{}, dataset:{}}, note = {};
  const button = () => ({setAttribute(){}, classList:{toggle(){}}});
  const context = {view: {}, navigator: {onLine: true}, geCleanup: null,
    $: id => ({'#ge-frame':frame,'#ge-status':status,'#ge-viewport':host,'#ge-fit-note':note,'#ge-fit':button(),'#ge-readable':button()})[id],
    window: {innerHeight:900, addEventListener: (n, f) => handlers.set(n, f), removeEventListener: n => handlers.delete(n)}};
  vm.createContext(context);
  vm.runInContext(nav + '\n' + ge + '\ngeView()', context);
  const html = context.view.innerHTML;
  const i = html.indexOf('id="ge-info"');
  const det = html.slice(html.lastIndexOf('<details', i), html.indexOf('</details>', i) + 10);
  assert.doesNotMatch(html, /<details[^>]*id="ge-info"[^>]*\sopen/);
  assert.match(det, /<summary>Details &amp; sources<\/summary>/);
  assert.match(det, /RuneScape Wiki Prices — trade data supplied by Jagex/);
  assert.match(det, /not Jagex's official G\.E\. website/);
  assert.match(det, /id="ge-status"/);
  assert.match(det, /id="ge-fit-note"/);
  assert.doesNotMatch(det, /ge-source|ge-view-controls|id="ge-viewport"|Internet required/);
  assert.match(html, /class="btn sub ge-source"/);
  assert.match(html, /id="ge-fit"/);
  assert.match(html, /id="ge-readable"/);
  assert.match(html, /id="ge-viewport"/);
  assert.match(html, /Internet required/);
  assert.match(status.textContent, /Online connection detected/);
  assert.match(note.textContent, /Source overview: 31% size/);
  context.navigator.onLine = false; handlers.get('offline')();
  assert.match(status.textContent, /Offline: live G.E. requires internet/);
  context.geCleanup();
}

const fixtures = {
  'data/items.json': {},
  'data/prices.json': {date: '21 Oct 2026', ts: 1792556063, source: 'test', prices: {'Test whip': 100}, tradeable: {'Test whip': true}},
  'data/gear.json': {gear: [], recommended: [], armour_sets: [], pvp_quotes: {}, source: ''},
  'data/iall.json': {ch: 250, fl: {trade: 1, untr: 2, mem: 4, f2p: 8, equip: 16, stack: 32, quest: 64, holiday: 128, disc: 256, limited: 512, override: 1024, drop: 2048, gear: 4096, mtx: 8192, removed: 16384, ge: 32768}, stats: {items: 1, overrides: 0}, rows: [['Test whip', '', 100, 1, null]]},
  'data/monsters.json': [],
  'data/gsets.json': {cls: [], ge: []},
  'data/obdragon.json': {rows: []},
  'data/money.json': {rows: [], src: [], lists: [], ge_date: '21 Oct 2026', stats: {pages: 592, methods: 878, list_pages: 7}}
};

async function screen(hash) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), {url: 'http://127.0.0.1:8804/index.html#' + hash, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, errors = [];
  w.scrollTo = () => {}; w.matchMedia = () => ({matches: false, addEventListener(){}, removeEventListener(){}});
  if (!w.CSS) w.CSS = {};
  if (!w.CSS.escape) w.CSS.escape = s => String(s).replace(/[^A-Za-z0-9_-]/g, c => '\\' + c.charCodeAt(0).toString(16) + ' ');
  Object.defineProperty(w.navigator, 'serviceWorker', {value: {register(){ return Promise.resolve(); }}});
  w.AbortController = AbortController; w.TextEncoder = TextEncoder;
  w.RS3Prices = api;
  w.fetch = async (url) => {
    url = String(url);
    if (url.startsWith(api.BASE)) {
      const mapping = [{id: 1, name: 'Test whip'}];
      const json = url.endsWith('/mapping') ? mapping : {data: {1: {high: 120, low: 90, highTime: Date.now() / 1000, lowTime: Date.now() / 1000}}};
      return {ok: true, json: async () => json};
    }
    const rel = url.split('?')[0];
    if (Object.prototype.hasOwnProperty.call(fixtures, rel)) return {ok: true, json: async () => fixtures[rel]};
    const file = path.resolve(base, rel);
    try { return {ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8'))}; }
    catch { return {ok: false, status: 404, json: async () => ({})}; }
  };
  w.addEventListener('error', e => errors.push(e.error));
  w.eval(fs.readFileSync(path.join(base, 'live-prices.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(base, 'map.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(base, 'calculators.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(base, 'player-import.js'), 'utf8')); w.eval(fs.readFileSync(path.join(base, 'chars.js'), 'utf8'));   // same order as index.html
  w.eval(fs.readFileSync(path.join(base, 'app.js'), 'utf8') + '\nwindow.__t={book:LIVE.book,refresh:refreshPriceView};');
  for (let i = 0; i < 200; i++) {
    await tick();
    if (hash === 'ge') { if (w.document.querySelector('#ge-info') && w.document.querySelector('#ge-status')?.textContent) break; }
    else if (hash === 'items/~search') { if (w.document.querySelector('#items-src-info') && w.document.querySelector('#res')) break; }
    else if (hash === 'money') { if (w.document.querySelector('#mm-src-info') && w.document.querySelector('#mmq')) break; }
    else if (hash === 'char') { if (w.document.querySelector('#live-price-info') && w.document.querySelector('.chhero')) break; }
    else if (w.document.querySelector('#live-price-status')?.textContent) break;
  }
  assert.deepEqual(errors, [], hash + ' runtime errors');
  return {dom, w, d: w.document};
}

function closedInfo(el, label) {
  assert.ok(el, label + ' details exists');
  assert.equal(el.open, false, label + ' closed by default');
  assert.equal(el.querySelector('summary').textContent, 'Details & sources');
}

(async () => {
  // Shared banner on Character (and the same bindPriceView on Items/Training/Money): collapsed, timestamps update while closed.
  let {dom, w, d} = await screen('char');
  const banner = d.querySelector('#live-price-info');
  closedInfo(banner, 'shared live-price banner');
  assert.ok(banner.classList.contains('live-price-banner'));
  assert.match(banner.textContent, /RuneScape Wiki Prices — trade data supplied by Jagex/);
  assert.match(banner.textContent, /Buy\/high = acquisition cost/);
  assert.ok(banner.contains(d.querySelector('#live-price-status')));
  assert.match(d.querySelector('#live-price-status').textContent, /Last successful price fetch:|Live source unavailable or loading|Offline/);
  const hero = d.querySelector('.chhero');
  assert.ok(hero && !banner.contains(hero), 'Character heading stays visible outside the banner details');
  assert.match(hero.textContent, /Private: levels and quest ticks are saved in this browser on this device only|Your levels fit the gear/);
  assert.doesNotMatch(banner.textContent, /Private: levels and quest ticks|Private: saved automatically|My Character/);
  assert.ok(d.querySelector('.skgrid') && !banner.contains(d.querySelector('.skgrid')), 'level inputs stay visible');
  const before = d.querySelector('#live-price-status').textContent;
  w.__t.book.online = false; w.__t.refresh();
  assert.equal(banner.open, false, 'status update does not open the banner details');
  assert.match(d.querySelector('#live-price-status').textContent, /Offline/);
  assert.notEqual(d.querySelector('#live-price-status').textContent, before);
  banner.open = true;
  assert.match(banner.textContent, /Price source & graphs/);
  assert.equal(d.querySelector('.chpriv').hidden, false);
  console.log('Character: shared Details & sources closed, timestamps update, privacy/levels visible');
  dom.window.close();

  // Items advanced search: circled catalog + no-filter status in closed details; filters/results stay up front.
  // Items tab default (owner t303u): plain #items opens "Search all items"; the rarity/price search keeps #items/~search
  ({dom, w, d} = await screen('items'));
  for (let i = 0; i < 200 && !d.querySelector('.subnav a.on'); i++) await tick();
  assert.equal(d.querySelector('.subnav a.on').getAttribute('href'), '#items/~all', 'Items opens on Search all items');
  assert.ok(d.querySelector('.subnav a[href="#items/~search"]'), 'Search · rarity · prices still available');
  assert.equal(d.querySelectorAll('.subnav a.btn').length >= 5, true);
  assert.ok(d.querySelector('#live-price-info'), 'shared prices Details still bound');
  dom.window.close();
  ({dom, w, d} = await screen('items/~search'));
  const itemsInfo = d.querySelector('#items-src-info');
  closedInfo(itemsInfo, 'Items search info');
  assert.match(itemsInfo.textContent, /items: every item page of the RS3 wiki copy/);
  assert.match(itemsInfo.textContent, /Guide snapshots/);
  assert.match(itemsInfo.textContent, /Rarity is an item's best drop chance/);
  const st = d.querySelector('#items-src-status');
  assert.ok(itemsInfo.contains(st));
  assert.equal(st.hidden, false);
  assert.match(st.textContent, /No filter picked: sorting by fresh observed Sell quotes; stale\/unavailable items are last/);
  for (const sel of ['#q', '#rar', '#show', '#sort', '#res', '#gvt']) {
    const el = d.querySelector(sel);
    assert.ok(el && !itemsInfo.contains(el), sel + ' stays outside Items details');
  }
  assert.match(d.querySelector('#res').textContent, /1 match/);
  assert.ok(d.querySelector('#res a.hit'), 'result cards stay visible');
  assert.doesNotMatch(d.querySelector('#res').textContent, /No filter picked/);
  const banner2 = d.querySelector('#live-price-info');
  closedInfo(banner2, 'Items shared banner');
  d.querySelector('#q').value = 'Test whip';
  d.querySelector('#q').dispatchEvent(new w.Event('input', {bubbles: true}));
  for (let i = 0; i < 40; i++) { await tick(); if (st.hidden) break; }
  assert.equal(itemsInfo.open, false, 'filter change does not open Items details');
  assert.equal(st.hidden, true, 'no-filter status clears once a name is typed');
  assert.doesNotMatch(st.textContent, /No filter picked/);
  assert.match(d.querySelector('#res').textContent, /1 match/);
  itemsInfo.open = true;
  assert.match(itemsInfo.textContent, /every item page of the RS3 wiki copy/);
  console.log('Items: catalog + no-filter status collapsed, filters/results visible, status updates closed');
  dom.window.close();

  // Money: circled methods intro collapsed; search, category chips and results stay visible.
  ({dom, w, d} = await screen('money'));
  const mm = d.querySelector('#mm-src-info');
  closedInfo(mm, 'Money intro');
  assert.match(mm.textContent, /Every money-making guide on the RS3 wiki: 878 methods from 592 guide pages/);
  assert.match(mm.textContent, /Sorting and minimum profit use the estimate where the Wiki gives a complete item formula/);
  for (const sel of ['#mmq', '#mmc', '#mmsort', '#mmres']) {
    const el = d.querySelector(sel);
    assert.ok(el && !mm.contains(el), sel + ' stays outside Money details');
  }
  assert.ok(d.querySelector('#live-price-info') && d.querySelector('#live-price-info').open === false);
  const sources = [...d.querySelectorAll('h3')].find(h => h.textContent === 'Sources');
  assert.ok(sources && !mm.contains(sources), 'uncircled Sources panel stays visible');
  mm.open = true;
  assert.match(mm.textContent, /not every method can be recomputed/);
  console.log('Money: intro collapsed, search/categories/results visible');
  dom.window.close();

  // G.E. in a real DOM: open the details, confirm controls/embed stay outside, connection text updates inside.
  ({dom, w, d} = await screen('ge'));
  const geInfo = d.querySelector('#ge-info');
  closedInfo(geInfo, 'G.E. info');
  assert.ok(geInfo.contains(d.querySelector('#ge-status')));
  assert.ok(geInfo.contains(d.querySelector('#ge-fit-note')));
  assert.match(d.querySelector('#ge-status').textContent, /Online connection detected|Offline: live G.E./);
  Object.defineProperty(d.querySelector('#ge-viewport'), 'clientWidth', {value: 320, configurable: true});
  w.dispatchEvent(new w.Event('resize'));
  assert.equal(geInfo.open, false, 'fit-note update does not open G.E. details');
  assert.match(d.querySelector('#ge-fit-note').textContent, /Source overview:|Normal source text size/);
  assert.ok(!geInfo.contains(d.querySelector('.ge-source')));
  assert.ok(!geInfo.contains(d.querySelector('.ge-view-controls')));
  assert.ok(!geInfo.contains(d.querySelector('#ge-viewport')));
  assert.ok(d.querySelector('#ge-fit') && d.querySelector('#ge-readable') && d.querySelector('#ge-frame'));
  const internet = [...d.querySelectorAll('.ge-panel .note')].find(p => p.textContent.startsWith('Internet required'));
  assert.ok(internet && !geInfo.contains(internet));
  assert.equal(d.querySelector('.live-price-banner'), null, 'G.E. still has no shared price banner');
  Object.defineProperty(w.navigator, 'onLine', {configurable: true, get: () => false});
  w.dispatchEvent(new w.Event('offline'));
  assert.equal(geInfo.open, false);
  assert.match(d.querySelector('#ge-status').textContent, /Offline: live G.E. requires internet/);
  geInfo.open = true;
  assert.match(geInfo.textContent, /not Jagex's official G\.E\. website/);
  assert.match(geInfo.textContent, /Offline: live G.E. requires internet/);
  console.log('G.E. DOM: details closed, controls/embed visible, connection text updates inside');
  dom.window.close();

  console.log('PASS: circled Details & sources stay closed, open to the original text, and leave controls/results visible');
})().catch(e => { console.error(e); process.exit(1); });
