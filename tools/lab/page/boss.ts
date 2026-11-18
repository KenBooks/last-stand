// The bosses' fights (tools/lab `boss`): the ladder of each battleground, the shared boss toolkit through the
// Bell-Warden (entities/bossKit.ts, entities/bellWarden.ts), and how long each boss takes the hero to bring down.
//
// - `ladder`: each battleground's boss waves set off as the game sets them off (the run's wave and its timer), the boss
//   the wave sends read off the run (`RunState.boss`) and the banner's line, against its ladder's rung for the wave.
// - `phases`: the Bell-Warden's life taken down to just over and under each phase's share: its phase as the game has
//   it, and the banner its phase brings.
// - `toll`: the Bell-Warden left to toll at the hero near it (stunned, for its time, its warning first), far off
//   (faded: not stunned), and with a warrior's shield raised towards it (not stunned: `--class warrior --gear shield`).
// - `chains`: each chain struck from its own side until it breaks: broken one by one, all four dropping the bell for
//   its weak-spot window (double damage taken, nothing tolled), then the chains whole again and the bell up.
// - `stand`: the hero walked into the Bell-Warden: it gives way a hair, and he's held off its body.
// - `grab`: a hero at the ghosts' ring seized, lifted, carried out and hurt as he lands, not again within his grace;
//   one well out of it never seized.
// - `compiles`: every effect the Bell-Warden's fight draws (a toll, a double toll, a shard, the bell dropped), drawn:
//   no program compiled meanwhile.
// - `encounter`: the Crypt's second rung as it comes, the Ossuary Cantor and its two Bell-Warden guards fighting the
//   hero: warded (a quarter of the damage) while a guard stands and not after; each of its casts ringed on the floor
//   before its hands burst; no two bosses' warned hits closer than its beat; its heart bared after a cast once the
//   guards are down; the guards a lesser bell's size, rising at their two spots (bossGuardSpots.ts) and standing
//   where they rose.
// - `ttk`: the hero's basic attack held on a boss held still, its damage a second, and from it the time each boss
//   takes at the wave it comes on (the Colossus at 5, the Bell-Warden alone and the Cantor's encounter at 10), with
//   and without its weak windows.
//
// - `pictures` (asked for alone, not run by default): the Bell-Warden in each of its moments, a sheet for the eye;
//   `encounterPictures` the Cantor's encounter in each of its.
//
// `--canary` plants a fault each part must catch: a ladder turned round, a phase's share moved, a toll that stuns no
// one near it, a shield that stops nothing, chains that take no harm, a boss that yields as a small foe does, ghosts
// that seize no one, a ward that wards nothing, guards that walk or rise at the gates, a program compiled in the fight, and an attack that deals nothing.
import * as THREE from 'three';
import type { Fixture, Lab, Pictured, Report, ViewName } from './lab';
import { cantorLook } from './bossCantor';
import { guardSpots } from './bossGuardSpots';
import { putAway } from '../../../src/perf/consent';
import type { Enemy } from '../../../src/entities/enemy';
import type { BiomeId } from '../../../src/data/biomes';
import type { EnemyId } from '../../../src/data/enemies';
import type { SkillKey } from '../../../src/types';
import { G } from '../../../src/state';
import { BIOMES, BIOME_IDS, bossOfWave } from '../../../src/data/biomes';
import { BELL_WARDEN, CANTOR, ENEMIES, SCALING } from '../../../src/data/enemies';
import { WAVES } from '../../../src/data/waves';
import { damageTaken } from '../../../src/entities/bossKit';
import { fx, setFxSink, type FxName } from '../../../src/entities/enemyAI';
import { startNextWave } from '../../../src/game/run';
import { pressing } from './cast';
import { ARENA } from '../../../src/data/balance';
import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';

/** The parts the command runs, in order. */
export type BossPart =
  'ladder' | 'phases' | 'toll' | 'chains' | 'stand' | 'grab' | 'encounter' | 'compiles' | 'ttk' | 'pictures' | 'encounterPictures' | 'cantorLook';
export const BOSS_PARTS: BossPart[] = ['ladder', 'phases', 'toll', 'chains', 'stand', 'grab', 'encounter', 'compiles', 'ttk'];
/** the parts that are pictures for the eye, with no verdicts */
const PICTURE_PARTS: BossPart[] = ['pictures', 'encounterPictures', 'cantorLook'];

export interface BossOptions {
  fixture: Fixture;
  /** the parts to run (all by default) */
  parts?: BossPart[];
  /** plant a fault each part must catch */
  canary: boolean;
}

/** where the hero stands (m), off the dais and clear of props, and the boss's distance for each case (m) */
const SPOT: [number, number] = [12, 12];
const NEAR = 7;
const FAR = 19;
/** how many boss waves of each ladder are set off: twice round the Crypt's */
const RUNGS = 4;
/** the most frames a boss takes to rise, a toll to come, and a wave to start */
const RISE_FRAMES = 200;
const TOLL_FRAMES = 420;
const WAVE_FRAMES = 30;
/** how far off its stun's time a stun may be (s): the frame it lands and the frame it ends */
const STUN_SLACK = 0.1;
/** how long the hero's attack is held on a boss for its damage a second (s) */
const TTK_HOLD = 8;
/** frames a second on the lab's clock */
const FPS = 60;

const secondsOf = (frames: number): number => frames / FPS;
const fixed = (value: number, digits = 2): string => value.toFixed(digits);

/** The way from the hero towards the arena's middle, on the floor: a boss placed along it stands inside the wall. */
function inward(): THREE.Vector3 {
  return new THREE.Vector3(-G.player.pos.x, 0, -G.player.pos.z).normalize();
}

/** how far either way round the hero a boss's spot is looked for (rad), in steps of `CLEAR_STEP` */
const CLEAR_MOST = Math.PI;
const CLEAR_STEP = 0.15;

/**
 * A spot `away` m from the hero, nearest the way to the arena's middle, where a boss of `radius` stands clear of the
 * props with nothing between it and him: an obelisk between them took the mage's bolts, his damage a second 11.
 */
function clearSpot(away: number, radius: number): THREE.Vector3 {
  const hero = G.player.pos;
  const inward0 = inward();
  for (let turn = 0; turn <= CLEAR_MOST; turn += CLEAR_STEP) {
    for (const sign of turn === 0 ? [1] : [1, -1]) {
      const way = inward0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * sign);
      const at = hero.clone().addScaledVector(way, away).setY(0);
      const inside = Math.hypot(at.x, at.z) < ARENA.radius - radius;
      if (inside && !inObstacle(at, radius) && lineClear(hero.x, hero.z, at.x, at.z, 0.5)) return at;
    }
  }
  throw new Error(`lab: no spot ${away} m from the hero clear for a boss`);
}

/** The hero set up in `biome`, at the spot, facing the arena's middle. */
async function standIn(lab: Lab, fixture: Fixture, biome: BiomeId): Promise<void> {
  if (G.arena.biome !== biome) G.arena.setBiome(biome);
  const facing = Math.atan2(-SPOT[0], -SPOT[1]);
  await lab.setup({ at: SPOT, facing, ...fixture });
}

/** Boss `kind` risen `away` m from the hero towards the arena's middle, facing him; dazed (thinking nothing) unless
 *  `thinks`. */
