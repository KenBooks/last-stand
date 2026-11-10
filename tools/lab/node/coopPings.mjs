// `lab coop`'s `ping` scenario judged (page/coopPing.ts plays it): every ping the scenario means must be made by its
// sender's game as meant (its kind, where, one size, a foe's centred on it), and shown on both screens, the sender's and its
// partner's, in the world (its pin and its ring on the floor) and on the minimap where it points; on the partner's
// within a second of the sender's.

/** how late a ping may come to the partner's screen (ms: the link's round trip is 300 by default, each way half) */
const PING_LATE = 1000;
/** how far apart the two screens may show one ping (m), a foe's (its copy is where the host's reports put it) */
const APART = 0.3;
const FOE_APART = 0.6;
/** how far from a ping the minimap may draw it (m: one of its pixels is 0.32) */
const MAP_OFF = 0.7;
/** how far across the screen a foe's ping's pin may stand from the foe's middle (css px: from play, "center point
 *  above mob. not side") */
const OFF_FOE = 3;
/** the frames before a held key's ping is let go its preview must show in (of the key's 20 held) */
const PREVIEW_FRAMES = 10;

/**
 * The held key's preview of a ping made on frame `made` of `samples` (its sender's): the frames just before it in
 * which it showed as the ping it made (its kind, within `near` of where it was made), its pin and ring shown.
 */
export function previewedFrames(samples, made, near) {
  let frames = 0;
  for (let frame = Math.max(0, made.from - PREVIEW_FRAMES); frame < made.from; frame++) {
    const preview = samples[frame]?.preview;
    if (!preview || preview.kind !== made.kind || !preview.pin || !preview.ring) continue;
    if (Math.hypot(preview.x - made.x, preview.z - made.z) <= near) frames++;
  }
  return frames;
}

const cm = (m) => `${Math.round(m * 100)} cm`;

/**
 * The pings a game showed (its samples, frame by frame), each counted once from the frame it came: who sent it (its
 * slot), what and where it first showed, and each frame of it (its pin, its ring, its minimap mark). A new ping from a
 * sender is told by its age starting again.
 */
export function pingsShown(samples) {
  const shown = [];
  const current = new Map();
  samples.forEach((sample, frame) => {
    const seen = new Set();
    for (const ping of sample.pings ?? []) {
      seen.add(ping.slot);
      let one = current.get(ping.slot);
      if (!one || ping.age < one.lastAge) {
        one = { slot: ping.slot, kind: ping.kind, x: ping.x, z: ping.z, r: ping.r, foe: ping.foe, from: frame, frames: [] };
        shown.push(one);
        current.set(ping.slot, one);
      }
      one.lastAge = ping.age;
      one.frames.push(ping);
    }
    for (const slot of [...current.keys()]) if (!seen.has(slot)) current.delete(slot);
  });
  return shown;
}

/**
 * Whether a ping held first over one place (`p.from`) and let go on another showed its preview over the one and then
 * the other as the key was held: over the floor's spot as a spot, then on the foe as a foe.
 */
export function previewMoved(samples, made, p) {
  let onFloor = -1, onFoe = -1;
  for (let frame = Math.max(0, made.from - 60); frame < made.from; frame++) {
    const preview = samples[frame]?.preview;
    if (!preview) continue;
    if (preview.kind === 'spot' && Math.hypot(preview.x - p.from[0], preview.z - p.from[1]) < APART && onFloor < 0) onFloor = frame;
    if (preview.kind === 'foe' && onFloor >= 0 && frame > onFloor) onFoe = frame;
  }
  return onFoe > onFloor && onFloor >= 0;
}

/** how near the screen's edge a ping held at it in first person must be (share of the screen's smaller side, from
 *  its pin's head to the nearest edge), and the least frames the guest's settled first person view must hold one */
const EDGE_NEAR = 0.16;
const FIRST_FRAMES = 30;

