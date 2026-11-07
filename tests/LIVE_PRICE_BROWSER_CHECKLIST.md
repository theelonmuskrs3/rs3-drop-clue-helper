# Browser validation required before release

Preview: http://127.0.0.1:8766/index.html (served from this feature checkout).
Use 320, 390, 800 and 1280 px widths. This checklist is not a claim of passing GUI tests.

1. Items → G.E. (`#items/~ge`): source search → item → actual source graphs.
   The iframe behavior is unchanged by shared price work. Do not proxy around restrictions.
2. `#items/Chronotes`: compare observed Buy/Sell and each trade timestamp to
   https://prices.runescape.wiki/rs/item/49430. Fresh observations are timestamped;
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
8. `#money`: default fresh gross estimate sort, then minimum-profit filter. Only
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

Non-browser tests: `node tests/ge-static.test.cjs` and
`node tests/live-prices.test.cjs`. Existing Python visual checks use browser
automation and were not run through Shell for this task.

Before merge/deploy: regenerate precache/version and launcher update manifests
through the project's existing release workflow, including new live-prices.js.
No bundle release, main push or deployment was performed for this branch.
