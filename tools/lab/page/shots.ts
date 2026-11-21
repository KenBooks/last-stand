// The hero's shots at a boss (tools/lab `shots`): his basic attack (the ranger's bow drawn to full, the mage's bolt)
// loosed at points over each biome's boss with its summons and the biome's foes packed round it (page/heldBoss.ts's),
// in each of the game's views, the crosshair turned onto each point in the close views. Each shot's flight is followed
// frame by frame: it must strike the first foe drawn along it (page/onScreen.ts), none if none is, and aimed inside a
// foe on the screen (not at its edge), reach it unless another stands in its way. (A shot struck a foe only within its
// circle and under its height: aimed at a boss's arm or its crown, it flew on through, and aimed past a small foe at
// the boss it struck the small foe.)
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { ViewMode } from '../../../src/core/renderer';
import type { SkillKey } from '../../../src/types';
import { G } from '../../../src/state';
import { BIOMES, type BiomeId } from '../../../src/data/biomes';
import { groundHeight } from '../../../src/world/ground';
import { bossWithSmall } from './heldBoss';
import { pressing } from './cast';
import { aimMiss, aimOnScreen, foeDrawnAt, foeMetAlong, insideFoe, pointsOver, type Over } from './onScreen';

export interface ShotsOptions {
  fixture: Fixture;
  /** the views the shots are loosed in */
  views: ViewMode[];
  /** how many shots in each view, half over the boss and half over the foes round it */
  shots: number;
  /** the first shot's foe made invulnerable (struck, it takes nothing), which must be found missed */
  canary: boolean;
}

/** the most frames a shot takes to be drawn or cast, to fly to its foe, and to be over (its reload) */
const DRAW_FRAMES = 240;
const FLIGHT_FRAMES = 90;
const DONE_FRAMES = 240;
/** the most frames of a close view's crosshair turned onto a point, and how near it must come (m) */
const SIGHT_FRAMES = 16;
const SIGHT_NEAR = 0.003;
/** the lowest a point is aimed at over the floor (m): lower, at a foe's feet, a shot goes into the ground first */
const FEET = 0.15;
/** how far past each frame's step its flight is looked along (m): a shot that strikes stops on the surface */
const PAST = 0.1;
/** a foe's life for the shots: none dies of them */
const LIFE = 1e6;

/** One shot: where it was aimed (and whether the aim was inside its foe on the screen as it was loosed), the first foe
 *  drawn along its flight, the foes it struck, how near its flight came to the point aimed at (m), and if it's the
 *  canary. */
interface Shot {
  over: Over;
  inside: boolean;
  /** whether it flies at the point aimed at (an arrow): not a seeking bolt, level at the hand's height */
  atPoint: boolean;
  inWay: Enemy | undefined;
  struck: Enemy[];
  nearest: number;
  /** how far the game's own aim was from the point as it was loosed (m) */
  aimOff: number;
  canary: boolean;
}

/** How near a flight (its positions frame by frame) comes to `point` (m). */
function nearestTo(flight: THREE.Vector3[], point: THREE.Vector3): number {
  const step = new THREE.Line3();
  const on = new THREE.Vector3();
  let nearest = Infinity;
  for (let i = 1; i < flight.length; i++) {
    step.set(flight[i - 1], flight[i]).closestPointToPoint(point, true, on);
    nearest = Math.min(nearest, on.distanceTo(point));
  }
  return nearest;
}

/** The input holding `key` (the basic attack's left button by default) over `point`, the crosshair turned onto it. */
function holding(point: THREE.Vector3, key: SkillKey = 'mouse0'): Frame {
  return { ...pressing(key, point, true), sight: point };
}
/** The input with the button let go, the aim still on `point`. */
export const letGo = (point: THREE.Vector3): Frame => ({ aim: point, sight: point });

/** Where each foe stands, and the way it faces: each is put back there before every shot. */
interface Stand {
  foe: Enemy;
  at: THREE.Vector3;
  facing: number;
}

/** Each of `foes` put back where it stood, its knock spent (the shots knocked them back, off the points aimed at). */
function putBack(stands: Stand[]): void {
  for (const { foe, at, facing } of stands) {
    foe.knock.set(0, 0, 0);
    foe.pos.copy(at);
    foe.obj.position.set(at.x, foe.obj.position.y, at.z);
    foe.facing = facing;
  }
}

/** Every foe's life, to read what a shot took. */
const livesOf = (foes: Enemy[]): number[] => foes.map((foe) => foe.life);

