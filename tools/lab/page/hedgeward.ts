// The ranger's Hedgeward (tools/lab `hedgeward`; src/combat/skills/hedgeward.ts, src/world/wards.ts): the wall held
// and let go as the player does, and what it must do once it stands, a case each:
// - placed: raised where it was aimed, across the line from him to the aim, its front away from him;
// - bolts: a boss's bolts fired at him over it, as at any low prop: each flies over it or meets it, and one that meets
//   it wears it as a foe's bolt wears a prop (said, no rule of its own);
// - round: a melee foe on its far side, with a way round open, goes round it to him: no blow over it, never in its
//   body (from the owner: "small mobs supposed to always go around unless they can't (all blocked)");
// - walled: him boxed in by four walls, a melee foe outside breaks its way through one, never striking him over a
//   wall still standing;
// - arrows: his own arrows loosed into it, at points across its width and up its height, each wear it as they wear
//   any prop, and as many as its life break it (from the owner: "if you can destroy a marble pillar with arrows, you
//   for sure should be able to destroy a wooden wall"); one through a gap in its weave dealing nothing is a problem;
// - played: his arrows at it as the player looses them, the cursor finding it from above: from where he raised it and
//   stepped back and aside, at least and full draw, low, half way and high on it, every one that ends at it wearing it
//   (from Victor's review: "Sometimes arrow can fly through without dealing damage, I get it more than half the
//   time": met as drawn, an arrow found the gaps between its stakes and courses; and through them the cursor found the
//   earth at its foot, and an arrow aimed there put its point in the ground before its middle met the wall);
// - slammed: a foe's slam landing on it wears it;
// - trampled: a big foe walking at him straight through it breaks it ("Big enemies should break it by simply walking
//   over it");
// - stays: it stands long after it rose, with no time of its own; struck to none it breaks at once; and a hero keeps
//   as many standing as he raises (a fourth beside three); and a wave cleared takes every one down;
// - arrow: his own arrow loosed over it at a foe beyond flies on past it;
// - reach: aimed past its range it rises at its range; aimed onto a foe it rises before the foe, never on it; with a
//   prop right before him (nowhere clear) it isn't raised, its outline red, and the press costs nothing.
// `--canary` plants a fault for the arrow (its body made a tall prop's, which stops a shot), the round (its body taken
// out of the foes' way), the trample and the walled in (its body no breakable prop's), and plays `played` twice, the
// wall met as drawn alone (through its gaps) and the props met by an arrow's middle after its flight, each a problem
// unless caught. `--pictures` takes the wall
// from round it alone (front, three-quarter, side, above), and in the forest and the crypt from the game's views:
// standing, its preview held, and a blow on it with its bar.
import * as THREE from 'three';
import type { Fixture, Lab, Pictured, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { Ward } from '../../../src/world/wards';
import type { BiomeId } from '../../../src/data/biomes';
import type { Projectile } from '../../../src/combat/projectiles';
import { G } from '../../../src/state';
import { wards, nearestOnWard } from '../../../src/world/wards';
import { hurtProp } from '../../../src/world/destructible';
import { fx } from '../../../src/entities/enemyAI';
import { emit } from '../../../src/events';
import { clearEffects } from '../../../src/fx/effects';
import { pressing, skillNamed, type BoundSkill } from './cast';
import { readinessOf } from '../../../src/combat/skills/readiness';
import { cameraAhead } from './onScreen';

export interface HedgewardOptions {
  fixture: Fixture;
  /** plant the faults the checks must catch: its body made a tall prop's (which stops a bolt and an arrow), and the
   *  wall forgotten by the foes (its body standing) */
  canary: boolean;
  /** the wall pictured alone from round it, and in each biome from the game's views */
  pictures: boolean;
  /** the cases run by name, or null for every one */
  cases: string[] | null;
}

/** frames the key is held before it's let go, and the most a cast may take to raise the wall */
const HOLD_FRAMES = 12;
const RAISE_FRAMES = 120;
const RISE_FRAMES = 360;
/** how far out the wall is aimed in each case (m), and how far its line may stand off the aim, and turn off square
 *  across his line to it (rad) */
const AIM_OUT = 3;
const PLACED_NEAR = 0.12;
/** how far its line stands out from its foot towards the foes (m: its stakes lean out; the skill's `LINE_OUT`) */
const LINE_OUT = 0.08;
const SQUARE_WITHIN = 0.02;
/** the boss's place beyond the wall (m from him), and the frames a bolt is followed */
const BOSS_OUT = 12;
const BOLT_FRAMES = 120;
const BOLTS = 3;
/** a planted prop's height (m): over every shot */
const PROP_TALL = 4;
/** in the round: the wall aimed this far out (m), he stood this far behind its line and the foe's body this far beyond
 *  its side (pressed against it: through the wall, he'd be within its blow's reach), and the frames it's followed */
const ROUND_OUT = 2.5;
const HERO_BEHIND = 0.75;
const FOE_BEYOND = 0.05;
const ROUND_FRAMES = 360;
/** the box: each wall aimed this far out from him (its ends meeting the next's with no gap a body passes), the foe
 *  risen this far out (m), and the frames it's given to break in */
const BOX_OUT = 2.2;
const BOX_FOE_OUT = 5.5;
const BOX_FRAMES = 900;
/** the arrows: where each is aimed on the wall, across its width from its middle and up from its foot (m: the wall
 *  stands 1 m, and over that an arrow flies on as over any low prop), and the draw's frames each */
const ARROWS_ACROSS = [-1.4, -0.7, 0, 0.7, 1.4, -1.05, -0.35, 0.35, 1.05];
const ARROWS_UP = [0.35, 0.6, 0.85];
const ARROW_DRAW = 40;
/** the trample: the big foe risen this far beyond the wall (m), and the frames it's given to walk through */
const BIG_BEYOND = 5;
const TRAMPLE_FRAMES = 600;
/** how far into the wall's body a foe may be pushed for a frame (m) */
const INTO_MOST = 0.08;
/** the frames it must still stand after it rose (30 s: its old time was 7), and the frames a look may take to go */
const STAYS_FRAMES = 1800;
/** how many he raises one after another: a fourth beside three (from the owner, of a cap of three: "dont see why we
 *  need a limit") */
const FOUR = 4;
const FADE_FRAMES = 90;
/** the arrow: the wall aimed this far out, a dummy this far beyond it (m), the draw's frames */
const ARROW_OUT = 3;
const DUMMY_BEYOND = 5;
const DRAW_FRAMES = 70;
const ARROW_FRAMES = 90;
/** the ways round him tried for a spot with room (the wall clear of props, and the line out to the boss) */
const WAYS = 16;
const ROOM_OUT = BOSS_OUT + 1;
/** the farthest out a case raises the wall (m): its range (`reach` aims past it) */
const REACH_OUT = 3;
/** the room a way needs (m): round its line out to the boss, round the wall's ends, and their half span */
const LINE_ROOM = 0.6;
const END_ROOM = 0.35;
const WALL_HALF = 1.9;
/** where the hero is stood for the cases, in turn until one has a way with room (the lab's own spot first) */
const SPOTS: ([number, number] | undefined)[] = [
  undefined, [-12, 20], [18, -10], [-16, -12], [0, -20], [20, 6], [-20, 4],
];
/** the close-ups' distance from the wall (m): the close-up frame is a portrait, the wall 3.6 m wide */
const STUDIO_DISTANCE = 12;
/** the plan's distance over it (m: its frame is a square) */
const PLAN_DISTANCE = 9;

/** A case's lines and problems, and what it pictured. */
interface Outcome {
  lines: string[];
  problems: string[];
  moments: Pictured[];
}

const metres = (value: number): string => `${value.toFixed(2)} m`;
const flat = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Whether the floor round (x, z) has room for a body of `r`: inside the arena and clear of every prop. */
function roomAt(x: number, z: number, r: number): boolean {
  if (Math.hypot(x, z) > G.arena.radius - 2) return false;
  return G.arena.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);
}

