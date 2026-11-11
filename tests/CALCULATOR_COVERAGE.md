# Calculator coverage and porting checklist

The source is the RuneScape Wiki [Calculators](https://runescape.wiki/w/Calculators) directory (rev 37207671, 14 Oct 2026, 2:45 PM ET).
It has 186 entries on 182 distinct pages (`data/calculators.json`), and that list is a dated snapshot.
Wiki pages refuse framing (`X-Frame-Options: DENY`, `frame-ancestors 'none'`), so calculators are either
rebuilt natively here or opened on the Wiki. Wiki text, templates and modules are CC BY-NC-SA 3.0.
Every native port records its page, template and module revisions and gives attribution in the UI.

## Rules for every native port
1. Read the exact Wiki source (page, templates, modules, data) and record its revisions. Never invent formulas.
2. Reproduce the Wiki's own rendered output. Do this with `action=parse` on the page source and the same `Module:GEPrices/data.json`
   revision. The guide prices used go in a test fixture, and every cell must match exactly.
3. Only then swap in live prices through `LIVE.book.estimate`:
   - inputs are bought at Buy/high; outputs are sold at Sell/low;
   - the 2% tax is `floor(price/50)` per sold item, then multiplied by quantity, and Bonds are exempt;
   - gross and net are both shown;
   - missing, stale, offline or unmapped prices make that result *unavailable* and never 0.
4. Pin items by exact GE ID (`Module:GEIDs/data.json`), not by name.
5. Keep every Wiki assumption visible. Options or modes that are not ported are shown as unavailable, not simplified.
6. Register the port in `RS3Calc.NATIVE` with its exact Wiki path. The directory then shows **In app** and favourites
   reopen the native route. Everything else shows "Wiki only — not yet in app".

## Status
| Calculator | Wiki path | Status | Verification |
|---|---|---|---|
| Flask decanting (Herblore) | /w/Calculator:Herblore/Flask_decanting | **Native** `#calculators/flask-decanting` | 86 potions × 4 decanting options: all 344 Wiki-rendered cells reproduced (page rev 37202169, row template rev 37202166, GEPrices rev 37236236). Rebuild with `tools/calc_flask_decanting.py`. |
| Herblore skill calculator | /w/Calculator:Herblore | **Native** `#calculators/herblore` (released PR #4) | JS port of `Module:Skill calc/Herblore` rev 36813069 with data rev 37201040, page rev 37008978, Experience 35948183 / data 35392677, GEIDs 37236241. 39 template renders (2,978 rows) + 15 Wiki form click-sequence renders (1,522 rows) at GEPrices rev 37236236: every row's order, XP, actions, time, colour, steps and line quantities match; costs/profits match on 2,551 template rows, the rest are unavailable by rule (see below). See below. Rebuild with `tools/calc_herblore.py build` / `golden`. |
| Cooking skill calculator | /w/Calculator:Cooking | **Native** `#calculators/cooking` (released 2026.11.11-0044, PR #6) | JS port of the shared `Module:Skill calc` rev 37183472 (bonusGenerator 37061127, eltGenerator 37078757, elts 37076682) with `Module:Skill calc/Cooking/data` rev 37177236, page rev 37078013, form via MediaWiki:Gadget-calc-core.js rev 37082305. 59 template renders + 7 form click sequences (2,899 rows) at GEPrices rev 37236236: all 34,486 compared cells match (row colour, name, level, XP, # needed, # urns, members, raw/product cost, profit, profit/XP, material names and quantities). Rebuild with `tools/calc_cooking.py build` / `golden`. |
| Fletching skill calculator | /w/Calculator:Fletching | **Native** `#calculators/fletching` (draft PR, awaiting browser gates) | Same shared engine port (pins as Cooking) with `Module:Skill calc/Fletching/data` rev 37229972, page rev 37236406; Fletching branches: Dungeoneering XP-boost-first (+1.0), portable fletcher and Fletching workroom bonuses, brooch of the gods (portable only, 20% material saving, raw cost unrounded), product multiplier (× N per action), Dungeoneering - * layouts (Dungeons-Materials, no costs). 28 template renders + 4 form click sequences (1,003 rows) at GEPrices rev 37236236: all 11,756 compared cells match. Rebuild `tools/calc_skill.py Fletching build` / `golden`. Urns and auras/testing/torstol/abyss are refused, not guessed. |
| All other 179 pages | — | Not in the app yet | — |

Running coverage: **3 of 182 pages native** (3 of 186 directory entries "In app"; 183 "Not in the app yet").

Cooking follows the Wiki form exactly: same fields, order, labels, defaults (the invalid default sub-category "Harvest" becomes
the first option "Meat", as the gadget does), the bonus-XP toggle reveals its amount, and results use the Wiki's column order
and names. Wiki quirks are kept, not fixed: Bonfire adds no XP, Portable Range adds 21% in every sub-category (the module never
sets its category), the avatar bonus is not applied to Urns, and urns listed under "All" show no values (the Wiki row stops at
the missing level). Options the shared engine has for other skills (dxp, aura, testing, etc.) are refused with a message, not
guessed. Live prices replace guide prices (Buy high / Sell low, 2% tax per item); untradeable ingredients/products count 0 as
on the Wiki and are flagged "excludes untradeable … (not free)"; missing or stale prices make that row unavailable.

Flask decanting covers the whole Wiki calculator: every row and all four decanting options. The Wiki page has no further
modes. As on the Wiki, leftover empty vials are not counted.

### Herblore (`#calculators/herblore`)
Source: the Lua engine was read and ported line by line, keeping its arithmetic order (0.1 XP ceilings per boost
category, 2 d.p. quantities, `ceil(price × qty)` per line). Data modules were converted to JSON with
`tools/lua_data_sandbox.py` (Lua 5.1 in a child under `unshare -rn`, CPU/memory/no-file rlimits, whitelisted env without
os/io/package/require/debug/load*/string.dump, instruction budget; test `tests/lua-sandbox.test.py`). No Wiki code runs in the app.

Options offered, all exercised by at least one Wiki render (`tests/herblore-cases.json`):
current/target as level or XP; subcategory Single / Multiple / Common potions / Dungeoneering / Outside Daemonheim / All;
Scripture of Bik (flick, always), Inspire, avatar, Wise, Torstol, pulse core, knowledge bomb, perfect juju/plus, Meilyr,
RaF, DXP, additional %, BXP amount + cinder core; botanist's outfit + modified mask, factory outfit; portable well +
brooch, botanist's amulet, Morytania legs 4, desert amulet 4, envenomed, scroll of cleansing; product/material decanting
(fixed dose incl. flask, profitable with restriction); ingredient preparation (Potions and herbs / Most ingredients with
every sub-choice, ingredient sets, cape 99/120); level range and level options, tradability filters.
Display modes (time, steps, material/product display) are presentation only; goldens use the fullest display.

Test inputs and fixtures: `tests/herblore-defaults.json` (the Wiki form's defaults), `tests/herblore-cases.json` and
`tests/herblore-form-cases.json` (inputs and click sequences), `tests/fixtures-herblore-golden.json` (Wiki renders and guide
prices) all derive from RuneScape Wiki content, CC BY-NC-SA 3.0; the fixture and the form cases carry the licence inline.

Wiki form submission semantics (audited, `tools/herblore_form.py`, `tests/herblore-form-cases.json`):
The Wiki form is `{{Form calculator}}` run by `MediaWiki:Gadget-calc-core.js` (rev 37082305). It sends only enabled fields;
a field hidden by its parent toggle is disabled and **omitted**, and the module then uses its own nil default. A section
switched off omits its whole group. The emulator ports that logic and the pinned form; 15 click sequences were rendered by
the Wiki with exactly the gadget's submission. 14 match the app row for row: hidden brooch after the portable well is
turned off, BXP fields after BXP off, mask after outfit None, decant fixed→profitable, raw Most ingredients→Potions and herbs,
XP→level, filter switched back, Multiple mode with Overload variants + Combination potions (duplicated rows, as the Wiki
help says) and with both Daemonheim boxes, every section switched off (= app defaults), and the two spot-check cases.
The 15th is a **Wiki gadget quirk** that the app deliberately does not copy: turning Cost saving off and on re-enables the
hidden Brooch checkbox, so a stale ticked brooch is submitted and cancels "Scripture of Bik: Always activated". The test
proves the Wiki output differs there; the app follows the visible form.
Other form facts: `wisdom` and `desert_pantheon` are `type=hidden` and always submitted as `false` (the app sends the same
defaults); an invalid default (`raw_material_replacement_mode = None`) becomes the first option, "Original only"; the
module never reads the section switches or `raw_material_replacement_mode` itself; Factory outfit is listed in both outfit
and cost-saving groups and belongs to the last (cost saving) on the Wiki, while the app shows it under Outfit pieces with the same effect.

Limits (explicit, not simplified):
* Items the Wiki values with `Module:Calcvalue` or Dungeoneering values, Daemonheim rusty-coin prices, and any item without
  a Grand Exchange ID are **unavailable** in the app, never 0 (the Wiki itself silently uses 0 for a failed GE lookup).
* Items with price method `no` are 0 in the Wiki source (`calprice`: "no = no price provided"). The app keeps 0 so totals
  match the Wiki, but labels each one "untradeable, no market price … not free" and every total including one says
  "excludes untradeable …".
* "Profitable" decanting and "Most profitable primal fruit" use live prices. Products are compared on the profit basis on
  screen: net per dose after the per-item tax (Net) or gross (Gross); ingredients by Buy price; ties keep the Wiki's order.
  If any candidate has no live price, the choice is **undetermined** and that recipe's totals are unavailable (the Wiki skips
  unpriced doses silently). Live audit 10 Nov 2026, 10:16 PM ET, Outside Daemonheim + profitable product and material
  decanting: 200 of 300 rows undetermined (340 dose variants had no trade in the last 15 minutes, 19 none in the feed;
  median last trade 8 h); among determined rows, net and gross bases chose the same doses.
* At Wiki guide prices, 13 rows chose a dose by a Calcvalue price and 1 more row has an unpriceable candidate; all 14 show
  totals unavailable.
* Display modes are presentation only; goldens use the fullest display. Tied 3/4-dose row order is unspecified on the Wiki.

## How the remaining pages are built (survey of page sources, 10 Nov 2026)
| How the Wiki builds it | Pages | Plan |
|---|---|---|
| Shared `Module:Skill calc` engine (rev 37183472) + `Module:Skill calc/<Skill>/data` | 17 skills: Agility, Construction, Cooking, Crafting, Divination, Farming, Firemaking, Fishing, Fletching, Hunter, Invention, Magic, Prayer, Runecrafting, Summoning, Thieving, Woodcutting | One engine port that keeps the per-skill branches (outfits, avatar, portable, urns, bonus XP), checked for each skill against Wiki goldens. The data modules are Lua; they are converted in a sandboxed Lua 5.1 that has no io/os/package. |
| `Module:Skill calc/Herblore` (own engine, rev 36813069) | Herblore skill calculator | A separate port. It has decanting, material replacement and many options, so only verified options are enabled. |
| Archaeology own template | 1 | Separate port. |
| Form calculators (`{{Form calculator}}`/`jcConfig` + own template/module) | 82 | One port per calculator. |
| Static GE-price tables (`{{GEP}}` wikitext, like Flask decanting) | 71 | One port per calculator, using the same method as Flask decanting. Usually the quickest to verify. |
| Custom scripts / ordinary articles | 10 | Case by case. |

## Next batches (in order)
1. Skill calculators on the shared engine: Cooking (released), Fletching (draft PR), then Crafting, Firemaking and Runecrafting, each with its own Wiki goldens before it is enabled (`SC_VALIDATED`).
2. The remaining 12 shared-engine skills, then Archaeology.
3. Static GE-price tables, then form calculators, then the rest, each verified separately.
