// The bow's headshots (tools/lab `headshots`, #750): every kind of foe, the bosses and the training dummy among them,
// stood alone before the ranger and held still, shot with each of his aimed shots drawn to full, once at the middle of
// its head and once at its chest. An arrow that strikes a foe's head is always a critical hit (`HitOpts.head`,
// combat/strikes.ts `onHead`); here the hero's own chance of one is put to nothing, so a critical hit is the game
// having judged a headshot. Each head shot must strike and crit, each chest shot strike and not. Where the head is,
// is read off the foe as drawn (the middle of the vertices its head joint moves), not off the game's test.
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { EnemyId } from '../../../src/data/enemies';
import type { ViewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { ENEMIES } from '../../../src/data/enemies';
import { groundHeight } from '../../../src/world/ground';
import { input } from '../../../src/core/input';
import { castSolid } from '../../../src/fx/stuckArrows';
import type { HullHit } from '../../../src/entities/models/hulls';
import { bindKnown, pressing, skillNamed, type BoundSkill } from './cast';
import { drawAt, letGo } from './shots';

export interface HeadshotsOptions {
  fixture: Fixture;
  /** the kinds of foe shot at (every kind by default) */
  foes: string[];
  /** the views shot in: a close view's head shots must be headshots, top-down's none (the owner's choice) */
  views: ViewMode[];
  /** the shots: their keys, behaviours or names (the ranger's aimed shots by default) */
  skills: string[];
  /** the first foe's head joint taken to be the joint its trunk hangs from: its chest shot must be found a headshot */
  canary: boolean;
  /** say how high each shot was aimed and struck, over the foe's feet against its height */
  trace?: boolean;
}

/** the views shot in by default: over the shoulder the head shots are headshots, top-down none */
const SHOT_VIEWS: ViewMode[] = ['third', 'top'];
/** the ranger's aimed shots, the ones that can headshot (Hailfletch's rain can't) */
const AIMED = ['nockShot', 'fanShot', 'piercingShot'];
/** where the hero stands (m), clear of the props, with room before him for a boss */
const SPOT: [number, number] = [12, 12];
/** how far before the hero a foe stands (m), and further for a tall one: its height times this */
const AHEAD = 7;
const AHEAD_PER_HEIGHT = 1.8;
/** the most frames a foe takes to rise, a shot to fly, and the hero to be free after it */
const RISE_FRAMES = 300;
const FLIGHT_FRAMES = 90;
const DONE_FRAMES = 240;
/** a foe's life: past every shot */
const LIVING = 1e6;
/** the chest shot's aim when the model has no chest joint (the dummy's sack), a share of its height */
const CHEST_SHARE = 0.6;
/** frames a foe is posed for after it's turned, before a shot's point is read off it */
const TURN_FRAMES = 3;
/** the most frames a drawn shot is held for the game's aim to come onto its foe, as a player holds his draw until
 *  the crosshair is on the head: loosed as the draw was full, the camera still easing after it, a small head's shot
 *  went by it (the husk's, the Rift Witch's), the game's aim on no foe and on the floor beyond */
const SETTLE_FRAMES = 30;

/** What a shot did: whether it struck the foe, and whether any of its hits was a critical one. */
interface Landed {
  struck: boolean;
  crit: boolean;
  /** where it was aimed as it was loosed and where its first hit struck, over the foe's feet (m; NaN: none) */
  aimed: number;
  hit: number;
  /** the joint the piece first met on a line to the point aimed at rides, by its name in the rig (null: nothing) */
  before: string | null;
  /** how far the game's own aim was from the point as it was loosed (m), and how far under it (m, up is less) */
  aimOff: number;
  aimUnder: number;
  /** what the game's aim met as the shot was loosed: the foe, another, or nothing */
  aimMet: string;
}

/** One foe's two shots with one skill. */
interface Pair {
  kind: string;
  skill: string;
  head: Landed;
  chest: Landed;
  canary: boolean;
  /** the foe's height (m) */
  height: number;
}

/** The joint a model's head and all on it ride (its rig's, or the dummy's own). */
function headJoint(foe: Enemy): THREE.Object3D | null {
  return foe.model.joints?.head ?? foe.model.head ?? null;
}

/** The joint the trunk hangs from, the canary's stand-in for the head. */
export function trunkJoint(foe: Enemy): THREE.Object3D | null {
  if (foe.type === 'stag') return foe.obj.getObjectByName('stag-trunk') ?? null;
  return foe.model.joints?.chest ?? foe.model.head?.parent ?? null;
}

/** Sets which joint the model's head is (the canary); returns the undo. */
export function plantHead(foe: Enemy, joint: THREE.Object3D): () => void {
  const model = foe.model;
  if (model.joints) {
    const was = model.joints.head;
    model.joints.head = joint as typeof was;
    return () => {
      model.joints!.head = was;
    };
  }
  const was = model.head;
  model.head = joint;
  return () => {
    model.head = was;
  };
}

/** Adds to `points` the world positions of `mesh`'s vertices whose most-weighted bone is `joint`. */
function skinnedOn(mesh: THREE.SkinnedMesh, joint: THREE.Object3D, points: THREE.Vector3[]): void {
  const bone = mesh.skeleton.bones.indexOf(joint as THREE.Bone);
  if (bone < 0) return;
  // (posed as now: the lab's frames draw nothing, so the bones' matrices are where the last draw left them)
  mesh.skeleton.update();
  const skin = mesh.geometry.attributes.skinIndex;
  const weight = mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < skin.count; i++) {
    let most = 0;
    for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > weight.getComponent(i, most)) most = k;
    if (skin.getComponent(i, most) !== bone) continue;
    points.push(mesh.localToWorld(mesh.getVertexPosition(i, new THREE.Vector3())));
  }
}

