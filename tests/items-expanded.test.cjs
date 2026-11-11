// Item pages open fully (pt348u): every "Where to get it" section is expanded and every wiki map location shows its map
// without a click, started lazily near the screen with at most 2 at a time; other tabs' collapsed choices are unchanged.
const assert = require('assert'), fs = require('fs'), path = require('path');
const {JSDOM} = require('jsdom');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const pick = (start, end) => { const i = app.indexOf(start), j = app.indexOf(end, i); assert.ok(i >= 0 && j > i, start); return app.slice(i, j); };
const code = pick('function wtgExpand(el)', '  b.dataset.auto = \'1\';   // a click wins') + "  b.dataset.auto = '1';\n  mmOpen(b);\n});";
(async () => {
  const dom = new JSDOM(`<div id="wtg"><div class="wtg">
    <details class="thv"><summary>Thieve Chest (Dwarven mines)</summary><div class="thv-loc"><b>Where (1 location on the wiki)</b>
      <div class="wcard wloc"><div class="row wacts"><button class="btn mini" data-mm='{"map":28,"x":3000,"y":9800}' data-t="Find on map">Find on map</button></div></div></div></details>
    <details class="thvmore"><summary>Show all 8 thieving sources</summary>${[1, 2, 3, 4].map(i => `<details class="thv"><summary>s${i}</summary><div class="wcard"><div class="row wacts"><button class="btn mini" data-mm='{"map":28,"x":${i},"y":1}' data-t="Find on map">Find on map</button></div></div></details>`).join('')}</details>
    <details class="glmore"><summary>+3 more</summary>a</details></div></div>
    <details class="src-info" id="items-src-info"><summary>Details &amp; sources</summary></details>`, {runScripts: 'outside-only'});
  const w = dom.window;
  const started = [], waits = [];
  let observed = [], cb;
  w.IntersectionObserver = class { constructor(f, o) { cb = f; this.o = o; } observe(t) { observed.push(t); } unobserve(t) { observed = observed.filter(x => x !== t); } };
  w.miniMap = (box, o) => { started.push(o.x); return new Promise(r => waits.push(r)); };
  w.esc = s => String(s);
  w.eval(code + '\nwindow.wtgExpand = wtgExpand;');
  const d = w.document, el = d.getElementById('wtg');
  w.wtgExpand(el);
  assert.ok([...el.querySelectorAll('details')].every(x => x.open), 'every Where-to-get-it section open (source cards, Show all, folds)');
  assert.equal(d.getElementById('items-src-info').open, false, 'Details & sources banner stays collapsed');
  assert.equal(observed.length, 5, 'every map location is watched; nothing starts before it nears the screen');
  assert.equal(started.length, 0);
  cb(observed.map(t => ({target: t, isIntersecting: true})));
  assert.deepEqual(started, [3000, 1], 'maps open without a click, at most 2 at a time');
  assert.equal(el.querySelectorAll('.mmbox').length, 2);
  assert.equal(el.querySelector('button[data-mm]').textContent, 'Hide map');
  waits.shift()(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(started, [3000, 1, 2], 'next map starts when one finishes');
  // the user can still collapse: Hide map removes it and a section can be closed
  el.querySelector('button[data-mm]').click(); await new Promise(r => setTimeout(r, 0));
  assert.equal(el.querySelector('.wloc .mmbox'), null); assert.equal(el.querySelector('button[data-mm]').textContent, 'Find on map');
  // a clicked button is not opened again by the queue
  const b4 = el.querySelectorAll('button[data-mm]')[4]; b4.click(); while (waits.length) { waits.shift()(); await new Promise(r => setTimeout(r, 0)); }
  assert.equal(b4.closest('.wcard').querySelectorAll('.mmbox').length, 1, 'no duplicate map after a click');
  // only item pages: called from fillWtg alone; other screens keep their collapsed Details & sources
  assert.equal((app.match(/wtgExpand\(el\)/g) || []).length, 2, 'definition + the one call in fillWtg');
  assert.match(pick('async function fillWtg', 'function wtgExpand'), /wtgExpand\(el\);\n\}/);
  for (const id of ['items-src-info', 'ge-info', 'fd-info', 'top-info', 'mm-src-info']) assert.match(app, new RegExp(`<details class="[^"]*" id="${id}"><summary>`), id + ' still collapsed by default');
  console.log('PASS items expanded: all Where-to-get-it sections open, maps shown without a click (lazy, 2 at a time), Hide map works, other tabs unchanged');
})().catch(e => { console.error(e); process.exit(1); });
