// The lab's co-op judged (tools/lab `coop`): what each of the two games showed, frame by frame (page/coop.ts
// `Sample`), against what the other one had in the same frame. A hero or a foe copied from the other game is judged by
// how far behind it is (the delay that lines its path up best with its own game's), how far off that path it is, and
// how roughly it moves (its speed against its own, a frame at a time, and its largest move a frame); an arrow that
// struck a foe on the guest's screen by whether the host counted it, and how long its blow took to show on the foe; a
// blow at the guest by whether it hurt it, against whether the guest was where it landed on its own screen; a
// guest's charge by whether every foe it met on its screen was carried and thrown on both, and ended before it.
import { describePings } from './coopPings.mjs';
import { describeChat } from './coopChat.mjs';

/** the longest delay looked for, frames (a second and a quarter) */
const MOST_DELAY = 75;
/** a source moving less than this over a scenario is standing: it has no delay to find, m */
const STILL_PATH = 0.3;
/** a life falling by less than this in a frame is no hit (a hero's regeneration rounds it up and down) */
const LIFE_DROP = 0.5;
/** how long before and after an arrow struck on the guest's screen the host may count it, frames */
const SHOT_BEFORE = 6;
const SHOT_AFTER = 90;
/** how long before and after a blow on the guest's screen it may hurt the guest, frames */
const BLOW_BEFORE = 30;
const BLOW_AFTER = 60;
/** a copy moving this much further a frame than its source ever does has jumped, m */
const JUMP_SLACK = 0.08;

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The median of `values` (none: NaN). */
export function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pathLength(points) {
  let length = 0;
  for (let f = 1; f < points.length; f++) {
    if (points[f] && points[f - 1]) length += distance(points[f], points[f - 1]);
  }
  return length;
}

function largestMove(points) {
  return largestMoveAt(points).move;
}

/** The largest move a frame of `points` (m), and the frame it ends on (-1: none). */
function largestMoveAt(points) {
  let move = 0;
  let frame = -1;
  for (let f = 1; f < points.length; f++) {
    if (!points[f] || !points[f - 1]) continue;
    const step = distance(points[f], points[f - 1]);
    if (step <= move) continue;
    move = step;
    frame = f;
  }
  return { move, frame };
}

/** How far `shown` is from `source` on average, `source` taken `delay` frames earlier (none to compare: Infinity). */
function offAt(shown, source, delay) {
  let total = 0;
  let count = 0;
  for (let f = delay; f < shown.length; f++) {
    if (!shown[f] || !source[f - delay]) continue;
    total += distance(shown[f], source[f - delay]);
    count++;
  }
  return count ? total / count : Infinity;
}

/** The rms of the difference between `shown`'s move a frame and `source`'s, `delay` frames earlier, m a frame. */
function roughAt(shown, source, delay) {
  let total = 0;
  let count = 0;
  for (let f = delay + 1; f < shown.length; f++) {
    const points = [shown[f], shown[f - 1], source[f - delay], source[f - delay - 1]];
    if (points.some((point) => !point)) continue;
    const dx = shown[f][0] - shown[f - 1][0] - (source[f - delay][0] - source[f - delay - 1][0]);
    const dz = shown[f][1] - shown[f - 1][1] - (source[f - delay][1] - source[f - delay - 1][1]);
    total += dx * dx + dz * dz;
    count++;
  }
  return count ? Math.sqrt(total / count) : 0;
}

/**
 * How a copy (`shown`, a point or null a frame) follows its source (`source`, the same frames in the game it comes
 * from): its delay (the one that lines the two paths up best, frames), how far off the path it is then (m), how
 * roughly it moves (the rms of its move a frame against its source's then, m a frame), and its largest move a frame
 * against its source's (m). A source that stands has no delay (`still`).
 */
export function follow(shown, source) {
  const jump = largestMove(shown);
  const sourceJump = largestMove(source);
  if (pathLength(source) < STILL_PATH) return { still: true, jump, sourceJump, off: offAt(shown, source, 0) };
  let delay = 0;
  let off = Infinity;
  for (let candidate = 0; candidate <= MOST_DELAY; candidate++) {
    const candidateOff = offAt(shown, source, candidate);
    if (candidateOff < off) {
      off = candidateOff;
      delay = candidate;
    }
  }
  return { still: false, delay, off, rough: roughAt(shown, source, delay), jump, sourceJump };
}

/** The frames in which `lives` (one a frame) falls, each with how much. */
export function drops(lives) {
  const found = [];
  for (let f = 1; f < lives.length; f++) {
    if (lives[f] === undefined || lives[f - 1] === undefined) continue;
    if (lives[f] < lives[f - 1] - LIFE_DROP) found.push({ frame: f, amount: lives[f - 1] - lives[f] });
  }
  return found;
}

/** The first of `events` (by frame) not yet `used`, within [from, to]; marks it used. */
function takeWithin(events, used, from, to) {
  for (let i = 0; i < events.length; i++) {
    if (used.has(i)) continue;
    if (events[i].frame < from || events[i].frame > to) continue;
    used.add(i);
    return events[i];
  }
  return null;
}

/** One foe's position a frame (null where a game didn't show it: not there, or gone in a blink as a guest's copy
 *  waits for the host's reports to have it where it went, slid there unseen) in `samples`. */
function foePath(samples, id) {
  return samples.map((sample) => {
    const foe = sample.foes.find((candidate) => candidate.id === id);
    return foe && !foe.gone ? [foe.x, foe.z] : null;
  });
}

function foeLives(samples, id) {
  return samples.map((sample) => sample.foes.find((candidate) => candidate.id === id)?.life);
}

function foeIds(samples) {
  const ids = new Set();
  for (const sample of samples) for (const foe of sample.foes) ids.add(foe.id);
  return [...ids].sort((a, b) => a - b);
}

/**
 * The guest's arrows: each one that struck a foe on its screen, whether the host counted it (the foe's life falling
 * there within a moment of it) and how long the foe's life on the guest's screen took to fall after it (frames);
 * and the host's counts that no arrow on the guest's screen struck.
 */
