// Saved characters (chars.js): non-destructive migration, two accounts with separate levels/quests/QP, manual edits kept on switch,
// same name updates (no duplicates), reload, storage-full rollback, import isolation, race token. node tests/my-characters.test.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), C = require('../chars.js');
class St { constructor(o = {}, cap = Infinity, failAfter = Infinity) { this.m = new Map(Object.entries(o)); this.cap = cap; this.n = failAfter; }
  get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { v = String(v); if (this.n-- <= 0) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; this.n = Infinity; throw e; } const used = [...this.m].reduce((a, [x, y]) => a + (x === k ? 0 : x.length + y.length), 0); if (used + k.length + v.length > this.cap) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } this.m.set(k, v); }
  removeItem(k) { this.m.delete(k); } dump() { return Object.fromEntries([...this.m].sort()); } }
const lv = o => JSON.stringify({v: 2, t: 1, levels: o}), acct = (n, qp) => JSON.stringify({name: n, at: 1, source: 'player-data', quests: true, qp, qpMax: 476, completed: 3});
// 1. existing single-account user: nothing changes until they act (no migration writes), then Save keeps everything
const pre = {mystats_v2: lv({Attack: 90, Slayer: 77}), mystats_v2_bak: lv({Attack: 90, Slayer: 77}), dch_account_v1: acct('Zezima', 469), "qdone:Cook's Assistant": '1', 'qprog:abc': '["s1"]', 'fav:items': '[1,2]', 'dch-welcome': '1'};
let st = new St(pre); const before = st.dump();
assert.deepEqual(C.load(st), {v: 1, active: null, list: []}); assert.deepEqual(st.dump(), before, 'loading writes nothing');
let r = C.save(st, 'Zezima'); assert.ok(r.ok); const z = r.id;
for (const k of Object.keys(pre)) assert.equal(st.getItem(k), pre[k], 'save leaves active keys untouched: ' + k);
assert.deepEqual(C.load(st).list[0].qdone, ["Cook's Assistant"]); assert.equal(C.load(st).list[0].acct.qp, 469);
// same name in another case/spacing updates the same entry (no duplicate)
st.setItem('mystats_v2', lv({Attack: 91, Slayer: 77})); r = C.save(st, '  zezima '); assert.equal(r.id, z); assert.equal(C.load(st).list.length, 1); assert.equal(C.load(st).list[0].levels.Attack, 91);
// 2. importing ANOTHER account: planSwitch starts from a blank character (no inherited levels or quest ticks), active saved first
st.setItem('mystats_v2', lv({Attack: 92, Slayer: 77}));   // unsaved manual edit on Zezima
let sw = C.planSwitch(st, 'Alt Guy'); assert.ok(sw.ok && !sw.same); assert.equal(sw.entry.levels, null); assert.deepEqual(sw.entry.qdone, []);
assert.equal(sw.changes.get("qdone:Cook's Assistant"), null, "Zezima's ticks are removed from the active keys"); assert.equal(sw.changes.get('qprog:abc'), null); assert.equal(sw.changes.get('dch_account_v1'), null);
assert.equal(sw.changes.has('fav:items'), false, 'global data untouched');
// simulate the app committing the import for Alt Guy in the same transaction
sw.changes.set('mystats_v2', lv({Attack: 40})); sw.changes.set('mystats_v2_bak', lv({Attack: 40})); sw.changes.set('qdone:Rune Mysteries', '1'); sw.changes.set('dch_account_v1', acct('Alt Guy', 12));
C.txn(st, sw.changes); C.afterImport(st, 'Alt Guy');
let db = C.load(st); assert.equal(db.list.length, 2); const alt = db.active;
assert.equal(db.list.find(c => c.id === z).levels.Attack, 92, 'unsaved manual edit on the first character was kept by the switch');
assert.deepEqual(db.list.find(c => c.id === z).qdone, ["Cook's Assistant"]);
assert.equal(st.getItem("qdone:Cook's Assistant"), null); assert.equal(st.getItem('qdone:Rune Mysteries'), '1'); assert.equal(st.getItem('fav:items'), '[1,2]'); assert.equal(st.getItem('dch-welcome'), '1');
// same account import = existing behaviour (no switch)
assert.equal(C.planSwitch(st, 'alt guy').same, true);
// 3. switching back restores exactly, offline; quests not unioned
st.setItem('mystats_v2', lv({Attack: 41})); r = C.select(st, z); assert.ok(r.ok);
assert.equal(JSON.parse(st.getItem('mystats_v2')).levels.Attack, 92); assert.equal(st.getItem("qdone:Cook's Assistant"), '1'); assert.equal(st.getItem('qdone:Rune Mysteries'), null); assert.equal(st.getItem('qprog:abc'), '["s1"]');
assert.equal(JSON.parse(st.getItem('dch_account_v1')).qp, 469);
r = C.select(st, alt); assert.equal(JSON.parse(st.getItem('mystats_v2')).levels.Attack, 41, 'manual edit on Alt kept'); assert.equal(st.getItem("qdone:Cook's Assistant"), null); assert.equal(JSON.parse(st.getItem('dch_account_v1')).qp, 12);
// 4. reload: a fresh load of the same storage gives the same picture
const st2 = new St(st.dump()); assert.deepEqual(C.load(st2), C.load(st)); assert.equal(C.token(st2), C.token(st));
// 5. storage full during a switch: every key is put back, nothing half-written
let full = new St(st.dump(), Infinity, 3); const snap = full.dump();   // storage refuses the 4th write of the switch
r = C.select(full, z); assert.equal(r.ok, false); assert.equal(r.error, 'storage'); assert.deepEqual(full.dump(), snap, 'rolled back exactly');
full = new St(st.dump(), Infinity, 0); r = C.save(full, 'New One Long'); assert.equal(r.ok, false); assert.deepEqual(full.dump(), snap);
// 6. race: token changes when the character changes, so a late import answer is refused by the app
const t0 = C.token(st); C.select(st, z); assert.notEqual(C.token(st), t0);
// 7. a never-imported manual character importing its own name is upgraded in place (no blank copy); another saved name switches
let m = new St({mystats_v2: lv({Attack: 50}), 'qdone:X': '1'}); assert.equal(C.planSwitch(m, 'Mainy').same, true);
C.save(m, 'Main'); assert.equal(C.planSwitch(m, 'Mainy').same, true, 'manual Main upgraded by its first import');
// unsaved data is adopted (saved as a character) before any switch, never dropped
m = new St({mystats_v2: lv({Attack: 33}), dch_account_v1: acct('Foo', 1), 'qdone:Y': '1'}); const other = new St(); C.save(other, 'Bar');
m.setItem(C.KEY, other.getItem(C.KEY)); db = C.load(m); db.active = null; m.setItem(C.KEY, JSON.stringify(db));
r = C.select(m, db.list[0].id); assert.ok(r.ok); db = C.load(m); const foo = db.list.find(c => c.name === 'Foo'); assert.ok(foo, 'unsaved Foo saved first'); assert.equal(foo.levels.Attack, 33); assert.deepEqual(foo.qdone, ['Y']);
// names: invalid refused, cap of 20
assert.equal(C.save(new St(), '<b>x</b>').error, 'invalid_name');
const cap = new St(); for (let i = 0; i < 20; i++) assert.ok(C.save(cap, 'Alt ' + i).ok); assert.equal(C.save(cap, 'Alt 99').error, 'full'); assert.ok(C.save(cap, 'ALT 3').ok, 'updating an existing one still works when full');
// corrupt saved list: ignored, never crashes, active data untouched
const bad = new St({[C.KEY]: '{oops', mystats_v2: lv({Attack: 5})}); assert.deepEqual(C.load(bad).list, []);
// app + page wiring
const base = path.resolve(__dirname, '..'), app = fs.readFileSync(path.join(base, 'app.js'), 'utf8'), html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
assert.match(html, /<script src="player-import\.js"><\/script>\n<script src="chars\.js"><\/script>\n<script src="app\.js"><\/script>/);
assert.match(html, /<button data-tab="char">.*<\/i>My Characters<\/button>/, 'tab renamed, #char route kept');
assert.match(app, /if \(DCHChars\.token\(localStorage\) !== tok\) return say\('You switched character while the lookup was running\. Nothing was changed; import again\.'\);/);
assert.match(app, /const sw = DCHChars\.planSwitch\(localStorage, p0\.name\);/); assert.match(app, /try \{ DCHChars\.txn\(localStorage, ch\); \} catch \(e\) \{ return say\('This browser would not save the import\. Nothing was changed\.'\); \}/);
assert.ok(!/removeItem\(QDONE/.test(app.slice(app.indexOf('async function acctImport'), app.indexOf('function charPicker'))), 'import never unticks');
console.log('PASS My Characters: no-write migration, save/update same name, two accounts isolated (levels, quests, QP), manual edits kept on switch, offline restore, reload, quota rollback, race token, adopt unsaved, cap 20, corrupt list ignored');
