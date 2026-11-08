# Browser validation required before release

Production-safe isolated preview (do NOT reuse earlier browser tabs):
http://127.0.0.1:8780/index.html?rev=0671ead84eacc6e7#money/making-portents-of-restoration-x

Start/restart with `python3 tools/ge_preview.py --port 8780` from this checkout.
The server prints a content fingerprint and sends `Cache-Control: no-store` and
`X-DCH-Preview-Build` on every response. It ignores conditional cache requests,
rejects sw.js, and binds only to loopback. Production app.js has NO preview
bypass: normal SW registration is attempted and harmlessly rejected by this
review-only server. Production release/update behavior remains enabled.
A NEW port is essential for isolation: this server does not unregister an
existing controller. No origin's localStorage, profiles or caches are cleared.
Use another unused port if this one had a previous service worker.
Preview server/tools/tests are excluded from update manifests and Windows bundles.

The prior browser report matches the pre-shared-price application: the old code
has `Estimated from this app's GE prices` and can show identical wiki/app snapshot
values. Full current-app DOM tests render Buy/Sell and a shared-source banner even
when prices are missing. The existing SW is network-first with `cache:no-store`;
an unchanged precache/update version alone DOES NOT force old successful online
responses. Its network-failure fallback CAN return the old cached script (covered
by regression). An already-open document also never reloads merely because its
JS file changed on disk. Without inspecting that browser session, which of those
caused the old document cannot be established. Do not claim a price-wiring bug
or a confirmed SW cache cause from that screenshot alone.
Use 320, 390, 800 and 1280 px widths. This checklist is not a claim of passing GUI tests.

1. Items → G.E. (`#items/~ge`): source search → item → actual source graphs.
   The iframe behavior is unchanged by shared price work. Do not proxy around restrictions.
2. `#items/Chronotes`: compare observed Buy/Sell and each trade timestamp to
   https://prices.runescape.wiki/rs/item/49430. Fresh observations show Buy/high, Sell/low and individual “Observed … ET” timestamps. A separate Guide snapshot remains visible and the exact-ID “Source prices & graph” opens the wiki graph (no invented chart). Fresh observations are timestamped;
   stale observations must say stale, not masquerade as a current guide price.
3. `#items/Dark%20Facet%20of%20Grace`: illiquid observations may be old. The
   separately dated guide snapshot must not be used for a fresh live quote.
4. Items list: observed Sell sort in both directions. Unknown/stale quotes last.
   Obtainable worth-money mode requires a fresh Sell quote. Discontinued quote
   filter explicitly means fresh Sell quote; offline guide snapshots stay labeled.
5. Character: change a skill and confirm the original green-check Saved cell,
   local retention after refresh, requirements and tier/stat picks still work.
   Gear price sorts use Buy, and totals say incomplete if any piece has no fresh quote.
6. Item Sets: cached sets reprice on source updates; any unavailable piece means
   incomplete total, not a zero-valued piece. Requirements and icons unchanged.
7. `#train/Herblore`: item acquisition Buy quotes update. Costs/XP prose and
   Cheap/Profitable filters explicitly remain wiki snapshots: no unverified recipe
   quantity/yield is inferred. XP planner must still work and not change saved skills.
8. `#money`: default fresh net estimate sort, then minimum-profit filter. Only
   complete parsed methods with fresh source quotes pass. Open e.g.
   `#money/buying-bomb-vials` or `#money/buying-bear-fur`; eligibility can change
   with source freshness. Supplies use Buy/high, outputs Sell/low. Tax/fees and
   unlisted costs are excluded; recurring results are per hour of activity.
   Open a partly parsed/unknown method: no fabricated aggregate/profit, and the
   old wiki figure is explicitly dated/labeled as a snapshot.
9. Leave a Money method expanded and wait one polling interval. Verify sorting
   and numeric estimates refresh without changing search/filter controls or
   collapsing a different method. No user skill field may be rewritten.
10. Offline/hidden/network failure: no further polling while offline/hidden.
    Existing observations must not be ranked as live. Reconnect/resume updates
    using the same shared timer, subject to the 60-second minimum between attempts.
11. DevTools network (if available): initial mapping + bulk latest, thereafter
    one bulk latest at most per minute, no per-item remote requests. Mapping is
    cached up to a day. The full source iframe has its own independent requests.