export function judgeShots(host, guest) {
  const struck = [];
  guest.forEach((sample, frame) => {
    for (const id of sample.struck) struck.push({ frame, id });
  });
  const loosed = guest.reduce((total, sample) => total + sample.loosed, 0);
  const hostDrops = new Map();
  const guestDrops = new Map();
  const hostUsed = new Map();
  const guestUsed = new Map();
  for (const id of foeIds(host)) {
    hostDrops.set(id, drops(foeLives(host, id)));
    guestDrops.set(id, drops(foeLives(guest, id)));
    hostUsed.set(id, new Set());
    guestUsed.set(id, new Set());
  }
  let counted = 0;
  const shownAfter = [];
  for (const shot of struck) {
    const counts = hostDrops.get(shot.id) ?? [];
    const countUsed = hostUsed.get(shot.id) ?? new Set();
    const found = takeWithin(counts, countUsed, shot.frame - SHOT_BEFORE, shot.frame + SHOT_AFTER);
    if (found) counted++;
    const shown = guestDrops.get(shot.id) ?? [];
    const fell = takeWithin(shown, guestUsed.get(shot.id) ?? new Set(), shot.frame, shot.frame + SHOT_AFTER);
    if (fell) shownAfter.push(fell.frame - shot.frame);
  }
  let unseen = 0;
  for (const [id, counts] of hostDrops) unseen += counts.length - hostUsed.get(id).size;
  return { loosed, struck: struck.length, counted, unseen, shownAfter };
}

/**
 * The blows at the guest as its screen shows them: each one where the guest was in its reach or not as it landed,
 * and whether it hurt the guest (its life falling within a moment of it), how long after (frames); and the hurts no
 * blow it saw explains.
 */
export function judgeBlows(guest) {
  const blows = [];
  guest.forEach((sample, frame) => {
    for (const foe of sample.foes) if (foe.blow) blows.push({ frame, inReach: foe.inReach });
  });
  const hurts = drops(guest.map((sample) => sample.life));
  const used = new Set();
  const tally = { blows: blows.length, inReach: 0, inReachHurt: 0, dodged: 0, dodgedHurt: 0, hurtAfter: [] };
  for (const blow of blows) {
    const hurt = takeWithin(hurts, used, blow.frame - BLOW_BEFORE, blow.frame + BLOW_AFTER);
    if (blow.inReach) tally.inReach++;
    else tally.dodged++;
    if (hurt && blow.inReach) tally.inReachHurt++;
    if (hurt && !blow.inReach) tally.dodgedHurt++;
    if (hurt) tally.hurtAfter.push(hurt.frame - blow.frame);
  }
  tally.unexplained = hurts.length - used.size;
  return tally;
}

const ms = (frames, frameMs) => `${Math.round(frames * frameMs)} ms`;
const cm = (metres) => `${Math.round(metres * 100)} cm`;

/** A copy's following as a line, and the problem it has (a jump), if any. */
function describeFollow(what, followed, frameMs) {
  if (!followed) return { line: `${what}: never shown`, problem: `${what} was never shown` };
  const moves = `the largest move a frame ${cm(followed.jump)} (its own ${cm(followed.sourceJump)})`;
  const jumped = followed.jump > followed.sourceJump + JUMP_SLACK;
  const problem = jumped ? `${what} jumped ${cm(followed.jump)} in a frame` : null;
  if (followed.still) return { line: `${what}: standing, ${cm(followed.off)} off, ${moves}`, problem };
  const speed = `${(followed.rough / (frameMs / 1000)).toFixed(2)} m/s`;
  const line = `${what}: ${ms(followed.delay, frameMs)} behind, ${cm(followed.off)} off its path, its speed off its ` +
    `own by ${speed} (rms), ${moves}`;
  return { line, problem };
}

/** How a game played its partner's reports out (where its tree says): how far behind the freshest, how often a stall
 *  held it at the newest, how far its clock's rate strayed from ours. */
export function describePlayout(what, samples) {
  const frames = samples.map((sample) => sample.playout).filter(Boolean);
  if (!frames.length) return null;
  const behind = median(frames.map((frame) => frame.behind));
  const held = frames.filter((frame) => frame.held).length / frames.length;
  const strayed = Math.sqrt(frames.reduce((total, frame) => total + (frame.rate - 1) ** 2, 0) / frames.length);
  return `${what}: ${Math.round(behind)} ms behind the freshest report (median), held at the newest by a stall ` +
    `${(held * 100).toFixed(1)}% of frames, its rate off ours by ${(strayed * 100).toFixed(1)}% (rms)`;
}

/** The foes on the guest's screen against the host's, put together. */
function describeFoes(host, guest, frameMs) {
  const followed = foeIds(host).map((id) => follow(foePath(guest, id), foePath(host, id)));
  const moving = followed.filter((one) => !one.still);
  if (!moving.length) return { line: 'the foes on the guest\'s screen: none moved', problem: null };
  const delays = moving.map((one) => one.delay);
  const jump = Math.max(...followed.map((one) => one.jump));
  const sourceJump = Math.max(...followed.map((one) => one.sourceJump));
  const rough = Math.sqrt(moving.reduce((total, one) => total + one.rough ** 2, 0) / moving.length);
  const speed = `${(rough / (frameMs / 1000)).toFixed(2)} m/s`;
  // (which foe made the largest move, and when: a jump is looked for there)
  const ids = foeIds(host);
  const worst = ids.map((id) => ({ id, ...largestMoveAt(foePath(guest, id)) })).sort((a, b) => b.move - a.move)[0];
  const where = worst?.frame >= 0 ? `, foe ${worst.id} at ${ms(worst.frame, frameMs)}` : '';
  const line = `the ${followed.length} foes on the guest's screen: ${ms(median(delays), frameMs)} behind (the most ` +
    `${ms(Math.max(...delays), frameMs)}), ${cm(median(moving.map((one) => one.off)))} off their paths, their speed ` +
    `off their own by ${speed} (rms), the largest move a frame ${cm(jump)}${where} (their own ${cm(sourceJump)})`;
  const problem = jump > sourceJump + JUMP_SLACK ? `a foe on the guest's screen jumped ${cm(jump)} in a frame` : null;
  return { line, problem };
}

