// The Stag of Ash's fire breath and the wood it sets alight (tools/lab `boss --parts stagBreath`; entities/stag.ts
// `breathAt`, `woodFireAt`; from Kenneth's notes: "an inhale wind-up, then a cone swept across, leaving burning ground
// for a few seconds", "trees, logs and wooden props the breath touches burn for a while and hurt heroes close by").
//
// Each case lets it breathe at the hero 7 m past its body and reads what his own game judged (`BREATHS`: whether its
// cone passed over him, burnt him, or his shield took it) and what it left (`FIRES`, the ground burning along it):
// - standing in the open before it: burnt once, the ground left burning along its sweep;
// - walking round it, away from the line that marks where it begins, from the moment that line shows: never burnt;
// - behind a rock from it: its cone passes over him, and the rock takes it;
// - with a shield (`--class warrior --gear shield`), raising it towards it: the shield takes it.
// Then the wood: it breathes over a stump or a log, which burns (`BURNING`, a pooled light while it does), a hero
// stood beside it once the ground's fire is out burnt every `forestFire.tick` s, and gone after its `life`; four
// pieces set alight at once burn three at most, the oldest put out.
//
// `--canary` narrows its cone to nothing: it burns no one in the open and sets no wood alight, and the part says so.
import * as THREE from 'three';
import type { Frame, Lab } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { Obstacle } from '../../../src/types';
import { G } from '../../../src/state';
import { STAG } from '../../../src/data/foes/stag';
import { ENEMIES } from '../../../src/data/enemies';
import { FX, fx } from '../../../src/entities/enemyAI';
import { BREATHS, BURNING, FIRES, type Breathed, type Burning } from '../../../src/entities/stag';
import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';
import { pastWall } from '../../../src/world/edge';
import { pressing } from './cast';
import { fixed, standIn, type BossOptions } from './boss';
import { blockKey, noting, onLane, openLane, propLane, type Hurt, type Lane } from './bossStag';

/** frames a second on the lab's clock */
const FPS = 60;
/** how far past its body the hero stands (m): within its breath's band */
const PAST = 7;
/** the frames a case waits for its breath to begin, and the frames after it begins that it's followed */
const BEGIN_FRAMES = 4 * FPS;
const BREATH_FRAMES = Math.round((ENEMIES.stag.bossKit!.attacks!.breath.warn + STAG.breath.time + 0.4) * FPS);
/** how many pieces of wood the case sets alight at once (one more than may burn) */
const LIT_AT_ONCE = STAG.forestFire.most + 1;
/** how far off a piece of wood's circle the hero stands beside it (m), and how long he's held there (s) */
const BESIDE = 0.8;
const BESIDE_FOR = 2;

const _n = new THREE.Vector3();

/** How a case's hero meets its breath. */
type How = 'open' | 'walking round' | 'behind a rock' | 'his shield raised';

/** What a breath did: as his game judged it, the ground's fire lines it laid, and what he was hurt. */
interface BreathCase { how: How; judged: Breathed | null; laid: number; hurts: Hurt[]; did: string[] }

/** The stag on `lane`'s way, the hero `PAST` m past its body before it (where the lane is a rock's, he stays behind
 *  it, the stag brought within its band). */
async function placed(lab: Lab, options: BossOptions, lane: Lane, rock: boolean): Promise<Enemy> {
  const boss = await onLane(lab, options, lane);
  const hero = G.player;
  if (rock) {
    // (the stag brought nearer him along its way: the rock between them still)
    const at = hero.pos.clone().addScaledVector(lane.way, -(boss.radius + PAST));
    boss.pos.set(at.x, boss.pos.y, at.z);
  } else {
    const at = boss.pos.clone().addScaledVector(lane.way, boss.radius + PAST).setY(0);
    hero.place(at, Math.atan2(-lane.way.x, -lane.way.z));
  }
  return boss;
}