12. Preserve static hover, poison effect, item/source images, requirements,
    credits, scrolling and 320px layouts. Cross-origin source UI may scroll
    internally; no attempt is made to restyle it.

Non-browser tests:
- `node tests/ge-static.test.cjs`
- `node tests/live-prices.test.cjs`
- `node tests/preview-cache.test.cjs`
- `python3 tests/preview-network.test.py`
- Full app DOM: `npm install --prefix /workspace/ge-dom-tests jsdom@26`, then
  `NODE_PATH=/workspace/ge-dom-tests/node_modules node tests/live-price-dom.test.cjs`.
  This evaluates the entire application against the real local data bundle and a
  deterministic mock bulk source; it is NOT a visual browser test or proof the
  public API is reachable in a real browser. It covers actual Chronotes,
  Herblore, Optimised hide tanner and Amascut routes plus high-input/low-output
  calculations, exact graph links, separate guide snapshots and offline/stale UI.
  The two Money examples must NOT show an old identical “app estimate” as live:
  expect a fresh net estimate only when all quotes are fresh, otherwise an
  explicit “Live estimate incomplete / unavailable” with no fabricated total.
  Complete estimates now also show the separate source-fetch timestamp.

Public source fetch from this executor's Shell returned HTTP 403. No bypass was
attempted. Validate browser CORS/API access and actual numeric quotes separately.
320px download text can now wrap within that button; visually recheck clipping.
No GUI/layout pass is claimed here. Existing Python visual checks use browser
automation and were not run through Shell for this task.

Before merge/deploy: regenerate precache/version and launcher update manifests
through the project's existing release workflow, including new live-prices.js.
No bundle release, main push or deployment was performed for this branch.

## Tax/mobile regression (must be browser checked before this follow-up release)
Use the new preview URL provided for this branch, NOT the old :8778 release tab.
At 320, 390, 800 and 1280 px:
- `#money/making-portents-of-restoration-x`: Profit shows separate dated wiki
  snapshot + full-width Live estimate. Six compact numeric rows (Buy supplies,
  Sell gross, Est. 2% tax, Sell net, Profit gross, Profit net). Source fetched time
  below rows occupies full section width, never a skinny left label cell. Incomplete
  freshness still shows an explicit unavailable message rather than net zero.
- `#items/Chronotes` and a liquid item: Sell quote has numeric tax/net only when
  fresh. Buy quote/gear/set acquisition has no buying tax. Exact graph link remains.
- `#train/Herblore`: linked cards wrap naturally; no nested graph anchors; no
  selling tax on Buy acquisition quotes; recipe prose stays snapshot-based.
- Items list / Obtainable / Discontinued / rewards Sell quotes: consistent numeric
  tax/net labels, ordinary word wrapping and original ET freshness.
- Character / item sets: unchanged Buy totals/requirements/Saved and no fictitious
  tax on acquisition. Money sort/minimum labels say NET and use net estimates.
- Verify offline/stale/missing never displays a fabricated tax/net total.
- Recheck stationary hover, poison credit, skills/Saved, images and quest pins.
Cross-origin G.E. embed is unchanged and must not be restyled by our CSS.

## Expanded table/source validation for PR2
At 320/390/800/1280 widths, check Money Supplies/Outputs (Quantity heading and
per-hour/run note), Training Attack/p2p → Common equipment, accessories, and
setups → Instructions (6–8 column wiki equipment tables), Herblore tables, Items
Dragon scimitar drops/sources, Character gear/sets and Quest panels. Tables must
have readable row/card labels, untruncated links/values, no horizontal overflow,
no character-per-line names, retained sort controls, and correct rowspan notes.

G.E. → Fit overview: specifically inspect **Items with highest daily volume**.
All leftmost item-name characters AND rightmost price/volume headings and values
must be present. Measure iframe rect.left >= wrapper.left, rect.right <= wrapper.right
(with 1px tolerance), and wrapper height matching scaled iframe height. Confirm
source search/table/graph controls remain usable. Read the displayed zoom percent
and assess actual text legibility: a mathematical fit does not prove readability.
Toggle Readable size and back; resize all four widths; navigate away/back to check
cleanup. Do NOT pass a clipped left edge, hidden prices, or merely the item graph.
If the 1024px source itself overflows, report it rather than hide its scrollbar or
claim fit. At phone widths scaling may be too small; retain that honest limitation
and get a user decision before replacing their chosen source embed with custom charts.
