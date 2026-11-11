// Lookup Worker: fixed official upstreams, validated name, CORS allowlist, schema, fallback, cache, optional limiter. node tests/player-lookup-worker.test.mjs
import assert from 'node:assert/strict'; import fs from 'node:fs';
const W = await import('../backend/player-lookup/worker.js');
const PD = JSON.parse(fs.readFileSync(new URL('./fixtures-playerdata-sample.json', import.meta.url)));
const HLJ = {name: 'Zezima', skills: [{name: 'Overall', level: 3232, xp: 1}, {name: 'Attack', level: 120, xp: 200000000}, {name: 'Slayer', level: -1, xp: -1}]};
const mk = (plan) => { const calls = []; const f = async (url, o) => { calls.push(url); assert.equal(o.redirect, 'manual'); const p = plan(url); return new Response(p.body == null ? '' : JSON.stringify(p.body), {status: p.status}); }; f.calls = calls; return f; };
const mem = () => { const m = new Map(); return {match: async k => m.has(k.url) ? new Response(m.get(k.url)) : undefined, put: async (k, r) => m.set(k.url, await r.text()), m}; };
const req = (q, origin = 'https://theelonmuskrs3.github.io', method = 'GET') => new Request('https://x.workers.dev/v1/player' + q, {method, headers: origin ? {origin} : {}});
const pdOK = mk(u => u.startsWith('https://secure.runescape.com/m=adventurers-log/api/v1/playerData/') ? {status: 200, body: PD} : {status: 500});
// names
for (const [i, o] of [['Zezima', 'Zezima'], ['  mod_ash ', 'mod ash'], ['Mod-Ash', 'Mod Ash'], ['a\u00a0b', 'a b']]) assert.equal(W.normName(i), o);
for (const bad of ['', 'abcdefghijklm', 'a/../b', 'x?y=1', 'é', '<script>', 'a%20b', null, 7, 'a'.repeat(70)]) assert.equal(W.normName(bad), null, String(bad));
let c = mem(), r = await W.handle(req('?rsn=Mod%20Ash'), {}, null, pdOK, c), j = await r.json();
assert.equal(pdOK.calls[0], 'https://secure.runescape.com/m=adventurers-log/api/v1/playerData/Mod%20Ash?includeSkills=true&includeQuests=true', 'fixed upstream, encoded name');
assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), 'https://theelonmuskrs3.github.io'); assert.equal(r.headers.get('cache-control'), 'public, max-age=600');
assert.equal(j.v, 1); assert.equal(j.ok, true); assert.equal(j.source, 'player-data'); assert.equal(j.name, 'Zezima');
assert.equal(j.skills.Constitution.level, PD.skills.hitpoints.level); assert.equal(j.skills.Runecrafting.level, PD.skills.runecraft.level); assert.equal(j.skills.Attack.xp, Math.floor(PD.skills.attack.fine_xp / 10));
assert.equal(Object.keys(j.skills).length, 29); assert.equal(j.quests.qp, PD.qp); assert.equal(j.quests.qpMax, PD.qp_max); assert.equal(j.quests.list.length, Object.keys(PD.quests).length);
assert.deepEqual(Object.keys(j).sort(), ['fetchedAt', 'name', 'ok', 'quests', 'skills', 'source', 'v']);
// cache: second lookup (any case) served without calling Jagex again
const n0 = pdOK.calls.length; r = await W.handle(req('?rsn=mod%20ash'), {}, null, pdOK, c); assert.equal(r.status, 200); assert.equal(pdOK.calls.length, n0, '10-minute cache hit');
// CORS: other sites refused, localhost (Windows app / previews) allowed, preflight
assert.equal((await W.handle(req('?rsn=Zezima', 'https://evil.example'), {}, null, pdOK, mem())).status, 403);
for (const o of ['http://localhost:8777', 'http://127.0.0.1:8813']) assert.equal((await W.handle(req('?rsn=Zezima', o), {}, null, pdOK, mem())).headers.get('access-control-allow-origin'), o);
r = await W.handle(req('', 'https://theelonmuskrs3.github.io', 'OPTIONS'), {}, null, pdOK, mem()); assert.equal(r.status, 204); assert.match(r.headers.get('access-control-allow-methods'), /GET/);
assert.equal((await W.handle(req('', 'https://evil.example', 'OPTIONS'))).headers.get('access-control-allow-origin'), null);
// not an open proxy: bad name, extra params, other paths, other methods
const none = mk(() => assert.fail('no upstream call expected'));
for (const q of ['?rsn=a/../b', '?rsn=Zezima&url=https://x', '?rsn=', '?rsn=abcdefghijklm']) { r = await W.handle(req(q), {}, null, none, mem()); assert.equal(r.status, 400); assert.equal((await r.json()).error, 'invalid_name'); }
assert.equal((await W.handle(new Request('https://x.workers.dev/https://evil', {headers: {}}), {}, null, none, mem())).status, 404);
assert.equal((await W.handle(req('?rsn=Zezima', null, 'POST'), {}, null, none, mem())).status, 404);
// not found -> 404, no HiScores call, cached
let f = mk(u => ({status: u.includes('playerData') ? 404 : 200, body: HLJ})); r = await W.handle(req('?rsn=Nobody'), {}, null, f, mem()); assert.equal(r.status, 404); assert.equal((await r.json()).error, 'not_found'); assert.equal(f.calls.length, 1);
// Player Data down -> HiScores skills only, quests null (never invented), unranked skill left out
f = mk(u => u.includes('playerData') ? {status: 503} : {status: 200, body: HLJ}); r = await W.handle(req('?rsn=Zezima'), {}, null, f, mem()); j = await r.json();
assert.equal(f.calls[1], 'https://secure.runescape.com/m=hiscore/index_lite.json?player=Zezima'); assert.equal(j.source, 'hiscores'); assert.equal(j.quests, null); assert.deepEqual(Object.keys(j.skills), ['Attack']);
// a redirect is never followed: treated as no answer (HiScores fallback, then 502)
f = mk(u => ({status: 302, body: null})); r = await W.handle(req('?rsn=Zezima'), {}, null, f, mem()); assert.equal(r.status, 502); assert.equal(f.calls.length, 2);
// both down -> 502, not cached
c = mem(); f = mk(() => ({status: 503})); r = await W.handle(req('?rsn=Zezima'), {}, null, f, c); assert.equal(r.status, 502); assert.equal((await r.json()).error, 'upstream_unavailable'); assert.equal(c.m.size, 0); assert.equal(r.headers.get('cache-control'), 'no-store');
// junk upstream bodies are dropped
f = mk(u => u.includes('playerData') ? {status: 200, body: {name: 'X', skills: {attack: {level: 'lots'}, hacked: {level: 99}}, quests: {'1': {title: 'T', status: 'DONE'}, x: {title: 'Y', status: 'COMPLETED'}}}} : {status: 503});
j = await (await W.handle(req('?rsn=X'), {}, null, f, mem())).json(); assert.deepEqual(j.skills, {}); assert.deepEqual(j.quests.list, []);
// optional rate-limit binding
r = await W.handle(req('?rsn=Zezima'), {LOOKUP_LIMITER: {limit: async () => ({success: false})}}, null, none, mem()); assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '60');
const src = fs.readFileSync(new URL('../backend/player-lookup/worker.js', import.meta.url), 'utf8');
assert.equal((src.match(/https:\/\/[a-z.]+\//g) || []).filter(h => !/runescape\.com|github\.io|developer\.runescape|runescape\.wiki|player-lookup\.cache/.test(h)).length, 0, 'only official hosts');
assert.doesNotMatch(src, /^(let|var) |^const \w+ = new Map/m, 'no module-level mutable request state');
console.log('PASS lookup worker: fixed official upstreams, name validation/encoding, CORS allowlist, schema, 10-min cache, not-found, HiScores fallback (no quests), 502, junk dropped, limiter');