/**
 * The partner's pings on a game's screen through its settled first person view (`samples`, its own slot `slot`):
 * the frames one was held at the screen's edge, the farthest its pin's head was from the nearest edge (share of the
 * smaller side), and the frames it lay over the minimap.
 */
export function firstPersonEdge(samples, slot) {
  let frames = 0, farthest = 0, overMap = 0;
  for (const sample of samples) {
    const view = sample.view;
    if (!view || view.mode !== 'first' || !view.settled) continue;
    for (const ping of sample.pings ?? []) {
      if (ping.slot === slot || !ping.pin || !ping.edge) continue;
      const [w, h] = view.screen, [x, y] = ping.head;
      frames++;
      farthest = Math.max(farthest, Math.min(x, y, w - x, h - y) / Math.min(w, h));
      const m = view.minimap;
      if (m && x >= m[0] && x <= m[2] && y >= m[1] && y <= m[3]) overMap++;
    }
  }
  return { frames, farthest, overMap };
}

/** How one game showed a ping: whether its pin, its ring and its minimap mark showed, and the mark's way off. */
function howShown(one) {
  const marks = one.frames.filter((frame) => frame.map);
  const off = marks.length ? Math.max(...marks.map((frame) => Math.hypot(frame.map[0] - frame.x, frame.map[1] - frame.z))) : null;
  return {
    pin: one.frames.some((frame) => frame.pin),
    ring: one.frames.some((frame) => frame.ring),
    map: marks.length > 0,
    off,
  };
}

/** What's missing of a ping on one screen (`whose`), as problems. */
function shownProblems(what, whose, how) {
  const problems = [];
  if (!how.pin) problems.push(`${what}: no pin over it on ${whose} screen`);
  if (!how.ring) problems.push(`${what}: no ring on the floor on ${whose} screen`);
  if (!how.map) problems.push(`${what}: not on ${whose} minimap`);
  else if (how.off > MAP_OFF) problems.push(`${what}: ${whose} minimap drew it ${cm(how.off)} off`);
  return problems;
}

/**
 * The scenario's pings judged: `host` and `guest` are the two games' samples, frame for frame (the first carrying
 * the pings meant, `planned`). Returns a line for each ping and the problems.
 */
