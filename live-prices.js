/* RS3 only. Community RuneScape Wiki Prices API; trade data supplied by Jagex.
 * Shared bulk polling, exact official mapping, explicit freshness and gross (pre-tax) estimates.
 * No credentials, trades, skill storage or cross-origin iframe access.
 */
(function (root) {
  'use strict';
  const BASE = 'https://prices.runescape.wiki/api/v2/rs';
  const POLL_MS = 60000, TRADE_MAX_AGE_MS = 15 * 60000, FETCH_MAX_AGE_MS = 2 * 60000;
  const CACHE_KEY = 'dch_rs3_ge_cache_v1';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const money = n => finite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER;
  class PriceBook {
    constructor() { this.mapping = new Map(); this.names = new Map(); this.aliases = new Map(); this.data = {}; this.fetchedAt = 0; this.connected = false; this.online = true; this.error = ''; }
    setMapping(rows) {
      if (!Array.isArray(rows) || !rows.length) throw Error('Invalid RS3 mapping');
      const mapping = new Map(), names = new Map();
      for (const row of rows) {
        if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.name !== 'string' || !row.name) continue;
        mapping.set(row.id, {id: row.id, name: row.name});
        // An ambiguous source name must not silently select one of several IDs.
        names.set(row.name, names.has(row.name) ? null : row.id);
      }
      if (!mapping.size) throw Error('Empty RS3 mapping');
      this.mapping = mapping; this.names = names;
    }
    resolve(item) {
      if (Number.isSafeInteger(item)) return this.mapping.has(item) ? item : null;
      if (typeof item !== 'string') return null;
      return this.names.get(item) ?? this.aliases.get(item) ?? null;
    }
    // Call only for a verified explicit RS3 GE-entry alias, never fuzzy/substring matches.
    alias(name, officialName) {
      const id = this.names.get(officialName);
      if (id && !this.names.has(name)) this.aliases.set(name, id);
    }
    setLatest(response, now) {
      if (!response || typeof response.data !== 'object' || !response.data || Array.isArray(response.data)) throw Error('Invalid RS3 latest response');
      const data = {};
      for (const [id, row] of Object.entries(response.data)) {
        if (!/^\d+$/.test(id) || !row || typeof row !== 'object') continue;
        data[id] = {};
        for (const side of ['high', 'low']) {
          data[id][side] = money(row[side]) ? row[side] : null;
          data[id][side + 'Time'] = finite(row[side + 'Time']) && row[side + 'Time'] > 0 ? row[side + 'Time'] : null;
        }
      }
      this.data = data; this.fetchedAt = now; this.connected = true; this.error = '';
    }
    quote(item, side = 'buy', now = Date.now()) {
      if (!['buy', 'sell'].includes(side)) throw Error('Price side must be buy or sell');
      const id = this.resolve(item), field = side === 'buy' ? 'high' : 'low';
      const row = id == null ? null : this.data[id];
      const value = row && money(row[field]) ? row[field] : null;
      const time = row && finite(row[field + 'Time']) ? row[field + 'Time'] : null;
      let status = 'live';
      if (id == null) status = 'unmapped';
      else if (value == null || time == null) status = 'missing';
      else if (!this.online) status = 'offline';
      else if (!this.connected) status = 'unavailable';
      else if (!this.fetchedAt || now - this.fetchedAt > FETCH_MAX_AGE_MS || now < this.fetchedAt - 60000 || now - time * 1000 > TRADE_MAX_AGE_MS || time * 1000 > now + 60000) status = 'stale';
      return {id, side, value, time, status, live: status === 'live', fetchedAt: this.fetchedAt};
    }
    number(item, side = 'buy', now) { const q = this.quote(item, side, now); return q.live ? q.value : null; }
    total(lines, side, now) {
      if (!Array.isArray(lines)) return {value: null, complete: false, missing: ['Unverified quantities']};
      const missing = []; let value = 0;
      for (const l of lines) {
        if (!l || !finite(l.q) || l.q < 0 || l.q > Number.MAX_SAFE_INTEGER || !l.n || l.cv) { missing.push(l && l.n || 'Unverified quantity/formula'); continue; }
        // Coin denomination is exact, not a market-price substitute. Other wiki fixed values are snapshots.
        const coin = l.n === 'Coins' || l.n === 'coins';
        const p = coin ? 1 : l.v != null ? null : this.number(l.id ?? l.n, side, now);
        if (p == null) missing.push(l.n); else value += l.q * p;
      }
      if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER) missing.push('Total exceeds safe numeric range');
      return {value: missing.length ? null : value, complete: !missing.length, missing: [...new Set(missing)]};
    }
    estimate(m, now) {
      const fail = reason => ({complete: false, profit: null, cost: null, revenue: null, missing: [reason]});
      now = now === undefined ? Date.now() : now;
      if (!this.online || !this.connected || !this.fetchedAt || now - this.fetchedAt > FETCH_MAX_AGE_MS || now < this.fetchedAt - 60000) return fail('Fresh live source unavailable');
      if (!m || m.wf !== 'c' || (m.tg || []).some(t => ['pp', 'free'].includes(t)) || !Array.isArray(m.inp) || !Array.isArray(m.out) || !m.out.length) return fail('No complete structured wiki formula');
      const lines = m.inp.concat(m.out);
      if (lines.some(l => l.k === 1) && !(finite(m.kph) && m.kph > 0)) return fail('Unverified per-kill rate');
      let factor = 1;
      if (m.run != null || m.g === 'rec') {
        if (!(finite(m.at) && m.at > 0)) return fail('Unverified activity duration');
        factor = 60 / m.at;
      }
      const cost = this.total(m.inp, 'buy', now), revenue = this.total(m.out, 'sell', now);
      const missing = [...new Set(cost.missing.concat(revenue.missing))];
      const profit = missing.length ? null : (revenue.value - cost.value) * factor;
      if (profit != null && (!Number.isFinite(profit) || Math.abs(profit) > Number.MAX_SAFE_INTEGER || cost.value * factor > Number.MAX_SAFE_INTEGER || revenue.value * factor > Number.MAX_SAFE_INTEGER)) return fail('Estimate exceeds safe numeric range');
      return {complete: !missing.length, profit, cost: cost.complete ? cost.value * factor : null, revenue: revenue.complete ? revenue.value * factor : null, missing};
    }
  }
  function createService(env = {}) {
    const book = new PriceBook();
    const win = env.window || root, doc = env.document || root.document;
    const nav = env.navigator || root.navigator || {};
    const fetcher = env.fetch || root.fetch.bind(root), now = env.now || (() => Date.now());
    const schedule = env.setTimeout || root.setTimeout.bind(root), cancel = env.clearTimeout || root.clearTimeout.bind(root);
    const storage = env.storage === undefined ? (() => { try { return root.sessionStorage; } catch (_) { return null; } })() : env.storage;
    const listeners = new Set(); let timer = null, pending = null, aborter = null, started = false, lastAttempt = null, mappingAt = 0;
    try { const c = JSON.parse(storage && storage.getItem(CACHE_KEY)); if (c && c.version === 1) { book.setMapping(c.mapping); book.setLatest({data: c.data}, c.fetchedAt); book.connected = false; mappingAt = Number.isFinite(c.mappingAt) ? c.mappingAt : 0; } } catch (_) {}
    function emit() { for (const f of listeners) { try { f(); } catch (e) { if (root.console) root.console.warn('Price view update failed', e); } } }
    function active() { return listeners.size > 0 && nav.onLine !== false && !(doc && doc.hidden); }
    function persist() { try { if (storage) storage.setItem(CACHE_KEY, JSON.stringify({version: 1, mapping: [...book.mapping.values()], data: book.data, fetchedAt: book.fetchedAt, mappingAt})); } catch (_) {} }
    function clearTimer() { if (timer != null) cancel(timer); timer = null; }
    function arm() {
      clearTimer(); if (!active()) return;
      const delay = lastAttempt == null ? 0 : Math.max(0, POLL_MS - (now() - lastAttempt));
      timer = schedule(() => { timer = null; refresh(); }, delay);
    }
    async function refresh() {
      if (!active() || pending) return pending;
      if (lastAttempt != null && now() - lastAttempt < POLL_MS) { arm(); return; }
      lastAttempt = now(); aborter = new AbortController();
      // Browser requests cannot reliably set User-Agent. Api-User-Agent identifies this fan tool.
      const opts = {signal: aborter.signal, headers: {'Api-User-Agent': 'DropClueHelper/RS3-LivePrices (unofficial fan tool)'}};
      const request = async endpoint => { const r = await fetcher(BASE + endpoint, opts); if (!r.ok) throw Error('Price source HTTP ' + r.status); return r.json(); };
      pending = (async () => {
        try {
          const [mapping, latest] = await Promise.all([book.mapping.size && now() - mappingAt < 86400000 ? null : request('/mapping'), request('/latest')]);
          if (mapping) { book.setMapping(mapping); mappingAt = now(); }
          book.setLatest(latest, now()); persist();
        } catch (e) { book.connected = false; book.error = e.name === 'AbortError' ? '' : 'Price source unavailable'; }
        finally { pending = null; aborter = null; book.online = nav.onLine !== false; emit(); arm(); }
      })();
      return pending;
    }
    function lifecycle() {
      book.online = nav.onLine !== false;
      if (!active()) { clearTimer(); if (aborter) aborter.abort(); }
      emit(); if (active()) arm();
    }
    function start() {
      if (started) return; started = true;
      win.addEventListener('online', lifecycle); win.addEventListener('offline', lifecycle);
      if (doc) doc.addEventListener('visibilitychange', lifecycle);
    }
    function stop() {
      clearTimer(); if (aborter) aborter.abort();
      win.removeEventListener('online', lifecycle); win.removeEventListener('offline', lifecycle);
      if (doc) doc.removeEventListener('visibilitychange', lifecycle); started = false;
    }
    return {book, refresh, subscribe(f) {
      listeners.add(f); start(); book.online = nav.onLine !== false; arm();
      return () => { listeners.delete(f); if (!listeners.size) stop(); };
    }, constants: {POLL_MS, TRADE_MAX_AGE_MS, FETCH_MAX_AGE_MS}};
  }
  const api = {PriceBook, createService, BASE, POLL_MS, TRADE_MAX_AGE_MS, FETCH_MAX_AGE_MS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RS3Prices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