/** Adds to `points` the world positions of the vertices of the rigid meshes set straight on `joint`. */
function rigidOn(joint: THREE.Object3D, points: THREE.Vector3[]): void {
  for (const child of joint.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) continue;
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      points.push(mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position, i)));
    }
  }
}

/** the share of the head's vertices nearest its joint whose middle is its skull's: the rest reach out from it (the
 *  Hulk's branch antlers in leaf, whose middle with the skull's lay in the air between them) */
const SKULL_SHARE = 0.5;

/** The vertices of `foe`'s skull as drawn now: of those its head joint itself moves (not a cap or a jaw on a joint of
 *  its own), the half of them nearest the joint; none where it has no head joint. */
function skullOf(foe: Enemy): THREE.Vector3[] {
  const joint = headJoint(foe);
  if (!joint) return [];
  foe.obj.updateMatrixWorld(true);
  const points: THREE.Vector3[] = [];
  rigidOn(joint, points);
  foe.obj.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinnedOn(object as THREE.SkinnedMesh, joint, points);
  });
  const at = joint.getWorldPosition(new THREE.Vector3());
  points.sort((a, b) => a.distanceToSquared(at) - b.distanceToSquared(at));
  return points.slice(0, Math.round(points.length * SKULL_SHARE));
}

/** how many points inside the skull are tried for one both lines meet it at, and how far each is from its middle
 *  towards a vertex (a share of the way) */
const HEAD_TRIES = 24;
const INSIDE = 0.5;
/** how far round a head point (m, across the camera's view) the head must still be met: a point at its edge left
 *  the Rift Witch's small, bobbing head as her idle moved it, a shot in a run in three missing or meeting her hood */
const HEAD_MARGIN = 0.04;

/** Where a bow's head shot is seen from: the bow, and the camera the crosshair aims by. */
const bowAndEye = (): THREE.Vector3[] => [G.player.castPoint, G.camera.position];

