// The Ossuary Twins' belt skulls (tools/lab `twins --parts belt,bomb,poison,inherit,cost,beltPictures`;
// entities/twinSkulls.ts): the skulls each twin carries on a rope at its waist and throws now and then.
//
// - `belt`: both twins left to fight a hero held where he stands, out of their slam's reach: each throws at most its
//   belt's skulls, and its model's rope shows what its belt has left whenever it holds none; no throw comes sooner
//   than the cooldown after its last, nor while its last is still out; and no two of the pair's warned hits (a
//   volley, a slam, a charge, a bomb's blast, a poison's landing) come closer than their beat.
// - `bomb`: a bomb thrown beside a hero standing still lands where its glow lies and bursts after its fuse, hurting
//   him once and stunning him its stun's seconds where he stands, its skull lying there all its fuse; a poison cloud
//   on him through the stun hurts him none of it; a second bomb bursting within the stun's rest hurts him but stuns
//   him not; a raised shield turned to it (a hero with one) takes it and the stun; stepped out of its glow during its
//   fuse, not hurt at all.
// - `poison`: a cloud with a hero just outside its edge never hurts him; one on him hurts him a tick at a time, as
//   often as its data says, each a small share of his life, and is gone on time.
// - `inherit`: a bomb thrown, then Slab collapsing at half: Reliquary holds what was left of his bombs with its own
//   poison, and its model shows both ropes so.
// - `cost`: the frame with a bomb lying and a cloud out against the frame with none, in turns within one page, by the
//   browser's clock; then the GPU's frame by the engine's clock with their skulls and glows shown and hidden in turns
//   (`gpuTurns.ts`).
// - `beltPictures` (asked for alone): the belts close on both, a throw from the side (unhook, wind-up, release,
//   flight, landing), the bomb's fuse, its blast and the hero thrown from the player's view, the cloud with a hero at
//   its edge, the survivor with both belts.
//
// Each judged part plants a fault with `--canary`: a belt of six and a cooldown of 2 s judged against the shipped,
// a rope that never empties, a beat of none; a stun of 0.1 s with no rest, a fuse of 0.2 s and a held hero not
// passed by; a cloud past its ring; a survivor
// whose model shows its own rope alone.
// This module reads twins.ts's helpers only inside its functions: twins.ts imports it.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { TwinsOptions } from './twins';
import { G } from '../../../src/state';
import { TWINS } from '../../../src/data/foes/twins';
import { ARENA } from '../../../src/data/balance';
import { fx, setFxSink } from '../../../src/entities/enemyAI';
import { telegraphShare } from '../../../src/entities/bossKit';
import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';
import { costInTurns, sure } from './gpuTurns';
import { BOMB_HOLD, SKULLS_THROWN, SKULL_KINDS, skullFlight, type SkullKind, type SkullThrown } from '../../../src/entities/twinSkulls';
import { keepWhole, pairAt, standIn } from './twins';
import { faceCamera, saveCamera, setView, type ViewMode } from '../../../src/core/renderer';
import { beltSkullMesh, beltSkullTriangles } from '../../../src/entities/models/beltSkull';
import { flash } from '../../../src/fx/lights';

/** the lab's frames a second */
const FPS = 60;
/** the twins' speed while the lab holds them where they stand (m/s): a foe's seek divides by its reach, and at none
 *  its velocity, its walk's phase and every joint of its model came out NaN, the whole twin drawn nowhere */
export const STILL = 1e-3;
/** the belt as the game ships it, read before any canary plants its fault */
const SHIPPED = {
  skulls: TWINS.belt.skulls, every: TWINS.belt.every, beat: TWINS.beat,
  stun: TWINS.bomb.stun, rest: TWINS.bomb.rest, fuse: TWINS.bomb.fuse, radius: TWINS.poison.radius,
};
/** how long the pair is left to fight for `belt` (s): every skull thrown and a while with none left */
const BELT_FIGHT = 52;
/** how far off its data a stun may last (s), a fuse may burst (s), and a warned hit may come inside its beat (s) */
const STUN_SLACK = 2 / FPS;
const FUSE_SLACK = 2 / FPS;
const BEAT_SLACK = 0.05;
/** how far from where a skull lands the lab throws it from (m) */
const THROWN_FROM = 10;
/** the share of the hero's life a poison's tick may take at most */
const TICK_MOST = 0.1;
/** frames each turn of `cost` is timed for, and how many turns of each */
const COST_FRAMES = 30;
const COST_TURNS = 6;

const fixed = (value: number, digits = 2): string => value.toFixed(digits);
/** a model's skulls as drawn: on its ropes, and in its hand */
type BeltSkulls = { rope: Record<SkullKind, THREE.Object3D[]>; hand: Record<SkullKind, THREE.Object3D> };
const skullsOf = (e: Enemy): BeltSkulls => e.model.root.userData.beltSkulls as BeltSkulls;
/** how many of `kind` a twin's model shows on its ropes (a skull drawn, not left undrawn) */
const shownOn = (e: Enemy, kind: SkullKind): number => skullsOf(e).rope[kind].filter((s) => s.visible).length;
/** what a twin's belt holds, as the game keeps it on every game */
const heldBy = (e: Enemy, kind: SkullKind): number => e.brain[kind] ?? 0;

/** The hero's hurts while `run` runs, by his own takeDamage: what each took. */
async function hurtsWhile(run: () => Promise<void>): Promise<number[]> {
  const hero = G.player;
  const takeDamage = hero.takeDamage;
  const hurts: number[] = [];
  hero.takeDamage = (...args) => {
    const result = takeDamage.apply(hero, args);
    if (result && result.taken > 0) hurts.push(result.taken);
    return result;
  };
  try {
    await run();
  } finally {
    hero.takeDamage = takeDamage;
  }
  return hurts;
}

/** The newest belt skull thrown. */
const lastThrown = (): SkullThrown => {
  const thrown = SKULLS_THROWN.at(-1);
  if (!thrown) throw new Error('lab: no belt skull was thrown');
  return thrown;
};

