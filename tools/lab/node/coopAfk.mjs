// `lab coop`'s `afk` scenario judged (page/coopAfk.ts plays it; #847): the guest's page hidden for a while. On the
// host's screen the guest's name tag must stand a line taller (Idle over the name) within a second of the page going
// hidden, stay so while it is, and be back to its height within a second of the page shown again; never so before.
// On the guest's own screen its tag says it too.

/** how late the host's screen may show it (ms: the link's round trip is 300 by default) */
const AFK_LATE = 1000;
/** the name returned with every problem the canary must cause */
export const AFK_CANARY = 'afk: the host never showed the guest away';

/** The first frame from `from` on whose `pick` of `samples` is `want`, or -1. */
function firstFrom(samples, from, pick, want) {
  for (let frame = from; frame < samples.length; frame++) {
    if (samples[frame].afk && pick(samples[frame].afk) === want) return frame;
  }
  return -1;
}

/** The scenario judged: `host` and `guest` are the two games' samples, frame for frame. */
export function judgeAfk({ host, guest, frameMs }) {
  const hiddenAt = guest[0]?.afkHiddenAt;
  const shownAt = guest[0]?.afkShownAt;
  if (hiddenAt === undefined) return { lines: ['no afk in this tree'], problems: [] };
  const late = Math.ceil(AFK_LATE / frameMs);
  const plain = host[0]?.afk?.partner ?? 0;
  const tall = (sample) => sample.partner > plain + 1;
  const problems = [];
  const before = host.slice(0, hiddenAt).filter((sample) => sample.afk && tall(sample.afk)).length;
  if (before) problems.push(`afk: the guest shown away on the host's screen in ${before} frames before it hid`);
  const came = firstFrom(host, hiddenAt, tall, true);
  if (came < 0 || came >= shownAt) problems.push(AFK_CANARY);
  else if (came - hiddenAt > late) problems.push(`afk: shown away ${came - hiddenAt} frames after it hid`);
  const went = firstFrom(host, shownAt, tall, false);
  if (came >= 0 && (went < 0 || went - shownAt > late)) {
    problems.push(`afk: still shown away ${went < 0 ? 'to the end' : `${went - shownAt} frames`} after it came back`);
  }
  const ownTall = guest.slice(hiddenAt, shownAt).some((sample) => sample.afk && sample.afk.mine > guest[0].afk.mine + 1);
  if (!ownTall) problems.push('afk: the guest\'s own tag never said it was away');
  const lines = [
    `the guest hidden at frame ${hiddenAt}, shown at ${shownAt}: on the host's screen away from frame ${came}, `
      + `back from ${went} (its tag ${plain} px tall, a line more while away)`,
  ];
  return { lines, problems };
}

/** The scenario's line and problems, as the coop judge adds them. */
export function describeAfk(host, guest, frameMs) {
  const { lines, problems } = judgeAfk({ host, guest, frameMs });
  return { line: `afk:\n    ${lines.join('\n    ')}`, problems };
}