async function bossAt(lab: Lab, kind: EnemyId, away: number, thinks: boolean, wave = 1): Promise<Enemy> {
  const at = clearSpot(away, ENEMIES[kind].radius);
  const boss = lab.spawnFoe(kind, at, { wave });
  await lab.until(() => boss.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
  boss.facing = boss.targetFacing = Math.atan2(G.player.pos.x - boss.pos.x, G.player.pos.z - boss.pos.z);
  boss.dazed = thinks ? 0 : 1e4;
  return boss;
}

// --- the ladder -------------------------------------------------------------------------------------------

/** Each battleground's boss waves set off: the boss the run sends and the banner's line against the ladder's rung. */
async function ladder(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const crypt = BIOMES.crypt.bosses;
  if (options.canary) crypt.reverse();
  try {
    for (const biome of BIOME_IDS) {
      await standIn(lab, options.fixture, biome);
      lab.letWavesCome();
      const met: string[] = [];
      for (let rung = 0; rung < RUNGS; rung++) {
        const wave = WAVES.bossEvery * (rung + 1);
        const sent = await bossOfWaveSent(lab, wave);
        const ladderOf = BIOMES[biome].bosses;
        const wanted = ladderOf[rung % ladderOf.length];
        met.push(`wave ${wave} ${sent.boss ?? 'none'}`);
        // (judged against the ladder as the game ships it: the canary turned the Crypt's round)
        const shipped = options.canary && biome === 'crypt' ? [...ladderOf].reverse()[rung % ladderOf.length] : wanted;
        if (sent.boss !== shipped.id) problems.push(`${biome} wave ${wave}: the run sent ${sent.boss ?? 'no boss'}, its ladder's rung is ${shipped.id}`);
        const guards = Array.from({ length: shipped.guards?.count ?? 0 }, () => shipped.guards!.id);
        if (sent.guards.join() !== guards.join()) {
          problems.push(`${biome} wave ${wave}: the run sent guards [${sent.guards.join(', ')}], its rung's are [${guards.join(', ')}]`);
        }
        if (guards.length) met[met.length - 1] += ` with ${guards.length} ${guards[0]}`;
        if (!sent.banner.includes(shipped.banner)) problems.push(`${biome} wave ${wave}: the banner said "${sent.banner}", not its boss's line "${shipped.banner}"`);
        const label = bossOfWave(biome, wave)?.short;
        if (label !== wanted.short) problems.push(`${biome} wave ${wave}: the Continue button would name ${label}`);
      }
      lines.push(`ladder: ${biome}: ${met.join(', ')}`);
    }
  } finally {
    if (options.canary) crypt.reverse();
  }
}

/** Wave `wave` set off from its countdown as the game begins one (`startNextWave`: its banner put up), then let
 *  start: the boss its run holds for it, and the banner's line. */
async function bossOfWaveSent(lab: Lab, wave: number): Promise<{ boss: EnemyId | undefined; guards: EnemyId[]; banner: string }> {
  const run = G.run!;
  run.wave = wave;
  startNextWave();
  const banner = document.querySelector('#banner .b-sub')?.textContent ?? '';
  run.phase = 'countdown';
  run.timer = 0;
  await lab.until(() => run.phase === 'fighting', WAVE_FRAMES, `wave ${wave} never started`);
  const boss = run.boss?.[0]?.type;
  const guards = (run.boss ?? []).filter((unit) => unit.guard).map((unit) => unit.type);
  // (the wave stopped before it sends anyone, back to a countdown held for the next)
  run.queue.length = 0;
  run.boss = null;
  run.phase = 'countdown';
  run.timer = 1e4;
  return { boss, guards, banner };
}

// --- the phases -------------------------------------------------------------------------------------------

/** The Bell-Warden's life taken to just over and under each phase's share: its phase, and its banner. */
async function phases(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const kit = ENEMIES.bellwarden.bossKit!;
  const second = kit.phases[1].below;
  if (options.canary) kit.phases[1].below = second - 0.2;
  try {
    const boss = await bossAt(lab, 'bellwarden', NEAR, false);
    const seen: string[] = [];
    for (let n = 1; n < kit.phases.length; n++) {
      const share = n === 1 ? second : kit.phases[n].below;
      for (const [side, at] of [['over', share + 0.01], ['under', share - 0.01]] as const) {
        boss.takeDamage(boss.life - at * boss.maxLife, {});
        await lab.step(2);
        const wanted = side === 'over' ? n - 1 : n;
        seen.push(`${fixed(at * 100, 0)}% phase ${boss.bossPhase + 1}`);
        if (boss.bossPhase !== wanted) problems.push(`phases: at ${fixed(at * 100, 0)}% of its life it was in phase ${boss.bossPhase + 1}, not ${wanted + 1}`);
        const banner = document.querySelector('#banner .b-sub')?.textContent ?? '';
        if (side === 'under' && kit.phases[n].banner && banner !== kit.phases[n].banner) {
          problems.push(`phases: phase ${n + 1} began with the banner "${banner}"`);
        }
      }
    }
    lines.push(`phases: ${seen.join(', ')}`);
  } finally {
    kit.phases[1].below = second;
  }
}

// --- the toll ----------------------------------------------------------------------------------------------

/** What became of a toll at the hero: when the bell began its warning and when its ring reached him, how long he was
 *  stunned, and whether he was. */
interface TollCase { warnedAt: number; stunnedAt: number; stunnedFor: number }

/** The Bell-Warden left to toll at the hero `away` m off, `held` the frame's input (a shield raised): what came of it. */
async function tollAt(lab: Lab, options: BossOptions, away: number, held: SkillKey | null): Promise<TollCase> {
  await standIn(lab, options.fixture, 'crypt');
  const hero = G.player;
  const boss = await bossAt(lab, 'bellwarden', away, true);
  boss.cd = 0;
  const aim = boss.pos.clone().setY(1.5);
  const result: TollCase = { warnedAt: -1, stunnedAt: -1, stunnedFor: 0 };
  await lab.step(TOLL_FRAMES, () => {
    // (the hero turned to the boss and held where he stands: the toll is what's measured, not his walk)
    hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
    boss.desired.set(0, 0, 0);
    return held ? pressing(held, aim, true) : { aim };
  }, (frame) => {
    if (result.warnedAt < 0 && boss.action?.name === 'toll') result.warnedAt = frame;
    // (the first stun alone: its cooldown over, the bell tolls again within the frames followed)
    const first = result.stunnedAt < 0 || result.stunnedAt + result.stunnedFor === frame;
    if (hero.stunned && first) {
      if (result.stunnedAt < 0) result.stunnedAt = frame;
      result.stunnedFor++;
    }
  });
  return result;
}

/** The block skill's key on the hero's bar (a shield's raise), or null. */
function blockKey(): SkillKey | null {
  for (const key of ['mouse2', 'mouse0', '1', '2', '3', '4', 'q', 'e', 'r', 'f'] as SkillKey[]) {
    if (G.player.skillAt(key)?.def.block) return key;
  }
  return null;
}

/** The toll's cases: near (stunned after its warning, for its time), far (faded), and a shield raised. */
async function toll(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const t = BELL_WARDEN.toll;
  const stunsTo = t.stunsTo;
  if (options.canary) t.stunsTo = 0;
  try {
    const near = await tollAt(lab, options, NEAR, null);
    const warn = ENEMIES.bellwarden.bossKit!.attacks!.toll.warn;
    const warned = near.stunnedAt >= 0 ? secondsOf(near.stunnedAt - near.warnedAt) : -1;
    lines.push(`toll: near (${NEAR} m): ${near.stunnedAt < 0 ? 'not stunned' : `stunned ${fixed(secondsOf(near.stunnedFor))} s, `
      + `${fixed(warned)} s after the bell began its swing`}`);
    if (near.warnedAt < 0) problems.push('toll: the bell never tolled');
    if (near.stunnedAt < 0) problems.push(`toll: the hero ${NEAR} m off was never stunned`);
    else {
      if (Math.abs(secondsOf(near.stunnedFor) - t.stun) > STUN_SLACK) problems.push(`toll: stunned ${fixed(secondsOf(near.stunnedFor))} s, not ${t.stun}`);
      if (warned < warn) problems.push(`toll: its ring reached him ${fixed(warned)} s into its warning of ${warn} s`);
    }
  } finally {
    t.stunsTo = stunsTo;
  }
  const far = await tollAt(lab, options, FAR, null);
  lines.push(`toll: far (${FAR} m, faded past ${stunsTo} m): ${far.stunnedAt < 0 ? 'not stunned' : 'stunned'}`);
  if (far.warnedAt < 0) problems.push('toll: the bell never tolled at the far hero');
  if (far.stunnedAt >= 0) problems.push(`toll: the hero ${FAR} m off was stunned, past where its ring fades`);
  await blocked(lab, options, lines, problems);
}

/** A toll at the hero with his shield raised towards it: not stunned. A warrior with a shield alone. */
async function blocked(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const key = blockKey();
  if (!G.player.gear.shield || !key) {
    lines.push('toll: shield raised: not run (--class warrior --gear shield)');
    return;
  }
  const hero = G.player;
  if (options.canary) Object.defineProperty(hero, 'shieldRaised', { get: () => false, configurable: true });
  try {
    const shield = await tollAt(lab, options, NEAR, key);
    lines.push(`toll: shield raised (${NEAR} m): ${shield.stunnedAt < 0 ? 'not stunned' : 'stunned'}`);
    if (shield.warnedAt < 0) problems.push('toll: the bell never tolled at the shielded hero');
    if (shield.stunnedAt >= 0) problems.push('toll: the hero was stunned with his shield raised towards it');
  } finally {
    if (options.canary) delete (hero as { shieldRaised?: boolean }).shieldRaised;
  }
}

// --- the chains --------------------------------------------------------------------------------------------

/** Each chain struck from its side until it breaks: the bell dropped for its window, then up and whole again. */
async function chains(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const parts = ENEMIES.bellwarden.bossKit!.parts!;
  const share = parts.share;
  if (options.canary) parts.share = 0;
  try {
    const boss = await bossAt(lab, 'bellwarden', NEAR, false);
    const broken: string[] = [];
    parts.angles.forEach((angle, i) => {
      const way = boss.facing + angle;
      const from = { x: boss.pos.x + Math.sin(way) * 5, z: boss.pos.z + Math.cos(way) * 5 };
      // (a chain's life and a little more, from its side: a hit no part of which reaches another chain)
      boss.takeDamage(parts.life * boss.maxLife * 1.05, { from });
      broken.push((boss.broken & (1 << i)) ? 'broke' : 'held');
      if (!(boss.broken & (1 << i))) problems.push(`chains: chain ${i + 1} struck from its side for its life held`);
    });
    lines.push(`chains: ${broken.join(', ')}`);
    await lab.step(2);
    // (it thinks again: the window's end is its own to see to)
    boss.dazed = 0;
    if (boss.broken !== 0b1111) return;
    const window = boss.weak;
    lines.push(`chains: all broken: the bell down, ${fixed(window, 1)} s of ${fixed(damageTaken(boss), 1)}x damage`);
    if (Math.abs(window - BELL_WARDEN.down) > 0.1) problems.push(`chains: its window was ${fixed(window)} s, not ${BELL_WARDEN.down}`);
    if (damageTaken(boss) !== ENEMIES.bellwarden.bossKit!.weak!.taken) problems.push(`chains: it took ${damageTaken(boss)}x damage in its window`);
    let tolled = false;
    await lab.step(Math.round((BELL_WARDEN.down + 0.5) * FPS), () => ({}), () => {
      if (boss.action && boss.weak > 0) tolled = true;
    });
    if (tolled) problems.push('chains: it tolled with its bell down');
    const after = boss.broken as number;
    lines.push(`chains: after its window: ${after === 0 ? 'whole again' : 'still broken'}, ${damageTaken(boss)}x damage`);
    if (after !== 0) problems.push('chains: the chains were not whole again after its window');
  } finally {
    parts.share = share;
  }
}

// --- standing its ground -----------------------------------------------------------------------------------

/** how long the hero walks into the boss (s), and how far it may give way meanwhile (m) */
const PRESS_FOR = 3;
const GIVES_MOST = 0.02;

/**
 * The hero walked into the Bell-Warden for `PRESS_FOR` s (from play: "you should not be able to move the boss by just
 * walking towards it", "its a metal bell after all"): how far it gave way, and that he reached it and was
 * held off it. Every foe yielded the whole overlap, and a boss was walked across the arena.
 */
async function stand(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await bossAt(lab, 'bellwarden', 6, false);
  const hero = G.player;
  if (options.canary) Object.defineProperty(boss, 'boss', { value: false, configurable: true });
  const from = boss.pos.clone();
  let nearest = Infinity;
  await lab.step(PRESS_FOR * FPS, () => {
    hero.walkTo = boss.pos.clone();
    boss.desired.set(0, 0, 0);
    return {};
  }, () => {
    nearest = Math.min(nearest, Math.hypot(hero.pos.x - boss.pos.x, hero.pos.z - boss.pos.z));
  });
  hero.walkTo = null;
  const gave = Math.hypot(boss.pos.x - from.x, boss.pos.z - from.z);
  const reach = boss.radius + hero.radius;
  lines.push(`stand: walked into it ${PRESS_FOR} s: it gave ${fixed(gave)} m, the hero came within ${fixed(nearest)} m of `
    + `its middle (its body and his ${fixed(reach)})`);
  if (nearest > reach + 0.3) problems.push(`stand: the hero never reached it (${fixed(nearest)} m from its middle)`);
  if (nearest < reach - 0.2) problems.push(`stand: the hero walked into it, ${fixed(reach - nearest)} m inside its body`);
  if (gave > GIVES_MOST) problems.push(`stand: walked into, it gave way ${fixed(gave)} m (at most ${GIVES_MOST})`);
}

// --- its ghosts seizing a hero -----------------------------------------------------------------------------

/** the most frames waited for a ghost to seize the hero at its ring, and how long one far off is watched (s) */
const SEIZE_FRAMES = 30 * 60;
const FAR_WATCH = 10;
/** where the hero stands for each case, from the bell's middle (m): at its ghosts' ring, and well out of it */
const AT_RING = 3.7;
const FAR_OFF = 9;

/** What became of the hero by a held bell's ghosts: the frame he was seized, how high he was lifted, how far he was
 *  carried, what he took as he landed, and whether he was seized again within his grace. */
interface SeizeCase { seizedAt: number; highest: number; carried: number; hurt: number; again: boolean }

/** The hero stood `away` m from a held Bell-Warden for up to `frames`, its ghosts circling: what they did to him. */
async function seizeCase(lab: Lab, options: BossOptions, away: number, frames: number): Promise<SeizeCase> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await bossAt(lab, 'bellwarden', 12, false);
  const hero = G.player;
  // (put where the case wants him from its middle, on his own side of it)
  const out = hero.pos.clone().sub(boss.pos).setY(0).normalize();
  hero.pos.copy(boss.pos).addScaledVector(out, away).setY(0);
  const result: SeizeCase = { seizedAt: -1, highest: 0, carried: 0, hurt: 0, again: false };
  const takeDamage = hero.takeDamage.bind(hero);
  hero.takeDamage = (amount, type, from) => {
    if (result.seizedAt >= 0) result.hurt += amount;
    return takeDamage(amount, type, from);
  };
  let from: THREE.Vector3 | null = null;
  let landedAt = -1;
  try {
    await lab.step(frames, () => ({}), (frame) => {
      if (hero.seized && result.seizedAt < 0) {
        result.seizedAt = frame;
        from = hero.pos.clone();
      } else if (hero.seized && landedAt >= 0 && frame - landedAt < BELL_WARDEN.grab.grace * FPS) result.again = true;
      result.highest = Math.max(result.highest, hero.lift);
      if (from && !hero.seized && landedAt < 0 && result.seizedAt >= 0) {
        landedAt = frame;
        result.carried = Math.hypot(hero.pos.x - from.x, hero.pos.z - from.z);
      }
    });
  } finally {
    hero.takeDamage = takeDamage;
  }
  return result;
}