/** A belt skull of `kind` thrown by `by` from `THROWN_FROM` m off at (tx, tz), as its fx plays it on every game. */
function throwAt(by: Enemy, kind: SkullKind, tx: number, tz: number, damage: number): SkullThrown {
  const away = new THREE.Vector3(by.pos.x - tx, 0, by.pos.z - tz).normalize().multiplyScalar(THROWN_FROM);
  const from = new THREE.Vector3(tx + away.x, 3, tz + away.z);
  fx('beltSkull', by.id, SKULL_KINDS.indexOf(kind), from.x, from.y, from.z, tx, tz, skullFlight(THROWN_FROM), damage);
  return lastThrown();
}

// --- the belt ---------------------------------------------------------------------------------------------

/** A twin's throws as the fight went: when each left, and when it was no longer out. */
interface Throws { at: number[]; out: number[] }
/** A warned hit of the pair: when it landed, and what it was. */
/** a warned hit of the pair: when it lands, what it is, and how long it holds the hero after (a bomb's stun, s) */
interface Hit { t: number; what: string; holds: number }

/** Each twin's model against its belt, read at a moment it holds no skull: the mismatches said. */
function beltShown(twins: Enemy[], mismatches: string[]): void {
  for (const twin of twins) {
    if (twin.action?.name === 'bomb' || twin.action?.name === 'poison') continue;
    for (const kind of SKULL_KINDS) {
      const held = heldBy(twin, kind);
      const shown = shownOn(twin, kind);
      if (held !== shown) mismatches.push(`${twin.type} ${kind}: ${shown} shown, ${held} held at ${fixed(G.time, 1)} s`);
    }
  }
}

/** The pair left to fight a hero held where he stands: their throws, what their models showed, their warned hits. */
async function beltFight(lab: Lab): Promise<{ throws: Map<number, Throws>; mismatches: string[]; hits: Hit[] }> {
  const { slab, reliquary } = await pairAt(lab, 12, true);
  const twins = [slab, reliquary];
  // (standing where they rose, out of the slam's and the charge's reach, so the belt and the volley are what's left)
  for (const twin of twins) (twin as { speed: number }).speed = STILL;
  const spot = G.player.pos.clone();
  const mismatches: string[] = [];
  const hits: Hit[] = [];
  SKULLS_THROWN.length = 0;
  setFxSink((name) => {
    if (name === 'slam' || name === 'twinCharge' || name === 'skullVolley') hits.push({ t: G.time, what: name, holds: 0 });
  });
  try {
    const frames = BELT_FIGHT * FPS;
    for (let frame = 0; frame < frames; frame += 10) {
      await lab.step(10, () => {
        G.player.pos.copy(spot);
        G.player.knock.set(0, 0, 0);
        return keepWhole();
      });
      beltShown(twins, mismatches);
    }
  } finally {
    setFxSink(null);
  }
  const throws = new Map<number, Throws>();
  for (const twin of twins) throws.set(twin.id, { at: [], out: [] });
  for (const thrown of SKULLS_THROWN) {
    const mine = throws.get(thrown.by)!;
    mine.at.push(thrown.at);
    mine.out.push(thrown.gone ?? Infinity);
    const t = thrown.kind === 'bomb' ? thrown.blast?.t : thrown.landed?.t;
    const bomb = thrown.kind === 'bomb';
    hits.push({ t: t ?? Infinity, what: `${thrown.kind} ${bomb ? 'blast' : 'landing'}`, holds: bomb ? SHIPPED.stun : 0 });
  }
  return { throws, mismatches, hits };
}

/** Every throw's start and flight finite, and each landing a flight after it left: a NaN flew a skull from nowhere
 *  (it landed as it was thrown) and draws black boxes through the bloom. */
function judgeFlights(lines: string[], problems: string[]): void {
  const finite = (...values: number[]): boolean => values.every(Number.isFinite);
  const bad = SKULLS_THROWN.filter((s) => !finite(s.from.x, s.from.z, s.flight, s.to.x, s.to.z));
  const early = SKULLS_THROWN.filter((s) => s.landed && Math.abs(s.landed.t - s.at - s.flight) > FUSE_SLACK);
  const flights = SKULLS_THROWN.map((s) => s.flight);
  lines.push(`belt: ${SKULLS_THROWN.length} throws, ${bad.length} with a start or flight not finite, `
    + `${early.length} landing off their flight (flights ${fixed(Math.min(...flights))} to ${fixed(Math.max(...flights))} s)`);
  if (bad.length) problems.push(`belt: ${bad.length} throws had a start or flight that wasn't finite`);
  if (early.length) problems.push(`belt: ${early.length} throws landed off their flight's time`);
}

/** Each twin's throws judged: no more than its belt, none inside the cooldown, none while its last was out. */
function judgeThrows(name: string, mine: Throws, lines: string[], problems: string[]): void {
  const gaps = mine.at.slice(1).map((at, i) => at - mine.at[i]);
  const early = mine.at.slice(1).filter((at, i) => at < mine.out[i]);
  lines.push(`belt: ${name} threw ${mine.at.length} (at ${mine.at.map((t) => fixed(t, 1)).join(', ')} s), `
    + `the least gap ${gaps.length ? fixed(Math.min(...gaps), 1) : '-'} s`);
  if (mine.at.length > SHIPPED.skulls) problems.push(`belt: ${name} threw ${mine.at.length}, past its belt's ${SHIPPED.skulls}`);
  if (mine.at.length < SHIPPED.skulls) problems.push(`belt: ${name} threw only ${mine.at.length} of ${SHIPPED.skulls}`);
  if (gaps.some((gap) => gap < SHIPPED.every - FUSE_SLACK)) {
    problems.push(`belt: ${name} threw again ${fixed(Math.min(...gaps), 1)} s after its last, inside its ${SHIPPED.every} s`);
  }
  if (early.length) problems.push(`belt: ${name} threw ${early.length} while its last was still out`);
}

