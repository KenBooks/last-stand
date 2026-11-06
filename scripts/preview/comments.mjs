// Each PR's sticky comment about its preview: one a PR, found by the marker marocchino/sticky-pull-request-comment
// put in it (with the header `last-stand-pr-preview`), so the comments made before keep being the ones edited.
export const MARKER = '<!-- Sticky Pull Request Commentlast-stand-pr-preview -->';

export function buildingMessage({ sha, run }) {
  return `**PR preview:** building \`${sha}\`. The preview's page shows how long, and goes to the new build once `
    + `it's published.\n\n[Watch the build](${run})`;
}

/** The publish's stages in order, each as the comment says it under way and done. */
export const STAGES = [
  { name: 'uploading', doing: 'Sending it to the preview server', done: 'Sent to the preview server' },
  { name: 'serving', doing: 'Checking the preview server serves it', done: 'Served by the preview server' },
];

/** A time in seconds as the comment shows it: `45 s`, `2 min 05 s`. */
export function duration(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole} s`;
  return `${Math.floor(whole / 60)} min ${String(whole % 60).padStart(2, '0')} s`;
}

/** A finished build being published by `run`, a checklist of its stages: those done, the one under way with what
 *  it's at (`detail`), those to come. The publish run's own link (the build's run is done by then). */
export function progressMessage({ sha, build, run, stage, detail = '' }) {
  const at = STAGES.findIndex((each) => each.name === stage);
  const lines = [`- ✅ Built ([its run](${build}))`];
  STAGES.forEach((each, i) => {
    if (i < at) lines.push(`- ✅ ${each.done}`);
    else if (i === at) lines.push(`- ⏳ **${each.doing}**${detail ? `: ${detail}` : ''}`);
    else lines.push(`- ⬜ ${each.done}`);
  });
  return `**PR preview:** publishing \`${sha}\`. The preview's page goes to it once it's served.\n\n`
    + `${lines.join('\n')}\n\n[Watch it publish](${run})`;
}

/** What an item came to (`result`, from publish.mjs; none when the job failed before it), or null when there's
 *  nothing to say (a build a newer push has superseded: that push's publish says what's newest). */
export function itemMessage(item, result, { server, thisRun }) {
  if (item.mode === 'failed') return `**PR preview:** build failed.\n\n[Open workflow run](${item.run})`;
  if (item.mode === 'remove' && result?.state === 'removed') return '**PR preview:** removed.';
  if (result?.state === 'superseded') return null;
  if (item.mode === 'publish' && result?.state === 'ready') {
    const stable = server.stableUrl(item.number);
    const took = result.seconds === undefined ? '' : ` (${duration(result.seconds)} to send and serve)`;
    return `**PR preview:** ready for \`${item.sha}\`${took}.\n\n[Open preview](${result.link}) (this commit's `
      + `build). The PR's own link, [pr-${item.number}/](${stable}), goes to its newest build.`;
  }
  const why = result?.why ? `: ${result.why}` : '';
  return `**PR preview:** publication failed${why}.\n\n[Open workflow run](${thisRun})`;
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
