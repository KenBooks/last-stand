# `.github`

GitHub's side of the repo: the workflows that check PRs, build their previews and deploy production (`workflows/`), and who must approve a change (`CODEOWNERS`).

The rules across the game are the [root AGENTS.md](../AGENTS.md); each directory under this one has an AGENTS.md of its own.

## Who may change `main`

Collaborators (Write: their own branches here, and they request and re-request the owner's review) and fork contributors alike reach `main` only through a PR the owner approved. It is held by two repository rulesets on `main`, not classic branch protection:

- **"main: PRs only, checks pass (everyone)"**, which nobody bypasses, the owner included: a PR, merge commits only, no force push, no deletion, and both checks pass, "PR must be linear (no merge commits)" and "Test, type-check and build" (`workflows/`). A check renamed in a workflow must be renamed in this ruleset in the same change, or every PR waits on a check that never comes; a check that can't run (Actions down) holds every merge until it can, or until the owner edits the ruleset;
- **"main: owner approves (owner exempt)"**: one approval, which must be a code owner's (`CODEOWNERS`: the owner, for every path); an approval is dropped by a new push (and by "Update branch", or a merge into `main` that changes the PR's diff), and the last push must be approved by someone other than its pusher. The Admin role is `exempt` from it (its rules aren't run for the owner): he merges his own PRs, and a collaborator's, with the plain Merge button, his merge being his approval. A collaborator merges only a PR the owner approved.

The one ruleset before them (the owner bypassing it in PR mode, a "bypass rules" box ticked at each merge) is kept disabled until the split is proven, then deleted.

A second ruleset keeps `gh-pages` from being deleted or force-pushed (the deploy only adds commits to it). A collaborator's push there is overwritten by the next deploy, and the live site is the deploy's upload, not the branch.

The workflows' token is read-only by default and can't approve PRs; no workflow holds a secret, and an environment that ever holds one is restricted to `main` (`github-pages` is). A collaborator's branch can add a workflow that runs on its own push, so an unrestricted environment's secret is any collaborator's to read. Each collaborator's PR is also built by Dokci on every push without an approval (`.dokci/AGENTS.md`): only people trusted for that become collaborators, after contributing from a fork. Adding one is an invite with Write, nothing per person; a collaborator no longer needs a line in `.dokci/project.yaml`'s `trustedAuthors`.