/** The pair's warned hits judged: none closer than their beat. */
function judgeBeat(hits: Hit[], lines: string[], problems: string[]): void {
  const sorted = hits.filter((hit) => Number.isFinite(hit.t)).sort((a, b) => a.t - b.t);
  let least = Infinity;
  let pair = '';
  for (let i = 1; i < sorted.length; i++) {
    // (counted from the end of what the hit before holds him for: after a bomb's blast, from its stun's end)
    const gap = sorted[i].t - (sorted[i - 1].t + sorted[i - 1].holds);
    if (gap >= least) continue;
    least = gap;
    pair = `${sorted[i - 1].what} at ${fixed(sorted[i - 1].t, 2)} s and ${sorted[i].what} at ${fixed(sorted[i].t, 2)} s`;
  }
  lines.push(`belt: ${sorted.length} warned hits of the pair, the closest two ${fixed(least)} s apart, a bomb's from `
    + `its stun's end (${pair}; their beat ${SHIPPED.beat} s)`);
  if (least < SHIPPED.beat - BEAT_SLACK) problems.push(`belt: two of the pair's warned hits came ${fixed(least)} s apart (${pair})`);
}

/** `belt`: the pair's throws through a fight, its models' ropes against its belts, and their warned hits' beat. */
export async function belt(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  if (options.canary) {
    TWINS.belt.skulls = 6;
    TWINS.belt.every = 2;
    TWINS.beat = 0;
  }
  try {
    const { throws, mismatches, hits } = await beltFight(lab);
    const [slabThrows, reliquaryThrows] = [...throws.values()];
    judgeThrows('Slab', slabThrows, lines, problems);
    judgeThrows('Reliquary', reliquaryThrows, lines, problems);
    judgeFlights(lines, problems);
    lines.push(`belt: the ropes against the belts, read every 10 frames: ${mismatches.length} apart`);
    if (mismatches.length) problems.push(`belt: a model's rope showed other than its belt (${mismatches.slice(0, 3).join('; ')})`);
    judgeBeat(hits, lines, problems);
  } finally {
    TWINS.belt.skulls = SHIPPED.skulls;
    TWINS.belt.every = SHIPPED.every;
    TWINS.beat = SHIPPED.beat;
  }
}

// --- the bomb ---------------------------------------------------------------------------------------------

/** What a bomb did to the hero: where it landed against its ring, its fuse, his hurts, where he was thrown, and its
 *  skull lying where it landed. */
/** a bomb followed: its record, his hurts, where he stood as it burst and a second on, how long it stunned him (s),
 *  and its skull lying */
interface Blast { thrown: SkullThrown; hurts: number[]; from: THREE.Vector3; to: THREE.Vector3; stunFor: number; lay: Lying }

/** how near a skull's mesh must lie to where it landed (m) */
const LYING_NEAR = 0.3;

/** A thrown skull followed frame by frame from its landing to its effect's end: the frames its mesh lay on the floor
 *  at its spot, out of the frames there were. */
class Lying {
  frames = 0;
  laid = 0;
  /** `unlay`: the canary's, the skull taken off the floor as it lands, as a game that never laid it */
  constructor(private readonly thrown: SkullThrown, private readonly unlay: boolean) {}

  /** A frame's look at it (the lab's frame input: none). */
  step = (): Record<string, never> => {
    const { thrown } = this;
    if (!thrown.landed || thrown.gone !== undefined) return {};
    if (this.unlay) G.scene.remove(thrown.skull);
    this.frames++;
    const skull = thrown.skull;
    const near = Math.hypot(skull.position.x - thrown.landed.x, skull.position.z - thrown.landed.z) < LYING_NEAR;
    if (skull.parent === G.scene && skull.userData.lying && near) this.laid++;
    return {};
  };

  /** The skull judged: lying where it landed every frame its effect lasted. */
  judge(part: string, label: string, lines: string[], problems: string[]): void {
    lines.push(`${part}: ${label}: its skull lay where it landed ${this.laid} of ${this.frames} frames`);
    if (!this.frames || this.laid < this.frames) problems.push(`${part}: ${label}: its skull lying ${this.laid} of ${this.frames} frames`);
  }
}

/** A bomb thrown `beside` m off the hero, his `move` applied as it lies (none: he stands), followed past its blast. */
async function bombBeside(lab: Lab, slab: Enemy, beside: THREE.Vector3, move?: THREE.Vector3, unlay = false): Promise<Blast> {
  const at = G.player.pos.clone().add(beside);
  let thrown: SkullThrown | undefined;
  let lay: Lying | undefined;
  let stunFor = 0;
  const from = G.player.pos.clone();
  const hurts = await hurtsWhile(async () => {
    thrown = throwAt(slab, 'bomb', at.x, at.z, slab.damage * TWINS.bomb.hurt);
    lay = new Lying(thrown, unlay);
    await lab.until(() => !!thrown!.landed, 3 * FPS, 'the bomb never landed');
    if (move) G.player.pos.add(move);
    from.copy(G.player.pos);
    await lab.until(() => !!thrown!.blast, 4 * FPS, 'the bomb never burst', lay.step);
    from.copy(G.player.pos);
    stunFor = G.player.stunned ? G.player.stunnedUntil - thrown!.blast!.t : 0;
    // (past the stun, and its stars gone)
    await lab.step(Math.ceil((TWINS.bomb.stun + 0.3) * FPS));
  });
  return { thrown: thrown!, hurts, from, to: G.player.pos.clone(), stunFor, lay: lay! };
}

/** The bomb's landing against its ring, and its fuse. */
function judgeLanding(blast: Blast, lines: string[], problems: string[]): void {
  const { thrown } = blast;
  const ring = thrown.ring.position;
  const off = Math.hypot(thrown.landed!.x - ring.x, thrown.landed!.z - ring.z);
  const fuse = thrown.blast!.t - thrown.landed!.t;
  lines.push(`bomb: landed ${fixed(off, 3)} m from its ring, burst ${fixed(fuse)} s after (its fuse ${SHIPPED.fuse} s)`);
  if (off > 0.05) problems.push(`bomb: it landed ${fixed(off, 2)} m off its ring`);
  if (Math.abs(fuse - SHIPPED.fuse) > FUSE_SLACK) problems.push(`bomb: it burst ${fixed(fuse)} s after landing, not ${SHIPPED.fuse}`);
}

