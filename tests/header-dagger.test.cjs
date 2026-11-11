// Main header dagger: HD copy of the Wiki's own picture, poison beads anchored on the blade inside the swaying rig, seamless staggered
// loop (bead + falling drop), gravity fall, Low/Off/reduced-motion respected, fits the current header box.
// node tests/header-dagger.test.cjs   (pixel anchor check: python3 tests/header_dagger_anchor_check.py)
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..'), css = fs.readFileSync(path.join(base, 'neon.css'), 'utf8'), html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const img = fs.readFileSync(path.join(base, 'brand/dds.webp')); assert.equal(img.toString('ascii', 8, 12), 'WEBP'); assert.ok(img.length < 40e3);
// markup: picture + 4 drips all inside the rig (so they move with the dagger)
const rig = html.match(/<span class="dds-rig">([\s\S]*?)<\/span><\/span>\s*<span class="dds-pool">/); assert.ok(rig, 'rig wraps picture and drips');
assert.match(rig[1], /<img class="dds-img" src="brand\/dds\.webp" width="320" height="288"/);
assert.equal((rig[1].match(/class="dds-drip d\d/g) || []).length, 4);
assert.equal((html.match(/brand\/dds\.webp/g) || []).length, 2, 'title bar + header');
assert.match(css, /\.nx-dds \.dds-rig\{position:absolute;inset:0;[^}]*animation:ddsSway/); assert.doesNotMatch(css, /\.nx-dds \.dds-img\{[^}]*animation/, 'sway on the rig, not the picture alone');
// fits the current header box: picture letterboxing < 1px at both sizes, so % anchors land on the blade
for (const [w, h] of [[72, 65], [46, 42]]) { const r = 320 / 288, fw = Math.min(w, h * r), fh = fw / r; assert.ok(Math.abs(w - fw) / 2 < 1 && Math.abs(h - fh) / 2 < 1, `letterbox ${w}x${h}`); }
assert.match(css, /\.nx-dds\{position:relative;flex:none;width:72px;height:65px;/); assert.match(css, /@media \(max-width:760px\)\{\.nx-dds\{width:46px;height:42px\}/);
// keyframes
const kf = n => { const m = css.match(new RegExp('@keyframes ' + n + '\\{([\\s\\S]*?)\\}\\}')); assert.ok(m, n); const o = {};
  for (const [, ks, body] of (m[1] + '}').matchAll(/([\d.,%]+)\{([^}]*)\}/g)) for (const k of ks.split(',')) o[parseFloat(k)] = body; return o; };
const bead = kf('ddsBead'), fall = kf('ddsFall');
assert.equal(bead[0], bead[100], 'bead loop: end state = start state');
for (const k of [0, 55.9, 100]) assert.match(fall[k], /opacity:0/, 'drop invisible at ' + k + '% (no visible reset)');
for (const k of [56, 62, 66]) assert.match(fall[k], /opacity:1/, 'drop grows out of the bead before the break');
assert.match(bead[64], /scale\(\.55,1\.6\)/, 'neck: thinnest and longest just before detaching'); assert.match(bead[67], /scale\(\.4,\.38\)/, 'snaps back as the drop leaves');
// gravity: distance per equal time step grows (accelerating), from the bead down to --fall
const ys = [[72, .03], [80, .17], [88, .42], [96, .78]]; for (const [k, f] of ys) assert.match(fall[k], new RegExp('translateY\\(calc\\(5px \\+ \\(var\\(--fall\\) - 5px\\) \\* ' + String(f).replace('0.', '\\.') + '\\)\\)'));
assert.match(fall[66], /translateY\(5px\)/, 'fall measured from the break point');
const v = [[66, .0], ...ys, [100, 1]]; for (let i = 2; i < v.length; i++) { const a = (v[i - 1][1] - v[i - 2][1]) / (v[i - 1][0] - v[i - 2][0]), b = (v[i][1] - v[i - 1][1]) / (v[i][0] - v[i - 1][0]); assert.ok(b > a, 'accelerating at ' + v[i][0]); }
for (const [k, f] of ys) assert.ok(Math.abs(f - ((k - 66) / 34) ** 2) < .01, 'free fall y = t² at ' + k);
// stagger: unequal durations, negative delays (already mid-cycle on load), not in lockstep
const ds = ['d1', 'd2', 'd3', 'd4'].map(d => css.match(new RegExp('\\.nx-dds \\.' + d + '\\{[^}]*--dur:([\\d.]+)s;--del:(-[\\d.]+)s')));
assert.ok(ds.every(Boolean), 'each drip has its own duration and a negative delay');
const dur = ds.map(m => +m[1]), del = ds.map(m => +m[2]); assert.equal(new Set(dur).size, 4);
const ph = dur.map((t, i) => ((-del[i] % t) / t)); for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(Math.abs(ph[i] - ph[j]) > .08, 'start phases differ');
assert.match(css, /\.nx-dds \.dds-drip\.bead::after\{display:none\}/, 'tip bead only beads');
// Off and reduced motion: still picture, static beads, no falling drops; Low: two slower drips
assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.nx-dds \.dds-drip::after,\.nx-dds \.dds-pool\{display:none\}\.nx-dds \.dds-rig,\.nx-dds \.dds-glow,\.nx-dds \.dds-drip::before\{animation:none!important\}/);
assert.match(css, /html\[data-fx=off\] \.nx-dds \.dds-drip::after,html\[data-fx=off\] \.nx-dds \.dds-pool\{display:none\}/);
assert.match(css, /html\[data-fx=low\] \.nx-dds \.d3,html\[data-fx=low\] \.nx-dds \.d4\{display:none\}/); assert.match(css, /html\[data-fx=low\] \.nx-dds \.dds-rig\{animation:none\}/);
assert.doesNotMatch(css, /ddsDrip/);
console.log('PASS header dagger: HD Wiki picture, 4 drips in the rig, seamless bead/drop loop, gravity fall, staggered negative phases', ph.map(p => p.toFixed(2)).join('/'), ', Low/Off/reduced motion, fits 72x65 and 46x42');
// --- non-GUI gaps (CSS cascade/geometry only; NOT a visual check) ---
{ // reduced motion: the media block comes after every other dagger rule, and nothing later turns the drop, the sway or the bead animation back on
  const i = css.indexOf('@media (prefers-reduced-motion:reduce){.nx-dds .dds-drip::after'); assert.ok(i > 0);
  const later = css.slice(i + 1); assert.doesNotMatch(later, /\.nx-dds[^{]*\{[^}]*(animation(-name)?:\s*dds|display:\s*block)/, 'nothing after the reduced-motion block re-enables dagger motion');
  for (const m of css.matchAll(/\.nx-dds \.dds-drip::after[^{]*\{([^}]*)\}/g)) assert.doesNotMatch(m[1], /display:[^;]*!important/, 'no !important display on the drop');
  assert.ok((css.match(/\.nx-dds \.dds-drip::before\{animation:none!important\}/g) || []).length >= 2, 'Off and reduced motion both use !important stops');
}
{ // neck -> detach geometry (px, transform-origin top, both shapes width bw and height 1.15*bw, top -1px), interpolated between keyframes
  const sc = s => s.match(/scale\(([\d.]+),([\d.]+)\)/).slice(1).map(Number), ty = s => +((s.match(/translateY\(([\d.]+)px\)/) || [0, NaN])[1]);
  const lerp = (o, a, b, t, f) => a === b ? f(o[a]) : f(o[a]) + (f(o[b]) - f(o[a])) * (t - a) / (b - a);
  for (const bw of [4, 3.4, 2.9, 2.8]) {   // desktop d1, phone d1/d2, phone d3/d4, desktop d4
    const h = bw * 1.15, beadBot = (k, a, b) => -1 + h * lerp(bead, a, b, k, x => sc(x)[1]), dropTop = (k, a, b) => -1 + lerp(fall, a, b, k, ty);
    assert.ok(dropTop(62, 62, 66) < beadBot(62, 58, 64) && dropTop(64, 62, 66) < beadBot(64, 64, 64), `bw ${bw}: bead and drop joined (hourglass) at 62-64%`);
    const gap = (-1 + ty(fall[66]) + 0) - beadBot(67, 67, 67); assert.ok(gap >= 3, `bw ${bw}: >=3px clear gap right after the break (${gap.toFixed(1)}px)`);
    const bulb = bw * sc(fall[62])[0], neck = bw * sc(bead[64])[0]; assert.ok(bulb > neck * 1.4, `bw ${bw}: drop bulb wider than the neck`);
    console.log(`bw ${bw}px: neck ${neck.toFixed(2)}px, drop bulb ${bulb.toFixed(2)}px, gap after break ${gap.toFixed(1)}px`);
  }
  assert.ok(sc(bead[67])[1] < .5, 'bead snaps back after the break');
  assert.match(css, /@media \(max-width:760px\)\{\.nx-dds\{width:46px;height:42px\}\.nx-dds \.dds-drip\{--fall:20px;--bw:3\.4px\}\.nx-dds \.d3,\.nx-dds \.d4\{--bw:2\.9px\}\}/, 'phone drips a bit bigger so the pinch can be seen');
}
assert.match(css, /\.nx-dds \.dds-pool\{[^}]*animation:ddsPool 3\.3s/, 'pool pulses with the d1 drop (3.3s)');
console.log('PASS header dagger non-GUI gaps: reduced-motion cascade, hourglass neck + clear detach gap at desktop and phone sizes, pool timing (CSS only, not a visual check)');