/** A hero at the ghosts' ring seized, lifted, carried out and hurt as he lands, not again within his grace; one well
 *  out of it never seized. */
async function grab(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const g = BELL_WARDEN.grab;
  const reach = g.reach;
  if (options.canary) g.reach = 0;
  try {
    const near = await seizeCase(lab, options, AT_RING, SEIZE_FRAMES);
    if (near.seizedAt < 0) {
      lines.push(`grab: at its ghosts' ring (${AT_RING} m) for ${fixed(SEIZE_FRAMES / FPS, 0)} s: never seized`);
      problems.push(`grab: a hero ${AT_RING} m from its middle was never seized in ${fixed(SEIZE_FRAMES / FPS, 0)} s`);
    } else {
      lines.push(`grab: at its ghosts' ring (${AT_RING} m): seized after ${fixed(secondsOf(near.seizedAt), 1)} s, lifted `
        + `${fixed(near.highest)} m, carried ${fixed(near.carried)} m, hurt ${fixed(near.hurt, 0)} as he landed`);
      if (near.highest < g.rise * 0.8) problems.push(`grab: lifted ${fixed(near.highest)} m, not ${g.rise}`);
      if (Math.abs(near.carried - g.away) > 0.6) problems.push(`grab: carried ${fixed(near.carried)} m, not ${g.away}`);
      if (!(near.hurt > 0)) problems.push('grab: dropped, he took no harm');
      if (near.again) problems.push(`grab: seized again within his grace of ${g.grace} s`);
    }
  } finally {
    g.reach = reach;
  }
  const far = await seizeCase(lab, options, FAR_OFF, FAR_WATCH * FPS);
  lines.push(`grab: well out of its ghosts' ring (${FAR_OFF} m) for ${FAR_WATCH} s: ${far.seizedAt < 0 ? 'never seized' : 'seized'}`);
  if (far.seizedAt >= 0) problems.push(`grab: a hero ${FAR_OFF} m from its middle was seized`);
}

