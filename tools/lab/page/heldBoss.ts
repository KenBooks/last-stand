// Quarry Mark held over each biome's boss with its summons about it (tools/lab `held`, page/held.ts), in each of the
// game's views: the aim swept across every point of the screen over them, the outline must be round the foe drawn
// there (page/onScreen.ts), and let go over the boss with the aim moving on, the boss must take the mark. (The quarry
// was the foe whose middle was nearest the aim's point, and the aim met the rigid meshes alone: over a boss's skinned
// limbs and crown it went on to the floor behind it, nearer a small foe.)
import * as THREE from 'three';
import type { Fixture, Lab, Pictured } from './lab';
import type { HeldOptions } from './held';
import type { Enemy } from '../../../src/entities/enemy';
import type { ViewMode } from '../../../src/core/renderer';
import type { SkillKey } from '../../../src/types';
import { G } from '../../../src/state';
import { BIOMES, type BiomeId } from '../../../src/data/biomes';
import { ENEMIES, type EnemyId } from '../../../src/data/enemies';
import { outline, outlinedLook } from '../../../src/ui/overlay/outline';
import type { HeldSkill, Shown } from './heldArea';
import { holdingKey } from './heldCooldown';
import { foeKind } from './death';
import { aimMiss, aimOnScreen, cameraAhead, foeDrawnAt, pointsOver, type Over } from './onScreen';
import { markSeen } from './markSeen';

/** how far ahead of the hero the boss stands (m), the frames the key is held before the sweep, the most frames the
 *  boss and its summons may take to rise, and a cast to end */
const AHEAD = 7;
const HOLD_FRAMES = 12;
const RISE_FRAMES = 300;
const CAST_FRAMES = 120;
/**
 * how far the foes about the boss stand off its side (m): packed against it, as its summons swarm round it in a fight
 * (0.3 m off it, none stood under its arms, and the check passed while a fight's mark went on a thornling there); the
 * ways round it from the hero's side its summons stand at (rad: the first in front of it, a little to one side), and
 * the biome's commonest foes
 */
const SMALL_GAP = 0.05;
const SMALL_WAYS = [-0.7, 0, 0.7, Math.PI];
const COMMON_WAYS = [-1.4, 1.4];
/**
 * where the hero stands unless `--at` says (m): the boss and the foes round it inside the arena's wall, whichever way
 * he faces. From the lab's own spot, 25 m out, they stood 7 m on into the thicket: once the wall was what's drawn
 * (#290) it put them back by the hero, and an arrow struck one the frame it left
 */
const SPOT: [number, number] = [12, 12];
/** the most frames the crosshair of a close view is turned for to come over a point, and how near it must come (m) */
const SIGHT_FRAMES = 8;
const SIGHT_NEAR = 0.02;

/** The biome's boss and the foes round it (its summons, `SMALL_WAYS`, then the biome's commonest, `COMMON_WAYS`),
 *  risen and dazed, in `view`. */
export async function bossWithSmall(lab: Lab, fixture: Fixture, view: ViewMode): Promise<Enemy[]> {
  await lab.setup({ at: SPOT, ...fixture, view });
  const hero = G.player;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const kind = BIOMES[G.arena.biome].boss;
  const boss = lab.spawnFoe(kind, hero.pos.clone().addScaledVector(cameraAhead(), AHEAD).setY(0));
  const small = (ENEMIES[kind].summon ?? 'thornling') as EnemyId;
  const toHero = hero.pos.clone().sub(boss.pos).setY(0).normalize();
  const round = (kind: EnemyId, way: number) => {
    const at = toHero.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), way);
    const apart = boss.radius + ENEMIES[kind].radius + SMALL_GAP;
    return lab.spawnFoe(kind, boss.pos.clone().addScaledVector(at, apart));
  };
  const smalls = SMALL_WAYS.map((way) => round(small, way));
  const common = foeKind();
  const others = COMMON_WAYS.map((way) => round(common, way));
  const foes = [boss, ...smalls, ...others];
  await lab.until(() => foes.every((foe) => foe.spawning <= 0), RISE_FRAMES, 'the boss and its summons never rose');
  for (const foe of foes) foe.dazed = 999;
  return foes;
}

/** the most points over the boss tried for the let-go, the hardest first */
const LET_GO_TRIES = 8;

/**
 * The points over the boss (`onBoss`), the hardest to tell it by first: those over another of `foes`, the most inside
 * its circle (on the boss's arm over a thornling), where the point alone would give the other.
 */