function describeShots(host, guest, frameMs) {
  const shots = judgeShots(host, guest);
  const lost = shots.struck - shots.counted;
  const shown = shots.shownAfter.length
    ? `; the foe's life fell on the guest's screen ${ms(median(shots.shownAfter), frameMs)} after it was struck ` +
      `(median, the most ${ms(Math.max(...shots.shownAfter), frameMs)})`
    : '';
  const line = `arrows: ${shots.loosed} loosed, ${shots.struck} struck the foe on the guest's screen, ` +
    `${shots.counted} of them counted on the host (${lost} lost), ${shots.unseen} counted that struck nothing on ` +
    `its screen${shown}`;
  const problems = [];
  if (lost) problems.push(`${lost} arrows that struck the foe on the guest's screen never counted`);
  if (shots.unseen) {
    problems.push(`${shots.unseen} arrows counted on the host that struck nothing on the guest's screen`);
  }
  return { line, problems };
}

function describeBlows(guest, frameMs) {
  const blows = judgeBlows(guest);
  const after = blows.hurtAfter.length
    ? `; a hurt showed ${ms(median(blows.hurtAfter), frameMs)} after its blow on the guest's screen (median)`
    : '';
  const line = `blows at the guest on its screen: ${blows.blows}: in its reach ${blows.inReach} (hurt ` +
    `${blows.inReachHurt}), dodged ${blows.dodged} (hurt ${blows.dodgedHurt}); hurt by no blow it saw ` +
    `${blows.unexplained}${after}`;
  const problems = [];
  if (blows.dodgedHurt) problems.push(`${blows.dodgedHurt} blows the guest dodged on its screen hurt it`);
  if (blows.inReach > blows.inReachHurt) {
    problems.push(`${blows.inReach - blows.inReachHurt} blows that landed on the guest on its screen never hurt it`);
  }
  if (blows.unexplained) problems.push(`${blows.unexplained} hurts on the guest came from no blow on its screen`);
  return { line, problems };
}

/** The first frame from `from` on in which `has(sample)` holds (none: -1). */
function firstWhere(samples, has, from = 0) {
  for (let f = from; f < samples.length; f++) if (has(samples[f])) return f;
  return -1;
}

/**
 * A guest brought down and raised: when it went down on its own screen and on the host's, when the host raised it
 * and when its own screen showed it, frames (-1: never).
 */
export function judgeDown(host, guest) {
  const downHere = firstWhere(guest, (sample) => sample.standing.self === 'down');
  const downThere = firstWhere(host, (sample) => sample.standing.partner === 'down');
  const raisedThere = downThere < 0 ? -1 : firstWhere(host, (sample) => sample.standing.partner === 'up', downThere);
  const raisedHere = downHere < 0 ? -1 : firstWhere(guest, (sample) => sample.standing.self === 'up', downHere);
  return { downHere, downThere, raisedThere, raisedHere };
}

function describeDown(host, guest, frameMs) {
  const down = judgeDown(host, guest);
  const at = (frame) => (frame < 0 ? 'never' : `at ${((frame * frameMs) / 1000).toFixed(2)} s`);
  const line = `the guest went down ${at(down.downHere)} on its screen and ${at(down.downThere)} on the host's; ` +
    `the host raised it ${at(down.raisedThere)}, and its own screen showed it ${at(down.raisedHere)}`;
  const problems = [];
  if (down.downHere < 0 || down.downThere < 0) problems.push('the guest never went down on both screens');
  if (down.raisedThere < 0 || down.raisedHere < 0) problems.push('the guest was never raised on both screens');
  return { line, problems };
}

/** The runs of frames of `samples` in which `hidden(sample)` holds: each one's first frame and the first after it. */
function hiddenRuns(samples, hidden) {
  const runs = [];
  let start = -1;
  samples.forEach((sample, frame) => {
    const now = hidden(sample);
    if (now && start < 0) start = frame;
    if (!now && start >= 0) {
      runs.push({ frame: start, from: start, to: frame });
      start = -1;
    }
  });
  if (start >= 0) runs.push({ frame: start, from: start, to: samples.length });
  return runs;
}

/** The ids of the foes of `samples` dazed afresh within frames [from, to]. */
function dazedWithin(samples, from, to) {
  const ids = new Set();
  for (let frame = Math.max(1, from); frame <= Math.min(to, samples.length - 1); frame++) {
    for (const foe of samples[frame].foes) {
      const before = samples[frame - 1].foes.find((one) => one.id === foe.id);
      if (foe.dazed && !before?.dazed) ids.add(foe.id);
    }
  }
  return ids;
}

/** How far foe `id` moved on `samples`' screen over frames [from, to] while it showed dazed, m. */
function movedDazed(samples, id, from, to) {
  let moved = 0;
  for (let frame = from + 1; frame <= Math.min(to, samples.length - 1); frame++) {
    const now = samples[frame].foes.find((one) => one.id === id);
    const before = samples[frame - 1].foes.find((one) => one.id === id);
    if (!now?.dazed || !before) continue;
    moved += distance([now.x, now.z], [before.x, before.z]);
  }
  return moved;
}

/** how long after a blink hid the guest on its own screen the host may hide its copy, frames */
const BLINK_AFTER = 60;
/** how long before the guest vanished its blink may daze a foe (its coming apart), and after it a daze may take to
 *  show on the host, frames */
const DAZE_BEFORE = 12;
const DAZE_AFTER = 60;
/** the frames after its copy formed again on the host's screen that its slide is measured over */
const SLIDE_FRAMES = 20;
/** a copy coming out further than this from where the guest did on its own screen is off, m */
const CAME_OUT_OFF = 0.5;
/** the frames before its copy vanished, and from when it formed again, that its moves are looked at over (coming
 *  apart and put together, its body drawn) */
const AROUND_FRAMES = 10;

/** The largest move a frame of `points` over frames [from, to]. */
function largestMoveOver(points, from, to) {
  return largestMove(points.slice(Math.max(0, from), to + 1));
}

