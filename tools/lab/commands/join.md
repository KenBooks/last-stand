# `join`, `invite`

`npm run lab -- join <code>` puts a coding session in the game its owner is playing (#529): a PR preview, a commit
build or a dev build, on any device, never production. The lab's steps then run on that live game in place of a
headless one. `npm run lab -- invite` checks the whole path end to end.

## Joining

1. The owner opens the developer panel in the game (F8, or the DEV tab on touch), presses **Invite agent** and pastes
   the command it shows to the session: `npm run lab -- join <code>`, with `--server <url>` where the game isn't on
   the build's own relay. The code is good for one join, for five minutes.
2. The session runs it **as a background task**: it holds the link, in a process of its own, until the game ends it
   (it exits 0 after `join leave`, 1 when the game ended it). It prints one line when the relay has taken the code and
   another when the owner has pressed **Let it in** on the question the game shows him. Nothing is answered before.
3. Each step is the command run again, answered through that process (it listens on this machine alone, its port
   and token in `out/join/session.json`):

| Step | What it gives |
| --- | --- |
| `join status` | `joined`, or that it waits for the owner's answer |
| `join look` | JSON: the mode, biome and run; the hero (class, place, facing, life, energy); the camera (view, place, direction, yaw, pitch, fov); what the middle of the view looks at (`crosshair`: the mesh's path of names, its materials, the distance and place hit, the foe if it's one's); the time (frozen, speed); the settings (quality, screen, and `panel`: every control of the developer panel with what it holds and takes); the frame (draws, triangles, fps and timings, and its parts, each in or taken out) |
| `join picture` | The frame as drawn, without the page's UI, kept in `out/join/<time>.jpg` (its path printed: read it). `--at x,y,z` takes it from a camera placed there, looking at `--to x,y,z` or turned by `--yaw`, `--pitch` (rad), and puts the owner's view back after (three frames of his are the camera's); `--keep` leaves him looking from it instead, flying and frozen as F9 does. `--side px` its longest side (1280), `--png` exact |
| `join set name=value ...` | What the panel sets, by its controls' names (`join set`, bare, lists them): a toggle `god=true`, a choice `speed=0.25` `biome=forest` `class=mage`, a field `wave=12`, a part of the frame `"part:the particles=false"`, a button pressed `start=1` `spawn=5` |
| `join eval <code>` | Code run in the game's page, an expression or statements with a `return`, awaited: `G` (the game's state, `src/state.ts`), `THREE` and `dev` (`time`, `cheats`, `look()`, `frames(n)`, `placeFreeCam`, `setFreeCam`, `panelControls()`, `setControl`, `plain`) in scope. Its value comes back as plain data, cut short where it's deep (5 levels), long or loops |
| `join leave` | Ends it. So do the owner's **Kick** on the badge, his tab closing, and his opening or joining a co-op room |

A step waits 30 s for its answer (`--timeout s`); a picture needs the game's tab in view, as none is drawn otherwise.
`npm run lab -- stop` ends a held link too.

## What keeps it out of production

Code run in a page from outside is remote code execution, so each of these holds by itself:

- the game's side is `src/dev`, which production's bundle has none of (`src/dev/AGENTS.md`);
- the relay opens an agent room for a preview's, a commit build's or a dev build's origin alone, and for production's
  never, whatever its settings say (`server/relay/agents.mjs`);
- the relay makes the code (24 random bytes), spends it on its first join and drops it unjoined after five minutes;
  five wrong codes a minute from an address and it is turned away;
- the relay passes nothing of the agent's on before the game has accepted it, and the page reads nothing before the
  owner has pressed Let it in; the badge stays up, over everything, while an agent is connected;
- an agent is a command line: the relay turns away a join that carries a page's `Origin`.

**The agent's code runs as the page's own**, so it reaches what the page reaches: that site's storage, with its saves
and, where the owner signed in to cloud saves on that preview, that sign-in's token. The invitation and the question
say so when he is signed in there. A preview's storage is its own origin's: production's is out of its reach.

## `invite`

`npm run lab -- invite` runs it all against a relay of the lab's own (once: `npm ci --prefix server/relay`), the
command's page the owner's game, every step of his a click on the page: the code read off the panel; an agent held at
the question, a step it sends early never run; a second agent refused on the same code; let in, with `look`, `set`,
`eval` and `picture` (the view, and a placed camera put back) checked against the page's own state; kicked; the used
code refused; then `lab join` itself, started as a process and its steps run as command lines; and a co-op room
opened, which sends the agent away and offers none. About 8 s on a booted page; pictures in `out/invite/<screen>`,
the relay's log beside them.

`--canary` starts the relay with two faults: a used code left good, which the check must catch (a second agent gets
in), and its hold on an unaccepted agent's messages off, so the early step reaches the page, whose own hold must then
stop it.