function hardestOver(onBoss: Over[], foes: Enemy[]): Over[] {
  const inside = (over: Over) => Math.min(...foes.slice(1).map((foe) => {
    const away = Math.hypot(over.point.x - foe.pos.x, over.point.z - foe.pos.z);
    return away / foe.radius;
  }));
  return [...onBoss].sort((a, b) => inside(a) - inside(b));
}

/**
 * The aim turned onto the hardest of the points over the boss where it's still drawn as the aim comes onto it (the
 * close views' eye moves as the crosshair turns: from there a point laid at the round's start lay behind a small
 * foe, which the aim then marked, as it should). `onBoss` are the points the sweep found it drawn at from the turned
 * eye: of every point laid over it at the round's start, the hardest eight in third person all lay behind a small
 * foe from there, and the let-go was never measured (#486). Null if none of the first `LET_GO_TRIES` is.
 */
async function overBossForLetGo(lab: Lab, key: SkillKey, onBoss: Over[], foes: Enemy[]): Promise<THREE.Vector3 | null> {
  const [boss] = foes;
  for (const over of hardestOver(onBoss, foes).slice(0, LET_GO_TRIES)) {
    const aimed = await aimedAt(lab, key, over.point, foes);
    if (aimed?.drawn === boss) return over.point;
  }
  return null;
}

/** One of a kind, as the lines say it: "a thornling", "an imp". */
function oneOf(kind: string): string {
  return `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}`;
}

/** A foe (by its model's root) as the lines name it: the boss by its kind, a small one as one of its kind. */
function foeName(root: THREE.Object3D | undefined, foes: Enemy[]): string {
  if (!root) return 'nothing';
  const foe = foes.find((one) => one.obj === root);
  if (!foe) return 'something else';
  return foe.boss ? `the ${foe.type}` : oneOf(foe.type);
}

/** One aim of the sweep: the foe drawn where the aim is and where the eye meets it, the model the outline is round, and
 *  where the game had the aim. */
interface Aimed {
  drawn: Enemy | undefined;
  drawnAt: THREE.Vector3 | undefined;
  drawnSkinned: boolean;
  outlined: THREE.Object3D | undefined;
  aim: THREE.Vector3;
}

/**
 * Quarry Mark's key held and aimed at `point` (the crosshair turned onto it in the close views, `SIGHT_FRAMES` at
 * most): the foe of `foes` drawn where the aim then is, and what the outline is round a frame later, as the game aims
 * from what it drew. Null if the crosshair never came over it.
 */
async function aimedAt(lab: Lab, key: SkillKey, point: THREE.Vector3, foes: Enemy[]): Promise<Aimed | null> {
  const frame = () => ({ ...holdingKey(key, point), sight: point });
  for (let f = 0; f < SIGHT_FRAMES && aimMiss(point) > SIGHT_NEAR; f++) await lab.step(1, frame);
  if (aimMiss(point) > SIGHT_NEAR) return null;
  const over = foeDrawnAt(aimOnScreen(point), foes);
  await lab.step(1, frame);
  const drawnSkinned = !!over?.skinned;
  const outlined = outlinedLook()?.root;
  return { drawn: over?.foe, drawnAt: over?.point, drawnSkinned, outlined, aim: G.player.aim.clone() };
}

/** Where the game had the aim against where the eye met the foe drawn there: how far before or behind it, along the
 *  eye's ray, and how high over the floor (m). */
function aimAgainstDrawn(aimed: Aimed): string {
  const at = aimed.drawnAt;
  const foe = aimed.drawn;
  if (!at || !foe) return '';
  const out = Math.hypot(at.x - foe.pos.x, at.z - foe.pos.z) / foe.radius;
  const up = (at.y - foe.obj.position.y) / foe.height;
  const mesh = aimed.drawnSkinned ? 'skinned' : 'rigid';
  const share = `${out.toFixed(2)} of its radius out, ${up.toFixed(2)} of its height up`;
  const drawn = `the point drawn on a ${mesh} mesh, ${share}`;
  const eye = G.camera.position;
  const behind = aimed.aim.distanceTo(eye) - at.distanceTo(eye);
  const away = `${Math.abs(behind).toFixed(2)} m ${behind > 0 ? 'behind' : 'before'} it`;
  const where = Math.abs(behind) < 0.05 ? 'on it' : away;
  return ` (${drawn}; the game's aim ${where}, ${aimed.aim.y.toFixed(2)} m up)`;
}