/**
 * The guest's blinks: each one that hid it on its own screen, how far it crossed there, when and for how long the host
 * hid its copy, the copy's largest move a frame there as it came apart and as it formed again, how far from where the
 * guest came out on its own screen the copy came out and how far it moved after; the foes each blink dazed on the
 * guest's screen against those dazed on the host's, and how far each went on the guest's screen while shown dazed.
 */
export function judgeBlinks(host, guest) {
  const own = hiddenRuns(guest, (sample) => !sample.shown.self);
  const there = hiddenRuns(host, (sample) => sample.shown.partner === false);
  const used = new Set();
  const partner = host.map((sample) => sample.partner);
  const blinks = own.map((run) => {
    const seen = takeWithin(there, used, run.from, run.from + BLINK_AFTER);
    const dazedHere = dazedWithin(guest, run.from - DAZE_BEFORE, run.from);
    const dazedThere = dazedWithin(host, run.from - DAZE_BEFORE, run.from + DAZE_AFTER);
    const moved = [...dazedHere].map((id) => movedDazed(guest, id, run.from - DAZE_BEFORE, run.from + DAZE_AFTER));
    const blink = { at: run.from, hiddenHere: run.to - run.from, seen: !!seen, dazedHere, dazedThere, moved };
    if (!seen || seen.to >= host.length || run.to >= guest.length) return blink;
    const formedThere = host[seen.to].partner;
    const settled = host[Math.min(seen.to + SLIDE_FRAMES, host.length - 1)].partner;
    return {
      ...blink,
      crossed: distance(guest[Math.max(0, run.from - 1)].self, guest[run.to].self),
      delay: seen.from - run.from,
      hiddenThere: seen.to - seen.from,
      apart: largestMoveOver(partner, seen.from - AROUND_FRAMES, seen.from - 1),
      forming: largestMoveOver(partner, seen.to, seen.to + AROUND_FRAMES),
      cameOut: distance(formedThere, guest[run.to].self),
      slid: distance(formedThere, settled),
    };
  });
  return { blinks, unmatched: there.length - used.size };
}

/** `staffs`: the frame the guest takes up the healing staff at (page/coop.ts `STAFFS.mend`), and the Health the
 *  host must gain back from then at the least */
const STAFFS_MEND = 300;
const STAFFS_HEALED = 60;

/** The ids of the foes `samples` shows alight in any frame. */
function everBurning(samples) {
  const ids = new Set();
  for (const sample of samples) for (const foe of sample.foes) if (foe.burning) ids.add(foe.id);
  return ids;
}

/**
 * The staffs (#402): the foes the guest's fire staff set alight on its own screen against those the host shows
 * alight, the life the burning and the orbs took off them on the host's, the Health the host gained back under
 * the guest's healing beam on its own screen, and the + over its frame on the guest's.
 */
function describeStaffs(host, guest) {
  const here = everBurning(guest);
  const there = everBurning(host);
  const both = [...here].filter((id) => there.has(id)).length;
  const lifeOf = (sample) => sample.foes.reduce((sum, foe) => sum + foe.life, 0);
  const hurt = lifeOf(host[0]) - lifeOf(host[Math.min(STAFFS_MEND, host.length - 1)]);
  const after = host.slice(STAFFS_MEND + 2);
  const low = Math.min(...after.map((sample) => sample.life));
  const healed = after.length ? after[after.length - 1].life - low : 0;
  const marked = guest.slice(STAFFS_MEND).filter((sample) => sample.healedShown).length;
  const line = `staffs: ${here.size} foes alight on the guest's screen, ${both} of them on the host's `
    + `(${there.size - both} on the host's alone); the foes lost ${Math.round(hurt)} life on the host's; the host `
    + `healed ${Math.round(healed)} under the guest's beam, from ${Math.round(low)}; its frame on the guest's `
    + `screen showed it healed for ${marked} frames`;
  const problems = [];
  if (!here.size) problems.push('the guest\'s fire staff set no foe alight on its own screen');
  if (both < here.size) problems.push(`${here.size - both} foes alight on the guest's screen never showed alight on the host's`);
  if (hurt <= 0) problems.push('the guest\'s fire took no life off the foes on the host\'s screen');
  if (healed < STAFFS_HEALED) problems.push(`the host healed ${Math.round(healed)} under the guest's beam, under ${STAFFS_HEALED}`);
  if (!marked) problems.push('the host\'s frame on the guest\'s screen never showed it healed');
  return { line, problems };
}

function describeBlinks(host, guest, frameMs) {
  const { blinks, unmatched } = judgeBlinks(host, guest);
  const seen = blinks.filter((blink) => blink.delay !== undefined);
  const most = (values) => Math.max(0, ...values);
  const crossed = seen.map((blink) => blink.crossed);
  const formed = seen.length
    ? ` (crossing ${median(crossed).toFixed(2)} m on its own, the least ${Math.min(...crossed).toFixed(2)} m), ` +
      `${ms(median(seen.map((blink) => blink.delay)), frameMs)} later (median), hidden ` +
      `${ms(median(seen.map((blink) => blink.hiddenThere)), frameMs)} there against ` +
      `${ms(median(seen.map((blink) => blink.hiddenHere)), frameMs)} on its own; its copy's largest move a frame ` +
      `there as it came apart ${cm(most(seen.map((blink) => blink.apart)))} and as it formed ` +
      `${cm(most(seen.map((blink) => blink.forming)))} (the most); it came out ` +
      `${cm(median(seen.map((blink) => blink.cameOut)))} from where it did on its own screen (the most ` +
      `${cm(most(seen.map((blink) => blink.cameOut)))}) and moved ${cm(median(seen.map((blink) => blink.slid)))} ` +
      `after (the most ${cm(most(seen.map((blink) => blink.slid)))})`
    : '';
  const here = blinks.flatMap((blink) => [...blink.dazedHere]).length;
  const agreed = blinks.flatMap((blink) => [...blink.dazedHere].filter((id) => blink.dazedThere.has(id))).length;
  const thereAlone = blinks.flatMap((blink) => [...blink.dazedThere].filter((id) => !blink.dazedHere.has(id))).length;
  const moved = blinks.flatMap((blink) => blink.moved);
  const went = moved.length
    ? `; a foe dazed went ${cm(median(moved))} on the guest's screen while shown dazed (median, the most ` +
      `${cm(most(moved))})`
    : '';
  const line = `blinks: ${blinks.length} on the guest's screen, ${seen.length} hid it on the host's${formed}; foes ` +
    `dazed: ${here} on the guest's screen, ${agreed} of them on the host's, ${thereAlone} on the host's alone${went}`;
  const problems = [];
  if (!blinks.length) problems.push('the guest never blinked');
  const unseen = blinks.length - seen.length;
  if (unseen) problems.push(`${unseen} blinks never hid the guest on the host's screen`);
  if (unmatched) problems.push(`the host hid the guest ${unmatched} times with no blink on its own screen`);
  const off = seen.filter((blink) => blink.cameOut > CAME_OUT_OFF).length;
  if (off) {
    problems.push(`${off} blinks came out more than ${cm(CAME_OUT_OFF)} from where they did on the guest's screen`);
  }
  if (agreed < here) problems.push(`${here - agreed} foes dazed on the guest's screen were never dazed on the host's`);
  if (thereAlone) problems.push(`${thereAlone} foes dazed on the host's screen weren't on the guest's`);
  return { line, problems };
}

