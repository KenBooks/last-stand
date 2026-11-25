// The Rootmother's fight (tools/lab `boss`, its parts wired in page/boss.ts;
// entities/rootmother.ts).
// She grows out of the arena's middle and the hero stands at the boss lab's spot, 17 m off, facing her.
//
// - `rootPhases`: her life taken to a hundredth over and under her second phase's share: in the first, then the
//   second with its banner, the canopy closed over the Thornwood a few seconds after (`Arena.shade` near 1) and open
//   again after her death.
// - `vines`: one creeping vine sent at the hero standing still: it must reach and hold him (`Player.rooted`) for its
//   `hold` (within a few frames); with a bow (`--class ranger`), a shot into the vine holding him must cut it, letting
//   him go within a quarter of a second, and the vine withering.
// - `pods`: her pods flung (as many as she flings, each landing `near`..`far` from her and `clear` of the hero), one
//   left alone bursting into its brood of Thornlings `hatch` s after it rose, and one struck by the hero's basic attack
//   (an arrow, a blow, a bolt) popped by it before it can hatch, nothing hatching from it.
// - `heart`: in her second phase, an eruption at the hero standing still: its hurt landing no sooner than its warning
//   after the earth began to crack, then her heart open for its `heart` s at `taken` times the damage, nothing
//   attacked meanwhile, and shut again after.
//
// `rootPictures` (asked for alone): her fight's moments, a sheet for the eye. `--canary` plants a fault in each part:
// her second phase's share moved, a vine that reaches no one, pods that never hatch, a heart that never opens.
import * as THREE from 'three';
import type { Lab, Pictured, ViewName } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { ENEMIES, SCALING } from '../../../src/data/enemies';
import { ROOTMOTHER } from '../../../src/data/foes/rootmother';
import { spotTaken } from '../../../src/entities/bossKit';
import { CREEPERS, ROUNDS, type Attack } from '../../../src/entities/rootmother';
import { fx } from '../../../src/entities/enemyAI';
import { holdFor, pressing, skillNamed, type BoundSkill } from './cast';
import { MODELS } from '../../../src/entities/models/index';
import { drawOdd, fixed, standIn, type BossOptions } from './boss';
import { PIPELINES } from '../../../src/engine/pipelinesAside';

import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';

/** frames a second on the lab's clock (boss.ts imports this module: its own constant isn't made yet as this loads) */
const FPS = 60;
/** frames on the lab's clock in seconds */
const secondsOf = (frames: number): number => frames / FPS;

/** where she grows: the arena's middle */
const MIDDLE = new THREE.Vector3(0, 0, 0);
/** the most frames she takes to rise, a vine to reach the hero, a pod to land and rise, an attack to land */
const RISE_FRAMES = 200;
const VINE_FRAMES = 8 * FPS;
const ATTACK_FRAMES = 5 * FPS;
/** how far off a vine's `hold` its hold may be (frames: the one it catches, the one it lets go) */
const HOLD_SLACK = 4;
/** within how many frames of the loose a shot vine must let him go, and how many frames into its hold the bow is let
 *  go, drawn as far as it is (held for its whole draw, the arrow left after the hold's own end, 139 frames on, and the
 *  part passed testing nothing: as `throws`' shot, `SHOT.loosedAfter`) */
const FREED_WITHIN = 15;
const LOOSED_AFTER = 10;
/** in `vines`' shot, how far back towards her along the vine from where it holds him the bow is aimed (m) */
const SHOT_BACK = 2.5;
/** how far from her middle the hero stands for her measures (m), and the step round her a clear spot is looked
 *  for in */
const STAND_OFF = 14;
const STAND_STEP = Math.PI / 24;
/** how far off its `hatch` a pod may burst (s), and off its `heart` her window may be */
const HATCH_SLACK = 0.15;
const HEART_SLACK = 0.1;
/** how far before the hero a pod is set for his basic attack (m): a blow's reach, a shot's */
const POP_MELEE = 1.7;
const POP_SHOT = 7;
/** how long the hero's basic attack is held on a pod before it must be popped (s) */
const POP_HOLD = 3;
/** the share of her life over and under which `heart` begins (her second phase) */
const LATE = 0.45;

const flat = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * The hero set up in the Thornwood `STAND_OFF` m from its middle, facing it, at the first spot round her with nothing
 * between them: on the diagonal the measures' other spot stands on, a stump between him and her took the arrows a
 * vine or a pod was shot with.
 */
export async function standClear(lab: Lab, options: BossOptions): Promise<void> {
  await standIn(lab, options.fixture, 'forest');
  for (let way = 0; way < Math.PI * 2; way += STAND_STEP) {
    const x = Math.sin(way) * STAND_OFF, z = Math.cos(way) * STAND_OFF;
    const at = new THREE.Vector3(x, 0, z);
    if (inObstacle(at, 1) || !lineClear(x, z, 0, 0, 0.6)) continue;
    await lab.setup({ ...options.fixture, at: [x, z], facing: Math.atan2(-x, -z) });
    return;
  }
  throw new Error(`lab: no spot ${STAND_OFF} m from the Thornwood's middle with a clear line to it`);
}

/** The Rootmother grown in the arena's middle, facing the hero; dazed (thinking nothing) until a measure lets her. The
 *  set-up's hold of the wave let go, so what she brings (pods, Thornlings) stays, and no wave comes. */