/** Whether the way along `way` from `from` has room for the cases: the line out to past where the boss stands, and
 *  the wall's ends at each distance it's raised. */
function roomAlong(from: THREE.Vector3, way: THREE.Vector3): boolean {
  const across = new THREE.Vector3(way.z, 0, -way.x);
  for (let d = 1; d <= ROOM_OUT; d += 0.5) {
    const at = from.clone().addScaledVector(way, d);
    if (!roomAt(at.x, at.z, LINE_ROOM)) return false;
    if (d < ROUND_OUT - 0.5 || d > REACH_OUT + 0.5) continue;
    for (const side of [-WALL_HALF, WALL_HALF]) {
      if (!roomAt(at.x + across.x * side, at.z + across.z * side, END_ROOM)) return false;
    }
  }
  return true;
}

/** A way along the floor from him with room for the cases (the first of `WAYS` round him from the camera's ahead),
 *  or null. */
function wayWithRoom(from: THREE.Vector3): THREE.Vector3 | null {
  const ahead = cameraAhead();
  for (let i = 0; i < WAYS; i++) {
    const turn = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI * 2 / WAYS);
    const way = ahead.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
    if (roomAlong(from, way)) return way;
  }
  return null;
}

/** The run set up afresh, every cooldown over and the energy full, the hero at the first of the spots (the
 *  fixture's, else `SPOTS`) with a way that has room for the cases, and that way. */
async function setUp(lab: Lab, fixture: Fixture): Promise<{ way: THREE.Vector3; skill: BoundSkill }> {
  const spots: ([number, number] | undefined)[] = fixture.at ? [fixture.at] : SPOTS;
  for (const at of spots) {
    G.arena.restoreProps();
    await lab.setup({ ...fixture, at });
    // (a wall a case before left standing is taken down with its look)
    clearEffects();
    const hero = G.player;
    hero.cooldowns.clear();
    hero.energy = hero.stats.maxEnergy;
    const way = wayWithRoom(hero.pos);
    if (way) return { way, skill: skillNamed('hedgeward') };
  }
  throw new Error(`lab: hedgeward: no spot of ${spots.length} has a way with room for the wall and the boss`);
}

/** The wall held at `aim` and let go, as the player does: the wall it raised (throws if none rose). */
async function raiseAt(lab: Lab, skill: BoundSkill, aim: THREE.Vector3): Promise<Ward> {
  const before = new Set(wards);
  const risen = (): Ward | undefined => wards.find((ward) => !before.has(ward));
  await lab.step(HOLD_FRAMES, () => pressing(skill.key, aim, true));
  await lab.until(() => risen() !== undefined, RAISE_FRAMES, 'the Hedgeward never rose', () => ({ aim }));
  return risen()!;
}

/** The middle of a wall's line, and its way along (unit). */
function lineOf(ward: Ward): { middle: THREE.Vector3; along: THREE.Vector3 } {
  const middle = new THREE.Vector3((ward.ax + ward.bx) / 2, 0, (ward.az + ward.bz) / 2);
  const along = new THREE.Vector3(ward.bx - ward.ax, 0, ward.bz - ward.az).normalize();
  return { middle, along };
}

/** The hurts the hero takes from here on (their amounts), until `stop`. */
function hurtsFrom(lab: Lab): { hurts: number[]; stop(): void } {
  const hero = lab.player;
  const takeDamage = hero.takeDamage.bind(hero);
  const hurts: number[] = [];
  hero.takeDamage = (amount, type, from) => {
    const result = takeDamage(amount, type, from);
    if (result) hurts.push(result.taken);
    return result;
  };
  return { hurts, stop: () => { hero.takeDamage = takeDamage; } };
}

/** `foe` held to its spot before every frame (it turns and acts as its AI has it, but never walks up), until the
 *  returned function lets it go. */
function pin(lab: Lab, foe: Enemy, still: (foe: Enemy) => void = () => undefined): () => void {
  const spot = foe.pos.clone();
  const hold = (): void => {
    foe.pos.x = spot.x;
    foe.pos.z = spot.z;
    foe.vel.set(0, 0, 0);
    still(foe);
  };
  lab.beforeFrame.push(hold);
  return () => { lab.beforeFrame.splice(lab.beforeFrame.indexOf(hold), 1); };
}

/** The wall's root in the scene as raised last (its look), if any. */
const wallRoot = (): THREE.Object3D | undefined => G.scene.children.filter((o) => o.name === 'hedgeward').at(-1);

/** placed: raised where it was aimed, across his line to it, its front away from him. */
async function placed(lab: Lab, options: HedgewardOptions): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  const hero = G.player, from = hero.pos.clone();
  const aim = from.clone().addScaledVector(way, AIM_OUT);
  const ward = await raiseAt(lab, skill, aim);
  const { middle, along } = lineOf(ward);
  const off = flat(middle, aim.clone().addScaledVector(way, LINE_OUT));
  const skew = Math.abs(along.dot(way));
  const skewDegrees = Math.asin(Math.min(1, skew)) * 180 / Math.PI;
  const root = wallRoot();
  const front = root ? new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion).setY(0).normalize() : null;
  const facesOut = front ? front.dot(way) : -1;
  const problems: string[] = [];
  if (off > PLACED_NEAR) problems.push(`placed: ${metres(off)} off where it was aimed`);
  if (skew > SQUARE_WITHIN) problems.push(`placed: ${skewDegrees.toFixed(1)}° off square across his line to the aim`);
  if (facesOut < 0.99) problems.push('placed: its front not away from him');
  if (!G.arena.obstacles.includes(ward.prop.parts[0])) problems.push('placed: its body is in no one\'s way');
  const facing = facesOut >= 0.99 ? 'away from him' : 'NOT away from him';
  const lines = [
    `placed: aimed ${metres(AIM_OUT)} out, its line ${metres(off)} off the aim, ${skewDegrees.toFixed(2)}° off square,`
      + ` its front ${facing}; ${ward.prop.max} life, ${ward.prop.parts.length} circles ${ward.prop.parts[0].r * 2} m thick`,
  ];
  return { lines, problems, moments: [] };
}

