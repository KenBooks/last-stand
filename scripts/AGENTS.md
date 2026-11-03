# `scripts`

The build's and the workflow's scripts.

The rules across the game are the [root AGENTS.md](../AGENTS.md).

- `pwa.ts`: the Vite plugin for the installable, offline game (production builds only).
- `check-pages-build.mjs`: `npm run check:pages`, after a build: every asset path in `dist/index.html` must work under the Pages base path (a preview's too).
- `preview/`: what `.github/workflows/pr-preview.yml` does at each step, tested (`npm run preview:test`; its own AGENTS.md).
- `issue.sh` and `commit.sh`: the fork workflow (a prompt starting `new issue:`, the root's Workflow).

## Gotchas

- **Installable, offline (PWA):** `public/manifest.webmanifest` plus a build plugin (`scripts/pwa.ts`, production builds only).
  - Install: Chrome and Edge fire `beforeinstallprompt`, and the lobby's Install link opens it. Safari (iOS) and Firefox never fire it, so on phones and tablets the link is always shown (unless already running installed) and opens `#install`, the add-to-home-screen steps for that platform.
  - The plugin renders the PNG app icons from `public/icon.svg` at build time (no binary assets in the repo) and writes `dist/sw.js`, which precaches every built file a WebGL page loads: the WebGPU renderer's chunks (`?renderer=webgpu`, `webgpuOnlyChunks`) are fetched by the pages that ask for it.
  - The worker's cache name is a hash of the build, so each deploy installs its own cache (fetched past the HTTP cache: Pages sends `max-age=600`) and takes over at once. It keeps the previous build's cache, so a page still running the old build can load its remaining chunks.
  - **The caches are the origin's, shared by every worker on it**: production's and each PR preview's (`/last-stand/pr-preview/pr-N/<sha7>/`, a scope of its own under production's). So a cache's name holds its worker's scope (`last-stand:<scope>:<build>`) and a worker deletes only its own. Named by the build alone, each preview build visited deleted every cache but its own and the one before, production's among them: the owner's installed app, left on a preview build that was pruned since, opened Pages' plain 404, with no cached page to fall back on. The caches named the old way (`last-stand-<build>`) only production's worker deletes. Check with `npm run lab -- pwa` (its installed app).
  - `public/404.html` is the site's page for a missing path (Pages serves the site root's, at that path): it sends a pruned preview build to its PR's stable page (`pr-preview/pr-N/`, which goes to the newest build), and anything else, a closed PR's preview included, to the game. An installed app reopens on the page it last showed, and a preview link tapped on a phone opens in the installed app (production's scope holds the previews), so the app may be left at a preview's address that goes three pushes later. It isn't precached, and links nothing relative.
  - **A plain reload must show a new deploy:** the page is served network-first (the cached copy when offline or after 4s), the built files cache-first. `src/ui/pwa.ts` registers the worker (`updateViaCache: 'none'`, checking again when the tab comes back into view), shows the Install link and offers a reload in the lobby when a new build took over an open page (it asks the worker which cache it serves). Production's scope contains the PR previews, so the worker skips `pr-preview/` paths (each preview registers its own).
  - The pause menu shows the build (`__BUILD__` from `vite.config.ts`: commit, a preview's PR number, the build time in local time).
  - Test offline behaviour with `npm run build` + `vite preview`: the dev server has no worker.
  - Google's fonts are kept in a cache of their own (`last-stand-fonts`), served from it and refreshed behind, by address alone. **Players' browsers run the previous deploy's worker on their first load of a new one**, so the page asks for its font stylesheet as it always has: asked for with CORS (`crossorigin` on its link), the old worker answered with the copy it kept from a request without, opaque, which can't answer one with; the stylesheet failed and the page showed the system's fonts, wider, its lobby's links wrapping. What reads the stylesheet with CORS asks for an address of its own (the world's labels' lining twin: `src/ui/overlay/paint.ts`). Check a change to the worker, or to what the page asks for of another host, with `npm run lab -- pwa`: main's build served and loaded until its worker has the page and the fonts, this tree's served in its place and reloaded under the old worker, the new one and offline.