/** Each `breathAim` the game plays while `body` runs, its arguments. */
async function aims<T>(seen: number[][], body: () => Promise<T>): Promise<T> {
  const was = FX.breathAim;
  FX.breathAim = (...args) => {
    seen.push(args);
    was(...args);
  };
  try {
    return await body();
  } finally {
    FX.breathAim = was;
  }
}

/** The stag let breathe once at the hero, as `how` has him meet it. */
async function oneBreath(lab: Lab, options: BossOptions, how: How): Promise<BreathCase> {
  await standIn(lab, options.fixture, 'forest');
  const rock = how === 'behind a rock';
  const boss = await placed(lab, options, rock ? propLane() : openLane(), rock);
  const hero = G.player, key = how === 'his shield raised' ? blockKey() : null;
  const result: BreathCase = { how, judged: null, laid: 0, hurts: [], did: [] };
  const before = BREATHS[BREATHS.length - 1] ?? null, fires = FIRES.length;
  const seen: number[][] = [];
  let begun = -1, frame = 0;
  boss.dazed = 0;
  boss.cd = 0;
  boss.brain.breathT = 0;
  const aim = boss.pos.clone().setY(1.5);
  const input = (): Frame => {
    boss.brain.chargeT = 99;
    if (how === 'walking round' && seen.length) walkRound(seen[0]);
    else hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
    return key ? pressing(key, aim, true) : {};
  };
  const after = (f: number): void => {
    frame = f + 1;
    if (begun < 0 && boss.action?.name === 'breath') begun = frame;
    result.laid = Math.max(result.laid, FIRES.length - fires);
    const doing = boss.action?.name ?? 'nothing';
    if (result.did[result.did.length - 1] !== doing) result.did.push(doing);
    const last = BREATHS[BREATHS.length - 1] ?? null;
    if (last && last !== before) result.judged = last;
    // (its breath done, nothing more from it)
    if (begun >= 0 && !boss.action) boss.cd = 99;
  };
  const run = async (): Promise<void> => {
    await lab.step(BEGIN_FRAMES + BREATH_FRAMES, input, after);
  };
  await noting(result.hurts, () => frame, () => aims(seen, run));
  return result;
}

/** A frame of the hero walking round the stag at his own speed, away from where its breath begins (its aim's `from`)
 *  towards where it ends (`to`). */
function walkRound(aim: number[]): void {
  const hero = G.player, [, x, z, from, to] = aim;
  const d = Math.hypot(hero.pos.x - x, hero.pos.z - z);
  const step = Math.sign(to - from) * hero.stats.moveSpeed / FPS / d;
  const a = Math.atan2(hero.pos.x - x, hero.pos.z - z) + step;
  hero.place(new THREE.Vector3(x + Math.sin(a) * d, 0, z + Math.cos(a) * d), a + Math.PI);
}

/** what each case's breath must do: pass over him, and burn him */
const WANT: Record<How, { over: boolean; struck: boolean }> = {
  open: { over: true, struck: true },
  'walking round': { over: false, struck: false },
  'behind a rock': { over: true, struck: false },
  'his shield raised': { over: true, struck: false },
};

/** What a breath did to him, in words. */
function said(j: Breathed): string {
  const burn = j.struck ? 'burnt him' : j.blocked ? 'his shield took it' : 'no burn';
  return `${j.over ? 'passed over him' : 'never reached him'}, ${burn}`;
}

/** A case's line and its problems. */
function judge(c: BreathCase, lines: string[], problems: string[]): void {
  const j = c.judged, part = `stagBreath: ${c.how}`;
  const what = j ? said(j) : `no breath (it did: ${c.did.join(', ')})`;
  lines.push(`${part}: ${what}, ${c.laid} fire lines left burning, hurt ${c.hurts.length} time(s)`);
  if (!j) {
    problems.push(`${part}: it never breathed`);
    return;
  }
  const want = WANT[c.how];
  if (j.over !== want.over) problems.push(`${part}: its cone ${j.over ? 'passed over' : 'missed'} him`);
  if (j.struck !== want.struck) problems.push(`${part}: ${j.struck ? 'burnt' : 'never burnt'} him`);
  if (c.how === 'his shield raised' && !j.blocked) problems.push(`${part}: it never took the breath`);
  const lineCount = Math.floor(STAG.breath.sweep / STAG.breath.step);
  if (c.how === 'open' && c.laid < lineCount) problems.push(`${part}: it left ${c.laid} fire lines, not ${lineCount}`);
}

