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

  /* Native (in-app) calculators: exact Wiki path -> app route. Only calculators whose formulas are verified against Wiki output. */
  const NATIVE = [{slug: 'flask-decanting', path: '/w/Calculator:Herblore/Flask_decanting', data: 'data/calc/flask-decanting.json'},
    {slug: 'herblore', path: '/w/Calculator:Herblore', data: 'data/calc/herblore.json'},
    {slug: 'cooking', path: '/w/Calculator:Cooking', data: 'data/calc/cooking.json'}];
  const nativeFor = path => NATIVE.find(n => n.path === path) || null;
  const nativeBySlug = slug => NATIVE.find(n => n.slug === slug) || null;

  /* Calculator:Herblore/Flask decanting/row (rev 37202166), per column c and row r:
     revenue = flasks x "<flask> (6)"; cost = vials x "<vial> (dose)" + flasks x "Potion flask".
     Leftover empty vials are not counted (as on the Wiki). Returns a structured model for PriceBook.estimate. */
  function flaskModel(D, r, c) {
    const v = r['v' + c.dose];
    return {wf: 'c', inp: [{id: v.id, n: v.n, q: c.vials}, {id: D.flask.id, n: D.flask.n, q: c.flasks}], out: [{id: r.f6.id, n: r.f6.n, q: c.flasks}]};
  }
  /* Same arithmetic with one fixed price per item (Wiki guide prices, no tax): used to check against Wiki output. */
  function guideProfit(model, price) {
    let t = 0;
    for (const l of model.out) { const p = price(l.n); if (p == null) return null; t += p * l.q; }
    for (const l of model.inp) { const p = price(l.n); if (p == null) return null; t -= p * l.q; }
    return t;
  }
  /* ---------------------------------------------------------------------------------------------
     Calculator:Herblore — a line-by-line JavaScript port of the Wiki's own engine
     Module:Skill calc/Herblore (CC BY-NC-SA 3.0; revision in data/calc/herblore.json), run on its data
     module Module:Skill calc/Herblore/data (converted to JSON in a sandbox, tools/lua_data_sandbox.py).
     The port keeps the Wiki's arithmetic order and rounding (ceil to 0.1 XP per boost category, quantities
     rounded to 2 d.p., each item cost rounded up). Pricing is kept apart from quantities:
       herbloreRun(D, args, choicePrice) -> rows with XP, actions, ticks, materials, products, steps;
       herbloreCost(row, linePrice) -> totals, using any price source (Wiki guide prices in tests, live in the app).
     choicePrice(name, method, side) is only used where the Wiki itself picks by price ("Profitable" decanting,
     "Most profitable primal fruit"); like the Wiki, a price of 0 means "no price, skip this option".
  --------------------------------------------------------------------------------------------- */
  const H_ISET_IGNORE = 0, H_ISET_REPLACE = 1, H_ISET_ADD = 2;
  const H_PROFITABLE = {'Any': [1, 4], 'Max. 2': [1, 2], 'Max. 3': [1, 3], 'Min. 2': [2, 4], 'Min. 3': [3, 4], '2 or 3': [2, 3]};
  const hRound = (num, dp) => { const m = 10 ** (dp || 0); return num >= 0 ? Math.floor(num * m + 0.5) / m : Math.ceil(num * m - 0.5) / m; };
  const hCeil = (num, dp) => { const m = 10 ** (dp || 0); return Math.ceil(num * m) / m; };
  const LUA_NUM = /^\s*[-+]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*$/;
  function hToNumber(value, def) {
    if (value == null) return def;
    const s = String(value).toLowerCase();
    if (s === 'none') return def;
    if (!LUA_NUM.test(s)) return def;
    const n = Number(s.trim()); return Number.isFinite(n) ? n : def;
  }
  function hEnabled(value, def) {
    if (value == null) return def == null ? false : def;
    const v = String(value).toLowerCase();
    return v === 'true' || v === 'yes' || (v !== 'false' && v !== 'none' && v !== 'no');
  }
  const hClamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
  const hPositive = (value, max) => hClamp(hToNumber(value, 0), 0, max);
  const hSize = t => t == null ? 0 : (Array.isArray(t) ? t.length : Object.keys(t).length);
  const hValues = t => t == null ? [] : Array.isArray(t) ? t : Object.values(t);
  const hClone = o => JSON.parse(JSON.stringify(o));
  const hReplaceDose = (name, from, to) => name.replace(new RegExp('\\(' + (from == null ? '\\d+' : String(from)) + '\\)$'), '(' + to + ')');
  const hStripSuffix = name => name.split(' potion').join('');
  const hTradable = item => item.price == null || item.price === 'gemw';
  const hUntradable = item => item.price != null && item.price !== 'gemw';
  const hAffected = (b, cat) => b.affects === 'all' ? true : b.affects === 'specific' ? (b.affected_category || []).includes(cat) : Array.isArray(b.affects) && b.affects.includes(cat);

  function herbloreRun(D, args, choicePrice) {
    const data = D.data, ict = data.item_category_table;
    const conv = data.potion_to_flask.conversion, flaskContainer = data.potion_to_flask.container;
    let gaps = null;   // names whose price was unavailable while the Wiki's own price-based choice was made (reported per row)
    const calprice = (name, method, side) => { method = (method || 'gemw').toLowerCase(); if (method === 'no') return 0; const p = choicePrice(name, method, side); if (p == null) { if (gaps) gaps.add(name); return 0; } return p; };

    const herbsR = c => c === 'juju_herb' || c === 'herb' || c === 'daemonheim_herb';
    const unfR = c => c === 'juju_unfinished' || c === 'unfinished' || herbsR(c);
    const stdR = c => c === 'standard' || unfR(c);
    const tradR = (c, r) => hTradable(r) || stdR(c);
    const untradR = (c, r) => hUntradable(r) || tradR(c, r);
    const LEVEL_OPTS = {'None': () => false, 'Herbs': unfR, 'Unfinished': unfR, 'Standard potions': stdR, 'Tradable': tradR, 'Untradable': untradR, 'Every recipe': () => true};
    function parseLevelRestriction(isRaw) {
      const rf = args.recipe_level_filter || 'Original recipe', inf = args.ingredient_level_filter || 'None';
      const from = hToNumber(args.recipe_level_start, 1), to = hToNumber(args.recipe_level_end, 120);
      if (isRaw) { if (rf === 'Ingredients' || rf === 'Both') return {option: LEVEL_OPTS[inf], from, to}; }
      else if (rf === 'Original recipe' || rf === 'Both') return {option: LEVEL_OPTS['Every recipe'], from, to};
      return {option: LEVEL_OPTS['None'], from, to};
    }
    function productFilter(cat) {
      if (cat === 'daemonheim' || cat === 'daemonheim_herb') return () => true;
      const t = args.recipe_product_tradability;
      return t === 'Tradable' ? hTradable : t === 'Untradable' ? hUntradable : () => true;
    }
    function materialFilter(cat) {
      if (cat === 'daemonheim' || cat === 'daemonheim_herb') return () => true;
      const t = args.recipe_material_tradability;
      if (t === 'All tradable') return m => m.every(hTradable);
      if (t === 'Some tradable') return m => m.some(hTradable);
      if (t === 'All untradable') return m => m.every(hUntradable);
      return () => true;
    }
    const useIngredientSet = () => args.use_ingredient_set === 'Replace' ? H_ISET_REPLACE : args.use_ingredient_set === 'Add' ? H_ISET_ADD : H_ISET_IGNORE;
    const getVials = (qty, cat) => { const c = data.containers[cat || 'standard']; return {name: c, alias: c, qty: Math.abs(qty), price_name: c, price: 'gemw'}; };

    function profitableDose(recipe, minDose, maxDose, dir) {
      const method = recipe.price; if (method === 'no') return null;
      const side = dir === 'highest' ? 'sell' : 'buy';
      let chosenPrice = dir === 'highest' ? 0 : Infinity; const better = dir === 'highest' ? (a, b) => a > b : (a, b) => a < b;
      let chosenDose = 0;
      if (recipe.flaskable && maxDose === 6) { const c = conv[recipe.alias]; const fp = calprice(c.name, c.price, side); if (fp > 0) { chosenPrice = fp / 6; chosenDose = 6; } }
      if (minDose < 1) minDose = 1; if (maxDose > 4) maxDose = 4;
      const rpn = recipe.price_name != null ? recipe.price_name : recipe.name;
      for (let dose = minDose; dose <= maxDose; dose++) {
        const pn = recipe.four_dose != null && dose === 4 ? recipe.four_dose : hReplaceDose(rpn, recipe.dose, dose);
        const price = calprice(pn, method, side);
        if (price > 0) { const ppd = price / dose; if (better(ppd, chosenPrice)) { chosenPrice = ppd; chosenDose = dose; } }
      }
      return chosenDose;
    }
    function decantPotion(recipe, cat, q, opts, materials, products, flags) {
      if (!recipe.decantable || !opts) return null;
      let dose;
      if (opts.type === 'fixed') dose = opts.dose;
      else if (opts.type === 'highest' || opts.type === 'lowest') { gaps = new Set(); dose = profitableDose(recipe, opts.min, opts.max, opts.type); if (flags) for (const g of gaps) if (!flags.includes(g)) flags.push(g); gaps = null; }
      if (dose == null) return null;
      if (recipe.flaskable && dose === 6) {
        const c = conv[recipe.alias]; if (c == null) return null;
        const pq = q.total_dose / 6, vials = getVials(q.total_vial, cat);
        if (opts.direction === 'to') { materials.push({name: flaskContainer.name, alias: flaskContainer.alias, qty: pq, price_name: flaskContainer.name, price: flaskContainer.price}); products.push(vials); }
        else materials.push(vials);
        return {name: c.name, alias: c.alias, qty: pq, price_name: c.name, price: c.price};
      }
      if (dose > 4 || dose < 1) return null;
      const pq = q.total_dose / dose;
      const main = {price: recipe.price, qty: pq, alias: recipe.alias};
      if (recipe.four_dose != null && dose === 4) { main.name = recipe.four_dose; main.price_name = recipe.four_dose; }
      else {
        const ppn = recipe.price_name != null ? recipe.price_name : recipe.name;
        if (dose !== recipe.dose) { main.name = hReplaceDose(recipe.name, recipe.dose, dose); main.price_name = hReplaceDose(ppn, recipe.dose, dose); }
        else { main.name = recipe.name; main.price_name = ppn; }
      }
      const diff = q.total_vial - pq, vials = getVials(diff, cat);
      if (opts.direction === 'to') { if (diff > 0) products.push(vials); else if (diff < 0) materials.push(vials); }
      else { if (diff > 0) materials.push(vials); else if (diff < 0) products.push(vials); }
      return main;
    }
    function decantPerMaterial(mat, opts, materials, products, flags) {
      if (mat.alias == null) return null;
      const cat = ict[mat.alias]; if (cat == null) return null;
      const cd = data[cat]; if (cd == null) return null;
      let recipe = cd[mat.alias]; if (recipe == null) return null;
      const dose = recipe.dose; if (dose == null) return null;
      recipe = Object.assign({}, recipe); recipe.price = mat.price;
      return decantPotion(recipe, cat, {total_dose: mat.qty * dose, total_vial: mat.qty}, opts, materials, products, flags);
    }
    function decantInMaterials(md, materials, products, flags) {
      if (!md) return;
      for (let i = 0; i < materials.length; i++) { const r = decantPerMaterial(materials[i], md, materials, products, flags); if (r != null) materials[i] = r; }
    }

    function parseXpBoost(cat) {
      let c1 = 1;
      if (hEnabled(args.portable) && hAffected(data.portable_xp, cat)) c1 *= (1 + data.portable_xp.b);
      let pj;
      const pjt = args.perfect_juju;
      if (pjt != null && pjt !== 'None') { const P = data.perfect_juju_herblore; if (hAffected(P, cat)) { c1 *= (1 + P.b); pj = P.consumable[pjt]; } }
      if (hEnabled(args.meilyr_hour) && hAffected(data.meilyr_hour, cat)) c1 *= (1 + data.meilyr_hour.b);
      let c2 = 1;
      if (hEnabled(args.premier_artefact) && hAffected(data.premier_artefact, cat)) c2 += data.premier_artefact.b;
      if (hAffected(data.wise, cat)) c2 += data.wise.b[args.wise || 'None'];
      const outfit = hPositive(args.outfit, 5);
      if (outfit > 0 && hAffected(data.outfit, cat)) c2 += data.outfit.b[outfit - 1];
      let bikRate = 0; const bik = args.bik_scripture, BK = data.bik_scripture;
      if (bik != null && bik !== 'None') {
        if (hAffected(BK, cat) && (bik === 'Flicking and switching every minute' || (bik === 'Always activated' && (!hEnabled(args.brooch) || (hEnabled(args.brooch) && !hAffected(data.brooch, cat)))))) {
          c2 += BK.b[bik]; bikRate = BK.consumable.rate[bik];
        }
      }
      if (hEnabled(args.inspire) && hAffected(data.inspire, cat)) c2 += data.inspire.b;
      if (hEnabled(args.wisdom) && hAffected(data.wisdom, cat)) c2 *= (1 + data.wisdom.b);
      if (hEnabled(args.raf) && hAffected(data.raf, cat)) c2 *= (1 + data.raf.b);
      const pulse = args.pulse_core || 'None';
      if (pulse !== 'None' && hAffected(data.pulse_core, cat)) c2 *= (1 + (data.pulse_core.b[pulse] || 0));
      const add = hPositive(args.add_xp_boost, Infinity) / 100;
      if (add > 0) c2 += add;
      let c3 = 1;
      if (hAffected(data.avatar, cat)) c3 += data.avatar.b[args.avatar || 'None'];
      let tl = hPositive(args.torsol, 4);
      if (tl > 0 && hAffected(data.incense_torstol, cat)) c3 *= (1 + data.incense_torstol.b[tl - 1]); else tl = 0;
      let c4 = 0;
      if (hEnabled(args.dxp) && hAffected(data.dxp, cat)) c4 = data.dxp.b;
      else {
        if (hEnabled(args.desert_pantheon) && hAffected(data.desert_pantheon, cat)) c4 += data.desert_pantheon.b;
        const kb = args.knowledge_bomb || 'None';
        if (kb !== 'None' && hAffected(data.knowledge_bomb, cat)) c4 += (data.knowledge_bomb.b[kb] || 0);
      }
      return {stack: [c1, c2, c3, c4], bik_rate: bikRate, perfect_juju: pj, torsol: tl > 0};
    }
    function parseBxp(cat) {
      if (!hEnabled(args.bxp) || !hAffected(data.bxp, cat)) return [0, 0];
      const amount = hPositive(args.bxp_amount, 200000000); if (amount <= 0) return [0, 0];
      let burn = data.bxp.b; const cc = args.cinder_core || 'None';
      if (cc !== 'None' && hAffected(data.cinder_core, cat)) burn += (data.cinder_core.b[cc] || 0);
      return [burn, amount];
    }
    function parseDuplicate(cat) {
      let p = 0, brooch = null;
      if (hEnabled(args.portable) && hAffected(data.portable_extra, cat)) {
        p += data.portable_extra.p;
        if (hEnabled(args.brooch)) {
          const bik = args.bik_scripture;
          if (bik === 'Flicking and switching every minute') brooch = tick => { const ppm = 60 / tick; return data.brooch.p * (ppm - 1) / ppm; };
          else if (bik === 'None') brooch = () => data.brooch.p;
        }
      }
      if (hEnabled(args.modified_mask) && hAffected(data.modified_mask, cat)) p += data.modified_mask.p;
      return {base: p, brooch};
    }
    function parseExtraDose(cat) {
      let base = 0;
      if (hPositive(args.factory, 5) >= 3 && hAffected(data.factory_3, cat)) base += data.factory_3.p;
      const ba = hEnabled(args.botanist_amulet), BA = data.botanist_amulet;
      if (ba && hAffected(BA, cat)) base += BA.p;
      let has = false; const pots = {};
      if (hEnabled(args.desert_4) && hAffected(data.desert_4, cat)) { has = true; let sp = data.desert_4.p; if (ba && hAffected(BA, cat)) sp -= BA.p; for (const x of data.desert_4.potions) pots[x] = sp; }
      if (hEnabled(args.morytania_4) && hAffected(data.morytania_4, cat)) { has = true; for (const x of data.morytania_4.potions) pots[x] = data.morytania_4.p; }
      if (hEnabled(args.envenomed) && hAffected(data.envenomed, cat)) { has = true; for (const x of data.envenomed.potions) pots[x] = data.envenomed.p; }
      return {base, has, potions: pots, botanist: ba};
    }
    const parseSave = cat => hEnabled(args.soc) && hAffected(data.soc, cat) ? data.soc.p : 0;
    const parseCleanBonus = cat => hPositive(args.factory, 5) >= 5 && hAffected(data.factory_5, cat) ? {enabled: true, potions: data.factory_5.b} : {enabled: false};
    const parseDecantDose = a => { const d = hPositive(a, 6); return d === 0 || d === 5 ? null : d; };
    function parseDecantOpts(type, fixed, restriction, ptype, direction) {
      if (type == null) return false;
      type = String(type).toLowerCase();
      if (type === 'fixed') { const d = parseDecantDose(fixed); if (d != null) return {type: 'fixed', dose: d, direction}; }
      else if (type === 'profitable') { const r = H_PROFITABLE[restriction]; return r ? {type: ptype, min: r[0], max: r[1], direction} : {type: ptype, min: 1, max: 4, direction}; }
      return false;
    }
    function optsFor(cat, isRaw) {
      const save = parseSave(cat);
      return {
        product_decant: parseDecantOpts(args.product_decant_type, args.product_decant_dose_fixed, args.product_decant_dose_restriction, 'highest', 'to'),
        material_decant: parseDecantOpts(args.material_decant_type, args.material_decant_dose_fixed, args.material_decant_dose_restriction, 'lowest', 'from'),
        cape120: hEnabled(args.cape120), level: parseLevelRestriction(isRaw), iset: useIngredientSet(),
        xp_boost: parseXpBoost(cat), duplicate: parseDuplicate(cat), extra_dose: parseExtraDose(cat),
        save_ingredient: save, save_tick: save, clean_bonus: parseCleanBonus(cat),
        instant_clean: hEnabled(args.cape99) && hAffected(data.cape99, cat),
        product_filter: productFilter(cat), material_filter: materialFilter(cat),
      };
    }

    function processRecipe(recipe, opts, idx) {
      const c120 = recipe.cape120_required;
      if (c120 && !opts.cape120) return null;
      const iset = recipe.ingredient_set;
      if (iset != null && ((iset && opts.iset === H_ISET_IGNORE) || (!iset && opts.iset === H_ISET_REPLACE))) return null;
      const alias = recipe.alias, cat = ict[alias];
      const lr = opts.level;
      if ((recipe.level < lr.from || recipe.level > lr.to) && lr.option(cat, recipe)) return null;
      if (!opts.product_filter(recipe)) return null;
      const mats = recipe.mats; if (mats == null) return null;
      if (!opts.material_filter(mats)) return null;
      let xp = recipe.xp; if (xp == null) return null;
      const name = recipe.name; let multiplier = recipe.multiplier || 1;
      let tick = recipe.tick;
      if (recipe.soc_quicker == null || recipe.soc_quicker) tick = tick - opts.save_tick;
      if (opts.clean_bonus.enabled) { const b = opts.clean_bonus.potions[name]; if (b != null) xp = xp + b; }
      const xb = opts.xp_boost;
      if (opts.instant_clean) { xp = 0; tick = 1; multiplier = 28; }
      let saved = 1;
      if (opts.save_ingredient > 0) { const sec = hSize(mats) - 1; if (sec > 0) saved = 1 - (opts.save_ingredient / sec); }
      const materials = [];
      mats.forEach((m, i) => {
        const qty = opts.instant_clean ? 28 : (i > 0 && m.soc !== 'no') ? m.qty * saved : m.qty;
        materials.push({name: m.name, alias: m.alias, qty, price_name: m.price_name != null ? m.price_name : m.name, price: m.price});
      });
      const rate = data.mix_potion_rate_base / tick;
      if (xb.torsol) { const c = data.incense_torstol.consumable; materials.push({name: c.name, alias: c.alias, qty: c.rate / rate, price_name: c.name, price: c.price}); }
      if (xb.perfect_juju != null) { const c = xb.perfect_juju; materials.push({name: c.name, alias: c.alias, qty: c.rate / rate, price_name: c.name, price: c.price}); }
      if (xb.bik_rate > 0) { const c = data.bik_scripture.consumable; materials.push({name: c.name, alias: c.alias, qty: xb.bik_rate / rate, price_name: c.name, price: c.price}); }
      const content = {item_name: name, item_alias: alias, item_multi: multiplier, improved: recipe.improved, method: recipe.method, level: recipe.level, rusty: recipe.rusty,
        xp_base: xp, xp_boost: xb.stack, recipe_idx: idx, category: cat, material_decant: opts.material_decant, tick, mats: materials, products: [], choice_gaps: []};
      if (recipe.has_product != null && !recipe.has_product) return content;
      const pdose = recipe.dose || 0, ed = opts.extra_dose;
      let edBase = ed.base;
      if (pdose === 3 && !c120) {
        if (ed.has) { const sp = ed.potions[name]; if (sp != null) edBase = edBase + sp; }
        if (ed.botanist) { const c = data.botanist_amulet.consumable; materials.push({name: c.name, alias: c.alias, qty: c.rate, price_name: c.name, price: c.price}); }
      } else edBase = 0;
      let dup = opts.duplicate.base;
      if (opts.duplicate.brooch) dup = dup + opts.duplicate.brooch(tick);
      if (c120) dup = dup / multiplier;
      const curP = (1 - edBase) * (1 + dup), curQ = curP * multiplier;
      const fourP = edBase * (1 + dup); let fourAvail = fourP > 0; const fourQ = fourAvail ? fourP * multiplier : 0;
      const rv = recipe.remaining_vial || {}, rvq = rv.qty || 0;
      const products = content.products;
      let main = decantPotion(recipe, cat, {total_dose: curQ * pdose + fourQ * 4, total_vial: curQ + fourQ + rvq}, opts.product_decant, materials, products, content.choice_gaps);
      if (main == null) {
        main = {name, alias, qty: curQ, price_name: recipe.price_name != null ? recipe.price_name : name, price: recipe.price};
        if (rvq > 0) products.push(getVials(rvq, rv.category));
      } else fourAvail = false;
      products.unshift(main);
      if (fourAvail) {
        const fd = recipe.four_dose;
        const pn = fd != null ? fd : hReplaceDose(main.name, 3, 4), ppn = fd != null ? fd : hReplaceDose(main.price_name, 3, 4);
        products.splice(1, 0, {name: pn, alias, qty: fourQ, price_name: ppn, price: recipe.price});
      }
      return content;
    }
    function processItem(out, item, opts) {
      if (item.recipes != null) hValues(item.recipes).forEach((r, i) => { const c = processRecipe(Object.assign(Object.assign({}, item), r), opts, i + 1); if (c != null) out.push(c); });
      else { const c = processRecipe(item, opts, 0); if (c != null) out.push(c); }
      return out;
    }
    function xpAndBxp(base, boost, burn) {
      const bb = hCeil(base * boost[0], 1);
      let x = hCeil(bb * boost[1], 1); x = hCeil(x * boost[2], 1);
      const used = hCeil(x * burn, 1);
      x = x + hCeil(bb * boost[3], 1);
      return [x, used];
    }
    function noXp(c) { c.xp_per_iter = 0; c.xp_with_bxp_per_iter = 0; c.needed_iterations = 0; c.total_xp = 0; }
    function assignXp(c, remaining, per, bxpAmount, bxpPer) {
      const withB = per + bxpPer; c.xp_per_iter = per; c.xp_with_bxp_per_iter = withB;
      if (remaining > 0) {
        let bi = 0; if (bxpPer > 0) bi = Math.floor(bxpAmount / bxpPer);
        const totB = bi * withB;
        if (totB >= remaining) { bi = Math.ceil(remaining / withB); c.needed_iterations = bi; c.total_xp = bi * withB; }
        else { const nb = Math.ceil(Math.max(remaining - totB, 0) / per); c.needed_iterations = nb + bi; c.total_xp = nb * per + totB; }
      } else { c.needed_iterations = 0; c.total_xp = 0; }
    }
    function scaleQty(items, n) { for (const it of items) it.qty = hRound(it.qty * n, 2); }
    function weight(alias, table, def) {
      if (alias != null && table[alias] != null) return table[alias];
      const c = alias == null ? undefined : ict[alias];
      if (c != null && table[c] != null) return table[c];
      return def;
    }
    const itemSorter = (table, max) => (l, r) => {
      const lw = weight(l.alias, table, max), rw = weight(r.alias, table, max);
      if (lw !== rw) return lw - rw;
      const ld = l.dose || 0, rd = r.dose || 0;
      if (ld !== rd) return ld - rd;
      const la = hStripSuffix(l.alias), ra = hStripSuffix(r.alias);
      return la < ra ? -1 : la > ra ? 1 : (l.name < r.name ? -1 : l.name > r.name ? 1 : 0);   // last key: deterministic tie-break (Wiki order is unspecified)
    };
    const stepSorter = (l, r) => {
      const lw = weight(l.alias, data.step_sorting_table, data.step_max_sorting_weighting), rw = weight(r.alias, data.step_sorting_table, data.step_max_sorting_weighting);
      if (lw !== rw) return lw - rw;
      if (l.level !== r.level) return l.level - r.level;
      return l.alias < r.alias ? -1 : l.alias > r.alias ? 1 : 0;
    };
    function mergeSort(items, sorter) {
      const merged = new Map();
      for (const it of items) { const m = merged.get(it.name); if (m) m.qty = m.qty + it.qty; else merged.set(it.name, it); }
      return [...merged.values()].sort(sorter);
    }
    const matSorter = itemSorter(data.material_sorting_table, data.material_max_sorting_weighting);
    const prodSorter = itemSorter(data.product_sorting_table, data.product_max_sorting_weighting);

    // goals
    const XP = D.xp;   // Module:Experience/data, index 0 = level 1
    const xpAt = lvl => (Number.isInteger(lvl) && lvl >= 1 && lvl <= XP.length) ? XP[lvl - 1] : null;
    const levelAt = xp => { if (!(xp >= 0 && xp <= 200000000)) return null; for (let i = 120; i >= 1; i--) if (XP[i - 1] <= xp) return i; return null; };
    const goal = (lvl, xp, toggle, defLvl) => toggle === 'Level' ? (l => [l, xpAt(l)])(hToNumber(lvl, defLvl)) : toggle === 'Experience' ? (x => [levelAt(x), x])(hToNumber(xp, 1)) : [null, null];
    const [currLevel, currXp] = goal(args.curr_level, args.curr_xp, args.curr_toggle, 1);
    const [targetLevel, targetXp] = goal(args.target_level, args.target_xp, args.target_toggle, 1);
    if (currXp == null || targetXp == null || currLevel == null || targetLevel == null) return {error: 'Level must be 1–120 and XP 0–200,000,000.'};
    let remaining = targetXp - currXp; if (remaining < 0) remaining = 0;

    // categories
    let cats = [];
    const ch = args.category_choice;
    if (ch === 'Single' && args.category != null) { const c = data.categories[args.category]; if (c != null) cats = [c]; }
    else if (ch === 'Multiple') { for (const c of Object.values(data.categories)) if (hEnabled(args['categories_' + c])) cats.push(c); }
    else if (ch === 'All') cats = [...data.all_categories_outside_daemonheim, ...data.all_categories_in_daemonheim];
    else { const g = {'Outside Daemonheim': data.all_categories_outside_daemonheim, 'Dungeoneering': data.all_categories_in_daemonheim, 'Common potions': data.common_potions}[ch]; if (g) cats = g; }

    const contents = [], optsByCat = new Map();
    for (const cc of cats) for (const item of hValues(data[cc])) {
      const cat = ict[item.alias];
      let o = optsByCat.get(cat); if (!o) { o = optsFor(cat, false); optsByCat.set(cat, o); }
      processItem(contents, item, o);
    }

    const keepOrig = a => a != null && a !== 'Keep original';
    const rawEnabled = (args.herb_potion_from != null && data.herb_potion_replacement_category_table[args.herb_potion_from] != null) ||
      ['primal_extract_from', 'primal_pulp_from', 'adrenaline_from', 'ground_from', 'water_from', 'coconut_from'].some(k => keepOrig(args[k]));
    const notes = [];
    if (rawEnabled) {
      const rawOpts = new Map();
      const rawOptsFor = item => {
        const mc = ict[item.alias]; let o = rawOpts.get(mc); if (!o) { o = optsFor(mc, true); rawOpts.set(mc, o); }
        const c = Object.assign({}, o);
        c.product_decant = parseDecantOpts('fixed', item.dose, 'to');   // as on the Wiki: no direction is passed here
        return c;
      };
      const src = {};
      if (keepOrig(args.primal_extract_from)) { const p = data.primal[args.primal_extract_from]; src[p.alias] = p; }
      if (keepOrig(args.primal_pulp_from)) {
        const PP = data.primal_pulp, v = args.primal_pulp_from;
        if (v === 'Most yield per primal fruit') { const p = PP['Golden dragonfruit']; src[p.alias] = p; }
        else if (v === 'Most profitable primal fruit') {
          let low = Infinity, best = null;
          gaps = new Set();
          for (const p of hValues(PP)) { const f = p.mats[0]; const cost = calprice(f.name, f.price, 'buy') * f.qty / p.multiplier; if (cost < low) { low = cost; best = p; } }
          src[best.alias] = best; notes.push({pulp: best.name, fruit: best.mats[0].name, unpriced: [...gaps]}); gaps = null;
        } else { const p = PP[v]; src[p.alias] = p; }
      }
      if (keepOrig(args.adrenaline_from)) { const a = data.adrenaline['Adrenaline crystal']; src[a.alias] = a; }
      if (keepOrig(args.ground_from)) { const rs = args.ground_from === 'Manual grinding' ? data.grinding : args.ground_from === 'Telekinetic Grind' ? data.telekinetic_grind : null; for (const r of hValues(rs)) src[r.alias] = r; }
      if (keepOrig(args.water_from)) { const rs = args.water_from === 'Manual filling' ? data.manual_filling : args.water_from === 'Humidify' ? data.humidify : null; for (const r of hValues(rs)) src[r.alias] = r; }
      if (keepOrig(args.coconut_from)) { const c = data.coconut[args.coconut_from]; src[c.alias] = c; }
      const hpf = args.herb_potion_from, hpCache = new Map();
      const hpSource = cat => {
        if (hpCache.has(cat)) return hpCache.get(cat);
        const sel = {}; const t = hpf == null ? null : data.herb_potion_replacement_category_table[hpf]; const cs = t && t[cat];
        if (cs) { const inc = hpf === 'Tradable potions' ? hUntradable : null; for (const sc of hValues(cs)) for (const it of hValues(data[sc])) if (inc == null || inc(it)) sel[it.alias] = it; }
        hpCache.set(cat, sel); return sel;
      };
      for (let ci = 0; ci < contents.length; ci++) {
        const content = contents[ci], hs = hpSource(content.category);
        const lookup = n => hs[n] || src[n];
        if (content.xp_base_boost == null) content.xp_base_boost = [[content.xp_base, content.xp_boost]];
        if (content.steps == null) content.steps = [];
        const mats = content.mats, ridx = content.recipe_idx;
        let mi = 0;
        while (mi < mats.length) {
          const cur = mats[mi], rawItem = lookup(cur.alias);
          if (rawItem == null) { mi++; continue; }
          const raws = processItem([], rawItem, rawOptsFor(rawItem)), n = raws.length;
          let clone = null;
          if (n > 1) clone = hClone(content); else if (n === 0) mi++;
          const curQty = cur.qty;
          raws.forEach((rc, k) => {
            const ratio = curQty / rc.products[0].qty;
            const apply = (c, cm) => {
              const add = rc.mats.map(m => Object.assign({}, m, {qty: m.qty * ratio}));
              c.mats.splice(mi, 1, ...add);
              for (let j = 1; j < rc.products.length; j++) c.products.push(Object.assign({}, rc.products[j], {qty: rc.products[j].qty * ratio}));
              c.xp_base_boost.push([rc.xp_base * ratio, rc.xp_boost]);
              c.steps.push({name: rc.item_name, alias: rc.item_alias, level: rc.level, method: rc.method, tick: rc.tick, qty: curQty});
              c.recipe_idx = ridx + rc.recipe_idx;
              for (const g of rc.choice_gaps) if (!c.choice_gaps.includes(g)) c.choice_gaps.push(g);
            };
            if (k === 0) apply(content);
            else if (n > 1) { const br = k === n - 1 ? clone : hClone(clone); apply(br); contents.push(br); }
          });
        }
      }
    }

    const rows = [];
    for (const c of contents) {
      const [burn, amount] = parseBxp(c.category);
      decantInMaterials(c.material_decant, c.mats, c.products, c.choice_gaps);
      if (!rawEnabled) {
        if (c.xp_base === 0) noXp(c); else { const [per, used] = xpAndBxp(c.xp_base, c.xp_boost, burn); assignXp(c, remaining, per, amount, used); }
      } else {
        let per = 0, used = 0;
        for (const [b, boost] of c.xp_base_boost) { const [x, u] = xpAndBxp(b, boost, burn); per += x; used += u; }
        if (per === 0) noXp(c); else assignXp(c, remaining, per, amount, used);
      }
      c.mats = mergeSort(c.mats, matSorter);
      c.products = mergeSort(c.products, prodSorter);
      if (c.steps) c.steps = mergeSort(c.steps, stepSorter);
      const n = c.needed_iterations === 0 ? 1 : c.needed_iterations;
      scaleQty(c.mats, n); scaleQty(c.products, n);
      let ticks = Math.ceil(c.tick * n);
      if (c.steps) for (const s of c.steps) { s.qty = hRound(s.qty * n, 2); s.tick = Math.ceil(s.tick * n); ticks += s.tick; }
      c.tick = ticks;
      rows.push(c);
    }
    rows.sort((l, r) => l.level !== r.level ? l.level - r.level : l.item_alias !== r.item_alias ? (l.item_alias < r.item_alias ? -1 : 1) : l.recipe_idx - r.recipe_idx);
    const hideProducts = cats.length === 1 && cats[0] === 'burner';
    // "Most profitable primal fruit" chosen while a fruit's price was unknown: every row that uses the chosen pulp/fruit inherits the gap
    for (const n of notes) if (n.pulp && n.unpriced && n.unpriced.length) for (const r of rows)
      if ((r.steps || []).some(x => x.name === n.pulp) || r.mats.some(m => m.name === n.fruit || m.name === n.pulp)) for (const g of n.unpriced) if (!r.choice_gaps.includes(g)) r.choice_gaps.push(g);
    return {rows, remaining, currLevel, currXp, targetLevel, targetXp, categories: cats, hideProducts, rawEnabled, notes, rusty: rows.some(r => r.rusty)};
  }
  /* Totals for one row, exactly as the Wiki adds them up: each item's cost is rounded up (ceil(price x quantity));
     cost/XP and profit/XP are rounded to 2 d.p.; XP used is the total for the goal, or one action's XP when no actions are needed.
     linePrice(line, role) -> number, or null when no usable price exists (the row total is then unavailable, never 0). */
  function herbloreCost(row, linePrice) {
    const sum = (items, role) => { let t = 0; const missing = []; for (const it of items) { const p = linePrice(it, role); if (p == null) { missing.push(it.name); it.cost = null; continue; } it.cost = Math.ceil(p * it.qty); t += it.cost; } return {total: missing.length ? null : Math.ceil(t), missing}; };
    // A Wiki price-based choice (profitable dose, most profitable fruit) made without every candidate's price may not be the
    // Wiki's choice: line costs are still shown, but the totals are unavailable rather than looking complete.
    const undetermined = row.choice_gaps && row.choice_gaps.length ? row.choice_gaps.slice() : null;
    const m0 = sum(row.mats, 'mat'), m = undetermined ? {total: null, missing: m0.missing} : m0, xpUsed = row.total_xp === 0 ? row.xp_per_iter : row.total_xp;
    const out = {undetermined, matTotal: m.total, matMissing: m.missing, costPerXp: m.total != null && xpUsed > 0 ? hRound(m.total / xpUsed, 2) || 0 : null, prodTotal: null, prodMissing: [], profit: null, profitPerXp: null};
    if (row.products.length) {
      const p0 = sum(row.products, 'product'), p = undetermined ? {total: null, missing: p0.missing} : p0; out.prodTotal = p.total; out.prodMissing = p.missing;
      if (p.total != null && m.total != null) { out.profit = p.total - m.total; if (xpUsed > 0) out.profitPerXp = hRound(out.profit / xpUsed, 2) || 0; /* || 0: no negative zero */ }
    }
    return out;
  }

  /* ---------------------------------------------------------------------------------------------
     Shared RuneScape Wiki skill calculator engine — a JavaScript port of the generic Module:Skill calc (noValue) with
     Module:Skill calc/bonusGenerator and the Profit/Loss table of Module:Skill calc/eltGenerator, plus the parts of
     MediaWiki:Gadget-calc-core.js that decide what the Wiki form submits (CC BY-NC-SA 3.0; revisions in the calculator's
     data file, e.g. data/calc/cooking.json). Validated against Wiki renders for Calculator:Cooking only (SC_VALIDATED);
     every branch the Wiki module takes only for other skills or sub-categories is refused with an explicit
     "not supported" error instead of being guessed, so the next calculators (Fletching, Crafting, Firemaking, Runecrafting)
     can be added by porting and validating their branches against Wiki goldens.
       skillFormDefaults(form) / skillFormSet(form, state, name, value) / skillFormSubmission(form, state) -> what the Wiki
         form sends (fields disabled by a toggle are omitted; hidden fields send their default; checks send range values)
       skillCalcRun(D, submission) -> {message parts, rows with XP, actions, urns, ingredient lines, product} (no prices)
       skillCalcCost(row, linePrice) -> the Wiki's per-action and total cost / product / profit arithmetic with any price
         source (Wiki guide prices in tests, live prices in the app); null (never 0) when a needed price is unavailable.
  --------------------------------------------------------------------------------------------- */
  const SC_VALIDATED = ['Cooking'];
  /* Module:Yesno */
  function scYn(arg, def) {
    if (arg == null) return def;
    const a = typeof arg === 'string' ? arg.toLowerCase() : arg;
    if (a === true || a === 'yes' || a === 'y' || a === 'true' || scNum(a) === 1) return true;
    if (a === false || a === 'no' || a === 'n' || a === 'false' || scNum(a) === 0) return false;
    return def;
  }
  /* Lua 5.1 tonumber on a string or number (nil -> null) */
  function scNum(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string' || !LUA_NUM.test(v)) return null;
    const t = v.trim(), neg = /^-/.test(t), b = t.replace(/^[-+]/, '');
    const n = /^0[xX]/.test(b) ? parseInt(b, 16) * (neg ? -1 : 1) : Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const scRound = (num, dp) => { const m = 10 ** (dp || 0); return Math.floor(num * m + 0.5) / m; };   // Module:Number._round
  class SkillCalcError extends Error {}
  const scFail = msg => { throw new SkillCalcError(msg); };
  const scUnsupported = what => scFail('Not supported in the app yet: ' + what + ' (this part of the Wiki engine is not validated here).');
  /* Module:Skill calc/bonusGenerator. Note: the Wiki module never copies data.category into its local `category`, so the
     category checks in 'extra' always see '' (Bonfire never adds XP; Portable Range adds 21% in every sub-category). Ported as is. */
  function scBonus(d) {
    const object = d.object || '', skill = d.skill || '', pieces = d.pieces != null ? d.pieces : 0, item = d.item != null ? d.item : '';
    const category = '', name = d.name || '', setting = d.setting || '', subSetting = d.subSetting || '';
    let bonus = 0;
    if (object === 'outfit') {
      if (skill === 'Firemaking') { if (pieces === 1) bonus = 2 / 100; else if (pieces === 2) bonus = 5 / 100; }
      else if (['Fishing', 'Runecrafting', 'Thieving', 'Woodcutting'].includes(skill)) { if (pieces < 4) bonus = pieces / 100; else if (pieces === 4) bonus = 5 / 100; }
      else { if (pieces < 5) bonus = pieces / 100; else if (pieces === 5) bonus = 6 / 100; }
    } else if (object === 'elite') { if (pieces < 5) bonus = pieces / 100; else if (pieces === 5) bonus = 6 / 100; }
    else if (object === 'portable') bonus = skill === 'Cooking' ? 21 / 100 : skill === 'Firemaking' ? 15 / 100 : 10 / 100;
    else if (object === 'tool') { if (skill === 'Cooking' && item === 'Dwarven army axe') bonus = 3; else if (skill === 'Hunter' && item === 'Enhanced yaktwee stick') bonus = 5 / 100; }
    else if (object === 'abyss') { if (item === 'Yes') bonus = 2.5; else if (item === 'Demonic Skull') bonus = 3.5; }
    else if (object === 'extra') {
      if (!(category === 'Churning' || category === 'Brewing')) {
        if (category === 'Meat' && item === 'Bonfire') bonus = 10 / 100;
        else if (item === 'Portable Range' && !(category === 'Gnome Drinks')) bonus = 21 / 100;
        else if (skill === 'Divination') { if (item === '1') bonus = 10 / 100; }
        else if (skill === 'Mining' && item === '1') bonus = 10 / 100;
      }
    } else if (object === 'custom') { const n = scNum(item); if (n == null) scFail('custom boost is not a number'); bonus = n / 100; }
    else if (object === 'workroom') bonus = 5 / 100;
    else if (object === 'VoiceOfSeren') { bonus = 1; if (setting !== 'Perfect juju' && name === 'Cleansing crystal') bonus = subSetting === 'AvgOverTime' ? 103.3 / 100 : 120 / 100; }
    else if (object === 'aura') { bonus = 1; bonus = {Basic: 101 / 100, Greater: 101.5 / 100, Master: 102 / 100, Supreme: 102.5 / 100}[item] || 1; }
    else if (object === 'altar' || object === 'potion' || object === 'wild' || object === 'age') scUnsupported('bonus "' + object + '"');
    else { const n = scNum(pieces); if (n == null) scFail('bonus "' + object + '" is not a number'); bonus = n / 100; }
    return bonus;
  }
  const scFind = (list, x) => list.includes(x);
  /* Module:Experience level_at_xp / xp_at_level on the 120-level table (elite skills are not supported) */
  function scXpAt(D, level) { const n = scNum(level); return n != null && Number.isInteger(n) && n >= 1 && n <= 120 ? D.xp[n - 1] : null; }
  function scLevelAt(D, xp) {
    const n = scNum(typeof xp === 'string' ? xp.replace(/,/g, '') : xp);
    if (n == null || n < 0 || n > 200000000) return null;
    for (let i = 120; i >= 1; i--) if (D.xp[i - 1] <= n) return i;
    return null;
  }
  function scItems(D, disp) {
    const c = D.cats[disp]; if (!c) return null;
    const items = c.refs ? c.refs.map(([k, i]) => D.cats[k].items[i]) : c.items;
    return {items, sorted: c.order.map(i => items[i])};
  }
  /* Module:GEPHelper._quantity: floor(price x quantity) per line for the first `count` {qty, name} pairs. */
  function scLines(material, count) {
    const out = [];
    for (let i = 0; i < count * 2; i += 2) { const name = material[i + 1]; if (name == null) continue; const q = scNum(material[i]); out.push({name: String(name), qty: q == null ? 1 : q}); }
    return out;
  }
  function scUrnMult(urn) {
    const enh = String(urn.title || '').includes('Urn Enhancer'), exq = String(urn.name || '').includes('Exquisite');
    return enh && exq ? 1.3125 : (enh || exq) ? 1.25 : 1.2;
  }
  function scUrnsNeeded(needed, actionBaseXp, baseXpToFill) { if (!(needed > 0) || !(actionBaseXp > 0) || !(baseXpToFill > 0)) return 0; return Math.floor(needed * actionBaseXp / baseXpToFill); }
  function scUrnUsage(remaining, actionExp, actionBaseXp, baseXpToFill, rewardXp) {
    if (remaining <= 0 || actionExp <= 0) return [0, 0];
    if (actionBaseXp <= 0 || baseXpToFill <= 0 || rewardXp <= 0) { const a = Math.ceil(remaining / actionExp); return [a, scUrnsNeeded(a, actionBaseXp, baseXpToFill)]; }
    const tot = a => a * actionExp + scUrnsNeeded(a, actionBaseXp, baseXpToFill) * rewardXp;
    let low = 0, high = Math.ceil(remaining / actionExp); if (high < 1) high = 1;
    while (tot(high) < remaining) high *= 2;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (tot(mid) >= remaining) high = mid; else low = mid + 1; }
    return [high, scUrnsNeeded(high, actionBaseXp, baseXpToFill)];
  }
  /* Module:Arguments.getArgs as used here: values trimmed, blank values dropped. */
  function scArgs(submission) {
    const a = {};
    for (const [k, v0] of (Array.isArray(submission) ? submission : Object.entries(submission))) { if (v0 == null) continue; const v = String(v0).trim(); if (v !== '') a[k] = v; }
    return a;
  }
  function skillCalcRun(D, submission) {
    try { return scRun(D, scArgs(submission)); }
    catch (e) { if (e instanceof SkillCalcError) return {error: e.message}; throw e; }
  }
  function scRun(D, args) {
    const skill = args.skill, disp = args.disp;
    if (typeof skill !== 'string' || typeof disp !== 'string') scFail('skill and sub-category are required');
    if (!SC_VALIDATED.includes(skill)) scUnsupported('the ' + skill + ' skill calculator');
    for (const k of ['testing', 'dxp', 'torstol', 'elite', 'abyss', 'portable', 'workroom', 'tool', 'wild', 'altar', 'SOCleansing', 'spiritWeaver', 'summoningFocus', 'potion', 'vos', 'aura', 'aot', 'brooch', 'amuletOfOfferings', 'creature', 'equipment'])
      if (args[k] != null) scUnsupported('option "' + k + '"');
    let pct = 0, flat = 0;
    // order of the Wiki module: avatar, then (outside bonusExceptions) extra, outfit, custom
    if (args.avatar != null && disp !== 'Urns') pct += scBonus({skill, object: 'avatar', pieces: scNum(args.avatar)});
    const bonusExceptions = ['Dungeoneering', 'Blast furnace'];
    if (!scFind(bonusExceptions, disp)) {
      if (args.extra != null) pct += scBonus({skill, category: disp, object: 'extra', item: args.extra});
      if (args.outfit != null) { const n = scNum(args.outfit); if (n == null) scFail('outfit pieces is not a number'); pct += scBonus({skill, object: 'outfit', pieces: n}); }
      if (scNum(args.custom) != null) pct += scBonus({skill, category: disp, object: 'custom', item: args.custom});
    }
    // remainingExp
    const cur = scNum(args.current), goal = scNum(args.goal);
    if (cur == null || goal == null) scFail('Current and goal must be numbers (the Wiki module errors).');
    let currLv, currXp, goalLv, goalXp;
    if (args.currToggle === 'Level' && cur <= 120) { currLv = cur; currXp = scXpAt(D, args.current); }
    else { currLv = scLevelAt(D, args.current); currXp = cur; }
    if (args.goalToggle === 'Level' && goal <= 120) { goalLv = goal; goalXp = scXpAt(D, args.goal); }
    else if (args.goalToggle === 'Additional Experience') scUnsupported('goal type "Additional Experience"');
    else { goalLv = scLevelAt(D, args.goal); goalXp = goal; }
    if (currXp == null || goalXp == null || currLv == null || goalLv == null)
      scFail('No such level or XP: levels must be whole numbers from 1 to 120 and XP from 0 to 200,000,000 (the Wiki calculator shows a script error for this input).');
    let bonusXp = 0; if (scYn(args.bxp)) bonusXp = scNum(args.bxpnum) || 0;
    let actual = Math.ceil(goalXp - currXp); if (actual < 0) actual = 0;
    let remaining = actual; if (bonusXp > 0) remaining -= Math.min(remaining / 2, bonusXp);
    if (disp === 'Silverhawk Feathers' || disp === 'Wilderness Agility Course') scUnsupported('sub-category ' + disp);
    const src = scItems(D, disp); if (!src) scFail('Unknown sub-category "' + disp + '" (the Wiki module errors).');
    let elts = D.elts[skill];
    if (disp === 'Urns') elts = D.elts.Urns;
    else if (skill === 'Cooking' && disp === 'Dungeoneering') elts = D.elts['Cooking-Dungeoneering'];
    else if (/Dungeoneering - /.test(disp)) scUnsupported('sub-category ' + disp);
    const allowsUrns = disp !== 'Urns';
    let urn = null;
    if (allowsUrns && args.urn != null && args.urn !== 'None') {
      const enh = scYn(args.urnEnhancer) || false, urns = scItems(D, 'Urns');
      for (const u of (urns ? urns.items : [])) {
        const isEnh = String(u.title || '').includes('Urn Enhancer');
        if (String(u.name).includes(args.urn) && isEnh === enh) { const total = scNum(u.xp) || 0, m = scUrnMult(u), fill = total / m;
          urn = {name: u.name, title: u.title || null, tier: args.urn, isEnhancer: isEnh, totalXp: total, baseXpToFill: fill, rewardXp: total - fill, maxLevel: u.maxLevel, members: u.members === true}; break; }
      }
    }
    let headers = elts.slice(), urnColumn = null;
    if (urn) { const i = headers.indexOf('# needed'); if (i >= 0) { headers.splice(i + 1, 0, '# urns'); urnColumn = i + 1; } }
    const rows = src.sorted.map((v, idx) => {
      const mcount = v.mcount || 1;
      let matLines = [], matPriced = false;
      if (v.material && (v.mtrade !== 0 || (disp === 'Urns' && !v.currency))) { matPriced = true; matLines = scLines(v.material, mcount); }
      let product = null;
      if (v.trade !== 0 && !v.currency) product = {name: v.name, units: 1};
      if (v.multiplier) scUnsupported('product multiplier');
      const brewing = disp === 'Brewing';
      const unitExp = scRound(v.xp * (1 + pct) + flat, 1);
      let needed = 0, urnsNeeded = 0;
      if (unitExp !== 0 && unitExp != null) {
        const lvl = scNum(v.level), canUrn = urn && (v.urns == null || scYn(v.urns) !== false) && urn.maxLevel != null && lvl != null && (urn.maxLevel === -1 || lvl <= urn.maxLevel);
        if (canUrn) [needed, urnsNeeded] = scUrnUsage(remaining, unitExp, v.xp, urn.baseXpToFill, urn.rewardXp);
        else needed = Math.ceil(remaining / unitExp);
      }
      const reqLv = Math.floor(v.level || 1);
      const cls = reqLv > goalLv ? 'red' : reqLv <= currLv ? 'green' : 'yellow';
      // every ingredient the Wiki lists, with whether the Wiki prices it (only the first mcount, and only when mtrade ~= 0)
      const listed = [];
      if (v.material && !v.currency) for (let i = 0; i + 1 < v.material.length; i += 2) listed.push({name: String(v.material[i + 1]), qty: scNum(v.material[i]), priced: matPriced && i / 2 < mcount});
      // alternative-currency rows (eltGenerator expandedList): [qty, currency cost, "image,link" or name, ...]; the shown name is the link part
      if (v.material && v.currency) for (let i = 0; i < v.material.length; i++) if (typeof v.material[i] === 'string') { const parts = v.material[i].split(','); listed.push({name: parts.length > 1 ? parts[1] : parts[0], image: parts[0], qty: scNum(v.material[i - 2]), priced: false}); }
      return {idx, item: v, name: v.name, title: v.title || null, level: v.level == null ? null : scRound(v.level, 0), reqLevel: reqLv, cls,
        baseXp: v.xp, unitExp, needed, urnsNeeded, urnColumn: urnColumn != null, members: v.members === 0 || v.members === true,
        matLines, listed, matPriced, product, brewing, currency: v.currency || null, value: v.value != null ? v.value : null, materialCost: v.materialCost != null ? v.materialCost : null,
        costCols: !(skill === 'Cooking' && disp === 'Dungeoneering'), urnRow: disp === 'Urns',
        // eltGenerator builds {images, links, numbers(T.level), ...}: with no level the Lua list ends at the nil, so the Wiki row shows
        // only the picture and name (urns in "All"). The app shows no values for such rows rather than inventing them.
        truncated: disp !== 'Urns' && v.level == null};
    });
    return {skill, disp, headers, urn, urnColumn, pctBoost: pct, flatBoost: flat, bonusXp, actualRemaining: actual, remaining, currLv, currXp, goalLv, goalXp, rows};
  }
  /* Per-action and total money for one row, in the Wiki's order: raw cost = sum floor(price x qty) over the priced
     ingredients; product = floor(price) per product (x2 for Brewing, which makes two batches); alternative-currency rows use the
     data's own value; totals are per-action x actions; profit/XP = per-action profit / XP each.
     linePrice(name, role) -> number or null (role 'mat' or 'product'). Returns nulls (never 0) for anything that needs an
     unavailable price. */
  function skillCalcCost(row, linePrice) {
    const out = {rawEach: 0, prodEach: 0, missing: [], currency: row.currency};
    if (row.currency) { out.prodEach = row.value; out.rawEach = row.materialCost != null ? row.materialCost : 0; }
    else {
      for (const l of row.matLines) { const p = linePrice(l.name, 'mat'); if (p == null) { out.missing.push(l.name); continue; } out.rawEach += Math.floor(p * l.qty); }
      if (row.product) { const p = linePrice(row.product.name, 'product'); if (p == null) out.missing.push(row.product.name); else out.prodEach = Math.floor(Math.floor(p) * 1 * 1); }
      if (row.brewing) out.prodEach *= 2;
    }
    if (out.missing.length) { out.rawEach = out.prodEach = out.raw = out.prod = out.profit = out.profitPerXp = out.profitEach = null; return out; }
    out.profitEach = out.prodEach - out.rawEach;
    out.raw = out.rawEach * row.needed; out.prod = out.prodEach * row.needed; out.profit = out.profitEach * row.needed;
    out.profitPerXp = row.unitExp !== 0 ? out.profitEach / row.unitExp : null;
    return out;
  }
  /* MediaWiki:Gadget-calc-core.js (rev in data file) form semantics for a parsed jcConfig: initial values, toggles and submitForm. */
  function scToggles(raw, defkey) {
    const t = {}; const parts = String(raw || '').split(/\s*;\s*/);
    if (!(parts.length && parts[0].length)) return t;
    let allkeys = [], allvals = [];
    for (const tog of parts) { const tmp = tog.split(/\s*=\s*/); let keys, val;
      if (tmp.length < 2) { keys = [defkey]; val = tmp[0].split(/\s*,\s*/); } else { keys = tmp[0].split(/\s*,\s*/); val = tmp[1].split(/\s*,\s*/); }
      for (const k of keys) { t[k] = {on: val}; allkeys.push(k); } allvals = allvals.concat(val); }
    allkeys = allkeys.filter((x, i, a) => a.indexOf(x) === i);
    for (const k of allkeys) t[k].off = allvals.filter(v => !t[k].on.includes(v));
    t.__all__ = {off: allvals};
    return t;
  }
  function scFormInit(form) {
    const st = {value: {}, disabled: {}, togs: {}};
    for (const p of form.params) {
      st.disabled[p.name] = false;
      if (p.type === 'select') { const opts = p.range.split(/\s*,\s*/); const v = opts.includes(p.def) ? p.def : opts[0]; st.value[p.name] = v; st.togs[p.name] = scToggles(p.rawtogs, v); }
      else if (p.type === 'check') { const r = p.range ? p.range.split(/\s*,\s*/) : null; st.value[p.name] = p.def === 'true' || (r != null && p.def === r[0]); st.togs[p.name] = scToggles(p.rawtogs, 'true'); }
      else if (p.type === 'int') { st.value[p.name] = p.def || '0'; st.togs[p.name] = scToggles(p.rawtogs, 'not0'); }
      else if (p.type === 'hs' || p.type === 'hidden') st.value[p.name] = p.def;
      else scUnsupported('form field type "' + p.type + '"');
    }
    for (const p of form.params) if (st.togs[p.name] && Object.keys(st.togs[p.name]).length) scApplyToggle(form, st, scTogKey(p, st.value[p.name]), st.togs[p.name]);
    return st;
  }
  const scTogKey = (p, v) => p.type === 'check' ? (v ? 'true' : 'false') : String(v);
  function scApplyToggle(form, st, item, togs) {
    const set = (w, show) => { if (w in st.disabled) st.disabled[w] = !show; };
    if (togs[item]) { for (const w of togs[item].on) set(w, true); for (const w of togs[item].off) set(w, false); }
    else if (togs.not0 && !isNaN(parseFloat(item)) && parseFloat(item) !== 0) { for (const w of togs.not0.on) set(w, true); for (const w of togs.not0.off) set(w, false); }
    else if (togs.__all__) for (const w of togs.__all__.off) set(w, false);
  }
  function skillFormDefaults(form) { return scFormInit(form); }
  /* A user changing one visible control: validates against the Wiki widget and fires its toggles. */
  function skillFormSet(form, st, name, value) {
    const p = form.params.find(x => x.name === name); if (!p) scFail('no such field ' + name);
    if (st.disabled[name]) scFail('control is hidden on the Wiki form: ' + name);
    if (p.type === 'check') value = value === true || value === 'true';
    else if (p.type === 'select' && !p.range.split(/\s*,\s*/).includes(value)) scFail('not an option of ' + name + ': ' + value);
    else value = String(value);
    st.value[name] = value;
    if (st.togs[name] && Object.keys(st.togs[name]).length) scApplyToggle(form, st, scTogKey(p, value), st.togs[name]);
    return st;
  }
  /* The int widget's own check: a whole number within the field's range (no range: 0 or more). Returns error text or null. */
  function skillFieldError(p, raw) {
    if (p.type !== 'int') return null;
    const s = String(raw).split(',').join('');
    const [lo, hi] = (() => { const m = /^(\d+)\s*-\s*(\d+)$/.exec(p.range.split(/\s*,\s*/)[0] || ''); return m ? [Number(m[1]), Number(m[2])] : [0, Infinity]; })();
    const n = +s;
    if (s.trim() === '' || !Number.isFinite(n) || !Number.isInteger(n) || n < lo || n > hi) return 'Invalid integer provided. Must be between ' + lo + ' and ' + (hi === Infinity ? 'Infinity' : hi);
    return null;
  }
  function skillFormSubmission(form, st) {
    const out = [], errors = [];
    for (const p of form.params) {
      if (!(p.type === 'hidden' || !st.disabled[p.name])) continue;
      let v;
      if (p.type === 'hidden') v = p.def;
      else if (p.type === 'check') { v = st.value[p.name]; if (p.range) v = p.range.split(',')[v ? 0 : 1]; else v = String(v); }
      else if (p.type === 'int') { v = String(st.value[p.name]).split(',').join(''); const e = skillFieldError(p, st.value[p.name]); if (e) errors.push(p.label + ': ' + e); }
      else v = String(st.value[p.name]);
      out.push([p.name, v]);
    }
    return {submission: out, errors};
  }
  const api = {NATIVE, nativeFor, nativeBySlug, flaskModel, guideProfit, herbloreRun, herbloreCost, skillCalcRun, skillCalcCost, skillFormDefaults, skillFormSet, skillFormSubmission, skillFieldError, SC_VALIDATED, FAV_KEY, ORIGIN, MAX_FAVS, safeWikiPath, wikiUrl, parseCalculatorUrl, load, save, toggle, has};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RS3Calc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
