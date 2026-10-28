'use strict';
/* EMBER RUNE COMMAND CENTER (black + red, RuneScape-styled): design layer (effects + microinteractions only, no data logic).
   Background FX are abstract (embers, sparks, drawn rune circles); all game content still comes from app.js / the wiki data. */
(() => {
  const D = document, H = D.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer:coarse)').matches;
  const LEVELS = ['high', 'low', 'off'], LBL = {high: 'High', low: 'Low', off: 'Off'};

  /* ---------- FX level toggle (saved on this device) ---------- */
  const fxBtn = D.getElementById('nx-fxbtn');
  function setFx(l, save) {
    H.dataset.fx = l; if (fxBtn) fxBtn.textContent = 'FX: ' + LBL[l];
    if (save) try { localStorage.setItem('dch-fx', l); } catch (e) {}
    FX.reset();
  }
  if (fxBtn) fxBtn.onclick = () => setFx(LEVELS[(LEVELS.indexOf(H.dataset.fx) + 1) % 3], true);

  /* ---------- background canvas: rising fire embers + sparks (abstract; no game art) ---------- */
  const FX = (() => {
    const cv = D.getElementById('nx-fx'); if (!cv) return {reset() {}};
    const cx = cv.getContext('2d', {alpha: true});
    let W = 0, Hh = 0, dpr = 1, parts = [], raf = 0, last = 0, mx = .5, my = .5;
    // ember palette: hot gold core -> orange -> crimson -> deep blood
    const COLS = ['255,176,0', '255,122,26', '255,72,40', '255,31,61', '200,16,46'];
    function size() {
      dpr = Math.min(H.dataset.fx === 'high' ? 1.5 : 1, devicePixelRatio || 1);
      W = innerWidth; Hh = innerHeight; cv.width = W * dpr | 0; cv.height = Hh * dpr | 0; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function ember(fresh) {
      const z = .3 + Math.random() * .7, spark = Math.random() < .14;
      return {x: Math.random() * W, y: fresh ? Hh + Math.random() * 40 : Math.random() * Hh, z, spark,
        vx: (Math.random() - .5) * .05, vy: -(.025 + Math.random() * .09) * (spark ? 2.6 : 1),
        c: COLS[spark ? Math.random() * 2 | 0 : Math.random() * COLS.length | 0], tw: Math.random() * 6.28, ph: Math.random() * 6.28,
        life: 0, max: 7000 + Math.random() * 9000};
    }
    function seed() {
      const hi = H.dataset.fx === 'high';
      const n = Math.round(Math.min(hi ? 120 : 40, (W * Hh) / (hi ? 9500 : 26000)));
      parts = Array.from({length: n}, () => ember(false));
    }
    function frame(t) {
      raf = requestAnimationFrame(frame);
      const lvl = H.dataset.fx, step = lvl === 'high' ? 15 : 32;   // ~60fps high, ~30fps low
      if (t - last < step) return; const dt = Math.min(50, t - last); last = t;
      cx.clearRect(0, 0, W, Hh);
      cx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.life += dt; p.tw += dt * .004; p.ph += dt * .0012;
        p.x += (p.vx + Math.sin(p.ph) * .03) * dt * p.z; p.y += p.vy * dt * p.z;
        if (p.y < -20 || p.life > p.max) { parts[i] = ember(true); continue; }
        if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
        const fade = Math.min(1, p.life / 900) * Math.min(1, (p.max - p.life) / 1500) * Math.min(1, p.y / (Hh * .25) + .15);
        const fl = .55 + .45 * Math.sin(p.tw * (p.spark ? 3 : 1)) ** 2;
        const a = fade * fl * (.35 + .55 * p.z), r = p.spark ? .7 + p.z : 1 + p.z * 1.7;
        const px = p.x + (mx - .5) * 24 * p.z, py = p.y + (my - .5) * 16 * p.z;
        if (p.spark) {   // short glowing streak
          cx.strokeStyle = `rgba(${p.c},${a})`; cx.lineWidth = r; cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px - p.vx * 90, py - p.vy * 90 * p.z); cx.stroke();
        } else {
          cx.fillStyle = `rgba(${p.c},${a * .22})`; cx.beginPath(); cx.arc(px, py, r * 3.6, 0, 6.283); cx.fill();
          cx.fillStyle = `rgba(${p.c},${a})`; cx.beginPath(); cx.arc(px, py, r * .75, 0, 6.283); cx.fill();
        }
      }
      cx.globalCompositeOperation = 'source-over';
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; }
    function reset() {
      stop(); size(); seed(); cx.clearRect(0, 0, W, Hh);
      if (H.dataset.fx === 'off' || D.hidden) return;
      if (reduce.matches) { last = -1e9; frame(performance.now()); stop(); return; } // one static frame
      raf = requestAnimationFrame(frame);
    }
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(reset, 200); });
    D.addEventListener('visibilitychange', () => D.hidden ? stop() : reset());
    if (!coarse) addEventListener('pointermove', e => { mx = e.clientX / W; my = e.clientY / Hh; }, {passive: true});
    reduce.addEventListener?.('change', reset);
    return {reset};
  })();
  setFx(H.dataset.fx || 'high', false);

  /* ---------- tab ink: liquid underline that flows to the active tab ---------- */
  const tabs = D.querySelector('.tabs'), ink = D.querySelector('.nx-ink');
  function moveInk() {
    const on = tabs && tabs.querySelector('button.on'); if (!on || !ink) return;
    ink.style.width = (on.offsetWidth - 28) + 'px'; ink.style.transform = `translate3d(${on.offsetLeft + 14}px,${on.offsetTop + on.offsetHeight + 1}px,0)`;
    if (tabs.scrollWidth > tabs.clientWidth) on.scrollIntoView({block: 'nearest', inline: 'center', behavior: 'smooth'});
  }
  if (tabs) new MutationObserver(moveInk).observe(tabs, {subtree: true, attributes: true, attributeFilter: ['class']});
  addEventListener('resize', moveInk); D.fonts?.ready.then(moveInk); setTimeout(moveInk, 60);

  /* ---------- magnetic buttons + card spotlight (pointer devices only) ---------- */
  if (!coarse) {
    let mag = null;
    D.addEventListener('pointermove', e => {
      const t = null; /* magnetic pull removed: hovering never moves a button or tile */
      if (mag && mag !== t) { mag.style.setProperty('--mx', '0px'); mag.style.setProperty('--my', '0px'); mag = null; }
      if (t && H.dataset.fx !== 'off') { const r = t.getBoundingClientRect();
        t.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * .18).toFixed(1) + 'px');
        t.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * .25).toFixed(1) + 'px'); mag = t; }
      const c = e.target.closest?.('.hit');
      if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--px', (e.clientX - r.left) + 'px'); c.style.setProperty('--py', (e.clientY - r.top) + 'px'); }
    }, {passive: true});
  }

  /* ---------- search power-up while typing ---------- */
  let tt;
  D.addEventListener('input', e => {
    const i = e.target; if (!(i instanceof HTMLInputElement) || i.type !== 'search') return;
    const row = i.parentElement; row.classList.remove('nx-typing'); void row.offsetWidth; row.classList.add('nx-typing');
    clearTimeout(tt); tt = setTimeout(() => row.classList.remove('nx-typing'), 650);
  }, true);

  /* ---------- view transitions: scan-line reveal of new panels + meta badges ---------- */
  const view = D.getElementById('view');
  const BADGE = [[/^Lvl\s/i, 'lv'], [/^Slayer\s/i, 'sl'], [/\bdrops?$/i, 'dr'], [/^✓/, 'ok'], [/^Members$/i, 'mem'], [/steps$/i, 'dr']];
  function badges(root) {
    root.querySelectorAll('a.hit .meta:not([data-nx])').forEach(m => {
      m.dataset.nx = '1';
      if (m.children.length) return;                       // already structured (items/map)
      const parts = m.textContent.split(' · ').map(s => s.trim()).filter(Boolean);
      if (parts.length < 1) return;
      m.textContent = '';
      for (const p of parts) { const s = D.createElement('span'); const k = BADGE.find(([re]) => re.test(p)); s.className = 'nx-b ' + (k ? k[1] : ''); s.textContent = p; m.appendChild(s); }
    });
  }
  function reveal() {
    let i = 0;
    for (const el of view.children) {
      if (el.dataset.nxr) continue; el.dataset.nxr = '1';
      el.classList.add('nx-in'); el.style.animationDelay = Math.min(i++ * 60, 360) + 'ms';
      if (el.classList.contains('panel')) el.style.setProperty('--scanh', Math.min(el.offsetHeight, 900) + 'px');
      el.addEventListener('animationend', () => { el.classList.remove('nx-in'); el.style.animationDelay = ''; }, {once: true});
    }
  }
  if (view) new MutationObserver(muts => {
    let top = false; for (const m of muts) if (m.target === view) top = true;
    if (top && H.dataset.fx !== 'off') reveal();
    badges(view);
  }).observe(view, {childList: true, subtree: true});

  /* ---------- fluid poison name: "Dev. Soy Yoda" ----------
     Letters are split into spans (text unchanged). A small canvas per name draws liquid drips that really form at the bottom edge of
     measured letters: a bead gathers (wobbling), sags into a neck, pinches off, falls with gravity (stretching into a teardrop) and
     splashes. The goo canvas is merged with an SVG gooey filter (blur + alpha threshold) so necks and beads fuse like real liquid;
     highlights go on a second, unfiltered canvas. One shared rAF loop; paused when off-screen, tab hidden, FX Off or reduced motion. */
  const PSN = (() => {
    const insts = new Set(), rm = matchMedia('(prefers-reduced-motion: reduce)');
    const R = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const eo = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
    let raf = 0, last = 0, acc = 0;
    const SLOW = Math.min(5, Math.max(0.05, +new URLSearchParams(location.search).get('psnslow') || 1));   // debug only: ?psnslow=0.1 plays the drips in slow motion
    const GOO = '#44e024';
    const live = () => !D.hidden && !rm.matches && H.dataset.fx !== 'off';

    function build(el) {
      const text = el.textContent; el.dataset.psn = '1'; el.textContent = '';
      const txt = D.createElement('span'); txt.className = 'psn-txt'; el.appendChild(txt);
      let n = 0;
      for (const ch of text) {
        if (ch === ' ') { txt.appendChild(D.createTextNode(' ')); continue; }
        const s = D.createElement('span'); s.className = 'psn-ch'; s.style.setProperty('--i', n++); s.textContent = ch; txt.appendChild(s);
      }
      const bl = D.createElement('i'); bl.className = 'psn-bl'; bl.setAttribute('aria-hidden', 'true'); txt.appendChild(bl);
      const cv = D.createElement('span'); cv.className = 'psn-cv'; cv.setAttribute('aria-hidden', 'true');
      const g = D.createElement('canvas'), f = D.createElement('canvas'); g.className = 'g'; f.className = 'f'; cv.append(g, f); el.appendChild(cv);
      const o = {el, txt, bl, cv, g, f, gx: g.getContext('2d'), fx: f.getContext('2d'), slots: [], hang: [], drops: [], splats: [], ripples: [], beads: [],
        W: 0, H: 0, s: 1, vis: true, spawnIn: R(.2, .7), queue: null, drawn: false};
      o.ro = new ResizeObserver(() => measure(o)); o.ro.observe(el);
      o.io = new IntersectionObserver(es => { o.vis = es[es.length - 1].isIntersecting; if (o.vis) { measure(o); kick(); } }, {rootMargin: '40px'}); o.io.observe(el);
      insts.add(o); measure(o);
    }
    function measure(o) {
      const el = o.el, r = el.getBoundingClientRect(); if (!r.width) return;
      const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize) || 12, s = o.s = clamp(fs / 12, .8, 1.5);
      const pad = Math.ceil(10 * s), base = o.bl.getBoundingClientRect().bottom - r.top;
      o.pad = pad; o.floor = base + 24 * s; o.W = Math.ceil(r.width + pad * 2); o.H = Math.ceil(o.floor + 12 * s);
      const up = cs.textTransform === 'uppercase';
      o.slots = [...o.txt.querySelectorAll('.psn-ch')].map((c, i) => {
        const b = c.getBoundingClientRect(), ch = c.textContent, desc = !up && /[gjpqy]/.test(ch);
        const w = Math.max(2, b.width - parseFloat(cs.letterSpacing || 0) || b.width);
        return {i, x: b.left - r.left + pad, w, y: base + (desc ? .2 * fs : 0) - .3 * s, busy: 0, cool: 0};
      }).filter(s0 => s0.w > 2);
      const dpr = Math.min(2, devicePixelRatio || 1); o.dpr = dpr;
      o.cv.style.left = -pad + 'px';
      for (const c of [o.g, o.f]) { c.style.width = o.W + 'px'; c.style.height = o.H + 'px'; c.width = Math.round(o.W * dpr); c.height = Math.round(o.H * dpr); }
      o.gx.setTransform(dpr, 0, 0, dpr, 0, 0); o.fx.setTransform(dpr, 0, 0, dpr, 0, 0);
      o.hang.length = o.drops.length = o.splats.length = o.ripples.length = o.beads.length = 0; o.slots.forEach(s0 => s0.busy = 0);
    }
    function maxActive(o) { const lo = H.dataset.fx === 'low', hdr = !!o.el.closest('.top'); return lo ? (hdr ? 2 : 1) : (hdr ? 5 : 3); }
    function spawn(o) {
      const lo = H.dataset.fx === 'low';
      let sl = null;
      if (o.queue && !o.queue.busy) { sl = o.queue; o.queue = null; }
      else { const free = o.slots.filter(s0 => !s0.busy && s0.cool <= 0); if (!free.length) return; sl = free[(Math.random() * free.length) | 0]; }
      const s = o.s, strand = !lo && Math.random() < .18;
      const rmax = (strand ? R(1.5, 2.0) : R(2.0, 3.0)) * s;
      sl.busy = 1;
      o.hang.push({sl, ax: sl.x + sl.w * R(.3, .62), ay: sl.y, u: 0, dur: (strand ? R(2.4, 3.4) : R(1.5, 2.8)) * (lo ? 1.35 : 1), rmax, L: (strand ? R(9, 13) : R(4.6, 7.8)) * s, ph: R(0, 6.3), strand});
    }
    function circle(c, x, y, r) { if (r > .05) { c.moveTo(x + r, y); c.arc(x, y, r, 0, 6.2832); } }
    function chain(c, x0, y0, r0, x1, y1, r1, prof) {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(len / 0.6));
      for (let k = 0; k <= n; k++) { const v = k / n; circle(c, x0 + (x1 - x0) * v, y0 + (y1 - y0) * v, prof ? prof(v) : r0 + (r1 - r0) * v); }
    }
    function step(o, dt) {
      const s = o.s, lo = H.dataset.fx === 'low', G = 640 * s;
      o.slots.forEach(s0 => { if (s0.cool > 0) s0.cool -= dt; });
      o.spawnIn -= dt;
      if (o.spawnIn <= 0) {
        if (o.hang.length < maxActive(o)) spawn(o);
        o.spawnIn = lo ? R(.9, 2.0) : R(.22, .8);
      }
      for (let i = o.hang.length - 1; i >= 0; i--) {
        const h = o.hang[i]; h.u += dt / h.dur;
        if (h.u >= 1) {                         // pinch-off: bead leaves as a falling drop, neck snaps back
          const r = h.cr, y = h.cy;
          o.drops.push({x: h.ax, y, r, vy: 30 * s, vx: R(-3, 3) * s, born: 0});
          if (!lo && Math.random() < .6) o.drops.push({x: h.ax + R(-.4, .4) * s, y: h.ay + h.L * .5, r: R(.8, 1.15) * s, vy: 12 * s, vx: 0, born: 0, sat: 1});
          o.beads.push({x: h.ax, y: h.ay, len: h.L * .62, r: h.nr, base: h.rmax * .75, t: 0});
          h.sl.busy = 0; h.sl.cool = R(.5, 1.6);
          if (!lo && Math.random() < .3) { o.queue = h.sl; h.sl.cool = 0; o.spawnIn = Math.min(o.spawnIn, .12); }
          o.hang.splice(i, 1);
        }
      }
      for (let i = o.beads.length - 1; i >= 0; i--) { o.beads[i].t += dt; if (o.beads[i].t > .34) o.beads.splice(i, 1); }
      for (let i = o.drops.length - 1; i >= 0; i--) {
        const d = o.drops[i]; d.born += dt; d.vy += G * dt; d.y += d.vy * dt; d.x += d.vx * dt;
        if (d.y >= o.floor - d.r * .4) {
          o.drops.splice(i, 1); if (d.sat) continue;
          o.splats.push({x: d.x, y: o.floor, r: d.r, t: 0});
          if (!lo) {
            o.ripples.push({x: d.x, y: o.floor, t: 0, r: d.r});
            const k = 2 + ((Math.random() * 2) | 0);
            for (let q = 0; q < k; q++) o.splats.push({sp: 1, x: d.x, y: o.floor - 1, vx: R(-34, 34) * s, vy: -R(45, 95) * s, r: R(.55, .9) * s, t: 0});
          }
        }
      }
      for (let i = o.splats.length - 1; i >= 0; i--) {
        const p = o.splats[i]; p.t += dt;
        if (p.sp) { p.vy += G * .8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > o.floor || p.t > .5) o.splats.splice(i, 1); }
        else if (p.t > .16) o.splats.splice(i, 1);
      }
      for (let i = o.ripples.length - 1; i >= 0; i--) { o.ripples[i].t += dt; if (o.ripples[i].t > .55) o.ripples.splice(i, 1); }
    }
    function draw(o) {
      const g = o.gx, f = o.fx, s = o.s, W = o.W, Hh = o.H;
      g.clearRect(0, 0, W, Hh); f.clearRect(0, 0, W, Hh);
      g.fillStyle = GOO; g.beginPath();
      const hl = [];    // bodies that get a glossy highlight
      for (const h of o.hang) {
        const u = h.u, gather = eo(u / .72), wob = 1 + .07 * Math.sin(u * h.dur * 8.5 + h.ph) * (1 - u * .55);
        const r = h.rmax * (.22 + .78 * gather) * wob;
        const L = h.L * Math.pow(u, 2.3), stretch = 1 + Math.max(0, u - .8) * (h.strand ? 4 : 2.6);
        const cy = h.ay + L + r * .55 * stretch, nr = h.rmax * (.72 - .6 * Math.pow(u, 2.2)) * (h.strand ? .8 : 1);
        h.cr = r * .92; h.cy = cy; h.nr = nr;
        const base = h.rmax * .75 * Math.min(1, u * 5 + .3);
        circle(g, h.ax, h.ay - .4 * s, base);
        chain(g, h.ax, h.ay, 0, h.ax, cy, 0, v => nr + (base - nr) * Math.pow(1 - v, 2.2) + (v > .72 ? (r * .8 - nr) * Math.pow((v - .72) / .28, 2) : 0));
        // bead (elongating to a teardrop just before it pinches)
        g.moveTo(h.ax + r, cy); g.ellipse(h.ax, cy, r / Math.sqrt(stretch), r * stretch, 0, 0, 6.2832);
        hl.push([h.ax, cy, r, stretch, 1]);
      }
      for (const b of o.beads) {      // recoil of the snapped neck
        const k = eo(b.t / .3), a = 1 - k;
        circle(g, b.x, b.y - .4 * s, b.base * (1 - .5 * k) * (1 + .12 * Math.sin(b.t * 60) * a));
        chain(g, b.x, b.y, 0, b.x, b.y + b.len * a, 0, v => b.r * (1 - v * .8) * (1 - k * .6));
      }
      for (const d of o.drops) {
        const st = clamp(d.vy / (430 * s), 0, .95), sy = 1 + st * .95, sx = 1 / Math.sqrt(sy), r = d.r * (d.sat ? 1.15 : 1);
        g.moveTo(d.x + r * sx, d.y); g.ellipse(d.x, d.y, r * sx, r * sy, 0, 0, 6.2832);
        const tail = Math.min(5, Math.round(st * 6));   // pointed top of a falling teardrop
        for (let k = 1; k <= tail; k++) circle(g, d.x, d.y - r * sy * (.55 + k * .5), r * sx * (1 - k * .17));
        hl.push([d.x, d.y, r, sy, 0]);
      }
      for (const p of o.splats) {
        if (p.sp) { circle(g, p.x, p.y, p.r * 1.25); continue; }
        const k = p.t / .16, rx = p.r * (1.3 + 2.2 * k) * (1 - .25 * k), ry = p.r * .75 * (1 - k) + .2;
        g.moveTo(p.x + rx, p.y); g.ellipse(p.x, p.y - ry * .6, rx, ry, 0, 0, 6.2832);
      }
      g.fill();
      // unfiltered layer: glossy shading, ripples
      for (const [x, y, r, sy, hang] of hl) {
        const rr = r * Math.max(1, sy * .85), gr = f.createRadialGradient(x - r * .32, y - rr * .3, 0, x, y, rr * 1.02);
        gr.addColorStop(0, 'rgba(240,255,225,.95)'); gr.addColorStop(.2, 'rgba(160,255,110,.4)'); gr.addColorStop(.6, 'rgba(60,200,30,0)'); gr.addColorStop(1, 'rgba(8,80,6,.5)');
        f.fillStyle = gr; f.beginPath(); f.ellipse(x, y, r / Math.sqrt(sy), rr, 0, 0, 6.2832); f.fill();
        f.fillStyle = 'rgba(255,255,255,.9)'; f.beginPath(); f.ellipse(x - r * .3, y - rr * .38, Math.max(.4, r * .2), Math.max(.5, r * .34), -.5, 0, 6.2832); f.fill();
      }
      for (const p of o.splats) if (p.sp) { f.fillStyle = 'rgba(225,255,205,.85)'; f.beginPath(); f.arc(p.x - p.r * .25, p.y - p.r * .25, p.r * .4, 0, 6.2832); f.fill(); }
      f.lineWidth = Math.max(.7, .8 * s);
      for (const rp of o.ripples) {
        const k = rp.t / .55, e = eo(k), rx = (2 + 7 * e) * s, a = (1 - k) * .75;
        f.strokeStyle = 'rgba(150,255,105,' + a.toFixed(3) + ')'; f.beginPath(); f.ellipse(rp.x, rp.y, rx, rx * .26, 0, 0, 6.2832); f.stroke();
        if (k > .18) { const rx2 = rx * .55; f.strokeStyle = 'rgba(210,255,190,' + (a * .6).toFixed(3) + ')'; f.beginPath(); f.ellipse(rp.x, rp.y, rx2, rx2 * .26, 0, 0, 6.2832); f.stroke(); }
      }
      o.drawn = true;
    }
    function clear(o) { if (o.drawn) { o.gx.clearRect(0, 0, o.W, o.H); o.fx.clearRect(0, 0, o.W, o.H); o.drawn = false; } o.hang.length = o.drops.length = o.splats.length = o.ripples.length = o.beads.length = 0; o.slots.forEach(s0 => s0.busy = 0); }
    function frame(ts) {
      raf = 0; if (!live()) { insts.forEach(clear); return; }
      const lo = H.dataset.fx === 'low', dt0 = Math.min(.1, (ts - last) / 1000); acc += dt0; last = ts;
      if (lo && acc < .033) { raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(.05, acc) * SLOW; acc = 0; let any = false;
      for (const o of [...insts]) {
        if (!o.el.isConnected) { o.ro.disconnect(); o.io.disconnect(); insts.delete(o); continue; }
        if (!o.vis || !o.W) continue; any = true; step(o, dt); draw(o);
      }
      if (any) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && live() && insts.size) { last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); } else if (!live()) insts.forEach(clear); }
    function scan(root) { (root || D).querySelectorAll('.nx-poison:not([data-psn])').forEach(build); kick(); }
    D.addEventListener('visibilitychange', kick);
    rm.addEventListener && rm.addEventListener('change', kick);
    new MutationObserver(() => { insts.forEach(o => { if (H.dataset.fx === 'off') clear(o); else o.spawnIn = Math.min(o.spawnIn, .3); }); kick(); }).observe(H, {attributes: true, attributeFilter: ['data-fx']});
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(() => insts.forEach(measure));
    addEventListener('load', () => insts.forEach(measure));
    return {scan};
  })();
  PSN.scan();
  new MutationObserver(() => PSN.scan(view)).observe(view, {childList: true});

  /* ---------- header clock ---------- */
  const clk = D.getElementById('nx-clock');
  const tick = () => { if (clk && !D.hidden) clk.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}); };
  tick(); setInterval(tick, 15000);

  /* ---------- Windows program: frameless glass title bar (v1.3 launcher exposes window.dchWin) ---------- */
  function initFrame() {
    if (typeof window.dchWin !== 'function') return false;
    const tb = D.getElementById('nx-titlebar'); if (!tb) return true;
    // handshake: the launcher (v1.3+) drops its native frame only when the page asks, so an older page never ends up frameless
    Promise.resolve(window.dchWin('frameless')).then(ok => {
      if (!ok) return;
      tb.hidden = false; H.classList.add('nx-frameless');
      // invisible resize edges (the native border is gone)
      ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(e => {
        const d = D.createElement('div'); d.className = 'nx-rz nx-rz-' + e;
        d.addEventListener('mousedown', ev => { if (ev.button === 0) { ev.preventDefault(); window.dchWin('rz:' + e); } });
        D.body.appendChild(d);
      });
    }).catch(() => {});
    tb.querySelectorAll('[data-w]').forEach(b => b.onclick = () => window.dchWin(b.dataset.w));
    const drag = D.getElementById('nx-drag');
    drag.addEventListener('mousedown', e => { if (e.button === 0) { e.preventDefault(); window.dchWin(e.detail === 2 ? 'max' : 'drag'); } });
    return true;
  }
  if (!initFrame()) { let n = 0; const iv = setInterval(() => { if (initFrame() || ++n > 20) clearInterval(iv); }, 150); }
})();
