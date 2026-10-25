# Security & privacy — Drop & Clue Helper

Made by Dev. Soy Yoda. Unofficial fan-made RS3 tool (not affiliated with Jagex).

## Your data
- Skill levels, quest ticks and settings are stored **only on the device you use**, in that browser's or window's local storage. They are never uploaded.
- There are no accounts, no cookies, no analytics, no ads and no third-party scripts, fonts or CDNs. The app only requests its own files.
- Every device starts with neutral levels (all 1, Constitution 10). Nobody's levels are shipped in the app.
- Clearing site data or uninstalling erases your saved levels. There is no cloud backup.

## Hardening in place
- Content-Security-Policy (meta tag): `default-src 'self'`, no inline or remote scripts, no framing or form posts, `object-src 'none'`.
- `Referrer-Policy: no-referrer`; links to other sites use `rel="noopener noreferrer"`.
- All data from URLs and storage is validated; text is HTML-escaped before it is shown.
- Windows program: listens on 127.0.0.1 only; refuses requests with a foreign Host/Origin (DNS-rebinding / CSRF); updates come only from this project's GitHub Pages/Releases over HTTPS and every file is checked against a SHA-256 list (and the bundle zip against its SHA-256) before it replaces anything; paths are validated against traversal; (v1.3.2+) external links open in your default browser, only for a fixed list of hosts, and the local server sends anti-framing headers.

## Known limits
- The Windows program is **not code-signed**, so SmartScreen may warn on first run. Only download it from the links on the app's About page / this repository's Releases.
- A static web app cannot hide the data it ships: all quest/monster/item data is public wiki data.
- Styles allow inline `style` attributes (needed for layout); scripts do not allow inline code.
- Anyone who controls this GitHub repository could change the app for everyone, so keep 2-factor authentication on the owner account.

## Reporting
Open a GitHub issue (do not include personal data) or contact Dev. Soy Yoda.
