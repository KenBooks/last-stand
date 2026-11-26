// The bosses' fights (tools/lab `boss`): the ladder of each battleground, a boss standing its ground, and how long
// each boss takes the hero to bring down.
//
// - `ladder`: each battleground's boss waves set off as the game sets them off (the run's wave and its timer), the boss
//   the wave sends read off the run (`RunState.boss`) and the banner's line, against its ladder's rung for the wave.
// - `stand`: the hero walked into a boss: it gives way a hair, and he's held off its body.
// - `ttk`: the hero's basic attack held on a boss held still, its damage a second, and from it the time each boss
//   takes at the wave it comes on (the Colossus at 5, the Ossuary Cantor's encounter and the Rootmother at 10).
// - The Cantor's encounter, its guards and their tolls: bossEncounter.ts's parts.
// - the Rootmother's parts (`page/bossRootmother.ts`, `bossRootBurrow.ts`, `bossRootBranches.ts`, `bossRootCage.ts`):
//   `rootPhases`, `vines`, `pods`, `heart`, `rootBurrow`, `branches`, `rootCage`; `compiles`, every effect of her fight
//   drawn and no pipeline made; `threat` (`bossThreat.ts`) and her pictures and costs by name.
//
// `--canary` plants a fault each part must catch: a rung slipped onto the Crypt's ladder, a boss that yields as a
// small foe does, and an attack that deals nothing (and bossEncounter.ts's).
import * as THREE from 'three';
import type { Fixture, Lab, Pictured, Report } from './lab';
import { ENCOUNTER_PARTS, ENCOUNTER_PICTURES, encounterPart, encounterTtk, type EncounterPart } from './bossEncounter';
import type { Enemy } from '../../../src/entities/enemy';
import type { BiomeId, BossRung, BossWave } from '../../../src/data/biomes';
import type { EnemyId } from '../../../src/data/enemies';
import { G } from '../../../src/state';
import { BIOMES, BIOME_IDS, bossOfWave } from '../../../src/data/biomes';
import { ENEMIES, SCALING } from '../../../src/data/enemies';
import { WAVES } from '../../../src/data/waves';
import { damageTaken, forgetBeats } from '../../../src/entities/bossKit';
import { fx } from '../../../src/entities/enemyAI';
import { startNextWave } from '../../../src/game/run';
import { pressing } from './cast';
import { ARENA } from '../../../src/data/balance';
import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { heart, pods, rootCompiles, rootLook, rootPhases, rootPictures, rootTtkLines, vines } from './bossRootmother';
import { rootBurrow, rootBurrowPictures } from './bossRootBurrow';
import { threat } from './bossThreat';
import { branchPictures, branches, rootCost } from './bossRootBranches';
import { rootCage, rootCagePictures } from './bossRootCage';
import { rootSurvive, rootThreat } from './bossRootThreat';
import { comboPictures, combos } from './bossRootCombos';
import { podPictures } from './bossRootPods';
import { stagAttackPictures } from './bossStagAttacks';
import { stagBreath } from './bossStagBreath';
import { stagShed } from './bossStagShed';
import { stagCost } from './bossStagCost';
import { stagReach } from './bossStagReach';
import { stagStride, stagStrideCost, stagStridePictures } from './bossStagStride';
import {
  stagCharge, stagClose, stagCompiles, stagCrash, stagMoves, stagPhase2, stagPictures, stagToss, stagTtkLines,
} from './bossStag';

/** The parts the command runs, in order. */
/** the Rootmother's and the Stag of Ash's parts that are judged */
type RootPart = 'rootPhases' | 'vines' | 'pods' | 'heart' | 'rootBurrow' | 'branches' | 'rootCage' | 'threat'
  | 'rootThreat' | 'rootSurvive' | 'combos';
type StagPart = 'stagCharge' | 'stagCrash' | 'stagPhase2' | 'stagToss' | 'stagClose' | 'stagReach' | 'stagBreath'
  | 'stagShed' | 'stagStride';
/** the parts that picture moments for the eye alone, asked for by name */
type PicturePart = 'rootPictures' | 'rootLook' | 'rootBurrowPictures' | 'branchPictures' | 'rootCost'
  | 'rootCagePictures' | 'comboPictures' | 'podPictures' | 'stagPictures' | 'stagMoves' | 'stagStridePictures'
  | 'stagStrideCost' | 'stagAttackPictures' | 'stagCost';
