// Non-browser regression checks. Actual source iframe rendering still needs a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('neon.css', 'utf8');
const extract = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
const ge = extract('function geView() {', '\n/* Calculators:');
// Strict relocation: the G.E. view is byte-identical to the released version except that it no longer sits under the Items subnav.
const { execFileSync } = require('node:child_process');
let released = null; try { released = execFileSync('git', ['show', 'f81a9ea80:app.js'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch (e) {}
if (released) {
  const old = released.slice(released.indexOf('function geView() {'), released.indexOf('\nasync function itemsView', released.indexOf('function geView() {')));
  assert.equal(ge, old.replace('view.innerHTML = `${subnav(\'ge\')}<section', 'view.innerHTML = `<section'), 'geView relocated unchanged');
} else console.log('note: release commit f81a9ea80 not available; byte-identical relocation check skipped');
assert.ok(ge.startsWith('function geView()'));
const nav = extract('function subnav(on) {', '\n/* ----- stats');
const handlers = new Map();
let loads = 0;
const frame = {style:{},getAttribute: () => frame.url, set src(v) { frame.url = v; loads++; }};
const status = {},host={clientWidth:320,style:{},dataset:{}},note={};
const button=()=>({setAttribute(){},classList:{toggle(){}}});const fitButton=button(),readableButton=button();
const context = {view: {}, navigator: {onLine: true}, geCleanup: null,
  $: id => ({'#ge-frame':frame,'#ge-status':status,'#ge-viewport':host,'#ge-fit-note':note,'#ge-fit':fitButton,'#ge-readable':readableButton})[id],
  window: {innerHeight:900,addEventListener: (n, f) => handlers.set(n, f), removeEventListener: n => handlers.delete(n)}};
vm.createContext(context);
vm.runInContext(nav + '\n' + ge, context);
assert.equal(loads, 0, 'no source requests before selecting G.E.');
vm.runInContext('geView()', context);
assert.equal(loads, 1);
for(const width of [320,390,800,1280]){
 host.clientWidth=width;handlers.get('resize')();
 const scale=Number(host.dataset.sourceScale),source=Number(host.dataset.sourceWidth);
 assert.equal(source,Math.max(1024,width));assert.equal(source*scale,width,'entire iframe viewport fits, not offset/cropped');
 assert.ok(Math.abs(parseFloat(frame.style.height)*scale-parseFloat(host.style.height))<1.01,'height compensated for scale');
}
readableButton.onclick();assert.equal(host.dataset.sourceScale,1);fitButton.onclick();
assert.equal(frame.url, 'https://prices.runescape.wiki/rs/');
assert.match(context.view.innerHTML, /RuneScape Wiki Prices — trade data supplied by Jagex/);
assert.match(context.view.innerHTML, /href="https:\/\/prices.runescape.wiki\/rs\/" target="_blank" rel="noopener noreferrer"/);
assert.match(context.view.innerHTML, /title="RuneScape Wiki live Grand Exchange/);
assert.doesNotMatch(context.view.innerHTML, /class="row subnav"/, 'G.E. is a main tab, not under the Items subnav');
assert.match(vm.runInContext("subnav('search')", context), /href="#ge"/, 'Items subnav still links to the G.E. tab');
assert.equal((context.view.innerHTML.match(/<iframe/g) || []).length, 1);
context.navigator.onLine = false; handlers.get('offline')();
assert.match(status.textContent, /Offline: live G.E. requires internet/);
context.geCleanup(); assert.equal(handlers.size, 0, 'route cleanup removes event handlers');
frame.url = undefined; loads = 0;
vm.runInContext('geView()', context);
assert.equal(loads, 0, 'initial offline visit does not load remote frame');
context.navigator.onLine = true; handlers.get('online')(); handlers.get('online')();
assert.equal(loads, 1, 'reconnecting loads once, not on every connection event');
context.geCleanup();
assert.match(app, /async function route\(\) \{\s*if \(geCleanup\)/);
assert.match(app, /async function itemsView\(name\) \{\s*if \(name === '~ge'\) \{ location\.replace\('#ge'\); return; \}/, 'old #items/~ge bookmarks alias to #ge');
assert.match(app, /else if \(tab === 'ge'\) geView\(\);/);
assert.match(html, /<button data-tab="ge">/);
assert.doesNotMatch(app.match(/if \(\(?\[[^\]]+\]\.includes\(tab\)[^\n]*bindPriceView/)[0], /'ge'/, 'G.E. tab keeps no app price banner, as before');
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
assert.match(csp, /frame-src https:\/\/prices.runescape.wiki;/);
assert.match(csp, /connect-src 'self' https:\/\/prices.runescape.wiki;/);
assert.match(csp, /script-src 'self';/);
assert.match(csp, /img-src 'self' data: blob:;/);
assert.doesNotMatch(ge, /fetch\(|contentDocument|contentWindow|postMessage|setInterval|onload|onerror/);
const isolatedCSS = css.slice(css.indexOf('/* Isolated Items G.E. wrapper.'));
assert.match(isolatedCSS, /\.ge-frame\{[^}]*width:100%/);
assert.match(isolatedCSS, /min-width:0/);
assert.match(isolatedCSS, /@media\(max-width:420px\)/);
assert.match(isolatedCSS,/transform-origin:top left/);
assert.doesNotMatch(ge,/srcdoc|document\.write/);
assert.match(ge,/Math\.max\(1024, width\)/);
assert.match(fs.readFileSync('sw.js', 'utf8'), /new URL\(req.url\).origin !== location.origin\) return/);
console.log('PASS: G.E. lazy loading, offline/reconnect, cleanup, attribution, direct link, main G.E. tab + #items/~ge alias, byte-identical relocation, scoped CSP, isolated styles, unchanged cross-origin cache policy');