/** `ward`'s body made a tall prop's too (a canary: a shot meets it), and what takes it away again. */
function plantAsProp(ward: Ward): () => void {
  // (drawn as a tall slab along its line, never in the scene: the wall's own low look an arrow flies over)
  const { middle, along } = lineOf(ward), length = Math.hypot(ward.bx - ward.ax, ward.bz - ward.az);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(length, PROP_TALL, ward.prop.parts[0].r * 2));
  slab.position.set(middle.x, PROP_TALL / 2, middle.z);
  slab.rotation.y = Math.atan2(-along.z, along.x);
  slab.updateMatrixWorld(true);
  const planted = ward.prop.parts.map((circle) => ({ ...circle, prop: undefined, h: PROP_TALL, drawn: [slab] }));
  G.arena.obstacles.push(...planted);
  return () => { for (const circle of planted) G.arena.obstacles.splice(G.arena.obstacles.indexOf(circle), 1); };
}

/** bolts: a boss beyond the wall fires at him over it, a bolt at a time, as at any low prop: each flies over it or meets
 *  it and wears it. */
async function bolts(lab: Lab, options: HedgewardOptions): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  const hero = G.player, from = hero.pos.clone();
  const ward = await raiseAt(lab, skill, from.clone().addScaledVector(way, AIM_OUT));
  const kind = G.arena.biome === 'forest' ? 'thornheart' : 'colossus';
  const boss = lab.spawnFoe(kind, from.clone().addScaledVector(way, BOSS_OUT));
  await lab.until(() => boss.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
  const release = pin(lab, boss, (foe) => { foe.cd = 1e3; foe.brain.summonT = 1e3; });
  const watch = hurtsFrom(lab);
  const lines: string[] = [], problems: string[] = [];
  const { middle } = lineOf(ward);
  // (how far past the wall's line towards him: the boss stands on its other side)
  const pastLine = (p: THREE.Vector3): number => -p.clone().sub(middle).dot(way);
  try {
    for (let fired = 1; fired <= BOLTS; fired++) {
      const bolt = fireAt(boss, way, hero.pos);
      let past = -Infinity;
      await lab.until(() => { past = Math.max(past, pastLine(bolt.pos)); return !bolt.alive; }, BOLT_FRAMES, 'a bolt flew on and on');
      lines.push(`bolts: bolt ${fired} (${Math.round(boss.damage)}) flew ${metres(past)} past the wall's line,`
        + ` the wall's life ${Math.round(ward.prop.life)} of ${ward.prop.max}`);
    }
  } finally {
    release();
    watch.stop();
  }
  const hurts = watch.hurts.length ? watch.hurts.map(Math.round).join(', ') : 'none';
  lines.push(`bolts: ${BOLTS} fired over it; hurts to him ${hurts}`);
  // (an ordinary low prop: a bolt over its top flies on, one that meets it wears it as a foe's bolt wears any prop)
  const worn = ward.prop.max - ward.prop.life, met = BOLTS - watch.hurts.length;
  lines.push(`bolts: ${watch.hurts.length} flew over it to him, ${met} met it; its life ${worn ? `worn by ${worn}` : 'untouched'}`);
  if (met > 0 && worn <= 0) problems.push('bolts: met it and wore nothing');
  return { lines, problems, moments: [] };
}

/** A bolt of `boss`'s fired at `at` from just before it along `way` back to him, as its volley fires one: the
 *  game's own bolt (enemyAI's `fx`), its projectile returned. */
function fireAt(boss: Enemy, way: THREE.Vector3, at: THREE.Vector3): Projectile {
  const origin = new THREE.Vector3(boss.pos.x, 1.6, boss.pos.z).addScaledVector(way, -boss.radius);
  const angle = Math.atan2(at.x - origin.x, at.z - origin.z);
  fx('bolt', boss.id, origin.x, origin.z, angle, boss.damage, origin.y);
  return G.projectiles.at(-1)!;
}

/** Frames run until `done` (-1 if not within `limit`). */
async function framesUntil(lab: Lab, done: () => boolean, limit: number): Promise<number> {
  // (each frame run as the lab runs one, nothing held)
  for (let frame = 1; frame <= limit; frame++) {
    await lab.step(1);
    if (done()) return frame;
  }
  return -1;
}

/** The round's scene: the wall, the foe beyond it, and what lets go of him where he was put. */
interface Beyond {
  ward: Ward;
  foe: Enemy;
  hold: () => void;
}

/** The round's scene: the wall raised, him stood close behind it, a husk risen close beyond it. */
async function foeBeyond(lab: Lab, options: HedgewardOptions): Promise<Beyond> {
  const { way, skill } = await setUp(lab, options.fixture);
  const hero = G.player, from = hero.pos.clone();
  const ward = await raiseAt(lab, skill, from.clone().addScaledVector(way, ROUND_OUT));
  const { middle } = lineOf(ward);
  const stand = middle.clone().addScaledVector(way, -HERO_BEHIND);
  // (he stands still where he's put: the foe's push or his own walk would move him off)
  const keep = (): void => {
    hero.pos.x = stand.x;
    hero.pos.z = stand.z;
    hero.vel.set(0, 0, 0);
  };
  keep();
  lab.beforeFrame.push(keep);
  const foe = lab.spawnFoe('husk', middle.clone().addScaledVector(way, ward.prop.parts[0].r + FOE_BEYOND + 0.55));
  await lab.until(() => foe.spawning <= 0, RISE_FRAMES, 'the husk never rose');
  // (its blow ready at once: risen, a foe waits up to 1.2 s, and walked off round the wall meanwhile)
  foe.cd = 0;
  return { ward, foe, hold: () => { lab.beforeFrame.splice(lab.beforeFrame.indexOf(keep), 1); } };
}