export type BossPart = 'ladder' | 'stand' | 'ttk' | EncounterPart | RootPart | StagPart | PicturePart;
// (`compiles` is one part for every boss: the encounter's, the Rootmother's and the Stag's, after them all)
export const BOSS_PARTS: BossPart[] = [
  'ladder', 'stand', ...ENCOUNTER_PARTS.filter((part) => part !== 'compiles'),
  'rootPhases', 'vines', 'pods', 'heart', 'rootBurrow', 'branches', 'combos', 'rootCage', 'compiles',
  'ttk', 'stagCharge', 'stagCrash', 'stagPhase2', 'stagToss', 'stagClose', 'stagReach', 'stagBreath',
  'stagShed', 'stagStride',
];
const PICTURE_PARTS: BossPart[] = [
  ...ENCOUNTER_PICTURES, 'rootPictures', 'rootLook', 'rootBurrowPictures', 'branchPictures', 'rootCost',
  'rootCagePictures', 'comboPictures', 'podPictures', 'stagPictures', 'stagMoves', 'stagStridePictures',
  'stagStrideCost', 'stagAttackPictures', 'stagCost',
];

export interface BossOptions {
  fixture: Fixture;
  /** the parts to run (all by default) */
  parts?: BossPart[];
  /** plant a fault each part must catch */
  canary: boolean;
}

/** where the hero stands (m), off the dais and clear of props */
export const SPOT: [number, number] = [12, 12];
/** how many boss waves of each ladder are set off: twice round the Crypt's */
const RUNGS = 4;
/** the most frames a boss takes to rise, and a wave to start */
const RISE_FRAMES = 200;
const WAVE_FRAMES = 30;
/** how long the hero's attack is held on a boss for its damage a second (s) */
const TTK_HOLD = 8;
/** frames a second on the lab's clock */
export const FPS = 60;