export async function rootmother(lab: Lab): Promise<Enemy> {
  const boss = lab.spawnFoe('rootmother', MIDDLE.clone());
  lab.letWavesCome();
  await lab.until(() => boss.spawning <= 0, RISE_FRAMES, 'the Rootmother never rose');
  boss.facing = boss.targetFacing = Math.atan2(G.player.pos.x, G.player.pos.z);
  boss.dazed = 1e4;
  // (her heart held shut but where a measure opens it: its minute would come in the middle of the others)
  boss.brain.heartT = 1e9;
  // (and her burrow but where a measure lets her: the hero stands 14 m off, past her `far`, and she'd go under in the
  // middle of what's measured; its wait and the far hero's count put past any case, `rootBurrow` setting them back)
  holdBurrow(boss);
  return boss;
}

/** Her burrow held off (entities/rootBurrow.ts): her wait to burrow, and the time she counts the hero far, put past
 *  any case. */
export function holdBurrow(boss: Enemy): void {
  boss.brain.burrowT = 1e9;
  boss.brain.farT = -1e9;
}

/** Her next attack forced to be `name` (her round's turn set for it) and let think: she begins it at once. */
export function nextIs(boss: Enemy, name: Attack): void {
  if (name === 'erupt') boss.brain.attacks = 0;
  // (her round's index before it, by her phase's round: her rounds change as attacks are added)
  else boss.brain.round = ROUNDS[Math.min(2, boss.bossPhase)].indexOf(name) - 1;
  if (name !== 'erupt') boss.brain.attacks = 1;
  boss.dazed = 0;
  boss.cd = 0;
}

/** Each frame of a measure: after the attack she was let begin, nothing more from her (her cooldown held out), and her
 *  spores held off. */
export function holdHerAfter(boss: Enemy, name: string): void {
  if (boss.action?.name === name || boss.weak > 0) boss.cd = Math.max(boss.cd, 99);
  boss.brain.sporeT = 1e9;
}

// --- her phases ---------------------------------------------------------------------------------------------

/** Her life over and under her second phase's share: its phase, its banner, and the canopy closing and opening. */
export async function rootPhases(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'forest');
  const kit = ENEMIES.rootmother.bossKit!;
  const share = kit.phases[1].below;
  if (options.canary) kit.phases[1].below = share - 0.2;
  try {
    const boss = await rootmother(lab);
    const seen: string[] = [];
    for (const [side, at] of [['over', share + 0.01], ['under', share - 0.01]] as const) {
      boss.takeDamage(boss.life - at * boss.maxLife, {});
      await lab.step(2, () => ({}), () => holdHerAfter(boss, ''));
      const wanted = side === 'over' ? 0 : 1;
      seen.push(`${fixed(at * 100, 0)}% phase ${boss.bossPhase + 1}`);
      if (boss.bossPhase !== wanted) {
        problems.push(`rootPhases: at ${fixed(at * 100, 0)}% of her life she was in phase ${boss.bossPhase + 1}, `
          + `not ${wanted + 1}`);
      }
      const banner = document.querySelector('#banner .b-sub')?.textContent ?? '';
      if (side === 'under' && banner !== kit.phases[1].banner) {
        problems.push(`rootPhases: her second phase began with the banner "${banner}"`);
      }
    }
    await lab.step(4 * FPS, () => ({}), () => holdHerAfter(boss, ''));
    const closed = G.arena.shade;
    boss.takeDamage(boss.life + 1, {});
    await lab.step(4 * FPS);
    const open = G.arena.shade;
    lines.push(`rootPhases: ${seen.join(', ')}; the canopy ${fixed(closed * 100, 0)}% closed 4 s into it, `
      + `${fixed(open * 100, 0)}% 4 s after her death`);
    if (boss.bossPhase >= 1 && closed < 0.95) {
      problems.push(`rootPhases: the canopy only ${fixed(closed * 100, 0)}% closed 4 s into her second phase`);
    }
    if (open > 0.05) problems.push(`rootPhases: the canopy still ${fixed(open * 100, 0)}% closed 4 s after her death`);
  } finally {
    kit.phases[1].below = share;
    G.arena.setShade(0, true);
  }
}

// --- the vines ----------------------------------------------------------------------------------------------

/** The bow's shot, where the hero has one. */
function bowShot(): BoundSkill | null {
  try { return skillNamed('nockShot'); } catch { return null; }
}

/** What became of a vine at the hero: when it held him and let go, when the arrow left, and whether the vine was
 *  cut. */
interface VineCase {
  heldFrom: number;
  heldTo: number;
  loosedAt: number;
  cut: boolean;
  frames: number;
  /** where she stood as the vine held him, as it let him go, and at the end */
  herAtHeld: THREE.Vector3 | null;
  herAtFree: THREE.Vector3 | null;
  herAtEnd: THREE.Vector3 | null;
}

/** One vine sent at the hero standing still; `shoot` him shooting into it once it holds him. */
async function vineAt(lab: Lab, options: BossOptions, bow: BoundSkill | null): Promise<VineCase> {
  await standClear(lab, options);
  const boss = await rootmother(lab);
  const hero = G.player;
  const result: VineCase = {
    heldFrom: -1, heldTo: -1, loosedAt: -1, cut: false, frames: 0, herAtHeld: null, herAtFree: null, herAtEnd: null,
  };
  let aim: THREE.Vector3 | null = null, pressFrom = -1;
  nextIs(boss, 'vines');
  const press = bow ? Math.round(holdFor(bow.def) * FPS) : 0;
  await lab.step(VINE_FRAMES, (f) => {
    if (!bow || result.heldFrom < 0) return {};
    if (!aim) {
      // (aimed at the floor a little back towards her along the vine that holds him: it came at him across the clear
      // line between them)
      const towardHer = MIDDLE.clone().sub(hero.pos).setY(0).normalize();
      aim = hero.pos.clone().addScaledVector(towardHer, SHOT_BACK).setY(0);
      pressFrom = f;
    }
    return pressing(bow.key, aim, f - pressFrom < Math.min(press, LOOSED_AFTER));
  }, (f) => {
    holdHerAfter(boss, 'vines');
    result.frames = f;
    if (hero.rooted && result.heldFrom < 0) {
      result.heldFrom = f;
      result.herAtHeld = boss.pos.clone();
    }
    if (result.heldFrom >= 0 && result.heldTo < 0 && !hero.rooted) {
      result.heldTo = f;
      result.herAtFree = boss.pos.clone();
    }
    result.herAtEnd = boss.pos.clone();
    if (bow && result.loosedAt < 0 && hero.casting?.fired) result.loosedAt = f;
    if ([...CREEPERS.values()].some((c) => c.cut >= 0)) result.cut = true;
  });
  return result;
}