/** round: a melee foe beyond the wall, a way round open: round it to him, no blow over it, never in its body. */
async function round(lab: Lab, options: HedgewardOptions, canary: boolean): Promise<Outcome> {
  const { ward, foe, hold } = await foeBeyond(lab, options);
  // (the canary: its body taken out of the foes' way, its look still standing)
  if (canary) for (const circle of ward.prop.parts) G.arena.obstacles.splice(G.arena.obstacles.indexOf(circle), 1);
  const hero = G.player, { middle, along } = lineOf(ward);
  const half = Math.hypot(ward.bx - ward.ax, ward.bz - ward.az) / 2;
  const takeDamage = hero.takeDamage.bind(hero);
  let through = 0, struck = 0, mostOut = 0, mostInto = 0, rounded = -1, frame = 0;
  const shots: Pictured[] = [];
  const near = { x: 0, z: 0 };
  hero.takeDamage = (amount, type, from) => {
    const result = takeDamage(amount, type, from);
    if (result) {
      struck++;
      const besideIt = Math.abs(foe.pos.clone().sub(middle).dot(along)) < half;
      if (besideIt && sideOf(foe.pos) !== sideOf(hero.pos)) through++;
    }
    return result;
  };
  function sideOf(p: THREE.Vector3): number {
    const out = new THREE.Vector3(along.z, 0, -along.x);
    return Math.sign(p.clone().sub(middle).dot(out));
  }
  try {
    for (frame = 0; frame < ROUND_FRAMES && !(struck && rounded >= 0); frame++) {
      await lab.step(1);
      const outAlong = Math.abs(foe.pos.clone().sub(middle).dot(along));
      mostOut = Math.max(mostOut, outAlong);
      if (rounded < 0 && outAlong > half) {
        rounded = frame;
        if (options.pictures) shots.push(await lab.screen('round: a husk going round the end of the wall'));
      }
      mostInto = Math.max(mostInto, ward.prop.parts[0].r + foe.radius - nearestOnWard(ward, foe.pos.x, foe.pos.z, near));
    }
  } finally {
    hero.takeDamage = takeDamage;
    hold();
  }
  const pastEnd = rounded >= 0 ? `, past its end at frame ${rounded}` : ', never past its end';
  const lines = [
    `round: the husk struck him ${struck} times, ${through} through the wall; went ${metres(mostOut)} along it from`
      + ` its middle (its ends ${metres(half)} out)${pastEnd}; pushed ${metres(Math.max(0, mostInto))} into it at most`,
  ];
  const problems: string[] = [];
  // (a way round open: round it, no blow over it, never in it)
  if (mostInto > INTO_MOST) problems.push(`round: went ${metres(mostInto)} into the wall`);
  if (through) problems.push(`round: struck him over the wall ${through} times`);
  if (rounded < 0) problems.push('round: never went round the wall');
  if (!struck) problems.push('round: never reached him round the wall');
  return { lines, problems, moments: shots };
}

/** The wall's body made no breakable prop's (a canary: nothing wears it), and what makes it one again. */
function unbreakable(ward: Ward): () => void {
  for (const circle of ward.prop.parts) circle.prop = undefined;
  return () => { for (const circle of ward.prop.parts) circle.prop = ward.prop; };
}

/** the most frames an arrow is waited for to leave the bow, and to end its flight; the bow's reload after (frames) */
const LOOSE_WAIT = 90;
const FLIGHT_WAIT = 120;
const RELOAD = 60;

/**
 * One arrow drawn at `aim` and let go, followed until its flight ends, and the bow given its reload: the arrow, as it
 * ended. Pressed again within the reload, a shot looses nothing, and counted as one it read as an arrow through the
 * wall dealing nothing.
 */
async function loose(lab: Lab, shot: BoundSkill, aim: THREE.Vector3, draw = ARROW_DRAW): Promise<Projectile> {
  const before = new Set(G.projectiles);
  const ownNew = (): Projectile | undefined => G.projectiles.find((p) => !before.has(p) && p.by === lab.player);
  await lab.step(draw, () => pressing(shot.key, aim, true));
  await lab.until(() => Boolean(ownNew()), LOOSE_WAIT, 'the arrow was never loosed', () => ({ aim }));
  const arrow = ownNew()!;
  await lab.until(() => !arrow.alive, FLIGHT_WAIT, 'the arrow never ended its flight', () => ({ aim }));
  await lab.step(RELOAD, () => ({ aim }));
  return arrow;
}

/** The points the arrows are aimed at on `ward`, in turn: across its width, up its height. */
function arrowAims(ward: Ward): THREE.Vector3[] {
  const { middle, along } = lineOf(ward);
  const aims: THREE.Vector3[] = [];
  for (const across of ARROWS_ACROSS) {
    for (const up of ARROWS_UP) aims.push(middle.clone().addScaledVector(along, across).setY(up));
  }
  return aims;
}

/**
 * arrows: his arrows loosed into it at points across its width and up its height, one after another, each wearing it
 * as it wears a prop, and breaking it at its life. An arrow that wore nothing went through a gap: a problem.
 */
async function arrows(lab: Lab, options: HedgewardOptions): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  const hero = G.player;
  const ward = await raiseAt(lab, skill, hero.pos.clone().addScaledVector(way, ARROW_OUT));
  const shot = skillNamed('mouse0'), moments: Pictured[] = [];
  const through: string[] = [];
  let loosed = 0;
  // (pictured standing, half worn and as it breaks, over the shoulder)
  if (options.pictures) moments.push(await lab.screen('arrows: the wall standing', [`life ${ward.prop.life} of ${ward.prop.max}`]));
  let halfShown = false;
  for (const aim of arrowAims(ward)) {
    if (ward.prop.broken) break;
    const before = ward.prop.life;
    const arrow = await loose(lab, shot, aim);
    loosed++;
    if (ward.prop.life >= before && !ward.prop.broken) {
      const along = lineOf(ward).along.dot(arrow.pos.clone().sub(lineOf(ward).middle));
      through.push(`${aim.y.toFixed(2)} m up, landed ${along.toFixed(1)} m along`);
    }
    if (options.pictures && !halfShown && ward.prop.life <= ward.prop.max / 2 && !ward.prop.broken) {
      halfShown = true;
      moments.push(await lab.screen('arrows: worn half way, arrows standing in it', [`life ${ward.prop.life} of ${ward.prop.max}`]));
    }
  }
  if (options.pictures && ward.prop.broken) {
    await lab.step(8);
    moments.push(await lab.screen('arrows: broken by the arrows', [`${loosed} loosed`]));
  }
  const state = ward.prop.broken ? 'broken' : `standing at ${ward.prop.life} of ${ward.prop.max}`;
  const lines = [`arrows: ${loosed} loosed across it and up it, ${state}; ${through.length} dealt nothing`];
  const problems: string[] = [];
  if (through.length) {
    problems.push(`arrows: through it dealing nothing: ${through.length} of ${loosed} (${through.join(', ')})`);
  }
  if (!ward.prop.broken) problems.push(`arrows: never broke it (${loosed} loosed, its life ${ward.prop.max})`);
  return { lines, problems, moments };
}

