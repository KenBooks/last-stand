# `.github/workflows`

The workflows, which the root's Workflow describes as rules.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `branch-policy.yml`: fails a PR whose branch holds a merge commit (PR branches are linear). Required by `main`'s ruleset, as is `pr-checks.yml`'s (`../AGENTS.md`).
- `pr-checks.yml`: every PR, forks included, with a read-only token and no secrets: the shared files it touches (`scripts/hubs.mjs`, a warning in the run's summary, never a failure), the engine's build naming its Bulwark commit (`scripts/engine-pkg.mjs`), the marked lists kept sorted (`scripts/sorted.mjs`), the lab's and the traces service's unit tests, the typecheck and build, the asset paths. It publishes nothing. Its job's name, "Test, type-check and build", is a required check.
- `deploy-pages.yml`: on a merge to `main` **that changes what the build reads** (its `paths`: `src`, `public`, `index.html`, the build's config, `package*.json`, `scripts`; never a `.md`), production on `gh-pages`. A merge of `tools/`, `docs/`, `server/` or notes alone deploys nothing: the build is stamped with its commit and time, so a deploy of the same game was a new version to every player's page and worker (a lab-only merge, #830, republished production). Production's `version.json` then names the last commit that deployed, not `main`'s head. A new place the build reads from goes in `paths`; a manual run (`workflow_dispatch`) deploys anyway. It is alone, the `pages-publisher` group holding one deploy at a time.
- **The PR previews aren't Actions'**: Dokci builds each PR from this repository itself, at `https://pr-N.ls.wellscoped.dev/` ([`server/game-preview`](../../server/game-preview/AGENTS.md)). Until #356 they went through Actions: first Pages, each deploy held `queued` for 102 to 330 s and once over 600 s, its CDN serving a path's old copy for up to 10 minutes (#352); then a build workflow and a `workflow_run` that uploaded it to a service of our own on Dokci (`server/previews`, `scripts/preview`, in git's history). Both waited on Actions running at all, which some days they didn't.

Don't switch Pages to "GitHub Actions only", and don't delete the `gh-pages` branch.