/** A vine at the hero standing still (held for its `hold`), and with a bow, shot through as it holds him. */
export async function vines(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const v = ROOTMOTHER.vines;
  const count = v.count, reach = v.reach;
  v.count = [1, 1];
  if (options.canary) v.reach = -10;
  try {
    const stood = await vineAt(lab, options, null);
    const held = stood.heldFrom < 0 ? 0 : (stood.heldTo < 0 ? stood.frames : stood.heldTo) - stood.heldFrom;
    const after = `held ${fixed(secondsOf(stood.heldFrom))} s after she began, for ${held} frames `
      + `(its hold ${v.hold * FPS})`;
    lines.push(`vines: stood still: ${stood.heldFrom < 0 ? 'never held' : after}`);
    if (stood.heldFrom < 0) problems.push('vines: the vine never held the hero standing still');
    else if (Math.abs(held - v.hold * FPS) > HOLD_SLACK) {
      problems.push(`vines: held him ${held} frames, not its hold of ${v.hold * FPS}`);
    }
    stoodProblems(stood, lines, problems);
    const bow = bowShot();
    if (!bow) {
      lines.push(`vines: shot: not run (the ${G.player.cls.id} has no bow: --class ranger)`);
      return;
    }
    const shot = await vineAt(lab, options, bow);
    const freedIn = shot.heldTo < 0 ? Infinity : shot.heldTo - shot.loosedAt;
    const freed = Number.isFinite(freedIn) ? `${freedIn} frames after the loose` : 'never';
    lines.push(`vines: shot: held at ${shot.heldFrom}, the arrow loosed at ${shot.loosedAt}, `
      + `${shot.cut ? 'the vine cut' : 'the vine whole'}, let go ${freed}`);
    if (shot.heldFrom < 0) problems.push('vines: the vine never held the ranger');
    else if (shot.loosedAt < 0) problems.push('vines: the arrow was never loosed at the vine');
    else if (shot.heldTo >= 0 && shot.heldTo <= shot.loosedAt) {
      // (the measure's own timing: the arrow must leave while the vine holds him, or the cut is never tested)
      problems.push(`vines: the arrow left at frame ${shot.loosedAt}, after the vine let him go (${shot.heldTo})`);
    } else {
      if (!shot.cut) problems.push('vines: the arrow left the vine whole');
      if (freedIn > FREED_WITHIN) problems.push(`vines: the shot vine let him go ${freed}`);
    }
  } finally {
    v.count = count;
    v.reach = reach;
  }
}

/** the most she may move while a vine holds him and after (m): she never walks, and the hold is too short for her
 *  burrow to come */
const STILL_HELD = 0.01;

/** Her standing where she stands while the vine held him and after (she never walks: entities/rootBurrow.ts). */
function stoodProblems(stood: VineCase, lines: string[], problems: string[]): void {
  if (!stood.herAtHeld || !stood.herAtEnd) return;
  const moved = flat(stood.herAtHeld, stood.herAtEnd);
  lines.push(`vines: she moved ${fixed(moved)} m while he was held and after`);
  if (moved > STILL_HELD) problems.push(`vines: she moved ${fixed(moved)} m while the vine held him`);
}

// --- the pods -----------------------------------------------------------------------------------------------

const podsAlive = (): Enemy[] => G.enemies.filter((e) => e.alive && e.type === 'seedpod');
const thornlings = (): number => G.enemies.filter((e) => e.alive && e.type === 'thornling').length;

/** Her pods flung, one left to hatch, one popped by the hero's basic attack. */
export async function pods(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const s = ROOTMOTHER.seeds;
  const hatch = s.hatch;
  if (options.canary) s.hatch = 1e4;
  try {
    await flung(lab, options, lines, problems);
    await hatched(lab, options, lines, problems, hatch);
  } finally {
    s.hatch = hatch;
  }
  await popped(lab, options, lines, problems);
}

/** Her pods flung: as many as she flings, each where it should land. */
async function flung(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const s = ROOTMOTHER.seeds;
  await standClear(lab, options);
  const boss = await rootmother(lab);
  nextIs(boss, 'seeds');
  await lab.step(ATTACK_FRAMES, () => ({}), () => holdHerAfter(boss, 'seeds'));
  const landed = podsAlive();
  const spots = landed.map((pod) => `${fixed(flat(pod.pos, boss.pos), 1)} m out`);
  lines.push(`pods: flung ${landed.length} (of ${s.count}): ${spots.join(', ')}`);
  if (landed.length !== s.count) problems.push(`pods: ${landed.length} pods landed of the ${s.count} she flings`);
  for (const pod of landed) {
    const out = flat(pod.pos, boss.pos);
    if (out < s.near - 0.1 || out > s.far + 0.1) {
      problems.push(`pods: a pod landed ${fixed(out, 1)} m from her, outside ${s.near} to ${s.far}`);
    }
  }
}

