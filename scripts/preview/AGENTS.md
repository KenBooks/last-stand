# `scripts/preview`

What `.github/workflows/pr-preview.yml` does at each step, so the workflow holds no code of its own and every piece of it is tested here: `npm run preview:test` (Node's own test runner, no dependencies; it runs in `pr-preview-build.yml` too). How the previews work, and why, is in [the workflows' AGENTS.md](../../.github/workflows/AGENTS.md); the service they're sent to is [`server/previews`](../../server/previews/AGENTS.md).

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `steps.mjs`: each step's entry point, called from `actions/github-script` with what it gives (`github`, `context`, `core`, `exec`). It reads the workflow's environment (`PREVIEW_ORIGIN`, the service's https origin; `PREVIEWS_TOKEN`, its secret) and passes what's to publish between steps in a file under `RUNNER_TEMP` (`preview-items.json`). The rest is in the modules it calls, which take everything as arguments.
- `find.mjs`: which builds a publish run publishes. These are the triggering build, then each open PR's newest finished build that the service's `latest.json` doesn't record yet (a run lost or failed), then the previews kept of PRs no longer open, to remove. A build's `pr.json` is believed only when that PR's head is the commit built.
- `publish.mjs`: each item done on the service. A build is packed, sent, read back at its public address (trusted TLS, the route, the service: what a visitor meets), then, if its PR's head is still that commit, its stable page and `latest.json` (`ready`) sent; a newer push's build is never overtaken by an older one's publish (`superseded`: kept, said nothing of). A failed build's `latest.json` says `failed`, the stable page still linking the last that built. And the building job's own: `latest.json` says `building`, the previous build linked (#292).
- `server.mjs`: the service as the workflow talks to it (`previewServer`): the token's writes, `latest.json` and the build read back publicly.
- `tar.mjs`: a build's folder packed as a gzipped ustar, plain files and folders only, the same on any OS (no `tar` binary).
- `latest.mjs`: `latest.json` and the stable page as the scripts write them.
- `comments.mjs`: the sticky PR comment (building; while a publish runs, its stages as a checklist, `progressMessage`: sent, served; then what came of it, with how long sending and serving took), found by the marker `marocchino/sticky-pull-request-comment` used, so the comments made before this keep being the ones edited.
- `test/`: one file per area, run against a fake GitHub API (`test/fakes.mjs`) and the real service on a port of its own.

## Gotchas

- **These scripts run with a write token and the service's secret, from main's checkout.** `pr-preview.yml` checks them out from its own commit (main's head on a `workflow_run`) beside the stable page, and imports them from there: never from the PR. Nothing here may run, import or `require` a file from a build's artifact. An artifact is read as data (`pr.json`) and packed as files.
- A change here is tried before merge with `gh workflow run pr-preview.yml --ref <branch>`. That runs the branch's copy of the workflow and the scripts, catching up whatever is unpublished. The `workflow_run` paths (a build publishing itself, the building job) only run once merged.
- Node 24 runs them on the runner, as `actions/github-script` does. Keep them free of npm packages: the job doesn't install any.
