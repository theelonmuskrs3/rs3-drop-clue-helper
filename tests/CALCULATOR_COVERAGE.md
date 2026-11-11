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
| All other 181 pages | — | Wiki only | — |

Flask decanting covers the whole Wiki calculator: every row and all four decanting options. The Wiki page has no further
modes. As on the Wiki, leftover empty vials are not counted.

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
1. Six skill calculators: Herblore, Cooking, Fletching, Crafting, Firemaking and Runecrafting. These need the shared engine plus the Herblore engine.
2. The remaining 12 shared-engine skills, then Archaeology.
3. Static GE-price tables, then form calculators, then the rest, each verified separately.