/** A pod left alone: it must burst into its brood `hatch` s (as the game ships it) after it rose. */
async function hatched(lab: Lab, options: BossOptions, lines: string[], problems: string[],
  hatch: number): Promise<void> {
  const s = ROOTMOTHER.seeds;
  await standClear(lab, options);
  lab.letWavesCome();
  const at = G.player.pos.clone().multiplyScalar(0.6);
  const pod = lab.spawnFoe('seedpod', at);
  await lab.until(() => pod.spawning <= 0, RISE_FRAMES, 'the pod never rose');
  const before = thornlings();
  let burstAt = -1;
  await lab.step(Math.round((hatch + 1) * FPS), () => ({}), (f) => {
    if (burstAt < 0 && !pod.alive) burstAt = f + 1;
  });
  const brood = thornlings() - before;
  const burst = burstAt < 0 ? `never burst in ${hatch + 1} s` : `burst ${fixed(secondsOf(burstAt))} s after it rose`;
  lines.push(`pods: left alone: ${burst}, ${brood} Thornlings`);
  if (burstAt < 0) problems.push(`pods: a pod left alone never burst in ${hatch + 1} s`);
  else {
    const off = Math.abs(secondsOf(burstAt) - hatch);
    if (off > HATCH_SLACK) {
      problems.push(`pods: a pod burst ${fixed(secondsOf(burstAt))} s after it rose, not ${hatch}`);
    }
    if (brood !== s.brood) problems.push(`pods: a pod burst into ${brood} Thornlings, not ${s.brood}`);
  }
}

/** A pod before the hero, his basic attack held on it: popped, and nothing hatched from it. */
async function popped(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standClear(lab, options);
  lab.letWavesCome();
  const hero = G.player;
  const attack = hero.skillAt('mouse0')!.def;
  const melee = !attack.draw && !attack.speed;
  const ahead = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const pod = lab.spawnFoe('seedpod', hero.pos.clone().addScaledVector(ahead, melee ? POP_MELEE : POP_SHOT).setY(0));
  await lab.until(() => pod.spawning <= 0, RISE_FRAMES, 'the pod never rose');
  const before = thornlings();
  const aim = pod.pos.clone().setY(0.5);
  const cycle = attack.draw ? Math.round((attack.draw + 0.1) * FPS) + 1 : 0;
  let poppedAt = -1;
  const life = pod.life;
  await lab.step(POP_HOLD * FPS, (f) => {
    hero.facing = Math.atan2(pod.pos.x - hero.pos.x, pod.pos.z - hero.pos.z);
    hero.energy = hero.stats.maxEnergy;
    return pressing('mouse0', aim, poppedAt < 0 && (cycle === 0 || f % cycle !== cycle - 1));
  }, (f) => {
    if (poppedAt < 0 && !pod.alive) poppedAt = f + 1;
  });
  const brood = thornlings() - before;
  const fate = poppedAt < 0 ? 'never popped' : `popped ${fixed(secondsOf(poppedAt))} s into the hold`;
  lines.push(`pods: struck by ${attack.name}: ${fate} (its life ${fixed(life, 0)}), ${brood} Thornlings`);
  if (poppedAt < 0) problems.push(`pods: the ${hero.cls.id}'s ${attack.name} never popped a pod in ${POP_HOLD} s`);
  if (brood > 0) problems.push(`pods: ${brood} Thornlings came from a pod the hero popped`);
}

// --- her heart ----------------------------------------------------------------------------------------------

/** how soon her heart is brought to open in `heart` (s: it opens `first` s after she rises, too long to wait for) */
const HEART_SOON = 1;
/** how far off its share of the damage a shot in her heart may be against one at her flank (the rolls' spread) */
const SPOT_SLACK = 0.2;
/** where the ranger's shots are aimed at her flank in `heart`, across from her heart's middle (m: on her trunk,
 *  past the spot's width) */
const FLANK = 1.25;
/** the banner's line as her heart opens (entities/rootmother.ts) */
const HEART_LINE = 'Her heart opens';

/** Points on her in her own frame (`ahead` along her facing, `across` it, `up` over her feet), in the world. */
function onHer(boss: Enemy, ahead: number, across: number, up: number): THREE.Vector3 {
  const sin = Math.sin(boss.facing), cos = Math.cos(boss.facing);
  const x = boss.pos.x + sin * ahead + cos * across, z = boss.pos.z + cos * ahead - sin * across;
  return new THREE.Vector3(x, boss.obj.position.y + up, z);
}

/** What became of her heart's opening: when it opened, its window, the banner's line, whether she attacked through
 *  it, the pods she flung, and the shots' damage at her flank and in her heart. */
interface HeartCase {
  openedAt: number;
  window: number;
  banner: string;
  attacked: boolean;
  pods: number;
  flank: number[];
  inHeart: number[];
}

/**
 * Her heart opening on its time (brought near): open `open` s, its banner, nothing attacked through it and `pods`
 * pods flung; a point in her heart taking the spot's `taken`, her flank and her back none, and none once it's shut.
 * With a bow, shots at her flank then in her heart through the window: those in it dealing `taken` times as much.
 */
