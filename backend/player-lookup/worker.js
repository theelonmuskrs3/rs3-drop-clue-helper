/* RS3 player lookup for Drop & Clue Helper (PR #20). One job only: given a validated RuneScape name, ask Jagex's OFFICIAL public APIs
   and return a small, validated JSON summary. Not an open proxy: the only upstreams are the two fixed URLs below, the only input is the
   name. No secrets, no Jagex login, nothing stored except a 10-minute response cache.
   - Player Data API (skills + quests + canonical name): https://developer.runescape.com/platform/modules/adventurers-log/player-data.html
   - Hiscores Index Lite (skills only, used only when Player Data is down / times out): https://runescape.wiki/w/Application_programming_interface#Hiscores_Lite
   Runs as a Cloudflare Worker (module syntax); any runtime with fetch + Request/Response works (cache falls back to memory).
   GET /v1/player?rsn=NAME  ->  {ok:true,v:1,source,name,fetchedAt,skills:{Attack:{level,xp}},quests:{qp,qpMax,list:[{id,title,status}]}|null}
                            ->  {ok:false,v:1,error:'invalid_name'|'not_found'|'upstream_unavailable'|'rate_limited'|'bad_request',message} */
const PD = n => `https://secure.runescape.com/m=adventurers-log/api/v1/playerData/${encodeURIComponent(n)}?includeSkills=true&includeQuests=true`;
const HL = n => `https://secure.runescape.com/m=hiscore/index_lite.json?player=${encodeURIComponent(n)}`;
export const ORIGINS = [/^https:\/\/theelonmuskrs3\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/];
const SK = {attack: 'Attack', defence: 'Defence', strength: 'Strength', hitpoints: 'Constitution', constitution: 'Constitution', ranged: 'Ranged', prayer: 'Prayer', magic: 'Magic',
  cooking: 'Cooking', woodcutting: 'Woodcutting', fletching: 'Fletching', fishing: 'Fishing', firemaking: 'Firemaking', crafting: 'Crafting', smithing: 'Smithing', mining: 'Mining',
  herblore: 'Herblore', agility: 'Agility', thieving: 'Thieving', slayer: 'Slayer', farming: 'Farming', runecraft: 'Runecrafting', runecrafting: 'Runecrafting', hunter: 'Hunter',
  construction: 'Construction', summoning: 'Summoning', dungeoneering: 'Dungeoneering', divination: 'Divination', invention: 'Invention', archaeology: 'Archaeology', necromancy: 'Necromancy'};