/** The shot's spots: `count` of `points`, half over the boss and half over the rest, spread through each. */
function spread(points: Over[], boss: Enemy, count: number): Over[] {
  const aimable = points.filter((over) => over.point.y - over.foe.obj.position.y > FEET);
  const onBoss = aimable.filter((over) => over.foe === boss);
  const others = aimable.filter((over) => over.foe !== boss);
  const pick = (list: Over[], n: number) => {
    const step = list.length / Math.max(1, n);
    return Array.from({ length: Math.min(n, list.length) }, (_, i) => list[Math.floor(i * step)]);
  };
  const half = Math.ceil(count / 2);
  return [...pick(onBoss, half), ...pick(others, count - half)];
}

/** Whether the aim is inside the foe of `over` on the screen now, not at its edge: the foe drawn there and round it
 *  (the close views' eye moves as the crosshair is turned onto the point, which may put it at an edge). */
function aimInside(over: Over, foes: Enemy[]): boolean {
  const drawn = foeDrawnAt(aimOnScreen(over.point), foes);
  return drawn?.foe === over.foe && insideFoe(drawn, foes);
}

/** The hero's basic attack (or the skill on `key`) drawn or cast over `point` until it's loosed or fired. */
export async function drawAt(lab: Lab, point: THREE.Vector3, key: SkillKey = 'mouse0'): Promise<void> {
  for (let f = 0; f < SIGHT_FRAMES && aimMiss(point) > SIGHT_NEAR; f++) await lab.step(1, () => letGo(point));
  const ready = () => {
    const cast = G.player.casting;
    if (!cast) return false;
    if (cast.drawT) return cast.t - (cast.nockT ?? 0) >= cast.drawT;
    return cast.fired;
  };
  await lab.until(ready, DRAW_FRAMES, 'the shot was never drawn', () => holding(point, key));
}

/**
 * One shot at `over`: drawn over it and loosed, its flight followed frame by frame until it's gone, and the foes whose
 * life it took. Each frame's step is looked along for the first foe drawn on it before the frame runs, as the shot
 * meets them: against the bodies as last drawn, before they move that frame (looked along once it had flown, the foe
 * it struck had been knocked off its line, and after each frame, it had flinched). With `canary`, the foe aimed at is
 * made invulnerable meanwhile.
 */
async function shootAt(lab: Lab, over: Over, foes: Enemy[], canary: boolean): Promise<Shot> {
  // (the shots flying before it's drawn: a bolt leaves the hand as it's cast, before the button is let go)
  const flying = new Set(G.projectiles);
  const before = livesOf(foes);
  if (canary) over.foe.invulnerable = true;
  await drawAt(lab, over.point);
  const inside = aimInside(over, foes);
  const hero = G.player;
  const aimOff = hero.aim.clone().setY(hero.aim.y + groundHeight(hero.aim.x, hero.aim.z)).distanceTo(over.point);
  await lab.step(1, () => letGo(over.point));
  const shot = G.projectiles.find((projectile) => !flying.has(projectile) && !projectile.hostile);
  const flight = shot ? [hero.castPoint.clone(), shot.pos.clone()] : [];
  let inWay = flight.length ? foeMetAlong(flight[0], flight[1], PAST, foes)?.foe : undefined;
  for (let f = 0; shot?.alive && f < FLIGHT_FRAMES; f++) {
    // (the step the frame moves it by, its speed as it is before it falls; an arrow's by its point, half its length on)
    const ahead = shot.vel.clone().setLength(shot.point ?? 0);
    const next = shot.pos.clone().addScaledVector(shot.vel, G.dt).add(ahead);
    inWay ??= foeMetAlong(shot.pos.clone().add(ahead), next, PAST, foes)?.foe;
    await lab.step(1, () => letGo(over.point));
    flight.push(shot.pos.clone());
  }
  const struck = foes.filter((foe, i) => foe.life < before[i]);
  if (canary) over.foe.invulnerable = false;
  await lab.until(() => !hero.casting, DONE_FRAMES, 'the shot was never over', () => letGo(over.point));
  const atPoint = !!shot?.level;
  return { over, inside, atPoint, inWay, struck, nearest: nearestTo(flight, over.point), aimOff, canary };
}

/** A foe as the lines name it: the boss by its kind, another as one of its kind. */
function nameOf(foe: Enemy | undefined): string {
  if (!foe) return 'nothing';
  if (foe.boss) return `the ${foe.type}`;
  return `${/^[aeiou]/.test(foe.type) ? 'an' : 'a'} ${foe.type}`;
}

