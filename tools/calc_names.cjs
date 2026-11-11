// Names the native Herblore engine actually shows (rows across all categories and the main option families), for tools/calc_images.py.
const fs = require('node:fs'), path = require('node:path');
const base = path.resolve(__dirname, '..'), J = f => JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
const C = require('../calculators.js');
const H = J('data/calc/herblore.json'), DEF = J('tests/herblore-defaults.json');
const variants = [{}, {raw_material_replacement_mode: 'Most ingredients', herb_potion_from: 'Grimy herbs', step_mode: 'Quantity'},
  {raw_material_replacement_mode: 'Potions and herbs', herb_potion_from: 'Unfinished potions'}, {raw_material_replacement_mode: 'Potions and herbs', herb_potion_from: 'Clean herbs'},
  {raw_material_replacement_mode: 'Potions and herbs', herb_potion_from: 'Tradable potions'}, {raw_material_replacement_mode: 'Most ingredients', use_ingredient_set: 'Replace'},
  ...['1', '2', '3', '4', '6'].flatMap(d => [{product_decant_type: 'Fixed', product_decant_dose_fixed: d}, {material_decant_type: 'Fixed', material_decant_dose_fixed: d}]),
  {product_decant_type: 'Profitable'}, {material_decant_type: 'Profitable'}];
const out = new Set();
for (const v of variants) for (const r of C.herbloreRun(H, {...DEF, category_choice: 'All', ...v}, () => 100).rows)
  for (const n of [r.item_name, ...r.mats.map(m => m.name), ...r.products.map(p => p.name), ...(r.steps || []).map(s => s.name)]) out.add(n);
process.stdout.write(JSON.stringify([...out].sort()));
