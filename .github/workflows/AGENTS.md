# `.github/workflows`

The workflows, which the root's Workflow describes as rules.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `branch-policy.yml`: fails a PR whose branch holds a merge commit (PR branches are linear). The only required check.
- `pr-checks.yml`: every PR, forks included, with a read-only token and no secrets: the lab's and the traces service's unit tests, the typecheck and build, the asset paths. It publishes nothing.
- `deploy-pages.yml`: on a merge to `main`, production on `gh-pages`, alone, the `pages-publisher` group holding one deploy at a time.
- **The PR previews aren't Actions'**: Dokci builds each PR from this repository itself, at `https://pr-N.ls.wellscoped.dev/` ([`server/game-preview`](../../server/game-preview/AGENTS.md)). Until #356 they went through Actions: first Pages, each deploy held `queued` for 102 to 330 s and once over 600 s, its CDN serving a path's old copy for up to 10 minutes (#352); then a build workflow and a `workflow_run` that uploaded it to a service of our own on Dokci (`server/previews`, `scripts/preview`, in git's history). Both waited on Actions running at all, which some days they didn't.

Don't switch Pages to "GitHub Actions only", and don't delete the `gh-pages` branch.
