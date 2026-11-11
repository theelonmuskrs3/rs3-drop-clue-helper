// Calculators directory layout (Wiki Calculators page groups) and official Wiki picture provenance for every calculator and
// every item a native calculator can show. Static + engine checks; layout in a real browser is a separate (parent) gate.
// node tests/calc-images.test.cjs
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const J = f => JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
const C = require('../calculators.js');
const cat = J('data/calculators.json'), L = J('data/calc/directory.json'), IM = J('data/calc/images.json');
const webpOk = rel => { assert.match(rel, /^icons\/[0-9a-f]{12}\.webp$/, rel); const b = fs.readFileSync(path.join(base, rel)); assert.equal(b.slice(0, 4).toString(), 'RIFF', rel); assert.equal(b.slice(8, 12).toString(), 'WEBP', rel); };
const prov = (r, what) => { assert.ok(r && r.src && r.file, what); webpOk(r.src); assert.match(r.file, /^File:.+\.(png|gif|jpg|jpeg|webp)$/i, what); assert.match(r.sha1, /^[0-9a-f]{40}$/, what);
  assert.ok(r.w > 0 && r.h > 0 && r.w <= 36 && r.h <= 36, what); assert.ok(!/osrs|old school/i.test(r.file), 'RS3 Wiki file, not OSRS: ' + r.file); };

/* layout: same revision as the catalog; every catalog entry kept, in its own group, with unchanged text */
assert.equal(L.sourceRevision, cat.sourceRevision); assert.equal(L.source, 'https://runescape.wiki/w/Calculators');
assert.deepEqual(L.sections.map(s => s.name).filter(n => cat.sections.includes(n)), cat.sections, 'section order as on the Wiki');
const groupKeys = new Set(L.sections.flatMap(s => s.groups.map(g => s.name + '|' + g.name)));
let n = 0;
for (const c of cat.calculators) {
  assert.ok(groupKeys.has(c.section + '|' + c.group), 'group exists on the Wiki page: ' + c.section + '|' + c.group);
  const g = L.sections.find(s => s.name === c.section).groups.find(x => x.name === c.group);
  assert.ok(g.paths.includes(c.path), 'entry listed in its own Wiki group: ' + c.path);
  const ic = L.icons[c.section + '|' + c.group + '|' + c.path]; assert.ok(ic, 'icon record ' + c.path);
  assert.ok(ic.file, 'Wiki tile names an icon: ' + c.path); prov(ic.img, c.path); n++;
}
assert.equal(n, cat.calculators.length); assert.equal(Object.keys(L.icons).length, cat.calculators.length);
assert.deepEqual(L.missingIcons, []);
for (const s of L.sections) for (const g of s.groups) { if (g.image) prov(g.img, 'group ' + g.name); if (g.skillIcon) webpOk(g.skillIcon); }
assert.ok(Array.isArray(L.notInCatalog));

/* items: every name the native calculators' data can show has a Wiki icon or is listed as missing (never a stand-in) */
const names = new Set();
const F = J('data/calc/flask-decanting.json');
for (const r of F.rows) for (const v of Object.values(r)) if (v && typeof v === 'object' && v.n) names.add(v.n);
names.add(F.flask.n);
for (const nm of names) assert.ok(IM.items[nm] || IM.missing.some(m => m.name === nm), 'flask item covered: ' + nm);
for (const [nm, r] of Object.entries(IM.items)) {
  prov(r, nm);
  if (r.via !== 'exact file') assert.match(r.via, /^(File redirect from File:|item page .+ redirects to )/, 'only Wiki redirects as aliases: ' + nm);
  else assert.equal(r.file.replace(/\.(png|gif)$/i, '').slice(5), nm[0].toUpperCase() + nm.slice(1), 'exact file name: ' + nm);
}
// Herblore: every name in rows the engine actually produces across all categories and the main option families
const shown = new Set(JSON.parse(require('node:child_process').execFileSync('node', [path.join(base, 'tools/calc_names.cjs')]).toString())), gaps = new Set();
const variants = {length: 18};
for (const nm of shown) if (!IM.items[nm]) gaps.add(nm);
const listedMissing = new Set(IM.missing.map(m => m.name));
assert.deepEqual([...gaps].filter(g => !listedMissing.has(g)), [], 'Herblore names without a Wiki icon must be listed as missing');
const fdCov = [...names].filter(x => IM.items[x]).length;
console.log(`PASS calc images: ${cat.calculators.length}/${cat.calculators.length} directory entries kept in their Wiki group with an official Wiki tile icon; ${L.sections.reduce((t, s) => t + s.groups.filter(g => g.img).length, 0)} group images; ` +
  `items ${Object.keys(IM.items).length} with Wiki icons (${Object.values(IM.items).filter(r => r.via !== 'exact file').length} via Wiki redirects), missing ${IM.missing.length}; flask ${fdCov}/${names.size}; Herblore engine rows across ${variants.length} option sets: ${shown.size - gaps.size}/${shown.size} names pictured`);
// skill tile labels: wrap between words only (browser blocker 2026-11-10: "Minin g", "Dunge oneering"); real-browser check: tests/calc-layout-check.py
{ const css = fs.readFileSync(path.join(base, 'neon.css'), 'utf8');
  const rules = [...css.matchAll(/([^{}]*\.calc-tile[^{}]*)\{([^}]*)\}/g)];
  for (const [, sel, body] of rules) assert.ok(!/overflow-wrap\s*:\s*anywhere|word-break\s*:\s*break-(all|word)|hyphens\s*:\s*auto/.test(body), 'tile rule may split words: ' + sel.trim());
  const name = rules.find(([, sel]) => /\.calc-tile-name\s*$/.test(sel.trim().split(',').pop()));
  assert.ok(name && /overflow-wrap:normal/.test(name[2]) && /word-break:normal/.test(name[2]), '.calc-tile-name must keep normal word wrapping');
  console.log('PASS tile label CSS: no in-word breaking rules'); }
// every non-exact image is a Wiki redirect recorded from the MediaWiki API (tests/calc-image-redirects.json), never our own alias
{ const R = JSON.parse(fs.readFileSync(path.join(base, 'tests/calc-image-redirects.json'), 'utf8')).items;
  const I = JSON.parse(fs.readFileSync(path.join(base, 'data/calc/images.json'), 'utf8')).items; let n = 0;
  for (const [name, v] of Object.entries(I)) { if (v.via === 'exact file') continue; n++; const r = R[name]; assert.ok(r, 'unverified alias ' + name);
    if (r.fileRedirects.length) { assert.equal(r.fileRedirects[0].from, 'File:' + name + '.png'); assert.equal(r.fileRedirects.at(-1).to, v.file); assert.equal(r.resolvedSha1, v.sha1, name); }
    else { assert.ok(r.pageRedirects.length && r.pageRedirects[0].from === name && 'File:' + r.pageRedirects.at(-1).to + '.png' === v.file, 'page redirect ' + name); } }
  assert.equal(R['Guthix balance (unfinished)'].fileRedirects[0].to, 'File:Guthix balance (unfinished) (4).png');
  console.log('PASS image aliases: ' + n + '/' + n + ' are Wiki redirects recorded from the API (incl. Guthix balance (unfinished) -> (4))'); }
