/* Account import (PR #20): validates the lookup service's answer and works out exactly what to change, without touching storage.
   app.js applies the result in one step (all or nothing). Pure functions, also loaded by tests/player-import.test.cjs. */
(function (root) {
  'use strict';
  const STATUS = ['NOT_STARTED', 'STARTED', 'COMPLETED'];
  /* official title -> this app's quest list title, only where both the official quest ID and title were checked by hand (11 Nov 2026) */
  const ALIAS = {81: ['Tears of Guthix', 'Tears of Guthix (quest)'], 467: ['Raksha, the Shadow Colossus', 'Raksha, the Shadow Colossus (quest)'],
    462: ['Father and Son', 'Father and Son (miniquest)'], 506: ['Hermy and Bass', 'That Old Black Magic: Hermy and Bass']};
  const ALIAS_T = {'Foreshadowing': 'Once Upon a Time in Gielinor: Foreshadowing', 'Flashback': 'Once Upon a Time in Gielinor: Flashback',
    'Fortunes': 'Once Upon a Time in Gielinor: Fortunes', 'Finale': 'Once Upon a Time in Gielinor: Finale',
    'My One and Only Lute': 'That Old Black Magic: My One and Only Lute', 'Skelly By Everlight': 'That Old Black Magic: Skelly By Everlight',
    'Flesh and Bone': 'That Old Black Magic: Flesh and Bone', 'Helping Laniakea': 'Helping Laniakea (miniquest)'};
  const norm = t => String(t).normalize('NFKC').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  function normName(raw) {
    if (typeof raw !== 'string' || raw.length > 64) return null;
    const s = raw.normalize('NFKC').replace(/[\u00a0_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return /^[A-Za-z0-9 ]{1,12}$/.test(s) ? s : null;
  }
  /* resp: lookup JSON; cur: current levels {Skill: level}; order: skill names this app knows; lim(k) -> [min,max]; catalog: [[title, kind], ...] */
  function plan(resp, cur, order, lim, catalog) {
    if (!resp || resp.v !== 1 || resp.ok !== true) return {ok: false, error: (resp && typeof resp.error === 'string' && /^[a-z_]{1,32}$/.test(resp.error)) ? resp.error : 'bad_response'};
    const name = normName(resp.name); if (!name || !resp.skills || typeof resp.skills !== 'object') return {ok: false, error: 'bad_response'};
    const levels = {...cur}, changed = [], kept = [];
    for (const k of order) {
      const s = resp.skills[k], L = s && s.level, [lo, hi] = lim(k);
      if (Number.isInteger(L) && L >= lo && L <= hi) { if (levels[k] !== L) changed.push(k); levels[k] = L; } else kept.push(k);   // missing / unranked: keep what is saved
    }
    if (kept.length === order.length) return {ok: false, error: 'no_levels'};
    const q = resp.quests; let quests = null;
    if (q && Array.isArray(q.list)) {
      const byT = new Map(catalog.map(c => [norm(c[0]), c[0]])), done = [], notDone = [], unmatched = [];
      let completed = 0;
      for (const e of q.list) {
        if (!e || !Number.isInteger(e.id) || typeof e.title !== 'string' || !STATUS.includes(e.status)) continue;
        if (e.status === 'COMPLETED') completed++;
        const a = ALIAS[e.id], t = byT.get(norm(e.title)) || (a && a[0] === e.title ? a[1] : null) || (ALIAS_T[e.title] && byT.get(norm(ALIAS_T[e.title])));
        if (!t) { unmatched.push(e.title); continue; }
        (e.status === 'COMPLETED' ? done : notDone).push(t);
      }
      quests = {qp: Number.isInteger(q.qp) ? q.qp : null, qpMax: Number.isInteger(q.qpMax) ? q.qpMax : null, completed, done, notDone, unmatched};
    }
    return {ok: true, name, source: resp.source === 'hiscores' ? 'hiscores' : 'player-data', fetchedAt: typeof resp.fetchedAt === 'string' ? resp.fetchedAt.slice(0, 30) : null, levels, changed, kept, quests};
  }
  const api = {plan, normName, ALIAS, ALIAS_T};
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DCHImport = api;
})(this);
