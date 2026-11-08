// What the slamming foes throw at a hero too far off to slam (tools/lab `throws`; `EnemyDef.throws`,
// src/entities/throws.ts): each thrower stood before the hero, held to its spot, its own AI throwing as the game plays
// it, a throw a case. The Cinder Brute's lava: stood still, the chunk must land where he stood as it left the hand, its
// ring there on the floor every frame it flies, its splash hurting him and its pool burning him after; stepped off
// as it's thrown, nothing may hurt him; up close, it slams and throws nothing. The Barkhide Hulk's vine: stood still,
// it must hold him for its `hold`, his walking going nowhere, and let him walk after; stepped aside as it's sent, it
// must never catch him; caught, a dash (Bull Rush, Veilstep) must tear him free, and an arrow shot into it must cut it,
// letting him go and withering it, in one hit (from play: "arrows should kill the Hulk's rooting vine in one hit").
// (The owner's words: "lava giants in crypt should throw lava chunks at player's location, at ballistic trajectory, if
// far from player", "a vine that sprawls on ground, ignoring obstacles in a straight line, that makes player bound to
// the ground for 1.5sec", "should be able to dodge while its being deployed".)
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { EnemyId } from '../../../src/data/enemies';
import type { ThrowDef } from '../../../src/types';
import { G } from '../../../src/state';
import { ENEMIES } from '../../../src/data/enemies';
import { cameraYaw } from '../../../src/core/renderer';
import * as thrownModule from '../../../src/entities/throws';
import { THROWN, type Thrown } from '../../../src/entities/throws';
import { holdFor, pressing, skillNamed, type BoundSkill } from './cast';

export interface ThrowsOptions {
  fixture: Fixture;
  /** plant the faults the checks must catch: a splash far wider than its ring, a vine catching far off its line, and
   *  a dash leaving the hero held */
  canary: boolean;
  /** list each case's frames: the throw's flight or creep, the hero's place and hold */
  trace?: boolean;
}

/** how far before the hero a thrower stands (m), and a slammer up close */
const AWAY = 12;
const NEAR = 2.5;
const RISE_FRAMES = 120;
/** frames waited for a throw, and followed after it */
const WAIT = 240;
const FOLLOW = { lava: 260, vine: 200 };
/** how near where he stood a chunk must land, and its ring to where it lands (m) */
const LANDS_NEAR = 0.25;
const RING_NEAR = 0.05;
/** the share of a chunk's flight its ring must be on the floor */
const RING_SHOWN = 0.95;
/** how many frames off its `hold` a vine may hold him (the frame it catches, the frame it lets go) */
const HOLD_SLACK = 3;
/** how far he may move while held (m), and how far he must walk in the half second after (m) */
const HELD_STILL = 0.1;
const WALKS_AFTER = 0.5;
/** frames held before the dash is pressed, and within which it must tear him free and carry him on (m) */
const DASH_AFTER = 20;
const FREED_WITHIN = 3;
const DASHED = 1;
/** in `shot`, how far towards the Hulk along the vine the bow is aimed (m: drawn as the vine is sent, so the arrow
 *  leaves while it holds him), and within how many frames of the loose the vine must let go */
const SHOT = { ahead: 2.5, freedWithin: 15 };
/** the canary's faults: a splash this wide (m), a vine catching this far off its line (m) */
const CANARY = { splash: 6, reach: 4 };

/** Which way he moves: W (towards the thrower) and D (aside) as the camera has them, on the floor. */
function screenWays(): { w: THREE.Vector3; d: THREE.Vector3 } {
  const yaw = cameraYaw();
  return {
    w: new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
    d: new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
  };
}

/** A hurt the hero took: its frame and how much. */
interface Hurt {
  frame: number;
  amount: number;
}

/** The hurts the hero takes from here on, a frame each by the lab's frame count. */
function hurtsFrom(lab: Lab, frame: () => number): { hurts: Hurt[]; stop(): void } {
  const hero = lab.player;
  const takeDamage = hero.takeDamage.bind(hero);
  const hurts: Hurt[] = [];
  hero.takeDamage = (amount, type, from) => {
    const r = takeDamage(amount, type, from);
    if (r) hurts.push({ frame: frame(), amount: r.taken });
    return r;
  };
  return { hurts, stop: () => { hero.takeDamage = takeDamage; } };
}

/** the case's thrower and its spot, put back on it before every frame (`pinThrower`) */
let pinned: { foe: Enemy; spot: THREE.Vector3 } | null = null;