/** a hero's size (m, entities/player.ts `radius`): a foe whose middle ends within it of his along his charge ended
 *  level with him, beside him */
const HERO_RADIUS = 0.45;
/** a foe flying this high off a charge was thrown (m) */
const THROWN_UP = 0.2;

/** The way the guest's charge went on its own screen (along the ground, its length 1) and where it stopped. */
function chargeOf(guest) {
  const from = guest[0].self;
  const stop = guest[guest.length - 1].self;
  const length = distance(stop, from) || 1;
  return { way: [(stop[0] - from[0]) / length, (stop[1] - from[1]) / length], stop };
}

/** How far before `stop` along `way` a point is (m; less than 0 behind). */
const alongFrom = (point, stop, way) => (point[0] - stop[0]) * way[0] + (point[1] - stop[1]) * way[1];

/** One foe on one screen: whether it was carried and thrown there, and where it ended along the charge from the
 *  guest's stop as that screen shows it. */
function foeOnScreen(samples, id, stopOf, way) {
  const shown = samples.map((sample) => sample.foes.find((foe) => foe.id === id)).filter(Boolean);
  if (!shown.length) return null;
  const last = shown[shown.length - 1];
  const carried = shown.some((foe) => foe.carried);
  const thrown = shown.some((foe) => (foe.up ?? 0) > THROWN_UP);
  const stop = stopOf(samples);
  const at = (foe) => (foe ? alongFrom([foe.x, foe.z], stop, way) : NaN);
  // (where it was let go, its last frame carried, and where it came down, its first on its feet after the air)
  const letGo = shown.findLastIndex((foe) => foe.carried);
  const rose = shown.findIndex((foe, f) => f > letGo && (foe.up ?? 0) > 0);
  const landed = rose < 0 ? -1 : shown.findIndex((foe, f) => f > rose && !(foe.up ?? 0));
  return { carried, thrown, ended: at(last), letGo: at(shown[letGo]), landed: at(shown[landed]) };
}

/**
 * The guest's charge: each foe it met on its own screen (carried there), whether the host's screen carried and threw
 * it too, and where it ended on each against where the guest stopped on it (the guest's own hero on its screen, its
 * copy on the host's).
 */
export function judgeRush(host, guest) {
  const { way } = chargeOf(guest);
  const ownStop = (samples) => samples[samples.length - 1].self;
  const partnerStop = (samples) => samples[samples.length - 1].partner ?? [NaN, NaN];
  return foeIds(guest).map((id) => ({
    id,
    here: foeOnScreen(guest, id, ownStop, way),
    there: foeOnScreen(host, id, partnerStop, way),
  })).filter((foe) => foe.here?.carried);
}

function describeRush(host, guest) {
  const met = judgeRush(host, guest);
  const ends = (screen) => met.map((foe) => (foe[screen] ? `${foe[screen].ended.toFixed(2)} m` : 'unshown'));
  const line = `the guest's charge met ${met.length} foes on its screen, ` +
    `${met.filter((foe) => foe.there?.carried).length} of them carried on the host's, thrown ` +
    `${met.filter((foe) => foe.here.thrown).length} on its screen and ` +
    `${met.filter((foe) => foe.there?.thrown).length} on the host's; they ended before it ` +
    `${ends('here').join(', ')} on its screen and ${ends('there').join(', ')} on the host's`;
  // (where each was let go and came down on each screen, along the charge from the guest's stop there)
  const way = (where) => (where ? `let go ${where.letGo.toFixed(2)}, down ${where.landed.toFixed(2)}` : 'unshown');
  const flights = met.map((foe) => `foe ${foe.id} ${way(foe.here)} on its screen, ${way(foe.there)} on the host's`);
  // (each one's largest move a frame on the guest's screen, when, and how far its copy was from the host's then)
  const moves = met.map((foe) => {
    const shown = foePath(guest, foe.id);
    const source = foePath(host, foe.id);
    const { move, frame } = largestMoveAt(shown);
    const apart = frame >= 0 && shown[frame] && source[frame] ? distance(shown[frame], source[frame]) : NaN;
    return `foe ${foe.id} ${cm(move)} at frame ${frame} (${cm(apart)} from the host's then)`;
  });
  const lines = [
    line, `    each before the guest's stop (m): ${flights.join('; ')}`,
    `    the largest move a frame of each: ${moves.join(', ')}`,
  ];
  const problems = [];
  if (!met.length) problems.push('the guest\'s charge met no foe on its screen');
  for (const foe of met) {
    if (!foe.there?.carried) problems.push(`foe ${foe.id}, carried on the guest's screen, wasn't on the host's`);
    if (!foe.here.thrown) problems.push(`foe ${foe.id} wasn't thrown on the guest's screen`);
    if (foe.there && !foe.there.thrown) problems.push(`foe ${foe.id} wasn't thrown on the host's screen`);
    for (const [screen, where] of [['guest', foe.here], ['host', foe.there]]) {
      if (!where || where.ended >= HERO_RADIUS) continue;
      problems.push(`foe ${foe.id} ended ${where.ended.toFixed(2)} m before the guest on the ${screen}'s screen`);
    }
  }
  return { line: lines.join('\n'), problems };
}

