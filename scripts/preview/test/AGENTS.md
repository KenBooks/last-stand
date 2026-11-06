# `scripts/preview/test`

The preview publish's unit tests: `npm run preview:test`, Node's own runner, in about a second, on any OS. `pr-preview-build.yml` runs them on every PR.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md); the scripts are [`scripts/preview`](../AGENTS.md).

- `fakes.mjs`: a GitHub API only as big as the scripts use. It holds pull requests, build runs, gh-pages files by path and issue comments, and keeps the comment writes it was asked for so a test can look at them. It also has temp directories that are removed after each test.
- `find.test.mjs`: which builds a run publishes, including the catch-up and the forged-`pr.json` cases.
- `stage.test.mjs`: what a build or a building push leaves in a gh-pages checkout.
- `deploy.test.mjs`: the Pages deploy against a fake Pages that answers any other name with "succeed", as the real one did (its canary: deploy under a fixed name and four tests fail).
- `record.test.mjs`: the probes, `latest.json`, the comments and the commits (in a throwaway git repo, never pushed).

A test of a security check needs a canary: break the check and see a test fail. For example, with the head check in `find.mjs` broken, the moved-past and forged-claim tests fail.
