// Account import planner (player-import.js): validated fields only, unranked/missing kept, quest titles mapped to this app's quest list
// by verified title/ID aliases (no count assumptions), official QP kept separate from the completed count. node tests/player-import.test.cjs
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..'), I = require('../player-import.js');
const PD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-playerdata-sample.json'), 'utf8'));
const cat = JSON.parse(fs.readFileSync(path.join(base, 'data/quests.json'), 'utf8'));
const ic = JSON.parse(fs.readFileSync(path.join(base, 'data/icons.json'), 'utf8')), order = ic.skill_order, mx = ic.skill_max;
const lim = k => [k === 'Constitution' ? 10 : 1, mx[k] || 99];
(async () => {
  const W = await import('../backend/player-lookup/worker.js');
  const resp = {v: 1, ok: true, source: 'player-data', fetchedAt: '2026-11-11T18:20:00.000Z', ...W.shapePlayerData(PD)};
  const cur = Object.fromEntries(order.map(k => [k, k === 'Constitution' ? 10 : 1])); cur.Slayer = 77;
  const p = I.plan(resp, cur, order, lim, cat);
  assert.equal(p.ok, true); assert.equal(p.name, 'Zezima'); assert.equal(p.source, 'player-data');
  for (const k of order) assert.equal(p.levels[k], Math.min(lim(k)[1], resp.skills[k].level), k);
  // quests: every official entry in this sample maps to a title in this app's list (354 by title, 12 by checked alias), none guessed
  assert.equal(p.quests.unmatched.length, 0, p.quests.unmatched.join(', '));
  const titles = new Set(cat.map(c => c[0])); for (const t of [...p.quests.done, ...p.quests.notDone]) assert.ok(titles.has(t), t);
  assert.equal(p.quests.done.length + p.quests.notDone.length, Object.keys(PD.quests).length);
  assert.equal(p.quests.qp, PD.qp, 'official QP kept exactly'); assert.equal(p.quests.qpMax, PD.qp_max);
  assert.equal(p.quests.completed, Object.values(PD.quests).filter(q => q.status === 'COMPLETED').length, 'completed counted separately from QP');
  assert.ok(p.quests.done.includes('Once Upon a Time in Gielinor: Foreshadowing') === (PD.quests[Object.keys(PD.quests).find(k => PD.quests[k].title === 'Foreshadowing')].status === 'COMPLETED'));
  assert.notEqual(cat.filter(c => c[1] === 'quest').length, Object.keys(PD.quests).length, 'lists differ in size (348 vs 366): matched by title, not by count');
  // alias needs BOTH the checked id and title
  const forged = {...resp, quests: {qp: 1, qpMax: 2, list: [{id: 999, title: 'Tears of Guthix', status: 'COMPLETED'}, {id: 81, title: 'Tears of Guthix', status: 'COMPLETED'}, {id: 5, title: 'Not A Real Quest', status: 'COMPLETED'}]}};
  const pf = I.plan(forged, cur, order, lim, cat); assert.deepEqual(pf.quests.done, ['Tears of Guthix (quest)']); assert.deepEqual(pf.quests.unmatched, ['Tears of Guthix', 'Not A Real Quest']); assert.equal(pf.quests.completed, 3);
  // unranked / missing / out-of-range skills keep the saved value; HiScores fallback has no quests (nothing invented)
  const hs = {v: 1, ok: true, source: 'hiscores', name: 'Zezima', skills: {Attack: {level: 120}, Slayer: {level: -1}, Magic: {level: 999}}, quests: null};
  const ph = I.plan(hs, cur, order, lim, cat); assert.equal(ph.levels.Attack, Math.min(120, lim('Attack')[1])); assert.equal(ph.levels.Slayer, 77); assert.equal(ph.levels.Magic, 1); assert.equal(ph.quests, null);
  assert.ok(ph.kept.includes('Slayer') && ph.kept.includes('Magic'));
  // errors / private / bad answers: no plan, so nothing is applied
  for (const [r, e] of [[{v: 1, ok: false, error: 'not_found'}, 'not_found'], [{v: 1, ok: false, error: 'upstream_unavailable'}, 'upstream_unavailable'], [null, 'bad_response'], [{v: 2, ok: true}, 'bad_response'],
    [{v: 1, ok: true, name: '<img src=x>', skills: {}}, 'bad_response'], [{v: 1, ok: true, name: 'Zezima', skills: {}}, 'no_levels'], [{v: 1, ok: false, error: 'x<script>'}, 'bad_response']]) assert.equal(I.plan(r, cur, order, lim, cat).error, e);
  // app wiring: atomic apply with rollback, only completions ticked, name replaced only on success, honest not-live note, import off until a real URL
  const app = fs.readFileSync(path.join(base, 'app.js'), 'utf8'), html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
  const U = 'https://rs3-drop-clue-player-data.rs3-drop-clue-helper.workers.dev';
  assert.ok(html.includes(`<meta name="dch-player-api" content="${U}">`), 'lookup Worker URL configured');
  assert.ok(html.includes(`connect-src 'self' https://prices.runescape.wiki https://api.weirdgloop.org ${U};`), 'CSP allows exactly that origin');
  assert.match(html, /<script src="player-import\.js"><\/script>\n<script src="app\.js"><\/script>/);
  assert.match(app, /if \(!p\.ok\) return say\(ACCT_ERR\[p\.error\] \|\| ACCT_ERR\.bad_response\);/);
  assert.match(app, /for \(const \[k, v\] of old\) \{ try \{ v == null \? localStorage\.removeItem\(k\) : localStorage\.setItem\(k, v\); \}/, 'rollback on storage failure');
  assert.match(app, /only official completions are ticked; nothing is unticked/); assert.doesNotMatch(app.slice(app.indexOf('async function acctImport'), app.indexOf('async function charView')), /removeItem\(QDONE/);
  assert.match(app, /credentials: 'omit'/); assert.match(app, /Not live: updates on logout or world hop, up to 10 min behind\./);
  assert.match(app, /Import sends only the RuneScape name you type to the lookup service, which asks Jagex's official Player Data API/);
  assert.match(app, /if \(c && \/\^https:\\\/\\\/\[a-z0-9.-\]\+/, 'only an https lookup URL is accepted'); assert.match(app, /\n  return null; \};/, 'no URL = import off (honest)');
  console.log(`PASS import planner: ${order.length} skills, ${p.quests.done.length} done + ${p.quests.notDone.length} not done mapped (0 unmatched of ${Object.keys(PD.quests).length}), QP ${p.quests.qp}/${p.quests.qpMax} official, ${p.quests.completed} completed; unranked kept; errors change nothing`);
})().catch(e => { console.error(e); process.exit(1); });