/** The blast's hold on the hero standing still: hurt once, stunned its stun's seconds where he stands. */
function judgeStun(label: string, blast: Blast, lines: string[], problems: string[]): void {
  const { from, to, thrown } = blast;
  const moved = Math.hypot(to.x - from.x, to.z - from.z);
  const struck = thrown.struck.at(-1);
  const held = blast.stunFor;
  lines.push(`bomb: ${label}: hurt ${blast.hurts.length} time(s), stunned ${fixed(held)} s (its stun ${SHIPPED.stun} s), `
    + `moved ${fixed(moved)} m`);
  if (blast.hurts.length !== 1) problems.push(`bomb: ${label}: hurt ${blast.hurts.length} times by one blast`);
  if (!struck?.stunned || Math.abs(held - SHIPPED.stun) > STUN_SLACK) {
    problems.push(`bomb: ${label}: stunned ${fixed(held)} s, not ${SHIPPED.stun}`);
  }
  if (moved > 0.05) problems.push(`bomb: ${label}: the blast moved him ${fixed(moved)} m`);
}

/** how long after a first bomb lands a second is thrown at the hero (s): bursting after the first's stun, within its
 *  rest */
const SECOND_AFTER = 1.6;

/** Two bombs beside the hero, the second bursting after the first's stun and within its rest. */
async function bombsInRest(lab: Lab, slab: Enemy): Promise<{ first: SkullThrown; second: SkullThrown }> {
  const at = G.player.pos.clone().add(new THREE.Vector3(-1, 0, 0));
  const first = throwAt(slab, 'bomb', at.x, at.z, slab.damage * TWINS.bomb.hurt);
  await lab.until(() => !!first.landed, 3 * FPS, 'the first bomb never landed');
  await lab.step(Math.round(SECOND_AFTER * FPS));
  const second = throwAt(slab, 'bomb', at.x, at.z, slab.damage * TWINS.bomb.hurt);
  await lab.until(() => !!second.blast, 6 * FPS, 'the second bomb never burst');
  await lab.until(() => !G.player.stunned, 3 * FPS, 'the stun never ended');
  return { first, second };
}

/** how long before a bomb's blast the cloud thrown on the hero lands (s): its ticks run on through the stun */
const CLOUD_BEFORE = 0.4;

/** A cloud dropped on the hero as a bomb beside him bursts: the cloud's ticks while the bomb holds him, which must be
 *  none (its stun is no free hit for the pair). */
async function cloudThroughStun(lab: Lab, slab: Enemy, reliquary: Enemy): Promise<{ during: number; after: number }> {
  const hero = G.player.pos;
  const bombAt = hero.clone().add(new THREE.Vector3(-1, 0, 0));
  const bomb = throwAt(slab, 'bomb', bombAt.x, bombAt.z, slab.damage * TWINS.bomb.hurt);
  await lab.until(() => !!bomb.landed, 3 * FPS, 'the bomb never landed');
  // (the cloud landing on him just before the blast, so its ticks run on through the stun)
  const lands = bomb.landed!.t + TWINS.bomb.fuse - CLOUD_BEFORE - skullFlight(THROWN_FROM);
  await lab.until(() => G.time >= lands, 3 * FPS, 'the fuse never burned');
  const cloud = throwAt(reliquary, 'poison', hero.x, hero.z, reliquary.damage * TWINS.poison.hurt);
  await lab.until(() => !!bomb.blast, 3 * FPS, 'the bomb never burst');
  const stunEnds = G.player.stunnedUntil;
  await lab.until(() => cloud.gone !== undefined, (TWINS.poison.life + 2) * FPS, 'the cloud never went');
  if (!cloud.landed || cloud.landed.t > bomb.blast!.t) throw new Error('lab: the cloud landed after the blast');
  const during = cloud.struck.filter((hit) => hit.t > bomb.blast!.t && hit.t < stunEnds && hit.taken > 0).length;
  const after = cloud.struck.filter((hit) => hit.t >= stunEnds && hit.taken > 0).length;
  return { during, after };
}

/** A raised shield turned to a bomb's blast (a hero with a shield): whether it took the stun with the hurt. */
async function shieldedBlast(lab: Lab, options: TwinsOptions): Promise<{ stunned: boolean; shielded: boolean } | null> {
  if (G.player.cls.id !== 'warrior') return null;
  await standIn(lab, options.fixture, 'crypt');
  await lab.setup({ ...options.fixture, gear: 'shield', at: [G.player.pos.x, G.player.pos.z], facing: G.player.facing });
  const { slab } = await pairAt(lab, 14, false);
  const ahead = new THREE.Vector3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing)).multiplyScalar(1.5);
  const at = G.player.pos.clone().add(ahead);
  const bomb = throwAt(slab, 'bomb', at.x, at.z, slab.damage * TWINS.bomb.hurt);
  await lab.until(() => !!bomb.blast, 4 * FPS, 'the bomb never burst', () => ({ m2: true }));
  await lab.step(2, () => ({ m2: true }));
  const struck = bomb.struck.at(-1);
  return { stunned: Boolean(struck?.stunned), shielded: Boolean(struck?.shielded) };
}

/** `bomb`: a bomb beside a hero standing still, a cloud on him through its stun, a second within its rest, a raised
 *  shield, and one he steps out of. */