export async function heart(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const h = ROOTMOTHER.heart, spot = ENEMIES.rootmother.bossKit!.weak!.spot!;
  const open = h.open;
  if (options.canary) h.open = 0;
  try {
    await standClear(lab, options);
    const boss = await rootmother(lab);
    const bow = bowShot();
    const opened = await heartOpening(lab, boss, open, null);
    const spots = spotReadings(boss, opened);
    lines.push(`heart: opened ${fixed(secondsOf(opened.openedAt))} s in, for ${fixed(opened.window, 1)} s, the banner `
      + `"${opened.banner}", ${opened.attacked ? 'attacking' : 'attacking nothing'}, ${opened.pods} pods flung; `
      + `${spots.text}`);
    if (opened.openedAt < 0) problems.push('heart: her heart never opened');
    if (Math.abs(opened.window - open) > HEART_SLACK) {
      problems.push(`heart: her heart was open ${fixed(opened.window)} s, not ${open}`);
    }
    if (opened.openedAt >= 0 && !opened.banner.includes(HEART_LINE)) {
      problems.push(`heart: the banner said "${opened.banner}" as her heart opened`);
    }
    if (opened.attacked) problems.push('heart: she attacked with her heart open');
    if (opened.pods !== h.pods) problems.push(`heart: she flung ${opened.pods} pods through it, not ${h.pods}`);
    problems.push(...spots.problems);
    if (bow) {
      // (in a second opening, her pods held back: flung between him and her, they took the arrows)
      const pods = h.pods;
      h.pods = 0;
      try {
        shotProblems(await heartOpening(lab, boss, open, bow), spot.taken, lines, problems);
      } finally {
        h.pods = pods;
      }
    } else lines.push(`heart: shots in it: not run (the ${G.player.cls.id} has no bow: --class ranger)`);
    await eruption(lab, options, lines, problems);
  } finally {
    h.open = open;
    G.arena.setShade(0, true);
  }
}

/** Her heart brought to open soon and followed through its window and past it; with a bow, two shots at her flank
 *  and the rest in her heart while it's open, his crits held off (their spread would swamp the share). */
async function heartOpening(lab: Lab, boss: Enemy, open: number, bow: BoundSkill | null): Promise<HeartCase> {
  const hero = G.player, crit = hero.stats.crit;
  const result: HeartCase = { openedAt: -1, window: 0, banner: '', attacked: false, pods: 0, flank: [], inHeart: [] };
  const seen = new Set<Enemy>();
  const take = boss.takeDamage.bind(boss);
  boss.takeDamage = (amount, info) => {
    if (boss.weak > 0 && info?.by) (result.flank.length < 2 ? result.flank : result.inHeart).push(amount);
    return take(amount, info);
  };
  boss.brain.heartT = HEART_SOON;
  boss.dazed = 0;
  const press = bow ? Math.round(holdFor(bow.def) * FPS) + 2 : 0;
  try {
    await lab.step(Math.round((HEART_SOON + open + 2) * FPS), (f) => {
      hero.stats.crit = 0;
      if (!bow || result.openedAt < 0 || boss.weak <= 0) return {};
      // (each shot drawn full and loosed: two at her flank, the rest in her heart)
      const aim = result.flank.length < 2 ? onHer(boss, 1.6, FLANK, 1.75) : onHer(boss, 1.8, 0, 1.75);
      return pressing(bow.key, aim, (f - result.openedAt) % press !== press - 1);
    }, (f) => {
      boss.brain.sporeT = 1e9;
      if (result.openedAt < 0 && boss.weak > 0) {
        result.openedAt = f;
        result.window = boss.weak;
        result.banner = document.querySelector('#banner .b-sub')?.textContent ?? '';
      }
      // (her cooldown let run out through the window, as it would: only her heart holds her)
      if (boss.weak > 0) boss.cd = 0;
      else boss.cd = Math.max(boss.cd, 99);
      if (boss.weak > 0.05 && boss.action) result.attacked = true;
      for (const e of G.enemies) if (e.type === 'seedpod') seen.add(e);
    });
  } finally {
    boss.takeDamage = take;
    hero.stats.crit = crit;
  }
  result.pods = seen.size;
  return result;
}

/** Her weak spot read at points on her through her window and after it: in her heart, at her flank, at her back. */
function spotReadings(boss: Enemy, opened: HeartCase): { text: string; problems: string[] } {
  const spot = ENEMIES.rootmother.bossKit!.weak!.spot!;
  const problems: string[] = [];
  const weak = boss.weak;
  boss.weak = 1;
  const inHeart = spotTaken(boss, onHer(boss, 2, 0, spot.y)), flank = spotTaken(boss, onHer(boss, 1.8, FLANK, spot.y));
  const back = spotTaken(boss, onHer(boss, -2.2, 0, spot.y));
  boss.weak = 0;
  const shut = spotTaken(boss, onHer(boss, 2, 0, spot.y));
  boss.weak = weak;
  if (opened.openedAt >= 0 && inHeart !== spot.taken) {
    problems.push(`heart: a point in her open heart took ${inHeart}x, not ${spot.taken}`);
  }
  if (flank !== 1 || back !== 1) {
    problems.push(`heart: her flank took ${flank}x and her back ${back}x through her window`);
  }
  if (shut !== 1) problems.push(`heart: her heart took ${shut}x shut`);
  return { text: `struck in it ${inHeart}x, at her flank ${flank}x, at her back ${back}x, shut ${shut}x`, problems };
}

/** The ranger's shots through her window: those in her heart dealing `taken` times those at her flank. */
function shotProblems(opened: HeartCase, taken: number, lines: string[], problems: string[]): void {
  const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const share = mean(opened.inHeart) / Math.max(1e-6, mean(opened.flank));
  const flank = `${opened.flank.length} at her flank (${fixed(mean(opened.flank), 0)} each)`;
  lines.push(`heart: the bow's shots through it: ${flank}, `
    + `${opened.inHeart.length} in her heart (${fixed(mean(opened.inHeart), 0)} each, ${fixed(share)}x)`);
  if (opened.flank.length < 2 || opened.inHeart.length < 1) {
    problems.push(`heart: the bow's shots never all landed through her window (${opened.flank.length} at her flank, `
      + `${opened.inHeart.length} in her heart)`);
  } else if (Math.abs(share - taken) > SPOT_SLACK) {
    problems.push(`heart: shots in her heart dealt ${fixed(share)}x those at her flank, not ${taken}`);
  }
}