// --- the Cantor's encounter --------------------------------------------------------------------------------

/** how long the encounter is fought with its guards up, and after (s) */
const GUARDED_FOR = 28;
const UNGUARDED_FOR = 24;
/** how far apart two warned hits may land under the beat (s): a frame each way */
const BEAT_SLACK = 2 / FPS;

/** A warned hit as it landed: which boss's, what, and when (s, the game's clock). */
interface Landed { id: number; what: string; at: number }

/** The fx that are a boss's warned hits landing, as the encounter keeps them apart (`claimBeat`). */
const WARNED_HITS: FxName[] = ['toll', 'graveHands', 'dirge'];

/** The Ossuary Cantor and its two guards risen round the hero, all thinking, as the wave sends them. */
async function encounterAt(lab: Lab): Promise<{ cantor: Enemy; guards: Enemy[] }> {
  const wave = WAVES.bossEvery * 2;
  const cantor = lab.spawnFoe('cantor', clearSpot(12, ENEMIES.cantor.radius), { wave });
  // (at their rung's spots, as the run sends them: bossGuardSpots.ts holds the run to them)
  const spots = BIOMES.crypt.bosses.find((boss) => boss.id === 'cantor')?.guards?.at ?? [];
  const guards = spots.map(([x, z]) => lab.spawnFoe('bellwarden', new THREE.Vector3(x, 0, z), { wave, guard: true }));
  const all = [cantor, ...guards];
  await lab.until(() => all.every((boss) => boss.spawning <= 0), RISE_FRAMES, 'the encounter never rose');
  return { cantor, guards };
}

/** Frames of the fight with the hero kept whole, every warned hit and ring that lands kept. */
async function fight(lab: Lab, seconds: number, landed: Landed[], rings: Landed[], each?: () => void): Promise<void> {
  setFxSink((name, args) => {
    if (WARNED_HITS.includes(name)) landed.push({ id: args[0], what: name, at: G.time });
    if (name === 'tele') rings.push({ id: args[0], what: 'ring', at: G.time });
  });
  try {
    await lab.step(Math.round(seconds * FPS), () => {
      const hero = G.player;
      hero.life = hero.stats.maxLife;
      each?.();
      return {};
    });
  } finally {
    setFxSink(null);
  }
}

/** The closest two different bosses' warned hits landed (s), and which. */
function closestHits(landed: Landed[]): { gap: number; pair: string } {
  let gap = Infinity, pair = 'none';
  for (let i = 0; i < landed.length; i++) {
    for (let j = i + 1; j < landed.length; j++) {
      const a = landed[i], b = landed[j];
      if (a.id === b.id) continue;
      const apart = Math.abs(a.at - b.at);
      if (apart < gap) {
        gap = apart;
        pair = `${a.what} and ${b.what}`;
      }
    }
  }
  return { gap, pair };
}

/**
 * The Cantor and its guards fought: warded while a guard stands, not after; its casts ringed before they land; no
 * two bosses' warned hits within its beat; its heart bared after a cast once the guards are down.
 */