/** the skill the guest in `strike` charges before its charge, as each game names it */
const STRIKE = 'powerStrike';

/**
 * The guest's Power Strike cast as its charge runs over it, on one screen (`who`: the guest's own hero on its own
 * screen, `self`, or its copy on the host's, `partner`): the frames the two ran together and those it was shown as
 * the charge in instead, the frame it landed (-1: never) and whether the charge ran then, and the first frame its
 * cast went on no longer building (a copy's taken as landed as the charge cast over it landed, its charge-up stopped
 * short of its blow).
 */
export function judgeStrike(samples, who) {
  const acts = samples.map((sample) => sample.acts?.[who] ?? null);
  const together = acts.filter((act) => act?.dashing && act.casting === STRIKE);
  const asCharge = together.filter((act) => act.shown === 'charge').length;
  const landed = acts.findIndex((act) => act?.landed.includes(STRIKE));
  const inCharge = landed >= 0 && Boolean(acts[landed].dashing);
  const builtTo = acts.findIndex((act) => act?.casting === STRIKE && !act.charging);
  return { together: together.length, asCharge, landed, inCharge, builtTo };
}

/** What went wrong with the guest's Power Strike under its charge on one screen (`one`: `judgeStrike`'s). */
function strikeProblems(one, where) {
  const strike = 'the guest\'s Power Strike';
  const problems = [];
  if (one.landed < 0) problems.push(`${strike} never landed ${where}`);
  else if (!one.inCharge) problems.push(`${strike} landed ${where} with no charge running`);
  if (!one.together) problems.push(`${strike} and its charge never ran together ${where}`);
  if (one.asCharge) problems.push(`the guest's charge shown instead of ${strike} ${one.asCharge} frames ${where}`);
  if (one.builtTo >= 0 && one.builtTo < one.landed) {
    problems.push(`${strike} stopped building ${one.landed - one.builtTo} frames before it landed ${where}`);
  }
  return problems;
}

function describeStrike(host, guest) {
  const screens = [['its', judgeStrike(guest, 'self')], ['the host\'s', judgeStrike(host, 'partner')]];
  const problems = [];
  const parts = screens.map(([whose, one]) => {
    const where = `on ${whose} screen`;
    problems.push(...strikeProblems(one, where));
    const inCharge = one.inCharge ? ' in the charge' : '';
    const landed = one.landed < 0 ? 'never landed' : `landed at frame ${one.landed}${inCharge}`;
    const shown = `shown over the charge ${one.together - one.asCharge} of ${one.together} frames`;
    return `${landed} ${where}, ${shown}, building to frame ${one.builtTo}`;
  });
  return { line: `the guest's Power Strike under its charge: ${parts.join('; ')}`, problems };
}

/** how long after the guest's screen showed a foe evade the host's may show it, frames (the link and the playout) */
const EVADE_AFTER = 60;
/** a foe moving further than this in a frame on the host's screen has blinked, m */
const BLINK_JUMP = 2;
/** a copy that blinked coming back further than this from where the host's foe came out is off, m */
const EVADE_OFF = 0.6;

/** The runs of frames in which foe `id` shows `state` (`ducked`, `gone`) on `samples`' screen. */
function foeRuns(samples, id, state) {
  return hiddenRuns(samples, (sample) => Boolean(sample.foes.find((foe) => foe.id === id)?.[state]));
}

/** The frames foe `id` blinked on the host's screen (moved further than `BLINK_JUMP` in a frame), each with where it
 *  came out. */
function foeJumps(samples, id) {
  const path = foePath(samples, id);
  const jumps = [];
  for (let frame = 1; frame < path.length; frame++) {
    if (!path[frame] || !path[frame - 1]) continue;
    if (distance(path[frame], path[frame - 1]) > BLINK_JUMP) jumps.push({ frame, at: path[frame] });
  }
  return jumps;
}

/**
 * The foes getting out of the guest's shots, which its own game judges on its copies (entities/evade.ts): each duck
 * on its screen against one on the host's within `EVADE_AFTER`, each blink (its copy gone) against the host's foe
 * jumping within it, and how far from where the host's came out the copy came back; and the host's ducks and blinks
 * with none on the guest's screen.
 */
export function judgeEvades(host, guest) {
  const tally = { ducks: 0, ducksSeen: 0, blinks: 0, blinksSeen: 0, cameBack: [], hostAlone: 0 };
  for (const id of foeIds(host)) {
    const ducksHere = foeRuns(guest, id, 'ducked');
    const ducksThere = foeRuns(host, id, 'ducked');
    const usedDucks = new Set();
    for (const duck of ducksHere) {
      tally.ducks++;
      if (takeWithin(ducksThere, usedDucks, duck.from, duck.from + EVADE_AFTER)) tally.ducksSeen++;
    }
    tally.hostAlone += ducksThere.length - usedDucks.size;
    const jumps = foeJumps(host, id);
    const usedJumps = new Set();
    for (const gone of foeRuns(guest, id, 'gone')) {
      tally.blinks++;
      const jump = takeWithin(jumps, usedJumps, gone.from, gone.from + EVADE_AFTER);
      if (!jump) continue;
      tally.blinksSeen++;
      const back = gone.to < guest.length ? foePath(guest, id)[gone.to] : null;
      if (back) tally.cameBack.push(distance(back, jump.at));
    }
    tally.hostAlone += jumps.length - usedJumps.size;
  }
  return tally;
}