// --- the wood ------------------------------------------------------------------------------------------------

/** The wooden props standing (a piece's first circle each: a stump, a log's middle). */
function woods(): Obstacle[] {
  const seen = new Set<unknown>();
  return G.arena.obstacles.filter((o) => {
    if (o.prop?.kind !== 'wood' || o.prop.broken || seen.has(o.prop)) return false;
    seen.add(o.prop);
    return true;
  });
}

/** Whether (x, z) is at least `room` m inside the wall. */
const inside = (x: number, z: number, room: number): boolean => pastWall(G.arena.biome, x, z, _n).by <= -room;

/** A lane to a piece of wood: the stag `PAST` m short of it with a clear line, the hero well behind the stag. */
function woodLane(): { wood: Obstacle; lane: Lane } {
  for (const wood of woods()) {
    for (let b = 0; b < Math.PI * 2; b += Math.PI / 12) {
      const way = new THREE.Vector3(Math.sin(b), 0, Math.cos(b));
      const stag = new THREE.Vector3(wood.x, 0, wood.z).addScaledVector(way, -(wood.r + PAST));
      const hero = stag.clone().addScaledVector(way, -6);
      if (inObstacle(stag, 3) || inObstacle(hero, 1) || !inside(stag.x, stag.z, 3) || !inside(hero.x, hero.z, 1)) {
        continue;
      }
      const reach = wood.r + 0.3;
      if (!lineClear(stag.x, stag.z, wood.x - way.x * reach, wood.z - way.z * reach, 0.3)) continue;
      return { wood, lane: { hero, stag, way } };
    }
  }
  throw new Error('lab: no wood in the Thornwood with a clear line to it');
}

/** Its breath swept over the wood on `lane` (the hero behind it, out of its sweep), the stag held from anything else
 *  after: the burning wood, if it was set alight. */
async function breatheOver(lab: Lab, boss: Enemy, lane: Lane, wood: Obstacle): Promise<Burning | null> {
  const way = Math.atan2(lane.way.x, lane.way.z), at = boss.pos.clone();
  boss.dazed = 0;
  fx('breathAim', boss.id, at.x, at.z, way - 0.4, way + 0.4, 0.3);
  fx('breath', boss.id, at.x, at.z, way - 0.4, way + 0.4, boss.damage);
  await lab.step(Math.round((STAG.breath.time + 0.2) * FPS), () => ({}), () => holdStill(boss));
  return BURNING.find((b) => b.parts === wood.prop!.parts) ?? null;
}

/** The stag held from anything of its own (dazed, a breath under way would end). */
function holdStill(boss: Enemy): void {
  boss.cd = 99;
  boss.brain.breathT = 99;
  boss.brain.chargeT = 99;
}

/** The hero stood `BESIDE` m off the wood's circle across `lane`, held there `BESIDE_FOR` s: his hurts. */
async function besideWood(lab: Lab, lane: Lane, wood: Obstacle): Promise<Hurt[]> {
  const hero = G.player, across = new THREE.Vector3(lane.way.z, 0, -lane.way.x);
  const beside = new THREE.Vector3(wood.x, 0, wood.z).addScaledVector(across, wood.r + BESIDE + hero.radius);
  const hurts: Hurt[] = [];
  let frame = 0;
  hero.place(beside, hero.facing);
  await noting(hurts, () => frame, () => lab.step(BESIDE_FOR * FPS, () => {
    frame++;
    hero.place(beside, hero.facing);
    return {};
  }));
  return hurts;
}