/** The case's thrower put back on its spot: it turns and throws as its AI has it, but never walks up. */
function pinThrower(): void {
  if (!pinned) return;
  pinned.foe.pos.x = pinned.spot.x;
  pinned.foe.pos.z = pinned.spot.z;
  pinned.foe.vel.set(0, 0, 0);
}

/** A thrower of `kind` risen `distance` before the hero, pinned to its spot. */
async function throwerOf(lab: Lab, kind: EnemyId, distance: number): Promise<Enemy> {
  const spot = lab.player.pos.clone().addScaledVector(screenWays().w, distance);
  const foe = lab.spawnFoe(kind, spot);
  await lab.until(() => foe.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
  pinned = { foe, spot: foe.pos.clone() };
  foe.cd = 0;
  return foe;
}

/** The frames until the thrower's next throw, and that throw with where the hero stood as it left the hand. */
async function nextThrow(lab: Lab, foe: Enemy): Promise<{ thrown: Thrown; stood: THREE.Vector3 } | null> {
  const before = THROWN.at(-1);
  let thrown: Thrown | undefined;
  for (let frame = 0; frame < WAIT && !thrown; frame++) {
    await lab.step(1);
    const latest = THROWN.at(-1);
    if (latest && latest !== before) thrown = latest;
  }
  if (!thrown) return null;
  // (one throw a case: its cooldown held out past the case)
  foe.cd = 1e3;
  return { thrown, stood: lab.player.pos.clone() };
}

const flat = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const metres = (value: number): string => `${value.toFixed(2)} m`;

/** A case's lines and problems. */
interface Outcome {
  lines: string[];
  problems: string[];
}

/** The Brute's chunk at a hero standing still: where it lands, its ring and what it hurt. */
async function lavaStood(lab: Lab, options: ThrowsOptions, step: boolean): Promise<Outcome> {
  const name = step ? 'lava, stepped off' : 'lava, stood still';
  await lab.setup(options.fixture);
  const foe = await throwerOf(lab, 'brute', AWAY);
  let frame = 0;
  const watch = hurtsFrom(lab, () => frame);
  const got = await nextThrow(lab, foe);
  if (!got) {
    watch.stop();
    return { lines: [`${name}: no throw`], problems: [`${name}: the Brute threw nothing at ${AWAY} m`] };
  }
  const { thrown, stood } = got;
  const ways = screenWays();
  let ringShown = 0, flying = 0, ringOff = 0, landedFrame = -1;
  const trace: string[] = [];
  await lab.step(FOLLOW.lava, () => (step && frame < 60 ? { keys: ['d'] } : {}), () => {
    frame++;
    if (!thrown.landed) {
      flying++;
      const ring = thrown.ring;
      if (ring?.parent && ring.visible) {
        ringShown++;
        ringOff = Math.max(ringOff, flat(ring.position, thrown.to));
      }
    } else if (landedFrame < 0) landedFrame = frame;
    if (options.trace && frame % 10 === 0) {
      const at = thrown.mesh.position;
      const chunk = `${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${at.z.toFixed(2)}`;
      trace.push(`  ${frame}: chunk ${chunk}; hero ${metres(flat(lab.player.pos, stood))} off`);
    }
  });
  watch.stop();
  const problems: string[] = [];
  if (!thrown.landed) problems.push(`${name}: the chunk never landed`);
  const landed = thrown.landed ?? thrown.to;
  const off = flat(landed, stood);
  const splash = watch.hurts.filter((hurt) => Math.abs(hurt.frame - landedFrame) <= 1);
  const burns = watch.hurts.filter((hurt) => hurt.frame > landedFrame + 1);
  const shown = flying ? ringShown / flying : 0;
  if (off > LANDS_NEAR) problems.push(`${name}: landed ${metres(off)} from where he stood as it was thrown`);
  const shownPct = `${(shown * 100).toFixed(0)}%`;
  if (shown < RING_SHOWN) problems.push(`${name}: its ring on the floor for ${shownPct} of its flight`);
  if (ringOff > RING_NEAR) problems.push(`${name}: its ring ${metres(ringOff)} off where it lands`);
  if (!step && !splash.length) problems.push(`${name}: its splash never hurt him`);
  if (!step && burns.length < 2) problems.push(`${name}: its pool burnt him ${burns.length} times`);
  if (step && watch.hurts.length) problems.push(`${name}: hurt ${watch.hurts.length} times though he stepped off`);
  const away = flat(lab.player.pos, stood);
  const line = `${name}: flew ${flying} frames from ${metres(flat(foe.pos, stood))}, landed ${metres(off)} from where `
    + `he stood (he ended ${metres(away)} off, along D ${metres(lab.player.pos.clone().sub(stood).dot(ways.d))}), `
    + `ring shown ${shownPct} of it and ${metres(ringOff)} off; splash ${splash.length}, burns ${burns.length}`;
  return { lines: [line, ...trace], problems };
}

/** The Brute up close: it slams, and throws nothing. */
async function lavaNear(lab: Lab, options: ThrowsOptions): Promise<Outcome> {
  await lab.setup(options.fixture);
  const before = THROWN.at(-1);
  const foe = await throwerOf(lab, 'brute', NEAR);
  let slammed = false;
  await lab.step(WAIT, () => ({}), () => {
    if (foe.action?.name === 'slam') slammed = true;
  });
  const threw = THROWN.at(-1) !== before;
  const problems: string[] = [];
  if (threw) problems.push(`lava, up close: the Brute threw at ${NEAR} m`);
  if (!slammed) problems.push(`lava, up close: the Brute never slammed at ${NEAR} m`);
  const line = `lava, up close: ${slammed ? 'slammed' : 'never slammed'}, ${threw ? 'threw' : 'threw nothing'}`;
  return { lines: [line], problems };
}

/** The hero's skill that dashes (Bull Rush, Veilstep), if he has one on a key. */
function dashSkill(): BoundSkill | null {
  for (const impl of ['bullRush', 'blink']) {
    try {
      return skillNamed(impl);
    } catch {
      // (not this class's)
    }
  }
  return null;
}

type VineCase = 'stood' | 'step' | 'onto' | 'dash' | 'shot';

/** the vine's names for its cases */
const VINE_CASES: Record<VineCase, string> = {
  stood: 'vine, stood still',
  step: 'vine, stepped aside',
  onto: 'vine, stepped onto',
  dash: 'vine, dashed out',
  shot: 'vine, shot',
};

/** The hero's bow shot (the ranger's Nockshot), if he has one on a key. */
function bowShot(): BoundSkill | null {
  try {
    return skillNamed('nockShot');
  } catch {
    return null;
  }
}
/** in `onto`, the frames he steps aside as it's sent, and the frame he walks back onto it, laid by then */
const ASIDE_FRAMES = 30;
const BACK_AT = 80;

/** The Hulk's vine at a hero: stood still and walking once held, stepped aside as it's sent, stepped aside and back
 *  onto it as it lies, or dashing once held. */
async function vineAt(lab: Lab, options: ThrowsOptions, how: VineCase, def: ThrowDef): Promise<Outcome> {
  const name = VINE_CASES[how];
  const dash = how === 'dash' ? dashSkill() : null;
  if (how === 'dash' && !dash) {
    return { lines: [`${name}: the ${lab.player.cls.id} has no dash (--class warrior, mage)`], problems: [] };
  }
  const bow = how === 'shot' ? bowShot() : null;
  if (how === 'shot' && !bow) {
    return { lines: [`${name}: the ${lab.player.cls.id} has no bow (--class ranger)`], problems: [] };
  }
  await lab.setup(options.fixture);
  const foe = await throwerOf(lab, 'barkhulk', AWAY);
  const got = await nextThrow(lab, foe);
  if (!got) return { lines: [`${name}: no throw`], problems: [`${name}: the Hulk sent nothing at ${AWAY} m`] };
  const { thrown, stood } = got;
  const towardHulk = foe.pos.clone().sub(stood).setY(0).normalize();
  const vineSpot = stood.clone().addScaledVector(towardHulk, SHOT.ahead).setY(0);
  const hold = def.creep?.[2] ?? 1.5;
  const ways = screenWays();
  const aside = stood.clone().addScaledVector(ways.d, -6);
  let frame = 0, heldFrom = -1, heldTo = -1, heldAt: THREE.Vector3 | null = null, movedHeld = 0;
  let pressedAt = -1, afterAt: THREE.Vector3 | null = null, loosedAt = -1, witheredAt = -1;
  const trace: string[] = [];
  const input = (f: number): Frame => {
    if (how === 'step') return { keys: f < 50 ? ['d'] : [] };
    if (how === 'onto') return { keys: f < ASIDE_FRAMES ? ['d'] : f >= BACK_AT && heldFrom < 0 ? ['a'] : [] };
    if (how === 'shot' && bow) return pressing(bow.key, vineSpot, f < Math.round(holdFor(bow.def) * 60));
    if (heldFrom < 0) return {};
    if (how === 'dash' && dash) {
      // (pressed once held a while, and let go after the skill's own hold: an aimed one goes as it's let go)
      const since = frame - heldFrom - DASH_AFTER;
      return pressing(dash.key, aside, since >= 0 && since < Math.max(1, Math.round(holdFor(dash.def) * 60)));
    }
    return { keys: ['d'] };
  };
  await lab.step(FOLLOW.vine, input, () => {
    frame++;
    const hero = lab.player;
    if (hero.rooted && heldFrom < 0) {
      heldFrom = frame;
      heldAt = hero.pos.clone();
    }
    if (heldFrom >= 0 && heldTo < 0 && !hero.rooted) {
      heldTo = frame;
      afterAt = hero.pos.clone();
    }
    if (hero.rooted && heldAt) movedHeld = Math.max(movedHeld, flat(hero.pos, heldAt));
    if (how === 'dash' && pressedAt < 0 && hero.dash) pressedAt = frame;
    if (how === 'shot' && loosedAt < 0 && hero.casting?.fired) loosedAt = frame;
    if (how === 'shot' && witheredAt < 0 && !thrown.mesh.parent) witheredAt = frame;
    if (options.trace && frame % 5 === 0) {
      const cast = hero.casting ? `, ${hero.casting.skill.def.impl} ${hero.casting.t.toFixed(2)} s` : '';
      trace.push(`  ${frame}: ${hero.rooted ? 'held' : 'free'}, ${metres(flat(hero.pos, stood))} off${cast}`);
    }
  });
  const hero = lab.player;
  const problems: string[] = [];
  const heldFrames = heldFrom < 0 ? 0 : (heldTo < 0 ? frame : heldTo) - heldFrom;
  const walkedAfter = afterAt ? flat(hero.pos, afterAt) : 0;
  if (how === 'step') {
    if (heldFrom >= 0) problems.push(`${name}: held though he stepped ${metres(flat(hero.pos, stood))} aside`);
  } else if (heldFrom < 0) problems.push(`${name}: never held him`);
  if (how === 'onto' && heldFrom >= 0 && heldFrom <= BACK_AT) {
    problems.push(`${name}: held him at frame ${heldFrom}, before he stepped back onto it`);
  }
  if (how === 'stood' && heldFrom >= 0) {
    if (Math.abs(heldFrames - hold * 60) > HOLD_SLACK) {
      problems.push(`${name}: held him ${heldFrames} frames (its hold ${hold * 60})`);
    }
    if (movedHeld > HELD_STILL) problems.push(`${name}: he walked ${metres(movedHeld)} while held`);
    if (walkedAfter < WALKS_AFTER) problems.push(`${name}: he walked ${metres(walkedAfter)} after it let go`);
  }
  if (how === 'dash' && heldFrom >= 0) {
    if (pressedAt < 0) problems.push(`${name}: the dash never ran`);
    else if (heldTo < 0 || heldTo - pressedAt > FREED_WITHIN) {
      const until = heldTo < 0 ? 'to the end' : `${heldTo - pressedAt} frames after`;
      problems.push(`${name}: still held ${until} the dash`);
    }
    if (afterAt && walkedAfter < DASHED) problems.push(`${name}: the dash carried him ${metres(walkedAfter)}`);
  }
  if (how === 'shot' && heldFrom >= 0) problems.push(...shotProblems(name, { heldFrom, loosedAt, heldTo, witheredAt }));
  const line = `${name}: held ${heldFrames} frames (hold ${hold * 60}), moved ${metres(movedHeld)} while held, `
    + `${metres(walkedAfter)} after${how === 'dash' ? `, dash pressed at ${pressedAt}` : ''}`
    + `${how === 'shot' ? `, loosed at ${loosedAt}, the vine gone at ${witheredAt}` : ''}; `
    + `ended ${metres(flat(hero.pos, stood))} from where he stood`;
  return { lines: [line, ...trace], problems };
}

/** The frames of a shot at the vine holding him: the arrow's loose, his release and the vine's going. */
interface ShotFrames {
  heldFrom: number;
  loosedAt: number;
  heldTo: number;
  witheredAt: number;
}

/** A shot into the vine holding him must let him go within `SHOT.freedWithin` frames, and the vine go with it. */
function shotProblems(name: string, { heldFrom, loosedAt, heldTo, witheredAt }: ShotFrames): string[] {
  if (loosedAt < 0) return [`${name}: the arrow was never loosed`];
  // (the measure's own timing: the arrow must leave while the vine holds him)
  const holding = loosedAt > heldFrom && (heldTo < 0 || heldTo > loosedAt);
  if (!holding) {
    return [`${name}: the arrow left at frame ${loosedAt}, not while the vine held him (${heldFrom} to ${heldTo})`];
  }
  const problems: string[] = [];
  const freedIn = heldTo < 0 ? Infinity : heldTo - loosedAt;
  if (freedIn > SHOT.freedWithin) {
    const until = heldTo < 0 ? 'to the end' : `${freedIn} frames after`;
    problems.push(`${name}: the arrow left the vine whole, holding him ${until} the loose`);
  }
  if (witheredAt < 0) problems.push(`${name}: the vine lay on after it was shot`);
  return problems;
}

/** The faults the canary plants, each undone by the function it returns. */
function plantFaults(lab: Lab): () => void {
  const lava = ENEMIES.brute.throws!, vine = ENEMIES.barkhulk.throws!;
  const splash = lava.splash, creep = vine.creep;
  lava.splash = [CANARY.splash, splash?.[1] ?? 0.75];
  vine.creep = [creep?.[0] ?? 13, CANARY.reach, creep?.[2] ?? 1.5];
  const hero = lab.player;
  const startDash = hero.startDash.bind(hero);
  hero.startDash = (...args) => {
    const held = hero.rootedUntil;
    startDash(...args);
    hero.rootedUntil = held;
  };
  // (an arrow cuts no vine: where this tree has none to cut, nothing to plant)
  const cut = 'VINE_CUT' in thrownModule ? thrownModule.VINE_CUT : null;
  const reach = cut?.reach;
  if (cut) cut.reach = -1;
  return () => {
    if (cut && reach !== undefined) cut.reach = reach;
    lava.splash = splash;
    vine.creep = creep;
    hero.startDash = startDash;
  };
}

/** `lab throws`: every case, its lines and problems; with `--canary`, the planted faults, each a problem unless
 *  caught. */
export async function throws(lab: Lab, options: ThrowsOptions): Promise<Report> {
  const undo = options.canary ? plantFaults(lab) : () => undefined;
  const vine = ENEMIES.barkhulk.throws!;
  const outcomes: Outcome[] = [];
  lab.beforeFrame.push(pinThrower);
  try {
    outcomes.push(await lavaStood(lab, options, false));
    outcomes.push(await lavaStood(lab, options, true));
    outcomes.push(await lavaNear(lab, options));
    for (const how of ['stood', 'step', 'onto', 'dash', 'shot'] as const) {
      outcomes.push(await vineAt(lab, options, how, vine));
    }
  } finally {
    undo();
    lab.beforeFrame.splice(lab.beforeFrame.indexOf(pinThrower), 1);
    pinned = null;
  }
  const lines = outcomes.flatMap((outcome) => outcome.lines);
  const problems = outcomes.flatMap((outcome) => outcome.problems);
  if (!options.canary) return { text: lines.join('\n'), problems };
  return { text: [...lines, ...canaryVerdict(problems)].join('\n'), problems: canaryMissed(problems) };
}

/** what each planted fault must show as: a word of the problem it causes */
const CANARY_CAUGHT = {
  splash: 'lava, stepped off: hurt',
  reach: 'vine, stepped aside: held',
  dash: 'vine, dashed out: still held',
  shot: 'vine, shot: the arrow left the vine whole',
};

/** Each planted fault and whether a problem showed it (the dash's only for a hero with a dash). */
function caughtBy(problems: string[]): [string, boolean][] {
  const has = (fault: string): boolean => {
    if (fault === 'dash') return dashSkill() !== null;
    if (fault === 'shot') return bowShot() !== null && 'VINE_CUT' in thrownModule;
    return true;
  };
  const planted = Object.entries(CANARY_CAUGHT).filter(([fault]) => has(fault));
  return planted.map(([fault, sign]) => [fault, problems.some((problem) => problem.startsWith(sign))]);
}

function canaryVerdict(problems: string[]): string[] {
  return caughtBy(problems).map(([fault, caught]) => `canary ${fault}: ${caught ? 'caught' : 'MISSED'}`);
}

function canaryMissed(problems: string[]): string[] {
  const missed = caughtBy(problems).filter(([, caught]) => !caught);
  return missed.map(([fault]) => `the canary's ${fault} fault went uncaught`);
}