/** Where a shot was aimed, as the lines say it: on which foe, how far up it and out from its middle. */
function aimedAt(shot: Shot): string {
  const { foe, point } = shot.over;
  const out = Math.hypot(point.x - foe.pos.x, point.z - foe.pos.z) / foe.radius;
  const up = (point.y - foe.obj.position.y) / foe.height;
  return `${nameOf(foe)} ${up.toFixed(2)} of its height up, ${out.toFixed(2)} of its radius out`;
}

/** Whether a shot struck the first foe along its flight and it alone, or none if its flight met none. */
function landed(shot: Shot): boolean {
  if (!shot.inWay) return shot.struck.length === 0;
  return shot.struck.length === 1 && shot.struck[0] === shot.inWay;
}
/** Whether a shot's flight went to the foe it was aimed at, or to one in its way: not past it, short of it or over (a
 *  shot aimed at a foe's edge may go by it). */
const reached = (shot: Shot): boolean => !shot.inside || shot.inWay !== undefined;

/** One biome's boss with the foes round it, in `view`: every shot, as lines and problems. */
async function shotsIn(lab: Lab, view: ViewMode, options: ShotsOptions, first: boolean): Promise<Report> {
  const foes = await bossWithSmall(lab, options.fixture, view);
  const [boss] = foes;
  for (const foe of foes) foe.life = LIFE;
  const stands = foes.map((foe) => ({ foe, at: foe.pos.clone(), facing: foe.facing }));
  // (each point taken again before its shot, through its spot on the screen as the grid was laid: the foes sway)
  const eye = G.camera.clone();
  const shots: Shot[] = [];
  for (const [i, laid] of spread(pointsOver(foes), boss, options.shots).entries()) {
    putBack(stands);
    const over = foeDrawnAt(laid.ndc, foes, eye) ?? laid;
    shots.push(await shootAt(lab, over, foes, options.canary && first && i === 0));
  }
  if (!shots.some((shot) => shot.atPoint)) {
    const why = `the ${G.player.cls.id}'s basic attack doesn't fly at the point aimed at (it seeks its foe level, `
      + `struck within its circle): nothing judged`;
    return { text: `  ${view}: ${why}`, problems: [`${G.arena.biome} (${view}): ${why}`] };
  }
  const aimed = shots.filter((shot) => !shot.canary);
  const inside = aimed.filter((shot) => shot.inside);
  const wrong = aimed.filter((shot) => !landed(shot) || !reached(shot));
  const aimedOn = inside.filter((shot) => shot.inWay === shot.over.foe).length;
  const lines = [`  ${view}: ${aimed.length} shots over the ${boss.type} and the foes about it: `
    + `${aimed.length - wrong.length} struck the first foe along their flight (none if none); of the ${inside.length} `
    + `aimed inside a foe, ${aimedOn} struck it (the rest another in the way)`];
  const problems: string[] = [];
  for (const shot of wrong) {
    const struck = shot.struck.map(nameOf).join(' and ') || 'nothing';
    const why = reached(shot) ? `the first along its flight ${nameOf(shot.inWay)}` : 'its flight met no foe';
    const line = `aimed at ${aimedAt(shot)}: struck ${struck}, ${why} (it came within ${shot.nearest.toFixed(2)} m `
      + `of the point, the game's aim ${shot.aimOff.toFixed(2)} m off it)`;
    lines.push(`    ${line}`);
    problems.push(`${G.arena.biome} (${view}): ${line}`);
  }
  for (const shot of shots.filter((one) => one.canary)) {
    const caught = !landed(shot);
    lines.push(`  canary, ${nameOf(shot.over.foe)} unhurt by the first shot: ${caught ? 'caught' : 'missed'}`);
    if (!caught) problems.push('the canary\'s shot that took nothing went unseen');
  }
  return { text: lines.join('\n'), problems };
}

/** `lab shots`: the hero's basic attack loosed over each biome's boss and the foes round it, in each view. */
export async function shots(lab: Lab, options: ShotsOptions): Promise<Report> {
  const was = G.arena.biome;
  const lines: string[] = [];
  const problems: string[] = [];
  for (const [b, biome] of (Object.keys(BIOMES) as BiomeId[]).entries()) {
    if (G.arena.biome !== biome) G.arena.setBiome(biome);
    lines.push(biome);
    for (const [v, view] of options.views.entries()) {
      const report = await shotsIn(lab, view, options, b === 0 && v === 0);
      lines.push(report.text);
      problems.push(...report.problems);
    }
  }
  if (G.arena.biome !== was) G.arena.setBiome(was);
  return { text: lines.join('\n'), problems };
}
