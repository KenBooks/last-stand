# `.dokci`

Dokci's project (`project.yaml`): it deploys the co-op relay (`server/relay`) and the PR previews service (`server/previews`) on every push to `main`; the game itself is on GitHub Pages (`.github/AGENTS.md`).

The rules across the game are the [root AGENTS.md](../AGENTS.md).

## Gotchas

- **Dokci relay TLS:** the production route in `.dokci/project.yaml` must explicitly set `entryPoint: websecure` and `certificateResolver: letsencrypt`. Omitting them creates an HTTP-only route even though the installed proxy redirects public HTTP to HTTPS; container health alone does not prove public TLS works. Keep the relay's internal HTTP port and health check unchanged, and verify trusted HTTPS at `/health` plus a WSS connection after the merged revision deploys. Never bypass certificate verification or add a public-relay fallback.
- **The previews service** has a route of its own on the relay's host (`pathPrefix: /pr-preview`, the same entry point and resolver) and a volume (`previews-data`). Its write token is the project's `configuration` `LS_PREVIEWS_TOKEN`, set in Dokci by the owner, never in the repo, and the same value as the repo's `pr-preview` environment's `PREVIEWS_TOKEN` secret: unset, what's kept is still served and every publish fails. After it deploys, check `https://ls.wellscoped.dev/pr-preview/health`, that the relay's `/health` and a WSS room still answer, and a publish run (`gh workflow run pr-preview.yml`).