async function encounter(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const stand = (): Promise<void> => standIn(lab, options.fixture, 'crypt');
  await guardSpots({ lab, stand, canary: options.canary, lines, problems });
  await stand();
  const ward = ENEMIES.cantor.bossKit!.ward!;
  const asGuard = ENEMIES.bellwarden.asGuard!;
  const lesser = { ...BELL_WARDEN.guard };
  const planted = { taken: ward.taken, size: asGuard.size, stands: asGuard.stands };
  // (the canary: a ward that wards nothing, and guards as whole Bell-Wardens that walk, their tolls a whole bell's)
  if (options.canary) {
    ward.taken = 1;
    asGuard.size = 1;
    asGuard.stands = false;
    Object.assign(BELL_WARDEN.guard, { reach: BELL_WARDEN.toll.reach, stunsTo: BELL_WARDEN.toll.stunsTo });
  }
  const taken = planted.taken;
  try {
    const { cantor, guards } = await encounterAt(lab);
    lesserGuards(cantor, guards, lines, problems);
    const rose = guards.map((guard) => guard.pos.clone());
    let moved = 0;
    const landed: Landed[] = [], rings: Landed[] = [];
    let wardedFrames = 0, frames = 0, wardTaken = 1, seizedFrames = 0, wasStunned = false;
    const stunsFrom: number[] = [];
    await fight(lab, GUARDED_FOR, landed, rings, () => {
      frames++;
      if (cantor.warded) wardedFrames++;
      wardTaken = Math.min(wardTaken, damageTaken(cantor));
      const hero = G.player;
      if (hero.seized) seizedFrames++;
      // (each stun begun, and how far the nearest guard stood: only a guard tolls in this span)
      if (hero.stunned && !wasStunned) stunsFrom.push(Math.min(...guards.map((g) => Math.hypot(g.pos.x - hero.pos.x, g.pos.z - hero.pos.z))));
      wasStunned = hero.stunned;
      moved = Math.max(moved, ...guards.map((guard, i) => guard.pos.distanceTo(rose[i])));
    });
    guardTolls(stunsFrom, seizedFrames, lesser.stunsTo, lines, problems);
    guardsStood(moved, lines, problems);
    guards[0].takeDamage(guards[0].life - 0.15 * guards[0].maxLife, {});
    await lab.step(3);
    lines.push(`encounter: a guard at 15% of its life in phase ${guards[0].bossPhase}`);
    if (guards[0].bossPhase !== 0) problems.push(`encounter: a guard entered phase ${guards[0].bossPhase}: a guard keeps its first`);
    lines.push(`encounter: guards up ${GUARDED_FOR} s: warded ${fixed(wardedFrames / frames, 2)} of the frames, `
      + `taking ${fixed(wardTaken, 2)} of the damage`);
    if (wardedFrames < frames - 2) problems.push(`encounter: the Cantor warded ${wardedFrames} of ${frames} frames with its guards up`);
    if (Math.abs(wardTaken - taken) > 1e-6) problems.push(`encounter: warded, the Cantor took ${fixed(wardTaken, 2)} of the damage, not ${taken}`);
    for (const guard of guards) guard.takeDamage(guard.life + 1, {});
    let unwarded = 0, bared = 0;
    const afterAt = landed.length;
    await fight(lab, UNGUARDED_FOR, landed, rings, () => {
      if (!cantor.warded) unwarded++;
      if (cantor.weak > 0) bared++;
    });
    const casts = landed.slice(afterAt).filter((hit) => hit.id === cantor.id).length;
    lines.push(`encounter: guards down ${UNGUARDED_FOR} s: unwarded ${unwarded} frames, ${casts} casts landed, `
      + `its heart bared ${fixed(bared / FPS, 1)} s`);
    if (unwarded < UNGUARDED_FOR * FPS - 2) problems.push('encounter: the Cantor stayed warded with its guards fallen');
    if (casts === 0) problems.push('encounter: the Cantor cast nothing in its fight');
    else if (bared === 0) problems.push('encounter: its heart was never bared after a cast');
    // (each cast's hit lands after a ring of its own laid at least its warning before)
    const cantorHits = landed.filter((hit) => hit.id === cantor.id);
    const unwarned = cantorHits.filter((hit) => !rings.some((ring) => ring.id === cantor.id && hit.at - ring.at >= 0.9 && hit.at - ring.at < 3));
    lines.push(`encounter: ${cantorHits.length} of the Cantor's hits, ${unwarned.length} without a ring before them`);
    if (unwarned.length) problems.push(`encounter: ${unwarned.length} of the Cantor's hits landed with no ring first`);
    const tolls = landed.filter((hit) => hit.what === 'toll').length;
    const closest = closestHits(landed.slice(0, afterAt));
    lines.push(`encounter: ${tolls} tolls with the guards up; two bosses' warned hits ${fixed(closest.gap, 2)} s apart at the closest (${closest.pair})`);
    if (tolls === 0) problems.push('encounter: the guards never tolled');
    if (closest.gap < CANTOR.beat - BEAT_SLACK) problems.push(`encounter: two bosses' warned hits ${fixed(closest.gap, 2)} s apart, under the beat ${CANTOR.beat} s`);
  } finally {
    ward.taken = planted.taken;
    asGuard.size = planted.size;
    asGuard.stands = planted.stands;
    Object.assign(BELL_WARDEN.guard, lesser);
  }
}

/** The most a guard may stand against its Cantor's height: a lesser bell, the Cantor towering over it. */
const GUARD_HEIGHT_MOST = 0.5;

/** Each guard's size against the Cantor's: a lesser bell (from play, whole ones were "almost like main boss"). */
function lesserGuards(cantor: Enemy, guards: Enemy[], lines: string[], problems: string[]): void {
  const tallest = Math.max(...guards.map((guard) => guard.height));
  const share = tallest / cantor.height;
  lines.push(`encounter: the guards ${fixed(tallest, 2)} m tall against the Cantor's ${fixed(cantor.height, 2)} m (${fixed(share, 2)}), `
    + `${fixed(guards[0].radius, 2)} m round`);
  if (share > GUARD_HEIGHT_MOST) problems.push(`encounter: a guard stands ${fixed(share, 2)} of the Cantor's height, over ${GUARD_HEIGHT_MOST}`);
}

/** The furthest a guard may move from where it rose (m): none, but a float's rounding. */
const GUARD_MOVED_MOST = 0.001;

/** The guards stood where they rose through the fight (from play: "They stay stationary"). */
function guardsStood(moved: number, lines: string[], problems: string[]): void {
  lines.push(`encounter: the guards moved ${fixed(moved, 3)} m at most from where they rose`);
  if (moved > GUARD_MOVED_MOST) problems.push(`encounter: a guard moved ${fixed(moved, 2)} m from where it rose: they stand`);
}

/** The guards' tolls as a lesser bell's: no stun from further than its `stunsTo` (and the hero's body), no seizing. */
function guardTolls(stunsFrom: number[], seizedFrames: number, stunsTo: number, lines: string[], problems: string[]): void {
  const most = stunsTo + G.player.radius + 0.5;
  const far = stunsFrom.filter((d) => d > most);
  lines.push(`encounter: ${stunsFrom.length} stuns by the guards' tolls, from ${stunsFrom.map((d) => fixed(d, 1)).join(', ') || 'none'} m; `
    + `${seizedFrames} frames seized by a ghost`);
  if (far.length) problems.push(`encounter: a guard's toll stunned the hero from ${fixed(Math.max(...far), 1)} m, past its ${stunsTo} m`);
  if (seizedFrames) problems.push(`encounter: a guard's ghost seized the hero (${seizedFrames} frames)`);
}

// --- the programs ------------------------------------------------------------------------------------------