/** played: where he shoots it from, as he steps back and aside after raising it (m from its middle, and the angle off
 *  square across it, rad) */
const PLAYED_STANDS: { out: number; off: number }[] = [
  { out: 3, off: 0 },
  { out: 6, off: 0 },
  { out: 6, off: 0.75 },
  { out: 10, off: 0 },
];
/** played: the draws, let go just past the bow's least draw and at full draw (frames held), and the points aimed at on
 *  the wall, across it from its middle and up from its foot (m) */
const PLAYED_DRAWS: { name: string; frames: number }[] = [
  { name: 'least', frames: 40 },
  { name: 'full', frames: 80 },
];
const PLAYED_AIMS: { across: number; up: number }[] = [
  { across: 0, up: 0.15 },
  { across: 0, up: 0.5 },
  { across: 0, up: 0.85 },
  { across: -1.2, up: 0.15 },
  { across: 1.2, up: 0.15 },
  { across: 1.2, up: 0.5 },
];
/** played: how far before its line an arrow that wore nothing may have ended and still be the wall's (m: its circles
 *  are 0.25 round, and an arrow's middle is half its length behind its point) */
const BEFORE_LINE = 0.8;

/** One stand's place before `ward`: `out` from its middle, `off` round from square on his side of it. */
function standBefore(ward: Ward, toward: THREE.Vector3, stand: { out: number; off: number }): THREE.Vector3 {
  const { middle } = lineOf(ward);
  const way = toward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), stand.off);
  return middle.clone().addScaledVector(way, stand.out);
}

/**
 * played: his arrows at the wall as the player looses them, from where he raised it and stepped back and aside, at
 * least and full draw, low, half way and high on it, each at a whole wall (its life set back before each): every
 * arrow that ends at the wall must wear it. From Victor's review of #647, "Sometimes arrow can fly through without
 * dealing damage, I get it more than half the time": through a gap between its stakes the cursor from above finds the
 * earth at its foot, and an arrow aimed there put its point in the ground before its middle met the wall, and stood
 * there dealing nothing. `arrows`, aimed at its face at full draw from 3 m, never met it.
 */
async function played(lab: Lab, options: HedgewardOptions, canary: boolean): Promise<Outcome> {
  if (!canary) return playedWith(lab, options, 'played', null);
  // (the canary: played twice, each with a fault of its own planted: the wall met as drawn alone, as before its solid,
  // the cursor finding the gaps between its stakes; and the props met by an arrow's middle after its flight, as before
  // its tip, its point in the ground at the wall's foot first)
  const { holdWallSolid } = await import('../../../src/combat/skills/hedgeward');
  const { holdPropsAfterFlight } = await import('../../../src/combat/projectiles');
  const drawn = await playedWith(lab, options, 'played as drawn', holdWallSolid);
  const late = await playedWith(lab, options, 'played met late', holdPropsAfterFlight);
  return {
    lines: [...drawn.lines, ...late.lines],
    problems: [...drawn.problems, ...late.problems],
    moments: [],
  };
}

/** `played` under `name`, a wall raised afresh, with `plant` held on through it (a canary's fault) where it's given. */
async function playedWith(lab: Lab, options: HedgewardOptions, name: string,
  plant: ((on: boolean) => void) | null): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  plant?.(true);
  try {
    return await playedFrom(lab, skill, way, name);
  } finally {
    plant?.(false);
  }
}

/** One of `played`'s arrows, as it ended: its wall worn, stopped short of it by something else, or how it went through
 *  dealing nothing. */
type PlayedShot = { kind: 'worn' } | { kind: 'short' } | { kind: 'through'; how: string };

/** A shot of `played`: him stood at `at` facing the wall, its life set back, an arrow loosed at `aim` on it. */
async function playedShot(lab: Lab, ward: Ward, toward: THREE.Vector3, at: THREE.Vector3, aim: THREE.Vector3,
  drawFrames: number): Promise<PlayedShot> {
  const hero = G.player;
  hero.place(at.clone(), Math.atan2(-toward.x, -toward.z));
  ward.prop.life = ward.prop.max;
  const arrow = await loose(lab, skillNamed('mouse0'), aim, drawFrames);
  if (ward.prop.life < ward.prop.max) return { kind: 'worn' };
  // (where it ended, before the wall's line on his side: one stopped short by something else isn't the wall's)
  const { middle } = lineOf(ward);
  const before = arrow.pos.clone().sub(middle).dot(toward);
  if (before > BEFORE_LINE) return { kind: 'short' };
  const took = hero.aim.clone();
  const tookBefore = took.clone().sub(middle).dot(toward);
  const how = `ended ${before.toFixed(2)} m before its line ${arrow.pos.y.toFixed(2)} m up, past ${arrow.passed.size} `
    + `of its circles; the cursor took ${tookBefore.toFixed(2)} m before its line ${took.y.toFixed(2)} m up`;
  return { kind: 'through', how };
}

/** `played`'s arrows under `name`, its wall raised `way` from where he stands. */
async function playedFrom(lab: Lab, skill: BoundSkill, way: THREE.Vector3, name: string): Promise<Outcome> {
  const ward = await raiseAt(lab, skill, G.player.pos.clone().addScaledVector(way, ARROW_OUT));
  const toward = way.clone().negate();
  const { middle, along } = lineOf(ward);
  const through: string[] = [];
  let worn = 0;
  let short = 0;
  for (const stand of PLAYED_STANDS) {
    const at = standBefore(ward, toward, stand);
    const standName = `${stand.out} m out ${Math.round(THREE.MathUtils.radToDeg(stand.off))}°`;
    for (const draw of PLAYED_DRAWS) {
      for (const { across, up } of PLAYED_AIMS) {
        const aim = middle.clone().addScaledVector(along, across).setY(up);
        const shot = await playedShot(lab, ward, toward, at, aim, draw.frames);
        if (shot.kind === 'worn') worn++;
        else if (shot.kind === 'short') short++;
        else through.push(`${standName}, ${draw.name} draw, ${across} m across ${up} m up: ${shot.how}`);
      }
    }
  }
  const met = worn + through.length;
  const lines = [`${name}: ${met} arrows met the wall from ${PLAYED_STANDS.length} stands, at least and full draw; `
    + `${through.length} dealt nothing; ${short} stopped short of it`];
  const problems: string[] = [];
  if (through.length) {
    problems.push(`${name}: through it dealing nothing: ${through.length} of ${met} (${through.join('; ')})`);
  }
  return { lines, problems, moments: [] };
}

/** walled: him boxed in by four walls, a husk outside breaking its way through one, never striking him over a wall
 *  still standing. */
