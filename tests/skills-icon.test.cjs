// pt349u: no diamond before the header credits; the Skills heading uses the official OSRS Stats tab icon instead of the diamond.
const assert = require('assert'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const base = path.resolve(__dirname, '..'), css = fs.readFileSync(path.join(base, 'neon.css'), 'utf8'), html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
assert.doesNotMatch(css, /\.top \.sub::before/, 'credits diamond removed');
assert.match(html, /<div class="sub">Made by <span class="nx-poison" data-text="Dev\. Soy Yoda">Dev\. Soy Yoda<\/span><\/div>/, 'credits text unchanged');
assert.match(css, /\.top \.sub\{font:700 11\.5px\/1\.4 var\(--head\)/, 'credits style unchanged');
assert.match(css, /\.panel>h2:first-child::before\{content:"";width:9px;height:9px;transform:rotate\(45deg\)/, 'other section diamonds unchanged');
const rule = css.match(/\.chsk>h2:first-child::before\{[^}]*\}/);
assert.ok(rule && /url\(brand\/osrs-stats-icon\.png\)/.test(rule[0]) && /transform:none/.test(rule[0]) && /image-rendering:pixelated/.test(rule[0]) && /width:25px;height:23px/.test(rule[0]), 'Skills heading uses the Stats icon at its native 25x23');
assert.ok(css.indexOf(rule[0]) > css.indexOf('.panel>h2:first-child::before{'), 'Skills rule overrides the generic diamond');
const png = fs.readFileSync(path.join(base, 'brand/osrs-stats-icon.png'));
assert.equal(crypto.createHash('sha256').update(png).digest('hex'), '68be48eab3e6ad81640fa36de873007a58f741ddc346b9906235931acc9b1fd2', 'exact OSRS Wiki File:Stats icon.png bytes');
assert.equal(png.readUInt32BE(16), 25); assert.equal(png.readUInt32BE(20), 23);
console.log('PASS skills icon: credits diamond removed, Skills heading = official OSRS Stats icon (25x23, pixel-crisp), other diamonds and credits unchanged');
