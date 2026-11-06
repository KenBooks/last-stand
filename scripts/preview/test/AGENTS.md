# `scripts/preview/test`

The preview publish's unit tests: `npm run preview:test`, Node's own runner, in about a second, on any OS. `pr-preview-build.yml` runs them on every PR.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md); the scripts are [`scripts/preview`](../AGENTS.md).

- `fakes.mjs`: a GitHub API only as big as the scripts use. It holds pull requests, build runs and issue comments, and keeps the comment writes it was asked for so a test can look at them; a fake of the service's store as `find.mjs` reads it; temp directories removed after each test.
- `find.test.mjs`: which builds a run publishes, including the catch-up, the closed PRs' removal and the forged-`pr.json` cases.
- `publish.test.mjs`: what a publish does on the real previews service (`server/previews`, started on a port of its own): a build sent and served, the stable page and `latest.json` beside it, a newer push never overtaken, a failed build, a build with no commit folder and a refused token, a removal; and the comments that say so.

A test of a security check needs a canary: break the check and see a test fail. For example, with the head check in `find.mjs` broken, the moved-past and forged-claim tests fail.