/** An eruption at the hero in her second phase: its hurt no sooner than its warning, and her heart left shut. */
async function eruption(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standClear(lab, options);
  const boss = await rootmother(lab);
  boss.takeDamage(boss.life - LATE * boss.maxLife, {});
  await lab.step(2, () => ({}), () => holdHerAfter(boss, ''));
  const hero = G.player;
  const take = hero.takeDamage.bind(hero);
  let frame = 0, hurtAt = -1, beganAt = -1, opened = false;
  hero.takeDamage = (amount, type, from) => {
    const r = take(amount, type, from);
    if (r && hurtAt < 0) hurtAt = frame;
    return r;
  };
  try {
    nextIs(boss, 'erupt');
    await lab.step(ATTACK_FRAMES, () => ({}), (f) => {
      frame = f + 1;
      holdHerAfter(boss, 'erupt');
      if (beganAt < 0 && boss.action?.name === 'erupt') beganAt = frame;
      if (boss.weak > 0) opened = true;
    });
  } finally {
    hero.takeDamage = take;
  }
  const warn = ENEMIES.rootmother.bossKit!.attacks!.erupt.warn;
  const warned = hurtAt >= 0 && beganAt >= 0 ? secondsOf(hurtAt - beganAt) : -1;
  const hurt = hurtAt < 0 ? 'never hurt him' : `hurt him ${fixed(warned)} s after the earth began to crack`;
  lines.push(`heart: an eruption ${hurt}, her heart ${opened ? 'opened by it' : 'left shut'}`);
  if (beganAt < 0) problems.push('heart: she never began an eruption');
  if (hurtAt < 0) problems.push('heart: the eruption never hurt the hero standing on it');
  else if (warned < warn - 0.05) problems.push(`heart: it hurt him ${fixed(warned)} s into its warning of ${warn} s`);
  if (opened) problems.push('heart: an eruption opened her heart');
}

// --- the programs -------------------------------------------------------------------------------------------

/** Every effect of her fight drawn (a vine, a pod flung and burst, the thorns, the cracks, an eruption, spores, the
 *  canopy closed, a pod, a Thornling): the programs compiled meanwhile. */
export async function rootCompiles(lab: Lab, options: BossOptions): Promise<number> {
  await standIn(lab, options.fixture, 'forest');
  const boss = await rootmother(lab);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(2);
    const before = PIPELINES.made;
    const h = G.player.pos;
    fx('creeper', boss.id, 999001, h.x - 6, h.z - 1, 1.2, 1.6);
    fx('seedFling', 0, 0, h.x - 4, h.z - 3, 0.6);
    fx('thorns', boss.id, 0, 0, ROOTMOTHER.thorns.radius, 1.5, 0);
    fx('cracks', h.x - 3, h.z, 0.6);
    await lab.step(40);
    fx('erupt', boss.id, h.x - 3, h.z, ROOTMOTHER.erupt.radius, 0);
    fx('podBurst', h.x - 4, h.z - 3);
    fx('spores', boss.id, h.x - 5, h.z, 0.5, 0, 3, 0);
    fx('bossWeak', boss.id, 2);
    lab.spawnFoe('seedpod', new THREE.Vector3(h.x - 4, 0, h.z + 3));
    lab.spawnFoe('thornling', new THREE.Vector3(h.x - 5, 0, h.z + 4));
    G.arena.setShade(1, true);
    // (her root cage round the hero, its roots raised and closed, and her great root rising and falling on it)
    fx('cageWarn', boss.id, h.x, h.z, 0.3);
    await lab.step(20);
    fx('cageShut', boss.id, h.x, h.z, 0);
    fx('crushRise', boss.id, h.x, h.z, h.x - 4, h.z, 0.5);
    await lab.step(35);
    fx('crush', boss.id, h.x, h.z, h.x - 4, h.z, 0);
    if (options.canary) await drawOdd(lab, boss.pos);
    await lab.step(60, () => ({}), () => { boss.cd = 99; });
    return PIPELINES.made - before;
  } finally {
    lab.drawing = drawing;
    G.arena.setShade(0, true);
  }
}

// --- time to kill -------------------------------------------------------------------------------------------

/**
 * How long the Rootmother of life `life` takes at `dps`: her heart open `open` s `first` s in and every `every` s
 * after, through which what strikes it takes the spot's `taken` (`inHeart`: every hit of a shooter landed in it; a
 * blow strikes no heart, so none of a sword's).
 */
export function rootTimeToKill(life: number, dps: number, inHeart: boolean): number {
  const h = ROOTMOTHER.heart, taken = inHeart ? ENEMIES.rootmother.bossKit!.weak!.spot!.taken : 1;
  let left = life, time = 0;
  while (left > 0 && time < 3600) {
    const untilOpen = time < h.first ? h.first - time : h.every - h.open;
    const plain = Math.min(left, dps * untilOpen);
    left -= plain;
    time += plain / dps;
    if (left <= 0) break;
    const open = Math.min(left, dps * taken * h.open);
    left -= open;
    time += open / (dps * taken);
  }
  return time;
}

