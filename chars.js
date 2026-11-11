/* Saved characters (PR #21, user t346u): several accounts (main + alts) on this device, each with its own levels, quest ticks / quest
   step progress and import details. The ACTIVE character keeps living in the existing keys, so every other screen is unchanged:
     mystats_v2 (+ _bak)   levels             qdone:<title> / qprog:<id>   quest ticks / steps        dch_account_v1   import details
   Saved snapshots live in dch_chars_v1 = {v:1, active:<id>|null, list:[{id, name, key, savedAt, levels, qdone:[...], qprog:{id:json}, acct}]}.
   Nothing is migrated destructively: with no dch_chars_v1 the current data stays exactly where it is until the user saves it.
   All writes are all-or-nothing (every touched key is put back if storage refuses). Pure functions over a Storage-like object `st`. */
(function (root) {
  'use strict';
  const KEY = 'dch_chars_v1', SK = 'mystats_v2', AK = 'dch_account_v1', MAX = 20;
  const isQ = k => k.startsWith('qdone:') || k.startsWith('qprog:');
  const keyOf = n => String(n || '').normalize('NFKC').replace(/[\u00a0_\-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const nameOk = n => typeof n === 'string' && /^[A-Za-z0-9 _-]{1,12}$/.test(n.trim());
  function load(st) {
    try { const o = JSON.parse(st.getItem(KEY) || 'null');
      if (o && o.v === 1 && Array.isArray(o.list)) return {v: 1, active: typeof o.active === 'string' ? o.active : null, list: o.list.filter(c => c && typeof c.id === 'string' && nameOk(c.name) && c.key === keyOf(c.name)).slice(0, MAX)}; } catch (e) {}
    return {v: 1, active: null, list: []};
  }
  const keys = st => { const a = []; for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k != null) a.push(k); } return a; };
  /* the active character as it is in storage right now */
  function snapshot(st) {
    let levels = null; try { const o = JSON.parse(st.getItem(SK) || 'null'); levels = o && o.levels && typeof o.levels === 'object' ? o.levels : null; } catch (e) {}
    const qdone = [], qprog = {};
    for (const k of keys(st)) { if (k.startsWith('qdone:') && st.getItem(k) === '1') qdone.push(k.slice(6)); else if (k.startsWith('qprog:')) qprog[k.slice(6)] = st.getItem(k); }
    let acct = null; try { acct = JSON.parse(st.getItem(AK) || 'null'); } catch (e) {}
    return {levels, qdone: qdone.sort(), qprog, acct: acct && typeof acct.name === 'string' ? acct : null};
  }
  /* write a set of key -> value|null all at once; on any failure restore every touched key and rethrow */
  function txn(st, changes) {
    const old = new Map(); for (const k of changes.keys()) old.set(k, st.getItem(k));
    try { for (const [k, v] of changes) v == null ? st.removeItem(k) : st.setItem(k, v); }
    catch (e) { for (const [k, v] of old) { try { v == null ? st.removeItem(k) : st.setItem(k, v); } catch (x) {} } throw e; }
  }
  const newId = () => 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  /* changes that make `c` (a saved entry) the active character: its levels, ONLY its quest keys, its import details */
  function activeChanges(st, c) {
    const ch = new Map();
    for (const k of keys(st)) if (isQ(k)) ch.set(k, null);
    for (const t of c.qdone || []) ch.set('qdone:' + t, '1');
    for (const [id, v] of Object.entries(c.qprog || {})) if (typeof v === 'string') ch.set('qprog:' + id, v);
    if (c.levels) { const j = JSON.stringify({v: 2, t: Date.now(), levels: c.levels}); ch.set(SK, j); ch.set(SK + '_bak', j); } else { ch.set(SK, null); ch.set(SK + '_bak', null); }
    ch.set(AK, c.acct ? JSON.stringify(c.acct) : null);
    return ch;
  }
  /* Save (or update) the active character under `name`; the same name in any case/spacing updates the same entry, never a duplicate */
  function save(st, name, now = Date.now()) {
    if (!nameOk(name)) return {ok: false, error: 'invalid_name'};
    const db = load(st), s = snapshot(st), k = keyOf(name);
    let c = db.list.find(x => x.key === k);   // same name (any case) = update that entry; a new name = a new saved character
    if (!c) { if (db.list.length >= MAX) return {ok: false, error: 'full'}; c = {id: newId()}; db.list.push(c); }
    Object.assign(c, {name: name.trim().replace(/\s+/g, ' '), key: k, savedAt: now, ...s}); db.active = c.id;
    try { txn(st, new Map([[KEY, JSON.stringify(db)]])); } catch (e) { return {ok: false, error: 'storage'}; }
    return {ok: true, id: c.id, db};
  }
  /* store the active character back into its own saved entry (before a switch / another account's import) */
  function autosave(st, db, now) { const a = db.active && db.list.find(x => x.id === db.active); if (a) Object.assign(a, snapshot(st), {savedAt: now}); return a; }
  /* an active character that was never saved (e.g. levels from before this feature) is saved first, never dropped */
  function adopt(st, db, now) {
    if (db.active) return true;
    const cur = snapshot(st); if (!(cur.levels || cur.qdone.length || Object.keys(cur.qprog).length || cur.acct)) return true;
    let base = cur.acct ? cur.acct.name : 'Main', n = base, i = 2; while (db.list.some(x => x.key === keyOf(n))) n = (base.slice(0, 9) + ' ' + i++).trim();
    if (db.list.length >= MAX) return false;
    const c = {id: newId(), name: n, key: keyOf(n), savedAt: now, ...cur}; db.list.push(c); db.active = c.id; return true;
  }
  /* Switch to saved character `id`: active one is saved first (keeps unsaved manual edits), then `id` is restored; no network */
  function select(st, id, now = Date.now()) {
    const db = load(st), c = db.list.find(x => x.id === id); if (!c) return {ok: false, error: 'missing'};
    if (db.active === id) return {ok: true, db, same: true};
    if (!adopt(st, db, now)) return {ok: false, error: 'full'};
    autosave(st, db, now); db.active = id;
    const ch = activeChanges(st, c); ch.set(KEY, JSON.stringify(db));
    try { txn(st, ch); } catch (e) { return {ok: false, error: 'storage'}; }
    return {ok: true, db};
  }
  /* Before importing `name` (no writes): if it is another account than the active one, the import must start from `name`'s own saved
     data (or a blank character) so it never inherits the current account's levels or quest ticks; the active one is saved first.
     Returns {same:true} when the import belongs to the active character (the existing single-account behaviour), else
     {same:false, entry, changes} where changes switch the active keys; the caller adds the import's own writes and commits once. */
  function planSwitch(st, name, now = Date.now()) {
    const db = load(st), k = keyOf(name), cur = snapshot(st), a = db.active && db.list.find(x => x.id === db.active);
    const curKey = cur.acct ? keyOf(cur.acct.name) : a && a.acct ? a.key : null, other = db.list.find(x => x.key === k && x !== a);
    if (curKey === k || (!curKey && !other)) return {ok: true, same: true, db};   // same account, or a never-imported character being upgraded
    if (!adopt(st, db, now)) return {ok: false, error: 'full'};
    autosave(st, db, now);
    let c = db.list.find(x => x.key === k);
    if (!c) { if (db.list.length >= MAX) return {ok: false, error: 'full'}; c = {id: newId(), name: name.trim(), key: k, savedAt: now, levels: null, qdone: [], qprog: {}, acct: null}; db.list.push(c); }
    db.active = c.id; const changes = activeChanges(st, c); changes.set(KEY, JSON.stringify(db));
    return {ok: true, same: false, entry: c, changes, db};
  }
  /* after a successful import has been written to the active keys: keep the saved entry in step (canonical name, data) */
  function afterImport(st, canonical, now = Date.now()) {
    const db = load(st); if (!db.active) return {ok: true};
    const a = db.list.find(x => x.id === db.active); if (!a) return {ok: true};
    const k = keyOf(canonical), clash = db.list.find(x => x.key === k && x !== a); if (clash) return {ok: true};
    Object.assign(a, snapshot(st), {name: canonical, key: k, savedAt: now});
    try { txn(st, new Map([[KEY, JSON.stringify(db)]])); } catch (e) { return {ok: false, error: 'storage'}; }
    return {ok: true};
  }
  /* token identifying the active character; an import answer is applied only if this is unchanged when it arrives */
  const token = st => { const db = load(st); let a = null; try { a = JSON.parse(st.getItem(AK) || 'null'); } catch (e) {} return (db.active || '-') + '|' + (a && a.name ? keyOf(a.name) : '-'); };
  const api = {KEY, MAX, keyOf, nameOk, load, snapshot, save, select, planSwitch, afterImport, token, txn, adopt};
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DCHChars = api;
})(this);