/** Of the aims over the boss or over the small foes (`boss`), how many the outline was round the foe drawn there. */
function outlineTally(aims: Aimed[], boss: boolean, foes: Enemy[]): string {
  const over = aims.filter((aim) => aim.drawn?.boss === boss);
  const wrong = over.filter((aim) => aim.outlined !== aim.drawn?.obj);
  const other = wrong.length ? `${foeName(wrong[0].outlined, foes)}${aimAgainstDrawn(wrong[0])}` : '';
  const first = wrong.length ? `; at the first other, ${other}` : '';
  const what = boss ? `the ${foes[0].type}` : 'the foes about it';
  return `aimed over ${what} at ${over.length} points, outlined it at ${over.length - wrong.length}${first}`;
}

/**
 * With `canary`, the outline over the boss at the first aim moved onto a small foe and read again: it must be caught.
 * Returns the line saying so, and the problem if it's missed.
 */
function outlineCanary(aims: Aimed[], foes: Enemy[]): { line: string; problem?: string } {
  const [boss, small] = foes;
  const look = outlinedLook();
  if (look) outline(small.obj, look.color, look.strength);
  const moved = outlinedLook()?.root;
  if (look) outline(look.root, look.color, look.strength);
  const caught = !!aims.length && moved !== aims[aims.length - 1].drawn?.obj;
  const planted = `the outline over the ${boss.type} moved onto ${oneOf(small.type)}`;
  const line = `  canary, ${planted}: ${caught ? 'caught' : 'missed'}`;
  return caught ? { line } : { line, problem: 'the canary\'s outline moved off the boss went unseen' };
}

/**
 * Quarry Mark aimed over the biome's boss with small foes about it (its summons, one in front of it), in each of the
 * game's views: held, its aim swept across every point of the screen over them (the crosshair turned onto each in the
 * close views), the outline must be round the foe drawn there, the boss over its skinned limbs as over its rigid
 * parts; let go over the boss, the boss must take the mark. (The quarry was the foe whose middle was nearest the
 * aim's point, and the point on a boss's body, or on the floor behind it where the eye's ray passed its skinned limbs
 * by, was nearer a small foe by it.) With `canary`, the outline over the boss is moved onto a small foe, and the
 * boss's mark too, in the first view: both must be caught.
 */
async function heldOverBoss(
  lab: Lab, skill: HeldSkill, biome: BiomeId, view: ViewMode, options: HeldOptions,
): Promise<Shown> {
  const was = G.arena.biome;
  if (was !== biome) G.arena.setBiome(biome);
  const shown = await overBossIn(lab, skill, view, options);
  if (G.arena.biome !== was) G.arena.setBiome(was);
  return shown;
}

/** Quarry Mark's rounds over each biome's boss, in each of `views`. */
export function bossRounds(
  lab: Lab, skill: HeldSkill, views: ViewMode[], options: HeldOptions,
): (() => Promise<Shown[]>)[] {
  const biomes = Object.keys(BIOMES) as BiomeId[];
  const round = (biome: BiomeId, view: ViewMode) => async () => [await heldOverBoss(lab, skill, biome, view, options)];
  return biomes.flatMap((biome) => views.map((view) => round(biome, view)));
}