export async function bomb(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  if (options.canary) {
    TWINS.bomb.stun = 0.1;
    TWINS.bomb.rest = 0;
    TWINS.bomb.fuse = 0.2;
    BOMB_HOLD.passes = false;
  }
  try {
    const { slab } = await pairAt(lab, 14, false);
    const side = new THREE.Vector3(1, 0, 0);
    const still = await bombBeside(lab, slab, side.clone().multiplyScalar(-1), undefined, options.canary);
    judgeLanding(still, lines, problems);
    still.lay.judge('bomb', 'through its fuse', lines, problems);
    judgeStun('standing still', still, lines, problems);
    // (the canary's stun and fuse planted for the first alone: the cases after time their throws by the shipped ones,
    // and plant their own faults, no rest and a held hero not passed by)
    TWINS.bomb.stun = SHIPPED.stun;
    TWINS.bomb.fuse = SHIPPED.fuse;
    // a second bomb bursting after a first's stun, within its rest: hurt, not stunned again
    const pairs = await bombsInRest(lab, slab);
    const restLeft = SHIPPED.stun + SHIPPED.rest - (pairs.second.blast!.t - pairs.first.blast!.t);
    const twice = Boolean(pairs.second.struck.at(-1)?.stunned);
    lines.push(`bomb: a second bursting ${fixed(restLeft)} s before the first stun's rest was out: hurt `
      + `${pairs.second.struck.length} time(s), stunned again: ${twice}`);
    if (twice) problems.push('bomb: a second bomb stunned him again within the first\'s rest');
    if (restLeft <= 0 || !pairs.second.struck.length) problems.push('bomb: the second bomb missed the rest, so it judged nothing');
    // a cloud on him through a stun
    await standIn(lab, options.fixture, 'crypt');
    const pair = await pairAt(lab, 14, false);
    const ticks = await cloudThroughStun(lab, pair.slab, pair.reliquary);
    lines.push(`bomb: a cloud on him through a stun: ${ticks.during} tick(s) while stunned, ${ticks.after} after`);
    if (ticks.during) problems.push(`bomb: a cloud hurt him ${ticks.during} time(s) while a bomb held him stunned`);
    if (!ticks.after) problems.push('bomb: the cloud never hurt him after the stun, so it judged nothing');
    // a raised shield turned to the blast
    const shield = await shieldedBlast(lab, options);
    if (!shield) lines.push('bomb: a raised shield: this hero has none (`--class warrior`)');
    else {
      lines.push(`bomb: a raised shield turned to it: took it ${shield.shielded}, stunned ${shield.stunned}`);
      if (!shield.shielded || shield.stunned) problems.push('bomb: a raised shield turned to the blast let the stun through');
    }
    // stepped out of its glow as it lies
    await standIn(lab, options.fixture, 'crypt');
    const { slab: again } = await pairAt(lab, 14, false);
    const stepOut = new THREE.Vector3(TWINS.bomb.radius + 2, 0, 0);
    const dodged = await bombBeside(lab, again, side.clone().multiplyScalar(-0.5), stepOut);
    lines.push(`bomb: stepped ${fixed(stepOut.x, 1)} m out of its glow as it lay: hurt ${dodged.hurts.length} time(s), `
      + `stunned: ${G.player.stunned}`);
    if (dodged.hurts.length || dodged.thrown.struck.length) problems.push('bomb: it hurt a hero who stepped out of it before it burst');
  } finally {
    TWINS.bomb.stun = SHIPPED.stun;
    TWINS.bomb.rest = SHIPPED.rest;
    TWINS.bomb.fuse = SHIPPED.fuse;
    BOMB_HOLD.passes = true;
  }
}

// --- the poison -------------------------------------------------------------------------------------------

/** A cloud thrown `off` m from the hero, followed to its end: his hurts, and when it was gone. */
async function cloudOff(lab: Lab, reliquary: Enemy, off: number, unlay = false):
  Promise<{ thrown: SkullThrown; hurts: number[]; lay: Lying }> {
  const at = G.player.pos.clone().add(new THREE.Vector3(off, 0, 0));
  let thrown: SkullThrown | undefined;
  let lay: Lying | undefined;
  const hurts = await hurtsWhile(async () => {
    thrown = throwAt(reliquary, 'poison', at.x, at.z, reliquary.damage * TWINS.poison.hurt);
    lay = new Lying(thrown, unlay);
    await lab.until(() => !!thrown!.landed, 3 * FPS, 'the poison never landed');
    const watch = (): Record<string, never> => {
      lay!.step();
      return keepWhole();
    };
    await lab.until(() => thrown!.gone !== undefined, (TWINS.poison.life + 1) * FPS, 'the cloud never went', watch);
  });
  return { thrown: thrown!, hurts, lay: lay! };
}

/** `poison`: a cloud with the hero just outside its edge, and one on him. */
export async function poison(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  if (options.canary) TWINS.poison.radius = 6;
  try {
    const { reliquary } = await pairAt(lab, 14, false);
    const edge = SHIPPED.radius + G.player.radius + 0.3;
    const outside = await cloudOff(lab, reliquary, edge);
    lines.push(`poison: a cloud ${fixed(edge, 2)} m off, its edge ${SHIPPED.radius} m: hurt ${outside.hurts.length} time(s)`);
    if (outside.hurts.length) problems.push('poison: a cloud hurt a hero outside its edge');
    const inside = await cloudOff(lab, reliquary, 0, options.canary);
    inside.lay.judge('poison', 'through its cloud', lines, problems);
    const ticks = Math.floor(TWINS.poison.life / TWINS.poison.every);
    const most = Math.max(0, ...inside.hurts) / G.player.stats.maxLife;
    const lasted = inside.thrown.gone! - inside.thrown.landed!.t;
    lines.push(`poison: a cloud on him: hurt ${inside.hurts.length} times (${ticks} ticks in its ${TWINS.poison.life} s), `
      + `the most ${fixed(most, 3)} of his life a tick, gone ${fixed(lasted)} s after landing`);
    if (Math.abs(inside.hurts.length - ticks) > 1) problems.push(`poison: ${inside.hurts.length} ticks, not ${ticks}`);
    if (most > TICK_MOST) problems.push(`poison: a tick took ${fixed(most, 3)} of his life, a burst not a tick`);
    if (Math.abs(lasted - TWINS.poison.life) > FUSE_SLACK) problems.push(`poison: the cloud lasted ${fixed(lasted)} s`);
  } finally {
    TWINS.poison.radius = SHIPPED.radius;
  }
}

// --- the survivor's belt ----------------------------------------------------------------------------------

