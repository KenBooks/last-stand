# `server/game-preview`

A PR's preview as Dokci builds and runs it (`.dokci/project.yaml` `previews`): the game built from the PR's head in Docker (`Dockerfile`, the repo's root its context, the root's `.dockerignore` letting in only what `vite build` reads) and served by nginx (`nginx.conf`) at the root of the PR's own host, `https://pr-N.ls.wellscoped.dev/`, a stack of its own per PR (`compose.yaml`).

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- **Why Dokci, not Actions:** the previews no longer wait on GitHub Actions running (there were days they didn't run at all) nor on an upload: Dokci builds the PR's head itself on our own host, in a container of its own. The Actions path (`pr-preview.yml`, `server/previews`) still runs beside it until the first Dokci previews are seen working, then goes.
- **Who gets one:** Dokci reads the policy from `main` alone (a change to it in a PR applies once merged), and builds only open, non-draft PRs from this repository by a collaborator: never a fork, which the manifest can't loosen.
- **The link:** Dokci posts it on the PR as its check, "Dokci preview" (its Details and an "Open preview" link in its summary), once the preview is healthy and its host's DNS answers with the server's address. It writes no comment.
- **DNS:** a wildcard `*.ls.wellscoped.dev` A record at the server (no CDN proxy), and the server's address in Dokci's `DOKCI_PUBLIC_PROXY_ADDRESSES` (`/etc/dokci/operator.env`); each host gets a certificate of its own from Let's Encrypt (HTTP-01), on `websecure` with `letsencrypt` as every route here.
- **Origins:** the relay and the traces service take every preview's host by a pattern, `https://pr-*.ls.wellscoped.dev` (`originsFrom` in each: `*` one DNS label), in their defaults and in `server/relay/compose.yaml`'s `ORIGINS`.
- **What it knows of the PR:** Dokci gives the build `DOKCI_SOURCE_SHA` alone (the PR's head, the pause menu's build label), not the PR's number.
- **Served as Pages serves production:** `/assets/` (hashed) kept a year, everything else `no-cache`, so a reload shows the newest build; the web manifest as `application/manifest+json` (nginx's own types have none, and as a download the app wouldn't install); `/health` for Dokci's probe; `404.html` for what isn't there.
- Try it locally: `docker build -f server/game-preview/Dockerfile -t ls-game-preview .` from the repo's root, `docker run --rm -p 127.0.0.1:18089:8080 ls-game-preview`, and the game at `http://127.0.0.1:18089/` (about 20 s a build with npm's cache warm). Stop the container after.
