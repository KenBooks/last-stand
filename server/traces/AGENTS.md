# `server/traces`

The traces service (`traces.mjs`, Node with no packages; `serve.mjs` starts it): games that ran slowly send their performance traces here with their player's consent (`src/perf/AGENTS.md`), and agents read them back (`npm run lab -- trace`). Deployed by Dokci beside the co-op relay, from the relay's `compose.yaml`, on the same host under `/traces` (`.dokci/AGENTS.md`).

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `POST /traces`: a trace, gzipped, from the game's own pages (`ORIGINS`, the relay's) -> `201 { code }`, the report's code (`ABCD-EFGH`). `GET /traces/health`: `ok`.
- `GET /traces?build=&limit=`, `/traces/latest`, `/traces/<code>`: the list (newest first; `build` a commit's prefix, a PR's number or a bundle's name) and a trace's gzip, behind the token (`Authorization: Bearer <TRACES_TOKEN>`). A report's code alone reads nothing. Unset, reading is off.
- Tests: `npm run traces:test` (the PR build runs them): what it takes and turns away, the rate limit, the token, the disk's cap. `npm run lab -- recorder` sends a trace from the game's page to one started by the lab and reads it back.

## Gotchas

- **A process of its own, never the relay's.** An upload is read and checked (unpacked to its header) on its own event loop, so it never holds a room's messages up. Its route is the relay's host with `pathPrefix: /traces`, which Traefik prefers over the host's own route as the longer rule.
- **What it takes:** 1 MB a trace at most (the game cuts one to fit: `packTrace`), one that unpacks to a trace's header (16 MB unpacked at most, so a gzip bomb is turned away), 4 at once, and from each address 10 in any 24 hours, as each game holds itself to (`MOST_A_DAY` in `src/perf/consent.ts`; the address is the last hop Traefik adds to `X-Forwarded-For`, which a client can't forge).
- **What it keeps:** the traces in the `traces-data` volume at `/data`, each its gzip as sent and a line of what the list says of it (`<code>.json`), the index rebuilt from those at a start. Dropped after `KEEP_DAYS` (30), the oldest first past `DISK_MAX` (512 MB), checked hourly and after each upload past the cap.
- **The token is the owner's**: Dokci's `LS_TRACES_TOKEN` (`.dokci/project.yaml` `configuration`), never in the repo; an agent's copy in `tools/lab/traces.env` (ignored by git). Compared in constant time.
- Run it locally with `DATA=.tmp/traces ORIGINS=http://localhost:5173 TRACES_TOKEN=dev PORT=8788 node server/traces/serve.mjs` and the game at `?server=ws://localhost:8788` (the address the co-op relay and the traces share).
