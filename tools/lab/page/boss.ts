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
// - `compiles`: every effect the Bell-Warden's fight draws (a toll, a double toll, a shard, the bell dropped), drawn:
//   no program compiled meanwhile.
// - `ttk`: the hero's basic attack held on a boss held still, its damage a second, and from it the time each boss
//   takes at the wave it comes on (the Colossus at 5, the Bell-Warden at 10), with and without its weak windows.
//
// - `pictures` (asked for alone, not run by default): the Bell-Warden in each of its moments, a sheet for the eye.
//
// `--canary` plants a fault each part must catch: a ladder turned round, a phase's share moved, a toll that stuns no
// one near it, a shield that stops nothing, chains that take no harm, a program compiled in the fight, and an attack
// that deals nothing.
import * as THREE from 'three';
import type { Fixture, Lab, Pictured, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { BiomeId } from '../../../src/data/biomes';
import type { EnemyId } from '../../../src/data/enemies';
import type { SkillKey } from '../../../src/types';
import { G } from '../../../src/state';
import { BIOMES, BIOME_IDS, bossOfWave } from '../../../src/data/biomes';
import { BELL_WARDEN, ENEMIES, SCALING } from '../../../src/data/enemies';
import { WAVES } from '../../../src/data/waves';
import { damageTaken } from '../../../src/entities/bossKit';
import { fx } from '../../../src/entities/enemyAI';
import { startNextWave } from '../../../src/game/run';
import { pressing } from './cast';
import { ARENA } from '../../../src/data/balance';
import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';

/** The parts the command runs, in order. */
export type BossPart = 'ladder' | 'phases' | 'toll' | 'chains' | 'compiles' | 'ttk' | 'pictures';
export const BOSS_PARTS: BossPart[] = ['ladder', 'phases', 'toll', 'chains', 'compiles', 'ttk'];

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
async function bossOfWaveSent(lab: Lab, wave: number): Promise<{ boss: EnemyId | undefined; banner: string }> {
  const run = G.run!;
  run.wave = wave;
  startNextWave();
  const banner = document.querySelector('#banner .b-sub')?.textContent ?? '';
  run.phase = 'countdown';
  run.timer = 0;
  await lab.until(() => run.phase === 'fighting', WAVE_FRAMES, `wave ${wave} never started`);
  const boss = run.boss?.type;
  // (the wave stopped before it sends anyone, back to a countdown held for the next)
  run.queue.length = 0;
  run.boss = null;
  run.phase = 'countdown';
  run.timer = 1e4;
  return { boss, banner };
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
    if (options.canary) {
      const odd = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1), new THREE.MeshPhongMaterial({ color: 0x123456, flatShading: true }));
      odd.position.copy(boss.pos).setY(2);
      G.scene.add(odd);
      await lab.step(4);
      G.scene.remove(odd);
    }
    await lab.step(60);
    const compiled = (G.renderer.info.programs ?? []).length - before;
    lines.push(`compiles: ${compiled} programs compiled drawing its tolls, a shard and the bell dropped`);
    if (compiled > 0) problems.push(`compiles: ${compiled} programs compiled in the Bell-Warden's fight`);
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
  lines.push(`ttk: the Bell-Warden at wave 10 (${fixed(bell, 0)} life): ${fixed(plain, 0)} s, ${fixed(dropped, 0)} s dropping the bell `
    + `each time its chains break (${fixed(dropped / first, 2)}x the Colossus's)`);
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
 * The Bell-Warden in each of its moments, for the eye (no verdicts): standing, its bell swung back and glowing as a
 * toll's warning, its ring rolling out, its second phase's shards on the floor, its chains broken and the bell down,
 * and its last phase's bearers kneeling.
 */
async function pictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await bossAt(lab, 'bellwarden', 11, false);
  const moments: Pictured[] = [];
  await lab.step(40);
  moments.push(pictureBoss(lab, boss, 'the Bell-Warden', ['phase 1, standing']));
  boss.dazed = 0;
  boss.cd = 0;
  await untilAction(lab, boss, 'toll', 0.4);
  moments.push(pictureBoss(lab, boss, 'toll: its warning', ['the bell swung back, its cracks glowing']));
  await untilAction(lab, boss, 'toll', 0.62);
  moments.push(pictureBoss(lab, boss, 'toll: its ring', ['the ring rolling out over the floor']));
  boss.takeDamage(boss.life - 0.55 * boss.maxLife, {});
  for (const way of [0.4, 2.2, 4.1]) {
    const x = boss.pos.x + Math.sin(way) * 5, z = boss.pos.z + Math.cos(way) * 5;
    fx('shard', boss.id, boss.pos.x, boss.pos.z, x, z, 0);
  }
  boss.dazed = 1e4;
  boss.cancelAction();
  await lab.step(50);
  moments.push(pictureBoss(lab, boss, 'phase 2: shards', ['bronze shards broken off, lying on the floor']));
  for (let i = 0; i < 4; i++) fx('bossPart', boss.id, i, 1);
  await lab.step(90);
  moments.push(pictureBoss(lab, boss, 'chains broken: the bell down', ['its weak-spot window: double damage']));
  for (let i = 0; i < 4; i++) fx('bossPart', boss.id, i, 0);
  boss.weak = 0;
  boss.brain.down = 0;
  boss.takeDamage(boss.life - 0.2 * boss.maxLife, {});
  await lab.step(90);
  moments.push(pictureBoss(lab, boss, 'phase 3: kneeling', ['the bearers down on their knees, tolling every 3 s']));
  lines.push(`pictures: ${moments.length} moments (out/probes/boss/sheet.png)`);
  return moments;
}

/** `lab boss`: each part asked for, in turn. */
export async function boss(lab: Lab, options: BossOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const run: Record<Exclude<BossPart, 'pictures'>, typeof ladder> = { ladder, phases, toll, chains, compiles, ttk };
  const moments: Pictured[] = [];
  const was = G.arena.biome;
  try {
    for (const part of options.parts ?? BOSS_PARTS) {
      if (part === 'pictures') moments.push(...await pictures(lab, options, lines));
      else await run[part](lab, options, lines, problems);
    }
  } finally {
    if (G.arena.biome !== was) G.arena.setBiome(was);
  }
  if (options.canary) {
    const caught = problems.length;
    lines.push(`canary: ${caught} faults caught`);
    const judged = (options.parts ?? BOSS_PARTS).filter((part) => part !== 'pictures');
    return { text: lines.join('\n'), problems: canaryMissed(judged, problems), moments };
  }
  return { text: lines.join('\n'), problems, moments };
}

/** With the canary: the parts whose planted fault went uncaught (each part's problems name it). */
function canaryMissed(parts: BossPart[], problems: string[]): string[] {
  const missed = parts.filter((part) => !problems.some((problem) => problem.startsWith(`${part}:`) || (part === 'ladder' && problem.includes(' wave '))));
  return missed.map((part) => `canary: the ${part} part's planted fault went uncaught`);
}
