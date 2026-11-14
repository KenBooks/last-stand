# `server/traces`

The traces service (`traces.mjs`, Node with no packages; `serve.mjs` starts it): games that ran slowly send their performance traces here with their player's consent (`src/perf/AGENTS.md`), and agents read them back (`npm run lab -- trace`); the pause menu's bug reports come here too (`reports.mjs`, Bug reports below). Deployed by Dokci beside the co-op relay, from the relay's `compose.yaml`, on the same host under `/traces` (`.dokci/AGENTS.md`).

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `POST /traces`: a trace, gzipped, from the game's own pages (`ORIGINS`, the relay's) -> `201 { code }`, the report's code (`ABCD-EFGH`). `GET /traces/health`: `ok`.
- `GET /traces?build=&q=&limit=&offset=`, `/traces/summary`, `/traces/latest`, `/traces/<code>`: the list (newest first; `build` a commit's prefix, a PR's number or a bundle's name, `q` any text of a trace's line; `limit` 500 at most from `offset`), what's kept in sum (count, sizes, oldest and newest, builds and PRs, by scene and by why, `KEEP_DAYS`, `DISK_MAX` and how full it is), and a trace's gzip (`<code>.lspt.gz` by its content-disposition). Read with the token (`Authorization: Bearer <TRACES_TOKEN>`) or the session cookie below. A report's code alone reads nothing. Unset, reading is off.
- `GET /traces` asked for as a page (`Accept` holds `text/html`: a browser's navigation, never the lab's fetches): the page to browse them (the summary, then the list a page at a time with a filter the server applies and a download each), under a CSP that allows the page's own files and nothing else, `x-frame-options: DENY` and `referrer-policy: no-referrer`. Not signed in, a 401 page saying to open it from Dokci.
- **The page is a small Vite + TypeScript app in `web/`** (`index.html` the list, `note.html` the short pages whose `{{heading}}`/`{{text}}` `page.mjs` fills escaped; `src/` one module a job: `api`, `summary`, `list`, `format`, `dom`). `npm run traces:build` (once: `npm ci --prefix server/traces/web`) type-checks it and builds `dist/` (ignored by git): its script and style named by their content's hash under `/traces/assets/`, served `immutable` without the token (they hold no trace), the pages never cached. The image builds it itself (`Dockerfile`'s first stage, from `web/package-lock.json`); `npm run traces:test` builds it first. Nothing inline (`modulePreload.polyfill` off), or the CSP refuses it. Without a build the service still takes and serves traces as JSON.
- **Signed in from Dokci, never by typing the token.** Dokci opens `https://<host>/traces?dokci_link=v1.<exp>.<sig>`: `exp` a Unix time in seconds at most 300 s ahead, `sig` base64url (no padding) of HMAC-SHA256 keyed by the token's UTF-8 bytes over `"dokci-link/v1\n" + host + "\n" + "/traces" + "\n" + exp` (host the request's `Host`, lower-cased, without its port). It holds if `exp` is in (now, now + 330] (30 s of the clocks' skew), the signature matches (constant time) and it wasn't used before (each signature once, remembered till it would expire). It then sets `ls_traces=<exp2>.<sig2>` (`exp2` now + 12 h, `sig2` base64url HMAC-SHA256 of `"ls-traces-session/v1\n" + exp2` by the token; `HttpOnly; Secure; SameSite=Strict; Path=/traces; Max-Age=43200`), so a new token ends every session. Else a 401 page: the link expired or is invalid, open it again from Dokci.
- Tests: `npm run traces:test` (the PR build runs them): what it takes and turns away, the rate limit, the token, the disk's cap, the page against the JSON, the summary's sums, Dokci's links (signed as Dokci signs them: one use, expired, too far ahead, another key, host or path) and the session's cookie. `npm run lab -- recorder` sends a trace from the game's page to one started by the lab and reads it back.

## Bug reports

The pause menu's Report a bug form (`src/ui/AGENTS.md`) sends its reports here, never to GitHub (from the owner: "Only our own server... Lets not involve Github in client issues"): `reports.mjs`, the same kind of upload as a trace (anonymous, from the game's own pages, read back with the owner's token), so it shares the traces' host, route, certificate, token, volume and process, and needs no deploy of its own.

- `POST /traces/reports`: the report as JSON (`kind`, `text`, `expected`, `facts`, `picture`: a JPEG as base64 or null; nothing else) in a plain request (a string body: no preflight, no cookies) -> `201 { code }`. `GET /traces/reports?limit=&offset=` (newest first, what happened cut to 200 characters, the disk's sum, `diskMax`, `keepDays`), `/traces/reports/<code>` (the report whole) and `/traces/reports/<code>.jpg` (its picture, `nosniff`): read as the traces are, with the token or a Dokci session. The browsing page shows traces alone so far; read reports with `curl -H "Authorization: Bearer $TOKEN" https://ls.wellscoped.dev/traces/reports`.
- **No address is written down**: the rate limits count in memory alone (forgotten at a restart), and a report keeps what the player saw in the form, its kind, a time and its code.
- The kinds are `src/data/bugReport.ts`'s ids, copied in `KINDS` (the image is built from this folder alone); `test/reports.test.mjs` holds the two lists alike.
- Every limit (each a setting in `settingsFrom`, by the environment's name in brackets):

| What | Most | Enforced | Past it |
| --- | --- | --- | --- |
| Who may send | the game's own pages (`ORIGINS`, the traces') | the server | 403 |
| A report's body | 1 MB (`REPORT_MAX_BYTES`) | the server, by its `Content-Length` and by the bytes read | 413 |
| Uploads at once, traces and reports together | 4 | the server | 503, `Retry-After: 5` |
| From one address in any hour | 5 (`REPORT_PER_HOUR`) | the server, in memory | 429 "too many reports from here", `Retry-After` the seconds till a place frees (exposed to the page): the form says when to try again and keeps the report |
| From one address in any 24 hours | 20 (`REPORT_PER_DAY`) | the server, in memory | as above |
| From every address together in any 24 hours | 200 (`REPORT_PER_DAY_ALL`): a flood can't fill the disk with its reports | the server, in memory | 429 "too many reports today", `Retry-After` |
| `TRUSTED_ADDRESSES` (Dokci's `LS_TRACES_TRUSTED`) | never held to an address's own limits; still counted in every address's 200 | the server | |
| A report refused for what it holds | still counts against its address's limits (nobody probes the checks for free) | the server | |
| Its fields | `kind`, `text`, `expected`, `facts`, `picture` and nothing else (no name tag, no room, no save can ride along) | the server | 400 |
| Its kind | one of the form's 11 | the server | 400 |
| What happened | 10 to 1200 characters (`REPORT_MOST_TEXT`) | the form (its field's `maxLength`, Send refuses under 10) and the server | 400 |
| What was expected | 400 characters (`REPORT_MOST_EXPECTED`) | the form and the server | 400 |
| The game's facts | 16 lines of 400 characters (the game sends 9) | the server | 400 |
| The picture's kind | a JPEG: its start, its end and a frame's size read from its markers | the server | 400 |
| The picture's size | 600 KB decoded (`REPORT_PICTURE_MAX`) | the form (made again at quality 0.65, 0.5, 0.35 till it fits, else none) and the server | 400 |
| The picture's longest side | 1280 px (`REPORT_PICTURE_SIDE`) | the form (shrinks it to that) and the server | 400 |
| A send's time | 20 s | the form | "couldn't be reached", Try again |
| A request's time | 30 s (`requestTimeout`) | the server | the connection closed |
| Kept for | 90 days (`REPORT_KEEP_DAYS`) | the server: at a start, hourly and after each report | deleted |
| The disk | 100 MB of reports (`REPORT_DISK_MAX`, its pictures most of it: some 350 to 650 reports), apart from the traces' 100 MB in the same volume | the server, after each report | the oldest deleted first |
| Reading | the token or a Dokci session | the server | 401; 503 with no token set |

- Tests: `test/reports.test.mjs` (in `npm run traces:test`): a report taken and read back whole with its picture, by the token alone; every refusal above at its edge and just past it; an hour's and a day's windows freeing their places (`Limiter`, on a clock of its own); every address's day; the disk's cap and the days kept across a start; no address on the disk. `npm run lab -- ui --states bugReport` sends one from the game's form to a service the lab starts and reads it back (`tools/lab/node/tracesService.mjs`).

## Gotchas

- **A process of its own, never the relay's.** An upload is read and checked (unpacked to its header) on its own event loop, so it never holds a room's messages up. Its route is the relay's host with `pathPrefix: /traces`, which Traefik prefers over the host's own route as the longer rule.
- **What it takes:** 1 MB a trace at most (the game cuts one to fit: `packTrace`), one that unpacks to a trace's header (16 MB unpacked at most, so a gzip bomb is turned away), 4 at once, and from each address 10 in any 24 hours from each site, a PR's preview or a commit build its own (from play: "10 per device per PR, not just 10 per device per day": a day's testing held up the next PR's), as each game holds itself to (its count kept in the site's own `localStorage`), and 40 over every site (`PER_DAY_ALL`: the Origin is the sender's to say and `pr-*` matches any number of them, so a script naming new ones would otherwise fill the 100 MB and push the real traces out); the addresses in `TRUSTED_ADDRESSES` (a Dokci setting of the owner's, comma-separated, never in the repo) are never held to it (from play: "can we whitelist an IP ?") (`MOST_A_DAY` in `src/perf/consent.ts`; the address is the last hop Traefik adds to `X-Forwarded-For`, which a client can't forge).
- **What it keeps:** the traces in the `traces-data` volume at `/data`, each its gzip as sent and a line of what the list says of it (`<code>.json`), the index rebuilt from those at a start. Dropped after `KEEP_DAYS` (30), the oldest first once the traces and their lines take over `DISK_MAX` (100 MB, some 2,500 traces), checked at a start, hourly and after each upload.
- **A Dokci link answers with a page that moves on to `/traces` (a meta refresh), not a 303.** The link is opened from Dokci, another site, and a browser sends no `SameSite=Strict` cookie on a redirect that a cross-site navigation began: with a 303 headless Chrome landed on "Not signed in" with the cookie set. The page's own refresh is this site's navigation and carries it; the link leaves the address all the same.
- **The page writes every string a game sent as text** (`textContent`, never HTML): a trace's GPU, bundle or why are the sender's to choose.
- **The token is the owner's**: Dokci's `LS_TRACES_TOKEN` (`.dokci/project.yaml` `configuration`), never in the repo; an agent's copy in `tools/lab/traces.env` (ignored by git). Compared in constant time.
- Run it locally with `DATA=.tmp/traces ORIGINS=http://localhost:5173 TRACES_TOKEN=dev PORT=8788 node server/traces/serve.mjs` and the game at `?server=ws://localhost:8788` (the address the co-op relay and the traces share).
