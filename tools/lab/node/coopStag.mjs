// The Stag of Ash's new attacks in co-op, judged from both games' samples (`coop --scenarios stag`; the samples are
// page/coopStag.ts's): its stakes stand in one place on both screens with one life each (the host's game wears them,
// the guest's is told), the same wood is alight on both, and the guest thrown by its toss is up in the air on both
// (its own game throws it; the host's copy is lifted by its reports, StateMsg `hl`), nothing landing on it in the air.

/** how far apart a stake or a piece of wood may stand on the two screens (m) */
const APART = 0.05;
/** how much of the guest's height in its toss the host's copy of it must show */
const LIFTED_SHARE = 0.5;
/** how far apart two spots are the same piece of wood (m) */
const SAME_WOOD = 0.3;
/** a life drop that counts as a hit (of its whole) */
const HIT = 0.5;

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cm = (m) => `${Math.round(m * 100)} cm`;
const stagOf = (sample) => sample.stag ?? { stakes: [], burning: [], lift: 0, flying: false, partnerLift: 0 };

/** The most stakes a screen shows at once, and the frame it first does. */
function mostStakes(samples) {
  let most = 0, at = -1;
  samples.forEach((sample, frame) => {
    const n = stagOf(sample).stakes.length;
    if (n > most) {
      most = n;
      at = frame;
    }
  });
  return { most, at };
}

/** The stakes' lines and problems: as many on both screens, where they stand, and each one's life at the end. */
function judgeStakes(host, guest) {
  const problems = [];
  const onHost = mostStakes(host), onGuest = mostStakes(guest);
  const hostStakes = onHost.at < 0 ? [] : stagOf(host[onHost.at]).stakes;
  const guestStakes = onGuest.at < 0 ? [] : stagOf(guest[onGuest.at]).stakes;
  const apart = guestStakes.map((s) => Math.min(Infinity, ...hostStakes.map((h) => distance(s, h))));
  const most = apart.length ? Math.max(...apart) : 0;
  if (!onHost.most) problems.push('no stake stood on the host\'s screen');
  if (onHost.most !== onGuest.most) {
    problems.push(`${onGuest.most} stakes on the guest's screen, ${onHost.most} on the host's`);
  }
  if (most > APART) problems.push(`a stake stood ${cm(most)} apart on the two screens`);
  // (each one's life at the end: the host's game wore one, the guest's must show it worn too)
  const lastHost = stagOf(host[host.length - 1]).stakes, lastGuest = stagOf(guest[guest.length - 1]).stakes;
  const struck = lastHost.filter((h) => h[2] < Math.max(...lastHost.map((s) => s[2])));
  const lives = lastGuest.map((s) => {
    const h = lastHost.reduce((a, b) => (distance(s, a) < distance(s, b) ? a : b), lastHost[0]);
    return h ? [s[2], h[2]] : [s[2], NaN];
  });
  const differ = lives.filter(([g, h]) => !(Math.abs(g - h) < 0.01));
  if (!struck.length) problems.push('no stake was worn on the host\'s screen');
  for (const [g, h] of differ) problems.push(`a stake's life ${g} on the guest's screen, ${h} on the host's`);
  const line = `its stakes: ${onGuest.most} on the guest's screen, ${onHost.most} on the host's (the most ${cm(most)} `
    + `apart); at the end their lives ${lastGuest.map((s) => s[2]).join(', ')} on the guest's screen, `
    + `${lastHost.map((s) => s[2]).join(', ')} on the host's`;
  return { line, problems };
}

/** Every piece of wood a screen showed alight. */
function woodsAlight(samples) {
  const seen = [];
  for (const sample of samples) {
    for (const at of stagOf(sample).burning) if (!seen.some((s) => distance(s, at) < SAME_WOOD)) seen.push(at);
  }
  return seen;
}

/** The wood's line and problems: the same pieces alight on both screens. */
function judgeWood(host, guest) {
  const problems = [];
  const onHost = woodsAlight(host), onGuest = woodsAlight(guest);
  const missing = onHost.filter((h) => !onGuest.some((g) => distance(g, h) < SAME_WOOD));
  const extra = onGuest.filter((g) => !onHost.some((h) => distance(g, h) < SAME_WOOD));
  if (!onHost.length) problems.push('no wood was alight on the host\'s screen');
  if (missing.length) problems.push(`${missing.length} pieces of wood alight on the host's screen, not the guest's`);
  if (extra.length) problems.push(`${extra.length} pieces of wood alight on the guest's screen, not the host's`);
  const line = `wood alight: ${onGuest.length} pieces on the guest's screen, ${onHost.length} on the host's`;
  return { line, problems };
}

/** The toss's line and problems: the guest thrown up on its own screen and its copy up on the host's, nothing landing
 *  on it in the air but its landing. */
function judgeToss(host, guest) {
  const problems = [];
  const flew = guest.map((sample) => stagOf(sample).flying);
  const frames = flew.filter(Boolean).length;
  const high = Math.max(0, ...guest.map((sample) => stagOf(sample).lift));
  const seen = Math.max(0, ...host.map((sample) => stagOf(sample).partnerLift));
  // (a hit in the air: its life dropping in a frame it flew and still flies the next)
  const hitInAir = guest.filter((sample, frame) => frame > 0 && flew[frame - 1] && flew[frame]
    && guest[frame - 1].life - sample.life > HIT).length;
  if (!frames) problems.push('the guest was never thrown');
  else if (seen < high * LIFTED_SHARE) {
    problems.push(`the guest went ${high} m up on its own screen, ${seen} m on the host's`);
  }
  if (hitInAir) problems.push(`the guest was hit ${hitInAir} times in the air`);
  const line = `its toss: the guest thrown ${frames} frames, up to ${high} m on its own screen and ${seen} m on the `
    + `host's, hit ${hitInAir} times in the air`;
  return { line, problems };
}

/** What the Stag did on the host's game, each action counted as it began. */
function didOnHost(host) {
  const did = {};
  let last = '';
  for (const sample of host) {
    const doing = stagOf(sample).doing ?? '';
    if (doing && doing !== last) did[doing] = (did[doing] ?? 0) + 1;
    last = doing;
  }
  return Object.entries(did).map(([name, n]) => `${n} ${name}`).join(', ');
}

/** The scenario's lines and problems. */
export function describeStag(host, guest) {
  const parts = [judgeStakes(host, guest), judgeWood(host, guest), judgeToss(host, guest)];
  parts.push({ line: `it did on the host's game: ${didOnHost(host) || 'nothing'}`, problems: [] });
  // (the host standing off isn't held unhurt: in its second phase embers fall round every hero)
  const problems = parts.flatMap((p) => p.problems);
  return { line: parts.map((p) => p.line).join('; '), problems };
}

/** The canary's verdict, its line pushed onto `lines`: the guest deaf to its stakes' life must have been caught. Its
 *  own problem taken off what's said; the rest stand. */
export function stagCanaryLines(problems, lines) {
  const ours = (p) => p.includes('stake\'s life');
  const caught = problems.some(ours);
  lines.push(`canary: the guest deaf to its stakes' life ${caught ? 'caught' : 'missed'}`);
  const rest = problems.filter((p) => !ours(p));
  return caught ? rest : [...rest, 'canary missed: the guest deaf to its stakes\' life went unseen'];
}