function describeEvades(host, guest) {
  const tally = judgeEvades(host, guest);
  const back = tally.cameBack.length
    ? `, its copy back ${cm(median(tally.cameBack))} from where the host's came out (the most `
      + `${cm(Math.max(...tally.cameBack))})`
    : '';
  const line = `evades on the guest's screen: ${tally.ducks} ducks, ${tally.ducksSeen} shown on the host's; `
    + `${tally.blinks} blinks, ${tally.blinksSeen} shown on the host's${back}; on the host's alone ${tally.hostAlone}`;
  const problems = [];
  if (!tally.ducks) problems.push('no foe ducked out of the guest\'s shots');
  if (!tally.blinks) problems.push('no foe blinked out of the guest\'s shots');
  if (tally.ducksSeen < tally.ducks) problems.push(`${tally.ducks - tally.ducksSeen} ducks never shown on the host's`);
  if (tally.blinksSeen < tally.blinks) {
    problems.push(`${tally.blinks - tally.blinksSeen} blinks never shown on the host's`);
  }
  const off = tally.cameBack.filter((metres) => metres > EVADE_OFF).length;
  if (off) problems.push(`${off} blinked copies came back more than ${cm(EVADE_OFF)} from where the host's foe did`);
  if (tally.hostAlone) problems.push(`${tally.hostAlone} evades on the host's screen with none on the guest's`);
  return { line, problems };
}

/** how far apart the two screens may land a chunk of lava (m: a frame of its flight, as each last saw it) */
const LANDED_APART = 0.3;
/** how near a landing the guest's hurt must come, frames */
const LANDED_HURT = 3;
/** how far the guest may move while a vine holds it (m), walking all the while */
const HELD_MOVE = 0.1;
/** the least share of the guest's held frames its copy must be shown in coils on the host's screen */
const COILED_SHARE = 0.5;

/** Whether a game's own hero lost life within `span` frames of `frame`. */
function hurtNear(samples, frame, span) {
  const first = Math.max(1, frame - span);
  const last = Math.min(samples.length - 1, frame + span);
  for (let f = first; f <= last; f++) {
    if (samples[f - 1].life - samples[f].life > LIFE_DROP) return true;
  }
  return false;
}

/** The chunks of lava each screen saw land, the vines sent, the guest's hold on its screen and on the host's. */
function judgeThrows(host, guest) {
  const landedAt = (sample, frame) => (sample.thrown?.landed ?? []).map((at) => ({ at, frame }));
  const landed = (samples) => samples.flatMap(landedAt);
  const vines = (samples) => samples.reduce((sum, sample) => sum + (sample.thrown?.vines ?? 0), 0);
  const hostLanded = landed(host), guestLanded = landed(guest);
  const apart = guestLanded.map(({ at }) => Math.min(Infinity, ...hostLanded.map((other) => distance(at, other.at))));
  const hurtAt = guestLanded.filter(({ frame }) => hurtNear(guest, frame, LANDED_HURT));
  const held = guest.map((sample) => Boolean(sample.thrown?.held));
  let heldFrames = 0, coiled = 0, moved = 0, from = null;
  held.forEach((isHeld, frame) => {
    if (!isHeld) {
      from = null;
      return;
    }
    heldFrames++;
    from ??= guest[frame].self;
    moved = Math.max(moved, distance(guest[frame].self, from));
    const near = host.slice(frame, frame + MOST_DELAY);
    if (near.some((sample) => sample.thrown?.coiled)) coiled++;
  });
  const hostHeld = host.filter((sample) => sample.thrown?.held).length;
  return {
    hostLanded: hostLanded.length, guestLanded: guestLanded.length, apart, hurt: hurtAt.length,
    hostVines: vines(host), guestVines: vines(guest), heldFrames, coiled, moved, hostHeld,
  };
}

function describeThrows(host, guest) {
  const t = judgeThrows(host, guest);
  const most = t.apart.length ? Math.max(...t.apart) : 0;
  const line = `lava: ${t.guestLanded} chunks landed on the guest's screen, ${t.hostLanded} on the host's (the most `
    + `${cm(most)} apart), ${t.hurt} hurting the guest as they landed; vines: ${t.guestVines} on the guest's screen, `
    + `${t.hostVines} on the host's, the guest held ${t.heldFrames} frames (moved ${cm(t.moved)} walking), shown in `
    + `coils on the host's for ${t.coiled} of them; the host held ${t.hostHeld} frames`;
  const problems = [];
  if (!t.guestLanded) problems.push('no lava landed on the guest\'s screen');
  if (t.hostLanded !== t.guestLanded) {
    problems.push(`${t.guestLanded} chunks on the guest's screen, ${t.hostLanded} on the host's`);
  }
  if (most > LANDED_APART) problems.push(`a chunk landed ${cm(most)} apart on the two screens`);
  if (t.guestLanded && !t.hurt) problems.push('no chunk hurt the guest as it landed at its feet');
  if (!t.guestVines) problems.push('no vine on the guest\'s screen');
  if (t.hostVines !== t.guestVines) {
    problems.push(`${t.guestVines} vines on the guest's screen, ${t.hostVines} on the host's`);
  }
  if (!t.heldFrames) problems.push('no vine held the guest');
  if (t.moved > HELD_MOVE) problems.push(`the guest walked ${cm(t.moved)} while held`);
  if (t.heldFrames && t.coiled < t.heldFrames * COILED_SHARE) {
    problems.push(`the guest's copy in coils on the host's screen for ${t.coiled} of its ${t.heldFrames} held frames`);
  }
  if (t.hostHeld) problems.push(`the host, far off, held ${t.hostHeld} frames`);
  return { line, problems };
}

/**
 * Where a game shows `who` (its own hero, `self`, or its `partner`) a frame, none where its body isn't drawn (a
 * blink's crossing: no one sees it move there).
 */
function drawnAt(samples, who) {
  return samples.map((sample) => (sample.shown?.[who] === false ? null : sample[who]));
}

/**
 * A scenario judged: its lines (each copy's following, the arrows, the blows, as the scenario has them) and the
 * problems found. `host` and `guest` are the two games' samples, frame for frame.
 */
/** how long a guest's copy may stand after the host's foe has gone, its death's report lost (s): the host's
 *  snapshots no longer name it for a second (`GHOST_SNAPSHOTS` in src/net/sync.ts), with the link's delay on top */
const GHOST_SLACK = 1.6;

