// Items tab, blank "Search all items": most expensive items by each item's latest recorded Sell trade (shared feed).
// Only real GE IDs that map to one name in the item list; no trade / 0 / shared names left out; typing searches as before; clearing restores.
// NODE_PATH=/workspace/ge-dom-tests/node_modules node tests/items-top.test.cjs
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..'), api = require('../live-prices.js');
const tick = () => new Promise(r => setTimeout(r, 10));
const now = Date.now() / 1000;
let FEED = 'ok', release = null;
const mapping = [{id: 1038, name: 'Red partyhat'}, {id: 1042, name: 'Blue partyhat'}, {id: 4151, name: 'Abyssal whip'}, {id: 4587, name: 'Dragon scimitar'},
  {id: 9001, name: 'Not in item list xyz'}, {id: 9002, name: 'Dup name'}, {id: 9003, name: 'Dup name'}, {id: 1040, name: 'Yellow partyhat'}, {id: 1044, name: 'Green partyhat'}];
const latest = () => ({data: {
  1038: {high: 2100000000, highTime: now - 60, low: 2000000000, lowTime: now - 86400 * 3},   // old trade: still listed, with its age
  1042: {high: 1600000000, highTime: now - 60, low: 1500000000, lowTime: now - 120},
  4151: {high: 1000000, highTime: now - 30, low: 900000, lowTime: now - 30},
  4587: {high: 70000, highTime: now - 30, low: 60000, lowTime: now - 30},
  9001: {high: 9e9, highTime: now, low: 9e9, lowTime: now}, 9002: {high: 8e9, highTime: now, low: 8e9, lowTime: now}, 9003: {high: 8e9, highTime: now, low: 8e9, lowTime: now},
  1040: {high: 5, highTime: now, low: 0, lowTime: now},            // 0: left out
  1044: {high: 3000000000, highTime: now, low: null, lowTime: null} // no Sell trade: left out
}});
async function screen(hash) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), {url: 'http://127.0.0.1:8808/index.html#' + hash, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, errors = [];
  w.scrollTo = () => {}; w.matchMedia = () => ({matches: false, addEventListener(){}, removeEventListener(){}});
  Object.defineProperty(w.navigator, 'serviceWorker', {value: {register(){ return Promise.resolve(); }}});
  w.AbortController = AbortController; w.TextEncoder = TextEncoder; w.RS3Prices = api;
  w.fetch = async url => { url = String(url);
    if (url.startsWith(api.BASE)) { if (FEED === 'hang') await new Promise(r => { release = r; }); return {ok: true, json: async () => url.endsWith('/mapping') ? mapping : latest()}; }
    const rel = url.split('?')[0]; try { return {ok: true, json: async () => JSON.parse(fs.readFileSync(path.resolve(base, rel), 'utf8'))}; } catch { return {ok: false, status: 404, json: async () => ({})}; } };
  w.addEventListener('error', e => errors.push(e.error));
  for (const f of ['live-prices.js', 'map.js', 'calculators.js']) w.eval(fs.readFileSync(path.join(base, f), 'utf8'));
  w.eval(fs.readFileSync(path.join(base, 'app.js'), 'utf8') + '\nwindow.__t={book:LIVE.book,refresh:refreshPriceView};');
  for (let i = 0; i < 400; i++) { await tick(); if (w.document.querySelector('#top') && (FEED === 'hang' ? w.document.querySelector('#top-status') : w.document.querySelector('#top-list .allrow'))) break; }
  assert.deepEqual(errors, []);
  return {dom, w, d: w.document};
}
(async () => {
  let {dom, w, d} = await screen('items');
  const names = () => [...d.querySelectorAll('#top-list .allrow a.hit')].map(a => decodeURIComponent(a.getAttribute('href').replace('#items/', '')));
  assert.deepEqual(names(), ['Red partyhat', 'Blue partyhat', 'Abyssal whip', 'Dragon scimitar'], 'highest Sell first; unmapped/shared/0/no-trade left out');
  assert.match(d.querySelector('.top-h').textContent, /Most expensive by latest Sell trade/);
  const info = d.querySelector('#top-info'); assert.equal(info.open, false); assert.match(info.textContent, /RuneScape Wiki Prices/); assert.match(info.textContent, /Prices fetched/);
  const r0 = d.querySelector('#top-list .allrow'); assert.ok(r0.querySelector('img.ico[src$=".webp"]'), 'item icon'); assert.ok(r0.querySelector('.gp, .gpc'), 'shared price tag with coins icon'); assert.ok(d.querySelectorAll('#top-list .allrow')[2].querySelector('.gp'), 'fresh: gold price with coin');
  assert.match(r0.textContent, /Sell 2,000,000,000 gp · stale/, 'old trade labelled'); assert.match(d.querySelectorAll('#top-list .allrow')[1].textContent, /Sell 1,500,000,000 gp/);
  assert.match(d.querySelector('#cnt').textContent, /Type to search all/);
  // typing: normal search, list hidden; clearing restores it
  const q = d.querySelector('#q'); q.value = 'abyssal whip'; q.dispatchEvent(new w.Event('input'));
  for (let i = 0; i < 100 && !/match/.test(d.querySelector('#cnt').textContent); i++) await tick();
  assert.equal(d.querySelector('#top').innerHTML, ''); assert.ok(d.querySelector('#res .allrow')); assert.match(d.querySelector('#cnt').textContent, /entries match/);
  d.querySelector('#clr').click(); assert.equal(names().length, 4); assert.equal(d.querySelector('#res').innerHTML, '');
  // price update re-sorts
  w.__t.book.data[4151].low = 3e9; w.__t.refresh(); assert.equal(names()[0], 'Abyssal whip');
  dom.window.close();
  // loading: short status, no prices shown
  FEED = 'hang'; ({dom, w, d} = await screen('items'));
  assert.equal(d.querySelector('#top-status').textContent, 'Loading prices…'); assert.equal(d.querySelectorAll('#top-list .allrow').length, 0);
  release(); dom.window.close();
  console.log('PASS Items blank search: most expensive by latest Sell, filtered IDs, loading, update, search/clear');
})().catch(e => { console.error(e); process.exit(1); });