/** Every effect of the Bell-Warden's fight drawn (each toll, a shard, the bell dropped): no program compiled. */
async function compiles(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await bossAt(lab, 'bellwarden', NEAR, false);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(2);
    const before = (G.renderer.info.programs ?? []).length;
    const x = boss.pos.x, z = boss.pos.z;
    fx('toll', boss.id, x, z, 0, 0);
    await lab.step(20);
    fx('toll', boss.id, x, z, 1, 0);
    fx('shard', boss.id, x, z, x + 3, z, 0);
    fx('bellDown', x, z);
    for (let i = 0; i < 4; i++) fx('bossPart', boss.id, i, 1);
    // (the Cantor's: its grave hands, a dirge, a ring, its ward and its heart bared)
    const cantor = await bossAt(lab, 'cantor', FAR, false);
    fx('tele', cantor.id, x + 2, z, CANTOR.hands.radius, 0.5, 0x5fe8a8);
    fx('graveHands', cantor.id, x - 2, z, 0);
    fx('dirge', cantor.id, cantor.pos.x, cantor.pos.z, 0.3, 0);
    fx('bossWard', cantor.id, 1);
    await lab.step(20);
    fx('bossWard', cantor.id, 0);
    fx('bossWeak', cantor.id, 2);
    if (options.canary) {
      const odd = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1), new THREE.MeshPhongMaterial({ color: 0x123456, flatShading: true }));
      odd.position.copy(boss.pos).setY(2);
      G.scene.add(odd);
      await lab.step(4);
      G.scene.remove(odd);
    }
    await lab.step(60);
    const compiled = (G.renderer.info.programs ?? []).length - before;
    lines.push(`compiles: ${compiled} programs compiled drawing its tolls, a shard, the bell dropped and the Cantor's casts`);
    if (compiled > 0) problems.push(`compiles: ${compiled} programs compiled in the Crypt's bosses' fights`);
  } finally {
    lab.drawing = drawing;
  }
}

// --- time to kill ------------------------------------------------------------------------------------------

/** The hero's basic attack held `TTK_HOLD` s on a boss held still: the damage it dealt a second. */
async function damageASecond(lab: Lab, options: BossOptions): Promise<number> {
  await standIn(lab, options.fixture, 'crypt');
  const attack = G.player.skillAt('mouse0')!.def;
  // (a melee hero up to it, a shooter out where its shots fly level: `AIM.near` takes the aim on past a foe nearer)
  const melee = !attack.draw && !attack.speed;
  const boss = await bossAt(lab, 'colossus', melee ? 3.6 : 8, false);
  const hero = G.player;
  if (options.canary) boss.takeDamage = () => 0;
  const aim = boss.pos.clone().setY(1.6);
  const before = boss.life;
  // (a drawn shot drawn to full and let go, round again: held, a bow draws and never looses)
  const cycle = attack.draw ? Math.round((attack.draw + 0.1) * FPS) + 1 : 0;
  await lab.step(TTK_HOLD * FPS, (frame) => {
    hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
    // (its Energy kept full, as the class balance's damage a second is judged: the attack's damage, not its cost)
    hero.energy = hero.stats.maxEnergy;
    boss.desired.set(0, 0, 0);
    const held = cycle === 0 || frame % cycle !== cycle - 1;
    return pressing('mouse0', aim, held);
  });
  return (before - boss.life) / TTK_HOLD;
}

/** How long a boss of life `life` takes at `dps`, its weak windows (a share `drops` of its life dealt to its chains
 *  opening one of `down` s at `taken` times) counted where it has them. */
function timeToKill(life: number, dps: number, windows?: { drops: number; down: number; taken: number }): number {
  if (!windows) return life / dps;
  let dealt = 0, time = 0, sinceDrop = 0;
  const step = 0.05, round = windows.drops * life;
  while (dealt < life && time < 3600) {
    dealt += dps * step;
    sinceDrop += dps * step;
    time += step;
    if (sinceDrop >= round) {
      sinceDrop = 0;
      dealt += dps * windows.taken * windows.down;
      time += windows.down;
    }
  }
  return time;
}

/** The time each boss takes the hero at the wave it comes on, from his basic attack's damage a second. */
async function ttk(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const dps = await damageASecond(lab, options);
  const cls = G.player.cls.id;
  if (!(dps > 0)) {
    problems.push(`ttk: the ${cls}'s basic attack dealt nothing to the boss`);
    return;
  }
  const colossus = ENEMIES.colossus.life * SCALING.life(5);
  const bell = ENEMIES.bellwarden.life * SCALING.life(10);
  const parts = ENEMIES.bellwarden.bossKit!.parts!;
  const windows = { drops: parts.life * parts.angles.length, down: BELL_WARDEN.down, taken: ENEMIES.bellwarden.bossKit!.weak!.taken };
  const plain = timeToKill(bell, dps);
  const dropped = timeToKill(bell, dps, windows);
  const first = timeToKill(colossus, dps);
  lines.push(`ttk: ${cls}: ${fixed(dps, 0)} damage a second with ${G.player.skillAt('mouse0')!.def.name} and the starting gear`);
  lines.push(`ttk: the Colossus at wave 5 (${fixed(colossus, 0)} life): ${fixed(first, 0)} s`);
  lines.push(`ttk: the Bell-Warden alone at wave 10 (${fixed(bell, 0)} life): ${fixed(plain, 0)} s, ${fixed(dropped, 0)} s dropping the bell `
    + `each time its chains break (${fixed(dropped / first, 2)}x the Colossus's)`);
  // the encounter at wave 10: its guards first (each its share of a Bell-Warden's life, their bells dropped too), then
  // the Cantor with its heart bared for `bared` s of each cast's `every`
  const guard = bell * ENEMIES.bellwarden.asGuard!.life;
  const guards = 2 * timeToKill(guard, dps, windows);
  const cantor = ENEMIES.cantor.life * SCALING.life(10);
  const heart = ENEMIES.cantor.bossKit!.weak!.taken;
  const cantorTime = cantor / (dps * (1 + (heart - 1) * CANTOR.bared / CANTOR.every));
  const whole = guards + cantorTime;
  lines.push(`ttk: the Cantor's encounter at wave 10 (two guards of ${fixed(guard, 0)} life, the Cantor ${fixed(cantor, 0)}): `
    + `${fixed(guards, 0)} s for the guards, ${fixed(cantorTime, 0)} s for the Cantor, ${fixed(whole, 0)} s in all `
    + `(${fixed(whole / first, 2)}x the Colossus's)`);
}

// --- pictures ----------------------------------------------------------------------------------------------

/** how far off the boss the pictures are taken from (m), and the height they're framed on */
const PICTURE_FROM = 15;
const PICTURE_Y = 3;

/** The boss pictured from in front of it (behind the hero), from its side and from the game's own view above. */
function pictureBoss(lab: Lab, boss: Enemy, label: string, notes: string[]): Pictured {
  const at = boss.pos.clone().setY(PICTURE_Y);
  return lab.picture(label, ['back', 'left', 'above'], notes, { at, distance: PICTURE_FROM });
}

/** Frames until the boss's action is `name` at `share` of it through. */
async function untilAction(lab: Lab, boss: Enemy, name: string, share: number): Promise<void> {
  const reached = (): boolean => boss.action?.name === name && boss.action.t / boss.action.dur >= share;
  await lab.until(reached, TOLL_FRAMES, `the Bell-Warden never reached ${share} of its ${name}`);
}

/**
 * The Bell-Warden at every stage of its fight, for the eye (no verdicts), each as the player sees it (the game's view
 * with the HUD and its banners) or close up: coming on, a toll's warning, its ring, the hero stunned with husks
 * rising, a chain broken, all four and the bell down, back up, its second phase's banner, a double toll and shards,
 * its last phase's banner and its bearers kneeling, and its fall.
 */
