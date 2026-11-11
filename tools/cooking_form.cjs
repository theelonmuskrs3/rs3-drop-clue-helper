// Emit the Wiki-form submissions for tests/cooking-form-cases.json using the app's port of MediaWiki:Gadget-calc-core.js.
const fs = require('node:fs'), path = require('node:path'); const C = require('../calculators.js');
const base = path.resolve(__dirname, '..'), D = JSON.parse(fs.readFileSync(path.join(base, 'data/calc/cooking.json'), 'utf8'));
const F = JSON.parse(fs.readFileSync(path.join(base, 'tests/cooking-form-cases.json'), 'utf8'));
process.stdout.write(JSON.stringify(F.cases.map(c => { let st = C.skillFormDefaults(D.form); for (const [n, v] of c.actions) st = C.skillFormSet(D.form, st, n, v); return C.skillFormSubmission(D.form, st); })));