async function walled(lab: Lab, options: HedgewardOptions, canary: boolean): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  const hero = G.player, from = hero.pos.clone(), across = new THREE.Vector3(way.z, 0, -way.x);
  const box: Ward[] = [], problems: string[] = [];
  let worstOff = 0;
  for (const dir of [way, across, way.clone().negate(), across.clone().negate()]) {
    hero.cooldowns.clear();
    hero.energy = hero.stats.maxEnergy;
    const aim = from.clone().addScaledVector(dir, BOX_OUT);
    const ward = await raiseAt(lab, skill, aim);
    const off = flat(lineOf(ward).middle, aim.clone().addScaledVector(dir, LINE_OUT));
    // (stepped back from where it was aimed by a prop beside it, said: a box left open, the husk walks in, and the
    // check below that it broke its way in fails)
    worstOff = Math.max(worstOff, off);
    box.push(ward);
  }
  // (he stands still in it)
  const keep = (): void => {
    hero.pos.x = from.x;
    hero.pos.z = from.z;
    hero.vel.set(0, 0, 0);
  };
  lab.beforeFrame.push(keep);
  const undo = canary ? box.map(unbreakable) : [];
  const watch = hurtsFrom(lab);
  let overStanding = 0, brokeAt = -1, shownBreak = false;
  const moments: Pictured[] = [];
  const foe = lab.spawnFoe('husk', from.clone().addScaledVector(way, BOX_FOE_OUT));
  try {
    await lab.until(() => foe.spawning <= 0, RISE_FRAMES, 'the husk never rose');
    if (options.pictures) moments.push(await lab.screen('walled: boxed in by four walls, a husk outside'));
    for (let frame = 0; frame < BOX_FRAMES; frame++) {
      const hurtsBefore = watch.hurts.length, whole = box.every((ward) => !ward.prop.broken);
      await lab.step(1);
      if (watch.hurts.length > hurtsBefore && whole) overStanding++;
      if (brokeAt < 0 && box.some((ward) => ward.prop.broken)) brokeAt = frame;
      if (options.pictures && !shownBreak && brokeAt >= 0 && frame >= brokeAt + 6) {
        shownBreak = true;
        moments.push(await lab.screen('walled: the husk broke its way through one'));
      }
      if (brokeAt >= 0 && watch.hurts.length) break;
    }
  } finally {
    watch.stop();
    for (const back of undo) back();
    lab.beforeFrame.splice(lab.beforeFrame.indexOf(keep), 1);
  }
  const worn = box.reduce((sum, ward) => sum + ward.prop.max - Math.max(0, ward.prop.life), 0);
  const lines = [`walled: boxed in by ${box.length} walls (no limit), the husk wore them by ${worn},`
    + ` ${brokeAt >= 0 ? `broke one at frame ${brokeAt}` : 'broke none'}; struck him ${watch.hurts.length} times,`
    + ` ${overStanding} over walls still standing; the walls rose within ${metres(worstOff)} of their aims`];
  if (worn <= 0) problems.push('walled: never broke its way in: struck no wall');
  else if (brokeAt < 0) problems.push(`walled: never broke its way in (${BOX_FRAMES} frames)`);
  if (overStanding) problems.push(`walled: struck him ${overStanding} times over walls still standing`);
  return { lines, problems, moments };
}

/** slammed: a foe's slam landing on it (enemyAI's `slamAt`, as a Brute's) wears it as a prop. */
async function slammed(lab: Lab, options: HedgewardOptions): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  const ward = await raiseAt(lab, skill, G.player.pos.clone().addScaledVector(way, AIM_OUT));
  const { middle } = lineOf(ward);
  fx('slam', middle.x, middle.z, 1.5, 0xff6a2a, 0, 80);
  await lab.step(2);
  const worn = ward.prop.max - ward.prop.life;
  const lines = [`slammed: a slam on it took ${worn} of its ${ward.prop.max} life`];
  return { lines, problems: worn > 0 ? [] : ['slammed: a slam on it wore nothing'], moments: [] };
}

/** trampled: a big foe beyond the wall walking at him straight through it, breaking it as it walks into it. */
async function trampled(lab: Lab, options: HedgewardOptions, canary: boolean): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  const hero = G.player;
  const ward = await raiseAt(lab, skill, hero.pos.clone().addScaledVector(way, AIM_OUT));
  const undo = canary ? unbreakable(ward) : () => undefined;
  const kind = G.arena.biome === 'forest' ? 'barkhulk' : 'brute';
  const big = lab.spawnFoe(kind, lineOf(ward).middle.clone().addScaledVector(way, BIG_BEYOND));
  let frames = -1;
  const moments: Pictured[] = [];
  try {
    await lab.until(() => big.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
    // (it never throws or slams: it walks)
    const quiet = (): void => { big.cd = 1e3; };
    lab.beforeFrame.push(quiet);
    try {
      // (pictured as it comes up to the wall, and as it walks through, the wall broken under it)
      const near = (): boolean => nearestOnWard(ward, big.pos.x, big.pos.z, { x: 0, z: 0 }) < big.radius + 1.2;
      if (options.pictures) {
        await framesUntil(lab, () => near() || ward.prop.broken, TRAMPLE_FRAMES);
        moments.push(await lab.screen(`trampled: the ${kind} coming up to the wall`));
      }
      frames = await framesUntil(lab, () => ward.prop.broken, TRAMPLE_FRAMES);
      if (options.pictures && frames >= 0) {
        await lab.step(10);
        moments.push(await lab.screen(`trampled: the ${kind} walked through it`));
      }
    } finally {
      lab.beforeFrame.splice(lab.beforeFrame.indexOf(quiet), 1);
    }
  } finally {
    undo();
  }
  const lines = [`trampled: the ${kind} (${big.radius} m round) ${frames >= 0 ? `walked through it, breaking it in ${frames} frames` : 'never broke it'}`];
  return { lines, problems: frames >= 0 ? [] : [`trampled: never broke it (the ${kind} walked ${TRAMPLE_FRAMES} frames)`], moments };
}

