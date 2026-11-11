/* RS3 only. RuneScape Wiki calculator directory helpers and device-local favourites.
 * Calculators run on runescape.wiki; the Wiki forbids framing (X-Frame-Options: DENY, frame-ancestors 'none'),
 * so they are opened in a new tab. No proxying, no injection, no reading of other sites' documents.
 * Favourites live under their own localStorage key, separate from saved stats and every other key.
 */
(function (root) {
  'use strict';
  const FAV_KEY = 'dch_calc_favorites_v1';
  const ORIGIN = 'https://runescape.wiki';
  const MAX_FAVS = 200, MAX_LABEL = 80, MAX_PATH = 300;
  const str = v => typeof v === 'string' ? v : '';
  const clip = (s, n) => s.length > n ? s.slice(0, n) : s;

  /* Directory entry path (from data/calculators.json): must be a plain /w/... wiki article path. */
  function safeWikiPath(path) {
    path = str(path);
    if (!path || path.length > MAX_PATH || !/^\/w\/[^\s/?#][^\s?]*$/.test(path.replace(/#[^\s]*$/, ''))) return null;
    let u; try { u = new URL(path, ORIGIN); } catch (e) { return null; }
    if (u.origin !== ORIGIN || !u.pathname.startsWith('/w/') || u.search) return null;
    return u.pathname + u.hash;
  }
  const wikiUrl = path => { const p = safeWikiPath(path); return p ? ORIGIN + p : null; };

  /* A user-typed favourite: only https://runescape.wiki/w/Calculator:... (or the bare page name "Calculator:..."). */
  function parseCalculatorUrl(input) {
    let s = str(input).trim();
    if (!s || s.length > MAX_PATH + ORIGIN.length) return null;
    if (/^calculator:/i.test(s)) s = ORIGIN + '/w/' + s.replace(/ /g, '_');
    if (!/^https:\/\//i.test(s)) return null;                  // rejects javascript:, data:, relative and same-origin paths
    let u; try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'runescape.wiki' || u.port || u.username || u.password) return null;
    if (!u.pathname.startsWith('/w/') || u.search) return null;
    let title; try { title = decodeURIComponent(u.pathname.slice(3)).replace(/_/g, ' '); } catch (e) { return null; }
    if (!/^Calculator:[^<>\[\]{}|#?\u0000-\u001f]+$/.test(title) || title.length <= 'Calculator:'.length) return null;
    const path = '/w/' + encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':') + (u.hash && /^#[\w.\-:%]{1,120}$/.test(u.hash) ? u.hash : '');
    return safeWikiPath(path) ? {path, page: title} : null;
  }

  function titleOf(path) { const t = path.slice(3).replace(/#.*/, ''); try { return clip(decodeURIComponent(t).replace(/_/g, ' '), MAX_LABEL); } catch (e) { return clip(t, MAX_LABEL); } }
  function cleanFav(f) {
    if (!f || typeof f !== 'object') return null;
    const path = safeWikiPath(f.path); if (!path) return null;
    const label = clip(str(f.label).replace(/[\u0000-\u001f]/g, '').trim(), MAX_LABEL) || titleOf(path);
    return {path, label, custom: !!f.custom};
  }
  function load(storage) {
    let raw = null; try { raw = storage && storage.getItem(FAV_KEY); } catch (e) { return []; }
    if (!raw) return [];
    let a; try { a = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(a)) return [];
    const seen = new Set(), out = [];
    for (const f of a) { const c = cleanFav(f); if (c && !seen.has(c.path)) { seen.add(c.path); out.push(c); } if (out.length >= MAX_FAVS) break; }
    return out;
  }
  function save(storage, favs) {
    const clean = []; const seen = new Set();
    for (const f of favs || []) { const c = cleanFav(f); if (c && !seen.has(c.path)) { seen.add(c.path); clean.push(c); } }
    try { storage.setItem(FAV_KEY, JSON.stringify(clean.slice(0, MAX_FAVS))); return true; } catch (e) { return false; }
  }
  const has = (favs, path) => favs.some(f => f.path === path);
  function toggle(storage, entry) {
    const favs = load(storage); const c = cleanFav(entry); if (!c) return {favs, on: false, ok: false};
    const on = !has(favs, c.path);
    const next = on ? [...favs, c] : favs.filter(f => f.path !== c.path);
    if (on && next.length > MAX_FAVS) return {favs, on: false, ok: false};
    const ok = save(storage, next);
    return {favs: ok ? next : favs, on: ok ? on : !on, ok};
  }
  const api = {FAV_KEY, ORIGIN, MAX_FAVS, safeWikiPath, wikiUrl, parseCalculatorUrl, load, save, toggle, has};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RS3Calc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