/** More pieces set alight at once than may burn: three burning at most, the oldest put out. */
async function tooMany(lab: Lab, boss: Enemy, lines: string[], problems: string[]): Promise<void> {
  const most = STAG.forestFire.most, pieces = woods().slice(0, LIT_AT_ONCE);
  for (const piece of pieces) fx('woodFire', boss.id, piece.x, piece.z, 0);
  await lab.step(2);
  const first = pieces[0]?.prop?.parts;
  const firstBurns = BURNING.some((b) => b.parts === first);
  const lights = BURNING.filter((b) => b.light).length;
  lines.push(`stagBreath: wood: ${pieces.length} pieces set alight at once, ${BURNING.length} burning `
    + `(at most ${most}), ${lights} pooled lights, the first ${firstBurns ? 'still burning' : 'put out'}`);
  if (BURNING.length > most) problems.push(`stagBreath: ${BURNING.length} pieces of wood burn at once, over ${most}`);
  if (pieces.length > most && firstBurns) problems.push('stagBreath: the oldest burning wood was not put out first');
  for (const burning of [...BURNING]) burning.out();
}

/** It breathes over a piece of wood: the wood alight and its light, a hero stood beside it once the ground's fire is
 *  out burnt every tick, gone after its life; then more set alight at once than may burn. */
async function woodCase(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const w = STAG.forestFire;
  await standIn(lab, options.fixture, 'forest');
  const { wood, lane } = woodLane();
  const boss = await onLane(lab, options, lane);
  const alight = await breatheOver(lab, boss, lane, wood);
  const light = alight?.light ? 'a pooled light on it' : 'no light free';
  lines.push(`stagBreath: wood: ${alight ? `alight, ${light}` : 'never alight'}`);
  if (!alight) {
    problems.push('stagBreath: its breath set no wood alight');
    return;
  }
  // (the ground's fire out first: it lies along the sweep, the wood's burn alone read)
  await lab.step(Math.round((STAG.breath.burn + 0.5) * FPS), () => ({}), () => holdStill(boss));
  const hurts = await besideWood(lab, lane, wood);
  const ticks = Math.floor(BESIDE_FOR / w.tick);
  lines.push(`stagBreath: wood: the hero beside it ${BESIDE} m off for ${BESIDE_FOR} s burnt ${hurts.length} time(s) `
    + `(a burn every ${w.tick} s)`);
  if (Math.abs(hurts.length - ticks) > 1) {
    problems.push(`stagBreath: the hero beside burning wood burnt ${hurts.length} times in ${BESIDE_FOR} s, `
      + `not ${ticks}`);
  }
  await lab.step(Math.round(w.life * FPS));
  const still = BURNING.includes(alight);
  lines.push(`stagBreath: wood: ${still ? 'still burning' : 'out'} ${w.life} s on`);
  if (still) problems.push(`stagBreath: the wood still burns past its ${w.life} s`);
  await tooMany(lab, boss, lines, problems);
}

/** `stagBreath`: its breath at the hero in the open, walking round it, behind a rock and (with a shield) raising it;
 *  then the wood it sets alight. */
export async function stagBreath(lab: Lab, options: BossOptions, lines: string[],
  problems: string[]): Promise<void> {
  const cone = STAG.breath.cone;
  if (options.canary) STAG.breath.cone = -1;
  try {
    const hows: How[] = ['open', 'walking round', 'behind a rock'];
    if (G.player.gear.shield && blockKey()) hows.push('his shield raised');
    else lines.push('stagBreath: his shield raised: not run (--class warrior --gear shield)');
    for (const how of hows) judge(await oneBreath(lab, options, how), lines, problems);
    await woodCase(lab, options, lines, problems);
  } finally {
    STAG.breath.cone = cone;
  }
  const b = STAG.breath;
  lines.push(`stagBreath: its breath sweeps ${fixed(b.sweep, 1)} rad in ${b.time} s, ${b.cone} rad either side of its `
    + `line, out to ${b.reach} m`);
}