/** `inherit`: a bomb thrown, then Slab collapsing at half: Reliquary holds his bombs left and its poison, shown. */
export async function inherit(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const { slab, reliquary } = await pairAt(lab, 14, false);
  const far = G.player.pos.clone().add(new THREE.Vector3(30, 0, 0));
  throwAt(slab, 'bomb', far.x, far.z, 0);
  await lab.step(5);
  const left = heldBy(slab, 'bomb');
  // (the canary: Reliquary's model never told its belt again, so it shows its own rope alone)
  if (options.canary) reliquary.model.root.userData.belt = () => undefined;
  for (const twin of [slab, reliquary, slab, reliquary, slab]) {
    twin.takeDamage(twin.maxLife * 0.105, {});
    await lab.step(1);
  }
  await lab.step(35);
  const bombs = heldBy(reliquary, 'bomb');
  const poisons = heldBy(reliquary, 'poison');
  const shown = `${shownOn(reliquary, 'bomb')} bombs and ${shownOn(reliquary, 'poison')} poison`;
  lines.push(`inherit: Slab had ${left} bombs left as he fell; Reliquary holds ${bombs} bombs and ${poisons} poison, `
    + `its ropes show ${shown}`);
  if (slab.alive) problems.push('inherit: Slab never collapsed');
  if (bombs !== left || poisons !== SHIPPED.skulls) problems.push(`inherit: Reliquary holds ${bombs} bombs and ${poisons} poison`);
  if (shownOn(reliquary, 'bomb') !== bombs || shownOn(reliquary, 'poison') !== poisons) {
    problems.push(`inherit: Reliquary's ropes show ${shown}, not its belt`);
  }
}

// --- what it costs ----------------------------------------------------------------------------------------

/** The browser's time for `frames` frames drawn (ms a frame). */
async function frameTime(lab: Lab, frames: number): Promise<number> {
  const start = window.__labClock.realNow();
  await lab.step(frames, keepWhole);
  return (window.__labClock.realNow() - start) / frames;
}

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** `cost`: the frame with a bomb lying and a cloud out against none, in turns within one page. */
export async function cost(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const { slab, reliquary } = await pairAt(lab, 12, false);
  const drawing = lab.drawing;
  lab.drawing = true;
  const out: number[] = [];
  const none: number[] = [];
  try {
    await lab.step(20, keepWhole);
    for (let turn = 0; turn < COST_TURNS; turn++) {
      none.push(await frameTime(lab, COST_FRAMES));
      const hero = G.player.pos;
      const lying = throwAt(slab, 'bomb', hero.x + 4, hero.z, 0);
      throwAt(reliquary, 'poison', hero.x - 4, hero.z, 0);
      // (timed while the bomb lies on its fuse and the cloud is out)
      await lab.until(() => !!lying.landed, 3 * FPS, 'the bomb never landed', keepWhole);
      out.push(await frameTime(lab, COST_FRAMES));
      await lab.step((TWINS.poison.life + 1) * FPS, keepWhole);
    }
  } finally {
    lab.drawing = drawing;
  }
  lines.push(`cost: the frame by the browser's clock, its median over ${COST_TURNS} turns of ${COST_FRAMES}: `
    + `${fixed(median(none))} ms with no skull out, ${fixed(median(out))} ms with a bomb lying and a cloud out`);
  if (median(out) > median(none) * 1.5 + 1) problems.push('cost: the skulls out took the frame half again as long');
  await gpuCost(lab, slab, reliquary, lines, problems);
}

/** the most the skulls lying and their glows may take of the GPU's frame (ms), told from nothing */
const GPU_MOST = 0.5;

/** What a bomb lying and a cloud out take of the GPU's frame, by the engine's clock (`gpuTurns.ts`): their skulls and
 *  their glows on the floor shown and hidden in turns, the game held between (the particles and the pooled light
 *  are shared with every effect, and left on). */
async function gpuCost(lab: Lab, slab: Enemy, reliquary: Enemy, lines: string[], problems: string[]): Promise<void> {
  const before = new Set(G.scene.children);
  const hero = G.player.pos;
  const lying = throwAt(slab, 'bomb', hero.x + 4, hero.z, 0);
  const cloud = throwAt(reliquary, 'poison', hero.x - 4, hero.z, 0);
  await lab.until(() => !!lying.landed && !!cloud.landed, 3 * FPS, 'the skulls never landed', keepWhole);
  const theirs = G.scene.children.filter((child) => !before.has(child));
  const show = (on: boolean): void => {
    for (const part of theirs) part.visible = on;
  };
  const cost = await costInTurns(show);
  await lab.step((TWINS.poison.life + 1) * FPS, keepWhole);
  if (!cost) {
    lines.push('cost: the GPU\'s time not read (the engine gives no timestamps here)');
    return;
  }
  lines.push(`cost: the GPU's frame by the engine's clock, ${cost.renders} frames a side: ${fixed(cost.off)} ms with `
    + `no skull out, ${fixed(cost.on)} with ${theirs.length} of their meshes (2 skulls, their glows): `
    + `${fixed(cost.takes)} ± ${fixed(cost.error)} ms`);
  if (sure(cost) && cost.takes > GPU_MOST) problems.push(`cost: the skulls out took ${fixed(cost.takes)} ms of the GPU`);
}

// --- pictures ---------------------------------------------------------------------------------------------

/** how far before the hero a lone skull is stood for its close-ups (m), how high (m), and the picture's distance (m) */
const LONE = { ahead: 3, high: 1.2, from: 2.2 };
/** the light held over it for them: its colour, strength and reach, and how high over it (m) */
const LONE_LIGHT = { color: 0xfff1dc, intensity: 9, distance: 6, above: 1.4 };

