// `lab coop --scenarios choir`: the Ossuary Cantor's choir's ring and rising graves on two games (page/coopChoir.ts).
// Both stand in the crypt in a run; the host raises the Cantor, then casts its ring and warns its stones at spots it
// rolls, as its fight does. Each frame each game keeps the ring it shows (its middle, radius and age) and its stones.
// Judged: both show the ring in one place, its radius the same at the same age all through, for as long; both raise
// the same stones at the same spots. `--canary`: the guest's game raises each stone a metre off the spot it's told,
// which must read as the stones apart.

/** frames for the Cantor to rise on the host and its spawn to be heard on the guest */
const RISE_FRAMES = 240;
/** frames the ring and the stones are watched: its warning, its 13 s, its fade, and some more */
const WATCH_FRAMES = 1140;
/** how far apart the two games may show a ring's middle, its radius at an age, and a stone (m: the wire rounds to
 *  centimetres), and how far its time shown on each may differ (s) */
const APART = 0.05;
const SHOWN_APART = 0.1;
/** where each hero stands (m): either side of the Cantor's ring, inside it */
const HOST_AT = [5, -5];
const GUEST_AT = [-5, -5];

/**
 * Plays it on `pair` (a run started on every game). Returns the problems found, its lines added to `lines`.
 */
export async function choirTogether(pair, callPage, lines, { canary = false }) {
  const [host, guest] = pair.pages;
  await callPage(host, 'coopChoirSetup', { at: HOST_AT, host: true, canary: false });
  await callPage(guest, 'coopChoirSetup', { at: GUEST_AT, host: false, canary });
  await callPage(host, 'coopChoirSpawn');
  await pair.run(RISE_FRAMES);
  const warned = await callPage(host, 'coopChoirCast');
  await pair.run(WATCH_FRAMES);
  const [there, here] = await Promise.all([host, guest].map((page) => callPage(page, 'coopChoirSamples')));
  const problems = [...judgeRing(there, here, lines), ...judgeStones(there, here, warned, lines)];
  if (!canary) return problems.map((problem) => `choir: ${problem}`);
  const caught = problems.some((problem) => problem.includes('stone'));
  lines.push(`canary: the guest's stones raised a metre off their spots ${caught ? 'caught' : 'went unseen'}`);
  const rest = problems.filter((problem) => !problem.includes('stone')).map((problem) => `choir: ${problem}`);
  return caught ? rest : [...rest, 'choir: canary: the guest\'s stones off their spots went unseen'];
}

/** The ring as one game showed it: its middle, its radius by its age, and the game time it showed from and to. */
function ringOf(samples) {
  const shown = samples.filter((sample) => sample.rings.length);
  if (!shown.length) return null;
  const { x, z } = shown[0].rings[0];
  const byAge = shown.map((sample) => [sample.rings[0].age, sample.rings[0].radius]);
  return { x, z, byAge, span: shown[shown.length - 1].time - shown[0].time };
}

/** The radius of `byAge` (sorted by age) at `age`, between its two nearest. */
function radiusAt(byAge, age) {
  const after = byAge.findIndex(([at]) => at >= age);
  if (after <= 0) return byAge[Math.max(0, after)][1];
  const [a0, r0] = byAge[after - 1];
  const [a1, r1] = byAge[after];
  return r0 + (r1 - r0) * ((age - a0) / Math.max(1e-6, a1 - a0));
}

/** Both games showed the ring in one place, its radius alike at every age, for as long. */
function judgeRing(host, guest, lines) {
  const there = ringOf(host);
  const here = ringOf(guest);
  if (!there || !here) return [`the ring never showed on the ${there ? 'guest' : 'host'}'s screen`];
  const apart = Math.hypot(there.x - here.x, there.z - here.z);
  const radii = here.byAge.map(([age, radius]) => Math.abs(radius - radiusAt(there.byAge, age)));
  const widest = Math.max(...radii);
  const least = Math.min(...here.byAge.map(([, radius]) => radius));
  lines.push(`the ring: on both screens ${apart.toFixed(3)} m apart, its radius at most ${widest.toFixed(3)} m apart `
    + `at one age over ${here.byAge.length} frames (it tightened to ${least.toFixed(2)} m), shown ${there.span.toFixed(2)} s `
    + `on the host's and ${here.span.toFixed(2)} s on the guest's`);
  const problems = [];
  if (apart > APART) problems.push(`the ring stood ${apart.toFixed(2)} m apart on the two screens`);
  if (widest > APART) problems.push(`the ring's radius was ${widest.toFixed(2)} m apart at one age`);
  if (Math.abs(there.span - here.span) > SHOWN_APART) problems.push('the ring showed for longer on one screen');
  return problems;
}

/** Both games raised the same stones at the same spots. */
function judgeStones(host, guest, warned, lines) {
  const there = host[host.length - 1]?.stones ?? [];
  const here = guest[guest.length - 1]?.stones ?? [];
  const nearest = here.map((stone) => Math.min(...there.map((other) => Math.hypot(other.x - stone.x, other.z - stone.z))));
  const farthest = nearest.length ? Math.max(...nearest) : 0;
  lines.push(`the stones: ${warned} warned by the host; ${there.length} standing on the host's screen, `
    + `${here.length} on the guest's, the farthest ${farthest.toFixed(3)} m from the host's nearest`);
  const problems = [];
  if (!warned || !there.length) problems.push('no stone rose on the host\'s screen');
  if (there.length !== here.length) problems.push(`${there.length} stones on the host's screen, ${here.length} on the guest's`);
  if (farthest > APART) problems.push(`a stone stood ${farthest.toFixed(2)} m off its spot on the guest's screen`);
  return problems;
}