/**
 * Each foe's last frame standing on the host's screen and on the guest's, in `ghosts` (its death's report never
 * reaching the guest): how long the copy stood after, and whether it never went. Returns `{ foes: [{ id, host, guest,
 * left }] }` (frames; `left`: still standing at the end).
 */
export function judgeGhosts(host, guest) {
  const ids = new Set(host.flatMap((sample) => sample.foes.map((foe) => foe.id)));
  const lastOn = (samples, id) => samples.findLastIndex((sample) => sample.foes.some((foe) => foe.id === id));
  return {
    foes: [...ids].map((id) => {
      const hostLast = lastOn(host, id), guestLast = lastOn(guest, id);
      return { id, host: hostLast, guest: guestLast, left: guestLast === guest.length - 1 };
    }),
  };
}

function describeGhosts(host, guest, frameMs) {
  const { foes } = judgeGhosts(host, guest);
  const problems = [];
  const said = foes.map((foe) => {
    const after = (foe.guest - foe.host) * frameMs / 1000;
    if (foe.left) problems.push(`foe ${foe.id} still stood on the guest's screen at the end, gone from the host's ${(((guest.length - 1) - foe.host) * frameMs / 1000).toFixed(1)} s before`);
    else if (after > GHOST_SLACK) problems.push(`foe ${foe.id} stood on the guest's screen ${after.toFixed(2)} s after the host's went`);
    return `${foe.id} ${foe.left ? 'never went' : `went ${after.toFixed(2)} s after`}`;
  });
  if (!foes.length) problems.push('no foe stood on the host\'s screen');
  return { line: `copies whose deaths' reports were lost, on the guest's screen after the host's foe went: ${said.join(', ')}`, problems };
}

/** how long a risen foe may go undrawn on a screen before it's a problem (s): a frame or two of hand-over */
const UNDRAWN_SLACK = 0.25;

/**
 * Each foe a screen shows risen, frame by frame (`FoeSample.risen`, `drawn`, `hidden`): the frames it went undrawn
 * all the same, the longest run of them and why. Returns, by foe id: its risen frames, undrawn frames, longest
 * undrawn run (frames) and the reason the game gave first.
 */
export function undrawnFoes(samples) {
  const byId = new Map();
  for (const sample of samples) {
    for (const foe of sample.foes) {
      if (foe.risen === undefined || !foe.risen) continue;
      const seen = byId.get(foe.id) ?? { risen: 0, undrawn: 0, run: 0, longest: 0, why: '' };
      seen.risen++;
      if (foe.drawn) seen.run = 0;
      else {
        seen.undrawn++;
        seen.run++;
        seen.longest = Math.max(seen.longest, seen.run);
        seen.why ||= foe.hidden;
      }
      byId.set(foe.id, seen);
    }
  }
  return byId;
}

/** Each screen's risen foes against what it drew: every one undrawn longer than `UNDRAWN_SLACK` is a problem. */
function describeDrawnFoes(host, guest, frameMs) {
  const problems = [];
  const parts = [['the host\'s', host], ['the guest\'s', guest]].map(([whose, samples]) => {
    const seen = undrawnFoes(samples);
    const most = Math.round((UNDRAWN_SLACK * 1000) / frameMs);
    const lost = [...seen].filter(([, foe]) => foe.longest > most);
    for (const [id, foe] of lost) {
      const longest = ms(foe.longest, frameMs);
      problems.push(`foe ${id} risen but undrawn on ${whose} screen for ${longest} at a stretch (${foe.why})`);
    }
    return `${whose} screen: ${seen.size} foes risen, ${lost.length} undrawn past ${UNDRAWN_SLACK * 1000} ms`;
  });
  const hostIds = new Set(foeIds(host));
  const guestIds = new Set(foeIds(guest));
  const missing = [...hostIds].filter((id) => !guestIds.has(id));
  if (missing.length) {
    problems.push(`${missing.length} of the host's foes never on the guest's screen (${missing.join(', ')})`);
  }
  const line = `foes drawn: ${parts.join('; ')}; ${missing.length} of the host's ${hostIds.size} never on the guest's`;
  return { line, problems };
}

export function judgeScenario({ name, about, host, guest, frameMs }) {
  const lines = [`${name} (${about})`];
  const problems = [];
  const add = ({ line, problem, problems: more }) => {
    lines.push(`  ${line}`);
    if (problem) problems.push(`${name}: ${problem}`);
    for (const one of more ?? []) problems.push(`${name}: ${one}`);
  };
  const guestOnHost = follow(drawnAt(host, 'partner'), drawnAt(guest, 'self'));
  add(describeFollow('the guest\'s hero on the host\'s screen', guestOnHost, frameMs));
  const hostOnGuest = follow(drawnAt(guest, 'partner'), drawnAt(host, 'self'));
  add(describeFollow('the host\'s hero on the guest\'s screen', hostOnGuest, frameMs));
  for (const [what, samples] of [["the host's play-out", host], ["the guest's play-out", guest]]) {
    const line = describePlayout(what, samples);
    if (line) lines.push(`  ${line}`);
  }
  if (foeIds(host).length) add(describeFoes(host, guest, frameMs));
  if (name === 'shoot') add(describeShots(host, guest, frameMs));
  if (name === 'evade') add(describeEvades(host, guest));
  if (name === 'throws') add(describeThrows(host, guest));
  if (name === 'dodge') add(describeBlows(guest, frameMs));
  if (name === 'down') add(describeDown(host, guest, frameMs));
  if (name === 'blink') add(describeBlinks(host, guest, frameMs));
  if (name === 'staffs') add(describeStaffs(host, guest));
  if (name === 'rush' || name === 'strike') add(describeRush(host, guest));
  if (name === 'strike') add(describeStrike(host, guest));
  if (name === 'wave') add(describeDrawnFoes(host, guest, frameMs));
  if (name === 'ghosts') add(describeGhosts(host, guest, frameMs));
  if (name === 'ping') add(describePings(host, guest, frameMs));
  if (name === 'chat') add(describeChat(host, guest, frameMs));
  return { lines, problems };
}