async function pictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  // (the hero set up again facing where it will stand, so the player's view looks at it)
  const spot = clearSpot(12, ENEMIES.bellwarden.radius);
  await lab.setup({ ...options.fixture, at: SPOT, facing: Math.atan2(spot.x - SPOT[0], spot.z - SPOT[1]) });
  const hero = G.player;
  const boss = await bossAt(lab, 'bellwarden', 12, false);
  const moments: Pictured[] = [];
  const close = (label: string, note: string, views: ViewName[] = ['left']): void => {
    const at = boss.pos.clone().setY(PICTURE_Y);
    moments.push(lab.picture(label, views, [note], { at, distance: PICTURE_FROM }));
  };
  const seen = async (label: string, note: string): Promise<void> => { moments.push(await screenClear(lab, label, note)); };
  const still = (): void => { boss.dazed = 1e4; boss.cancelAction(); };
  const sides = boss.def.bossKit!.parts!;
  const breakChain = (i: number): void => {
    const way = boss.facing + sides.angles[i];
    const from = { x: boss.pos.x + Math.sin(way) * 5, z: boss.pos.z + Math.cos(way) * 5 };
    boss.takeDamage(sides.life * boss.maxLife * 1.05, { from });
  };

  // 0. a ghost seizing the hero who stands at its ring, carrying him up and out
  const out = hero.pos.clone().sub(boss.pos).setY(0).normalize();
  const stoodAt = hero.pos.clone();
  hero.pos.copy(boss.pos).addScaledVector(out, AT_RING).setY(0);
  const lifted = (): boolean => hero.seized && hero.lift > BELL_WARDEN.grab.rise * 0.75;
  await lab.until(lifted, SEIZE_FRAMES, 'no ghost seized the hero for the pictures');
  const carriedAt = hero.pos.clone().setY(2.2);
  moments.push(lab.picture('0 seized (close)', ['back', 'left'], ['a ghost carrying the hero up and out, to drop him'], { at: carriedAt, distance: 6 }));
  await seen('0 seized', 'a ghost carrying the hero off, as the player sees it');
  await lab.until(() => !hero.seized, 120, 'the hero was never dropped');
  await lab.step(30);
  hero.pos.copy(stoodAt);
  // 1. it comes on, shuffling under its bell, its toll held off
  boss.dazed = 0;
  boss.cd = 99;
  await lab.step(80);
  await seen('1 it comes', 'the Bell-Warden shuffling in, as the player sees it');
  close('1 it comes (close)', 'four ghoul bearers under the frame, the pale clapper light inside');
  // (a ghost haunting it, framed on its own: models/bellGhosts.ts)
  const ghost = boss.obj.getObjectByName('bell ghost');
  if (ghost) {
    const at = ghost.getWorldPosition(new THREE.Vector3());
    moments.push(lab.picture('1 a ghost', ['back', 'left'], ['a ghost circling the bell, its arms out, its hem swept back'], { at, distance: 3.2 }));
  }
  // 2-4. a toll: its warning, its ring, the hero stunned; this toll (its second) raises husks round the arena
  boss.brain.tolls = 1;
  boss.cd = 0;
  await untilAction(lab, boss, 'toll', 0.4);
  close('2 toll warning (close)', 'the bell swung back, its cracks and clapper glowing, creaking: about 1 s to get away or raise a shield');
  await seen('2 toll warning', 'the warning as the player sees it');
  await untilAction(lab, boss, 'toll', 0.6);
  await seen('3 the ring', 'the toll\'s ring rolling out over the floor');
  await lab.until(() => hero.stunned, TOLL_FRAMES, 'the hero was never stunned');
  await lab.step(20);
  await seen('4 stunned', 'the ring reached the hero: stunned 2 s (stars over his head); Hollow Husks rising round the arena');
  // 5-7. the chains, one broken, then all four: the bell down for its window, then up again
  still();
  breakChain(0);
  await lab.step(30);
  close('5 one chain broken', 'a chain struck from its side until it snapped hangs loose from the frame', ['back', 'left']);
  for (let i = 1; i < sides.angles.length; i++) breakChain(i);
  await lab.step(90);
  close('6 bell down (close)', 'all four chains broken: the bell rests on the ground for 6 s, taking double damage (the gold ring)');
  await seen('6 bell down', 'the weak-spot window as the player sees it');
  boss.dazed = 0;
  boss.cd = 99;
  await lab.until(() => boss.broken === 0, 600, 'the chains were never whole again');
  await lab.step(80);
  close('7 back up', 'its window over: the bearers up, the chains whole, the bell lifted');
  // 8-10. phase 2: its banner, a double toll, shards on the floor
  boss.takeDamage(boss.life - 0.58 * boss.maxLife, {});
  // (its hit's flash faded first: a hit of half its life lit it flat)
  await lab.step(30);
  await seen('8 phase 2', 'under 60%: the bell splits, and tolls twice from now on');
  boss.cd = 0;
  await untilAction(lab, boss, 'doubleToll', 0.75);
  await seen('9 double toll', 'two rings: a fast one, and a slow one after it');
  still();
  for (const way of [0.6, 2.3, 4.4]) {
    const x = boss.pos.x + Math.sin(way) * 5.5, z = boss.pos.z + Math.cos(way) * 5.5;
    fx('shard', boss.id, boss.pos.x, boss.pos.z, x, z, 0);
  }
  await lab.step(50);
  close('10 shards', 'bronze shards broken off as it\'s hit, lying on the floor a few seconds: standing on them hurts', ['left', 'above']);
  // 11-12. phase 3: its banner, the bearers kneeling
  boss.takeDamage(boss.life - 0.22 * boss.maxLife, {});
  // (its hit's flash faded first: a hit of half its life lit it flat)
  await lab.step(30);
  await seen('11 phase 3', 'under 25%: it stops and tolls every 3 s');
  await lab.step(90);
  close('12 kneeling', 'the bearers down on their knees, the frame lowered');
  // 13. its fall
  boss.takeDamage(boss.life + 1, {});
  await lab.step(45);
  close('13 its fall', 'killed: the bell crashes down, the bearers collapse');
  lines.push(`pictures: ${moments.length} moments`);
  return moments;
}

/**
 * The Cantor's encounter at every stage, for the eye (no verdicts): coming on with its guards, warded, its grave hands'
 * rings and their burst, its guards down, its heart bared, its dirge, its last phase and its fall.
 */
