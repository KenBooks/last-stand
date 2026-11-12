# `public`

Files served as they are: `manifest.webmanifest` (the installable app), `404.html` (the site's page for a missing path: a pruned preview build sent to its PR's stable page, anything else to the game; `scripts/AGENTS.md`), `privacy.html` (what cloud saves keep and how to delete it, linked from the save slots screen and given to Google's console as the privacy policy: keep it true to `server/saves`), `icon.svg` (the app icon, which `scripts/pwa.ts` renders to the PNG icons at build time: the repo keeps no binary icon) and `favicon.svg`. Reference them root-absolute from `index.html` (`/favicon.svg`), so Vite rewrites them for the Pages base path.

The rules across the game are the [root AGENTS.md](../AGENTS.md).

- `google-signin.html` is the lightweight Google window callback. It imports no game, contacts no server and never receives a session token or nonce. A per-attempt same-origin channel relays only the return fragment to the original game, which alone redeems its code. Clear the fragment before messaging; retry briefly until acknowledgement, then close. Never bootstrap another game in this page.
