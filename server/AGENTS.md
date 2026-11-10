# `server`

Servers the game talks to, deployed by Dokci (`.dokci/AGENTS.md`): `relay/`, the co-op relay, `traces/`, the performance traces slow games send, and `saves/`, cloud saves, all three from the relay's `compose.yaml`, on one host; and `game-preview/`, each PR's preview, a stack of its own per PR that Dokci builds from the PR's head.

The rules across the game are the [root AGENTS.md](../AGENTS.md); each directory under this one has an AGENTS.md of its own.
