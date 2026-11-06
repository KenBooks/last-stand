# Contributing

Contributions come in as pull requests from a fork: you open an issue, fix it on a branch of your fork, and open a PR into `main` of `VictorZakharov/last-stand`. Two scripts automate the routine parts: `scripts/issue.sh` and `scripts/commit.sh`.

Read [AGENTS.md](AGENTS.md) before changing code: it has the product rules (procedural everything, original names, UI that fits any screen) and what applies across the game. Every directory has an AGENTS.md of its own with the gotchas of its code: read the ones on the way to what you change (the heroes' models and legs also have notes in `docs/agents/`, which `src/entities/models/AGENTS.md` says when to read).

## 1. One-time setup

You need `git`, Node.js and the [GitHub CLI](https://cli.github.com/).

1. Log in to the GitHub CLI:
   ```bash
   gh auth login
   ```
   With the browser login, it prints a one-time code in the terminal: open https://github.com/login/device and paste it there.
2. Fork the repo and clone your fork:
   ```bash
   gh repo fork VictorZakharov/last-stand --clone
   cd last-stand
   npm install
   ```
   This creates `<you>/last-stand` on GitHub and clones it with two remotes: `origin` (your fork, you push here) and `upstream` (`VictorZakharov/last-stand`, you open PRs against it).

   If you forked on github.com instead, clone your fork and add the remote yourself:
   ```bash
   git remote add upstream git@github.com:VictorZakharov/last-stand.git
   ```
3. Check the remotes with `git remote -v`: both scripts rely on `origin` and `upstream`.

Keep your fork's `main` a mirror of upstream `main`: never commit to it. Work always happens on a branch.

## 2. Quick flow with the scripts

```bash
scripts/issue.sh     # open an issue, get a fix/issue-N branch and a prompt for Claude
# ...do the work, test it with npm run dev...
scripts/commit.sh    # build, commit, push to your fork, open the PR, print its link
```

### `scripts/issue.sh ["title" ["description"]]`

Prompts for whatever you don't pass (end the description with Ctrl-D), then:

1. checks that the working tree is clean
2. fast-forwards `main` to `upstream/main` and pushes it to your fork
3. creates the issue upstream
4. creates the branch `fix/issue-N` off `main`, where N is the new issue's number
5. prints a prompt for Claude to start on the issue (and copies it to the clipboard on macOS)

With Claude you can skip both scripts' prompts: start your message with `new issue:` and describe the issue. Claude runs `scripts/issue.sh` with a title and description, does the work, and runs `scripts/commit.sh` when it's done (see AGENTS.md).

### `scripts/commit.sh ["title" ["description"]]`

Run it on an issue branch (its name ends in `issue-N`). It:

1. runs `npm run build` and `npm run check:pages`, and stops if either fails
2. takes a title (the issue title by default) and, for a new PR, a description, prompting for whatever you don't pass (end the description with Ctrl-D)
3. commits all changes, using the title as the message (skipped when nothing is uncommitted)
4. rebases the branch onto `upstream/main` and pushes it to your fork
5. opens the PR into upstream `main`, with `Closes #N` at the top of the body so the PR and the issue are linked
6. prints the PR link

After review comments, change the code and run it again: it commits, rebases and pushes to the same PR.

## 3. The whole flow by hand

This is what the scripts do, step by step.

1. **Sync `main`** with upstream:
   ```bash
   git switch main
   git fetch upstream
   git merge --ff-only upstream/main
   git push origin main
   ```
2. **Open an issue** (or pick an existing one) and comment that you're working on it:
   ```bash
   gh issue create -R VictorZakharov/last-stand
   ```
3. **Branch** off the fresh `main`, with the issue number in the name:
   ```bash
   git switch -c fix/issue-N
   ```
4. **Work and test.** Run `npm run dev` (http://localhost:5173) and play the change. Check small (1024×700) and large (1920×1080) viewports for UI changes. Before pushing:
   ```bash
   npm run build && npm run check:pages
   ```
5. **Commit and push** to your fork:
   ```bash
   git add -A
   git commit -m "What the change does"
   git push -u origin fix/issue-N
   ```
6. **Open the PR** into upstream `main`:
   ```bash
   gh pr create -R VictorZakharov/last-stand --base main --head <you>:fix/issue-N \
     --title "What the PR does" --body "Closes #N

   What changed and how you tested it."
   ```
7. **Review.** Push fixes as new commits on the same branch. When upstream `main` moves on, rebase:
   ```bash
   git fetch upstream
   git rebase upstream/main
   git push --force-with-lease
   ```
8. **After the merge**, sync `main` and delete the branch:
   ```bash
   git switch main
   git fetch upstream
   git merge --ff-only upstream/main
   git push origin main
   git branch -D fix/issue-N
   git push origin --delete fix/issue-N
   ```

## Rules and gotchas

- **Link the PR with `Closes #N` in its body.** A closing keyword in the title does nothing, and a PR never copies the issue text. With `Closes #N` in the body, the PR shows the issue under "Development", the issue shows the PR, and merging closes the issue.
- **Keep branches linear.** Rebase onto `upstream/main` and never merge `main` into your branch: the `branch-policy` check fails any PR that contains merge commits.
- **A branch must be up to date with `main` to merge.** The maintainer may update it with GitHub's "Update branch", which rebases the branch on your fork. Your local copy is then stale, so `git branch -d` refuses to delete it after the merge: use `-D`.
- **Fork PRs get no live preview.** Previews are built on our own host, which never builds a fork's code; add screenshots (and a short clip for anything that moves) to show your change.
- **Every push waits for approval.** GitHub holds the workflow runs on a fork PR (the checks) until a maintainer approves them, for every push, not just your first PR.
- **Delete your fork's branch yourself.** Upstream deletes merged branches automatically only in its own repo.
- **One PR per feature.** Keep PRs focused.