export function judgePings({ host, guest, frameMs }) {
  const planned = guest[0]?.planned ?? host[0]?.planned ?? [];
  const screens = { host, guest };
  const slots = { host: host[0]?.slot, guest: guest[0]?.slot };
  const shown = { host: pingsShown(host), guest: pingsShown(guest) };
  const lines = [];
  const problems = [];
  const pressedOn = guest.findLast((sample) => sample.pressedOn)?.pressedOn ?? '';
  if (!planned.length) return { lines: ['no pings in this tree'], problems: [] };
  for (const by of ['host', 'guest']) {
    const other = by === 'host' ? 'guest' : 'host';
    const own = shown[by].filter((one) => one.slot === slots[by]);
    const meant = planned.filter((p) => p.by === by);
    meant.forEach((p, index) => {
      const what = `the ${by}'s ${p.kind} ping (${p.how})`;
      const made = own[index];
      if (!made) {
        problems.push(`${what}: never made on its own game${p.how.includes('minimap') ? ` (its finger went down on ${pressedOn || 'nothing'})` : ''}`);
        lines.push(`${what}: never made`);
        return;
      }
      const off = Math.hypot(made.x - p.at[0], made.z - p.at[1]);
      if (made.kind !== p.kind) problems.push(`${what}: made as a ${made.kind} ping`);
      if (off > p.near) problems.push(`${what}: made ${cm(off)} from where it was meant`);
      if (p.from) {
        const moved = previewMoved(screens[by], made, p);
        if (!moved) problems.push(`${what}: its preview never moved from the floor onto the foe while held`);
      }
      problems.push(...shownProblems(what, `the ${by}'s own`, howShown(made)));
      const keyed = !p.how.includes('minimap');
      const previewed = keyed ? previewedFrames(screens[by], made, p.kind === 'foe' ? FOE_APART : APART) : null;
      if (keyed && previewed < PREVIEW_FRAMES) {
        problems.push(`${what}: previewed in ${previewed} of the ${PREVIEW_FRAMES} frames before it was let go`);
      }
      const early = shown[other].find((one) => one.slot === slots[by] && one.from < made.from && one.from >= made.from - 30);
      if (early) problems.push(`${what}: on the ${other}'s screen before it was let go`);
      const late = PING_LATE / frameMs;
      const there = shown[other].find((one) => one.slot === slots[by] && one.from >= made.from && one.from <= made.from + late);
      if (!there) {
        problems.push(`${what}: never on the ${other}'s screen (within ${PING_LATE} ms)`);
        lines.push(`${what}: made ${cm(off)} from where meant, never on the ${other}'s screen`);
        return;
      }
      const apart = Math.hypot(there.x - made.x, there.z - made.z);
      if (there.kind !== made.kind) problems.push(`${what}: a ${there.kind} ping on the ${other}'s screen`);
      if (made.kind === 'foe' && there.foe !== made.foe) problems.push(`${what}: on another foe on the ${other}'s screen`);
      if (apart > (made.kind === 'foe' ? FOE_APART : APART)) problems.push(`${what}: ${cm(apart)} apart on the two screens`);
      const how = howShown(there);
      for (const [whose, one] of [[`the ${by}'s own`, made], [`the ${other}'s`, there]]) {
        const off = Math.max(0, ...one.frames.map((frame) => frame.offFoe ?? 0));
        if (one.kind === 'foe' && off > OFF_FOE) problems.push(`${what}: its pin ${off.toFixed(1)} px beside the foe on ${whose} screen`);
      }
      problems.push(...shownProblems(what, `the ${other}'s`, how));
      const marks = `pin ${how.pin ? 'shown' : 'missing'}, ring ${how.ring ? 'shown' : 'missing'}, minimap `
        + (how.map ? `${cm(how.off)} off` : 'missing');
      const said = previewed === null ? '' : `previewed ${previewed} of its last ${PREVIEW_FRAMES} held frames, `;
      lines.push(`${what}: ${said}made ${cm(off)} from where meant; on the ${other}'s screen ${Math.round((there.from - made.from) * frameMs)} ms `
        + `later, ${cm(apart)} apart (${marks})`);
    });
    if (own.length > meant.length) problems.push(`the ${by} made ${own.length} pings, not ${meant.length}`);
  }
  if (pressedOn) lines.push(`the guest's finger went down on ${pressedOn} over the minimap`);
  const sizes = new Set([...shown.host, ...shown.guest].map((one) => one.r.toFixed(2)));
  lines.push(`ring sizes shown: ${[...sizes].join(', ')} m`);
  if (sizes.size > 1) problems.push(`pings in ${sizes.size} sizes (${[...sizes].join(', ')} m), not one`);
  if (guest.some((sample) => sample.view)) {
    const edge = firstPersonEdge(guest, slots.guest);
    lines.push(`in first person the host's ping held at the guest's screen's edge in ${edge.frames} frames, at most `
      + `${Math.round(edge.farthest * 100)}% of the screen from it, over the minimap in ${edge.overMap}`);
    if (edge.frames < FIRST_FRAMES) problems.push(`in first person the host's ping was held at the guest's screen's edge in ${edge.frames} frames, not ${FIRST_FRAMES}`);
    if (edge.farthest > EDGE_NEAR) problems.push(`in first person a ping at the edge stood ${Math.round(edge.farthest * 100)}% of the screen in from it`);
    if (edge.overMap) problems.push(`in first person a ping at the edge lay over the minimap in ${edge.overMap} frames`);
  }
  return { lines: lines.length ? lines : ['no pings'], problems };
}

/** The scenario's pings in a line each and their problems, for `judgeScenario`. */
export function describePings(host, guest, frameMs) {
  const { lines, problems } = judgePings({ host, guest, frameMs });
  return { line: `pings:\n    ${lines.join('\n    ')}`, problems };
}