/**
 * Where a head shot is aimed: inside `foe`'s skull, the point nearest its middle that the bow's line and the camera's
 * (the crosshair's, which the game aims by) both meet on its head before anything else of it. The middle alone: in
 * some frames of the Colossus's idle a piece of it stood before it, and the game rightly judged the shot a body's.
 * Null where it has no head; its middle where no point is met so (the shot is then likely to be judged a body's).
 * `froms` are where the lines start (a punch's: the camera's alone, as its fist's line is the crosshair's).
 */
export function headAim(foe: Enemy, froms: () => THREE.Vector3[] = bowAndEye): THREE.Vector3 | null {
  const skull = skullOf(foe);
  if (!skull.length) return null;
  const middle = skull.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(skull.length);
  const step = Math.max(1, Math.floor(skull.length / HEAD_TRIES));
  const tries = [middle];
  for (let i = 0; i < skull.length; i += step) tries.push(middle.clone().lerp(skull[i], INSIDE));
  tries.sort((a, b) => a.distanceToSquared(middle) - b.distanceToSquared(middle));
  const seen = (point: THREE.Vector3) => froms().every(
    (from) => metFrom(foe, from, point) === 'head',
  );
  const clear = (point: THREE.Vector3) => aroundOnScreen(point).every(seen);
  return tries.find(clear) ?? tries.find(seen) ?? middle;
}

