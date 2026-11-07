# Drop & Clue Helper (unofficial RS3 fan tool), PWA

This is a personal, fan-made tool. It is not affiliated with or endorsed by Jagex. All game content and images belong to Jagex Ltd.
The data and images come from an offline copy of the RuneScape Wiki (runescape.wiki), whose text is licensed CC BY-NC-SA 3.0.

- It is a static app with no backend. Serve the folder over HTTPS, or `http://localhost` for testing, so the service worker can install.
- `build_app.sh` rebuilds data/ and the pictures from `../plugin/drop_clue_helper/*.json`.
  `../plugin/drop_clue_helper/build_all.sh` re-extracts everything from the wiki copy first, then rebuilds the app.
- The service worker is network-first. It is always fresh when online, and on install it caches every file in `precache.json` for full offline use.
- Progress is saved per quest in `localStorage` (`qprog:<id>`, `qdone:<title>`), on each device separately.

## Live G.E. (Items → G.E.)

`#items/~ge` embeds https://prices.runescape.wiki/rs/ on selection only. Search,
prices, graphs and refresh behavior are supplied by RuneScape Wiki Prices,
using trade data supplied by Jagex; this is not Jagex's official GE website.
The embedded site requires internet and is not part of the offline cache.
A permanent external link is provided if embedding fails or is later restricted.
No cross-origin content is proxied or modified. The app's CSP permits framing
only this additional origin; its script/image permissions remain unchanged; the live-value service adds only a connection permission to that same origin.

Static regression: `node tests/ge-static.test.cjs`.
Before release, browser-test the actual source search → item → graphs at
320, 390, 800 and 1280 px; verify offline messaging and unchanged Character
Saved check, hover, item icons/requirements, credits and poison effects.
Do not infer iframe rendering success from its load event.

Release note: this feature branch intentionally does not publish a release or
regenerate launcher bundle/update manifests. Refresh release manifests and
precache version through the existing release process only after browser
validation; the current production release artifacts remain unchanged.

## Shared live monetary values

`live-prices.js` uses the RS3 Wiki Prices bulk `/mapping` and `/latest` APIs.
Exact official mapping names resolve to RS3 IDs; no fuzzy matching, dose/tier
substitution, or OSRS data. One shared timer polls latest at most once per
60 seconds while a monetary view is visible and online; polling pauses when
hidden/offline or no consumer remains. Mapping refreshes at most daily.
A separate sessionStorage cache never counts as live until a successful fetch.
Requests identify the tool using `Api-User-Agent` (its browser CORS preflight
was verified); app levels, quest progress and settings are not sent.

- **Buy/high** is observed instant-buy acquisition cost.
- **Sell/low** is observed instant-sell gross revenue, **before tax/fees**.
- Quote age limit: **15 minutes**; successful-fetch age limit: **2 minutes**.
  These are conservative app policies, not promises about source latency.
- Every quote is timestamped in ET. Old observations and guide snapshots are
  labeled separately and excluded from live sorting/filtering/totals.
- Item lists/details, gear acquisition values/totals, sets, obtainable and
  discontinued views, Training item links, Money line items and reward items
  share the service. No missing item is silently priced at zero.
- Money default ranking/minimum filters use complete fresh **gross** estimates
  only, from structured parsed wiki quantities/yields/rates. Partial/free-form,
  unresolved fixed-value/formula and stale/missing methods remain snapshots or
  incomplete, never fabricated profit. Coins use their exact 1-gp denomination.
  Per-kill quantities require a verified kill rate; recurring estimates are
  per hour of activity, not per hour of waiting.
- Training has item links/cost prose, but no verified structured recipes or
  yields in its cards. Item acquisition quotes update; cost/XP prose and
  Cheap/Profitable hints stay clearly labeled **wiki snapshots**, not live
  total-cost or profit recommendations. Gear best-set picks remain wiki
  tier/stat rules; their acquisition values and price sorts update.
- Shop prices, intrinsic value/alchemy and quoted wiki prose are not GE trade
  quotes and are not blindly rewritten. Unlisted/degradation costs and GE
  tax/fees are explicitly excluded. Liquidity/executability is not guaranteed.

Tests: `node tests/ge-static.test.cjs`, `node tests/live-prices.test.cjs`.
The latter uses deterministic fixtures (not browser automation) for exact
mapping, high/low, null/zero/stale/offline behavior, incomplete estimates,
verified rates, dynamic profit filters and shared polling/cache lifecycle.

Browser release checklist: `tests/LIVE_PRICE_BROWSER_CHECKLIST.md`.
Values/totals beyond JavaScript's safe numeric range are unavailable rather
than displayed with invented precision. The new `live-prices.js` must be included
when release precache/update manifests are regenerated.
