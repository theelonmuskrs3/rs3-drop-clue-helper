// Character tab header shows the Wise Old Man picture (custom illustration) in the old dagger slot; title bar / splash keep the dagger.
// node tests/char-header.test.cjs
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..'), rd = f => fs.readFileSync(path.join(base, f), 'utf8');
const app = rd('app.js'), html = rd('index.html'), css = rd('neon.css');
const img = fs.readFileSync(path.join(base, 'brand/wise-old-man.webp'));
assert.equal(img.toString('ascii', 0, 4), 'RIFF'); assert.equal(img.toString('ascii', 8, 12), 'WEBP'); assert.ok(img.length < 64e3, 'small picture');
const hero = app.slice(app.indexOf('<section class="panel chhero">'), app.indexOf('</section>', app.indexOf('<section class="panel chhero">')));
assert.match(hero, /<img class="chwom" src="brand\/wise-old-man\.webp" width="256" height="256" alt="Wise Old Man in a red partyhat and red cape with gold teeth, a gold Cuban link chain and a gold ring \(custom illustration, not an official Jagex render\)"/);
assert.ok(!hero.includes('brand/dds.webp'), 'Character header no longer uses the dagger');
assert.equal((html.match(/brand\/dds\.webp/g) || []).length, 2, 'title bar + splash keep the dagger');
assert.ok(!/class="chdds" aria-hidden/.test(app), 'picture is not hidden from screen readers');
assert.match(css, /\.chdds img\.chwom\{width:54px;height:54px;object-fit:contain\}/); assert.match(css, /@media \(max-width:699px\)\{\.chdds img\.chwom\{width:44px;height:44px\}\}/);
assert.match(css, /\.chdds\{position:relative;flex:none;width:58px;height:54px;/, 'header slot size unchanged');
console.log('PASS Character header: Wise Old Man picture (alt, scoped size), dagger kept in title bar and splash');
