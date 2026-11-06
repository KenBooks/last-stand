# `server`

Servers the game talks to, deployed by Dokci (`.dokci/AGENTS.md`): `relay/`, the co-op relay, `previews/`, the PR previews, and `traces/`, the performance traces slow games send, all from the relay's `compose.yaml`, on one host.

The rules across the game are the [root AGENTS.md](../AGENTS.md); each directory under this one has an AGENTS.md of its own.