/** stays: it stands long after it rose; struck to none it breaks at once; a newer one past `most` takes the oldest down. */
async function stays(lab: Lab, options: HedgewardOptions): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  const lines: string[] = [], problems: string[] = [];
  const out = (dir: THREE.Vector3, metresOut: number): THREE.Vector3 =>
    G.player.pos.clone().addScaledVector(dir, metresOut);
  const again = async (dir: THREE.Vector3, metresOut: number): Promise<Ward> => {
    G.player.cooldowns.clear();
    G.player.energy = G.player.stats.maxEnergy;
    return raiseAt(lab, skill, out(dir, metresOut));
  };
  const first = await raiseAt(lab, skill, out(way, AIM_OUT));
  await lab.step(STAYS_FRAMES);
  const stood = wards.includes(first) && wallRoot() !== undefined;
  lines.push(`stays: ${(STAYS_FRAMES / 60).toFixed(0)} s after it rose, ${stood ? 'standing' : 'GONE'}`);
  if (!stood) problems.push(`stays: gone within ${(STAYS_FRAMES / 60).toFixed(0)} s of rising`);
  // (struck down to none, it breaks at once, its body out of every way)
  hurtProp(first.prop.parts[0], first.prop.life);
  await lab.step(1);
  const broken = !wards.includes(first) && !first.prop.parts.some((circle) => G.arena.obstacles.includes(circle));
  lines.push(`stays: struck to 0 life, ${broken ? 'broken at once' : 'STILL STANDING'}`);
  if (!broken) problems.push('stays: struck to 0 life, it still stood');
  // (four raised round him, a way each: no limit, every one stands; one way has no room for four within his reach)
  const across = new THREE.Vector3(way.z, 0, -way.x);
  const raised: Ward[] = [];
  for (const dir of [way, across, way.clone().negate(), across.clone().negate()]) {
    raised.push(await again(dir, AIM_OUT));
  }
  const standingNow = raised.filter((ward) => wards.includes(ward)).length;
  lines.push(`stays: ${FOUR} raised, ${standingNow} standing`);
  if (standingNow !== FOUR) problems.push(`stays: ${standingNow} standing after ${FOUR} raised`);
  const looks = (): number => G.scene.children.filter((o) => o.name === 'hedgeward').length;
  // (the wave cleared, as the run says it: every wall comes apart)
  emit('waveCleared', G.run?.wave ?? 1);
  await lab.step(1);
  const left = wards.length, cleared = await framesUntil(lab, () => looks() === 0, FADE_FRAMES);
  lines.push(`stays: the wave cleared, ${left} standing, their looks ${cleared < 0 ? 'STAYED' : `gone in ${cleared} frames`}`);
  if (left) problems.push(`stays: ${left} stood after the wave was cleared`);
  if (cleared < 0) problems.push('stays: the looks stayed after the wave was cleared');
  return { lines, problems, moments: [] };
}

/** arrow: his own arrow loosed at a dummy beyond the wall flies on past it. */
async function arrow(lab: Lab, options: HedgewardOptions, canary: boolean): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  const hero = G.player, from = hero.pos.clone();
  const ward = await raiseAt(lab, skill, from.clone().addScaledVector(way, ARROW_OUT));
  const { middle } = lineOf(ward);
  // (the canary: its body made a tall prop's, its look what an arrow meets there, which it strikes)
  const unplant = canary ? plantAsProp(ward) : () => undefined;
  const target = middle.clone().addScaledVector(way, DUMMY_BEYOND);
  const dummy = lab.spawnFoe('dummy', target);
  await lab.until(() => dummy.spawning <= 0, RISE_FRAMES, 'the dummy never rose');
  const aim = target.clone().setY(1.1);
  const shot = skillNamed('mouse0');
  const before = new Set(G.projectiles);
  let past = 0, loosed = 0;
  const watchArrows = (): void => {
    for (const p of G.projectiles) {
      if (before.has(p) || p.hostile || !p.alive) continue;
      loosed = Math.max(loosed, 1);
      past = Math.max(past, p.pos.clone().sub(middle).dot(way));
    }
  };
  try {
    await lab.step(DRAW_FRAMES, () => pressing(shot.key, aim, true));
    await lab.step(ARROW_FRAMES, () => ({ aim }), watchArrows);
  } finally {
    unplant();
  }
  const flew = loosed ? `loosed, flew ${metres(past)} past the wall's line` : 'NEVER LOOSED';
  const lines = [`arrow: ${flew} (the dummy ${metres(DUMMY_BEYOND)} past it)`];
  const problems: string[] = [];
  if (!loosed) problems.push('arrow: no arrow was loosed');
  else if (past < ward.prop.parts[0].r + 0.5) problems.push(`arrow: stopped by his own wall (${metres(past)} past its line)`);
  return { lines, problems, moments: [] };
}

/** The wall pictured alone from round it (front, three-quarter, side, above), him hidden. */
async function studio(lab: Lab, options: HedgewardOptions): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  const hero = G.player;
  const ward = await raiseAt(lab, skill, hero.pos.clone().addScaledVector(way, AIM_OUT));
  await lab.step(30);
  const { middle } = lineOf(ward);
  const at = middle.clone().setY(1);
  const yaw = Math.atan2(way.x, way.z), moments: Pictured[] = [];
  hero.obj.visible = false;
  try {
    // (a close-up turns with his facing: turned so, its front view is the wall's front from the foes' side)
    const shots: [string, number, 'front' | 'above' | 'plan'][] = [
      ['model front', 0, 'front'], ['model three-quarter', -Math.PI / 4, 'front'], ['model side', -Math.PI / 2, 'front'],
      ['model back', Math.PI, 'front'], ['model above', Math.PI - 0.35, 'above'], ['model plan', 0, 'plan'],
    ];
    for (const [label, turn, view] of shots) {
      hero.facing = yaw + turn;
      moments.push(lab.picture(label, [view], [], { at, distance: view === 'plan' ? PLAN_DISTANCE : STUDIO_DISTANCE }));
    }
  } finally {
    hero.obj.visible = true;
  }
  return { lines: [`pictures: the wall alone from ${moments.length} sides`], problems: [], moments };
}

/** In `biome`, from the game's views: the wall standing, its preview held, and a blow on it with its bar. */
async function inBiome(lab: Lab, options: HedgewardOptions, biome: BiomeId): Promise<Outcome> {
  const moments: Pictured[] = [];
  for (const view of ['top', 'third'] as const) {
    if (G.arena.biome !== biome) G.arena.setBiome(biome);
    const { way, skill } = await setUp(lab, { ...options.fixture, view });
    const hero = G.player, aim = hero.pos.clone().addScaledVector(way, AIM_OUT);
    // (over the shoulder the crosshair aims, not the mouse: turned onto the aim with it)
    const sight = view === 'third' ? { sight: aim } : {};
    await lab.step(HOLD_FRAMES, () => ({ ...pressing(skill.key, aim, true), ...sight }));
    moments.push(await lab.screen(`${biome} ${view} preview held`));
    await lab.until(() => wards.length > 0, RAISE_FRAMES, 'the Hedgeward never rose', () => ({ aim, ...sight }));
    await lab.step(40, () => ({ aim, ...sight }));
    moments.push(await lab.screen(`${biome} ${view} standing`));
    const ward = wards.at(-1)!;
    hurtProp(ward.prop.parts[0], ward.prop.max * 0.4);
    await lab.step(2);
    moments.push(await lab.screen(`${biome} ${view} hit, its gauge`, [`life ${ward.prop.life} of ${ward.prop.max}`]));
  }
  return { lines: [`pictures: ${biome}, ${moments.length} moments`], problems: [], moments };
}