/** The Thornheart at wave 5 and the Rootmother at wave 10, from the hero's damage a second. */
export function rootTtkLines(dps: number): string[] {
  const thornheart = ENEMIES.thornheart.life * SCALING.life(5);
  const root = ENEMIES.rootmother.life * SCALING.life(10);
  const first = thornheart / dps;
  const plain = rootTimeToKill(root, dps, false), heart = rootTimeToKill(root, dps, true);
  return [
    `ttk: the Thornheart at wave 5 (${fixed(thornheart, 0)} life): ${fixed(first, 0)} s`,
    `ttk: the Rootmother at wave 10 (${fixed(root, 0)} life): ${fixed(plain, 0)} s striking her body alone `
      + `(${fixed(plain / first, 2)}x the Thornheart's), ${fixed(heart, 0)} s with every hit through her heart's `
      + `windows in it (${fixed(heart / first, 2)}x)`,
  ];
}

// --- her look -----------------------------------------------------------------------------------------------

/** the most triangles her model may draw (a phone's budget for one boss: the Thornheart's is read beside it) */
const ROOT_TRIANGLES = 45_000;

/** The triangles a model draws, by its meshes' geometries (each drawn once). */
function trianglesOf(root: THREE.Object3D): number {
  const seen = new Set<THREE.BufferGeometry>();
  let count = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    // (a pool kept under a model but not its body, her root cage's: counted apart, `pooledTriangles`)
    if (!mesh.isMesh || seen.has(mesh.geometry) || mesh.userData.pooled) return;
    seen.add(mesh.geometry);
    const geometry = mesh.geometry;
    count += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  return Math.round(count);
}

/** The triangles of the pools a model keeps but its body isn't (her root cage's roots and great root), as drawn: each
 *  mesh's own, however many share a geometry (they're shown at once). */
export function pooledTriangles(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.pooled) return;
    const geometry = mesh.geometry;
    count += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  return Math.round(count);
}

/** A model's triangles, built alone and let go. */
function modelTriangles(kind: 'thornheart' | 'rootmother'): number {
  const model = MODELS[kind]();
  const count = trianglesOf(model.root);
  model.dispose();
  return count;
}

/**
 * Her look for the eye (`rootLook`, asked for alone): as the player meets her, from above and over the shoulder in
 * the Thornwood's light, and close up from each side, her face, her heart shut and open, and her roots meeting the
 * ground; her triangles beside the other bosses', held to `ROOT_TRIANGLES`.
 */
export async function rootLook(lab: Lab, options: BossOptions, lines: string[],
  problems: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'forest');
  const facing = Math.atan2(-PICTURE_SPOT[0], -PICTURE_SPOT[1]);
  const moments: Pictured[] = [];
  // (over the shoulder first: a set-up clears the foes a measure spawned, so she's grown again after it)
  await lab.setup({ ...options.fixture, at: PICTURE_SPOT, facing, view: 'third' });
  const seen = await rootmother(lab);
  await lab.step(20, () => ({}), () => { seen.cd = 99; });
  moments.push(await lab.screen('look 2 over the shoulder', ['as the player meets her over his shoulder']));
  await lab.setup({ ...options.fixture, at: PICTURE_SPOT, facing });
  const boss = await rootmother(lab);
  const close = (label: string, note: string, views: ViewName[], up: number, distance: number): void => {
    moments.push(lab.picture(label, views, [note], { at: boss.pos.clone().setY(up), distance }));
  };
  await lab.step(30);
  moments.push(await lab.screen('look 1 from above', ['as the player meets her, the game\'s own view']));
  close('look 3 whole', 'her whole, from her front, her sides and above', ['back', 'left', 'right', 'above'],
    PICTURE_Y, PICTURE_FROM);
  close('look 4 her face', 'her face and crown', ['back', 'left'], 6.3, 3.2);
  close('look 5 her body', 'her body, where she grows out of the tree', ['back', 'left'], 4.2, 5.5);
  close('look 6 her roots', 'her roots meeting the ground', ['back', 'left'], 0.6, 7);
  close('look 7 heart shut', 'her heart behind its doors', ['back'], 1.9, 4.5);
  boss.weak = 1e4;
  await lab.step(40, () => ({}), () => { boss.cd = 99; });
  close('look 8 heart open', 'her heart open, meditating', ['back', 'left'], 2.6, 7);
  boss.weak = 0;
  const own = trianglesOf(boss.model.root);
  const others = `the Thornheart ${modelTriangles('thornheart')}`;
  lines.push(`rootLook: ${moments.length} moments; her triangles ${own} (${others}; at most ${ROOT_TRIANGLES}); her root `
    + `cage's own ${pooledTriangles(boss.model.root)} (its roots and great root, at no size till a cage places them)`);
  if (own > ROOT_TRIANGLES) problems.push(`rootLook: her model draws ${own} triangles, over ${ROOT_TRIANGLES}`);
  return moments;
}

// --- pictures -----------------------------------------------------------------------------------------------

/** how far off her the close pictures are taken from (m), and the height they're framed on */
const PICTURE_FROM = 16;
const PICTURE_Y = 3.4;
/** where the hero stands for the pictures (m) */
const PICTURE_SPOT: [number, number] = [2.5, -10];

/**
 * Her fight at every stage, for the eye (no verdicts), as the player sees it (the game's view with its HUD and
 * banners) or close up: grown in the middle, a vine's warning and the vines creeping, the hero held, her pods flung
 * and landed, a pod hatching, the thorn ring's warning and its thorns, her second phase's banner and the dark, spores,
 * an eruption's cracks, her heart open, her fall.
 */