/** A bomb skull alone before the hero, lit, from its front, its side and its front quarter. */
async function skullShots(lab: Lab, lines: string[]): Promise<Pictured[]> {
  // (on clear floor: from the run's spot a pillar stood between the camera and the skull)
  const stand = clearStand();
  G.player.pos.set(stand.x, G.player.pos.y, stand.z);
  G.player.facing = stand.facing;
  await lab.step(2, keepWhole);
  const facing = G.player.facing;
  const ahead = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const at = G.player.pos.clone().addScaledVector(ahead, LONE.ahead).setY(G.player.pos.y + LONE.high);
  const skull = beltSkullMesh('bomb');
  skull.position.copy(at);
  // (facing the hero, so the view behind him sees its face)
  skull.rotation.y = facing + Math.PI;
  G.scene.add(skull);
  const light = { x: at.x - ahead.x * 0.8, y: at.y + LONE_LIGHT.above, z: at.z - ahead.z * 0.8 };
  flash({ color: LONE_LIGHT.color, intensity: LONE_LIGHT.intensity, distance: LONE_LIGHT.distance, life: 0.2, hold: 30, pos: light });
  lines.push(`belt skull: ${beltSkullTriangles()} triangles (its skull, jaw, two eyes and ring)`);
  const moments: Pictured[] = [];
  try {
    await lab.step(4, keepWhole);
    const close = { at, distance: LONE.from };
    moments.push(lab.picture('0 a belt skull', ['back', 'left'], ['its face and its side'], close));
    skull.rotation.y = facing + Math.PI - 0.65;
    await lab.step(1, keepWhole);
    moments.push(lab.picture('0 a belt skull, its front quarter', ['back'], ['from its front quarter'], close));
  } finally {
    G.scene.remove(skull);
  }
  return moments;
}

/** `beltPictures`: the belts, a throw from the side, the bomb's blast, the cloud, the survivor's two ropes. */
export async function beltPictures(lab: Lab, options: TwinsOptions, lines: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const moments: Pictured[] = await skullShots(lab, lines);
  // (back to the run's spot, which the shots after are framed from)
  await standIn(lab, options.fixture, 'crypt');
  const { slab, reliquary } = await pairAt(lab, 11, false);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(30, keepWhole);
    // (the chain between them hidden for these: it crossed the camera's way to the waist)
    const lay = slab.model.root.userData.layChain as (to: THREE.Vector3 | null, taut: number) => void;
    slab.model.root.userData.layChain = (_to: THREE.Vector3 | null, taut: number) => lay(null, taut);
    await lab.step(2, keepWhole);
    // (from the front quarter on its belt's side: Slab's left, Reliquary's right; the view behind the hero, turned off
    // the twin's front)
    for (const [who, name, turn] of [[slab, 'Slab', -QUARTER], [reliquary, 'Reliquary', QUARTER]] as const) {
      const hip = new THREE.Vector3(who.pos.x, who.height * BELT_HIP, who.pos.z);
      G.player.facing = Math.atan2(who.pos.x - G.player.pos.x, who.pos.z - G.player.pos.z) + turn;
      moments.push(lab.picture(`1 ${name}'s belt`, ['back'], [`${name}: four skulls on a rope at the waist`],
        { at: hip, distance: BELT_FROM }));
    }
    slab.model.root.userData.layChain = lay;
    moments.push(...await throwStrip(lab, slab, reliquary));
    moments.push(await survivorShot(lab, slab, reliquary));
    moments.push(...await floorShots(lab, options));
  } finally {
    lab.drawing = drawing;
  }
  lines.push(`beltPictures: ${moments.length} moments`);
  return moments;
}

/** the belts' close-ups: framed on the waist (a share of the twin's height), from far enough to hold it whole and its
 *  four skulls, turned a front quarter off the twin's face (rad) */
const BELT_HIP = 0.4;
const BELT_FROM = 8.5;
const QUARTER = 0.75;

/** how far behind Slab, on his line to the hero, his brother stands for the throw's strip (m): beside him, it stood
 *  between the side camera and him, and every picture was its back; within the chain's reach, so the chain holds */
const BROTHER_BEHIND = 5;

/** A throw from the side: Slab made to throw at the hero, pictured at its unhook, wind-up, release, flight and landing. */
async function throwStrip(lab: Lab, slab: Enemy, reliquary: Enemy): Promise<Pictured[]> {
  const behind = new THREE.Vector3(slab.pos.x - G.player.pos.x, 0, slab.pos.z - G.player.pos.z).normalize();
  reliquary.pos.copy(slab.pos).addScaledVector(behind, BROTHER_BEHIND);
  reliquary.dazed = 1e4;
  const moments: Pictured[] = [];
  const share = (): number => (slab.action ? slab.action.t / slab.action.dur : -1);
  // (each view turned as the hero faces: turned on Slab first, `left` sees his throwing arm from the side of his throw's line)
  const side = (label: string, note: string): void => {
    G.player.facing = Math.atan2(slab.pos.x - G.player.pos.x, slab.pos.z - G.player.pos.z);
    moments.push(lab.picture(label, ['left'], [note], { at: slab.pos.clone().setY(2.8), distance: 12 }));
  };
  slab.dazed = 0;
  slab.cd = 0;
  slab.brain.beltT = 0;
  slab.brain.beltOut = 0;
  (slab as { speed: number }).speed = STILL;
  G.player.facing = Math.atan2(slab.pos.x - G.player.pos.x, slab.pos.z - G.player.pos.z);
  const before = SKULLS_THROWN.length;
  await lab.until(() => slab.action?.name === 'bomb', 8 * FPS, 'Slab never threw a bomb', keepWhole);
  // (its release is its warning's share of the action: 1.1 s of 1.8)
  const release = telegraphShare(slab, 'bomb')!;
  for (const [at, label, note] of [
    [release * 0.2, '2a unhook', 'his left hand down to the rope, a skull unhooked'],
    [release * 0.7, '2b wind-up', 'drawn back over his shoulder'],
    [release + 0.03, '2c release', 'thrown'],
  ] as const) {
    await lab.until(() => share() >= at || !slab.action, 4 * FPS, 'the throw never got there', keepWhole);
    side(label, note);
  }
  await lab.until(() => SKULLS_THROWN.length > before, 2 * FPS, 'Slab let go of no skull', keepWhole);
  slab.dazed = 1e4;
  const thrown = lastThrown();
  await lab.step(Math.round(thrown.flight * FPS * 0.45), keepWhole);
  side('2d flight', 'on its arc, its ring on the floor where it lands');
  await lab.until(() => !!thrown.landed, 3 * FPS, 'the bomb never landed', keepWhole);
  await lab.step(3, keepWhole);
  side('2e landing', 'landed in its ring, its fuse burning');
  return moments;
}

/** the player's views a skull on the floor is pictured in, and how far ahead of the hero it's thrown (m): within the
 *  bomb's reach, so the hero is thrown, and in view through his eyes */