async function encounterPictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const spot = clearSpot(12, ENEMIES.cantor.radius);
  await lab.setup({ ...options.fixture, at: SPOT, facing: Math.atan2(spot.x - SPOT[0], spot.z - SPOT[1]) });
  const { cantor, guards } = await encounterAt(lab);
  const hero = G.player;
  const moments: Pictured[] = [];
  const keepWhole = (): Record<string, never> => {
    hero.life = hero.stats.maxLife;
    return {};
  };
  const close = (label: string, note: string, views: ViewName[] = ['back', 'left']): void => {
    const at = cantor.pos.clone().setY(3.6);
    moments.push(lab.picture(label, views, [note], { at, distance: 13 }));
  };
  const seen = async (label: string, note: string): Promise<void> => { moments.push(await screenClear(lab, label, note)); };
  const actUntil = async (foe: Enemy, name: string, share: number): Promise<void> => {
    foe.cd = 0;
    const reached = (): boolean => foe.action?.name === name && foe.action.t / foe.action.dur >= share;
    await lab.until(reached, TOLL_FRAMES, `the ${foe.def.name} never reached ${share} of its ${name}`, keepWhole);
  };
  const castUntil = (name: string, share: number): Promise<void> => actUntil(cantor, name, share);
  // 1. it comes, its guards with it, warded
  for (const guard of guards) guard.cd = 99;
  cantor.cd = 99;
  await lab.step(90, keepWhole);
  await seen('1 the choir comes', 'the Ossuary Cantor and its two Bell-Wardens, as the player sees it');
  // (the arena from straight above: both guards on the ring walk, across from each other)
  const middle = new THREE.Vector3(0, 0, 0);
  moments.push(lab.picture('0 from above', ['plan'], ['the crypt from above: the two guards on the ring walk, across the arena from each other'], { at: middle, distance: ABOVE }));
  close('1 the Cantor (close)', 'floating in rotted vestments: a crown of candles, a halo of skulls, a bell for a heart, its crozier and lantern; warded by its guards (the pale shell)', ['front', 'left', 'right', 'back']);
  // 1a. a guard beside the hero, for its size against his
  await pictureBeside(lab, moments, guards[1], hero, cantor);
  // 1b. a guard's toll: its ring rolling out
  await actUntil(guards[0], 'toll', 0.98);
  // (its ring out past the guard's own glow on the floor, short of where it fades; pictured at the guard, which
  // stands across the arena from the hero, out of his view)
  await lab.step(TOLL_SEEN_AFTER, keepWhole);
  const tolling = guards[0].pos.clone().setY(1);
  moments.push(lab.picture('1b a guard tolls', ['above'], ["a guard Bell-Warden's toll, its ring rolling out"], { at: tolling, distance: TOLL_SEEN_FROM }));
  guards[0].cd = 99;
  await lab.step(60, keepWhole);
  // 2-3. grave hands: the rings under the hero, then the hands
  await castUntil('graveHands', 0.35);
  await seen('2 grave hands warning', 'arms raised, chanting: a ring of grave light under the hero, about 1.3 s to step out');
  close('2 arms raised (close)', 'its arms raised over the warning, its jaw open in the chant');
  await castUntil('graveHands', 0.6);
  await lab.step(4, keepWhole);
  await seen('3 grave hands', 'bone hands tearing up through the floor where the ring was');
  // 4. the guards fallen: the ward gone
  for (const guard of guards) guard.takeDamage(guard.life + 1, {});
  await lab.step(80, keepWhole);
  await seen('4 its guards fallen', 'both Bell-Wardens down: the ward is gone, the Cantor takes full damage');
  // 5. its heart bared after a cast
  await castUntil('graveHands', 0.62);
  await lab.step(30, keepWhole);
  close('5 heart bared (close)', 'after each cast its ribs swing open and its bell-heart is bared for 4.5 s, taking double damage', ['front', 'left']);
  // 6. phase 2: the dirge
  cantor.takeDamage(cantor.life - 0.5 * cantor.maxLife, {});
  await lab.step(30, keepWhole);
  await seen('6 phase 2', 'under 55%: the Cantor sings the dirge');
  cantor.brain.casts = 1;
  await castUntil('dirge', 0.4);
  await seen('7 dirge warning', 'a line of rings marching out from it to the hero, each bursting in turn');
  await castUntil('dirge', 0.6);
  await lab.step(5, keepWhole);
  await seen('8 the dirge', 'the dirge bursting along its line');
  // 9. its last phase, and its fall
  cantor.takeDamage(cantor.life - 0.2 * cantor.maxLife, {});
  await lab.step(40, keepWhole);
  await seen('9 phase 3', 'under 25%: the ossuary answers, a dirge at every hero, casting faster');
  cantor.takeDamage(cantor.life + 1, {});
  await lab.step(45, keepWhole);
  close('10 its fall', 'killed: it sinks and tips forward into the dark');
  lines.push(`encounterPictures: ${moments.length} moments`);
  return moments;
}

/** How high over the arena's middle its picture from straight above is taken (m): the whole ring in it. */
const ABOVE = 95;

/** How far from a guard the hero is stood for their picture together (m). */
const BESIDE = 2.4;

/** The hero stood `BESIDE` off a guard where it rose (it stands: it's never moved), on its side away from the Cantor
 *  (which floats over him otherwise), the two as the player sees them: the lesser bell's size against a man's
 *  (pictured from round them, the props of the arena stood between the camera and them); then back where he stood. */
async function pictureBeside(lab: Lab, moments: Pictured[], guard: Enemy, hero: typeof G.player, cantor: Enemy): Promise<void> {
  const toHero = guard.pos.clone().sub(cantor.pos).setY(0).normalize();
  const stood = hero.pos.clone();
  hero.pos.copy(guard.pos).addScaledVector(toHero, BESIDE);
  guard.cd = 99;
  // (a few frames for the camera to follow him there)
  await lab.step(FOLLOW_FRAMES);
  const note = `a guard Bell-Warden beside the hero, ${BESIDE} m apart: a lesser bell, ` +
    `${guard.def.asGuard?.size ?? 1} of a Bell-Warden's size`;
  moments.push(await screenClear(lab, '1a a guard beside the hero', note));
  // (back where he stood, the Cantor in view for the moments after)
  hero.pos.copy(stood);
  await lab.step(FOLLOW_FRAMES);
}

/** Frames after a guard's toll rings that it's pictured, and from how far (m): its ring out past its glow. */
const TOLL_SEEN_AFTER = 36, TOLL_SEEN_FROM = 16;

/** Frames for the camera to follow the hero stood somewhere else. */
const FOLLOW_FRAMES = 30;

/** The screen as the player sees it, the slow game's prompt put away first: the lab's boot is slow, and the prompt
 *  lay over the boss's bar. */
async function screenClear(lab: Lab, label: string, note: string): Promise<Pictured> {
  putAway();
  return lab.screen(label, [note]);
}

/** `cantorLook`: the Cantor risen alone at 12 m (bossCantor.ts). */
async function cantorAlone(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const cantor = lab.spawnFoe('cantor', clearSpot(12, ENEMIES.cantor.radius), { wave: WAVES.bossEvery * 2 });
  await lab.until(() => cantor.spawning <= 0, RISE_FRAMES, 'the Cantor never rose');
  return cantorLook(lab, cantor, lines, problems);
}

/** `lab boss`: each part asked for, in turn. */
export async function boss(lab: Lab, options: BossOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const run: Record<Exclude<BossPart, 'pictures' | 'encounterPictures' | 'cantorLook'>, typeof ladder> = {
    ladder, phases, toll, chains, stand, grab, encounter, compiles, ttk,
  };
  const moments: Pictured[] = [];
  const was = G.arena.biome;
  try {
    for (const part of options.parts ?? BOSS_PARTS) {
      if (part === 'pictures') moments.push(...await pictures(lab, options, lines));
      else if (part === 'encounterPictures') moments.push(...await encounterPictures(lab, options, lines));
      else if (part === 'cantorLook') moments.push(...await cantorAlone(lab, options, lines, problems));
      else await run[part](lab, options, lines, problems);
    }
  } finally {
    if (G.arena.biome !== was) G.arena.setBiome(was);
  }
  if (options.canary) {
    const caught = problems.length;
    lines.push(`canary: ${caught} faults caught`);
    const judged = (options.parts ?? BOSS_PARTS).filter((part) => !PICTURE_PARTS.includes(part));
    return { text: lines.join('\n'), problems: canaryMissed(judged, problems), moments };
  }
  return { text: lines.join('\n'), problems, moments };
}

/** With the canary: the parts whose planted fault went uncaught (each part's problems name it). */
function canaryMissed(parts: BossPart[], problems: string[]): string[] {
  const missed = parts.filter((part) => !problems.some((problem) => problem.startsWith(`${part}:`) || (part === 'ladder' && problem.includes(' wave '))));
  return missed.map((part) => `canary: the ${part} part's planted fault went uncaught`);
}