export async function rootPictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'forest');
  // (nearer her than the measures' spot, off the diagonal the dais's standing stones stand on: her in the frame)
  await lab.setup({ ...options.fixture, at: PICTURE_SPOT, facing: Math.atan2(-PICTURE_SPOT[0], -PICTURE_SPOT[1]) });
  const boss = await rootmother(lab);
  const moments: Pictured[] = [];
  const close = (label: string, note: string, views: ViewName[] = ['back'], at = boss.pos.clone().setY(PICTURE_Y),
    distance = PICTURE_FROM): void => {
    moments.push(lab.picture(label, views, [note], { at, distance }));
  };
  /** frames until her attack `name` is `share` of the way through */
  const until = (name: string, share: number, what: string): Promise<number> => lab.until(
    () => boss.action?.name === name && boss.action.t / boss.action.dur > share, ATTACK_FRAMES, what);
  const seen = async (label: string, note: string): Promise<void> => { moments.push(await lab.screen(label, [note])); };
  const quiet = (): void => { boss.brain.sporeT = 1e9; };
  await lab.step(60, () => ({}), quiet);
  await seen('1 the Rootmother', 'grown out of a hollow tree in the middle of the Thornwood, as the player sees her');
  close('1 the Rootmother (close)',
    'her lower half all roots, mossy hair with seed pods in it, her heart behind bark doors in the trunk',
    ['back', 'left']);
  // vines
  nextIs(boss, 'vines');
  await until('vines', 0.4, 'she never drew back for the vines');
  close('2 vines warning (close)', 'her arms drawn back, about to drive her roots into the earth');
  await lab.step(80, () => ({}), () => { holdHerAfter(boss, 'vines'); quiet(); });
  await seen('3 vines creeping',
    'vines crawling along the ground towards the hero: step aside, or cut one with an arrow');
  await lab.until(() => G.player.rooted, VINE_FRAMES, 'no vine held the hero', () => ({}));
  await lab.step(20, () => ({}), quiet);
  await seen('4 held', 'a vine reached the hero: held 2 s, coils round his legs');
  close('4 held (close)', 'coils round his legs', ['back', 'left'], G.player.pos.clone().setY(1), 5);
  // pods
  await lab.step(150, () => ({}), quiet);
  nextIs(boss, 'seeds');
  await until('seeds', 0.6, 'she never flung seeds');
  await lab.step(25, () => ({}), () => { holdHerAfter(boss, 'seeds'); quiet(); });
  await seen('5 seeds flung', 'three seed pods flung round the arena, a ring where each will land');
  await lab.step(120, () => ({}), quiet);
  const pod = podsAlive()[0];
  if (pod) {
    close('6 a pod (close)', 'a seed pod rooted where it fell, glowing as it ripens: pop it before it bursts',
      ['back', 'left'], pod.pos.clone().setY(0.6), 3.5);
  }
  await lab.step(Math.round(ROOTMOTHER.seeds.hatch * FPS) + 30, () => ({}), quiet);
  await seen('7 pods hatching', 'pods left alone burst into Thornlings');
  for (const e of G.enemies) if (e.type === 'thornling' || e.type === 'seedpod') e.dazed = 1e4;
  // thorns
  // (raised whoever stands near her: the hero stands 17 m off, for the view)
  const near = ROOTMOTHER.thorns.near;
  ROOTMOTHER.thorns.near = 99;
  nextIs(boss, 'thorns');
  await lab.step(1);
  ROOTMOTHER.thorns.near = near;
  await until('thorns', 0.5, 'she never raised the thorns');
  await seen('8 thorns warning', 'her arms raised, a green ring round her trunk: melee heroes step out');
  await until('thorns', 0.78, 'the thorns never rose');
  await lab.step(15, () => ({}), () => { holdHerAfter(boss, 'thorns'); quiet(); });
  close('9 thorns', 'thorns risen round her trunk for 3 s, hurting whoever stands in them', ['back', 'above']);
  // phase 2
  await lab.step(150, () => ({}), quiet);
  boss.takeDamage(boss.life - 0.48 * boss.maxLife, {});
  await lab.step(40, () => ({}), () => { boss.cd = 99; quiet(); });
  await seen('10 phase 2', 'under half her life: the canopy closes and the Thornwood darkens');
  boss.brain.sporeT = 0;
  await lab.step(4 * FPS, () => ({}), () => { boss.cd = 99; });
  await seen('11 spores', 'slow spore clouds drift over the floor, hurting whoever stands in them');
  nextIs(boss, 'erupt');
  await until('erupt', 0.45, 'she never began an eruption');
  await seen('12 cracks', 'the earth cracking under the hero: about a second to get off it');
  await until('erupt', 0.75, 'the roots never burst');
  await lab.step(10, () => ({}), () => holdHerAfter(boss, 'erupt'));
  await seen('13 eruption', 'roots burst out of the earth where he stood');
  // her heart, opened on its time (brought near: every minute in a fight)
  await lab.step(60, () => ({}), () => holdHerAfter(boss, 'erupt'));
  boss.brain.heartT = 0.2;
  boss.cd = 0;
  await lab.until(() => boss.weak > 0, ATTACK_FRAMES, 'her heart never opened', () => ({}));
  await lab.step(40, () => ({}), quiet);
  await seen('14 heart opens', 'every minute her heart opens for 10 s: a banner, a beat, an amber light');
  close('14 heart open (close)', 'her heart open: an arrow or a bolt landed in it deals half again its damage',
    ['back', 'left'], boss.pos.clone().setY(2.2), 9);
  await lab.step(4 * FPS, () => ({}), quiet);
  await seen('15 meditating', 'she meditates, attacking nothing, and sows pods all round the arena');
  close('15 meditating (close)', 'arms raised wide, head back, sowing pods from her hair', ['back']);
  boss.takeDamage(boss.life + 1, {});
  await lab.step(60);
  close('16 her fall', 'killed: she sags back into her tree, her glows going out');
  lines.push(`rootPictures: ${moments.length} moments`);
  return moments;
}
