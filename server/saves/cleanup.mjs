// The saves service's daily cleanup (server/saves/AGENTS.md): a PR preview's saves go once GitHub says its PR is
// closed, a commit build's once nobody synced it for `commitKeepDays` (GitHub knows nothing of commit builds; Dokci
// keeps one 30 days at most), and sessions nobody used for `sessionDays`.
import * as store from './store.mjs';

/** A site's PR number (`pr-512.ls.wellscoped.dev`), else null. */
export const prOf = (site) => Number(/^pr-(\d{1,7})\./.exec(site)?.[1]) || null;
/** Whether a site is a commit build's (`c-<12 hex digits>.ls.wellscoped.dev`). */
export const isCommitBuild = (site) => /^c-[0-9a-f]{12}\./.test(site);

/** How many PRs one run asks GitHub about at most (60 an hour without a token; one run a day). */
const MOST_ASKED = 40;
/** PR number -> closed (GitHub said so: it never opens again for a preview's purposes) */
const closedPrs = new Set();

export const forgetPrs = () => closedPrs.clear();

/** Whether GitHub says the PR is closed (merged or not): true, false, or null when it couldn't be asked. */
async function prClosed(settings, number) {
  try {
    const answer = await fetch(`${settings.githubApi}/repos/${settings.githubRepo}/pulls/${number}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'last-stand-saves' },
      signal: AbortSignal.timeout(10_000),
    });
    if (answer.status === 404) return true; // never was a PR: a page that named a made-up one
    if (!answer.ok) return null;
    return (await answer.json()).state === 'closed';
  } catch {
    return null;
  }
}

/** The PRs among `numbers` GitHub says are closed (those it was asked about this run). */
async function closedAmong(settings, numbers) {
  if (!settings.githubRepo) return closedPrs;
  let asked = 0;
  for (const number of numbers) {
    if (closedPrs.has(number) || asked >= MOST_ASKED) continue;
    asked++;
    if (await prClosed(settings, number)) closedPrs.add(number);
  }
  return closedPrs;
}

/** One run: drops closed PRs' saves, stale commit builds' and old sessions. Says what it dropped. */
export async function cleanUp(settings, now = Date.now()) {
  const prs = new Set();
  for (const account of store.allAccounts()) {
    for (const site of Object.keys(account.sites)) if (prOf(site)) prs.add(prOf(site));
  }
  const closed = await closedAmong(settings, [...prs].sort((a, b) => a - b));
  const dropped = { sites: 0, sessions: 0 };
  const commitOldest = now - settings.commitKeepDays * 86_400_000;
  const sessionOldest = now - settings.sessionDays * 86_400_000;
  for (const { id } of store.allAccounts()) {
    await store.withAccount(id, async () => {
      const account = store.account(id);
      if (!account) return;
      const changed = structuredClone(account);
      for (const [site, { updated }] of Object.entries(changed.sites)) {
        const gone = closed.has(prOf(site)) || (isCommitBuild(site) && updated < commitOldest);
        if (!gone) continue;
        await store.dropSite(changed, site);
        dropped.sites++;
      }
      const sessions = changed.sessions.filter((session) => session.used >= sessionOldest);
      dropped.sessions += changed.sessions.length - sessions.length;
      changed.sessions = sessions;
      if (JSON.stringify(changed) !== JSON.stringify(account)) await store.keepAccount(changed);
    });
  }
  return dropped;
}
