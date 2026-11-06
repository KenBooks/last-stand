# `scripts/preview`

What `.github/workflows/pr-preview.yml` does at each step, so the workflow holds no code of its own and every piece of it is tested here: `npm run preview:test` (Node's own test runner, no dependencies; it runs in `pr-preview-build.yml` too). How the previews work, and why, is in [the workflows' AGENTS.md](../../.github/workflows/AGENTS.md).

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `steps.mjs`: each step's entry point, called from `actions/github-script` with what it gives (`github`, `context`, `core`, `exec`). It reads the workflow's environment and passes state between steps in files under `RUNNER_TEMP` (`preview-items.json`: what's to publish; `preview-staged.json`: what came of each). The rest is in the modules it calls, which take everything as arguments.
- `find.mjs`: which builds a publish run publishes. These are the triggering build, then each open PR's newest finished build that gh-pages doesn't record yet (a publish cancelled while it waited in the group), then previews of PRs closed unmerged that weren't removed. A build's `pr.json` is believed only when that PR's head is the commit built.
- `stage.mjs`: a build copied into the gh-pages checkout. It goes in its commit's folder with probe files, and main's stable page goes beside it. The oldest folders are pruned, and nested repos and links are dropped. A closed PR's preview is removed.
- `deploy.mjs`: the Pages deploy of either job, named by the gh-pages commit and waited for by that deployment's own status (why not `actions/deploy-pages`: the workflows' AGENTS.md).
- `record.mjs`: the probes after the deploy, and `latest.json` saying ready, unserved (deployed, not served yet: the next run publishes it again) or failed.
- `building.mjs`: the building job's own work. `latest.json` says `building`, and the stable page links the previous build.
- `comments.mjs`: the sticky PR comment (building; while a publish runs, its stages as a checklist, `progressMessage`, which `steps.mjs` says again as the deploy and the probes go, at most every 15 s; then what came of it), found by the marker `marocchino/sticky-pull-request-comment` used, so the comments made before this keep being the ones edited.
- `git.mjs`: the gh-pages checkout committed and pushed as the bot.
- `pages.mjs`: gh-pages' preview layout, read from a checkout or through the API.
- `test/`: one file per area, run against a fake GitHub API (`test/fakes.mjs`) and temp directories.

## Gotchas

- **These scripts run with a write token, from main's checkout.** `pr-preview.yml` checks them out from its own commit (main's head on a `workflow_run`) beside the stable page, and imports them from there: never from the PR. Nothing here may run, import or `require` a file from a build's artifact. An artifact is read as data (`pr.json`) and copied as files.
- A change here is tried before merge with `gh workflow run pr-preview.yml --ref <branch>`. That runs the branch's copy of the workflow and the scripts, catching up whatever is unpublished. The `workflow_run` paths (a build publishing itself, the building job) only run once merged.
- Node 24 runs them on the runner, as `actions/github-script` does. Keep them free of npm packages: the job doesn't install any.