/** reach: aimed far past its range it rises at its range; aimed onto a foe, before it; behind a prop, not at all. */
async function reach(lab: Lab, options: HedgewardOptions): Promise<Outcome> {
  const { way, skill } = await setUp(lab, options.fixture);
  const hero = G.player, from = hero.pos.clone(), range = skill.def.range ?? 0;
  const lines: string[] = [], problems: string[] = [];
  const ready = (): void => { clearEffects(); hero.cooldowns.clear(); hero.energy = hero.stats.maxEnergy; };
  const far = await raiseAt(lab, skill, from.clone().addScaledVector(way, range + 6));
  const out = flat(lineOf(far).middle, from);
  lines.push(`reach: aimed ${metres(range + 6)} out, it rose ${metres(out)} out (its range ${metres(range)})`);
  if (out > range + 0.2) problems.push(`reach: it rose ${metres(out)} out, past its ${metres(range)} range`);
  // (onto a foe standing where it would rise, as a tap on touch aims: it rises before the foe, never on it)
  ready();
  const spot = from.clone().addScaledVector(way, AIM_OUT);
  const dummy = lab.spawnFoe('dummy', spot);
  await lab.until(() => dummy.spawning <= 0, RISE_FRAMES, 'the dummy never rose');
  const onFoe = await raiseAt(lab, skill, spot);
  const gap = Math.min(...onFoe.prop.parts.map((c) => flat(c, dummy.pos) - c.r - dummy.radius));
  const before = flat(lineOf(onFoe).middle, from) < flat(dummy.pos, from);
  lines.push(`reach: aimed onto a foe, it rose ${before ? 'before' : 'BEYOND'} it, ${metres(gap)} clear of its body`);
  if (gap < 0) problems.push(`reach: aimed onto a foe, it rose ${metres(-gap)} into its body`);
  if (!before) problems.push('reach: aimed onto a foe, it rose beyond it');
  dummy.die();
  // (a tall prop planted right before him, nearer than it's ever raised: nowhere clear, so refused, red while held,
  // the energy kept; one farther out, it rises before it)
  ready();
  const block = { x: from.x + way.x * 1.2, z: from.z + way.z * 1.2, r: 0.5, h: 3 };
  G.arena.obstacles.push(block);
  const was = new Set(wards), energy = hero.energy;
  let red = 0;
  try {
    await lab.step(HOLD_FRAMES, () => pressing(skill.key, spot, true), () => { red = Math.max(red, readinessOf('hedgeward')?.red ?? 0); });
    await lab.step(RAISE_FRAMES, () => ({ aim: spot }));
  } finally {
    G.arena.obstacles.splice(G.arena.obstacles.indexOf(block), 1);
  }
  const rose = wards.some((ward) => !was.has(ward)), spent = energy - hero.energy;
  lines.push(`reach: behind a prop, ${rose ? 'RAISED' : 'not raised'}, its outline ${red > 0.9 ? 'red' : 'NOT red'}, ${Math.round(spent)} energy spent`);
  if (rose) problems.push('reach: raised behind a prop standing in the way');
  if (red <= 0.9) problems.push('reach: its outline was not red behind a prop');
  if (spent > 0.5) problems.push(`reach: the refused press spent ${Math.round(spent)} energy`);
  return { lines, problems, moments: [] };
}

/** A case that threw: its error as its line and its problem. */
function thrown(name: string, error: Error): Outcome {
  const said = `${name}: ${error.message}`;
  return { lines: [said], problems: [said], moments: [] };
}

/** The life of the wall raised last (0: none), for `tooltips`' figures. */
export const lastWallLife = (): number => wards.at(-1)?.prop.max ?? 0;

/** what each planted fault must show as: the start of the problem it causes */
const CANARY_CAUGHT = {
  round: 'round: went',
  arrow: 'arrow: stopped by his own wall',
  // (an arrow through a gap the cursor found: the wall met as drawn alone)
  drawn: 'played as drawn: through it dealing nothing',
  // (an arrow aimed low as the cursor finds the wall from above: the props met after its flight, by its middle)
  late: 'played met late: through it dealing nothing',
  trampled: 'trampled: never broke it',
  walled: 'walled: never broke its way in',
};

/** `lab hedgeward`: every case, its lines and problems; with `--canary`, the planted faults, each a problem unless
 *  caught; with `--pictures`, the wall pictured. */
export async function hedgeward(lab: Lab, options: HedgewardOptions): Promise<Report> {
  if (!G.player.known.get('hedgeward')) {
    throw new Error(`lab: hedgeward: the ${G.player.cls.id} has no Hedgeward (--class ranger)`);
  }
  const outcomes: Outcome[] = [];
  const canary = options.canary;
  const cases: [string, () => Promise<Outcome>][] = [
    ['placed', () => placed(lab, options)],
    ['bolts', () => bolts(lab, options)],
    ['round', () => round(lab, options, canary)],
    ['arrows', () => arrows(lab, options)],
    ['played', () => played(lab, options, canary)],
    ['walled', () => walled(lab, options, canary)],
    ['slammed', () => slammed(lab, options)],
    ['trampled', () => trampled(lab, options, canary)],
    ['stays', () => stays(lab, options)],
    ['arrow', () => arrow(lab, options, canary)],
    ['reach', () => reach(lab, options)],
  ];
  if (options.pictures) {
    cases.push(['pictures', () => studio(lab, options)]);
    for (const biome of ['forest', 'crypt'] as const) {
      cases.push([`pictures ${biome}`, () => inBiome(lab, options, biome)]);
    }
  }
  // (a case that throws is its problem, the others still run)
  const chosen = cases.filter(([name]) => !options.cases || options.cases.includes(name.split(' ')[0]));
  for (const [name, run] of chosen) outcomes.push(await run().catch((error: Error) => thrown(name, error)));
  const lines = outcomes.flatMap((outcome) => outcome.lines);
  const problems = outcomes.flatMap((outcome) => outcome.problems);
  const moments = outcomes.flatMap((outcome) => outcome.moments);
  if (!canary) return { text: lines.join('\n'), problems, moments };
  const caughtBy = (sign: string): boolean => problems.some((problem) => problem.startsWith(sign));
  const run = Object.entries(CANARY_CAUGHT).filter(([, sign]) => !options.cases
    || options.cases.includes(sign.split(/[ :]/)[0]));
  const caught = run.map(([fault, sign]) => [fault, caughtBy(sign)] as const);
  const verdict = caught.map(([fault, was]) => `canary ${fault}: ${was ? 'caught' : 'MISSED'}`);
  const missed = caught.filter(([, was]) => !was).map(([fault]) => `the canary's ${fault} fault went uncaught`);
  return { text: [...lines, ...verdict].join('\n'), problems: missed, moments };
}
