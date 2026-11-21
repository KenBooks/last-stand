// The berserker's headshots (tools/lab `headshots --class warrior`): every kind of foe, the bosses and the training
// dummy among them, stood alone before the warrior with both hands empty and held still, punched with Savage Fists
// once with the crosshair on the middle of its head and once on its chest. A punch whose fist's line meets a foe's
// head through the eyes is always a critical hit (`toHead` in skills/savageFists.ts, read off the part it meets by
// `onHead`, as an arrow's is); here the hero's own chance of one is put to nothing and the foe stands where no
// technique adds to it (out of a clean hit's band, `CLEAN_HIT`, his aim held still before the punch), so a critical
// hit is the game having judged a headshot. Through the eyes each head punch must strike and crit, each chest punch
// strike and not; from outside the fist's line is level at the chest, so none crits, and each strikes the foe the
// crosshair is on.
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { EnemyId } from '../../../src/data/enemies';
import type { ViewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { CLEAN_HIT } from '../../../src/data/balance';
import { letGo } from './shots';
import { aimMiss } from './onScreen';
import { castSolid } from '../../../src/fx/stuckArrows';
import type { HullHit } from '../../../src/entities/models/hulls';
import * as savageFists from '../../../src/combat/skills/savageFists';
import {
  chestPoint, headAim, jointName, kindsOf, plantHead, trunkJoint, turnFoe, type HeadshotsOptions,
} from './headshots';

/** where the hero stands (m), clear of the props, with room before him for a boss */
const SPOT: [number, number] = [12, 12];
/** how far a foe's edge stands from his middle (m), out of a clean hit's band (`CLEAN_HIT`, which adds to a
 *  punch's chance of a crit) and within the fist's reach (the skill's `range`, 1.3): through the eyes just short of
 *  the band (past it, an imp's and a thornling's chests, looked down at, were out of the fist's reach from the eye),
 *  from outside past it (closer, more of the level line's start lies behind his fist, where it meets nothing) */
const GAP_EYES = CLEAN_HIT.from - 0.05;
const GAP_OUTSIDE = CLEAN_HIT.to + 0.1;
/** the views punched in by default: through the eyes the head punches crit, from outside none does */
export const PUNCH_VIEWS: ViewMode[] = ['first', 'third'];
/** the most frames a foe takes to rise, the crosshair to come onto a point, and the hero to be free after a punch */
const RISE_FRAMES = 300;
const SIGHT_FRAMES = 30;
const DONE_FRAMES = 120;
/** how near the crosshair must come to the point (as `drawAt`'s) */
const SIGHT_NEAR = 0.003;
/** frames the aim is held still on the point before the punch: his turning, read as he charges, is let go past
 *  0.2 s (`readTurning`), so a swing of the aim onto the point adds nothing to the punch's chance of a crit */
const STILL_FRAMES = 20;
/** frames the button is held: a click, past the skill's least draw (0.06 s) and far short of a charge */
const CLICK_FRAMES = 6;
/** a foe's life: past every punch */
const LIVING = 1e6;
/** how far short of the fist's reach a head must be to be punched (m) */
const REACH_SLACK = 0.05;

/** The game's way over the shoulder from his middle to what the crosshair is on (`underCrosshair` in
 *  skills/savageFists.ts), where the game has it: read by name, as an A/B copies this module into main's tree,
 *  where a named import of an export it hasn't got stops the page loading. */
type UnderCrosshair = (player: typeof G.player, foe: Enemy, way: THREE.Vector3) => boolean;
const fists = savageFists as { underCrosshair?: UnderCrosshair };
/** how far behind the hero the fist's line begins (m: `meetsBody`'s `LINE_BACK`) */
const LINE_BACK = 0.6;

/** What a punch did: whether it struck the foe and whether critically, or that the head was out of the fist's
 *  reach (how far it was, m); and, traced, what the fist's line met as it landed. */
interface Punched {
  struck: boolean;
  crit: boolean;
  outOfReach?: number;
  met?: string;
}

/** One foe's two punches. */
interface Pair {
  kind: string;
  boss: boolean;
  head: Punched;
  chest: Punched;
  canary: boolean;
}

/** A foe of `kind` risen before the hero, its edge `GAP_EYES` or `GAP_OUTSIDE` from his middle, standing in its
 *  idle pose: it thinks as the training dummy does and doesn't evade. Returns it and the spot it's put back on
 *  before each punch. */
async function standFoe(lab: Lab, kind: EnemyId): Promise<{ foe: Enemy; spot: THREE.Vector3 }> {
  const hero = G.player;
  const forward = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const foe = lab.spawnFoe(kind, hero.pos.clone().addScaledVector(forward, 3).setY(0));
  const gap = hero.eyes ? GAP_EYES : GAP_OUTSIDE;
  const spot = hero.pos.clone().addScaledVector(forward, foe.radius + gap);
  Object.assign(foe, { def: { ...foe.def, ai: 'idle', evade: undefined } });
  await lab.until(() => foe.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
  return { foe, spot };
}

/** `foe` put back on `spot`, its knock spent (a punch knocks it back). */
function putBack(foe: Enemy, spot: THREE.Vector3): void {
  foe.knock.set(0, 0, 0);
  foe.pos.set(spot.x, foe.pos.y, spot.z);
  foe.obj.position.set(spot.x, foe.obj.position.y, spot.z);
}

/** Catches each hit on `foe` into `punched`: struck, and whether critical. */
function catchHits(foe: Enemy, punched: Punched): void {
  const takeDamage = foe.takeDamage.bind(foe);
  foe.takeDamage = (amount, info) => {
    // (read as the game judged the punch, in the frame it landed: read as the button went down, the line was another)
    if (!punched.struck) punched.met = fistMet(foe);
    punched.struck = true;
    if (info?.crit) punched.crit = true;
    return takeDamage(amount, info);
  };
}

/** How far a fist's line reaches from the eye to `foe` (m): the skill's range past the foe's size. */
function reachOf(foe: Enemy): number {
  const def = G.player.skillAt('mouse0')?.def;
  return (def?.range ?? 0) + foe.radius;
}

/** Where the fist's line begins and the way it goes, as `meetsBody` takes it: through the eyes the crosshair's;
 *  from outside level at the foe's chest, his shoulders' at the most, towards what the crosshair is on where the
 *  game has that (`underCrosshair`), else along his facing. */
function fistLine(foe: Enemy): { from: THREE.Vector3; way: THREE.Vector3 } {
  const hero = G.player;
  if (hero.eyes) {
    const from = G.camera.getWorldPosition(new THREE.Vector3());
    return { from, way: G.camera.getWorldDirection(new THREE.Vector3()) };
  }
  const height = foe.obj.position.y + Math.min(1.35, foe.height * 0.7);
  const from = new THREE.Vector3(hero.pos.x, height, hero.pos.z);
  const way = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  fists.underCrosshair?.(hero, foe, way);
  return { from, way };
}

/** What the fist's middle line meets of `foe` now, by the joint it rides, and how far along it (m) against its
 *  reach. */
function fistMet(foe: Enemy): string {
  const { from, way } = fistLine(foe);
  const start = from.clone().addScaledVector(way, -LINE_BACK);
  const ray = new THREE.Raycaster(start, way, 0, LINE_BACK + reachOf(foe) + 1);
  const hit = castSolid(foe.obj, ray);
  const by = `, the line ${passedBy(foe, from, way).toFixed(2)} m from its middle, ${aimSaid(foe)}`;
  if (!hit) return `nothing on its line${by}`;
  const piece = jointName(foe, (hit as Partial<HullHit>).joint ?? hit.object);
  const along = hit.distance - LINE_BACK;
  return `its ${piece} at ${along.toFixed(2)} m of a reach of ${reachOf(foe).toFixed(2)}${by}`;
}

/** How far across the fist's line, seen from above, `foe`'s middle stands from it (m, + to its left). */
function passedBy(foe: Enemy, from: THREE.Vector3, way: THREE.Vector3): number {
  const dx = foe.pos.x - from.x;
  const dz = foe.pos.z - from.z;
  const across = Math.hypot(way.x, way.z) || 1;
  return (dx * way.z - dz * way.x) / across;
}

/** Where the game's own aim is, against `foe`: how far across from its middle, seen from above, and how high. */
function aimSaid(foe: Enemy): string {
  const aim = G.player.aim;
  const off = Math.hypot(aim.x - foe.pos.x, aim.z - foe.pos.z);
  return `the game's aim ${off.toFixed(2)} m from its middle at ${aim.y.toFixed(2)} m up`;
}

/** Where the crosshair goes for a head punch: a point inside the skull the eye's line meets on the head first, as
 *  a player puts the crosshair on it. (Through the eyes the fist's line ran 10 cm under the crosshair, and with it
 *  on the husk's head's middle the fist went under the chin: on main its head punch is a body's.) */
function headPunchAim(foe: Enemy): THREE.Vector3 | null {
  return headAim(foe, () => [G.camera.position]);
}

/**
 * One click's punch with the crosshair on `target` (followed each frame until it lands, as a player's aim is), the
 * foe put back first; nothing thrown through the eyes where the point is out of the fist's reach from the eye (a
 * Twin's head and chest tower over him).
 */
async function punchAt(
  lab: Lab, foe: Enemy, spot: THREE.Vector3, target: () => THREE.Vector3, punched: Punched,
): Promise<Punched> {
  const hero = G.player;
  hero.cooldowns.clear();
  foe.life = LIVING;
  putBack(foe, spot);
  punched.struck = false;
  punched.crit = false;
  punched.outOfReach = undefined;
  punched.met = undefined;
  const point = target();
  const follow = () => {
    point.copy(target());
  };
  lab.beforeFrame.push(follow);
  try {
    for (let f = 0; f < SIGHT_FRAMES && aimMiss(point) > SIGHT_NEAR; f++) await lab.step(1, () => letGo(point));
    await lab.step(STILL_FRAMES, () => letGo(point));
    const far = G.camera.position.distanceTo(point);
    if (hero.eyes && far > reachOf(foe) - REACH_SLACK) return { ...punched, outOfReach: far };
    const pressed = (): Frame => ({ m0: true, aim: point, sight: point });
    await lab.step(CLICK_FRAMES, pressed);
    const atRelease = fistMet(foe);
    await lab.until(() => !hero.casting, DONE_FRAMES, 'the punch was never over', () => letGo(point));
    if (!punched.struck) punched.met = `nothing as it landed (as it was let go: ${atRelease})`;
  } finally {
    lab.beforeFrame.splice(lab.beforeFrame.indexOf(follow), 1);
  }
  return { ...punched };
}

/** The canary's stand-in for a foe's head: the joint its whole body rides (its rig's root, the dummy's sway), so
 *  whatever of it a chest punch meets is taken for its head. (Its chest joint alone, the bow's canary's, went unseen
 *  on the Hulk, whose side-on chest punch met an arm that hangs from its spine.) */
function canaryJoint(foe: Enemy): THREE.Object3D | null {
  return foe.model.joints?.root ?? trunkJoint(foe);
}

/** One kind's pair of punches; with `canary`, its head taken to be its whole body. */
async function punchKind(lab: Lab, kind: EnemyId, canary: boolean): Promise<Pair | string> {
  const { foe, spot } = await standFoe(lab, kind);
  const punched: Punched = { struck: false, crit: false };
  catchHits(foe, punched);
  let undo: (() => void) | null = null;
  try {
    await turnFoe(lab, foe, 0);
    if (!headPunchAim(foe)) return `the ${kind} has no head joint`;
    const head = await punchAt(lab, foe, spot, () => headPunchAim(foe)!, punched);
    // (side on: a head jutting forward from under a hump, the Mossback's, is before its chest from the front)
    await turnFoe(lab, foe, 1);
    // (planted after the head is aimed at: the root has no skull of its own to aim at)
    const whole = canaryJoint(foe);
    if (canary && whole) undo = plantHead(foe, whole);
    const chest = await punchAt(lab, foe, spot, () => chestPoint(foe), punched);
    return { kind, boss: Boolean(foe.boss), head, chest, canary };
  } finally {
    undo?.();
    // (gone before the next kind stands where it stood)
    foe.dispose();
    G.enemies.splice(G.enemies.indexOf(foe), 1);
  }
}

/** A punch's outcome as a line says it. */
function said(punched: Punched): string {
  if (punched.outOfReach !== undefined) return `out of a fist's reach (${punched.outOfReach.toFixed(2)} m)`;
  if (!punched.struck) return 'missed';
  return punched.crit ? 'headshot' : 'body';
}

/** What's wrong with a pair, if anything. Through the eyes: a head punch that missed or was no headshot, a chest
 *  punch that missed or was one, a common foe's head or chest out of a fist's reach (a boss's may tower over him,
 *  and a miss on its body says nothing of heads). From outside: a punch that crit, or that missed a common foe (the
 *  crosshair on it, the fist goes to it: along his facing it passed beside the thin foes, `underCrosshair`). */
function faultsOf(pair: Pair, eyes: boolean): string[] {
  const faults: string[] = [];
  const { head, chest } = pair;
  if (!eyes) {
    if (head.crit || chest.crit) faults.push('a punch was a headshot from outside, where its line is at the chest');
    if (!pair.boss && (!head.struck || !chest.struck)) faults.push('a punch missed it');
    return faults;
  }
  if (head.outOfReach !== undefined) {
    if (!pair.boss) faults.push('its head was out of a fist\'s reach');
  } else if (!head.struck) faults.push('the head punch missed it');
  else if (!head.crit) faults.push('the head punch struck it but was no headshot');
  // (a boss towering over him is let off a miss: the slab Twin's middle, a cage of bones, a gap where its chest is)
  if (pair.boss && (chest.outOfReach !== undefined || !chest.struck)) return faults;
  if (chest.outOfReach !== undefined) faults.push('its chest was out of a fist\'s reach');
  else if (!chest.struck) faults.push('the chest punch missed it');
  else if (chest.crit) faults.push('the chest punch was taken for a headshot');
  return faults;
}

/** One view's punches: every foe's pair, as lines and problems. */
async function punchesIn(lab: Lab, view: ViewMode, options: HeadshotsOptions, first: boolean): Promise<Report> {
  await lab.setup(fixtureOf(options.fixture, view));
  G.player.stats.crit = 0;
  const eyes = view === 'first';
  const lines = [`${view}:`];
  const problems: string[] = [];
  const thrown: Punched[] = [];
  for (const [i, kind] of kindsOf(options.foes).entries()) {
    const canary = options.canary && first && i === 0;
    const pair = await punchKind(lab, kind, canary);
    if (typeof pair === 'string') {
      lines.push(`  ${pair}`);
      problems.push(pair);
      continue;
    }
    thrown.push(...[pair.head, pair.chest].filter((punched) => punched.outOfReach === undefined));
    const tag = pair.canary ? ' (canary)' : '';
    lines.push(`  ${pair.kind}${tag}: head ${said(pair.head)}, chest ${said(pair.chest)}`);
    if (options.trace) {
      lines.push(`    head: the fist's line met ${pair.head.met ?? '-'}; chest: ${pair.chest.met ?? '-'}`);
    }
    if (pair.canary) {
      const caught = pair.chest.crit;
      lines.push(`    canary, its whole body taken for its head: ${caught ? 'caught' : 'missed'}`);
      const unseen = `the canary went unseen: ${pair.kind}'s chest punch with its whole body as its head`;
      if (!caught) problems.push(unseen);
      continue;
    }
    for (const fault of faultsOf(pair, eyes)) problems.push(`${view}: ${pair.kind}: ${fault}`);
  }
  const struck = thrown.filter((punched) => punched.struck).length;
  lines.push(`  ${struck} of ${thrown.length} punches struck`);
  return { text: lines.join('\n'), problems };
}

/** The fixture a view's punches are thrown in: both hands empty, at the spot, in `view`. */
function fixtureOf(fixture: Fixture, view: ViewMode): Fixture {
  return { at: SPOT, ...fixture, gear: 'bare', view };
}

/** `lab headshots --class warrior`: each foe's head and chest punch, in each view. */
export async function punchHeads(lab: Lab, options: HeadshotsOptions): Promise<Report> {
  const views = options.views.length ? options.views : PUNCH_VIEWS;
  const lines = ['headshots: each foe punched at the middle of its head and at its chest, the hero\'s own crit 0'];
  const problems: string[] = [];
  for (const [v, view] of views.entries()) {
    const report = await punchesIn(lab, view, options, v === 0);
    lines.push(report.text);
    problems.push(...report.problems);
  }
  return { text: lines.join('\n'), problems };
}