/** `value` written to `digits` places. */
export const fixed = (value: number, digits = 2): string => value.toFixed(digits);

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
export function clearSpot(away: number, radius: number): THREE.Vector3 {
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
export async function standIn(lab: Lab, fixture: Fixture, biome: BiomeId): Promise<void> {
  if (G.arena.biome !== biome) G.arena.setBiome(biome);
  const facing = Math.atan2(-SPOT[0], -SPOT[1]);
  await lab.setup({ at: SPOT, facing, ...fixture });
  // (each set-up starts the game's clock at one time: the last case's warned hits forgotten, or they refuse this one's)
  forgetBeats();
}

/** Boss `kind` risen `away` m from the hero towards the arena's middle, facing him; dazed (thinking nothing) unless
 *  `thinks`. */
export async function bossAt(lab: Lab, kind: EnemyId, away: number, thinks: boolean, wave = 1): Promise<Enemy> {
  const at = clearSpot(away, ENEMIES[kind].radius);
  const boss = lab.spawnFoe(kind, at, { wave });
  await lab.until(() => boss.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
  boss.facing = boss.targetFacing = Math.atan2(G.player.pos.x - boss.pos.x, G.player.pos.z - boss.pos.z);
  boss.dazed = thinks ? 0 : 1e4;
  return boss;
}

// --- the ladder -------------------------------------------------------------------------------------------

/** The exception of `biome`'s holding boss wave `wave`, if one does (data/biomes.ts `bossWaves`). */
function exceptionOn(biome: BiomeId, wave: number): BossWave | undefined {
  return BIOMES[biome].bossWaves?.find((held) => wave >= held.wave && (wave - held.wave) % held.every === 0);
}

/**
 * Each battleground's boss waves set off: the boss the run sends and the banner's line against what the schedule says,
 * worked out here: an exception's boss on its waves, else the ladder's next rung as it ships, the ladder going on only
 * at the waves it holds.
 */
async function ladder(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const crypt = BIOMES.crypt.bosses;
  // (the ladders as they ship, before the canary slips the Thornwood's first boss onto the Crypt's: turned round, a
  // ladder of one rung was the same, and its canary went unseen)
  const shipped = Object.fromEntries(BIOME_IDS.map((biome) => [biome, [...BIOMES[biome].bosses]])) as Record<BiomeId, BossRung[]>;
  if (options.canary) crypt.push(BIOMES.forest.bosses[0]);
  try {
    for (const biome of BIOME_IDS) {
      await standIn(lab, options.fixture, biome);
      lab.letWavesCome();
      const met: string[] = [];
      let held = 0;
      for (let rung = 0; rung < RUNGS; rung++) {
        const wave = WAVES.bossEvery * (rung + 1);
        const sent = await bossOfWaveSent(lab, wave);
        const ladderOf = shipped[biome];
        const wanted: { id: EnemyId; banner: string; short: string; guards?: BossRung['guards'] } = exceptionOn(biome, wave)
          ?? ladderOf[held++ % ladderOf.length];
        met.push(`wave ${wave} ${sent.boss ?? 'none'}`);
        if (sent.boss !== wanted.id) problems.push(`${biome} wave ${wave}: the run sent ${sent.boss ?? 'no boss'}, its schedule's is ${wanted.id}`);
        const guards = Array.from({ length: wanted.guards?.count ?? 0 }, () => wanted.guards!.id);
        if (sent.guards.join() !== guards.join()) {
          problems.push(`${biome} wave ${wave}: the run sent guards [${sent.guards.join(', ')}], its schedule's are [${guards.join(', ')}]`);
        }
        if (guards.length) met[met.length - 1] += ` with ${guards.length} ${guards[0]}`;
        if (!sent.banner.includes(wanted.banner)) problems.push(`${biome} wave ${wave}: the banner said "${sent.banner}", not its boss's line "${wanted.banner}"`);
        const label = bossOfWave(biome, wave)?.short;
        if (label !== wanted.short) problems.push(`${biome} wave ${wave}: the Continue button would name ${label}`);
      }
      lines.push(`ladder: ${biome}: ${met.join(', ')}`);
    }
  } finally {
    if (options.canary) crypt.pop();
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

// --- standing its ground -----------------------------------------------------------------------------------

/** how long the hero walks into the boss (s), and how far it may give way meanwhile (m) */
const PRESS_FOR = 3;
const GIVES_MOST = 0.02;

/**
 * The hero walked into the Colossus for `PRESS_FOR` s (from play: "you should not be able to move the boss by just
 * walking towards it"): how far it gave way, and that he reached it and was held off it. Every foe yielded the whole
 * overlap, and a boss was walked across the arena.
 */
async function stand(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await bossAt(lab, 'colossus', 6, false);
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

/** The time each boss takes the hero at the wave it comes on, from his basic attack's damage a second. */
async function ttk(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const dps = await damageASecond(lab, options);
  const cls = G.player.cls.id;
  if (!(dps > 0)) {
    problems.push(`ttk: the ${cls}'s basic attack dealt nothing to the boss`);
    return;
  }
  const colossus = ENEMIES.colossus.life * SCALING.life(5);
  lines.push(`ttk: ${cls}: ${fixed(dps, 0)} damage a second with ${G.player.skillAt('mouse0')!.def.name} and the starting gear`);
  lines.push(`ttk: the Colossus at wave 5 (${fixed(colossus, 0)} life): ${fixed(colossus / dps, 0)} s`);
  encounterTtk(dps, colossus / dps, lines);
  lines.push(...rootTtkLines(dps));
  lines.push(...stagTtkLines(dps));
}

/** Every effect of the Cantor's encounter, of the Rootmother's fight and of the Stag's drawn: no pipeline made. */
async function compiles(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await encounterPart('compiles', lab, options, lines, problems);
  const rooted = await rootCompiles(lab, options);
  lines.push(`compiles: ${rooted} pipelines made drawing the Rootmother's vine, pods, thorns, cracks, eruption, `
    + 'spores, heart, canopy and root cage');
  if (rooted > 0) problems.push(`compiles: ${rooted} pipelines made in the Rootmother's fight`);
  const ash = await stagCompiles(lab, options);
  lines.push(`compiles: ${ash} programs compiled drawing the Stag of Ash's lane, gallop, fire, gore, crash, sweep, `
    + 'toss, embers and phase');
  if (ash > 0) problems.push(`compiles: ${ash} programs compiled in the Stag of Ash's fight`);
}

/**
 * The `compiles` canary's plant: a mesh drawn a few frames at `at` in a blending, side and depth no other material has
 * together (the engine's pipelines are set apart by those: a flat-shaded Phong of its own made none, `twins.ts`).
 * `multiplied` blends it as light already multiplied by its alpha (the flames' blending) in place of added: a plant of
 * its own for a second fight in one part (the Rootmother's after the Cantor's encounter, whose plant is the added one
 * and made its pipeline first, so hers read none).
 */
export async function drawOdd(lab: Lab, at: THREE.Vector3, multiplied = false): Promise<void> {
  const material = new THREE.MeshBasicMaterial({
    color: 0x123456,
    blending: multiplied ? THREE.CustomBlending : THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: true,
  });
  if (multiplied) {
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
  }
  const odd = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1), material);
  odd.position.copy(at).setY(2);
  G.scene.add(odd);
  await lab.step(4);
  G.scene.remove(odd);
  odd.geometry.dispose();
  material.dispose();
}

/** `lab boss`: each part asked for, in turn. */
export async function boss(lab: Lab, options: BossOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const run: Record<'ladder' | 'stand' | 'ttk' | 'compiles' | RootPart | StagPart, typeof ladder> = {
    ladder, stand, rootPhases, vines, pods, heart, rootBurrow, branches, rootCage,
    compiles, ttk, stagCharge, stagCrash, stagPhase2, stagToss, stagClose, stagReach,
    stagBreath, stagShed, stagStride, threat,
    rootThreat, rootSurvive, combos,
  };
  const moments: Pictured[] = [];
  const was = G.arena.biome;
  try {
    for (const part of options.parts ?? BOSS_PARTS) {
      if (part === 'rootPictures') moments.push(...await rootPictures(lab, options, lines));
      else if (part === 'rootLook') moments.push(...await rootLook(lab, options, lines, problems));
      else if (part === 'rootBurrowPictures') moments.push(...await rootBurrowPictures(lab, options, lines));
      else if (part === 'branchPictures') moments.push(...await branchPictures(lab, options, lines));
      else if (part === 'rootCost') await rootCost(lab, options, lines);
      else if (part === 'rootCagePictures') moments.push(...await rootCagePictures(lab, options, lines));
      else if (part === 'comboPictures') moments.push(...await comboPictures(lab, options, lines));
      else if (part === 'podPictures') moments.push(...await podPictures(lab, options, lines));
      else if (part === 'stagStridePictures') moments.push(...await stagStridePictures(lab, options, lines));
      else if (part === 'stagStrideCost') await stagStrideCost(lab, options, lines);
      else if (part === 'stagCost') await stagCost(lab, options, lines);
      else if (part === 'stagPictures') moments.push(...await stagPictures(lab, options, lines, problems));
      else if (part === 'stagMoves') moments.push(...await stagMoves(lab, options));
      else if (part === 'stagAttackPictures') moments.push(...await stagAttackPictures(lab, options, lines));
      else if (part in run) await run[part as keyof typeof run](lab, options, lines, problems);
      else moments.push(...await encounterPart(part as EncounterPart, lab, options, lines, problems));
    }
  } finally {
    if (G.arena.biome !== was) G.arena.setBiome(was);
  }
  if (options.canary) {
    const caught = problems.length;
    lines.push(`canary: ${caught} faults caught`);
    const judged = (options.parts ?? BOSS_PARTS)
      .filter((part) => !PICTURE_PARTS.includes(part) && !ENCOUNTER_PICTURES.includes(part as EncounterPart));
    return { text: lines.join('\n'), problems: canaryMissed(judged, problems), moments };
  }
  return { text: lines.join('\n'), problems, moments };
}

/** With the canary: the parts whose planted fault went uncaught (each part's problems name it). */
function canaryMissed(parts: BossPart[], problems: string[]): string[] {
  const missed = parts.filter((part) => !problems.some((problem) => problem.startsWith(`${part}:`) || (part === 'ladder' && problem.includes(' wave '))));
  return missed.map((part) => `canary: the ${part} part's planted fault went uncaught`);
}