/** `heldOverBoss` in the biome as it is. */
async function overBossIn(lab: Lab, skill: HeldSkill, view: ViewMode, options: HeldOptions): Promise<Shown> {
  const foes = await bossWithSmall(lab, options.fixture, view);
  const [boss, small] = foes;
  const points = pointsOver(foes);
  const planted = options.canary && view === 'top' && G.arena.biome === 'forest';
  const lines: string[] = [];
  const problems: string[] = [];
  const say = (problem: string) => problems.push(`${skill.name}, over the ${boss.type} (${view}): ${problem}`);
  if (!points.some((over) => over.foe === boss)) say('no point of the screen over the boss');
  await lab.step(HOLD_FRAMES, () => holdingKey(skill.key, points[0].point));
  const aims: Aimed[] = [];
  // (the points the boss was still drawn at once the aim was turned onto them: the let-go's)
  const stillBoss: Over[] = [];
  let unreached = 0;
  for (const over of points) {
    const aimed = await aimedAt(lab, skill.key, over.point, foes);
    if (!aimed) unreached++;
    else aims.push(aimed);
    if (aimed?.drawn === boss) stillBoss.push(over);
    if (planted && aimed?.drawn === boss && aims.filter((aim) => aim.drawn === boss).length === 1) {
      const canary = outlineCanary(aims, foes);
      lines.push(canary.line);
      if (canary.problem) say(canary.problem);
    }
  }
  if (unreached) lines.push(`  ${view}: the crosshair never came over ${unreached} of the ${points.length} points`);
  for (const ofBoss of [true, false]) {
    const tally = outlineTally(aims, ofBoss, foes);
    lines.push(`  ${view}: ${tally}`);
    if (aims.some((aim) => aim.drawn?.boss === ofBoss && aim.outlined !== aim.drawn.obj)) say(tally);
  }
  const target = await overBossForLetGo(lab, skill.key, stillBoss, foes);
  if (!target) {
    say('the boss was never drawn where the aim was turned for the let-go');
    return { lines, problems, moments: [] };
  }
  // (let go, the aim moves on onto a small foe as the cast goes: what's marked is what the outline was round)
  const movedOn = small.pos.clone().setY(small.obj.position.y + small.height / 2);
  await lab.step(1, () => ({ aim: target, sight: target }));
  const castDone = () => !G.player.casting;
  await lab.until(castDone, CAST_FRAMES, 'the cast never ended', () => ({ aim: movedOn, sight: movedOn }));
  if (planted) {
    small.marks.push(...boss.marks.splice(0));
    const caught = !boss.marks.length;
    lines.push(`  canary, the ${boss.type}'s mark moved onto ${oneOf(small.type)}: ${caught ? 'caught' : 'missed'}`);
    if (!caught) say('the canary\'s mark moved off the boss went unseen');
    boss.marks.push(...small.marks.splice(0));
  }
  const marked = foeName(foes.find((foe) => foe.marks.length)?.obj, foes);
  const moments: Pictured[] = [];
  lines.push(`  ${view}: let go over the ${boss.type}, the aim moved on onto ${oneOf(small.type)}: marked ${marked}`);
  if (marked !== `the ${boss.type}`) say(`let go over it, marked ${marked}`);
  else {
    const seen = markSeen(boss, foes, false);
    lines.push(`  ${view}: the mark over the ${boss.type}: ${seen.line}`);
    if (seen.problem) say(seen.problem);
    // (the boss dazed, its stars over its head with the mark)
    if (options.pictures) moments.push(await lab.screen(`${skill.name}: the mark over the ${boss.type} (${view})`));
    if (planted) {
      const caught = !!markSeen(boss, foes, true).problem;
      lines.push(`  canary, the mark's reticle put inside the ${boss.type}: ${caught ? 'caught' : 'missed'}`);
      if (!caught) say('the canary\'s reticle inside the boss went unseen');
    }
  }
  await letGoWhileShooting(lab, skill.key, { target, movedOn, view }, foes, lines, say);
  return { lines, problems, moments };
}

/**
 * Quarry Mark let go over the boss (`target`) while a shot is drawn, which it waits for, and the aim moved on onto a
 * small foe (`movedOn`) as the shot is loosed: cast once the hero is free, it must still mark the boss, where it was
 * let go. (Queued, it was cast at the aim of the moment it went: the outline round the boss, the mark on a small foe.)
 */
async function letGoWhileShooting(
  lab: Lab, key: SkillKey, aims: { target: THREE.Vector3; movedOn: THREE.Vector3; view: ViewMode }, foes: Enemy[],
  lines: string[], say: (problem: string) => void,
): Promise<void> {
  const { target, movedOn, view } = aims;
  const [boss] = foes;
  const hero = G.player;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const drawing = (aim: THREE.Vector3) => ({ ...holdingKey(key, aim), m0: true, sight: aim });
  await lab.step(HOLD_FRAMES, () => drawing(target));
  await lab.step(1, () => ({ m0: true, aim: target, sight: target }));
  const waited = !!hero.casting && hero.casting.skill.def.impl !== 'quarryMark';
  const cast = () => hero.cooldownLeft('quarryMark') > 0 && !hero.casting;
  const movingOn = () => ({ aim: movedOn, sight: movedOn });
  await lab.until(cast, CAST_FRAMES * 3, 'the mark let go while shooting was never cast', movingOn);
  const marked = foeName(foes.find((foe) => foe.marks.length)?.obj, foes);
  const how = waited ? 'waiting for a shot' : 'with no shot under way (nothing waited for)';
  lines.push(`  ${view}: let go over the ${boss.type} ${how}, the aim moved on: marked ${marked}`);
  if (!waited) say('let go while shooting, nothing was under way: the wait went unchecked');
  if (marked !== `the ${boss.type}`) say(`let go over it while shooting, marked ${marked}`);
}
