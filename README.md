# Drop & Clue Helper (unofficial RS3 fan tool), PWA

This is a personal, fan-made tool. It is not affiliated with or endorsed by Jagex. All game content and images belong to Jagex Ltd.
The data and images come from an offline copy of the RuneScape Wiki (runescape.wiki), whose text is licensed CC BY-NC-SA 3.0.

- It is a static app with no backend. Serve the folder over HTTPS, or `http://localhost` for testing, so the service worker can install.
- `build_app.sh` rebuilds data/ and the pictures from `../plugin/drop_clue_helper/*.json`.
  `../plugin/drop_clue_helper/build_all.sh` re-extracts everything from the wiki copy first, then rebuilds the app.
- The service worker is network-first. It is always fresh when online, and on install it caches every file in `precache.json` for full offline use.
- Progress is saved per quest in `localStorage` (`qprog:<id>`, `qdone:<title>`), on each device separately.
