# `public`

Files served as they are: `manifest.webmanifest` (the installable app), `404.html` (the site's page for a missing path: a pruned preview build sent to its PR's stable page, anything else to the game; `scripts/AGENTS.md`), `privacy.html` (what cloud saves keep and how to delete it, linked from the save slots screen and given to Google's console as the privacy policy: keep it true to `server/saves`), `icon.svg` (the app icon, which `scripts/pwa.ts` renders to the PNG icons at build time: the repo keeps no binary icon) and `favicon.svg`. Reference them root-absolute from `index.html` (`/favicon.svg`), so Vite rewrites them for the Pages base path.

The rules across the game are the [root AGENTS.md](../AGENTS.md).
