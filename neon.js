'use strict';
/* NEON HOLOGRAPHIC COMMAND CENTER: design layer (effects + microinteractions only, no data logic).
   Background FX are abstract (particles, grid, geometry); all game content still comes from app.js / the wiki data. */
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

  /* ---------- background canvas: particles + floating holo geometry ---------- */
  const FX = (() => {
    const cv = D.getElementById('nx-fx'); if (!cv) return {reset() {}};
    const cx = cv.getContext('2d', {alpha: true});
    let W = 0, Hh = 0, dpr = 1, parts = [], geos = [], raf = 0, last = 0, mx = .5, my = .5;
    const COLS = ['0,246,255', '168,85,255', '61,203,255', '255,46,154', '127,91,255'];
    function size() {
      dpr = Math.min(H.dataset.fx === 'high' ? 1.5 : 1, devicePixelRatio || 1);
      W = innerWidth; Hh = innerHeight; cv.width = W * dpr | 0; cv.height = Hh * dpr | 0; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function seed() {
      const hi = H.dataset.fx === 'high';
      const n = Math.round(Math.min(hi ? 90 : 34, (W * Hh) / (hi ? 14000 : 30000)));
      parts = Array.from({length: n}, () => ({x: Math.random() * W, y: Math.random() * Hh, z: .3 + Math.random() * .7,
        vx: (Math.random() - .5) * .12, vy: -.04 - Math.random() * .16, c: COLS[Math.random() * 3 | 0], tw: Math.random() * 6.28}));
      geos = hi ? [mk(6, .78, .22, 120), mk(3, .14, .72, 90), mk(4, .9, .78, 60)] : [mk(6, .82, .25, 100)];
    }
    // simple wireframe polyhedra: n-gon prism / bipyramid projected in 2D
    function mk(n, fx, fy, r) {
      const pts = [];
      for (let i = 0; i < n; i++) { const a = i / n * 6.283; pts.push([Math.cos(a), Math.sin(a), 0]); }
      pts.push([0, 0, 1.15], [0, 0, -1.15]);
      return {n, pts, fx, fy, r, a: Math.random() * 6, b: Math.random() * 6, s: (Math.random() * .5 + .5) * (Math.random() < .5 ? -1 : 1)};
    }
    function drawGeo(g, t) {
      const ca = Math.cos(g.a), sa = Math.sin(g.a), cb = Math.cos(g.b), sb = Math.sin(g.b);
      const ox = g.fx * W + (mx - .5) * 30, oy = g.fy * Hh + Math.sin(t / 3000 + g.r) * 14 + (my - .5) * 20;
      const P = g.pts.map(([x, y, z]) => { const x1 = x * ca - z * sa, z1 = x * sa + z * ca, y1 = y * cb - z1 * sb, z2 = y * sb + z1 * cb;
        const k = 1 / (2.6 - z2); return [ox + x1 * g.r * k * 2, oy + y1 * g.r * k * 2, z2]; });
      cx.lineWidth = 1;
      const grd = cx.createLinearGradient(ox - g.r, oy - g.r, ox + g.r, oy + g.r);
      grd.addColorStop(0, 'rgba(0,246,255,.30)'); grd.addColorStop(1, 'rgba(168,85,255,.22)');
      cx.strokeStyle = grd; cx.beginPath();
      for (let i = 0; i < g.n; i++) { const p = P[i], q = P[(i + 1) % g.n]; cx.moveTo(p[0], p[1]); cx.lineTo(q[0], q[1]);
        cx.moveTo(p[0], p[1]); cx.lineTo(P[g.n][0], P[g.n][1]); cx.moveTo(p[0], p[1]); cx.lineTo(P[g.n + 1][0], P[g.n + 1][1]); }
      cx.stroke();
      cx.fillStyle = 'rgba(0,246,255,.55)';
      for (const p of P) { cx.beginPath(); cx.arc(p[0], p[1], 1.4, 0, 6.283); cx.fill(); }
    }
    function frame(t) {
      raf = requestAnimationFrame(frame);
      const lvl = H.dataset.fx, step = lvl === 'high' ? 15 : 32;   // ~60fps high, ~30fps low
      if (t - last < step) return; const dt = Math.min(50, t - last); last = t;
      cx.clearRect(0, 0, W, Hh);
      for (const g of geos) { g.a += .00018 * dt * g.s; g.b += .00011 * dt; drawGeo(g, t); }
      cx.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        p.x += p.vx * dt * p.z; p.y += p.vy * dt * p.z; p.tw += dt * .002;
        if (p.y < -10) { p.y = Hh + 10; p.x = Math.random() * W; } if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
        const a = (.25 + .35 * Math.sin(p.tw) ** 2) * p.z, r = 1 + p.z * 1.6;
        const px = p.x + (mx - .5) * 24 * p.z, py = p.y + (my - .5) * 16 * p.z;
        cx.fillStyle = `rgba(${p.c},${a * .25})`; cx.beginPath(); cx.arc(px, py, r * 3.2, 0, 6.283); cx.fill();
        cx.fillStyle = `rgba(${p.c},${a})`; cx.beginPath(); cx.arc(px, py, r * .8, 0, 6.283); cx.fill();
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
      const t = e.target.closest?.('.tabs button,.btn,.chips button');
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
