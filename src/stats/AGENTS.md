# `src/stats`

Anonymous play stats (#543): what the operations dashboard counts players by. `heartbeat.ts` sends the traces
service a beat once a minute while the tab shows (`server/traces/stats.mjs` sums them; the dashboard's Players
section reads the sums, `server/traces/web`).

The rules across the game are the [root AGENTS.md](../../AGENTS.md); the service is `server/traces/AGENTS.md`.

- **What a beat holds, and nothing else** (the service refuses any other field): a random id this browser made for
  it (16 bytes, `localStorage` `last-stand-play-id`), `where` (`lobby` or `fight`: `G.mode`), `coop`, `start` (the
  page's first beat: a session) and `first` (the id was just made: a new player). Never an account, a name tag, a
  room, a save, a build or the device. The owner's choice (2026-11-20): an anonymous id, so weekly and monthly active
  players count each player once. Don't add a field without asking: the privacy page (`public/privacy.html`) says
  what's sent.
- **On by default, off in one click** (the pause menu's Performance tab, the checkbox Anonymous play stats beside Slow-game reports, `#opt-stats`, `localStorage`
  `last-stand-play-stats`). A browser sending Global Privacy Control starts off. Turned off, the id is deleted: turned
  on again it's a new id.
- **Sends nothing from the dev server or an automated browser** (`navigator.webdriver`: the lab, the stalls), so
  testing never reads as players. A PR preview or commit build does send, counted apart as `test` by the service.
- **A beat is a minute of play**: sent at the reveal (the loading screen gone) and every 60 s after, only while the
  tab shows (`visibilityState`), so a tab left in the background adds no playtime. The service adds a minute at most
  once in any 50 s per id.
- A plain request (a string body, no headers, no cookies), `keepalive`, failing quietly: a server down or a blocked
  request never shows the player anything.