/** `point` and four points `HEAD_MARGIN` round it, across the camera's view. */
function aroundOnScreen(point: THREE.Vector3): THREE.Vector3[] {
  const right = new THREE.Vector3().setFromMatrixColumn(G.camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(G.camera.matrixWorld, 1);
  const offsets = [right, right.clone().negate(), up, up.clone().negate()];
  return [point, ...offsets.map((offset) => point.clone().addScaledVector(offset, HEAD_MARGIN))];
}

/** Turns `foe` to face the hero (`side` 0) or a quarter round from him (1), posed so for a few frames. */
export async function turnFoe(lab: Lab, foe: Enemy, side: number): Promise<void> {
  foe.facing = G.player.facing + Math.PI + side * Math.PI / 2;
  foe.targetFacing = foe.facing;
  await lab.step(TURN_FRAMES);
}

/** Where its chest shot is aimed: its chest joint, or a share of its height over its middle. */
export function chestPoint(foe: Enemy): THREE.Vector3 {
  const chest = foe.type === 'stag' ? trunkJoint(foe) : foe.model.joints?.chest;
  if (chest) return chest.getWorldPosition(new THREE.Vector3());
  return foe.pos.clone().setY(foe.obj.position.y + foe.height * CHEST_SHARE);
}

/** A foe of `kind` risen before the hero, standing in its idle pose: it thinks as the training dummy does (it neither
 *  moves, turns nor attacks) and doesn't evade. (Dazed, it reeled, and its head moved off a shot's line as it flew.) */
async function standFoe(lab: Lab, kind: EnemyId): Promise<Enemy> {
  const hero = G.player;
  const forward = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const foe = lab.spawnFoe(kind, hero.pos.clone().addScaledVector(forward, AHEAD).setY(0));
  // (a tall one further off: its head within the bow's steepest arc)
  const ahead = Math.max(AHEAD, foe.height * AHEAD_PER_HEIGHT);
  const spot = hero.pos.clone().addScaledVector(forward, ahead);
  foe.pos.set(spot.x, foe.pos.y, spot.z);
  foe.obj.position.set(spot.x, foe.obj.position.y, spot.z);
  Object.assign(foe, { def: { ...foe.def, ai: 'idle', evade: undefined } });
  await lab.until(() => foe.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
  return foe;
}

/** Where a shot is aimed, read off the foe as it's posed now. */
type Target = (foe: Enemy) => THREE.Vector3;

/**
 * One shot of `skill` drawn to full at `target` and loosed, followed until its arrows are gone. The aim follows the
 * point each frame until it's loosed, as a player's would: a dazed foe sways, and a small foe's head moved off a point
 * read once as the bow was drawn. With `settle`, the drawn shot is held until the game's aim is on the foe.
 */
async function shootAt(
  lab: Lab, skill: BoundSkill, foe: Enemy, target: Target, landed: Landed, settle: boolean,
): Promise<Landed> {
  const hero = G.player;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  foe.life = LIVING;
  foe.knock.set(0, 0, 0);
  landed.struck = false;
  landed.crit = false;
  landed.hit = NaN;
  const flying = new Set(G.projectiles);
  const point = target(foe);
  const follow = () => {
    point.copy(target(foe));
  };
  lab.beforeFrame.push(follow);
  try {
    await drawAt(lab, point, skill.key);
    const held = (): Frame => ({ ...pressing(skill.key, point, true), sight: point });
    for (let f = 0; settle && f < SETTLE_FRAMES && input.foe !== foe; f++) await lab.step(1, held);
    landed.aimed = point.y - foe.obj.position.y;
    landed.before = metFrom(foe, G.player.castPoint, point);
    const aim = gameAim();
    landed.aimOff = aim.distanceTo(point);
    landed.aimUnder = point.y - aim.y;
    landed.aimMet = input.foe === foe ? 'it' : input.foe ? input.foe.type : 'no foe';
    await lab.step(1, () => letGo(point));
  } finally {
    lab.beforeFrame.splice(lab.beforeFrame.indexOf(follow), 1);
  }
  const arrows = () => G.projectiles.filter((shot) => !flying.has(shot) && !shot.hostile && shot.alive);
  await lab.until(() => arrows().length === 0, FLIGHT_FRAMES, 'the shot never ended', () => letGo(point));
  await lab.until(() => !hero.casting, DONE_FRAMES, 'the shot was never over', () => letGo(point));
  return { ...landed };
}

/** Catches each hit on `foe` into `landed`: struck, and whether critical. */
function catchHits(foe: Enemy, landed: Landed): void {
  const takeDamage = foe.takeDamage.bind(foe);
  foe.takeDamage = (amount, info) => {
    if (!landed.struck) landed.hit = struckAt(foe);
    landed.struck = true;
    if (info?.crit) landed.crit = true;
    return takeDamage(amount, info);
  };
}

/** How high over `foe`'s feet the hero's arrow striking it now is (m): the nearest of his in flight, put where it
 *  struck before its hit is dealt. */
function struckAt(foe: Enemy): number {
  let nearest: THREE.Vector3 | null = null;
  for (const shot of G.projectiles) {
    if (shot.hostile || !shot.alive) continue;
    if (!nearest || shot.pos.distanceTo(foe.pos) < nearest.distanceTo(foe.pos)) nearest = shot.pos;
  }
  return nearest ? nearest.y - foe.obj.position.y : NaN;
}

/** The game's own aim now, in the world (`Player.aim` is its height over the floor under it). */
function gameAim(): THREE.Vector3 {
  const aim = G.player.aim;
  return aim.clone().setY(aim.y + groundHeight(aim.x, aim.z));
}

/** how far back from the point aimed at the line to it is looked along for what's in front of it (m) */
const LOOK_BACK = 4;

/** The name of the rig's joint (or the dummy's head) that a piece rides: the nearest named one up from it. */
export function jointName(foe: Enemy, piece: THREE.Object3D): string {
  const joints = Object.entries(foe.model.joints ?? {}) as [string, THREE.Object3D][];
  const named = new Map<THREE.Object3D, string>(joints.map(([name, joint]) => [joint, name]));
  if (foe.model.head) named.set(foe.model.head, 'head');
  for (let at: THREE.Object3D | null = piece; at && at !== foe.obj; at = at.parent) {
    const name = named.get(at);
    if (name) return name;
  }
  return 'its root';
}

/** What of `foe` a straight line from `from` to `point` meets first, by the joint it rides. */
function metFrom(foe: Enemy, from: THREE.Vector3, point: THREE.Vector3): string | null {
  const way = point.clone().sub(from).normalize();
  const ray = new THREE.Raycaster(point.clone().addScaledVector(way, -LOOK_BACK), way, 0, LOOK_BACK * 2);
  const hit = castSolid(foe.obj, ray);
  if (!hit) return null;
  return jointName(foe, (hit as Partial<HullHit>).joint ?? hit.object);
}

/** How high a shot was aimed and struck, against `foe`'s height, and what lies first on the line to it. */
function heights(landed: Landed, height: number): string {
  const share = (metres: number) => (Number.isNaN(metres) ? '-' : (metres / height).toFixed(2));
  const before = landed.before ?? 'nothing';
  const off = `${landed.aimOff.toFixed(2)} m off it, ${landed.aimUnder.toFixed(2)} under`;
  const aim = `the game's aim on ${landed.aimMet}, ${off}`;
  return `aimed at ${share(landed.aimed)} of its height (first on its line: ${before}; ${aim}), `
    + `struck at ${share(landed.hit)}`;
}

/** A shot's outcome as a line says it. */
function said(landed: Landed): string {
  if (!landed.struck) return 'missed';
  return landed.crit ? 'headshot' : 'body';
}

/** What's wrong with a pair, if anything: a head shot not judged one, a chest shot judged one, or either missing. */
/** What's wrong with a pair, if anything. Over the shoulder: a head shot that missed or was no headshot, a chest shot
 *  that missed or was one. Top-down a shot that crit (none may be a headshot there); a miss there says nothing of
 *  headshots, and the view's shots are held to have struck at all (`struckAny`). */
function faultsOf(pair: Pair, close: boolean): string[] {
  const faults: string[] = [];
  if (!close) {
    if (pair.head.crit) faults.push('the head shot was a headshot top-down, where none may be');
    if (pair.chest.crit) faults.push('the chest shot was a headshot top-down, where none may be');
    return faults;
  }
  if (!pair.head.struck) faults.push('the head shot missed it');
  else if (!pair.head.crit) faults.push('the head shot struck it but was no headshot');
  if (!pair.chest.struck) faults.push('the chest shot missed it');
  else if (pair.chest.crit) faults.push('the chest shot was taken for a headshot');
  return faults;
}

/** the least share of a top-down view's head shots that must strike, so its "no headshot" is a measure */
const TOP_STRUCK = 0.75;

/** Every kind of foe a wave or the yard can bring, or those named. */
export function kindsOf(named: string[]): EnemyId[] {
  const all = Object.keys(ENEMIES) as EnemyId[];
  if (!named.length) return all;
  return all.filter((kind) => named.includes(kind));
}

/** One kind's pairs, a pair a skill; with `canary`, its head taken to be its trunk for every shot. */
async function shootKind(lab: Lab, kind: EnemyId, skills: BoundSkill[], canary: boolean): Promise<Pair[] | string> {
  const foe = await standFoe(lab, kind);
  const trunk = trunkJoint(foe);
  const undo = canary && trunk ? plantHead(foe, trunk) : null;
  const landed: Landed = {
    struck: false, crit: false, aimed: NaN, hit: NaN, before: null, aimOff: NaN, aimUnder: NaN, aimMet: '',
  };
  catchHits(foe, landed);
  const pairs: Pair[] = [];
  try {
    for (const skill of skills) {
      await turnFoe(lab, foe, 0);
      if (!headAim(foe)) return `the ${kind} has no head joint`;
      const onHead = await shootAt(lab, skill, foe, (posed) => headAim(posed)!, landed, true);
      // (side on: a head jutting forward from under a hump, the Mossback's, is before its chest from the front)
      await turnFoe(lab, foe, 1);
      // (loosed as drawn: held, a thin chest side on swayed off the line, the game's aim never on it)
      const onChest = await shootAt(lab, skill, foe, chestPoint, landed, false);
      pairs.push({ kind, skill: skill.def.name, head: onHead, chest: onChest, canary, height: foe.height });
    }
  } finally {
    undo?.();
    // (gone before the next kind stands where it stood)
    foe.dispose();
    G.enemies.splice(G.enemies.indexOf(foe), 1);
  }
  return pairs;
}

/** One view's shots: every foe's pairs, as lines and problems. Top-down the first skill alone: none headshots. */
async function shotsIn(lab: Lab, view: ViewMode, options: HeadshotsOptions, first: boolean): Promise<Report> {
  await lab.setup({ at: SPOT, ...options.fixture, view });
  const named = options.skills.length ? options.skills : AIMED;
  for (const name of named) bindKnown(name);
  G.player.stats.crit = 0;
  const close = view !== 'top';
  const skills = named.map(skillNamed).slice(0, close ? undefined : 1);
  const lines = [`${view}:`];
  const problems: string[] = [];
  const heads: Landed[] = [];
  for (const [i, kind] of kindsOf(options.foes).entries()) {
    const canary = options.canary && first && i === 0;
    const result = await shootKind(lab, kind, skills, canary);
    if (typeof result === 'string') {
      lines.push(`  ${result}`);
      problems.push(result);
      continue;
    }
    for (const pair of result) {
      heads.push(pair.head);
      const tag = pair.canary ? ' (canary)' : '';
      lines.push(`  ${pair.kind}, ${pair.skill}${tag}: head ${said(pair.head)}, chest ${said(pair.chest)}`);
      if (options.trace) {
        lines.push(`    head: ${heights(pair.head, pair.height)}; chest: ${heights(pair.chest, pair.height)}`);
      }
      if (pair.canary) {
        const caught = pair.chest.crit;
        lines.push(`    canary, the head taken to be the trunk: ${caught ? 'caught' : 'missed'}`);
        if (!caught) problems.push(`the canary went unseen: ${pair.kind}'s chest shot with its trunk as its head`);
        continue;
      }
      for (const fault of faultsOf(pair, close)) problems.push(`${view}: ${pair.kind}, ${pair.skill}: ${fault}`);
    }
  }
  const struck = heads.filter((landed) => landed.struck).length;
  lines.push(`  ${struck} of ${heads.length} head shots struck`);
  if (!close && struck < heads.length * TOP_STRUCK) {
    problems.push(`${view}: ${struck} of ${heads.length} head shots struck: too few to say none headshots`);
  }
  return { text: lines.join('\n'), problems };
}

/** `lab headshots`: each foe's head and chest shot with each of the ranger's aimed shots, in each view. */
export async function headshots(lab: Lab, options: HeadshotsOptions): Promise<Report> {
  await lab.setup({ at: SPOT, ...options.fixture });
  const hero = G.player;
  if (hero.cls.id === 'warrior') {
    const { punchHeads } = await import('./punchHeads');
    return punchHeads(lab, options);
  }
  if (hero.cls.id !== 'ranger') {
    const why = `headshots are the ranger's and the warrior's: run with --class ranger or warrior (the hero is the `
      + `${hero.cls.id})`;
    return { text: why, problems: [why] };
  }
  const lines = ['headshots: each foe shot at the middle of its head and at its chest, the hero\'s own crit chance 0'];
  const problems: string[] = [];
  const views = options.views.length ? options.views : SHOT_VIEWS;
  for (const [v, view] of views.entries()) {
    const crit = hero.stats.crit;
    try {
      const report = await shotsIn(lab, view, { ...options }, v === 0);
      lines.push(report.text);
      problems.push(...report.problems);
    } finally {
      hero.stats.crit = crit;
    }
  }
  return { text: lines.join('\n'), problems };
}