const SHOT_VIEWS: ViewMode[] = ['top', 'third', 'first'];
const SHOT_AHEAD = 2.4;
/** and how far to his side (m): straight ahead, over the shoulder his own body hid it; within the bomb's reach still */
const SHOT_SIDE = 1.4;
/** frames the camera is given to glide into a view */
const GLIDE_FRAMES = 45;

/** The camera put into `view` behind the hero, the hero facing `at` (the set-up's own view: the lab holds its view to
 *  the set-up's, and a view set by the renderer alone came out top-down). */
async function intoView(lab: Lab, options: TwinsOptions, view: ViewMode, at: THREE.Vector3): Promise<void> {
  const facing = Math.atan2(at.x - G.player.pos.x, at.z - G.player.pos.z);
  await lab.setup({ ...options.fixture, at: [G.player.pos.x, G.player.pos.z], facing, view });
  G.player.facing = facing;
  faceCamera(facing);
  await lab.step(GLIDE_FRAMES, keepWhole);
}

/** how far before the hero the floor is to be clear for the floor's pictures (m), the props kept that far off its
 *  line (m), and the rings round the arena's middle and the steps round each a spot is looked for on (m, rad): from
 *  the run's own spot the hero faced a shrine within a metre, which filled the view through his eyes */
const VIEW_CLEAR = 7;
const VIEW_SIDE = 0.8;
const VIEW_RINGS = [10, 14, 6, 18];
const VIEW_STEP = 0.2;

/** A spot with the floor clear of props `VIEW_CLEAR` m before it, facing round the arena (the twins rise toward its
 *  middle, off to his side), or across it to the middle. */
function clearStand(): { x: number; z: number; facing: number } {
  for (const ring of VIEW_RINGS) {
    for (let angle = 0; angle < Math.PI * 2; angle += VIEW_STEP) {
      const x = Math.sin(angle) * ring, z = Math.cos(angle) * ring;
      for (const facing of [angle + Math.PI / 2, angle - Math.PI / 2, angle + Math.PI]) {
        const farX = x + Math.sin(facing) * VIEW_CLEAR, farZ = z + Math.cos(facing) * VIEW_CLEAR;
        const clear = lineClear(x, z, farX, farZ, VIEW_SIDE) && !inObstacle(new THREE.Vector3(x, 0, z), 1);
        if (clear && Math.hypot(farX, farZ) < ARENA.radius - 1) return { x, z, facing };
      }
    }
  }
  throw new Error('lab: no spot in the arena with the floor clear before it');
}

/** A spot `SHOT_AHEAD` m before the hero, the way he faces, and `SHOT_SIDE` to his side. */
function aheadOfHero(): THREE.Vector3 {
  const facing = G.player.facing;
  const ahead = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).multiplyScalar(SHOT_AHEAD);
  const side = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing)).multiplyScalar(SHOT_SIDE);
  return G.player.pos.clone().add(ahead).add(side);
}

/** The bomb lying, bursting and the hero thrown, and the poison skull in its cloud, as the player's screen shows them
 *  in each view: the skull itself on the floor in the middle of its glow. */
async function floorShots(lab: Lab, options: TwinsOptions): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  const restore = saveCamera();
  try {
    for (const view of SHOT_VIEWS) {
      await standIn(lab, options.fixture, 'crypt');
      const stand = clearStand();
      G.player.pos.set(stand.x, G.player.pos.y, stand.z);
      G.player.facing = stand.facing;
      await intoView(lab, options, view, aheadOfHero());
      const home = G.player.pos.clone();
      const { slab, reliquary } = await pairAt(lab, 14, false);
      const spot = aheadOfHero();
      const bomb = throwAt(slab, 'bomb', spot.x, spot.z, 0);
      await lab.until(() => !!bomb.landed, 3 * FPS, 'the bomb never landed', keepWhole);
      await lab.step(Math.round(TWINS.bomb.fuse * 0.7 * FPS), keepWhole);
      moments.push(await lab.screen(`3a fuse (${view})`, ['the bomb skull lying hot, its glow drawing in on it']));
      await lab.until(() => !!bomb.blast, 3 * FPS, 'the bomb never burst', keepWhole);
      await lab.step(3, keepWhole);
      moments.push(await lab.screen(`3b blast (${view})`, ['its blast: a soft swell, a few large shards']));
      await lab.step(20, keepWhole);
      moments.push(await lab.screen(`3c stunned (${view})`, [`the hero stunned ${TWINS.bomb.stun} s where he stood, stars over his head`]));
      await lab.until(() => !G.player.stunned, 3 * FPS, 'the stun never ended', keepWhole);
      G.player.pos.copy(home);
      await lab.step(2, keepWhole);
      const cloudAt = aheadOfHero();
      const poison = throwAt(reliquary, 'poison', cloudAt.x, cloudAt.z, 0);
      await lab.until(() => !!poison.landed, 3 * FPS, 'the poison never landed', keepWhole);
      await lab.step(FPS, keepWhole);
      moments.push(await lab.screen(`4 poison cloud (${view})`, ['the poison skull in its cloud, its gas out of its eyes and jaw']));
      await lab.until(() => poison.gone !== undefined, (TWINS.poison.life + 1) * FPS, 'the cloud never went', keepWhole);
    }
  } finally {
    setView('top');
    restore();
  }
  return moments;
}

/** The survivor at half with both ropes. */
async function survivorShot(lab: Lab, slab: Enemy, reliquary: Enemy): Promise<Pictured> {
  for (const twin of [slab, reliquary, slab, reliquary, slab]) {
    twin.takeDamage(twin.maxLife * 0.105, {});
    await lab.step(1, keepWhole);
  }
  await lab.step(60, keepWhole);
  const hip = new THREE.Vector3(reliquary.pos.x, reliquary.height * 0.36, reliquary.pos.z);
  G.player.facing = Math.atan2(reliquary.pos.x - G.player.pos.x, reliquary.pos.z - G.player.pos.z);
  return lab.picture('5 the survivor\'s belts', ['back', 'right'], ['Reliquary alone, its own poison and its brother\'s bombs'],
    { at: hip, distance: 5 });
}
