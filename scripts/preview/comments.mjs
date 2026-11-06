// Each PR's sticky comment about its preview: one a PR, found by the marker marocchino/sticky-pull-request-comment
// put in it (with the header `last-stand-pr-preview`), so the comments made before keep being the ones edited.
export const MARKER = '<!-- Sticky Pull Request Commentlast-stand-pr-preview -->';

export function buildingMessage({ sha, run }) {
  return `**PR preview:** building \`${sha}\`. The preview's page shows how long, and goes to the new build once `
    + `it's published.\n\n[Watch the build](${run})`;
}

/** What an item came to (`result`, from staging or probing; none when the job failed before it). */
export function itemMessage(item, result, { origin, thisRun }) {
  if (item.mode === 'failed') return `**PR preview:** build failed.\n\n[Open workflow run](${item.run})`;
  if (item.mode === 'remove' && result?.state === 'removed') return '**PR preview:** removed.';
  if (item.mode === 'publish' && result?.state === 'ready') {
    const stable = `${origin}/pr-preview/pr-${item.number}/`;
    return `**PR preview:** ready for \`${item.sha}\`.\n\n[Open preview](${result.link}) (this commit's build). `
      + `The PR's own link, [pr-${item.number}/](${stable}), goes to its newest build.`;
  }
  if (item.mode === 'publish' && result?.state === 'unserved') {
    const stable = `${origin}/pr-preview/pr-${item.number}/`;
    return `**PR preview:** published \`${item.sha}\`; GitHub Pages deployed it but wasn't serving it yet when `
      + `this run stopped checking. Its link, [${result.link}](${result.link}), works once Pages catches up, and the `
      + `next publish run checks it again. The PR's own link, [pr-${item.number}/](${stable}), goes to it once served.`
      + `\n\n[Open workflow run](${thisRun})`;
  }
  return `**PR preview:** publication failed.\n\n[Open workflow run](${thisRun})`;
}

/** PR `number`'s sticky comment made or edited to say `message`. */
export async function say(github, repo, number, message) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
    per_page: 100,
  });
  const sticky = comments.find((comment) => comment.user?.type === 'Bot' && comment.body?.includes(MARKER));
  const body = `${message}\n${MARKER}`;
  if (sticky) await github.rest.issues.updateComment({ ...repo, comment_id: sticky.id, body });
  else await github.rest.issues.createComment({ ...repo, issue_number: number, body });
}