const TTL_S = 600, TIMEOUT = 8000, MAX_BYTES = 1 << 20;   // 10 min cache (Cache API, free); 8 s upstream timeout; upstream body cap 1 MB
/* RuneScape names: 1-12 letters, digits, spaces, '-' or '_' (underscores/hyphens and spaces are interchangeable in display names). */
export function normName(raw) {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const s = raw.normalize('NFKC').replace(/[\u00a0_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return /^[A-Za-z0-9 ]{1,12}$/.test(s) ? s : null;
}
const int = (x, lo, hi) => Number.isSafeInteger(x) && x >= lo && x <= hi ? x : null;
export function shapePlayerData(j) {
  if (!j || typeof j !== 'object' || typeof j.name !== 'string') return null;
  const skills = {};
  for (const [k, v] of Object.entries(j.skills || {})) { const n = SK[String(k).toLowerCase()], L = v && int(v.level, 1, 150); if (n && L) skills[n] = {level: L, xp: v && int(v.fine_xp, 0, 2e10) != null ? Math.floor(v.fine_xp / 10) : null}; }
  let quests = null;
  if (j.quests && typeof j.quests === 'object') {
    const list = [];
    for (const [id, q] of Object.entries(j.quests)) {
      if (!/^\d{1,6}$/.test(id) || !q || typeof q.title !== 'string' || q.title.length > 120 || !['NOT_STARTED', 'STARTED', 'COMPLETED'].includes(q.status)) continue;
      list.push({id: +id, title: q.title, status: q.status});
    }
    quests = {qp: int(j.qp, 0, 10000), qpMax: int(j.qp_max, 0, 10000), list};
  }
  return {name: j.name.slice(0, 12), skills, quests};
}
export function shapeHiscores(j) {
  if (!j || !Array.isArray(j.skills)) return null;
  const skills = {};
  for (const s of j.skills) { const n = SK[String(s && s.name || '').toLowerCase()], L = s && int(s.level, 1, 150); if (n && L) skills[n] = {level: L, xp: int(s.xp, 0, 2e9)}; }   // unranked = -1: left out
  return {name: typeof j.name === 'string' ? j.name.slice(0, 12) : null, skills, quests: null};
}
async function upstream(url, f) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), TIMEOUT);
  try { const r = await f(url, {signal: ac.signal, headers: {accept: 'application/json', 'user-agent': 'DropClueHelper-player-lookup/1 (+https://theelonmuskrs3.github.io/rs3-drop-clue-helper/)'}, redirect: 'manual'});   // Workers fetch supports only 'follow'/'manual'; a 3xx is never followed (treated as no answer)
    if (r.status !== 200) return {status: r.status === 404 ? 404 : r.status >= 300 && r.status < 400 ? 0 : r.status, json: null};
    if (+(r.headers.get('content-length') || 0) > MAX_BYTES) return {status: 0, json: null};
    const t = await r.text(); return {status: r.status, json: t.length > MAX_BYTES ? null : (() => { try { return JSON.parse(t); } catch (e) { return null; } })()}; }
  catch (e) { return {status: 0, json: null}; } finally { clearTimeout(t); }
}
export async function lookup(name, f = fetch) {
  const pd = await upstream(PD(name), f);
  if (pd.status === 200) { const s = shapePlayerData(pd.json); if (s) return {ok: true, source: 'player-data', ...s}; }
  if (pd.status === 404) return {ok: false, error: 'not_found', message: 'No RuneScape player with that name in the official Player Data API.'};
  const hl = await upstream(HL(name), f);   // Player Data down / timed out: skills only from the HiScores (no quest data is invented)
  if (hl.status === 200) { const s = shapeHiscores(hl.json); if (s) return {ok: true, source: 'hiscores', ...s, name: s.name || name}; }
  if (hl.status === 404) return {ok: false, error: 'not_found', message: 'Player not found on the official HiScores.'};
  return {ok: false, error: 'upstream_unavailable', message: 'The official RuneScape APIs did not answer. Try again in a few minutes.'};
}
function cors(origin) {
  const h = {'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', vary: 'Origin'};
  if (origin && ORIGINS.some(r => r.test(origin))) Object.assign(h, {'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400'});
  return h;
}
const out = (body, status, origin, extra = {}) => new Response(JSON.stringify({v: 1, ...body}), {status, headers: {...cors(origin), ...extra}});
/* env.LOOKUP_LIMITER (optional Workers Rate Limiting binding, see wrangler.jsonc) caps lookups per client IP; without it the 10-minute
   cache still bounds upstream calls to one per name per 10 minutes per Cloudflare location. No module-level request state. */
export async function handle(req, env = {}, ctx = null, f = fetch, cache = (typeof caches !== 'undefined' ? caches.default : null)) {
  const u = new URL(req.url), origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(origin)});
  if (req.method !== 'GET' || u.pathname !== '/v1/player') return out({ok: false, error: 'bad_request', message: 'Use GET /v1/player?rsn=NAME'}, 404, origin);
  if (origin && !ORIGINS.some(r => r.test(origin))) return out({ok: false, error: 'bad_request', message: 'Origin not allowed'}, 403, origin);
  const name = normName(u.searchParams.get('rsn'));
  if (!name || [...u.searchParams.keys()].some(k => k !== 'rsn')) return out({ok: false, error: 'invalid_name', message: 'A RuneScape name is 1-12 letters, numbers, spaces, - or _.'}, 400, origin);
  if (env.LOOKUP_LIMITER) {
    const {success} = await env.LOOKUP_LIMITER.limit({key: req.headers.get('cf-connecting-ip') || 'unknown'});
    if (!success) return out({ok: false, error: 'rate_limited', message: 'Too many lookups, wait a minute.'}, 429, origin, {'retry-after': '60'});
  }
  const key = new Request('https://player-lookup.cache/v1/player?rsn=' + encodeURIComponent(name.toLowerCase()));
  let body = null, hit = false;
  if (cache) { const c = await cache.match(key); if (c) { body = await c.json().catch(() => null); hit = !!body; } }
  if (!body) {
    const r = await lookup(name, f); body = {...r, fetchedAt: new Date().toISOString()};
    if (cache && (r.ok || r.error === 'not_found')) {
      const put = cache.put(key, new Response(JSON.stringify(body), {headers: {'content-type': 'application/json', 'cache-control': `public, max-age=${TTL_S}`}}));
      ctx ? ctx.waitUntil(put) : await put;
    }
  }
  const st = body.ok ? 200 : body.error === 'not_found' ? 404 : 502;
  console.log(JSON.stringify({evt: 'lookup', status: st, source: body.source || null, error: body.error || null, cache: hit}));   // no player names in logs
  return out(body, st, origin, {'cache-control': body.ok ? `public, max-age=${TTL_S}` : 'no-store'});
}
export default { fetch: (req, env, ctx) => handle(req, env, ctx) };
