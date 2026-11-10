# `server/saves`

The saves service (`saves.mjs`; `serve.mjs` starts it): cloud saves (#382, milestone "Cloud saves"). A player signs in with a passkey, and each site's save is kept for every device. Deployed by Dokci beside the co-op relay and the traces, from the relay's `compose.yaml`, on the same host under `/saves` (`.dokci/AGENTS.md`). The game's side is #504; Google sign-in and the backups are #503.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `saves.mjs`: the HTTP side, every route in its header comment, and the settings (`settingsFrom`). `store.mjs`: the files it keeps. `passkeys.mjs`: WebAuthn through `@simplewebauthn/server`. `cleanup.mjs`: the daily cleanup.
- Tests: `npm run saves:test` (once: `npm ci --prefix server/saves --ignore-scripts`; the PR build runs both). They go through the library's real checks: `test/authenticator.mjs` answers as a browser's passkey does (an ES256 key, "none" attestation, CBOR by hand).
- Run it locally: `DATA=.tmp/saves PORT=8789 node server/saves/serve.mjs` (`localhost` is a relying party, and `http://localhost:5173` an origin, by default).

## How it works

- **Accounts are ours:** a random id, with ways in attached. Passkeys now, and Google (#503) as a second way into the same account. No name, email or picture is kept; a passkey's user name is `Last Stand <first 6 letters of the id>`.
- **Sessions** are random tokens, given to the page once (it sends `Authorization: Bearer`, not a cookie: the game's pages are another site, and their browsers block third-party cookies). Only their SHA-256 is kept. A session belongs to the site it was made on and is refused from any other. It lasts `SESSION_DAYS` (180) since it was last used, and its use is written down at most once a day.
- **A site is a page's origin:** its host, `www.` left off, `:` as `_` (`last-stand.cc`, `pr-512.ls.wellscoped.dev`, `c-<sha12>.ls.wellscoped.dev`). A save is filed under the site the browser's `Origin` names, never one the page asks for. So a preview's code can never write production's heroes, and can read them only through `copy-production`, the player's own choice.
- **Passkeys' relying parties** (`RP_IDS`): `last-stand.cc` for production, `ls.wellscoped.dev` for every PR preview and commit build (one passkey there works on all of them), `localhost` for development. A passkey works only where its relying party fits, so a production passkey can't sign in on a preview. **The sign-in code** bridges them: signed in, `POST /saves/link-code` gives 8 letters, good once for 10 minutes; typed on another site (or device), `POST /saves/link` signs that page in to the same account, which can then add a passkey of its own there. Codes live in memory: a restart drops them.
- **A save is parts** (`hero.mage`, `shared`...: the game names them, `^[a-z][a-z0-9.-]{0,31}$`, `PARTS_MAX` 16), each gzipped JSON of an object. Each part has a version, the device that wrote it and when. A write sends `x-save-base`, the version it builds on (0: new). A stale one is refused with a 409 and the version, device and time kept, so the game can ask its player which copy to keep (per hero: #382). The service never merges and never picks.
- **What it checks of a save:** its size and shape alone (gzip of a JSON object, unpacking to 512 KB at most). Saves stay the player's own and client-authoritative: cheating is out of scope (#382).
- **Copying production into a preview** gives each copied part a version past the preview's own. A device holding the preview's older copy is then told it changed (409), and never writes over the copy unseen. Production is never written from another site.

## Limits

- `SAVE_MAX` (16 KB) a site's save, gzipped. That is about 2 times a full save (3 heroes, 60-item stashes: estimated at 6 to 9 KB, to be measured by #505's check). An oversized body gets a 413, never a cut connection.
- `WRITES_PER_HOUR` (60) per account and site; `OTHER_SITES_MAX` (20) sites other than production per account (507 past it: the player deletes one).
- `ACCOUNTS_PER_DAY` (10) new accounts from one address, and `ASKS_PER_HOUR` (60) passkey options and sign-in codes from one address. The address is the last hop Traefik adds to `X-Forwarded-For`. All of these are counted in memory.

## Cleanup (daily, `CLEAN_EVERY_MS`)

- A PR preview's saves go once GitHub's API (`GITHUB_REPO`, public, no token: 40 asked a run at most, under the 60 an hour it allows) says its PR is closed. A PR GitHub doesn't know (404) counts as closed. An empty `GITHUB_REPO` turns this part off, and `/saves/health` says `cleanup: false`.
- A commit build's saves go `COMMIT_KEEP_DAYS` (30) after their last write: GitHub doesn't know commit builds, and Dokci keeps one 30 days at most.
- Sessions unused for `SESSION_DAYS` go.

## Settings

None is required and none is a secret: each has its default in `settingsFrom`, so the service needs nothing from Dokci's `configuration`. A new setting must keep it so. If it is optional (unset), the part it serves is off, and `/saves/health` says so; that is how #503's Google settings must work (the owner, 2026-11-10: "new env variables should be optional, if not set, the new func should be disabled").

## Storage

- Files on the `saves-data` volume at `/data`: `accounts/<id>.json` (passkeys' public keys and counters, sessions' digests, which sites have a save, their sizes and times) and `saves/<id>/<site>.json` (the parts, base64 of their gzip).
- Every file is written whole to a temporary name and renamed over the old, and each account's changes wait their turn (`withAccount`): a version's check and the write it allows are never split.
- Accounts are read into memory at a start; saves are read when asked for.
- Logs name an account by the first 6 letters of its id, and never hold a save's contents.
- Deleting an account removes its file and every save. #503's nightly backups keep it until they age out.

## Gotchas

- **The passkey library is pinned** (`@simplewebauthn/server` 14.0.3, and `tslib` by `overrides`): each version was at least two weeks old when taken. Its install scripts stay off (`--ignore-scripts`, in the image too). Under Node it logs Web Crypto's experimental warnings at its first use; they are harmless.
