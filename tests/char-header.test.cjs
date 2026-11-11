// Character tab header shows the Wise Old Man picture (custom illustration) in the old dagger slot; title bar / splash keep the dagger.
// node tests/char-header.test.cjs
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..'), rd = f => fs.readFileSync(path.join(base, f), 'utf8');
const app = rd('app.js'), html = rd('index.html'), css = rd('neon.css');
const img = fs.readFileSync(path.join(base, 'brand/wise-old-man-portrait.webp'));
assert.equal(img.toString('ascii', 0, 4), 'RIFF'); assert.equal(img.toString('ascii', 8, 12), 'WEBP'); assert.ok(img.length < 64e3, 'small picture');
const hero = app.slice(app.indexOf('<section class="panel chhero">'), app.indexOf('</section>', app.indexOf('<section class="panel chhero">')));
assert.ok(hero.includes('<img class="chwom" src="brand/wise-old-man-portrait.webp" width="305" height="512" alt="Wise Old Man with a white beard, round dark goggles and gold teeth, in a red partyhat and a red cape over a green robe, wearing a gold Cuban link chain and a gold ring, holding a poisoned Dragon dagger pointing down (custom illustration chosen by the user, not an official Jagex render)"'), 'user-chosen portrait, faithful alt');
assert.ok(!hero.includes('brand/dds.webp'), 'Character header no longer uses the dagger');
assert.equal((html.match(/brand\/dds\.webp/g) || []).length, 2, 'title bar + splash keep the dagger');
assert.ok(!/class="chdds" aria-hidden/.test(app), 'picture is not hidden from screen readers');
// PR #20 (t339u): portrait gets a tall column beside title + cards + privacy note; whole figure (contain, never cropped); compact cards
assert.match(css, /\.chhero\{display:grid;grid-template-columns:auto minmax\(0,1fr\);/); assert.match(css, /\.chhero \.chhead\{display:contents\}/);
assert.match(css, /\.chhero \.chdds\{grid-column:1;grid-row:1\/span 3;align-self:center;width:92px;height:154px\}/);
assert.match(css, /\.chdds img\.chwom\{width:100%;height:100%;object-fit:contain;/);
assert.match(css, /\.chhero \.chdds\{grid-row:1\/span 2;width:70px;height:118px\}/); assert.match(css, /@media \(max-width:359px\)\{\.chhero \.chdds\{width:60px;height:101px\}/);
for (const [w, h] of [[92, 154], [70, 118], [60, 101]]) { const fw = Math.min(w, h * 305 / 512), fh = fw * 512 / 305; assert.ok(fh <= h + .5 && fw <= w + .5 && fh > 2.5 * 54 * (w / 92) * .6, `portrait fits ${w}x${h} uncropped`); }
assert.match(css, /\.chhero \.chn\{padding:5px 4px 5px;/); assert.match(css, /\.chhero \.chv\{font-size:21px\}\.chhero \.chn\.tot \.chv,\.chhero \.chn\.cmb \.chv\{font-size:25px\}/);
assert.match(css, /\.chdds\{position:relative;flex:none;width:58px;height:54px;/, 'base slot rule kept (overridden inside .chhero only)');
console.log('PASS Character header: chosen portrait (alt), tall uncropped column, compact cards, dagger kept in title bar and splash');
